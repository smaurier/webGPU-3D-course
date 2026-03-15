# Module 28 — Virtual textures et texture streaming

| Difficulte | Duree estimee | Lab | Quiz |
|:----------:|:-------------:|:---:|:----:|
| 5/5        | 180 min       | [Lab 28](../labs/lab-28-virtual-textures-streaming/) | [Quiz 28](../quizzes/quiz-28-virtual-textures-streaming.html) |

## Objectifs pedagogiques

A la fin de ce module, vous serez capable de :

- Expliquer pourquoi les scenes massives necessitent du texture streaming
- Decrire l'architecture d'un système de virtual texturing (page table, page cache, feedback)
- Implementer une page table avec indirection texture
- Gérer un cache LRU de pages physiques en VRAM
- Utiliser un feedback buffer pour déterminer les pages visibles
- Comprendre les formats de compression GPU-native (BC7, ASTC, ETC2) et Basis Universal / KTX2
- Créer un atlas de textures dynamique avec gestion du padding
- Intégrer un système de streaming simplifie dans Three.js
- Mesurer les metriques de performance (resident ratio, page faults, VRAM usage)

---

<details>
<summary>Rappel du cours précédent — Audio 3D spatial (Module 27)</summary>

Au module 27, nous avons ajoute la dimension sonore a nos scenes 3D :

- **Web Audio API** : AudioContext, audio graph (source -> effets -> destination), AudioBuffer
- **Spatialisation** : PannerNode avec position 3D, AudioListener synchronise avec la camera
- **HRTF** : Head-Related Transfer Function pour un rendu binaural realiste
- **Effets audio** : ConvolverNode (reverb), BiquadFilter (lowpass/highpass), DelayNode (echo)
- **Three.js audio** : THREE.AudioListener, THREE.PositionalAudio attache à un Object3D
- **AnalyserNode** : visualisation des frequences et de la forme d'onde

Nous allons maintenant résoudre un problème fondamental des scenes massives : comment afficher des gigaoctets de textures quand la VRAM n'en contient que quelques-uns.

</details>

---

## Le problème : trop de textures, pas assez de VRAM

:::tip Analogie
Imagine une bibliotheque gigantesque avec des millions de livres (tes textures). Tu ne peux pas tous les mettre sur ton bureau (la VRAM). Mais tu n'as jamais besoin de tous les livres en même temps. Le virtual texturing, c'est comme un bibliothecaire intelligent qui regarde par-dessus ton epaule, voit quel chapitre tu vas lire, et le pose sur ton bureau juste avant que tu en aies besoin — tout en rangeant les chapitres que tu ne regardes plus.
:::

```
Scene open-world typique :
━━━━━━━━━━━━━━━━━━━━━━━━━
Terrain 4K tiles × 3 textures PBR = ~192 Mo par tile → Teraoctets total
Ville : 10 000 batiments × 80 Mo chacun = ~800 Go total
Photogrammetrie : 50-200 Go par scan

VRAM disponible : 4-24 Go (GPU), encore moins en WebGPU
→ On ne peut charger que 0.1% a 1% des textures
→ Il faut un systeme intelligent de chargement/dechargement
```

| Approche | Principe | Limitations |
|----------|----------|-------------|
| **Mip mapping classique** | Charger toutes les mip levels | Tout en mémoire |
| **LOD textures** | Basse-res pour objets loin | Popping visible |
| **Megatextures (id Tech 5)** | Une seule enorme texture virtuelle | Complexe, pas de tiling |
| **Virtual texturing** | Pages à la demandé, cache GPU | Flexible, standard moderne |
| **Sparse textures** | Allocation GPU partielle (hardware) | Pas encore dans WebGPU |

---

## Megatextures : l'ancetre

```
Megatexture (id Tech 5, RAGE 2011)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Taille virtuelle : 128 000 × 128 000 pixels (~60 Go)
Decoupage en pages de 128×128 pixels :

┌────┬────┬────┬────┐
│ P0 │ P1 │ P2 │ P3 │  Mip level 0 (full res)
├────┼────┼────┼────┤
│ P4 │ P5 │ P6 │ P7 │  (des milliers de pages)
└────┴────┴────┴────┘

┌──────┬──────┐         ┌────────────┐
│  Q0  │  Q1  │  Mip 1  │     R0     │  Mip 2
└──────┴──────┘         └────────────┘

On ne charge que les pages visibles au bon mip level.
Limitations : pre-processing enorme, pas de tiling, stockage massif.
→ L'industrie a evolue vers le Virtual Texturing generalise.
```

