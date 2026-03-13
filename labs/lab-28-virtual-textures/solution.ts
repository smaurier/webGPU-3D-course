import {
  createTestRunner,
  assertApprox,
  assertTrue,
  assertFalse,
  assertEqual,
  assertDeepEqual,
  assertArrayApprox,
  type Vec3,
} from '../test-utils.ts';

// ─── Types ──────────────────────────────────────────────────────────────────

interface PageCoord {
  pageX: number;
  pageY: number;
  mip: number;
}

interface PhysicalPage {
  physX: number;
  physY: number;
}

interface PageTableEntry {
  pageCoord: PageCoord;
  physical: PhysicalPage;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ─── Page Table Lookup ──────────────────────────────────────────────────────

/**
 * Convertit des coordonnees UV [0,1] en coordonnees de page dans la page table,
 * puis retourne la position physique dans l'atlas.
 */
function pageTableLookup(
  u: number,
  v: number,
  mip: number,
  pageSize: number,
  textureSize: number,
  pageTable: PageTableEntry[],
): PhysicalPage | null {
  const mipSize = textureSize >> mip;
  const pagesPerRow = Math.ceil(mipSize / pageSize);
  const pageX = Math.min(Math.floor(u * pagesPerRow), pagesPerRow - 1);
  const pageY = Math.min(Math.floor(v * pagesPerRow), pagesPerRow - 1);

  const entry = pageTable.find(
    e => e.pageCoord.pageX === pageX && e.pageCoord.pageY === pageY && e.pageCoord.mip === mip,
  );
  return entry ? entry.physical : null;
}

// ─── LRU Cache ──────────────────────────────────────────────────────────────

class LRUCache {
  private capacity: number;
  private cache: Map<string, PhysicalPage>;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.cache = new Map();
  }

  private pageKey(coord: PageCoord): string {
    return `${coord.mip}_${coord.pageX}_${coord.pageY}`;
  }

  get(coord: PageCoord): PhysicalPage | null {
    const key = this.pageKey(coord);
    const val = this.cache.get(key);
    if (!val) return null;
    // Deplacer en fin de Map (Most Recently Used)
    this.cache.delete(key);
    this.cache.set(key, val);
    return val;
  }

  put(coord: PageCoord, page: PhysicalPage): PageCoord | null {
    const key = this.pageKey(coord);
    if (this.cache.has(key)) {
      this.cache.delete(key);
      this.cache.set(key, page);
      return null;
    }

    let evicted: PageCoord | null = null;
    if (this.cache.size >= this.capacity) {
      // Evincer le plus ancien (premier dans la Map)
      const firstKey = this.cache.keys().next().value!;
      const parts = firstKey.split('_').map(Number);
      evicted = { mip: parts[0], pageX: parts[1], pageY: parts[2] };
      this.cache.delete(firstKey);
    }

    this.cache.set(key, page);
    return evicted;
  }

  size(): number {
    return this.cache.size;
  }

  has(coord: PageCoord): boolean {
    return this.cache.has(this.pageKey(coord));
  }
}

// ─── Mip Level Selection ────────────────────────────────────────────────────

/**
 * Selectionne le niveau de mip en fonction de la distance camera-objet.
 * mip = floor(log2(distance / threshold)), clampe a [0, maxMip]
 */
function selectMipLevel(
  distance: number,
  threshold: number,
  maxMip: number,
): number {
  if (distance <= threshold) return 0;
  const mip = Math.floor(Math.log2(distance / threshold));
  return Math.min(mip, maxMip);
}

// ─── Feedback Buffer Analysis ───────────────────────────────────────────────

/**
 * Analyse un feedback buffer (rendu par le GPU) pour extraire la liste
 * des pages visibles. Chaque pixel encode (pageX, pageY, mip).
 * On deduplique les resultats.
 */
