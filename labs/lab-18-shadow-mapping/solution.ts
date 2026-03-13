import {
  createTestRunner,
  assertApprox,
  assertArrayApprox,
  assertTrue,
  assertFalse,
  assertEqual,
  type Vec3,
  type Mat4,
} from '../test-utils.ts';

// ─── Helpers Vec3 / Mat4 ────────────────────────────────────────────────────

function vec3Dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vec3Normalize(v: Vec3): Vec3 {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (len === 0) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
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

function mat4MulVec4(m: Mat4, v: [number, number, number, number]): [number, number, number, number] {
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (let row = 0; row < 4; row++) {
    out[row] = m[0 * 4 + row] * v[0] + m[1 * 4 + row] * v[1] + m[2 * 4 + row] * v[2] + m[3 * 4 + row] * v[3];
  }
  return out;
}

// ─── Shadow Mapping Functions ───────────────────────────────────────────────

/**
 * Construit une matrice lookAt (view) depuis la position de la lumiere.
 * Column-major order.
 */
function lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  const f = vec3Normalize(vec3Sub(target, eye));
  const s = vec3Normalize(vec3Cross(f, up));
  const u = vec3Cross(s, f);

  return [
    s[0], u[0], -f[0], 0,
    s[1], u[1], -f[1], 0,
    s[2], u[2], -f[2], 0,
    -vec3Dot(s, eye), -vec3Dot(u, eye), vec3Dot(f, eye), 1,
  ];
}

/**
 * Construit une matrice de projection orthographique.
 * Column-major order.
 */
function ortho(left: number, right: number, bottom: number, top: number, near: number, far: number): Mat4 {
  const rl = right - left;
  const tb = top - bottom;
  const fn = far - near;
  return [
    2 / rl, 0, 0, 0,
    0, 2 / tb, 0, 0,
    0, 0, -2 / fn, 0,
    -(right + left) / rl, -(top + bottom) / tb, -(far + near) / fn, 1,
  ];
}

/**
 * Calcule la matrice light-space = ortho * lookAt
 */
function lightSpaceMatrix(
  lightPos: Vec3,
  lightTarget: Vec3,
  lightUp: Vec3,
  left: number, right: number, bottom: number, top: number, near: number, far: number,
): Mat4 {
  const view = lookAt(lightPos, lightTarget, lightUp);
  const proj = ortho(left, right, bottom, top, near, far);
  return mat4Multiply(proj, view);
}

/**
 * Projette une position monde dans l'espace lumiere et retourne les coordonnees
 * de shadow map [u, v, depth] dans [0, 1].
 */
function shadowMapLookup(worldPos: Vec3, lightSpaceMat: Mat4): Vec3 {
  const clipPos = mat4MulVec4(lightSpaceMat, [worldPos[0], worldPos[1], worldPos[2], 1]);
  // Perspective divide (pour ortho, w=1 normalement)
  const ndc: Vec3 = [clipPos[0] / clipPos[3], clipPos[1] / clipPos[3], clipPos[2] / clipPos[3]];
  // NDC [-1,1] -> [0,1]
  return [(ndc[0] + 1) * 0.5, (ndc[1] + 1) * 0.5, (ndc[2] + 1) * 0.5];
}

/**
 * Calcule un biais adaptatif base sur la pente (slope-based bias).
 * bias = baseBias + slopeFactor * (1 - NdotL)
 */
function slopeBias(normal: Vec3, lightDir: Vec3, baseBias: number, slopeFactor: number): number {
  const NdotL = Math.max(0, vec3Dot(vec3Normalize(normal), vec3Normalize(lightDir)));
  return baseBias + slopeFactor * (1 - NdotL);
}

/**
 * PCF 3x3 : echantillonne 9 texels autour de (u, v) dans la shadow map.
 * depthMap est une fonction qui retourne la profondeur a (u, v).
 * texelSize est la taille d'un texel en UV.
 * Retourne la fraction [0, 1] de lumiere (1 = pas d'ombre).
 */
function pcf3x3(
  u: number, v: number, fragmentDepth: number,
  depthMap: (u: number, v: number) => number,
  texelSize: number, bias: number,
): number {
  let shadow = 0;
  let count = 0;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const sampleDepth = depthMap(u + dx * texelSize, v + dy * texelSize);
      shadow += (fragmentDepth - bias > sampleDepth) ? 0 : 1;
      count++;
    }
  }
  return shadow / count;
}

/**
 * Practical split scheme pour CSM.
 * Melange logarithmique et lineaire avec un facteur lambda.
 * splitI = lambda * log + (1 - lambda) * linear
 */
function cascadeSplits(near: number, far: number, numCascades: number, lambda: number): number[] {
  const splits: number[] = [];
  for (let i = 1; i <= numCascades; i++) {
    const frac = i / numCascades;
    const log = near * Math.pow(far / near, frac);
    const linear = near + (far - near) * frac;
    splits.push(lambda * log + (1 - lambda) * linear);
  }
  return splits;
}

