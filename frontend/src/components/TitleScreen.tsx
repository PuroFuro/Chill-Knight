import Wordmark from "./Wordmark";

/**
 * The first screen players see. Centered wordmark with the entry options.
 * Single-player now, so it's just Play + About (no account / login).
 */
export default function TitleScreen({
  onPlay,
  onAbout,
}: {
  onPlay: () => void;
  onAbout: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-paper">
      <Wordmark />
      <nav className="mt-10 flex flex-col items-center gap-6 text-2xl">
        <button className="transition-opacity hover:opacity-60" onClick={onPlay}>
          Play
        </button>
        <button className="transition-opacity hover:opacity-60" onClick={onAbout}>
          About
        </button>
      </nav>
    </div>
  );
}
