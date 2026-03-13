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
  // TODO: Utiliser une regex pour trouver toutes les declarations `uniform TYPE NAME;`
  // Retourner un tableau de { type, name }
  return [];
}

// ─── Parse GLSL attribute declarations ───────────────────────────────────────

/**
 * Parse les declarations d'attribut GLSL 300 es : `layout(location = N) in TYPE NAME;`
 */
function parseGLSLAttributes(source: string): AttributeInfo[] {
  // TODO: Utiliser une regex pour trouver `layout(location = N) in TYPE NAME;`
  // Retourner un tableau de { location, type, name }
  return [];
}

// ─── Compute texture mipmap levels ───────────────────────────────────────────

function computeMipmapLevels(width: number, height: number): number {
  // TODO: floor(log2(max(width, height))) + 1
  return 0;
}

// ─── Texture coordinate wrapping ─────────────────────────────────────────────

function wrapRepeat(u: number): number {
  // TODO: Retourner la partie fractionnaire (u - floor(u))
  return 0;
}

function wrapClamp(u: number): number {
  // TODO: Clamper u entre 0 et 1
  return 0;
}

function wrapMirror(u: number): number {
  // TODO: Si floor(u) est pair, retourner frac(u), sinon 1 - frac(u)
  return 0;
}

// ─── Bilinear interpolation ──────────────────────────────────────────────────

/**
 * Interpolation bilineaire entre 4 valeurs de texels.
 * c00 = top-left, c10 = top-right, c01 = bottom-left, c11 = bottom-right
 */
function bilinearInterpolation(
  c00: number, c10: number, c01: number, c11: number,
  u: number, v: number
): number {
  // TODO: Interpoler lineairement en u sur le haut et le bas, puis en v
  return 0;
}

// ─── Generate UV coordinates for a sphere (spherical mapping) ────────────────

function sphericalUV(normal: Vec3): Vec2 {
  // TODO: u = atan2(z, x) / (2*PI) + 0.5
  //       v = asin(y) / PI + 0.5
  return [0, 0];
}

// ─── Generate UV coordinates for a box (box mapping) ─────────────────────────

function boxUV(position: Vec3, normal: Vec3): Vec2 {
  // TODO: Determiner l'axe dominant de la normale.
  //       Projeter la position sur les 2 autres axes.
  return [0, 0];
}

// ─── Pack/unpack normal [0,1] <-> [-1,1] ────────────────────────────────────

function packNormal(n: Vec3): Vec3 {
  // TODO: Convertir de [-1,1] vers [0,1] : result = n * 0.5 + 0.5
  return [0, 0, 0];
}

function unpackNormal(packed: Vec3): Vec3 {
  // TODO: Convertir de [0,1] vers [-1,1] : result = packed * 2 - 1
  return [0, 0, 0];
}

// ─── Compute tangent vector from triangle positions + UVs (TBN) ─────────────

function computeTangent(
  p0: Vec3, p1: Vec3, p2: Vec3,
  uv0: Vec2, uv1: Vec2, uv2: Vec2
): Vec3 {
  // TODO: Calculer les edges et les deltas UV
  //       T = f * (dV2 * edge1 - dV1 * edge2), normaliser
  return [0, 0, 0];
}

function computeBitangent(
  p0: Vec3, p1: Vec3, p2: Vec3,
  uv0: Vec2, uv1: Vec2, uv2: Vec2
): Vec3 {
  // TODO: Calculer les edges et les deltas UV
  //       B = f * (-dU2 * edge1 + dU1 * edge2), normaliser
  return [0, 0, 0];
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
