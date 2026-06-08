import { useState } from "react";
import Leaderboard from "./Leaderboard";

/**
 * Top-right leaderboard for the overworld. Collapsed to a single button by
 * default; clicking it pops the board out (and clicking again hides it).
 */
export default function LeaderboardToggle() {
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute right-4 top-16 flex w-72 flex-col items-end">
      <button
        className="ck-btn px-3 py-1.5 text-sm"
        onClick={() => setOpen((o) => !o)}
      >
        🏆 Leaderboard {open ? "▲" : "▼"}
      </button>
      {open && (
        <div className="mt-2 h-80 w-full">
          <Leaderboard />
        </div>
      )}
    </div>
  );
}
