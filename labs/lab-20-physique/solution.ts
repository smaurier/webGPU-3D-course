import {
  createTestRunner,
  assertApprox,
  assertTrue,
  assertFalse,
  assertEqual,
  assertArrayApprox,
  assertDeepEqual,
  type Vec3,
  type AABB,
  type Ray,
} from '../test-utils.ts';

// ─── Helpers ────────────────────────────────────────────────────────────────

function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vec3Scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function vec3Dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vec3Length(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function vec3Normalize(v: Vec3): Vec3 {
  const len = vec3Length(v);
  if (len === 0) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

// ─── Collision Detection ────────────────────────────────────────────────────

interface Sphere {
  center: Vec3;
  radius: number;
}

interface Plane {
  normal: Vec3; // doit etre normalise
  distance: number; // distance signee depuis l'origine
}

function aabbIntersect(a: AABB, b: AABB): boolean {
  return (
    a.min[0] <= b.max[0] && a.max[0] >= b.min[0] &&
    a.min[1] <= b.max[1] && a.max[1] >= b.min[1] &&
    a.min[2] <= b.max[2] && a.max[2] >= b.min[2]
  );
}

function sphereSphereCollision(a: Sphere, b: Sphere): boolean {
  const d = vec3Sub(a.center, b.center);
  const distSq = vec3Dot(d, d);
  const radiusSum = a.radius + b.radius;
  return distSq <= radiusSum * radiusSum;
}

function spherePlaneCollision(sphere: Sphere, plane: Plane): boolean {
  const dist = vec3Dot(plane.normal, sphere.center) - plane.distance;
  return Math.abs(dist) <= sphere.radius;
}

function rayAABBIntersect(ray: Ray, aabb: AABB): { hit: boolean; tMin: number; tMax: number } {
  let tMin = -Infinity;
  let tMax = Infinity;

  for (let i = 0; i < 3; i++) {
    if (Math.abs(ray.direction[i]) < 1e-10) {
      if (ray.origin[i] < aabb.min[i] || ray.origin[i] > aabb.max[i]) {
        return { hit: false, tMin: 0, tMax: 0 };
      }
    } else {
      const invD = 1 / ray.direction[i];
      let t1 = (aabb.min[i] - ray.origin[i]) * invD;
      let t2 = (aabb.max[i] - ray.origin[i]) * invD;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return { hit: false, tMin: 0, tMax: 0 };
    }
  }

  return { hit: tMax >= 0 && tMin <= tMax, tMin: Math.max(tMin, 0), tMax };
}

// ─── Rigid Body Integration ─────────────────────────────────────────────────

interface RigidBody {
  position: Vec3;
  velocity: Vec3;
  acceleration: Vec3;
}

function eulerIntegrate(body: RigidBody, dt: number): RigidBody {
  const newPos = vec3Add(body.position, vec3Scale(body.velocity, dt));
  const newVel = vec3Add(body.velocity, vec3Scale(body.acceleration, dt));
  return { position: newPos, velocity: newVel, acceleration: body.acceleration };
}

// ─── Impulse Response ───────────────────────────────────────────────────────

function impulseResponse(
  velA: Vec3, velB: Vec3, normal: Vec3,
  massA: number, massB: number, restitution: number,
): { velA: Vec3; velB: Vec3 } {
  // normal pointe de A vers B
  const relVel = vec3Sub(velB, velA);
  const velAlongNormal = vec3Dot(relVel, normal);

  if (velAlongNormal > 0) return { velA, velB }; // S'eloignent deja

  const j = -(1 + restitution) * velAlongNormal / (1 / massA + 1 / massB);
  const impulse = vec3Scale(normal, j);

  return {
    velA: vec3Sub(velA, vec3Scale(impulse, 1 / massA)),
    velB: vec3Add(velB, vec3Scale(impulse, 1 / massB)),
  };
}

// ─── Gravity Simulation ─────────────────────────────────────────────────────

function simulateGravity(position: Vec3, velocity: Vec3, gravity: Vec3, dt: number, steps: number): Vec3[] {
  const trajectory: Vec3[] = [position];
  let pos = position;
  let vel = velocity;
  for (let i = 0; i < steps; i++) {
    pos = vec3Add(pos, vec3Scale(vel, dt));
    vel = vec3Add(vel, vec3Scale(gravity, dt));
    trajectory.push(pos);
  }
  return trajectory;
}

// ─── GJK Support Function ───────────────────────────────────────────────────

function gjkSupportAABB(aabb: AABB, direction: Vec3): Vec3 {
  return [
    direction[0] >= 0 ? aabb.max[0] : aabb.min[0],
    direction[1] >= 0 ? aabb.max[1] : aabb.min[1],
    direction[2] >= 0 ? aabb.max[2] : aabb.min[2],
  ];
}

// ─── Broad Phase: Spatial Hash ──────────────────────────────────────────────

function broadPhasePairs(
  objects: { id: number; aabb: AABB }[],
): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i < objects.length; i++) {
    for (let j = i + 1; j < objects.length; j++) {
      if (aabbIntersect(objects[i].aabb, objects[j].aabb)) {
        pairs.push([objects[i].id, objects[j].id]);
      }
    }
  }
  return pairs;
}