---

## Virtual texturing : architecture

```
Pipeline complet
━━━━━━━━━━━━━━━━

  Feedback Pass (GPU)     → Quelles pages UV sont visibles ?
        │ readback (GPU→CPU)
        ▼
  Page Request (CPU)      → Identifier les pages manquantes
        │ fetch / decode
        ▼
  Page Cache (CPU→GPU)    → Upload dans le pool physique (LRU)
        │ update
        ▼
  Page Table Update (GPU) → Mettre a jour la texture d'indirection
        │
        ▼
  Rendu Final (GPU)       → Shader lit page table → page physique
```

### Page table : la texture d'indirection

:::tip Analogie
La page table, c'est comme une table des matieres. Quand tu cherches le chapitre 7, tu regardes la table des matieres qui dit "chapitre 7 → page 142". La page table est une petite texture qui dit au shader "cette zone UV → cette page physique dans le cache".
:::

```
Espace virtuel (UV) :              Page Table :           Cache physique :
┌────┬────┬────┬────┐             ┌──┬──┬──┬──┐         ┌────┬────┬────┬────┐
│ V0 │ V1 │ V2 │ V3 │   lookup   │  │  │  │  │  remap  │ P2 │ P7 │ P0 │ P5 │
├────┼────┼────┼────┤  ───────→  ├──┼──┼──┼──┤ ──────→ ├────┼────┼────┼────┤
│ V4 │ V5 │ V6 │ V7 │             │  │  │  │  │         │ P3 │ P1 │ P4 │ P6 │
└────┴────┴────┴────┘             └──┴──┴──┴──┘         └────┴────┴────┴────┘

Chaque pixel de la page table = RGBA :
  R = position X dans le cache physique
  G = position Y dans le cache physique
  B = mip level charge
  A = flag valide

Taille : virtualSize / pageSize (ex: 16384/128 = 128×128 pixels)
```

```typescript
interface VirtualTextureConfig {
  virtualSize: number;  // ex: 16384
  pageSize: number;     // ex: 128
  cacheSize: number;    // ex: 1024 pages
  mipLevels: number;
}

function createPageTable(config: VirtualTextureConfig): {
  tableSize: number; data: Uint8Array;
} {
  const tableSize = config.virtualSize / config.pageSize;
  const data = new Uint8Array(tableSize * tableSize * 4);
  // Initialiser avec fallback vers mip le plus bas
  for (let i = 0; i < tableSize * tableSize; i++) {
    data[i * 4 + 2] = config.mipLevels - 1;  // Mip level fallback
  }
  return { tableSize, data };
}
```

### Page cache : pool LRU en VRAM

```typescript
class PageCacheLRU {
  private capacity: number;
  private pages: Map<string, { vx: number; vy: number; mip: number; slot: number; frame: number }> = new Map();
  private freeSlots: number[] = [];
  private currentFrame: number = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    for (let i = capacity - 1; i >= 0; i--) this.freeSlots.push(i);
  }

  private key(vx: number, vy: number, mip: number): string { return `${vx}_${vy}_${mip}`; }
  has(vx: number, vy: number, mip: number): boolean { return this.pages.has(this.key(vx, vy, mip)); }

  access(vx: number, vy: number, mip: number): number | null {
    const p = this.pages.get(this.key(vx, vy, mip));
    if (p) { p.frame = this.currentFrame; return p.slot; }
    return null;
  }

  insert(vx: number, vy: number, mip: number): { slot: number; evicted: { vx: number; vy: number; mip: number } | null } {
    let slot: number;
    let evicted: { vx: number; vy: number; mip: number } | null = null;

    if (this.freeSlots.length > 0) {
      slot = this.freeSlots.pop()!;
    } else {
      // Evincer le LRU
      let oldest = Infinity; let oldestKey = '';
      for (const [k, p] of this.pages) {
        if (p.frame < oldest) { oldest = p.frame; oldestKey = k; }
      }
      const ep = this.pages.get(oldestKey)!;
      evicted = { vx: ep.vx, vy: ep.vy, mip: ep.mip };
      slot = ep.slot;
      this.pages.delete(oldestKey);
    }

    this.pages.set(this.key(vx, vy, mip), { vx, vy, mip, slot, frame: this.currentFrame });
    return { slot, evicted };
  }

  advanceFrame(): void { this.currentFrame++; }
  get used(): number { return this.pages.size; }
}
```

