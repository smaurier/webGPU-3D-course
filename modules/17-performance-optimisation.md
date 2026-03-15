# Module 17 — Performance et optimisation

| Difficulte | Duree estimee | Lab | Quiz |
|:----------:|:-------------:|:---:|:----:|
| 4/5        | 120 min       | [Lab 17](../labs/lab-17-performance-optimisation/) | [Quiz 17](../quizzes/quiz-17-performance-optimisation.html) |

## Objectifs pedagogiques

A la fin de ce module, vous serez capable de :

- Mesurer les metriques de performance 3D : FPS, draw calls, triangles, mémoire GPU
- Utiliser stats.js et `renderer.info` pour le monitoring en temps réel
- Exploiter le frustum culling et le Level of Detail (LOD) pour reduire la charge GPU
- Optimiser les draw calls avec InstancedMesh et le merge de geometries
- Compresser les assets (Draco, KTX2, atlasing de textures)
- Appliquer le dispose pattern pour éviter les fuites mémoire
- Deporter le rendu dans un Web Worker avec OffscreenCanvas
- Profiler le GPU avec Chrome DevTools et Spector.js
- Comprendre le batching par materiau et par distance
- Configurer THREE.WebGPURenderer et découvrir TSL (Three.js Shading Language)
- Définir et respecter un budget de performance (16ms / 8ms par frame)

---

<details>
<summary>Rappel du cours précédent — Post-processing et effets (Module 16)</summary>

Au module 16, nous avons explore les effets visuels et les interactions :

- **EffectComposer** : pipeline de post-processing par chaine de passes
- **Passes standard** : RenderPass, UnrealBloomPass, SSAOPass, BokehPass, SMAAPass
- **ShaderPass** : écrire ses propres effets (vignette, color grading, film grain, chromatic aberration)
- **OutputPass** : tone mapping + encoding sRGB en dernière passe
- **WebGLRenderTarget** : render-to-texture, depth texture
- **Points + PointsMaterial** : particules CPU avec BufferGeometry
- **GPUComputationRenderer** : simulation de particules sur GPU (GPGPU)
- **Sprites** : plans toujours face camera pour effets et icones
- **CSS2DRenderer / CSS3DRenderer** : overlays HTML sur la scene 3D
- **Raycaster** : picking d'objets, interactions souris/touch

Ces effets sont visuellement spectaculaires mais coutent cher en GPU. Ce module vous apprend a les utiliser sans tuer les performances.

</details>

---

## Le budget performance

### Analogie : le budget d'un film

Un realisateur à un budget fixe pour son film. Chaque scene couteuse (explosions, figurants, decors) consomme une partie du budget. S'il dépasse, le film ne sortira pas a temps. En 3D temps réel, le budget est le **temps par frame** :

```
60 FPS  →  16.67 ms par frame   (standard)
120 FPS →   8.33 ms par frame   (VR, gaming haute performance)
30 FPS  →  33.33 ms par frame   (minimum acceptable)

Budget 16ms :
┌──────────────────────────────────────────────────────────┐
│  JavaScript (CPU)  │    GPU Rendering    │  Compositing  │
│     4 ms           │      10 ms          │    2 ms       │
├────────────────────┴─────────────────────┴───────────────┤
│                    16.67 ms total                         │
└──────────────────────────────────────────────────────────┘

Si le GPU prend 12ms pour le rendu + 8ms pour le post-processing = 20ms
→ On depasse le budget → framerate < 60 FPS → stuttering visible
```

### Ou va le temps ?

```
Cote CPU (JavaScript) :
  - Mise a jour des animations (AnimationMixer)
  - Calcul de physique
  - Traversee de la scene (frustum culling)
  - Callbacks JavaScript, event handlers
  - Preparation des draw calls (state sorting)

Cote GPU :
  - Vertex processing (transformation de chaque triangle)
  - Rasterisation (conversion triangles → pixels)
  - Fragment processing (shaders, textures, eclairage)
  - Post-processing (bloom, SSAO, etc.)
  - Transferts memoire (upload de textures/geometries)
```

---

## Metriques et monitoring

### stats.js : FPS, MS, MB

```typescript
import Stats from 'three/addons/libs/stats.module.js';

// ─── Setup ────────────────────────────────────────────────
const stats = new Stats();
stats.showPanel(0); // 0 = FPS, 1 = ms par frame, 2 = memoire MB
document.body.appendChild(stats.dom);

// Positionner dans un coin
stats.dom.style.position = 'absolute';
stats.dom.style.top = '0';
stats.dom.style.left = '0';

// ─── Utiliser dans le render loop ─────────────────────────
function animate(): void {
  stats.begin(); // debut de la mesure

  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);

  stats.end(); // fin de la mesure
}
```

### renderer.info : statistiques detaillees

```typescript
// ─── Afficher les stats du renderer chaque seconde ────────
setInterval(() => {
  const info = renderer.info;

  console.log('─── Renderer Info ───');
  console.log(`Draw calls  : ${info.render.calls}`);
  console.log(`Triangles   : ${info.render.triangles.toLocaleString()}`);
  console.log(`Points      : ${info.render.points.toLocaleString()}`);
  console.log(`Lines       : ${info.render.lines}`);
  console.log(`Geometries  : ${info.memory.geometries}`);
  console.log(`Textures    : ${info.memory.textures}`);
  console.log(`Programs    : ${info.programs?.length ?? 0}`);
}, 1000);
```

### Panel de debug complet

