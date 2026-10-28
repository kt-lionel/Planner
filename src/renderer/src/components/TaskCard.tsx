import type { Task } from '@shared/types';
import { STATUS_LABELS } from '@shared/types';
import { avatarColor, initials } from '../lib/format';

interface Props {
  task: Task;
  onOpen: (task: Task) => void;
  onChangeStatus: (task: Task) => void;
}

function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  });
}

export default function TaskCard({ task, onOpen, onChangeStatus }: Props) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const open = task.status !== 'done' && task.status !== 'canceled';
  const overdue = Boolean(task.dueDate && task.dueDate < todayIso && open);

  return (
    <article
      className={`card ${task.status}`}
      draggable
      onClick={() => onOpen(task)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen(task);
      }}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/task-id', task.id);
        e.dataTransfer.effectAllowed = 'move';
        e.currentTarget.classList.add('dragging');
      }}
      onDragEnd={(e) => {
        e.currentTarget.classList.remove('dragging');
      }}
      title={task.notes || task.title}
    >
      <div className="card-top">
        <span className="card-time">{task.time ?? ''}</span>
        <button
          className="card-status-btn"
          onClick={(e) => {
            e.stopPropagation();
            onChangeStatus(task);
          }}
          title="Change status"
        >
          Change status
        </button>
      </div>

      <div className="card-title">{task.title}</div>

      <div className="card-meta">
        <span className="badge status-chip">
          <span className={`dot dot-${task.status}`} />
          {STATUS_LABELS[task.status]}
        </span>
        <span
          className="avatar"
          style={{ background: avatarColor(task.assignee || '?') }}
          aria-hidden="true"
        >
          {initials(task.assignee || '?')}
        </span>
        <span className="owner">{task.assignee || 'Unassigned'}</span>
        {task.dueDate && task.recurrence === 'none' && (
          <span className={`badge due-badge${overdue ? ' overdue' : ''}`}>
            ⚑ {shortDate(task.dueDate)}
            {overdue ? ' · late' : ''}
          </span>
        )}
        {task.recurrence === 'weekly' && <span className="badge">↻ weekly</span>}
        {task.recurrence === 'monthly' && <span className="badge">↻ monthly</span>}
      </div>
    </article>
  );
}
