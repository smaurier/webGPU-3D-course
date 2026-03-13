# Module 08 — Scene WebGL complete

| Difficulte | Duree estimee | Lab | Quiz |
|------------|---------------|-----|------|
| 5/5        | 150 min       | [Lab 08](../labs/lab-08-scene-webgl/) | [Quiz 08](../quizzes/quiz-08-scene-webgl.html) |

## Objectifs pedagogiques

A la fin de ce module, vous serez capable de :

- Construire une boucle de rendu robuste avec `requestAnimationFrame` et delta time
- Implementer une orbit camera avec coordonnees spheriques
- Gerer plusieurs objets avec leur propre VAO, shader et model matrix
- Calculer la normal matrix pour transformer correctement les normales
- Implementer un eclairage multi-sources dans le fragment shader
- Afficher une skybox avec une cubemap texture
- Utiliser l'instanced rendering pour dessiner des milliers d'objets
- Configurer l'antialiasing MSAA et la transparence avec blending
- Gerer le redimensionnement du canvas avec ResizeObserver
- Organiser le code en classes reutilisables (Mesh, Material, Camera, Renderer)
- Comprendre les limitations de WebGL et la transition vers WebGPU

---

<details>
<summary>Rappel du module precedent — Shaders, buffers et textures</summary>

Avant de continuer, verifie que tu maitrises ces points :

1. **Quelle est la difference entre VBO, VAO et EBO ?**
   Le VBO stocke les donnees brutes sur le GPU, le VAO memorise la configuration de lecture des attributs (stride, offset, type), et l'EBO stocke les indices pour eviter la duplication de sommets.

2. **Comment fonctionne `vertexAttribPointer` ?**
   Il decrit comment lire un attribut dans le VBO : index, nombre de composantes, type, normalisation, stride (distance entre 2 sommets) et offset (position dans un sommet).

3. **Qu'est-ce qu'un uniform et comment le passer au shader ?**
   Un uniform est une valeur constante pour tout un draw call. On le passe via `gl.uniform*` (scalaires, vecteurs) ou `gl.uniformMatrix*fv` (matrices).

4. **Comment fonctionne l'interpolation des varyings ?**
   Le vertex shader ecrit des `out` variables, le rasterizer les interpole de facon barycentrique entre les 3 sommets du triangle, et le fragment shader les recoit via des `in` variables.

5. **A quoi sert un Framebuffer Object (FBO) ?**
   Il permet de dessiner dans une texture au lieu de l'ecran. C'est la base du post-processing, des shadow maps et des reflexions.

</details>

---

## 1. Analogie — La scene WebGL comme un plateau de tournage

Construire une scene WebGL complete ressemble a organiser un plateau de cinema :

```
PLATEAU DE CINEMA                    SCENE WEBGL
=================                    ===========

Realisateur                          Render loop
  = decide quoi filmer                 = orchestre chaque frame
    et quand                            et dans quel ordre

Camera + operateur                   Camera (view + projection matrix)
  = cadrage, zoom, deplacement         = position, orientation, FOV

Eclairage                            Lumieres (uniforms dans le shader)
  = spots, ambiance, reflecteurs       = point lights, directional, ambient

Decor (fond)                         Skybox (cubemap)
  = toile peinte, fond vert            = texture cube 360 degres

Acteurs et accessoires               Objets (VAO + shader + model matrix)
  = chacun a son costume               = chacun a sa geometrie, son materiau
    et sa position sur scene              et sa transformation

Figurants (100 identiques)           Instanced rendering
  = memes costumes, positions           = meme mesh, positions differentes
    differentes                           en un seul draw call

Montage / post-production            Blending, MSAA, FBO
  = effets, transparence                = antialiasing, transparence,
    correction couleur                    post-processing
```

:::tip Analogie cle
Le **render loop** est le realisateur : a chaque frame (25-60 fois par seconde), il re-donne toutes les instructions — repositionner la camera, regler les lumieres, placer les acteurs — puis crie "Action !" (`gl.drawElements`).
:::

---

## 2. La boucle de rendu — requestAnimationFrame et delta time

### 2.1 Pourquoi requestAnimationFrame ?

```typescript
// MAUVAIS : setInterval — pas synchronise avec l'ecran
setInterval(() => render(), 16); // ~60 FPS mais derive, saccade

// BON : requestAnimationFrame — synchronise avec le refresh de l'ecran
function frame(now: number): void {
  // ... rendu ...
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

`requestAnimationFrame` (rAF) synchronise le rendu avec le taux de rafraichissement de l'ecran (vsync). Il :
- S'arrete automatiquement quand l'onglet n'est pas visible (economie CPU/GPU)
- Fournit un timestamp en millisecondes (`now`) pour les animations
- Garantit un rendu fluide sans "tearing"

### 2.2 Delta time : animations independantes du framerate

```typescript
let lastTime = 0;

