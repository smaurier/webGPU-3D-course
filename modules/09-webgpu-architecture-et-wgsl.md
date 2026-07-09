---
titre: WebGPU architecture et WGSL
cours: 20-webgpu-3d
notions:
  - "navigator.gpu (point d'entrée, secure context)"
  - "GPUAdapter (requestAdapter, GPU physique, features/limits)"
  - "GPUDevice (requestDevice, accès logique, device.lost)"
  - "GPUQueue (device.queue, submit)"
  - "GPUCanvasContext (getContext('webgpu'), configure, getPreferredCanvasFormat)"
  - "GPUCommandEncoder et render pass (beginRenderPass, loadOp/storeOp)"
  - "modèle command-based vs state machine WebGL"
  - "WGSL types (f32, u32, vec2f/vec3f/vec4f, mat4x4f)"
  - "WGSL attributs (@vertex, @fragment, @builtin(position), @location, @group/@binding)"
  - "WGSL structs, var/let/const, address spaces (var<uniform>)"
outcomes:
  - sait obtenir un GPUDevice via navigator.gpu -> requestAdapter -> requestDevice avec vérification du support
  - sait configurer un canvas WebGPU (getContext, getPreferredCanvasFormat, configure)
  - sait écrire un vertex et un fragment shader minimal en WGSL avec @vertex/@fragment et @builtin(position)
  - sait encoder et soumettre un render pass (commandEncoder, beginRenderPass, draw, queue.submit)
  - sait expliquer la différence command-based (WebGPU) vs machine à états (WebGL) et traduire GLSL en WGSL
prerequis:
  - "06-webgl-fondamentaux (contexte, shaders, VBO, draw call, machine à états)"
  - "07-shaders-buffers-textures (GLSL vertex/fragment, attributs, uniforms)"
  - "08-scene-webgl-complete (pipeline WebGL complet, boucle de rendu)"
next: 10-render-pipeline-et-bind-groups
libs: []
tribuzen: "moteur de rendu 3D TribuZen — bascule du globe des sorties de la famille vers WebGPU : premier triangle rendu via l'API command-based, socle du futur globe interactif"
last-reviewed: 2026-07
---

# WebGPU architecture et WGSL

> **Outcomes — tu sauras FAIRE :** obtenir un `GPUDevice` (adapter → device), configurer un canvas WebGPU, écrire un vertex + fragment shader minimal en WGSL, encoder un render pass et le soumettre, et traduire un shader GLSL en WGSL.
> **Difficulté :** :star::star::star::star:
>
> **Portée :** ce module est le **premier contact avec WebGPU** et **WGSL**. On y pose l'initialisation, la syntaxe du langage de shader, et le premier triangle. Les **vertex buffers**, **bind groups** et **uniforms** détaillés arrivent au **module 10** ; les **compute shaders** au **module 11**. Ici : architecture + WGSL + un triangle codé en dur dans le shader.

## 1. Cas concret d'abord

Depuis le module 06, le globe des sorties de la famille TribuZen tourne en **WebGL2** : marqueurs, textures, éclairage, une scène animée complète (module 08). Ça marche. Mais trois limites bloquent la suite :

- **Aucun compute.** Recalculer côté GPU les positions de centaines de marqueurs (clustering des sorties par région) est impossible en WebGL — il faudra du **compute shader** (module 11), absent de WebGL.
- **Erreurs silencieuses.** Un bind oublié = écran noir sans message (revu au module 06). Sur une scène qui grossit, le debug devient un cauchemar.
- **Machine à états fragile.** Chaque draw dépend de l'état global courant (`bindBuffer`, `useProgram`…). Ajouter un deuxième objet au globe casse souvent le premier par un bind résiduel.

WebGPU corrige les trois. C'est l'API GPU moderne du web, calquée sur Vulkan / Metal / Direct3D 12 : **command-based** (on enregistre des commandes immutables au lieu de muter un état global), validation **explicite**, et compute natif.

Le réflexe « je copie mon setup WebGL » **ne marche pas** :

```typescript
// ❌ WebGPU n'a PAS d'API synchrone façon WebGL
const canvas = document.querySelector('canvas')!;
const gl = canvas.getContext('webgpu'); // ce n'est pas un "contexte prêt à dessiner"
gl.clearColor(0.1, 0.1, 0.2, 1.0);       // ❌ cette méthode n'existe pas en WebGPU
gl.drawArrays(/* ... */);                 // ❌ non plus
```

