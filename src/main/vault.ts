import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import type {
  VaultEntry,
  VaultEntryView,
  VaultListResult,
  VaultRevealResult,
  VaultResult,
  VaultStatus,
  VaultUpsert
} from '../shared/types';
import { getSession, verifyCurrentPassword } from './auth';
import { loadPlanForSession, savePlanForSession } from './store';

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const MIN_SECRET = 6;
/** The vault relocks this long after every unlock. */
export const UNLOCK_MS = 5 * 60 * 1000;
/**
 * After a successful action-password check, reveal/copy/edit/delete may run
 * for this long before the action password is asked for again.
 */
export const ACTION_MS = 60 * 1000;

let unlockedUntil = 0;
let actionUntil = 0;

function deriveSecret(secret: string, salt: Buffer, keylen: number): Buffer {
  return scryptSync(secret, salt, keylen, SCRYPT_PARAMS);
}

function now(): string {
  return new Date().toISOString();
}

function uid(): string {
  return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function unlocked(): boolean {
  return Date.now() < unlockedUntil;
}

function actionOk(): boolean {
  return Date.now() < actionUntil;
}

function lockedOut(): { ok: false; error: string } {
  return { ok: false, error: 'Locked: sign in first.' };
}

export function lockVault(): void {
  unlockedUntil = 0;
  actionUntil = 0;
}

const LOCKED_ERROR = 'Vault is locked. Enter your secret key to view saved passwords.';

const LOCKED_VIEW = { ok: false, error: LOCKED_ERROR } as const;

const ACTION_ERROR = 'Action password required.';

function actionNeeded(message = ACTION_ERROR): { ok: false; error: string; needsAction: true } {
  return { ok: false, error: message, needsAction: true };
}

function verifyScrypt(
  candidate: string,
  stored: { salt: string; verifier: string } | undefined
): boolean {
  if (!stored) return false;
  const salt = Buffer.from(stored.salt, 'base64');
  const expected = Buffer.from(stored.verifier, 'base64');
  const actual = deriveSecret(candidate, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function vaultStatus(): Promise<VaultStatus> {
  if (!getSession()) throw new Error('Locked: sign in first.');
  const plan = await loadPlanForSession();
  return {
    configured: Boolean(plan.vault?.key),
    unlocked: unlocked(),
    remainingMs: Math.max(0, unlockedUntil - Date.now()),
    count: plan.vault?.entries.length ?? 0,
    hasAction: Boolean(plan.vault?.action)
  };
}

export async function vaultSetup(secret: string, actionPassword: string): Promise<VaultResult> {
  if (!getSession()) return lockedOut();
  if (secret.length < MIN_SECRET) {
    return { ok: false, error: `Secret key must be at least ${MIN_SECRET} characters.` };
  }
  if (actionPassword.length < MIN_SECRET) {
    return { ok: false, error: `Action password must be at least ${MIN_SECRET} characters.` };
  }
  if (actionPassword === secret) {
    return { ok: false, error: 'The action password must be different from the secret key.' };
  }
  const plan = await loadPlanForSession();
  if (plan.vault?.key) {
    return { ok: false, error: 'A secret key is already set. Use "Forgot secret key?" instead.' };
  }
  const keySalt = randomBytes(16);
  const actionSalt = randomBytes(16);
  plan.vault = {
    key: {
      salt: keySalt.toString('base64'),
      verifier: deriveSecret(secret, keySalt, 64).toString('base64')
    },
    action: {
      salt: actionSalt.toString('base64'),
      verifier: deriveSecret(actionPassword, actionSalt, 64).toString('base64')
    },
    entries: plan.vault?.entries ?? []
  };
  await savePlanForSession(plan);
  unlockedUntil = Date.now() + UNLOCK_MS;
  actionUntil = 0;
  return { ok: true };
}

export async function vaultUnlock(secret: string): Promise<VaultResult> {
  if (!getSession()) return lockedOut();
  const plan = await loadPlanForSession();
  const stored = plan.vault?.key;
  if (!stored) return { ok: false, error: 'No secret key set yet.' };
  if (!verifyScrypt(secret, stored)) {
    return { ok: false, error: 'Incorrect secret key.' };
  }
  unlockedUntil = Date.now() + UNLOCK_MS;
  actionUntil = 0;
  return { ok: true };
}

/**
 * Verifies the action password (different from the vault secret key) and
 * opens a short window in which reveal/copy/edit/delete may run.
 */
export async function vaultActionVerify(password: string): Promise<VaultResult> {
  if (!getSession()) return lockedOut();
  if (!unlocked()) return { ok: false, error: LOCKED_ERROR };
  const plan = await loadPlanForSession();
  if (!plan.vault?.key) return { ok: false, error: 'No secret key set yet.' };
  if (!plan.vault.action) return actionNeeded('No action password set yet.');
  if (!verifyScrypt(password, plan.vault.action)) {
    return { ok: false, error: 'Incorrect action password.' };
  }
  actionUntil = Date.now() + ACTION_MS;
  return { ok: true };
}

/** First-time creation of the action password (vaults made before it existed). */
export async function vaultActionSet(password: string): Promise<VaultResult> {
  if (!getSession()) return lockedOut();
  if (!unlocked()) return { ok: false, error: LOCKED_ERROR };
  if (password.length < MIN_SECRET) {
    return { ok: false, error: `Action password must be at least ${MIN_SECRET} characters.` };
  }
  const plan = await loadPlanForSession();
  if (!plan.vault?.key) return { ok: false, error: 'No secret key set yet.' };
  if (plan.vault.action) {
    return { ok: false, error: 'An action password is already set. Use reset instead.' };
  }
  const salt = randomBytes(16);
  plan.vault.action = {
    salt: salt.toString('base64'),
    verifier: deriveSecret(password, salt, 64).toString('base64')
  };
  await savePlanForSession(plan);
  return { ok: true };
}

/**
 * Changes the action password after confirming the vault secret key — the
 * login password is not involved (it can only reset the secret key itself).
 */
export async function vaultActionReset(
  secretKey: string,
  newPassword: string
): Promise<VaultResult> {
  if (!getSession()) return lockedOut();
  if (!unlocked()) return { ok: false, error: LOCKED_ERROR };
  if (newPassword.length < MIN_SECRET) {
    return { ok: false, error: `Action password must be at least ${MIN_SECRET} characters.` };
  }
  const plan = await loadPlanForSession();
  if (!plan.vault?.key) return { ok: false, error: 'No secret key set yet.' };
  if (!verifyScrypt(secretKey, plan.vault.key)) {
    return { ok: false, error: 'Incorrect secret key.' };
  }
  const salt = randomBytes(16);
  plan.vault.action = {
    salt: salt.toString('base64'),
    verifier: deriveSecret(newPassword, salt, 64).toString('base64')
  };
  await savePlanForSession(plan);
  actionUntil = 0;
  return { ok: true };
}

export async function vaultList(): Promise<VaultListResult> {
  if (!getSession()) return lockedOut();
  if (!unlocked()) return LOCKED_VIEW;
  const plan = await loadPlanForSession();
  const entries: VaultEntryView[] = (plan.vault?.entries ?? []).map((e) => ({
    id: e.id,
    label: e.label,
    username: e.username,
    url: e.url,
    notes: e.notes,
    updatedAt: e.updatedAt
  }));
  return { ok: true, entries };
}

export async function vaultReveal(id: string): Promise<VaultRevealResult> {
  if (!getSession()) return lockedOut();
  if (!unlocked()) return LOCKED_VIEW;
  const plan = await loadPlanForSession();
  if (!plan.vault?.action) return actionNeeded('No action password set yet.');
  if (!actionOk()) return actionNeeded();
  const entry = plan.vault.entries.find((e) => e.id === id);
  if (!entry) return { ok: false, error: 'Entry not found.' };
  return { ok: true, password: entry.password };
}

export async function vaultUpsert(input: VaultUpsert): Promise<VaultResult> {
  if (!getSession()) return lockedOut();
  if (!unlocked()) return { ok: false, error: LOCKED_ERROR };
  const label = input.label.trim();
  if (!label) return { ok: false, error: 'A label is required.' };
  const plan = await loadPlanForSession();
  const vault = plan.vault;
  if (!vault?.key) return { ok: false, error: 'No secret key set yet.' };
  if (!vault.action) return actionNeeded('No action password set yet.');
  if (!actionOk()) return actionNeeded();

  const existing = input.id ? vault.entries.find((e) => e.id === input.id) : undefined;
  const password = input.password?.length ? input.password : existing?.password;
  if (!password) return { ok: false, error: 'A password is required.' };

  const stamp = now();
  const entry: VaultEntry = {
    id: existing?.id ?? uid(),
    label,
    username: input.username.trim(),
    password,
    url: input.url?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    createdAt: existing?.createdAt ?? stamp,
    updatedAt: stamp
  };
  vault.entries = existing
    ? vault.entries.map((e) => (e.id === entry.id ? entry : e))
    : [...vault.entries, entry];
  await savePlanForSession(plan);
  return { ok: true };
}

export async function vaultDelete(id: string): Promise<VaultResult> {
  if (!getSession()) return lockedOut();
  if (!unlocked()) return { ok: false, error: LOCKED_ERROR };
  const plan = await loadPlanForSession();
  if (!plan.vault) return { ok: false, error: 'Vault is empty.' };
  if (!plan.vault.action) return actionNeeded('No action password set yet.');
  if (!actionOk()) return actionNeeded();
  plan.vault.entries = plan.vault.entries.filter((e) => e.id !== id);
  await savePlanForSession(plan);
  return { ok: true };
}

/**
 * Resets the secret key after confirming the account password — the entries
 * themselves are untouched (they live inside the encrypted plan).
 */
export async function vaultReset(
  loginPassword: string,
  newSecret: string
): Promise<VaultResult> {
  if (!getSession()) return lockedOut();
  if (newSecret.length < MIN_SECRET) {
    return { ok: false, error: `Secret key must be at least ${MIN_SECRET} characters.` };
  }
  const passwordOk = await verifyCurrentPassword(loginPassword);
  if (!passwordOk) return { ok: false, error: 'Incorrect login password.' };
  const plan = await loadPlanForSession();
  const salt = randomBytes(16);
  plan.vault = {
    key: { salt: salt.toString('base64'), verifier: deriveSecret(newSecret, salt, 64).toString('base64') },
    action: plan.vault?.action,
    entries: plan.vault?.entries ?? []
  };
  await savePlanForSession(plan);
  unlockedUntil = Date.now() + UNLOCK_MS;
  actionUntil = 0;
  return { ok: true };
}
