# Module 09 — WebGPU architecture et WGSL

| Difficulte | Duree estimee | Lab | Quiz |
|------------|---------------|-----|------|
| 4/5        | 120 min       | [Lab 09](../labs/lab-09-webgpu-architecture/) | [Quiz 09](../quizzes/quiz-09-webgpu.html) |

## Objectifs

- Comprendre le paradigme WebGPU (command-based) vs WebGL (state machine)
- Obtenir un GPUDevice via navigator.gpu, requestAdapter, requestDevice
- Configurer le canvas pour le rendu WebGPU
- Maîtriser la syntaxe WGSL : types, decorateurs, structures
- Écrire un vertex shader et un fragment shader en WGSL
- Comparer GLSL et WGSL cote a cote
- Dessiner un premier triangle WebGPU complet
- Gérer les erreurs et détecter les fonctionnalites disponibles

---

<details>
<summary>Rappel du cours précédent (Module 08 — Scene WebGL complete)</summary>

Dans le module 08, nous avons construit une scene WebGL complete avec :
- Un pipeline de rendu complet : vertex buffer, index buffer, textures, uniforms
- Des shaders GLSL (vertex + fragment) avec `gl_Position` et `gl_FragColor`
- La gestion de la camera (vue + projection) via des matrices uniformes
- L'eclairage Phong (ambient + diffus + speculaire) dans le fragment shader
- La boucle de rendu `requestAnimationFrame` avec rotation de l'objet
- Les limites de WebGL : state machine globale, pas de compute, verbeux

WebGPU represente la prochaine génération. Il corrige les problèmes architecturaux de WebGL en adoptant un modèle explicite inspire de Vulkan, Metal et Direct3D 12.

</details>

---

## WebGPU vs WebGL : changement de paradigme

### L'analogie de la cuisine

Imaginez que vous dirigez une cuisine de restaurant.

**WebGL = un seul cuisinier avec une seule plaque** :
- Le cuisinier change d'ustensile à chaque étape (bind state)
- Il ne peut preparer qu'un plat à la fois (un draw call bloque les suivants)
- Pour changer de recette, il doit tout nettoyer et recommencer (changer le programme shader)
- S'il fait une erreur, personne ne lui dit clairement quoi (erreurs silencieuses)

**WebGPU = une brigade avec des fiches de commande** :
- Chaque cuisinier recoit une fiche de commande immutable (command buffer)
- Plusieurs cuisiniers preparent des plats en parallele (pipelines independants)
- Les recettes sont pre-validees à la création (pipeline pre-compile)
- Un chef de salle vérifié chaque commande avant envoi (validation explicite)

### Comparaison architecturale

| Aspect | WebGL | WebGPU |
|--------|-------|--------|
| Modèle | State machine | Command-based |
| État global | Oui (un contexte mutable) | Non (objets immutables) |
| Validation | Au moment du draw call | A la création du pipeline |
| Compute shaders | Non | Oui |
| Multi-thread | Non | Oui (via workers) |
| Langage shader | GLSL ES | WGSL |
| Inspiration | OpenGL ES | Vulkan / Metal / D3D12 |
| Gestion mémoire | Implicite | Explicite (buffers, layouts) |
| Erreurs | Silencieuses (`gl.getError()`) | Explicites (error scopes, device.lost) |

### Le modèle command-based

En WebGL, chaque appel modifie un état global :

```typescript
// WebGL : state machine — chaque appel modifie l'etat global
gl.useProgram(program);           // Etat : shader actif
gl.bindBuffer(gl.ARRAY_BUFFER, vbo); // Etat : buffer actif
gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
gl.enableVertexAttribArray(0);
gl.bindTexture(gl.TEXTURE_2D, texture); // Etat : texture active
gl.uniform1i(samplerLoc, 0);
gl.drawArrays(gl.TRIANGLES, 0, 3);     // Dessine avec l'etat courant
// Oups — si on oublie un bind, on utilise l'etat du draw precedent !
```

En WebGPU, on construit des commandes immutables :

```typescript
// WebGPU : command-based — on enregistre des commandes puis on les soumet
const encoder = device.createCommandEncoder();
const pass = encoder.beginRenderPass(renderPassDescriptor);

pass.setPipeline(pipeline);        // Pipeline pre-compile (immutable)
pass.setVertexBuffer(0, vertexBuffer);
pass.setBindGroup(0, bindGroup);   // Ressources groupees (immutable)
pass.draw(3, 1, 0, 0);
pass.end();

device.queue.submit([encoder.finish()]); // Soumission atomique
// Pas d'etat global residuel — chaque frame part de zero
```

---

## Initialisation WebGPU

### L'arbre d'initialisation

```
navigator.gpu                          // Point d'entree
   |
   +-- requestAdapter(options?)        // Choisir le GPU physique
          |
          +-- requestDevice(descriptor?) // Obtenir l'acces logique
                 |
                 +-- device.queue       // File de commandes
                 +-- device.createBuffer()
                 +-- device.createShaderModule()
                 +-- device.createRenderPipeline()
                 +-- ...
```

### Étape 1 : vérifier le support

