# Lab 06 — WebGL fondamentaux

> **Outcome :** à la fin, tu sais **afficher un triangle coloré en WebGL2 dans le navigateur** — contexte, VBO, attribut de sommet, shaders GLSL ES 300, uniform couleur, draw call — le tout écrit de zéro, avec lecture des info logs de compilation.
> **Vrai outil :** WebGL2 (`WebGL2RenderingContext`) dans Chrome/Firefox, servi par `npx serve`. Aucun harnais, aucun test-runner, aucun `tsx`.
> **Feedback :** le coach valide **à l'œil** en session — le triangle s'affiche à l'écran (oracle = rendu visuel). Pas d'auto-correcteur.

## Objectif

Faire apparaître **un seul triangle coloré** dans un `<canvas>` via WebGL2. C'est la brique zéro du rendu GPU : si ce triangle s'affiche, tout le reste du cours (textures, WebGPU, Three.js) est accessible ; sinon, on est bloqué.

Tu poses le **protocole WebGL complet**, dans l'ordre, à la main :

1. obtenir le contexte `webgl2` et synchroniser le drawing buffer ;
2. compiler + linker un programme GLSL ES 300 (vertex + fragment), **en lisant les info logs** ;
3. uploader 3 positions (clip space) dans un **VBO** ;
4. brancher l'attribut `a_position` via `vertexAttribPointer` ;
5. passer la couleur par un **uniform** `u_color` ;
6. `viewport` → `clear` → `useProgram` → `drawArrays`.

WebGL est une **machine à états silencieuse** : aucune exception si tu oublies une étape, juste un écran noir. L'enjeu du lab est de câbler chaque maillon et de savoir lire l'erreur quand ça ne s'affiche pas.

## Prérequis

- Module `20-webgpu-3d/modules/06-webgl-fondamentaux.md` lu (contexte, VBO, attribut, uniform, GLSL ES 300, draw call).
- Notion de **clip space** / NDC : l'écran visible est le carré `[-1, +1]` sur X et Y (module 03).
- Node installé (pour `npx serve`) et Chrome ou Firefox récent (WebGL2 activé par défaut).
- Un éditeur. Pas de bundler, pas de framework : deux fichiers statiques suffisent.

## Mise en place

Crée le dossier de travail et deux fichiers : `index.html` (le canvas hôte) et `main.js` (le protocole, **à compléter** — les `// TODO` sont ta part).

Sers le dossier avec un serveur statique (le protocole `file://` bloque les modules ES) :

```bash
npx serve
```

Puis ouvre l'URL affichée (typiquement `http://localhost:3000`). Ouvre aussi la **console DevTools** (F12) : c'est là que s'afficheront les erreurs de compilation de shader.

> Pourquoi un serveur et pas un double-clic sur le fichier ? Un `<script type="module">` chargé en `file://` est bloqué par la politique CORS des navigateurs. `npx serve` sert le dossier en `http://`, ce qui règle le problème sans installer quoi que ce soit.

