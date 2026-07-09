# Lab 17 — Performance et optimisation

> **Outcome :** à la fin, tu sais transformer une scène Three.js qui rame en une scène fluide (60 FPS) en remplaçant N meshes par un `InstancedMesh` et en ajoutant du LOD, en mesurant le gain avec `renderer.info`.
> **Vrai outil :** Three.js (r160+) dans un vrai navigateur (Chrome/Edge, WebGL) — pas de harnais simulé.
> **Feedback :** le coach valide en session à l'écran (draw calls et FPS observés), pas de test-runner auto-correcteur.

## Énoncé

On te fournit une scène **volontairement non optimisée** qui reproduit le globe TribuZen du module : 5 000 marqueurs, chacun son propre `Mesh` et son propre `MeshStandardMaterial`, plus un globe central à géométrie unique haute densité. Sur un laptop moyen, elle tourne autour de **15-20 FPS**.

Ta mission : ramener la scène à **1-2 draw calls pour les marqueurs** et **60 FPS**, sans changer le rendu visuel, puis **mesurer** le gain.

### Starter (à copier dans un dossier vide)

`index.html` :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Lab 17 — Globe TribuZen non optimisé</title>
  <style>body { margin: 0; overflow: hidden; }</style>
  <script type="importmap">
    {
      "imports": {
        "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
        "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
      }
    }
  </script>
</head>
<body>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

`main.ts` — **la version qui rame** (point de départ) :

```typescript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a1a);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 100);
camera.position.set(0, 0, 3);
new OrbitControls(camera, renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.position.set(5, 3, 5);
scene.add(sun);

// Globe central (une seule géométrie, haute densité)
const globe = new THREE.Mesh(
  new THREE.SphereGeometry(1, 128, 96),
  new THREE.MeshStandardMaterial({ color: 0x1b3a6b, roughness: 0.8 }),
);
scene.add(globe);

function latLonToVec3(lat: number, lon: number, r = 1.01): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

// ❌ 5 000 marqueurs = 5 000 Mesh + 5 000 Material = 5 000+ draw calls
const markerGeo = new THREE.SphereGeometry(0.008, 8, 8);
for (let i = 0; i < 5000; i++) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x1ecb6b });
  const m = new THREE.Mesh(markerGeo, mat);
  const lat = Math.random() * 180 - 90;
  const lon = Math.random() * 360 - 180;
  m.position.copy(latLonToVec3(lat, lon));
  scene.add(m);
}

function animate(): void {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();

// Log des stats chaque seconde
setInterval(() => {
  const info = renderer.info;
  console.log(`calls=${info.render.calls} tri=${info.render.triangles} geo=${info.memory.geometries}`);
}, 1000);
```

Sers le dossier avec n'importe quel serveur statique (`npx serve`, extension Live Server…) et ouvre-le dans Chrome. Note le `calls=` de départ dans la console.

## Étapes (en friction)

1. **Mesure le point de départ.** Ouvre la console, lis `calls=` et estime le FPS (DevTools › Performance, ou ton ressenti au drag). Écris le chiffre quelque part — c'est ta baseline.
2. **Ajoute `stats.js`.** Importe `Stats` depuis `three/addons/libs/stats.module.js`, encadre le rendu avec `stats.begin()` / `stats.end()`. Tu dois VOIR le FPS bas.
3. **Remplace les 5 000 `Mesh` par un seul `InstancedMesh`.** Une géométrie, un matériau partagés. Utilise un `THREE.Object3D` tampon (`dummy`) + `setMatrixAt`. N'oublie pas `instanceMatrix.needsUpdate = true`. Vérifie que `calls` chute.
4. **Colore par état.** Attribue à chaque instance une couleur aléatoire parmi vert/orange/gris via `setColorAt`, puis `instanceColor.needsUpdate = true`.
5. **Ajoute un LOD au globe.** Remplace le `Mesh` du globe par un `THREE.LOD` à 3 niveaux (128×96, 48×32, 16×12 segments). Vérifie que le nombre de triangles baisse quand tu recules la caméra.
6. **Compare.** Relis `renderer.info.render.calls` et le FPS. Écris le gain (avant → après). Cible : marqueurs en 1 draw call, 60 FPS.

Ne recopie pas le corrigé avant d'avoir buté sur au moins l'étape 3.

## Corrigé complet commenté

