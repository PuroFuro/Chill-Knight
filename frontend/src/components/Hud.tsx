import type { Buff, StatsMsg } from "../types";

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
  isTouch = false,
  onPotion,
}: {
  stats: StatsMsg | null;
  meta: { mode: string; difficulty: number; code: string | null; started?: boolean };
  boss: { hp: number; maxHp: number } | null;
  events: GameEvent[];
  // On touch the potion lives on the on-screen controls instead, and the vitals
  // must not swallow touches meant for the aim stick beneath them.
  isTouch?: boolean;
  onPotion: () => void;
}) {
  const hpPct = stats ? stats.hp / stats.maxHp : 0;
  const expPct = stats && stats.expToNext > 0 ? stats.exp / stats.expToNext : 1;
  const isLobby = meta.mode === "raid" && meta.started === false;

  return (
    <>
      {/* top-center: world title + (raid) code + boss bar */}
      <div className="pointer-events-none absolute left-1/2 top-5 -translate-x-1/2 text-center">
        <h2 className="font-display text-3xl font-bold text-ink">
          {isLobby
            ? "Raid Lobby"
            : `${meta.mode === "raid" ? "Raid" : "Overworld"} - Difficulty ${meta.difficulty}`}
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

      {/* bottom-right: vitals (with the active-buff tray sitting just above).
          The wrapper is click-through so it never blocks the touch aim stick;
          the interactive bits re-enable pointer events on themselves. */}
      <div className="pointer-events-none absolute bottom-4 right-4 w-72">
        <Buffs buffs={stats?.buffs ?? []} isTouch={isTouch} />
        <div className="mb-1 text-right text-sm leading-tight">
          <div>Lv : {stats?.level ?? "-"}</div>
          <div>
            Gold : <span className="text-gold">{stats?.gold ?? 0}g</span>
          </div>
          {!isTouch && (
            <button
              className="pointer-events-auto mt-0.5 rounded border border-ink bg-panel px-2 py-0.5 text-xs hover:bg-black/5"
              onClick={onPotion}
            >
              🧪 {stats?.potions ?? 0} (H)
            </button>
          )}
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
            className={`ck-toast rounded-md border border-ink px-3 py-1 text-sm shadow ${
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

// A 1–2 letter glyph for a buff chip, from the initials of its name.
function buffGlyph(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Active-buff tray shown just above the vitals: one chip per buff with its
 * stack/parry count, a countdown bar for timed buffs, and a hover tooltip
 * describing what it does.
 */
function Buffs({ buffs, isTouch = false }: { buffs: Buff[]; isTouch?: boolean }) {
  if (!buffs.length) return null;
  // Hover tooltips are useless on touch, so let the tray be click-through there
  // (it shares the bottom-right corner with the on-screen action buttons).
  return (
    <div
      className={`mb-2 flex flex-wrap justify-end gap-1.5 ${
        isTouch ? "pointer-events-none" : "pointer-events-auto"
      }`}
    >
      {buffs.map((b) => {
        const pct =
          b.duration > 0 ? Math.max(0, Math.min(1, b.remaining / b.duration)) : 1;
        return (
          <div key={b.key} className="group relative">
            <div
              className="relative flex h-11 w-11 items-center justify-center rounded-md border-2 bg-panel shadow"
              style={{ borderColor: b.color }}
            >
              <span className="text-sm font-bold" style={{ color: b.color }}>
                {buffGlyph(b.name)}
              </span>
              {/* stack / parry count (hidden for countless buffs like the invasion) */}
              {b.count > 0 && (
                <span
                  className="absolute -right-1.5 -top-1.5 rounded-full px-1 text-[10px] font-bold leading-tight text-paper"
                  style={{ background: b.color }}
                >
                  ×{b.count}
                </span>
              )}
              {/* countdown bar for timed buffs */}
              {b.duration > 0 && (
                <div className="absolute inset-x-1 bottom-1 h-1 overflow-hidden rounded bg-black/15">
                  <div
                    className="h-full"
                    style={{ width: `${pct * 100}%`, background: b.color }}
                  />
                </div>
              )}
            </div>
            {/* hover tooltip */}
            <div className="pointer-events-none absolute bottom-full right-0 z-10 mb-2 hidden w-56 rounded-md border border-ink bg-panel p-2 text-left text-xs shadow-lg group-hover:block">
              <div className="font-bold" style={{ color: b.color }}>
                {b.name}
                {b.count > 1 ? ` ×${b.count}` : ""}
              </div>
              <div className="mt-0.5 text-muted">{b.desc}</div>
              {b.duration > 0 && (
                <div className="mt-1 text-muted">{b.remaining.toFixed(1)}s left</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
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
