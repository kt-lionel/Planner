import { useEffect, useState } from 'react';
import type { VaultEntryView, VaultUpsert } from '@shared/types';

interface Props {
  entry: VaultEntryView | null;
  onSubmit: (data: VaultUpsert) => Promise<string | null>;
  onClose: () => void;
}

export default function VaultModal({ entry, onSubmit, onClose }: Props) {
  const [label, setLabel] = useState(entry?.label ?? '');
  const [username, setUsername] = useState(entry?.username ?? '');
  const [password, setPassword] = useState('');
  const [url, setUrl] = useState(entry?.url ?? '');
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (): Promise<void> => {
    setError(null);
    if (!label.trim()) {
      setError('A label is required.');
      return;
    }
    if (!entry && !password) {
      setError('A password is required.');
      return;
    }
    setBusy(true);
    const problem = await onSubmit({
      id: entry?.id,
      label: label.trim(),
      username,
      password: password || undefined,
      url: url.trim() || undefined,
      notes: notes.trim() || undefined
    });
    setBusy(false);
    if (problem) setError(problem);
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={entry ? 'Edit password' : 'Add password'}>
        <div className="modal-head">
          <h2>{entry ? 'Edit password' : 'Add password'}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label htmlFor="vault-label">Label</label>
            <input
              id="vault-label"
              className="input"
              autoFocus
              placeholder="e.g. FortiGate admin, Kionda portal"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="vault-username">Username</label>
            <input
              id="vault-username"
              className="input"
              autoComplete="off"
              placeholder="Account or email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="vault-password">Password</label>
            <input
              id="vault-password"
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder={entry ? 'Leave blank to keep the current password' : 'Password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void submit()}
            />
          </div>

          <div className="field">
            <label htmlFor="vault-url">URL (optional)</label>
            <input
              id="vault-url"
              className="input"
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="vault-notes">Notes (optional)</label>
            <textarea
              id="vault-notes"
              className="textarea"
              rows={2}
              placeholder="PINs, recovery codes, where this is used…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && (
            <div className="form-error" id="vault-error">
              {error}
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" id="vault-save" disabled={busy} onClick={() => void submit()}>
            {entry ? 'Save changes' : 'Save password'}
          </button>
        </div>
      </div>
    </div>
  );
}
