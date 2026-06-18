import { useEffect, useRef } from "react";
import boneSwingUrl from "../assets/Bonehead_Boneswing.png";
import boneheadUrl from "../assets/Bonehead_Normal.png";
import roundheadAttackUrl from "../assets/Roundhead_Attack_Stance.png";
import fireballUrl from "../assets/Roundhead_Fireball.png";
import grassUrl from "../assets/Grass.png";
import rockUrl from "../assets/Rock.png";
import rockSmallUrl from "../assets/Rock_Small.png";
import roundheadUrl from "../assets/Roundhead_Normal.png";
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
import type { GameClient } from "../net/socket";
import type { Snapshot } from "../types";

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

const ARENA = { w: 1600, h: 1000 };

// How long a dropped gold/exp pickup takes to fly into the player.
const PICKUP_MS = 650;

// How long a Two Stars shockwave takes to expand and fade.
const SHOCKWAVE_MS = 650;

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

export default function GameCanvas({
  client,
  snapshotRef,
  playerId,
  inputEnabled,
}: {
  client: GameClient;
  snapshotRef: React.MutableRefObject<Snapshot | null>;
  playerId: number;
  inputEnabled: React.MutableRefObject<boolean>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouse = useRef({ x: 0, y: 0, down: false });
  const pickups = useRef<Pickup[]>([]);
  // Two Stars "star burst" shockwaves: each expands outward from where it was
  // released, then fades.
  const shockwaves = useRef<{ x: number; y: number; born: number }[]>([]);

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
  const lastFrame = useRef(performance.now());
  const decor = useRef<Decor[] | null>(null);
  if (!decor.current) decor.current = genDecor();

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
      if (!inputEnabled.current) {
        client.setInput({
          up: false, down: false, left: false, right: false,
          attack: false, parry: false,
        });
        return;
      }
      client.setInput({
        up: keys["w"] || keys["arrowup"],
        down: keys["s"] || keys["arrowdown"],
        left: keys["a"] || keys["arrowleft"],
        right: keys["d"] || keys["arrowright"],
        attack: keys["j"] || mouse.current.down,
        parry: keys[" "] || keys["k"],
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

    const canvas = canvasRef.current!;
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
    canvas.addEventListener("mousemove", mm);
    canvas.addEventListener("mousedown", md);
    window.addEventListener("mouseup", mu);

    // Aim points from the screen centre (where the local knight is drawn)
    // toward the cursor.
    const aimTimer = window.setInterval(() => {
      const ax = mouse.current.x - canvas.width / 2;
      const ay = mouse.current.y - canvas.height / 2;
      if (ax || ay) client.setInput({ aimX: ax, aimY: ay });
    }, 50);

    return () => {
      window.clearInterval(aimTimer);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      canvas.removeEventListener("mousemove", mm);
      canvas.removeEventListener("mousedown", md);
      window.removeEventListener("mouseup", mu);
    };
  }, [client, inputEnabled]);

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
      const sx = (wx: number) => wx - camX + W / 2;
      const sy = (wy: number) => wy - camY + H / 2;

      // ground decorations (grass + rocks), only those near the viewport
      for (const d of decor.current!) {
        const dx = sx(d.x);
        const dy = sy(d.y);
        if (dx < -60 || dx > W + 60 || dy < -60 || dy > H + 60) continue;
        const img =
          d.kind === "grass" ? sp.grass : d.kind === "rock" ? sp.rock : sp.rockSmall;
        drawSprite(ctx, img, dx, dy, d.size);
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
        const facing = sm.facing;
        const flip = Math.cos(facing) < 0; // face the target (left vs right)
        const isBoss = e.kind === "boss";
        const isRanged = e.kind === "ranged";
        const size = isBoss ? 120 : 46;

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
          drawSprite(ctx, mouthOpen ? sp.roundheadAttack : sp.roundhead, bx, by, size, flip);
          bar(ctx, bx - size * 0.4, by - size * 0.55, size * 0.8, 4, e.hp / e.maxHp, "#dc2626");
        } else {
          shadow(ctx, ex, ey + size * 0.32, size * 0.42);
          drawSprite(ctx, sp.bonehead, ex, ey, size, flip);
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
          if (isBoss) {
            ctx.fillStyle = "#111";
            ctx.font = "bold 12px 'KyivType Serif', serif";
            ctx.textAlign = "center";
            ctx.fillText("BOSS", ex, ey - size * 0.6);
          }
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

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [playerId, snapshotRef]);

  return <canvas ref={canvasRef} className="h-full w-full" />;
}

// Draw an image centered at (x, y), scaled to fit within `size` while keeping
// aspect ratio. Falls back to nothing if the image hasn't loaded yet.
function drawSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  size: number,
  flipX = false
) {
  if (!img.complete || img.naturalWidth === 0) return;
  const ar = img.naturalWidth / img.naturalHeight;
  let w = size;
  let h = size;
  if (ar >= 1) h = size / ar;
  else w = size * ar;
  if (flipX) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  } else {
    ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
  }
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
    const swordSize = H * 1.15;
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
    const swordSize = H * 1.05;
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
