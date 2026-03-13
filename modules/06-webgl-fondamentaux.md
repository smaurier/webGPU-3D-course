# Module 06 — WebGL fondamentaux et GLSL

| Difficulte | Duree estimee | Lab | Quiz |
|------------|---------------|-----|------|
| 3/5        | 90 min        | [Lab 06](../labs/lab-06-webgl-fondamentaux/) | [Quiz 06](../quizzes/quiz-06-webgl-fondamentaux.html) |

## Objectifs pedagogiques

A la fin de ce module, vous serez capable de :

- Obtenir un contexte WebGL 2 depuis un canvas HTML
- Decrire le pipeline WebGL : vertex shader → rasterizer → fragment shader
- Ecrire des shaders minimaux en GLSL ES 3.00
- Compiler et linker un shader program en TypeScript
- Dessiner un premier triangle en clip space
- Configurer viewport, clear color, depth test et face culling
- Utiliser le systeme d'extensions WebGL
- Debugger les erreurs WebGL avec `gl.getError()` et les info logs

---

<details>
<summary>Rappel du module precedent — Lumiere, materiaux et PBR</summary>

Avant de plonger dans WebGL, verifie que tu maitrises ces concepts :

1. **Quels sont les 3 composants du modele Phong ?**
   Ambient + Diffuse (Lambert : `max(dot(N, L), 0)`) + Speculaire (`pow(max(dot(R, V), 0), shininess)`)

2. **Qu'est-ce que le PBR ?**
   Physically Based Rendering — un modele d'eclairage base sur la physique reelle (metalness, roughness, conservation d'energie).

3. **Pourquoi normalise-t-on les vecteurs avant un dot product ?**
   Parce que `dot(A, B) = |A| * |B| * cos(theta)`. Si les vecteurs ne sont pas unitaires, le resultat n'est pas le cosinus pur de l'angle.

</details>

---

## 1. Analogie — WebGL comme une chaine de montage

Si tu connais le developpement web avec Vue ou React, pense a WebGL comme une **chaine de montage industrielle** :

```
DEVELOPPEMENT WEB (Vue/React)           WEBGL
=============================           =====

Template HTML                           Vertex data (positions, UV, normales)
  → compile en Virtual DOM                → passe dans le Vertex Shader

Virtual DOM                             Vertices transformes en clip space
  → diff + patch                          → Rasterizer decoupe en fragments (pixels)

CSS + computed styles                   Fragment Shader
  → calcule la couleur de chaque pixel    → calcule la couleur de chaque fragment

DOM final affiche                       Framebuffer final affiche
```

En web classique, le navigateur gere tout le pipeline de rendu. En WebGL, **tu programmes chaque etape toi-meme** : comment transformer les sommets, comment colorer chaque pixel.

:::tip Analogie cle
Le **Vertex Shader** est comme une fonction `map()` sur un tableau : il transforme chaque sommet individuellement. Le **Fragment Shader** est comme un filtre CSS applique pixel par pixel.
:::

---

## 2. Obtenir un contexte WebGL 2

### 2.1 Le canvas HTML

WebGL dessine dans un element `<canvas>`. Le canvas est juste un rectangle de pixels — c'est WebGL qui donne les instructions pour le remplir.

```html
<!-- index.html -->
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Premier triangle WebGL</title>
  <style>
    body { margin: 0; background: #111; }
    canvas { display: block; width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <canvas id="gl-canvas"></canvas>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

### 2.2 Recuperer le contexte WebGL 2

```typescript
// main.ts — Initialisation du contexte WebGL 2

