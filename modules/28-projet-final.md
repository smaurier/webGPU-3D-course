---
titre: "Projet final — l'expérience 3D TribuZen de bout en bout, du scene graph au shader expert"
cours: 20-webgpu-3d
notions:
  - "assemblage des 28 modules (00-27) en une seule expérience 3D (aucune notion neuve)"
  - "carte de montage : chaque couche 3D à sa place (scène, matériaux/PBR, ombres, modèles, interactions, post-processing, perf)"
  - "boucle de rendu unique : update logique → physique/interactions → animation → rendu → post-processing"
  - "séparation des responsabilités : scene graph (données) vs render pipeline (passes) vs interaction (raycasting/physique)"
  - "budget de frame : instancing + LOD + frustum culling pour tenir 60 FPS avec des centaines d'objets"
  - "cycle de vie des ressources GPU : dispose() des geometries/materials/textures, pas de fuite mémoire"
  - "une touche experte au choix : shaders créatifs, rendu volumétrique, ray tracing hybride ou WebXR"
  - "preuve exigée : tourne dans un vrai navigateur WebGPU, 60 FPS mesurés, zéro fuite, une feature experte visible"
  - "production readiness d'une expérience 3D web"
outcomes:
  - "sait placer chaque brique des modules 00-27 dans une expérience 3D TribuZen complète, sans réinventer"
  - "sait assembler scène Three.js + éclairage PBR + ombres + modèles/animations + interactions + post-processing dans une boucle unique"
  - "sait tenir un budget de frame (instancing, LOD, frustum culling) et prouver 60 FPS au compteur"
  - "sait gérer le cycle de vie des ressources GPU pour éviter les fuites mémoire"
  - "sait intégrer une touche experte (shader créatif, volumétrique, ray tracing ou WebXR) sur la scène de base"
  - "sait prouver l'expérience (navigateur réel, FPS mesurés, zéro fuite, feature experte) plutôt que la supposer finie"
prerequis:
  - "ensemble des modules 00 à 27 du cours 20-webgpu-3d (maths 3D, WebGL, WebGPU/WGSL, Three.js, rendu avancé, sujets experts)"
next: fin-parcours-20-webgpu-3d
libs: ["three"]
tribuzen: "expérience 3D TribuZen entière — le globe interactif des sorties de la famille : sphère PBR texturée, marqueurs instanciés géolocalisés, éclairage + ombres, raycasting pour sélectionner une sortie, post-processing (bloom), boucle 60 FPS, et une touche experte (halo atmosphérique volumétrique OU shader créatif sur les marqueurs)"
last-reviewed: 2026-07
---

# Projet final — l'expérience 3D TribuZen de bout en bout, du scene graph au shader expert

> **Outcomes — tu sauras FAIRE :** placer chaque brique des modules 00-27 dans une expérience 3D TribuZen complète, assembler **scène Three.js + PBR + ombres + modèles/animations + interactions + post-processing** dans une **boucle de rendu unique**, tenir un **budget de frame** (instancing, LOD, frustum culling) et **prouver 60 FPS**, gérer le **cycle de vie des ressources GPU** sans fuite, intégrer une **touche experte** (shader créatif, volumétrique, ray tracing ou WebXR) — et **prouver** l'expérience (navigateur réel, FPS mesurés, zéro fuite, feature experte) au lieu de la supposer finie.
> **Difficulté :** :star::star::star::star::star:
>
> **Portée :** ce module est le **capstone** du cours — le plus gros du parcours. Il **n'introduit aucune notion neuve** : il **assemble** ce que les modules 00 à 27 ont posé brique par brique, des matrices (01-03) au streaming de textures (27), en passant par WebGL brut (06-08), WebGPU/WGSL (09-12), Three.js (13-17) et les sujets experts (18-27). Si un mécanisme ci-dessous te semble flou (matrice de projection, bind group, `MeshStandardMaterial`, shadow map, `Raycaster`, `EffectComposer`, `InstancedMesh`, raymarching, WebXR), c'est le signal de **rouvrir le module source avant** de coder, pas de deviner.

## 1. Cas concret d'abord

Depuis le module 13, une feature du fil rouge grandit brique par brique : le **globe interactif des sorties de la famille**. D'abord une simple sphère qui tourne (13), puis texturée et éclairée en PBR (14), puis peuplée de modèles glTF (15), embellie par du post-processing (16), optimisée pour des centaines de marqueurs (17), ombrée (18), rendue interactive au clic (20). Aujourd'hui, on doit livrer **une seule expérience cohérente et aboutie** qu'un parent ouvre dans son navigateur pour explorer, en 3D, toutes les sorties passées et prévues de sa tribu.

Le geste central du produit — **« je fais tourner le globe, je clique sur le marqueur du week-end à la montagne, sa fiche s'ouvre et le marqueur s'illumine »** — n'est **pas** un écran isolé : il traverse presque tout le cours. En une frame, l'expérience doit :

