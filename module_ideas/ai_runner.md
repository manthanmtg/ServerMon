# 🚀 AI Agent Runner Module (Module Idea)

## 🧭 Overview

The **AI Agent Runner** module turns ServerMon into a **prompt execution platform** for AI coding agents. Instead of manually SSH-ing into a server, writing bash scripts, and wiring up cron jobs, operators get a **first-class UI** to:

1. **Compose & run prompts** against any repository on any configured agent (Claude Code, Codex, OpenCode, Gemini CLI, Aider, custom).
2. **Schedule prompts** via cron expressions with full lifecycle management.
3. **Inspect run history** — every run is captured with clean, ANSI-stripped terminal output, timestamps, exit codes, and resource usage.
4. **Configure agent invocation templates** once in Settings, then reuse them everywhere.

This module is the **operational backbone** for teams that use AI agents as automated contributors (feature PRs, module enhancements, test generation, documentation, refactoring).

> **Relationship to existing modules:**
> - The existing **AI Agents** module provides **passive observability** — detecting and monitoring running agent sessions.
> - The **AI Agent Runner** module provides **active orchestration** — launching, scheduling, and managing agent tasks from the UI.
> - The existing **Crons** module manages system cron jobs. The Runner module manages **its own scheduled prompts** independently, using its own scheduler/executor.

---

# 🎯 Goals

| Goal | Description |
|------|-------------|
| **One-Click Prompt Execution** | Run any prompt against any repo with a single click |
| **Scheduling** | Create recurring AI agent runs with cron expressions |
| **Agent-Agnostic** | Support multiple AI CLI tools via configurable templates |
| **Full Auditability** | Every run is logged with clean output, duration, exit code |
| **Safe Defaults** | Validate commands, enforce timeouts, prevent runaway processes |
| **Zero Bash Scripts** | Eliminate the need for hand-written shell wrapper scripts |

---

# 🏗 Core Concepts

## 1️⃣ Agent Profiles (Settings)

An **Agent Profile** defines *how* to invoke a specific AI tool. Profiles are configured once in the module Settings and reused across all prompts and schedules.

### Profile Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `name` | string | Human-readable profile name | "Claude Code (Dangerous)" |
| `slug` | string | Unique identifier | "claude-dangerous" |
| `agentType` | enum | Agent family | `claude-code` / `codex` / `opencode` / `gemini-cli` / `aider` / `custom` |
| `invocationTemplate` | string | Shell command template. Must contain `$PROMPT` placeholder. May contain `$WORKING_DIR`. | See examples below |
| `defaultTimeout` | number | Default timeout in minutes | `30` |
| `maxTimeout` | number | Hard maximum timeout in minutes | `120` |
| `shell` | string | Shell to use | `/bin/bash` |
| `env` | Record<string, string> | Extra environment variables | `{ "ANTHROPIC_API_KEY": "..." }` |
| `enabled` | boolean | Whether this profile is available | `true` |
| `icon` | string | Optional custom icon identifier | `"claude"` |

### Example Invocation Templates

**Codex:**
```bash
codex --dangerously-bypass-approvals-and-sandbox "$PROMPT"
```

**Claude Code:**
```bash
apt-get update -y >/dev/null 2>&1 && apt-get install -y acl >/dev/null 2>&1 && setfacl -m u:claudeuser:rx /root && setfacl -R -m u:claudeuser:rwx /root/repos && mkdir -p /home/claudeuser/.claude && echo '{"trustedDirectories":["/root/repos","/workspace","/home/claudeuser"]}' > /home/claudeuser/.claude/settings.json && chown -R claudeuser:claudeuser /home/claudeuser/.claude && su - claudeuser -c "cd /root/repos 2>/dev/null || cd /workspace 2>/dev/null || cd ~; claude --dangerously-skip-permissions \"$PROMPT\""
```

**Aider:**
```bash
aider --yes --message "$PROMPT"
```

