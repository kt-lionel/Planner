# ANZIKA — Security Model

ANZIKA is an offline-first workspace for sensitive security-operations data:
weekly plans, vulnerability findings, asset inventories, engagement scoping and
a password vault. This document describes how that data is protected, what the
app trusts, and how to report a suspected vulnerability.

## Data ownership & storage

All data stays **on the device**. The app performs no telemetry, no analytics,
no network calls, and never uploads anything. Data lives in a single directory:

| Platform | Location (`app.getPath('userData')`) |
| --- | --- |
| Linux | `~/.config/weekly-planner/` |
| Windows | `%APPDATA%\weekly-planner\` |
| macOS | `~/Library/Application Support/weekly-planner/` |

- `auth.json` — account profile: username, scrypt password verifier, the
  wrapped plan key, and the wrapped recovery material.
- `plan.json` — the workspace (tasks, findings, assets, engagements, commands),
  stored only as an **AES-256-GCM encrypted envelope**, never as plaintext.
- `plan.json.bak` — backup of the previous encrypted envelope, written before
  each save to survive a crash mid-write.
- `.corrupt-*` files — damaged envelopes are renamed here, never deleted.

## Account & session

- One profile per device (`auth.json`). The password is never stored — login
  verifies an scrypt **verifier** (`N=16384, r=8, p=1`, 64-byte digest).
- Credential comparisons use `timingSafeEqual`; usernames and passwords are
  compared in constant time.
- After **3 failed attempts**, every subsequent attempt is delayed by 1.5 s to
  blunt online guessing (offline brute force is limited by the scrypt cost).
- Sessions are held **in memory only** (`auth.ts: session`). Lock, logout, or
  app exit discards the key; a fresh password entry is required.
- The plan file is encrypted with an independent random 32-byte key that is
  wrapped with the password key. Changing the password / recovery key re-wraps
  the plan key without touching `plan.json` itself.

## Recovery keys

- A one-time recovery key is offered at signup: 16 random bytes printed as
  `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX` (64 bits of true entropy).
- It verifies with scrypt and only re-wraps the plan key — the encrypted file
  itself is untouched.
- Rotating the key immediately invalidates the previous one.
- Recovery keys are shown once; the app stores only their verifier.

## Password vault

- Entries live inside the encrypted plan; the renderer never receives the vault
  key — reveal/copy/edit/delete return decrypted values one call at a time.
- The vault opens with a **secret key**. A *different* **action password** is
  additionally required for every destructive/read operation (reveal, copy,
  edit, delete, copy-of-key). It times out after a short grace window and is
  re-asked after any lock.
- The action password is changed with the vault secret key (not the login
  password). The login password can only reset the secret key itself and keeps
  all entries.

## Report exports

- Exports (XLSX, PPTX, PDF, HTML, CSV) contain whatever the page currently
  shows. The *password vault is never included* in any export or import path.
- ANZIKA JSON exports are produced as encrypted envelopes with the session key;
  import of a plaintext JSON is allowed for unencrypted older backups.

## Electron hardening

| Control | Setting |
| --- | --- |
| Render-process sandbox | `sandbox: true` (`main/index.ts: createWindow`) |
| Context isolation | `contextIsolation: true` |
| Node integration | `nodeIntegration: false` |
| Content Security Policy | `default-src 'self'; script-src 'self'; …` (`renderer/index.html`) |
| Navigation / popups | `setWindowOpenHandler` denies popups and routes http(s) to the system browser |
| External URL policy | only `http(s)://` URLs are accepted, validated in `src/main/validate.ts` |
| Web permissions | all permission requests (camera, mic, …) are denied |
| IPC bridge | a single, typed `window.planner` API; each handler validates inputs (coercion + length caps, `src/main/validate.ts`) before doing work |
| File reads | imported files are size-capped (~20 MB) before decoding |
| Multiple instances | single-instance lock — a second launch focuses the existing window instead of creating a second writer on the plan file |

The renderer is fully offline: `ELECTRON_RENDERER_URL` is only set by the dev
server; production loads a local file. There is no remote content anywhere.

## Test coverage

`npm test` runs three smoke suites (`--smoke`, `--smoke-ui`, `--smoke-auth`)
with assertions that directly cover the above: encryption at rest, wrong-key
rejection, vault action gating, recovery flows, locked-state failures
(batch-verify style), legacy profile upgrades, and sample-data purge — plus an
end-to-end UI probe of every major view.

## Known limitations

- Data at rest is only as strong as the OS account holding it. Any local
  administrator (or malware running as the user) can read the encrypted files
  and, in principle, attack them offline.
- Windows installers are currently unsigned. SmartScreen will warn; the
  publisher will show as unchecked until a code-signing certificate is added to
  the build (`csc.keyPath` + `win.sign` in electron-builder).
- The recovery key is a bearer secret: anyone holding it can reset the password
  and read the plan on **this device**.

## Reporting

Found a vulnerability? Please report privately: open a [security advisory]
on https://github.com/kt-lionel/planner or contact the maintainer directly.
Please do not open a public issue for an undisclosed security problem.