- **projeter** une scène 3D à partir des matrices view/projection (modules 01-03) via le pipeline de rendu (04) ;
- **afficher** une sphère Terre en **PBR** (metalness/roughness, module 05, 14) avec texture d'albédo et normal map ;
- **éclairer** la scène (soleil directionnel + ambiante hémisphérique) et projeter des **ombres** douces (modules 14, 18) ;
- **peupler** le globe de **centaines de marqueurs** de sorties via **instancing** — un seul draw call, pas 300 (module 17) ;
- **charger** d'éventuels avatars glTF **animés** de la famille (module 15) ;
- **réagir au clic** : un **raycasting** convertit la position souris en rayon 3D et trouve le marqueur touché (module 20) ;
- **rehausser** le rendu avec du **post-processing** (bloom sur le marqueur sélectionné, tone mapping ACES, module 16) ;
- **tenir 60 FPS** même avec tous ces marqueurs (frustum culling + LOD + instancing, module 17) ;
- **ne pas fuir** : chaque geometry/material/texture est `dispose()` au démontage (module 17) ;
- **briller d'une touche experte** : un **halo atmosphérique volumétrique** autour du globe (module 24) **ou** un **shader créatif** de pulsation sur les marqueurs (module 19) **ou** un mode **WebXR** pour inspecter le globe en VR (module 25).

Chaque brique, tu l'as vue isolément et elle marchait. Le capstone est l'épreuve où elles doivent **fonctionner ensemble, dans une seule boucle de rendu** — et c'est là que les fautes d'**assemblage** (celles du §4) apparaissent : un matériau PBR noir faute de lumière, une boucle qui oublie `controls.update()`, 300 marqueurs en 300 draw calls qui écroulent le framerate, un `EffectComposer` jamais redimensionné, des textures jamais libérées qui saturent la VRAM.

Ce module te fait **concevoir et implémenter cette expérience entière**, de la scène au shader expert, en réutilisant **chaque** module 00-27. Rien de neuf : tout a été vu. Reste à le **brancher** — et à le **prouver**.

---

## 2. Théorie complète, concise

Aucune notion nouvelle : une **carte de montage**. Elle relie chaque module à sa place dans l'expérience 3D TribuZen, puis les **jointures** qui font qu'un tas d'objets 3D devient une expérience *fluide, interactive, sans fuite et distinguée par une touche experte*.

### 2.1 La carte de montage — chaque module à sa place

| Couche de l'expérience | Mécanisme 3D | Module | Rôle dans le globe TribuZen |
|---|---|---|---|
| Maths | vecteurs, produit scalaire/vectoriel | 01 | positions, normales, direction de lumière |
| Transformations | translation/rotation/échelle, quaternions | 02 | orientation des marqueurs sur la sphère |
| Caméra | view/projection, perspective, frustum | 03 | point de vue orbital + frustum culling |
| Pipeline | rasterisation, vertex/fragment, depth | 04 | *pourquoi* le rendu marche sous Three.js |
| Lumière/PBR | metalness/roughness, Cook-Torrance | 05 | matériau réaliste de la Terre |
| WebGL brut | contexte, buffers, draw calls, GLSL | 06-08 | *ce que Three.js abstrait* (debug/perf) |
| WebGPU/WGSL | adapter/device, pipeline, bind groups | 09-10 | option `WebGPURenderer` + compute experts |
| Compute/GPGPU | workgroups, storage buffers | 11-12 | particules/positions de marqueurs en GPU |
| Three.js socle | Scene/Camera/Renderer, Mesh, boucle | 13 | le globe : sphère + `OrbitControls` |
| Matériaux/lumières | materials, lights, ombres Three.js | 14 | texture Terre + `DirectionalLight` |
| Modèles/animations | glTF, skinning, `AnimationMixer` | 15 | avatars animés de la famille |
| Post-processing | `EffectComposer`, passes, bloom | 16 | halo lumineux du marqueur sélectionné |
| Performance | instancing, LOD, frustum culling, profiling | 17 | 300 marqueurs à 60 FPS, `dispose()` |
| Shadow mapping | shadow maps, PCF, cascades | 18 | ombre portée des marqueurs sur le globe |
| Shaders créatifs | noise, raymarching, procédural | 19 | pulsation/glow procédural des marqueurs |
| Physique/interactions | raycasting, collisions | 20 | clic → sélection d'une sortie |
| Modélisation | géométrie procédurale, `BufferGeometry` | 21 | arcs de trajet entre deux sorties |
| Ray tracing | ray-sphere, path tracing en compute | 22 | reflet réaliste sur les océans (option) |
| GI / screen-space | SSAO, SSR | 23 | occlusion ambiante du globe (option) |
| Volumétrique | fog, raymarching volumétrique | 24 | **halo atmosphérique** autour du globe |
| WebXR / procédural | VR/AR, animation procédurale | 25 | inspecter le globe en VR (option) |
| Audio 3D | Web Audio spatial, positional audio | 26 | son d'ambiance spatialisé (option) |
| Virtual textures | streaming de gros assets | 27 | texture Terre haute résolution streamée |

Le capstone **n'ajoute rien** à cette table : il la **branche**. Un flou dans une ligne = rouvrir le module, pas improviser.

### 2.2 La première décision structurante : séparer scene graph, render pipeline et interactions

L'erreur d'assemblage n°1 en 3D est de tout empiler dans une seule fonction `animate()` de 500 lignes. Trois responsabilités distinctes, trois zones de code :

| Responsabilité | Contenu | Modules |
|---|---|---|
| **Scene graph** (données) | `Scene`, `Mesh`, `Light`, hiérarchie parent-enfant, transforms | 13-14 |
| **Render pipeline** (passes) | `WebGLRenderer`/`WebGPURenderer`, `EffectComposer`, ordre des passes | 16 |
| **Interaction** (entrées) | `OrbitControls`, `Raycaster`, physique, sélection | 20 |

Le critère : *le scene graph décrit **ce qui existe**, le render pipeline décrit **comment on le dessine**, l'interaction décrit **comment l'utilisateur agit dessus**.* Mélanger les trois (créer un `Mesh` dans la boucle de rendu, refaire un `Raycaster` à chaque frame, reconstruire le composer à chaque resize) donne du code injouable et des fuites. Cette frontière tient toute l'architecture de l'expérience.