function initWebGL(): WebGL2RenderingContext {
  const canvas = document.getElementById('gl-canvas') as HTMLCanvasElement | null;

  if (!canvas) {
    throw new Error('Element canvas #gl-canvas introuvable dans le DOM');
  }

  // Ajuster la resolution du canvas a la taille CSS
  // Sans ca, le canvas aura une resolution par defaut de 300x150
  canvas.width = canvas.clientWidth * window.devicePixelRatio;
  canvas.height = canvas.clientHeight * window.devicePixelRatio;

  // Demander un contexte WebGL 2
  const gl = canvas.getContext('webgl2', {
    alpha: false,           // pas de transparence sur le canvas
    antialias: true,        // lisser les bords (MSAA)
    depth: true,            // buffer de profondeur (z-buffer)
    stencil: false,         // pas de stencil pour l'instant
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,  // plus performant
  });

  if (!gl) {
    throw new Error(
      'WebGL 2 non supporte. Verifiez que votre navigateur est a jour.'
    );
  }

  return gl;
}
```

### 2.3 WebGL 1 vs WebGL 2

| Fonctionnalite | WebGL 1 | WebGL 2 |
|----------------|---------|---------|
| GLSL version | ES 1.00 | ES 3.00 |
| Vertex Array Objects | Extension | Natif |
| Instanced rendering | Extension | Natif |
| 3D textures | Non | Oui |
| Multiple Render Targets | Extension | Natif |
| Integer textures | Non | Oui |
| Transform feedback | Non | Oui |
| Support navigateurs (2024) | ~97% | ~95% |

:::warning Toujours WebGL 2
En 2024+, il n'y a plus de raison d'utiliser WebGL 1 sauf si vous ciblez de tres vieux appareils. Ce cours utilise exclusivement WebGL 2.
:::

---

## 3. Le pipeline WebGL

Le pipeline WebGL est la sequence d'operations qui transforme des donnees brutes (positions 3D) en pixels affiches a l'ecran.

```
DONNEES CPU (JavaScript)                 GPU (pipeline graphique)
========================                 ========================

Vertex Buffer (positions,        ┌─────────────────────┐
normales, UV, couleurs)  ───────►│   VERTEX SHADER     │
                                 │                     │
                                 │ Transforme chaque   │
                                 │ sommet :            │
                                 │ position monde →    │
                                 │ clip space          │
                                 └─────────┬───────────┘
                                           │
                                           ▼
                                 ┌─────────────────────┐
                                 │ ASSEMBLAGE PRIMITIVES│
                                 │                     │
                                 │ Regroupe les sommets │
                                 │ en triangles, lignes │
                                 │ ou points            │
                                 └─────────┬───────────┘
                                           │
                                           ▼
                                 ┌─────────────────────┐
                                 │   RASTERISATION     │
                                 │                     │
                                 │ Decoupe chaque      │
                                 │ triangle en          │
                                 │ fragments (pixels    │
                                 │ potentiels)          │
                                 └─────────┬───────────┘
                                           │
                                           ▼
                                 ┌─────────────────────┐
                                 │  FRAGMENT SHADER    │
                                 │                     │
                                 │ Calcule la couleur  │
                                 │ de chaque fragment   │
                                 │ (eclairage, texture) │
                                 └─────────┬───────────┘
                                           │
                                           ▼
                                 ┌─────────────────────┐
                                 │ TESTS & BLENDING    │
                                 │                     │
                                 │ Depth test, stencil, │
                                 │ alpha blending       │
                                 └─────────┬───────────┘
                                           │
                                           ▼
                                 ┌─────────────────────┐
                                 │   FRAMEBUFFER       │
                                 │                     │
                                 │ Image finale         │
                                 │ affichee a l'ecran   │
                                 └─────────────────────┘
```

Les deux etapes **programmables** sont le Vertex Shader et le Fragment Shader. Tout le reste est gere automatiquement par le GPU (etapes "fixes").

---

## 4. GLSL ES 3.00 — le langage des shaders

GLSL (OpenGL Shading Language) est un langage de type C qui s'execute directement sur le GPU. Chaque invocation d'un shader traite **un seul sommet** (vertex shader) ou **un seul fragment** (fragment shader), mais le GPU en execute des millions en parallele.

### 4.1 Types fondamentaux

```glsl
// Types scalaires
bool  flag   = true;
int   count  = 42;
uint  index  = 7u;
float value  = 3.14;

