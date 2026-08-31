#!/usr/bin/env bun
import fs from "fs";
import path from "path";
import os from "os";
import { spawn, execSync } from "child_process";

const MUSIC_DIR = path.resolve(process.env.MUSIC_DIR || path.join(os.homedir(), "Music"));
const CACHE_DIR = path.join(os.homedir(), ".cache", "cadence");
const CADENCE_SERVER_URL = "http://localhost:3001";
const CADENCE_APP_SCRIPT = "/home/darnell/Projects/cadence/cadence.sh";

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Clean up any rogue background CLI audio processes
export function cleanupOrphanAudio() {
  try {
    execSync("pkill -f 'cadence_audio_playback' 2>/dev/null || true");
  } catch {}
}

async function isCadenceServerRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${CADENCE_SERVER_URL}/api/ctl/state`, { signal: AbortSignal.timeout(600) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function ensureCadenceApp(): Promise<boolean> {
  cleanupOrphanAudio();
  const running = await isCadenceServerRunning();
  if (running) return true;

  console.log("🚀 Launching Cadence Desktop Application...");
  const child = spawn(CADENCE_APP_SCRIPT, [], {
    cwd: "/home/darnell/Projects/cadence",
    detached: true,
    stdio: "ignore",
    env: { ...process.env, DISPLAY: process.env.DISPLAY || ":0" }
  });
  child.unref();

  // Wait up to 10 seconds for Cadence to boot
  const start = Date.now();
  while (Date.now() - start < 10000) {
    if (await isCadenceServerRunning()) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  return false;
}

export async function sendCadenceCommand(action: string, payload: Record<string, any> = {}): Promise<any> {
  await ensureCadenceApp();
  try {
    const res = await fetch(`${CADENCE_SERVER_URL}/api/ctl/playback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload })
    });
    return await res.json();
  } catch (err: any) {
    console.error("Failed to communicate with Cadence:", err.message);
    return null;
  }
}

export async function getCadenceState(): Promise<any> {
  try {
    const res = await fetch(`${CADENCE_SERVER_URL}/api/ctl/state`, { signal: AbortSignal.timeout(1000) });
    if (res.ok) {
      return await res.json();
    }
  } catch {}
  return { status: "stopped", currentTrack: null };
}

export async function rescanLibrary(): Promise<any> {
  try {
    const res = await fetch(`${CADENCE_SERVER_URL}/api/rescan`, {
      method: "POST",
      signal: AbortSignal.timeout(10000)
    });
    return await res.json();
  } catch (err: any) {
    console.error("Rescan error:", err.message);
    return null;
  }
}

