import PopoutShell from "./PopoutShell";

/**
 * How to Play pop-out (see reference-design/How to Play.png): a quick reference
 * of how the game works and every key the player can press.
 */
export default function HowToPlayPopout({ onClose }: { onClose: () => void }) {
  return (
    <PopoutShell onClose={onClose} className="w-[460px] max-w-[94vw] p-5">
      <h2 className="mb-3 pr-8 font-display text-xl font-bold">How to Play</h2>

      <p className="mb-3 text-sm text-muted">
        Wander the overworld and slay mobs to earn exp and gold. Kills near
        allies are shared. Raids spawn a boss — the first clear pays a bonus and
        unlocks gear. Push the difficulty as high as you dare.
      </p>

      <ul className="space-y-1.5 text-sm">
        <Key k="WASD / Arrows" v="Move" />
        <Key k="Mouse" v="Aim your slash" />
        <Key k="Left-click / J" v="Slash attack" />
        <Key k="Space / K" v="Parry — time it as an enemy winds up to negate the hit and power up your next slash" />
        <Key k="H" v="Drink a health potion" />
        <Key k="T" v="Open chat and type" />
        <Key k="Esc" v="Open / close the menu" />
        <Key k="L" v="Toggle the leaderboard" />
      </ul>

      <p className="mt-4 text-xs text-muted">
        Open the menu (top-left ☰ or Esc) for the Shop, Inventory, Raid, and to
        change the world difficulty.
      </p>
    </PopoutShell>
  );
}

function Key({ k, v }: { k: string; v: string }) {
  return (
    <li className="flex gap-3">
      <span className="w-32 shrink-0 font-bold">{k}</span>
      <span className="text-muted">{v}</span>
    </li>
  );
}
