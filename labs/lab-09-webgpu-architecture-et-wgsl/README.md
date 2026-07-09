# Lab 09 — WebGPU architecture et WGSL

> **Outcome :** à la fin, tu sais afficher un **premier triangle WebGPU** dans Chrome — initialisation asynchrone (adapter → device → configure), un shader **WGSL** minimal (`@vertex`/`@fragment`), et un render pass encodé puis soumis à la file.
> **Vrai outil :** Chrome 113+ (WebGPU stable) + Vite dev server, servi en `localhost` (secure context requis). Aucun harnais : le feedback est **visuel** dans le navigateur.
> **Feedback :** le coach valide en session (pas de test-runner auto-correcteur).

---

## Énoncé

Tu bascules le premier pixel du **globe des sorties TribuZen** de WebGL vers WebGPU. Objectif : un **triangle tricolore** (rouge/vert/bleu interpolés) sur fond bleu foncé, rendu **sans vertex buffer** (positions et couleurs codées dans le shader WGSL, indexées par `@builtin(vertex_index)`).

Cahier des charges **exact** :

1. Vérifier le support WebGPU (`navigator.gpu`) et afficher un message lisible si absent.
2. Obtenir `adapter` puis `device` de façon asynchrone, avec vérification du `null` de l'adapter.
3. Configurer le canvas (`getContext('webgpu')` + `configure` avec le format préféré).
4. Écrire un shader WGSL : `vs_main` (`@vertex`) génère 3 sommets + 3 couleurs, `fs_main` (`@fragment`) retourne la couleur interpolée.
5. Assembler un `GPURenderPipeline` (`layout: 'auto'`, `topology: 'triangle-list'`).
6. Encoder un render pass (`loadOp: 'clear'`, fond bleu foncé), `draw(3)`, soumettre via `queue.submit`.
7. Brancher `device.lost` pour logger une perte éventuelle.

**Pas de gap-fill** — tu écris `index.html`, `triangle.wgsl` et `main.ts` complets à partir du starter minimal.

### Prérequis machine

- Chrome 113+ (ou Edge 113+). Vérifie sur `chrome://gpu` que « WebGPU » est *Hardware accelerated*.
- Un projet Vite (`npm create vite@latest -- --template vanilla-ts`), lancé par `npm run dev` (sert en `http://localhost` — WebGPU exige un secure context, `file://` ne marche pas).

### Starter minimal

