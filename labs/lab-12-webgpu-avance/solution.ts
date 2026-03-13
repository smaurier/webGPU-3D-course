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
  const data = new Float32Array(matrices.length * 16);
  for (let i = 0; i < matrices.length; i++) {
    data.set(matrices[i], i * 16);
  }
  return data;
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
  return new Uint32Array([
    args.vertexCount,
    args.instanceCount,
    args.firstVertex,
    args.firstInstance,
  ]);
}

interface IndirectIndexedDrawArgs {
  indexCount: number;
  instanceCount: number;
  firstIndex: number;
  baseVertex: number;
  firstInstance: number;
}

function buildIndirectIndexedDrawBuffer(args: IndirectIndexedDrawArgs): Uint32Array {
  return new Uint32Array([
    args.indexCount,
    args.instanceCount,
    args.firstIndex,
    args.baseVertex,
    args.firstInstance,
  ]);
}

// ─── G-buffer layout definition ──────────────────────────────────────────────

interface GBufferAttachment {
  name: string;
  format: string;
  bytesPerPixel: number;
}

function defineGBufferLayout(): GBufferAttachment[] {
  return [
    { name: 'position', format: 'rgba32float', bytesPerPixel: 16 },
    { name: 'normal', format: 'rgba16float', bytesPerPixel: 8 },
    { name: 'albedo', format: 'rgba8unorm', bytesPerPixel: 4 },
  ];
}

function computeGBufferMemory(width: number, height: number, attachments: GBufferAttachment[]): number {
  let total = 0;
  for (const att of attachments) {
    total += width * height * att.bytesPerPixel;
  }
  return total;
}

// ─── Deferred lighting calculation ───────────────────────────────────────────

function reconstructPositionFromDepth(
  uv: [number, number],
  depth: number,
  invProjection: Mat4
): Vec3 {
  // Convertir UV + depth en clip space [-1, 1]
  const clipX = uv[0] * 2 - 1;
  const clipY = uv[1] * 2 - 1;
  const clipZ = depth * 2 - 1;
  const clipW = 1;

  // Multiplier par la matrice de projection inverse
  const x = invProjection[0] * clipX + invProjection[4] * clipY + invProjection[8] * clipZ + invProjection[12] * clipW;
  const y = invProjection[1] * clipX + invProjection[5] * clipY + invProjection[9] * clipZ + invProjection[13] * clipW;
  const z = invProjection[2] * clipX + invProjection[6] * clipY + invProjection[10] * clipZ + invProjection[14] * clipW;
  const w = invProjection[3] * clipX + invProjection[7] * clipY + invProjection[11] * clipZ + invProjection[15] * clipW;

  return [x / w, y / w, z / w];
}

/**
 * Calcul simplifie de diffuse PBR (Lambert).
 */
function deferredDiffuse(
  albedo: Vec3,
  normal: Vec3,
  lightDir: Vec3,
  lightColor: Vec3
): Vec3 {
  // NdotL
  const ndotl = Math.max(0, normal[0] * lightDir[0] + normal[1] * lightDir[1] + normal[2] * lightDir[2]);
  return [
    albedo[0] * lightColor[0] * ndotl,
    albedo[1] * lightColor[1] * ndotl,
    albedo[2] * lightColor[2] * ndotl,
  ];
}

// ─── Generate cubemap face view matrices ─────────────────────────────────────

interface CubemapFace {
  direction: Vec3;
  up: Vec3;
  name: string;
}

function getCubemapFaces(): CubemapFace[] {
  return [
    { direction: [1, 0, 0], up: [0, -1, 0], name: '+X' },
    { direction: [-1, 0, 0], up: [0, -1, 0], name: '-X' },
    { direction: [0, 1, 0], up: [0, 0, 1], name: '+Y' },
    { direction: [0, -1, 0], up: [0, 0, -1], name: '-Y' },
    { direction: [0, 0, 1], up: [0, -1, 0], name: '+Z' },
    { direction: [0, 0, -1], up: [0, -1, 0], name: '-Z' },
  ];
}

