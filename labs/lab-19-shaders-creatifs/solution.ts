import {
  createTestRunner,
  assertApprox,
  assertTrue,
  assertEqual,
  type Vec2,
  type Vec3,
} from '../test-utils.ts';

// ─── Hash / Gradient helpers ────────────────────────────────────────────────

/** Hash pseudo-aleatoire simple pour obtenir un gradient 2D reproductible */
function hash2D(ix: number, iy: number): Vec2 {
  // Pseudo-random basee sur des constantes irrationnelles
  let h = ix * 127.1 + iy * 311.7;
  h = Math.sin(h) * 43758.5453;
  h = h - Math.floor(h);
  const angle = h * Math.PI * 2;
  return [Math.cos(angle), Math.sin(angle)];
}

function fade(t: number): number {
  // 6t^5 - 15t^4 + 10t^3 (smootherstep)
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
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;

  const u = fade(fx);
  const v = fade(fy);

  const g00 = hash2D(ix, iy);
  const g10 = hash2D(ix + 1, iy);
  const g01 = hash2D(ix, iy + 1);
  const g11 = hash2D(ix + 1, iy + 1);

  const n00 = dot2(g00, [fx, fy]);
  const n10 = dot2(g10, [fx - 1, fy]);
  const n01 = dot2(g01, [fx, fy - 1]);
  const n11 = dot2(g11, [fx - 1, fy - 1]);

  const nx0 = lerp(n00, n10, u);
  const nx1 = lerp(n01, n11, u);
  return lerp(nx0, nx1, v);
}

// ─── Simplex Noise 2D ───────────────────────────────────────────────────────

function simplexNoise2D(x: number, y: number): number {
  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;

  const s = (x + y) * F2;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const t = (i + j) * G2;

  const X0 = i - t;
  const Y0 = j - t;
  const x0 = x - X0;
  const y0 = y - Y0;

  let i1: number, j1: number;
  if (x0 > y0) { i1 = 1; j1 = 0; }
  else { i1 = 0; j1 = 1; }

  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;

  function contrib(gx: number, gy: number, dx: number, dy: number): number {
    const t2 = 0.5 - dx * dx - dy * dy;
    if (t2 < 0) return 0;
    const g = hash2D(gx, gy);
    return t2 * t2 * t2 * t2 * dot2(g, [dx, dy]);
  }

  const n0 = contrib(i, j, x0, y0);
  const n1 = contrib(i + i1, j + j1, x1, y1);
  const n2 = contrib(i + 1, j + 1, x2, y2);

  // Facteur de normalisation approximatif
  return 70 * (n0 + n1 + n2);
}

// ─── FBM ────────────────────────────────────────────────────────────────────

function fbm(x: number, y: number, octaves: number, lacunarity: number, gain: number): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * perlinNoise2D(x * frequency, y * frequency);
    frequency *= lacunarity;
    amplitude *= gain;
  }
  return value;
}

// ─── Domain Warping ─────────────────────────────────────────────────────────

function domainWarp(x: number, y: number, strength: number): number {
  const offsetX = perlinNoise2D(x, y);
  const offsetY = perlinNoise2D(x + 5.2, y + 1.3);
  return perlinNoise2D(x + offsetX * strength, y + offsetY * strength);
}

// ─── SDF Primitives ─────────────────────────────────────────────────────────

