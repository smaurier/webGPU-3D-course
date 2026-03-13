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
  // TODO: convertir les degres en radians
  // Formule : degrees * PI / 180
  return 0;
}

function radToDeg(radians: number): number {
  // TODO: convertir les radians en degres
  // Formule : radians * 180 / PI
  return 0;
}

// ─── Interpolation et utilitaires ────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  // TODO: interpolation lineaire entre a et b
  // Quand t=0 retourne a, quand t=1 retourne b
  return 0;
}

function clamp(x: number, min: number, max: number): number {
  // TODO: forcer x dans l'intervalle [min, max]
  return 0;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  // TODO: interpolation lisse entre 0 et 1
  // 1. Calculer t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  // 2. Retourner t * t * (3 - 2 * t)
  return 0;
}

// ─── Distance ────────────────────────────────────────────────────────────────

function distance2D(a: Vec2, b: Vec2): number {
  // TODO: distance euclidienne entre deux points 2D
  return 0;
}

function distance3D(a: Vec3, b: Vec3): number {
  // TODO: distance euclidienne entre deux points 3D
  return 0;
}

// ─── Vec2 operations ─────────────────────────────────────────────────────────

function vec2Length(v: Vec2): number {
  // TODO: retourner la longueur du vecteur 2D
  return 0;
}

function vec2Normalize(v: Vec2): Vec2 {
  // TODO: retourner le vecteur unitaire (longueur 1)
  return [0, 0];
}

function dot2D(a: Vec2, b: Vec2): number {
  // TODO: produit scalaire 2D : ax*bx + ay*by
  return 0;
}

// ─── Trigonometrie ───────────────────────────────────────────────────────────

function pythagorean(a: number, b: number): number {
  // TODO: retourner l'hypotenuse d'un triangle rectangle de cotes a et b
  return 0;
}

function atan2Angle(y: number, x: number): number {
  // TODO: retourner l'angle en radians via Math.atan2
  return 0;
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
