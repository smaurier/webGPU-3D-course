---
titre: Audio 3D spatial (Web Audio + Three.js PositionalAudio)
cours: 20-webgpu-3d
notions:
  - "Web Audio API : AudioContext, audio graph, .connect()"
  - "AudioBufferSourceNode + decodeAudioData (chargement d'un son)"
  - "PannerNode : spatialisation d'une source dans l'espace 3D"
  - "AudioListener (Web Audio) : positionX/Y/Z, forwardX/Y/Z, upX/Y/Z"
  - "panningModel 'HRTF' vs 'equalpower' (rendu binaural)"
  - "distanceModel : 'inverse' / 'linear' / 'exponential', refDistance, maxDistance, rolloffFactor"
  - "cône directionnel : coneInnerAngle, coneOuterAngle, coneOuterGain"
  - "Three.js : AudioListener sur la caméra, PositionalAudio sur un Object3D, AudioLoader"
  - "occlusion sonore approximée par un BiquadFilterNode lowpass (setFilter)"
  - "autoplay policy : AudioContext 'suspended' -> resume() sur geste utilisateur"
outcomes:
  - sait construire un audio graph Web Audio (AudioContext, source, panner, destination) et le connecter
  - sait spatialiser une source avec un PannerNode (position, panningModel HRTF, distanceModel, cône)
  - sait synchroniser l'AudioListener Web Audio avec une caméra 3D
  - sait attacher un THREE.PositionalAudio à un objet d'une scène Three.js via un THREE.AudioListener sur la caméra
  - sait régler l'atténuation par distance (refDistance, rolloffFactor, distanceModel) et un cône directionnel
  - sait approximer une occlusion sonore avec un BiquadFilterNode lowpass et gérer l'autoplay policy
prerequis:
  - "13-threejs-fondamentaux (Scene / Camera / Renderer, Mesh, boucle, OrbitControls)"
  - "14-materiaux-et-lumieres-threejs (matériaux, lumières, graphe de scène hiérarchique)"
  - "03-cameras-et-projections (position/orientation caméra, getWorldDirection)"
  - "25-webxr-et-animation-procedurale (immersion : l'audio spatial complète la présence)"
next: 27-virtual-textures-et-streaming
libs: ["three"]
tribuzen: "ambiance sonore spatialisée d'une sortie sur la carte TribuZen — chaque point d'intérêt (feu de camp, rivière, place animée) émet un son 3D attaché à son objet, atténué par la distance et orienté par la caméra"
last-reviewed: 2026-07
---

# Audio 3D spatial (Web Audio + Three.js `PositionalAudio`)

> **Outcomes — tu sauras FAIRE :** construire un audio graph Web Audio, spatialiser une source avec un `PannerNode`, synchroniser l'`AudioListener` avec la caméra, et attacher un `THREE.PositionalAudio` à un objet d'une scène Three.js avec atténuation par distance, cône directionnel et occlusion approximée.
> **Difficulté :** :star::star::star:
>
> **Portée :** ce module ajoute la **dimension sonore** à la scène 3D. On part du **Web Audio API brut** (comprendre ce qui se passe), puis on utilise l'**abstraction Three.js** (`AudioListener` + `PositionalAudio`) — exactement le même rapport qu'entre WebGL brut (modules 06-08) et Three.js (module 13). Version de référence : **Three.js r185** (2026). Le rendu volumétrique et la synthèse procédurale de son ne sont pas couverts.

## 1. Cas concret d'abord

Fil rouge TribuZen : l'utilisateur ouvre la **carte 3D d'une sortie de la famille** (le globe du module 13, zoomé sur un lieu). Sur cette scène, plusieurs **points d'intérêt** : un feu de camp qui crépite, une rivière qui coule à gauche, une place de village animée au loin. Aujourd'hui, tous ces sons — si on les jouait — sortiraient **à plat**, volume identique, sans direction. L'utilisateur ne « sent » pas l'espace.