**`index.html`** :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Globe TribuZen — premier triangle WebGPU</title>
  <style>
    body { margin: 0; background: #111; }
    canvas { display: block; width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <canvas id="gpu-canvas"></canvas>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

**`triangle.wgsl`** — à compléter :

```wgsl
// À écrire : struct VertexOutput (@builtin(position) + @location(0) color),
// vs_main (@vertex, indexé par @builtin(vertex_index)), fs_main (@fragment).
```

**`main.ts`** — squelette :

```typescript
import shaderCode from './triangle.wgsl?raw'; // import brut du WGSL (Vite)

async function main(): Promise<void> {
  // 1. Support + adapter + device
  // 2. Configurer le canvas
  // 3. Shader module + render pipeline
  // 4. Encoder + soumettre le render pass
}

main();
```

---

## Étapes (en friction)

1. **Vérifie le support** — `if (!navigator.gpu) { affiche un message ; return; }`. Rappelle-toi : `undefined` hors HTTPS/localhost.
2. **Adapter** — `await navigator.gpu.requestAdapter()`, teste le `null` (aucun GPU convenable).
3. **Device** — `await adapter.requestDevice()`. Branche `device.lost.then(...)` pour logger `reason` + `message`.
4. **Canvas** — récupère le `<canvas>`, aligne `canvas.width/height` sur la taille affichée × `devicePixelRatio`, puis `getContext('webgpu')` et `configure({ device, format })` avec `format = navigator.gpu.getPreferredCanvasFormat()`.
5. **Shader WGSL** — dans `triangle.wgsl` : une struct de sortie (`@builtin(position)` + `@location(0) color`), un `array<vec2f, 3>` de positions clip-space et un `array<vec3f, 3>` de couleurs, indexés par `@builtin(vertex_index)`.
6. **Pipeline** — `createShaderModule({ code })` puis `createRenderPipeline` (`layout: 'auto'`, `entryPoint` corrects, `targets: [{ format }]`, `topology: 'triangle-list'`).
7. **Render pass** — `getCurrentTexture().createView()` → `createCommandEncoder` → `beginRenderPass` (`loadOp: 'clear'`, `clearValue`, `storeOp: 'store'`) → `setPipeline` → `draw(3)` → `end` → `queue.submit([encoder.finish()])`.
8. **Cas limites** — casse volontairement l'`entryPoint` (`'vs_bad'`) : l'erreur remonte à `createRenderPipeline`, pas au draw. Retire `configure` : `getCurrentTexture` échoue. Observe que WebGPU **parle** (message console), contrairement à WebGL.

### Grille d'auto-évaluation

| # | Critère | OK |
|---|---------|----|
| 1 | `navigator.gpu` et le `null` de l'adapter sont tous deux testés | ☐ |
| 2 | Toute l'initialisation est dans une fonction `async` avec `await` sur adapter et device | ☐ |
| 3 | `context.configure` est appelé avec `getPreferredCanvasFormat()` (pas de format en dur) | ☐ |
| 4 | Le WGSL n'a **aucune** `precision …` et utilise `@builtin(position)` (pas `gl_Position`) | ☐ |
| 5 | Les types WGSL portent leur suffixe (`vec2f`, `vec3f`, `vec4f`) | ☐ |
| 6 | Le clear est déclaratif (`loadOp: 'clear'` + `clearValue`), pas un appel impératif | ☐ |
| 7 | La frame suit : encoder → beginRenderPass → setPipeline → draw(3) → end → submit | ☐ |
| 8 | Le triangle tricolore s'affiche sur fond bleu foncé dans Chrome | ☐ |

---

## Corrigé complet commenté

**`triangle.wgsl`** :

```wgsl
// triangle.wgsl — vertex + fragment pour un triangle tricolore, sans vertex buffer

struct VertexOutput {
  @builtin(position) position: vec4f, // clip-space, sortie OBLIGATOIRE du vertex
  @location(0) color: vec3f,          // couleur interpolée vers le fragment (canal 0)
}

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VertexOutput {
  // Positions en clip space [-1, 1], une par sommet, indexées par vi (0,1,2)
  var positions = array<vec2f, 3>(
    vec2f( 0.0,  0.5),  // sommet haut
    vec2f(-0.5, -0.5),  // bas-gauche
    vec2f( 0.5, -0.5),  // bas-droit
  );
  // Une couleur par sommet — le GPU interpole entre les trois dans le triangle
  var colors = array<vec3f, 3>(
    vec3f(1.0, 0.0, 0.0), // rouge
    vec3f(0.0, 1.0, 0.0), // vert
    vec3f(0.0, 0.0, 1.0), // bleu
  );

  var out: VertexOutput;
  out.position = vec4f(positions[vi], 0.0, 1.0); // (x, y, z=0, w=1)
  out.color = colors[vi];
  return out;
}

@fragment
fn fs_main(@location(0) color: vec3f) -> @location(0) vec4f {
  // color est déjà interpolé ; on renvoie du RGBA sur le render target 0
  return vec4f(color, 1.0);
}
```

**`main.ts`** :

```typescript
// main.ts — premier triangle WebGPU (globe TribuZen)
import shaderCode from './triangle.wgsl?raw'; // ?raw : Vite importe le fichier comme string

async function main(): Promise<void> {
  // --- 1. Support + adapter + device (tout est asynchrone) ---
  if (!navigator.gpu) {
    document.body.textContent =
      'WebGPU non supporté. Utilise Chrome 113+ servi en HTTPS/localhost.';
    return; // navigator.gpu est undefined hors secure context
  }

  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance',
  });
  if (!adapter) {
    document.body.textContent = 'Aucun adaptateur GPU disponible.';
    return; // requestAdapter renvoie null si aucun GPU convenable
  }
  console.log('GPU:', adapter.info.vendor, adapter.info.architecture);

  const device = await adapter.requestDevice();
  // device.lost : Promise résolue si le GPU est perdu (driver, onglet tué, destroy)
  device.lost.then((info) => {
    console.error(`Device perdu : ${info.reason} — ${info.message}`);
  });

  // --- 2. Configurer le canvas ---
  const canvas = document.getElementById('gpu-canvas') as HTMLCanvasElement;
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;

  const context = canvas.getContext('webgpu');
  if (!context) throw new Error('Contexte WebGPU indisponible sur ce canvas.');

  // Format optimal selon l'OS/GPU — NE JAMAIS coder 'bgra8unorm' en dur
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'premultiplied' });

  // --- 3. Shader module + render pipeline (validation ICI, à la création) ---
  const module = device.createShaderModule({ label: 'triangle', code: shaderCode });
  const pipeline = device.createRenderPipeline({
    label: 'triangle pipeline',
    layout: 'auto', // pas d'uniforms : le layout des bindings est dérivé auto
    vertex:   { module, entryPoint: 'vs_main' },
    fragment: { module, entryPoint: 'fs_main', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });

  // --- 4. Encoder + soumettre le render pass ---
  const encoder = device.createCommandEncoder({ label: 'frame encoder' });
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: context.getCurrentTexture().createView(), // cible = texture du canvas
      clearValue: { r: 0.1, g: 0.1, b: 0.15, a: 1.0 }, // fond bleu foncé
      loadOp: 'clear',   // effacer avec clearValue (clear DÉCLARATIF)
      storeOp: 'store',  // conserver le résultat rendu
    }],
  });

  pass.setPipeline(pipeline);
  pass.draw(3);  // 3 sommets = 1 triangle (comme drawArrays, count = sommets)
  pass.end();

  device.queue.submit([encoder.finish()]); // soumission atomique à la file GPU
}

main();
```

**Pourquoi ce corrigé est correct :**
- Les deux vérifications (`navigator.gpu` puis `adapter === null`) couvrent les deux échecs distincts : API absente vs pas de GPU. Sans `await`, `device` serait une Promise et tout planterait ensuite.
- `configure` **lie** le contexte au device : sans lui, `getCurrentTexture()` échoue. Le format vient de `getPreferredCanvasFormat()` pour rester cross-plateforme.
- Le WGSL n'a **aucune** `precision` (f32 par défaut) et la position est un **champ `@builtin(position)`** de struct, pas `gl_Position`. Les couleurs par sommet sont interpolées par le GPU → dégradé.
- Le pipeline est validé **à la création** (`createRenderPipeline`) : un mauvais `entryPoint` échoue ici, pas au `draw`.
- Le clear est **déclaratif** (`loadOp: 'clear'`), pas un `gl.clear()` impératif. La frame est une liste de commandes soumise d'un bloc — aucun état global résiduel.

---

## Coach — questions de validation en session

Le coach pose ces questions ; réponds **sans relire le corrigé** :

1. **Pourquoi l'initialisation WebGPU doit-elle être `async`, alors que WebGL était synchrone ?** (attendu : `requestAdapter`/`requestDevice` renvoient des Promises — on *demande* un GPU physique puis un accès logique ; sans `await`, on manipule une Promise, pas un device.)
2. **Que se passe-t-il si on oublie `context.configure(...)` ?** (attendu : le contexte reste inerte ; `getCurrentTexture()` échoue — `getContext('webgpu')` seul ne suffit pas, contrairement à WebGL.)
3. **Où et quand une erreur de shader (mauvais `entryPoint`) est-elle signalée ?** (attendu : à `createRenderPipeline`, à la création — validation précoce et explicite, pas au draw call comme en WebGL.)
4. **Pourquoi `vec3` seul ne compile pas en WGSL ?** (attendu : WGSL exige un suffixe de type — `vec3f`/`vec3i`/`vec3u` ; et `precision highp float;` de GLSL n'existe pas.)
5. **Comment efface-t-on le fond en WebGPU ?** (attendu : de façon déclarative dans le `colorAttachment` — `loadOp: 'clear'` + `clearValue` — pas d'appel `clear()` impératif.)

---

## Variante J+30 (fading)

**Même objectif, contraintes ajoutées.** Reproduis le triangle WebGPU **de mémoire, en 30 minutes**, sans relire ce corrigé ni le module 09, avec :

1. **Une boucle de rendu** `requestAnimationFrame` (au lieu d'une frame unique) — ré-encode et re-soumets un render pass à chaque frame.
2. **Un fond animé** : fais varier la composante bleue du `clearValue` avec `Math.sin(performance.now() / 1000)`.
3. **Un fallback lisible** : si `navigator.gpu` est absent, affiche un `<p>` explicite au lieu d'un `throw`.

**Critère de réussite :** le triangle s'affiche, le fond pulse doucement, et la console reste sans erreur. Bonus : casse un `entryPoint` et vérifie que l'erreur pointe bien `createRenderPipeline`.

---

## Application TribuZen

Dans le repo `smaurier/tribuzen`, ce premier triangle WebGPU vit ici :

```
tribuzen/
  src/
    3d/
      webgpu/
        initWebGPU.ts     ← étapes 1-2 : adapter → device → configure (réutilisable)
        globe/
          globe.wgsl       ← shaders WGSL du globe (démarré ici en triangle)
          GlobeRenderer.ts ← étapes 3-4 : pipeline + render pass
      GlobeCanvas.vue      ← <canvas> WebGPU du globe des sorties
```

**Différences par rapport au lab :**

- `initWebGPU.ts` sera **factorisé** (retourne `{ device, context, format }`) et réutilisé par tous les renderers WebGPU du globe — dans le lab, tout est inline dans `main`.
- Le shader dépassera le triangle : positions réelles des sorties (géo → clip space, via vertex buffers du **module 10**) et matrices caméra en `var<uniform>`.
- Un **fallback WebGL** (renderer des modules 06-08) sera branché quand `navigator.gpu` est absent — le lab se contente d'un message.

**Commit cible :**
```
feat(3d): globe WebGPU — initWebGPU + premier triangle WGSL command-based
```
