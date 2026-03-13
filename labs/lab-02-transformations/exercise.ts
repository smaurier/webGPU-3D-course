import {
  createTestRunner,
  assertApprox,
  assertArrayApprox,
  type Vec3,
  type Vec4,
  type Mat4,
  type Quat,
} from '../test-utils.ts';

// ─── Matrix builders ──────────────────────────────────────────────────────────

function mat4Translation(tx: number, ty: number, tz: number): Mat4 {
  // TODO: retourner une matrice de translation en column-major
  // tx, ty, tz vont aux indices 12, 13, 14
  return [
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ];
}

function mat4Scale(sx: number, sy: number, sz: number): Mat4 {
  // TODO: retourner une matrice de mise a l'echelle
  // sx, sy, sz sur la diagonale (indices 0, 5, 10)
  return [
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ];
}

function mat4RotationX(angle: number): Mat4 {
  // TODO: rotation autour de l'axe X
  // cos et sin aux positions [5,6,9,10]
  return [
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ];
}

function mat4RotationY(angle: number): Mat4 {
  // TODO: rotation autour de l'axe Y
  // cos et sin aux positions [0,2,8,10]
  return [
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ];
}

function mat4RotationZ(angle: number): Mat4 {
  // TODO: rotation autour de l'axe Z
  // cos et sin aux positions [0,1,4,5]
  return [
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ];
}

function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  // TODO: multiplication de matrices column-major (copie du lab 01)
  const out: number[] = new Array(16).fill(0);
  return out as unknown as Mat4;
}

/** SRT: M = T * R * S */
function mat4SRT(scale: Vec3, rotation: Mat4, translation: Vec3): Mat4 {
  // TODO: composer Scale * Rotation * Translation
  // Rappel: M = T * R * S en column-major
  return [
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ];
}

// ─── Quaternions ──────────────────────────────────────────────────────────────

function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  // TODO: creer un quaternion a partir d'un axe normalise et d'un angle
  // q = [axis * sin(angle/2), cos(angle/2)]
  return [0, 0, 0, 1];
}

function quatMultiply(a: Quat, b: Quat): Quat {
  // TODO: multiplication de quaternions (Hamilton product)
  return [0, 0, 0, 1];
}

function quatToMat4(q: Quat): Mat4 {
  // TODO: convertir un quaternion en matrice de rotation 4x4
  return [
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ];
}

function quatNormalize(q: Quat): Quat {
  // TODO: normaliser le quaternion (longueur = 1)
  return [0, 0, 0, 1];
}

function quatInverse(q: Quat): Quat {
  // TODO: retourner le quaternion inverse (conjugue / norme^2)
  return [0, 0, 0, 1];
}

function quatSlerp(a: Quat, b: Quat, t: number): Quat {
  // TODO: interpolation spherique entre a et b
  // Attention au cas ou le dot product est negatif (prendre le chemin court)
  return [0, 0, 0, 1];
}

function eulerToQuat(x: number, y: number, z: number): Quat {
  // TODO: convertir des angles d'Euler (radians) en quaternion
  // Ordre: X puis Y puis Z
  return [0, 0, 0, 1];
}

