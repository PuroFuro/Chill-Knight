export interface Player {
  id: number;
  nickname: string;
  level: number;
  exp: number;
  exp_to_next: number;
  gold: number;
  weapon: string;
  owned_weapons: string[];
  potions: number;
  cleared_raid: number;
  max_hp: number;
  attack: number;
  crit_chance: number;
}

export interface ShopItem {
  key: string;
  name: string;
  kind: "weapon" | "potion";
  price: number;
  attack: number;
  crit_bonus: number;
  requires_raid: number;
  description: string;
  passive: string;
}

export interface LeaderboardEntry {
  rank: number;
  nickname: string;
  level: number;
  cleared_raid: number;
  gold: number;
}

export interface SnapPlayer {
  id: number;
  name: string;
  lvl: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  facing: number;
  dead: boolean;
  atk: boolean;
  combo: number; // index of the swing currently animating (0-2), -1 idle
  parry: boolean;
  counter: boolean;
  weapon: string; // equipped weapon key (selects the sword sprite)
  chat: string;
}

export interface SnapEnemy {
  id: number;
  kind: "melee" | "ranged" | "boss";
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  facing: number;
  wind: boolean;
}

export interface Snapshot {
  type: "state";
  t: number;
  mode: "overworld" | "raid";
  difficulty: number;
  code: string | null;
  ended: boolean;
  cleared: boolean;
  boss: { hp: number; maxHp: number } | null;
  players: SnapPlayer[];
  enemies: SnapEnemy[];
  projectiles: { id: number; x: number; y: number; a: number }[];
}

export interface StatsMsg {
  type: "stats";
  level: number;
  exp: number;
  expToNext: number;
  gold: number;
  hp: number;
  maxHp: number;
  attack: number;
  critChance: number;
  weapon: string;
  potions: number;
  clearedRaid: number;
  dead: boolean;
}

export interface ChatMsg {
  type: "chat";
  from: string;
  level: number;
  mode: string;
  text: string;
  x: number;
  y: number;
}

export interface JoinedMsg {
  type: "joined";
  playerId: number;
  mode: "overworld" | "raid";
  difficulty: number;
  code: string | null;
  arena: { w: number; h: number };
}

export type ServerMsg =
  | Snapshot
  | StatsMsg
  | ChatMsg
  | JoinedMsg
  | { type: "hello"; player: Player }
  | { type: "event"; kind: string; [k: string]: unknown }
  | { type: "world_closed"; reason: string }
  | { type: "kicked"; message: string }
  | { type: "error"; message: string }
  | { type: "pong" };
