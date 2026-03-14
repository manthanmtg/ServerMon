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
];

export async function GET() {
    return NextResponse.json({ templates });
}
