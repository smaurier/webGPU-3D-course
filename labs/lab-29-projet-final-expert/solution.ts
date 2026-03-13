import {
  createTestRunner,
  assertEqual,
  assertDeepEqual,
  assertTrue,
  assertFalse,
  assertApprox,
  assertArrayApprox,
  type Vec3,
  type Mat4,
  type AABB,
  type Ray,
} from '../test-utils.ts';

// ─── Types ──────────────────────────────────────────────────────────────────

interface System {
  name: string;
  priority: number;
  update: (dt: number) => void;
}

interface AssetEntry {
  type: 'model' | 'texture' | 'audio';
  path: string;
  size?: number;
}

interface AssetManifest {
  version: string;
  assets: AssetEntry[];
}

interface ChunkCoord {
  cx: number;
  cz: number;
}

interface ChunkLOD {
  coord: ChunkCoord;
  lod: number;
}

interface GerstnerParams {
  amplitude: number;
  frequency: number;
  speed: number;
  direction: [number, number];
}

interface MaterialProps {
  roughness: number;
  metallic: number;
  transparent: boolean;
}

interface SSRStep {
  screenX: number;
  screenY: number;
  depth: number;
}

interface PageID {
  pageX: number;
  pageY: number;
  mip: number;
}

interface LRUEntry {
  pageId: PageID;
  lastUsedFrame: number;
}

interface PhysicsTickResult {
  steps: number;
  alpha: number;
}

interface SpatialAudioResult {
  gain: number;
  pan: number;
}

interface LookAtResult {
  yaw: number;
  pitch: number;
}

interface AnimState {
  name: string;
}

interface AnimTransition {
  from: string;
  to: string;
  condition: string;
  crossfadeDuration: number;
}

interface AnimResult {
  nextState: string;
  crossfadeWeight: number;
}

interface SystemTiming {
  name: string;
  ms: number;
}

interface FrameStats {
  minFPS: number;
  avgFPS: number;
  maxFPS: number;
}

interface Allocation {
  id: string;
  bytes: number;
}

interface QualitySettings {
  shadowResolution: number;
  ssaoEnabled: boolean;
  ssrEnabled: boolean;
  particleCount: number;
  textureQuality: 'low' | 'medium' | 'high';
}

// ─── 1. Scene Manager ───────────────────────────────────────────────────────

/**
 * Enregistre des systemes, les trie par priorite, et appelle update sur chacun.
 * Retourne la liste des noms de systemes dans l'ordre d'appel.
 */
function runSystemUpdate(systems: System[], dt: number): string[] {
  const sorted = [...systems].sort((a, b) => a.priority - b.priority);
  const order: string[] = [];
  for (const sys of sorted) {
    sys.update(dt);
    order.push(sys.name);
  }
  return order;
}

// ─── 2. Asset Manifest Parser ───────────────────────────────────────────────

/**
 * Parse et valide un manifest d'assets JSON.
 * Retourne null si version manquante ou asset sans path.
 */
function parseAssetManifest(json: string): AssetManifest | null {
  try {
    const obj = JSON.parse(json);
    if (!obj.version || !Array.isArray(obj.assets)) return null;
    for (const asset of obj.assets) {
      if (!asset.type || !asset.path) return null;
    }
    return { version: obj.version, assets: obj.assets };
  } catch {
    return null;
  }
}

// ─── 3. Terrain Chunk Manager ───────────────────────────────────────────────

/**
 * Calcule les chunks visibles autour de la camera (rayon en chunks).
 */
function getVisibleChunks(
  camX: number,
  camZ: number,
  chunkSize: number,
  viewRadius: number,
): ChunkCoord[] {
  const camCX = Math.floor(camX / chunkSize);
  const camCZ = Math.floor(camZ / chunkSize);
  const result: ChunkCoord[] = [];

  for (let cx = camCX - viewRadius; cx <= camCX + viewRadius; cx++) {
    for (let cz = camCZ - viewRadius; cz <= camCZ + viewRadius; cz++) {
      const dx = cx - camCX;
      const dz = cz - camCZ;
      if (Math.sqrt(dx * dx + dz * dz) <= viewRadius) {
        result.push({ cx, cz });
      }
    }
  }

  return result;
}

