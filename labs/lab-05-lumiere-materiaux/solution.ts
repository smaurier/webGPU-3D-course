import {
  createTestRunner,
  assertApprox,
  assertArrayApprox,
  assertTrue,
  type Vec3,
} from '../test-utils.ts';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  return Math.max(0, dot(normal, lightDir));
}

// ─── Phong specular ───────────────────────────────────────────────────────────

function phongSpecular(normal: Vec3, lightDir: Vec3, viewDir: Vec3, shininess: number): number {
  const r = reflect(scale(lightDir, -1), normal);
  return Math.pow(Math.max(0, dot(r, viewDir)), shininess);
}

// ─── Blinn-Phong specular ─────────────────────────────────────────────────────

function blinnPhongSpecular(normal: Vec3, lightDir: Vec3, viewDir: Vec3, shininess: number): number {
  const h = normalize(add(lightDir, viewDir));
  return Math.pow(Math.max(0, dot(normal, h)), shininess);
}

// ─── Point light attenuation ──────────────────────────────────────────────────

function pointLightAttenuation(distance: number, constant: number, linear: number, quadratic: number): number {
  return 1 / (constant + linear * distance + quadratic * distance * distance);
}

// ─── Spotlight cone falloff ───────────────────────────────────────────────────

function spotlightFalloff(
  lightToFrag: Vec3,
  spotDirection: Vec3,
  innerCone: number,
  outerCone: number,
): number {
  const theta = dot(normalize(lightToFrag), normalize(spotDirection));
  const epsilon = Math.cos(innerCone) - Math.cos(outerCone);
  return clamp01((theta - Math.cos(outerCone)) / epsilon);
}

// ─── Fresnel-Schlick ──────────────────────────────────────────────────────────

function fresnelSchlick(cosTheta: number, f0: Vec3): Vec3 {
  const factor = Math.pow(1 - cosTheta, 5);
  return [
    f0[0] + (1 - f0[0]) * factor,
    f0[1] + (1 - f0[1]) * factor,
    f0[2] + (1 - f0[2]) * factor,
  ];
}

// ─── GGX Normal Distribution ─────────────────────────────────────────────────

function distributionGGX(normal: Vec3, halfVec: Vec3, roughness: number): number {
  const a = roughness * roughness;
  const a2 = a * a;
  const NdotH = Math.max(0, dot(normal, halfVec));
  const NdotH2 = NdotH * NdotH;

  const denom = NdotH2 * (a2 - 1) + 1;
  return a2 / (Math.PI * denom * denom);
}

// ─── Smith Geometry function ──────────────────────────────────────────────────

function geometrySchlickGGX(NdotV: number, roughness: number): number {
  const r = roughness + 1;
  const k = (r * r) / 8;
  return NdotV / (NdotV * (1 - k) + k);
}

function geometrySmith(normal: Vec3, viewDir: Vec3, lightDir: Vec3, roughness: number): number {
  const NdotV = Math.max(0, dot(normal, viewDir));
  const NdotL = Math.max(0, dot(normal, lightDir));
  return geometrySchlickGGX(NdotV, roughness) * geometrySchlickGGX(NdotL, roughness);
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
  const h = normalize(add(viewDir, lightDir));
  const NdotL = Math.max(0, dot(normal, lightDir));
  const NdotV = Math.max(0, dot(normal, viewDir));

  if (NdotL <= 0 || NdotV <= 0) return [0, 0, 0];

  const f0Base: Vec3 = [0.04, 0.04, 0.04];
  const f0: Vec3 = [
    f0Base[0] + (albedo[0] - f0Base[0]) * metallic,
    f0Base[1] + (albedo[1] - f0Base[1]) * metallic,
    f0Base[2] + (albedo[2] - f0Base[2]) * metallic,
  ];

  const D = distributionGGX(normal, h, roughness);
  const G = geometrySmith(normal, viewDir, lightDir, roughness);
  const F = fresnelSchlick(Math.max(0, dot(h, viewDir)), f0);

  const denominator = 4 * NdotV * NdotL + 0.0001;

  const specular: Vec3 = [
    (D * G * F[0]) / denominator,
    (D * G * F[1]) / denominator,
    (D * G * F[2]) / denominator,
  ];

  const kS = F;
  const kD: Vec3 = [
    (1 - kS[0]) * (1 - metallic),
    (1 - kS[1]) * (1 - metallic),
    (1 - kS[2]) * (1 - metallic),
  ];

  return [
    (kD[0] * albedo[0] / Math.PI + specular[0]) * NdotL,
    (kD[1] * albedo[1] / Math.PI + specular[1]) * NdotL,
    (kD[2] * albedo[2] / Math.PI + specular[2]) * NdotL,
  ];
}

// ─── Tone mapping ─────────────────────────────────────────────────────────────

function reinhardToneMap(color: Vec3): Vec3 {
  return [
    color[0] / (color[0] + 1),
    color[1] / (color[1] + 1),
    color[2] / (color[2] + 1),
  ];
}

function linearToSRGB(color: Vec3): Vec3 {
  const gamma = 1 / 2.2;
  return [
    Math.pow(clamp01(color[0]), gamma),
    Math.pow(clamp01(color[1]), gamma),
    Math.pow(clamp01(color[2]), gamma),
  ];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 05 — Lumiere et materiaux');

const N: Vec3 = [0, 1, 0]; // normal pointing up
const L: Vec3 = [0, 1, 0]; // light from above
const V: Vec3 = [0, 1, 0]; // view from above

runner.test('Lambert diffuse — light perpendicular to surface', () => {
  assertApprox(lambertDiffuse(N, L), 1);
});

runner.test('Lambert diffuse — light at 60 degrees', () => {
  const l60: Vec3 = normalize([1, 1, 0]); // 45 deg actually
  assertApprox(lambertDiffuse(N, l60), Math.cos(Math.PI / 4), 1e-5);
});

runner.test('Lambert diffuse — light behind surface returns 0', () => {
  assertApprox(lambertDiffuse(N, [0, -1, 0]), 0);
});

runner.test('Phong specular — perfect reflection', () => {
  // Light and view both straight above: perfect specular
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
  // H = normalize(L+V) = [0,1,0] = N => dot(N,H) = 1
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
  const inner = Math.PI / 6;  // 30 deg
  const outer = Math.PI / 4;  // 45 deg
  // Fragment exactly in spot direction
  const falloff = spotlightFalloff([0, -1, 0], [0, -1, 0], inner, outer);
  assertApprox(falloff, 1);
});

runner.test('spotlight falloff — outside outer cone', () => {
  const inner = Math.PI / 6;
  const outer = Math.PI / 4;
  // Fragment at 90 degrees from spot direction
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
  // pow(0.5, 1/2.2) ≈ 0.7297
  assertApprox(srgb[0], Math.pow(0.5, 1 / 2.2), 1e-4);
});

runner.test('linear to sRGB — 0 stays 0, 1 stays 1', () => {
  const srgb = linearToSRGB([0, 1, 0]);
  assertApprox(srgb[0], 0);
  assertApprox(srgb[1], 1);
});

runner.run();
