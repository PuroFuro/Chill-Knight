import { useEffect, useState } from "react";

// True on touch-primary devices (phones/tablets), where we swap the
// keyboard+mouse controls for the on-screen joysticks. Uses the `pointer:
// coarse` media query (with a touch-points fallback) and re-checks if the
// primary pointer changes (e.g. a tablet docked to a mouse).
export function useIsTouch(): boolean {
  const detect = () => {
    if (typeof window === "undefined") return false;
    // Prefer the primary-pointer query: this stays false on hybrid touch
    // laptops driven by a mouse, and only the maxTouchPoints fallback covers
    // ancient browsers without it.
    if (window.matchMedia) return window.matchMedia("(pointer: coarse)").matches;
    return (navigator.maxTouchPoints ?? 0) > 0;
  };

  const [touch, setTouch] = useState<boolean>(detect);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const on = () => setTouch(detect());
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);

  return touch;
}
