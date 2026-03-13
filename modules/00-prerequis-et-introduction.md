# 00 — Prerequis & Introduction a la 3D Web

| Difficulte | Duree estimee | Lab | Quiz |
|:----------:|:-------------:|:---:|:----:|
| 1/5        | 60 min        | --  | [Quiz 00](../quizzes/quiz-00-prerequis.html) |

## Objectifs pedagogiques

A la fin de ce module, vous serez capable de :

- Situer WebGL, WebGPU et Three.js dans l'ecosysteme 3D web
- Expliquer pourquoi le GPU est utilise pour le rendu graphique (parallelisme massif)
- Decrire l'architecture d'un GPU (cores, warps, memoire)
- Comparer la philosophie CPU (latence) vs GPU (throughput)
- Configurer un projet de base avec un canvas HTML et `requestAnimationFrame`
- Gerer le device pixel ratio pour un rendu net sur ecrans HiDPI

---

## Prerequis techniques

### TypeScript (bases)

Vous devez etre a l'aise avec les memes fondamentaux que pour un projet Vue.js :

```typescript
// Vous devez comprendre ce code sans difficulte
interface Vertex {
  position: [number, number, number];
  color: [number, number, number, number];
  uv: [number, number];
}

type BufferUsage = 'vertex' | 'index' | 'uniform';

async function loadShader(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Shader not found: ${url}`);
  return response.text();
}

// Generics — vous les connaissez deja avec Ref<T>, ComputedRef<T>
class TypedBuffer<T extends Float32Array | Uint16Array> {
  constructor(
    public readonly data: T,
    public readonly usage: BufferUsage,
  ) {}

  get byteLength(): number {
    return this.data.byteLength;
  }
}
```

### HTML Canvas

```html
<!-- Vous devez savoir manipuler un canvas -->
<canvas id="gl-canvas" width="800" height="600"></canvas>

<script>
  const canvas = document.getElementById('gl-canvas');
  const ctx = canvas.getContext('2d'); // On passera a 'webgl2' et 'webgpu'
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(10, 10, 100, 100);
</script>
```

### Environnement

- **Node.js** >= 20.0.0
- **pnpm** (gestionnaire de paquets)
- **VS Code** avec les extensions : WGSL (WebGPU Shading Language), glsl-literal
- **Navigateur** : Chrome 113+ (WebGPU) ou Firefox Nightly

---

## Installation & Setup

### 1. Cloner le depot

```bash
git clone https://github.com/votre-org/webgpu-3d-course.git
cd webgpu-3d-course
```

### 2. Installer les dependances

```bash
pnpm install
```

### 3. Verifier l'installation

```bash
# Lancer la documentation interactive
pnpm docs:dev

# Lancer un lab de test
pnpm tsx labs/test-utils.ts
```

### 4. Structure du projet

```
webgpu-3d-course/
├── modules/          # Modules de cours (theorie)
├── labs/             # Labs pratiques (exercice + solution)
├── quizzes/          # Quiz d'auto-evaluation
├── visualizations/   # Demos interactives HTML
├── screencasts/      # Captures video
├── scripts/          # Utilitaires de build
├── package.json
└── tsconfig.json
```

---

## L'ecosysteme 3D Web : timeline

```
EVOLUTION DES APIs 3D WEB
══════════════════════════════════════════════════════════════════

2011 ──── WebGL 1.0 (basé sur OpenGL ES 2.0)
│         → Premier acces GPU depuis le navigateur
│         → API bas-niveau, verbose, a base d'etats globaux
│
2017 ──── WebGL 2.0 (basé sur OpenGL ES 3.0)
│         → Instanced rendering, transform feedback
│         → 3D textures, multiple render targets
│         → Toujours la meme API a etats globaux
│
2018 ──── Three.js devient le standard de facto
│         → Abstraction haut-niveau au-dessus de WebGL
│         → Scene graph, materiaux, lumieres, chargeurs
│
2023 ──── WebGPU (W3C Specification)
│         → API moderne inspiree de Vulkan / Metal / Direct3D 12
│         → Compute shaders, pipeline explicite
│         → Meilleure performance multi-thread
│
2024+ ─── Three.js WebGPURenderer (experimental)
          → Three.js supporte WebGL ET WebGPU comme backend
