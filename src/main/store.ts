import { app } from 'electron';
import { copyFile, mkdir, readFile, rename, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import type { PlanData, Task, VulnReport } from '../shared/types';
import { addDays, isoDate, startOfWeek } from '../shared/date';
import { decryptPlan, encryptPlan, getSession, isEncryptedEnvelope } from './auth';

export function dataFilePath(): string {
  return join(app.getPath('userData'), 'plan.json');
}

function uid(): string {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function now(): string {
  return new Date().toISOString();
}

function seedPlan(owner: string): PlanData {
  const monday = startOfWeek(new Date());
  const day = (offset: number): string => isoDate(addDays(monday, offset));
  const base: Array<Partial<Task> & { title: string; assignee: string; date: string }> = [
    {
      title: 'ELA & Jump Server: Archiving, Version Status and Resource Monitoring',
      assignee: owner,
      date: day(0),
      time: '09:00',
      status: 'in_progress',
      notes: 'Verify archive rotation, check firmware/version status and CPU/memory/disk usage.',
      recurrence: 'weekly'
    },
    {
      title: 'Daily backup verification',
      assignee: owner,
      date: day(1),
      time: '08:30',
      status: 'todo',
      recurrence: 'weekly'
    },
    {
      title: 'Firewall rule review',
      assignee: owner,
      date: day(2),
      time: '14:00',
      status: 'todo',
      recurrence: 'weekly'
    },
    {
      title: 'Patch & vulnerability report',
      assignee: owner,
      date: day(3),
      status: 'blocked',
      notes: 'Waiting on change window approval.',
      recurrence: 'none',
      dueDate: day(4)
    },
    {
      title: 'Weekly ops sync with team',
      assignee: owner,
      date: day(4),
      time: '15:00',
      status: 'todo',
      recurrence: 'weekly'
    },
    {
      title: 'Access rights audit',
      assignee: owner,
      date: day(4),
      status: 'done',
      recurrence: 'none',
      dueDate: day(4)
    }
  ];

  const tasks: Task[] = base.map((t) => ({
    id: uid(),
    title: t.title,
    assignee: t.assignee,
    date: t.date,
    time: t.time,
    status: t.status ?? 'todo',
    notes: t.notes,
    recurrence: t.recurrence ?? 'none',
    dueDate: t.dueDate,
    completedAt: (t.status ?? 'todo') === 'done' ? now() : undefined,
    createdAt: now(),
    updatedAt: now()
  }));

  const vuln: VulnReport = { title: '', findings: [] };
  return { version: 1, tasks, vuln };
}

/** Demo tasks from earlier releases, created for sample "team" owners. */
const DEMO_TITLES = new Set([
  'ELA & Jump Server: Archiving, Version Status and Resource Monitoring',
  'Daily backup verification',
  'Firewall rule review',
  'Patch & vulnerability report',
  'Weekly ops sync with team',
  'Access rights audit'
]);
const DEMO_OWNERS = new Set(['Lionel', 'Team', 'Aline', 'Musa']);

/**
 * Single-person app: drop the sample tasks that older builds seeded for
 * fictional team members, keeping anything the user created themselves.
 */
function purgeSampleTasks(tasks: Task[]): { tasks: Task[]; changed: boolean } {
  const kept = tasks.filter((t) => !(DEMO_OWNERS.has(t.assignee) && DEMO_TITLES.has(t.title)));
  return { tasks: kept, changed: kept.length !== tasks.length };
}

/**
 * Recurring tasks living in the past are cloned forward, one occurrence per
 * week (weekly) or per month (monthly) up to the current period.
 * `lastAdvancedWeek` / `lastAdvancedMonth` record the last period that was
 * materialised so occurrences are never duplicated (and a manually deleted
 * occurrence is not resurrected).
 */
function advanceRecurrences(tasks: Task[]): { tasks: Task[]; changed: boolean } {
  const currentWeekIso = isoDate(startOfWeek(new Date()));
  const currentMonth = isoDate(new Date()).slice(0, 7);
  let changed = false;
  const result: Task[] = tasks.map((t) => ({ ...t }));

  const key = (t: { title: string; assignee: string; date: string }): string =>
    `${t.title}@@${t.assignee}@@${t.date}`;
  const present = new Set(result.map(key));

  const daysInMonth = (year: number, month1: number): number =>
    new Date(year, month1, 0).getDate();

  for (const task of result) {
    if (task.recurrence === 'weekly') {
      const date = new Date(task.date);
      const anchor = startOfWeek(date);
      const anchorIso = isoDate(anchor);
      const weekdayOffset = date.getDay() === 0 ? 6 : date.getDay() - 1;

      if (anchorIso <= currentWeekIso) {
        const lastDoneIso = task.lastAdvancedWeek ?? anchorIso;
        let week = anchor;

        while (isoDate(week) <= currentWeekIso) {
          const weekIso = isoDate(week);
          if (weekIso > lastDoneIso) {
            const occurrence: Task = {
              ...task,
              id: uid(),
              date: isoDate(addDays(week, weekdayOffset)),
              status: 'todo',
              lastAdvancedWeek: weekIso,
              createdAt: now(),
              updatedAt: now()
            };
            delete occurrence.dueDate;
            delete occurrence.completedAt;
            delete occurrence.canceledAt;
            if (!present.has(key(occurrence))) {
              result.push(occurrence);
              present.add(key(occurrence));
              changed = true;
            }
          }
          week = addDays(week, 7);
        }

        if (task.lastAdvancedWeek !== currentWeekIso) {
          task.lastAdvancedWeek = currentWeekIso;
          task.updatedAt = now();
          changed = true;
        }
      }
    } else if (task.recurrence === 'monthly') {
      const anchorMonth = task.date.slice(0, 7);
      if (anchorMonth > currentMonth) continue;

      const dayOfMonth = Number(task.date.slice(8, 10)) || 1;
      const lastDoneMonth = task.lastAdvancedMonth ?? anchorMonth;
      const [startYear, startMonth] = anchorMonth.split('-').map(Number);
      const [endYear, endMonth] = currentMonth.split('-').map(Number);

      let year = startYear;
      let month = startMonth;
      while (year < endYear || (year === endYear && month <= endMonth)) {
        const mk = `${year}-${String(month).padStart(2, '0')}`;
        if (mk > lastDoneMonth) {
          const day = Math.min(dayOfMonth, daysInMonth(year, month));
          const occurrence: Task = {
            ...task,
            id: uid(),
            date: `${mk}-${String(day).padStart(2, '0')}`,
            status: 'todo',
            lastAdvancedMonth: mk,
            createdAt: now(),
            updatedAt: now()
          };
          delete occurrence.dueDate;
          delete occurrence.completedAt;
          delete occurrence.canceledAt;
          if (!present.has(key(occurrence))) {
            result.push(occurrence);
            present.add(key(occurrence));
            changed = true;
          }
        }
        month += 1;
        if (month > 12) {
          month = 1;
          year += 1;
        }
      }

      if (task.lastAdvancedMonth !== currentMonth) {
        task.lastAdvancedMonth = currentMonth;
        task.updatedAt = now();
        changed = true;
      }
    }
  }

  return { tasks: result, changed };
}

async function backupIfEncrypted(file: string): Promise<void> {
  try {
    const raw = await readFile(file, 'utf8');
    if (isEncryptedEnvelope(raw)) await copyFile(file, `${file}.bak`);
  } catch {
    /* nothing to back up */
  }
}

async function quarantine(file: string): Promise<void> {
  try {
    await rename(file, `${file}.corrupt-${Date.now()}`);
  } catch {
    /* ignore */
  }
}

/** Reads and decrypts the plan, re-encrypting legacy plaintext files. */
export async function loadPlan(key: Buffer): Promise<PlanData> {
  const file = dataFilePath();
  const owner = getSession()?.username ?? 'You';

  let raw: string | null = null;
  try {
    raw = await readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') await quarantine(file);
    const plan = seedPlan(owner);
    await savePlan(key, plan);
    return plan;
  }

  let plan: PlanData;
  if (isEncryptedEnvelope(raw)) {
    try {
      plan = decryptPlan(raw, key);
    } catch {
      await quarantine(file);
      const seeded = seedPlan(owner);
      await savePlan(key, seeded);
      return seeded;
    }
  } else {
    // Legacy plaintext file (pre-login): keep the data, encrypt it below.
    try {
      const parsed = JSON.parse(raw) as PlanData;
      if (!parsed || !Array.isArray(parsed.tasks)) throw new Error('invalid plan file');
      plan = parsed;
    } catch {
      await quarantine(file);
      const seeded = seedPlan(owner);
      await savePlan(key, seeded);
      return seeded;
    }
    await savePlan(key, plan);
  }

  const cleaned = purgeSampleTasks(plan.tasks);
  if (cleaned.changed) {
    console.log(`store: removed ${plan.tasks.length - cleaned.tasks.length} sample task(s) for other owners`);
  }
  const advanced = advanceRecurrences(cleaned.tasks);
  const result: PlanData = { ...plan, version: 1, tasks: advanced.tasks };
  if (cleaned.changed || advanced.changed) await savePlan(key, result);
  return result;
}

export async function savePlan(key: Buffer, plan: PlanData): Promise<void> {
  const file = dataFilePath();
  await mkdir(dirname(file), { recursive: true });
  await backupIfEncrypted(file);
  const tmp = `${file}.tmp`;
  await writeFile(tmp, encryptPlan(plan, key), 'utf8');
  await rename(tmp, file);
}

/** Session-gated wrappers used by IPC (and tests). */

export async function loadPlanForSession(): Promise<PlanData> {
  const session = getSession();
  if (!session) throw new Error('Locked: sign in first.');
  return loadPlan(session.key);
}

export async function savePlanForSession(plan: PlanData): Promise<void> {
  const session = getSession();
  if (!session) throw new Error('Locked: sign in first.');
  return savePlan(session.key, plan);
}

let planLock: Promise<unknown> = Promise.resolve();

/**
 * Serializes plan read-modify-write transactions. Without this a renderer
 * plan:save that loaded the plan before a vault write (or vice versa) can
 * merge stale data back over it and drop fields such as `vault`.
 */
export function withPlanLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = planLock.then(fn, fn);
  planLock = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}
