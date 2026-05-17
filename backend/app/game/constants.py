"""Central place for every game-balance tunable, plus the shop catalog."""

from __future__ import annotations

# --- World / simulation ---------------------------------------------------
TICK_RATE = 20  # server simulation ticks per second
SNAPSHOT_RATE = 20  # state broadcasts per second
ARENA_W = 1600
ARENA_H = 1000

MIN_DIFFICULTY = 1
MAX_DIFFICULTY = 50
MIN_LEVEL = 1
MAX_LEVEL = 60

# --- Player ---------------------------------------------------------------
PLAYER_SPEED = 240.0  # px / second
PLAYER_RADIUS = 18.0
ATTACK_RANGE = 70.0
ATTACK_ARC = 1.4  # radians, half-angle of the slash cone
ATTACK_COOLDOWN = 0.45
ATTACK_ACTIVE = 0.15  # how long the slash hitbox is live
PARRY_DURATION = 0.30  # parry window
PARRY_COOLDOWN = 1.10
PARRY_BONUS = 2.0  # extra damage multiplier on the counter-attack
PARRY_COUNTER_WINDOW = 1.5  # how long the "counter ready" buff lasts
RESPAWN_DELAY = 3.0
SHARE_RADIUS = 360.0  # reward-sharing distance for nearby allies
RAID_HEAL_LIMIT = 3  # potions usable per player per raid
DEATH_GOLD_LOSS = 0.10
DEATH_EXP_LOSS = 0.10


def max_hp(level: int) -> int:
    return 100 + (level - 1) * 16


def base_attack(level: int) -> int:
    return 10 + (level - 1) * 3


def crit_chance(level: int, weapon_crit_bonus: float) -> float:
    # Grows slowly with level so crits stay special, plus the weapon bonus.
    return min(0.55, 0.03 + (level - 1) * 0.004 + weapon_crit_bonus)


def exp_to_next(level: int) -> int:
    if level >= MAX_LEVEL:
        return 0
    return int(40 * (level ** 1.55) + 30)


# --- Enemies --------------------------------------------------------------
ENEMY_RADIUS = 16.0
BOSS_RADIUS = 46.0
PROJECTILE_SPEED = 320.0
PROJECTILE_RADIUS = 8.0

ENEMY_BASE = {
    "melee": {"hp": 40, "dmg": 8, "speed": 130.0, "range": 34.0, "cd": 1.2, "windup": 0.4},
    "ranged": {"hp": 28, "dmg": 7, "speed": 90.0, "range": 360.0, "cd": 1.8, "windup": 0.5},
}

# Spawn pacing: base interval shrinks with difficulty and player count.
SPAWN_BASE_INTERVAL = 3.2
MAX_ENEMIES_BASE = 6  # plus a few per extra player


def enemy_hp(kind: str, difficulty: int) -> int:
    return int(ENEMY_BASE[kind]["hp"] * (1 + 0.32 * (difficulty - 1)))


def enemy_dmg(kind: str, difficulty: int) -> float:
    return ENEMY_BASE[kind]["dmg"] * (1 + 0.22 * (difficulty - 1))


def enemy_reward(difficulty: int) -> tuple[int, int]:
    """(exp, gold) for a normal overworld kill at this difficulty."""
    exp = int(8 + 4 * difficulty)
    gold = int(5 + 3 * difficulty)
    return exp, gold


def spawn_interval(difficulty: int, players: int) -> float:
    interval = SPAWN_BASE_INTERVAL / (1 + 0.05 * (difficulty - 1))
    interval /= max(1, players) ** 0.5
    return max(0.55, interval)


def max_enemies(players: int) -> int:
    return MAX_ENEMIES_BASE + players * 3


# --- Bosses ---------------------------------------------------------------
def boss_hp(difficulty: int) -> int:
    return int(600 * (1 + 0.55 * (difficulty - 1)))


def boss_dmg(difficulty: int) -> float:
    return 14 * (1 + 0.28 * (difficulty - 1))


def boss_reward(difficulty: int) -> tuple[int, int]:
    """(exp, gold) for clearing a raid of this difficulty."""
    exp = int(120 + 60 * difficulty)
    gold = int(80 + 45 * difficulty)
    return exp, gold


def first_clear_bonus_gold(difficulty: int) -> int:
    return int(150 + 60 * difficulty)


# --- Shop catalog ---------------------------------------------------------
# requires_raid = highest raid difficulty that must have been cleared to buy.
WEAPONS: dict[str, dict] = {
    "rusty_sword": {
        "name": "Rusty Sword", "price": 0, "attack": 0,
        "crit_bonus": 0.00, "requires_raid": 0,
        "description": "The blade every knight starts with. Reliable, dull.",
    },
    "iron_blade": {
        "name": "Iron Blade", "price": 220, "attack": 8,
        "crit_bonus": 0.02, "requires_raid": 0,
        "description": "Solid steel. A noticeable step up from rust.",
    },
    "knights_saber": {
        "name": "Knight's Saber", "price": 700, "attack": 18,
        "crit_bonus": 0.05, "requires_raid": 0,
        "description": "Balanced and sharp, favoured by veteran knights.",
    },
    "frost_edge": {
        "name": "Frost Edge", "price": 1600, "attack": 30,
        "crit_bonus": 0.08, "requires_raid": 5,
        "description": "Chills foes to the bone. Requires raid 5 cleared.",
    },
    "dragonfang": {
        "name": "Dragonfang", "price": 4200, "attack": 52,
        "crit_bonus": 0.12, "requires_raid": 15,
        "description": "Forged from a raid-boss fang. Requires raid 15 cleared.",
    },
    "eclipse_greatsword": {
        "name": "Eclipse Greatsword", "price": 11000, "attack": 90,
        "crit_bonus": 0.18, "requires_raid": 30,
        "description": "A legend among knights. Requires raid 30 cleared.",
    },
}

POTION_KEY = "health_potion"
POTION = {
    "name": "Health Potion", "price": 60,
    "heal": 70, "description": "Restores 70 HP. Limited uses inside raids.",
}


def weapon_stats(key: str) -> dict:
    return WEAPONS.get(key, WEAPONS["rusty_sword"])
