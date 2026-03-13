# Module 07 — Shaders, buffers et textures

| Difficulte | Duree estimee | Lab | Quiz |
|------------|---------------|-----|------|
| 4/5        | 120 min       | [Lab 07](../labs/lab-07-shaders-buffers-textures/) | [Quiz 07](../quizzes/quiz-07-shaders-buffers-textures.html) |

## Objectifs pedagogiques

A la fin de ce module, vous serez capable de :

- Creer et utiliser des Vertex Buffer Objects (VBO) et Vertex Array Objects (VAO)
- Configurer `vertexAttribPointer` avec stride et offset pour des donnees entrelacees
- Utiliser des index buffers (EBO) pour eviter la duplication de sommets
- Passer des uniforms au shader (matrices, vecteurs, scalaires)
- Comprendre les varyings et l'interpolation automatique
- Charger et configurer des textures 2D
- Gerer le filtrage (NEAREST, LINEAR, mipmaps) et le wrapping
- Utiliser plusieurs textures simultanement (texture units)
- Effectuer du render-to-texture avec les Framebuffer Objects (FBO)
- Implementer un eclairage Phong complet en GLSL

---

<details>
<summary>Rappel du module precedent — WebGL fondamentaux et GLSL</summary>

Avant de continuer, verifie que tu maitrises ces points :

1. **Comment obtient-on un contexte WebGL 2 ?**
   `canvas.getContext('webgl2')` — retourne `null` si non supporte.

2. **Quelles sont les 2 etapes programmables du pipeline ?**
   Le Vertex Shader (transforme les sommets) et le Fragment Shader (calcule la couleur de chaque pixel).

3. **Quel est le systeme de coordonnees de sortie du vertex shader ?**
   Le clip space : x, y, z dans [-1, +1]. Les positions sont ecrites dans `gl_Position`.

4. **Comment compiler un shader ?**
   `gl.createShader()` → `gl.shaderSource()` → `gl.compileShader()` → verifier avec `gl.getShaderParameter(shader, gl.COMPILE_STATUS)`.

5. **Pourquoi faut-il `precision highp float;` dans le fragment shader ?**
   Parce que GLSL ES 3.00 n'a pas de precision par defaut pour les floats dans le fragment shader (contrairement au vertex shader ou `highp` est le defaut).

</details>

---

## 1. Analogie — VBO, VAO et EBO comme un tableur

Si tu connais Excel ou Google Sheets, les buffers WebGL fonctionnent de maniere similaire :

```
TABLEUR (Excel)                        WEBGL
===============                        =====

Classeur entier                        VAO (Vertex Array Object)
  = configuration globale                = "memorise" comment lire les buffers

Feuille de donnees                     VBO (Vertex Buffer Object)
  = les cellules avec les valeurs        = les donnees brutes en memoire GPU

Colonnes (A, B, C...)                  Attributs (position, normal, uv)
  = chaque colonne a un type             = chaque attribut a un type et une taille

Index de lignes (1, 2, 3...)           EBO (Element Buffer Object / Index Buffer)
  = reference des lignes sans              = reference des sommets sans
    dupliquer le contenu                     dupliquer les donnees

Mise en forme conditionnelle           Uniforms
  = appliquee globalement                = meme valeur pour tous les sommets
    a toute la selection                   d'un draw call
```

:::tip Analogie cle
Le **VAO** est comme un "profil de lecture" sauvegarde. Au lieu de reconfigurer les colonnes a chaque fois qu'on ouvre le fichier, le VAO memorise "la colonne A contient des positions vec3, la colonne B des couleurs vec4, etc."
:::

---

## 2. Vertex Buffer Objects (VBO)

Un VBO est un bloc de memoire sur le GPU qui contient les donnees des sommets.

### 2.1 Creer et remplir un VBO

```typescript
// Donnees d'un carre (4 sommets, chacun avec position XYZ et couleur RGB)
const vertices = new Float32Array([
  // Position (x, y, z)   Couleur (r, g, b)
  -0.5,  0.5,  0.0,       1.0, 0.0, 0.0,   // haut-gauche (rouge)
   0.5,  0.5,  0.0,       0.0, 1.0, 0.0,   // haut-droit (vert)
   0.5, -0.5,  0.0,       0.0, 0.0, 1.0,   // bas-droit (bleu)
  -0.5, -0.5,  0.0,       1.0, 1.0, 0.0,   // bas-gauche (jaune)
]);

// Creer le buffer sur le GPU
const vbo = gl.createBuffer();
if (!vbo) throw new Error('Impossible de creer le VBO');

// Binder le buffer (le rendre "actif" pour les prochaines operations)
gl.bindBuffer(gl.ARRAY_BUFFER, vbo);

// Envoyer les donnees du CPU vers le GPU
gl.bufferData(
  gl.ARRAY_BUFFER,    // cible : c'est un buffer de sommets
  vertices,           // les donnees
  gl.STATIC_DRAW,     // indice d'utilisation (aide le driver a optimiser)
);
```

