import type { Task, TaskStatus } from '@shared/types';
import { STATUS_LABELS } from '@shared/types';

const AVATAR_COLORS = [
  '#f59e0b',
  '#22c55e',
  '#38bdf8',
  '#f472b6',
  '#a78bfa',
  '#34d399',
  '#fbbf24',
  '#fb7185'
];

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function toCsv(tasks: Task[], weekLabel: string): string {
  const header = ['Date', 'Day', 'Time', 'Task', 'Owner', 'Status', 'Repeats', 'Notes'];
  const esc = (value: string): string => `"${value.replace(/"/g, '""')}"`;
  const rows = tasks.map((t) => {
    const [y, m, d] = t.date.split('-');
    const day = new Date(Number(y), Number(m) - 1, Number(d)).getDay();
    const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day];
    return [
      t.date,
      dayName,
      t.time ?? '',
      t.title,
      t.assignee,
      STATUS_LABELS[t.status],
      t.recurrence === 'weekly' ? 'weekly' : '',
      t.notes ?? ''
    ]
      .map(esc)
      .join(',');
  });
  return [`# Weekly plan ${weekLabel}`, header.map(esc).join(','), ...rows].join('\n');
}

export function statusLabel(status: TaskStatus): string {
  return STATUS_LABELS[status];
}

export function newId(): string {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