// Types vecteurs — 2, 3 ou 4 composantes
vec2  uv       = vec2(0.5, 0.5);          // 2 floats (u, v)
vec3  position = vec3(1.0, 2.0, 3.0);     // 3 floats (x, y, z)
vec4  color    = vec4(1.0, 0.0, 0.0, 1.0); // 4 floats (r, g, b, a)

// Acces aux composantes — 3 notations equivalentes
color.r;  color.x;  color.s;   // premiere composante
color.g;  color.y;  color.t;   // deuxieme composante
color.b;  color.z;  color.p;   // troisieme composante
color.a;  color.w;  color.q;   // quatrieme composante

// Swizzling — reorganiser les composantes
vec3 bgr = color.bgr;           // inverse les canaux
vec2 xy  = position.xy;         // extraire les 2 premieres composantes
vec4 dup = position.xxyy;       // dupliquer des composantes

// Types matrices
mat2  m2;   // matrice 2x2
mat3  m3;   // matrice 3x3
mat4  m4;   // matrice 4x4 — la plus utilisee (transformations 3D)

// Types textures
sampler2D    tex2d;    // texture 2D classique
samplerCube  texCube;  // cubemap (6 faces)
sampler3D    tex3d;    // texture 3D (volume)
```

### 4.2 Precision qualifiers

En GLSL ES, on doit declarer la precision par defaut pour les types flottants :

```glsl
#version 300 es

// Obligatoire dans le fragment shader
precision highp float;   // haute precision (32 bits)
// precision mediump float; // precision moyenne (16 bits) — mobile
// precision lowp float;    // basse precision (8-10 bits) — rarement utilise

// Dans le vertex shader, highp est le defaut pour float
// Dans le fragment shader, il n'y a PAS de defaut → on DOIT le specifier
```

| Precision | Bits | Plage float | Usage typique |
|-----------|------|-------------|---------------|
| `highp`   | 32   | +-3.4e38    | Positions, matrices, calculs precis |
| `mediump` | 16   | +-6.5e4     | UV, couleurs, mobile |
| `lowp`    | 8-10 | +-2.0       | Booleens, flags |

### 4.3 Qualificateurs de variables

```glsl
#version 300 es

// --- VERTEX SHADER ---

// Entree : donnees venant du vertex buffer (une par sommet)
in vec3 a_position;    // "in" remplace l'ancien "attribute" de GLSL 1.00
in vec3 a_normal;
in vec2 a_texCoord;

// Sortie : interpolee et envoyee au fragment shader
out vec3 v_normal;     // "out" remplace l'ancien "varying"
out vec2 v_texCoord;

// Uniforms : constantes pour TOUT le draw call (meme valeur pour tous les sommets)
uniform mat4 u_modelViewProjection;
uniform mat4 u_model;

void main() {
  gl_Position = u_modelViewProjection * vec4(a_position, 1.0);
  v_normal = mat3(u_model) * a_normal;
  v_texCoord = a_texCoord;
}
```

```glsl
#version 300 es
precision highp float;

// --- FRAGMENT SHADER ---

// Entree : valeurs interpolees depuis le vertex shader
in vec3 v_normal;
in vec2 v_texCoord;

// Sortie : couleur du fragment
out vec4 fragColor;    // en GLSL 3.00, on declare explicitement la sortie

// Uniforms et textures
uniform sampler2D u_texture;
uniform vec3 u_lightDir;

void main() {
  vec3 normal = normalize(v_normal);
  float diffuse = max(dot(normal, u_lightDir), 0.0);
  vec4 texColor = texture(u_texture, v_texCoord);
  fragColor = texColor * (0.2 + 0.8 * diffuse);
}
```

---

## 5. Compiler et linker un shader program

### 5.1 Le processus en 3 etapes

```
Source GLSL (string)
       │
       ▼
┌──────────────────┐
│ gl.createShader   │ → cree un objet shader vide (VERTEX ou FRAGMENT)
│ gl.shaderSource   │ → attache le code source GLSL
│ gl.compileShader  │ → compile le GLSL en binaire GPU
│ gl.getShaderInfoLog │ → verifie les erreurs de compilation
└────────┬─────────┘
         │ x2 (vertex + fragment)
         ▼
