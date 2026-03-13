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
  // TODO: calculer mipSize = textureSize >> mip
  // TODO: calculer pagesPerRow = ceil(mipSize / pageSize)
  // TODO: calculer pageX = floor(u * pagesPerRow), pageY = floor(v * pagesPerRow)
  // TODO: chercher l'entree correspondante dans pageTable
  // TODO: retourner la page physique ou null si absente
  return null;
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
    // TODO: si la cle n'existe pas, retourner null
    // TODO: sinon, supprimer et re-inserer (pour la placer en fin = MRU)
    // TODO: retourner la valeur
    return null;
  }

  put(coord: PageCoord, page: PhysicalPage): PageCoord | null {
    // TODO: si la cle existe deja, mettre a jour et retourner null
    // TODO: si le cache est plein, evincer le premier element (LRU)
    //       et retourner ses coordonnees
    // TODO: inserer la nouvelle page
    return null;
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
  // TODO: si distance <= threshold -> mip 0
  // TODO: sinon mip = floor(log2(distance / threshold))
  // TODO: clamper a [0, maxMip]
  return 0;
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
  // TODO: parcourir les pixels et dedupliquer par (mip, pageX, pageY)
  return [];
}

// ─── Page Priority Score ────────────────────────────────────────────────────

/**
 * Score de priorite d'une page pour le chargement.
 * Combine la taille a l'ecran, la visibilite et le delta de mip.
 * score = screenSize * visibility * visibilityWeight + mipDelta * mipWeight
 */
function pagePriorityScore(
  screenSize: number,
  visibility: number,
  mipDelta: number,
  visibilityWeight: number,
  mipWeight: number,
): number {
  // TODO: calculer et retourner le score
  return 0;
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
    // TODO: verifier que usedBytes + bytes <= budgetBytes
    // TODO: si oui, incrementer usedBytes et retourner true
    // TODO: sinon retourner false
    return false;
  }

  free(bytes: number): void {
    // TODO: decrementer usedBytes (minimum 0)
  }

  getUsed(): number {
    return this.usedBytes;
  }

  isOverThreshold(): boolean {
    // TODO: retourner true si usedBytes/budgetBytes >= threshold
    return false;
  }

  getUsageRatio(): number {
    // TODO: retourner usedBytes / budgetBytes
    return 0;
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
  // TODO: appliquer la formule de remapping
  return [0, 0];
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
  // TODO: trier par hauteur decroissante
  // TODO: pour chaque rect, placer sur l'etagere courante
  //       si pas assez de place en X, passer a l'etagere suivante
  //       si pas assez de place en Y, retourner null
  return null;
}

/**
 * Verifie qu'aucun rectangle ne chevauche un autre.
 */
function verifyNoOverlap(rects: Rect[]): boolean {
  // TODO: tester toutes les paires de rectangles
  // Deux rects se chevauchent si :
  //   a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y
  return false;
}

// ─── Basis Universal Transcode Size ─────────────────────────────────────────

/**
 * Estimation de la taille en octets apres transcodage Basis Universal.
 * size = width * height * bitsPerPixel / 8
 */
function basisTranscodeSize(
  width: number,
  height: number,
  bitsPerPixel: number,
): number {
  // TODO: calculer la taille
  return 0;
}

// ─── Progressive Mip Chain ──────────────────────────────────────────────────

/**
 * Genere la chaine de mip levels depuis la taille de base.
 * Chaque niveau divise par 2 jusqu'a 1x1.
 */
function generateMipChain(baseWidth: number, baseHeight: number): [number, number][] {
  // TODO: commencer avec (baseWidth, baseHeight)
  // TODO: diviser par 2 a chaque etape (min 1)
  // TODO: s'arreter quand on atteint 1x1
  return [];
}

// ─── Resident Ratio ─────────────────────────────────────────────────────────

/**
 * Ratio de pages residentes = pages chargees / pages visibles totales.
 */
function residentRatio(loadedPages: number, totalVisiblePages: number): number {
  // TODO: retourner le ratio (attention a la division par zero)
  return 0;
}

// ─── Page Fault Detection ───────────────────────────────────────────────────

/**
 * Detecte les page faults : pages demandees qui ne sont pas dans le cache.
 */
function detectPageFaults(
  requestedPages: PageCoord[],
  cache: LRUCache,
): PageCoord[] {
  // TODO: filtrer les pages demandees qui ne sont pas dans le cache
  return [];
}

// ─── Tests ──────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 28 — Virtual Textures');

// Page table lookup
runner.test('pageTableLookup — UV vers page physique', () => {
  const pageTable: PageTableEntry[] = [
    { pageCoord: { pageX: 0, pageY: 0, mip: 0 }, physical: { physX: 3, physY: 1 } },
    { pageCoord: { pageX: 1, pageY: 0, mip: 0 }, physical: { physX: 0, physY: 2 } },
  ];
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
  cache.get({ pageX: 0, pageY: 0, mip: 0 });
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
  assertApprox(pagePriorityScore(100, 1, 2, 1, 5), 110);
});

// VRAM budget tracker
runner.test('VRAMBudgetTracker — allocation et seuil', () => {
  const tracker = new VRAMBudgetTracker(1024 * 1024, 0.8);
  assertTrue(tracker.allocate(500 * 1024));
  assertFalse(tracker.isOverThreshold());
  assertTrue(tracker.allocate(400 * 1024));
  assertTrue(tracker.isOverThreshold());
  tracker.free(400 * 1024);
  assertFalse(tracker.isOverThreshold());
});

runner.test('VRAMBudgetTracker — refuse allocation si budget depasse', () => {
  const tracker = new VRAMBudgetTracker(100, 0.9);
  assertTrue(tracker.allocate(80));
  assertFalse(tracker.allocate(30));
  assertEqual(tracker.getUsed(), 80);
});

// Atlas UV remapping
runner.test('atlasUVRemap — remapping correct', () => {
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
    for (const r of packed) {
      assertTrue(r.x + r.w <= 256);
      assertTrue(r.y + r.h <= 256);
    }
  }
});

// Basis transcode size
runner.test('basisTranscodeSize — BC7 vs ETC2 RGB', () => {
  const bc7 = basisTranscodeSize(1024, 1024, 8);
  const etc2 = basisTranscodeSize(1024, 1024, 4);
  assertEqual(bc7, 1024 * 1024);
  assertEqual(etc2, 512 * 1024);
});

// Progressive mip chain
runner.test('generateMipChain — 1024 -> 512 -> ... -> 1', () => {
  const chain = generateMipChain(1024, 1024);
  assertEqual(chain[0][0], 1024);
  assertEqual(chain[1][0], 512);
  assertEqual(chain[chain.length - 1][0], 1);
  assertEqual(chain.length, 11);
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
    { pageX: 0, pageY: 0, mip: 0 },
    { pageX: 2, pageY: 0, mip: 0 },
    { pageX: 3, pageY: 1, mip: 1 },
  ];
  const faults = detectPageFaults(requested, cache);
  assertEqual(faults.length, 2);
});

runner.run();
