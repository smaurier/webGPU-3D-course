# 03 — Cameras et projections

| Difficulte | Duree estimee | Lab | Quiz |
|:----------:|:-------------:|:---:|:----:|
| 3/5        | 90 min        | [Lab 03](../labs/lab-03-camera-projection/) | [Quiz 03](../quizzes/quiz-03-cameras-projections.html) |

## Objectifs pedagogiques

A la fin de ce module, vous serez capable de :

- Decrire la chaine complete des espaces de coordonnees (objet → monde → camera → clip → NDC → ecran)
- Construire une matrice lookAt a partir de eye, target et up
- Construire les matrices de projection perspective et orthographique
- Expliquer le role du frustum et le concept de frustum culling
- Identifier les causes du z-fighting et savoir les prevenir
- Connaitre les differences de NDC entre WebGL et WebGPU
- Projeter un point 3D sur l'ecran en TypeScript

---

<details>
<summary>Rappel du module precedent</summary>

- **Translation** : matrice 4x4 avec (tx, ty, tz) dans la colonne 3
- **Rotation** : matrice 4x4 basee sur sin/cos, ou quaternion (w, x, y, z)
- **Scale** : matrice 4x4 avec (sx, sy, sz) sur la diagonale
- **Ordre SRT** : Scale → Rotate → Translate (lecture droite a gauche : `T * R * S`)
- **Quaternion** : rotation sans gimbal lock, interpolation fluide (slerp)
- **Model matrix** : transformation objet → monde (`T * R * S`)
- **View matrix** : inverse de la transformation camera
- **MVP** : `Projection * View * Model` — pipeline complet de transformation

</details>

---

## Analogie : la camera de Vue devtools

:::tip Analogie pour developpeurs Vue.js
Quand vous ouvrez les Vue devtools, vous inspectez votre arbre de composants depuis un "point de vue" exterieur. Vous pouvez zoomer sur un composant, filtrer l'arbre, et l'interface decoupe la vue pour ne montrer que ce qui vous interesse.

En 3D, la camera fait exactement cela :

| Vue devtools | Camera 3D |
|--------------|-----------|
| Position du panneau d'inspection | Position de la camera (eye) |
| Composant selectionne (focus) | Point cible (target) |
| Zoom du navigateur | Field of View (fov) |
| Fenetre du navigateur (taille) | Viewport (largeur x hauteur) |
| Filtrage des composants (visible/invisible) | Frustum culling (objets hors champ ignores) |

La camera ne "deplace" pas les objets — elle definit un **cadrage** a travers lequel on observe la scene.
:::

---

## La chaine des espaces de coordonnees

Chaque sommet traverse une serie de transformations avant d'arriver sur votre ecran :

```
CHAINE DES ESPACES
════════════════════════════════════════════════════════════════

Espace objet  ──M──►  Espace monde  ──V──►  Espace camera  ──P──►  Clip space
 (local)                (world)               (view/eye)             (homogene)
                                                                        │
                                                                   /w (perspective
                                                                        divide)
                                                                        │
                                                                        ▼
                                                                  NDC (Normalized
                                                                  Device Coords)
                                                                        │
                                                                   viewport
                                                                   transform
                                                                        │
                                                                        ▼
                                                                  Ecran (pixels)

M = Model matrix      → place l'objet dans le monde
V = View matrix       → ramene le monde devant la camera
P = Projection matrix → projette la 3D en 2D (+ profondeur)
/w = Perspective divide → normalise les coordonnees
Viewport transform    → convertit NDC en pixels ecran
```

```typescript
// ── coordinate-spaces.ts ──────────────────────────────

/**
 * Demonstration de la chaine complete pour un seul sommet.
 *
 * On suit le point (1, 2, 3) local a travers toutes les etapes.
 */
function traceVertex(
  localPos: Vec3,
  model: Mat4,
  view: Mat4,
  projection: Mat4,
  viewportWidth: number,
  viewportHeight: number,
): void {
  console.log('=== Chaine des espaces ===');
  console.log('1. Espace objet :', localPos.toString());

  // Espace objet → Espace monde
  const worldPos = model.transformPoint(localPos);
  console.log('2. Espace monde :', worldPos.toString());

  // Espace monde → Espace camera
  const cameraPos = view.transformPoint(worldPos);
  console.log('3. Espace camera :', cameraPos.toString());

  // Espace camera → Clip space (coordonnees homogenes, avant /w)
  const [cx, cy, cz, cw] = projection.multiplyVec4(
    cameraPos.x, cameraPos.y, cameraPos.z, 1,
  );
  console.log(`4. Clip space : (${cx.toFixed(3)}, ${cy.toFixed(3)}, ${cz.toFixed(3)}, ${cw.toFixed(3)})`);

  // Clip space → NDC (perspective divide)
  const ndcX = cx / cw;
  const ndcY = cy / cw;
  const ndcZ = cz / cw;
  console.log(`5. NDC : (${ndcX.toFixed(3)}, ${ndcY.toFixed(3)}, ${ndcZ.toFixed(3)})`);

  // NDC → Ecran (viewport transform)
  // NDC x: [-1, 1] → pixel x: [0, width]
  // NDC y: [-1, 1] → pixel y: [0, height] (y inverse en ecran)
  const screenX = (ndcX + 1) * 0.5 * viewportWidth;
  const screenY = (1 - ndcY) * 0.5 * viewportHeight; // y inverse !
  console.log(`6. Ecran : (${screenX.toFixed(1)}, ${screenY.toFixed(1)}) pixels`);
}
```