```

---

## Analogie : le restaurant 3D

:::tip Analogie pour developpeurs Vue.js
Imaginez un **restaurant** :

- **WebGL** = Vous etes le cuisinier, le serveur, et le plongeur. Vous gerez chaque etat manuellement (quel couteau est actif, quel plat est en cours). C'est comme coder en JavaScript pur sans framework.
- **WebGPU** = Vous avez un systeme de tickets modernes. Vous decrivez ce que vous voulez (un pipeline), et le systeme optimise l'execution. C'est comme passer de jQuery a une approche declarative.
- **Three.js** = Vous etes le chef qui donne des ordres : "je veux une scene avec une lumiere et un cube rouge". Les details sont geres automatiquement. C'est comme Vue.js : vous decrivez le quoi, pas le comment.
:::

---

## WebGL vs WebGPU : comparaison detaillee

### Philosophie d'API

```
┌─────────────────────────────────────────────────────────────────┐
│                      WebGL (etat global)                        │
│                                                                 │
│  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);     // Etat global    │
│  gl.bufferData(gl.ARRAY_BUFFER, data, ...);  // Affecte l'etat │
│  gl.bindBuffer(gl.ARRAY_BUFFER, null);       // Nettoyer       │
│                                                                 │
│  → Similaire a un "this" mutable geant                         │
│  → L'ordre des appels compte enormement                        │
│  → Bugs subtils si on oublie de restaurer l'etat               │
├─────────────────────────────────────────────────────────────────┤
│                      WebGPU (descripteurs)                      │
│                                                                 │
│  const buffer = device.createBuffer({                           │
│    size: 256,                                                   │
│    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,     │
│  });                                                            │
│                                                                 │
│  → Objets immutables decrits a la creation                     │
│  → Pas d'etat global, pas d'effets de bord                     │
│  → Le driver peut optimiser en avance                          │
└─────────────────────────────────────────────────────────────────┘
```

### Comparaison technique

```typescript
// ── WebGL : creer et remplir un buffer ──────────────────
function createWebGLBuffer(gl: WebGL2RenderingContext, data: Float32Array): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error('Failed to create buffer');

  // Lier le buffer a un "slot" global
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

  // Ecrire les donnees dans le buffer lie
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

  // Bonne pratique : delier pour eviter les effets de bord
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  return buffer;
}

// ── WebGPU : creer et remplir un buffer ─────────────────
function createWebGPUBuffer(device: GPUDevice, data: Float32Array): GPUBuffer {
  // Tout est declare dans un descripteur — pas d'etat global
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });

  // Ecrire les donnees
  new Float32Array(buffer.getMappedRange()).set(data);
  buffer.unmap();

  return buffer;
}
```

:::warning Point cle
En WebGL, l'ordre des appels `gl.bindXxx()` / `gl.bindXxx(null)` est critique. Un oubli peut corrompre le rendu de facon silencieuse. WebGPU elimine cette classe entiere de bugs.
:::

### Tableau comparatif

| Critere | WebGL 2.0 | WebGPU |
|---------|-----------|--------|
| API style | Etat global mutable | Descripteurs immutables |
| Shader language | GLSL ES 3.0 | WGSL |
| Compute shaders | Non | Oui |
| Multi-thread | Non (un seul thread JS) | Oui (command buffers) |
| Validation | Runtime (erreurs silencieuses) | Build-time (erreurs explicites) |
| Support navigateur | Tous les navigateurs | Chrome 113+, Firefox 124+, Safari 18+ |
| Maturite | 13 ans, stable | Nouveau, en evolution |
| Abstraction | Bas-niveau | Moyen-niveau |
| Inspiration | OpenGL ES 2.0 / 3.0 | Vulkan / Metal / D3D12 |

---

## Three.js : la couche d'abstraction

Three.js est a WebGL/WebGPU ce que Vue.js est au DOM : une abstraction qui vous permet de travailler avec des concepts haut-niveau.

```typescript
// ── Sans Three.js (WebGL brut) : ~200 lignes pour un cube ──

