---
titre: Three.js fondamentaux
cours: 20-webgpu-3d
notions:
  - "le trio Scene / Camera / WebGLRenderer"
  - "Mesh = Geometry + Material"
  - "PerspectiveCamera (fov, aspect, near, far)"
  - "boucle d'animation (setAnimationLoop vs requestAnimationFrame)"
  - "OrbitControls (three/addons)"
  - "gestion du resize (resizeRendererToDisplaySize)"
  - "ESM moderne : import 'three' + 'three/addons/'"
  - "ce que Three.js abstrait vs WebGL brut"
outcomes:
  - sait monter une scène Three.js complète (Scene, PerspectiveCamera, WebGLRenderer) et l'afficher dans un canvas
  - sait créer un Mesh en combinant une Geometry et un Material et l'ajouter à la scène
  - sait écrire une boucle d'animation avec setAnimationLoop et animer un objet
  - sait ajouter OrbitControls depuis three/addons et gérer le damping dans la boucle
  - sait gérer le redimensionnement (aspect + updateProjectionMatrix + setSize) sans déformer l'image
  - sait expliquer ce que Three.js abstrait par rapport au code WebGL brut des modules 06-08
prerequis:
  - "06-webgl-fondamentaux (contexte, VBO, shaders, draw call)"
  - "07-shaders-buffers-textures (GLSL, VBO/VAO, textures)"
  - "08-scene-webgl-complete (assembler une scène WebGL animée à la main)"
  - "03-cameras-et-projections (view/projection, perspective, frustum)"
next: 14-materiaux-et-lumieres-threejs
libs: ["three"]
tribuzen: "moteur 3D TribuZen — le globe interactif des sorties de la famille, monté en Three.js (Scene + Camera + Renderer + OrbitControls) en une fraction du code WebGL brut du module 08"
last-reviewed: 2026-07
---

# Three.js fondamentaux

> **Outcomes — tu sauras FAIRE :** monter une scène Three.js (Scene / PerspectiveCamera / WebGLRenderer), créer un `Mesh` (Geometry + Material), écrire une boucle d'animation, ajouter `OrbitControls`, et gérer le resize proprement.
> **Difficulté :** :star::star::star:
>
> **Portée :** ce module est le **premier contact avec Three.js**, après trois modules de WebGL brut (06-08). On monte une scène minimale animée et contrôlable à la souris. Les matériaux/lumières/ombres en détail sont au **module 14**, les modèles glTF au **module 15**. Version de référence : **Three.js r185** (2026).

## 1. Cas concret d'abord

Au module 08, tu as assemblé **à la main** une scène WebGL animée pour TribuZen : contexte `webgl2`, compilation de shaders, VBO/VAO, matrices model/view/projection calculées à la main, uniforms, boucle de rendu, gestion du depth test. Résultat concret mais **~250 lignes** pour afficher un cube qui tourne.

La feature suivante du fil rouge : le **globe interactif des sorties de la famille** — une sphère 3D qu'on fait tourner à la souris, avec un marqueur par sortie. En WebGL brut, ce serait des centaines de lignes de plus (sphère générée à la main, contrôles souris câblés, gestion du resize, éclairage...).

Voici le même objectif — un cube 3D qui tourne, contrôlable à la souris — écrit en Three.js :

```typescript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.querySelector('#app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 2, 0.1, 100);
camera.position.z = 3;

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x00ff88 }),
);
scene.add(cube);
scene.add(new THREE.DirectionalLight(0xffffff, 3));

const controls = new OrbitControls(camera, renderer.domElement);

renderer.setAnimationLoop(() => {
  cube.rotation.y += 0.01;
  controls.update();
  renderer.render(scene, camera);
});
```

Environ **20 lignes** au lieu de 250. Three.js n'ajoute pas de magie : il **abstrait** exactement le protocole WebGL du module 08 (shaders, buffers, matrices, draw calls) derrière une API orientée objet. Ce module montre le trio fondamental, le `Mesh`, la boucle et les contrôles — et **ce que chaque objet remplace** du WebGL brut que tu connais déjà.

