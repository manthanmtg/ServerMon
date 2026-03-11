# 🗂️ File Browser Module Requirements

## 🧭 Overview
A graphical filesystem explorer for **ServerMon**, enabling administrators to navigate and manage server files through a secure web interface.

---

## 📂 Navigation & UI

- 🧩 **Interactive Breadcrumbs**  
  Quick navigation to any parent directory in the current path.

- 🧭 **Topbar Shortcuts**  
  Quick-access shortcuts displayed in the **top navigation bar**.

  - Configurable via **File Browser module settings** (similar to how the **Terminal module settings** are configured).
  - **Default shortcuts:**
    - **Root** (`/`)
    - **Home** (`~`)
  - Administrators can **add additional custom paths** (e.g., logs, data directories, project folders) for quick navigation.

- 🔎 **Real‑time Filter**  
  Instant search within the current directory for fast file discovery.

- 🎨 **Theme Support**  
  Adaptive styling compatible with all **6 ServerMon UI themes**.

- ⚡ **High Performance Lists**  
  Virtualized rendering for directories containing **1,000+ files**.

---

## 🛠️ Core Features (Phase 1)

### 📁 Directory Browsing
- Display files and folders in a structured list/grid.
- Show metadata:
  - 📦 **File Size**
  - 🕒 **Last Modified Date**
  - 🔐 **Permissions**

### ⬇️ Secure File Download
- Stream files directly from the server.
- Large file support using chunked streaming.

### 👀 Rich File Previews

- 💻 **Code / Config Files**
  - Syntax highlighting
  - Line numbers
  - Language auto‑detection

- 🖼️ **Image Preview**
  - Lightbox modal
  - Supports common formats (PNG, JPG, GIF, SVG, WebP)

- 📜 **Log Viewer**
  - Integrated log tailing
  - Auto refresh option
  - Scroll‑to‑latest

---

## 🔐 Security

- 🛡️ **Path Hardening**
  - Strict path validation
  - Prevent directory traversal attacks (`../`).

- 🔑 **Authentication Enforcement**
  - All operations require a **valid authenticated session**.

- 🖥️ **Platform Awareness**
  - Proper handling of filesystem differences between:
    - **Linux**
    - **macOS**

---

## 📄 File Modes

### 👁️ Open Files
- Syntax‑highlighted viewer for supported file types.

### 🔒 Read‑Only Mode
- Files can be viewed but **not modified**.

### ✏️ Edit Mode
- Inline editor for modifying files.
- Save changes directly to the server.
- Requires proper user permissions.

---

## ✨ Additional Features

### 📤 File Upload
- Drag & drop file uploads directly into the current directory.
- Multiple file upload support.
- Upload progress indicator.
- Support for large files via chunked uploads.

### 📦 Archive Support
- Download directories as **ZIP archives**.
- Extract common archive formats:
  - `zip`
  - `tar`
  - `tar.gz`
- Optional preview of archive contents before extraction.

### 📋 Inline File Actions
Quick actions available directly in the file list:
- ✏️ Rename
- ⬇️ Download
- 📋 Copy path
- 🗑 Delete
- 👁 Preview

### 📋 Copy Absolute Path
- One-click **Copy Path** button for files and directories.
- Useful for quickly referencing paths in the **Terminal module**.

### 🔄 Directory Refresh
- Manual refresh button.
- Optional **auto-refresh** for frequently changing directories.

### 📊 Human-Readable File Sizes
Display file sizes in readable formats:
- KB
- MB
- GB

### 🧩 File Type Icons
Visual icons based on file type for quick recognition.

Examples:
- 📄 Text files
- ⚙️ Configuration files
- 🐍 Scripts
- 🖼 Images
- 📦 Archives
- 📜 Log files

### 🧾 Live Log Streaming
Enhanced log viewer capabilities:
- Real-time streaming similar to `tail -f`
- Pause / resume streaming
- Auto scroll to latest log entry

### 🧹 File Operations
Basic filesystem management actions:
- Rename files
- Delete files
- Move files
- Copy files
- Create new folder
- Create new file

### 🧭 Directory History
Navigation similar to a web browser:
- Back to previous directory
- Forward navigation

### 🔗 Terminal Integration
Integration with the **ServerMon Terminal module**.

Examples:
- Open file in terminal editor
- Run commands like:
  - `nano <file>`
  - `tail -f <log>`

### ⭐ Favorite / Pinned Directories
- Pin frequently used directories.
- Appear in the **Topbar shortcuts** for quick access.

### 🔍 Advanced File Filters
Filter files using patterns such as:
- `*.log`
- `*.conf`
- `*.yaml`

### 🧾 File Version History (Future)
Optional file history support for tracking changes to important files.

### 🔍 Global File Search (Future)
Search across multiple directories instead of only the current directory.