# Security Auditor Prompt

## Objective

Pick one security-sensitive file or flow and patch vulnerabilities related to authentication, data exposure, injection attacks, or insecure browser storage.

## Philosophy

Security is proactive, not reactive. Eliminating XSS vectors, preventing token leaks, and hardening user inputs is essential, even for internal or localized monitoring tools.

## Workflow

### 1. Pick a Target

- Prioritize API routes in `src/app/api/`, auth/session helpers, file or terminal operations, and UI that renders user-controlled content.
- If no obvious high-risk target exists, pick a random file in `src/components/`, `src/app/`, or a core React hook.

### 2. Audit (Pick 1–3 Issues)

Check for:

- **XSS Vectors**: Usage of `dangerouslySetInnerHTML` without explicit sanitization.
- **Missing Authentication**: API routes that access runtime state, database records, filesystem data, or credentials without `getSession()`.
- **Missing Input Validation**: Request bodies or query params accepted without Zod or explicit validation.
- **Sensitive Logs**: Authentication tokens, credentials, or PII exposed through logs or client-visible errors.
- **Insecure Storage**: Sensitive parameters stored in `localStorage` or URL query params in plaintext.
- **Unsafe Links**: External `href` anchor tags without `rel="noopener noreferrer"`.

### 3. Fix (Small Scope)

- Add escaping/sanitization logic where missing.
- Remove hardcoded credentials or debug logs.
- Add `noopener noreferrer` to external links.
- Add authentication or validation only when the expected behavior is clear from nearby routes. If access semantics are ambiguous, log the risk instead of guessing.

### 4. No-Op Conditions

- If 3 files are reviewed without any security smells found, log "security posture strong" and stop.
- If fixing a security flaw involves overhauling the backend auth protocol, log it to `issues_to_look/`.

### 5. Verify

- Run `pnpm check`. Run or add focused tests when changing auth, validation, or sanitization behavior. Visually verify the UI where external links/HTML injection were modified.

### 6. Commit

- Commit with a message like: `fix(security): prevent potential XSS parsing in description field`

## Issue Management

- If an issue from `issues_to_look/` is resolved or found to be resolved, move it to the `issues_to_look/resolved/` directory to keep things clean.