function frame(now: number): void {
  // Delta time en secondes
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  // MAUVAIS : animation liee au framerate
  // angle += 0.01;  // 60 FPS = rapide, 30 FPS = lent

  // BON : animation liee au temps reel
  angle += rotationSpeed * dt; // meme vitesse quel que soit le FPS

  // Securite : clamp le delta time (evite les sauts apres un lag)
  const safeDt = Math.min(dt, 0.1); // max 100ms de saut

  render(safeDt);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
```

### 2.3 Structure complete d'un render loop

```typescript
interface AppState {
  gl: WebGL2RenderingContext;
  objects: SceneObject[];
  camera: OrbitCamera;
  lights: Light[];
  time: number;
}

function createRenderLoop(state: AppState): void {
  let lastTime = 0;
  let running = true;

  function frame(now: number): void {
    if (!running) return;

    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    state.time += dt;

    // 1. Mise a jour (logique, animations, physique)
    update(state, dt);

    // 2. Rendu (draw calls)
    render(state);

    // 3. Planifier la prochaine frame
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  // Pour arreter le loop (cleanup)
  return () => { running = false; };
}

function update(state: AppState, dt: number): void {
  state.camera.update(dt);
  for (const obj of state.objects) {
    obj.update(dt);
  }
}

function render(state: AppState): void {
  const { gl, camera, lights, objects } = state;

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  for (const obj of objects) {
    gl.useProgram(obj.shader.program);
    setLightUniforms(gl, obj.shader, lights);
    setCameraUniforms(gl, obj.shader, camera);
    setModelUniforms(gl, obj.shader, obj.modelMatrix);

    gl.bindVertexArray(obj.vao);
    gl.drawElements(gl.TRIANGLES, obj.indexCount, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
  }
}
```

---

## 3. Camera controller — Orbit camera

### 3.1 Coordonnees spheriques

L'orbit camera tourne autour d'un point central (target). On utilise des coordonnees spheriques :

```
             Y (up)
             │
             │    P (camera position)
             │   /
             │  / r (distance)
             │ /
             │/ theta (elevation)
             ┼──────────────── X
            /  phi (azimut)
           /
          Z

Conversion spherique → cartesien :
  x = r * cos(theta) * sin(phi)
  y = r * sin(theta)
  z = r * cos(theta) * cos(phi)

theta : angle vertical (elevation), [-PI/2, +PI/2]
phi   : angle horizontal (azimut), [0, 2*PI]
r     : distance au centre (rayon)
```

### 3.2 Implementation TypeScript

```typescript
class OrbitCamera {
  // Coordonnees spheriques
  phi = 0;                    // azimut (horizontal)
  theta = Math.PI / 6;       // elevation (vertical)
  radius = 5;                // distance au target

  // Cible de l'orbite
  target = new Float32Array([0, 0, 0]);

  // Limites
  minRadius = 1;
  maxRadius = 50;
  minTheta = -Math.PI / 2 + 0.01;  // eviter le pole
  maxTheta = Math.PI / 2 - 0.01;

  // Sensibilite
  rotateSensitivity = 0.005;
  zoomSensitivity = 0.1;
  panSensitivity = 0.01;

  // Matrices resultantes
  viewMatrix = new Float32Array(16);
  position = new Float32Array(3);

  constructor(private canvas: HTMLCanvasElement) {
    this.setupEventListeners();
    this.updateMatrix();
  }

  private setupEventListeners(): void {
    let isRotating = false;
    let isPanning = false;
    let prevX = 0;
    let prevY = 0;

    this.canvas.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button === 0) isRotating = true;      // clic gauche = rotation
      if (e.button === 2) isPanning = true;        // clic droit = pan
      prevX = e.clientX;
      prevY = e.clientY;
    });

    window.addEventListener('mouseup', () => {
      isRotating = false;
      isPanning = false;
    });

    this.canvas.addEventListener('mousemove', (e: MouseEvent) => {
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      prevX = e.clientX;
      prevY = e.clientY;

      if (isRotating) {
        this.phi -= dx * this.rotateSensitivity;
        this.theta += dy * this.rotateSensitivity;
        this.theta = Math.max(this.minTheta, Math.min(this.maxTheta, this.theta));
        this.updateMatrix();
      }

      if (isPanning) {
        // Pan dans le plan de la camera
        const right = this.getRightVector();
        const up = this.getUpVector();
        this.target[0] -= (dx * right[0] + dy * up[0]) * this.panSensitivity;
        this.target[1] -= (dx * right[1] + dy * up[1]) * this.panSensitivity;
        this.target[2] -= (dx * right[2] + dy * up[2]) * this.panSensitivity;
        this.updateMatrix();
      }
    });

    this.canvas.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      this.radius += e.deltaY * this.zoomSensitivity;
      this.radius = Math.max(this.minRadius, Math.min(this.maxRadius, this.radius));
      this.updateMatrix();
    }, { passive: false });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  updateMatrix(): void {
    // Position de la camera en coordonnees cartesiennes
    this.position[0] = this.target[0] + this.radius * Math.cos(this.theta) * Math.sin(this.phi);
    this.position[1] = this.target[1] + this.radius * Math.sin(this.theta);
    this.position[2] = this.target[2] + this.radius * Math.cos(this.theta) * Math.cos(this.phi);

    // Construire la view matrix (lookAt)
    lookAt(this.viewMatrix, this.position, this.target, [0, 1, 0]);
  }

  private getRightVector(): Float32Array {
    // Premiere ligne de la view matrix
    return new Float32Array([
      this.viewMatrix[0], this.viewMatrix[4], this.viewMatrix[8],
    ]);
  }

  private getUpVector(): Float32Array {
    // Deuxieme ligne de la view matrix
    return new Float32Array([
      this.viewMatrix[1], this.viewMatrix[5], this.viewMatrix[9],
    ]);
  }
}
```

### 3.3 Fonction lookAt (construction de la view matrix)

```typescript
function lookAt(
  out: Float32Array,
  eye: Float32Array | number[],
  center: Float32Array | number[],
  up: Float32Array | number[],
): Float32Array {
  // Calculer les 3 axes de la camera
  // z = direction de vue (eye → center, normalise, inverse)
  let zx = eye[0] - center[0];
  let zy = eye[1] - center[1];
  let zz = eye[2] - center[2];
  let len = Math.sqrt(zx * zx + zy * zy + zz * zz);
  zx /= len; zy /= len; zz /= len;

  // x = right = cross(up, z)
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  len = Math.sqrt(xx * xx + xy * xy + xz * xz);
  xx /= len; xy /= len; xz /= len;

  // y = real up = cross(z, x)
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  // View matrix (column-major pour WebGL)
  out[0]  = xx;  out[1]  = yx;  out[2]  = zx;  out[3]  = 0;
  out[4]  = xy;  out[5]  = yy;  out[6]  = zy;  out[7]  = 0;
  out[8]  = xz;  out[9]  = yz;  out[10] = zz;  out[11] = 0;
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  out[15] = 1;

  return out;
}
```

---

## 4. Multiple objets — chaque objet a son identite

### 4.1 Architecture : un objet = VAO + shader + model matrix

```typescript
interface SceneObject {
  vao: WebGLVertexArray;
  program: WebGLProgram;
  modelMatrix: Float32Array;
  indexCount: number;
  texture: WebGLTexture | null;
  uniforms: Map<string, WebGLUniformLocation>;
  update(dt: number): void;
}

class RotatingCube implements SceneObject {
  vao: WebGLVertexArray;
  program: WebGLProgram;
  modelMatrix = new Float32Array(16);
  indexCount = 36;
  texture: WebGLTexture;
  uniforms: Map<string, WebGLUniformLocation>;

  private angle = 0;
  private position: [number, number, number];
  private rotationSpeed: number;

  constructor(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    position: [number, number, number],
    speed: number,
  ) {
    this.program = program;
    this.position = position;
    this.rotationSpeed = speed;
    this.vao = createCubeVAO(gl, program);
    this.texture = createCheckerTexture(gl);
    this.uniforms = cacheUniforms(gl, program);
  }

  update(dt: number): void {
    this.angle += this.rotationSpeed * dt;

    // Model matrix = Translation * RotationY
    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    this.modelMatrix.set([
       c,  0,  s,  0,
       0,  1,  0,  0,
      -s,  0,  c,  0,
       this.position[0], this.position[1], this.position[2], 1,
    ]);
  }
}
```

### 4.2 Dessiner plusieurs objets

```typescript
function renderScene(
  gl: WebGL2RenderingContext,
  objects: SceneObject[],
  camera: OrbitCamera,
  projectionMatrix: Float32Array,
  lights: Light[],
): void {
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  for (const obj of objects) {
    // Activer le shader de cet objet
    gl.useProgram(obj.program);

    // Passer les matrices
    const modelLoc = obj.uniforms.get('u_model')!;
    const viewLoc = obj.uniforms.get('u_view')!;
    const projLoc = obj.uniforms.get('u_projection')!;

    gl.uniformMatrix4fv(modelLoc, false, obj.modelMatrix);
    gl.uniformMatrix4fv(viewLoc, false, camera.viewMatrix);
    gl.uniformMatrix4fv(projLoc, false, projectionMatrix);

    // Passer la normal matrix
    const normalMatrix = computeNormalMatrix(obj.modelMatrix);
    gl.uniformMatrix3fv(obj.uniforms.get('u_normalMatrix')!, false, normalMatrix);

    // Passer les lumieres
    setLightUniforms(gl, obj.uniforms, lights);

    // Passer la position de la camera
    gl.uniform3fv(obj.uniforms.get('u_cameraPosition')!, camera.position);

    // Binder la texture
    if (obj.texture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, obj.texture);
      gl.uniform1i(obj.uniforms.get('u_diffuseMap')!, 0);
    }

    // Dessiner
    gl.bindVertexArray(obj.vao);
    gl.drawElements(gl.TRIANGLES, obj.indexCount, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
  }
}

