import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { VaultEntryView, VaultStatus, VaultUpsert } from '@shared/types';
import VaultModal from './VaultModal';
import ActionModal, { type ActionKind } from './ActionModal';
import TablePager from './TablePager';

type Mode = 'setup' | 'action-setup' | 'locked' | 'open';

type SaveOutcome = 'saved' | 'retry' | string;

const AVATAR_COLORS = ['#3b82f6', '#34d399', '#facc15', '#f87171', '#a78bfa', '#f97316'];

function hostOf(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0] || undefined;
  }
}

function shortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export default function VaultView() {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [entries, setEntries] = useState<VaultEntryView[]>([]);
  const [secret, setSecret] = useState('');
  const [secret2, setSecret2] = useState('');
  const [actionPw, setActionPw] = useState('');
  const [actionPw2, setActionPw2] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [newSecret, setNewSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lockHint, setLockHint] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ entry: VaultEntryView | null } | null>(null);
  const [actionFor, setActionFor] = useState<{ kind: ActionKind; label: string; entry?: VaultEntryView } | null>(null);
  const [pendingSave, setPendingSave] = useState<VaultUpsert | null>(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const [keyCopied, setKeyCopied] = useState(false);
  const secretRef = useRef<HTMLInputElement>(null);
  const actionRef = useRef<HTMLInputElement>(null);
  const relockTimer = useRef<number | undefined>(undefined);
  const copyTimer = useRef<number | undefined>(undefined);
  const keyTimer = useRef<number | undefined>(undefined);
  // the plaintext secret key only lives here for as long as the vault is open
  // (captured at setup/unlock/reset, cleared on lock) so it can be copied
  const secretKeyRef = useRef('');

  const mode: Mode = !status?.configured
    ? 'setup'
    : !status.unlocked
      ? 'locked'
      : !status.hasAction
        ? 'action-setup'
        : 'open';

  const refresh = useCallback(async () => {
    try {
      const next = await window.planner.vaultStatus();
      setStatus(next);
      if (next.unlocked) {
        const list = await window.planner.vaultList();
        setEntries(list.ok ? list.entries : []);
      } else {
        setEntries([]);
        setRevealed({});
      }
      window.clearTimeout(relockTimer.current);
      if (next.unlocked) {
        relockTimer.current = window.setTimeout(() => void refresh(), next.remainingMs + 200);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      window.clearTimeout(relockTimer.current);
      window.clearTimeout(copyTimer.current);
    };
  }, [refresh]);

  useEffect(() => {
    setActionFor(null);
    setPendingSave(null);
    if (mode === 'locked') {
      setSecret('');
      setQuery('');
      setError(null);
      setKeyCopied(false);
      secretKeyRef.current = '';
      const t = window.setTimeout(() => secretRef.current?.focus(), 60);
      return () => window.clearTimeout(t);
    }
    if (mode === 'action-setup') {
      const t = window.setTimeout(() => actionRef.current?.focus(), 60);
      return () => window.clearTimeout(t);
    }
    setError(null);
    setResetting(false);
    setLockHint(null);
    return undefined;
  }, [mode]);

  const createKey = async (): Promise<void> => {
    setError(null);
    if (secret.length < 6) {
      setError('Secret key must be at least 6 characters.');
      return;
    }
    if (secret !== secret2) {
      setError('The two secret keys do not match.');
      return;
    }
    if (actionPw.length < 6) {
      setError('Action password must be at least 6 characters.');
      return;
    }
    if (actionPw !== actionPw2) {
      setError('The two action passwords do not match.');
      return;
    }
    if (actionPw === secret) {
      setError('The action password must be different from the secret key.');
      return;
    }
    const result = await window.planner.vaultSetup(secret, actionPw);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    secretKeyRef.current = secret;
    setSecret('');
    setSecret2('');
    setActionPw('');
    setActionPw2('');
    await refresh();
  };

  const createAction = async (): Promise<void> => {
    setError(null);
    if (actionPw.length < 6) {
      setError('Action password must be at least 6 characters.');
      return;
    }
    if (actionPw !== actionPw2) {
      setError('The two action passwords do not match.');
      return;
    }
    if (actionPw === secret) {
      setError('The action password must be different from the secret key.');
      return;
    }
    const result = await window.planner.vaultActionSet(actionPw);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setActionPw('');
    setActionPw2('');
    await refresh();
  };

  const unlock = async (): Promise<void> => {
    setError(null);
    const result = await window.planner.vaultUnlock(secret);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    secretKeyRef.current = secret;
    setSecret('');
    setLockHint(null);
    await refresh();
  };

  const resetKey = async (): Promise<void> => {
    setError(null);
    if (newSecret.length < 6) {
      setError('Secret key must be at least 6 characters.');
      return;
    }
    if (newSecret !== secret2) {
      setError('The two secret keys do not match.');
      return;
    }
    const result = await window.planner.vaultReset(loginPass, newSecret);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    secretKeyRef.current = newSecret;
    setLoginPass('');
    setNewSecret('');
    setSecret2('');
    setResetting(false);
    await refresh();
  };

  const lockNow = async (): Promise<void> => {
    await window.planner.vaultLock();
    await refresh();
  };

  const hide = (id: string): void => {
    setRevealed((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const applySave = async (data: VaultUpsert): Promise<SaveOutcome> => {
    const result = await window.planner.vaultUpsert(data);
    if (result.ok) {
      await refresh();
      return 'saved';
    }
    if ('needsAction' in result && result.needsAction) return 'retry';
    return result.error;
  };

  const saveEntry = async (data: VaultUpsert): Promise<string | null> => {
    const outcome = await applySave(data);
    if (outcome === 'saved') {
      setEditing(null);
      return null;
    }
    if (outcome === 'retry') {
      setEditing(null);
      setPendingSave(data);
      setActionFor({ kind: 'save', label: data.label });
      return null;
    }
    return outcome;
  };

  const handleAction = async (): Promise<void> => {
    const target = actionFor;
    if (!target) return;

    if (target.kind === 'save' && pendingSave) {
      const data = pendingSave;
      setPendingSave(null);
      const outcome = await applySave(data);
      if (outcome === 'retry') {
        setPendingSave(data);
        return;
      }
      if (outcome !== 'saved') setError(outcome);
      setActionFor(null);
      return;
    }

    if (target.kind === 'copy-key') {
      const key = secretKeyRef.current;
      if (!key) {
        setError('Lock and unlock the vault with your secret key, then try again.');
      } else {
        await window.planner.copyText(key);
        setKeyCopied(true);
        window.clearTimeout(keyTimer.current);
        keyTimer.current = window.setTimeout(() => setKeyCopied(false), 1800);
      }
      setActionFor(null);
      return;
    }

    const entry = target.entry;
    if (!entry) {
      setActionFor(null);
      return;
    }

    if (target.kind === 'show') {
      const result = await window.planner.vaultReveal(entry.id);
      if (result.ok) setRevealed((prev) => ({ ...prev, [entry.id]: result.password }));
      else {
        setError(result.error);
        await refresh();
      }
    } else if (target.kind === 'copy') {
      const result = await window.planner.vaultReveal(entry.id);
      if (!result.ok) {
        setError(result.error);
        await refresh();
      } else {
        await window.planner.copyText(result.password);
        setCopiedId(entry.id);
        window.clearTimeout(copyTimer.current);
        copyTimer.current = window.setTimeout(() => setCopiedId(null), 1600);
      }
    } else if (target.kind === 'edit') {
      setEditing({ entry });
    } else if (target.kind === 'delete') {
      const result = await window.planner.vaultDelete(entry.id);
      if (!result.ok) setError(result.error);
      else {
        setRevealed((prev) => {
          const next = { ...prev };
          delete next[entry.id];
          return next;
        });
        await refresh();
      }
    }
    setActionFor(null);
  };

  const openAction = (kind: ActionKind, entry: VaultEntryView): void => {
    setError(null);
    setActionFor({ kind, label: entry.label, entry });
  };

  const queryTrimmed = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      queryTrimmed
        ? entries.filter((entry) =>
            [entry.label, entry.username, entry.url ?? '', entry.notes ?? ''].some((field) =>
              field.toLowerCase().includes(queryTrimmed)
            )
          )
        : entries,
    [entries, queryTrimmed]
  );

  // a new result set (unlock, save, delete, search) jumps back to page 1
  useEffect(() => {
    setPage(0);
  }, [filtered]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / size));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * size, safePage * size + size);

  return (
    <main
      className={`vault${mode === 'open' ? ' vault-listing' : ''}`}
      id="vault-view"
    >
      <header className="vault-head">
        <div>
          <span className="week-kicker">Encrypted credential store</span>
          <h1>Password vault</h1>
          <p className="muted">
            Saved only on this device, inside your encrypted plan. The vault key opens it for 5
            minutes — showing, copying, editing or deleting any password additionally asks for
            your action password every time.
          </p>
        </div>
        {mode === 'open' && (
          <div className="vault-actions">
            <span className="badge">{entries.length} saved</span>
            <button
              className="btn"
              id="vault-copy-key"
              onClick={() => {
                setError(null);
                setActionFor({ kind: 'copy-key', label: 'your vault secret key' });
              }}
            >
              {keyCopied ? 'Copied ✓' : '🔑 Secret key'}
            </button>
            <button className="btn" id="vault-lock-now" onClick={() => void lockNow()}>
              Lock now
            </button>
            <button
              className="btn btn-yellow"
              id="vault-add"
              onClick={() => setEditing({ entry: null })}
            >
              + Add password
            </button>
          </div>
        )}
      </header>

      {mode === 'setup' && (
        <section className="vault-card" id="vault-setup">
          <h2>Create your vault</h2>
          <p className="muted">
            Two passwords protect your data: the <b>secret key</b> opens the vault for 5 minutes,
            and a different <b>action password</b> is required for every reveal, copy, edit and
            delete. Lost the secret key? Reset it with your login password. Lost the action
            password? Change it with your secret key.
          </p>
          <div className="field">
            <label htmlFor="vault-secret">Secret key (at least 6 characters)</label>
            <input
              id="vault-secret"
              ref={secretRef}
              className="input"
              type="password"
              autoComplete="new-password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void createKey()}
            />
          </div>
          <div className="field">
            <label htmlFor="vault-secret2">Repeat secret key</label>
            <input
              id="vault-secret2"
              className="input"
              type="password"
              autoComplete="new-password"
              value={secret2}
              onChange={(e) => setSecret2(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void createKey()}
            />
          </div>
          <div className="field">
            <label htmlFor="vault-action">Action password (different, at least 6 characters)</label>
            <input
              id="vault-action"
              className="input"
              type="password"
              autoComplete="new-password"
              value={actionPw}
              onChange={(e) => setActionPw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void createKey()}
            />
          </div>
          <div className="field">
            <label htmlFor="vault-action2">Repeat action password</label>
            <input
              id="vault-action2"
              className="input"
              type="password"
              autoComplete="new-password"
              value={actionPw2}
              onChange={(e) => setActionPw2(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void createKey()}
            />
          </div>
          {error && (
            <div className="form-error" id="vault-error">
              {error}
            </div>
          )}
          <div className="row-actions">
            <button className="btn btn-yellow" id="vault-create" onClick={() => void createKey()}>
              Create vault
            </button>
          </div>
        </section>
      )}

      {mode === 'action-setup' && (
        <section className="vault-card" id="vault-action-setup">
          <h2>Create your action password</h2>
          <p className="muted">
            Your vault already exists but predates the action password. It is a second password,
            different from the secret key, and it will be required for every reveal, copy, edit
            and delete. You can change it later with your vault secret key.
          </p>
          <div className="field">
            <label htmlFor="vault-action">Action password (at least 6 characters)</label>
            <input
              id="vault-action"
              ref={actionRef}
              className="input"
              type="password"
              autoComplete="new-password"
              value={actionPw}
              onChange={(e) => setActionPw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void createAction()}
            />
          </div>
          <div className="field">
            <label htmlFor="vault-action2">Repeat action password</label>
            <input
              id="vault-action2"
              className="input"
              type="password"
              autoComplete="new-password"
              value={actionPw2}
              onChange={(e) => setActionPw2(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void createAction()}
            />
          </div>
          {error && (
            <div className="form-error" id="vault-error">
              {error}
            </div>
          )}
          <div className="row-actions">
            <button
              className="btn btn-yellow"
              id="vault-action-create"
              onClick={() => void createAction()}
            >
              Create action password
            </button>
          </div>
        </section>
      )}

      {mode === 'locked' && (
        <section className="vault-card" id="vault-lock">
          <h2>Vault locked</h2>
          <p className="muted">
            {lockHint ?? 'Enter your secret key to view saved passwords.'}
          </p>
          <div className="field">
            <label htmlFor="vault-secret">Secret key</label>
            <input
              id="vault-secret"
              ref={secretRef}
              className="input"
              type="password"
              autoComplete="current-password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void unlock()}
            />
          </div>
          {error && (
            <div className="form-error" id="vault-error">
              {error}
            </div>
          )}
          <div className="row-actions">
            <button className="btn btn-yellow" id="vault-unlock-btn" onClick={() => void unlock()}>
              Unlock
            </button>
            {!resetting ? (
              <button className="link" id="vault-forgot" onClick={() => setResetting(true)}>
                Forgot secret key?
              </button>
            ) : (
              <button className="link" id="vault-back-login" onClick={() => setResetting(false)}>
                Back to unlock
              </button>
            )}
          </div>

          {resetting && (
            <div className="vault-reset">
              <p className="muted">
                Reset the secret key with your login password. Your saved passwords and action
                password are not affected — only the old secret key stops working.
              </p>
              <div className="field">
                <label htmlFor="vault-login-pass">Login password</label>
                <input
                  id="vault-login-pass"
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="vault-new-secret">New secret key</label>
                <input
                  id="vault-new-secret"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={newSecret}
                  onChange={(e) => setNewSecret(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="vault-new-secret2">Repeat new secret key</label>
                <input
                  id="vault-new-secret2"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={secret2}
                  onChange={(e) => setSecret2(e.target.value)}
                />
              </div>
              <div className="row-actions">
                <button className="btn btn-yellow" id="vault-reset" onClick={() => void resetKey()}>
                  Reset secret key
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {mode === 'open' && (
        <section id="vault-open">
          {error && (
            <div className="form-error vault-banner" id="vault-error">
              {error}
            </div>
          )}
          {entries.length > 0 && (
            <div className="vault-toolbar">
              <input
                id="vault-filter"
                className="input"
                type="search"
                placeholder="Search by label, username, site or notes…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {queryTrimmed && (
                <span className="badge">
                  {filtered.length} of {entries.length} match
                </span>
              )}
            </div>
          )}
          {entries.length === 0 ? (
            <div className="vault-empty">
              <span className="vault-empty-ico" aria-hidden>
                🔐
              </span>
              <p>
                No passwords saved yet — use <b>+ Add password</b> to store your first one.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="vault-no-match" id="vault-no-match">
              No saved password matches <b>“{query.trim()}”</b>.
            </div>
          ) : (
            <>
              <div className="vuln-table-wrap vault-table-wrap">
                <table className="vuln-table vault-table">
                  <thead>
                    <tr>
                      <th>Entry</th>
                      <th>Username</th>
                      <th>Notes</th>
                      <th>Password</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((entry) => {
                      const host = hostOf(entry.url);
                      const shown = revealed[entry.id] !== undefined;
                      return (
                        <tr className="vault-item" key={entry.id}>
                          <td>
                            <div className="vault-item-top">
                              <span
                                className="vault-avatar"
                                aria-hidden
                                style={{ background: avatarColor(entry.id) }}
                              >
                                {entry.label.trim().charAt(0).toUpperCase() || '?'}
                              </span>
                              <div className="vault-item-title">
                                <b>{entry.label}</b>
                                {host && <span className="vault-host">{host}</span>}
                              </div>
                              <span className="vault-updated">{shortDate(entry.updatedAt)}</span>
                            </div>
                          </td>
                          <td>
                            {entry.username ? (
                              <span className="vault-user">{entry.username}</span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>
                            {entry.notes ? (
                              <span className="vault-notes" title={entry.notes}>
                                {entry.notes}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>
                            <div className="vault-pass-row">
                              {shown ? (
                                <code className="vault-pass shown" data-id={entry.id}>
                                  {revealed[entry.id]}
                                </code>
                              ) : (
                                <code className="vault-pass" data-id={entry.id}>
                                  ••••••••
                                </code>
                              )}
                              <span className="vault-item-actions">
                                {shown ? (
                                  <button
                                    className="btn btn-ghost"
                                    data-hide={entry.id}
                                    onClick={() => hide(entry.id)}
                                  >
                                    Hide
                                  </button>
                                ) : (
                                  <button
                                    className="btn btn-ghost vault-show"
                                    data-show={entry.id}
                                    onClick={() => openAction('show', entry)}
                                  >
                                    Show
                                  </button>
                                )}
                                <button
                                  className="btn btn-ghost"
                                  onClick={() => void openAction('copy', entry)}
                                >
                                  {copiedId === entry.id ? 'Copied ✓' : 'Copy'}
                                </button>
                              </span>
                            </div>
                          </td>
                          <td className="row-actions-cell">
                            <div className="vault-item-foot">
                              <button
                                className="btn btn-ghost"
                                onClick={() => openAction('edit', entry)}
                              >
                                Edit
                              </button>
                              <button
                                className="btn btn-ghost btn-danger-ghost"
                                onClick={() => openAction('delete', entry)}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <TablePager
                idPrefix="vault"
                total={filtered.length}
                page={safePage}
                size={size}
                onPage={setPage}
                onSize={setSize}
              />
            </>
          )}
        </section>
      )}

      {editing && (
        <VaultModal
          entry={editing.entry}
          onSubmit={saveEntry}
          onClose={() => setEditing(null)}
        />
      )}

      {actionFor && (
        <ActionModal
          kind={actionFor.kind}
          label={actionFor.label}
          onVerified={handleAction}
          onClose={() => setActionFor(null)}
        />
      )}
    </main>
  );
}
