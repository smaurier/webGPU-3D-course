import {
  createTestRunner,
  assertEqual,
  assertDeepEqual,
  assertTrue,
  assertApprox,
  assertArrayApprox,
  type Vec3,
  type Vec4,
  type Mat4,
} from '../test-utils.ts';

// ─── Build instance buffer data ──────────────────────────────────────────────

function buildInstanceBuffer(matrices: Mat4[]): Float32Array {
  // TODO: Creer un Float32Array contenant toutes les matrices bout a bout
  // Chaque matrice = 16 floats = 64 octets
  return new Float32Array(0);
}

function translationMatrix(x: number, y: number, z: number): Mat4 {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1,
  ];
}

// ─── Indirect draw arguments buffer ──────────────────────────────────────────

interface IndirectDrawArgs {
  vertexCount: number;
  instanceCount: number;
  firstVertex: number;
  firstInstance: number;
}

function buildIndirectDrawBuffer(args: IndirectDrawArgs): Uint32Array {
  // TODO: Retourner un Uint32Array de 4 elements dans l'ordre WebGPU
  return new Uint32Array(0);
}

interface IndirectIndexedDrawArgs {
  indexCount: number;
  instanceCount: number;
  firstIndex: number;
  baseVertex: number;
  firstInstance: number;
}

function buildIndirectIndexedDrawBuffer(args: IndirectIndexedDrawArgs): Uint32Array {
  // TODO: Retourner un Uint32Array de 5 elements
  return new Uint32Array(0);
}

// ─── G-buffer layout definition ──────────────────────────────────────────────

interface GBufferAttachment {
  name: string;
  format: string;
  bytesPerPixel: number;
}

function defineGBufferLayout(): GBufferAttachment[] {
  // TODO: Retourner les 3 attachments :
  //   position: rgba32float (16 bytes/pixel)
  //   normal: rgba16float (8 bytes/pixel)
  //   albedo: rgba8unorm (4 bytes/pixel)
  return [];
}

function computeGBufferMemory(width: number, height: number, attachments: GBufferAttachment[]): number {
  // TODO: Sommer width * height * bytesPerPixel pour chaque attachment
  return 0;
}

// ─── Deferred lighting calculation ───────────────────────────────────────────

function deferredDiffuse(
  albedo: Vec3,
  normal: Vec3,
  lightDir: Vec3,
  lightColor: Vec3
): Vec3 {
  // TODO: NdotL = max(0, dot(normal, lightDir))
  //       result = albedo * lightColor * NdotL
  return [0, 0, 0];
}

// ─── Generate cubemap face view matrices ─────────────────────────────────────

interface CubemapFace {
  direction: Vec3;
  up: Vec3;
  name: string;
}

function getCubemapFaces(): CubemapFace[] {
  // TODO: Retourner les 6 faces : +X, -X, +Y, -Y, +Z, -Z
  // Avec les vecteurs up corrects
  return [];
}

