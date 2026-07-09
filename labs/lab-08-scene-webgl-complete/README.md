# Lab 08 — Scène WebGL complète

> **Outcome :** à la fin, tu sais assembler de zéro une scène WebGL2 **animée et éclairée** — plusieurs cubes (une model matrix chacun), éclairage Blinn-Phong, depth test, boucle `requestAnimationFrame` et caméra orbitale — qui tourne dans un vrai navigateur.
> **Vrai outil :** WebGL2 dans Chrome/Firefox (canvas + shaders GLSL ES 3.00), TypeScript compilé par Vite. Aucun harnais simulé, aucun test-runner.
> **Feedback :** le coach valide en session à l'œil (la scène tourne, s'éclaire, se pilote à la souris) + la grille ci-dessous.

## Énoncé

Tu construis la **mini-scène 3D des sorties** de TribuZen : une grille de cubes qui tournent lentement, éclairés par une lumière ponctuelle, survolés par une caméra orbitale pilotée à la souris.

Contrainte : tu écris le pipeline **toi-même**. Les seules briques fournies sont les 3 fonctions d'algèbre linéaire (`perspective`, `lookAt`, `computeNormalMatrix`) et la géométrie du cube — pour que tu te concentres sur l'**assemblage** (modules 06-07 + maths), pas sur la réécriture des maths des modules 01-03.

### Starter

