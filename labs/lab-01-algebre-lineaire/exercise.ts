import {
  createTestRunner,
  assertEqual,
  assertApprox,
  assertArrayApprox,
  assertDeepEqual,
  type Vec3,
  type Vec4,
  type Mat4,
} from '../test-utils.ts';

// ─── Vec3 operations ─────────────────────────────────────────────────────────

function vec3Add(a: Vec3, b: Vec3): Vec3 {
  // TODO: retourner la somme composante par composante
  return [0, 0, 0];
}

function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  // TODO: retourner la difference composante par composante
  return [0, 0, 0];
}

function vec3Scale(v: Vec3, s: number): Vec3 {
  // TODO: multiplier chaque composante par s
  return [0, 0, 0];
}

function vec3Length(v: Vec3): number {
  // TODO: retourner la longueur (norme euclidienne) du vecteur
  return 0;
}

function vec3Normalize(v: Vec3): Vec3 {
  // TODO: retourner le vecteur unitaire (longueur 1) dans la meme direction
  return [0, 0, 0];
}

function vec3Dot(a: Vec3, b: Vec3): number {
  // TODO: retourner le produit scalaire a . b
  return 0;
}

function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  // TODO: retourner le produit vectoriel a x b
  return [0, 0, 0];
}

function vec3Angle(a: Vec3, b: Vec3): number {
  // TODO: retourner l'angle en radians entre a et b
  // Indice : acos(dot(normalize(a), normalize(b)))
  return 0;
}

// ─── Mat4 operations ─────────────────────────────────────────────────────────

function mat4Identity(): Mat4 {
  // TODO: retourner la matrice identite 4x4 en column-major order
  return [
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ];
}

/** Column-major multiply: result = a * b */
function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  // TODO: multiplication de matrices 4x4 en column-major
  // Pour chaque element (row, col) : somme de a[k*4+row] * b[col*4+k] pour k=0..3
  const out: number[] = new Array(16).fill(0);
  return out as unknown as Mat4;
}

function mat4Transpose(m: Mat4): Mat4 {
  // TODO: transposer la matrice (echanger lignes et colonnes)
  return [
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ];
}

function mat4Determinant(m: Mat4): number {
  // TODO: calculer le determinant de la matrice 4x4
  // Utiliser l'expansion par cofacteurs le long de la premiere colonne
  return 0;
}

// ─── Homogeneous coordinates ──────────────────────────────────────────────────

function pointToHomogeneous(p: Vec3): Vec4 {
  // TODO: convertir un point 3D en coordonnees homogenes (w=1)
  return [0, 0, 0, 0];
}

function directionToHomogeneous(d: Vec3): Vec4 {
  // TODO: convertir une direction 3D en coordonnees homogenes (w=0)
  return [0, 0, 0, 0];
}

// ─── Float32Array conversion ──────────────────────────────────────────────────

function mat4ToFloat32Array(m: Mat4): Float32Array {
  // TODO: convertir un Mat4 en Float32Array (pour envoyer au GPU)
  return new Float32Array(0);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 01 — Algebre lineaire');

runner.test('vec3Add', () => {
  assertDeepEqual(vec3Add([1, 2, 3], [4, 5, 6]), [5, 7, 9]);
});

runner.test('vec3Sub', () => {
  assertDeepEqual(vec3Sub([5, 7, 9], [4, 5, 6]), [1, 2, 3]);
});

runner.test('vec3Scale', () => {
  assertDeepEqual(vec3Scale([1, 2, 3], 2), [2, 4, 6]);
});

runner.test('vec3Length', () => {
  assertApprox(vec3Length([3, 4, 0]), 5);
});

runner.test('vec3Normalize', () => {
  const n = vec3Normalize([0, 0, 5]);
  assertArrayApprox(n, [0, 0, 1]);
});

runner.test('vec3Dot — perpendicular vectors', () => {
  assertApprox(vec3Dot([1, 0, 0], [0, 1, 0]), 0);
});

runner.test('vec3Dot — parallel vectors', () => {
  assertApprox(vec3Dot([1, 0, 0], [1, 0, 0]), 1);
});

runner.test('vec3Cross — x cross y = z', () => {
  assertDeepEqual(vec3Cross([1, 0, 0], [0, 1, 0]), [0, 0, 1]);
});

runner.test('vec3Cross — y cross x = -z', () => {
  assertDeepEqual(vec3Cross([0, 1, 0], [1, 0, 0]), [0, 0, -1]);
});

runner.test('vec3Angle — 90 degrees', () => {
  assertApprox(vec3Angle([1, 0, 0], [0, 1, 0]), Math.PI / 2);
});

runner.test('vec3Angle — 0 degrees', () => {
  assertApprox(vec3Angle([1, 0, 0], [1, 0, 0]), 0);
});

runner.test('mat4Identity', () => {
  const id = mat4Identity();
  assertDeepEqual(id, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
});

runner.test('mat4Multiply — identity * identity = identity', () => {
  const id = mat4Identity();
  assertDeepEqual(mat4Multiply(id, id), id);
});

runner.test('mat4Transpose', () => {
  const m: Mat4 = [
    1, 5, 9,  13,
    2, 6, 10, 14,
    3, 7, 11, 15,
    4, 8, 12, 16,
  ];
  const t = mat4Transpose(m);
  assertDeepEqual(t, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
});

runner.test('mat4Determinant — identity has det 1', () => {
  assertApprox(mat4Determinant(mat4Identity()), 1);
});

runner.test('homogeneous point (w=1)', () => {
  assertDeepEqual(pointToHomogeneous([3, 4, 5]), [3, 4, 5, 1]);
});

runner.test('homogeneous direction (w=0)', () => {
  assertDeepEqual(directionToHomogeneous([3, 4, 5]), [3, 4, 5, 0]);
});

runner.test('mat4ToFloat32Array', () => {
  const id = mat4Identity();
  const f = mat4ToFloat32Array(id);
  assertEqual(f instanceof Float32Array, true);
  assertEqual(f.length, 16);
  assertApprox(f[0], 1);
  assertApprox(f[5], 1);
});

runner.run();