Objectif du module : quand l'utilisateur **oriente la caméra** vers le feu, le crépitement vient **de devant** ; quand il s'en **éloigne** (`OrbitControls`), le son **baisse** ; la rivière reste **à gauche**. Le son est **attaché à l'objet 3D** et se comporte comme dans le monde réel.

Voici l'objectif — un son attaché à un objet d'une scène Three.js, spatialisé — en quelques lignes :

```typescript
import * as THREE from 'three';

// 1. Les "oreilles" : un AudioListener sur la caméra (suit automatiquement sa position/orientation)
const listener = new THREE.AudioListener();
camera.add(listener);

// 2. Un objet visible = la source (le feu de camp)
const campfire = new THREE.Mesh(geometry, material);
campfire.position.set(3, 0, -2);
scene.add(campfire);

// 3. Un son 3D ATTACHÉ à cet objet
const sound = new THREE.PositionalAudio(listener);
new THREE.AudioLoader().load('/sounds/campfire.ogg', (buffer) => {
  sound.setBuffer(buffer);
  sound.setRefDistance(2);   // à 2 unités, volume de référence ; au-delà, ça baisse
  sound.setLoop(true);
  sound.play();
});
campfire.add(sound);          // enfant du feu -> suit sa position dans le graphe de scène
```

Three.js n'ajoute pas de magie : sous le capot, `PositionalAudio` **est** un `PannerNode` de la **Web Audio API**, et `AudioListener` **est** l'`AudioListener` Web Audio synchronisé sur la caméra. Ce module montre d'abord le mécanisme brut (pour pouvoir régler et débugger), puis l'abstraction Three.js — et ce que chaque objet remplace.

---

## 2. Théorie complète, concise

### 2.1 L'audio graph : mêmes réflexes que le pipeline de rendu

La **Web Audio API** traite le son comme un **graphe de nœuds** : une source produit un signal, il traverse des nœuds de traitement (gain, filtres, spatialisation), puis atteint la **destination** (les enceintes). C'est le pendant sonore du pipeline de rendu : là où des sommets traversent vertex → fragment → framebuffer, ici un signal traverse `source` → `effets` → `destination`. On câble les nœuds avec `.connect()`.

```
Audio graph — un signal qui traverse des nœuds
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 AudioBufferSourceNode → GainNode → PannerNode → AudioContext.destination
     (le son)            (volume)   (position 3D)     (enceintes / casque)
```

Le point d'entrée est l'`AudioContext` : il crée les nœuds, gère l'horloge audio (`currentTime`) et la destination.

```typescript
const ctx = new AudioContext();
ctx.destination; // le nœud de sortie final (enceintes)
ctx.currentTime; // horloge audio en secondes, pour programmer les événements
```

### 2.2 Charger un son : `fetch` + `decodeAudioData`

Un son spatialisé se joue depuis un `AudioBuffer` (PCM décodé en mémoire). On récupère les octets puis on les décode :

```typescript
async function loadAudioBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Audio ${url}: ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  return ctx.decodeAudioData(arrayBuffer); // renvoie une Promise<AudioBuffer>
}
```

Le buffer se joue via un `AudioBufferSourceNode`. **Point crucial :** une source est **à usage unique** — après `start()`, elle ne peut pas être rejouée ; il faut en recréer une pour rejouer le même buffer. Le buffer, lui, est réutilisable.

```typescript
const source = ctx.createBufferSource();
source.buffer = buffer;
source.loop = true;
source.start(0); // joue immédiatement
```

### 2.3 `PannerNode` : positionner une source dans l'espace

Le `PannerNode` est le nœud qui **spatialise** : il calcule le volume gauche/droite et l'atténuation selon la position de la source **relative à l'`AudioListener`**. On le crée avec `createPanner()` (ou `new PannerNode(ctx, options)`).

```typescript
const panner = ctx.createPanner();
panner.panningModel = 'HRTF';      // rendu binaural (voir 2.5)
panner.distanceModel = 'inverse';  // loi d'atténuation (voir 2.6)
panner.refDistance = 1;            // distance de référence (défaut 1)
panner.maxDistance = 10000;        // distance max d'atténuation (défaut 10000)
panner.rolloffFactor = 1;          // vitesse de décroissance (défaut 1)

// Position de la source (positionX/Y/Z sont des AudioParam -> .value)
panner.positionX.value = 3;
panner.positionY.value = 0;
panner.positionZ.value = -2;

source.connect(panner);
panner.connect(ctx.destination);
```