```typescript
async function initWebGPU(): Promise<{ device: GPUDevice; context: GPUCanvasContext; format: GPUTextureFormat }> {
  // Verifier que le navigateur supporte WebGPU
  if (!navigator.gpu) {
    throw new Error(
      'WebGPU non supporte. Utilisez Chrome 113+, Firefox 141+, ou Safari 18+.'
    );
  }

  // Demander un adaptateur (represente le GPU physique)
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance', // ou 'low-power' pour economiser la batterie
  });

  if (!adapter) {
    throw new Error(
      'Aucun adaptateur GPU disponible. Verifiez vos drivers.'
    );
  }

  // Afficher les informations de l'adaptateur
  const info = await adapter.requestAdapterInfo();
  console.log('GPU:', info.vendor, info.architecture, info.description);
  console.log('Features:', [...adapter.features]);
  console.log('Limits:', adapter.limits);

  return { adapter } as any; // On continue dans l'etape suivante
}
```

### Étape 2 : demander un device

```typescript
async function requestDeviceFromAdapter(adapter: GPUAdapter): Promise<GPUDevice> {
  // Demander un device logique (acces au GPU)
  const device = await adapter.requestDevice({
    // Optionnel : demander des fonctionnalites specifiques
    requiredFeatures: [],
    // Optionnel : augmenter les limites par defaut
    requiredLimits: {
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
      maxBufferSize: adapter.limits.maxBufferSize,
    },
  });

  // Gerer la perte du device
  device.lost.then((info) => {
    console.error(`GPUDevice perdu : ${info.message}`);
    if (info.reason !== 'destroyed') {
      // Tenter de re-initialiser
      console.log('Tentative de re-initialisation...');
      // initWebGPU(); // Relancer l'initialisation
    }
  });

  return device;
}
```

### Étape 3 : configurer le canvas

```typescript
function configureCanvas(
  canvas: HTMLCanvasElement,
  device: GPUDevice
): { context: GPUCanvasContext; format: GPUTextureFormat } {
  // Obtenir le contexte WebGPU du canvas
  const context = canvas.getContext('webgpu');
  if (!context) {
    throw new Error('Impossible d\'obtenir le contexte WebGPU du canvas');
  }

  // Format prefere pour la surface d'affichage
  const format = navigator.gpu.getPreferredCanvasFormat();
  // Generalement 'bgra8unorm' sur la plupart des systemes

  context.configure({
    device,
    format,
    // Mode de composition avec le reste de la page HTML
    alphaMode: 'premultiplied', // ou 'opaque'
    // Taille du framebuffer (par defaut : taille CSS du canvas * devicePixelRatio)
    // Ne pas specifier pour utiliser la taille par defaut
  });

  return { context, format };
}
```

### Initialisation complete

```typescript
async function initWebGPU(canvas: HTMLCanvasElement) {
  // 1. Verifier le support
  if (!navigator.gpu) {
    throw new Error('WebGPU non supporte');
  }

  // 2. Adaptateur
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance',
  });
  if (!adapter) {
    throw new Error('Pas d\'adaptateur GPU');
  }

  // 3. Device
  const device = await adapter.requestDevice();
  device.lost.then((info) => {
    console.error('Device perdu:', info.message);
  });

  // 4. Canvas
  const context = canvas.getContext('webgpu')!;
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'premultiplied' });

  return { device, context, format };
}
```

> **Analogie avec WebGL** : en WebGL, on faisait `canvas.getContext('webgl2')` et on recevait directement un contexte pret a l'emploi. En WebGPU, l'initialisation est plus explicite : on choisit le GPU, on demandé l'acces, puis on configure le canvas. C'est plus verbeux, mais on controle chaque étape.

---

## WGSL — WebGPU Shading Language

### Pourquoi un nouveau langage ?

| Aspect | GLSL | WGSL |
|--------|------|------|
| Origine | OpenGL (1992) | WebGPU (2021) |
| Syntaxe | C-like | Rust-like |
| Typage | Implicite | Explicite, strict |
| Decorateurs | `layout(location = 0)` | `@location(0)` |
| Point d'entree | `void main()` | `@vertex fn vs_main()` |
| Vecteurs | `vec3`, `vec4` | `vec3f`, `vec4f` (type explicite) |
| Matrices | `mat4` | `mat4x4f` |
| Erreurs de type | Runtime (silencieuses) | Compile-time |
| Commentaires | `//` et `/* */` | `//` et `/* */` |

### Types de base WGSL

```wgsl
// Scalaires
var a: f32 = 3.14;      // Flottant 32 bits
var b: f16 = 1.0h;      // Flottant 16 bits (necessite feature)
var c: i32 = -42;        // Entier signe 32 bits
var d: u32 = 42u;        // Entier non-signe 32 bits
var e: bool = true;      // Booleen

// Vecteurs — le suffixe indique le type des composantes
var v2: vec2f = vec2f(1.0, 2.0);          // 2 composantes f32
var v3: vec3f = vec3f(1.0, 2.0, 3.0);     // 3 composantes f32
var v4: vec4f = vec4f(1.0, 2.0, 3.0, 1.0); // 4 composantes f32
var vi: vec3i = vec3i(1, 2, 3);           // 3 composantes i32
var vu: vec2u = vec2u(10u, 20u);          // 2 composantes u32

// Acces aux composantes
var x = v4.x;       // Premiere composante
var yz = v4.yz;     // Swizzle : vec2f
var rgb = v4.rgb;   // Swizzle : vec3f
var rrr = v4.rrr;   // Swizzle repetition : vec3f

// Matrices — lignes x colonnes
var m: mat4x4f = mat4x4f(
  1.0, 0.0, 0.0, 0.0,
  0.0, 1.0, 0.0, 0.0,
  0.0, 0.0, 1.0, 0.0,
  0.0, 0.0, 0.0, 1.0
);
var m3: mat3x3f = mat3x3f(); // Matrice 3x3 de f32

// Tableaux
var arr: array<f32, 4> = array<f32, 4>(1.0, 2.0, 3.0, 4.0);
// Tableau de taille dynamique (uniquement dans storage buffers)
// var dyn: array<f32>;
```

