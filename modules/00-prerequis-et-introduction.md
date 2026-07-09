---
titre: Prérequis & introduction à la 3D temps réel
cours: 20-webgpu-3d
notions:
  - "3D temps réel (60 fps, boucle de rendu)"
  - "rôle du GPU (parallélisme SIMD, throughput vs latence)"
  - "aperçu du pipeline de rendu (vertex → rasterisation → fragment)"
  - "WebGL vs WebGPU vs Three.js"
  - "feature-detection navigator.gpu"
  - "canvas + requestAnimationFrame + devicePixelRatio"
  - "prérequis JS/TS et maths pour la suite du cours"
outcomes:
  - sait expliquer pourquoi le GPU est utilisé pour le rendu 3D (throughput vs latence)
  - sait situer WebGL, WebGPU et Three.js et choisir la bonne couche selon le besoin
  - sait décrire les grandes étapes d'un pipeline de rendu
  - sait détecter le support WebGPU d'un navigateur et initialiser un canvas
  - connaît la carte du cours et les prérequis JS/TS + maths attendus
prerequis: []
next: 01-algebre-lineaire-pour-la-3d
libs: []
tribuzen: "feature 3D TribuZen — globe/carte interactif des sorties de la famille (fil rouge du cours)"
last-reviewed: 2026-07
---

# Prérequis & introduction à la 3D temps réel

> **Outcomes — tu sauras FAIRE :** expliquer pourquoi le rendu 3D passe par le GPU, situer WebGL/WebGPU/Three.js, décrire les étapes d'un pipeline de rendu, détecter le support WebGPU et initialiser un canvas.
> **Difficulté :** :star:
>
> **Portée :** ce module est la porte d'entrée du cours. Il pose le vocabulaire (GPU, pipeline, temps réel) et l'écosystème, sans encore écrire de shader. L'algèbre linéaire est le **module 01**, le pipeline en détail le **module 04**, WebGPU/WGSL le **module 09**, Three.js le **module 13**.

## 1. Cas concret d'abord

Le fil rouge de ce cours est une feature 3D pour **TribuZen** : un **globe interactif** qui affiche les sorties passées et à venir de la famille. Chaque sortie est un point sur le globe ; on peut faire tourner la sphère à la souris, survoler un point pour voir le titre de la sortie, et cliquer pour ouvrir le détail.

Voici le squelette qu'un collègue a posé dans la page `FamilyGlobe.vue` :

```html
<!-- FamilyGlobe — on veut un globe 3D tournant ici -->
<canvas id="family-globe" width="640" height="640"></canvas>

<script>
  const canvas = document.getElementById('family-globe')
  const ctx = canvas.getContext('2d') // ← contexte 2D : impossible d'afficher une sphère éclairée qui tourne à 60 fps
  ctx.beginPath()
  ctx.arc(320, 320, 200, 0, Math.PI * 2)
  ctx.fill() // un simple disque plat — pas de 3D, pas de profondeur, pas de lumière
</script>
```

**Trois problèmes que le contexte `2d` ne peut pas résoudre :**

1. **Pas de 3D.** Le contexte `2d` dessine des formes plates. Un globe demande de la profondeur (depth), de la perspective et une caméra — ça se calcule avec des matrices, sur le GPU.
2. **Pas de parallélisme.** Éclairer chaque pixel du globe 60 fois par seconde, c'est des millions de calculs par frame. Le CPU seul ne tient pas le temps réel ; il faut le GPU.
3. **Mauvaise couche.** Pour un globe interactif, on veut soit **Three.js** (rapide à écrire), soit **WebGPU** (contrôle bas niveau). Le choix dépend du besoin — c'est justement ce que ce module te permet de trancher.

Ce module te donne la carte pour comprendre pourquoi, et par quelle porte entrer.

---

## 2. Théorie complète, concise

### 2.1 « Temps réel », concrètement

Le rendu 3D temps réel signifie produire une nouvelle image (**frame**) assez vite pour que l'œil perçoive un mouvement fluide. La cible usuelle est **60 fps**, soit **une frame toutes les ~16,7 ms** (`1000 / 60`). Sur écran 120 Hz, la fenêtre tombe à ~8,3 ms.

