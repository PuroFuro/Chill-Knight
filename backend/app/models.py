from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Player(Base):
    """A persisted account. Combat stats are derived from level + weapon at
    runtime; only progression-defining fields are stored."""

    __tablename__ = "players"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nickname: Mapped[str] = mapped_column(String(24), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(200), nullable=False)

    level: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    exp: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    gold: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Equipped weapon key + everything the player owns.
    weapon: Mapped[str] = mapped_column(String(40), default="rusty_sword", nullable=False)
    owned_weapons: Mapped[list] = mapped_column(JSON, default=lambda: ["rusty_sword"], nullable=False)
    potions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Highest raid difficulty the player has ever cleared (drives unlocks +
    # leaderboard). Clearing difficulty N implies all below are cleared too.
    cleared_raid: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )
