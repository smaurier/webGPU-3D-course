# 04 — Pipeline de rendu

| Difficulte | Duree estimee | Lab | Quiz |
|:----------:|:-------------:|:---:|:----:|
| 4/5        | 120 min       | [Lab 04](../labs/lab-04-pipeline-rendu/) | [Quiz 04](../quizzes/quiz-04-pipeline-rendu.html) |

## Objectifs pedagogiques

A la fin de ce module, vous serez capable de :

- Decrire les 5 étapes du pipeline de rendu GPU (Application, Geometry, Rasterization, Fragment, Output Merger)
- Expliquer le role des vertex buffers, index buffers et la topologie des primitives
- Écrire un vertex shader conceptuel qui transforme des sommets via MVP
- Comprendre la rasterisation et l'interpolation barycentrique
- Expliquer le role du fragment shader (calcul de couleur par pixel)
- Decrire les tests de sortie : depth test, stencil test, alpha blending
- Implementer un software rasterizer simplifie en TypeScript

---

<details>
<summary>Rappel du module precedent</summary>

- **Espaces de coordonnees** : Objet → Monde (M) → Camera (V) → Clip (P) → NDC (/w) → Ecran
- **lookAt** : construit la view matrix à partir de eye, target, up
- **Projection perspective** : simule la vision humaine, objets lointains retrecissent (`f / tan(fov/2)`)
- **Projection orthographique** : taille constante, pas de perspective divide
- **Frustum culling** : eliminer les objets hors du volume visible avant le rendu
- **Depth buffer** : précision non-lineaire, concentree pres du near plane
- **NDC** : x,y ∈ [-1,1], z ∈ [0,1] (WebGPU) ou z ∈ [-1,1] (WebGL)

</details>

---

## Analogie : le pipeline de rendu c'est une chaine d'assemblage

:::tip Analogie pour développeurs Vue.js
Vue.js à un pipeline de rendu pour transformer votre code en DOM :

```
Template → Compile → VNode → Patch → DOM → Pixels
```

Le GPU à un pipeline similaire pour transformer vos donnees 3D en pixels :

```
Vertices → Vertex Shader → Primitives → Rasterizer → Fragment Shader → Pixels
```

| Pipeline Vue.js | Pipeline GPU |
|-----------------|-------------|
| Template (HTML) | Vertex buffer (positions, couleurs, UV) |
| Compilateur (template → render function) | Vertex Shader (transformation MVP) |
| Virtual DOM (diff) | Rasterisation (triangle → fragments) |
| Patch (mise a jour DOM) | Fragment Shader (calcul couleur) |
| Navigateur (composite + paint) | Output Merger (depth test, blending) |

La différence majeure : le pipeline GPU est **massivement parallele**. Chaque vertex et chaque fragment sont traites independamment, par des milliers de cores en même temps.
:::

---

## Vue d'ensemble du pipeline

```
PIPELINE DE RENDU GPU
════════════════════════════════════════════════════════════════

                    APPLICATION (CPU)
                         │
                    Vertex Buffer
                    Index Buffer
                    Uniforms (MVP, textures)
                         │
                         ▼
              ┌─────────────────────┐
              │   INPUT ASSEMBLY    │  Lecture des vertices
              │   Topologie         │  et construction des
              │   (triangles, etc.) │  primitives
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │   VERTEX SHADER     │  ★ Programmable
              │   * MVP transform   │  Un thread par vertex
              │   * Calcul normales │
              │   * Output: varyings│
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │  PRIMITIVE ASSEMBLY │  Regroupement en
              │  + CLIPPING         │  triangles + decoupe
              └──────────┬──────────┘  contre le frustum
                         │
                         ▼
              ┌─────────────────────┐
              │   RASTERISATION     │  Triangle → fragments
              │   * Edge functions  │  (pixels candidats)
              │   * Interpolation   │
              │     barycentrique   │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │  FRAGMENT SHADER    │  ★ Programmable
              │  * Calcul couleur   │  Un thread par fragment
              │  * Texturing        │
              │  * Eclairage        │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │   OUTPUT MERGER     │  Depth test
              │   * Depth test      │  Stencil test
              │   * Stencil test    │  Alpha blending
              │   * Blending        │  Ecriture dans le
              │   * Write mask      │  framebuffer
              └──────────┬──────────┘
                         │
                         ▼
                    FRAMEBUFFER
                    (ecran / texture)
```

---

## Étape 1 : Input Assembly

### Vertex Buffers

Les vertex buffers contiennent les donnees brutes des sommets : positions, normales, couleurs, coordonnees de texture (UV).

