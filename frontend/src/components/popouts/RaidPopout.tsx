import { useRef, useState } from "react";
import PopoutShell from "./PopoutShell";

/**
 * Raid pop-out (see reference-design/Raid pop out.png): create a new raid lobby
 * (server hands back a random 4-character code) or type an existing 4-character
 * code to join a friend's fight.
 */
export default function RaidPopout({
  onCreate,
  onJoin,
  onClose,
}: {
  onCreate: () => void;
  onJoin: (code: string) => void;
  onClose: () => void;
}) {
  const [chars, setChars] = useState(["", "", "", ""]);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const code = chars.join("");
  const complete = code.length === 4 && chars.every((c) => c !== "");

  function setChar(i: number, v: string) {
    const ch = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(-1);
    setChars((cs) => {
      const next = [...cs];
      next[i] = ch;
      return next;
    });
    if (ch && i < 3) refs.current[i + 1]?.focus();
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !chars[i] && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "Enter" && complete) onJoin(code);
  }

  return (
    <PopoutShell onClose={onClose} className="w-[420px] max-w-[94vw] p-5">
      <h2 className="mb-4 pr-8 font-display text-xl font-bold">Raid</h2>

      <button className="ck-btn-primary mb-5 w-full" onClick={onCreate}>
        Create Raid
      </button>

      <label className="text-sm text-muted">Input Raid Code</label>
      <div className="mt-2 flex items-center gap-2">
        {chars.map((c, i) => (
          <input
            key={i}
            ref={(el) => (refs.current[i] = el)}
            value={c}
            maxLength={1}
            inputMode="text"
            onChange={(e) => setChar(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            className="h-12 w-12 rounded-md border border-ink bg-panel text-center text-xl uppercase outline-none focus:border-black"
          />
        ))}
        <button
          className="ck-btn ml-1 px-3 py-2 text-sm"
          disabled={!complete}
          onClick={() => onJoin(code)}
        >
          Join
        </button>
      </div>
    </PopoutShell>
  );
}