function buildLookAtMatrix(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  const zAxis: Vec3 = normalize3(sub3(eye, target));
  const xAxis: Vec3 = normalize3(cross3(up, zAxis));
  const yAxis: Vec3 = cross3(zAxis, xAxis);

  return [
    xAxis[0], yAxis[0], zAxis[0], 0,
    xAxis[1], yAxis[1], zAxis[1], 0,
    xAxis[2], yAxis[2], zAxis[2], 0,
    -dot3(xAxis, eye), -dot3(yAxis, eye), -dot3(zAxis, eye), 1,
  ];
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

function generateCubemapViewMatrices(position: Vec3): Mat4[] {
  const faces = getCubemapFaces();
  return faces.map(face => {
    const target: Vec3 = [
      position[0] + face.direction[0],
      position[1] + face.direction[1],
      position[2] + face.direction[2],
    ];
    return buildLookAtMatrix(position, target, face.up);
  });
}

// ─── Compute mipmap with box filter ──────────────────────────────────────────

/**
 * Reduit une image 2D d'un facteur 2 en moyennant chaque bloc 2x2.
 * L'image est un tableau flat de RGBA floats: [r,g,b,a, r,g,b,a, ...]
 */
function mipmapBoxFilter(data: number[], width: number, height: number): {
  data: number[];
  width: number;
  height: number;
} {
  const newW = Math.max(1, Math.floor(width / 2));
  const newH = Math.max(1, Math.floor(height / 2));
  const result: number[] = new Array(newW * newH * 4);

  for (let y = 0; y < newH; y++) {
    for (let x = 0; x < newW; x++) {
      for (let c = 0; c < 4; c++) {
        const i00 = ((y * 2) * width + (x * 2)) * 4 + c;
        const i10 = ((y * 2) * width + (x * 2 + 1)) * 4 + c;
        const i01 = ((y * 2 + 1) * width + (x * 2)) * 4 + c;
        const i11 = ((y * 2 + 1) * width + (x * 2 + 1)) * 4 + c;
        result[(y * newW + x) * 4 + c] = (data[i00] + data[i10] + data[i01] + data[i11]) / 4;
      }
    }
  }

  return { data: result, width: newW, height: newH };
}

// ─── Ring buffer allocator ───────────────────────────────────────────────────

class RingBufferAllocator {
  private capacity: number;
  private head: number = 0; // Prochaine position d'allocation
  private tail: number = 0; // Position de liberation
  private used: number = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  allocate(size: number): number | null {
    if (size > this.capacity - this.used) {
      return null; // Pas assez de place
    }

    const offset = this.head;

    // Verifier si on peut allouer sans wrap
    if (this.head + size <= this.capacity) {
      this.head = (this.head + size) % this.capacity;
      this.used += size;
      return offset;
    }

    // Wrap: on saute l'espace restant en fin de buffer
    const wastedSpace = this.capacity - this.head;
    if (size > this.capacity - this.used - wastedSpace) {
      return null; // Pas assez de place meme avec wrap
    }

    this.used += wastedSpace; // Espace perdu
    this.head = 0;

    if (size > this.capacity - this.used) {
      return null;
    }

    this.head = size;
    this.used += size;
    return 0;
  }

  free(size: number): void {
    this.tail = (this.tail + size) % this.capacity;
    this.used = Math.max(0, this.used - size);
  }

  getUsed(): number { return this.used; }
  getCapacity(): number { return this.capacity; }
  getHead(): number { return this.head; }
}

// ─── Timestamp query parsing ─────────────────────────────────────────────────

function timestampToMs(startTick: bigint, endTick: bigint, frequency: bigint): number {
  const delta = Number(endTick - startTick);
  const freq = Number(frequency);
  return (delta / freq) * 1000;
}

function parseTimestampResults(buffer: BigUint64Array, frequency: bigint): number[] {
  const results: number[] = [];
  for (let i = 0; i < buffer.length - 1; i += 2) {
    results.push(timestampToMs(buffer[i], buffer[i + 1], frequency));
  }
  return results;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 12 — WebGPU avance');

// --- Instance buffer ---
runner.test('buildInstanceBuffer — 2 instances', () => {
  const m1 = translationMatrix(1, 0, 0);
  const m2 = translationMatrix(0, 2, 0);
  const buf = buildInstanceBuffer([m1, m2]);
  assertEqual(buf.length, 32); // 2 * 16
  assertApprox(buf[12], 1);  // m1 translation x
  assertApprox(buf[29], 2);  // m2 translation y (16 + 13)
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
  // 1920*1080 * (16 + 8 + 4) = 1920*1080*28 = 58,060,800
  assertEqual(bytes, 1920 * 1080 * 28);
});

// --- Deferred lighting ---
runner.test('deferredDiffuse — lumiere frontale', () => {
  const result = deferredDiffuse([1, 1, 1], [0, 0, 1], [0, 0, 1], [1, 1, 1]);
  assertArrayApprox(result, [1, 1, 1]); // NdotL = 1
});

runner.test('deferredDiffuse — lumiere arriere = noir', () => {
  const result = deferredDiffuse([1, 1, 1], [0, 0, 1], [0, 0, -1], [1, 1, 1]);
  assertArrayApprox(result, [0, 0, 0]); // NdotL = 0 (clamp)
});

// --- Cubemap ---
runner.test('generateCubemapViewMatrices — 6 faces', () => {
  const matrices = generateCubemapViewMatrices([0, 0, 0]);
  assertEqual(matrices.length, 6);
  // Chaque matrice est 4x4
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
  // 4x4 image, tous les pixels blancs (1,1,1,1)
  const data = new Array(4 * 4 * 4).fill(1);
  const result = mipmapBoxFilter(data, 4, 4);
  assertEqual(result.width, 2);
  assertEqual(result.height, 2);
  assertEqual(result.data.length, 2 * 2 * 4);
  // Moyenne de blancs = blanc
  assertApprox(result.data[0], 1);
});

runner.test('mipmapBoxFilter — 2x2 RGBA vers 1x1', () => {
  // [rouge, vert, bleu, blanc] → moyenne
  const data = [
    1, 0, 0, 1,  0, 1, 0, 1,  // row 0: red, green
    0, 0, 1, 1,  1, 1, 1, 1,  // row 1: blue, white
  ];
  const result = mipmapBoxFilter(data, 2, 2);
  assertEqual(result.width, 1);
  assertEqual(result.height, 1);
  assertApprox(result.data[0], 0.5);  // R: (1+0+0+1)/4
  assertApprox(result.data[1], 0.5);  // G: (0+1+0+1)/4
  assertApprox(result.data[2], 0.5);  // B: (0+0+1+1)/4
  assertApprox(result.data[3], 1.0);  // A: (1+1+1+1)/4
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
