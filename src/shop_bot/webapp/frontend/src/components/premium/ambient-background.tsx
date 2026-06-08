export function AmbientBackground() {
  return (
    <div className="ambient-bg pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <div className="ambient-mesh" />
      <div className="ambient-orb ambient-orb--coral" />
      <div className="ambient-orb ambient-orb--cyan" />
      <div className="ambient-orb ambient-orb--lavender" />
      <div className="ambient-grid" />
    </div>
  );
}
