---
titre: Performance et optimisation
cours: 20-webgpu-3d
notions:
  - "budget de frame (16.7 ms à 60 FPS, 8.3 ms à 120 FPS)"
  - "draw call comme unité de coût CPU"
  - "instancing avec InstancedMesh (setMatrixAt, setColorAt, instanceMatrix.needsUpdate)"
  - "merge de géométries statiques (BufferGeometryUtils.mergeGeometries, applyMatrix4)"
  - "Level of Detail (THREE.LOD, addLevel, update)"
  - "frustum culling (frustumCulled, boundingSphere)"
  - "gestion des textures (atlas, résolution adaptée, partage)"
  - "dispose pattern (geometry/material/texture) et fuites VRAM"
  - "profiling GPU (renderer.info, stats.js, spector.js)"
  - "diagnostic CPU-bound vs GPU-bound"
outcomes:
  - sait définir un budget de frame et lire renderer.info pour situer une scène par rapport à ce budget
  - sait remplacer N meshes identiques par un InstancedMesh (1 draw call) avec matrices et couleurs par instance
  - sait fusionner des géométries statiques distinctes avec mergeGeometries et choisir entre instancing et merge
  - sait ajouter des niveaux de LOD et comprendre le frustum culling automatique de Three.js
  - sait disposer geometries/materials/textures pour éviter les fuites VRAM et profiler avec stats.js / spector.js
prerequis:
  - "00-prerequis-et-introduction (GPU, aperçu pipeline)"
  - "04-pipeline-de-rendu (draw call, vertex/fragment, coût du rendu)"
  - "13-threejs-fondamentaux (scene/camera/renderer, Mesh, boucle de rendu, renderer.info)"
  - "14-materiaux-et-lumieres-threejs (materials, coût des shaders)"
  - "15-modeles-et-animations (glTF, meshes chargés à disposer)"
  - "16-post-processing-et-effets (passes coûteuses, render targets)"
next: 18-shadow-mapping
libs: [{ name: three, version: "r160+" }]
tribuzen: "moteur de rendu 3D TribuZen — le globe des sorties de la famille affiche 10 000 marqueurs et doit rester fluide (60 FPS) sur un laptop moyen : instancing des marqueurs, LOD sur les icônes, dispose au changement de vue"
last-reviewed: 2026-07
---

# Performance et optimisation

> **Outcomes — tu sauras FAIRE :** définir un budget de frame et lire `renderer.info`, remplacer N meshes par un `InstancedMesh`, fusionner des géométries statiques, ajouter du LOD, et disposer les ressources GPU pour éviter les fuites VRAM.
> **Difficulté :** :star::star::star::star:
>
> **Portée :** ce module suppose que tu sais déjà monter une scène Three.js (module 13), poser des matériaux (14) et charger des modèles (15). On ne construit plus une scène : on **diagnostique** pourquoi elle rame et on **réduit son coût**. Le shadow mapping (source majeure de coût GPU) est le sujet du **module 18**.

## 1. Cas concret d'abord

TribuZen a désormais un **globe 3D des sorties de la famille** (module 13) : chaque sortie passée ou prévue est un marqueur posé à sa coordonnée sur une sphère. Sur ton compte de démo, tout va bien : 40 marqueurs, 60 FPS.

Puis on branche les données réelles de la beta : **10 000 sorties** cumulées sur toutes les familles inscrites. Le globe passe à **12 FPS**, le laptop chauffe, l'interface de zoom devient saccadée. Voici le code coupable :

```typescript
// ❌ Un Mesh par marqueur : 10 000 objets, 10 000 draw calls
const markerGeo = new THREE.SphereGeometry(0.02, 16, 16);

for (const sortie of sorties) {          // 10 000 itérations
  const mat = new THREE.MeshStandardMaterial({ color: 0x44aaff }); // 10 000 matériaux !
  const marker = new THREE.Mesh(markerGeo, mat);
  marker.position.copy(latLonToVec3(sortie.lat, sortie.lon));
  globe.add(marker);
}
```

Trois désastres cumulés :