### 2.2 Indices d'utilisation (usage hints)

| Usage | Signification | Quand l'utiliser |
|-------|---------------|-----------------|
| `gl.STATIC_DRAW` | Donnees ecrites une fois, lues souvent | Geometrie statique (la majorite des cas) |
| `gl.DYNAMIC_DRAW` | Donnees modifiees regulierement | Particules, morphing, animations CPU |
| `gl.STREAM_DRAW` | Donnees ecrites et lues une seule fois | Donnees temporaires |

### 2.3 Sous-buffers avec bufferSubData

```typescript
// Mettre a jour une partie du buffer sans tout re-envoyer
// Utile pour les objets dynamiques (particules, UI)

const newPosition = new Float32Array([0.0, 0.8, 0.0]); // nouvelle position du sommet 0

gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
gl.bufferSubData(
  gl.ARRAY_BUFFER,
  0,                // offset en bytes (debut du buffer)
  newPosition,      // nouvelles donnees
);
```

---

## 3. Vertex Array Objects (VAO)

Le VAO est un conteneur qui **enregistre** la configuration des attributs de sommets. Sans VAO, il faudrait reconfigurer `vertexAttribPointer` a chaque frame pour chaque objet.

### 3.1 Creer et configurer un VAO

```typescript
// Creer le VAO
const vao = gl.createVertexArray();
if (!vao) throw new Error('Impossible de creer le VAO');

// Binder le VAO — tout ce qu'on configure ensuite sera "enregistre" dedans
gl.bindVertexArray(vao);

// Binder le VBO (les donnees)
gl.bindBuffer(gl.ARRAY_BUFFER, vbo);

// Configuration de l'attribut position
const FLOAT_SIZE = 4;   // un float = 4 bytes
const STRIDE = 6 * FLOAT_SIZE;  // 6 floats par sommet (3 pos + 3 color) = 24 bytes

const posLoc = gl.getAttribLocation(program, 'a_position');
gl.enableVertexAttribArray(posLoc);
gl.vertexAttribPointer(
  posLoc,       // index de l'attribut
  3,            // nombre de composantes (vec3)
  gl.FLOAT,     // type
  false,        // normaliser ? (non pour les positions)
  STRIDE,       // stride : distance entre 2 sommets consecutifs
  0,            // offset : ou commence cet attribut dans le sommet
);

// Configuration de l'attribut couleur
const colorLoc = gl.getAttribLocation(program, 'a_color');
gl.enableVertexAttribArray(colorLoc);
gl.vertexAttribPointer(
  colorLoc,
  3,            // vec3 (r, g, b)
  gl.FLOAT,
  false,
  STRIDE,
  3 * FLOAT_SIZE,  // offset : apres les 3 floats de position = 12 bytes
);

// Debinder le VAO — la configuration est sauvegardee
gl.bindVertexArray(null);
```

### 3.2 Visualisation du stride et de l'offset

```
Buffer memoire (donnees entrelacees / interleaved) :

Byte:  0    4    8    12   16   20   24   28   32   36   40   44
     ┌────┬────┬────┬────┬────┬────┬────┬────┬────┬────┬────┬────┐
     │ x0 │ y0 │ z0 │ r0 │ g0 │ b0 │ x1 │ y1 │ z1 │ r1 │ g1 │ b1 │
     └────┴────┴────┴────┴────┴────┴────┴────┴────┴────┴────┴────┘
     │◄──── Sommet 0 ────►│◄──── Sommet 1 ────►│
     │◄─── STRIDE = 24 ──►│◄─── STRIDE = 24 ──►│

     a_position: size=3, offset=0    a_color: size=3, offset=12
              │                               │
              ▼                               ▼
     ┌────┬────┬────┐               ┌────┬────┬────┐
     │ x0 │ y0 │ z0 │               │ r0 │ g0 │ b0 │
     └────┴────┴────┘               └────┴────┴────┘

Alternative : buffers SEPARES (non-interleaved) :

Buffer position :  [x0, y0, z0, x1, y1, z1, ...]  stride=0
Buffer couleur  :  [r0, g0, b0, r1, g1, b1, ...]  stride=0
→ Plus simple mais moins cache-friendly sur le GPU
```

### 3.3 Le workflow au rendu

```typescript
// A chaque frame, pour dessiner un objet :
gl.useProgram(program);
gl.bindVertexArray(vao);       // restaure toute la config des attributs
gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
gl.bindVertexArray(null);

// Dessiner un autre objet = binder un autre VAO
gl.bindVertexArray(vaoSphere);
gl.drawArrays(gl.TRIANGLES, 0, sphereVertexCount);
gl.bindVertexArray(null);
```

---

## 4. Index Buffers (EBO)

### 4.1 Le probleme : sommets dupliques

Un carre est compose de 2 triangles. Sans index buffer, il faut 6 sommets (2 sont dupliques) :

