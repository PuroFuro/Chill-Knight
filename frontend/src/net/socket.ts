import { WS_URL } from "../api";
import type { ServerMsg } from "../types";

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
// its own movement and face the aim stick instantly — the same role the
// keyboard/mouse refs play on desktop. Movement is the same 4 booleans the
// server reads; `aiming` is true while the right stick is held so facing tracks
// it live (when released we keep the last aim, like a resting mouse cursor).
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

export class GameClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private inputTimer: number | null = null;
  private input: InputState = {
    up: false, down: false, left: false, right: false,
    attack: false, parry: false, aimX: 1, aimY: 0,
  };

  connect(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("WebSocket connection failed"));
      ws.onclose = () => this.emit({ type: "world_closed", reason: "disconnected" });
      ws.onmessage = (ev) => {
        try {
          this.emit(JSON.parse(ev.data) as ServerMsg);
        } catch {
          /* ignore malformed frame */
        }
      };
    });
  }

  on(h: Handler): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  private emit(msg: ServerMsg) {
    this.handlers.forEach((h) => h(msg));
  }

  private send(obj: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  joinWorld(mode: "overworld" | "raid", difficulty: number, code?: string) {
    this.send({ type: "join", mode, difficulty, code });
    this.startInputPump();
  }

  leave() {
    this.stopInputPump();
    this.send({ type: "leave" });
  }

  chat(text: string) {
    this.send({ type: "chat", text });
  }

  usePotion() {
    this.send({ type: "use_potion" });
  }

  startRaid(difficulty: number) {
    this.send({ type: "start_raid", difficulty });
  }

  setInput(patch: Partial<InputState>) {
    this.input = { ...this.input, ...patch };
  }

  private startInputPump() {
    if (this.inputTimer != null) return;
    // 25 Hz intent stream — the server simulates authoritatively.
    this.inputTimer = window.setInterval(() => {
      this.send({ type: "input", ...this.input });
    }, 40);
  }

  private stopInputPump() {
    if (this.inputTimer != null) {
      window.clearInterval(this.inputTimer);
      this.inputTimer = null;
    }
  }

  close() {
    this.stopInputPump();
    this.ws?.close();
    this.ws = null;
    this.handlers.clear();
  }
}