// 1. Creer le contexte WebGL
// 2. Compiler les shaders GLSL (vertex + fragment)
// 3. Lier les shaders en un programme
// 4. Definir les 36 vertices du cube (6 faces x 2 triangles x 3 vertices)
// 5. Creer et remplir les buffers (position, couleur, normale)
// 6. Configurer les attributs de vertex
// 7. Creer les matrices (model, view, projection)
// 8. Uploader les matrices comme uniforms
// 9. Configurer depth test, backface culling
// 10. Dessiner avec gl.drawArrays ou gl.drawElements
// ... facilement 200+ lignes

// ── Avec Three.js : ~15 lignes pour le meme cube ──
import * as THREE from 'three';

// Scene = le "template" de votre composant 3D
const scene = new THREE.Scene();

// Camera = le "viewport" du navigateur
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;

// Renderer = le "moteur de rendu" (comme le virtual DOM de Vue)
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Mesh = Geometry + Material (comme un composant = template + style)
const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x00ff00 }),
);
scene.add(cube);

// Lumiere — sans lumiere, les objets sont noirs
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 5, 5);
scene.add(light);

// Boucle de rendu = le "render cycle" de Vue
function animate() {
  requestAnimationFrame(animate);
  cube.rotation.x += 0.01;
  cube.rotation.y += 0.01;
  renderer.render(scene, camera);
}
animate();
```

:::tip Analogie Vue.js
| Vue.js | Three.js |
|--------|----------|
| `createApp()` | `new THREE.WebGLRenderer()` |
| Template HTML | `THREE.Scene` + `THREE.Mesh` |
| Reactive data | Positions, rotations (mutables) |
| `watch()` / `computed()` | `requestAnimationFrame` loop |
| CSS styles | `THREE.Material` |
| DOM elements | `THREE.Mesh`, `THREE.Light` |
| `v-for` rendering | Instanced rendering |
:::

---

## GPU vs CPU : pourquoi le GPU pour le rendu

### Le probleme fondamental

Un ecran Full HD contient **1920 x 1080 = 2,073,600 pixels**. A 60 FPS, il faut calculer la couleur de chaque pixel **60 fois par seconde**, soit **~124 millions de calculs de couleur par seconde**.

Un CPU moderne a **8 a 16 cores**. Un GPU a **des milliers de cores**.

```
CPU vs GPU : architecture
═══════════════════════════════════════════════════════════

CPU (optimise pour la latence)
┌──────────────────────────────────────────────┐
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐    │
│  │Core 1│  │Core 2│  │Core 3│  │Core 4│    │  4-16 cores puissants
│  │ ALU  │  │ ALU  │  │ ALU  │  │ ALU  │    │
│  │      │  │      │  │      │  │      │    │
│  └──────┘  └──────┘  └──────┘  └──────┘    │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │          Grande cache L1/L2/L3       │    │  Cache enorme pour
│  │          (souvent > 50% de la puce)  │    │  predire et optimiser
│  └──────────────────────────────────────┘    │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │   Logique de controle complexe       │    │  Branch prediction,
│  │   (branch prediction, speculation)   │    │  out-of-order exec
│  └──────────────────────────────────────┘    │
└──────────────────────────────────────────────┘

GPU (optimise pour le throughput)
┌──────────────────────────────────────────────┐
│  ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐ │
│  │SM││SM││SM││SM││SM││SM││SM││SM││SM││SM│ │  Streaming
│  └──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘ │  Multiprocessors
│  ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐ │
│  │SM││SM││SM││SM││SM││SM││SM││SM││SM││SM│ │  Chaque SM contient
│  └──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘ │  32-128 "cores"
│  ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐ │
│  │SM││SM││SM││SM││SM││SM││SM││SM││SM││SM│ │  Total: 1000-16000+
│  └──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘ │  cores simples
│                                              │
│  ┌────────┐  Petite cache, logique simple    │
│  │ Cache  │  Pas de branch prediction        │
│  └────────┘  Meme instruction sur N donnees  │
└──────────────────────────────────────────────┘
```

### SIMD : Single Instruction, Multiple Data

```typescript
// Le GPU execute la MEME instruction sur des MILLIERS de donnees en parallele

