// Runtime entity types for the client-side simulation.
// Ported from the former Python backend (backend/app/game/entities.py).

import * as C from "./constants";

export interface GameEventMsg {
  type: "event";
  kind: string;
  [k: string]: unknown;
}

/**
 * The persistent, progression-defining state of the player. This is the single
 * source of truth while playing; it is loaded from / flushed to localStorage by
 * profile.ts. The running World mutates this same object directly.
 */
export class Profile {
  id: number;
  nickname: string;
  level: number;
  exp: number;
  gold: number;
  weapon: string;
  owned_weapons: string[];
  potions: number;
  cleared_raid: number;
  dirty = false;

  constructor(data: {
    id: number;
    nickname: string;
    level: number;
    exp: number;
    gold: number;
    weapon: string;
    owned_weapons: string[];
    potions: number;
    cleared_raid: number;
  }) {
    this.id = data.id;
    this.nickname = data.nickname;
    this.level = data.level;
    this.exp = data.exp;
    this.gold = data.gold;
    this.weapon = data.weapon;
    this.owned_weapons = data.owned_weapons;
    this.potions = data.potions;
    this.cleared_raid = data.cleared_raid;
  }

  get max_hp(): number {
    return C.maxHp(this.level);
  }

  get attack(): number {
    return C.baseAttack(this.level) + C.weaponStats(this.weapon).attack;
  }

  get crit_chance(): number {
    return C.critChance(this.level, C.weaponStats(this.weapon).crit_bonus);
  }

  /** Add rewards. Returns the list of new levels reached (for events). */
  grant(exp: number, gold: number): number[] {
    this.gold += gold;
    this.exp += exp;
    this.dirty = true;
    const leveled: number[] = [];
    while (this.level < C.MAX_LEVEL && this.exp >= C.expToNext(this.level)) {
      this.exp -= C.expToNext(this.level);
      this.level += 1;
      leveled.push(this.level);
    }
    if (this.level >= C.MAX_LEVEL) this.exp = 0;
    return leveled;
  }
}

/** Per-session runtime state for a player inside a world. */
export class PlayerRT {
  profile: Profile;
  x: number;
  y: number;
  hp: number;
  facing = 0.0;
  // input (latest received)
  in_up = false;
  in_down = false;
  in_left = false;
  in_right = false;
  in_attack = false;
  in_parry = false;
  aim_x = 1.0;
  aim_y = 0.0;
  // combat timers
  attack_cd = 0.0;
  attack_active = 0.0;
  attack_hit_ids = new Set<number>();
  combo_index = 0;
  combo_active = -1;
  combo_window = 0.0;
  parry_cd = 0.0;
  parry_active = 0.0;
  counter_ready = 0.0;
  parry_count = 0;
  invuln = 0.0;
  // weapon-passive runtime state
  syphon_stacks = 0;
  star_charge = 0.0;
  star_crit = 0.0;
  // lifecycle
  dead = false;
  respawn_in = 0.0;
  raid_heals_used = 0;
  // chat bubble shown above the knight
  chat_text = "";
  chat_ttl = 0.0;
  // outbound event queue (drained by the client each tick)
  events: GameEventMsg[] = [];

  constructor(profile: Profile, x: number, y: number, hp: number) {
    this.profile = profile;
    this.x = x;
    this.y = y;
    this.hp = hp;
  }

  get alive(): boolean {
    return !this.dead;
  }

  pushEvent(kind: string, data: Record<string, unknown> = {}): void {
    this.events.push({ type: "event", kind, ...data });
  }
}

export class Enemy {
  id: number;
  kind: string; // "melee" | "ranged" | "boss" | "dummy" | "minislime"
  x: number;
  y: number;
  hp: number;
  max_hp: number;
  dmg: number;
  speed: number;
  rng: number;
  cd: number;
  windup: number;
  radius: number;
  atk_timer = 0.0;
  windup_timer = 0.0;
  facing = 0.0;
  // slime boss / mini-slime state
  phase = "ground";
  phase_timer = 0.0;
  special_cd = 0.0;
  contact_timer = 0.0;
  target_x = 0.0;
  target_y = 0.0;
  blink = false;
  // weapon-passive status effects applied by players
  slow_timer = 0.0;
  burn_timer = 0.0;
  burn_dps = 0.0;
  burn_by: PlayerRT | null = null;
  bleed_timer = 0.0;
  bleed_dps = 0.0;
  bleed_by: PlayerRT | null = null;
  burn_accum = 0.0;
  bleed_accum = 0.0;
  dot_timer = C.DOT_NUMBER_INTERVAL;

  constructor(data: {
    id: number;
    kind: string;
    x: number;
    y: number;
    hp: number;
    max_hp: number;
    dmg: number;
    speed: number;
    rng: number;
    cd: number;
    windup: number;
    radius?: number;
  }) {
    this.id = data.id;
    this.kind = data.kind;
    this.x = data.x;
    this.y = data.y;
    this.hp = data.hp;
    this.max_hp = data.max_hp;
    this.dmg = data.dmg;
    this.speed = data.speed;
    this.rng = data.rng;
    this.cd = data.cd;
    this.windup = data.windup;
    this.radius = data.radius ?? C.ENEMY_RADIUS;
  }
}

export class Projectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  ttl = 3.0;

  constructor(data: {
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    dmg: number;
  }) {
    this.id = data.id;
    this.x = data.x;
    this.y = data.y;
    this.vx = data.vx;
    this.vy = data.vy;
    this.dmg = data.dmg;
  }
}

export class SlimeBall {
  id: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  x: number;
  y: number;
  t = 0.0;
  dur = C.SLIME_BALL_FLIGHT;

  constructor(data: {
    id: number;
    sx: number;
    sy: number;
    tx: number;
    ty: number;
    x: number;
    y: number;
  }) {
    this.id = data.id;
    this.sx = data.sx;
    this.sy = data.sy;
    this.tx = data.tx;
    this.ty = data.ty;
    this.x = data.x;
    this.y = data.y;
  }
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}
