# Changelog

All notable changes to ANZIKA are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project adheres to [Semantic Versioning](https://semver.org).

## [1.0.0] — 2026-11-06

### Added
- Encrypted, offline workspace: weekly board, today panel, dashboard, activity
  log, recurring duties, CVSS findings, asset registry, engagements, 200+
  command vault, password vault, cyber toolbox and reference library.
- Reports: weekly & daily XLSX/PPTX, vulnerability workbook, engagement scope
  XLSX/PDF, full pentest report PDF/HTML, CSV & JSON (encrypted) round-trip.
- **Packaging**
  - Linux: `.deb` (installs to `/opt/ANZIKA`, menu entry with WM association)
    and portable `.AppImage`; `dist`, `dist:deb`, `dist:linux` scripts.
  - Windows: NSIS `ANZIKA-Setup-<version>.exe` with per-user install, chosen
    directory, desktop/Start-menu shortcuts and a bundled uninstaller.
  - GitHub Actions release workflow builds both targets from a `v*` tag.
  - `scripts/uninstall.sh` for clean Linux removals (optional `--purge-data`).
- **Docs**: README with screenshots, SECURITY.md threat model, CHANGELOG, MIT
  LICENSE.

### Security
- Renderer sandbox enabled (`sandbox: true`) alongside context isolation, CSP
  and no-remote-content policy.
- Every IPC handler now validates and caps its arguments via
  `src/main/validate.ts` (string coercion, filter checks, URL policy,
  20 MB imported-file cap, evidence-size cap).
- Optional web permissions are denied outright in the main process.
- Single-instance lock: a second launch focuses the running window instead of
  creating a second writer for the encrypted plan file.

### Changed
- Refined dark theme: elevation shadow scale, global accessible focus ring,
  hover affordances on controls, softer scrollbars, subtle background depth.
