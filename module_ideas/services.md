# Services Module

## Purpose
The Services module monitors system services/daemons, their status, resource usage, and uptime. It provides a centralized view of all running services, enabling quick identification of failed or unresponsive services.

## Metrics/Charts
- **Service Status (Status Badges)**: Running, stopped, failed, activating for each service
- **CPU/Memory by Service (Stacked Bar Chart)**: Resource usage grouped by service
- **Uptime Table**: Service name, status, PID, uptime, restart count
- **Failed Services Count (Number Card)**: Count of failed services with trend
- **Service Restart History (Line Chart)**: Restart events over time
- **Resource Ranking (Horizontal Bar Chart)**: Top 10 services by CPU or memory

## Data Sources
- `systemctl list-units --type=service --all --no-pager --no-legend` - Service unit listing
- `systemctl status <service>` - Detailed service status
- `systemctl show <service>` - Service properties (MainPID, ActiveState, SubState, etc.)
- `ps aux --sort=-%cpu` or `ps aux --sort=-%mem` - Process resource usage
- `systemctl list-units --failed --type=service` - Failed services
- `journalctl -u <service> -n 50` - Recent logs for a service
- `systemctl list-timers --all` - Timer units and next run
- `service --status-all` - SysVinit services (fallback for non-systemd)

## UI
- **Header**: Module title, filter dropdown (all/running/failed), search input
- **Main Area**:
  - Status summary cards (running, stopped, failed counts)
  - Service resource chart (CPU/memory stacked by service)
  - Full service table with columns: Name, Status, PID, CPU%, Memory, Uptime, Restarts
  - Expandable rows showing recent logs for each service
- **Sidebar**: Quick actions (start/stop/restart buttons for selected services)
- **Terminal**: Embedded xterm.js for service management (`systemctl`, `service`, `journalctl`)

## Alerts/Integration
- **Thresholds**:
  - Service enters failed state (critical)
  - Service stops unexpectedly (critical)
  - Service restarts > 3 times in 1 hour (warning)
  - Service uses > 50% CPU continuously (warning), > 80% (critical)
  - Service uses > 2GB memory (warning), > 4GB (critical)
- **Integration**: Alert events stored in MongoDB, displayed in Alerts module dashboard

## Impl Notes
- Poll `systemctl` every 5-10 seconds for status changes
- Parse `systemctl show` JSON output where available
- Cache service list, update incrementally on status changes
- Require systemd; detect and handleSysVinit gracefully
- Unprivileged user may need `polkit` or sudo for start/stop
- Store service state history in MongoDB (status changes, restarts)