┌──────────────────┐
│ gl.createProgram  │ → cree un programme shader vide
│ gl.attachShader   │ → attache vertex + fragment compiles
│ gl.linkProgram    │ → lie les deux en un pipeline complet
│ gl.getProgramInfoLog │ → verifie les erreurs de linkage
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ gl.useProgram     │ → active ce programme pour les prochains draw calls
└──────────────────┘
```

### 5.2 Implementation TypeScript

```typescript
// shader-utils.ts — Utilitaires de compilation shader

/**
 * Compile un shader GLSL et retourne l'objet shader.
 * Lance une erreur avec le log de compilation si la compilation echoue.
 */
function compileShader(
  gl: WebGL2RenderingContext,
  type: GLenum,         // gl.VERTEX_SHADER ou gl.FRAGMENT_SHADER
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error(`Impossible de creer un shader de type ${type}`);
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  // Verifier la compilation
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    const typeName = type === gl.VERTEX_SHADER ? 'VERTEX' : 'FRAGMENT';
    throw new Error(`Erreur compilation ${typeName} shader:\n${info}`);
  }

  return shader;
}

/**
 * Cree un programme shader a partir des sources vertex et fragment.
 */
function createShaderProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

  const program = gl.createProgram();
  if (!program) {
    throw new Error('Impossible de creer le programme shader');
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  // Verifier le linkage
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error(`Erreur linkage programme shader:\n${info}`);
  }

  // Les shaders individuels peuvent etre supprimes apres le linkage
  // (le programme garde sa propre copie)
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  return program;
}
```

### 5.3 Pattern TypeScript : wrapper type-safe

```typescript
// shader-program.ts — Classe wrapper pour un programme shader

interface ShaderProgramInfo {
  program: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation>;
  attributes: Map<string, number>;
}

/**
 * Cree un ShaderProgramInfo qui pre-recupere toutes les locations
 * d'uniforms et d'attributes.
 */
function createProgramInfo(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
  uniformNames: string[],
  attributeNames: string[],
): ShaderProgramInfo {
  const program = createShaderProgram(gl, vertexSource, fragmentSource);

  // Pre-recuperer les uniform locations
  const uniforms = new Map<string, WebGLUniformLocation>();
  for (const name of uniformNames) {
    const loc = gl.getUniformLocation(program, name);
    if (loc === null) {
      console.warn(`Uniform "${name}" introuvable (peut-etre optimise par le compilateur)`);
      continue;
    }
    uniforms.set(name, loc);
  }

  // Pre-recuperer les attribute locations
  const attributes = new Map<string, number>();
  for (const name of attributeNames) {
    const loc = gl.getAttribLocation(program, name);
    if (loc === -1) {
      console.warn(`Attribute "${name}" introuvable`);
      continue;
    }
    attributes.set(name, loc);
  }

  return { program, uniforms, attributes };
}

// Utilisation :
// const info = createProgramInfo(gl, vsSrc, fsSrc,
//   ['u_modelViewProjection', 'u_color'],
//   ['a_position']
// );
// gl.useProgram(info.program);
// gl.uniformMatrix4fv(info.uniforms.get('u_modelViewProjection')!, false, mvp);
```

---

## 6. Premier triangle — de A a Z

### 6.1 Les shaders minimaux

```typescript
// main.ts — Premier triangle WebGL 2

const VERTEX_SHADER_SOURCE = `#version 300 es

// Entree : position de chaque sommet en clip space (-1 a +1)
in vec2 a_position;

void main() {
  // gl_Position est la sortie obligatoire du vertex shader
  // C'est la position du sommet en clip space (x, y, z, w)
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

// Sortie : couleur du fragment (RGBA)
out vec4 fragColor;

void main() {
  // Rouge pur, totalement opaque
  fragColor = vec4(1.0, 0.0, 0.0, 1.0);
}
`;
```

### 6.2 Le clip space

Le clip space est le systeme de coordonnees dans lequel le vertex shader doit exprimer les positions :

```
Clip Space (Normalized Device Coordinates apres division par w) :

        +Y (1.0)
          │
          │
