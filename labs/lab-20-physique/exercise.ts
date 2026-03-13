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

// ─── Helpers (fournis) ──────────────────────────────────────────────────────

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
  normal: Vec3;
  distance: number;
}

function aabbIntersect(a: AABB, b: AABB): boolean {
  // TODO: verifier le chevauchement sur les 3 axes
  // a.min[i] <= b.max[i] && a.max[i] >= b.min[i] pour i = 0, 1, 2
  return false;
}

function sphereSphereCollision(a: Sphere, b: Sphere): boolean {
  // TODO: distance^2 entre centres <= (r1 + r2)^2
  return false;
}

function spherePlaneCollision(sphere: Sphere, plane: Plane): boolean {
  // TODO: |dot(normal, center) - distance| <= radius
  return false;
}

function rayAABBIntersect(ray: Ray, aabb: AABB): { hit: boolean; tMin: number; tMax: number } {
  // TODO: methode des slabs
  // Pour chaque axe, calculer t1 et t2 (entree/sortie)
  // tMin = max des t1, tMax = min des t2
  // hit si tMax >= 0 et tMin <= tMax
  return { hit: false, tMin: 0, tMax: 0 };
}

// ─── Rigid Body Integration ─────────────────────────────────────────────────

interface RigidBody {
  position: Vec3;
  velocity: Vec3;
  acceleration: Vec3;
}

function eulerIntegrate(body: RigidBody, dt: number): RigidBody {
  // TODO: pos += vel * dt, vel += accel * dt
  return { position: [0, 0, 0], velocity: [0, 0, 0], acceleration: [0, 0, 0] };
}

// ─── Impulse Response ───────────────────────────────────────────────────────

function impulseResponse(
  velA: Vec3, velB: Vec3, normal: Vec3,
  massA: number, massB: number, restitution: number,
): { velA: Vec3; velB: Vec3 } {
  // TODO: normal pointe de A vers B
  // relVel = velB - velA, velAlongNormal = dot(relVel, normal)
  // Si velAlongNormal > 0: les objets s'eloignent, retourner sans changement
  // j = -(1 + restitution) * velAlongNormal / (1/massA + 1/massB)
  // velA -= impulse / massA, velB += impulse / massB
  return { velA, velB };
}

// ─── Gravity Simulation ─────────────────────────────────────────────────────

function simulateGravity(position: Vec3, velocity: Vec3, gravity: Vec3, dt: number, steps: number): Vec3[] {
  // TODO: simuler `steps` pas d'Euler avec gravite constante
  // Retourner le tableau des positions (inclure la position initiale)
  return [position];
}

// ─── GJK Support Function ───────────────────────────────────────────────────

function gjkSupportAABB(aabb: AABB, direction: Vec3): Vec3 {
  // TODO: pour chaque axe, choisir min ou max selon le signe de direction
  return [0, 0, 0];
}

// ─── Broad Phase ────────────────────────────────────────────────────────────

function broadPhasePairs(
  objects: { id: number; aabb: AABB }[],
): [number, number][] {
  // TODO: tester toutes les paires (i, j) avec i < j
  // Si leurs AABB se chevauchent, ajouter [id_i, id_j]
  return [];
}

// ─── Contact Point: Sphere vs Plane ─────────────────────────────────────────

interface ContactPoint {
  point: Vec3;
  normal: Vec3;
  penetration: number;
}

function spherePlaneContact(sphere: Sphere, plane: Plane): ContactPoint | null {
  // TODO: calculer la distance signee du centre au plan
  // Si |dist| > radius, retourner null
  // Sinon calculer le point de contact, la normale et la penetration
  return null;
}

// ─── Spring Force (Hooke's Law) ─────────────────────────────────────────────

function springForce(displacement: number, velocity: number, k: number, damping: number): number {
  // TODO: F = -k * displacement - damping * velocity
  return 0;
}

// ─── Fixed Timestep Accumulator ─────────────────────────────────────────────

interface AccumulatorState {
  accumulator: number;
  stepsTaken: number;
  alpha: number;
}

function fixedTimestepAccumulator(dt: number, fixedDt: number, accumulator: number): AccumulatorState {
  // TODO: acc += dt
  // Tant que acc >= fixedDt: acc -= fixedDt, steps++
  // alpha = acc / fixedDt
  return { accumulator: 0, stepsTaken: 0, alpha: 0 };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 20 — Physique');

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

runner.test('simulateGravity — trajectoire parabolique', () => {
  const traj = simulateGravity([0, 0, 0], [10, 10, 0], [0, -10, 0], 0.1, 20);
  assertEqual(traj.length, 21);
  assertApprox(traj[20][0], 20, 0.5);
  assertApprox(traj[20][1], 0, 1.0);
});

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

runner.test('springForce — deplacement positif, vitesse nulle', () => {
  const f = springForce(2, 0, 10, 0);
  assertApprox(f, -20);
});

runner.test('springForce — avec amortissement', () => {
  const f = springForce(1, 2, 10, 5);
  assertApprox(f, -20);
});

runner.test('springForce — position d\'equilibre', () => {
  const f = springForce(0, 0, 10, 5);
  assertApprox(f, 0);
});

runner.test('fixedTimestepAccumulator — pas complets', () => {
  const state = fixedTimestepAccumulator(0.05, 1 / 60, 0);
  assertEqual(state.stepsTaken, 3);
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
  assertEqual(state.stepsTaken, 1);
});

runner.run();
