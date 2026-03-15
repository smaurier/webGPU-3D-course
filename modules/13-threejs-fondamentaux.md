# Module 13 — Three.js fondamentaux

| Difficulte | Duree estimee | Lab | Quiz |
|:----------:|:-------------:|:---:|:----:|
| 3/5        | 90 min        | [Lab 13](../labs/lab-13-threejs-fondamentaux/) | [Quiz 13](../quizzes/quiz-13-threejs-fondamentaux.html) |

## Objectifs pedagogiques

A la fin de ce module, vous serez capable de :

- Expliquer ce qu'est Three.js et pourquoi il abstrait WebGL/WebGPU
- Creer une scene 3D complete avec Scene, Camera et Renderer
- Configurer une PerspectiveCamera avec les bons parametres
- Utiliser les geometries et materiaux de base
- Mettre en place un render loop fluide avec `requestAnimationFrame`
- Ajouter des controles interactifs avec OrbitControls
- Gerer le redimensionnement du canvas proprement
- Utiliser les helpers de debug (AxesHelper, GridHelper)

---

<details>
<summary>Rappel du cours precedent — Techniques avancees WebGPU (Module 12)</summary>

Au module 12, nous avons explore les techniques avancees de WebGPU :

- **Multi-pass rendering** : render passes multiples avec depth pre-pass et forward pass
- **Compute shaders avances** : simulation de particules sur GPU, prefix sum
- **Indirect drawing** : `drawIndirect` / `drawIndexedIndirect` pour le GPU-driven rendering
- **Timestamp queries** : mesurer les temps GPU avec `GPUQuerySet`
- **Render bundles** : `GPURenderBundle` pour pre-enregistrer des commandes

Ces techniques offrent un controle total mais demandent beaucoup de code boilerplate. Three.js va nous permettre d'obtenir des resultats similaires avec une fraction du code.

</details>

---

## Qu'est-ce que Three.js ?

### La couche d'abstraction

Three.js est une bibliotheque JavaScript/TypeScript qui abstrait les API graphiques bas niveau (WebGL et WebGPU (depuis r160+)) derriere une API orientee objet intuitive.

```
┌─────────────────────────────────────────────────────────────┐
│                     Votre application                       │
├─────────────────────────────────────────────────────────────┤
│                        Three.js                             │
│   Scene, Camera, Mesh, Material, Light, Renderer, ...       │
├─────────────────────────────────────────────────────────────┤
│              WebGLRenderer  │  WebGPURenderer               │
├─────────────────────────────────────────────────────────────┤
│                WebGL 2.0    │    WebGPU                     │
├─────────────────────────────────────────────────────────────┤
│                          GPU                                │
└─────────────────────────────────────────────────────────────┘
```

### Analogie avec ce que vous connaissez deja

| Concept bas niveau (WebGL/WebGPU) | Equivalent Three.js | Effort |
|-----------------------------------|---------------------|--------|
| Compiler vertex + fragment shaders | `new MeshStandardMaterial()` | ~2 lignes vs ~80 |
| Creer VAO, VBO, IBO manuellement | `new BoxGeometry(1, 1, 1)` | ~1 ligne vs ~40 |
| Calculer matrices MVP a la main | `camera.projectionMatrix` automatique | 0 lignes vs ~20 |
| Configurer le depth test, blending | Active par defaut dans le renderer | 0 lignes vs ~10 |
| Ecrire un render loop complet | `renderer.render(scene, camera)` | 1 ligne vs ~30 |

