// ─── Test runner pour le cours 3D Web ────────────────────────────────────────
// Pattern identique aux autres cours : createTestRunner + assertions

export interface TestCase {
  name: string;
  fn: () => void | Promise<void>;
}

export interface TestRunner {
  test: (name: string, fn: () => void | Promise<void>) => void;
  run: () => Promise<void>;
}

export function createTestRunner(labName: string): TestRunner {
  const tests: TestCase[] = [];

  return {
    test(name: string, fn: () => void | Promise<void>) {
      tests.push({ name, fn });
    },

    async run() {
      console.log(`\n${'═'.repeat(50)}`);
      console.log(`  ${labName}`);
      console.log(`${'═'.repeat(50)}\n`);

      let passed = 0;
      let failed = 0;

      for (const t of tests) {
        try {
          await t.fn();
          console.log(`  ✅ ${t.name}`);
          passed++;
        } catch (err) {
          console.log(`  ❌ ${t.name}`);
          console.log(`     ${err instanceof Error ? err.message : String(err)}`);
          failed++;
        }
      }

      console.log(`\n${'─'.repeat(50)}`);
      console.log(`  Résultats : ${passed} passés, ${failed} échoués sur ${tests.length}`);
      console.log(`${'─'.repeat(50)}\n`);

      if (failed > 0) {
        process.exit(1);
      } else {
        console.log('🎉 Tous les tests passent !');
        console.log(`${'─'.repeat(50)}\n`);
      }
    },
  };
}

// ─── Assertions ──────────────────────────────────────────────────────────────

export function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function assertDeepEqual<T>(actual: T, expected: T, message?: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error(message ?? `Expected ${b}, got ${a}`);
  }
}

export function assertTrue(value: boolean, message?: string): void {
  if (!value) {
    throw new Error(message ?? `Expected true, got ${value}`);
  }
}

export function assertFalse(value: boolean, message?: string): void {
  if (value) {
    throw new Error(message ?? `Expected false, got ${value}`);
  }
}

export function assertThrows(fn: () => void, message?: string): void {
  try {
    fn();
    throw new Error(message ?? 'Expected function to throw');
  } catch (err) {
    if (err instanceof Error && err.message === (message ?? 'Expected function to throw')) {
      throw err;
    }
    // OK — it threw as expected
  }
}

export function assertApprox(actual: number, expected: number, epsilon = 1e-6, message?: string): void {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(message ?? `Expected ~${expected}, got ${actual} (epsilon=${epsilon})`);
  }
}

export function assertArrayApprox(actual: number[], expected: number[], epsilon = 1e-6, message?: string): void {
  if (actual.length !== expected.length) {
    throw new Error(message ?? `Array length mismatch: ${actual.length} vs ${expected.length}`);
  }
  for (let i = 0; i < actual.length; i++) {
    if (Math.abs(actual[i] - expected[i]) > epsilon) {
      throw new Error(
        message ?? `Element [${i}]: expected ~${expected[i]}, got ${actual[i]} (epsilon=${epsilon})`
      );
    }
  }
}

// ─── Types mathématiques de base ─────────────────────────────────────────────

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Vec4 = [number, number, number, number];

/** Matrice 4x4 en column-major order (comme OpenGL/WebGL/WebGPU) */
export type Mat4 = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

/** Quaternion [x, y, z, w] */
export type Quat = [number, number, number, number];

/** Couleur RGBA normalisée [0-1] */
export type Color = [number, number, number, number];

/** Triangle défini par 3 sommets Vec3 */
export type Triangle = [Vec3, Vec3, Vec3];

/** Vertex avec position, normale et UV */
export interface Vertex {
  position: Vec3;
  normal: Vec3;
  uv: Vec2;
}

/** Rayon pour le ray casting */
export interface Ray {
  origin: Vec3;
  direction: Vec3;
}

/** AABB (axis-aligned bounding box) */
export interface AABB {
  min: Vec3;
  max: Vec3;
}

/** Résultat d'intersection rayon-triangle */
export interface HitResult {
  hit: boolean;
  t: number;
  point: Vec3;
  normal: Vec3;
  barycentric: Vec3;
}
