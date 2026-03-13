import {
  createTestRunner,
  assertEqual,
  assertApprox,
  assertDeepEqual,
  assertTrue,
  assertFalse,
  type Vec3,
  type AABB,
} from '../test-utils.ts';

// ─── Scene Graph ──────────────────────────────────────────────────────────────

interface SceneNode {
  name: string;
  children: SceneNode[];
  parent: SceneNode | null;
}

function createNode(name: string): SceneNode {
  return { name, children: [], parent: null };
}

function addChild(parent: SceneNode, child: SceneNode): void {
  if (child.parent) {
    removeChild(child.parent, child);
  }
  child.parent = parent;
  parent.children.push(child);
}

function removeChild(parent: SceneNode, child: SceneNode): boolean {
  const idx = parent.children.indexOf(child);
  if (idx === -1) return false;
  parent.children.splice(idx, 1);
  child.parent = null;
  return true;
}

function findByName(root: SceneNode, name: string): SceneNode | null {
  if (root.name === name) return root;
  for (const child of root.children) {
    const found = findByName(child, name);
    if (found) return found;
  }
  return null;
}

function countNodes(root: SceneNode): number {
  let count = 1;
  for (const child of root.children) {
    count += countNodes(child);
  }
  return count;
}

// ─── Geometry generation ──────────────────────────────────────────────────────

interface GeometryData {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

function generateBoxGeometry(width: number, height: number, depth: number): GeometryData {
  const w = width / 2, h = height / 2, d = depth / 2;

  const faces: { normal: Vec3; corners: [Vec3, number, number][] }[] = [
    { normal: [0, 0, 1],  corners: [[ [-w, -h,  d], 0, 0 ], [ [ w, -h,  d], 1, 0 ], [ [ w,  h,  d], 1, 1 ], [ [-w,  h,  d], 0, 1 ]] },
    { normal: [0, 0, -1], corners: [[ [ w, -h, -d], 0, 0 ], [ [-w, -h, -d], 1, 0 ], [ [-w,  h, -d], 1, 1 ], [ [ w,  h, -d], 0, 1 ]] },
    { normal: [0, 1, 0],  corners: [[ [-w,  h,  d], 0, 0 ], [ [ w,  h,  d], 1, 0 ], [ [ w,  h, -d], 1, 1 ], [ [-w,  h, -d], 0, 1 ]] },
    { normal: [0, -1, 0], corners: [[ [-w, -h, -d], 0, 0 ], [ [ w, -h, -d], 1, 0 ], [ [ w, -h,  d], 1, 1 ], [ [-w, -h,  d], 0, 1 ]] },
    { normal: [1, 0, 0],  corners: [[ [ w, -h,  d], 0, 0 ], [ [ w, -h, -d], 1, 0 ], [ [ w,  h, -d], 1, 1 ], [ [ w,  h,  d], 0, 1 ]] },
    { normal: [-1, 0, 0], corners: [[ [-w, -h, -d], 0, 0 ], [ [-w, -h,  d], 1, 0 ], [ [-w,  h,  d], 1, 1 ], [ [-w,  h, -d], 0, 1 ]] },
  ];

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (const face of faces) {
    const base = positions.length / 3;
    for (const [pos, u, v] of face.corners) {
      positions.push(pos[0], pos[1], pos[2]);
      normals.push(face.normal[0], face.normal[1], face.normal[2]);
      uvs.push(u, v);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  return { positions, normals, uvs, indices };
}

function generateSphereGeometry(radius: number, segments: number, rings: number): GeometryData {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let ring = 0; ring <= rings; ring++) {
    const phi = (ring / rings) * Math.PI;
    for (let seg = 0; seg <= segments; seg++) {
      const theta = (seg / segments) * Math.PI * 2;
      const x = Math.sin(phi) * Math.cos(theta);
      const y = Math.cos(phi);
      const z = Math.sin(phi) * Math.sin(theta);
      positions.push(x * radius, y * radius, z * radius);
      normals.push(x, y, z);
      uvs.push(seg / segments, ring / rings);
    }
  }

  for (let ring = 0; ring < rings; ring++) {
    for (let seg = 0; seg < segments; seg++) {
      const a = ring * (segments + 1) + seg;
      const b = a + segments + 1;
      indices.push(a, b, a + 1);
      indices.push(a + 1, b, b + 1);
    }
  }

  return { positions, normals, uvs, indices };
}

function generatePlaneGeometry(width: number, height: number): GeometryData {
  const w = width / 2, h = height / 2;
  const positions = [
    -w, 0, -h,
     w, 0, -h,
     w, 0,  h,
    -w, 0,  h,
  ];
  const normals = [
    0, 1, 0,
    0, 1, 0,
    0, 1, 0,
    0, 1, 0,
  ];
  const uvs = [
    0, 0,
    1, 0,
    1, 1,
    0, 1,
  ];
  const indices = [0, 1, 2, 0, 2, 3];

  return { positions, normals, uvs, indices };
}

// ─── Bounding volumes ─────────────────────────────────────────────────────────

function computeBoundingBox(positions: number[]): AABB {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < positions.length; i += 3) {
    for (let j = 0; j < 3; j++) {
      if (positions[i + j] < min[j]) min[j] = positions[i + j];
      if (positions[i + j] > max[j]) max[j] = positions[i + j];
    }
  }
  return { min, max };
}

interface BoundingSphere {
  center: Vec3;
  radius: number;
}

function computeBoundingSphere(positions: number[]): BoundingSphere {
  const count = positions.length / 3;
  const center: Vec3 = [0, 0, 0];
  for (let i = 0; i < positions.length; i += 3) {
    center[0] += positions[i];
    center[1] += positions[i + 1];
    center[2] += positions[i + 2];
  }
  center[0] /= count;
  center[1] /= count;
  center[2] /= count;

  let maxDistSq = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const dx = positions[i] - center[0];
    const dy = positions[i + 1] - center[1];
    const dz = positions[i + 2] - center[2];
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq > maxDistSq) maxDistSq = distSq;
  }

  return { center, radius: Math.sqrt(maxDistSq) };
}

