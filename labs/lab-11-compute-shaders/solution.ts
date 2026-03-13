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
  return Math.ceil(totalItems / workgroupSize);
}

function computeDispatch3D(
  totalX: number, totalY: number, totalZ: number,
  wgX: number, wgY: number, wgZ: number
): Vec3 {
  return [
    Math.ceil(totalX / wgX),
    Math.ceil(totalY / wgY),
    Math.ceil(totalZ / wgZ),
  ];
}

// ─── Parallel prefix sum (scan) ──────────────────────────────────────────────

/**
 * Prefix sum exclusif : result[i] = sum(input[0..i-1])
 */
function exclusivePrefixSum(input: number[]): number[] {
  const result: number[] = new Array(input.length);
  result[0] = 0;
  for (let i = 1; i < input.length; i++) {
    result[i] = result[i - 1] + input[i - 1];
  }
  return result;
}

/**
 * Prefix sum inclusif : result[i] = sum(input[0..i])
 */
function inclusivePrefixSum(input: number[]): number[] {
  const result: number[] = new Array(input.length);
  result[0] = input[0];
  for (let i = 1; i < input.length; i++) {
    result[i] = result[i - 1] + input[i];
  }
  return result;
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
  return particles.map(p => {
    const newVelocity: Vec3 = [
      p.velocity[0] + gravity[0] * dt,
      p.velocity[1] + gravity[1] * dt,
      p.velocity[2] + gravity[2] * dt,
    ];
    const newPosition: Vec3 = [
      p.position[0] + newVelocity[0] * dt,
      p.position[1] + newVelocity[1] * dt,
      p.position[2] + newVelocity[2] * dt,
    ];
    return { position: newPosition, velocity: newVelocity };
  });
}

// ─── 2D Grid compute (Game of Life) ─────────────────────────────────────────

function gameOfLifeStep(grid: number[][], width: number, height: number): number[][] {
  const next: number[][] = Array.from({ length: height }, () => new Array(width).fill(0));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = (x + dx + width) % width;
          const ny = (y + dy + height) % height;
          neighbors += grid[ny][nx];
        }
      }
      if (grid[y][x] === 1) {
        next[y][x] = (neighbors === 2 || neighbors === 3) ? 1 : 0;
      } else {
        next[y][x] = (neighbors === 3) ? 1 : 0;
      }
    }
  }
  return next;
}

// ─── Histogram computation ───────────────────────────────────────────────────

function computeHistogram(data: number[], numBins: number): number[] {
  const histogram = new Array(numBins).fill(0);
  for (const value of data) {
    if (value >= 0 && value < numBins) {
      histogram[value]++;
    }
  }
  return histogram;
}

// ─── Parallel reduce (sum) ───────────────────────────────────────────────────

function parallelReduceSum(data: number[]): number {
  if (data.length === 0) return 0;
  let current = [...data];
  while (current.length > 1) {
    const next: number[] = [];
    for (let i = 0; i < current.length; i += 2) {
      if (i + 1 < current.length) {
        next.push(current[i] + current[i + 1]);
      } else {
        next.push(current[i]);
      }
    }
    current = next;
  }
  return current[0];
}

function parallelReduceMin(data: number[]): number {
  if (data.length === 0) return Infinity;
  let current = [...data];
  while (current.length > 1) {
    const next: number[] = [];
    for (let i = 0; i < current.length; i += 2) {
      if (i + 1 < current.length) {
        next.push(Math.min(current[i], current[i + 1]));
      } else {
        next.push(current[i]);
      }
    }
    current = next;
  }
  return current[0];
}

// ─── Matrix-vector multiply ──────────────────────────────────────────────────

/**
 * Multiplication matrice NxN par vecteur N.
 * matrix est en row-major : matrix[i * N + j].
 */
function matVecMultiply(matrix: number[], vector: number[], n: number): number[] {
  const result: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) {
      sum += matrix[i * n + j] * vector[j];
    }
    result[i] = sum;
  }
  return result;
}

// ─── Compute bounding box ────────────────────────────────────────────────────

function computeBoundingBox(points: Vec3[]): AABB {
  if (points.length === 0) {
    return { min: [0, 0, 0], max: [0, 0, 0] };
  }
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of points) {
    for (let i = 0; i < 3; i++) {
      if (p[i] < min[i]) min[i] = p[i];
      if (p[i] > max[i]) max[i] = p[i];
    }
  }
  return { min, max };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 11 — Compute shaders');

// --- Dispatch count ---
runner.test('computeDispatchCount — 1000 items, wg=64', () => {
  assertEqual(computeDispatchCount(1000, 64), 16); // ceil(1000/64) = 16
});

runner.test('computeDispatchCount — 256 items, wg=256', () => {
  assertEqual(computeDispatchCount(256, 256), 1);
});

runner.test('computeDispatchCount — 257 items, wg=256', () => {
  assertEqual(computeDispatchCount(257, 256), 2);
});

runner.test('computeDispatch3D — image 1920x1080 avec wg 16x16x1', () => {
  const dispatch = computeDispatch3D(1920, 1080, 1, 16, 16, 1);
  assertEqual(dispatch[0], 120); // 1920/16
  assertEqual(dispatch[1], 68);  // ceil(1080/16) = 67.5 -> 68
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
  assertApprox(result[0].position[0], 1.0);     // 0 + 1*1
  assertApprox(result[0].position[1], 0.19, 0.01); // 10 + (-9.81)*1
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
  // Blinker horizontal → vertical
  const grid = [
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 1, 1, 1, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
  ];
  const next = gameOfLifeStep(grid, 5, 5);
  assertEqual(next[1][2], 1); // Cellule au-dessus du centre
  assertEqual(next[2][2], 1); // Centre reste
  assertEqual(next[3][2], 1); // En dessous
  assertEqual(next[2][1], 0); // Gauche meurt
  assertEqual(next[2][3], 0); // Droite meurt
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
  const m = [1, 2, 3, 4]; // [[1,2],[3,4]]
  const v = [5, 6];
  assertDeepEqual(matVecMultiply(m, v, 2), [17, 39]); // [1*5+2*6, 3*5+4*6]
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
