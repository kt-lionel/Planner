import type { Task } from '@shared/types';

interface Props {
  tasks: Task[];
  weekLabel: string;
}

const TILES = [
  { key: 'total', label: 'Total tasks', glyph: '▣', tone: 'blue' },
  { key: 'done', label: 'Completed', glyph: '✓', tone: 'green' },
  { key: 'in_progress', label: 'In progress', glyph: '◐', tone: 'yellow' },
  { key: 'blocked', label: 'Blocked', glyph: '!', tone: 'red' },
  { key: 'canceled', label: 'Canceled', glyph: '⊘', tone: 'gray' }
] as const;

export default function StatsBar({ tasks, weekLabel }: Props) {
  const count = (key: string): number =>
    key === 'total' ? tasks.length : tasks.filter((t) => t.status === key).length;
  const done = count('done');
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  return (
    <div className="stats">
      <div className="week-heading">
        <span className="week-kicker">Weekly overview</span>
        <strong>{weekLabel}</strong>
      </div>

      <div className="kpis">
        {TILES.map((tile) => (
          <div className={`kpi kpi-${tile.tone}`} key={tile.key}>
            <span className="kpi-icon">{tile.glyph}</span>
            <div className="kpi-body">
              <b>{count(tile.key)}</b>
              <span>{tile.label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="progress-card">
        <div
          className="ring"
          style={{ background: `conic-gradient(var(--yellow) ${pct}%, var(--panel-3) 0)` }}
          title={`${pct}% complete`}
        >
          <div className="ring-inner">
            <b>{pct}%</b>
            <span>done</span>
          </div>
        </div>
        <div className="progress-copy">
          <strong>Weekly completion</strong>
          <span>
            {done} of {tasks.length} tasks finished
          </span>
        </div>
      </div>
    </div>
  );
}