/**
 * Determine le LOD d'un chunk en fonction de la distance a la camera.
 * LOD 0 = plus detaille, LOD augmente avec la distance.
 * lod = floor(distance / lodStep), clampe a [0, maxLOD]
 */
function chunkLOD(
  chunkCX: number,
  chunkCZ: number,
  camChunkX: number,
  camChunkZ: number,
  lodStep: number,
  maxLOD: number,
): number {
  const dx = chunkCX - camChunkX;
  const dz = chunkCZ - camChunkZ;
  const distance = Math.sqrt(dx * dx + dz * dz);
  const lod = Math.floor(distance / lodStep);
  return Math.min(Math.max(lod, 0), maxLOD);
}

// ─── 4. Water Gerstner Wave ─────────────────────────────────────────────────

/**
 * Calcule le deplacement vertical Y a la position (x, z, time)
 * en sommant plusieurs ondes de Gerstner (simplifiees a sin).
 * Y = sum( amplitude * sin(dot(direction, [x,z]) * frequency + time * speed) )
 */
function gerstnerWaveY(
  x: number,
  z: number,
  time: number,
  waves: GerstnerParams[],
): number {
  let y = 0;
  for (const w of waves) {
    const dot = w.direction[0] * x + w.direction[1] * z;
    y += w.amplitude * Math.sin(dot * w.frequency + time * w.speed);
  }
  return y;
}

// ─── 5. Atmosphere Color ────────────────────────────────────────────────────

/**
 * Couleur du ciel simplifiee (Rayleigh).
 * Plus le viewDir est proche de l'horizon (viewDir.y -> 0), plus c'est orange/rouge.
 * Plus viewDir.y est haut (zenith), plus c'est bleu.
 * Retourne [r, g, b] normalise [0,1].
 */
function atmosphereColor(viewDirY: number): Vec3 {
  const t = Math.max(0, Math.min(1, viewDirY));
  // horizon [1.0, 0.5, 0.2] -> zenith [0.3, 0.5, 1.0]
  const r = 1.0 * (1 - t) + 0.3 * t;
  const g = 0.5 * (1 - t) + 0.5 * t;
  const b = 0.2 * (1 - t) + 1.0 * t;
  return [r, g, b];
}

// ─── 6. Volumetric Fog Density ──────────────────────────────────────────────

/**
 * Densite de brouillard exponentielle basee sur la hauteur.
 * density = baseD * exp(-heightFalloff * max(0, y - seaLevel))
 */
function fogDensity(
  y: number,
  seaLevel: number,
  baseDensity: number,
  heightFalloff: number,
): number {
  return baseDensity * Math.exp(-heightFalloff * Math.max(0, y - seaLevel));
}

// ─── 7. Hybrid Render Decision ──────────────────────────────────────────────

/**
 * Decide si un materiau doit etre rendu en rasterisation seule
 * ou avec ray tracing pour les reflexions.
 * Ray trace si : metallic > 0.5 ET roughness < 0.3 ET pas transparent
 */
function renderDecision(mat: MaterialProps): 'rasterize' | 'raytrace-reflections' {
  if (mat.metallic > 0.5 && mat.roughness < 0.3 && !mat.transparent) {
    return 'raytrace-reflections';
  }
  return 'rasterize';
}

// ─── 8. CSM Cascade Selection ───────────────────────────────────────────────

/**
 * Retourne l'index de cascade pour une profondeur en view-space.
 * cascadeSplits = [s0, s1, s2, s3] : si depth < s0 -> 0, < s1 -> 1, etc.
 * Si depth >= dernier split -> dernier index.
 */
function csmCascadeIndex(depth: number, cascadeSplits: number[]): number {
  for (let i = 0; i < cascadeSplits.length; i++) {
    if (depth < cascadeSplits[i]) return i;
  }
  return cascadeSplits.length - 1;
}

// ─── 9. SSR Ray March Step ──────────────────────────────────────────────────

/**
 * Avance d'un pas en screen-space ray marching.
 * Retourne le nouveau point et si on a touche la geometrie (depth buffer hit).
 * Hit si currentDepth >= depthBufferValue (avec un petit epsilon).
 */
