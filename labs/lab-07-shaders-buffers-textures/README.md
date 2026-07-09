# Lab 07 — Shaders, buffers et textures

> **Outcome :** à la fin, tu sais **texturer un quad avec une image et animer son shader** en WebGL2 — VBO entrelacé, VAO, index buffer, varying UV, texture (filtrage/wrapping/mipmaps), le tout écrit de zéro dans un vrai navigateur.
> **Vrai outil :** WebGL2 (`WebGL2RenderingContext`) dans Chrome/Firefox, servi par n'importe quel serveur statique. Aucun harnais, aucun test-runner.
> **Feedback :** le coach valide **à l'œil** en session (le quad texturé s'affiche, l'animation tourne). Pas d'auto-correcteur.

## Énoncé

Afficher une image plaquée sur un quad, avec un shader légèrement **animé** (une pulsation ou un défilement d'UV piloté par le temps). Le rendu tourne dans le navigateur ; le corrigé est fourni plus bas.

**Contraintes concrètes :**

1. Géométrie = **un quad** défini par **4 sommets** et un **index buffer** de 6 indices (aucun sommet dupliqué).
2. Chaque sommet porte **position (x,y) + UV (u,v)** dans un **seul VBO entrelacé** (stride 16 octets).
3. La config d'attributs + l'EBO sont rangés dans un **VAO**.
4. Une **texture** habille le quad : filtrage `LINEAR`, mipmaps, wrapping `CLAMP_TO_EDGE`, correction `UNPACK_FLIP_Y_WEBGL`.
5. Le fragment shader **anime** la couleur avec un uniform `u_time` mis à jour dans `requestAnimationFrame`.

**Starter — trois fichiers.** Sers le dossier avec `npx serve` (ou l'extension Live Server) puis ouvre `index.html`. Une image `photo.jpg` dans le dossier (n'importe laquelle) sert de texture.

`index.html` :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Lab 07 — quad texturé animé</title>
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

`gl-utils.ts` (repris du lab 06 — compilation avec lecture des info logs) :

```typescript
export function createProgram(
  gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string,
): WebGLProgram {
  const compile = (type: GLenum, src: string): WebGLShader => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(`Compilation shader échouée :\n${gl.getShaderInfoLog(sh)}`);
    }
    return sh;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Linkage échoué :\n${gl.getProgramInfoLog(program)}`);
  }
  return program;
}
```

`main.ts` (à compléter — les `// TODO` sont ta part) :

```typescript
import { createProgram } from './gl-utils';

const VERTEX_SRC = `#version 300 es
in vec2 a_position;
in vec2 a_uv;
out vec2 v_uv;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_uv = a_uv;
}`;

const FRAGMENT_SRC = `#version 300 es
precision highp float;
uniform sampler2D u_photo;
uniform float u_time;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  // TODO 5 : échantillonner u_photo et moduler avec u_time (pulsation)
}`;

async function main(): Promise<void> {
  const canvas = document.getElementById('gl-canvas') as HTMLCanvasElement;
  const gl = canvas.getContext('webgl2');
  if (!gl) throw new Error('WebGL2 non supporté.');
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;

  const program = createProgram(gl, VERTEX_SRC, FRAGMENT_SRC);

  // TODO 1 : VBO entrelacé [x, y, u, v] pour 4 sommets + Uint16Array d'indices
  // TODO 2 : VAO — enregistrer VBO, les 2 attributs (stride/offset en octets), l'EBO
  // TODO 3 : charger photo.jpg en texture (FLIP_Y, filtrage, mipmaps, wrapping)
  // TODO 4 : boucle requestAnimationFrame — mettre à jour u_time, drawElements
}

main();
```

## Étapes (en friction)

