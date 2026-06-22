import { useCallback, useState, type ReactNode } from "react";

// Must match the .ck-pop-out duration in index.css so the parent only unmounts
// once the slide-down has finished playing.
const EXIT_MS = 280;

/**
 * Shared frame for every overworld pop-out: a dimmed backdrop with a centered
 * white card and an ✕ close button in the corner. Clicking the backdrop or ✕
 * closes it. The card slides up from the bottom on open and slides back down on
 * close (the real `onClose` is deferred until the exit animation completes).
 */
export default function PopoutShell({
  onClose,
  children,
  className = "",
}: {
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const [closing, setClosing] = useState(false);

  const close = useCallback(() => {
    setClosing((c) => {
      if (c) return c; // already closing — ignore repeat clicks
      window.setTimeout(onClose, EXIT_MS);
      return true;
    });
  }, [onClose]);

  return (
    <div
      className={`fixed inset-0 z-40 flex items-center justify-center bg-black/20 p-4 ${
        closing ? "ck-backdrop-out" : "ck-backdrop-in"
      }`}
      onClick={close}
    >
      <div
        className={closing ? "ck-pop-out" : "ck-pop-in"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`ck-popout relative ${className}`}>
          <button
            className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded border border-ink bg-panel text-sm hover:bg-black/5"
            onClick={close}
            aria-label="Close"
          >
            ✕
          </button>
          {children}
        </div>
      </div>
    </div>
  );
}