Chaque frame, on recommence tout : effacer l'écran, positionner les objets, les éclairer, les dessiner. C'est une **boucle** pilotée par `requestAnimationFrame`, synchronisée sur le rafraîchissement de l'écran.

Conséquence directe : le budget par frame est minuscule. Tout ce qui coûte cher doit être fait sur le processeur adapté — le GPU — et préparé une seule fois quand c'est possible.

### 2.2 Pourquoi le GPU : throughput vs latence

Un écran Full HD, c'est **1920 × 1080 ≈ 2,07 millions de pixels**. À 60 fps, il faut calculer une couleur pour chacun ~60 fois par seconde. C'est un problème **massivement parallèle** : chaque pixel est indépendant.

- Un **CPU** a peu de cœurs (4 à 16), très puissants, optimisés pour la **latence** : finir *une* tâche complexe le plus vite possible (branch prediction, gros caches, exécution dans le désordre).
- Un **GPU** a des **milliers de cœurs simples**, optimisés pour le **throughput** : faire *beaucoup* de tâches identiques en même temps.

Le GPU applique le modèle **SIMD** (*Single Instruction, Multiple Data*) : la **même** instruction s'exécute sur des milliers de données en parallèle. Multiplier 2 millions de nombres prend à peu près le même temps que d'en multiplier un seul, car ils partent tous ensemble.

```
CPU  →  peu de cœurs, chacun rapide      →  optimise la LATENCE (une tâche vite)
GPU  →  des milliers de cœurs simples    →  optimise le THROUGHPUT (tout en parallèle)
```

Idée à retenir : le rendu 3D est parfait pour le GPU parce que colorier des millions de pixels, c'est la même opération répétée des millions de fois.

### 2.3 Aperçu du pipeline de rendu

Transformer une liste de points 3D en pixels colorés à l'écran suit un enchaînement d'étapes appelé **pipeline de rendu**. Vue d'avion (le détail est au module 04) :

1. **Vertex** — pour chaque sommet (vertex) de la géométrie, un **vertex shader** calcule sa position finale à l'écran (via les matrices modèle / vue / projection, cours 01 à 03).
2. **Rasterisation** — le GPU découpe chaque triangle en **fragments** (candidats-pixels) couverts par ce triangle.
3. **Fragment** — pour chaque fragment, un **fragment shader** calcule une couleur (lumière, texture, matériau — cours 05).
4. **Tests & sortie** — le **depth test** garde le fragment le plus proche de la caméra ; le résultat est écrit dans l'image affichée.

```
Géométrie (sommets)
   │  vertex shader  → position écran de chaque sommet
   ▼
Triangles → RASTERISATION → fragments (candidats-pixels)
   │  fragment shader → couleur de chaque fragment
   ▼
Depth test → image finale (framebuffer) → écran
```

Un **shader** est un petit programme qui tourne sur le GPU, exécuté en parallèle sur chaque sommet puis chaque fragment. C'est le cœur de tout le cours.

### 2.4 WebGL vs WebGPU vs Three.js

Trois couches, trois niveaux d'abstraction. Elles ne s'opposent pas : Three.js s'appuie sur WebGL ou WebGPU.

**WebGL** (2011, v2 en 2017) — l'API 3D historique du navigateur, basée sur OpenGL ES. Bas niveau, **à état global mutable** : on lie un buffer à un « slot » global, on le remplit, on le délie. L'ordre des appels compte, et un oubli corrompt le rendu en silence. Shaders en **GLSL**. Supportée partout.

**WebGPU** (spécifiée par le W3C, déployée à partir de 2023) — l'API moderne, inspirée de Vulkan / Metal / Direct3D 12. Bas/moyen niveau, **à descripteurs immutables** : on décrit un objet (buffer, pipeline) à sa création, sans état global caché. Elle apporte les **compute shaders** (calcul GPU générique, GPGPU) et une validation plus stricte. Shaders en **WGSL**.

