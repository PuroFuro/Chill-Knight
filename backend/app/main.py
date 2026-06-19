from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import SessionLocal, init_db
from .game.manager import Connection, manager
from .models import Player
from .persistence import to_profile
from .routes import auth, leaderboard, shop
from .security import decode_token
from .serializers import profile_out


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    manager.start()
    try:
        yield
    finally:
        await manager.stop()


app = FastAPI(title="Chill Knight", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(shop.router)
app.include_router(leaderboard.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "worlds": len(manager.worlds), "online": len(manager.connections)}


async def _writer(ws: WebSocket, conn: Connection) -> None:
    try:
        while conn.open:
            msg = await conn.queue.get()
            await ws.send_json(msg)
    except Exception:
        conn.open = False


@app.websocket("/ws")
async def game_ws(ws: WebSocket):
    token = ws.query_params.get("token", "")
    data = decode_token(token)
    if data is None:
        await ws.close(code=4401)
        return

    async with SessionLocal() as db:
        row = await db.get(Player, int(data["id"]))
        if row is None:
            await ws.close(code=4401)
            return
        profile = to_profile(row)

    await ws.accept()
    conn = Connection(profile)
    await manager.register(conn)
    conn.send({"type": "hello", "player": profile_out(profile).model_dump()})
    writer = asyncio.create_task(_writer(ws, conn))

    try:
        while True:
            msg = await ws.receive_json()
            kind = msg.get("type")
            if kind == "join":
                conn.send(manager.join(
                    conn,
                    msg.get("mode", "overworld"),
                    msg.get("difficulty", 1),
                    msg.get("code"),
                ))
            elif kind == "input":
                manager.on_input(conn, msg)
            elif kind == "chat":
                manager.on_chat(conn, str(msg.get("text", "")))
            elif kind == "use_potion":
                manager.on_use_potion(conn)
            elif kind == "start_raid":
                manager.on_start_raid(conn, msg.get("difficulty", 1))
            elif kind == "leave":
                manager.leave(conn)
                conn.send({"type": "world_closed", "reason": "left"})
            elif kind == "ping":
                conn.send({"type": "pong"})
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        print(f"[ws] error: {exc!r}")
    finally:
        conn.open = False
        writer.cancel()
        await manager.unregister(conn)
