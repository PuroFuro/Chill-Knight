from __future__ import annotations

from .game import constants as C
from .game.entities import Profile
from .models import Player
from .schemas import PlayerOut


def player_out(p: Player) -> PlayerOut:
    w = C.weapon_stats(p.weapon)
    return PlayerOut(
        id=p.id,
        nickname=p.nickname,
        level=p.level,
        exp=p.exp,
        exp_to_next=C.exp_to_next(p.level),
        gold=p.gold,
        weapon=p.weapon,
        owned_weapons=list(p.owned_weapons or []),
        potions=p.potions,
        cleared_raid=p.cleared_raid,
        max_hp=C.max_hp(p.level),
        attack=C.base_attack(p.level) + w["attack"],
        crit_chance=round(C.crit_chance(p.level, w["crit_bonus"]), 4),
    )


def profile_out(p: Profile) -> PlayerOut:
    return PlayerOut(
        id=p.id,
        nickname=p.nickname,
        level=p.level,
        exp=p.exp,
        exp_to_next=C.exp_to_next(p.level),
        gold=p.gold,
        weapon=p.weapon,
        owned_weapons=list(p.owned_weapons),
        potions=p.potions,
        cleared_raid=p.cleared_raid,
        max_hp=p.max_hp,
        attack=p.attack,
        crit_chance=round(p.crit_chance, 4),
    )