// Creation de la scene
const scene: SceneObject[] = [
  new RotatingCube(gl, phongProgram, [-2, 0, 0], 1.0),   // cube gauche
  new RotatingCube(gl, phongProgram, [ 0, 0, 0], 0.5),   // cube centre
  new RotatingCube(gl, phongProgram, [ 2, 0, 0], 1.5),   // cube droit
];
```

---

## 5. Normal matrix — transformer les normales correctement

### 5.1 Le probleme : un scale non-uniforme deforme les normales

```
Scale uniforme (1, 1, 1) :          Scale non-uniforme (2, 1, 1) :
Les normales restent correctes       Les normales sont DEFORMEES

    ┌─────────┐                        ┌───────────────────┐
    │  ↑ N    │                        │     ↗ N (faux!)   │
    │  │      │                        │    /              │
    │  │      │                        │   /               │
    └─────────┘                        └───────────────────┘

La normale devrait pointer vers le haut, mais le scale horizontal
l'a fait pencher. L'eclairage sera FAUX.

Solution : Normal Matrix = transpose(inverse(mat3(ModelMatrix)))

    ┌───────────────────┐
    │  ↑ N (correct!)   │    Avec la normal matrix, la normale
    │  │                │    pointe a nouveau dans la bonne direction
    │  │                │
    └───────────────────┘
```

### 5.2 Mathematiquement

La position se transforme avec la model matrix M :

```
P' = M * P
```

Pour que l'eclairage soit correct, la normale N doit rester **perpendiculaire** a la surface transformee. On demontre que :

```
N' = (M^-1)^T * N

ou :
  M^-1  = inverse de la model matrix
  (...)^T = transposee
```

C'est la **normal matrix**. Si la model matrix ne contient que des rotations et un scale uniforme, `mat3(M)` suffit car la rotation est orthogonale (`M^-1 = M^T` donc `(M^-1)^T = M`).

### 5.3 Implementation

```typescript
function computeNormalMatrix(modelMatrix: Float32Array): Float32Array {
  // Extraire la partie 3x3 de la mat4
  const m = modelMatrix;
  const a00 = m[0], a01 = m[1], a02 = m[2];
  const a10 = m[4], a11 = m[5], a12 = m[6];
  const a20 = m[8], a21 = m[9], a22 = m[10];

  // Determinant de la mat3
  const det = a00 * (a11 * a22 - a12 * a21)
            - a01 * (a10 * a22 - a12 * a20)
            + a02 * (a10 * a21 - a11 * a20);

  if (Math.abs(det) < 1e-6) {
    console.warn('Normal matrix: determinant proche de zero');
    return new Float32Array([1,0,0, 0,1,0, 0,0,1]);
  }

  const invDet = 1.0 / det;

  // Inverse transposee (calcul combine)
  // On calcule l'inverse et on ecrit directement en transposant
  const out = new Float32Array(9);
  out[0] = (a11 * a22 - a12 * a21) * invDet;  // row 0, col 0
  out[1] = (a12 * a20 - a10 * a22) * invDet;  // row 1, col 0 (transpose!)
  out[2] = (a10 * a21 - a11 * a20) * invDet;  // row 2, col 0

  out[3] = (a02 * a21 - a01 * a22) * invDet;  // row 0, col 1
  out[4] = (a00 * a22 - a02 * a20) * invDet;  // row 1, col 1
  out[5] = (a01 * a20 - a00 * a21) * invDet;  // row 2, col 1

  out[6] = (a01 * a12 - a02 * a11) * invDet;  // row 0, col 2
  out[7] = (a02 * a10 - a00 * a12) * invDet;  // row 1, col 2
  out[8] = (a00 * a11 - a01 * a10) * invDet;  // row 2, col 2

  return out;
}
```

### 5.4 Dans le vertex shader

```glsl
#version 300 es

in vec3 a_position;
in vec3 a_normal;

uniform mat4 u_model;
uniform mat4 u_view;
uniform mat4 u_projection;
uniform mat3 u_normalMatrix;   // <-- normal matrix passee en uniform

out vec3 v_worldNormal;
out vec3 v_worldPosition;

void main() {
  vec4 worldPos = u_model * vec4(a_position, 1.0);
  v_worldPosition = worldPos.xyz;

  // Transformer la normale avec la normal matrix
  v_worldNormal = u_normalMatrix * a_normal;

  gl_Position = u_projection * u_view * worldPos;
}
```

---

## 6. Eclairage multi-sources

### 6.1 Structure de donnees pour les lumieres

```typescript
interface Light {
  position: Float32Array;   // vec3
  color: Float32Array;      // vec3
  intensity: number;
  radius: number;           // distance d'influence (attenuation)
}

function setLightUniforms(
  gl: WebGL2RenderingContext,
  uniforms: Map<string, WebGLUniformLocation>,
  lights: Light[],
): void {
  const numLights = Math.min(lights.length, 4); // max 4 dans le shader
  gl.uniform1i(uniforms.get('u_numLights')!, numLights);

  for (let i = 0; i < numLights; i++) {
    const light = lights[i];
    const prefix = `u_lights[${i}]`;

    gl.uniform3fv(uniforms.get(`${prefix}.position`)!, light.position);
    gl.uniform3fv(uniforms.get(`${prefix}.color`)!, light.color);
    gl.uniform1f(uniforms.get(`${prefix}.intensity`)!, light.intensity);
    gl.uniform1f(uniforms.get(`${prefix}.radius`)!, light.radius);
  }
}
```

### 6.2 Fragment shader multi-lumieres

```glsl
#version 300 es
precision highp float;

struct Light {
  vec3 position;
  vec3 color;
  float intensity;
  float radius;
};

const int MAX_LIGHTS = 4;
uniform Light u_lights[MAX_LIGHTS];
uniform int u_numLights;

uniform vec3 u_cameraPosition;
uniform vec3 u_ambientColor;
uniform float u_shininess;
uniform sampler2D u_diffuseMap;

in vec3 v_worldPosition;
in vec3 v_worldNormal;
in vec2 v_texCoord;

out vec4 fragColor;

vec3 calculateLight(Light light, vec3 N, vec3 V, vec3 albedo) {
  vec3 L = light.position - v_worldPosition;
  float dist = length(L);
  L = normalize(L);

  // Attenuation par la distance
  float attenuation = 1.0 / (1.0 + 0.09 * dist + 0.032 * dist * dist);

  // Attenuation par le rayon d'influence
  float falloff = clamp(1.0 - dist / light.radius, 0.0, 1.0);
  falloff *= falloff; // courbe quadratique

  // Diffuse (Lambert)
  float diff = max(dot(N, L), 0.0);
  vec3 diffuse = diff * light.color * light.intensity;

  // Speculaire (Blinn-Phong)
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), u_shininess);
  vec3 specular = spec * light.color * light.intensity;

  return (diffuse * albedo + specular) * attenuation * falloff;
}

void main() {
  vec3 N = normalize(v_worldNormal);
  vec3 V = normalize(u_cameraPosition - v_worldPosition);
  vec3 albedo = texture(u_diffuseMap, v_texCoord).rgb;

  // Accumulation de toutes les lumieres
  vec3 result = u_ambientColor * albedo;

  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= u_numLights) break;
    result += calculateLight(u_lights[i], N, V, albedo);
  }

  // Tone mapping simple (evite la surexposition)
  result = result / (result + vec3(1.0));

  fragColor = vec4(result, 1.0);
}
```

:::warning Boucles et performance en GLSL
Les boucles en GLSL doivent avoir une borne superieure constante (`MAX_LIGHTS`). Le `break` conditionnel permet de sauter les lumieres inutilisees, mais le compilateur peut quand meme derouler la boucle. Garder `MAX_LIGHTS` petit (4-8) est important pour la performance.
:::

---

## 7. Skybox avec cubemap texture

### 7.1 Qu'est-ce qu'une cubemap ?

```
Une cubemap est une texture composee de 6 images, une par face d'un cube :

        ┌───────┐
        │  +Y   │   (haut / top)
        │ (top) │
  ┌─────┼───────┼─────┬───────┐
  │ -X  │  +Z   │ +X  │  -Z   │
  │left │ front │right│ back  │
  └─────┼───────┼─────┴───────┘
        │  -Y   │   (bas / bottom)
        │(bot.) │
        └───────┘