```typescript
// ── vertex-buffer.ts ──────────────────────────────────

/**
 * Definition d'un vertex avec toutes ses proprietes.
 *
 * En GPU, ces donnees sont stockees dans un buffer contigu
 * et declarees via un vertex layout descriptor.
 */
interface Vertex {
  position: Vec3;    // 3 floats — obligatoire
  normal: Vec3;      // 3 floats — pour l'eclairage
  uv: Vec2;          // 2 floats — coordonnees de texture
  color: Vec3;       // 3 floats — couleur par vertex (optionnel)
}

/**
 * Entrelacement (interleaving) des donnees vertex.
 *
 * En memoire, les donnees sont stockees comme :
 * [pos.x, pos.y, pos.z, norm.x, norm.y, norm.z, uv.u, uv.v, col.r, col.g, col.b,
 *  pos.x, pos.y, pos.z, norm.x, norm.y, norm.z, uv.u, uv.v, col.r, col.g, col.b, ...]
 *
 * Le "stride" est la taille totale d'un vertex en bytes.
 */
function interleaveVertices(vertices: Vertex[]): Float32Array {
  const FLOATS_PER_VERTEX = 3 + 3 + 2 + 3; // 11 floats = 44 bytes
  const data = new Float32Array(vertices.length * FLOATS_PER_VERTEX);

  for (let i = 0; i < vertices.length; i++) {
    const offset = i * FLOATS_PER_VERTEX;
    const v = vertices[i];

    // Position (3 floats)
    data[offset + 0] = v.position.x;
    data[offset + 1] = v.position.y;
    data[offset + 2] = v.position.z;

    // Normal (3 floats)
    data[offset + 3] = v.normal.x;
    data[offset + 4] = v.normal.y;
    data[offset + 5] = v.normal.z;

    // UV (2 floats)
    data[offset + 6] = v.uv.x;
    data[offset + 7] = v.uv.y;

    // Color (3 floats)
    data[offset + 8] = v.color.x;
    data[offset + 9] = v.color.y;
    data[offset + 10] = v.color.z;
  }

  return data;
}
```

### Index Buffers

Un index buffer permet de réutiliser les sommets sans les dupliquer.

```
INDEX BUFFER
════════════════════════════════════════════════════════════════

Un cube a 8 sommets mais 12 triangles (2 par face × 6 faces).
Sans index buffer : 12 × 3 = 36 vertices en memoire.
Avec index buffer : 8 vertices + 36 indices.

      3 ──────── 7                   Vertex buffer (8 entries):
     ╱│         ╱│                     [v0, v1, v2, v3, v4, v5, v6, v7]
    2 ──────── 6 │
    │  │       │  │                  Index buffer (36 entries):
    │  0 ──────│── 4                   Face avant:  [0,1,2, 2,1,3]
    │ ╱        │ ╱                     Face droite: [4,5,6, 6,5,7]
    1 ──────── 5                       ...etc

Avantages :
  - Moins de memoire (indices = 16 ou 32 bits, vertices = 44+ bytes)
  - Meilleur cache GPU (vertex cache post-transform)
  - Le GPU peut reutiliser un vertex deja transforme
```

```typescript
// ── index-buffer.ts ───────────────────────────────────

/**
 * Generer un quad (2 triangles) avec index buffer.
 */
function createQuad(): { vertices: Vertex[]; indices: number[] } {
  const vertices: Vertex[] = [
    {
      position: new Vec3(-1, -1, 0),
      normal: new Vec3(0, 0, 1),
      uv: new Vec2(0, 1),
      color: new Vec3(1, 0, 0),
    },
    {
      position: new Vec3(1, -1, 0),
      normal: new Vec3(0, 0, 1),
      uv: new Vec2(1, 1),
      color: new Vec3(0, 1, 0),
    },
    {
      position: new Vec3(1, 1, 0),
      normal: new Vec3(0, 0, 1),
      uv: new Vec2(1, 0),
      color: new Vec3(0, 0, 1),
    },
    {
      position: new Vec3(-1, 1, 0),
      normal: new Vec3(0, 0, 1),
      uv: new Vec2(0, 0),
      color: new Vec3(1, 1, 0),
    },
  ];

  // 2 triangles, counter-clockwise winding
  const indices = [
    0, 1, 2,  // triangle 1
    0, 2, 3,  // triangle 2
  ];

  return { vertices, indices };
}
```

### Topologie des primitives

```
TOPOLOGIES DE PRIMITIVES
════════════════════════════════════════════════════════════════

Triangle list (la plus courante) :
  Chaque groupe de 3 indices = 1 triangle
  [0,1,2, 3,4,5, 6,7,8]  →  3 triangles independants

Triangle strip :
  Chaque nouveau vertex forme un triangle avec les 2 precedents
  [0,1,2, 3,4,5]  →  4 triangles : (0,1,2), (1,2,3), (2,3,4), (3,4,5)
  Plus compact mais moins flexible

Line list :
  Chaque paire de vertices = 1 segment
  Utile pour le debug (wireframe, axes, grilles)

Line strip :
  Chaque nouveau vertex prolonge la ligne
  Utile pour les trajectoires, courbes

Point list :
  Chaque vertex = 1 point
  Utile pour les systemes de particules
```

---

## Étape 2 : Vertex Shader

Le vertex shader est exécuté **une fois par sommet**. Son role principal : transformer la position du sommet de l'espace objet vers le clip space.

