import {
  createTestRunner,
  assertApprox,
  assertTrue,
  assertEqual,
  type Vec2,
  type Vec3,
} from '../test-utils.ts';

// ─── Hash / Gradient helpers (fournis) ──────────────────────────────────────

/** Hash pseudo-aleatoire simple pour obtenir un gradient 2D reproductible */
function hash2D(ix: number, iy: number): Vec2 {
  let h = ix * 127.1 + iy * 311.7;
  h = Math.sin(h) * 43758.5453;
  h = h - Math.floor(h);
  const angle = h * Math.PI * 2;
  return [Math.cos(angle), Math.sin(angle)];
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

function dot2(a: Vec2, b: Vec2): number {
  return a[0] * b[0] + a[1] * b[1];
}

// ─── Perlin Noise 2D ────────────────────────────────────────────────────────

function perlinNoise2D(x: number, y: number): number {
  // TODO: determiner la cellule de grille (ix, iy) et les fractions (fx, fy)
  // Appliquer fade() aux fractions
  // Calculer les gradients aux 4 coins avec hash2D
  // Calculer le produit scalaire de chaque gradient avec le vecteur distance
  // Interpoler bilineairement avec lerp
  return 0;
}

// ─── Simplex Noise 2D ───────────────────────────────────────────────────────

function simplexNoise2D(x: number, y: number): number {
  // TODO: appliquer le skewing factor F2 = 0.5 * (sqrt(3) - 1)
  // Determiner le simplexe (triangle) contenant le point
  // Calculer les contributions des 3 coins
  // Multiplier par un facteur de normalisation (~70)
  return 0;
}

// ─── FBM ────────────────────────────────────────────────────────────────────

function fbm(x: number, y: number, octaves: number, lacunarity: number, gain: number): number {
  // TODO: accumuler `octaves` couches de perlinNoise2D
  // A chaque octave: value += amplitude * noise(x*freq, y*freq)
  // Puis: frequency *= lacunarity, amplitude *= gain
  return 0;
}

// ─── Domain Warping ─────────────────────────────────────────────────────────

function domainWarp(x: number, y: number, strength: number): number {
  // TODO: calculer un offset X et Y avec deux appels de bruit (decales)
  // Puis echantillonner le bruit aux coordonnees deformees
  return 0;
}

// ─── SDF Primitives ─────────────────────────────────────────────────────────

function sdfSphere(point: Vec3, center: Vec3, radius: number): number {
  // TODO: retourner distance(point, center) - radius
  return 0;
}

function sdfBox(point: Vec3, center: Vec3, halfExtents: Vec3): number {
  // TODO: calculer la distance signee a une boite alignee aux axes
  // q = abs(point - center) - halfExtents
  // distance = length(max(q, 0)) + min(max(q.x, q.y, q.z), 0)
  return 0;
}

function sdfUnion(d1: number, d2: number): number {
  // TODO: retourner min(d1, d2)
  return 0;
}

function sdfIntersection(d1: number, d2: number): number {
  // TODO: retourner max(d1, d2)
  return 0;
}

function sdfSmoothUnion(d1: number, d2: number, k: number): number {
  // TODO: union douce avec facteur de melange k
  // h = max(k - abs(d1 - d2), 0) / k
  // retourner min(d1, d2) - h*h*k*0.25
  return 0;
}

// ─── Ray Marching ───────────────────────────────────────────────────────────

function rayMarchStep(
  origin: Vec3, direction: Vec3, currentT: number,
  sdf: (p: Vec3) => number,
): { t: number; position: Vec3; distance: number } {
  // TODO: calculer la position courante p = origin + direction * currentT
  // Evaluer la SDF a ce point
  // Retourner { t: currentT + distance, position: p, distance }
  return { t: 0, position: [0, 0, 0], distance: 0 };
}

// ─── Fresnel (Schlick) ──────────────────────────────────────────────────────

function fresnelSchlick(cosTheta: number, f0: number): number {
  // TODO: F = f0 + (1 - f0) * (1 - cosTheta)^5
  return 0;
}

// ─── Toon Shading ───────────────────────────────────────────────────────────

function toonQuantize(ndotl: number, bands: number): number {
  // TODO: clamper ndotl a [0, +inf), puis floor(ndotl * bands) / bands
  return 0;
}

// ─── Procedural Marble ──────────────────────────────────────────────────────

function proceduralMarble(x: number, y: number, scale: number, noiseStrength: number): number {
  // TODO: retourner sin(x * scale + noise(x*scale, y*scale) * noiseStrength)
  return 0;
}

// ─── Heightmap Normal Estimation ────────────────────────────────────────────

function heightmapNormal(
  x: number, y: number,
  heightFn: (x: number, y: number) => number,
  epsilon: number,
): Vec3 {
  // TODO: echantillonner 4 voisins (gauche, droite, bas, haut)
  // nx = hLeft - hRight
  // ny = 2 * epsilon
  // nz = hDown - hUp
  // Normaliser et retourner
  return [0, 1, 0];
}

// ─── Tests ──────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 19 — Shaders creatifs');

runner.test('perlinNoise2D — valeur aux entiers proche de 0', () => {
  assertApprox(perlinNoise2D(1.0, 1.0), 0, 0.001);
});

runner.test('perlinNoise2D — continuite (valeurs proches sont proches)', () => {
  const a = perlinNoise2D(3.5, 2.7);
  const b = perlinNoise2D(3.501, 2.701);
  assertTrue(Math.abs(a - b) < 0.01, `Discontinuite: ${a} vs ${b}`);
});

runner.test('perlinNoise2D — reproductibilite', () => {
  const a = perlinNoise2D(7.3, 4.1);
  const b = perlinNoise2D(7.3, 4.1);
  assertApprox(a, b);
});

runner.test('simplexNoise2D — continuite', () => {
  const a = simplexNoise2D(2.5, 3.7);
  const b = simplexNoise2D(2.501, 3.701);
  assertTrue(Math.abs(a - b) < 0.05, `Discontinuite simplex: ${a} vs ${b}`);
});

runner.test('simplexNoise2D — reproductibilite', () => {
  const a = simplexNoise2D(5.5, 1.2);
  const b = simplexNoise2D(5.5, 1.2);
  assertApprox(a, b);
});

runner.test('FBM — plus d\'octaves ajoute du detail', () => {
  const v1 = fbm(3.3, 2.2, 1, 2.0, 0.5);
  const v4 = fbm(3.3, 2.2, 4, 2.0, 0.5);
  const diff = Math.abs(v1 - v4);
  assertTrue(diff >= 0, 'FBM doit accumuler les octaves');
});

runner.test('FBM — 1 octave egal au bruit de base', () => {
  const v = fbm(1.7, 3.8, 1, 2.0, 0.5);
  const p = perlinNoise2D(1.7, 3.8);
  assertApprox(v, p, 0.001);
});

runner.test('domainWarp — produit une valeur finie', () => {
  const v = domainWarp(2.5, 3.5, 4.0);
  assertTrue(isFinite(v), `Valeur non finie: ${v}`);
});

runner.test('domainWarp — strength 0 egal au bruit direct', () => {
  const warped = domainWarp(2.5, 3.5, 0);
  const direct = perlinNoise2D(2.5, 3.5);
  assertApprox(warped, direct, 0.001);
});

runner.test('sdfSphere — point a la surface', () => {
  assertApprox(sdfSphere([1, 0, 0], [0, 0, 0], 1), 0);
});

runner.test('sdfSphere — point a l\'interieur', () => {
  assertTrue(sdfSphere([0.5, 0, 0], [0, 0, 0], 1) < 0);
});

runner.test('sdfSphere — point a l\'exterieur', () => {
  assertApprox(sdfSphere([3, 0, 0], [0, 0, 0], 1), 2);
});

runner.test('sdfBox — point a la surface', () => {
  assertApprox(sdfBox([1, 0, 0], [0, 0, 0], [1, 1, 1]), 0);
});

runner.test('sdfBox — point a l\'exterieur', () => {
  assertApprox(sdfBox([2, 0, 0], [0, 0, 0], [1, 1, 1]), 1);
});

runner.test('sdfBox — point a l\'interieur', () => {
  assertTrue(sdfBox([0, 0, 0], [0, 0, 0], [1, 1, 1]) < 0);
});

runner.test('sdfUnion — min des deux distances', () => {
  assertApprox(sdfUnion(2, 5), 2);
  assertApprox(sdfUnion(-1, 3), -1);
});

runner.test('sdfIntersection — max des deux distances', () => {
  assertApprox(sdfIntersection(2, 5), 5);
  assertApprox(sdfIntersection(-1, 3), 3);
});

runner.test('sdfSmoothUnion — inferieur ou egal au min', () => {
  const su = sdfSmoothUnion(2, 3, 1);
  assertTrue(su <= Math.min(2, 3), `Smooth union ${su} > min(2, 3)`);
});

runner.test('sdfSmoothUnion — converge vers min pour k=0', () => {
  const su = sdfSmoothUnion(2, 5, 0.0001);
  assertApprox(su, 2, 0.01);
});

runner.test('rayMarchStep — avance de la distance SDF', () => {
  const sdf = (p: Vec3) => sdfSphere(p, [0, 0, 5], 1);
  const step = rayMarchStep([0, 0, 0], [0, 0, 1], 0, sdf);
  assertApprox(step.t, 4, 0.001);
});

runner.test('rayMarchStep — converge vers la surface', () => {
  const sdf = (p: Vec3) => sdfSphere(p, [0, 0, 5], 1);
  let t = 0;
  for (let i = 0; i < 20; i++) {
    const step = rayMarchStep([0, 0, 0], [0, 0, 1], t, sdf);
    t = step.t;
  }
  assertApprox(t, 4, 0.01);
});

runner.test('fresnelSchlick — vue perpendiculaire (cos=1)', () => {
  assertApprox(fresnelSchlick(1, 0.04), 0.04);
});

runner.test('fresnelSchlick — vue rasante (cos=0)', () => {
  assertApprox(fresnelSchlick(0, 0.04), 1.0);
});

runner.test('fresnelSchlick — angle intermediaire', () => {
  const f = fresnelSchlick(0.5, 0.04);
  assertTrue(f > 0.04 && f < 1.0, `Fresnel hors plage: ${f}`);
});

runner.test('toonQuantize — 4 bandes', () => {
  assertApprox(toonQuantize(0.6, 4), 0.5);
  assertApprox(toonQuantize(0.9, 4), 0.75);
});

runner.test('toonQuantize — valeur negative clampee a 0', () => {
  assertApprox(toonQuantize(-0.5, 4), 0);
});

runner.test('proceduralMarble — retourne valeur dans [-1, 1]', () => {
  const v = proceduralMarble(1.5, 2.3, 2, 5);
  assertTrue(v >= -1 && v <= 1, `Marble hors [-1,1]: ${v}`);
});

runner.test('proceduralMarble — pattern sinusoidal modulable', () => {
  const v = proceduralMarble(0.5, 0, 1, 0);
  assertApprox(v, Math.sin(0.5), 0.01);
});

runner.test('heightmapNormal — terrain plat -> normale vers le haut', () => {
  const n = heightmapNormal(0, 0, (_x, _y) => 5, 0.01);
  assertApprox(n[0], 0, 0.01);
  assertApprox(n[1], 1, 0.01);
  assertApprox(n[2], 0, 0.01);
});

runner.test('heightmapNormal — pente en X -> normale inclinee', () => {
  // h = x -> hL = x-eps, hR = x+eps, nx = hL - hR = -2eps (tilt vers -X)
  const n = heightmapNormal(5, 5, (x, _y) => x, 0.01);
  assertTrue(n[0] < 0, 'Normale devrait s\'incliner contre la pente (nx < 0)');
  assertTrue(n[1] > 0, 'Composante Y devrait etre positive');
});

runner.run();
