// Local, offline "API". This used to call a backend over HTTP; now the shop
// catalog comes from the ported game constants and purchases mutate the local
// save (src/game/sim/profile.ts). All methods are async to preserve the old
// call sites (which `await` them), but nothing leaves the browser.

import type { LeaderboardEntry, Player, ShopItem } from "./types";
import * as C from "./game/sim/constants";
import { getProfile, profileToPlayer, saveProfile } from "./game/sim/profile";

function shopCatalog(): ShopItem[] {
  const items: ShopItem[] = [];
  for (const [key, w] of Object.entries(C.WEAPONS)) {
    items.push({
      key,
      name: w.name,
      kind: "weapon",
      price: w.price,
      attack: w.attack,
      crit_bonus: w.crit_bonus,
      requires_raid: w.requires_raid,
      description: w.description,
      passive: C.passiveText(key),
    });
  }
  items.push({
    key: C.POTION_KEY,
    name: C.POTION.name,
    kind: "potion",
    price: C.POTION.price,
    attack: 0,
    crit_bonus: 0,
    requires_raid: 0,
    description: C.POTION.description,
    passive: "",
  });
  return items;
}

export const api = {
  // `_token` params are ignored — kept only so existing call sites that still
  // pass the old auth token type-check unchanged.
  me: async (_token?: string): Promise<Player> => profileToPlayer(),

  shop: async (): Promise<ShopItem[]> => shopCatalog(),

  buy: async (key: string, _token?: string): Promise<Player> => {
    const target = getProfile();
    if (key === C.POTION_KEY) {
      const price = C.POTION.price;
      if (target.gold < price) throw new Error("Not enough gold");
      target.gold -= price;
      target.potions += 1;
    } else if (key in C.WEAPONS) {
      const w = C.WEAPONS[key];
      if (target.owned_weapons.includes(key)) {
        throw new Error("You already own that weapon");
      }
      if (target.cleared_raid < w.requires_raid) {
        throw new Error(`Requires raid difficulty ${w.requires_raid} cleared`);
      }
      if (target.gold < w.price) throw new Error("Not enough gold");
      target.gold -= w.price;
      target.owned_weapons.push(key);
    } else {
      throw new Error("No such item");
    }
    target.dirty = true;
    saveProfile();
    return profileToPlayer(target);
  },

  equip: async (key: string, _token?: string): Promise<Player> => {
    const target = getProfile();
    if (!target.owned_weapons.includes(key)) {
      throw new Error("You don't own that weapon");
    }
    target.weapon = key;
    target.dirty = true;
    saveProfile();
    return profileToPlayer(target);
  },

  // Single-player: the "leaderboard" is just you. Kept so the existing widget
  // (if mounted) still renders without a server.
  leaderboard: async (): Promise<LeaderboardEntry[]> => {
    const p = getProfile();
    return [
      {
        rank: 1,
        nickname: p.nickname,
        level: p.level,
        cleared_raid: p.cleared_raid,
        gold: p.gold,
      },
    ];
  },
};
