---
titre: Shaders, buffers et textures
cours: 20-webgpu-3d
notions:
  - "attributs entrelacés (position + UV dans un même VBO)"
  - "vertexAttribPointer avec stride et offset en octets"
  - "Vertex Array Object (VAO) — config d'attributs mémorisée"
  - "Index buffer / EBO (drawElements, gl.ELEMENT_ARRAY_BUFFER)"
  - "varyings (out vertex → in fragment, interpolation barycentrique)"
  - "uniforms typés (uniform1f / uniform2f / uniformMatrix4fv)"
  - "texture 2D (createTexture, texImage2D)"
  - "sampling GLSL 300 (sampler2D, texture(sampler, uv))"
  - "coordonnées UV (espace [0,1], attribut a_uv)"
  - "filtrage (NEAREST / LINEAR / mipmaps) et wrapping (REPEAT / CLAMP_TO_EDGE)"
outcomes:
  - sait entrelacer position et UV dans un seul VBO et brancher deux attributs via stride/offset en octets
  - sait enregistrer la config d'attributs dans un VAO et la restaurer d'un bindVertexArray
  - sait dessiner un quad sans dupliquer de sommets via un index buffer et drawElements
  - sait passer une valeur du vertex au fragment via un varying interpolé
  - sait charger une texture 2D, régler filtrage/wrapping/mipmaps, et l'échantillonner en GLSL 300 avec texture()
prerequis:
  - "00-prerequis-et-introduction (GPU, aperçu pipeline)"
  - "03-cameras-et-projections (clip space, NDC)"
  - "04-pipeline-de-rendu (vertex/fragment, rasterisation, interpolation)"
  - "05-lumiere-materiaux-et-pbr (shading dans le fragment shader)"
  - "06-webgl-fondamentaux (contexte WebGL2, VBO, attribut simple, uniform, drawArrays)"
next: 08-scene-webgl-complete
libs: []
tribuzen: "moteur de rendu 3D TribuZen — plaquer la photo d'une sortie comme texture sur un quad, la vignette réelle du feed 3D"
last-reviewed: 2026-07
---

# Shaders, buffers et textures

> **Outcomes — tu sauras FAIRE :** entrelacer plusieurs attributs dans un VBO, mémoriser leur config dans un VAO, dessiner un quad via un index buffer, passer une valeur par varying interpolé, et plaquer une texture 2D échantillonnée en GLSL ES 300.
> **Difficulté :** :star::star::star::star:
>
> **Portée :** le module 06 a affiché **un** triangle monochrome (un seul attribut, une couleur en uniform). Ici on passe à **plusieurs attributs** (position + UV), au **VAO** qui range cette config, à l'**index buffer** pour ne pas dupliquer de sommets, aux **varyings** pour interpoler des données jusqu'au fragment, et aux **textures** pour habiller la géométrie d'une vraie image. L'assemblage en scène animée complète vient au module 08.

## 1. Cas concret d'abord

Le module 06 a posé le premier pixel GPU de TribuZen : un triangle rouge, marqueur de sortie. Mais une sortie de la famille, c'est surtout une **photo** — la vignette de la rando du dimanche. L'objectif concret de ce module : afficher cette photo dans la scène 3D, plaquée sur un **quad** (rectangle = 2 triangles).

Trois problèmes que le module 06 ne sait pas résoudre :

1. **Un quad a 4 coins mais 2 triangles = 6 sommets.** Dupliquer deux coins est un gâchis ; il faut un **index buffer**.
2. **Chaque coin porte deux données** : sa position ET sa coordonnée dans l'image (UV). Il faut donc **deux attributs** dans le même buffer.
3. **La couleur ne vient plus d'un uniform** mais d'une image échantillonnée pixel par pixel : il faut une **texture** et un **varying** qui transporte l'UV du vertex jusqu'au fragment.

Voici le réflexe naïf qui **ne marche pas** :

```typescript
// ❌ On croit pouvoir lire la photo directement dans le fragment shader
// sans coordonnées UV ni sampler configuré
const fragmentSrc = `#version 300 es
precision highp float;
out vec4 fragColor;
void main() {
  fragColor = texture(u_photo, ???);  // avec QUOI échantillonner ? aucune UV !
}`;
```

