---
titre: Post-processing et effets (EffectComposer)
cours: 20-webgpu-3d
notions:
  - "EffectComposer (chaîne de passes)"
  - "RenderPass (rendu de la scène en framebuffer)"
  - "OutputPass (tone mapping + conversion sRGB finale)"
  - "UnrealBloomPass (halo lumineux)"
  - "ShaderPass (fragment shader custom sur l'image)"
  - "uniform tDiffuse (image de la passe précédente)"
  - "antialiasing en post-process (FXAA / SMAA)"
  - "depth of field (BokehPass)"
  - "ordre des passes dans le pipeline"
  - "imports addons (three/addons/postprocessing)"
outcomes:
  - sait monter un EffectComposer avec RenderPass et OutputPass à la place de renderer.render()
  - sait ajouter un UnrealBloomPass et régler strength / radius / threshold pour un halo maîtrisé
  - sait écrire un ShaderPass custom lisant tDiffuse (vignette) et l'insérer dans la chaîne
  - sait choisir entre FXAA et SMAA une fois l'antialiasing natif du renderer désactivé
  - sait raisonner sur l'ordre des passes (rendu → effets → AA → output) et ses conséquences
prerequis:
  - "13-threejs-fondamentaux (scene / camera / renderer, boucle de rendu, renderer.render)"
  - "14-materiaux-et-lumieres-threejs (emissive, MeshStandardMaterial, tone mapping)"
  - "07-shaders-buffers-textures (GLSL fragment shader, sampler2D, uv)"
  - "06-webgl-fondamentaux (framebuffer, uniform, draw call)"
next: 17-performance-et-optimisation
libs: [{ name: three, version: "r170+" }]
tribuzen: "moteur de rendu 3D TribuZen — halo lumineux (bloom) sur la sortie sélectionnée de la carte + vignette d'ambiance sur la scène 3D du feed"
last-reviewed: 2026-07
---

# Post-processing et effets (`EffectComposer`)

> **Outcomes — tu sauras FAIRE :** monter un `EffectComposer` (RenderPass + OutputPass), ajouter un `UnrealBloomPass` réglé, écrire un `ShaderPass` custom lisant `tDiffuse`, choisir FXAA/SMAA, et ordonner correctement les passes.
> **Difficulté :** :star::star::star::star:
>
> **Portée :** ce module part d'une scène Three.js qui s'affiche déjà (module 13) avec des matériaux et de la lumière (module 14). On ne change **rien** à la scène : on intercepte l'**image finale** pour la retraiter frame par frame. Le shadow mapping (module 18) et l'optimisation GPU (module 17) viennent après.

## 1. Cas concret d'abord

Sur la carte des sorties de TribuZen, la famille sélectionne une sortie (« rando au lac dimanche »). Le designer veut que le marqueur sélectionné **rayonne** : un halo lumineux doux qui déborde du marqueur, comme une enseigne néon. Et sur la scène 3D du feed (les souvenirs en volume), il veut une **vignette** qui assombrit légèrement les bords pour concentrer le regard au centre.

Le réflexe débutant : « je vais augmenter l'`emissiveIntensity` du matériau du marqueur ». On obtient un marqueur plus vif… mais **plat**. Un objet émissif n'éclaire pas ses voisins et ne déborde pas de ses propres pixels — il n'y a pas de halo. Le halo (bloom) est un phénomène **d'image**, pas de matériau : il faut extraire les pixels les plus brillants de l'image rendue, les étaler par un flou, puis les rajouter par-dessus.

Voici le code de rendu actuel — il ne peut **pas** produire de halo :

```typescript
// ❌ Boucle de rendu directe : aucune interception de l'image possible
function animate(): void {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera); // l'image part droit à l'écran, on ne peut rien retoucher
}
```

Le problème : `renderer.render(scene, camera)` envoie l'image **directement** au canvas. Pour la retoucher, il faut la rendre d'abord dans un **framebuffer intermédiaire** (une texture), puis enchaîner des **passes** de traitement 2D dessus, et n'envoyer à l'écran qu'à la fin. C'est exactement le rôle de l'`EffectComposer`. Ce module remplace cette ligne par une chaîne de passes, et ajoute le halo puis la vignette.

