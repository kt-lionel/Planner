import { app, BrowserWindow, clipboard, dialog, ipcMain } from 'electron';
import { createHash } from 'crypto';
import { access, mkdir, readFile, rm, writeFile } from 'fs/promises';
import { Workbook } from 'exceljs';
import { tmpdir } from 'os';
import { basename, dirname, extname, join } from 'path';
import type { ImportResult, SaveResult } from '../shared/api';
import type {
  Asset,
  AuthResult,
  AuthStatus,
  DailyPayload,
  Engagement,
  Finding,
  PlanData,
  RecoveryResult,
  ReportProfile,
  SaveFileFilter,
  Task,
  VulnReport,
  WeeklyPayload
} from '../shared/types';
import { withStatus, findingBreached, findingIsOpen, findingOpenDays } from '../shared/types';
import { cvssBaseScore, cvssSeverity } from '../shared/cvss';
import { parseScanCsv } from '../shared/scan';
import { parseAssetRows, parseAssetSheet } from '../shared/asset';
import { COMMANDS, searchCommands } from '../shared/commands';
import type { PentestCommand } from '../shared/commands';
import type { AssetSheetRow } from '../shared/asset';
import {
  authStatus,
  createRecoveryKey,
  decryptPlan,
  derive,
  encryptionSalt,
  endSession,
  getSession,
  isEncryptedEnvelope,
  randomSession,
  recoverAccount,
  rotateRecoveryKey,
  setupUser,
  verifyLogin
} from './auth';
import {
  dataFilePath,
  loadPlan,
  loadPlanForSession,
  savePlan,
  savePlanForSession,
  withPlanLock
} from './store';
import { buildDailyReport, buildVulnReport, buildWeeklyReport, saveEvidenceFile } from './report';
import { buildAssetSheet } from './assetSheet';
import { buildDailyPptx, buildWeeklyPptx } from './pptx';
import { buildScopePdf, buildScopeXlsx } from './scopeReport';
import { buildPentestReportHtmlFile, buildPentestReportPdf } from './pentestReport';
import {
  lockVault,
  vaultDelete,
  vaultList,
  vaultReset,
  vaultReveal,
  vaultSetup,
  vaultStatus,
  vaultUnlock,
  vaultUpsert,
  vaultActionVerify,
  vaultActionSet,
  vaultActionReset
} from './vault';
import type { VaultUpsert } from '../shared/types';

const SMOKE = process.argv.includes('--smoke');
const SMOKE_UI = process.argv.includes('--smoke-ui');
const SMOKE_AUTH = process.argv.includes('--smoke-auth');
const IS_SMOKE = SMOKE || SMOKE_UI || SMOKE_AUTH;

app.setName('ANZIKA');
if (IS_SMOKE) {
  // Tests must never touch the real plan file.
  app.setPath('userData', join(tmpdir(), 'weekly-planner-smoke'));
} else {
  app.setPath('userData', join(app.getPath('appData'), 'weekly-planner'));
}

async function resetSmokeData(): Promise<void> {
  const dir = app.getPath('userData');
  await rm(join(dir, 'auth.json'), { force: true });
  await rm(join(dir, 'auth.json.tmp'), { force: true });
  await rm(join(dir, 'plan.json'), { force: true });
  await rm(join(dir, 'plan.json.tmp'), { force: true });
  await rm(join(dir, 'plan.json.bak'), { force: true });
}

function parentWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? undefined;
}