```typescript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Stats from 'three/addons/libs/stats.module.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a1a);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 100);
camera.position.set(0, 0, 3);
new OrbitControls(camera, renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.position.set(5, 3, 5);
scene.add(sun);

// ─── ÉTAPE 5 : globe en LOD (3 niveaux) ──────────────────────
// Un seul matériau partagé par les 3 niveaux.
const globeMat = new THREE.MeshStandardMaterial({ color: 0x1b3a6b, roughness: 0.8 });
const globe = new THREE.LOD();
// addLevel(object, distance) : distance = seuil d'affichage, chaînable.
globe.addLevel(new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), globeMat), 0);
globe.addLevel(new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), globeMat), 4);
globe.addLevel(new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), globeMat), 8);
// autoUpdate est true par défaut : le renderer choisit le niveau chaque frame.
scene.add(globe);

function latLonToVec3(lat: number, lon: number, r = 1.01): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

// ─── ÉTAPES 3+4 : 5 000 marqueurs → 1 InstancedMesh coloré ──
const COUNT = 5000;
// ✅ UNE géométrie, UN matériau partagés.
const markerGeo = new THREE.SphereGeometry(0.008, 8, 8);
const markerMat = new THREE.MeshStandardMaterial({ roughness: 0.6 });

// ✅ InstancedMesh(geometry, material, count) — 1 draw call pour les 5 000.
const markers = new THREE.InstancedMesh(markerGeo, markerMat, COUNT);

const ETATS = [0x1ecb6b, 0xff9800, 0x777777]; // vert / orange / gris
const dummy = new THREE.Object3D();  // tampon pour composer chaque matrice d'instance
const color = new THREE.Color();

for (let i = 0; i < COUNT; i++) {
  const lat = Math.random() * 180 - 90;
  const lon = Math.random() * 360 - 180;
  dummy.position.copy(latLonToVec3(lat, lon));
  dummy.updateMatrix();                 // recompose dummy.matrix depuis la position
  markers.setMatrixAt(i, dummy.matrix); // matrice de l'instance i

  color.setHex(ETATS[i % ETATS.length]);
  markers.setColorAt(i, color);         // couleur de l'instance i
}

// ✅ OBLIGATOIRE : sans ça, le GPU ne relit pas les buffers → rien ne s'affiche/bouge.
markers.instanceMatrix.needsUpdate = true;
if (markers.instanceColor) markers.instanceColor.needsUpdate = true;
scene.add(markers);

// ─── ÉTAPE 2 : stats.js ──────────────────────────────────────
const stats = new Stats();
document.body.appendChild(stats.dom);

// ─── Boucle de rendu ────────────────────────────────────────
function animate(): void {
  stats.begin();
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
  stats.end();
}
animate();

// ─── ÉTAPES 1+6 : mesure avant/après ────────────────────────
setInterval(() => {
  const info = renderer.info;
  // Attendu : calls ~2-3 (globe + marqueurs), au lieu de ~5000.
  console.log(`calls=${info.render.calls} tri=${info.render.triangles} geo=${info.memory.geometries}`);
}, 1000);

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
```

**Résultat attendu :** `calls` passe de ~5000 à **~2-3**, FPS de ~15-20 à **60 stable**, rendu visuel inchangé. En reculant la caméra, `tri` diminue grâce au LOD du globe.

### Grille d'auto-évaluation

| Critère | Non acquis | En cours | Acquis |
|---|---|---|---|
| Diagnostic | ne sait pas où lire les draw calls | lit `renderer.info` mais n'interprète pas | lit `render.calls`/`triangles`, conclut CPU vs GPU-bound |
| Instancing | recopie sans comprendre `dummy` | InstancedMesh posé mais `needsUpdate` oublié | 1 draw call, matrices + couleurs par instance correctes |
| LOD | aucun LOD | LOD posé sans gain (niveaux identiques) | 3 niveaux vraiment dégressifs, `tri` baisse en reculant |
| Mesure | pas de chiffre avant/après | un seul des deux | baseline ET résultat notés, gain formulé |

### Coach — vérifier en session

1. **Fais-lui expliquer le rôle du `dummy`** : pourquoi passer par un `Object3D` tampon plutôt que `markers.position`. S'il ne sait pas → piège #6 du module (la position vit dans la matrice d'instance).
2. **Commente `instanceMatrix.needsUpdate = true`** et demande ce qui se passe. S'il ne prédit pas « les instances ne s'affichent/bougent pas » → piège #1, à réancrer.
3. **Demande le diagnostic** : `render.calls` élevé signifie quoi ? (CPU-bound). `render.triangles` élevé ? (GPU-bound). S'il confond les deux → piège #2.
4. **Bonus** : « et si les marqueurs avaient des géométries différentes ? » → attendu : `mergeGeometries`, pas l'instancing.

## Variante J+30 (fading)

Reprends l'exercice **sans regarder le corrigé**, en **20 minutes chrono**, avec **une contrainte ajoutée** : les marqueurs doivent aussi être **disposés proprement** quand on appuie sur la touche `D` (simule un changement de famille). Écris `disposeMarkers(markers)` qui fait `remove` + `geometry.dispose()` + `material.dispose()` + `markers.dispose()`, et vérifie dans la console que `renderer.info.memory.geometries` **redescend**. Si tu n'y arrives pas de tête sur l'instancing, c'est le piège #1 ou le rôle du `dummy` à réviser.

## Application TribuZen

Porte ce lab dans le vrai produit. Dans `smaurier/tribuzen`, la couche globe :

- `src/3d/globe/MarkerLayer.ts` — `buildMarkers(sorties)` construit l'`InstancedMesh`, `setMatrixAt` depuis les vraies coordonnées géo, `setColorAt` selon `sortie.etat`.
- `src/3d/globe/GlobeMesh.ts` — le `THREE.LOD` de la sphère texturée.
- `src/3d/globe/disposeGlobe.ts` — `disposeMarkers` appelé au changement de famille (la fuite VRAM du cas concret).
- `src/3d/perf/PerfMonitor.ts` — lecture `renderer.info` + `stats.js` en dev, cible < 50 draw calls.

Commit suggéré sur `smaurier/tribuzen` : `perf(globe): instancing des marqueurs + LOD + dispose (5000 meshes → 2 draw calls, 60 FPS)`.
