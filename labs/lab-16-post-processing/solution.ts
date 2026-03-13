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
  return passNames.map((name, i) => ({
    name,
    inputFrom: i === 0 ? null : passNames[i - 1],
    outputTo: i === passNames.length - 1 ? null : passNames[i],
  }));
}

// ─── Bloom threshold ─────────────────────────────────────────────────────────

function bloomThreshold(color: Vec3, threshold: number): Vec3 {
  const luminance = 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
  if (luminance < threshold) return [0, 0, 0];
  return color;
}

// ─── Gaussian blur weights ───────────────────────────────────────────────────

function gaussianWeights(kernelSize: number, sigma: number): number[] {
  const half = Math.floor(kernelSize / 2);
  const weights: number[] = [];
  let sum = 0;
  for (let i = -half; i <= half; i++) {
    const w = Math.exp(-(i * i) / (2 * sigma * sigma));
    weights.push(w);
    sum += w;
  }
  // Normalize
  return weights.map(w => w / sum);
}

// ─── Vignette effect ─────────────────────────────────────────────────────────

function vignetteStrength(uv: Vec2, intensity: number, smoothness: number): number {
  const cx = uv[0] - 0.5;
  const cy = uv[1] - 0.5;
  const dist = Math.sqrt(cx * cx + cy * cy);
  const maxDist = Math.sqrt(0.5);
  const normalized = dist / maxDist;
  const factor = 1 - Math.pow(normalized, smoothness) * intensity;
  return Math.max(0, Math.min(1, factor));
}

// ─── Tone mapping ────────────────────────────────────────────────────────────

function reinhardToneMap(x: number): number {
  return x / (1 + x);
}

function acesFilmicToneMap(x: number): number {
  const a = 2.51;
  const b = 0.03;
  const c = 2.43;
  const d = 0.59;
  const e = 0.14;
  return Math.max(0, Math.min(1, (x * (a * x + b)) / (x * (c * x + d) + e)));
}

// ─── Color grading ───────────────────────────────────────────────────────────

function colorGrade(
  color: Vec3,
  brightness: number,
  contrast: number,
  saturation: number
): Vec3 {
  // Brightness
  let r = color[0] * brightness;
  let g = color[1] * brightness;
  let b = color[2] * brightness;

  // Contrast (centered on 0.5)
  r = (r - 0.5) * contrast + 0.5;
  g = (g - 0.5) * contrast + 0.5;
  b = (b - 0.5) * contrast + 0.5;

  // Saturation
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  r = lum + (r - lum) * saturation;
  g = lum + (g - lum) * saturation;
  b = lum + (b - lum) * saturation;

  return [
    Math.max(0, Math.min(1, r)),
    Math.max(0, Math.min(1, g)),
    Math.max(0, Math.min(1, b)),
  ];
}

// ─── Chromatic aberration ────────────────────────────────────────────────────

function chromaticAberrationUV(uv: Vec2, strength: number): { r: Vec2; g: Vec2; b: Vec2 } {
  const cx = uv[0] - 0.5;
  const cy = uv[1] - 0.5;
  return {
    r: [uv[0] + cx * strength, uv[1] + cy * strength],
    g: [uv[0], uv[1]],
    b: [uv[0] - cx * strength, uv[1] - cy * strength],
  };
}

// ─── Depth of field ──────────────────────────────────────────────────────────

function circleOfConfusion(
  depth: number,
  focalDistance: number,
  focalLength: number,
  aperture: number
): number {
  // CoC = |aperture * focalLength * (depth - focalDistance) / (depth * (focalDistance - focalLength))|
  if (depth === 0) return 0;
  const numerator = aperture * focalLength * (depth - focalDistance);
  const denominator = depth * (focalDistance - focalLength);
  if (denominator === 0) return 0;
  return Math.abs(numerator / denominator);
}

// ─── Raycaster ───────────────────────────────────────────────────────────────

function raySphereIntersect(ray: Ray, center: Vec3, radius: number): { hit: boolean; t: number } {
  const oc: Vec3 = [
    ray.origin[0] - center[0],
    ray.origin[1] - center[1],
    ray.origin[2] - center[2],
  ];
  const a = ray.direction[0] ** 2 + ray.direction[1] ** 2 + ray.direction[2] ** 2;
  const b = 2 * (oc[0] * ray.direction[0] + oc[1] * ray.direction[1] + oc[2] * ray.direction[2]);
  const c = oc[0] ** 2 + oc[1] ** 2 + oc[2] ** 2 - radius * radius;
  const discriminant = b * b - 4 * a * c;

  if (discriminant < 0) return { hit: false, t: -1 };
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  if (t < 0) return { hit: false, t: -1 };
  return { hit: true, t };
}

function rayAABBIntersect(ray: Ray, aabb: AABB): { hit: boolean; t: number } {
  let tmin = -Infinity;
  let tmax = Infinity;

  for (let i = 0; i < 3; i++) {
    if (ray.direction[i] === 0) {
      if (ray.origin[i] < aabb.min[i] || ray.origin[i] > aabb.max[i]) {
        return { hit: false, t: -1 };
      }
    } else {
      const invD = 1 / ray.direction[i];
      let t1 = (aabb.min[i] - ray.origin[i]) * invD;
      let t2 = (aabb.max[i] - ray.origin[i]) * invD;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
    }
  }

  if (tmin > tmax || tmax < 0) return { hit: false, t: -1 };
  return { hit: true, t: tmin >= 0 ? tmin : tmax };
}

// ─── Screen-space UV from 3D position ────────────────────────────────────────

function projectToScreenUV(position: Vec3, mvp: Mat4): Vec2 | null {
  // Apply MVP
  const x = mvp[0] * position[0] + mvp[4] * position[1] + mvp[8]  * position[2] + mvp[12];
  const y = mvp[1] * position[0] + mvp[5] * position[1] + mvp[9]  * position[2] + mvp[13];
  const w = mvp[3] * position[0] + mvp[7] * position[1] + mvp[11] * position[2] + mvp[15];

  if (w <= 0) return null; // Behind camera

  const ndcX = x / w;
  const ndcY = y / w;

  return [
    ndcX * 0.5 + 0.5,
    ndcY * 0.5 + 0.5,
  ];
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
