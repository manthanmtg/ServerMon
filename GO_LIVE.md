# ServerMon Go-Live Checklist

This checklist is for launching ServerMon publicly and safely. Treat it as a
release gate, not a suggestion list. Each item should have evidence, an owner,
and a fallback before launch.

## Status Legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Complete
- `[!]` Blocker or needs decision
- `[defer]` Accepted for post-launch with owner and date

## Launch Gates

### P0 - Must Be Complete Before Public Launch

| Area       | Task                                                         | Owner | Evidence                                                           | Risk If Skipped                                            | Fallback                                               |
| ---------- | ------------------------------------------------------------ | ----- | ------------------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------ |
| Scope      | Freeze launch scope and list anything intentionally excluded | TBD   | Launch scope note in this file or release notes                    | Unplanned work lands during stabilization                  | Move excluded items to post-launch backlog             |
| Repository | Release from a clean branch with no unrelated local changes  | TBD   | `git status --short` is clean before release                       | Accidental files or debug code ship                        | Stop release and split/stash unrelated work            |
| Quality    | Run formatter check                                          | TBD   | `pnpm format:check` passes                                         | Inconsistent docs/source churn                             | Run `pnpm format`, review diff, rerun check            |
| Quality    | Run full pre-merge gate                                      | TBD   | `pnpm check` passes                                                | Type, build, lint, release-contract, or test failures ship | Block release until fixed                              |
| E2E        | Run critical browser flows                                   | TBD   | `pnpm test:e2e` passes or manual evidence recorded                 | Auth/setup/dashboard regressions ship                      | Document failing flow and block launch if critical     |
| Security   | Complete security verification checklist below               | TBD   | Findings resolved or explicitly accepted                           | Exposed admin/system control surface                       | Disable risky module or keep release private           |
| Release    | Create a SemVer version and annotated release tag            | TBD   | `pnpm release patch`, `minor`, or `major`                          | Install/update paths cannot pin a stable release           | Delete bad tag before publish if needed                |
| Artifacts  | Verify GitHub Release artifacts and `SHA256SUMS`             | TBD   | Release page contains hub/agent tarballs for all supported targets | Installers fail or users cannot verify downloads           | Pull release, fix workflow, republish tag              |
| Install    | Test fresh install on clean Ubuntu/Debian host               | TBD   | Install log, service status, app reachable                         | First user install fails                                   | Mark release as pre-release and fix installer          |
| Update     | Test update from previous release or source install          | TBD   | Update log and app version after update                            | Existing users get broken upgrades                         | Publish rollback note and disable auto-update guidance |
| Rollback   | Prove rollback path before launch                            | TBD   | Documented rollback command or tested previous-release restore     | Bad release cannot be recovered quickly                    | Unpublish latest guidance and pin previous tag         |
| Docs       | README, DEPLOY, and release notes match current behavior     | TBD   | Docs reviewed against installer/update paths                       | Users follow stale instructions                            | Add release warning and patch docs immediately         |

### P1 - Strongly Recommended Before Public Launch

| Area          | Task                                                                                          | Owner | Evidence                                         | Risk If Skipped                                    | Fallback                                                |
| ------------- | --------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------- |
| CI            | Ensure branch protection requires format, lint, typecheck, build, tests, and release contract | TBD   | GitHub branch protection screenshot/config       | Auto-merge can land unverified code                | Temporarily disable auto-merge                          |
| CI            | Add build and test jobs to required status checks, not only quality                           | TBD   | Required checks list includes `Build` and `Test` | PR quality gate misses build/test failures         | Manual release checklist requires local `pnpm check`    |
| Supply chain  | Generate dependency vulnerability report                                                      | TBD   | `pnpm audit` or equivalent report reviewed       | Known vulnerable dependency ships                  | Pin/patch dependency or document accepted risk          |
| Supply chain  | Generate SBOM for release artifacts                                                           | TBD   | SBOM attached to release or stored internally    | Harder incident response for dependency CVEs       | Generate SBOM after launch for current tag              |
| Supply chain  | Sign release artifacts or publish provenance                                                  | TBD   | Signature/provenance attached to release         | Users cannot verify publisher authenticity         | Keep checksum-only release and document limitation      |
| Secrets       | Run a secrets scan on repo history and release artifacts                                      | TBD   | Gitleaks/trufflehog or equivalent report         | Token or credential leaks publicly                 | Rotate leaked secret, purge if feasible                 |
| Observability | Confirm health, logs, and update/install logs are accessible                                  | TBD   | Health endpoint, journal/log commands documented | Incidents take longer to diagnose                  | Add emergency debug runbook                             |
| Backup        | Test MongoDB backup and restore                                                               | TBD   | Restore tested on staging DB                     | Data loss during install/update/release bug        | Disable destructive operations until backups are tested |
| Support       | Create issue templates and vulnerability disclosure path                                      | TBD   | GitHub templates and SECURITY.md                 | Users report security issues publicly or unclearly | Add temporary README contact guidance                   |

