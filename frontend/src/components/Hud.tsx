import { useState } from "react";
import type { StatsMsg } from "../types";

export interface GameEvent {
  id: number;
  text: string;
  tone: "good" | "bad" | "info";
}

export default function Hud({
  stats,
  meta,
  boss,
  events,
  onLeave,
  onPotion,
  onJoinRaid,
  onTypingChange,
}: {
  stats: StatsMsg | null;
  meta: { mode: string; difficulty: number; code: string | null };
  boss: { hp: number; maxHp: number } | null;
  events: GameEvent[];
  onLeave: () => void;
  onPotion: () => void;
  onJoinRaid: (code: string) => void;
  onTypingChange: (typing: boolean) => void;
}) {
  const [raidCode, setRaidCode] = useState("");
  const hpPct = stats ? stats.hp / stats.maxHp : 0;
  const expPct =
    stats && stats.expToNext > 0 ? stats.exp / stats.expToNext : 1;

  return (
    <>
      {/* top-left vitals */}
      <div className="pointer-events-none absolute left-4 top-4 w-72">
        <div className="ck-panel pointer-events-auto p-3">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-bold text-knight-accent2">
              Lv {stats?.level ?? "-"}
            </span>
            <span className="text-knight-gold">{stats?.gold ?? 0}g</span>
          </div>
          <Meter pct={hpPct} color="bg-green-500" label={`HP ${stats?.hp ?? 0}/${stats?.maxHp ?? 0}`} />
          <div className="h-1.5" />
          <Meter
            pct={expPct}
            color="bg-knight-accent2"
            label={
              stats && stats.expToNext > 0
                ? `EXP ${stats.exp}/${stats.expToNext}`
                : "EXP MAX"
            }
          />
          <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
            <span>ATK {stats?.attack ?? 0}</span>
            <span>Crit {Math.round((stats?.critChance ?? 0) * 100)}%</span>
            <button
              className="pointer-events-auto rounded bg-knight-panel2 px-2 py-0.5 text-gray-200 hover:bg-knight-accent2/30"
              onClick={onPotion}
            >
              🧪 {stats?.potions ?? 0} (H)
            </button>
          </div>
        </div>
      </div>

      {/* top-center: world / raid info + (overworld) raid-code join */}
      <div className="absolute left-1/2 top-4 flex -translate-x-1/2 items-start gap-2">
        <div className="ck-panel px-4 py-2 text-center">
          <div className="text-sm font-semibold capitalize text-knight-accent">
            {meta.mode} · Difficulty {meta.difficulty}
          </div>
          {meta.mode === "raid" && meta.code && (
            <div className="text-xs text-gray-400">
              Invite code: <span className="font-mono text-knight-gold">{meta.code}</span>
            </div>
          )}
          {boss && (
            <div className="mt-1 w-64">
              <Meter
                pct={boss.hp / boss.maxHp}
                color="bg-purple-500"
                label={`BOSS ${boss.hp}/${boss.maxHp}`}
              />
            </div>
          )}
        </div>

        {meta.mode === "overworld" && (
          <form
            className="ck-panel flex items-center gap-1.5 px-2 py-2"
            onSubmit={(e) => {
              e.preventDefault();
              const c = raidCode.trim();
              if (c.length >= 4) onJoinRaid(c);
            }}
          >
            <input
              className="ck-input w-24 px-2 py-1 text-sm uppercase"
              placeholder="RAID CODE"
              maxLength={5}
              value={raidCode}
              onChange={(e) => setRaidCode(e.target.value.toUpperCase())}
              onFocus={() => onTypingChange(true)}
              onBlur={() => onTypingChange(false)}
            />
            <button
              type="submit"
              className="ck-btn px-2 py-1 text-xs"
              disabled={raidCode.trim().length < 4}
            >
              Join Raid
            </button>
          </form>
        )}
      </div>

      {/* top-right: leave */}
      <button
        className="ck-btn absolute right-4 top-4 px-3 py-1.5 text-sm"
        onClick={onLeave}
      >
        ← Leave
      </button>

      {/* event toasts */}
      <div className="pointer-events-none absolute bottom-4 left-1/2 flex w-80 -translate-x-1/2 flex-col items-center gap-1">
        {events.slice(-4).map((e) => (
          <div
            key={e.id}
            className={`rounded-md px-3 py-1 text-sm font-medium shadow-lg ${
              e.tone === "good"
                ? "bg-knight-accent/90 text-knight-bg"
                : e.tone === "bad"
                ? "bg-knight-danger/90 text-white"
                : "bg-knight-panel2/95 text-gray-100"
            }`}
          >
            {e.text}
          </div>
        ))}
      </div>
    </>
  );
}

function Meter({
  pct,
  color,
  label,
}: {
  pct: number;
  color: string;
  label: string;
}) {
  return (
    <div className="relative h-4 w-full overflow-hidden rounded bg-black/50">
      <div
        className={`h-full ${color} transition-all duration-150`}
        style={{ width: `${Math.max(0, Math.min(1, pct)) * 100}%` }}
      />
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-white/90">
        {label}
      </span>
    </div>
  );
}
