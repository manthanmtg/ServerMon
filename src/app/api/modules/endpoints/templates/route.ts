import { NextResponse } from 'next/server';
import type { EndpointTemplate } from '@/modules/endpoints/types';

export const dynamic = 'force-dynamic';

const templates: EndpointTemplate[] = [
  {
    id: 'health-check',
    name: 'Health Check',
    description: 'Simple health check endpoint that returns server status',
    icon: 'HeartPulse',
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
    tags: ['monitoring', 'health'],
  },
  {
    id: 'webhook-receiver',
    name: 'Webhook Receiver',
    description: 'Receives webhook payloads, logs them, and returns a confirmation',
    icon: 'Webhook',
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
    tags: ['webhook', 'integration'],
  },
  {
    id: 'db-query',
    name: 'DB Query',
    description: 'Run a read-only database query via Python and return results as JSON',
    icon: 'Database',
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
    tags: ['database', 'query'],
  },
  {
    id: 'service-restart',
    name: 'Service Restart',
    description: 'Restart a systemd service by name (passed in request body)',
    icon: 'RotateCcw',
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
    tags: ['service', 'management'],
  },
  {
    id: 'status-page',
    name: 'Status Page JSON',
    description: 'Returns a structured JSON status page for external monitoring',
    icon: 'BarChart3',
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
    tags: ['monitoring', 'status'],
  },
  {
    id: 'slack-notifier',
    name: 'Slack Notifier',
    description: 'Forward a message to a Slack channel via incoming webhook',
    icon: 'MessageSquare',
    method: 'POST',
    endpointType: 'webhook',
    webhookConfig: {
      targetUrl: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL',
      method: 'POST',
      forwardHeaders: false,
      transformBody: `return { text: input.message || 'Notification from ServerMon' };`,
    },
    tags: ['notification', 'slack'],
  },
  {
    id: 'disk-usage',
    name: 'Disk Usage',
    description: 'Returns disk usage statistics for the root partition',
    icon: 'HardDrive',
    method: 'GET',
    endpointType: 'script',
    scriptLang: 'bash',
    scriptContent: `#!/bin/bash
# Disk Usage — returns JSON with space info
df -h / | awk 'NR==2 {printf "{\\\"total\\\": \\\"%s\\\", \\\"used\\\": \\\"%s\\\", \\\"available\\\": \\\"%s\\\", \\\"percent\\\": \\\"%s\\\"}", $2, $3, $4, $5}'`,
    tags: ['monitoring', 'disk'],
  },
  {
    id: 'memory-stats',
    name: 'Memory Stats',
    description: 'Returns detailed memory usage metrics',
    icon: 'Cpu',
    method: 'GET',
    endpointType: 'script',
    scriptLang: 'bash',
    scriptContent: `#!/bin/bash
# Memory Stats — returns JSON from /proc/meminfo
grep -E 'MemTotal|MemFree|MemAvailable|Buffers|Cached' /proc/meminfo | awk '{printf "\\\"%s\\\": \\\"%s %s\\\",", substr($1, 1, length($1)-1), $2, $3}' | sed 's/,$//' | awk '{print "{" $0 "}"}'`,
    tags: ['monitoring', 'memory'],
  },
  {
    id: 'log-searcher',
    name: 'Log Searcher',
    description: 'Search a log file for a specific pattern',
    icon: 'Search',
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
    tags: ['logs', 'search'],
  },
  {
    id: 'process-list',
    name: 'Top Processes',
    description: 'Returns the top 5 processes by memory usage',
    icon: 'List',
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
    tags: ['monitoring', 'processes'],
  },
  {
    id: 'ssl-expiry',
    name: 'SSL Expiry Checker',
    description: 'Check the expiration date of an SSL certificate',
    icon: 'ShieldCheck',
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
    tags: ['security', 'ssl'],
  },
  {
    id: 'discord-notifier',
    name: 'Discord Notifier',
    description: 'Send a message to a Discord channel',
    icon: 'MessageSquare',
    method: 'POST',
    endpointType: 'webhook',
    webhookConfig: {
      targetUrl: 'https://discord.com/api/webhooks/YOUR/WEBHOOK/URL',
      method: 'POST',
      forwardHeaders: false,
      transformBody: `return { content: input.message || 'Notification from ServerMon' };`,
    },
    tags: ['notification', 'discord'],
  },
];

export async function GET() {
  return NextResponse.json({ templates });
}
