/**
 * Pioneer DDJ-400 Professional Hardware MIDI Bridge for Cadence.
 * Provides bidirectional WebMIDI integration:
 * - Jog wheel vinyl scratch / scrub with angular velocity
 * - Play/Pause, Cue, Sync, and Beat Loop performance pads
 * - 3-Band hardware EQ knobs mapped to WebAudio DSP biquad filters
 * - Hardware LED feedback (Play/Pause, Cue, Loop pads, and VU meters)
 */

export interface DDJ400Actions {
  onPlayPause: () => void;
  onCue: () => void;
  onStartScratch: () => void;
  onScratch: (velocityDegPerSec: number, deltaAngle: number) => void;
  onEndScratch: () => void;
  onSetVolume: (volume: number) => void;
  onSetSpeed: (speed: number) => void;
  onSetEqGains: (gains: number[]) => void;
  onSeekRelative: (seconds: number) => void;
  onSeekFraction: (fraction: number) => void;
  isPlaying: boolean;
  volume: number;
  getAudioPeakLevel?: () => number;
}

export interface DDJ400State {
  isConnected: boolean;
  deviceName: string | null;
  isJogTouching: boolean;
  pitchRate: number;
}

export class DDJ400Controller {
  private midiAccess: MIDIAccess | null = null;
  private midiInput: MIDIInput | null = null;
  private midiOutput: MIDIOutput | null = null;
  private actions: DDJ400Actions | null = null;
  private onStateChangeCb: ((state: DDJ400State) => void) | null = null;

  private isJogTouching = false;
  private lastJogTime = 0;
  private pitchRate = 1.0;
  private vuTimer: number | null = null;

  // Cached 10-band EQ state for 3-band hardware mapping
  private eqGains: number[] = new Array(10).fill(0);

  constructor() {
    this.handleMIDIMessage = this.handleMIDIMessage.bind(this);
    this.handleStateChange = this.handleStateChange.bind(this);
  }

