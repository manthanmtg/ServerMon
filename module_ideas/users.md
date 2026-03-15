# Users Module

## Purpose

The Users module monitors logged-in users, user sessions, authentication events, and user account status. It helps administrators track user activity, detect unauthorized access, and manage user sessions.

## Metrics/Charts

- **Currently Logged In Users (User List)**: Username, TTY, IP address, login time, idle time
- **Session Timeline (Gantt Chart)**: Visual timeline of user sessions over past 24 hours
- **Login Events (Table)**: Recent login/logout events with timestamp, user, source IP
- **Failed Logins (Counter Card)**: Count of failed login attempts with trend
- **User Count (Number Card)**: Total users, logged in, with active sessions
- **Top Active Users (Bar Chart)**: Users by session duration or activity
- **User Types Distribution (Pie Chart)**: System users vs regular users vs root

## Data Sources

- `who` or `w` - Currently logged in users
- `last` - Recent login/logout history (parsed from /var/log/wtmp)
- `lastlog` - Last login time for all users
- `utmpdump /var/run/utmp` - Current user sessions in structured format
- `faillog` - Failed login attempts
- `/etc/passwd` - User account information
- `getent passwd` - User database query
- `id <username>` - User group memberships
- `ps -u <uid>` - Processes running as specific user

## UI

- **Header**: Module title, time range selector (live/1h/24h/7d), refresh control
- **Main Area**:
  - Current sessions card grid with user avatars/initials
  - Session timeline chart
  - Recent login events table with filters (success/failed)
  - Failed login attempts highlighted section
- **Sidebar**: User statistics (total, active, system, regular), quick session kill button
- **Terminal**: Embedded xterm.js for user management (`useradd`, `usermod`, `passwd`, `su`)

## Alerts/Integration

- **Thresholds**:
  - Root login from unexpected IP (critical)
  - Failed login attempts > 5 in 10 minutes (warning), > 10 (critical)
  - New user account created (warning)
  - User account locked (warning)
  - Concurrent sessions > 10 for single user (warning)
- **Integration**: Alert events stored in MongoDB, displayed in Alerts module dashboard

## Impl Notes

- Poll `who` and `w` every 5 seconds for real-time session tracking
- Parse `last` output for login history (may need logrotate consideration)
- Use `utmpdump` for reliable utmp parsing
- Cache `/etc/passwd` reads, invalidate on modification detection
- Unprivileged user can read most data; may need sudo for some operations
- Store login history in MongoDB for trend analysis (aggregate hourly)