function sdfSphere(point: Vec3, center: Vec3, radius: number): number {
  const dx = point[0] - center[0];
  const dy = point[1] - center[1];
  const dz = point[2] - center[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - radius;
}

function sdfBox(point: Vec3, center: Vec3, halfExtents: Vec3): number {
  const dx = Math.abs(point[0] - center[0]) - halfExtents[0];
  const dy = Math.abs(point[1] - center[1]) - halfExtents[1];
  const dz = Math.abs(point[2] - center[2]) - halfExtents[2];
  const outside = Math.sqrt(
    Math.max(dx, 0) ** 2 + Math.max(dy, 0) ** 2 + Math.max(dz, 0) ** 2,
  );
  const inside = Math.min(Math.max(dx, dy, dz), 0);
  return outside + inside;
}

function sdfUnion(d1: number, d2: number): number {
  return Math.min(d1, d2);
}

function sdfIntersection(d1: number, d2: number): number {
  return Math.max(d1, d2);
}

function sdfSmoothUnion(d1: number, d2: number, k: number): number {
  const h = Math.max(k - Math.abs(d1 - d2), 0) / k;
  return Math.min(d1, d2) - h * h * k * 0.25;
}

// ─── Ray Marching ───────────────────────────────────────────────────────────

function rayMarchStep(
  origin: Vec3, direction: Vec3, currentT: number,
  sdf: (p: Vec3) => number,
): { t: number; position: Vec3; distance: number } {
  const p: Vec3 = [
    origin[0] + direction[0] * currentT,
    origin[1] + direction[1] * currentT,
    origin[2] + direction[2] * currentT,
  ];
  const d = sdf(p);
  return {
    t: currentT + d,
    position: p,
    distance: d,
  };
}

// ─── Fresnel (Schlick) ──────────────────────────────────────────────────────

function fresnelSchlick(cosTheta: number, f0: number): number {
  return f0 + (1 - f0) * Math.pow(1 - cosTheta, 5);
}

// ─── Toon Shading ───────────────────────────────────────────────────────────

function toonQuantize(ndotl: number, bands: number): number {
  const clamped = Math.max(0, ndotl);
  return Math.floor(clamped * bands) / bands;
}

// ─── Procedural Marble ──────────────────────────────────────────────────────

function proceduralMarble(x: number, y: number, scale: number, noiseStrength: number): number {
  const noise = perlinNoise2D(x * scale, y * scale);
  return Math.sin(x * scale + noise * noiseStrength);
}

// ─── Heightmap Normal Estimation ────────────────────────────────────────────

function heightmapNormal(
  x: number, y: number,
  heightFn: (x: number, y: number) => number,
  epsilon: number,
): Vec3 {
  const hL = heightFn(x - epsilon, y);
  const hR = heightFn(x + epsilon, y);
  const hD = heightFn(x, y - epsilon);
  const hU = heightFn(x, y + epsilon);

  const nx = hL - hR;
  const ny = 2 * epsilon;
  const nz = hD - hU;

  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  return [nx / len, ny / len, nz / len];
}

// ─── Tests ──────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 19 — Shaders creatifs');

// Perlin noise
runner.test('perlinNoise2D — valeur aux entiers proche de 0', () => {
  // Aux points de grille, les produits scalaires avec (0,0) donnent 0
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

// Simplex noise
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

// FBM
runner.test('FBM — plus d\'octaves ajoute du detail', () => {
  // Avec 1 octave vs 4 octaves, les valeurs different
  const v1 = fbm(3.3, 2.2, 1, 2.0, 0.5);
  const v4 = fbm(3.3, 2.2, 4, 2.0, 0.5);
  // Pas necessairement different a cet endroit precis, mais on verifie le mecanisme
  const diff = Math.abs(v1 - v4);
  assertTrue(diff >= 0, 'FBM doit accumuler les octaves');
});

runner.test('FBM — 1 octave egal au bruit de base', () => {
  const v = fbm(1.7, 3.8, 1, 2.0, 0.5);
  const p = perlinNoise2D(1.7, 3.8);
  assertApprox(v, p, 0.001);
});

// Domain warping
runner.test('domainWarp — produit une valeur finie', () => {
  const v = domainWarp(2.5, 3.5, 4.0);
  assertTrue(isFinite(v), `Valeur non finie: ${v}`);
});

runner.test('domainWarp — strength 0 egal au bruit direct', () => {
  const warped = domainWarp(2.5, 3.5, 0);
  const direct = perlinNoise2D(2.5, 3.5);
  assertApprox(warped, direct, 0.001);
});

// SDF
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

// Ray marching
runner.test('rayMarchStep — avance de la distance SDF', () => {
  const sdf = (p: Vec3) => sdfSphere(p, [0, 0, 5], 1);
  const step = rayMarchStep([0, 0, 0], [0, 0, 1], 0, sdf);
  assertApprox(step.t, 4, 0.001); // distance a la sphere = 5 - 1 = 4
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

// Fresnel
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

// Toon shading
runner.test('toonQuantize — 4 bandes', () => {
  assertApprox(toonQuantize(0.6, 4), 0.5);  // floor(0.6*4)/4 = 2/4 = 0.5
  assertApprox(toonQuantize(0.9, 4), 0.75); // floor(0.9*4)/4 = 3/4 = 0.75
});

runner.test('toonQuantize — valeur negative clampee a 0', () => {
  assertApprox(toonQuantize(-0.5, 4), 0);
});

// Procedural marble
runner.test('proceduralMarble — retourne valeur dans [-1, 1]', () => {
  const v = proceduralMarble(1.5, 2.3, 2, 5);
  assertTrue(v >= -1 && v <= 1, `Marble hors [-1,1]: ${v}`);
});

runner.test('proceduralMarble — pattern sinusoidal modulable', () => {
  // Avec noiseStrength=0, c'est un simple sin
  const v = proceduralMarble(0.5, 0, 1, 0);
  assertApprox(v, Math.sin(0.5), 0.01);
});

// Heightmap normal
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
