import { useEffect, useState } from "react";
import { api } from "../../api";
import type { Player, ShopItem } from "../../types";
import * as sfx from "../../sound";
import PopoutShell from "./PopoutShell";
import shopkeeperImg from "../../assets/Shopkeeper.png";
import { WEAPON_SPRITE_URLS } from "../../game/GameCanvas";

// Placeholder shopkeeper personality, one line per item. The real shopkeeper
// character/art comes later; these stand in for his banter.
const SHOPKEEPER: Record<string, string> = {
  rusty_sword:
    "That old Rusty Sword? It's free for a reason — but every knight starts somewhere.",
  iron_blade:
    "The Iron Blade. Honest steel. You'll feel the difference on your very first swing.",
  knights_saber:
    "Ahh, the Knight's Saber — balanced and sharp. The choice of folks who plan to survive a while.",
  frost_edge:
    "The Frost Edge! Pulled it from a raid vault myself. Chills foes right to the bone.",
  dragonfang:
    "Careful with the Dragonfang — forged from a real raid-boss fang. It bites back.",
  eclipse_greatsword:
    "The Eclipse Greatsword... legends are written with blades like this. If you can wield it.",
  curve_sword:
    "The Curve Sword — that big sweeping reach? Perfect for when they come at you in waves.",
  drows:
    "Drows. Blade and handle swapped, aye. It'll hurt your hands, but oh, how it crits on a parry.",
  knife:
    "This Knife... I don't like keeping it in the shop. Fast, sharp, and it makes them bleed.",
  long_blade:
    "The Long Blade. Heavy as sin and slow — but land a parry counter and they simply cease to exist.",
  scythe:
    "The Scythe... feel that dread? Every soul it reaps makes it hungrier. And stronger.",
  two_stars:
    "Two Stars — gifted from the heavens themselves. Parry the storm, then loose it as a star across the whole field.",
  health_potion:
    "A potion? Smart. Nothing says 'I planned ahead' like not dying.",
};

/**
 * Shop pop-out (see reference-design/Shop pop out.png): a shopkeeper dialogue
 * box on top, the item list on the left, and the selected item's details +
 * Buy/Equip on the right. Weapon passives are placeholders for now.
 */