```typescript
// ── vertex-shader-concept.ts ──────────────────────────

/**
 * Simulation conceptuelle d'un vertex shader en TypeScript.
 *
 * En realite, le vertex shader est ecrit en GLSL (WebGL)
 * ou WGSL (WebGPU) et s'execute sur le GPU.
 */

/** Ce que le vertex shader recoit (input) */
interface VertexInput {
  position: Vec3;       // @location(0) — position locale
  normal: Vec3;         // @location(1) — normale locale
  uv: Vec2;             // @location(2) — coordonnees texture
  color: Vec3;          // @location(3) — couleur par vertex
}

/** Ce que le vertex shader produit (output) */
interface VertexOutput {
  clipPosition: Vec4;   // @builtin(position) — OBLIGATOIRE
  worldPosition: Vec3;  // varying — interpole pour le fragment shader
  worldNormal: Vec3;    // varying — interpole pour l'eclairage
  uv: Vec2;             // varying — interpole pour le texturing
  color: Vec3;          // varying — interpole pour la couleur
}

/** Uniforms : donnees partagees par tous les vertices */
interface Uniforms {
  modelMatrix: Mat4;
  viewMatrix: Mat4;
  projectionMatrix: Mat4;
  normalMatrix: Mat4;   // transpose(inverse(model)) pour les normales
}

/**
 * Le vertex shader transforme un sommet.
 *
 * Execute en parallele sur des milliers de cores GPU.
 * Chaque invocation traite UN SEUL vertex, independamment.
 */
function vertexShader(input: VertexInput, uniforms: Uniforms): VertexOutput {
  // 1. Transformer la position : local → world → camera → clip
  const worldPos = uniforms.modelMatrix.transformPoint(input.position);
  const viewPos = uniforms.viewMatrix.transformPoint(worldPos);
  const [cx, cy, cz, cw] = uniforms.projectionMatrix.multiplyVec4(
    viewPos.x, viewPos.y, viewPos.z, 1,
  );

  // 2. Transformer la normale (ATTENTION : pas la meme matrice !)
  // Les normales utilisent la transpose de l'inverse de la model matrix
  // pour rester perpendiculaires apres une echelle non-uniforme.
  const worldNormal = uniforms.normalMatrix.transformVector(input.normal).normalize();

  return {
    clipPosition: new Vec4(cx, cy, cz, cw),
    worldPosition: worldPos,
    worldNormal: worldNormal,
    uv: input.uv,
    color: input.color,
  };
}
```

:::warning Normales et echelle non-uniforme
Si un objet est etire (ex: `scale(2, 1, 1)`), ses normales sont deformees. Il faut utiliser la **transpose de l'inverse** de la model matrix (`normalMatrix`) pour corriger les normales. Oublier cela provoque un eclairage incorrect sur les objets deformes.
:::

---

## Étape 3 : Primitive Assembly et Clipping

```
CLIPPING
════════════════════════════════════════════════════════════════

Apres le vertex shader, les triangles sont DECOUPES contre
les 6 plans du frustum (clip space).

Cas 1 — Triangle entierement DANS le frustum :
  → Passe tel quel a l'etape suivante
  ┌─────────┐
  │  △      │
  │         │
  └─────────┘

Cas 2 — Triangle entierement HORS du frustum :
  → Elimine completement (culling)
  ┌─────────┐        △
  │         │
  │         │
  └─────────┘

Cas 3 — Triangle PARTIELLEMENT dans le frustum :
  → Decoupe en 1 ou 2 triangles plus petits
  ┌─────────┐
  │    ╱╲   │
  │   ╱──╲──│──── coupe ici
  │  ╱    ╲ │
  └─────────┘

L'algorithme de Sutherland-Hodgman decoupe le triangle
contre chaque plan du frustum, un plan a la fois.
```

---

## Étape 4 : Rasterisation

La rasterisation est l'étape qui convertit un triangle (3 sommets continus) en un ensemble de **fragments** (pixels candidats).

```
RASTERISATION
════════════════════════════════════════════════════════════════

Triangle en NDC :              Fragments generes :
                               (chaque □ = un pixel)
    v0                         ┌─┬─┬─┬─┬─┬─┬─┬─┐
   ╱ ╲                        │ │ │ │█│ │ │ │ │
  ╱   ╲                       │ │ │█│█│█│ │ │ │
 ╱     ╲                      │ │█│█│█│█│█│ │ │
v1──────v2                     │█│█│█│█│█│█│█│ │
                               └─┴─┴─┴─┴─┴─┴─┴─┘

Pour CHAQUE pixel de la bounding box du triangle :
  1. Le pixel est-il DANS le triangle ?      → edge function
  2. Si oui, calculer les poids barycentriques → interpolation
  3. Interpoler les attributs (couleur, UV, normale, profondeur)
  4. Passer le fragment au fragment shader
```

### Edge Functions

```typescript
// ── edge-function.ts ──────────────────────────────────

/**
 * Edge function : determine de quel cote d'une arete se trouve un point.
 *
 * Pour un triangle (v0, v1, v2) en counter-clockwise :
 * - edgeFunction > 0 : le point est a l'INTERIEUR (cote gauche de l'arete)
 * - edgeFunction = 0 : le point est SUR l'arete
 * - edgeFunction < 0 : le point est a l'EXTERIEUR
 *
 * C'est un produit vectoriel 2D (cross product en Z).
 */
function edgeFunction(v0: Vec2, v1: Vec2, p: Vec2): number {
  return (v1.x - v0.x) * (p.y - v0.y) - (v1.y - v0.y) * (p.x - v0.x);
}

/**
 * Tester si un point est a l'interieur d'un triangle.
 *
 * Le point est a l'interieur si les 3 edge functions sont positives
 * (triangle counter-clockwise) ou toutes negatives (clockwise).
 */
function isPointInTriangle(
  p: Vec2,
  v0: Vec2,
  v1: Vec2,
  v2: Vec2,
): boolean {
  const e0 = edgeFunction(v0, v1, p);
  const e1 = edgeFunction(v1, v2, p);
  const e2 = edgeFunction(v2, v0, p);

  // Toutes positives ou toutes negatives
  return (e0 >= 0 && e1 >= 0 && e2 >= 0) ||
         (e0 <= 0 && e1 <= 0 && e2 <= 0);
}
```

