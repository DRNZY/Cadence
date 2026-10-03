import dgram from "dgram";
import os from "os";
import net from "net";

export const DISCOVERY_PORT = 3002;
export const DISCOVERY_MAGIC = "CADENCE_DISCOVER_V1";

/**
 * Whether a datagram source is a peer we should actually answer.
 *
 * Discovery is a same-LAN convenience, so the only legitimate requesters are
 * hosts on a local network. Anything routable off-box means the source address
 * was spoofed (UDP source addresses are unverified), and replying would convert
 * this daemon into a reflection amplifier.
 */
function isLocalPeerAddress(address: string): boolean {
  if (!net.isIP(address)) return false;

  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    if (a === 127) return true;                          // loopback
    if (a === 10) return true;                           // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true;     // 172.16.0.0/12
    if (a === 192 && b === 168) return true;             // 192.168.0.0/16
    if (a === 169 && b === 254) return true;             // link-local
    if (a === 100 && b >= 64 && b <= 127) return true;   // 100.64.0.0/10 CGNAT
    if (a >= 224) return true;                           // multicast/broadcast
    return false;
  }

  const lower = address.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (/^f[cd]/.test(lower)) return true;    // unique-local
  if (/^fe[89ab]/.test(lower)) return true; // link-local
  if (lower.startsWith("ff")) return true;  // multicast
  return false;
}

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

    /**
     * Reply to a ping, but only to a host that is actually on a local network.
     *
     * This handler used to echo the beacon to whatever address the datagram
     * claimed to come from. UDP source addresses are not verified by the
     * kernel, so a spoofed packet turned this into a reflection amplifier:
     * a 12-byte "CADENCE_PING" produced a ~185-byte reply aimed at an arbitrary
     * third party, which is the raw material for a DDoS. Answering only
     * link-local and RFC1918 destinations removes the amplification path
     * entirely, because a public address is never a legitimate peer here.
     */
    this.socket.on("message", (msg, rinfo) => {
      try {
        // A ping is a fixed, tiny string. Anything larger is not a client, and
        // parsing it would be work an attacker gets for free.
        if (msg.length > 64) return;

        const text = msg.toString("utf8");
        if (text.includes("CADENCE_PING") || text.includes("CADENCE_SEARCH")) {
          if (!isLocalPeerAddress(rinfo.address)) return;

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

    /**
     * Periodic beacon.
     *
     * Every 5 seconds, unconditionally and unauthenticated, this used to
     * multicast the machine's hostname, every LAN address, and the control port
     * to the whole broadcast domain. Passive listeners only had to wait. The
     * interval is now 30 seconds because discovery is a convenience, not a
     * liveness protocol, and a 6x reduction in broadcast volume costs nothing
     * that matters to a client pairing to a desktop app on the same desk.
     */
    this.intervalTimer = setInterval(() => {
      if (!this.socket) return;
      try {
        const payload = this.getBeaconPayload();
        this.socket.send(payload, 0, payload.length, DISCOVERY_PORT, "255.255.255.255");
      } catch {}
    }, 30000);
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
