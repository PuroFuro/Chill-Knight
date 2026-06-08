import { useState } from "react";
import type { Player } from "../types";
import HowToPlay from "./HowToPlay";
import Shop from "./Shop";

type Panel = "shop" | "help" | null;

/**
 * The Shop / How-to-play buttons that live in the top-left of both the menu
 * screen and the overworld. Clicking a button pops out its panel as a modal
 * overlay; clicking the backdrop or ✕ closes it.
 */
export default function MenuButtons({
  token,
  player,
  onPlayer,
}: {
  token: string;
  player: Player;
  onPlayer: (p: Player) => void;
}) {
  const [open, setOpen] = useState<Panel>(null);

  return (
    <>
      <div className="flex gap-2">
        <button
          className="ck-btn px-3 py-1.5 text-sm"
          onClick={() => setOpen((o) => (o === "shop" ? null : "shop"))}
        >
          🛒 Shop
        </button>
        <button
          className="ck-btn px-3 py-1.5 text-sm"
          onClick={() => setOpen((o) => (o === "help" ? null : "help"))}
        >
          ❓ How to Play
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(null)}
        >
          <div
            className="relative max-h-[85vh] w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute right-2 top-2 z-10 rounded px-2 py-0.5 text-gray-400 hover:bg-white/10 hover:text-gray-100"
              onClick={() => setOpen(null)}
            >
              ✕
            </button>
            {open === "shop" ? (
              <div className="h-[80vh]">
                <Shop token={token} player={player} onPlayer={onPlayer} />
              </div>
            ) : (
              <div className="ck-panel max-h-[85vh] overflow-y-auto p-5">
                <HowToPlay />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
