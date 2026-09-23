const net = require("net");
const fs = require("fs");
const path = require("path");

const DEFAULT_CLIENT_ID = process.env.DISCORD_CLIENT_ID || "1285642875142176840";

class DiscordRpc {
  constructor(clientId = DEFAULT_CLIENT_ID) {
    this.clientId = clientId;
    this.socket = null;
    this.connected = false;
    this.currentActivity = null;
    this.reconnectTimer = null;
  }

  getSocketPath() {
    if (process.platform === "win32") {
      return "\\\\?\\pipe\\discord-ipc-0";
    }
    const runtimeDir = process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid?.() || 1000}`;
    for (let i = 0; i < 10; i++) {
      const sockPath = path.join(runtimeDir, `discord-ipc-${i}`);
      if (fs.existsSync(sockPath)) {
        return sockPath;
      }
    }
    return path.join(runtimeDir, "discord-ipc-0");
  }

  connect() {
    if (this.socket || this.connected) return;

    const sockPath = this.getSocketPath();
    if (!fs.existsSync(sockPath) && process.platform !== "win32") {
      this.scheduleReconnect();
      return;
    }

    try {
      this.socket = net.createConnection(sockPath);

      this.socket.on("connect", () => {
        this.handshake();
      });

      this.socket.on("data", (data) => {
        this.handleMessage(data);
      });

      this.socket.on("error", () => {
        this.cleanup();
        this.scheduleReconnect();
      });

      this.socket.on("close", () => {
        this.cleanup();
        this.scheduleReconnect();
      });
    } catch {
      this.cleanup();
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 15000);
  }

  cleanup() {
    this.connected = false;
    if (this.socket) {
      try {
        this.socket.destroy();
      } catch {}
      this.socket = null;
    }
  }

  send(opcode, payload) {
    if (!this.socket || this.socket.destroyed) return;
    try {
      const json = JSON.stringify(payload);
      const len = Buffer.byteLength(json);
      const packet = Buffer.alloc(8 + len);
      packet.writeInt32LE(opcode, 0);
      packet.writeInt32LE(len, 4);
      packet.write(json, 8, len, "utf-8");
      this.socket.write(packet);
    } catch {}
  }

  handshake() {
    this.send(0, {
      v: 1,
      client_id: this.clientId
    });
  }

  handleMessage(data) {
    try {
      if (data.length < 8) return;
      const opcode = data.readInt32LE(0);
      const len = data.readInt32LE(4);
      const payloadStr = data.toString("utf-8", 8, 8 + len);
      const payload = JSON.parse(payloadStr);

      if (opcode === 1 && payload.cmd === "DISPATCH" && payload.evt === "READY") {
        this.connected = true;
        if (this.currentActivity) {
          this.setActivity(this.currentActivity);
        }
      }
    } catch {}
  }

  setActivity(activity) {
    this.currentActivity = activity;
    if (!this.connected) return;

    this.send(1, {
      cmd: "SET_ACTIVITY",
      args: {
        pid: process.pid,
        activity: activity || null
      },
      nonce: Math.random().toString(36).substring(2, 15)
    });
  }

  clearActivity() {
    this.currentActivity = null;
    if (this.connected) {
      this.setActivity(null);
    }
  }

  destroy() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.clearActivity();
    this.cleanup();
  }
}

module.exports = { DiscordRpc };
