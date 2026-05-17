import { useEffect, useState } from "react";
import { api } from "../api";
import type { LeaderboardEntry } from "../types";

export default function Leaderboard({ refreshKey }: { refreshKey?: number }) {
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    let active = true;
    const load = () =>
      api
        .leaderboard()
        .then((r) => active && setRows(r))
        .catch(() => {});
    load();
    const t = setInterval(load, 10000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [refreshKey]);

  return (
    <div className="ck-panel flex h-full flex-col p-4">
      <h2 className="mb-3 text-lg font-bold text-knight-accent">🏆 Leaderboard</h2>
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-gray-500">
            <tr>
              <th className="pb-2">#</th>
              <th className="pb-2">Knight</th>
              <th className="pb-2 text-right">Lvl</th>
              <th className="pb-2 text-right">Raid</th>
              <th className="pb-2 text-right">Gold</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.rank} className="border-t border-white/5">
                <td className="py-1.5 text-gray-500">{r.rank}</td>
                <td className="py-1.5 font-medium">{r.nickname}</td>
                <td className="py-1.5 text-right text-knight-accent2">{r.level}</td>
                <td className="py-1.5 text-right text-knight-accent">
                  {r.cleared_raid}
                </td>
                <td className="py-1.5 text-right text-knight-gold">{r.gold}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-gray-500">
                  No knights ranked yet — be the first!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