### Feedback buffer : quelles pages sont visibles

```
Feedback : rendre la scene en basse resolution (1/4 ou 1/8).
Chaque pixel ecrit (pageX, pageY, mipLevel) au lieu de la couleur.
Le CPU readback le buffer et identifie les pages manquantes.
```

```wgsl
// Feedback fragment shader
@fragment
fn feedback_fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let virtual_size = 16384.0;
  let page_size = 128.0;
  let pages_per_side = virtual_size / page_size;

  // Mip level via derivees screen-space
  let dx = dpdx(uv) * virtual_size;
  let dy = dpdy(uv) * virtual_size;
  let d = max(length(dx), length(dy));
  let mip = clamp(floor(log2(d / page_size)), 0.0, 7.0);

  let mip_scale = pow(2.0, mip);
  let page_x = floor(uv.x * pages_per_side / mip_scale);
  let page_y = floor(uv.y * pages_per_side / mip_scale);

  return vec4f(page_x, page_y, mip, 1.0);
}
```

### Mip-level selection

```
Si 1 texel ≈ 1 pixel ecran → mip 0 (full res)
Si 4 texels ≈ 1 pixel      → mip 1 (demi-res suffit)
Si 16 texels ≈ 1 pixel     → mip 2 (quart-res suffit)
Calcul : mipLevel = log2(max(|dU/dx|, |dV/dy|) × textureSize / pageSize)
Plus l'objet est loin → mip level plus eleve → moins de donnees a charger
```

---

## Clipmap : alternative simplifiee

```
Stack de niveaux de detail centres sur la camera (ideal pour terrains) :

┌─────────────────────────────────────────┐
│        Mip 3 (basse res, loin)          │
│   ┌─────────────────────────────┐       │
│   │     Mip 2 (moyenne res)     │       │
│   │  ┌───────────────────┐      │       │
│   │  │   Mip 1            │      │       │
│   │  │  ┌───────────┐    │      │       │
│   │  │  │ Mip 0     │    │      │       │
│   │  │  │ Camera *  │    │      │       │
│   │  │  └───────────┘    │      │       │
│   │  └───────────────────┘      │       │
│   └─────────────────────────────┘       │
└─────────────────────────────────────────┘

Chaque niveau = meme taille en pixels, mais couvre 2x plus de monde.
Quand la camera bouge, on met a jour les bords (streaming de lignes/colonnes).
```

---

## Texture streaming pipeline

### Budget VRAM et priority queue

```typescript
class TextureStreamingManager {
  private budgetBytes: number;
  private usedBytes: number = 0;
  private pending: Array<{ textureId: string; mipLevel: number; priority: number; size: number }> = [];
  private activeLoads = new Set<string>();

  constructor(budgetMB: number = 256) { this.budgetBytes = budgetMB * 1024 * 1024; }

  calculatePriority(screenCoverage: number, currentMip: number, desiredMip: number, distance: number): number {
    return screenCoverage * 1000 + (currentMip - desiredMip) * 100 - distance * 0.1;
  }

  async processQueue(): Promise<void> {
    this.pending.sort((a, b) => b.priority - a.priority);
    while (this.pending.length > 0 && this.activeLoads.size < 4) {
      const req = this.pending.shift()!;
      if (this.usedBytes + req.size > this.budgetBytes) this.evictLowPriority(req.size);
      const key = `${req.textureId}_${req.mipLevel}`;
      this.activeLoads.add(key);
      this.loadTexture(req).then(() => { this.activeLoads.delete(key); this.usedBytes += req.size; });
    }
    if (this.pending.length > 100) this.pending.length = 100;
  }

  private async loadTexture(_req: { textureId: string; mipLevel: number }): Promise<void> { /* fetch + decode + upload */ }
  private evictLowPriority(_needed: number): void { /* decharger les textures les moins prioritaires */ }
}
```

### Async upload : staging buffer vers GPU texture

