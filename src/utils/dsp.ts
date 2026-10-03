/**
 * Audio DSP math, kept apart from the React hook so it can be reasoned about
 * and tested without an AudioContext.
 *
 * Everything here is implemented from the published RBJ Audio EQ Cookbook
 * formulas, which are the reference the Web Audio specification itself uses
 * for `BiquadFilterNode`. The coefficients are computed analytically rather
 * than read back from a live node, because the headroom solve has to run on
 * every equalizer slider frame and instantiating an AudioContext per frame
 * would be absurd.
 */

export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

/**
 * Q for a 1/1-octave-spaced graphic EQ. 1.41 is not a taste value, it is the
 * bandwidth that makes each band cover exactly one octave: Q = 1/(2^0.5 - 2^-0.5).
 * Band centres are octave apart, so this is the value at which adjacent bands
 * sum flat in the passband instead of rippling.
 */
export const EQ_DEFAULT_Q = 1.414;

export type EqBandType = "lowshelf" | "peaking" | "highshelf";

export function eqBandType(index: number): EqBandType {
  if (index === 0) return "lowshelf";
  if (index === EQ_FREQUENCIES.length - 1) return "highshelf";
  return "peaking";
}

/**
 * Shelf slope. The cookbook exposes this as a free parameter; Web Audio's
 * `BiquadFilterNode` does not, and Chromium's shelves correspond to S = 1,
 * which is what is used here so the analytic response matches the node the
 * browser actually builds. Verified against an offline render in dsp.test.ts.
 */
const SHELF_SLOPE = 1;

/** Normalised biquad coefficients: [b0, b1, b2, a1, a2], with a0 divided out. */
export function eqBandCoefficients(
  type: EqBandType,
  freqHz: number,
  gainDb: number,
  q: number,
  sampleRate: number
): Float64Array {
  // Clamp to the open interval just below Nyquist. A centre at or past Nyquist
  // makes sin(w0) meaningless and Chromium clamps the node internally, so the
  // analytic response has to clamp identically or the two disagree.
  const nyquist = sampleRate * 0.5;
  const f0 = Math.min(Math.max(freqHz, 1e-3), nyquist * 0.999);
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * f0) / sampleRate;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);

  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;

  if (type === "peaking") {
    const alpha = sinW0 / (2 * Math.max(q, 1e-4));
    b0 = 1 + alpha * A;
    b1 = -2 * cosW0;
    b2 = 1 - alpha * A;
    a0 = 1 + alpha / A;
    a1 = -2 * cosW0;
    a2 = 1 - alpha / A;
  } else {
    const sq = Math.sqrt(
      (A + 1 / A) * (1 / SHELF_SLOPE - 1) + 2
    );
    const alpha = (sinW0 / 2) * sq;
    const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;
    if (type === "lowshelf") {
      b0 = A * (A + 1 - (A - 1) * cosW0 + twoSqrtAAlpha);
      b1 = 2 * A * ((A - 1) - (A + 1) * cosW0);
      b2 = A * (A + 1 - (A - 1) * cosW0 - twoSqrtAAlpha);
      a0 = A + 1 + (A - 1) * cosW0 + twoSqrtAAlpha;
      a1 = -2 * ((A - 1) + (A + 1) * cosW0);
      a2 = A + 1 + (A - 1) * cosW0 - twoSqrtAAlpha;
    } else {
      b0 = A * (A + 1 + (A - 1) * cosW0 + twoSqrtAAlpha);
      b1 = -2 * A * ((A - 1) + (A + 1) * cosW0);
      b2 = A * (A + 1 + (A - 1) * cosW0 - twoSqrtAAlpha);
      a0 = A + 1 - (A - 1) * cosW0 + twoSqrtAAlpha;
      a1 = 2 * ((A - 1) - (A + 1) * cosW0);
      a2 = A + 1 - (A - 1) * cosW0 - twoSqrtAAlpha;
    }
  }

  if (!isFinite(a0) || Math.abs(a0) < 1e-12) a0 = 1;
  return new Float64Array([
    b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0
  ]);
}

/**
 * Magnitude of one biquad at frequency f, linear.
 *
 * H(z) = (b0 + b1 z^-1 + b2 z^-2) / (1 + a1 z^-1 + a2 z^-2) with z = e^(jw).
 * Expanding on the unit circle, both polynomials are real-coefficient, so the
 * magnitude is the ratio of two 2-term cos/sin sums and no complex arithmetic
 * is needed.
 */
