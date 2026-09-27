/**
 * spa.ts — Solar Position Algorithm (NREL SPA), Reda & Andreas, "Solar Position Algorithm
 * for Solar Radiation Applications", NREL/TP-560-34302 (2003, revised 2008).
 * Stated accuracy: ±0.0003° for years −2000..6000.
 *
 * Defines: julianDay(), geocentricSun() (the costly part that depends on time only) and
 *          topocentricSun() (the cheap part that depends on the observer).
 * Used by: core/solveTime.ts, core/claimCheck.ts, core/score.ts, tests/spa.test.ts.
 * Depends on: core/models.ts (Atmosphere type), core/config.ts (sun semi-diameter).
 *
 * HOW: follows the paper step by step (§3.1–3.14): Julian dates → heliocentric Earth
 * position from truncated VSOP87 series → geocentric Sun → nutation and aberration →
 * apparent sidereal time → right ascension / declination → topocentric parallax
 * correction → elevation (with optional Bennett-style refraction) and azimuth.
 * WHY: the split into geocentric/topocentric parts lets the solver evaluate several
 * nearby observer positions (location-uncertainty Jacobian) for the price of one ephemeris.
 */

import { SUN_SEMI_DIAMETER_DEG } from "./config";
import type { Atmosphere } from "./models";

const DEG = Math.PI / 180;

type Term = readonly [number, number, number];

// ---- Earth periodic terms (Table A4.2 of the paper) -------------------------------------
const L0: Term[] = [
  [175347046, 0, 0], [3341656, 4.6692568, 6283.07585], [34894, 4.6261, 12566.1517],
  [3497, 2.7441, 5753.3849], [3418, 2.8289, 3.5231], [3136, 3.6277, 77713.7715],
  [2676, 4.4181, 7860.4194], [2343, 6.1352, 3930.2097], [1324, 0.7425, 11506.7698],
  [1273, 2.0371, 529.691], [1199, 1.1096, 1577.3435], [990, 5.233, 5884.927],
  [902, 2.045, 26.298], [857, 3.508, 398.149], [780, 1.179, 5223.694],
  [753, 2.533, 5507.553], [505, 4.583, 18849.228], [492, 4.205, 775.523],
  [357, 2.92, 0.067], [317, 5.849, 11790.629], [284, 1.899, 796.298],
  [271, 0.315, 10977.079], [243, 0.345, 5486.778], [206, 4.806, 2544.314],
  [205, 1.869, 5573.143], [202, 2.458, 6069.777], [156, 0.833, 213.299],
  [132, 3.411, 2942.463], [126, 1.083, 20.775], [115, 0.645, 0.98],
  [103, 0.636, 4694.003], [102, 0.976, 15720.839], [102, 4.267, 7.114],
  [99, 6.21, 2146.17], [98, 0.68, 155.42], [86, 5.98, 161000.69],
  [85, 1.3, 6275.96], [85, 3.67, 71430.7], [80, 1.81, 17260.15],
  [79, 3.04, 12036.46], [75, 1.76, 5088.63], [74, 3.5, 3154.69],
  [74, 4.68, 801.82], [70, 0.83, 9437.76], [62, 3.98, 8827.39],
  [61, 1.82, 7084.9], [57, 2.78, 6286.6], [56, 4.39, 14143.5],
  [56, 3.47, 6279.55], [52, 0.19, 12139.55], [52, 1.33, 1748.02],
  [51, 0.28, 5856.48], [49, 0.49, 1194.45], [41, 5.37, 8429.24],
  [41, 2.4, 19651.05], [39, 6.17, 10447.39], [37, 6.04, 10213.29],
  [37, 2.57, 1059.38], [36, 1.71, 2352.87], [36, 1.78, 6812.77],
  [33, 0.59, 17789.85], [30, 0.44, 83996.85], [30, 2.74, 1349.87],
  [25, 3.16, 4690.48],
];
const L1: Term[] = [
  [628331966747, 0, 0], [206059, 2.678235, 6283.07585], [4303, 2.6351, 12566.1517],
  [425, 1.59, 3.523], [119, 5.796, 26.298], [109, 2.966, 1577.344],
  [93, 2.59, 18849.23], [72, 1.14, 529.69], [68, 1.87, 398.15],
  [67, 4.41, 5507.55], [59, 2.89, 5223.69], [56, 2.17, 155.42],
  [45, 0.4, 796.3], [36, 0.47, 775.52], [29, 2.65, 7.11],
  [21, 5.34, 0.98], [19, 1.85, 5486.78], [19, 4.97, 213.3],
  [17, 2.99, 6275.96], [16, 0.03, 2544.31], [16, 1.43, 2146.17],
  [15, 1.21, 10977.08], [12, 2.83, 1748.02], [12, 3.26, 5088.63],
  [12, 5.27, 1194.45], [12, 2.08, 4694], [11, 0.77, 553.57],
  [10, 1.3, 6286.6], [10, 4.24, 1349.87], [9, 2.7, 242.73],
  [9, 5.64, 951.72], [8, 5.3, 2352.87], [6, 2.65, 9437.76],
  [6, 4.67, 4690.48],
];
const L2: Term[] = [
  [52919, 0, 0], [8720, 1.0721, 6283.0758], [309, 0.867, 12566.152],
  [27, 0.05, 3.52], [16, 5.19, 26.3], [16, 3.68, 155.42],
  [10, 0.76, 18849.23], [9, 2.06, 77713.77], [7, 0.83, 775.52],
  [5, 4.66, 1577.34], [4, 1.03, 7.11], [4, 3.44, 5573.14],
  [3, 5.14, 796.3], [3, 6.05, 5507.55], [3, 1.19, 242.73],
  [3, 6.12, 529.69], [3, 0.31, 398.15], [3, 2.28, 553.57],
  [2, 4.38, 5223.69], [2, 3.75, 0.98],
];
const L3: Term[] = [
  [289, 5.844, 6283.076], [35, 0, 0], [17, 5.49, 12566.15],
  [3, 5.2, 155.42], [1, 4.72, 3.52], [1, 5.3, 18849.23], [1, 5.97, 242.73],
];
const L4: Term[] = [[114, 3.142, 0], [8, 4.13, 6283.08], [1, 3.84, 12566.15]];
const L5: Term[] = [[1, 3.14, 0]];

