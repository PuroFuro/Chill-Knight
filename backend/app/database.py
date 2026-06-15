from __future__ import annotations

import ssl

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from .config import settings


def _supabase_ssl() -> ssl.SSLContext:
    """TLS context for Supabase: encrypt the connection but don't verify the CA
    chain (equivalent to libpq's ``sslmode=require``). Supabase's pooler presents
    a certificate signed by Supabase's own CA, which isn't in the system trust
    store, so full verification fails out of the box. The traffic is still
    encrypted. (To verify strictly instead, download Supabase's CA cert and load
    it here with ``ctx.load_verify_locations(...)``.)
    """
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def _engine_kwargs(url: str) -> dict:
    """Driver-specific engine options.

    For Supabase (Postgres over asyncpg) we disable asyncpg's prepared-statement
    cache so the connection works through Supabase's transaction pooler
    (pgbouncer), which doesn't support server-side prepared statements. It's
    harmless on the direct/session connection too. Supabase requires SSL.
    """
    kwargs: dict = {"echo": False, "pool_pre_ping": True}
    if "asyncpg" in url:
        connect_args: dict = {"statement_cache_size": 0}
        if "supabase" in url:
            connect_args["ssl"] = _supabase_ssl()
        kwargs["connect_args"] = connect_args
    return kwargs


engine = create_async_engine(settings.database_url, **_engine_kwargs(settings.database_url))
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def init_db() -> None:
    """Create tables if they do not exist yet."""
    from . import models  # noqa: F401  (ensure models are registered)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