### Coordonnees barycentriques

```
COORDONNEES BARYCENTRIQUES
════════════════════════════════════════════════════════════════

Chaque point a l'interieur d'un triangle peut etre exprime
comme une combinaison ponderee des 3 sommets :

  P = w0 * v0 + w1 * v1 + w2 * v2

ou w0 + w1 + w2 = 1 et w0, w1, w2 ≥ 0

      v0
     ╱ ╲          P = 0.5 * v0 + 0.3 * v1 + 0.2 * v2
    ╱ ● ╲
   ╱  P   ╲       Les poids sont proportionnels aux AIRES
  ╱         ╲      des sous-triangles opposes :
 v1──────────v2
                   w0 = aire(P, v1, v2) / aire(v0, v1, v2)
                   w1 = aire(v0, P, v2) / aire(v0, v1, v2)
                   w2 = aire(v0, v1, P) / aire(v0, v1, v2)

Utilisation :
  - Interpoler la COULEUR entre les 3 sommets
  - Interpoler les COORDONNEES DE TEXTURE (UV)
  - Interpoler la NORMALE pour l'eclairage par pixel
  - Interpoler la PROFONDEUR pour le depth buffer
```

```typescript
// ── barycentric.ts ────────────────────────────────────

/**
 * Calculer les coordonnees barycentriques d'un point dans un triangle.
 *
 * On utilise les edge functions : le poids d'un sommet est
 * proportionnel a l'edge function de l'arete OPPOSEE.
 */
function barycentric(
  p: Vec2,
  v0: Vec2,
  v1: Vec2,
  v2: Vec2,
): { w0: number; w1: number; w2: number } {
  const area = edgeFunction(v0, v1, v2); // Aire totale * 2

  // Sous-aires (= edge functions)
  const w0 = edgeFunction(v1, v2, p) / area;
  const w1 = edgeFunction(v2, v0, p) / area;
  const w2 = edgeFunction(v0, v1, p) / area;

  return { w0, w1, w2 };
}

/**
 * Interpoler une valeur en utilisant les coordonnees barycentriques.
 *
 * Fonctionne pour n'importe quel type numerique (float, vec2, vec3...).
 */
function interpolate(
  w0: number,
  w1: number,
  w2: number,
  a0: number,
  a1: number,
  a2: number,
): number {
  return w0 * a0 + w1 * a1 + w2 * a2;
}

/** Interpoler un Vec3 (couleur, position, normale) */
function interpolateVec3(
  w0: number,
  w1: number,
  w2: number,
  a: Vec3,
  b: Vec3,
  c: Vec3,
): Vec3 {
  return new Vec3(
    w0 * a.x + w1 * b.x + w2 * c.x,
    w0 * a.y + w1 * b.y + w2 * c.y,
    w0 * a.z + w1 * b.z + w2 * c.z,
  );
}
```

---

## Étape 5 : Fragment Shader

Le fragment shader est exécuté **une fois par fragment** (pixel candidat). Il calcule la couleur finale du pixel.

```typescript
// ── fragment-shader-concept.ts ────────────────────────

/** Ce que le fragment shader recoit (interpole depuis les vertices) */
interface FragmentInput {
  worldPosition: Vec3;
  worldNormal: Vec3;
  uv: Vec2;
  color: Vec3;
}

/** Ce que le fragment shader produit */
interface FragmentOutput {
  color: Vec4;    // RGBA, chaque composante dans [0, 1]
  // Le depth est automatiquement interpole depuis les vertices
}

/**
 * Fragment shader minimal : couleur interpolee.
 *
 * Chaque pixel du triangle a une couleur calculee par
 * interpolation barycentrique des couleurs des 3 sommets.
 */
function fragmentShaderSimple(input: FragmentInput): FragmentOutput {
  return {
    color: Vec4.rgba(input.color.x, input.color.y, input.color.z, 1.0),
  };
}

/**
 * Fragment shader avec eclairage diffus (Lambert).
 *
 * La couleur depend de l'angle entre la normale et la lumiere.
 */
function fragmentShaderLit(
  input: FragmentInput,
  lightDir: Vec3,
  lightColor: Vec3,
  ambientColor: Vec3,
): FragmentOutput {
  const N = input.worldNormal.normalize();
  const L = lightDir.normalize();

  // Lambert diffuse
  const NdotL = Math.max(0, N.dot(L));
  const diffuse = lightColor.scale(NdotL);

  // Couleur finale = (ambient + diffuse) * couleur de l'objet
  const finalColor = ambientColor.add(diffuse).multiply(input.color);

  // Clamper les valeurs dans [0, 1]
  return {
    color: Vec4.rgba(
      Math.min(1, finalColor.x),
      Math.min(1, finalColor.y),
      Math.min(1, finalColor.z),
      1.0,
    ),
  };
}
```