### P2 - Advanced Hardening

| Area      | Task                                                                  | Owner | Evidence                                             | Risk If Skipped                              | Fallback                                       |
| --------- | --------------------------------------------------------------------- | ----- | ---------------------------------------------------- | -------------------------------------------- | ---------------------------------------------- |
| Security  | Run external appsec review or focused penetration test                | TBD   | Review report and fixed findings                     | Subtle exploit paths remain                  | Limit launch audience and disclose beta status |
| Security  | Add DAST scan against staging                                         | TBD   | ZAP/StackHawk/other report                           | Common web issues may be missed              | Manual route review and CSP/header checks      |
| Fuzzing   | Fuzz parsers and import/upload handlers                               | TBD   | Fuzz corpus or crash-free run log                    | Parser edge cases crash or hang app          | Restrict upload/import availability            |
| Hardening | Add systemd sandboxing review                                         | TBD   | Service unit reviewed with least privilege           | Host-management app runs broader than needed | Document trusted-admin-only deployment model   |
| Release   | Add reproducible build notes                                          | TBD   | Documented build inputs and artifact manifest        | Harder to verify artifact integrity          | Keep release manifest with commit SHA          |
| Packaging | Publish pnpm-installable CLI package after artifact release is stable | TBD   | Package can install, start, and manage service paths | Users rely only on manual install            | Keep GitHub Releases as primary channel        |

## Security Verification

### Authentication And Session Boundaries

| Task                                                                                                    | Owner | Evidence                                           | Risk If Skipped                                | Fallback                                      |
| ------------------------------------------------------------------------------------------------------- | ----- | -------------------------------------------------- | ---------------------------------------------- | --------------------------------------------- |
| Verify `src/proxy.ts` protects all non-public app and API routes by default                             | TBD   | Route review plus `src/proxy.test.ts` passing      | Unauthenticated access to admin modules        | Block launch until route coverage is fixed    |
| Verify setup routes cannot be abused after first admin is created                                       | TBD   | `src/app/api/setup/*` tests and manual setup retry | Account takeover or setup reset                | Disable setup endpoint after initialization   |
| Verify all sensitive API handlers call `getSession()` or equivalent server-side auth                    | TBD   | Search/review of `src/app/api/**/route.ts`         | UI-only auth bypass                            | Add auth guard and tests                      |
| Verify role/permission boundaries for users, fleet, terminal, file browser, updates, and system actions | TBD   | Manual matrix of user roles vs capabilities        | Low-privileged user can run privileged actions | Restrict to admin-only until RBAC is proven   |
| Confirm JWT/session cookies are `HttpOnly`, secure in production, and have appropriate `SameSite`       | TBD   | Cookie inspection in production/staging            | Token theft or CSRF exposure                   | Force HTTPS and tighten cookie settings       |
| Confirm login, TOTP, passkey, logout, and session expiry flows work                                     | TBD   | Manual test notes and auth tests pass              | Users locked out or stale sessions persist     | Disable optional auth feature causing failure |
| Add or verify rate limiting on login, setup, passkey, and token-verification endpoints                  | TBD   | Test or config evidence                            | Brute force and credential stuffing risk       | Put reverse-proxy rate limits in front        |

### High-Risk Feature Review

| Feature        | Task                                                                                        | Owner | Evidence                                   | Risk If Skipped                           | Fallback                                     |
| -------------- | ------------------------------------------------------------------------------------------- | ----- | ------------------------------------------ | ----------------------------------------- | -------------------------------------------- |
| Terminal       | Verify terminal sessions require auth and cannot cross users/nodes                          | TBD   | Tests/manual multi-user check              | Remote shell exposure                     | Disable terminal module for launch           |
| File Browser   | Verify path traversal, symlink, upload, edit, and delete behavior                           | TBD   | API tests and manual negative cases        | Arbitrary file read/write                 | Ship read-only or disable file browser       |
| Uploads        | Verify size limits, MIME/extension expectations, path normalization, and overwrite behavior | TBD   | Upload tests and reverse-proxy body limits | Disk fill or arbitrary write              | Disable upload route                         |
| Endpoints      | Verify custom endpoint execution is authenticated, authorized, and logged                   | TBD   | Route tests and audit log sample           | Arbitrary command/proxy abuse             | Disable custom endpoints                     |
| Services/Cron  | Verify service actions and cron creation require admin permission                           | TBD   | Route tests and manual permission check    | Privilege escalation                      | Read-only mode for launch                    |
| System Actions | Verify reboot/update routes are admin-only and confirm dangerous operations                 | TBD   | Route tests and manual negative cases      | Host disruption                           | Hide/disable system actions                  |
| Fleet          | Verify pairing tokens, hub auth tokens, FRP tokens, and rotate-token flows                  | TBD   | Pair/rotate tests and manual staging node  | Node takeover or stale credentials        | Disable public pairing and rotate all tokens |
| Self Service   | Verify templates cannot inject unsafe commands or fetch untrusted scripts silently          | TBD   | Template review and install tests          | Supply-chain execution risk               | Ship curated templates only                  |
| AI Runner      | Verify workspace paths, logs, prompt attachments, and command execution boundaries          | TBD   | Route tests and manual path checks         | Host file exposure or arbitrary execution | Disable schedules/direct dispatch            |