---

## 2. Théorie complète, concise

### 2.1 Le principe : retraiter l'image, pas la scène

Le post-processing opère en **espace écran** : une fois la scène 3D rendue en une image 2D, chaque passe est un traitement 2D (flou, seuillage, mélange de canaux) appliqué à cette image. C'est identique aux filtres d'un logiciel photo, mais recalculé à **chaque frame**.

```
Scène 3D  ──RenderPass──>  [image 2D dans un framebuffer]
                                  │
                                  ├─ BloomPass    (extrait le brillant, le floute, le rajoute)
                                  ├─ ShaderPass   (vignette : assombrit les bords)
                                  ├─ SMAAPass     (lisse les bords crénelés)
                                  │
                                  └─ OutputPass ──> écran (tone mapping + sRGB)
```

Chaque passe **lit** le framebuffer de la passe précédente et **écrit** dans le suivant (double buffering interne : read buffer / write buffer que le composer permute).

### 2.2 Les imports addons — le piège numéro un

`EffectComposer` et toutes les passes ne sont **pas** dans le cœur de `three`. Ce sont des *addons*. Depuis les versions récentes (r150+), le chemin canonique est `three/addons/...`, alias officiel de `three/examples/jsm/...` (les deux fonctionnent, `three/addons/` est recommandé) :

```typescript
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass }      from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass }      from 'three/addons/postprocessing/ShaderPass.js';
```

L'extension **`.js` est obligatoire** dans le chemin (ce sont des modules ES réels). L'alias `three/addons/` doit être résolu par le bundler (Vite le gère nativement via le package `three`) ou déclaré dans un *import map* si tu es en HTML nu.

### 2.3 `EffectComposer` : le chef d'orchestre

L'`EffectComposer` prend le renderer, crée les framebuffers intermédiaires, et exécute les passes dans l'ordre d'ajout.

```typescript
const composer = new EffectComposer(renderer);
composer.addPass(pass);        // ajoute une passe en fin de chaîne
composer.setSize(w, h);        // à appeler sur resize (comme renderer.setSize)
composer.render();             // remplace renderer.render(scene, camera) dans la boucle
```

**Règle absolue :** dans la boucle d'animation, on appelle `composer.render()` **à la place** de `renderer.render(scene, camera)`. Garder les deux dessine deux fois et casse le résultat.

### 2.4 `RenderPass` et `OutputPass` : le socle minimal

Un composer utile a **toujours** au minimum deux passes :

- **`RenderPass(scene, camera)`** — la première : elle rend la scène 3D dans le framebuffer. Sans elle, les passes suivantes n'ont aucune image à traiter.
- **`OutputPass()`** — la dernière : elle applique le **tone mapping** (ex. ACES Filmic) et la conversion **sRGB** juste avant l'écran. Quand on passe par le composer, c'est `OutputPass` qui prend en charge cette conversion finale (le renderer ne la fait plus lui-même en sortie de composer).

```typescript
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera)); // socle : rend la scène
// ... effets ici ...
composer.addPass(new OutputPass());              // toujours EN DERNIER
```

### 2.5 `UnrealBloomPass` : le halo lumineux

Le bloom simule l'éblouissement : il **extrait** les pixels dont la luminosité dépasse un seuil, les **floute** (flou gaussien multi-échelles), et les **rajoute** par-dessus l'image. Signature vérifiée sur la source three.js (`examples/jsm/postprocessing/UnrealBloomPass.js`) :

```typescript
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), // resolution
  1.5,   // strength  — intensité du halo
  0.4,   // radius    — étalement du flou, à garder dans [0, 1]
  0.85,  // threshold — seuil de luminosité : au-dessus = brille, en dessous = ignoré
);
composer.addPass(bloom);

// Réglables à chaud (propriétés publiques) :
bloom.strength = 2.0;
bloom.radius = 0.6;
bloom.threshold = 0.7;
```

