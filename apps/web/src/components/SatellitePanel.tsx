type Props = {
  satellites: { id: number; name: string; noradId: number }[];
  visibleIds: Set<number>;
  onToggle: (id: number) => void;
  onShowAll: () => void;
  onHideAll: () => void;
};

export function SatellitePanel({
  satellites,
  visibleIds,
  onToggle,
  onShowAll,
  onHideAll,
}: Props) {
  return (
    <aside className="panel">
      <header className="panel-header">
        <h2>Satellites</h2>
        <p className="panel-meta">
          {visibleIds.size}/{satellites.length} visible
        </p>
        <div className="panel-actions">
          <button type="button" onClick={onShowAll}>
            Show all
          </button>
          <button type="button" onClick={onHideAll}>
            Hide all
          </button>
        </div>
      </header>
      <ul className="sat-list">
        {satellites.map((sat) => (
          <li key={sat.id}>
            <label className="sat-row">
              <input
                type="checkbox"
                checked={visibleIds.has(sat.id)}
                onChange={() => onToggle(sat.id)}
              />
              <span className="sat-name">{sat.name}</span>
              <span className="sat-norad">{sat.noradId}</span>
            </label>
          </li>
        ))}
      </ul>
    </aside>
  );
}
