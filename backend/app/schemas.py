from __future__ import annotations

from pydantic import BaseModel, Field


class RegisterIn(BaseModel):
    nickname: str = Field(min_length=3, max_length=24)
    password: str = Field(min_length=4, max_length=128)


class LoginIn(BaseModel):
    nickname: str
    password: str


class TokenOut(BaseModel):
    token: str
    player: "PlayerOut"


class PlayerOut(BaseModel):
    id: int
    nickname: str
    level: int
    exp: int
    exp_to_next: int
    gold: int
    weapon: str
    owned_weapons: list[str]
    potions: int
    cleared_raid: int
    max_hp: int
    attack: int
    crit_chance: float


class ShopItem(BaseModel):
    key: str
    name: str
    kind: str  # "weapon" | "potion"
    price: int
    attack: int = 0
    crit_bonus: float = 0.0
    requires_raid: int = 0
    description: str = ""


class BuyIn(BaseModel):
    key: str


class EquipIn(BaseModel):
    key: str


class LeaderboardEntry(BaseModel):
    rank: int
    nickname: str
    level: int
    cleared_raid: int
    gold: int


TokenOut.model_rebuild()