---

## Étape 6 : Output Merger (tests de sortie)

### Depth Test

```
DEPTH TEST
════════════════════════════════════════════════════════════════

Le depth buffer stocke la profondeur de chaque pixel affiche.
Quand un nouveau fragment arrive, on compare sa profondeur
avec la valeur stockee :

  Si fragment.depth < depthBuffer[x][y] :
    → Le fragment est DEVANT → on l'affiche (et on met a jour le depth)
  Sinon :
    → Le fragment est DERRIERE → on le REJETTE

Cela garantit que les objets proches masquent les objets lointains,
QUEL QUE SOIT l'ordre de dessin.

Depth buffer (visualise en niveaux de gris) :
  ┌──────────────────────┐
  │  ░░░░░░██████░░░░░░  │  Noir = proche (depth petit)
  │  ░░░░████████░░░░░░  │  Blanc = lointain (depth grand)
  │  ░░████████████░░░░  │  Gris = intermediaire
  │  ░░░░████████░░░░░░  │
  │  ░░░░░░██████░░░░░░  │
  └──────────────────────┘
```

### Stencil Test

```
STENCIL TEST
════════════════════════════════════════════════════════════════

Le stencil buffer est un masque 8 bits par pixel.
Il permet de dessiner UNIQUEMENT dans certaines zones de l'ecran.

Cas d'usage :
  - Miroirs / portails (dessiner la reflexion uniquement dans le miroir)
  - Ombres planaires (masquer l'ombre pour qu'elle ne depasse pas du sol)
  - Effets de decoupe (outline, stencil shadow volumes)

Principe :
  1. Passe 1 : dessiner le masque dans le stencil buffer
  2. Passe 2 : dessiner la scene, mais uniquement la ou stencil == valeur

  Stencil buffer :     Scene finale :
  ┌──────────────┐     ┌──────────────┐
  │  ┌────────┐  │     │  ┌────────┐  │
  │  │ 1  1  1│  │     │  │ miroir │  │
  │  │ 1  1  1│  │  →  │  │ (scene │  │
  │  │ 1  1  1│  │     │  │ reflet)│  │
  │  └────────┘  │     │  └────────┘  │
  │  0  0  0  0  │     │  (pas de     │
  └──────────────┘     └──rendu ici)──┘
```

### Alpha Blending

```
ALPHA BLENDING
════════════════════════════════════════════════════════════════

L'alpha blending permet de dessiner des objets SEMI-TRANSPARENTS
en melangeant leur couleur avec la couleur deja presente.

Formule standard (over) :
  finalColor = srcColor * srcAlpha + dstColor * (1 - srcAlpha)

Exemple avec alpha = 0.5 (50% transparent) :
  srcColor = (1.0, 0.0, 0.0)  — rouge
  dstColor = (0.0, 0.0, 1.0)  — bleu (deja affiche)

  finalColor = (1, 0, 0) * 0.5 + (0, 0, 1) * 0.5
             = (0.5, 0.0, 0.5)  — violet !

PIEGE : l'ordre de dessin compte !
  1. Dessiner les objets OPAQUES d'abord (avec depth test)
  2. Trier les objets transparents du plus LOIN au plus PRES
  3. Les dessiner avec blending active et depth WRITE desactive

Si on dessine les transparents dans le mauvais ordre,
les objets derriere ne seront pas visibles.
```

```typescript
// ── blending.ts ───────────────────────────────────────

/** Modes de blending courants */
type BlendMode = 'none' | 'alpha' | 'additive' | 'multiply';

/**
 * Appliquer le blending sur un pixel.
 *
 * src = couleur du nouveau fragment
 * dst = couleur deja dans le framebuffer
 */
function blend(
  src: Vec4,
  dst: Vec4,
  mode: BlendMode,
): Vec4 {
  switch (mode) {
    case 'none':
      // Pas de blending : le nouveau fragment remplace l'ancien
      return src;

    case 'alpha':
      // Standard alpha blending (over)
      // final = src * srcAlpha + dst * (1 - srcAlpha)
      return Vec4.rgba(
        src.x * src.w + dst.x * (1 - src.w),
        src.y * src.w + dst.y * (1 - src.w),
        src.z * src.w + dst.z * (1 - src.w),
        src.w + dst.w * (1 - src.w), // Alpha compositing
      );

    case 'additive':
      // Blending additif : les couleurs s'additionnent
      // Utile pour : feu, lumiere, particules brillantes
      return Vec4.rgba(
        Math.min(1, src.x * src.w + dst.x),
        Math.min(1, src.y * src.w + dst.y),
        Math.min(1, src.z * src.w + dst.z),
        dst.w,
      );

    case 'multiply':
      // Blending multiplicatif : les couleurs se multiplient
      // Utile pour : ombres, vitraux, filtres de couleur
      return Vec4.rgba(
        src.x * dst.x,
        src.y * dst.y,
        src.z * dst.z,
        src.w * dst.w,
      );
  }
}
```

---

## Framebuffer et double buffering

