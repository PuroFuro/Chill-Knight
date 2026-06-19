import { useEffect, useState } from "react";
import { api } from "../../api";
import type { Player, ShopItem } from "../../types";
import PopoutShell from "./PopoutShell";

/**
 * Inventory pop-out (see reference-design/inventory pop out.png): lists the
 * weapons/equipment the player owns, shows the selected item's details
 * (Atk, crit chance, passive, description), and lets them equip from here.
 */
export default function InventoryPopout({
  token,
  player,
  onPlayer,
  onClose,
}: {
  token: string;
  player: Player;
  onPlayer: (p: Player) => void;
  onClose: () => void;
}) {
  const [catalog, setCatalog] = useState<ShopItem[]>([]);
  const [selected, setSelected] = useState<string | null>(player.weapon);
  const [msg, setMsg] = useState("");

  // Reuse the shop catalog as the source of weapon stats/descriptions.
  useEffect(() => {
    api.shop().then(setCatalog).catch(() => setMsg("Could not load inventory"));
  }, []);

  const owned = catalog
    .filter((i) => i.kind === "weapon" && player.owned_weapons.includes(i.key))
    // Equipped weapon first, then strongest by attack.
    .sort(
      (a, b) =>
        (b.key === player.weapon ? 1 : 0) - (a.key === player.weapon ? 1 : 0) ||
        b.attack - a.attack
    );
  const item = owned.find((i) => i.key === selected) ?? null;

  async function equip(key: string, name: string) {
    setMsg("");
    try {
      onPlayer(await api.equip(key, token));
      setMsg(`Equipped ${name}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <PopoutShell onClose={onClose} className="w-[640px] max-w-[94vw] p-4">
      <h2 className="mb-3 pr-8 font-display text-xl font-bold">Inventory</h2>

      <div className="flex gap-4">
        {/* owned list */}
        <div className="max-h-[46vh] w-1/2 space-y-0.5 overflow-y-auto pr-1">
          {owned.map((it) => (
            <button
              key={it.key}
              onClick={() => setSelected(it.key)}
              className={`flex w-full items-center justify-between rounded border px-3 py-1 text-sm ${
                selected === it.key
                  ? "border-ink bg-black/10"
                  : "border-transparent hover:bg-black/5"
              }`}
            >
              <span>{it.name}</span>
              {player.weapon === it.key && (
                <span className="text-xs text-muted">equipped</span>
              )}
            </button>
          ))}
          {/* consumables */}
          <div className="mt-2 border-t border-ink pt-2 text-sm text-muted">
            Health Potions : {player.potions}
          </div>
        </div>

        {/* detail */}
        <div className="w-1/2 rounded-md border border-ink p-3 text-sm">
          {item ? (
            <>
              <div className="font-bold">{item.name}</div>
              <ul className="mt-1 space-y-0.5 text-muted">
                <li>Atk : +{item.attack}</li>
                <li>Crit chance : +{Math.round(item.crit_bonus * 100)}%</li>
                <li className="italic">Passive : {item.passive || "None"}</li>
              </ul>
              <p className="mt-2">{item.description}</p>
              <div className="mt-3">
                {player.weapon === item.key ? (
                  <span className="rounded border border-ink px-2 py-1 text-xs">
                    Equipped
                  </span>
                ) : (
                  <button
                    className="ck-btn px-3 py-1 text-xs"
                    onClick={() => equip(item.key, item.name)}
                  >
                    Equip
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="text-muted">Select an item to see its details.</p>
          )}
          {msg && <p className="mt-2 text-xs">{msg}</p>}
        </div>
      </div>
    </PopoutShell>
  );
}