const B0: Term[] = [
  [280, 3.199, 84334.662], [102, 5.422, 5507.553], [80, 3.88, 5223.69],
  [44, 3.7, 2352.87], [32, 4, 1577.34],
];
const B1: Term[] = [[9, 3.9, 5507.55], [6, 1.73, 5223.69]];

const R0: Term[] = [
  [100013989, 0, 0], [1670700, 3.0984635, 6283.07585], [13956, 3.05525, 12566.1517],
  [3084, 5.1985, 77713.7715], [1628, 1.1739, 5753.3849], [1576, 2.8469, 7860.4194],
  [925, 5.453, 11506.77], [542, 4.564, 3930.21], [472, 3.661, 5884.927],
  [346, 0.964, 5507.553], [329, 5.9, 5223.694], [307, 0.299, 5573.143],
  [243, 4.273, 11790.629], [212, 5.847, 1577.344], [186, 5.022, 10977.079],
  [175, 3.012, 18849.228], [110, 5.055, 5486.778], [98, 0.89, 6069.78],
  [86, 5.69, 15720.84], [86, 1.27, 161000.69], [65, 0.27, 17260.15],
  [63, 0.92, 529.69], [57, 2.01, 83996.85], [56, 5.24, 71430.7],
  [49, 3.25, 2544.31], [47, 2.58, 775.52], [45, 5.54, 9437.76],
  [43, 6.01, 6275.96], [39, 5.36, 4694], [38, 2.39, 8827.39],
  [37, 0.83, 19651.05], [37, 4.9, 12139.55], [36, 1.67, 12036.46],
  [35, 1.84, 2942.46], [33, 0.24, 7084.9], [32, 0.18, 5088.63],
  [32, 1.78, 398.15], [28, 1.21, 6286.6], [28, 1.9, 6279.55],
  [26, 4.59, 10447.39],
];
const R1: Term[] = [
  [103019, 1.10749, 6283.07585], [1721, 1.0644, 12566.1517], [702, 3.142, 0],
  [32, 1.02, 18849.23], [31, 2.84, 5507.55], [25, 1.32, 5223.69],
  [18, 1.42, 1577.34], [10, 5.91, 10977.08], [9, 1.42, 6275.96],
  [9, 0.27, 5486.78],
];
const R2: Term[] = [
  [4359, 5.7846, 6283.0758], [124, 5.579, 12566.152], [12, 3.14, 0],
  [9, 3.63, 77713.77], [6, 1.87, 5573.14], [3, 5.47, 18849.23],
];
const R3: Term[] = [[145, 4.273, 6283.076], [7, 3.92, 12566.15]];
const R4: Term[] = [[4, 2.56, 6283.08]];