**Custom:**
```bash
/usr/local/bin/my-agent --auto "$PROMPT"
```

### Template Validation

When saving a profile, the system **validates the invocation template**:

- ✅ `$PROMPT` placeholder must be present
- ✅ Balanced quotes (single and double)
- ✅ No unclosed subshells / command substitutions
- ✅ No dangerous patterns unless explicitly acknowledged (`rm -rf /`, etc.)
- ✅ Template must be parseable by the shell (`bash -n` check on a sanitized version)
- ⚠️ Warn if `$WORKING_DIR` is not used (agent will run from the specified directory via `cd`)

---

## 2️⃣ Prompts

A **Prompt** is the unit of work to execute. Prompts can be:

- **Ad-hoc**: Written inline in the UI and executed immediately
- **Saved**: Stored in the database for reuse / scheduling
- **File-referenced**: Points to a markdown file on disk (e.g., `@prompts/random_module_enhancer_prompt.md`)

### Prompt Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `name` | string | Human-readable name |
| `content` | string | The prompt text OR a file path (prefixed with `@`) |
| `type` | enum | `inline` / `file-reference` |
| `agentProfileId` | string | Which agent profile to use |
| `workingDirectory` | string | Directory to run in (repository path) |
| `timeout` | number | Timeout in minutes (overrides profile default) |
| `tags` | string[] | Tags for organization |
| `createdAt` | string | ISO timestamp |
| `updatedAt` | string | ISO timestamp |

### File-Referenced Prompts

When `type` is `file-reference`, the `content` field contains a path like:
```
/root/repos/LifeOS/prompts/random_module_enhancer_prompt.md
```

At execution time, the system reads the file content and injects it as the prompt. This allows prompts to be version-controlled alongside the repository.

---

## 3️⃣ Scheduled Runs

A **Scheduled Run** binds a saved prompt to a cron expression.

### Schedule Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `name` | string | Human-readable name |
| `promptId` | string | Which saved prompt to run |
| `cronExpression` | string | Standard 5-field cron expression |
| `enabled` | boolean | Whether the schedule is active |
| `lastRunId` | string? | Most recent run ID |
| `lastRunStatus` | string? | Status of most recent run |
| `nextRunTime` | string? | Computed next run timestamp |
| `createdAt` | string | ISO timestamp |
| `updatedAt` | string | ISO timestamp |

### Schedule Management

- **Create** / **Edit** / **Delete** / **Enable** / **Disable** schedules
- Visual cron expression builder (reuse from Crons module with `ScheduleBuilder`)
- **Next N runs** preview with real-time countdown
- **Conflict detection**: warn if two schedules overlap on the same working directory

---

## 4️⃣ Run History & Output

Every execution (manual or scheduled) produces a **Run Record**.

### Run Record Fields

| Field | Type | Description |
|-------|------|-------------|
| `runId` | string | Unique run identifier |
| `promptId` | string? | Saved prompt ID (null for ad-hoc) |
| `scheduleId` | string? | Schedule ID (null for manual runs) |
| `agentProfileId` | string | Which agent profile was used |
| `promptContent` | string | The actual prompt text sent |
| `workingDirectory` | string | Where the command ran |
| `command` | string | The fully-resolved command that was executed |
| `pid` | number | Process ID |
| `status` | enum | `queued` / `running` / `completed` / `failed` / `timeout` / `killed` |
| `exitCode` | number? | Process exit code |
| `stdout` | string | Captured stdout (ANSI-stripped) |
| `stderr` | string | Captured stderr |
| `rawOutput` | string | Raw terminal output with ANSI codes preserved |
| `startedAt` | string | ISO timestamp |
| `finishedAt` | string? | ISO timestamp |
| `durationSeconds` | number? | Total run duration |
| `triggeredBy` | enum | `manual` / `schedule` |
| `resourceUsage` | object? | Peak CPU/memory during run |

