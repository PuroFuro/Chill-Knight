from __future__ import annotations

import math
from dataclasses import dataclass, field

from . import constants as C


@dataclass
class Profile:
    """The persistent, progression-defining state of a player. This object is
    the single source of truth while the player is connected; it is loaded
    from the DB on join and flushed back periodically / on disconnect."""

    id: int
    nickname: str
    level: int
    exp: int
    gold: int
    weapon: str
    owned_weapons: list[str]
    potions: int
    cleared_raid: int
    dirty: bool = False

    # --- derived combat stats ---
    @property
    def max_hp(self) -> int:
        return C.max_hp(self.level)

    @property
    def attack(self) -> int:
        return C.base_attack(self.level) + C.weapon_stats(self.weapon)["attack"]

    @property
    def crit_chance(self) -> float:
        return C.crit_chance(self.level, C.weapon_stats(self.weapon)["crit_bonus"])

    def grant(self, exp: int, gold: int) -> list[int]:
        """Add rewards. Returns the list of new levels reached (for events)."""
        self.gold += gold
        self.exp += exp
        self.dirty = True
        leveled: list[int] = []
        while self.level < C.MAX_LEVEL and self.exp >= C.exp_to_next(self.level):
            self.exp -= C.exp_to_next(self.level)
            self.level += 1
            leveled.append(self.level)
        if self.level >= C.MAX_LEVEL:
            self.exp = 0
        return leveled


@dataclass
class PlayerRT:
    """Per-session runtime state for a player inside a world."""

    profile: Profile
    x: float
    y: float
    hp: float
    facing: float = 0.0  # radians
    # input (latest received)
    in_up: bool = False
    in_down: bool = False
    in_left: bool = False
    in_right: bool = False
    in_attack: bool = False
    in_parry: bool = False
    aim_x: float = 1.0
    aim_y: float = 0.0
    # combat timers
    attack_cd: float = 0.0
    attack_active: float = 0.0
    attack_hit_ids: set = field(default_factory=set)
    # 3-hit combo: combo_index is the *next* swing to perform (0,1,2);
    # combo_active is the swing currently animating (-1 when idle); combo_window
    # counts down and resets the chain to the first swing once it elapses.
    combo_index: int = 0
    combo_active: int = -1
    combo_window: float = 0.0
    parry_cd: float = 0.0
    parry_active: float = 0.0
    counter_ready: float = 0.0
    invuln: float = 0.0
    # weapon-passive runtime state
    syphon_stacks: int = 0  # scythe: stacking attack/crit from landed hits
    star_charge: float = 0.0  # two_stars: accumulated attack from absorbed hits
    star_crit: float = 0.0  # two_stars: accumulated crit from absorbed hits
    # lifecycle
    dead: bool = False
    respawn_in: float = 0.0
    raid_heals_used: int = 0
    # chat bubble shown above the knight
    chat_text: str = ""
    chat_ttl: float = 0.0
    # outbound event queue (drained by the connection writer)
    events: list = field(default_factory=list)
    last_stats_sig: tuple = ()

    @property
    def alive(self) -> bool:
        return not self.dead

    def push_event(self, kind: str, **data) -> None:
        self.events.append({"type": "event", "kind": kind, **data})


@dataclass
class Enemy:
    id: int
    kind: str  # "melee" | "ranged" | "boss"
    x: float
    y: float
    hp: float
    max_hp: float
    dmg: float
    speed: float
    rng: float
    cd: float
    windup: float
    radius: float = C.ENEMY_RADIUS
    atk_timer: float = 0.0  # counts down to next attack
    windup_timer: float = 0.0  # >0 while telegraphing (parry window for player)
    target_id: int | None = None
    facing: float = 0.0
    # weapon-passive status effects applied by players
    slow_timer: float = 0.0  # >0 while frost-slowed
    burn_timer: float = 0.0  # >0 while burning (damage over time)
    burn_dps: float = 0.0  # burn damage per second
    burn_by: "PlayerRT | None" = None  # who applied the burn (reward attribution)
    bleed_timer: float = 0.0  # >0 while bleeding (knife damage over time)
    bleed_dps: float = 0.0  # bleed damage per second (fraction of max HP)
    bleed_by: "PlayerRT | None" = None  # who applied the bleed


@dataclass
class Projectile:
    id: int
    x: float
    y: float
    vx: float
    vy: float
    dmg: float
    ttl: float = 3.0


def dist(ax: float, ay: float, bx: float, by: float) -> float:
    return math.hypot(ax - bx, ay - by)
