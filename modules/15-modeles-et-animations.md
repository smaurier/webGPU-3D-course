---
titre: Modèles et animations (glTF, skinning, AnimationMixer)
cours: 20-webgpu-3d
notions:
  - "GLTFLoader (three/addons/loaders/GLTFLoader.js)"
  - "formats glTF 2.0 : .gltf vs .glb"
  - "objet résultat GLTF (scene, animations, cameras, asset)"
  - "loadAsync et LoadingManager"
  - "DRACOLoader (compression de géométrie)"
  - "SkinnedMesh, Bone, Skeleton (skinning/rigging)"
  - "AnimationMixer (rootObject, update(delta))"
  - "AnimationClip et KeyframeTrack"
  - "AnimationAction (play, setLoop, crossFadeTo)"
  - "morph targets (morphTargetInfluences / morphTargetDictionary)"
  - "boucle de rendu et THREE.Clock.getDelta()"
outcomes:
  - sait charger un modèle glTF/GLB avec GLTFLoader.loadAsync et l'ajouter à la scène
  - sait brancher un DRACOLoader pour décompresser une géométrie Draco
  - sait créer un AnimationMixer et jouer un AnimationClip via une AnimationAction dans la boucle
  - sait enchaîner deux animations avec crossFadeTo et configurer les modes de boucle
  - sait manipuler bones (SkinnedMesh) et morph targets pour une animation fine
prerequis:
  - "00-prerequis-et-introduction (GPU, aperçu pipeline)"
  - "13-threejs-fondamentaux (scene/camera/renderer, mesh, boucle de rendu)"
  - "14-materiaux-et-lumieres-threejs (materials PBR, lights, ombres)"
next: 16-post-processing-et-effets
libs: [{ name: three, version: "r170+" }]
tribuzen: "front-office TribuZen — une mascotte 3D animée (avatar glTF) qui accueille la famille sur la fiche d'une sortie : chargée via GLTFLoader, animée en boucle via AnimationMixer"
last-reviewed: 2026-07
---

# Modèles et animations (glTF, skinning, AnimationMixer)