(-1,+1)───┼───(+1,+1)
          │
          │
──────────┼──────────── +X (1.0)
          │
          │
(-1,-1)───┼───(+1,-1)
          │
        -Y (-1.0)

L'ecran entier tient dans le carre [-1, +1] x [-1, +1]
Z va de -1 (proche) a +1 (loin) en WebGL (convention OpenGL)
```

### 6.3 Les donnees du triangle

```typescript
// Les 3 sommets du triangle, en clip space
// Chaque sommet = 2 floats (x, y)
const positions = new Float32Array([
   0.0,  0.5,   // sommet haut (centre-haut)
  -0.5, -0.5,   // sommet bas-gauche
   0.5, -0.5,   // sommet bas-droit
]);
```

### 6.4 Envoyer les donnees au GPU

```typescript
function setupTriangle(gl: WebGL2RenderingContext, program: WebGLProgram): WebGLVertexArrayObject {
  // 1. Creer un Vertex Array Object (VAO) — stocke la configuration des attributs
  const vao = gl.createVertexArray();
  if (!vao) throw new Error('Impossible de creer le VAO');
  gl.bindVertexArray(vao);

  // 2. Creer un Vertex Buffer Object (VBO) — stocke les donnees sur le GPU
  const vbo = gl.createBuffer();
  if (!vbo) throw new Error('Impossible de creer le VBO');
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);

  // 3. Envoyer les donnees du CPU vers le GPU
  // STATIC_DRAW = les donnees ne changeront pas (optimisation GPU)
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

  // 4. Decrire le format des donnees au GPU
  const positionLoc = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(positionLoc);
  gl.vertexAttribPointer(
    positionLoc,  // quel attribut
    2,            // 2 composantes par sommet (x, y)
    gl.FLOAT,     // type des donnees
    false,        // pas de normalisation
    0,            // stride = 0 (donnees compactes, pas d'entrelacement)
    0,            // offset = 0 (commence au debut du buffer)
  );

  // 5. Debinder le VAO (bonne pratique)
  gl.bindVertexArray(null);

  return vao;
}
```

### 6.5 Dessiner

```typescript
function render(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  vao: WebGLVertexArrayObject,
): void {
  // Configurer le viewport (zone de dessin = tout le canvas)
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

  // Couleur de fond (bleu fonce)
  gl.clearColor(0.1, 0.1, 0.2, 1.0);

  // Effacer le color buffer et le depth buffer
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Activer le programme shader
  gl.useProgram(program);

  // Binder le VAO (restaure toute la configuration des attributs)
  gl.bindVertexArray(vao);

  // DESSINER ! 🎉
  // gl.TRIANGLES = mode (dessiner des triangles)
  // 0 = offset (commencer au premier sommet)
  // 3 = count (3 sommets = 1 triangle)
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // Debinder
  gl.bindVertexArray(null);
}
```

### 6.6 Assembler le tout

```typescript
// main.ts — Point d'entree complet

function main(): void {
  const gl = initWebGL();
  const program = createShaderProgram(gl, VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE);
  const vao = setupTriangle(gl, program);
  render(gl, program, vao);
}

main();
```

Resultat : un triangle rouge sur fond bleu fonce, centre dans le canvas.

---

## 7. Configuration du pipeline

### 7.1 Viewport

```typescript
// Le viewport mappe les coordonnees clip space vers les pixels du canvas
// gl.viewport(x, y, width, height)

// Tout le canvas :
gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

// Seulement le quart superieur-droit (utile pour split-screen, minimap) :
gl.viewport(
  gl.canvas.width / 2,   // x
  gl.canvas.height / 2,  // y
  gl.canvas.width / 2,   // width
  gl.canvas.height / 2,  // height
);
```

### 7.2 Depth test

```typescript
// Le depth test (z-buffer) empeche les objets derriere d'ecraser ceux devant
gl.enable(gl.DEPTH_TEST);

