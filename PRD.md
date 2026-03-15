# ServerMon Product Requirements Document (PRD)

## 1. Product Overview

**ServerMon** is a modular, self‑hosted server monitoring and control platform designed to run continuously as a background service and provide administrators with a secure web interface for managing infrastructure.

The system is intentionally designed with a **modular architecture**, allowing features to be added as independent modules without modifying the core system.

ServerMon prioritizes:

- Strong security
- Simple deployment
- Extensibility
- Real‑time monitoring
- Lightweight architecture

The application runs locally on the server and exposes a secure web interface.

---

# 2. Core Product Goals

1. Provide a **secure web interface** for server administration.
2. Provide **modular server monitoring capabilities**.
3. Allow **easy addition of new modules**.
4. Provide **one‑click deployment** for non‑expert users.
5. Maintain **high reliability as a system service**.

---

# 3. Tech Stack

Frontend + Backend (Monolithic App)

- **NextJS (Latest)**
- **TypeScript (strict mode)**
- **MongoDB**
- **Node.js (LTS)**

Libraries (Recommended)

- **Zod** for schema validation and strongly typed data contracts across API routes, modules, and database models
- mongoose / mongodb native driver with typed models
- socket.io / ws for realtime streams
- node-pty for terminal module
- bcrypt / argon2 for password hashing
- speakeasy or otplib for TOTP

---

## 3.1 Environment Configuration

ServerMon configuration should primarily be controlled via **environment variables**.

Critical configuration values must **never be hardcoded**.

Example environment variables:

```
PORT=8912
MONGO_URI=mongodb://localhost:27017/servermon
NODE_ENV=production
```

### MongoDB Connection

The MongoDB connection string **must be provided using the `MONGO_URI` environment variable**.

Example:

```
MONGO_URI=mongodb://127.0.0.1:27017/servermon
```

This allows flexible deployment scenarios:

- Local MongoDB
- Remote MongoDB cluster
- Managed MongoDB services

---

## 3.2 Local Development Support

ServerMon must support **easy localhost development and testing**.

Development environment requirements:

- Run using `localhost`
- Connect to local MongoDB instance
- No nginx required
- No SSL required

Example dev access:

```
http://localhost:8912
```

This enables:

- rapid module development
- debugging
- analytics validation
- UI testing

---

# 4. Runtime Characteristics

ServerMon runs continuously as a **system service**.

### Service Configuration

- Managed using **systemctl (systemd)**
- Automatically restarts on crash
- Logs available via `journalctl`

Example service name:

`servermon.service`

Default Application Port:

`8912`

---

# 5. Security Model

Security is a **primary design goal**.

ServerMon implements **multi‑layer authentication**.

## 5.1 Authentication Flow

1. User accesses web interface
2. HTTP Basic Auth validation
3. TOTP verification (Google Authenticator)
4. Session established

Both factors must succeed.

---

## 5.2 Basic Authentication

Credentials are stored in MongoDB.

Security requirements:

- Passwords hashed using **Argon2 or bcrypt**
- Salting required
- No plaintext storage
- Rate limiting on login attempts

Admin can change credentials via **System Settings**.

---

## 5.3 TOTP Authentication

Second factor authentication using:

- **Google Authenticator compatible TOTP**

Features:

- QR code enrollment
- Secret stored securely in database
- Optional recovery codes

---

## 5.4 Optional Security Enhancements (Future)

- IP allowlist
- Session expiry
- Login audit logs
- Reverse proxy enforcement

---

# 6. Application Architecture

ServerMon consists of two main layers:

1. **Core System**
2. **Modules**

Core provides the platform.
Modules provide functionality.

```
Core System
 ├── Authentication
 ├── Dashboard
 ├── Settings
 ├── Module Loader
 ├── Module Registry
 └── Event Bus

Modules
 ├── Terminal
 ├── Process Monitor
 └── Future Modules
```

---

# 7. Core System Components

## 7.1 Dashboard

The dashboard is the primary landing page.

Features:

- Displays widgets from modules
- Live updating metrics
- Configurable widget layout

Widgets are **registered by modules**.

---

## 7.2 System Settings

Static core section located in the **left navigation pane**.

Capabilities:

