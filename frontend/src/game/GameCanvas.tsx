import { useEffect, useRef } from "react";
import boneSwingUrl from "../assets/Bonehead_Boneswing.png";
import boneheadUrl from "../assets/Bonehead_Normal.png";
import roundheadAttackUrl from "../assets/Roundhead_Attack_Stance.png";
import fireballUrl from "../assets/Roundhead_Fireball.png";
import grassUrl from "../assets/Grass.png";
import rockUrl from "../assets/Rock.png";
import rockSmallUrl from "../assets/Rock_Small.png";
import roundheadUrl from "../assets/Roundhead_Normal.png";
import dummyUrl from "../assets/Target_Dummy.png";
import slimeNormalUrl from "../assets/Boss/Slime_Normal.png";
import slimeJumpUrl from "../assets/Boss/Slime_Jump.png";
import slimeCrashUrl from "../assets/Boss/Slime_Crash.png";
import slimeBallUrl from "../assets/Boss/Slime_Ball.png";
import miniSlimeUrl from "../assets/Boss/Mini_Slime.png";
import tile1Url from "../assets/Tile_1.png";
import tile2Url from "../assets/Tile_2.png";
import knightUrl from "../assets/Knight/Knight_Normal.png";
import knightHandUrl from "../assets/Knight/Knight_Hand.png";
import knightLegUrl from "../assets/Knight/Knight_Leg.png";
import rustySwordUrl from "../assets/Weapon/Rusty Sword.png";
import ironSwordUrl from "../assets/Weapon/Iron Sword.png";
import curveSwordUrl from "../assets/Weapon/Curve Sword.png";
import drowsUrl from "../assets/Weapon/Drows.png";
import knifeUrl from "../assets/Weapon/Knife.png";
import longBladeUrl from "../assets/Weapon/Long Blade.png";
import scytheUrl from "../assets/Weapon/Scythe.png";
import twoStarsUrl from "../assets/Weapon/Two Stars.png";
import type { GameClient, TouchInputState } from "../net/socket";
import type { SnapEnemy, Snapshot } from "../types";

// Equipped-weapon key -> sword sprite. Weapons without dedicated art (the
// saber/frost/dragonfang/eclipse tier) fall back to the rusty sword.
export const WEAPON_SPRITE_URLS: Record<string, string> = {
  rusty_sword: rustySwordUrl,
  iron_blade: ironSwordUrl,
  curve_sword: curveSwordUrl,
  drows: drowsUrl,
  knife: knifeUrl,
  long_blade: longBladeUrl,
  scythe: scytheUrl,
  two_stars: twoStarsUrl,
};

// Render-size multiplier for the held sword sprite. The big, long-reach blades
// (the curve sword and the long blade, both with a range passive) are drawn
// noticeably larger so they read as the big swords they are.
export const WEAPON_SCALE: Record<string, number> = {
  curve_sword: 1.5,
  long_blade: 1.45,
};

const ARENA = { w: 1600, h: 1000 };

// How long a dropped gold/exp pickup takes to fly into the player.
const PICKUP_MS = 650;

// How long a Two Stars shockwave takes to expand and fade.
const SHOCKWAVE_MS = 650;

// Floating damage numbers (Terraria-style): shoot up quickly then decelerate.
const DMG_MS = 950; // total lifetime of a damage number
const DMG_RISE = 46; // px the number floats upward over its life
const DMG_CRIT_GLOW_MS = 230; // how long a crit's red glow lasts

// Practice-dummy bounce when struck (pivots on its base, top sways).
const DUMMY_BOUNCE_MS = 520;

// How long a struck enemy glows red to telegraph that it took damage.
const HIT_FLASH_MS = 200;

// ---- slime raid boss ----------------------------------------------------
const BOSS_SIZE = 132; // on-screen slime height while grounded
const MINI_SIZE = 42; // mini-slime height
const SLIME_BALL_SIZE = 26;
const SLAM_SHAKE_MS = 600; // screen shake after the slime crashes down
const SLAM_SHAKE_MAG = 18; // peak shake amplitude (px)
const SLAM_MARKER_R = 96; // landing-marker radius (px), ~the splash zone

// Raid floor tiling: the grid is sized to divide the arena evenly (so tiles
// never spill past the edges) and each tile is drawn slightly inset, leaving a
// thin "grout" gap so they read as individual tiles instead of one big sheet.
const TILE_COLS = 22;
const TILE_ROWS = 16;
const TILE_W = ARENA.w / TILE_COLS;
const TILE_H = ARENA.h / TILE_ROWS;
const TILE_GAP = 3;

interface DamageNumber {
  x: number; // world-space spawn (the struck enemy)
  y: number;
  dx: number; // small horizontal drift so stacked hits fan out
  dmg: number;
  crit: boolean;
  born: number;
  color?: string; // set for damage-over-time ticks (orange ignite, crimson bleed)
}

interface Pickup {
  kind: "gold" | "exp";
  sx: number; // world-space spawn point (enemy death + scatter)
  sy: number;
  born: number;
}

// A scattered ground decoration (grass tuft / rock), placed once per world.
interface Decor {
  kind: "grass" | "rock" | "rockSmall";
  x: number;
  y: number;
  size: number;
}

// Attack-animation phase for one enemy, driven by the `wind` (windup) flag.
type AnimPhase = "idle" | "wind" | "swing" | "recoil";
interface EnemyAnim {
  wasWind: boolean;
  phase: AnimPhase;
  start: number; // performance.now() when the current phase began
}

const WIND_MS = 380; // bonehead anticipation window (slow, small pull-back)
const SWING_MS = 440; // bonehead strike (fast, ease-out-elastic)
const RECOIL_MS = 260; // roundhead post-fire recoil duration

// Bone angle offsets relative to the enemy's facing (radians toward the target).
const BONE_REST = -1.2; // raised position as the windup begins
const BONE_WIND = -1.75; // small extra pull-back during the windup (anticipation)
const BONE_STRIKE = 1.05; // swung down/through toward the target on the strike

// ---- knight (player) animation -----------------------------------------
const KNIGHT_H = 56; // on-screen knight height in px
const COMBO_ANIM_MS = 280; // how long one combo swing visibly animates
const WALK_CYCLE = 9; // leg-swing speed (radians/second of walk phase)

// Per-player knight animation state: a walk phase that advances while moving,
// the previous render position (to detect movement), and the currently
// animating combo swing (lastCombo tracks the snapshot's `combo` to catch the
// rising edge of each new swing).
interface KnightAnim {
  walk: number;
  px: number;
  py: number;
  lastCombo: number;
  animCombo: number; // -1 idle, else 0..2
  animStart: number;
  lastCounter: boolean; // previous frame's counter flag (to catch a parry land)
  recoilStart: number; // performance.now() of the last parried-hit recoil
}

// How long the sword's backward "recoil" reads after a parried hit.
const PARRY_RECOIL_MS = 220;

