// Central place for every game-balance tunable, plus the shop catalog.
// Ported 1:1 from the former Python backend (backend/app/game/constants.py) so
// the whole simulation can run client-side with no server.

// --- World / simulation ---------------------------------------------------
export const TICK_RATE = 20; // simulation ticks per second (target)
export const ARENA_W = 1600;
export const ARENA_H = 1000;

export const MIN_DIFFICULTY = 1;
export const MAX_DIFFICULTY = 50;
export const MIN_LEVEL = 1;
export const MAX_LEVEL = 60;

// --- Player ---------------------------------------------------------------
export const PLAYER_SPEED = 240.0; // px / second
export const PLAYER_RADIUS = 18.0;
export const ATTACK_RANGE = 70.0;
export const ATTACK_ARC = 1.4; // radians, half-angle of the slash cone
export const ATTACK_COOLDOWN = 0.45;
export const ATTACK_ACTIVE = 0.15; // how long the slash hitbox is live

// --- 3-hit combo ----------------------------------------------------------
export const COMBO_INTERVAL = 0.4;
export const COMBO_FINISH_INTERVAL = 0.8;
export const COMBO_GRACE = 1.0;
export const COMBO_LEN = 3;
export const THRUST_RANGE_BONUS = 26.0;
export const THRUST_ARC = 0.7;
export const PARRY_DURATION = 0.3; // parry window
export const PARRY_COOLDOWN = 1.1;
export const PARRY_BONUS = 2.0; // extra damage multiplier on the counter-attack
export const PARRY_COUNTER_WINDOW = 1.5; // how long the "counter ready" buff lasts
export const RESPAWN_DELAY = 3.0;

// --- Hit feedback ---------------------------------------------------------
export const KNOCKBACK = 12.0; // px a struck enemy is shoved back (very slight)
export const KNOCKBACK_BOSS = 4.0; // bosses are heavy: only a tiny nudge
export const DOT_NUMBER_INTERVAL = 0.5; // seconds between floating DoT numbers
export const SHARE_RADIUS = 360.0; // reward-sharing distance for nearby allies
export const RAID_HEAL_LIMIT = 3; // potions usable per player per raid
export const DEATH_GOLD_LOSS = 0.1;
export const DEATH_EXP_LOSS = 0.1;

// --- Weapon passives (tunables) ------------------------------------------
export const LIFESTEAL_PCT = 0.08;
export const SWIFT_CD_MULT = 0.85;
export const FROST_SLOW_MULT = 0.6;
export const FROST_SLOW_TIME = 1.5;
export const BURN_TIME = 2.0;
export const BURN_PCT = 0.3;
export const EXECUTE_THRESHOLD = 0.3;
export const EXECUTE_BONUS = 1.35;

export const CURVE_RANGE_MULT = 1.2;
export const KNIFE_CD_MULT = 1 / 1.5; // +50% attack speed
export const KNIFE_RANGE_MULT = 0.8; // -20% range
export const KNIFE_BLEED_CHANCE = 0.05;
export const KNIFE_BLEED_TIME = 3.0;
export const KNIFE_BLEED_PCT = 0.02; // drains 2% of the enemy's max HP per second
export const LONG_CD_MULT = 1.25; // -20% attack speed
export const LONG_RANGE_MULT = 1.3;
export const LONG_COUNTER_FLAT = 40.0;
export const DROWS_HIT_SELF_DMG = 2.0;
export const SCYTHE_SYPHON_ATK = 2;
export const SCYTHE_SYPHON_CRIT = 0.02;
export const SCYTHE_SYPHON_MAX = 20;
export const STAR_PARRY_DURATION = 2.0;
export const STAR_ATK_PER = 10.0;
export const STAR_CRIT_PER = 0.02;

export function maxHp(level: number): number {
  return 100 + (level - 1) * 16;
}

export function baseAttack(level: number): number {
  return 10 + (level - 1) * 3;
}