Le fragment shader n'a **aucune notion** de « où » dans l'image lire la couleur. Cette information — la coordonnée UV — doit être portée **par sommet** (attribut), transportée **jusqu'au fragment** (varying interpolé), puis utilisée pour **échantillonner** la texture. Ce module câble cette chaîne complète, du buffer à l'écran.

---

## 2. Théorie complète, concise

### 2.1 Attributs entrelacés : plusieurs données par sommet

Au module 06, chaque sommet ne portait qu'une position (`a_position`). Ici chaque sommet porte **position + UV**. Deux stratégies :

- **buffers séparés** : un VBO pour les positions, un VBO pour les UV — simple, mais deux buffers à gérer ;
- **buffer entrelacé (interleaved)** : un seul VBO où les données d'un sommet sont contiguës `[x, y, u, v, x, y, u, v, ...]` — plus performant (cache GPU) et standard.

On adopte l'entrelacé :

```typescript
// 4 sommets d'un quad : position (x, y) puis UV (u, v) — 4 floats par sommet
const vertices = new Float32Array([
  // x     y      u    v
  -0.5,  0.5,   0.0, 1.0,   // 0: haut-gauche
   0.5,  0.5,   1.0, 1.0,   // 1: haut-droit
   0.5, -0.5,   1.0, 0.0,   // 2: bas-droit
  -0.5, -0.5,   0.0, 0.0,   // 3: bas-gauche
]);
```

### 2.2 stride et offset : découper le buffer entrelacé

`vertexAttribPointer` décrit **où** chaque attribut se trouve dans le flot d'octets. Deux paramètres clés, **tous deux en OCTETS** (un float = 4 octets) :

- **stride** : distance d'un sommet au suivant. Ici 4 floats × 4 = **16 octets** ;
- **offset** : position de l'attribut dans le sommet. Position à `0`, UV après 2 floats = **8 octets**.

```typescript
const FLOAT = 4;
const STRIDE = 4 * FLOAT;   // 16 octets par sommet

// a_position : 2 floats, à l'offset 0
gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, STRIDE, 0);
// a_uv : 2 floats, à l'offset 8 (après les 2 floats de position)
gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, STRIDE, 2 * FLOAT);
```

```
Buffer entrelacé (octets) :

Byte:  0    4    8    12   16   20   24   28
     ┌────┬────┬────┬────┬────┬────┬────┬────┐
     │ x0 │ y0 │ u0 │ v0 │ x1 │ y1 │ u1 │ v1 │
     └────┴────┴────┴────┴────┴────┴────┴────┘
     │◄──── sommet 0 ────►│◄──── sommet 1 ───►│
     │◄─── STRIDE = 16 ──►│

     a_position: size=2, offset=0     a_uv: size=2, offset=8
```

### 2.3 Le VAO : mémoriser la config d'attributs

Sans VAO, il faudrait rejouer `bindBuffer` + `enableVertexAttribArray` + `vertexAttribPointer` **à chaque frame, pour chaque objet**. Le **Vertex Array Object** enregistre toute cette config une fois pour toutes. Au rendu, un seul `bindVertexArray` la restaure.

```typescript
const vao = gl.createVertexArray();
gl.bindVertexArray(vao);           // tout ce qui suit est ENREGISTRÉ dans le VAO

gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
gl.enableVertexAttribArray(posLoc);
gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, STRIDE, 0);
gl.enableVertexAttribArray(uvLoc);
gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, STRIDE, 2 * FLOAT);

gl.bindVertexArray(null);          // config sauvegardée

// Plus tard, au rendu : une seule ligne restaure TOUT
gl.bindVertexArray(vao);
```

### 2.4 L'index buffer (EBO) : ne pas dupliquer de sommets

Un quad = 2 triangles. Avec `drawArrays`, il faudrait 6 sommets (les 2 coins de la diagonale sont dupliqués). Avec un **index buffer** (Element Buffer Object), on garde **4 sommets uniques** et on liste des **indices** qui les référencent :

