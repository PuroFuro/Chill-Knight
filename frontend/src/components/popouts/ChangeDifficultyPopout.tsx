import { useState } from "react";
import PopoutShell from "./PopoutShell";

const MIN = 1;
const MAX = 50;

/**
 * Change World Difficulty pop-out (see reference-design/Change World.png): type
 * a world level or nudge it with the up/down steppers, then Go/Enter to warp to
 * that difficulty's overworld.
 */
export default function ChangeDifficultyPopout({
  current,
  onApply,
  onClose,
}: {
  current: number;
  onApply: (difficulty: number) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(String(current));

  const clamp = (n: number) => Math.max(MIN, Math.min(MAX, n));
  const num = clamp(Number(value) || MIN);

  function step(delta: number) {
    setValue(String(clamp(num + delta)));
  }

  function go() {
    onApply(num);
  }

  return (
    <PopoutShell onClose={onClose} className="w-[300px] p-5">
      <h2 className="mb-4 pr-8 font-display text-xl font-bold">Change Diff.</h2>

      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && go()}
          className="h-12 w-20 rounded-md border border-ink bg-panel text-center text-xl outline-none focus:border-black"
          autoFocus
        />
        <div className="flex flex-col">
          <button
            className="rounded-t border border-ink px-2 leading-tight hover:bg-black/5"
            onClick={() => step(1)}
            aria-label="Increase"
          >
            ▲
          </button>
          <button
            className="rounded-b border border-ink border-t-0 px-2 leading-tight hover:bg-black/5"
            onClick={() => step(-1)}
            aria-label="Decrease"
          >
            ▼
          </button>
        </div>
        <button className="ck-btn ml-1 px-4 py-2" onClick={go}>
          Go
        </button>
      </div>
      <p className="mt-3 text-xs text-muted">Worlds {MIN}–{MAX}.</p>
    </PopoutShell>
  );
}
