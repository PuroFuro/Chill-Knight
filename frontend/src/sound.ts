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
import skullDeathUrl from "./assets/sounds/Skull_Death.wav";
import raidWinUrl from "./assets/sounds/Raid_Win.mp3";
import bigSlimeFallUrl from "./assets/sounds/Big_Slime_Fall.mp3";
import slimeFallUrl from "./assets/sounds/Slime_Fall.mp3";
import slimeFallingAirUrl from "./assets/sounds/Slime_Falling_Air.mp3";
import blinkingLightsUrl from "./assets/sounds/Blinking_Lights.wav";
import overworldMusicUrl from "./assets/sounds/Music/overworld.mp3";

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
  | "slash3"
  | "skullDeath"
  | "raidWin"
  | "bigSlimeFall"
  | "slimeFall"
  | "slimeFallingAir"
  | "blinkingLights";

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
  skullDeath: skullDeathUrl,
  raidWin: raidWinUrl,
  bigSlimeFall: bigSlimeFallUrl,
  slimeFall: slimeFallUrl,
  slimeFallingAir: slimeFallingAirUrl,
  blinkingLights: blinkingLightsUrl,
};

// Per-clip tuning: master-relative volume and an optional start offset (the
// first slash clip has ~0.5s of dead air at the front).
const TUNING: Partial<Record<SoundName, { volume?: number; startAt?: number }>> = {
  slash1: { startAt: 0.5 },
  hover: { volume: 0.35 },
  hit: { volume: 0.7 },
  messagePop: { volume: 0.6 },
  messageSent: { volume: 0.6 },
  // Parry clips were too loud relative to everything else — pull them down.
  parry: { volume: 0.45 },
  parryAttack: { volume: 0.5 },
  // The raid-win jingle is mastered quiet — play it at full relative volume.
  raidWin: { volume: 1.0 },
  bigSlimeFall: { volume: 0.9 },
  slimeFall: { volume: 0.8 },
  slimeFallingAir: { volume: 0.7 },
  blinkingLights: { volume: 0.6 },
  skullDeath: { volume: 0.7 },
};

// Speaking (shopkeeper hum) plays at this fraction of master — bumped up so the
// dialogue voice reads clearly over the rest of the mix.
const SPEAKING_VOLUME = 0.85;

// Persisted audio settings (master volume + mute) so the player's choice sticks
// between sessions.
const LS_VOLUME = "ck_volume";
const LS_MUTED = "ck_muted";

function loadNumber(key: string, fallback: number): number {
  try {
    const v = parseFloat(localStorage.getItem(key) ?? "");
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
  } catch {
    return fallback;
  }
}

let masterVolume = loadNumber(LS_VOLUME, 0.8);
let muted = (() => {
  try {
    return localStorage.getItem(LS_MUTED) === "1";
  } catch {
    return false;
  }
})();

export function getMasterVolume() {
  return masterVolume;
}

export function setMasterVolume(v: number) {
  masterVolume = Math.min(1, Math.max(0, v));
  try {
    localStorage.setItem(LS_VOLUME, String(masterVolume));
  } catch {
    /* ignore */
  }
  // Apply live to the looping speaking element if it's playing.
  if (speakingEl) speakingEl.volume = SPEAKING_VOLUME * masterVolume;
}

export function isMuted() {
  return muted;
}

export function setMuted(v: boolean) {
  muted = v;
  try {
    localStorage.setItem(LS_MUTED, v ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (muted) stopSpeaking();
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
    speakingEl.volume = SPEAKING_VOLUME * masterVolume;
  }
  try {
    speakingEl.volume = SPEAKING_VOLUME * masterVolume;
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

// ---- background music (looping overworld track) --------------------------
// Music has its own volume + mute, independent of the SFX master, so players
// can silence the soundtrack while keeping game sounds (or vice-versa). Both
// persist between sessions.
const LS_MUSIC_VOLUME = "ck_music_volume";
const LS_MUSIC_MUTED = "ck_music_muted";

let musicVolume = loadNumber(LS_MUSIC_VOLUME, 0.5);
let musicMuted = (() => {
  try {
    return localStorage.getItem(LS_MUSIC_MUTED) === "1";
  } catch {
    return false;
  }
})();
// Whether the game currently wants music playing (set while in-game); kept so
// toggling mute off can resume the track without the caller re-invoking it.
let musicWanted = false;
let musicEl: HTMLAudioElement | null = null;

function ensureMusicEl(): HTMLAudioElement {
  if (!musicEl) {
    musicEl = new Audio(overworldMusicUrl);
    musicEl.loop = true;
    musicEl.volume = musicVolume;
  }
  return musicEl;
}

export function getMusicVolume() {
  return musicVolume;
}

export function setMusicVolume(v: number) {
  musicVolume = Math.min(1, Math.max(0, v));
  try {
    localStorage.setItem(LS_MUSIC_VOLUME, String(musicVolume));
  } catch {
    /* ignore */
  }
  if (musicEl) musicEl.volume = musicVolume;
}

export function isMusicMuted() {
  return musicMuted;
}

export function setMusicMuted(v: boolean) {
  musicMuted = v;
  try {
    localStorage.setItem(LS_MUSIC_MUTED, v ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (musicMuted) {
    if (musicEl) musicEl.pause();
  } else if (musicWanted) {
    startMusic();
  }
}

export function startMusic() {
  musicWanted = true;
  if (musicMuted) return;
  const el = ensureMusicEl();
  el.volume = musicVolume;
  try {
    // Browsers reject autoplay before a user gesture; ignore that rejection.
    void el.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

export function stopMusic() {
  musicWanted = false;
  if (musicEl) {
    musicEl.pause();
    musicEl.currentTime = 0;
  }
}
