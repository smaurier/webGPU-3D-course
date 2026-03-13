import {
  createTestRunner,
  assertEqual,
  assertDeepEqual,
  assertTrue,
  assertApprox,
  assertArrayApprox,
  type Vec2,
  type Vec3,
} from '../test-utils.ts';

// ─── Types locaux ────────────────────────────────────────────────────────────

interface UniformInfo {
  name: string;
  type: string;
}

interface AttributeInfo {
  name: string;
  type: string;
  location: number;
}

// ─── Parse GLSL uniform block ────────────────────────────────────────────────

/**
 * Parse un bloc GLSL et extrait les paires nom/type des uniforms.
 * Supporte : `uniform TYPE NAME;`
 */
function parseGLSLUniforms(source: string): UniformInfo[] {
  const results: UniformInfo[] = [];
  const regex = /uniform\s+(\w+)\s+(\w+)\s*;/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    results.push({ type: match[1], name: match[2] });
  }
  return results;
}

// ─── Parse GLSL attribute declarations ───────────────────────────────────────

/**
 * Parse les declarations d'attribut GLSL 300 es : `layout(location = N) in TYPE NAME;`
 */
function parseGLSLAttributes(source: string): AttributeInfo[] {
  const results: AttributeInfo[] = [];
  const regex = /layout\s*\(\s*location\s*=\s*(\d+)\s*\)\s*in\s+(\w+)\s+(\w+)\s*;/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    results.push({ location: parseInt(match[1]), type: match[2], name: match[3] });
  }
  return results;
}

// ─── Compute texture mipmap levels ───────────────────────────────────────────

function computeMipmapLevels(width: number, height: number): number {
  return Math.floor(Math.log2(Math.max(width, height))) + 1;
}

// ─── Texture coordinate wrapping ─────────────────────────────────────────────

function wrapRepeat(u: number): number {
  return u - Math.floor(u);
}

function wrapClamp(u: number): number {
  return Math.max(0, Math.min(1, u));
}

function wrapMirror(u: number): number {
  const t = Math.floor(u);
  const frac = u - t;
  // Si t est impair, on inverse
  return t % 2 === 0 ? frac : 1 - frac;
}

// ─── Bilinear interpolation ──────────────────────────────────────────────────

/**
 * Interpolation bilineaire entre 4 valeurs de texels.
 * c00 = top-left, c10 = top-right, c01 = bottom-left, c11 = bottom-right
 * u, v dans [0, 1]
 */
function bilinearInterpolation(
  c00: number, c10: number, c01: number, c11: number,
  u: number, v: number
): number {
  const top = c00 + (c10 - c00) * u;
  const bottom = c01 + (c11 - c01) * u;
  return top + (bottom - top) * v;
}

// ─── Generate UV coordinates for a sphere (spherical mapping) ────────────────

function sphericalUV(normal: Vec3): Vec2 {
  const [x, y, z] = normal;
  const u = Math.atan2(z, x) / (2 * Math.PI) + 0.5;
  const v = Math.asin(Math.max(-1, Math.min(1, y))) / Math.PI + 0.5;
  return [u, v];
}

// ─── Generate UV coordinates for a box (box mapping) ─────────────────────────

function boxUV(position: Vec3, normal: Vec3): Vec2 {
  const absN: Vec3 = [Math.abs(normal[0]), Math.abs(normal[1]), Math.abs(normal[2])];
  // L'axe dominant determine le plan de projection
  if (absN[0] >= absN[1] && absN[0] >= absN[2]) {
    // Face X : projeter sur YZ
    return [position[1], position[2]];
  } else if (absN[1] >= absN[0] && absN[1] >= absN[2]) {
    // Face Y : projeter sur XZ
    return [position[0], position[2]];
  } else {
    // Face Z : projeter sur XY
    return [position[0], position[1]];
  }
}

// ─── Pack/unpack normal [0,1] <-> [-1,1] ────────────────────────────────────

function packNormal(n: Vec3): Vec3 {
  return [n[0] * 0.5 + 0.5, n[1] * 0.5 + 0.5, n[2] * 0.5 + 0.5];
}

function unpackNormal(packed: Vec3): Vec3 {
  return [packed[0] * 2 - 1, packed[1] * 2 - 1, packed[2] * 2 - 1];
}