:::warning Y inverse
En NDC, y=1 est en haut. En pixels ecran, y=0 est en haut. Il faut **inverser l'axe Y** lors du viewport transform. C'est une source frequente de bugs : textures a l'envers, mouse picking inverse, etc.
:::

---

## lookAt : construire la matrice de vue

La fonction `lookAt` est la facon la plus intuitive de positionner une camera. On donne 3 parametres :

```
LOOKAT
════════════════════════════════════════════════════════════════

eye    = position de la camera dans le monde
target = le point que la camera regarde
up     = direction "haut" (generalement (0, 1, 0))

A partir de ces 3 parametres, on construit un REPERE ORTHONORMAL :

  forward = normalize(target - eye)   → direction vers la cible
  right   = normalize(forward × up)   → axe horizontal
  newUp   = right × forward           → axe vertical corrige

       newUp ↑
             │   ╱ forward (vers la cible)
             │  ╱
             │ ╱
    eye ─────┼───────► right
             │

La VIEW MATRIX combine :
  1. Une rotation qui aligne les axes du monde sur les axes de la camera
  2. Une translation qui ramene la camera a l'origine
```

```typescript
// ── look-at.ts ────────────────────────────────────────

/**
 * Construire une matrice de vue lookAt.
 *
 * La view matrix est l'inverse de la transformation camera.
 * Au lieu de calculer la matrice camera puis l'inverser,
 * on construit directement l'inverse.
 *
 * C'est la methode utilisee par OpenGL (gluLookAt),
 * Three.js (camera.lookAt), et tous les moteurs 3D.
 */
function lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  // 1. Calculer les 3 axes du repere camera
  const forward = target.sub(eye).normalize();   // z- de la camera
  const right = forward.cross(up).normalize();    // x de la camera
  const newUp = right.cross(forward);             // y de la camera

  // 2. Construire la matrice
  // La partie rotation est la TRANSPOSEE (= inverse pour une matrice orthogonale)
  // La partie translation applique le deplacement DANS le repere camera
  return Mat4.fromRows(
     right.x,    right.y,    right.z,   -right.dot(eye),
     newUp.x,    newUp.y,    newUp.z,   -newUp.dot(eye),
    -forward.x, -forward.y, -forward.z,  forward.dot(eye),
     0,           0,          0,          1,
  );
}

// Exemple : camera a (0, 5, 10) regardant l'origine
const view = lookAt(
  new Vec3(0, 5, 10),  // eye : 5 unites en haut, 10 devant
  new Vec3(0, 0, 0),   // target : l'origine
  Vec3.UP,              // up : (0, 1, 0)
);

console.log('View matrix:\n' + view.toString());

// Verifier : un point a l'origine du monde devrait etre
// devant la camera (z negatif en espace camera)
const originInCameraSpace = view.transformPoint(new Vec3(0, 0, 0));
console.log('Origine en espace camera:', originInCameraSpace.toString());
// Attendu : z negatif (l'objet est "devant" la camera)
```

### Pourquoi `-forward` dans la matrice ?

```
CONVENTION Z-NEGATIF
════════════════════════════════════════════════════════════════

En OpenGL/WebGL/WebGPU, la camera regarde dans la direction -Z.

C'est pourquoi on INVERSE le forward dans la matrice de vue :
  - La camera regarde vers "target - eye" (forward positif)
  - Mais en espace camera, "devant" = -Z
  - Donc on stocke -forward comme axe Z de la matrice

Si vous oubliez ce signe, la scene apparaitra DERRIERE la camera !
```

---

## Projection perspective

La projection perspective simule la vision humaine : les objets lointains paraissent plus petits.

```
FRUSTUM PERSPECTIVE
════════════════════════════════════════════════════════════════

Vue de cote :
                    far plane
                 ╱─────────────╲
               ╱                 ╲
             ╱    objets visibles  ╲
           ╱                         ╲
         ╱ ◄── fov (field of view)     ╲
  eye ──╱───────────────────────────────╲
         ╲                             ╱
           ╲         frustum         ╱
             ╲                     ╱
               ╲                 ╱
                 ╲─────────────╱
                    near plane

Vue de dessus :
              far
         ┌───────────┐
         │           │
         │   visible │
         │   volume  │
    eye ─┤           │
         │           │
         │           │
         └───────────┘
              near

Parametres :
  fov    = angle vertical d'ouverture (en radians, typiquement 45-90°)
  aspect = largeur / hauteur du viewport
  near   = distance du plan proche (> 0, typiquement 0.1)
  far    = distance du plan lointain (typiquement 100-10000)
```

