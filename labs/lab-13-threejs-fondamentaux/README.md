# Lab 13 — Three.js fondamentaux

> **Outcome :** à la fin, tu sais monter de zéro une scène Three.js (r185) avec un cube animé, `OrbitControls` et gestion du resize, qui tourne dans un vrai navigateur.
> **Vrai outil :** Three.js r185 dans le navigateur (Chrome/Firefox), via une simple import map — aucun bundler, aucun harnais simulé.
> **Feedback :** le coach valide en session (pas de test-runner auto-correcteur). Le critère est visuel : le cube tourne, s'oriente à la souris, reste net, ne se déforme pas au resize.

## Énoncé

Tu poses la **brique zéro du globe des sorties de TribuZen** : une scène Three.js minimale mais complète. Objectif visuel — un **cube coloré qui tourne** sur fond sombre, **orbitable à la souris**, **net sur écran HiDPI**, **correct après redimensionnement** de la fenêtre, avec une **grille au sol** et les **axes de repère**.

Contrainte : tout le rendu passe par Three.js (aucune ligne de GLSL, aucun calcul matriciel à la main). Version de référence : **Three.js r185**.

### Starter (à créer, deux fichiers)

**`index.html`** — fourni intégralement, canvas + import map. Ne rien changer ici :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Lab 13 — Globe TribuZen (squelette Three.js)</title>
  <style>
    html, body { margin: 0; height: 100%; background: #000; }
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
  <script type="module" src="./main.js"></script>
</body>
</html>
```

**`main.js`** — squelette à COMPLÉTER (les `// TODO` sont à toi) :

```javascript
import * as THREE from 'three';
// TODO 6 : importer OrbitControls depuis le bon chemin d'addon

const canvas = document.querySelector('#app');

// TODO 1 : créer le WebGLRenderer (canvas, antialias) + setPixelRatio capé à 2

// TODO 2 : créer la Scene + une couleur de fond

// TODO 3 : créer la PerspectiveCamera (fov, aspect, near, far) et la positionner

// TODO 4 : créer le Mesh cube = BoxGeometry + MeshStandardMaterial, l'ajouter à la scène

// TODO 5 : ajouter au moins une lumière (sinon le cube est NOIR) + AxesHelper + GridHelper

// TODO 6 : créer OrbitControls (enableDamping) + controls.update()

// TODO 7 : écrire resizeRendererToDisplaySize(renderer)

// TODO 8 : boucle setAnimationLoop — resize, rotation du cube, controls.update(), render
```

Lancer : n'importe quel serveur statique dans le dossier du lab, par ex.

```bash
npx serve .
# puis ouvrir l'URL affichée (http://localhost:3000)
```

(Un serveur est nécessaire : les modules ES et l'import map ne se chargent pas en `file://`.)

## Étapes (en friction)

Écris le code toi-même avant de regarder le corrigé. Ordre conseillé :

1. **Renderer** — `new THREE.WebGLRenderer({ canvas, antialias: true })`, puis `setPixelRatio(Math.min(window.devicePixelRatio, 2))`.
2. **Scene** — `new THREE.Scene()`, `scene.background = new THREE.Color(0x1a1a2e)`.
3. **Camera** — `PerspectiveCamera(75, clientWidth/clientHeight, 0.1, 100)`, `position.set(0, 1, 3)`.
4. **Mesh** — `BoxGeometry(1,1,1)` + `MeshStandardMaterial({ color })` → `Mesh` → `scene.add`.
5. **Lumières + helpers** — `AmbientLight` + `DirectionalLight` (sinon cube noir), `AxesHelper`, `GridHelper`.
6. **Contrôles** — `OrbitControls` depuis `three/addons/controls/OrbitControls.js`, `enableDamping = true`, `update()`.
7. **Resize** — écris `resizeRendererToDisplaySize(renderer)` (teste `clientWidth/Height`, `setSize(w, h, false)`).
8. **Boucle** — `renderer.setAnimationLoop(...)` : appliquer le resize (+ `updateProjectionMatrix`), tourner le cube, `controls.update()`, `renderer.render(scene, camera)`.

Vérifie à chaque étape dans le navigateur. Erreurs à débusquer toi-même : cube noir (pas de lumière ?), image étirée au resize (`updateProjectionMatrix` oublié ?), souris sans effet (mauvais chemin d'import OrbitControls, ou `update()` manquant).

## Corrigé complet commenté

```javascript
import * as THREE from 'three';
// Chemin d'addon canonique en r185 (PAS three/examples/jsm/)
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.querySelector('#app');

// 1. Renderer : crée et pilote le contexte WebGL2 (remplace getContext + config manuelle)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
// Cap le pixel ratio à 2 : net sur Retina sans surcharger un écran 3x
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// 2. Scene : le conteneur racine du graphe d'objets
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e); // bleu nuit

// 3. Camera : fov EN DEGRÉS, aspect = largeur/hauteur, near > 0, far petit
const camera = new THREE.PerspectiveCamera(
  75,
  canvas.clientWidth / canvas.clientHeight,
  0.1,
  100,
);
camera.position.set(0, 1, 3); // reculée et légèrement au-dessus

// 4. Mesh = Geometry (forme) + Material (apparence)
const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x00ff88, metalness: 0.3, roughness: 0.4 }),
);
scene.add(cube);

// 5. Lumières : SANS lumière, un MeshStandardMaterial est rendu NOIR
scene.add(new THREE.AmbientLight(0xffffff, 0.4));    // éclairage global doux
const sun = new THREE.DirectionalLight(0xffffff, 3); // lumière directionnelle (soleil)
sun.position.set(3, 4, 2);
scene.add(sun);

// Helpers de debug : axes (X rouge, Y vert, Z bleu) + grille au sol
scene.add(new THREE.AxesHelper(2));
scene.add(new THREE.GridHelper(10, 10, 0x444444, 0x222222));

// 6. Contrôles souris : orbiter / zoomer autour de la cible
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // inertie fluide
controls.target.set(0, 0, 0);
controls.update();             // applique la cible initiale

// 7. Resize : synchronise résolution du renderer + aspect de la caméra.
//    On teste dans la boucle (couvre aussi les changements de layout sans event resize).
function resizeRendererToDisplaySize(r) {
  const c = r.domElement;
  const needResize = c.width !== c.clientWidth || c.height !== c.clientHeight;
  if (needResize) {
    // false : ne PAS écrire la taille CSS — c'est le CSS qui pilote l'affichage
    r.setSize(c.clientWidth, c.clientHeight, false);
  }
  return needResize;
}

// 8. Boucle d'animation moderne (gère aussi WebXR le jour venu)
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const delta = clock.getDelta(); // secondes depuis la dernière frame

  if (resizeRendererToDisplaySize(renderer)) {
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix(); // OBLIGATOIRE après changement d'aspect
  }

  cube.rotation.y += 0.6 * delta;  // ~0.6 rad/s, indépendant du framerate
  controls.update();               // OBLIGATOIRE avec enableDamping
  renderer.render(scene, camera);  // dessine la frame
});
```

## Grille d'évaluation

| Critère | Attendu | OK ? |
|---|---|---|
| Trio monté | Scene + PerspectiveCamera + WebGLRenderer, `render(scene, camera)` appelé | ☐ |
| Mesh correct | `Mesh(BoxGeometry, MeshStandardMaterial)` ajouté à la scène | ☐ |
| Cube visible (pas noir) | au moins une lumière présente | ☐ |
| Animation | cube tourne, boucle via `setAnimationLoop`, delta-time (`Clock`) | ☐ |
| OrbitControls | import `three/addons/...`, `enableDamping` + `update()` dans la boucle | ☐ |
| Resize propre | `setSize(w,h,false)` + `aspect` + `updateProjectionMatrix()` | ☐ |
| Net HiDPI | `setPixelRatio(min(dpr, 2))` | ☐ |
| Zéro GLSL / zéro matrice à la main | tout passe par l'API Three.js | ☐ |

## Coach — questions de validation en session

Au moins trois, à poser à froid après le lab :

1. **Pourquoi ton cube serait-il noir si tu retires les lumières ?** (Attendu : `MeshStandardMaterial` réagit à la lumière ; sans source, il ne renvoie aucune couleur. `MeshBasicMaterial` resterait visible.)
2. **Que se passe-t-il exactement si tu supprimes `camera.updateProjectionMatrix()` de la branche resize ?** (Attendu : `camera.aspect` change mais la matrice de projection garde l'ancienne valeur → image étirée/écrasée.)
3. **Pourquoi `controls.update()` est-il dans la boucle et pas appelé une seule fois ?** (Attendu : avec `enableDamping`, l'inertie s'intègre frame par frame ; un seul appel fige le comportement.)
4. **Mappe trois objets Three.js de ce lab vers leur équivalent WebGL brut du module 08.** (Attendu, ex : `BoxGeometry` → VBO/index buffer ; `MeshStandardMaterial` → shaders GLSL ; `camera` + `mesh.rotation` → matrices view/projection/model.)
5. **Que fait le 3e argument `false` de `setSize(w, h, false)` ?** (Attendu : empêche Three.js d'écrire la taille CSS ; seul le drawing buffer est réglé, le CSS pilote l'affichage.)

## Variante J+30 (fading)

Reprendre le lab **sans regarder le corrigé**, en **20 minutes chrono**, avec deux contraintes ajoutées :

1. Remplacer la `BoxGeometry` par une **`SphereGeometry`** (le globe) — vérifier que **rien d'autre** ne change (Material, lumières, contrôles, resize).
2. Ajouter **un marqueur** : un petit `Mesh` (`SphereGeometry` + `MeshBasicMaterial` rouge) **enfant du globe** (`globe.add(marker)`, pas `scene.add`), positionné sur la surface — et vérifier qu'il **tourne avec** le globe.

Objectif : prouver que la séparation Geometry / Material et le graphe de scène hiérarchique sont acquis sans support.

## Application TribuZen

Ce squelette devient le socle du **globe interactif des sorties** dans `smaurier/tribuzen` :

```
tribuzen/
  src/
    3d/
      three/
        createScene.ts   ← Scene + Camera + WebGLRenderer + lumières (corrigé de ce lab)
        Globe.ts         ← SphereGeometry + OrbitControls + boucle setAnimationLoop
      GlobeCanvas.vue    ← <canvas> hôte ; onUnmounted(() => renderer.setAnimationLoop(null))
```

Portage concret :

- extraire le corrigé en `createScene.ts` (retourne `{ scene, camera, renderer }`) et `Globe.ts` (la sphère + les contrôles + la boucle) ;
- monter la boucle dans `GlobeCanvas.vue` au `onMounted`, et **libérer** au `onUnmounted` avec `renderer.setAnimationLoop(null)` + `dispose()` des géométries/matériaux (fuite mémoire sinon) ;
- commit `smaurier/tribuzen` : `feat(3d): squelette globe des sorties (Three.js scene + OrbitControls)`.
