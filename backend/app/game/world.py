"""Authoritative, server-side simulation of a single world instance.

One World == one (mode, difficulty[, raid code]). The simulation is fully
server-authoritative: clients only send intent (input + chat) and render the
snapshots they receive back.
"""

from __future__ import annotations

import math
import random

from . import constants as C
from .entities import Enemy, PlayerRT, Profile, Projectile, dist


class World:
    def __init__(self, key: str, mode: str, difficulty: int, code: str | None = None):
        self.key = key
        self.mode = mode  # "overworld" | "raid"
        self.difficulty = difficulty
        self.code = code
        self.players: dict[int, PlayerRT] = {}
        self.enemies: list[Enemy] = []
        self.projectiles: list[Projectile] = []
        self._next_id = 1
        self.tick_count = 0
        self.spawn_timer = C.spawn_interval(difficulty, 1)
        self.add_timer = 6.0  # raid trickle of minions
        self.ended = False  # raid finished (cleared or wiped)
        self.cleared = False
        self.boss: Enemy | None = None
        if mode == "raid":
            self._spawn_boss()

    # ------------------------------------------------------------------ ids
    def _eid(self) -> int:
        self._next_id += 1
        return self._next_id

    # -------------------------------------------------------------- players
    def add_player(self, profile: Profile) -> PlayerRT:
        rt = PlayerRT(
            profile=profile,
            x=C.ARENA_W / 2 + random.uniform(-80, 80),
            y=C.ARENA_H / 2 + random.uniform(-80, 80),
            hp=profile.max_hp,
        )
        if self.mode == "raid":
            rt.push_event("info", message=f"Raid difficulty {self.difficulty} — good luck, knight.")
        self.players[profile.id] = rt
        return rt

    def remove_player(self, pid: int) -> None:
        self.players.pop(pid, None)

    def is_empty(self) -> bool:
        return len(self.players) == 0

    def alive_players(self) -> list[PlayerRT]:
        return [p for p in self.players.values() if p.alive]

    # ---------------------------------------------------------------- input
    def handle_input(self, pid: int, msg: dict) -> None:
        rt = self.players.get(pid)
        if rt is None:
            return
        rt.in_up = bool(msg.get("up"))
        rt.in_down = bool(msg.get("down"))
        rt.in_left = bool(msg.get("left"))
        rt.in_right = bool(msg.get("right"))
        rt.in_attack = bool(msg.get("attack"))
        rt.in_parry = bool(msg.get("parry"))
        ax = float(msg.get("aimX", rt.aim_x) or 0.0)
        ay = float(msg.get("aimY", rt.aim_y) or 0.0)
        if ax or ay:
            mag = math.hypot(ax, ay) or 1.0
            rt.aim_x, rt.aim_y = ax / mag, ay / mag

    def handle_chat(self, pid: int, text: str) -> dict | None:
        rt = self.players.get(pid)
        if rt is None:
            return None
        text = text.strip()[:160]
        if not text:
            return None
        rt.chat_text = text
        rt.chat_ttl = 5.0
        return {
            "type": "chat",
            "from": rt.profile.nickname,
            "level": self.difficulty,
            "mode": self.mode,
            "text": text,
            "x": rt.x,
            "y": rt.y,
        }

    def use_potion(self, pid: int) -> None:
        rt = self.players.get(pid)
        if rt is None or rt.dead:
            return
        p = rt.profile
        if p.potions <= 0:
            rt.push_event("info", message="No potions left.")
            return
        if self.mode == "raid" and rt.raid_heals_used >= C.RAID_HEAL_LIMIT:
            rt.push_event("info", message="Healing limit reached for this raid.")
            return
        p.potions -= 1
        p.dirty = True
        rt.raid_heals_used += 1
        rt.hp = min(p.max_hp, rt.hp + C.POTION["heal"])
        rt.push_event("info", message=f"Drank a potion (+{C.POTION['heal']} HP).")

    # ----------------------------------------------------------------- tick
    def tick(self, dt: float) -> None:
        if self.ended:
            return
        self.tick_count += 1
        self._tick_players(dt)
        self._spawn(dt)
        self._tick_enemies(dt)
        self._tick_projectiles(dt)
        self._check_raid_state()

    # .................................................. player movement/cmd
    def _tick_players(self, dt: float) -> None:
        for rt in self.players.values():
            for t in ("attack_cd", "attack_active", "parry_cd", "parry_active",
                      "counter_ready", "invuln", "chat_ttl"):
                setattr(rt, t, max(0.0, getattr(rt, t) - dt))

            # The combo chain resets to the first swing if the player pauses.
            if rt.combo_window > 0:
                rt.combo_window = max(0.0, rt.combo_window - dt)
                if rt.combo_window == 0:
                    rt.combo_index = 0
            if rt.attack_active <= 0:
                rt.combo_active = -1

            if rt.dead:
                if self.mode == "overworld":
                    rt.respawn_in -= dt
                    if rt.respawn_in <= 0:
                        self._respawn(rt)
                continue

            dx = (rt.in_right - rt.in_left)
            dy = (rt.in_down - rt.in_up)
            if dx or dy:
                m = math.hypot(dx, dy)
                rt.x += (dx / m) * C.PLAYER_SPEED * dt
                rt.y += (dy / m) * C.PLAYER_SPEED * dt
                rt.x = max(C.PLAYER_RADIUS, min(C.ARENA_W - C.PLAYER_RADIUS, rt.x))
                rt.y = max(C.PLAYER_RADIUS, min(C.ARENA_H - C.PLAYER_RADIUS, rt.y))

            if rt.aim_x or rt.aim_y:
                rt.facing = math.atan2(rt.aim_y, rt.aim_x)

            # start a parry
            if rt.in_parry and rt.parry_cd <= 0 and rt.parry_active <= 0:
                rt.parry_active = C.PARRY_DURATION
                rt.parry_cd = C.PARRY_COOLDOWN

            # start the next swing of the 3-hit combo (down-up, up-down, thrust).
            # Cooldown between swings is short (COMBO_INTERVAL); the chain rests
            # longer after the finishing thrust. The "swift" passive speeds both.
            if rt.in_attack and rt.attack_cd <= 0 and rt.attack_active <= 0:
                idx = rt.combo_index
                rt.attack_active = C.ATTACK_ACTIVE
                rt.attack_hit_ids = set()
                rt.combo_active = idx
                rt.combo_window = C.COMBO_GRACE
                cd_mult = C.weapon_passive(rt.profile.weapon)["cd_mult"]
                counter = rt.counter_ready > 0
                rt.push_event("slash", index=idx, counter=counter)
                if idx >= C.COMBO_LEN - 1:
                    rt.attack_cd = C.COMBO_FINISH_INTERVAL * cd_mult
                    rt.combo_index = 0
                else:
                    rt.attack_cd = C.COMBO_INTERVAL * cd_mult
                    rt.combo_index = idx + 1

            if rt.attack_active > 0:
                self._resolve_slash(rt)

    def _resolve_slash(self, rt: PlayerRT) -> None:
        # The finishing thrust reaches a little further but through a tighter cone.
        is_thrust = rt.combo_active >= C.COMBO_LEN - 1
        reach = C.ATTACK_RANGE + (C.THRUST_RANGE_BONUS if is_thrust else 0.0)
        arc = C.THRUST_ARC if is_thrust else C.ATTACK_ARC
        targets = list(self.enemies)
        for e in targets:
            if e.id in rt.attack_hit_ids:
                continue
            d = dist(rt.x, rt.y, e.x, e.y)
            if d > reach + e.radius:
                continue
            ang = math.atan2(e.y - rt.y, e.x - rt.x)
            diff = abs((ang - rt.facing + math.pi) % (2 * math.pi) - math.pi)
            if diff > arc:
                continue
            rt.attack_hit_ids.add(e.id)
            dmg = float(rt.profile.attack)
            crit = random.random() < rt.profile.crit_chance
            if crit:
                dmg *= 2.0
            if rt.counter_ready > 0:
                dmg *= C.PARRY_BONUS
                rt.counter_ready = 0.0

            # --- weapon passives ---
            pw = C.weapon_passive(rt.profile.weapon)
            # "execute": bonus damage to low-HP enemies (checked pre-hit)
            if pw["key"] == "execute" and e.hp <= C.EXECUTE_THRESHOLD * e.max_hp:
                dmg *= C.EXECUTE_BONUS
            self._damage_enemy(e, dmg, rt, crit)
            if pw["key"] == "lifesteal" and not rt.dead and rt.hp > 0:
                rt.hp = min(rt.profile.max_hp, rt.hp + dmg * C.LIFESTEAL_PCT)
            elif pw["key"] == "frost":
                e.slow_timer = C.FROST_SLOW_TIME
            elif pw["key"] == "burn":
                e.burn_timer = C.BURN_TIME
                e.burn_dps = (rt.profile.attack * C.BURN_PCT) / C.BURN_TIME
                e.burn_by = rt

    def _respawn(self, rt: PlayerRT) -> None:
        rt.dead = False
        rt.hp = rt.profile.max_hp
        rt.x = C.ARENA_W / 2 + random.uniform(-60, 60)
        rt.y = C.ARENA_H / 2 + random.uniform(-60, 60)
        rt.invuln = 2.0
        rt.push_event("respawn")

    # .................................................. enemy spawn / AI
    def _spawn_boss(self) -> None:
        d = self.difficulty
        b = Enemy(
            id=self._eid(), kind="boss",
            x=C.ARENA_W / 2, y=C.ARENA_H / 4,
            hp=C.boss_hp(d), max_hp=C.boss_hp(d),
            dmg=C.boss_dmg(d), speed=70.0 + d, rng=70.0, cd=1.6, windup=0.7,
            radius=C.BOSS_RADIUS,
        )
        self.boss = b
        self.enemies.append(b)

    def _edge_point(self) -> tuple[float, float]:
        side = random.randint(0, 3)
        if side == 0:
            return random.uniform(0, C.ARENA_W), 20
        if side == 1:
            return random.uniform(0, C.ARENA_W), C.ARENA_H - 20
        if side == 2:
            return 20, random.uniform(0, C.ARENA_H)
        return C.ARENA_W - 20, random.uniform(0, C.ARENA_H)

    def _make_enemy(self, kind: str) -> Enemy:
        base = C.ENEMY_BASE[kind]
        x, y = self._edge_point()
        return Enemy(
            id=self._eid(), kind=kind, x=x, y=y,
            hp=C.enemy_hp(kind, self.difficulty), max_hp=C.enemy_hp(kind, self.difficulty),
            dmg=C.enemy_dmg(kind, self.difficulty),
            speed=base["speed"], rng=base["range"], cd=base["cd"], windup=base["windup"],
        )

    def _spawn(self, dt: float) -> None:
        n = max(1, len(self.players))
        if self.mode == "overworld":
            self.spawn_timer -= dt
            if self.spawn_timer <= 0 and len(self.enemies) < C.max_enemies(n):
                self.enemies.append(self._make_enemy(random.choice(["melee", "ranged"])))
                self.spawn_timer = C.spawn_interval(self.difficulty, n)
        else:  # raid: occasional minions alongside the boss
            self.add_timer -= dt
            if self.add_timer <= 0 and len([e for e in self.enemies if e.kind != "boss"]) < 4:
                self.enemies.append(self._make_enemy(random.choice(["melee", "ranged"])))
                self.add_timer = max(4.0, 9.0 - 0.1 * self.difficulty)

    def _nearest_player(self, e: Enemy) -> PlayerRT | None:
        best, bd = None, 1e9
        for rt in self.alive_players():
            d = dist(e.x, e.y, rt.x, rt.y)
            if d < bd:
                best, bd = rt, d
        return best

    def _tick_enemies(self, dt: float) -> None:
        # iterate a copy: burn damage-over-time can kill (and remove) enemies
        for e in list(self.enemies):
            if e.slow_timer > 0:
                e.slow_timer -= dt
            if e.burn_timer > 0:
                e.burn_timer -= dt
                e.hp -= e.burn_dps * dt
                if e.hp <= 0:
                    by = e.burn_by
                    if by is None or by.profile.id not in self.players or not by.alive:
                        by = self._nearest_player(e)
                    if by is not None:
                        self._kill_enemy(e, by)
                    elif e in self.enemies:
                        self.enemies.remove(e)
                    continue

            target = self._nearest_player(e)
            if target is None:
                continue
            e.facing = math.atan2(target.y - e.y, target.x - e.x)
            d = dist(e.x, e.y, target.x, target.y)
            e.atk_timer = max(0.0, e.atk_timer - dt)

            ranged = e.kind == "ranged"
            if ranged:
                want = e.rng * 0.55
                if d < want - 30:
                    self._move(e, target, -1, dt)
                elif d > want + 30:
                    self._move(e, target, 1, dt)
            else:
                if d > e.rng + e.radius + C.PLAYER_RADIUS - 4:
                    self._move(e, target, 1, dt)

            # windup -> strike
            if e.windup_timer > 0:
                e.windup_timer -= dt
                if e.windup_timer <= 0:
                    self._enemy_strike(e, target, ranged)
                    e.atk_timer = e.cd
            elif e.atk_timer <= 0:
                in_range = (d <= e.rng) if ranged else (d <= e.rng + e.radius + C.PLAYER_RADIUS)
                if in_range:
                    e.windup_timer = e.windup

    def _move(self, e: Enemy, target: PlayerRT, sign: int, dt: float) -> None:
        ang = math.atan2(target.y - e.y, target.x - e.x)
        spd = e.speed * (C.FROST_SLOW_MULT if e.slow_timer > 0 else 1.0)
        e.x += math.cos(ang) * spd * sign * dt
        e.y += math.sin(ang) * spd * sign * dt
        e.x = max(10, min(C.ARENA_W - 10, e.x))
        e.y = max(10, min(C.ARENA_H - 10, e.y))

    def _enemy_strike(self, e: Enemy, target: PlayerRT, ranged: bool) -> None:
        if ranged:
            ang = math.atan2(target.y - e.y, target.x - e.x)
            self.projectiles.append(Projectile(
                id=self._eid(), x=e.x, y=e.y,
                vx=math.cos(ang) * C.PROJECTILE_SPEED,
                vy=math.sin(ang) * C.PROJECTILE_SPEED,
                dmg=e.dmg,
            ))
            if e.kind == "boss":  # boss fires a small spread volley
                for off in (-0.25, 0.25):
                    self.projectiles.append(Projectile(
                        id=self._eid(), x=e.x, y=e.y,
                        vx=math.cos(ang + off) * C.PROJECTILE_SPEED,
                        vy=math.sin(ang + off) * C.PROJECTILE_SPEED,
                        dmg=e.dmg,
                    ))
            return
        # melee / boss smash: hit everyone still in range
        for rt in self.alive_players():
            if dist(e.x, e.y, rt.x, rt.y) <= e.rng + e.radius + C.PLAYER_RADIUS:
                self._damage_player(rt, e.dmg)

    # ............................................................ projectiles
    def _tick_projectiles(self, dt: float) -> None:
        survivors: list[Projectile] = []
        for pr in self.projectiles:
            pr.x += pr.vx * dt
            pr.y += pr.vy * dt
            pr.ttl -= dt
            if pr.ttl <= 0 or not (0 <= pr.x <= C.ARENA_W and 0 <= pr.y <= C.ARENA_H):
                continue
            hit = False
            for rt in self.alive_players():
                if dist(pr.x, pr.y, rt.x, rt.y) <= C.PROJECTILE_RADIUS + C.PLAYER_RADIUS:
                    self._damage_player(rt, pr.dmg)
                    hit = True
                    break
            if not hit:
                survivors.append(pr)
        self.projectiles = survivors

    # ............................................................ combat dmg
    def _damage_player(self, rt: PlayerRT, dmg: float) -> None:
        if rt.dead or rt.invuln > 0:
            return
        if rt.parry_active > 0:
            rt.parry_active = 0.0
            rt.counter_ready = C.PARRY_COUNTER_WINDOW
            rt.invuln = 0.25
            rt.push_event("parry")
            return
        rt.hp -= dmg
        rt.push_event("hurt", dmg=int(dmg))
        if rt.hp <= 0:
            self._kill_player(rt)

    def _kill_player(self, rt: PlayerRT) -> None:
        rt.dead = True
        rt.hp = 0
        p = rt.profile
        if self.mode == "overworld":
            lost_g = int(p.gold * C.DEATH_GOLD_LOSS)
            lost_e = int(p.exp * C.DEATH_EXP_LOSS)
            p.gold = max(0, p.gold - lost_g)
            p.exp = max(0, p.exp - lost_e)
            p.dirty = True
            rt.respawn_in = C.RESPAWN_DELAY
            rt.push_event("death", gold_lost=lost_g, exp_lost=lost_e)
        else:
            rt.push_event("death", gold_lost=0, exp_lost=0)

    def _damage_enemy(self, e: Enemy, dmg: float, by: PlayerRT, crit: bool) -> None:
        e.hp -= dmg
        by.push_event("hit", crit=crit, dmg=int(dmg), x=e.x, y=e.y)
        if e.hp <= 0:
            self._kill_enemy(e, by)

    def _kill_enemy(self, e: Enemy, by: PlayerRT) -> None:
        if e not in self.enemies:
            return
        self.enemies.remove(e)
        if e.kind == "boss":
            self.boss = None
            self._clear_raid(by)
            return
        exp, gold = C.enemy_reward(self.difficulty)
        # Shared: every alive ally close enough gets the full reward.
        recipients = [
            rt for rt in self.alive_players()
            if dist(rt.x, rt.y, e.x, e.y) <= C.SHARE_RADIUS
        ]
        if by not in recipients and by.alive:
            recipients.append(by)
        for rt in recipients:
            leveled = rt.profile.grant(exp, gold)
            rt.push_event("reward", exp=exp, gold=gold, x=e.x, y=e.y)
            for lvl in leveled:
                rt.hp = rt.profile.max_hp
                rt.push_event("levelup", level=lvl)

    # ............................................................ raid logic
    def _clear_raid(self, by: PlayerRT) -> None:
        self.cleared = True
        self.ended = True
        d = self.difficulty
        exp, gold = C.boss_reward(d)
        for rt in self.alive_players():
            p = rt.profile
            first = p.cleared_raid < d
            bonus = C.first_clear_bonus_gold(d) if first else 0
            leveled = p.grant(exp, gold + bonus)
            # Clearing difficulty d cascades: everything below counts as cleared.
            if p.cleared_raid < d:
                p.cleared_raid = d
                p.dirty = True
            rt.push_event(
                "raid_clear", difficulty=d, exp=exp, gold=gold,
                first_clear=first, bonus_gold=bonus,
            )
            for lvl in leveled:
                rt.push_event("levelup", level=lvl)

    def _check_raid_state(self) -> None:
        if self.mode != "raid" or self.ended:
            return
        if self.players and not self.alive_players():
            self.ended = True
            for rt in self.players.values():
                rt.push_event("raid_failed", message="The party has fallen. No rewards lost.")

    # ............................................................ snapshot
    def snapshot(self) -> dict:
        return {
            "type": "state",
            "t": self.tick_count,
            "mode": self.mode,
            "difficulty": self.difficulty,
            "code": self.code,
            "ended": self.ended,
            "cleared": self.cleared,
            "boss": (
                {"hp": int(self.boss.hp), "maxHp": int(self.boss.max_hp)}
                if self.boss else None
            ),
            "players": [
                {
                    "id": rt.profile.id,
                    "name": rt.profile.nickname,
                    "lvl": rt.profile.level,
                    "x": round(rt.x, 1),
                    "y": round(rt.y, 1),
                    "hp": int(max(0, rt.hp)),
                    "maxHp": rt.profile.max_hp,
                    "facing": round(rt.facing, 3),
                    "dead": rt.dead,
                    "atk": rt.attack_active > 0,
                    "combo": rt.combo_active,
                    "parry": rt.parry_active > 0,
                    "counter": rt.counter_ready > 0,
                    "chat": rt.chat_text if rt.chat_ttl > 0 else "",
                }
                for rt in self.players.values()
            ],
            "enemies": [
                {
                    "id": e.id, "kind": e.kind,
                    "x": round(e.x, 1), "y": round(e.y, 1),
                    "hp": int(max(0, e.hp)), "maxHp": int(e.max_hp),
                    "facing": round(e.facing, 3),
                    "wind": e.windup_timer > 0,
                }
                for e in self.enemies
            ],
            "projectiles": [
                {
                    "id": p.id, "x": round(p.x, 1), "y": round(p.y, 1),
                    "a": round(math.atan2(p.vy, p.vx), 3),
                }
                for p in self.projectiles
            ],
        }

    def stats_for(self, pid: int) -> dict | None:
        rt = self.players.get(pid)
        if rt is None:
            return None
        p = rt.profile
        return {
            "type": "stats",
            "level": p.level,
            "exp": p.exp,
            "expToNext": C.exp_to_next(p.level),
            "gold": p.gold,
            "hp": int(max(0, rt.hp)),
            "maxHp": p.max_hp,
            "attack": p.attack,
            "critChance": round(p.crit_chance, 4),
            "weapon": p.weapon,
            "potions": p.potions,
            "clearedRaid": p.cleared_raid,
            "dead": rt.dead,
        }
