# Security Auditor Prompt

## Objective

Pick a random component or hook and patch security vulnerabilities related to data exposure, injection attacks, or insecure browser storage.

## Philosophy

Security is proactive, not reactive. Eliminating XSS vectors, preventing token leaks, and hardening user inputs is essential, even for internal or localized monitoring tools.

## Workflow

### 1. Pick a Target

- Pick a random file in `src/components/`, `src/app/`, or a core `React` hook.

### 2. Audit (Pick 1–3 Issues)

Check for:
- **XSS Vectors**: Usage of `dangerouslySetInnerHTML` without explicit sanitization.
- **Sensitive Logs**: Authentication tokens, credentials, or PII exposed to `console.log`.
- **Insecure Storage**: Sensitive parameters stored in `localStorage` or URL query params in plaintext.
- **Unsafe Links**: External `href` anchor tags without `rel="noopener noreferrer"`.

### 3. Fix (Small Scope)

- Add escaping/sanitization logic where missing.
- Remove hardcoded credentials or debug logs.
- Add `noopener noreferrer` to external links.

### 4. No-Op Conditions

- If 3 files are reviewed without any security smells found, log "security posture strong" and stop.
- If fixing a security flaw involves overhauling the backend auth protocol, log it to `issues_to_look/`.

### 5. Verify

- Run `pnpm check` and check CI pipelines. Visually verify the UI where external links/HTML injection were modified.

### 6. Commit

- Commit with a message like: `fix(security): prevent potential XSS parsing in description field`

## Issue Management
- If an issue from `issues_to_look/` is resolved or found to be resolved, move it to the `issues_to_look/resolved/` directory to keep things clean.