Combinez `stats.js` et `renderer.info` dans un panel HTML personnalise :

```typescript
class PerformanceMonitor {
  private container: HTMLDivElement;
  private samples: number[] = [];
  private lastTime = performance.now();

  constructor(private renderer: THREE.WebGLRenderer) {
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position:fixed; top:10px; right:10px; background:rgba(0,0,0,0.85);
      color:#0f0; font:12px monospace; padding:10px; border-radius:4px; z-index:9999;
    `;
    document.body.appendChild(this.container);
  }

  update(): void {
    const now = performance.now();
    this.samples.push(now - this.lastTime);
    this.lastTime = now;
    if (this.samples.length > 60) this.samples.shift();

    const avg = this.samples.reduce((a, b) => a + b) / this.samples.length;
    const info = this.renderer.info;
    const budget = ((avg / 16.67) * 100).toFixed(0);

    this.container.innerHTML = `
      ${(1000 / avg).toFixed(0)} FPS — ${avg.toFixed(1)}ms (${budget}% budget)<br>
      DC: ${info.render.calls} | Tri: ${info.render.triangles.toLocaleString()}<br>
      Geo: ${info.memory.geometries} | Tex: ${info.memory.textures}
    `;
  }
}
```

---

## Frustum culling

### Le concept

Le frustum culling elimine automatiquement les objets qui sont en dehors du champ de vision de la camera. Three.js le fait **automatiquement** pour chaque objet dont `frustumCulled = true` (valeur par defaut).

```
           Camera frustum (pyramide tronquee)
            ╱─────────────────────────╲
           ╱                           ╲
          ╱    [A] ✓ visible            ╲
         ╱         [B] ✓ visible         ╲
        ╱                                 ╲
       ╱───────────────────────────────────╲

  [C] ✗ hors champ       [D] ✗ derriere la camera

  A et B sont rendus, C et D sont ignores → moins de draw calls
```

```typescript
// ─── Frustum culling est actif par defaut ─────────────────
mesh.frustumCulled = true; // valeur par defaut

// ─── Desactiver pour les objets globaux ───────────────────
skybox.frustumCulled = false; // le skybox doit toujours etre rendu
particles.frustumCulled = false; // systeme de particules global

// ─── Bounding sphere ──────────────────────────────────────
// Three.js utilise la bounding sphere pour le test rapide
// Si la sphere est trop grande, le culling est inefficace
mesh.geometry.computeBoundingSphere();
console.log('Bounding sphere radius:', mesh.geometry.boundingSphere?.radius);

// Pour les objets dynamiques qui changent de forme :
mesh.geometry.computeBoundingBox();
mesh.geometry.computeBoundingSphere();
```

:::warning Problème courant : objet invisible
Si un objet disparait quand la camera bouge, sa bounding sphere est probablement incorrecte. Cela arrive souvent avec les SkinnedMesh ou les objets deformes par shader. Solutions :
```typescript
// Option 1 : recalculer la bounding sphere
skinnedMesh.geometry.computeBoundingSphere();

// Option 2 : desactiver le frustum culling
skinnedMesh.frustumCulled = false;
```
:::

---

## LOD (Level of Detail)

### Le principe

Pourquoi afficher un personnage avec 50 000 triangles s'il est a 200 metres et fait 3 pixels a l'ecran ? Le LOD affiche des versions simplifiees des objets en fonction de la distance :

```
Distance 0-10m   :  Mesh haute qualite   (50 000 triangles)
Distance 10-50m  :  Mesh moyenne qualite  (5 000 triangles)
Distance 50m+    :  Mesh basse qualite    (500 triangles)
Distance 200m+   :  Sprite ou rien

Gain : de 50 000 a 500 triangles pour les objets eloignes
```

### THREE.LOD

```typescript
import * as THREE from 'three';

// ─── Creer un LOD avec 3 niveaux ──────────────────────────
const lod = new THREE.LOD();

// Niveau 0 : haute qualite (proche)
const highDetail = new THREE.Mesh(
  new THREE.SphereGeometry(1, 64, 32),
  new THREE.MeshStandardMaterial({ color: 0x44aaff })
);
lod.addLevel(highDetail, 0);    // affiche a partir de distance 0

// Niveau 1 : qualite moyenne
const mediumDetail = new THREE.Mesh(
  new THREE.SphereGeometry(1, 16, 8),
  new THREE.MeshStandardMaterial({ color: 0x44aaff })
);
lod.addLevel(mediumDetail, 15);  // affiche a partir de distance 15

// Niveau 2 : basse qualite (loin)
const lowDetail = new THREE.Mesh(
  new THREE.SphereGeometry(1, 6, 4),
  new THREE.MeshStandardMaterial({ color: 0x44aaff, flatShading: true })
);
lod.addLevel(lowDetail, 40);    // affiche a partir de distance 40

lod.position.set(0, 1, -20);
scene.add(lod);

// ─── Mettre a jour le LOD dans le render loop ────────────
// IMPORTANT : autoUpdate est true par defaut, mais si vous
// le desactivez, appelez lod.update(camera) manuellement
lod.autoUpdate = true;
```

### Générer les niveaux de LOD automatiquement

```typescript
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js';