> **`positionX`/`positionY`/`positionZ` sont des `AudioParam`**, pas de simples nombres : on écrit `panner.positionX.value = 3` (et non `panner.positionX = 3`). Ça permet de **programmer des transitions** (`linearRampToValueAtTime`) sur l'horloge audio.

### 2.4 L'`AudioListener` : les « oreilles »

Il y a **un seul** `AudioListener` par `AudioContext` (`ctx.listener`). Il porte la **position** et l'**orientation** de l'auditeur. Le `PannerNode` compare position de la source ↔ position/orientation du listener pour produire le rendu spatial.

```typescript
const listener = ctx.listener;
// Position (AudioParam)
listener.positionX.value = 0;
listener.positionY.value = 1.6;
listener.positionZ.value = 0;
// Vecteur "devant" (défaut 0,0,-1) et "haut" (défaut 0,1,0)
listener.forwardX.value = 0;
listener.forwardY.value = 0;
listener.forwardZ.value = -1;
listener.upX.value = 0;
listener.upY.value = 1;
listener.upZ.value = 0;
```

Pour un rendu cohérent avec la scène 3D, il faut **synchroniser le listener avec la caméra** à chaque frame :

```typescript
function syncListenerWithCamera(listener: AudioListener, camera: THREE.Camera): void {
  listener.positionX.value = camera.position.x;
  listener.positionY.value = camera.position.y;
  listener.positionZ.value = camera.position.z;

  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd); // direction "devant" monde de la caméra
  listener.forwardX.value = fwd.x;
  listener.forwardY.value = fwd.y;
  listener.forwardZ.value = fwd.z;

  listener.upX.value = camera.up.x;
  listener.upY.value = camera.up.y;
  listener.upZ.value = camera.up.z;
}
```

> **Note API :** l'`AudioListener` Web Audio expose aussi `setPosition()`/`setOrientation()`, mais ces méthodes sont **dépréciées** (elles restent le seul moyen sous Firefox pour l'instant). Le chemin standard est d'écrire les `.value` des `AudioParam` ci-dessus. **Ne pas confondre** cet `AudioListener` **Web Audio** avec `THREE.AudioListener` (2.8), qui l'enveloppe.

### 2.5 `panningModel` : `HRTF` vs `equalpower`

`panningModel` choisit **l'algorithme de spatialisation** :

- **`'equalpower'`** (défaut) — simple loi de puissance égale gauche/droite (panoramique stéréo). Léger, pas de perception haut/bas ni avant/arrière.
- **`'HRTF'`** — *Head-Related Transfer Function* : simule le filtrage réel du son par la tête et les oreilles → perception 3D **réaliste**, indispensable au **casque** (VR/AR du module 25). Plus coûteux en CPU.

Le cerveau localise un son grâce à trois indices que HRTF reproduit : l'**ITD** (le son arrive plus tôt à l'oreille proche), l'**ILD** (il est plus fort à l'oreille proche), et le **filtrage spectral** dû à la forme du pavillon de l'oreille.

### 2.6 `distanceModel` : atténuation par distance

Trois lois relient la distance source↔listener au gain, pilotées par `refDistance`, `maxDistance`, `rolloffFactor` :

| `distanceModel` | Formule (idée) | Comportement |
|---|---|---|
| `'inverse'` (défaut) | `ref / (ref + rolloff*(d − ref))` | décroissance douce et naturelle |
| `'linear'` | `1 − rolloff*(d − ref)/(max − ref)` | droite, s'annule à `maxDistance` |
| `'exponential'` | `(d / ref) ^ (−rolloff)` | chute rapide près de la source |

- **`refDistance`** : distance à laquelle le volume est « de référence » (défaut 1). En deçà, pas d'atténuation.
- **`rolloffFactor`** : vitesse de décroissance (défaut 1) — plus grand = son plus « local ».
- **`maxDistance`** : au-delà, le volume ne baisse plus (défaut 10000).