`index.html` :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Scène des sorties — TribuZen 3D</title>
  <style>
    html, body { margin: 0; height: 100%; background: #0b0b12; overflow: hidden; }
    canvas { display: block; width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <canvas id="scene"></canvas>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

`mat.ts` — **fourni**, ne pas réécrire (algèbre des modules 01-03) :

```typescript
// Projection perspective (column-major). fovY en radians.
export function perspective(out: Float32Array, fovY: number, aspect: number, near: number, far: number): void {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  out.set([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

// View matrix : caméra en `eye` regardant `center`, up donné (column-major).
export function lookAt(out: Float32Array, eye: number[] | Float32Array, center: number[] | Float32Array, up: number[]): void {
  let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
  let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  out.set([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
    -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
    -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
    1,
  ]);
}

// Normal matrix = transpose(inverse(mat3(model))) → mat3 (9 floats).
export function computeNormalMatrix(m: Float32Array): Float32Array {
  const a00 = m[0], a01 = m[1], a02 = m[2];
  const a10 = m[4], a11 = m[5], a12 = m[6];
  const a20 = m[8], a21 = m[9], a22 = m[10];
  const det = a00 * (a11 * a22 - a12 * a21) - a01 * (a10 * a22 - a12 * a20) + a02 * (a10 * a21 - a11 * a20);
  if (Math.abs(det) < 1e-8) return new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const id = 1 / det;
  return new Float32Array([
    (a11 * a22 - a12 * a21) * id, (a12 * a20 - a10 * a22) * id, (a10 * a21 - a11 * a20) * id,
    (a02 * a21 - a01 * a22) * id, (a00 * a22 - a02 * a20) * id, (a01 * a20 - a00 * a21) * id,
    (a01 * a12 - a02 * a11) * id, (a02 * a10 - a00 * a12) * id, (a00 * a11 - a01 * a10) * id,
  ]);
}

// Géométrie cube : positions + normales entrelacées (stride 6 floats) + indices.
export const CUBE = {
  vertices: new Float32Array([
    -0.5,-0.5, 0.5, 0,0,1,   0.5,-0.5, 0.5, 0,0,1,   0.5, 0.5, 0.5, 0,0,1,  -0.5, 0.5, 0.5, 0,0,1,
     0.5,-0.5,-0.5, 0,0,-1,  -0.5,-0.5,-0.5, 0,0,-1, -0.5, 0.5,-0.5, 0,0,-1,  0.5, 0.5,-0.5, 0,0,-1,
    -0.5, 0.5, 0.5, 0,1,0,   0.5, 0.5, 0.5, 0,1,0,   0.5, 0.5,-0.5, 0,1,0,  -0.5, 0.5,-0.5, 0,1,0,
    -0.5,-0.5,-0.5, 0,-1,0,  0.5,-0.5,-0.5, 0,-1,0,  0.5,-0.5, 0.5, 0,-1,0, -0.5,-0.5, 0.5, 0,-1,0,
     0.5,-0.5, 0.5, 1,0,0,   0.5,-0.5,-0.5, 1,0,0,   0.5, 0.5,-0.5, 1,0,0,   0.5, 0.5, 0.5, 1,0,0,
    -0.5,-0.5,-0.5,-1,0,0,  -0.5,-0.5, 0.5,-1,0,0,  -0.5, 0.5, 0.5,-1,0,0,  -0.5, 0.5,-0.5,-1,0,0,
  ]),
  indices: new Uint16Array([
     0,1,2, 0,2,3,    4,5,6, 4,6,7,    8,9,10, 8,10,11,
    12,13,14, 12,14,15,  16,17,18, 16,18,19,  20,21,22, 20,22,23,
  ]),
};
```

`main.ts` — **le squelette à compléter** (les `// TODO` sont ton travail) :

```typescript
import { perspective, lookAt, computeNormalMatrix, CUBE } from './mat';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const gl = canvas.getContext('webgl2');
if (!gl) throw new Error('WebGL2 non supporté.');

// TODO 1 — état 3D : activer DEPTH_TEST et CULL_FACE, poser clearColor.
// TODO 2 — compiler le programme Blinn-Phong (réutilise createProgram du module 06/07).
// TODO 3 — créer un VAO du cube (VBO positions+normales entrelacées, EBO indices).
// TODO 4 — caméra orbitale : phi/theta/radius + events souris (drag) + molette (zoom).
// TODO 5 — resize : caler canvas.width/height sur devicePixelRatio, gl.viewport, projection.
// TODO 6 — modèle des objets : une grille 3x3 de cubes, chacun sa position + sa vitesse.
// TODO 7 — boucle requestAnimationFrame : dt clampé, update (angles), render (clear + boucle objets).
```

## Étapes (en friction)

1. **État 3D + programme** — active `DEPTH_TEST` et `CULL_FACE`, `clearColor` sombre. Compile le couple vertex/fragment Blinn-Phong (module 08 §Exemple 2) avec ta `createProgram` du module 06/07. Vérifie les info logs.
2. **VAO du cube** — un VBO avec `CUBE.vertices` (stride `6 * 4` octets, `a_position` offset 0, `a_normal` offset `3 * 4`), un EBO avec `CUBE.indices`. Récupère les locations d'attributs depuis le programme.
3. **Caméra orbitale** — `phi`, `theta` (clampé `]-1.5, 1.5[`), `radius`. `mousedown/mousemove/mouseup` pour tourner, `wheel` pour zoomer. À chaque changement, recalcule la position sphérique puis `lookAt` → `view`.
4. **Resize** — un `ResizeObserver` (ou `window.resize`) qui cale `canvas.width/height` sur `clientWidth * devicePixelRatio`, appelle `gl.viewport(...)` et recalcule la `projection` (aspect).
5. **Grille d'objets** — 9 cubes en grille 3×3 dans le plan XZ, chacun avec sa `position`, son `angle` et sa `speed`. Une couleur d'albédo par état de sortie (vert/orange).
6. **Boucle de rendu** — `requestAnimationFrame` : `dt = Math.min((now-last)/1000, 0.1)`, incrémente chaque `angle += speed * dt`, reconstruis la model matrix (rotation Y + translation), `clear(COLOR|DEPTH)`, pose les uniforms partagés une fois, puis boucle les objets (model + normal matrix + `drawElements`).
7. **Vérifie à l'œil** — les cubes tournent, le relief est visible (faces claires côté lumière), le depth test empêche les faces arrière de transparaître, la souris oriente la vue.

## Corrigé complet commenté

```typescript
import { perspective, lookAt, computeNormalMatrix, CUBE } from './mat';

// --- Contexte + état 3D (TODO 1) ---
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const gl = canvas.getContext('webgl2');
if (!gl) throw new Error('WebGL2 non supporté.');
gl.enable(gl.DEPTH_TEST);   // le Z-buffer trie les fragments par profondeur
gl.enable(gl.CULL_FACE);    // jette les faces arrière (winding CCW = avant)
gl.clearColor(0.04, 0.04, 0.07, 1);

// --- Compilation (TODO 2) ---
function createProgram(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const compile = (type: number, src: string): WebGLShader => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)!);
    return sh;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)!);
  return p;
}

const VERT = `#version 300 es
in vec3 a_position;
in vec3 a_normal;
uniform mat4 u_model, u_view, u_projection;
uniform mat3 u_normalMatrix;
out vec3 v_worldPos;
out vec3 v_normal;
void main() {
  vec4 wp = u_model * vec4(a_position, 1.0);
  v_worldPos = wp.xyz;
  v_normal = u_normalMatrix * a_normal;          // normale correcte même sous scale
  gl_Position = u_projection * u_view * wp;      // MVP
}`;

const FRAG = `#version 300 es
precision highp float;
uniform vec3 u_lightPos, u_cameraPos, u_albedo;
in vec3 v_worldPos;
in vec3 v_normal;
out vec4 fragColor;
void main() {
  vec3 N = normalize(v_normal);
  vec3 L = normalize(u_lightPos - v_worldPos);   // surface → lumière
  vec3 V = normalize(u_cameraPos - v_worldPos);  // surface → caméra
  vec3 H = normalize(L + V);                      // halfway (Blinn)
  vec3 ambient  = 0.15 * u_albedo;
  vec3 diffuse  = max(dot(N, L), 0.0) * u_albedo;
  vec3 specular = pow(max(dot(N, H), 0.0), 64.0) * vec3(1.0);
  fragColor = vec4(ambient + diffuse + specular, 1.0);
}`;

const program = createProgram(gl, VERT, FRAG);

// --- VAO du cube (TODO 3) ---
const vao = gl.createVertexArray()!;
gl.bindVertexArray(vao);
const vbo = gl.createBuffer()!;
gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
gl.bufferData(gl.ARRAY_BUFFER, CUBE.vertices, gl.STATIC_DRAW);
const STRIDE = 6 * 4;                             // 6 floats × 4 octets
const posLoc = gl.getAttribLocation(program, 'a_position');
gl.enableVertexAttribArray(posLoc);
gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, STRIDE, 0);
const normLoc = gl.getAttribLocation(program, 'a_normal');
gl.enableVertexAttribArray(normLoc);
gl.vertexAttribPointer(normLoc, 3, gl.FLOAT, false, STRIDE, 3 * 4);  // offset EN OCTETS
const ebo = gl.createBuffer()!;
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, CUBE.indices, gl.STATIC_DRAW);
gl.bindVertexArray(null);

// --- Uniform locations (cache) ---
const U = {
  model: gl.getUniformLocation(program, 'u_model'),
  view: gl.getUniformLocation(program, 'u_view'),
  proj: gl.getUniformLocation(program, 'u_projection'),
  normalMat: gl.getUniformLocation(program, 'u_normalMatrix'),
  light: gl.getUniformLocation(program, 'u_lightPos'),
  cam: gl.getUniformLocation(program, 'u_cameraPos'),
  albedo: gl.getUniformLocation(program, 'u_albedo'),
};

// --- Caméra orbitale (TODO 4) ---
let phi = 0.6, theta = 0.5, radius = 9;
const view = new Float32Array(16);
const cameraPos = new Float32Array(3);
function updateCamera(): void {
  cameraPos[0] = radius * Math.cos(theta) * Math.sin(phi);
  cameraPos[1] = radius * Math.sin(theta);
  cameraPos[2] = radius * Math.cos(theta) * Math.cos(phi);
  lookAt(view, cameraPos, [0, 0, 0], [0, 1, 0]);
}
let dragging = false, px = 0, py = 0;
canvas.addEventListener('mousedown', (e) => { dragging = true; px = e.clientX; py = e.clientY; });
window.addEventListener('mouseup', () => { dragging = false; });
canvas.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  phi -= (e.clientX - px) * 0.006;
  theta += (e.clientY - py) * 0.006;
  theta = Math.max(-1.5, Math.min(1.5, theta));   // clamp : évite le pôle (lookAt dégénère)
  px = e.clientX; py = e.clientY;
  updateCamera();
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  radius = Math.max(3, Math.min(30, radius + e.deltaY * 0.01));
  updateCamera();
}, { passive: false });
updateCamera();

// --- Resize (TODO 5) ---
const projection = new Float32Array(16);
function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  gl.viewport(0, 0, canvas.width, canvas.height);
  perspective(projection, Math.PI / 4, canvas.width / canvas.height, 0.1, 100);
}
new ResizeObserver(resize).observe(canvas);
resize();

// --- Grille d'objets (TODO 6) : 3×3 cubes dans le plan XZ ---
type Cube = { pos: [number, number, number]; speed: number; albedo: [number, number, number]; angle: number };
const cubes: Cube[] = [];
const GREEN: [number, number, number] = [0.2, 0.8, 0.4];   // sortie bouclée
const ORANGE: [number, number, number] = [1.0, 0.6, 0.1];  // sortie prévue
let i = 0;
for (let x = -1; x <= 1; x++) {
  for (let z = -1; z <= 1; z++) {
    cubes.push({
      pos: [x * 2.2, 0, z * 2.2],
      speed: 0.4 + (i % 3) * 0.3,
      albedo: i % 2 === 0 ? GREEN : ORANGE,
      angle: i * 0.5,
    });
    i++;
  }
}

const model = new Float32Array(16);
function setModelRotY(pos: [number, number, number], a: number): void {
  const c = Math.cos(a), s = Math.sin(a);
  model.set([                       // rotation Y + translation (column-major)
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    pos[0], pos[1], pos[2], 1,
  ]);
}

// --- Boucle de rendu (TODO 7) ---
let last = 0;
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1);   // delta clampé
  last = now;

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);   // couleur ET profondeur
  gl.useProgram(program);

  // Uniforms partagés : une fois par frame
  gl.uniformMatrix4fv(U.view, false, view);         // transpose = false, toujours
  gl.uniformMatrix4fv(U.proj, false, projection);
  gl.uniform3fv(U.cam, cameraPos);
  gl.uniform3f(U.light, 4, 6, 4);                   // lumière ponctuelle fixe

  gl.bindVertexArray(vao);
  for (const cube of cubes) {
    cube.angle += cube.speed * dt;                  // animation liée au temps réel
    setModelRotY(cube.pos, cube.angle);
    gl.uniformMatrix4fv(U.model, false, model);
    gl.uniformMatrix3fv(U.normalMat, false, computeNormalMatrix(model));
    gl.uniform3f(U.albedo, cube.albedo[0], cube.albedo[1], cube.albedo[2]);
    gl.drawElements(gl.TRIANGLES, CUBE.indices.length, gl.UNSIGNED_SHORT, 0);  // 36 indices
  }
  gl.bindVertexArray(null);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

Lancer : `npm create vite@latest` (template vanilla-ts), déposer `index.html`, `main.ts`, `mat.ts`, puis `npm run dev` et ouvrir la page. Neuf cubes tournent, éclairés d'un côté ; la souris oriente la vue, la molette zoome.

## Grille de validation

| Critère | Attendu | ✅ / ❌ |
|---|---|---|
| Depth test | `gl.enable(DEPTH_TEST)` + `clear(COLOR\|DEPTH)` chaque frame ; aucune face arrière ne transparaît | |
| MVP par objet | une `model` distincte par cube, `view`/`projection` partagées, posées une fois/frame | |
| Normal matrix | `computeNormalMatrix` appelée par objet, passée en `mat3` ; relief correct | |
| Blinn-Phong | ambiant + diffus (`dot(N,L)`) + spéculaire (`dot(N,H)`), N/L/V/H **normalisés** | |
| `uniformMatrix4fv` | `transpose = false` partout | |
| Boucle de rendu | `requestAnimationFrame` + `dt` clampé ; rotation indépendante du framerate | |
| Caméra orbitale | souris tourne, molette zoome, `theta` clampé (pas de « claquement » aux pôles) | |
| Resize | canvas net après redimensionnement (viewport + projection recalculés) | |

## Coaching (checkpoints session)

1. **Écran noir après quelques secondes ?** → oublié `DEPTH_BUFFER_BIT` dans le `clear` (PIÈGE #1). Le depth buffer garde les profondeurs de N-1, plus rien ne passe. Vérifie `gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)`.
2. **Cubes noirs ou plats, sans relief ?** → normale non normalisée dans le fragment (`normalize(v_normal)`), ou lumière côté opposé. Ajoute un `debug` : `fragColor = vec4(N * 0.5 + 0.5, 1.0)` doit montrer les 6 faces en couleurs distinctes.
3. **Scène déformée / vide alors que le code « semble » bon ?** → `transpose` à `true` dans un `uniformMatrix4fv`, ou model matrix mal ordonnée (row-major au lieu de column-major). Repars du corrigé pour l'ordre.
4. **La vue « claque » quand on lève la caméra ?** → `theta` non clampé (PIÈGE #7). Ajoute `theta = Math.max(-1.5, Math.min(1.5, theta))`.
5. **Vitesse de rotation qui change selon la machine ?** → tu animes avec un incrément fixe. Passe à `angle += speed * dt`.

## Variante J+30 (fading)

Refais la scène **en 25 min, sans regarder le corrigé**, avec **une contrainte ajoutée** : ajoute une **deuxième lumière** de couleur différente qui **orbite** autour de la scène (position recalculée dans la boucle depuis `now`). Le fragment shader doit accumuler les deux lumières (`for` borné, `MAX_LIGHTS = 2`). Bonus : colore chaque cube selon son état de sortie réel (vert/orange/gris) au lieu de l'alternance.

## Application TribuZen

Porte cette scène dans `smaurier/tribuzen` sous `src/3d/scene/` : `SceneRenderer.ts` (la passe de rendu), `OrbitCamera.ts` (la caméra), `mat.ts` (l'algèbre), et un composant `OutingsScene.vue` qui monte le `<canvas>` et alimente les cubes depuis le vrai store des sorties (une model matrix par sortie, albédo selon l'état). Commit : `feat(3d): mini-scène 3D des sorties éclairée (Blinn-Phong + orbit camera)`.
