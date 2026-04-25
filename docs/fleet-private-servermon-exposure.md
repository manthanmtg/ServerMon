# Exposing a Private ServerMon Instance Through Fleet

This document describes the pattern used to run a full ServerMon instance on a private machine and expose it publicly through an existing ServerMon Fleet Hub.

The concrete use case was:

- Hub: public ServerMon instance with Fleet Hub, FRP server, Nginx, and Let's Encrypt.
- Private node: machine without direct public ingress.
- Goal: run a separate full ServerMon instance on the private node and publish it at a Hub-managed public hostname.

No credentials are included here. Use environment files, Fleet pairing tokens, and secret stores for real deployments.

## Outcome

The private node runs two separate local services:

- `servermon-agent`: the Fleet agent that connects back to the Hub.
- `servermon`: the full ServerMon app for that private node.

The Hub publishes the private node's ServerMon over HTTPS:

```text
Internet
  -> Hub Nginx :443
  -> Hub FRP vhost :8080
  -> Private node frpc tunnel
  -> Private node ServerMon :8912
```

The public route does not add another Fleet auth layer. The exposed app is Orion's own ServerMon instance, so Orion's own login/setup flow handles authentication.

## Port Layout

The important design decision is to keep the Fleet agent listener and full ServerMon app on different ports.

| Component                 | Host         | Port | Purpose                                  |
| ------------------------- | ------------ | ---: | ---------------------------------------- |
| Hub ServerMon             | Hub          | 8912 | Main public Hub app behind Hub Nginx     |
| Hub FRP server            | Hub          | 7000 | frpc control connection                  |
| Hub FRP HTTP vhost        | Hub          | 8080 | Nginx forwards public route traffic here |
| Private `servermon-agent` | Private node | 8918 | Agent-side listener/terminal bridge      |
| Private ServerMon         | Private node | 8912 | Full private-node ServerMon app          |

Before this, the agent process and the full ServerMon install could both try to use `8912`. The agent default was moved to `8918` so a full ServerMon install can use the normal default port without ambiguity.

## Database Layout

Use separate MongoDB databases for each ServerMon instance, even if they share the same MongoDB cluster.

Example:

```text
Hub ServerMon      -> servermon_hub
Private ServerMon  -> servermon_private_node
```

The database name separation matters because each ServerMon instance has its own users, sessions, settings, module data, and setup state.

## High-Level Procedure

1. Make sure the private node is already onboarded as a Fleet node.
2. Move the Fleet agent listener away from `8912`.
3. Install full ServerMon on the private node at `8912`.
4. Add a Fleet proxy rule from the private node to its local ServerMon port.
5. Add a Public Route on the Hub using the Hub subdomain mode.
6. Create or reload the Hub Nginx vhost.
7. Issue a Let's Encrypt certificate on the Hub.
8. Smoke-test HTTP, HTTPS, FRP, and both systemd services.

## Agent Port Separation

The Fleet agent should run with an explicit listener port:

```ini
Environment=PORT=8918
Environment=FLEET_AGENT_MODE=true
Environment=FLEET_AGENT_PTY_PORT=8918
```

The matching Fleet node proxy rule for the terminal bridge should point to the same local port:

```text
name: terminal-bridge
type: tcp
localIp: 127.0.0.1
localPort: 8918
```

After updating this, restart the agent and verify the generated `frpc.toml` uses the new port.

Expected generated fragment:

```toml
[[proxies]]
name = "node-terminal-bridge"
type = "tcp"
localIP = "127.0.0.1"
localPort = 8918
```

## Installing Full ServerMon on the Private Node

Install the full app as a normal ServerMon instance, but do not configure public Nginx or SSL locally when the node has no public ingress.

The private node only needs to listen locally or on its internal interface:

```text
PORT=8912
MONGO_URI=<private-node database URI>
DOMAIN=
```

The install should produce a managed systemd service:

```bash
systemctl is-enabled servermon
systemctl is-active servermon
curl http://127.0.0.1:8912/login
```

The private ServerMon database starts fresh, so `/setup` should be used to create that instance's own administrator account.

## Hub Public Route

On the Hub, create a public route with:

```text
name: Private Node ServerMon
slug: private-node-servermon
domain: private-node-servermon.<hub-subdomain-host>
node: private node
target localIp: 127.0.0.1
target localPort: 8912
protocol: http
accessMode: public
websocketEnabled: true
tlsEnabled: true
```

The route should use FRP `subdomain`, not `customDomains`, when the domain belongs to the Hub's configured FRP `subDomainHost`.

Expected generated FRP proxy:

