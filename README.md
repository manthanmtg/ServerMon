# ServerMon

**ServerMon** is a modular, high-performance, and secure server management platform designed for administrators who value simplicity and extensibility. It provides a real-time command center for your infrastructure with a beautiful, theme-aware interface.

## ✨ Features

- **🛡️ Secure by Design**: Built with Multi-Factor Authentication (TOTP), Argon2 password hashing, and encrypted JWT sessions.
- **🧩 Modular Architecture**: Add or remove capabilities as independent modules.
- **🖥️ Integrated Terminal**: High-performance, theme-aware terminal access directly in your browser (Xterm.js).
- **📈 Real-time Analytics**: Sub-second metrics streaming (SSE) with high-fidelity charts for CPU and Memory history.
- **🔍 Active Auditing**: Comprehensive system logs and module-level event tracking.
- **🎨 Designer Themes**: Beautiful, VS Code-inspired themes (Nord, Monokai, Synthwave, Solarized, and more).

---

## 🚀 One-Click Installation

To deploy ServerMon on a fresh Ubuntu or Debian server, run:

```bash
curl -fsSL https://raw.githubusercontent.com/manthanmtg/ServerMon/main/scripts/install.sh | sudo bash
```

This script automates:
1.  System updates and dependency installation (Node.js 20, MongoDB).
2.  Application compilation and setup in `/opt/servermon`.
3.  Environment configuration with secure secrets in `/etc/servermon/env`.
4.  Background service registration via **Systemd**.

---

## 🛠️ Management

Once installed, managed the service using standard system tools:

```bash
sudo systemctl status servermon   # Check status
sudo systemctl restart servermon  # Restart
sudo journalctl -u servermon -f   # View live logs
```

---

## 👩‍💻 Development

1. **Clone the repo**: `git clone...`
2. **Install dependencies**: `pnpm install`
3. **Environment**: Create a `.env.local` with `MONGO_URI` and `JWT_SECRET`.
4. **Run Dev server**: `pnpm run dev`

---

## 🎨 Theme Compliance
All modules and widgets in ServerMon honor the global theme system. To switch themes, visit **Settings > Appearance** in the web interface.

---

## 📄 License
MIT
