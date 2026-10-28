import { useEffect, useRef, useState } from 'react';
import { APP_LOGO } from '../lib/logo';

type Mode = 'login' | 'setup' | 'key' | 'recovery';

interface Props {
  needsSetup: boolean;
  lastUsername: string;
  onRemember: (username: string) => void;
  onAuthenticated: (username: string) => void;
  onCmdVault: () => void;
}

export default function LoginScreen({
  needsSetup,
  lastUsername,
  onRemember,
  onAuthenticated,
  onCmdVault
}: Props) {
  const [mode, setMode] = useState<Mode>(needsSetup ? 'setup' : 'login');
  const [username, setUsername] = useState(needsSetup ? '' : lastUsername);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [pendingUser, setPendingUser] = useState('');
  const [keySaved, setKeySaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [recoveryKeyValue, setRecoveryKeyValue] = useState('');
  const [recoveryPass, setRecoveryPass] = useState('');
  const [recoveryConfirm, setRecoveryConfirm] = useState('');
  const userRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);
  const keyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (needsSetup) userRef.current?.focus();
    else passRef.current?.focus();
  }, [needsSetup]);

  const copyKey = async (): Promise<void> => {
    await window.planner.copyText(pendingKey ?? '');
    setCopied(true);
  };

  const openRecovery = (): void => {
    setMode('recovery');
    setError(null);
    setTimeout(() => keyInputRef.current?.focus(), 0);
  };

  const submit = async (): Promise<void> => {
    if (busy) return;
    setError(null);

    if (mode === 'setup') {
      if (username.trim().length < 2) return setError('Enter a username (2+ characters).');
      if (password.length < 6) return setError('Password must be at least 6 characters.');
      if (password !== confirm) return setError('Passwords do not match.');
      setBusy(true);
      const result = await window.planner.authSetup(username.trim(), password);
      setBusy(false);
      if (!result.ok) return setError(result.error);
      onRemember(result.username);
      if (result.recoveryKey) {
        setPendingKey(result.recoveryKey);
        setPendingUser(result.username);
        setKeySaved(false);
        setCopied(false);
        setMode('key');
      } else {
        onAuthenticated(result.username);
      }
      return;
    }

    if (mode === 'recovery') {
      if (!recoveryKeyValue.trim()) return setError('Enter your recovery key.');
      if (recoveryPass.length < 6) return setError('New password must be at least 6 characters.');
      if (recoveryPass !== recoveryConfirm) return setError('Passwords do not match.');
      setBusy(true);
      const result = await window.planner.authRecover(recoveryKeyValue.trim(), recoveryPass);
      setBusy(false);
      if (!result.ok) {
        setRecoveryKeyValue('');
        return setError(result.error);
      }
      onRemember(result.username);
      onAuthenticated(result.username);
      return;
    }

    if (!username.trim() || !password) return setError('Enter your username and password.');
    setBusy(true);
    const result = await window.planner.authLogin(username.trim(), password);
    setBusy(false);
    if (!result.ok) {
      setPassword('');
      passRef.current?.focus();
      return setError(result.error);
    }
    onRemember(result.username);
    onAuthenticated(result.username);
  };

  if (mode === 'key' && pendingKey) {
    return (
      <div className="auth-screen">
        <aside className="auth-brand">
          <div className="auth-logo">
            <img className="brand-logo lg" src={APP_LOGO} alt="" />
            <span className="auth-brand-name">ANZIKA</span>
          </div>
          <h1>
            Save your
            <br />
            <em>recovery key.</em>
          </h1>
          <ul className="auth-features">
            <li>
              <span className="tick">✓</span> Resets your password if you ever forget it
            </li>
            <li>
              <span className="tick">✓</span> Your data is never re-encrypted or lost
            </li>
            <li>
              <span className="tick">✓</span> Works offline, on this device only
            </li>
          </ul>
          <div className="auth-note">Data never leaves this device.</div>
        </aside>

        <main className="auth-panel">
          <div className="auth-card">
            <div className="auth-card-head">
              <span className="auth-icon setup">🔑</span>
              <div>
                <h2>Save your recovery key</h2>
                <p>The only way back in if you forget your password.</p>
              </div>
            </div>

            <code className="recovery-key-box" id="recovery-key-display">
              {pendingKey}
            </code>

            <div className="key-actions">
              <button className="btn" type="button" onClick={() => void copyKey()}>
                {copied ? 'Copied ✓' : 'Copy key'}
              </button>
            </div>

            <div className="auth-warning">
              This key is shown only once. Copy it somewhere safe — a password manager or a
              printed copy. Anyone with this key can reset your password.
            </div>

            <label className="check">
              <input
                id="key-saved"
                type="checkbox"
                checked={keySaved}
                onChange={(e) => setKeySaved(e.target.checked)}
              />
              I have saved this recovery key
            </label>

            <button
              className="btn btn-yellow btn-block"
              type="button"
              id="key-continue"
              disabled={!keySaved}
              onClick={() => onAuthenticated(pendingUser)}
            >
              Continue to ANZIKA
            </button>

            <div className="auth-foot">Profile created · encrypted at rest</div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <aside className="auth-brand">
        <div className="auth-logo">
          <img className="brand-logo lg" src={APP_LOGO} alt="" />
          <span className="auth-brand-name">ANZIKA</span>
        </div>
        <button
          className="btn btn-ghost auth-cmd-vault"
          id="login-cmd-vault"
          onClick={onCmdVault}
          title="Command vault — Ctrl+K"
        >
          ⌘ Command vault
        </button>
        <h1>
          Plan. Test.
          <br />
          <em>Report.</em>
        </h1>
        <p className="auth-pitch">
          One encrypted, offline workspace for the entire testing cycle — weekly planning,
          pentest engagements, vulnerability tracking, a 200-command vault and client-ready
          exports, built for teams that work on-prem and off the grid.
        </p>
        <div className="auth-stats">
          <div className="auth-stat">
            <b>200+</b>
            <span>commands</span>
          </div>
          <div className="auth-stat">
            <b>4</b>
            <span>categories</span>
          </div>
          <div className="auth-stat">
            <b>AES-256</b>
            <span>encrypted</span>
          </div>
        </div>
        <div className="auth-note">Offline-first · Data never leaves this device.</div>
      </aside>

      <main className="auth-panel">
        <form
          className="auth-card"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="auth-card-head">
            <span className={`auth-icon ${mode === 'setup' ? 'setup' : ''}`}>
              {mode === 'setup' ? '★' : '⛨'}
            </span>
            <div>
              <h2>
                {mode === 'setup'
                  ? 'Create your profile'
                  : mode === 'recovery'
                    ? 'Reset your password'
                    : 'Welcome back'}
              </h2>
              <p>
                {mode === 'setup'
                  ? 'Secure this device with a password.'
                  : mode === 'recovery'
                    ? 'Enter your recovery key, then choose a new password.'
                    : 'Sign in to unlock your workspace.'}
              </p>
            </div>
          </div>

          {mode === 'recovery' && (
            <>
              <div className="field">
                <label htmlFor="recovery-key">Recovery key</label>
                <input
                  id="recovery-key"
                  ref={keyInputRef}
                  className="input key-input"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                  value={recoveryKeyValue}
                  onChange={(e) => setRecoveryKeyValue(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="recovery-pass">New password</label>
                <div className="input-wrap">
                  <input
                    id="recovery-pass"
                    className="input"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="At least 6 characters"
                    value={recoveryPass}
                    onChange={(e) => setRecoveryPass(e.target.value)}
                  />
                  <button
                    type="button"
                    className="reveal"
                    onClick={() => setShowPassword((v) => !v)}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div className="field">
                <label htmlFor="recovery-confirm">Confirm new password</label>
                <input
                  id="recovery-confirm"
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Repeat the new password"
                  value={recoveryConfirm}
                  onChange={(e) => setRecoveryConfirm(e.target.value)}
                />
              </div>

              <div className="auth-warning">
                The plan file itself is not touched — only your password changes. All tasks and
                findings stay exactly as they are.
              </div>
            </>
          )}

          {mode !== 'recovery' && (
            <div className="field">
              <label htmlFor="auth-user">Username</label>
              <input
                id="auth-user"
                ref={userRef}
                className="input"
                autoComplete="username"
                placeholder="e.g. lionel"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={busy}
              />
            </div>
          )}

          {mode !== 'recovery' && (
            <div className="field">
              <label htmlFor="auth-pass">Password</label>
              <div className="input-wrap">
                <input
                  id="auth-pass"
                  ref={passRef}
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
                  placeholder={mode === 'setup' ? 'At least 6 characters' : 'Your password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={(e) => setCapsOn(e.getModifierState?.('CapsLock') ?? false)}
                />
                <button
                  type="button"
                  className="reveal"
                  onClick={() => setShowPassword((v) => !v)}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {capsOn && <div className="caps">Caps Lock is on</div>}
            </div>
          )}

          {mode === 'setup' && (
            <div className="field">
              <label htmlFor="auth-confirm">Confirm password</label>
              <input
                id="auth-confirm"
                className="input"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Repeat the password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
          )}

          {mode === 'setup' && (
            <div className="auth-warning">
              This password encrypts your plan file. Right after this you&apos;ll get a one-time
              recovery key — save it, it is the only way back in if you forget this password.
            </div>
          )}

          {error && <div className="form-error">{error}</div>}

          <button className="btn btn-yellow btn-block" type="submit" disabled={busy}>
            {busy
              ? 'Please wait…'
              : mode === 'setup'
                ? 'Create profile & get recovery key'
                : mode === 'recovery'
                  ? 'Reset password & sign in'
                  : 'Sign in'}
          </button>

          <div className="auth-foot">
            {mode === 'setup' ? (
              'First run — profile stays on this device.'
            ) : mode === 'recovery' ? (
              <button
                type="button"
                className="link"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
              >
                ← Back to sign in
              </button>
            ) : (
              <>
                Local account · encrypted at rest
                {' · '}
                <button type="button" className="link" id="forgot-password" onClick={openRecovery}>
                  Forgot password?
                </button>
              </>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}