### Input, Output, And Data Safety

| Task                                                                                           | Owner | Evidence                                          | Risk If Skipped                                | Fallback                                         |
| ---------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------ |
| Ensure request bodies and query params are validated with Zod for write/action routes          | TBD   | Review list of action routes                      | Unexpected input reaches shell/DB/filesystem   | Add validation or block route                    |
| Verify every shell command path uses allowlists, fixed argv arrays, or strict escaping         | TBD   | Review command-building helpers                   | Command injection                              | Replace shell strings with `execFile`/fixed argv |
| Verify filesystem access is rooted, normalized, and rejects traversal                          | TBD   | Negative tests for `..`, symlinks, absolute paths | Arbitrary file access                          | Restrict to safe directories                     |
| Verify untrusted markdown/HTML is not rendered unsafely                                        | TBD   | UI review for markdown renderers                  | XSS                                            | Escape/sanitize or disable HTML                  |
| Verify errors do not leak secrets, stack traces, env values, or filesystem paths in production | TBD   | Manual failure tests                              | Information disclosure                         | Return generic errors, log details server-side   |
| Verify logs never include passwords, tokens, cookies, Mongo URI credentials, or private keys   | TBD   | Log review and logger tests                       | Secret leakage                                 | Redact and rotate exposed secrets                |
| Verify MongoDB indexes, unique constraints, and backup expectations for production data        | TBD   | DB schema/index review                            | Duplicate data, slow queries, restore failures | Add migration/index script before launch         |

### Network And Browser Security

| Task                                                                                                      | Owner | Evidence                                  | Risk If Skipped                                    | Fallback                                           |
| --------------------------------------------------------------------------------------------------------- | ----- | ----------------------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| Serve production over HTTPS with valid certificate                                                        | TBD   | Browser certificate check                 | Session/token exposure                             | Keep app private behind VPN                        |
| Configure HSTS after HTTPS is stable                                                                      | TBD   | Response header check                     | Downgrade attacks remain possible                  | Defer HSTS until certificate renewal is proven     |
| Review `scripts/nginx.conf` for proxy headers, websocket/SSE support, body limits, and timeouts           | TBD   | `nginx -t` plus manual terminal/SSE tests | Broken real-time features or unsafe proxy behavior | Publish known-good Nginx config                    |
| Add security headers: CSP, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, referrer policy | TBD   | Header scan                               | XSS/clickjacking impact increases                  | Add headers at Nginx until app-level headers exist |
| Confirm CORS is closed by default                                                                         | TBD   | Header scan and route review              | Browser-based cross-origin abuse                   | Restrict origins at proxy                          |
| Configure firewall to expose only required ports                                                          | TBD   | `ufw status`/cloud firewall rules         | Database or internal ports exposed                 | Close ports before public DNS cutover              |

## Release Hardening

### Versioning And Release Process

| Task                                                                                       | Owner | Evidence                                | Risk If Skipped                         | Fallback                               |
| ------------------------------------------------------------------------------------------ | ----- | --------------------------------------- | --------------------------------------- | -------------------------------------- |
| Decide release type: `patch`, `minor`, `major`, or pre-release                             | TBD   | Release note heading                    | Wrong upgrade expectations              | Re-tag before announcing               |
| Update `package.json` version through the release process                                  | TBD   | Version matches tag                     | Package metadata disagrees with release | Patch version and create corrected tag |
| Verify `scripts/release.sh --dry-run` output before real release                           | TBD   | Dry-run summary captured                | Wrong branch/version/tag pushed         | Stop and rerun with explicit version   |
| Confirm tag does not already exist locally or remotely                                     | TBD   | `git tag --list vX.Y.Z` and remote tags | Release workflow conflicts              | Pick next version                      |
| Ensure release notes include install, update, rollback, known issues, and breaking changes | TBD   | GitHub Release notes reviewed           | Users cannot operate release safely     | Edit release notes before announcement |
| Keep `CHANGELOG.md` or release notes user-facing, not implementation-noise-only            | TBD   | Human review                            | Users miss important changes            | Patch release notes                    |

