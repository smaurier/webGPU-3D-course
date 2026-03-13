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
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vec3Scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function vec3Length(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function vec3Normalize(v: Vec3): Vec3 {
  const len = vec3Length(v);
  if (len === 0) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function vec3Dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function vec3Angle(a: Vec3, b: Vec3): number {
  const na = vec3Normalize(a);
  const nb = vec3Normalize(b);
  const d = vec3Dot(na, nb);
  return Math.acos(Math.max(-1, Math.min(1, d)));
}

// ─── Mat4 operations ─────────────────────────────────────────────────────────

function mat4Identity(): Mat4 {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

/** Column-major multiply: result = a * b */
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

function mat4Transpose(m: Mat4): Mat4 {
  return [
    m[0], m[4], m[8],  m[12],
    m[1], m[5], m[9],  m[13],
    m[2], m[6], m[10], m[14],
    m[3], m[7], m[11], m[15],
  ];
}

function mat4Determinant(m: Mat4): number {
  const [
    m0, m1, m2, m3,
    m4, m5, m6, m7,
    m8, m9, m10, m11,
    m12, m13, m14, m15,
  ] = m;

  return (
    m0 * (m5 * (m10 * m15 - m11 * m14) - m9 * (m6 * m15 - m7 * m14) + m13 * (m6 * m11 - m7 * m10)) -
    m4 * (m1 * (m10 * m15 - m11 * m14) - m9 * (m2 * m15 - m3 * m14) + m13 * (m2 * m11 - m3 * m10)) +
    m8 * (m1 * (m6 * m15 - m7 * m14) - m5 * (m2 * m15 - m3 * m14) + m13 * (m2 * m7 - m3 * m6)) -
    m12 * (m1 * (m6 * m11 - m7 * m10) - m5 * (m2 * m11 - m3 * m10) + m9 * (m2 * m7 - m3 * m6))
  );
}

// ─── Homogeneous coordinates ──────────────────────────────────────────────────

function pointToHomogeneous(p: Vec3): Vec4 {
  return [p[0], p[1], p[2], 1];
}

function directionToHomogeneous(d: Vec3): Vec4 {
  return [d[0], d[1], d[2], 0];
}

// ─── Float32Array conversion ──────────────────────────────────────────────────

function mat4ToFloat32Array(m: Mat4): Float32Array {
  return new Float32Array(m);
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