```typescript
// 6 indices → 2 triangles, mais seulement 4 sommets stockés
const indices = new Uint16Array([
  0, 1, 2,   // triangle 1 : haut-gauche, haut-droit, bas-droit
  0, 2, 3,   // triangle 2 : haut-gauche, bas-droit, bas-gauche
]);

const ebo = gl.createBuffer();
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);   // cible ELEMENT_ARRAY_BUFFER (pas ARRAY_BUFFER)
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
```

On dessine ensuite avec `drawElements` au lieu de `drawArrays` :

```typescript
gl.drawElements(
  gl.TRIANGLES,       // mode
  6,                  // nombre d'INDICES (pas de sommets)
  gl.UNSIGNED_SHORT,  // type des indices → Uint16Array
  0,                  // offset en octets dans le buffer d'indices
);
```

> **Le EBO est enregistré dans le VAO.** Le bind `ELEMENT_ARRAY_BUFFER` fait partie de l'état du VAO courant. Il faut donc le binder **pendant** que le VAO est actif, et ne pas le débinder avant le VAO — sinon il est « oublié ».

### 2.5 Varyings : transporter une valeur du vertex au fragment

Un **varying** est une sortie du vertex shader (`out`) devenue entrée du fragment shader (`in`, même nom, même type). Entre les deux, le rasteriseur **interpole** la valeur : chaque fragment reçoit une moyenne pondérée par sa position dans le triangle (coordonnées **barycentriques**, revues au module 04).

C'est ainsi que l'UV — définie seulement aux 4 coins — devient disponible pour **chaque pixel** du quad :

```glsl
// Vertex shader : reçoit l'UV en attribut, la RENVOIE en varying
#version 300 es
in vec2 a_position;
in vec2 a_uv;
out vec2 v_uv;          // varying : sortie vers le fragment
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_uv = a_uv;          // transmise telle quelle, sera interpolée
}
```

```glsl
// Fragment shader : reçoit l'UV interpolée
#version 300 es
precision highp float;
in vec2 v_uv;           // même nom, même type → varying interpolé
out vec4 fragColor;
void main() {
  fragColor = vec4(v_uv, 0.0, 1.0);  // visualise l'UV comme un gradient
}
```

> **Note GLSL 300 :** `in`/`out` remplacent les anciens `attribute`/`varying` de GLSL 100. Le mot-clé `flat` devant un varying désactive l'interpolation (le fragment reçoit la valeur d'un seul sommet) — utile pour un entier.

### 2.6 Uniforms typés : le rappel utile

Un uniform reste une constante par draw call (module 06). Ici on en utilisera plusieurs types. Le suffixe encode le type GLSL :

```typescript
gl.useProgram(program);
gl.uniform1f(gl.getUniformLocation(program, 'u_time'), t);        // float
gl.uniform2f(gl.getUniformLocation(program, 'u_res'), w, h);      // vec2
gl.uniform1i(gl.getUniformLocation(program, 'u_photo'), 0);       // sampler → texture unit 0
gl.uniformMatrix4fv(mvpLoc, false, mvpMatrix);                    // mat4 (2e arg transpose = toujours false)
```

Note importante : **un `sampler2D` se règle avec `uniform1i`** — on lui passe le **numéro de la texture unit** (un entier), pas la texture elle-même (voir 2.8).

### 2.7 Textures 2D : charger une image sur le GPU

Une texture est une image stockée en mémoire GPU. Le cycle : créer → binder → uploader les pixels → régler les paramètres.

```typescript
async function loadTexture(gl: WebGL2RenderingContext, url: string): Promise<WebGLTexture> {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // Pixel provisoire (1×1 magenta) tant que l'image n'est pas chargée
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0,      // target, mip, internalFormat, w, h, border
    gl.RGBA, gl.UNSIGNED_BYTE,                // srcFormat, srcType
    new Uint8Array([255, 0, 255, 255]),      // pixels
  );

  const image = new Image();
  image.src = url;
  await image.decode();                       // attend le décodage de l'image

  gl.bindTexture(gl.TEXTURE_2D, texture);
  // Signature courte (source = Image) : target, mip, internalFormat, srcFormat, srcType, source
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.generateMipmap(gl.TEXTURE_2D);           // versions réduites pour le LOD

  return texture;
}
```

