import {
  createTestRunner,
  assertEqual,
  assertApprox,
  assertArrayApprox,
  assertTrue,
  type Vec3,
  type Mat4,
} from '../test-utils.ts';

// ─── Keyframe interpolation ──────────────────────────────────────────────────

interface Keyframe {
  time: number;
  value: number;
}

function interpolateKeyframes(keyframes: Keyframe[], t: number): number {
  if (keyframes.length === 0) return 0;
  if (t <= keyframes[0].time) return keyframes[0].value;
  if (t >= keyframes[keyframes.length - 1].time) return keyframes[keyframes.length - 1].value;

  for (let i = 0; i < keyframes.length - 1; i++) {
    if (t >= keyframes[i].time && t <= keyframes[i + 1].time) {
      const dt = keyframes[i + 1].time - keyframes[i].time;
      const alpha = (t - keyframes[i].time) / dt;
      return keyframes[i].value + (keyframes[i + 1].value - keyframes[i].value) * alpha;
    }
  }
  return keyframes[keyframes.length - 1].value;
}

// ─── Animation mixer ─────────────────────────────────────────────────────────

interface AnimationClip {
  duration: number;
  keyframes: Keyframe[];
  loop: boolean;
}

interface AnimationMixer {
  currentTime: number;
  clip: AnimationClip;
}

function createMixer(clip: AnimationClip): AnimationMixer {
  return { currentTime: 0, clip };
}

function mixerUpdate(mixer: AnimationMixer, deltaTime: number): number {
  mixer.currentTime += deltaTime;
  if (mixer.clip.loop) {
    mixer.currentTime = mixer.currentTime % mixer.clip.duration;
  } else {
    mixer.currentTime = Math.min(mixer.currentTime, mixer.clip.duration);
  }
  return interpolateKeyframes(mixer.clip.keyframes, mixer.currentTime);
}

// ─── Crossfade ───────────────────────────────────────────────────────────────

function crossfadeWeight(elapsed: number, duration: number): { weightA: number; weightB: number } {
  const t = Math.min(elapsed / duration, 1);
  return { weightA: 1 - t, weightB: t };
}

function crossfadeValue(valueA: number, valueB: number, elapsed: number, duration: number): number {
  const { weightA, weightB } = crossfadeWeight(elapsed, duration);
  return valueA * weightA + valueB * weightB;
}

// ─── Skeletal bone hierarchy ─────────────────────────────────────────────────

interface Bone {
  name: string;
  localMatrix: Mat4;
  parentIndex: number; // -1 = root
}

function mat4Mul(a: Mat4, b: Mat4): Mat4 {
  const out: number[] = new Array(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[k * 4 + row] * b[col * 4 + k];
      }
      out[col * 4 + row] = sum;
    }
  }
  return out as unknown as Mat4;
}

function computeWorldMatrix(bones: Bone[], boneIndex: number): Mat4 {
  const bone = bones[boneIndex];
  if (bone.parentIndex === -1) {
    return bone.localMatrix;
  }
  const parentWorld = computeWorldMatrix(bones, bone.parentIndex);
  return mat4Mul(parentWorld, bone.localMatrix);
}

// ─── Skin vertex transform ───────────────────────────────────────────────────

function mat4TransformPoint(m: Mat4, p: Vec3): Vec3 {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8]  * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9]  * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

interface SkinWeight {
  boneIndex: number;
  weight: number;
}

function skinVertex(
  position: Vec3,
  weights: SkinWeight[],
  boneWorldMatrices: Mat4[],
  bindInverses: Mat4[]
): Vec3 {
  const result: Vec3 = [0, 0, 0];
  for (const { boneIndex, weight } of weights) {
    const skinMatrix = mat4Mul(boneWorldMatrices[boneIndex], bindInverses[boneIndex]);
    const transformed = mat4TransformPoint(skinMatrix, position);
    result[0] += transformed[0] * weight;
    result[1] += transformed[1] * weight;
    result[2] += transformed[2] * weight;
  }
  return result;
}

// ─── Morph targets ───────────────────────────────────────────────────────────

function morphBlend(base: Vec3[], target: Vec3[], weight: number): Vec3[] {
  return base.map((b, i) => [
    b[0] + (target[i][0] - b[0]) * weight,
    b[1] + (target[i][1] - b[1]) * weight,
    b[2] + (target[i][2] - b[2]) * weight,
  ]);
}

// ─── Instance matrix generation ──────────────────────────────────────────────

function generateInstanceMatrices(
  count: number,
  boundsMin: Vec3,
  boundsMax: Vec3,
  seed: number
): Mat4[] {
  // Simple seeded pseudo-random for reproducibility
  let s = seed;
  const random = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };

  const matrices: Mat4[] = [];
  for (let i = 0; i < count; i++) {
    const x = boundsMin[0] + random() * (boundsMax[0] - boundsMin[0]);
    const y = boundsMin[1] + random() * (boundsMax[1] - boundsMin[1]);
    const z = boundsMin[2] + random() * (boundsMax[2] - boundsMin[2]);
    // Translation-only matrix (column-major)
    matrices.push([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      x, y, z, 1,
    ]);
  }
  return matrices;
}

// ─── LOD selection ───────────────────────────────────────────────────────────

