import { useEffect, useRef, useState } from "react";

export interface ChatLine {
  id: number;
  from: string;
  level: number;
  text: string;
  mine: boolean;
}

export default function ChatPanel({
  lines,
  myDifficulty,
  onSend,
  onTypingChange,
}: {
  lines: ChatLine[];
  myDifficulty: number;
  onSend: (text: string) => void;
  onTypingChange: (typing: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [onlyMyLevel, setOnlyMyLevel] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") inputRef.current?.blur();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    feedRef.current?.scrollTo(0, feedRef.current.scrollHeight);
  }, [lines]);

  const shown = onlyMyLevel
    ? lines.filter((l) => l.level === myDifficulty)
    : lines;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (t) onSend(t);
    setText("");
    inputRef.current?.blur();
  }

  return (
    <div className="absolute bottom-4 right-4 flex w-80 flex-col">
      <div className="ck-panel mb-2 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
          <span className="text-xs font-bold text-knight-accent">CHAT</span>
          <label className="flex items-center gap-1 text-[11px] text-gray-400">
            <input
              type="checkbox"
              checked={onlyMyLevel}
              onChange={(e) => setOnlyMyLevel(e.target.checked)}
              className="accent-knight-accent2"
            />
            only my level
          </label>
        </div>
        <div ref={feedRef} className="h-44 overflow-y-auto px-3 py-2 text-sm">
          {shown.length === 0 && (
            <p className="text-xs text-gray-600">No messages yet. Press Enter to chat.</p>
          )}
          {shown.map((l) => (
            <div key={l.id} className="mb-1 leading-snug">
              <span className="text-[10px] text-gray-500">[Lv {l.level}]</span>{" "}
              <span
                className={`font-semibold ${
                  l.mine ? "text-knight-accent2" : "text-knight-accent"
                }`}
              >
                {l.from}:
              </span>{" "}
              <span className="text-gray-200">{l.text}</span>
            </div>
          ))}
        </div>
      </div>
      <form onSubmit={submit}>
        <input
          ref={inputRef}
          className="ck-input text-sm"
          placeholder="Press Enter to chat…"
          value={text}
          maxLength={160}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => onTypingChange(true)}
          onBlur={() => onTypingChange(false)}
        />
      </form>
    </div>
  );
}