`texImage2D` a **deux signatures** : longue (données brutes `Uint8Array`, avec `width/height/border`) et courte (source `Image`/`Canvas`/`Video`, sans dimensions). Le `border` de la version longue vaut **toujours 0**.

> **UV inversé.** L'origine UV WebGL est en bas à gauche, mais les images HTML ont l'origine en haut à gauche → la texture apparaît retournée verticalement. Le correctif standard avant l'upload : `gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)`.

### 2.8 Filtrage, wrapping, mipmaps

Trois réglages via `texParameteri(gl.TEXTURE_2D, pname, valeur)` :

**Filtrage** — comment échantillonner quand le pixel écran ne tombe pas pile sur un texel :

- `gl.NEAREST` : le texel le plus proche → rendu pixelisé (look rétro) ;
- `gl.LINEAR` : moyenne des 4 texels voisins → lissé ;
- `gl.LINEAR_MIPMAP_LINEAR` : filtrage trilinéaire via mipmaps (uniquement en `MIN_FILTER`).

```typescript
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); // texture réduite
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);               // texture agrandie
```

**Mipmaps** : versions pré-réduites (256→128→64…→1) que le GPU choisit selon la distance. Évitent le scintillement (aliasing) sur les surfaces lointaines. `generateMipmap` les calcule automatiquement. En **WebGL2**, elles fonctionnent même sur des textures dont la taille n'est **pas** une puissance de 2 (restriction propre à WebGL1).

**Wrapping** — que faire quand l'UV sort de `[0, 1]` :

- `gl.REPEAT` : répète la texture (tuilage) ;
- `gl.CLAMP_TO_EDGE` : étire le pixel du bord ;
- `gl.MIRRORED_REPEAT` : répète en miroir (pas de couture visible).

```typescript
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); // axe U (horizontal)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); // axe V (vertical)
```

### 2.9 Échantillonner en GLSL 300 et brancher la texture unit

Côté shader, un `uniform sampler2D` représente la texture ; la fonction `texture(sampler, uv)` (GLSL 300 — remplace `texture2D` de GLSL 100) lit la couleur :

```glsl
#version 300 es
precision highp float;
uniform sampler2D u_photo;   // la texture
in vec2 v_uv;                // UV interpolée (varying)
out vec4 fragColor;
void main() {
  fragColor = texture(u_photo, v_uv);   // couleur lue dans l'image à la coord v_uv
}
```

Côté JS, on relie le sampler à une **texture unit** (un slot GPU numéroté). Trois étapes indissociables :

```typescript
gl.activeTexture(gl.TEXTURE0);              // 1. active l'unit 0
gl.bindTexture(gl.TEXTURE_2D, texture);     // 2. y branche notre texture
gl.uniform1i(u_photoLoc, 0);                // 3. dit au sampler : « lis dans l'unit 0 »
```

WebGL2 garantit **au minimum 16** texture units dans le fragment shader — assez pour combiner diffuse map, normal map, etc. dans un même shader.

---

## 3. Worked examples

### Exemple 1 — Un quad texturé de A à Z (photo de sortie TribuZen)

Objectif : plaquer une photo sur un quad, en cousant tout ce qui précède — VBO entrelacé, VAO, index buffer, varying UV, texture. On réutilise `createProgram` du module 06.