### 2.3 Le cœur : la boucle de rendu unique — l'ordre est une décision

Le nœud de l'expérience est **l'ordre des opérations dans une frame**. Il assemble presque tous les modules, et l'**ordre** n'est pas cosmétique :

```
frame (setAnimationLoop) — à chaque tick
  1. RESIZE      (module 13) : si le canvas a changé → setSize + camera.updateProjectionMatrix   ← AVANT tout rendu
  2. TEMPS       (module 13) : delta = clock.getDelta() → animations indépendantes du framerate
  3. INTERACTION (module 20) : controls.update() (damping) ; raycasting si clic en attente
  4. LOGIQUE     (modules 02, 15) : rotation du globe, mixer.update(delta) des avatars glTF
  5. PERF        (module 17) : LOD.update(camera), frustum culling implicite du renderer
  6. RENDU       (modules 04, 14, 18) : composer.render() → passe scène (ombres incluses) puis passes post-process
```

Trois raisons pour lesquelles l'ordre **est** le design :

1. **Le resize est en position 1**, avant tout rendu : rendre avec un aspect périmé déforme l'image toute la frame. On synchronise résolution + `camera.updateProjectionMatrix()` **avant** de dessiner (module 13).
2. **`controls.update()` est en position 3**, avant le rendu : avec `enableDamping`, l'inertie ne s'applique que si on met à jour les contrôles **chaque** frame, **avant** de projeter la caméra (module 13).
3. **Le post-processing est en dernier** (position 6, via `composer.render()`) : le bloom, le tone mapping et le halo volumétrique s'appliquent sur l'image **déjà rendue** (ombres comprises). Rendre la scène puis oublier le composer = post-processing invisible (module 16).

### 2.4 Le budget de frame : instancing, LOD, frustum culling

Une expérience 3D **finie** tient **60 FPS** (16,6 ms/frame). Le globe TribuZen peut porter des centaines de marqueurs — le naïf « un `Mesh` par sortie » explose en autant de **draw calls**. Les trois leviers du module 17 :

- **Instancing** (`InstancedMesh`) : **un seul** draw call pour N marqueurs partageant geometry + material ; chaque instance a sa propre matrice de transformation. 300 marqueurs = 1 draw call au lieu de 300.
- **LOD** (`THREE.LOD`) : afficher un marqueur détaillé de près, un simple point de loin — moins de triangles quand ça ne se voit pas.
- **Frustum culling** : le renderer ne dessine que ce qui est **dans le frustum** de la caméra (module 03) ; il est **actif par défaut** dans Three.js, mais un `mesh.frustumCulled = false` mal placé (ex. sur des particules) le désactive.

Le critère de sortie : ouvrir le compteur (`stats.js` ou `renderer.info`) et **lire** 60 FPS avec tous les marqueurs visibles — pas le supposer.

### 2.5 Le cycle de vie des ressources GPU : pas de fuite