Pour un feu de camp qu'on entend de près uniquement : `refDistance` petit (~2) et `rolloffFactor` ≥ 1. Pour une ambiance de place qui porte loin : `refDistance` plus grand, `rolloffFactor` faible.

### 2.7 Le cône directionnel

Une source peut **émettre dans une direction** (un haut-parleur, une bouche). Trois paramètres définissent un cône autour de l'orientation de la source :

```typescript
panner.coneInnerAngle = 60;   // à l'intérieur : plein volume
panner.coneOuterAngle = 120;  // entre inner et outer : atténuation progressive
panner.coneOuterGain = 0.1;   // au-delà de outer : gain résiduel (0 = silence total)
// Orientation de la source (vers où le cône pointe)
panner.orientationX.value = 0;
panner.orientationY.value = 0;
panner.orientationZ.value = -1;
```

> **Défauts** : `coneInnerAngle` et `coneOuterAngle` valent **360°** par défaut (source omnidirectionnelle) ; `coneOuterGain` vaut **0**. Un cône n'a d'effet que si on **réduit** `coneInnerAngle`/`coneOuterAngle` sous 360.

### 2.8 L'abstraction Three.js : `AudioListener` + `PositionalAudio`

Three.js enveloppe tout ça. Le mapping avec le Web Audio brut :

| Web Audio brut | Équivalent Three.js |
|---|---|
| `ctx.listener` synchronisé à la caméra à la main | `new THREE.AudioListener()` + `camera.add(listener)` (synchro **auto**) |
| `createPanner()` + position à la main | `new THREE.PositionalAudio(listener)` attaché via `object.add(sound)` |
| `fetch` + `decodeAudioData` | `new THREE.AudioLoader().load(url, onLoad)` |
| son non spatialisé (ambiance globale) | `new THREE.Audio(listener)` |

```typescript
const listener = new THREE.AudioListener();
camera.add(listener); // le listener suit position ET orientation de la caméra, sans code de synchro

const sound = new THREE.PositionalAudio(listener);
new THREE.AudioLoader().load('/sounds/campfire.ogg', (buffer) => {
  sound.setBuffer(buffer);
  sound.setRefDistance(2);
  sound.setRolloffFactor(1);
  sound.setDistanceModel('inverse');
  sound.setLoop(true);
  sound.setVolume(0.8);
  sound.play();
});
campfire.add(sound); // ATTACHÉ au mesh -> suit sa position dans le graphe de scène
```

Les setters de `PositionalAudio` renvoient `this` (chaînables) et pilotent le `PannerNode` interne : `setRefDistance`, `setRolloffFactor`, `setDistanceModel`, `setMaxDistance`, `setDirectionalCone(inner, outer, outerGain)`. `getOutput()` renvoie le nœud de sortie (utile pour brancher un `AnalyserNode`).

### 2.9 Occlusion sonore approximée

Une vraie occlusion (un mur entre source et auditeur qui étouffe le son) est coûteuse. L'**approximation** standard : brancher un **`BiquadFilterNode` lowpass** sur la source — un son occulté perd ses aigus. Three.js expose `setFilter()` :

```typescript
const lowpass = listener.context.createBiquadFilter();
lowpass.type = 'lowpass';
lowpass.frequency.value = 22050; // ouvert (rien de filtré)
sound.setFilter(lowpass);

// Occlusion progressive quand un obstacle s'interpose (rampe sur l'horloge audio)
function setOccluded(occluded: boolean): void {
  const now = listener.context.currentTime;
  lowpass.frequency.linearRampToValueAtTime(occluded ? 350 : 22050, now + 0.4);
}
```

### 2.10 Autoplay policy : le contexte démarre `suspended`

Les navigateurs **bloquent** l'audio tant qu'il n'y a pas eu de **geste utilisateur**. Un `AudioContext` fraîchement créé est souvent à l'état `'suspended'` : rien ne sort tant qu'on n'appelle pas `resume()` **dans un gestionnaire de clic/tap**.