### CI/CD Gates

| Task                                                                        | Owner | Evidence                               | Risk If Skipped                   | Fallback                                  |
| --------------------------------------------------------------------------- | ----- | -------------------------------------- | --------------------------------- | ----------------------------------------- |
| Required PR checks include `pnpm check:release-contract`                    | TBD   | GitHub branch rules                    | Install/update contract regresses | Manual release contract check before tag  |
| Required PR checks include lint, typecheck, build, unit tests, and coverage | TBD   | GitHub branch rules                    | Build/test failures reach main    | Disable auto-merge until configured       |
| Workflows use pinned action SHAs and fixed runners                          | TBD   | `pnpm check:release-contract` passes   | Supply-chain drift in CI          | Pin before launch                         |
| Release workflow publishes only from `v*` tags                              | TBD   | `.github/workflows/release.yml` review | Accidental manual release         | Keep manual publishing disabled           |
| Release artifacts include `RELEASE_MANIFEST.txt` with commit/ref/build time | TBD   | Extract artifact and inspect manifest  | Cannot trace artifact to source   | Regenerate artifacts                      |
| Checksums are generated for every artifact                                  | TBD   | `SHA256SUMS` includes all tarballs     | Users cannot verify download      | Republish release assets                  |
| Release workflow fails if any target artifact is missing                    | TBD   | Workflow config and run log            | Partial platform release          | Mark release as partial or delete release |

### Artifact Verification

| Task                                                                | Owner | Evidence                                       | Risk If Skipped                     | Fallback                   |
| ------------------------------------------------------------------- | ----- | ---------------------------------------------- | ----------------------------------- | -------------------------- |
| Download each published artifact from GitHub Releases               | TBD   | Local files or CI smoke job                    | Broken release URL unnoticed        | Rebuild/reupload release   |
| Verify each artifact with `SHA256SUMS`                              | TBD   | `sha256sum -c` or `shasum -a 256 -c` output    | Tampered/corrupt artifact ships     | Replace release assets     |
| Extract hub artifact and run startup smoke test                     | TBD   | `pnpm start` smoke result or service smoke log | Artifact cannot boot                | Pull release               |
| Extract agent artifact and verify agent install/update command path | TBD   | Staging node log                               | Fleet agents fail to install/update | Publish agent-only hotfix  |
| Verify artifact excludes `.env*`, `.git`, caches, and local stores  | TBD   | `tar -tzf` sample review                       | Secrets or bloat included           | Delete release and rebuild |

## Install Hardening

### Fresh Install

| Task                                                        | Owner | Evidence                                   | Risk If Skipped                        | Fallback                                   |
| ----------------------------------------------------------- | ----- | ------------------------------------------ | -------------------------------------- | ------------------------------------------ |
| Test interactive install on supported Ubuntu/Debian version | TBD   | Full install log                           | Main install path broken               | Mark installer beta                        |
| Test unattended install with explicit flags                 | TBD   | Command and log                            | Automation users fail                  | Document interactive-only limitation       |
| Test `--prebuilt` install from release artifact             | TBD   | Log shows build skipped and service starts | Low-memory machines fail               | Direct users to source install temporarily |
| Test remote MongoDB install with `--skip-mongo`             | TBD   | App connects to remote DB                  | Remote DB users blocked                | Document local MongoDB-only limitation     |
| Test domain + Nginx + SSL path                              | TBD   | HTTPS app reachable                        | Public install insecure or unreachable | Recommend reverse proxy manual setup       |
| Test IP-only path without Nginx/SSL                         | TBD   | App reachable on configured port           | Small installs fail                    | Document required port/firewall config     |
| Test uninstall leaves MongoDB/Nginx intentionally untouched | TBD   | Uninstall log and host inspection          | Users lose unrelated infra             | Fix uninstall or add warning               |

### Host Permissions And Secrets

