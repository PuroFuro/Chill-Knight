from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from .database import SessionLocal
from .game.entities import Profile
from .models import Player


def to_profile(p: Player) -> Profile:
    return Profile(
        id=p.id,
        nickname=p.nickname,
        level=p.level,
        exp=p.exp,
        gold=p.gold,
        weapon=p.weapon,
        owned_weapons=list(p.owned_weapons or ["rusty_sword"]),
        potions=p.potions,
        cleared_raid=p.cleared_raid,
    )


async def write_profile(db: AsyncSession, profile: Profile) -> None:
    row = await db.get(Player, profile.id)
    if row is None:
        return
    row.level = profile.level
    row.exp = profile.exp
    row.gold = profile.gold
    row.weapon = profile.weapon
    row.owned_weapons = list(profile.owned_weapons)
    row.potions = profile.potions
    row.cleared_raid = profile.cleared_raid
    await db.commit()


async def flush_profile(profile: Profile) -> None:
    """Persist a single profile using its own short-lived session."""
    async with SessionLocal() as db:
        await write_profile(db, profile)
    profile.dirty = False