---

## 2. Théorie complète, concise

### 2.1 Ce que Three.js est (et n'est pas)

Three.js est une bibliothèque JavaScript/TypeScript qui abstrait WebGL2 (et WebGPU depuis r160+, via `WebGPURenderer`) derrière une API orientée objet. Elle **ne remplace pas** ta compréhension du pipeline : elle l'automatise. Chaque concept WebGL des modules 06-08 a son équivalent Three.js :

| WebGL brut (modules 06-08) | Équivalent Three.js |
|----------------------------|---------------------|
| compiler vertex + fragment shaders | `new THREE.MeshStandardMaterial()` |
| créer VBO / VAO / index buffer | `new THREE.BoxGeometry(1, 1, 1)` |
| calculer les matrices model/view/projection | `camera` + `mesh.position/rotation` (auto) |
| `gl.enable(gl.DEPTH_TEST)`, cull face, viewport | activés par défaut dans le renderer |
| boucle `requestAnimationFrame` + clear + draw | `renderer.setAnimationLoop(...)` + `render()` |

L'installation (r185) :

```bash
npm install three
npm install -D @types/three   # types TypeScript, indispensable
```

### 2.2 ESM moderne : imports `three` et `three/addons/`

Depuis r150+, la **règle d'import** est stable et c'est celle à retenir :

```typescript
// Cœur de la bibliothèque
import * as THREE from 'three';

// Ou imports nommés (tree-shakeable)
import { Scene, PerspectiveCamera, WebGLRenderer, Mesh } from 'three';

// Addons (contrôles, loaders, post-processing) : chemin 'three/addons/'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
```

> **Piège historique :** l'ancien chemin `three/examples/jsm/controls/OrbitControls.js` traîne dans beaucoup de tutoriels. Depuis r150, la forme canonique est `three/addons/...` (alias fourni par le package). Garder `three/addons/` pour tout code r185.

Le cœur (Scene, Camera, Mesh, matériaux...) est dans `three`. Tout ce qui est **optionnel** (contrôles, loaders glTF, effets) est dans les **addons** — c'est ce découpage qui garde le bundle léger.

### 2.3 Le trio fondamental : Scene, Camera, Renderer

Toute application Three.js repose sur trois objets. Le **renderer** dessine ce que la **camera** voit de la **scene** dans un canvas :

```
   Scene (graphe d'objets : Mesh, Light, ...)
        │
        ▼
   Camera (point de vue)  ──►  Renderer.render(scene, camera)  ──►  <canvas>
```

**Scene** — le conteneur racine, un graphe hiérarchique. On y ajoute tout ce qui doit être rendu avec `scene.add(...)` :

```typescript
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);  // couleur de fond (optionnel)
```

**WebGLRenderer** — le moteur de rendu. Il crée et pilote le contexte WebGL2 (ce que tu faisais avec `getContext('webgl2')` au module 06), gère le depth test, le clear, les draw calls :

```typescript
const canvas = document.querySelector('#app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({
  canvas,             // canvas hôte (sinon Three.js en crée un)
  antialias: true,    // lissage des bords (MSAA)
});
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // écrans HiDPI, capé à 2
```

Le `false` de `setSize(w, h, false)` dit à Three.js de **ne pas** toucher au CSS du canvas — c'est le CSS qui pilote la taille affichée, `setSize` ne règle que la résolution du drawing buffer (le même distinguo taille CSS / drawing buffer qu'au module 06).

### 2.4 PerspectiveCamera : fov, aspect, near, far

La caméra perspective simule la vision humaine — mêmes quatre paramètres que le frustum vu au module 03 :

```typescript
const camera = new THREE.PerspectiveCamera(
  75,                                   // fov : champ de vision vertical, en DEGRÉS
  canvas.clientWidth / canvas.clientHeight, // aspect : largeur / hauteur
  0.1,                                  // near : plan de clipping proche
  100,                                  // far : plan de clipping éloigné
);
camera.position.set(0, 1, 3);   // x, y, z
camera.lookAt(0, 0, 0);         // orienter la caméra vers un point
```