function createLODFromMesh(
  originalMesh: THREE.Mesh,
  levels: Array<{ ratio: number; distance: number }>
): THREE.LOD {
  const lod = new THREE.LOD();
  const modifier = new SimplifyModifier();

  // Niveau 0 : original
  lod.addLevel(originalMesh.clone(), 0);

  // Niveaux simplifies
  for (const level of levels) {
    const simplified = originalMesh.clone();
    const targetCount = Math.floor(
      originalMesh.geometry.attributes.position.count * level.ratio
    );

    try {
      simplified.geometry = modifier.modify(simplified.geometry, targetCount);
      lod.addLevel(simplified, level.distance);
    } catch (e) {
      console.warn(`Simplification echouee pour ratio ${level.ratio}`, e);
    }
  }

  return lod;
}

// Utilisation
const characterLOD = createLODFromMesh(characterMesh, [
  { ratio: 0.5, distance: 20 },   // 50% des vertices a 20m
  { ratio: 0.15, distance: 50 },  // 15% des vertices a 50m
  { ratio: 0.05, distance: 100 }, // 5% des vertices a 100m
]);
scene.add(characterLOD);
```

---

## Instancing : reduire les draw calls

### Rappel InstancedMesh

Comme vu au module 15, `InstancedMesh` dessine N copies en un seul draw call. C'est la technique la plus efficace pour reduire les draw calls :

```typescript
// ─── Benchmark : sans vs avec instancing ──────────────────
// Sans instancing : 1000 cubes = 1000 draw calls
for (let i = 0; i < 1000; i++) {
  const mesh = new THREE.Mesh(geometry, material); // ❌ 1000 draw calls
  mesh.position.set(Math.random() * 100, 0, Math.random() * 100);
  scene.add(mesh);
}

// Avec instancing : 1000 cubes = 1 draw call
const instancedMesh = new THREE.InstancedMesh(geometry, material, 1000); // ✅ 1 draw call
const dummy = new THREE.Object3D();
for (let i = 0; i < 1000; i++) {
  dummy.position.set(Math.random() * 100, 0, Math.random() * 100);
  dummy.updateMatrix();
  instancedMesh.setMatrixAt(i, dummy.matrix);
}
instancedMesh.instanceMatrix.needsUpdate = true;
scene.add(instancedMesh);
```

| Méthode | 1 000 objets | 10 000 objets | 100 000 objets |
|---------|:------------:|:-------------:|:--------------:|
| Mesh individuel | ~1000 DC, 60 FPS | ~10000 DC, 15 FPS | Crash |
| InstancedMesh | 1 DC, 60 FPS | 1 DC, 60 FPS | 1 DC, 45 FPS |

*(DC = draw calls)*

---

## Merge de geometries statiques

### BufferGeometryUtils.mergeGeometries

Pour les objets statiques qui partagent le même materiau mais ont des geometries différentes, on peut les fusionner en une seule geometrie :

```typescript
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ─── Fusionner plusieurs geometries ───────────────────────
const geometries: THREE.BufferGeometry[] = [];

for (let i = 0; i < 500; i++) {
  const geo = new THREE.BoxGeometry(
    0.5 + Math.random() * 2,
    0.5 + Math.random() * 4,
    0.5 + Math.random() * 2
  );

  // Positionner la geometrie AVANT le merge
  const matrix = new THREE.Matrix4();
  matrix.makeTranslation(
    (Math.random() - 0.5) * 100,
    0,
    (Math.random() - 0.5) * 100
  );
  geo.applyMatrix4(matrix);

  geometries.push(geo);
}

// Un seul mesh pour tous les blocs
const mergedGeometry = mergeGeometries(geometries, false);
const mergedMesh = new THREE.Mesh(
  mergedGeometry,
  new THREE.MeshStandardMaterial({ color: 0x888888 })
);
scene.add(mergedMesh);

// Nettoyer les geometries individuelles
geometries.forEach((geo) => geo.dispose());

console.log(
  `500 blocs fusionnes : ${mergedGeometry.attributes.position.count} vertices, 1 draw call`
);
```

:::warning Limites du merge
- Tous les objets doivent partager le **même materiau**
- Les objets fusionnes ne peuvent plus etre deplacer individuellement
- Le frustum culling s'applique au mesh fusionne entier (moins efficace)
- Ideal pour les decors statiques : murs, sols, vegetation
:::

### Instancing vs Merge : quand utiliser quoi ?

| Critere | InstancedMesh | mergeGeometries |
|---------|:-------------:|:---------------:|
| Même geometrie | Oui (obligatoire) | Non (geometries différentes OK) |
| Même materiau | Oui | Oui |
| Objets deplacables | Oui (setMatrixAt) | Non (fige) |
| Frustum culling individuel | Non | Non |
| Couleur par objet | Oui (setColorAt) | Non |
| Cas d'usage | Foret, foule, cailloux | Decor statique, batiments, terrain |

---

## Optimisation des textures

### Principes

```
┌────────────────────────────────────────────────────────────┐
│              Cout memoire des textures                      │
│                                                            │
│  Resolution   Format    Memoire VRAM                       │
│  ─────────────────────────────────────                     │
│  256x256      RGBA8     256 Ko                             │
│  512x512      RGBA8     1 Mo                               │
│  1024x1024    RGBA8     4 Mo                               │
│  2048x2048    RGBA8     16 Mo                              │
│  4096x4096    RGBA8     64 Mo    ← une seule texture !     │
│                                                            │
│  Avec KTX2/Basis :                                         │
│  4096x4096    BC7       16 Mo    ← 4x moins en VRAM       │
│                                                            │
│  Avec mipmaps (auto-generes par Three.js) :                │
│  × 1.33 de memoire supplementaire                          │
└────────────────────────────────────────────────────────────┘
```

### Bonnes pratiques

```typescript
// ─── 1. Resolution adaptee a la taille d'affichage ────────
// Un objet qui fait 100px a l'ecran n'a pas besoin de textures 4K
// Regle : resolution ≈ 2x la taille d'affichage maximale en pixels