export function critChance(level: number, weaponCritBonus: number): number {
  return Math.min(0.95, 0.03 + (level - 1) * 0.004 + weaponCritBonus);
}

export function expToNext(level: number): number {
  if (level >= MAX_LEVEL) return 0;
  return Math.trunc(40 * Math.pow(level, 1.55) + 30);
}

// --- Enemies --------------------------------------------------------------
export const ENEMY_RADIUS = 16.0;
export const BOSS_RADIUS = 46.0;
export const PROJECTILE_SPEED = 320.0;
export const PROJECTILE_RADIUS = 8.0;

export interface EnemyBase {
  hp: number;
  dmg: number;
  speed: number;
  range: number;
  cd: number;
  windup: number;
}

export const ENEMY_BASE: Record<string, EnemyBase> = {
  melee: { hp: 40, dmg: 8, speed: 130.0, range: 34.0, cd: 1.2, windup: 0.4 },
  ranged: { hp: 28, dmg: 7, speed: 90.0, range: 360.0, cd: 1.8, windup: 0.5 },
};

export const SPAWN_BASE_INTERVAL = 3.2;
export const MAX_ENEMIES_BASE = 6;

export function enemyHp(kind: string, difficulty: number): number {
  return Math.trunc(ENEMY_BASE[kind].hp * (1 + 0.32 * (difficulty - 1)));
}

export function enemyDmg(kind: string, difficulty: number): number {
  return ENEMY_BASE[kind].dmg * (1 + 0.22 * (difficulty - 1));
}

export function enemyReward(difficulty: number): [number, number] {
  const exp = Math.trunc(8 + 4 * difficulty);
  const gold = Math.trunc(5 + 3 * difficulty);
  return [exp, gold];
}

export function spawnInterval(difficulty: number, players: number): number {
  let interval = SPAWN_BASE_INTERVAL / (1 + 0.05 * (difficulty - 1));
  interval /= Math.pow(Math.max(1, players), 0.5);
  return Math.max(0.55, interval);
}

export function maxEnemies(players: number): number {
  return MAX_ENEMIES_BASE + players * 3;
}

// --- Overworld slime invasion --------------------------------------------
export const INVASION_DURATION = 120.0;
export const INVASION_ROLL_INTERVAL = 20.0;
export const INVASION_CHANCE = 0.05;
export const INVASION_SPAWN_MULT = 0.5;
export const INVASION_MINISLIME_CHANCE = 0.45;

// --- Bosses ---------------------------------------------------------------
export function bossHp(difficulty: number): number {
  return Math.trunc(600 * (1 + 0.55 * (difficulty - 1)));
}

export function bossDmg(difficulty: number): number {
  return 14 * (1 + 0.28 * (difficulty - 1));
}

// --- Slime raid boss ------------------------------------------------------
export const BOSS_SPEED = 78.0;
export const BOSS_CONTACT_INTERVAL = 1.0;
export const BOSS_SPECIAL_INTERVAL = 5.0;
export const BOSS_ANTICIPATE = 0.45;
export const BOSS_AIR = 1.7;
export const BOSS_BLINK = 0.7;
export const BOSS_FALL = 0.4;
export const BOSS_CRASH = 0.7;
export const BOSS_SLAM_RADIUS = 130.0;
export const BOSS_SLAM_MULT = 1.7;
export const SLIME_PARRY_KNOCKBACK = 64.0;

export const SLIME_BALL_COUNT = 4;
export const SLIME_BALL_FLIGHT = 0.8;
export const SLIME_BALL_ARC = 130.0;

export const MINI_SLIME_MAX = 8;
export const MINI_SLIME_SPEED = 156.0;
export const MINI_SLIME_RADIUS = 16.0;

export function minislimeHp(difficulty: number): number {
  return Math.trunc(34 * (1 + 0.3 * (difficulty - 1)));
}

export function minislimeDmg(difficulty: number): number {
  return 6 * (1 + 0.22 * (difficulty - 1));
}