### Structures

```wgsl
// Definition d'une structure
struct VertexInput {
  @location(0) position: vec3f,
  @location(1) color: vec3f,
  @location(2) uv: vec2f,
}

struct VertexOutput {
  @builtin(position) position: vec4f,  // Position clip-space (obligatoire)
  @location(0) color: vec3f,           // Interpolee vers le fragment
  @location(1) uv: vec2f,             // Coordonnees texture
}

// Uniform buffer (donnees partagees, lecture seule dans le shader)
struct Uniforms {
  model: mat4x4f,
  view: mat4x4f,
  projection: mat4x4f,
  time: f32,
}
```

### Decorateurs WGSL

```wgsl
// --- Decorateurs de pipeline ---
@vertex       // Point d'entree du vertex shader
@fragment     // Point d'entree du fragment shader
@compute      // Point d'entree du compute shader

// --- Decorateurs de variables ---
@builtin(position)        // Position clip-space en sortie du vertex shader
@builtin(vertex_index)    // Index du vertex courant (0, 1, 2, ...)
@builtin(instance_index)  // Index de l'instance courante
@builtin(front_facing)    // true si le triangle est face a la camera

@location(0)              // Emplacement d'entree/sortie inter-stages
@location(1)              // Chaque variable interpolee a un numero unique

// --- Decorateurs de binding ---
@group(0) @binding(0)     // Groupe 0, binding 0 (uniform buffer, texture, etc.)
@group(0) @binding(1)     // Groupe 0, binding 1
@group(1) @binding(0)     // Groupe 1, binding 0

// --- Decorateurs de compute ---
@workgroup_size(64)       // Taille du workgroup en 1D
@workgroup_size(8, 8)     // Taille en 2D (64 invocations)
@workgroup_size(4, 4, 4)  // Taille en 3D (64 invocations)
```

### Fonctions et flux de controle

```wgsl
// Fonction ordinaire
fn add(a: f32, b: f32) -> f32 {
  return a + b;
}

// Conditions
fn clamp_color(c: f32) -> f32 {
  if c < 0.0 {
    return 0.0;
  } else if c > 1.0 {
    return 1.0;
  }
  return c;
}

// Boucles
fn sum_array(data: array<f32, 4>) -> f32 {
  var total: f32 = 0.0;
  for (var i: u32 = 0u; i < 4u; i++) {
    total += data[i];
  }
  return total;
}

// Switch
fn get_channel(color: vec4f, channel: u32) -> f32 {
  switch channel {
    case 0u: { return color.r; }
    case 1u: { return color.g; }
    case 2u: { return color.b; }
    case 3u: { return color.a; }
    default: { return 0.0; }
  }
}
```

### Variables et espaces d'adresse

```wgsl
// var : variable mutable
var x: f32 = 0.0;
x = 1.0; // OK

// let : constante (immutable apres initialisation)
let pi: f32 = 3.14159;
// pi = 3.0; // ERREUR : let est immutable

// const : constante compile-time (connue a la compilation)
const MAX_LIGHTS: u32 = 8u;

// Espaces d'adresse (ou la variable vit en memoire)
// uniform   : lecture seule, optimise pour des donnees partagees
// storage   : lecture/ecriture, grandes quantites de donnees
// private   : par invocation (comme une variable locale globale)
// workgroup : partage entre invocations d'un workgroup (compute)
// function  : variables locales (defaut)

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> data_in: array<f32>;
@group(0) @binding(2) var<storage, read_write> data_out: array<f32>;
```

---

## Vertex shader WGSL

### Structure de base

```wgsl
// vertex-shader.wgsl

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec3f,
}

@vertex
fn vs_main(
  @location(0) position: vec3f,
  @location(1) color: vec3f,
) -> VertexOutput {
  var output: VertexOutput;
  output.position = vec4f(position, 1.0);
  output.color = color;
  return output;
}
```

### Avec uniforms (MVP)

```wgsl
struct Uniforms {
  model: mat4x4f,
  view: mat4x4f,
  projection: mat4x4f,
}

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VertexOutput {
  @builtin(position) clip_position: vec4f,
  @location(0) world_position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
}

@vertex
fn vs_main(
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
) -> VertexOutput {
  var out: VertexOutput;

  let world_pos = u.model * vec4f(position, 1.0);
  out.world_position = world_pos.xyz;
  out.clip_position = u.projection * u.view * world_pos;

  // Transformer la normale avec la matrice normale (transpose inverse du model 3x3)
  let normal_matrix = mat3x3f(
    u.model[0].xyz,
    u.model[1].xyz,
    u.model[2].xyz
  );
  out.normal = normalize(normal_matrix * normal);

  out.uv = uv;
  return out;
}
```

### Sans vertex buffer (fullscreen triangle)

```wgsl
// Technique utile pour le post-processing : generer un triangle couvrant tout l'ecran
// sans aucun vertex buffer

@vertex
fn vs_fullscreen(@builtin(vertex_index) vertex_index: u32) -> @builtin(position) vec4f {
  // Genere un triangle qui couvre tout le clip space [-1, 1]
  // vertex 0: (-1, -1)  vertex 1: (3, -1)  vertex 2: (-1, 3)
  let x = f32(i32(vertex_index) / 2) * 4.0 - 1.0;
  let y = f32(i32(vertex_index) % 2) * 4.0 - 1.0;
  return vec4f(x, y, 0.0, 1.0);
}
```