```
Sans index buffer (6 sommets) :         Avec index buffer (4 sommets + 6 indices) :

Triangle 1 : A, B, C                   Sommets : A(0), B(1), C(2), D(3)
Triangle 2 : A, C, D                   Indices : [0, 1, 2,  0, 2, 3]
                                                   ▲  ▲  ▲   ▲  ▲  ▲
A ─────── B                                        │  │  │   │  │  │
│ \       │                             Triangle 1:─┘  │  │   │  │  │
│  \  T1  │                             Triangle 2:────────────┘  │  │
│   \     │
│ T2 \    │     6 sommets               4 sommets + 6 indices
│     \   │     = 6 * 6 floats          = 4 * 6 floats + 6 ints
│      \  │     = 144 bytes              = 96 + 12 = 108 bytes
D ─────── C
                                        Economie : 25% ici, jusqu'a 50-70%
                                        sur des modeles complexes (un sommet
                                        partage par 4-6 faces)
```

### 4.2 Implementation

```typescript
// Les 4 sommets uniques du carre
const vertices = new Float32Array([
  // Position (x, y, z)    Couleur (r, g, b)
  -0.5,  0.5,  0.0,        1.0, 0.0, 0.0,   // 0: haut-gauche
   0.5,  0.5,  0.0,        0.0, 1.0, 0.0,   // 1: haut-droit
   0.5, -0.5,  0.0,        0.0, 0.0, 1.0,   // 2: bas-droit
  -0.5, -0.5,  0.0,        1.0, 1.0, 0.0,   // 3: bas-gauche
]);

// Les indices : chaque groupe de 3 forme un triangle
const indices = new Uint16Array([
  0, 1, 2,   // triangle 1 : haut-gauche, haut-droit, bas-droit
  0, 2, 3,   // triangle 2 : haut-gauche, bas-droit, bas-gauche
]);

// Setup dans le VAO
gl.bindVertexArray(vao);

// VBO (meme qu'avant)
gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
// ... vertexAttribPointer pour position et couleur ...

// EBO (Element Buffer Object)
const ebo = gl.createBuffer()!;
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

gl.bindVertexArray(null);

// Dessiner avec les indices
gl.bindVertexArray(vao);
gl.drawElements(
  gl.TRIANGLES,       // mode
  indices.length,     // nombre d'indices (6)
  gl.UNSIGNED_SHORT,  // type des indices (Uint16Array)
  0,                  // offset dans le buffer d'indices
);
gl.bindVertexArray(null);
```

:::warning Le EBO est lie au VAO
L'EBO binde avec `gl.ELEMENT_ARRAY_BUFFER` est enregistre dans le VAO. Ne le debindez pas avant de debinder le VAO, sinon il sera "oublie".
:::

---

## 5. Uniforms

Les uniforms sont des valeurs constantes pour l'ensemble d'un draw call. Ils servent a passer les matrices de transformation, les parametres d'eclairage, les couleurs, etc.

### 5.1 Types et fonctions

```typescript
// Recuperer la location d'un uniform (a faire une seule fois, cacher le resultat)
const mvpLoc = gl.getUniformLocation(program, 'u_modelViewProjection');
const colorLoc = gl.getUniformLocation(program, 'u_color');
const timeLoc = gl.getUniformLocation(program, 'u_time');

// Passer des valeurs (le programme doit etre actif avec gl.useProgram)
gl.useProgram(program);

// Scalaires
gl.uniform1f(timeLoc, performance.now() / 1000);       // float
gl.uniform1i(textureLoc, 0);                            // int (texture unit)

// Vecteurs
gl.uniform2f(resolutionLoc, canvas.width, canvas.height); // vec2
gl.uniform3f(colorLoc, 1.0, 0.5, 0.0);                   // vec3
gl.uniform4f(colorLoc, 1.0, 0.5, 0.0, 1.0);              // vec4

// Matrices (le 2eme argument est "transpose" — toujours false en WebGL)
gl.uniformMatrix3fv(normalMatLoc, false, normalMatrix);   // mat3
gl.uniformMatrix4fv(mvpLoc, false, mvpMatrix);            // mat4

// Vecteurs depuis un tableau
gl.uniform3fv(lightPosLoc, new Float32Array([10, 20, 30])); // vec3 depuis array
```

### 5.2 Tableau recapitulatif

| GLSL type | Fonction JS | Exemple |
|-----------|------------|---------|
| `float` | `gl.uniform1f(loc, v)` | Temps, intensite |
| `int` | `gl.uniform1i(loc, v)` | Texture unit, index |
| `vec2` | `gl.uniform2f(loc, x, y)` | Resolution, UV offset |
| `vec3` | `gl.uniform3f(loc, x, y, z)` | Position, couleur RGB |
| `vec4` | `gl.uniform4f(loc, x, y, z, w)` | Couleur RGBA |
| `mat3` | `gl.uniformMatrix3fv(loc, false, m)` | Normal matrix |
| `mat4` | `gl.uniformMatrix4fv(loc, false, m)` | MVP, model, view, projection |

