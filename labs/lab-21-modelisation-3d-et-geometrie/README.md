# Lab 21 — Modélisation 3D et géométrie procédurale

> **Outcome :** à la fin, tu sais générer **par code** un terrain procédural en `BufferGeometry` indexée (grille + heightfield + normales) et l'afficher éclairé dans un vrai navigateur.
> **Vrai outil :** Three.js r185 dans le navigateur (Chrome/Firefox), via une simple import map — aucun bundler, aucun harnais simulé.
> **Feedback :** le coach valide en session (pas de test-runner auto-correcteur). Critère visuel : un terrain ondulé, éclairé de façon cohérente (le relief se lit), orbitable, sans trou de bordure ni face manquante.

## Énoncé

Tu poses le **relief de la carte des sorties de TribuZen** : plus de primitive toute faite, tu **construis la géométrie**. Objectif — un **terrain vert ondulé** généré entièrement par code, éclairé correctement (les collines projettent des dégradés, pas une couleur plate), orbitable à la souris.

Contrainte : le terrain doit être une `BufferGeometry` **indexée** (`position`, `uv`, `setIndex`) déformée par une **fonction de hauteur**, avec des **normales recalculées**. Aucun asset, aucun fichier de modèle. Version de référence : **Three.js r185**.

### Starter (à créer, deux fichiers)

**`index.html`** — fourni intégralement, canvas + import map. Ne rien changer ici :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Lab 21 — Terrain procédural TribuZen</title>
  <style>
    html, body { margin: 0; height: 100%; background: #0b0f14; }
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
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.querySelector('#app');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);

const camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
camera.position.set(10, 8, 14);

scene.add(new THREE.AmbientLight(0xffffff, 0.35));
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.position.set(6, 10, 4);
scene.add(sun);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// TODO 1 : écrire une fonction height(x, z) qui renvoie une hauteur (sin/cos ou autre)

// TODO 2 : écrire createTerrainGeometry(width, depth, segX, segZ, height)
//   - double boucle (segX+1)×(segZ+1) : pousser positions.push(x, height(x,z), z) + uv
//   - indices : 2 triangles par cellule, winding CCW
//   - setAttribute('position'/'uv'), setIndex(Uint32BufferAttribute)
//   - computeVertexNormals() PUIS computeBoundingSphere()

// TODO 3 : créer le Mesh(terrain, MeshStandardMaterial vert) et l'ajouter à la scène

// TODO 4 : (bonus) poser un petit marqueur Mesh sur la surface à un (x,z) donné, au bon y = height(x,z)

function resizeRendererToDisplaySize(r) {
  const c = r.domElement;
  const needResize = c.width !== c.clientWidth || c.height !== c.clientHeight;
  if (needResize) r.setSize(c.clientWidth, c.clientHeight, false);
  return needResize;
}

renderer.setAnimationLoop(() => {
  if (resizeRendererToDisplaySize(renderer)) {
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
  }
  controls.update();
  renderer.render(scene, camera);
});
```

Lancer : n'importe quel serveur statique dans le dossier du lab, par ex.

```bash
npx serve .
# puis ouvrir l'URL affichée (http://localhost:3000)
```

(Un serveur est nécessaire : les modules ES et l'import map ne se chargent pas en `file://`.)

## Étapes (en friction)

Écris le code toi-même avant de regarder le corrigé. Ordre conseillé :

1. **`height(x, z)`** — commence simple : `Math.sin(x * 0.6) * Math.cos(z * 0.6) * 0.8`.
2. **Sommets** — double boucle `for j in 0..segZ`, `for i in 0..segX` (bornes **inclusives** : `<=`). Centrer : `x = (i/segX - 0.5) * width`. `positions.push(x, height(x, z), z)` et `uvs.push(i/segX, j/segZ)`.
3. **Indices** — pour chaque cellule `(i, j)` avec `cols = segX + 1`, calcule `a, b, c, d` (les 4 coins) et `push(a, c, b, b, c, d)`.
4. **Assemblage** — `setAttribute('position', new Float32BufferAttribute(positions, 3))`, idem `'uv'` (itemSize 2), `setIndex(new Uint32BufferAttribute(indices, 1))`.
5. **Normales** — `geometry.computeVertexNormals()` PUIS `computeBoundingSphere()`.
6. **Mesh** — `MeshStandardMaterial({ color: 0x4c8a3a, roughness: 0.9 })`, ajoute à la scène.
7. **Bonus marqueur** — un petit `Mesh(SphereGeometry(0.15), MeshBasicMaterial(rouge))` à `(x, height(x,z), z)`.

