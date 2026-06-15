import boneheadImg from "../assets/Bonehead_Normal.png";

/**
 * About screen — a card with placeholder copy about the game and the author,
 * plus a Back button. (See reference-design/About page.png.) Copy is a
 * placeholder for PuroFuro to fill in later.
 */
export default function About({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-paper">
      <div className="ck-popout flex w-[820px] max-w-[92vw] items-center justify-between gap-8 p-10">
        <div className="flex-1">
          <h2 className="ck-wordmark text-4xl">Chill Knight</h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed">
            Chill Knight is a web-based, real-time multiplayer game where you
            slay wandering mobs, party up for raid bosses, level up your knight,
            and climb the leaderboard. Wander the overworld, stay chill, and see
            how far you can push the difficulty.
            {/* TODO(PuroFuro): replace with your final About copy. */}
          </p>
          <p className="mt-10 text-lg">@PuroFuro</p>
        </div>
        <img
          src={boneheadImg}
          alt="Bonehead"
          className="h-40 w-40 object-contain"
          style={{ imageRendering: "pixelated" }}
        />
      </div>
      <button className="ck-btn mt-6" onClick={onBack}>
        Back
      </button>
    </div>
  );
}