---

## 6. Varyings — interpolation entre vertex et fragment

Les varyings sont des valeurs calculees par le vertex shader et **interpolees automatiquement** par le rasterizer avant d'arriver au fragment shader.

### 6.1 Comment fonctionne l'interpolation

```
Vertex Shader produit :                Fragment Shader recoit :
                                       (valeurs interpolees)
Sommet A : v_color = (1, 0, 0)  rouge
                                         ┌────────────────┐
Sommet B : v_color = (0, 1, 0)  vert     │   Fragment au  │
                                         │   centre du    │
Sommet C : v_color = (0, 0, 1)  bleu     │   triangle :   │
                                         │                │
                                         │ v_color ≈      │
                                         │ (0.33, 0.33,   │
                                         │  0.33)         │
                                         │                │
                                         │ = moyenne      │
                                         │   ponderee     │
                                         │   par la       │
                                         │   position     │
                                         └────────────────┘

L'interpolation est barycentrique :
Pour un fragment a la position P dans le triangle ABC,
la valeur interpolee = w_a * val_A + w_b * val_B + w_c * val_C
ou w_a + w_b + w_c = 1 (coordonnees barycentriques)
```

### 6.2 Exemple : triangle avec gradient de couleurs

```glsl
// vertex.glsl
#version 300 es

in vec3 a_position;
in vec3 a_color;

out vec3 v_color;   // "out" dans le vertex shader = varying

void main() {
  gl_Position = vec4(a_position, 1.0);
  v_color = a_color;  // passe tel quel au rasterizer
}
```

```glsl
// fragment.glsl
#version 300 es
precision highp float;

in vec3 v_color;    // "in" dans le fragment shader = varying interpole

out vec4 fragColor;

void main() {
  // v_color est ici une valeur INTERPOLEE entre les 3 sommets du triangle
  fragColor = vec4(v_color, 1.0);
}
```

### 6.3 Interpolation `flat` (pas d'interpolation)

```glsl
// Pour passer un entier ou une valeur non-interpolee :
flat out int v_instanceId;   // dans le vertex shader
flat in int v_instanceId;    // dans le fragment shader
// Le fragment recoit la valeur du PREMIER sommet du triangle (provoking vertex)
```

---

## 7. Textures 2D

### 7.1 Charger une image comme texture

```typescript
// texture-utils.ts — Chargement de texture depuis une image

async function loadTexture(
  gl: WebGL2RenderingContext,
  url: string,
): Promise<WebGLTexture> {
  const texture = gl.createTexture();
  if (!texture) throw new Error('Impossible de creer la texture');

  // Texture temporaire 1x1 rose (visible si l'image met du temps a charger)
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,                    // mip level
    gl.RGBA,              // format interne
    1, 1,                 // taille 1x1
    0,                    // border (toujours 0)
    gl.RGBA,              // format source
    gl.UNSIGNED_BYTE,     // type des pixels
    new Uint8Array([255, 0, 255, 255]),  // rose vif = "texture manquante"
  );

  // Charger l'image reelle
  const image = new Image();
  image.crossOrigin = 'anonymous';

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`Echec chargement image: ${url}`));
    image.src = url;
  });

  // Envoyer l'image au GPU
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,                    // mip level 0 (pleine resolution)
    gl.RGBA,              // format interne GPU
    gl.RGBA,              // format source
    gl.UNSIGNED_BYTE,     // type des pixels source
    image,                // source HTML Image
  );

  // Generer les mipmaps (versions reduites pour le LOD)
  gl.generateMipmap(gl.TEXTURE_2D);

  return texture;
}
```

### 7.2 Parametres de texture

```typescript
function configureTexture(gl: WebGL2RenderingContext): void {
  // --- FILTRAGE ---

  // Minification filter (texture plus grande que l'ecran → on reduit)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);

  // Magnification filter (texture plus petite que l'ecran → on agrandit)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  // --- WRAPPING ---

  // Que faire quand les coordonnees UV sortent de [0, 1] ?
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);  // axe U (horizontal)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);  // axe V (vertical)
}
```

### 7.3 Filtrage : NEAREST vs LINEAR vs mipmaps

```
NEAREST (pixelise) :            LINEAR (lisse) :
  Prend le pixel le plus          Moyenne ponderee des 4 pixels
  proche → look "retro"          les plus proches → lisse

  ┌──┬──┬──┐                     ┌──┬──┬──┐
  │  │██│  │  → ██                │  │██│  │  → valeur moyenne
  ├──┼──┼──┤                     ├──┼──┼──┤    des 4 voisins
  │  │  │  │                     │  │  │  │
  └──┴──┴──┘                     └──┴──┴──┘

MIPMAPS :
  Versions pre-calculees de la texture a differentes resolutions.
  Le GPU choisit le mip level le plus adapte a la distance.

  Mip 0: 256x256  (original)
  Mip 1: 128x128
  Mip 2: 64x64
  Mip 3: 32x32
  ...
  Mip 8: 1x1
```

