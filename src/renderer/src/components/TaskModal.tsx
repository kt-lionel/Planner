import { useEffect, useState } from 'react';
import type { Recurrence, Task, TaskStatus } from '@shared/types';
import { STATUS_LABELS, STATUS_ORDER, withStatus } from '@shared/types';
import { newId } from '../lib/format';

interface Props {
  initial: Task | null;
  defaultDate: string;
  owner: string;
  onSave: (task: Task) => void;
  onDelete: (task: Task) => void;
  onClose: () => void;
}

const RECURRENCE_OPTIONS: Array<{ value: Recurrence; label: string }> = [
  { value: 'none', label: 'Does not repeat (one-off)' },
  { value: 'weekly', label: 'Repeats every week' },
  { value: 'monthly', label: 'Repeats every month' }
];

function formatStamp(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function TaskModal({ initial, defaultDate, owner, onSave, onDelete, onClose }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [date, setDate] = useState(initial?.date ?? defaultDate);
  const [time, setTime] = useState(initial?.time ?? '');
  const [status, setStatus] = useState<TaskStatus>(initial?.status ?? 'todo');
  const [recurrence, setRecurrence] = useState<Recurrence>(initial?.recurrence ?? 'none');
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const assignee = initial?.assignee?.trim() || owner;

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = (): void => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Task title is required.');
      return;
    }
    if (!date) {
      setError('Pick a day for the task.');
      return;
    }
    const nowIso = new Date().toISOString();
    let task: Task = {
      id: initial?.id ?? newId(),
      title: trimmed,
      assignee,
      date,
      time: time || undefined,
      status: initial?.status ?? 'todo',
      notes: notes.trim() || undefined,
      recurrence,
      dueDate: recurrence === 'none' && dueDate ? dueDate : undefined,
      lastAdvancedWeek: initial?.lastAdvancedWeek,
      lastAdvancedMonth: initial?.lastAdvancedMonth,
      completedAt: initial?.completedAt,
      canceledAt: initial?.canceledAt,
      createdAt: initial?.createdAt ?? nowIso,
      updatedAt: nowIso
    };
    task = withStatus(task, status, nowIso);
    onSave(task);
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={initial ? 'Edit task' : 'New task'}
      >
        <div className="modal-head">
          <h2>{initial ? 'Edit task' : 'New task'}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label htmlFor="task-title">Task</label>
            <input
              id="task-title"
              className="input"
              autoFocus
              placeholder="e.g. ELA & Jump Server: Archiving, Version Status and Resource Monitoring"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label>Owner</label>
              <div className="owner-readonly">
                <span className="avatar-sm">{initialsOf(assignee)}</span>
                {assignee || 'You'}
                <span className="owner-auto">auto</span>
              </div>
            </div>

            <div className="field">
              <label htmlFor="task-status">Status</label>
              <select
                id="task-status"
                className="select"
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="task-date">Day</label>
              <input
                id="task-date"
                className="input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="task-time">Time (optional)</label>
              <input
                id="task-time"
                className="input"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="task-recurrence">Repeats</label>
            <select
              id="task-recurrence"
              className="select"
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as Recurrence)}
            >
              {RECURRENCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {recurrence === 'none' && (
            <div className="field">
              <label htmlFor="task-due">Deadline (optional)</label>
              <input
                id="task-due"
                className="input"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
              <span className="field-hint">
                Used to track progress — late tasks are flagged on the card and dashboard.
              </span>
            </div>
          )}

          <div className="field">
            <label htmlFor="task-notes">Notes</label>
            <textarea
              id="task-notes"
              className="textarea"
              rows={3}
              placeholder="Checks, links, prerequisites…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {initial && (
            <div className="task-stamps">
              <span>Created: {formatStamp(initial.createdAt)}</span>
              {initial.completedAt && <span className="stamp-done">Completed: {formatStamp(initial.completedAt)}</span>}
              {initial.canceledAt && (
                <span className="stamp-canceled">Canceled: {formatStamp(initial.canceledAt)}</span>
              )}
              {!initial.completedAt && !initial.canceledAt && (
                <span>Not completed or canceled yet</span>
              )}
            </div>
          )}

          {error && <div className="form-error">{error}</div>}
        </div>

        <div className="modal-foot">
          {initial && (
            <button
              className="btn btn-danger"
              onClick={() => onDelete(initial)}
              style={{ marginRight: 'auto' }}
            >
              Delete
            </button>
          )}
          {!initial && <span style={{ marginRight: 'auto' }} className="hint">Ctrl/Cmd + N adds a task</span>}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit}>
            {initial ? 'Save changes' : 'Add task'}
          </button>
        </div>
      </div>
    </div>
  );
}

function initialsOf(name: string): string {
  const parts = (name || 'You').trim().split(/\s+/);
  return ((parts[0]?.[0] ?? 'Y') + (parts[1]?.[0] ?? '')).toUpperCase();
}
