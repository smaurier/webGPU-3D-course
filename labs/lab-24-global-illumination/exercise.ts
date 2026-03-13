import {
  createTestRunner,
  assertApprox,
  assertTrue,
  assertArrayApprox,
  type Vec2,
  type Vec3,
  type Vec4,
  type Mat4,
  type Color,
} from '../test-utils.ts';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function vec3Dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vec3Scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function vec3Length(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function vec3Normalize(v: Vec3): Vec3 {
  const len = vec3Length(v);
  if (len === 0) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x));
}

// ─── Harmoniques spheriques ──────────────────────────────────────────────────

const SH_C0 = 0.2820947917; // 1 / (2*sqrt(PI))
const SH_C1 = 0.4886025119; // sqrt(3) / (2*sqrt(PI))

function shEncode(direction: Vec3, intensity: number): number[] {
  // TODO: Encoder la direction et l'intensite en coefficients SH (4 coefficients)
  // Band 0: SH_C0 * intensity (constant, independant de la direction)
  // Band 1: SH_C1 * y * intensity, SH_C1 * z * intensity, SH_C1 * x * intensity
  return [0, 0, 0, 0];
}

function shEvaluate(coeffs: number[], direction: Vec3): number {
  // TODO: Reconstruire l'irradiance a partir des coefficients SH et d'une direction
  // Somme de : coeffs[0]*SH_C0 + coeffs[1]*SH_C1*y + coeffs[2]*SH_C1*z + coeffs[3]*SH_C1*x
  return 0;
}

// ─── Light probe grid trilinear interpolation ────────────────────────────────

interface ProbeGrid {
  probes: number[][]; // 8 probes, each has SH coefficients
  min: Vec3;
  max: Vec3;
}

function probeTrilinearInterpolate(grid: ProbeGrid, position: Vec3): number[] {
  // TODO:
  // 1. Calculer tx, ty, tz normalises dans [0, 1] par rapport a la grille
  // 2. Calculer les 8 poids trilineaires
  // 3. Sommer les contributions de chaque sonde ponderees
  // Indices des sondes : 0=000, 1=001, 2=010, 3=011, 4=100, 5=101, 6=110, 7=111
  const numCoeffs = grid.probes[0].length;
  return new Array(numCoeffs).fill(0);
}

// ─── SSR ray march ───────────────────────────────────────────────────────────

interface SSRStep {
  uv: Vec2;
  rayDepth: number;
  hit: boolean;
}

function ssrRayMarchStep(
  startUV: Vec2,
  directionUV: Vec2,
  startDepth: number,
  depthStep: number,
  stepIndex: number,
  depthBuffer: (uv: Vec2) => number
): SSRStep {
  // TODO:
  // 1. Avancer en UV : startUV + directionUV * stepIndex
  // 2. Calculer la profondeur du rayon : startDepth + depthStep * stepIndex
  // 3. Lire le depth buffer a la position UV
  // 4. Hit si rayDepth > sceneDepth et la difference < seuil (0.1)
  return { uv: [0, 0], rayDepth: 0, hit: false };
}

// ─── TAA jitter (Halton sequence) ────────────────────────────────────────────

function halton(index: number, base: number): number {
  // TODO: Generer le n-ieme nombre de la sequence de Halton en base donnee
  // Algorithme : decomposer index en base, inverser les chiffres apres la virgule
  return 0;
}

function taaJitterOffsets(count: number): Vec2[] {
  // TODO: Generer count offsets de jitter via Halton(base 2) et Halton(base 3)
  // Centrer en soustrayant 0.5 : [halton(i,2) - 0.5, halton(i,3) - 0.5]
  return [];
}

// ─── Motion vector ───────────────────────────────────────────────────────────

function mat4MulVec4(m: Mat4, v: Vec4): Vec4 {
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * v[3],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * v[3],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * v[3],
    m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15] * v[3],
  ];
}

function computeMotionVector(worldPos: Vec3, currentMVP: Mat4, previousMVP: Mat4): Vec2 {
  // TODO:
  // 1. Transformer worldPos par currentMVP et previousMVP (coordonnees clip)
  // 2. Diviser par w pour obtenir les NDC
  // 3. Retourner la difference : currentNDC - previousNDC
  return [0, 0];
}

// ─── Neighborhood clamping ───────────────────────────────────────────────────

function neighborhoodClamp(historyColor: Vec3, neighborhood: Vec3[]): Vec3 {
  // TODO:
  // 1. Trouver le min et max de chaque composante dans le voisinage
  // 2. Clamper historyColor dans [min, max] par composante
  return [0, 0, 0];
}

// ─── Velocity buffer reprojection ────────────────────────────────────────────

function reprojectUV(currentUV: Vec2, motionVector: Vec2): Vec2 {
  // TODO: previousUV = currentUV - motionVector
  return [0, 0];
}

// ─── HBAO: horizon angle ─────────────────────────────────────────────────────

function horizonAngle(centerDepth: number, sampleDepths: number[], sampleOffsets: number[]): number {
  // TODO:
  // Pour chaque echantillon : angle = atan2(centerDepth - sampleDepth, |offset|)
  // Retourner l'angle maximum
  return 0;
}

// ─── Bilateral filter ────────────────────────────────────────────────────────