function bandMagnitude(c: Float64Array, cos1: number, sin1: number, cos2: number, sin2: number): number {
  const numRe = c[0] + c[1] * cos1 + c[2] * cos2;
  const numIm = -(c[1] * sin1 + c[2] * sin2);
  const denRe = 1 + c[3] * cos1 + c[4] * cos2;
  const denIm = -(c[3] * sin1 + c[4] * sin2);
  const den = Math.hypot(denRe, denIm);
  return den > 1e-30 ? Math.hypot(numRe, numIm) / den : 0;
}

/**
 * Precomputed sweep grid. The cos/sin terms depend only on the sample rate, so
 * they are cached and reused; only the per-band polynomial evaluation runs on a
 * slider drag. Without this the solve would do four transcendental calls per
 * band per grid point, several hundred times a frame.
 */
interface Grid {
  sampleRate: number;
  cos1: Float64Array;
  sin1: Float64Array;
  cos2: Float64Array;
  sin2: Float64Array;
}

const GRID_CACHE = new Map<number, Grid>();

/**
 * Grid resolution. The bands are broad by default (Q ~1.4), so a log sweep of
 * this density resolves the response peak far below the 0.1 dB that matters,
 * while still catching the narrow peaks a deliberately high-Q notch produces.
 */
const GRID_POINTS = 2048;

/**
 * Lowest frequency in the search. Deliberately below the audible band: the
 * lowest shelf has real gain down near DC, and a peak that lands at 7 Hz still
 * has to be compensated for, because the signal there is not discarded before
 * the output stage.
 */
const GRID_MIN_HZ = 3;

function getGrid(sampleRate: number): Grid {
  const cached = GRID_CACHE.get(sampleRate);
  if (cached) return cached;
  const n = GRID_POINTS;
  const cos1 = new Float64Array(n);
  const sin1 = new Float64Array(n);
  const cos2 = new Float64Array(n);
  const sin2 = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    // Log spacing gives resolution where filters have detail.
    const f = GRID_MIN_HZ * Math.pow(sampleRate * 0.5 / GRID_MIN_HZ, i / (n - 1));
    const w = (2 * Math.PI * f) / sampleRate;
    cos1[i] = Math.cos(w);
    sin1[i] = Math.sin(w);
    cos2[i] = Math.cos(2 * w);
    sin2[i] = Math.sin(2 * w);
  }
  const grid: Grid = { sampleRate, cos1, sin1, cos2, sin2 };
  GRID_CACHE.set(sampleRate, grid);
  return grid;
}

/**
 * Largest boost, in dB, anywhere in the summed response of the whole chain.
 *
 * This is the quantity that actually decides how much preamp is needed, and it
 * is not the largest single band gain. Adjacent bands overlap: their responses
 * sum where they meet, so a smooth smile curve peaking at +4 dB per band
 * measures about +5.2 dB at the centre of the smile. Taking the max of the
 * gains under-compensates by that difference and lets the output clip.
 */
export function eqPeakBoostDb(
  gains: ArrayLike<number>,
  qs: ArrayLike<number>,
  sampleRate: number
): number {
  const bands = EQ_FREQUENCIES.length;
  if (!(sampleRate > 0)) return 0;

  const coeff: Float64Array[] = new Array(bands);
  for (let i = 0; i < bands; i++) {
    const g = typeof gains[i] === "number" && isFinite(gains[i]) ? gains[i] : 0;
    if (g === 0) {
      // A zero-gain biquad is exactly unity (its numerator and denominator
      // polynomials are identical), so it cannot contribute. Skipping it keeps
      // the flat case free and avoids pointless coefficient work.
      continue;
    }
    const q = typeof qs[i] === "number" && qs[i] > 0 ? qs[i] : EQ_DEFAULT_Q;
    coeff[i] = eqBandCoefficients(eqBandType(i), EQ_FREQUENCIES[i], g, q, sampleRate);
  }

  const grid = getGrid(sampleRate);
  let peakLin = 1;
  for (let p = 0; p < GRID_POINTS; p++) {
    let mag = 1;
    for (let i = 0; i < bands; i++) {
      const c = coeff[i];
      if (!c) continue;
      mag *= bandMagnitude(c, grid.cos1[p], grid.sin1[p], grid.cos2[p], grid.sin2[p]);
    }
    if (mag > peakLin) peakLin = mag;
  }
  return 20 * Math.log10(peakLin);
}

/**
 * How far to pull the preamp down so the equalizer cannot push the bus into
 * the clipper.
 *
 * Never returns a positive value: a chain that only cuts is left alone rather
 * than being normalised back up, because silently raising an all-cut curve is
 * how a player ends up louder than the artist intended.
 */
export function eqHeadroomDb(
  gains: ArrayLike<number>,
  qs: ArrayLike<number>,
  sampleRate: number
): number {
  const peak = eqPeakBoostDb(gains, qs, sampleRate);
  return peak > 0 ? -peak : 0;
}