function analyzeFeedbackBuffer(
  pixels: PageCoord[],
): PageCoord[] {
  const seen = new Set<string>();
  const result: PageCoord[] = [];
  for (const p of pixels) {
    const key = `${p.mip}_${p.pageX}_${p.pageY}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(p);
    }
  }
  return result;
}

// ─── Page Priority Score ────────────────────────────────────────────────────

/**
 * Score de priorite d'une page pour le chargement.
 * Combine la taille a l'ecran, la visibilite et le delta de mip.
 * score = screenSize * visibilityWeight + mipDelta * mipWeight
 */
function pagePriorityScore(
  screenSize: number,
  visibility: number,
  mipDelta: number,
  visibilityWeight: number,
  mipWeight: number,
): number {
  return screenSize * visibility * visibilityWeight + mipDelta * mipWeight;
}

// ─── VRAM Budget Tracker ────────────────────────────────────────────────────

class VRAMBudgetTracker {
  private budgetBytes: number;
  private usedBytes: number;
  private threshold: number;

  constructor(budgetBytes: number, threshold: number) {
    this.budgetBytes = budgetBytes;
    this.usedBytes = 0;
    this.threshold = threshold;
  }

  allocate(bytes: number): boolean {
    if (this.usedBytes + bytes > this.budgetBytes) return false;
    this.usedBytes += bytes;
    return true;
  }

  free(bytes: number): void {
    this.usedBytes = Math.max(0, this.usedBytes - bytes);
  }

  getUsed(): number {
    return this.usedBytes;
  }

  isOverThreshold(): boolean {
    return this.usedBytes / this.budgetBytes >= this.threshold;
  }

  getUsageRatio(): number {
    return this.usedBytes / this.budgetBytes;
  }
}

// ─── Atlas UV Remapping ─────────────────────────────────────────────────────

/**
 * Remapper des UV originaux [0,1] vers les UV dans l'atlas physique.
 * atlasUV = originalUV * scale + offset
 */
function atlasUVRemap(
  u: number,
  v: number,
  offsetU: number,
  offsetV: number,
  scaleU: number,
  scaleV: number,
): [number, number] {
  return [u * scaleU + offsetU, v * scaleV + offsetV];
}

// ─── Atlas Packing ──────────────────────────────────────────────────────────

/**
 * Algorithme simple de packing en bandes (shelf packing).
 * Place des rectangles dans un atlas de taille atlasSize x atlasSize.
 * Retourne les positions ou null si ca ne tient pas.
 */
function shelfPackRects(
  rects: { w: number; h: number }[],
  atlasSize: number,
): Rect[] | null {
  // Trier par hauteur decroissante
  const indexed = rects.map((r, i) => ({ ...r, idx: i }));
  indexed.sort((a, b) => b.h - a.h);

  const result: Rect[] = new Array(rects.length);
  let shelfX = 0;
  let shelfY = 0;
  let shelfHeight = 0;

  for (const r of indexed) {
    if (shelfX + r.w > atlasSize) {
      // Nouvelle etagere
      shelfY += shelfHeight;
      shelfX = 0;
      shelfHeight = 0;
    }
    if (shelfY + r.h > atlasSize) return null; // Ne tient pas
    result[r.idx] = { x: shelfX, y: shelfY, w: r.w, h: r.h };
    shelfX += r.w;
    shelfHeight = Math.max(shelfHeight, r.h);
  }

  return result;
}

/**
 * Verifie qu'aucun rectangle ne chevauche un autre.
 */
function verifyNoOverlap(rects: Rect[]): boolean {
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
        return false;
      }
    }
  }
  return true;
}

// ─── Basis Universal Transcode Size ─────────────────────────────────────────

/**
 * Estimation de la taille en octets apres transcodage Basis Universal.
 * size = width * height * bitsPerPixel / 8
 * BC7: 8 bpp, ASTC 4x4: 8 bpp, ETC2: 8 bpp (RGBA), ETC2 RGB: 4 bpp
 */
function basisTranscodeSize(
  width: number,
  height: number,
  bitsPerPixel: number,
): number {
  return (width * height * bitsPerPixel) / 8;
}

// ─── Progressive Mip Chain ──────────────────────────────────────────────────

/**
 * Genere la chaine de mip levels depuis la taille de base.
 * Chaque niveau divise par 2 jusqu'a 1x1.
 */
function generateMipChain(baseWidth: number, baseHeight: number): [number, number][] {
  const chain: [number, number][] = [];
  let w = baseWidth;
  let h = baseHeight;
  while (w >= 1 && h >= 1) {
    chain.push([w, h]);
    if (w === 1 && h === 1) break;
    w = Math.max(1, Math.floor(w / 2));
    h = Math.max(1, Math.floor(h / 2));
  }
  return chain;
}

// ─── Resident Ratio ─────────────────────────────────────────────────────────

/**
 * Ratio de pages residentes = pages chargees / pages visibles totales.
 */
function residentRatio(loadedPages: number, totalVisiblePages: number): number {
  if (totalVisiblePages === 0) return 1;
  return loadedPages / totalVisiblePages;
}

// ─── Page Fault Detection ───────────────────────────────────────────────────

/**
 * Detecte les page faults : pages demandees qui ne sont pas dans le cache.
 */
function detectPageFaults(
  requestedPages: PageCoord[],
  cache: LRUCache,
): PageCoord[] {
  return requestedPages.filter(p => !cache.has(p));
}

// ─── Tests ──────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 28 — Virtual Textures');

// Page table lookup
runner.test('pageTableLookup — UV vers page physique', () => {
  const pageTable: PageTableEntry[] = [
    { pageCoord: { pageX: 0, pageY: 0, mip: 0 }, physical: { physX: 3, physY: 1 } },
    { pageCoord: { pageX: 1, pageY: 0, mip: 0 }, physical: { physX: 0, physY: 2 } },
  ];
  // textureSize=256, pageSize=128 -> mip0 = 256/128 = 2 pages par cote
  // u=0.75 -> pageX=1, v=0.25 -> pageY=0
  const result = pageTableLookup(0.75, 0.25, 0, 128, 256, pageTable);
  assertDeepEqual(result, { physX: 0, physY: 2 });
});

runner.test('pageTableLookup — page absente retourne null', () => {
  const result = pageTableLookup(0.5, 0.5, 0, 128, 256, []);
  assertEqual(result, null);
});

// LRU Cache
runner.test('LRUCache — eviction du moins recemment utilise', () => {
  const cache = new LRUCache(2);
  cache.put({ pageX: 0, pageY: 0, mip: 0 }, { physX: 0, physY: 0 });
  cache.put({ pageX: 1, pageY: 0, mip: 0 }, { physX: 1, physY: 0 });
  // Acceder a la page (0,0) pour la rendre recente
  cache.get({ pageX: 0, pageY: 0, mip: 0 });
  // Inserer une 3e page : devrait evincer (1,0) qui est la moins recente
  const evicted = cache.put({ pageX: 2, pageY: 0, mip: 0 }, { physX: 2, physY: 0 });
  assertDeepEqual(evicted, { mip: 0, pageX: 1, pageY: 0 });
  assertEqual(cache.size(), 2);
});

runner.test('LRUCache — pas d\'eviction si capacite non atteinte', () => {
  const cache = new LRUCache(3);
  const evicted = cache.put({ pageX: 0, pageY: 0, mip: 0 }, { physX: 0, physY: 0 });
  assertEqual(evicted, null);
  assertEqual(cache.size(), 1);
});

// Mip level selection
runner.test('selectMipLevel — distance proche = mip 0', () => {
  assertEqual(selectMipLevel(5, 10, 8), 0);
});

runner.test('selectMipLevel — distance lointaine = mip eleve', () => {
  // distance=80, threshold=10 -> log2(8) = 3
  assertEqual(selectMipLevel(80, 10, 8), 3);
});

runner.test('selectMipLevel — clampe a maxMip', () => {
  assertEqual(selectMipLevel(10000, 10, 4), 4);
});

// Feedback buffer analysis
runner.test('analyzeFeedbackBuffer — deduplique les pages', () => {
  const pixels: PageCoord[] = [
    { pageX: 0, pageY: 0, mip: 0 },
    { pageX: 0, pageY: 0, mip: 0 },
    { pageX: 1, pageY: 0, mip: 0 },
    { pageX: 0, pageY: 0, mip: 0 },
  ];
  const result = analyzeFeedbackBuffer(pixels);
  assertEqual(result.length, 2);
});

// Page priority score
runner.test('pagePriorityScore — combine taille ecran, visibilite, mip delta', () => {
  // screenSize=100, visibility=1, mipDelta=2, vWeight=1, mWeight=5
  // score = 100 * 1 * 1 + 2 * 5 = 110
  assertApprox(pagePriorityScore(100, 1, 2, 1, 5), 110);
});

// VRAM budget tracker
runner.test('VRAMBudgetTracker — allocation et seuil', () => {
  const tracker = new VRAMBudgetTracker(1024 * 1024, 0.8); // 1 Mo, seuil 80%
  assertTrue(tracker.allocate(500 * 1024));
  assertFalse(tracker.isOverThreshold());
  assertTrue(tracker.allocate(400 * 1024)); // 900 Ko -> 87.9% -> over
  assertTrue(tracker.isOverThreshold());
  tracker.free(400 * 1024);
  assertFalse(tracker.isOverThreshold());
});

runner.test('VRAMBudgetTracker — refuse allocation si budget depasse', () => {
  const tracker = new VRAMBudgetTracker(100, 0.9);
  assertTrue(tracker.allocate(80));
  assertFalse(tracker.allocate(30)); // 80+30 > 100
  assertEqual(tracker.getUsed(), 80);
});

// Atlas UV remapping
runner.test('atlasUVRemap — remapping correct', () => {
  // Page de 128x128 dans un atlas 512x512, offset (256,0)
  // scale = 128/512 = 0.25, offset = 256/512 = 0.5
  const [u, v] = atlasUVRemap(0.5, 0.5, 0.5, 0, 0.25, 0.25);
  assertApprox(u, 0.625, 0.001);
  assertApprox(v, 0.125, 0.001);
});

// Atlas packing
runner.test('shelfPackRects — packing sans chevauchement', () => {
  const rects = [
    { w: 64, h: 64 },
    { w: 128, h: 64 },
    { w: 64, h: 128 },
    { w: 64, h: 64 },
  ];
  const packed = shelfPackRects(rects, 256);
  assertTrue(packed !== null);
  if (packed) {
    assertTrue(verifyNoOverlap(packed));
    // Toutes les rects sont dans les limites de l'atlas
    for (const r of packed) {
      assertTrue(r.x + r.w <= 256);
      assertTrue(r.y + r.h <= 256);
    }
  }
});

// Basis transcode size
runner.test('basisTranscodeSize — BC7 vs ETC2 RGB', () => {
  const bc7 = basisTranscodeSize(1024, 1024, 8);   // 8 bpp
  const etc2 = basisTranscodeSize(1024, 1024, 4);  // 4 bpp
  assertEqual(bc7, 1024 * 1024); // 1 Mo
  assertEqual(etc2, 512 * 1024); // 512 Ko
});

// Progressive mip chain
runner.test('generateMipChain — 1024 -> 512 -> ... -> 1', () => {
  const chain = generateMipChain(1024, 1024);
  assertEqual(chain[0][0], 1024);
  assertEqual(chain[1][0], 512);
  assertEqual(chain[chain.length - 1][0], 1);
  assertEqual(chain.length, 11); // log2(1024) + 1
});

// Resident ratio
runner.test('residentRatio — pages chargees / pages visibles', () => {
  assertApprox(residentRatio(80, 100), 0.8);
  assertApprox(residentRatio(100, 100), 1.0);
  assertApprox(residentRatio(0, 100), 0.0);
});

// Page fault detection
runner.test('pageFaultDetection — detecte les pages absentes du cache', () => {
  const cache = new LRUCache(10);
  cache.put({ pageX: 0, pageY: 0, mip: 0 }, { physX: 0, physY: 0 });
  cache.put({ pageX: 1, pageY: 0, mip: 0 }, { physX: 1, physY: 0 });

  const requested: PageCoord[] = [
    { pageX: 0, pageY: 0, mip: 0 }, // present
    { pageX: 2, pageY: 0, mip: 0 }, // absent -> fault
    { pageX: 3, pageY: 1, mip: 1 }, // absent -> fault
  ];
  const faults = detectPageFaults(requested, cache);
  assertEqual(faults.length, 2);
});

runner.run();
