import type { LeaderboardEntry, Player, ShopItem } from "./types";

export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

export const WS_URL =
  API_URL.replace(/^http/, "ws") + "/ws";

async function request<T>(
  path: string,
  opts: RequestInit = {},
  token?: string
): Promise<T> {
  const res = await fetch(API_URL + path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export interface AuthResponse {
  token: string;
  player: Player;
}

export const api = {
  register: (nickname: string, password: string) =>
    request<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ nickname, password }),
    }),

  login: (nickname: string, password: string) =>
    request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ nickname, password }),
    }),

  me: (token: string) => request<Player>("/api/auth/me", {}, token),

  shop: () => request<ShopItem[]>("/api/shop", {}),

  buy: (key: string, token: string) =>
    request<Player>(
      "/api/shop/buy",
      { method: "POST", body: JSON.stringify({ key }) },
      token
    ),

  equip: (key: string, token: string) =>
    request<Player>(
      "/api/shop/equip",
      { method: "POST", body: JSON.stringify({ key }) },
      token
    ),

  leaderboard: () => request<LeaderboardEntry[]>("/api/leaderboard", {}),
};
