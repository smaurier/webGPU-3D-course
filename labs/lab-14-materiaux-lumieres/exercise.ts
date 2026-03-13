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
  // TODO: verifier que metalness est dans [0,1], roughness dans [0,1],
  // et chaque composante de albedo dans [0,1]
  // Retourner { valid: true, errors: [] } si tout est correct
  // Sinon retourner les messages d'erreur correspondants
  return { valid: true, errors: [] };
}

// ─── Texture UV tiling ───────────────────────────────────────────────────────

function computeTiledUV(uv: Vec2, repeat: Vec2, offset: Vec2): Vec2 {
  // TODO: calculer finalUV = fract(uv * repeat + offset)
  // fract(x) = x - floor(x) (partie fractionnaire)
  return [0, 0];
}

// ─── Environment map direction ───────────────────────────────────────────────

function cubemapDirection(face: number, u: number, v: number): Vec3 {
  // TODO: convertir face (0=+X,1=-X,2=+Y,3=-Y,4=+Z,5=-Z) + uv en direction normalisee
  // Mapper u,v de [0,1] a [-1,1] (s = u*2-1, t = v*2-1)
  // +X: (1, -t, -s), -X: (-1, -t, s), +Y: (s, 1, t), -Y: (s, -1, -t)
  // +Z: (s, -t, 1), -Z: (-s, -t, -1)
  // Puis normaliser le vecteur resultant
  return [0, 0, 0];
}

// ─── Shadow map projection ───────────────────────────────────────────────────

function computeLightSpaceMatrix(
  lightDir: Vec3,
  lightUp: Vec3,
  orthoSize: number,
  near: number,
  far: number
): Mat4 {
  // TODO: construire une matrice de projection orthographique (column-major)
  // s = 1/orthoSize, depth = far - near
  // Matrice ortho:
  // [s, 0, 0, 0,  0, s, 0, 0,  0, 0, -2/depth, 0,  0, 0, -(far+near)/depth, 1]
  return [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0];
}

// ─── Shadow bias ─────────────────────────────────────────────────────────────

function computeShadowBias(baseBias: number, normalDotLight: number): number {
  // TODO: calculer le slope-scale bias
  // slopeFactor = max(1.0 - normalDotLight, 0)
  // return baseBias + baseBias * slopeFactor * 2.0
  return 0;
}

// ─── PCF kernel ──────────────────────────────────────────────────────────────

function generatePCFKernel(kernelSize: number): Vec2[] {
  // TODO: generer un tableau de Vec2 offsets pour un noyau kernelSize x kernelSize
  // Exemple pour 3x3: [[-1,-1], [0,-1], [1,-1], [-1,0], [0,0], [1,0], [-1,1], [0,1], [1,1]]
  // half = floor(kernelSize / 2), boucle de -half a +half
  return [];
}

// ─── Cascade splits ──────────────────────────────────────────────────────────

function computeCascadeSplits(
  numCascades: number,
  near: number,
  far: number,
  lambda: number // blend factor: 0 = lineaire, 1 = logarithmique
): number[] {
  // TODO: pour chaque cascade i (de 1 a numCascades):
  // t = i / numCascades
  // log = near * pow(far/near, t)
  // lin = near + (far - near) * t
  // split = lambda * log + (1-lambda) * lin
  return [];
}

// ─── Light frustum planes ────────────────────────────────────────────────────

interface FrustumBounds {
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
}

function computeLightFrustumBounds(sceneAABBMin: Vec3, sceneAABBMax: Vec3): FrustumBounds {
  // TODO: retourner les bornes du frustum de la lumiere a partir de l'AABB de la scene
  return { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
}

// ─── Color space conversions ─────────────────────────────────────────────────

function srgbToLinear(c: number): number {
  // TODO: si c <= 0.04045 retourner c / 12.92
  // sinon retourner pow((c + 0.055) / 1.055, 2.4)
  return 0;
}

function linearToSrgb(c: number): number {
  // TODO: si c <= 0.0031308 retourner c * 12.92
  // sinon retourner 1.055 * pow(c, 1/2.4) - 0.055
  return 0;
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
