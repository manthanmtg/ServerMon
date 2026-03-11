# Network Module

## Purpose
The Network module provides real-time monitoring of server network interfaces, bandwidth usage, connections, and network health. It helps administrators track network performance, identify bottlenecks, detect unusual traffic patterns, and ensure network services are running optimally.

## Metrics/Charts
- **Bandwidth Usage (Line Chart)**: Real-time upload/download throughput in Mbps for each interface
- **Network I/O (Area Chart)**: Bytes sent/received over time with stacked areas
- **Connections by State (Pie Chart)**: Distribution of TCP connections by state (ESTABLISHED, TIME_WAIT, CLOSE_WAIT, etc.)
- **Active Connections Table**: List of active connections with source/dest IP, port, state, process
- **Interface Status Cards**: Cards showing status (up/down), IP address, MTU, speed for each interface
- **Packet Statistics (Bar Chart)**: Packets sent, received, errors, drops per interface
- **Top Talkers (Bar Chart)**: Top 10 IP addresses by bandwidth usage (in/out combined)

## Data Sources
- `/proc/net/dev` - Network interface statistics (bytes, packets, errors, drops)
- `/proc/net/tcp` and `/proc/net/tcp6` - TCP connection details
- `ss -tunapl` - Socket statistics (alternative to netstat)
- `ip addr show` - Interface configuration and status
- `ip link show` - Interface states and MTU
- `netstat -i` - Interface statistics
- `hostname -I` - IP addresses

## UI
- **Header**: Module title, interface selector dropdown, refresh interval control
- **Main Area**:
  - Interface status cards grid (2-4 per row depending on viewport)
  - Primary bandwidth chart (full width, 300px height)
  - Split view: connections pie chart (left), packets bar chart (right)
  - Full-width active connections table with sortable columns
- **Sidebar**: Quick stats (total bandwidth, connection count, error count)
- **Terminal**: Embedded xterm.js terminal for running network diagnostics (`tcpdump`, `nethogs`, `iptraf`, `nmap`)

## Alerts/Integration
- **Thresholds**:
  - Bandwidth > 80% of interface speed (warning), > 95% (critical)
  - Packet error rate > 1% (warning), > 5% (critical)
  - Connection count > 10000 (warning), > 50000 (critical)
  - Interface down (critical)
- **Integration**: Alert events stored in MongoDB, displayed in Alerts module dashboard

## Impl Notes
- Poll `/proc/net/` files every 1-5 seconds (configurable)
- Use `ss` command for connection data (parse output, not raw socket reading)
- Store historical data in MongoDB (1-minute aggregates for 7 days, 5-minute for 30 days)
- Run network collection as unprivileged user with limited shell access
- All CLI commands run via Node `child_process.spawn` with strict sanitization