### Output Handling

**Critical requirement**: The output viewer must show **clean, readable terminal output**, not raw gibberish with ANSI escape codes.

Strategy:
1. Capture output using `script -q` (pseudo-TTY) for agents that need it
2. Store both **raw** (with ANSI) and **stripped** (clean text) versions
3. The UI output viewer supports two modes:
   - **Clean mode** (default): Stripped text, syntax-highlighted where possible
   - **Terminal mode**: Render ANSI codes using a terminal emulator component (xterm.js)
4. Strip control characters that aren't standard ANSI colors (cursor movement, screen clear, etc.)

### Output Viewer Features

- **Search** within output (`Ctrl+F` style)
- **Copy** entire output or selection
- **Download** output as `.log` file
- **Auto-scroll** during live runs (toggleable)
- **Line numbers** for reference
- **Timestamp overlay** for long runs (elapsed time markers)
- **Collapsible sections** for very long outputs

---

# 📊 UI Design

## Main Page Layout

The AI Agent Runner page uses a **tabbed layout** with the following tabs:

### Tab 1: 🏃 Run (Default)

The primary interaction surface. A **split-pane** design:

**Left panel — Prompt Composer:**
- Agent profile selector (dropdown with icons)
- Working directory input (with autocomplete from known repositories)
- Prompt input (large textarea with markdown preview)
- OR file-reference picker (browse server filesystem)
- Timeout slider (with profile default pre-filled)
- **▶ Run Now** button (prominent, primary color)
- **💾 Save Prompt** button (save for reuse / scheduling)

**Right panel — Live Output:**
- Real-time streaming output (xterm.js or clean text)
- Status indicator (running spinner / success checkmark / failure X)
- Duration counter
- Kill button (for running processes)
- When no run is active, show "Run a prompt to see output here"

---

### Tab 2: 📋 Saved Prompts

A **table/card view** of all saved prompts.

Each entry shows:
- Prompt name
- Agent profile badge
- Working directory
- Type badge (`inline` / `file`)
- Tags
- Last run status & time
- Actions: **Run** / **Edit** / **Schedule** / **Delete**

Features:
- Search / filter by tags, agent, directory
- Bulk actions (delete, tag)
- Quick-run button (executes immediately with saved settings)

---

### Tab 3: 📅 Schedules

A **table view** of all scheduled prompts (similar to Crons module layout).

Each entry shows:
- Schedule name
- Linked prompt name
- Cron expression (human-readable description)
- Agent profile badge
- Status (enabled/disabled)
- Next run (real-time countdown)
- Last run status
- Actions: **Enable/Disable** / **Edit** / **Run Now** / **Delete**

Features:
- Schedule builder with presets (reuse `ScheduleBuilder` component)
- Next N runs preview
- Conflict warnings
- Enable/disable toggle

---

### Tab 4: 📜 History

A **rich, searchable table** of all past runs (both manual and scheduled).

Columns:
- Status badge
- Trigger type (manual / scheduled)
- Prompt name / content preview
- Agent profile
- Working directory
- Started at
- Duration
- Exit code
- **View Output** button

Features:
- Filter by: status, trigger type, agent, directory, date range
- Sort by any column
- Pagination / infinite scroll
- **Output viewer modal** (full-screen capable)
- Export run log as JSON

---

### Tab 5: ⚙️ Settings

Agent profile management (CRUD).

**Profile List:**
- Cards for each configured agent profile
- Status badge (enabled/disabled)
- Quick test button (runs `echo "test"` to verify the template works)
- Edit / Delete / Duplicate actions

**Profile Editor (Modal):**
- All profile fields (see Agent Profiles section above)
- Template editor with syntax highlighting
- **Validate** button (checks template syntax)
- Variable reference (`$PROMPT`, `$WORKING_DIR`)
- Preview of resolved command

**Global Settings:**
- Default working directory
- Default timeout
- Max concurrent runs
- Output retention policy (days to keep)
- Log storage directory override

