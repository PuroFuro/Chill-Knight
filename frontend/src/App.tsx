import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import About from "./components/About";
import ChatPanel, { type ChatLine } from "./components/ChatPanel";
import Hud, { type GameEvent } from "./components/Hud";
import KillPopups, { type KillPopup } from "./components/KillPopups";
import OverworldMenu from "./components/OverworldMenu";
import RaidLobby from "./components/RaidLobby";
import TitleScreen from "./components/TitleScreen";
import TouchControls from "./components/TouchControls";
import GameCanvas from "./game/GameCanvas";
import { GameClient, type TouchInputState } from "./net/socket";
import * as sfx from "./sound";
import { useIsTouch } from "./useIsTouch";
import type { Player, ServerMsg, Snapshot, StatsMsg } from "./types";

type Screen = "title" | "about" | "game";

const clampDifficulty = (n: number) => Math.max(1, Math.min(50, Math.round(n)));

export default function App() {
  const [screen, setScreen] = useState<Screen>("title");
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

  const isTouch = useIsTouch();
  const clientRef = useRef<GameClient | null>(null);
  const snapshotRef = useRef<Snapshot | null>(null);
  const inputEnabledRef = useRef(true);
  // On-screen-stick input (touch devices), shared with the canvas for local
  // prediction + instant facing.
  const touchInputRef = useRef<TouchInputState>({
    up: false, down: false, left: false, right: false,
    aimX: 1, aimY: 0, aiming: false,
  });
  const playerIdRef = useRef(0);
  const seqRef = useRef(1);
  // The overworld difficulty the player is in, so a raid returns them to it.
  const lastOverworldDifficultyRef = useRef(1);
  // Stashed raid-clear details: the win banner is shown *after* the bounce back
  // to the overworld (the transition wipes the in-raid toasts), so we carry the
  // info from the raid_clear event over to the world_closed handler.
  const raidClearRef = useRef<{
    difficulty: number;
    party: string[];
    exp: number;
    gold: number;
    bonus: number;
    first: boolean;
  } | null>(null);

  // Event toasts fade in, hold, then fade out (matching the ck-toast animation)
  // and remove themselves so they don't linger on screen forever.
  const pushEvent = useCallback((text: string, tone: GameEvent["tone"]) => {
    const id = seqRef.current++;
    setEvents((es) => [...es.slice(-7), { id, text, tone }]);
    setTimeout(() => setEvents((es) => es.filter((e) => e.id !== id)), 4200);
  }, []);

  // Floating "+gold / +exp" popups above the player — capped to the last 5,
  // each clearing itself once its rise-and-fade animation finishes.
  const pushPopup = useCallback((kind: KillPopup["kind"], amount: number) => {
    const id = seqRef.current++;
    setPopups((ps) => [...ps.slice(-4), { id, kind, amount }]);
    setTimeout(() => setPopups((ps) => ps.filter((p) => p.id !== id)), 1500);
  }, []);

  // Inject a game announcement (e.g. a raid clear) into the bottom-left feed.
  const pushSystemChat = useCallback((text: string) => {
    setChat((c) => [
      ...c.slice(-59),
      { id: seqRef.current++, from: "", level: 0, text, mine: false, system: true },
    ]);
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

  // Return to the title screen (Leave). Keeps local progress (it's persisted).
  const backToTitle = useCallback(async () => {
    clientRef.current?.close();
    clientRef.current = null;
    resetWorldState();
    try {
      setPlayer(await api.me());
    } catch {
      /* keep last known */
    }
    setScreen("title");
  }, [resetWorldState]);

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
          // the buy/equip path, so it's preserved here).
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
          if (!mine) sfx.play("messagePop");
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
            case "enemy_death":
              sfx.play("skullDeath");
              break;
            case "boss_falling":
              sfx.play("slimeFallingAir");
              break;
            case "boss_blink":
              sfx.play("blinkingLights");
              break;
            case "boss_slam":
              // the big slime finally hits the ground: heavy thud + goopy splat
              sfx.play("bigSlimeFall");
              sfx.play("slimeFall");
              break;
            case "slimeball_land":
              sfx.play("slimeFall");
              break;
            case "raid_clear":
              sfx.play("raidWin");
              // Stash the details; the banner is shown after the overworld
              // bounce (below) so the transition doesn't wipe it.
              raidClearRef.current = {
                difficulty: msg.difficulty as number,
                party: (msg.party as string[]) ?? [],
                exp: (msg.exp as number) ?? 0,
                gold: (msg.gold as number) ?? 0,
                bonus: (msg.bonus_gold as number) ?? 0,
                first: Boolean(msg.first_clear),
              };
              break;
          }
          handleGameEvent(msg, pushEvent);
          break;
        case "world_closed":
          if (msg.reason === "raid_over") {
            // Raid finished (cleared or wiped): drop back into the overworld the
            // player launched from, not the title screen.
            const win = raidClearRef.current;
            raidClearRef.current = null;
            resetWorldState();
            clientRef.current?.joinWorld(
              "overworld",
              lastOverworldDifficultyRef.current
            );
            // resetWorldState() cleared the in-raid toasts/chat, so the win
            // banner is (re)posted here, in the overworld, where it sticks.
            if (win) {
              pushEvent(
                `You have successfully raided a level ${win.difficulty} boss!`,
                "good"
              );
              const who = win.party.length ? win.party.join(", ") : "the party";
              const reward = `+${win.exp} exp, +${win.gold + win.bonus}g`;
              pushSystemChat(
                `Difficulty ${win.difficulty} raid cleared by ${who}! (${reward}${
                  win.first ? ", first-clear bonus!" : ""
                })`
              );
            } else {
              pushEvent("Raid over — returning to the overworld.", "info");
            }
          } else {
            backToTitle();
          }
          break;
        case "error":
          pushEvent(msg.message, "bad");
          backToTitle();
          break;
        case "kicked":
          backToTitle();
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [player, pushEvent, pushPopup, pushSystemChat, backToTitle, resetWorldState]
  );

  // Open a brand-new connection and drop straight into a world.
  const enterGame = useCallback(
    (mode: "overworld" | "raid", difficulty: number) => {
      const client = new GameClient();
      clientRef.current = client;
      client.on(handleMsg);
      resetWorldState();
      setMeta({ mode, difficulty, code: null });
      setScreen("game");
      client.joinWorld(mode, difficulty);
    },
    [handleMsg, resetWorldState]
  );

  // Switch the current world (change difficulty, create/join a raid) without
  // making a new client.
  const reenter = useCallback(
    (mode: "overworld" | "raid", difficulty: number, code?: string) => {
      const client = clientRef.current;
      if (!client) return;
      resetWorldState();
      client.joinWorld(mode, difficulty, code);
    },
    [resetWorldState]
  );

  // Load the local save once so the menus/pop-outs have the player's profile.
  useEffect(() => {
    api.me().then(setPlayer).catch(() => {});
  }, []);

  // Background music plays for the whole time the player is in the game world
  // (overworld or raid) and stops on the title/about screens.
  useEffect(() => {
    if (screen === "game") sfx.startMusic();
    else sfx.stopMusic();
    return () => sfx.stopMusic();
  }, [screen]);

  function onPlay() {
    enterGame("overworld", clampDifficulty(player?.level ?? 1));
  }

  if (screen === "title") {
    return <TitleScreen onPlay={onPlay} onAbout={() => setScreen("about")} />;
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
          touchInput={touchInputRef}
          isTouch={isTouch}
        />
      )}

      {isTouch && clientRef.current && (
        <TouchControls
          client={clientRef.current}
          touchRef={touchInputRef}
          enabledRef={inputEnabledRef}
        />
      )}

      <Hud
        stats={stats}
        meta={{ ...meta, started }}
        boss={boss}
        events={events}
        isTouch={isTouch}
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
          token=""
          player={player}
          onPlayer={setPlayer}
          meta={{ difficulty: meta.difficulty }}
          onCreateRaid={() => reenter("raid", meta.difficulty)}
          onJoinRaid={(code) => reenter("raid", meta.difficulty, code)}
          onChangeDifficulty={(d) => reenter("overworld", clampDifficulty(d))}
          onLogout={backToTitle}
        />
      )}

      <KillPopups popups={popups} />

      <ChatPanel
        lines={chat}
        compact={isTouch}
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
      push(`Level up! You are now level ${msg.level}.`, "good");
      break;
    case "death":
      push(
        `You died. Lost ${msg.gold_lost ?? 0}g and ${msg.exp_lost ?? 0} exp.`,
        "bad"
      );
      break;
    case "respawn":
      push("Respawned at full health.", "info");
      break;
    // "raid_clear" is intentionally not toasted here — the win banner is posted
    // from the world_closed handler so it survives the bounce to the overworld.
    case "raid_failed":
      push(`${msg.message ?? "Raid failed. No rewards lost."}`, "bad");
      break;
    case "info":
      push(String(msg.message ?? ""), "info");
      break;
    case "invasion":
      push(String(msg.message ?? "Slimes are invading!"), "bad");
      break;
    // "hit", "reward", "parry" are intentionally not toasted (too frequent).
  }
}
