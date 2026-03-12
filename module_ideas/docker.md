# Docker Module

## Purpose
The Docker module monitors Docker containers, images, volumes, networks, and overall Docker daemon health. It provides real-time visibility into container performance and resource usage.

## Metrics/Charts
- **Container Status (Status Badges)**: Running, stopped, paused, restarting for each container
- **Container Resource Usage (Stacked Bar Chart)**: CPU% and Memory% per container
- **Container I/O (Line Chart)**: Read/write bytes per second per container
- **Network I/O by Container (Area Chart)**: Network bytes in/out per container
- **Container List Table**: Name, image, status, ports, created, networks
- **Image List Table**: Repository, tag, size, created, containers using
- **Docker Disk Usage (Pie Chart)**: Images, containers, volumes, build cache
- **Container Events (Live Feed)**: Real-time container start/stop/die events

## Data Sources
- `docker ps -a --format json` - All containers with details
- `docker stats --no-stream --format json` - Real-time container stats
- `docker images --format json` - Container images
- `docker volume ls --format json` - Docker volumes
- `docker network ls --format json` - Docker networks
- `docker info --format json` - Docker daemon information
- `docker system df` - Docker disk usage
- `docker events --since <timestamp>` - Container events stream
- `docker inspect <container>` - Detailed container info
- `crictl ps -a` - CRI-compatible container runtime (fallback for containerd)

## UI
- **Header**: Module title, Docker daemon selector (if multiple hosts), refresh interval
- **Main Area**:
  - Container status summary cards (running, stopped, paused counts)
  - Resource usage chart (containers by CPU/memory)
  - Container table with actions (start/stop/restart/logs/exec)
  - Expandable container details (ports, volumes, networks, env vars)
  - Images tab, Volumes tab, Networks tab
- **Sidebar**: Docker version, API version, storage driver, disk usage summary
- **Terminal**: Embedded xterm.js for Docker CLI (`docker`, `docker-compose`, `crictl`)

## Alerts/Integration
- **Thresholds**:
  - Container stopped unexpectedly (critical)
  - Container restart loop (> 3 restarts in 5 minutes) (critical)
  - Container CPU > 80% for > 5 minutes (warning), > 95% (critical)
  - Container memory > 80% of limit (warning), > 95% (critical)
  - Docker daemon unreachable (critical)
  - Disk usage > 80% (warning), > 90% (critical)
- **Integration**: Alert events stored in MongoDB, displayed in Alerts module dashboard

## Impl Notes
- Poll `docker stats` every 2-5 seconds; use `--no-stream` to avoid SSE conflict
- Use Docker socket (`/var/run/docker.sock`) for API access
- Require `docker` group membership or socket permissions
- Unprivileged user can monitor; need specific permissions for start/stop
- Parse JSON output from `docker --format json` for reliable parsing
- Subscribe to Docker events API for real-time container state changes
- Store container stats in MongoDB (1-minute aggregates for 24 hours)
