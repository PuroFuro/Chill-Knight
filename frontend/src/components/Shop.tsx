import { useEffect, useState } from "react";
import { api } from "../api";
import type { Player, ShopItem } from "../types";

export default function Shop({
  token,
  player,
  onPlayer,
}: {
  token: string;
  player: Player;
  onPlayer: (p: Player) => void;
}) {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.shop().then(setItems).catch(() => setMsg("Could not load shop"));
  }, []);

  async function act(fn: Promise<Player>, ok: string) {
    setMsg("");
    try {
      onPlayer(await fn);
      setMsg(ok);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  }

  const weapons = items.filter((i) => i.kind === "weapon");
  const potion = items.find((i) => i.kind === "potion");

  return (
    <div className="ck-panel flex h-full flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-knight-accent">🛒 Shop</h2>
        <span className="text-sm text-knight-gold">{player.gold} gold</span>
      </div>
      {msg && <p className="mb-2 text-xs text-knight-accent2">{msg}</p>}

      <div className="flex-1 space-y-2 overflow-y-auto pr-1">
        {weapons.map((w) => {
          const owned = player.owned_weapons.includes(w.key);
          const equipped = player.weapon === w.key;
          const locked = player.cleared_raid < w.requires_raid;
          return (
            <div
              key={w.key}
              className="rounded-md border border-white/5 bg-knight-panel2 p-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">{w.name}</span>
                <span className="text-xs text-knight-gold">
                  {w.price > 0 ? `${w.price}g` : "free"}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-gray-400">{w.description}</p>
              <p className="mt-1 text-xs text-gray-300">
                +{w.attack} ATK · +{Math.round(w.crit_bonus * 100)}% crit
                {w.requires_raid > 0 && (
                  <span className={locked ? "text-knight-danger" : "text-knight-accent"}>
                    {" "}
                    · raid {w.requires_raid}
                  </span>
                )}
              </p>
              <div className="mt-2 flex gap-2">
                {equipped ? (
                  <span className="rounded bg-knight-accent/20 px-2 py-1 text-xs text-knight-accent">
                    Equipped
                  </span>
                ) : owned ? (
                  <button
                    className="ck-btn px-2 py-1 text-xs"
                    onClick={() => act(api.equip(w.key, token), `Equipped ${w.name}`)}
                  >
                    Equip
                  </button>
                ) : (
                  <button
                    className="ck-btn-primary px-2 py-1 text-xs"
                    disabled={locked || player.gold < w.price}
                    onClick={() => act(api.buy(w.key, token), `Bought ${w.name}`)}
                  >
                    {locked ? `Locked` : "Buy"}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {potion && (
          <div className="rounded-md border border-white/5 bg-knight-panel2 p-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold">
                {potion.name}{" "}
                <span className="text-xs text-gray-400">(have {player.potions})</span>
              </span>
              <span className="text-xs text-knight-gold">{potion.price}g</span>
            </div>
            <p className="mt-0.5 text-xs text-gray-400">{potion.description}</p>
            <button
              className="ck-btn-primary mt-2 px-2 py-1 text-xs"
              disabled={player.gold < potion.price}
              onClick={() => act(api.buy(potion.key, token), "Bought a potion")}
            >
              Buy potion
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
