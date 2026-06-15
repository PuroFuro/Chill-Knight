import Wordmark from "./Wordmark";

/**
 * The first screen players see. Centered wordmark with the three entry
 * options: Register, Login, About. (See reference-design/title screen.png.)
 */
export default function TitleScreen({
  onRegister,
  onLogin,
  onAbout,
}: {
  onRegister: () => void;
  onLogin: () => void;
  onAbout: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-paper">
      <Wordmark />
      <nav className="mt-10 flex flex-col items-center gap-6 text-2xl">
        <button className="transition-opacity hover:opacity-60" onClick={onRegister}>
          Register
        </button>
        <button className="transition-opacity hover:opacity-60" onClick={onLogin}>
          Login
        </button>
        <button className="transition-opacity hover:opacity-60" onClick={onAbout}>
          About
        </button>
      </nav>
    </div>
  );
}
