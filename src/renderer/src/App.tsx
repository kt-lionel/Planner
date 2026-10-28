import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SaveResult } from '@shared/api';
import type {
  ActivityLogEntry,
  Asset,
  Engagement,
  Finding,
  PlanData,
  ReportProfile,
  ReferenceLink,
  RiskSnapshot,
  Task,
  TaskStatus,
  VulnReport
} from '@shared/types';
import {
  EMPTY_REPORT_PROFILE,
  EMPTY_VULN,
  findingHosts,
  findingIsOpen,
  STATUS_LABELS,
  withStatus
} from '@shared/types';
import { parseScanCsv } from '@shared/scan';
import { rowToAsset } from '@shared/asset';
import type { PentestCommand } from '@shared/commands';
import { DEFAULT_REFERENCES } from '@shared/references';
import { addDays, formatWeekRange, isoDate, startOfWeek } from '@shared/date';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import StatsBar from './components/StatsBar';
import WeekBoard from './components/WeekBoard';
import TaskModal from './components/TaskModal';
import StatusModal from './components/StatusModal';
import VulnView from './components/VulnView';
import FindingModal from './components/FindingModal';
import LoginScreen from './components/LoginScreen';
import Dashboard from './components/Dashboard';
import VaultView from './components/VaultView';
import ActivityLogView from './components/ActivityLogView';
import AssetsView from './components/AssetsView';
import ToolboxView from './components/ToolboxView';
import CommandsView from './components/CommandsView';
import ReferencesView from './components/ReferencesView';
import CommandPalette from './components/CommandPalette';
import EngagementView, { DEFAULT_ENGAGEMENT } from './components/EngagementView';
import ReportsView from './components/ReportsView';
import { newId, toCsv } from './lib/format';

type Toast = { kind: 'info' | 'error'; text: string };
type Phase = 'boot' | 'auth' | 'ready';
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

interface ModalState {
  task: Task | null;
  date: string;
}

const USERNAME_KEY = 'planner.username';