```
DOUBLE BUFFERING ET SWAP CHAIN
════════════════════════════════════════════════════════════════

Sans double buffering :
  Le rendu ecrit DIRECTEMENT dans l'image affichee.
  → L'utilisateur voit le dessin en cours → SCINTILLEMENT (tearing)

Avec double buffering :
  ┌──────────┐    ┌──────────┐
  │ FRONT    │    │ BACK     │
  │ buffer   │    │ buffer   │
  │ (affiche)│    │ (rendu)  │
  └──────────┘    └──────────┘
       ↕ SWAP (echanger) ↕

  1. Le GPU dessine dans le BACK buffer (invisible)
  2. Quand le rendu est termine, on ECHANGE front et back
  3. L'ancien back devient le front (affiche)
  4. L'ancien front devient le back (on dessine dedans)

  → L'utilisateur ne voit jamais un frame incomplet

Triple buffering :
  3 buffers au lieu de 2 → le GPU n'attend jamais
  → Utilise plus de memoire mais reduit la latence

Swap chain (WebGPU) :
  WebGPU appelle ce systeme "swap chain" ou "canvas configuration".
  context.configure({ device, format: 'bgra8unorm', ... });
  const texture = context.getCurrentTexture(); // → back buffer actuel
```

---

## Forward vs Deferred Rendering

```
FORWARD vs DEFERRED RENDERING
════════════════════════════════════════════════════════════════

FORWARD RENDERING (classique) :
  Pour chaque objet :
    Pour chaque lumiere :
      Calculer l'eclairage dans le fragment shader

  Complexite : O(objets × lumieres)
  → Simple, fonctionne bien avec peu de lumieres (< 10)

  Avantages :
    - Simple a implementer
    - Supporte la transparence facilement
    - Compatible avec MSAA (antialiasing)
  Inconvenients :
    - Performance chute avec beaucoup de lumieres
    - Calcul gaspille sur les fragments masques (overdraw)


DEFERRED RENDERING :
  Passe 1 (G-Buffer) : Pour chaque objet :
    Stocker position, normale, couleur, roughness... dans des textures

  Passe 2 (Lighting) : Pour chaque lumiere :
    Lire le G-Buffer et calculer l'eclairage

  Complexite : O(objets) + O(lumieres × pixels)
  → Ideal pour des centaines de lumieres

  Avantages :
    - Decouple la geometrie de l'eclairage
    - Pas de calcul gaspille (un seul fragment par pixel)
    - Eclairage en screen-space
  Inconvenients :
    - G-Buffer utilise BEAUCOUP de memoire (4-5 textures full-screen)
    - Transparence tres difficile (necessite des passes supplementaires)
    - MSAA incompatible directement (on utilise d'autres techniques AA)


```

---

## Software Rasterizer simplifie

Implementons un rasteriseur logiciel complet en TypeScript pour comprendre chaque étape du pipeline.

```typescript
// ── software-rasterizer.ts ────────────────────────────

/**
 * Framebuffer logiciel : un tableau 2D de couleurs + depth.
 */
class Framebuffer {
  readonly width: number;
  readonly height: number;
  readonly colorBuffer: Vec4[];       // RGBA par pixel
  readonly depthBuffer: number[];      // profondeur par pixel

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    const size = width * height;
    this.colorBuffer = new Array(size);
    this.depthBuffer = new Array(size);
    this.clear();
  }

  /** Effacer le framebuffer */
  clear(clearColor: Vec4 = Vec4.rgba(0, 0, 0, 1), clearDepth: number = 1): void {
    for (let i = 0; i < this.colorBuffer.length; i++) {
      this.colorBuffer[i] = clearColor;
      this.depthBuffer[i] = clearDepth;
    }
  }

  /** Index lineaire d'un pixel */
  index(x: number, y: number): number {
    return y * this.width + x;
  }

  /** Ecrire un pixel avec depth test */
  setPixel(x: number, y: number, color: Vec4, depth: number): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;

    const idx = this.index(x, y);

    // Depth test : on ecrit seulement si le fragment est plus proche
    if (depth < this.depthBuffer[idx]) {
      this.colorBuffer[idx] = color;
      this.depthBuffer[idx] = depth;
    }
  }
}

/**
 * Rasteriser un triangle dans le framebuffer.
 *
 * Les coordonnees des sommets sont en ECRAN (pixels).
 * Les attributs sont interpoles via les coordonnees barycentriques.
 */
function rasterizeTriangle(
  fb: Framebuffer,
  // Positions ecran (apres MVP + viewport transform)
  v0: Vec2, v1: Vec2, v2: Vec2,
  // Profondeurs NDC
  z0: number, z1: number, z2: number,
  // Couleurs par vertex
  c0: Vec3, c1: Vec3, c2: Vec3,
): void {
  // 1. Bounding box du triangle (limitee au framebuffer)
  const minX = Math.max(0, Math.floor(Math.min(v0.x, v1.x, v2.x)));
  const maxX = Math.min(fb.width - 1, Math.ceil(Math.max(v0.x, v1.x, v2.x)));
  const minY = Math.max(0, Math.floor(Math.min(v0.y, v1.y, v2.y)));
  const maxY = Math.min(fb.height - 1, Math.ceil(Math.max(v0.y, v1.y, v2.y)));

  // 2. Aire totale du triangle (pour normaliser les poids barycentriques)
  const area = edgeFunction(v0, v1, v2);

  // Triangle degenere (aire nulle)
  if (Math.abs(area) < 0.001) return;

  // 3. Pour chaque pixel de la bounding box
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const p = new Vec2(x + 0.5, y + 0.5); // centre du pixel

      // 4. Calculer les coordonnees barycentriques
      const w0 = edgeFunction(v1, v2, p) / area;
      const w1 = edgeFunction(v2, v0, p) / area;
      const w2 = edgeFunction(v0, v1, p) / area;

      // 5. Tester si le point est dans le triangle
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;

      // 6. Interpoler la profondeur
      const depth = w0 * z0 + w1 * z1 + w2 * z2;

      // 7. Interpoler la couleur
      const color = interpolateVec3(w0, w1, w2, c0, c1, c2);

      // 8. Ecrire le pixel (avec depth test)
      fb.setPixel(x, y, Vec4.rgba(color.x, color.y, color.z, 1), depth);
    }
  }
}

// --- Demonstration ---

function softwareRenderDemo(): void {
  const fb = new Framebuffer(80, 40);

  // Triangle colore (coordonnees en pixels)
  rasterizeTriangle(
    fb,
    new Vec2(40, 5),   // sommet haut (centre)
    new Vec2(10, 35),  // sommet bas-gauche
    new Vec2(70, 35),  // sommet bas-droit
    0.5,               // profondeurs
    0.5,
    0.5,
    new Vec3(1, 0, 0), // rouge
    new Vec3(0, 1, 0), // vert
    new Vec3(0, 0, 1), // bleu
  );

  // Afficher le resultat en ASCII
  let output = '';
  for (let y = 0; y < fb.height; y++) {
    for (let x = 0; x < fb.width; x++) {
      const c = fb.colorBuffer[fb.index(x, y)];
      if (c.x + c.y + c.z > 0.01) {
        // Convertir la couleur en caractere ASCII
        const brightness = c.x * 0.299 + c.y * 0.587 + c.z * 0.114;
        const chars = ' .:-=+*#%@';
        const idx = Math.floor(brightness * (chars.length - 1));
        output += chars[idx];
      } else {
        output += ' ';
      }
    }
    output += '\n';
  }
  console.log(output);
}

softwareRenderDemo();
```