Les trois réglages :
- **`threshold`** décide **quoi** brille (0 = tout, 1 = quasi rien). Pour n'illuminer que la sortie sélectionnée, on monte le threshold et on donne à ce marqueur une `emissiveIntensity > 1`.
- **`strength`** décide **combien** ça brille.
- **`radius`** décide **jusqu'où** le halo déborde.

Le bloom est **global** : il fait briller *tout* pixel au-dessus du threshold. Pour un halo sélectif (un seul objet), la technique simple est de rendre l'objet cible avec un matériau très émissif et de caler le threshold au-dessus du reste de la scène.

### 2.6 `ShaderPass` : un fragment shader sur l'image

`ShaderPass` applique un fragment shader custom à l'image. La convention : l'image de la passe précédente arrive dans l'uniform **`tDiffuse`** (vérifié : `textureID` par défaut = `'tDiffuse'` dans la source). Le vertex shader ne fait que projeter un quad plein écran et passer les `uv`.

```typescript
const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },   // OBLIGATOIRE — rempli automatiquement par le composer
    uDarkness: { value: 1.2 },   // uniform custom
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uDarkness;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);   // l'image de la passe précédente
      float dist = length(vUv - 0.5);          // 0 au centre, ~0.7 aux coins
      color.rgb *= smoothstep(0.8, 0.2, dist * uDarkness); // assombrit les bords
      gl_FragColor = color;
    }
  `,
};

const vignette = new ShaderPass(VignetteShader);
composer.addPass(vignette);

// Accès aux uniforms pour animer / régler :
vignette.uniforms.uDarkness.value = 1.4;         // via la passe
// ou vignette.material.uniforms.uDarkness.value = 1.4; // équivalent
```

Point clé : **ne jamais oublier `tDiffuse`** dans les uniforms. C'est le contrat que le composer remplit à chaque frame avec l'image entrante.

### 2.7 Antialiasing en post-process : FXAA vs SMAA

Quand on passe par un composer, l'antialiasing **natif** du renderer (MSAA via `antialias: true`) ne s'applique plus au rendu intermédiaire — il faut créer le renderer avec `antialias: false` et lisser les bords avec une **passe dédiée**, placée en fin de chaîne :

```typescript
const renderer = new THREE.WebGLRenderer({ antialias: false }); // MSAA inutile ici
```

| Passe | Qualité | Coût | Import |
|-------|---------|------|--------|
| **FXAA** | correcte, peut adoucir le texte | rapide | `ShaderPass(FXAAShader)` depuis `three/addons/shaders/FXAAShader.js` |
| **SMAA** | meilleure préservation des bords | moyen | `SMAAPass` depuis `three/addons/postprocessing/SMAAPass.js` |

FXAA passe par un `ShaderPass` (c'est un shader) et attend un uniform `resolution` en **1/pixels** :

```typescript
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

const fxaa = new ShaderPass(FXAAShader);
const pr = renderer.getPixelRatio();
fxaa.material.uniforms['resolution'].value.set(
  1 / (window.innerWidth  * pr),
  1 / (window.innerHeight * pr),
);
composer.addPass(fxaa); // près de la fin, avant OutputPass
```

### 2.8 Depth of field : `BokehPass`

La profondeur de champ (flou d'objectif : le sujet net, l'arrière-plan flou) se fait avec `BokehPass` (`three/addons/postprocessing/BokehPass.js`). Contrairement au bloom, elle a besoin de la **profondeur** de la scène — c'est pourquoi elle prend `scene` et `camera` en argument, pas seulement l'image :

```typescript
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';

const bokeh = new BokehPass(scene, camera, {
  focus: 5.0,      // distance de mise au point (unités monde)
  aperture: 0.025, // ouverture : plus grand = plus de flou
  maxblur: 0.01,   // flou maximal
});
composer.addPass(bokeh);