const L_TERMS = [L0, L1, L2, L3, L4, L5];
const B_TERMS = [B0, B1];
const R_TERMS = [R0, R1, R2, R3, R4];

// ---- Nutation terms (Table A4.3): multipliers of X0..X4, then a, b, c, d ------------
const NUT_Y: readonly (readonly [number, number, number, number, number])[] = [
  [0, 0, 0, 0, 1], [-2, 0, 0, 2, 2], [0, 0, 0, 2, 2], [0, 0, 0, 0, 2], [0, 1, 0, 0, 0],
  [0, 0, 1, 0, 0], [-2, 1, 0, 2, 2], [0, 0, 0, 2, 1], [0, 0, 1, 2, 2], [-2, -1, 0, 2, 2],
  [-2, 0, 1, 0, 0], [-2, 0, 0, 2, 1], [0, 0, -1, 2, 2], [2, 0, 0, 0, 0], [0, 0, 1, 0, 1],
  [2, 0, -1, 2, 2], [0, 0, -1, 0, 1], [0, 0, 1, 2, 1], [-2, 0, 2, 0, 0], [0, 0, -2, 2, 1],
  [2, 0, 0, 2, 2], [0, 0, 2, 2, 2], [0, 0, 2, 0, 0], [-2, 0, 1, 2, 2], [0, 0, 0, 2, 0],
  [-2, 0, 0, 2, 0], [0, 0, -1, 2, 1], [0, 2, 0, 0, 0], [2, 0, -1, 0, 1], [-2, 2, 0, 2, 2],
  [0, 1, 0, 0, 1], [-2, 0, 1, 0, 1], [0, -1, 0, 0, 1], [0, 0, 2, -2, 0], [2, 0, -1, 2, 1],
  [2, 0, 1, 2, 2], [0, 1, 0, 2, 2], [-2, 1, 1, 0, 0], [0, -1, 0, 2, 2], [2, 0, 0, 2, 1],
  [2, 0, 1, 0, 0], [-2, 0, 2, 2, 2], [-2, 0, 1, 2, 1], [2, 0, -2, 0, 1], [2, 0, 0, 0, 1],
  [0, -1, 1, 0, 0], [-2, -1, 0, 2, 1], [-2, 0, 0, 0, 1], [0, 0, 2, 2, 1], [-2, 0, 2, 0, 1],
  [-2, 1, 0, 2, 1], [0, 0, 1, -2, 0], [-1, 0, 1, 0, 0], [-2, 1, 0, 0, 0], [1, 0, 0, 0, 0],
  [0, 0, 1, 2, 0], [0, 0, -2, 2, 2], [-1, -1, 1, 0, 0], [0, 1, 1, 0, 0], [0, -1, 1, 2, 2],
  [2, -1, -1, 2, 2], [0, 0, 3, 2, 2], [2, -1, 0, 2, 2],
];
const NUT_PE: readonly (readonly [number, number, number, number])[] = [
  [-171996, -174.2, 92025, 8.9], [-13187, -1.6, 5736, -3.1], [-2274, -0.2, 977, -0.5],
  [2062, 0.2, -895, 0.5], [1426, -3.4, 54, -0.1], [712, 0.1, -7, 0],
  [-517, 1.2, 224, -0.6], [-386, -0.4, 200, 0], [-301, 0, 129, -0.1],
  [217, -0.5, -95, 0.3], [-158, 0, 0, 0], [129, 0.1, -70, 0],
  [123, 0, -53, 0], [63, 0, 0, 0], [63, 0.1, -33, 0],
  [-59, 0, 26, 0], [-58, -0.1, 32, 0], [-51, 0, 27, 0],
  [48, 0, 0, 0], [46, 0, -24, 0], [-38, 0, 16, 0],
  [-31, 0, 13, 0], [29, 0, 0, 0], [29, 0, -12, 0],
  [26, 0, 0, 0], [-22, 0, 0, 0], [21, 0, -10, 0],
  [17, -0.1, 0, 0], [16, 0, -8, 0], [-16, 0.1, 7, 0],
  [-15, 0, 9, 0], [-13, 0, 7, 0], [-12, 0, 6, 0],
  [11, 0, 0, 0], [-10, 0, 5, 0], [-8, 0, 3, 0],
  [7, 0, -3, 0], [-7, 0, 0, 0], [-7, 0, 3, 0],
  [-7, 0, 3, 0], [6, 0, 0, 0], [6, 0, -3, 0],
  [6, 0, -3, 0], [-6, 0, 3, 0], [-6, 0, 3, 0],
  [5, 0, 0, 0], [-5, 0, 3, 0], [-5, 0, 3, 0],
  [-5, 0, 3, 0], [4, 0, 0, 0], [4, 0, 0, 0],
  [4, 0, 0, 0], [-4, 0, 0, 0], [-4, 0, 0, 0],
  [-4, 0, 0, 0], [3, 0, 0, 0], [-3, 0, 0, 0],
  [-3, 0, 0, 0], [-3, 0, 0, 0], [-3, 0, 0, 0],
  [-3, 0, 0, 0], [-3, 0, 0, 0], [-3, 0, 0, 0],
];