function registerIpc(): void {
  ipcMain.handle('auth:status', (): Promise<AuthStatus> => authStatus());

  ipcMain.handle('auth:setup', (_event, username: string, password: string): Promise<AuthResult> =>
    setupUser(username, password)
  );

  ipcMain.handle('auth:login', (_event, username: string, password: string): Promise<AuthResult> =>
    verifyLogin(username, password).then((result) => {
      if (result.ok) lockVault();
      return result;
    })
  );

  ipcMain.handle('auth:logout', () => {
    endSession();
    lockVault();
  });

  ipcMain.handle('auth:recover', (_event, recoveryKey: string, password: string): Promise<AuthResult> =>
    recoverAccount(recoveryKey, password)
  );

  ipcMain.handle('auth:recovery-key', (): Promise<RecoveryResult> => createRecoveryKey());

  ipcMain.handle('auth:rotate-recovery-key', (): Promise<RecoveryResult> => rotateRecoveryKey());

  // --- password vault ---------------------------------------------------
  ipcMain.handle('vault:status', () => withPlanLock(() => vaultStatus()));
  ipcMain.handle('vault:setup', (_event, secret: string, actionPassword: string) =>
    withPlanLock(() => vaultSetup(String(secret ?? ''), String(actionPassword ?? '')))
  );
  ipcMain.handle('vault:unlock', (_event, secret: string) =>
    withPlanLock(() => vaultUnlock(String(secret ?? '')))
  );
  ipcMain.handle('vault:lock', () => {
    lockVault();
  });
  ipcMain.handle('vault:list', () => withPlanLock(() => vaultList()));
  ipcMain.handle('vault:reveal', (_event, id: string) =>
    withPlanLock(() => vaultReveal(String(id ?? '')))
  );
  ipcMain.handle('vault:upsert', (_event, entry: VaultUpsert) =>
    withPlanLock(() => vaultUpsert(entry))
  );
  ipcMain.handle('vault:delete', (_event, id: string) =>
    withPlanLock(() => vaultDelete(String(id ?? '')))
  );
  ipcMain.handle('vault:reset', (_event, loginPassword: string, newSecret: string) =>
    withPlanLock(() => vaultReset(String(loginPassword ?? ''), String(newSecret ?? '')))
  );
  ipcMain.handle('vault:action-verify', (_event, password: string) =>
    withPlanLock(() => vaultActionVerify(String(password ?? '')))
  );
  ipcMain.handle('vault:action-set', (_event, password: string) =>
    withPlanLock(() => vaultActionSet(String(password ?? '')))
  );
  ipcMain.handle('vault:action-reset', (_event, secretKey: string, newPassword: string) =>
    withPlanLock(() =>
      vaultActionReset(String(secretKey ?? ''), String(newPassword ?? ''))
    )
  );

  ipcMain.handle('app:copyText', (_event, text: string): void => {
    clipboard.writeText(String(text ?? ''));
  });

  ipcMain.handle('app:openExternal', (_event, url: string): void => {
    const target = String(url ?? '');
    if (/^https?:\/\//.test(target)) {
      void import('electron').then(({ shell }) => shell.openExternal(target));
    }
  });

  ipcMain.handle('app:hashText', (_event, text: string): Record<string, string> => {
    const buf = Buffer.from(String(text ?? ''), 'utf8');
    const hex = (alg: string): string => createHash(alg).update(buf).digest('hex');
    return { md5: hex('md5'), sha1: hex('sha1'), sha256: hex('sha256'), sha512: hex('sha512') };
  });

  ipcMain.handle('plan:load', () =>
    withPlanLock(async (): Promise<PlanData> => {
      const plan = await loadPlanForSession();
      const { vault: _vault, ...rest } = plan;
      return rest;
    })
  );

  ipcMain.handle('plan:save', (_event, data: PlanData) =>
    withPlanLock(async (): Promise<void> => {
      // The renderer never sees the vault — keep whatever is stored on disk.
      const current = await loadPlanForSession();
      return savePlanForSession({ ...data, vault: current.vault });
    })
  );

  ipcMain.handle(
    'file:saveText',
    async (
      _event,
      defaultName: string,
      content: string,
      filters: SaveFileFilter[]
    ): Promise<SaveResult> => {
      try {
        const win = parentWindow();
        const options = { defaultPath: defaultName, filters };
        const result = win
          ? await dialog.showSaveDialog(win, options)
          : await dialog.showSaveDialog(options);
        if (result.canceled || !result.filePath) return null;
        await writeFile(result.filePath, content, 'utf8');
        return { ok: true, path: result.filePath };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  ipcMain.handle('file:openJson', async (): Promise<ImportResult> => {
    try {
      const win = parentWindow();
      const options = {
        filters: [{ name: 'ANZIKA JSON', extensions: ['json'] }],
        properties: ['openFile' as const]
      };
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options);
      if (result.canceled || !result.filePaths[0]) return null;
      const raw = await readFile(result.filePaths[0], 'utf8');
      const parsed = JSON.parse(raw) as PlanData;
      if (parsed && Array.isArray(parsed.tasks)) {
        return {
          ok: true,
          plan: {
            version: 1,
            tasks: parsed.tasks,
            vuln: parsed.vuln,
            log: parsed.log,
            assets: parsed.assets,
            engagement: parsed.engagement,
            risk: parsed.risk
          }
        };
      }
      if (isEncryptedEnvelope(raw)) {
        const session = getSession();
        if (!session) return { ok: false, error: 'Locked: sign in first.' };
        const decrypted = decryptPlan(raw, session.key);
        return {
          ok: true,
          plan: {
            version: 1,
            tasks: decrypted.tasks,
            vuln: decrypted.vuln,
            log: decrypted.log,
            assets: decrypted.assets,
            engagement: decrypted.engagement,
            risk: decrypted.risk
          }
        };
      }
      return { ok: false, error: 'Not a valid ANZIKA file.' };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  /** Lets the user pick a scanner export (Nessus/CSV) and returns its text. */
  ipcMain.handle('file:openScanCsv', async (): Promise<{ name: string; text: string } | null> => {
    try {
      const win = parentWindow();
      const options = {
        filters: [
          { name: 'Scan export', extensions: ['csv', 'nessus', 'xml'] },
          { name: 'All files', extensions: ['*'] }
        ],
        properties: ['openFile' as const]
      };
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options);
      if (result.canceled || !result.filePaths[0]) return null;
      const path = result.filePaths[0];
      return { name: basename(path), text: await readFile(path, 'utf8') };
    } catch {
      return null;
    }
  });

  /** Render an exceljs cell value as plain text. */
  const sheetCellText = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'object') {
      const v = value as {
        text?: unknown;
        richText?: Array<{ text?: string }>;
        hyperlink?: string;
        result?: unknown;
      };
      if (Array.isArray(v.richText)) return v.richText.map((r) => r.text ?? '').join('');
      if (typeof v.text === 'string') return v.text;
      if (typeof v.hyperlink === 'string') return v.hyperlink;
      if (v.result !== undefined) return sheetCellText(v.result);
      return '';
    }
    return String(value);
  };

  /** Lets the user pick an asset inventory sheet (Excel/CSV/TSV) and returns parsed rows. */
  ipcMain.handle(
    'file:openAssetSheet',
    async (): Promise<{ name: string; rows: AssetSheetRow[] } | null> => {
      try {
        const win = parentWindow();
        const options = {
          filters: [
            { name: 'Asset sheet', extensions: ['xlsx', 'xlsm', 'csv', 'tsv'] },
            { name: 'All files', extensions: ['*'] }
          ],
          properties: ['openFile' as const]
        };
        const result = win
          ? await dialog.showOpenDialog(win, options)
          : await dialog.showOpenDialog(options);
        if (result.canceled || !result.filePaths[0]) return null;
        const path = result.filePaths[0];
        const ext = extname(path).toLowerCase();
        if (ext === '.csv' || ext === '.tsv' || ext === '.txt') {
          return { name: basename(path), rows: parseAssetSheet(await readFile(path, 'utf8')) };
        }
        const wb = new Workbook();
        await wb.xlsx.readFile(path);
        const ws = wb.worksheets[0];
        const grid: string[][] = [];
        if (ws) {
          ws.eachRow({ includeEmpty: false }, (row) => {
            const cells: string[] = [];
            row.eachCell({ includeEmpty: true }, (cell) => cells.push(sheetCellText(cell.value)));
            grid.push(cells);
          });
        }
        return { name: basename(path), rows: parseAssetRows(grid) };
      } catch {
        return null;
      }
    }
  );

  /** Export the full asset inventory as an Excel sheet (round-trips via file:openAssetSheet). */
  ipcMain.handle(
    'file:saveAssetSheet',
    async (_event, assets: Asset[]): Promise<SaveResult> => {
      try {
        const win = parentWindow();
        const options = {
          defaultPath: `ANZIKA-Assets_${new Date().toISOString().slice(0, 10)}.xlsx`,
          filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
        };
        const result = win
          ? await dialog.showSaveDialog(win, options)
          : await dialog.showSaveDialog(options);
        if (result.canceled || !result.filePath) return null;
        await buildAssetSheet(assets, result.filePath);
        return { ok: true, path: result.filePath };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  ipcMain.handle(
    'report:export-weekly',
    async (_event, payload: WeeklyPayload): Promise<SaveResult> => {
      try {
        const win = parentWindow();
        const options = {
          defaultPath: `Weekly-Report_${payload.weekStart}.xlsx`,
          filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
        };
        const result = win
          ? await dialog.showSaveDialog(win, options)
          : await dialog.showSaveDialog(options);
        if (result.canceled || !result.filePath) return null;
        await buildWeeklyReport(payload, result.filePath);
        return { ok: true, path: result.filePath };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  ipcMain.handle(
    'report:export-pptx',
    async (_event, payload: WeeklyPayload): Promise<SaveResult> => {
      try {
        const win = parentWindow();
        const options = {
          defaultPath: `Weekly-Report_${payload.weekStart}.pptx`,
          filters: [{ name: 'PowerPoint Presentation', extensions: ['pptx'] }]
        };
        const result = win
          ? await dialog.showSaveDialog(win, options)
          : await dialog.showSaveDialog(options);
        if (result.canceled || !result.filePath) return null;
        await buildWeeklyPptx(payload, result.filePath);
        return { ok: true, path: result.filePath };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  ipcMain.handle(
    'report:export-daily',
    async (_event, payload: DailyPayload, format: 'xlsx' | 'pptx'): Promise<SaveResult> => {
      try {
        const win = parentWindow();
        const options = {
          defaultPath: `Day-Report_${payload.date}.${format}`,
          filters:
            format === 'pptx'
              ? [{ name: 'PowerPoint Presentation', extensions: ['pptx'] }]
              : [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
        };
        const result = win
          ? await dialog.showSaveDialog(win, options)
          : await dialog.showSaveDialog(options);
        if (result.canceled || !result.filePath) return null;
        if (format === 'pptx') await buildDailyPptx(payload, result.filePath);
        else await buildDailyReport(payload, result.filePath);
        return { ok: true, path: result.filePath };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  ipcMain.handle(
    'report:export-vuln',
    async (_event, payload: VulnReport): Promise<SaveResult> => {
      try {
        const win = parentWindow();
        const options = {
          defaultPath: 'vulnerability-assessment.xlsx',
          filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
        };
        const result = win
          ? await dialog.showSaveDialog(win, options)
          : await dialog.showSaveDialog(options);
        if (result.canceled || !result.filePath) return null;
        await buildVulnReport(payload, result.filePath);
        return { ok: true, path: result.filePath };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  ipcMain.handle(
    'report:export-engagement',
    async (
      _event,
      payload: { engagement: Engagement; format: 'xlsx' | 'pdf' }
    ): Promise<SaveResult> => {
      try {
        const win = parentWindow();
        const isPdf = payload.format === 'pdf';
        const slug = (payload.engagement.name || 'engagement')
          .replace(/[^\w-]+/g, '_')
          .replace(/_+/g, '_')
          .slice(0, 48);
        const options = {
          defaultPath: `Scope-Report_${slug}.${isPdf ? 'pdf' : 'xlsx'}`,
          filters: isPdf
            ? [{ name: 'PDF', extensions: ['pdf'] }]
            : [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
        };
        const result = win
          ? await dialog.showSaveDialog(win, options)
          : await dialog.showSaveDialog(options);
        if (result.canceled || !result.filePath) return null;
        if (isPdf) await buildScopePdf(payload.engagement, result.filePath);
        else await buildScopeXlsx(payload.engagement, result.filePath);
        return { ok: true, path: result.filePath };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  ipcMain.handle(
    'report:export-pentest',
    async (
      _event,
      payload: { engagement: Engagement; profile: ReportProfile; findings: Finding[]; format: 'pdf' | 'html' }
    ): Promise<SaveResult> => {
      try {
        const win = parentWindow();
        const isPdf = payload.format === 'pdf';
        const slug = (payload.engagement.name || 'pentest')
          .replace(/[^\w-]+/g, '_')
          .replace(/_+/g, '_')
          .slice(0, 48);
        const options = {
          defaultPath: `Pentest-Report_${slug}.${isPdf ? 'pdf' : 'html'}`,
          filters: isPdf
            ? [{ name: 'PDF', extensions: ['pdf'] }]
            : [{ name: 'HTML', extensions: ['html'] }]
        };
        const result = win
          ? await dialog.showSaveDialog(win, options)
          : await dialog.showSaveDialog(options);
        if (result.canceled || !result.filePath) return null;
        const input = {
          engagement: payload.engagement,
          profile: payload.profile ?? {
            firmName: '',
            firmWebsite: '',
            testerName: '',
            testerDescription: '',
            summaryOfStrengths: '',
            summaryOfWeaknesses: ''
          },
          findings: payload.findings ?? []
        };
        if (isPdf) await buildPentestReportPdf(input, result.filePath);
        else await buildPentestReportHtmlFile(input, result.filePath);
        return { ok: true, path: result.filePath };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  ipcMain.handle('report:pick-evidence', async (): Promise<string | null> => {
    try {
      const win = parentWindow();
      const options = {
        filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp'] }],
        properties: ['openFile' as const]
      };
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options);
      if (result.canceled || !result.filePaths[0]) return null;
      return result.filePaths[0];
    } catch {
      return null;
    }
  });

  ipcMain.handle(
    'report:save-evidence',
    async (_event, base64: string, mime: string): Promise<string | null> => {
      try {
        return await saveEvidenceFile(base64, mime);
      } catch {
        return null;
      }
    }
  );

  ipcMain.handle('app:dataPath', () => dataFilePath());
}

function createWindow(show = true): BrowserWindow {
  const window = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1080,
    minHeight: 640,
    title: 'ANZIKA',
    backgroundColor: '#0a1020',
    icon: join(__dirname, '../../build/icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  });

  window.once('ready-to-show', () => {
    if (show) window.show();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void import('electron').then(({ shell }) => shell.openExternal(url));
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return window;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function runSmokeTest(): Promise<void> {
  const report: Record<string, unknown> = { smoke: true };
  try {
    await resetSmokeData();

    // A plan left behind by an old build with sample owners must be purged.
    await mkdir(dirname(dataFilePath()), { recursive: true });
    const today = new Date().toISOString().slice(0, 10);
    await writeFile(
      dataFilePath(),
      JSON.stringify({
        version: 1,
        tasks: [
          {
            id: 'planted_demo',
            title: 'Firewall rule review',
            assignee: 'Aline',
            date: today,
            status: 'todo',
            recurrence: 'none',
            createdAt: nowIso(),
            updatedAt: nowIso()
          },
          {
            id: 'planted_own',
            title: 'My personal task',
            assignee: 'tester',
            date: today,
            status: 'todo',
            recurrence: 'none',
            createdAt: nowIso(),
            updatedAt: nowIso()
          }
        ]
      }),
      'utf8'
    );

    // --- auth: setup, wrong password, right password --------------------
    const setup = await setupUser('tester', 'Passw0rd!');
    report.setup = setup.ok === true;

    const wrong = await verifyLogin('tester', 'wrong-pass');
    report.wrongRejected = wrong.ok === false;
    report.autoLoginAfterSetup = getSession() !== null;

    const right = await verifyLogin('tester', 'Passw0rd!');
    report.login = right.ok === true;
    const session = getSession();
    report.session = session !== null;
    if (!session) throw new Error('no session after login');

    // --- storage: seed, encrypt at rest, roundtrip ----------------------
    const plan = await loadPlan(session.key);
    report.tasks = plan.tasks.length;
    report.samplePurged = !plan.tasks.some((t) => t.assignee === 'Aline');
    report.ownKept = plan.tasks.some((t) => t.title === 'My personal task');
    await savePlan(session.key, plan);
    const raw = await readFile(dataFilePath(), 'utf8');
    report.encryptedAtRest = isEncryptedEnvelope(raw) && !raw.includes('ELA & Jump Server');
    const reloaded = await loadPlan(session.key);
    report.roundtrip = reloaded.tasks.length === plan.tasks.length;
    report.wrongKeyRejected = (() => {
      try {
        decryptPlan(raw, Buffer.alloc(32, 7));
        return false;
      } catch {
        return true;
      }
    })();

    // --- weekly report xlsx (department template layout) ----------------
    const out = join(app.getPath('temp'), 'weekly-planner-smoke-weekly.xlsx');
    const monday = new Date();
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    const iso = (d: Date): string =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    await buildWeeklyReport(
      { weekStart: iso(monday), weekEnd: iso(sunday), tasks: plan.tasks },
      out
    );
    const stat = await readFile(out);
    const weekWb = new Workbook();
    await weekWb.xlsx.readFile(out);
    const weekSheet = weekWb.getWorksheet('Weekly Report');
    const weekTexts: string[] = [];
    for (let r = 3; r <= 30; r += 1) {
      const value = weekSheet?.getCell(`B${r}`).value;
      if (value === null || value === undefined) continue;
      weekTexts.push(typeof value === 'string' ? value : JSON.stringify(value));
    }
    const weekJoined = weekTexts.join(' ');
    report.weeklyXlsx = Boolean(
      weekSheet &&
        String(weekSheet.getCell('A1').value ?? '').startsWith('Week: ') &&
        weekSheet.getCell('B1').value === 'Information Security Department' &&
        weekSheet.getCell('D1').value === 'For Internal Use Only' &&
        weekSheet.getCell('A2').value === 'Activity' &&
        weekSheet.getCell('B2').value === 'Activities' &&
        weekSheet.getCell('A3').value === 'General Summary' &&
        weekJoined.includes('INFORMATION SECURITY OPERATIONS') &&
        weekJoined.includes('My personal task') &&
        weekJoined.includes('Challenges')
    );

    // --- weekly report pptx (department slide layout) --------------------
    const pptxOut = join(app.getPath('temp'), 'weekly-planner-smoke-weekly.pptx');
    await buildWeeklyPptx(
      { weekStart: iso(monday), weekEnd: iso(sunday), tasks: plan.tasks },
      pptxOut
    );
    const pptxBytes = await readFile(pptxOut);
    report.weeklyPptx = Boolean(
      pptxBytes.length > 8000 &&
        pptxBytes[0] === 0x50 &&
        pptxBytes[1] === 0x4b &&
        pptxBytes.includes('ppt/slides/slide1.xml') &&
        pptxBytes.includes('ppt/slides/slide2.xml')
    );

    // --- daily activity report (xlsx + pptx) ------------------------------
    const dailyPayload = {
      date: '2026-10-02',
      tasks: [
        {
          id: 'daily-1',
          title: 'Daily standup',
          assignee: 'Lionel',
          date: '2026-10-02',
          time: '09:00',
          status: 'done' as const,
          recurrence: 'none' as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'daily-2',
          title: 'Patch review',
          assignee: 'Lionel',
          date: '2026-10-02',
          status: 'todo' as const,
          recurrence: 'none' as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ],
      log: [
        {
          id: 'log-1',
          at: '2026-10-02T08:59:00.000Z',
          date: '2026-10-02',
          taskId: 'daily-1',
          taskTitle: 'Daily standup',
          action: 'created' as const
        },
        {
          id: 'log-2',
          at: '2026-10-02T10:15:00.000Z',
          date: '2026-10-02',
          taskId: 'daily-1',
          taskTitle: 'Daily standup',
          action: 'status' as const,
          from: 'todo',
          to: 'done'
        }
      ]
    };
    const dailyXlsxOut = join(app.getPath('temp'), 'weekly-planner-smoke-daily.xlsx');
    await buildDailyReport(dailyPayload, dailyXlsxOut);
    const dailyXlsxBytes = await readFile(dailyXlsxOut);
    const dailyWb = new Workbook();
    await dailyWb.xlsx.readFile(dailyXlsxOut);
    const daySheet = dailyWb.getWorksheet('Day Report');
    const dayTexts: string[] = [];
    for (let r = 3; r <= 40; r += 1) {
      for (const col of ['A', 'B', 'C', 'D']) {
        const value = daySheet?.getCell(`${col}${r}`).value;
        if (value === null || value === undefined) continue;
        dayTexts.push(typeof value === 'string' ? value : JSON.stringify(value));
      }
    }
    const dayJoined = dayTexts.join(' ');
    report.dailyXlsx = Boolean(
      daySheet &&
        dailyXlsxBytes.length > 3000 &&
        dailyXlsxBytes[0] === 0x50 &&
        dailyXlsxBytes[1] === 0x4b &&
        String(daySheet.getCell('A1').value ?? '').startsWith('Day: ') &&
        daySheet.getCell('B1').value === 'Information Security Department' &&
        daySheet.getCell('D1').value === 'For Internal Use Only' &&
        daySheet.getCell('A3').value === 'Daily Summary' &&
        dayJoined.includes('Scheduled activities') &&
        dayJoined.includes('Daily standup') &&
        dayJoined.includes('09:00') &&
        dayJoined.includes('Patch review') &&
        dayJoined.includes('Activity log') &&
        dayJoined.includes('Created') &&
        dayJoined.includes('Status: ') &&
        dayJoined.includes('→ Done')
    );
    const dailyPptxOut = join(app.getPath('temp'), 'weekly-planner-smoke-daily.pptx');
    await buildDailyPptx(dailyPayload, dailyPptxOut);
    const dailyPptxBytes = await readFile(dailyPptxOut);
    report.dailyPptx = Boolean(
      dailyPptxBytes.length > 8000 &&
        dailyPptxBytes[0] === 0x50 &&
        dailyPptxBytes[1] === 0x4b &&
        dailyPptxBytes.includes('ppt/slides/slide1.xml') &&
        dailyPptxBytes.includes('ppt/slides/slide2.xml')
    );

    // --- the activity log persists with the plan -------------------------
    const planBeforeLog = await withPlanLock(() => loadPlanForSession());
    await withPlanLock(() => savePlanForSession({ ...planBeforeLog, log: dailyPayload.log }));
    const planAfterLog = await withPlanLock(() => loadPlanForSession());
    report.logKept = Boolean(
      Array.isArray(planAfterLog.log) &&
        planAfterLog.log.length === 2 &&
        planAfterLog.log[0]?.taskTitle === 'Daily standup' &&
        planAfterLog.log[1]?.action === 'status'
    );

    // --- CVSS 3.1 calculator (canonical scores) ---------------------------
    report.cvssScores = Boolean(
      cvssBaseScore('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H') === 9.8 &&
        cvssBaseScore('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H') === 10.0 &&
        cvssBaseScore('CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H') === 7.8 &&
        cvssBaseScore('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N') === 7.5 &&
        cvssBaseScore('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N') === 0.0 &&
        cvssBaseScore('not a vector') === null &&
        cvssSeverity(9.5) === 'Critical' &&
        cvssSeverity(5) === 'Medium' &&
        cvssSeverity(0) === 'Info'
    );

    // --- SLA helpers ------------------------------------------------------
    const oldOpen = {
      id: 'sla-1',
      risk: 'Critical' as const,
      hosts: ['10.0.0.9'],
      description: 'ancient critical',
      riskDetail: '',
      solution: '',
      status: 'Open' as const,
      team: '',
      openedAt: '2026-08-01T00:00:00.000Z',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z'
    };
    const fixedOne = {
      ...oldOpen,
      id: 'sla-2',
      status: 'Resolved' as const,
      resolvedAt: '2026-08-05T00:00:00.000Z'
    };
    report.slaHelpers = Boolean(
      findingIsOpen(oldOpen) &&
        !findingIsOpen(fixedOne) &&
        findingBreached(oldOpen) &&
        !findingBreached(fixedOne) &&
        findingOpenDays(fixedOne) === 4
    );

    // --- scanner CSV import parsing ---------------------------------------
    const sampleCsv =
      'Plugin ID,CVE,CVSS v3.0 Base Score,Risk,Host,Protocol,Port,Name,Synopsis,Description,Solution\n' +
      '12345,CVE-2021-44228,10.0,Critical,10.0.0.5,tcp,8080,Log4Shell,Remote code execution,Apache Log4j JNDI,Upgrade log4j\n' +
      '12346,,5.0,Medium,10.0.0.5,tcp,22,SSH weak ciphers,Weak crypto,CBC ciphers enabled,Disable CBC\n';
    const scanRows = parseScanCsv(sampleCsv);
    report.scanParse = Boolean(
      scanRows.length === 2 &&
        scanRows[0].risk === 'Critical' &&
        scanRows[0].cvss === 10 &&
        scanRows[0].cve === 'CVE-2021-44228' &&
        scanRows[0].host === '10.0.0.5' &&
        scanRows[1].risk === 'Medium' &&
        scanRows[1].name === 'SSH weak ciphers'
    );

    // --- asset sheet import (TSV text + Excel roundtrip) ------------------
    const sampleAssetTsv =
      '#\tHOSTNAME\tIP ADDRESS\tOS\tSTATUS\tIP RANGE (/16)\tSOURCE\tHas Hostname?\n' +
      '2\t— NO HOSTNAME —\t10.10.3.1\tCisco IOS (Cisco Device)\tListening for Logs\t10.10.0.0/16\tSIEM\tNO\n' +
      '48\tHQ_BURERA_C6506\t10.10.171.3\tCisco IOS (Cisco Catalyst 6506)\tIn Use\t10.10.0.0/16\tSIEM\tYES\n' +
      '16\t— NO HOSTNAME —\t10.10.150.20\tCisco IOS (Cisco Device)\tDisabled\t10.10.0.0/16\tSIEM\tNO\n';
    const tsvRows = parseAssetSheet(sampleAssetTsv);
    const assetXlsxIn = join(app.getPath('temp'), 'weekly-planner-smoke-asset-in.xlsx');
    const wbIn = new Workbook();
    const wsIn = wbIn.addWorksheet('Assets');
    for (const line of sampleAssetTsv.split('\n')) {
      if (line.trim() !== '') wsIn.addRow(line.split('\t'));
    }
    await wbIn.xlsx.writeFile(assetXlsxIn);
    const wbOut = new Workbook();
    await wbOut.xlsx.readFile(assetXlsxIn);
    const wsOut = wbOut.worksheets[0];
    const assetGrid: string[][] = [];
    if (wsOut) {
      wsOut.eachRow({ includeEmpty: false }, (row) => {
        const cells: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell) => cells.push(String(cell.value ?? '')));
        assetGrid.push(cells);
      });
    }
    const xlsxAssetRows = parseAssetRows(assetGrid);
    report.assetImport = Boolean(
      tsvRows.length === 3 &&
        tsvRows[0].hostname === '10.10.3.1' &&
        tsvRows[0].ip === '10.10.3.1' &&
        tsvRows[0].status === 'Listening for Logs' &&
        tsvRows[0].criticality === 'Medium' &&
        tsvRows[0].range === '10.10.0.0/16' &&
        tsvRows[0].source === 'SIEM' &&
        tsvRows[1].hostname === 'HQ_BURERA_C6506' &&
        tsvRows[1].criticality === 'High' &&
        tsvRows[2].criticality === 'Low' &&
        xlsxAssetRows.length === 3 &&
        xlsxAssetRows[1].hostname === 'HQ_BURERA_C6506' &&
        xlsxAssetRows[1].ip === '10.10.171.3' &&
        xlsxAssetRows[1].criticality === 'High'
    );

    // --- asset sheet export round-trip (real handler builder) ------------
    const exportSample: Asset[] = [
      {
        id: 'exp-1',
        hostname: 'HQ_BURERA_C6506',
        ip: '10.10.171.3',
        os: 'Cisco IOS (Cisco Catalyst 6506)',
        owner: 'NetOps',
        criticality: 'High',
        notes: 'core switch',
        status: 'In Use',
        range: '10.10.0.0/16',
        source: 'SIEM',
        ref: '48',
        createdAt: nowIso(),
        updatedAt: nowIso()
      },
      {
        id: 'exp-2',
        hostname: 'srv-app-02',
        ip: '10.20.1.7',
        criticality: 'Critical',
        createdAt: nowIso(),
        updatedAt: nowIso()
      }
    ];
    const assetXlsxOut = join(app.getPath('temp'), 'weekly-planner-smoke-asset-out.xlsx');
    await buildAssetSheet(exportSample, assetXlsxOut);
    const wbExp = new Workbook();
    await wbExp.xlsx.readFile(assetXlsxOut);
    const wsExp = wbExp.worksheets[0];
    const expGrid: string[][] = [];
    if (wsExp) {
      wsExp.eachRow({ includeEmpty: false }, (row) => {
        const cells: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell) => cells.push(String(cell.value ?? '')));
        expGrid.push(cells);
      });
    }
    const exportedRows = parseAssetRows(expGrid);
    report.assetSheetExport = Boolean(
      exportedRows.length === 2 &&
        exportedRows[0].hostname === 'HQ_BURERA_C6506' &&
        exportedRows[0].ip === '10.10.171.3' &&
        exportedRows[0].criticality === 'High' &&
        exportedRows[0].notes === 'core switch' &&
        exportedRows[0].ref === '48' &&
        exportedRows[0].owner === 'NetOps' &&
        exportedRows[1].hostname === 'srv-app-02' &&
        exportedRows[1].criticality === 'Critical'
    );

    // --- command vault library --------------------------------------------
    report.cmdLibrary = Boolean(
      COMMANDS.length >= 120 &&
        COMMANDS.every(
          (c) => c.tool !== '' && c.title !== '' && c.command !== '' && c.description !== '' && c.tags.length > 0
        ) &&
        COMMANDS.filter((c) => c.tool === 'nmap').length >= 40 &&
        searchCommands('port scanning').length >= 5 &&
        searchCommands('port scanning').some((c) => c.tool === 'nmap') &&
        searchCommands('smb').length >= 5 &&
        searchCommands('ad').some((c) => c.tags.includes('ad')) &&
        searchCommands('kerberos').length >= 3 &&
        searchCommands('zzz-no-match').length === 0
    );

    // --- engagement scope report (xlsx + pdf) ------------------------------
    const scopeEngagement: Engagement = {
      id: 'eng-smoke',
      name: 'Internal PT',
      client: 'Test Client',
      scopeIn: '10.0.0.0/24\nwebapp.example.com',
      scopeOut: '10.0.5.0/24\nDoS testing',
      roe: 'Working hours 09-17\nStop and report immediately',
      phases: [
        { id: 'p1', name: 'Recon', done: true },
        { id: 'p2', name: 'Exploitation', done: false }
      ]
    };
    const scopeXlsxOut = join(app.getPath('temp'), 'weekly-planner-smoke-scope.xlsx');
    await buildScopeXlsx(scopeEngagement, scopeXlsxOut);
    const scopeWb = new Workbook();
    await scopeWb.xlsx.readFile(scopeXlsxOut);
    const scopeWs = scopeWb.worksheets[0];
    const scopeCell = (addr: string): string => String(scopeWs.getCell(addr).value ?? '');
    report.engagementXlsx = Boolean(
      scopeCell('A1').startsWith('Engagement: ') &&
        scopeCell('B1') === 'Information Security Department' &&
        scopeCell('D1') === 'For Internal Use Only' &&
        scopeCell('A2') === 'Field' &&
        scopeCell('B2') === 'Details' &&
        scopeCell('A3') === 'Client / requester' &&
        scopeCell('B3') === 'Test Client' &&
        scopeCell('A4') === 'Scope in' &&
        scopeCell('B4').includes('10.0.0.0/24') &&
        scopeCell('A5') === 'Scope out of bounds' &&
        scopeCell('B5').includes('DoS testing') &&
        scopeCell('A6') === 'Rules of engagement' &&
        scopeCell('B6').includes('09-17') &&
        scopeCell('A7') === 'Phase' &&
        scopeCell('B7') === 'Status' &&
        scopeCell('A8') === 'Recon' &&
        scopeCell('B8') === '✓ Completed' &&
        scopeCell('A9') === 'Exploitation' &&
        scopeCell('B9') === '○ Pending'
    );
    const scopePdfOut = join(app.getPath('temp'), 'weekly-planner-smoke-scope.pdf');
    await buildScopePdf(scopeEngagement, scopePdfOut);
    const scopePdfBytes = await readFile(scopePdfOut);
    report.engagementPdf = Boolean(
      scopePdfBytes.subarray(0, 4).toString() === '%PDF' && scopePdfBytes.length > 1500
    );

    // --- pentest report (html + pdf) ---------------------------------------
    const pentestFindings: Finding[] = [
      {
        id: 'f-p1',
        risk: 'Critical',
        hosts: ['webapp.example.com'],
        description: 'RCE in customer portal\nCVE-2021-44228',
        riskDetail: 'Unauthenticated remote code execution via JNDI.',
        solution: 'Upgrade Log4j to 2.17+',
        status: 'Open',
        team: 'Red Team',
        controls: ['CIS 7.4'],
        cvss: { vector: 'CVSS:4.0/AV:N/AC:L', score: 9.8 },
        openedAt: '2026-08-01T00:00:00.000Z',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z'
      },
      {
        id: 'f-p2',
        risk: 'Low',
        hosts: ['10.0.0.5'],
        description: 'Missing security headers on login page',
        riskDetail: 'No HSTS/CSP headers observed.',
        solution: 'Add strict-transport-security and content-security-policy headers.',
        status: 'In Progress',
        team: 'Red Team',
        createdAt: '2026-08-02T00:00:00.000Z',
        updatedAt: '2026-08-02T00:00:00.000Z'
      }
    ];
    const pentestInput = {
      engagement: {
        ...scopeEngagement,
        projectType: 'Internal Network Penetration Test',
        startDate: '2026-09-28',
        endDate: '2026-10-02',
        attackNarrative: '## Initial access\n1. Spear-phish the help desk\n2. **Domain admin** via SMB relay'
      },
      profile: {
        firmName: 'Kionda Security',
        firmWebsite: 'https://kionda.example',
        testerName: 'J. Doe',
        testerDescription: 'red team lead with 10 years of experience',
        summaryOfStrengths: 'Strong segmentation between VLANs.',
        summaryOfWeaknesses: 'Patch backlog on legacy servers.'
      } satisfies ReportProfile,
      findings: pentestFindings
    };
    const pentestHtmlOut = join(app.getPath('temp'), 'weekly-planner-smoke-pentest.html');
    await buildPentestReportHtmlFile(pentestInput, pentestHtmlOut);
    const pentestHtmlText = await readFile(pentestHtmlOut, 'utf8');
    report.pentestHtml = Boolean(
      pentestHtmlText.includes('Table of Contents') &&
        pentestHtmlText.includes('Executive Summary') &&
        pentestHtmlText.includes('Methodology and Approach') &&
        pentestHtmlText.includes('Penetration Testing Execution Standard (PTES)') &&
        pentestHtmlText.includes('Internal Network Penetration Test') &&
        pentestHtmlText.includes('Kionda Security') &&
        pentestHtmlText.includes('https://kionda.example') &&
        pentestHtmlText.includes('Test Client') &&
        pentestHtmlText.includes('10.0.0.0/24') &&
        pentestHtmlText.includes('webapp.example.com') &&
        pentestHtmlText.includes('Attack Narrative') &&
        pentestHtmlText.includes('Summary of Strengths') &&
        pentestHtmlText.includes('Summary of Weaknesses') &&
        pentestHtmlText.includes('CVSSv4 Score') &&
        pentestHtmlText.includes('A total of 2 issues were identified') &&
        pentestHtmlText.includes('RCE in customer portal') &&
        pentestHtmlText.includes('Detailed Findings') &&
        pentestHtmlText.includes('Appendix A: Rules of Engagement') &&
        pentestHtmlText.includes('Rules of Engagement provided by Test Client')
    );
    const pentestPdfOut = join(app.getPath('temp'), 'weekly-planner-smoke-pentest.pdf');
    await buildPentestReportPdf(pentestInput, pentestPdfOut);
    const pentestPdfBytes = await readFile(pentestPdfOut);
    report.pentestPdf = Boolean(
      pentestPdfBytes.subarray(0, 4).toString() === '%PDF' && pentestPdfBytes.length > 10000
    );

    // --- custom command vault entries --------------------------------------
    const customCmd: PentestCommand = {
      id: 'custom-x1',
      tool: 'Custom',
      domain: 'Custom',
      title: 'My custom scan',
      command: 'nmap -sV --my-flag target',
      description: 'Totally custom workflow',
      tags: ['zzq', 'custom']
    };
    report.cmdCustomSearch = Boolean(
      searchCommands('zzq', [customCmd]).length === 1 &&
        searchCommands('my custom scan', [customCmd]).some((c) => c.id === 'custom-x1') &&
        searchCommands('custom workflow', [customCmd]).length >= 1 &&
        searchCommands('nmap', [customCmd]).length > searchCommands('nmap').length &&
        searchCommands('port scanning').length >= 5 &&
        searchCommands('zzz-no-match', [customCmd]).length === 0
    );

    // --- weekly deck risk/compliance exec slide ---------------------------
    const riskPptxOut = join(app.getPath('temp'), 'weekly-planner-smoke-risk.pptx');
    await buildWeeklyPptx(
      {
        weekStart: iso(monday),
        weekEnd: iso(sunday),
        tasks: plan.tasks,
        risk: [
          { date: '2026-09-28', open: 5, critical: 1, high: 2, medium: 1, low: 1, info: 0 },
          { date: '2026-09-29', open: 4, critical: 1, high: 1, medium: 1, low: 1, info: 0 }
        ],
        findings: [
          {
            id: 'f-risk-1',
            risk: 'Critical',
            hosts: ['10.0.0.5'],
            description: 'RCE in customer portal\nCVE-2021-44228',
            riskDetail: 'Full compromise',
            solution: 'Upgrade log4j',
            status: 'Open',
            team: 'IP Team',
            controls: ['CIS 7.4', 'ISO A.8.8'],
            openedAt: '2026-08-01T00:00:00.000Z',
            createdAt: '2026-08-01T00:00:00.000Z',
            updatedAt: '2026-08-01T00:00:00.000Z'
          }
        ]
      },
      riskPptxOut
    );
    const riskPptxBytes = await readFile(riskPptxOut);
    report.riskSlide = Boolean(
      riskPptxBytes.includes('ppt/slides/slide1.xml') &&
        riskPptxBytes.includes('ppt/slides/slide3.xml')
    );

    // --- password vault: setup, action password, lock, reveal, reset -----
    const vSame = await vaultSetup('SamePass99', 'SamePass99');
    report.vaultSameRejected = vSame.ok === false;
    const vSetup = await vaultSetup('VaultSecret1!', 'ActPass1!');
    report.vaultSetup = vSetup.ok === true;
    const vStatus = await vaultStatus();
    report.vaultStatusHasAction = vStatus.hasAction === true;
    const vListOpen = await vaultList();
    report.vaultEntriesHidden =
      vListOpen.ok && vListOpen.entries.every((e) => !('password' in e));

    // mutations and reveals are refused until the action password is verified
    const vAddNoAct = await vaultUpsert({
      label: 'Kionda portal',
      username: 'lionel',
      password: 'Sup3rSecret!'
    });
    report.vaultUpsertNeedsAction =
      vAddNoAct.ok === false &&
      'needsAction' in vAddNoAct &&
      vAddNoAct.needsAction === true;
    const vActBad = await vaultActionVerify('wrong-action');
    report.vaultActionBad = vActBad.ok === false;
    const vActGood = await vaultActionVerify('ActPass1!');
    report.vaultAction = vActGood.ok === true;

    const vAdd = await vaultUpsert({
      label: 'Kionda portal',
      username: 'lionel',
      password: 'Sup3rSecret!'
    });
    report.vaultUpsert = vAdd.ok === true;
    const vList1 = await vaultList();
    const vId = vList1.ok ? vList1.entries[0]?.id : undefined;
    const vRevealFirst = vId
      ? await vaultReveal(vId)
      : ({ ok: false as const, error: 'no entry' });
    report.vaultReveal = vRevealFirst.ok && vRevealFirst.password === 'Sup3rSecret!';

    // locking clears both the unlock window and the action window
    lockVault();
    const vListLocked = await vaultList();
    report.vaultLockedList = vListLocked.ok === false;
    const vRevealLocked = await vaultReveal('missing');
    report.vaultLockedReveal = vRevealLocked.ok === false;
    const vActLocked = await vaultActionVerify('ActPass1!');
    report.vaultActionLocked = vActLocked.ok === false;
    const vBad = await vaultUnlock('wrong-secret');
    report.vaultBadSecret = vBad.ok === false;
    const vGood = await vaultUnlock('VaultSecret1!');
    report.vaultUnlock = vGood.ok === true;

    // a fresh unlock starts with no action window
    const vRevealNoAct = vId
      ? await vaultReveal(vId)
      : ({ ok: false as const, error: 'no entry' });
    report.vaultRevealNeedsAction =
      vRevealNoAct.ok === false &&
      'needsAction' in vRevealNoAct &&
      vRevealNoAct.needsAction === true;
    const vDelNoAct = await vaultDelete('missing-entry');
    report.vaultDeleteNeedsAction =
      vDelNoAct.ok === false && 'needsAction' in vDelNoAct && vDelNoAct.needsAction === true;

    // the action change is guarded by the vault secret key (not the login password)
    const vActResetBad = await vaultActionReset('wrong-secret-key', 'ActPass2!');
    report.vaultActionResetBad = vActResetBad.ok === false;
    const vActReset = await vaultActionReset('VaultSecret1!', 'ActPass2!');
    report.vaultActionReset = vActReset.ok === true;
    const vActOld = await vaultActionVerify('ActPass1!');
    report.vaultActionOldRejected = vActOld.ok === false;
    const vActNew = await vaultActionVerify('ActPass2!');
    report.vaultActionNewWorks = vActNew.ok === true;
    const vReveal2 = vId ? await vaultReveal(vId) : ({ ok: false as const, error: 'no entry' });
    report.vaultReveal2 = vReveal2.ok && vReveal2.password === 'Sup3rSecret!';

    // the secret-key reset keeps the entries and the action password
    const vReset = await vaultReset('Passw0rd!', 'NewVaultKey2!');
    report.vaultReset = vReset.ok === true;
    lockVault();
    const vOld = await vaultUnlock('VaultSecret1!');
    report.vaultOldSecretRejected = vOld.ok === false;
    const vNew = await vaultUnlock('NewVaultKey2!');
    report.vaultNewSecretWorks = vNew.ok === true;
    const vList3 = await vaultList();
    report.vaultEntriesKept =
      vList3.ok && vList3.entries.some((e) => e.label === 'Kionda portal');
    const vActKept = await vaultActionVerify('ActPass2!');
    report.vaultActionKept = vActKept.ok === true;
    const vRevealKept = vId
      ? await vaultReveal(vId)
      : ({ ok: false as const, error: 'no entry' });
    report.vaultRevealKept = vRevealKept.ok && vRevealKept.password === 'Sup3rSecret!';
    // with no session every call fails closed, even inside the unlock window
    endSession();
    const vOut = await vaultReveal(vId ?? 'x');
    report.vaultLockedOut = vOut.ok === false;
    lockVault();

    // --- vulnerability report xlsx --------------------------------------
    let evidencePath = join(app.getAppPath(), 'build', 'icon.png');
    try {
      await access(evidencePath);
    } catch {
      evidencePath = join(app.getPath('temp'), 'smoke-evidence.png');
      await writeFile(
        evidencePath,
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      );
    }
    const vulnOut = join(app.getPath('temp'), 'weekly-planner-smoke-vuln.xlsx');
    await buildVulnReport(
      {
        title: 'Smoke Vulnerability Assessment',
        findings: [
          {
            id: 'f1',
            risk: 'Critical',
            hosts: ['172.28.8.34', '172.28.8.36'],
            description: 'The remote host runs outdated kernel packages.',
            riskDetail: 'An attacker can gain root-level control over the system.',
            solution: 'Update the kernel package and reboot.',
            timeline: '2026-08-21',
            status: 'Open',
            team: 'IP Team',
            evidence: evidencePath,
            createdAt: nowIso(),
            updatedAt: nowIso()
          },
          {
            id: 'f2',
            risk: 'Medium',
            hosts: ['172.28.8.35'],
            description: "The server's X.509 SSL certificate cannot be trusted.",
            riskDetail: 'Could allow man-in-the-middle attacks.',
            solution: 'Purchase or generate a proper SSL certificate.',
            status: 'Open',
            team: 'IP Team',
            createdAt: nowIso(),
            updatedAt: nowIso()
          }
        ]
      },
      vulnOut
    );
    const vulnCheck = new Workbook();
    await vulnCheck.xlsx.readFile(vulnOut);
    const vulnSheet = vulnCheck.getWorksheet('IP');
    const riskFill = vulnSheet?.getCell('B5').fill as { fgColor?: { argb?: string } } | undefined;
    report.vulnXlsx = Boolean(
      vulnSheet &&
        vulnSheet.getCell('B2').value === 'Smoke Vulnerability Assessment' &&
        vulnSheet.getCell('C5').value === '172.28.8.34\n172.28.8.36' &&
        vulnSheet.getCell('H5').value === '21/08/2026' &&
        riskFill?.fgColor?.argb === 'FFC00000'
    );
    const vulnImages = vulnSheet?.getImages().length ?? 0;
    report.vulnImages = vulnImages;
    const vulnStat = await readFile(vulnOut);

    // --- pasted screenshots persist under the data folder ----------------
    const savedEvidence = await saveEvidenceFile('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'image/png');
    report.evidenceSaved =
      savedEvidence.includes('evidence') && (await readFile(savedEvidence)).length > 20;

    // --- legacy profile (pre-recovery-key) auto-upgrades on login -------
    endSession();
    const authPath = join(app.getPath('userData'), 'auth.json');
    const legacyFile = JSON.parse(await readFile(authPath, 'utf8')) as {
      salt: string;
      wrapped?: unknown;
      recovery?: unknown;
    };
    const legacyKey = derive('Passw0rd!', encryptionSalt(Buffer.from(legacyFile.salt, 'base64')), 32);
    await savePlan(legacyKey, plan);
    delete legacyFile.wrapped;
    delete legacyFile.recovery;
    await writeFile(authPath, JSON.stringify(legacyFile, null, 2), 'utf8');
    const legacyLogin = await verifyLogin('tester', 'Passw0rd!');
    report.legacyLogin = legacyLogin.ok === true;
    const legacySession = getSession();
    report.legacyDecrypts = legacySession
      ? (await loadPlan(legacySession.key)).tasks.length === plan.tasks.length
      : false;
    const upgradedFile = JSON.parse(await readFile(authPath, 'utf8')) as {
      wrapped?: unknown;
      recovery?: unknown;
    };
    report.legacyUpgraded = Boolean(upgradedFile.wrapped) && !upgradedFile.recovery;

    // --- recovery key: create, reject a bad key, reset the password ----
    const created = await createRecoveryKey();
    report.recoveryKeyCreated = created.ok === true;
    if (created.ok) {
      endSession();
      const badKey = await recoverAccount('0000-0000-0000-0000-0000-0000-0000-0000', 'NewPass99!');
      report.recoveryBadKeyRejected = badKey.ok === false;
      const reset = await recoverAccount(created.key, 'NewPass99!');
      report.recoveryReset = reset.ok === true;
      const oldLogin = await verifyLogin('tester', 'Passw0rd!');
      report.oldPasswordRejected = oldLogin.ok === false;
      const newLogin = await verifyLogin('tester', 'NewPass99!');
      report.newPasswordWorks = newLogin.ok === true;
      const newSession = getSession();
      report.recoveryKeepsData = newSession
        ? (await loadPlan(newSession.key)).tasks.length === plan.tasks.length
        : false;
    } else {
      report.recoveryBadKeyRejected = false;
      report.recoveryReset = false;
      report.oldPasswordRejected = false;
      report.newPasswordWorks = false;
      report.recoveryKeepsData = false;
    }

    // --- status stamps: done records completion, canceled records cancel --
    const sessionNow = getSession();
    if (sessionNow && plan.tasks.length > 0) {
      const base = plan.tasks[0];
      const stamp = new Date().toISOString();
      const doneTask = withStatus({ ...base, status: 'todo' }, 'done', stamp);
      report.stampsDone = Boolean(doneTask.completedAt);
      const reopened = withStatus(doneTask, 'todo', stamp);
      report.stampsReopened = !reopened.completedAt;
      const canceledTask = withStatus({ ...base, status: 'todo' }, 'canceled', stamp);
      report.stampsCanceled = Boolean(canceledTask.canceledAt) && !canceledTask.completedAt;

      // --- monthly recurrence materialises in the current month ----------
      const nowD = new Date();
      const cy = nowD.getFullYear();
      const cm = nowD.getMonth() + 1;
      const prevYear = cm === 1 ? cy - 1 : cy;
      const prevMonth = cm === 1 ? 12 : cm - 1;
      const prevKey = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
      const currentMonthIso = `${cy}-${String(cm).padStart(2, '0')}`;
      const monthlySeed: Task = {
        ...base,
        id: 'monthly_smoke_seed',
        title: 'Monthly audit',
        recurrence: 'monthly',
        date: `${prevKey}-05`,
        status: 'todo',
        dueDate: undefined,
        completedAt: undefined,
        canceledAt: undefined,
        lastAdvancedWeek: undefined,
        lastAdvancedMonth: undefined,
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      const dueSeed: Task = {
        ...base,
        id: 'due_smoke_seed',
        title: 'Deadline smoke',
        recurrence: 'none',
        status: 'todo',
        dueDate: `${currentMonthIso}-28`,
        completedAt: undefined,
        canceledAt: undefined,
        lastAdvancedWeek: undefined,
        lastAdvancedMonth: undefined,
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      await savePlan(sessionNow.key, {
        ...plan,
        tasks: [...plan.tasks, monthlySeed, dueSeed]
      });
      const reloadedMonthly = await loadPlan(sessionNow.key);
      report.monthlyAdvanced = reloadedMonthly.tasks.some(
        (t) => t.title === 'Monthly audit' && t.date.startsWith(currentMonthIso)
      );
      report.dueDateKept = reloadedMonthly.tasks.some(
        (t) => t.title === 'Deadline smoke' && t.dueDate === `${currentMonthIso}-28`
      );
      // leave the plan as it was for the remaining checks
      await savePlan(sessionNow.key, plan);
    } else {
      report.stampsDone = false;
      report.stampsReopened = false;
      report.stampsCanceled = false;
      report.monthlyAdvanced = false;
      report.dueDateKept = false;
    }

    // --- logout locks the data -----------------------------------------
    endSession();
    report.lockedAfterLogout = getSession() === null;
    try {
      await loadPlanForSession();
      report.lockedLoad = false;
    } catch {
      report.lockedLoad = getSession() === null;
    }

    report.ok = Boolean(
      report.setup &&
        report.tasks === 1 &&
        report.samplePurged &&
        report.ownKept &&
        report.wrongRejected &&
        report.autoLoginAfterSetup &&
        report.login &&
        report.encryptedAtRest &&
        report.roundtrip &&
        report.wrongKeyRejected &&
        stat.length > 5000 &&
        report.weeklyXlsx &&
        pptxBytes.length > 8000 &&
        report.weeklyPptx &&
        report.dailyXlsx &&
        report.dailyPptx &&
        report.logKept &&
        report.cvssScores &&
        report.slaHelpers &&
        report.scanParse &&
        report.assetImport &&
        report.assetSheetExport &&
        report.cmdLibrary &&
        report.engagementXlsx &&
        report.engagementPdf &&
        report.pentestHtml &&
        report.pentestPdf &&
        report.cmdCustomSearch &&
        report.riskSlide &&
        report.vaultSetup &&
        report.vaultSameRejected &&
        report.vaultStatusHasAction &&
        report.vaultEntriesHidden &&
        report.vaultUpsertNeedsAction &&
        report.vaultActionBad &&
        report.vaultAction &&
        report.vaultUpsert &&
        report.vaultLockedList &&
        report.vaultLockedReveal &&
        report.vaultActionLocked &&
        report.vaultBadSecret &&
        report.vaultUnlock &&
        report.vaultRevealNeedsAction &&
        report.vaultDeleteNeedsAction &&
        report.vaultReveal &&
        report.vaultActionResetBad &&
        report.vaultActionReset &&
        report.vaultActionOldRejected &&
        report.vaultActionNewWorks &&
        report.vaultReveal2 &&
        report.vaultReset &&
        report.vaultOldSecretRejected &&
        report.vaultNewSecretWorks &&
        report.vaultEntriesKept &&
        report.vaultActionKept &&
        report.vaultRevealKept &&
        report.vaultLockedOut &&
        report.vulnXlsx &&
        vulnImages >= 1 &&
        vulnStat.length > 5000 &&
        report.evidenceSaved &&
        report.legacyLogin &&
        report.legacyDecrypts &&
        report.legacyUpgraded &&
        report.recoveryKeyCreated &&
        report.recoveryBadKeyRejected &&
        report.recoveryReset &&
        report.oldPasswordRejected &&
        report.newPasswordWorks &&
        report.recoveryKeepsData &&
        report.stampsDone &&
        report.stampsReopened &&
        report.stampsCanceled &&
        report.monthlyAdvanced &&
        report.dueDateKept &&
        report.lockedAfterLogout &&
        report.lockedLoad
    );
  } catch (err) {
    report.ok = false;
    report.error = err instanceof Error ? err.message : String(err);
  }
  console.log(JSON.stringify(report));
  app.exit(report.ok === true ? 0 : 1);
}

interface UiProbe {
  topbar: boolean;
  vulnTab: boolean;
  cols: number;
  cards: number;
  modal: boolean;
  login: boolean;
  error: boolean;
  keyScreen: boolean;
  recoveryForm: boolean;
  dash: boolean;
  statusModal: boolean;
  statusStep2: boolean;
  keyExists: boolean;
  vaultSetup: boolean;
  vaultOpen: boolean;
  vaultLockCard: boolean;
  vaultError: boolean;
  actionModal: boolean;
  logView: boolean;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function runUiSmoke(): Promise<void> {
  const report: Record<string, unknown> = { smokeUi: true };
  const errors: string[] = [];

  // The UI test drives the board directly, so start an in-memory session.
  await resetSmokeData();
  randomSession('Smoke Tester');
  const window = createWindow(false);

  window.webContents.on('render-process-gone', (_event, details) =>
    errors.push(`renderer gone: ${details.reason}`)
  );
  window.webContents.on('did-fail-load', (_event, code, description) =>
    errors.push(`load failed: ${code} ${description}`)
  );
  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (Number(level) >= 3) errors.push(`renderer: ${message} (${sourceId}:${line})`);
  });

  const probe = (): Promise<UiProbe> =>
    window.webContents.executeJavaScript(`(() => ({
      topbar: !!document.querySelector('.topbar'),
      vulnTab: !!document.querySelector('.vuln'),
      cols: document.querySelectorAll('.day-col').length,
      cards: document.querySelectorAll('.card').length,
      modal: !!document.querySelector('.modal'),
      login: !!document.querySelector('.auth-screen'),
      error: !!document.querySelector('.form-error'),
      keyScreen: !!document.querySelector('#recovery-key-display'),
      recoveryForm: !!document.querySelector('#recovery-key'),
      dash: !!document.querySelector('.dash'),
      statusModal: !!document.querySelector('.modal-status'),
      statusStep2: !!document.querySelector('#status-step2.on'),
      keyExists: !!document.querySelector('#rotate-recovery-key'),
      vaultSetup: !!document.querySelector('#vault-setup'),
      vaultOpen: !!document.querySelector('#vault-open'),
      vaultLockCard: !!document.querySelector('#vault-lock'),
      vaultError: !!document.querySelector('#vault-error'),
      actionModal: !!document.querySelector('#action-modal'),
      logView: !!document.querySelector('#log-view')
    }))()`);

  const waitFor = async (
    test: (p: UiProbe) => boolean,
    timeoutMs = 9000
  ): Promise<UiProbe | null> => {
    const deadline = Date.now() + timeoutMs;
    let last: UiProbe | null = null;
    while (Date.now() < deadline) {
      try {
        last = await probe();
        if (test(last)) return last;
      } catch {
        /* page still loading */
      }
      await sleep(250);
    }
    return last;
  };

  try {
    const booted = await waitFor((p) => p.topbar && p.dash);
    report.booted = booted !== null && booted.topbar && booted.dash;
    report.loginHidden = booted !== null && !booted.login;
    if (!report.booted) throw new Error('dashboard did not render');

    // The sidebar navigates to the board
    await window.webContents.executeJavaScript(`document.querySelector('#nav-board').click()`);
    const board = await waitFor((p) => p.cols === 7);
    report.boardShown = board !== null && board.cols === 7;
    report.seedCards = board?.cards ?? 0;
    if (!report.boardShown) throw new Error('board did not render');

    // Open the "New task" dialog
    await window.webContents.executeJavaScript(`document.querySelector('#new-task').click()`);
    const withModal = await waitFor((p) => p.modal);
    report.modalOpened = withModal?.modal === true;
    if (!report.modalOpened) throw new Error('task dialog did not open');

    // Type a title through the native value setter (React controlled input)
    const typed = await window.webContents.executeJavaScript(`(() => {
      const input = document.getElementById('task-title');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'Smoke test task');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return input.value;
    })()`);
    report.typed = typed === 'Smoke test task';

    await window.webContents.executeJavaScript(
      `document.querySelector('.modal-foot .btn-primary').click()`
    );
    const afterSave = await waitFor(
      (p) => !p.modal && p.cards === (report.seedCards as number) + 1
    );
    report.taskCreated = afterSave !== null && !afterSave.modal;

    // --- change-status wizard: card button → select → review → submit ---
    report.statusButton = await window.webContents.executeJavaScript(
      `!!document.querySelector('.card-status-btn')`
    );
    const statusPlan = JSON.parse(
      String(
        await window.webContents.executeJavaScript(`(() => {
          const card = document.querySelector('.card');
          if (!card) return 'null';
          const states = ['todo', 'in_progress', 'blocked', 'done', 'canceled'];
          const cur = states.find((s) => card.classList.contains(s)) || 'todo';
          const target = cur === 'done' ? 'canceled' : 'done';
          return JSON.stringify({
            title: card.querySelector('.card-title')?.textContent ?? '',
            target
          });
        })()`)
      )
    ) as { title: string; target: string } | null;

    if (statusPlan) {
      await window.webContents.executeJavaScript(`document.querySelector('.card-status-btn').click()`);
      const statusOpen = await waitFor((p) => p.statusModal);
      report.statusModalOpened = statusOpen?.statusModal === true;

      await window.webContents.executeJavaScript(
        `document.querySelector('#status-opt-${statusPlan.target}').click()`
      );
      await window.webContents.executeJavaScript(`document.querySelector('#status-next').click()`);
      const step2 = await waitFor((p) => p.statusStep2);
      report.statusStep2 =
        step2?.statusStep2 === true &&
        (await window.webContents.executeJavaScript(
          `!!document.querySelector('#status-submit') && !!document.querySelector('#status-back')`
        ));

      await window.webContents.executeJavaScript(`document.querySelector('#status-submit').click()`);
      const statusClosed = await waitFor((p) => !p.statusModal);
      report.statusSubmitted = statusClosed !== null && !statusClosed.statusModal;
      report.statusApplied = await window.webContents.executeJavaScript(`
        [...document.querySelectorAll('.card')].some(
          (c) =>
            c.classList.contains(${JSON.stringify(statusPlan.target)}) &&
            (c.querySelector('.card-title')?.textContent ?? '') ===
              ${JSON.stringify(statusPlan.title)}
        )
      `);
    } else {
      report.statusModalOpened = false;
      report.statusStep2 = false;
      report.statusSubmitted = false;
      report.statusApplied = false;
    }

    // --- reports hub: reachable from the bar, offers every format ---------
    const setVal = async (id: string, value: string): Promise<void> => {
      const ok = await window.webContents.executeJavaScript(`(() => {
        const el = document.getElementById(${JSON.stringify(id)});
        if (!el) return false;
        const proto =
          el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : el instanceof HTMLSelectElement
              ? HTMLSelectElement.prototype
              : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setter.call(el, ${JSON.stringify(value)});
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
      if (!ok) throw new Error(`ui: missing input #${id}`);
    };
    const clickJs = async (sel: string): Promise<void> => {
      const ok = await window.webContents.executeJavaScript(`(() => {
        const el = document.querySelector(${JSON.stringify(sel)});
        if (!el) return false;
        el.click();
        return true;
      })()`);
      if (!ok) throw new Error(`ui: missing element ${sel}`);
    };
    const waitJs = async (js: string, attempts = 24): Promise<boolean> => {
      for (let i = 0; i < attempts; i += 1) {
        if (await window.webContents.executeJavaScript(js)) return true;
        await sleep(250);
      }
      return false;
    };

    report.topReports = await waitJs(`!!document.querySelector('#top-reports')`);
    await clickJs('#top-reports');
    report.reportsView = await waitJs(
      `!!document.querySelector('#reports-view') && !!document.querySelector('#rep-day-date')`
    );
    report.reportsExportBtns = await waitJs(
      `['#rep-weekly-xlsx','#rep-weekly-pptx','#rep-day-xlsx','#rep-day-pptx',
        '#rep-scope-xlsx','#rep-scope-pdf','#rep-vuln-xlsx','#rep-csv','#rep-json',
        '#rep-import','#rep-eng-select','#rep-pentest-eng','#rep-pentest-pdf',
        '#rep-pentest-html'].every((sel) => !!document.querySelector(sel))`
    );
    report.repTable = await waitJs(
      `!!document.querySelector('.report-table') &&
       document.querySelectorAll('.report-table tbody tr').length === 6`
    );
    await clickJs('#nav-dashboard');
    report.topReportsDash = await waitJs(`!!document.querySelector('#top-reports')`);

    // --- today agenda panel: quick add + change status --------------------
    report.todayPanel = await waitJs(`!!document.querySelector('#today-panel')`);
    await setVal('today-quick-add', 'Prep standup notes');
    await clickJs('#today-add-btn');
    report.todayQuickAdd = await waitJs(
      `[...document.querySelectorAll('.today-title')].some((b) => (b.textContent ?? '').includes('Prep standup notes'))`
    );
    const clickedStatus = await window.webContents.executeJavaScript(`(() => {
      const row = [...document.querySelectorAll('.today-row')].find(
        (r) => (r.textContent ?? '').includes('Prep standup notes')
      );
      const btn = row?.querySelector('.today-status-btn');
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
    if (!clickedStatus) throw new Error('today panel: status button not found for quick-add task');
    const todayStatus = await waitFor((p) => p.statusModal);
    report.todayStatusModal = todayStatus?.statusModal === true;
    await clickJs('#status-opt-done');
    await clickJs('#status-next');
    await clickJs('#status-submit');
    report.todayStatusDone = await waitJs(
      `[...document.querySelectorAll('.today-row')].some(
        (r) => (r.textContent ?? '').includes('Prep standup notes') &&
               (r.textContent ?? '').includes('Done')
      )`
    );

    // --- activity log view: entries + day export buttons ------------------
    await clickJs('#nav-log');
    const logView = await waitFor((p) => p.logView);
    report.logViewShown = logView?.logView === true;
    report.logEntryShown = await waitJs(
      `[...document.querySelectorAll('.log-title')].some((el) => (el.textContent ?? '').includes('Prep standup notes'))`
    );
    report.logCreatedEntry = await waitJs(
      `[...document.querySelectorAll('.log-action')].some((el) => (el.textContent ?? '').includes('Created'))`
    );
    report.logStatusEntry = await waitJs(
      `[...document.querySelectorAll('.log-action')].some((el) => (el.textContent ?? '').includes('Status changed'))`
    );

    // --- asset registry: add an asset ------------------------------------
    report.brandANZIKA = await waitJs(
      `document.title === 'ANZIKA' &&
       (document.querySelector('.side-brand')?.textContent ?? '').includes('ANZIKA')`
    );
    await clickJs('#nav-assets');
    report.assetsView = await waitJs(`!!document.querySelector('#assets-view')`);
    report.assetImportBtn = await waitJs(`!!document.querySelector('#import-assets')`);
    report.assetExportBtn = await waitJs(`!!document.querySelector('#export-assets')`);
    await setVal('asset-hostname', 'web-01');
    await setVal('asset-ip', '10.0.0.5');
    await clickJs('#asset-add');
    report.assetAdded = await waitJs(
      `(document.querySelector('.asset-table')?.textContent ?? '').includes('web-01')`
    );
    report.assetPager = await waitJs(
      `!!document.querySelector('#asset-pager') &&
       (document.querySelector('#asset-range')?.textContent ?? '').includes('of 1') &&
       document.querySelector('#asset-next')?.disabled === true`
    );

    // --- cyber toolbox: CIDR, encode, hash, ports -------------------------
    await clickJs('#nav-toolbox');
    report.toolboxView = await waitJs(`!!document.querySelector('#toolbox')`);
    await setVal('cidr-input', '10.0.0.0/24');
    report.cidrCalc = await waitJs(
      `(document.querySelector('#cidr-out')?.textContent ?? '').includes('10.0.0.1') &&
       (document.querySelector('#cidr-out')?.textContent ?? '').includes('254 usable')`
    );
    await setVal('enc-in', 'hello');
    await clickJs('#enc-encode');
    report.encodeTool = await waitJs(`document.querySelector('#enc-out')?.value === 'aGVsbG8='`);
    await setVal('hash-input', 'abc');
    report.hashTool = await waitJs(
      `[...document.querySelectorAll('.hash-row code')].some((c) => (c.textContent ?? '').startsWith('ba7816bf8f01cfea'))`,
      40
    );
    await setVal('ports-filter', '3306');
    report.portsFilter = await waitJs(
      `document.querySelectorAll('.port-row').length === 1 &&
       (document.querySelector('#ports-list')?.textContent ?? '').includes('MySQL')`
    );

    // --- engagement registry: list → new → detail → back ----------------
    await clickJs('#nav-engage');
    report.engageView = await waitJs(`!!document.querySelector('#engage-view')`);
    report.engageList = await waitJs(
      `!!document.querySelector('#eng-new') && !!document.querySelector('#eng-empty')`
    );
    await clickJs('#eng-new');
    report.engageCreated = await waitJs(`!!document.querySelector('#eng-name')`);
    report.engageReportFields = await waitJs(
      `['#eng-project-type','#eng-start','#eng-end','#eng-narrative'].every(
        (sel) => !!document.querySelector(sel)
      )`
    );
    await setVal('eng-name', 'Internal PT');
    const phaseTicked = await window.webContents.executeJavaScript(`(() => {
      const cb = document.querySelector('#phase-0');
      if (!cb) return false;
      cb.click();
      return true;
    })()`);
    await sleep(300);
    report.engageChecklist = Boolean(
      phaseTicked &&
        (await window.webContents.executeJavaScript(`!!document.querySelector('#phase-0')?.checked`))
    );
    const phaseCountBefore = Number(
      await window.webContents.executeJavaScript(`document.querySelectorAll('.phase-row').length`)
    );
    await setVal('eng-phase-input', 'Custom phase');
    await clickJs('#eng-add-phase');
    report.engagePhaseAdd = await waitJs(
      `document.querySelectorAll('.phase-row').length === ${phaseCountBefore + 1} &&
       [...document.querySelectorAll('.phase-row')].some((r) => (r.textContent ?? '').includes('Custom phase'))`
    );
    report.phaseTable = await waitJs(
      `!!document.querySelector('.phase-table') &&
       document.querySelectorAll('.phase-table .phase-row').length >= 2`
    );
    await clickJs('#eng-generate');
    await clickJs('#nav-board');
    report.engageGenerate = await waitJs(
      `[...document.querySelectorAll('.card')].some((c) => (c.textContent ?? '').includes('[Eng]'))`,
      40
    );

    // back to the registry: the saved engagement shows up as a card
    await clickJs('#nav-engage');
    report.engageBackToList = await waitJs(
      `!!document.querySelector('#eng-name') && !!document.querySelector('#eng-back')`
    );
    await clickJs('#eng-back');
    report.engageCardShown = await waitJs(
      `[...document.querySelectorAll('.eng-row')].some((c) => (c.textContent ?? '').includes('Internal PT'))`
    );
    report.engPager = await waitJs(
      `!!document.querySelector('#eng-pager') &&
       !!document.querySelector('#eng-size') &&
       document.querySelector('#eng-next')?.disabled === true`
    );

    // scope export lives in the reports hub — the engagement is selectable there
    await clickJs('#nav-reports');
    report.reportsScopeSelect = await waitJs(`(() => {
      const sel = document.querySelector('#rep-eng-select');
      const btn = document.querySelector('#rep-scope-xlsx');
      return Boolean(sel) && sel.options.length >= 1 && Boolean(btn) && !btn.disabled;
    })()`);

    // --- command vault: view, search, copy, palette ----------------------
    await clickJs('#nav-cmds');
    report.commandsView = await waitJs(`!!document.querySelector('#commands-view')`);
    // pagination:10 rows per page by default, next/prev paging, size selector
    report.cmdPagerRows = await waitJs(
      `document.querySelectorAll('.cmd-row').length === 10 &&
       (document.querySelector('#cmdv-range')?.textContent ?? '').includes('1–10 of 202')`
    );
    await clickJs('#cmdv-next');
    report.cmdPagerNext = await waitJs(
      `(document.querySelector('#cmdv-range')?.textContent ?? '').includes('11–20 of 202') &&
       document.querySelectorAll('.cmd-row').length === 10`
    );
    await clickJs('#cmdv-prev');
    await setVal('cmdv-size', '25');
    report.cmdPagerSize = await waitJs(
      `document.querySelectorAll('.cmd-row').length === 25 &&
       (document.querySelector('#cmdv-range')?.textContent ?? '').includes('1–25 of 202')`
    );
    await setVal('cmdv-size', '10');
    // sidebar sub-options jump straight into a category
    await clickJs('#nav-cmds-cloud');
    report.cmdSubNav = await waitJs(
      `document.querySelectorAll('.cmd-gr-domain').length === 1 &&
       (document.querySelector('.cmd-gr-domain')?.textContent ?? '').includes('Cloud Pentest')`
    );
    await clickJs('#nav-cmds');
    await setVal('cmd-search', 'port scanning');
    report.cmdSearch = await waitJs(
      `document.querySelectorAll('.cmd-row').length >= 5 &&
       (document.querySelector('.cmd-groups')?.textContent ?? '').toLowerCase().includes('nmap')`
    );
    await clickJs('#cmdv-copy-0');
    report.cmdCopyFeedback = await waitJs(
      `(document.querySelector('#cmdv-copy-0')?.textContent ?? '').includes('Copied')`,
      30
    );
    await clickJs('#cmd-vault');
    report.cmdPalette = await waitJs(`!!document.querySelector('#cmd-palette')`);
    await setVal('cmd-palette-search', 'smb');
    report.cmdPaletteSearch = await waitJs(
      `document.querySelectorAll('#cmd-palette .cmd-card').length >= 3`
    );
    await window.webContents.executeJavaScript(
      `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`
    );
    report.cmdPaletteClosed = await waitJs(`!document.querySelector('#cmd-palette')`);

    // --- custom commands: add, search, delete ------------------------------
    await setVal('cmd-search', '');
    await clickJs('#cmd-add-toggle');
    report.cmdAddForm = await waitJs(`!!document.querySelector('#cmd-new-title')`);
    await setVal('cmd-new-title', 'My custom scan');
    await setVal('cmd-new-command', 'nmap -sV --my-flag target');
    await setVal('cmd-new-description', 'Totally custom workflow');
    await setVal('cmd-new-tags', 'custom,zzq');
    await clickJs('#cmd-new-save');
    report.cmdCustomAdded = await waitJs(
      `[...document.querySelectorAll('.cmd-row')].some((c) => (c.textContent ?? '').includes('My custom scan'))`
    );
    await setVal('cmd-search', 'zzq');
    report.cmdCustomSearchUI = await waitJs(
      `document.querySelectorAll('.cmd-row').length >= 1 &&
       [...document.querySelectorAll('.cmd-row')].some((c) => (c.textContent ?? '').includes('My custom scan'))`
    );
    await window.webContents.executeJavaScript(
      `document.querySelector('[id^="cmdv-del-"]')?.click(); true`
    );
    report.cmdCustomDeleted = await waitJs(
      `![...document.querySelectorAll('.cmd-row')].some((c) => (c.textContent ?? '').includes('My custom scan'))`
    );
    await setVal('cmd-search', '');

    // --- reference library: view, seed, record, search, filter, delete ----
    await clickJs('#nav-refs');
    report.referencesView = await waitJs(`!!document.querySelector('#references-view')`);
    report.refsSeeded = await waitJs(`document.querySelectorAll('.ref-row').length >= 10`);
    report.refOpenBtn = await waitJs(`!!document.querySelector('[id^="refv-open-"]')`);
    // pagination: page 1 shows 10 of the 15 seeded references, next pages through
    report.refPagerRows = await waitJs(
      `document.querySelectorAll('.ref-row').length === 10 &&
       (document.querySelector('#refv-range')?.textContent ?? '').includes('1–10 of 15')`
    );
    await clickJs('#refv-next');
    report.refPagerNext = await waitJs(
      `(document.querySelector('#refv-range')?.textContent ?? '').includes('11–15 of 15') &&
       document.querySelectorAll('.ref-row').length === 5`
    );
    await clickJs('#refv-prev');
    report.refPagerBack = await waitJs(
      `(document.querySelector('#refv-range')?.textContent ?? '').includes('1–10 of 15')`
    );

    await clickJs('#ref-add-toggle');
    report.refAddForm = await waitJs(`!!document.querySelector('#ref-new-title')`);
    await setVal('ref-new-title', 'My lab notes');
    await setVal('ref-new-url', 'example.com/lab-notes');
    await setVal('ref-new-category', 'Network & tools');
    await setVal('ref-new-notes', 'zzreflink');
    await clickJs('#ref-new-save');
    report.refAdded = await waitJs(
      `[...document.querySelectorAll('.ref-row')].some((c) => (c.textContent ?? '').includes('My lab notes'))`
    );
    report.refUrlNormalized = await waitJs(
      `[...document.querySelectorAll('.ref-url')].some((el) => (el.textContent ?? '').includes('https://example.com/lab-notes'))`
    );

    await setVal('ref-search', 'zzreflink');
    report.refSearch = await waitJs(
      `document.querySelectorAll('.ref-row').length === 1 &&
       [...document.querySelectorAll('.ref-row')].some((c) => (c.textContent ?? '').includes('My lab notes'))`
    );

    await window.webContents.executeJavaScript(
      `document.querySelector('[id^="refv-del-"]')?.click(); true`
    );
    report.refDeleted = await waitJs(
      `![...document.querySelectorAll('.ref-row')].some((c) => (c.textContent ?? '').includes('My lab notes'))`
    );
    await setVal('ref-search', '');

    await window.webContents.executeJavaScript(
      `[...document.querySelectorAll('.cmd-chip')].find((c) => (c.textContent ?? '') === 'Cheat sheets')?.click(); true`
    );
    report.refChipFilter = await waitJs(
      `document.querySelectorAll('.ref-row').length >= 4 &&
       [...document.querySelectorAll('.ref-cat')].every((el) => (el.textContent ?? '') === 'Cheat sheets')`
    );
    await window.webContents.executeJavaScript(
      `[...document.querySelectorAll('.cmd-chip')].find((c) => (c.textContent ?? '') === 'All')?.click(); true`
    );
    report.refChipCleared = await waitJs(`document.querySelectorAll('.ref-row').length >= 10`);

    await clickJs('#nav-vault');
    const vaultSetupView = await waitFor((p) => p.vaultSetup);
    report.vaultTab = vaultSetupView?.vaultSetup === true;

    // the vault needs both a secret key and a different action password
    await setVal('vault-secret', 'OpenSesame9');
    await setVal('vault-secret2', 'OpenSesame9');
    await setVal('vault-action', 'ActionKey9');
    await setVal('vault-action2', 'ActionKey9');
    await clickJs('#vault-create');
    const vaultOpen = await waitFor((p) => p.vaultOpen);
    report.vaultKeyCreated = vaultOpen?.vaultOpen === true;

    // adding an entry is saved only after confirming the action password
    await clickJs('#vault-add');
    const vaultModal = await waitFor((p) => p.modal);
    report.vaultModal = vaultModal?.modal === true;
    await setVal('vault-label', 'Portal admin');
    await setVal('vault-username', 'lionel');
    await setVal('vault-password', 'S3cretPass!');
    await setVal('vault-notes', 'Primary admin account for the Kionda portal.');
    await clickJs('#vault-save');
    const saveAction = await waitFor((p) => p.actionModal);
    report.vaultSaveActionGate = saveAction?.actionModal === true;

    await setVal('action-password', 'wrong-action');
    await clickJs('#action-confirm');
    report.vaultActionBadUI = await waitJs(`!!document.querySelector('#action-error')`);

    await setVal('action-password', 'ActionKey9');
    await clickJs('#action-confirm');
    const vaultSaved = await waitFor((p) => !p.modal && p.vaultOpen);
    report.vaultEntryAdded =
      vaultSaved !== null &&
      (await window.webContents.executeJavaScript(
        `document.querySelector('.vault-item-title b')?.textContent === 'Portal admin'`
      ));
    report.vaultNotesShown = await waitJs(
      `(document.querySelector('.vault-notes')?.textContent ?? '').includes('Primary admin account')`
    );
    try {
      window.show();
      await sleep(500);
      const shot = await Promise.race([
        window.webContents.capturePage(),
        new Promise<never>((_resolve, reject) =>
          setTimeout(() => reject(new Error('capture timeout')), 3000)
        )
      ]);
      await writeFile(join(tmpdir(), 'planner-vault.png'), shot.toPNG());
      window.hide();
    } catch {
      /* screenshot is best-effort */
    }

    // search box narrows and clears the list
    await setVal('vault-filter', 'zzz-nomatch');
    report.vaultFilterEmpty = await waitJs(
      `!document.querySelector('.vault-item') && !!document.querySelector('#vault-no-match')`
    );
    await setVal('vault-filter', 'portal');
    report.vaultFilterMatch = await waitJs(`!!document.querySelector('.vault-item')`);
    await setVal('vault-filter', '');
    report.vaultFilterCleared = await waitJs(
      `!!document.querySelector('.vault-item') && !document.querySelector('#vault-no-match')`
    );
    report.vaultPager = await waitJs(
      `!!document.querySelector('#vault-pager') &&
       !!document.querySelector('#vault-size') &&
       document.querySelector('#vault-next')?.disabled === true`
    );

    // copying the vault secret key itself asks for the action password
    await clickJs('#vault-copy-key');
    const copyKeyAction = await waitFor((p) => p.actionModal);
    report.vaultCopyKeyActionGate = copyKeyAction?.actionModal === true;
    await setVal('action-password', 'ActionKey9');
    await clickJs('#action-confirm');
    report.vaultCopyKeyUI = await waitJs(
      `(document.querySelector('#vault-copy-key')?.textContent ?? '').includes('Copied')`
    );

    // showing the password asks for the action password; the action password
    // is changed with the VAULT SECRET KEY (no login password involved)
    await clickJs('.vault-show');
    const showAction = await waitFor((p) => p.actionModal);
    report.vaultShowActionGate = showAction?.actionModal === true;
    await clickJs('#action-forgot');
    report.vaultActionForgotUI = await waitJs(`!!document.querySelector('#action-secret')`);
    await setVal('action-secret', 'wrong-key-123');
    await setVal('action-new', 'ActionKey10');
    await setVal('action-new2', 'ActionKey10');
    await clickJs('#action-reset-btn');
    report.vaultActionChangeBadUI = await waitJs(`!!document.querySelector('#action-error')`);
    await setVal('action-secret', 'OpenSesame9');
    await clickJs('#action-reset-btn');
    report.vaultActionChangeUI = await waitJs(
      `!!document.querySelector('#action-notice') && !!document.querySelector('#action-password')`
    );
    await setVal('action-password', 'ActionKey10');
    await clickJs('#action-confirm');
    report.vaultRevealShown = await waitJs(
      `document.querySelector('.vault-pass.shown')?.textContent === 'S3cretPass!'`
    );

    // copying asks again (now with the NEW action password)
    await clickJs('.vault-item-actions .btn:nth-child(2)');
    const copyAction = await waitFor((p) => p.actionModal);
    report.vaultCopyActionGate = copyAction?.actionModal === true;
    await setVal('action-password', 'ActionKey10');
    await clickJs('#action-confirm');
    report.vaultCopyUI = await waitJs(
      `[...document.querySelectorAll('.vault-item-actions .btn')].some(
        (b) => (b.textContent ?? '').includes('Copied')
      )`
    );

    // editing asks again, then opens the editor
    await clickJs('.vault-item-foot .btn:nth-child(1)');
    const editAction = await waitFor((p) => p.actionModal);
    report.vaultEditActionGate = editAction?.actionModal === true;
    await setVal('action-password', 'ActionKey10');
    await clickJs('#action-confirm');
    report.vaultEditUI = await waitJs(
      `!!document.querySelector('#vault-label') && !!document.querySelector('.modal')`
    );
    await window.webContents.executeJavaScript(
      `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`
    );
    await waitFor((p) => !p.modal);

    // lock, wrong key, unlock
    await clickJs('#vault-lock-now');
    const vaultLocked = await waitFor((p) => p.vaultLockCard);
    report.vaultLockCard = vaultLocked?.vaultLockCard === true;

    await setVal('vault-secret', 'wrong-key-123');
    await clickJs('#vault-unlock-btn');
    const vaultBad = await waitFor((p) => p.vaultError);
    report.vaultBadSecretUI = vaultBad?.vaultError === true;

    await setVal('vault-secret', 'OpenSesame9');
    await clickJs('#vault-unlock-btn');
    const vaultReopened = await waitFor((p) => p.vaultOpen);
    report.vaultUnlockUI = vaultReopened?.vaultOpen === true;

    // deleting asks for the action password too
    await clickJs('.vault-item-foot .btn:nth-child(2)');
    const delAction = await waitFor((p) => p.actionModal);
    report.vaultDeleteActionGate = delAction?.actionModal === true;
    await setVal('action-password', 'ActionKey10');
    await clickJs('#action-confirm');
    report.vaultDeleteUI = await waitJs(
      `!!document.querySelector('.vault-empty') && !document.querySelector('.vault-item')`
    );

    report.errors = errors;
    report.ok = Boolean(
      report.booted &&
        report.loginHidden &&
        report.boardShown &&
        report.statusButton &&
        report.statusModalOpened &&
        report.statusStep2 &&
        report.statusSubmitted &&
        report.statusApplied &&
        report.topReports &&
        report.reportsView &&
        report.reportsExportBtns &&
        report.repTable &&
        report.topReportsDash &&
        report.vaultTab &&
        report.vaultKeyCreated &&
        report.vaultModal &&
        report.vaultSaveActionGate &&
        report.vaultActionBadUI &&
        report.vaultEntryAdded &&
        report.vaultNotesShown &&
        report.vaultFilterEmpty &&
        report.vaultFilterMatch &&
        report.vaultFilterCleared &&
        report.vaultPager &&
        report.vaultCopyKeyActionGate &&
        report.vaultCopyKeyUI &&
        report.vaultShowActionGate &&
        report.vaultActionForgotUI &&
        report.vaultActionChangeBadUI &&
        report.vaultActionChangeUI &&
        report.vaultRevealShown &&
        report.vaultCopyActionGate &&
        report.vaultCopyUI &&
        report.vaultEditActionGate &&
        report.vaultEditUI &&
        report.vaultLockCard &&
        report.vaultBadSecretUI &&
        report.vaultUnlockUI &&
        report.vaultDeleteActionGate &&
        report.vaultDeleteUI &&
        report.todayPanel &&
        report.todayQuickAdd &&
        report.todayStatusModal &&
        report.todayStatusDone &&
        report.logViewShown &&
        report.logEntryShown &&
        report.logCreatedEntry &&
        report.logStatusEntry &&
        report.brandANZIKA &&
        report.assetsView &&
        report.assetImportBtn &&
        report.assetExportBtn &&
        report.assetAdded &&
        report.assetPager &&
        report.toolboxView &&
        report.cidrCalc &&
        report.encodeTool &&
        report.hashTool &&
        report.portsFilter &&
        report.engageView &&
        report.engageList &&
        report.engageCreated &&
        report.engageReportFields &&
        report.engageChecklist &&
        report.engagePhaseAdd &&
        report.phaseTable &&
        report.engageGenerate &&
        report.engageBackToList &&
        report.engageCardShown &&
        report.engPager &&
        report.reportsScopeSelect &&
        report.commandsView &&
        report.cmdPagerRows &&
        report.cmdPagerNext &&
        report.cmdPagerSize &&
        report.cmdSubNav &&
        report.cmdSearch &&
        report.cmdCopyFeedback &&
        report.cmdPalette &&
        report.cmdPaletteSearch &&
        report.cmdPaletteClosed &&
        report.cmdAddForm &&
        report.cmdCustomAdded &&
        report.cmdCustomSearchUI &&
        report.cmdCustomDeleted &&
        report.referencesView &&
        report.refsSeeded &&
        report.refOpenBtn &&
        report.refPagerRows &&
        report.refPagerNext &&
        report.refPagerBack &&
        report.refAddForm &&
        report.refAdded &&
        report.refUrlNormalized &&
        report.refSearch &&
        report.refDeleted &&
        report.refChipFilter &&
        report.refChipCleared &&
        report.modalOpened &&
        report.typed &&
        report.taskCreated
    );
  } catch (err) {
    report.ok = false;
    report.errors = errors;
    report.error = err instanceof Error ? err.message : String(err);
  }

  console.log(JSON.stringify(report));
  app.exit(report.ok === true ? 0 : 1);
}


async function runAuthSmoke(): Promise<void> {
  const report: Record<string, unknown> = { smokeAuth: true };
  const errors: string[] = [];
  await resetSmokeData();

  // Visible window: hidden windows make webContents.capturePage() hang.
  const window = createWindow(true);
  window.webContents.on('render-process-gone', (_event, details) =>
    errors.push(`renderer gone: ${details.reason}`)
  );
  window.webContents.on('did-fail-load', (_event, code, description) =>
    errors.push(`load failed: ${code} ${description}`)
  );

  const probe = (): Promise<UiProbe> =>
    window.webContents.executeJavaScript(`(() => ({
      topbar: !!document.querySelector('.topbar'),
      vulnTab: !!document.querySelector('.vuln'),
      cols: document.querySelectorAll('.day-col').length,
      cards: document.querySelectorAll('.card').length,
      modal: !!document.querySelector('.modal'),
      login: !!document.querySelector('.auth-screen'),
      error: !!document.querySelector('.form-error'),
      keyScreen: !!document.querySelector('#recovery-key-display'),
      recoveryForm: !!document.querySelector('#recovery-key'),
      dash: !!document.querySelector('.dash'),
      statusModal: !!document.querySelector('.modal-status'),
      statusStep2: !!document.querySelector('#status-step2.on'),
      keyExists: !!document.querySelector('#rotate-recovery-key'),
      vaultSetup: !!document.querySelector('#vault-setup'),
      vaultOpen: !!document.querySelector('#vault-open'),
      vaultLockCard: !!document.querySelector('#vault-lock'),
      vaultError: !!document.querySelector('#vault-error'),
      actionModal: !!document.querySelector('#action-modal'),
      logView: !!document.querySelector('#log-view')
    }))()`);

  const waitFor = async (
    test: (p: UiProbe) => boolean,
    timeoutMs = 9000
  ): Promise<UiProbe | null> => {
    const deadline = Date.now() + timeoutMs;
    let last: UiProbe | null = null;
    while (Date.now() < deadline) {
      try {
        last = await probe();
        if (test(last)) return last;
      } catch {
        /* page still loading */
      }
      await sleep(250);
    }
    return last;
  };

  const fill = (id: string, value: string): Promise<unknown> =>
    window.webContents.executeJavaScript(`(() => {
      const el = document.getElementById(${JSON.stringify(id)});
      const proto =
        el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
        : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return el.value;
    })()`);

  const submit = (): Promise<unknown> =>
    window.webContents.executeJavaScript(
      `document.querySelector('.auth-card button[type="submit"]').click()`
    );

  const snap = async (name: string): Promise<void> => {
    try {
      const image = await Promise.race([
        window.webContents.capturePage(),
        new Promise<never>((_resolve, reject) =>
          setTimeout(() => reject(new Error('capture timeout')), 3000)
        )
      ]);
      await writeFile(join(tmpdir(), name), image.toPNG());
    } catch {
      /* screenshots are best effort */
    }
  };

  try {
    // --- first run: setup form, board hidden ---------------------------
    const start = await waitFor((p) => p.login);
    await sleep(400);
    await snap('planner-setup.png');
    report.setupShown = start !== null && start.login;
    report.boardHiddenAtStart = start !== null && !start.topbar;

    // command vault reachable before login as well
    await window.webContents.executeJavaScript(
      `document.querySelector('#login-cmd-vault')?.click(); true`
    );
    await sleep(400);
    report.cmdVaultLogin = await window.webContents.executeJavaScript(
      `!!document.querySelector('#cmd-palette')`
    );
    await window.webContents.executeJavaScript(
      `document.querySelector('#cmd-palette-close')?.click(); true`
    );
    await sleep(300);
    report.cmdVaultLoginClosed = await window.webContents.executeJavaScript(
      `!document.querySelector('#cmd-palette')`
    );

    await fill('auth-user', 'tester');
    await fill('auth-pass', 'Passw0rd!');
    await fill('auth-confirm', 'Passw0rd!');
    await submit();

    // --- one-time recovery key screen ----------------------------------
    const keyScreen = await waitFor((p) => p.keyScreen);
    await sleep(300);
    await snap('planner-recovery-key.png');
    report.recoveryKeyShown = keyScreen?.keyScreen === true;
    const keyText = String(
      await window.webContents.executeJavaScript(
        `document.querySelector('#recovery-key-display')?.textContent ?? ''`
      )
    ).trim();
    report.recoveryKeyFormat = /^[0-9A-F]{4}(-[0-9A-F]{4}){7}$/.test(keyText);
    await window.webContents.executeJavaScript(`document.querySelector('#key-saved').click()`);
    await sleep(150);
    await window.webContents.executeJavaScript(`document.querySelector('#key-continue').click()`);

    const dashAfterSetup = await waitFor((p) => p.topbar && p.dash);
    report.dashShown = dashAfterSetup?.dash === true;
    await sleep(400);
    await snap('planner-dashboard.png');
    await window.webContents.executeJavaScript(`document.querySelector('#nav-board').click()`);
    const board = await waitFor((p) => p.cols === 7);
    await sleep(500);
    await snap('planner-board.png');
    report.setupWorked = report.dashShown && board !== null && board.cols === 7;

    // --- lock returns to the login screen ------------------------------
    await window.webContents.executeJavaScript(`document.querySelector('#lock-btn').click()`);
    const locked = await waitFor((p) => p.login && !p.topbar);
    report.lockWorked = locked !== null && locked.login && !locked.topbar;

    // --- wrong password keeps you out ----------------------------------
    await fill('auth-user', 'tester');
    await fill('auth-pass', 'not-the-password');
    await submit();
    const rejected = await waitFor((p) => p.error && p.login);
    report.wrongPasswordRejected = rejected !== null && rejected.error;

    // --- correct password signs in -------------------------------------
    await fill('auth-pass', 'Passw0rd!');
    await submit();
    const dashBack = await waitFor((p) => p.topbar && p.dash);
    await window.webContents.executeJavaScript(`document.querySelector('#nav-board').click()`);
    const back = await waitFor((p) => p.cols === 7);
    report.loginWorked = dashBack !== null && back !== null && back.cols === 7;

    try {
      const hasButton = await window.webContents.executeJavaScript(
        `!!document.querySelector('#new-task')`
      );
      if (hasButton) {
        await window.webContents.executeJavaScript(`document.querySelector('#new-task').click()`);
        const modalState = await waitFor((p) => p.modal);
        await sleep(300);
        await snap('planner-modal.png');
        report.modalSnapshot = modalState?.modal === true;
        if (modalState?.modal) {
          await window.webContents.executeJavaScript(
            `document.querySelector('.modal-head .btn-icon').click()`
          );
          await waitFor((p) => !p.modal);
        }
      } else {
        report.modalSnapshot = false;
      }
    } catch {
      report.modalSnapshot = false;
    }

    // --- vulnerability view + finding dialog ----------------------------
    try {
      await window.webContents.executeJavaScript(`document.querySelector('#nav-vuln').click()`);
      const vulnView = await waitFor((p) => p.vulnTab);
      await sleep(300);
      await snap('planner-vuln.png');
      report.vulnTabShown = vulnView?.vulnTab === true;
      await window.webContents.executeJavaScript(`document.querySelector('#new-finding').click()`);
      const findingDialog = await waitFor((p) => p.modal);
      await sleep(300);
      await snap('planner-vuln-modal.png');
      report.vulnModal = findingDialog?.modal === true;

      // Ctrl+V with an image on the clipboard attaches it as evidence
      if (findingDialog?.modal) {
        await window.webContents.executeJavaScript(`(() => {
          const binary = atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
          const file = new File([bytes], 'shot.png', { type: 'image/png' });
          const data = new DataTransfer();
          data.items.add(file);
          let event;
          try {
            event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
          } catch {
            event = new Event('paste', { bubbles: true, cancelable: true });
          }
          if (!event.clipboardData) Object.defineProperty(event, 'clipboardData', { value: data });
          document.querySelector('.modal').dispatchEvent(event);
          return true;
        })()`);
        await sleep(900);
        report.pasteEvidence = await window.webContents.executeJavaScript(
          `!!document.querySelector('.evidence-preview')`
        );

        // the zone shows a visible paste target; remove returns it to empty…
        await window.webContents.executeJavaScript(
          `[...document.querySelectorAll('.evidence-zone .btn')]
             .find((b) => (b.textContent ?? '').trim() === 'Remove')?.click(); true;`
        );
        await sleep(400);
        report.evidenceZoneEmpty = await window.webContents.executeJavaScript(
          `!!document.querySelector('.evidence-zone-empty') && !document.querySelector('.evidence-preview')`
        );

        // …and dragging an image file onto the zone attaches it again
        await window.webContents.executeJavaScript(`(() => {
          const binary = atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
          const file = new File([bytes], 'dropped.png', { type: 'image/png' });
          const data = new DataTransfer();
          data.items.add(file);
          const zone = document.querySelector('.evidence-zone');
          if (!zone) return false;
          const event = new Event('drop', { bubbles: true, cancelable: true });
          Object.defineProperty(event, 'dataTransfer', { value: data });
          zone.dispatchEvent(event);
          return true;
        })()`);
        await sleep(900);
        report.dropEvidence = await window.webContents.executeJavaScript(
          `!!document.querySelector('.evidence-preview')`
        );
      } else {
        report.pasteEvidence = false;
        report.evidenceZoneEmpty = false;
        report.dropEvidence = false;
      }

      // CVSS calculator, control tagging, save, SLA + status filter
      if (findingDialog?.modal) {
        try {
          await fill('finding-host', '172.28.8.50');
          await window.webContents.executeJavaScript(`(() => {
            const el = document.getElementById('finding-host');
            if (!el) return false;
            el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            return true;
          })()`);
          await fill('finding-description', 'XSS in customer search form');
          await fill('cvss-vector', 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H');
          await sleep(400);
          report.cvssScore = await window.webContents.executeJavaScript(
            `document.querySelector('#cvss-score')?.textContent === '10.0' &&
             document.querySelector('#cvss-sev')?.textContent === 'Critical' &&
             document.getElementById('finding-risk')?.value === 'Critical'`
          );
          await window.webContents.executeJavaScript(`(() => {
            const el = document.getElementById('finding-controls');
            if (!el) return false;
            const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
            setter.call(el, 'CIS 7.4');
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return el.value;
          })()`);
          await sleep(250);
          await window.webContents.executeJavaScript(
            `document.querySelector('#control-add')?.click(); true`
          );
          await sleep(250);
          report.controlTagged = await window.webContents.executeJavaScript(
            `(document.querySelector('#finding-controls-chips')?.textContent ?? '').includes('CIS 7.4')`
          );
          await window.webContents.executeJavaScript(
            `[...document.querySelectorAll('.modal-foot .btn')]
               .find((b) => (b.textContent ?? '').includes('Add finding'))?.click(); true`
          );
          const savedFinding = await waitFor((p) => !p.modal, 6000);
          report.findingSaved = savedFinding !== null;
          report.cvssBadgeShown = await window.webContents.executeJavaScript(
            `(document.querySelector('.vuln-table')?.textContent ?? '').includes('XSS in customer search form') &&
             document.querySelector('.cvss-badge')?.textContent === '10.0'`
          );
          report.slaShown = await window.webContents.executeJavaScript(
            `(() => { const s = document.querySelector('.sla'); return !!s && /\\d+d/.test(s.textContent ?? ''); })()`
          );
          await window.webContents.executeJavaScript(
            `document.querySelector('#vuln-filter [data-status="Open"]')?.click(); true`
          );
          await sleep(300);
          report.filterOpen =
            (await window.webContents.executeJavaScript(
              `document.querySelectorAll('.vuln-table tbody tr').length`
            )) >= 1;
          await window.webContents.executeJavaScript(
            `document.querySelector('#vuln-filter [data-status="Resolved"]')?.click(); true`
          );
          await sleep(300);
          report.filterEmpty = await window.webContents.executeJavaScript(
            `!!document.querySelector('.empty-vuln') &&
             (document.querySelector('.empty-vuln')?.textContent ?? '').includes('Resolved')`
          );
          await window.webContents.executeJavaScript(
            `document.querySelector('#vuln-filter [data-status="All"]')?.click(); true`
          );
        } catch {
          report.cvssScore = false;
          report.controlTagged = false;
          report.findingSaved = false;
          report.cvssBadgeShown = false;
          report.slaShown = false;
          report.filterOpen = false;
          report.filterEmpty = false;
        }
      } else {
        report.cvssScore = false;
        report.controlTagged = false;
        report.findingSaved = false;
        report.cvssBadgeShown = false;
        report.slaShown = false;
        report.filterOpen = false;
        report.filterEmpty = false;
      }

      const modalStillOpen = await window.webContents.executeJavaScript(
        `!!document.querySelector('.modal')`
      );
      if (findingDialog?.modal && modalStillOpen) {
        await window.webContents.executeJavaScript(
          `document.querySelector('.modal-head .btn-icon').click()`
        );
        await waitFor((p) => !p.modal);
      }
      await window.webContents.executeJavaScript(`document.querySelector('#nav-board').click()`);
      const backBoard = await waitFor((p) => p.cols === 7);
      report.backOnBoard = backBoard !== null && backBoard.cols === 7;
    } catch {
      report.vulnTabShown = false;
    }

    // --- forgot password: the recovery key resets it --------------------
    try {
      await window.webContents.executeJavaScript(`document.querySelector('#lock-btn').click()`);
      await waitFor((p) => p.login && !p.topbar);
      await window.webContents.executeJavaScript(
        `document.querySelector('#forgot-password').click()`
      );
      const forgot = await waitFor((p) => p.recoveryForm);
      report.recoveryFormShown = forgot?.recoveryForm === true;

      await fill('recovery-key', '0000-0000-0000-0000-0000-0000-0000-0000');
      await fill('recovery-pass', 'NewPass99!');
      await fill('recovery-confirm', 'NewPass99!');
      await submit();
      const bad = await waitFor((p) => p.error && p.recoveryForm);
      report.recoveryBadKeyRejected = bad !== null && bad.error;

      await fill('recovery-key', keyText.replace(/-/g, ''));
      await fill('recovery-pass', 'NewPass99!');
      await fill('recovery-confirm', 'NewPass99!');
      await submit();
      const recovered = await waitFor((p) => p.topbar && p.dash);
      report.recoveryWorked = recovered !== null && recovered.topbar;
      if (recovered) {
        try {
          const planAfter = await withPlanLock(() => loadPlanForSession());
          report.dataSurvivedRecovery = planAfter.tasks.length > 0;
        } catch {
          report.dataSurvivedRecovery = false;
        }
        await window.webContents.executeJavaScript(
          `document.querySelector('#lock-btn').click()`
        );
        await waitFor((p) => p.login && !p.topbar);
        await fill('auth-user', 'tester');
        await fill('auth-pass', 'Passw0rd!');
        await submit();
        const oldOut = await waitFor((p) => p.error && p.login);
        report.oldPasswordRejected = oldOut !== null && oldOut.error;
        await fill('auth-pass', 'NewPass99!');
        await submit();
        const newIn = await waitFor((p) => p.topbar && p.dash);
        report.newPasswordWorks = newIn !== null && newIn.topbar;
      } else {
        report.dataSurvivedRecovery = false;
        report.oldPasswordRejected = false;
        report.newPasswordWorks = false;
      }
    } catch {
      report.recoveryFormShown = false;
      report.recoveryBadKeyRejected = false;
      report.recoveryWorked = false;
      report.dataSurvivedRecovery = false;
      report.oldPasswordRejected = false;
      report.newPasswordWorks = false;
    }

    // --- vault: reset the secret key with the login password ------------
    try {
      const vfill = async (id: string, value: string): Promise<void> => {
        const ok = await window.webContents.executeJavaScript(`(() => {
          const el = document.getElementById(${JSON.stringify(id)});
          if (!el) return false;
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(el, ${JSON.stringify(value)});
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        })()`);
        if (!ok) throw new Error(`vault: missing input #${id}`);
      };
      const vclick = async (sel: string): Promise<void> => {
        const ok = await window.webContents.executeJavaScript(`(() => {
          const el = document.querySelector(${JSON.stringify(sel)});
          if (!el) return false;
          el.click();
          return true;
        })()`);
        if (!ok) {
          const ctx = await window.webContents.executeJavaScript(`JSON.stringify({
            setup: !!document.querySelector('#vault-setup'),
            lock: !!document.querySelector('#vault-lock'),
            open: !!document.querySelector('#vault-open'),
            forgot: !!document.querySelector('#vault-forgot'),
            back: !!document.querySelector('#vault-back-login'),
            resetForm: !!document.querySelector('#vault-login-pass'),
            err: document.querySelector('#vault-error')?.textContent ?? null
          })`);
          throw new Error(`vault: missing element ${sel} ctx=${ctx}`);
        }
      };
      const vaultErrorText = async (): Promise<string> =>
        String(
          (await window.webContents.executeJavaScript(
            `document.querySelector('#vault-error')?.textContent ?? ''`
          )) ?? ''
        ).trim();
      const waitTrue = async (js: string, ms = 5000): Promise<boolean> => {
        const deadline = Date.now() + ms;
        while (Date.now() < deadline) {
          if (await window.webContents.executeJavaScript(js)) return true;
          await sleep(200);
        }
        return false;
      };

      const forKey = await waitFor((p) => p.topbar && p.dash);
      report.loggedInForVault = forKey !== null && forKey.topbar;
      if (forKey) {
        await vclick('#nav-vault');
        const setupView = await waitFor((p) => p.vaultSetup);
        report.vaultTabAuth = setupView?.vaultSetup === true;
        if (!setupView?.vaultSetup) throw new Error('vault: setup card never rendered');

        await vfill('vault-secret', 'FirstKey99');
        await vfill('vault-secret2', 'FirstKey99');
        await vfill('vault-action', 'FirstAct99');
        await vfill('vault-action2', 'FirstAct99');
        await vclick('#vault-create');
        const open1 = await waitFor((p) => p.vaultOpen);
        if (!open1?.vaultOpen) throw new Error(`vault: create failed: ${await vaultErrorText() || 'timeout'}`);
        report.vaultCreatedAuth = true;

        // lock, then a wrong login password must not reset the key
        await vclick('#vault-lock-now');
        if (!(await waitFor((p) => p.vaultLockCard)))
          throw new Error('vault: lock card never rendered');
        await vclick('#vault-forgot');
        if (!(await waitTrue(`!!document.querySelector('#vault-login-pass')`)))
          throw new Error('vault: reset form never rendered');
        await vfill('vault-login-pass', 'not-my-password');
        await vfill('vault-new-secret', 'SecondKey99');
        await vfill('vault-new-secret2', 'SecondKey99');
        await vclick('#vault-reset');
        report.vaultResetBadPass = await waitTrue(`!!document.querySelector('#vault-error')`);

        // the real login password resets it and keeps the entries
        await vfill('vault-login-pass', 'NewPass99!');
        await vclick('#vault-reset');
        const resetOk = await waitFor((p) => p.vaultOpen);
        if (!resetOk?.vaultOpen) throw new Error(`vault: reset failed: ${await vaultErrorText() || 'timeout'}`);
        report.vaultResetWorks = true;

        // the old secret is dead, the new one opens the vault
        await vclick('#vault-lock-now');
        if (!(await waitFor((p) => p.vaultLockCard)))
          throw new Error('vault: lock card never rendered (2nd)');
        await vfill('vault-secret', 'FirstKey99');
        await vclick('#vault-unlock-btn');
        report.vaultOldSecretRejected = await waitTrue(`!!document.querySelector('#vault-error')`);

        await vfill('vault-secret', 'SecondKey99');
        await vclick('#vault-unlock-btn');
        const reopened = await waitFor((p) => p.vaultOpen);
        if (!reopened?.vaultOpen) throw new Error(`vault: unlock failed: ${await vaultErrorText() || 'timeout'}`);
        report.vaultNewSecretWorks = true;
      } else {
        report.vaultTabAuth = false;
        report.vaultCreatedAuth = false;
        report.vaultResetBadPass = false;
        report.vaultResetWorks = false;
        report.vaultOldSecretRejected = false;
        report.vaultNewSecretWorks = false;
      }
    } catch (vaultErr) {
      report.vaultDiagErr = vaultErr instanceof Error ? vaultErr.message : String(vaultErr);
      report.vaultTabAuth = report.vaultTabAuth === true;
      report.vaultCreatedAuth = report.vaultCreatedAuth === true;
      report.vaultResetBadPass = report.vaultResetBadPass === true;
      report.vaultResetWorks = report.vaultResetWorks === true;
      report.vaultOldSecretRejected = report.vaultOldSecretRejected === true;
      report.vaultNewSecretWorks = report.vaultNewSecretWorks === true;
    }

    // --- recovery key: existing-key dialog generates a fresh key --------
    try {
      const forKey = await waitFor((p) => p.topbar && !p.login);
      report.loggedInForKey = forKey !== null && forKey.topbar;
      if (forKey) {
        await window.webContents.executeJavaScript(
          `document.querySelector('#recovery-key-btn').click()`
        );
        const exists = await waitFor((p) => p.keyExists);
        report.recoveryExistsDialog = exists?.keyExists === true;
        await sleep(300);
        await snap('planner-key-dialog.png');

        if (exists?.keyExists) {
          await window.webContents.executeJavaScript(
            `document.querySelector('#rotate-recovery-key').click()`
          );
          const rotated = await waitFor((p) => p.keyScreen);
          report.recoveryKeyRotated = rotated?.keyScreen === true;

          const newKeyText = String(
            await window.webContents.executeJavaScript(
              `document.querySelector('#recovery-key-display')?.textContent ?? ''`
            )
          ).trim();
          report.newKeyFormat = /^[0-9A-F]{4}(-[0-9A-F]{4}){7}$/.test(newKeyText);
          report.newKeyDifferent = newKeyText !== '' && newKeyText !== keyText;

          // the native copy button reports success
          await window.webContents.executeJavaScript(
            `document.querySelector('.key-actions .btn').click()`
          );
          await sleep(300);
          report.keyCopiedFeedback = await window.webContents.executeJavaScript(
            `document.querySelector('.key-actions .btn')?.textContent?.includes('Copied') ?? false`
          );

          await window.webContents.executeJavaScript(
            `document.querySelector('.modal-foot .btn-yellow').click()`
          );
          await waitFor((p) => !p.keyScreen && !p.keyExists);

          // the original key no longer resets the password
          await window.webContents.executeJavaScript(
            `document.querySelector('#lock-btn').click()`
          );
          await waitFor((p) => p.login && !p.topbar);
          await window.webContents.executeJavaScript(
            `document.querySelector('#forgot-password').click()`
          );
          await waitFor((p) => p.recoveryForm);
          await fill('recovery-key', keyText.replace(/-/g, ''));
          await fill('recovery-pass', 'NewPass99!');
          await fill('recovery-confirm', 'NewPass99!');
          await submit();
          const stale = await waitFor((p) => p.error && p.recoveryForm);
          report.oldRecoveryKeyRejected = stale !== null && stale.error;
        } else {
          report.recoveryKeyRotated = false;
          report.newKeyFormat = false;
          report.newKeyDifferent = false;
          report.keyCopiedFeedback = false;
          report.oldRecoveryKeyRejected = false;
        }
      } else {
        report.recoveryExistsDialog = false;
        report.recoveryKeyRotated = false;
        report.newKeyFormat = false;
        report.newKeyDifferent = false;
        report.keyCopiedFeedback = false;
        report.oldRecoveryKeyRejected = false;
      }
    } catch {
      report.recoveryExistsDialog = false;
      report.recoveryKeyRotated = false;
      report.newKeyFormat = false;
      report.newKeyDifferent = false;
      report.keyCopiedFeedback = false;
      report.oldRecoveryKeyRejected = false;
    }

    const raw = await readFile(dataFilePath(), 'utf8');
    report.encryptedAtRest = isEncryptedEnvelope(raw);

    report.errors = errors;
    report.ok = Boolean(
      report.setupShown &&
        report.boardHiddenAtStart &&
        report.cmdVaultLogin &&
        report.cmdVaultLoginClosed &&
        report.recoveryKeyShown &&
        report.recoveryKeyFormat &&
        report.dashShown &&
        report.setupWorked &&
        report.lockWorked &&
        report.wrongPasswordRejected &&
        report.loginWorked &&
        report.modalSnapshot &&
        report.vulnTabShown &&
        report.vulnModal &&
        report.pasteEvidence &&
        report.evidenceZoneEmpty &&
        report.dropEvidence &&
        report.cvssScore &&
        report.controlTagged &&
        report.findingSaved &&
        report.cvssBadgeShown &&
        report.slaShown &&
        report.filterOpen &&
        report.filterEmpty &&
        report.backOnBoard &&
        report.recoveryFormShown &&
        report.recoveryBadKeyRejected &&
        report.recoveryWorked &&
        report.dataSurvivedRecovery &&
        report.oldPasswordRejected &&
        report.newPasswordWorks &&
        report.vaultTabAuth &&
        report.vaultCreatedAuth &&
        report.vaultResetBadPass &&
        report.vaultResetWorks &&
        report.vaultOldSecretRejected &&
        report.vaultNewSecretWorks &&
        report.recoveryExistsDialog &&
        report.recoveryKeyRotated &&
        report.newKeyFormat &&
        report.newKeyDifferent &&
        report.keyCopiedFeedback &&
        report.oldRecoveryKeyRejected &&
        report.encryptedAtRest
    );
  } catch (err) {
    report.ok = false;
    report.errors = errors;
    report.error = err instanceof Error ? err.message : String(err);
  }

  console.log(JSON.stringify(report));
  app.exit(report.ok === true ? 0 : 1);
}

void app.whenReady().then(() => {
  registerIpc();

  if (SMOKE) {
    void runSmokeTest();
    return;
  }

  if (SMOKE_UI) {
    void runUiSmoke();
    return;
  }

  if (SMOKE_AUTH) {
    void runAuthSmoke();
    return;
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Smoke suites create temporary windows (e.g. PDF rendering) — they exit
  // explicitly with their report via app.exit(), never via quit().
  if (IS_SMOKE) return;
  if (process.platform !== 'darwin') app.quit();
});
