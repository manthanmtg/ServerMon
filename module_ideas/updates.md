# Updates Module

## Purpose
The Updates module monitors available system and package updates, tracks update history, and helps administrators manage the update lifecycle. It integrates with package managers to provide a unified view of update status across the system.

## Metrics/Charts
- **Update Status Cards**: Security updates, regular updates, pending restarts count
- **Available Updates (Table)**: Package name, current version, new version, severity, repo
- **Updates Over Time (Area Chart)**: Installed/removed packages over time
- **Update History (Table)**: Date, packages updated, system version changes
- **Package Categories (Pie Chart)**: Security, optional, language packages
- **Pending Restart Services (List)**: Services requiring restart after update
- **Update Timeline (Gantt Chart)**: Scheduled update windows and execution

## Data Sources
- `apt list --upgradable` - APT upgradable packages (Debian/Ubuntu)
- `apt-get upgrade --dry-run` - Simulate upgrades
- `yum check-update` or `dnf check-update` - RHEL/CentOS/Fedora
- `zypper lu` - openSUSE package updates
- `pip list --outdated` - Python packages
- `npm outdated -g` - Global Node packages
- `snap refresh --list` - Snap package updates
- `flatpak update` - Flatpak updates
- `/var/log/dpkg.log` or `/var/log/yum.log` - Update history logs
- `needs-restarting -r` - Services requiring restart (requires package)
- `unattended-upgrades --dry-run` - Unattended upgrade simulation

## UI
- **Header**: Module title, OS detection badge, check for updates button, auto-check toggle
- **Main Area**:
  - Update status cards (security, regular, optional counts)
  - Available updates table with columns: Package, Current, New, Severity, Repository
  - Expandable rows showing package changelog/size
  - Update history table with date range filter
  - Tabs: Package Updates, Snap/Flatpak, Python/npm packages
- **Sidebar**: Last check time, next scheduled check, pending restart services
- **Actions Panel**: Select updates, preview changes, install selected, schedule update
- **Terminal**: Embedded xterm.js for package management (`apt`, `yum`, `dnf`, `pip`)

## Alerts/Integration
- **Thresholds**:
  - Security updates available (warning immediately)
  - Critical updates available (critical immediately)
  - System not updated > 7 days (warning)
  - System not updated > 30 days (critical)
  - Pending restart with unscheduled downtime (warning)
- **Integration**: Alert events stored in MongoDB, displayed in Alerts module dashboard

## Impl Notes
- Poll package managers every 1-6 hours (configurable)
- Cache apt/dnf metadata to reduce network overhead
- Parse changelogs from apt cache or package metadata
- Store update history in MongoDB (successful updates, failed attempts)
- Require root/sudo for actual updates; monitoring as unprivileged user
- Use distribution-specific commands; auto-detect OS from `/etc/os-release`
- Integrate with unattended-upgrades if configured
- Implement update preview/dry-run before execution
- Support manual and scheduled update execution
- Log all update actions with timestamps for audit trail
