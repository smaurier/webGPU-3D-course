---
titre: WebGL fondamentaux
cours: 20-webgpu-3d
notions:
  - "contexte WebGL2 (getContext('webgl2'))"
  - "canvas et drawing buffer vs taille CSS"
  - "Vertex Buffer Object (VBO)"
  - "attributs de sommet (in / vertexAttribPointer)"
  - "uniforms (constantes par draw call)"
  - "programme et shaders GLSL ES 300"
  - "compilation et linkage de shaders"
  - "draw call (drawArrays)"
  - "clip space et gl_Position"
  - "état WebGL (viewport, clearColor, machine à états)"
outcomes:
  - sait obtenir un contexte WebGL2 depuis un canvas et dimensionner le drawing buffer
  - sait compiler, linker et activer un programme GLSL ES 300 avec lecture des info logs
  - sait uploader des positions dans un VBO et les brancher via un attribut (vertexAttribPointer)
  - sait passer une couleur constante via un uniform et dessiner un triangle avec drawArrays
  - sait raisonner sur WebGL comme une machine à états (bind courant, viewport, clear)
prerequis:
  - "00-prerequis-et-introduction (GPU, aperçu pipeline)"
  - "03-cameras-et-projections (clip space, NDC)"
  - "04-pipeline-de-rendu (vertex shader, rasterisation, fragment shader, étapes fixes vs programmables)"
  - "05-lumiere-materiaux-et-pbr (shading dans le fragment shader)"
next: 07-shaders-buffers-textures
libs: []
tribuzen: "moteur de rendu 3D TribuZen — premier rendu GPU réel : afficher un marqueur de sortie (un triangle) à l'écran via WebGL2, la première brique concrète de l'API"
last-reviewed: 2026-07
---

# WebGL fondamentaux

> **Outcomes — tu sauras FAIRE :** obtenir un contexte WebGL2, compiler/linker un programme GLSL ES 300, uploader des sommets dans un VBO, passer une couleur via un uniform, et dessiner un triangle avec `drawArrays`.
> **Difficulté :** :star::star::star:
>
> **Portée :** ce module est le **premier contact avec l'API**. Les modules 01-05 étaient conceptuels (maths, pipeline, éclairage). Ici on écrit du vrai code WebGL2 qui produit une image. Les VAO, l'entrelacement, les textures et l'animation viennent au **module 07**.

## 1. Cas concret d'abord

Depuis cinq modules, TribuZen a un moteur de rendu 3D **sur le papier** : on sait ce qu'est un clip space (module 03), le pipeline vertex→fragment (module 04), un shader d'éclairage (module 05). Mais **rien ne s'est jamais affiché à l'écran**.

La première feature concrète : sur la carte des sorties de la famille, poser un **marqueur** géré par le GPU. Avant la carte complète, avant les icônes, il faut la brique zéro : **faire apparaître un seul triangle coloré dans un `<canvas>` via WebGL2**. Si ce triangle s'affiche, tout le reste du cours (WebGPU, Three.js) est accessible ; s'il ne s'affiche pas, on est bloqué.

Voici le réflexe « débutant » qui **ne marche pas** :

```typescript
// ❌ Ce code ne produit RIEN à l'écran
const canvas = document.querySelector('canvas')!;
const gl = canvas.getContext('webgl2')!;
gl.clearColor(0.1, 0.1, 0.2, 1.0);
// ...on s'attend à voir un triangle. Il n'y a même pas de fond.
```

Il manque **tout le protocole WebGL** : on n'a pas effacé le buffer, pas compilé de shader, pas envoyé de sommets, pas lancé de draw call. WebGL est une **machine à états bas niveau** : chaque étape doit être posée explicitement, dans le bon ordre, et **aucune erreur n'est levée** si on en oublie une — l'écran reste noir en silence.

Ce module pose ce protocole étape par étape, jusqu'au triangle rouge affiché.

---

## 2. Théorie complète, concise

### 2.1 Le contexte WebGL2 depuis un canvas

WebGL dessine dans un élément `<canvas>` — un rectangle de pixels. `getContext('webgl2')` renvoie l'objet `WebGL2RenderingContext` (conventionnellement nommé `gl`), la porte d'entrée de **toute** l'API.