// ─── Compute tangent vector from triangle positions + UVs (TBN) ─────────────

function computeTangent(
  p0: Vec3, p1: Vec3, p2: Vec3,
  uv0: Vec2, uv1: Vec2, uv2: Vec2
): Vec3 {
  const edge1: Vec3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const edge2: Vec3 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];

  const dU1 = uv1[0] - uv0[0];
  const dV1 = uv1[1] - uv0[1];
  const dU2 = uv2[0] - uv0[0];
  const dV2 = uv2[1] - uv0[1];

  const f = 1.0 / (dU1 * dV2 - dU2 * dV1);

  const tangent: Vec3 = [
    f * (dV2 * edge1[0] - dV1 * edge2[0]),
    f * (dV2 * edge1[1] - dV1 * edge2[1]),
    f * (dV2 * edge1[2] - dV1 * edge2[2]),
  ];

  // Normaliser
  const len = Math.sqrt(tangent[0] ** 2 + tangent[1] ** 2 + tangent[2] ** 2);
  return [tangent[0] / len, tangent[1] / len, tangent[2] / len];
}

// ─── Compute bitangent ───────────────────────────────────────────────────────

function computeBitangent(
  p0: Vec3, p1: Vec3, p2: Vec3,
  uv0: Vec2, uv1: Vec2, uv2: Vec2
): Vec3 {
  const edge1: Vec3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const edge2: Vec3 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];

  const dU1 = uv1[0] - uv0[0];
  const dV1 = uv1[1] - uv0[1];
  const dU2 = uv2[0] - uv0[0];
  const dV2 = uv2[1] - uv0[1];

  const f = 1.0 / (dU1 * dV2 - dU2 * dV1);

  const bitangent: Vec3 = [
    f * (-dU2 * edge1[0] + dU1 * edge2[0]),
    f * (-dU2 * edge1[1] + dU1 * edge2[1]),
    f * (-dU2 * edge1[2] + dU1 * edge2[2]),
  ];

  const len = Math.sqrt(bitangent[0] ** 2 + bitangent[1] ** 2 + bitangent[2] ** 2);
  return [bitangent[0] / len, bitangent[1] / len, bitangent[2] / len];
}

// ─── Tests ───────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 07 — Shaders et GLSL');

// --- Parse GLSL uniforms ---
runner.test('parseGLSLUniforms — extraire les uniforms', () => {
  const src = `
    uniform mat4 uModelMatrix;
    uniform vec3 uLightPos;
    uniform float uTime;
  `;
  const uniforms = parseGLSLUniforms(src);
  assertEqual(uniforms.length, 3);
  assertDeepEqual(uniforms[0], { type: 'mat4', name: 'uModelMatrix' });
  assertDeepEqual(uniforms[1], { type: 'vec3', name: 'uLightPos' });
  assertDeepEqual(uniforms[2], { type: 'float', name: 'uTime' });
});

runner.test('parseGLSLUniforms — source vide', () => {
  assertDeepEqual(parseGLSLUniforms('void main() {}'), []);
});

// --- Parse GLSL attributes ---
runner.test('parseGLSLAttributes — extraire les attributs', () => {
  const src = `
    layout(location = 0) in vec3 aPosition;
    layout(location = 1) in vec3 aNormal;
    layout(location = 2) in vec2 aTexCoord;
  `;
  const attrs = parseGLSLAttributes(src);
  assertEqual(attrs.length, 3);
  assertDeepEqual(attrs[0], { location: 0, type: 'vec3', name: 'aPosition' });
  assertDeepEqual(attrs[1], { location: 1, type: 'vec3', name: 'aNormal' });
  assertDeepEqual(attrs[2], { location: 2, type: 'vec2', name: 'aTexCoord' });
});

// --- Mipmap levels ---
runner.test('computeMipmapLevels — 256x256 = 9 niveaux', () => {
  assertEqual(computeMipmapLevels(256, 256), 9);
});

runner.test('computeMipmapLevels — 1024x512 = 11 niveaux', () => {
  assertEqual(computeMipmapLevels(1024, 512), 11);
});

runner.test('computeMipmapLevels — 1x1 = 1 niveau', () => {
  assertEqual(computeMipmapLevels(1, 1), 1);
});

