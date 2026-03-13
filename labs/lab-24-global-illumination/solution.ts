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

// SH coefficients: [L00, L1_-1, L10, L11] = 4 floats per channel (band 0 + band 1)
const SH_C0 = 0.2820947917; // 1 / (2*sqrt(PI))
const SH_C1 = 0.4886025119; // sqrt(3) / (2*sqrt(PI))

function shEncode(direction: Vec3, intensity: number): number[] {
  const [x, y, z] = direction;
  return [
    SH_C0 * intensity,            // band 0 — constant
    SH_C1 * y * intensity,        // band 1, m=-1
    SH_C1 * z * intensity,        // band 1, m=0
    SH_C1 * x * intensity,        // band 1, m=1
  ];
}

function shEvaluate(coeffs: number[], direction: Vec3): number {
  const [x, y, z] = direction;
  return (
    coeffs[0] * SH_C0 +
    coeffs[1] * SH_C1 * y +
    coeffs[2] * SH_C1 * z +
    coeffs[3] * SH_C1 * x
  );
}

// ─── Light probe grid trilinear interpolation ────────────────────────────────

interface ProbeGrid {
  probes: number[][]; // 8 probes, each has SH coefficients
  min: Vec3;
  max: Vec3;
}

function probeTrilinearInterpolate(grid: ProbeGrid, position: Vec3): number[] {
  const tx = clamp((position[0] - grid.min[0]) / (grid.max[0] - grid.min[0]), 0, 1);
  const ty = clamp((position[1] - grid.min[1]) / (grid.max[1] - grid.min[1]), 0, 1);
  const tz = clamp((position[2] - grid.min[2]) / (grid.max[2] - grid.min[2]), 0, 1);

  // 8 corner probes indexed as: [x][y][z] -> 0=000, 1=001, 2=010, 3=011, 4=100, 5=101, 6=110, 7=111
  const numCoeffs = grid.probes[0].length;
  const result = new Array(numCoeffs).fill(0);

  const weights = [
    (1 - tx) * (1 - ty) * (1 - tz), // 000
    (1 - tx) * (1 - ty) * tz,       // 001
    (1 - tx) * ty * (1 - tz),       // 010
    (1 - tx) * ty * tz,             // 011
    tx * (1 - ty) * (1 - tz),       // 100
    tx * (1 - ty) * tz,             // 101
    tx * ty * (1 - tz),             // 110
    tx * ty * tz,                   // 111
  ];

  for (let p = 0; p < 8; p++) {
    for (let c = 0; c < numCoeffs; c++) {
      result[c] += grid.probes[p][c] * weights[p];
    }
  }

  return result;
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
  const uv: Vec2 = [
    startUV[0] + directionUV[0] * stepIndex,
    startUV[1] + directionUV[1] * stepIndex,
  ];
  const rayDepth = startDepth + depthStep * stepIndex;
  const sceneDepth = depthBuffer(uv);
  const hit = rayDepth > sceneDepth && (rayDepth - sceneDepth) < 0.1;

  return { uv, rayDepth, hit };
}

// ─── TAA jitter (Halton sequence) ────────────────────────────────────────────

function halton(index: number, base: number): number {
  let result = 0;
  let f = 1 / base;
  let i = index;
  while (i > 0) {
    result += f * (i % base);
    i = Math.floor(i / base);
    f /= base;
  }
  return result;
}

function taaJitterOffsets(count: number): Vec2[] {
  const offsets: Vec2[] = [];
  for (let i = 1; i <= count; i++) {
    offsets.push([halton(i, 2) - 0.5, halton(i, 3) - 0.5]);
  }
  return offsets;
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
  const curClip = mat4MulVec4(currentMVP, [worldPos[0], worldPos[1], worldPos[2], 1]);
  const prevClip = mat4MulVec4(previousMVP, [worldPos[0], worldPos[1], worldPos[2], 1]);

  const curNDC: Vec2 = [curClip[0] / curClip[3], curClip[1] / curClip[3]];
  const prevNDC: Vec2 = [prevClip[0] / prevClip[3], prevClip[1] / prevClip[3]];

  return [curNDC[0] - prevNDC[0], curNDC[1] - prevNDC[1]];
}

// ─── Neighborhood clamping ───────────────────────────────────────────────────

function neighborhoodClamp(historyColor: Vec3, neighborhood: Vec3[]): Vec3 {
  let min: Vec3 = [Infinity, Infinity, Infinity];
  let max: Vec3 = [-Infinity, -Infinity, -Infinity];

  for (const c of neighborhood) {
    for (let i = 0; i < 3; i++) {
      if (c[i] < min[i]) min[i] = c[i];
      if (c[i] > max[i]) max[i] = c[i];
    }
  }

  return [
    clamp(historyColor[0], min[0], max[0]),
    clamp(historyColor[1], min[1], max[1]),
    clamp(historyColor[2], min[2], max[2]),
  ];
}

// ─── Velocity buffer reprojection ────────────────────────────────────────────

function reprojectUV(currentUV: Vec2, motionVector: Vec2): Vec2 {
  return [currentUV[0] - motionVector[0], currentUV[1] - motionVector[1]];
}

// ─── HBAO: horizon angle ─────────────────────────────────────────────────────