On echantillonne avec une direction 3D (vec3), pas des UV 2D.
Le GPU trouve automatiquement la bonne face et les bonnes coordonnees.
```

### 7.2 Charger une cubemap

```typescript
async function loadCubemap(
  gl: WebGL2RenderingContext,
  urls: {
    posX: string; negX: string;
    posY: string; negY: string;
    posZ: string; negZ: string;
  },
): Promise<WebGLTexture> {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);

  const faces: Array<{ target: number; url: string }> = [
    { target: gl.TEXTURE_CUBE_MAP_POSITIVE_X, url: urls.posX },
    { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_X, url: urls.negX },
    { target: gl.TEXTURE_CUBE_MAP_POSITIVE_Y, url: urls.posY },
    { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, url: urls.negY },
    { target: gl.TEXTURE_CUBE_MAP_POSITIVE_Z, url: urls.posZ },
    { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, url: urls.negZ },
  ];

  // Charger les 6 faces en parallele
  const images = await Promise.all(
    faces.map(
      (face) =>
        new Promise<{ target: number; img: HTMLImageElement }>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve({ target: face.target, img });
          img.onerror = () => reject(new Error(`Echec: ${face.url}`));
          img.src = face.url;
        }),
    ),
  );

  // Envoyer chaque face au GPU
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
  for (const { target, img } of images) {
    gl.texImage2D(target, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  }

  // Parametres de la cubemap
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

  return texture;
}
```

### 7.3 Shaders de la skybox

```glsl
// skybox-vertex.glsl
#version 300 es

in vec3 a_position;

uniform mat4 u_viewNoTranslation;  // view matrix SANS la translation
uniform mat4 u_projection;

out vec3 v_texCoord;

void main() {
  v_texCoord = a_position;  // la direction = la position du cube

  // Projection sans translation (la skybox "suit" la camera)
  vec4 pos = u_projection * u_viewNoTranslation * vec4(a_position, 1.0);

  // z = w pour que la skybox soit toujours au fond (depth = 1.0)
  gl_Position = pos.xyww;
}
```

```glsl
// skybox-fragment.glsl
#version 300 es
precision highp float;

uniform samplerCube u_skybox;

in vec3 v_texCoord;

out vec4 fragColor;

void main() {
  fragColor = texture(u_skybox, v_texCoord);
}
```

### 7.4 Dessiner la skybox

```typescript
function drawSkybox(
  gl: WebGL2RenderingContext,
  skyboxProgram: WebGLProgram,
  skyboxVAO: WebGLVertexArray,
  cubemap: WebGLTexture,
  viewMatrix: Float32Array,
  projectionMatrix: Float32Array,
): void {
  // Retirer la translation de la view matrix (garder seulement la rotation)
  const viewNoTranslation = new Float32Array(viewMatrix);
  viewNoTranslation[12] = 0;
  viewNoTranslation[13] = 0;
  viewNoTranslation[14] = 0;

  // Dessiner la skybox APRES la scene, mais avec depth test <= (pas <)
  gl.depthFunc(gl.LEQUAL);  // la skybox a depth = 1.0 (ecriture z = w)

  gl.useProgram(skyboxProgram);
  gl.uniformMatrix4fv(
    gl.getUniformLocation(skyboxProgram, 'u_viewNoTranslation')!, false, viewNoTranslation,
  );
  gl.uniformMatrix4fv(
    gl.getUniformLocation(skyboxProgram, 'u_projection')!, false, projectionMatrix,
  );

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubemap);
  gl.uniform1i(gl.getUniformLocation(skyboxProgram, 'u_skybox')!, 0);

  gl.bindVertexArray(skyboxVAO);
  gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
  gl.bindVertexArray(null);

  gl.depthFunc(gl.LESS);  // restaurer le depth test normal
}
```

:::tip Ordre de rendu de la skybox
On dessine la skybox **apres** les objets opaques avec `gl.depthFunc(gl.LEQUAL)`. Grace au `gl_Position = pos.xyww` dans le vertex shader, la skybox a toujours une profondeur de 1.0. Elle n'apparait que la ou rien d'autre n'a ete dessine (early-z rejection), ce qui economise du fragment processing.
:::

---

## 8. Instanced rendering

### 8.1 Le probleme : dessiner 1000 cubes

```
SANS instanced rendering :                AVEC instanced rendering :

for (let i = 0; i < 1000; i++) {          // 1 seul draw call pour 1000 cubes
  gl.uniformMatrix4fv(modelLoc, ...)      gl.drawArraysInstanced(
  gl.drawElements(...)                      gl.TRIANGLES, 0, 36, 1000
}                                         );

= 1000 draw calls                         = 1 draw call
= 1000 changements d'uniforms             = positions via instance attribute
= lent (CPU bottleneck)                   = rapide (GPU parallelise)
```

### 8.2 Implementation

```typescript
// Creer un buffer avec les positions des 1000 instances
const instanceCount = 1000;
const instancePositions = new Float32Array(instanceCount * 3);

for (let i = 0; i < instanceCount; i++) {
  instancePositions[i * 3 + 0] = (Math.random() - 0.5) * 50; // x
  instancePositions[i * 3 + 1] = (Math.random() - 0.5) * 50; // y
  instancePositions[i * 3 + 2] = (Math.random() - 0.5) * 50; // z
}

// Creer le buffer d'instances
const instanceBuffer = gl.createBuffer()!;
gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
gl.bufferData(gl.ARRAY_BUFFER, instancePositions, gl.STATIC_DRAW);

// Configurer l'attribut d'instance dans le VAO
gl.bindVertexArray(vao);
gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);

const instanceLoc = gl.getAttribLocation(program, 'a_instancePosition');
gl.enableVertexAttribArray(instanceLoc);
gl.vertexAttribPointer(instanceLoc, 3, gl.FLOAT, false, 0, 0);

// CRUCIAL : cet attribut avance par INSTANCE, pas par vertex
gl.vertexAttribDivisor(instanceLoc, 1);
// divisor = 0 : avance par vertex (normal)
// divisor = 1 : avance par instance
// divisor = N : avance toutes les N instances

gl.bindVertexArray(null);
```

### 8.3 Shader avec instance attribute

```glsl
// instanced-vertex.glsl
#version 300 es

in vec3 a_position;
in vec3 a_normal;
in vec3 a_instancePosition;   // par instance (divisor = 1)

uniform mat4 u_view;
uniform mat4 u_projection;

out vec3 v_worldNormal;
out vec3 v_worldPosition;

void main() {
  // La model matrix est simplement une translation par la position d'instance
  vec3 worldPos = a_position + a_instancePosition;
  v_worldPosition = worldPos;
  v_worldNormal = a_normal;   // pas de rotation → normale inchangee

  gl_Position = u_projection * u_view * vec4(worldPos, 1.0);
}
```

### 8.4 Dessiner les instances

```typescript
// Dessiner 1000 instances en UN SEUL draw call
gl.useProgram(instancedProgram);
gl.uniformMatrix4fv(viewLoc, false, camera.viewMatrix);
gl.uniformMatrix4fv(projLoc, false, projectionMatrix);