function sub3(a: Vec3, b: Vec3): Vec3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dot3(a: Vec3, b: Vec3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function normalize3(v: Vec3): Vec3 {
  const len = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
  return len > 0 ? [v[0] / len, v[1] / len, v[2] / len] : [0, 0, 0];
}

function buildLookAtMatrix(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  // TODO: Construire une matrice lookAt (column-major)
  // zAxis = normalize(eye - target)
  // xAxis = normalize(cross(up, zAxis))
  // yAxis = cross(zAxis, xAxis)
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function generateCubemapViewMatrices(position: Vec3): Mat4[] {
  // TODO: Pour chaque face, construire la matrice lookAt depuis position vers position+direction
  return [];
}

// ─── Compute mipmap with box filter ──────────────────────────────────────────

function mipmapBoxFilter(data: number[], width: number, height: number): {
  data: number[];
  width: number;
  height: number;
} {
  // TODO: Reduire l'image par 2 en moyennant chaque bloc 2x2 de pixels RGBA
  return { data: [], width: 0, height: 0 };
}

// ─── Ring buffer allocator ───────────────────────────────────────────────────

class RingBufferAllocator {
  private capacity: number;
  private head: number = 0;
  private tail: number = 0;
  private used: number = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  allocate(size: number): number | null {
    // TODO: Allouer `size` octets a la position head.
    // Retourner l'offset ou null si pas de place.
    return null;
  }

  free(size: number): void {
    // TODO: Liberer `size` octets depuis tail
    this.tail = (this.tail + size) % this.capacity;
    this.used = Math.max(0, this.used - size);
  }

  getUsed(): number { return this.used; }
  getCapacity(): number { return this.capacity; }
  getHead(): number { return this.head; }
}

// ─── Timestamp query parsing ─────────────────────────────────────────────────

function timestampToMs(startTick: bigint, endTick: bigint, frequency: bigint): number {
  // TODO: (endTick - startTick) / frequency * 1000
  return 0;
}

function parseTimestampResults(buffer: BigUint64Array, frequency: bigint): number[] {
  // TODO: Parser les paires (start, end) et convertir en ms
  return [];
}

// ─── Tests ───────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 12 — WebGPU avance');

// --- Instance buffer ---
runner.test('buildInstanceBuffer — 2 instances', () => {
  const m1 = translationMatrix(1, 0, 0);
  const m2 = translationMatrix(0, 2, 0);
  const buf = buildInstanceBuffer([m1, m2]);
  assertEqual(buf.length, 32);
  assertApprox(buf[12], 1);
  assertApprox(buf[29], 2);
});

runner.test('buildInstanceBuffer — buffer vide', () => {
  const buf = buildInstanceBuffer([]);
  assertEqual(buf.length, 0);
});

// --- Indirect draw ---
runner.test('buildIndirectDrawBuffer — triangle avec 3 vertices', () => {
  const buf = buildIndirectDrawBuffer({
    vertexCount: 3,
    instanceCount: 1,
    firstVertex: 0,
    firstInstance: 0,
  });
  assertEqual(buf.length, 4);
  assertEqual(buf[0], 3);
  assertEqual(buf[1], 1);
});

runner.test('buildIndirectIndexedDrawBuffer — indexed draw', () => {
  const buf = buildIndirectIndexedDrawBuffer({
    indexCount: 36,
    instanceCount: 100,
    firstIndex: 0,
    baseVertex: 0,
    firstInstance: 0,
  });
  assertEqual(buf.length, 5);
  assertEqual(buf[0], 36);
  assertEqual(buf[1], 100);
});

// --- G-buffer ---
runner.test('defineGBufferLayout — 3 attachments', () => {
  const layout = defineGBufferLayout();
  assertEqual(layout.length, 3);
  assertEqual(layout[0].format, 'rgba32float');
  assertEqual(layout[1].format, 'rgba16float');
  assertEqual(layout[2].format, 'rgba8unorm');
});

runner.test('computeGBufferMemory — 1920x1080', () => {
  const layout = defineGBufferLayout();
  const bytes = computeGBufferMemory(1920, 1080, layout);
  assertEqual(bytes, 1920 * 1080 * 28);
});

// --- Deferred lighting ---
runner.test('deferredDiffuse — lumiere frontale', () => {
  const result = deferredDiffuse([1, 1, 1], [0, 0, 1], [0, 0, 1], [1, 1, 1]);
  assertArrayApprox(result, [1, 1, 1]);
});

runner.test('deferredDiffuse — lumiere arriere = noir', () => {
  const result = deferredDiffuse([1, 1, 1], [0, 0, 1], [0, 0, -1], [1, 1, 1]);
  assertArrayApprox(result, [0, 0, 0]);
});

// --- Cubemap ---
runner.test('generateCubemapViewMatrices — 6 faces', () => {
  const matrices = generateCubemapViewMatrices([0, 0, 0]);
  assertEqual(matrices.length, 6);
  for (const m of matrices) {
    assertEqual(m.length, 16);
  }
});

runner.test('getCubemapFaces — directions orthogonales', () => {
  const faces = getCubemapFaces();
  assertEqual(faces.length, 6);
  assertEqual(faces[0].name, '+X');
  assertEqual(faces[5].name, '-Z');
});

// --- Mipmap box filter ---
runner.test('mipmapBoxFilter — 4x4 RGBA vers 2x2', () => {
  const data = new Array(4 * 4 * 4).fill(1);
  const result = mipmapBoxFilter(data, 4, 4);
  assertEqual(result.width, 2);
  assertEqual(result.height, 2);
  assertEqual(result.data.length, 2 * 2 * 4);
  assertApprox(result.data[0], 1);
});

runner.test('mipmapBoxFilter — 2x2 RGBA vers 1x1', () => {
  const data = [
    1, 0, 0, 1,  0, 1, 0, 1,
    0, 0, 1, 1,  1, 1, 1, 1,
  ];
  const result = mipmapBoxFilter(data, 2, 2);
  assertEqual(result.width, 1);
  assertEqual(result.height, 1);
  assertApprox(result.data[0], 0.5);
  assertApprox(result.data[1], 0.5);
  assertApprox(result.data[2], 0.5);
  assertApprox(result.data[3], 1.0);
});

// --- Ring buffer ---
runner.test('RingBufferAllocator — allocation simple', () => {
  const ring = new RingBufferAllocator(1024);
  const offset1 = ring.allocate(256);
  assertEqual(offset1, 0);
  const offset2 = ring.allocate(256);
  assertEqual(offset2, 256);
  assertEqual(ring.getUsed(), 512);
});

runner.test('RingBufferAllocator — free et reallocation', () => {
  const ring = new RingBufferAllocator(512);
  ring.allocate(256);
  ring.allocate(256);
  assertEqual(ring.getUsed(), 512);
  ring.free(256);
  assertEqual(ring.getUsed(), 256);
});

runner.test('RingBufferAllocator — buffer plein retourne null', () => {
  const ring = new RingBufferAllocator(256);
  ring.allocate(256);
  const result = ring.allocate(1);
  assertEqual(result, null);
});

// --- Timestamp queries ---
runner.test('timestampToMs — 1 GHz, 1M ticks = 1ms', () => {
  const ms = timestampToMs(0n, 1_000_000n, 1_000_000_000n);
  assertApprox(ms, 1.0);
});

runner.test('parseTimestampResults — 2 paires', () => {
  const buffer = new BigUint64Array([0n, 1_000_000n, 2_000_000n, 5_000_000n]);
  const freq = 1_000_000_000n;
  const results = parseTimestampResults(buffer, freq);
  assertEqual(results.length, 2);
  assertApprox(results[0], 1.0);
  assertApprox(results[1], 3.0);
});

runner.run();
