import {
  createTestRunner,
  assertEqual,
  assertApprox,
  assertTrue,
  assertFalse,
  type Vec3,
} from '../test-utils.ts';

// ─── LOD distance thresholds ─────────────────────────────────────────────────

function computeLODThreshold(
  objectRadius: number,
  fovY: number,
  screenHeight: number,
  targetPixelSize: number
): number {
  // Distance at which the object projects to targetPixelSize pixels
  // projectedSize = (objectRadius * 2 * screenHeight) / (2 * distance * tan(fovY/2))
  // Solve for distance: distance = (objectRadius * screenHeight) / (targetPixelSize * tan(fovY/2))
  return (objectRadius * screenHeight) / (targetPixelSize * Math.tan(fovY / 2));
}

// ─── Frustum culling ─────────────────────────────────────────────────────────

interface FrustumPlane {
  normal: Vec3;
  distance: number; // dot(normal, pointOnPlane)
}

interface BoundingSphere {
  center: Vec3;
  radius: number;
}

function isSphereInsideFrustum(sphere: BoundingSphere, planes: FrustumPlane[]): boolean {
  for (const plane of planes) {
    const dist =
      plane.normal[0] * sphere.center[0] +
      plane.normal[1] * sphere.center[1] +
      plane.normal[2] * sphere.center[2] -
      plane.distance;
    if (dist < -sphere.radius) return false;
  }
  return true;
}

function frustumCullBatch(spheres: BoundingSphere[], planes: FrustumPlane[]): number[] {
  const visible: number[] = [];
  for (let i = 0; i < spheres.length; i++) {
    if (isSphereInsideFrustum(spheres[i], planes)) {
      visible.push(i);
    }
  }
  return visible;
}

// ─── Draw call batching ──────────────────────────────────────────────────────

interface DrawableObject {
  id: number;
  materialId: string;
}

function batchByMaterial(objects: DrawableObject[]): Map<string, number[]> {
  const batches = new Map<string, number[]>();
  for (const obj of objects) {
    if (!batches.has(obj.materialId)) {
      batches.set(obj.materialId, []);
    }
    batches.get(obj.materialId)!.push(obj.id);
  }
  return batches;
}

// ─── Texture atlas UV remapping ──────────────────────────────────────────────

interface AtlasRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  atlasWidth: number;
  atlasHeight: number;
}

function remapUVToAtlas(u: number, v: number, region: AtlasRegion): [number, number] {
  const atlasU = (region.x + u * region.width) / region.atlasWidth;
  const atlasV = (region.y + v * region.height) / region.atlasHeight;
  return [atlasU, atlasV];
}

// ─── Memory pool allocator ───────────────────────────────────────────────────

interface MemoryBlock {
  offset: number;
  size: number;
  free: boolean;
}

interface MemoryPool {
  totalSize: number;
  blocks: MemoryBlock[];
}

function createMemoryPool(totalSize: number): MemoryPool {
  return {
    totalSize,
    blocks: [{ offset: 0, size: totalSize, free: true }],
  };
}

function poolAlloc(pool: MemoryPool, size: number): number {
  for (let i = 0; i < pool.blocks.length; i++) {
    const block = pool.blocks[i];
    if (block.free && block.size >= size) {
      block.free = false;
      if (block.size > size) {
        // Split block
        const remaining: MemoryBlock = {
          offset: block.offset + size,
          size: block.size - size,
          free: true,
        };
        block.size = size;
        pool.blocks.splice(i + 1, 0, remaining);
      }
      return block.offset;
    }
  }
  return -1; // allocation failed
}

function poolFree(pool: MemoryPool, offset: number): boolean {
  for (const block of pool.blocks) {
    if (block.offset === offset && !block.free) {
      block.free = true;
      // Merge adjacent free blocks
      defragmentPool(pool);
      return true;
    }
  }
  return false;
}

function defragmentPool(pool: MemoryPool): void {
  let i = 0;
  while (i < pool.blocks.length - 1) {
    if (pool.blocks[i].free && pool.blocks[i + 1].free) {
      pool.blocks[i].size += pool.blocks[i + 1].size;
      pool.blocks.splice(i + 1, 1);
    } else {
      i++;
    }
  }
}

// ─── FPS counter ─────────────────────────────────────────────────────────────

function computeAverageFPS(timestamps: number[], windowSize: number): number {
  if (timestamps.length < 2) return 0;
  const start = Math.max(0, timestamps.length - windowSize);
  const slice = timestamps.slice(start);
  if (slice.length < 2) return 0;
  const elapsed = slice[slice.length - 1] - slice[0];
  if (elapsed === 0) return 0;
  return ((slice.length - 1) / elapsed) * 1000; // timestamps in ms
}