---

## Fragment shader WGSL

### Structure de base

```wgsl
// Le fragment shader recoit les valeurs interpolees du vertex shader

@fragment
fn fs_main(
  @location(0) color: vec3f,
) -> @location(0) vec4f {
  return vec4f(color, 1.0); // RGBA
}
```

### Avec texture

```wgsl
@group(0) @binding(1) var t_diffuse: texture_2d<f32>;
@group(0) @binding(2) var s_diffuse: sampler;

@fragment
fn fs_textured(
  @location(0) uv: vec2f,
) -> @location(0) vec4f {
  return textureSample(t_diffuse, s_diffuse, uv);
}
```

### Avec eclairage Phong

```wgsl
struct LightUniforms {
  light_position: vec3f,
  light_color: vec3f,
  camera_position: vec3f,
  ambient_strength: f32,
  specular_strength: f32,
  shininess: f32,
}

@group(1) @binding(0) var<uniform> light: LightUniforms;

@fragment
fn fs_phong(
  @location(0) world_position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
) -> @location(0) vec4f {
  let N = normalize(normal);
  let L = normalize(light.light_position - world_position);
  let V = normalize(light.camera_position - world_position);
  let R = reflect(-L, N);

  // Ambient
  let ambient = light.ambient_strength * light.light_color;

  // Diffuse
  let diff = max(dot(N, L), 0.0);
  let diffuse = diff * light.light_color;

  // Specular
  let spec = pow(max(dot(V, R), 0.0), light.shininess);
  let specular = light.specular_strength * spec * light.light_color;

  let base_color = textureSample(t_diffuse, s_diffuse, uv).rgb;
  let result = (ambient + diffuse + specular) * base_color;

  return vec4f(result, 1.0);
}
```

---

## Comparaison GLSL vs WGSL

### Vertex shader cote a cote

```glsl
// === GLSL (WebGL 2) ===
#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUV;

uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProjection;

out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vUV;

void main() {
  vec4 worldPos = uModel * vec4(aPosition, 1.0);
  vWorldPos = worldPos.xyz;
  vNormal = mat3(uModel) * aNormal;
  vUV = aUV;
  gl_Position = uProjection * uView * worldPos;
}
```

```wgsl
// === WGSL (WebGPU) ===
struct Uniforms {
  model: mat4x4f,
  view: mat4x4f,
  projection: mat4x4f,
}
@group(0) @binding(0) var<uniform> u: Uniforms;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) world_pos: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
}

@vertex
fn vs_main(
  @location(0) pos: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
) -> VertexOutput {
  var out: VertexOutput;
  let world_pos = u.model * vec4f(pos, 1.0);
  out.world_pos = world_pos.xyz;
  out.normal = mat3x3f(
    u.model[0].xyz, u.model[1].xyz, u.model[2].xyz
  ) * normal;
  out.uv = uv;
  out.position = u.projection * u.view * world_pos;
  return out;
}
```

### Fragment shader cote a cote

```glsl
// === GLSL ===
#version 300 es
precision highp float;

in vec3 vNormal;
in vec2 vUV;

uniform sampler2D uTexture;

out vec4 fragColor;

void main() {
  vec3 N = normalize(vNormal);
  float light = max(dot(N, vec3(0.0, 1.0, 0.0)), 0.0);
  vec3 color = texture(uTexture, vUV).rgb * (0.3 + 0.7 * light);
  fragColor = vec4(color, 1.0);
}
```

```wgsl
// === WGSL ===
@group(0) @binding(1) var t: texture_2d<f32>;
@group(0) @binding(2) var s: sampler;

@fragment
fn fs_main(
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
) -> @location(0) vec4f {
  let N = normalize(normal);
  let light = max(dot(N, vec3f(0.0, 1.0, 0.0)), 0.0);
  let color = textureSample(t, s, uv).rgb * (0.3 + 0.7 * light);
  return vec4f(color, 1.0);
}
```

### Differences clés

| Concept | GLSL | WGSL |
|---------|------|------|
| Types vecteur | `vec3`, `ivec2` | `vec3f`, `vec2i` |
| Matrices | `mat4` | `mat4x4f` |
| Uniforms | `uniform mat4 uMVP;` | `@group(0) @binding(0) var<uniform>` |
| Textures | `uniform sampler2D tex;` | `var t: texture_2d<f32>;` + `var s: sampler;` |
| Sampling | `texture(tex, uv)` | `textureSample(t, s, uv)` |
| Entree vertex | `in vec3 aPos;` | `@location(0) pos: vec3f` |
| Sortie vertex | `out vec3 vPos;` | `@location(0) pos: vec3f` (dans struct) |
| Position | `gl_Position` | `@builtin(position)` |
| Couleur sortie | `out vec4 fragColor;` | `-> @location(0) vec4f` |
| Point d'entree | `void main()` | `@vertex fn vs_main()` |
| Precision | `precision highp float;` | Pas nécessaire (f32 par defaut) |
| Constructeur | `vec3(1.0, 0.0, 0.0)` | `vec3f(1.0, 0.0, 0.0)` |

---

## Premier triangle WebGPU complet

Voici le code complet pour dessiner un triangle colore avec WebGPU.

### Le shader (triangle.wgsl)

