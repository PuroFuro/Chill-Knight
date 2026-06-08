import { useState } from "react";
import type { Player } from "../types";
import MenuButtons from "./MenuButtons";

export default function Lobby({
  token,
  player,
  onPlayer,
  onEnter,
  onLogout,
}: {
  token: string;
  player: Player;
  onPlayer: (p: Player) => void;
  onEnter: (mode: "overworld" | "raid", difficulty: number, code?: string) => void;
  onLogout: () => void;
}) {
  const [difficulty, setDifficulty] = useState(1);
  const [joinCode, setJoinCode] = useState("");

  return (
    <div className="flex h-full flex-col bg-knight-bg p-4">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-knight-accent">⚔️ Chill Knight</h1>
          <MenuButtons token={token} player={player} onPlayer={onPlayer} />
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="font-semibold">{player.nickname}</span>
          <span className="text-knight-accent2">Lv {player.level}</span>
          <span className="text-knight-gold">{player.gold}g</span>
          <span className="text-gray-400">Raid cleared: {player.cleared_raid}</span>
          <button className="ck-btn px-3 py-1 text-xs" onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center gap-4 overflow-hidden">
        {/* Your Knight */}
        <div className="ck-panel w-72 p-5">
          <h2 className="mb-3 text-lg font-bold text-knight-accent">
            Your Knight
          </h2>
          <ul className="space-y-1.5 text-sm">
            <Stat label="Level" value={`${player.level} / 60`} />
            <Stat
              label="EXP"
              value={`${player.exp} / ${player.exp_to_next || "MAX"}`}
            />
            <Stat label="Health" value={`${player.max_hp}`} />
            <Stat label="Attack" value={`${player.attack}`} />
            <Stat
              label="Crit chance"
              value={`${Math.round(player.crit_chance * 100)}%`}
            />
            <Stat label="Weapon" value={player.weapon.replace(/_/g, " ")} />
            <Stat label="Potions" value={`${player.potions}`} />
          </ul>
        </div>

        {/* Adventure */}
        <div className="ck-panel w-96 p-5">
          <h2 className="mb-3 text-lg font-bold text-knight-accent">Adventure</h2>
          <label className="text-sm text-gray-400">
            Difficulty:{" "}
            <span className="font-bold text-knight-accent2">{difficulty}</span>{" "}
            <span className="text-xs text-gray-500">(1–50)</span>
          </label>
          <input
            type="range"
            min={1}
            max={50}
            value={difficulty}
            onChange={(e) => setDifficulty(Number(e.target.value))}
            className="my-3 w-full accent-knight-accent2"
          />
          <p className="mb-4 text-xs text-gray-500">
            Higher difficulty = tougher mobs but far more exp &amp; gold. Go as
            high as you dare — if you're too weak, you'll just die (and only lose
            a little).
          </p>
          <button
            className="ck-btn-primary mb-2 w-full"
            onClick={() => onEnter("overworld", difficulty)}
          >
            Enter Overworld (Lv {difficulty})
          </button>
          <button
            className="ck-btn w-full"
            onClick={() => onEnter("raid", difficulty)}
          >
            Start Raid (Lv {difficulty})
          </button>

          <div className="mt-4 border-t border-white/10 pt-4">
            <label className="text-sm text-gray-400">Join a friend's raid</label>
            <div className="mt-2 flex gap-2">
              <input
                className="ck-input uppercase"
                placeholder="CODE"
                maxLength={5}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              />
              <button
                className="ck-btn whitespace-nowrap"
                disabled={joinCode.length < 4}
                onClick={() => onEnter("raid", difficulty, joinCode.trim())}
              >
                Join
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium capitalize">{value}</span>
    </li>
  );
}
