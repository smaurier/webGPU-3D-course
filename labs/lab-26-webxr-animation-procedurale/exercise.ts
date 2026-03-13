import {
  createTestRunner,
  assertApprox,
  assertArrayApprox,
  assertTrue,
  assertEqual,
  type Vec3,
  type Mat4,
  type Quat,
} from '../test-utils.ts';

// ─── Helpers Vec3 / Quat ────────────────────────────────────────────────────

function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vec3Scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function vec3Length(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function vec3Normalize(v: Vec3): Vec3 {
  const len = vec3Length(v);
  if (len === 0) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
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

function vec3Distance(a: Vec3, b: Vec3): number {
  return vec3Length(vec3Sub(b, a));
}

function vec3Lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function quatToMat3Columns(q: Quat): { right: Vec3; up: Vec3; forward: Vec3 } {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;

  return {
    right:   [1 - (yy + zz), xy + wz, xz - wy],
    up:      [xy - wz, 1 - (xx + zz), yz + wx],
    forward: [xz + wy, yz - wx, 1 - (xx + yy)],
  };
}

// ─── Stereo camera setup ────────────────────────────────────────────────────

/**
 * Calcule les positions des cameras gauche et droite.
 * Decalage de +/- ipd/2 le long du vecteur right.
 */
function stereoCameraPositions(
  centerPos: Vec3,
  rightVector: Vec3,
  ipd: number,
): { left: Vec3; right: Vec3 } {
  // TODO: calculer l'offset = normalize(rightVector) * ipd/2
  // left = centerPos - offset, right = centerPos + offset
  return { left: [0, 0, 0], right: [0, 0, 0] };
}

// ─── Asymmetric frustum ─────────────────────────────────────────────────────

/**
 * Calcule les bornes left/right du near plane pour un oeil.
 * eyeSign: -1 pour oeil gauche, +1 pour oeil droit.
 */
function asymmetricFrustum(
  fovY: number,
  aspect: number,
  near: number,
  ipd: number,
  eyeSign: number,
): { left: number; right: number; top: number; bottom: number } {
  // TODO:
  // top = near * tan(fovY / 2), bottom = -top
  // halfWidth = top * aspect
  // shift = eyeSign * (ipd / 2) * near
  // left = -halfWidth + shift, right = halfWidth + shift
  return { left: 0, right: 0, top: 0, bottom: 0 };
}

// ─── IK CCD solver (2-bone) ────────────────────────────────────────────────

/**
 * CCD solver pour une chaine 2-bone en 2D (projete sur le plan XY).
 * joints: [root, mid, end] positions.
 * Retourne les nouvelles positions apres resolution.
 */
function ikCCD2Bone(
  joints: [Vec3, Vec3, Vec3],
  target: Vec3,
  iterations: number,
): [Vec3, Vec3, Vec3] {
  // TODO: pour chaque iteration :
  //   Pour chaque joint de end-1 a root :
  //     1. Calculer l'angle entre (joint->endEffector) et (joint->target)
  //     2. Determiner le sens de rotation via le produit vectoriel
  //     3. Appliquer la rotation 2D a tous les joints suivants
  //   Apres chaque iteration, renforcer les longueurs de bones
  return [[...joints[0]], [...joints[1]], [...joints[2]]];
}

// ─── IK FABRIK solver ───────────────────────────────────────────────────────

/**
 * FABRIK solver pour une chaine de N joints.
 * Retourne les nouvelles positions.
 */
function ikFABRIK(
  joints: Vec3[],
  target: Vec3,
  iterations: number,
): Vec3[] {
  // TODO: pour chaque iteration :
  //   Passe avant : placer le dernier joint sur target, remonter la chaine
  //     en preservant les longueurs de bones
  //   Passe arriere : replacer le premier joint a sa position d'origine,
  //     redescendre la chaine en preservant les longueurs
  return joints.map(j => [...j] as Vec3);
}

// ─── Procedural walk cycle ──────────────────────────────────────────────────

function walkCycleLegHeight(
  time: number,
  amplitude: number,
  frequency: number,
  phase: number,
): number {
  // TODO: retourner amplitude * sin(phase + time * frequency)
  return 0;
}

// ─── Damped spring ──────────────────────────────────────────────────────────

interface SpringState {
  position: number;
  velocity: number;
}

function dampedSpringStep(
  state: SpringState,
  target: number,
  stiffness: number,
  damping: number,
  dt: number,
): SpringState {
  // TODO:
  // acceleration = -stiffness * (position - target) - damping * velocity
  // newVelocity = velocity + acceleration * dt
  // newPosition = position + newVelocity * dt
  return { position: state.position, velocity: state.velocity };
}

// ─── Look-at constraint ─────────────────────────────────────────────────────

/**
 * Calcule yaw et pitch pour orienter un objet a `position` vers `target`.
 * Convention : yaw autour de Y (atan2(dx, dz)), pitch autour de X.
 */
function lookAtAngles(
  position: Vec3,
  target: Vec3,
): { yaw: number; pitch: number } {
  // TODO:
  // dir = target - position
  // yaw = atan2(dir.x, dir.z)
  // pitch = atan2(dir.y, sqrt(dir.x^2 + dir.z^2))
  return { yaw: 0, pitch: 0 };
}

// ─── Blend two poses ────────────────────────────────────────────────────────

/**
 * Interpole lineairement entre deux poses (tableau de positions par joint).
 */
function blendPoses(poseA: Vec3[], poseB: Vec3[], weight: number): Vec3[] {
  // TODO: pour chaque joint, lerp(poseA[i], poseB[i], weight)
  return poseA.map(a => [...a] as Vec3);
}

// ─── Animation state machine ────────────────────────────────────────────────

type AnimState = 'idle' | 'walk';

function animationStateMachine(currentState: AnimState, speed: number, threshold: number): AnimState {
  // TODO:
  // Si idle et speed > threshold => 'walk'
  // Si walk et speed < threshold => 'idle'
  // Sinon rester dans l'etat courant
  return currentState;
}

// ─── Foveated rendering regions ─────────────────────────────────────────────

type FoveatedRegion = 'inner' | 'middle' | 'outer';

/**
 * Classe un pixel dans une region foveale basee sur la distance au centre du regard.
 */
function foveatedRegion(
  pixelX: number,
  pixelY: number,
  gazeX: number,
  gazeY: number,
  innerRadius: number,
  middleRadius: number,
): FoveatedRegion {
  // TODO: calculer la distance entre (pixelX,pixelY) et (gazeX,gazeY)
  // si dist <= innerRadius => 'inner'
  // si dist <= middleRadius => 'middle'
  // sinon => 'outer'
  return 'outer';
}

// ─── XR view matrix from pose ───────────────────────────────────────────────

/**
 * Construit une matrice de vue a partir d'une pose XR (position + quaternion).
 * La matrice de vue est l'inverse de la matrice du monde de la camera.
 * viewMatrix = inverse(poseMatrix)
 * Pour une rotation pure R et translation T: view = transpose(R) | -transpose(R)*T
 */
function xrViewMatrixFromPose(position: Vec3, orientation: Quat): Mat4 {
  // TODO:
  // 1. Convertir le quaternion en colonnes right/up/forward via quatToMat3Columns
  // 2. Construire la matrice de vue (column-major) :
  //    Les lignes de la rotation deviennent les colonnes
  //    tx = -dot(right, position), ty = -dot(up, position), tz = -dot(forward, position)
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

// ─── Tests ──────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 26 — WebXR et animation procedurale');

// Stereo camera
runner.test('Stereo camera : decalage symetrique gauche/droite', () => {
  const { left, right } = stereoCameraPositions([0, 0, 0], [1, 0, 0], 0.063);
  assertApprox(left[0], -0.0315, 1e-4);
  assertApprox(right[0], 0.0315, 1e-4);
  assertApprox(left[1], 0);
  assertApprox(right[1], 0);
});

runner.test('Stereo camera : distance entre yeux = IPD', () => {
  const { left, right } = stereoCameraPositions([5, 1, -3], [1, 0, 0], 0.063);
  const dist = vec3Distance(left, right);
  assertApprox(dist, 0.063, 1e-4);
});

// Asymmetric frustum
runner.test('Asymmetric frustum : oeil gauche decale a gauche', () => {
  const leftEye = asymmetricFrustum(Math.PI / 2, 1, 0.1, 0.063, -1);
  const rightEye = asymmetricFrustum(Math.PI / 2, 1, 0.1, 0.063, 1);
  assertTrue(leftEye.left < rightEye.left, 'Left eye frustum decale a gauche');
  assertTrue(leftEye.right < rightEye.right, 'Right eye frustum decale a gauche');
});

runner.test('Asymmetric frustum : top/bottom symetriques', () => {
  const f = asymmetricFrustum(Math.PI / 2, 1, 0.1, 0.063, -1);
  assertApprox(f.top, -f.bottom, 1e-6);
});

// IK CCD
runner.test('IK CCD 2-bone : effecteur atteint la cible', () => {
  const joints: [Vec3, Vec3, Vec3] = [[0, 0, 0], [1, 0, 0], [2, 0, 0]];
  const target: Vec3 = [1, 1, 0];
  const result = ikCCD2Bone(joints, target, 20);
  const endDist = vec3Distance(result[2], target);
  assertTrue(endDist < 0.1, `End effector trop loin de la cible: ${endDist}`);
});

runner.test('IK CCD 2-bone : conserve les longueurs de bones', () => {
  const joints: [Vec3, Vec3, Vec3] = [[0, 0, 0], [1, 0, 0], [2, 0, 0]];
  const target: Vec3 = [1, 1, 0];
  const result = ikCCD2Bone(joints, target, 20);
  assertApprox(vec3Distance(result[0], result[1]), 1, 0.05);
  assertApprox(vec3Distance(result[1], result[2]), 1, 0.05);
});

// IK FABRIK
runner.test('IK FABRIK 3-bone : convergence vers cible', () => {
  const joints: Vec3[] = [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]];
  const target: Vec3 = [2, 1, 0];
  const result = ikFABRIK(joints, target, 20);
  const endDist = vec3Distance(result[3], target);
  assertTrue(endDist < 0.05, `FABRIK end effector trop loin: ${endDist}`);
});

runner.test('IK FABRIK : racine reste fixe', () => {
  const joints: Vec3[] = [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]];
  const target: Vec3 = [2, 1, 0];
  const result = ikFABRIK(joints, target, 20);
  assertArrayApprox(result[0], [0, 0, 0], 1e-6);
});

// Walk cycle
runner.test('Walk cycle : hauteur sinusoidale', () => {
  const h = walkCycleLegHeight(0, 0.1, 2 * Math.PI, 0);
  assertApprox(h, 0, 1e-6);
});

runner.test('Walk cycle : pic a phase PI/2', () => {
  const h = walkCycleLegHeight(0, 0.1, 1, Math.PI / 2);
  assertApprox(h, 0.1, 1e-6);
});

// Damped spring
runner.test('Damped spring : converge vers la cible', () => {
  let state: SpringState = { position: 0, velocity: 0 };
  const target = 5;
  for (let i = 0; i < 1000; i++) {
    state = dampedSpringStep(state, target, 100, 10, 0.01);
  }
  assertApprox(state.position, target, 0.01);
});

runner.test('Damped spring : amortissement reduit oscillation', () => {
  let stateHigh: SpringState = { position: 0, velocity: 0 };
  let stateLow: SpringState = { position: 0, velocity: 0 };
  for (let i = 0; i < 100; i++) {
    stateHigh = dampedSpringStep(stateHigh, 5, 100, 20, 0.01);
    stateLow = dampedSpringStep(stateLow, 5, 100, 5, 0.01);
  }
  assertTrue(
    Math.abs(stateHigh.velocity) <= Math.abs(stateLow.velocity) + 0.1,
    'Amortissement eleve devrait reduire la velocite'
  );
});

// Look-at
runner.test('Look-at : cible devant => yaw=0, pitch=0', () => {
  const { yaw, pitch } = lookAtAngles([0, 0, 0], [0, 0, 5]);
  assertApprox(yaw, 0, 1e-6);
  assertApprox(pitch, 0, 1e-6);
});

runner.test('Look-at : cible a droite => yaw=PI/2', () => {
  const { yaw } = lookAtAngles([0, 0, 0], [5, 0, 0]);
  assertApprox(yaw, Math.PI / 2, 1e-6);
});

runner.test('Look-at : cible au dessus => pitch positif', () => {
  const { pitch } = lookAtAngles([0, 0, 0], [0, 5, 5]);
  assertTrue(pitch > 0, `pitch devrait etre > 0, got ${pitch}`);
});

// Blend poses
runner.test('Blend poses : weight=0 retourne poseA', () => {
  const poseA: Vec3[] = [[0, 0, 0], [1, 0, 0]];
  const poseB: Vec3[] = [[2, 2, 2], [3, 2, 0]];
  const result = blendPoses(poseA, poseB, 0);
  assertArrayApprox(result[0], [0, 0, 0]);
  assertArrayApprox(result[1], [1, 0, 0]);
});

runner.test('Blend poses : weight=0.5 retourne la moyenne', () => {
  const poseA: Vec3[] = [[0, 0, 0], [2, 0, 0]];
  const poseB: Vec3[] = [[4, 4, 4], [6, 4, 0]];
  const result = blendPoses(poseA, poseB, 0.5);
  assertArrayApprox(result[0], [2, 2, 2]);
  assertArrayApprox(result[1], [4, 2, 0]);
});

// Animation state machine
runner.test('Animation FSM : idle -> walk quand speed > threshold', () => {
  assertEqual(animationStateMachine('idle', 2, 1), 'walk');
});

runner.test('Animation FSM : walk -> idle quand speed < threshold', () => {
  assertEqual(animationStateMachine('walk', 0.5, 1), 'idle');
});

runner.test('Animation FSM : reste en idle si speed < threshold', () => {
  assertEqual(animationStateMachine('idle', 0.3, 1), 'idle');
});

// Foveated rendering
runner.test('Foveated : pixel au centre = inner', () => {
  assertEqual(foveatedRegion(100, 100, 100, 100, 50, 150), 'inner');
});

runner.test('Foveated : pixel en zone mediane = middle', () => {
  assertEqual(foveatedRegion(180, 100, 100, 100, 50, 150), 'middle');
});

runner.test('Foveated : pixel en peripherie = outer', () => {
  assertEqual(foveatedRegion(300, 100, 100, 100, 50, 150), 'outer');
});

// XR view matrix
runner.test('XR view matrix : identite a l\'origine', () => {
  const view = xrViewMatrixFromPose([0, 0, 0], [0, 0, 0, 1]);
  assertApprox(view[0], 1, 1e-6);
  assertApprox(view[5], 1, 1e-6);
  assertApprox(view[10], 1, 1e-6);
  assertApprox(view[15], 1, 1e-6);
  assertApprox(view[12], 0, 1e-6);
  assertApprox(view[13], 0, 1e-6);
  assertApprox(view[14], 0, 1e-6);
});

runner.test('XR view matrix : translation inverse', () => {
  const view = xrViewMatrixFromPose([3, 2, 1], [0, 0, 0, 1]);
  assertApprox(view[12], -3, 1e-6);
  assertApprox(view[13], -2, 1e-6);
  assertApprox(view[14], -1, 1e-6);
});

runner.run();
