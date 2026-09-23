import dgram from "dgram";
import os from "os";

export const DISCOVERY_PORT = 3002;
export const DISCOVERY_MAGIC = "CADENCE_DISCOVER_V1";

export interface CadenceBeacon {
  magic: string;
  app: string;
  name: string;
  hostname: string;
  port: number;
  version: string;
  addresses: string[];
}

export class DiscoveryServer {
  private socket: dgram.Socket | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;
  private port: number;

  constructor(httpPort: number = 3001) {
    this.port = httpPort;
  }

  private getAddresses(): string[] {
    const addresses: string[] = [];
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === "IPv4" && !net.internal) {
          addresses.push(net.address);
        }
      }
    }
    return addresses;
  }

  private getBeaconPayload(): Buffer {
    const beacon: CadenceBeacon = {
      magic: DISCOVERY_MAGIC,
      app: "cadence",
      name: "Cadence Laptop",
      hostname: os.hostname(),
      port: this.port,
      version: "3.1.0",
      addresses: this.getAddresses(),
    };
    return Buffer.from(JSON.stringify(beacon));
  }

  public start(): void {
    if (this.socket) return;

    this.socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

    this.socket.on("error", (err) => {
      console.warn("[Cadence Discovery] UDP socket error:", err.message);
    });

    this.socket.on("message", (msg, rinfo) => {
      try {
        const text = msg.toString("utf8");
        if (text.includes("CADENCE_PING") || text.includes("CADENCE_SEARCH")) {
          const payload = this.getBeaconPayload();
          this.socket?.send(payload, 0, payload.length, rinfo.port, rinfo.address);
        }
      } catch {}
    });

    this.socket.bind(DISCOVERY_PORT, "0.0.0.0", () => {
      try {
        this.socket?.setBroadcast(true);
      } catch {}
      console.log(`[Cadence Discovery] UDP Beacon service active on port ${DISCOVERY_PORT}`);
    });

    // Periodic broadcast beacon every 5 seconds to 255.255.255.255
    this.intervalTimer = setInterval(() => {
      if (!this.socket) return;
      try {
        const payload = this.getBeaconPayload();
        this.socket.send(payload, 0, payload.length, DISCOVERY_PORT, "255.255.255.255");
      } catch {}
    }, 5000);
  }

  public stop(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    if (this.socket) {
      try {
        this.socket.close();
      } catch {}
      this.socket = null;
    }
  }
}
