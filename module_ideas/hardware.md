# Hardware Module

## Purpose

The Hardware module provides comprehensive hardware information including CPU, memory, motherboard, sensors, and peripheral devices. It helps administrators track hardware health, temperature, voltage, and system specifications.

## Metrics/Charts

- **CPU Info Card**: Model, cores, threads, architecture, frequency, flags
- **Memory Info Card**: Total, available, used, type, speed, slots
- **Motherboard Info Card**: Manufacturer, model, serial, BIOS version
- **Temperature Sensors (Gauge Chart)**: CPU, GPU, disk temperatures
- **Voltage Sensors (Line Chart)**: Vcore, +12V, +5V, +3.3V over time
- **Fan Speeds (Bar Chart)**: RPM for each detected fan
- **PCI/USB Devices Table**: Device, vendor, model, driver, slot
- **Disk Devices Table**: Model, serial, capacity, SMART status

## Data Sources

- `lscpu` - CPU information
- `dmidecode -t memory` - Detailed memory module info
- `dmidecode -t baseboard` - Motherboard info
- `dmidecode -t bios` - BIOS information
- `sensors` - Hardware sensors (lm-sensors package)
- `ipmi-sensors` - IPMI sensors (if IPMI available)
- `lsblk -J` - Block devices
- `lspci -vmm` - PCI devices in machine-readable format
- `lsusb -v` - USB devices
- `cat /proc/cpuinfo` - Detailed CPU info
- `cat /proc/meminfo` - Memory statistics
- `smartctl -i /dev/sdX` - Disk identification
- `inxi -Fxxxz` - Comprehensive hardware report (optional dependency)

## UI

- **Header**: Module title, refresh interval, export button (JSON/CSV)
- **Main Area**:
  - CPU/Memory/Motherboard info cards in grid
  - Sensors section: temperatures (gauges), voltages (line chart), fans (bar chart)
  - Expandable sections for PCI, USB, and storage devices
  - Historical sensor charts (temperature/voltage trends)
- **Sidebar**: System uptime, load average, hardware health summary
- **Terminal**: Embedded xterm.js for hardware tools (`lshw`, `dmidecode`, `sensors`)

## Alerts/Integration

- **Thresholds**:
  - CPU temperature > 80°C (warning), > 95°C (critical)
  - Memory usage > 90% (warning), > 95% (critical)
  - Any voltage > 10% from nominal (warning)
  - Fan stopped/failed (critical)
  - Disk SMART failure (critical)
  - BIOS update available (info)
- **Integration**: Alert events stored in MongoDB, displayed in Alerts module dashboard

## Impl Notes

- Poll sensors every 10-30 seconds; CPU/memory less frequently (30s-1m)
- Cache static hardware info (CPU model, memory slots) - refresh on boot
- Use `sensors -j` for JSON output when available
- Require `lm-sensors` package; fall back to `/sys/class/hwmon/` reading
- Require root/sudo for `dmidecode`; cache results with short TTL
- Store sensor history in MongoDB (5-minute aggregates for 7 days)