```typescript
// ── perspective.ts ────────────────────────────────────

/**
 * Matrice de projection perspective.
 *
 * Transforme les coordonnees camera en clip space.
 * Les objets proches apparaissent plus grands,
 * les objets lointains plus petits.
 *
 * Convention WebGPU : z NDC dans [0, 1] (pas [-1, 1] comme WebGL)
 */
function perspectiveWebGPU(
  fovYRad: number,
  aspect: number,
  near: number,
  far: number,
): Mat4 {
  const f = 1.0 / Math.tan(fovYRad / 2);

  // WebGPU : z mappe de near → 0, far → 1
  return Mat4.fromRows(
    f / aspect,  0,   0,                          0,
    0,           f,   0,                          0,
    0,           0,   far / (near - far),         (near * far) / (near - far),
    0,           0,  -1,                          0,
  );
}

// Utilisation typique
const fov = toRadians(60);   // 60 degres
const aspect = 16 / 9;        // ecran large
const near = 0.1;
const far = 1000;

const projGPU = perspectiveWebGPU(fov, aspect, near, far);
const projGL = perspectiveWebGL(fov, aspect, near, far);

console.log('Projection WebGPU:\n' + projGPU.toString());
console.log('Projection WebGL:\n' + projGL.toString());
```

### Comprendre la matrice perspective

```
DECORTIQUONS LA MATRICE PERSPECTIVE
════════════════════════════════════════════════════════════════

┌  f/aspect   0       0           0      ┐
│     0       f       0           0      │
│     0       0       A           B      │
│     0       0      -1           0      │

f = 1 / tan(fov/2)  →  controle le "zoom"
  fov petit = f grand = zoom avant (telephoto)
  fov grand = f petit = grand angle (fisheye)

f/aspect  →  corrige le rapport largeur/hauteur
  sans cette correction, la scene serait etiree

A et B  →  mappent la profondeur z dans la plage NDC
  WebGPU: A = far/(near-far),      B = near*far/(near-far)  → z ∈ [0, 1]
  WebGL:  A = -(far+near)/(far-near), B = -2*far*near/(far-near) → z ∈ [-1, 1]

-1 en position (3,2)  →  copie -z dans w
  Apres la division par w, les objets lointains (z grand)
  sont divises par un w plus grand → ils retrecissent
  C'est l'ESSENCE de la perspective !
```

```typescript
// ── perspective-demo.ts ────────────────────────────────

/**
 * Demontrer l'effet de la projection perspective.
 *
 * Deux cubes identiques, l'un proche et l'autre loin,
 * apparaissent a des tailles differentes apres projection.
 */
function perspectiveDemo(): void {
  const proj = perspectiveWebGPU(toRadians(60), 16 / 9, 0.1, 1000);

  // Cube proche : z = -5 (5 unites devant la camera)
  const nearPoint = new Vec3(1, 1, -5);
  // Cube lointain : z = -50 (50 unites devant la camera)
  const farPoint = new Vec3(1, 1, -50);

  // Projection
  const [nx, ny, nz, nw] = proj.multiplyVec4(nearPoint.x, nearPoint.y, nearPoint.z, 1);
  const [fx, fy, fz, fw] = proj.multiplyVec4(farPoint.x, farPoint.y, farPoint.z, 1);

  // NDC (apres /w)
  console.log(`Proche: NDC = (${(nx/nw).toFixed(3)}, ${(ny/nw).toFixed(3)}, ${(nz/nw).toFixed(3)})`);
  console.log(`Loin:   NDC = (${(fx/fw).toFixed(3)}, ${(fy/fw).toFixed(3)}, ${(fz/fw).toFixed(3)})`);

  // L'objet lointain a des coordonnees x,y plus petites en NDC
  // → il occupe moins de pixels a l'ecran
  console.log(`Ratio de taille apparente : ${((fx/fw) / (nx/nw)).toFixed(3)}`);
  // Attendu : ~0.1 (l'objet 10x plus loin apparait 10x plus petit)
}
```

---

## Projection orthographique

La projection orthographique ne simule pas la perspective : les objets gardent la meme taille quelle que soit leur distance.

```
PROJECTION ORTHOGRAPHIQUE
════════════════════════════════════════════════════════════════

Vue de cote :
  ┌─────────────────────────┐  far
  │                         │
  │    Tout a la meme       │
  │    taille, quelle que   │
  │    soit la distance     │
  │                         │
  └─────────────────────────┘  near
  eye →

Pas de convergence vers un point de fuite.
Les lignes paralleles RESTENT paralleles.

Cas d'usage :
  - Interface 2D (HUD, menus)
  - CAD / dessin technique (plans, coupes)
  - Jeux isometriques (RTS, city builders)
  - Shadow mapping (lumiere directionnelle)
  - Editeurs 3D (vue de dessus, de face, de cote)
```

