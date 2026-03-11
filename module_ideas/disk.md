# Disk Module

## Purpose
The Disk module monitors disk usage, I/O performance, and storage health across all mounted filesystems. It helps administrators prevent disk space exhaustion, identify I/O bottlenecks, and plan capacity upgrades.

## Metrics/Charts
- **Disk Usage (Gauge Chart)**: Percentage used for each mount point with color-coded thresholds
- **Usage Over Time (Area Chart)**: Disk usage percentage trend for selected filesystem
- **I/O Throughput (Line Chart)**: Read/write MB/s for each disk device
- **I/O Operations (Bar Chart)**: Read/write operations per second by device
- **Disk Space Table**: Mount point, total, used, available, usage %, inode usage
- **Top Directories (Bar Chart)**: Largest directories by size (scan results)
- **Disk Health Cards**: SMART status, temperature, rotation speed for SSDs/HDDs

## Data Sources
- `df -h` - Filesystem usage (mounted filesystems, space and inodes)
- `df -i` - Inode usage per filesystem
- `/proc/diskstats` - Disk I/O statistics (reads, writes, time spent)
- `iostat -x 1` - Extended I/O statistics (utilization, queue depth)
- `lsblk -J` - Block devices in JSON format
- `smartctl -a /dev/sdX` - SMART health data (if available)
- `du -sh /*` - Directory sizes (expensive, run on demand only)
- `pvs`, `vgs`, `lvs` - LVM physical volumes, volume groups, logical volumes

## UI
- **Header**: Module title, filesystem/device filter, refresh interval
- **Main Area**:
  - Disk usage gauges grid (all mounted filesystems)
  - I/O throughput chart (full width)
  - Split view: I/O operations chart (left), device table (right)
  - Expandable section for top directories (on-demand scan)
- **Sidebar**: Total storage, used, available across all filesystems
- **Terminal**: Embedded xterm.js for disk tools (`fdisk`, `parted`, `lsblk`, `smartctl`)

## Alerts/Integration
- **Thresholds**:
  - Disk usage > 80% (warning), > 90% (critical), > 95% (emergency)
  - Inode usage > 80% (warning), > 90% (critical)
  - I/O wait > 20% (warning), > 50% (critical)
  - Disk health degraded (critical)
- **Integration**: Alert events stored in MongoDB, displayed in Alerts module dashboard

## Impl Notes
- Poll `df` and `/proc/diskstats` every 5-30 seconds
- Cache directory scan results (run `du` on demand, not continuously)
- Use `iostat` with limited interval to avoid overhead
- Store historical data in MongoDB (5-minute aggregates for 30 days)
- Require root or disk group for SMART data; fall back gracefully
- All CLI commands sanitized, no arbitrary command execution