// Fonction de comparaison (defaut : gl.LESS — garder le fragment le plus proche)
gl.depthFunc(gl.LESS);    // z plus petit = plus proche de la camera

// Ecriture dans le depth buffer (peut etre desactivee pour des effets speciaux)
gl.depthMask(true);       // true = ecrire dans le z-buffer (defaut)
```

### 7.3 Face culling

```typescript
// Le face culling elimine les faces "cachees" (orientees a l'oppose de la camera)
// Economise ~50% du travail du fragment shader pour les objets opaques
gl.enable(gl.CULL_FACE);

// Quelle face eliminer ? (defaut : gl.BACK)
gl.cullFace(gl.BACK);     // eliminer les faces arriere
// gl.cullFace(gl.FRONT);  // eliminer les faces avant (utile pour certains effets)

// Convention d'orientation (defaut : gl.CCW = counter-clockwise)
gl.frontFace(gl.CCW);     // les triangles en sens anti-horaire sont "face avant"
```

```
FACE CULLING — comment ca marche :

Vue de face (face avant) :       Vue de derriere (face arriere) :

    A                                   A
   / \     Sens anti-horaire           / \     Sens horaire (vu de face)
  /   \    (CCW) → VISIBLE            /   \    → CULLED (elimine)
 /     \                              /     \
B───────C                            C───────B

Le GPU regarde l'ordre des sommets sur l'ecran.
CCW (counter-clockwise) = face avant = visible.
CW (clockwise) = face arriere = eliminee.
```

### 7.4 Clear

```typescript
// Configurer la couleur de fond (une seule fois)
gl.clearColor(0.1, 0.1, 0.2, 1.0);   // RGBA, valeurs 0.0 a 1.0

// Configurer la valeur de clear du depth buffer
gl.clearDepth(1.0);   // 1.0 = le plus loin possible

// Effacer au debut de chaque frame
gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
// On peut aussi clear le stencil : gl.STENCIL_BUFFER_BIT
```

---

## 8. Systeme d'extensions WebGL

WebGL expose des fonctionnalites optionnelles via des extensions. Certaines sont quasi-universelles, d'autres dependant du GPU.

```typescript
// Verifier et activer une extension
const ext = gl.getExtension('EXT_color_buffer_float');
if (ext) {
  console.log('Rendu vers des textures float supporte !');
} else {
  console.warn('EXT_color_buffer_float non disponible');
}

// Lister toutes les extensions supportees
const extensions = gl.getSupportedExtensions();
console.log('Extensions disponibles :', extensions);
```

### Extensions courantes en WebGL 2

| Extension | Role |
|-----------|------|
| `EXT_color_buffer_float` | Render-to-texture avec des formats float |
| `OES_texture_float_linear` | Filtrage lineaire sur les textures float |
| `EXT_texture_filter_anisotropic` | Filtrage anisotrope (meilleure qualite texture en perspective) |
| `WEBGL_debug_renderer_info` | Nom du GPU et du driver |
| `OES_draw_buffers_indexed` | Blending independant par render target |

```typescript
// Exemple : activer le filtrage anisotrope
const anisoExt = gl.getExtension('EXT_texture_filter_anisotropic');
if (anisoExt) {
  const maxAniso = gl.getParameter(anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
  // Appliquer a une texture
  gl.texParameterf(
    gl.TEXTURE_2D,
    anisoExt.TEXTURE_MAX_ANISOTROPY_EXT,
    maxAniso,
  );
}
```

---

## 9. Debugging WebGL

### 9.1 gl.getError()

WebGL ne lance pas d'exceptions. Les erreurs sont silencieuses — on doit les verifier manuellement.

```typescript
// Verifier les erreurs apres chaque appel WebGL (couteux, seulement en dev)
function checkGLError(gl: WebGL2RenderingContext, label: string): void {
  const error = gl.getError();
  if (error !== gl.NO_ERROR) {
    const errorNames: Record<number, string> = {
      [gl.INVALID_ENUM]: 'INVALID_ENUM',
      [gl.INVALID_VALUE]: 'INVALID_VALUE',
      [gl.INVALID_OPERATION]: 'INVALID_OPERATION',
      [gl.INVALID_FRAMEBUFFER_OPERATION]: 'INVALID_FRAMEBUFFER_OPERATION',
      [gl.OUT_OF_MEMORY]: 'OUT_OF_MEMORY',
      [gl.CONTEXT_LOST_WEBGL]: 'CONTEXT_LOST_WEBGL',
    };
    const name = errorNames[error] ?? `UNKNOWN (${error})`;
    console.error(`[WebGL Error] ${label}: ${name}`);
  }
}
```

### 9.2 Contexte de debug avec Proxy

```typescript
// debug-context.ts — Wrapper qui verifie gl.getError() apres chaque appel

function createDebugContext(gl: WebGL2RenderingContext): WebGL2RenderingContext {
  return new Proxy(gl, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      if (typeof value !== 'function') {
        return value;
      }

      return function (this: unknown, ...args: unknown[]) {
        const result = value.apply(target, args);

        // Verifier les erreurs apres chaque appel de fonction
        // (sauf getError lui-meme, pour eviter la recursion)
        if (prop !== 'getError') {
          const error = target.getError();
          if (error !== target.NO_ERROR) {
            console.error(
              `[GL Debug] ${String(prop)}(${args.map(String).join(', ')}) → error ${error}`
            );
          }
        }

        return result;
      };
    },
  });
}