```toml
[[proxies]]
name = "node-private-node-servermon"
type = "http"
localIP = "127.0.0.1"
localPort = 8912
subdomain = "private-node-servermon"
```

## Hub Nginx Vhost

The Hub Nginx vhost proxies the public hostname to the FRP HTTP vhost port:

```nginx
server {
  listen 80;
  server_name private-node-servermon.example.com;
  client_max_body_size 32m;

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

Then validate and reload:

```bash
nginx -t
systemctl reload nginx
```

## TLS

TLS is terminated on the Hub, not on the private node.

Issue the certificate on the Hub:

```bash
certbot --nginx -d private-node-servermon.example.com --non-interactive --agree-tos --redirect
```

Certbot updates the Hub Nginx route and installs automatic renewal.

## Validation Checklist

On the private node:

```bash
systemctl is-enabled servermon servermon-agent
systemctl is-active servermon servermon-agent
ss -ltnp | grep -E ':(8912|8918)'
curl http://127.0.0.1:8912/login
```

On the Hub:

```bash
curl -H 'Host: private-node-servermon.example.com' http://127.0.0.1:8080/login
curl -I http://private-node-servermon.example.com/login
curl -I https://private-node-servermon.example.com/login
nginx -t
```

Expected results:

- Private ServerMon `/login` returns `200`.
- FRP vhost with the public Host header returns `200`.
- Public HTTP redirects to HTTPS.
- Public HTTPS `/login` returns `200`.
- Fleet heartbeat reports the public route proxy as active.

## Operational Notes

- The private node does not need inbound public ports.
- If the private node reboots, both `servermon` and `servermon-agent` should be systemd-enabled.
- If the Hub reboots, systemd restarts ServerMon and FRP; agents reconnect automatically.
- If the agent restarts, it re-fetches node config, regenerates `frpc.toml`, and starts all enabled proxy rules.
- If the public route uses a Hub-owned subdomain, use FRP `subdomain`, not `customDomains`.

## Improvements Identified

This install surfaced several places where ServerMon can be made smoother.

1. Agent/full-app port separation should be first-class.

   The Fleet agent previously looked like a full app process because it used the shared server entrypoint and default port behavior. Setting an explicit agent listener port, currently `8918`, avoids conflicts when a full ServerMon instance is installed on the same machine.

2. The agent installer should always write explicit port env vars.

   Generated agent systemd services should include:

   ```ini
   Environment=PORT=8918
   Environment=FLEET_AGENT_PTY_PORT=8918
   ```

   Docker snippets should do the same.

3. Fresh install as a non-root service has an ordering bug.

   The installer attempted to `chown /opt/servermon` before the stable install symlink existed. Running with `--allow-root` avoided the issue, but the installer should create/link the install path before ownership changes, or chown the release directory first and the stable path after linking.

4. Public Route creation should own the whole lifecycle.

   A polished flow should create or update all of these together:
   - PublicRoute DB record.
   - Node proxy rule.
   - FRP config revision and agent reconcile command.
   - Nginx config revision.
   - Nginx apply/reload.
   - Optional certbot issue/renew step.
   - Final route status update.

5. Route status should be derived from real checks.

   After the route was working, status fields still needed explicit updates. The Hub should periodically verify DNS, TLS, FRP proxy status, and upstream health, then mark routes `active`, `healthy`, and `tlsStatus=active` automatically.

6. There should be a documented "Expose ServerMon on a Fleet node" template.

   The wizard can prefill:

   ```text
   target localIp: 127.0.0.1
   target localPort: 8912
   protocol: http
   websocketEnabled: true
   accessMode: public
   timeoutSeconds: 300
   ```

   This is a common and high-value use case for private machines.

7. Use the Hub for public TLS.

   Do not try to obtain certificates on a private node without public ingress. Terminate TLS at the Hub and forward HTTP through FRP to the private local service.

## Troubleshooting

If the public hostname returns 404:

- Check the Hub Nginx route exists and is included.
- Check the public route proxies to the FRP vhost port, usually `127.0.0.1:8080`.
- Check `frpc.toml` has `subdomain = "<slug>"`.
- Check the agent heartbeat reports the expected proxy as active.

If the public hostname returns 502:

- Check the private local app is listening.
- Check the FRP proxy target local port.
- Check the agent service is active.

If terminal access breaks after moving the agent port:

- Check the agent service has `FLEET_AGENT_PTY_PORT=8918`.
- Check the Fleet node `terminal-bridge` proxy rule targets `localPort=8918`.
- Restart the agent so `frpc.toml` is regenerated.