function horizonAngle(centerDepth: number, sampleDepths: number[], sampleOffsets: number[]): number {
  let maxAngle = 0;
  for (let i = 0; i < sampleDepths.length; i++) {
    const dz = centerDepth - sampleDepths[i];
    const dx = sampleOffsets[i];
    const angle = Math.atan2(dz, Math.abs(dx));
    if (angle > maxAngle) maxAngle = angle;
  }
  return maxAngle;
}

// ─── Bilateral filter ────────────────────────────────────────────────────────

function bilateralFilter(
  centerValue: number,
  centerDepth: number,
  neighbors: { value: number; depth: number; spatialWeight: number }[],
  depthSigma: number
): number {
  let weightSum = 0;
  let valueSum = 0;

  for (const n of neighbors) {
    const depthDiff = Math.abs(n.depth - centerDepth);
    const depthWeight = Math.exp(-depthDiff * depthDiff / (2 * depthSigma * depthSigma));
    const w = n.spatialWeight * depthWeight;
    valueSum += n.value * w;
    weightSum += w;
  }

  return weightSum > 0 ? valueSum / weightSum : centerValue;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 24 — Global Illumination');

// Spherical harmonics
runner.test('SH encode — band 0 is constant (direction-independent)', () => {
  const coeffs1 = shEncode([0, 0, 1], 1);
  const coeffs2 = shEncode([1, 0, 0], 1);
  assertApprox(coeffs1[0], coeffs2[0], 1e-6); // band 0 same for any direction
  assertApprox(coeffs1[0], SH_C0, 1e-6);
});

runner.test('SH encode — band 1 is directional', () => {
  const coeffsZ = shEncode([0, 0, 1], 1);
  const coeffsX = shEncode([1, 0, 0], 1);
  assertApprox(coeffsZ[2], SH_C1, 1e-6);    // L10 for +Z
  assertApprox(coeffsX[3], SH_C1, 1e-6);    // L11 for +X
});

runner.test('SH evaluate — reconstruct irradiance', () => {
  const dir: Vec3 = vec3Normalize([1, 1, 1]);
  const coeffs = shEncode(dir, 2.0);
  const reconstructed = shEvaluate(coeffs, dir);
  // For the same direction, reconstructed should be close to the encoded intensity
  assertTrue(reconstructed > 0, 'Reconstructed irradiance should be positive');
});

// Probe grid interpolation
runner.test('probeTrilinear — center of grid averages all probes', () => {
  const probes = Array.from({ length: 8 }, (_, i) => [i + 1]); // [1], [2], ..., [8]
  const grid: ProbeGrid = { probes, min: [0, 0, 0], max: [1, 1, 1] };
  const result = probeTrilinearInterpolate(grid, [0.5, 0.5, 0.5]);
  const expectedAvg = (1 + 2 + 3 + 4 + 5 + 6 + 7 + 8) / 8;
  assertApprox(result[0], expectedAvg, 1e-6);
});

runner.test('probeTrilinear — corner returns exact probe', () => {
  const probes = Array.from({ length: 8 }, (_, i) => [i * 10]);
  const grid: ProbeGrid = { probes, min: [0, 0, 0], max: [1, 1, 1] };
  const result = probeTrilinearInterpolate(grid, [0, 0, 0]);
  assertApprox(result[0], 0, 1e-6); // probe[0]
});

// SSR ray march
runner.test('SSR — detects hit when ray depth exceeds scene depth', () => {
  const depthBuffer = (_uv: Vec2) => 0.5;
  const step = ssrRayMarchStep([0.5, 0.5], [0.01, 0], 0.3, 0.05, 5, depthBuffer);
  // rayDepth = 0.3 + 0.05*5 = 0.55 > 0.5 and 0.55-0.5=0.05 < 0.1
  assertTrue(step.hit);
});

runner.test('SSR — no hit when ray is above surface', () => {
  const depthBuffer = (_uv: Vec2) => 0.8;
  const step = ssrRayMarchStep([0.5, 0.5], [0.01, 0], 0.3, 0.05, 2, depthBuffer);
  // rayDepth = 0.3 + 0.1 = 0.4 < 0.8
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
  assertApprox(clamped[0], 0.5);  // clamped from 2.0 to max 0.5
  assertApprox(clamped[1], 0.2);  // clamped from -1.0 to min 0.2
  assertApprox(clamped[2], 0.5);  // 0.5 is within [0.3, 0.7]
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
  const sampleDepths = [0.9, 0.8, 0.95]; // closer to camera = smaller depth
  const sampleOffsets = [1, 2, 3];
  const angle = horizonAngle(centerDepth, sampleDepths, sampleOffsets);
  assertTrue(angle > 0, 'Horizon angle should be positive');
  assertTrue(angle < Math.PI / 2, 'Horizon angle should be less than 90°');
});

// Bilateral filter
runner.test('bilateral filter — preserves edges (high depth diff = low weight)', () => {
  const result = bilateralFilter(0.5, 1.0, [
    { value: 0.8, depth: 1.01, spatialWeight: 1 },  // similar depth — high weight
    { value: 0.1, depth: 5.0, spatialWeight: 1 },    // very different depth — low weight
  ], 0.1);
  // Result should be much closer to 0.8 than to 0.1
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
