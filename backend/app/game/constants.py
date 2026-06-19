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

# --- 3-hit combo ----------------------------------------------------------
# The knight swings a fixed three-step combo: down->up, up->down, then a
# forward thrust. Each of the first two steps is followed by COMBO_INTERVAL
# before the next swing can land; after the thrust the chain rests for
# COMBO_FINISH_INTERVAL before looping back to the first swing. If the player
# stops attacking for COMBO_GRACE the chain resets to the first swing.
COMBO_INTERVAL = 0.4
COMBO_FINISH_INTERVAL = 0.8
COMBO_GRACE = 1.0
COMBO_LEN = 3
# The thrust (3rd swing) lunges a bit further with a tighter cone.
THRUST_RANGE_BONUS = 26.0
THRUST_ARC = 0.7
PARRY_DURATION = 0.30  # parry window
PARRY_COOLDOWN = 1.10
PARRY_BONUS = 2.0  # extra damage multiplier on the counter-attack
PARRY_COUNTER_WINDOW = 1.5  # how long the "counter ready" buff lasts
RESPAWN_DELAY = 3.0
SHARE_RADIUS = 360.0  # reward-sharing distance for nearby allies
RAID_HEAL_LIMIT = 3  # potions usable per player per raid
DEATH_GOLD_LOSS = 0.10
DEATH_EXP_LOSS = 0.10

# --- Weapon passives (tunables) ------------------------------------------
LIFESTEAL_PCT = 0.08  # iron_blade: heal this fraction of melee damage dealt
SWIFT_CD_MULT = 0.85  # knights_saber: attack cooldown multiplier (faster)
FROST_SLOW_MULT = 0.6  # frost_edge: struck enemy moves at this fraction of speed
FROST_SLOW_TIME = 1.5  # frost_edge: how long the slow lasts (seconds)
BURN_TIME = 2.0  # dragonfang: burn duration (seconds)
BURN_PCT = 0.30  # dragonfang: total burn damage as a fraction of attack
EXECUTE_THRESHOLD = 0.30  # eclipse: enemies below this HP fraction...
EXECUTE_BONUS = 1.35  # eclipse: ...take this damage multiplier

# curve_sword: a long reach for clearing waves.
CURVE_RANGE_MULT = 1.20
# knife: very fast, short reach, with a chance to inflict bleed.
KNIFE_CD_MULT = 1 / 1.5  # +50% attack speed
KNIFE_RANGE_MULT = 0.80  # -20% range
KNIFE_BLEED_CHANCE = 0.05
KNIFE_BLEED_TIME = 3.0
KNIFE_BLEED_PCT = 0.02  # drains 2% of the enemy's max HP per second
# long_blade: heavy, long, slow — but devastating on a parry counter.
LONG_CD_MULT = 1.25  # -20% attack speed (1 / 0.8)
LONG_RANGE_MULT = 1.30
LONG_COUNTER_FLAT = 40.0  # bonus flat damage added to a parry counter
# drows: parry counters always crit, but each hit you land costs you HP.
DROWS_HIT_SELF_DMG = 2.0
# scythe: each landing hit syphons power (stacking attack + crit).
SCYTHE_SYPHON_ATK = 2
SCYTHE_SYPHON_CRIT = 0.02
SCYTHE_SYPHON_MAX = 20
# two_stars: a long parry window that absorbs hits, then a map-wide star burst.
STAR_PARRY_DURATION = 2.0
STAR_ATK_PER = 10.0  # attack accumulated per absorbed hit
STAR_CRIT_PER = 0.02  # crit accumulated per absorbed hit


def max_hp(level: int) -> int:
    return 100 + (level - 1) * 16


def base_attack(level: int) -> int:
    return 10 + (level - 1) * 3


