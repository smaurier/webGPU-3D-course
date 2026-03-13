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
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    tx, ty, tz, 1,
  ];
}

function mat4Scale(sx: number, sy: number, sz: number): Mat4 {
  return [
    sx, 0, 0, 0,
    0, sy, 0, 0,
    0, 0, sz, 0,
    0, 0, 0, 1,
  ];
}

function mat4RotationX(angle: number): Mat4 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    1, 0, 0, 0,
    0, c, s, 0,
    0, -s, c, 0,
    0, 0, 0, 1,
  ];
}

function mat4RotationY(angle: number): Mat4 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, 0, 0, 1,
  ];
}

function mat4RotationZ(angle: number): Mat4 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    c, s, 0, 0,
    -s, c, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

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

/** SRT: M = T * R * S */
function mat4SRT(scale: Vec3, rotation: Mat4, translation: Vec3): Mat4 {
  const S = mat4Scale(scale[0], scale[1], scale[2]);
  const T = mat4Translation(translation[0], translation[1], translation[2]);
  return mat4Multiply(mat4Multiply(T, rotation), S);
}

// ─── Quaternions ──────────────────────────────────────────────────────────────

function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const halfAngle = angle / 2;
  const s = Math.sin(halfAngle);
  const len = Math.sqrt(axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2);
  return [
    (axis[0] / len) * s,
    (axis[1] / len) * s,
    (axis[2] / len) * s,
    Math.cos(halfAngle),
  ];
}

function quatMultiply(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

function quatToMat4(q: Quat): Mat4 {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;

  return [
    1 - (yy + zz), xy + wz, xz - wy, 0,
    xy - wz, 1 - (xx + zz), yz + wx, 0,
    xz + wy, yz - wx, 1 - (xx + yy), 0,
    0, 0, 0, 1,
  ];
}

function quatNormalize(q: Quat): Quat {
  const len = Math.sqrt(q[0] ** 2 + q[1] ** 2 + q[2] ** 2 + q[3] ** 2);
  if (len === 0) return [0, 0, 0, 1];
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

function quatInverse(q: Quat): Quat {
  const lenSq = q[0] ** 2 + q[1] ** 2 + q[2] ** 2 + q[3] ** 2;
  return [-q[0] / lenSq, -q[1] / lenSq, -q[2] / lenSq, q[3] / lenSq];
}

function quatSlerp(a: Quat, b: Quat, t: number): Quat {
  let bx = b[0], by = b[1], bz = b[2], bw = b[3];

  let cosHalfTheta = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;

  if (cosHalfTheta < 0) {
    bx = -bx; by = -by; bz = -bz; bw = -bw;
    cosHalfTheta = -cosHalfTheta;
  }

  if (cosHalfTheta >= 1.0) {
    return [a[0], a[1], a[2], a[3]];
  }

  const halfTheta = Math.acos(cosHalfTheta);
  const sinHalfTheta = Math.sin(halfTheta);

  if (Math.abs(sinHalfTheta) < 1e-6) {
    return [
      a[0] * 0.5 + bx * 0.5,
      a[1] * 0.5 + by * 0.5,
      a[2] * 0.5 + bz * 0.5,
      a[3] * 0.5 + bw * 0.5,
    ];
  }

  const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
  const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;

  return [
    a[0] * ratioA + bx * ratioB,
    a[1] * ratioA + by * ratioB,
    a[2] * ratioA + bz * ratioB,
    a[3] * ratioA + bw * ratioB,
  ];
}

function eulerToQuat(x: number, y: number, z: number): Quat {
  const cx = Math.cos(x / 2), sx = Math.sin(x / 2);
  const cy = Math.cos(y / 2), sy = Math.sin(y / 2);
  const cz = Math.cos(z / 2), sz = Math.sin(z / 2);

  return [
    sx * cy * cz - cx * sy * sz,
    cx * sy * cz + sx * cy * sz,
    cx * cy * sz - sx * sy * cz,
    cx * cy * cz + sx * sy * sz,
  ];
}

/** Apply a transformation matrix to a point (w=1) */
function transformPoint(m: Mat4, p: Vec3): Vec3 {
  const x = m[0] * p[0] + m[4] * p[1] + m[8]  * p[2] + m[12];
  const y = m[1] * p[0] + m[5] * p[1] + m[9]  * p[2] + m[13];
  const z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
  return [x, y, z];
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
  assertApprox(m[5], 0);   // cos(90)
  assertApprox(m[6], 1);   // sin(90)
  assertApprox(m[9], -1);  // -sin(90)
  assertApprox(m[10], 0);  // cos(90)
});

runner.test('rotation Y — 90 degrees', () => {
  const m = mat4RotationY(Math.PI / 2);
  assertApprox(m[0], 0);   // cos(90)
  assertApprox(m[2], -1);  // -sin(90)
  assertApprox(m[8], 1);   // sin(90)
  assertApprox(m[10], 0);  // cos(90)
});

runner.test('rotation Z — 90 degrees', () => {
  const m = mat4RotationZ(Math.PI / 2);
  assertApprox(m[0], 0);   // cos(90)
  assertApprox(m[1], 1);   // sin(90)
  assertApprox(m[4], -1);  // -sin(90)
  assertApprox(m[5], 0);   // cos(90)
});

runner.test('SRT composition — scale 2, no rotation, translate (10,0,0)', () => {
  const id: Mat4 = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
  const m = mat4SRT([2, 2, 2], id, [10, 0, 0]);
  // A point at (1,0,0) should become (2,0,0) after scale, then (12,0,0) after translate
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