function ssrStep(
  current: SSRStep,
  dirX: number,
  dirY: number,
  dirDepth: number,
  stepSize: number,
  depthBuffer: (x: number, y: number) => number,
  epsilon: number,
): { next: SSRStep; hit: boolean } {
  const next: SSRStep = {
    screenX: current.screenX + dirX * stepSize,
    screenY: current.screenY + dirY * stepSize,
    depth: current.depth + dirDepth * stepSize,
  };
  const bufferDepth = depthBuffer(next.screenX, next.screenY);
  const hit = next.depth >= bufferDepth - epsilon;
  return { next, hit };
}

// ─── 10. TAA Halton Jitter ──────────────────────────────────────────────────

/**
 * Calcule le N-ieme element de la sequence de Halton pour une base donnee.
 * Utilise pour le jitter sous-pixel en TAA.
 */
function halton(index: number, base: number): number {
  let result = 0;
  let f = 1 / base;
  let i = index;
  while (i > 0) {
    result += f * (i % base);
    i = Math.floor(i / base);
    f /= base;
  }
  return result;
}

/**
 * Retourne le jitter (x, y) pour la frame N en utilisant Halton(2) et Halton(3).
 * Remapper de [0,1] vers [-0.5, 0.5].
 */
function taaJitter(frameIndex: number): [number, number] {
  return [halton(frameIndex, 2) - 0.5, halton(frameIndex, 3) - 0.5];
}

// ─── 11. Virtual Texture Page Request ───────────────────────────────────────

/**
 * A partir de coordonnees UV et d'un mip level, calcule l'ID de page.
 * pageX = floor(u * pagesPerSide), pageY = floor(v * pagesPerSide)
 * pagesPerSide = textureSize / (pageSize * 2^mip)
 */
function computePageID(
  u: number,
  v: number,
  mip: number,
  textureSize: number,
  pageSize: number,
): PageID {
  const pagesPerSide = textureSize / (pageSize * Math.pow(2, mip));
  const pageX = Math.min(Math.floor(u * pagesPerSide), pagesPerSide - 1);
  const pageY = Math.min(Math.floor(v * pagesPerSide), pagesPerSide - 1);
  return { pageX, pageY, mip };
}

// ─── 12. LRU Page Eviction ──────────────────────────────────────────────────

/**
 * Determine quelle page evincer : celle avec le lastUsedFrame le plus ancien.
 */
function findEvictionCandidate(entries: LRUEntry[]): PageID | null {
  if (entries.length === 0) return null;
  let oldest = entries[0];
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].lastUsedFrame < oldest.lastUsedFrame) {
      oldest = entries[i];
    }
  }
  return oldest.pageId;
}

// ─── 13. Physics Fixed Timestep ─────────────────────────────────────────────

/**
 * Accumulateur de pas de temps fixe.
 * Retourne le nombre de steps a executer et l'alpha d'interpolation.
 */
function physicsAccumulator(
  accumulator: number,
  dt: number,
  fixedDt: number,
): PhysicsTickResult {
  accumulator += dt;
  const steps = Math.floor(accumulator / fixedDt);
  const remainder = accumulator - steps * fixedDt;
  const alpha = remainder / fixedDt;
  return { steps, alpha };
}

// ─── 14. Spatial Audio ──────────────────────────────────────────────────────

/**
 * Calcule gain et pan stereo a partir des positions listener/source.
 * gain = 1 / max(1, distance) (attenuation inverse)
 * pan = clamp(dx / distance, -1, 1). Listener regarde vers -Z.
 */
function spatialAudio(
  listenerPos: Vec3,
  sourcePos: Vec3,
): SpatialAudioResult {
  const dx = sourcePos[0] - listenerPos[0];
  const dy = sourcePos[1] - listenerPos[1];
  const dz = sourcePos[2] - listenerPos[2];
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const gain = 1 / Math.max(1, distance);
  const pan = distance > 0 ? Math.max(-1, Math.min(1, dx / distance)) : 0;
  return { gain, pan };
}

// ─── 15. IK Look-At ────────────────────────────────────────────────────────

/**
 * Calcule yaw et pitch pour orienter la tete vers une cible.
 * yaw = atan2(dx, dz), pitch = atan2(dy, sqrt(dx^2 + dz^2))
 */