```wgsl
// triangle.wgsl — Vertex et fragment shader pour un triangle colore

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec3f,
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
) -> VertexOutput {
  // Positions du triangle en clip space (-1 a 1)
  var positions = array<vec2f, 3>(
    vec2f( 0.0,  0.5),  // Sommet haut
    vec2f(-0.5, -0.5),  // Sommet bas-gauche
    vec2f( 0.5, -0.5),  // Sommet bas-droit
  );

  // Couleurs par sommet
  var colors = array<vec3f, 3>(
    vec3f(1.0, 0.0, 0.0), // Rouge
    vec3f(0.0, 1.0, 0.0), // Vert
    vec3f(0.0, 0.0, 1.0), // Bleu
  );

  var output: VertexOutput;
  output.position = vec4f(positions[vertex_index], 0.0, 1.0);
  output.color = colors[vertex_index];
  return output;
}

@fragment
fn fs_main(
  @location(0) color: vec3f,
) -> @location(0) vec4f {
  return vec4f(color, 1.0);
}
```

### Le code TypeScript

```typescript
// main.ts — Premier triangle WebGPU

// Shader WGSL (inline ou importe via bundler)
const shaderCode = `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec3f,
}

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VertexOutput {
  var pos = array<vec2f, 3>(
    vec2f( 0.0,  0.5),
    vec2f(-0.5, -0.5),
    vec2f( 0.5, -0.5),
  );
  var col = array<vec3f, 3>(
    vec3f(1.0, 0.0, 0.0),
    vec3f(0.0, 1.0, 0.0),
    vec3f(0.0, 0.0, 1.0),
  );
  var out: VertexOutput;
  out.position = vec4f(pos[vi], 0.0, 1.0);
  out.color = col[vi];
  return out;
}

@fragment
fn fs_main(@location(0) color: vec3f) -> @location(0) vec4f {
  return vec4f(color, 1.0);
}
`;

async function main() {
  // --- 1. Initialisation ---
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  canvas.width = 800;
  canvas.height = 600;

  if (!navigator.gpu) {
    document.body.textContent = 'WebGPU non supporte dans ce navigateur.';
    return;
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    document.body.textContent = 'Pas d\'adaptateur GPU disponible.';
    return;
  }

  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu')!;
  const format = navigator.gpu.getPreferredCanvasFormat();

  context.configure({ device, format, alphaMode: 'premultiplied' });

  // --- 2. Shader module ---
  const shaderModule = device.createShaderModule({
    label: 'Triangle shader',
    code: shaderCode,
  });

  // --- 3. Render pipeline ---
  const pipeline = device.createRenderPipeline({
    label: 'Triangle pipeline',
    layout: 'auto',
    vertex: {
      module: shaderModule,
      entryPoint: 'vs_main',
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fs_main',
      targets: [{ format }],
    },
    primitive: {
      topology: 'triangle-list',
    },
  });

  // --- 4. Boucle de rendu ---
  function render() {
    // Obtenir la texture courante du canvas
    const textureView = context.getCurrentTexture().createView();

    // Creer un command encoder
    const encoder = device.createCommandEncoder({
      label: 'Triangle encoder',
    });

    // Commencer un render pass
    const pass = encoder.beginRenderPass({
      label: 'Triangle render pass',
      colorAttachments: [{
        view: textureView,
        clearValue: { r: 0.1, g: 0.1, b: 0.15, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });

    pass.setPipeline(pipeline);
    pass.draw(3); // 3 vertices
    pass.end();

    // Soumettre les commandes au GPU
    device.queue.submit([encoder.finish()]);

    requestAnimationFrame(render);
  }

  render();
}

main();
```

### Flux d'exécution détaillé

```
1. navigator.gpu.requestAdapter()
   → Choix du GPU physique

2. adapter.requestDevice()
   → Acces logique au GPU (GPUDevice)

3. canvas.getContext('webgpu')
   → Contexte de rendu lie au canvas HTML

4. context.configure({ device, format })
   → Lie le device au canvas

5. device.createShaderModule({ code })
   → Compile le code WGSL → module shader

6. device.createRenderPipeline({ vertex, fragment, ... })
   → Combine vertex + fragment + config → pipeline immutable

7. Par frame :
   a. context.getCurrentTexture().createView()
      → Texture de sortie pour cette frame
   b. device.createCommandEncoder()
      → Enregistreur de commandes
   c. encoder.beginRenderPass({ colorAttachments })
      → Debut du render pass (clear + cible)
   d. pass.setPipeline(pipeline)
      → Quel pipeline utiliser
   e. pass.draw(3)
      → Dessiner 3 vertices
   f. pass.end()
      → Fin du render pass
   g. device.queue.submit([encoder.finish()])
      → Envoyer les commandes au GPU
```

---

## Gestion d'erreurs

### device.lost

```typescript
// Le device peut etre perdu pour plusieurs raisons :
// - Le GPU est debranche (GPU externe)
// - Le driver a plante
// - Le navigateur a tue le contexte (onglet en arriere-plan trop longtemps)
// - L'application a appele device.destroy()

device.lost.then((info: GPUDeviceLostInfo) => {
  console.error(`GPUDevice lost: reason=${info.reason}, message=${info.message}`);

  if (info.reason === 'destroyed') {
    // L'application a volontairement detruit le device
    console.log('Device detruit volontairement');
  } else {
    // Perte involontaire — tenter une re-initialisation
    console.log('Re-initialisation en cours...');
    reinitialize();
  }
});
```

### Error scopes

