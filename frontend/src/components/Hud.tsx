import type { StatsMsg } from "../types";

export interface GameEvent {
  id: number;
  text: string;
  tone: "good" | "bad" | "info";
}

/**
 * Overworld HUD: the world title (top-center) and the player's vitals
 * (bottom-right) — gold, level, EXP and Health bars. (See
 * reference-design/Overworld.png.) Crit chance is intentionally omitted.
 */
export default function Hud({
  stats,
  meta,
  boss,
  events,
  onPotion,
}: {
  stats: StatsMsg | null;
  meta: { mode: string; difficulty: number; code: string | null };
  boss: { hp: number; maxHp: number } | null;
  events: GameEvent[];
  onPotion: () => void;
}) {
  const hpPct = stats ? stats.hp / stats.maxHp : 0;
  const expPct = stats && stats.expToNext > 0 ? stats.exp / stats.expToNext : 1;
  const title = meta.mode === "raid" ? "Raid" : "Overworld";

  return (
    <>
      {/* top-center: world title + (raid) code + boss bar */}
      <div className="pointer-events-none absolute left-1/2 top-5 -translate-x-1/2 text-center">
        <h2 className="font-display text-3xl font-bold text-ink">
          {title} - Difficulty {meta.difficulty}
        </h2>
        {meta.mode === "raid" && meta.code && (
          <div className="mt-1 text-sm text-muted">
            Raid code: <span className="font-bold text-ink">{meta.code}</span>
          </div>
        )}
        {boss && (
          <div className="mx-auto mt-2 w-72">
            <StatBar
              pct={boss.hp / boss.maxHp}
              color="#a855f7"
              label="BOSS"
              value={`${boss.hp}/${boss.maxHp}`}
            />
          </div>
        )}
      </div>

      {/* bottom-right: vitals */}
      <div className="absolute bottom-4 right-4 w-72">
        <div className="mb-1 text-right text-sm leading-tight">
          <div>Lv : {stats?.level ?? "-"}</div>
          <div>
            Gold : <span className="text-gold">{stats?.gold ?? 0}g</span>
          </div>
          <button
            className="mt-0.5 rounded border border-ink bg-panel px-2 py-0.5 text-xs hover:bg-black/5"
            onClick={onPotion}
          >
            🧪 {stats?.potions ?? 0} (H)
          </button>
        </div>
        <div className="space-y-1.5">
          <StatBar
            pct={expPct}
            color="#22d3ee"
            label="Exp:"
            value={
              stats && stats.expToNext > 0
                ? `${stats.exp}/${stats.expToNext}`
                : "MAX"
            }
          />
          <StatBar
            pct={hpPct}
            color="#4ade80"
            label="Health:"
            value={`${stats?.hp ?? 0}/${stats?.maxHp ?? 0}`}
          />
        </div>
      </div>

      {/* event toasts (bottom-center) */}
      <div className="pointer-events-none absolute bottom-4 left-1/2 flex w-80 -translate-x-1/2 flex-col items-center gap-1">
        {events.slice(-4).map((e) => (
          <div
            key={e.id}
            className={`rounded-md border border-ink px-3 py-1 text-sm shadow ${
              e.tone === "good"
                ? "bg-hp/80 text-ink"
                : e.tone === "bad"
                ? "bg-danger/90 text-paper"
                : "bg-panel text-ink"
            }`}
          >
            {e.text}
          </div>
        ))}
      </div>
    </>
  );
}

function StatBar({
  pct,
  color,
  label,
  value,
}: {
  pct: number;
  color: string;
  label: string;
  value: string;
}) {
  return (
    <div className="relative h-7 w-full overflow-hidden rounded border border-ink bg-panel">
      <div
        className="h-full"
        style={{
          width: `${Math.max(0, Math.min(1, pct)) * 100}%`,
          background: color,
        }}
      />
      <span className="absolute inset-0 flex items-center justify-between px-3 text-sm text-ink">
        <span>{label}</span>
        <span>{value}</span>
      </span>
    </div>
  );
}