Débusque toi-même : terrain plat/uniforme (`computeVertexNormals` oublié ?), trou en bordure (boucle `<` au lieu de `<=` ?), terrain visible seulement de dessous (winding des indices inversé ?), triangles aberrants qui traversent (`Uint16` au lieu de `Uint32` sur grosse grille ?).

## Corrigé complet commenté

```javascript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.querySelector('#app');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);

const camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
camera.position.set(10, 8, 14);

scene.add(new THREE.AmbientLight(0xffffff, 0.35));
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.position.set(6, 10, 4);
scene.add(sun);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// TODO 1 — fonction de hauteur : relief doux (au module 19, on remplacera par du bruit simplex)
function height(x, z) {
  return Math.sin(x * 0.6) * Math.cos(z * 0.6) * 0.8;
}

// TODO 2 — génération procédurale d'un terrain heightfield indexé
function createTerrainGeometry(width, depth, segX, segZ, heightFn) {
  const positions = [];
  const uvs = [];
  const cols = segX + 1; // nb de sommets par rangée (bornes inclusives)

  // Sommets : (segX+1) × (segZ+1), poussés en hauteur par heightFn
  for (let j = 0; j <= segZ; j++) {
    for (let i = 0; i <= segX; i++) {
      const x = (i / segX - 0.5) * width;  // centré en 0
      const z = (j / segZ - 0.5) * depth;
      positions.push(x, heightFn(x, z), z);
      uvs.push(i / segX, j / segZ);
    }
  }

  // Indices : 2 triangles par cellule, winding CCW (face visible vers le haut)
  const indices = [];
  for (let j = 0; j < segZ; j++) {
    for (let i = 0; i < segX; i++) {
      const a =  j      * cols + i;      // bas-gauche
      const b =  j      * cols + i + 1;  // bas-droit
      const c = (j + 1) * cols + i;      // haut-gauche
      const d = (j + 1) * cols + i + 1;  // haut-droit
      indices.push(a, c, b,   b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2));
  // Uint32 : grille extensible au-delà de 65535 sommets sans débordement d'index
  geometry.setIndex(new THREE.Uint32BufferAttribute(indices, 1));

  // Normales APRÈS déformation, sur géométrie indexée (lissage entre faces)
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere(); // pour le frustum culling / raycast
  return geometry;
}

// TODO 3 — le terrain de la carte des sorties
const terrainGeometry = createTerrainGeometry(20, 20, 120, 120, height);
const terrain = new THREE.Mesh(
  terrainGeometry,
  new THREE.MeshStandardMaterial({ color: 0x4c8a3a, roughness: 0.9 }),
);
scene.add(terrain);

// TODO 4 (bonus) — un marqueur de sortie posé SUR la surface (même height que le terrain)
const mx = 3, mz = -2;
const marker = new THREE.Mesh(
  new THREE.SphereGeometry(0.2, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0xff4433 }), // Basic : visible même sans lumière
);
marker.position.set(mx, height(mx, mz) + 0.2, mz); // +rayon pour poser dessus, pas dedans
scene.add(marker);

// Helpers de repère (facultatif, pour le debug)
scene.add(new THREE.AxesHelper(3));

function resizeRendererToDisplaySize(r) {
  const c = r.domElement;
  const needResize = c.width !== c.clientWidth || c.height !== c.clientHeight;
  if (needResize) r.setSize(c.clientWidth, c.clientHeight, false);
  return needResize;
}

renderer.setAnimationLoop(() => {
  if (resizeRendererToDisplaySize(renderer)) {
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
  }
  controls.update();
  renderer.render(scene, camera);
});
```

## Grille d'évaluation