```typescript
// Les error scopes permettent de capturer les erreurs de validation
// de maniere synchrone (sans callback global)

// Empiler un scope de validation
device.pushErrorScope('validation');

// Effectuer une operation potentiellement invalide
const buffer = device.createBuffer({
  size: 0, // Taille invalide !
  usage: GPUBufferUsage.VERTEX,
});

// Depiler le scope et verifier
const error = await device.popErrorScope();
if (error) {
  console.error('Erreur de validation:', error.message);
}

// Types d'error scope :
// - 'validation' : erreurs de validation (parametres invalides)
// - 'out-of-memory' : plus assez de memoire GPU
// - 'internal' : erreurs internes du driver
```

### Pattern de validation robuste

```typescript
async function createBufferSafe(
  device: GPUDevice,
  descriptor: GPUBufferDescriptor
): Promise<GPUBuffer | null> {
  device.pushErrorScope('validation');
  device.pushErrorScope('out-of-memory');

  const buffer = device.createBuffer(descriptor);

  const oomError = await device.popErrorScope();
  const valError = await device.popErrorScope();

  if (oomError) {
    console.error('Memoire GPU insuffisante:', oomError.message);
    return null;
  }
  if (valError) {
    console.error('Validation echouee:', valError.message);
    return null;
  }

  return buffer;
}
```

### uncapturederror event

```typescript
// Capturer toutes les erreurs non gerees par un error scope
device.addEventListener('uncapturederror', (event) => {
  console.error('Erreur GPU non capturee:', event.error.message);
  // Utile pour le monitoring en production
});
```

---

## Feature detection

### Adapter features et limits

```typescript
async function checkCapabilities(adapter: GPUAdapter) {
  // --- Features disponibles ---
  console.log('Features supportees:');
  for (const feature of adapter.features) {
    console.log(` - ${feature}`);
  }
  // Exemples : 'texture-compression-bc', 'float32-filterable',
  // 'shader-f16', 'timestamp-query', 'depth-clip-control'

  // --- Limites ---
  const limits = adapter.limits;
  console.log('Limites GPU:');
  console.log(` maxTextureDimension2D: ${limits.maxTextureDimension2D}`);
  console.log(` maxBufferSize: ${limits.maxBufferSize}`);
  console.log(` maxStorageBufferBindingSize: ${limits.maxStorageBufferBindingSize}`);
  console.log(` maxComputeWorkgroupSizeX: ${limits.maxComputeWorkgroupSizeX}`);
  console.log(` maxComputeInvocationsPerWorkgroup: ${limits.maxComputeInvocationsPerWorkgroup}`);
  console.log(` maxBindGroups: ${limits.maxBindGroups}`);
  console.log(` maxVertexAttributes: ${limits.maxVertexAttributes}`);

  // --- Demander des features specifiques ---
  const device = await adapter.requestDevice({
    requiredFeatures: adapter.features.has('shader-f16')
      ? ['shader-f16']
      : [],
    requiredLimits: {
      maxStorageBufferBindingSize: Math.min(
        256 * 1024 * 1024, // 256 Mo souhaites
        limits.maxStorageBufferBindingSize // Ne pas depasser le max
      ),
    },
  });

  return device;
}
```

### Detection de WebGPU avec fallback WebGL

```typescript
async function initRenderer(canvas: HTMLCanvasElement) {
  // Tenter WebGPU d'abord
  if (navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        const device = await adapter.requestDevice();
        console.log('Rendu via WebGPU');
        return { type: 'webgpu' as const, device, adapter };
      }
    } catch (e) {
      console.warn('Echec WebGPU:', e);
    }
  }

  // Fallback WebGL 2
  const gl = canvas.getContext('webgl2');
  if (gl) {
    console.log('Fallback : rendu via WebGL 2');
    return { type: 'webgl2' as const, gl };
  }

  // Fallback WebGL 1
  const gl1 = canvas.getContext('webgl');
  if (gl1) {
    console.log('Fallback : rendu via WebGL 1');
    return { type: 'webgl' as const, gl: gl1 };
  }

  throw new Error('Aucune API GPU supportee');
}
```

---

## Differences entre navigateurs

### État du support WebGPU (mars 2026)

| Navigateur | Status | Notes |
|------------|--------|-------|
| Chrome 113+ | Stable | Support complet, référence |
| Edge 113+ | Stable | Même moteur que Chrome (Chromium) |
| Firefox 121+ | Stable (depuis jan 2024) | Support complet, quelques différences mineures |
| Safari 18+ | Stable (macOS/iOS) | Backend Metal, quelques limites |
| Chrome Android | Stable | Support GPU variable selon l'appareil |
| Safari iOS 18+ | Stable | WebGPU via Metal |

### Differences notables

```typescript
// --- Format de canvas ---
// Chrome/Edge (Windows, Linux) : prefere 'bgra8unorm'
// Safari (macOS)               : prefere 'bgra8unorm'
// Firefox                      : peut preferer 'rgba8unorm'
// Toujours utiliser getPreferredCanvasFormat() !
const format = navigator.gpu.getPreferredCanvasFormat();

// --- Limites variables ---
// Les limites dependent du GPU et du navigateur.
// Exemples de variations courantes :
//   maxTextureDimension2D : 8192 (mobile) → 16384 (desktop)
//   maxStorageBufferBindingSize : 128Mo (integre) → 2Go (GPU dedie)
//   maxComputeInvocationsPerWorkgroup : 256 → 1024

// --- Features optionnelles ---
// 'shader-f16'               : Chrome, pas encore Safari
// 'timestamp-query'          : Chrome, pas encore Safari
// 'texture-compression-bc'   : Desktop (DXT/BC), pas mobile
// 'texture-compression-astc' : Mobile (ASTC), pas desktop Intel
// 'texture-compression-etc2' : Mobile (ETC2)

// --- Bonnes pratiques cross-browser ---
// 1. Toujours verifier navigator.gpu avant d'utiliser WebGPU
// 2. Toujours verifier adapter !== null
// 3. Ne pas supposer des features — les verifier
// 4. Utiliser getPreferredCanvasFormat() pour le format du canvas
// 5. Respecter les limites retournees par adapter.limits
// 6. Tester sur au moins Chrome + Safari pour couvrir les backends Vulkan et Metal
```

