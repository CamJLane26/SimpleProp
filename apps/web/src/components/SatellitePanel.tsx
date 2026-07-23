type Props = {
  satellites: { id: number; name: string; noradId: number }[];
  visibleIds: Set<number>;
  forVisibleIds: Set<number>;
  onToggle: (id: number) => void;
  onToggleFor: (id: number) => void;
  onShowAll: () => void;
  onHideAll: () => void;
  onShowAllFor: () => void;
  onHideAllFor: () => void;
};

export function SatellitePanel({
  satellites,
  visibleIds,
  forVisibleIds,
  onToggle,
  onToggleFor,
  onShowAll,
  onHideAll,
  onShowAllFor,
  onHideAllFor,
}: Props) {
  return (
    <aside className="panel">
      <header className="panel-header">
        <h2>Satellites</h2>
        <p className="panel-meta">
          {visibleIds.size}/{satellites.length} visible · {forVisibleIds.size}{" "}
          FOR
        </p>
        <div className="panel-actions">
          <button type="button" onClick={onShowAll}>
            Show all
          </button>
          <button type="button" onClick={onHideAll}>
            Hide all
          </button>
        </div>
        <div className="panel-actions">
          <button type="button" onClick={onShowAllFor}>
            Show FORs
          </button>
          <button type="button" onClick={onHideAllFor}>
            Hide FORs
          </button>
        </div>
      </header>
      <ul className="sat-list">
        {satellites.map((sat) => {
          const satVisible = visibleIds.has(sat.id);
          return (
            <li key={sat.id}>
              <div className="sat-row">
                <label className="sat-check">
                  <input
                    type="checkbox"
                    checked={satVisible}
                    onChange={() => onToggle(sat.id)}
                    aria-label={`Show ${sat.name}`}
                  />
                </label>
                <div className="sat-info">
                  <span className="sat-name">{sat.name}</span>
                  <span className="sat-norad">{sat.noradId}</span>
                </div>
                <label
                  className={
                    satVisible ? "for-check" : "for-check disabled"
                  }
                >
                  <input
                    type="checkbox"
                    checked={satVisible && forVisibleIds.has(sat.id)}
                    disabled={!satVisible}
                    onChange={() => onToggleFor(sat.id)}
                    aria-label={`Show FOR cone for ${sat.name}`}
                  />
                  <span>FOR</span>
                </label>
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
