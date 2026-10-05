"use strict";
(() => {
  // src/core/config.ts
  var SUN_SEMI_DIAMETER_DEG = 0.26667;
  var EARTH_RADIUS_M = 6371e3;
  var REFRACTION_REL_SIGMA = 0.1;
  var LOW_SUN_WARNING_DEG = 5;
  var SUN_MAX_RATE_DEG_PER_MIN = 0.2507;
  var RATE_SAFETY_FACTOR = 1.5;
  var COARSE_STEP_S = 600;
  var FINE_STEP_S = 10;
  var HEATMAP_SLOT_MIN = 5;
  var CLUSTER_MAX_DAY_GAP = 2;
  var CLUSTER_MAX_TOD_GAP_MIN = 90;
  var MIN_YEAR = 1900;
  var MAX_YEAR = 2100;
  var MAX_YEAR_SPAN = 30;
  var CONFIDENCE_LEVELS = [0.6827, 0.9545, 0.9973];
  var ACCEPT_LEVEL = 0.9973;
  var HEATMAP_LEVEL = 0.9545;

  // src/core/deltaT.ts
  function deltaTSeconds(year) {
    const y = year;
    if (y < 1900 || y >= 2150) {
      const u2 = (y - 1820) / 100;
      return -20 + 32 * u2 * u2;
    }
    if (y < 1920) {
      const t = y - 1900;
      return -2.79 + 1.494119 * t - 0.0598939 * t ** 2 + 61966e-7 * t ** 3 - 197e-6 * t ** 4;
    }
    if (y < 1941) {
      const t = y - 1920;
      return 21.2 + 0.84493 * t - 0.0761 * t ** 2 + 20936e-7 * t ** 3;
    }
    if (y < 1961) {
      const t = y - 1950;
      return 29.07 + 0.407 * t - t ** 2 / 233 + t ** 3 / 2547;
    }
    if (y < 1986) {
      const t = y - 1975;
      return 45.45 + 1.067 * t - t ** 2 / 260 - t ** 3 / 718;
    }
    if (y < 2005) {
      const t = y - 2e3;
      return 63.86 + 0.3345 * t - 0.060374 * t ** 2 + 17275e-7 * t ** 3 + 651814e-9 * t ** 4 + 2373599e-11 * t ** 5;
    }
    if (y < 2050) {
      const t = y - 2e3;
      return 62.92 + 0.32217 * t + 5589e-6 * t ** 2;
    }
    const u = (y - 1820) / 100;
    return -20 + 32 * u * u - 0.5628 * (2150 - y);
  }
  function decimalYear(ms) {
    return 1970 + ms / (365.2425 * 864e5);
  }

  // src/core/util.ts
  function at(arr, i) {
    const v = arr[i];
    if (v === void 0) throw new Error(`Invariant violated: index ${i} outside 0..${arr.length - 1}`);
    return v;
  }
  function last(arr) {
    return at(arr, arr.length - 1);
  }

  // src/core/spa.ts
  var DEG = Math.PI / 180;
  var L0 = [
    [175347046, 0, 0],
    [3341656, 4.6692568, 6283.07585],
    [34894, 4.6261, 12566.1517],
    [3497, 2.7441, 5753.3849],
    [3418, 2.8289, 3.5231],
    [3136, 3.6277, 77713.7715],
    [2676, 4.4181, 7860.4194],
    [2343, 6.1352, 3930.2097],
    [1324, 0.7425, 11506.7698],
    [1273, 2.0371, 529.691],
    [1199, 1.1096, 1577.3435],
    [990, 5.233, 5884.927],
    [902, 2.045, 26.298],
    [857, 3.508, 398.149],
    [780, 1.179, 5223.694],
    [753, 2.533, 5507.553],
    [505, 4.583, 18849.228],
    [492, 4.205, 775.523],
    [357, 2.92, 0.067],
    [317, 5.849, 11790.629],
    [284, 1.899, 796.298],
    [271, 0.315, 10977.079],
    [243, 0.345, 5486.778],
    [206, 4.806, 2544.314],
    [205, 1.869, 5573.143],
    [202, 2.458, 6069.777],
    [156, 0.833, 213.299],
    [132, 3.411, 2942.463],
    [126, 1.083, 20.775],
    [115, 0.645, 0.98],
    [103, 0.636, 4694.003],
    [102, 0.976, 15720.839],
    [102, 4.267, 7.114],
    [99, 6.21, 2146.17],
    [98, 0.68, 155.42],
    [86, 5.98, 161000.69],
    [85, 1.3, 6275.96],
    [85, 3.67, 71430.7],
    [80, 1.81, 17260.15],
    [79, 3.04, 12036.46],
    [75, 1.76, 5088.63],
    [74, 3.5, 3154.69],
    [74, 4.68, 801.82],
    [70, 0.83, 9437.76],
    [62, 3.98, 8827.39],
    [61, 1.82, 7084.9],
    [57, 2.78, 6286.6],
    [56, 4.39, 14143.5],
    [56, 3.47, 6279.55],
    [52, 0.19, 12139.55],
    [52, 1.33, 1748.02],
    [51, 0.28, 5856.48],
    [49, 0.49, 1194.45],
    [41, 5.37, 8429.24],
    [41, 2.4, 19651.05],
    [39, 6.17, 10447.39],
    [37, 6.04, 10213.29],
    [37, 2.57, 1059.38],
    [36, 1.71, 2352.87],
    [36, 1.78, 6812.77],
    [33, 0.59, 17789.85],
    [30, 0.44, 83996.85],
    [30, 2.74, 1349.87],
    [25, 3.16, 4690.48]
  ];
  var L1 = [
    [628331966747, 0, 0],
    [206059, 2.678235, 6283.07585],
    [4303, 2.6351, 12566.1517],
    [425, 1.59, 3.523],
    [119, 5.796, 26.298],
    [109, 2.966, 1577.344],
    [93, 2.59, 18849.23],
    [72, 1.14, 529.69],
    [68, 1.87, 398.15],
    [67, 4.41, 5507.55],
    [59, 2.89, 5223.69],
    [56, 2.17, 155.42],
    [45, 0.4, 796.3],
    [36, 0.47, 775.52],
    [29, 2.65, 7.11],
    [21, 5.34, 0.98],
    [19, 1.85, 5486.78],
    [19, 4.97, 213.3],
    [17, 2.99, 6275.96],
    [16, 0.03, 2544.31],
    [16, 1.43, 2146.17],
    [15, 1.21, 10977.08],
    [12, 2.83, 1748.02],
    [12, 3.26, 5088.63],
    [12, 5.27, 1194.45],
    [12, 2.08, 4694],
    [11, 0.77, 553.57],
    [10, 1.3, 6286.6],
    [10, 4.24, 1349.87],
    [9, 2.7, 242.73],
    [9, 5.64, 951.72],
    [8, 5.3, 2352.87],
    [6, 2.65, 9437.76],
    [6, 4.67, 4690.48]
  ];
  var L2 = [
    [52919, 0, 0],
    [8720, 1.0721, 6283.0758],
    [309, 0.867, 12566.152],
    [27, 0.05, 3.52],
    [16, 5.19, 26.3],
    [16, 3.68, 155.42],
    [10, 0.76, 18849.23],
    [9, 2.06, 77713.77],
    [7, 0.83, 775.52],
    [5, 4.66, 1577.34],
    [4, 1.03, 7.11],
    [4, 3.44, 5573.14],
    [3, 5.14, 796.3],
    [3, 6.05, 5507.55],
    [3, 1.19, 242.73],
    [3, 6.12, 529.69],
    [3, 0.31, 398.15],
    [3, 2.28, 553.57],
    [2, 4.38, 5223.69],
    [2, 3.75, 0.98]
  ];
  var L3 = [
    [289, 5.844, 6283.076],
    [35, 0, 0],
    [17, 5.49, 12566.15],
    [3, 5.2, 155.42],
    [1, 4.72, 3.52],
    [1, 5.3, 18849.23],
    [1, 5.97, 242.73]
  ];
  var L4 = [[114, 3.142, 0], [8, 4.13, 6283.08], [1, 3.84, 12566.15]];
  var L5 = [[1, 3.14, 0]];
  var B0 = [
    [280, 3.199, 84334.662],
    [102, 5.422, 5507.553],
    [80, 3.88, 5223.69],
    [44, 3.7, 2352.87],
    [32, 4, 1577.34]
  ];
  var B1 = [[9, 3.9, 5507.55], [6, 1.73, 5223.69]];
  var R0 = [
    [100013989, 0, 0],
    [1670700, 3.0984635, 6283.07585],
    [13956, 3.05525, 12566.1517],
    [3084, 5.1985, 77713.7715],
    [1628, 1.1739, 5753.3849],
    [1576, 2.8469, 7860.4194],
    [925, 5.453, 11506.77],
    [542, 4.564, 3930.21],
    [472, 3.661, 5884.927],
    [346, 0.964, 5507.553],
    [329, 5.9, 5223.694],
    [307, 0.299, 5573.143],
    [243, 4.273, 11790.629],
    [212, 5.847, 1577.344],
    [186, 5.022, 10977.079],
    [175, 3.012, 18849.228],
    [110, 5.055, 5486.778],
    [98, 0.89, 6069.78],
    [86, 5.69, 15720.84],
    [86, 1.27, 161000.69],
    [65, 0.27, 17260.15],
    [63, 0.92, 529.69],
    [57, 2.01, 83996.85],
    [56, 5.24, 71430.7],
    [49, 3.25, 2544.31],
    [47, 2.58, 775.52],
    [45, 5.54, 9437.76],
    [43, 6.01, 6275.96],
    [39, 5.36, 4694],
    [38, 2.39, 8827.39],
    [37, 0.83, 19651.05],
    [37, 4.9, 12139.55],
    [36, 1.67, 12036.46],
    [35, 1.84, 2942.46],
    [33, 0.24, 7084.9],
    [32, 0.18, 5088.63],
    [32, 1.78, 398.15],
    [28, 1.21, 6286.6],
    [28, 1.9, 6279.55],
    [26, 4.59, 10447.39]
  ];
  var R1 = [
    [103019, 1.10749, 6283.07585],
    [1721, 1.0644, 12566.1517],
    [702, 3.142, 0],
    [32, 1.02, 18849.23],
    [31, 2.84, 5507.55],
    [25, 1.32, 5223.69],
    [18, 1.42, 1577.34],
    [10, 5.91, 10977.08],
    [9, 1.42, 6275.96],
    [9, 0.27, 5486.78]
  ];
  var R2 = [
    [4359, 5.7846, 6283.0758],
    [124, 5.579, 12566.152],
    [12, 3.14, 0],
    [9, 3.63, 77713.77],
    [6, 1.87, 5573.14],
    [3, 5.47, 18849.23]
  ];
  var R3 = [[145, 4.273, 6283.076], [7, 3.92, 12566.15]];
  var R4 = [[4, 2.56, 6283.08]];
  var L_TERMS = [L0, L1, L2, L3, L4, L5];
  var B_TERMS = [B0, B1];
  var R_TERMS = [R0, R1, R2, R3, R4];
  var NUT_Y = [
    [0, 0, 0, 0, 1],
    [-2, 0, 0, 2, 2],
    [0, 0, 0, 2, 2],
    [0, 0, 0, 0, 2],
    [0, 1, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [-2, 1, 0, 2, 2],
    [0, 0, 0, 2, 1],
    [0, 0, 1, 2, 2],
    [-2, -1, 0, 2, 2],
    [-2, 0, 1, 0, 0],
    [-2, 0, 0, 2, 1],
    [0, 0, -1, 2, 2],
    [2, 0, 0, 0, 0],
    [0, 0, 1, 0, 1],
    [2, 0, -1, 2, 2],
    [0, 0, -1, 0, 1],
    [0, 0, 1, 2, 1],
    [-2, 0, 2, 0, 0],
    [0, 0, -2, 2, 1],
    [2, 0, 0, 2, 2],
    [0, 0, 2, 2, 2],
    [0, 0, 2, 0, 0],
    [-2, 0, 1, 2, 2],
    [0, 0, 0, 2, 0],
    [-2, 0, 0, 2, 0],
    [0, 0, -1, 2, 1],
    [0, 2, 0, 0, 0],
    [2, 0, -1, 0, 1],
    [-2, 2, 0, 2, 2],
    [0, 1, 0, 0, 1],
    [-2, 0, 1, 0, 1],
    [0, -1, 0, 0, 1],
    [0, 0, 2, -2, 0],
    [2, 0, -1, 2, 1],
    [2, 0, 1, 2, 2],
    [0, 1, 0, 2, 2],
    [-2, 1, 1, 0, 0],
    [0, -1, 0, 2, 2],
    [2, 0, 0, 2, 1],
    [2, 0, 1, 0, 0],
    [-2, 0, 2, 2, 2],
    [-2, 0, 1, 2, 1],
    [2, 0, -2, 0, 1],
    [2, 0, 0, 0, 1],
    [0, -1, 1, 0, 0],
    [-2, -1, 0, 2, 1],
    [-2, 0, 0, 0, 1],
    [0, 0, 2, 2, 1],
    [-2, 0, 2, 0, 1],
    [-2, 1, 0, 2, 1],
    [0, 0, 1, -2, 0],
    [-1, 0, 1, 0, 0],
    [-2, 1, 0, 0, 0],
    [1, 0, 0, 0, 0],
    [0, 0, 1, 2, 0],
    [0, 0, -2, 2, 2],
    [-1, -1, 1, 0, 0],
    [0, 1, 1, 0, 0],
    [0, -1, 1, 2, 2],
    [2, -1, -1, 2, 2],
    [0, 0, 3, 2, 2],
    [2, -1, 0, 2, 2]
  ];
  var NUT_PE = [
    [-171996, -174.2, 92025, 8.9],
    [-13187, -1.6, 5736, -3.1],
    [-2274, -0.2, 977, -0.5],
    [2062, 0.2, -895, 0.5],
    [1426, -3.4, 54, -0.1],
    [712, 0.1, -7, 0],
    [-517, 1.2, 224, -0.6],
    [-386, -0.4, 200, 0],
    [-301, 0, 129, -0.1],
    [217, -0.5, -95, 0.3],
    [-158, 0, 0, 0],
    [129, 0.1, -70, 0],
    [123, 0, -53, 0],
    [63, 0, 0, 0],
    [63, 0.1, -33, 0],
    [-59, 0, 26, 0],
    [-58, -0.1, 32, 0],
    [-51, 0, 27, 0],
    [48, 0, 0, 0],
    [46, 0, -24, 0],
    [-38, 0, 16, 0],
    [-31, 0, 13, 0],
    [29, 0, 0, 0],
    [29, 0, -12, 0],
    [26, 0, 0, 0],
    [-22, 0, 0, 0],
    [21, 0, -10, 0],
    [17, -0.1, 0, 0],
    [16, 0, -8, 0],
    [-16, 0.1, 7, 0],
    [-15, 0, 9, 0],
    [-13, 0, 7, 0],
    [-12, 0, 6, 0],
    [11, 0, 0, 0],
    [-10, 0, 5, 0],
    [-8, 0, 3, 0],
    [7, 0, -3, 0],
    [-7, 0, 0, 0],
    [-7, 0, 3, 0],
    [-7, 0, 3, 0],
    [6, 0, 0, 0],
    [6, 0, -3, 0],
    [6, 0, -3, 0],
    [-6, 0, 3, 0],
    [-6, 0, 3, 0],
    [5, 0, 0, 0],
    [-5, 0, 3, 0],
    [-5, 0, 3, 0],
    [-5, 0, 3, 0],
    [4, 0, 0, 0],
    [4, 0, 0, 0],
    [4, 0, 0, 0],
    [-4, 0, 0, 0],
    [-4, 0, 0, 0],
    [-4, 0, 0, 0],
    [3, 0, 0, 0],
    [-3, 0, 0, 0],
    [-3, 0, 0, 0],
    [-3, 0, 0, 0],
    [-3, 0, 0, 0],
    [-3, 0, 0, 0],
    [-3, 0, 0, 0],
    [-3, 0, 0, 0]
  ];
  function norm360(deg) {
    const r = deg % 360;
    return r < 0 ? r + 360 : r;
  }
  function angleDiff(a, b) {
    let d = (a - b) % 360;
    if (d > 180) d -= 360;
    if (d <= -180) d += 360;
    return d;
  }
  function julianDay(ms) {
    return ms / 864e5 + 24405875e-1;
  }
  function seriesSum(terms, jme) {
    let s = 0;
    for (const [a, b, c] of terms) s += a * Math.cos(b + c * jme);
    return s;
  }
  function earthValue(groups, jme) {
    let s = 0;
    let p = 1;
    for (const g of groups) {
      s += seriesSum(g, jme) * p;
      p *= jme;
    }
    return s / 1e8;
  }
  function geocentricSun(ms, deltaT) {
    const jd = julianDay(ms);
    const jde = jd + deltaT / 86400;
    const jc = (jd - 2451545) / 36525;
    const jce = (jde - 2451545) / 36525;
    const jme = jce / 10;
    const L = norm360(earthValue(L_TERMS, jme) / DEG);
    const B = earthValue(B_TERMS, jme) / DEG;
    const R = earthValue(R_TERMS, jme);
    const theta = norm360(L + 180);
    const beta = -B;
    const x0 = 297.85036 + 445267.11148 * jce - 19142e-7 * jce ** 2 + jce ** 3 / 189474;
    const x1 = 357.52772 + 35999.05034 * jce - 1603e-7 * jce ** 2 - jce ** 3 / 3e5;
    const x2 = 134.96298 + 477198.867398 * jce + 86972e-7 * jce ** 2 + jce ** 3 / 56250;
    const x3 = 93.27191 + 483202.017538 * jce - 36825e-7 * jce ** 2 + jce ** 3 / 327270;
    const x4 = 125.04452 - 1934.136261 * jce + 20708e-7 * jce ** 2 + jce ** 3 / 45e4;
    let dPsi = 0;
    let dEps = 0;
    for (let i = 0; i < NUT_Y.length; i++) {
      const y = at(NUT_Y, i);
      const pe = at(NUT_PE, i);
      const arg = (x0 * y[0] + x1 * y[1] + x2 * y[2] + x3 * y[3] + x4 * y[4]) * DEG;
      dPsi += (pe[0] + pe[1] * jce) * Math.sin(arg);
      dEps += (pe[2] + pe[3] * jce) * Math.cos(arg);
    }
    dPsi /= 36e6;
    dEps /= 36e6;
    const u = jme / 10;
    const eps0 = 84381.448 - 4680.93 * u - 1.55 * u ** 2 + 1999.25 * u ** 3 - 51.38 * u ** 4 - 249.67 * u ** 5 - 39.05 * u ** 6 + 7.12 * u ** 7 + 27.87 * u ** 8 + 5.79 * u ** 9 + 2.45 * u ** 10;
    const eps = eps0 / 3600 + dEps;
    const dTau = -20.4898 / (3600 * R);
    const lambda = theta + dPsi + dTau;
    const nu0 = norm360(
      280.46061837 + 360.98564736629 * (jd - 2451545) + 387933e-9 * jc ** 2 - jc ** 3 / 3871e4
    );
    const nu = nu0 + dPsi * Math.cos(eps * DEG);
    const lr = lambda * DEG;
    const er = eps * DEG;
    const br = beta * DEG;
    const alpha = norm360(
      Math.atan2(Math.sin(lr) * Math.cos(er) - Math.tan(br) * Math.sin(er), Math.cos(lr)) / DEG
    );
    const delta = Math.asin(Math.sin(br) * Math.cos(er) + Math.cos(br) * Math.sin(er) * Math.sin(lr)) / DEG;
    const xi = 8.794 / (3600 * R);
    return { alpha, delta, nu: norm360(nu), xi };
  }
  function topocentricSun(geo, lat, lon, heightM, atm, refraction) {
    const H = norm360(geo.nu + lon - geo.alpha);
    const phi = lat * DEG;
    const xiR = geo.xi * DEG;
    const uu = Math.atan(0.99664719 * Math.tan(phi));
    const x = Math.cos(uu) + heightM / 6378140 * Math.cos(phi);
    const y = 0.99664719 * Math.sin(uu) + heightM / 6378140 * Math.sin(phi);
    const Hr = H * DEG;
    const dr = geo.delta * DEG;
    const dAlpha = Math.atan2(
      -x * Math.sin(xiR) * Math.sin(Hr),
      Math.cos(dr) - x * Math.sin(xiR) * Math.cos(Hr)
    );
    const deltaP = Math.atan2(
      (Math.sin(dr) - y * Math.sin(xiR)) * Math.cos(dAlpha),
      Math.cos(dr) - x * Math.sin(xiR) * Math.cos(Hr)
    );
    const HpR = Hr - dAlpha;
    const e0 = Math.asin(
      Math.sin(phi) * Math.sin(deltaP) + Math.cos(phi) * Math.cos(deltaP) * Math.cos(HpR)
    ) / DEG;
    let de = 0;
    if (refraction && e0 >= -(SUN_SEMI_DIAMETER_DEG + 0.5667)) {
      de = atm.pressureHpa / 1010 * (283 / (273 + atm.temperatureC)) * (1.02 / (60 * Math.tan((e0 + 10.3 / (e0 + 5.11)) * DEG)));
    }
    const gamma = Math.atan2(
      Math.sin(HpR),
      Math.cos(HpR) * Math.sin(phi) - Math.tan(deltaP) * Math.cos(phi)
    );
    const azimuth = norm360(gamma / DEG + 180);
    let hourAngle = norm360(HpR / DEG);
    if (hourAngle > 180) hourAngle -= 360;
    return { elevation: e0 + de, elevationTrue: e0, azimuth, hourAngle };
  }

  // src/core/stats.ts
  function lnGamma(z) {
    const c = [
      0.9999999999998099,
      676.5203681218851,
      -1259.1392167224028,
      771.3234287776531,
      -176.6150291621406,
      12.507343278686905,
      -0.13857109526572012,
      9984369578019572e-21,
      15056327351493116e-23
    ];
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
    const x = z - 1;
    let a = at(c, 0);
    const t = x + 7.5;
    for (let i = 1; i < 9; i++) a += at(c, i) / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  function gammaP(a, x) {
    if (x <= 0) return 0;
    const gln = lnGamma(a);
    if (x < a + 1) {
      let sum = 1 / a;
      let del = sum;
      let ap = a;
      for (let n = 0; n < 500; n++) {
        ap += 1;
        del *= x / ap;
        sum += del;
        if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
      }
      return sum * Math.exp(-x + a * Math.log(x) - gln);
    }
    const tiny = 1e-300;
    let b = x + 1 - a;
    let c = 1 / tiny;
    let d = 1 / b;
    let h = d;
    for (let i = 1; i < 500; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b;
      if (Math.abs(d) < tiny) d = tiny;
      c = b + an / c;
      if (Math.abs(c) < tiny) c = tiny;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 1e-15) break;
    }
    return 1 - Math.exp(-x + a * Math.log(x) - gln) * h;
  }
  function chi2Cdf(x, k) {
    return gammaP(k / 2, x / 2);
  }
  var cache = /* @__PURE__ */ new Map();
  function chi2Quantile(p, k) {
    if (k <= 0) return 0;
    const key = `${p}|${k}`;
    const hit = cache.get(key);
    if (hit !== void 0) return hit;
    let lo = 0;
    let hi = 10 * k + 100;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (chi2Cdf(mid, k) < p) lo = mid;
      else hi = mid;
    }
    const x = (lo + hi) / 2;
    cache.set(key, x);
    return x;
  }

  // src/core/score.ts
  var SIDEREAL_DEG_PER_S = 360.98564736629 / 86400;
  var NU_STEP_DEG = 0.05;
  var POS_STEP_M = 1e3;
  function levelThreshold(level, dof) {
    return chi2Quantile(level, dof);
  }
  var Scorer = class {
    dof;
    thrHeat;
    shots;
    atm;
    heightM;
    constructor(shots, atm, heightM) {
      this.shots = shots;
      this.atm = atm;
      this.heightM = heightM;
      let dof = 0;
      for (const s of shots) {
        if (s.obs.elevation.kind === "gauss") dof++;
        if (s.obs.azimuth?.kind === "gauss") dof++;
      }
      this.dof = dof;
      this.thrHeat = levelThreshold(HEATMAP_LEVEL, dof);
    }
    sun(geo, lat, lon) {
      return topocentricSun(geo, lat, lon, this.heightM, this.atm, this.atm.refraction);
    }
    /**
     * Joint fit of all shots. `geos[i]` is the ephemeris at shot i's candidate time;
     * `radiusM` is the location uncertainty (time mode) or 0 (location mode).
     */
    fit(geos, lat, lon, radiusM) {
      let chi2 = 0;
      let logL = 0;
      let rangeU = 0;
      const shotFits = [];
      const cosLat = Math.max(Math.cos(lat * Math.PI / 180), 1e-6);
      for (let i = 0; i < this.shots.length; i++) {
        const { obs, timeSigmaS } = at(this.shots, i);
        const geo = at(geos, i);
        const s0 = this.sun(geo, lat, lon);
        const rEl = s0.elevation - obs.elevation.centre;
        const rAz = obs.azimuth ? angleDiff(s0.azimuth, obs.azimuth.centre) : 0;
        const need = timeSigmaS > 0 || radiusM > 0;
        let dt = { el: 0, az: 0 };
        let dn = { el: 0, az: 0 };
        let de = { el: 0, az: 0 };
        if (need) {
          const diff = (a, b, h) => ({
            el: (a.elevation - b.elevation) / h,
            az: angleDiff(a.azimuth, b.azimuth) / h
          });
          if (timeSigmaS > 0) {
            const p = this.sun({ ...geo, nu: geo.nu + NU_STEP_DEG }, lat, lon);
            const m = this.sun({ ...geo, nu: geo.nu - NU_STEP_DEG }, lat, lon);
            dt = diff(p, m, 2 * NU_STEP_DEG / SIDEREAL_DEG_PER_S);
          }
          if (radiusM > 0) {
            const dLat = POS_STEP_M / EARTH_RADIUS_M * (180 / Math.PI);
            const dLon = dLat / cosLat;
            dn = diff(this.sun(geo, lat + dLat, lon), this.sun(geo, lat - dLat, lon), 2 * POS_STEP_M);
            de = diff(this.sun(geo, lat, lon + dLon), this.sun(geo, lat, lon - dLon), 2 * POS_STEP_M);
          }
        }
        const comps = [];
        const ranges = [];
        const add = (c, r, d) => {
          if (c.kind === "gauss") comps.push({ c, r, d });
          else ranges.push({ c, r, d });
        };
        add(obs.elevation, rEl, [dt.el, dn.el, de.el]);
        if (obs.azimuth) add(obs.azimuth, rAz, [dt.az, dn.az, de.az]);
        const varT = timeSigmaS ** 2;
        const varP = (radiusM / 2) ** 2;
        const [first, second] = comps;
        if (first && !second) {
          const { c, r, d } = first;
          const v = c.sigma ** 2 + d[0] ** 2 * varT + (d[1] ** 2 + d[2] ** 2) * varP;
          chi2 += r * r / v;
          logL += -0.5 * (r * r) / v - 0.5 * Math.log(v);
        } else if (first && second) {
          const a = first;
          const b = second;
          const caa = a.c.sigma ** 2 + a.d[0] ** 2 * varT + (a.d[1] ** 2 + a.d[2] ** 2) * varP;
          const cbb = b.c.sigma ** 2 + b.d[0] ** 2 * varT + (b.d[1] ** 2 + b.d[2] ** 2) * varP;
          const cab = a.d[0] * b.d[0] * varT + (a.d[1] * b.d[1] + a.d[2] * b.d[2]) * varP;
          const det = caa * cbb - cab * cab;
          const q = (cbb * a.r * a.r - 2 * cab * a.r * b.r + caa * b.r * b.r) / det;
          chi2 += q;
          logL += -0.5 * q - 0.5 * Math.log(det);
        }
        for (const { c, r, d } of ranges) {
          const half = c.half + Math.abs(d[0]) * timeSigmaS + radiusM * Math.hypot(d[1], d[2]);
          const u = half > 0 ? Math.abs(r) / half : r === 0 ? 0 : Infinity;
          if (u > rangeU) rangeU = u;
        }
        shotFits.push({
          sunElevation: s0.elevation,
          sunAzimuth: s0.azimuth,
          residualElevation: rEl,
          residualAzimuth: obs.azimuth ? rAz : null,
          solarTimeH: ((s0.hourAngle / 15 + 12) % 24 + 24) % 24
        });
      }
      const gaussPart = this.dof > 0 ? Math.sqrt(chi2 / this.thrHeat) : 0;
      return {
        chi2,
        dof: this.dof,
        rangeU,
        misfit: Math.max(gaussPart, rangeU),
        logL,
        shots: shotFits
      };
    }
    /**
     * Necessary-condition radius for the coarse search: if a candidate is accepted at
     * `thr`, shot i's Sun must lie within this great-circle distance (degrees) of the
     * observed direction (or within this elevation difference when azimuth is unknown).
     * HOW: accepted ⇒ |rᵢ| ≤ √(thr·Cᵢᵢ) per component, and Cᵢᵢ ≤ σᵢ² + extra² in sky
     * units; the great-circle distance is at most |Δel| + |Δaz|·cos(el).
     */
    searchRadius(i, thr, radiusM, rateDegPerS) {
      const { obs, timeSigmaS } = at(this.shots, i);
      const extra = rateDegPerS * timeSigmaS + radiusM / EARTH_RADIUS_M * (180 / Math.PI);
      const k = Math.sqrt(thr);
      const part = (c) => c.kind === "gauss" ? k * Math.hypot(c.sigma, extra) : c.half + extra;
      return part(obs.elevation) + (obs.azimuth ? part(obs.azimuth) : 0);
    }
    /** Cheap distance used by the coarse search (see searchRadius). */
    coarseDistance(i, geo, lat, lon) {
      const obs = at(this.shots, i).obs;
      const s = this.sun(geo, lat, lon);
      if (!obs.azimuth) return Math.abs(s.elevation - obs.elevation.centre);
      const r = Math.PI / 180;
      const e1 = s.elevation * r;
      const e2 = obs.elevation.centre * r;
      const da = (s.azimuth - obs.azimuth.centre) * r;
      const cosd = Math.sin(e1) * Math.sin(e2) + Math.cos(e1) * Math.cos(e2) * Math.cos(da);
      return Math.acos(Math.min(1, Math.max(-1, cosd))) / r;
    }
    get shotCount() {
      return this.shots.length;
    }
  };

  // src/core/ephemeris.ts
  var NODE_MS = 36e5;
  var ROT_DEG_PER_DAY = 360.98564736629;
  function rotation(ms) {
    return norm360(ROT_DEG_PER_DAY * (julianDay(ms) - 2451545));
  }
  var Ephemeris = class {
    nodes = /* @__PURE__ */ new Map();
    exactEvaluations = 0;
    deltaTOverride;
    constructor(deltaTOverride) {
      this.deltaTOverride = deltaTOverride;
    }
    node(k) {
      const hit = this.nodes.get(k);
      if (hit) return hit;
      const ms = k * NODE_MS;
      const dT = this.deltaTOverride ?? deltaTSeconds(decimalYear(ms));
      const g = geocentricSun(ms, dT);
      this.exactEvaluations++;
      const n = { alpha: g.alpha, delta: g.delta, xi: g.xi, nuRest: angleDiff(g.nu, rotation(ms)) };
      if (this.nodes.size > 6e5) this.nodes.clear();
      this.nodes.set(k, n);
      return n;
    }
    at(ms) {
      const k = Math.floor(ms / NODE_MS);
      const f = (ms - k * NODE_MS) / NODE_MS;
      const a = this.node(k);
      const b = this.node(k + 1);
      return {
        alpha: norm360(a.alpha + f * angleDiff(b.alpha, a.alpha)),
        delta: a.delta + f * (b.delta - a.delta),
        xi: a.xi + f * (b.xi - a.xi),
        nu: norm360(rotation(ms) + a.nuRest + f * angleDiff(b.nuRest, a.nuRest))
      };
    }
  };

  // src/core/measurement.ts
  var DEG2 = Math.PI / 180;
  function refractionDeg(apparentDeg) {
    if (apparentDeg < -1) return 0;
    const arcmin = 1 / Math.tan((apparentDeg + 7.31 / (apparentDeg + 4.4)) * DEG2);
    return arcmin / 60;
  }
  function valid(u, positive) {
    const nums = u.kind === "gauss" ? [u.value, u.sigma] : [u.min, u.max];
    if (nums.some((n) => !Number.isFinite(n))) return "core.err.missing";
    if (u.kind === "gauss" && u.sigma < 0) return "core.err.negativeSigma";
    if (u.kind === "range" && u.min > u.max) return "core.err.minAboveMax";
    const lo = u.kind === "gauss" ? u.value : u.min;
    if (positive && lo <= 0) return "core.err.notPositive";
    return null;
  }
  var fieldError = (field, reason) => ({ key: "core.err.field", vars: { field: { key: field }, reason: { key: reason } } });
  function elevationPart(s) {
    const e = s.elevation;
    if (e.method === "lengths") {
      const err2 = valid(e.height, true) ?? valid(e.shadow, true);
      if (err2) return fieldError("core.field.heightShadow", err2);
      if (e.height.kind !== e.shadow.kind) return { key: "core.err.mixedKinds" };
      if (e.height.kind === "gauss" && e.shadow.kind === "gauss") {
        const H = e.height.value;
        const L = e.shadow.value;
        const d = H * H + L * L;
        const sig = Math.sqrt(L * L * e.height.sigma ** 2 + H * H * e.shadow.sigma ** 2) / d / DEG2;
        return {
          kind: "gauss",
          centre: Math.atan2(H, L) / DEG2,
          items: [{ label: "budget.lengths", amount: sig }]
        };
      }
      if (e.height.kind === "range" && e.shadow.kind === "range") {
        const lo = Math.atan2(e.height.min, e.shadow.max) / DEG2;
        const hi = Math.atan2(e.height.max, e.shadow.min) / DEG2;
        return {
          kind: "range",
          centre: (lo + hi) / 2,
          items: [{ label: "budget.lengths", amount: (hi - lo) / 2 }]
        };
      }
      return { key: "core.err.mixedKinds" };
    }
    if (e.method === "ratio") {
      const err2 = valid(e.ratio, true);
      if (err2) return fieldError("core.field.ratio", err2);
      if (e.ratio.kind === "gauss") {
        const r = e.ratio.value;
        return {
          kind: "gauss",
          centre: Math.atan(r) / DEG2,
          items: [{ label: "budget.ratio", amount: e.ratio.sigma / (1 + r * r) / DEG2 }]
        };
      }
      const lo = Math.atan(e.ratio.min) / DEG2;
      const hi = Math.atan(e.ratio.max) / DEG2;
      return {
        kind: "range",
        centre: (lo + hi) / 2,
        items: [{ label: "budget.ratio", amount: (hi - lo) / 2 }]
      };
    }
    const err = valid(e.angle, true);
    if (err) return fieldError("core.field.elevation", err);
    if (e.angle.kind === "gauss") {
      return {
        kind: "gauss",
        centre: e.angle.value,
        items: [{ label: "budget.angle", amount: e.angle.sigma }]
      };
    }
    return {
      kind: "range",
      centre: (e.angle.min + e.angle.max) / 2,
      items: [{ label: "budget.angle", amount: (e.angle.max - e.angle.min) / 2 }]
    };
  }
  function uniform(kind, a) {
    return kind === "gauss" ? a / Math.sqrt(3) : a;
  }
  function combine(kind, centre, items) {
    const used = items.filter((i) => i.amount > 0);
    if (kind === "gauss") {
      return { kind, centre, sigma: Math.sqrt(used.reduce((a, i) => a + i.amount ** 2, 0)) };
    }
    return { kind, centre, half: used.reduce((a, i) => a + i.amount, 0) };
  }
  function buildObservation(s, refraction) {
    const warnings = [];
    const part = elevationPart(s);
    if ("key" in part) return { ok: false, error: part };
    if (!(s.maxTiltDeg >= 0 && s.maxTiltDeg < 45)) {
      return { ok: false, error: { key: "core.err.tilt" } };
    }
    const kind = part.kind;
    let centre = part.centre;
    const items = [...part.items];
    const sd = SUN_SEMI_DIAMETER_DEG;
    if (s.tipEdge === "umbra") centre -= sd;
    else if (s.tipEdge === "outer") centre += sd;
    else if (s.tipEdge === "unknown") items.push({ label: "budget.tipEdge", amount: uniform(kind, sd) });
    else items.push({ label: "budget.tipMidpoint", amount: uniform(kind, sd / 2) });
    if (s.maxTiltDeg > 0) items.push({ label: "budget.tilt", amount: uniform(kind, s.maxTiltDeg) });
    if (refraction) {
      const r = refractionDeg(centre);
      const amt = kind === "gauss" ? REFRACTION_REL_SIGMA * r : 2 * REFRACTION_REL_SIGMA * r;
      items.push({ label: "budget.refraction", amount: amt });
    }
    if (centre <= 0) return { ok: false, error: { key: "core.err.belowHorizon" } };
    if (centre < LOW_SUN_WARNING_DEG) warnings.push({ key: "core.warn.lowSun" });
    const elevation = combine(kind, centre, items);
    const elevSpread = elevation.kind === "gauss" ? elevation.sigma : elevation.half;
    if (elevSpread > 5) warnings.push({ key: "core.warn.wideElevation" });
    let azimuth = null;
    const azItems = [];
    if (s.azimuth) {
      const a = s.azimuth;
      const err = valid(a.shadow, false);
      if (err) return { ok: false, error: fieldError("core.field.azimuth", err) };
      if (!Number.isFinite(a.declinationDeg)) return { ok: false, error: { key: "core.err.declination" } };
      const decl = a.reference === "magnetic" ? a.declinationDeg : 0;
      const shadowAz = a.shadow.kind === "gauss" ? a.shadow.value : (a.shadow.min + a.shadow.max) / 2;
      const reading = a.shadow.kind === "gauss" ? a.shadow.sigma : (a.shadow.max - a.shadow.min) / 2;
      azItems.push({ label: "budget.azimuth", amount: reading });
      if (s.maxTiltDeg > 0) {
        const tiltAz = Math.atan(Math.sin(s.maxTiltDeg * DEG2) * Math.tan(centre * DEG2)) / DEG2;
        azItems.push({ label: "budget.tilt", amount: uniform(a.shadow.kind, tiltAz) });
      }
      const sunAz = ((shadowAz + decl + 180) % 360 + 360) % 360;
      azimuth = combine(a.shadow.kind, sunAz, azItems);
      if (centre > 80) {
        warnings.push({ key: "core.warn.highSun" });
      }
    }
    return {
      ok: true,
      obs: { elevation, azimuth, elevationBudget: items, azimuthBudget: azItems, warnings }
    };
  }

  // src/core/zone.ts
  var formatters = /* @__PURE__ */ new Map();
  var offsetCache = /* @__PURE__ */ new Map();
  function ianaOffsetMin(name, ms) {
    const hour = Math.floor(ms / 36e5);
    const key = `${name}|${hour}`;
    const hit = offsetCache.get(key);
    if (hit !== void 0) return hit;
    let f = formatters.get(name);
    if (!f) {
      f = new Intl.DateTimeFormat("en-GB", {
        timeZone: name,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
      formatters.set(name, f);
    }
    const p = {};
    for (const part of f.formatToParts(ms)) {
      if (part.type !== "literal") p[part.type] = Number(part.value);
    }
    const asUtc = Date.UTC(p.year ?? NaN, (p.month ?? NaN) - 1, p.day ?? NaN, p.hour ?? NaN, p.minute ?? NaN, p.second ?? NaN);
    const off = Math.round((asUtc - Math.floor(ms / 1e3) * 1e3) / 6e4);
    if (offsetCache.size > 4e5) offsetCache.clear();
    offsetCache.set(key, off);
    return off;
  }
  function zoneOffsetMin(zone, ms, lon) {
    switch (zone.kind) {
      case "utc":
        return 0;
      case "offset":
        return zone.minutes;
      case "solar":
        return lon * 4;
      case "iana":
        return ianaOffsetMin(zone.name, ms);
    }
  }
  function wallParts(zone, ms, lon) {
    const wallMs = ms + zoneOffsetMin(zone, ms, lon) * 6e4;
    const d = new Date(wallMs);
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth(),
      day: d.getUTCDate(),
      minuteOfDay: d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60,
      wallMs
    };
  }
  function wallToUtc(zone, wallMs, lon) {
    let utc = wallMs - zoneOffsetMin(zone, wallMs, lon) * 6e4;
    utc = wallMs - zoneOffsetMin(zone, utc, lon) * 6e4;
    return utc;
  }

  // src/core/solveTime.ts
  var RATE_DEG_PER_S = SUN_MAX_RATE_DEG_PER_MIN / 60;
  function prepareShots(shots, atm) {
    if (shots.length === 0) return { ok: false, error: { key: "core.err.noShadow" } };
    const observations = [];
    for (const s of shots) {
      const r = buildObservation(s.shadow, atm.refraction);
      if (!r.ok) return { ok: false, error: { ...r.error, shot: s.label } };
      observations.push(r.obs);
    }
    return { ok: true, observations };
  }
  var GeoAtOffsets = class {
    distinct;
    index;
    eph;
    evaluations = 0;
    constructor(offsetsMs, deltaTOverride) {
      this.distinct = [...new Set(offsetsMs)];
      this.index = offsetsMs.map((o) => this.distinct.indexOf(o));
      this.eph = new Ephemeris(deltaTOverride);
    }
    at(t) {
      const g = this.distinct.map((o) => this.eph.at(t + o));
      this.evaluations += g.length;
      return this.index.map((i) => at(g, i));
    }
  };
  function makeAllowed(c, lon) {
    const anyMonth = c.months.every(Boolean);
    const tod = c.todFromMin !== null && c.todToMin !== null;
    return (t) => {
      if (c.notBeforeMs !== null && t < c.notBeforeMs) return false;
      if (c.notAfterMs !== null && t > c.notAfterMs) return false;
      if (anyMonth && !tod) return true;
      const w = wallParts(c.zone, t, lon);
      if (!anyMonth && !c.months[w.month]) return false;
      if (tod) {
        const a = c.todFromMin;
        const b = c.todToMin;
        const m = w.minuteOfDay;
        if (a <= b ? m < a || m > b : m < a && m > b) return false;
      }
      return true;
    };
  }
  function validate(req) {
    const { site, constraints: c } = req;
    if (!(Math.abs(site.lat) <= 90) || !(Math.abs(site.lon) <= 180)) return { key: "core.err.location" };
    if (!(site.radiusM >= 0)) return { key: "core.err.radius" };
    if (!Number.isInteger(c.yearFrom) || !Number.isInteger(c.yearTo)) return { key: "core.err.yearsInteger" };
    if (c.yearFrom > c.yearTo) return { key: "core.err.yearsOrder" };
    if (c.yearFrom < MIN_YEAR || c.yearTo > MAX_YEAR) return { key: "core.err.yearsRange", vars: { min: MIN_YEAR, max: MAX_YEAR } };
    if (c.yearTo - c.yearFrom + 1 > MAX_YEAR_SPAN) return { key: "core.err.yearsSpan", vars: { max: MAX_YEAR_SPAN } };
    if (c.months.length !== 12 || !c.months.some(Boolean)) return { key: "core.err.months" };
    for (const s of req.shots) {
      if (!(s.timeSigmaS >= 0) || !Number.isFinite(s.offsetS)) return { key: "core.err.offset", shot: s.label };
    }
    return null;
  }
  function logSumExp(a, b) {
    if (a === -Infinity) return b;
    if (b === -Infinity) return a;
    const m = Math.max(a, b);
    return m + Math.log(Math.exp(a - m) + Math.exp(b - m));
  }
  function solveTime(req, progress) {
    const t0 = Date.now();
    const err = validate(req);
    if (err) return { ok: false, error: err };
    const prep = prepareShots(req.shots, req.atmosphere);
    if (!prep.ok) return prep;
    const observations = prep.observations;
    const { site, constraints: c } = req;
    const scored = observations.map((obs, i) => ({
      obs,
      timeSigmaS: i === 0 ? 0 : at(req.shots, i).timeSigmaS
    }));
    const scorer = new Scorer(scored, req.atmosphere, site.heightM);
    const offsets = req.shots.map((s, i) => i === 0 ? 0 : s.offsetS * 1e3);
    const geo = new GeoAtOffsets(offsets, req.deltaTOverride);
    const allowed = makeAllowed(c, site.lon);
    const thrAccept = levelThreshold(ACCEPT_LEVEL, scorer.dof);
    const radii = scored.map((_, i) => scorer.searchRadius(i, thrAccept, site.radiusM, RATE_DEG_PER_S));
    const margin = RATE_DEG_PER_S * (COARSE_STEP_S / 2) * RATE_SAFETY_FACTOR;
    const accept = (f) => f.rangeU <= 1 && (scorer.dof === 0 || f.chi2 <= thrAccept);
    const evaluate = (t) => {
      if (!allowed(t)) return { t, fit: null, accepted: false, excluded: true };
      const fit = scorer.fit(geo.at(t), site.lat, site.lon, site.radiusM);
      return { t, fit, accepted: accept(fit), excluded: false };
    };
    const years = [];
    for (let y = c.yearFrom; y <= c.yearTo; y++) years.push(y);
    const heatShare = 0.35;
    const allWindows = [];
    years.forEach((year, yi) => {
      let start = wallToUtc(c.zone, Date.UTC(year, 0, 1), site.lon);
      let end = wallToUtc(c.zone, Date.UTC(year + 1, 0, 1), site.lon) - 1;
      if (c.notBeforeMs !== null) start = Math.max(start, c.notBeforeMs);
      if (c.notAfterMs !== null) end = Math.min(end, c.notAfterMs);
      if (start > end) return;
      const stepMs = COARSE_STEP_S * 1e3;
      const intervals = [];
      let n = 0;
      for (let t = start; t <= end; t += stepMs, n++) {
        const g = geo.at(t);
        let pass = true;
        for (let i = 0; i < g.length && pass; i++) {
          pass = scorer.coarseDistance(i, at(g, i), site.lat, site.lon) <= at(radii, i) + margin;
        }
        if (pass) {
          const a = Math.max(start, t - stepMs);
          const b = Math.min(end, t + stepMs);
          const last2 = intervals[intervals.length - 1];
          if (last2 && a <= last2[1]) last2[1] = b;
          else intervals.push([a, b]);
        }
        if (n % 5e3 === 0) {
          progress?.((yi + (t - start) / (end - start + 1) * 0.6) / years.length * (1 - heatShare), { key: "progress.scanning", vars: { year } });
        }
      }
      const fineMs = FINE_STEP_S * 1e3;
      intervals.forEach(([a, b], k) => {
        const samples = [];
        for (let t = a; t <= b; t += fineMs) samples.push(evaluate(t));
        extractWindows(samples, a <= start, b >= end, scorer.dof).forEach(
          (w) => allWindows.push({ year, w })
        );
        if (k % 20 === 0) {
          progress?.((yi + 0.6 + 0.4 * (k + 1) / intervals.length) / years.length * (1 - heatShare), { key: "progress.refining", vars: { year } });
        }
      });
    });
    const clusters = buildClusters(allWindows);
    const heatmap = buildHeatmap(
      c.yearFrom,
      req,
      scorer,
      geo,
      allowed,
      (f) => progress?.(1 - heatShare + heatShare * f, { key: "progress.heatmap" })
    );
    const warnings = collectWarnings(observations, clusters, req);
    return {
      ok: true,
      result: {
        clusters,
        heatmap,
        observations,
        warnings,
        evaluations: geo.evaluations,
        elapsedMs: Date.now() - t0
      }
    };
  }
  function extractWindows(samples, atStart, atEnd, dof) {
    const out = [];
    const dtS = FINE_STEP_S;
    let i = 0;
    while (i < samples.length) {
      if (!at(samples, i).accepted) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < samples.length && at(samples, j + 1).accepted) j++;
      const run = samples.slice(i, j + 1);
      const before = samples[i - 1];
      const after = samples[j + 1];
      const truncated = (before ? before.excluded : atStart) || (after ? after.excluded : atEnd);
      let best = at(run, 0);
      let logW = -Infinity;
      for (const s of run) {
        const f = s.fit;
        if (f.misfit < best.fit.misfit) best = s;
        logW = logSumExp(logW, f.logL + Math.log(dtS));
      }
      const levels = [];
      if (dof > 0) {
        for (const lv of CONFIDENCE_LEVELS) {
          const thr = levelThreshold(lv, dof);
          const inside = run.filter((s) => s.fit.chi2 <= thr);
          if (inside.length) {
            levels.push({ level: lv, startMs: at(inside, 0).t, endMs: last(inside).t });
          }
        }
      }
      const bf = best.fit;
      out.push({
        startMs: at(run, 0).t,
        endMs: last(run).t,
        bestMs: best.t,
        bestFit: { chi2: bf.chi2, dof: bf.dof, rangeU: bf.rangeU, misfit: bf.misfit, shots: bf.shots },
        levels,
        truncated,
        logWeight: logW
      });
      i = j + 1;
    }
    return out;
  }
  function todDiffMin(a, b) {
    const m = ((a - b) / 6e4 % 1440 + 1440) % 1440;
    return Math.min(m, 1440 - m);
  }
  function morning(w) {
    return at(w.bestFit.shots, 0).solarTimeH < 12;
  }
  function buildClusters(items) {
    items.sort((a, b) => a.w.bestMs - b.w.bestMs);
    const parent = items.map((_, i) => i);
    const find = (i) => {
      const p = at(parent, i);
      if (p === i) return i;
      const root = find(p);
      parent[i] = root;
      return root;
    };
    const maxGapMs = (CLUSTER_MAX_DAY_GAP + 0.5) * 864e5;
    for (let i = 0; i < items.length; i++) {
      const a = at(items, i);
      for (let j = i - 1; j >= 0; j--) {
        const b = at(items, j);
        if (a.w.bestMs - b.w.bestMs > maxGapMs) break;
        if (a.year !== b.year) continue;
        if (morning(a.w) !== morning(b.w)) continue;
        if (todDiffMin(a.w.bestMs, b.w.bestMs) <= CLUSTER_MAX_TOD_GAP_MIN) {
          parent[find(i)] = find(j);
        }
      }
    }
    const groups = /* @__PURE__ */ new Map();
    items.forEach((it, i) => {
      const r = find(i);
      const g = groups.get(r);
      if (g) g.push(it);
      else groups.set(r, [it]);
    });
    const clusters = [];
    let id = 0;
    for (const g of groups.values()) {
      const windows = g.map((x) => x.w);
      let best = at(windows, 0);
      let logW = -Infinity;
      for (const w of windows) {
        if (w.bestFit.misfit < best.bestFit.misfit) best = w;
        logW = logSumExp(logW, w.logWeight);
      }
      clusters.push({
        id: id++,
        year: at(g, 0).year,
        windows,
        firstMs: at(windows, 0).startMs,
        lastMs: last(windows).endMs,
        bestMs: best.bestMs,
        bestFit: best.bestFit,
        probability: logW,
        // normalised below
        truncated: windows.some((w) => w.truncated)
      });
    }
    const byYear = /* @__PURE__ */ new Map();
    for (const cl of clusters) byYear.set(cl.year, [...byYear.get(cl.year) ?? [], cl]);
    for (const list of byYear.values()) {
      const m = Math.max(...list.map((x) => x.probability));
      const sum = list.reduce((a, x) => a + Math.exp(x.probability - m), 0);
      for (const x of list) x.probability = Math.exp(x.probability - m) / sum;
    }
    clusters.sort((a, b) => a.firstMs - b.firstMs);
    clusters.forEach((cl, i) => cl.id = i);
    return clusters;
  }
  function buildHeatmap(year, req, scorer, geo, allowed, progress) {
    const { site, constraints: c } = req;
    const leap = year % 4 === 0 && year % 100 !== 0 || year % 400 === 0;
    const days = leap ? 366 : 365;
    const slotMin = HEATMAP_SLOT_MIN;
    const slots = 1440 / slotMin;
    const values = new Float32Array(days * slots);
    const originWall = Date.UTC(year, 0, 1);
    for (let d = 0; d < days; d++) {
      for (let s = 0; s < slots; s++) {
        const wall = originWall + d * 864e5 + (s + 0.5) * slotMin * 6e4;
        const t = wallToUtc(c.zone, wall, site.lon);
        if (!allowed(t)) {
          values[d * slots + s] = NaN;
          continue;
        }
        values[d * slots + s] = scorer.fit(geo.at(t), site.lat, site.lon, site.radiusM).misfit;
      }
      if (d % 15 === 0) progress(d / days);
    }
    return {
      year,
      originMs: wallToUtc(c.zone, originWall, site.lon),
      days,
      slots,
      slotMin,
      values
    };
  }
  function nearSolstice(ms) {
    const d = new Date(ms);
    const doy = (ms - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5;
    return Math.abs(doy - 171.5) < 12 || Math.abs(doy - 354.5) < 12;
  }
  function collectWarnings(obs, clusters, req) {
    const w = /* @__PURE__ */ new Map();
    const add = (m) => w.set(JSON.stringify(m), m);
    obs.forEach((o, i) => o.warnings.forEach((x) => add({ ...x, shot: at(req.shots, i).label })));
    add({ key: "core.warn.noYear" });
    if (obs.every((o) => !o.azimuth)) {
      add({ key: "core.warn.noAzimuth" });
    }
    if (clusters.length === 0) {
      add({ key: "core.warn.noTime" });
    }
    if (clusters.some((cl) => cl.truncated)) {
      add({ key: "core.warn.truncated" });
    }
    if (clusters.some((cl) => nearSolstice(cl.bestMs))) {
      add({ key: "core.warn.solstice" });
    }
    if (clusters.some((cl) => cl.bestFit.dof > 0 && cl.bestFit.chi2 > levelThreshold(0.9545, cl.bestFit.dof))) {
      add({ key: "core.warn.inconsistent" });
    }
    return [...w.values()];
  }

  // src/core/solveLocation.ts
  var SUBDIVIDE = 5;
  var MAX_CELLS = 25e4;
  var MIN_RES_DEG = 4e-3;
  var KM_PER_DEG = Math.PI / 180 * (EARTH_RADIUS_M / 1e3);
  function solveLocation(req, progress) {
    const t0 = Date.now();
    for (const s of req.shots) {
      if (!Number.isFinite(s.timeMs)) return { ok: false, error: { key: "core.err.timeMissing", shot: s.label } };
      if (!(s.timeSigmaS >= 0)) return { ok: false, error: { key: "core.err.timeTolerance", shot: s.label } };
    }
    const prep = prepareShots(req.shots, req.atmosphere);
    if (!prep.ok) return prep;
    const observations = prep.observations;
    const scored = observations.map((obs, i) => ({ obs, timeSigmaS: at(req.shots, i).timeSigmaS }));
    const scorer = new Scorer(scored, req.atmosphere, req.heightM);
    const geos = req.shots.map(
      (s) => geocentricSun(s.timeMs, req.deltaTOverride ?? deltaTSeconds(decimalYear(s.timeMs)))
    );
    const thr = levelThreshold(ACCEPT_LEVEL, scorer.dof);
    const rate = SUN_MAX_RATE_DEG_PER_MIN / 60;
    const radii = scored.map((_, i) => scorer.searchRadius(i, thr, 0, rate));
    const tightest = Math.min(...radii) / Math.max(Math.sqrt(thr), 1);
    const target = Math.min(1, Math.max(MIN_RES_DEG, tightest / 8));
    const [south, west, north, east] = req.bounds ?? [-90, -180, 90, 180];
    if (!(south < north) || !(west < east)) return { ok: false, error: { key: "core.err.emptyArea" } };
    let evaluations = 0;
    const survives = (lat, lon, size2) => {
      const half = size2 * 0.75;
      for (let i = 0; i < geos.length; i++) {
        evaluations++;
        if (scorer.coarseDistance(i, at(geos, i), lat, lon) > at(radii, i) + half) return false;
      }
      return true;
    };
    let size = 1;
    let cells = [];
    for (let lat = Math.floor(south) + 0.5; lat < north; lat += 1) {
      for (let lon = Math.floor(west) + 0.5; lon < east; lon += 1) {
        if (survives(lat, lon, size)) cells.push([lat, lon]);
      }
    }
    const warnings = [];
    let level = 0;
    while (size > target * 1.001 && cells.length > 0) {
      const next = size / SUBDIVIDE;
      if (cells.length * SUBDIVIDE * SUBDIVIDE > MAX_CELLS * 4) {
        warnings.push({ key: "core.warn.coarse", vars: { size: size.toFixed(2) } });
        break;
      }
      const out2 = [];
      for (const [la, lo] of cells) {
        for (let a = 0; a < SUBDIVIDE; a++) {
          for (let b = 0; b < SUBDIVIDE; b++) {
            const lat = la - size / 2 + (a + 0.5) * next;
            const lon = lo - size / 2 + (b + 0.5) * next;
            if (lat < south || lat > north || lon < west || lon > east) continue;
            if (survives(lat, lon, next)) out2.push([lat, lon]);
          }
        }
      }
      cells = out2;
      size = next;
      progress?.(Math.min(0.8, 0.2 * ++level), { key: "progress.map" });
    }
    const accepted = [];
    for (const [lat, lon] of cells) {
      const fit = scorer.fit(geos, lat, lon, 0);
      evaluations++;
      if (fit.rangeU <= 1 && (scorer.dof === 0 || fit.chi2 <= thr)) accepted.push({ lat, lon, fit });
    }
    progress?.(0.9, { key: "progress.regions" });
    const regions = groupRegions(accepted, size);
    const out = accepted.map((c) => ({ lat: c.lat, lon: c.lon, size, misfit: c.fit.misfit }));
    observations.forEach((o, i) => o.warnings.forEach((x) => warnings.push({ ...x, shot: at(req.shots, i).label })));
    if (accepted.length === 0) {
      warnings.push({ key: "core.warn.noPlace" });
    }
    if (req.shots.length === 1 && !at(observations, 0).azimuth) {
      warnings.push({ key: "core.warn.ring" });
    }
    return {
      ok: true,
      result: {
        cells: out,
        regions,
        resolutionDeg: size,
        observations,
        warnings,
        evaluations,
        elapsedMs: Date.now() - t0
      }
    };
  }
  function groupRegions(cells, size) {
    const key = (lat, lon) => `${Math.floor(lat / size + 1e-6)}|${Math.floor(lon / size + 1e-6)}`;
    const index = /* @__PURE__ */ new Map();
    cells.forEach((c, i) => index.set(key(c.lat, c.lon), i));
    const seen = new Uint8Array(cells.length);
    const regions = [];
    for (let s = 0; s < cells.length; s++) {
      if (seen[s]) continue;
      const stack = [s];
      seen[s] = 1;
      const members = [];
      while (stack.length) {
        const i = stack.pop();
        members.push(i);
        const { lat, lon } = at(cells, i);
        for (let a = -1; a <= 1; a++) {
          for (let b2 = -1; b2 <= 1; b2++) {
            const j = index.get(key(lat + a * size, lon + b2 * size));
            if (j !== void 0 && !seen[j]) {
              seen[j] = 1;
              stack.push(j);
            }
          }
        }
      }
      let best = at(members, 0);
      let s0 = 90, w0 = 180, n0 = -90, e0 = -180, area = 0, logW = -Infinity;
      for (const i of members) {
        const c = at(cells, i);
        if (c.fit.misfit < at(cells, best).fit.misfit) best = i;
        s0 = Math.min(s0, c.lat - size / 2);
        n0 = Math.max(n0, c.lat + size / 2);
        w0 = Math.min(w0, c.lon - size / 2);
        e0 = Math.max(e0, c.lon + size / 2);
        const a = (size * KM_PER_DEG) ** 2 * Math.cos(c.lat * Math.PI / 180);
        area += a;
        const lw = c.fit.logL + Math.log(a);
        logW = logW === -Infinity ? lw : Math.max(logW, lw) + Math.log1p(Math.exp(-Math.abs(logW - lw)));
      }
      const b = at(cells, best);
      regions.push({
        id: 0,
        bestLat: b.lat,
        bestLon: b.lon,
        bestFit: { chi2: b.fit.chi2, dof: b.fit.dof, rangeU: b.fit.rangeU, misfit: b.fit.misfit, shots: b.fit.shots },
        bounds: [s0, w0, n0, e0],
        areaKm2: area,
        probability: 0,
        cellCount: members.length,
        logW
      });
    }
    const m = Math.max(...regions.map((r) => r.logW));
    const sum = regions.reduce((a, r) => a + Math.exp(r.logW - m), 0);
    regions.sort((a, b) => b.logW - a.logW);
    return regions.map(({ logW, ...r }, i) => ({ ...r, id: i, probability: Math.exp(logW - m) / sum }));
  }

  // src/workers/solver.ts
  var post = (m, transfer = []) => self.postMessage(m, transfer);
  self.onmessage = (ev) => {
    const msg = ev.data;
    const progress = (fraction, phase) => post({ id: msg.id, type: "progress", fraction, phase });
    try {
      if (msg.kind === "time") {
        const r = solveTime(msg.req, progress);
        if (!r.ok) post({ id: msg.id, type: "error", error: r.error });
        else post({ id: msg.id, type: "time", result: r.result }, r.result.heatmap ? [r.result.heatmap.values.buffer] : []);
      } else {
        const r = solveLocation(msg.req, progress);
        if (!r.ok) post({ id: msg.id, type: "error", error: r.error });
        else post({ id: msg.id, type: "place", result: r.result });
      }
    } catch (e) {
      post({ id: msg.id, type: "error", error: { key: "core.err.internal", vars: { detail: e instanceof Error ? e.message : String(e) } } });
    }
  };
})();