// Faire le point sur un objet (ex. la sortie cliquée) :
bokeh.uniforms['focus'].value = camera.position.distanceTo(target.position);
```

### 2.9 L'ordre des passes : ça change tout

Les passes ne commutent **pas**. L'ordre canonique :

```
RenderPass  →  effets de scène (bloom, DOF, SSAO)  →  effets d'image (vignette, grain)  →  AA (FXAA/SMAA)  →  OutputPass
```

Raisons concrètes :
- **Bloom avant vignette** : sinon la vignette assombrit les bords *puis* le bloom rallume les pixels — le coin ne s'assombrit jamais vraiment.
- **AA près de la fin** : lisser des bords déjà bruités par les effets ; mais **avant** `OutputPass` (on lisse en espace linéaire, avant la conversion sRGB).
- **`OutputPass` toujours en dernier** : c'est la conversion de sortie ; rien ne doit venir après.

---

## 3. Worked examples

### Exemple 1 — Halo (bloom) sur la sortie sélectionnée (TribuZen)

Objectif : la carte affiche plusieurs marqueurs ; celui **sélectionné** rayonne. On monte le composer, on cale le threshold au-dessus des marqueurs normaux, et on rend le marqueur sélectionné très émissif.

```typescript
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }      from 'three/addons/postprocessing/OutputPass.js';

// --- Renderer SANS antialias natif (on passe par le composer) ---
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

// (scene, camera, controls supposés déjà créés — module 13)

// --- Marqueurs : un normal, un sélectionné (très émissif) ---
function makeMarker(color: number, selected: boolean): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 24, 16),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      // > 1 pour dépasser le threshold du bloom ; les marqueurs normaux restent à 0
      emissiveIntensity: selected ? 3.0 : 0.0,
    }),
  );
}
const normal    = makeMarker(0x3388ff, false); normal.position.x = -1;
const selected  = makeMarker(0xffcc33, true);  selected.position.x =  1;
scene.add(normal, selected);

// --- Composer : RenderPass → Bloom → OutputPass ---
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.4,   // strength
  0.5,   // radius
  0.9,   // threshold élevé : seul le marqueur émissif dépasse
);
composer.addPass(bloom);

composer.addPass(new OutputPass()); // tone mapping + sRGB, EN DERNIER

// --- Boucle : composer.render() remplace renderer.render() ---
function animate(): void {
  requestAnimationFrame(animate);
  controls.update();
  composer.render();
}
animate();

