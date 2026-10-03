import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { timingSafeEqual } from "crypto";

const USER_DATA_DIR = path.join(process.env.HOME || os.homedir(), ".config", "cadence");
const TOKEN_FILE = path.join(USER_DATA_DIR, "lan-token");

/**
 * The shared secret that guards a network-exposed Cadence server.
 *
 * Why this exists at all: a music server that binds to every interface has no
 * inherent notion of "the owner". Anything that can open a TCP socket to the
 * port gets the same view the desktop app has, which is the entire library, the
 * settings, and remote playback control. Loopback-only operation does not need
 * a token because reaching it already requires local code execution, but
 * LAN operation does, and that is a materially weaker precondition.
 */
function loadOrCreateToken(): string {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const existing = fs.readFileSync(TOKEN_FILE, "utf-8").trim();
      if (/^[a-f0-9]{64}$/.test(existing)) return existing;
    }
  } catch {
    // Fall through and mint a new one.
  }

  // 256 bits of entropy, hex encoded. This secret is the only thing standing
  // between a coffee-shop Wi-Fi and a stranger's scrobble history, so it is
  // generated rather than derived from anything guessable.
  const token = crypto.randomBytes(32).toString("hex");
  try {
    if (!fs.existsSync(USER_DATA_DIR)) {
      fs.mkdirSync(USER_DATA_DIR, { recursive: true, mode: 0o700 });
    }
    fs.writeFileSync(TOKEN_FILE, token + "\n", { encoding: "utf-8", mode: 0o600 });
    fs.chmodSync(TOKEN_FILE, 0o600);
  } catch (err) {
    console.warn("[Cadence Auth] Could not persist token file:", err);
  }
  return token;
}

let cachedToken: string | null = null;

export function getServerToken(): string {
  if (cachedToken === null) cachedToken = loadOrCreateToken();
  return cachedToken;
}

/**
 * Constant-time comparison of a presented token against the real one.
 *
 * `===` on a secret is a timing oracle in principle; the practical risk here
 * is low but the fix is one line, and the whole purpose of this function is to
 * be the strong door rather than the one with the dodgy lock.
 */
export function tokenMatches(presented: string | undefined | null): boolean {
  if (!presented) return false;
  const expected = Buffer.from(getServerToken(), "utf-8");
  const given = Buffer.from(String(presented).trim(), "utf-8");
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}

/**
 * Whether this process was deliberately exposed to the network.
 *
 * Defaulting to loopback is the whole security posture of the app. Exposure is
 * an explicit, per-launch decision rather than a default that quietly exposes
 * the user's library to every device on the network.
 */
export function isLanExposed(): boolean {
  return process.env.CADENCE_LAN === "1";
}

export function isLoopbackAddress(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

/**
 * Hosts to bind in loopback mode.
 *
 * Both families are required, and this is not theoretical. On this machine
 * `getent hosts localhost` returns `::1` first, and Chromium — unlike curl —
 * does *not* fall back to IPv4 when the IPv6 attempt is refused. Binding only
 * `127.0.0.1` therefore made `mainWindow.loadURL("http://localhost:3001")` fail
 * with ERR_CONNECTION_REFUSED, which blanked the entire app window. Verified:
 * curl succeeded against an IPv4-only bind while Electron got refused.
 */
export function getBindHosts(): string[] {
  return isLanExposed() ? ["0.0.0.0", "::1"] : ["127.0.0.1", "::1"];
}

/**
 * Pull the token out of wherever the client chose to put it.
 *
 * A query parameter is accepted because that is what a media player, a CLI, or
 * an `<audio src>` element can actually set. The header is preferred because it
 * does not end up in access logs.
 */
export function extractToken(req: any): string | undefined {
  const header = req.headers["x-cadence-token"];
  if (typeof header === "string" && header) return header;
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7);
  }
  const q = req.query?.token;
  if (typeof q === "string" && q) return q;
  return undefined;
}
