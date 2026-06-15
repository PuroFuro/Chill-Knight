export interface KillPopup {
  id: number;
  kind: "gold" | "exp";
  amount: number;
}

/**
 * Floating "+gold / +exp" numbers that rise above the local knight (drawn at
 * screen centre) when a kill pays out. Capped to the last few by the caller.
 */
export default function KillPopups({ popups }: { popups: KillPopup[] }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[140%]">
      <div className="flex flex-col-reverse items-center gap-0.5">
        {popups.map((p) => (
          <div
            key={p.id}
            className={`ck-pop text-sm font-bold ${
              p.kind === "gold" ? "text-gold" : "text-hp"
            }`}
          >
            +{p.amount}
            {p.kind === "gold" ? "g" : " exp"}
          </div>
        ))}
      </div>
    </div>
  );
}
