# Alerts Module

## Purpose

The Alerts module is the central alerting and notification system for ServerMon. It aggregates alerts from all modules, provides alert management (acknowledge, snooze, resolve), and delivers notifications via multiple channels.

## Metrics/Charts

- **Active Alerts (Alert List)**: Severity, source module, message, timestamp, status
- **Alert Count by Severity (Donut Chart)**: Critical, Warning, Info counts
- **Alerts Over Time (Line Chart)**: Alert volume trend (hourly/daily)
- **Alert Sources (Pie Chart)**: Distribution of alerts by source module
- **Acknowledged vs Active (Stacked Bar)**: Alert status over time
- **MTTR by Module (Bar Chart)**: Mean Time To Resolve by source module
- **Alert History Table**: Full history with filters, pagination

## Data Sources

- MongoDB `alerts` collection - All alert documents
- MongoDB `alertConfig` collection - Alert threshold configurations
- MongoDB `alertRules` collection - Custom alert rules
- MongoDB `alertChannels` collection - Notification channel configs
- MongoDB `alertHistory` collection - Resolved/acknowledged alert history
- API endpoints from all modules for metric data

## UI

- **Header**: Module title, filter controls (severity, source, status), time range
- **Main Area**:
  - Alert summary cards (active, acknowledged, resolved counts)
  - Severity distribution chart
  - Active alerts table with actions (acknowledge, snooze, resolve, delete)
  - Alert detail modal with full message, source, timestamps, actions
  - Tab for alert history
- **Sidebar**: Quick filters (my alerts, unacknowledged, critical), create alert button
- **Configuration Panel** (modal/slide-out):
  - Threshold editor per metric/module
  - Notification channel setup (email, Slack, webhook, pushover)
  - Alert rule builder (conditions, actions, schedules)
  - Snooze management
- **Terminal**: Not applicable for this module

## Alerts/Integration

- **Self-Alerting**:
  - Alert module itself monitors all other modules
  - Alerts when alert delivery fails (critical)
  - Alert when MongoDB alert storage is unavailable (critical)
- **Integration**:
  - Consumes SSE metrics stream for threshold evaluation
  - Writes alerts to MongoDB
  - Triggers notification webhooks on new critical alerts

## Impl Notes

- Evaluate thresholds on incoming SSE metric data in real-time
- Store alert configs in MongoDB with per-module, per-metric thresholds
- Use MongoDB change streams for alert state changes
- Implement deduplication (don't re-alert on same condition within cooldown)
- Notification delivery via Node `nodemailer`, `axios` (webhooks), or similar
- Support multiple notification channels per alert severity
- Alert state machine: `firing` → `acknowledged` → `resolved`
- Store alert history with full context for analytics
- Run threshold evaluation in separate process to avoid blocking
- Use `setInterval` for periodic re-evaluation of conditions