```typescript
function uploadPageToGPU(
  device: GPUDevice, queue: GPUQueue, pageData: Uint8Array,
  targetTexture: GPUTexture, destX: number, destY: number, pageSize: number
): void {
  // Methode simple : writeTexture
  queue.writeTexture(
    { texture: targetTexture, origin: { x: destX, y: destY, z: 0 } },
    pageData,
    { bytesPerRow: pageSize * 4, rowsPerImage: pageSize },
    { width: pageSize, height: pageSize }
  );

  // Methode performante : staging buffer (non-bloquant)
  const staging = device.createBuffer({
    size: pageData.byteLength,
    usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.MAP_WRITE,
    mappedAtCreation: true,
  });
  new Uint8Array(staging.getMappedRange()).set(pageData);
  staging.unmap();
  const enc = device.createCommandEncoder();
  enc.copyBufferToTexture(
    { buffer: staging, bytesPerRow: pageSize * 4 },
    { texture: targetTexture, origin: { x: destX, y: destY, z: 0 } },
    { width: pageSize, height: pageSize }
  );
  queue.submit([enc.finish()]);
  staging.destroy();
}
```

### Progressive loading

```
Frame 1 :  mip 7 (1×1)      → Instantane     [████] Flou
Frame 5 :  mip 4 (16×16)    → Tres rapide    [▓▓▓▓]
Frame 10 : mip 2 (256×256)  → Rapide         [▒▒▒▒]
Frame 30 : mip 0 (4096×4096) → Si visible    [░░░░] Net

L'utilisateur voit une version floue qui se "sharpen" progressivement.
```

---

## Basis Universal / KTX2

```
Le dilemme de la compression texture :
  PNG/JPEG : bon pour le transfert, mais le GPU doit decoder → 4x la taille en VRAM
  GPU-natif (BC7/ASTC/ETC2) : le GPU lit directement, 4-8x moins de VRAM
    Mais chaque GPU supporte un format different !

Solution : Basis Universal (fichier .ktx2)
  Un seul fichier → transcode a runtime vers BC7 (desktop) / ASTC (mobile) / ETC2 (ancien)
```

| Format | Bits/pixel | Ratio vs RGBA32 | Support |
|--------|:----------:|:----------------:|---------|
| **RGBA32** (non compresse) | 32 | 1x | Tous |
| **BC7** | 8 | 4x | Desktop moderne |
| **ASTC 4x4** | 8 | 4x | Mobile moderne |
| **ETC2** | 8 | 4x | OpenGL ES 3.0+ |
| **Basis Universal** | Variable | 4-8x | Transcode vers tout |

```typescript
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

const ktx2Loader = new KTX2Loader();
ktx2Loader.setTranscoderPath('/libs/basis/');
ktx2Loader.detectSupport(renderer);
const texture = await ktx2Loader.loadAsync('/textures/terrain.ktx2');
// → Transcode automatiquement, 4x moins de VRAM
```

---

## Texture atlasing avance

```typescript
class DynamicTextureAtlas {
  private device: GPUDevice;
  private texture: GPUTexture;
  private size: number;
  private padding: number;
  private regions: Map<string, { x: number; y: number; width: number; height: number }> = new Map();
  private freeRects: Array<{ x: number; y: number; width: number; height: number }> = [];

  constructor(device: GPUDevice, size: number, padding: number = 2) {
    this.device = device;
    this.size = size;
    this.padding = padding;
    this.texture = device.createTexture({
      size: [size, size], format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.freeRects.push({ x: 0, y: 0, width: size, height: size });
  }

  /** Guillotine bin packing */
  allocate(id: string, w: number, h: number): { x: number; y: number } | null {
    const pw = w + this.padding * 2; const ph = h + this.padding * 2;
    let bestIdx = -1; let bestArea = Infinity;
    for (let i = 0; i < this.freeRects.length; i++) {
      const r = this.freeRects[i];
      if (r.width >= pw && r.height >= ph && r.width * r.height < bestArea) {
        bestArea = r.width * r.height; bestIdx = i;
      }
    }
    if (bestIdx === -1) return null;
    const chosen = this.freeRects.splice(bestIdx, 1)[0];
    const region = { x: chosen.x + this.padding, y: chosen.y + this.padding, width: w, height: h };
    this.regions.set(id, region);
    // Split : droite et bas
    if (chosen.width - pw > 0) this.freeRects.push({ x: chosen.x + pw, y: chosen.y, width: chosen.width - pw, height: ph });
    if (chosen.height - ph > 0) this.freeRects.push({ x: chosen.x, y: chosen.y + ph, width: chosen.width, height: chosen.height - ph });
    return { x: region.x, y: region.y };
  }

  getUVTransform(id: string): { offsetU: number; offsetV: number; scaleU: number; scaleV: number } | null {
    const r = this.regions.get(id);
    if (!r) return null;
    return { offsetU: r.x / this.size, offsetV: r.y / this.size, scaleU: r.width / this.size, scaleV: r.height / this.size };
  }
}
```

