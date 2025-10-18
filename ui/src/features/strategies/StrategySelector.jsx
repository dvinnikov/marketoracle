export default function StrategySelector({ strategies = [], selected = [], onChange }) {
  const toggle = (name) => {
    if (!onChange) return;
    const exists = selected.includes(name);
    const next = exists ? selected.filter((s) => s !== name) : [...selected, name];
    onChange(next);
  };

  const selectAll = () => {
    onChange?.(strategies.map((s) => s.name));
  };

  const clearAll = () => {
    onChange?.([]);
  };

  return (
    <div>
      <div className="h" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <b>Strategies</b>
        <div className="actions">
          <button className="btn-muted" type="button" onClick={selectAll}>All</button>
          <button className="btn-muted" type="button" onClick={clearAll}>None</button>
        </div>
      </div>
      <div className="hr" />
      {strategies.length === 0 ? (
        <div style={{ color: "var(--muted)" }}>No strategies configured</div>
      ) : (
        <ul className="strategy-list">
          {strategies.map((s) => {
            const params = Object.entries(s.params || {})
              .map(([k, v]) => `${k}: ${v}`)
              .join(", ");
            return (
              <li key={s.name} className={selected.includes(s.name) ? "active" : ""}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.includes(s.name)}
                    onChange={() => toggle(s.name)}
                  />
                  <span>{s.name}</span>
                </label>
                {params && <div className="params">{params}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
