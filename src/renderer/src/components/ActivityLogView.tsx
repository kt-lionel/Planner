import { useMemo, useState } from 'react';
import type { ActivityLogEntry, Task, TaskStatus } from '@shared/types';
import { STATUS_LABELS } from '@shared/types';
import { addDays, isoDate, parseISO } from '@shared/date';

interface Props {
  log: ActivityLogEntry[];
  tasks: Task[];
}

const ACTION_LABEL: Record<ActivityLogEntry['action'], string> = {
  created: 'Created',
  status: 'Status changed',
  edited: 'Edited',
  moved: 'Moved',
  deleted: 'Deleted'
};

function detailOf(entry: ActivityLogEntry): string {
  if (entry.action === 'status') {
    const to = entry.to;
    return `→ ${(to ? STATUS_LABELS[to as TaskStatus] : undefined) ?? to ?? ''}`;
  }
  if (entry.action === 'moved') {
    return `${entry.from ?? ''} → ${entry.to ?? ''}`;
  }
  return '';
}

export default function ActivityLogView({ log, tasks }: Props) {
  const [day, setDay] = useState(() => isoDate(new Date()));
  const todayIso = isoDate(new Date());

  const entries = useMemo(
    () => log.filter((e) => e.date === day).sort((a, b) => b.at.localeCompare(a.at)),
    [log, day]
  );
  const scheduled = tasks.filter((t) => t.date === day).length;

  const shift = (n: number): void => setDay(isoDate(addDays(parseISO(day), n)));
  const dayLabel = parseISO(day).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return (
    <main className="log-view" id="log-view">
      <div className="log-head">
        <div>
          <span className="dash-kicker">History</span>
          <h1>Activity log</h1>
          <p className="muted">
            Every change is recorded automatically — created, status, edits, moves and deletes.
            Export any day from the Reports tab.
          </p>
        </div>
      </div>

      <div className="log-nav">
        <button className="btn btn-ghost btn-icon" id="log-prev" onClick={() => shift(-1)}>
          ◀
        </button>
        <input
          className="input log-date"
          id="log-date"
          type="date"
          value={day}
          onChange={(e) => e.target.value && setDay(e.target.value)}
        />
        <button className="btn btn-ghost btn-icon" id="log-next" onClick={() => shift(1)}>
          ▶
        </button>
        <button className="btn" id="log-today" onClick={() => setDay(todayIso)}>
          Today
        </button>
        <span className="spacer" />
        <span className="log-summary">
          {entries.length} entr{entries.length === 1 ? 'y' : 'ies'} · {scheduled} task(s) scheduled
        </span>
      </div>

      <div className="log-day-label">{dayLabel}</div>

      {entries.length === 0 ? (
        <div className="dash-empty" id="log-empty">
          No activity recorded on this day.
        </div>
      ) : (
        <ul className="log-list">
          {entries.map((entry) => {
            const time = new Date(entry.at).toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit'
            });
            const detail = detailOf(entry);
            return (
              <li className="log-row" key={entry.id}>
                <span className="log-time">{time}</span>
                <span className={`log-action action-${entry.action}`}>
                  {ACTION_LABEL[entry.action]}
                </span>
                <span className="log-title">{entry.taskTitle}</span>
                {detail && <span className="log-detail">{detail}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