| Task                                                                      | Owner | Evidence                                                       | Risk If Skipped                       | Fallback                              |
| ------------------------------------------------------------------------- | ----- | -------------------------------------------------------------- | ------------------------------------- | ------------------------------------- |
| Prefer non-root service user by default                                   | TBD   | systemd unit user check                                        | Full host compromise if app exploited | Document root mode as advanced/unsafe |
| Lock `/etc/servermon/env` to root/service-readable only                   | TBD   | `ls -l /etc/servermon/env`                                     | Secrets readable by local users       | `chmod 600` and restart               |
| Generate high-entropy `JWT_SECRET`, fleet tokens, and FRP tokens          | TBD   | Install log confirms generated values without printing secrets | Predictable tokens                    | Rotate tokens before launch           |
| Confirm installer never writes secrets into release artifacts or git repo | TBD   | Artifact/env review                                            | Public credential leak                | Rotate and rebuild                    |
| Confirm logs do not print full Mongo URI credentials                      | TBD   | Install/update logs reviewed                                   | DB credential leak                    | Redact logs and rotate DB password    |

### System Service And Runtime

| Task                                                                | Owner | Evidence                                     | Risk If Skipped                   | Fallback                                     |
| ------------------------------------------------------------------- | ----- | -------------------------------------------- | --------------------------------- | -------------------------------------------- |
| Verify systemd service starts at boot and restarts on failure       | TBD   | `systemctl status servermon` and reboot test | App stays down after reboot/crash | Add restart policy                           |
| Verify service logs are available through `journalctl -u servermon` | TBD   | Journal output sample                        | Harder support/debugging          | Document log path                            |
| Verify port conflicts are detected before install completes         | TBD   | Negative install test                        | Service fails silently            | Improve installer preflight                  |
| Verify low-memory build path uses release artifacts                 | TBD   | Raspberry Pi/low-memory staging log          | Install fails on small machines   | Document release artifact install as default |

## Update Hardening

### Source And Release Update Paths

| Task                                                                              | Owner | Evidence                                    | Risk If Skipped                            | Fallback                             |
| --------------------------------------------------------------------------------- | ----- | ------------------------------------------- | ------------------------------------------ | ------------------------------------ |
| Test source update path from `scripts/update-servermon.sh`                        | TBD   | Update log from source install              | Source installs cannot upgrade             | Tell users to reinstall from release |
| Test release update path reads `/etc/servermon/env` metadata                      | TBD   | Update log shows `Install mode: release`    | Release installs switch modes unexpectedly | Patch env metadata and rerun         |
| Verify release updates download matching `servermon-hub-<os>-<arch>.tar.gz`       | TBD   | Update log                                  | Wrong binary/source artifact installed     | Pin explicit release URL             |
| Verify update checksum validation blocks tampered artifact                        | TBD   | Negative checksum test                      | Corrupt artifact can install               | Disable release auto-update guidance |
| Verify update preserves `MONGO_URI`, `PORT`, domain, SSL, Fleet, and install mode | TBD   | Before/after env diff with secrets redacted | Update breaks production config            | Restore `/etc/servermon/env` backup  |

### Rollback And Data Safety

| Task                                                                                            | Owner | Evidence                                     | Risk If Skipped                   | Fallback                                    |
| ----------------------------------------------------------------------------------------------- | ----- | -------------------------------------------- | --------------------------------- | ------------------------------------------- |
| Ensure installer keeps previous releases and can repoint to last known good                     | TBD   | Release directory listing and rollback notes | Bad deploy has no quick rollback  | Reinstall previous tag                      |
| Backup MongoDB before updates that touch data models                                            | TBD   | Backup artifact and restore test             | Data loss or incompatible state   | Stop update and restore backup              |
| Verify old code can run against new data for one release window, or document breaking migration | TBD   | Compatibility note                           | Rollback corrupts/misreads data   | Treat as major release with migration guide |
| Test failed update leaves existing service running or recoverable                               | TBD   | Simulated failure log                        | Partial update outage             | Manual symlink/service restore              |
| Keep update logs in a known location                                                            | TBD   | `/var/log/servermon_update.log` sample       | Users cannot debug failed updates | Add support instructions                    |

### Fleet And Agent Updates

| Task                                                        | Owner | Evidence                              | Risk If Skipped               | Fallback                      |
| ----------------------------------------------------------- | ----- | ------------------------------------- | ----------------------------- | ----------------------------- |
| Test fleet agent install from latest release                | TBD   | Agent install log                     | New nodes cannot join         | Pin previous working release  |
| Test fleet agent install with pinned `--version vX.Y.Z`     | TBD   | Agent env file records pinned version | Reproducibility gap           | Use custom release base URL   |
| Test fleet agent update from release mode                   | TBD   | Agent update log visible in UI        | Agents drift or fail silently | Manual node update            |
| Test fleet agent source fallback with `--build-from-source` | TBD   | Source install log                    | Advanced users lose fallback  | Document release-only support |
| Test rotate token path after update                         | TBD   | Node reconnects with rotated token    | Stale tokens survive release  | Manual token rotation         |

