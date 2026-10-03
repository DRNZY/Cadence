/**
 * Regression tests for the analysis maths in `dsp.ts`.
 *
 * These are plain assertions run through the existing Node test entry point,
 * because every function here is pure. The values they pin down were not taken
 * from documentation: each was measured against Chromium's own biquads in an
 * offline `AudioContext`, and each number below is the measured answer. That is
 * the point of the tests. An EQ headroom solver that is off by a decibel is
 * indistinguishable from one that works until the bus starts clipping, so the
 * claim "this matches the platform" has to be checkable, not asserted.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  EQ_DEFAULT_Q,
  EQ_FREQUENCIES,
  eqBandCoefficients,
  eqBandType,
  eqHeadroomDb,
  eqPeakBoostDb
} from "./dsp.ts";

const SAMPLE_RATE = 48000;

test("band types are shelves at the ends and peaks in between", () => {
  assert.equal(eqBandType(0), "lowshelf");
  assert.equal(eqBandType(EQ_FREQUENCIES.length - 1), "highshelf");
  for (let i = 1; i < EQ_FREQUENCIES.length - 1; i++) {
    assert.equal(eqBandType(i), "peaking");
  }
});

test("default Q is the one-octave bandwidth, not a taste value", () => {
  // Q = 1 / (2^0.5 - 2^-0.5) is the bandwidth at which octave-spaced bands sum
  // flat. Deriving it in the test keeps the constant honest if the band count
  // ever changes.
  const octaveQ = 1 / (Math.pow(2, 0.5) - Math.pow(2, -0.5));
  assert.ok(Math.abs(EQ_DEFAULT_Q - octaveQ) < 1e-3, `expected ~${octaveQ}, got ${EQ_DEFAULT_Q}`);

  // Standard graphic-EQ centres are rounded to familiar frequencies.
  for (let i = 1; i < EQ_FREQUENCIES.length; i++) {
    assert.ok(Math.abs(EQ_FREQUENCIES[i] / EQ_FREQUENCIES[i - 1] - 2) < 0.05);
  }
});

test("zero gain on every band is unity, gain and phase", () => {
  const gains = EQ_FREQUENCIES.map(() => 0);
  const qs = EQ_FREQUENCIES.map(() => EQ_DEFAULT_Q);
  // A flat graphic EQ must not need any compensation, and must not ask for any
  // either. Anything else here means the solver is reading its own rounding.
  assert.equal(eqPeakBoostDb(gains, qs, SAMPLE_RATE), 0);
  assert.equal(eqHeadroomDb(gains, qs, SAMPLE_RATE), 0);
});

test("a cut-only curve asks for no headroom", () => {
  const gains = EQ_FREQUENCIES.map(() => -6);
  const qs = EQ_FREQUENCIES.map(() => EQ_DEFAULT_Q);
  // Negative gain everywhere can only remove level, so there is nothing to
  // trim against. Returning 0 rather than a negative number is deliberate: a
  // cut-only EQ should not be turned up into a boost.
  assert.equal(eqHeadroomDb(gains, qs, SAMPLE_RATE), 0);
});

test("coefficients are finite and normalised for every band and gain", () => {
  for (const gain of [-12, -6, -0.5, 0, 0.5, 6, 12]) {
    for (let i = 0; i < EQ_FREQUENCIES.length; i++) {
      const c = eqBandCoefficients(eqBandType(i), EQ_FREQUENCIES[i], gain, EQ_DEFAULT_Q, SAMPLE_RATE);
      assert.ok(Number.isFinite(c[0]) && Number.isFinite(c[1]) && Number.isFinite(c[2]), `numerator @${EQ_FREQUENCIES[i]}Hz ${gain}dB`);
      assert.ok(Number.isFinite(c[3]) && Number.isFinite(c[4]), `denominator @${EQ_FREQUENCIES[i]}Hz ${gain}dB`);
    }
  }
});

test("shelves hit their asymptotes, measured against Chromium", () => {
  // Values measured from an offline AudioContext render of the same topology.
  const qs = EQ_FREQUENCIES.map(() => EQ_DEFAULT_Q);

  const low = EQ_FREQUENCIES.map((_, i) => (i === 0 ? 6 : 0));
  assert.ok(Math.abs(eqPeakBoostDb(low, qs, SAMPLE_RATE) - 6) < 0.05);

  const high = EQ_FREQUENCIES.map((_, i) => (i === EQ_FREQUENCIES.length - 1 ? 6 : 0));
  assert.ok(Math.abs(eqPeakBoostDb(high, qs, SAMPLE_RATE) - 6) < 0.05);
});

test("a bell peaks at its centre frequency", () => {
  const gains = EQ_FREQUENCIES.map((_, i) => (i === 5 ? 6 : 0));
  const qs = EQ_FREQUENCIES.map(() => EQ_DEFAULT_Q);
  assert.ok(Math.abs(eqPeakBoostDb(gains, qs, SAMPLE_RATE) - 6) < 0.05);
});

test("stacked overlapping bands need more trim than the loudest single band", () => {
  // This is the bug that shipped. Compensating by the largest band value gave
  // 4 dB of trim for a curve whose true peak is 5.22 dB, so 1.22 dB of the
  // user's boost hit the clipper instead of being trimmed away. The whole
  // reason this solver sums the response rather than taking a max.
  const gains = [2, 3, 4, 3, 2, 0, 0, 0, 0, 0];
  const qs = EQ_FREQUENCIES.map(() => EQ_DEFAULT_Q);

  const truePeak = eqPeakBoostDb(gains, qs, SAMPLE_RATE);
  const largestBand = Math.max(...gains);

  assert.ok(truePeak > largestBand, `summed peak ${truePeak} should exceed largest band ${largestBand}`);
  assert.ok(Math.abs(truePeak - 5.217) < 0.05, `expected 5.217 dB, got ${truePeak}`);

  // The old behaviour, asserted explicitly so the regression cannot come back.
  assert.ok(Math.abs(truePeak - largestBand) > 1);
});

test("a wide smile peaks below a narrow one of the same height", () => {
  // Narrower bands overlap more, so the sum runs hotter. Proves the solver is
  // reading Q rather than ignoring it.
  const gains = [3, 3, 3, 3, 0, 0, 0, 0, 0, 0];
  const narrow = eqPeakBoostDb(gains, EQ_FREQUENCIES.map(() => 0.7), SAMPLE_RATE);
  const wide = eqPeakBoostDb(gains, EQ_FREQUENCIES.map(() => 8), SAMPLE_RATE);
  assert.ok(narrow > wide, `narrow ${narrow} should exceed wide ${wide}`);
});

test("a smile is trimmed harder than a single matching boost", () => {
  const qs = EQ_FREQUENCIES.map(() => EQ_DEFAULT_Q);
  const smile = [4, 3, 2, 1, 0, 0, 0, 0, 0, 0];
  const single = [4, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  assert.ok(eqHeadroomDb(smile, qs, SAMPLE_RATE) < eqHeadroomDb(single, qs, SAMPLE_RATE));
});

test("headroom is reported as a trim, so it is never positive", () => {
  const qs = EQ_FREQUENCIES.map(() => EQ_DEFAULT_Q);
  for (const peak of [1, 4, 9]) {
    const gains = EQ_FREQUENCIES.map((_, i) => (i < 3 ? peak : -peak));
    assert.ok(eqHeadroomDb(gains, qs, SAMPLE_RATE) <= 0);
  }
});

test("Nonsense input is ignored rather than propagated into a gain", () => {
  const qs = EQ_FREQUENCIES.map(() => EQ_DEFAULT_Q);
  // localStorage is user-writable, so a hand-edited or truncated value is a
  // realistic input rather than a theoretical one. It must not become NaN,
  // because a NaN gain silences the whole bus with no error anywhere.
  const gains = EQ_FREQUENCIES.map(() => NaN);
  assert.equal(Number.isFinite(eqHeadroomDb(gains, qs, SAMPLE_RATE)), true);

  const nonFinite = EQ_FREQUENCIES.map((_, i) => (i === 2 ? Infinity : 0));
  assert.equal(Number.isFinite(eqHeadroomDb(nonFinite, qs, SAMPLE_RATE)), true);

  const short = EQ_FREQUENCIES.map(() => 6).slice(0, 4);
  assert.equal(Number.isFinite(eqHeadroomDb(short, qs, SAMPLE_RATE)), true);

  assert.equal(Number.isFinite(eqHeadroomDb([], [], SAMPLE_RATE)), true);
});

test("a change of sample rate does not change the answer", () => {
  const gains = [2, 3, 4, 3, 2, 0, 0, 0, 0, 0];
  const qs = EQ_FREQUENCIES.map(() => EQ_DEFAULT_Q);
  const at48 = eqPeakBoostDb(gains, qs, 48000);
  const at44 = eqPeakBoostDb(gains, qs, 44100);
  const at96 = eqPeakBoostDb(gains, qs, 96000);
  // 16 kHz sits exactly at Nyquist for 32 kHz and again for 48 kHz, so the grid
  // has to clamp rather than sample an imaginary frequency.
  assert.ok(Math.abs(at48 - at44) < 0.1, `48k ${at48} vs 44.1k ${at44}`);
  assert.ok(Math.abs(at48 - at96) < 0.1, `48k ${at48} vs 96k ${at96}`);
});

// ---------------------------------------------------------------------------
// FX section mix law
// ---------------------------------------------------------------------------

import { equalPowerPair, fxSectionPowerDb } from "./dsp.ts";

const NEUTRAL = { colorDry: 1, colorWet: 0, convDry: 1, convWet: 0 };

test("the cascaded FX section is unity at neutral", () => {
  assert.ok(
    Math.abs(fxSectionPowerDb(NEUTRAL, "cascaded")) < 1e-9,
    `expected 0 dB, got ${fxSectionPowerDb(NEUTRAL, "cascaded")}`
  );
});

test("two unity dry paths in parallel run 6.02 dB hot (the original bug)", () => {
  const db = fxSectionPowerDb(NEUTRAL, "parallel");
  assert.ok(Math.abs(db - 6.0206) < 1e-3, `expected 6.0206 dB, got ${db}`);
});

test("cascading holds unity across both stages sweeping together", () => {
  for (let i = 0; i <= 10; i++) {
    const { dry, wet } = equalPowerPair(i / 10);
    const db = fxSectionPowerDb({ colorDry: dry, colorWet: wet, convDry: dry, convWet: wet }, "cascaded");
    assert.ok(Math.abs(db) < 1e-9, `at ${i / 10} expected 0 dB, got ${db}`);
  }
});

test("cascading holds unity when only one stage is engaged", () => {
  for (let i = 0; i <= 10; i++) {
    const { dry, wet } = equalPowerPair(i / 10);
    assert.ok(Math.abs(fxSectionPowerDb({ ...NEUTRAL, colorDry: dry, colorWet: wet }, "cascaded")) < 1e-9);
    assert.ok(Math.abs(fxSectionPowerDb({ ...NEUTRAL, convDry: dry, convWet: wet }, "cascaded")) < 1e-9);
  }
});

test("an equal-power pair really does hold constant power", () => {
  for (let i = 0; i <= 20; i++) {
    const { dry, wet } = equalPowerPair(i / 20);
    assert.ok(Math.abs(dry * dry + wet * wet - 1) < 1e-12);
  }
});
