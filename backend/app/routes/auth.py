from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from ..deps import CurrentPlayer, DbSession
from ..models import Player
from ..schemas import LoginIn, PlayerOut, RegisterIn, TokenOut
from ..security import create_token, hash_password, verify_password
from ..serializers import player_out

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenOut)
async def register(body: RegisterIn, db: DbSession):
    nickname = body.nickname.strip()
    exists = await db.scalar(select(Player).where(Player.nickname == nickname))
    if exists is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "That nickname is already taken")

    player = Player(nickname=nickname, password_hash=hash_password(body.password))
    db.add(player)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "That nickname is already taken")
    await db.refresh(player)
    return TokenOut(token=create_token(player.id, player.nickname), player=player_out(player))


@router.post("/login", response_model=TokenOut)
async def login(body: LoginIn, db: DbSession):
    player = await db.scalar(select(Player).where(Player.nickname == body.nickname.strip()))
    if player is None or not verify_password(body.password, player.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong nickname or password")
    return TokenOut(token=create_token(player.id, player.nickname), player=player_out(player))


@router.get("/me", response_model=PlayerOut)
async def me(player: CurrentPlayer):
    return player_out(player)
