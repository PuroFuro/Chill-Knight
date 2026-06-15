/**
 * The "Chill Knight" title wordmark + tagline, shared by the title, login,
 * register and about screens.
 */
export default function Wordmark({ size = "lg" }: { size?: "lg" | "md" }) {
  return (
    <div className="text-center leading-none">
      <h1
        className={`ck-wordmark ${
          size === "lg" ? "text-7xl" : "text-5xl"
        }`}
      >
        Chill Knight
      </h1>
      <p className="mt-1 text-sm text-ink">A web-based game by PuroFuro</p>
    </div>
  );
}
