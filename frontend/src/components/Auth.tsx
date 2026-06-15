import { useState } from "react";
import { api } from "../api";
import type { Player } from "../types";
import Wordmark from "./Wordmark";

/**
 * Login / Register screen. Same layout for both (see reference-design/Login
 * screen.png & Register screen.png) — only the submit button label differs.
 */
export default function Auth({
  mode,
  onAuthed,
  onBack,
}: {
  mode: "login" | "register";
  onAuthed: (token: string, player: Player) => void;
  onBack: () => void;
}) {
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

  const label = mode === "login" ? "Login" : "Register";

  return (
    <div className="flex h-full flex-col items-center justify-center bg-paper">
      <Wordmark />

      <form onSubmit={submit} className="mt-10 w-64">
        <label className="block text-lg">Username</label>
        <input
          className="ck-input mb-4 mt-1"
          value={nickname}
          minLength={3}
          maxLength={24}
          required
          autoFocus
          onChange={(e) => setNickname(e.target.value)}
        />
        <label className="block text-lg">Password</label>
        <input
          className="ck-input mb-4 mt-1"
          type="password"
          value={password}
          minLength={4}
          required
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="mb-3 text-sm text-danger">{error}</p>}
        <div className="flex items-center gap-3">
          <button className="ck-btn" disabled={busy}>
            {busy ? "..." : label}
          </button>
          <button
            type="button"
            className="text-sm text-muted transition-opacity hover:opacity-60"
            onClick={onBack}
          >
            ← Back
          </button>
        </div>
      </form>
    </div>
  );
}