function ikLookAt(headPos: Vec3, targetPos: Vec3): LookAtResult {
  const dx = targetPos[0] - headPos[0];
  const dy = targetPos[1] - headPos[1];
  const dz = targetPos[2] - headPos[2];
  const yaw = Math.atan2(dx, dz);
  const pitch = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));
  return { yaw, pitch };
}

// ─── 16. Animation State Machine ────────────────────────────────────────────

/**
 * Determine le prochain etat d'animation et le poids de crossfade.
 * Parcourt les transitions : si from == currentState et condition est dans activeParams,
 * retourne {nextState: to, crossfadeWeight: 0} (debut du crossfade).
 * Sinon retourne {nextState: currentState, crossfadeWeight: 1} (pas de transition).
 */
function animStateMachine(
  currentState: string,
  transitions: AnimTransition[],
  activeParams: string[],
): AnimResult {
  for (const t of transitions) {
    if (t.from === currentState && activeParams.includes(t.condition)) {
      return { nextState: t.to, crossfadeWeight: 0 };
    }
  }
  return { nextState: currentState, crossfadeWeight: 1 };
}

// ─── 17. Performance Budget ─────────────────────────────────────────────────

/**
 * Identifie les systemes qui depassent leur budget de temps.
 * Retourne les noms des systemes dont le temps depasse budgetMs.
 */
function findOverBudgetSystems(
  timings: SystemTiming[],
  budgetMs: number,
): string[] {
  return timings.filter(t => t.ms > budgetMs).map(t => t.name);
}

// ─── 18. Frame Stats Aggregator ─────────────────────────────────────────────

/**
 * Calcule min, avg, max FPS a partir d'un tableau de durees de frame (en ms).
 * FPS = 1000 / frameTime
 */
function computeFrameStats(frameTimes: number[]): FrameStats {
  const fpsList = frameTimes.map(t => 1000 / t);
  const minFPS = Math.min(...fpsList);
  const maxFPS = Math.max(...fpsList);
  const avgFPS = fpsList.reduce((a, b) => a + b, 0) / fpsList.length;
  return { minFPS, avgFPS, maxFPS };
}

// ─── 19. Memory Leak Detector ───────────────────────────────────────────────

/**
 * Detecte les fuites memoire : allocations sans free correspondant.
 * Retourne les IDs des allocations non liberees.
 */
function detectLeaks(
  allocations: Allocation[],
  frees: string[],
): string[] {
  const freeSet = new Set(frees);
  return allocations.filter(a => !freeSet.has(a.id)).map(a => a.id);
}

// ─── 20. Quality Preset ─────────────────────────────────────────────────────

/**
 * Retourne les parametres de qualite selon le tier GPU.
 */
