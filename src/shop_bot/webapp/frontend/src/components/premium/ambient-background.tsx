export function AmbientBackground() {
  return (
    <div className="ambient-bg pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <div className="ambient-orb ambient-orb--1" />
      <div className="ambient-orb ambient-orb--2" />
    </div>
  );
}