// ─── Contact Point: Sphere vs Plane ─────────────────────────────────────────

interface ContactPoint {
  point: Vec3;
  normal: Vec3;
  penetration: number;
}

function spherePlaneContact(sphere: Sphere, plane: Plane): ContactPoint | null {
  const dist = vec3Dot(plane.normal, sphere.center) - plane.distance;
  if (Math.abs(dist) > sphere.radius) return null;

  const penetration = sphere.radius - Math.abs(dist);
  const sign = dist >= 0 ? 1 : -1;
  const point = vec3Sub(sphere.center, vec3Scale(plane.normal, sign * sphere.radius));

  return {
    point,
    normal: sign >= 0 ? plane.normal : vec3Scale(plane.normal, -1),
    penetration,
  };
}

// ─── Spring Force (Hooke's Law) ─────────────────────────────────────────────

function springForce(displacement: number, velocity: number, k: number, damping: number): number {
  return -k * displacement - damping * velocity;
}

// ─── Fixed Timestep Accumulator ─────────────────────────────────────────────

interface AccumulatorState {
  accumulator: number;
  stepsTaken: number;
  alpha: number; // fraction restante pour l'interpolation
}

function fixedTimestepAccumulator(dt: number, fixedDt: number, accumulator: number): AccumulatorState {
  let acc = accumulator + dt;
  let steps = 0;
  while (acc >= fixedDt) {
    acc -= fixedDt;
    steps++;
  }
  return {
    accumulator: acc,
    stepsTaken: steps,
    alpha: acc / fixedDt,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 20 — Physique');

// AABB-AABB
runner.test('AABB-AABB — intersection', () => {
  const a: AABB = { min: [0, 0, 0], max: [2, 2, 2] };
  const b: AABB = { min: [1, 1, 1], max: [3, 3, 3] };
  assertTrue(aabbIntersect(a, b));
});

runner.test('AABB-AABB — pas d\'intersection', () => {
  const a: AABB = { min: [0, 0, 0], max: [1, 1, 1] };
  const b: AABB = { min: [2, 2, 2], max: [3, 3, 3] };
  assertFalse(aabbIntersect(a, b));
});

runner.test('AABB-AABB — contact sur une face', () => {
  const a: AABB = { min: [0, 0, 0], max: [1, 1, 1] };
  const b: AABB = { min: [1, 0, 0], max: [2, 1, 1] };
  assertTrue(aabbIntersect(a, b));
});

// Sphere-Sphere
runner.test('sphereSphereCollision — chevauchement', () => {
  const a: Sphere = { center: [0, 0, 0], radius: 1 };
  const b: Sphere = { center: [1.5, 0, 0], radius: 1 };
  assertTrue(sphereSphereCollision(a, b));
});

runner.test('sphereSphereCollision — pas de collision', () => {
  const a: Sphere = { center: [0, 0, 0], radius: 1 };
  const b: Sphere = { center: [3, 0, 0], radius: 1 };
  assertFalse(sphereSphereCollision(a, b));
});

// Sphere-Plane
runner.test('spherePlaneCollision — sphere sur le plan', () => {
  const sphere: Sphere = { center: [0, 0.5, 0], radius: 1 };
  const plane: Plane = { normal: [0, 1, 0], distance: 0 };
  assertTrue(spherePlaneCollision(sphere, plane));
});

runner.test('spherePlaneCollision — sphere loin du plan', () => {
  const sphere: Sphere = { center: [0, 5, 0], radius: 1 };
  const plane: Plane = { normal: [0, 1, 0], distance: 0 };
  assertFalse(spherePlaneCollision(sphere, plane));
});

// Ray-AABB
runner.test('rayAABBIntersect — rayon touche la boite', () => {
  const ray: Ray = { origin: [0, 0, -5], direction: [0, 0, 1] };
  const aabb: AABB = { min: [-1, -1, -1], max: [1, 1, 1] };
  const result = rayAABBIntersect(ray, aabb);
  assertTrue(result.hit);
  assertApprox(result.tMin, 4, 0.001);
});

runner.test('rayAABBIntersect — rayon rate la boite', () => {
  const ray: Ray = { origin: [0, 5, -5], direction: [0, 0, 1] };
  const aabb: AABB = { min: [-1, -1, -1], max: [1, 1, 1] };
  assertFalse(rayAABBIntersect(ray, aabb).hit);
});

// Euler Integration
runner.test('eulerIntegrate — mouvement uniforme', () => {
  const body: RigidBody = {
    position: [0, 0, 0],
    velocity: [1, 0, 0],
    acceleration: [0, 0, 0],
  };
  const result = eulerIntegrate(body, 1);
  assertArrayApprox(result.position, [1, 0, 0]);
  assertArrayApprox(result.velocity, [1, 0, 0]);
});

runner.test('eulerIntegrate — acceleration', () => {
  const body: RigidBody = {
    position: [0, 0, 0],
    velocity: [0, 0, 0],
    acceleration: [0, -9.81, 0],
  };
  const result = eulerIntegrate(body, 0.1);
  assertApprox(result.velocity[1], -0.981, 0.001);
});

// Impulse Response
runner.test('impulseResponse — collision frontale elastique', () => {
  const result = impulseResponse([1, 0, 0], [-1, 0, 0], [1, 0, 0], 1, 1, 1);
  assertApprox(result.velA[0], -1, 0.001);
  assertApprox(result.velB[0], 1, 0.001);
});

runner.test('impulseResponse — collision inelastique (restitution 0)', () => {
  const result = impulseResponse([1, 0, 0], [-1, 0, 0], [1, 0, 0], 1, 1, 0);
  assertApprox(result.velA[0], 0, 0.001);
  assertApprox(result.velB[0], 0, 0.001);
});

// Gravity Simulation
runner.test('simulateGravity — trajectoire parabolique', () => {
  const traj = simulateGravity([0, 0, 0], [10, 10, 0], [0, -10, 0], 0.1, 20);
  // Au sommet (t~1s), y devrait etre ~5 (v0*t - 0.5*g*t^2)
  assertEqual(traj.length, 21);
  // Position finale x = 10*2 = 20 (apres 2s = 20 steps * 0.1)
  assertApprox(traj[20][0], 20, 0.5);
  // y devrait revenir pres de 0 (trajectoire parabolique)
  assertApprox(traj[20][1], 0, 1.0);
});

// GJK Support
runner.test('gjkSupportAABB — direction +X +Y +Z', () => {
  const aabb: AABB = { min: [-1, -2, -3], max: [4, 5, 6] };
  const support = gjkSupportAABB(aabb, [1, 1, 1]);
  assertDeepEqual(support, [4, 5, 6]);
});

runner.test('gjkSupportAABB — direction -X -Y -Z', () => {
  const aabb: AABB = { min: [-1, -2, -3], max: [4, 5, 6] };
  const support = gjkSupportAABB(aabb, [-1, -1, -1]);
  assertDeepEqual(support, [-1, -2, -3]);
});

// Broad Phase
runner.test('broadPhasePairs — detecte les paires en collision', () => {
  const objects = [
    { id: 0, aabb: { min: [0, 0, 0], max: [2, 2, 2] } as AABB },
    { id: 1, aabb: { min: [1, 1, 1], max: [3, 3, 3] } as AABB },
    { id: 2, aabb: { min: [10, 10, 10], max: [11, 11, 11] } as AABB },
  ];
  const pairs = broadPhasePairs(objects);
  assertEqual(pairs.length, 1);
  assertDeepEqual(pairs[0], [0, 1]);
});

runner.test('broadPhasePairs — aucune paire', () => {
  const objects = [
    { id: 0, aabb: { min: [0, 0, 0], max: [1, 1, 1] } as AABB },
    { id: 1, aabb: { min: [5, 5, 5], max: [6, 6, 6] } as AABB },
  ];
  const pairs = broadPhasePairs(objects);
  assertEqual(pairs.length, 0);
});

// Contact Point
runner.test('spherePlaneContact — contact avec penetration', () => {
  const sphere: Sphere = { center: [0, 0.5, 0], radius: 1 };
  const plane: Plane = { normal: [0, 1, 0], distance: 0 };
  const contact = spherePlaneContact(sphere, plane);
  assertTrue(contact !== null, 'Contact attendu');
  assertApprox(contact!.penetration, 0.5, 0.001);
  assertArrayApprox(contact!.normal, [0, 1, 0]);
});

runner.test('spherePlaneContact — pas de contact', () => {
  const sphere: Sphere = { center: [0, 5, 0], radius: 1 };
  const plane: Plane = { normal: [0, 1, 0], distance: 0 };
  const contact = spherePlaneContact(sphere, plane);
  assertTrue(contact === null, 'Pas de contact attendu');
});

// Spring Force
runner.test('springForce — deplacement positif, vitesse nulle', () => {
  const f = springForce(2, 0, 10, 0);
  assertApprox(f, -20);
});

runner.test('springForce — avec amortissement', () => {
  const f = springForce(1, 2, 10, 5);
  assertApprox(f, -20); // -10*1 - 5*2 = -20
});

runner.test('springForce — position d\'equilibre', () => {
  const f = springForce(0, 0, 10, 5);
  assertApprox(f, 0);
});

// Fixed Timestep
runner.test('fixedTimestepAccumulator — pas complets', () => {
  const state = fixedTimestepAccumulator(0.05, 1 / 60, 0);
  assertEqual(state.stepsTaken, 3); // 0.05 / (1/60) = 3
  assertTrue(state.accumulator >= 0 && state.accumulator < 1 / 60);
});

runner.test('fixedTimestepAccumulator — accumulation partielle', () => {
  const state = fixedTimestepAccumulator(0.01, 1 / 60, 0);
  assertEqual(state.stepsTaken, 0);
  assertApprox(state.accumulator, 0.01, 0.001);
  assertApprox(state.alpha, 0.01 / (1 / 60), 0.01);
});

runner.test('fixedTimestepAccumulator — avec reste precedent', () => {
  const state = fixedTimestepAccumulator(0.01, 1 / 60, 0.01);
  // Total = 0.02, fixedDt = ~0.01667 -> 1 step
  assertEqual(state.stepsTaken, 1);
});

runner.run();
