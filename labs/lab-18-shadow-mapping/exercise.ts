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
  // TODO: calculer les axes forward (f), right (s), up (u)
  // f = normalize(target - eye)
  // s = normalize(cross(f, up))
  // u = cross(s, f)
  // Retourner la matrice view column-major
  return [
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ];
}

/**
 * Construit une matrice de projection orthographique.
 * Column-major order.
 */
function ortho(left: number, right: number, bottom: number, top: number, near: number, far: number): Mat4 {
  // TODO: construire la matrice ortho
  // diag: [2/(r-l), 2/(t-b), -2/(f-n), 1]
  // translation: [-(r+l)/(r-l), -(t+b)/(t-b), -(f+n)/(f-n)]
  return [
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
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
  // TODO: combiner lookAt et ortho pour obtenir la matrice light-space
  return [
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ];
}

/**
 * Projette une position monde dans l'espace lumiere et retourne les coordonnees
 * de shadow map [u, v, depth] dans [0, 1].
 */
function shadowMapLookup(worldPos: Vec3, lightSpaceMat: Mat4): Vec3 {
  // TODO: transformer worldPos par lightSpaceMat
  // Faire la division perspective (clip / w)
  // Convertir NDC [-1,1] -> [0,1]
  return [0, 0, 0];
}

/**
 * Calcule un biais adaptatif base sur la pente (slope-based bias).
 * bias = baseBias + slopeFactor * (1 - NdotL)
 */
function slopeBias(normal: Vec3, lightDir: Vec3, baseBias: number, slopeFactor: number): number {
  // TODO: calculer le biais en fonction de l'angle entre la normale et la lumiere
  return 0;
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
  // TODO: boucle 3x3 (dx, dy de -1 a 1)
  // Pour chaque echantillon, comparer fragmentDepth - bias > sampleDepth
  // Retourner la moyenne des resultats (1 = eclaire, 0 = ombre)
  return 0;
}

/**
 * Practical split scheme pour CSM.
 * Melange logarithmique et lineaire avec un facteur lambda.
 */
function cascadeSplits(near: number, far: number, numCascades: number, lambda: number): number[] {
  // TODO: pour chaque cascade i (1..numCascades):
  // frac = i / numCascades
  // log = near * (far/near)^frac
  // linear = near + (far - near) * frac
  // split = lambda * log + (1 - lambda) * linear
  return [];
}

/**
 * Selectionne l'index de la cascade en fonction de la profondeur view-space.
 */
function selectCascade(viewDepth: number, splits: number[]): number {
  // TODO: retourner l'index de la premiere cascade dont le split >= viewDepth
  return 0;
}

/**
 * Pour une lumiere ponctuelle, selectionne la face du cubemap.
 * Retourne: 0=+X, 1=-X, 2=+Y, 3=-Y, 4=+Z, 5=-Z
 */
function cubemapFaceSelect(direction: Vec3): number {
  // TODO: trouver l'axe dominant et retourner la face correspondante
  return 0;
}

/**
 * VSM : calcule les moments (mean, meanSquared) a partir de valeurs de profondeur.
 */
function vsmMoments(depthValues: number[]): [number, number] {
  // TODO: calculer M1 = mean(depth), M2 = mean(depth^2)
  return [0, 0];
}

/**
 * VSM : estime la visibilite avec l'inegalite de Tchebychev.
 */
function vsmVisibility(mean: number, meanSquared: number, fragmentDepth: number): number {
  // TODO: si fragmentDepth <= mean, retourner 1.0
  // Sinon: variance = max(meanSquared - mean^2, 0.0001)
  // p_max = variance / (variance + (fragmentDepth - mean)^2)
  return 0;
}

/**
 * ESM : profondeur exponentielle. Retourne exp(c * depth).
 */
function esmExponentialDepth(depth: number, c: number): number {
  // TODO: retourner exp(c * depth)
  return 0;
}

/**
 * Clampe les coordonnees de shadow map dans [0, 1].
 * Si hors limites, retourne 1.0 (pas d'ombre).
 */
function shadowCoordClamp(u: number, v: number, depth: number, mapDepth: number, bias: number): number {
  // TODO: verifier si u,v sont dans [0,1]
  // Si non, retourner 1.0
  // Sinon, retourner 0.0 si depth - bias > mapDepth, sinon 1.0
  return 0;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 18 — Shadow Mapping');

runner.test('lookAt — lumiere en haut regardant l\'origine', () => {
  const view = lookAt([0, 10, 0], [0, 0, 0], [0, 0, -1]);
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
  const result = mat4MulVec4(lsm, [0, 0, 0, 1]);
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
  const depthMap = (_u: number, _v: number) => 1.0;
  const result = pcf3x3(0.5, 0.5, 0.3, depthMap, 1 / 512, 0.001);
  assertApprox(result, 1.0);
});

runner.test('PCF 3x3 — entierement dans l\'ombre', () => {
  const depthMap = (_u: number, _v: number) => 0.1;
  const result = pcf3x3(0.5, 0.5, 0.5, depthMap, 1 / 512, 0.001);
  assertApprox(result, 0.0);
});

runner.test('PCF 3x3 — partiellement ombre (bordure)', () => {
  let callIndex = 0;
  const depths = [0.9, 0.9, 0.9, 0.9, 0.9, 0.1, 0.1, 0.1, 0.1];
  const depthMap = (_u: number, _v: number) => depths[callIndex++];
  const result = pcf3x3(0.5, 0.5, 0.5, depthMap, 1 / 512, 0.001);
  assertApprox(result, 5 / 9, 0.01);
});

runner.test('cascadeSplits — 4 cascades (practical split)', () => {
  const splits = cascadeSplits(0.1, 100, 4, 0.5);
  assertEqual(splits.length, 4);
  for (let i = 1; i < splits.length; i++) {
    assertTrue(splits[i] > splits[i - 1], `split ${i} non croissant`);
  }
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