// ─── Frame budget ────────────────────────────────────────────────────────────

function computeFrameBudgetRemaining(
  targetFPS: number,
  elapsedMs: number
): { budgetMs: number; remainingMs: number; overBudget: boolean } {
  const budgetMs = 1000 / targetFPS;
  const remainingMs = budgetMs - elapsedMs;
  return { budgetMs, remainingMs, overBudget: remainingMs < 0 };
}

// ─── Object pool ─────────────────────────────────────────────────────────────

interface ObjectPool<T> {
  pool: T[];
  active: Set<T>;
  factory: () => T;
}

function createObjectPool<T>(factory: () => T, initialSize: number): ObjectPool<T> {
  const pool: T[] = [];
  for (let i = 0; i < initialSize; i++) {
    pool.push(factory());
  }
  return { pool, active: new Set(), factory };
}

function poolAcquire<T>(pool: ObjectPool<T>): T {
  let obj: T;
  if (pool.pool.length > 0) {
    obj = pool.pool.pop()!;
  } else {
    obj = pool.factory();
  }
  pool.active.add(obj);
  return obj;
}

function poolRelease<T>(pool: ObjectPool<T>, obj: T): void {
  pool.active.delete(obj);
  pool.pool.push(obj);
}

// ─── Spatial hash grid ───────────────────────────────────────────────────────

interface SpatialHashGrid {
  cellSize: number;
  cells: Map<string, number[]>;
}

function createSpatialHashGrid(cellSize: number): SpatialHashGrid {
  return { cellSize, cells: new Map() };
}

function spatialHashKey(x: number, y: number, cellSize: number): string {
  const cx = Math.floor(x / cellSize);
  const cy = Math.floor(y / cellSize);
  return `${cx},${cy}`;
}

function spatialHashInsert(grid: SpatialHashGrid, id: number, x: number, y: number): void {
  const key = spatialHashKey(x, y, grid.cellSize);
  if (!grid.cells.has(key)) {
    grid.cells.set(key, []);
  }
  grid.cells.get(key)!.push(id);
}