| Critère | Attendu | OK ? |
|---|---|---|
| Géométrie manuelle | `BufferGeometry` construite par code (pas `PlaneGeometry`) | ☐ |
| Attributs corrects | `setAttribute('position', ..., itemSize 3)` + `'uv'` (itemSize 2) | ☐ |
| Indexée | `setIndex(Uint32BufferAttribute)`, sommets non dupliqués | ☐ |
| Heightfield | sommets poussés par `height(x, z)`, relief visible | ☐ |
| Normales | `computeVertexNormals()` appelé **après** la déformation | ☐ |
| Éclairage cohérent | le relief se lit (dégradés), pas une couleur plate | ☐ |
| Pas de trou de bordure | boucles inclusives `<= segX/segZ` | ☐ |
| Faces visibles de dessus | winding CCW correct (pas visible que de dessous) | ☐ |
| Bonus marqueur | posé au bon `y = height(x, z)` (+ rayon) | ☐ |

## Coach — questions de validation en session

Au moins trois, à poser à froid après le lab :

1. **Pourquoi ton terrain apparaît-il uniforme en couleur si tu retires `computeVertexNormals()` ?** (Attendu : la grille garde ses normales verticales d'origine → l'éclairage est plat, le relief géométrique existe mais ne se lit pas. Les normales doivent suivre la déformation.)
2. **Pourquoi indexer la grille plutôt que dupliquer les sommets ?** (Attendu : chaque sommet intérieur est partagé par 6 triangles ; l'indexation le stocke une fois → ~6× moins de mémoire, meilleur cache GPU. `setIndex` référence les sommets uniques.)
3. **Pourquoi `Uint32` et pas `Uint16` pour les indices ?** (Attendu : `Uint16` code 0..65535 ; une grille 120×120 = 14641 sommets tient, mais dès 256×256 = 66049 sommets Uint16 déborde silencieusement → triangles aberrants. Uint32 est sûr.)
4. **Que se passe-t-il si tu inverses l'ordre des indices d'un triangle (`a, b, c` au lieu de `a, c, b`) ?** (Attendu : le winding s'inverse, la face avant devient l'arrière → face culée, terrain visible seulement de dessous. Debug : `material.side = THREE.DoubleSide`.)
5. **Comment poses-tu un marqueur pile sur la surface du terrain ?** (Attendu : évaluer la **même** fonction `height(x, z)` à la position du marqueur pour son `y`, + le rayon pour poser dessus et non dedans.)

## Variante J+30 (fading)

Reprendre le lab **sans regarder le corrigé**, en **25 minutes chrono**, avec deux contraintes ajoutées :

1. **Anime le terrain** : transforme-le en surface d'eau ondulante. Dans la boucle, mute l'attribut `position` (`geometry.attributes.position.getX/getZ`, `setY` avec un `height` qui dépend du temps), pose `position.needsUpdate = true` **et** rappelle `computeVertexNormals()` chaque frame. Vérifie que l'éclairage suit les vagues.
2. **Sans réutiliser `Float32BufferAttribute`** : construis l'attribut `position` avec la forme explicite `new THREE.BufferAttribute(new Float32Array(...), 3)` pour prouver que tu maîtrises le contrat array + itemSize.

Objectif : prouver que la mutation d'attributs, le recalcul de normales et le contrat `BufferAttribute` sont acquis sans support.

## Application TribuZen

Ce terrain devient le socle du **relief de la carte des sorties** dans `smaurier/tribuzen` :

```
tribuzen/
  src/
    3d/
      three/
        geometry/
          createTerrainGeometry.ts  ← corrigé de ce lab (grille indexée + heightfield + normales)
          heightField.ts            ← height(x, z) (sin/cos ici → bruit simplex au module 19)
        Map3D.ts                    ← Mesh(terrain) + pose des marqueurs via height(x, z)
      MapCanvas.vue                 ← <canvas> ; geometry.dispose() au onUnmounted
```

Portage concret :

- extraire le corrigé en `createTerrainGeometry.ts` (typé : `(width, depth, segX, segZ, height) => THREE.BufferGeometry`) et `heightField.ts` ;
- brancher la pose des marqueurs de sorties : pour chaque sortie, `marker.position.y = height(x, z) + rayon` ;
- **libérer** au démontage : `geometry.dispose()` au `onUnmounted` (fuite GPU sinon), comme la boucle du module 13 ;
- commit `smaurier/tribuzen` : `feat(3d): relief procédural de la carte des sorties (BufferGeometry heightfield)`.
