# Nginx Operations Manager Design

## Purpose

ServerMon's current Nginx module misses loaded configs under `/etc/nginx/servermon` because it only scans `/etc/nginx/sites-available` and treats `/etc/nginx/conf.d` as a fallback. On this host, `/etc/nginx/conf.d/servermon-public-routes.conf` includes `/etc/nginx/servermon/*.conf`, so the module does not show active ServerMon-managed hosts such as `api-test.apps.example.com` and `servermon.apps.example.com`.

The module should become a complete local Nginx operations surface: discover the actual loaded config, show useful details for every virtual host, create new direct or wildcard hosts, guide DNS setup, support advanced raw configs, validate before reload, and rollback failed writes.

## Goals

- Discover all loaded server blocks, including files reached through `include` directives.
- Show rich details for active virtual hosts: source file, server names, wildcard status, listen ports, TLS certificate paths, redirects, locations, roots, proxy targets, headers, Certbot-managed markers, and raw config.
- Support new host creation for direct domains such as `app.example.com`.
- Support wildcard server names such as `*.apps.example.com` when the DNS provider already has or needs a wildcard DNS record.
- Guide the user through DNS records for direct and wildcard hostnames.
- Provide an advanced raw config path for configurations the guided wizard does not model.
- Write managed config safely, test with `nginx -t`, reload only after a successful test, and rollback failed writes.
- Keep Fleet public-route management separate while sharing parser/rendering utilities where useful.

## Non-Goals

- DNS provider API integrations in the first implementation.
- Editing arbitrary unmanaged system files by default.
- Replacing Fleet FRP public routes.
- Managing every possible Nginx directive through structured form fields.

## Architecture

The standalone `src/modules/nginx` module remains the user-facing local Nginx manager. The backend service in `src/lib/nginx/` will be split into smaller units:

- `discovery.ts`: run `nginx -T`, parse source file markers, extract loaded server blocks, and fall back to common config directories if `nginx -T` fails.
- `parser.ts`: parse Nginx server blocks into structured virtual-host data.
- `renderer.ts`: render safe managed reverse-proxy snippets from guided form input.
- `managed-config.ts`: write managed files, create backups, test, reload, and rollback.
- `service.ts`: compose status, discovery, config test, reload, and managed config operations for API routes.

The API remains under `/api/modules/nginx` for the standalone module:

- `GET /api/modules/nginx`: loaded snapshot.
- `POST /api/modules/nginx/test`: run config test.
- `POST /api/modules/nginx/reload`: reload Nginx.
- `POST /api/modules/nginx/vhosts`: create a managed vhost from guided fields or raw config.
- `PATCH /api/modules/nginx/vhosts/[id]`: update a managed vhost.
- `DELETE /api/modules/nginx/vhosts/[id]`: remove a managed vhost.
- `POST /api/modules/nginx/dns/check`: resolve A, AAAA, CNAME, and wildcard guidance targets.

All mutating routes must require `getSession()`, validate with Zod, log through `createLogger()`, and return structured errors.

## Discovery Details

Primary discovery uses `nginx -T` because it outputs the effective loaded configuration and includes comments that identify config file paths. The parser should attach each `server` block to its source file and source order. It should parse:

- `server_name` values, including `_` and wildcard names.
- `listen` directives, including `ssl`, `http2`, `default_server`, IPv6, and port-only listens.
- `ssl_certificate` and `ssl_certificate_key`.
- `return` redirects.
- `root`.
- `proxy_pass`.
- `location` blocks and top-level directives inside each location.
- `include` directives and Certbot-managed comments when present in raw text.

Fallback discovery scans these paths without depending on one path failing first:

- `/etc/nginx/sites-available`
- `/etc/nginx/sites-enabled`
- `/etc/nginx/conf.d`
- `/etc/nginx/servermon`
- configured managed directory from `NGINX_MANAGED_DIR` if present

Fallback entries should be marked as filesystem-discovered rather than confirmed-loaded unless they are under a known include path or match the `nginx -T` source list.

