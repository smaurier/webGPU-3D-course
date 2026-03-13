import {
  createTestRunner,
  assertEqual,
  assertApprox,
  assertTrue,
  assertFalse,
  assertDeepEqual,
  assertArrayApprox,
  type Vec2,
  type Vec3,
  type Mat4,
  type Ray,
  type AABB,
} from '../test-utils.ts';

// ─── Render target chain ─────────────────────────────────────────────────────

interface RenderPass {
  name: string;
  inputFrom: string | null; // null = scene render
  outputTo: string | null;  // null = screen
}

function buildRenderChain(passNames: string[]): RenderPass[] {
  // TODO: creer une chaine de passes de rendu
  // Le premier pass a inputFrom = null (scene), le dernier a outputTo = null (ecran)
  // Chaque pass intermediaire prend l'input du pass precedent
  return [];
}

// ─── Bloom threshold ─────────────────────────────────────────────────────────

function bloomThreshold(color: Vec3, threshold: number): Vec3 {
  // TODO: calculer la luminance : 0.2126*R + 0.7152*G + 0.0722*B
  // Si luminance < threshold, retourner [0,0,0] (noir)
  // Sinon retourner la couleur inchangee
  return [0, 0, 0];
}

// ─── Gaussian blur weights ───────────────────────────────────────────────────

function gaussianWeights(kernelSize: number, sigma: number): number[] {
  // TODO: generer un noyau gaussien 1D normalise
  // half = floor(kernelSize / 2)
  // Pour i de -half a +half : w = exp(-i^2 / (2*sigma^2))
  // Normaliser pour que la somme = 1
  return [];
}

// ─── Vignette effect ─────────────────────────────────────────────────────────

function vignetteStrength(uv: Vec2, intensity: number, smoothness: number): number {
  // TODO: calculer l'assombrissement du vignettage
  // dist = distance de uv au centre (0.5, 0.5)
  // maxDist = sqrt(0.5) (distance du coin au centre)
  // normalized = dist / maxDist
  // factor = 1 - pow(normalized, smoothness) * intensity
  // Clamper entre 0 et 1
  return 0;
}

// ─── Tone mapping ────────────────────────────────────────────────────────────

function reinhardToneMap(x: number): number {
  // TODO: retourner x / (1 + x)
  return 0;
}

function acesFilmicToneMap(x: number): number {
  // TODO: approximation ACES filmic
  // a=2.51, b=0.03, c=2.43, d=0.59, e=0.14
  // result = clamp((x*(a*x+b)) / (x*(c*x+d)+e), 0, 1)
  return 0;
}

// ─── Color grading ───────────────────────────────────────────────────────────

function colorGrade(
  color: Vec3,
  brightness: number,
  contrast: number,
  saturation: number
): Vec3 {
  // TODO:
  // 1. Brightness: multiplier chaque canal par brightness
  // 2. Contrast: (canal - 0.5) * contrast + 0.5
  // 3. Saturation: lum = 0.2126*r + 0.7152*g + 0.0722*b
  //    canal = lum + (canal - lum) * saturation
  // Clamper chaque canal entre 0 et 1
  return [0, 0, 0];
}

// ─── Chromatic aberration ────────────────────────────────────────────────────

function chromaticAberrationUV(uv: Vec2, strength: number): { r: Vec2; g: Vec2; b: Vec2 } {
  // TODO: decaler les UVs pour R et B par rapport au centre (0.5, 0.5)
  // cx = uv[0] - 0.5, cy = uv[1] - 0.5
  // R: uv + (cx,cy)*strength, G: uv inchange, B: uv - (cx,cy)*strength
  return { r: [0, 0], g: [0, 0], b: [0, 0] };
}

// ─── Depth of field ──────────────────────────────────────────────────────────

function circleOfConfusion(
  depth: number,
  focalDistance: number,
  focalLength: number,
  aperture: number
): number {
  // TODO: CoC = |aperture * focalLength * (depth - focalDistance) / (depth * (focalDistance - focalLength))|
  // Retourner 0 si depth == 0 ou si le denominateur == 0
  return 0;
}

// ─── Raycaster ───────────────────────────────────────────────────────────────

function raySphereIntersect(ray: Ray, center: Vec3, radius: number): { hit: boolean; t: number } {
  // TODO: intersection rayon-sphere
  // oc = ray.origin - center
  // a = dot(dir, dir), b = 2*dot(oc, dir), c = dot(oc, oc) - r^2
  // discriminant = b^2 - 4ac
  // Si < 0 : pas d'intersection
  // Sinon t = (-b - sqrt(discriminant)) / (2a)
  return { hit: false, t: -1 };
}

function rayAABBIntersect(ray: Ray, aabb: AABB): { hit: boolean; t: number } {
  // TODO: intersection rayon-AABB par la methode des slabs
  // Pour chaque axe: t1 = (min - origin) / direction, t2 = (max - origin) / direction
  // tmin = max des t1, tmax = min des t2
  // Si tmin > tmax ou tmax < 0 : pas d'intersection
  return { hit: false, t: -1 };
}

// ─── Screen-space UV from 3D position ────────────────────────────────────────

