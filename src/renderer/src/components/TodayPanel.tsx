import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Task } from '@shared/types';
import { STATUS_COLORS, STATUS_LABELS } from '@shared/types';
import { isoDate } from '@shared/date';

interface Props {
  tasks: Task[];
  onStatusChange: (task: Task) => void;
  onOpenTask: (task: Task) => void;
  onQuickAdd: (title: string) => void;
}

export default function TodayPanel({ tasks, onStatusChange, onOpenTask, onQuickAdd }: Props) {
  const [draft, setDraft] = useState('');
  const todayIso = isoDate(new Date());

  const today = tasks
    .filter((t) => t.date === todayIso && t.status !== 'canceled')
    .sort(
      (a, b) =>
        (a.time ?? '99:99').localeCompare(b.time ?? '99:99') || a.title.localeCompare(b.title)
    );
  const overdue = tasks.filter(
    (t) =>
      t.dueDate && t.dueDate < todayIso && t.status !== 'done' && t.status !== 'canceled'
  );

  const submit = (): void => {
    const title = draft.trim();
    if (!title) return;
    onQuickAdd(title);
    setDraft('');
  };

  const dayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

  const row = (task: Task, mark?: ReactNode): ReactNode => (
    <li key={task.id} className={`today-row${task.status === 'done' ? ' is-done' : ''}`}>
      <span className={`dot dot-${task.status}`} aria-hidden />
      <button
        type="button"
        className="today-title"
        onClick={() => onOpenTask(task)}
        title="Open task"
      >
        {task.title}
      </button>
      {task.time && <span className="today-time">{task.time}</span>}
      <span className="today-owner">{task.assignee}</span>
      <span className="today-status" style={{ color: STATUS_COLORS[task.status] }}>
        {STATUS_LABELS[task.status]}
      </span>
      <button
        type="button"
        className="btn btn-ghost today-status-btn"
        onClick={() => onStatusChange(task)}
      >
        Change
      </button>
      {mark}
    </li>
  );

  return (
    <section className="dash-panel today-panel" id="today-panel">
      <div className="today-head">
        <div>
          <h2>Today</h2>
          <span className="today-date">{dayLabel}</span>
        </div>
        <form
          className="today-add"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            id="today-quick-add"
            className="input"
            placeholder="Add an activity for today…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button
            type="submit"
            id="today-add-btn"
            className="btn btn-yellow"
            disabled={!draft.trim()}
          >
            + Add
          </button>
        </form>
      </div>

      {today.length === 0 && overdue.length === 0 ? (
        <div className="dash-empty" id="today-empty">
          Nothing scheduled for today — add your first activity above.
        </div>
      ) : (
        <div className="today-cols">
          <div className="today-col">
            <h3>
              Scheduled <span className="today-count">{today.length}</span>
            </h3>
            {today.length ? (
              <ul className="today-list">{today.map((task) => row(task))}</ul>
            ) : (
              <div className="dash-empty">Nothing scheduled for today.</div>
            )}
          </div>
          {overdue.length > 0 && (
            <div className="today-col">
              <h3 className="warn">
                Overdue <span className="today-count">{overdue.length}</span>
              </h3>
              <ul className="today-list">
                {overdue.map((task) => row(task, <span className="today-late">⚑ late</span>))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