// ── Sur CPU : traiter les pixels un par un ──────
function cpuProcessPixels(pixels: Float32Array, brightness: number): void {
  for (let i = 0; i < pixels.length; i++) {
    pixels[i] = pixels[i] * brightness; // Un pixel a la fois
  }
  // 2M pixels → 2M iterations sequentielles
}

// ── Sur GPU : traiter les pixels en parallele (pseudo-code) ──
// Le GPU lance 2M "threads" qui executent TOUS la meme instruction :
//
//   @fragment
//   fn main(@location(0) color: vec4f) -> @location(0) vec4f {
//     return color * brightness;  // Chaque thread traite 1 pixel
//   }
//
// 2M pixels → ~2M threads paralleles → termine en quelques microsecondes
```

:::tip Analogie web
C'est comme la difference entre :
- **CPU** : un serveur Express qui traite les requetes une par une (meme avec de l'async, un seul thread JS)
- **GPU** : un load balancer qui distribue les requetes sur 10,000 workers identiques en parallele
:::

---

## Architecture GPU en detail

### Hierarchie de calcul

```
HIERARCHIE D'EXECUTION GPU
═══════════════════════════════════════════════════════════

GPU
└── Streaming Multiprocessor (SM) x 30-80
    └── Warp (NVIDIA) / Wavefront (AMD) = 32 threads
        └── Thread (= 1 invocation de shader)

Exemple concret (RTX 4070) :
- 46 SM
- Chaque SM execute plusieurs warps simultanement
- Chaque warp = 32 threads en lockstep (SIMD)
- Total : ~5888 "CUDA cores"

Un fragment shader sur un ecran 1080p :
- 1920 x 1080 = 2,073,600 fragments
- Chaque fragment = 1 thread GPU
- 2,073,600 / 32 = 64,800 warps
- 64,800 / 46 SM = ~1,409 warps par SM
- Le scheduler GPU alterne entre les warps pour masquer la latence memoire
```

### Hierarchie memoire GPU

```
HIERARCHIE MEMOIRE GPU
═══════════════════════════════════════════════════════════

Rapidite ▲
         │  ┌─────────────────┐
         │  │   Registres     │  ~1 cycle    Prive par thread
         │  │   (32-64 KB/SM) │              Le plus rapide
         │  └────────┬────────┘
         │  ┌────────┴────────┐
         │  │  Shared Memory  │  ~5 cycles   Partage par workgroup
         │  │  (48-100 KB/SM) │              Programmable
         │  └────────┬────────┘
         │  ┌────────┴────────┐
         │  │   L2 Cache      │  ~30 cycles  Partage par GPU
         │  │   (4-6 MB)      │
         │  └────────┬────────┘
         │  ┌────────┴────────┐
         │  │     VRAM        │  ~300 cycles Global, grande capacite
         │  │  (8-24 GB)      │              (textures, buffers)
         │  └────────┬────────┘
         │  ┌────────┴────────┐
         │  │  RAM systeme    │  ~1000+ cyc  Via bus PCIe
         │  │  (via PCIe)     │              Le plus lent
         │  └─────────────────┘
         │
         └─────────────────────────────────► Capacite
```

### Le bus PCIe : le goulot d'etranglement

```typescript
// Le transfert CPU ↔ GPU passe par le bus PCIe
// PCIe 4.0 x16 : ~25 GB/s theorique, ~15-20 GB/s en pratique

// ❌ Anti-pattern : transferer des donnees a chaque frame
function renderBad(device: GPUDevice, vertices: Float32Array): void {
  // A chaque frame, on re-uploade les vertices → bottleneck PCIe
  const buffer = device.createBuffer({
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });
  new Float32Array(buffer.getMappedRange()).set(vertices);
  buffer.unmap();
  // ... draw ...
}

