// Local, single-player save. Replaces the former account/database layer: the
// player's progression lives in localStorage and the running World mutates the
// one shared Profile instance directly (so shop purchases made mid-game stick).

import type { Player } from "../../types";
import * as C from "./constants";
import { Profile } from "./entities";

const SAVE_KEY = "ck_save";
const LOCAL_PLAYER_ID = 1;

interface SaveData {
  nickname: string;
  level: number;
  exp: number;
  gold: number;
  weapon: string;
  owned_weapons: string[];
  potions: number;
  cleared_raid: number;
}

function defaultSave(): SaveData {
  return {
    nickname: "Knight",
    level: 1,
    exp: 0,
    gold: 0,
    weapon: "rusty_sword",
    owned_weapons: ["rusty_sword"],
    potions: 0,
    cleared_raid: 0,
  };
}

function readSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    const base = defaultSave();
    const owned = Array.isArray(parsed.owned_weapons)
      ? parsed.owned_weapons
      : base.owned_weapons;
    // Always keep the starter sword owned so the player can never be weaponless.
    if (!owned.includes("rusty_sword")) owned.unshift("rusty_sword");
    return {
      nickname: typeof parsed.nickname === "string" ? parsed.nickname : base.nickname,
      level: clampInt(parsed.level, base.level, C.MIN_LEVEL, C.MAX_LEVEL),
      exp: Math.max(0, Math.trunc(Number(parsed.exp ?? base.exp)) || 0),
      gold: Math.max(0, Math.trunc(Number(parsed.gold ?? base.gold)) || 0),
      weapon:
        typeof parsed.weapon === "string" && owned.includes(parsed.weapon)
          ? parsed.weapon
          : "rusty_sword",
      owned_weapons: owned.filter((k) => k in C.WEAPONS),
      potions: Math.max(0, Math.trunc(Number(parsed.potions ?? base.potions)) || 0),
      cleared_raid: Math.max(0, Math.trunc(Number(parsed.cleared_raid ?? base.cleared_raid)) || 0),
    };
  } catch {
    return defaultSave();
  }
}

function clampInt(v: unknown, dflt: number, lo: number, hi: number): number {
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, n));
}

// The single shared Profile instance for this session.
let profile: Profile | null = null;

export function getProfile(): Profile {
  if (profile === null) {
    const s = readSave();
    profile = new Profile({ id: LOCAL_PLAYER_ID, ...s });
  }
  return profile;
}

export function saveProfile(): void {
  const p = getProfile();
  const data: SaveData = {
    nickname: p.nickname,
    level: p.level,
    exp: p.exp,
    gold: p.gold,
    weapon: p.weapon,
    owned_weapons: p.owned_weapons,
    potions: p.potions,
    cleared_raid: p.cleared_raid,
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    p.dirty = false;
  } catch {
    /* storage full / unavailable — keep playing, just don't persist */
  }
}

/** Serialize the live Profile into the `Player` shape the UI expects. */
export function profileToPlayer(p: Profile = getProfile()): Player {
  const w = C.weaponStats(p.weapon);
  return {
    id: p.id,
    nickname: p.nickname,
    level: p.level,
    exp: p.exp,
    exp_to_next: C.expToNext(p.level),
    gold: p.gold,
    weapon: p.weapon,
    owned_weapons: [...p.owned_weapons],
    potions: p.potions,
    cleared_raid: p.cleared_raid,
    max_hp: C.maxHp(p.level),
    attack: C.baseAttack(p.level) + w.attack,
    crit_chance: Math.round(C.critChance(p.level, w.crit_bonus) * 10000) / 10000,
  };
}