```typescript
console.log(ctx.state); // souvent 'suspended'
document.querySelector('#enter')!.addEventListener('click', async () => {
  await ctx.resume(); // DOIT venir d'un geste utilisateur
  startScene();
});
```

Avec Three.js, `listener.context` est cet `AudioContext` : même règle, un bouton « Entrer » qui appelle `listener.context.resume()`.

---

## 3. Worked examples

### Exemple 1 — Une source spatialisée en Web Audio brut

Un son en boucle placé à `(3, 0, -2)`, atténué par la distance, listener à l'origine. C'est ce que Three.js fera pour nous ensuite — ici on le câble à la main pour comprendre.

```typescript
async function playSpatialSound(url: string): Promise<void> {
  const ctx = new AudioContext();
  await ctx.resume(); // à appeler depuis un geste utilisateur en vrai

  // 1. Charger le buffer
  const response = await fetch(url);
  const buffer = await ctx.decodeAudioData(await response.arrayBuffer());

  // 2. Source (usage unique)
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  // 3. Panner : position + modèle de distance + HRTF
  const panner = ctx.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = 2;
  panner.rolloffFactor = 1;
  panner.positionX.value = 3;
  panner.positionY.value = 0;
  panner.positionZ.value = -2;

  // 4. Listener aux origines, regardant vers -Z
  const l = ctx.listener;
  l.positionX.value = 0; l.positionY.value = 0; l.positionZ.value = 0;
  l.forwardX.value = 0;  l.forwardY.value = 0;  l.forwardZ.value = -1;
  l.upX.value = 0;       l.upY.value = 1;       l.upZ.value = 0;

  // 5. Câblage source -> panner -> enceintes
  source.connect(panner);
  panner.connect(ctx.destination);
  source.start(0);
}
```

Au casque, le son vient **de la droite et légèrement devant** (source à x=+3, z=−2), et il est plus faible qu'à `refDistance`. Déplacer `panner.positionX.value` le fait bouger dans le champ stéréo.

### Exemple 2 — Ambiance spatialisée d'une sortie TribuZen (Three.js)

Trois points d'intérêt sonores sur la scène : un feu (omnidirectionnel, proche), une rivière (portée moyenne, filtrée façon « eau »), un haut-parleur de place (directionnel, cône). Le tout se règle **sans jamais toucher un `PannerNode` à la main** — Three.js synchronise le listener sur la caméra.

```typescript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Scène minimale (cf. module 13) ---
const canvas = document.querySelector('#app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x11131f);
const camera = new THREE.PerspectiveCamera(70, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
camera.position.set(0, 2, 8);
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// --- Objets sources ---
const campfire = new THREE.Mesh(
  new THREE.ConeGeometry(0.3, 0.8, 12),
  new THREE.MeshStandardMaterial({ color: 0xff5522, emissive: 0xff6600, emissiveIntensity: 2 }),
);
campfire.position.set(-3, 0.4, 0);
scene.add(campfire);

const speaker = new THREE.Mesh(
  new THREE.BoxGeometry(0.4, 0.6, 0.3),
  new THREE.MeshStandardMaterial({ color: 0x222222 }),
);
speaker.position.set(6, 1, -2);
scene.add(speaker);

// --- Audio : listener sur la caméra (synchro automatique) ---
const listener = new THREE.AudioListener();
camera.add(listener);
const loader = new THREE.AudioLoader();

// 1. Feu : omnidirectionnel, très local
const fireSound = new THREE.PositionalAudio(listener);
loader.load('/sounds/campfire.ogg', (buffer) => {
  fireSound.setBuffer(buffer);
  fireSound.setRefDistance(2);
  fireSound.setRolloffFactor(1.5);
  fireSound.setLoop(true);
  fireSound.play();
});
campfire.add(fireSound);

// 2. Rivière : portée moyenne + filtre "eau" (lowpass) = occlusion/ambiance
const riverSound = new THREE.PositionalAudio(listener);
loader.load('/sounds/river.ogg', (buffer) => {
  riverSound.setBuffer(buffer);
  riverSound.setRefDistance(4);
  riverSound.setRolloffFactor(1);
  riverSound.setLoop(true);
  const lp = listener.context.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1800;
  riverSound.setFilter(lp);
  riverSound.play();
});
// rivière posée au sol à gauche
const river = new THREE.Object3D();
river.position.set(-8, 0, 3);
scene.add(river);
river.add(riverSound);

// 3. Haut-parleur : DIRECTIONNEL (cône), pointe vers -Z
const paSound = new THREE.PositionalAudio(listener);
loader.load('/sounds/village.ogg', (buffer) => {
  paSound.setBuffer(buffer);
  paSound.setRefDistance(1);
  paSound.setRolloffFactor(2);
  paSound.setDirectionalCone(60, 120, 0.05); // inner 60°, outer 120°, gain hors cône 0.05
  paSound.setLoop(true);
  paSound.play();
});
speaker.add(paSound);

// --- Autoplay : démarrer au clic ---
document.querySelector('#enter')!.addEventListener('click', async () => {
  await listener.context.resume();
});

// --- Boucle : le listener suit la caméra tout seul ---
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
```

