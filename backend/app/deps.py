from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .database import SessionLocal
from .models import Player
from .security import decode_token


async def get_db():
    async with SessionLocal() as session:
        yield session


DbSession = Annotated[AsyncSession, Depends(get_db)]


async def get_current_player(
    db: DbSession,
    authorization: Annotated[str | None, Header()] = None,
) -> Player:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    data = decode_token(authorization.split(" ", 1)[1].strip())
    if data is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    player = await db.get(Player, int(data["id"]))
    if player is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account not found")
    return player


CurrentPlayer = Annotated[Player, Depends(get_current_player)]
