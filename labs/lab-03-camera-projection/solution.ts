import {
  createTestRunner,
  assertApprox,
  assertArrayApprox,
  assertTrue,
  type Vec3,
  type Vec4,
  type Mat4,
} from '../test-utils.ts';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vec3Normalize(v: Vec3): Vec3 {
  const len = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
  return [v[0] / len, v[1] / len, v[2] / len];
}

function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function vec3Dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
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

// ─── Camera ───────────────────────────────────────────────────────────────────

function lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  const f = vec3Normalize(vec3Sub(eye, target)); // forward (eye looks toward -z)
  const r = vec3Normalize(vec3Cross(up, f));      // right
  const u = vec3Cross(f, r);                      // recalculated up

  return [
    r[0], u[0], f[0], 0,
    r[1], u[1], f[1], 0,
    r[2], u[2], f[2], 0,
    -vec3Dot(r, eye), -vec3Dot(u, eye), -vec3Dot(f, eye), 1,
  ];
}

// ─── Projections ──────────────────────────────────────────────────────────────

function perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  const rangeInv = 1 / (near - far);

  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (near + far) * rangeInv, -1,
    0, 0, 2 * near * far * rangeInv, 0,
  ];
}

function orthographic(
  left: number, right: number,
  bottom: number, top: number,
  near: number, far: number,
): Mat4 {
  const lr = 1 / (left - right);
  const bt = 1 / (bottom - top);
  const nf = 1 / (near - far);

  return [
    -2 * lr, 0, 0, 0,
    0, -2 * bt, 0, 0,
    0, 0, 2 * nf, 0,
    (left + right) * lr, (top + bottom) * bt, (near + far) * nf, 1,
  ];
}

// ─── Projection / Unproject ───────────────────────────────────────────────────

function projectPointToNDC(mvp: Mat4, point: Vec3): Vec3 {
  const x = mvp[0] * point[0] + mvp[4] * point[1] + mvp[8]  * point[2] + mvp[12];
  const y = mvp[1] * point[0] + mvp[5] * point[1] + mvp[9]  * point[2] + mvp[13];
  const z = mvp[2] * point[0] + mvp[6] * point[1] + mvp[10] * point[2] + mvp[14];
  const w = mvp[3] * point[0] + mvp[7] * point[1] + mvp[11] * point[2] + mvp[15];
  return [x / w, y / w, z / w];
}

function unprojectToWorldRay(
  ndcX: number, ndcY: number,
  invViewProj: Mat4,
  eye: Vec3,
): { origin: Vec3; direction: Vec3 } {
  // Point on the near plane in NDC
  const px = invViewProj[0] * ndcX + invViewProj[4] * ndcY + invViewProj[8]  * (-1) + invViewProj[12];
  const py = invViewProj[1] * ndcX + invViewProj[5] * ndcY + invViewProj[9]  * (-1) + invViewProj[13];
  const pz = invViewProj[2] * ndcX + invViewProj[6] * ndcY + invViewProj[10] * (-1) + invViewProj[14];
  const pw = invViewProj[3] * ndcX + invViewProj[7] * ndcY + invViewProj[11] * (-1) + invViewProj[15];

  const worldPoint: Vec3 = [px / pw, py / pw, pz / pw];
  const dir = vec3Normalize(vec3Sub(worldPoint, eye));

  return { origin: eye, direction: dir };
}

// ─── Frustum plane extraction ─────────────────────────────────────────────────

interface Plane {
  normal: Vec3;
  d: number;
}

function extractFrustumPlanes(vp: Mat4): { near: Plane; far: Plane; left: Plane; right: Plane; top: Plane; bottom: Plane } {
  // vp is column-major. Row i of the matrix is at indices [i, i+4, i+8, i+12]
  const row = (i: number): Vec4 => [vp[i], vp[i + 4], vp[i + 8], vp[i + 12]];

  const r0 = row(0);
  const r1 = row(1);
  const r2 = row(2);
  const r3 = row(3);

  function makePlane(a: number, b: number, c: number, d: number): Plane {
    const len = Math.sqrt(a * a + b * b + c * c);
    return { normal: [a / len, b / len, c / len], d: d / len };
  }

  return {
    near:   makePlane(r3[0] + r2[0], r3[1] + r2[1], r3[2] + r2[2], r3[3] + r2[3]),
    far:    makePlane(r3[0] - r2[0], r3[1] - r2[1], r3[2] - r2[2], r3[3] - r2[3]),
    left:   makePlane(r3[0] + r0[0], r3[1] + r0[1], r3[2] + r0[2], r3[3] + r0[3]),
    right:  makePlane(r3[0] - r0[0], r3[1] - r0[1], r3[2] - r0[2], r3[3] - r0[3]),
    top:    makePlane(r3[0] - r1[0], r3[1] - r1[1], r3[2] - r1[2], r3[3] - r1[3]),
    bottom: makePlane(r3[0] + r1[0], r3[1] + r1[1], r3[2] + r1[2], r3[3] + r1[3]),
  };
}