// CLI Router
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "status";

  switch (command) {
    case "play": {
      const query = args.slice(1).join(" ").trim();
      await ensureCadenceApp();

      if (!query) {
        await sendCadenceCommand("play");
        console.log("▶ Playing in Cadence Desktop.");
        return;
      }

      if (query.toLowerCase() === "random" || query.toLowerCase() === "shuffle") {
        await sendCadenceCommand("shuffle");
        console.log("🔀 Shuffled track in Cadence Desktop.");
        return;
      }

      // Check if track exists locally in Cadence
      try {
        const trRes = await fetch(`${CADENCE_SERVER_URL}/api/tracks`);
        const data: any = await trRes.json();
        const allTracks: any[] = data.tracks || [];
        const qLower = query.toLowerCase();
        const match = allTracks.find((t: any) =>
          t.title.toLowerCase().includes(qLower) ||
          t.artist.toLowerCase().includes(qLower) ||
          t.album.toLowerCase().includes(qLower) ||
          t.filePath.toLowerCase().includes(qLower)
        );

        if (!match) {
          console.log(`🔍 "${query}" not found in local library.`);
          console.log(`⬇ Initiating background Soulseek fetch via Nicotine+...`);
          const fetchChild = spawn("nicotine-fetch", [query, "--auto-play"], {
            stdio: "inherit",
            detached: false,
          });
          fetchChild.on("error", (err) => {
            console.error("Nicotine fetch error:", err.message);
          });
          return;
        }

        await sendCadenceCommand("play", { query, trackId: match.id });
        spawn("/home/darnell/Projects/cadence/cadence.sh", ["--play", query], { detached: true, stdio: "ignore" }).unref();
        console.log(`🎶 Sent to Cadence Desktop: ${match.artist} — ${match.title}`);
        console.log(`   Album: ${match.album}`);
        console.log(`   Format: ${match.format} | File: ${match.filePath}`);
      } catch (err: any) {
        // Fallback: send directly to playback command & Electron
        await sendCadenceCommand("play", { query });
        spawn("/home/darnell/Projects/cadence/cadence.sh", ["--play", query], { detached: true, stdio: "ignore" }).unref();
        console.log(`🎶 Requested "${query}" in Cadence Desktop.`);
      }
      break;
    }

    case "pause": {
      await sendCadenceCommand("pause");
      console.log("⏸ Paused Cadence playback.");
      break;
    }

    case "resume": {
      await sendCadenceCommand("resume");
      console.log("▶ Resumed Cadence playback.");
      break;
    }

    case "toggle": {
      await sendCadenceCommand("toggle");
      console.log("⏯ Toggled Cadence playback.");
      break;
    }

    case "next": {
      await sendCadenceCommand("next");
      console.log("⏭ Next track in Cadence.");
      break;
    }

    case "prev":
    case "previous": {
      await sendCadenceCommand("prev");
      console.log("⏮ Previous track in Cadence.");
      break;
    }

    case "stop": {
      await sendCadenceCommand("stop");
      cleanupOrphanAudio();
      console.log("⏹ Stopped Cadence playback.");
      break;
    }

    case "random":
    case "shuffle": {
      await sendCadenceCommand("shuffle");
      console.log("🔀 Shuffled in Cadence.");
      break;
    }

    case "rescan": {
      console.log("Scanning library in Cadence...");
      const result = await rescanLibrary();
      if (result) {
        console.log(`✓ Rescan complete: ${result.count || "updated"} tracks indexed.`);
      }
      break;
    }

    case "fetch":
    case "download": {
      const query = args.slice(1).join(" ").trim();
      if (!query) {
        console.log("Usage: cadence-ctl fetch <query>");
        process.exit(1);
      }
      console.log(`⬇ Fetching "${query}" from Soulseek network in background...`);
      const fetchProc = spawn("nicotine-fetch", [query], { stdio: "inherit" });
      fetchProc.on("close", (code) => {
        if (code === 0) {
          console.log(`✓ "${query}" fetched and indexed into Cadence library.`);
        }
      });
      break;
    }

    case "status": {
      const state = await getCadenceState();
      if (args.includes("--json")) {
        console.log(JSON.stringify(state, null, 2));
        return;
      }
      console.log(`Cadence Status: [${(state.status || "stopped").toUpperCase()}]`);
      if (state.currentTrack) {
        console.log(`Track:  ${state.currentTrack.title}`);
        console.log(`Artist: ${state.currentTrack.artist}`);
        console.log(`Album:  ${state.currentTrack.album}`);
        console.log(`Format: ${state.currentTrack.format}`);
        console.log(`File:   ${state.currentTrack.filePath}`);
      } else {
        console.log("No active track in Cadence.");
      }
      break;
    }

    case "lastfm": {
      const sub = args[1] || "status";
      if (sub === "status") {
        try {
          const res = await fetch(`${CADENCE_SERVER_URL}/api/lastfm/config`);
          const cfg = await res.json();
          console.log("Last.fm Scrobbler Status:");
          console.log(`  Connected: ${cfg.hasSession ? "YES" : "NO"}`);
          console.log(`  Account:   ${cfg.username ? "@" + cfg.username : "Not logged in"}`);
          console.log(`  Enabled:   ${cfg.enabled ? "ACTIVE (Scrobbling & Now Playing)" : "DISABLED"}`);
        } catch (err: any) {
          console.error("Could not fetch Last.fm status:", err.message);
        }
      } else if (sub === "login") {
        const username = args[2];
        const password = args[3];
        if (!username || !password) {
          console.log("Usage: cadence-ctl lastfm login <username> <password>");
          process.exit(1);
        }
        try {
          console.log(`Authenticating with Last.fm as @${username}...`);
          const res = await fetch(`${CADENCE_SERVER_URL}/api/lastfm/auth/mobile`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
          });
          const data = await res.json();
          if (res.ok && data.success) {
            console.log(`✓ Successfully connected to Last.fm as @${data.username}!`);
            console.log(`  Scrobbling is now enabled.`);
          } else {
            console.error(`✗ Authentication failed: ${data.error || "Unknown error"}`);
          }
        } catch (err: any) {
          console.error("Error logging into Last.fm:", err.message);
        }
      } else if (sub === "enable") {
        await fetch(`${CADENCE_SERVER_URL}/api/lastfm/config`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: true })
        });
        console.log("✓ Last.fm scrobbling enabled.");
      } else if (sub === "disable") {
        await fetch(`${CADENCE_SERVER_URL}/api/lastfm/config`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: false })
        });
        console.log("✓ Last.fm scrobbling disabled.");
      } else if (sub === "disconnect") {
        await fetch(`${CADENCE_SERVER_URL}/api/lastfm/disconnect`, { method: "POST" });
        console.log("✓ Disconnected Last.fm account.");
      } else {
        console.log("Usage: cadence-ctl lastfm [status|login <user> <pass>|enable|disable|disconnect]");
      }
      break;
    }

    default:
      console.log(`Unknown command: ${command}`);
      console.log(`Usage: cadence-ctl [play|pause|resume|toggle|next|prev|stop|random|status|rescan|fetch|lastfm] [args...]`);
  }
}

if (import.meta.main) {
  main();
}