### Pattern de detection progressive

```typescript
interface GPUCapabilities {
  hasWebGPU: boolean;
  hasFloat16: boolean;
  hasTimestampQuery: boolean;
  hasCompressedTextures: 'bc' | 'astc' | 'etc2' | null;
  maxTextureSize: number;
  maxBufferSize: number;
}

async function detectCapabilities(): Promise<GPUCapabilities> {
  if (!navigator.gpu) {
    return {
      hasWebGPU: false,
      hasFloat16: false,
      hasTimestampQuery: false,
      hasCompressedTextures: null,
      maxTextureSize: 0,
      maxBufferSize: 0,
    };
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    return {
      hasWebGPU: false,
      hasFloat16: false,
      hasTimestampQuery: false,
      hasCompressedTextures: null,
      maxTextureSize: 0,
      maxBufferSize: 0,
    };
  }

  const features = adapter.features;
  let compressedFormat: 'bc' | 'astc' | 'etc2' | null = null;
  if (features.has('texture-compression-bc')) compressedFormat = 'bc';
  else if (features.has('texture-compression-astc')) compressedFormat = 'astc';
  else if (features.has('texture-compression-etc2')) compressedFormat = 'etc2';

  return {
    hasWebGPU: true,
    hasFloat16: features.has('shader-f16'),
    hasTimestampQuery: features.has('timestamp-query'),
    hasCompressedTextures: compressedFormat,
    maxTextureSize: adapter.limits.maxTextureDimension2D,
    maxBufferSize: adapter.limits.maxBufferSize,
  };
}
```

---

## Outils de debugging WebGPU

### Chrome DevTools — WebGPU Inspector

Chrome 121+ inclut un panneau **WebGPU** dans les DevTools :

- **Adapter Info** : GPU détecté, limites, features supportees
- **Buffer/Texture Inspector** : visualisation du contenu des buffers et textures
- **Shader Editor** : edition live des shaders WGSL avec recompilation a chaud
- **Command Timeline** : sequence des command buffers soumis au GPU

> Activez `chrome://flags/#enable-webgpu-developer-features` pour des messages d'erreur plus détaillés.

### Validation layers

WebGPU inclut des **validation layers** activees par defaut en développement. Elles detectent :
- Bindings manquants ou incompatibles
- Depassement de limites (buffer size, texture dimensions)
- Etats de pipeline invalides
- Erreurs de synchronisation

```typescript
// Capturer les erreurs GPU de maniere programmatique
device.pushErrorScope('validation');

// ... operations GPU ...

device.popErrorScope().then((error) => {
  if (error) {
    console.error('GPU Validation Error:', error.message);
  }
});

// Erreur de type out-of-memory
device.pushErrorScope('out-of-memory');
const hugeBuffer = device.createBuffer({
  size: Number.MAX_SAFE_INTEGER,
  usage: GPUBufferUsage.STORAGE,
});
device.popErrorScope().then((error) => {
  if (error) console.error('OOM:', error.message);
});
```

### Outils tiers