/**
 * Width of the limiter's soft knee, in dB below the ceiling.
 *
 * The knee exists so the transfer curve meets the identity with matching slope
 * instead of a corner. Two dB is wide enough that the slope can fall gently
 * and narrow enough that ordinary programme material below the ceiling is left
 * strictly alone.
 */
const KNEE_DB = 2;

/**
 * Soft-ceiling transfer curve.
 *
 * Below the knee the curve is exactly the identity. Above it the curve rolls
 * into a saturating exponential that is *C1-continuous at the junction*: both
 * the value and the slope match the identity there, and the whole curve
 * asymptotes to the ceiling, so output can never exceed it.
 *
 * The previous implementation used a tanh roll-in with the knee hard-placed at
 * the ceiling. Its slope dropped from 1.0 to about 0.075 across a single curve
 * sample, a 13-fold discontinuity at the exact point where programme peaks
 * land on modern, heavily limited masters. A slope discontinuity of that size
 * is a corner, and a corner generates harmonics: that is broadband distortion
 * being added to every transient, which is what reads as harsh and muddy. The
 * comment on that function claimed C1 continuity it did not have.
 *
 * @param ceilingDb asymptote of the transfer curve, in dBFS
 * @param kneeDb how far below the ceiling the knee begins
 */
export function buildCeilingCurve(ceilingDb: number, kneeDb: number = KNEE_DB): Float32Array<ArrayBuffer> {
  const n = 4096;
  const curve = new Float32Array(new ArrayBuffer(n * Float32Array.BYTES_PER_ELEMENT));
  const ceiling = Math.pow(10, ceilingDb / 20);
  // Knee starts kneeDb below the ceiling so the compression ramps in gently
  // rather than reacting to the first sample that crosses the threshold.
  const knee = Math.pow(10, (ceilingDb - Math.max(0, kneeDb)) / 20);
  const span = Math.max(ceiling - knee, 1e-9);

  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const ax = Math.abs(x);
    if (ax <= knee) {
      curve[i] = x;
    } else {
      // f(x) = c - (c-k)*exp(-(x-k)/(c-k)): f(k)=k, f'(k)=1, f(inf)=c.
      curve[i] = (x < 0 ? -1 : 1) * (ceiling - span * Math.exp(-(ax - knee) / span));
    }
  }
  return curve;
}
/**
 * How the parallel colour and convolution stages are wired.
 *
 * `cascaded` is the correct topology and the one the engine uses: the
 * convolution stage is fed from the colour stage's mix bus.
 * `parallel` is the tempting alternative where both stages hang off the EQ and
 * sum independently into the output ceiling. It is wrong, and the reason is
 * worth stating precisely because it is invisible in a signal-path diagram.
 */
export type FxTopology = "cascaded" | "parallel";

/** The four branch gains that form the FX section. */
export interface FxStageGains {
  colorDry: number;
  colorWet: number;
  convDry: number;
  convWet: number;
}

/**
 * Power at the mix bus for a given topology, in dB relative to unity.
 *
 * Two dry paths carry the *same* programme, so they are perfectly correlated
 * and add as amplitudes, not powers: `(a + b)^2`, not `a^2 + b^2`. The wet
 * paths are filtered or convolved, so they are effectively uncorrelated with
 * everything else and add as powers. That distinction is the whole bug.
 *
 * Under `parallel`, two unity-gain-neutral dry paths deliver the programme
 * twice and the section runs +6.02 dB hot into a ceiling that is then
 * permanently engaged. Under `cascaded` the dry paths are in series, so they
 * multiply, and the total is unity for any combination of stage positions.
 */
export function fxSectionPowerDb(g: FxStageGains, topology: FxTopology): number {
  const power =
    topology === "parallel"
      ? Math.pow(g.colorDry + g.convDry, 2) + g.colorWet * g.colorWet + g.convWet * g.convWet
      : Math.pow(g.convDry * g.colorDry, 2) +
        Math.pow(g.convDry * g.colorWet, 2) +
        g.convWet * g.convWet;
  return 10 * Math.log10(Math.max(power, 1e-30));
}

/**
 * Dry/wet gains for one stage at a sweep position, as an equal-power pair.
 *
 * `position` is 0 at neutral and 1 at either extreme, matching the rotary
 * control. The pair holds constant power because cos^2 + sin^2 == 1.
 */
export function equalPowerPair(position: number): { dry: number; wet: number } {
  const angle = Math.min(Math.max(position, 0), 1) * (Math.PI / 2);
  return { dry: Math.cos(angle), wet: Math.sin(angle) };
}
