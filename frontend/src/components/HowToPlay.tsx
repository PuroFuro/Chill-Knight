export default function HowToPlay() {
  return (
    <div className="text-sm text-gray-300">
      <h2 className="mb-3 text-lg font-bold text-knight-accent">How to play</h2>
      <ul className="list-disc space-y-1.5 pl-5 text-gray-400">
        <li><b className="text-gray-200">WASD / Arrows</b> — move</li>
        <li><b className="text-gray-200">Mouse</b> — aim your slash</li>
        <li><b className="text-gray-200">Left-click / J</b> — slash attack</li>
        <li>
          <b className="text-gray-200">Space / K</b> — parry. Time it as an
          enemy winds up (they flash) to negate damage and power up your next
          hit.
        </li>
        <li><b className="text-gray-200">H</b> — drink a potion</li>
        <li><b className="text-gray-200">T</b> — open chat and type</li>
        <li>
          Kills near allies are <b className="text-gray-200">shared</b>. Raids
          spawn a boss — first clear pays a bonus and unlocks gear.
        </li>
      </ul>
    </div>
  );
}