```typescript
import { createProgram } from './gl-utils';  // du module 06

const VERTEX_SRC = `#version 300 es
in vec2 a_position;
in vec2 a_uv;
out vec2 v_uv;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_uv = a_uv;                 // UV transmise au fragment (interpolée)
}`;

const FRAGMENT_SRC = `#version 300 es
precision highp float;
uniform sampler2D u_photo;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  fragColor = texture(u_photo, v_uv);   // couleur lue dans la photo
}`;

async function main(): Promise<void> {
  const canvas = document.getElementById('gl-canvas') as HTMLCanvasElement;
  const gl = canvas.getContext('webgl2');
  if (!gl) throw new Error('WebGL2 non supporté.');
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;

  const program = createProgram(gl, VERTEX_SRC, FRAGMENT_SRC);

  // --- VBO entrelacé : position (x,y) + UV (u,v) ---
  const FLOAT = 4;
  const STRIDE = 4 * FLOAT;               // 16 octets par sommet
  const vertices = new Float32Array([
    -0.5,  0.5,  0.0, 1.0,   // 0 haut-gauche
     0.5,  0.5,  1.0, 1.0,   // 1 haut-droit
     0.5, -0.5,  1.0, 0.0,   // 2 bas-droit
    -0.5, -0.5,  0.0, 0.0,   // 3 bas-gauche
  ]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

  // --- VAO : enregistre buffers + attributs + EBO ---
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  const posLoc = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, STRIDE, 0);           // offset 0

  const uvLoc = gl.getAttribLocation(program, 'a_uv');
  gl.enableVertexAttribArray(uvLoc);
  gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, STRIDE, 2 * FLOAT);    // offset 8 octets

  const ebo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);   // enregistré dans le VAO
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  gl.bindVertexArray(null);

  // --- Texture : la photo de la sortie ---
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);  // corrige l'origine UV inversée
  const texture = await loadTexture(gl, './sortie-rando.jpg');

  // --- Rendu ---
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.1, 0.1, 0.2, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.uniform1i(gl.getUniformLocation(program, 'u_photo'), 0);  // sampler → unit 0

  gl.bindVertexArray(vao);
  gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);      // 6 indices, 2 triangles
}

main();
```