function spatialHashQuery(grid: SpatialHashGrid, x: number, y: number, radius: number): number[] {
  const results = new Set<number>();
  const minCx = Math.floor((x - radius) / grid.cellSize);
  const maxCx = Math.floor((x + radius) / grid.cellSize);
  const minCy = Math.floor((y - radius) / grid.cellSize);
  const maxCy = Math.floor((y + radius) / grid.cellSize);

  for (let cx = minCx; cx <= maxCx; cx++) {
    for (let cy = minCy; cy <= maxCy; cy++) {
      const key = `${cx},${cy}`;
      const ids = grid.cells.get(key);
      if (ids) {
        for (const id of ids) {
          results.add(id);
        }
      }
    }
  }
  return Array.from(results);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 17 — Performance');

// LOD thresholds
runner.test('computeLODThreshold — objet plus gros = plus loin', () => {
  const d1 = computeLODThreshold(1, Math.PI / 4, 1080, 50);
  const d2 = computeLODThreshold(2, Math.PI / 4, 1080, 50);
  assertTrue(d2 > d1);
});

runner.test('computeLODThreshold — plus petit pixel target = plus loin', () => {
  const d1 = computeLODThreshold(1, Math.PI / 4, 1080, 100);
  const d2 = computeLODThreshold(1, Math.PI / 4, 1080, 50);
  assertTrue(d2 > d1);
});

// Frustum culling
runner.test('frustumCullBatch — sphere visible gardee', () => {
  const planes: FrustumPlane[] = [
    { normal: [0, 0, -1], distance: -10 }, // near plane at z=-10 (looking -Z)
  ];
  const spheres: BoundingSphere[] = [
    { center: [0, 0, -5], radius: 1 },
  ];
  const visible = frustumCullBatch(spheres, planes);
  assertEqual(visible.length, 1);
});

runner.test('frustumCullBatch — sphere hors frustum eliminee', () => {
  const planes: FrustumPlane[] = [
    { normal: [0, 0, 1], distance: 0 }, // only z > 0 visible
  ];
  const spheres: BoundingSphere[] = [
    { center: [0, 0, -5], radius: 1 },
    { center: [0, 0, 5], radius: 1 },
  ];
  const visible = frustumCullBatch(spheres, planes);
  assertEqual(visible.length, 1);
  assertEqual(visible[0], 1);
});

// Draw call batching
runner.test('batchByMaterial regroupe par materialId', () => {
  const objects: DrawableObject[] = [
    { id: 0, materialId: 'wood' },
    { id: 1, materialId: 'metal' },
    { id: 2, materialId: 'wood' },
    { id: 3, materialId: 'metal' },
    { id: 4, materialId: 'glass' },
  ];
  const batches = batchByMaterial(objects);
  assertEqual(batches.size, 3);
  assertEqual(batches.get('wood')!.length, 2);
  assertEqual(batches.get('metal')!.length, 2);
  assertEqual(batches.get('glass')!.length, 1);
});

// Texture atlas
runner.test('remapUVToAtlas — coin bas-gauche', () => {
  const region: AtlasRegion = { x: 256, y: 0, width: 256, height: 256, atlasWidth: 1024, atlasHeight: 1024 };
  const [u, v] = remapUVToAtlas(0, 0, region);
  assertApprox(u, 0.25);
  assertApprox(v, 0);
});

runner.test('remapUVToAtlas — coin haut-droit', () => {
  const region: AtlasRegion = { x: 256, y: 0, width: 256, height: 256, atlasWidth: 1024, atlasHeight: 1024 };
  const [u, v] = remapUVToAtlas(1, 1, region);
  assertApprox(u, 0.5);
  assertApprox(v, 0.25);
});

// Memory pool
runner.test('poolAlloc retourne un offset valide', () => {
  const pool = createMemoryPool(1024);
  const offset = poolAlloc(pool, 256);
  assertEqual(offset, 0);
  assertEqual(pool.blocks.length, 2);
});

runner.test('poolFree libere et defragmente', () => {
  const pool = createMemoryPool(1024);
  const a = poolAlloc(pool, 256);
  const b = poolAlloc(pool, 256);
  poolFree(pool, a);
  poolFree(pool, b);
  assertEqual(pool.blocks.length, 1);
  assertTrue(pool.blocks[0].free);
  assertEqual(pool.blocks[0].size, 1024);
});

runner.test('poolAlloc echoue si pas assez de place', () => {
  const pool = createMemoryPool(64);
  poolAlloc(pool, 64);
  assertEqual(poolAlloc(pool, 1), -1);
});

// FPS counter
runner.test('computeAverageFPS — 60 frames en 1s = 60 FPS', () => {
  const timestamps: number[] = [];
  for (let i = 0; i <= 60; i++) {
    timestamps.push(i * (1000 / 60));
  }
  assertApprox(computeAverageFPS(timestamps, 61), 60, 0.5);
});

// Frame budget
runner.test('computeFrameBudgetRemaining — 60fps = 16.67ms budget', () => {
  const result = computeFrameBudgetRemaining(60, 10);
  assertApprox(result.budgetMs, 16.6667, 0.01);
  assertApprox(result.remainingMs, 6.6667, 0.01);
  assertFalse(result.overBudget);
});

runner.test('computeFrameBudgetRemaining — over budget', () => {
  const result = computeFrameBudgetRemaining(60, 20);
  assertTrue(result.overBudget);
});

// Object pool
runner.test('objectPool — acquire et release', () => {
  let counter = 0;
  const pool = createObjectPool(() => ({ id: counter++ }), 3);
  assertEqual(pool.pool.length, 3);

  const obj = poolAcquire(pool);
  assertEqual(pool.pool.length, 2);
  assertEqual(pool.active.size, 1);

  poolRelease(pool, obj);
  assertEqual(pool.pool.length, 3);
  assertEqual(pool.active.size, 0);
});

runner.test('objectPool — grow quand vide', () => {
  let counter = 0;
  const pool = createObjectPool(() => ({ id: counter++ }), 1);
  poolAcquire(pool); // take the 1 pre-allocated
  const obj2 = poolAcquire(pool); // should create a new one
  assertTrue(obj2 !== undefined);
  assertEqual(pool.active.size, 2);
});

// Spatial hash grid
runner.test('spatialHashGrid — insert et query', () => {
  const grid = createSpatialHashGrid(10);
  spatialHashInsert(grid, 0, 5, 5);
  spatialHashInsert(grid, 1, 15, 15);
  spatialHashInsert(grid, 2, 50, 50);

  const neighbors = spatialHashQuery(grid, 5, 5, 12);
  assertTrue(neighbors.includes(0));
  assertTrue(neighbors.includes(1));
  assertFalse(neighbors.includes(2));
});

runner.test('spatialHashGrid — query rayon large retourne tout', () => {
  const grid = createSpatialHashGrid(10);
  spatialHashInsert(grid, 0, 5, 5);
  spatialHashInsert(grid, 1, 25, 25);
  const all = spatialHashQuery(grid, 15, 15, 30);
  assertTrue(all.includes(0));
  assertTrue(all.includes(1));
});

runner.run();