gl.bindVertexArray(vao);
gl.drawElementsInstanced(
  gl.TRIANGLES,
  36,               // 36 indices par cube
  gl.UNSIGNED_SHORT,
  0,
  instanceCount,    // nombre d'instances (1000)
);
gl.bindVertexArray(null);
```

---

## 9. Antialiasing — MSAA

### 9.1 Qu'est-ce que l'aliasing ?

```
Sans antialiasing :              Avec MSAA 4x :

  ██████                          ▓█████
  ████████                        ▓███████
  ██████████                      ░█████████▓
  ████████████                    ░███████████▓
  ██████████████                  ░█████████████▓

Les bords en "escalier"          Les bords sont lisses grace
(jaggies) sont visibles           au multi-echantillonnage

MSAA (Multisample Anti-Aliasing) :
Le GPU calcule la couverture de chaque triangle a 4 points
(samples) par pixel, puis fait la moyenne pour lisser les bords.
Le fragment shader ne s'execute qu'UNE FOIS par pixel
(pas 4 fois → performant).
```

### 9.2 Activer le MSAA dans WebGL

```typescript
// Methode 1 : a la creation du contexte (le plus simple)
const gl = canvas.getContext('webgl2', {
  antialias: true,   // MSAA active sur le framebuffer par defaut
})!;

// Methode 2 : MSAA sur un FBO (pour le render-to-texture)
function createMSAARenderTarget(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  samples: number,  // 4 pour MSAA 4x
): { msaaFbo: WebGLFramebuffer; resolveFbo: WebGLFramebuffer } {
  // Renderbuffer multisampled pour la couleur
  const colorRbo = gl.createRenderbuffer()!;
  gl.bindRenderbuffer(gl.RENDERBUFFER, colorRbo);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, width, height);

  // Renderbuffer multisampled pour la profondeur
  const depthRbo = gl.createRenderbuffer()!;
  gl.bindRenderbuffer(gl.RENDERBUFFER, depthRbo);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, width, height);

  // FBO multisampled
  const msaaFbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, msaaFbo);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, colorRbo);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRbo);

  // FBO de resolution (texture classique pour post-processing)
  const resolveTexture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, resolveTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  const resolveFbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, resolveFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, resolveTexture, 0);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return { msaaFbo, resolveFbo };
}

// Utilisation : dessiner dans le MSAA FBO, puis resoudre
gl.bindFramebuffer(gl.FRAMEBUFFER, msaaFbo);
drawScene(gl);

// Resoudre les samples (MSAA → texture normale)
gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msaaFbo);
gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, resolveFbo);
gl.blitFramebuffer(
  0, 0, width, height,
  0, 0, width, height,
  gl.COLOR_BUFFER_BIT,
  gl.NEAREST,
);
```

---

## 10. Transparence et blending

### 10.1 Activer le blending

```typescript
gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

// Formule : couleurFinale = srcColor * srcAlpha + dstColor * (1 - srcAlpha)
// Exemple : fragment rouge a 50% alpha sur fond bleu
//   result = (1,0,0) * 0.5 + (0,0,1) * 0.5 = (0.5, 0, 0.5) → violet
```

### 10.2 Le probleme de l'ordre de rendu

```
MAUVAIS : ordre quelconque         BON : back-to-front (painter's algorithm)

Camera → [Verre] [Mur]            Camera → [Mur] puis [Verre]

Le verre est dessine avant         Le mur est dessine d'abord,
le mur. Le depth test rejette      puis le verre par-dessus.
le mur derriere le verre.          Le blending fonctionne correctement.
→ On ne voit pas le mur            → On voit le mur a travers le verre
  a travers le verre
```

### 10.3 Strategie de rendu avec transparence

```typescript
function renderWithTransparency(
  gl: WebGL2RenderingContext,
  opaqueObjects: SceneObject[],
  transparentObjects: SceneObject[],
  camera: OrbitCamera,
): void {
  // ETAPE 1 : Dessiner les objets OPAQUES (n'importe quel ordre)
  gl.disable(gl.BLEND);
  gl.depthMask(true);     // ecrire dans le depth buffer

  for (const obj of opaqueObjects) {
    drawObject(gl, obj);
  }

  // ETAPE 2 : Trier les objets transparents du plus loin au plus proche
  transparentObjects.sort((a, b) => {
    const distA = distanceToCamera(a.position, camera.position);
    const distB = distanceToCamera(b.position, camera.position);
    return distB - distA; // plus loin en premier
  });

  // ETAPE 3 : Dessiner les objets TRANSPARENTS (back-to-front)
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);    // NE PAS ecrire dans le depth buffer
                          // (mais toujours lire : depth test actif)

  for (const obj of transparentObjects) {
    drawObject(gl, obj);
  }

  // ETAPE 4 : Restaurer l'etat
  gl.depthMask(true);
  gl.disable(gl.BLEND);
}
```

:::warning depthMask(false) pour les transparents
Il faut desactiver l'ecriture dans le depth buffer pour les objets transparents (`gl.depthMask(false)`). Sinon, un objet transparent proche empecherait de dessiner un objet transparent plus loin, meme si on devrait voir a travers.
:::

---

## 11. Gestion du resize — ResizeObserver

### 11.1 Le probleme

```
Si le canvas fait 800x600 pixels CSS mais que le buffer interne
est toujours a la taille initiale, l'image sera floue ou deformee.

Il faut synchroniser :
1. La taille CSS du canvas (layout)
2. La taille du buffer de dessin (canvas.width / canvas.height)
3. Le viewport WebGL (gl.viewport)
4. La projection matrix (aspect ratio)
```

### 11.2 Implementation robuste

```typescript
function setupResizeHandling(
  canvas: HTMLCanvasElement,
  gl: WebGL2RenderingContext,
  onResize: (width: number, height: number) => void,
): ResizeObserver {
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      // Utiliser deviceContentBoxSize si disponible (precise au pixel pres)
      let width: number;
      let height: number;

      if (entry.devicePixelContentBoxSize) {
        width = entry.devicePixelContentBoxSize[0].inlineSize;
        height = entry.devicePixelContentBoxSize[0].blockSize;
      } else {
        // Fallback : taille CSS * devicePixelRatio
        const dpr = window.devicePixelRatio || 1;
        width = Math.round(entry.contentRect.width * dpr);
        height = Math.round(entry.contentRect.height * dpr);
      }

      // Mettre a jour la taille du buffer de dessin
      canvas.width = width;
      canvas.height = height;

      // Mettre a jour le viewport WebGL
      gl.viewport(0, 0, width, height);

      // Notifier pour recalculer la projection
      onResize(width, height);
    }
  });

  // Observer les changements de taille du canvas
  try {
    observer.observe(canvas, { box: 'device-pixel-content-box' });
  } catch {
    observer.observe(canvas, { box: 'content-box' });
  }

  return observer;
}

// Utilisation
let projectionMatrix = new Float32Array(16);