def crit_chance(level: int, weapon_crit_bonus: float) -> float:
    # Grows slowly with level so crits stay special, plus the weapon bonus.
    # The cap is generous so high-crit weapons (Scythe, Two Stars) can shine.
    return min(0.95, 0.03 + (level - 1) * 0.004 + weapon_crit_bonus)


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
# Each weapon's `passive` is a small dict the combat code reads:
#   key        — which effect to apply ("none" | "lifesteal" | "swift" | ...)
#   name       — display name
#   desc       — display description
#   cd_mult    — attack-cooldown multiplier (lower = faster; default 1.0)
#   range_mult — melee reach multiplier (default 1.0)
_NO_PASSIVE = {"key": "none", "name": "None", "desc": "No special passive.", "cd_mult": 1.0}

WEAPONS: dict[str, dict] = {
    "rusty_sword": {
        "name": "Rusty Sword", "price": 0, "attack": 0,
        "crit_bonus": 0.00, "requires_raid": 0,
        "description": "The blade every knight starts with. Reliable, dull.",
        "passive": _NO_PASSIVE,
    },
    "iron_blade": {
        "name": "Iron Blade", "price": 220, "attack": 8,
        "crit_bonus": 0.02, "requires_raid": 0,
        "description": "Solid steel. A noticeable step up from rust.",
        "passive": {
            "key": "lifesteal", "name": "Bloodletter", "cd_mult": 1.0,
            "desc": f"Heal for {int(LIFESTEAL_PCT * 100)}% of the melee damage you deal.",
        },
    },
    "knights_saber": {
        "name": "Knight's Saber", "price": 700, "attack": 18,
        "crit_bonus": 0.05, "requires_raid": 0,
        "description": "Balanced and sharp, favoured by veteran knights.",
        "passive": {
            "key": "swift", "name": "Swift", "cd_mult": SWIFT_CD_MULT,
            "desc": f"Attack {int((1 - SWIFT_CD_MULT) * 100)}% faster.",
        },
    },
    "frost_edge": {
        "name": "Frost Edge", "price": 1600, "attack": 30,
        "crit_bonus": 0.08, "requires_raid": 0,
        "description": "Chills foes to the bone.",
        "passive": {
            "key": "frost", "name": "Frostbite", "cd_mult": 1.0,
            "desc": f"Struck enemies are slowed by {int((1 - FROST_SLOW_MULT) * 100)}% "
                    f"for {FROST_SLOW_TIME:g}s.",
        },
    },
    "dragonfang": {
        "name": "Dragonfang", "price": 4200, "attack": 52,
        "crit_bonus": 0.12, "requires_raid": 0,
        "description": "Forged from a raid-boss fang.",
        "passive": {
            "key": "burn", "name": "Searing", "cd_mult": 1.0,
            "desc": f"Hits ignite enemies for {int(BURN_PCT * 100)}% of your attack "
                    f"over {BURN_TIME:g}s.",
        },
    },
    "eclipse_greatsword": {
        "name": "Eclipse Greatsword", "price": 11000, "attack": 90,
        "crit_bonus": 0.18, "requires_raid": 0,
        "description": "A legend among knights.",
        "passive": {
            "key": "execute", "name": "Eclipse", "cd_mult": 1.0,
            "desc": f"Deal +{int((EXECUTE_BONUS - 1) * 100)}% damage to enemies below "
                    f"{int(EXECUTE_THRESHOLD * 100)}% HP.",
        },
    },
    "curve_sword": {
        "name": "Curve Sword", "price": 1200, "attack": 24,
        "crit_bonus": 0.05, "requires_raid": 0,
        "description": "A long, curved sword with a big range, great for combating "
                       "waves of enemies.",
        "passive": {
            "key": "reach", "name": "Sweeping Reach", "cd_mult": 1.0,
            "range_mult": CURVE_RANGE_MULT,
            "desc": f"Melee range is {round((CURVE_RANGE_MULT - 1) * 100)}% longer.",
        },
    },
    "drows": {
        "name": "Drows", "price": 2400, "attack": 20,
        "crit_bonus": 0.20, "requires_raid": 0,
        "description": "A sword with the blade and handle swapped. For the cost of "
                       "your hands hurting, you'll deal more damage via critting.",
        "passive": {
            "key": "bloodcrit", "name": "Bloodlust", "cd_mult": 1.0,
            "desc": f"Parry counters always crit, but every hit you land costs "
                    f"{int(DROWS_HIT_SELF_DMG)} HP.",
        },
    },
    "knife": {
        "name": "Knife", "price": 3000, "attack": 30,
        "crit_bonus": 0.10, "requires_raid": 0,
        "description": "Seems like a normal knife, but you could feel some murderous "
                       "intent from it.",
        "passive": {
            "key": "bleed", "name": "Lacerate", "cd_mult": KNIFE_CD_MULT,
            "range_mult": KNIFE_RANGE_MULT,
            "desc": f"Attack 50% faster but {round((1 - KNIFE_RANGE_MULT) * 100)}% "
                    f"shorter range, with a {int(KNIFE_BLEED_CHANCE * 100)}% chance to "
                    f"bleed enemies for {int(KNIFE_BLEED_PCT * 100)}% HP/s over "
                    f"{KNIFE_BLEED_TIME:g}s.",
        },
    },
    "long_blade": {
        "name": "Long Blade", "price": 4000, "attack": 60,
        "crit_bonus": 0.30, "requires_raid": 0,
        "description": "A long, heavy blade. Each swing feels very heavy but at the "
                       "same time, it deals a lot of damage.",
        "passive": {
            "key": "heavy", "name": "Heavy Strike", "cd_mult": LONG_CD_MULT,
            "range_mult": LONG_RANGE_MULT,
            "desc": f"{round((LONG_RANGE_MULT - 1) * 100)}% longer range and 20% slower, "
                    f"but parry counters deal +{int(LONG_COUNTER_FLAT)} damage.",
        },
    },
    "scythe": {
        "name": "Scythe", "price": 8000, "attack": 40,
        "crit_bonus": 0.60, "requires_raid": 0,
        "description": "Upon handling this weapon you will feel a sense of dread, and "
                       "the longer you hold it, the feeling of death keeps growing.",
        "passive": {
            "key": "syphon", "name": "Soul Syphon", "cd_mult": 1.0,
            "desc": f"Each hit syphons +{SCYTHE_SYPHON_ATK} attack and "
                    f"+{int(SCYTHE_SYPHON_CRIT * 100)}% crit, up to "
                    f"{SCYTHE_SYPHON_MAX} stacks.",
        },
    },
    "two_stars": {
        "name": "Two Stars", "price": 15000, "attack": 120,
        "crit_bonus": 0.50, "requires_raid": 0,
        "description": "A sword gifted from the stars itself. Nothing will stand in "
                       "your way.",
        "passive": {
            "key": "starfall", "name": "Starfall", "cd_mult": 1.0,
            "parry_duration": STAR_PARRY_DURATION,
            "desc": f"Parry lasts {STAR_PARRY_DURATION:g}s and absorbs every hit; each "
                    f"absorbed hit adds +{int(STAR_ATK_PER)} attack and "
                    f"+{int(STAR_CRIT_PER * 100)}% crit to a map-wide star burst "
                    f"released on your next strike.",
        },
    },
}

POTION_KEY = "health_potion"
POTION = {
    "name": "Health Potion", "price": 60,
    "heal": 70, "description": "Restores 70 HP. Limited uses inside raids.",
}


def weapon_stats(key: str) -> dict:
    return WEAPONS.get(key, WEAPONS["rusty_sword"])


def weapon_passive(key: str) -> dict:
    """The mechanical passive dict for a weapon (defaults to no passive)."""
    return weapon_stats(key).get("passive", _NO_PASSIVE)


def passive_text(key: str) -> str:
    """Human-readable passive line for the shop / inventory UI."""
    p = weapon_passive(key)
    if p["key"] == "none":
        return "None"
    return f"{p['name']} — {p['desc']}"