:::tip Analogie Vue.js
Si vous connaissez Vue.js, pensez a Three.js comme un framework similaire :
- **Scene** = `App` (le conteneur racine)
- **Mesh** = `Component` (un element visible)
- **Material** = `Style` (l'apparence)
- **Camera** = `Viewport` (ce qu'on voit)
- **Renderer** = le moteur Vue qui produit le DOM
:::

### Installation

```bash
# Avec npm
npm install three

# Avec pnpm
pnpm add three

# Types TypeScript (indispensable)
pnpm add -D @types/three
```

```typescript
// Import principal
import * as THREE from 'three';

// Imports specifiques (tree-shakeable)
import { Scene, PerspectiveCamera, WebGLRenderer } from 'three';

// Imports des addons (controles, loaders, effets)
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
```

:::warning Version et imports
Depuis Three.js r150+, les addons utilisent le chemin `three/addons/` au lieu de `three/examples/jsm/`. Assurez-vous d'utiliser la bonne syntaxe pour votre version.
:::

---

## Le trio fondamental : Scene, Camera, Renderer

### Vue d'ensemble

Toute application Three.js repose sur trois objets fondamentaux :

```
┌──────────────────────────────────────────────────────┐
│                      Scene                           │
│                                                      │
│   ┌──────┐  ┌──────┐  ┌───────┐  ┌──────────────┐  │
│   │ Mesh │  │ Mesh │  │ Light │  │ Camera (vue) │  │
│   └──────┘  └──────┘  └───────┘  └──────────────┘  │
│                                                      │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │    Renderer     │
              │  render(scene,  │──────► Canvas HTML
              │    camera)      │        (pixels a l'ecran)
              └─────────────────┘
```

### Scene : le conteneur racine

La `Scene` est le graphe de scene — l'arbre hierarchique qui contient tous les objets 3D.

```typescript
const scene = new THREE.Scene();

// Couleur de fond
scene.background = new THREE.Color(0x1a1a2e);

// Brouillard (optionnel)
scene.fog = new THREE.Fog(0x1a1a2e, 10, 50);
// Fog(couleur, near, far) — lineaire
// FogExp2(couleur, densite) — exponentiel

// Environnement (pour les reflexions PBR)
// scene.environment = cubeTexture; // on verra au module 14
```

### Analogie avec WebGL/WebGPU

<details>
<summary>Comparaison : scene en WebGL brut vs Three.js</summary>

```typescript
// ══════════════════════════════════════════════════
// WebGL brut : ~50 lignes pour initialiser le contexte
// ══════════════════════════════════════════════════
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const gl = canvas.getContext('webgl2')!;
gl.enable(gl.DEPTH_TEST);
gl.enable(gl.CULL_FACE);
gl.clearColor(0.1, 0.1, 0.18, 1.0);
gl.viewport(0, 0, canvas.width, canvas.height);
// ... compiler shaders, creer programme, lier attributs ...

// ══════════════════════════════════════════════════
// Three.js : 3 lignes
// ══════════════════════════════════════════════════
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);
// Depth test, cull face, viewport : geres automatiquement
```

</details>

---

## PerspectiveCamera

### Les parametres

La camera perspective simule la vision humaine. Elle est definie par 4 parametres que vous connaissez deja du module 03 (Cameras et projections) :

```typescript
const camera = new THREE.PerspectiveCamera(
  75,           // fov : champ de vision vertical en degres
  width / height, // aspect : ratio largeur / hauteur
  0.1,          // near : plan de clipping proche
  1000          // far : plan de clipping eloigne
);

// Positionner la camera
camera.position.set(0, 2, 5);   // x, y, z
camera.lookAt(0, 0, 0);         // regarde le centre de la scene
```

### Comprendre le frustum

```
         near                    far
          ┌──┐                 ┌──────┐
         /│  │\               /│      │\
        / │  │ \             / │      │ \
       /  │  │  \           /  │      │  \
  oeil ── │  │ ──────────── │  │      │ ──── (pas rendu)
       \  │  │  /           \  │      │  /
        \ │  │ /             \ │      │ /
         \│  │/               \│      │/
          └──┘                 └──────┘
     z = 0.1                  z = 1000

  Seuls les objets DANS le frustum sont rendus.
  near trop petit → z-fighting (artefacts visuels)
  far trop grand → perte de precision du depth buffer
```

:::tip Valeurs recommandees
- **fov** : 45-75 pour des scenes classiques, 90+ pour un effet fish-eye
- **near** : 0.1 minimum (ne jamais mettre 0.001, ca cause du z-fighting)
- **far** : aussi petit que possible — 100 suffit souvent
- **aspect** : toujours `canvas.width / canvas.height`
:::

### OrthographicCamera (alternative)

```typescript
// Pour les jeux isometriques, interfaces 2D, ou rendu technique
const orthoCamera = new THREE.OrthographicCamera(
  -5,  // left
   5,  // right
   5,  // top
  -5,  // bottom
  0.1, // near
  100  // far
);
```

---

## WebGLRenderer

### Configuration

```typescript
const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById('canvas') as HTMLCanvasElement,
  antialias: true,          // lissage des bords (MSAA)
  alpha: false,             // fond transparent si true
  powerPreference: 'high-performance', // GPU dedie si disponible
  stencil: false,           // desactiver si pas besoin (gain perf)
});

// Taille du rendu
renderer.setSize(window.innerWidth, window.innerHeight);

// Pixel ratio : gerer les ecrans Retina/HiDPI
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
// On cap a 2 pour eviter de surcharger le GPU sur les ecrans 3x

// Tone mapping : convertir HDR → LDR (voir module 14)
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

// Output color space
renderer.outputColorSpace = THREE.SRGBColorSpace;

// Ombres (voir module 14)
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
```

### Analogie avec WebGPU

<details>
<summary>Comparaison : initialisation du renderer WebGPU vs Three.js</summary>

```typescript
// ══════════════════════════════════════════════════
// WebGPU brut : ~30 lignes
// ══════════════════════════════════════════════════
const adapter = await navigator.gpu.requestAdapter({
  powerPreference: 'high-performance',
});
const device = await adapter!.requestDevice();
const context = canvas.getContext('webgpu')!;
const format = navigator.gpu.getPreferredCanvasFormat();
context.configure({
  device,
  format,
  alphaMode: 'premultiplied',
});
// Creer depth texture, configurer render pass descriptor...
const depthTexture = device.createTexture({
  size: [canvas.width, canvas.height],
  format: 'depth24plus',
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});

// ══════════════════════════════════════════════════
// Three.js : ~5 lignes
// ══════════════════════════════════════════════════
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
```

</details>

---

## Mesh = Geometry + Material

### Le concept central

Un `Mesh` est un objet visible dans la scene. Il combine une geometrie (la forme) et un materiau (l'apparence).

```typescript
// Creer un cube
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshStandardMaterial({
  color: 0x00ff88,
  metalness: 0.3,
  roughness: 0.4,
});
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);
```

### Geometries integrees

```typescript
// ─── Primitives de base ───────────────────────────────────
const box = new THREE.BoxGeometry(
  1, 1, 1,   // width, height, depth
  2, 2, 2    // widthSegments, heightSegments, depthSegments
);

const sphere = new THREE.SphereGeometry(
  1,     // radius
  32,    // widthSegments (resolution horizontale)
  16     // heightSegments (resolution verticale)
);

const plane = new THREE.PlaneGeometry(
  10, 10,  // width, height
  1, 1     // segments (pour deformation/displacement)
);

const cylinder = new THREE.CylinderGeometry(
  0.5,   // radiusTop
  0.5,   // radiusBottom
  2,     // height
  32     // radialSegments
);

const torus = new THREE.TorusGeometry(
  1,     // radius
  0.4,   // tube radius
  16,    // radialSegments
  100    // tubularSegments
);

const cone = new THREE.ConeGeometry(
  0.5,   // radius
  2,     // height
  32     // radialSegments
);

// ─── Geometries avancees ──────────────────────────────────
const torusKnot = new THREE.TorusKnotGeometry(1, 0.3, 128, 16);
const icosahedron = new THREE.IcosahedronGeometry(1, 0); // 0 = pas de subdivision
const dodecahedron = new THREE.DodecahedronGeometry(1, 0);
const ring = new THREE.RingGeometry(0.5, 1, 32);
```

### BufferGeometry personnalise

Vous avez deja cree des buffers manuellement en WebGL (module 06) et WebGPU (module 09). Three.js utilise le meme concept sous le capot :

```typescript
// Triangle personnalise — meme logique que vos VBOs WebGL !
const geometry = new THREE.BufferGeometry();

// Positions (3 floats par vertex — comme votre Float32Array en WebGL)
const positions = new Float32Array([
  -1.0, -1.0,  0.0,  // vertex 0
   1.0, -1.0,  0.0,  // vertex 1
   0.0,  1.0,  0.0,  // vertex 2
]);

// Normales (3 floats par vertex)
const normals = new Float32Array([
  0.0, 0.0, 1.0,
  0.0, 0.0, 1.0,
  0.0, 0.0, 1.0,
]);

// UVs (2 floats par vertex)
const uvs = new Float32Array([
  0.0, 0.0,
  1.0, 0.0,
  0.5, 1.0,
]);

// Couleurs (3 floats par vertex)
const colors = new Float32Array([
  1.0, 0.0, 0.0,  // rouge
  0.0, 1.0, 0.0,  // vert
  0.0, 0.0, 1.0,  // bleu
]);

// Attacher les attributs — equivalent de gl.vertexAttribPointer
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

// Indices (optionnel — equivalent de votre IBO)
const indices = new Uint16Array([0, 1, 2]);
geometry.setIndex(new THREE.BufferAttribute(indices, 1));

// Calcul automatique des normales si pas fournies
// geometry.computeVertexNormals();

// Bounding box/sphere pour le frustum culling
geometry.computeBoundingBox();
geometry.computeBoundingSphere();
```

<details>
<summary>Comparaison : BufferGeometry vs VBO WebGL brut</summary>

```typescript
// ══════════════════════════════════════════════════
// WebGL brut : creer un buffer de positions
// ══════════════════════════════════════════════════
const vbo = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
const posLoc = gl.getAttribLocation(program, 'aPosition');
gl.enableVertexAttribArray(posLoc);
gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

// ══════════════════════════════════════════════════
// Three.js : une seule ligne
// ══════════════════════════════════════════════════
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
```

</details>

---

## Materiaux de base

### La hierarchie des materiaux

```
              Material (base abstraite)
                  │
    ┌─────────────┼─────────────────────┐
    │             │                     │
MeshBasicMaterial │              ShaderMaterial
(pas d'eclairage) │             (shaders custom)
                  │
    ┌─────────────┼──────────────┐
    │             │              │
MeshLambert   MeshPhong    MeshStandard
Material      Material     Material (PBR)
(diffus)    (specular)         │
                          MeshPhysical
                          Material (PBR+)
```

### MeshBasicMaterial — pas d'eclairage

```typescript
// Pas affecte par les lumieres — utile pour le debug et les UI
const basic = new THREE.MeshBasicMaterial({
  color: 0xff0000,
  wireframe: false,        // afficher en fil de fer
  transparent: false,      // activer la transparence
  opacity: 1.0,            // 0 = invisible, 1 = opaque
  side: THREE.FrontSide,   // FrontSide | BackSide | DoubleSide
  map: null,               // texture diffuse (voir module 14)
});
```

### MeshStandardMaterial — PBR

```typescript
// Materiau PBR standard — base metalness/roughness
// C'est le materiau que vous utiliserez 90% du temps
const standard = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  metalness: 0.0,    // 0 = dielectrique, 1 = metal
  roughness: 0.5,    // 0 = miroir, 1 = mat
  envMapIntensity: 1.0,
  // Textures (module 14 en detail)
  // map, normalMap, roughnessMap, metalnessMap, aoMap, emissiveMap
});
```

### MeshPhysicalMaterial — PBR avance

```typescript
// Extension de MeshStandardMaterial avec des proprietes physiques avancees
const physical = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  metalness: 0.0,
  roughness: 0.1,

  // Clearcoat — vernis (peinture de voiture)
  clearcoat: 1.0,
  clearcoatRoughness: 0.1,

  // Transmission — verre, liquides
  transmission: 0.9,     // 0 = opaque, 1 = transparent
  ior: 1.5,              // indice de refraction (verre = 1.5, eau = 1.33)
  thickness: 0.5,        // epaisseur du materiau transparent

  // Sheen — tissu, velours
  sheen: 1.0,
  sheenRoughness: 0.75,
  sheenColor: new THREE.Color(0xff8800),

  // Iridescence — bulles de savon, ailes de papillon
  iridescence: 1.0,
  iridescenceIOR: 1.3,
  iridescenceThicknessRange: [100, 400],
});
```

:::info Rappel du module 05
Ces proprietes PBR (metalness, roughness, clearcoat, transmission) correspondent directement aux concepts physiques que vous avez etudies au module 05 — Lumiere, materiaux et PBR. Three.js implemente le modele Cook-Torrance avec GGX/Smith que vous avez vu en theorie.
:::

---

## Le render loop

### Boucle d'animation

```typescript
// ─── Le pattern standard Three.js ─────────────────────────
function animate(): void {
  requestAnimationFrame(animate);

  // Mettre a jour les objets
  cube.rotation.y += 0.01;
  cube.rotation.x += 0.005;

  // Rendu
  renderer.render(scene, camera);
}

animate();
```

### Avec un Clock pour un temps constant

```typescript
// Clock fournit un deltaTime independant du framerate
const clock = new THREE.Clock();

function animate(): void {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();     // temps depuis le dernier frame (secondes)
  const elapsed = clock.getElapsedTime(); // temps total ecoule

  // Animation independante du framerate
  cube.rotation.y += 1.0 * delta;     // 1 radian par seconde
  cube.position.y = Math.sin(elapsed) * 0.5; // oscillation

  renderer.render(scene, camera);
}

animate();
```

### Comparaison avec votre render loop WebGL

<details>
<summary>Render loop WebGL brut vs Three.js</summary>

```typescript
// ══════════════════════════════════════════════════
// WebGL brut : ~20 lignes par frame
// ══════════════════════════════════════════════════
function renderWebGL(time: number): void {
  requestAnimationFrame(renderWebGL);

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(program);

  // Mettre a jour la matrice model
  mat4.rotateY(modelMatrix, modelMatrix, 0.01);

  // Calculer MVP
  mat4.multiply(mvpMatrix, viewMatrix, modelMatrix);
  mat4.multiply(mvpMatrix, projectionMatrix, mvpMatrix);

  // Envoyer les uniforms
  gl.uniformMatrix4fv(mvpLoc, false, mvpMatrix);
  gl.uniform3fv(lightDirLoc, lightDirection);

  // Bind VAO et dessiner
  gl.bindVertexArray(vao);
  gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0);
}

// ══════════════════════════════════════════════════
// Three.js : 3 lignes significatives
// ══════════════════════════════════════════════════
function animate(): void {
  requestAnimationFrame(animate);
  cube.rotation.y += 0.01;
  renderer.render(scene, camera); // MVP, uniforms, draw calls : tout est gere
}
```

</details>

---

## OrbitControls : interaction avec la scene

### Configuration

```typescript
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const controls = new OrbitControls(camera, renderer.domElement);

// ─── Parametres de base ───────────────────────────────────
controls.enableDamping = true;     // inertie (mouvement fluide)
controls.dampingFactor = 0.05;     // force de l'inertie
controls.enableZoom = true;        // molette = zoom
controls.enablePan = true;         // clic droit = deplacement
controls.enableRotate = true;      // clic gauche = rotation

// ─── Limites ──────────────────────────────────────────────
controls.minDistance = 2;          // zoom minimum
controls.maxDistance = 20;         // zoom maximum
controls.minPolarAngle = 0;       // rotation verticale min (0 = dessus)
controls.maxPolarAngle = Math.PI / 2; // bloquer sous le sol

// ─── Cible ────────────────────────────────────────────────
controls.target.set(0, 1, 0);     // point autour duquel on orbite
controls.update();                 // appliquer la cible initiale

// ─── Auto-rotation ────────────────────────────────────────
controls.autoRotate = true;
controls.autoRotateSpeed = 2.0;    // tours par minute
```

:::warning Important
Si `enableDamping` est `true`, vous **devez** appeler `controls.update()` dans votre render loop, sinon l'inertie ne fonctionnera pas.
:::

```typescript
function animate(): void {
  requestAnimationFrame(animate);

  controls.update(); // OBLIGATOIRE avec damping

  renderer.render(scene, camera);
}
```

---

## Helpers de debug

### AxesHelper

```typescript
// Axes X (rouge), Y (vert), Z (bleu) — convention standard
const axesHelper = new THREE.AxesHelper(5); // longueur des axes
scene.add(axesHelper);
```

### GridHelper

```typescript
// Grille au sol
const gridHelper = new THREE.GridHelper(
  10,    // taille totale
  10,    // nombre de divisions
  0x444444, // couleur de la ligne centrale
  0x222222  // couleur des autres lignes
);
scene.add(gridHelper);
```

### Autres helpers utiles

```typescript
// Visualiser la camera (utile pour debug une shadow camera)
const cameraHelper = new THREE.CameraHelper(camera);
scene.add(cameraHelper);

// Visualiser une lumiere directionnelle
const lightHelper = new THREE.DirectionalLightHelper(directionalLight, 1);
scene.add(lightHelper);

// Bounding box d'un objet
const boxHelper = new THREE.BoxHelper(mesh, 0xffff00);
scene.add(boxHelper);

// Fleche pour visualiser un vecteur
const arrow = new THREE.ArrowHelper(
  new THREE.Vector3(0, 1, 0), // direction
  new THREE.Vector3(0, 0, 0), // origin
  2,                           // length
  0xff0000                     // color
);
scene.add(arrow);
```

---

## Gestion du redimensionnement

```typescript
function onResize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;

  // Mettre a jour la camera
  camera.aspect = width / height;
  camera.updateProjectionMatrix(); // OBLIGATOIRE apres changement de fov/aspect/near/far

  // Mettre a jour le renderer
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

window.addEventListener('resize', onResize);
```

:::warning Erreur classique
Oublier `camera.updateProjectionMatrix()` apres avoir modifie `aspect`, `fov`, `near` ou `far` est l'erreur la plus courante chez les debutants Three.js. Sans cet appel, la matrice de projection n'est pas recalculee et l'image sera deformee.
:::

---

## Application complete

Voici une application Three.js complete qui combine tous les concepts de ce module :

```typescript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ─── Renderer ─────────────────────────────────────────────
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

// ─── Scene ────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

// ─── Camera ───────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(3, 2, 5);

// ─── Controles ────────────────────────────────────────────
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.5, 0);
controls.update();

// ─── Lumieres ─────────────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
directionalLight.position.set(5, 5, 5);
scene.add(directionalLight);

// ─── Objets ───────────────────────────────────────────────
// Sol
const floorGeometry = new THREE.PlaneGeometry(10, 10);
const floorMaterial = new THREE.MeshStandardMaterial({
  color: 0x333333,
  roughness: 0.8,
});
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2; // tourner pour etre horizontal
scene.add(floor);

// Cube
const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
const cubeMaterial = new THREE.MeshStandardMaterial({
  color: 0x00ff88,
  metalness: 0.3,
  roughness: 0.4,
});
const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
cube.position.set(-1.5, 0.5, 0);
scene.add(cube);

// Sphere
const sphereGeometry = new THREE.SphereGeometry(0.5, 32, 16);
const sphereMaterial = new THREE.MeshStandardMaterial({
  color: 0xff4444,
  metalness: 0.7,
  roughness: 0.2,
});
const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
sphere.position.set(0, 0.5, 0);
scene.add(sphere);

// Torus knot
const knotGeometry = new THREE.TorusKnotGeometry(0.4, 0.15, 100, 16);
const knotMaterial = new THREE.MeshPhysicalMaterial({
  color: 0x4488ff,
  metalness: 0.1,
  roughness: 0.1,
  clearcoat: 1.0,
  clearcoatRoughness: 0.1,
});
const knot = new THREE.Mesh(knotGeometry, knotMaterial);
knot.position.set(1.5, 0.8, 0);
scene.add(knot);

// ─── Helpers ──────────────────────────────────────────────
const axesHelper = new THREE.AxesHelper(3);
scene.add(axesHelper);

const gridHelper = new THREE.GridHelper(10, 10, 0x444444, 0x222222);
scene.add(gridHelper);

// ─── Resize ───────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// ─── Render loop ──────────────────────────────────────────
const clock = new THREE.Clock();

function animate(): void {
  requestAnimationFrame(animate);

  const elapsed = clock.getElapsedTime();

  // Animations
  cube.rotation.y = elapsed * 0.5;
  sphere.position.y = 0.5 + Math.sin(elapsed * 2) * 0.3;
  knot.rotation.y = elapsed * 0.3;
  knot.rotation.x = elapsed * 0.2;

  controls.update();
  renderer.render(scene, camera);
}

animate();
```

---

## Le graphe de scene et la hierarchie

### Groupes et parent-enfant

```typescript
// Les objets peuvent etre imbriques — comme le DOM HTML
const group = new THREE.Group();
group.position.set(0, 1, 0);

const body = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1.5, 0.5),
  new THREE.MeshStandardMaterial({ color: 0x4488ff })
);
group.add(body);

const head = new THREE.Mesh(
  new THREE.SphereGeometry(0.3, 16, 16),
  new THREE.MeshStandardMaterial({ color: 0xffcc88 })
);
head.position.y = 1.1; // relatif au groupe parent
group.add(head);

scene.add(group);

// Bouger le groupe deplace tous les enfants
group.position.x = 2;  // body ET head bougent ensemble
group.rotation.y = 0.5; // body ET head tournent ensemble
```

### Traversal du graphe de scene

```typescript
// Parcourir tous les objets de la scene
scene.traverse((object) => {
  console.log(object.type, object.name);

  // Exemple : rendre tous les meshes en wireframe
  if (object instanceof THREE.Mesh) {
    (object.material as THREE.MeshStandardMaterial).wireframe = true;
  }
});

// Trouver un objet par nom
const found = scene.getObjectByName('MonCube');
if (found) {
  found.visible = false;
}
```

---

## Exercice pratique

### Enonce

Creez une scene Three.js qui affiche un systeme solaire simplifie :

1. Un soleil (sphere jaune emissive) au centre
2. Trois planetes qui orbitent autour du soleil a des vitesses differentes
3. Une lune qui orbite autour de la deuxieme planete
4. OrbitControls pour naviguer dans la scene
5. Un sol avec GridHelper

**Indices** :
- Utilisez des `Group` pour la hierarchie planete-lune
- Utilisez `Math.sin()` et `Math.cos()` avec le temps pour les orbites
- `MeshBasicMaterial` avec `emissive` pour le soleil (pas affecte par les lumieres)

<details>
<summary>Solution</summary>

```typescript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000011);

const camera = new THREE.PerspectiveCamera(
  60, window.innerWidth / window.innerHeight, 0.1, 200
);
camera.position.set(0, 15, 25);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Lumiere ambiante
scene.add(new THREE.AmbientLight(0xffffff, 0.1));

// Lumiere du soleil (PointLight au centre)
const sunLight = new THREE.PointLight(0xffcc00, 2, 100);
scene.add(sunLight);

// Soleil
const sunGeometry = new THREE.SphereGeometry(2, 32, 32);
const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
const sun = new THREE.Mesh(sunGeometry, sunMaterial);
scene.add(sun);

// Fonction utilitaire pour creer une planete
function createPlanet(
  radius: number,
  color: number,
  orbitRadius: number,
  orbitSpeed: number,
): { group: THREE.Group; mesh: THREE.Mesh; orbitRadius: number; orbitSpeed: number } {
  const geometry = new THREE.SphereGeometry(radius, 32, 16);
  const material = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.3,
    roughness: 0.7,
  });
  const mesh = new THREE.Mesh(geometry, material);

  const group = new THREE.Group();
  group.add(mesh);
  mesh.position.x = orbitRadius;

  scene.add(group);

  return { group, mesh, orbitRadius, orbitSpeed };
}

// Planetes
const planet1 = createPlanet(0.4, 0xaa4400, 5, 1.0);
const planet2 = createPlanet(0.6, 0x0066ff, 9, 0.6);
const planet3 = createPlanet(0.5, 0x00aa44, 14, 0.3);

// Lune de planet2
const moonGeometry = new THREE.SphereGeometry(0.15, 16, 16);
const moonMaterial = new THREE.MeshStandardMaterial({
  color: 0xcccccc,
  roughness: 0.9,
});
const moon = new THREE.Mesh(moonGeometry, moonMaterial);
moon.position.x = 1.5; // distance relative a la planete
planet2.group.children[0].add(moon); // ajouter au mesh de la planete

// Orbites visibles (cercles)
function createOrbitRing(radius: number): void {
  const ringGeometry = new THREE.RingGeometry(radius - 0.02, radius + 0.02, 128);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x333344,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  scene.add(ring);
}

createOrbitRing(5);
createOrbitRing(9);
createOrbitRing(14);

// Grid helper
scene.add(new THREE.GridHelper(40, 40, 0x111122, 0x111122));

// Axes helper
scene.add(new THREE.AxesHelper(3));

// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Render loop
const clock = new THREE.Clock();
const planets = [planet1, planet2, planet3];

function animate(): void {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();

  // Rotation du soleil
  sun.rotation.y = elapsed * 0.1;

  // Orbite des planetes
  for (const planet of planets) {
    const angle = elapsed * planet.orbitSpeed;
    planet.mesh.position.x = Math.cos(angle) * planet.orbitRadius;
    planet.mesh.position.z = Math.sin(angle) * planet.orbitRadius;
    planet.mesh.rotation.y = elapsed * 2; // rotation sur elle-meme
  }

  // Orbite de la lune
  const moonAngle = elapsed * 3;
  moon.position.x = Math.cos(moonAngle) * 1.5;
  moon.position.z = Math.sin(moonAngle) * 1.5;

  controls.update();
  renderer.render(scene, camera);
}

animate();
```

</details>

---

## Resume

| Concept | API Three.js | Ce que ca remplace (WebGL/WebGPU) |
|---------|-------------|-----------------------------------|
| Conteneur racine | `new THREE.Scene()` | Gestion manuelle de listes d'objets |
| Camera perspective | `new THREE.PerspectiveCamera(fov, aspect, near, far)` | Calcul matriciel de projection |
| Moteur de rendu | `new THREE.WebGLRenderer({ antialias })` | `getContext('webgl2')` + configuration manuelle |
| Forme 3D | `new THREE.BoxGeometry(1, 1, 1)` | VAO + VBO + IBO manuels |
| Apparence | `new THREE.MeshStandardMaterial({ color })` | Vertex + fragment shaders GLSL |
| Objet visible | `new THREE.Mesh(geometry, material)` | Bind buffers + draw call |
| Rendu | `renderer.render(scene, camera)` | Clear + use program + uniforms + draw |
| Controles utilisateur | `new OrbitControls(camera, canvas)` | EventListeners + calculs manuels |
| Hierarchie | `parent.add(child)` | Multiplication matricielle parent-enfant |
| Animations | `THREE.Clock` + `requestAnimationFrame` | `performance.now()` + delta calcule |
| Debug | `AxesHelper`, `GridHelper` | Dessiner des lignes manuellement |
| Redimensionnement | `camera.updateProjectionMatrix()` | Recalculer la matrice + `gl.viewport()` |

---

## Pour aller plus loin

- [Documentation officielle Three.js](https://threejs.org/docs/)
- [Three.js Fundamentals](https://threejs.org/manual/)
- [Discover Three.js](https://discoverthreejs.com/)
- [Three.js Journey](https://threejs-journey.com/) — cours video complet
- [Three.js Examples](https://threejs.org/examples/) — centaines d'exemples interactifs