// ✅ Bonne pratique : uploader une fois, reutiliser
class StaticMeshBuffer {
  private buffer: GPUBuffer;

  constructor(device: GPUDevice, vertices: Float32Array) {
    // Upload une seule fois a l'initialisation
    this.buffer = device.createBuffer({
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.buffer.getMappedRange()).set(vertices);
    this.buffer.unmap();
  }

  getBuffer(): GPUBuffer {
    return this.buffer; // Reutilise a chaque frame — zero transfert PCIe
  }

  destroy(): void {
    this.buffer.destroy();
  }
}
```

:::warning Regle d'or
Minimisez les transferts CPU → GPU par frame. Uploadez les donnees statiques (geometrie, textures) une seule fois. Seules les donnees dynamiques (matrices de transformation, uniforms) doivent etre mises a jour a chaque frame — et elles sont petites (quelques centaines d'octets).
:::

---

## Latence vs Throughput

```
LATENCE vs THROUGHPUT
═══════════════════════════════════════════════════════════

CPU : optimise la LATENCE (temps pour UNE tache)
┌──────────────────────────────────────────────┐
│                                              │
│  Tache 1 ████████░░░░░░░░░░░░░░░░░░░░░░░░  │  Rapide pour
│  Tache 2 ░░░░░░░░████████░░░░░░░░░░░░░░░░  │  UNE tache
│  Tache 3 ░░░░░░░░░░░░░░░░████████░░░░░░░░  │
│  Tache 4 ░░░░░░░░░░░░░░░░░░░░░░░░████████  │
│                                              │
│  4 taches = 4 unites de temps                │
└──────────────────────────────────────────────┘

GPU : optimise le THROUGHPUT (nombre de taches par seconde)
┌──────────────────────────────────────────────┐
│                                              │
│  Tache 1    ████████████████████████████████ │  Plus lent pour
│  Tache 2    ████████████████████████████████ │  UNE tache, mais
│  Tache 3    ████████████████████████████████ │  toutes en parallele
│  Tache 4    ████████████████████████████████ │
│  ...                                         │
│  Tache 1000 ████████████████████████████████ │
│                                              │
│  1000 taches = 1-2 unites de temps           │
└──────────────────────────────────────────────┘
```

```typescript
// Demonstration de la difference latence vs throughput

// CPU : une multiplication est instantanee (~1 nanoseconde)
function cpuMultiply(a: number, b: number): number {
  return a * b; // 1 ns
}

// Mais multiplier 2 millions de nombres prend 2 ms :
function cpuMultiplyAll(data: Float32Array, factor: number): Float32Array {
  const result = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] * factor;
  }
  return result; // ~2 ms pour 2M elements
}

// GPU : une multiplication prend ~10 ns (pipeline overhead)
// Mais multiplier 2 millions de nombres prend aussi ~10 ns
// car les 2M multiplications s'executent en parallele !

// En WGSL (WebGPU Shading Language) :
// @compute @workgroup_size(256)
// fn main(@builtin(global_invocation_id) id: vec3u) {
//   data[id.x] = data[id.x] * factor;
// }
// → 2M threads lances simultanement
```

---

## Setup du projet : le canvas 3D

### Canvas HTML et contexte WebGPU

```typescript
// ── setup-canvas.ts ─────────────────────────────────────

/**
 * Initialise un canvas avec le bon device pixel ratio.
 *
 * Le device pixel ratio (DPR) est le rapport entre pixels CSS et pixels physiques.
 * - Ecran standard : DPR = 1 (1 pixel CSS = 1 pixel physique)
 * - Ecran Retina : DPR = 2 (1 pixel CSS = 4 pixels physiques)
 * - Smartphones : DPR = 2.5 a 3
 */
function setupCanvas(canvasId: string): {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
} {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  if (!canvas) throw new Error(`Canvas #${canvasId} not found`);

  const dpr = window.devicePixelRatio || 1;

  // Taille CSS (ce que l'utilisateur voit)
  const displayWidth = canvas.clientWidth;
  const displayHeight = canvas.clientHeight;

  // Taille du buffer interne (pixels reels)
  canvas.width = displayWidth * dpr;
  canvas.height = displayHeight * dpr;

  return {
    canvas,
    width: canvas.width,
    height: canvas.height,
  };
}