### `index.html` (starter — à copier tel quel)

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Lab 06 — triangle WebGL2</title>
  <style>
    body { margin: 0; background: #111; }
    canvas { display: block; width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <canvas id="gl-canvas"></canvas>
  <script type="module" src="./main.js"></script>
</body>
</html>
```

### `main.js` (starter — à compléter)

```js
// main.js — starter. Les // TODO sont ta part.

// Sources GLSL ES 3.00 — la directive #version DOIT être en 1re ligne (pas d'espace avant).
const VERTEX_SRC = `#version 300 es
in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);   // positions déjà en clip space
}`;

const FRAGMENT_SRC = `#version 300 es
precision highp float;        // OBLIGATOIRE en fragment GLSL 3.00
uniform vec4 u_color;         // couleur constante pour ce draw call
out vec4 fragColor;           // sortie explicite (remplace gl_FragColor)
void main() {
  fragColor = u_color;
}`;

// TODO A : compileShader(gl, type, source) — compile ET lit COMPILE_STATUS / info log
// TODO B : createProgram(gl, vsSrc, fsSrc) — attache, linke, lit LINK_STATUS / info log

function main() {
  const canvas = document.getElementById('gl-canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) throw new Error('WebGL2 non supporté par ce navigateur.');

  // TODO C : synchroniser le drawing buffer sur la taille affichée (× devicePixelRatio)
  // TODO D : créer le programme (TODO A + B)
  // TODO E : Float32Array des 3 sommets (clip space) → VBO (createBuffer/bindBuffer/bufferData)
  // TODO F : brancher a_position (getAttribLocation, enableVertexAttribArray, vertexAttribPointer)
  // TODO G : viewport → clearColor → clear → useProgram → uniform4f(u_color) → drawArrays
}

main();
```

## Étapes guidées (en friction)

Tu écris le code toi-même — **pas de gap-fill**. Chaque étape correspond à un `// TODO`.

1. **Compilation défensive (TODO A/B).** Écris `compileShader` : `createShader`, `shaderSource`, `compileShader`, puis **teste `gl.getShaderParameter(shader, gl.COMPILE_STATUS)`** et, si faux, `throw` avec `gl.getShaderInfoLog(shader)`. Idem `createProgram` avec `LINK_STATUS` / `getProgramInfoLog`. Sans ça, un shader invalide donne un écran noir muet.
2. **Drawing buffer (TODO C).** `canvas.width = canvas.clientWidth * window.devicePixelRatio` (et pareil pour la hauteur). Sinon le buffer reste à 300×150 et l'image est floue/étirée.
3. **VBO (TODO E).** Écris le `Float32Array` des 3 sommets **en clip space** — reste dans `[-1, +1]` (un sommet haut, deux en bas). Puis `createBuffer` → `bindBuffer(gl.ARRAY_BUFFER, vbo)` → `bufferData(..., gl.STATIC_DRAW)`.
4. **Attribut (TODO F).** `getAttribLocation(program, 'a_position')`, `enableVertexAttribArray(loc)`, puis `vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)`. Le `2` = composantes par sommet (x, y) ; `stride`/`offset` en **octets** (0 = compact ici).
5. **Rendu (TODO G).** Dans l'ordre : `viewport(0, 0, canvas.width, canvas.height)`, `clearColor(0.1, 0.1, 0.2, 1.0)`, `clear(gl.COLOR_BUFFER_BIT)`, `useProgram(program)`, **puis** `getUniformLocation` + `uniform4f(loc, 1, 0, 0, 1)` (rouge), enfin `drawArrays(gl.TRIANGLES, 0, 3)`.
6. **Vérifie à l'œil.** Un triangle rouge centré sur fond bleu foncé. S'il n'y a rien : ouvre la console (erreur de compil ?), vérifie que `posLoc !== -1`, et que les sommets sont bien dans `[-1, +1]`.

Débug attendu : si l'écran reste noir **sans erreur console**, remplace la couleur par un vert franc et vérifie l'ordre `useProgram` **avant** `uniform4f`. Un uniform affecté avant `useProgram` part dans le vide.

## Corrigé complet commenté

`main.js` intégral :

```js
// main.js — corrigé intégral

const VERTEX_SRC = `#version 300 es
in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);   // clip space direct, sans matrice
}`;

const FRAGMENT_SRC = `#version 300 es
precision highp float;        // pas de précision par défaut en fragment 3.00
uniform vec4 u_color;         // même couleur pour tous les fragments du draw call
out vec4 fragColor;           // sortie explicite (gl_FragColor n'existe plus)
void main() {
  fragColor = u_color;
}`;

// Compile un shader ET lève une erreur EXPLICITE si la compilation échoue.
function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  // WebGL ne lève rien : on DOIT interroger COMPILE_STATUS nous-mêmes.
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    const kind = type === gl.VERTEX_SHADER ? 'VERTEX' : 'FRAGMENT';
    gl.deleteShader(shader);
    throw new Error(`Compilation ${kind} shader échouée :\n${log}`);
  }
  return shader;
}

// Compile + attache + linke vertex & fragment en un programme utilisable.
function createProgram(gl, vsSrc, fsSrc) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  // Même piège : le linkage peut échouer silencieusement.
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Linkage programme échoué :\n${log}`);
  }
  gl.deleteShader(vs);   // le programme garde une copie compilée
  gl.deleteShader(fs);
  return program;
}