Points de vigilance (hérités du module 03) :

- **`fov` est en degrés** dans Three.js (75 est une valeur classique ; 45-75 pour des scènes normales).
- **`aspect` doit valoir `largeur / hauteur`** du canvas, sinon l'image est étirée.
- **`near` jamais à 0** (ni très petit type `0.001`) : cela détruit la précision du depth buffer (z-fighting). `0.1` est un bon plancher.
- **`far` aussi petit que possible** : plus l'intervalle `[near, far]` est large, moins le depth buffer est précis.

Toute modification de `fov`/`aspect`/`near`/`far` **après** construction exige `camera.updateProjectionMatrix()` (voir 2.7).

### 2.5 Mesh = Geometry + Material

Un `Mesh` est un objet **visible**. Il combine deux choses distinctes :

- une **Geometry** — la *forme* : les sommets, normales, UV, indices (ce que tu mettais dans tes VBO/index buffer au module 07) ;
- un **Material** — l'*apparence* : la façon de colorer chaque fragment (ce que faisaient tes shaders GLSL).

```typescript
const geometry = new THREE.BoxGeometry(1, 1, 1);       // width, height, depth
const material = new THREE.MeshStandardMaterial({
  color: 0x00ff88,
  metalness: 0.3,   // 0 = diélectrique, 1 = métal (PBR, module 05)
  roughness: 0.4,   // 0 = miroir, 1 = mat
});
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);
```

Trois matériaux à connaître d'emblée :

- **`MeshBasicMaterial`** — couleur plate, **non affecté par les lumières**. Idéal pour du debug ou de l'UI.
- **`MeshStandardMaterial`** — PBR metalness/roughness (module 05), **le matériau par défaut à utiliser** ; nécessite une lumière dans la scène.
- **`MeshPhongMaterial`** — modèle spéculaire plus ancien, plus léger, encore utilisé.

