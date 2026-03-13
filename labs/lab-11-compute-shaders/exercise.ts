import {
  createTestRunner,
  assertEqual,
  assertDeepEqual,
  assertTrue,
  assertApprox,
  assertArrayApprox,
  type Vec3,
  type AABB,
} from '../test-utils.ts';

// ─── Compute workgroup dispatch count ────────────────────────────────────────

function computeDispatchCount(totalItems: number, workgroupSize: number): number {
  // TODO: ceil(totalItems / workgroupSize)
  return 0;
}

function computeDispatch3D(
  totalX: number, totalY: number, totalZ: number,
  wgX: number, wgY: number, wgZ: number
): Vec3 {
  // TODO: Appliquer computeDispatchCount sur chaque dimension
  return [0, 0, 0];
}

// ─── Parallel prefix sum (scan) ──────────────────────────────────────────────

function exclusivePrefixSum(input: number[]): number[] {
  // TODO: result[0] = 0, result[i] = result[i-1] + input[i-1]
  return [];
}

function inclusivePrefixSum(input: number[]): number[] {
  // TODO: result[0] = input[0], result[i] = result[i-1] + input[i]
  return [];
}

// ─── Particle system step ────────────────────────────────────────────────────

interface Particle {
  position: Vec3;
  velocity: Vec3;
}

function simulateParticleStep(
  particles: Particle[],
  gravity: Vec3,
  dt: number
): Particle[] {
  // TODO: Pour chaque particule :
  //   newVelocity = velocity + gravity * dt
  //   newPosition = position + newVelocity * dt
  return [];
}

// ─── 2D Grid compute (Game of Life) ─────────────────────────────────────────

function gameOfLifeStep(grid: number[][], width: number, height: number): number[][] {
  // TODO: Pour chaque cellule, compter les 8 voisins (wrapping toroidal).
  //   Vivante + 2 ou 3 voisins → vit
  //   Morte + 3 voisins → nait
  //   Sinon → meurt
  return [];
}

// ─── Histogram computation ───────────────────────────────────────────────────

function computeHistogram(data: number[], numBins: number): number[] {
  // TODO: Compter les occurrences de chaque valeur [0, numBins)
  return [];
}

// ─── Parallel reduce (sum) ───────────────────────────────────────────────────

function parallelReduceSum(data: number[]): number {
  // TODO: Reduire par paires successives jusqu'a une seule valeur
  return 0;
}

function parallelReduceMin(data: number[]): number {
  // TODO: Meme principe mais avec Math.min
  return 0;
}

// ─── Matrix-vector multiply ──────────────────────────────────────────────────

function matVecMultiply(matrix: number[], vector: number[], n: number): number[] {
  // TODO: result[i] = sum(matrix[i*n + j] * vector[j]) pour j de 0 a n-1
  return [];
}

// ─── Compute bounding box ────────────────────────────────────────────────────

