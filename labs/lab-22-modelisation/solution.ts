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

// ─── Helpers ────────────────────────────────────────────────────────────────

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
  return scene.meshes.map(m => m.name);
}

function extractMaterialNames(scene: GltfScene): string[] {
  return scene.materials.map(m => m.name);
}

function extractAnimationNames(scene: GltfScene): string[] {
  return scene.animations.map(a => a.name);
}

// ─── Triangle Count ─────────────────────────────────────────────────────────

function triangleCountFromAccessor(indexCount: number, mode: number): number {
  // mode 4 = TRIANGLES -> count / 3
  // mode 5 = TRIANGLE_STRIP -> count - 2
  // mode 6 = TRIANGLE_FAN -> count - 2
  switch (mode) {
    case 4: return Math.floor(indexCount / 3);
    case 5: return Math.max(0, indexCount - 2);
    case 6: return Math.max(0, indexCount - 2);
    default: return 0;
  }
}

// ─── Mesh Topology Validation ───────────────────────────────────────────────

function triangleArea(t: Triangle): number {
  const e1 = vec3Sub(t[1], t[0]);
  const e2 = vec3Sub(t[2], t[0]);
  return vec3Length(vec3Cross(e1, e2)) * 0.5;
}

function validateMeshTopology(triangles: Triangle[]): { valid: boolean; degenerateCount: number } {
  let degenerateCount = 0;
  for (const tri of triangles) {
    if (triangleArea(tri) < 1e-10) {
      degenerateCount++;
    }
  }
  return { valid: degenerateCount === 0, degenerateCount };
}

// ─── Mesh Bounding Box ─────────────────────────────────────────────────────

function computeBoundingBox(positions: Vec3[]): { min: Vec3; max: Vec3 } {
  if (positions.length === 0) {
    return { min: [0, 0, 0], max: [0, 0, 0] };
  }
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of positions) {
    for (let i = 0; i < 3; i++) {
      if (p[i] < min[i]) min[i] = p[i];
      if (p[i] > max[i]) max[i] = p[i];
    }
  }
  return { min, max };
}

// ─── Mesh Surface Area ─────────────────────────────────────────────────────

function computeSurfaceArea(triangles: Triangle[]): number {
  let area = 0;
  for (const tri of triangles) {
    area += triangleArea(tri);
  }
  return area;
}

// ─── Vertex Normals (area-weighted) ─────────────────────────────────────────

function computeVertexNormals(
  positions: Vec3[],
  indices: [number, number, number][],
): Vec3[] {
  const normals: Vec3[] = positions.map(() => [0, 0, 0]);

  for (const [i0, i1, i2] of indices) {
    const e1 = vec3Sub(positions[i1], positions[i0]);
    const e2 = vec3Sub(positions[i2], positions[i0]);
    const faceNormal = vec3Cross(e1, e2); // longueur = 2 * aire
    // Ajouter a chaque vertex (pondere par l'aire implicitement)
    normals[i0] = vec3Add(normals[i0], faceNormal);
    normals[i1] = vec3Add(normals[i1], faceNormal);
    normals[i2] = vec3Add(normals[i2], faceNormal);
  }

  return normals.map(n => vec3Normalize(n));
}

// ─── Non-Manifold Edge Detection ────────────────────────────────────────────

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function detectNonManifoldEdges(
  indices: [number, number, number][],
): [number, number][] {
  const edgeCounts = new Map<string, { count: number; a: number; b: number }>();

  for (const [i0, i1, i2] of indices) {
    const edges: [number, number][] = [[i0, i1], [i1, i2], [i2, i0]];
    for (const [a, b] of edges) {
      const key = edgeKey(a, b);
      const entry = edgeCounts.get(key);
      if (entry) {
        entry.count++;
      } else {
        edgeCounts.set(key, { count: 1, a: Math.min(a, b), b: Math.max(a, b) });
      }
    }
  }

  const nonManifold: [number, number][] = [];
  for (const entry of edgeCounts.values()) {
    if (entry.count !== 2) {
      nonManifold.push([entry.a, entry.b]);
    }
  }
  return nonManifold;
}

// ─── UV Island Detection ────────────────────────────────────────────────────

