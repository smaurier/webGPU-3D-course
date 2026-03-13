import {
  createTestRunner,
  assertApprox,
  assertArrayApprox,
  assertTrue,
  type Vec2,
  type Vec3,
} from '../test-utils.ts';

// ─── Conversions d'angles ────────────────────────────────────────────────────

function degToRad(degrees: number): number {
  return degrees * Math.PI / 180;
}

function radToDeg(radians: number): number {
  return radians * 180 / Math.PI;
}

// ─── Interpolation et utilitaires ────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// ─── Distance ────────────────────────────────────────────────────────────────

function distance2D(a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return Math.sqrt(dx * dx + dy * dy);
}

function distance3D(a: Vec3, b: Vec3): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ─── Vec2 operations ─────────────────────────────────────────────────────────

function vec2Length(v: Vec2): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1]);
}

function vec2Normalize(v: Vec2): Vec2 {
  const len = vec2Length(v);
  if (len === 0) return [0, 0];
  return [v[0] / len, v[1] / len];
}

function dot2D(a: Vec2, b: Vec2): number {
  return a[0] * b[0] + a[1] * b[1];
}

// ─── Trigonometrie ───────────────────────────────────────────────────────────

function pythagorean(a: number, b: number): number {
  return Math.sqrt(a * a + b * b);
}

function atan2Angle(y: number, x: number): number {
  return Math.atan2(y, x);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 00 — Prerequis mathematiques');

// Conversions d'angles
runner.test('degToRad — 0° = 0', () => {
  assertApprox(degToRad(0), 0);
});

runner.test('degToRad — 90° = PI/2', () => {
  assertApprox(degToRad(90), Math.PI / 2);
});

runner.test('degToRad — 180° = PI', () => {
  assertApprox(degToRad(180), Math.PI);
});

runner.test('degToRad — 360° = 2*PI', () => {
  assertApprox(degToRad(360), 2 * Math.PI);
});

runner.test('radToDeg — PI/2 = 90°', () => {
  assertApprox(radToDeg(Math.PI / 2), 90);
});

runner.test('radToDeg — PI = 180°', () => {
  assertApprox(radToDeg(Math.PI), 180);
});

// Interpolation
runner.test('lerp — t=0 retourne a', () => {
  assertApprox(lerp(10, 20, 0), 10);
});

runner.test('lerp — t=1 retourne b', () => {
  assertApprox(lerp(10, 20, 1), 20);
});

runner.test('lerp — t=0.5 retourne le milieu', () => {
  assertApprox(lerp(10, 20, 0.5), 15);
});

// Clamp
runner.test('clamp — valeur sous le minimum', () => {
  assertApprox(clamp(-5, 0, 10), 0);
});

runner.test('clamp — valeur au-dessus du maximum', () => {
  assertApprox(clamp(15, 0, 10), 10);
});

runner.test('clamp — valeur dans l\'intervalle', () => {
  assertApprox(clamp(5, 0, 10), 5);
});

// Smoothstep
runner.test('smoothstep — 0 au bord inferieur', () => {
  assertApprox(smoothstep(0, 1, 0), 0);
});

runner.test('smoothstep — 1 au bord superieur', () => {
  assertApprox(smoothstep(0, 1, 1), 1);
});

runner.test('smoothstep — ~0.5 au milieu', () => {
  assertApprox(smoothstep(0, 1, 0.5), 0.5, 0.01);
});

// Distance
runner.test('distance2D entre deux points', () => {
  assertApprox(distance2D([0, 0], [3, 4]), 5);
});

runner.test('distance3D entre deux points', () => {
  assertApprox(distance3D([0, 0, 0], [1, 2, 2]), 3);
});

// Vec2
runner.test('vec2Length', () => {
  assertApprox(vec2Length([3, 4]), 5);
});

runner.test('vec2Normalize — longueur devient 1', () => {
  const n = vec2Normalize([3, 4]);
  assertApprox(vec2Length(n), 1);
});

// Dot product 2D
runner.test('dot2D — vecteurs perpendiculaires = 0', () => {
  assertApprox(dot2D([1, 0], [0, 1]), 0);
});

runner.test('dot2D — vecteurs paralleles = produit des longueurs²', () => {
  assertApprox(dot2D([2, 0], [2, 0]), 4);
});

runner.test('dot2D — meme direction positif', () => {
  assertTrue(dot2D([1, 1], [2, 3]) > 0, 'dot product should be positive for same direction');
});

runner.test('dot2D — direction opposee negatif', () => {
  assertTrue(dot2D([1, 0], [-1, 0]) < 0, 'dot product should be negative for opposite direction');
});

// Pythagore
runner.test('pythagorean — triangle 3,4,5', () => {
  assertApprox(pythagorean(3, 4), 5);
});

// Trigonometrie de base
runner.test('sin(0)=0, cos(0)=1, sin(PI/2)=1', () => {
  assertApprox(Math.sin(0), 0);
  assertApprox(Math.cos(0), 1);
  assertApprox(Math.sin(Math.PI / 2), 1);
});

// atan2
runner.test('atan2 — angle depuis les coordonnees', () => {
  assertApprox(atan2Angle(0, 1), 0);            // axe X positif
  assertApprox(atan2Angle(1, 0), Math.PI / 2);  // axe Y positif
  assertApprox(atan2Angle(0, -1), Math.PI);      // axe X negatif
});

runner.run();
