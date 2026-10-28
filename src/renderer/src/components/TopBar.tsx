import type { TaskStatus } from '@shared/types';
import { STATUS_LABELS, STATUS_ORDER } from '@shared/types';
import { formatWeekRange, weekNumber } from '@shared/date';

type View =
  | 'dashboard'
  | 'board'
  | 'log'
  | 'vuln'
  | 'assets'
  | 'engage'
  | 'toolbox'
  | 'commands'
  | 'reports'
  | 'references'
  | 'vault';

interface Props {
  view: View;
  weekStart: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  query: string;
  onQuery: (value: string) => void;
  assignee: string;
  onAssignee: (value: string) => void;
  people: string[];
  status: 'all' | TaskStatus;
  onStatus: (value: 'all' | TaskStatus) => void;
  taskCount: number;
  onAdd: () => void;
  onReports: () => void;
  onCmdVault: () => void;
  saving: boolean;
}

export default function TopBar(props: Props) {

  return (
    <header className="topbar">
      <div className="topbar-row">
        {props.view === 'board' && (
          <div className="week-nav">
            <button className="btn btn-ghost btn-icon" onClick={props.onPrev} title="Previous week">
              ‹
            </button>
            <div className="week-label">
              {formatWeekRange(props.weekStart)}
              <small>Week {weekNumber(props.weekStart)}</small>
            </div>
            <button className="btn btn-ghost btn-icon" onClick={props.onNext} title="Next week">
              ›
            </button>
            <button className="btn btn-ghost" onClick={props.onToday}>
              Today
            </button>
          </div>
        )}

        <div className="spacer" />

        <button
          className="btn btn-yellow"
          id="cmd-vault"
          onClick={props.onCmdVault}
          title="Command vault — Ctrl+K"
        >
          ⌘ Cmd Vault
        </button>

        <span className="count-pill">{props.saving ? 'Saving…' : 'All changes saved'}</span>

        <button className="btn" id="top-reports" onClick={props.onReports} title="Reports & exports">
          📤 Reports
        </button>

        {props.view === 'board' && (
          <button className="btn btn-yellow" id="new-task" onClick={props.onAdd}>
            + New task
          </button>
        )}
      </div>

      {props.view === 'board' && (
        <div className="topbar-row">
          <input
            className="input search"
            placeholder="Search tasks…"
            value={props.query}
            onChange={(e) => props.onQuery(e.target.value)}
          />

          <select
            className="select"
            value={props.assignee}
            onChange={(e) => props.onAssignee(e.target.value)}
            aria-label="Filter by owner"
          >
            <option value="all">All owners</option>
            {props.people.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <select
            className="select"
            value={props.status}
            onChange={(e) => props.onStatus(e.target.value as 'all' | TaskStatus)}
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>

          {(props.query || props.assignee !== 'all' || props.status !== 'all') && (
            <button
              className="btn btn-ghost"
              onClick={() => {
                props.onQuery('');
                props.onAssignee('all');
                props.onStatus('all');
              }}
            >
              Clear filters
            </button>
          )}

          <div className="spacer" />
          <span className="count-pill">{props.taskCount} task(s) shown</span>
        </div>
      )}
    </header>
  );
}