WebGPU est **asynchrone** à l'initialisation (on *demande* un GPU, on attend une Promise) et **objet** au rendu (on construit un pipeline, on encode des commandes, on les soumet à une file). Ce module pose ce nouveau modèle, du `navigator.gpu` jusqu'au triangle affiché.

---

## 2. Théorie complète, concise

### 2.1 Command-based vs machine à états

WebGL est une **machine à états globale** : chaque appel (`bindBuffer`, `useProgram`, `uniform*`) mute un état, et un draw call consomme « ce qui est courant ». Oublier un bind = utiliser l'état du draw précédent, en silence.

WebGPU est **command-based** : on ne mute rien globalement. On construit des **objets immutables** (pipeline pré-compilé, bind groups), on **enregistre** une liste de commandes dans un encoder, puis on **soumet** le tout d'un bloc à la file (`queue`). Chaque frame repart de zéro, sans état résiduel.

```typescript
// WebGL — machine à états : chaque appel mute l'état global
gl.useProgram(program);
gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
gl.drawArrays(gl.TRIANGLES, 0, 3);  // dessine avec l'état courant (fragile)
```

```typescript
// WebGPU — command-based : on enregistre des commandes puis on soumet
const encoder = device.createCommandEncoder();
const pass = encoder.beginRenderPass(passDescriptor);
pass.setPipeline(pipeline);         // pipeline immutable, pré-validé
pass.draw(3);
pass.end();
device.queue.submit([encoder.finish()]); // soumission atomique, aucun état résiduel
```

| Aspect | WebGL | WebGPU |
|--------|-------|--------|
| Modèle | Machine à états | Command-based (commandes immutables) |
| Validation | Au draw call (tard) | À la création du pipeline (tôt) |
| Compute shaders | Non | Oui |
| Langage shader | GLSL ES | WGSL |
| Erreurs | Silencieuses (`gl.getError()`) | Explicites (error scopes, `device.lost`) |
| Inspiration | OpenGL ES | Vulkan / Metal / D3D12 |

### 2.2 L'arbre d'initialisation

WebGPU s'obtient en trois étapes asynchrones, du plus physique au plus logique :

```
navigator.gpu                     // point d'entrée (undefined si non supporté)
   └─ await requestAdapter()      // GPUAdapter : le GPU physique (features, limits)
        └─ await requestDevice()  // GPUDevice : accès logique, crée les ressources
             └─ device.queue      // GPUQueue : la file où l'on soumet les commandes
```

- **`navigator.gpu`** — le point d'entrée. `undefined` si le navigateur ne supporte pas WebGPU. Disponible uniquement en **secure context** (HTTPS ou `localhost`).
- **`GPUAdapter`** — représente le GPU physique choisi. Expose `adapter.features` (un `Set`) et `adapter.limits`. Obtenu par `await navigator.gpu.requestAdapter()`, qui renvoie `null` si aucun GPU convenable.
- **`GPUDevice`** — l'accès **logique** au GPU : c'est lui qui crée buffers, shaders, pipelines. Obtenu par `await adapter.requestDevice()`.
- **`GPUQueue`** — accessible via `device.queue`, la file à laquelle on **soumet** les command buffers et écrit dans les buffers.

```typescript
if (!navigator.gpu) throw new Error('WebGPU non supporté (Chrome 113+, HTTPS/localhost requis).');

const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
if (!adapter) throw new Error('Aucun adaptateur GPU disponible.');

const device = await adapter.requestDevice(); // Promise<GPUDevice>
```

> `requestAdapter` prend des options facultatives (`powerPreference: 'high-performance' | 'low-power'`). `requestDevice` peut demander des `requiredFeatures` / `requiredLimits` (détail au module 11).

### 2.3 Informations et perte du device

`adapter.info` (propriété, `GPUAdapterInfo`) expose `vendor`, `architecture`, `device`, `description`. `device.lost` est une **Promise** résolue si le GPU est perdu (driver planté, onglet en arrière-plan tué, `device.destroy()`). Son `reason` vaut `'destroyed'` (volontaire) ou `'unknown'` (involontaire → à ré-initialiser).