Le pipeline complet enchaine ces étapes : transformer tous les vertices via MVP (vertex shader), puis pour chaque triangle appliquer le backface culling, le clipping simplifie, et enfin `rasterizeTriangle()` avec depth test.

---

## Exercice pratique

### Enonce

1. Implementez `edgeFunction(v0, v1, p)` et `barycentric(p, v0, v1, v2)`
2. Implementez `rasterizeTriangle()` qui dessine un triangle dans un framebuffer
3. Rendez un triangle colore (rouge, vert, bleu aux 3 sommets) et verifiez l'interpolation des couleurs
4. Ajoutez le depth test : dessinez deux triangles qui se chevauchent et verifiez que le plus proche masque le plus loin

<details>
<summary>Voir la solution</summary>

```typescript
// --- 1. Edge function et barycentric ---

function edgeFunction(v0: Vec2, v1: Vec2, p: Vec2): number {
  return (v1.x - v0.x) * (p.y - v0.y) - (v1.y - v0.y) * (p.x - v0.x);
}

function barycentric(
  p: Vec2,
  v0: Vec2,
  v1: Vec2,
  v2: Vec2,
): { w0: number; w1: number; w2: number } | null {
  const area = edgeFunction(v0, v1, v2);
  if (Math.abs(area) < 0.001) return null;

  const w0 = edgeFunction(v1, v2, p) / area;
  const w1 = edgeFunction(v2, v0, p) / area;
  const w2 = edgeFunction(v0, v1, p) / area;

  if (w0 < 0 || w1 < 0 || w2 < 0) return null;
  return { w0, w1, w2 };
}

// --- 2. Rasterize triangle (meme code que plus haut) ---

function rasterizeTriangle(
  fb: Framebuffer,
  v0: Vec2, v1: Vec2, v2: Vec2,
  z0: number, z1: number, z2: number,
  c0: Vec3, c1: Vec3, c2: Vec3,
): void {
  const minX = Math.max(0, Math.floor(Math.min(v0.x, v1.x, v2.x)));
  const maxX = Math.min(fb.width - 1, Math.ceil(Math.max(v0.x, v1.x, v2.x)));
  const minY = Math.max(0, Math.floor(Math.min(v0.y, v1.y, v2.y)));
  const maxY = Math.min(fb.height - 1, Math.ceil(Math.max(v0.y, v1.y, v2.y)));

  const area = edgeFunction(v0, v1, v2);
  if (Math.abs(area) < 0.001) return;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const p = new Vec2(x + 0.5, y + 0.5);

      const w0 = edgeFunction(v1, v2, p) / area;
      const w1 = edgeFunction(v2, v0, p) / area;
      const w2 = edgeFunction(v0, v1, p) / area;

      if (w0 < 0 || w1 < 0 || w2 < 0) continue;

      const depth = w0 * z0 + w1 * z1 + w2 * z2;
      const r = w0 * c0.x + w1 * c1.x + w2 * c2.x;
      const g = w0 * c0.y + w1 * c1.y + w2 * c2.y;
      const b = w0 * c0.z + w1 * c1.z + w2 * c2.z;

      fb.setPixel(x, y, Vec4.rgba(r, g, b, 1), depth);
    }
  }
}

// --- 3. Triangle colore ---

const fb = new Framebuffer(40, 20);

rasterizeTriangle(
  fb,
  new Vec2(20, 2),   // haut
  new Vec2(5, 18),   // bas-gauche
  new Vec2(35, 18),  // bas-droit
  0.5, 0.5, 0.5,
  new Vec3(1, 0, 0), // rouge
  new Vec3(0, 1, 0), // vert
  new Vec3(0, 0, 1), // bleu
);

// Verification : le centre du triangle devrait etre gris (~0.33 chaque composante)
const centerIdx = fb.index(20, 12);
const centerColor = fb.colorBuffer[centerIdx];
console.log(`Centre: R=${centerColor.x.toFixed(2)} G=${centerColor.y.toFixed(2)} B=${centerColor.z.toFixed(2)}`);
// Attendu : ~0.33, ~0.33, ~0.33 (melange egal des 3 couleurs)

// --- 4. Depth test ---

const fb2 = new Framebuffer(40, 20);

// Triangle 1 : LOIN (depth = 0.8), rouge
rasterizeTriangle(
  fb2,
  new Vec2(5, 2), new Vec2(5, 18), new Vec2(35, 10),
  0.8, 0.8, 0.8,
  new Vec3(1, 0, 0), new Vec3(1, 0, 0), new Vec3(1, 0, 0),
);

// Triangle 2 : PROCHE (depth = 0.3), bleu, chevauche le premier
rasterizeTriangle(
  fb2,
  new Vec2(10, 5), new Vec2(10, 15), new Vec2(30, 10),
  0.3, 0.3, 0.3,
  new Vec3(0, 0, 1), new Vec3(0, 0, 1), new Vec3(0, 0, 1),
);

// Verification : au pixel (20, 10), on devrait voir le bleu (plus proche)
const overlapIdx = fb2.index(20, 10);
const overlapColor = fb2.colorBuffer[overlapIdx];
console.log(`Overlap pixel: R=${overlapColor.x.toFixed(2)} B=${overlapColor.z.toFixed(2)}`);
// Attendu : R=0.00 B=1.00 (bleu devant rouge)

// Verification depth buffer
const overlapDepth = fb2.depthBuffer[overlapIdx];
console.log(`Depth at overlap: ${overlapDepth.toFixed(2)}`);
// Attendu : 0.30 (le triangle bleu plus proche)
```