function selectLOD(distance: number, thresholds: number[]): number {
  for (let i = 0; i < thresholds.length; i++) {
    if (distance < thresholds[i]) return i;
  }
  return thresholds.length;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 15 — Modeles et animations');

// Keyframe interpolation
runner.test('interpolateKeyframes — entre deux cles', () => {
  const kf: Keyframe[] = [{ time: 0, value: 0 }, { time: 1, value: 10 }];
  assertApprox(interpolateKeyframes(kf, 0.5), 5);
});

runner.test('interpolateKeyframes — avant la premiere cle', () => {
  const kf: Keyframe[] = [{ time: 1, value: 10 }, { time: 2, value: 20 }];
  assertApprox(interpolateKeyframes(kf, 0), 10);
});

runner.test('interpolateKeyframes — apres la derniere cle', () => {
  const kf: Keyframe[] = [{ time: 0, value: 0 }, { time: 1, value: 10 }];
  assertApprox(interpolateKeyframes(kf, 5), 10);
});

// Animation mixer
runner.test('mixerUpdate avance le temps et interpole', () => {
  const clip: AnimationClip = {
    duration: 2,
    keyframes: [{ time: 0, value: 0 }, { time: 2, value: 100 }],
    loop: false,
  };
  const mixer = createMixer(clip);
  const val = mixerUpdate(mixer, 1);
  assertApprox(val, 50);
  assertApprox(mixer.currentTime, 1);
});

runner.test('mixerUpdate boucle correctement', () => {
  const clip: AnimationClip = {
    duration: 2,
    keyframes: [{ time: 0, value: 0 }, { time: 2, value: 100 }],
    loop: true,
  };
  const mixer = createMixer(clip);
  mixerUpdate(mixer, 2.5);
  assertApprox(mixer.currentTime, 0.5);
});

// Crossfade
runner.test('crossfadeWeight — debut (t=0)', () => {
  const { weightA, weightB } = crossfadeWeight(0, 1);
  assertApprox(weightA, 1);
  assertApprox(weightB, 0);
});

runner.test('crossfadeWeight — milieu (t=0.5)', () => {
  const { weightA, weightB } = crossfadeWeight(0.5, 1);
  assertApprox(weightA, 0.5);
  assertApprox(weightB, 0.5);
});

runner.test('crossfadeValue melange deux valeurs', () => {
  const val = crossfadeValue(0, 100, 0.5, 1);
  assertApprox(val, 50);
});

// Skeletal hierarchy
runner.test('computeWorldMatrix — bone racine = localMatrix', () => {
  const identity: Mat4 = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
  const bones: Bone[] = [{ name: 'root', localMatrix: identity, parentIndex: -1 }];
  const world = computeWorldMatrix(bones, 0);
  assertArrayApprox(world as unknown as number[], identity as unknown as number[]);
});

runner.test('computeWorldMatrix — bone enfant combine les matrices', () => {
  const translateX: Mat4 = [1,0,0,0, 0,1,0,0, 0,0,1,0, 5,0,0,1];
  const translateY: Mat4 = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,3,0,1];
  const bones: Bone[] = [
    { name: 'root', localMatrix: translateX, parentIndex: -1 },
    { name: 'child', localMatrix: translateY, parentIndex: 0 },
  ];
  const world = computeWorldMatrix(bones, 1);
  // Translation should combine: x=5, y=3
  assertApprox(world[12], 5);
  assertApprox(world[13], 3);
});

// Skin vertex
runner.test('skinVertex — single bone, identity bind inverse', () => {
  const identity: Mat4 = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
  const translateX: Mat4 = [1,0,0,0, 0,1,0,0, 0,0,1,0, 10,0,0,1];
  const result = skinVertex(
    [0, 0, 0],
    [{ boneIndex: 0, weight: 1 }],
    [translateX],
    [identity]
  );
  assertApprox(result[0], 10);
  assertApprox(result[1], 0);
  assertApprox(result[2], 0);
});

// Morph targets
runner.test('morphBlend — poids 0 retourne la base', () => {
  const base: Vec3[] = [[0, 0, 0], [1, 1, 1]];
  const target: Vec3[] = [[10, 10, 10], [20, 20, 20]];
  const result = morphBlend(base, target, 0);
  assertArrayApprox(result[0], [0, 0, 0]);
  assertArrayApprox(result[1], [1, 1, 1]);
});

runner.test('morphBlend — poids 1 retourne la cible', () => {
  const base: Vec3[] = [[0, 0, 0]];
  const target: Vec3[] = [[10, 20, 30]];
  const result = morphBlend(base, target, 1);
  assertArrayApprox(result[0], [10, 20, 30]);
});

runner.test('morphBlend — poids 0.5 retourne la moyenne', () => {
  const base: Vec3[] = [[0, 0, 0]];
  const target: Vec3[] = [[10, 20, 30]];
  const result = morphBlend(base, target, 0.5);
  assertArrayApprox(result[0], [5, 10, 15]);
});

// Instance matrices
runner.test('generateInstanceMatrices produit le bon nombre de matrices', () => {
  const matrices = generateInstanceMatrices(10, [-5, 0, -5], [5, 0, 5], 42);
  assertEqual(matrices.length, 10);
  for (const m of matrices) {
    assertEqual(m.length, 16);
    // Translation x should be in bounds [-5, 5]
    assertTrue(m[12] >= -5 && m[12] <= 5);
  }
});

// LOD selection
runner.test('selectLOD — distance proche = LOD 0', () => {
  assertEqual(selectLOD(5, [10, 30, 60]), 0);
});

runner.test('selectLOD — distance moyenne = LOD 1', () => {
  assertEqual(selectLOD(20, [10, 30, 60]), 1);
});

runner.test('selectLOD — distance lointaine = LOD max', () => {
  assertEqual(selectLOD(100, [10, 30, 60]), 3);
});

runner.run();