/** Normalise an angle to [0, 360). */
export function norm360(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

/** Signed smallest difference a − b, in (−180, 180]. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/** Julian Day (UT) of a UTC epoch-millisecond instant. */
export function julianDay(ms: number): number {
  return ms / 86_400_000 + 2440587.5;
}

function seriesSum(terms: readonly Term[], jme: number): number {
  let s = 0;
  for (const [a, b, c] of terms) s += a * Math.cos(b + c * jme);
  return s;
}

/** Evaluate a VSOP-style polynomial of series: (Σ Xi·JME^i) / 1e8, radians. */
function earthValue(groups: readonly (readonly Term[])[], jme: number): number {
  let s = 0;
  let p = 1;
  for (const g of groups) {
    s += seriesSum(g, jme) * p;
    p *= jme;
  }
  return s / 1e8;
}

/** Time-only part of the Sun position (everything before the observer enters). */
export interface GeocentricSun {
  /** Apparent geocentric right ascension, degrees [0, 360). */
  alpha: number;
  /** Apparent geocentric declination, degrees. */
  delta: number;
  /** Apparent sidereal time at Greenwich, degrees [0, 360). */
  nu: number;
  /** Equatorial horizontal parallax of the Sun, degrees. */
  xi: number;
}

export function geocentricSun(ms: number, deltaT: number): GeocentricSun {
  // §3.1 Julian dates and centuries.
  const jd = julianDay(ms);
  const jde = jd + deltaT / 86400;
  const jc = (jd - 2451545) / 36525;
  const jce = (jde - 2451545) / 36525;
  const jme = jce / 10;

  // §3.2 Heliocentric longitude, latitude (degrees) and radius vector (AU).
  const L = norm360(earthValue(L_TERMS, jme) / DEG);
  const B = earthValue(B_TERMS, jme) / DEG;
  const R = earthValue(R_TERMS, jme);

  // §3.3 Geocentric longitude and latitude.
  const theta = norm360(L + 180);
  const beta = -B;

  // §3.4 Nutation in longitude and obliquity.
  const x0 = 297.85036 + 445267.11148 * jce - 0.0019142 * jce ** 2 + jce ** 3 / 189474;
  const x1 = 357.52772 + 35999.05034 * jce - 0.0001603 * jce ** 2 - jce ** 3 / 300000;
  const x2 = 134.96298 + 477198.867398 * jce + 0.0086972 * jce ** 2 + jce ** 3 / 56250;
  const x3 = 93.27191 + 483202.017538 * jce - 0.0036825 * jce ** 2 + jce ** 3 / 327270;
  const x4 = 125.04452 - 1934.136261 * jce + 0.0020708 * jce ** 2 + jce ** 3 / 450000;
  let dPsi = 0;
  let dEps = 0;
  for (let i = 0; i < NUT_Y.length; i++) {
    const y = NUT_Y[i];
    const pe = NUT_PE[i];
    const arg = (x0 * y[0] + x1 * y[1] + x2 * y[2] + x3 * y[3] + x4 * y[4]) * DEG;
    dPsi += (pe[0] + pe[1] * jce) * Math.sin(arg);
    dEps += (pe[2] + pe[3] * jce) * Math.cos(arg);
  }
  dPsi /= 36_000_000;
  dEps /= 36_000_000;

  // §3.5 True obliquity of the ecliptic.
  const u = jme / 10;
  const eps0 =
    84381.448 - 4680.93 * u - 1.55 * u ** 2 + 1999.25 * u ** 3 - 51.38 * u ** 4 -
    249.67 * u ** 5 - 39.05 * u ** 6 + 7.12 * u ** 7 + 27.87 * u ** 8 + 5.79 * u ** 9 +
    2.45 * u ** 10;
  const eps = eps0 / 3600 + dEps;

  // §3.6–3.7 Aberration and apparent Sun longitude.
  const dTau = -20.4898 / (3600 * R);
  const lambda = theta + dPsi + dTau;

  // §3.8 Apparent sidereal time at Greenwich.
  const nu0 = norm360(
    280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * jc ** 2 - jc ** 3 / 38710000,
  );
  const nu = nu0 + dPsi * Math.cos(eps * DEG);

  // §3.9–3.10 Geocentric right ascension and declination.
  const lr = lambda * DEG;
  const er = eps * DEG;
  const br = beta * DEG;
  const alpha = norm360(
    Math.atan2(Math.sin(lr) * Math.cos(er) - Math.tan(br) * Math.sin(er), Math.cos(lr)) / DEG,
  );
  const delta =
    Math.asin(Math.sin(br) * Math.cos(er) + Math.cos(br) * Math.sin(er) * Math.sin(lr)) / DEG;

  // §3.12.1 Equatorial horizontal parallax.
  const xi = 8.794 / (3600 * R);

  return { alpha, delta, nu: norm360(nu), xi };
}

/** Observer-dependent part of the Sun position. */
export interface TopocentricSun {
  /** Topocentric elevation, refraction applied when requested, degrees. */
  elevation: number;
  /** Topocentric elevation without refraction, degrees. */
  elevationTrue: number;
  /** Azimuth, degrees clockwise from true north [0, 360). */
  azimuth: number;
  /** Topocentric local hour angle, degrees (−180, 180]; 0 = local apparent noon. */
  hourAngle: number;
}

export function topocentricSun(
  geo: GeocentricSun,
  lat: number,
  lon: number,
  heightM: number,
  atm: Atmosphere,
  refraction: boolean,
): TopocentricSun {
  // §3.11 Observer local hour angle (longitude east positive).
  const H = norm360(geo.nu + lon - geo.alpha);

  // §3.12 Topocentric right ascension and declination (parallax).
  const phi = lat * DEG;
  const xiR = geo.xi * DEG;
  const uu = Math.atan(0.99664719 * Math.tan(phi));
  const x = Math.cos(uu) + (heightM / 6378140) * Math.cos(phi);
  const y = 0.99664719 * Math.sin(uu) + (heightM / 6378140) * Math.sin(phi);
  const Hr = H * DEG;
  const dr = geo.delta * DEG;
  const dAlpha = Math.atan2(
    -x * Math.sin(xiR) * Math.sin(Hr),
    Math.cos(dr) - x * Math.sin(xiR) * Math.cos(Hr),
  );
  const deltaP = Math.atan2(
    (Math.sin(dr) - y * Math.sin(xiR)) * Math.cos(dAlpha),
    Math.cos(dr) - x * Math.sin(xiR) * Math.cos(Hr),
  );

  // §3.13 Topocentric local hour angle.
  const HpR = Hr - dAlpha;

  // §3.14 Elevation, refraction and azimuth.
  const e0 =
    Math.asin(
      Math.sin(phi) * Math.sin(deltaP) + Math.cos(phi) * Math.cos(deltaP) * Math.cos(HpR),
    ) / DEG;
  let de = 0;
  // WHY: SPA applies refraction only while the Sun's upper limb is above the refracted
  // horizon; below it the formula diverges and would produce a meaningless elevation.
  if (refraction && e0 >= -(SUN_SEMI_DIAMETER_DEG + 0.5667)) {
    de =
      (atm.pressureHpa / 1010) *
      (283 / (273 + atm.temperatureC)) *
      (1.02 / (60 * Math.tan((e0 + 10.3 / (e0 + 5.11)) * DEG)));
  }
  const gamma = Math.atan2(
    Math.sin(HpR),
    Math.cos(HpR) * Math.sin(phi) - Math.tan(deltaP) * Math.cos(phi),
  );
  const azimuth = norm360(gamma / DEG + 180);
  let hourAngle = norm360(HpR / DEG);
  if (hourAngle > 180) hourAngle -= 360;

  return { elevation: e0 + de, elevationTrue: e0, azimuth, hourAngle };
}

/** Convenience: full Sun position for one instant and place. */
export function sunPosition(
  ms: number,
  deltaT: number,
  lat: number,
  lon: number,
  heightM: number,
  atm: Atmosphere,
  refraction = true,
): TopocentricSun {
  return topocentricSun(geocentricSun(ms, deltaT), lat, lon, heightM, atm, refraction);
}