function main() {
  // 1. Contexte
  const canvas = document.getElementById('gl-canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) throw new Error('WebGL2 non supporté par ce navigateur.');

  // 2. Synchroniser le drawing buffer sur la taille affichée (× densité d'écran)
  canvas.width = canvas.clientWidth * window.devicePixelRatio;
  canvas.height = canvas.clientHeight * window.devicePixelRatio;

  // 3. Programme (compile + link + vérif des logs)
  const program = createProgram(gl, VERTEX_SRC, FRAGMENT_SRC);

  // 4. Sommets du triangle, en clip space (x, y) — tous dans [-1, +1]
  const positions = new Float32Array([
     0.0,  0.5,   // sommet haut
    -0.5, -0.5,   // bas-gauche
     0.5, -0.5,   // bas-droit
  ]);

  // 5. VBO : copier les positions CPU → GPU
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

  // 6. Décrire l'attribut a_position (stride/offset EN OCTETS ; 0 = compact)
  const posLoc = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  // 7. Rendu : viewport → clear → programme
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.1, 0.1, 0.2, 1.0);   // fond bleu foncé
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);

  // Uniform couleur : rouge opaque — APRÈS useProgram, sinon écrit dans le vide
  const colorLoc = gl.getUniformLocation(program, 'u_color');
  gl.uniform4f(colorLoc, 1.0, 0.0, 0.0, 1.0);

  // 8. Draw call : 3 SOMMETS = 1 triangle (count = sommets, pas triangles)
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

main();
```

**Pourquoi ce corrigé est correct :**

- `compileShader` / `createProgram` **lisent les info logs** : la moindre faute GLSL est signalée en clair dans la console, au lieu d'un écran noir muet.
- Les 3 positions sont **en clip space** (`[-1, +1]`), donc directement visibles sans aucune matrice.
- L'uniform `u_color` est affecté **après `useProgram`** — sinon il part vers le programme courant (aucun), sans effet.
- `drawArrays(gl.TRIANGLES, 0, 3)` : le `3` est un nombre de **sommets** (3 sommets = 1 triangle), pas de triangles.
- `viewport` **et** `clear` sont présents : les deux causes classiques d'écran vide sont couvertes.

## Grille d'évaluation

| Critère | Attendu | Poids |
|---------|---------|-------|
| Contexte + drawing buffer | `getContext('webgl2')` testé (`if (!gl)`), buffer synchronisé sur la taille CSS × `devicePixelRatio` | ★★ |
| Compilation défensive | `COMPILE_STATUS` **et** `LINK_STATUS` lus, info logs remontés dans une erreur explicite | ★★★ |
| GLSL ES 300 | `#version 300 es` en 1re ligne, `in`/`out`/`uniform`, `precision highp float;` en fragment | ★★ |
| VBO + attribut | `bufferData(STATIC_DRAW)`, `vertexAttribPointer(loc, 2, FLOAT, …)`, `posLoc !== -1` | ★★★ |
| Uniform couleur | `getUniformLocation` + `uniform4f` **après** `useProgram` | ★★ |
| Draw call + état | `viewport` + `clear` posés, `drawArrays(TRIANGLES, 0, 3)` (count = sommets) | ★★★ |
| Rendu visuel | un triangle coloré s'affiche réellement dans Chrome/Firefox | ★★★ |

## Notes du coach (relances)