Le piège invisible en 3D web : une geometry, un material, une texture vivent en **VRAM** et ne sont **pas** libérés par le garbage collector JavaScript. Il faut appeler `dispose()` explicitement (module 17). La faute d'assemblage classique : ouvrir/fermer l'expérience plusieurs fois (montage/démontage d'un composant Vue) sans libérer → la VRAM grimpe jusqu'au crash. Le pattern correct :

- `setAnimationLoop(null)` pour **arrêter** la boucle au démontage ;
- parcourir la scène (`scene.traverse`) et `dispose()` chaque `geometry`, chaque `material`, chaque `texture` ;
- `composer.dispose()` pour les render targets du post-processing ;
- `renderer.dispose()` en dernier.

La preuve : `renderer.info.memory` (geometries, textures) **stable** après plusieurs cycles montage/démontage, pas croissant.

### 2.6 Rendu avancé : ombres, PBR et la touche experte

Ce qui distingue une expérience **aboutie** d'un prototype, c'est la **qualité de rendu** — et le capstone en exige :

- **PBR + éclairage** (modules 05, 14) : `MeshStandardMaterial` (metalness/roughness) sous une `DirectionalLight` (soleil) + `HemisphereLight` (ciel/sol). Sans lumière, le PBR est **noir** (piège #1).
- **Ombres** (module 18) : `renderer.shadowMap.enabled = true`, `light.castShadow`, `mesh.castShadow`/`receiveShadow`, `PCFSoftShadowMap` pour des bords doux, `shadow.bias` pour éviter le *shadow acne*.
- **Post-processing** (module 16) : `EffectComposer` → `RenderPass` → `UnrealBloomPass` → `OutputPass`, tone mapping `ACESFilmicToneMapping` sur le renderer.
- **Une touche experte au choix** (l'exigence qui prouve la maîtrise) :
  - **shader créatif** (module 19) : `ShaderMaterial` avec noise/raymarching pour faire **pulser** les marqueurs ;
  - **volumétrique** (module 24) : un **halo atmosphérique** raymarché autour du globe (Fresnel + scattering) ;
  - **ray tracing** (module 22) : reflets réalistes sur les océans via un compute pass WebGPU ;
  - **WebXR** (module 25) : inspecter le globe **en VR**, `renderer.xr.enabled = true` + `setAnimationLoop` (déjà compatible XR).

### 2.7 Production readiness d'une expérience 3D — la checklist de sortie

Avant de dire « l'expérience TribuZen est prête », on **coche** (rappel du cours) :

- scene graph propre (scène/caméra/renderer, hiérarchie) + `OrbitControls` avec `controls.update()` en boucle (modules 13, 20) ;
- éclairage **PBR** + **ombres** douces (PCF) sans acne (`shadow.bias`) (modules 14, 18) ;
- modèles glTF chargés **async** avec écran de chargement, animations via `AnimationMixer` (module 15) ;
- interactions au **raycasting** (clic → sélection), coordonnées NDC correctes (module 20) ;
- post-processing branché (`composer.render()` **remplace** `renderer.render()`), redimensionné au resize (module 16) ;
- budget de frame tenu : **instancing** des marqueurs, LOD, frustum culling → **60 FPS mesurés** (module 17) ;
- **zéro fuite** : `dispose()` de tout au démontage, `renderer.info.memory` stable (module 17) ;
- **une touche experte** visible et fonctionnelle (shader créatif / volumétrique / ray tracing / WebXR) ;
- fallback : détecter l'absence de WebGL2/WebGPU et afficher un message clair plutôt que planter (module 09).

---

## 3. Worked examples

Deux exemples end-to-end. Le premier **conçoit et câble** le globe interactif (scène, PBR, ombres, marqueurs instanciés, raycasting, post-processing, boucle unique). Le second **ajoute la touche experte et prouve** que l'expérience tient (60 FPS, zéro fuite).

### Exemple 1 — le globe interactif : scène, PBR, instancing, raycasting, post-processing

Objectif : partir du geste du §1 et produire le globe complet, en **branchant** des briques déjà écrites dans les labs précédents — rien de neuf. On assemble dans l'ordre du §2.3.

**Étape 1 — le socle : scène, caméra, renderer, ombres, contrôles** (§2.2, modules 13, 14, 18).

```typescript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.querySelector('#app') as HTMLCanvasElement;

// Renderer : ombres + tone mapping ACES (modules 14, 16, 18)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;        // ombres douces (module 18)
renderer.toneMapping = THREE.ACESFilmicToneMapping;      // HDR → LDR (module 16)

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060f);

const camera = new THREE.PerspectiveCamera(
  50, canvas.clientWidth / canvas.clientHeight, 0.1, 100,
);
camera.position.set(0, 1.5, 4);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;                            // → controls.update() obligatoire (§2.3)
controls.minDistance = 2;
controls.maxDistance = 8;

// Éclairage : SANS lumière, le PBR est NOIR (piège #1, module 14)
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.position.set(4, 5, 3);
sun.castShadow = true;                                    // le soleil projette des ombres
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;                                // évite le shadow acne (module 18)
scene.add(sun);
scene.add(new THREE.HemisphereLight(0x88aaff, 0x222233, 0.6));
```

**Étape 2 — le globe PBR** (modules 05, 14). `MeshStandardMaterial` texturé ; il **reçoit** les ombres des marqueurs.

```typescript
const loader = new THREE.TextureLoader();
const albedo = loader.load('/textures/earth-albedo.jpg');
albedo.colorSpace = THREE.SRGBColorSpace;                 // texture couleur en sRGB (module 14)

const globe = new THREE.Mesh(
  new THREE.SphereGeometry(1, 64, 48),                    // résolution correcte
  new THREE.MeshStandardMaterial({ map: albedo, roughness: 0.85, metalness: 0.0 }),
);
globe.receiveShadow = true;                               // reçoit l'ombre des marqueurs
scene.add(globe);
```

**Étape 3 — les marqueurs instanciés** (module 17) : **un** `InstancedMesh` pour toutes les sorties → **1 draw call**, pas N. On convertit lat/lon en position 3D sur la sphère (module 01).

```typescript
interface Outing { id: string; title: string; lat: number; lon: number; }

// lat/lon (degrés) → point cartésien sur une sphère de rayon r (module 01, coordonnées sphériques)
function latLonToVec3(lat: number, lon: number, r: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  );
}

function createMarkers(outings: Outing[]): THREE.InstancedMesh {
  const geo = new THREE.SphereGeometry(0.02, 12, 12);
  const mat = new THREE.MeshStandardMaterial({ color: 0xff5533, emissive: 0x551100 });
  const mesh = new THREE.InstancedMesh(geo, mat, outings.length);  // N instances, 1 draw call
  mesh.castShadow = true;

  const dummy = new THREE.Object3D();
  outings.forEach((o, i) => {
    dummy.position.copy(latLonToVec3(o.lat, o.lon, 1.02)); // 1.02 : juste au-dessus de la surface
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);                     // matrice par instance (module 17)
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

const outings: Outing[] = [
  { id: 'a', title: 'Rando Chartreuse', lat: 45.3, lon: 5.8 },
  { id: 'b', title: 'Week-end Mer',     lat: 43.3, lon: 5.4 },
  // ... des centaines : toujours 1 seul draw call grâce à l'instancing
];
const markers = createMarkers(outings);
globe.add(markers);                                        // enfant du globe → tourne avec lui
```

**Étape 4 — le raycasting** (module 20) : clic → rayon 3D → instance touchée. On garde **un** `Raycaster` réutilisé (pas un nouveau par frame, §2.2).

```typescript
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let selectedId: string | null = null;

renderer.domElement.addEventListener('click', (e) => {
  const rect = renderer.domElement.getBoundingClientRect();
  // écran → NDC [-1, 1] (module 20) : erreur classique = oublier le -y
  pointer.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
  pointer.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(markers);        // teste l'InstancedMesh
  if (hits.length > 0 && hits[0].instanceId !== undefined) {
    selectedId = outings[hits[0].instanceId].id;
    console.log('Sortie sélectionnée :', outings[hits[0].instanceId].title);
    // → ouvrir la fiche + illuminer via post-processing (Exemple 2)
  }
});
```

**Étape 5 — le post-processing** (module 16) : `EffectComposer` **remplace** `renderer.render()`. Bloom + sortie sRGB.

```typescript
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));          // rend la scène (ombres incluses)
composer.addPass(new UnrealBloomPass(
  new THREE.Vector2(canvas.clientWidth, canvas.clientHeight),
  0.6,   // strength
  0.4,   // radius
  0.85,  // threshold : seuls les pixels très clairs (marqueurs émissifs) brillent
));
composer.addPass(new OutputPass());                       // conversion sRGB finale
```

**Étape 6 — la boucle unique** (§2.3), qui coud tout dans l'ordre.

```typescript
function resize(): boolean {
  const c = renderer.domElement;
  const need = c.width !== c.clientWidth || c.height !== c.clientHeight;
  if (need) {
    renderer.setSize(c.clientWidth, c.clientHeight, false);
    composer.setSize(c.clientWidth, c.clientHeight);      // le composer AUSSI (piège #4)
  }
  return need;
}

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  // 1. RESIZE avant tout rendu
  if (resize()) {
    camera.aspect = renderer.domElement.clientWidth / renderer.domElement.clientHeight;
    camera.updateProjectionMatrix();
  }
  // 2. TEMPS  3. INTERACTION  4. LOGIQUE
  const delta = clock.getDelta();
  controls.update();                                       // damping (module 13)
  globe.rotation.y += 0.05 * delta;                        // rotation lente, indépendante du FPS
  // 6. RENDU via le composer (PAS renderer.render — piège #3)
  composer.render();
});
```

**Ce que ce design achète :** un globe PBR ombré, peuplé de centaines de marqueurs en **1 draw call**, orbitable, cliquable au pixel près, embelli par un bloom — chaque pièce vient d'un module, le capstone les **coud** dans une boucle unique et ordonnée.

### Exemple 2 — la touche experte + la preuve (60 FPS, zéro fuite)

On ne **déclare** pas « l'expérience est aboutie », on le **prouve** (§2.4-2.7). D'abord la touche experte, puis les preuves.

**a) Touche experte : un halo atmosphérique volumétrique** (module 24) — un `ShaderMaterial` sur une sphère légèrement plus grande que le globe, avec un Fresnel qui fait briller le limbe (bord vu de biais). C'est du **volumétrique simplifié** : le halo est plus intense là où le regard rase la surface.

```typescript
// Halo : sphère de rayon 1.15, rendue par l'INTÉRIEUR (BackSide), additive
const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(1.15, 64, 48),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,                                  // on voit la face interne → limbe
    transparent: true,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(0x3388ff) } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        // Fresnel : intense au limbe (N perpendiculaire à la vue), faible de face (module 19, 24)
        float fresnel = pow(1.0 - abs(dot(vNormal, vView)), 3.0);
        gl_FragColor = vec4(uColor, fresnel);
      }
    `,
  }),
);
scene.add(atmosphere);   // pas enfant du globe : le halo ne tourne pas
```

> **Variante shader créatif (module 19)** — au lieu du halo, faire **pulser** le marqueur sélectionné : un `ShaderMaterial` dont l'`emissiveIntensity` suit `sin(uTime)`, mis à jour dans la boucle (`uTime.value += delta`). Le bloom de l'Exemple 1 amplifie alors la pulsation. Une seule touche experte suffit ; la grille du lab en exige **au moins une**, aboutie.

**b) Preuve de performance : 60 FPS mesurés** (module 17) — on ne suppose pas, on **lit** le compteur.

```typescript
import Stats from 'three/addons/libs/stats.module.js';