// --- Resize : renderer ET composer ---
window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
});
```

Résultat : `selected` déborde d'un halo doré, `normal` reste net et mat. Changer la sélection = déplacer l'`emissiveIntensity` élevée sur un autre marqueur — le bloom suit automatiquement, sans toucher au composer.

### Exemple 2 — Ajouter la vignette custom au bon endroit dans la chaîne

On prolonge l'exemple 1 avec un `ShaderPass` vignette. L'ordre est critique : **après** le bloom, **avant** l'`OutputPass`.

```typescript
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const VignetteShader = {
  uniforms: {
    tDiffuse:  { value: null }, // rempli par le composer avec l'image entrante
    uDarkness: { value: 1.3 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uDarkness;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float dist = length(vUv - 0.5);               // 0 centre → ~0.7 coins
      float v = smoothstep(0.8, 0.2, dist * uDarkness); // 1 centre → 0 bords
      color.rgb *= v;
      gl_FragColor = color;
    }
  `,
};

const vignette = new ShaderPass(VignetteShader);

// Réordonnancement complet de la chaîne :
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera)); // 1. scène
composer.addPass(bloom);                          // 2. halo (avant la vignette !)
composer.addPass(vignette);                       // 3. vignette d'ambiance
composer.addPass(new OutputPass());               // 4. sortie, toujours en dernier

// Régler la vignette à chaud (ex. depuis un GUI de debug) :
vignette.uniforms.uDarkness.value = 1.5;
```

Si on inversait 2 et 3 (vignette **avant** bloom), les coins assombris seraient rallumés par le bloom des pixels brillants proches du bord : la vignette perdrait son effet là où elle compte le plus.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Garder `renderer.render()` en plus de `composer.render()`

Le composer **remplace** le rendu direct. Laisser `renderer.render(scene, camera)` dans la boucle en plus de `composer.render()` rend la scène deux fois (l'une écrase l'autre, effets perdus, perf divisée par deux). Dans la boucle : **uniquement** `composer.render()`.

### PIÈGE #2 — Oublier l'uniform `tDiffuse` dans un ShaderPass

Le composer injecte l'image entrante dans l'uniform nommé `tDiffuse` (nom par défaut du `textureID`). Si ton shader déclare `uInput` à la place sans le dire au `ShaderPass`, l'image n'arrive jamais et l'écran est noir/vide. Soit tu nommes l'uniform `tDiffuse`, soit tu passes le nom en 2ᵉ argument : `new ShaderPass(shader, 'uInput')`.

### PIÈGE #3 — Croire que `emissiveIntensity` seul crée un halo

Augmenter `emissiveIntensity` rend un matériau **plus lumineux à ses propres pixels**, mais un halo qui **déborde** est un effet d'image produit par le bloom. Sans `UnrealBloomPass`, pas de halo, quel que soit l'`emissiveIntensity`. Le combo est : matériau émissif **+** bloom avec un `threshold` calé au-dessus du reste.

### PIÈGE #4 — Laisser `antialias: true` sur le renderer avec un composer

Le MSAA natif (`antialias: true`) ne s'applique pas au framebuffer intermédiaire du composer — il est inefficace ici et coûte pour rien. Il faut `antialias: false` et une passe FXAA/SMAA dédiée. Symptôme d'oubli : bords crénelés malgré `antialias: true`.

### PIÈGE #5 — Mauvais ordre des passes

`OutputPass` **doit** être la dernière (c'est la conversion de sortie sRGB/tone mapping). L'AA se place **avant** l'`OutputPass`. Le bloom se place **avant** les effets d'assombrissement (vignette). Un ordre faux ne plante pas — il donne une image subtilement fausse (couleurs délavées, vignette annulée, bords toujours crénelés), difficile à diagnostiquer.

### PIÈGE #6 — Oublier `composer.setSize()` au resize

Redimensionner en appelant seulement `renderer.setSize()` laisse les framebuffers internes du composer à l'ancienne taille : image étirée ou floue. Il faut appeler **`composer.setSize(w, h)`** en plus, et re-régler les passes dépendant de la résolution (FXAA `resolution`, `SMAAPass.setSize`).

### PIÈGE #7 — Mauvais chemin d'import (cœur vs addons)

`import { EffectComposer } from 'three'` **échoue** : ce n'est pas dans le cœur. Le chemin est `three/addons/postprocessing/EffectComposer.js` (ou l'ancien alias `three/examples/jsm/...`), extension `.js` incluse. En HTML nu sans bundler, il faut un import map qui mappe `three/addons/`.

---

## 5. Ancrage TribuZen

Le post-processing habille la couche 3D de TribuZen sans toucher à la logique de scène.

**Halo sur la sortie sélectionnée (carte).** Quand un membre sélectionne une sortie, son marqueur passe en `emissiveIntensity` élevée ; un `UnrealBloomPass` au `threshold` calé au-dessus des marqueurs normaux fait rayonner **uniquement** celui-là. La sélection est ainsi lisible d'un coup d'œil, même sur une carte dense.

**Vignette d'ambiance (feed 3D).** La scène 3D du feed (souvenirs en volume) reçoit un `ShaderPass` vignette qui assombrit les bords : le regard se concentre au centre, l'ambiance devient plus intime. C'est un réglage `uDarkness` unique, exposé dans un thème.

Ordre retenu pour le pipeline TribuZen : `RenderPass → UnrealBloomPass → vignette (ShaderPass) → SMAAPass → OutputPass`.

Fichiers cibles dans `smaurier/tribuzen` :

```
tribuzen/
  src/
    3d/
      post/
        composer.ts        ← montage EffectComposer (RenderPass → bloom → vignette → SMAA → OutputPass)
        VignetteShader.ts   ← ShaderPass custom (tDiffuse + uDarkness)
      map/
        SelectionBloom.ts   ← gère l'emissiveIntensity du marqueur sélectionné
      MapCanvas.vue         ← boucle animate() → composer.render()
```

> Le halo sélectif « pixel-perfect » (un seul objet, sans jouer sur le threshold global) relève d'un rendu multi-passes avec masque de luminosité, vu plus tard. Ici, threshold + émissif suffisent au besoin produit.

---

## 6. Points clés

1. Le post-processing retraite l'**image finale** (espace écran), pas la scène 3D — recalculé chaque frame.
2. `EffectComposer` remplace `renderer.render()` : dans la boucle, on appelle **`composer.render()`** uniquement.
3. Socle minimal : `RenderPass(scene, camera)` en premier, `OutputPass()` en dernier (tone mapping + sRGB).
4. Imports = **addons** : `three/addons/postprocessing/*.js` (alias de `three/examples/jsm/...`), extension `.js` incluse.
5. `UnrealBloomPass(resolution, strength, radius, threshold)` : `threshold` = quoi brille, `strength` = combien, `radius` = jusqu'où.
6. `ShaderPass` : l'image entrante arrive dans l'uniform **`tDiffuse`** (obligatoire) ; uniforms accessibles via `pass.uniforms` / `pass.material.uniforms`.
7. Avec un composer, `antialias: false` sur le renderer + passe **FXAA** (rapide) ou **SMAA** (meilleure) près de la fin.
8. L'**ordre** des passes est signifiant : rendu → effets de scène → effets d'image → AA → `OutputPass` (jamais rien après).

---

## 7. Seeds Anki

```
Pourquoi augmenter emissiveIntensity ne suffit-il pas à créer un halo lumineux ?|emissiveIntensity rend le matériau plus lumineux SUR ses propres pixels, mais un halo qui déborde est un effet d'IMAGE : il faut un UnrealBloomPass qui extrait le brillant, le floute et le rajoute. Combo = matériau émissif + bloom avec threshold calé au-dessus du reste.
Que doit appeler la boucle d'animation quand on utilise un EffectComposer ?|composer.render() À LA PLACE de renderer.render(scene, camera). Garder les deux rend la scène deux fois et casse les effets. Ne jamais appeler les deux.
Quelles sont les deux passes du socle minimal d'un EffectComposer et leur ordre ?|RenderPass(scene, camera) EN PREMIER (rend la scène dans le framebuffer), OutputPass() EN DERNIER (tone mapping + conversion sRGB). Les effets s'insèrent entre les deux.
Quel est le chemin d'import de EffectComposer et des passes ?|three/addons/postprocessing/EffectComposer.js (alias officiel de three/examples/jsm/postprocessing/...). PAS dans le cœur 'three'. Extension .js obligatoire ; import map requis en HTML nu.
Quels sont les trois paramètres réglables d'UnrealBloomPass et leur rôle ?|threshold (seuil de luminosité : décide QUOI brille, 0=tout 1=rien), strength (COMBIEN ça brille), radius (jusqu'où le halo déborde, dans [0,1]). Constructeur : (resolution: Vector2, strength, radius, threshold).
Comment un ShaderPass reçoit-il l'image de la passe précédente ?|Via l'uniform nommé tDiffuse (textureID par défaut). Le composer y injecte l'image entrante à chaque frame. Oublier tDiffuse = écran vide. On peut changer le nom : new ShaderPass(shader, 'uInput').
Pourquoi met-on antialias:false sur le renderer quand on utilise un composer ?|Le MSAA natif ne s'applique pas au framebuffer intermédiaire du composer : il est inefficace et coûteux pour rien. On met antialias:false et on lisse avec une passe FXAA (rapide) ou SMAA (meilleure), placée près de la fin avant OutputPass.
Pourquoi le bloom doit-il venir avant la vignette dans la chaîne de passes ?|La vignette assombrit les bords ; si le bloom passait après, il rallumerait les pixels brillants près du bord et annulerait la vignette là où elle compte. Ordre : rendu → bloom → vignette → AA → OutputPass. Les passes ne commutent pas.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-16-post-processing-et-effets/README.md`. Monter un `EffectComposer` sur une scène Three.js starter, ajouter un `UnrealBloomPass` réglé et un `ShaderPass` vignette custom, dans le bon ordre — dans un navigateur réel, corrigé HTML/TS commenté, zéro harnais.