```
Padding : eviter les artefacts de filtrage bilineaire aux bords
  Sans padding : le filtre melange 2 textures adjacentes → artefact
  Avec padding (2px) : le filtre echantillonne dans la bordure clamp → propre
```

---

## Implementation WebGPU : shader d'indirection

```wgsl
@group(0) @binding(0) var page_table: texture_2d<f32>;
@group(0) @binding(1) var page_table_sampler: sampler;
@group(0) @binding(2) var page_cache: texture_2d<f32>;
@group(0) @binding(3) var page_cache_sampler: sampler;

struct VTUniforms { virtual_size: f32, page_size: f32, cache_size: f32, pages_per_row: f32 }
@group(0) @binding(4) var<uniform> vt: VTUniforms;

@fragment
fn main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let pages_count = vt.virtual_size / vt.page_size;
  let page_uv = uv * pages_count;
  let page_xy = floor(page_uv);

  // Indirection : lire la page table
  let table_uv = (page_xy + 0.5) / pages_count;
  let entry = textureSample(page_table, page_table_sampler, table_uv);
  let phys_x = entry.r * 255.0;
  let phys_y = entry.g * 255.0;

  if (entry.a < 0.5) { return vec4f(1.0, 0.0, 1.0, 1.0); }  // Page manquante = magenta

  // Lire le cache physique
  let intra_page = fract(page_uv);
  let cache_uv = (vec2f(phys_x, phys_y) + intra_page) / vt.pages_per_row;
  return textureSample(page_cache, page_cache_sampler, cache_uv);
}
```

---

## Implementation Three.js

### DataTexture pour la page table et le cache

```typescript
import * as THREE from 'three';

class ThreeVirtualTexture {
  private pageTable: THREE.DataTexture;
  private pageCache: THREE.DataTexture;
  private ptSize: number;
  private cacheGrid: number;
  private pageSize: number;

  constructor(virtualSize: number = 16384, pageSize: number = 128, cacheGrid: number = 16) {
    this.pageSize = pageSize;
    this.cacheGrid = cacheGrid;
    this.ptSize = virtualSize / pageSize;

    // Page table : petite texture RGBA (Nearest pour pas interpoler les index)
    const ptData = new Uint8Array(this.ptSize * this.ptSize * 4);
    this.pageTable = new THREE.DataTexture(ptData, this.ptSize, this.ptSize, THREE.RGBAFormat);
    this.pageTable.minFilter = THREE.NearestFilter;
    this.pageTable.magFilter = THREE.NearestFilter;
    this.pageTable.needsUpdate = true;

    // Page cache : grande texture = cacheGrid × pageSize pixels de cote
    const cachePx = cacheGrid * pageSize;
    const cacheData = new Uint8Array(cachePx * cachePx * 4);
    this.pageCache = new THREE.DataTexture(cacheData, cachePx, cachePx, THREE.RGBAFormat);
    this.pageCache.minFilter = THREE.LinearFilter;
    this.pageCache.magFilter = THREE.LinearFilter;
    this.pageCache.needsUpdate = true;
  }

  /** Copier les pixels d'une page dans le cache a un slot donne */
  writePage(pagePixels: Uint8Array, slot: number): void {
    const px = (slot % this.cacheGrid) * this.pageSize;
    const py = Math.floor(slot / this.cacheGrid) * this.pageSize;
    const cacheW = this.cacheGrid * this.pageSize;
    const dst = this.pageCache.image.data as Uint8Array;

    for (let row = 0; row < this.pageSize; row++) {
      const srcOff = row * this.pageSize * 4;
      const dstOff = ((py + row) * cacheW + px) * 4;
      dst.set(pagePixels.subarray(srcOff, srcOff + this.pageSize * 4), dstOff);
    }
    this.pageCache.needsUpdate = true;
  }

  /** Mettre a jour une entree de la page table */
  updateEntry(vx: number, vy: number, physX: number, physY: number, valid: boolean): void {
    const data = this.pageTable.image.data as Uint8Array;
    const i = (vy * this.ptSize + vx) * 4;
    data[i] = physX; data[i + 1] = physY; data[i + 2] = 0; data[i + 3] = valid ? 255 : 0;
    this.pageTable.needsUpdate = true;
  }

  /** ShaderMaterial avec indirection page table → cache */
  createMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        pageTable: { value: this.pageTable },
        pageCache: { value: this.pageCache },
        pagesPerSide: { value: this.ptSize },
        cacheGrid: { value: this.cacheGrid },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D pageTable, pageCache;
        uniform float pagesPerSide, cacheGrid;
        varying vec2 vUv;
        void main() {
          vec2 pUV = vUv * pagesPerSide;
          vec2 pXY = floor(pUV);
          vec4 e = texture2D(pageTable, (pXY + 0.5) / pagesPerSide);
          if (e.a < 0.5) { gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0); return; }
          vec2 cUV = (vec2(e.r * 255.0, e.g * 255.0) + fract(pUV)) / cacheGrid;
          gl_FragColor = texture2D(pageCache, cUV);
        }
      `,
    });
  }
}
```

### LoadingManager pour le streaming réseau

```typescript
class TexturePageLoader {
  private baseUrl: string;
  private loading = new Map<string, Promise<Uint8Array>>();

