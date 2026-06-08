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
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  // The input box only shows when the panel is hovered or actively typing.
  const expanded = hovered || focused;

  // "T" (or Enter) opens the chat for typing from anywhere in the game.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement;
      // Don't hijack focus if the user is already typing in any field
      // (the chat box itself, the raid-code input, etc.).
      const typingElsewhere =
        ae instanceof HTMLInputElement || ae instanceof HTMLTextAreaElement;
      if (
        (e.key === "t" || e.key === "T" || e.key === "Enter") &&
        !typingElsewhere
      ) {
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
  }, [lines, expanded]);

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
    <div
      className="absolute bottom-4 left-4 flex w-80 flex-col"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
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
        <div
          ref={feedRef}
          className={`overflow-y-auto px-3 py-2 text-sm transition-all ${
            expanded ? "h-44" : "h-28"
          }`}
        >
          {shown.length === 0 && (
            <p className="text-xs text-gray-600">
              No messages yet. Hover or press T to chat.
            </p>
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
      {/* Input only appears while hovering or typing. It stays in the layout
          (collapsed, not display:none) so the "T" shortcut can always focus
          it, which in turn expands the panel. */}
      <form
        onSubmit={submit}
        className={
          expanded
            ? "opacity-100 transition-opacity"
            : "pointer-events-none h-0 overflow-hidden opacity-0"
        }
      >
        <input
          ref={inputRef}
          className="ck-input text-sm"
          placeholder="Press T to chat…"
          value={text}
          maxLength={160}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => {
            setFocused(true);
            onTypingChange(true);
          }}
          onBlur={() => {
            setFocused(false);
            onTypingChange(false);
          }}
        />
      </form>
    </div>
  );
}