const stats = new Stats();
stats.showPanel(0);                 // 0 = FPS
document.body.appendChild(stats.dom);

// dans la boucle : stats.begin() … composer.render() … stats.end()
// Critère de sortie : 60 FPS STABLE avec tous les marqueurs visibles.
// Diagnostic si < 60 : lire renderer.info.render.calls (doit rester bas grâce à l'instancing).
function logInfo(): void {
  console.table({
    drawCalls: renderer.info.render.calls,      // ~quelques unités, PAS des centaines
    triangles: renderer.info.render.triangles,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
  });
}
```

**c) Preuve d'absence de fuite : `dispose()` complet au démontage** (module 17, §2.5).

```typescript
function disposeExperience(): void {
  renderer.setAnimationLoop(null);                          // 1. arrêter la boucle
  scene.traverse((obj) => {                                 // 2. libérer geometries + materials
    if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
      obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => {
        for (const k of Object.keys(m)) {                   // 3. libérer les textures du material
          const v = (m as Record<string, unknown>)[k];
          if (v instanceof THREE.Texture) v.dispose();
        }
        m.dispose();
      });
    }
  });
  composer.dispose();                                       // 4. render targets du post-processing
  controls.dispose();
  renderer.dispose();                                       // 5. le contexte en dernier
  // Preuve : renderer.info.memory (geometries/textures) revient à ~0, STABLE après N cycles.
}
```

La preuve : une expérience qui **affiche 60 FPS au compteur** avec tous les marqueurs, dont `renderer.info.render.calls` **reste bas** (instancing), et dont la **VRAM ne grimpe pas** après plusieurs montages/démontages, est aboutie ; une qui « a l'air fluide sur ma machine » est *supposée* finie.

---

## 4. Pièges & misconceptions

Ces pièges n'apparaissent **qu'à l'assemblage** — chaque brique marchait seule.

### PIÈGE #1 — matériau PBR **sans lumière** → globe noir

```typescript
// ❌ MeshStandardMaterial réagit à la lumière : sans lumière dans la scène → NOIR
const globe = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: albedo }));
scene.add(globe);   // rien ne s'affiche : symptôme "mon globe est invisible"