---

## Dashboard Widget

The module should register a **dashboard widget** showing:

- Number of active runs (with live animation)
- Recent run statuses (last 5, with colored dots)
- Next scheduled run (countdown)
- Quick-run button for most-used prompt

---

# 🧩 Backend Architecture

## Data Storage (MongoDB)

### Collections

```
aiRunnerProfiles     — Agent profile configurations
aiRunnerPrompts      — Saved prompts
aiRunnerSchedules    — Scheduled runs
aiRunnerRuns         — Run history and output
```

### Indexes

- `aiRunnerRuns`: compound index on `(status, startedAt)` for active run queries
- `aiRunnerRuns`: index on `promptId` for history lookups
- `aiRunnerRuns`: index on `scheduleId` for schedule history
- `aiRunnerRuns`: TTL index on `startedAt` for automatic cleanup (configurable retention)

---

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| **GET** | `/api/modules/ai-runner/profiles` | List all agent profiles |
| **POST** | `/api/modules/ai-runner/profiles` | Create agent profile |
| **PUT** | `/api/modules/ai-runner/profiles/:id` | Update agent profile |
| **DELETE** | `/api/modules/ai-runner/profiles/:id` | Delete agent profile |
| **POST** | `/api/modules/ai-runner/profiles/:id/validate` | Validate invocation template |
| **POST** | `/api/modules/ai-runner/profiles/:id/test` | Quick-test profile (echo) |
| | | |
| **GET** | `/api/modules/ai-runner/prompts` | List saved prompts |
| **POST** | `/api/modules/ai-runner/prompts` | Create saved prompt |
| **PUT** | `/api/modules/ai-runner/prompts/:id` | Update saved prompt |
| **DELETE** | `/api/modules/ai-runner/prompts/:id` | Delete saved prompt |
| | | |
| **GET** | `/api/modules/ai-runner/schedules` | List schedules |
| **POST** | `/api/modules/ai-runner/schedules` | Create schedule |
| **PUT** | `/api/modules/ai-runner/schedules/:id` | Update schedule |
| **DELETE** | `/api/modules/ai-runner/schedules/:id` | Delete schedule |
| **POST** | `/api/modules/ai-runner/schedules/:id/toggle` | Enable/disable schedule |
| | | |
| **POST** | `/api/modules/ai-runner/run` | Execute a prompt (ad-hoc or saved) |
| **GET** | `/api/modules/ai-runner/runs` | List run history |
| **GET** | `/api/modules/ai-runner/runs/:runId` | Get run details + output |
| **POST** | `/api/modules/ai-runner/runs/:runId/kill` | Kill a running process |
| **GET** | `/api/modules/ai-runner/runs/active` | List currently running executions |
| | | |
| **GET** | `/api/modules/ai-runner/directories` | List known repositories/directories |

---

## Execution Engine

The execution engine is the core of the module. It handles:

### Process Lifecycle

```
QUEUED → RUNNING → COMPLETED / FAILED / TIMEOUT / KILLED
```

### Execution Flow

1. **Resolve prompt**: Read inline content or load file from disk
2. **Resolve template**: Substitute `$PROMPT` and `$WORKING_DIR` into the agent profile template
3. **Validate**: Check working directory exists, template is valid
4. **Spawn process**: 
   - Use `script -q` wrapper for pseudo-TTY (needed by many agents)
   - Set `timeout` command wrapper for safety
   - Set environment variables from profile
   - `cd` to working directory before execution
5. **Stream output**: Capture stdout/stderr in real-time, store incrementally
6. **Monitor**: Track PID, resource usage, duration
7. **Complete**: Record exit code, strip ANSI for clean output, update run record

### Safety Features