En orbitant avec la souris (`OrbitControls`), la caméra bouge → l'`AudioListener` (son enfant) bouge → le feu, la rivière et le haut-parleur se **repositionnent dans le champ sonore** sans une ligne de synchro manuelle. C'est l'exact pendant du module 13 : Three.js abstrait le Web Audio comme il abstrait WebGL.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Écrire `panner.positionX = 3` au lieu de `panner.positionX.value = 3`

`positionX/Y/Z`, `orientationX/Y/Z` (et les `position*`/`forward*`/`up*` du listener) sont des **`AudioParam`**, pas des nombres. `panner.positionX = 3` écrase l'objet `AudioParam` et **casse** la spatialisation silencieusement. Toujours passer par `.value` (ou une méthode de rampe comme `linearRampToValueAtTime`).

### PIÈGE #2 — Le son ne démarre jamais : autoplay policy

Un `AudioContext` est souvent créé à l'état `'suspended'`. Si on `start()` une source sans avoir appelé `ctx.resume()` **depuis un geste utilisateur**, rien ne sort — et souvent aucune erreur. Symptôme : « mon code est bon mais c'est muet ». Solution : un bouton « Entrer » qui `await ctx.resume()`.

### PIÈGE #3 — Confondre `AudioListener` Web Audio et `THREE.AudioListener`

Deux objets différents portant le même nom. `THREE.AudioListener` (à mettre sur la caméra) **enveloppe** l'`AudioListener` Web Audio (accessible via `listener.context.listener`). On synchronise l'un (Three.js le fait tout seul via `camera.add`), pas l'autre à la main. Mélanger les deux (attacher le Web Audio brut à la caméra) ne fonctionne pas.

### PIÈGE #4 — Cône directionnel « sans effet »

Régler `coneOuterGain` mais laisser `coneInnerAngle`/`coneOuterAngle` à leur défaut **360°** : la source reste **omnidirectionnelle**, le cône n'a aucun effet. Il faut **réduire** les angles (ex. inner 60, outer 120) pour créer une directivité. Symétrie du piège : angles réduits mais `coneOuterGain = 0` → silence total hors cône, souvent trop brutal.

### PIÈGE #5 — Réutiliser un `AudioBufferSourceNode` après `start()`

Un `AudioBufferSourceNode` est **à usage unique** : après `start()` (puis fin/`stop()`), il ne peut **pas** être rejoué. Rappeler `start()` lève une erreur. Pour rejouer un son, recréer une source (`createBufferSource()`) et réassigner le **même** `buffer` (lui, réutilisable). En Three.js, `sound.play()` recrée la source en interne, donc rejouable.

### PIÈGE #6 — Attacher le son à la scène au lieu de l'objet

Faire `scene.add(sound)` au lieu de `campfire.add(sound)` : le son ne suit **pas** l'objet s'il bouge, et sa position est mal placée dans le graphe. Le son spatial doit être **enfant de l'objet** dont il émane (comme un marqueur enfant du globe au module 13) — c'est le graphe de scène hiérarchique qui propage la transformation.

