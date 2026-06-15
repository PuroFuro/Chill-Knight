"""Owns every live World, the global fixed-timestep game loop, the set of
connected clients, and periodic persistence."""

from __future__ import annotations

import asyncio
import random
import string
import time

from ..persistence import flush_profile
from . import constants as C
from .entities import Profile
from .world import World

_LOOP_DT = 1.0 / C.TICK_RATE


def _gen_code() -> str:
    # 4-character invite code (matches the 4-box raid join UI).
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=4))


class Connection:
    """One websocket client. Holds the authoritative Profile for its account
    for the whole connection lifetime (loaded once from the DB at connect)."""

    def __init__(self, profile: Profile):
        self.profile = profile
        self.world_key: str | None = None
        self.queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=64)
        self.open = True
        self._last_stats_sig: tuple = ()

    def send(self, msg: dict) -> None:
        try:
            self.queue.put_nowait(msg)
        except asyncio.QueueFull:
            # Drop the oldest frame for slow clients rather than stall the loop.
            try:
                self.queue.get_nowait()
                self.queue.put_nowait(msg)
            except Exception:
                pass


class GameManager:
    def __init__(self) -> None:
        self.worlds: dict[str, World] = {}
        self.connections: dict[int, Connection] = {}
        self._task: asyncio.Task | None = None
        self._flush_task: asyncio.Task | None = None
        self._running = False

    # -------------------------------------------------------- lifecycle
    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())
        self._flush_task = asyncio.create_task(self._flush_loop())

    async def stop(self) -> None:
        self._running = False
        for t in (self._task, self._flush_task):
            if t:
                t.cancel()
        for conn in list(self.connections.values()):
            if conn.profile.dirty:
                await flush_profile(conn.profile)

    # -------------------------------------------------------- connections
    async def register(self, conn: Connection) -> None:
        old = self.connections.get(conn.profile.id)
        if old is not None:
            old.open = False
            old.send({"type": "kicked", "message": "Logged in from another session."})
            self._detach(old)
        self.connections[conn.profile.id] = conn

    async def unregister(self, conn: Connection) -> None:
        self._detach(conn)
        if self.connections.get(conn.profile.id) is conn:
            self.connections.pop(conn.profile.id, None)
        if conn.profile.dirty:
            await flush_profile(conn.profile)

    def _detach(self, conn: Connection) -> None:
        if conn.world_key and conn.world_key in self.worlds:
            self.worlds[conn.world_key].remove_player(conn.profile.id)
        conn.world_key = None

    # -------------------------------------------------------- world access
    def _world_for(self, conn: Connection) -> World | None:
        if conn.world_key:
            return self.worlds.get(conn.world_key)
        return None

    def get_connection(self, pid: int) -> Connection | None:
        return self.connections.get(pid)

    # -------------------------------------------------------- join / leave
    def join(self, conn: Connection, mode: str, difficulty: int, code: str | None) -> dict:
        difficulty = max(C.MIN_DIFFICULTY, min(C.MAX_DIFFICULTY, int(difficulty)))
        if conn.world_key:
            self._detach(conn)

        if mode == "overworld":
            key = f"ow:{difficulty}"
            world = self.worlds.get(key)
            if world is None:
                world = World(key, "overworld", difficulty)
                self.worlds[key] = world
        elif mode == "raid":
            if code:
                key = f"raid:{code.upper()}"
                world = self.worlds.get(key)
                if world is None or world.ended:
                    return {"type": "error", "message": "Raid not found or already finished."}
            else:
                code = _gen_code()
                key = f"raid:{code}"
                while key in self.worlds:
                    code = _gen_code()
                    key = f"raid:{code}"
                world = World(key, "raid", difficulty, code=code)
                self.worlds[key] = world
        else:
            return {"type": "error", "message": f"Unknown mode '{mode}'."}

        world.add_player(conn.profile)
        conn.world_key = key
        return {
            "type": "joined",
            "playerId": conn.profile.id,
            "mode": world.mode,
            "difficulty": world.difficulty,
            "code": world.code,
            "arena": {"w": C.ARENA_W, "h": C.ARENA_H},
        }

    def leave(self, conn: Connection) -> None:
        self._detach(conn)

    # -------------------------------------------------------- input passthrough
    def on_input(self, conn: Connection, msg: dict) -> None:
        w = self._world_for(conn)
        if w:
            w.handle_input(conn.profile.id, msg)

    def on_chat(self, conn: Connection, text: str) -> None:
        w = self._world_for(conn)
        if not w:
            return
        # The chat bubble above the speaker stays world-local (it lives in the
        # snapshot), but the chat *feed* is global: send to every connected
        # player so people in different worlds still see each other. The line
        # carries the speaker's world number for context.
        broadcast = w.handle_chat(conn.profile.id, text)
        if broadcast:
            for c in self.connections.values():
                c.send(broadcast)

    def on_use_potion(self, conn: Connection) -> None:
        w = self._world_for(conn)
        if w:
            w.use_potion(conn.profile.id)

    def _conns_in(self, key: str):
        return [c for c in self.connections.values() if c.world_key == key]

    # -------------------------------------------------------- the game loop
    async def _loop(self) -> None:
        prev = time.perf_counter()
        while self._running:
            now = time.perf_counter()
            dt = min(0.1, now - prev)
            prev = now
            try:
                self._step(dt)
            except Exception as exc:  # keep the loop alive no matter what
                print(f"[game-loop] error: {exc!r}")
            await asyncio.sleep(max(0.0, _LOOP_DT - (time.perf_counter() - now)))

    def _step(self, dt: float) -> None:
        for key in list(self.worlds.keys()):
            world = self.worlds.get(key)
            if world is None:
                continue
            world.tick(dt)
            conns = self._conns_in(key)
            snap = world.snapshot()
            for c in conns:
                c.send(snap)
                rt = world.players.get(c.profile.id)
                if rt is None:
                    continue
                for ev in rt.events:
                    c.send(ev)
                rt.events.clear()
                stats = world.stats_for(c.profile.id)
                if stats is not None:
                    sig = tuple(stats.values())
                    if sig != c._last_stats_sig:
                        c._last_stats_sig = sig
                        c.send(stats)

            if world.ended:
                for c in conns:
                    c.send({"type": "world_closed", "reason": "raid_over"})
                    c.world_key = None
                self.worlds.pop(key, None)
            elif world.is_empty():
                # No players -> free the instance (per spec).
                self.worlds.pop(key, None)

    # -------------------------------------------------------- persistence
    async def _flush_loop(self) -> None:
        while self._running:
            await asyncio.sleep(4.0)
            for conn in list(self.connections.values()):
                if conn.profile.dirty:
                    try:
                        await flush_profile(conn.profile)
                    except Exception as exc:
                        print(f"[flush] error: {exc!r}")


manager = GameManager()