1. **Buffer entrelacé.** Écris le `Float32Array` des 4 coins `[x, y, u, v]` et le `Uint16Array` des 6 indices `[0,1,2, 0,2,3]`. Calcule `STRIDE` et l'offset de l'UV **à la main, en octets** — ne recopie pas un nombre.
2. **VAO.** Bind le VAO, puis dans l'ordre : VBO + `bufferData`, les deux `vertexAttribPointer` (avec `enableVertexAttribArray`), et l'EBO `ELEMENT_ARRAY_BUFFER`. Débinde le VAO **en dernier**.
3. **Texture.** Écris `loadTexture` : pixel provisoire 1×1, `image.decode()`, upload, `generateMipmap`, `texParameteri` (min `LINEAR_MIPMAP_LINEAR`, mag `LINEAR`, wrap `CLAMP_TO_EDGE`). N'oublie pas `pixelStorei(UNPACK_FLIP_Y_WEBGL, true)` **avant** l'upload.
4. **Sampling animé.** Dans le fragment shader, échantillonne `texture(u_photo, v_uv)` puis multiplie par une pulsation, ex. `0.6 + 0.4 * sin(u_time)`.
5. **Boucle.** Dans `requestAnimationFrame`, mets `u_time` à jour (`performance.now()/1000`), relie la texture (`activeTexture` + `bindTexture` + `uniform1i`), bind le VAO, `drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0)`.

Débug attendu : si le quad est noir, remplace le fragment par `fragColor = vec4(v_uv, 0.0, 1.0);` pour vérifier les UV (technique du module, §3 exemple 2).

## Corrigé complet commenté

```typescript
// main.ts — corrigé intégral
import { createProgram } from './gl-utils';

const VERTEX_SRC = `#version 300 es
in vec2 a_position;
in vec2 a_uv;
out vec2 v_uv;            // varying : UV transmise au fragment (interpolée)
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_uv = a_uv;
}`;

const FRAGMENT_SRC = `#version 300 es
precision highp float;
uniform sampler2D u_photo;
uniform float u_time;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  vec4 tex = texture(u_photo, v_uv);        // couleur lue dans la photo
  float pulse = 0.6 + 0.4 * sin(u_time);    // pulsation animée (0.2 → 1.0)
  fragColor = vec4(tex.rgb * pulse, tex.a); // module la luminosité dans le temps
}`;

// Charge une image en texture 2D avec filtrage/mipmaps/wrapping.
async function loadTexture(gl: WebGL2RenderingContext, url: string): Promise<WebGLTexture> {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // pixel provisoire 1×1 magenta (visible tant que l'image charge)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
    new Uint8Array([255, 0, 255, 255]));

  const image = new Image();
  image.src = url;
  await image.decode();                                  // attend le décodage

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image); // signature courte
  gl.generateMipmap(gl.TEXTURE_2D);                      // niveaux réduits (LOD)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

async function main(): Promise<void> {
  const canvas = document.getElementById('gl-canvas') as HTMLCanvasElement;
  const gl = canvas.getContext('webgl2');
  if (!gl) throw new Error('WebGL2 non supporté.');
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;

  const program = createProgram(gl, VERTEX_SRC, FRAGMENT_SRC);

  // --- ÉTAPE 1 : données ---
  const FLOAT = 4;
  const STRIDE = 4 * FLOAT;                 // 4 floats/sommet = 16 octets
  const vertices = new Float32Array([
    // x     y      u    v
    -0.5,  0.5,   0.0, 1.0,   // 0 haut-gauche
     0.5,  0.5,   1.0, 1.0,   // 1 haut-droit
     0.5, -0.5,   1.0, 0.0,   // 2 bas-droit
    -0.5, -0.5,   0.0, 0.0,   // 3 bas-gauche
  ]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);  // 2 triangles, 4 sommets

  // --- ÉTAPE 2 : VAO (buffers + attributs + EBO) ---
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  const posLoc = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, STRIDE, 0);         // offset 0

  const uvLoc = gl.getAttribLocation(program, 'a_uv');
  gl.enableVertexAttribArray(uvLoc);
  gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, STRIDE, 2 * FLOAT);  // offset 8 octets

  const ebo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);   // enregistré DANS le VAO
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  gl.bindVertexArray(null);                       // VAO débindé en dernier

  // --- ÉTAPE 3 : texture ---
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);   // corrige l'origine UV
  const texture = await loadTexture(gl, './photo.jpg');

  const timeLoc = gl.getUniformLocation(program, 'u_time');
  const photoLoc = gl.getUniformLocation(program, 'u_photo');

  gl.viewport(0, 0, canvas.width, canvas.height);

  // --- ÉTAPE 4 & 5 : boucle animée ---
  function frame(now: number): void {
    gl.clearColor(0.1, 0.1, 0.2, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(program);
    gl.uniform1f(timeLoc, now / 1000);            // temps en secondes

    gl.activeTexture(gl.TEXTURE0);                // unit 0
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(photoLoc, 0);                    // sampler → unit 0

    gl.bindVertexArray(vao);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);  // 6 indices

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main();
```