```typescript
console.log('GPU:', adapter.info.vendor, adapter.info.architecture);

device.lost.then((info) => {
  console.error(`Device perdu : ${info.reason} — ${info.message}`);
  if (info.reason !== 'destroyed') {
    // perte involontaire : tenter une ré-initialisation
  }
});
```

<!-- FLAG-DOC: adapter.info est la propriété courante (MDN 2026). L'ancien adapter.requestAdapterInfo() du legacy est déprécié — remplacé ci-dessus. -->

### 2.4 Configurer le canvas

Contrairement à WebGL, `canvas.getContext('webgpu')` ne renvoie **pas** un contexte prêt à dessiner : c'est un `GPUCanvasContext` qu'il faut **lier** au device via `configure`. Le format d'affichage optimal est donné par `navigator.gpu.getPreferredCanvasFormat()` (souvent `'bgra8unorm'`).

```typescript
const context = canvas.getContext('webgpu');
if (!context) throw new Error("Contexte WebGPU indisponible sur ce canvas.");

const format = navigator.gpu.getPreferredCanvasFormat(); // 'bgra8unorm' | 'rgba8unorm'

context.configure({
  device,
  format,
  alphaMode: 'premultiplied', // composition avec la page HTML ('opaque' sinon)
});
```

> **Toujours** utiliser `getPreferredCanvasFormat()` — le format optimal varie selon l'OS/GPU. Coder `'bgra8unorm'` en dur casse sur certaines plateformes.

### 2.5 WGSL : le langage des shaders

WebGPU n'utilise **pas** GLSL mais **WGSL** (WebGPU Shading Language), de syntaxe proche de Rust : typage **strict et explicite**, erreurs à la **compilation** (pas au runtime), et **aucune directive de précision** (`precision highp float;` de GLSL n'existe pas — `f32` est le type par défaut des flottants).

**Types scalaires :**

```wgsl
var a: f32 = 3.14;   // flottant 32 bits (le défaut, aucune précision à déclarer)
var b: i32 = -42;    // entier signé 32 bits
var c: u32 = 42u;    // entier non signé 32 bits (suffixe u)
var d: bool = true;  // booléen
// f16 existe mais nécessite la feature 'shader-f16'
```

**Vecteurs et matrices** — le suffixe encode le type des composantes (`f` = f32, `i` = i32, `u` = u32) :

```wgsl
var v2: vec2f = vec2f(1.0, 2.0);           // 2 × f32
var v3: vec3f = vec3f(1.0, 2.0, 3.0);      // 3 × f32
var v4: vec4f = vec4f(1.0, 2.0, 3.0, 1.0); // 4 × f32
var vi: vec3i = vec3i(1, 2, 3);            // 3 × i32
var vu: vec2u = vec2u(10u, 20u);           // 2 × u32

var x  = v4.x;    // accès composante
var yz = v4.yz;   // swizzle -> vec2f
var rgb = v4.rgb; // swizzle couleur -> vec3f

var m: mat4x4f = mat4x4f(); // matrice 4×4 de f32 (identité par défaut vide)
```

**Tableaux** (constructeur `array<T, N>(...)`) :

```wgsl
var positions = array<vec2f, 3>(
  vec2f( 0.0,  0.5),
  vec2f(-0.5, -0.5),
  vec2f( 0.5, -0.5),
);
```

### 2.6 WGSL : var / let / const et address spaces