```typescript
// ── orthographic.ts ───────────────────────────────────

/**
 * Matrice de projection orthographique.
 *
 * Mappe un volume rectangulaire (boite) directement en NDC.
 * Pas de perspective divide (w reste a 1).
 *
 * Convention WebGPU : z NDC dans [0, 1]
 */
function orthographicWebGPU(
  left: number,
  right: number,
  bottom: number,
  top: number,
  near: number,
  far: number,
): Mat4 {
  const rl = right - left;
  const tb = top - bottom;
  const fn = far - near;

  return Mat4.fromRows(
    2 / rl,  0,       0,       -(right + left) / rl,
    0,       2 / tb,  0,       -(top + bottom) / tb,
    0,       0,      -1 / fn,  -near / fn,
    0,       0,       0,        1,
  );
}

/**
 * Orthographique symetrique (plus simple a utiliser).
 *
 * Definie par une taille (hauteur visible) et un aspect ratio.
 */
function orthographicSymmetric(
  size: number,    // hauteur visible en unites monde
  aspect: number,  // largeur / hauteur du viewport
  near: number,
  far: number,
): Mat4 {
  const halfH = size / 2;
  const halfW = halfH * aspect;

  return orthographicWebGPU(-halfW, halfW, -halfH, halfH, near, far);
}

// Exemple : vue orthographique de 20 unites de haut
const ortho = orthographicSymmetric(20, 16 / 9, 0.1, 100);
console.log('Orthographic matrix:\n' + ortho.toString());

// Test : un point a z=-10 et un point a z=-50 ont la meme taille
const [nx, ny, , nw] = ortho.multiplyVec4(1, 1, -10, 1);
const [fx, fy, , fw] = ortho.multiplyVec4(1, 1, -50, 1);

console.log(`Proche: (${(nx/nw).toFixed(3)}, ${(ny/nw).toFixed(3)})`);
console.log(`Loin:   (${(fx/fw).toFixed(3)}, ${(fy/fw).toFixed(3)})`);
// Les x,y NDC sont IDENTIQUES → meme taille a l'ecran
```

### Perspective vs Orthographique

```
PERSPECTIVE vs ORTHOGRAPHIQUE
════════════════════════════════════════════════════════════════

Perspective :                    Orthographique :
     ╱╲                          ┌────────┐
    ╱  ╲                         │        │
   ╱    ╲                        │        │
  ╱ loin ╲  petit                │ loin   │  meme taille
 ╱  petit ╲                     │ = proche│
╱ proche   ╲  grand              │        │
eye ────────╲                    │        │
              ╲                  └────────┘

Perspective :                    Orthographique :
  - Simule la vision humaine       - Pas de deformation par distance
  - Point de fuite                  - Lignes paralleles restent paralleles
  - Objets lointains retrecissent   - Taille constante
  - Jeux 3D, simulations            - UI, CAD, vues techniques
```

---

## Le frustum : volume visible

Le frustum est le volume dans lequel les objets sont visibles par la camera.

```
FRUSTUM (perspective)
════════════════════════════════════════════════════════════════

        far plane
    ┌───────────────────┐
    │                   │
    │     VISIBLE       │
    │                   │
    │    ┌─────────┐    │
    │    │ near    │    │
    │    │ plane   │    │
    │    └─────────┘    │
    │         │         │
    └─────────┼─────────┘
              │
             eye

Le frustum a 6 faces (plans) :
  - Near plane   (devant, le plus proche)
  - Far plane    (derriere, le plus lointain)
  - Left plane   (gauche)
  - Right plane  (droite)
  - Top plane    (haut)
  - Bottom plane (bas)

Tout ce qui est EN DEHORS du frustum est INVISIBLE.
→ Pas besoin de le calculer ni de le dessiner !
```

```typescript
// ── frustum.ts ────────────────────────────────────────

/**
 * Representation d'un plan 3D : ax + by + cz + d = 0
 *
 * La normale (a, b, c) pointe VERS L'INTERIEUR du frustum.
 */
interface Plane {
  normal: Vec3;  // (a, b, c)
  d: number;     // distance a l'origine
}

/**
 * Extraire les 6 plans du frustum a partir de la matrice VP (View * Projection).
 *
 * Methode de Gribb & Hartmann : on extrait les plans directement
 * de la matrice combinee sans calcul geometrique explicite.
 */
function extractFrustumPlanes(vp: Mat4): Plane[] {
  const m = vp.data;

  // Chaque plan est extrait en combinant les lignes de la matrice VP
  const planes: Plane[] = [
    // Left:   row3 + row0
    makePlane(m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]),
    // Right:  row3 - row0
    makePlane(m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]),
    // Bottom: row3 + row1
    makePlane(m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]),
    // Top:    row3 - row1
    makePlane(m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]),
    // Near:   row3 + row2
    makePlane(m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]),
    // Far:    row3 - row2
    makePlane(m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]),
  ];

  return planes;
}

/** Creer un plan normalise */
function makePlane(a: number, b: number, c: number, d: number): Plane {
  const len = Math.sqrt(a * a + b * b + c * c);
  return {
    normal: new Vec3(a / len, b / len, c / len),
    d: d / len,
  };
}

/**
 * Distance signee d'un point a un plan.
 *
 * > 0 : le point est du cote de la normale (DANS le frustum)
 * < 0 : le point est de l'autre cote (HORS du frustum)
 * = 0 : le point est sur le plan
 */
function distanceToPlane(point: Vec3, plane: Plane): number {
  return plane.normal.dot(point) + plane.d;
}

/**
 * Frustum culling : tester si une sphere est visible.
 *
 * On utilise une sphere englobante (bounding sphere) car le test
 * est tres rapide : 6 dot products.
 *
 * En pratique, chaque objet de la scene a une bounding sphere.
 * Avant de dessiner un objet, on verifie qu'il est dans le frustum.
 * Si non, on l'ignore completement → gain de performance enorme.
 */
function isSphereVisible(
  center: Vec3,
  radius: number,
  planes: Plane[],
): boolean {
  for (const plane of planes) {
    const distance = distanceToPlane(center, plane);
    if (distance < -radius) {
      // La sphere est entierement derriere ce plan
      return false;
    }
  }
  return true;
}

// Exemple de frustum culling
const viewMatrix = lookAt(new Vec3(0, 5, 10), Vec3.ZERO, Vec3.UP);
const projMatrix = perspectiveWebGPU(toRadians(60), 16 / 9, 0.1, 100);
const vp = projMatrix.multiply(viewMatrix);
const planes = extractFrustumPlanes(vp);

// Objet devant la camera : visible
console.log('Visible:', isSphereVisible(new Vec3(0, 0, 0), 1, planes));   // true

// Objet tres loin derriere la camera : invisible
console.log('Visible:', isSphereVisible(new Vec3(0, 0, 200), 1, planes)); // false

// Objet tres a gauche : invisible
console.log('Visible:', isSphereVisible(new Vec3(-100, 0, 0), 1, planes)); // false
```