| Filtre | Min | Mag | Qualite | Performance |
|--------|-----|-----|---------|-------------|
| `NEAREST` | Oui | Oui | Pixelise | Rapide |
| `LINEAR` | Oui | Oui | Lisse | Moyen |
| `NEAREST_MIPMAP_NEAREST` | Oui | Non | Moyen | Rapide |
| `LINEAR_MIPMAP_LINEAR` | Oui | Non | Meilleur (trilineaire) | Lent |

### 7.4 Modes de wrapping

```
UV = (1.3, 0.7) — que fait-on quand U > 1.0 ?

REPEAT :                CLAMP_TO_EDGE :         MIRRORED_REPEAT :
Repete la texture       Etire le dernier pixel  Repete en miroir

┌───┬───┬───┐          ┌───┬────────┐          ┌───┬───┬───┐
│ A │ A │ A │          │ A │ bord → │          │ A │ A'│ A │
│   │   │   │          │   │ etire  │          │   │(m)│   │
└───┴───┴───┘          └───┴────────┘          └───┴───┴───┘
Tuile infinie          Pas de repetition       Pas de couture visible
```

---

## 8. Multiple textures — texture units

Le GPU possede plusieurs "slots" appeles texture units. On peut en utiliser plusieurs simultanement dans un meme shader.

```typescript
// Charger 2 textures
const diffuseTexture = await loadTexture(gl, 'diffuse.jpg');
const normalTexture = await loadTexture(gl, 'normal.jpg');

// Activer la texture unit 0 et y binder la diffuse map
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, diffuseTexture);

// Activer la texture unit 1 et y binder la normal map
gl.activeTexture(gl.TEXTURE1);
gl.bindTexture(gl.TEXTURE_2D, normalTexture);

// Dire au shader quelle texture unit correspond a quel uniform sampler
gl.useProgram(program);
gl.uniform1i(gl.getUniformLocation(program, 'u_diffuseMap'), 0);  // unit 0
gl.uniform1i(gl.getUniformLocation(program, 'u_normalMap'), 1);   // unit 1
```

```glsl
// fragment.glsl
#version 300 es
precision highp float;

uniform sampler2D u_diffuseMap;   // connecte a la texture unit 0
uniform sampler2D u_normalMap;    // connecte a la texture unit 1

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  vec4 diffuse = texture(u_diffuseMap, v_texCoord);
  vec3 normal = texture(u_normalMap, v_texCoord).rgb * 2.0 - 1.0;
  // ... utiliser les deux textures ...
  fragColor = diffuse;
}
```

:::tip Nombre de texture units
WebGL 2 garantit au minimum **16 texture units** dans le fragment shader (`gl.MAX_TEXTURE_IMAGE_UNITS`). En pratique, la plupart des GPU en supportent 32.
:::

---

## 9. Framebuffer Objects (FBO) — render-to-texture

Au lieu de dessiner directement a l'ecran, on peut dessiner dans une texture. C'est la base du post-processing, des ombres (shadow maps), des reflexions, etc.

### 9.1 Principe

```
Rendu normal :                    Render-to-texture (FBO) :

Vertex + Fragment Shader          Vertex + Fragment Shader
        │                                 │
        ▼                                 ▼
┌──────────────┐                 ┌──────────────────┐
│ Default      │                 │ Framebuffer      │
│ Framebuffer  │                 │ personnalise     │
│              │                 │                  │
│ → ecran      │                 │ → texture        │
└──────────────┘                 │ → renderbuffer   │
                                 └──────────────────┘
                                          │
                                 On peut ensuite LIRE
                                 cette texture dans un
                                 autre shader (post-fx,
                                 shadow map, reflet...)
```

### 9.2 Implementation complete