function computeBoundingBox(points: Vec3[]): AABB {
  // TODO: Trouver min/max sur chaque axe
  return { min: [0, 0, 0], max: [0, 0, 0] };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 11 — Compute shaders');

// --- Dispatch count ---
runner.test('computeDispatchCount — 1000 items, wg=64', () => {
  assertEqual(computeDispatchCount(1000, 64), 16);
});

runner.test('computeDispatchCount — 256 items, wg=256', () => {
  assertEqual(computeDispatchCount(256, 256), 1);
});

runner.test('computeDispatchCount — 257 items, wg=256', () => {
  assertEqual(computeDispatchCount(257, 256), 2);
});

runner.test('computeDispatch3D — image 1920x1080 avec wg 16x16x1', () => {
  const dispatch = computeDispatch3D(1920, 1080, 1, 16, 16, 1);
  assertEqual(dispatch[0], 120);
  assertEqual(dispatch[1], 68);
  assertEqual(dispatch[2], 1);
});

// --- Prefix sum ---
runner.test('exclusivePrefixSum — [1,2,3,4] = [0,1,3,6]', () => {
  assertDeepEqual(exclusivePrefixSum([1, 2, 3, 4]), [0, 1, 3, 6]);
});

runner.test('inclusivePrefixSum — [1,2,3,4] = [1,3,6,10]', () => {
  assertDeepEqual(inclusivePrefixSum([1, 2, 3, 4]), [1, 3, 6, 10]);
});

// --- Particle system ---
runner.test('simulateParticleStep — gravite appliquee', () => {
  const particles: Particle[] = [
    { position: [0, 10, 0], velocity: [1, 0, 0] },
  ];
  const gravity: Vec3 = [0, -9.81, 0];
  const dt = 1.0;
  const result = simulateParticleStep(particles, gravity, dt);
  assertApprox(result[0].velocity[1], -9.81);
  assertApprox(result[0].position[0], 1.0);
  assertApprox(result[0].position[1], 0.19, 0.01);
});

runner.test('simulateParticleStep — dt=0 ne change rien', () => {
  const particles: Particle[] = [
    { position: [5, 5, 5], velocity: [1, 2, 3] },
  ];
  const result = simulateParticleStep(particles, [0, -10, 0], 0);
  assertArrayApprox(result[0].position, [5, 5, 5]);
  assertArrayApprox(result[0].velocity, [1, 2, 3]);
});

// --- Game of Life ---
runner.test('gameOfLifeStep — blinker oscille', () => {
  const grid = [
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 1, 1, 1, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
  ];
  const next = gameOfLifeStep(grid, 5, 5);
  assertEqual(next[1][2], 1);
  assertEqual(next[2][2], 1);
  assertEqual(next[3][2], 1);
  assertEqual(next[2][1], 0);
  assertEqual(next[2][3], 0);
});

runner.test('gameOfLifeStep — block stable', () => {
  const grid = [
    [0, 0, 0, 0],
    [0, 1, 1, 0],
    [0, 1, 1, 0],
    [0, 0, 0, 0],
  ];
  const next = gameOfLifeStep(grid, 4, 4);
  assertEqual(next[1][1], 1);
  assertEqual(next[1][2], 1);
  assertEqual(next[2][1], 1);
  assertEqual(next[2][2], 1);
});

// --- Histogram ---
runner.test('computeHistogram — distribution simple', () => {
  const data = [0, 1, 1, 2, 2, 2, 3, 3, 3, 3];
  const hist = computeHistogram(data, 4);
  assertDeepEqual(hist, [1, 2, 3, 4]);
});

runner.test('computeHistogram — tableau vide', () => {
  assertDeepEqual(computeHistogram([], 4), [0, 0, 0, 0]);
});

// --- Parallel reduce ---
runner.test('parallelReduceSum — [1,2,3,4,5,6,7,8] = 36', () => {
  assertEqual(parallelReduceSum([1, 2, 3, 4, 5, 6, 7, 8]), 36);
});

runner.test('parallelReduceSum — nombre impair d elements', () => {
  assertEqual(parallelReduceSum([1, 2, 3, 4, 5]), 15);
});

runner.test('parallelReduceMin — [5, 3, 8, 1, 4] = 1', () => {
  assertEqual(parallelReduceMin([5, 3, 8, 1, 4]), 1);
});

// --- Matrix-vector multiply ---
runner.test('matVecMultiply — identite 3x3', () => {
  const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const v = [2, 3, 4];
  assertDeepEqual(matVecMultiply(identity, v, 3), [2, 3, 4]);
});

runner.test('matVecMultiply — matrice 2x2', () => {
  const m = [1, 2, 3, 4];
  const v = [5, 6];
  assertDeepEqual(matVecMultiply(m, v, 2), [17, 39]);
});

// --- Bounding box ---
runner.test('computeBoundingBox — triangle', () => {
  const points: Vec3[] = [[0, 0, 0], [5, 10, 3], [-2, 4, 8]];
  const aabb = computeBoundingBox(points);
  assertDeepEqual(aabb.min, [-2, 0, 0]);
  assertDeepEqual(aabb.max, [5, 10, 8]);
});

runner.test('computeBoundingBox — un seul point', () => {
  const aabb = computeBoundingBox([[3, 4, 5]]);
  assertDeepEqual(aabb.min, [3, 4, 5]);
  assertDeepEqual(aabb.max, [3, 4, 5]);
});

runner.run();