```typescript
const canvas = document.getElementById('gl-canvas') as HTMLCanvasElement;
const gl = canvas.getContext('webgl2');
if (!gl) {
  throw new Error('WebGL2 non supporté par ce navigateur.');
}
```

`getContext` renvoie `null` (pas d'exception) si le GPU est indisponible, si un contexte `'2d'` a déjà été pris sur ce canvas, ou si WebGL2 n'est pas supporté. **Toujours tester le `null`.**

WebGL2 est le standard actuel (GLSL ES 3.00, Vertex Array Objects et instancing natifs). Il n'y a plus de raison de cibler WebGL1 sauf appareils très anciens.

### 2.2 Drawing buffer vs taille CSS

Un canvas a **deux tailles distinctes** :

- la **taille CSS** (ce que l'utilisateur voit, en px de mise en page) ;
- la **taille du drawing buffer** (`canvas.width` / `canvas.height`, la résolution réelle des pixels dessinés).

Par défaut le drawing buffer fait `300 × 150`, indépendamment du CSS. Si on ne le synchronise pas, l'image est floue ou étirée :

```typescript
// Aligner la résolution réelle sur la taille affichée (× densité d'écran)
canvas.width = canvas.clientWidth * window.devicePixelRatio;
canvas.height = canvas.clientHeight * window.devicePixelRatio;
```

### 2.3 Le clip space : où vivent les sommets

Le vertex shader doit produire `gl_Position` en **clip space** (revu au module 03). Après division par `w`, l'écran visible est le cube `[-1, +1]` sur chaque axe :

```
        +Y (+1)
          │
(-1,+1)───┼───(+1,+1)
          │
──────────┼────────── +X (+1)
          │
(-1,-1)───┼───(+1,-1)
          │
        -Y (-1)
```

Un sommet en dehors de `[-1, +1]` est hors écran. Pour un premier triangle, on écrit les positions **directement** en clip space, sans aucune matrice.

### 2.4 GLSL ES 3.00 : le langage des shaders

GLSL (OpenGL Shading Language) est un langage type C exécuté sur le GPU. WebGL2 utilise **GLSL ES 3.00**, activé par la directive `#version 300 es` **en toute première ligne** de chaque shader.

Deux shaders sont obligatoires (les deux seules étapes programmables du pipeline, module 04) :

- **Vertex shader** — exécuté une fois par sommet, il écrit `gl_Position`.
- **Fragment shader** — exécuté une fois par fragment (pixel candidat), il écrit la couleur de sortie.

Trois qualificateurs de variable structurent les échanges (GLSL 3.00) :

```
in       — entrée du shader (attribut de sommet, ou varying interpolé côté fragment)
out      — sortie du shader (varying vers le fragment, ou couleur finale)
uniform  — constante identique pour TOUT le draw call (même valeur pour tous les sommets/fragments)
```

> **Note GLSL 3.00 vs 1.00 :** `in`/`out` remplacent les anciens `attribute`/`varying`. Le fragment shader **déclare explicitement sa sortie** (`out vec4 fragColor`) au lieu de l'ancien `gl_FragColor`. Et il **doit** déclarer une précision par défaut : `precision highp float;`.

Vertex shader minimal (positions déjà en clip space) :

```glsl
#version 300 es

// Attribut de sommet : une position (x, y) par sommet, lue depuis le VBO
in vec2 a_position;

void main() {
  // gl_Position est la sortie OBLIGATOIRE du vertex shader (clip space x,y,z,w)
  gl_Position = vec4(a_position, 0.0, 1.0);
}
```

Fragment shader minimal (couleur passée en uniform) :

```glsl
#version 300 es
precision highp float;   // OBLIGATOIRE en fragment shader GLSL 3.00

// Uniform : même couleur pour tous les fragments de ce draw call
uniform vec4 u_color;

// Sortie explicite : la couleur finale du fragment (RGBA)
out vec4 fragColor;

void main() {
  fragColor = u_color;
}
```

### 2.5 Compiler et linker un programme

Un **programme** WebGL est le couple vertex + fragment shader compilé et lié. La chaîne :

```
source GLSL ──createShader──> shaderSource ──> compileShader ──> [vérifier COMPILE_STATUS]
                                                    │ (× 2 : vertex + fragment)
                                                    ▼
createProgram ──> attachShader (× 2) ──> linkProgram ──> [vérifier LINK_STATUS]
                                                    │
                                                    ▼
                                              useProgram
```

**Point critique :** WebGL ne lève **aucune exception** si un shader ne compile pas. Il faut interroger `getShaderParameter(shader, gl.COMPILE_STATUS)` et lire `getShaderInfoLog(shader)` soi-même — sinon on debugge un écran noir à l'aveugle.

### 2.6 Uploader des sommets : le VBO

Les positions vivent côté CPU dans un `Float32Array`. Pour que le GPU les lise, on les copie dans un **Vertex Buffer Object (VBO)** — un bloc de mémoire GPU :

```typescript
const vbo = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vbo);          // le VBO devient la cible ARRAY_BUFFER courante
gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);  // copie CPU → GPU
```

`gl.STATIC_DRAW` est un **indice d'usage** : « ces données ne changeront pas », le GPU optimise en conséquence (`DYNAMIC_DRAW` / `STREAM_DRAW` pour des données modifiées souvent).

### 2.7 Brancher l'attribut : `vertexAttribPointer`

Un VBO n'est qu'un tas d'octets. Il faut **décrire** au GPU comment les découper en sommets et les mapper sur l'attribut `a_position`. On récupère l'emplacement de l'attribut, on l'active, puis on décrit le format (signature confirmée sur MDN) :

```typescript
const posLoc = gl.getAttribLocation(program, 'a_position');  // index de l'attribut (ou -1 si absent)
gl.enableVertexAttribArray(posLoc);
gl.vertexAttribPointer(
  posLoc,     // index : quel attribut on décrit
  2,          // size : 2 composantes par sommet (x, y)
  gl.FLOAT,   // type : chaque composante est un float 32 bits
  false,      // normalized : non (uniquement pertinent pour les entiers)
  0,          // stride EN OCTETS entre deux sommets (0 = compact, calculé auto)
  0,          // offset EN OCTETS du premier composant dans le buffer
);
```

`stride` et `offset` sont **en octets** (piège classique). `0` en stride signifie « données compactes », le GPU déduit l'espacement depuis `size` × `type`.

### 2.8 Les uniforms : constantes par draw call

Un **uniform** est une valeur constante partagée par toutes les invocations d'un draw call — idéal pour une couleur, une matrice, une position de lumière. On récupère son emplacement puis on l'affecte **après `useProgram`** :

```typescript
gl.useProgram(program);
const colorLoc = gl.getUniformLocation(program, 'u_color');
gl.uniform4f(colorLoc, 1.0, 0.0, 0.0, 1.0);   // vec4 rouge opaque
```

Le suffixe de `uniform*` encode le type : `uniform4f` = 4 floats (un `vec4`), `uniform1i` = 1 entier, `uniformMatrix4fv` = une `mat4`, etc.

### 2.9 L'état WebGL et le draw call

WebGL est une **machine à états globale** : `bindBuffer`, `useProgram`, `viewport`… ne prennent effet immédiat que sur « ce qui est courant ». Un draw call **consomme l'état courant**. La séquence de rendu :

```typescript
gl.viewport(0, 0, canvas.width, canvas.height);  // mappe le clip space → pixels du canvas
gl.clearColor(0.1, 0.1, 0.2, 1.0);               // couleur d'effacement (état)
gl.clear(gl.COLOR_BUFFER_BIT);                    // efface effectivement le color buffer
gl.useProgram(program);                           // programme courant
gl.drawArrays(gl.TRIANGLES, 0, 3);                // mode, premier sommet, nombre de SOMMETS
```

Dans `drawArrays(mode, first, count)`, **`count` est un nombre de sommets, pas de triangles** : 3 sommets = 1 triangle. Oublier `viewport` (WebGL ne sait plus mapper vers les pixels) ou `clear` sont deux causes classiques d'écran vide.

---

## 3. Worked examples

### Exemple 1 — Le protocole complet : un triangle rouge (TribuZen)

Le marqueur de sortie minimal : un triangle rouge sur fond bleu foncé, écrit de A à Z. Trois fichiers.

**`index.html`** — le canvas hôte :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Marqueur TribuZen — premier rendu GPU</title>
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

**`gl-utils.ts`** — compilation avec lecture des info logs (le réflexe à garder pour toujours) :

```typescript
// Compile un shader GLSL, lève une erreur EXPLICITE si la compilation échoue.
export function compileShader(
  gl: WebGL2RenderingContext,
  type: GLenum,          // gl.VERTEX_SHADER | gl.FRAGMENT_SHADER
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error(`Échec createShader (type ${type})`);

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  // WebGL ne lève rien : on DOIT interroger COMPILE_STATUS nous-mêmes
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? '(pas de log)';
    gl.deleteShader(shader);
    const kind = type === gl.VERTEX_SHADER ? 'VERTEX' : 'FRAGMENT';
    throw new Error(`Compilation ${kind} shader échouée :\n${log}`);
  }
  return shader;
}

// Compile + attache + linke vertex & fragment en un programme utilisable.
export function createProgram(
  gl: WebGL2RenderingContext,
  vertexSrc: string,
  fragmentSrc: string,
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSrc);

  const program = gl.createProgram();
  if (!program) throw new Error('Échec createProgram');

  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  // Même piège : le linkage peut échouer silencieusement
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? '(pas de log)';
    gl.deleteProgram(program);
    throw new Error(`Linkage programme échoué :\n${log}`);
  }

  // Les shaders compilés peuvent être supprimés : le programme en garde une copie
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
}
```

**`main.ts`** — le protocole de bout en bout :

```typescript
import { createProgram } from './gl-utils';

const VERTEX_SRC = `#version 300 es
in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);  // positions déjà en clip space
}
`;

const FRAGMENT_SRC = `#version 300 es
precision highp float;          // obligatoire en fragment GLSL 3.00
uniform vec4 u_color;           // couleur constante pour ce draw call
out vec4 fragColor;             // sortie explicite (remplace gl_FragColor)
void main() {
  fragColor = u_color;
}
`;

function main(): void {
  // 1. Contexte
  const canvas = document.getElementById('gl-canvas') as HTMLCanvasElement;
  const gl = canvas.getContext('webgl2');
  if (!gl) throw new Error('WebGL2 non supporté.');

  // 2. Synchroniser le drawing buffer sur la taille affichée
  canvas.width = canvas.clientWidth * window.devicePixelRatio;
  canvas.height = canvas.clientHeight * window.devicePixelRatio;

  // 3. Programme (compile + link + vérif)
  const program = createProgram(gl, VERTEX_SRC, FRAGMENT_SRC);

  // 4. Sommets du triangle, en clip space (x, y)
  const positions = new Float32Array([
     0.0,  0.5,   // sommet haut
    -0.5, -0.5,   // bas-gauche
     0.5, -0.5,   // bas-droit
  ]);

  // 5. VBO : copier les positions CPU → GPU
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

  // 6. Décrire l'attribut a_position (stride/offset EN OCTETS)
  const posLoc = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  // 7. Rendu
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.1, 0.1, 0.2, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(program);

  // Uniform couleur : rouge opaque (APRÈS useProgram)
  const colorLoc = gl.getUniformLocation(program, 'u_color');
  gl.uniform4f(colorLoc, 1.0, 0.0, 0.0, 1.0);

  // 8. Draw call : 3 sommets = 1 triangle
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

main();
```

