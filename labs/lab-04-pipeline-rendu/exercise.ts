import {
  createTestRunner,
  assertApprox,
  assertArrayApprox,
  assertTrue,
  assertFalse,
  type Vec2,
  type Vec3,
  type Vec4,
  type Mat4,
  type Color,
} from '../test-utils.ts';

// ─── Edge function ────────────────────────────────────────────────────────────

/** 2D edge function: positive if P is to the left of edge A->B (CCW winding) */
function edgeFunction(a: Vec2, b: Vec2, p: Vec2): number {
  // TODO: (B.x - A.x) * (P.y - A.y) - (B.y - A.y) * (P.x - A.x)
  return 0;
}

/** Returns true if point P is inside the triangle (CCW winding) */
function isInsideTriangle(a: Vec2, b: Vec2, c: Vec2, p: Vec2): boolean {
  // TODO: verifier que les 3 edge functions sont >= 0
  return false;
}

// ─── Barycentric coordinates ──────────────────────────────────────────────────

function barycentric(a: Vec2, b: Vec2, c: Vec2, p: Vec2): Vec3 {
  // TODO: calculer les coordonnees barycentriques [u, v, w]
  // u = edge(B,C,P) / edge(A,B,C)
  // v = edge(C,A,P) / edge(A,B,C)
  // w = 1 - u - v
  return [0, 0, 0];
}

// ─── Attribute interpolation ──────────────────────────────────────────────────

function interpolateColor(bary: Vec3, c0: Color, c1: Color, c2: Color): Color {
  // TODO: interpoler chaque composante RGBA avec les poids barycentriques
  return [0, 0, 0, 0];
}

function interpolateFloat(bary: Vec3, a: number, b: number, c: number): number {
  // TODO: interpoler une valeur scalaire (ex: profondeur)
  return 0;
}

// ─── Depth test ───────────────────────────────────────────────────────────────

function depthTest(currentDepth: number, newDepth: number): boolean {
  // TODO: retourner true si le nouveau fragment est plus proche (z plus petit)
  return false;
}

// ─── Vertex transform ─────────────────────────────────────────────────────────

function vertexTransform(mvp: Mat4, position: Vec3): Vec4 {
  // TODO: multiplier MVP * [position, 1] -> retourner le Vec4 en clip space
  return [0, 0, 0, 0];
}

// ─── Clip space to NDC ────────────────────────────────────────────────────────

function clipToNDC(clipPos: Vec4): Vec3 {
  // TODO: perspective divide — diviser x, y, z par w
  return [0, 0, 0];
}

// ─── Backface culling ─────────────────────────────────────────────────────────

/** Returns signed area * 2. Positive = CCW (front), Negative = CW (back) */
function signedArea2D(a: Vec2, b: Vec2, c: Vec2): number {
  // TODO: (B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y)
  return 0;
}

function isFrontFace(a: Vec2, b: Vec2, c: Vec2): boolean {
  // TODO: front face si l'aire signee est positive (CCW)
  return false;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 04 — Pipeline de rendu');

const triA: Vec2 = [0, 0];
const triB: Vec2 = [4, 0];
const triC: Vec2 = [2, 3];

runner.test('edge function — point inside triangle (positive)', () => {
  const e = edgeFunction(triA, triB, [2, 1]);
  assertTrue(e > 0, 'edge function should be positive for inside point');
});

runner.test('edge function — point outside triangle (negative)', () => {
  const e = edgeFunction(triA, triB, [2, -1]);
  assertTrue(e < 0, 'edge function should be negative for outside point');
});

runner.test('isInsideTriangle — center point', () => {
  assertTrue(isInsideTriangle(triA, triB, triC, [2, 1]));
});

runner.test('isInsideTriangle — outside point', () => {
  assertFalse(isInsideTriangle(triA, triB, triC, [5, 5]));
});

runner.test('barycentric coordinates — at vertex A', () => {
  const bary = barycentric(triA, triB, triC, triA);
  assertApprox(bary[0], 1, 1e-5);
  assertApprox(bary[1], 0, 1e-5);
  assertApprox(bary[2], 0, 1e-5);
});

runner.test('barycentric coordinates — sum equals 1', () => {
  const bary = barycentric(triA, triB, triC, [2, 1]);
  assertApprox(bary[0] + bary[1] + bary[2], 1, 1e-5);
});

runner.test('interpolate color — at vertex A returns color A', () => {
  const red: Color = [1, 0, 0, 1];
  const green: Color = [0, 1, 0, 1];
  const blue: Color = [0, 0, 1, 1];
  const color = interpolateColor([1, 0, 0], red, green, blue);
  assertArrayApprox(color, [1, 0, 0, 1]);
});

runner.test('interpolate color — midpoint blend', () => {
  const red: Color = [1, 0, 0, 1];
  const green: Color = [0, 1, 0, 1];
  const blue: Color = [0, 0, 1, 1];
  const bary: Vec3 = [1/3, 1/3, 1/3];
  const color = interpolateColor(bary, red, green, blue);
  assertArrayApprox(color, [1/3, 1/3, 1/3, 1], 1e-5);
});

runner.test('depth interpolation via barycentric', () => {
  const depth = interpolateFloat([0.5, 0.3, 0.2], 0.1, 0.5, 0.9);
  assertApprox(depth, 0.5 * 0.1 + 0.3 * 0.5 + 0.2 * 0.9, 1e-5);
});

runner.test('depth test — closer fragment wins', () => {
  assertTrue(depthTest(0.8, 0.5), 'new fragment at 0.5 should replace 0.8');
});

runner.test('depth test — farther fragment rejected', () => {
  assertFalse(depthTest(0.3, 0.7), 'new fragment at 0.7 should not replace 0.3');
});

runner.test('vertex transform — identity MVP', () => {
  const id: Mat4 = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
  const clip = vertexTransform(id, [3, 4, 5]);
  assertArrayApprox(clip, [3, 4, 5, 1]);
});

runner.test('clip space to NDC — perspective divide', () => {
  const ndc = clipToNDC([2, 4, 6, 2]);
  assertArrayApprox(ndc, [1, 2, 3]);
});

runner.test('backface culling — CCW is front face', () => {
  assertTrue(isFrontFace([0, 0], [4, 0], [2, 3]));
});

runner.test('backface culling — CW is back face', () => {
  assertFalse(isFrontFace([0, 0], [2, 3], [4, 0]));
});

runner.run();
