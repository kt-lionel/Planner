import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from '../shared/api';
import type { WeeklyPayload, DailyPayload, PlanData, SaveFileFilter, VulnReport, VaultUpsert, Engagement, Finding, ReportProfile, Asset } from '../shared/types';

const api: ElectronAPI = {
  authStatus: () => ipcRenderer.invoke('auth:status'),
  authSetup: (username: string, password: string) =>
    ipcRenderer.invoke('auth:setup', username, password),
  authLogin: (username: string, password: string) =>
    ipcRenderer.invoke('auth:login', username, password),
  authLogout: () => ipcRenderer.invoke('auth:logout'),
  authRecover: (recoveryKey: string, password: string) =>
    ipcRenderer.invoke('auth:recover', recoveryKey, password),
  authCreateRecoveryKey: () => ipcRenderer.invoke('auth:recovery-key'),
  authRotateRecoveryKey: () => ipcRenderer.invoke('auth:rotate-recovery-key'),
  loadPlan: () => ipcRenderer.invoke('plan:load'),
  savePlan: (data: PlanData) => ipcRenderer.invoke('plan:save', data),
  saveTextFile: (defaultName: string, content: string, filters: SaveFileFilter[]) =>
    ipcRenderer.invoke('file:saveText', defaultName, content, filters),
  openJsonFile: () => ipcRenderer.invoke('file:openJson'),
  exportWeekly: (payload: WeeklyPayload) =>
    ipcRenderer.invoke('report:export-weekly', payload),
  exportWeeklyPptx: (payload: WeeklyPayload) =>
    ipcRenderer.invoke('report:export-pptx', payload),
  exportDaily: (payload: DailyPayload, format: 'xlsx' | 'pptx') =>
    ipcRenderer.invoke('report:export-daily', payload, format),
  exportVulnReport: (report: VulnReport) => ipcRenderer.invoke('report:export-vuln', report),
  exportEngagement: (payload: { engagement: Engagement; format: 'xlsx' | 'pdf' }) =>
    ipcRenderer.invoke('report:export-engagement', payload),
  exportPentestReport: (payload: {
    engagement: Engagement;
    profile: ReportProfile;
    findings: Finding[];
    format: 'pdf' | 'html';
  }) => ipcRenderer.invoke('report:export-pentest', payload),
  vaultStatus: () => ipcRenderer.invoke('vault:status'),
  vaultSetup: (secret: string, actionPassword: string) =>
    ipcRenderer.invoke('vault:setup', secret, actionPassword),
  vaultUnlock: (secret: string) => ipcRenderer.invoke('vault:unlock', secret),
  vaultLock: () => ipcRenderer.invoke('vault:lock'),
  vaultList: () => ipcRenderer.invoke('vault:list'),
  vaultReveal: (id: string) => ipcRenderer.invoke('vault:reveal', id),
  vaultUpsert: (entry: VaultUpsert) => ipcRenderer.invoke('vault:upsert', entry),
  vaultDelete: (id: string) => ipcRenderer.invoke('vault:delete', id),
  vaultReset: (loginPassword: string, newSecret: string) =>
    ipcRenderer.invoke('vault:reset', loginPassword, newSecret),
  vaultActionVerify: (password: string) => ipcRenderer.invoke('vault:action-verify', password),
  vaultActionSet: (password: string) => ipcRenderer.invoke('vault:action-set', password),
  vaultActionReset: (secretKey: string, newPassword: string) =>
    ipcRenderer.invoke('vault:action-reset', secretKey, newPassword),
  pickEvidenceImage: () => ipcRenderer.invoke('report:pick-evidence'),
  saveEvidence: (base64: string, mime: string) =>
    ipcRenderer.invoke('report:save-evidence', base64, mime),
  copyText: (text: string) => ipcRenderer.invoke('app:copyText', text),
  openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
  hashText: (text: string) => ipcRenderer.invoke('app:hashText', text),
  openScanCsv: () => ipcRenderer.invoke('file:openScanCsv'),
  openAssetSheet: () => ipcRenderer.invoke('file:openAssetSheet'),
  exportAssetSheet: (assets: Asset[]) => ipcRenderer.invoke('file:saveAssetSheet', assets),
  getDataFilePath: () => ipcRenderer.invoke('app:dataPath')
};

contextBridge.exposeInMainWorld('planner', api);