function bilateralFilter(
  centerValue: number,
  centerDepth: number,
  neighbors: { value: number; depth: number; spatialWeight: number }[],
  depthSigma: number
): number {
  // TODO:
  // Pour chaque voisin :
  //   depthWeight = exp(-depthDiff^2 / (2 * sigma^2))
  //   w = spatialWeight * depthWeight
  //   accumuler value * w et w
  // Retourner somme(value*w) / somme(w)
  return 0;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 24 — Global Illumination');

// Spherical harmonics
runner.test('SH encode — band 0 is constant (direction-independent)', () => {
  const coeffs1 = shEncode([0, 0, 1], 1);
  const coeffs2 = shEncode([1, 0, 0], 1);
  assertApprox(coeffs1[0], coeffs2[0], 1e-6);
  assertApprox(coeffs1[0], SH_C0, 1e-6);
});

runner.test('SH encode — band 1 is directional', () => {
  const coeffsZ = shEncode([0, 0, 1], 1);
  const coeffsX = shEncode([1, 0, 0], 1);
  assertApprox(coeffsZ[2], SH_C1, 1e-6);
  assertApprox(coeffsX[3], SH_C1, 1e-6);
});

runner.test('SH evaluate — reconstruct irradiance', () => {
  const dir: Vec3 = vec3Normalize([1, 1, 1]);
  const coeffs = shEncode(dir, 2.0);
  const reconstructed = shEvaluate(coeffs, dir);
  assertTrue(reconstructed > 0, 'Reconstructed irradiance should be positive');
});

// Probe grid interpolation
runner.test('probeTrilinear — center of grid averages all probes', () => {
  const probes = Array.from({ length: 8 }, (_, i) => [i + 1]);
  const grid: ProbeGrid = { probes, min: [0, 0, 0], max: [1, 1, 1] };
  const result = probeTrilinearInterpolate(grid, [0.5, 0.5, 0.5]);
  const expectedAvg = (1 + 2 + 3 + 4 + 5 + 6 + 7 + 8) / 8;
  assertApprox(result[0], expectedAvg, 1e-6);
});

runner.test('probeTrilinear — corner returns exact probe', () => {
  const probes = Array.from({ length: 8 }, (_, i) => [i * 10]);
  const grid: ProbeGrid = { probes, min: [0, 0, 0], max: [1, 1, 1] };
  const result = probeTrilinearInterpolate(grid, [0, 0, 0]);
  assertApprox(result[0], 0, 1e-6);
});

// SSR ray march
runner.test('SSR — detects hit when ray depth exceeds scene depth', () => {
  const depthBuffer = (_uv: Vec2) => 0.5;
  const step = ssrRayMarchStep([0.5, 0.5], [0.01, 0], 0.3, 0.05, 5, depthBuffer);
  assertTrue(step.hit);
});

runner.test('SSR — no hit when ray is above surface', () => {
  const depthBuffer = (_uv: Vec2) => 0.8;
  const step = ssrRayMarchStep([0.5, 0.5], [0.01, 0], 0.3, 0.05, 2, depthBuffer);
  assertTrue(!step.hit);
});

// TAA Halton jitter
runner.test('TAA jitter — Halton(1,2) = 0.5', () => {
  assertApprox(halton(1, 2), 0.5);
});

runner.test('TAA jitter — 8 offsets all in [-0.5, 0.5]', () => {
  const offsets = taaJitterOffsets(8);
  for (const [u, v] of offsets) {
    assertTrue(u >= -0.5 && u <= 0.5, `u=${u} out of range`);
    assertTrue(v >= -0.5 && v <= 0.5, `v=${v} out of range`);
  }
});

// Motion vector
runner.test('motion vector — identity MVP gives zero motion', () => {
  const identity: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const mv = computeMotionVector([0, 0, 0], identity, identity);
  assertApprox(mv[0], 0, 1e-6);
  assertApprox(mv[1], 0, 1e-6);
});

// Neighborhood clamping
runner.test('neighborhoodClamp — clamps to min/max of neighborhood', () => {
  const history: Vec3 = [2.0, -1.0, 0.5];
  const neighborhood: Vec3[] = [
    [0.1, 0.2, 0.3],
    [0.5, 0.6, 0.7],
    [0.3, 0.4, 0.5],
  ];
  const clamped = neighborhoodClamp(history, neighborhood);
  assertApprox(clamped[0], 0.5);
  assertApprox(clamped[1], 0.2);
  assertApprox(clamped[2], 0.5);
});

// Velocity buffer reprojection
runner.test('reprojectUV — current - motion = previous', () => {
  const current: Vec2 = [0.6, 0.4];
  const motion: Vec2 = [0.1, -0.05];
  const prev = reprojectUV(current, motion);
  assertApprox(prev[0], 0.5);
  assertApprox(prev[1], 0.45);
});

// HBAO horizon angle
runner.test('HBAO — horizon angle from depth samples', () => {
  const centerDepth = 1.0;
  const sampleDepths = [0.9, 0.8, 0.95];
  const sampleOffsets = [1, 2, 3];
  const angle = horizonAngle(centerDepth, sampleDepths, sampleOffsets);
  assertTrue(angle > 0, 'Horizon angle should be positive');
  assertTrue(angle < Math.PI / 2, 'Horizon angle should be less than 90°');
});

// Bilateral filter
runner.test('bilateral filter — preserves edges (high depth diff = low weight)', () => {
  const result = bilateralFilter(0.5, 1.0, [
    { value: 0.8, depth: 1.01, spatialWeight: 1 },
    { value: 0.1, depth: 5.0, spatialWeight: 1 },
  ], 0.1);
  assertTrue(result > 0.6, `Expected result > 0.6, got ${result}`);
});

runner.test('bilateral filter — uniform depth averages by spatial weight', () => {
  const result = bilateralFilter(0.5, 1.0, [
    { value: 0.2, depth: 1.0, spatialWeight: 1 },
    { value: 0.8, depth: 1.0, spatialWeight: 1 },
  ], 0.1);
  assertApprox(result, 0.5, 0.01);
});

runner.run();
