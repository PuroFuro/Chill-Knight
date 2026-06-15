import type { ReactNode } from "react";

/**
 * Shared frame for every overworld pop-out: a dimmed backdrop with a centered
 * white card and an ✕ close button in the corner. Clicking the backdrop or ✕
 * closes it.
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
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/20 p-4"
      onClick={onClose}
    >
      <div
        className={`ck-popout relative ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded border border-ink bg-panel text-sm hover:bg-black/5"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}
