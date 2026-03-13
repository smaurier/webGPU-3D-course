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
  // TODO: x = r * sin(phi) * cos(theta)
  //       y = r * cos(phi)
  //       z = r * sin(phi) * sin(theta)
  return [0, 0, 0];
}

// ─── Delta time ──────────────────────────────────────────────────────────────

function computeDeltaTime(previousMs: number, currentMs: number): number {
  // TODO: Retourner la difference en secondes
  return 0;
}

// ─── Scene graph node ────────────────────────────────────────────────────────

function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  // TODO: Multiplier deux matrices 4x4 en column-major order
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
  // TODO: Retourner parentWorld * node.localMatrix
  return mat4Identity();
}

function computeWorldMatrices(node: SceneNode, parentWorld: Mat4): Map<SceneNode, Mat4> {
  // TODO: Calculer recursivement la matrice monde de chaque noeud
  // Retourner une Map associant chaque noeud a sa matrice monde
  return new Map();
}

// ─── Normal matrix ───────────────────────────────────────────────────────────

/**
 * Calcule la matrice de normales (transposee de l'inverse de la sous-matrice 3x3).
 * Retourne les 9 elements en row-major order.
 */
function buildNormalMatrix(model: Mat4): number[] {
  // TODO: Extraire la sous-matrice 3x3, calculer l'inverse, transposer
  return [0, 0, 0, 0, 0, 0, 0, 0, 0];
}

// ─── Sort objects by distance (back-to-front) ────────────────────────────────

interface RenderObject {
  id: string;
  position: Vec3;
}

function sortBackToFront(objects: RenderObject[], cameraPos: Vec3): RenderObject[] {
  // TODO: Trier les objets du plus eloigne au plus proche de la camera
  return [];
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
  // TODO: Pour chaque plan, calculer la distance signee du centre de la sphere.
  // Si dist < -radius pour un plan, la sphere est entierement dehors.
  return false;
}

// ─── Skybox cube vertices ────────────────────────────────────────────────────

function generateSkyboxCube(size: number): { positions: Vec3[]; indices: number[] } {
  // TODO: Generer 8 sommets et 36 indices pour un cube de taille `size`
  // Les faces doivent etre orientees vers l'interieur (skybox)
  return { positions: [], indices: [] };
}

// ─── Merge geometries ────────────────────────────────────────────────────────

interface Geometry {
  positions: number[]; // flat [x,y,z, x,y,z, ...]
  indices: number[];
}

function mergeGeometries(geometries: Geometry[]): Geometry {
  // TODO: Concatener les positions, decaler les indices par le nombre de sommets precedents
  return { positions: [], indices: [] };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 08 — Scene graph et WebGL');

// --- Orbit camera ---
runner.test('orbitCamera — rayon 5, angles nuls = pole +Y', () => {
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
    { normal: [1, 0, 0], distance: 10 },
    { normal: [-1, 0, 0], distance: 10 },
    { normal: [0, 1, 0], distance: 10 },
    { normal: [0, -1, 0], distance: 10 },
    { normal: [0, 0, 1], distance: 10 },
    { normal: [0, 0, -1], distance: 10 },
  ];
  assertTrue(frustumSphereIntersect(planes, { center: [0, 0, 0], radius: 1 }));
});

runner.test('frustumSphereIntersect — sphere a l exterieur', () => {
  const planes: Plane[] = [
    { normal: [1, 0, 0], distance: 0 },
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