**Points clés du corrigé :**

- `STRIDE = 16` et l'offset UV `= 8` sont **en octets** (2 floats × 4) — l'erreur n°1 est de mettre `2`.
- L'EBO est bindé **pendant** que le VAO est actif → il est mémorisé ; le débind du VAO vient en dernier.
- `drawElements` prend **6** (indices), pas 4 (sommets), avec `gl.UNSIGNED_SHORT` pour matcher le `Uint16Array`.
- `uniform1i(photoLoc, 0)` passe le **numéro d'unit**, pas l'objet texture.
- L'animation vient d'un seul uniform `u_time` réinjecté par frame ; aucun buffer n'est recréé dans la boucle.

## Grille d'évaluation

| Critère | Attendu | Poids |
|---------|---------|-------|
| Buffer entrelacé | un seul VBO `[x,y,u,v]`, stride/offset **en octets** corrects | ★★★ |
| VAO + EBO | config rangée dans le VAO, EBO bindé pendant le VAO actif | ★★★ |
| drawElements | 6 indices, `UNSIGNED_SHORT`, quad sans sommet dupliqué | ★★ |
| Varying UV | `a_uv` → `v_uv` interpolée, texture correctement mappée | ★★ |
| Texture | filtrage + mipmaps + wrapping + FLIP_Y, image non retournée | ★★★ |
| Animation | `u_time` piloté par `requestAnimationFrame`, pulsation visible | ★★ |

## Notes du coach

1. **Fais visualiser l'UV d'abord.** Avant même la texture, demande le fragment `fragColor = vec4(v_uv, 0.0, 1.0);`. Si le gradient n'est pas noir-en-bas-gauche → jaune-en-haut-droit, le problème est l'attribut UV (offset/stride), pas la texture. Ne laisse pas déboguer la texture tant que l'UV n'est pas prouvée.
2. **Traque l'octet.** Demande à voix haute pourquoi l'offset UV vaut 8 et pas 2. Si la réponse hésite, c'est LE piège du module — fais recompter : 2 floats de position × 4 octets.
3. **Vérifie l'ordre EBO/VAO.** Un quad noir avec des UV correctes = souvent l'EBO débindé avant le VAO. Fais tracer l'ordre des `bindBuffer(ELEMENT_ARRAY_BUFFER)` / `bindVertexArray(null)`.
4. **Refuse la copie du module.** Le corrigé du module (quad statique) est proche ; exige l'**animation** (`u_time`) écrite sans relire le module. C'est la friction qui ancre.
5. **Photo à l'envers ?** Si l'image s'affiche retournée, ne laisse pas « corriger » en inversant les V dans le buffer — c'est `UNPACK_FLIP_Y_WEBGL` qui manque. Discrimine les deux causes.

## Variante J+30 (fading)

Reprends le quad texturé animé, **en 25 minutes, sans relire ni le module ni ce corrigé**, avec **une contrainte ajoutée** : au lieu d'une pulsation de luminosité, fais **défiler l'UV horizontalement** dans le temps — la photo semble glisser et se répète. Cela force à combiner **wrapping `REPEAT`** (au lieu de `CLAMP_TO_EDGE`) et un décalage d'UV dans le shader :

```glsl
vec2 uv = v_uv + vec2(u_time * 0.1, 0.0);   // défilement horizontal
fragColor = texture(u_photo, uv);            // REPEAT côté texture → tuilage sans couture
```

Réussite = le défilement tourne **et** tu sais expliquer pourquoi `CLAMP_TO_EDGE` étirerait le bord au lieu de répéter.

## Application TribuZen

Porte ce quad texturé dans `smaurier/tribuzen` comme brique du **feed 3D** : une carte de sortie = un quad dont la texture est la photo de couverture chargée depuis le storage.

- `src/3d/feed/QuadGeometry.ts` : le VBO entrelacé + VAO + index buffer **partagés** par toutes les cartes (une seule géométrie, réutilisée) ;
- `src/3d/gl/loadTexture.ts` : le chargement de texture (FLIP_Y, mipmaps, `CLAMP_TO_EDGE` pour ne pas tuiler une photo) ;
- `src/3d/feed/PhotoCard.ts` : une carte = ce quad + la texture d'une sortie, positionnée dans la scène.

Commit suggéré : `feat(feed3d): quad texturé par la photo de couverture d'une sortie`.