function qualityPreset(tier: 'low' | 'mid' | 'high'): QualitySettings {
  switch (tier) {
    case 'low':
      return {
        shadowResolution: 512,
        ssaoEnabled: false,
        ssrEnabled: false,
        particleCount: 100,
        textureQuality: 'low',
      };
    case 'mid':
      return {
        shadowResolution: 1024,
        ssaoEnabled: true,
        ssrEnabled: false,
        particleCount: 500,
        textureQuality: 'medium',
      };
    case 'high':
      return {
        shadowResolution: 2048,
        ssaoEnabled: true,
        ssrEnabled: true,
        particleCount: 2000,
        textureQuality: 'high',
      };
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 29 — Projet Final Expert');

// 1. Scene Manager
runner.test('Scene Manager — systemes executes par priorite croissante', () => {
  const log: string[] = [];
  const systems: System[] = [
    { name: 'render', priority: 20, update: () => log.push('render') },
    { name: 'physics', priority: 10, update: () => log.push('physics') },
    { name: 'post-process', priority: 30, update: () => log.push('post-process') },
  ];
  const order = runSystemUpdate(systems, 0.016);
  assertDeepEqual(order, ['physics', 'render', 'post-process']);
  assertDeepEqual(log, ['physics', 'render', 'post-process']);
});

runner.test('Scene Manager — systeme unique', () => {
  const order = runSystemUpdate(
    [{ name: 'solo', priority: 1, update: () => {} }],
    0.016,
  );
  assertDeepEqual(order, ['solo']);
});

// 2. Asset Manifest Parser
runner.test('Asset Manifest — parse valide', () => {
  const json = JSON.stringify({
    version: '1.0',
    assets: [
      { type: 'model', path: 'hero.glb', size: 1024 },
      { type: 'texture', path: 'diffuse.ktx2' },
    ],
  });
  const m = parseAssetManifest(json);
  assertTrue(m !== null);
  assertEqual(m!.assets.length, 2);
  assertEqual(m!.version, '1.0');
});

runner.test('Asset Manifest — invalide sans version', () => {
  const json = JSON.stringify({ assets: [] });
  assertEqual(parseAssetManifest(json), null);
});

runner.test('Asset Manifest — invalide si asset sans path', () => {
  const json = JSON.stringify({
    version: '1.0',
    assets: [{ type: 'model' }],
  });
  assertEqual(parseAssetManifest(json), null);
});

// 3. Terrain Chunk Manager
runner.test('Terrain — chunks visibles autour de la camera', () => {
  const chunks = getVisibleChunks(50, 50, 32, 1);
  // camera dans chunk (1,1), rayon 1 -> 5 chunks (croix + centre)
  assertTrue(chunks.length > 0);
  assertTrue(chunks.some(c => c.cx === 1 && c.cz === 1));
});

runner.test('Terrain — LOD augmente avec la distance', () => {
  const lod0 = chunkLOD(5, 5, 5, 5, 2, 3);
  const lod1 = chunkLOD(5, 5, 3, 3, 2, 3);
  const lod2 = chunkLOD(5, 5, 0, 0, 2, 3);
  assertEqual(lod0, 0);
  assertTrue(lod1 > lod0);
  assertTrue(lod2 >= lod1);
});

// 4. Water Gerstner Wave
runner.test('Gerstner — onde unique a t=0', () => {
  const waves: GerstnerParams[] = [
    { amplitude: 1, frequency: 1, speed: 1, direction: [1, 0] },
  ];
  // sin(1 * pi/2 * 1 + 0 * 1) = sin(pi/2) = 1
  const y = gerstnerWaveY(Math.PI / 2, 0, 0, waves);
  assertApprox(y, 1.0, 0.01);
});

runner.test('Gerstner — superposition de deux ondes', () => {
  const waves: GerstnerParams[] = [
    { amplitude: 1, frequency: 1, speed: 0, direction: [1, 0] },
    { amplitude: 0.5, frequency: 2, speed: 0, direction: [0, 1] },
  ];
  // sin(0) + 0.5*sin(0) = 0
  const y = gerstnerWaveY(0, 0, 0, waves);
  assertApprox(y, 0, 0.01);
});

// 5. Atmosphere
runner.test('Atmosphere — zenith est bleu', () => {
  const [r, g, b] = atmosphereColor(1.0);
  assertTrue(b > r);
  assertApprox(b, 1.0, 0.01);
});

runner.test('Atmosphere — horizon est orange', () => {
  const [r, g, b] = atmosphereColor(0.0);
  assertTrue(r > b);
  assertApprox(r, 1.0, 0.01);
});

// 6. Volumetric Fog
runner.test('Fog — densite maximale au niveau de la mer', () => {
  assertApprox(fogDensity(0, 0, 1.0, 0.5), 1.0, 0.01);
});

runner.test('Fog — densite diminue avec la hauteur', () => {
  const d0 = fogDensity(0, 0, 1.0, 0.5);
  const d10 = fogDensity(10, 0, 1.0, 0.5);
  assertTrue(d10 < d0);
});

// 7. Hybrid Render Decision
runner.test('Hybrid — metallic lisse = raytrace', () => {
  assertEqual(
    renderDecision({ roughness: 0.1, metallic: 0.9, transparent: false }),
    'raytrace-reflections',
  );
});

runner.test('Hybrid — rugueux = rasterize', () => {
  assertEqual(
    renderDecision({ roughness: 0.8, metallic: 0.9, transparent: false }),
    'rasterize',
  );
});

runner.test('Hybrid — transparent = rasterize', () => {
  assertEqual(
    renderDecision({ roughness: 0.1, metallic: 0.9, transparent: true }),
    'rasterize',
  );
});

// 8. CSM Cascade Selection
runner.test('CSM — cascade 0 pour profondeur proche', () => {
  assertEqual(csmCascadeIndex(5, [10, 30, 80, 200]), 0);
});

runner.test('CSM — cascade 2 pour profondeur moyenne', () => {
  assertEqual(csmCascadeIndex(50, [10, 30, 80, 200]), 2);
});

runner.test('CSM — derniere cascade si au-dela des splits', () => {
  assertEqual(csmCascadeIndex(300, [10, 30, 80, 200]), 3);
});

// 9. SSR Ray March
runner.test('SSR — detection de hit quand depth depasse le buffer', () => {
  const current: SSRStep = { screenX: 100, screenY: 100, depth: 0.4 };
  const depthBuffer = () => 0.5;
  const result = ssrStep(current, 1, 0, 0.2, 1, depthBuffer, 0.01);
  // next.depth = 0.4 + 0.2*1 = 0.6, buffer = 0.5, 0.6 >= 0.5 - 0.01 -> hit
  assertTrue(result.hit);
});

runner.test('SSR — pas de hit si depth inferieur au buffer', () => {
  const current: SSRStep = { screenX: 100, screenY: 100, depth: 0.1 };
  const depthBuffer = () => 0.9;
  const result = ssrStep(current, 1, 0, 0.05, 1, depthBuffer, 0.01);
  // next.depth = 0.1 + 0.05 = 0.15, buffer = 0.9, 0.15 < 0.9 - 0.01 -> no hit
  assertFalse(result.hit);
});

// 10. TAA Halton
runner.test('TAA Halton — base 2 index 1 = 0.5', () => {
  assertApprox(halton(1, 2), 0.5);
});

runner.test('TAA Halton — base 3 index 1 = 0.333', () => {
  assertApprox(halton(1, 3), 1 / 3, 0.001);
});

runner.test('TAA jitter — frame 1', () => {
  const [jx, jy] = taaJitter(1);
  // halton(1,2) = 0.5 -> 0.5-0.5 = 0.0
  // halton(1,3) = 0.333 -> 0.333-0.5 = -0.167
  assertApprox(jx, 0.0, 0.01);
  assertApprox(jy, -0.1667, 0.01);
});

// 11. Virtual Texture Page Request
runner.test('Virtual Texture — page ID correcte', () => {
  // textureSize=1024, pageSize=128, mip=0 -> pagesPerSide=8
  // u=0.5, v=0.25 -> pageX=4, pageY=2
  const page = computePageID(0.5, 0.25, 0, 1024, 128);
  assertEqual(page.pageX, 4);
  assertEqual(page.pageY, 2);
  assertEqual(page.mip, 0);
});

runner.test('Virtual Texture — mip 1 reduit les pages', () => {
  // mip=1 -> pagesPerSide=1024/(128*2)=4
  // u=0.5, v=0.5 -> pageX=2, pageY=2
  const page = computePageID(0.5, 0.5, 1, 1024, 128);
  assertEqual(page.pageX, 2);
  assertEqual(page.pageY, 2);
  assertEqual(page.mip, 1);
});

// 12. LRU Page Eviction
runner.test('LRU Eviction — evince la page la plus ancienne', () => {
  const entries: LRUEntry[] = [
    { pageId: { pageX: 0, pageY: 0, mip: 0 }, lastUsedFrame: 10 },
    { pageId: { pageX: 1, pageY: 0, mip: 0 }, lastUsedFrame: 5 },
    { pageId: { pageX: 2, pageY: 0, mip: 0 }, lastUsedFrame: 8 },
  ];
  const evicted = findEvictionCandidate(entries);
  assertDeepEqual(evicted, { pageX: 1, pageY: 0, mip: 0 });
});

runner.test('LRU Eviction — retourne null si vide', () => {
  assertEqual(findEvictionCandidate([]), null);
});

// 13. Physics Fixed Timestep
runner.test('Physics — 3 steps avec dt=50ms et fixedDt=16ms', () => {
  // accumulator = 0 + 50 = 50, steps = floor(50/16) = 3
  // remainder = 50 - 48 = 2, alpha = 2/16 = 0.125
  const result = physicsAccumulator(0, 50, 16);
  assertEqual(result.steps, 3);
  assertApprox(result.alpha, 2 / 16, 0.001);
});

runner.test('Physics — 0 steps si dt < fixedDt', () => {
  const result = physicsAccumulator(0, 10, 16);
  assertEqual(result.steps, 0);
  assertApprox(result.alpha, 10 / 16, 0.001);
});

// 14. Spatial Audio
runner.test('Audio — source a droite donne pan positif', () => {
  const result = spatialAudio([0, 0, 0], [5, 0, 0]);
  assertTrue(result.pan > 0);
  assertApprox(result.gain, 1 / 5, 0.01);
});

runner.test('Audio — source a gauche donne pan negatif', () => {
  const result = spatialAudio([0, 0, 0], [-3, 0, 0]);
  assertTrue(result.pan < 0);
});

// 15. IK Look-At
runner.test('IK — cible devant (yaw=0, pitch=0)', () => {
  const result = ikLookAt([0, 0, 0], [0, 0, 5]);
  assertApprox(result.yaw, 0, 0.01);
  assertApprox(result.pitch, 0, 0.01);
});

runner.test('IK — cible en haut a droite', () => {
  const result = ikLookAt([0, 0, 0], [5, 5, 5]);
  assertTrue(result.yaw > 0);
  assertTrue(result.pitch > 0);
});

// 16. Animation State Machine
runner.test('Anim — transition idle -> walk quand speed actif', () => {
  const transitions: AnimTransition[] = [
    { from: 'idle', to: 'walk', condition: 'speed', crossfadeDuration: 0.2 },
    { from: 'walk', to: 'run', condition: 'fast', crossfadeDuration: 0.15 },
  ];
  const result = animStateMachine('idle', transitions, ['speed']);
  assertEqual(result.nextState, 'walk');
  assertEqual(result.crossfadeWeight, 0);
});

runner.test('Anim — pas de transition si condition non active', () => {
  const transitions: AnimTransition[] = [
    { from: 'idle', to: 'walk', condition: 'speed', crossfadeDuration: 0.2 },
  ];
  const result = animStateMachine('idle', transitions, []);
  assertEqual(result.nextState, 'idle');
  assertEqual(result.crossfadeWeight, 1);
});

// 17. Performance Budget
runner.test('Perf Budget — detecte systemes trop lents', () => {
  const timings: SystemTiming[] = [
    { name: 'physics', ms: 3 },
    { name: 'render', ms: 12 },
    { name: 'post-process', ms: 5 },
  ];
  const over = findOverBudgetSystems(timings, 4);
  assertDeepEqual(over, ['render', 'post-process']);
});

// 18. Frame Stats
runner.test('Frame Stats — min/avg/max FPS', () => {
  const frameTimes = [16, 20, 10, 16]; // FPS: 62.5, 50, 100, 62.5
  const stats = computeFrameStats(frameTimes);
  assertApprox(stats.minFPS, 50, 0.1);
  assertApprox(stats.maxFPS, 100, 0.1);
  assertApprox(stats.avgFPS, 68.75, 0.1);
});

// 19. Memory Leak Detector
runner.test('Memory — detecte allocations non liberees', () => {
  const allocs: Allocation[] = [
    { id: 'tex-001', bytes: 1024 },
    { id: 'buf-002', bytes: 512 },
    { id: 'tex-003', bytes: 2048 },
  ];
  const frees = ['tex-001', 'tex-003'];
  const leaks = detectLeaks(allocs, frees);
  assertDeepEqual(leaks, ['buf-002']);
});

runner.test('Memory — aucune fuite si tout est libere', () => {
  const allocs: Allocation[] = [
    { id: 'a', bytes: 100 },
    { id: 'b', bytes: 200 },
  ];
  const leaks = detectLeaks(allocs, ['a', 'b']);
  assertEqual(leaks.length, 0);
});

// 20. Quality Preset
runner.test('Quality — preset low', () => {
  const s = qualityPreset('low');
  assertEqual(s.shadowResolution, 512);
  assertFalse(s.ssaoEnabled);
  assertFalse(s.ssrEnabled);
  assertEqual(s.particleCount, 100);
  assertEqual(s.textureQuality, 'low');
});

runner.test('Quality — preset high', () => {
  const s = qualityPreset('high');
  assertEqual(s.shadowResolution, 2048);
  assertTrue(s.ssaoEnabled);
  assertTrue(s.ssrEnabled);
  assertEqual(s.particleCount, 2000);
  assertEqual(s.textureQuality, 'high');
});

runner.run();