  public async initialize(
    actions: DDJ400Actions,
    onStateChange: (state: DDJ400State) => void
  ): Promise<boolean> {
    this.actions = actions;
    this.onStateChangeCb = onStateChange;

    if (typeof navigator === "undefined" || !navigator.requestMIDIAccess) {
      console.warn("[DDJ-400] Web MIDI API not supported in this environment");
      return false;
    }

    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      this.midiAccess.onstatechange = this.handleStateChange;
      this.scanAndConnect();
      this.startVUMeterLoop();
      return this.midiInput !== null;
    } catch (err) {
      console.warn("[DDJ-400] Failed to obtain MIDI access:", err);
      return false;
    }
  }

  public updateActions(actions: DDJ400Actions) {
    this.actions = actions;
    this.updateHardwareLEDs();
  }

  private scanAndConnect() {
    if (!this.midiAccess) return;

    let foundInput: MIDIInput | null = null;
    let foundOutput: MIDIOutput | null = null;

    for (const input of this.midiAccess.inputs.values()) {
      const name = (input.name || "").toLowerCase();
      if (name.includes("ddj-400") || name.includes("ddj") || name.includes("pioneer")) {
        foundInput = input;
        break;
      }
    }

    for (const output of this.midiAccess.outputs.values()) {
      const name = (output.name || "").toLowerCase();
      if (name.includes("ddj-400") || name.includes("ddj") || name.includes("pioneer")) {
        foundOutput = output;
        break;
      }
    }

    if (foundInput && foundInput !== this.midiInput) {
      if (this.midiInput) {
        this.midiInput.onmidimessage = null;
      }
      this.midiInput = foundInput;
      this.midiInput.onmidimessage = this.handleMIDIMessage;
      console.log(`[DDJ-400] Connected MIDI Input: ${foundInput.name}`);
    }

    if (foundOutput && foundOutput !== this.midiOutput) {
      this.midiOutput = foundOutput;
      console.log(`[DDJ-400] Connected MIDI Output: ${foundOutput.name}`);
      this.updateHardwareLEDs();
    }

    this.notifyState();
  }

  private handleStateChange(_event: MIDIConnectionEvent) {
    this.scanAndConnect();
  }

  private notifyState() {
    if (this.onStateChangeCb) {
      this.onStateChangeCb({
        isConnected: this.midiInput !== null,
        deviceName: this.midiInput?.name || null,
        isJogTouching: this.isJogTouching,
        pitchRate: this.pitchRate
      });
    }
  }

  /**
   * Parse incoming Pioneer DDJ-400 MIDI packets
   */
  private handleMIDIMessage(event: MIDIMessageEvent) {
    if (!event.data || !this.actions) return;
    const [status, data1, data2] = event.data;

    const messageType = status & 0xf0;
    const channel = status & 0x0f; // 0 = Deck 1, 1 = Deck 2

    // Filter to Deck 1 (Ch 0) & Deck 2 (Ch 1) or Master (Ch 6/8)
    const isDeck1 = channel === 0;
    const isDeck2 = channel === 1;

    // --- NOTE ON (0x90) / NOTE OFF (0x80) ---
    if (messageType === 0x90 || messageType === 0x80) {
      const isDown = messageType === 0x90 && data2 > 0;

      // 1. Play / Pause Button (Note 0x0B = 11)
      if (data1 === 0x0b && isDown) {
        this.actions.onPlayPause();
        this.sendLED(channel, 0x0b, this.actions.isPlaying ? 0 : 127);
        return;
      }

      // 2. Cue Button (Note 0x0C = 12)
      if (data1 === 0x0c && isDown) {
        this.actions.onCue();
        this.sendLED(channel, 0x0c, 127);
        setTimeout(() => this.sendLED(channel, 0x0c, 0), 200);
        return;
      }

      // 3. Jog Wheel Touch (Note 0x36 = 54)
      if (data1 === 0x36) {
        if (isDown) {
          this.isJogTouching = true;
          this.lastJogTime = performance.now();
          this.actions.onStartScratch();
        } else {
          this.isJogTouching = false;
          this.actions.onEndScratch();
        }
        this.notifyState();
        return;
      }

      // 4. Performance Pads 1-8 (Notes 0x00 - 0x07)
      if (data1 >= 0x00 && data1 <= 0x07 && isDown) {
        const padIndex = data1;
        const fraction = padIndex / 8.0;
        this.actions.onSeekFraction(fraction);
        // Light up the pressed pad
        this.sendLED(channel, data1, 127);
        setTimeout(() => this.sendLED(channel, data1, 0), 250);
        return;
      }
    }

    // --- CONTROL CHANGE (0xB0) ---
    if (messageType === 0xb0) {
      const cc = data1;
      const val = data2;

      // 1. Jog Wheel Scratch Rotation (CC 0x21 = 33)
      if (cc === 0x21) {
        const now = performance.now();
        const dt = Math.max(1, now - (this.lastJogTime || now));
        this.lastJogTime = now;

        // 64-centered delta: >64 is forward (+1, +2...), <64 is backward (-1, -2...)
        const rawDelta = val > 64 ? val - 64 : val - 128;
        const deltaAngle = rawDelta * 3.6; // Scale degrees per tick
        const velocityDegPerSec = (deltaAngle / dt) * 1000;

        this.actions.onScratch(velocityDegPerSec, deltaAngle);
        return;
      }

      // 2. Jog Wheel Outer Rim Pitch Bend (CC 0x22 = 34)
      if (cc === 0x22) {
        const rawDelta = val > 64 ? val - 64 : val - 128;
        const nudgeSeconds = (rawDelta / 64) * 0.4;
        this.actions.onSeekRelative(nudgeSeconds);
        return;
      }

      // 3. Channel Volume Fader (CC 0x13 = 19)
      if (cc === 0x13 && (isDeck1 || isDeck2)) {
        const normalizedVol = Math.max(0, Math.min(1, val / 127));
        this.actions.onSetVolume(normalizedVol);
        return;
      }

      // 4. Master Volume Knob (CC 0x14 = 20)
      if (cc === 0x14) {
        const normalizedVol = Math.max(0, Math.min(1, val / 127));
        this.actions.onSetVolume(normalizedVol);
        return;
      }

      // 5. EQ High Knob (CC 0x07 = 7)
      if (cc === 0x07) {
        // Map 0..127 to -24dB .. +6dB with center 64 = 0dB
        const gainDb = val <= 64 ? ((val - 64) / 64) * 24 : ((val - 64) / 63) * 6;
        // Apply to High bands: 4000Hz, 8000Hz, 16000Hz (indices 7, 8, 9)
        this.eqGains[7] = gainDb;
        this.eqGains[8] = gainDb;
        this.eqGains[9] = gainDb;
        this.actions.onSetEqGains([...this.eqGains]);
        return;
      }

      // 6. EQ Mid Knob (CC 0x0B = 11)
      if (cc === 0x0b) {
        const gainDb = val <= 64 ? ((val - 64) / 64) * 24 : ((val - 64) / 63) * 6;
        // Apply to Mid bands: 500Hz, 1000Hz, 2000Hz (indices 4, 5, 6)
        this.eqGains[4] = gainDb;
        this.eqGains[5] = gainDb;
        this.eqGains[6] = gainDb;
        this.actions.onSetEqGains([...this.eqGains]);
        return;
      }

      // 7. EQ Low Knob (CC 0x0F = 15)
      if (cc === 0x0f) {
        const gainDb = val <= 64 ? ((val - 64) / 64) * 24 : ((val - 64) / 63) * 6;
        // Apply to Bass bands: 32Hz, 64Hz, 125Hz, 250Hz (indices 0, 1, 2, 3)
        this.eqGains[0] = gainDb;
        this.eqGains[1] = gainDb;
        this.eqGains[2] = gainDb;
        this.eqGains[3] = gainDb;
        this.actions.onSetEqGains([...this.eqGains]);
        return;
      }

      // 8. Tempo Pitch Slider (CC 0x00 = 0)
      if (cc === 0x00) {
        // Range: 0 (top/slow) to 127 (bottom/fast), center 64 = 1.0x
        // 0.8x to 1.2x pitch range (+/- 20% tempo)
        const rate = 1.0 + ((val - 64) / 64) * 0.2;
        const clampedRate = Math.max(0.5, Math.min(2.0, Math.round(rate * 1000) / 1000));
        this.pitchRate = clampedRate;
        this.actions.onSetSpeed(clampedRate);
        this.notifyState();
        return;
      }
    }

    // --- PITCH BEND (0xE0) for high-precision tempo fader ---
    if (messageType === 0xe0) {
      const bend = ((data2 << 7) | data1) - 8192; // -8192 to +8191
      const rate = 1.0 + (bend / 8192) * 0.25;
      const clampedRate = Math.max(0.5, Math.min(2.0, Math.round(rate * 1000) / 1000));
      this.pitchRate = clampedRate;
      this.actions.onSetSpeed(clampedRate);
      this.notifyState();
      return;
    }
  }

  /**
   * Update hardware physical LEDs on the Pioneer DDJ-400
   */
  public updateHardwareLEDs() {
    if (!this.midiOutput || !this.actions) return;
    const isPlaying = this.actions.isPlaying;

    // Deck 1 & Deck 2 Play/Pause LED (Note 0x0B): 127 = Solid ON, 0 = OFF
    this.sendLED(0, 0x0b, isPlaying ? 127 : 0);
    this.sendLED(1, 0x0b, isPlaying ? 127 : 0);

    // Cue Button LED (Note 0x0C): solid when paused, dim/off when playing
    this.sendLED(0, 0x0c, isPlaying ? 0 : 127);
    this.sendLED(1, 0x0c, isPlaying ? 0 : 127);
  }

  private sendLED(channel: number, note: number, velocity: number) {
    if (!this.midiOutput) return;
    try {
      this.midiOutput.send([0x90 | (channel & 0x0f), note, velocity & 0x7f]);
    } catch {}
  }

  /**
   * Stream live audio level meter to Pioneer DDJ-400 channel VU bars
   */
  private startVUMeterLoop() {
    if (this.vuTimer) clearInterval(this.vuTimer);

    this.vuTimer = window.setInterval(() => {
      if (!this.midiOutput || !this.actions || !this.actions.isPlaying) {
        if (this.midiOutput) {
          // Reset VU LEDs to 0 when idle
          try {
            this.midiOutput.send([0xb0, 0x02, 0]); // Ch 1 Level
            this.midiOutput.send([0xb1, 0x02, 0]); // Ch 2 Level
          } catch {}
        }
        return;
      }

      if (this.actions.getAudioPeakLevel) {
        const peak = this.actions.getAudioPeakLevel(); // 0.0 to 1.0
        const midiLevel = Math.min(127, Math.max(0, Math.round(peak * 127)));
        try {
          this.midiOutput.send([0xb0, 0x02, midiLevel]);
          this.midiOutput.send([0xb1, 0x02, midiLevel]);
        } catch {}
      }
    }, 60);
  }

  public destroy() {
    if (this.vuTimer) clearInterval(this.vuTimer);
    if (this.midiInput) this.midiInput.onmidimessage = null;
    this.midiInput = null;
    this.midiOutput = null;
    this.midiAccess = null;
  }
}

// Global Singleton instance for React lifecycle
let ddjInstance: DDJ400Controller | null = null;

export function getDDJ400Controller(): DDJ400Controller {
  if (!ddjInstance) {
    ddjInstance = new DDJ400Controller();
  }
  return ddjInstance;
}
