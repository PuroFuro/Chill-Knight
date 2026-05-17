import { useEffect, useRef } from "react";
import type { GameClient } from "../net/socket";
import type { Snapshot } from "../types";

const ARENA = { w: 1600, h: 1000 };

export default function GameCanvas({
  client,
  snapshotRef,
  playerId,
  inputEnabled,
}: {
  client: GameClient;
  snapshotRef: React.MutableRefObject<Snapshot | null>;
  playerId: number;
  inputEnabled: React.MutableRefObject<boolean>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouse = useRef({ x: 0, y: 0, down: false });

  // ---- input ----------------------------------------------------------
  useEffect(() => {
    const keys: Record<string, boolean> = {};
    const apply = () => {
      if (!inputEnabled.current) {
        client.setInput({
          up: false, down: false, left: false, right: false,
          attack: false, parry: false,
        });
        return;
      }
      client.setInput({
        up: keys["w"] || keys["arrowup"],
        down: keys["s"] || keys["arrowdown"],
        left: keys["a"] || keys["arrowleft"],
        right: keys["d"] || keys["arrowright"],
        attack: keys["j"] || mouse.current.down,
        parry: keys[" "] || keys["k"],
      });
    };

    const down = (e: KeyboardEvent) => {
      if (!inputEnabled.current) return;
      const k = e.key.toLowerCase();
      if (k === "h") client.usePotion();
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k))
        e.preventDefault();
      keys[k] = true;
      apply();
    };
    const up = (e: KeyboardEvent) => {
      keys[e.key.toLowerCase()] = false;
      apply();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);

    const canvas = canvasRef.current!;
    const mm = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.current.x = e.clientX - r.left;
      mouse.current.y = e.clientY - r.top;
    };
    const md = () => {
      mouse.current.down = true;
      apply();
    };
    const mu = () => {
      mouse.current.down = false;
      apply();
    };
    canvas.addEventListener("mousemove", mm);
    canvas.addEventListener("mousedown", md);
    window.addEventListener("mouseup", mu);

    // Aim points from the screen centre (where the local knight is drawn)
    // toward the cursor.
    const aimTimer = window.setInterval(() => {
      const ax = mouse.current.x - canvas.width / 2;
      const ay = mouse.current.y - canvas.height / 2;
      if (ax || ay) client.setInput({ aimX: ax, aimY: ay });
    }, 50);

    return () => {
      window.clearInterval(aimTimer);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      canvas.removeEventListener("mousemove", mm);
      canvas.removeEventListener("mousedown", md);
      window.removeEventListener("mouseup", mu);
    };
  }, [client, inputEnabled]);

  // ---- render loop ----------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;

    const resize = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const snap = snapshotRef.current;
      const W = canvas.width;
      const H = canvas.height;
      ctx.fillStyle = "#0b0d13";
      ctx.fillRect(0, 0, W, H);

      const me = snap?.players.find((p) => p.id === playerId);
      const camX = me ? me.x : ARENA.w / 2;
      const camY = me ? me.y : ARENA.h / 2;
      const sx = (wx: number) => wx - camX + W / 2;
      const sy = (wy: number) => wy - camY + H / 2;

      // arena bounds + grid
      ctx.strokeStyle = "#1d2230";
      ctx.lineWidth = 1;
      for (let gx = 0; gx <= ARENA.w; gx += 80) {
        ctx.beginPath();
        ctx.moveTo(sx(gx), sy(0));
        ctx.lineTo(sx(gx), sy(ARENA.h));
        ctx.stroke();
      }
      for (let gy = 0; gy <= ARENA.h; gy += 80) {
        ctx.beginPath();
        ctx.moveTo(sx(0), sy(gy));
        ctx.lineTo(sx(ARENA.w), sy(gy));
        ctx.stroke();
      }
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 3;
      ctx.strokeRect(sx(0), sy(0), ARENA.w, ARENA.h);

      if (!snap) {
        ctx.fillStyle = "#64748b";
        ctx.font = "16px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Loading world…", W / 2, H / 2);
        raf = requestAnimationFrame(draw);
        return;
      }

      // projectiles
      for (const pr of snap.projectiles) {
        ctx.fillStyle = "#fca5a5";
        ctx.beginPath();
        ctx.arc(sx(pr.x), sy(pr.y), 7, 0, Math.PI * 2);
        ctx.fill();
      }

      // enemies
      for (const e of snap.enemies) {
        const ex = sx(e.x);
        const ey = sy(e.y);
        const r = e.kind === "boss" ? 44 : 15;
        ctx.fillStyle =
          e.kind === "boss" ? "#a855f7" : e.kind === "ranged" ? "#f59e0b" : "#ef4444";
        if (e.wind) {
          ctx.shadowColor = "#fde047";
          ctx.shadowBlur = 22;
        }
        ctx.beginPath();
        ctx.arc(ex, ey, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        // facing tick
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex + Math.cos(e.facing) * r, ey + Math.sin(e.facing) * r);
        ctx.stroke();
        // hp bar
        bar(ctx, ex - r, ey - r - 9, r * 2, 4, e.hp / e.maxHp, "#ef4444");
        if (e.kind === "boss") {
          ctx.fillStyle = "#e9d5ff";
          ctx.font = "bold 12px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("BOSS", ex, ey - r - 14);
        }
      }

      // players
      for (const p of snap.players) {
        const px = sx(p.x);
        const py = sy(p.y);
        const isMe = p.id === playerId;
        if (p.dead) {
          ctx.fillStyle = "#475569";
          ctx.font = "20px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("💀", px, py + 6);
        } else {
          // counter-ready glow
          if (p.counter) {
            ctx.shadowColor = "#6ee7b7";
            ctx.shadowBlur = 18;
          }
          ctx.fillStyle = isMe ? "#38bdf8" : "#94a3b8";
          ctx.beginPath();
          ctx.arc(px, py, 16, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          // sword direction
          ctx.strokeStyle = "#e2e8f0";
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + Math.cos(p.facing) * 24, py + Math.sin(p.facing) * 24);
          ctx.stroke();
          // slash arc
          if (p.atk) {
            ctx.strokeStyle = "rgba(226,232,240,0.85)";
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.arc(px, py, 40, p.facing - 0.9, p.facing + 0.9);
            ctx.stroke();
          }
          // parry shield
          if (p.parry) {
            ctx.strokeStyle = "#6ee7b7";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(px, py, 26, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        // name + level + hp
        ctx.fillStyle = isMe ? "#7dd3fc" : "#cbd5e1";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${p.name} · L${p.lvl}`, px, py - 26);
        bar(ctx, px - 22, py - 22, 44, 5, p.hp / p.maxHp, "#22c55e");
        // chat bubble
        if (p.chat) {
          const w = Math.min(220, ctx.measureText(p.chat).width + 18);
          ctx.fillStyle = "rgba(15,17,23,0.92)";
          ctx.strokeStyle = "#38bdf8";
          ctx.lineWidth = 1;
          roundRect(ctx, px - w / 2, py - 58, w, 22, 6);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = "#e5e7eb";
          ctx.font = "12px sans-serif";
          ctx.fillText(p.chat, px, py - 43);
        }
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [playerId, snapshotRef]);

  return <canvas ref={canvasRef} className="h-full w-full" />;
}

function bar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  pct: number,
  color: string
) {
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, pct)), h);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
