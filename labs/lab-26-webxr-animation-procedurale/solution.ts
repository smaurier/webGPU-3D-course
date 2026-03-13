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
  const halfIPD = ipd / 2;
  const offset = vec3Scale(vec3Normalize(rightVector), halfIPD);
  return {
    left: vec3Sub(centerPos, offset),
    right: vec3Add(centerPos, offset),
  };
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
  const top = near * Math.tan(fovY / 2);
  const bottom = -top;
  const halfWidth = top * aspect;
  const shift = (eyeSign * ipd / 2) * (near / 1); // convergence at infinity
  return {
    left: -halfWidth + shift,
    right: halfWidth + shift,
    top,
    bottom,
  };
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
  const boneLengths = [
    vec3Distance(joints[0], joints[1]),
    vec3Distance(joints[1], joints[2]),
  ];

  let current: [Vec3, Vec3, Vec3] = [[...joints[0]], [...joints[1]], [...joints[2]]];

  for (let iter = 0; iter < iterations; iter++) {
    // Iterate from end-1 to root
    for (let i = 1; i >= 0; i--) {
      const joint = current[i];
      const endEffector = current[2];
      const toEnd = vec3Sub(endEffector, joint);
      const toTarget = vec3Sub(target, joint);

      const lenEnd = vec3Length(toEnd);
      const lenTarget = vec3Length(toTarget);
      if (lenEnd < 1e-10 || lenTarget < 1e-10) continue;

      const cosAngle = Math.max(-1, Math.min(1,
        vec3Dot(toEnd, toTarget) / (lenEnd * lenTarget)
      ));
      const angle = Math.acos(cosAngle);
      if (Math.abs(angle) < 1e-10) continue;

      const cross = vec3Cross(toEnd, toTarget);
      const sign = cross[2] >= 0 ? 1 : -1;
      const rotAngle = sign * angle;

      const cosA = Math.cos(rotAngle);
      const sinA = Math.sin(rotAngle);

      // Rotate all joints after i around joint i
      for (let j = i + 1; j <= 2; j++) {
        const rel = vec3Sub(current[j], joint);
        const rotated: Vec3 = [
          rel[0] * cosA - rel[1] * sinA,
          rel[0] * sinA + rel[1] * cosA,
          rel[2],
        ];
        current[j] = vec3Add(joint, rotated);
      }
    }

    // Enforce bone lengths
    for (let i = 0; i < 2; i++) {
      const dir = vec3Normalize(vec3Sub(current[i + 1], current[i]));
      current[i + 1] = vec3Add(current[i], vec3Scale(dir, boneLengths[i]));
    }
  }

  return current;
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
  const n = joints.length;
  const boneLengths: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    boneLengths.push(vec3Distance(joints[i], joints[i + 1]));
  }

  const positions: Vec3[] = joints.map(j => [...j] as Vec3);
  const rootPos: Vec3 = [...joints[0]];

  for (let iter = 0; iter < iterations; iter++) {
    // Forward pass: end effector -> root
    positions[n - 1] = [...target];
    for (let i = n - 2; i >= 0; i--) {
      const dir = vec3Normalize(vec3Sub(positions[i], positions[i + 1]));
      positions[i] = vec3Add(positions[i + 1], vec3Scale(dir, boneLengths[i]));
    }

    // Backward pass: root -> end effector
    positions[0] = [...rootPos];
    for (let i = 0; i < n - 1; i++) {
      const dir = vec3Normalize(vec3Sub(positions[i + 1], positions[i]));
      positions[i + 1] = vec3Add(positions[i], vec3Scale(dir, boneLengths[i]));
    }
  }

  return positions;
}

// ─── Procedural walk cycle ──────────────────────────────────────────────────

function walkCycleLegHeight(
  time: number,
  amplitude: number,
  frequency: number,
  phase: number,
): number {
  return amplitude * Math.sin(phase + time * frequency);
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
  const acceleration = -stiffness * (state.position - target) - damping * state.velocity;
  const newVelocity = state.velocity + acceleration * dt;
  const newPosition = state.position + newVelocity * dt;
  return { position: newPosition, velocity: newVelocity };
}

// ─── Look-at constraint ─────────────────────────────────────────────────────

/**
 * Calcule yaw et pitch pour orienter un objet a `position` vers `target`.
 * Convention : yaw autour de Y, pitch autour de X.
 */
function lookAtAngles(
  position: Vec3,
  target: Vec3,
): { yaw: number; pitch: number } {
  const dir = vec3Sub(target, position);
  const yaw = Math.atan2(dir[0], dir[2]);
  const horizontalDist = Math.sqrt(dir[0] * dir[0] + dir[2] * dir[2]);
  const pitch = Math.atan2(dir[1], horizontalDist);
  return { yaw, pitch };
}

// ─── Blend two poses ────────────────────────────────────────────────────────

/**
 * Interpole lineairement entre deux poses (tableau de positions par joint).
 */
function blendPoses(poseA: Vec3[], poseB: Vec3[], weight: number): Vec3[] {
  return poseA.map((a, i) => vec3Lerp(a, poseB[i], weight));
}

// ─── Animation state machine ────────────────────────────────────────────────

type AnimState = 'idle' | 'walk';

function animationStateMachine(currentState: AnimState, speed: number, threshold: number): AnimState {
  if (currentState === 'idle' && speed > threshold) return 'walk';
  if (currentState === 'walk' && speed < threshold) return 'idle';
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
  const dx = pixelX - gazeX;
  const dy = pixelY - gazeY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist <= innerRadius) return 'inner';
  if (dist <= middleRadius) return 'middle';
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
  const { right, up, forward } = quatToMat3Columns(orientation);

  // View matrix = transpose of rotation * negated translated position
  // Columns of rotation become rows in the view matrix
  const tx = -(right[0] * position[0] + right[1] * position[1] + right[2] * position[2]);
  const ty = -(up[0] * position[0] + up[1] * position[1] + up[2] * position[2]);
  const tz = -(forward[0] * position[0] + forward[1] * position[1] + forward[2] * position[2]);

  // Column-major order
  return [
    right[0], up[0], forward[0], 0,
    right[1], up[1], forward[1], 0,
    right[2], up[2], forward[2], 0,
    tx, ty, tz, 1,
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
  // High damping should have less velocity (closer to settled)
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
  // Should be identity
  assertApprox(view[0], 1, 1e-6);
  assertApprox(view[5], 1, 1e-6);
  assertApprox(view[10], 1, 1e-6);
  assertApprox(view[15], 1, 1e-6);
  assertApprox(view[12], 0, 1e-6); // tx
  assertApprox(view[13], 0, 1e-6); // ty
  assertApprox(view[14], 0, 1e-6); // tz
});

runner.test('XR view matrix : translation inverse', () => {
  const view = xrViewMatrixFromPose([3, 2, 1], [0, 0, 0, 1]);
  // With identity rotation, tx = -pos.x, ty = -pos.y, tz = -pos.z
  assertApprox(view[12], -3, 1e-6);
  assertApprox(view[13], -2, 1e-6);
  assertApprox(view[14], -1, 1e-6);
});

runner.run();