// ─── Camera ───────────────────────────────────────────────────────────────────

function computeAspectRatio(width: number, height: number): number {
  return width / height;
}

function updateCameraOnResize(
  oldWidth: number, oldHeight: number,
  newWidth: number, newHeight: number
): { aspect: number; pixelWidth: number; pixelHeight: number } {
  return {
    aspect: newWidth / newHeight,
    pixelWidth: newWidth,
    pixelHeight: newHeight,
  };
}

// ─── Orbit controls ──────────────────────────────────────────────────────────

function orbitToCartesian(theta: number, phi: number, radius: number, target: Vec3): Vec3 {
  const x = radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  return [x + target[0], y + target[1], z + target[2]];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 13 — Three.js : fondamentaux');

// Scene graph
runner.test('addChild ajoute un enfant au parent', () => {
  const root = createNode('root');
  const child = createNode('child');
  addChild(root, child);
  assertEqual(root.children.length, 1);
  assertEqual(child.parent, root);
});

runner.test('removeChild retire un enfant', () => {
  const root = createNode('root');
  const child = createNode('child');
  addChild(root, child);
  const removed = removeChild(root, child);
  assertTrue(removed);
  assertEqual(root.children.length, 0);
  assertEqual(child.parent, null);
});

runner.test('removeChild retourne false si enfant absent', () => {
  const root = createNode('root');
  const other = createNode('other');
  assertFalse(removeChild(root, other));
});

runner.test('findByName trouve un noeud en profondeur', () => {
  const root = createNode('root');
  const a = createNode('a');
  const b = createNode('b');
  const c = createNode('c');
  addChild(root, a);
  addChild(a, b);
  addChild(b, c);
  const found = findByName(root, 'c');
  assertTrue(found !== null);
  assertEqual(found!.name, 'c');
});

runner.test('findByName retourne null si introuvable', () => {
  const root = createNode('root');
  assertEqual(findByName(root, 'missing'), null);
});

runner.test('countNodes compte tous les noeuds de l\'arbre', () => {
  const root = createNode('root');
  const a = createNode('a');
  const b = createNode('b');
  addChild(root, a);
  addChild(root, b);
  addChild(a, createNode('c'));
  assertEqual(countNodes(root), 4);
});

// Box geometry
runner.test('generateBoxGeometry produit 24 sommets et 36 indices', () => {
  const box = generateBoxGeometry(2, 2, 2);
  assertEqual(box.positions.length / 3, 24);
  assertEqual(box.indices.length, 36);
  assertEqual(box.normals.length, box.positions.length);
  assertEqual(box.uvs.length / 2, 24);
});

// Sphere geometry
runner.test('generateSphereGeometry vertex/index count', () => {
  const sphere = generateSphereGeometry(1, 8, 6);
  const expectedVerts = (8 + 1) * (6 + 1);
  assertEqual(sphere.positions.length / 3, expectedVerts);
  const expectedIndices = 8 * 6 * 6;
  assertEqual(sphere.indices.length, expectedIndices);
});

// Plane geometry
runner.test('generatePlaneGeometry produit 4 sommets et 6 indices', () => {
  const plane = generatePlaneGeometry(10, 10);
  assertEqual(plane.positions.length / 3, 4);
  assertEqual(plane.indices.length, 6);
  assertEqual(plane.normals.length, 12);
});

// Bounding box
runner.test('computeBoundingBox calcule le min/max correct', () => {
  const positions = [
    -1, -2, -3,
     4,  5,  6,
     0,  0,  0,
  ];
  const aabb = computeBoundingBox(positions);
  assertDeepEqual(aabb.min, [-1, -2, -3]);
  assertDeepEqual(aabb.max, [4, 5, 6]);
});

// Bounding sphere
runner.test('computeBoundingSphere centre et rayon corrects', () => {
  const positions = [
    1, 0, 0,
    -1, 0, 0,
    0, 1, 0,
    0, -1, 0,
  ];
  const sphere = computeBoundingSphere(positions);
  assertApprox(sphere.center[0], 0);
  assertApprox(sphere.center[1], 0);
  assertApprox(sphere.center[2], 0);
  assertApprox(sphere.radius, 1);
});

// Camera
runner.test('computeAspectRatio 1920x1080 = 16/9', () => {
  assertApprox(computeAspectRatio(1920, 1080), 16 / 9);
});

runner.test('updateCameraOnResize retourne les nouvelles dimensions', () => {
  const result = updateCameraOnResize(800, 600, 1920, 1080);
  assertApprox(result.aspect, 1920 / 1080);
  assertEqual(result.pixelWidth, 1920);
  assertEqual(result.pixelHeight, 1080);
});

// Orbit controls
runner.test('orbitToCartesian — phi=PI/2, theta=0 donne (radius,0,0)', () => {
  const pos = orbitToCartesian(0, Math.PI / 2, 5, [0, 0, 0]);
  assertApprox(pos[0], 5);
  assertApprox(pos[1], 0, 1e-6);
  assertApprox(pos[2], 0, 1e-6);
});

runner.test('orbitToCartesian — phi=0 donne le pole nord (0,radius,0)', () => {
  const pos = orbitToCartesian(0, 0, 5, [0, 0, 0]);
  assertApprox(pos[0], 0, 1e-6);
  assertApprox(pos[1], 5);
  assertApprox(pos[2], 0, 1e-6);
});

runner.test('orbitToCartesian avec target decale', () => {
  const pos = orbitToCartesian(0, Math.PI / 2, 5, [10, 20, 30]);
  assertApprox(pos[0], 15);
  assertApprox(pos[1], 20, 1e-6);
  assertApprox(pos[2], 30, 1e-6);
});

runner.run();
