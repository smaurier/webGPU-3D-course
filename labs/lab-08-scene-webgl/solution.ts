import {
  createTestRunner,
  assertEqual,
  assertDeepEqual,
  assertTrue,
  assertFalse,
  assertApprox,
  assertArrayApprox,
  type Vec3,
  type Vec4,
  type Mat4,
} from '../test-utils.ts';

// ─── Orbit camera ────────────────────────────────────────────────────────────

/**
 * Convertit des coordonnees spheriques en position cartesienne.
 * theta = angle horizontal (autour de Y), phi = angle vertical (depuis +Y)
 */
function orbitCamera(radius: number, theta: number, phi: number): Vec3 {
  return [
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}

// ─── Delta time ──────────────────────────────────────────────────────────────

function computeDeltaTime(previousMs: number, currentMs: number): number {
  return (currentMs - previousMs) / 1000;
}

// ─── Scene graph node ────────────────────────────────────────────────────────

function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const out: number[] = new Array(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[k * 4 + row] * b[col * 4 + k];
      }
      out[col * 4 + row] = sum;
    }
  }
  return out as unknown as Mat4;
}

function mat4Identity(): Mat4 {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

interface SceneNode {
  localMatrix: Mat4;
  children: SceneNode[];
}

function computeWorldMatrix(node: SceneNode, parentWorld: Mat4): Mat4 {
  return mat4Multiply(parentWorld, node.localMatrix);
}

function computeWorldMatrices(node: SceneNode, parentWorld: Mat4): Map<SceneNode, Mat4> {
  const result = new Map<SceneNode, Mat4>();
  const world = computeWorldMatrix(node, parentWorld);
  result.set(node, world);
  for (const child of node.children) {
    const childResults = computeWorldMatrices(child, world);
    for (const [n, m] of childResults) {
      result.set(n, m);
    }
  }
  return result;
}

// ─── Normal matrix ───────────────────────────────────────────────────────────

/**
 * Calcule la matrice de normales (transposee de l'inverse de la sous-matrice 3x3).
 * Retourne les 9 elements en row-major order (pour simplifier les tests).
 */
function buildNormalMatrix(model: Mat4): number[] {
  // Extraire la sous-matrice 3x3 (column-major dans Mat4)
  const a = model[0], b = model[1], c = model[2];
  const d = model[4], e = model[5], f = model[6];
  const g = model[8], h = model[9], i = model[10];

  const det = a * (e * i - f * h) - d * (b * i - c * h) + g * (b * f - c * e);
  const invDet = 1.0 / det;

  // Inverse de la 3x3
  const inv00 = (e * i - f * h) * invDet;
  const inv01 = (c * h - b * i) * invDet;
  const inv02 = (b * f - c * e) * invDet;
  const inv10 = (f * g - d * i) * invDet;
  const inv11 = (a * i - c * g) * invDet;
  const inv12 = (c * d - a * f) * invDet;
  const inv20 = (d * h - e * g) * invDet;
  const inv21 = (b * g - a * h) * invDet;
  const inv22 = (a * e - b * d) * invDet;

  // Transposee de l'inverse (row-major output)
  return [
    inv00, inv10, inv20,
    inv01, inv11, inv21,
    inv02, inv12, inv22,
  ];
}

// ─── Sort objects by distance (back-to-front) ────────────────────────────────

interface RenderObject {
  id: string;
  position: Vec3;
}

function sortBackToFront(objects: RenderObject[], cameraPos: Vec3): RenderObject[] {
  return [...objects].sort((a, b) => {
    const da = distanceSq(a.position, cameraPos);
    const db = distanceSq(b.position, cameraPos);
    return db - da; // Plus loin d'abord
  });
}

function distanceSq(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

// ─── Frustum-sphere intersection ─────────────────────────────────────────────

interface Plane {
  normal: Vec3;
  distance: number;
}

interface Sphere {
  center: Vec3;
  radius: number;
}

function frustumSphereIntersect(planes: Plane[], sphere: Sphere): boolean {
  for (const plane of planes) {
    const dist =
      plane.normal[0] * sphere.center[0] +
      plane.normal[1] * sphere.center[1] +
      plane.normal[2] * sphere.center[2] +
      plane.distance;
    if (dist < -sphere.radius) {
      return false; // Entierement hors du plan
    }
  }
  return true;
}

// ─── Skybox cube vertices ────────────────────────────────────────────────────

function generateSkyboxCube(size: number): { positions: Vec3[]; indices: number[] } {
  const s = size / 2;
  const positions: Vec3[] = [
    [-s, -s, -s], // 0
    [ s, -s, -s], // 1
    [ s,  s, -s], // 2
    [-s,  s, -s], // 3
    [-s, -s,  s], // 4
    [ s, -s,  s], // 5
    [ s,  s,  s], // 6
    [-s,  s,  s], // 7
  ];

  // 6 faces x 2 triangles x 3 indices = 36 indices
  // Faces orientees vers l'interieur (winding inversee pour skybox)
  const indices = [
    // Front (z+) — vu de l'interieur
    4, 6, 5, 4, 7, 6,
    // Back (z-)
    1, 3, 0, 1, 2, 3,
    // Top (y+)
    3, 6, 7, 3, 2, 6,
    // Bottom (y-)
    4, 1, 0, 4, 5, 1,
    // Right (x+)
    5, 2, 1, 5, 6, 2,
    // Left (x-)
    0, 7, 4, 0, 3, 7,
  ];

  return { positions, indices };
}

// ─── Merge geometries ────────────────────────────────────────────────────────

interface Geometry {
  positions: number[]; // flat [x,y,z, x,y,z, ...]
  indices: number[];
}

function mergeGeometries(geometries: Geometry[]): Geometry {
  const mergedPositions: number[] = [];
  const mergedIndices: number[] = [];
  let vertexOffset = 0;

  for (const geo of geometries) {
    mergedPositions.push(...geo.positions);
    for (const idx of geo.indices) {
      mergedIndices.push(idx + vertexOffset);
    }
    vertexOffset += geo.positions.length / 3;
  }

  return { positions: mergedPositions, indices: mergedIndices };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 08 — Scene graph et WebGL');

// --- Orbit camera ---
runner.test('orbitCamera — rayon 5, angles nuls = pole +Y', () => {
  // phi=0 => y=r, x=0, z=0
  const pos = orbitCamera(5, 0, 0);
  assertApprox(pos[1], 5);
  assertApprox(pos[0], 0);
  assertApprox(pos[2], 0);
});

runner.test('orbitCamera — phi=PI/2 dans le plan XZ', () => {
  const pos = orbitCamera(10, 0, Math.PI / 2);
  assertApprox(pos[0], 10);
  assertApprox(pos[1], 0, 1e-5);
  assertApprox(pos[2], 0, 1e-5);
});

runner.test('orbitCamera — theta=PI/2, phi=PI/2 donne Z+', () => {
  const pos = orbitCamera(10, Math.PI / 2, Math.PI / 2);
  assertApprox(pos[0], 0, 1e-5);
  assertApprox(pos[1], 0, 1e-5);
  assertApprox(pos[2], 10);
});

// --- Delta time ---
runner.test('computeDeltaTime — 16.67ms = ~0.01667s', () => {
  assertApprox(computeDeltaTime(0, 16.67), 0.01667, 1e-4);
});

runner.test('computeDeltaTime — 1 seconde', () => {
  assertApprox(computeDeltaTime(1000, 2000), 1.0);
});

// --- Scene graph ---
runner.test('computeWorldMatrix — identite parent', () => {
  const translation: Mat4 = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    5, 3, 0, 1,
  ];
  const node: SceneNode = { localMatrix: translation, children: [] };
  const world = computeWorldMatrix(node, mat4Identity());
  assertArrayApprox([...world], [...translation]);
});

runner.test('computeWorldMatrices — parent-enfant', () => {
  const parentLocal: Mat4 = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    10, 0, 0, 1,
  ];
  const childLocal: Mat4 = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 5, 0, 1,
  ];
  const child: SceneNode = { localMatrix: childLocal, children: [] };
  const parent: SceneNode = { localMatrix: parentLocal, children: [child] };
  const matrices = computeWorldMatrices(parent, mat4Identity());
  const childWorld = matrices.get(child)!;
  // Translation cumulee : x=10, y=5
  assertApprox(childWorld[12], 10);
  assertApprox(childWorld[13], 5);
});