// Motion smoothing: render positions ease toward the latest snapshot so the
// 20Hz server updates look smooth at 60fps. SNAP_DIST teleports (no slide) on
// big jumps like respawn or changing worlds.
const SMOOTH_TAU = 0.05; // seconds; smaller = snappier
const SNAP_DIST = 260;

// Local-player prediction: the client simulates ITS OWN knight's movement
// immediately from input (the same model the server uses), so your own
// character responds with zero network lag instead of waiting a round-trip.
// The server stays authoritative — we reconcile to it on big jumps (respawn /
// knockback) and ease back to it while standing still, so moving never
// rubber-bands. These two must match the server's constants.py.
const PLAYER_SPEED = 240; // px/s — must equal C.PLAYER_SPEED
const PLAYER_RADIUS = 18; // must equal C.PLAYER_RADIUS

// Deterministic PRNG so the grass/rock field is identical every frame (no
// shimmering) and stable across the whole session.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function genDecor(): Decor[] {
  const rng = mulberry32(0xc4117);
  const out: Decor[] = [];
  // Very sparse scatter — just a touch of texture, kept low so the field reads
  // clean rather than noisy.
  for (let i = 0; i < 20; i++) {
    out.push({
      kind: "grass",
      x: rng() * ARENA.w,
      y: rng() * ARENA.h,
      size: 20 + rng() * 16,
    });
  }
  for (let i = 0; i < 3; i++) {
    out.push({
      kind: "rock",
      x: rng() * ARENA.w,
      y: rng() * ARENA.h,
      size: 28 + rng() * 22,
    });
  }
  for (let i = 0; i < 5; i++) {
    out.push({
      kind: "rockSmall",
      x: rng() * ARENA.w,
      y: rng() * ARENA.h,
      size: 12 + rng() * 12,
    });
  }
  return out;
}

// Randomized raid floor: a fixed TILE_COLS x TILE_ROWS grid of Tile_1 / Tile_2
// chosen by a stable PRNG so the pattern is fixed for the session (no
// shimmering). The grid spans exactly the arena — no tiles outside the play
// area — so the floor reads as the bounds of the arena.
function genTileMap(): Uint8Array {
  const rng = mulberry32(0x7113);
  const map = new Uint8Array(TILE_COLS * TILE_ROWS);
  for (let i = 0; i < map.length; i++) map[i] = rng() < 0.5 ? 0 : 1;
  return map;
}