// ─── 2. Compression KTX2 pour les gros assets ────────────
// Voir module 15 pour la configuration de KTX2Loader

// ─── 3. Texture atlas : combiner plusieurs textures ──────
// Au lieu de 10 textures 512x512 (10 draw calls) :
// 1 atlas 2048x2048 avec UVs ajustes (1 draw call)

// ─── 4. Channels packing ─────────────────────────────────
// Combiner roughness (R), metalness (G), AO (B) en une seule texture
// au lieu de 3 textures separees

// ─── 5. Power of 2 ──────────────────────────────────────
// Les textures doivent etre en puissance de 2 : 256, 512, 1024, 2048, 4096
// Sinon Three.js les redimensionne (cout CPU + perte de qualite)

// ─── 6. Anisotropic filtering ─────────────────────────────
texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
// Ameliore la nettete des textures vues en angle (sols, murs)
// Cout GPU quasi nul, amelioration visible significative
```

### Precharger et réutiliser les textures

```typescript
// ─── Cache de textures ────────────────────────────────────
class TextureCache {
  private cache: Map<string, THREE.Texture> = new Map();
  private loader = new THREE.TextureLoader();

  async load(url: string): Promise<THREE.Texture> {
    if (this.cache.has(url)) {
      return this.cache.get(url)!;
    }

    const texture = await this.loader.loadAsync(url);
    this.cache.set(url, texture);
    return texture;
  }

  dispose(): void {
    for (const texture of this.cache.values()) {
      texture.dispose();
    }
    this.cache.clear();
  }
}

const textureCache = new TextureCache();

// La meme texture est partagee entre tous les objets qui l'utilisent
const tex = await textureCache.load('/textures/brick_albedo.jpg');
material1.map = tex;
material2.map = tex; // meme reference, pas de doublon en VRAM
```

---

## Le dispose pattern

### Le problème des fuites mémoire

En JavaScript, le garbage collector nettoie la mémoire automatiquement. Mais les ressources GPU (geometries, textures, materiaux, render targets) ne sont **pas** gerees par le GC. Si vous ne les disposez pas manuellement, elles restent en VRAM indefiniment.

```
Fuite typique :
  1. Charger un modele (10 Mo VRAM)
  2. Retirer le modele de la scene (scene.remove)
  3. Le modele n'est plus visible... mais 10 Mo restent en VRAM
  4. Repeter 100x → 1 Go de VRAM gaspille → crash GPU
```

### Dispose correct

```typescript
// ─── Disposer un mesh complet ─────────────────────────────
function disposeMesh(mesh: THREE.Mesh): void {
  // 1. Retirer de la scene
  mesh.parent?.remove(mesh);

  // 2. Disposer la geometrie
  mesh.geometry.dispose();

  // 3. Disposer le/les materiau(x)
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) {
    // Disposer chaque texture du materiau
    for (const key of Object.keys(material)) {
      const value = (material as Record<string, unknown>)[key];
      if (value instanceof THREE.Texture) {
        value.dispose();
      }
    }
    material.dispose();
  }
}

// ─── Disposer un sous-arbre complet ───────────────────────
function disposeHierarchy(root: THREE.Object3D): void {
  // Traverser en partant des feuilles
  const toDispose: THREE.Object3D[] = [];
  root.traverse((node) => toDispose.push(node));

  for (const node of toDispose) {
    if (node instanceof THREE.Mesh) {
      disposeMesh(node);
    } else if (node instanceof THREE.Points) {
      node.geometry.dispose();
      (node.material as THREE.Material).dispose();
    }
    node.parent?.remove(node);
  }
}

// ─── Disposer un modele glTF charge ───────────────────────
function disposeGLTF(gltfScene: THREE.Group): void {
  disposeHierarchy(gltfScene);
}
```

### Disposer un render target

```typescript
// ─── WebGLRenderTarget ────────────────────────────────────
function disposeRenderTarget(target: THREE.WebGLRenderTarget): void {
  target.texture.dispose();
  if (target.depthTexture) {
    target.depthTexture.dispose();
  }
  target.dispose();
}

// ─── EffectComposer (contient des render targets internes) ─
function disposeComposer(composer: EffectComposer): void {
  composer.renderTarget1.dispose();
  composer.renderTarget2.dispose();
  for (const pass of composer.passes) {
    if ('dispose' in pass && typeof pass.dispose === 'function') {
      pass.dispose();
    }
  }
}
```

### Vérifier les fuites

```typescript
// ─── Avant/apres pour detecter les fuites ─────────────────
function logMemorySnapshot(label: string): void {
  const info = renderer.info;
  console.log(`[${label}]`);
  console.log(`  Geometries : ${info.memory.geometries}`);
  console.log(`  Textures   : ${info.memory.textures}`);
}

logMemorySnapshot('Avant chargement');
const gltf = await loader.loadAsync('/models/city.glb');
scene.add(gltf.scene);
logMemorySnapshot('Apres chargement');

