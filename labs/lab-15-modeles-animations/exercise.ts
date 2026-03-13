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
  // TODO: interpolation lineaire entre les deux keyframes encadrant t
  // Si t <= premiere cle, retourner la valeur de la premiere cle
  // Si t >= derniere cle, retourner la valeur de la derniere cle
  // Sinon trouver l'intervalle [ki, ki+1] et interpoler :
  //   alpha = (t - ki.time) / (ki+1.time - ki.time)
  //   value = ki.value + (ki+1.value - ki.value) * alpha
  return 0;
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
  // TODO: avancer mixer.currentTime de deltaTime
  // Si loop: currentTime = currentTime % duration
  // Sinon: currentTime = min(currentTime, duration)
  // Retourner la valeur interpolee a currentTime
  return 0;
}

// ─── Crossfade ───────────────────────────────────────────────────────────────

function crossfadeWeight(elapsed: number, duration: number): { weightA: number; weightB: number } {
  // TODO: calculer les poids de crossfade
  // t = min(elapsed / duration, 1)
  // weightA = 1 - t, weightB = t
  return { weightA: 0, weightB: 0 };
}

function crossfadeValue(valueA: number, valueB: number, elapsed: number, duration: number): number {
  // TODO: combiner valueA et valueB avec les poids du crossfade
  return 0;
}

// ─── Skeletal bone hierarchy ─────────────────────────────────────────────────

interface Bone {
  name: string;
  localMatrix: Mat4;
  parentIndex: number; // -1 = root
}

function mat4Mul(a: Mat4, b: Mat4): Mat4 {
  // TODO: multiplication de matrices 4x4 (column-major)
  const out: number[] = new Array(16).fill(0);
  return out as unknown as Mat4;
}

function computeWorldMatrix(bones: Bone[], boneIndex: number): Mat4 {
  // TODO: calculer la matrice monde d'un bone
  // Si parentIndex === -1, retourner localMatrix
  // Sinon: computeWorldMatrix(parent) * localMatrix
  return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
}

// ─── Skin vertex transform ───────────────────────────────────────────────────

function mat4TransformPoint(m: Mat4, p: Vec3): Vec3 {
  // TODO: transformer un point par une matrice 4x4
  // x' = m[0]*x + m[4]*y + m[8]*z + m[12]
  // y' = m[1]*x + m[5]*y + m[9]*z + m[13]
  // z' = m[2]*x + m[6]*y + m[10]*z + m[14]
  return [0, 0, 0];
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
  // TODO: pour chaque poids:
  //   skinMatrix = boneWorldMatrices[i] * bindInverses[i]
  //   transformed = mat4TransformPoint(skinMatrix, position)
  //   result += transformed * weight
  return [0, 0, 0];
}

// ─── Morph targets ───────────────────────────────────────────────────────────

function morphBlend(base: Vec3[], target: Vec3[], weight: number): Vec3[] {
  // TODO: pour chaque sommet i:
  //   result[i] = base[i] + (target[i] - base[i]) * weight
  return [];
}

// ─── Instance matrix generation ──────────────────────────────────────────────

function generateInstanceMatrices(
  count: number,
  boundsMin: Vec3,
  boundsMax: Vec3,
  seed: number
): Mat4[] {
  // TODO: generer count matrices de translation avec des positions aleatoires
  // dans les bornes [boundsMin, boundsMax]
  // Utiliser le generateur pseudo-aleatoire fourni :
  let s = seed;
  const random = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  // Pour chaque instance, creer une matrice de translation (column-major) :
  // [1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]
  return [];
}

// ─── LOD selection ───────────────────────────────────────────────────────────

function selectLOD(distance: number, thresholds: number[]): number {
  // TODO: retourner l'index du LOD en fonction de la distance
  // Parcourir les seuils : si distance < thresholds[i], retourner i
  // Si au-dela de tous les seuils, retourner thresholds.length
  return 0;
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