## pnpm Package Distribution Checklist

Launch distribution should be pnpm-first. The published package should act as a
CLI installer/launcher for ServerMon, not as a claim that pnpm alone creates a
native service on every OS. There is no separate pnpm registry; the package is
published to an npm-compatible registry and installed with pnpm.

Do not pursue apt, yum, Homebrew, Winget, Scoop, or Docker distribution for the
first public launch unless this decision is revisited. GitHub Release artifacts
can remain the runtime payload behind the pnpm CLI.

### Distribution Decision

| Channel         | Launch Decision                      | Required Before Publishing                                             |
| --------------- | ------------------------------------ | ---------------------------------------------------------------------- |
| pnpm package    | Primary public install entrypoint    | Package exposes a working `servermon` CLI and verified service setup   |
| GitHub Releases | Runtime artifact source and fallback | Hub/agent tarballs, `SHA256SUMS`, rollback notes, and release manifest |
| apt/yum         | Deferred                             | Revisit only after Linux service install is stable via pnpm            |
| Homebrew        | Deferred                             | Revisit only after macOS launchd install is stable via pnpm            |
| Docker/GHCR     | Deferred                             | Revisit only after container runtime model is designed                 |
| Winget/Scoop    | Deferred                             | Revisit only after Windows support is intentionally built and tested   |

### pnpm Package Tasks

| Task                                                                                           | Owner | Evidence                                 | Risk If Skipped                              | Fallback                                  |
| ---------------------------------------------------------------------------------------------- | ----- | ---------------------------------------- | -------------------------------------------- | ----------------------------------------- |
| Decide package name and scope, such as `servermon` or `@servermon/cli`                         | TBD   | Package naming note                      | Name conflict or confusing install path      | Use scoped package                        |
| Make package purpose explicit: CLI installer/launcher, not full cross-OS service magic         | TBD   | README install section                   | Users expect pnpm alone to manage services   | Add warning before publish                |
| Remove `"private": true` only when publishing is intentional                                   | TBD   | `package.json` reviewed                  | Accidental publish or blocked publish        | Keep package private                      |
| Add `bin`, `files`, `engines`, `license`, `repository`, `homepage`, and package metadata       | TBD   | `npm pack --dry-run` output              | Package installs without usable CLI          | Fix manifest before publish               |
| Add CLI commands: `install-service`, `start`, `stop`, `restart`, `status`, `logs`, `uninstall` | TBD   | CLI help output and smoke tests          | Users cannot run ServerMon as a service      | Keep GitHub install script as primary     |
| Add `pnpm dlx` quick-start command                                                             | TBD   | `pnpm dlx <package> --help` works        | Users must globally install before trying    | Document global install only              |
| Keep release artifact download and checksum verification inside the CLI                        | TBD   | CLI verifies `SHA256SUMS` before install | Corrupt/tampered downloads can install       | Keep direct GitHub Release install        |
| Run `npm pack --dry-run` and inspect tarball contents                                          | TBD   | Tarball file list reviewed               | Secrets, `.env`, caches, or source junk ship | Block publish                             |
| Run package install smoke test in a clean temp project                                         | TBD   | `pnpm add -g` or `pnpm dlx` smoke log    | Package works only inside repo               | Patch package files                       |
| Publish a pre-release tag first, such as `next` or `beta`                                      | TBD   | `npm view` output                        | Broken package goes to latest users          | Deprecate/unpublish within allowed window |
| Enable npm registry 2FA and provenance where available                                         | TBD   | Registry account/org settings            | Package takeover or provenance gap           | Delay package launch                      |

### Service Support Matrix

| OS / Runtime | Launch Claim                     | Service Mechanism                  | Required Before Claiming Support                         |
| ------------ | -------------------------------- | ---------------------------------- | -------------------------------------------------------- |
| Linux        | Supported service install        | systemd unit generated by CLI      | Fresh install, start, restart, logs, update, uninstall   |
| macOS        | Supported only if tested         | launchd plist generated by CLI     | Fresh install, boot persistence, logs, update, uninstall |
| Windows      | Experimental/manual unless built | Windows Service or Task Scheduler  | Intentional implementation and clean Windows smoke test  |
| Other Unix   | Manual run only                  | `pnpm start` or documented command | Explicit docs that service mode is unsupported           |

### Service Installer Tasks

