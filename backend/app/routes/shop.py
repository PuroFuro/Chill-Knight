from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from ..deps import CurrentPlayer, DbSession
from ..game import constants as C
from ..game.manager import manager
from ..schemas import BuyIn, EquipIn, PlayerOut, ShopItem
from ..serializers import player_out, profile_out

router = APIRouter(prefix="/api/shop", tags=["shop"])


@router.get("", response_model=list[ShopItem])
async def catalog():
    items: list[ShopItem] = []
    for key, w in C.WEAPONS.items():
        items.append(ShopItem(
            key=key, name=w["name"], kind="weapon", price=w["price"],
            attack=w["attack"], crit_bonus=w["crit_bonus"],
            requires_raid=w["requires_raid"], description=w["description"],
            passive=C.passive_text(key),
        ))
    items.append(ShopItem(
        key=C.POTION_KEY, name=C.POTION["name"], kind="potion",
        price=C.POTION["price"], description=C.POTION["description"],
    ))
    return items


def _resolve(player):
    """Return (target, is_live). The live in-game Profile is authoritative
    while connected; otherwise we mutate the DB row directly."""
    conn = manager.get_connection(player.id)
    if conn is not None:
        return conn.profile, True
    return player, False


@router.post("/buy", response_model=PlayerOut)
async def buy(body: BuyIn, player: CurrentPlayer, db: DbSession):
    target, is_live = _resolve(player)
    key = body.key

    if key == C.POTION_KEY:
        price = C.POTION["price"]
        if target.gold < price:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Not enough gold")
        target.gold -= price
        target.potions += 1
    elif key in C.WEAPONS:
        w = C.WEAPONS[key]
        owned = list(target.owned_weapons or [])
        if key in owned:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "You already own that weapon")
        if target.cleared_raid < w["requires_raid"]:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Requires raid difficulty {w['requires_raid']} cleared",
            )
        if target.gold < w["price"]:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Not enough gold")
        target.gold -= w["price"]
        owned.append(key)
        target.owned_weapons = owned
    else:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such item")

    if is_live:
        target.dirty = True
        return profile_out(target)
    await db.commit()
    await db.refresh(player)
    return player_out(player)


@router.post("/equip", response_model=PlayerOut)
async def equip(body: EquipIn, player: CurrentPlayer, db: DbSession):
    target, is_live = _resolve(player)
    if body.key not in (target.owned_weapons or []):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You don't own that weapon")
    target.weapon = body.key
    if is_live:
        target.dirty = True
        return profile_out(target)
    await db.commit()
    await db.refresh(player)
    return player_out(player)