> **Conséquence à retenir :** un `MeshStandardMaterial` **sans aucune lumière** dans la scène apparaît **noir**. C'est la cause n°1 d'un "cube invisible" chez les débutants (piège #2). Ajoute une lumière (`DirectionalLight` + `AmbientLight`) ou passe à `MeshBasicMaterial` pour vérifier la géométrie.

Les geometries primitives couvrent la plupart des besoins de départ : `BoxGeometry`, `SphereGeometry(radius, widthSeg, heightSeg)`, `PlaneGeometry(w, h)`, `CylinderGeometry`, `TorusGeometry`. Pour le globe TribuZen, ce sera une `SphereGeometry`.

`position`, `rotation` et `scale` de tout `Object3D` (dont `Mesh`) remplacent la matrice model que tu calculais à la main :

```typescript
cube.position.set(2, 0, 0);   // translation
cube.rotation.y = Math.PI / 4; // rotation autour de Y (radians)
cube.scale.setScalar(1.5);     // échelle uniforme
```

### 2.6 La boucle d'animation : `setAnimationLoop`

Pour animer, il faut redessiner à chaque frame. Three.js recommande **`renderer.setAnimationLoop(callback)`** : la méthode moderne, qui gère aussi correctement le contexte WebXR (VR/AR, module 25) là où `requestAnimationFrame` ne suffit pas.

```typescript
renderer.setAnimationLoop((time) => {
  // time est en MILLISECONDES depuis le démarrage de la boucle
  cube.rotation.y += 0.01;        // animation simple par frame
  renderer.render(scene, camera); // dessine la frame
});
```

Le manuel Three.js montre aussi le pattern historique avec `requestAnimationFrame`, strictement équivalent hors XR :

```typescript
function render(time: number): void {
  cube.rotation.y += 0.01;
  renderer.render(scene, camera);
  requestAnimationFrame(render);  // se re-planifie soi-même
}
requestAnimationFrame(render);
```

Pour une animation **indépendante du framerate** (recommandé), utilise un `THREE.Clock` et multiplie par le delta :

```typescript
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const delta = clock.getDelta();       // secondes depuis la dernière frame
  cube.rotation.y += 1.0 * delta;       // 1 radian PAR SECONDE, quel que soit le FPS
  renderer.render(scene, camera);
});
```

> **`setAnimationLoop(null)`** arrête la boucle proprement (utile au démontage d'un composant Vue/React).

### 2.7 OrbitControls : orbiter à la souris

`OrbitControls` (dans les addons) fait tourner/zoomer/déplacer la caméra autour d'une cible à la souris — exactement ce qu'il faut pour inspecter le globe des sorties :

```typescript
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;   // inertie (mouvement fluide)
controls.dampingFactor = 0.05;
controls.minDistance = 2;        // limites de zoom
controls.maxDistance = 10;
controls.target.set(0, 0, 0);    // point autour duquel on orbite
controls.update();               // appliquer la cible initiale
```

> **Règle critique :** si `enableDamping = true`, tu **dois** appeler `controls.update()` **à chaque frame** dans la boucle — sinon l'inertie ne s'applique jamais.

```typescript
renderer.setAnimationLoop(() => {
  controls.update();              // OBLIGATOIRE avec damping
  renderer.render(scene, camera);
});
```

### 2.8 Gérer le resize

Quand le canvas change de taille, deux choses doivent suivre : la **résolution du renderer** et l'**aspect de la caméra**. Le manuel Three.js recommande de tester la taille **dans la boucle** plutôt que d'écouter l'événement `resize` — cela couvre aussi les changements de layout sans event :

```typescript
function resizeRendererToDisplaySize(renderer: THREE.WebGLRenderer): boolean {
  const canvas = renderer.domElement;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const needResize = canvas.width !== width || canvas.height !== height;
  if (needResize) {
    renderer.setSize(width, height, false); // false : ne pas toucher au CSS
  }
  return needResize;
}

renderer.setAnimationLoop(() => {
  if (resizeRendererToDisplaySize(renderer)) {
    const canvas = renderer.domElement;
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();  // OBLIGATOIRE après changement d'aspect
  }
  controls.update();
  renderer.render(scene, camera);
});
```

> **`camera.updateProjectionMatrix()` est l'appel oublié n°1.** Modifier `camera.aspect` (ou `fov`/`near`/`far`) sans le rappeler laisse l'ancienne matrice de projection → image déformée.

---

## 3. Worked examples

### Exemple 1 — Scène minimale : un cube animé contrôlable (TribuZen)

Le squelette complet du futur globe des sorties : un cube qui tourne, éclairé, orbitable, responsive. Deux fichiers.

**`index.html`** — le canvas hôte (avec import map pour résoudre `three` et `three/addons/` sans bundler) :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Globe TribuZen — squelette Three.js</title>
  <style>
    html, body { margin: 0; height: 100%; }
    #app { display: block; width: 100vw; height: 100vh; }
  </style>
  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.185.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.185.0/examples/jsm/"
    }
  }
  </script>
</head>
<body>
  <canvas id="app"></canvas>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

**`main.ts`** — le trio + Mesh + lumières + boucle + contrôles + resize :

```typescript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// 1. Renderer : crée et pilote le contexte WebGL2 (remplace getContext + config du module 06)
const canvas = document.querySelector('#app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// 2. Scene : le conteneur racine
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

// 3. Camera : point de vue (fov en degrés, aspect, near, far)
const camera = new THREE.PerspectiveCamera(
  75,
  canvas.clientWidth / canvas.clientHeight,
  0.1,
  100,
);
camera.position.set(0, 1, 3);

// 4. Mesh = Geometry (forme) + Material (apparence)
const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x00ff88, metalness: 0.3, roughness: 0.4 }),
);
scene.add(cube);

// 5. Lumières : SANS lumière, un MeshStandardMaterial est NOIR (piège #2)
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.position.set(3, 4, 2);
scene.add(sun);

// 6. Helpers de debug (axes X rouge / Y vert / Z bleu, grille au sol)
scene.add(new THREE.AxesHelper(2));
scene.add(new THREE.GridHelper(10, 10, 0x444444, 0x222222));

// 7. Contrôles souris (addon)
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0);
controls.update();

// 8. Resize : synchronise résolution + aspect (testé dans la boucle)
function resizeRendererToDisplaySize(r: THREE.WebGLRenderer): boolean {
  const c = r.domElement;
  const needResize = c.width !== c.clientWidth || c.height !== c.clientHeight;
  if (needResize) r.setSize(c.clientWidth, c.clientHeight, false);
  return needResize;
}

// 9. Boucle d'animation moderne
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const delta = clock.getDelta();

  if (resizeRendererToDisplaySize(renderer)) {
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix(); // sinon image déformée
  }

  cube.rotation.y += 0.6 * delta;    // ~0.6 rad/s, indépendant du framerate
  controls.update();                 // OBLIGATOIRE (damping)
  renderer.render(scene, camera);
});
```