// ... plus tard, quand on retire le modele :
disposeHierarchy(gltf.scene);
logMemorySnapshot('Apres dispose');
// Les compteurs doivent revenir aux valeurs initiales
```

---

## OffscreenCanvas : rendu dans un Worker

### Le problème du main thread

Le rendu 3D et le JavaScript partagent le même thread. Si la scene est lourde, l'UI (boutons, scrolling, input) devient lente. La solution : deporter le rendu dans un **Web Worker** avec `OffscreenCanvas`.

```
┌─── Main Thread ─────────────────────────────────────────┐
│  UI, event listeners, DOM manipulation                   │
│  Leger, toujours reactif                                 │
└─────────────────────────────────────────────────────────┘
        │ Messages (postMessage)
        ▼
┌─── Worker Thread ───────────────────────────────────────┐
│  Three.js, rendu 3D, animations, physique               │
│  Peut prendre 100% du CPU sans bloquer l'UI              │
└─────────────────────────────────────────────────────────┘
```

### Implementation

```typescript
// ─── main.ts (main thread) ───────────────────────────────
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const offscreen = canvas.transferControlToOffscreen();

const worker = new Worker(new URL('./renderWorker.ts', import.meta.url), { type: 'module' });

// Transferer le canvas au worker (le main thread perd l'acces)
worker.postMessage(
  { type: 'init', canvas: offscreen, width: window.innerWidth, height: window.innerHeight },
  [offscreen]
);

// Proxifier les events vers le worker
window.addEventListener('resize', () => {
  worker.postMessage({ type: 'resize', width: window.innerWidth, height: window.innerHeight });
});
```

```typescript
// ─── renderWorker.ts (worker thread) ─────────────────────
import * as THREE from 'three';

let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;

self.addEventListener('message', (event: MessageEvent) => {
  const { type, canvas, width, height } = event.data;
  if (type === 'init') {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(width, height, false); // false = ne pas toucher au CSS
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.set(0, 5, 10);
    // ... ajouter vos objets ...
    animate();
  } else if (type === 'resize') {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }
});

function animate(): void {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
```

:::warning Limitations d'OffscreenCanvas
- Pas d'acces au DOM depuis le Worker (pas de CSS2DRenderer, pas de stats.js classique)
- Les events doivent etre proxifies depuis le main thread
- OrbitControls nécessité un wrapper adapte (`three/addons/controls/OrbitControls.js` ne marche pas directement)
- Support navigateur : Chrome, Edge, Firefox. Safari support partiel.
:::

---

## GPU profiling

### Chrome DevTools : Performance tab

```
1. Ouvrir DevTools (F12)
2. Onglet Performance
3. Cocher "Screenshots" et "GPU" (si dispo)
4. Cliquer Record, interagir avec la scene, cliquer Stop
5. Analyser :
   - Frame chart : chaque barre = un frame
   - Les barres qui depassent la ligne 16ms = frames lentes
   - Section "GPU" : temps passe dans les commandes GPU
   - Section "Main" : temps JavaScript
```

### Spector.js : inspecteur WebGL

```typescript
// ─── Installation ─────────────────────────────────────────
// Extension Chrome : "Spector.js"
// OU via npm :
// npm install spectorjs

import { Spector } from 'spectorjs';

const spector = new Spector();
spector.displayUI(); // affiche un bouton de capture

// Cliquer sur le bouton pour capturer un frame :
// - Tous les draw calls avec leurs parametres
// - L'etat WebGL complet a chaque draw call
// - Les shaders compiles
// - Les textures utilisees
// - Le contenu de chaque framebuffer
```

### Metriques a surveiller

| Metrique | Bon | Moyen | Mauvais | Comment ameliorer |
|----------|:---:|:-----:|:-------:|-------------------|
| FPS | 60+ | 30-60 | <30 | Reduire la complexite |
| Draw calls | <100 | 100-500 | >500 | Instancing, merge, batching |
| Triangles | <500K | 500K-2M | >2M | LOD, simplification |
| Textures VRAM | <256 Mo | 256-512 Mo | >512 Mo | Compression KTX2, résolution |
| Frame time | <12ms | 12-16ms | >16ms | Profiler et optimiser le bottleneck |

---

## Batching et tri

### Tri par materiau

Chaque changement de materiau GPU (shader, textures, blend mode) est couteux. Grouper les objets par materiau reduit ces changements :

```typescript
// ─── Three.js fait du tri automatique mais on peut l'aider ─

// Mauvais : materiaux alternes
// Objet A (mat1) → Objet B (mat2) → Objet C (mat1) → Objet D (mat2)
// = 4 changements de materiau

// Bon : grouper par materiau
// Objet A (mat1) → Objet C (mat1) → Objet B (mat2) → Objet D (mat2)
// = 2 changements de materiau

// Three.js trie automatiquement les opaques par materiau,
// mais l'utilisation de materiaux uniques pour chaque objet tue la perf

// ─── Reutiliser les materiaux ─────────────────────────────
// ❌ Mauvais : un materiau par objet
for (let i = 0; i < 100; i++) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x44aaff }); // 100 materiaux !
  scene.add(new THREE.Mesh(geometry, mat));
}

// ✅ Bon : un materiau partage
const sharedMaterial = new THREE.MeshStandardMaterial({ color: 0x44aaff });
for (let i = 0; i < 100; i++) {
  scene.add(new THREE.Mesh(geometry, sharedMaterial)); // 1 materiau
}
```

### Tri par distance

Three.js trie automatiquement :
- **Opaques : front-to-back** — les pixels proches sont rendus en premier, les lointains echouent au depth test (early-Z rejection, economise du fragment processing)
- **Transparents : back-to-front** — nécessaire pour un alpha blending correct

```typescript
// Forcer l'ordre de rendu pour des cas speciaux
mesh.renderOrder = 0;           // rendu en premier
transparentMesh.renderOrder = 10; // rendu apres