1. **10 000 draw calls.** Chaque `Mesh` visible = un ordre de dessin envoyé au GPU par le CPU. Le CPU passe tout son temps à préparer des draw calls au lieu de laisser le GPU travailler : la scène est **CPU-bound**.
2. **10 000 matériaux.** Un `MeshStandardMaterial` par marqueur force le renderer à changer d'état GPU (shader, uniforms) à chaque objet — alors qu'un seul suffirait.
3. **Aucun dispose.** Quand l'utilisateur change de famille, on refait la boucle sans libérer les 10 000 marqueurs précédents : la VRAM grimpe à chaque changement de vue jusqu'au crash.

L'objectif de ce module : ramener ces 10 000 marqueurs à **1 seul draw call**, tenir **60 FPS**, et ne jamais fuir de VRAM. On y arrive avec l'instancing, le LOD et le dispose pattern.

---

## 2. Théorie complète, concise

### 2.1 Le budget de frame : le compte à rebours de 16.7 ms

Le rendu temps réel est une contrainte de **temps par frame**, pas de « qualité maximale ». Pour afficher une image fluide, chaque frame doit être calculée avant que l'écran ne rafraîchisse :

```
60 FPS  →  16.7 ms par frame   (standard écran)
120 FPS →   8.3 ms par frame   (écrans haute fréquence, VR)
30 FPS  →  33.3 ms par frame   (minimum acceptable, saccades visibles)
```

Ces 16.7 ms se répartissent entre **CPU** (JavaScript : animations, traversée de scène, préparation des draw calls) et **GPU** (transformation des sommets, rasterisation, fragments, post-processing). Dépasser le budget = frames sautées = saccades.

La première question d'optimisation n'est jamais « comment rendre plus beau » mais **« où part le temps ? »**.

### 2.2 Le draw call : l'unité de coût CPU