Résultat : un cube vert qui tourne lentement sur fond bleu nuit, orbitable à la souris, net sur écran Retina, correct après un redimensionnement de la fenêtre. Compare avec les ~250 lignes du module 08 : **le même résultat, sans une seule ligne de GLSL ni de calcul matriciel**.

### Exemple 2 — Passer du cube au globe : une seule ligne change

Tout le squelette de l'Exemple 1 est réutilisable tel quel pour le globe. La **seule** différence structurelle : remplacer la `BoxGeometry` par une `SphereGeometry`. C'est exactement la force de la séparation Geometry / Material :

```typescript
// Cube  →  Globe : on change la géométrie, PAS le matériau ni le reste
const globe = new THREE.Mesh(
  new THREE.SphereGeometry(
    1,    // radius
    48,   // widthSegments  (résolution horizontale — plus = plus lisse)
    32,   // heightSegments (résolution verticale)
  ),
  new THREE.MeshStandardMaterial({ color: 0x2266cc, roughness: 0.6 }),
);
scene.add(globe);

// La boucle, les lumières, OrbitControls, le resize : INCHANGÉS.
// Le globe tourne, s'oriente à la souris, reste net — gratuitement.
```

Ajouter un marqueur de sortie devient trivial : un petit `Mesh` enfant du globe. Comme le graphe de scène est hiérarchique, l'ajouter **au globe** (et non à la scène) le fait tourner **avec** le globe :

```typescript
const marker = new THREE.Mesh(
  new THREE.SphereGeometry(0.04, 12, 12),
  new THREE.MeshBasicMaterial({ color: 0xff5533 }), // Basic : visible même sans lumière
);
marker.position.set(0, 1, 0);  // sur le pôle nord, en coordonnées LOCALES au globe
globe.add(marker);             // enfant du globe → tourne avec lui
```

C'est le principe qui portera tout le module suivant (matériaux/lumières) puis les marqueurs géolocalisés.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Utiliser `three/examples/jsm/` au lieu de `three/addons/`

Beaucoup de tutoriels antérieurs à r150 importent `OrbitControls` depuis `three/examples/jsm/controls/OrbitControls.js`. En r185, la forme canonique est **`three/addons/controls/OrbitControls.js`**. L'ancien chemin peut casser selon la config du bundler / de l'import map. Retenir `three/addons/`.

### PIÈGE #2 — `MeshStandardMaterial` sans lumière → objet noir

`MeshStandardMaterial`, `MeshPhongMaterial`, `MeshLambertMaterial` **réagissent à la lumière**. Sans aucune lumière dans la scène, ils sont rendus **noirs** (aucune lumière reçue = aucune couleur renvoyée). Symptôme : "mon cube est là mais tout noir/invisible". Solution : ajouter une lumière (`DirectionalLight` + `AmbientLight`) — ou utiliser `MeshBasicMaterial` (non éclairé) le temps de vérifier la géométrie.

### PIÈGE #3 — Oublier `camera.updateProjectionMatrix()` après un resize

Modifier `camera.aspect` (ou `fov`, `near`, `far`) ne recalcule **pas** la matrice de projection automatiquement. Sans `camera.updateProjectionMatrix()`, l'image reste projetée avec l'ancien aspect → étirée/écrasée après redimensionnement. C'est l'erreur la plus fréquente chez les débutants Three.js.