- **`var`** — variable **mutable**.
- **`let`** — valeur **immutable** après initialisation (constante d'exécution).
- **`const`** — constante **compile-time** (connue à la compilation).

Une variable de module (ressource liée) déclare son **address space** — où elle vit en mémoire :

```wgsl
// var<uniform>       : lecture seule, données partagées par le draw call (module 10)
// var<storage, read> : lecture seule, gros volumes de données
// var<storage, read_write> : lecture/écriture (compute, module 11)
// var<private>       : par invocation ; var<workgroup> : partagé (compute)
// var<function>      : locale (défaut à l'intérieur d'une fonction)

@group(0) @binding(0) var<uniform> u: Uniforms; // détaillé au module 10
```

### 2.7 WGSL : attributs, structs et points d'entrée

WGSL remplace les `layout(location=...)` de GLSL par des **attributs** préfixés `@`, et `void main()` par des fonctions annotées `@vertex` / `@fragment` / `@compute`.

```wgsl
@vertex        // point d'entrée du vertex shader
@fragment      // point d'entrée du fragment shader
@compute       // point d'entrée du compute shader (module 11)

@builtin(position)      // position clip-space (sortie obligatoire du vertex shader)
@builtin(vertex_index)  // index du sommet courant (0, 1, 2, …)
@location(0)            // canal d'entrée/sortie inter-étages (numéro unique)
@group(0) @binding(0)   // référence un binding dans un bind group (module 10)
```

Les sorties du vertex shader passent par une **struct** dont un champ porte `@builtin(position)` :

```wgsl
struct VertexOutput {
  @builtin(position) position: vec4f, // clip-space, obligatoire
  @location(0) color: vec3f,          // interpolé vers le fragment shader
}

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VertexOutput {
  var out: VertexOutput;
  out.position = vec4f(0.0, 0.0, 0.0, 1.0);
  out.color = vec3f(1.0, 0.0, 0.0);
  return out;
}

@fragment
fn fs_main(@location(0) color: vec3f) -> @location(0) vec4f {
  return vec4f(color, 1.0); // sortie couleur RGBA sur le render target 0
}
```

### 2.8 Le render pass : encoder et soumettre

Le rendu d'une frame suit toujours la même séquence command-based :

```
context.getCurrentTexture().createView()   // cible : la texture du canvas cette frame
device.createCommandEncoder()               // un enregistreur de commandes
  encoder.beginRenderPass({ colorAttachments }) // début du pass (clear + cible)
    pass.setPipeline(pipeline)              // quel pipeline utiliser
    pass.draw(3)                            // 3 sommets = 1 triangle
    pass.end()                              // fin du pass
device.queue.submit([encoder.finish()])     // soumission atomique au GPU
```

Le `colorAttachment` décrit **quoi** dessiner et **comment démarrer/finir** :

```typescript
const pass = encoder.beginRenderPass({
  colorAttachments: [{
    view: context.getCurrentTexture().createView(),
    clearValue: { r: 0.1, g: 0.1, b: 0.15, a: 1.0 },
    loadOp: 'clear',  // 'clear' (effacer avec clearValue) | 'load' (garder l'existant)
    storeOp: 'store',  // 'store' (conserver le résultat) | 'discard'
  }],
});
```

`loadOp: 'clear'` remplace l'ancien `gl.clear()` de WebGL ; il est **déclaratif** (décrit dans le descriptor, pas un appel impératif). `pass.draw(count)` prend un **nombre de sommets** (comme `drawArrays`) — 3 pour un triangle.

### 2.9 Le render pipeline

Avant de dessiner, on compile le WGSL en `GPUShaderModule` puis on assemble un `GPURenderPipeline` — l'objet **immutable et pré-validé** qui combine vertex + fragment + topologie :

```typescript
const module = device.createShaderModule({ label: 'triangle', code: shaderCode });

const pipeline = device.createRenderPipeline({
  layout: 'auto', // dérive automatiquement le layout des bindings (module 10 : explicite)
  vertex:   { module, entryPoint: 'vs_main' },
  fragment: { module, entryPoint: 'fs_main', targets: [{ format }] },
  primitive: { topology: 'triangle-list' },
});
```

`layout: 'auto'` suffit tant qu'il n'y a pas d'uniforms ; `entryPoint` nomme la fonction WGSL annotée `@vertex`/`@fragment`. La validation a lieu **ici**, à la création — pas au draw call.

---

## 3. Worked examples

### Exemple 1 — Premier triangle WebGPU (globe TribuZen)

Basculer le premier pixel du globe vers WebGPU : un triangle tricolore, positions et couleurs **codées dans le shader** (pas encore de vertex buffer — c'est le module 10). Deux fichiers.

**`triangle.wgsl`** — le vertex genère les 3 sommets depuis `@builtin(vertex_index)` :

```wgsl
struct VertexOutput {
  @builtin(position) position: vec4f, // clip-space, obligatoire
  @location(0) color: vec3f,          // couleur interpolée vers le fragment
}

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VertexOutput {
  // Positions en clip space [-1, 1], indexées par le numéro de sommet
  var positions = array<vec2f, 3>(
    vec2f( 0.0,  0.5),  // sommet haut
    vec2f(-0.5, -0.5),  // bas-gauche
    vec2f( 0.5, -0.5),  // bas-droit
  );
  var colors = array<vec3f, 3>(
    vec3f(1.0, 0.0, 0.0), // rouge
    vec3f(0.0, 1.0, 0.0), // vert
    vec3f(0.0, 0.0, 1.0), // bleu
  );

  var out: VertexOutput;
  out.position = vec4f(positions[vi], 0.0, 1.0);
  out.color = colors[vi];
  return out;
}

@fragment
fn fs_main(@location(0) color: vec3f) -> @location(0) vec4f {
  return vec4f(color, 1.0); // RGBA sur le render target 0
}
```

**`main.ts`** — initialisation asynchrone + encodage du render pass :

```typescript
import shaderCode from './triangle.wgsl?raw'; // import brut (bundler Vite)

async function main(): Promise<void> {
  // 1. Support + adapter + device (asynchrone)
  if (!navigator.gpu) throw new Error('WebGPU non supporté (Chrome 113+, HTTPS/localhost).');

  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('Aucun adaptateur GPU.');

  const device = await adapter.requestDevice();
  device.lost.then((info) => {
    console.error(`Device perdu : ${info.reason} — ${info.message}`);
  });

  // 2. Configurer le canvas
  const canvas = document.getElementById('gpu-canvas') as HTMLCanvasElement;
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;

  const context = canvas.getContext('webgpu');
  if (!context) throw new Error('Contexte WebGPU indisponible.');

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'premultiplied' });

  // 3. Compiler le WGSL et assembler le pipeline (validation ICI)
  const module = device.createShaderModule({ label: 'triangle', code: shaderCode });
  const pipeline = device.createRenderPipeline({
    label: 'triangle pipeline',
    layout: 'auto',
    vertex:   { module, entryPoint: 'vs_main' },
    fragment: { module, entryPoint: 'fs_main', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });

  // 4. Encoder + soumettre le render pass
  const encoder = device.createCommandEncoder({ label: 'frame encoder' });
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: context.getCurrentTexture().createView(),
      clearValue: { r: 0.1, g: 0.1, b: 0.15, a: 1.0 }, // fond bleu foncé
      loadOp: 'clear',
      storeOp: 'store',
    }],
  });

  pass.setPipeline(pipeline);
  pass.draw(3);   // 3 sommets = 1 triangle
  pass.end();

  device.queue.submit([encoder.finish()]); // soumission atomique
}

main();
```

Résultat : un triangle dégradé rouge/vert/bleu sur fond bleu foncé. Comparé à WebGL (module 06), aucune machine à états : le pipeline est validé à la création, et la frame est une liste de commandes soumise d'un bloc.

### Exemple 2 — Traduire un shader GLSL en WGSL

Le même vertex shader, GLSL (module 07) puis WGSL. Le tableau ci-dessous fixe la correspondance terme à terme.

```glsl
// === GLSL (WebGL2) ===
#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aColor;
out vec3 vColor;
void main() {
  vColor = aColor;
  gl_Position = vec4(aPosition, 1.0);
}
```

```wgsl
// === WGSL (WebGPU) ===
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec3f,
}

@vertex
fn vs_main(
  @location(0) aPosition: vec3f,
  @location(1) aColor: vec3f,
) -> VertexOutput {
  var out: VertexOutput;
  out.color = aColor;
  out.position = vec4f(aPosition, 1.0);
  return out;
}
```

| Concept | GLSL | WGSL |
|---------|------|------|
| Type vecteur | `vec3`, `vec4` | `vec3f`, `vec4f` (type explicite) |
| Matrice | `mat4` | `mat4x4f` |
| Entrée vertex | `layout(location=0) in vec3 aPos;` | `@location(0) aPos: vec3f` |
| Sortie vertex | `out vec3 vColor;` | `@location(0) color: vec3f` (dans une struct) |
| Position | `gl_Position` | champ `@builtin(position)` |
| Couleur sortie | `out vec4 fragColor;` | `-> @location(0) vec4f` |
| Point d'entrée | `void main()` | `@vertex fn vs_main()` |
| Précision | `precision highp float;` | **rien** (f32 par défaut) |
| Constructeur | `vec3(1.0, 0.0, 0.0)` | `vec3f(1.0, 0.0, 0.0)` |
| Uniform | `uniform mat4 uMVP;` | `@group(0) @binding(0) var<uniform> …` |

Point clé : en WGSL la position n'est **pas** une variable magique globale (`gl_Position`) mais un **champ de struct** annoté `@builtin(position)`, retourné explicitement.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Croire que `getContext('webgpu')` donne un contexte prêt à dessiner

En WebGL, `getContext('webgl2')` renvoie un contexte immédiatement utilisable. En WebGPU, `getContext('webgpu')` renvoie un `GPUCanvasContext` **inerte** tant qu'on n'a pas appelé `context.configure({ device, format })`. Sans `configure`, `getCurrentTexture()` échoue.

### PIÈGE #2 — Oublier que l'initialisation est asynchrone

`requestAdapter()` et `requestDevice()` renvoient des **Promises**. Écrire `const device = adapter.requestDevice()` (sans `await`) donne un objet `Promise`, pas un device — tous les appels suivants plantent. Toute l'initialisation vit dans une fonction `async`.

### PIÈGE #3 — Ne pas tester `navigator.gpu` ni le `null` de l'adapter

`navigator.gpu` est `undefined` hors secure context ou navigateur non compatible ; `requestAdapter()` renvoie `null` si aucun GPU convenable. Deux vérifications distinctes : `if (!navigator.gpu)` **et** `if (!adapter)`. WebGPU exige aussi **HTTPS ou localhost** — servi en `file://`, `navigator.gpu` est absent.

### PIÈGE #4 — Réutiliser `precision highp float;` en WGSL

WGSL n'a **aucune** directive de précision : `f32` est le type par défaut des flottants. Copier `precision highp float;` d'un shader GLSL est une **erreur de compilation** WGSL. De même, `gl_Position` / `gl_FragColor` n'existent pas — on utilise `@builtin(position)` et un retour `@location(0)`.

### PIÈGE #5 — Confondre les types WGSL et GLSL

En WGSL, `vec3` **seul n'existe pas** : il faut un suffixe de type — `vec3f` (f32), `vec3i` (i32), `vec3u` (u32). De même `mat4` → `mat4x4f`. Le constructeur porte le type : `vec3f(1.0, 0.0, 0.0)`, pas `vec3(...)`.

### PIÈGE #6 — Chercher un `gl.clear()` impératif

En WebGPU l'effacement est **déclaratif** : il se décrit dans le `colorAttachment` via `loadOp: 'clear'` + `clearValue`, pas par un appel séparé. Chercher une méthode `clear()` sur le pass ou le device est une impasse.

### PIÈGE #7 — Croire que la validation a lieu au draw call

En WebGPU, un pipeline invalide (mauvais `entryPoint`, format incompatible) échoue à `createRenderPipeline`, **pas** à `draw`. C'est l'inverse de WebGL où l'erreur remonte tard, au draw. Bonus : mettre des `label` partout rend les messages d'erreur lisibles.

---

## 5. Ancrage TribuZen

WebGPU est la **cible d'architecture** du moteur 3D de TribuZen. Le globe des sorties, prototypé en WebGL (modules 06-08), y migre pour débloquer le compute (clustering des marqueurs, module 11) et une validation fiable à mesure que la scène grossit.

**Bascule du globe vers WebGPU.** Le premier jalon est exactement l'Exemple 1 : un triangle rendu via l'API command-based, remplaçant le triangle WebGL du module 06. À partir de là :

- **module 10** — vertex buffers + bind groups : positions réelles des sorties (géo → clip space) et uniforms (matrices caméra du globe) ;
- **module 11** — compute shader : clustering GPU des sorties par région avant rendu ;
- WGSL devient le langage de tous les shaders du globe (éclairage, atmosphère, marqueurs).

Fichiers cibles dans `smaurier/tribuzen` :

```
tribuzen/
  src/
    3d/
      webgpu/
        initWebGPU.ts     ← adapter → device → configure (Exemple 1, étapes 1-2)
        globe/
          globe.wgsl       ← shaders WGSL du globe (vertex + fragment)
          GlobeRenderer.ts ← pipeline + render pass du globe
      GlobeCanvas.vue      ← <canvas> WebGPU du globe des sorties
```

> La coexistence WebGL/WebGPU (fallback si `navigator.gpu` absent) reste utile en production : détecter WebGPU, sinon retomber sur le renderer WebGL des modules 06-08. Ici on pose la brique zéro WebGPU : **un triangle command-based s'affiche**.

---

## 6. Points clés

1. WebGPU est **command-based** (commandes immutables soumises à une file), pas une machine à états comme WebGL — aucun état global résiduel entre frames.
2. Initialisation **asynchrone** : `navigator.gpu` → `await requestAdapter()` → `await requestDevice()` ; tester `navigator.gpu` (undefined) **et** l'adapter (`null`), en secure context (HTTPS/localhost).
3. `canvas.getContext('webgpu')` doit être **configuré** (`context.configure({ device, format })`) ; `format` vient de `navigator.gpu.getPreferredCanvasFormat()`.
4. WGSL remplace GLSL : typage strict, **aucune précision à déclarer** (f32 par défaut), erreurs à la **compilation**.
5. Types WGSL avec suffixe : `vec2f/vec3f/vec4f`, `vec3i`, `vec2u`, `mat4x4f` ; constructeurs typés (`vec3f(...)`).
6. Attributs `@` : `@vertex`/`@fragment`, `@builtin(position)` (sortie obligatoire), `@builtin(vertex_index)`, `@location(N)`, `@group/@binding` ; la position est un **champ de struct**, pas `gl_Position`.
7. Séquence de frame : `getCurrentTexture().createView()` → `createCommandEncoder` → `beginRenderPass` (clear déclaratif via `loadOp`) → `setPipeline` → `draw(count)` → `end` → `queue.submit`.
8. Le `GPURenderPipeline` est **immutable et validé à la création** (`layout: 'auto'`, `entryPoint`, `targets`), pas au draw call.

---

## 7. Seeds Anki

```
Pourquoi l'initialisation WebGPU est-elle asynchrone alors que WebGL est synchrone ?|WebGPU *demande* un GPU physique (requestAdapter) puis un accès logique (requestDevice), deux opérations qui renvoient des Promises — il faut await. WebGL renvoie directement un contexte via getContext. Sans await, on manipule une Promise au lieu du device.
Quelle est la différence entre command-based (WebGPU) et machine à états (WebGL) ?|WebGL mute un état global (bindBuffer, useProgram) et un draw consomme l'état courant — fragile, un bind oublié casse tout en silence. WebGPU enregistre des commandes immutables dans un encoder puis les soumet d'un bloc à queue.submit ; chaque frame repart de zéro, sans état résiduel.
En WebGPU, que faut-il faire après canvas.getContext('webgpu') avant de pouvoir dessiner ?|L'appeler configure : context.configure({ device, format, alphaMode }). Le contexte est inerte tant qu'il n'est pas lié au device. Le format vient de navigator.gpu.getPreferredCanvasFormat() (ne jamais coder 'bgra8unorm' en dur).
Comment déclare-t-on la position clip-space en sortie d'un vertex shader WGSL ?|Par un champ de struct annoté @builtin(position) de type vec4f, retourné explicitement. Il n'y a PAS de gl_Position magique comme en GLSL. Ex : struct VertexOutput { @builtin(position) position: vec4f, ... }.
Quelle directive GLSL ne faut-il PAS copier dans un shader WGSL, et pourquoi ?|precision highp float; — WGSL n'a aucune directive de précision, f32 est le type par défaut. La copier est une erreur de compilation. De même gl_Position/gl_FragColor n'existent pas (utiliser @builtin(position) et un retour @location(0)).
En WGSL, pourquoi écrire vec3f et non vec3 ?|WGSL exige un suffixe de type sur les vecteurs : vec3f (f32), vec3i (i32), vec3u (u32). vec3 seul n'existe pas. Idem mat4 devient mat4x4f. Le constructeur porte aussi le type : vec3f(1.0, 0.0, 0.0).
Comment efface-t-on le fond (clear) en WebGPU ?|De façon déclarative dans le colorAttachment du render pass : loadOp: 'clear' + clearValue: { r, g, b, a }. Il n'y a pas d'appel impératif gl.clear() ; storeOp: 'store' conserve le résultat rendu.
À quel moment un pipeline WebGPU invalide (mauvais entryPoint, format) échoue-t-il ?|À device.createRenderPipeline (à la création), pas au draw call — la validation est explicite et précoce. C'est l'inverse de WebGL où l'erreur remonte tard, silencieusement, au draw. Mettre des label facilite le diagnostic.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-09-webgpu-architecture-et-wgsl/README.md`. Afficher le premier triangle WebGPU dans Chrome — initialisation asynchrone (adapter → device → configure), shader WGSL minimal (@vertex/@fragment), render pass encodé et soumis, écrit de zéro dans un navigateur réel.
