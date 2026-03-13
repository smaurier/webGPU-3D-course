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
  // TODO: si child a deja un parent, le retirer d'abord (removeChild)
  // puis ajouter child aux enfants de parent et mettre a jour child.parent
}

function removeChild(parent: SceneNode, child: SceneNode): boolean {
  // TODO: retirer child des enfants de parent
  // retourner true si retire, false si child n'etait pas un enfant de parent
  // mettre child.parent a null si retire
  return false;
}

function findByName(root: SceneNode, name: string): SceneNode | null {
  // TODO: recherche en profondeur (DFS) dans l'arbre
  // retourner le premier noeud dont le nom correspond, ou null
  return null;
}

function countNodes(root: SceneNode): number {
  // TODO: compter le nombre total de noeuds dans l'arbre (root inclus)
  return 0;
}

// ─── Geometry generation ──────────────────────────────────────────────────────

interface GeometryData {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

function generateBoxGeometry(width: number, height: number, depth: number): GeometryData {
  // TODO: generer une box avec 24 sommets uniques (4 par face, 6 faces)
  // Chaque face a sa propre normale. 36 indices (2 triangles par face).
  // Indices par face : [base, base+1, base+2, base, base+2, base+3]
  return { positions: [], normals: [], uvs: [], indices: [] };
}

function generateSphereGeometry(radius: number, segments: number, rings: number): GeometryData {
  // TODO: generer une sphere parametrique
  // (rings+1) * (segments+1) sommets
  // rings * segments * 6 indices (2 triangles par cellule de grille)
  // phi va de 0 a PI (pole nord au pole sud), theta de 0 a 2*PI
  return { positions: [], normals: [], uvs: [], indices: [] };
}

function generatePlaneGeometry(width: number, height: number): GeometryData {
  // TODO: generer un plan horizontal (Y up) avec 4 sommets et 6 indices
  // Normale vers le haut (0, 1, 0)
  return { positions: [], normals: [], uvs: [], indices: [] };
}

// ─── Bounding volumes ─────────────────────────────────────────────────────────

function computeBoundingBox(positions: number[]): AABB {
  // TODO: parcourir les positions (x,y,z triples) et trouver min/max par axe
  return { min: [0, 0, 0], max: [0, 0, 0] };
}

interface BoundingSphere {
  center: Vec3;
  radius: number;
}

function computeBoundingSphere(positions: number[]): BoundingSphere {
  // TODO: calculer le centroide (moyenne des positions) comme centre
  // puis trouver le rayon = distance max du centre a un sommet
  return { center: [0, 0, 0], radius: 0 };
}

// ─── Camera ───────────────────────────────────────────────────────────────────

function computeAspectRatio(width: number, height: number): number {
  // TODO: retourner le ratio largeur / hauteur
  return 0;
}

function updateCameraOnResize(
  oldWidth: number, oldHeight: number,
  newWidth: number, newHeight: number
): { aspect: number; pixelWidth: number; pixelHeight: number } {
  // TODO: retourner le nouvel aspect ratio et les nouvelles dimensions
  return { aspect: 0, pixelWidth: 0, pixelHeight: 0 };
}

// ─── Orbit controls ──────────────────────────────────────────────────────────

function orbitToCartesian(theta: number, phi: number, radius: number, target: Vec3): Vec3 {
  // TODO: convertir les coordonnees spheriques en position cartesienne
  // x = radius * sin(phi) * cos(theta) + target.x
  // y = radius * cos(phi) + target.y
  // z = radius * sin(phi) * sin(theta) + target.z
  return [0, 0, 0];
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