Résultat : un triangle rouge centré sur fond bleu foncé. Chaque étape 1→8 est indispensable ; en retirer une (souvent le `clear` ou le `viewport`) redonne l'écran noir.

### Exemple 2 — Changer la couleur sans recompiler : la force de l'uniform

L'intérêt de l'uniform `u_color` : la couleur du marqueur peut changer **sans toucher au shader ni aux sommets**. Pour un marqueur « sortie validée » (vert) vs « sortie prévue » (orange), on ne recompile rien — on ré-affecte l'uniform avant chaque draw :

```typescript
// Marqueur vert (sortie bouclée)
gl.uniform4f(colorLoc, 0.1, 0.8, 0.3, 1.0);
gl.drawArrays(gl.TRIANGLES, 0, 3);

// ...plus tard, même programme, même VBO, autre couleur
// Marqueur orange (sortie prévue) — aucune recompilation
gl.uniform4f(colorLoc, 1.0, 0.6, 0.0, 1.0);
gl.drawArrays(gl.TRIANGLES, 0, 3);
```

C'est la distinction clé : **les attributs varient par sommet** (chaque position est différente), **l'uniform est constant par draw call** (une couleur pour tout le triangle). Cette séparation structure tout le rendu GPU à venir.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Croire que WebGL lève une exception sur shader invalide