1. **Exige la lecture du log AVANT tout.** Si l'apprenant saute `getShaderInfoLog` « parce que ça marchera », fais-lui casser volontairement le shader (retire `precision highp float;`) : l'écran reste noir sans erreur. Là seulement la valeur de la vérif défensive est vécue, pas récitée.
2. **Traque l'ordre `useProgram` / uniform.** Demande à voix haute pourquoi `uniform4f` vient **après** `useProgram`. Si la réponse hésite, fais inverser les deux lignes : le triangle disparaît (ou reste noir). C'est le piège #7 du module — fais-le sentir.
3. **Discrimine « rien à l'écran » sans erreur console.** Trois causes à faire distinguer une par une : sommets hors `[-1, +1]` (piège #3), `viewport`/`clear` oublié (piège #6), `posLoc === -1` (nom d'attribut mal orthographié). Ne laisse pas deviner au hasard — fais isoler.
4. **`count` = sommets, pas triangles.** Si l'apprenant écrit `drawArrays(gl.TRIANGLES, 0, 1)` en pensant « un triangle », rien ne s'affiche. Fais recompter : 3 sommets pour 1 triangle.
5. **Refuse le copier-coller du module.** L'Exemple 1 du module est très proche. Exige que `compileShader` et le protocole soient **retapés sans relire**, quitte à se tromper. La friction ancre ; la copie non.

## Variante J+30 (fading)

Reprends l'exercice **de mémoire, en 20 minutes, sans relire ni le module ni ce corrigé**, avec **deux contraintes ajoutées** :

1. **Trois couleurs de marqueur TribuZen.** Ne dessine plus un seul triangle rouge : dessine le **même** triangle trois fois de suite (même VBO, même programme), en changeant **uniquement l'uniform `u_color`** entre chaque `drawArrays`, aux couleurs des états de sortie :
   - sortie bouclée → vert `uniform4f(loc, 0.1, 0.8, 0.3, 1.0)` ;
   - sortie prévue → orange `uniform4f(loc, 1.0, 0.6, 0.0, 1.0)` ;
   - sortie annulée → gris `uniform4f(loc, 0.5, 0.5, 0.5, 1.0)`.

   Comme les trois triangles se superposent, seul le dernier reste visible — c'est **voulu** : le but est de prouver que la couleur change sans recompiler ni retoucher le VBO. Décale légèrement chaque triangle en clip space (sommets translatés) si tu veux voir les trois côte à côte.

2. **Aucune recompilation ni recréation de buffer entre les draws** — un seul `createProgram`, un seul VBO, seul `u_color` bouge.

**Critère de réussite :** la couleur change entre les draws sans toucher aux shaders ni au VBO, **et** tu sais expliquer pourquoi la couleur est un `uniform` (constant par draw call) et non un attribut (qui varierait par sommet).

## Application TribuZen

Ce triangle est le **premier rendu GPU concret** de TribuZen : le **marqueur de sortie** minimal sur la carte de la famille. Chaque sortie (rando, pique-nique) devient un point piloté par WebGL2 — positions en clip space (converties depuis les coordonnées carte dans les modules suivants), couleur via `u_color` selon l'état.

Dans le repo `smaurier/tribuzen`, la logique se range ainsi :

```
tribuzen/
  src/
    3d/
      gl/
        glUtils.ts         ← compileShader / createProgram (lecture des info logs)
      markers/
        MarkerRenderer.ts   ← VBO + attribut + uniform couleur du marqueur
      MapCanvas.vue         ← <canvas> WebGL2 de la carte des sorties
```

**Différences par rapport au lab :**

- Un **seul** programme + un **seul** VBO servent tous les marqueurs ; seul l'uniform `u_color` change entre les draws (exactement la variante J+30).
- Les positions viendront d'une projection géo → clip space (module 03), pas de valeurs codées en dur.
- Le module 07 branchera plusieurs attributs (position + couleur par sommet, textures) sur ce même socle.

Commit suggéré : `feat(map3d): marqueur de sortie — triangle WebGL2, couleur par uniform selon l'état`.
