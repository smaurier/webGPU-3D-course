import {
  createTestRunner,
  assertEqual,
  assertApprox,
  assertTrue,
  assertFalse,
  assertArrayApprox,
  assertDeepEqual,
  type Vec2,
  type Vec3,
  type Mat4,
} from '../test-utils.ts';

// ─── PBR Material validation ─────────────────────────────────────────────────

interface PBRMaterial {
  metalness: number;
  roughness: number;
  albedo: Vec3;
}

function validatePBRMaterial(mat: PBRMaterial): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (mat.metalness < 0 || mat.metalness > 1) errors.push('metalness out of range');
  if (mat.roughness < 0 || mat.roughness > 1) errors.push('roughness out of range');
  for (let i = 0; i < 3; i++) {
    if (mat.albedo[i] < 0 || mat.albedo[i] > 1) {
      errors.push('albedo out of range');
      break;
    }
  }
  return { valid: errors.length === 0, errors };
}

// ─── Texture UV tiling ───────────────────────────────────────────────────────

function computeTiledUV(uv: Vec2, repeat: Vec2, offset: Vec2): Vec2 {
  const fract = (x: number) => x - Math.floor(x);
  return [
    fract(uv[0] * repeat[0] + offset[0]),
    fract(uv[1] * repeat[1] + offset[1]),
  ];
}

// ─── Environment map direction ───────────────────────────────────────────────

function cubemapDirection(face: number, u: number, v: number): Vec3 {
  // face: 0=+X, 1=-X, 2=+Y, 3=-Y, 4=+Z, 5=-Z
  // u,v in [0,1], mapped to [-1,1]
  const s = u * 2 - 1;
  const t = v * 2 - 1;
  let dir: Vec3;
  switch (face) {
    case 0: dir = [ 1, -t, -s]; break; // +X
    case 1: dir = [-1, -t,  s]; break; // -X
    case 2: dir = [ s,  1,  t]; break; // +Y
    case 3: dir = [ s, -1, -t]; break; // -Y
    case 4: dir = [ s, -t,  1]; break; // +Z
    case 5: dir = [-s, -t, -1]; break; // -Z
    default: dir = [0, 0, 0];
  }
  const len = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]);
  return [dir[0] / len, dir[1] / len, dir[2] / len];
}

// ─── Shadow map projection ───────────────────────────────────────────────────

function computeLightSpaceMatrix(
  lightDir: Vec3,
  lightUp: Vec3,
  orthoSize: number,
  near: number,
  far: number
): Mat4 {
  // Simplified: view = lookAt from -lightDir to origin, projection = orthographic
  // Normalize lightDir
  const len = Math.sqrt(lightDir[0] ** 2 + lightDir[1] ** 2 + lightDir[2] ** 2);
  const fwd: Vec3 = [lightDir[0] / len, lightDir[1] / len, lightDir[2] / len];

  // right = cross(fwd, up)
  const right: Vec3 = [
    fwd[1] * lightUp[2] - fwd[2] * lightUp[1],
    fwd[2] * lightUp[0] - fwd[0] * lightUp[2],
    fwd[0] * lightUp[1] - fwd[1] * lightUp[0],
  ];
  const rlen = Math.sqrt(right[0] ** 2 + right[1] ** 2 + right[2] ** 2);
  right[0] /= rlen; right[1] /= rlen; right[2] /= rlen;

  // up = cross(right, fwd)
  const up: Vec3 = [
    right[1] * fwd[2] - right[2] * fwd[1],
    right[2] * fwd[0] - right[0] * fwd[2],
    right[0] * fwd[1] - right[1] * fwd[0],
  ];

  // Orthographic projection (column-major)
  const s = 1 / orthoSize;
  const depth = far - near;

  // View matrix * ortho projection combined (simplified)
  // For this exercise we return the orthographic projection matrix only
  const ortho: Mat4 = [
    s, 0, 0, 0,
    0, s, 0, 0,
    0, 0, -2 / depth, 0,
    0, 0, -(far + near) / depth, 1,
  ];
  return ortho;
}

// ─── Shadow bias ─────────────────────────────────────────────────────────────

function computeShadowBias(baseBias: number, normalDotLight: number): number {
  // Slope-scale bias: more bias when surface is nearly parallel to light
  const slopeFactor = Math.max(1.0 - normalDotLight, 0);
  return baseBias + baseBias * slopeFactor * 2.0;
}

// ─── PCF kernel ──────────────────────────────────────────────────────────────

function generatePCFKernel(kernelSize: number): Vec2[] {
  const offsets: Vec2[] = [];
  const half = Math.floor(kernelSize / 2);
  for (let y = -half; y <= half; y++) {
    for (let x = -half; x <= half; x++) {
      offsets.push([x, y]);
    }
  }
  return offsets;
}

// ─── Cascade splits ──────────────────────────────────────────────────────────

