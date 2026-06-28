# ⚔️ Chill Knight

A 2D, real-time browser game. Play as a knight, grind randomly spawning mobs in
difficulty worlds (1–50), take on raid bosses, level up (max 60), and spend gold
in the shop on weapons with unique passives.

**Now fully client-side** — there is no backend, no database, and no accounts.
The entire game (movement, combat, every weapon passive, enemies, the slime raid
boss, leveling, the shop) runs in the browser. Your progress is saved locally in
the browser via `localStorage`. Just open `index.html` and play.

| Layer    | Tech                                               |
| -------- | -------------------------------------------------- |
| Frontend | TypeScript · React · Vite · TailwindCSS · Canvas 2D |
| Sim      | Pure TypeScript, runs in the browser (`src/game/sim`) |
| Save     | `localStorage` (single-player)                     |

---

## Run it

It's a static site — build once, then it's just files you can open or host
anywhere.

```bash
cd frontend
npm install
npm run build
```

This produces `frontend/dist/`, a self-contained folder (`index.html` + an
`assets/` folder). All paths inside are **relative**, so it works no matter where
you put it:

- **Open locally:** open `dist/index.html` in a browser.
- **Embed in a website** (e.g. on a page or in an `<iframe>`): copy the contents
  of `dist/` into a folder on the site and point at its `index.html`.

> Tip for embedding in an `<iframe>`:
> `<iframe src="chill-knight/index.html" width="960" height="600"></iframe>`

### Local development

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173, hot reload
```

---

## Controls

| Action       | Keys                             |
| ------------ | -------------------------------- |
| Move         | `WASD` / Arrow keys              |
| Aim          | Mouse                            |
| Slash attack | Left-click / `J`                 |
| Parry        | `Space` / `K`                    |
| Drink potion | `H`                              |
| Menu         | `Esc` or the ☰ button (top-left) |

On touch devices, on-screen sticks and buttons appear automatically.

**Parry:** when an enemy flashes (winding up), parry to negate the hit and charge
a powered-up counter — your next slash deals bonus damage.

---

## Project layout

```
frontend/
  index.html
  src/
    App.tsx               screen flow + game-event dispatch
    api.ts                local shop / save access (no network)
    net/socket.ts         local game client — drives the simulation
    game/
      GameCanvas.tsx      input + Canvas 2D renderer
      sim/
        constants.ts      all balance tunables + shop catalog
        entities.ts       Profile / player / enemy / projectile types
        world.ts          the authoritative per-world simulation
        profile.ts        localStorage save + Player serialization
    components/           TitleScreen, Hud, Shop, Inventory, ChatPanel, ...
```

## Notes

- **Saving:** progress lives in `localStorage` under the key `ck_save`. Clearing
  the browser's site data resets the knight.
- **Multiplayer:** removed. Raids, chat, and worlds are all single-player now;
  the simulation was ported from the old server so the gameplay is unchanged.
