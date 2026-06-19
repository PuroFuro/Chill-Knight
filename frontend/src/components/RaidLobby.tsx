import { useState } from "react";
import * as sfx from "../sound";

const MIN = 1;
const MAX = 50;

/**
 * Raid-lobby control panel (shown while a raid is created/joined but not yet
 * started). Players gather and warm up on the target dummies here; this panel
 * shows the invite code and lets the host pick a difficulty and start the
 * fight. The lobby room doubles as the raid arena.
 */
export default function RaidLobby({
  code,
  difficulty,
  onStart,
}: {
  code: string | null;
  difficulty: number;
  onStart: (difficulty: number) => void;
}) {
  const [value, setValue] = useState(String(difficulty));

  const clamp = (n: number) => Math.max(MIN, Math.min(MAX, n));
  const num = clamp(Number(value) || MIN);
  const step = (delta: number) => setValue(String(clamp(num + delta)));

  return (
    <div className="ck-panel pointer-events-auto absolute left-1/2 top-28 w-[320px] max-w-[92vw] -translate-x-1/2 p-4 text-center">
      <h2 className="font-display text-lg font-bold">Raid Lobby</h2>
      {code && (
        <p className="mt-0.5 text-xs text-muted">
          Invite code: <span className="font-bold text-ink">{code}</span>
        </p>
      )}
      <p className="mt-1 text-xs text-muted">
        Warm up on the dummies, then start when ready.
      </p>

      <div className="mt-3 flex items-center justify-center gap-2">
        <label className="text-sm">Difficulty</label>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ""))}
          className="h-10 w-16 rounded-md border border-ink bg-panel text-center text-lg outline-none focus:border-black"
        />
        <div className="flex flex-col">
          <button
            className="rounded-t border border-ink px-2 leading-tight hover:bg-black/5"
            onClick={() => step(1)}
            aria-label="Increase difficulty"
          >
            ▲
          </button>
          <button
            className="rounded-b border border-ink border-t-0 px-2 leading-tight hover:bg-black/5"
            onClick={() => step(-1)}
            aria-label="Decrease difficulty"
          >
            ▼
          </button>
        </div>
      </div>

      <button
        className="ck-btn-primary mt-3 w-full py-2"
        onClick={() => {
          sfx.play("equip");
          onStart(num);
        }}
        onMouseEnter={() => sfx.play("hover")}
      >
        Start Raid
      </button>
    </div>
  );
}