```typescript
interface RenderTarget {
  framebuffer: WebGLFramebuffer;
  colorTexture: WebGLTexture;
  depthRenderbuffer: WebGLRenderbuffer;
  width: number;
  height: number;
}

function createRenderTarget(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): RenderTarget {
  // 1. Creer la texture de couleur (ou on va dessiner)
  const colorTexture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, colorTexture);
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.RGBA,
    width, height, 0,
    gl.RGBA, gl.UNSIGNED_BYTE, null,  // null = pas de donnees initiales
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // 2. Creer un renderbuffer pour la profondeur (depth)
  const depthRenderbuffer = gl.createRenderbuffer()!;
  gl.bindRenderbuffer(gl.RENDERBUFFER, depthRenderbuffer);
  gl.renderbufferStorage(
    gl.RENDERBUFFER,
    gl.DEPTH_COMPONENT24,   // 24 bits de profondeur
    width, height,
  );

  // 3. Creer le framebuffer et y attacher la texture + le depth
  const framebuffer = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,     // point d'attache couleur
    gl.TEXTURE_2D,
    colorTexture,
    0,                        // mip level
  );
  gl.framebufferRenderbuffer(
    gl.FRAMEBUFFER,
    gl.DEPTH_ATTACHMENT,      // point d'attache profondeur
    gl.RENDERBUFFER,
    depthRenderbuffer,
  );

  // 4. Verifier que le framebuffer est complet
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`Framebuffer incomplet: ${status}`);
  }

  // Restaurer le framebuffer par defaut (ecran)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return { framebuffer, colorTexture, depthRenderbuffer, width, height };
}

// Utilisation :
// Pass 1 : dessiner la scene dans le FBO
gl.bindFramebuffer(gl.FRAMEBUFFER, renderTarget.framebuffer);
gl.viewport(0, 0, renderTarget.width, renderTarget.height);
gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
drawScene(gl);

// Pass 2 : dessiner un quad plein ecran avec la texture du FBO
gl.bindFramebuffer(gl.FRAMEBUFFER, null);  // retour a l'ecran
gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, renderTarget.colorTexture);
drawFullscreenQuad(gl, postProcessProgram);
```

---

## 10. GLSL avance — fonctions et patterns

### 10.1 Structs et arrays

```glsl
#version 300 es
precision highp float;

// Struct personnalisee
struct Light {
  vec3 position;
  vec3 color;
  float intensity;
  float radius;
};

// Tableau de lumieres (taille fixe en GLSL)
const int MAX_LIGHTS = 4;
uniform Light u_lights[MAX_LIGHTS];
uniform int u_numLights;

void main() {
  vec3 totalLight = vec3(0.0);
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= u_numLights) break;
    // Utiliser u_lights[i].position, u_lights[i].color, etc.
    totalLight += u_lights[i].color * u_lights[i].intensity;
  }
  // ...
}
```

:::warning Uniforms de struct
Pour envoyer un struct array depuis JavaScript, il faut acceder a chaque membre individuellement :
`gl.getUniformLocation(program, 'u_lights[0].position')`
`gl.getUniformLocation(program, 'u_lights[1].color')`
:::

### 10.2 Fonctions built-in essentielles

```glsl
// --- Interpolation et clamping ---
float a = mix(0.0, 1.0, 0.5);           // = 0.5  (interpolation lineaire)
vec3 c = mix(rouge, bleu, 0.3);          // 70% rouge + 30% bleu
float b = clamp(value, 0.0, 1.0);        // borne entre 0 et 1
float s = smoothstep(0.2, 0.8, x);       // transition douce de 0 a 1

// --- Vecteurs ---
vec3 n = normalize(normal);               // vecteur unitaire (longueur 1)
float d = dot(a, b);                      // produit scalaire
vec3 c = cross(a, b);                     // produit vectoriel
float l = length(v);                      // norme du vecteur
float dist = distance(p1, p2);            // distance entre 2 points
vec3 r = reflect(incident, normal);       // reflexion (pour specular)
vec3 t = refract(incident, normal, eta);  // refraction (pour verre, eau)

// --- Mathematiques ---
float f = fract(x);                       // partie fractionnaire (x - floor(x))
float a = abs(x);                         // valeur absolue
float m = mod(x, y);                      // modulo
float p = pow(base, exp);                 // puissance

// --- Comparaison (sans branchement → plus rapide sur GPU) ---
float s = step(edge, x);                  // 0 si x < edge, 1 sinon
// step est comme un if/else mais sans branchement
```

### 10.3 Pattern complet : eclairage Phong en GLSL

```glsl
// phong-fragment.glsl
#version 300 es
precision highp float;

// Entrees interpolees
in vec3 v_worldPosition;   // position du fragment dans le monde
in vec3 v_worldNormal;     // normale du fragment dans le monde
in vec2 v_texCoord;

// Uniforms
uniform vec3 u_cameraPosition;
uniform vec3 u_lightPosition;
uniform vec3 u_lightColor;
uniform float u_lightIntensity;

uniform vec3 u_ambientColor;
uniform float u_shininess;

uniform sampler2D u_diffuseMap;

out vec4 fragColor;

void main() {
  // Vecteurs necessaires
  vec3 N = normalize(v_worldNormal);                        // normale
  vec3 L = normalize(u_lightPosition - v_worldPosition);    // vers la lumiere
  vec3 V = normalize(u_cameraPosition - v_worldPosition);   // vers la camera
  vec3 R = reflect(-L, N);                                  // reflexion de la lumiere

  // Distance a la lumiere (pour l'attenuation)
  float dist = length(u_lightPosition - v_worldPosition);
  float attenuation = 1.0 / (1.0 + 0.09 * dist + 0.032 * dist * dist);

  // Composante ambiante
  vec3 ambient = u_ambientColor;

  // Composante diffuse (Lambert)
  float diff = max(dot(N, L), 0.0);
  vec3 diffuse = diff * u_lightColor * u_lightIntensity;

  // Composante speculaire (Blinn-Phong)
  vec3 H = normalize(L + V);  // half vector (Blinn)
  float spec = pow(max(dot(N, H), 0.0), u_shininess);
  vec3 specular = spec * u_lightColor * u_lightIntensity;

  // Couleur de la texture
  vec4 texColor = texture(u_diffuseMap, v_texCoord);

  // Combiner
  vec3 result = (ambient + (diffuse + specular) * attenuation) * texColor.rgb;

  fragColor = vec4(result, texColor.a);
}
```