:::tip Performance
Dans un jeu avec 10 000 objets, le frustum culling peut eliminer 80-90% des objets avant meme qu'ils n'atteignent le GPU. C'est l'une des optimisations les plus rentables en rendu 3D. Three.js le fait automatiquement pour chaque `Mesh` via `object.frustumCulled = true` (par defaut).
:::

---

## Depth buffer et z-fighting

### Le probleme de la precision en profondeur

```
DISTRIBUTION DE LA PRECISION DU DEPTH BUFFER
════════════════════════════════════════════════════════════════

En projection perspective, la precision du depth buffer n'est PAS lineaire.
Elle est concentree PRES du near plane.

Near                                              Far
 │████████████████████████░░░░░░░░░░░░░░▒▒▒▒▒▒▒│
 │   Haute precision      Moyenne     Faible    │
 │                                              │
 │ 50% de la precision est dans les premiers    │
 │ 10% de la distance near-far !                │

Avec near=0.1, far=10000 :
  - De 0.1 a 10 : 90% de la precision
  - De 10 a 10000 : seulement 10% de la precision
  → Deux objets lointains proches en Z auront le MEME depth value
  → Z-FIGHTING : scintillement entre les deux surfaces
```

```typescript
// ── z-fighting.ts ─────────────────────────────────────

/**
 * Calculer la precision du depth buffer a une distance donnee.
 *
 * Le depth buffer est typiquement 24 bits (16 millions de valeurs).
 * Mais la distribution NON-LINEAIRE de la projection perspective
 * concentre la majorite de ces valeurs pres du near plane.
 */
function depthPrecision(
  near: number,
  far: number,
  distance: number,
  depthBits: number = 24,
): number {
  const totalValues = Math.pow(2, depthBits);

  // La valeur depth en NDC [0,1] (convention WebGPU)
  const depthNDC = (far / (near - far)) * (1 - near / distance);

  // Precision = plus petite difference de profondeur representable
  // a cette distance
  const epsilon = distance * distance / (near * totalValues);

  return epsilon;
}

// Comparer la precision a differentes distances
console.log('=== Precision du depth buffer (24 bits) ===');
console.log('near=0.1, far=1000:');
console.log(`  z=1   : precision = ${depthPrecision(0.1, 1000, 1).toExponential(2)} unites`);
console.log(`  z=10  : precision = ${depthPrecision(0.1, 1000, 10).toExponential(2)} unites`);
console.log(`  z=100 : precision = ${depthPrecision(0.1, 1000, 100).toExponential(2)} unites`);
console.log(`  z=500 : precision = ${depthPrecision(0.1, 1000, 500).toExponential(2)} unites`);

console.log('\nnear=1, far=1000 (near plus grand = MEILLEURE distribution):');
console.log(`  z=10  : precision = ${depthPrecision(1, 1000, 10).toExponential(2)} unites`);
console.log(`  z=100 : precision = ${depthPrecision(1, 1000, 100).toExponential(2)} unites`);
console.log(`  z=500 : precision = ${depthPrecision(1, 1000, 500).toExponential(2)} unites`);
```

### Regles pour eviter le z-fighting

```
BONNES PRATIQUES DEPTH BUFFER
════════════════════════════════════════════════════════════════

1. Near plane le plus GRAND possible
   ✗ near = 0.001   → mauvaise distribution
   ✓ near = 0.1     → acceptable
   ✓ near = 1.0     → ideal si la scene le permet

2. Far plane le plus PETIT possible
   ✗ far = 1000000  → precision diluee
   ✓ far = 1000     → bon compromis

3. Ratio near/far le plus PETIT possible
   ✗ far/near = 1000000  → catastrophique
   ✓ far/near = 1000     → acceptable
   ✓ far/near = 100      → excellent

4. Utiliser un REVERSED depth buffer
   → Mappe z=near a 1.0 et z=far a 0.0
   → Redistribue la precision de facon plus uniforme
   → Technique standard dans les moteurs modernes

5. Ajouter un PETIT offset (polygon offset) entre les surfaces coplanaires
   → WebGL : gl.polygonOffset(factor, units)
   → WebGPU : depthBias, depthBiasSlopeScale, depthBiasClamp
```

---

## Viewport et scissor test