// --- Texture wrapping ---
runner.test('wrapRepeat — valeur > 1 retourne la fraction', () => {
  assertApprox(wrapRepeat(2.3), 0.3);
  assertApprox(wrapRepeat(-0.3), 0.7);
});

runner.test('wrapClamp — valeur clampee entre 0 et 1', () => {
  assertApprox(wrapClamp(1.5), 1.0);
  assertApprox(wrapClamp(-0.5), 0.0);
  assertApprox(wrapClamp(0.7), 0.7);
});

runner.test('wrapMirror — rebondit aux entiers', () => {
  assertApprox(wrapMirror(0.3), 0.3);
  assertApprox(wrapMirror(1.3), 0.7);
  assertApprox(wrapMirror(2.3), 0.3);
});

// --- Bilinear interpolation ---
runner.test('bilinearInterpolation — coins', () => {
  assertApprox(bilinearInterpolation(0, 1, 2, 3, 0, 0), 0);
  assertApprox(bilinearInterpolation(0, 1, 2, 3, 1, 0), 1);
  assertApprox(bilinearInterpolation(0, 1, 2, 3, 0, 1), 2);
  assertApprox(bilinearInterpolation(0, 1, 2, 3, 1, 1), 3);
});

runner.test('bilinearInterpolation — centre', () => {
  assertApprox(bilinearInterpolation(0, 1, 2, 3, 0.5, 0.5), 1.5);
});

// --- Spherical UV ---
runner.test('sphericalUV — pole nord (+Y)', () => {
  const uv = sphericalUV([0, 1, 0]);
  assertApprox(uv[1], 1.0);
});

runner.test('sphericalUV — pole sud (-Y)', () => {
  const uv = sphericalUV([0, -1, 0]);
  assertApprox(uv[1], 0.0);
});

// --- Box UV ---
runner.test('boxUV — face +Z projette sur XY', () => {
  const uv = boxUV([0.5, 0.7, 1.0], [0, 0, 1]);
  assertApprox(uv[0], 0.5);
  assertApprox(uv[1], 0.7);
});

runner.test('boxUV — face +X projette sur YZ', () => {
  const uv = boxUV([1.0, 0.3, 0.6], [1, 0, 0]);
  assertApprox(uv[0], 0.3);
  assertApprox(uv[1], 0.6);
});

// --- Pack/unpack normal ---
runner.test('packNormal — [-1,1] vers [0,1]', () => {
  assertArrayApprox(packNormal([0, 0, 1]), [0.5, 0.5, 1.0]);
  assertArrayApprox(packNormal([-1, -1, -1]), [0, 0, 0]);
});

runner.test('unpackNormal — [0,1] vers [-1,1]', () => {
  assertArrayApprox(unpackNormal([0.5, 0.5, 1.0]), [0, 0, 1]);
  assertArrayApprox(unpackNormal([0, 0, 0]), [-1, -1, -1]);
});

runner.test('pack puis unpack = identite', () => {
  const n: Vec3 = [0.577, 0.577, 0.577];
  assertArrayApprox(unpackNormal(packNormal(n)), n, 1e-4);
});

// --- Compute tangent (TBN) ---
runner.test('computeTangent — triangle dans le plan XY', () => {
  const p0: Vec3 = [0, 0, 0];
  const p1: Vec3 = [1, 0, 0];
  const p2: Vec3 = [0, 1, 0];
  const uv0: Vec2 = [0, 0];
  const uv1: Vec2 = [1, 0];
  const uv2: Vec2 = [0, 1];
  const T = computeTangent(p0, p1, p2, uv0, uv1, uv2);
  assertArrayApprox(T, [1, 0, 0], 1e-4);
});

runner.test('computeBitangent — triangle dans le plan XY', () => {
  const p0: Vec3 = [0, 0, 0];
  const p1: Vec3 = [1, 0, 0];
  const p2: Vec3 = [0, 1, 0];
  const uv0: Vec2 = [0, 0];
  const uv1: Vec2 = [1, 0];
  const uv2: Vec2 = [0, 1];
  const B = computeBitangent(p0, p1, p2, uv0, uv1, uv2);
  assertArrayApprox(B, [0, 1, 0], 1e-4);
});

runner.run();