// Usage en developpement :
// const gl = createDebugContext(rawGL);
// Chaque appel WebGL sera verifie automatiquement
```

### 9.3 Erreurs courantes et solutions

| Symptome | Cause probable | Solution |
|----------|---------------|----------|
| Ecran noir, pas d'erreur | Positions hors clip space | Verifier que les coordonnees sont dans [-1, 1] |
| Ecran noir, erreur compile | Erreur GLSL | Lire `gl.getShaderInfoLog()` |
| Triangle invisible | Face culling inverse | Inverser l'ordre des sommets ou `gl.cullFace(gl.FRONT)` |
| Couleurs incorrectes | Precision manquante | Ajouter `precision highp float;` dans le fragment shader |
| Contexte null | WebGL non supporte | Verifier le navigateur, mettre a jour les drivers |
| Performances mauvaises | Debug context en prod | Desactiver le proxy de debug |

### 9.4 Les info logs

```typescript
// Apres compilation d'un shader :
const log = gl.getShaderInfoLog(shader);
if (log && log.length > 0) {
  console.warn('Shader compile log:', log);
  // Meme sans erreur, le log peut contenir des warnings utiles
}

// Apres linkage d'un programme :
const programLog = gl.getProgramInfoLog(program);
if (programLog && programLog.length > 0) {
  console.warn('Program link log:', programLog);
}

// Valider un programme (verifie s'il peut s'executer dans l'etat courant)
gl.validateProgram(program);
if (!gl.getProgramParameter(program, gl.VALIDATE_STATUS)) {
  console.error('Program validation failed:', gl.getProgramInfoLog(program));
}
```

---

## 10. Exercice pratique

### Enonce

Creez une page qui affiche **deux triangles** cote a cote avec des couleurs differentes, en utilisant un **seul draw call**.

**Exigences :**
1. Un triangle rouge a gauche (clip space x: -0.8 a 0.0)
2. Un triangle bleu a droite (clip space x: 0.0 a 0.8)
3. Ajoutez un attribut `a_color` (vec3) dans le vertex shader
4. Passez la couleur au fragment shader via un varying
5. Fond noir
6. Depth test active

**Indices :**
- 2 triangles = 6 sommets
- Chaque sommet a maintenant 5 floats : x, y, r, g, b
- Utilisez `gl.vertexAttribPointer` avec stride et offset pour lire les donnees entrelacees

<details>
<summary>Voir la solution</summary>

```typescript
const VERTEX_SRC = `#version 300 es
in vec2 a_position;
in vec3 a_color;

out vec3 v_color;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_color = a_color;
}
`;

