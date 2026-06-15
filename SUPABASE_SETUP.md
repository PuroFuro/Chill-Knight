# Setting up Supabase for Chill Knight

This project uses **Supabase only as its database** (hosted Postgres). The
FastAPI backend still runs all the auth (bcrypt password hashing + signed
tokens) and the realtime game loop — Supabase just stores your accounts so you
can host the DB easily and poke at the data with SQL.

You do **not** need Supabase Auth, the Supabase JS client, or any extra Python
packages. The existing backend already speaks to Postgres over `asyncpg`; all
you do is point it at your Supabase database with one environment variable.

---

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. Click **New project**.
3. Pick an organization, give it a name (e.g. `chill-knight`), and **set a
   database password** — write this down, you'll need it in step 3. (You can
   reset it later under **Settings → Database → Database password**.)
4. Choose a region close to you and create the project. Wait ~1 minute for it
   to finish provisioning.

---

## 2. Get the connection string

1. In your project, click **Connect** (top of the page) — or go to
   **Settings → Database → Connection string**.
2. You'll see a few options. Choose based on how you'll run the backend:

   | Option | Host / Port | Use when |
   | ------ | ----------- | -------- |
   | **Session pooler** (recommended) | `...pooler.supabase.com` : `5432` | Works everywhere, including IPv4-only networks. Best default for this long-running server. |
   | **Direct connection** | `db.<REF>.supabase.co` : `5432` | Fine if your machine has IPv6. May fail on IPv4-only networks. |
   | **Transaction pooler** | `...pooler.supabase.com` : `6543` | Serverless / many short-lived connections. |

3. Copy the **URI** form. It looks like one of these:

   ```
   # Direct connection
   postgresql://postgres:[YOUR-PASSWORD]@db.abcd1234.supabase.co:5432/postgres

   # Session / transaction pooler (note the username is postgres.<REF>)
   postgresql://postgres.abcd1234:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres
   ```

---

## 3. Configure the backend

1. Open (or create) `backend/.env`. If it doesn't exist, copy the example:

   ```powershell
   cd backend
   Copy-Item .env.example .env
   ```

2. Set `DATABASE_URL` to your connection string with **two changes**:
   - Change the scheme `postgresql://` → **`postgresql+asyncpg://`**
   - Replace `[YOUR-PASSWORD]` with your real database password.

   ```
   DATABASE_URL=postgresql+asyncpg://postgres.abcd1234:your-password@aws-0-us-east-1.pooler.supabase.com:5432/postgres
   ```

   > **Password with special characters?** If your password contains `@ : / ? #`
   > or similar, URL-encode them (e.g. `@` → `%40`, `#` → `%23`). Easiest fix is
   > to reset the DB password to letters/numbers only.

3. While you're in `.env`, set a real `SECRET_KEY` (any long random string) for
   production. `.env` is already in `.gitignore`, so it won't be committed.

> ⚠️ **The `postgresql+asyncpg://` scheme is required.** A plain `postgresql://`
> URL makes SQLAlchemy reach for the `psycopg2` driver (not installed) and you'll
> get `ModuleNotFoundError: No module named 'psycopg2'`.

That's it for config. The backend automatically:
- encrypts the connection over TLS for Supabase (without strict CA verification,
  matching `sslmode=require`), and
- disables asyncpg's prepared-statement cache so the **pooler** works
  (see `backend/app/database.py`).

---

## 4. Start the backend — tables auto-create

```powershell
cd backend
./run.ps1
```

`run.ps1` notices the Supabase URL and installs the PostgreSQL driver
(`asyncpg`) for you. If you start the server some other way, install it once
yourself:

```powershell
.venv\Scripts\python.exe -m pip install -r requirements-postgres.txt
```

On startup the app runs `create_all` and creates the **`players`** table in your
Supabase database automatically — there are no migrations to run. Columns:

| Column | Meaning |
| ------ | ------- |
| `id` | account id |
| `nickname` | unique knight name |
| `password_hash` | bcrypt hash (never the raw password) |
| `level`, `exp`, `gold` | progression |
| `weapon`, `owned_weapons`, `potions` | gear/consumables |
| `cleared_raid` | highest raid difficulty cleared |
| `created_at`, `updated_at` | timestamps |

If it boots with no database errors, you're connected. Register a knight in the
game and it'll be saved to Supabase.

---

## 5. Verify & run SQL on your data

In the Supabase dashboard open the **SQL Editor** and run:

```sql
select id, nickname, level, gold, cleared_raid, weapon
from players
order by level desc;
```

You should see the account(s) you registered. Some handy examples:

```sql
-- Give a player some gold for testing
update players set gold = gold + 1000 where nickname = 'YourName';

-- Reset a stuck account back to level 1
update players
set level = 1, exp = 0, gold = 0, cleared_raid = 0,
    weapon = 'rusty_sword', owned_weapons = '["rusty_sword"]'
where nickname = 'YourName';

-- Delete a test account
delete from players where nickname = 'throwaway';
```

> Changes you make in SQL show up the next time that account loads. A player
> who is **currently connected** holds their progress in memory and flushes it
> back every few seconds, so edit accounts while they're logged out (or expect
> live changes to be overwritten by the running game).

---

## 6. Local dev without Supabase (optional)

You don't need Supabase to develop locally. If `DATABASE_URL` points at the
SQLite fallback (the default in `.env.example`), the game runs with zero setup:

```
DATABASE_URL=sqlite+aiosqlite:///./chill_knight.db
```

Switch back to your Supabase URL whenever you want to use the hosted database.

---

## Troubleshooting

| Symptom | Fix |
| ------- | --- |
| `ModuleNotFoundError: No module named 'psycopg2'` | Your URL uses `postgresql://`. Change the scheme to **`postgresql+asyncpg://`** (step 3). |
| `ModuleNotFoundError: No module named 'asyncpg'` | The PostgreSQL driver isn't installed. Run `.venv\Scripts\python.exe -m pip install -r requirements-postgres.txt` (or just use `run.ps1`, which does it). |
| `socket.gaierror` / `Name or service not known` / connection times out | You're likely on an IPv4-only network using the **direct** host. Switch to the **Session pooler** connection string (step 2). |
| `password authentication failed` | Wrong password, or special characters not URL-encoded. Reset the DB password (Settings → Database) to letters/numbers and update `.env`. |
| `CERTIFICATE_VERIFY_FAILED` / `self-signed certificate in certificate chain` | The backend already handles this (it requires TLS without strict CA verification for Supabase). If you still see it, make sure the host contains `supabase` so that path is taken, and that you didn't strip it from the URL. |
| `prepared statement "..." already exists` | You're on the **transaction pooler** without the cache fix — make sure your URL uses `postgresql+asyncpg://` (the backend disables the statement cache for Supabase URLs automatically). |
| Backend starts but no `players` table appears | Check the startup logs for a DB error — a bad `DATABASE_URL` means it silently fell back or failed before `create_all`. |
