// Authoritative simulation of a single world instance, ported 1:1 from the
// former Python backend (backend/app/game/world.py). One World == one
// (mode, difficulty[, raid code]). Runs entirely in the browser now.

import * as C from "./constants";
import {
  Enemy,
  PlayerRT,
  Profile,
  Projectile,
  SlimeBall,
  dist,
} from "./entities";

// --- rng helpers (replacing Python's `random`) ---------------------------
function uniform(a: number, b: number): number {
  return a + Math.random() * (b - a);
}
function randint(a: number, b: number): number {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}
function choice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
const TWO_PI = Math.PI * 2;
const r1 = (n: number) => Math.round(n * 10) / 10;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export class World {
  key: string;
  mode: string; // "overworld" | "raid"
  difficulty: number;
  code: string | null;
  players = new Map<number, PlayerRT>();
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  slime_balls: SlimeBall[] = [];
  private _next_id = 1;
  tick_count = 0;
  spawn_timer: number;
  add_timer = 6.0;
  invasion_timer = 0.0;
  invasion_roll_timer = C.INVASION_ROLL_INTERVAL;
  ended = false;
  cleared = false;
  boss: Enemy | null = null;
  started: boolean;

  constructor(key: string, mode: string, difficulty: number, code: string | null = null) {
    this.key = key;
    this.mode = mode;
    this.difficulty = difficulty;
    this.code = code;
    this.spawn_timer = C.spawnInterval(difficulty, 1);
    this.started = mode !== "raid";
    if (mode === "raid") this._spawnDummies();
  }

  // ---------------------------------------------------------------- ids
  private _eid(): number {
    this._next_id += 1;
    return this._next_id;
  }

  // -------------------------------------------------------------- players
  addPlayer(profile: Profile): PlayerRT {
    const rt = new PlayerRT(
      profile,
      C.ARENA_W / 2 + uniform(-80, 80),
      C.ARENA_H / 2 + uniform(-80, 80),
      profile.max_hp
    );
    if (this.mode === "raid" && !this.started) {
      rt.pushEvent("info", {
        message: "Raid lobby — warm up on the dummies, then start the raid.",
      });
    } else if (this.mode === "raid") {
      rt.pushEvent("info", {
        message: `Raid difficulty ${this.difficulty} — good luck, knight.`,
      });
    }
    this.players.set(profile.id, rt);
    return rt;
  }

  removePlayer(pid: number): void {
    this.players.delete(pid);
  }

  isEmpty(): boolean {
    return this.players.size === 0;
  }

  alivePlayers(): PlayerRT[] {
    return [...this.players.values()].filter((p) => p.alive);
  }

  // ---------------------------------------------------------------- input
  handleInput(pid: number, msg: Record<string, unknown>): void {
    const rt = this.players.get(pid);
    if (!rt) return;
    rt.in_up = Boolean(msg.up);
    rt.in_down = Boolean(msg.down);
    rt.in_left = Boolean(msg.left);
    rt.in_right = Boolean(msg.right);
    rt.in_attack = Boolean(msg.attack);
    rt.in_parry = Boolean(msg.parry);
    const ax = Number(msg.aimX ?? rt.aim_x) || 0.0;
    const ay = Number(msg.aimY ?? rt.aim_y) || 0.0;
    if (ax || ay) {
      const mag = Math.hypot(ax, ay) || 1.0;
      rt.aim_x = ax / mag;
      rt.aim_y = ay / mag;
    }
  }

  handleChat(pid: number, text: string): Record<string, unknown> | null {
    const rt = this.players.get(pid);
    if (!rt) return null;
    text = text.trim().slice(0, 160);
    if (!text) return null;
    rt.chat_text = text;
    rt.chat_ttl = 5.0;
    return {
      type: "chat",
      from: rt.profile.nickname,
      level: this.difficulty,
      mode: this.mode,
      text,
      x: rt.x,
      y: rt.y,
    };
  }

  usePotion(pid: number): void {
    const rt = this.players.get(pid);
    if (!rt || rt.dead) return;
    const p = rt.profile;
    if (p.potions <= 0) {
      rt.pushEvent("info", { message: "No potions left." });
      return;
    }
    if (this.mode === "raid" && rt.raid_heals_used >= C.RAID_HEAL_LIMIT) {
      rt.pushEvent("info", { message: "Healing limit reached for this raid." });
      return;
    }
    p.potions -= 1;
    p.dirty = true;
    rt.raid_heals_used += 1;
    rt.hp = Math.min(p.max_hp, rt.hp + C.POTION.heal);
    rt.pushEvent("info", { message: `Drank a potion (+${C.POTION.heal} HP).` });
  }

  // ----------------------------------------------------------------- tick
  tick(dt: number): void {
    if (this.ended) return;
    this.tick_count += 1;
    this._tickPlayers(dt);
    this._spawn(dt);
    this._tickEnemies(dt);
    this._tickProjectiles(dt);
    this._tickSlimeBalls(dt);
    this._checkRaidState();
  }

  private _broadcastEvent(kind: string, data: Record<string, unknown> = {}): void {
    for (const rt of this.players.values()) rt.pushEvent(kind, data);
  }

  // .................................................. player movement/cmd
  private _tickPlayers(dt: number): void {
    for (const rt of this.players.values()) {
      rt.attack_cd = Math.max(0.0, rt.attack_cd - dt);
      rt.attack_active = Math.max(0.0, rt.attack_active - dt);
      rt.parry_cd = Math.max(0.0, rt.parry_cd - dt);
      rt.parry_active = Math.max(0.0, rt.parry_active - dt);
      rt.counter_ready = Math.max(0.0, rt.counter_ready - dt);
      rt.invuln = Math.max(0.0, rt.invuln - dt);
      rt.chat_ttl = Math.max(0.0, rt.chat_ttl - dt);
      if (rt.counter_ready <= 0) rt.parry_count = 0;

      if (rt.combo_window > 0) {
        rt.combo_window = Math.max(0.0, rt.combo_window - dt);
        if (rt.combo_window === 0) rt.combo_index = 0;
      }
      if (rt.attack_active <= 0) rt.combo_active = -1;

      if (rt.dead) {
        if (this.mode === "overworld" || !this.started) {
          rt.respawn_in -= dt;
          if (rt.respawn_in <= 0) this._respawn(rt);
        }
        continue;
      }

      const dx = (rt.in_right ? 1 : 0) - (rt.in_left ? 1 : 0);
      const dy = (rt.in_down ? 1 : 0) - (rt.in_up ? 1 : 0);
      if (dx || dy) {
        const m = Math.hypot(dx, dy);
        rt.x += (dx / m) * C.PLAYER_SPEED * dt;
        rt.y += (dy / m) * C.PLAYER_SPEED * dt;
        rt.x = Math.max(C.PLAYER_RADIUS, Math.min(C.ARENA_W - C.PLAYER_RADIUS, rt.x));
        rt.y = Math.max(C.PLAYER_RADIUS, Math.min(C.ARENA_H - C.PLAYER_RADIUS, rt.y));
      }

      if (rt.aim_x || rt.aim_y) rt.facing = Math.atan2(rt.aim_y, rt.aim_x);

      // start a parry
      if (rt.in_parry && rt.parry_cd <= 0 && rt.parry_active <= 0) {
        const pw = C.weaponPassive(rt.profile.weapon);
        rt.parry_active = pw.parry_duration ?? C.PARRY_DURATION;
        rt.parry_cd = C.PARRY_COOLDOWN;
        if (this.mode === "raid") {
          rt.counter_ready = C.PARRY_COUNTER_WINDOW;
          rt.parry_count = Math.max(1, rt.parry_count);
          rt.pushEvent("parry");
        }
      }

      // start the next swing of the 3-hit combo
      if (rt.in_attack && rt.attack_cd <= 0 && rt.attack_active <= 0) {
        const idx = rt.combo_index;
        rt.attack_active = C.ATTACK_ACTIVE;
        rt.attack_hit_ids = new Set();
        rt.combo_active = idx;
        rt.combo_window = C.COMBO_GRACE;
        const cdMult = C.weaponPassive(rt.profile.weapon).cd_mult;
        const counter = rt.counter_ready > 0;
        rt.pushEvent("slash", { index: idx, counter });
        if (idx >= C.COMBO_LEN - 1) {
          rt.attack_cd = C.COMBO_FINISH_INTERVAL * cdMult;
          rt.combo_index = 0;
        } else {
          rt.attack_cd = C.COMBO_INTERVAL * cdMult;
          rt.combo_index = idx + 1;
        }
        this._weaponOnSwing(rt);
      }

      if (rt.attack_active > 0) this._resolveSlash(rt);
    }
  }

  private _weaponOnSwing(rt: PlayerRT): void {
    const pw = C.weaponPassive(rt.profile.weapon);
    if (pw.key === "starfall" && rt.star_charge > 0) {
      const base = rt.profile.attack + rt.star_charge;
      const critCh = Math.min(0.99, rt.profile.crit_chance + rt.star_crit);
      for (const e of [...this.enemies]) {
        const crit = Math.random() < critCh;
        this._damageEnemy(e, base * (crit ? 2.0 : 1.0), rt, crit);
      }
      rt.pushEvent("shockwave", { x: r1(rt.x), y: r1(rt.y) });
      rt.star_charge = 0.0;
      rt.star_crit = 0.0;
    }
  }

  private _resolveSlash(rt: PlayerRT): void {
    const pw = C.weaponPassive(rt.profile.weapon);
    const rangeMult = pw.range_mult ?? 1.0;
    const isThrust = rt.combo_active >= C.COMBO_LEN - 1;
    const reach =
      (C.ATTACK_RANGE + (isThrust ? C.THRUST_RANGE_BONUS : 0.0)) * rangeMult;
    const arc = isThrust ? C.THRUST_ARC : C.ATTACK_ARC;
    for (const e of [...this.enemies]) {
      if (rt.attack_hit_ids.has(e.id)) continue;
      if (e.kind === "boss" && e.phase !== "ground" && e.phase !== "crash") continue;
      const d = dist(rt.x, rt.y, e.x, e.y);
      if (d > reach + e.radius) continue;
      const ang = Math.atan2(e.y - rt.y, e.x - rt.x);
      const diff = Math.abs((((ang - rt.facing + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI - Math.PI);
      if (diff > arc) continue;
      rt.attack_hit_ids.add(e.id);

      let atk = rt.profile.attack;
      let critCh = rt.profile.crit_chance;
      if (pw.key === "syphon") {
        atk += rt.syphon_stacks * C.SCYTHE_SYPHON_ATK;
        critCh += rt.syphon_stacks * C.SCYTHE_SYPHON_CRIT;
      }
      let dmg = atk;
      const isCounter = rt.counter_ready > 0;
      let crit = Math.random() < critCh;
      if (pw.key === "bloodcrit" && isCounter) crit = true;
      if (crit) dmg *= 2.0;
      if (isCounter) {
        dmg *= C.PARRY_BONUS;
        if (pw.key === "heavy") dmg += C.LONG_COUNTER_FLAT;
        rt.counter_ready = 0.0;
        rt.parry_count = 0;
      }

      if (pw.key === "execute" && e.hp <= C.EXECUTE_THRESHOLD * e.max_hp) {
        dmg *= C.EXECUTE_BONUS;
      }
      this._damageEnemy(e, dmg, rt, crit);

      // --- on-hit weapon passives ---
      if (pw.key === "lifesteal" && !rt.dead && rt.hp > 0) {
        rt.hp = Math.min(rt.profile.max_hp, rt.hp + dmg * C.LIFESTEAL_PCT);
      } else if (pw.key === "frost") {
        e.slow_timer = C.FROST_SLOW_TIME;
      } else if (pw.key === "burn") {
        e.burn_timer = C.BURN_TIME;
        e.burn_dps = (rt.profile.attack * C.BURN_PCT) / C.BURN_TIME;
        e.burn_by = rt;
      } else if (pw.key === "bleed") {
        if (Math.random() < C.KNIFE_BLEED_CHANCE) {
          e.bleed_timer = C.KNIFE_BLEED_TIME;
          e.bleed_dps = e.max_hp * C.KNIFE_BLEED_PCT;
          e.bleed_by = rt;
        }
      } else if (pw.key === "syphon") {
        rt.syphon_stacks = Math.min(C.SCYTHE_SYPHON_MAX, rt.syphon_stacks + 1);
      }

      if (pw.key === "bloodcrit" && !rt.dead) {
        rt.hp -= C.DROWS_HIT_SELF_DMG;
        if (rt.hp <= 0) {
          this._killPlayer(rt);
          return;
        }
      }
    }
  }

  private _respawn(rt: PlayerRT): void {
    rt.dead = false;
    rt.hp = rt.profile.max_hp;
    rt.x = C.ARENA_W / 2 + uniform(-60, 60);
    rt.y = C.ARENA_H / 2 + uniform(-60, 60);
    rt.invuln = 2.0;
    rt.syphon_stacks = 0;
    rt.star_charge = 0.0;
    rt.star_crit = 0.0;
    rt.counter_ready = 0.0;
    rt.parry_count = 0;
    rt.pushEvent("respawn");
  }

  // .................................................. enemy spawn / AI
  private _spawnBoss(): void {
    const d = this.difficulty;
    const b = new Enemy({
      id: this._eid(),
      kind: "boss",
      x: C.ARENA_W / 2,
      y: C.ARENA_H / 4,
      hp: C.bossHp(d),
      max_hp: C.bossHp(d),
      dmg: C.bossDmg(d),
      speed: C.BOSS_SPEED + d,
      rng: 0.0,
      cd: 0.0,
      windup: 0.0,
      radius: C.BOSS_RADIUS,
    });
    b.phase = "ground";
    b.special_cd = C.BOSS_SPECIAL_INTERVAL;
    this.boss = b;
    this.enemies.push(b);
  }

  private _spawnDummies(): void {
    const cx = C.ARENA_W / 2;
    const cy = C.ARENA_H / 2;
    const off = 90.0;
    for (const [dx, dy] of [
      [-off, -off],
      [off, -off],
      [-off, off],
      [off, off],
    ]) {
      this.enemies.push(
        new Enemy({
          id: this._eid(),
          kind: "dummy",
          x: cx + dx,
          y: cy + dy,
          hp: 1e9,
          max_hp: 1e9,
          dmg: 0.0,
          speed: 0.0,
          rng: 0.0,
          cd: 1e9,
          windup: 0.0,
          radius: C.ENEMY_RADIUS,
        })
      );
    }
  }

  startRaid(difficulty: number): void {
    if (this.mode !== "raid" || this.started) return;
    this.difficulty = Math.max(
      C.MIN_DIFFICULTY,
      Math.min(C.MAX_DIFFICULTY, Math.trunc(difficulty))
    );
    this.started = true;
    this.enemies = this.enemies.filter((e) => e.kind !== "dummy");
    this.add_timer = 6.0;
    this.spawn_timer = C.spawnInterval(this.difficulty, Math.max(1, this.players.size));
    this._spawnBoss();
    for (const rt of this.players.values()) {
      rt.pushEvent("info", {
        message: `Raid difficulty ${this.difficulty} — good luck, knight.`,
      });
    }
  }

  private _edgePoint(): [number, number] {
    const side = randint(0, 3);
    if (side === 0) return [uniform(0, C.ARENA_W), 20];
    if (side === 1) return [uniform(0, C.ARENA_W), C.ARENA_H - 20];
    if (side === 2) return [20, uniform(0, C.ARENA_H)];
    return [C.ARENA_W - 20, uniform(0, C.ARENA_H)];
  }

  private _makeEnemy(kind: string): Enemy {
    const base = C.ENEMY_BASE[kind];
    const [x, y] = this._edgePoint();
    return new Enemy({
      id: this._eid(),
      kind,
      x,
      y,
      hp: C.enemyHp(kind, this.difficulty),
      max_hp: C.enemyHp(kind, this.difficulty),
      dmg: C.enemyDmg(kind, this.difficulty),
      speed: base.speed,
      rng: base.range,
      cd: base.cd,
      windup: base.windup,
    });
  }

  private _spawn(dt: number): void {
    const n = Math.max(1, this.players.size);
    if (this.mode === "overworld") {
      this._tickInvasion(dt);
      this.spawn_timer -= dt;
      if (this.spawn_timer <= 0 && this.enemies.length < C.maxEnemies(n)) {
        if (
          this.invasion_timer > 0 &&
          Math.random() < C.INVASION_MINISLIME_CHANCE
        ) {
          const [ex, ey] = this._edgePoint();
          this._spawnMinislime(ex, ey);
        } else {
          this.enemies.push(this._makeEnemy(choice(["melee", "ranged"])));
        }
        const mult = this.invasion_timer > 0 ? C.INVASION_SPAWN_MULT : 1.0;
        this.spawn_timer = C.spawnInterval(this.difficulty, n) * mult;
      }
    } else if (!this.started) {
      return;
    } else {
      this.add_timer -= dt;
      if (
        this.add_timer <= 0 &&
        this.enemies.filter((e) => e.kind !== "boss").length < 6
      ) {
        this.enemies.push(this._makeEnemy(choice(["melee", "ranged"])));
        this.add_timer = Math.max(2.5, 6.0 - 0.1 * this.difficulty);
      }
    }
  }

  private _tickInvasion(dt: number): void {
    if (this.invasion_timer > 0) {
      this.invasion_timer = Math.max(0.0, this.invasion_timer - dt);
      if (this.invasion_timer === 0) {
        this._broadcastEvent("info", { message: "The slime invasion has subsided." });
      }
      return;
    }
    this.invasion_roll_timer -= dt;
    if (this.invasion_roll_timer <= 0) {
      this.invasion_roll_timer = C.INVASION_ROLL_INTERVAL;
      if (this.players.size && Math.random() < C.INVASION_CHANCE) {
        this.invasion_timer = C.INVASION_DURATION;
        this._broadcastEvent("invasion", { message: "Slimes are invading!" });
      }
    }
  }

  private _nearestPlayer(e: Enemy): PlayerRT | null {
    let best: PlayerRT | null = null;
    let bd = 1e9;
    for (const rt of this.alivePlayers()) {
      const d = dist(e.x, e.y, rt.x, rt.y);
      if (d < bd) {
        best = rt;
        bd = d;
      }
    }
    return best;
  }

  private _tickEnemies(dt: number): void {
    for (const e of [...this.enemies]) {
      if (e.kind === "dummy") continue;
      if (e.slow_timer > 0) e.slow_timer -= dt;
      let burnDmg = 0.0;
      let bleedDmg = 0.0;
      if (e.burn_timer > 0) {
        e.burn_timer -= dt;
        burnDmg = e.burn_dps * dt;
      }
      if (e.bleed_timer > 0) {
        e.bleed_timer -= dt;
        bleedDmg = e.bleed_dps * dt;
      }
      const dot = burnDmg + bleedDmg;
      let dotBy = burnDmg > 0 ? e.burn_by : null;
      dotBy = bleedDmg > 0 ? e.bleed_by ?? dotBy : dotBy;
      if (dot > 0) {
        e.hp -= dot;
        e.burn_accum += burnDmg;
        e.bleed_accum += bleedDmg;
        e.dot_timer -= dt;
        if (e.dot_timer <= 0) {
          this._emitDot(e, "burn", "#f97316");
          this._emitDot(e, "bleed", "#be123c");
          e.dot_timer = C.DOT_NUMBER_INTERVAL;
        }
        if (e.hp <= 0) {
          let by = dotBy;
          if (by === null || !this.players.has(by.profile.id) || !by.alive) {
            by = this._nearestPlayer(e);
          }
          if (by !== null) this._killEnemy(e, by);
          else this._removeEnemy(e);
          continue;
        }
      }

      if (e.kind === "boss") {
        this._tickBoss(e, dt);
        continue;
      }
      if (e.kind === "minislime") {
        this._tickMinislime(e, dt);
        continue;
      }

      const target = this._nearestPlayer(e);
      if (target === null) continue;
      e.facing = Math.atan2(target.y - e.y, target.x - e.x);
      const d = dist(e.x, e.y, target.x, target.y);
      e.atk_timer = Math.max(0.0, e.atk_timer - dt);

      const ranged = e.kind === "ranged";
      if (ranged) {
        const want = e.rng * 0.55;
        if (d < want - 30) this._move(e, target, -1, dt);
        else if (d > want + 30) this._move(e, target, 1, dt);
      } else {
        if (d > e.rng + e.radius + C.PLAYER_RADIUS - 4) this._move(e, target, 1, dt);
      }

      if (e.windup_timer > 0) {
        e.windup_timer -= dt;
        if (e.windup_timer <= 0) {
          this._enemyStrike(e, target, ranged);
          e.atk_timer = e.cd;
        }
      } else if (e.atk_timer <= 0) {
        const inRange = ranged
          ? d <= e.rng
          : d <= e.rng + e.radius + C.PLAYER_RADIUS;
        if (inRange) e.windup_timer = e.windup;
      }
    }
  }

  private _removeEnemy(e: Enemy): void {
    const i = this.enemies.indexOf(e);
    if (i >= 0) this.enemies.splice(i, 1);
  }

  private _move(e: Enemy, target: PlayerRT, sign: number, dt: number): void {
    const ang = Math.atan2(target.y - e.y, target.x - e.x);
    const spd = e.speed * (e.slow_timer > 0 ? C.FROST_SLOW_MULT : 1.0);
    e.x += Math.cos(ang) * spd * sign * dt;
    e.y += Math.sin(ang) * spd * sign * dt;
    e.x = Math.max(10, Math.min(C.ARENA_W - 10, e.x));
    e.y = Math.max(10, Math.min(C.ARENA_H - 10, e.y));
  }

  private _enemyStrike(e: Enemy, target: PlayerRT, ranged: boolean): void {
    if (ranged) {
      const ang = Math.atan2(target.y - e.y, target.x - e.x);
      this.projectiles.push(
        new Projectile({
          id: this._eid(),
          x: e.x,
          y: e.y,
          vx: Math.cos(ang) * C.PROJECTILE_SPEED,
          vy: Math.sin(ang) * C.PROJECTILE_SPEED,
          dmg: e.dmg,
        })
      );
      if (e.kind === "boss") {
        for (const offv of [-0.25, 0.25]) {
          this.projectiles.push(
            new Projectile({
              id: this._eid(),
              x: e.x,
              y: e.y,
              vx: Math.cos(ang + offv) * C.PROJECTILE_SPEED,
              vy: Math.sin(ang + offv) * C.PROJECTILE_SPEED,
              dmg: e.dmg,
            })
          );
        }
      }
      return;
    }
    for (const rt of this.alivePlayers()) {
      if (dist(e.x, e.y, rt.x, rt.y) <= e.rng + e.radius + C.PLAYER_RADIUS) {
        this._damagePlayer(rt, e.dmg);
      }
    }
  }

  // ............................................................ slime boss
  private _tickBoss(b: Enemy, dt: number): void {
    const target = this._nearestPlayer(b);
    if (target !== null) b.facing = Math.atan2(target.y - b.y, target.x - b.x);

    if (b.phase === "ground") {
      if (target !== null) {
        const d = dist(b.x, b.y, target.x, target.y);
        if (d > b.radius + C.PLAYER_RADIUS - 4) this._move(b, target, 1, dt);
        this._contactAttack(b, dt);
        b.special_cd -= dt;
        if (b.special_cd <= 0) {
          b.phase = "anticipate";
          b.phase_timer = C.BOSS_ANTICIPATE;
        }
      }
    } else if (b.phase === "anticipate") {
      b.phase_timer -= dt;
      if (b.phase_timer <= 0) {
        b.phase = "air";
        b.phase_timer = C.BOSS_AIR;
        b.blink = false;
        const tgt = target ?? this._nearestPlayer(b);
        if (tgt) {
          b.target_x = tgt.x;
          b.target_y = tgt.y;
        } else {
          b.target_x = b.x;
          b.target_y = b.y;
        }
        this._broadcastEvent("boss_jump");
      }
    } else if (b.phase === "air") {
      b.phase_timer -= dt;
      if (b.phase_timer > C.BOSS_BLINK) {
        if (target !== null) {
          b.target_x = target.x;
          b.target_y = target.y;
        }
      } else if (!b.blink) {
        b.blink = true;
        this._broadcastEvent("boss_blink");
      }
      if (b.phase_timer <= 0) {
        b.phase = "falling";
        b.phase_timer = C.BOSS_FALL;
        b.blink = false;
        b.x = b.target_x;
        b.y = b.target_y;
        this._broadcastEvent("boss_falling");
      }
    } else if (b.phase === "falling") {
      b.phase_timer -= dt;
      b.x = b.target_x;
      b.y = b.target_y;
      if (b.phase_timer <= 0) {
        b.phase = "crash";
        b.phase_timer = C.BOSS_CRASH;
        this._bossSlam(b);
      }
    } else if (b.phase === "crash") {
      b.phase_timer -= dt;
      if (b.phase_timer <= 0) {
        b.phase = "ground";
        b.special_cd = C.BOSS_SPECIAL_INTERVAL;
        b.contact_timer = 0.0;
      }
    }
  }

  private _tickMinislime(e: Enemy, dt: number): void {
    const target = this._nearestPlayer(e);
    if (target === null) return;
    e.facing = Math.atan2(target.y - e.y, target.x - e.x);
    if (dist(e.x, e.y, target.x, target.y) > e.radius + C.PLAYER_RADIUS - 4) {
      this._move(e, target, 1, dt);
    }
    this._contactAttack(e, dt);
  }

  private _contactAttack(e: Enemy, dt: number): void {
    e.contact_timer = Math.max(0.0, e.contact_timer - dt);
    const canHit = e.contact_timer <= 0;
    let hitAny = false;
    const reach = e.radius + C.PLAYER_RADIUS;
    for (const rt of this.alivePlayers()) {
      if (dist(e.x, e.y, rt.x, rt.y) > reach) continue;
      if (rt.parry_active > 0 && rt.invuln <= 0) {
        const ang = Math.atan2(e.y - rt.y, e.x - rt.x);
        const kb = C.SLIME_PARRY_KNOCKBACK;
        e.x = Math.max(10, Math.min(C.ARENA_W - 10, e.x + Math.cos(ang) * kb));
        e.y = Math.max(10, Math.min(C.ARENA_H - 10, e.y + Math.sin(ang) * kb));
        this._damagePlayer(rt, e.dmg);
        hitAny = true;
      } else if (canHit) {
        this._damagePlayer(rt, e.dmg);
        hitAny = true;
      }
    }
    if (hitAny) e.contact_timer = C.BOSS_CONTACT_INTERVAL;
  }

  private _bossSlam(b: Enemy): void {
    this._broadcastEvent("boss_slam");
    const splash = C.BOSS_SLAM_RADIUS + C.PLAYER_RADIUS;
    for (const rt of this.alivePlayers()) {
      if (dist(b.x, b.y, rt.x, rt.y) <= splash) {
        this._damagePlayer(rt, b.dmg * C.BOSS_SLAM_MULT);
      }
    }
    this._spawnSlimeBalls(b);
  }

  private _spawnSlimeBalls(b: Enemy): void {
    const n = C.SLIME_BALL_COUNT;
    this._broadcastEvent("slime_throw");
    for (let i = 0; i < n; i++) {
      const ang = (TWO_PI * i) / n + uniform(-0.4, 0.4);
      const reach = uniform(120.0, 240.0);
      const tx = Math.max(40, Math.min(C.ARENA_W - 40, b.x + Math.cos(ang) * reach));
      const ty = Math.max(40, Math.min(C.ARENA_H - 40, b.y + Math.sin(ang) * reach));
      this.slime_balls.push(
        new SlimeBall({ id: this._eid(), sx: b.x, sy: b.y, tx, ty, x: b.x, y: b.y })
      );
    }
  }

  private _tickSlimeBalls(dt: number): void {
    const survivors: SlimeBall[] = [];
    for (const s of this.slime_balls) {
      s.t += dt;
      const u = s.dur > 0 ? Math.min(1.0, s.t / s.dur) : 1.0;
      s.x = s.sx + (s.tx - s.sx) * u;
      s.y = s.sy + (s.ty - s.sy) * u - C.SLIME_BALL_ARC * Math.sin(Math.PI * u);
      if (u >= 1.0) {
        this._broadcastEvent("slimeball_land");
        this._spawnMinislime(s.tx, s.ty);
      } else {
        survivors.push(s);
      }
    }
    this.slime_balls = survivors;
  }

  private _spawnMinislime(x: number, y: number): void {
    if (this.enemies.filter((e) => e.kind === "minislime").length >= C.MINI_SLIME_MAX) {
      return;
    }
    const d = this.difficulty;
    const hp = C.minislimeHp(d);
    this.enemies.push(
      new Enemy({
        id: this._eid(),
        kind: "minislime",
        x,
        y,
        hp,
        max_hp: hp,
        dmg: C.minislimeDmg(d),
        speed: C.MINI_SLIME_SPEED,
        rng: 0.0,
        cd: 0.0,
        windup: 0.0,
        radius: C.MINI_SLIME_RADIUS,
      })
    );
  }

  // ............................................................ projectiles
  private _tickProjectiles(dt: number): void {
    const survivors: Projectile[] = [];
    for (const pr of this.projectiles) {
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.ttl -= dt;
      if (pr.ttl <= 0 || !(pr.x >= 0 && pr.x <= C.ARENA_W && pr.y >= 0 && pr.y <= C.ARENA_H)) {
        continue;
      }
      let hit = false;
      for (const rt of this.alivePlayers()) {
        if (dist(pr.x, pr.y, rt.x, rt.y) <= C.PROJECTILE_RADIUS + C.PLAYER_RADIUS) {
          this._damagePlayer(rt, pr.dmg);
          hit = true;
          break;
        }
      }
      if (!hit) survivors.push(pr);
    }
    this.projectiles = survivors;
  }

  // ............................................................ combat dmg
  private _damagePlayer(rt: PlayerRT, dmg: number): void {
    if (rt.dead || rt.invuln > 0) return;
    if (rt.parry_active > 0) {
      const pw = C.weaponPassive(rt.profile.weapon);
      if (pw.key === "starfall") {
        rt.star_charge += C.STAR_ATK_PER;
        rt.star_crit = Math.min(0.95, rt.star_crit + C.STAR_CRIT_PER);
        rt.counter_ready = C.PARRY_COUNTER_WINDOW;
        rt.parry_count += 1;
        rt.invuln = 0.08;
        rt.pushEvent("parry");
        return;
      }
      rt.parry_active = 0.0;
      rt.counter_ready = C.PARRY_COUNTER_WINDOW;
      rt.parry_count = 1;
      rt.invuln = 0.25;
      rt.pushEvent("parry");
      return;
    }
    rt.hp -= dmg;
    rt.pushEvent("hurt", { dmg: Math.trunc(dmg) });
    if (rt.hp <= 0) this._killPlayer(rt);
  }

  private _killPlayer(rt: PlayerRT): void {
    rt.dead = true;
    rt.hp = 0;
    const p = rt.profile;
    if (this.mode === "overworld") {
      const lostG = Math.trunc(p.gold * C.DEATH_GOLD_LOSS);
      const lostE = Math.trunc(p.exp * C.DEATH_EXP_LOSS);
      p.gold = Math.max(0, p.gold - lostG);
      p.exp = Math.max(0, p.exp - lostE);
      p.dirty = true;
      rt.respawn_in = C.RESPAWN_DELAY;
      rt.pushEvent("death", { gold_lost: lostG, exp_lost: lostE });
    } else if (!this.started) {
      rt.respawn_in = C.RESPAWN_DELAY;
      rt.pushEvent("death", { gold_lost: 0, exp_lost: 0 });
    } else {
      rt.pushEvent("death", { gold_lost: 0, exp_lost: 0 });
    }
  }

  private _damageEnemy(e: Enemy, dmg: number, by: PlayerRT, crit: boolean): void {
    by.pushEvent("hit", { crit, dmg: Math.trunc(dmg), x: e.x, y: e.y, eid: e.id });
    if (e.kind === "dummy") return;
    const ang = Math.atan2(e.y - by.y, e.x - by.x);
    const kb = e.kind === "boss" ? C.KNOCKBACK_BOSS : C.KNOCKBACK;
    e.x = Math.max(10, Math.min(C.ARENA_W - 10, e.x + Math.cos(ang) * kb));
    e.y = Math.max(10, Math.min(C.ARENA_H - 10, e.y + Math.sin(ang) * kb));
    e.hp -= dmg;
    if (e.hp <= 0) this._killEnemy(e, by);
  }

  private _emitDot(e: Enemy, dtype: string, color: string): void {
    const accum = dtype === "burn" ? e.burn_accum : e.bleed_accum;
    const by = dtype === "burn" ? e.burn_by : e.bleed_by;
    const whole = Math.trunc(accum);
    if (whole < 1 || by === null || !this.players.has(by.profile.id)) return;
    by.pushEvent("dot", { dtype, color, dmg: whole, x: e.x, y: e.y, eid: e.id });
    if (dtype === "burn") e.burn_accum -= whole;
    else e.bleed_accum -= whole;
  }

  private _killEnemy(e: Enemy, by: PlayerRT): void {
    const i = this.enemies.indexOf(e);
    if (i < 0) return;
    this.enemies.splice(i, 1);
    if (e.kind === "boss") {
      this.boss = null;
      this._clearRaid(by);
      return;
    }
    if (e.kind === "minislime" && this.mode === "raid") return;
    if (e.kind === "melee") {
      by.pushEvent("enemy_death", { enemy: e.kind, x: e.x, y: e.y });
    }
    const [exp, gold] = C.enemyReward(this.difficulty);
    const recipients = this.alivePlayers().filter(
      (rt) => dist(rt.x, rt.y, e.x, e.y) <= C.SHARE_RADIUS
    );
    if (!recipients.includes(by) && by.alive) recipients.push(by);
    for (const rt of recipients) {
      const leveled = rt.profile.grant(exp, gold);
      rt.pushEvent("reward", { exp, gold, x: e.x, y: e.y });
      for (const lvl of leveled) {
        rt.hp = rt.profile.max_hp;
        rt.pushEvent("levelup", { level: lvl });
      }
    }
  }

  // ............................................................ raid logic
  private _clearRaid(by: PlayerRT): void {
    void by;
    this.cleared = true;
    this.ended = true;
    const d = this.difficulty;
    const [exp, gold] = C.bossReward(d);
    const party = [...this.players.values()].map((rt) => rt.profile.nickname);
    for (const rt of this.alivePlayers()) {
      const p = rt.profile;
      const first = p.cleared_raid < d;
      const bonus = first ? C.firstClearBonusGold(d) : 0;
      const leveled = p.grant(exp, gold + bonus);
      if (p.cleared_raid < d) {
        p.cleared_raid = d;
        p.dirty = true;
      }
      rt.pushEvent("raid_clear", {
        difficulty: d,
        exp,
        gold,
        first_clear: first,
        bonus_gold: bonus,
        party,
      });
      for (const lvl of leveled) rt.pushEvent("levelup", { level: lvl });
    }
  }

  private _checkRaidState(): void {
    if (this.mode !== "raid" || this.ended || !this.started) return;
    if (this.players.size && this.alivePlayers().length === 0) {
      this.ended = true;
      for (const rt of this.players.values()) {
        rt.pushEvent("raid_failed", {
          message: "The party has fallen. No rewards lost.",
        });
      }
    }
  }

  // ............................................................ snapshot
  snapshot(): Record<string, unknown> {
    return {
      type: "state",
      t: this.tick_count,
      mode: this.mode,
      difficulty: this.difficulty,
      code: this.code,
      started: this.started,
      ended: this.ended,
      cleared: this.cleared,
      boss: this.boss
        ? { hp: Math.trunc(this.boss.hp), maxHp: Math.trunc(this.boss.max_hp) }
        : null,
      players: [...this.players.values()].map((rt) => ({
        id: rt.profile.id,
        name: rt.profile.nickname,
        lvl: rt.profile.level,
        x: r1(rt.x),
        y: r1(rt.y),
        hp: Math.trunc(Math.max(0, rt.hp)),
        maxHp: rt.profile.max_hp,
        facing: r3(rt.facing),
        dead: rt.dead,
        atk: rt.attack_active > 0,
        combo: rt.combo_active,
        parry: rt.parry_active > 0,
        counter: rt.counter_ready > 0,
        weapon: rt.profile.weapon,
        chat: rt.chat_ttl > 0 ? rt.chat_text : "",
      })),
      enemies: this.enemies.map((e) => this._enemySnap(e)),
      projectiles: this.projectiles.map((p) => ({
        id: p.id,
        x: r1(p.x),
        y: r1(p.y),
        a: r3(Math.atan2(p.vy, p.vx)),
      })),
      slimeBalls: this.slime_balls.map((s) => ({
        id: s.id,
        x: r1(s.x),
        y: r1(s.y),
      })),
    };
  }

  private static _phaseDuration(phase: string): number {
    return (
      {
        anticipate: C.BOSS_ANTICIPATE,
        air: C.BOSS_AIR,
        falling: C.BOSS_FALL,
        crash: C.BOSS_CRASH,
      }[phase] ?? 0.0
    );
  }

  private _enemySnap(e: Enemy): Record<string, unknown> {
    const d: Record<string, unknown> = {
      id: e.id,
      kind: e.kind,
      x: r1(e.x),
      y: r1(e.y),
      hp: Math.trunc(Math.max(0, e.hp)),
      maxHp: Math.trunc(e.max_hp),
      facing: r3(e.facing),
      wind: e.windup_timer > 0,
    };
    if (e.kind === "boss") {
      const dur = World._phaseDuration(e.phase);
      d.phase = e.phase;
      d.pf = dur > 0 ? r3(1 - e.phase_timer / dur) : 0.0;
      d.tx = r1(e.target_x);
      d.ty = r1(e.target_y);
      d.blink = e.blink;
    }
    return d;
  }

  private _buffsFor(rt: PlayerRT): Record<string, unknown>[] {
    const buffs: Record<string, unknown>[] = [];
    if (this.mode === "overworld" && this.invasion_timer > 0) {
      buffs.push({
        key: "invasion",
        name: "Slime Invading",
        color: "#84cc16",
        count: 0,
        remaining: r1(this.invasion_timer),
        duration: C.INVASION_DURATION,
        desc:
          "The overworld is overrun! Enemies spawn faster and mini-slimes are " +
          "pouring in. Hold out until it passes.",
      });
    }
    const pw = C.weaponPassive(rt.profile.weapon);
    if (rt.counter_ready > 0) {
      if (pw.key === "starfall") {
        buffs.push({
          key: "starfall",
          name: "Star Charge",
          color: "#eab308",
          count: rt.parry_count,
          remaining: Math.round(rt.counter_ready * 100) / 100,
          duration: C.PARRY_COUNTER_WINDOW,
          desc:
            "Each parried hit is banked; your next strike releases a map-wide " +
            "star burst. Keep parrying to stack more power.",
        });
      } else {
        buffs.push({
          key: "counter",
          name: "Parry Counter",
          color: "#22c55e",
          count: rt.parry_count,
          remaining: Math.round(rt.counter_ready * 100) / 100,
          duration: C.PARRY_COUNTER_WINDOW,
          desc: `Your next slash is an empowered counter dealing ${C.PARRY_BONUS}x damage.`,
        });
      }
    }
    if (rt.syphon_stacks > 0) {
      const atk = rt.syphon_stacks * C.SCYTHE_SYPHON_ATK;
      const crit = Math.trunc(rt.syphon_stacks * C.SCYTHE_SYPHON_CRIT * 100);
      buffs.push({
        key: "syphon",
        name: "Soul Syphon",
        color: "#a855f7",
        count: rt.syphon_stacks,
        remaining: 0,
        duration: 0,
        desc: `+${atk} attack and +${crit}% crit from syphoned souls. Resets on death.`,
      });
    }
    return buffs;
  }

  statsFor(pid: number): Record<string, unknown> | null {
    const rt = this.players.get(pid);
    if (!rt) return null;
    const p = rt.profile;
    return {
      type: "stats",
      level: p.level,
      exp: p.exp,
      expToNext: C.expToNext(p.level),
      gold: p.gold,
      hp: Math.trunc(Math.max(0, rt.hp)),
      maxHp: p.max_hp,
      attack: p.attack,
      critChance: Math.round(p.crit_chance * 10000) / 10000,
      weapon: p.weapon,
      potions: p.potions,
      clearedRaid: p.cleared_raid,
      dead: rt.dead,
      buffs: this._buffsFor(rt),
    };
  }
}