| Outil | Usage |
|-------|-------|
| **[webgpu-debugger](https://github.com/pissang/webgpu-devtools)** | Extension Chrome, capture de frames GPU |
| **RenderDoc** | Capture de frames avancee (via Dawn/native) |
| **Chrome DevTools WebGPU Inspector** | Intégré Chrome DevTools (onglet GPU), recommandé en 2025+ |
| **Tint (Dawn)** | Compilateur WGSL → SPIR-V/MSL/HLSL, utile pour diagnostiquer les erreurs shader |

### Bonnes pratiques debug

1. **Labels partout** : nommez vos ressources pour des messages d'erreur lisibles
```typescript
const buffer = device.createBuffer({
  label: 'vertex-buffer-mesh-player',
  size: vertices.byteLength,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});
```

2. **device.lost** : gerez la perte du device GPU
```typescript
device.lost.then((info) => {
  console.error(`GPU device lost: ${info.reason}`, info.message);
  if (info.reason !== 'destroyed') {
    // Tenter de recreer le device
    initWebGPU();
  }
});
```

3. **Performance timestamps** : mesurez le temps GPU
```typescript
// Verifiez que le feature est supporte
if (adapter.features.has('timestamp-query')) {
  const device = await adapter.requestDevice({
    requiredFeatures: ['timestamp-query'],
  });
  const querySet = device.createQuerySet({
    type: 'timestamp',
    count: 2,
  });
  // Utilisez dans un render/compute pass
}
```

---

## Exercice pratique

Creez un programme WebGPU qui :

1. Initialise le device et configure le canvas
2. Dessine un carre (deux triangles) avec des couleurs différentes par sommet
3. Utilise un vertex buffer (pas les donnees en dur dans le shader)
4. Anime le carre en faisant varier la couleur via un uniform `time`

Indications :
- Definissez 4 vertices avec position (vec2f) et couleur (vec3f)
- Utilisez un index buffer pour les 6 indices (2 triangles)
- Creez un uniform buffer pour le temps
- Mettez a jour le temps chaque frame avec `device.queue.writeBuffer`

<details>
<summary>Solution</summary>

```wgsl
// square.wgsl
struct Uniforms {
  time: f32,
}

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VertexInput {
  @location(0) position: vec2f,
  @location(1) color: vec3f,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec3f,
}

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  out.position = vec4f(in.position, 0.0, 1.0);
  // Moduler la couleur avec le temps
  let t = sin(u.time) * 0.5 + 0.5;
  out.color = mix(in.color, vec3f(1.0) - in.color, t);
  return out;
}

@fragment
fn fs_main(@location(0) color: vec3f) -> @location(0) vec4f {
  return vec4f(color, 1.0);
}
```

```typescript
// main.ts
async function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  if (!navigator.gpu) return;

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return;
  const device = await adapter.requestDevice();

  const context = canvas.getContext('webgpu')!;
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'premultiplied' });

  // Vertices : position (x, y) + color (r, g, b)
  const vertices = new Float32Array([
    // pos         color
    -0.5,  0.5,   1.0, 0.0, 0.0, // haut-gauche (rouge)
     0.5,  0.5,   0.0, 1.0, 0.0, // haut-droit  (vert)
    -0.5, -0.5,   0.0, 0.0, 1.0, // bas-gauche  (bleu)
     0.5, -0.5,   1.0, 1.0, 0.0, // bas-droit   (jaune)
  ]);

  const vertexBuffer = device.createBuffer({
    label: 'Vertex buffer',
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, vertices);

  // Indices (2 triangles)
  const indices = new Uint16Array([0, 1, 2, 1, 3, 2]);
  const indexBuffer = device.createBuffer({
    label: 'Index buffer',
    size: indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, indices);

  // Uniform buffer (time)
  const uniformBuffer = device.createBuffer({
    label: 'Uniform buffer',
    size: 4, // 1 f32
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const shaderModule = device.createShaderModule({ code: shaderCode });

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: shaderModule,
      entryPoint: 'vs_main',
      buffers: [{
        arrayStride: 5 * 4, // 5 floats * 4 bytes
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x2' },  // position
          { shaderLocation: 1, offset: 8, format: 'float32x3' },  // color
        ],
      }],
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fs_main',
      targets: [{ format }],
    },
    primitive: { topology: 'triangle-list' },
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{
      binding: 0,
      resource: { buffer: uniformBuffer },
    }],
  });

  const startTime = performance.now();

  function render() {
    const time = (performance.now() - startTime) / 1000;
    device.queue.writeBuffer(uniformBuffer, 0, new Float32Array([time]));

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0.1, g: 0.1, b: 0.15, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint16');
    pass.drawIndexed(6); // 6 indices
    pass.end();

    device.queue.submit([encoder.finish()]);
    requestAnimationFrame(render);
  }

  render();
}

main();
```

</details>

---

## Résumé

| Concept | Description |
|---------|-------------|
| `navigator.gpu` | Point d'entree de l'API WebGPU |
| `GPUAdapter` | Represente le GPU physique, expose features et limits |
| `GPUDevice` | Acces logique au GPU, créé les ressources |
| `GPUQueue` | File de commandes (`device.queue`) |
| `GPUCommandEncoder` | Enregistre des commandes a soumettre |
| `GPUCanvasContext` | Lie le rendu WebGPU au canvas HTML |
| `GPUShaderModule` | Code WGSL compile |
| `GPURenderPipeline` | Combine vertex + fragment + config (immutable) |
| WGSL `@vertex` | Decorateur de point d'entree vertex shader |
| WGSL `@fragment` | Decorateur de point d'entree fragment shader |
| WGSL `@builtin(position)` | Position clip-space en sortie du vertex shader |
| WGSL `@location(N)` | Emplacement d'entree/sortie inter-stages |
| WGSL `@group(G) @binding(B)` | Référence à un binding dans un bind group |
| WGSL `var<uniform>` | Variable uniforme (lecture seule) |
| WGSL `vec4f`, `mat4x4f` | Types vecteur et matrice avec suffixe de type |
| `device.lost` | Promise resolue quand le device est perdu |
| `pushErrorScope` / `popErrorScope` | Capture d'erreurs de validation |
| State machine vs Command-based | WebGL mute un état global, WebGPU enregistre des commandes |

---

## Navigation

| Précédent | Suivant |
|-----------|---------|
| [08 - Scene WebGL complete](./08-scene-webgl-complete) | [10 - Render pipeline et bind groups](./10-render-pipeline-bind-groups) |

---

## Ressources

- [Quiz 09 : Testez vos connaissances](../quizzes/quiz-09-webgpu.html)
- [Lab 09 : WebGPU architecture](../labs/lab-09-webgpu-architecture/)
- [WebGPU Specification (W3C)](https://www.w3.org/TR/webgpu/)
- [WGSL Specification (W3C)](https://www.w3.org/TR/WGSL/)
- [WebGPU Fundamentals](https://webgpufundamentals.org/)
- [Google Chrome — WebGPU](https://developer.chrome.com/docs/web-platform/webgpu)
- [Your first WebGPU app (Google Codelab)](https://codelabs.developers.google.com/your-first-webgpu-app)

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 09 webgpu](../screencasts/screencast-09-webgpu.md)
2. **Lab** : [lab-09-webgpu-fondamentaux](../labs/lab-09-webgpu-fondamentaux/README)
3. **Visualisation** : [GPU Pipeline](../visualizations/gpu-pipeline.html)
4. **Quiz** : [quiz 09 webgpu](../quizzes/quiz-09-webgpu.html)
:::