function computeCascadeSplits(
  numCascades: number,
  near: number,
  far: number,
  lambda: number // blend factor: 0 = linear, 1 = logarithmic
): number[] {
  const splits: number[] = [];
  for (let i = 1; i <= numCascades; i++) {
    const t = i / numCascades;
    const log = near * Math.pow(far / near, t);
    const lin = near + (far - near) * t;
    splits.push(lambda * log + (1 - lambda) * lin);
  }
  return splits;
}

// ─── Light frustum planes ────────────────────────────────────────────────────

interface FrustumBounds {
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
}

function computeLightFrustumBounds(sceneAABBMin: Vec3, sceneAABBMax: Vec3): FrustumBounds {
  return {
    minX: sceneAABBMin[0],
    maxX: sceneAABBMax[0],
    minY: sceneAABBMin[1],
    maxY: sceneAABBMax[1],
    minZ: sceneAABBMin[2],
    maxZ: sceneAABBMax[2],
  };
}

// ─── Color space conversions ─────────────────────────────────────────────────

function srgbToLinear(c: number): number {
  if (c <= 0.04045) return c / 12.92;
  return Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  if (c <= 0.0031308) return c * 12.92;
  return 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 14 — Materiaux et lumieres');

// PBR validation
runner.test('PBR material valide', () => {
  const result = validatePBRMaterial({ metalness: 0.5, roughness: 0.3, albedo: [1, 0.5, 0.2] });
  assertTrue(result.valid);
  assertEqual(result.errors.length, 0);
});

runner.test('PBR material — metalness hors limites', () => {
  const result = validatePBRMaterial({ metalness: 1.5, roughness: 0.3, albedo: [1, 0.5, 0.2] });
  assertFalse(result.valid);
  assertTrue(result.errors.includes('metalness out of range'));
});

runner.test('PBR material — roughness negative', () => {
  const result = validatePBRMaterial({ metalness: 0.5, roughness: -0.1, albedo: [1, 0.5, 0.2] });
  assertFalse(result.valid);
  assertTrue(result.errors.includes('roughness out of range'));
});

// UV tiling
runner.test('computeTiledUV avec repeat (2,2) et offset (0,0)', () => {
  const uv = computeTiledUV([0.75, 0.75], [2, 2], [0, 0]);
  assertApprox(uv[0], 0.5);
  assertApprox(uv[1], 0.5);
});

runner.test('computeTiledUV avec offset (0.5, 0)', () => {
  const uv = computeTiledUV([0.3, 0.5], [1, 1], [0.5, 0]);
  assertApprox(uv[0], 0.8);
  assertApprox(uv[1], 0.5);
});

// Cubemap direction
runner.test('cubemapDirection face +X centre donne (1,0,0)', () => {
  const dir = cubemapDirection(0, 0.5, 0.5);
  assertApprox(dir[0], 1);
  assertApprox(dir[1], 0, 1e-6);
  assertApprox(dir[2], 0, 1e-6);
});

// Shadow bias
runner.test('computeShadowBias — surface face a la lumiere', () => {
  const bias = computeShadowBias(0.001, 1.0);
  assertApprox(bias, 0.001);
});

runner.test('computeShadowBias — surface rasante augmente le bias', () => {
  const bias = computeShadowBias(0.001, 0.0);
  assertTrue(bias > 0.001);
  assertApprox(bias, 0.003);
});

// PCF kernel
runner.test('generatePCFKernel 3x3 produit 9 offsets', () => {
  const kernel = generatePCFKernel(3);
  assertEqual(kernel.length, 9);
  assertDeepEqual(kernel[0], [-1, -1]);
  assertDeepEqual(kernel[4], [0, 0]);
  assertDeepEqual(kernel[8], [1, 1]);
});

// Cascade splits
runner.test('computeCascadeSplits — 4 cascades, lambda=0 (lineaire)', () => {
  const splits = computeCascadeSplits(4, 0.1, 100, 0);
  assertEqual(splits.length, 4);
  assertApprox(splits[3], 100);
  assertApprox(splits[0], 0.1 + (100 - 0.1) * 0.25);
});

runner.test('computeCascadeSplits — 4 cascades, lambda=1 (logarithmique)', () => {
  const splits = computeCascadeSplits(4, 0.1, 100, 1);
  assertEqual(splits.length, 4);
  assertApprox(splits[3], 100);
  // First split: near * (far/near)^(1/4) = 0.1 * 1000^0.25
  assertApprox(splits[0], 0.1 * Math.pow(1000, 0.25));
});

// sRGB <-> linear
runner.test('srgbToLinear — valeur basse (lineaire)', () => {
  assertApprox(srgbToLinear(0.04045), 0.04045 / 12.92);
});

runner.test('srgbToLinear — valeur moyenne', () => {
  assertApprox(srgbToLinear(0.5), Math.pow((0.5 + 0.055) / 1.055, 2.4), 1e-4);
});

runner.test('linearToSrgb — aller-retour', () => {
  const original = 0.73;
  const linear = srgbToLinear(original);
  const back = linearToSrgb(linear);
  assertApprox(back, original, 1e-4);
});

runner.test('linearToSrgb — valeur basse', () => {
  assertApprox(linearToSrgb(0.002), 0.002 * 12.92, 1e-6);
});

runner.run();