| Task                                                                                     | Owner | Evidence                              | Risk If Skipped                            | Fallback                                   |
| ---------------------------------------------------------------------------------------- | ----- | ------------------------------------- | ------------------------------------------ | ------------------------------------------ |
| Linux CLI creates service user, config dir, env file, release dir, and systemd unit      | TBD   | Clean Linux VM install log            | pnpm package installs but cannot daemonize | Keep `scripts/install.sh` as required path |
| macOS CLI creates launchd plist and wrapper with env loading                             | TBD   | Clean macOS install log               | macOS users cannot run at boot             | Mark macOS service support as deferred     |
| Windows CLI refuses service install cleanly until Windows support exists                 | TBD   | Windows/manual test output            | Users get broken or partial install        | Document Windows manual-only mode          |
| CLI detects unsupported OS/arch and prints clear guidance                                | TBD   | Unsupported-platform test             | Confusing install failures                 | Link to manual docs                        |
| CLI has `--release`, `--version`, `--release-base-url`, and source fallback flags        | TBD   | CLI help and install tests            | Users cannot pin or mirror releases        | Keep direct release scripts documented     |
| CLI update path preserves install metadata and verifies checksums                        | TBD   | Before/after env diff and update log  | Updates switch mode or install bad assets  | Pin previous release                       |
| CLI uninstall path removes service files without deleting MongoDB/Nginx unless requested | TBD   | Uninstall log and host inspection     | User data or unrelated infra is removed    | Disable automated uninstall                |
| Docs clearly say pnpm installs the CLI, while service behavior is OS-specific            | TBD   | README/GO_LIVE/release notes reviewed | Overclaiming "all OSes supported"          | Use conservative support wording           |

## Operational Readiness

### Monitoring And Alerts

| Task                                                                                         | Owner | Evidence                            | Risk If Skipped                     | Fallback                                 |
| -------------------------------------------------------------------------------------------- | ----- | ----------------------------------- | ----------------------------------- | ---------------------------------------- |
| Confirm `/api/health` and `/api/health/ping` are suitable for uptime monitoring              | TBD   | Health endpoint response documented | External monitors give false signal | Add reverse-proxy or service-level check |
| Add uptime monitor for public demo/production site                                           | TBD   | Monitor config                      | Outages go unnoticed                | Manual post-launch checks                |
| Add alert channels for service down, high error rate, failed updates, and certificate expiry | TBD   | Alert test result                   | Incidents discovered by users       | Daily manual health review               |
| Confirm logs include request/action context but no secrets                                   | TBD   | Sample log review                   | Debugging weak or logs unsafe       | Increase structured logging selectively  |

### Backup, Restore, And Data Retention

| Task                                                                                              | Owner | Evidence                         | Risk If Skipped             | Fallback                      |
| ------------------------------------------------------------------------------------------------- | ----- | -------------------------------- | --------------------------- | ----------------------------- |
| Document MongoDB backup command                                                                   | TBD   | Runbook section or DEPLOY update | Users cannot back up        | Add emergency backup snippet  |
| Test restore into a clean instance                                                                | TBD   | Restore log and login test       | Backups may be unusable     | Treat launch as no-data beta  |
| Define retention for logs, AI runner output, terminal history, uploads, backups, and fleet events | TBD   | Retention note                   | Disk growth or privacy risk | Add cleanup job post-launch   |
| Verify backup files are not web-accessible                                                        | TBD   | Path/proxy review                | Data leak                   | Move backups outside web root |

### Support And Incident Response

| Task                                                                            | Owner | Evidence                  | Risk If Skipped                    | Fallback                             |
| ------------------------------------------------------------------------------- | ----- | ------------------------- | ---------------------------------- | ------------------------------------ |
| Create launch support channels: GitHub Issues, Discussions, email, or Discord   | TBD   | README/release note links | Users cannot report failures       | Use GitHub Issues only               |
| Add bug report template with OS, install mode, version, logs, and repro steps   | TBD   | Issue template            | Low-quality bug reports            | Ask manually in triage               |
| Add security policy with private disclosure path                                | TBD   | `SECURITY.md`             | Vulnerabilities disclosed publicly | Add temporary email in README        |
| Prepare incident runbook: identify, mitigate, communicate, rollback, postmortem | TBD   | Runbook exists            | Slow or improvised response        | Use this checklist and release notes |

### Legal, Privacy, And Trust

| Task                                                                    | Owner | Evidence              | Risk If Skipped                         | Fallback                                              |
| ----------------------------------------------------------------------- | ----- | --------------------- | --------------------------------------- | ----------------------------------------------------- |
| Verify license file and third-party license obligations                 | TBD   | License review        | Legal/compliance risk                   | Delay package-manager publishing                      |
| Document what telemetry, if any, is collected                           | TBD   | README/Privacy note   | Trust issue for self-hosted users       | State no telemetry if true, otherwise explain opt-out |
| Document security model: trusted admin app with host-level capabilities | TBD   | README/DEPLOY warning | Users expose powerful controls casually | Add prominent launch warning                          |
| Document supported OS/runtime versions                                  | TBD   | README/DEPLOY matrix  | Unsupported installs create noise       | Mark unsupported platforms best-effort                |