// Pour un controle fin, utiliser les layers
opaqueObjects.forEach((obj) => obj.layers.set(0));
transparentObjects.forEach((obj) => obj.layers.set(1));
```

---

## WebGPU Renderer et TSL

### THREE.WebGPURenderer

Three.js r160+ inclut un `WebGPURenderer` production-ready qui utilise l'API WebGPU au lieu de WebGL quand le navigateur le supporte, avec fallback automatique vers WebGL :

```typescript
import * as THREE from 'three';
import WebGPURenderer from 'three/webgpu';

// ─── Creer un WebGPURenderer ──────────────────────────────
const renderer = new WebGPURenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// ⚠️ WebGPURenderer.init() est asynchrone (contrairement a WebGLRenderer)
await renderer.init();

// Le reste de l'API est identique
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);

function animate(): void {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

animate();
```

### TSL : Three.js Shading Language

TSL remplace le GLSL brut par un système de **nodes** en JavaScript/TypeScript. Il généré automatiquement du WGSL (WebGPU) ou du GLSL (WebGL) :

```typescript
import {
  MeshStandardNodeMaterial,
  color,
  float,
  uniform,
  uv,
  sin,
  timerLocal,
  mix,
  vec3,
  positionLocal,
} from 'three/tsl';

// ─── Materiau node-based ──────────────────────────────────
const material = new MeshStandardNodeMaterial();

// Couleur animee qui oscille entre deux teintes
const time = timerLocal(); // equivalent de clock.getElapsedTime()
const color1 = color(0xff4400);
const color2 = color(0x0044ff);
const mixFactor = sin(time).mul(0.5).add(0.5); // 0..1

material.colorNode = mix(color1, color2, mixFactor);

// Deformation des vertices
const displacement = sin(positionLocal.y.mul(5.0).add(time)).mul(0.2);
material.positionNode = positionLocal.add(vec3(displacement, 0, 0));

// Roughness variable avec les UVs
material.roughnessNode = uv().x; // 0 a gauche (miroir), 1 a droite (mat)

const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), material);
scene.add(mesh);
```

### Avantages de TSL par rapport au GLSL brut

```typescript
// ─── GLSL (ancien, avec ShaderMaterial) ───────────────────
const glslMaterial = new THREE.ShaderMaterial({
  vertexShader: /* glsl */ `
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      vec3 pos = position;
      pos.x += sin(position.y * 5.0 + uTime) * 0.2;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      vec3 col1 = vec3(1.0, 0.27, 0.0);
      vec3 col2 = vec3(0.0, 0.27, 1.0);
      float t = sin(uTime) * 0.5 + 0.5;
      gl_FragColor = vec4(mix(col1, col2, t), 1.0);
    }
  `,
  uniforms: { uTime: { value: 0 } },
});
// ⚠️ Ne fonctionne QU'avec WebGLRenderer

// ─── TSL (nouveau, avec NodeMaterial) ─────────────────────
// Le code TSL ci-dessus fait la meme chose mais :
// ✅ Fonctionne avec WebGLRenderer ET WebGPURenderer
// ✅ Pas de strings GLSL (type-safe TypeScript)
// ✅ Composable (les nodes sont des objets reutilisables)
// ✅ Auto-genere GLSL ou WGSL selon le renderer
```

### Quand passer a WebGPURenderer ?

| Critere | WebGLRenderer | WebGPURenderer |
|---------|:-------------:|:--------------:|
| Support navigateur | Tous | Chrome 113+, Edge, Firefox 141+, Safari 18+ |
| Maturite | Stable | Production-ready (depuis r160+) |
| Compute shaders | Non (GPGPU hack) | Oui (natif) |
| Multi-draw | Non | Oui |
| Performances théoriques | Bonnes | Meilleures (moins d'overhead CPU) |
| Ecosysteme (post-processing, etc.) | Complet | En cours |
| Production | Oui | Oui (depuis r160+) |

:::tip Stratégie recommandee
Utilisez `WebGPURenderer` avec fallback WebGL :
```typescript
import WebGPURenderer from 'three/webgpu';

const renderer = new WebGPURenderer({ antialias: true });
// Si WebGPU n'est pas disponible, il utilise automatiquement WebGL
await renderer.init();
```
Ecrivez vos materiaux custom en TSL (pas en GLSL) pour la compatibilite future.
:::

---

## Checklist d'optimisation

| Étape | Actions |
|-------|---------|
| 1. Identifier le bottleneck | `renderer.info.render.calls` eleve = CPU-bound ; triangles > 2M = GPU-bound ; textures > 512 Mo = VRAM-bound |
| 2. Reduire les draw calls | InstancedMesh, mergeGeometries, materiaux partages, texture atlas |
| 3. Reduire la geometrie | LOD, simplification Blender, compression Draco |
| 4. Optimiser les textures | KTX2/Basis, résolution max 2048, channel packing, puissance de 2 |
| 5. Allegerer les shaders | Moins de lumieres, MeshStandard vs Physical, bloom demi-résolution |
| 6. Éviter les fuites | dispose() sur geometries/materiaux/textures/render targets |
| 7. Allegerer le JS | Cacher les traversals, throttle raycaster, OffscreenCanvas + Worker |

---

## Exercice pratique

### Enonce

Partez de cette scene volontairement non optimisee et appliquez toutes les techniques vues dans ce module :

**Scene de depart** (non optimisee) :
- 2000 cubes individuels (chacun son propre Mesh et Material)
- Textures 4096x4096 non compressees
- Pas de LOD
- Post-processing : bloom + SSAO + FXAA (tout a pleine résolution)
- Pas de dispose quand on change de scene

**Objectifs** :
1. Remplacer les 2000 cubes par un `InstancedMesh` (1 draw call)
2. Ajouter 3 niveaux de LOD pour les objets principaux
3. Reduire les textures a 1024x1024
4. Partager les materiaux entre les objets identiques
5. Ajouter un `PerformanceMonitor` affichant FPS, draw calls, triangles
6. Implementer `disposeScene()` qui nettoie tout proprement
7. Mesurer les gains : noter draw calls et FPS avant/après

**Indice** : L'objectif est de passer de ~2000+ draw calls a <50, et de maintenir 60 FPS stables.

<details>
<summary>Solution</summary>

```typescript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import Stats from 'three/addons/libs/stats.module.js';