/**
 * Selectionne l'index de la cascade en fonction de la profondeur view-space.
 * Retourne l'index de la premiere cascade dont le split est >= depth.
 */
function selectCascade(viewDepth: number, splits: number[]): number {
  for (let i = 0; i < splits.length; i++) {
    if (viewDepth <= splits[i]) return i;
  }
  return splits.length - 1;
}

/**
 * Pour une lumiere ponctuelle, selectionne la face du cubemap
 * en fonction de la direction du fragment vers la lumiere.
 * Retourne: 0=+X, 1=-X, 2=+Y, 3=-Y, 4=+Z, 5=-Z
 */
function cubemapFaceSelect(direction: Vec3): number {
  const ax = Math.abs(direction[0]);
  const ay = Math.abs(direction[1]);
  const az = Math.abs(direction[2]);

  if (ax >= ay && ax >= az) {
    return direction[0] > 0 ? 0 : 1;
  } else if (ay >= ax && ay >= az) {
    return direction[1] > 0 ? 2 : 3;
  } else {
    return direction[2] > 0 ? 4 : 5;
  }
}

/**
 * VSM : calcule les moments (mean, meanSquared) a partir de valeurs de profondeur.
 * Retourne [M1, M2] ou M1 = mean(depth), M2 = mean(depth^2).
 */
function vsmMoments(depthValues: number[]): [number, number] {
  const n = depthValues.length;
  let sum = 0;
  let sumSq = 0;
  for (const d of depthValues) {
    sum += d;
    sumSq += d * d;
  }
  return [sum / n, sumSq / n];
}

/**
 * VSM : estime la visibilite avec l'inegalite de Tchebychev.
 * p_max = variance / (variance + (depth - mean)^2)
 */
function vsmVisibility(mean: number, meanSquared: number, fragmentDepth: number): number {
  if (fragmentDepth <= mean) return 1.0;
  const variance = Math.max(meanSquared - mean * mean, 0.0001);
  const d = fragmentDepth - mean;
  return variance / (variance + d * d);
}

/**
 * ESM : profondeur exponentielle.
 * Retourne exp(c * depth).
 */
function esmExponentialDepth(depth: number, c: number): number {
  return Math.exp(c * depth);
}

/**
 * Clampe les coordonnees de shadow map dans [0, 1].
 * Si hors limites, retourne 1.0 (pas d'ombre).
 * Sinon retourne la comparaison de profondeur.
 */