/** Older plans stored a single engagement — migrate it into the list. */
function migrateEngagements(plan: PlanData): Engagement[] {
  if (plan.engagements?.length) return plan.engagements;
  if (plan.engagement) {
    const legacy: Engagement = { ...plan.engagement };
    if (!legacy.id) legacy.id = newId();
    return [legacy];
  }
  return [];
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('boot');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [user, setUser] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [log, setLog] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [saving, setSaving] = useState(false);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [query, setQuery] = useState('');
  const [assignee, setAssignee] = useState('all');
  const [status, setStatus] = useState<'all' | TaskStatus>('all');
  const [modal, setModal] = useState<ModalState | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [view, setView] = useState<View>('dashboard');
  const [cmdOpen, setCmdOpen] = useState(false);
  const [vuln, setVuln] = useState<VulnReport>(EMPTY_VULN);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [activeEngagementId, setActiveEngagementId] = useState<string | null>(null);
  const [risk, setRisk] = useState<RiskSnapshot[]>([]);
  const [customCommands, setCustomCommands] = useState<PentestCommand[]>([]);
  const [cmdDomain, setCmdDomain] = useState('All');
  const [references, setReferences] = useState<ReferenceLink[]>([]);
  const [reportProfile, setReportProfile] = useState<ReportProfile>(EMPTY_REPORT_PROFILE);
  const [findingModal, setFindingModal] = useState<{ finding: Finding | null } | null>(null);
  const [hasRecovery, setHasRecovery] = useState(false);
  const [keyDialog, setKeyDialog] = useState<
    | { mode: 'key'; key: string }
    | { mode: 'exists' }
    | { mode: 'error'; error: string }
    | null
  >(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [statusModal, setStatusModal] = useState<Task | null>(null);

  const toastTimer = useRef<number | undefined>(undefined);
  const saveTimer = useRef<number | undefined>(undefined);

  const showToast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    window.clearTimeout(toastTimer.current);
    setToast({ text, kind });
    toastTimer.current = window.setTimeout(() => setToast(null), 3800);
  }, []);

  // ---- session bootstrap --------------------------------------------
  useEffect(() => {
    window.planner
      .authStatus()
      .then((status) => {
        if (status.authenticated) {
          setUser(status.username);
          setHasRecovery(status.hasRecovery);
          setPhase('ready');
        } else {
          setNeedsSetup(status.needsSetup);
          setPhase('auth');
        }
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : String(err));
        setNeedsSetup(true);
        setPhase('auth');
      });
  }, []);

  // ---- plan loading ---------------------------------------------------
  useEffect(() => {
    if (phase !== 'ready') return;
    let cancelled = false;
    setLoading(true);
    window.planner
      .loadPlan()
      .then((plan) => {
        if (!cancelled) {
          setTasks(plan.tasks);
          setVuln(plan.vuln ?? EMPTY_VULN);
          setLog(plan.log ?? []);
          setAssets(plan.assets ?? []);
          const loadedEngagements = migrateEngagements(plan);
          setEngagements(loadedEngagements);
          setActiveEngagementId(null);
          setRisk(plan.risk ?? []);
          setCustomCommands(plan.customCommands ?? []);
          setReferences(plan.references ?? DEFAULT_REFERENCES);
          setReportProfile({ ...EMPTY_REPORT_PROFILE, ...(plan.reportProfile ?? {}) });
          setLoaded(true);
          setLoadError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [phase, reloadTick]);

  // ---- persistence ----------------------------------------------------
  useEffect(() => {
    if (phase !== 'ready' || !loaded || loadError) return;
    window.clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = window.setTimeout(() => {
      window.planner
        .savePlan({
          version: 1,
          tasks,
          vuln,
          log,
          assets,
          engagements,
          risk,
          customCommands,
          references,
          reportProfile
        })
        .catch((err: unknown) =>
          showToast(`Save failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
        )
        .finally(() => setSaving(false));
    }, 350);
    return () => window.clearTimeout(saveTimer.current);
  }, [
    tasks,
    vuln,
    log,
    assets,
    engagements,
    risk,
    customCommands,
    references,
    reportProfile,
    phase,
    loaded,
    loadError,
    showToast
  ]);

  // Keep one risk-trend snapshot per day (open findings by severity).
  useEffect(() => {
    if (!loaded) return;
    const today = isoDate(new Date());
    const open = vuln.findings.filter((f) => findingIsOpen(f));
    const next: RiskSnapshot = {
      date: today,
      open: open.length,
      critical: open.filter((f) => f.risk === 'Critical').length,
      high: open.filter((f) => f.risk === 'High').length,
      medium: open.filter((f) => f.risk === 'Medium').length,
      low: open.filter((f) => f.risk === 'Low').length,
      info: open.filter((f) => f.risk === 'Info').length
    };
    setRisk((prev) => {
      const existing = prev.find((s) => s.date === today);
      const same =
        existing &&
        existing.open === next.open &&
        existing.critical === next.critical &&
        existing.high === next.high &&
        existing.medium === next.medium &&
        existing.low === next.low &&
        existing.info === next.info;
      if (same) return prev;
      return [...prev.filter((s) => s.date !== today), next]
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-180);
    });
  }, [vuln.findings, loaded]);

  // ---- derived --------------------------------------------------------
  const weekStartIso = isoDate(weekStart);
  const weekEndIso = isoDate(addDays(weekStart, 6));
  const weekLabel = formatWeekRange(weekStart);
  const activeEngagement = engagements.find((e) => e.id === activeEngagementId) ?? null;

  const people = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) if (t.assignee) set.add(t.assignee);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [tasks]);

  const weekTasks = useMemo(
    () => tasks.filter((t) => t.date >= weekStartIso && t.date <= weekEndIso),
    [tasks, weekStartIso, weekEndIso]
  );

  const visibleTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return weekTasks.filter((t) => {
      if (assignee !== 'all' && t.assignee !== assignee) return false;
      if (status !== 'all' && t.status !== status) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        (t.assignee ?? '').toLowerCase().includes(q) ||
        (t.notes ?? '').toLowerCase().includes(q)
      );
    });
  }, [weekTasks, query, assignee, status]);

  const days: Task[][] = useMemo(() => {
    const buckets: Task[][] = Array.from({ length: 7 }, () => []);
    for (const task of visibleTasks) {
      const [y, m, d] = task.date.split('-').map(Number);
      const day = new Date(y, m - 1, d).getDay();
      buckets[day === 0 ? 6 : day - 1].push(task);
    }
    const order = (a: Task, b: Task): number => {
      const timeA = a.time ?? '99:99';
      const timeB = b.time ?? '99:99';
      if (timeA !== timeB) return timeA.localeCompare(timeB);
      return a.title.localeCompare(b.title);
    };
    for (const bucket of buckets) bucket.sort(order);
    return buckets;
  }, [visibleTasks]);

  // ---- auth actions ---------------------------------------------------
  const handleAuthenticated = useCallback((username: string) => {
    setUser(username);
    setLoadError(null);
    setPhase('ready');
    void window.planner
      .authStatus()
      .then((s) => setHasRecovery(s.hasRecovery))
      .catch(() => undefined);
  }, []);

  const lock = useCallback(() => {
    void (async () => {
      try {
        await window.planner.authLogout();
        const status = await window.planner.authStatus();
        setNeedsSetup(status.needsSetup);
        setHasRecovery(status.hasRecovery);
      } catch {
        /* keep the previous auth mode */
      }
      setPhase('auth');
      setTasks([]);
      setLog([]);
      setVuln(EMPTY_VULN);
      setAssets([]);
      setEngagements([]);
      setActiveEngagementId(null);
      setRisk([]);
      setCustomCommands([]);
      setReportProfile(EMPTY_REPORT_PROFILE);
      setView('dashboard');
      setFindingModal(null);
      setLoaded(false);
      setLoading(false);
      setLoadError(null);
      setModal(null);
      setQuery('');
      setAssignee('all');
      setStatus('all');
    })();
  }, []);

  const rememberUsername = useCallback((name: string) => {
    try {
      localStorage.setItem(USERNAME_KEY, name);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const requestRecoveryKey = useCallback(async () => {
    setKeyCopied(false);
    try {
      const authState = await window.planner.authStatus();
      setHasRecovery(authState.hasRecovery);
      if (authState.hasRecovery) {
        setKeyDialog({ mode: 'exists' });
        return;
      }
      const result = await window.planner.authCreateRecoveryKey();
      if (result.ok) {
        setHasRecovery(true);
        setKeyDialog({ mode: 'key', key: result.key });
      } else {
        setKeyDialog({ mode: 'error', error: result.error });
      }
    } catch (err) {
      setKeyDialog({ mode: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  const rotateRecoveryKey = useCallback(async () => {
    setKeyCopied(false);
    try {
      const result = await window.planner.authRotateRecoveryKey();
      if (result.ok) {
        setHasRecovery(true);
        setKeyDialog({ mode: 'key', key: result.key });
        showToast('New recovery key generated — the old one no longer works');
      } else {
        setKeyDialog({ mode: 'error', error: result.error });
      }
    } catch (err) {
      setKeyDialog({ mode: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  }, [showToast]);

  const copyDialogKey = useCallback(async () => {
    await window.planner.copyText(keyDialog?.mode === 'key' ? keyDialog.key : '');
    setKeyCopied(true);
  }, [keyDialog]);

  const lastUsername = useMemo(() => {
    try {
      return localStorage.getItem(USERNAME_KEY) ?? '';
    } catch {
      return '';
    }
  }, []);

  // ---- task actions ---------------------------------------------------
  const pushLog = useCallback(
    (entry: {
      taskId: string;
      taskTitle: string;
      action: ActivityLogEntry['action'];
      from?: string;
      to?: string;
    }) => {
      const now = new Date();
      setLog((prev) => {
        const next: ActivityLogEntry[] = [
          ...prev,
          {
            id: `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            at: now.toISOString(),
            date: isoDate(now),
            ...entry
          }
        ];
        return next.length > 2000 ? next.slice(next.length - 2000) : next;
      });
    },
    []
  );

  const upsertTask = useCallback(
    (task: Task) => {
      const old = tasks.find((t) => t.id === task.id);
      setTasks((prev) => {
        const exists = prev.some((t) => t.id === task.id);
        return exists ? prev.map((t) => (t.id === task.id ? task : t)) : [...prev, task];
      });
      if (!old) {
        pushLog({ taskId: task.id, taskTitle: task.title, action: 'created' });
      } else {
        if (old.status !== task.status) {
          pushLog({
            taskId: task.id,
            taskTitle: task.title,
            action: 'status',
            from: old.status,
            to: task.status
          });
        }
        if (old.date !== task.date) {
          pushLog({
            taskId: task.id,
            taskTitle: task.title,
            action: 'moved',
            from: old.date,
            to: task.date
          });
        }
        if (
          old.title !== task.title ||
          old.notes !== task.notes ||
          old.time !== task.time ||
          old.assignee !== task.assignee ||
          old.dueDate !== task.dueDate ||
          old.recurrence !== task.recurrence
        ) {
          pushLog({ taskId: task.id, taskTitle: task.title, action: 'edited' });
        }
      }
      setModal(null);
      showToast(`Saved "${task.title}"`);
    },
    [tasks, pushLog, showToast]
  );

  const deleteTask = useCallback(
    (task: Task) => {
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      pushLog({ taskId: task.id, taskTitle: task.title, action: 'deleted' });
      setModal(null);
      showToast(`Deleted "${task.title}"`);
    },
    [pushLog, showToast]
  );

  const moveTask = useCallback(
    (id: string, date: string) => {
      const old = tasks.find((t) => t.id === id);
      setTasks((prev) =>
        prev.map((t) =>
          t.id === id && t.date !== date ? { ...t, date, updatedAt: new Date().toISOString() } : t
        )
      );
      if (old && old.date !== date) {
        pushLog({
          taskId: old.id,
          taskTitle: old.title,
          action: 'moved',
          from: old.date,
          to: date
        });
      }
    },
    [tasks, pushLog]
  );

  const setStatusOf = useCallback((task: Task, status: TaskStatus) => {
    const nowIso = new Date().toISOString();
    setTasks((prev) => prev.map((t) => (t.id === task.id ? withStatus(t, status, nowIso) : t)));
  }, []);

  const submitStatusChange = useCallback(
    (task: Task, next: TaskStatus) => {
      setStatusOf(task, next);
      if (task.status !== next) {
        pushLog({
          taskId: task.id,
          taskTitle: task.title,
          action: 'status',
          from: task.status,
          to: next
        });
      }
      setStatusModal(null);
      showToast(`"${task.title}" → ${STATUS_LABELS[next]}`);
    },
    [setStatusOf, pushLog, showToast]
  );

  const quickAddToday = useCallback(
    (title: string) => {
      const nowIso = new Date().toISOString();
      const task: Task = {
        id: newId(),
        title,
        assignee: user ?? 'User',
        date: isoDate(new Date()),
        status: 'todo',
        recurrence: 'none',
        createdAt: nowIso,
        updatedAt: nowIso
      };
      setTasks((prev) => [...prev, task]);
      pushLog({ taskId: task.id, taskTitle: title, action: 'created' });
      showToast(`Added "${title}" to today`);
    },
    [user, pushLog, showToast]
  );

  // ---- vulnerability report -----------------------------------------
  const setReportTitle = useCallback((title: string) => {
    setVuln((prev) => ({ ...prev, title }));
  }, []);

  const upsertFinding = useCallback(
    (finding: Finding) => {
      setVuln((prev) => {
        const exists = prev.findings.some((f) => f.id === finding.id);
        const findings = exists
          ? prev.findings.map((f) => (f.id === finding.id ? finding : f))
          : [...prev.findings, finding];
        return { ...prev, findings };
      });
      setFindingModal(null);
      showToast(`Saved finding on ${findingHosts(finding).join(', ')}`);
    },
    [showToast]
  );

  const deleteFinding = useCallback(
    (finding: Finding) => {
      setVuln((prev) => ({ ...prev, findings: prev.findings.filter((f) => f.id !== finding.id) }));
      setFindingModal(null);
      showToast(`Deleted finding on ${findingHosts(finding).join(', ')}`);
    },
    [showToast]
  );

  // ---- asset registry -------------------------------------------------
  const saveAsset = useCallback(
    (asset: Asset) => {
      setAssets((prev) => {
        const exists = prev.some((a) => a.id === asset.id);
        return exists ? prev.map((a) => (a.id === asset.id ? asset : a)) : [...prev, asset];
      });
      showToast(`Saved asset "${asset.hostname}"`);
    },
    [showToast]
  );

  const deleteAsset = useCallback(
    (asset: Asset) => {
      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
      showToast(`Removed asset "${asset.hostname}"`);
    },
    [showToast]
  );

  // ---- asset sheet import (Excel / CSV / TSV) --------------------------
  const importAssets = useCallback(async () => {
    const file = await window.planner.openAssetSheet();
    if (!file) return;
    if (!file.rows.length) {
      showToast('No asset rows found — expected hostname / IP columns.', 'error');
      return;
    }
    const nowIso = new Date().toISOString();
    const taken = new Set<string>();
    for (const a of assets) {
      taken.add(a.hostname.toLowerCase());
      if (a.ip) taken.add(a.ip.toLowerCase());
    }
    const fresh: Asset[] = [];
    let skipped = 0;
    for (const row of file.rows) {
      const keys = [row.hostname.toLowerCase(), row.ip?.toLowerCase() ?? ''].filter(
        (k) => k !== ''
      );
      if (keys.some((k) => taken.has(k))) {
        skipped += 1;
        continue;
      }
      keys.forEach((k) => taken.add(k));
      fresh.push(rowToAsset(row, newId(), nowIso));
    }
    if (fresh.length) setAssets((prev) => [...prev, ...fresh]);
    showToast(
      `Imported ${fresh.length} asset(s) from ${file.name}` +
        (skipped ? ` · ${skipped} duplicate(s) skipped` : '')
    );
  }, [assets, showToast]);

  // ---- scanner import -------------------------------------------------
  const importScan = useCallback(async () => {
    const file = await window.planner.openScanCsv();
    if (!file) return;
    const rows = parseScanCsv(file.text);
    if (!rows.length) {
      showToast('No recognisable findings in that file (expected Nessus/CSV columns).', 'error');
      return;
    }
    const nowIso = new Date().toISOString();
    const keyOf = (host: string, cve: string, name: string): string =>
      `${host.toLowerCase()}|${cve.toLowerCase()}|${name.toLowerCase()}`;
    const existing = new Set(
      vuln.findings.map((f) =>
        keyOf(findingHosts(f).join(','), f.cve ?? '', f.description.split('\n')[0])
      )
    );
    const fresh: Finding[] = [];
    let skipped = 0;
    for (const row of rows) {
      const key = keyOf(row.host, row.cve ?? '', row.name);
      if (existing.has(key)) {
        skipped += 1;
        continue;
      }
      existing.add(key);
      fresh.push({
        id: newId(),
        risk: row.risk,
        hosts: [row.host],
        description: row.cve ? `${row.name}\n${row.cve}` : row.name,
        riskDetail: row.synopsis ?? '',
        solution: row.solution ?? '',
        status: 'Open',
        team: '',
        cve: row.cve,
        cvss: row.cvss !== undefined ? { score: row.cvss } : undefined,
        openedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso
      });
    }
    if (fresh.length) {
      setVuln((prev) => ({ ...prev, findings: [...prev.findings, ...fresh] }));
      showToast(
        `Imported ${fresh.length} finding(s) from ${file.name}` +
          (skipped ? ` · ${skipped} duplicate(s) skipped` : '')
      );
    } else {
      showToast(`All ${skipped} finding(s) already present.`, 'info');
    }
  }, [vuln, showToast]);

  // ---- engagement → tasks ---------------------------------------------
  const generateEngagementTasks = useCallback(
    (phaseNames: string[]) => {
      if (!phaseNames.length) return;
      const nowIso = new Date().toISOString();
      const monday = startOfWeek(new Date());
      const engName = activeEngagement?.name ?? '';
      const created: Task[] = phaseNames.map((name, i) => ({
        id: newId(),
        title: `[Eng] ${name}`,
        assignee: user ?? 'User',
        date: isoDate(addDays(monday, Math.min(i, 6))),
        status: 'todo',
        recurrence: 'none',
        notes: engName ? `Engagement: ${engName}` : undefined,
        createdAt: nowIso,
        updatedAt: nowIso
      }));
      setTasks((prev) => [...prev, ...created]);
      for (const task of created) {
        pushLog({ taskId: task.id, taskTitle: task.title, action: 'created' });
      }
      showToast(`Created ${created.length} task(s) from the methodology checklist`);
    },
    [user, activeEngagement?.name, pushLog, showToast]
  );

  // ---- engagement registry -------------------------------------------
  const updateEngagement = useCallback((next: Engagement) => {
    setEngagements((prev) => prev.map((e) => (e.id === next.id ? next : e)));
  }, []);

  const createEngagement = useCallback(() => {
    const eng: Engagement = {
      id: newId(),
      name: '',
      client: '',
      scopeIn: '',
      scopeOut: '',
      roe: '',
      phases: DEFAULT_ENGAGEMENT.phases.map((p) => ({ ...p, id: newId(), done: false })),
      createdAt: new Date().toISOString()
    };
    setEngagements((prev) => [eng, ...prev]);
    setActiveEngagementId(eng.id);
    showToast('Engagement created — fill in the scope and rules of engagement');
  }, [showToast]);

  const deleteEngagement = useCallback(
    (id: string) => {
      setEngagements((prev) => {
        const next = prev.filter((e) => e.id !== id);
        setActiveEngagementId((current) =>
          current === id ? next[0]?.id ?? null : current
        );
        return next;
      });
      showToast('Engagement deleted');
    },
    [showToast]
  );

  // ---- shortcuts ------------------------------------------------------
  const openNewTask = useCallback(
    (date?: string) => {
      const todayIso = isoDate(new Date());
      const fallback =
        todayIso >= weekStartIso && todayIso <= weekEndIso ? todayIso : weekStartIso;
      setModal({ task: null, date: date ?? fallback });
    },
    [weekStartIso, weekEndIso]
  );

  useEffect(() => {
    if (phase !== 'ready') return;
    const onKey = (e: KeyboardEvent): void => {
      if (view !== 'board') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        openNewTask();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [phase, view, openNewTask]);

  // ---- command vault palette: Ctrl+K anywhere, Esc to close ------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
        return;
      }
      if (e.key === 'Escape' && cmdOpen) setCmdOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [cmdOpen]);

  // ---- import / export ------------------------------------------------
  const handleResult = useCallback(
    (result: SaveResult, success: (path: string) => void) => {
      if (!result) return;
      if (result.ok) success(result.path);
      else showToast(result.error, 'error');
    },
    [showToast]
  );

  const exportAssets = useCallback(async () => {
    handleResult(await window.planner.exportAssetSheet(assets), (path) =>
      showToast(`Exported ${assets.length} asset(s) to ${path}`)
    );
  }, [assets, handleResult, showToast]);

  const exportCsv = useCallback(async () => {
    const content = toCsv(visibleTasks, weekLabel);
    handleResult(
      await window.planner.saveTextFile(`weekly-plan_${weekStartIso}.csv`, content, [
        { name: 'CSV', extensions: ['csv'] }
      ]),
      (path) => showToast(`Exported CSV to ${path}`)
    );
  }, [visibleTasks, weekLabel, weekStartIso, handleResult, showToast]);

  const exportJson = useCallback(async () => {
    const content = JSON.stringify(
      { version: 1, tasks, vuln, log, assets, engagements, risk, customCommands, references, reportProfile },
      null,
      2
    );
    handleResult(
      await window.planner.saveTextFile(`anzika-backup_${weekStartIso}.json`, content, [
        { name: 'JSON', extensions: ['json'] }
      ]),
      (path) => showToast(`Backup written to ${path}`)
    );
  }, [
    tasks,
    weekStartIso,
    vuln,
    log,
    assets,
    engagements,
    risk,
    customCommands,
    references,
    reportProfile,
    handleResult,
    showToast
  ]);

  const exportWeekly = useCallback(async () => {
    handleResult(
      await window.planner.exportWeekly({
        weekStart: weekStartIso,
        weekEnd: weekEndIso,
        tasks,
        risk,
        findings: vuln.findings
      }),
      (path) => showToast(`Weekly report saved to ${path}`)
    );
  }, [weekStartIso, weekEndIso, tasks, risk, vuln.findings, handleResult, showToast]);

  const exportPptx = useCallback(async () => {
    handleResult(
      await window.planner.exportWeeklyPptx({
        weekStart: weekStartIso,
        weekEnd: weekEndIso,
        tasks,
        risk,
        findings: vuln.findings
      }),
      (path) => showToast(`PowerPoint report saved to ${path}`)
    );
  }, [weekStartIso, weekEndIso, tasks, risk, vuln.findings, handleResult, showToast]);

  const exportDay = useCallback(
    async (date: string, format: 'xlsx' | 'pptx') => {
      handleResult(
        await window.planner.exportDaily({ date, tasks, log }, format),
        (path) => showToast(`Day activity report saved to ${path}`)
      );
    },
    [tasks, log, handleResult, showToast]
  );

  const exportVuln = useCallback(async () => {
    handleResult(await window.planner.exportVulnReport(vuln), (path) =>
      showToast(`Vulnerability report saved to ${path}`)
    );
  }, [vuln, handleResult, showToast]);

  const exportScope = useCallback(
    async (engagement: Engagement, format: 'xlsx' | 'pdf') => {
      handleResult(await window.planner.exportEngagement({ engagement, format }), (path) =>
        showToast(`Scope report saved to ${path}`)
      );
    },
    [handleResult, showToast]
  );

  const exportPentest = useCallback(
    async (engagement: Engagement, format: 'pdf' | 'html') => {
      handleResult(
        await window.planner.exportPentestReport({
          engagement,
          profile: reportProfile,
          findings: vuln.findings,
          format
        }),
        (path) => showToast(`Pentest report saved to ${path}`)
      );
    },
    [reportProfile, vuln.findings, handleResult, showToast]
  );

  const addCustomCommand = useCallback(
    (cmd: Omit<PentestCommand, 'id'>) => {
      setCustomCommands((prev) => [{ ...cmd, id: `custom-${newId()}` }, ...prev]);
      showToast(`Added “${cmd.title}” to your commands`);
    },
    [showToast]
  );

  const deleteCustomCommand = useCallback(
    (id: string) => {
      setCustomCommands((prev) => prev.filter((c) => c.id !== id));
      showToast('Command removed');
    },
    [showToast]
  );

  const addReference = useCallback(
    (ref: Omit<ReferenceLink, 'id' | 'createdAt'>) => {
      setReferences((prev) => [
        { ...ref, id: `ref-${newId()}`, createdAt: new Date().toISOString() },
        ...prev
      ]);
      showToast(`Recorded “${ref.title}” in your references`);
    },
    [showToast]
  );

  const deleteReference = useCallback(
    (id: string) => {
      setReferences((prev) => prev.filter((r) => r.id !== id));
      showToast('Reference removed');
    },
    [showToast]
  );

  const openReference = useCallback((url: string) => {
    void window.planner.openExternal(url);
  }, []);

  const importJson = useCallback(async () => {
    const result = await window.planner.openJsonFile();
    if (!result) return;
    if (!result.ok) {
      showToast(result.error, 'error');
      return;
    }
    const count = result.plan.tasks.length;
    if (!window.confirm(`Import ${count} task(s)? This replaces the current plan.`)) return;
    setTasks(result.plan.tasks);
    setVuln(result.plan.vuln ?? EMPTY_VULN);
    setLog(result.plan.log ?? []);
    setAssets(result.plan.assets ?? []);
    const importedEngagements = migrateEngagements(result.plan);
    setEngagements(importedEngagements);
    setActiveEngagementId(importedEngagements[0]?.id ?? null);
    setRisk(result.plan.risk ?? []);
    setCustomCommands(result.plan.customCommands ?? []);
    setReferences(result.plan.references ?? DEFAULT_REFERENCES);
    setReportProfile({ ...EMPTY_REPORT_PROFILE, ...(result.plan.reportProfile ?? {}) });
    showToast(`Imported ${count} task(s)`);
  }, [showToast]);

  // ---- render ---------------------------------------------------------
  if (phase === 'boot') {
    return (
      <div className="app">
        <div className="center-state">
          <div className="spinner" />
          Starting ANZIKA…
        </div>
      </div>
    );
  }

  if (phase === 'auth') {
    return (
      <div className="app">
        <LoginScreen
          needsSetup={needsSetup}
          lastUsername={lastUsername}
          onRemember={rememberUsername}
          onAuthenticated={handleAuthenticated}
          onCmdVault={() => setCmdOpen(true)}
        />
        {cmdOpen && <CommandPalette customCommands={customCommands} onClose={() => setCmdOpen(false)} />}
        {loadError && <div className="toast error">{loadError}</div>}
      </div>
    );
  }

  if (loadError && !loading) {
    return (
      <div className="app">
        <div className="center-state">
          Could not unlock the plan: {loadError}
          <div className="row-actions">
            <button className="btn btn-yellow" onClick={() => setReloadTick((v) => v + 1)}>
              Retry
            </button>
            <button className="btn" onClick={lock}>
              Lock
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="app">
        <div className="center-state">
          <div className="spinner" />
          Decrypting your plan…
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="shell">
        <Sidebar
          view={view}
          onView={setView}
          cmdDomain={cmdDomain}
          onCmdDomain={setCmdDomain}
          user={user ?? 'User'}
          hasRecovery={hasRecovery}
          onLock={lock}
          onRecoveryKey={() => void requestRecoveryKey()}
        />

        <div className="main-col">
          <TopBar
            view={view}
            weekStart={weekStart}
            onPrev={() => setWeekStart((d) => addDays(d, -7))}
            onNext={() => setWeekStart((d) => addDays(d, 7))}
            onToday={() => setWeekStart(startOfWeek(new Date()))}
            query={query}
            onQuery={setQuery}
            assignee={assignee}
            onAssignee={setAssignee}
            people={people}
            status={status}
            onStatus={setStatus}
            taskCount={visibleTasks.length}
            onAdd={() => openNewTask()}
            onReports={() => setView('reports')}
            onCmdVault={() => setCmdOpen(true)}
            saving={saving}
          />

          {view === 'dashboard' ? (
            <Dashboard
              tasks={tasks}
              weekTasks={weekTasks}
              weekLabel={weekLabel}
              vuln={vuln}
              risk={risk}
              onStatusChange={(task) => setStatusModal(task)}
              onOpenTask={(task) => setModal({ task, date: task.date })}
              onQuickAdd={quickAddToday}
            />
          ) : view === 'board' ? (
            <>
              <StatsBar tasks={weekTasks} weekLabel={weekLabel} />
              <WeekBoard
                weekStart={weekStart}
                days={days}
                onAddTask={(date) => setModal({ task: null, date })}
                onOpenTask={(task) => setModal({ task, date: task.date })}
                onMoveTask={moveTask}
                onChangeStatus={(task) => setStatusModal(task)}
              />
            </>
          ) : view === 'log' ? (
            <ActivityLogView log={log} tasks={tasks} />
          ) : view === 'assets' ? (
            <AssetsView
              assets={assets}
              findings={vuln.findings}
              onSave={saveAsset}
              onDelete={deleteAsset}
              onExport={() => void exportAssets()}
              onImport={() => void importAssets()}
            />
          ) : view === 'engage' ? (
            <EngagementView
              engagements={engagements}
              activeId={activeEngagementId}
              onSelect={setActiveEngagementId}
              onDeselect={() => setActiveEngagementId(null)}
              onCreate={createEngagement}
              onDelete={deleteEngagement}
              onChange={updateEngagement}
              onGenerateTasks={generateEngagementTasks}
            />
          ) : view === 'toolbox' ? (
            <ToolboxView />
          ) : view === 'commands' ? (
            <CommandsView
              customCommands={customCommands}
              domain={cmdDomain}
              onAdd={addCustomCommand}
              onDelete={deleteCustomCommand}
            />
          ) : view === 'references' ? (
            <ReferencesView
              references={references}
              onAdd={addReference}
              onDelete={deleteReference}
              onOpen={openReference}
            />
          ) : view === 'reports' ? (
            <ReportsView
              weekLabel={weekLabel}
              findingsCount={vuln.findings.length}
              engagements={engagements}
              exporting={saving}
              onExportWeekly={exportWeekly}
              onExportPptx={exportPptx}
              onExportDay={(date, format) => void exportDay(date, format)}
              onExportScope={(eng, format) => void exportScope(eng, format)}
              onExportPentest={(eng, format) => void exportPentest(eng, format)}
              onExportVuln={() => void exportVuln()}
              onExportCsv={exportCsv}
              onExportJson={() => void exportJson()}
              onImport={() => void importJson()}
            />
          ) : view === 'vault' ? (
            <VaultView />
          ) : (
            <VulnView
              report={vuln}
              onTitle={setReportTitle}
              onAdd={() => setFindingModal({ finding: null })}
              onOpen={(finding) => setFindingModal({ finding })}
              onImportScan={() => void importScan()}
            />
          )}

          {cmdOpen && (
            <CommandPalette customCommands={customCommands} onClose={() => setCmdOpen(false)} />
          )}

          {modal && (
            <TaskModal
              key={modal.task?.id ?? `new-${modal.date}`}
              initial={modal.task}
              defaultDate={modal.date}
              owner={user ?? 'User'}
              onSave={upsertTask}
              onDelete={deleteTask}
              onClose={() => setModal(null)}
            />
          )}

          {statusModal && (
            <StatusModal
              key={statusModal.id}
              task={statusModal}
              onSubmit={(next) => submitStatusChange(statusModal, next)}
              onClose={() => setStatusModal(null)}
            />
          )}

          {findingModal && (
            <FindingModal
              key={findingModal.finding?.id ?? 'new-finding'}
              initial={findingModal.finding}
              onSave={upsertFinding}
              onDelete={deleteFinding}
              onClose={() => setFindingModal(null)}
            />
          )}

          {keyDialog && (
            <div className="overlay" onMouseDown={() => setKeyDialog(null)}>
              <div className="modal" role="dialog" aria-modal="true" aria-label="Recovery key">
                <div className="modal-head">
                  <h2>
                    {keyDialog.mode === 'exists'
                      ? 'Recovery key on file'
                      : keyDialog.mode === 'key'
                        ? 'Save your recovery key'
                        : 'Recovery key'}
                  </h2>
                  <button
                    className="btn btn-ghost btn-icon"
                    onClick={() => setKeyDialog(null)}
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>
                <div className="modal-body">
                  {keyDialog.mode === 'key' && (
                    <>
                      <p className="muted">
                        Copy this key and store it somewhere safe — a password manager or a printed
                        copy. It is the only way to reset your password without losing data, and it
                        is shown only once.
                      </p>
                      <code className="recovery-key-box" id="recovery-key-display">
                        {keyDialog.key}
                      </code>
                      <div className="key-actions">
                        <button className="btn" onClick={() => void copyDialogKey()}>
                          {keyCopied ? 'Copied ✓' : 'Copy key'}
                        </button>
                      </div>
                    </>
                  )}

                  {keyDialog.mode === 'exists' && (
                    <div className="key-exists">
                      <p className="muted">
                        A recovery key was created for this profile earlier. It is displayed only
                        once, so it cannot be shown again — use the copy you saved.
                      </p>
                      <p className="muted">
                        Lost it? Generate a new key below. <b>The old key stops working</b> as soon
                        as the new one is created. Your tasks and password are not affected.
                      </p>
                      <div className="key-actions">
                        <button className="btn btn-warn" id="rotate-recovery-key" onClick={() => void rotateRecoveryKey()}>
                          Generate a new key
                        </button>
                      </div>
                    </div>
                  )}

                  {keyDialog.mode === 'error' && (
                    <div className="form-error">{keyDialog.error}</div>
                  )}
                </div>
                <div className="modal-foot">
                  <button className="btn btn-yellow" onClick={() => setKeyDialog(null)}>
                    {keyDialog.mode === 'key' ? 'Done' : 'Close'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {toast && (
            <div className={`toast${toast.kind === 'error' ? ' error' : ''}`}>{toast.text}</div>
          )}
        </div>
      </div>
    </div>
  );
}