**Three.js** — une bibliothèque haut niveau *par-dessus* WebGL/WebGPU. Elle fournit un *scene graph* : `Scene`, `Camera`, `Mesh`, `Light`, chargeurs de modèles. Un cube animé tient en ~15 lignes au lieu de ~200 en WebGPU brut.

| Critère | WebGL 2 | WebGPU | Three.js |
| --- | --- | --- | --- |
| Niveau | bas | bas / moyen | haut |
| Modèle d'API | état global mutable | descripteurs immutables | scene graph |
| Langage shader | GLSL | WGSL | GLSL / WGSL (selon backend) |
| Compute shaders | non | oui | via WebGPU |
| Lignes pour un cube | ~200 | ~150 | ~15 |
| Quand l'utiliser | legacy, compat maximale | contrôle & perf, GPGPU | prototypage rapide, apps produit |

Analogie côté front : WebGL/WebGPU sont au rendu ce que le DOM est au web ; Three.js est au rendu ce que Vue est au DOM — tu décris *le quoi*, pas *le comment*.

### 2.5 Support navigateur en 2026

WebGPU exige un **contexte sécurisé (HTTPS)** — `localhost` compte comme sécurisé en développement.

- **Chrome / Edge** : supporté par défaut depuis la **v113** (2023). <!-- FLAG-DOC: vérifié via MDN + caniuse au 2026-07 -->
- **Safari** : support complet sur **iOS 26** ; support partiel sur Safari desktop (en cours de généralisation). <!-- FLAG-DOC: Safari desktop noté « partiel » sur caniuse au 2026-07 — revérifier -->
- **Firefox** : encore **désactivé par défaut** dans les versions courantes (drapeau requis). <!-- FLAG-DOC: caniuse au 2026-07 indique Firefox non activé par défaut — revérifier -->

Couverture mondiale ~84 % au moment de la rédaction. **Conclusion pratique :** développer WebGPU sous Chrome/Edge, et **toujours** feature-detecter `navigator.gpu` avec un message de repli propre. Ce cours cible Chrome/Edge pour la partie WebGPU.

### 2.6 Détecter WebGPU et initialiser le canvas

Le socle commun à tout ce cours : détecter le support, obtenir l'adapter puis le device, configurer le canvas.

```ts
// 1. Feature-detection — navigator.gpu n'existe que si WebGPU est disponible
//    (et seulement en contexte sécurisé : HTTPS ou localhost)
if (!navigator.gpu) {
  throw new Error('WebGPU non supporté — utilise Chrome/Edge 113+ (ou active le drapeau).')
}

// 2. Adapter = un GPU physique exposé au navigateur
const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
if (!adapter) {
  throw new Error('Aucun adapter GPU disponible.')
}

// 3. Device = la connexion logique au GPU, par laquelle passe tout le reste
const device = await adapter.requestDevice()

// 4. Canvas + contexte WebGPU
const canvas = document.getElementById('family-globe') as HTMLCanvasElement
const context = canvas.getContext('webgpu')!

// 5. Format optimal pour l'écran de l'utilisateur (ne jamais coder en dur)
const format = navigator.gpu.getPreferredCanvasFormat()
context.configure({ device, format, alphaMode: 'premultiplied' })
```

Deux détails de canvas indépendants de WebGPU, mais essentiels :

- **`devicePixelRatio`** : sur un écran Retina (DPR = 2), 1 pixel CSS = 2×2 pixels physiques. Il faut dimensionner le buffer interne du canvas (`canvas.width`) à `taille CSS × DPR`, sinon le rendu est flou.
- **`requestAnimationFrame` + `deltaTime`** : anime en fonction du **temps écoulé**, pas du numéro de frame. Sinon l'animation va deux fois plus vite sur un écran 120 Hz que sur un 60 Hz.

```ts
// devicePixelRatio : buffer interne net sur écrans HiDPI
const dpr = window.devicePixelRatio || 1
canvas.width = canvas.clientWidth * dpr
canvas.height = canvas.clientHeight * dpr

// Boucle de rendu synchronisée sur l'écran, animation pilotée par le temps
let last = performance.now()
function frame(now: number): void {
  const deltaTime = (now - last) / 1000 // secondes écoulées depuis la frame précédente
  last = now
  // ... rotation du globe = vitesse * deltaTime (indépendant du framerate) ...
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
```