/** Apply a transformation matrix to a point (w=1) */
function transformPoint(m: Mat4, p: Vec3): Vec3 {
  // TODO: multiplier la matrice par le point [p.x, p.y, p.z, 1]
  // Retourner [x, y, z]
  return [0, 0, 0];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 02 — Transformations');

runner.test('translation matrix', () => {
  const m = mat4Translation(3, 4, 5);
  assertApprox(m[12], 3);
  assertApprox(m[13], 4);
  assertApprox(m[14], 5);
  assertApprox(m[0], 1);
  assertApprox(m[15], 1);
});

runner.test('scale matrix', () => {
  const m = mat4Scale(2, 3, 4);
  assertApprox(m[0], 2);
  assertApprox(m[5], 3);
  assertApprox(m[10], 4);
  assertApprox(m[15], 1);
});

runner.test('rotation X — 90 degrees', () => {
  const m = mat4RotationX(Math.PI / 2);
  assertApprox(m[5], 0);
  assertApprox(m[6], 1);
  assertApprox(m[9], -1);
  assertApprox(m[10], 0);
});

runner.test('rotation Y — 90 degrees', () => {
  const m = mat4RotationY(Math.PI / 2);
  assertApprox(m[0], 0);
  assertApprox(m[2], -1);
  assertApprox(m[8], 1);
  assertApprox(m[10], 0);
});

runner.test('rotation Z — 90 degrees', () => {
  const m = mat4RotationZ(Math.PI / 2);
  assertApprox(m[0], 0);
  assertApprox(m[1], 1);
  assertApprox(m[4], -1);
  assertApprox(m[5], 0);
});

runner.test('SRT composition — scale 2, no rotation, translate (10,0,0)', () => {
  const id: Mat4 = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
  const m = mat4SRT([2, 2, 2], id, [10, 0, 0]);
  const p = transformPoint(m, [1, 0, 0]);
  assertArrayApprox(p, [12, 0, 0]);
});

runner.test('quaternion from axis-angle — 90 degrees around Y', () => {
  const q = quatFromAxisAngle([0, 1, 0], Math.PI / 2);
  assertApprox(q[0], 0);
  assertApprox(q[1], Math.sin(Math.PI / 4));
  assertApprox(q[2], 0);
  assertApprox(q[3], Math.cos(Math.PI / 4));
});

runner.test('quaternion multiply — identity', () => {
  const id: Quat = [0, 0, 0, 1];
  const q = quatFromAxisAngle([0, 1, 0], Math.PI / 2);
  const result = quatMultiply(id, q);
  assertArrayApprox(result, q);
});

runner.test('quaternion to matrix — identity quat gives identity matrix', () => {
  const id: Quat = [0, 0, 0, 1];
  const m = quatToMat4(id);
  assertArrayApprox(Array.from(m), [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
});

runner.test('slerp t=0 returns a', () => {
  const a = quatFromAxisAngle([0, 1, 0], 0);
  const b = quatFromAxisAngle([0, 1, 0], Math.PI);
  const result = quatSlerp(a, b, 0);
  assertArrayApprox(result, a);
});

runner.test('slerp t=1 returns b', () => {
  const a = quatFromAxisAngle([0, 1, 0], 0);
  const b = quatFromAxisAngle([0, 1, 0], Math.PI / 2);
  const result = quatSlerp(a, b, 1);
  assertArrayApprox(result, b);
});

runner.test('slerp t=0.5 — halfway rotation', () => {
  const a = quatFromAxisAngle([0, 1, 0], 0);
  const b = quatFromAxisAngle([0, 1, 0], Math.PI / 2);
  const result = quatSlerp(a, b, 0.5);
  const expected = quatFromAxisAngle([0, 1, 0], Math.PI / 4);
  assertArrayApprox(result, expected, 1e-5);
});

runner.test('euler to quaternion — zero rotation', () => {
  const q = eulerToQuat(0, 0, 0);
  assertArrayApprox(q, [0, 0, 0, 1]);
});

runner.test('inverse quaternion', () => {
  const q = quatFromAxisAngle([0, 1, 0], Math.PI / 3);
  const inv = quatInverse(q);
  const product = quatMultiply(q, inv);
  assertArrayApprox(product, [0, 0, 0, 1], 1e-6);
});

runner.test('quaternion normalize', () => {
  const q: Quat = [1, 2, 3, 4];
  const n = quatNormalize(q);
  const len = Math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2 + n[3] ** 2);
  assertApprox(len, 1);
});

runner.test('apply transformation to point — translate (5,0,0)', () => {
  const m = mat4Translation(5, 0, 0);
  const p = transformPoint(m, [1, 2, 3]);
  assertArrayApprox(p, [6, 2, 3]);
});

runner.run();