export default function ShopPopout({
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
  const [items, setItems] = useState<ShopItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [typed, setTyped] = useState("");

  useEffect(() => {
    api.shop().then(setItems).catch(() => setMsg("Could not load shop"));
  }, []);

  const item = items.find((i) => i.key === selected) ?? null;

  const dialogue = item
    ? SHOPKEEPER[item.key] ?? `Ah, the ${item.name}? ${item.description}`
    : "Welcome, knight! Click an item and I'll tell you about it.";

  // Type the shopkeeper's line out one character at a time, humming the
  // "speaking" sound while he talks and falling silent when the line finishes.
  useEffect(() => {
    setTyped("");
    let i = 0;
    sfx.startSpeaking();
    const id = window.setInterval(() => {
      i++;
      setTyped(dialogue.slice(0, i));
      if (i >= dialogue.length) {
        window.clearInterval(id);
        sfx.stopSpeaking();
      }
    }, 28);
    return () => {
      window.clearInterval(id);
      sfx.stopSpeaking();
    };
  }, [dialogue]);

  async function act(fn: Promise<Player>, ok: string, sound: sfx.SoundName) {
    setMsg("");
    try {
      onPlayer(await fn);
      sfx.play(sound);
      setMsg(ok);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <PopoutShell onClose={onClose} className="w-[720px] max-w-[94vw] translate-y-24 p-4">
      <div className="mb-3 flex items-center gap-3 pr-8">
        <h2 className="font-display text-xl font-bold">Shop</h2>
        <span className="text-sm text-gold">{player.gold}g</span>
      </div>

      {/* shopkeeper dialogue — the shopkeeper himself leans on the top edge of
          the box. The art is intentionally cropped so only his upper body and
          outstretched arm show, draped over the box. The image hangs above the
          box, so the scroll/clip lives on an inner div (clipping the outer
          wrapper would hide him). */}
      <div className="relative mb-3">
        <img
          src={shopkeeperImg}
          alt="Shopkeeper"
          className="pointer-events-none absolute right-2 bottom-[calc(100%+0px)] z-10 w-3/4 select-none object-contain object-bottom"
        />
        <div className="h-[72px] overflow-y-auto rounded-md border border-ink bg-black/5 p-3 pr-32 text-sm">
          {typed}
        </div>
      </div>

      {/* Fixed-height row so selecting different items never resizes the box. */}
      <div className="flex h-[300px] gap-4">
        {/* item list */}
        <div className="w-1/2 space-y-1 overflow-y-auto pr-1">
          {items.map((it) => (
            <button
              key={it.key}
              onClick={() => setSelected(it.key)}
              onMouseEnter={() => sfx.play("hover")}
              className={`flex w-full items-center justify-between rounded border px-3 py-1.5 text-sm ${
                selected === it.key
                  ? "border-ink bg-black/10"
                  : "border-transparent hover:bg-black/5"
              }`}
            >
              <span>{it.name}</span>
              <span className="text-gold">{it.price > 0 ? `${it.price}g` : "free"}</span>
            </button>
          ))}
        </div>

        {/* detail */}
        <div className="w-1/2 overflow-y-auto rounded-md border border-ink p-3">
          {item ? (
            <ItemDetail
              item={item}
              player={player}
              onBuy={() =>
                act(
                  api.buy(item.key, token),
                  `Bought ${item.name}`,
                  item.kind === "potion" ? "buyPotion" : "buyWeapon"
                )
              }
              onEquip={() =>
                act(api.equip(item.key, token), `Equipped ${item.name}`, "equip")
              }
            />
          ) : (
            <p className="text-sm text-muted">Select an item to see its details.</p>
          )}
          {msg && <p className="mt-2 text-xs">{msg}</p>}
        </div>
      </div>
    </PopoutShell>
  );
}

function ItemDetail({
  item,
  player,
  onBuy,
  onEquip,
}: {
  item: ShopItem;
  player: Player;
  onBuy: () => void;
  onEquip: () => void;
}) {
  const isWeapon = item.kind === "weapon";
  const owned = isWeapon && player.owned_weapons.includes(item.key);
  const equipped = isWeapon && player.weapon === item.key;
  const locked = isWeapon && player.cleared_raid < item.requires_raid;

  const art = isWeapon ? WEAPON_SPRITE_URLS[item.key] : undefined;

  return (
    <div className="text-sm">
      {/* weapon art (falls back to a placeholder for items without dedicated art) */}
      <div className="mb-2 flex h-24 items-center justify-center rounded border border-ink bg-black/5 text-xs text-muted">
        {art ? (
          <img
            src={art}
            alt={item.name}
            className="h-full w-full object-contain p-1"
          />
        ) : (
          `${item.name} image`
        )}
      </div>
      <div className="font-bold">{item.name}</div>
      {isWeapon ? (
        <ul className="mt-1 space-y-0.5 text-muted">
          <li>Atk : +{item.attack}</li>
          <li>Crit chance : +{Math.round(item.crit_bonus * 100)}%</li>
          <li className="italic">Passive : {item.passive || "None"}</li>
          {item.requires_raid > 0 && (
            <li className={locked ? "text-danger" : "text-ink"}>
              Requires raid {item.requires_raid}
            </li>
          )}
        </ul>
      ) : (
        <p className="mt-1 text-muted">Have: {player.potions}</p>
      )}
      <p className="mt-2">{item.description}</p>

      <div className="mt-3">
        {equipped ? (
          <span className="rounded border border-ink px-2 py-1 text-xs">Equipped</span>
        ) : owned ? (
          <button
            className="ck-btn px-3 py-1 text-xs"
            onClick={onEquip}
            onMouseEnter={() => sfx.play("hover")}
          >
            Equip
          </button>
        ) : (
          <button
            className="ck-btn-primary px-3 py-1 text-xs"
            disabled={locked || player.gold < item.price}
            onClick={onBuy}
            onMouseEnter={() => sfx.play("hover")}
          >
            {locked ? "Locked" : "Buy"}
          </button>
        )}
      </div>
    </div>
  );
}
