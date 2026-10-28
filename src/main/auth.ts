import { app } from 'electron';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual
} from 'crypto';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import type { AuthFile, AuthResult, AuthStatus, KeyEnvelope, PlanData, RecoveryResult } from '../shared/types';

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const MIN_PASSWORD = 6;

interface Session {
  username: string;
  key: Buffer;
}

let session: Session | null = null;
let failedAttempts = 0;

function authPath(): string {
  return join(app.getPath('userData'), 'auth.json');
}

export function derive(password: string, salt: Buffer, keylen: number): Buffer {
  return scryptSync(password, salt, keylen, SCRYPT_PARAMS);
}

export function encryptionSalt(salt: Buffer): Buffer {
  return Buffer.concat([salt, Buffer.from('enc', 'utf8')]);
}

function sealKey(plain: Buffer, key: Buffer): KeyEnvelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ct: ct.toString('base64')
  };
}

function openKey(env: KeyEnvelope, key: Buffer): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(env.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(env.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(env.ct, 'base64')), decipher.final()]);
}

function generateRecoveryKey(): string {
  const hex = randomBytes(16).toString('hex').toUpperCase();
  return hex.replace(/(.{4})(?=.)/g, '$1-');
}

function normalizeRecoveryKey(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-F]/g, '');
}

async function readAuthFile(): Promise<AuthFile | null> {
  try {
    const raw = await readFile(authPath(), 'utf8');
    const parsed = JSON.parse(raw) as AuthFile;
    if (!parsed || typeof parsed.username !== 'string' || typeof parsed.verifier !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeAuthFile(file: AuthFile): Promise<void> {
  const path = authPath();
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(file, null, 2), 'utf8');
  await rename(tmp, path);
}

export async function authStatus(): Promise<AuthStatus> {
  const file = await readAuthFile();
  return {
    needsSetup: file === null,
    authenticated: session !== null,
    username: session?.username ?? file?.username ?? null,
    hasRecovery: file !== null && file.recovery !== undefined
  };
}

export async function setupUser(username: string, password: string): Promise<AuthResult> {
  const name = username.trim();
  if (name.length < 2) return { ok: false, error: 'Username must be at least 2 characters.' };
  if (password.length < MIN_PASSWORD) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD} characters.` };
  }
  if (await readAuthFile()) {
    return { ok: false, error: 'A profile already exists on this device.' };
  }

  const salt = randomBytes(16);
  const verifier = derive(password, salt, 64);
  const pwKey = derive(password, encryptionSalt(salt), 32);
  // The plan file is encrypted with an independent key so it can be re-wrapped
  // for a new password (recovery) without touching the plan file itself.
  const planKey = randomBytes(32);
  const recoveryKey = generateRecoveryKey();
  const recoverySalt = randomBytes(16);
  const recoveryNorm = normalizeRecoveryKey(recoveryKey);
  await writeAuthFile({
    version: 1,
    username: name,
    salt: salt.toString('base64'),
    verifier: verifier.toString('base64'),
    createdAt: new Date().toISOString(),
    wrapped: sealKey(planKey, pwKey),
    recovery: {
      salt: recoverySalt.toString('base64'),
      verifier: derive(recoveryNorm, recoverySalt, 64).toString('base64'),
      wrapped: sealKey(planKey, derive(recoveryNorm, encryptionSalt(recoverySalt), 32))
    }
  });

  session = { username: name, key: planKey };
  failedAttempts = 0;
  return { ok: true, username: name, recoveryKey };
}

export async function verifyLogin(username: string, password: string): Promise<AuthResult> {
  if (failedAttempts >= 3) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  const file = await readAuthFile();
  const fail = (error: string): AuthResult => {
    failedAttempts += 1;
    return { ok: false, error };
  };

  if (!file) return { ok: false, error: 'No profile found. Set up a password first.' };

  const name = username.trim();
  const salt = Buffer.from(file.salt, 'base64');
  const expected = Buffer.from(file.verifier, 'base64');
  const actual = derive(password, salt, expected.length);

  const nameBuf = Buffer.from(name, 'utf8');
  const storedNameBuf = Buffer.from(file.username, 'utf8');
  const usernameMatches =
    nameBuf.length === storedNameBuf.length && timingSafeEqual(nameBuf, storedNameBuf);

  if (!usernameMatches || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return fail('Invalid username or password.');
  }

  const pwKey = derive(password, encryptionSalt(salt), 32);
  let planKey: Buffer;
  if (file.wrapped) {
    try {
      planKey = openKey(file.wrapped, pwKey);
    } catch {
      return fail('Stored data key could not be unlocked.');
    }
  } else {
    // Legacy profile (created before key wrapping): the plan key IS the
    // password key. Upgrade the auth file in place.
    planKey = pwKey;
    file.wrapped = sealKey(planKey, pwKey);
    await writeAuthFile(file);
  }

  failedAttempts = 0;
  session = { username: file.username, key: planKey };
  return { ok: true, username: file.username };
}

export async function recoverAccount(
  recoveryKey: string,
  newPassword: string
): Promise<AuthResult> {
  const file = await readAuthFile();
  if (!file) return { ok: false, error: 'No profile found on this device.' };
  if (!file.recovery) {
    return {
      ok: false,
      error: 'No recovery key exists for this profile yet. Sign in and create one (key button).'
    };
  }
  if (newPassword.length < MIN_PASSWORD) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD} characters.` };
  }
  if (failedAttempts >= 3) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  const norm = normalizeRecoveryKey(recoveryKey);
  if (norm.length !== 32) {
    failedAttempts += 1;
    return { ok: false, error: 'Invalid recovery key format.' };
  }

  const recoverySalt = Buffer.from(file.recovery.salt, 'base64');
  const expected = Buffer.from(file.recovery.verifier, 'base64');
  const actual = derive(norm, recoverySalt, expected.length);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    failedAttempts += 1;
    return { ok: false, error: 'Recovery key does not match this profile.' };
  }

  let planKey: Buffer;
  try {
    planKey = openKey(file.recovery.wrapped, derive(norm, encryptionSalt(recoverySalt), 32));
  } catch {
    failedAttempts += 1;
    return { ok: false, error: 'Recovery data is damaged.' };
  }

  // Only auth.json changes: the plan file keeps its key.
  const salt = randomBytes(16);
  const verifier = derive(newPassword, salt, 64);
  const pwKey = derive(newPassword, encryptionSalt(salt), 32);
  await writeAuthFile({
    ...file,
    salt: salt.toString('base64'),
    verifier: verifier.toString('base64'),
    wrapped: sealKey(planKey, pwKey)
  });

  session = { username: file.username, key: planKey };
  failedAttempts = 0;
  return { ok: true, username: file.username };
}