setupResizeHandling(canvas, gl, (width, height) => {
  const aspect = width / height;
  perspective(projectionMatrix, Math.PI / 4, aspect, 0.1, 100);
});
```

---

## 12. Organisation du code — architecture objet

### 12.1 Vue d'ensemble des classes

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│ Renderer │────▶│  Scene   │────▶│ Camera   │
│          │     │          │     │          │
│ - gl     │     │ - objects│     │ - view   │
│ - canvas │     │ - lights │     │ - proj   │
│ - render │     │ - skybox │     │ - orbit  │
└──────────┘     └──────────┘     └──────────┘
                      │
              ┌───────┴───────┐
              ▼               ▼
        ┌──────────┐    ┌──────────┐
        │  Mesh    │    │ Material │
        │          │    │          │
        │ - vao    │    │ - program│
        │ - ebo    │    │ - uniforms│
        │ - count  │    │ - textures│
        └──────────┘    └──────────┘
```

### 12.2 Classe Mesh

```typescript
class Mesh {
  readonly vao: WebGLVertexArray;
  readonly indexCount: number;

  private vbo: WebGLBuffer;
  private ebo: WebGLBuffer;

  constructor(
    private gl: WebGL2RenderingContext,
    vertices: Float32Array,
    indices: Uint16Array,
    layout: VertexLayout,
  ) {
    this.vao = gl.createVertexArray()!;
    this.vbo = gl.createBuffer()!;
    this.ebo = gl.createBuffer()!;
    this.indexCount = indices.length;

    gl.bindVertexArray(this.vao);

    // VBO
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    // Configurer les attributs
    const stride = layout.stride * 4; // bytes
    for (const attr of layout.attributes) {
      gl.enableVertexAttribArray(attr.location);
      gl.vertexAttribPointer(
        attr.location, attr.size, gl.FLOAT, false,
        stride, attr.offset * 4,
      );
    }

    // EBO
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    gl.bindVertexArray(null);
  }

  draw(): void {
    this.gl.bindVertexArray(this.vao);
    this.gl.drawElements(this.gl.TRIANGLES, this.indexCount, this.gl.UNSIGNED_SHORT, 0);
    this.gl.bindVertexArray(null);
  }

  destroy(): void {
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteBuffer(this.vbo);
    this.gl.deleteBuffer(this.ebo);
  }
}

interface VertexLayout {
  stride: number; // nombre total de floats par sommet
  attributes: Array<{
    location: number;
    size: number;     // 2, 3 ou 4
    offset: number;   // en floats
  }>;
}
```

### 12.3 Classe Material

```typescript
class Material {
  private uniforms: Map<string, WebGLUniformLocation> = new Map();

  constructor(
    private gl: WebGL2RenderingContext,
    readonly program: WebGLProgram,
    uniformNames: string[],
  ) {
    for (const name of uniformNames) {
      const loc = gl.getUniformLocation(program, name);
      if (loc !== null) {
        this.uniforms.set(name, loc);
      }
    }
  }

  use(): void {
    this.gl.useProgram(this.program);
  }

  setFloat(name: string, value: number): void {
    const loc = this.uniforms.get(name);
    if (loc) this.gl.uniform1f(loc, value);
  }

  setVec3(name: string, v: Float32Array | number[]): void {
    const loc = this.uniforms.get(name);
    if (loc) this.gl.uniform3fv(loc, v);
  }

  setMat4(name: string, m: Float32Array): void {
    const loc = this.uniforms.get(name);
    if (loc) this.gl.uniformMatrix4fv(loc, false, m);
  }

  setMat3(name: string, m: Float32Array): void {
    const loc = this.uniforms.get(name);
    if (loc) this.gl.uniformMatrix3fv(loc, false, m);
  }

  setTexture(name: string, texture: WebGLTexture, unit: number): void {
    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    const loc = this.uniforms.get(name);
    if (loc) this.gl.uniform1i(loc, unit);
  }
}
```

### 12.4 Classe Renderer

```typescript
class Renderer {
  private gl: WebGL2RenderingContext;
  private resizeObserver: ResizeObserver;
  private projectionMatrix = new Float32Array(16);

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: true });
    if (!gl) throw new Error('WebGL 2 non supporte');
    this.gl = gl;

    // Configuration initiale
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.clearColor(0.1, 0.1, 0.15, 1.0);

    // Gestion du resize
    this.resizeObserver = setupResizeHandling(canvas, gl, (w, h) => {
      perspective(this.projectionMatrix, Math.PI / 4, w / h, 0.1, 100);
    });

    // Projection initiale
    const aspect = canvas.width / canvas.height;
    perspective(this.projectionMatrix, Math.PI / 4, aspect, 0.1, 100);
  }

  renderFrame(scene: Scene, camera: OrbitCamera): void {
    const { gl } = this;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Objets opaques
    for (const obj of scene.opaqueObjects) {
      obj.material.use();
      obj.material.setMat4('u_model', obj.modelMatrix);
      obj.material.setMat4('u_view', camera.viewMatrix);
      obj.material.setMat4('u_projection', this.projectionMatrix);
      obj.material.setMat3('u_normalMatrix', computeNormalMatrix(obj.modelMatrix));
      obj.material.setVec3('u_cameraPosition', camera.position);
      obj.mesh.draw();
    }

    // Skybox
    if (scene.skybox) {
      drawSkybox(gl, scene.skybox, camera.viewMatrix, this.projectionMatrix);
    }
  }

  destroy(): void {
    this.resizeObserver.disconnect();
  }
}
```

---

## 13. Limitations de WebGL et transition vers WebGPU

### 13.1 Limitations de WebGL

| Limitation | Consequence | Solution WebGPU |
|-----------|-------------|-----------------|
| State machine globale | Bugs subtils, difficile a debugger | Objets immutables (pipeline, bind groups) |
| Pas de compute shaders | Pas de GPGPU natif (simulation, tri GPU) | `GPUComputePipeline` avec compute shaders |
| API verbeuse | Beaucoup de boilerplate pour chaque objet | API plus declarative, moins d'appels |
| Validation au draw call | Erreurs tardives, parfois silencieuses | Validation a la creation (fail-fast) |
| Single thread | Encodage des commandes sur le thread principal | `CommandEncoder` + `CommandBuffer` (preparable hors thread) |
| Extensions optionnelles | Fonctionnalites inconsistantes entre navigateurs | Core features unifiees |
| Pas de multi-pass efficace | Deferred rendering complexe et lent | Render passes explicites, MRT natif |
| Limite de texture units | Max ~16-32 selon le GPU | Bind groups avec tableaux de textures |

### 13.2 Quand migrer vers WebGPU ?

```
Rester en WebGL si :                      Migrer vers WebGPU si :

- Compatibilite maximale requise          - Performance critique (beaucoup de draw calls)
  (IE, vieux mobiles)                     - Besoin de compute shaders (particules, physique)
- Projet existant et stable               - Scene complexe (deferred rendering, MRT)
- Prototype rapide / petit projet         - Controle fin du GPU (memory, sync)
- Bibliotheque existante                  - Projet nouveau et avant-gardiste
  (Three.js gere l'abstraction)           - Cible navigateurs modernes uniquement
```

:::tip Strategie recommandee
Pour un nouveau projet en 2025+, commencez avec **Three.js** qui abstrait WebGL et WebGPU. Si vous avez besoin de controle bas niveau ou de compute shaders, passez directement a **WebGPU natif**. Le WebGL brut n'est pertinent que pour comprendre les fondamentaux (ce cours) ou maintenir du code existant.
:::

---

## 14. Exercice pratique

### Enonce

Creez une **scene WebGL complete** avec les elements suivants :

