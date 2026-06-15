# ⚔️ Chill Knight (WIP)

A 2D, real-time, multiplayer browser game built from `Project Draft.txt`.
Play as a knight, grind randomly spawning mobs in shared difficulty worlds
(1–50), party up for raid bosses, level up (max 60), spend gold in the shop,
and climb the leaderboard.

**Stack (as specified in the draft):**

| Layer    | Tech                                                  |
| -------- | ----------------------------------------------------- |
| Backend  | Python · FastAPI · WebSockets · authoritative game loop |
| Frontend | TypeScript · React · Vite · TailwindCSS · Canvas 2D   |
| Database | Supabase (Postgres) · SQLite fallback for zero-setup local dev |

---

## Quick start (Windows PowerShell)

Open **two terminals**.

**1. Backend**

```powershell
cd backend
./run.ps1
```

First run creates a virtualenv, installs deps, copies `.env`, then serves
the API + game loop on `http://localhost:8000`. By default it uses a local
SQLite file so it runs with zero setup.

**2. Frontend**

```powershell
cd frontend
./run.ps1
```

Opens the game on `http://localhost:5173`. Register a knight and play.

> Open the site in two browsers / profiles, join the **same difficulty**,
> and you'll see each other fighting in the shared world.

### Manual start (any OS)

```bash
# backend
cd backend
python -m venv .venv && . .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000

# frontend
cd frontend
npm install
npm run dev
```

---

## Using Supabase (recommended / production)

Accounts live in Supabase's hosted Postgres. The FastAPI backend still runs the
auth (bcrypt + signed tokens) and the realtime game loop — Supabase is just the
database, which means you can browse and edit player data with SQL right in the
Supabase dashboard.

> 📖 **Step-by-step walkthrough: [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md)** —
> creating the project, getting the right connection string, and running SQL on
> your data. The short version is below.

1. Create a project at [supabase.com](https://supabase.com).
2. In the dashboard go to **Settings → Database → Connection string** and copy
   the **URI**. Swap the scheme `postgresql://` for `postgresql+asyncpg://`.
3. Put it in `backend/.env`:

   ```
   DATABASE_URL=postgresql+asyncpg://postgres:<PASSWORD>@db.<REF>.supabase.co:5432/postgres
   ```

   (For serverless/pooled hosting use the **transaction pooler** host on port
   `6543`; asyncpg's prepared-statement cache is auto-disabled for Supabase URLs
   so pgbouncer works.)
4. Restart the backend — the `players` table is created automatically on
   startup. Open the Supabase **SQL Editor** and run `select * from players;` to
   see live accounts.

> SQLite is still the zero-setup fallback for local dev: leave `DATABASE_URL`
> unset (or pointed at the SQLite file) and everything runs with no external DB.
> The old `docker-compose.yml` (a local Postgres) remains for anyone who prefers
> self-hosting, but Supabase is the recommended path.

---

## Controls

| Action          | Keys                          |
| --------------- | ----------------------------- |
| Move            | `WASD` / Arrow keys           |
| Aim             | Mouse                         |
| Slash attack    | Left-click / `J`              |
| Parry           | `Space` / `K`                 |
| Drink potion    | `H`                           |
| Chat            | `T` (Esc to cancel)           |
| Menu            | `Esc` or the ☰ button (top-left) |
| Leaderboard     | `L` (top-right)               |
| Leave / Logout  | via the menu                  |

**Parry:** when an enemy flashes (winding up), parry to negate the hit and
charge a powered-up counter — your next slash deals bonus damage.

---

## How the systems map to the draft

- **Accounts** – nickname + password (bcrypt hashed), progress saved to the DB.
- **Worlds 1–50** – one shared instance per difficulty; created on first
  join, destroyed when empty so idle instances don't waste resources.
  Players in the same difficulty see and fight alongside each other.
- **Shared rewards** – a kill grants exp/gold to every nearby ally.
- **Raids** – `Start Raid` creates a private instance with an invite code;
  friends `Join` by code. Boss gives big exp/gold, a **first-clear gold
  bonus**, and clearing difficulty *N* cascades all lower difficulties as
  cleared. Limited potion uses per raid; no respawns; a wipe ends the raid
  with no losses.
- **Player** – level 1→60, leveling raises HP and attack; dying in the
  overworld costs a small % of gold/exp then respawns you.
- **Combat** – slash, parry-counter, and crits whose chance scales slowly
  with level + weapon.
- **Social** – chat as floating bubbles plus a side feed showing each
  speaker's difficulty/location, with a "only my level" filter.
- **Leaderboard** – top knights by level, highest raid cleared, and gold.
- **Shop** – weapons (some gated behind raid clears) and health potions. Each
  weapon carries a passive: lifesteal, faster attacks, frost-slow, burn DoT, or
  an execute bonus vs low-HP enemies.
- **Enemies** – melee + ranged, random spawns; spawn rate scales with the
  number of players, stats scale with world difficulty.

---

## Project layout

```
backend/
  app/
    main.py            FastAPI app + WebSocket endpoint
    config.py          env-driven settings
    database.py        async SQLAlchemy engine/session
    models.py          Player table
    security.py        bcrypt + signed tokens
    deps.py            auth dependency
    schemas.py         API request/response models
    serializers.py     Player/Profile -> API DTOs
    persistence.py     DB <-> live Profile
    routes/            auth, shop, leaderboard REST
    game/
      constants.py     all balance tunables + shop catalog
      entities.py      runtime dataclasses
      world.py         authoritative per-world simulation
      manager.py       instances + global game loop + persistence
frontend/
  src/
    App.tsx            screen flow + message dispatch
    api.ts             REST client
    net/socket.ts      WebSocket game client
    game/GameCanvas.tsx input + Canvas renderer
    components/        Auth, Lobby, Hud, Shop, Leaderboard, ChatPanel
```

## Notes & scope

This is a complete, runnable MVP that implements every system in the draft.
Networking is server-authoritative (clients send intent, render snapshots at
~20 Hz). Things intentionally left simple for a first version: no client-side
prediction/interpolation (movement is snapshot-driven), basic 2D shapes
instead of sprite art, and single-server (no horizontal scaling). These are
called out so the next iteration is clear.
