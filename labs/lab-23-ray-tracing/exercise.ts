import {
  createTestRunner,
  assertApprox,
  assertTrue,
  assertFalse,
  assertArrayApprox,
  type Vec3,
  type Triangle,
  type Ray,
  type AABB,
  type HitResult,
} from '../test-utils.ts';

// ─── Helpers Vec3 ────────────────────────────────────────────────────────────

function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vec3Scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function vec3Dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function vec3Length(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function vec3Normalize(v: Vec3): Vec3 {
  const len = vec3Length(v);
  if (len === 0) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function vec3Min(a: Vec3, b: Vec3): Vec3 {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
}

function vec3Max(a: Vec3, b: Vec3): Vec3 {
  return [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
}

// ─── Intersection rayon-sphere ───────────────────────────────────────────────

interface SphereHit {
  hit: boolean;
  t: number;
}

function raySphereIntersect(ray: Ray, center: Vec3, radius: number): SphereHit {
  // TODO: Resoudre l'equation quadratique |O + tD - C|^2 = r^2
  // 1. oc = ray.origin - center
  // 2. a = dot(D, D), b = 2*dot(oc, D), c = dot(oc, oc) - r^2
  // 3. discriminant = b^2 - 4ac
  // 4. Si < 0 : miss. Sinon prendre le plus petit t positif.
  return { hit: false, t: -1 };
}

// ─── Intersection rayon-triangle (Moller-Trumbore) ───────────────────────────

function rayTriangleIntersect(ray: Ray, tri: Triangle): HitResult {
  const noHit: HitResult = { hit: false, t: -1, point: [0, 0, 0], normal: [0, 0, 0], barycentric: [0, 0, 0] };

  // TODO: Algorithme de Moller-Trumbore
  // 1. edge1 = tri[1] - tri[0], edge2 = tri[2] - tri[0]
  // 2. h = cross(ray.direction, edge2)
  // 3. det = dot(edge1, h) — si ~0, rayon parallele
  // 4. Calculer u, v (coordonnees barycentriques)
  // 5. t = dot(edge2, q) * invDet — si < 0, triangle derriere
  // 6. point = origin + t*direction, normal = normalize(cross(edge1, edge2))
  return noHit;
}

// ─── Intersection rayon-AABB (methode des slabs) ─────────────────────────────

function rayAABBIntersect(ray: Ray, aabb: AABB): SphereHit {
  // TODO: Pour chaque axe (x, y, z) :
  // 1. t0 = (aabb.min[i] - origin[i]) / direction[i]
  // 2. t1 = (aabb.max[i] - origin[i]) / direction[i]
  // 3. si invD < 0, echanger t0 et t1
  // 4. tmin = max(tmin, t0), tmax = min(tmax, t1)
  // 5. si tmax < tmin : miss
  return { hit: false, t: -1 };
}

// ─── BVH ─────────────────────────────────────────────────────────────────────

interface BVHNode {
  aabb: AABB;
  left: BVHNode | null;
  right: BVHNode | null;
  triangles: Triangle[];
}

function computeAABB(triangles: Triangle[]): AABB {
  // TODO: Parcourir tous les sommets pour trouver min/max sur chaque axe
  let min: Vec3 = [Infinity, Infinity, Infinity];
  let max: Vec3 = [-Infinity, -Infinity, -Infinity];
  return { min, max };
}

function triangleCentroid(tri: Triangle): Vec3 {
  return [
    (tri[0][0] + tri[1][0] + tri[2][0]) / 3,
    (tri[0][1] + tri[1][1] + tri[2][1]) / 3,
    (tri[0][2] + tri[1][2] + tri[2][2]) / 3,
  ];
}

function buildBVH(triangles: Triangle[], maxLeafSize: number = 2): BVHNode {
  // TODO:
  // 1. Calculer l'AABB englobante
  // 2. Si triangles.length <= maxLeafSize, creer une feuille
  // 3. Sinon trouver l'axe le plus long, trier par centroide, couper au milieu
  // 4. Construire recursivement left et right
  const aabb = computeAABB(triangles);
  return { aabb, left: null, right: null, triangles };
}

function traverseBVH(node: BVHNode, ray: Ray): HitResult {
  const noHit: HitResult = { hit: false, t: -1, point: [0, 0, 0], normal: [0, 0, 0], barycentric: [0, 0, 0] };

  // TODO:
  // 1. Tester l'AABB du noeud — si miss, retourner noHit
  // 2. Si feuille, tester tous les triangles, garder le plus proche
  // 3. Sinon, traverser left et right, retourner le hit le plus proche
  return noHit;
}

// ─── Reflexion ───────────────────────────────────────────────────────────────

function reflect(incident: Vec3, normal: Vec3): Vec3 {
  // TODO: R = I - 2*(I . N)*N
  return [0, 0, 0];
}

// ─── Refraction (loi de Snell) ───────────────────────────────────────────────

function refract(incident: Vec3, normal: Vec3, eta: number): Vec3 | null {
  // TODO:
  // 1. cosI = -dot(I, N)
  // 2. sin2T = eta^2 * (1 - cosI^2)
  // 3. Si sin2T > 1, reflexion totale interne (retourner null)
  // 4. cosT = sqrt(1 - sin2T)
  // 5. Retourner eta*I + (eta*cosI - cosT)*N
  return null;
}

// ─── Fresnel (approximation de Schlick) ──────────────────────────────────────

function fresnelSchlick(cosTheta: number, f0: number): number {
  // TODO: f0 + (1 - f0) * (1 - cosTheta)^5
  return 0;
}

// ─── Echantillonnage hemisphere cosinus ──────────────────────────────────────

function cosineWeightedSample(u1: number, u2: number): Vec3 {
  // TODO:
  // r = sqrt(u1), theta = 2*PI*u2
  // x = r*cos(theta), y = r*sin(theta), z = sqrt(1 - u1)
  return [0, 0, 0];
}

// ─── Estimation de PI par Monte Carlo ────────────────────────────────────────

function estimatePI(numSamples: number, rng: () => number): number {
  // TODO:
  // Tirer numSamples points (x, y) dans [-1, 1]^2
  // Compter ceux dans le cercle unite (x^2 + y^2 <= 1)
  // PI ~ 4 * inside / numSamples
  return 0;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 23 — Ray Tracing');

// Ray-Sphere
runner.test('raySphere — hit', () => {
  const ray: Ray = { origin: [0, 0, -5], direction: [0, 0, 1] };
  const result = raySphereIntersect(ray, [0, 0, 0], 1);
  assertTrue(result.hit);
  assertApprox(result.t, 4);
});

runner.test('raySphere — miss', () => {
  const ray: Ray = { origin: [0, 5, -5], direction: [0, 0, 1] };
  const result = raySphereIntersect(ray, [0, 0, 0], 1);
  assertFalse(result.hit);
});

runner.test('raySphere — tangent', () => {
  const ray: Ray = { origin: [1, 0, -5], direction: [0, 0, 1] };
  const result = raySphereIntersect(ray, [0, 0, 0], 1);
  assertTrue(result.hit);
  assertApprox(result.t, 5);
});

runner.test('raySphere — origin inside sphere', () => {
  const ray: Ray = { origin: [0, 0, 0], direction: [0, 0, 1] };
  const result = raySphereIntersect(ray, [0, 0, 0], 2);
  assertTrue(result.hit);
  assertApprox(result.t, 2);
});

// Ray-Triangle (Moller-Trumbore)
runner.test('rayTriangle — hit with barycentric coords', () => {
  const tri: Triangle = [[0, 0, 0], [2, 0, 0], [0, 2, 0]];
  const ray: Ray = { origin: [0.5, 0.5, -1], direction: [0, 0, 1] };
  const result = rayTriangleIntersect(ray, tri);
  assertTrue(result.hit);
  assertApprox(result.t, 1);
  assertApprox(result.barycentric[0] + result.barycentric[1] + result.barycentric[2], 1);
});

runner.test('rayTriangle — miss', () => {
  const tri: Triangle = [[0, 0, 0], [2, 0, 0], [0, 2, 0]];
  const ray: Ray = { origin: [5, 5, -1], direction: [0, 0, 1] };
  const result = rayTriangleIntersect(ray, tri);
  assertFalse(result.hit);
});

runner.test('rayTriangle — parallel ray', () => {
  const tri: Triangle = [[0, 0, 0], [2, 0, 0], [0, 2, 0]];
  const ray: Ray = { origin: [0, 0, 0], direction: [1, 0, 0] };
  const result = rayTriangleIntersect(ray, tri);
  assertFalse(result.hit);
});

// Ray-AABB (slabs)
runner.test('rayAABB — hit', () => {
  const aabb: AABB = { min: [-1, -1, -1], max: [1, 1, 1] };
  const ray: Ray = { origin: [0, 0, -5], direction: [0, 0, 1] };
  const result = rayAABBIntersect(ray, aabb);
  assertTrue(result.hit);
  assertApprox(result.t, 4);
});

runner.test('rayAABB — miss', () => {
  const aabb: AABB = { min: [-1, -1, -1], max: [1, 1, 1] };
  const ray: Ray = { origin: [5, 5, -5], direction: [0, 0, 1] };
  const result = rayAABBIntersect(ray, aabb);
  assertFalse(result.hit);
});

runner.test('rayAABB — origin inside', () => {
  const aabb: AABB = { min: [-1, -1, -1], max: [1, 1, 1] };
  const ray: Ray = { origin: [0, 0, 0], direction: [0, 0, 1] };
  const result = rayAABBIntersect(ray, aabb);
  assertTrue(result.hit);
  assertApprox(result.t, 1);
});

// BVH construction
runner.test('BVH — construction splits triangles', () => {
  const tris: Triangle[] = [
    [[-2, 0, 0], [-1, 1, 0], [-1, 0, 0]],
    [[1, 0, 0], [2, 1, 0], [2, 0, 0]],
    [[-1, 0, 0], [0, 1, 0], [0, 0, 0]],
    [[0, 0, 0], [1, 1, 0], [1, 0, 0]],
  ];
  const bvh = buildBVH(tris, 2);
  assertTrue(bvh.left !== null, 'BVH should have left child');
  assertTrue(bvh.right !== null, 'BVH should have right child');
});

runner.test('BVH — AABB encloses all triangles', () => {
  const tris: Triangle[] = [
    [[-2, 0, 0], [-1, 1, 0], [-1, 0, 0]],
    [[1, 0, 0], [2, 1, 0], [2, 0, 0]],
  ];
  const bvh = buildBVH(tris, 2);
  assertTrue(bvh.aabb.min[0] <= -2);
  assertTrue(bvh.aabb.max[0] >= 2);
});

// BVH traversal
runner.test('BVH — traversal finds closest hit', () => {
  const tris: Triangle[] = [
    [[-1, -1, 2], [1, -1, 2], [0, 1, 2]],
    [[-1, -1, 5], [1, -1, 5], [0, 1, 5]],
  ];
  const bvh = buildBVH(tris, 1);
  const ray: Ray = { origin: [0, 0, 0], direction: [0, 0, 1] };
  const hit = traverseBVH(bvh, ray);
  assertTrue(hit.hit);
  assertApprox(hit.t, 2);
});

// Reflection
runner.test('reflect — 45° incidence', () => {
  const I: Vec3 = vec3Normalize([1, -1, 0]);
  const N: Vec3 = [0, 1, 0];
  const R = reflect(I, N);
  assertArrayApprox(R, vec3Normalize([1, 1, 0]), 1e-6);
});

// Refraction
runner.test('refract — Snell with eta=1 (no change)', () => {
  const I: Vec3 = vec3Normalize([1, -1, 0]);
  const N: Vec3 = [0, 1, 0];
  const R = refract(I, N, 1);
  assertTrue(R !== null);
  assertArrayApprox(R!, I, 1e-6);
});

runner.test('refract — total internal reflection', () => {
  const I: Vec3 = vec3Normalize([1, -0.3, 0]);
  const N: Vec3 = [0, 1, 0];
  const R = refract(I, N, 3.0);
  assertTrue(R === null, 'Should be total internal reflection');
});

// Fresnel (Schlick)
runner.test('fresnelSchlick — at 0° returns f0', () => {
  assertApprox(fresnelSchlick(1, 0.04), 0.04);
});

runner.test('fresnelSchlick — at 90° returns ~1', () => {
  assertApprox(fresnelSchlick(0, 0.04), 1);
});

// Hemisphere cosine-weighted sampling
runner.test('cosineWeightedSample — sample is in hemisphere (z >= 0)', () => {
  for (let i = 0; i < 10; i++) {
    const s = cosineWeightedSample(Math.random(), Math.random());
    assertTrue(s[2] >= 0, 'z component should be >= 0');
    assertApprox(vec3Length(s), 1, 0.01);
  }
});

// Monte Carlo estimation of PI
runner.test('estimatePI — converges near PI', () => {
  let seed = 42;
  const rng = () => { seed = (seed * 1664525 + 1013904223) & 0x7fffffff; return seed / 0x7fffffff; };
  const pi = estimatePI(100000, rng);
  assertApprox(pi, Math.PI, 0.05);
});

runner.run();