Un **draw call** est un ordre « dessine cet objet » envoyé du CPU au GPU. Chaque draw call a un coût CPU fixe (validation d'état, changement de shader/buffer) indépendant du nombre de triangles. Résultat contre-intuitif :

- **1 objet de 100 000 triangles** = 1 draw call, souvent peu cher côté CPU.
- **10 000 objets de 10 triangles** = 10 000 draw calls = CPU saturé.

C'est pourquoi `renderer.info.render.calls` est la métrique reine. Réduire les draw calls (instancing, merge, matériaux partagés) est le premier levier.

### 2.3 Diagnostiquer : `renderer.info`

Three.js expose un objet de statistiques gratuit et précis. À lire chaque seconde pendant le développement :

```typescript
const info = renderer.info;
console.log('Draw calls :', info.render.calls);       // ordres de dessin par frame
console.log('Triangles  :', info.render.triangles);   // triangles rendus par frame
console.log('Geometries :', info.memory.geometries);  // géométries EN VRAM
console.log('Textures   :', info.memory.textures);    // textures EN VRAM
```

Lecture du diagnostic :

- `render.calls` élevé (> 500) → **CPU-bound** → instancing, merge, matériaux partagés.
- `render.triangles` élevé (> 2 M) → **GPU-bound (vertex)** → LOD, simplification.
- `memory.textures` qui **monte sans jamais redescendre** → **fuite VRAM** → dispose manquant.

`memory.geometries` et `memory.textures` comptent ce qui est **résident en VRAM**, pas ce qui est visible — ce sont les compteurs à surveiller pour les fuites.

### 2.4 Instancing : `InstancedMesh`

Quand N objets partagent **la même géométrie et le même matériau** (nos 10 000 marqueurs sphériques), `InstancedMesh` les dessine **en un seul draw call**. Chaque instance a sa propre matrice de transformation (et optionnellement sa couleur), stockée dans un buffer GPU.

Signature confirmée sur la doc Three.js (r160) :

```typescript
// InstancedMesh(geometry, material, count)
const markers = new THREE.InstancedMesh(markerGeo, sharedMat, 10_000);

const dummy = new THREE.Object3D();   // objet-tampon pour composer chaque matrice
for (let i = 0; i < 10_000; i++) {
  dummy.position.copy(positions[i]);
  dummy.updateMatrix();                // recalcule dummy.matrix depuis pos/rot/scale
  markers.setMatrixAt(i, dummy.matrix); // écrit la matrice de l'instance i
}
markers.instanceMatrix.needsUpdate = true; // OBLIGATOIRE : sinon le GPU ne relit pas
```

Deux points critiques (doc Three.js) :

- **`instanceMatrix.needsUpdate = true`** après avoir posé les matrices, sinon le buffer GPU n'est pas ré-uploadé et rien ne bouge.
- Pour une couleur par instance : `setColorAt(i, color)` puis `instanceColor.needsUpdate = true`. (`instanceColor` est `null` tant que `setColorAt` n'a pas été appelé au moins une fois.)

### 2.5 Merge de géométries statiques : `mergeGeometries`

L'instancing exige la **même** géométrie. Pour des objets **statiques aux géométries différentes** mais **au même matériau** (ex. un décor de bâtiments), on fusionne toutes les géométries en **une seule** avec `BufferGeometryUtils.mergeGeometries` (confirmé sur `threejs.org/manual`, page « optimize lots of objects ») :

```typescript
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

const geometries: THREE.BufferGeometry[] = [];
for (const bloc of blocs) {
  const geo = new THREE.BoxGeometry(bloc.w, bloc.h, bloc.d);
  const m = new THREE.Matrix4().makeTranslation(bloc.x, bloc.y, bloc.z);
  geo.applyMatrix4(m);        // fige la position DANS les sommets, AVANT le merge
  geometries.push(geo);
}

const merged = BufferGeometryUtils.mergeGeometries(geometries, false);
const mesh = new THREE.Mesh(merged, sharedMat);   // 1 seul draw call
geometries.forEach((g) => g.dispose());           // libère les géométries sources
```

Le point clé : `applyMatrix4` **cuit** la transformation dans les sommets, car après le merge il n'y a plus qu'un objet — on ne peut plus déplacer les blocs individuellement.

### 2.6 Instancing vs merge : le bon outil

| Critère | `InstancedMesh` | `mergeGeometries` |
|---|:---:|:---:|
| Géométries | Identiques (obligatoire) | Différentes OK |
| Matériau | Partagé | Partagé |
| Objets déplaçables après coup | Oui (`setMatrixAt`) | Non (figés) |
| Couleur par objet | Oui (`setColorAt`) | Via vertex colors |
| Cas TribuZen | 10 000 marqueurs identiques | décor statique du globe |

### 2.7 Level of Detail : `THREE.LOD`

Afficher un objet à 50 000 triangles alors qu'il fait 3 pixels à l'écran est du gaspillage. Le **LOD** affiche une version simplifiée selon la distance à la caméra :

```typescript
const lod = new THREE.LOD();
lod.addLevel(highDetailMesh, 0);    // affiché de 0 à 15 unités
lod.addLevel(midDetailMesh, 15);    // affiché de 15 à 40
lod.addLevel(lowDetailMesh, 40);    // affiché au-delà de 40
scene.add(lod);
```

Signature doc : `addLevel(object, distance, hysteresis)` — `distance` est la distance **à partir de laquelle** ce niveau s'affiche, et `addLevel` retourne le `LOD` (chaînable). Par défaut `lod.autoUpdate = true` : le renderer choisit le niveau à chaque frame. Si tu passes `autoUpdate = false`, tu dois appeler `lod.update(camera)` toi-même dans la boucle.

### 2.8 Frustum culling : gratuit et automatique

Le **frustum culling** élimine les objets hors du champ de vision de la caméra avant de les dessiner. Three.js le fait **automatiquement** pour tout objet dont `frustumCulled = true` (la valeur par défaut), en testant sa **bounding sphere**.

```typescript
mesh.frustumCulled = true;   // défaut — rien à faire dans le cas normal
skybox.frustumCulled = false; // exception : un objet global toujours visible
```

Le piège : un objet déformé par shader (ou un `SkinnedMesh`) peut avoir une bounding sphere obsolète et « disparaître » à l'écran. On recalcule alors `geometry.computeBoundingSphere()` ou on désactive le culling pour cet objet.

### 2.9 Textures : le poste VRAM le plus lourd

Une texture non compressée coûte cher : une `2048×2048` RGBA8 = **16 Mo** de VRAM, une `4096×4096` = **64 Mo**. Leviers concrets :

- **Résolution adaptée** : un objet affiché sur 100 px n'a pas besoin d'une texture 4K.
- **Partage** : réutiliser la même instance `Texture` entre plusieurs matériaux (une seule copie en VRAM) plutôt que la recharger.
- **Atlas** : regrouper plusieurs petites textures en une seule image avec des UVs ajustés → un seul bind, moins de changements d'état.

La compression GPU (KTX2/Basis, qui reste compressée en VRAM) est le sujet du pipeline d'assets (module 27).

### 2.10 Le dispose pattern : les ressources GPU ignorent le GC

Le garbage collector JavaScript **ne libère pas** la VRAM. Géométries, matériaux, textures et render targets doivent être disposés **manuellement**, sinon ils restent résidents indéfiniment :

```typescript
function disposeMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();  // libère les buffers de sommets en VRAM
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const mat of mats) {
    for (const key of Object.keys(mat)) {
      const v = (mat as Record<string, unknown>)[key];
      if (v instanceof THREE.Texture) v.dispose(); // chaque texture du matériau
    }
    mat.dispose();
  }
}
```

`scene.remove(mesh)` ne suffit **pas** : il retire l'objet du graphe mais laisse ses buffers en VRAM. Le réflexe : `remove` **puis** `dispose`.

### 2.11 Profiling GPU : `stats.js` et `spector.js`

- **`stats.js`** (`three/addons/libs/stats.module.js`) : un petit panneau FPS/ms/MB. `stats.begin()` en début de boucle, `stats.end()` en fin. Donne la tendance instantanée.
- **`spector.js`** (extension Chrome ou paquet npm) : capture un frame entier et liste **chaque draw call** avec son état WebGL, ses shaders et ses textures. C'est l'outil pour comprendre *pourquoi* une frame coûte cher, draw call par draw call.
- **Chrome DevTools › Performance** : enregistre une session, repère les frames qui dépassent 16 ms, sépare temps JavaScript (Main) et temps GPU.

Ordre de travail : `renderer.info` pour situer le problème (CPU vs GPU vs VRAM) → `stats.js` pour mesurer l'effet des changements → `spector.js` quand il faut disséquer un draw call précis.

---

## 3. Worked examples

### Exemple 1 — 10 000 marqueurs en 1 draw call (TribuZen)

On reprend le globe du cas concret et on remplace les 10 000 `Mesh` par un seul `InstancedMesh` coloré par état.

```typescript
import * as THREE from 'three';

interface Sortie {
  lat: number;
  lon: number;
  etat: 'bouclee' | 'prevue' | 'annulee';
}

// Convertit lat/lon en position sur une sphère de rayon 1 (globe TribuZen)
function latLonToVec3(lat: number, lon: number, radius = 1): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

const ETAT_COLOR: Record<Sortie['etat'], THREE.Color> = {
  bouclee: new THREE.Color(0x1ecb6b), // vert
  prevue: new THREE.Color(0xff9800),  // orange
  annulee: new THREE.Color(0x777777), // gris
};

function buildMarkers(sorties: Sortie[]): THREE.InstancedMesh {
  // ✅ UNE géométrie, UN matériau, partagés par toutes les instances
  const geo = new THREE.SphereGeometry(0.008, 8, 8); // low-poly : 3 px à l'écran
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.6 });

  // ✅ InstancedMesh(geometry, material, count) — 1 draw call pour tout
  const markers = new THREE.InstancedMesh(geo, mat, sorties.length);

  const dummy = new THREE.Object3D();
  for (let i = 0; i < sorties.length; i++) {
    const s = sorties[i];
    dummy.position.copy(latLonToVec3(s.lat, s.lon));
    dummy.lookAt(0, 0, 0);       // oriente le marqueur vers le centre du globe
    dummy.updateMatrix();
    markers.setMatrixAt(i, dummy.matrix);   // matrice de l'instance i
    markers.setColorAt(i, ETAT_COLOR[s.etat]); // couleur de l'instance i
  }

  // ✅ OBLIGATOIRE : signaler au GPU de relire les buffers d'instances
  markers.instanceMatrix.needsUpdate = true;
  if (markers.instanceColor) markers.instanceColor.needsUpdate = true;

  return markers;
}

// Usage
const markers = buildMarkers(sorties); // sorties.length === 10_000
globe.add(markers);
// renderer.info.render.calls pour les marqueurs : 1 (au lieu de 10 000)
```

**Ce qui a changé vs le cas concret :** une seule géométrie, un seul matériau, un seul `InstancedMesh`. `renderer.info.render.calls` passe de ~10 000 à ~1 pour les marqueurs ; le CPU n'est plus saturé, la scène redevient fluide.

### Exemple 2 — LOD + dispose au changement de famille

Le globe lui-même (le maillage de la sphère texturée) mérite un LOD : de près on veut du relief, de loin une sphère lisse suffit. Et quand l'utilisateur change de famille, il faut disposer l'ancien jeu de marqueurs.

```typescript
import * as THREE from 'three';

// ─── LOD du globe ─────────────────────────────────────────
function buildGlobeLOD(texture: THREE.Texture): THREE.LOD {
  const mat = new THREE.MeshStandardMaterial({ map: texture });

  const lod = new THREE.LOD();
  // addLevel(object, distance) — distance = seuil d'affichage, chaînable
  lod.addLevel(new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), mat), 0);
  lod.addLevel(new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), mat), 4);
  lod.addLevel(new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), mat), 10);
  // autoUpdate = true par défaut : le renderer choisit le niveau chaque frame
  return lod;
}

// ─── Dispose du jeu de marqueurs courant ──────────────────
function disposeMarkers(markers: THREE.InstancedMesh): void {
  markers.parent?.remove(markers); // 1. retirer du graphe
  markers.geometry.dispose();      // 2. libérer la géométrie partagée
  (markers.material as THREE.Material).dispose(); // 3. libérer le matériau
  markers.dispose();               // 4. libérer les buffers d'instances (VRAM)
}

// ─── Changement de famille : le point où l'ancien code fuyait ──
let current: THREE.InstancedMesh | null = null;

function showFamily(sorties: Sortie[]): void {
  if (current) disposeMarkers(current); // ✅ libère AVANT de recréer — plus de fuite
  current = buildMarkers(sorties);
  globe.add(current);
}
```

Avant/après à vérifier dans la console : `renderer.info.memory.geometries` et `.textures` doivent **revenir à leur valeur d'avant** après `disposeMarkers`, au lieu de grimper à chaque `showFamily`.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Oublier `instanceMatrix.needsUpdate = true`

Après `setMatrixAt`, le buffer GPU n'est **pas** ré-uploadé automatiquement. Sans `markers.instanceMatrix.needsUpdate = true`, toutes les instances restent à la matrice identité (empilées à l'origine) ou ne bougent pas. Même règle pour `instanceColor.needsUpdate` après `setColorAt`.

### PIÈGE #2 — Croire que réduire les triangles réduit les draw calls

Un objet de 100 000 triangles = **1** draw call. 10 000 objets de 10 triangles = **10 000** draw calls, bien plus coûteux côté CPU. Simplifier la géométrie (LOD) attaque le coût **GPU/vertex** ; réduire le **nombre d'objets** (instancing/merge) attaque le coût **CPU/draw calls**. Ce sont deux problèmes distincts : diagnostiquer avec `renderer.info` avant de choisir le levier.

### PIÈGE #3 — `scene.remove()` croit libérer la mémoire

`scene.remove(mesh)` retire l'objet du graphe de scène mais **laisse ses géométries et textures en VRAM**. C'est la fuite classique. Il faut appeler `.dispose()` sur la géométrie, chaque matériau et chaque texture. Vérifier avec `renderer.info.memory` qui doit redescendre.

### PIÈGE #4 — Un matériau neuf par objet

Créer `new THREE.MeshStandardMaterial()` dans une boucle produit N matériaux identiques : N compilations de shaders potentielles et N changements d'état GPU. **Partager une seule instance** de matériau entre les objets identiques est gratuit et supprime ces changements d'état.

### PIÈGE #5 — Instancing sur des objets aux géométries différentes

`InstancedMesh` exige **la même** géométrie pour toutes les instances. Pour des géométries **différentes** au même matériau, c'est `mergeGeometries` qu'il faut — pas l'instancing. Inversement, pour des géométries identiques **déplaçables**, c'est l'instancing, pas le merge (qui fige tout).

### PIÈGE #6 — Positionner un `InstancedMesh` avec `.position`

Un `InstancedMesh` n'a pas de position « globale » utile : chaque instance est placée par `setMatrixAt`. Écrire `markers.position.set(...)` déplace **tout** le lot d'un bloc et prête à confusion. La position de chaque marqueur vit **dans sa matrice d'instance**, composée via l'`Object3D` tampon (`dummy`).

### PIÈGE #7 — LOD sans niveaux réellement plus légers

Un `LOD` dont tous les niveaux ont le même nombre de triangles ne gagne rien : il ajoute juste de la logique de sélection. Chaque niveau lointain doit avoir une géométrie **franchement** plus simple (segments divisés par 2 ou plus) pour que le gain vertex soit réel.

---

## 5. Ancrage TribuZen

Le globe des sorties est la vitrine 3D de TribuZen — et le premier endroit où la performance devient critique en conditions réelles (des milliers de sorties cumulées).

**Marqueurs de sorties → `InstancedMesh`.** Tous les marqueurs partagent une géométrie sphérique low-poly et un matériau. Un seul `InstancedMesh` de N instances, `setMatrixAt` pour la position géo (via `latLonToVec3`), `setColorAt` pour l'état (bouclée/prévue/annulée). Résultat : 1 draw call quel que soit le nombre de sorties.

**Globe lui-même → `THREE.LOD`.** Sphère texturée haute densité quand on zoome, sphère grossière quand le globe est petit à l'écran. Le frustum culling automatique ignore déjà les marqueurs de la face cachée du globe.

**Changement de famille / de vue → dispose pattern.** À chaque fois que l'utilisateur bascule de famille ou quitte l'écran globe, `disposeMarkers` libère l'ancien `InstancedMesh`. Sans ça, la VRAM grimpe à chaque navigation (fuite du cas concret).

**Budget.** Le globe TribuZen doit tenir **60 FPS (16.7 ms)** sur un laptop intégré moyen. `renderer.info.render.calls` est surveillé en dev : cible < 50 draw calls pour toute la scène globe.

Fichiers cibles dans `smaurier/tribuzen` :

```
tribuzen/
  src/
    3d/
      globe/
        MarkerLayer.ts    ← buildMarkers : InstancedMesh + setMatrixAt/setColorAt
        GlobeMesh.ts       ← buildGlobeLOD : THREE.LOD de la sphère
        disposeGlobe.ts    ← disposeMarkers : remove + dispose (anti-fuite VRAM)
      perf/
        PerfMonitor.ts     ← lecture renderer.info + stats.js en dev
```

> Le rendu des ombres du globe (coûteux en GPU) et son optimisation relèvent du **module 18 (shadow mapping)**. Ici on garantit le socle : draw calls maîtrisés, pas de fuite VRAM.

---

## 6. Points clés

1. Le budget de frame est fixe : **16.7 ms** à 60 FPS. Optimiser = tenir ce budget, pas maximiser la qualité.
2. Le **draw call** est l'unité de coût CPU : 10 000 petits objets coûtent plus que 1 gros. `renderer.info.render.calls` est la métrique reine.
3. `renderer.info` diagnostique : `render.calls` élevé = CPU-bound ; `render.triangles` élevé = GPU-bound ; `memory.textures` qui monte = fuite VRAM.
4. `InstancedMesh(geo, mat, count)` dessine N objets **identiques** en 1 draw call ; `setMatrixAt` + `instanceMatrix.needsUpdate = true` (idem `setColorAt`/`instanceColor`).
5. `mergeGeometries` (avec `applyMatrix4` avant) fusionne des géométries **différentes** au même matériau ; les objets deviennent figés.
6. `THREE.LOD` + `addLevel(object, distance)` affiche une géométrie plus simple avec la distance ; les niveaux lointains doivent être vraiment plus légers.
7. Le **frustum culling** (`frustumCulled = true`) est automatique et gratuit ; à surveiller uniquement pour les objets déformés (bounding sphere obsolète).
8. Le **dispose pattern** est obligatoire : `remove` **puis** `dispose` sur geometry/material/texture — le GC ne libère pas la VRAM.

---

## 7. Seeds Anki

```
Pourquoi 10 000 petits meshes rament-ils alors qu'un mesh de 100 000 triangles passe ?|Chaque Mesh visible = 1 draw call (coût CPU fixe par objet). 10 000 objets = 10 000 draw calls = CPU saturé (CPU-bound). Un seul gros objet = 1 draw call. La métrique clé est renderer.info.render.calls.
Que faut-il faire après setMatrixAt sur un InstancedMesh, et pourquoi ?|Mettre instanceMatrix.needsUpdate = true. Sinon le buffer de matrices d'instances n'est pas ré-uploadé au GPU et les instances ne bougent pas (restent à l'origine). Idem instanceColor.needsUpdate après setColorAt.
Quand utiliser InstancedMesh vs mergeGeometries ?|InstancedMesh : mêmes géométrie et matériau, objets restant déplaçables (setMatrixAt) — ex. 10 000 marqueurs identiques. mergeGeometries : géométries DIFFÉRENTES, même matériau, objets figés — ex. décor statique. Les deux ramènent à 1 draw call.
Pourquoi scene.remove(mesh) ne suffit-il pas à libérer la mémoire GPU ?|Le garbage collector JS ne libère pas la VRAM. remove retire l'objet du graphe mais laisse géométries/textures résidentes. Il faut geometry.dispose(), material.dispose() et texture.dispose() manuellement. Vérifier avec renderer.info.memory.
À quoi sert THREE.LOD et quelle est la signature d'addLevel ?|LOD affiche une version simplifiée d'un objet selon la distance à la caméra. addLevel(object, distance, hysteresis) : distance = seuil à partir duquel ce niveau s'affiche. autoUpdate=true par défaut (le renderer choisit le niveau chaque frame), sinon appeler lod.update(camera).
Comment lire renderer.info pour diagnostiquer une scène lente ?|render.calls élevé (>500) = CPU-bound → instancing/merge/matériaux partagés. render.triangles élevé (>2M) = GPU-bound → LOD/simplification. memory.textures ou geometries qui monte sans redescendre = fuite VRAM → dispose manquant.
Qu'est-ce que le frustum culling dans Three.js et quand pose-t-il problème ?|Élimination automatique des objets hors du champ de vision de la caméra, via la bounding sphere, pour tout objet frustumCulled=true (défaut). Problème : objet déformé par shader/SkinnedMesh avec bounding sphere obsolète qui disparaît — recalculer computeBoundingSphere() ou désactiver le culling.
Pourquoi créer un matériau neuf par objet dans une boucle est-il coûteux ?|N matériaux identiques = N changements d'état GPU (shader/uniforms) et potentiellement N compilations de shaders. Partager une seule instance de matériau entre objets identiques supprime ces changements d'état — gratuit et rapide.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-17-performance-et-optimisation/README.md`. Optimiser une scène qui rame : partir de N meshes individuels + LOD absent, ramener à 1 draw call via `InstancedMesh` et ajouter du LOD, en mesurant `renderer.info` avant/après dans un vrai navigateur — corrigé TypeScript commenté intégral.
