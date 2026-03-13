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
  // TODO: construire la matrice lookAt
  // 1. forward = normalize(eye - target)
  // 2. right = normalize(cross(up, forward))
  // 3. newUp = cross(forward, right)
  // 4. Assembler rotation + translation(-eye)
  return [
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ];
}

// ─── Projections ──────────────────────────────────────────────────────────────

function perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  // TODO: construire la matrice de projection perspective
  // f = 1 / tan(fovY / 2)
  // Convention OpenGL : Z dans [-1, 1]
  return [
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ];
}

function orthographic(
  left: number, right: number,
  bottom: number, top: number,
  near: number, far: number,
): Mat4 {
  // TODO: construire la matrice de projection orthographique
  return [
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ];
}

// ─── Projection / Unproject ───────────────────────────────────────────────────

function projectPointToNDC(mvp: Mat4, point: Vec3): Vec3 {
  // TODO: multiplier mvp * [point, 1] puis diviser par w
  return [0, 0, 0];
}

function unprojectToWorldRay(
  ndcX: number, ndcY: number,
  invViewProj: Mat4,
  eye: Vec3,
): { origin: Vec3; direction: Vec3 } {
  // TODO: transformer le point NDC (ndcX, ndcY, -1) par invViewProj
  // puis normaliser la direction depuis eye vers ce point monde
  return { origin: eye, direction: [0, 0, -1] };
}

// ─── Frustum plane extraction ─────────────────────────────────────────────────

interface Plane {
  normal: Vec3;
  d: number;
}

function extractFrustumPlanes(vp: Mat4): { near: Plane; far: Plane; left: Plane; right: Plane; top: Plane; bottom: Plane } {
  // TODO: extraire les 6 plans du frustum a partir de la matrice view-projection
  // Methode de Gribb/Hartmann : combiner les lignes de la matrice
  const zero: Plane = { normal: [0, 0, 0], d: 0 };
  return { near: zero, far: zero, left: zero, right: zero, top: zero, bottom: zero };
}

// ─── Viewport transform ──────────────────────────────────────────────────────

function viewportTransform(ndc: Vec3, width: number, height: number): [number, number] {
  // TODO: convertir NDC en pixels ecran
  // screenX = (ndcX + 1) / 2 * width
  // screenY = (1 - ndcY) / 2 * height  (Y inverse)
  return [0, 0];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 03 — Camera et projection');

runner.test('lookAt — eye at [0,0,5] looking at origin', () => {
  const view = lookAt([0, 0, 5], [0, 0, 0], [0, 1, 0]);
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
  assertApprox(proj[0], 1);
  assertApprox(proj[5], 1);
  assertApprox(proj[11], -1);
});

runner.test('perspective — near plane maps to NDC z=-1', () => {
  const proj = perspective(Math.PI / 2, 1, 0.1, 100);
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
  assertApprox(orth[0], 1);
  assertApprox(orth[5], 1);
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
  const ray = unprojectToWorldRay(0, 0, mat4Inverse(vp), eye);
  assertApprox(ray.direction[0], 0, 1e-4);
  assertApprox(ray.direction[1], 0, 1e-4);
  assertTrue(ray.direction[2] < 0, 'ray should point in -Z');
});

runner.test('frustum planes — near plane normal points into frustum', () => {
  const proj = perspective(Math.PI / 2, 1, 0.1, 100);
  const planes = extractFrustumPlanes(proj);
  assertTrue(planes.near.normal[2] < 0, 'near normal should have negative z');
});

runner.test('frustum planes — far plane normal points into frustum', () => {
  const proj = perspective(Math.PI / 2, 1, 0.1, 100);
  const planes = extractFrustumPlanes(proj);
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

// ─── Utility: 4x4 matrix inverse (fournie — pas a implementer) ──────────────

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
