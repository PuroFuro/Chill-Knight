import { useState } from "react";
import * as sfx from "../../sound";
import PopoutShell from "./PopoutShell";

/**
 * Settings pop-out: master volume slider + mute toggle. Both persist via the
 * sound module (localStorage), so the choice sticks between sessions.
 */
export default function SettingsPopout({ onClose }: { onClose: () => void }) {
  const [volume, setVolume] = useState(Math.round(sfx.getMasterVolume() * 100));
  const [muted, setMuted] = useState(sfx.isMuted());

  function changeVolume(v: number) {
    setVolume(v);
    sfx.setMasterVolume(v / 100);
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    sfx.setMuted(next);
    if (!next) sfx.play("hover"); // little blip to preview the new level
  }

  return (
    <PopoutShell onClose={onClose} className="w-[340px] max-w-[94vw] p-5">
      <h2 className="mb-4 pr-8 font-display text-xl font-bold">Settings</h2>

      <div className="space-y-4">
        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span>Volume</span>
            <span className="text-muted">{muted ? "Muted" : `${volume}%`}</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            disabled={muted}
            onChange={(e) => changeVolume(Number(e.target.value))}
            onMouseUp={() => sfx.play("hover")}
            className="w-full accent-ink disabled:opacity-40"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={muted}
            onChange={toggleMute}
            className="h-4 w-4 accent-ink"
          />
          Mute all sound
        </label>
      </div>
    </PopoutShell>
  );
}