/**
 * Gere le redimensionnement du canvas.
 * Comme un composant Vue avec un watcher sur la taille de la fenetre.
 */
function handleResize(
  canvas: HTMLCanvasElement,
  onResize: (width: number, height: number) => void,
): () => void {
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const dpr = window.devicePixelRatio || 1;
      const width = entry.contentRect.width * dpr;
      const height = entry.contentRect.height * dpr;

      canvas.width = width;
      canvas.height = height;
      onResize(width, height);
    }
  });

  observer.observe(canvas);

  // Retourne une fonction de cleanup (comme onUnmounted en Vue)
  return () => observer.disconnect();
}
```

### requestAnimationFrame : la boucle de rendu

```typescript
// ── render-loop.ts ──────────────────────────────────────

/**
 * Boucle de rendu avec delta time.
 *
 * Analogue au "reactive system" de Vue :
 * - Vue re-rend quand les donnees changent (reactif)
 * - La 3D re-rend a chaque frame (60 FPS = toutes les 16.67ms)
 */
interface RenderContext {
  /** Temps ecoule depuis le dernier frame (en secondes) */
  deltaTime: number;
  /** Temps total depuis le debut (en secondes) */
  elapsed: number;
  /** Numero du frame */
  frame: number;
}

type RenderCallback = (ctx: RenderContext) => void;

function createRenderLoop(callback: RenderCallback): {
  start: () => void;
  stop: () => void;
} {
  let animationId: number | null = null;
  let lastTime = 0;
  let startTime = 0;
  let frame = 0;

  function loop(currentTime: number): void {
    if (startTime === 0) {
      startTime = currentTime;
      lastTime = currentTime;
    }

    const deltaTime = (currentTime - lastTime) / 1000; // ms → secondes
    const elapsed = (currentTime - startTime) / 1000;
    lastTime = currentTime;
    frame++;

    callback({ deltaTime, elapsed, frame });

    animationId = requestAnimationFrame(loop);
  }

  return {
    start() {
      if (animationId !== null) return; // Deja en cours
      animationId = requestAnimationFrame(loop);
    },
    stop() {
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
    },
  };
}

// ── Utilisation ──────────────────────────────────────────
const loop = createRenderLoop((ctx) => {
  // Animer un objet en fonction du temps (pas du framerate)
  const rotation = ctx.elapsed * Math.PI * 0.5; // 90 degres par seconde
  console.log(`Frame ${ctx.frame} | dt=${ctx.deltaTime.toFixed(3)}s | rotation=${rotation.toFixed(2)}`);
});

loop.start();
// loop.stop(); // Appeler pour arreter
```

:::tip Pourquoi deltaTime ?
Sans deltaTime, votre animation tournerait 2x plus vite sur un ecran 120 Hz que sur un ecran 60 Hz. Toujours multiplier vos vitesses par `deltaTime` pour un mouvement independant du framerate.
:::

### Initialisation WebGPU complete

```typescript
// ── init-webgpu.ts ──────────────────────────────────────

interface WebGPUContext {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  canvas: HTMLCanvasElement;
}

