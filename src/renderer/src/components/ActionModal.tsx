import { useEffect, useState } from 'react';

export type ActionKind = 'show' | 'copy' | 'edit' | 'delete' | 'save' | 'copy-key';

interface Props {
  kind: ActionKind;
  label: string;
  onVerified: () => Promise<void>;
  onClose: () => void;
}

const TITLES: Record<ActionKind, string> = {
  show: 'Show password',
  copy: 'Copy password',
  edit: 'Edit entry',
  delete: 'Delete entry',
  save: 'Save entry',
  'copy-key': 'Copy vault secret key'
};

export default function ActionModal({ kind, label, onVerified, onClose }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [secretKey, setSecretKey] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newPass2, setNewPass2] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const confirm = async (): Promise<void> => {
    setError(null);
    if (!password) {
      setError('Enter your action password.');
      return;
    }
    setBusy(true);
    const result = await window.planner.vaultActionVerify(password);
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    setPassword('');
    await onVerified();
    setBusy(false);
  };

  const resetAction = async (): Promise<void> => {
    setError(null);
    setNotice(null);
    if (newPass.length < 6) {
      setError('Action password must be at least 6 characters.');
      return;
    }
    if (newPass !== newPass2) {
      setError('The two action passwords do not match.');
      return;
    }
    if (newPass === secretKey) {
      setError('The action password must be different from the secret key.');
      return;
    }
    setBusy(true);
    const result = await window.planner.vaultActionReset(secretKey, newPass);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setForgot(false);
    setSecretKey('');
    setNewPass('');
    setNewPass2('');
    setNotice('Action password updated — enter the new one to continue.');
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal modal-action"
        id="action-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Confirm action password"
      >
        <div className="modal-head">
          <h2>{TITLES[kind]}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="modal-body">
          {!forgot ? (
            <>
              <p className="action-for">
                {kind === 'delete' ? 'Deleting' : kind === 'save' ? 'Changing' : 'Accessing'}{' '}
                <b>{label}</b> requires your action password — a second password, different from
                the vault key.
              </p>
              <div className="field">
                <label htmlFor="action-password">Action password</label>
                <input
                  id="action-password"
                  className="input"
                  type="password"
                  autoFocus
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void confirm()}
                />
              </div>
              {notice && (
                <p className="muted" id="action-notice">
                  {notice}
                </p>
              )}
              {error && (
                <div className="form-error" id="action-error">
                  {error}
                </div>
              )}
              <button
                className="link"
                id="action-forgot"
                onClick={() => {
                  setForgot(true);
                  setError(null);
                  setNotice(null);
                }}
              >
                Change action password?
              </button>
            </>
          ) : (
            <div className="vault-reset action-reset">
              <p className="muted">
                Set a new action password with your <b>vault secret key</b> — no login password
                needed. Your saved passwords are not affected.
              </p>
              <div className="field">
                <label htmlFor="action-secret">Vault secret key</label>
                <input
                  id="action-secret"
                  className="input"
                  type="password"
                  autoFocus
                  autoComplete="off"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="action-new">New action password</label>
                <input
                  id="action-new"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="action-new2">Repeat new action password</label>
                <input
                  id="action-new2"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={newPass2}
                  onChange={(e) => setNewPass2(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void resetAction()}
                />
              </div>
              {error && (
                <div className="form-error" id="action-error">
                  {error}
                </div>
              )}
              <div className="row-actions">
                <button
                  className="btn btn-yellow"
                  id="action-reset-btn"
                  disabled={busy}
                  onClick={() => void resetAction()}
                >
                  Reset action password
                </button>
                <button
                  className="link"
                  id="action-back"
                  onClick={() => {
                    setForgot(false);
                    setError(null);
                  }}
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn" id="action-cancel" onClick={onClose}>
            Cancel
          </button>
          {!forgot && (
            <button
              className="btn btn-yellow"
              id="action-confirm"
              disabled={busy}
              onClick={() => void confirm()}
            >
              {busy ? 'Checking…' : 'Confirm'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
