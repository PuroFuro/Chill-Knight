import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import About from "./components/About";
import Auth from "./components/Auth";
import ChatPanel, { type ChatLine } from "./components/ChatPanel";
import Hud, { type GameEvent } from "./components/Hud";
import KillPopups, { type KillPopup } from "./components/KillPopups";
import LeaderboardToggle from "./components/LeaderboardToggle";
import OverworldMenu from "./components/OverworldMenu";
import RaidLobby from "./components/RaidLobby";
import TitleScreen from "./components/TitleScreen";
import GameCanvas from "./game/GameCanvas";
import { GameClient } from "./net/socket";
import * as sfx from "./sound";
import type { Player, ServerMsg, Snapshot, StatsMsg } from "./types";

type Screen = "title" | "login" | "register" | "about" | "game";

const clampDifficulty = (n: number) => Math.max(1, Math.min(50, Math.round(n)));

export default function App() {
  const [screen, setScreen] = useState<Screen>("title");
  const [token, setToken] = useState("");
  const [player, setPlayer] = useState<Player | null>(null);

  const [stats, setStats] = useState<StatsMsg | null>(null);
  const [meta, setMeta] = useState({
    mode: "overworld",
    difficulty: 1,
    code: null as string | null,
  });
  const [boss, setBoss] = useState<{ hp: number; maxHp: number } | null>(null);
  // Whether the current raid has started (false = lobby). Always effectively
  // true in the overworld.
  const [started, setStarted] = useState(false);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [popups, setPopups] = useState<KillPopup[]>([]);

  const clientRef = useRef<GameClient | null>(null);
  const snapshotRef = useRef<Snapshot | null>(null);
  const inputEnabledRef = useRef(true);
  const playerIdRef = useRef(0);
  const seqRef = useRef(1);
  // The overworld difficulty the player is in, so a raid returns them to it.
  const lastOverworldDifficultyRef = useRef(1);

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

  const resetWorldState = useCallback(() => {
    setStats(null);
    setBoss(null);
    setStarted(false);
    setEvents([]);
    setChat([]);
    setPopups([]);
    snapshotRef.current = null;
    inputEnabledRef.current = true;
  }, []);

  // Return to the title screen (Leave) — keeps the session/token alive.
  const backToTitle = useCallback(async () => {
    clientRef.current?.close();
    clientRef.current = null;
    resetWorldState();
    if (token) {
      try {
        setPlayer(await api.me(token));
      } catch {
        /* keep last known */
      }
    }
    setScreen("title");
  }, [token, resetWorldState]);

  function doLogout() {
    clientRef.current?.close();
    clientRef.current = null;
    localStorage.removeItem("ck_token");
    setToken("");
    setPlayer(null);
    resetWorldState();
    setScreen("title");
  }

  const handleMsg = useCallback(
    (msg: ServerMsg) => {
      switch (msg.type) {
        case "joined":
          playerIdRef.current = msg.playerId;
          setMeta({ mode: msg.mode, difficulty: msg.difficulty, code: msg.code });
          if (msg.mode === "overworld")
            lastOverworldDifficultyRef.current = msg.difficulty;
          break;
        case "state":
          snapshotRef.current = msg;
          setStarted((prev) => (prev === msg.started ? prev : msg.started));
          setBoss((prev) => {
            const b = msg.boss;
            if (!b && !prev) return prev;
            if (b && prev && b.hp === prev.hp && b.maxHp === prev.maxHp) return prev;
            return b;
          });
          break;
        case "stats":
          setStats(msg);
          // Keep the cached player roughly in sync with live stats so the
          // pop-outs see current gold/level/gear (owned_weapons only changes via
          // the REST buy/equip path, so it's preserved here).
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
        case "chat": {
          const mine = msg.from === player?.nickname;
          if (!mine) sfx.play("messagePop"); // someone else (any world) spoke
          setChat((c) => [
            ...c.slice(-59),
            {
              id: seqRef.current++,
              from: msg.from,
              level: msg.level,
              text: msg.text,
              mine,
            },
          ]);
          break;
        }
        case "event":
          if (msg.kind === "reward") {
            if ((msg.gold as number) > 0) pushPopup("gold", msg.gold as number);
            if ((msg.exp as number) > 0) pushPopup("exp", msg.exp as number);
          }
          // These events are delivered only to the local player, so their
          // sounds are correctly local-only.
          switch (msg.kind) {
            case "slash":
              if (msg.counter) sfx.play("parryAttack");
              else sfx.playSlash((msg.index as number) ?? 0);
              break;
            case "parry":
              sfx.play("parry");
              break;
            case "hurt":
              sfx.play("hit");
              break;
            case "levelup":
              sfx.play("levelUp");
              break;
          }
          handleGameEvent(msg, pushEvent);
          break;
        case "world_closed":
          if (msg.reason === "raid_over") {
            // Raid finished (cleared or wiped): drop back into the overworld the
            // player launched from, not the title screen.
            pushEvent("Raid over — returning to the overworld.", "info");
            resetWorldState();
            clientRef.current?.joinWorld(
              "overworld",
              lastOverworldDifficultyRef.current
            );
          } else {
            backToTitle();
          }
          break;
        case "error":
          pushEvent(msg.message, "bad");
          backToTitle();
          break;
        case "kicked":
          alert(msg.message);
          doLogout();
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [player, pushEvent, pushPopup, backToTitle, resetWorldState]
  );

  // Open a brand-new connection and drop straight into a world. Used right
  // after auth / session-resume. `authToken` lets us pass the freshly issued
  // token before React state has settled.
  const enterGame = useCallback(
    async (mode: "overworld" | "raid", difficulty: number, authToken?: string) => {
      const t = authToken ?? token;
      const client = new GameClient();
      clientRef.current = client;
      client.on(handleMsg);
      try {
        await client.connect(t);
      } catch {
        pushEvent("Could not connect to the game server.", "bad");
        clientRef.current = null;
        return;
      }
      resetWorldState();
      setMeta({ mode, difficulty, code: null });
      setScreen("game");
      client.joinWorld(mode, difficulty);
    },
    [token, handleMsg, pushEvent, resetWorldState]
  );

  // Switch the current connection to another world (change difficulty, create
  // or join a raid) without reconnecting. The server detaches us from the old
  // world before adding us to the new one, so we're never in two at once.
  const reenter = useCallback(
    (mode: "overworld" | "raid", difficulty: number, code?: string) => {
      const client = clientRef.current;
      if (!client) return;
      resetWorldState();
      client.joinWorld(mode, difficulty, code);
    },
    [resetWorldState]
  );

  // resume an existing session straight into the overworld
  useEffect(() => {
    const t = localStorage.getItem("ck_token");
    if (!t) return;
    api
      .me(t)
      .then((p) => {
        setToken(t);
        setPlayer(p);
        enterGame("overworld", clampDifficulty(p.level), t);
      })
      .catch(() => localStorage.removeItem("ck_token"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onAuthed(t: string, p: Player) {
    setToken(t);
    setPlayer(p);
    enterGame("overworld", clampDifficulty(p.level), t);
  }

  if (screen === "title") {
    return (
      <TitleScreen
        onRegister={() => setScreen("register")}
        onLogin={() => setScreen("login")}
        onAbout={() => setScreen("about")}
      />
    );
  }
  if (screen === "login" || screen === "register") {
    return <Auth mode={screen} onAuthed={onAuthed} onBack={() => setScreen("title")} />;
  }
  if (screen === "about") {
    return <About onBack={() => setScreen("title")} />;
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-paper">
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
        meta={{ ...meta, started }}
        boss={boss}
        events={events}
        onPotion={() => clientRef.current?.usePotion()}
      />

      {meta.mode === "raid" && !started && (
        <RaidLobby
          code={meta.code}
          difficulty={meta.difficulty}
          onStart={(d) => clientRef.current?.startRaid(d)}
        />
      )}

      {player && (
        <OverworldMenu
          token={token}
          player={player}
          onPlayer={setPlayer}
          meta={{ difficulty: meta.difficulty }}
          onCreateRaid={() => reenter("raid", meta.difficulty)}
          onJoinRaid={(code) => reenter("raid", meta.difficulty, code)}
          onChangeDifficulty={(d) => reenter("overworld", clampDifficulty(d))}
          onLogout={doLogout}
        />
      )}

      {meta.mode === "overworld" && <LeaderboardToggle />}

      <KillPopups popups={popups} />

      <ChatPanel
        lines={chat}
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