export default function GameCanvas({
  client,
  snapshotRef,
  playerId,
  inputEnabled,
  touchInput,
  isTouch,
}: {
  client: GameClient;
  snapshotRef: React.MutableRefObject<Snapshot | null>;
  playerId: number;
  inputEnabled: React.MutableRefObject<boolean>;
  // On touch devices, the on-screen sticks write here so we can predict our own
  // movement and face the aim stick instantly (mirrors the mouse/keyboard path).
  touchInput?: React.MutableRefObject<TouchInputState>;
  // When true, the device is touch-driven: skip the mouse + aim-timer wiring so
  // synthetic mouse events / the centre-relative aim never fight the sticks.
  isTouch?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouse = useRef({ x: 0, y: 0, down: false });
  const pickups = useRef<Pickup[]>([]);
  // Two Stars "star burst" shockwaves: each expands outward from where it was
  // released, then fades.
  const shockwaves = useRef<{ x: number; y: number; born: number }[]>([]);
  // Floating damage numbers, and the last-hit time per enemy (drives the dummy
  // bounce and the brief red damage-flash on living enemies).
  const damageNumbers = useRef<DamageNumber[]>([]);
  const hitTimes = useRef<Map<number, number>>(new Map());
  // Screen-shake state, kicked off when the slime boss slams into the ground.
  const shake = useRef({ mag: 0, until: 0 });

  // Sprites + the (stable) decoration field, created once.
  const sprites = useRef<Record<string, HTMLImageElement> | null>(null);
  if (!sprites.current) {
    const mk = (src: string) => {
      const img = new Image();
      img.src = src;
      return img;
    };
    sprites.current = {
      bonehead: mk(boneheadUrl),
      bone: mk(boneSwingUrl),
      roundhead: mk(roundheadUrl),
      roundheadAttack: mk(roundheadAttackUrl),
      fireball: mk(fireballUrl),
      grass: mk(grassUrl),
      rock: mk(rockUrl),
      rockSmall: mk(rockSmallUrl),
      knight: mk(knightUrl),
      hand: mk(knightHandUrl),
      leg: mk(knightLegUrl),
      sword: mk(rustySwordUrl), // fallback when a weapon has no dedicated art
      dummy: mk(dummyUrl),
      slimeNormal: mk(slimeNormalUrl),
      slimeJump: mk(slimeJumpUrl),
      slimeCrash: mk(slimeCrashUrl),
      slimeBall: mk(slimeBallUrl),
      miniSlime: mk(miniSlimeUrl),
      tile1: mk(tile1Url),
      tile2: mk(tile2Url),
    };
    // one sword sprite per weapon key, e.g. sprites["w_two_stars"]
    for (const [key, url] of Object.entries(WEAPON_SPRITE_URLS)) {
      sprites.current["w_" + key] = mk(url);
    }
  }
  // Per-enemy attack animation state, driven by the snapshot `wind` flag.
  const enemyAnim = useRef<Map<number, EnemyAnim>>(new Map());
  // Per-player knight walk/combo animation state.
  const knightAnim = useRef<Map<number, KnightAnim>>(new Map());
  // Smoothed render positions keyed by "p<id>" / "e<id>" for interpolation.
  const renderState = useRef<Map<string, { x: number; y: number; facing: number }>>(
    new Map()
  );
  // Local movement input, mirrored from what we send, used to predict our own
  // knight's position client-side. Plus the running predicted position.
  const moveInput = useRef({ up: false, down: false, left: false, right: false });
  const predict = useRef({ x: 0, y: 0, ready: false });
  const lastFrame = useRef(performance.now());
  const decor = useRef<Decor[] | null>(null);
  if (!decor.current) decor.current = genDecor();
  const tileMap = useRef<Uint8Array | null>(null);
  if (!tileMap.current) tileMap.current = genTileMap();

  // Spawn gold (yellow) + exp (green) pickups at each kill that drift to the
  // player. Driven by the authoritative "reward" event, which carries the
  // enemy's death position.
  useEffect(() => {
    const off = client.on((msg) => {
      if (msg.type !== "event" || msg.kind !== "reward") return;
      const ex = msg.x as number | undefined;
      const ey = msg.y as number | undefined;
      if (typeof ex !== "number" || typeof ey !== "number") return;
      const now = performance.now();
      const jitter = () => (Math.random() - 0.5) * 28;
      if ((msg.gold as number) > 0)
        pickups.current.push({ kind: "gold", sx: ex + jitter(), sy: ey + jitter(), born: now });
      if ((msg.exp as number) > 0)
        pickups.current.push({ kind: "exp", sx: ex + jitter(), sy: ey + jitter(), born: now });
    });
    return off;
  }, [client]);

  // Damage numbers: every landed hit reports its damage, crit flag, and the
  // struck enemy's position + id. Spawn a floating number, and (for dummies)
  // record the hit time so the dummy bounces.
  useEffect(() => {
    const off = client.on((msg) => {
      if (msg.type !== "event" || msg.kind !== "hit") return;
      const x = msg.x as number | undefined;
      const y = msg.y as number | undefined;
      if (typeof x !== "number" || typeof y !== "number") return;
      const now = performance.now();
      damageNumbers.current.push({
        x,
        y,
        dx: (Math.random() - 0.5) * 22,
        dmg: (msg.dmg as number) ?? 0,
        crit: Boolean(msg.crit),
        born: now,
      });
      if (damageNumbers.current.length > 60) damageNumbers.current.shift();
      const eid = msg.eid as number | undefined;
      if (typeof eid === "number") hitTimes.current.set(eid, now);
    });
    return off;
  }, [client]);

  // Damage-over-time ticks (burn/bleed): floating numbers tinted by their DoT
  // type (orange ignite, crimson bleed). These don't flash/bounce the enemy —
  // that's reserved for the direct-hit telegraph.
  useEffect(() => {
    const off = client.on((msg) => {
      if (msg.type !== "event" || msg.kind !== "dot") return;
      const x = msg.x as number | undefined;
      const y = msg.y as number | undefined;
      if (typeof x !== "number" || typeof y !== "number") return;
      damageNumbers.current.push({
        x,
        y,
        dx: (Math.random() - 0.5) * 22,
        dmg: (msg.dmg as number) ?? 0,
        crit: false,
        born: performance.now(),
        color: (msg.color as string) ?? "#f97316",
      });
      if (damageNumbers.current.length > 60) damageNumbers.current.shift();
    });
    return off;
  }, [client]);

  // Slime boss slam: shake the screen when the big slime crashes into the
  // ground (the sound is played by App; this is the visual partner).
  useEffect(() => {
    const off = client.on((msg) => {
      if (msg.type !== "event" || msg.kind !== "boss_slam") return;
      shake.current = {
        mag: SLAM_SHAKE_MAG,
        until: performance.now() + SLAM_SHAKE_MS,
      };
    });
    return off;
  }, [client]);

  // Two Stars: spawn an expanding star burst where the strike was released.
  useEffect(() => {
    const off = client.on((msg) => {
      if (msg.type !== "event" || msg.kind !== "shockwave") return;
      const x = msg.x as number | undefined;
      const y = msg.y as number | undefined;
      if (typeof x !== "number" || typeof y !== "number") return;
      shockwaves.current.push({ x, y, born: performance.now() });
    });
    return off;
  }, [client]);

  // ---- input ----------------------------------------------------------
  useEffect(() => {
    const keys: Record<string, boolean> = {};
    const apply = () => {
      const on = inputEnabled.current;
      const mv = {
        up: !!(on && (keys["w"] || keys["arrowup"])),
        down: !!(on && (keys["s"] || keys["arrowdown"])),
        left: !!(on && (keys["a"] || keys["arrowleft"])),
        right: !!(on && (keys["d"] || keys["arrowright"])),
      };
      // Record movement for client-side prediction, then send the full intent.
      moveInput.current = mv;
      client.setInput({
        ...mv,
        attack: !!(on && (keys["j"] || mouse.current.down)),
        parry: !!(on && (keys[" "] || keys["k"])),
      });
    };

    const down = (e: KeyboardEvent) => {
      if (!inputEnabled.current) return;
      const k = e.key.toLowerCase();
      if (k === "h") client.usePotion();
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k))
        e.preventDefault();
      keys[k] = true;
      apply();
    };
    const up = (e: KeyboardEvent) => {
      keys[e.key.toLowerCase()] = false;
      apply();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);

    // Mouse + aim wiring is desktop-only. On touch the on-screen sticks own
    // movement/aim/attack, and leaving these attached would let the centre-
    // relative aim (or synthetic mouse events) overwrite the stick input.
    const canvas = canvasRef.current!;
    let aimTimer = 0;
    const mm = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.current.x = e.clientX - r.left;
      mouse.current.y = e.clientY - r.top;
    };
    const md = () => {
      mouse.current.down = true;
      apply();
    };
    const mu = () => {
      mouse.current.down = false;
      apply();
    };
    if (!isTouch) {
      canvas.addEventListener("mousemove", mm);
      canvas.addEventListener("mousedown", md);
      window.addEventListener("mouseup", mu);

      // Aim points from the screen centre (where the local knight is drawn)
      // toward the cursor.
      aimTimer = window.setInterval(() => {
        const ax = mouse.current.x - canvas.width / 2;
        const ay = mouse.current.y - canvas.height / 2;
        if (ax || ay) client.setInput({ aimX: ax, aimY: ay });
      }, 50);
    }

    return () => {
      window.clearInterval(aimTimer);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      canvas.removeEventListener("mousemove", mm);
      canvas.removeEventListener("mousedown", md);
      window.removeEventListener("mouseup", mu);
    };
  }, [client, inputEnabled, isTouch]);

  // ---- render loop ----------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const sp = sprites.current!;
    let raf = 0;

    const resize = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const snap = snapshotRef.current;
      const W = canvas.width;
      const H = canvas.height;
      const now = performance.now();

      // frame delta -> exponential smoothing factor (snapshots are only 20Hz)
      const dt = Math.min(0.1, (now - lastFrame.current) / 1000);
      lastFrame.current = now;
      const k = 1 - Math.exp(-dt / SMOOTH_TAU);

      // paper background
      ctx.fillStyle = "#f3f3f4";
      ctx.fillRect(0, 0, W, H);

      // smoothing pre-pass: ease each entity's render position toward the latest
      // snapshot so movement looks smooth at 60fps instead of stepping at 20fps.
      const liveKeys = new Set<string>();
      if (snap) {
        for (const p of snap.players) {
          liveKeys.add("p" + p.id);
          if (p.id === playerId) {
            // Our own knight: predict locally for instant response instead of
            // chasing the network-delayed server position.
            const pr = predict.current;
            const mv = moveInput.current;
            const ti = touchInput?.current;
            const inLeft = mv.left || !!ti?.left;
            const inRight = mv.right || !!ti?.right;
            const inUp = mv.up || !!ti?.up;
            const inDown = mv.down || !!ti?.down;
            const mdx = (inRight ? 1 : 0) - (inLeft ? 1 : 0);
            const mdy = (inDown ? 1 : 0) - (inUp ? 1 : 0);
            const moving = (mdx !== 0 || mdy !== 0) && !p.dead;
            if (!pr.ready || p.dead) {
              // (Re)sync to the authoritative position (first frame, respawn).
              pr.x = p.x;
              pr.y = p.y;
              pr.ready = true;
            } else {
              if (moving) {
                const m = Math.hypot(mdx, mdy);
                pr.x += (mdx / m) * PLAYER_SPEED * dt;
                pr.y += (mdy / m) * PLAYER_SPEED * dt;
                pr.x = Math.max(PLAYER_RADIUS, Math.min(ARENA.w - PLAYER_RADIUS, pr.x));
                pr.y = Math.max(PLAYER_RADIUS, Math.min(ARENA.h - PLAYER_RADIUS, pr.y));
              }
              const ex = p.x - pr.x;
              const ey = p.y - pr.y;
              if (ex * ex + ey * ey > SNAP_DIST * SNAP_DIST) {
                pr.x = p.x; // big divergence (knockback / teleport) -> snap
                pr.y = p.y;
              } else if (!moving) {
                pr.x += ex * k; // settle to the server only while standing still
                pr.y += ey * k;
              }
            }
            // Aim instantly (no round-trip for facing): the touch aim stick
            // while it's held, otherwise the cursor, otherwise the server's last.
            let facing: number;
            if (ti?.aiming) {
              facing = Math.atan2(ti.aimY, ti.aimX);
            } else {
              const aimed = mouse.current.x !== 0 || mouse.current.y !== 0;
              facing = aimed
                ? Math.atan2(mouse.current.y - H / 2, mouse.current.x - W / 2)
                : p.facing;
            }
            renderState.current.set("p" + p.id, { x: pr.x, y: pr.y, facing });
            continue;
          }
          smoothPos(renderState.current, "p" + p.id, p.x, p.y, p.facing, k);
        }
        for (const e of snap.enemies) {
          liveKeys.add("e" + e.id);
          smoothPos(renderState.current, "e" + e.id, e.x, e.y, e.facing, k);
        }
        if (renderState.current.size > liveKeys.size) {
          for (const key of renderState.current.keys())
            if (!liveKeys.has(key)) renderState.current.delete(key);
        }
      }

      const meSm = snap ? renderState.current.get("p" + playerId) : undefined;
      const camX = meSm ? meSm.x : ARENA.w / 2;
      const camY = meSm ? meSm.y : ARENA.h / 2;
      // screen shake (slime slam): random jitter that decays over its lifetime
      let shakeX = 0;
      let shakeY = 0;
      if (shake.current.until > now) {
        const k = (shake.current.until - now) / SLAM_SHAKE_MS;
        const mag = shake.current.mag * k * k; // ease-out decay
        shakeX = (Math.random() * 2 - 1) * mag;
        shakeY = (Math.random() * 2 - 1) * mag;
      }
      const sx = (wx: number) => wx - camX + W / 2 + shakeX;
      const sy = (wy: number) => wy - camY + H / 2 + shakeY;

      if (snap?.mode === "raid") {
        // raid lobby / arena floor: a randomized Tile_1 / Tile_2 grid that spans
        // exactly the arena. Columns/rows are clamped to the grid so no tiles are
        // ever drawn outside the play area; each tile is inset by TILE_GAP so a
        // thin grout line separates them.
        const map = tileMap.current!;
        const c0 = Math.max(0, Math.floor((camX - W / 2) / TILE_W));
        const c1 = Math.min(TILE_COLS - 1, Math.floor((camX + W / 2) / TILE_W));
        const r0 = Math.max(0, Math.floor((camY - H / 2) / TILE_H));
        const r1 = Math.min(TILE_ROWS - 1, Math.floor((camY + H / 2) / TILE_H));
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            const img = map[r * TILE_COLS + c] ? sp.tile2 : sp.tile1;
            if (!img.complete || img.naturalWidth === 0) continue;
            ctx.drawImage(
              img,
              sx(c * TILE_W) + TILE_GAP / 2,
              sy(r * TILE_H) + TILE_GAP / 2,
              TILE_W - TILE_GAP,
              TILE_H - TILE_GAP
            );
          }
        }
      } else {
        // overworld ground decorations (grass + rocks), only those near the viewport
        for (const d of decor.current!) {
          const dx = sx(d.x);
          const dy = sy(d.y);
          if (dx < -60 || dx > W + 60 || dy < -60 || dy > H + 60) continue;
          const img =
            d.kind === "grass" ? sp.grass : d.kind === "rock" ? sp.rock : sp.rockSmall;
          drawSprite(ctx, img, dx, dy, d.size);
        }
      }

      if (!snap) {
        ctx.fillStyle = "#6b7280";
        ctx.font = "16px 'KyivType Serif', serif";
        ctx.textAlign = "center";
        ctx.fillText("Loading world…", W / 2, H / 2);
        raf = requestAnimationFrame(draw);
        return;
      }

      // enemies (with wind-up / strike attack animations)
      const liveIds = new Set<number>();
      for (const e of snap.enemies) {
        liveIds.add(e.id);
        const sm = renderState.current.get("e" + e.id)!;
        const ex = sx(sm.x);
        const ey = sy(sm.y);

        // practice dummy: an inert target that bounces when struck. It pivots on
        // its base so the top sways side-to-side (like a real punching dummy),
        // the sway decaying after each hit.
        if (e.kind === "dummy") {
          const size = 74;
          const img = sp.dummy;
          let sway = 0;
          const hit = hitTimes.current.get(e.id);
          if (hit !== undefined) {
            const bt = (now - hit) / DUMMY_BOUNCE_MS;
            if (bt < 1) sway = Math.sin(bt * Math.PI * 3) * (1 - bt) * 0.38;
            else hitTimes.current.delete(e.id);
          }
          const footY = ey + size * 0.42;
          shadow(ctx, ex, footY, size * 0.3);
          if (img.complete && img.naturalWidth > 0) {
            const ar = img.naturalWidth / img.naturalHeight;
            const h = size;
            const w = size * ar;
            ctx.save();
            ctx.translate(ex, footY);
            ctx.rotate(sway); // pivot on the base
            ctx.drawImage(img, -w / 2, -h, w, h);
            ctx.restore();
          }
          continue;
        }

        // slime raid boss: its own sprite set + jump-slam telegraph
        if (e.kind === "boss") {
          drawSlimeBoss(ctx, sp, e, ex, ey, sx, sy, now, hitTimes.current);
          continue;
        }

        // mini-slime add: a small chasing blob that wobbles as it moves
        if (e.kind === "minislime") {
          const ht2 = hitTimes.current.get(e.id);
          let flash2 = 0;
          if (ht2 !== undefined) {
            flash2 = Math.max(0, 1 - (now - ht2) / HIT_FLASH_MS);
            if (flash2 <= 0) hitTimes.current.delete(e.id);
          }
          const wob = 1 + Math.sin(now / 130 + e.id) * 0.08;
          const foot = ey + MINI_SIZE * 0.42;
          const mflip = Math.cos(sm.facing) < 0;
          shadow(ctx, ex, foot, MINI_SIZE * 0.36);
          drawBlob(ctx, sp.miniSlime, ex, foot, MINI_SIZE, 1 / wob, wob, mflip, flash2);
          bar(
            ctx,
            ex - MINI_SIZE * 0.36,
            foot - MINI_SIZE - 4,
            MINI_SIZE * 0.72,
            3,
            e.hp / e.maxHp,
            "#a855f7"
          );
          continue;
        }

        // only the basic skull-headed mobs (melee bonehead / ranged roundhead)
        // reach here — dummies, the slime boss and mini-slimes are drawn above.
        const facing = sm.facing;
        const flip = Math.cos(facing) < 0; // face the target (left vs right)
        const isRanged = e.kind === "ranged";
        const size = 46;

        // brief red glow when struck — the visual partner of the knockback,
        // telegraphing that the enemy just took a hit.
        const ht = hitTimes.current.get(e.id);
        let flash = 0;
        if (ht !== undefined) {
          flash = Math.max(0, 1 - (now - ht) / HIT_FLASH_MS);
          if (flash <= 0) hitTimes.current.delete(e.id);
        }

        // advance this enemy's attack-animation phase off the wind edges
        let a = enemyAnim.current.get(e.id);
        if (!a) {
          a = { wasWind: false, phase: "idle", start: now };
          enemyAnim.current.set(e.id, a);
        }
        if (e.wind && !a.wasWind) {
          a.phase = "wind"; // windup started (anticipation)
          a.start = now;
        } else if (!e.wind && a.wasWind) {
          a.phase = isRanged ? "recoil" : "swing"; // strike happened
          a.start = now;
        }
        a.wasWind = e.wind;
        if (a.phase === "swing" && now - a.start > SWING_MS) a.phase = "idle";
        if (a.phase === "recoil" && now - a.start > RECOIL_MS) a.phase = "idle";

        if (isRanged) {
          // recoil shoves the body back along -facing right after firing
          const rt = a.phase === "recoil" ? clamp01((now - a.start) / RECOIL_MS) : 1;
          const recoil = a.phase === "recoil" ? (1 - rt) * 9 : 0;
          const bx = ex - Math.cos(facing) * recoil;
          const by = ey - Math.sin(facing) * recoil;
          shadow(ctx, ex, ey + size * 0.32, size * 0.42);
          // mouth open while winding up and through the recoil
          const mouthOpen = e.wind || a.phase === "recoil";
          drawSprite(ctx, mouthOpen ? sp.roundheadAttack : sp.roundhead, bx, by, size, flip, flash);
          bar(ctx, bx - size * 0.4, by - size * 0.55, size * 0.8, 4, e.hp / e.maxHp, "#dc2626");
        } else {
          shadow(ctx, ex, ey + size * 0.32, size * 0.42);
          drawSprite(ctx, sp.bonehead, ex, ey, size, flip, flash);
          // bone: a slow, small pull-back (anticipation), then a fast elastic
          // strike. Offsets are relative to `facing` so the bone tracks the target.
          let off: number | null = null;
          if (a.phase === "wind") {
            const t = clamp01((now - a.start) / WIND_MS);
            off = lerp(BONE_REST, BONE_WIND, easeInOut(t)); // slow small cock-back
          } else if (a.phase === "swing") {
            const t = clamp01((now - a.start) / SWING_MS);
            off = lerp(BONE_WIND, BONE_STRIKE, easeOutElastic(t)); // fast strike
          }
          if (off !== null) {
            const ang = facing + off;
            const arm = size * 0.5;
            const bxp = ex + Math.cos(ang) * arm;
            const byp = ey + Math.sin(ang) * arm;
            // +π/4 cancels the bone sprite's baked diagonal so it points outward
            drawRotatedSprite(ctx, sp.bone, bxp, byp, ang + Math.PI / 4, size * 0.7);
          }
          bar(ctx, ex - size * 0.4, ey - size * 0.55, size * 0.8, 4, e.hp / e.maxHp, "#dc2626");
        }
      }
      // forget animation state for enemies that have died/despawned
      if (enemyAnim.current.size > liveIds.size) {
        for (const id of enemyAnim.current.keys())
          if (!liveIds.has(id)) enemyAnim.current.delete(id);
      }

      // projectiles (roundhead fireballs) — the sprite faces right by default,
      // so rotating by the travel angle `a` makes it point where it's flying.
      for (const pr of snap.projectiles) {
        const px = sx(pr.x);
        const py = sy(pr.y);
        if (sp.fireball.complete && sp.fireball.naturalWidth > 0) {
          drawRotatedSprite(ctx, sp.fireball, px, py, pr.a, 26);
        } else {
          ctx.fillStyle = "#f97316";
          ctx.beginPath();
          ctx.arc(px, py, 7, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // slime balls: droplets the boss flings on a slam, arcing out to where
      // they'll sprout into mini-slimes (their y already carries the arc).
      if (snap.slimeBalls) {
        for (const sb of snap.slimeBalls) {
          const bx = sx(sb.x);
          const by = sy(sb.y);
          shadow(ctx, bx, by + SLIME_BALL_SIZE * 0.5, SLIME_BALL_SIZE * 0.3);
          drawSprite(ctx, sp.slimeBall, bx, by, SLIME_BALL_SIZE);
        }
      }

      // players (local knight + allies), drawn from the layered Knight sprite.
      const livePlayerIds = new Set<number>();
      for (const p of snap.players) {
        livePlayerIds.add(p.id);
        const sm = renderState.current.get("p" + p.id)!;
        const px = sx(sm.x);
        const py = sy(sm.y);
        const isMe = p.id === playerId;

        // advance this knight's walk + combo animation state
        let ka = knightAnim.current.get(p.id);
        if (!ka) {
          ka = {
            walk: 0, px: sm.x, py: sm.y, lastCombo: -1, animCombo: -1,
            animStart: now, lastCounter: false, recoilStart: -1e9,
          };
          knightAnim.current.set(p.id, ka);
        }
        // A successful parry flips `counter` true the moment a hit is absorbed —
        // catch that rising edge to kick off the sword's backward recoil.
        if (p.counter && !ka.lastCounter) ka.recoilStart = now;
        ka.lastCounter = p.counter;
        const recoilT = clamp01((now - ka.recoilStart) / PARRY_RECOIL_MS);
        const moved = Math.hypot(sm.x - ka.px, sm.y - ka.py);
        ka.px = sm.x;
        ka.py = sm.y;
        const moving = moved > 0.4; // ~>24px/s at 60fps
        if (moving) ka.walk += dt * WALK_CYCLE;
        // catch the rising edge of each new combo swing (index changes per swing)
        if (p.combo >= 0 && p.combo !== ka.lastCombo) {
          ka.animCombo = p.combo;
          ka.animStart = now;
        }
        ka.lastCombo = p.combo;
        const comboT = ka.animCombo >= 0 ? (now - ka.animStart) / COMBO_ANIM_MS : 1;
        const swing = comboT < 1 ? ka.animCombo : -1;

        if (p.dead) {
          ctx.fillStyle = "#6b7280";
          ctx.font = "20px 'KyivType Serif', serif";
          ctx.textAlign = "center";
          ctx.fillText("💀", px, py + 6);
        } else {
          drawKnight(ctx, sp, px, py, sm.facing, isMe, {
            moving,
            walk: ka.walk,
            swing,
            swingT: clamp01(comboT),
            parry: p.parry,
            counter: p.counter,
            weapon: p.weapon,
            recoilT: recoilT < 1 ? recoilT : -1,
          });
        }
        // name + level + hp
        ctx.fillStyle = "#111";
        ctx.font = "bold 12px 'KyivType Serif', serif";
        ctx.textAlign = "center";
        ctx.fillText(`${p.name} · L${p.lvl}`, px, py - 30);
        bar(ctx, px - 22, py - 26, 44, 5, p.hp / p.maxHp, "#4ade80");
        // chat bubble
        if (p.chat) {
          ctx.font = "12px 'KyivType Serif', serif";
          const w = Math.min(220, ctx.measureText(p.chat).width + 18);
          ctx.fillStyle = "#ffffff";
          ctx.strokeStyle = "#111";
          ctx.lineWidth = 1;
          roundRect(ctx, px - w / 2, py - 62, w, 22, 6);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = "#111";
          ctx.fillText(p.chat, px, py - 47);
        }
      }
      // forget walk/combo state for players who left this world
      if (knightAnim.current.size > livePlayerIds.size) {
        for (const id of knightAnim.current.keys())
          if (!livePlayerIds.has(id)) knightAnim.current.delete(id);
      }

      // gold/exp pickups: drop at the kill site, then pull to the player.
      if (pickups.current.length) {
        const tx = camX;
        const ty = camY;
        pickups.current = pickups.current.filter((pk) => now - pk.born < PICKUP_MS);
        for (const pk of pickups.current) {
          const t = (now - pk.born) / PICKUP_MS;
          const ease = t * t; // accelerate toward the player
          const wx = pk.sx + (tx - pk.sx) * ease;
          const wy = pk.sy + (ty - pk.sy) * ease;
          ctx.fillStyle = pk.kind === "gold" ? "#d97706" : "#16a34a";
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(sx(wx), sy(wy), 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }

      // Two Stars: expanding star-shaped shockwaves released by a charged strike.
      if (shockwaves.current.length) {
        shockwaves.current = shockwaves.current.filter((s) => now - s.born < SHOCKWAVE_MS);
        for (const s of shockwaves.current) {
          const t = (now - s.born) / SHOCKWAVE_MS;
          const radius = 60 + t * 900; // expand outward across the arena
          ctx.save();
          ctx.globalAlpha = (1 - t) * 0.8;
          ctx.strokeStyle = "#7c3aed";
          ctx.lineWidth = 3;
          drawStar(ctx, sx(s.x), sy(s.y), radius, radius * 0.5, 5);
          ctx.stroke();
          ctx.restore();
        }
      }

      // floating damage numbers (Terraria-style): shoot up fast, then slow.
      if (damageNumbers.current.length) {
        damageNumbers.current = damageNumbers.current.filter(
          (d) => now - d.born < DMG_MS
        );
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        for (const dn of damageNumbers.current) {
          const t = (now - dn.born) / DMG_MS;
          // ease-out rise: quick off the enemy, decelerating as it climbs
          const rise = (1 - Math.pow(1 - t, 2.4)) * DMG_RISE;
          const px = sx(dn.x + dn.dx);
          const py = sy(dn.y) - 26 - rise;
          // fade out over the last third of the life
          const alpha = t > 0.66 ? Math.max(0, (1 - t) / 0.34) : 1;
          // crits pop a touch bigger with a brief settle
          const pop = dn.crit ? 1 + Math.max(0, 1 - t * 6) * 0.5 : 1;
          const fontPx = (dn.crit ? 26 : dn.color ? 15 : 18) * pop;
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.font = `bold ${fontPx}px 'KyivType Serif', serif`;
          const text = String(dn.dmg);
          if (dn.color) {
            // damage-over-time tick: tinted by its type (orange ignite / crimson
            // bleed) with a dark outline so it stays legible on the paper floor.
            ctx.lineWidth = 3;
            ctx.strokeStyle = "#1a1a1a";
            ctx.strokeText(text, px, py);
            ctx.fillStyle = dn.color;
            ctx.fillText(text, px, py);
          } else if (dn.crit) {
            // red outline + a short-lived red glow so crits really pop
            const glow = Math.max(0, 1 - (now - dn.born) / DMG_CRIT_GLOW_MS);
            ctx.shadowColor = `rgba(220,38,38,${0.9 * glow})`;
            ctx.shadowBlur = 4 + 20 * glow;
            ctx.lineWidth = 4;
            ctx.strokeStyle = "#dc2626";
            ctx.strokeText(text, px, py);
            ctx.shadowBlur = 0;
            ctx.fillStyle = glow > 0.05 ? "#ffe2e2" : "#ffffff";
            ctx.fillText(text, px, py);
          } else {
            ctx.lineWidth = 3.5;
            ctx.strokeStyle = "#111111";
            ctx.strokeText(text, px, py);
            ctx.fillStyle = "#ffffff";
            ctx.fillText(text, px, py);
          }
          ctx.restore();
        }
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [playerId, snapshotRef]);

  return <canvas ref={canvasRef} className="h-full w-full touch-none select-none" />;
}

// A red-tinted copy of each sprite, built lazily and cached, used for the
// damage flash. Tinting via an offscreen canvas keeps the red confined to the
// sprite's opaque pixels (a plain rect fill would bleed past the silhouette).
const redTintCache = new Map<HTMLImageElement, HTMLCanvasElement>();
function redTint(img: HTMLImageElement): HTMLCanvasElement | null {
  let c = redTintCache.get(img);
  if (!c) {
    if (!img.complete || img.naturalWidth === 0) return null;
    c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const cx = c.getContext("2d")!;
    cx.drawImage(img, 0, 0);
    cx.globalCompositeOperation = "source-atop";
    cx.fillStyle = "#ff2a2a";
    cx.fillRect(0, 0, c.width, c.height);
    redTintCache.set(img, c);
  }
  return c;
}

// Draw an image centered at (x, y), scaled to fit within `size` while keeping
// aspect ratio. Falls back to nothing if the image hasn't loaded yet. When
// `flash` (0..1) is set, overlays a red tint + glow so the sprite reads as
// "just took damage".
function drawSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  size: number,
  flipX = false,
  flash = 0
) {
  if (!img.complete || img.naturalWidth === 0) return;
  const ar = img.naturalWidth / img.naturalHeight;
  let w = size;
  let h = size;
  if (ar >= 1) h = size / ar;
  else w = size * ar;
  ctx.save();
  ctx.translate(x, y);
  if (flipX) ctx.scale(-1, 1);
  if (flash > 0) {
    ctx.shadowColor = `rgba(255,40,40,${0.85 * flash})`;
    ctx.shadowBlur = 14 * flash;
  }
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  if (flash > 0) {
    ctx.shadowBlur = 0;
    const tint = redTint(img);
    if (tint) {
      ctx.globalAlpha = 0.6 * flash;
      ctx.drawImage(tint, -w / 2, -h / 2, w, h);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

// Like drawSprite, but rotates the image around its center by `angle`.
function drawRotatedSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  angle: number,
  size: number
) {
  if (!img.complete || img.naturalWidth === 0) return;
  const ar = img.naturalWidth / img.naturalHeight;
  let w = size;
  let h = size;
  if (ar >= 1) h = size / ar;
  else w = size * ar;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

// Draw a "blob" sprite anchored at its base (footY) with independent X/Y scale,
// so slimes can squash/stretch toward the ground. `height` is the unscaled
// on-screen height; the width follows the sprite's aspect ratio.
function drawBlob(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  footY: number,
  height: number,
  sxk: number,
  syk: number,
  flip: boolean,
  flash: number
) {
  if (!img.complete || img.naturalWidth === 0) return;
  const ar = img.naturalWidth / img.naturalHeight;
  const h = height;
  const w = height * ar;
  ctx.save();
  ctx.translate(x, footY);
  ctx.scale((flip ? -1 : 1) * sxk, syk); // scale about the base
  if (flash > 0) {
    ctx.shadowColor = `rgba(255,40,40,${0.85 * flash})`;
    ctx.shadowBlur = 16 * flash;
  }
  ctx.drawImage(img, -w / 2, -h, w, h);
  if (flash > 0) {
    ctx.shadowBlur = 0;
    const tint = redTint(img);
    if (tint) {
      ctx.globalAlpha = 0.6 * flash;
      ctx.drawImage(tint, -w / 2, -h, w, h);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

// The slime boss's red landing telegraph: a flattened danger ring with a
// crosshair, drawn at the spot it's about to crash onto.
function drawTargetMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  now: number,
  blinking: boolean
) {
  const pulse = 0.6 + 0.4 * Math.sin(now / 120);
  const alpha = blinking ? 0.95 : 0.45 + 0.35 * pulse;
  const r = SLAM_MARKER_R;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 3;
  ctx.strokeStyle = `rgba(220,38,38,${alpha})`;
  ctx.fillStyle = `rgba(220,38,38,${blinking ? 0.22 : 0.1})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.58, r * 0.29, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.lineTo(r, 0);
  ctx.moveTo(0, -r * 0.5);
  ctx.lineTo(0, r * 0.5);
  ctx.stroke();
  ctx.restore();
}

// Render the slime boss for its current phase: idle wobble on the ground, a
// squash-and-leap that flies off the top of the screen, a plummet back down
// onto the locked marker, and a splattered crash. (Sounds + screen shake are
// driven by the server's boss_* events.)
function drawSlimeBoss(
  ctx: CanvasRenderingContext2D,
  sp: Record<string, HTMLImageElement>,
  e: SnapEnemy,
  ex: number,
  ey: number,
  sx: (n: number) => number,
  sy: (n: number) => number,
  now: number,
  hitTimes: Map<number, number>
) {
  const phase = e.phase ?? "ground";
  const pf = e.pf ?? 0;
  const flip = Math.cos(e.facing) < 0;
  const H = BOSS_SIZE;

  // hit flash while the slime is vulnerable (grounded / crashing)
  const ht = hitTimes.get(e.id);
  let flash = 0;
  if (ht !== undefined) {
    flash = Math.max(0, 1 - (now - ht) / HIT_FLASH_MS);
    if (flash <= 0) hitTimes.delete(e.id);
  }

  // landing marker (screen space) while the slime is airborne / dropping
  const mx = sx(e.tx ?? 0);
  const my = sy(e.ty ?? 0);
  if (phase === "air" || phase === "falling") {
    const blinking = e.blink ?? false;
    const on = !blinking || Math.floor(now / 110) % 2 === 0; // flash while blinking
    if (on) drawTargetMarker(ctx, mx, my, now, blinking);
  }

  if (phase === "ground") {
    const wob = 1 + Math.sin(now / 220 + e.id) * 0.04;
    const foot = ey + H * 0.42;
    shadow(ctx, ex, foot, H * 0.44);
    drawBlob(ctx, sp.slimeNormal, ex, foot, H, 1 / wob, wob, flip, flash);
  } else if (phase === "anticipate") {
    const squish = Math.sin(pf * Math.PI); // 0 -> 1 -> 0 over the wind-up
    const syk = 1 - 0.34 * squish;
    const sxk = 1 + 0.28 * squish;
    const foot = ey + H * 0.42;
    shadow(ctx, ex, foot, H * 0.44 * sxk);
    drawBlob(ctx, sp.slimeJump, ex, foot, H, sxk, syk, flip, flash);
  } else if (phase === "air") {
    // leap up and off the top of the screen over the first slice of the phase
    if (pf < 0.4) {
      const u = pf / 0.4;
      const foot = ey + H * 0.42 - u * (ey + H * 8);
      drawBlob(ctx, sp.slimeJump, ex, foot, H, 1 - u * 0.18, 1 + u * 0.5, flip, 0);
    }
    // otherwise the slime is out of view; only the marker remains
  } else if (phase === "falling") {
    // plummet from above the screen down onto the locked spot
    const foot = my + H * 0.42 - (1 - pf) * (my + H * 8);
    shadow(ctx, mx, my + H * 0.42, H * 0.44 * (0.4 + 0.6 * pf));
    drawBlob(ctx, sp.slimeJump, mx, foot, H, 0.82, 1.32, flip, 0);
  } else if (phase === "crash") {
    // splattered flat, springing back over the recovery window
    const settle = Math.sin(Math.min(1, pf) * Math.PI);
    const syk = 0.68 + 0.32 * (1 - settle);
    const sxk = 1.28 - 0.28 * (1 - settle);
    const foot = my + H * 0.42;
    shadow(ctx, mx, foot, H * 0.5);
    drawBlob(ctx, sp.slimeCrash, mx, foot, H, sxk, syk, flip, flash);
  }
}

// Trace an N-point star path (caller sets stroke/fill style and paints it).
function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  points: number
) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i * Math.PI) / points - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOut = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
// Overshoots then settles — gives the strike a snappy, elastic feel.
function easeOutElastic(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}

// Interpolate between two angles along the shortest arc.
function angleLerp(a: number, b: number, t: number): number {
  let d = b - a;
  d = (((d + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return a + d * t;
}

// Ease a render position toward its snapshot target (or snap on big jumps).
function smoothPos(
  map: Map<string, { x: number; y: number; facing: number }>,
  key: string,
  tx: number,
  ty: number,
  tFacing: number,
  k: number
) {
  let r = map.get(key);
  if (!r) {
    r = { x: tx, y: ty, facing: tFacing };
    map.set(key, r);
    return r;
  }
  const dx = tx - r.x;
  const dy = ty - r.y;
  if (dx * dx + dy * dy > SNAP_DIST * SNAP_DIST) {
    r.x = tx;
    r.y = ty;
    r.facing = tFacing;
    return r;
  }
  r.x += dx * k;
  r.y += dy * k;
  r.facing = angleLerp(r.facing, tFacing, k);
  return r;
}

// Soft circular shadow beneath a sprite.
function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.fillStyle = "rgba(0,0,0,0.13)";
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
}

interface KnightDraw {
  moving: boolean;
  walk: number; // accumulated walk phase
  swing: number; // -1 idle, else combo index 0..2 currently animating
  swingT: number; // 0..1 progress through the current swing
  parry: boolean;
  counter: boolean;
  weapon: string; // equipped weapon key (selects the sword sprite)
  recoilT: number; // 0..1 through a parried-hit recoil, -1 when not recoiling
}

// Draw the knight from layered sprites: the body (with a little walk bob +
// stepping legs), and — while attacking — a hand-held sword swung through the
// 3-hit combo (down→up, up→down, forward thrust). `facing` only decides which
// way the knight looks (left/right); the swing happens on the facing side.
function drawKnight(
  ctx: CanvasRenderingContext2D,
  sp: Record<string, HTMLImageElement>,
  x: number,
  y: number,
  facing: number,
  isMe: boolean,
  o: KnightDraw
) {
  const flip = Math.cos(facing) < 0; // facing left
  const dir = flip ? -1 : 1; // forward x-direction on screen
  const H = KNIGHT_H;

  // walk: gentle vertical bob + alternating leg swing while moving
  const step = o.moving ? Math.sin(o.walk) : 0;
  const bob = o.moving ? Math.abs(Math.sin(o.walk)) * 3 : 0;
  const by = y - bob;

  shadow(ctx, x, y + H * 0.52, H * 0.34);

  // legs (behind the body): two stubby legs poking out below the body so they
  // read clearly, stepping opposite each other while walking.
  const legY = by + H * 0.47;
  const legDX = H * 0.08;
  const legSize = H * 0.25;
  drawSprite(ctx, sp.leg, x - legDX, legY + step * 3, legSize);
  drawSprite(ctx, sp.leg, x + legDX, legY - step * 3, legSize);

  if (o.counter) {
    ctx.shadowColor = "#22c55e";
    ctx.shadowBlur = 16;
  }
  // body (tint allies slightly so the local knight reads as "me")
  if (!isMe) ctx.globalAlpha = 0.85;
  drawSprite(ctx, sp.knight, x, by, H, flip);
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  // pick the equipped weapon's sprite (rusty sword as the fallback)
  const swordSprite = sp["w_" + o.weapon] ?? sp.sword;
  // big-sword weapons render their blade larger (see WEAPON_SCALE)
  const wscale = WEAPON_SCALE[o.weapon] ?? 1;

  // sword arm during an attack swing. The pivot sits at the knight's shoulder
  // (out to the facing side and below the head), and the swings stay fairly
  // level so the hand never rides up over the helmet.
  if (o.swing >= 0) {
    const pivotX = x + dir * H * 0.2;
    const pivotY = by + H * 0.1;
    const arm = H * 1.58; // reach: larger = sword swings further from the body

    let theta: number; // screen-space angle of the sword from the pivot
    let lunge = 0;
    // SWING_HI/LO bound the sweep; wider gap = more dramatic arc.
    if (o.swing === 0) {
      // down → up
      theta = lerp(1.15, -1.0, easeOut(o.swingT));
    } else if (o.swing === 1) {
      // up → down
      theta = lerp(-1.0, 1.15, easeOut(o.swingT));
    } else {
      // forward thrust — sword stays level, the arm lunges out and back
      theta = -0.05;
      lunge = Math.sin(o.swingT * Math.PI) * H * 0.5;
    }
    // mirror the vertical-axis swing when facing left
    const screenTheta = flip ? Math.PI - theta : theta;
    const cos = Math.cos(screenTheta);
    const sin = Math.sin(screenTheta);
    // the gripping hand sits at the shoulder (this radius is the arm reach)
    const handR = arm * 0.3 + lunge;
    const hx = pivotX + cos * handR;
    const hy = pivotY + sin * handR;
    // the sword is held IN the hand: offset its centre just past the hand so the
    // grip lands on the hand and the blade extends away from it.
    const swordSize = H * 1.15 * wscale;
    const cx = hx + cos * (swordSize * 0.38);
    const cy = hy + sin * (swordSize * 0.38);

    // a faint slash arc that hugs the blade (not way out past it)
    ctx.strokeStyle = "rgba(17,17,17,0.35)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, handR + swordSize * 0.45, screenTheta - 0.5, screenTheta + 0.5);
    ctx.stroke();

    // sword sprite points up by default → +π/2 aligns it with screenTheta
    drawRotatedSprite(ctx, swordSprite, cx, cy, screenTheta + Math.PI / 2, swordSize);
    drawSprite(ctx, sp.hand, hx, hy, H * 0.24);
  }

  // parry: a defending stance — the sword is held upright in front of the
  // knight, angled slightly toward the facing side. When a hit is parried it
  // recoils backward briefly (recoilT), as if absorbing the blow. The stance is
  // also held through the tail of the recoil so the flourish stays visible even
  // after a normal parry's window has closed.
  if ((o.parry || o.recoilT >= 0) && o.swing < 0) {
    // 0→1→0 bump so the recoil snaps back then settles
    const recoil = o.recoilT >= 0 ? Math.sin(o.recoilT * Math.PI) : 0;
    // guard angle (screen space): pointing up, tilted forward; recoil tips it back
    const theta = -Math.PI / 2 + dir * 0.32 - dir * recoil * 0.7;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    // hand held out front; the recoil shoves the whole guard backward a touch
    const hx = x + dir * H * 0.3 - dir * recoil * H * 0.18;
    const hy = by + H * 0.06;
    const swordSize = H * 1.05 * wscale;
    const cx = hx + cos * swordSize * 0.34;
    const cy = hy + sin * swordSize * 0.34;

    // faint guard ring (the existing parry tell)
    ctx.strokeStyle = "#16a34a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, by, H * 0.5, 0, Math.PI * 2);
    ctx.stroke();

    drawRotatedSprite(ctx, swordSprite, cx, cy, theta + Math.PI / 2, swordSize);
    drawSprite(ctx, sp.hand, hx, hy, H * 0.24);
  }
}

function bar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  pct: number,
  color: string
) {
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, pct)), h);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