### PIÈGE #7 — Attendre du haut/bas/avant-arrière en `equalpower`

`panningModel = 'equalpower'` (le défaut) ne fait qu'un **panoramique stéréo** gauche/droite : pas de perception de hauteur ni d'avant/arrière. Pour un rendu 3D réaliste au casque (VR/AR), il **faut** `'HRTF'`. Se plaindre que « le son 3D ne marche pas en haut » alors qu'on est en `equalpower` est l'erreur classique.

---

## 5. Ancrage TribuZen

L'audio spatial est la couche **présence sonore** de l'expérience 3D TribuZen. La feature portée par ce module : l'**ambiance sonore spatialisée d'une sortie sur la carte**.

**La carte sonore d'une sortie.** Quand la famille consulte une sortie (le globe du module 13 zoomé sur un lieu), chaque **point d'intérêt** émet un son 3D **attaché à son objet** : le feu de camp du bivouac crépite (omnidirectionnel, `refDistance` court), la rivière coule à gauche (portée moyenne + lowpass « eau »), la place du village bruisse au loin (directionnelle, cône). L'utilisateur **oriente la caméra** (`OrbitControls`) et **entend** l'espace se réorganiser — le `THREE.AudioListener` sur la caméra fait toute la synchro. Ça transforme une carte muette en **souvenir immersif**.

Cette couche s'appuie directement sur les modules précédents :

