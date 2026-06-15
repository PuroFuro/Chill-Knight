import { useEffect, useState } from "react";
import type { Player } from "../types";
import ChangeDifficultyPopout from "./popouts/ChangeDifficultyPopout";
import HowToPlayPopout from "./popouts/HowToPlayPopout";
import InventoryPopout from "./popouts/InventoryPopout";
import RaidPopout from "./popouts/RaidPopout";
import ShopPopout from "./popouts/ShopPopout";

type Panel = "shop" | "inventory" | "raid" | "help" | "difficulty" | null;

/**
 * Top-left hamburger menu and the pop-outs it opens (Shop, Inventory, Raid, How
 * to Play, Change Difficulty), plus Leave and Logout. Open the menu with the ☰
 * button or Esc. (See reference-design/Menu pop out.png.)
 */
export default function OverworldMenu({
  token,
  player,
  onPlayer,
  meta,
  onCreateRaid,
  onJoinRaid,
  onChangeDifficulty,
  onLogout,
}: {
  token: string;
  player: Player;
  onPlayer: (p: Player) => void;
  meta: { difficulty: number };
  onCreateRaid: () => void;
  onJoinRaid: (code: string) => void;
  onChangeDifficulty: (difficulty: number) => void;
  onLogout: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);

  // Esc: close an open panel, otherwise toggle the menu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement;
      const typing =
        ae instanceof HTMLInputElement || ae instanceof HTMLTextAreaElement;
      if (e.key !== "Escape") return;
      if (typing) return;
      e.preventDefault();
      if (panel) setPanel(null);
      else setMenuOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel]);

  function open(p: Panel) {
    setPanel(p);
    setMenuOpen(false);
  }

  const items: { label: string; action: () => void }[] = [
    { label: "Shop", action: () => open("shop") },
    { label: "Inventory", action: () => open("inventory") },
    { label: "Raid", action: () => open("raid") },
    { label: "How to play", action: () => open("help") },
    { label: "Change Difficulty", action: () => open("difficulty") },
    { label: "Logout", action: onLogout },
  ];

  return (
    <>
      {/* hamburger */}
      <button
        className="absolute left-4 top-4 flex h-11 w-11 items-center justify-center rounded-md border border-ink bg-panel text-xl hover:bg-black/5"
        onClick={() => setMenuOpen((o) => !o)}
        aria-label="Menu"
      >
        ☰
      </button>

      {/* menu list */}
      {menuOpen && (
        <div className="ck-panel absolute left-4 top-4 w-56 p-2">
          <div className="flex justify-end">
            <button
              className="flex h-5 w-5 items-center justify-center rounded border border-ink text-xs hover:bg-black/5"
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
            >
              ✕
            </button>
          </div>
          <ul className="px-1 pb-1 text-lg">
            {items.map((it) => (
              <li key={it.label}>
                <button
                  className="block w-full py-0.5 text-left hover:opacity-60"
                  onClick={it.action}
                >
                  {it.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {panel === "shop" && (
        <ShopPopout
          token={token}
          player={player}
          onPlayer={onPlayer}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "inventory" && (
        <InventoryPopout
          token={token}
          player={player}
          onPlayer={onPlayer}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "raid" && (
        <RaidPopout
          onCreate={() => {
            onCreateRaid();
            setPanel(null);
          }}
          onJoin={(code) => {
            onJoinRaid(code);
            setPanel(null);
          }}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "help" && <HowToPlayPopout onClose={() => setPanel(null)} />}
      {panel === "difficulty" && (
        <ChangeDifficultyPopout
          current={meta.difficulty}
          onApply={(d) => {
            onChangeDifficulty(d);
            setPanel(null);
          }}
          onClose={() => setPanel(null)}
        />
      )}
    </>
  );
}