1. **3 cubes** a des positions differentes, chacun avec sa propre vitesse de rotation
2. **Eclairage multi-sources** : une lumiere blanche fixe et une lumiere coloree qui orbite
3. **Orbit camera** : clic gauche pour tourner, molette pour zoomer
4. **Delta time** : les animations doivent etre independantes du framerate
5. **Resize** : la scene doit s'adapter quand on redimensionne la fenetre

**Bonus :**
- Ajouter un cube semi-transparent avec blending
- Afficher les FPS dans la console

<details>
<summary>Voir la solution</summary>

```typescript
// === main.ts — Scene WebGL complete ===

// --- Initialisation ---
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const gl = canvas.getContext('webgl2', { antialias: true })!;

gl.enable(gl.DEPTH_TEST);
gl.enable(gl.CULL_FACE);
gl.clearColor(0.05, 0.05, 0.1, 1.0);

// --- Shaders (Phong multi-lumieres) ---
const vertSrc = `#version 300 es
in vec3 a_position;
in vec3 a_normal;

uniform mat4 u_model;
uniform mat4 u_view;
uniform mat4 u_projection;
uniform mat3 u_normalMatrix;

out vec3 v_worldPos;
out vec3 v_normal;

void main() {
  vec4 worldPos = u_model * vec4(a_position, 1.0);
  v_worldPos = worldPos.xyz;
  v_normal = u_normalMatrix * a_normal;
  gl_Position = u_projection * u_view * worldPos;
}`;

const fragSrc = `#version 300 es
precision highp float;

struct Light {
  vec3 position;
  vec3 color;
  float intensity;
};

const int MAX_LIGHTS = 2;
uniform Light u_lights[MAX_LIGHTS];
uniform int u_numLights;
uniform vec3 u_cameraPos;
uniform vec3 u_objectColor;
uniform float u_alpha;

in vec3 v_worldPos;
in vec3 v_normal;

out vec4 fragColor;

void main() {
  vec3 N = normalize(v_normal);
  vec3 V = normalize(u_cameraPos - v_worldPos);

  vec3 result = vec3(0.1) * u_objectColor; // ambient

  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= u_numLights) break;
    vec3 L = normalize(u_lights[i].position - v_worldPos);
    float diff = max(dot(N, L), 0.0);
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 32.0);
    float dist = length(u_lights[i].position - v_worldPos);
    float atten = 1.0 / (1.0 + 0.05 * dist * dist);
    result += (diff * u_objectColor + spec * vec3(1.0))
              * u_lights[i].color * u_lights[i].intensity * atten;
  }

  fragColor = vec4(result, u_alpha);
}`;

// Compilation des shaders (fonction utilitaire)
function createShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(s)!);
  }
  return s;
}

function createProgram(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, createShader(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, createShader(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(p)!);
  }
  return p;
}

const program = createProgram(gl, vertSrc, fragSrc);

// --- Cube geometry ---
const cubeVerts = new Float32Array([
  // Front  (z = +0.5, normal 0,0,1)
  -0.5, -0.5,  0.5,   0, 0, 1,    0.5, -0.5,  0.5,   0, 0, 1,
   0.5,  0.5,  0.5,   0, 0, 1,   -0.5,  0.5,  0.5,   0, 0, 1,
  // Back   (z = -0.5, normal 0,0,-1)
   0.5, -0.5, -0.5,   0, 0,-1,   -0.5, -0.5, -0.5,   0, 0,-1,
  -0.5,  0.5, -0.5,   0, 0,-1,    0.5,  0.5, -0.5,   0, 0,-1,
  // Top    (y = +0.5, normal 0,1,0)
  -0.5,  0.5,  0.5,   0, 1, 0,    0.5,  0.5,  0.5,   0, 1, 0,
   0.5,  0.5, -0.5,   0, 1, 0,   -0.5,  0.5, -0.5,   0, 1, 0,
  // Bottom (y = -0.5, normal 0,-1,0)
  -0.5, -0.5, -0.5,   0,-1, 0,    0.5, -0.5, -0.5,   0,-1, 0,
   0.5, -0.5,  0.5,   0,-1, 0,   -0.5, -0.5,  0.5,   0,-1, 0,
  // Right  (x = +0.5, normal 1,0,0)
   0.5, -0.5,  0.5,   1, 0, 0,    0.5, -0.5, -0.5,   1, 0, 0,
   0.5,  0.5, -0.5,   1, 0, 0,    0.5,  0.5,  0.5,   1, 0, 0,
  // Left   (x = -0.5, normal -1,0,0)
  -0.5, -0.5, -0.5,  -1, 0, 0,   -0.5, -0.5,  0.5,  -1, 0, 0,
  -0.5,  0.5,  0.5,  -1, 0, 0,   -0.5,  0.5, -0.5,  -1, 0, 0,
]);

const cubeIdx = new Uint16Array([
   0, 1, 2,  0, 2, 3,    4, 5, 6,  4, 6, 7,
   8, 9,10,  8,10,11,   12,13,14, 12,14,15,
  16,17,18, 16,18,19,   20,21,22, 20,22,23,
]);

// VAO
const vao = gl.createVertexArray()!;
gl.bindVertexArray(vao);

const vbo = gl.createBuffer()!;
gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
gl.bufferData(gl.ARRAY_BUFFER, cubeVerts, gl.STATIC_DRAW);

const STRIDE = 6 * 4;
const posLoc = gl.getAttribLocation(program, 'a_position');
gl.enableVertexAttribArray(posLoc);
gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, STRIDE, 0);

const normLoc = gl.getAttribLocation(program, 'a_normal');
gl.enableVertexAttribArray(normLoc);
gl.vertexAttribPointer(normLoc, 3, gl.FLOAT, false, STRIDE, 12);

const ebo = gl.createBuffer()!;
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, cubeIdx, gl.STATIC_DRAW);

gl.bindVertexArray(null);

// --- Uniforms ---
gl.useProgram(program);
const u = {
  model: gl.getUniformLocation(program, 'u_model')!,
  view: gl.getUniformLocation(program, 'u_view')!,
  projection: gl.getUniformLocation(program, 'u_projection')!,
  normalMatrix: gl.getUniformLocation(program, 'u_normalMatrix')!,
  numLights: gl.getUniformLocation(program, 'u_numLights')!,
  cameraPos: gl.getUniformLocation(program, 'u_cameraPos')!,
  objectColor: gl.getUniformLocation(program, 'u_objectColor')!,
  alpha: gl.getUniformLocation(program, 'u_alpha')!,
  light0Pos: gl.getUniformLocation(program, 'u_lights[0].position')!,
  light0Color: gl.getUniformLocation(program, 'u_lights[0].color')!,
  light0Intensity: gl.getUniformLocation(program, 'u_lights[0].intensity')!,
  light1Pos: gl.getUniformLocation(program, 'u_lights[1].position')!,
  light1Color: gl.getUniformLocation(program, 'u_lights[1].color')!,
  light1Intensity: gl.getUniformLocation(program, 'u_lights[1].intensity')!,
};

// --- Camera (orbit simplifiee) ---
let phi = 0.5;
let theta = 0.4;
let radius = 8;
let viewMatrix = new Float32Array(16);
let cameraPos = new Float32Array(3);

function updateCamera(): void {
  cameraPos[0] = radius * Math.cos(theta) * Math.sin(phi);
  cameraPos[1] = radius * Math.sin(theta);
  cameraPos[2] = radius * Math.cos(theta) * Math.cos(phi);
  lookAt(viewMatrix, cameraPos, [0, 0, 0], [0, 1, 0]);
}

// Souris
let dragging = false;
let prevX = 0;
let prevY = 0;
canvas.addEventListener('mousedown', (e) => { dragging = true; prevX = e.clientX; prevY = e.clientY; });
window.addEventListener('mouseup', () => { dragging = false; });
canvas.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  phi -= (e.clientX - prevX) * 0.005;
  theta += (e.clientY - prevY) * 0.005;
  theta = Math.max(-1.5, Math.min(1.5, theta));
  prevX = e.clientX;
  prevY = e.clientY;
  updateCamera();
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  radius = Math.max(2, Math.min(30, radius + e.deltaY * 0.01));
  updateCamera();
}, { passive: false });

updateCamera();

// --- Projection ---
let projMatrix = new Float32Array(16);

function updateProjection(): void {
  const aspect = canvas.width / canvas.height;
  perspective(projMatrix, Math.PI / 4, aspect, 0.1, 100);
}

const observer = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(entry.contentRect.width * dpr);
    const h = Math.round(entry.contentRect.height * dpr);
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
    updateProjection();
  }
});
observer.observe(canvas);
updateProjection();

// --- Objets ---
const cubes = [
  { pos: [-2.5, 0, 0] as const, speed: 1.0, color: [0.9, 0.2, 0.2], angle: 0, alpha: 1.0 },
  { pos: [ 0.0, 0, 0] as const, speed: 0.5, color: [0.2, 0.9, 0.2], angle: 0, alpha: 1.0 },
  { pos: [ 2.5, 0, 0] as const, speed: 1.5, color: [0.2, 0.2, 0.9], angle: 0, alpha: 1.0 },
  { pos: [ 0.0, 2, 0] as const, speed: 0.8, color: [0.8, 0.8, 0.2], angle: 0, alpha: 0.4 },
];

// --- Render loop ---
let lastTime = 0;
let frameCount = 0;
let fpsTime = 0;
const modelMatrix = new Float32Array(16);

function frame(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  // FPS counter
  frameCount++;
  fpsTime += dt;
  if (fpsTime >= 1.0) {
    console.log(`FPS: ${frameCount}`);
    frameCount = 0;
    fpsTime = 0;
  }

  // Lumiere orbitante
  const lightAngle = now * 0.001;
  const orbitLightPos = [
    Math.cos(lightAngle) * 4,
    2,
    Math.sin(lightAngle) * 4,
  ];

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(program);

  gl.uniformMatrix4fv(u.view, false, viewMatrix);
  gl.uniformMatrix4fv(u.projection, false, projMatrix);
  gl.uniform3fv(u.cameraPos, cameraPos);
  gl.uniform1i(u.numLights, 2);

  // Lumiere 0 : blanche fixe
  gl.uniform3f(u.light0Pos, 3, 5, 3);
  gl.uniform3f(u.light0Color, 1, 1, 1);
  gl.uniform1f(u.light0Intensity, 1.0);

  // Lumiere 1 : coloree orbitante
  gl.uniform3f(u.light1Pos, orbitLightPos[0], orbitLightPos[1], orbitLightPos[2]);
  gl.uniform3f(u.light1Color, 0.3, 0.6, 1.0);
  gl.uniform1f(u.light1Intensity, 1.5);

  // Dessiner les cubes opaques puis transparents
  gl.disable(gl.BLEND);
  gl.depthMask(true);

  for (const cube of cubes) {
    if (cube.alpha < 1.0) continue; // transparents apres

    cube.angle += cube.speed * dt;
    const c = Math.cos(cube.angle), s = Math.sin(cube.angle);
    modelMatrix.set([
       c, 0, s, 0,   0, 1, 0, 0,   -s, 0, c, 0,
       cube.pos[0], cube.pos[1], cube.pos[2], 1,
    ]);

    gl.uniformMatrix4fv(u.model, false, modelMatrix);
    gl.uniformMatrix3fv(u.normalMatrix, false, computeNormalMatrix(modelMatrix));
    gl.uniform3f(u.objectColor, cube.color[0], cube.color[1], cube.color[2]);
    gl.uniform1f(u.alpha, 1.0);

    gl.bindVertexArray(vao);
    gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
  }

  // Cubes transparents
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);

  for (const cube of cubes) {
    if (cube.alpha >= 1.0) continue;

    cube.angle += cube.speed * dt;
    const c = Math.cos(cube.angle), s = Math.sin(cube.angle);
    modelMatrix.set([
       c, 0, s, 0,   0, 1, 0, 0,   -s, 0, c, 0,
       cube.pos[0], cube.pos[1], cube.pos[2], 1,
    ]);

    gl.uniformMatrix4fv(u.model, false, modelMatrix);
    gl.uniformMatrix3fv(u.normalMatrix, false, computeNormalMatrix(modelMatrix));
    gl.uniform3f(u.objectColor, cube.color[0], cube.color[1], cube.color[2]);
    gl.uniform1f(u.alpha, cube.alpha);

    gl.bindVertexArray(vao);
    gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
  }

  gl.depthMask(true);
  gl.disable(gl.BLEND);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
```

