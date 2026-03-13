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
  const oc = vec3Sub(ray.origin, center);
  const a = vec3Dot(ray.direction, ray.direction);
  const b = 2 * vec3Dot(oc, ray.direction);
  const c = vec3Dot(oc, oc) - radius * radius;
  const discriminant = b * b - 4 * a * c;

  if (discriminant < 0) return { hit: false, t: -1 };

  const sqrtD = Math.sqrt(discriminant);
  let t = (-b - sqrtD) / (2 * a);
  if (t < 0) t = (-b + sqrtD) / (2 * a);
  if (t < 0) return { hit: false, t: -1 };

  return { hit: true, t };
}

// ─── Intersection rayon-triangle (Moller-Trumbore) ───────────────────────────

function rayTriangleIntersect(ray: Ray, tri: Triangle): HitResult {
  const noHit: HitResult = { hit: false, t: -1, point: [0, 0, 0], normal: [0, 0, 0], barycentric: [0, 0, 0] };

  const edge1 = vec3Sub(tri[1], tri[0]);
  const edge2 = vec3Sub(tri[2], tri[0]);
  const h = vec3Cross(ray.direction, edge2);
  const det = vec3Dot(edge1, h);

  if (Math.abs(det) < 1e-8) return noHit; // parallele

  const invDet = 1 / det;
  const s = vec3Sub(ray.origin, tri[0]);
  const u = vec3Dot(s, h) * invDet;
  if (u < 0 || u > 1) return noHit;

  const q = vec3Cross(s, edge1);
  const v = vec3Dot(ray.direction, q) * invDet;
  if (v < 0 || u + v > 1) return noHit;

  const t = vec3Dot(edge2, q) * invDet;
  if (t < 0) return noHit;

  const point = vec3Add(ray.origin, vec3Scale(ray.direction, t));
  const normal = vec3Normalize(vec3Cross(edge1, edge2));
  const w = 1 - u - v;

  return { hit: true, t, point, normal, barycentric: [w, u, v] };
}

// ─── Intersection rayon-AABB (methode des slabs) ─────────────────────────────

function rayAABBIntersect(ray: Ray, aabb: AABB): SphereHit {
  let tmin = -Infinity;
  let tmax = Infinity;

  for (let i = 0; i < 3; i++) {
    const invD = 1 / ray.direction[i];
    let t0 = (aabb.min[i] - ray.origin[i]) * invD;
    let t1 = (aabb.max[i] - ray.origin[i]) * invD;
    if (invD < 0) { const tmp = t0; t0 = t1; t1 = tmp; }
    tmin = Math.max(tmin, t0);
    tmax = Math.min(tmax, t1);
    if (tmax < tmin) return { hit: false, t: -1 };
  }

  const t = tmin >= 0 ? tmin : tmax;
  if (t < 0) return { hit: false, t: -1 };
  return { hit: true, t };
}

// ─── BVH ─────────────────────────────────────────────────────────────────────

interface BVHNode {
  aabb: AABB;
  left: BVHNode | null;
  right: BVHNode | null;
  triangles: Triangle[];
}

function computeAABB(triangles: Triangle[]): AABB {
  let min: Vec3 = [Infinity, Infinity, Infinity];
  let max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const tri of triangles) {
    for (const v of tri) {
      min = vec3Min(min, v);
      max = vec3Max(max, v);
    }
  }
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
  const aabb = computeAABB(triangles);

  if (triangles.length <= maxLeafSize) {
    return { aabb, left: null, right: null, triangles };
  }

  // Find longest axis
  const extent = vec3Sub(aabb.max, aabb.min);
  let axis = 0;
  if (extent[1] > extent[0]) axis = 1;
  if (extent[2] > extent[axis]) axis = 2;

  // Sort by centroid on that axis
  const sorted = [...triangles].sort(
    (a, b) => triangleCentroid(a)[axis] - triangleCentroid(b)[axis]
  );

  const mid = Math.floor(sorted.length / 2);
  const left = buildBVH(sorted.slice(0, mid), maxLeafSize);
  const right = buildBVH(sorted.slice(mid), maxLeafSize);

  return { aabb, left, right, triangles: [] };
}