### 2.7 Prérequis JS/TS et maths pour la suite

**JavaScript / TypeScript** attendus :
- `async` / `await` (obtenir l'adapter et le device est asynchrone).
- Interfaces, types union, génériques (`Float32Array`, types typés des buffers).
- **Tableaux typés** : `Float32Array`, `Uint16Array` / `Uint32Array` — c'est le format des données envoyées au GPU.

**Maths** (revues au module 01, aucune connaissance préalable exigée) :
- Vecteurs 2D/3D/4D, produit scalaire, produit vectoriel.
- Matrices 4×4 et coordonnées homogènes (transformations, caméra, projection).
- Trigonométrie de base (`sin`, `cos`) pour les rotations.

Si `async/await` et les tableaux typés te sont familiers, tu as le socle JS/TS. Les maths, on les (re)construit ensemble à partir du module 01.

### Carte du cours (29 modules)

- **Maths & théorie du rendu (01–05)** : algèbre linéaire, transformations & quaternions, caméras & projections, pipeline de rendu, lumière/matériaux/PBR.
- **WebGL (06–08)** : fondamentaux, shaders/buffers/textures, scène complète.
- **WebGPU & WGSL (09–12)** : architecture & WGSL, render pipeline & bind groups, compute shaders/GPGPU, WebGPU avancé.
- **Three.js (13–17)** : fondamentaux, matériaux & lumières, modèles & animations, post-processing, performance.
- **Rendu avancé & sujets experts (18–27)** : shadow mapping, shaders créatifs, physique, géométrie, ray tracing, GI/SSAO/SSR, volumétrique, WebXR, audio 3D, virtual textures.
- **Capstone (28)** : une expérience 3D TribuZen complète.

---

## 3. Worked examples

### Exemple 1 — Vérifier le support et afficher un canvas coloré (TribuZen)

Objectif : détecter WebGPU, et si tout va bien, effacer le canvas du globe avec une couleur — première preuve que le GPU dessine. Sinon, afficher un repli lisible.

```ts
// family-globe-check.ts — premier contact GPU pour FamilyGlobe
async function initGlobeCanvas(canvasId: string): Promise<void> {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement

  // (1) Feature-detection : sortie propre si WebGPU absent
  if (!navigator.gpu) {
    canvas.replaceWith(
      Object.assign(document.createElement('p'), {
        textContent: 'Globe 3D indisponible : WebGPU non supporté (essaie Chrome/Edge 113+).',
      }),
    )
    return
  }

  // (2) Adapter puis device
  const adapter = await navigator.gpu.requestAdapter()
  if (!adapter) throw new Error('Aucun adapter GPU.')
  const device = await adapter.requestDevice()

  // (3) Canvas net sur HiDPI
  const dpr = window.devicePixelRatio || 1
  canvas.width = canvas.clientWidth * dpr
  canvas.height = canvas.clientHeight * dpr

  // (4) Contexte + format
  const context = canvas.getContext('webgpu')!
  const format = navigator.gpu.getPreferredCanvasFormat()
  context.configure({ device, format, alphaMode: 'premultiplied' })

  // (5) Effacer l'écran avec un bleu « globe » via un render pass
  const encoder = device.createCommandEncoder()
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0.05, g: 0.12, b: 0.28, a: 1 }, // bleu nuit
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  })
  pass.end()
  device.queue.submit([encoder.finish()]) // envoi des commandes au GPU
}

initGlobeCanvas('family-globe').catch(console.error)
```

Ce qu'on a prouvé : le navigateur supporte WebGPU, on a un device, et le GPU a effacé le canvas avec une couleur. C'est le « Hello World » du rendu — le triangle et la sphère viendront aux modules 09+.

### Exemple 2 — Choisir la couche pour le globe TribuZen

On a trois besoins de globe possibles. Quelle couche pour chacun ?

| Besoin | Couche recommandée | Pourquoi |
| --- | --- | --- |
| Prototype rapide, sphère texturée + points cliquables | **Three.js** | scene graph, chargeurs, raycasting prêts à l'emploi — ~30 lignes |
| Effet visuel signature (atmosphère, halo custom) | **WebGPU** (ou shader Three.js) | contrôle du fragment shader, WGSL |
| Simulation des trajets de sorties (des milliers de points animés) | **WebGPU compute** | GPGPU : calcul des positions sur le GPU, hors de portée de WebGL |

Décision produit pour TribuZen : commencer le globe en **Three.js** (rapidité de mise en prod), puis descendre en **WebGPU** pour les effets et la simulation quand le besoin apparaît. C'est exactement l'ordre du cours.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — « WebGPU remplace WebGL, donc j'ignore WebGL »

Faux en 2026 : WebGPU n'est pas activé par défaut partout (Firefox, Safari desktop). WebGL reste le socle de compatibilité maximale, et ses concepts (buffers, shaders, draw calls) se transposent à WebGPU. On apprend **les deux** — WebGL d'abord (06–08) pour les fondamentaux, WebGPU ensuite (09+).

### PIÈGE #2 — « Three.js, c'est de la triche / pas de la vraie 3D »

Three.js *est* de la vraie 3D : il produit exactement les mêmes appels WebGL/WebGPU que tu écrirais à la main. Mais l'utiliser sans comprendre la couche en dessous mène à des bugs de perf et de rendu qu'on ne sait pas diagnostiquer. D'où l'ordre du cours : la couche basse d'abord, l'abstraction ensuite.

### PIÈGE #3 — Oublier la feature-detection `navigator.gpu`

```ts
// ❌ Plante avec "Cannot read properties of undefined" si WebGPU absent
const adapter = await navigator.gpu.requestAdapter()

// ✅ Détecter d'abord, prévoir un repli
if (!navigator.gpu) {
  showFallback() // message, image statique, ou bascule WebGL
  return
}
const adapter = await navigator.gpu.requestAdapter()
```

`navigator.gpu` est `undefined` si le navigateur ne supporte pas WebGPU **ou** si la page n'est pas en HTTPS/localhost. Toujours tester avant d'appeler `requestAdapter`.

### PIÈGE #4 — Confondre `adapter` et `device`

L'**adapter** représente un GPU physique disponible (`requestAdapter`). Le **device** est la connexion logique par laquelle on crée buffers, pipelines et on soumet des commandes (`adapter.requestDevice()`). On demande l'adapter *une fois*, puis le device *à partir de l'adapter* — jamais l'inverse. Tout le reste du travail passe par le `device`.

### PIÈGE #5 — Canvas flou : ignorer `devicePixelRatio`

Dimensionner le canvas uniquement en CSS (ou via les attributs `width`/`height` fixes) donne un rendu flou sur écran Retina. Le buffer interne (`canvas.width`) doit valoir `taille CSS × devicePixelRatio`. La taille CSS reste, elle, en pixels logiques.

### PIÈGE #6 — Animer sans `deltaTime`

Incrémenter une rotation d'une constante par frame (`rotation += 0.01`) fait tourner l'objet **deux fois plus vite** sur un écran 120 Hz que sur un 60 Hz. Il faut multiplier la vitesse par `deltaTime` (temps écoulé depuis la frame précédente) pour un mouvement indépendant du framerate.

---

## 5. Ancrage TribuZen

Le fil rouge de ce cours est le **globe interactif des sorties de la famille** dans TribuZen : `FamilyGlobe.vue`. Chaque module ajoute une couche à cette feature.

- **Ce module** pose la fondation : détecter WebGPU, initialiser le canvas du globe, choisir la couche (Three.js pour démarrer, WebGPU pour les effets).
- Les **maths (01–03)** serviront à positionner les points de sortie sur la sphère et à faire tourner la caméra.
- Le **pipeline & la lumière (04–05)** donneront au globe son relief et son éclairage.
- **Three.js (13+)** construira la première version jouable ; **WebGPU (09+)** l'atmosphère et la simulation des trajets.

Fichiers cibles dans `smaurier/tribuzen` :

```
tribuzen/
  src/
    components/
      globe/
        FamilyGlobe.vue        ← le canvas + la boucle de rendu (ce module)
        useWebGPUSupport.ts     ← composable de feature-detection navigator.gpu
```

> Le globe restera un **composant Vue** dont le `<template>` contient un `<canvas>` ; toute la 3D vit dans le `<script setup>` et se branche sur le cycle de vie (`onMounted` pour démarrer la boucle, `onUnmounted` pour l'arrêter).

---

## 6. Points clés

1. **Temps réel** = produire une frame toutes les ~16,7 ms (60 fps), dans une boucle `requestAnimationFrame`.
2. Le **GPU** est choisi pour son **throughput** (des milliers de cœurs, modèle SIMD), là où le CPU optimise la **latence**.
3. Le **pipeline de rendu** enchaîne : vertex shader → rasterisation → fragment shader → depth test → image.
4. **WebGL** (état global, GLSL) < **WebGPU** (descripteurs immutables, WGSL, compute) < **Three.js** (scene graph haut niveau).
5. En 2026, WebGPU est par défaut sur **Chrome/Edge 113+** ; Firefox et Safari desktop restent partiels — **feature-detecter `navigator.gpu`** et prévoir un repli.
6. Initialisation WebGPU : `navigator.gpu` → `requestAdapter` → `requestDevice` → `canvas.getContext('webgpu')` → `configure({ device, format })`.
7. **`devicePixelRatio`** pour un canvas net, **`deltaTime`** pour une animation indépendante du framerate.
8. Prérequis : `async/await`, tableaux typés (`Float32Array`), et les maths 3D revues au module 01.

---

## 7. Seeds Anki

```
Pourquoi utilise-t-on le GPU plutôt que le CPU pour le rendu 3D ?|Le rendu est massivement parallèle (millions de pixels indépendants). Le GPU a des milliers de cœurs simples optimisés pour le throughput (modèle SIMD), là où le CPU optimise la latence avec peu de cœurs puissants.
Que signifie "temps réel" en 3D et quel est le budget par frame à 60 fps ?|Produire une nouvelle image assez vite pour un mouvement fluide. À 60 fps, le budget est de ~16,7 ms par frame (1000/60), dans une boucle requestAnimationFrame.
Quelles sont les grandes étapes du pipeline de rendu ?|Vertex shader (position écran de chaque sommet) → rasterisation (triangles en fragments) → fragment shader (couleur de chaque fragment) → depth test → écriture dans l'image finale.
Différence entre WebGL, WebGPU et Three.js ?|WebGL : API bas niveau à état global mutable (GLSL). WebGPU : API moderne à descripteurs immutables, avec compute shaders (WGSL). Three.js : bibliothèque haut niveau (scene graph) par-dessus WebGL/WebGPU.
Comment détecter le support WebGPU d'un navigateur ?|Tester if (!navigator.gpu) — navigator.gpu est undefined si WebGPU absent ou si la page n'est pas en contexte sécurisé (HTTPS/localhost). Puis requestAdapter peut aussi renvoyer null.
Quelle est la différence entre un adapter et un device en WebGPU ?|L'adapter représente un GPU physique (navigator.gpu.requestAdapter). Le device est la connexion logique obtenue via adapter.requestDevice() ; tout le travail (buffers, pipelines, commandes) passe par le device.
Pourquoi tenir compte de devicePixelRatio pour un canvas ?|Sur écran HiDPI/Retina (DPR ≥ 2), 1 pixel CSS = plusieurs pixels physiques. Le buffer interne (canvas.width) doit valoir taille CSS × devicePixelRatio, sinon le rendu est flou.
Pourquoi multiplier les vitesses d'animation par deltaTime ?|Pour rendre le mouvement indépendant du framerate. Sans deltaTime, l'animation va deux fois plus vite sur un écran 120 Hz que sur un 60 Hz.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-00-prerequis-et-introduction/README.md`. Vérifier le support WebGPU du navigateur et afficher un premier canvas piloté par le GPU — dans un vrai navigateur (Chrome/Edge), sans harnais. Corrigé complet commenté + variante J+30.
