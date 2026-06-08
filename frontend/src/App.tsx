import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import Auth from "./components/Auth";
import ChatPanel, { type ChatLine } from "./components/ChatPanel";
import Hud, { type GameEvent } from "./components/Hud";
import KillPopups, { type KillPopup } from "./components/KillPopups";
import LeaderboardToggle from "./components/LeaderboardToggle";
import Lobby from "./components/Lobby";
import MenuButtons from "./components/MenuButtons";
import GameCanvas from "./game/GameCanvas";
import { GameClient } from "./net/socket";
import type { Player, ServerMsg, Snapshot, StatsMsg } from "./types";

type Screen = "auth" | "lobby" | "game";

export default function App() {
  const [screen, setScreen] = useState<Screen>("auth");
  const [token, setToken] = useState("");
  const [player, setPlayer] = useState<Player | null>(null);

  const [stats, setStats] = useState<StatsMsg | null>(null);
  const [meta, setMeta] = useState({
    mode: "overworld",
    difficulty: 1,
    code: null as string | null,
  });
  const [boss, setBoss] = useState<{ hp: number; maxHp: number } | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [popups, setPopups] = useState<KillPopup[]>([]);

  const clientRef = useRef<GameClient | null>(null);
  const snapshotRef = useRef<Snapshot | null>(null);
  const inputEnabledRef = useRef(true);
  const playerIdRef = useRef(0);
  const seqRef = useRef(1);

  const pushEvent = useCallback(
    (text: string, tone: GameEvent["tone"]) =>
      setEvents((es) => [...es.slice(-8), { id: seqRef.current++, text, tone }]),
    []
  );

  // Floating "+gold / +exp" popups above the player — capped to the last 5,
  // each clearing itself once its rise-and-fade animation finishes.
  const pushPopup = useCallback((kind: KillPopup["kind"], amount: number) => {
    const id = seqRef.current++;
    setPopups((ps) => [...ps.slice(-4), { id, kind, amount }]);
    setTimeout(() => setPopups((ps) => ps.filter((p) => p.id !== id)), 1500);
  }, []);

  // resume an existing session
  useEffect(() => {
    const t = localStorage.getItem("ck_token");
    if (!t) return;
    api
      .me(t)
      .then((p) => {
        setToken(t);
        setPlayer(p);
        setScreen("lobby");
      })
      .catch(() => localStorage.removeItem("ck_token"));
  }, []);

  const backToLobby = useCallback(async () => {
    clientRef.current?.close();
    clientRef.current = null;
    snapshotRef.current = null;
    setStats(null);
    setBoss(null);
    setChat([]);
    setEvents([]);
    setPopups([]);
    if (token) {
      try {
        setPlayer(await api.me(token));
      } catch {
        /* keep last known */
      }
    }
    setScreen("lobby");
  }, [token]);

  const handleMsg = useCallback(
    (msg: ServerMsg) => {
      switch (msg.type) {
        case "joined":
          playerIdRef.current = msg.playerId;
          setMeta({
            mode: msg.mode,
            difficulty: msg.difficulty,
            code: msg.code,
          });
          break;
        case "state":
          snapshotRef.current = msg;
          setBoss((prev) => {
            const b = msg.boss;
            if (!b && !prev) return prev;
            if (b && prev && b.hp === prev.hp && b.maxHp === prev.maxHp)
              return prev;
            return b;
          });
          break;
        case "stats":
          setStats(msg);
          // Keep the cached player roughly in sync with live stats so the
          // overworld shop sees current gold/level/gear (owned_weapons only
          // changes via the REST buy path, so it's preserved here).
          setPlayer((p) =>
            p
              ? {
                  ...p,
                  level: msg.level,
                  exp: msg.exp,
                  exp_to_next: msg.expToNext,
                  gold: msg.gold,
                  weapon: msg.weapon,
                  potions: msg.potions,
                  cleared_raid: msg.clearedRaid,
                  max_hp: msg.maxHp,
                  attack: msg.attack,
                  crit_chance: msg.critChance,
                }
              : p
          );
          break;
        case "chat":
          setChat((c) => [
            ...c.slice(-59),
            {
              id: seqRef.current++,
              from: msg.from,
              level: msg.level,
              text: msg.text,
              mine: msg.from === player?.nickname,
            },
          ]);
          break;
        case "event":
          if (msg.kind === "reward") {
            if ((msg.gold as number) > 0) pushPopup("gold", msg.gold as number);
            if ((msg.exp as number) > 0) pushPopup("exp", msg.exp as number);
          }
          handleGameEvent(msg, pushEvent);
          break;
        case "world_closed":
          if (msg.reason === "raid_over") pushEvent("Raid instance closed.", "info");
          backToLobby();
          break;
        case "error":
          pushEvent(msg.message, "bad");
          backToLobby();
          break;
        case "kicked":
          alert(msg.message);
          doLogout();
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [player, pushEvent, pushPopup, backToLobby]
  );

  async function enterGame(
    mode: "overworld" | "raid",
    difficulty: number,
    code?: string
  ) {
    const client = new GameClient();
    clientRef.current = client;
    client.on(handleMsg);
    try {
      await client.connect(token);
    } catch {
      pushEvent("Could not connect to the game server.", "bad");
      clientRef.current = null;
      return;
    }
    setStats(null);
    setBoss(null);
    setEvents([]);
    setChat([]);
    setPopups([]);
    snapshotRef.current = null;
    inputEnabledRef.current = true;
    setMeta({ mode, difficulty, code: code ?? null });
    setScreen("game");
    client.joinWorld(mode, difficulty, code);
  }

  // Hop straight into a friend's raid from the overworld. The server detaches
  // us from the current world before adding us to the raid, so we're never in
  // two worlds at once.
  function joinRaidFromGame(code: string) {
    const client = clientRef.current;
    if (!client) return;
    setStats(null);
    setBoss(null);
    setEvents([]);
    setChat([]);
    setPopups([]);
    snapshotRef.current = null;
    inputEnabledRef.current = true;
    client.joinWorld("raid", meta.difficulty, code);
  }

  function doLogout() {
    clientRef.current?.close();
    clientRef.current = null;
    localStorage.removeItem("ck_token");
    setToken("");
    setPlayer(null);
    setScreen("auth");
  }

  if (screen === "auth") {
    return (
      <Auth
        onAuthed={(t, p) => {
          setToken(t);
          setPlayer(p);
          setScreen("lobby");
        }}
      />
    );
  }

  if (screen === "lobby" && player) {
    return (
      <Lobby
        token={token}
        player={player}
        onPlayer={setPlayer}
        onEnter={enterGame}
        onLogout={doLogout}
      />
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-knight-bg">
      {clientRef.current && (
        <GameCanvas
          client={clientRef.current}
          snapshotRef={snapshotRef}
          playerId={playerIdRef.current}
          inputEnabled={inputEnabledRef}
        />
      )}
      <Hud
        stats={stats}
        meta={meta}
        boss={boss}
        events={events}
        onLeave={() => {
          clientRef.current?.leave();
          backToLobby();
        }}
        onPotion={() => clientRef.current?.usePotion()}
        onJoinRaid={joinRaidFromGame}
        onTypingChange={(typing) => {
          inputEnabledRef.current = !typing;
        }}
      />

      {/* Shop / How-to-play buttons, tucked below the top-left vitals panel. */}
      {player && (
        <div className="absolute left-4 top-32">
          <MenuButtons token={token} player={player} onPlayer={setPlayer} />
        </div>
      )}

      {/* Leaderboard pop-out lives in the overworld only. */}
      {meta.mode === "overworld" && <LeaderboardToggle />}

      <KillPopups popups={popups} />

      <ChatPanel
        lines={chat}
        myDifficulty={meta.difficulty}
        onSend={(t) => clientRef.current?.chat(t)}
        onTypingChange={(typing) => {
          inputEnabledRef.current = !typing;
        }}
      />
    </div>
  );
}

function handleGameEvent(
  msg: { type: "event"; kind: string; [k: string]: unknown },
  push: (text: string, tone: GameEvent["tone"]) => void
) {
  switch (msg.kind) {
    case "levelup":
      push(`⬆️ Level up! You are now level ${msg.level}.`, "good");
      break;
    case "death":
      push(
        `💀 You died. Lost ${msg.gold_lost ?? 0}g and ${msg.exp_lost ?? 0} exp.`,
        "bad"
      );
      break;
    case "respawn":
      push("✨ Respawned at full health.", "info");
      break;
    case "raid_clear":
      push(
        `🏆 Raid ${msg.difficulty} cleared! +${msg.exp} exp, +${
          (msg.gold as number) + ((msg.bonus_gold as number) || 0)
        }g${msg.first_clear ? " (first-clear bonus!)" : ""}`,
        "good"
      );
      break;
    case "raid_failed":
      push(`☠️ ${msg.message ?? "Raid failed. No rewards lost."}`, "bad");
      break;
    case "info":
      push(String(msg.message ?? ""), "info");
      break;
    // "hit", "reward", "parry" are intentionally not toasted (too frequent).
  }
}