// --- Normal matrix ---
runner.test('buildNormalMatrix — identite donne identite 3x3', () => {
  const nm = buildNormalMatrix(mat4Identity());
  assertArrayApprox(nm, [1, 0, 0, 0, 1, 0, 0, 0, 1]);
});

runner.test('buildNormalMatrix — echelle uniforme', () => {
  const scale: Mat4 = [
    2, 0, 0, 0,
    0, 2, 0, 0,
    0, 0, 2, 0,
    0, 0, 0, 1,
  ];
  const nm = buildNormalMatrix(scale);
  // Inverse de scale 2 = 0.5, transposee = meme chose
  assertArrayApprox(nm, [0.5, 0, 0, 0, 0.5, 0, 0, 0, 0.5]);
});

// --- Sort back-to-front ---
runner.test('sortBackToFront — tri du plus loin au plus proche', () => {
  const objects: RenderObject[] = [
    { id: 'A', position: [0, 0, 1] },
    { id: 'B', position: [0, 0, 10] },
    { id: 'C', position: [0, 0, 5] },
  ];
  const sorted = sortBackToFront(objects, [0, 0, 0]);
  assertEqual(sorted[0].id, 'B');
  assertEqual(sorted[1].id, 'C');
  assertEqual(sorted[2].id, 'A');
});

