# EnvVars Module Design

## Purpose

EnvVars is a stateless, OS-aware host environment manager. It lets an authenticated admin view the environment visible to the current ServerMon process, inspect persistent user environment sources, add user-scope variables, delete user-scope variables, and generate system-scope admin instructions.

The primary success criterion is simple: after an admin adds a user-scope variable and starts a fresh login shell or terminal session, running `env` should show that variable.

## Scope

EnvVars is not a ServerMon configuration store, app secrets store, or Mongo-backed metadata system. It does not store descriptions, audit records, or secret metadata in the database. It reads host state at request time and writes to OS-native user environment locations where the app can safely do so.

Version 1 supports:

- Viewing persistent user variables from detected shell startup files or Windows user environment sources.
- Viewing current session variables from `process.env`.
- Adding user-scope variables.
- Deleting user-scope variables.
- Masking secret-looking values by default with an eye icon to reveal or hide them.
- Generating copyable system-scope commands and instructions instead of attempting privilege escalation.

Version 1 does not support:

- Import/export.
- Mongo persistence.
- ServerMon-managed env files.
- App-specific secret injection.
- Silent edits to system-wide files.

## OS Behavior

On Unix-like systems, EnvVars detects the current shell from `$SHELL` and chooses the startup file most likely to affect future interactive sessions:

- `zsh`: `~/.zshenv`
- `bash`: `~/.bash_profile` when present, otherwise `~/.profile`
- other shells: `~/.profile`

For user-scope adds, EnvVars writes shell-safe `export KEY='value'` lines to the selected file. For deletes, it removes simple matching assignment/export lines for that key. If the existing assignment is complex or ambiguous, the module should avoid destructive edits and surface instructions.

On Windows, EnvVars uses the user environment scope so a newly opened terminal can see the variable. System-scope operations produce administrator PowerShell instructions.

For system scope on every OS, EnvVars generates explicit commands or instructions and does not execute them from the web UI.

## UX

The page has three working areas:

- Persistent Env: user-scope variables detected from persistent OS sources, with add/delete actions.
- Current Session Env: live `process.env`, read-only, similar to what the running process can see.
- System Scope Instructions: OS-specific commands for adding or deleting machine-level variables.

The add flow asks for key, value, and scope. It explains user scope versus system scope in plain language. User-scope changes apply directly when safe. System-scope changes display commands.

Secret-looking variable names such as `*_KEY`, `*_TOKEN`, `*_SECRET`, `PASSWORD`, `PASS`, `PRIVATE`, and `CREDENTIAL` are masked by default. Each row has a simple reveal/hide icon.

The UI clearly explains that environment changes do not update already-running terminals or services. Users must open a new terminal, log in again, restart affected services, or reboot depending on OS and scope.

## API And Modules

The module follows existing ServerMon conventions:

- `src/modules/env-vars/module.ts`
- `src/modules/env-vars/types.ts`
- `src/modules/env-vars/ui/EnvVarsPage.tsx`
- `src/modules/env-vars/ui/EnvVarsWidget.tsx`
- `src/lib/env-vars/service.ts`
- `src/app/api/modules/env-vars/route.ts`
- `src/app/env-vars/page.tsx`

All API handlers require an authenticated admin session, use `createLogger('api:env-vars')`, and return `{ error: "message" }` on failure.

## Testing

Tests cover:

- Variable name validation.
- Secret detection and masking helpers.
- Shell value quoting.
- Shell env parsing.
- User-scope add/delete behavior on temporary files.
- System-scope instruction generation.
- API auth and validation paths.
- Module registration.
- Basic page/widget rendering and masking toggles.