```glsl
// phong-vertex.glsl
#version 300 es

in vec3 a_position;
in vec3 a_normal;
in vec2 a_texCoord;

uniform mat4 u_model;
uniform mat4 u_view;
uniform mat4 u_projection;

out vec3 v_worldPosition;
out vec3 v_worldNormal;
out vec2 v_texCoord;

void main() {
  // Position dans le monde (pour les calculs d'eclairage)
  vec4 worldPos = u_model * vec4(a_position, 1.0);
  v_worldPosition = worldPos.xyz;

  // Normale dans le monde (utiliser mat3 du model pour ignorer la translation)
  // Note : ceci ne fonctionne correctement que si le model n'a pas de scale non-uniforme
  // Pour un scale non-uniforme, il faut la normal matrix : transpose(inverse(mat3(model)))
  v_worldNormal = mat3(u_model) * a_normal;

  // Coordonnees de texture
  v_texCoord = a_texCoord;

  // Position finale en clip space
  gl_Position = u_projection * u_view * worldPos;
}
```

### 10.4 Passer les uniforms Phong depuis TypeScript

```typescript
function setPhongUniforms(
  gl: WebGL2RenderingContext,
  info: ShaderProgramInfo,
  camera: { position: Float32Array },
  light: { position: Float32Array; color: Float32Array; intensity: number },
  modelMatrix: Float32Array,
  viewMatrix: Float32Array,
  projectionMatrix: Float32Array,
): void {
  gl.useProgram(info.program);

  // Matrices
  gl.uniformMatrix4fv(info.uniforms.get('u_model')!, false, modelMatrix);
  gl.uniformMatrix4fv(info.uniforms.get('u_view')!, false, viewMatrix);
  gl.uniformMatrix4fv(info.uniforms.get('u_projection')!, false, projectionMatrix);

  // Camera
  gl.uniform3fv(info.uniforms.get('u_cameraPosition')!, camera.position);

  // Lumiere
  gl.uniform3fv(info.uniforms.get('u_lightPosition')!, light.position);
  gl.uniform3fv(info.uniforms.get('u_lightColor')!, light.color);
  gl.uniform1f(info.uniforms.get('u_lightIntensity')!, light.intensity);

  // Materiau
  gl.uniform3f(info.uniforms.get('u_ambientColor')!, 0.1, 0.1, 0.1);
  gl.uniform1f(info.uniforms.get('u_shininess')!, 32.0);

  // Texture
  gl.uniform1i(info.uniforms.get('u_diffuseMap')!, 0);  // texture unit 0
}
```

---

## 11. Exercice pratique

### Enonce

Creez un **carre texture** avec eclairage Phong. Le carre doit :

1. Utiliser un **index buffer** (4 sommets, 6 indices)
2. Avoir des **coordonnees de texture UV** en attribut
3. Charger une texture depuis une URL (ou utiliser un pattern procedural)
4. Appliquer un eclairage **Phong** avec une lumiere ponctuelle
5. Faire tourner le carre lentement avec `requestAnimationFrame`

**Structure des attributs :**
- `a_position` : vec3
- `a_normal` : vec3 (tous les sommets ont la meme normale : (0, 0, 1))
- `a_texCoord` : vec2

**Indices :**
- Utilisez `gl.uniformMatrix4fv` pour passer la model matrix (rotation Y)
- La view matrix peut etre une simple translation Z
- La projection matrix peut etre une perspective matrix

<details>
<summary>Voir la solution</summary>

