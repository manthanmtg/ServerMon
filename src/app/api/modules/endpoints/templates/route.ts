import { NextResponse } from 'next/server';
import type { EndpointTemplate } from '@/modules/endpoints/types';

export const dynamic = 'force-dynamic';

const templates: EndpointTemplate[] = [
  // ═══════════════════════════════════════════════════
  //  MONITORING
  // ═══════════════════════════════════════════════════
  {
    id: 'health-check',
    name: 'Health Check',
    description:
      'Simple health check endpoint that returns server status, uptime, and load average',
    icon: 'HeartPulse',
    category: 'monitoring',
    method: 'GET',
    endpointType: 'script',
    scriptLang: 'bash',
    scriptContent: `#!/bin/bash
# Health Check — returns JSON with uptime and load
UPTIME=$(cat /proc/uptime 2>/dev/null | awk '{print $1}' || echo "N/A")
LOAD=$(cat /proc/loadavg 2>/dev/null | awk '{print $1}' || echo "N/A")
HOSTNAME=$(hostname 2>/dev/null || echo "unknown")

cat <<EOF
{
  "status": "healthy",
  "hostname": "$HOSTNAME",
  "uptime_seconds": $UPTIME,
  "load_1m": $LOAD,
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF`,
    docs: `# Health Check Endpoint

A lightweight health probe that returns the server's current status.

## Response

| Field | Type | Description |
|-------|------|-------------|
| \`status\` | string | Always \`"healthy"\` if the server responds |
| \`hostname\` | string | Machine hostname |
| \`uptime_seconds\` | number | Seconds since last boot |
| \`load_1m\` | number | 1-minute load average |
| \`timestamp\` | string | ISO 8601 UTC timestamp |

## Usage

\`\`\`bash
curl https://your-server/api/endpoints/health-check
\`\`\`

## Notes

- Reads from \`/proc/uptime\` and \`/proc/loadavg\` (Linux only).
- Returns \`"N/A"\` on non-Linux systems.
- Ideal for uptime monitors like UptimeRobot, Pingdom, or Kubernetes liveness probes.
`,
    tags: ['monitoring', 'health'],
  },
  {
    id: 'status-page',
    name: 'Status Page JSON',
    description:
      'Returns a structured JSON status page with CPU, memory, and uptime for external monitoring',
    icon: 'BarChart3',
    category: 'monitoring',
    method: 'GET',
    endpointType: 'script',
    scriptLang: 'node',
    scriptContent: `// Status Page — collects system metrics and outputs JSON
const os = require('os');

const status = {
  name: process.env.STATUS_NAME || 'My Server',
  status: 'operational',
  uptime: os.uptime(),
  memory: {
    total: os.totalmem(),
    free: os.freemem(),
    usedPercent: ((1 - os.freemem() / os.totalmem()) * 100).toFixed(1) + '%',
  },
  cpu: {
    cores: os.cpus().length,
    model: os.cpus()[0]?.model || 'unknown',
    loadAvg: os.loadavg(),
  },
  timestamp: new Date().toISOString(),
};

console.log(JSON.stringify(status, null, 2));`,
    docs: `# Status Page JSON

A comprehensive status page endpoint that aggregates CPU, memory, disk, and network info into a single JSON payload.

## Response Fields

| Section | Fields |
|---------|--------|
| **memory** | total, free, usedPercent |
| **cpu** | cores, model, loadAvg (1m, 5m, 15m) |
| **network** | interfaces with addresses |

## Integration

Feed this into a status page dashboard like Cachet or Instatus:

\`\`\`bash
curl -s https://your-server/api/endpoints/status-page | jq .
\`\`\`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| \`STATUS_NAME\` | My Server | Display name in the response |
`,
    tags: ['monitoring', 'status'],
  },
  {
    id: 'disk-usage',
    name: 'Disk Usage',
    description: 'Returns disk usage statistics for the root partition in a clean JSON format',
    icon: 'HardDrive',
    category: 'monitoring',
    method: 'GET',
    endpointType: 'script',
    scriptLang: 'bash',
    scriptContent: `#!/bin/bash
# Disk Usage — returns JSON with space info
df -h / | awk 'NR==2 {printf "{\\\"total\\\": \\\"%s\\\", \\\"used\\\": \\\"%s\\\", \\\"available\\\": \\\"%s\\\", \\\"percent\\\": \\\"%s\\\"}", $2, $3, $4, $5}'`,
    docs: `# Disk Usage

Reports disk usage for the root partition (\`/\`) as structured JSON.

## Response

| Field | Example | Description |
|-------|---------|-------------|
| \`total\` | \`"50G"\` | Total disk space |
| \`used\` | \`"32G"\` | Used disk space |
| \`available\` | \`"16G"\` | Available space |
| \`percent\` | \`"68%"\` | Usage percentage |

## Alerts

Pair with a cron job or monitoring integration to alert when usage exceeds a threshold:

\`\`\`bash
PCT=$(curl -s .../disk-usage | jq -r '.percent' | tr -d '%')
[ "$PCT" -gt 90 ] && echo "Disk alert!"
\`\`\`
`,
    tags: ['monitoring', 'disk'],
  },
  {
    id: 'memory-stats',
    name: 'Memory Stats',
    description: 'Returns detailed memory usage metrics parsed from /proc/meminfo',
    icon: 'Cpu',
    category: 'monitoring',
    method: 'GET',
    endpointType: 'script',
    scriptLang: 'bash',
    scriptContent: `#!/bin/bash
# Memory Stats — returns JSON from /proc/meminfo
grep -E 'MemTotal|MemFree|MemAvailable|Buffers|Cached' /proc/meminfo | awk '{printf "\\\"%s\\\": \\\"%s %s\\\",", substr($1, 1, length($1)-1), $2, $3}' | sed 's/,$//' | awk '{print "{" $0 "}"}'`,
    docs: `# Memory Stats

Reads \`/proc/meminfo\` and returns key memory metrics as JSON.

## Response

| Field | Type | Description |
|-------|------|-------------|
| \`MemTotal\` | string | Total physical memory |
| \`MemFree\` | string | Free memory |
| \`MemAvailable\` | string | Available memory (includes cache) |
| \`Buffers\` | string | Kernel buffer memory |
| \`Cached\` | string | Page cache memory |
| \`SwapTotal\` | string | Total swap space |
| \`SwapFree\` | string | Free swap space |

## Notes

- Linux only — reads directly from \`/proc/meminfo\`.
- Values include the unit suffix (e.g. \`"8042132 kB"\`).
`,
    tags: ['monitoring', 'memory'],
  },
  {
    id: 'process-list',
    name: 'Top Processes',
    description: 'Returns the top 5 processes ranked by memory usage with CPU and PID info',
    icon: 'List',
    category: 'monitoring',
    method: 'GET',
    endpointType: 'script',
    scriptLang: 'node',
    scriptContent: `// Top Processes — using ps command
const { exec } = require('child_process');

exec('ps aux --sort=-%mem | head -n 6', (err, stdout) => {
  if (err) {
    console.log(JSON.stringify({ error: err.message }));
    return;
  }
  const lines = stdout.trim().split('\\n');
  const headers = lines[0].split(/\\s+/);
  const processes = lines.slice(1).map(line => {
    const parts = line.split(/\\s+/);
    return {
      user: parts[0],
      pid: parts[1],
      cpu: parts[2],
      mem: parts[3],
      command: parts.slice(10).join(' ')
    };
  });
  console.log(JSON.stringify({ processes }));
});`,
    docs: `# Top Processes

Returns the top 5 memory-consuming processes with CPU, memory percentage, and PID.

## Response

An array of process objects:

| Field | Type | Description |
|-------|------|-------------|
| \`pid\` | string | Process ID |
| \`cpu\` | string | CPU usage % |
| \`mem\` | string | Memory usage % |
| \`command\` | string | Process command name |

## Customization

Modify the \`head -5\` value in the script to change how many processes are returned. Change \`--sort=-%mem\` to \`--sort=-%cpu\` to rank by CPU instead.
`,
    tags: ['monitoring', 'processes'],
  },
  {
    id: 'cpu-temperature',
    name: 'CPU Temperature',
    description: 'Reads CPU thermal zone temperatures and returns them as structured JSON',
    icon: 'Thermometer',
    category: 'monitoring',
    method: 'GET',
    endpointType: 'script',
    scriptLang: 'python',
    scriptContent: `import json
import os
import glob

# CPU Temperature — reads thermal zones
zones = glob.glob("/sys/class/thermal/thermal_zone*/temp")
temps = []

for zone_path in sorted(zones):
    zone_name = zone_path.split("/")[-2]
    try:
        with open(zone_path) as f:
            raw = int(f.read().strip())
            temps.append({
                "zone": zone_name,
                "celsius": round(raw / 1000.0, 1)
            })
    except (IOError, ValueError):
        pass

result = {
    "temperatures": temps,
    "count": len(temps),
    "unit": "celsius"
}
print(json.dumps(result))`,
    docs: `# CPU Temperature

Reads thermal zone sensors and returns CPU temperatures.

## Response

| Field | Type | Description |
|-------|------|-------------|
| \`zone\` | string | Thermal zone name (e.g. \`thermal_zone0\`) |
| \`type\` | string | Sensor type (e.g. \`x86_pkg_temp\`) |
| \`temp_celsius\` | number | Temperature in degrees Celsius |

## Requirements

- Linux with \`/sys/class/thermal/\` available.
- May require root access depending on the system.
- Returns an empty array on systems without thermal sensors (e.g. VMs).
`,
    tags: ['monitoring', 'temperature', 'hardware'],
  },
  {
    id: 'io-stats',
    name: 'I/O Statistics',
    description: 'Returns disk I/O read/write statistics from /proc/diskstats',
    icon: 'Activity',
    category: 'monitoring',
    method: 'GET',
    endpointType: 'script',
    scriptLang: 'bash',
    scriptContent: `#!/bin/bash
# I/O Statistics — parses /proc/diskstats for main block devices
echo "["
FIRST=true
for DISK in sda sdb nvme0n1 vda; do
  LINE=$(grep " $DISK " /proc/diskstats 2>/dev/null)
  if [ -n "$LINE" ]; then
    READS=$(echo "$LINE" | awk '{print $6}')
    WRITES=$(echo "$LINE" | awk '{print $10}')
    if [ "$FIRST" = true ]; then FIRST=false; else echo ","; fi
    printf '{"device":"%s","reads_completed":%s,"writes_completed":%s}' "$DISK" "$READS" "$WRITES"
  fi
done
echo "]"`,
    docs: `# I/O Statistics

Reads disk I/O metrics from \`/proc/diskstats\` for physical block devices.

## Response

An array of device objects:

| Field | Type | Description |
|-------|------|-------------|
| \`device\` | string | Block device name (e.g. \`sda\`, \`nvme0n1\`) |
| \`reads_completed\` | number | Total completed read operations |
| \`writes_completed\` | number | Total completed write operations |

## Notes

- Filters to physical devices only (\`sd*\`, \`nvme*\`, \`vd*\`).
- Take two samples over time to compute throughput rates.
`,
    tags: ['monitoring', 'disk', 'io'],
  },

  // ═══════════════════════════════════════════════════
  //  SECURITY
  // ═══════════════════════════════════════════════════
  {
    id: 'ssl-expiry',
    name: 'SSL Expiry Checker',
    description: 'Check the expiration date of an SSL certificate for any domain',
    icon: 'ShieldCheck',
    category: 'security',
    method: 'POST',
    endpointType: 'script',
    scriptLang: 'python',
    scriptContent: `import ssl
import socket
import json
import sys
from datetime import datetime

# SSL Expiry — reads domain from request body
body = sys.stdin.read()
try:
    data = json.loads(body) if body.strip() else {}
except json.JSONDecodeError:
    data = {}

hostname = data.get("domain", "google.com")
port = 443

context = ssl.create_default_context()
try:
    with socket.create_connection((hostname, port), timeout=5) as sock:
        with context.wrap_socket(sock, server_hostname=hostname) as ssock:
            cert = ssock.getpeercert()
            expiry_str = cert['notAfter']
            expiry_date = datetime.strptime(expiry_str, '%b %d %H:%M:%S %Y %Z')
            days_left = (expiry_date - datetime.utcnow()).days
            
            result = {
                "domain": hostname,
                "expiry": expiry_str,
                "days_remaining": days_left,
                "status": "valid" if days_left > 30 else "expiring soon"
            }
except Exception as e:
    result = {"error": str(e), "domain": hostname}

print(json.dumps(result))`,
    docs: `# SSL Expiry Checker

Checks the TLS certificate expiration date for any domain.

## Request Body

\`\`\`json
{ "domain": "example.com" }
\`\`\`

## Response

| Field | Type | Description |
|-------|------|-------------|
| \`domain\` | string | Checked domain |
| \`expiry\` | string | Certificate expiry date |
| \`days_remaining\` | number | Days until expiration |
| \`status\` | string | \`"valid"\` or \`"expiring soon"\` (< 30 days) |

## Automation

Schedule daily checks and alert when \`days_remaining < 14\`:

\`\`\`bash
curl -s -X POST -d '{"domain":"mysite.com"}' .../ssl-expiry | jq .days_remaining
\`\`\`
`,
    tags: ['security', 'ssl'],
  },
  {
    id: 'firewall-status',
    name: 'Firewall Status',
    description: 'Returns the current UFW or iptables firewall rules as JSON',
    icon: 'Shield',
    category: 'security',
    method: 'GET',
    endpointType: 'script',
    scriptLang: 'bash',
    scriptContent: `#!/bin/bash
# Firewall Status — checks UFW first, falls back to iptables
if command -v ufw &>/dev/null; then
  STATUS=$(ufw status 2>/dev/null)
  ACTIVE=$(echo "$STATUS" | head -1)
  RULES=$(echo "$STATUS" | tail -n +4 | head -20)
  printf '{"firewall":"ufw","status":"%s","rules":"%s"}' "$ACTIVE" "$(echo "$RULES" | tr '\\n' '|' | sed 's/"/\\\\"/g')"
elif command -v iptables &>/dev/null; then
  COUNT=$(iptables -L -n 2>/dev/null | wc -l)
  printf '{"firewall":"iptables","rule_lines":%d}' "$COUNT"
else
  echo '{"firewall":"none","status":"no firewall detected"}'
fi`,
    docs: `# Firewall Status

Returns the current firewall configuration. Checks UFW first, falls back to iptables.

## Response

| Field | Type | Description |
|-------|------|-------------|
| \`firewall\` | string | \`"ufw"\`, \`"iptables"\`, or \`"none"\` |
| \`status\` | string | Active/inactive status |
| \`rules\` | string | Pipe-delimited rule summary (UFW) |

## Notes

- Requires appropriate permissions to read firewall rules.
- On systems without a firewall, returns \`"no firewall detected"\`.
`,
    tags: ['security', 'firewall'],
  },
  {
    id: 'failed-logins',
    name: 'Failed Login Attempts',
    description: 'Scans auth logs for recent failed SSH login attempts and returns a summary',
    icon: 'UserX',
    category: 'security',
    method: 'GET',
    endpointType: 'script',
    scriptLang: 'python',
    scriptContent: `import json
import subprocess
import re
from collections import Counter

# Failed Logins — parses auth log for failed SSH attempts
try:
    output = subprocess.check_output(
        ["grep", "-i", "failed password", "/var/log/auth.log"],
        stderr=subprocess.DEVNULL, text=True
    )
except (subprocess.CalledProcessError, FileNotFoundError):
    output = ""

ips = re.findall(r'from (\\d+\\.\\d+\\.\\d+\\.\\d+)', output)
counter = Counter(ips)
top_offenders = [{"ip": ip, "attempts": count} for ip, count in counter.most_common(10)]

result = {
    "total_failed": len(ips),
    "unique_ips": len(counter),
    "top_offenders": top_offenders,
}
print(json.dumps(result))`,
    docs: `# Failed Login Attempts

Parses \`/var/log/auth.log\` for failed SSH password attempts.

## Response

| Field | Type | Description |
|-------|------|-------------|
| \`total_failed\` | number | Total failed attempts found |
| \`unique_ips\` | number | Number of distinct source IPs |
| \`top_offenders\` | array | Top 10 IPs by attempt count |

## Security Tips

- Use this with a cron job to auto-ban repeat offenders via \`fail2ban\`.
- Requires read access to \`/var/log/auth.log\`.
- On CentOS/RHEL, the log may be at \`/var/log/secure\` instead.
`,
    tags: ['security', 'ssh', 'audit'],
  },
  {
    id: 'open-ports',
    name: 'Open Ports Scanner',
    description: 'Lists all open listening ports with their associated processes',
    icon: 'Radio',
    category: 'security',
    method: 'GET',
    endpointType: 'script',
    scriptLang: 'node',
    scriptContent: `// Open Ports Scanner — uses ss/netstat to find listening ports
const { exec } = require('child_process');

exec('ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null', (err, stdout) => {
  if (err) {
    console.log(JSON.stringify({ error: err.message }));
    return;
  }
  const lines = stdout.trim().split('\\n').slice(1);
  const ports = lines.map(line => {
    const parts = line.split(/\\s+/).filter(Boolean);
    const local = parts[3] || '';
    const portMatch = local.match(/:([\\d]+)$/);
    return {
      address: local,
      port: portMatch ? parseInt(portMatch[1]) : null,
      state: parts[0],
      process: parts[parts.length - 1] || 'unknown'
    };
  }).filter(p => p.port);

  console.log(JSON.stringify({ listening: ports, count: ports.length }));
});`,
    docs: `# Open Ports Scanner

Lists all TCP ports in LISTEN state with their associated process.

## Response

| Field | Type | Description |
|-------|------|-------------|
| \`listening\` | array | Array of port objects |
| \`count\` | number | Total open ports |

Each port object:

| Field | Type | Description |
|-------|------|-------------|
| \`address\` | string | Bind address and port |
| \`port\` | number | Port number |
| \`process\` | string | Process name/PID |

## Notes

- Uses \`ss\` (preferred) with \`netstat\` as fallback.
- May require root to see process names.
`,
    tags: ['security', 'network', 'ports'],
  },
  {
    id: 'file-integrity',
    name: 'File Integrity Check',
    description:
      'Computes SHA-256 checksums of critical system files to detect unauthorized changes',
    icon: 'FileCheck',
    category: 'security',
    method: 'POST',
    endpointType: 'script',
    scriptLang: 'python',
    scriptContent: `import json
import sys
import hashlib
import os

# File Integrity — computes SHA-256 of specified files
body = sys.stdin.read()
try:
    data = json.loads(body) if body.strip() else {}
except json.JSONDecodeError:
    data = {}

files = data.get("files", [
    "/etc/passwd",
    "/etc/shadow",
    "/etc/ssh/sshd_config",
    "/etc/hosts"
])

results = []
for filepath in files:
    entry = {"file": filepath}
    try:
        with open(filepath, "rb") as f:
            h = hashlib.sha256(f.read()).hexdigest()
            entry["sha256"] = h
            entry["size"] = os.path.getsize(filepath)
            entry["status"] = "ok"
    except FileNotFoundError:
        entry["status"] = "not_found"
    except PermissionError:
        entry["status"] = "permission_denied"
    results.append(entry)

print(json.dumps({"files": results, "checked": len(results)}))`,
    docs: `# File Integrity Check

Computes SHA-256 checksums of critical system files to detect tampering.

## Request Body (optional)

\`\`\`json
{ "files": ["/etc/passwd", "/etc/ssh/sshd_config"] }
\`\`\`

Defaults to \`/etc/passwd\`, \`/etc/shadow\`, \`/etc/ssh/sshd_config\`, \`/etc/hosts\`.

## Response

| Field | Type | Description |
|-------|------|-------------|
| \`file\` | string | File path |
| \`sha256\` | string | SHA-256 hex digest |
| \`size\` | number | File size in bytes |
| \`status\` | string | \`"ok"\`, \`"not_found"\`, or \`"permission_denied"\` |

## Usage

Store baseline checksums and compare on subsequent runs to detect unauthorized changes.
`,
    tags: ['security', 'integrity', 'audit'],
  },

  // ═══════════════════════════════════════════════════
  //  DEVOPS
  // ═══════════════════════════════════════════════════
  {
    id: 'service-restart',
    name: 'Service Restart',
    description: 'Restart a systemd service by name with an allowlist for safety',
    icon: 'RotateCcw',
    category: 'devops',
    method: 'POST',
    endpointType: 'script',
    scriptLang: 'bash',
    scriptContent: `#!/bin/bash
# Service Restart — reads service name from ENDPOINT_BODY
SERVICE=$(echo "$ENDPOINT_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('service',''))" 2>/dev/null)

if [ -z "$SERVICE" ]; then
  echo '{"error": "Missing service name in request body"}'
  exit 1
fi

# Safety: only allow restarting known services
ALLOWED="nginx apache2 mysql postgresql redis"
if ! echo "$ALLOWED" | grep -qw "$SERVICE"; then
  echo "{\\\"error\\\": \\\"Service '$SERVICE' is not in the allowed list\\\"}"
  exit 1
fi

if systemctl restart "$SERVICE" 2>&1; then
  STATUS=$(systemctl is-active "$SERVICE")
  echo "{\\\"success\\\": true, \\\"service\\\": \\\"$SERVICE\\\", \\\"status\\\": \\\"$STATUS\\\"}"
else
  echo "{\\\"error\\\": \\\"Failed to restart $SERVICE\\\"}"
  exit 1
fi`,
    docs: `# Service Restart

Restarts a systemd service by name, with an allowlist for safety.

## Request Body

\`\`\`json
{ "service": "nginx" }
\`\`\`

## Allowed Services

\`nginx\`, \`apache2\`, \`mysql\`, \`postgresql\`, \`redis\`

Edit the \`ALLOWED\` variable in the script to customize.

## Response

| Field | Type | Description |
|-------|------|-------------|
| \`service\` | string | Service name |
| \`status\` | string | \`"restarted"\` or error message |

## Security

> **Warning**: This endpoint triggers \`systemctl restart\`. Use token auth and restrict the allowlist in production.
`,
    tags: ['service', 'management'],
  },
  {
    id: 'log-searcher',
    name: 'Log Searcher',
    description: 'Search any log file for a specific pattern with configurable result limits',
    icon: 'Search',
    category: 'devops',
    method: 'POST',
    endpointType: 'script',
    scriptLang: 'node',
    scriptContent: `// Log Searcher — reads filename and pattern from body
const fs = require('fs');
const readline = require('readline');

const body = process.env.ENDPOINT_BODY || '{}';
let config = {};
try { config = JSON.parse(body); } catch(e) {}

const file = config.file || '/var/log/syslog';
const pattern = config.pattern || 'error';
const limit = config.limit || 10;

if (!fs.existsSync(file)) {
  console.log(JSON.stringify({ error: 'File not found', file }));
  process.exit(1);
}

const results = [];
const rl = readline.createInterface({
  input: fs.createReadStream(file),
  terminal: false
});

rl.on('line', (line) => {
  if (line.toLowerCase().includes(pattern.toLowerCase())) {
    results.push(line);
    if (results.length >= limit) rl.close();
  }
});

rl.on('close', () => {
  console.log(JSON.stringify({ file, pattern, matches: results }));
});`,
    docs: `# Log Searcher

Searches any log file for a pattern and returns matching lines.

## Request Body

\`\`\`json
{
  "file": "/var/log/syslog",
  "pattern": "error",
  "limit": 50
}
\`\`\`

## Response

| Field | Type | Description |
|-------|------|-------------|
| \`file\` | string | Searched file path |
| \`pattern\` | string | Search pattern used |
| \`matches\` | array | Array of \`{ line, text }\` objects |

## Notes

- Case-insensitive search.
- Defaults to 100 result limit.
- Only reads files — no write operations.
`,
    tags: ['logs', 'search'],
  },
  {
    id: 'docker-containers',
    name: 'Docker Containers',
    description: 'Lists all Docker containers with their status, image, and resource usage',
    icon: 'Container',
    category: 'devops',
    method: 'GET',
    endpointType: 'script',
    scriptLang: 'node',
    scriptContent: `// Docker Containers — lists all containers via docker CLI
const { exec } = require('child_process');

const format = '{"id":"{{.ID}}","name":"{{.Names}}","image":"{{.Image}}","status":"{{.Status}}","ports":"{{.Ports}}","state":"{{.State}}"}';
exec(\`docker ps -a --format '\${format}'\`, (err, stdout) => {
  if (err) {
    console.log(JSON.stringify({ error: 'Docker not available or not running', detail: err.message }));
    return;
  }
  const containers = stdout.trim().split('\\n')
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);

  console.log(JSON.stringify({
    containers,
    total: containers.length,
    running: containers.filter(c => c.state === 'running').length,
  }));
});`,
    docs: `# Docker Containers

Lists all Docker containers with their status, image, and state.

## Response

| Field | Type | Description |
|-------|------|-------------|
| \`containers\` | array | Container objects |
| \`total\` | number | Total containers |
| \`running\` | number | Currently running |

Each container:

| Field | Description |
|-------|-------------|
| \`id\` | Short container ID |
| \`name\` | Container name |
| \`image\` | Image name |
| \`state\` | \`running\`, \`exited\`, etc. |
| \`status\` | Human-readable status |

## Requirements

- Docker must be installed and the executing user needs Docker socket access.
`,
    tags: ['docker', 'containers', 'devops'],
  },
  {
    id: 'deploy-trigger',
    name: 'Deploy Trigger',
    description: 'Triggers a deployment by running a configurable deploy script with safety checks',
    icon: 'Rocket',
    category: 'devops',
    method: 'POST',
    endpointType: 'script',
    scriptLang: 'bash',
    scriptContent: `#!/bin/bash
# Deploy Trigger — runs a deploy script with environment validation
DEPLOY_DIR=\${DEPLOY_DIR:-"/opt/app"}
DEPLOY_SCRIPT=\${DEPLOY_SCRIPT:-"./deploy.sh"}
DEPLOY_BRANCH=\${DEPLOY_BRANCH:-"main"}

# Validate directory exists
if [ ! -d "$DEPLOY_DIR" ]; then
  echo "{\\\"error\\\": \\\"Deploy directory not found: $DEPLOY_DIR\\\"}"
  exit 1
fi

cd "$DEPLOY_DIR" || exit 1

# Pull latest
GIT_OUTPUT=$(git pull origin "$DEPLOY_BRANCH" 2>&1)
GIT_STATUS=$?

if [ $GIT_STATUS -ne 0 ]; then
  echo "{\\\"error\\\": \\\"Git pull failed\\\", \\\"output\\\": \\\"$GIT_OUTPUT\\\"}"
  exit 1
fi

# Get current commit
COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

cat <<EOF
{
  "status": "deployed",
  "branch": "$DEPLOY_BRANCH",
  "commit": "$COMMIT",
  "directory": "$DEPLOY_DIR",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF`,
    docs: `# Deploy Trigger

Triggers a deployment by running a configurable deploy script.

## Request Body

\`\`\`json
{ "ref": "main" }
\`\`\`

## Workflow

1. Reads the git ref from the request body (defaults to \`main\`).
2. Runs \`git fetch\` and \`git checkout\` in the deploy directory.
3. Returns deployment status with commit hash and timestamp.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| \`DEPLOY_DIR\` | \`/opt/app\` | Directory to deploy into |

## Security

> **Important**: Always use token auth. Restrict who can trigger deployments.
`,
    tags: ['deploy', 'git', 'devops'],
  },
  {
    id: 'cron-jobs',
    name: 'Cron Jobs List',
    description: 'Returns all cron jobs for the current user and system-wide schedules',
    icon: 'Clock',
    category: 'devops',
    method: 'GET',
    endpointType: 'script',
    scriptLang: 'python',
    scriptContent: `import json
import subprocess

# Cron Jobs — lists user and system crontabs
result = {"user_crons": [], "system_crons": []}

# User crontab
try:
    output = subprocess.check_output(
        ["crontab", "-l"], stderr=subprocess.DEVNULL, text=True
    )
    result["user_crons"] = [
        line.strip() for line in output.splitlines()
        if line.strip() and not line.startswith("#")
    ]
except subprocess.CalledProcessError:
    result["user_crons"] = []

# System cron directories
import os
for cron_dir in ["/etc/cron.d", "/etc/cron.daily", "/etc/cron.hourly"]:
    if os.path.isdir(cron_dir):
        files = os.listdir(cron_dir)
        result["system_crons"].append({
            "directory": cron_dir,
            "scripts": files
        })

result["total_user"] = len(result["user_crons"])
print(json.dumps(result))`,
    docs: `# Cron Jobs List

Returns all cron jobs for the current user and system-wide schedules.

## Response

| Field | Type | Description |
|-------|------|-------------|
| \`user_crons\` | array | Current user's crontab entries |
| \`system_crons\` | array | Files in \`/etc/cron.d/\` |
| \`total_user\` | number | Count of user cron entries |

## Notes

- Filters out comments and empty lines.
- System crons listed are filenames only, not contents.
- Requires read access to \`/etc/cron.d/\`.
`,
    tags: ['cron', 'scheduling', 'devops'],
  },
  {
    id: 'systemd-services',
    name: 'Systemd Services',
    description: 'Lists all active systemd services with their load and sub-state',
    icon: 'Layers',
    category: 'devops',
    method: 'GET',
    endpointType: 'script',
    scriptLang: 'bash',
    scriptContent: `#!/bin/bash
# Systemd Services — lists active services as JSON array
echo "["
FIRST=true
systemctl list-units --type=service --state=active --no-pager --no-legend 2>/dev/null | head -20 | while read -r UNIT LOAD ACTIVE SUB REST; do
  if [ "$FIRST" = true ]; then FIRST=false; else echo ","; fi
  printf '{"unit":"%s","load":"%s","active":"%s","sub":"%s"}' "$UNIT" "$LOAD" "$ACTIVE" "$SUB"
done
echo "]"`,
    docs: `# Systemd Services

Lists all active systemd services with load and sub-state.

## Response

An array of service objects:

| Field | Type | Description |
|-------|------|-------------|
| \`unit\` | string | Service unit name |
| \`load\` | string | Load state (\`loaded\`, etc.) |
| \`active\` | string | Active state (\`active\`, \`inactive\`) |
| \`sub\` | string | Sub-state (\`running\`, \`exited\`, etc.) |

## Notes

- Uses \`systemctl list-units --type=service --state=active\`.
- Only shows currently active services.
`,
    tags: ['systemd', 'services', 'devops'],
  },

  // ═══════════════════════════════════════════════════
  //  INTEGRATIONS
  // ═══════════════════════════════════════════════════
  {
    id: 'webhook-receiver',
    name: 'Webhook Receiver',
    description:
      'Receives webhook payloads from any service, logs them, and returns a confirmation',
    icon: 'Webhook',
    category: 'integrations',
    method: 'POST',
    endpointType: 'script',
    scriptLang: 'node',
    scriptContent: `// Webhook Receiver — reads body from stdin, processes it
const chunks = [];
process.stdin.on('data', (chunk) => chunks.push(chunk));
process.stdin.on('end', () => {
  const body = Buffer.concat(chunks).toString();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = { raw: body };
  }

  const result = {
    received: true,
    event: parsed.event || 'unknown',
    timestamp: new Date().toISOString(),
    bodySize: body.length,
  };

  console.log(JSON.stringify(result));
});`,
    docs: `# Webhook Receiver

A general-purpose webhook receiver that accepts POST payloads, logs them, and returns a confirmation.

## How It Works

1. Reads the incoming JSON body from stdin.
2. Logs the payload to stdout for the execution log.
3. Returns a confirmation with the received fields and a timestamp.

## Response

| Field | Type | Description |
|-------|------|-------------|
| \`received\` | boolean | Always \`true\` |
| \`fields\` | array | Keys found in the payload |
| \`timestamp\` | string | ISO 8601 timestamp |

## Use Cases

- GitHub / GitLab webhook target
- Stripe event receiver
- Generic event sink for debugging
`,
    tags: ['webhook', 'integration'],
  },
  {
    id: 'slack-notifier',
    name: 'Slack Notifier',
    description: 'Forward a message to a Slack channel via incoming webhook URL',
    icon: 'MessageSquare',
    category: 'integrations',
    method: 'POST',
    endpointType: 'webhook',
    webhookConfig: {
      targetUrl: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL',
      method: 'POST',
      forwardHeaders: false,
      transformBody: `return { text: input.message || 'Notification from ServerMon' };`,
    },
    docs: `# Slack Notifier

Forwards a message to a Slack channel via an Incoming Webhook URL.

## Setup

1. Create a [Slack Incoming Webhook](https://api.slack.com/messaging/webhooks).
2. Set the webhook URL as the **Target URL** in the webhook config.

## Request Body

\`\`\`json
{ "message": "Deployment complete!" }
\`\`\`

## Transform

The body transformer maps \`input.message\` to Slack's \`text\` field. Customize to add blocks, attachments, or mentions.
`,
    tags: ['notification', 'slack'],
  },
  {
    id: 'discord-notifier',
    name: 'Discord Notifier',
    description: 'Send a message to a Discord channel via webhook integration',
    icon: 'MessageCircle',
    category: 'integrations',
    method: 'POST',
    endpointType: 'webhook',
    webhookConfig: {
      targetUrl: 'https://discord.com/api/webhooks/YOUR/WEBHOOK/URL',
      method: 'POST',
      forwardHeaders: false,
      transformBody: `return { content: input.message || 'Notification from ServerMon' };`,
    },
    docs: `# Discord Notifier

Sends a message to a Discord channel via a webhook URL.

## Setup

1. In your Discord server, go to **Channel Settings > Integrations > Webhooks**.
2. Create a webhook and copy the URL.
3. Set it as the **Target URL**.

## Request Body

\`\`\`json
{ "message": "Server alert: high CPU usage" }
\`\`\`

## Transform

Maps \`input.message\` to Discord's \`content\` field. Extend the transformer to add embeds for richer notifications.
`,
    tags: ['notification', 'discord'],
  },
  {
    id: 'telegram-notifier',
    name: 'Telegram Bot',
    description: 'Send messages to a Telegram chat using the Bot API',
    icon: 'Send',
    category: 'integrations',
    method: 'POST',
    endpointType: 'webhook',
    webhookConfig: {
      targetUrl: 'https://api.telegram.org/botYOUR_BOT_TOKEN/sendMessage',
      method: 'POST',
      forwardHeaders: false,
      transformBody: `return { chat_id: input.chat_id || 'YOUR_CHAT_ID', text: input.message || 'Alert from ServerMon', parse_mode: 'Markdown' };`,
    },
    docs: `# Telegram Bot

Sends messages to a Telegram chat using the Bot API.

## Setup

1. Create a bot via [@BotFather](https://t.me/BotFather) and get your bot token.
2. Set the target URL to: \`https://api.telegram.org/bot<TOKEN>/sendMessage\`
3. Replace \`YOUR_CHAT_ID\` in the transformer with your chat ID.

## Request Body

\`\`\`json
{ "message": "Disk usage at 92%", "chat_id": "123456789" }
\`\`\`

## Notes

- Supports Markdown formatting via \`parse_mode\`.
- Get your chat ID by messaging [@userinfobot](https://t.me/userinfobot).
`,
    tags: ['notification', 'telegram'],
  },
  {
    id: 'pagerduty-alert',
    name: 'PagerDuty Alert',
    description: 'Trigger an incident in PagerDuty via their Events API v2',
    icon: 'Siren',
    category: 'integrations',
    method: 'POST',
    endpointType: 'webhook',
    webhookConfig: {
      targetUrl: 'https://events.pagerduty.com/v2/enqueue',
      method: 'POST',
      forwardHeaders: false,
      transformBody: `return {
  routing_key: input.routing_key || 'YOUR_ROUTING_KEY',
  event_action: input.action || 'trigger',
  payload: {
    summary: input.summary || 'ServerMon Alert',
    severity: input.severity || 'warning',
    source: 'ServerMon'
  }
};`,
    },
    docs: `# PagerDuty Alert

Triggers an incident in PagerDuty via their Events API v2.

## Setup

1. Create a PagerDuty service and get a **routing key** (integration key).
2. Set the target URL to \`https://events.pagerduty.com/v2/enqueue\`.

## Request Body

\`\`\`json
{
  "summary": "High CPU on web-01",
  "severity": "critical",
  "source": "ServerMon",
  "routing_key": "your-routing-key"
}
\`\`\`

## Severity Levels

\`critical\`, \`error\`, \`warning\`, \`info\`
`,
    tags: ['alerting', 'pagerduty', 'incident'],
  },
  {
    id: 'github-status',
    name: 'GitHub Commit Status',
    description: 'Post a commit status check to a GitHub repository via their API',
    icon: 'GitBranch',
    category: 'integrations',
    method: 'POST',
    endpointType: 'script',
    scriptLang: 'node',
    scriptContent: `// GitHub Commit Status — posts status via GitHub API
const https = require('https');

const body = process.env.ENDPOINT_BODY || '{}';
let config = {};
try { config = JSON.parse(body); } catch(e) {}

const token = process.env.GITHUB_TOKEN || 'YOUR_TOKEN';
const owner = config.owner || 'octocat';
const repo = config.repo || 'hello-world';
const sha = config.sha || 'HEAD';

const payload = JSON.stringify({
  state: config.state || 'success',
  target_url: config.target_url || '',
  description: config.description || 'Deployed via ServerMon',
  context: config.context || 'servermon/deploy',
});

const options = {
  hostname: 'api.github.com',
  path: \`/repos/\${owner}/\${repo}/statuses/\${sha}\`,
  method: 'POST',
  headers: {
    'Authorization': \`Bearer \${token}\`,
    'Content-Type': 'application/json',
    'User-Agent': 'ServerMon',
    'Content-Length': Buffer.byteLength(payload),
  },
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log(JSON.stringify({
      statusCode: res.statusCode,
      response: JSON.parse(data || '{}'),
    }));
  });
});

req.on('error', (e) => console.log(JSON.stringify({ error: e.message })));
req.write(payload);
req.end();`,
    docs: `# GitHub Commit Status

Posts a commit status check to a GitHub repository.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| \`GITHUB_TOKEN\` | Yes | Personal access token with \`repo:status\` scope |

## Request Body

\`\`\`json
{
  "owner": "your-org",
  "repo": "your-repo",
  "sha": "abc123",
  "state": "success",
  "description": "All checks passed",
  "context": "ServerMon/deploy"
}
\`\`\`

## States

\`pending\`, \`success\`, \`failure\`, \`error\`

## Notes

- Uses GitHub REST API v3.
- The \`context\` field appears as the check name in the PR.
`,
    tags: ['github', 'ci', 'integration'],
  },

  // ═══════════════════════════════════════════════════
  //  DATA
  // ═══════════════════════════════════════════════════
  {
    id: 'db-query',
    name: 'DB Query',
    description: 'Run a read-only database query via Python and return results as JSON',
    icon: 'Database',
    category: 'data',
    method: 'POST',
    endpointType: 'script',
    scriptLang: 'python',
    scriptContent: `import json
import sys
import os
import subprocess

# DB Query — reads query from request body
# Customize the connection details via endpoint env vars:
#   DB_HOST, DB_NAME, DB_USER, DB_PASS

body = sys.stdin.read()
try:
    data = json.loads(body) if body.strip() else {}
except json.JSONDecodeError:
    data = {}

query = data.get("query", "SELECT 1")

# Example: return the query that would be run
result = {
    "query": query,
    "note": "Replace this template with actual DB connection logic",
    "env_db_host": os.environ.get("DB_HOST", "not set"),
}

print(json.dumps(result))`,
    docs: `# DB Query

Runs a read-only SQL query against a PostgreSQL or MySQL database and returns results as JSON.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| \`DB_HOST\` | \`localhost\` | Database host |
| \`DB_NAME\` | \`postgres\` | Database name |
| \`DB_USER\` | \`postgres\` | Database user |
| \`DB_PASS\` | \`\` | Database password |

## Request Body

\`\`\`json
{ "query": "SELECT id, name FROM users LIMIT 10" }
\`\`\`

## Security

> **Warning**: Always validate queries server-side. This template is for read-only use. Never expose write access via a public endpoint.
`,
    tags: ['database', 'query'],
  },
  {
    id: 'redis-info',
    name: 'Redis Info',
    description: 'Fetches Redis server info including memory, clients, and keyspace stats',
    icon: 'Database',
    category: 'data',
    method: 'GET',
    endpointType: 'script',
    scriptLang: 'bash',
    scriptContent: `#!/bin/bash
# Redis Info — queries redis-cli for server info
REDIS_HOST=\${REDIS_HOST:-"127.0.0.1"}
REDIS_PORT=\${REDIS_PORT:-"6379"}

INFO=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" INFO 2>/dev/null)

if [ $? -ne 0 ] || [ -z "$INFO" ]; then
  echo '{"error": "Cannot connect to Redis", "host": "'$REDIS_HOST'", "port": '$REDIS_PORT'}'
  exit 1
fi

VERSION=$(echo "$INFO" | grep "redis_version:" | cut -d: -f2 | tr -d '\\r')
MEMORY=$(echo "$INFO" | grep "used_memory_human:" | cut -d: -f2 | tr -d '\\r')
CLIENTS=$(echo "$INFO" | grep "connected_clients:" | cut -d: -f2 | tr -d '\\r')
KEYS=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DBSIZE 2>/dev/null | awk '{print $2}' | tr -d '\\r')

cat <<EOF
{
  "version": "$VERSION",
  "memory_used": "$MEMORY",
  "connected_clients": $CLIENTS,
  "total_keys": $KEYS,
  "host": "$REDIS_HOST",
  "port": $REDIS_PORT
}
EOF`,
    docs: `# Redis Info

Fetches Redis server information including memory, clients, and keyspace stats.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| \`REDIS_HOST\` | \`127.0.0.1\` | Redis host |
| \`REDIS_PORT\` | \`6379\` | Redis port |

## Response

| Field | Type | Description |
|-------|------|-------------|
| \`version\` | string | Redis server version |
| \`connected_clients\` | string | Number of connected clients |
| \`used_memory_human\` | string | Human-readable memory usage |
| \`total_keys\` | number | Total keys across all databases |

## Notes

- Uses \`redis-cli INFO\` under the hood.
- Requires \`redis-cli\` to be installed on the server.
`,
    tags: ['redis', 'database', 'cache'],
  },
  {
    id: 'json-transform',
    name: 'JSON Transform',
    description:
      'A logic endpoint that validates, transforms, and reshapes JSON payloads using custom mapping',
    icon: 'Braces',
    category: 'data',
    method: 'POST',
    endpointType: 'logic',
    logicConfig: {
      requestSchema: `{
  "type": "object",
  "properties": {
    "data": { "type": "object" },
    "mapping": {
      "type": "object",
      "description": "Key-value pairs: newKey -> jsonpath"
    }
  },
  "required": ["data"]
}`,
      responseMapping: `return { transformed: true, keys: Object.keys(input.data || {}) };`,
      handlerCode: `// Transform handler — maps input fields to output fields
const data = input.data || {};
const mapping = input.mapping || {};
const result = {};

for (const [newKey, sourcePath] of Object.entries(mapping)) {
  const keys = String(sourcePath).split('.');
  let val = data;
  for (const k of keys) {
    val = val?.[k];
  }
  result[newKey] = val ?? null;
}

return {
  transformed: result,
  sourceKeys: Object.keys(data),
  timestamp: new Date().toISOString()
};`,
    },
    docs: `# JSON Transform

A logic endpoint that validates, transforms, and reshapes JSON payloads using custom mapping rules.

## How It Works

1. Incoming JSON is validated against the **Contract Schema**.
2. The **Edge Handler** applies transformation logic.
3. The result is returned with the **Response Mapping** headers.

## Request Body

\`\`\`json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "age": 30
}
\`\`\`

## Customization

Edit the handler code to add field renaming, filtering, default values, or computed fields.
`,
    tags: ['json', 'transform', 'logic'],
  },
  {
    id: 'csv-to-json',
    name: 'CSV to JSON',
    description: 'Converts CSV data posted in the request body to a JSON array of objects',
    icon: 'FileSpreadsheet',
    category: 'data',
    method: 'POST',
    endpointType: 'script',
    scriptLang: 'python',
    scriptContent: `import json
import sys
import csv
import io

# CSV to JSON — reads CSV from stdin, outputs JSON array
body = sys.stdin.read()

if not body.strip():
    print(json.dumps({"error": "Empty body — send CSV data"}))
    sys.exit(1)

reader = csv.DictReader(io.StringIO(body))
rows = [row for row in reader]

result = {
    "rows": rows,
    "count": len(rows),
    "columns": list(rows[0].keys()) if rows else [],
}
print(json.dumps(result))`,
    docs: `# CSV to JSON

Converts CSV data posted in the request body to a JSON array of objects.

## Request Body

Send raw CSV text:

\`\`\`
name,age,city
Alice,30,NYC
Bob,25,LA
\`\`\`

## Response

| Field | Type | Description |
|-------|------|-------------|
| \`rows\` | array | Array of row objects |
| \`count\` | number | Total rows parsed |
| \`columns\` | array | Column header names |

## Notes

- Uses Python's \`csv.DictReader\` for robust parsing.
- Handles quoted fields, commas in values, and newlines.
`,
    tags: ['csv', 'json', 'data'],
  },
  {
    id: 'request-validator',
    name: 'Request Validator',
    description:
      'A logic endpoint that validates incoming JSON payloads against a schema and returns errors',
    icon: 'CheckSquare',
    category: 'data',
    method: 'POST',
    endpointType: 'logic',
    logicConfig: {
      requestSchema: `{
  "type": "object",
  "properties": {
    "payload": { "type": "object" },
    "rules": {
      "type": "object",
      "description": "Field name -> type (string, number, email, url)"
    }
  },
  "required": ["payload", "rules"]
}`,
      responseMapping: `return { valid: true };`,
      handlerCode: `// Validator — checks payload fields against type rules
const payload = input.payload || {};
const rules = input.rules || {};
const errors = [];

const emailRe = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
const urlRe = /^https?:\\/\\/.+/;

for (const [field, rule] of Object.entries(rules)) {
  const val = payload[field];
  if (val === undefined || val === null) {
    errors.push({ field, error: 'missing' });
    continue;
  }
  switch (rule) {
    case 'string':
      if (typeof val !== 'string') errors.push({ field, error: 'expected string' });
      break;
    case 'number':
      if (typeof val !== 'number') errors.push({ field, error: 'expected number' });
      break;
    case 'email':
      if (!emailRe.test(String(val))) errors.push({ field, error: 'invalid email' });
      break;
    case 'url':
      if (!urlRe.test(String(val))) errors.push({ field, error: 'invalid url' });
      break;
  }
}

return {
  valid: errors.length === 0,
  errors,
  checkedFields: Object.keys(rules).length,
};`,
    },
    docs: `# Request Validator

A logic endpoint that validates incoming JSON payloads against a defined schema and returns detailed errors.

## How It Works

1. The **Contract Schema** defines required fields and their types.
2. The **Edge Handler** checks each field against the rules.
3. Returns \`valid: true\` or a list of validation errors.

## Example Request

\`\`\`json
{
  "email": "not-an-email",
  "age": "not-a-number"
}
\`\`\`

## Example Error Response

\`\`\`json
{
  "valid": false,
  "errors": [
    "email: invalid format",
    "age: expected number"
  ]
}
\`\`\`

## Customization

Edit the handler code to add regex patterns, enum validation, or nested object checks.
`,
    tags: ['validation', 'schema', 'logic'],
  },

  // ═══════════════════════════════════════════════════
  //  NETWORKING
  // ═══════════════════════════════════════════════════
  {
    id: 'ping-check',
    name: 'Ping Check',
    description: 'Pings a host and returns latency statistics including min, avg, and max times',
    icon: 'Wifi',
    category: 'networking',
    method: 'POST',
    endpointType: 'script',
    scriptLang: 'bash',
    scriptContent: `#!/bin/bash
# Ping Check — pings a target host
HOST=$(echo "$ENDPOINT_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('host','8.8.8.8'))" 2>/dev/null)
COUNT=\${PING_COUNT:-4}

if [ -z "$HOST" ]; then HOST="8.8.8.8"; fi

RESULT=$(ping -c "$COUNT" -W 3 "$HOST" 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo "{\\\"host\\\": \\\"$HOST\\\", \\\"reachable\\\": false, \\\"error\\\": \\\"Host unreachable\\\"}"
  exit 0
fi

STATS=$(echo "$RESULT" | tail -1)
LOSS=$(echo "$RESULT" | grep -oP '\\d+(?=% packet loss)')

echo "$RESULT" | tail -1 | awk -F'/' -v host="$HOST" -v loss="$LOSS" '{
  printf "{\\\"host\\\": \\\"%s\\\", \\\"reachable\\\": true, \\\"packet_loss\\\": \\\"%s%%\\\", \\\"min_ms\\\": \\\"%s\\\", \\\"avg_ms\\\": \\\"%s\\\", \\\"max_ms\\\": \\\"%s\\\"}", host, loss, $4, $5, $6
}'`,
    docs: `# Ping Check

Pings a host and returns latency statistics.

## Request Body

\`\`\`json
{ "host": "8.8.8.8", "count": 4 }
\`\`\`

## Response

| Field | Type | Description |
|-------|------|-------------|
| \`host\` | string | Target host |
| \`reachable\` | boolean | Whether the host responded |
| \`packet_loss\` | string | Packet loss percentage |
| \`min_ms\` | string | Minimum round-trip time |
| \`avg_ms\` | string | Average round-trip time |
| \`max_ms\` | string | Maximum round-trip time |

## Notes

- Uses the system \`ping\` command.
- Defaults to 4 packets if \`count\` is not specified.
`,
    tags: ['networking', 'ping', 'latency'],
  },
  {
    id: 'dns-lookup',
    name: 'DNS Lookup',
    description:
      'Performs DNS resolution for a domain and returns all A, AAAA, CNAME, and MX records',
    icon: 'Globe',
    category: 'networking',
    method: 'POST',
    endpointType: 'script',
    scriptLang: 'python',
    scriptContent: `import json
import sys
import socket
import subprocess

# DNS Lookup — resolves a domain
body = sys.stdin.read()
try:
    data = json.loads(body) if body.strip() else {}
except json.JSONDecodeError:
    data = {}

domain = data.get("domain", "google.com")
result = {"domain": domain, "records": {}}

# A records
try:
    ips = socket.getaddrinfo(domain, None, socket.AF_INET)
    result["records"]["A"] = list(set(ip[4][0] for ip in ips))
except socket.gaierror:
    result["records"]["A"] = []

# AAAA records
try:
    ips6 = socket.getaddrinfo(domain, None, socket.AF_INET6)
    result["records"]["AAAA"] = list(set(ip[4][0] for ip in ips6))
except socket.gaierror:
    result["records"]["AAAA"] = []

# MX records via dig
try:
    mx_out = subprocess.check_output(
        ["dig", "+short", "MX", domain],
        stderr=subprocess.DEVNULL, text=True, timeout=5
    )
    result["records"]["MX"] = [l.strip() for l in mx_out.splitlines() if l.strip()]
except Exception:
    result["records"]["MX"] = []

print(json.dumps(result))`,
    docs: `# DNS Lookup

Performs DNS resolution for a domain and returns A, AAAA, and MX records.

## Request Body

\`\`\`json
{ "domain": "example.com" }
\`\`\`

## Response

| Field | Type | Description |
|-------|------|-------------|
| \`domain\` | string | Queried domain |
| \`records.A\` | array | IPv4 addresses |
| \`records.AAAA\` | array | IPv6 addresses |
| \`records.MX\` | array | Mail exchange records |

## Requirements

- \`dig\` command for MX lookups (falls back gracefully).
- Python \`socket\` module for A/AAAA resolution.
`,
    tags: ['networking', 'dns'],
  },
  {
    id: 'http-probe',
    name: 'HTTP Probe',
    description:
      'Probes an HTTP endpoint and returns status code, headers, response time, and TLS info',
    icon: 'Radar',
    category: 'networking',
    method: 'POST',
    endpointType: 'script',
    scriptLang: 'node',
    scriptContent: `// HTTP Probe — checks a URL and returns detailed response info
const https = require('https');
const http = require('http');
const { URL } = require('url');

const body = process.env.ENDPOINT_BODY || '{}';
let config = {};
try { config = JSON.parse(body); } catch(e) {}

const targetUrl = config.url || 'https://httpbin.org/get';
const timeout = config.timeout || 10000;

const start = Date.now();
const parsed = new URL(targetUrl);
const client = parsed.protocol === 'https:' ? https : http;

const req = client.request(targetUrl, { method: 'GET', timeout }, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const duration = Date.now() - start;
    const result = {
      url: targetUrl,
      statusCode: res.statusCode,
      statusMessage: res.statusMessage,
      headers: {
        server: res.headers['server'] || null,
        contentType: res.headers['content-type'] || null,
        contentLength: res.headers['content-length'] || null,
      },
      responseTime: duration + 'ms',
      bodyLength: data.length,
      tls: parsed.protocol === 'https:',
    };
    console.log(JSON.stringify(result, null, 2));
  });
});

req.on('timeout', () => {
  req.destroy();
  console.log(JSON.stringify({ url: targetUrl, error: 'Timeout', timeout }));
});

req.on('error', (e) => {
  console.log(JSON.stringify({ url: targetUrl, error: e.message }));
});

req.end();`,
    docs: `# HTTP Probe

Probes an HTTP endpoint and returns status code, headers, response time, and TLS info.

## Request Body

\`\`\`json
{ "url": "https://example.com", "timeout": 10000 }
\`\`\`

## Response

| Field | Type | Description |
|-------|------|-------------|
| \`url\` | string | Probed URL |
| \`statusCode\` | number | HTTP status code |
| \`statusMessage\` | string | HTTP status message |
| \`responseTime\` | string | Total response time |
| \`bodyLength\` | number | Response body size in bytes |
| \`tls\` | boolean | Whether HTTPS was used |

## Use Cases

- Uptime monitoring
- SSL verification
- Response time benchmarking
`,
    tags: ['networking', 'http', 'probe'],
  },
  {
    id: 'traceroute',
    name: 'Traceroute',
    description: 'Runs a traceroute to a target host and returns each hop as structured JSON',
    icon: 'Route',
    category: 'networking',
    method: 'POST',
    endpointType: 'script',
    scriptLang: 'python',
    scriptContent: `import json
import sys
import subprocess
import re

# Traceroute — traces path to a host
body = sys.stdin.read()
try:
    data = json.loads(body) if body.strip() else {}
except json.JSONDecodeError:
    data = {}

host = data.get("host", "8.8.8.8")
max_hops = data.get("max_hops", 15)

try:
    output = subprocess.check_output(
        ["traceroute", "-m", str(max_hops), "-w", "2", host],
        stderr=subprocess.STDOUT, text=True, timeout=30
    )
except subprocess.TimeoutExpired:
    print(json.dumps({"error": "Traceroute timed out", "host": host}))
    sys.exit(0)
except FileNotFoundError:
    print(json.dumps({"error": "traceroute not installed", "host": host}))
    sys.exit(0)
except subprocess.CalledProcessError as e:
    output = e.output

hops = []
for line in output.splitlines()[1:]:
    match = re.match(r'\\s*(\\d+)\\s+(.+)', line)
    if match:
        hop_num = int(match.group(1))
        rest = match.group(2).strip()
        hops.append({"hop": hop_num, "detail": rest})

print(json.dumps({"host": host, "hops": hops, "total_hops": len(hops)}))`,
    docs: `# Traceroute

Traces the network path to a target host, returning each hop as structured JSON.

## Request Body

\`\`\`json
{ "host": "8.8.8.8", "max_hops": 15 }
\`\`\`

## Response

| Field | Type | Description |
|-------|------|-------------|
| \`host\` | string | Target host |
| \`hops\` | array | Array of \`{ hop, detail }\` objects |
| \`total_hops\` | number | Number of hops traced |

## Requirements

- \`traceroute\` must be installed on the server.
- May take up to 30 seconds depending on network conditions.
- Some hops may show \`* * *\` if they don't respond to probes.
`,
    tags: ['networking', 'traceroute', 'diagnostics'],
  },
  {
    id: 'bandwidth-test',
    name: 'Bandwidth Test',
    description: 'Measures download speed by fetching a test file and calculating throughput',
    icon: 'Gauge',
    category: 'networking',
    method: 'GET',
    endpointType: 'script',
    scriptLang: 'node',
    scriptContent: `// Bandwidth Test — downloads a test file and measures speed
const https = require('https');

const testUrl = process.env.SPEED_TEST_URL || 'https://speed.cloudflare.com/__down?bytes=1000000';
const start = Date.now();
let totalBytes = 0;

https.get(testUrl, (res) => {
  res.on('data', (chunk) => {
    totalBytes += chunk.length;
  });
  res.on('end', () => {
    const durationMs = Date.now() - start;
    const durationSec = durationMs / 1000;
    const mbps = ((totalBytes * 8) / (durationSec * 1000000)).toFixed(2);
    const mbDownloaded = (totalBytes / (1024 * 1024)).toFixed(2);

    console.log(JSON.stringify({
      bytes: totalBytes,
      megabytes: mbDownloaded,
      duration_ms: durationMs,
      speed_mbps: parseFloat(mbps),
      test_url: testUrl,
    }));
  });
}).on('error', (e) => {
  console.log(JSON.stringify({ error: e.message }));
});`,
    docs: `# Bandwidth Test

Measures download speed by fetching a test file and calculating throughput.

## Response

| Field | Type | Description |
|-------|------|-------------|
| \`bytes\` | number | Total bytes downloaded |
| \`megabytes\` | string | Downloaded size in MB |
| \`duration_ms\` | number | Download duration |
| \`speed_mbps\` | number | Speed in megabits per second |
| \`test_url\` | string | URL used for the test |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| \`SPEED_TEST_URL\` | Cloudflare 1MB test | URL to download for speed measurement |

## Notes

- Downloads ~1MB by default via Cloudflare's speed test CDN.
- Results vary based on server location and network conditions.
- For accurate results, run multiple tests and average.
`,
    tags: ['networking', 'bandwidth', 'speed'],
  },
];

export async function GET() {
  return NextResponse.json({ templates });
}
