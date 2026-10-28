import type { AssetSheetRow } from './asset';
import type {
  Asset,
  AuthResult,
  AuthStatus,
  DailyPayload,
  Engagement,
  Finding,
  RecoveryResult,
  ReportProfile,
  WeeklyPayload,
  PlanData,
  SaveFileFilter,
  VulnReport,
  VaultListResult,
  VaultRevealResult,
  VaultResult,
  VaultStatus,
  VaultUpsert
} from './types';

export type SaveResult = { ok: true; path: string } | { ok: false; error: string } | null;

export type ImportResult = { ok: true; plan: PlanData } | { ok: false; error: string } | null;

export interface ElectronAPI {
  authStatus: () => Promise<AuthStatus>;
  authSetup: (username: string, password: string) => Promise<AuthResult>;
  authLogin: (username: string, password: string) => Promise<AuthResult>;
  authLogout: () => Promise<void>;
  authRecover: (recoveryKey: string, password: string) => Promise<AuthResult>;
  authCreateRecoveryKey: () => Promise<RecoveryResult>;
  authRotateRecoveryKey: () => Promise<RecoveryResult>;
  loadPlan: () => Promise<PlanData>;
  savePlan: (data: PlanData) => Promise<void>;
  saveTextFile: (
    defaultName: string,
    content: string,
    filters: SaveFileFilter[]
  ) => Promise<SaveResult>;
  openJsonFile: () => Promise<ImportResult>;
  exportWeekly: (payload: WeeklyPayload) => Promise<SaveResult>;
  exportWeeklyPptx: (payload: WeeklyPayload) => Promise<SaveResult>;
  exportDaily: (payload: DailyPayload, format: 'xlsx' | 'pptx') => Promise<SaveResult>;
  exportVulnReport: (report: VulnReport) => Promise<SaveResult>;
  exportEngagement: (payload: {
    engagement: Engagement;
    format: 'xlsx' | 'pdf';
  }) => Promise<SaveResult>;
  exportPentestReport: (payload: {
    engagement: Engagement;
    profile: ReportProfile;
    findings: Finding[];
    format: 'pdf' | 'html';
  }) => Promise<SaveResult>;
  vaultStatus: () => Promise<VaultStatus>;
  vaultSetup: (secret: string, actionPassword: string) => Promise<VaultResult>;
  vaultUnlock: (secret: string) => Promise<VaultResult>;
  vaultLock: () => Promise<void>;
  vaultList: () => Promise<VaultListResult>;
  vaultReveal: (id: string) => Promise<VaultRevealResult>;
  vaultUpsert: (entry: VaultUpsert) => Promise<VaultResult>;
  vaultDelete: (id: string) => Promise<VaultResult>;
  vaultReset: (loginPassword: string, newSecret: string) => Promise<VaultResult>;
  vaultActionVerify: (password: string) => Promise<VaultResult>;
  vaultActionSet: (password: string) => Promise<VaultResult>;
  vaultActionReset: (secretKey: string, newPassword: string) => Promise<VaultResult>;
  pickEvidenceImage: () => Promise<string | null>;
  saveEvidence: (base64: string, mime: string) => Promise<string | null>;
  copyText: (text: string) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  hashText: (text: string) => Promise<Record<string, string>>;
  openScanCsv: () => Promise<{ name: string; text: string } | null>;
  openAssetSheet: () => Promise<{ name: string; rows: AssetSheetRow[] } | null>;
  exportAssetSheet: (assets: Asset[]) => Promise<SaveResult>;
  getDataFilePath: () => Promise<string>;
}

declare global {
  interface Window {
    planner: ElectronAPI;
  }
}