export function bossReward(difficulty: number): [number, number] {
  const exp = Math.trunc(120 + 60 * difficulty);
  const gold = Math.trunc(80 + 45 * difficulty);
  return [exp, gold];
}

export function firstClearBonusGold(difficulty: number): number {
  return Math.trunc(150 + 60 * difficulty);
}

// --- Shop catalog ---------------------------------------------------------
export interface Passive {
  key: string;
  name: string;
  desc: string;
  cd_mult: number;
  range_mult?: number;
  parry_duration?: number;
}

export interface Weapon {
  name: string;
  price: number;
  attack: number;
  crit_bonus: number;
  requires_raid: number;
  description: string;
  passive: Passive;
}

const NO_PASSIVE: Passive = {
  key: "none",
  name: "None",
  desc: "No special passive.",
  cd_mult: 1.0,
};

export const WEAPONS: Record<string, Weapon> = {
  rusty_sword: {
    name: "Rusty Sword",
    price: 0,
    attack: 0,
    crit_bonus: 0.0,
    requires_raid: 0,
    description: "The blade every knight starts with. Reliable, dull.",
    passive: NO_PASSIVE,
  },
  iron_blade: {
    name: "Iron Blade",
    price: 220,
    attack: 8,
    crit_bonus: 0.02,
    requires_raid: 0,
    description: "Solid steel. A noticeable step up from rust.",
    passive: {
      key: "lifesteal",
      name: "Bloodletter",
      cd_mult: 1.0,
      desc: `Heal for ${Math.trunc(LIFESTEAL_PCT * 100)}% of the melee damage you deal.`,
    },
  },
  knights_saber: {
    name: "Knight's Saber",
    price: 700,
    attack: 18,
    crit_bonus: 0.05,
    requires_raid: 0,
    description: "Balanced and sharp, favoured by veteran knights.",
    passive: {
      key: "swift",
      name: "Swift",
      cd_mult: SWIFT_CD_MULT,
      desc: `Attack ${Math.trunc((1 - SWIFT_CD_MULT) * 100)}% faster.`,
    },
  },
  frost_edge: {
    name: "Frost Edge",
    price: 1600,
    attack: 30,
    crit_bonus: 0.08,
    requires_raid: 0,
    description: "Chills foes to the bone.",
    passive: {
      key: "frost",
      name: "Frostbite",
      cd_mult: 1.0,
      desc: `Struck enemies are slowed by ${Math.trunc((1 - FROST_SLOW_MULT) * 100)}% for ${FROST_SLOW_TIME}s.`,
    },
  },
  dragonfang: {
    name: "Dragonfang",
    price: 4200,
    attack: 52,
    crit_bonus: 0.12,
    requires_raid: 0,
    description: "Forged from a raid-boss fang.",
    passive: {
      key: "burn",
      name: "Searing",
      cd_mult: 1.0,
      desc: `Hits ignite enemies for ${Math.trunc(BURN_PCT * 100)}% of your attack over ${BURN_TIME}s.`,
    },
  },
  eclipse_greatsword: {
    name: "Eclipse Greatsword",
    price: 11000,
    attack: 90,
    crit_bonus: 0.18,
    requires_raid: 0,
    description: "A legend among knights.",
    passive: {
      key: "execute",
      name: "Eclipse",
      cd_mult: 1.0,
      desc: `Deal +${Math.trunc((EXECUTE_BONUS - 1) * 100)}% damage to enemies below ${Math.trunc(EXECUTE_THRESHOLD * 100)}% HP.`,
    },
  },
  curve_sword: {
    name: "Curve Sword",
    price: 1200,
    attack: 24,
    crit_bonus: 0.05,
    requires_raid: 0,
    description:
      "A long, curved sword with a big range, great for combating waves of enemies.",
    passive: {
      key: "reach",
      name: "Sweeping Reach",
      cd_mult: 1.0,
      range_mult: CURVE_RANGE_MULT,
      desc: `Melee range is ${Math.round((CURVE_RANGE_MULT - 1) * 100)}% longer.`,
    },
  },
  drows: {
    name: "Drows",
    price: 2400,
    attack: 20,
    crit_bonus: 0.2,
    requires_raid: 0,
    description:
      "A sword with the blade and handle swapped. For the cost of your hands hurting, you'll deal more damage via critting.",
    passive: {
      key: "bloodcrit",
      name: "Bloodlust",
      cd_mult: 1.0,
      desc: `Parry counters always crit, but every hit you land costs ${Math.trunc(DROWS_HIT_SELF_DMG)} HP.`,
    },
  },
  knife: {
    name: "Knife",
    price: 3000,
    attack: 30,
    crit_bonus: 0.1,
    requires_raid: 0,
    description:
      "Seems like a normal knife, but you could feel some murderous intent from it.",
    passive: {
      key: "bleed",
      name: "Lacerate",
      cd_mult: KNIFE_CD_MULT,
      range_mult: KNIFE_RANGE_MULT,
      desc: `Attack 50% faster but ${Math.round((1 - KNIFE_RANGE_MULT) * 100)}% shorter range, with a ${Math.trunc(KNIFE_BLEED_CHANCE * 100)}% chance to bleed enemies for ${Math.trunc(KNIFE_BLEED_PCT * 100)}% HP/s over ${KNIFE_BLEED_TIME}s.`,
    },
  },
  long_blade: {
    name: "Long Blade",
    price: 4000,
    attack: 60,
    crit_bonus: 0.3,
    requires_raid: 0,
    description:
      "A long, heavy blade. Each swing feels very heavy but at the same time, it deals a lot of damage.",
    passive: {
      key: "heavy",
      name: "Heavy Strike",
      cd_mult: LONG_CD_MULT,
      range_mult: LONG_RANGE_MULT,
      desc: `${Math.round((LONG_RANGE_MULT - 1) * 100)}% longer range and 20% slower, but parry counters deal +${Math.trunc(LONG_COUNTER_FLAT)} damage.`,
    },
  },
  scythe: {
    name: "Scythe",
    price: 8000,
    attack: 40,
    crit_bonus: 0.6,
    requires_raid: 0,
    description:
      "Upon handling this weapon you will feel a sense of dread, and the longer you hold it, the feeling of death keeps growing.",
    passive: {
      key: "syphon",
      name: "Soul Syphon",
      cd_mult: 1.0,
      desc: `Each hit syphons +${SCYTHE_SYPHON_ATK} attack and +${Math.trunc(SCYTHE_SYPHON_CRIT * 100)}% crit, up to ${SCYTHE_SYPHON_MAX} stacks.`,
    },
  },
  two_stars: {
    name: "Two Stars",
    price: 15000,
    attack: 120,
    crit_bonus: 0.5,
    requires_raid: 0,
    description:
      "A sword gifted from the stars itself. Nothing will stand in your way.",
    passive: {
      key: "starfall",
      name: "Starfall",
      cd_mult: 1.0,
      parry_duration: STAR_PARRY_DURATION,
      desc: `Parry lasts ${STAR_PARRY_DURATION}s and absorbs every hit; each absorbed hit adds +${Math.trunc(STAR_ATK_PER)} attack and +${Math.trunc(STAR_CRIT_PER * 100)}% crit to a map-wide star burst released on your next strike.`,
    },
  },
};

export const POTION_KEY = "health_potion";
export const POTION = {
  name: "Health Potion",
  price: 60,
  heal: 70,
  description: "Restores 70 HP. Limited uses inside raids.",
};

export function weaponStats(key: string): Weapon {
  return WEAPONS[key] ?? WEAPONS.rusty_sword;
}

export function weaponPassive(key: string): Passive {
  return weaponStats(key).passive ?? NO_PASSIVE;
}

export function passiveText(key: string): string {
  const p = weaponPassive(key);
  if (p.key === "none") return "None";
  return `${p.name} — ${p.desc}`;
}
