from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import select

from ..deps import DbSession
from ..game.manager import manager
from ..models import Player
from ..schemas import LeaderboardEntry

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])


@router.get("", response_model=list[LeaderboardEntry])
async def leaderboard(db: DbSession):
    rows = (await db.scalars(select(Player))).all()
    snap: dict[int, tuple[str, int, int, int]] = {
        r.id: (r.nickname, r.level, r.cleared_raid, r.gold) for r in rows
    }
    # Overlay live (possibly un-flushed) progress so the board is current.
    for pid, conn in manager.connections.items():
        p = conn.profile
        snap[pid] = (p.nickname, p.level, p.cleared_raid, p.gold)

    ordered = sorted(snap.values(), key=lambda v: (-v[1], -v[2], -v[3]))[:20]
    return [
        LeaderboardEntry(
            rank=i + 1, nickname=n, level=lvl, cleared_raid=cr, gold=g
        )
        for i, (n, lvl, cr, g) in enumerate(ordered)
    ]