- **Timeout enforcement**: Double-layer — `timeout` command + server-side process monitor
- **Max concurrent runs**: Configurable limit (default: 3)
- **Working directory validation**: Must exist and be accessible
- **Process isolation**: Each run gets its own PID group for clean kill signals
- **Output size limits**: Cap stored output at configurable max (default: 10MB per run)
- **Dead process detection**: Periodic check for zombie processes from previous runs

---

## Scheduler Engine

The scheduler runs as a **background service** within the ServerMon process.

### Implementation

- On startup, load all enabled schedules from MongoDB
- Compute next run time for each schedule
- Use `node-cron` or a simple interval-based checker (every 30 seconds) to trigger due schedules
- On schedule trigger: create a run record and hand off to the Execution Engine
- After each run: update schedule's `lastRunId`, `lastRunStatus`, compute `nextRunTime`

### Scheduler Resilience

- **Missed runs**: If the server was down during a scheduled time, log the miss but do **not** auto-run (configurable)
- **Overlap prevention**: If a scheduled prompt is still running when the next trigger fires, skip and log a warning
- **Hot reload**: When a schedule is created/updated/deleted via the API, the in-memory scheduler reloads immediately

---

# 🔗 Integration With Other Modules

### 🤖 AI Agents Module
- When a Runner execution starts an AI agent process, the AI Agents module can detect and track the session
- Cross-link: from a Run's detail view, link to the AI Agents session if detected

### ⏰ Crons Module
- Share the `ScheduleBuilder` UI component
- The Runner module manages its **own** schedules (not system crontab)
- Migration tool: import existing AI-related cron jobs into the Runner module

### 🖥 Terminal Module
- "Open in Terminal" action for any working directory
- Terminal fallback for manual debugging

### 📂 File Browser
- Browse and select prompt files from disk
- View files modified by agent runs

### 📊 Metrics Module
- Emit metrics for run duration, success rate, agent usage
- Dashboard integration for trends

---

# 📈 Analytics & Insights

The module should provide aggregate analytics:

- **Run Success Rate**: Per agent profile, per prompt, per schedule
- **Average Duration**: Trending over time
- **Most Active Repositories**: Which repos get the most AI attention
- **Agent Usage Distribution**: Pie chart of runs per agent type
- **Schedule Health**: Which schedules frequently fail or timeout
- **Token Usage Tracking**: If parseable from agent output, track input/output tokens

---

# 🚀 Future Capabilities

## 🔗 Chained Prompts (Pipelines)
Run multiple prompts in sequence — e.g., "enhance module" → "run tests" → "create PR".

## 📋 Prompt Templates
Parameterized prompts with variables: `Enhance the {{MODULE_NAME}} module in {{REPO_PATH}}`.

## 🔔 Notifications
Send alerts on run completion/failure via webhook, email, or Slack.

## 🔀 Git Integration
Auto-create branches before runs, auto-commit after, auto-PR on success.

## 🧪 Dry Run Mode
Preview the resolved command without executing it.

## 📊 Cost Tracking
Track estimated API costs per run (by parsing token usage from agent output).

## 🔐 Secrets Management
Secure storage for API keys used in agent profiles (encrypted at rest).

## 🌐 Multi-Server
Dispatch prompts to remote servers (agent runner as a distributed system).

---

# 🎯 Summary

The **AI Agent Runner** module transforms ServerMon from a monitoring tool into a full **AI DevOps platform**. It provides:

| Capability | Description |
|-----------|-------------|
| **Execute** | Run AI agent prompts from a rich UI |
| **Schedule** | Automate recurring AI tasks with cron expressions |
| **Configure** | Set up multiple agents with validated invocation templates |
| **Monitor** | Live-stream output with clean terminal rendering |
| **Audit** | Full history of every run with searchable, downloadable output |
| **Analyze** | Aggregate insights on AI agent usage and success rates |

This eliminates the need for hand-written bash scripts, manual cron job management, and opaque log files — replacing them with a **centralized, observable, and configurable** AI agent orchestration layer.