- **module 13** posait la scène et le graphe hiérarchique (le son est un enfant de l'objet, comme un marqueur) ;
- **module 25** (WebXR) : au casque, `panningModel: 'HRTF'` rend l'immersion crédible ;
- **module 17** (performance) : limiter le nombre de sources HRTF actives (coûteuses) selon la distance.

Fichiers cibles dans `smaurier/tribuzen` :

```
tribuzen/
  src/
    3d/
      audio/
        createListener.ts   ← new THREE.AudioListener() + camera.add(listener) + resume() au clic
        SpatialSound.ts      ← PositionalAudio + AudioLoader + refDistance/rolloff/cône
        occlusion.ts         ← BiquadFilterNode lowpass + setOccluded(bool)
      points-of-interest/
        Campfire.ts          ← Mesh + SpatialSound omnidirectionnel
        River.ts             ← Object3D + SpatialSound filtré
      SceneCanvas.vue        ← bouton "Entrer" -> listener.context.resume()
```

> Comme au module 13, le montage dans un composant Vue impose de **libérer** au démontage : `sound.stop()`, `sound.disconnect()`, et fermer le contexte si plus utilisé, sinon fuite de nœuds audio. Le pilotage fin (nombre de sources HRTF, pooling de buffers) relève du module 17.

---

## 6. Points clés

1. La **Web Audio API** traite le son comme un **graphe de nœuds** (`source → effets → panner → destination`), câblé avec `.connect()` — pendant sonore du pipeline de rendu.
2. Un son se charge via `fetch` + `ctx.decodeAudioData` → `AudioBuffer`, joué par un `AudioBufferSourceNode` **à usage unique**.
3. Le **`PannerNode`** spatialise : `positionX/Y/Z` sont des **`AudioParam`** (`.value`), `panningModel` (`'HRTF'` pour le 3D réaliste), `distanceModel` + `refDistance`/`rolloffFactor`/`maxDistance` pour l'atténuation.
4. L'**`AudioListener`** (un par contexte) porte position + orientation de l'auditeur ; on le **synchronise à la caméra** (ou Three.js le fait via `camera.add`).
5. **`panningModel`** : `'equalpower'` (défaut, stéréo simple) vs `'HRTF'` (binaural réaliste, casque/VR).
6. **Cône directionnel** : `coneInnerAngle`/`coneOuterAngle`/`coneOuterGain` — sans effet tant que les angles restent à leur défaut de 360°.
7. **Three.js** : `THREE.AudioListener` sur la caméra + `THREE.PositionalAudio` **enfant d'un objet**, chargé par `AudioLoader` ; setters chaînables (`setRefDistance`, `setDirectionalCone`, `setFilter`).
8. **Occlusion** approximée par un `BiquadFilterNode` lowpass ; **autoplay policy** : `AudioContext` démarre `'suspended'`, `resume()` obligatoire sur un geste utilisateur.

---

## 7. Seeds Anki

```
Comment la Web Audio API modélise-t-elle le traitement du son ?|Comme un graphe de nœuds (audio graph) : une source (AudioBufferSourceNode) traverse des nœuds de traitement (GainNode, BiquadFilterNode, PannerNode) jusqu'à ctx.destination, câblés avec .connect(). C'est le pendant sonore du pipeline de rendu 3D.
Pourquoi écrit-on panner.positionX.value = 3 et pas panner.positionX = 3 ?|Parce que positionX/Y/Z (et orientationX/Y/Z) sont des AudioParam, pas des nombres. On écrit .value pour régler, ou on programme des rampes (linearRampToValueAtTime). Assigner directement écrase l'AudioParam et casse la spatialisation.
Quelle est la différence entre panningModel 'equalpower' et 'HRTF' ?|'equalpower' (défaut) fait un simple panoramique stéréo gauche/droite, sans haut/bas ni avant/arrière. 'HRTF' simule le filtrage de la tête et des oreilles (ITD, ILD, filtrage spectral) pour un rendu 3D binaural réaliste, indispensable au casque (VR/AR), mais plus coûteux en CPU.
À quoi servent refDistance, rolloffFactor et distanceModel d'un PannerNode ?|Ils définissent l'atténuation par distance. distanceModel choisit la loi ('inverse' par défaut, 'linear', 'exponential') ; refDistance (défaut 1) est la distance de volume de référence ; rolloffFactor (défaut 1) règle la vitesse de décroissance (plus grand = son plus local). maxDistance (défaut 10000) borne l'atténuation.
Pourquoi un cône directionnel réglé avec coneOuterGain peut-il rester sans effet ?|Parce que coneInnerAngle et coneOuterAngle valent 360° par défaut : la source reste omnidirectionnelle. Il faut réduire ces angles (ex. inner 60, outer 120) pour créer une directivité ; coneOuterGain (défaut 0) est alors le gain résiduel hors du cône.
Comment attache-t-on un son 3D à un objet d'une scène Three.js ?|On crée un THREE.AudioListener qu'on ajoute à la caméra (camera.add(listener), synchro automatique), puis un THREE.PositionalAudio(listener) qu'on ajoute à l'objet source (object.add(sound), pas scene.add). Le son suit la position de l'objet via le graphe de scène.
Pourquoi le son reste-t-il muet malgré un code correct, et comment corriger ?|À cause de l'autoplay policy : l'AudioContext démarre à l'état 'suspended' et n'émet rien sans geste utilisateur. Il faut appeler ctx.resume() (ou listener.context.resume() en Three.js) depuis un gestionnaire de clic/tap, typiquement un bouton "Entrer".
Comment approximer une occlusion sonore (un mur qui étouffe le son) ?|En branchant un BiquadFilterNode de type 'lowpass' sur la source (sound.setFilter(...) en Three.js) : un son occulté perd ses aigus. On fait varier lp.frequency (rampe linearRampToValueAtTime sur ctx.currentTime) entre une valeur haute (ouvert) et basse (~300-400 Hz, occulté).
Pourquoi ne peut-on pas rejouer un AudioBufferSourceNode après start() ?|Un AudioBufferSourceNode est à usage unique : après start() il ne peut pas être redémarré (rappeler start() lève une erreur). Pour rejouer, on recrée une source avec createBufferSource() et on réassigne le même AudioBuffer (lui, réutilisable). En Three.js, sound.play() recrée la source en interne.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-26-audio-3d-spatial/README.md`. Attacher un son 3D positionnel à un objet d'une scène Three.js (r185), avec atténuation par distance et gestion de l'autoplay, qui tourne dans un vrai navigateur — corrigé HTML/JS commenté intégral.
