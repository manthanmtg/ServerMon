import type { HttpMethod, ScriptLanguage } from '../../../types';

export interface Boilerplate {
  name: string;
  description: string;
  content: string;
}

export const SCRIPT_BOILERPLATES: Record<ScriptLanguage, Record<string, Boilerplate>> = {
  python: {
    GET: {
      name: 'Standard Python GET',
      description: 'Fetch and return JSON data',
      content: `import json

def main(event, context):
    """
    Standard GET handler for fetching system data.
    """
    # Sample data - replace with your logic
    data = {
        "status": "success",
        "message": "Data retrieved successfully",
        "timestamp": "2024-03-31T10:00:00Z",
        "results": [
            {"id": 1, "name": "Item A", "value": 100},
            {"id": 2, "name": "Item B", "value": 200}
        ]
    }
    
    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json"
        },
        "body": json.dumps(data)
    }
`,
    },
    POST: {
      name: 'Standard Python POST',
      description: 'Process incoming JSON payload',
      content: `import json

def main(event, context):
    """
    Standard POST handler for processing incoming data.
    """
    try:
        # Parse incoming body
        body = json.loads(event.get('body', '{}'))
        
        # Validation logic
        if not body.get('name'):
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Missing 'name' field"})
            }
            
        # Processing logic
        response = {
            "status": "processed",
            "received": body,
            "id": "gen-123"
        }
        
        return {
            "statusCode": 201,
            "body": json.dumps(response)
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }
`,
    },
  },
  bash: {
    GET: {
      name: 'Standard Bash GET',
      description: 'System info via shell',
      content: `#!/bin/bash

# Fetch system metrics or info
UPTIME=$(uptime -p)
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}')

echo "{"
echo "  \\"status\\": \\"online\\","
echo "  \\"uptime\\": \\"$UPTIME\\","
echo "  \\"disk_usage\\": \\"$DISK_USAGE\\""
echo "}"
`,
    },
    POST: {
      name: 'Standard Bash POST',
      description: 'Handle input via stdin',
      content: `#!/bin/bash

# Read JSON from stdin
read -r INPUT

# Process or Log
echo "Received input: $INPUT" >&2

# Return success
echo "{"
echo "  \\"status\\": \\"accepted\\","
echo "  \\"message\\": \\"Bash script processed input successfully\\""
echo "}"
`,
    },
  },
  node: {
    GET: {
      name: 'Standard Node GET',
      description: 'Modern async handler',
      content: `export default async function(req, res) {
  // Logic to fetch data
  const data = {
    msg: "Hello from ServerMon Node bridge",
    method: req.method,
    headers: req.headers,
    timestamp: Date.now()
  };

  return {
    status: 200,
    body: data
  };
}
`,
    },
    POST: {
      name: 'Standard Node POST',
      description: 'JSON processing with validation',
      content: `export default async function(req, res) {
  const { body } = req;

  if (!body || Object.keys(body).length === 0) {
    return {
      status: 400,
      body: { error: "Payload required" }
    };
  }

  // Business logic here
  const result = {
    received: body,
    processed_at: new Date().toISOString(),
    status: "ok"
  };

  return {
    status: 200,
    body: result
  };
}
`,
    },
  },
};

export const WEBHOOK_BOILERPLATES: Record<string, string> = {
  transform: `// Standard Webhook Transformer
// The 'input' variable contains the incoming payload.
// Return the object you want to send to the upstream URL.

return {
  event: input.type || 'generic_event',
  timestamp: new Date().toISOString(),
  data: {
    original_id: input.id,
    metadata: {
      source: 'ServerMon-Bridge',
      raw: input
    }
  }
};`,
};

export const LOGIC_BOILERPLATES = {
  schema: `{
  "type": "object",
  "required": ["action", "payload"],
  "properties": {
    "action": { "type": "string", "enum": ["create", "update", "delete"] },
    "payload": { "type": "object" }
  }
}`,
  handler: `// Standard Edge Logic Handler
// Use 'context' for environment variables and 'req' for the request.

const { action, payload } = req.body;

switch (action) {
  case 'create':
    return { statusCode: 201, body: { msg: 'Resource created', data: payload } };
  case 'update':
    return { statusCode: 200, body: { msg: 'Resource updated' } };
  default:
    return { statusCode: 400, body: { error: 'Invalid action' } };
}
`,
  mapping: `{
  "headers": {
    "X-Powered-By": "ServerMon-Logic-Engine",
    "Cache-Control": "no-cache"
  }
}`,
};
