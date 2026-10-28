import type { PentestCommand } from './commands';

export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done' | 'canceled';

export type Recurrence = 'none' | 'weekly' | 'monthly';

export interface Task {
  id: string;
  title: string;
  assignee: string;
  /** ISO date, yyyy-mm-dd */
  date: string;
  /** optional 24h time, HH:mm */
  time?: string;
  status: TaskStatus;
  notes?: string;
  recurrence: Recurrence;
  /** Deadline (yyyy-mm-dd) for one-off tasks — used to track progress */
  dueDate?: string;
  /** ISO timestamp of the last transition to done */
  completedAt?: string;
  /** ISO timestamp of the last transition to canceled */
  canceledAt?: string;
  /** ISO week start (Monday) this recurring task has already been materialised for */
  lastAdvancedWeek?: string;
  /** yyyy-mm month this monthly task has already been materialised for */
  lastAdvancedMonth?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlanData {
  version: 1;
  tasks: Task[];
  vuln?: VulnReport;
  /** Append-only daily activity history — persisted with the plan. */
  log?: ActivityLogEntry[];
  /** Asset registry (hosts linked to findings). */
  assets?: Asset[];
  /** Pentest engagements (scope, RoE, methodology) — one entry per engagement. */
  engagements?: Engagement[];
  /**
   * @deprecated Single-engagement field from older versions — migrated to
   * `engagements` (with an assigned id) when the plan is loaded.
   */
  engagement?: Engagement;
  /** Daily open-findings snapshots for the risk trend. */
  risk?: RiskSnapshot[];
  /** User-authored command vault entries (merged over the built-in library). */
  customCommands?: PentestCommand[];
  /** Firm/tester details for generated pentest reports. */
  reportProfile?: ReportProfile;
  /** Password vault — lives only in the encrypted plan, never sent to the renderer. */
  vault?: VaultStore;
  /** User-recorded reference links (advisories, cheat sheets, docs) — saved with the plan. */
  references?: ReferenceLink[];
}

/** ---- reference library ---------------------------------------------- */

export interface ReferenceLink {
  id: string;
  title: string;
  url: string;
  category: string;
  notes?: string;
  createdAt: string;
}

/** ---- daily activity log -------------------------------------------- */

export type LogAction = 'created' | 'status' | 'edited' | 'moved' | 'deleted';

export interface ActivityLogEntry {
  id: string;
  /** ISO timestamp of the action */
  at: string;
  /** local day the action happened (yyyy-mm-dd) */
  date: string;
  taskId: string;
  taskTitle: string;
  action: LogAction;
  /** previous status or previous date */
  from?: string;
  /** new status or new date */
  to?: string;
}

/** ---- password vault ------------------------------------------------- */

export interface VaultEntry {
  id: string;
  label: string;
  username: string;
  password: string;
  url?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VaultStore {
  /** scrypt verifier of the vault secret key (the key itself is never stored) */
  key?: { salt: string; verifier: string };
  /**
   * scrypt verifier of the action password — a second, different password
   * required for every reveal, copy, edit and delete.
   */
  action?: { salt: string; verifier: string };
  entries: VaultEntry[];
}

/** Entry as seen by the renderer — the password is never included. */
export interface VaultEntryView {
  id: string;
  label: string;
  username: string;
  url?: string;
  notes?: string;
  updatedAt: string;
}

export interface VaultUpsert {
  id?: string;
  label: string;
  username: string;
  /** Empty/omitted on edit keeps the stored password */
  password?: string;
  url?: string;
  notes?: string;
}

export interface VaultStatus {
  configured: boolean;
  unlocked: boolean;
  remainingMs: number;
  count: number;
  /** An action password has been created (older vaults need to set one). */
  hasAction: boolean;
}

export type VaultResult =
  | { ok: true }
  | { ok: false; error: string; needsAction?: true };

export type VaultListResult =
  | { ok: true; entries: VaultEntryView[] }
  | { ok: false; error: string };

export type VaultRevealResult =
  | { ok: true; password: string }
  | { ok: false; error: string; needsAction?: true };

/** ---- vulnerability report ---------------------------------------- */

export type RiskFactor = 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';

export type FindingStatus = 'Open' | 'In Progress' | 'Resolved' | 'Accepted' | 'Closed';

export interface Finding {
  id: string;
  risk: RiskFactor;
  /** Host / affected system — one or more IPs or hostnames */
  hosts: string[];
  /** Older records stored a single value here */
  host?: string;
  description: string;
  /** "Risk" column: impact if the finding is exploited */
  riskDetail: string;
  solution: string;
  /** ISO date, yyyy-mm-dd (rendered as dd/mm/yyyy in exports) */
  timeline?: string;
  status: FindingStatus;
  team: string;
  /** Absolute path to a screenshot embedded in the Evidence column */
  evidence?: string;
  /** CVSS 3.1 base score; vector present when entered/edited in the app */
  cvss?: { vector?: string; score: number };
  /** e.g. "CWE-79" */
  cwe?: string;
  /** e.g. "CVE-2021-44228" (scanner import) */
  cve?: string;
  /** Compliance control ids, e.g. ["CIS 7.4", "ISO A.8.8"] */
  controls?: string[];
  /** ISO timestamp when the finding entered the tracker (SLA start) */
  openedAt?: string;
  /** ISO timestamp of the transition into Resolved / Closed / Accepted */
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VulnReport {
  title: string;
  findings: Finding[];
}

/** Managed host / network asset. */
export interface Asset {
  id: string;
  hostname: string;
  ip?: string;
  os?: string;
  owner?: string;
  criticality: RiskFactor;
  notes?: string;
  /** Inventory status from imported sheets (In Use, Listening for Logs, Disabled…). */
  status?: string;
  /** IP range / subnet the asset belongs to. */
  range?: string;
  /** Where the asset was discovered (SIEM, scan, CMDB…). */
  source?: string;
  /** Original row number / id from the source sheet. */
  ref?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EngagementPhase {
  id: string;
  name: string;
  done: boolean;
}

/** Pentest engagement context: scope, rules of engagement, methodology. */
export interface Engagement {
  id: string;
  name: string;
  client: string;
  scopeIn: string;
  scopeOut: string;
  roe: string;
  phases: EngagementPhase[];
  /** ISO timestamp of creation — used to order the engagement list. */
  createdAt?: string;
  /** Report project type — drives the methodology section of the pentest report. */
  projectType?: string;
  /** yyyy-mm-dd testing window (falls back to createdAt / today when empty). */
  startDate?: string;
  endDate?: string;
  /** Free-form markdown narrative rendered in the report's Attack Narrative section. */
  attackNarrative?: string;
}

/** Project types offered by the pentest report template. */
export const PROJECT_TYPES: string[] = [
  'Web Application Penetration Test',
  'Internal Network Penetration Test',
  'External Network Penetration Test',
  'AI/LLM Penetration Test',
  'Azure Penetration Test',
  'AWS Penetration Test',
  'Network Vulnerability Scan'
];

/** Firm/tester details printed on the pentest report cover and summary. */
export interface ReportProfile {
  firmName: string;
  firmWebsite: string;
  testerName: string;
  testerDescription: string;
  summaryOfStrengths: string;
  summaryOfWeaknesses: string;
}

export const EMPTY_REPORT_PROFILE: ReportProfile = {
  firmName: '',
  firmWebsite: '',
  testerName: '',
  testerDescription: '',
  summaryOfStrengths: '',
  summaryOfWeaknesses: ''
};

/** Daily open-findings snapshot used for the risk trend. */
export interface RiskSnapshot {
  /** yyyy-mm-dd */
  date: string;
  open: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface WeeklyPayload {
  weekStart: string;
  weekEnd: string;
  tasks: Task[];
  /** Optional extras for the risk/compliance exec slide. */
  risk?: RiskSnapshot[];
  findings?: Finding[];
}

export interface DailyPayload {
  /** activity day, yyyy-mm-dd */
  date: string;
  tasks: Task[];
  log: ActivityLogEntry[];
}

export interface SaveFileFilter {
  name: string;
  extensions: string[];
}

export interface AuthStatus {
  needsSetup: boolean;
  authenticated: boolean;
  username: string | null;
  hasRecovery: boolean;
}

export type AuthResult =
  | { ok: true; username: string; recoveryKey?: string }
  | { ok: false; error: string };

export type RecoveryResult = { ok: true; key: string } | { ok: false; error: string };

/** AES-256-GCM seal of a 32-byte key */
export interface KeyEnvelope {
  iv: string;
  tag: string;
  ct: string;
}

export interface RecoveryFile {
  /** base64 scrypt salt for the recovery key */
  salt: string;
  /** base64 scrypt verifier of the normalised recovery key */
  verifier: string;
  /** the plan key sealed under the recovery key */
  wrapped: KeyEnvelope;
}

export interface AuthFile {
  version: 1;
  username: string;
  salt: string;
  verifier: string;
  createdAt: string;
  /** the plan key sealed under the password-derived key */
  wrapped?: KeyEnvelope;
  recovery?: RecoveryFile;
}

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
  canceled: 'Canceled'
};

export const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: '#60a5fa',
  in_progress: '#facc15',
  blocked: '#f87171',
  done: '#34d399',
  canceled: '#94a3b8'
};

export const RISK_ORDER: RiskFactor[] = ['Critical', 'High', 'Medium', 'Low', 'Info'];

export const RISK_COLORS: Record<RiskFactor, string> = {
  Critical: '#c00000',
  High: '#ff0000',
  Medium: '#ffb000',
  Low: '#00b050',
  Info: '#808080'
};

export const FINDING_STATUSES: FindingStatus[] = [
  'Open',
  'In Progress',
  'Resolved',
  'Accepted',
  'Closed'
];

export const EMPTY_VULN: VulnReport = { title: '', findings: [] };

/** Every affected system of a finding (supports legacy single-host records). */
export function findingHosts(finding: Finding): string[] {
  if (finding.hosts?.length) return finding.hosts;
  return finding.host ? [finding.host] : [];
}

/** ---- finding SLA ----------------------------------------------------- */

/** Remediation SLA in days per risk factor. */
export const SLA_DAYS: Record<RiskFactor, number> = {
  Critical: 14,
  High: 30,
  Medium: 60,
  Low: 90,
  Info: 90
};

const CLOSED_FINDING_STATUSES: FindingStatus[] = ['Resolved', 'Closed', 'Accepted'];

export function findingIsOpen(finding: Finding): boolean {
  return !CLOSED_FINDING_STATUSES.includes(finding.status);
}

/** Days the finding has been open (frozen at resolvedAt for closed findings). */
export function findingOpenDays(finding: Finding, now: Date = new Date()): number {
  const start = Date.parse(finding.openedAt ?? finding.createdAt);
  if (Number.isNaN(start)) return 0;
  const end = finding.resolvedAt ? Date.parse(finding.resolvedAt) : now.getTime();
  const stop = Number.isNaN(end) ? now.getTime() : end;
  return Math.max(0, Math.floor((stop - start) / 86_400_000));
}

/** True when an open finding has exceeded its remediation SLA. */
export function findingBreached(finding: Finding, now: Date = new Date()): boolean {
  if (!findingIsOpen(finding)) return false;
  return findingOpenDays(finding, now) > SLA_DAYS[finding.risk];
}

export const STATUS_ORDER: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done', 'canceled'];

/**
 * Applies a status change, stamping completion / cancellation times and
 * clearing the stale ones when a task is reopened.
 */
export function withStatus(task: Task, status: TaskStatus, nowIso: string): Task {
  const next: Task = { ...task, status, updatedAt: nowIso };
  if (status === 'done') {
    next.completedAt = task.completedAt ?? nowIso;
    delete next.canceledAt;
  } else if (status === 'canceled') {
    next.canceledAt = task.canceledAt ?? nowIso;
    delete next.completedAt;
  } else {
    delete next.completedAt;
    delete next.canceledAt;
  }
  return next;
}

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const DAY_NAMES_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