// ─── Setup ────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);
scene.fog = new THREE.Fog(0x1a1a2e, 30, 100);

const camera = new THREE.PerspectiveCamera(
  60, window.innerWidth / window.innerHeight, 0.1, 200
);
camera.position.set(0, 15, 30);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0);

const clock = new THREE.Clock();
const stats = new Stats();
document.body.appendChild(stats.dom);

// ─── Performance monitor ──────────────────────────────────
const infoDiv = document.createElement('div');
infoDiv.style.cssText = `
  position:fixed; top:50px; left:0;
  background:rgba(0,0,0,0.8); color:#0f0;
  font:12px monospace; padding:8px; z-index:9999;
`;
document.body.appendChild(infoDiv);

// ─── Lumieres ─────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0x404060, 0.4));
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(20, 30, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024); // pas besoin de 4096
sun.shadow.camera.left = -40;
sun.shadow.camera.right = 40;
sun.shadow.camera.top = 40;
sun.shadow.camera.bottom = -40;
scene.add(sun);

// ─── Sol ──────────────────────────────────────────────────
const groundMat = new THREE.MeshStandardMaterial({ color: 0x333344, roughness: 0.9 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ═══════════════════════════════════════════════════════════
// OPTIMISATION 1 : InstancedMesh au lieu de 2000 Mesh
// ═══════════════════════════════════════════════════════════
const CUBE_COUNT = 2000;
const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
const cubeMat = new THREE.MeshStandardMaterial({
  color: 0x44aaff,
  roughness: 0.5,
  metalness: 0.3,
});

// ✅ 1 draw call au lieu de 2000
const cubes = new THREE.InstancedMesh(cubeGeo, cubeMat, CUBE_COUNT);
cubes.castShadow = true;
cubes.receiveShadow = true;

const dummy = new THREE.Object3D();
const instanceColor = new THREE.Color();

for (let i = 0; i < CUBE_COUNT; i++) {
  dummy.position.set(
    (Math.random() - 0.5) * 80,
    Math.random() * 3 + 0.5,
    (Math.random() - 0.5) * 80
  );
  dummy.rotation.set(
    Math.random() * Math.PI,
    Math.random() * Math.PI,
    0
  );
  const s = 0.5 + Math.random() * 1.5;
  dummy.scale.setScalar(s);
  dummy.updateMatrix();
  cubes.setMatrixAt(i, dummy.matrix);

  instanceColor.setHSL(0.55 + Math.random() * 0.15, 0.7, 0.4 + Math.random() * 0.2);
  cubes.setColorAt(i, instanceColor);
}

cubes.instanceMatrix.needsUpdate = true;
if (cubes.instanceColor) cubes.instanceColor.needsUpdate = true;
scene.add(cubes);

// ═══════════════════════════════════════════════════════════
// OPTIMISATION 2 : LOD pour les objets principaux
// ═══════════════════════════════════════════════════════════
function createPillarLOD(x: number, z: number): THREE.LOD {
  const lod = new THREE.LOD();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffaa44, roughness: 0.3 });

  // Niveau 0 : haute qualite
  const highGeo = new THREE.CylinderGeometry(0.5, 0.8, 6, 32, 4);
  const highMesh = new THREE.Mesh(highGeo, mat);
  highMesh.castShadow = true;
  lod.addLevel(highMesh, 0);

  // Niveau 1 : qualite moyenne
  const medGeo = new THREE.CylinderGeometry(0.5, 0.8, 6, 12, 2);
  lod.addLevel(new THREE.Mesh(medGeo, mat), 25);

  // Niveau 2 : basse qualite
  const lowGeo = new THREE.CylinderGeometry(0.5, 0.8, 6, 6, 1);
  const lowMat = new THREE.MeshStandardMaterial({ color: 0xffaa44, flatShading: true });
  lod.addLevel(new THREE.Mesh(lowGeo, lowMat), 50);

  lod.position.set(x, 3, z);
  return lod;
}

// 20 piliers avec LOD
for (let i = 0; i < 20; i++) {
  const angle = (i / 20) * Math.PI * 2;
  const pillar = createPillarLOD(
    Math.cos(angle) * 20,
    Math.sin(angle) * 20
  );
  scene.add(pillar);
}

// ═══════════════════════════════════════════════════════════
// OPTIMISATION 3 : Post-processing demi-resolution + SMAA
// ═══════════════════════════════════════════════════════════
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