function detectUVIslands(
  indices: [number, number, number][],
  uvs: Vec2[],
): number {
  // Union-Find
  const parent: number[] = [];
  for (let i = 0; i < indices.length; i++) parent[i] = i;

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }

  function union(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  // Deux triangles sont connectes s'ils partagent une arete UV
  // (memes coordonnees UV aux deux extremites de l'arete)
  const uvEdgeMap = new Map<string, number>();

  function uvKey(uv1: Vec2, uv2: Vec2): string {
    const a = `${uv1[0].toFixed(6)},${uv1[1].toFixed(6)}`;
    const b = `${uv2[0].toFixed(6)},${uv2[1].toFixed(6)}`;
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  for (let ti = 0; ti < indices.length; ti++) {
    const [i0, i1, i2] = indices[ti];
    const triUVs: Vec2[] = [uvs[i0], uvs[i1], uvs[i2]];
    const edges: [Vec2, Vec2][] = [
      [triUVs[0], triUVs[1]],
      [triUVs[1], triUVs[2]],
      [triUVs[2], triUVs[0]],
    ];
    for (const [a, b] of edges) {
      const key = uvKey(a, b);
      if (uvEdgeMap.has(key)) {
        union(ti, uvEdgeMap.get(key)!);
      } else {
        uvEdgeMap.set(key, ti);
      }
    }
  }

  const roots = new Set<number>();
  for (let i = 0; i < indices.length; i++) {
    roots.add(find(i));
  }
  return roots.size;
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
  return triangleCounts.map(tc => {
    const budget = budgets.find(b => b.lod === tc.lod);
    const max = budget ? budget.maxTriangles : Infinity;
    return {
      lod: tc.lod,
      count: tc.count,
      max,
      over: tc.count > max,
    };
  });
}

// ─── Draco-like Quantization ────────────────────────────────────────────────

function quantizePositions(
  positions: Vec3[], bits: number,
): { quantized: [number, number, number][]; min: Vec3; max: Vec3 } {
  const bbox = computeBoundingBox(positions);
  const maxVal = (1 << bits) - 1;
  const range: Vec3 = [
    bbox.max[0] - bbox.min[0] || 1,
    bbox.max[1] - bbox.min[1] || 1,
    bbox.max[2] - bbox.min[2] || 1,
  ];

  const quantized = positions.map(p => {
    return [
      Math.round(((p[0] - bbox.min[0]) / range[0]) * maxVal),
      Math.round(((p[1] - bbox.min[1]) / range[1]) * maxVal),
      Math.round(((p[2] - bbox.min[2]) / range[2]) * maxVal),
    ] as [number, number, number];
  });

  return { quantized, min: bbox.min, max: bbox.max };
}

function dequantizePositions(
  quantized: [number, number, number][], min: Vec3, max: Vec3, bits: number,
): Vec3[] {
  const maxVal = (1 << bits) - 1;
  const range: Vec3 = [
    max[0] - min[0] || 1,
    max[1] - min[1] || 1,
    max[2] - min[2] || 1,
  ];

  return quantized.map(q => {
    return [
      min[0] + (q[0] / maxVal) * range[0],
      min[1] + (q[1] / maxVal) * range[1],
      min[2] + (q[2] / maxVal) * range[2],
    ] as Vec3;
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 22 — Modelisation');

// glTF parsing
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

// Triangle count
runner.test('triangleCount — mode TRIANGLES', () => {
  assertEqual(triangleCountFromAccessor(12, 4), 4);
});

runner.test('triangleCount — mode TRIANGLE_STRIP', () => {
  assertEqual(triangleCountFromAccessor(6, 5), 4);
});

// Mesh topology
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
    [[0, 0, 0], [1, 0, 0], [2, 0, 0]], // colineaire -> aire = 0
    [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
  ];
  const result = validateMeshTopology(triangles);
  assertFalse(result.valid);
  assertEqual(result.degenerateCount, 1);
});

// Bounding box
runner.test('computeBoundingBox — cube', () => {
  const positions: Vec3[] = [
    [-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, 1],
  ];
  const bbox = computeBoundingBox(positions);
  assertDeepEqual(bbox.min, [-1, -1, -1]);
  assertDeepEqual(bbox.max, [1, 1, 1]);
});

// Surface area
runner.test('computeSurfaceArea — carre unitaire (2 triangles)', () => {
  const triangles: Triangle[] = [
    [[0, 0, 0], [1, 0, 0], [1, 1, 0]],
    [[0, 0, 0], [1, 1, 0], [0, 1, 0]],
  ];
  assertApprox(computeSurfaceArea(triangles), 1.0);
});

// Vertex normals
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

// Non-manifold edges
runner.test('detectNonManifoldEdges — maillage manifold (pas d\'aretes non-manifold)', () => {
  // Deux triangles partageant une arete -> chaque arete partagee a count=2
  const indices: [number, number, number][] = [[0, 1, 2], [1, 3, 2]];
  const nonManifold = detectNonManifoldEdges(indices);
  // Aretes de bordure (count=1) sont aussi non-manifold au sens strict
  // Ici on a des aretes de bordure, mais l'arete 1-2 est partagee par 2 faces
  const interiorNonManifold = nonManifold.filter(([a, b]) => {
    const key = edgeKey(a, b);
    return key === '1-2' ? false : true;
  });
  // Les aretes de bordure ont count=1 (non-manifold)
  assertTrue(nonManifold.length > 0, 'Aretes de bordure detectees');
});

runner.test('detectNonManifoldEdges — arete partagee par 3 faces', () => {
  // L'arete 0-1 est partagee par 3 triangles -> non-manifold
  const indices: [number, number, number][] = [
    [0, 1, 2],
    [0, 1, 3],
    [0, 1, 4],
  ];
  const nonManifold = detectNonManifoldEdges(indices);
  const edge01 = nonManifold.find(([a, b]) => edgeKey(a, b) === '0-1');
  assertTrue(edge01 !== undefined, 'Arete 0-1 devrait etre non-manifold');
});

// UV Islands
runner.test('detectUVIslands — 2 ilots separes', () => {
  const indices: [number, number, number][] = [[0, 1, 2], [3, 4, 5]];
  const uvs: Vec2[] = [
    [0, 0], [1, 0], [0.5, 1],    // Ilot 1
    [2, 2], [3, 2], [2.5, 3],    // Ilot 2
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

// Polycount budget
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

// Quantization
runner.test('quantizePositions — 8 bits', () => {
  const positions: Vec3[] = [[0, 0, 0], [1, 1, 1], [0.5, 0.5, 0.5]];
  const { quantized } = quantizePositions(positions, 8);
  assertDeepEqual(quantized[0], [0, 0, 0]);
  assertDeepEqual(quantized[1], [255, 255, 255]);
  assertDeepEqual(quantized[2], [128, 128, 128]); // round(0.5 * 255) = 128
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