function shadowCoordClamp(u: number, v: number, depth: number, mapDepth: number, bias: number): number {
  if (u < 0 || u > 1 || v < 0 || v > 1) return 1.0;
  return (depth - bias > mapDepth) ? 0.0 : 1.0;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 18 — Shadow Mapping');

runner.test('lookAt — lumiere en haut regardant l\'origine', () => {
  const view = lookAt([0, 10, 0], [0, 0, 0], [0, 0, -1]);
  // Transformer l'origine: devrait etre a z = -10 en view space
  const result = mat4MulVec4(view, [0, 0, 0, 1]);
  assertApprox(result[2], -10, 0.001);
});

runner.test('ortho — point au centre mappe a l\'origine NDC', () => {
  const proj = ortho(-10, 10, -10, 10, 0.1, 100);
  const result = mat4MulVec4(proj, [0, 0, -50.05, 1]);
  assertApprox(result[0], 0, 0.01);
  assertApprox(result[1], 0, 0.01);
});

runner.test('lightSpaceMatrix — composition correcte', () => {
  const lsm = lightSpaceMatrix([0, 10, 0], [0, 0, 0], [0, 0, -1], -10, 10, -10, 10, 0.1, 20);
  // L'origine monde devrait etre transformee correctement
  const result = mat4MulVec4(lsm, [0, 0, 0, 1]);
  // Doit etre dans la plage NDC valide
  assertTrue(result[0] >= -1 && result[0] <= 1, `x=${result[0]} hors NDC`);
  assertTrue(result[1] >= -1 && result[1] <= 1, `y=${result[1]} hors NDC`);
});

runner.test('shadowMapLookup — centre de la scene mappe au centre', () => {
  const lsm = lightSpaceMatrix([0, 10, 0], [0, 0, 0], [0, 0, -1], -10, 10, -10, 10, 0.1, 20);
  const uv = shadowMapLookup([0, 0, 0], lsm);
  assertApprox(uv[0], 0.5, 0.01);
  assertApprox(uv[1], 0.5, 0.01);
  assertTrue(uv[2] >= 0 && uv[2] <= 1, `depth=${uv[2]} hors [0,1]`);
});

runner.test('slopeBias — face a la lumiere (biais minimal)', () => {
  const bias = slopeBias([0, 1, 0], [0, 1, 0], 0.001, 0.005);
  assertApprox(bias, 0.001, 0.0001);
});

runner.test('slopeBias — surface rasante (biais maximal)', () => {
  const bias = slopeBias([0, 1, 0], [1, 0, 0], 0.001, 0.005);
  assertApprox(bias, 0.006, 0.0001);
});

runner.test('PCF 3x3 — entierement eclaire', () => {
  const depthMap = (_u: number, _v: number) => 1.0; // shadow map profonde
  const result = pcf3x3(0.5, 0.5, 0.3, depthMap, 1 / 512, 0.001);
  assertApprox(result, 1.0);
});

runner.test('PCF 3x3 — entierement dans l\'ombre', () => {
  const depthMap = (_u: number, _v: number) => 0.1;
  const result = pcf3x3(0.5, 0.5, 0.5, depthMap, 1 / 512, 0.001);
  assertApprox(result, 0.0);
});

runner.test('PCF 3x3 — partiellement ombre (bordure)', () => {
  // 5 texels eclaires, 4 dans l'ombre
  let callIndex = 0;
  const depths = [0.9, 0.9, 0.9, 0.9, 0.9, 0.1, 0.1, 0.1, 0.1];
  const depthMap = (_u: number, _v: number) => depths[callIndex++];
  const result = pcf3x3(0.5, 0.5, 0.5, depthMap, 1 / 512, 0.001);
  assertApprox(result, 5 / 9, 0.01);
});

runner.test('cascadeSplits — 4 cascades (practical split)', () => {
  const splits = cascadeSplits(0.1, 100, 4, 0.5);
  assertEqual(splits.length, 4);
  // Les splits doivent etre croissants
  for (let i = 1; i < splits.length; i++) {
    assertTrue(splits[i] > splits[i - 1], `split ${i} non croissant`);
  }
  // Le dernier split doit etre egal a far
  assertApprox(splits[3], 100, 0.01);
});

runner.test('selectCascade — profondeur proche -> cascade 0', () => {
  const splits = cascadeSplits(0.1, 100, 4, 0.5);
  assertEqual(selectCascade(0.5, splits), 0);
});

runner.test('selectCascade — profondeur lointaine -> derniere cascade', () => {
  const splits = cascadeSplits(0.1, 100, 4, 0.5);
  assertEqual(selectCascade(99, splits), 3);
});

runner.test('cubemapFaceSelect — direction +X', () => {
  assertEqual(cubemapFaceSelect([1, 0.2, -0.3]), 0);
});

runner.test('cubemapFaceSelect — direction -Y', () => {
  assertEqual(cubemapFaceSelect([0.1, -1, 0.2]), 3);
});

runner.test('cubemapFaceSelect — direction +Z', () => {
  assertEqual(cubemapFaceSelect([0.1, 0.2, 1]), 4);
});

runner.test('VSM moments — valeurs uniformes', () => {
  const [m1, m2] = vsmMoments([0.5, 0.5, 0.5, 0.5]);
  assertApprox(m1, 0.5);
  assertApprox(m2, 0.25);
});

runner.test('VSM moments — valeurs variees', () => {
  const [m1, m2] = vsmMoments([0.2, 0.4, 0.6, 0.8]);
  assertApprox(m1, 0.5);
  assertApprox(m2, (0.04 + 0.16 + 0.36 + 0.64) / 4);
});

runner.test('VSM visibilite — fragment devant la moyenne', () => {
  const vis = vsmVisibility(0.5, 0.26, 0.3);
  assertApprox(vis, 1.0);
});

runner.test('VSM visibilite — fragment derriere la moyenne', () => {
  const vis = vsmVisibility(0.5, 0.26, 0.7);
  // variance = 0.26 - 0.25 = 0.01, d = 0.2, vis = 0.01 / (0.01 + 0.04) = 0.2
  assertApprox(vis, 0.2, 0.01);
});

runner.test('ESM — profondeur exponentielle', () => {
  const result = esmExponentialDepth(0.5, 80);
  assertApprox(result, Math.exp(40), 1e-3);
});

runner.test('shadowCoordClamp — hors limites retourne 1 (pas d\'ombre)', () => {
  assertApprox(shadowCoordClamp(-0.1, 0.5, 0.5, 0.3, 0.001), 1.0);
  assertApprox(shadowCoordClamp(0.5, 1.1, 0.5, 0.3, 0.001), 1.0);
});

runner.test('shadowCoordClamp — dans les limites, dans l\'ombre', () => {
  assertApprox(shadowCoordClamp(0.5, 0.5, 0.8, 0.3, 0.001), 0.0);
});

runner.test('shadowCoordClamp — dans les limites, eclaire', () => {
  assertApprox(shadowCoordClamp(0.5, 0.5, 0.3, 0.8, 0.001), 1.0);
});

runner.run();