async function initWebGPU(canvasId: string): Promise<WebGPUContext> {
  // 1. Verifier le support WebGPU
  if (!navigator.gpu) {
    throw new Error(
      'WebGPU non supporte. Utilisez Chrome 113+ ou Firefox 124+.',
    );
  }

  // 2. Obtenir l'adapter (= la carte graphique)
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance', // Preferer le GPU dedie
  });
  if (!adapter) {
    throw new Error('Aucun adapter GPU trouve.');
  }

  // 3. Obtenir le device (= la connexion logique au GPU)
  const device = await adapter.requestDevice({
    requiredFeatures: [],
    requiredLimits: {},
  });

  // Log des capacites
  console.log('GPU Adapter:', adapter.info);
  console.log('Max texture size:', device.limits.maxTextureDimension2D);
  console.log('Max buffer size:', device.limits.maxBufferSize);

  // 4. Gerer les erreurs GPU
  device.lost.then((info) => {
    console.error('GPU device lost:', info.message);
    if (info.reason !== 'destroyed') {
      // Re-initialiser
      initWebGPU(canvasId);
    }
  });

  // 5. Configurer le canvas
  const { canvas } = setupCanvas(canvasId);
  const context = canvas.getContext('webgpu');
  if (!context) throw new Error('Impossible d\'obtenir le contexte WebGPU');

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format,
    alphaMode: 'premultiplied',
  });

  return { device, context, format, canvas };
}
```

---

## Exercice pratique

### Enonce

Creez une page HTML avec un canvas qui :
1. S'initialise avec le bon device pixel ratio
2. Affiche les informations du GPU dans la console
3. Lance une boucle de rendu qui efface le canvas avec une couleur qui change dans le temps

<details>
<summary>Voir la solution</summary>

```typescript
// ── exercice-00-solution.ts ─────────────────────────────

async function main(): Promise<void> {
  // Initialisation
  const { device, context, format, canvas } = await initWebGPU('gl-canvas');

  console.log('Canvas size:', canvas.width, 'x', canvas.height);
  console.log('Preferred format:', format);

  // Boucle de rendu
  const loop = createRenderLoop((ctx) => {
    // Couleur qui oscille dans le temps
    const r = Math.sin(ctx.elapsed * 0.5) * 0.5 + 0.5;
    const g = Math.sin(ctx.elapsed * 0.7 + 1.0) * 0.5 + 0.5;
    const b = Math.sin(ctx.elapsed * 0.3 + 2.0) * 0.5 + 0.5;

    // Obtenir la texture de sortie (le "back buffer")
    const textureView = context.getCurrentTexture().createView();

    // Creer un command encoder (comme un batch de commandes)
    const encoder = device.createCommandEncoder();

    // Creer un render pass qui efface le canvas
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        clearValue: { r, g, b, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    pass.end();

    // Soumettre les commandes au GPU
    device.queue.submit([encoder.finish()]);
  });

  loop.start();

  // Gerer le redimensionnement
  handleResize(canvas, (width, height) => {
    console.log('Resized to:', width, 'x', height);
  });
}

main().catch(console.error);
```

</details>

---

## Resume

| Concept | Explication |
|---------|-------------|
| WebGL | API 3D web basee sur OpenGL ES, etat global mutable, mature |
| WebGPU | API 3D web moderne, descripteurs immutables, compute shaders |
| Three.js | Abstraction haut-niveau (scene graph) au-dessus de WebGL/WebGPU |
| GPU cores | Des milliers de cores simples, optimises pour le parallelisme |
| SIMD | Une instruction executee sur des milliers de donnees en parallele |
| Warp/Wavefront | Groupe de 32 threads GPU executant la meme instruction |
| VRAM | Memoire dediee du GPU, rapide mais limitee (8-24 GB) |
| Bus PCIe | Goulot d'etranglement pour les transferts CPU ↔ GPU |
| Latence vs Throughput | CPU optimise la latence, GPU optimise le throughput |
| Device Pixel Ratio | Rapport pixels CSS / pixels physiques (Retina = 2) |
| requestAnimationFrame | Synchronise le rendu avec le taux de rafraichissement ecran |
| deltaTime | Temps entre deux frames, crucial pour des animations fluides |

---

## Pour aller plus loin

- [WebGPU Specification (W3C)](https://www.w3.org/TR/webgpu/)
- [WebGPU Fundamentals](https://webgpufundamentals.org/)
- [Three.js Documentation](https://threejs.org/docs/)
- [GPU Gems (NVIDIA)](https://developer.nvidia.com/gpugems/gpugems/contributors)
- [Life of a triangle (Fabian Giesen)](https://fgiesen.wordpress.com/2011/07/09/a-trip-through-the-graphics-pipeline-2011-part-1/)