// --- Frustum-sphere intersection ---
runner.test('frustumSphereIntersect — sphere a l interieur', () => {
  const planes: Plane[] = [
    { normal: [1, 0, 0], distance: 10 },   // x >= -10
    { normal: [-1, 0, 0], distance: 10 },  // x <= 10
    { normal: [0, 1, 0], distance: 10 },
    { normal: [0, -1, 0], distance: 10 },
    { normal: [0, 0, 1], distance: 10 },
    { normal: [0, 0, -1], distance: 10 },
  ];
  assertTrue(frustumSphereIntersect(planes, { center: [0, 0, 0], radius: 1 }));
});

runner.test('frustumSphereIntersect — sphere a l exterieur', () => {
  const planes: Plane[] = [
    { normal: [1, 0, 0], distance: 0 }, // plan x >= 0
  ];
  assertFalse(frustumSphereIntersect(planes, { center: [-5, 0, 0], radius: 1 }));
});

// --- Skybox cube ---
runner.test('generateSkyboxCube — 8 sommets, 36 indices', () => {
  const { positions, indices } = generateSkyboxCube(2);
  assertEqual(positions.length, 8);
  assertEqual(indices.length, 36);
});

runner.test('generateSkyboxCube — sommets dans [-1,1]', () => {
  const { positions } = generateSkyboxCube(2);
  for (const p of positions) {
    assertTrue(Math.abs(p[0]) <= 1);
    assertTrue(Math.abs(p[1]) <= 1);
    assertTrue(Math.abs(p[2]) <= 1);
  }
});

// --- Merge geometries ---
runner.test('mergeGeometries — deux triangles', () => {
  const g1: Geometry = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] };
  const g2: Geometry = { positions: [2, 0, 0, 3, 0, 0, 2, 1, 0], indices: [0, 1, 2] };
  const merged = mergeGeometries([g1, g2]);
  assertEqual(merged.positions.length, 18);
  assertEqual(merged.indices.length, 6);
  // Les indices du 2e triangle sont decales de 3 (3 vertices dans g1)
  assertDeepEqual(merged.indices, [0, 1, 2, 3, 4, 5]);
});

runner.test('mergeGeometries — trois geometries', () => {
  const g1: Geometry = { positions: [0, 0, 0, 1, 0, 0], indices: [0, 1] };
  const g2: Geometry = { positions: [2, 0, 0], indices: [0] };
  const g3: Geometry = { positions: [3, 0, 0, 4, 0, 0, 5, 0, 0], indices: [0, 1, 2] };
  const merged = mergeGeometries([g1, g2, g3]);
  assertDeepEqual(merged.indices, [0, 1, 2, 3, 4, 5]);
});

runner.run();