## Data Model

The API snapshot should extend `NginxVirtualHost` with:

- `id`: stable file/block identifier.
- `sourcePath`: absolute file path where available.
- `sourceLine`: source line where available.
- `loaded`: whether the block came from `nginx -T`.
- `managed`: whether it lives under a ServerMon-managed directory.
- `serverNames`: parsed names.
- `primaryServerName`: first non-default name.
- `wildcard`: true when any server name starts with `*.`.
- `listen`: structured listen directives plus display strings.
- `tls`: enabled flag, cert path, key path, certbot-managed flag.
- `locations`: path, proxy pass, root, directives.
- `redirects`: return directives.
- `raw`: raw server block.
- `warnings`: duplicates, unreadable file, missing cert path, unknown loaded state, or parser limitations.

## Add Host Flow

The UI should provide two creation modes:

### Guided Reverse Proxy

Fields:

- Domain pattern: direct domain or wildcard domain.
- Upstream protocol: `http` or `https`.
- Upstream host: default `127.0.0.1`.
- Upstream port.
- Websocket support.
- HTTP to HTTPS redirect.
- TLS mode: none, existing certificate paths, or raw Certbot-managed config after certbot has run. The first implementation should show the exact `certbot --nginx -d <domain>` command instead of running certificate issuance itself.
- Max body size.
- Proxy read timeout.
- Optional extra headers.

The wizard previews the full config. By default it writes to `/etc/nginx/servermon/<safe-slug>.conf` because this host already includes that directory and it is owned by `servermon`.

### Advanced Raw Config

Fields:

- Managed file name.
- Raw Nginx config.

The module validates file names with a strict slug pattern and only writes inside the managed directory. It runs `nginx -t` after writing and rolls back if invalid.

## DNS Guidance

The UI should not pretend to change DNS provider records. It should show exact DNS records to create and verify resolution.

For direct host `app.example.com`:

- Suggested record: `A app <server IPv4>` and/or `AAAA app <server IPv6>`.
- Alternative: `CNAME app <canonical host>` when the user supplies a canonical target.

For wildcard host `*.apps.example.com`:

- Suggested record: `A *.apps <server IPv4>` and/or `AAAA *.apps <server IPv6>`.
- Warn that wildcard DNS does not cover the apex `apps.example.com`; apex needs its own record.
- Verify a sample hostname such as `test.apps.example.com`.

The DNS check should show resolved IPs and whether they match the server's detected public IP when available. Missing DNS should not block non-TLS configs but should warn before Let's Encrypt.

## Safety

Mutating operations should:

1. Resolve and validate the managed directory.
2. Reject path traversal and unsafe file names.
3. Save a backup of the previous managed file if it exists.
4. Write the new file.
5. Run `nginx -t`.
6. Roll back the file if `nginx -t` fails.
7. Reload Nginx only when requested and only after a successful config test.
8. Return test/reload output to the UI.

The UI should show the exact file path and latest test output after create/update/delete.

## Testing

Unit tests should cover:

- `nginx -T` source marker parsing.
- Server block parsing for Certbot-modified configs like the current `app-test.conf`.
- `/etc/nginx/servermon` discovery.
- Wildcard `server_name` parsing.
- Guided config rendering.
- Managed write rollback on failed `nginx -t`.
- API validation and auth behavior.
- UI rendering of TLS cert/key, redirects, wildcard labels, source file, locations, DNS guidance, and raw config preview.

Verification commands:

- `pnpm test src/lib/nginx`
- `pnpm test src/modules/nginx`
- `pnpm test src/app/api/modules/nginx`
- `pnpm lint`
- `pnpm typecheck`

## Rollout

Implement in focused slices:

1. Discovery/parser improvements so existing active configs show correctly.
2. UI detail expansion for loaded virtual hosts.
3. Managed create/update/delete backend with rollback.
4. Add-host UI with guided and raw modes.
5. DNS guidance and DNS check API.
6. Final validation and polish.