function traverseBVH(node: BVHNode, ray: Ray): HitResult {
  const noHit: HitResult = { hit: false, t: -1, point: [0, 0, 0], normal: [0, 0, 0], barycentric: [0, 0, 0] };

  const aabbHit = rayAABBIntersect(ray, node.aabb);
  if (!aabbHit.hit) return noHit;

  // Leaf node
  if (node.triangles.length > 0) {
    let closest = noHit;
    for (const tri of node.triangles) {
      const hit = rayTriangleIntersect(ray, tri);
      if (hit.hit && (closest.t < 0 || hit.t < closest.t)) {
        closest = hit;
      }
    }
    return closest;
  }

  // Internal node
  const leftHit = node.left ? traverseBVH(node.left, ray) : noHit;
  const rightHit = node.right ? traverseBVH(node.right, ray) : noHit;

  if (!leftHit.hit) return rightHit;
  if (!rightHit.hit) return leftHit;
  return leftHit.t < rightHit.t ? leftHit : rightHit;
}

// ─── Reflexion ───────────────────────────────────────────────────────────────

function reflect(incident: Vec3, normal: Vec3): Vec3 {
  const d = vec3Dot(incident, normal);
  return vec3Sub(incident, vec3Scale(normal, 2 * d));
}

// ─── Refraction (loi de Snell) ───────────────────────────────────────────────

function refract(incident: Vec3, normal: Vec3, eta: number): Vec3 | null {
  const cosI = -vec3Dot(incident, normal);
  const sin2T = eta * eta * (1 - cosI * cosI);
  if (sin2T > 1) return null; // reflexion totale interne
  const cosT = Math.sqrt(1 - sin2T);
  return vec3Add(vec3Scale(incident, eta), vec3Scale(normal, eta * cosI - cosT));
}

// ─── Fresnel (approximation de Schlick) ──────────────────────────────────────

function fresnelSchlick(cosTheta: number, f0: number): number {
  return f0 + (1 - f0) * Math.pow(1 - cosTheta, 5);
}

// ─── Echantillonnage hemisphere cosinus ──────────────────────────────────────

function cosineWeightedSample(u1: number, u2: number): Vec3 {
  const r = Math.sqrt(u1);
  const theta = 2 * Math.PI * u2;
  const x = r * Math.cos(theta);
  const y = r * Math.sin(theta);
  const z = Math.sqrt(1 - u1);
  return [x, y, z];
}

// ─── Estimation de PI par Monte Carlo ────────────────────────────────────────

function estimatePI(numSamples: number, rng: () => number): number {
  let inside = 0;
  for (let i = 0; i < numSamples; i++) {
    const x = rng() * 2 - 1;
    const y = rng() * 2 - 1;
    if (x * x + y * y <= 1) inside++;
  }
  return 4 * inside / numSamples;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 23 — Ray Tracing');

// Ray-Sphere
runner.test('raySphere — hit', () => {
  const ray: Ray = { origin: [0, 0, -5], direction: [0, 0, 1] };
  const result = raySphereIntersect(ray, [0, 0, 0], 1);
  assertTrue(result.hit);
  assertApprox(result.t, 4); // touche a z=-1
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
  assertApprox(result.t, 2); // sort a z=2
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
    [[-1, -1, 2], [1, -1, 2], [0, 1, 2]],   // z=2
    [[-1, -1, 5], [1, -1, 5], [0, 1, 5]],   // z=5
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
  const R = refract(I, N, 3.0); // high eta causes TIR
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
  // Seeded deterministic RNG (simple LCG)
  let seed = 42;
  const rng = () => { seed = (seed * 1664525 + 1013904223) & 0x7fffffff; return seed / 0x7fffffff; };
  const pi = estimatePI(100000, rng);
  assertApprox(pi, Math.PI, 0.05);
});

runner.run();