WebGL est **silencieux**. Un shader qui ne compile pas, un programme qui ne linke pas : `createProgram` renvoie un objet, `drawArrays` ne plante pas, et l'écran reste noir. **Sans lire `COMPILE_STATUS` / `LINK_STATUS` et les info logs, on debugge à l'aveugle.** C'est la première chose à câbler (l'`Exemple 1` le fait).

### PIÈGE #2 — Oublier `precision highp float;` dans le fragment shader

En GLSL ES 3.00, le vertex shader a une précision par défaut pour `float`, **pas le fragment shader**. Omettre `precision highp float;` fait échouer la compilation du fragment — et sans lecture du log (piège #1), c'est un écran noir inexpliqué.

### PIÈGE #3 — Positions hors clip space

WebGL ne dessine que ce qui tombe dans `[-1, +1]` sur chaque axe. Donner des coordonnées en pixels (`vec2(400.0, 300.0)`) place le triangle **totalement hors écran** : rien ne s'affiche, aucune erreur. Pour un premier triangle sans matrice, rester dans `[-1, +1]`.

### PIÈGE #4 — Confondre le `count` de `drawArrays` (sommets, pas triangles)

`gl.drawArrays(gl.TRIANGLES, 0, 3)` dessine **3 sommets** = 1 triangle. Écrire `count = 1` en pensant « 1 triangle » ne dessine rien. Règle : `count` = nombre de **sommets**.

### PIÈGE #5 — `stride` / `offset` de `vertexAttribPointer` en octets, pas en composantes

`vertexAttribPointer(loc, 2, gl.FLOAT, false, stride, offset)` : `stride` et `offset` sont **en octets**. Pour des données entrelacées `[x, y, r, g, b]`, l'offset de la couleur est `2 * 4 = 8` octets (2 floats × 4 octets), pas `2`. Sur un buffer compact d'un seul attribut, `stride = 0` et `offset = 0` suffisent.

### PIÈGE #6 — Oublier `viewport` ou `clear`

Sans `gl.viewport(...)`, WebGL ne sait pas mapper le clip space vers les pixels du canvas (surtout après un resize) → rien de visible. Sans `gl.clear(gl.COLOR_BUFFER_BIT)`, le buffer garde un contenu indéfini. Les deux sont à poser à chaque frame dans un vrai moteur.

### PIÈGE #7 — Affecter un uniform avant `useProgram`

`gl.uniform4f(...)` agit sur le **programme courant**. L'appeler avant `gl.useProgram(program)` écrit dans le vide (ou dans un autre programme). Toujours : `useProgram` **puis** `uniform*`.

---

## 5. Ancrage TribuZen

WebGL est le **premier rendu GPU concret** de TribuZen. Jusqu'ici tout était théorique ; ce module produit le premier pixel réel.

**Marqueur de sortie sur la carte.** Chaque sortie de la famille (rando, pique-nique) est un point sur la carte. Le marqueur minimal est un triangle géré par WebGL2 : positions en clip space (converties depuis les coordonnées carte dans les modules suivants), couleur via uniform selon l'état :

- **sortie bouclée** → vert (`uniform4f(loc, 0.1, 0.8, 0.3, 1.0)`) ;
- **sortie prévue** → orange (`uniform4f(loc, 1.0, 0.6, 0.0, 1.0)`) ;
- **sortie annulée** → gris.

Un **seul** programme + un **seul** VBO servent tous les marqueurs : seul l'uniform `u_color` change entre les draws. C'est le socle sur lequel le module 07 branchera plusieurs attributs (position + couleur par sommet, textures) et le module 08 assemblera une scène animée.

Fichiers cibles dans `smaurier/tribuzen` :

```
tribuzen/
  src/
    3d/
      gl/
        glUtils.ts        ← compileShader / createProgram (Exemple 1)
      markers/
        MarkerRenderer.ts  ← VBO + attribut + uniform couleur du marqueur
      MapCanvas.vue        ← <canvas> WebGL2 de la carte des sorties
```

> Le rendu de la carte réelle (projection géo → clip space, plusieurs marqueurs, interactions) s'appuiera sur les caméras/projections (module 03) et les techniques d'instancing (module 17). Ici on pose la brique zéro : **un** triangle **s'affiche**.

---

## 6. Points clés

1. `canvas.getContext('webgl2')` renvoie `null` (pas d'exception) si WebGL2 est indisponible — toujours tester.
2. Le drawing buffer (`canvas.width/height`) est distinct de la taille CSS ; les synchroniser sinon l'image est floue.
3. WebGL2 utilise GLSL ES 3.00 : `#version 300 es` en 1re ligne, `in`/`out`/`uniform`, `precision highp float;` obligatoire en fragment.
4. Compiler/linker est **silencieux** : lire `COMPILE_STATUS`, `LINK_STATUS` et les info logs, sinon écran noir aveugle.
5. Un VBO stocke les sommets côté GPU (`createBuffer` → `bindBuffer(ARRAY_BUFFER)` → `bufferData(..., STATIC_DRAW)`).
6. `vertexAttribPointer(loc, size, type, normalized, stride, offset)` décrit le format ; `stride`/`offset` sont **en octets**.
7. Un attribut varie **par sommet**, un uniform est constant **par draw call** ; `uniform*` s'affecte **après** `useProgram`.
8. `drawArrays(mode, first, count)` : `count` = nombre de **sommets** (3 pour un triangle) ; `viewport` + `clear` sont indispensables.

---

## 7. Seeds Anki

```
Pourquoi getContext('webgl2') ne lève-t-il pas d'exception si WebGL2 est absent ?|Il renvoie null. WebGL est silencieux : il faut tester `if (!gl)` explicitement, sinon on appelle des méthodes sur null. Il renvoie aussi null si un contexte '2d' a déjà été pris sur ce canvas.
Quelle est la différence entre la taille CSS et le drawing buffer d'un canvas ?|La taille CSS est l'affichage en px de mise en page ; le drawing buffer (canvas.width/height) est la résolution réelle des pixels dessinés (défaut 300×150). Les synchroniser (canvas.width = clientWidth * devicePixelRatio) sinon l'image est floue/étirée.
Que faut-il déclarer obligatoirement dans un fragment shader GLSL ES 3.00 ?|`#version 300 es` en 1re ligne, `precision highp float;` (pas de défaut en fragment), et une sortie explicite `out vec4 fragColor;` (gl_FragColor n'existe plus en 3.00).
Comment vérifier qu'un shader a compilé en WebGL ?|gl.getShaderParameter(shader, gl.COMPILE_STATUS) renvoie un booléen ; si false, lire gl.getShaderInfoLog(shader). WebGL ne lève AUCUNE exception — sans cette vérif, un shader invalide donne un écran noir silencieux.
Quelle est la différence entre un attribut et un uniform ?|Un attribut (in, via vertexAttribPointer + VBO) varie PAR SOMMET — chaque sommet a sa propre valeur. Un uniform est constant PAR DRAW CALL — même valeur pour tous les sommets/fragments (ex : une couleur, une matrice).
Dans vertexAttribPointer(loc, size, type, normalized, stride, offset), en quelle unité sont stride et offset ?|En OCTETS. Pour [x,y,r,g,b] entrelacé, l'offset couleur = 2*4 = 8 octets. Sur un buffer compact d'un seul attribut, stride=0 (espacement auto) et offset=0.
Dans gl.drawArrays(gl.TRIANGLES, 0, 3), que représente le 3 ?|Le nombre de SOMMETS à dessiner, pas de triangles. 3 sommets = 1 triangle. drawArrays(mode, first, count) : first = index de départ, count = nombre de sommets.
Pourquoi doit-on appeler gl.useProgram avant gl.uniform4f ?|uniform* agit sur le PROGRAMME COURANT. Sans useProgram(program) préalable, l'affectation part dans le vide ou vers un autre programme. Ordre : useProgram, puis récupérer la location et affecter les uniforms.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-06-webgl-fondamentaux/README.md`. Afficher un triangle coloré en WebGL2 dans le navigateur — protocole complet (contexte, shaders, VBO, attribut, uniform, draw call) écrit de zéro, corrigé HTML/TS commenté.