```
VIEWPORT ET SCISSOR
════════════════════════════════════════════════════════════════

Le VIEWPORT definit la zone de l'ecran ou le rendu est affiche.
C'est la derniere transformation : NDC → pixels.

Ecran (800 x 600 pixels) :
┌──────────────────────────────────────┐
│  ┌──────────────┐                    │
│  │  Viewport    │                    │
│  │  (0,0)       │                    │
│  │  400 x 300   │                    │
│  │              │                    │
│  └──────────────┘                    │
│                                      │
└──────────────────────────────────────┘

Cas d'usage multiples viewports :
  - Split-screen (2 joueurs)
  - Minimap dans le coin
  - Editeur 3D (4 vues : dessus, face, cote, perspective)

Le SCISSOR TEST est un rectangle de decoupe supplementaire.
Il EMPECHE le rendu en dehors de la zone scissor,
meme si le viewport est plus grand.
Utile pour les effets de masquage et les UI complexes.
```

```typescript
// ── viewport.ts ───────────────────────────────────────

/**
 * Transformer des coordonnees NDC en pixels ecran.
 *
 * Cette transformation est faite automatiquement par le GPU
 * apres le vertex shader. On l'implemente ici pour comprendre.
 */
function ndcToScreen(
  ndcX: number,
  ndcY: number,
  ndcZ: number,
  viewportX: number,
  viewportY: number,
  viewportWidth: number,
  viewportHeight: number,
  depthMin: number = 0,  // WebGPU default
  depthMax: number = 1,  // WebGPU default
): { screenX: number; screenY: number; depth: number } {
  return {
    screenX: viewportX + (ndcX + 1) * 0.5 * viewportWidth,
    screenY: viewportY + (1 - ndcY) * 0.5 * viewportHeight, // Y inverse
    depth: depthMin + ndcZ * (depthMax - depthMin),
  };
}

/**
 * Transformation inverse : pixel ecran → rayon 3D (pour le picking).
 *
 * Quand l'utilisateur clique sur l'ecran, on veut savoir
 * quel objet 3D il a touche. Il faut "deprojeter" le pixel.
 */
function screenToRay(
  screenX: number,
  screenY: number,
  viewportWidth: number,
  viewportHeight: number,
  inverseProjection: Mat4,
  inverseView: Mat4,
): { origin: Vec3; direction: Vec3 } {
  // 1. Pixel → NDC
  const ndcX = (screenX / viewportWidth) * 2 - 1;
  const ndcY = 1 - (screenY / viewportHeight) * 2; // Y inverse

  // 2. NDC → espace camera (near plane, z = -1 en clip space)
  const nearPoint = inverseProjection.transformPoint(new Vec3(ndcX, ndcY, 0));
  const farPoint = inverseProjection.transformPoint(new Vec3(ndcX, ndcY, 1));

  // 3. Espace camera → espace monde
  const worldNear = inverseView.transformPoint(nearPoint);
  const worldFar = inverseView.transformPoint(farPoint);

  return {
    origin: worldNear,
    direction: worldFar.sub(worldNear).normalize(),
  };
}
```

---

## NDC : differences WebGL vs WebGPU

```
NDC : NORMALIZED DEVICE COORDINATES
════════════════════════════════════════════════════════════════

                 WebGL                         WebGPU
          ┌───────────────┐             ┌───────────────┐
          │  y = 1        │             │  y = 1        │
          │               │             │               │
          │ x=-1    x=1   │             │ x=-1    x=1   │
          │       O       │             │       O       │
          │               │             │               │
          │  y = -1       │             │  y = -1       │
          └───────────────┘             └───────────────┘

           z ∈ [-1, 1]                   z ∈ [0, 1]
           near → -1                     near → 0
           far  → +1                     far  → 1

La seule difference est la plage de z !
  WebGL :  z ∈ [-1, 1]  (OpenGL heritage)
  WebGPU : z ∈ [0, 1]   (Direct3D / Vulkan / Metal)

Impact pratique :
  - La matrice de projection est DIFFERENTE
  - Les shaders qui lisent le depth buffer doivent en tenir compte
  - Les reversed depth buffers sont plus simples avec [0, 1]
  - Three.js gere cela automatiquement selon le renderer
```

Pour convertir une projection WebGL vers WebGPU, on multiplie par une matrice de correction qui remappe z : `z_webgpu = z_webgl * 0.5 + 0.5`. En pratique, Three.js et les librairies math gerent cette conversion automatiquement selon le renderer utilise.

---

## Implementation complete : Camera class