// Bloom a pleine resolution mais parametres legers
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.5, 0.4, 0.9
);
composer.addPass(bloom);

// SMAA au lieu de SSAO (beaucoup moins couteux)
const smaa = new SMAAPass(
  window.innerWidth * renderer.getPixelRatio(),
  window.innerHeight * renderer.getPixelRatio()
);
composer.addPass(smaa);

composer.addPass(new OutputPass());

// ═══════════════════════════════════════════════════════════
// OPTIMISATION 6 : Fonction dispose complete
// ═══════════════════════════════════════════════════════════
function disposeScene(): void {
  // Disposer tous les objets de la scene
  const toDispose: THREE.Object3D[] = [];
  scene.traverse((node) => toDispose.push(node));

  for (const node of toDispose) {
    if (node instanceof THREE.Mesh || node instanceof THREE.InstancedMesh) {
      node.geometry.dispose();
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const mat of mats) {
        for (const key of Object.keys(mat)) {
          const val = (mat as Record<string, unknown>)[key];
          if (val instanceof THREE.Texture) val.dispose();
        }
        mat.dispose();
      }
    }
    node.parent?.remove(node);
  }

  // Disposer le composer
  composer.renderTarget1.dispose();
  composer.renderTarget2.dispose();

  console.log('Scene disposee — verification :');
  console.log(`  Geometries: ${renderer.info.memory.geometries}`);
  console.log(`  Textures: ${renderer.info.memory.textures}`);
}

// Touche "D" pour dispose + reload
document.addEventListener('keydown', (e) => {
  if (e.key === 'd') {
    disposeScene();
    console.log('Scene nettoyee. Rechargez pour reinitialiser.');
  }
});

// ─── Resize ───────────────────────────────────────────────
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
});

// ─── Render loop ──────────────────────────────────────────
function animate(): void {
  stats.begin();
  requestAnimationFrame(animate);

  controls.update();
  composer.render();

  // Mettre a jour le panel de stats
  const info = renderer.info;
  infoDiv.innerHTML = [
    `Draw calls : ${info.render.calls}`,
    `Triangles  : ${info.render.triangles.toLocaleString()}`,
    `Geometries : ${info.memory.geometries}`,
    `Textures   : ${info.memory.textures}`,
  ].join('<br>');

  stats.end();
}

animate();

// ═══════════════════════════════════════════════════════════
// RESULTATS ATTENDUS
// ═══════════════════════════════════════════════════════════
// Avant optimisation :
//   Draw calls  : ~2050
//   Triangles   : ~24 000
//   Materiaux   : ~2000
//   FPS         : 15-25
//
// Apres optimisation :
//   Draw calls  : ~30
//   Triangles   : ~24 000 (meme geo, mais 1 draw call)
//   Materiaux   : ~5
//   FPS         : 60 stable
```

</details>

---

## Résumé

| Concept | API / Outil | Details clés |
|---------|------------|-------------|
| Budget performance | — | 16ms pour 60 FPS, 8ms pour 120 FPS |
| FPS monitoring | `stats.js` | `stats.begin()` / `stats.end()` dans le render loop |
| Stats renderer | `renderer.info` | calls, triangles, geometries, textures en mémoire |
| Frustum culling | `object.frustumCulled` | Automatique, base sur la bounding sphere |
| Level of Detail | `THREE.LOD` | `addLevel(mesh, distance)`, 3+ niveaux |
| Instancing | `InstancedMesh` | `setMatrixAt()`, 1 draw call pour N objets |
| Merge geometries | `mergeGeometries()` | Fusionner les statiques qui partagent un materiau |
| Compression geometrie | DRACOLoader | 60-90% reduction taille fichier |
| Compression textures | KTX2Loader | Reste compresse en VRAM (BC7/ETC2/ASTC) |
| Dispose pattern | `.dispose()` | Geometrie, materiau, texture, render target |
| Detection fuites | `renderer.info.memory` | Comparer avant/après dispose |
| Offscreen canvas | `OffscreenCanvas` + Worker | Rendu 3D sans bloquer le main thread |
| GPU profiling | Chrome DevTools, Spector.js | Frame capture, draw call inspection |
| Tri par materiau | Automatique + materiaux partages | Reduire les changements d'état GPU |
| Tri par distance | Automatique | Front-to-back opaque, back-to-front transparent |
| WebGPU renderer | `WebGPURenderer` | Production-ready, fallback WebGL automatique |
| TSL | `MeshStandardNodeMaterial` | Shading en TypeScript, généré GLSL ou WGSL |

---

## Pour aller plus loin

- [Three.js Performance Tips](https://threejs.org/manual/#en/optimize-lots-of-objects)
- [Three.js Dispose Guide](https://threejs.org/manual/#en/cleanup)
- [Spector.js — WebGL Inspector](https://spector.babylonjs.com/)
- [Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance/)
- [Three.js WebGPU Examples](https://threejs.org/examples/?q=webgpu)
- [Three.js TSL Documentation](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language)
- [WebGPU Fundamentals](https://webgpufundamentals.org/) — pour comprendre pourquoi WebGPU est plus performant
- [Discover three.js — Performance](https://discoverthreejs.com/tips-and-tricks/)

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 17 performance](../screencasts/screencast-17-performance.md)
2. **Lab** : [lab-17-performance](../labs/lab-17-performance/README)
3. **Quiz** : [quiz 17 performance](../quizzes/quiz-17-performance.html)
:::