const FRAGMENT_SRC = `#version 300 es
precision highp float;

in vec3 v_color;
out vec4 fragColor;

void main() {
  fragColor = vec4(v_color, 1.0);
}
`;

// Donnees entrelacees : [x, y, r, g, b] par sommet
const vertexData = new Float32Array([
  // Triangle gauche (rouge)
  -0.4,  0.5,   1.0, 0.0, 0.0,   // haut
  -0.8, -0.5,   1.0, 0.0, 0.0,   // bas-gauche
   0.0, -0.5,   1.0, 0.0, 0.0,   // bas-droit

  // Triangle droit (bleu)
   0.4,  0.5,   0.0, 0.0, 1.0,   // haut
   0.0, -0.5,   0.0, 0.0, 1.0,   // bas-gauche
   0.8, -0.5,   0.0, 0.0, 1.0,   // bas-droit
]);

function setup(gl: WebGL2RenderingContext): void {
  const program = createShaderProgram(gl, VERTEX_SRC, FRAGMENT_SRC);

  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);

  const vbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STATIC_DRAW);

  const FLOAT_SIZE = 4; // 4 bytes par float
  const STRIDE = 5 * FLOAT_SIZE; // 5 floats par sommet = 20 bytes

  // Attribut position : 2 floats, offset 0
  const posLoc = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, STRIDE, 0);

  // Attribut couleur : 3 floats, offset 2 * FLOAT_SIZE = 8 bytes
  const colorLoc = gl.getAttribLocation(program, 'a_color');
  gl.enableVertexAttribArray(colorLoc);
  gl.vertexAttribPointer(colorLoc, 3, gl.FLOAT, false, STRIDE, 2 * FLOAT_SIZE);

  gl.bindVertexArray(null);

  // Render
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.enable(gl.DEPTH_TEST);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.useProgram(program);
  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLES, 0, 6); // 6 sommets = 2 triangles
  gl.bindVertexArray(null);
}
```

**Points cles de la solution :**

- Le **stride** (20 bytes) indique l'espacement entre deux sommets consecutifs dans le buffer
- L'**offset** (8 bytes pour la couleur) indique ou commence chaque attribut dans un sommet
- Un seul `drawArrays` dessine les 2 triangles — le GPU les traite en parallele

</details>

---

## Resume

| Concept | Detail | API/Syntaxe cle |
|---------|--------|-----------------|
| Contexte WebGL 2 | Point d'entree pour toute l'API | `canvas.getContext('webgl2')` |
| Pipeline | vertex shader → rasterizer → fragment shader | Etapes fixes + programmables |
| GLSL ES 3.00 | Langage C-like pour GPU | `#version 300 es`, `in`/`out`/`uniform` |
| Types GLSL | Scalaires, vecteurs, matrices | `float`, `vec2/3/4`, `mat4`, `sampler2D` |
| Precision | Obligatoire dans fragment shader | `precision highp float;` |
| Compilation shader | Source → compile → link → use | `compileShader`, `linkProgram`, `useProgram` |
| Clip space | Systeme de coordonnees normalise | x, y, z dans [-1, +1] |
| Viewport | Mappe clip space vers pixels | `gl.viewport(x, y, w, h)` |
| Depth test | Z-buffer pour l'occultation | `gl.enable(gl.DEPTH_TEST)` |
| Face culling | Elimine les faces cachees | `gl.enable(gl.CULL_FACE)` |
| Clear | Efface les buffers | `gl.clearColor(...)`, `gl.clear(...)` |
| Extensions | Fonctionnalites optionnelles du GPU | `gl.getExtension('...')` |
| Debug | Erreurs silencieuses a verifier | `gl.getError()`, `getShaderInfoLog` |

---

## Navigation

| Precedent | Suivant |
|:---------:|:-------:|
| [05 — Lumiere, materiaux et PBR](./05-lumiere-materiaux-pbr.md) | [07 — Shaders, buffers et textures](./07-shaders-buffers-textures.md) |
