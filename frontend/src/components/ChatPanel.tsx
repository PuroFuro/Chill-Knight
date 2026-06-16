import { useEffect, useRef, useState } from "react";
import * as sfx from "../sound";

export interface ChatLine {
  id: number;
  from: string;
  level: number; // the world (difficulty) the speaker is in
  text: string;
  mine: boolean;
}

const IDLE_FADE_MS = 6000; // feed fades out this long after the last message

/**
 * Bottom-left chat (see reference-design/Overworld.png): a feed box on top and
 * a persistent input box below. When no new message arrives for a few seconds
 * the feed fades away, but the input box stays. Press "T" or click to chat.
 */
export default function ChatPanel({
  lines,
  onSend,
  onTypingChange,
}: {
  lines: ChatLine[];
  onSend: (text: string) => void;
  onTypingChange: (typing: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [idle, setIdle] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  // Show the feed while there's recent activity, hovering, or typing.
  const feedVisible = !idle || hovered || focused;

  // "T" (or Enter) opens the chat for typing from anywhere in the game.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement;
      const typingElsewhere =
        ae instanceof HTMLInputElement || ae instanceof HTMLTextAreaElement;
      if ((e.key === "t" || e.key === "T") && !typingElsewhere) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") inputRef.current?.blur();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Each new message wakes the feed and restarts the idle timer.
  useEffect(() => {
    if (lines.length === 0) return;
    setIdle(false);
    const t = setTimeout(() => setIdle(true), IDLE_FADE_MS);
    return () => clearTimeout(t);
  }, [lines]);

  useEffect(() => {
    feedRef.current?.scrollTo(0, feedRef.current.scrollHeight);
  }, [lines, feedVisible]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (t) {
      onSend(t);
      sfx.play("messageSent");
    }
    setText("");
    inputRef.current?.blur();
  }

  return (
    <div
      className="absolute bottom-4 left-4 flex w-80 flex-col gap-2"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        ref={feedRef}
        className={`ck-chat-fade h-40 overflow-y-auto rounded-md border border-ink bg-black/5 px-3 py-2 text-sm ${
          feedVisible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        {lines.length === 0 && (
          <p className="text-muted">No messages yet. Press T to chat.</p>
        )}
        {lines.map((l) => (
          <div key={l.id} className="mb-1 leading-snug">
            <span className={l.mine ? "font-bold text-ink" : "font-bold text-danger"}>
              {l.from}
            </span>{" "}
            <span className="text-muted">(World {l.level})</span>
            <span> : {l.text}</span>
          </div>
        ))}
      </div>

      {/* Input box always persists. */}
      <form onSubmit={submit} className="flex items-center gap-1">
        <input
          ref={inputRef}
          className="ck-input text-sm"
          placeholder="Press 't' or click this box to chat"
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
        <button
          type="submit"
          className="rounded-md border border-ink bg-panel px-3 py-2 text-sm hover:bg-black/5"
          aria-label="Send"
        >
          &gt;
        </button>
      </form>
    </div>
  );
}
