import {
  createTestRunner,
  assertApprox,
  assertArrayApprox,
  assertTrue,
  type Vec3,
} from '../test-utils.ts';

// ─── Helpers (fournis) ────────────────────────────────────────────────────────

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize(v: Vec3): Vec3 {
  const len = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
  if (len === 0) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function reflect(incident: Vec3, normal: Vec3): Vec3 {
  const d = dot(incident, normal);
  return sub(incident, scale(normal, 2 * d));
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

// ─── Lambert diffuse ──────────────────────────────────────────────────────────

function lambertDiffuse(normal: Vec3, lightDir: Vec3): number {
  // TODO: max(0, dot(N, L))
  return 0;
}

// ─── Phong specular ───────────────────────────────────────────────────────────

function phongSpecular(normal: Vec3, lightDir: Vec3, viewDir: Vec3, shininess: number): number {
  // TODO: 1. R = reflect(-L, N)
  //       2. pow(max(0, dot(R, V)), shininess)
  return 0;
}

// ─── Blinn-Phong specular ─────────────────────────────────────────────────────

function blinnPhongSpecular(normal: Vec3, lightDir: Vec3, viewDir: Vec3, shininess: number): number {
  // TODO: 1. H = normalize(L + V)
  //       2. pow(max(0, dot(N, H)), shininess)
  return 0;
}

// ─── Point light attenuation ──────────────────────────────────────────────────

function pointLightAttenuation(distance: number, constant: number, linear: number, quadratic: number): number {
  // TODO: 1 / (constant + linear * d + quadratic * d^2)
  return 0;
}

// ─── Spotlight cone falloff ───────────────────────────────────────────────────

function spotlightFalloff(
  lightToFrag: Vec3,
  spotDirection: Vec3,
  innerCone: number,
  outerCone: number,
): number {
  // TODO: theta = dot(normalize(lightToFrag), normalize(spotDirection))
  //       epsilon = cos(innerCone) - cos(outerCone)
  //       clamp01((theta - cos(outerCone)) / epsilon)
  return 0;
}

// ─── Fresnel-Schlick ──────────────────────────────────────────────────────────

function fresnelSchlick(cosTheta: number, f0: Vec3): Vec3 {
  // TODO: f0 + (1 - f0) * pow(1 - cosTheta, 5)
  return [0, 0, 0];
}

// ─── GGX Normal Distribution ─────────────────────────────────────────────────

function distributionGGX(normal: Vec3, halfVec: Vec3, roughness: number): number {
  // TODO: a = roughness^2, a2 = a^2
  //       NdotH = max(0, dot(N, H))
  //       denom = NdotH^2 * (a2 - 1) + 1
  //       D = a2 / (PI * denom^2)
  return 0;
}

// ─── Smith Geometry function ──────────────────────────────────────────────────

function geometrySchlickGGX(NdotV: number, roughness: number): number {
  // TODO: k = (roughness + 1)^2 / 8
  //       NdotV / (NdotV * (1 - k) + k)
  return 0;
}

function geometrySmith(normal: Vec3, viewDir: Vec3, lightDir: Vec3, roughness: number): number {
  // TODO: G = SchlickGGX(NdotV) * SchlickGGX(NdotL)
  return 0;
}

// ─── Cook-Torrance BRDF ──────────────────────────────────────────────────────

function cookTorranceBRDF(
  normal: Vec3,
  viewDir: Vec3,
  lightDir: Vec3,
  albedo: Vec3,
  metallic: number,
  roughness: number,
): Vec3 {
  // TODO: combiner D, F, G pour le speculaire
  //       ajouter le diffus Lambert pondere par (1 - F) * (1 - metallic)
  //       retourner (kD * albedo/PI + specular) * NdotL
  return [0, 0, 0];
}

// ─── Tone mapping ─────────────────────────────────────────────────────────────

function reinhardToneMap(color: Vec3): Vec3 {
  // TODO: color / (color + 1) par composante
  return [0, 0, 0];
}

function linearToSRGB(color: Vec3): Vec3 {
  // TODO: pow(clamp01(c), 1/2.2) par composante
  return [0, 0, 0];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 05 — Lumiere et materiaux');

const N: Vec3 = [0, 1, 0];
const L: Vec3 = [0, 1, 0];
const V: Vec3 = [0, 1, 0];

runner.test('Lambert diffuse — light perpendicular to surface', () => {
  assertApprox(lambertDiffuse(N, L), 1);
});

runner.test('Lambert diffuse — light at 60 degrees', () => {
  const l60: Vec3 = normalize([1, 1, 0]);
  assertApprox(lambertDiffuse(N, l60), Math.cos(Math.PI / 4), 1e-5);
});

runner.test('Lambert diffuse — light behind surface returns 0', () => {
  assertApprox(lambertDiffuse(N, [0, -1, 0]), 0);
});

runner.test('Phong specular — perfect reflection', () => {
  const spec = phongSpecular(N, L, V, 32);
  assertApprox(spec, 1, 1e-5);
});

runner.test('Phong specular — off-angle reduces intensity', () => {
  const vOff: Vec3 = normalize([1, 1, 0]);
  const spec = phongSpecular(N, L, vOff, 32);
  assertTrue(spec < 1, 'off-angle specular should be less than 1');
  assertTrue(spec > 0, 'off-angle specular should still be positive');
});

runner.test('Blinn-Phong specular — perfect reflection', () => {
  const spec = blinnPhongSpecular(N, L, V, 32);
  assertApprox(spec, 1, 1e-5);
});

runner.test('Blinn-Phong — half vector computation', () => {
  const lSide: Vec3 = normalize([1, 1, 0]);
  const vSide: Vec3 = normalize([-1, 1, 0]);
  const spec = blinnPhongSpecular(N, lSide, vSide, 32);
  assertApprox(spec, 1, 1e-5);
});

runner.test('point light attenuation — distance 0', () => {
  assertApprox(pointLightAttenuation(0, 1, 0, 0), 1);
});

runner.test('point light attenuation — inverse square falloff', () => {
  const att = pointLightAttenuation(2, 0, 0, 1);
  assertApprox(att, 0.25);
});

runner.test('spotlight falloff — inside inner cone', () => {
  const inner = Math.PI / 6;
  const outer = Math.PI / 4;
  const falloff = spotlightFalloff([0, -1, 0], [0, -1, 0], inner, outer);
  assertApprox(falloff, 1);
});

runner.test('spotlight falloff — outside outer cone', () => {
  const inner = Math.PI / 6;
  const outer = Math.PI / 4;
  const falloff = spotlightFalloff([1, 0, 0], [0, -1, 0], inner, outer);
  assertApprox(falloff, 0);
});

runner.test('Fresnel-Schlick — at normal incidence returns f0', () => {
  const f0: Vec3 = [0.04, 0.04, 0.04];
  const fresnel = fresnelSchlick(1, f0);
  assertArrayApprox(fresnel, f0);
});

runner.test('Fresnel-Schlick — at grazing angle approaches 1', () => {
  const f0: Vec3 = [0.04, 0.04, 0.04];
  const fresnel = fresnelSchlick(0, f0);
  assertArrayApprox(fresnel, [1, 1, 1]);
});

runner.test('GGX distribution — peak at aligned half vector', () => {
  const d = distributionGGX(N, N, 0.5);
  assertTrue(d > 0, 'D should be positive when H = N');
});

runner.test('Smith geometry — smooth surface approaches 1', () => {
  const g = geometrySmith(N, V, L, 0.01);
  assertTrue(g > 0.9, `expected G > 0.9 for very smooth surface, got ${g}`);
});

runner.test('Cook-Torrance BRDF — non-negative output', () => {
  const result = cookTorranceBRDF(N, V, L, [1, 0, 0], 0.0, 0.5);
  assertTrue(result[0] >= 0 && result[1] >= 0 && result[2] >= 0, 'BRDF should be non-negative');
  assertTrue(result[0] > 0, 'red channel should be positive for red albedo');
});

runner.test('Reinhard tone mapping — maps 1.0 to 0.5', () => {
  const mapped = reinhardToneMap([1, 1, 1]);
  assertArrayApprox(mapped, [0.5, 0.5, 0.5]);
});

runner.test('Reinhard tone mapping — preserves 0', () => {
  const mapped = reinhardToneMap([0, 0, 0]);
  assertArrayApprox(mapped, [0, 0, 0]);
});

runner.test('linear to sRGB — mid gray', () => {
  const srgb = linearToSRGB([0.5, 0.5, 0.5]);
  assertApprox(srgb[0], Math.pow(0.5, 1 / 2.2), 1e-4);
});

runner.test('linear to sRGB — 0 stays 0, 1 stays 1', () => {
  const srgb = linearToSRGB([0, 1, 0]);
  assertApprox(srgb[0], 0);
  assertApprox(srgb[1], 1);
});

runner.run();