export async function createRecoveryKey(): Promise<RecoveryResult> {
  const file = await readAuthFile();
  if (!file) return { ok: false, error: 'No profile found on this device.' };
  if (!session) return { ok: false, error: 'Locked: sign in first.' };
  if (file.recovery) {
    return {
      ok: false,
      error: 'A recovery key already exists — use the copy you saved for this profile.'
    };
  }

  const key = generateRecoveryKey();
  const norm = normalizeRecoveryKey(key);
  const recoverySalt = randomBytes(16);
  await writeAuthFile({
    ...file,
    recovery: {
      salt: recoverySalt.toString('base64'),
      verifier: derive(norm, recoverySalt, 64).toString('base64'),
      wrapped: sealKey(session.key, derive(norm, encryptionSalt(recoverySalt), 32))
    }
  });
  return { ok: true, key };
}

export async function rotateRecoveryKey(): Promise<RecoveryResult> {
  const file = await readAuthFile();
  if (!file) return { ok: false, error: 'No profile found on this device.' };
  if (!session) return { ok: false, error: 'Locked: sign in first.' };

  // Re-wraps the plan key under a brand-new recovery key, replacing any
  // previous one (the old key stops working immediately).
  const key = generateRecoveryKey();
  const norm = normalizeRecoveryKey(key);
  const recoverySalt = randomBytes(16);
  await writeAuthFile({
    ...file,
    recovery: {
      salt: recoverySalt.toString('base64'),
      verifier: derive(norm, recoverySalt, 64).toString('base64'),
      wrapped: sealKey(session.key, derive(norm, encryptionSalt(recoverySalt), 32))
    }
  });
  return { ok: true, key };
}

export function endSession(): void {
  session = null;
}

/** Checks a password against the stored verifier of the signed-in profile. */
export async function verifyCurrentPassword(password: string): Promise<boolean> {
  if (!session) return false;
  const file = await readAuthFile();
  if (!file) return false;
  const salt = Buffer.from(file.salt, 'base64');
  const expected = Buffer.from(file.verifier, 'base64');
  const actual = derive(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function getSession(): Session | null {
  return session;
}

export function randomSession(username: string): Buffer {
  const key = randomBytes(32);
  session = { username, key };
  return key;
}

export function isEncryptedEnvelope(raw: string): boolean {
  try {
    const env = JSON.parse(raw) as { iv?: string; tag?: string; ct?: string };
    return Boolean(env && env.iv && env.tag && env.ct);
  } catch {
    return false;
  }
}

export function encryptPlan(plan: PlanData, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(plan), 'utf8'), cipher.final()]);
  return JSON.stringify(
    {
      v: 1,
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ct: ciphertext.toString('base64')
    },
    null,
    2
  );
}

export function decryptPlan(raw: string, key: Buffer): PlanData {
  const env = JSON.parse(raw) as { iv: string; tag: string; ct: string };
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(env.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(env.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(env.ct, 'base64')),
    decipher.final()
  ]).toString('utf8');
  const plan = JSON.parse(plaintext) as PlanData;
  if (!plan || !Array.isArray(plan.tasks)) throw new Error('Decrypted file is not a valid plan.');
  return plan;
}
