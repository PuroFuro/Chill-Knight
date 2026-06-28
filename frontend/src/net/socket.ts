// Local, single-player game driver. This used to be a thin WebSocket client to
// an authoritative server; now it OWNS the simulation (src/game/sim/world.ts)
// and runs it in the browser, emitting exactly the same messages the renderer
// and UI already consume. No backend, no network.

import type { ServerMsg } from "../types";
import * as C from "../game/sim/constants";
import { getProfile, saveProfile } from "../game/sim/profile";
import { World } from "../game/sim/world";

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  attack: boolean;
  parry: boolean;
  aimX: number;
  aimY: number;
}

// Touch-control state shared with the canvas so the local knight can predict
// its own movement and face the aim stick instantly.
export interface TouchInputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  aimX: number;
  aimY: number;
  aiming: boolean;
}

type Handler = (msg: ServerMsg) => void;

function genCode(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

// How long between localStorage flushes of progression (matches the old
// server's periodic profile flush — frequent enough to be safe, rare enough to
// not thrash storage every frame).
const FLUSH_INTERVAL = 4.0;

export class GameClient {
  private handlers = new Set<Handler>();
  private world: World | null = null;
  private raf = 0;
  private lastFrame = 0;
  private flushAccum = 0;
  private lastStatsSig = "";
  private readonly pid: number;
  private input: InputState = {
    up: false, down: false, left: false, right: false,
    attack: false, parry: false, aimX: 1, aimY: 0,
  };

  constructor() {
    this.pid = getProfile().id;
  }

  // Kept for API compatibility with the old networked client; resolves at once.
  connect(): Promise<void> {
    return Promise.resolve();
  }

  on(h: Handler): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  private emit(msg: ServerMsg): void {
    this.handlers.forEach((h) => h(msg));
  }

  joinWorld(mode: "overworld" | "raid", difficulty: number, code?: string): void {
    difficulty = Math.max(C.MIN_DIFFICULTY, Math.min(C.MAX_DIFFICULTY, Math.trunc(difficulty)));
    const profile = getProfile();
    let world: World;
    if (mode === "raid") {
      const raidCode = (code || genCode()).toUpperCase();
      world = new World(`raid:${raidCode}`, "raid", difficulty, raidCode);
    } else {
      world = new World(`ow:${difficulty}`, "overworld", difficulty);
    }
    world.addPlayer(profile);
    this.world = world;
    this.lastStatsSig = "";
    this.emit({
      type: "joined",
      playerId: this.pid,
      mode: world.mode as "overworld" | "raid",
      difficulty: world.difficulty,
      code: world.code,
      arena: { w: C.ARENA_W, h: C.ARENA_H },
    });
    this.startLoop();
  }

  leave(): void {
    this.world = null;
  }

  chat(text: string): void {
    const w = this.world;
    if (!w) return;
    const broadcast = w.handleChat(this.pid, text);
    if (broadcast) this.emit(broadcast as unknown as ServerMsg);
  }

  usePotion(): void {
    this.world?.usePotion(this.pid);
  }

  startRaid(difficulty: number): void {
    const w = this.world;
    if (!w || w.mode !== "raid" || w.started) return;
    w.startRaid(difficulty);
    this.emit({
      type: "joined",
      playerId: this.pid,
      mode: w.mode as "overworld" | "raid",
      difficulty: w.difficulty,
      code: w.code,
      arena: { w: C.ARENA_W, h: C.ARENA_H },
    });
  }

  setInput(patch: Partial<InputState>): void {
    this.input = { ...this.input, ...patch };
  }

  private startLoop(): void {
    if (this.raf) return;
    this.lastFrame = performance.now();
    const frame = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
      this.lastFrame = now;
      this.step(dt);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  private stopLoop(): void {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  private step(dt: number): void {
    const w = this.world;
    if (!w) return;

    w.handleInput(this.pid, this.input as unknown as Record<string, unknown>);
    w.tick(dt);

    // snapshot
    this.emit(w.snapshot() as unknown as ServerMsg);

    // drain this player's one-shot events (sounds, toasts, rewards, ...)
    const rt = w.players.get(this.pid);
    if (rt) {
      if (rt.events.length) {
        const evs = rt.events;
        rt.events = [];
        for (const ev of evs) this.emit(ev as unknown as ServerMsg);
      }
      const stats = w.statsFor(this.pid);
      if (stats) {
        const sig = JSON.stringify(stats);
        if (sig !== this.lastStatsSig) {
          this.lastStatsSig = sig;
          this.emit(stats as unknown as ServerMsg);
        }
      }
    }

    // periodic progression flush
    this.flushAccum += dt;
    if (this.flushAccum >= FLUSH_INTERVAL) {
      this.flushAccum = 0;
      if (getProfile().dirty) saveProfile();
    }

    if (w.ended) {
      saveProfile();
      // The handler may synchronously re-join another world (raid -> overworld);
      // only drop our reference if it wasn't replaced underneath us.
      this.emit({ type: "world_closed", reason: "raid_over" });
      if (this.world === w) this.world = null;
    }
  }

  close(): void {
    this.stopLoop();
    if (getProfile().dirty) saveProfile();
    this.world = null;
    this.handlers.clear();
  }
}