### PIÈGE #4 — Damping activé mais pas de `controls.update()` dans la boucle

`controls.enableDamping = true` sans `controls.update()` **à chaque frame** : l'inertie ne s'applique jamais, la caméra semble figée ou saccadée. Règle : dès que `enableDamping` (ou `autoRotate`) est actif, `controls.update()` est **obligatoire** dans la boucle d'animation.

### PIÈGE #5 — Confondre Geometry et Material

La **Geometry** est la forme (sommets, normales, UV) ; le **Material** est l'apparence (couleur, PBR, shaders). Une couleur se met sur le **Material**, pas la Geometry (`new BoxGeometry({ color })` n'existe pas). Corollaire utile : une même Geometry peut être partagée entre plusieurs `Mesh` avec des Materials différents (économie mémoire), et inversement.

### PIÈGE #6 — Croire que Three.js "remplace" WebGL

Three.js **n'est pas** un moteur boîte noire : il pilote WebGL2 avec exactement les concepts des modules 06-08 (buffers, shaders, matrices, draw calls). Ne pas comprendre ces bases rend le debug de performance (module 17) et les shaders custom (`ShaderMaterial`, module 19) impossibles. Three.js accélère l'écriture, il ne dispense pas de la théorie.

### PIÈGE #7 — `setSize(w, h)` sans le `false` et bataille avec le CSS

`renderer.setSize(w, h)` (sans 3e argument) écrit aussi la **taille CSS** du canvas via des styles inline, ce qui peut entrer en conflit avec ta mise en page. Quand le canvas est dimensionné par CSS (cas courant), utiliser `renderer.setSize(w, h, false)` : Three.js ne règle alors que le drawing buffer et laisse le CSS piloter l'affichage.

---

## 5. Ancrage TribuZen

Three.js est le passage du **rendu 3D artisanal** (modules 06-08, WebGL brut) au **rendu 3D productif** dans TribuZen. La feature portée par ce module : le **globe interactif des sorties de la famille**.

**Le globe des sorties.** Une sphère (`SphereGeometry`) représente la Terre ; chaque sortie de la famille (rando, week-end, voyage) est un petit marqueur `Mesh` positionné sur la surface. L'utilisateur fait tourner le globe à la souris (`OrbitControls`) pour explorer les sorties passées et prévues. Tout le squelette de l'Exemple 1 s'applique tel quel — c'est le socle sur lequel :

- le **module 14** posera les matériaux/lumières réalistes (texture de la Terre, éclairage) ;
- le **module 15** chargera d'éventuels modèles glTF (avatars de la famille) ;
- le **module 17** optimisera l'affichage de centaines de marqueurs (instancing).

Ce que ce module rend concret : monter la scène, l'animer, la rendre interactive et responsive — **en 20 lignes au lieu de 250**, sans réécrire de GLSL.

Fichiers cibles dans `smaurier/tribuzen` :

```
tribuzen/
  src/
    3d/
      three/
        createScene.ts     ← Scene + Camera + WebGLRenderer + lumières (Exemple 1)
        Globe.ts           ← SphereGeometry + OrbitControls + boucle setAnimationLoop
        markers/
          OutingMarker.ts  ← Mesh enfant du globe, un par sortie
      GlobeCanvas.vue      ← <canvas> hôte, montage/démontage (setAnimationLoop(null))
```

> Le montage dans un composant Vue impose de **libérer** la boucle au démontage : `onUnmounted(() => renderer.setAnimationLoop(null))`, et de disposer les géométries/matériaux (`geometry.dispose()`, `material.dispose()`) — géré finement au module 17 (performance).

---

## 6. Points clés