// ✅ ajouter une DirectionalLight + une ambiante/hémisphérique (modules 14)
scene.add(new THREE.DirectionalLight(0xffffff, 3));
scene.add(new THREE.HemisphereLight(0x88aaff, 0x222233, 0.6));
```

Cause n°1 de « ma scène est noire ». `MeshStandardMaterial`/`Phong`/`Lambert` **exigent** une lumière (module 14).

### PIÈGE #2 — un `Mesh` par sortie → des centaines de draw calls

```
❌ outings.map(o => scene.add(new THREE.Mesh(geo, mat)))  → 300 marqueurs = 300 draw calls → chute FPS
✅ un THREE.InstancedMesh(geo, mat, 300) + setMatrixAt(i, …) → 300 marqueurs = 1 draw call (module 17)
```

Le nombre de draw calls est le premier facteur de perte de FPS. L'instancing (module 17) est **obligatoire** dès qu'on répète le même mesh en nombre. Vérifier avec `renderer.info.render.calls`.

### PIÈGE #3 — appeler `renderer.render()` alors qu'on a un `EffectComposer`

```typescript
// ❌ le post-processing (bloom, tone mapping) est ignoré : on rend "à côté" du composer
renderer.render(scene, camera);

// ✅ le composer PILOTE le rendu ; sa première passe (RenderPass) rend déjà la scène
composer.render();   // module 16
```

Dès qu'un `EffectComposer` existe, c'est **lui** qui rend. Garder `renderer.render()` dans la boucle = bloom/tone mapping invisibles (module 16).

### PIÈGE #4 — oublier de redimensionner le `composer` au resize

```typescript
// ❌ on resize le renderer et la caméra mais pas le composer → post-processing flou/décalé
renderer.setSize(w, h, false);
camera.aspect = w / h; camera.updateProjectionMatrix();

// ✅ le composer et ses render targets doivent suivre la même taille
composer.setSize(w, h);   // module 16
```

Les render targets du post-processing ont leur propre résolution : sans `composer.setSize()`, l'image post-traitée est étirée ou pixelisée après un resize.

### PIÈGE #5 — ne jamais `dispose()` → fuite VRAM au démontage

```
❌ fermer/rouvrir l'expérience (composant Vue monté/démonté) sans dispose → VRAM grimpe → crash
✅ setAnimationLoop(null) + scene.traverse(dispose geometry/material/texture) + composer/renderer.dispose()
```

Le GC JavaScript **ne libère pas** la VRAM (module 17). Sans `dispose()` explicite, chaque cycle de vie fuit. `renderer.info.memory` doit rester **stable**, pas croissant.

### PIÈGE #6 — coordonnées souris → NDC mal converties (raycasting qui rate)

```typescript
// ❌ oublier le -y (l'écran a l'origine en haut, le NDC en bas) ou ignorer le rect du canvas
pointer.x = e.clientX / window.innerWidth * 2 - 1;
pointer.y = e.clientY / window.innerHeight * 2 - 1;   // manque le - → sélection inversée verticalement

// ✅ NDC correct, relatif au canvas (module 20)
const rect = renderer.domElement.getBoundingClientRect();
pointer.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
pointer.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
```

Le raycasting échoue silencieusement si les NDC sont faux (module 20). Toujours partir du `getBoundingClientRect()` du canvas et inverser `y`.

### PIÈGE #7 — croire que Three.js dispense de la théorie WebGL/WebGPU

Le debug de perf (module 17), les shaders custom (`ShaderMaterial`, module 19), le halo volumétrique (module 24) ou le rendu WebGPU (modules 09-12) **exigent** de comprendre buffers, matrices, pipeline, bind groups. Three.js accélère l'écriture, il ne remplace pas les fondamentaux des modules 01-12. Un capstone abouti démontre justement cette compréhension via sa **touche experte**.

### PIÈGE #8 — recalculer/recréer dans la boucle (Raycaster, géométries, matériaux)

```typescript
// ❌ un new Raycaster()/new Vector2() PAR FRAME, ou recréer un Mesh dans animate() → GC pressure + fuite
renderer.setAnimationLoop(() => {
  const ray = new THREE.Raycaster();   // alloue à chaque frame
});

// ✅ allouer UNE fois hors boucle, réutiliser (§2.2)
const raycaster = new THREE.Raycaster();   // créé une seule fois
```

La boucle tourne 60 fois/seconde : y allouer des objets 3D ou des géométries sature le GC et fuit la VRAM. Le scene graph se construit **hors** boucle ; la boucle ne fait que **mettre à jour** et **rendre** (§2.2).

---

## 5. Ancrage TribuZen

Ce module **est** l'ancrage : l'expérience 3D entière, telle qu'elle vivrait dans `smaurier/tribuzen`. Le **globe interactif des sorties de la famille** — le fil rouge tiré depuis le module 13 — atteint ici sa forme aboutie. Emplacement cible dans le repo :

```
tribuzen/
  src/
    3d/
      globe/
        createRenderer.ts    ← WebGLRenderer + shadowMap + toneMapping (modules 14, 16, 18)
        GlobeScene.ts         ← Scene + SphereGeometry PBR + lumières (modules 05, 14)
        Markers.ts            ← InstancedMesh des sorties, lat/lon → Vec3 (modules 01, 17)
        Picker.ts             ← Raycaster clic → sortie sélectionnée (module 20)
        postprocessing.ts     ← EffectComposer + UnrealBloomPass + OutputPass (module 16)
        Atmosphere.ts         ← ShaderMaterial halo volumétrique (touche experte, modules 19, 24)
        loop.ts               ← boucle unique ordonnée (resize→controls→logique→render)
        dispose.ts            ← libération VRAM au démontage (module 17)
      GlobeCanvas.vue        ← <canvas> hôte, onMounted/onUnmounted(dispose)
