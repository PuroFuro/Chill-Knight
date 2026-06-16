// Central sound effects manager. All clips are bundled as URLs by Vite and
// played on demand. Short, frequently-overlapping clips (slashes, hits) spawn a
// fresh Audio element each time so they can stack; looping clips (the
// shopkeeper "speaking" hum) use a single dedicated element.

import buyPotionUrl from "./assets/sounds/buy_potion.wav";
import buyWeaponUrl from "./assets/sounds/buy_weapon.wav";
import equipUrl from "./assets/sounds/Equip.wav";
import exitUrl from "./assets/sounds/Exit.wav";
import hitUrl from "./assets/sounds/Hit.wav";
import hoverUrl from "./assets/sounds/Hover.wav";
import levelUpUrl from "./assets/sounds/levelUp.wav";
import messagePopUrl from "./assets/sounds/message_pop.mp3";
import messageSentUrl from "./assets/sounds/message_sent.wav";
import parryUrl from "./assets/sounds/Parry.wav";
import parryAttackUrl from "./assets/sounds/Parry_attack.wav";
import slash1Url from "./assets/sounds/slash1.wav";
import slash2Url from "./assets/sounds/slash2.wav";
import slash3Url from "./assets/sounds/slash3.wav";
import speakingUrl from "./assets/sounds/speaking.mp3";

export type SoundName =
  | "buyPotion"
  | "buyWeapon"
  | "equip"
  | "exit"
  | "hit"
  | "hover"
  | "levelUp"
  | "messagePop"
  | "messageSent"
  | "parry"
  | "parryAttack"
  | "slash1"
  | "slash2"
  | "slash3";

const URLS: Record<SoundName, string> = {
  buyPotion: buyPotionUrl,
  buyWeapon: buyWeaponUrl,
  equip: equipUrl,
  exit: exitUrl,
  hit: hitUrl,
  hover: hoverUrl,
  levelUp: levelUpUrl,
  messagePop: messagePopUrl,
  messageSent: messageSentUrl,
  parry: parryUrl,
  parryAttack: parryAttackUrl,
  slash1: slash1Url,
  slash2: slash2Url,
  slash3: slash3Url,
};

// Per-clip tuning: master-relative volume and an optional start offset (the
// first slash clip has ~0.5s of dead air at the front).
const TUNING: Partial<Record<SoundName, { volume?: number; startAt?: number }>> = {
  slash1: { startAt: 0.5 },
  hover: { volume: 0.35 },
  hit: { volume: 0.7 },
  messagePop: { volume: 0.6 },
  messageSent: { volume: 0.6 },
};

let masterVolume = 0.8;
let muted = false;

export function setMuted(v: boolean) {
  muted = v;
}

export function play(name: SoundName) {
  if (muted) return;
  const url = URLS[name];
  if (!url) return;
  const t = TUNING[name] ?? {};
  try {
    const a = new Audio(url);
    a.volume = Math.min(1, (t.volume ?? 1) * masterVolume);
    if (t.startAt) a.currentTime = t.startAt;
    // Browsers reject autoplay before a user gesture; ignore that rejection.
    void a.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

// Map a combo swing index (0,1,2) to its slash clip.
export function playSlash(index: number) {
  play((["slash1", "slash2", "slash3"] as const)[Math.max(0, Math.min(2, index))]);
}

// Convenience for attaching a hover blip to interactive elements.
export const hoverProps = { onMouseEnter: () => play("hover") };

// ---- looping "speaking" hum (shopkeeper dialogue typing) -----------------
let speakingEl: HTMLAudioElement | null = null;

export function startSpeaking() {
  if (muted) return;
  if (!speakingEl) {
    speakingEl = new Audio(speakingUrl);
    speakingEl.loop = true;
    speakingEl.volume = 0.5 * masterVolume;
  }
  try {
    speakingEl.currentTime = 0;
    void speakingEl.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

export function stopSpeaking() {
  if (speakingEl) {
    speakingEl.pause();
    speakingEl.currentTime = 0;
  }
}