- Change Basic Auth credentials
- Configure TOTP
- **Appearance: Extensible Theme System (Supports wide variety of presets like Light, Dark, Solarized, Monokai, Synthwave, etc., mimicking VS Code's variety)**
- Manage modules
- View system status

---

## 7.3 Module Loader

Responsible for discovering and loading modules at runtime.

Responsibilities:

- Detect installed modules
- Initialize module
- Register module components

Modules register:

- Dashboard widgets
- Navigation entries
- Settings panels

---

## 7.4 Module Registry

A centralized registry storing module metadata.

Tracks:

- module id
- module version
- enabled/disabled state
- registered widgets

---

## 7.5 Event Bus (Recommended)

Allows modules to communicate with the core system.

Example events:

- system.metrics.updated
- module.loaded
- module.error

---

# 8. Module System

Modules extend the system.

Each module can provide:

- Dashboard widgets
- UI pages
- Background services
- Settings configuration

Modules are **self contained**.

---

## 8.1 Module Structure

Example module structure:

```
modules/
   terminal/
      module.ts
      api/
      ui/
      widgets/
      settings/
      schema.ts
```

---

## 8.2 Module Registration Interface

Each module exports a registration object.

Example:

```
export const module = {
  id: "terminal",
  name: "Terminal",
  widgets: [],
  routes: [],
  settings: {}
}
```

---

## 8.3 Module Capabilities

Modules may register:

| Capability      | Description         |
| --------------- | ------------------- |
| Widget          | Dashboard component |
| Route           | UI page             |
| Settings        | Module config       |
| Background task | Monitoring jobs     |

---

## 8.4 Cross-Platform Module Requirements

ServerMon is designed to run on **multiple operating systems and machine architectures**.

Modules must support various environments whenever possible.

Supported environments include:

- Linux (Ubuntu, Debian, etc.)
- macOS
- Windows

Modules should avoid OS‑specific logic unless necessary.

If OS specific behavior is required, modules must implement **platform detection**.

Example:

```
const platform = process.platform

if (platform === "linux") {
  // Linux implementation
}

if (platform === "win32") {
  // Windows implementation
}
```

Architecture targets include:

- x86_64
- ARM64
- cloud VM environments

Modules should rely on **Node.js APIs or cross-platform libraries** to maintain compatibility.

---

## 8.5 Module Settings

Each module maintains its own settings.

Stored in MongoDB.

Example:

```
module_settings
{
 moduleId
 config
 updatedAt
}
```

---

# 9. Example Modules

## 9.1 Terminal Module

Provides a **web-based terminal interface** for the host machine.

### Features

- Interactive shell
- PTY based terminal
- WebSocket streaming
- Multiple sessions

### Implementation

Uses:

- node-pty
- WebSocket transport

Security:

- Auth required
- Session isolation

---

## 9.2 Process Monitor Module

Provides visibility and control of running processes.

### Features

- List active processes
- CPU usage
- Memory usage
- Kill process

Possible integrations:

- ps
- top
- pid usage APIs

---

# 10. MongoDB Data Model

All schemas must be **strongly typed** and defined using **Zod**. Zod schemas act as the single source of truth for:

- API request/response validation
- MongoDB document validation
- module configuration schemas
- analytics event payloads

TypeScript types should be **derived from Zod schemas** to maintain full runtime + compile-time safety.

Recommended using **TypeScript + schema validation**.

---

## 10.1 Users Collection

ServerMon follows an **admin‑first user model**.

- The system is initialized with a **primary administrator account**.
- The **admin can create additional users** from System Settings.
- Only admin users can:
  - create users
  - delete users
  - reset credentials
  - manage modules
  - modify system settings

Future versions may introduce **RBAC**, but the initial version will support **Admin and Standard User roles**.

Example schema:

```
users
{
 _id
 username
 passwordHash
 role            // "admin" | "user"
 totpSecret
 totpEnabled
 createdAt
 createdBy
 lastLoginAt
 isActive
}
```

Notes:

- `passwordHash` uses **Argon2 or bcrypt**.
- `totpSecret` stored securely and used for Google Authenticator.
- `createdBy` references the admin who created the user.
- `isActive` allows disabling accounts without deletion.

---

## 10.2 Modules Collection

```
modules
{
 moduleId
 enabled
 installedAt
 version
}
```

---

## 10.3 Module Settings Collection

```
module_settings
{
 moduleId
 config
 updatedAt
}
```

---

## 10.4 System Settings

```
system_settings
{
 basicAuth
 security
 deployment
}
```

---

# 11. Deployment System

ServerMon provides **rich one‑click deployment scripts**.

Goal: allow installation in minutes.

---

## 11.1 Installation Script

The installer performs:

1. Install Node.js
2. Install MongoDB
3. Build ServerMon
4. Configure systemd service
5. Configure Nginx reverse proxy
6. Configure SSL certificate

---

## 11.2 Nginx Setup

Auto‑generated configuration.

Responsibilities:

- reverse proxy to port 8912
- TLS termination
- compression

---

## 11.3 SSL Certificate

Uses **Certbot**.

Installer will:

- request certificate
- configure renewal

---

## 11.4 Domain Configuration Guide

User documentation will include:

- DNS setup
- domain pointing
- SSL setup

---

# 12. User Interface

ServerMon must provide a **rich, modern, and highly interactive user interface**. The UI is a core part of the product experience and should feel similar to professional infrastructure dashboards.

Design goals:

- visually clean and modern
- highly responsive
- real‑time updates
- minimal latency
- keyboard friendly
- **Extensible Color Theme System: Support for a wide variety of interactive color themes (Light, Dark, High Contrast, and community-style presets like Monokai, Nord, etc.) to allow deep personalization of the monitoring workspace, similar to VS Code.**

The interface should prioritize **clarity of system information** and **ease of control**.

---

## 12.1 Design Principles

The UI should follow these principles:

- **Information density without clutter**
- **Real‑time feedback for actions**
- **Consistent design system across modules**
- **Clear visual hierarchy**
- **Fast navigation between modules**

Recommended UI capabilities:

- animated transitions
- loading skeletons
- toast notifications
- real-time charts
- interactive tables

---

## 12.2 Layout Structure

UI consists of three primary regions.

### Left Sidebar

Static elements:

- Dashboard
- System Settings

Dynamic elements:

- Module navigation entries

Capabilities:

- collapsible sidebar
- module icons
- active module highlighting

---

### Main Panel

Displays:

- Dashboard widgets
- Module pages
- Analytics views

The main panel should support:

- smooth page transitions
- dynamic content loading
- responsive layouts

---

### Top Utility Bar

Optional top bar may include:

- current user
- quick actions
- notifications
- system status indicators

---

## 12.3 Dashboard Widgets

Widgets should be **interactive and visually rich**.

Capabilities:

- drag & drop layout
- resize support
- real-time data updates
- charts and graphs

Examples:

- CPU usage chart
- Memory usage graph
- Active process count
- Network activity

---

## 12.4 Module UI Standards

All modules must follow a **consistent UI standard** provided by the core system.

Modules should:

- **Full Theme Compliance: All modules must honor the active color theme across all UI components and pages using core system variables.**
- use shared UI components
- follow the same layout conventions
- maintain consistent styling

Examples of module UI features:

Terminal module:

- full interactive terminal view
- session tabs
- command history

Process monitor module:

- sortable process table
- live CPU usage graphs
- quick kill actions

---

## 12.5 Real-Time UI Updates

ServerMon UI should heavily leverage **WebSockets for live updates**.

Examples:

- terminal streaming
- live system metrics
- process updates
- analytics event streams

This ensures the UI always reflects **current server state**.

---

# 13. Logging

. Logging

ServerMon logs:

- module events
- authentication events
- system errors
- deployment events

Logs accessible via:

- system logs
- UI log viewer (future)

---

# 14. Analytics System

ServerMon includes a **comprehensive internal analytics system** used to track system usage, module activity, and user behavior within the application.

The goal is to provide:

- operational insights
- debugging visibility
- module usage metrics
- auditability of actions

All meaningful actions within ServerMon should emit **analytics events**.

---

## 14.1 Application Level Analytics

Core application events tracked include:

- user login
- user logout
- dashboard opened
- settings modified
- module enabled / disabled
- module installed
- module removed
- authentication failures

Example event structure:

```
analytics_events
{
 eventId
 eventType
 userId
 moduleId
 metadata
 createdAt
}
```

Example:

```
{
 eventType: "module.opened",
 moduleId: "terminal",
 userId: "admin",
 createdAt: timestamp
}
```

---

## 14.2 Module Level Analytics

Each module can emit **custom analytics events**.

Examples:

Terminal Module:

- terminal.session.started
- terminal.session.closed
- terminal.command.executed

Process Monitor Module:

- process.list.opened
- process.killed

These events allow modules to expose their own **usage insights**.

---

## 14.3 Analytics API

The core system will provide a simple API for modules:

```
analytics.track({
  event: "module.action",
  moduleId: "terminal",
  userId,
  metadata: {}
})
```

Responsibilities of analytics system:

- store events in MongoDB
- provide future dashboard insights
- allow debugging and auditing

---

## 14.4 Future Analytics Dashboard

Future versions may include a built-in **analytics dashboard** showing:

- most used modules
- module usage frequency
- system activity timeline
- user activity history

---

# 15. Developer Module Guide

Developer Module Guide

A **clear onboarding guide** will be provided.

Includes:

- module structure
- API interfaces
- widget registration
- settings schema

Goal: allow developers to create modules quickly.

---

# 15. Future Modules (Examples)

Potential modules include:

- Disk usage monitor
- Docker manager
- Network monitor
- Log viewer
- File manager

---

# 16. Module Lifecycle

Each module follows a defined lifecycle managed by the core system.

Lifecycle stages:

init() – module discovered and initialized
start() – module activated and ready
stop() – module disabled or paused
destroy() – module uninstalled

Example:

```
export const module = {
  id: "terminal",
  name: "Terminal",

  init(ctx) {},
  start(ctx) {},
  stop(ctx) {}
}
```

This lifecycle ensures safe module startup, background worker management, and clean shutdown.

---

# 17. Module Permission Model

Some modules expose powerful system capabilities. A permission model ensures controlled access.

Example permissions:

- terminal.access
- process.kill
- module.install
- settings.modify

User roles initially supported:

- admin
- user

Future versions may introduce full **RBAC**.

---

# 18. Module Dependency System

Modules may depend on other modules.

Example:

```
dependencies: ["process-monitor"]
```

The module loader must validate dependencies before activating modules.

---

# 19. Server Capability Detection

The core system exposes runtime information about the host server.

Capabilities include:

- operating system
- CPU cores
- RAM
- disk capacity
- architecture
- Node.js version

Modules can access this information via a shared system context.

Example:

```
ctx.system.capabilities
```

This allows modules to adapt behavior based on the server environment.

---

# 20. Core Module SDK

The core system exposes a stable SDK for modules to interact with the platform.

Available APIs may include:

```
ctx.analytics.track()
ctx.events.emit()
ctx.db.collection()
ctx.logger.info()
ctx.system.capabilities
ctx.settings.get()
ctx.ui.theme             // Active theme name and color tokens
```

This SDK provides a consistent interface for module developers and ensures safe interaction with core systems.

---

# 21. Metrics vs Analytics

ServerMon distinguishes between **analytics** and **metrics**.

Analytics:

Tracks user behavior and application interactions.

Examples:

- module.opened
- terminal.session.started

Metrics:

Tracks real system performance.

Examples:

- cpu.usage
- memory.used
- disk.io
- network.traffic

Metrics power dashboards and monitoring widgets.

---

# 22. First‑Time Setup Wizard

On first launch, ServerMon should provide a guided setup wizard.

Example path:

```
http://localhost:8912/setup
```

Wizard steps:

1. Create admin user
2. Configure TOTP
3. Validate MongoDB connection
4. Verify system requirements
5. Complete setup

This improves usability for first‑time installations.

---

# 23. Non Functional Requirements

Performance

- low CPU overhead
- efficient websocket streams

Reliability

- service auto restart

Security

- encrypted authentication data

Extensibility

- modular architecture

---

# 17. Future Enhancements

Possible roadmap items:

- RBAC user roles
- multi server monitoring
- alerting system
- notification integrations

Examples:

- Slack
- Email
- Webhooks

---

# 18. Summary

ServerMon is a **secure, modular server management platform** designed for extensibility and ease of deployment.

By separating the **core platform from modules**, ServerMon allows rapid expansion of capabilities while maintaining a stable foundation.