  constructor(baseUrl: string) { this.baseUrl = baseUrl; }

  async loadPage(textureId: string, px: number, py: number, mip: number): Promise<Uint8Array> {
    const key = `${textureId}_${px}_${py}_${mip}`;
    const existing = this.loading.get(key);
    if (existing) return existing;

    const promise = (async () => {
      const url = `${this.baseUrl}/${textureId}/mip${mip}/page_${px}_${py}.bin`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Page introuvable: ${url}`);
      return new Uint8Array(await response.arrayBuffer());
    })();

    this.loading.set(key, promise);
    try { return await promise; } finally { this.loading.delete(key); }
  }
}
```

---

## Cas d'usage

### Terrain open-world

```
Monde : 10 km × 10 km, 1 texel = 1 cm
  Total : ~12 To | Budget VRAM : 256 Mo
  Strategie :
    1. Decouper en tiles de 256×256 texels
    2. Generer tous les mip levels
    3. Stocker en KTX2 + Zstandard → ~500 Go sur disque
    4. A runtime : camera voit ~2% du monde
       → ~4000 tiles de 256×256 BC7 = ~250 Mo
       Le reste en mip bas (quelques Ko)
  Resultat : 12 To de textures, 256 Mo en VRAM.
```

### Photogrammetrie

```
Scan 3D de sites reels :
  Mesh : 10-100M triangles → simplifier (LOD) pour le web
  Textures : 50-200 Go en 8K par morceau
  Pipeline : simplifier mesh → projeter textures → pages virtuelles
             → KTX2/Basis → CDN avec HTTP range requests → VT
  Cas : musees virtuels, patrimoine, immobilier, cinema
```

### Ville avec milliers de batiments

```
10 000 batiments × 5-10 textures PBR
  Priority queue : frustum culling + screen-space coverage
  Charger mip 0 seulement pour les batiments a < 50m
  Mip 2-3 pour 50-200m, mip 5+ au-dela
  Eviction : des que le joueur tourne la camera,
  les batiments derriere sont downgrades en mip bas
```

---

## Metriques et debugging

```typescript
interface VTMetrics {
  residentRatio: number;     // Pages en cache / pages visibles (> 95% = sain)
  pageFaultRate: number;     // Pages manquantes par frame (< 5 = sain)
  vramUsageMB: number;       // Memoire GPU consommee
  loadLatencyMs: number;     // Temps moyen de chargement (< 50ms = sain)
  cacheUtilization: number;  // Slots utilises / totaux (70-95% = sain)
}

// Debug views utiles :
// 1. Page Table view : pixels colores = page chargee, noir = manquante
// 2. Mip level view : rouge=mip 0, jaune=mip 2-3, bleu=mip 5+
// 3. Page fault view : magenta = page manquante
```

---

## Pratique

### Exercice VT.1 — Système de virtual texturing simplifie

Implementer un système complet :
1. Texture virtuelle 2048x2048 en pages de 128x128 (= 16x16 pages)
2. Cache physique de 8x8 pages (64 slots max)
3. Feedback simule (distance camera → centre de chaque page)
4. Chargement progressif avec LRU eviction
5. Shader d'indirection (page table → cache physique)
6. Metriques en temps réel

```typescript
// TODO: PageCacheLRU (cache LRU)
// TODO: Page table (DataTexture 16×16 RGBA)
// TODO: Cache physique (DataTexture 1024×1024 = 8×8 pages de 128)
// TODO: Generer des pages procedurales (couleur = f(pageX, pageY))
// TODO: Simuler le feedback : pages visibles = distance camera < seuil
// TODO: Chaque frame : feedback → charger manquantes → update page table → rendre
// TODO: HUD avec resident ratio, page faults, cache usage
```

<details>
<summary>Solution</summary>

```typescript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const VIRTUAL_SIZE = 2048;
const PAGE_SIZE = 128;
const PT_SIZE = VIRTUAL_SIZE / PAGE_SIZE;  // 16
const CACHE_GRID = 8;
const CACHE_PX = CACHE_GRID * PAGE_SIZE;   // 1024

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 5, 8);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.AmbientLight(0xffffff, 1));

// LRU Cache
class LRU {
  entries = new Map<string, { slot: number; frame: number }>();
  free: number[] = [];
  constructor(cap: number) { for (let i = cap - 1; i >= 0; i--) this.free.push(i); }
  has(k: string) { return this.entries.has(k); }
  touch(k: string, f: number) { const e = this.entries.get(k); if (e) e.frame = f; }
  insert(k: string, f: number): { slot: number; evictedKey: string | null } {
    if (this.free.length > 0) { const s = this.free.pop()!; this.entries.set(k, { slot: s, frame: f }); return { slot: s, evictedKey: null }; }
    let ok = ''; let of = Infinity;
    for (const [key, v] of this.entries) if (v.frame < of) { of = v.frame; ok = key; }
    const s = this.entries.get(ok)!.slot; this.entries.delete(ok);
    this.entries.set(k, { slot: s, frame: f });
    return { slot: s, evictedKey: ok };
  }
}
const lru = new LRU(CACHE_GRID * CACHE_GRID);

// Page Table texture
const ptData = new Uint8Array(PT_SIZE * PT_SIZE * 4);
const pageTable = new THREE.DataTexture(ptData, PT_SIZE, PT_SIZE, THREE.RGBAFormat);
pageTable.minFilter = THREE.NearestFilter;
pageTable.magFilter = THREE.NearestFilter;

// Cache texture
const cacheData = new Uint8Array(CACHE_PX * CACHE_PX * 4);
const pageCache = new THREE.DataTexture(cacheData, CACHE_PX, CACHE_PX, THREE.RGBAFormat);
pageCache.minFilter = THREE.LinearFilter;
pageCache.magFilter = THREE.LinearFilter;

// Generate procedural page
function genPage(px: number, py: number): Uint8Array {
  const d = new Uint8Array(PAGE_SIZE * PAGE_SIZE * 4);
  const r = (px * 37 + py * 13) % 256, g = (px * 59 + py * 97) % 256, b = (px * 23 + py * 71) % 256;
  for (let y = 0; y < PAGE_SIZE; y++) for (let x = 0; x < PAGE_SIZE; x++) {
    const i = (y * PAGE_SIZE + x) * 4;
    const ck = ((Math.floor(x / 16) + Math.floor(y / 16)) % 2) * 30;
    d[i] = Math.min(255, r + ck + (x >> 1)); d[i + 1] = Math.min(255, g + ck + (y >> 1));
    d[i + 2] = Math.min(255, b + ck); d[i + 3] = 255;
    if (x < 2 || y < 2 || x >= PAGE_SIZE - 2 || y >= PAGE_SIZE - 2) { d[i] = 255; d[i + 1] = 255; d[i + 2] = 0; }
  }
  return d;
}

function writeToCache(pixels: Uint8Array, slot: number): void {
  const sx = (slot % CACHE_GRID) * PAGE_SIZE;
  const sy = Math.floor(slot / CACHE_GRID) * PAGE_SIZE;
  for (let row = 0; row < PAGE_SIZE; row++) {
    const src = row * PAGE_SIZE * 4;
    const dst = ((sy + row) * CACHE_PX + sx) * 4;
    cacheData.set(pixels.subarray(src, src + PAGE_SIZE * 4), dst);
  }
  pageCache.needsUpdate = true;
}

function updatePT(px: number, py: number, phX: number, phY: number, valid: boolean): void {
  const i = (py * PT_SIZE + px) * 4;
  ptData[i] = phX; ptData[i + 1] = phY; ptData[i + 2] = 0; ptData[i + 3] = valid ? 255 : 0;
  pageTable.needsUpdate = true;
}

// Virtual texture material
const vtMat = new THREE.ShaderMaterial({
  uniforms: {
    pageTableTex: { value: pageTable }, pageCacheTex: { value: pageCache },
    pagesPerSide: { value: PT_SIZE }, cacheGrid: { value: CACHE_GRID },
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D pageTableTex, pageCacheTex;
    uniform float pagesPerSide, cacheGrid;
    varying vec2 vUv;
    void main() {
      vec2 pUV = vUv * pagesPerSide;
      vec2 pXY = floor(pUV);
      vec4 e = texture2D(pageTableTex, (pXY + 0.5) / pagesPerSide);
      if (e.a < 0.5) { gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0); return; }
      vec2 cUV = (vec2(e.r * 255.0, e.g * 255.0) + fract(pUV)) / cacheGrid;
      gl_FragColor = texture2D(pageCacheTex, cUV);
    }`,
});

const plane = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), vtMat);
plane.rotation.x = -Math.PI / 2;
scene.add(plane);
scene.add(new THREE.GridHelper(10, 10, 0x444444, 0x333333));