**Points cles :**
- Le delta time (`dt`) assure que les rotations sont independantes du framerate
- Les cubes opaques sont dessines en premier, les transparents ensuite (avec `depthMask(false)`)
- La lumiere orbitante cree un eclairage dynamique interessant
- Le `ResizeObserver` maintient le rapport d'aspect correct en permanence
- Le compteur FPS aide a detecter les problemes de performance

</details>

---

## Resume

| Concept | Role | API/Syntaxe cle |
|---------|------|-----------------|
| `requestAnimationFrame` | Synchronise le rendu avec l'ecran | `requestAnimationFrame(callback)` |
| Delta time | Animation independante du framerate | `const dt = (now - last) / 1000` |
| Orbit camera | Rotation autour d'un point (coordonnees spheriques) | `phi`, `theta`, `radius` → lookAt |
| lookAt | Construit la view matrix | `eye`, `center`, `up` → mat4 |
| Normal matrix | Transforme les normales correctement | `transpose(inverse(mat3(model)))` |
| Multi-lumieres | Boucle sur les lumieres dans le fragment shader | `struct Light`, `for (i < MAX_LIGHTS)` |
| Cubemap / Skybox | Fond 360 degres autour de la scene | `samplerCube`, `gl.TEXTURE_CUBE_MAP` |
| Instanced rendering | 1 draw call pour N copies d'un mesh | `gl.vertexAttribDivisor(loc, 1)`, `gl.drawElementsInstanced` |
| MSAA | Antialiasing multi-echantillon | `antialias: true` ou `renderbufferStorageMultisample` |
| Blending / transparence | Melange de couleurs (alpha) | `gl.blendFunc(SRC_ALPHA, ONE_MINUS_SRC_ALPHA)` |
| Render order | Opaque d'abord, transparent back-to-front | Trier par distance, `depthMask(false)` |
| ResizeObserver | Adapter le canvas au redimensionnement | `observer.observe(canvas)` → viewport + projection |
| Classe Mesh | Encapsule VAO + buffers + draw | `vao`, `draw()`, `destroy()` |
| Classe Material | Encapsule shader + uniforms | `use()`, `setMat4()`, `setTexture()` |
| Limitations WebGL | State machine, pas de compute, verbeux | → WebGPU pour les projets modernes |

---

## Navigation

| Precedent | Suivant |
|:---------:|:-------:|
| [07 — Shaders, buffers et textures](./07-shaders-buffers-textures.md) | [09 — WebGPU architecture et WGSL](./09-webgpu-architecture-wgsl.md) |