function projectToScreenUV(position: Vec3, mvp: Mat4): Vec2 | null {
  // TODO: multiplier position par la matrice MVP
  // x = mvp[0]*px + mvp[4]*py + mvp[8]*pz + mvp[12]
  // y = mvp[1]*px + mvp[5]*py + mvp[9]*pz + mvp[13]
  // w = mvp[3]*px + mvp[7]*py + mvp[11]*pz + mvp[15]
  // Si w <= 0, retourner null (derriere la camera)
  // NDC: ndcX = x/w, ndcY = y/w
  // UV: [ndcX*0.5+0.5, ndcY*0.5+0.5]
  return null;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 16 — Post-processing');

// Render chain
runner.test('buildRenderChain cree une chaine correcte', () => {
  const chain = buildRenderChain(['bloom', 'tonemap', 'fxaa']);
  assertEqual(chain.length, 3);
  assertEqual(chain[0].inputFrom, null);
  assertEqual(chain[0].outputTo, 'bloom');
  assertEqual(chain[1].inputFrom, 'bloom');
  assertEqual(chain[1].outputTo, 'tonemap');
  assertEqual(chain[2].inputFrom, 'tonemap');
  assertEqual(chain[2].outputTo, null);
});

// Bloom threshold
runner.test('bloomThreshold — pixel lumineux conserve', () => {
  const result = bloomThreshold([1.5, 1.2, 0.8], 0.8);
  assertDeepEqual(result, [1.5, 1.2, 0.8]);
});

runner.test('bloomThreshold — pixel sombre devient noir', () => {
  const result = bloomThreshold([0.1, 0.1, 0.1], 0.8);
  assertDeepEqual(result, [0, 0, 0]);
});

// Gaussian weights
runner.test('gaussianWeights somme a 1', () => {
  const weights = gaussianWeights(5, 1.5);
  assertEqual(weights.length, 5);
  const sum = weights.reduce((a, b) => a + b, 0);
  assertApprox(sum, 1);
});

runner.test('gaussianWeights symetrique', () => {
  const weights = gaussianWeights(5, 1.5);
  assertApprox(weights[0], weights[4]);
  assertApprox(weights[1], weights[3]);
});

// Vignette
runner.test('vignetteStrength — centre = pleine luminosite', () => {
  const s = vignetteStrength([0.5, 0.5], 1, 2);
  assertApprox(s, 1);
});

runner.test('vignetteStrength — coin = assombri', () => {
  const s = vignetteStrength([0, 0], 1, 2);
  assertTrue(s < 1);
});

// Tone mapping
runner.test('reinhardToneMap — valeur 1 donne 0.5', () => {
  assertApprox(reinhardToneMap(1), 0.5);
});

runner.test('acesFilmicToneMap — valeur 0 donne 0', () => {
  assertApprox(acesFilmicToneMap(0), 0, 0.01);
});

runner.test('acesFilmicToneMap — valeur haute plafonnee a ~1', () => {
  assertTrue(acesFilmicToneMap(100) <= 1);
  assertTrue(acesFilmicToneMap(100) > 0.95);
});

// Color grading
runner.test('colorGrade — brightness 1, contrast 1, saturation 1 = identite', () => {
  const result = colorGrade([0.5, 0.3, 0.7], 1, 1, 1);
  assertApprox(result[0], 0.5);
  assertApprox(result[1], 0.3);
  assertApprox(result[2], 0.7);
});

runner.test('colorGrade — saturation 0 donne du gris', () => {
  const result = colorGrade([1, 0, 0], 1, 1, 0);
  // All channels should be the luminance
  assertApprox(result[0], result[1], 1e-4);
  assertApprox(result[1], result[2], 1e-4);
});

// Chromatic aberration
runner.test('chromaticAberrationUV — centre pas d\'offset', () => {
  const uv = chromaticAberrationUV([0.5, 0.5], 0.01);
  assertApprox(uv.r[0], 0.5);
  assertApprox(uv.g[0], 0.5);
  assertApprox(uv.b[0], 0.5);
});

// Depth of field
runner.test('circleOfConfusion — au point focal = 0', () => {
  assertApprox(circleOfConfusion(10, 10, 0.05, 2.8), 0);
});

runner.test('circleOfConfusion — hors focus > 0', () => {
  const coc = circleOfConfusion(20, 10, 0.05, 2.8);
  assertTrue(coc > 0);
});

// Raycaster
runner.test('raySphereIntersect — touche', () => {
  const ray: Ray = { origin: [0, 0, -5], direction: [0, 0, 1] };
  const result = raySphereIntersect(ray, [0, 0, 0], 1);
  assertTrue(result.hit);
  assertApprox(result.t, 4);
});

runner.test('raySphereIntersect — rate', () => {
  const ray: Ray = { origin: [0, 5, -5], direction: [0, 0, 1] };
  const result = raySphereIntersect(ray, [0, 0, 0], 1);
  assertFalse(result.hit);
});

runner.test('rayAABBIntersect — touche', () => {
  const ray: Ray = { origin: [0, 0, -5], direction: [0, 0, 1] };
  const aabb: AABB = { min: [-1, -1, -1], max: [1, 1, 1] };
  const result = rayAABBIntersect(ray, aabb);
  assertTrue(result.hit);
  assertApprox(result.t, 4);
});

// Screen-space UV
runner.test('projectToScreenUV — origine avec identite donne (0.5, 0.5)', () => {
  const identity: Mat4 = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
  const uv = projectToScreenUV([0, 0, 0], identity);
  assertTrue(uv !== null);
  assertApprox(uv![0], 0.5);
  assertApprox(uv![1], 0.5);
});

runner.run();