</details>

---

## Résumé

| Concept | Explication |
|---------|-------------|
| Input Assembly | Lecture des vertex buffers et index buffers, topologie des primitives |
| Vertex Buffer | Donnees par sommet : position, normale, UV, couleur (Float32Array entrelace) |
| Index Buffer | Indices de reutilisation des sommets (evite la duplication) |
| Topologie | Triangle list, triangle strip, line list, point list |
| Vertex Shader | Programmable — transforme chaque sommet via MVP (parallele) |
| Normal Matrix | `transpose(inverse(model))` — corrige les normales après echelle non-uniforme |
| Clipping | Decoupe des triangles contre les 6 plans du frustum |
| Rasterisation | Conversion triangle → fragments via edge functions |
| Coordonnees barycentriques | Poids (w0, w1, w2) pour interpoler les attributs dans le triangle |
| Fragment Shader | Programmable — calcule la couleur de chaque fragment (parallele) |
| Depth Test | Compare la profondeur du fragment avec le depth buffer |
| Stencil Test | Masque 8 bits par pixel — controle ou le rendu est autorise |
| Alpha Blending | Melange couleurs pour la transparence — l'ordre de dessin compte |
| Double Buffering | Front/back buffer alternes — evite le scintillement |
| Forward Rendering | O(objets x lumieres) — simple, bon avec peu de lumieres |
| Deferred Rendering | G-Buffer + lighting pass — ideal pour beaucoup de lumieres |

---

## Pour aller plus loin

- [Scratchapixel — Rasterization](https://www.scratchapixel.com/lessons/3d-basic-rendering/rasterization-practical-implementation/rasterization-stage.html)
- [A trip through the Graphics Pipeline (Fabian Giesen)](https://fgiesen.wordpress.com/2011/07/09/a-trip-through-the-graphics-pipeline-2011-index/)
- [Learn OpenGL — Hello Triangle](https://learnopengl.com/Getting-started/Hello-Triangle)
- [WebGPU Render Pipeline](https://gpuweb.github.io/gpuweb/#render-pipeline)
- [Tiny Renderer (ssloy)](https://github.com/ssloy/tinyrenderer/wiki)

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 04 pipeline](../screencasts/screencast-04-pipeline.md)
2. **Lab** : [lab-04-pipeline-rendu](../labs/lab-04-pipeline-rendu/README)
3. **Visualisation** : [Pipeline de rendu](../visualizations/rendering-pipeline.html)
4. **Quiz** : [quiz 04 pipeline](../quizzes/quiz-04-pipeline.html)
:::