```

Grille récapitulative — chaque décision TribuZen, sa justification, son module :

| Décision TribuZen | Choix | Module |
|---|---|---|
| Terre réaliste | **MeshStandardMaterial** PBR + texture albédo sRGB | 05, 14 |
| Ombres des marqueurs | **PCFSoftShadowMap** + shadow.bias | 18 |
| Centaines de marqueurs | **InstancedMesh** (1 draw call) | 17 |
| lat/lon → position 3D | **coordonnées sphériques** | 01 |
| Avatars de la famille | **glTF + AnimationMixer** | 15 |
| Sélection d'une sortie | **Raycaster** (NDC corrects) | 20 |
| Marqueur qui brille | **UnrealBloomPass** + émissif | 16 |
| 60 FPS avec tout | **instancing + LOD + frustum culling** | 17 |
| Zéro fuite | **dispose() complet** au démontage | 17 |
| Touche experte | **halo volumétrique** (Fresnel) OU **shader créatif** pulsant | 19 / 24 |
| Inspection immersive (option) | **WebXR** (renderer.xr) | 25 |

Le lab associé te fait **monter et prouver** cette expérience via un starter HTML/TS réel qui tourne dans un navigateur WebGPU/WebGL2.

---

## 6. Points clés

1. Le capstone **assemble**, il n'ajoute rien : chaque brique vient d'un module 00-27 ; un flou = rouvrir le module source, pas deviner.
2. On sépare **scene graph** (ce qui existe), **render pipeline** (comment on dessine) et **interaction** (comment l'utilisateur agit) — jamais tout dans un seul `animate()`.
3. Le cœur est la **boucle unique** : resize → temps → interaction (`controls.update`) → logique (`mixer.update`) → perf → rendu (`composer.render`) ; l'ordre *est* le design.
4. Le **budget de frame** se tient par **instancing** (1 draw call pour N marqueurs), **LOD** et **frustum culling** ; on **mesure** 60 FPS, on ne les suppose pas.
5. Les ressources GPU (geometry/material/texture) fuient sans `dispose()` explicite : `setAnimationLoop(null)` + `scene.traverse` + `composer/renderer.dispose()` au démontage.
6. Le rendu **abouti** exige PBR **sous lumière** (sinon noir), **ombres** douces (PCF + bias), **post-processing** (`composer.render` remplace `renderer.render`, redimensionné au resize).
7. Une **touche experte** (shader créatif / volumétrique / ray tracing / WebXR) est **exigée** — c'est elle qui prouve la maîtrise au-delà de l'assemblage.
8. Le **raycasting** échoue si les NDC sont faux : partir du `getBoundingClientRect()` du canvas, inverser `y`.
9. Une expérience **finie** est **prouvée** : elle tourne dans un vrai navigateur, affiche **60 FPS mesurés** (draw calls bas), ne **fuit pas** la VRAM, et montre une **feature experte** visible — pas seulement « ça a l'air fluide chez moi ».

---

## 7. Seeds Anki

```
Dans une expérience 3D web, comment répartit-on les responsabilités du code ?|Trois zones distinctes : le scene graph (ce qui existe : Scene, Mesh, Light, transforms — modules 13-14), le render pipeline (comment on dessine : renderer, EffectComposer, ordre des passes — module 16), l'interaction (comment l'utilisateur agit : OrbitControls, Raycaster, physique — module 20). Ne jamais tout empiler dans un seul animate() ; ne rien créer (Mesh, Raycaster) dans la boucle.
Quel est l'ordre des opérations dans une frame de rendu, et pourquoi ?|resize (avant tout rendu : sinon aspect périmé) → temps delta (clock.getDelta) → interaction (controls.update pour le damping, raycasting) → logique (rotation, mixer.update des animations) → perf (LOD/culling) → rendu (composer.render en DERNIER, post-processing sur l'image déjà rendue ombres comprises). L'ordre est le design : resize en 1, controls.update en 3, post-processing en dernier.
Comment afficher des centaines de marqueurs 3D sans effondrer le framerate ?|InstancedMesh(geometry, material, N) + setMatrixAt(i, matrice) par instance : N marqueurs = 1 seul draw call au lieu de N (module 17). Un Mesh par marqueur = autant de draw calls = chute des FPS. Vérifier avec renderer.info.render.calls (doit rester bas). Compléter avec LOD et frustum culling (actif par défaut).
Pourquoi une scène Three.js peut-elle apparaître totalement noire ?|Parce que MeshStandardMaterial (comme Phong/Lambert) réagit à la lumière : sans DirectionalLight/HemisphereLight dans la scène, aucun objet ne reçoit de lumière → rendu noir (module 14). Solution : ajouter une lumière directionnelle + une ambiante/hémisphérique, ou passer temporairement à MeshBasicMaterial pour vérifier la géométrie.
Comment éviter les fuites de mémoire GPU dans une expérience 3D ?|Le GC JavaScript ne libère PAS la VRAM. Au démontage : setAnimationLoop(null) pour arrêter la boucle, puis scene.traverse pour dispose() chaque geometry, chaque material et chaque texture, puis composer.dispose() (render targets) et renderer.dispose() en dernier (module 17). Preuve : renderer.info.memory (geometries/textures) reste stable après plusieurs cycles montage/démontage, pas croissant.
Quand on utilise un EffectComposer, que faut-il changer dans la boucle et au resize ?|Dans la boucle : remplacer renderer.render(scene, camera) par composer.render() — sinon le post-processing (bloom, tone mapping) est ignoré. Au resize : appeler composer.setSize(w, h) en plus de renderer.setSize et camera.updateProjectionMatrix, car les render targets du composer ont leur propre résolution (module 16).
Comment convertir une position souris en rayon pour le raycasting, sans se tromper ?|Partir du getBoundingClientRect() du canvas, calculer les NDC dans [-1, 1] : x = ((clientX - rect.left)/rect.width)*2 - 1, et y = -((clientY - rect.top)/rect.height)*2 + 1 (le -y car l'écran a l'origine en haut, le NDC en bas). Puis raycaster.setFromCamera(pointer, camera) et intersectObject. Oublier le -y inverse la sélection verticalement (module 20).
Qu'est-ce qui distingue une expérience 3D aboutie d'un prototype, dans le capstone ?|Une touche EXPERTE visible et fonctionnelle, au choix : shader créatif (ShaderMaterial pulsant, module 19), rendu volumétrique (halo atmosphérique Fresnel, module 24), ray tracing hybride (reflets compute, module 22) ou WebXR (inspection VR, module 25). C'est elle qui prouve la maîtrise au-delà du simple assemblage — la grille du lab en exige au moins une, aboutie.
Qu'est-ce qui prouve qu'une expérience 3D est finie plutôt que supposée finie ?|Elle tourne dans un vrai navigateur WebGPU/WebGL2 (pas seulement "chez moi"), elle affiche 60 FPS MESURÉS au compteur (stats.js) avec tous les marqueurs visibles et renderer.info.render.calls bas (instancing), elle ne FUIT pas la VRAM (renderer.info.memory stable après plusieurs montages/démontages), et elle montre une feature experte visible. "Ça a l'air fluide" ne prouve rien.
```

---

## Pour aller plus loin (références intégrées)

Une fois l'expérience montée, ces ressources approfondissent chaque couche. Classées par ce qu'elles apportent **concrètement**.

**Les sources officielles (à garder ouvertes) :**
- **Three.js — docs & manual** (https://threejs.org/docs, https://threejs.org/manual) : `Scene`/`Camera`/`Renderer`, matériaux, `EffectComposer`, `InstancedMesh`, `dispose()` — la source des modules 13-17.
- **WebGPU — MDN & spec** (https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API, https://gpuweb.github.io/gpuweb) : adapter/device, pipeline, bind groups — modules 09-12.
- **WGSL — spec** (https://gpuweb.github.io/gpuweb/wgsl) : la référence du langage de shader WebGPU — modules 09-12.

**Rendu & théorie :**
- **learnopengl.com — PBR** (https://learnopengl.com/PBR/Theory) : Cook-Torrance, GGX, Fresnel-Schlick — modules 05, 14.
- **Google Filament — docs** (https://google.github.io/filament/) : le PBR de référence, metalness/roughness — modules 05, 14.

**Effets experts :**
- **The Book of Shaders** (https://thebookofshaders.com) : noise, raymarching, effets procéduraux — module 19.
- **WebXR — MDN** (https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API) : sessions VR/AR, `renderer.xr` — module 25.

**Le livre, pour la vue d'ensemble :**
- **Real-Time Rendering** (Akenine-Möller, Haines, Hoffman) reste la référence exhaustive pour relier maths, pipeline, PBR, ombres et rendu avancé en un tout cohérent.

---

## Pont vers le lab

> Lab associé : `labs/lab-28-projet-final/README.md`. **Capstone** : concevoir et implémenter l'expérience 3D TribuZen de bout en bout via un starter HTML/TS réel — scène Three.js (ou `WebGPURenderer`), globe **PBR** ombré, **marqueurs instanciés** géolocalisés, **raycasting** de sélection, **post-processing** (bloom + ACES), boucle **unique ordonnée**, et **une touche experte** (shader créatif / volumétrique / ray tracing / WebXR). Puis **prouver** l'expérience : navigateur réel, **60 FPS mesurés** (draw calls bas), **zéro fuite** VRAM, feature experte visible. Cahier des charges, jalons, grille exigeante, coach en session (≥ 3 checkpoints), variante J+30 (extension). Zéro harnais simulé.

---

> **Note :** ce module est le **dernier du parcours 20-webgpu-3d**. Le `next` pointe vers `fin-parcours-20-webgpu-3d` — tu as couvert l'intégralité du cours 3D / WebGPU, des matrices et quaternions (modules 01-02) jusqu'à une expérience 3D TribuZen entière : **PBR**, **ombrée**, peuplée de **marqueurs instanciés**, **interactive** (raycasting), **post-traitée** (bloom + ACES), tenant **60 FPS**, sans **fuite** VRAM, et distinguée par une **touche experte** (shader créatif, volumétrique, ray tracing ou WebXR) — et surtout **prouvée**, pas seulement supposée.

← [Module 27 — Virtual textures et streaming](27-virtual-textures-et-streaming.md)