```typescript
// ── camera.ts ─────────────────────────────────────────

/**
 * Camera 3D complete avec projection et vue.
 *
 * Equivalent simplifie de THREE.PerspectiveCamera / THREE.OrthographicCamera.
 */
class Camera {
  // Position et orientation
  eye: Vec3;
  target: Vec3;
  up: Vec3;

  // Parametres de projection
  fovY: number;          // radians (perspective uniquement)
  aspect: number;
  near: number;
  far: number;
  orthoSize: number;     // taille visible (orthographique uniquement)
  isOrthographic: boolean;

  // Matrices en cache (recalculees quand les parametres changent)
  private _viewDirty: boolean = true;
  private _projDirty: boolean = true;
  private _viewMatrix: Mat4 = Mat4.identity();
  private _projMatrix: Mat4 = Mat4.identity();

  constructor(options: {
    eye?: Vec3;
    target?: Vec3;
    up?: Vec3;
    fovY?: number;
    aspect?: number;
    near?: number;
    far?: number;
    orthoSize?: number;
    isOrthographic?: boolean;
  } = {}) {
    this.eye = options.eye ?? new Vec3(0, 5, 10);
    this.target = options.target ?? Vec3.ZERO;
    this.up = options.up ?? Vec3.UP;
    this.fovY = options.fovY ?? toRadians(60);
    this.aspect = options.aspect ?? 16 / 9;
    this.near = options.near ?? 0.1;
    this.far = options.far ?? 1000;
    this.orthoSize = options.orthoSize ?? 20;
    this.isOrthographic = options.isOrthographic ?? false;
  }

  /** Matrice de vue (avec cache) */
  getViewMatrix(): Mat4 {
    if (this._viewDirty) {
      this._viewMatrix = lookAt(this.eye, this.target, this.up);
      this._viewDirty = false;
    }
    return this._viewMatrix;
  }

  /** Matrice de projection (avec cache) */
  getProjectionMatrix(): Mat4 {
    if (this._projDirty) {
      if (this.isOrthographic) {
        this._projMatrix = orthographicSymmetric(
          this.orthoSize, this.aspect, this.near, this.far,
        );
      } else {
        this._projMatrix = perspectiveWebGPU(
          this.fovY, this.aspect, this.near, this.far,
        );
      }
      this._projDirty = false;
    }
    return this._projMatrix;
  }

  /** Matrice VP combinee */
  getViewProjectionMatrix(): Mat4 {
    return this.getProjectionMatrix().multiply(this.getViewMatrix());
  }

  /** Modifier la position — invalide le cache */
  setPosition(eye: Vec3): void {
    this.eye = eye;
    this._viewDirty = true;
  }

  /** Modifier la cible — invalide le cache */
  setTarget(target: Vec3): void {
    this.target = target;
    this._viewDirty = true;
  }

  /** Modifier l'aspect ratio (quand la fenetre change de taille) */
  setAspect(width: number, height: number): void {
    this.aspect = width / height;
    this._projDirty = true;
  }

  /** Direction avant (de la camera vers la cible) */
  getForward(): Vec3 {
    return this.target.sub(this.eye).normalize();
  }

  /** Direction droite */
  getRight(): Vec3 {
    return this.getForward().cross(this.up).normalize();
  }

  /**
   * Projeter un point 3D monde sur l'ecran (en pixels).
   *
   * Utile pour : afficher des labels 2D sur des objets 3D,
   * positionner des tooltips, etc.
   */
  projectToScreen(
    worldPoint: Vec3,
    viewportWidth: number,
    viewportHeight: number,
  ): { x: number; y: number; depth: number; visible: boolean } {
    const vp = this.getViewProjectionMatrix();
    const [cx, cy, cz, cw] = vp.multiplyVec4(worldPoint.x, worldPoint.y, worldPoint.z, 1);

    // Verifier si le point est devant la camera (w > 0)
    if (cw <= 0) {
      return { x: 0, y: 0, depth: 0, visible: false };
    }

    // Perspective divide → NDC
    const ndcX = cx / cw;
    const ndcY = cy / cw;
    const ndcZ = cz / cw;

    // Verifier si le point est dans le volume visible
    const visible = ndcX >= -1 && ndcX <= 1 &&
                    ndcY >= -1 && ndcY <= 1 &&
                    ndcZ >= 0  && ndcZ <= 1;

    // NDC → pixels ecran
    const screenX = (ndcX + 1) * 0.5 * viewportWidth;
    const screenY = (1 - ndcY) * 0.5 * viewportHeight;

    return { x: screenX, y: screenY, depth: ndcZ, visible };
  }
}

// Utilisation
const camera = new Camera({
  eye: new Vec3(0, 5, 10),
  target: Vec3.ZERO,
  fovY: toRadians(60),
  aspect: 1920 / 1080,
  near: 0.1,
  far: 1000,
});

// Projeter un objet a l'origine sur l'ecran
const result = camera.projectToScreen(Vec3.ZERO, 1920, 1080);
console.log(`Ecran: (${result.x.toFixed(0)}, ${result.y.toFixed(0)}), visible: ${result.visible}`);
// Attendu : environ (960, 540) — le centre de l'ecran (l'objet est pile devant)
```

---

## Exercice pratique

### Enonce

1. Implementez `lookAt(eye, target, up)` qui retourne une `Mat4` de vue
2. Implementez `perspective(fovY, aspect, near, far)` qui retourne une `Mat4` de projection (convention WebGPU z ∈ [0,1])
3. Implementez `orthographic(size, aspect, near, far)` qui retourne une `Mat4` de projection
4. Ecrivez une fonction `projectToScreen(point3D, mvp, width, height)` qui retourne les coordonnees pixel
5. Verifiez que le centre de la scene (0,0,0) se projette bien au centre de l'ecran

<details>
<summary>Voir la solution</summary>