```typescript
// Donnees du carre
const vertices = new Float32Array([
  // pos (x,y,z)     normal (nx,ny,nz)   uv (u,v)
  -0.5,  0.5, 0.0,   0.0, 0.0, 1.0,     0.0, 1.0,   // haut-gauche
   0.5,  0.5, 0.0,   0.0, 0.0, 1.0,     1.0, 1.0,   // haut-droit
   0.5, -0.5, 0.0,   0.0, 0.0, 1.0,     1.0, 0.0,   // bas-droit
  -0.5, -0.5, 0.0,   0.0, 0.0, 1.0,     0.0, 0.0,   // bas-gauche
]);

const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

// Configuration des attributs
const FLOAT_SIZE = 4;
const STRIDE = 8 * FLOAT_SIZE; // 3 + 3 + 2 = 8 floats par sommet

// a_position: 3 floats, offset 0
gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, STRIDE, 0);
// a_normal: 3 floats, offset 12
gl.vertexAttribPointer(normLoc, 3, gl.FLOAT, false, STRIDE, 3 * FLOAT_SIZE);
// a_texCoord: 2 floats, offset 24
gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, STRIDE, 6 * FLOAT_SIZE);

// Texture procedurale (damier 8x8)
function createCheckerTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const checker = ((x >> 5) + (y >> 5)) % 2 === 0;
      const val = checker ? 200 : 50;
      data[idx]     = val;  // R
      data[idx + 1] = val;  // G
      data[idx + 2] = val;  // B
      data[idx + 3] = 255;  // A
    }
  }
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return tex;
}

// Boucle de rendu avec rotation
let lastTime = 0;
let angle = 0;

function frame(now: number): void {
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  angle += dt * 0.5; // 0.5 rad/s

  // Model matrix : rotation Y
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const modelMatrix = new Float32Array([
     c, 0, s, 0,
     0, 1, 0, 0,
    -s, 0, c, 0,
     0, 0, 0, 1,
  ]);

  // View matrix : recul de 3 unites sur Z
  const viewMatrix = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, -3, 1,
  ]);

  // Projection perspective simplifiee (FOV 60deg, aspect 1:1, near 0.1, far 100)
  const fov = Math.PI / 3;
  const aspect = gl.canvas.width / gl.canvas.height;
  const near = 0.1;
  const far = 100;
  const f = 1 / Math.tan(fov / 2);
  const projectionMatrix = new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0,
  ]);

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(program);

  gl.uniformMatrix4fv(modelLoc, false, modelMatrix);
  gl.uniformMatrix4fv(viewLoc, false, viewMatrix);
  gl.uniformMatrix4fv(projLoc, false, projectionMatrix);
  gl.uniform3f(cameraLoc, 0, 0, 3);
  gl.uniform3f(lightPosLoc, 2, 2, 4);
  gl.uniform3f(lightColorLoc, 1, 1, 1);
  gl.uniform1f(lightIntensityLoc, 1.0);
  gl.uniform3f(ambientLoc, 0.15, 0.15, 0.15);
  gl.uniform1f(shininessLoc, 32.0);
  gl.uniform1i(diffuseMapLoc, 0);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, checkerTex);

  gl.bindVertexArray(vao);
  gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  gl.bindVertexArray(null);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
```

**Points cles :**
- Le stride de 32 bytes (8 floats) permet au GPU de sauter d'un sommet au suivant
- La normal matrix n'est pas necessaire ici car il n'y a pas de scale non-uniforme
- La texture procedurale evite de dependre d'un fichier image externe
- `requestAnimationFrame` synchronise le rendu avec le taux de rafraichissement de l'ecran

</details>

---

## Resume

| Concept | Role | API/Syntaxe cle |
|---------|------|-----------------|
| VBO | Stocke les donnees de sommets sur le GPU | `gl.createBuffer`, `gl.bufferData` |
| VAO | Memorise la configuration des attributs | `gl.createVertexArray`, `gl.bindVertexArray` |
| vertexAttribPointer | Decrit le format d'un attribut | `gl.vertexAttribPointer(loc, size, type, norm, stride, offset)` |
| EBO / Index Buffer | Reference les sommets par index | `gl.ELEMENT_ARRAY_BUFFER`, `gl.drawElements` |
| Uniforms | Valeurs constantes par draw call | `gl.uniform*`, `gl.uniformMatrix*fv` |
| Varyings | Interpolation vertex → fragment | `out` (vertex) / `in` (fragment) |
| Textures 2D | Image mappee sur la geometrie | `gl.texImage2D`, `texture()` en GLSL |
| Filtrage | NEAREST, LINEAR, mipmaps | `gl.texParameteri(TEXTURE_MIN_FILTER, ...)` |
| Wrapping | REPEAT, CLAMP_TO_EDGE, MIRRORED | `gl.texParameteri(TEXTURE_WRAP_S, ...)` |
| Texture units | Plusieurs textures simultanees | `gl.activeTexture(gl.TEXTURE0)` |
| FBO | Render-to-texture | `gl.createFramebuffer`, `gl.framebufferTexture2D` |
| Renderbuffer | Depth/stencil attachment pour FBO | `gl.createRenderbuffer`, `gl.renderbufferStorage` |
| Structs GLSL | Types personnalises | `struct Light { vec3 pos; float intensity; };` |
| Built-in GLSL | mix, clamp, smoothstep, normalize, reflect | Pas de branchement → perf GPU |
| Eclairage Phong | Ambient + diffuse + speculaire | `max(dot(N,L),0)`, `pow(max(dot(N,H),0), shin)` |

---

## Navigation

| Precedent | Suivant |
|:---------:|:-------:|
| [06 — WebGL fondamentaux et GLSL](./06-webgl-fondamentaux.md) | [08 — Scene WebGL complete](./08-scene-webgl-complete.md) |