> **Outcomes — tu sauras FAIRE :** charger un modèle glTF/GLB avec `GLTFLoader`, brancher `DRACOLoader`, jouer un `AnimationClip` via un `AnimationMixer` dans la boucle de rendu, enchaîner des animations avec `crossFadeTo`, et manipuler bones et morph targets.
> **Difficulté :** :star::star::star:
>
> **Portée :** ce module charge des assets **produits ailleurs** (Blender, Mixamo) et les **anime**. On ne modélise rien à la main (c'est le module 21) et on ne fait pas de post-processing (module 16). Prérequis directs : la scène/boucle du module 13 et les matériaux/ombres du module 14.

## 1. Cas concret d'abord

TribuZen veut une touche chaleureuse : sur la fiche d'une sortie de la famille (rando, pique-nique), une **petite mascotte 3D** — un avatar animé — accueille l'utilisateur en agitant la main, puis passe en boucle « idle » (respiration légère). Tout le reste du cours a construit des cubes et des triangles ; ici on charge un **vrai personnage rigué avec ses animations**, exporté depuis Blender au format `.glb`.

Le réflexe « débutant » qui **ne marche pas** :

```typescript
// ❌ Le modèle s'affiche… figé. Il ne bouge JAMAIS.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const gltf = await loader.loadAsync('/models/mascotte.glb');
scene.add(gltf.scene);

// On croit que c'est fini. Mais les animations dorment dans gltf.animations,
// personne ne les joue, et rien n'avance l'horloge d'animation.
```

Le modèle apparaît, mais **statue**. Il manque trois choses que ce module met en place :

1. un **`AnimationMixer`** attaché au modèle (le « lecteur » d'animations) ;
2. une **`AnimationAction`** créée depuis un `AnimationClip` de `gltf.animations`, puis `.play()` ;
3. l'appel **`mixer.update(delta)` à chaque frame** de la boucle de rendu, avec `delta` en secondes.

Sans ces trois éléments, un modèle glTF animé reste immobile — sans aucune erreur. Ce module pose le protocole complet, du chargement jusqu'à la boucle qui fait vivre la mascotte.

---

## 2. Théorie complète, concise

### 2.1 Le format glTF 2.0 : `.gltf` vs `.glb`

**glTF 2.0** (GL Transmission Format, standard Khronos) est le format 3D du web : ouvert, PBR natif, animations squelettiques et morph targets, extensions de compression. Deux conditionnements :

- **`.gltf`** — un JSON lisible + un `.bin` (buffers) + les textures en fichiers séparés. Pratique pour debugger, mais plusieurs requêtes HTTP.
- **`.glb`** — **tout empaqueté dans un seul fichier binaire** (JSON + buffers + textures). Un seul `fetch`, pas de souci CORS sur les textures. **C'est le choix par défaut pour le web** (donc pour TribuZen).

### 2.2 GLTFLoader : charger un modèle

`GLTFLoader` vit dans les addons Three.js (pas dans le cœur `three`) — d'où l'import depuis `three/addons/loaders/GLTFLoader.js`. Deux façons de charger, la version `async` étant la plus lisible :

```typescript
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

// Version callback : load(url, onLoad, onProgress?, onError?)
loader.load(
  '/models/mascotte.glb',
  (gltf) => { scene.add(gltf.scene); },          // onLoad
  (event) => { console.log(event.loaded, event.total); }, // onProgress
  (error) => { console.error(error); },          // onError
);

// Version async (recommandée) : loadAsync(url, onProgress?) → Promise<GLTF>
const gltf = await loader.loadAsync('/models/mascotte.glb');
scene.add(gltf.scene);
```

### 2.3 L'objet résultat `GLTF`

`onLoad` (ou la promesse) reçoit un objet dont les champs utiles sont :

```typescript
// Champs confirmés sur threejs.org/docs (GLTFLoader)
interface GLTF {
  scene: THREE.Group;                 // la scène par défaut (à ajouter à ta scène)
  scenes: THREE.Group[];              // toutes les scènes du fichier
  animations: THREE.AnimationClip[];  // tous les clips d'animation
  cameras: THREE.Camera[];            // caméras embarquées par l'artiste
  asset: Record<string, unknown>;     // métadonnées (version, generator...)
  userData: Record<string, unknown>;  // données custom
}
```

Le champ clé pour ce module est **`animations`** : c'est là que dorment les `AnimationClip`. `gltf.scene` est un `Group` que tu ajoutes à la scène ; tu peux le parcourir avec `traverse()` pour activer les ombres :

```typescript
gltf.scene.traverse((child) => {
  if (child instanceof THREE.Mesh) {
    child.castShadow = true;
    child.receiveShadow = true;
  }
});
```

### 2.4 DRACOLoader : compression de géométrie

Un modèle détaillé peut peser des dizaines de Mo en géométrie brute. **Draco** (algorithme Google) compresse la géométrie de 60 à 90 %. Le décodeur est un fichier WASM/JS hébergé à part ; on le branche sur le `GLTFLoader` :

```typescript
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const dracoLoader = new DRACOLoader();
// Chemin vers les fichiers décodeur (copiés depuis three/examples/jsm/libs/draco/)
dracoLoader.setDecoderPath('/draco/');
dracoLoader.setDecoderConfig({ type: 'js' });   // 'js' ou 'wasm'
dracoLoader.preload();                            // pré-charge le décodeur (optionnel)

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);           // décompresse Draco automatiquement

const gltf = await gltfLoader.loadAsync('/models/mascotte_draco.glb');
```

Un modèle Draco chargé **sans** `setDRACOLoader` échoue : le loader ne sait pas décompresser. Signature `setDecoderPath`/`setDecoderConfig`/`preload`/`dispose` confirmée sur threejs.org/docs (DRACOLoader).

### 2.5 Skinning : SkinnedMesh, Bone, Skeleton

Une animation **squelettique** déforme un maillage via un **squelette** (arbre de `Bone`). Chaque sommet porte des **poids** (skin weights) indiquant quels bones l'influencent et à quel degré. Three.js représente ça par un `SkinnedMesh` (le maillage « peau ») lié à un `Skeleton` (l'ensemble des bones) :

```typescript
gltf.scene.traverse((node) => {
  if (node instanceof THREE.SkinnedMesh) {
    console.log('bones :', node.skeleton.bones.length);
    node.skeleton.bones.forEach((bone) => console.log(bone.name)); // "Hips", "Head"...
  }
});
```

On peut manipuler un bone à la main (ex. tourner la tête) en modifiant sa `rotation` — mais le plus souvent ce sont les **clips d'animation** qui pilotent tout le squelette.

### 2.6 AnimationClip et KeyframeTrack

Un **`AnimationClip`** est un « morceau » réutilisable : un nom, une durée (secondes), et une liste de **`KeyframeTrack`** (une courbe par propriété animée — `Hips.position`, `Head.quaternion`…) :

```typescript
const clip = gltf.animations[0];
console.log(clip.name, clip.duration, clip.tracks.length);
```

### 2.7 AnimationMixer : le lecteur

L'**`AnimationMixer`** est le moteur qui fait avancer les animations d'**un** objet racine. On l'attache au modèle chargé :

```typescript
// Constructeur : new AnimationMixer(rootObject) — confirmé threejs.org/docs
const mixer = new THREE.AnimationMixer(gltf.scene);
```

Sa méthode centrale est **`update(deltaSeconds)`**, appelée **une fois par frame** avec le temps écoulé depuis la frame précédente. Sans cet appel, aucune animation n'avance :

```typescript
const clock = new THREE.Clock();

function animate(): void {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();   // secondes écoulées depuis le dernier getDelta()
  mixer.update(delta);              // CRUCIAL : avance toutes les actions du mixer
  renderer.render(scene, camera);
}
```

`Clock.getDelta()` renvoie **des secondes** — exactement l'unité attendue par `mixer.update`.

### 2.8 AnimationAction : les contrôles

Un **`AnimationAction`** est un clip *joué sur un mixer donné*. On l'obtient par `mixer.clipAction(clip)` puis on le contrôle :

```typescript
const action = mixer.clipAction(clip);
action.play();     // démarre
action.stop();     // arrête + remet à zéro
action.paused = true;   // pause sans reset

// Modes de boucle (constantes confirmées threejs.org/docs)
action.setLoop(THREE.LoopOnce, 1);          // une seule fois
action.setLoop(THREE.LoopRepeat, Infinity); // boucle infinie (défaut)
action.setLoop(THREE.LoopPingPong, Infinity); // aller-retour
action.clampWhenFinished = true;            // reste figé sur la dernière frame

action.timeScale = 0.5;                      // vitesse (0.5 = ralenti)
action.setEffectiveWeight(1.0);              // influence [0..1] pour le blending
```

### 2.9 Enchaîner deux animations : crossFadeTo

Pour passer de « saluer » à « idle » sans à-coup, on fait un **fondu enchaîné**. `crossFadeTo(actionCible, durée, warp)` diminue le poids de l'action courante et monte celui de la cible sur `durée` secondes :

```typescript
const salut = mixer.clipAction(clips.find((c) => c.name === 'Wave')!);
const idle  = mixer.clipAction(clips.find((c) => c.name === 'Idle')!);

salut.play();
idle.play();
// Après le salut, transition douce de 0,4 s vers idle
salut.crossFadeTo(idle, 0.4, false);
```

### 2.10 Morph targets (blend shapes)

Les **morph targets** déforment un maillage entre des formes prédéfinies (expressions faciales : sourire, clignement). Chaque cible a un **poids** dans `morphTargetInfluences`, indexé par `morphTargetDictionary` :

```typescript
gltf.scene.traverse((node) => {
  if (node instanceof THREE.Mesh && node.morphTargetInfluences) {
    const i = node.morphTargetDictionary?.['smile'];
    if (i !== undefined) node.morphTargetInfluences[i] = 0.8; // 80 % de sourire
  }
});
```

Les morph targets peuvent aussi être pilotés par les clips d'animation glTF, comme le squelette.

---

## 3. Worked examples

### Exemple 1 — Charger la mascotte et jouer son animation (TribuZen)

Le protocole complet : charger un `.glb` animé, créer le mixer, jouer le premier clip, brancher la boucle. C'est le cœur du lab.

```typescript
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Scène minimale (module 13) ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.4, 3);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.update();

// Éclairage (module 14)
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.0));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(3, 5, 2);
sun.castShadow = true;
scene.add(sun);

// --- Chargement + animation ---
const clock = new THREE.Clock();
let mixer: THREE.AnimationMixer | null = null;

async function loadMascotte(): Promise<void> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync('/models/mascotte.glb');

  // Activer les ombres sur chaque mesh du modèle
  gltf.scene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  scene.add(gltf.scene);

  // 1. Le mixer, attaché à la racine du modèle
  mixer = new THREE.AnimationMixer(gltf.scene);

  // 2. Jouer le premier clip disponible en boucle
  if (gltf.animations.length > 0) {
    const action = mixer.clipAction(gltf.animations[0]);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();
  }
}

// 3. La boucle : mixer.update(delta) chaque frame
function animate(): void {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();     // secondes
  if (mixer) mixer.update(delta);     // fait vivre la mascotte
  controls.update();
  renderer.render(scene, camera);
}

loadMascotte();
animate();
```

La mascotte apparaît **et bouge**. Retirer `mixer.update(delta)` la fige instantanément : c'est le piège n°1.

### Exemple 2 — Enchaîner « saluer » puis « idle » avec crossFadeTo

La mascotte salue une fois à l'arrivée, puis passe en boucle « idle ». On joue les deux actions, on limite le salut à une passe, et on déclenche le fondu à la fin du salut via l'événement `finished` du mixer :

```typescript
async function loadWithGreeting(): Promise<void> {
  const gltf = await new GLTFLoader().loadAsync('/models/mascotte.glb');
  scene.add(gltf.scene);
  mixer = new THREE.AnimationMixer(gltf.scene);

  const clipByName = (n: string) => gltf.animations.find((c) => c.name === n);

  const wave = mixer.clipAction(clipByName('Wave')!);
  const idle = mixer.clipAction(clipByName('Idle')!);

  // Le salut ne joue qu'une fois et se fige à la dernière frame
  wave.setLoop(THREE.LoopOnce, 1);
  wave.clampWhenFinished = true;
  wave.play();

  // À la fin du salut, fondu de 0,4 s vers idle (boucle infinie)
  mixer.addEventListener('finished', (e) => {
    if ((e as { action: THREE.AnimationAction }).action === wave) {
      idle.reset();
      idle.setLoop(THREE.LoopRepeat, Infinity);
      idle.play();
      wave.crossFadeTo(idle, 0.4, false);
    }
  });
}
```

Le résultat : un accueil naturel (salut → respiration) sans coupure visible. Le `clampWhenFinished` évite que la mascotte « saute » à la pose de repos avant le fondu.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Oublier `mixer.update(delta)` dans la boucle

L'erreur la plus fréquente. Le modèle s'affiche, les actions sont en `play()`, mais **rien ne bouge** parce que l'horloge d'animation n'avance jamais. **Chaque frame** doit appeler `mixer.update(delta)`. Aucune erreur n'est levée — juste une statue.

### PIÈGE #2 — Passer des millisecondes à `mixer.update`

`mixer.update` attend un **delta en secondes**. Passer `performance.now()` (millisecondes) ou un delta en ms fait défiler l'animation à ~1000× la vitesse (illisible). Utiliser `THREE.Clock.getDelta()`, qui renvoie déjà des secondes.

### PIÈGE #3 — Importer GLTFLoader depuis le cœur `three`

`GLTFLoader`, `DRACOLoader`, `OrbitControls` ne sont **pas** dans le paquet `three` ; ils vivent dans les addons : `import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'`. Faire `import { GLTFLoader } from 'three'` échoue.

### PIÈGE #4 — Charger un modèle Draco sans DRACOLoader

Un `.glb` compressé Draco chargé par un `GLTFLoader` sans `setDRACOLoader` lève une erreur (« no DRACOLoader instance provided »). Il faut instancier `DRACOLoader`, pointer `setDecoderPath` vers les fichiers du décodeur, et l'attacher **avant** `loadAsync`.

### PIÈGE #5 — Recréer un AnimationMixer par frame

Le mixer doit être créé **une seule fois** (au chargement) et réutilisé. Le recréer dans la boucle réinitialise l'état d'animation à chaque frame → le modèle reste bloqué sur la première pose. Un mixer par modèle, gardé en variable.

### PIÈGE #6 — Croire que `action.play()` suffit à animer

`play()` **active** l'action, mais c'est `mixer.update()` qui la fait avancer. `play()` sans boucle de mise à jour ne produit rien. À l'inverse, `mixer.update()` sur une action jamais `play()`-ée ne joue rien non plus : les deux sont nécessaires.

### PIÈGE #7 — Confondre `stop()` et `paused`

`action.stop()` arrête **et remet l'animation à zéro** (retour à la première frame). `action.paused = true` **gèle sur place** sans reset (reprise possible avec `paused = false`). Utiliser `stop()` quand on veut repartir du début, `paused` pour une vraie pause.

---

## 5. Ancrage TribuZen

La **mascotte d'accueil** est la première feature 3D « produit » de TribuZen (les modules précédents produisaient des primitives). Sur la fiche d'une sortie, un avatar glTF animé accueille la famille : il salue à l'ouverture, puis reste en boucle « idle ».

Chaîne concrète dans `smaurier/tribuzen` :

1. **Asset** — `mascotte.glb` exporté depuis Blender/Mixamo, compressé Draco (`gltf-transform draco`), servi depuis `public/models/`.
2. **Chargement** — `GLTFLoader` + `DRACOLoader` (décodeur dans `public/draco/`), `loadAsync` dans un composable.
3. **Animation** — un `AnimationMixer` par mascotte, clip « Idle » en `LoopRepeat`, `crossFadeTo` vers « Wave » au survol.
4. **Boucle** — `mixer.update(clock.getDelta())` dans le `requestAnimationFrame` du canvas de la fiche.

Fichiers cibles :

```
tribuzen/
  public/
    models/mascotte.glb        ← avatar animé compressé Draco
    draco/                     ← fichiers du décodeur Draco
  src/
    3d/
      loaders/gltf.ts          ← GLTFLoader + DRACOLoader configurés (Exemple 1)
      MascotteScene.ts         ← mixer + clips + crossFade (Exemple 2)
    components/
      outing/OutingMascotte.vue ← <canvas> hôte de la mascotte sur la fiche sortie
```

> Le suivi de chargement (barre de progression via `LoadingManager`) et les morph targets d'expression (sourire quand une sortie est validée) viendront enrichir la mascotte ; ici on pose le socle : **elle se charge et elle s'anime**.

---

## 6. Points clés

1. **glTF 2.0** est le format 3D du web ; `.glb` (tout-en-un binaire) est le choix par défaut, `.gltf` (JSON + fichiers) sert au debug.
2. `GLTFLoader` s'importe depuis `three/addons/loaders/GLTFLoader.js` ; `loadAsync(url)` renvoie une `Promise<GLTF>`.
3. L'objet `GLTF` expose `scene` (à ajouter à la scène) et `animations` (les `AnimationClip` à jouer).
4. `DRACOLoader` + `setDecoderPath` + `gltfLoader.setDRACOLoader(...)` décompresse les géométries Draco ; obligatoire pour un asset Draco.
5. Le **skinning** déforme un `SkinnedMesh` via un `Skeleton` de `Bone` pondérés ; on peut inspecter `node.skeleton.bones`.
6. `new THREE.AnimationMixer(gltf.scene)` crée le lecteur ; **`mixer.update(delta)` chaque frame** (delta en secondes via `Clock.getDelta()`) fait avancer les animations.
7. `mixer.clipAction(clip)` donne une `AnimationAction` : `play()`, `setLoop(LoopOnce/LoopRepeat/LoopPingPong, n)`, `clampWhenFinished`, `timeScale`.
8. `crossFadeTo(cible, durée, warp)` enchaîne deux actions en fondu ; les **morph targets** (`morphTargetInfluences`/`morphTargetDictionary`) gèrent les expressions.

---

## 7. Seeds Anki

```
Quelle différence entre un fichier glTF .gltf et .glb ?|.gltf = JSON lisible + .bin + textures en fichiers séparés (plusieurs requêtes, utile au debug). .glb = tout empaqueté dans un seul binaire (JSON+buffers+textures), un seul fetch, pas de CORS textures → choix par défaut pour le web.
D'où s'importe GLTFLoader et que renvoie loadAsync ?|Depuis 'three/addons/loaders/GLTFLoader.js' (addons, pas le cœur three). loadAsync(url) renvoie une Promise<GLTF>. L'objet GLTF expose scene (Group à ajouter), animations (AnimationClip[]), cameras, asset, userData.
Quelles 3 étapes rendent un modèle glTF animé vivant ?|1) créer un AnimationMixer attaché à gltf.scene ; 2) mixer.clipAction(clip).play() sur un clip de gltf.animations ; 3) appeler mixer.update(delta) CHAQUE frame dans la boucle, delta en secondes (Clock.getDelta()). Sans le 3, le modèle reste figé sans erreur.
En quelle unité doit être le delta passé à mixer.update() ?|En SECONDES. THREE.Clock.getDelta() renvoie déjà des secondes. Passer des millisecondes (ex. performance.now()) fait défiler l'animation ~1000× trop vite.
Comment brancher DRACOLoader sur GLTFLoader ?|new DRACOLoader() → setDecoderPath('/draco/') (fichiers du décodeur) → setDecoderConfig({type:'js'}) → preload() ; puis gltfLoader.setDRACOLoader(dracoLoader) AVANT loadAsync. Un .glb Draco sans DRACOLoader lève une erreur.
Quels sont les trois modes de boucle d'une AnimationAction ?|THREE.LoopOnce (une passe), THREE.LoopRepeat (boucle infinie, défaut), THREE.LoopPingPong (aller-retour). On les fixe via action.setLoop(mode, repetitions) ; clampWhenFinished=true fige sur la dernière frame en fin de LoopOnce.
Que fait crossFadeTo et à quoi sert-il ?|action.crossFadeTo(actionCible, durée, warp) fait un fondu enchaîné : diminue le poids de l'action courante et monte celui de la cible sur 'durée' secondes. Sert à passer d'une animation à une autre (idle→walk, wave→idle) sans à-coup. Les deux actions doivent être en play().
Différence entre action.stop() et action.paused = true ?|stop() arrête ET remet à zéro (retour à la première frame). paused=true gèle sur place sans reset (reprise avec paused=false). stop pour repartir du début, paused pour une vraie pause.
Comment fonctionnent les morph targets pour une expression faciale ?|Le mesh porte morphTargetInfluences (tableau de poids 0..1) indexé par morphTargetDictionary (nom→index). Ex : mesh.morphTargetInfluences[dict['smile']] = 0.8 pour 80% de sourire. Ils peuvent aussi être pilotés par les clips glTF.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-15-modeles-et-animations/README.md`. Charger un modèle glTF animé dans le navigateur et jouer une de ses animations via `AnimationMixer` — protocole complet (loader, mixer, boucle) écrit de zéro, corrigé HTML/TS commenté.
