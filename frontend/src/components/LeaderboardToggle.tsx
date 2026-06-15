import { useEffect, useState } from "react";
import Leaderboard from "./Leaderboard";

/**
 * Top-right leaderboard. Collapsed to just the "Leaderboard" header; click it
 * or press "L" to drop down the full table. (See reference-design/Overworld.png
 * and Menu pop out.png.)
 */
export default function LeaderboardToggle() {
  const [open, setOpen] = useState(false);

  // "L" toggles the dropdown (unless the user is typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement;
      const typing =
        ae instanceof HTMLInputElement || ae instanceof HTMLTextAreaElement;
      if (!typing && (e.key === "l" || e.key === "L")) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="absolute right-4 top-4 w-48">
      <div className="ck-panel overflow-hidden">
        <button
          className="flex w-full items-center justify-between px-3 py-1.5 text-sm hover:bg-black/5"
          onClick={() => setOpen((o) => !o)}
        >
          <span>Leaderboard</span>
          <span>{open ? "˄" : "˅"}</span>
        </button>
        {open && (
          <div className="border-t border-ink px-3 py-2">
            <Leaderboard />
          </div>
        )}
      </div>
    </div>
  );
}