```typescript
// --- 1. lookAt ---
function lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  const forward = target.sub(eye).normalize();
  const right = forward.cross(up).normalize();
  const newUp = right.cross(forward);

  return Mat4.fromRows(
     right.x,    right.y,    right.z,   -right.dot(eye),
     newUp.x,    newUp.y,    newUp.z,   -newUp.dot(eye),
    -forward.x, -forward.y, -forward.z,  forward.dot(eye),
     0,           0,          0,          1,
  );
}

// --- 2. perspective (WebGPU) ---
function perspective(fovYRad: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovYRad / 2);

  return Mat4.fromRows(
    f / aspect,  0,   0,                          0,
    0,           f,   0,                          0,
    0,           0,   far / (near - far),         (near * far) / (near - far),
    0,           0,  -1,                          0,
  );
}

// --- 3. orthographic ---
function orthographic(size: number, aspect: number, near: number, far: number): Mat4 {
  const halfH = size / 2;
  const halfW = halfH * aspect;
  const fn = far - near;

  return Mat4.fromRows(
    1 / halfW,  0,          0,        0,
    0,          1 / halfH,  0,        0,
    0,          0,         -1 / fn,  -near / fn,
    0,          0,          0,        1,
  );
}

// --- 4. projectToScreen ---
function projectToScreen(
  point: Vec3,
  mvp: Mat4,
  width: number,
  height: number,
): { x: number; y: number; depth: number } | null {
  const [cx, cy, cz, cw] = mvp.multiplyVec4(point.x, point.y, point.z, 1);

  // Point derriere la camera
  if (cw <= 0) return null;

  // Perspective divide
  const ndcX = cx / cw;
  const ndcY = cy / cw;
  const ndcZ = cz / cw;

  // NDC → pixels
  return {
    x: (ndcX + 1) * 0.5 * width,
    y: (1 - ndcY) * 0.5 * height,
    depth: ndcZ,
  };
}

// --- 5. Verification ---
function verify(): void {
  const eye = new Vec3(0, 0, 10);
  const target = Vec3.ZERO;
  const up = Vec3.UP;

  const V = lookAt(eye, target, up);
  const P = perspective(toRadians(60), 1920 / 1080, 0.1, 1000);
  const M = Mat4.identity(); // pas de transformation sur l'objet
  const MVP = P.multiply(V).multiply(M);

  const result = projectToScreen(Vec3.ZERO, MVP, 1920, 1080);

  if (result) {
    console.log(`Centre projete: (${result.x.toFixed(1)}, ${result.y.toFixed(1)})`);
    console.log(`Attendu: (960.0, 540.0) — centre de l'ecran`);
    console.log(`Correct: ${Math.abs(result.x - 960) < 1 && Math.abs(result.y - 540) < 1}`);
  }

  // Test supplementaire : un point a droite se projette a droite de l'ecran
  const rightPoint = projectToScreen(new Vec3(5, 0, 0), MVP, 1920, 1080);
  if (rightPoint) {
    console.log(`Point (5,0,0) projete: x=${rightPoint.x.toFixed(1)}`);
    console.log(`A droite du centre: ${rightPoint.x > 960}`); // true
  }

  // Test orthographique
  const O = orthographic(20, 1920 / 1080, 0.1, 1000);
  const MVPOrtho = O.multiply(V).multiply(M);
  const orthoResult = projectToScreen(Vec3.ZERO, MVPOrtho, 1920, 1080);

  if (orthoResult) {
    console.log(`\nOrthographique — centre: (${orthoResult.x.toFixed(1)}, ${orthoResult.y.toFixed(1)})`);
    console.log(`Correct: ${Math.abs(orthoResult.x - 960) < 1 && Math.abs(orthoResult.y - 540) < 1}`);
  }
}

verify();
```

</details>

---

## Resume

| Concept | Explication |
|---------|-------------|
| Espaces de coordonnees | Objet → Monde (M) → Camera (V) → Clip (P) → NDC (/w) → Ecran |
| lookAt | Construit la view matrix a partir de eye, target, up |
| View matrix | Inverse de la transformation camera — ramene la scene devant l'oeil |
| Projection perspective | Simule la vision humaine — objets lointains retrecissent |
| Projection orthographique | Pas de perspective — taille constante quelle que soit la distance |
| fov (field of view) | Angle d'ouverture verticale de la camera — controle le "zoom" |
| Aspect ratio | Largeur / hauteur du viewport — evite la deformation |
| Near / Far planes | Definissent la plage de profondeur visible |
| Frustum | Volume en forme de pyramide tronquee (perspective) ou boite (ortho) |
| Frustum culling | Eliminer les objets hors du frustum avant le rendu |
| Depth buffer | Stocke la profondeur par pixel — precision non-lineaire en perspective |
| Z-fighting | Scintillement quand deux surfaces ont des profondeurs trop proches |
| NDC | Coordonnees normalisees : x,y ∈ [-1,1], z ∈ [0,1] (WebGPU) ou [-1,1] (WebGL) |
| Viewport transform | NDC → pixels ecran (avec inversion de Y) |

---

## Pour aller plus loin

- [The Perspective and Orthographic Projection Matrix (Scratchapixel)](https://www.scratchapixel.com/lessons/3d-basic-rendering/perspective-and-orthographic-projection-matrix/building-basic-perspective-projection-matrix.html)
- [Learn OpenGL — Coordinate Systems](https://learnopengl.com/Getting-started/Coordinate-Systems)
- [WebGPU Coordinate Systems](https://gpuweb.github.io/gpuweb/#coordinate-systems)
- [Reversed-Z in OpenGL (Nathan Reed)](https://developer.nvidia.com/content/depth-precision-visualized)
- [Frustum Culling (Lighthouse3D)](http://www.lighthouse3d.com/tutorials/view-frustum-culling/)
