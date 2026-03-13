import {
  createTestRunner,
  assertApprox,
  assertTrue,
  assertFalse,
  assertEqual,
  assertDeepEqual,
  assertArrayApprox,
  type Vec3,
  type Vec2,
  type Triangle,
} from '../test-utils.ts';

// ─── Helpers (fournis) ──────────────────────────────────────────────────────

function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function vec3Length(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function vec3Normalize(v: Vec3): Vec3 {
  const len = vec3Length(v);
  if (len === 0) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vec3Scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

// ─── glTF Parsing ───────────────────────────────────────────────────────────

interface GltfMesh {
  name: string;
  primitives: { attributes: Record<string, number>; indices?: number; material?: number }[];
}

interface GltfMaterial {
  name: string;
}

interface GltfAnimation {
  name: string;
  channels: unknown[];
}

interface GltfScene {
  meshes: GltfMesh[];
  materials: GltfMaterial[];
  animations: GltfAnimation[];
}

function extractMeshNames(scene: GltfScene): string[] {
  // TODO: retourner un tableau des noms de meshes
  return [];
}

function extractMaterialNames(scene: GltfScene): string[] {
  // TODO: retourner un tableau des noms de materiaux
  return [];
}

function extractAnimationNames(scene: GltfScene): string[] {
  // TODO: retourner un tableau des noms d'animations
  return [];
}

// ─── Triangle Count ─────────────────────────────────────────────────────────

function triangleCountFromAccessor(indexCount: number, mode: number): number {
  // TODO: calculer le nombre de triangles selon le mode
  // mode 4 = TRIANGLES -> count / 3
  // mode 5 = TRIANGLE_STRIP -> count - 2
  // mode 6 = TRIANGLE_FAN -> count - 2
  return 0;
}

// ─── Mesh Topology Validation ───────────────────────────────────────────────

function triangleArea(t: Triangle): number {
  // TODO: aire = 0.5 * |cross(e1, e2)| ou e1 = t[1]-t[0], e2 = t[2]-t[0]
  return 0;
}

function validateMeshTopology(triangles: Triangle[]): { valid: boolean; degenerateCount: number } {
  // TODO: compter les triangles degeneres (aire < 1e-10)
  // valid = true si aucun triangle degenere
  return { valid: true, degenerateCount: 0 };
}

// ─── Mesh Bounding Box ─────────────────────────────────────────────────────

function computeBoundingBox(positions: Vec3[]): { min: Vec3; max: Vec3 } {
  // TODO: trouver le min et max sur chaque axe
  return { min: [0, 0, 0], max: [0, 0, 0] };
}

// ─── Mesh Surface Area ─────────────────────────────────────────────────────

function computeSurfaceArea(triangles: Triangle[]): number {
  // TODO: sommer l'aire de tous les triangles
  return 0;
}

// ─── Vertex Normals (area-weighted) ─────────────────────────────────────────

function computeVertexNormals(
  positions: Vec3[],
  indices: [number, number, number][],
): Vec3[] {
  // TODO: pour chaque face, calculer la normale (cross product des aretes)
  // Ajouter cette normale a chaque vertex de la face (ponderation par aire implicite)
  // Normaliser les normales finales
  return positions.map(() => [0, 1, 0]);
}

// ─── Non-Manifold Edge Detection ────────────────────────────────────────────

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function detectNonManifoldEdges(
  indices: [number, number, number][],
): [number, number][] {
  // TODO: compter le nombre de faces par arete
  // Une arete manifold est partagee par exactement 2 faces
  // Retourner les aretes dont le count != 2
  return [];
}

// ─── UV Island Detection ────────────────────────────────────────────────────

function detectUVIslands(
  indices: [number, number, number][],
  uvs: Vec2[],
): number {
  // TODO: utiliser un Union-Find sur les triangles
  // Deux triangles sont dans le meme ilot s'ils partagent une arete UV
  // (memes coordonnees UV aux extremites)
  // Retourner le nombre de composantes connexes
  return 0;
}

// ─── Polycount Budget Checker ───────────────────────────────────────────────

interface LODBudget {
  lod: number;
  maxTriangles: number;
}

function checkPolycountBudget(
  triangleCounts: { lod: number; count: number }[],
  budgets: LODBudget[],
): { lod: number; count: number; max: number; over: boolean }[] {
  // TODO: pour chaque LOD, verifier si le nombre de triangles depasse le budget
  return [];
}

// ─── Draco-like Quantization ────────────────────────────────────────────────

function quantizePositions(
  positions: Vec3[], bits: number,
): { quantized: [number, number, number][]; min: Vec3; max: Vec3 } {
  // TODO: calculer la bounding box
  // Pour chaque position, quantifier : round((p - min) / range * (2^bits - 1))
  return { quantized: [], min: [0, 0, 0], max: [0, 0, 0] };
}

function dequantizePositions(
  quantized: [number, number, number][], min: Vec3, max: Vec3, bits: number,
): Vec3[] {
  // TODO: inverser la quantification
  // p = min + (q / (2^bits - 1)) * range
  return [];
}

// ─── Tests ──────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 22 — Modelisation');

runner.test('extractMeshNames — extrait les noms des meshes', () => {
  const scene: GltfScene = {
    meshes: [
      { name: 'Cube', primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] },
      { name: 'Sphere', primitives: [{ attributes: { POSITION: 2 } }] },
    ],
    materials: [],
    animations: [],
  };
  assertDeepEqual(extractMeshNames(scene), ['Cube', 'Sphere']);
});

runner.test('extractMaterialNames — extrait les noms des materiaux', () => {
  const scene: GltfScene = {
    meshes: [],
    materials: [{ name: 'Metal' }, { name: 'Wood' }],
    animations: [],
  };
  assertDeepEqual(extractMaterialNames(scene), ['Metal', 'Wood']);
});

runner.test('extractAnimationNames — extrait les noms des animations', () => {
  const scene: GltfScene = {
    meshes: [],
    materials: [],
    animations: [{ name: 'Walk', channels: [] }, { name: 'Run', channels: [] }],
  };
  assertDeepEqual(extractAnimationNames(scene), ['Walk', 'Run']);
});

runner.test('triangleCount — mode TRIANGLES', () => {
  assertEqual(triangleCountFromAccessor(12, 4), 4);
});

runner.test('triangleCount — mode TRIANGLE_STRIP', () => {
  assertEqual(triangleCountFromAccessor(6, 5), 4);
});

runner.test('validateMeshTopology — triangles valides', () => {
  const triangles: Triangle[] = [
    [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
    [[0, 0, 0], [1, 0, 0], [0, 0, 1]],
  ];
  const result = validateMeshTopology(triangles);
  assertTrue(result.valid);
  assertEqual(result.degenerateCount, 0);
});

runner.test('validateMeshTopology — triangle degenere', () => {
  const triangles: Triangle[] = [
    [[0, 0, 0], [1, 0, 0], [2, 0, 0]],
    [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
  ];
  const result = validateMeshTopology(triangles);
  assertFalse(result.valid);
  assertEqual(result.degenerateCount, 1);
});

runner.test('computeBoundingBox — cube', () => {
  const positions: Vec3[] = [
    [-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, 1],
  ];
  const bbox = computeBoundingBox(positions);
  assertDeepEqual(bbox.min, [-1, -1, -1]);
  assertDeepEqual(bbox.max, [1, 1, 1]);
});

runner.test('computeSurfaceArea — carre unitaire (2 triangles)', () => {
  const triangles: Triangle[] = [
    [[0, 0, 0], [1, 0, 0], [1, 1, 0]],
    [[0, 0, 0], [1, 1, 0], [0, 1, 0]],
  ];
  assertApprox(computeSurfaceArea(triangles), 1.0);
});

runner.test('computeVertexNormals — plan XY -> normales Z', () => {
  const positions: Vec3[] = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]];
  const indices: [number, number, number][] = [[0, 1, 2], [0, 2, 3]];
  const normals = computeVertexNormals(positions, indices);
  for (const n of normals) {
    assertApprox(Math.abs(n[2]), 1, 0.001);
  }
});

runner.test('computeVertexNormals — normales normalisees', () => {
  const positions: Vec3[] = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const indices: [number, number, number][] = [[0, 1, 2], [0, 2, 3], [0, 3, 1]];
  const normals = computeVertexNormals(positions, indices);
  for (const n of normals) {
    assertApprox(vec3Length(n), 1, 0.001);
  }
});

runner.test('detectNonManifoldEdges — maillage manifold (pas d\'aretes non-manifold)', () => {
  const indices: [number, number, number][] = [[0, 1, 2], [1, 3, 2]];
  const nonManifold = detectNonManifoldEdges(indices);
  const interiorNonManifold = nonManifold.filter(([a, b]) => {
    const key = edgeKey(a, b);
    return key === '1-2' ? false : true;
  });
  assertTrue(nonManifold.length > 0, 'Aretes de bordure detectees');
});

runner.test('detectNonManifoldEdges — arete partagee par 3 faces', () => {
  const indices: [number, number, number][] = [
    [0, 1, 2],
    [0, 1, 3],
    [0, 1, 4],
  ];
  const nonManifold = detectNonManifoldEdges(indices);
  const edge01 = nonManifold.find(([a, b]) => edgeKey(a, b) === '0-1');
  assertTrue(edge01 !== undefined, 'Arete 0-1 devrait etre non-manifold');
});

runner.test('detectUVIslands — 2 ilots separes', () => {
  const indices: [number, number, number][] = [[0, 1, 2], [3, 4, 5]];
  const uvs: Vec2[] = [
    [0, 0], [1, 0], [0.5, 1],
    [2, 2], [3, 2], [2.5, 3],
  ];
  assertEqual(detectUVIslands(indices, uvs), 2);
});

runner.test('detectUVIslands — 1 ilot (triangles connectes par UV)', () => {
  const indices: [number, number, number][] = [[0, 1, 2], [1, 3, 2]];
  const uvs: Vec2[] = [
    [0, 0], [1, 0], [0.5, 1], [1.5, 1],
  ];
  assertEqual(detectUVIslands(indices, uvs), 1);
});

runner.test('checkPolycountBudget — dans le budget', () => {
  const result = checkPolycountBudget(
    [{ lod: 0, count: 5000 }],
    [{ lod: 0, maxTriangles: 10000 }],
  );
  assertFalse(result[0].over);
});

runner.test('checkPolycountBudget — depasse le budget', () => {
  const result = checkPolycountBudget(
    [{ lod: 0, count: 15000 }, { lod: 1, count: 3000 }],
    [{ lod: 0, maxTriangles: 10000 }, { lod: 1, maxTriangles: 5000 }],
  );
  assertTrue(result[0].over);
  assertFalse(result[1].over);
});

runner.test('quantizePositions — 8 bits', () => {
  const positions: Vec3[] = [[0, 0, 0], [1, 1, 1], [0.5, 0.5, 0.5]];
  const { quantized } = quantizePositions(positions, 8);
  assertDeepEqual(quantized[0], [0, 0, 0]);
  assertDeepEqual(quantized[1], [255, 255, 255]);
  assertDeepEqual(quantized[2], [128, 128, 128]);
});

runner.test('quantize + dequantize — erreur faible', () => {
  const positions: Vec3[] = [[0.3, 0.7, 0.1], [0.8, 0.2, 0.9]];
  const { quantized, min, max } = quantizePositions(positions, 16);
  const restored = dequantizePositions(quantized, min, max, 16);
  for (let i = 0; i < positions.length; i++) {
    assertArrayApprox(restored[i], positions[i], 0.001);
  }
});

runner.run();
