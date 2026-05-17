import { useState } from "react";
import { api } from "../api";
import type { Player } from "../types";

export default function Auth({
  onAuthed,
}: {
  onAuthed: (token: string, player: Player) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const fn = mode === "login" ? api.login : api.register;
      const res = await fn(nickname.trim(), password);
      localStorage.setItem("ck_token", res.token);
      onAuthed(res.token, res.player);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-knight-bg">
      <div className="ck-panel w-[380px] p-8">
        <h1 className="mb-1 text-center text-3xl font-bold text-knight-accent">
          ⚔️ Chill Knight
        </h1>
        <p className="mb-6 text-center text-sm text-gray-400">
          Slay mobs. Raid bosses. Stay chill.
        </p>

        <div className="mb-5 flex rounded-md bg-knight-bg p-1">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded py-1.5 text-sm font-medium capitalize transition-colors ${
                mode === m
                  ? "bg-knight-accent2 text-knight-bg"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            className="ck-input"
            placeholder="Nickname"
            value={nickname}
            minLength={3}
            maxLength={24}
            required
            onChange={(e) => setNickname(e.target.value)}
          />
          <input
            className="ck-input"
            type="password"
            placeholder="Password"
            value={password}
            minLength={4}
            required
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm text-knight-danger">{error}</p>}
          <button className="ck-btn-primary w-full" disabled={busy}>
            {busy ? "..." : mode === "login" ? "Enter the realm" : "Create knight"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-gray-500">
          Your progress is saved to your account.
        </p>
      </div>
    </div>
  );
}