// ─── Viewport transform ──────────────────────────────────────────────────────

function viewportTransform(ndc: Vec3, width: number, height: number): [number, number] {
  const x = (ndc[0] + 1) / 2 * width;
  const y = (1 - ndc[1]) / 2 * height; // flip Y: NDC y-up, screen y-down
  return [x, y];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 03 — Camera et projection');

runner.test('lookAt — eye at [0,0,5] looking at origin', () => {
  const view = lookAt([0, 0, 5], [0, 0, 0], [0, 1, 0]);
  // The origin (0,0,0) in world should map to (0,0,-5) in view space
  const p: Vec3 = [0, 0, 0];
  const vx = view[0] * p[0] + view[4] * p[1] + view[8]  * p[2] + view[12];
  const vy = view[1] * p[0] + view[5] * p[1] + view[9]  * p[2] + view[13];
  const vz = view[2] * p[0] + view[6] * p[1] + view[10] * p[2] + view[14];
  assertApprox(vx, 0);
  assertApprox(vy, 0);
  assertApprox(vz, -5);
});

runner.test('lookAt — eye position transforms to origin in view space', () => {
  const eye: Vec3 = [0, 0, 5];
  const view = lookAt(eye, [0, 0, 0], [0, 1, 0]);
  const vx = view[0] * eye[0] + view[4] * eye[1] + view[8]  * eye[2] + view[12];
  const vy = view[1] * eye[0] + view[5] * eye[1] + view[9]  * eye[2] + view[13];
  const vz = view[2] * eye[0] + view[6] * eye[1] + view[10] * eye[2] + view[14];
  assertApprox(vx, 0);
  assertApprox(vy, 0);
  assertApprox(vz, 0);
});

runner.test('perspective matrix — fov=90, aspect=1', () => {
  const proj = perspective(Math.PI / 2, 1, 0.1, 100);
  // f = 1/tan(45deg) = 1
  assertApprox(proj[0], 1);  // f / aspect
  assertApprox(proj[5], 1);  // f
  // m[11] should be -1 (perspective divide flag)
  assertApprox(proj[11], -1);
});

runner.test('perspective — near plane maps to NDC z=-1', () => {
  const proj = perspective(Math.PI / 2, 1, 0.1, 100);
  // A point exactly on the near plane: (0, 0, -0.1) in view space
  const p: Vec3 = [0, 0, -0.1];
  const ndc = projectPointToNDC(proj, p);
  assertApprox(ndc[2], -1, 1e-4);
});

runner.test('perspective — far plane maps to NDC z=1', () => {
  const proj = perspective(Math.PI / 2, 1, 0.1, 100);
  const p: Vec3 = [0, 0, -100];
  const ndc = projectPointToNDC(proj, p);
  assertApprox(ndc[2], 1, 1e-4);
});

runner.test('orthographic matrix — basic properties', () => {
  const orth = orthographic(-1, 1, -1, 1, 0.1, 100);
  // For symmetric ortho: m[0] = 2/(r-l) = 1, m[5] = 2/(t-b) = 1
  assertApprox(orth[0], 1);
  assertApprox(orth[5], 1);
  // m[12] and m[13] should be 0 (symmetric)
  assertApprox(orth[12], 0);
  assertApprox(orth[13], 0);
});

runner.test('project point to NDC — center stays at origin', () => {
  const view = lookAt([0, 0, 5], [0, 0, 0], [0, 1, 0]);
  const proj = perspective(Math.PI / 2, 1, 0.1, 100);
  const mvp = mat4Multiply(proj, view);
  const ndc = projectPointToNDC(mvp, [0, 0, 0]);
  assertApprox(ndc[0], 0, 1e-4);
  assertApprox(ndc[1], 0, 1e-4);
});

runner.test('unproject NDC to world ray — center ray goes forward', () => {
  const eye: Vec3 = [0, 0, 5];
  const view = lookAt(eye, [0, 0, 0], [0, 1, 0]);
  const proj = perspective(Math.PI / 2, 1, 0.1, 100);
  const vp = mat4Multiply(proj, view);
  // Invert viewProj (we'll use a simple approach: shoot from center)
  // For center NDC (0,0), the ray should point in -Z direction
  // We'll compute the inverse manually for this specific case
  const ray = unprojectToWorldRay(0, 0, mat4Inverse(vp), eye);
  assertApprox(ray.direction[0], 0, 1e-4);
  assertApprox(ray.direction[1], 0, 1e-4);
  assertTrue(ray.direction[2] < 0, 'ray should point in -Z');
});

runner.test('frustum planes — near plane normal points into frustum', () => {
  const proj = perspective(Math.PI / 2, 1, 0.1, 100);
  const planes = extractFrustumPlanes(proj);
  // Near plane normal should point in -Z (into the frustum)
  assertTrue(planes.near.normal[2] < 0, 'near normal should have negative z');
});

runner.test('frustum planes — far plane normal points into frustum', () => {
  const proj = perspective(Math.PI / 2, 1, 0.1, 100);
  const planes = extractFrustumPlanes(proj);
  // Far plane normal should point in +Z (toward the camera)
  assertTrue(planes.far.normal[2] > 0, 'far normal should have positive z');
});

runner.test('viewport transform — NDC (0,0) maps to screen center', () => {
  const screen = viewportTransform([0, 0, 0], 800, 600);
  assertApprox(screen[0], 400);
  assertApprox(screen[1], 300);
});

runner.test('viewport transform — NDC (-1,-1) maps to bottom-left origin', () => {
  const screen = viewportTransform([-1, -1, 0], 800, 600);
  assertApprox(screen[0], 0);
  assertApprox(screen[1], 600);
});

runner.test('viewport transform — NDC (1,1) maps to top-right', () => {
  const screen = viewportTransform([1, 1, 0], 800, 600);
  assertApprox(screen[0], 800);
  assertApprox(screen[1], 0);
});

runner.run();

// ─── Utility: 4x4 matrix inverse (needed for unproject test) ─────────────────

function mat4Inverse(m: Mat4): Mat4 {
  const [
    m00, m01, m02, m03,
    m10, m11, m12, m13,
    m20, m21, m22, m23,
    m30, m31, m32, m33,
  ] = m;

  const b00 = m00 * m11 - m01 * m10;
  const b01 = m00 * m12 - m02 * m10;
  const b02 = m00 * m13 - m03 * m10;
  const b03 = m01 * m12 - m02 * m11;
  const b04 = m01 * m13 - m03 * m11;
  const b05 = m02 * m13 - m03 * m12;
  const b06 = m20 * m31 - m21 * m30;
  const b07 = m20 * m32 - m22 * m30;
  const b08 = m20 * m33 - m23 * m30;
  const b09 = m21 * m32 - m22 * m31;
  const b10 = m21 * m33 - m23 * m31;
  const b11 = m22 * m33 - m23 * m32;

  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  det = 1.0 / det;

  return [
    (m11 * b11 - m12 * b10 + m13 * b09) * det,
    (m02 * b10 - m01 * b11 - m03 * b09) * det,
    (m31 * b05 - m32 * b04 + m33 * b03) * det,
    (m22 * b04 - m21 * b05 - m23 * b03) * det,
    (m12 * b08 - m10 * b11 - m13 * b07) * det,
    (m00 * b11 - m02 * b08 + m03 * b07) * det,
    (m32 * b02 - m30 * b05 - m33 * b01) * det,
    (m20 * b05 - m22 * b02 + m23 * b01) * det,
    (m10 * b10 - m11 * b08 + m13 * b06) * det,
    (m01 * b08 - m00 * b10 - m03 * b06) * det,
    (m30 * b04 - m31 * b02 + m33 * b00) * det,
    (m21 * b02 - m20 * b04 - m23 * b00) * det,
    (m11 * b07 - m10 * b09 - m12 * b06) * det,
    (m00 * b09 - m01 * b07 + m02 * b06) * det,
    (m31 * b01 - m30 * b03 - m32 * b00) * det,
    (m20 * b03 - m21 * b01 + m22 * b00) * det,
  ];
}