// HUD
const hud = document.createElement('div');
hud.style.cssText = 'position:fixed;top:10px;left:10px;background:rgba(0,0,0,0.8);color:#0f0;font:13px monospace;padding:10px;border-radius:4px';
document.body.appendChild(hud);

// Main loop
let frame = 0;
const raycaster = new THREE.Raycaster();

function animate(): void {
  requestAnimationFrame(animate);
  frame++;

  // Feedback simule
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hits = raycaster.intersectObject(plane);
  let faults = 0; let visible = 0;

  if (hits.length > 0 && hits[0].uv) {
    const cu = hits[0].uv.x * PT_SIZE;
    const cv = hits[0].uv.y * PT_SIZE;
    for (let py = 0; py < PT_SIZE; py++) for (let px = 0; px < PT_SIZE; px++) {
      if (Math.hypot(px - cu, py - cv) > 6) continue;
      visible++;
      const k = `${px}_${py}`;
      if (lru.has(k)) { lru.touch(k, frame); }
      else {
        faults++;
        const { slot, evictedKey } = lru.insert(k, frame);
        writeToCache(genPage(px, py), slot);
        updatePT(px, py, slot % CACHE_GRID, Math.floor(slot / CACHE_GRID), true);
        if (evictedKey) {
          const [ex, ey] = evictedKey.split('_').map(Number);
          updatePT(ex, ey, 0, 0, false);
        }
      }
    }
  }

  const resident = visible > 0 ? ((visible - faults) / visible * 100).toFixed(1) : '100.0';
  hud.innerHTML = `<b>Virtual Texture Streaming</b><br>Resident: ${resident}%<br>Faults: ${faults}/frame<br>Cache: ${lru.entries.size}/${CACHE_GRID * CACHE_GRID}<br>Visible: ${visible} pages`;

  controls.update();
  renderer.render(scene, camera);
}
animate();
```

</details>

---

## Résumé

| Concept | Description | Complexite |
|---------|-------------|:----------:|
| **Virtual texturing** | Charger uniquement les pages visibles | Système complet |
| **Page table** | Texture d'indirection (UV → position physique) | Petite texture RGBA |
| **Page cache** | Pool LRU de pages physiques en VRAM | Budget fixe |
| **Feedback buffer** | Rendu basse-res pour pages visibles | 1/4 ou 1/8 res |
| **Mip-level selection** | Resolution selon derivees screen-space | dpdx/dpdy |
| **Clipmap** | Stack de niveaux centres sur camera | Pour terrains |
| **Basis Universal / KTX2** | Compression GPU-native universelle | BC7/ASTC/ETC2 |
| **Atlas dynamique** | Bin packing + allocation/liberation runtime | Guillotine |
| **Padding** | Bordure anti-artefact filtrage bilineaire | 1-4 pixels |
| **Progressive loading** | Mip bas d'abord, monter en qualite | Flou → net |
| **Staging buffer** | Upload async CPU→GPU non-bloquant | copyBufferToTexture |

| Metrique | Seuil sain |
|----------|:----------:|
| **Resident ratio** | > 95% |
| **Page fault rate** | < 5/frame |
| **Load latency** | < 50ms |
| **Cache utilization** | 70-95% |
| **Evictions/frame** | < 3 |

---

## Navigation

| Précédent | Suivant |
|:---------:|:-------:|
| [27 - Audio 3D spatial](./27-audio-3d-spatial.md) | [29 - A venir](./29-a-venir.md) |

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 28 virtual textures](../screencasts/screencast-28-virtual-textures.md)
2. **Lab** : [lab-28-virtual-textures](../labs/lab-28-virtual-textures/)
3. **Quiz** : [quiz 28 virtual textures](../quizzes/quiz-28-virtual-textures.html)
:::
