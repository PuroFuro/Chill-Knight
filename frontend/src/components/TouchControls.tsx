import { useRef, useState } from "react";
import type { GameClient, TouchInputState } from "../net/socket";

// Max thumb travel from where the stick was first pressed, and the deadzones
// below which a stick reads as centred (no movement / not aiming).
const STICK_R = 54;
const MOVE_DZ = 0.32;
const AIM_DZ = 0.24;

interface Vec {
  x: number;
  y: number;
}

/**
 * A floating thumb-stick: its origin snaps to wherever the zone is first
 * pressed, the thumb tracks the finger (clamped to STICK_R), and `onChange`
 * reports the stick vector (each axis in -1..1) plus its magnitude. Releasing
 * fires `onEnd`. Each instance owns one pointer at a time, so the two sticks
 * (and the action buttons) work as independent simultaneous touches.
 */
function Joystick({
  side,
  color,
  enabledRef,
  onChange,
  onEnd,
}: {
  side: "left" | "right";
  color: string;
  enabledRef: React.MutableRefObject<boolean>;
  onChange: (vx: number, vy: number, mag: number) => void;
  onEnd: () => void;
}) {
  const [base, setBase] = useState<Vec | null>(null);
  const [thumb, setThumb] = useState<Vec>({ x: 0, y: 0 });
  const pid = useRef<number | null>(null);

  const down = (e: React.PointerEvent) => {
    if (!enabledRef.current || pid.current !== null) return;
    pid.current = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setBase({ x: e.clientX, y: e.clientY });
    setThumb({ x: 0, y: 0 });
  };

  const move = (e: React.PointerEvent) => {
    if (e.pointerId !== pid.current || !base) return;
    let dx = e.clientX - base.x;
    let dy = e.clientY - base.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > STICK_R) {
      dx = (dx / d) * STICK_R;
      dy = (dy / d) * STICK_R;
    }
    setThumb({ x: dx, y: dy });
    onChange(dx / STICK_R, dy / STICK_R, Math.min(1, d / STICK_R));
  };

  const end = (e: React.PointerEvent) => {
    if (e.pointerId !== pid.current) return;
    pid.current = null;
    setBase(null);
    setThumb({ x: 0, y: 0 });
    onEnd();
  };

  return (
    <div
      className={`pointer-events-auto absolute bottom-0 h-[72%] w-1/2 touch-none select-none ${
        side === "left" ? "left-0" : "right-0"
      }`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {base ? (
        <>
          {/* live stick: ring at the press point, thumb following the finger */}
          <div
            className="pointer-events-none fixed -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
            style={{
              left: base.x,
              top: base.y,
              width: STICK_R * 2,
              height: STICK_R * 2,
              borderColor: color,
              background: "rgba(255,255,255,0.18)",
            }}
          />
          <div
            className="pointer-events-none fixed -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: base.x + thumb.x,
              top: base.y + thumb.y,
              width: STICK_R,
              height: STICK_R,
              background: color,
              opacity: 0.5,
            }}
          />
        </>
      ) : (
        // idle affordance: a faint ring in the corner hinting where the stick is
        <div
          className={`pointer-events-none absolute bottom-16 h-24 w-24 rounded-full border-2 opacity-20 ${
            side === "left" ? "left-10" : "right-10"
          }`}
          style={{ borderColor: color }}
        />
      )}
    </div>
  );
}

/**
 * On-screen controls for touch devices: a left thumb-stick for movement and a
 * right thumb-stick that aims and auto-attacks while held (twin-stick), plus
 * hold-to-parry and tap-to-drink-potion buttons. Writes movement/aim to the
 * shared `touchRef` (so the canvas predicts the local knight + faces the stick
 * instantly) and forwards the full intent to the server via the client.
 */
export default function TouchControls({
  client,
  touchRef,
  enabledRef,
}: {
  client: GameClient;
  touchRef: React.MutableRefObject<TouchInputState>;
  enabledRef: React.MutableRefObject<boolean>;
}) {
  const onMove = (vx: number, vy: number, mag: number) => {
    const t = touchRef.current;
    const on = mag >= MOVE_DZ;
    t.left = on && vx < -MOVE_DZ;
    t.right = on && vx > MOVE_DZ;
    t.up = on && vy < -MOVE_DZ;
    t.down = on && vy > MOVE_DZ;
    client.setInput({ up: t.up, down: t.down, left: t.left, right: t.right });
  };

  const onMoveEnd = () => {
    const t = touchRef.current;
    t.up = t.down = t.left = t.right = false;
    client.setInput({ up: false, down: false, left: false, right: false });
  };

  const onAim = (vx: number, vy: number, mag: number) => {
    const t = touchRef.current;
    if (mag < AIM_DZ) {
      if (t.aiming) {
        t.aiming = false;
        client.setInput({ attack: false });
      }
      return;
    }
    // Send the raw vector; the server normalises it into a facing direction.
    t.aimX = vx;
    t.aimY = vy;
    t.aiming = true;
    client.setInput({ aimX: vx, aimY: vy, attack: true });
  };

  const onAimEnd = () => {
    // Keep the last aim (so facing holds, like a resting cursor) and stop swinging.
    touchRef.current.aiming = false;
    client.setInput({ attack: false });
  };

  const parry = (on: boolean) => {
    if (on && !enabledRef.current) return;
    client.setInput({ parry: on });
  };

  const potion = () => {
    if (!enabledRef.current) return;
    client.usePotion();
  };

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      <Joystick
        side="left"
        color="#111111"
        enabledRef={enabledRef}
        onChange={onMove}
        onEnd={onMoveEnd}
      />
      <Joystick
        side="right"
        color="#7c3aed"
        enabledRef={enabledRef}
        onChange={onAim}
        onEnd={onAimEnd}
      />

      {/* action buttons, reachable by the right thumb above the aim stick */}
      <div className="pointer-events-none absolute bottom-40 right-5 flex flex-col items-center gap-3">
        <button
          className="pointer-events-auto flex h-16 w-16 touch-none select-none items-center justify-center rounded-full border-2 border-ink bg-panel/80 text-2xl shadow active:bg-black/10"
          onPointerDown={(e) => {
            e.preventDefault();
            // Capture so the release always lands here even if the thumb slides
            // off the button — otherwise the guard could stick raised.
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            parry(true);
          }}
          onPointerUp={(e) => {
            e.preventDefault();
            parry(false);
          }}
          onPointerCancel={() => parry(false)}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="Parry"
        >
          🛡️
        </button>
        <button
          className="pointer-events-auto flex h-14 w-14 touch-none select-none items-center justify-center rounded-full border-2 border-ink bg-panel/80 text-xl shadow active:bg-black/10"
          onPointerDown={(e) => {
            e.preventDefault();
            potion();
          }}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="Use potion"
        >
          🧪
        </button>
      </div>
    </div>
  );
}