## Launch Test Matrix

| Scenario                                    | Required?              | Owner | Evidence               | Notes                             |
| ------------------------------------------- | ---------------------- | ----- | ---------------------- | --------------------------------- |
| Local dev startup with `.env.local`         | P0                     | TBD   | `pnpm dev` smoke       | Setup wizard/admin creation       |
| Production build                            | P0                     | TBD   | `pnpm build`           | Already included in `pnpm check`  |
| Unit/integration tests                      | P0                     | TBD   | `pnpm test`            | Already included in `pnpm check`  |
| E2E tests                                   | P0                     | TBD   | `pnpm test:e2e`        | At least auth/setup/dashboard     |
| Fresh source install on Ubuntu 22.04/24.04  | P0                     | TBD   | Install log            | Supported Linux path              |
| Fresh source install on Debian 11/12        | P1                     | TBD   | Install log            | Supported Debian path             |
| Fresh release artifact install, Linux x64   | P0                     | TBD   | Install log            | Common server target              |
| Fresh release artifact install, Linux arm64 | P1                     | TBD   | Install log            | Raspberry Pi/ARM target           |
| macOS launchd install                       | P1                     | TBD   | launchd status         | README advertises macOS always-on |
| Update from previous Git/source install     | P0                     | TBD   | Update log             | Existing users                    |
| Update from release install                 | P0                     | TBD   | Update log             | New default artifact path         |
| Fleet agent install and update              | P0 if Fleet advertised | TBD   | Node joins and updates | High-risk integration             |
| Nginx + HTTPS + websocket/SSE               | P0 for public domain   | TBD   | Browser test           | Terminal/SSE must work            |
| Backup and restore                          | P1                     | TBD   | Restore log            | Data safety                       |
| Rollback to previous release                | P0                     | TBD   | Rollback log           | Launch safety                     |

## Launch-Day Runbook

### T-7 To T-3 Days

- [ ] Freeze launch scope.
- [ ] Resolve P0 security and install/update blockers.
- [ ] Run dependency, secret, and license scans.
- [ ] Test fresh install and update paths on staging hosts.
- [ ] Draft release notes, known issues, and rollback instructions.
- [ ] Confirm support/security disclosure channels.

### T-2 To T-1 Days

- [ ] Run `pnpm format:check`.
- [ ] Run `pnpm check`.
- [ ] Run `pnpm test:e2e`.
- [ ] Run release dry run: `pnpm release patch --dry-run` or chosen bump.
- [ ] Verify staging install from a release-candidate tag or artifact.
- [ ] Create final launch issue with owners for every open P0/P1 item.

### T-0 Release

- [ ] Confirm `git status --short` is clean.
- [ ] Create release with `pnpm release patch`, `minor`, or `major`.
- [ ] Wait for GitHub Release workflow to finish.
- [ ] Download and verify `SHA256SUMS`.
- [ ] Smoke test hub artifact.
- [ ] Smoke test agent artifact if Fleet is in launch scope.
- [ ] Review generated GitHub Release notes and edit for clarity.
- [ ] Announce only after install/update smoke tests pass.

### T+1 To T+7 Days

- [ ] Monitor issues, failed installs, failed updates, and security reports daily.
- [ ] Track all launch bugs in a dedicated milestone.
- [ ] Patch release quickly for install/security/data-loss issues.
- [ ] Convert repeated support questions into docs.
- [ ] Review whether package-manager publishing is ready or should remain deferred.

## Pre-Announcement Final Checklist

- [ ] No unresolved P0 item remains.
- [ ] All unresolved P1/P2 items have owner, risk, and fallback.
- [ ] Release artifacts are downloadable and checksum-verified.
- [ ] Fresh install works.
- [ ] Update works.
- [ ] Rollback works.
- [ ] Security-sensitive modules have been reviewed.
- [ ] Docs match reality.
- [ ] Support path is visible.
- [ ] Known limitations are clearly stated.

## Recommended First Launch Positioning

For the first public release, position ServerMon as:

> A self-hosted, trusted-admin server monitoring and management platform. It has
> host-level capabilities, including terminal, files, services, updates, and
> fleet operations, so it should be deployed only by administrators on machines
> they control, preferably behind HTTPS and with strong authentication enabled.

This framing sets the right expectations and reduces unsafe casual deployments.