Résultat : la photo de la rando remplit le quad. Retirer une étape (l'`activeTexture`, le `uniform1i`, ou le varying `v_uv`) suffit à obtenir un quad noir ou magenta silencieux.

### Exemple 2 — Debugger l'UV sans texture (le réflexe qui sauve)

Quand un quad texturé s'affiche noir ou de travers, la cause est presque toujours l'**UV**, pas la texture. Le réflexe : remplacer le sampling par une **visualisation directe de l'UV**, qui isole le problème.

```glsl
// Fragment shader de debug : peint l'UV en gradient rouge/vert
#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  // u → rouge, v → vert : le coin (0,0) est noir, (1,1) est jaune
  fragColor = vec4(v_uv, 0.0, 1.0);
}
```

Lecture du résultat :

- **gradient propre** (noir en bas-gauche, jaune en haut-droit) → les UV sont correctes, le bug est côté texture (chargement, unit, sampler) ;
- **couleur uniforme** → l'attribut `a_uv` n'est pas branché (offset/stride faux, ou `enableVertexAttribArray` oublié) ;
- **gradient retourné verticalement** → il manque `UNPACK_FLIP_Y_WEBGL` ou les UV sont inversées dans le buffer.

Cette technique — sortir une donnée intermédiaire comme couleur — est **le** debugger du shader (il n'y a pas de `console.log` sur le GPU).

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Croire que `stride`/`offset` sont en composantes

`vertexAttribPointer(loc, size, type, norm, stride, offset)` : `stride` et `offset` sont **en OCTETS**, pas en floats. Pour un buffer `[x, y, u, v]`, l'offset de l'UV est `2 * 4 = 8` octets, pas `2`. Erreur classique : écrire `offset = 2` → l'UV est lue au mauvais endroit, texture décalée.

### PIÈGE #2 — Passer la texture (au lieu de l'unit) à `uniform1i`

Un `sampler2D` se règle avec `gl.uniform1i(loc, 0)` où `0` est le **numéro de la texture unit**, un entier. On ne passe **jamais** l'objet `WebGLTexture`. Le lien se fait via `activeTexture(gl.TEXTURE0)` + `bindTexture` : le sampler lit « ce qui est bindé dans l'unit qu'on lui a donnée ».

### PIÈGE #3 — Débinder l'EBO avant le VAO

Le bind `ELEMENT_ARRAY_BUFFER` fait partie de l'état du VAO. Si on appelle `gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null)` **avant** `gl.bindVertexArray(null)`, le VAO oublie son index buffer → `drawElements` ne dessine rien. Ordre correct : binder l'EBO pendant que le VAO est actif, puis débinder le VAO en dernier.

### PIÈGE #4 — `drawElements` vs `drawArrays` : le count change de sens

`drawArrays(mode, first, count)` : `count` = nombre de **sommets**. `drawElements(mode, count, type, offset)` : `count` = nombre d'**indices**. Pour un quad : `drawArrays` voudrait 6 sommets, `drawElements` prend 6 indices sur 4 sommets. Et le `type` (`gl.UNSIGNED_SHORT`) doit matcher le `Uint16Array` des indices (`Uint32Array` → `gl.UNSIGNED_INT`).

### PIÈGE #5 — Utiliser `texture2D()` en GLSL ES 300

`texture2D(sampler, uv)` est la syntaxe **GLSL ES 100** (WebGL1). En GLSL ES 300 (`#version 300 es`), la fonction est simplement `texture(sampler, uv)`. Écrire `texture2D` fait échouer la compilation — et sans lire l'info log (module 06), c'est un quad noir inexpliqué.

### PIÈGE #6 — Oublier `UNPACK_FLIP_Y_WEBGL` → texture à l'envers

L'origine UV de WebGL est en bas-gauche ; celle des images HTML en haut-gauche. Sans `gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)` avant l'upload, la photo s'affiche **retournée verticalement**. C'est un bug visuel, pas une erreur — donc silencieux.

### PIÈGE #7 — `LINEAR_MIPMAP_LINEAR` sans mipmaps générés

Régler `TEXTURE_MIN_FILTER` sur un mode `*_MIPMAP_*` **sans** avoir appelé `generateMipmap` (ou uploadé les niveaux manuellement) rend la texture **noire** : le GPU cherche des mipmaps qui n'existent pas. Soit on génère les mipmaps, soit on reste sur `gl.LINEAR` / `gl.NEAREST` en min filter.

---

## 5. Ancrage TribuZen

Ce module fait passer TribuZen du marqueur monochrome à la **vignette photo** : chaque sortie de la famille affiche son image, plaquée sur un quad dans la scène 3D.

**La photo de sortie comme texture.** Le feed 3D de TribuZen empile les sorties récentes ; chaque carte est un quad texturé par la photo de couverture de la sortie :

- **position** (attribut) : place la carte dans la scène (calculée depuis le layout du feed) ;
- **UV** (attribut entrelacé) : mappe la photo sur le quad, avec `CLAMP_TO_EDGE` pour éviter tout tuilage sur les bords ;
- **texture** : la photo chargée depuis l'URL du storage, avec mipmaps pour que les cartes lointaines ne scintillent pas ;
- **index buffer** : un seul VAO « quad » (4 sommets, 6 indices) réutilisé pour **toutes** les cartes — seules la texture et la matrice de position changent entre les draws.

Fichiers cibles dans `smaurier/tribuzen` :

```
tribuzen/
  src/
    3d/
      gl/
        glUtils.ts          ← createProgram (module 06)
        loadTexture.ts      ← chargement + filtrage/wrapping/mipmaps (§2.7-2.8)
      feed/
        QuadGeometry.ts     ← VBO entrelacé + VAO + index buffer du quad partagé
        PhotoCard.ts        ← une carte = quad + texture d'une sortie
      FeedCanvas.vue        ← <canvas> WebGL2 du feed 3D
```

> Le quad partagé ici (position + UV + index buffer) est **la** brique réutilisée partout ensuite : le module 08 l'anime et l'assemble en scène complète, le module 16 (post-processing) s'en sert pour le quad plein écran.

---

## 6. Points clés

1. Un VBO **entrelacé** range plusieurs attributs par sommet `[x, y, u, v, ...]` ; `stride`/`offset` de `vertexAttribPointer` sont **en octets** (float = 4 octets).
2. Le **VAO** enregistre buffers + config d'attributs + EBO ; au rendu un seul `bindVertexArray` restaure tout.
3. L'**index buffer** (EBO, `ELEMENT_ARRAY_BUFFER`) évite de dupliquer les sommets ; on dessine avec `drawElements(mode, count, type, offset)` où `count` = nombre d'**indices**.
4. L'EBO est mémorisé **dans** le VAO : le binder pendant que le VAO est actif, débinder le VAO en dernier.
5. Un **varying** (`out` vertex → `in` fragment, même nom) est **interpolé** barycentriquement ; c'est ainsi que l'UV des 4 coins atteint chaque pixel.
6. Une **texture 2D** se charge via `createTexture` → `bindTexture` → `texImage2D` (deux signatures : brute vs source Image) → `generateMipmap`.
7. **Filtrage** (`NEAREST`/`LINEAR`/`*_MIPMAP_*` en min) et **wrapping** (`REPEAT`/`CLAMP_TO_EDGE`/`MIRRORED_REPEAT`) se règlent par `texParameteri` ; les mipmaps marchent sur toute taille en WebGL2.
8. En GLSL 300 on échantillonne avec `texture(sampler, uv)` (pas `texture2D`) ; côté JS, `uniform1i(loc, N)` relie le sampler à la texture unit `N` activée via `activeTexture`.

---

## 7. Seeds Anki

```
En quelle unité sont stride et offset dans vertexAttribPointer ?|En OCTETS (pas en composantes). Pour un buffer entrelacé [x,y,u,v], stride = 4*4 = 16 octets, et l'offset de l'UV = 2*4 = 8 octets. Un float = 4 octets.
À quoi sert un VAO (Vertex Array Object) ?|Il enregistre toute la config d'attributs (bindBuffer ARRAY_BUFFER, enableVertexAttribArray, vertexAttribPointer) ET le bind ELEMENT_ARRAY_BUFFER. Au rendu, un seul bindVertexArray(vao) restaure tout au lieu de tout rejouer par frame.
Pourquoi utiliser un index buffer (EBO) plutôt que drawArrays pour un quad ?|Un quad = 2 triangles. Sans index, il faut 6 sommets (2 dupliqués). Avec un EBO on garde 4 sommets uniques + 6 indices [0,1,2, 0,2,3], et on dessine avec drawElements. Économie qui monte à 50-70% sur les modèles complexes.
Dans drawElements(mode, count, type, offset), que valent count et type pour un quad ?|count = nombre d'INDICES (6 pour un quad, pas 4 sommets). type = le type du buffer d'indices : gl.UNSIGNED_SHORT pour un Uint16Array (ou gl.UNSIGNED_INT pour Uint32Array). offset en octets dans le buffer d'indices.
Qu'est-ce qu'un varying et comment le déclare-t-on en GLSL 300 ?|Une valeur calculée par sommet dans le vertex shader (out vec2 v_uv) et reçue interpolée par le fragment shader (in vec2 v_uv, même nom/type). Le rasteriseur interpole barycentriquement. En GLSL 300 : in/out (plus attribute/varying de GLSL 100).
Comment relie-t-on un uniform sampler2D à une texture ?|Trois étapes : gl.activeTexture(gl.TEXTURE0) active l'unit 0, gl.bindTexture(gl.TEXTURE_2D, tex) y branche la texture, gl.uniform1i(samplerLoc, 0) dit au sampler de lire dans l'unit 0. On passe le NUMÉRO d'unit (entier), jamais l'objet texture.
Quelle fonction échantillonne une texture en GLSL ES 300 ?|texture(sampler, uv) — pas texture2D() qui est la syntaxe GLSL ES 100 (WebGL1). Écrire texture2D en #version 300 es fait échouer la compilation.
Que fait TEXTURE_MIN_FILTER = LINEAR_MIPMAP_LINEAR sans generateMipmap ?|La texture apparaît NOIRE : le filtre trilinéaire cherche des niveaux de mipmap inexistants. Il faut soit appeler generateMipmap(gl.TEXTURE_2D), soit rester sur gl.LINEAR/gl.NEAREST en min filter. En WebGL2 les mipmaps marchent sur toute taille (pas seulement puissances de 2).
Pourquoi une photo apparaît-elle retournée verticalement en texture ?|L'origine UV de WebGL est en bas-gauche, celle des images HTML en haut-gauche. Correctif : gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true) avant l'upload texImage2D. Bug visuel silencieux, aucune erreur levée.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-07-shaders-buffers-textures/README.md`. Texturer un quad avec une photo et animer le shader en WebGL2 — VBO entrelacé, VAO, index buffer, varying UV, texture avec filtrage/wrapping, écrit de zéro dans le navigateur, corrigé HTML/TS commenté.