1. Three.js **abstrait** WebGL2 (et WebGPU via `WebGPURenderer`, r160+) : chaque concept des modules 06-08 a un équivalent objet, mais la théorie reste indispensable.
2. Imports r185 : `import * as THREE from 'three'` pour le cœur, `import { X } from 'three/addons/...'` pour les addons (plus `three/examples/jsm/`).
3. Le trio : **Scene** (conteneur) + **Camera** (point de vue) + **WebGLRenderer** (moteur) ; `renderer.render(scene, camera)` dessine une frame.
4. **Mesh = Geometry (forme) + Material (apparence)** ; la couleur va sur le Material, pas la Geometry.
5. `PerspectiveCamera(fov°, aspect, near, far)` : `fov` en degrés, `aspect = w/h`, `near > 0` (ex 0.1), `far` petit ; toute modif → `updateProjectionMatrix()`.
6. Boucle moderne : `renderer.setAnimationLoop(cb)` (gère aussi WebXR) ; `Clock.getDelta()` pour une animation indépendante du framerate ; `setAnimationLoop(null)` arrête.
7. `OrbitControls` (addon) : avec `enableDamping`, `controls.update()` est **obligatoire** dans la boucle.
8. Resize : tester `clientWidth/Height`, `setSize(w, h, false)`, puis `camera.aspect = w/h` + `camera.updateProjectionMatrix()`.

---

## 7. Seeds Anki

```
Quels sont les trois objets fondamentaux de toute application Three.js ?|Scene (conteneur racine du graphe d'objets), Camera (point de vue, ex PerspectiveCamera), et WebGLRenderer (moteur qui pilote WebGL2). Le rendu se fait avec renderer.render(scene, camera).
De quoi est composé un Mesh dans Three.js ?|Un Mesh = une Geometry (la forme : sommets, normales, UV, indices — l'équivalent de tes VBO/index buffer) + un Material (l'apparence : couleur, PBR — l'équivalent de tes shaders GLSL). La couleur se met sur le Material.
Pourquoi un cube en MeshStandardMaterial peut-il apparaître totalement noir ?|Parce que MeshStandardMaterial (comme Phong/Lambert) réagit à la lumière. Sans aucune lumière dans la scène, il ne reçoit rien et est rendu noir. Solution : ajouter une DirectionalLight + AmbientLight, ou utiliser MeshBasicMaterial (non éclairé) pour vérifier la géométrie.
Quels sont les 4 paramètres de PerspectiveCamera et une contrainte sur chacun ?|new PerspectiveCamera(fov, aspect, near, far) : fov en DEGRÉS (~75), aspect = largeur/hauteur du canvas, near > 0 (ex 0.1, jamais 0 sous peine de z-fighting), far aussi petit que possible pour la précision du depth buffer.
Que faut-il appeler après avoir modifié camera.aspect (ou fov/near/far) ?|camera.updateProjectionMatrix(). Sans cet appel, la matrice de projection garde l'ancienne valeur et l'image est déformée après un resize. C'est l'oubli n°1 des débutants Three.js.
Quelle est la méthode moderne pour la boucle d'animation et pourquoi la préférer à requestAnimationFrame ?|renderer.setAnimationLoop(callback). Elle est équivalente hors XR mais gère correctement le contexte WebXR (VR/AR). setAnimationLoop(null) arrête la boucle proprement. requestAnimationFrame reste valide hors XR.
Quelle règle impérative accompagne OrbitControls avec enableDamping = true ?|Il faut appeler controls.update() À CHAQUE FRAME dans la boucle d'animation, sinon l'inertie (damping) ne s'applique jamais. Même règle avec autoRotate.
Quel est le chemin d'import canonique d'OrbitControls en Three.js r185 ?|import { OrbitControls } from 'three/addons/controls/OrbitControls.js'. Le chemin three/examples/jsm/... est l'ancienne forme (avant r150) et ne doit plus être utilisé.
Quel est le rôle du 3e argument false dans renderer.setSize(w, h, false) ?|Il empêche Three.js d'écrire la taille CSS du canvas (styles inline). Le drawing buffer est réglé à w×h mais l'affichage reste piloté par le CSS — indispensable quand le canvas est dimensionné par la mise en page.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-13-threejs-fondamentaux/README.md`. Monter de zéro une scène Three.js (r185) avec un cube animé, `OrbitControls` et gestion du resize, qui tourne dans un vrai navigateur — corrigé HTML/TS commenté intégral.
