import { useEffect, useState } from "react";
import { api } from "../api";
import type { LeaderboardEntry } from "../types";

/**
 * Compact leaderboard table — top knights by level then highest raid cleared.
 * (See reference-design/Overworld.png: columns # Name / Lv / Raid.)
 */
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
    <table className="w-full text-sm">
      <thead className="text-left text-muted">
        <tr>
          <th className="pb-1 font-normal"># Name</th>
          <th className="pb-1 text-right font-normal">Lv</th>
          <th className="pb-1 text-right font-normal">Raid</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.rank}>
            <td className="py-0.5 pr-4">
              {r.rank}. {r.nickname}
            </td>
            <td className="py-0.5 text-right">{r.level}</td>
            <td className="py-0.5 text-right">{r.cleared_raid}</td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={3} className="py-2 text-center text-muted">
              No knights ranked yet
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
