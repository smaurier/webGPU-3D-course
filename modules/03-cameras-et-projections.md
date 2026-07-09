---
titre: Caméras et projections
cours: 20-webgpu-3d
notions: [matrice de vue (lookAt), projection perspective, projection orthographique, frustum, "near/far, FOV, aspect", coordonnées NDC, pipeline model-view-projection, perspective divide, viewport transform, "NDC WebGPU z 0..1 vs WebGL -1..1"]
outcomes:
  - sait construire une matrice de vue lookAt à partir de eye, target et up
  - sait construire une matrice de projection perspective et orthographique en convention WebGPU (z NDC dans 0..1)
  - sait dérouler le pipeline MVP complet et projeter un point 3D en pixels écran
  - sait expliquer le frustum, le rôle de near/far/FOV/aspect et distinguer NDC WebGPU vs WebGL
prerequis: [00-prerequis-et-introduction, 01-algebre-lineaire-pour-la-3d, 02-transformations-et-quaternions]
next: 04-pipeline-de-rendu
libs: []
tribuzen: front-office TribuZen — la caméra qui survole la carte 3D des sorties de la famille
last-reviewed: 2026-07
---

# Caméras et projections

> **Outcomes — tu sauras FAIRE :** construire une matrice de vue `lookAt`, construire une projection perspective et orthographique en convention WebGPU, dérouler le pipeline MVP et projeter un point 3D en pixels écran.
> **Difficulté :** :star::star::star:

## 1. Cas concret d'abord

Sur TribuZen, tu construis la **carte 3D des sorties de la famille** : un plan avec des marqueurs (chaque marqueur = une sortie passée ou prévue). L'utilisateur veut **survoler** cette carte comme depuis un drone, et l'app doit afficher une **étiquette HTML** (le nom de la sortie) pile au-dessus de chaque marqueur 3D.

Deux problèmes concrets se posent tout de suite :

1. **Où placer la caméra ?** Elle doit être en hauteur, inclinée vers le sol, et regarder le centre de la carte. C'est le rôle de la matrice de vue `lookAt(eye, target, up)`.
2. **Où dessiner l'étiquette HTML ?** L'étiquette est un `<div>` en 2D, mais le marqueur est un point 3D `(x, y, z)`. Il faut **projeter** ce point 3D en coordonnées pixel `(px, py)`. C'est le rôle de la matrice de projection + le *perspective divide* + le *viewport transform*.

```ts
// Ce qu'on veut écrire à la fin du module — la fonction qui manque
const camera = new Camera({
  eye: new Vec3(0, 40, 40),   // drone : 40 unités en hauteur, 40 en recul
  target: new Vec3(0, 0, 0),  // regarde le centre de la carte
  up: Vec3.UP,
})

// Marqueur "Randonnée au lac" à la position monde (12, 0, -5)
const marqueur = new Vec3(12, 0, -5)

// On veut : à quel pixel de l'écran dessiner l'étiquette ?
const { x, y, visible } = camera.projectToScreen(marqueur, 1920, 1080)
// → place le <div> "Randonnée au lac" en (x, y) si visible
```

Sans caméra ni projection, on ne sait ni cadrer la scène, ni relier un point 3D à un pixel. Ce module construit toute cette chaîne, de `eye/target/up` jusqu'au pixel.

---

## 2. Théorie complète, concise

### 2.1 La chaîne des espaces de coordonnées

Chaque sommet traverse une suite d'espaces avant d'atteindre l'écran. C'est le **pipeline MVP** (Model-View-Projection) :

```
Espace objet  ──M──►  Espace monde  ──V──►  Espace caméra  ──P──►  Clip space (homogène)
  (local)               (world)              (view / eye)                  │
                                                                     /w (perspective divide)
                                                                           │
                                                                           ▼
                                                                     NDC  (x,y ∈ [-1,1], z ∈ [0,1])
                                                                           │
                                                                    viewport transform
                                                                           │
                                                                           ▼
                                                                     Écran (pixels)

M = Model      → place l'objet dans le monde       (vu au module 02)
V = View       → ramène le monde devant la caméra  (ce module — lookAt)
P = Projection → projette la 3D en clip space       (ce module — perspective / ortho)
/w             → perspective divide → NDC
viewport       → NDC → pixels écran
```

La matrice combinée est `MVP = P · V · M` (lecture droite→gauche : on applique d'abord M, puis V, puis P). En WebGPU on envoie généralement `MVP` (ou `VP` + `M` séparés) comme uniform au vertex shader.

### 2.2 La matrice de vue : `lookAt`

La **matrice de vue** ramène le monde *devant* la caméra. La façon la plus intuitive de la construire est `lookAt`, à partir de 3 paramètres :

- `eye` : position de la caméra dans le monde
- `target` : le point que la caméra regarde
- `up` : direction « haut » approximative (souvent `(0, 1, 0)`)

À partir de là, on construit un **repère orthonormé** de la caméra :

```
forward = normalize(target - eye)   → direction vers la cible
right   = normalize(forward × up)   → axe horizontal (droite de la caméra)
newUp   = right × forward           → axe vertical corrigé (réellement orthogonal)
```

La matrice de vue est **l'inverse** de la transformation caméra : au lieu de placer la caméra puis d'inverser, on construit directement l'inverse.

```ts
// ── look-at.ts ────────────────────────────────────────
// Convention : column-major, caméra regarde vers -Z (comme OpenGL/WebGL/WebGPU)
function lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  const forward = target.sub(eye).normalize()   // direction visée
  const right   = forward.cross(up).normalize() // axe X caméra
  const newUp   = right.cross(forward)          // axe Y caméra (déjà normalisé)

  // Partie rotation = transposée du repère (= inverse pour une base orthonormée)
  // Partie translation = -dot(axe, eye) : ramène eye à l'origine, dans le repère caméra
  return Mat4.fromRows(
     right.x,    right.y,    right.z,   -right.dot(eye),
     newUp.x,    newUp.y,    newUp.z,   -newUp.dot(eye),
    -forward.x, -forward.y, -forward.z,  forward.dot(eye),
     0,          0,          0,          1,
  )
}
```

**Pourquoi `-forward` ?** En OpenGL/WebGL/WebGPU, la caméra regarde vers **-Z**. On stocke donc `-forward` comme axe Z de la matrice. Oublie ce signe et toute la scène apparaît *derrière* la caméra (écran noir).

### 2.3 La projection perspective

La projection perspective simule l'œil humain : les objets lointains rapetissent. Elle est définie par 4 paramètres :

- `fovY` : angle d'ouverture **vertical** (en radians, typiquement 45–90°) — le « zoom »
- `aspect` : `largeur / hauteur` du viewport — évite la déformation
- `near`, `far` : plans proche et lointain (distances > 0)

```
FRUSTUM PERSPECTIVE (vue de côté)
                     far plane
                  ╱─────────────╲
                ╱                 ╲
              ╱   objets visibles  ╲
            ╱ ◄── fovY ──►           ╲
   eye ────╱───────────────────────────╲
            ╲                          ╱
              ╲──────────────────────╱
                     near plane
```

```ts
// ── perspective.ts ────────────────────────────────────
// Convention WebGPU : z NDC ∈ [0, 1] (near → 0, far → 1)
function perspectiveWebGPU(
  fovYRad: number,
  aspect: number,
  near: number,
  far: number,
): Mat4 {
  const f = 1 / Math.tan(fovYRad / 2)  // "focale" — contrôle le zoom

  return Mat4.fromRows(
    f / aspect, 0, 0,                   0,
    0,          f, 0,                   0,
    0,          0, far / (near - far),  (near * far) / (near - far),
    0,          0, -1,                  0,
  )
}
```

Décorticage de la matrice :

- `f = 1 / tan(fov/2)` contrôle le zoom. `fov` petit ⇒ `f` grand ⇒ zoom avant (téléobjectif). `fov` grand ⇒ `f` petit ⇒ grand angle (fisheye).
- `f / aspect` corrige le rapport largeur/hauteur : sans lui, la scène serait étirée.
- Les termes `far/(near-far)` et `near·far/(near-far)` mappent la profondeur `z` caméra vers la plage NDC **[0, 1]** de WebGPU (near→0, far→1).
- Le `-1` en position (ligne 3, colonne 2) copie `-z` dans la composante `w`. Après le perspective divide (`/w`), les objets lointains (z grand) sont divisés par un `w` plus grand ⇒ ils rapetissent. **C'est l'essence même de la perspective.**

### 2.4 La projection orthographique

L'orthographique **ne** simule **pas** la perspective : un objet garde la même taille quelle que soit sa distance. Les lignes parallèles restent parallèles, pas de point de fuite.

Cas d'usage : UI/HUD 2D, CAD, jeux isométriques (RTS, city-builders), **shadow mapping** (lumière directionnelle), éditeurs 3D (vues de dessus/face/côté).

```ts
// ── orthographic.ts ───────────────────────────────────
// Convention WebGPU : z NDC ∈ [0, 1]
function orthographicWebGPU(
  left: number, right: number,
  bottom: number, top: number,
  near: number, far: number,
): Mat4 {
  const rl = right - left
  const tb = top - bottom
  const fn = far - near

  return Mat4.fromRows(
    2 / rl, 0,      0,       -(right + left) / rl,
    0,      2 / tb, 0,       -(top + bottom) / tb,
    0,      0,      -1 / fn, -near / fn,
    0,      0,      0,        1,
  )
}

// Version symétrique (plus pratique) : définie par une hauteur visible + aspect
function orthographicSymmetric(size: number, aspect: number, near: number, far: number): Mat4 {
  const halfH = size / 2
  const halfW = halfH * aspect
  return orthographicWebGPU(-halfW, halfW, -halfH, halfH, near, far)
}
```

Ici `w` reste à `1` : **pas de perspective divide** qui rétrécit. C'est pourquoi la taille est constante.

### 2.5 Le frustum : le volume visible

Le **frustum** est le volume dans lequel les objets sont visibles. En perspective c'est une pyramide tronquée ; en ortho c'est une boîte. Il a **6 plans** : near, far, left, right, top, bottom. Tout ce qui est en dehors est invisible — inutile de le dessiner.

Le **frustum culling** exploite ça : avant de dessiner un objet, on teste sa sphère englobante contre les 6 plans (6 produits scalaires). Hors frustum ⇒ on l'ignore. Dans un jeu à 10 000 objets, ça élimine 80–90 % des objets avant le GPU. Three.js le fait automatiquement (`mesh.frustumCulled = true` par défaut).

### 2.6 Perspective divide, viewport transform et NDC

Après `P`, on est en **clip space** homogène `(x, y, z, w)`. Deux étapes finales :

1. **Perspective divide** : diviser par `w` ⇒ **NDC**. En NDC, `x, y ∈ [-1, 1]` et (WebGPU) `z ∈ [0, 1]`.
2. **Viewport transform** : NDC → pixels. Attention, l'axe Y s'inverse (en NDC `y=1` est en haut, en pixels `y=0` est en haut).

```ts
// NDC → pixels écran
const screenX = (ndcX + 1) * 0.5 * width
const screenY = (1 - ndcY) * 0.5 * height  // Y inversé !
```

### 2.7 NDC WebGPU vs WebGL — la différence à connaître

C'est le piège inter-API classique. **Seule la plage de `z` change** :

```
             WebGL              WebGPU
x, y :   [-1, 1]            [-1, 1]        (identique)
z    :   [-1, 1]            [ 0, 1]        (DIFFÉRENT)
         near → -1          near → 0
         far  → +1          far  → 1
```

WebGPU aligne `z ∈ [0, 1]` sur Direct3D / Vulkan / Metal ; WebGL garde `z ∈ [-1, 1]` (héritage OpenGL). Conséquence : **la matrice de projection n'est pas la même** entre les deux. Pour convertir une projection WebGL → WebGPU, on remappe `z_webgpu = z_webgl * 0.5 + 0.5`. Three.js et les libs math (wgpu-matrix, gl-matrix) gèrent ça selon le renderer.

> **Vérifié sur la spec WebGPU (2026-07)** : NDC `x, y ∈ [-1, 1]`, `z ∈ [0, 1]`, origine framebuffer en haut à gauche (Y vers le bas). Voir *Pour aller plus loin*.

---

## 3. Worked examples

### Exemple 1 — Placer la caméra drone de TribuZen et vérifier la vue

On place la caméra du cas concret et on vérifie qu'un point du monde tombe bien *devant* la caméra (z négatif en espace caméra).

```ts
// Caméra drone : 40 en hauteur, 40 en recul, regarde le centre
const view = lookAt(
  new Vec3(0, 40, 40),  // eye
  new Vec3(0, 0, 0),    // target : centre de la carte
  Vec3.UP,              // up = (0, 1, 0)
)

// Le centre de la carte, vu depuis la caméra
const centreEnCamera = view.transformPoint(new Vec3(0, 0, 0))
console.log(centreEnCamera.toString())
// → z NÉGATIF : le centre est "devant" la caméra. ✅
//   (distance ≈ √(40² + 40²) ≈ 56.6, donc z ≈ -56.6)

// Un marqueur derrière la caméra ne doit PAS être devant
const derriere = view.transformPoint(new Vec3(0, 40, 100))
console.log(derriere.toString())
// → z positif : ce point est derrière la caméra, il sera hors frustum.
```

Raisonnement clé : `lookAt` construit un repère où `-Z` pointe vers `target`. Un point situé du côté de la cible a donc une coordonnée `z` **négative** en espace caméra. C'est le test le plus rapide pour valider une matrice de vue.

### Exemple 2 — Projeter le marqueur "Randonnée au lac" en pixel

On déroule le pipeline complet `MVP → /w → viewport` pour un point 3D.

```ts
const view = lookAt(new Vec3(0, 40, 40), new Vec3(0, 0, 0), Vec3.UP)
const proj = perspectiveWebGPU(toRadians(60), 1920 / 1080, 0.1, 500)
const vp = proj.multiply(view)   // pas de Model ici : le marqueur est déjà en monde

const marqueur = new Vec3(12, 0, -5)

// 1. Monde → clip space (homogène)
const [cx, cy, cz, cw] = vp.multiplyVec4(marqueur.x, marqueur.y, marqueur.z, 1)

// 2. Perspective divide → NDC
const ndcX = cx / cw
const ndcY = cy / cw
const ndcZ = cz / cw

// 3. Viewport transform → pixels (Y inversé)
const px = (ndcX + 1) * 0.5 * 1920
const py = (1 - ndcY) * 0.5 * 1080

// 4. Visible ? x,y ∈ [-1,1] ET z ∈ [0,1] (WebGPU) ET devant la caméra (cw > 0)
const visible = cw > 0 &&
  ndcX >= -1 && ndcX <= 1 &&
  ndcY >= -1 && ndcY <= 1 &&
  ndcZ >= 0  && ndcZ <= 1

console.log(`Étiquette en (${px.toFixed(0)}, ${py.toFixed(0)}), visible=${visible}`)
// → on positionne le <div> "Randonnée au lac" à ces coordonnées.
```

Point de vigilance : on teste `cw > 0` **avant** de diviser. Un point derrière la caméra a `cw <= 0` ; sans ce garde-fou, le perspective divide produit des coordonnées miroir qui « collent » l'étiquette au mauvais endroit.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Oublier que la caméra regarde vers -Z

On pense « la caméra regarde vers `forward` », donc on met `+forward` dans la matrice de vue. Faux : en OpenGL/WebGL/WebGPU la caméra regarde vers **-Z**, il faut stocker `-forward`. Symptôme : écran noir ou scène « dans le dos ». Le bon réflexe : après `lookAt`, un point vers la cible doit avoir `z < 0` en espace caméra.

### PIÈGE #2 — Confondre la matrice de projection WebGPU et WebGL

Copier une matrice perspective d'un tuto OpenGL/WebGL donne `z ∈ [-1, 1]`. Sur WebGPU (qui attend `z ∈ [0, 1]`), la moitié near de la scène est **clippée** (disparaît) ou le depth test se comporte mal. Toujours vérifier la convention de la matrice : les termes de la 3e ligne diffèrent entre les deux.

### PIÈGE #3 — Ne pas inverser l'axe Y au viewport transform

En NDC `y = 1` est en **haut** ; en pixels écran `y = 0` est en **haut**. Oublier `(1 - ndcY)` donne une scène (ou des étiquettes, ou un picking souris) **verticalement inversée**. Source de bug très fréquente, surtout avec les textures.

### PIÈGE #4 — Diviser par `w` sans vérifier son signe

Un point derrière la caméra a `w <= 0`. Le perspective divide produit alors des coordonnées inversées qui semblent « valides » mais placent l'objet à l'opposé. Toujours tester `w > 0` avant de projeter (cf. Exemple 2).

### PIÈGE #5 — `near` trop petit ⇒ z-fighting

La précision du depth buffer n'est **pas** linéaire en perspective : elle se concentre près du `near` plane. Avec `near = 0.001` et `far = 100000`, deux surfaces lointaines proches en Z reçoivent la **même** valeur de profondeur ⇒ **z-fighting** (scintillement). Règle : `near` aussi **grand** que possible, `far` aussi **petit** que possible, ratio `far/near` minimal.

### PIÈGE #6 — Confondre FOV horizontal et vertical

Ici `fovY` est l'angle **vertical**. Beaucoup d'APIs (et d'esprits) pensent « champ de vision » horizontal. Passer un FOV horizontal comme `fovY` déforme le cadrage selon l'`aspect`. Le lien : `fovX = 2 · atan(tan(fovY/2) · aspect)`.

---

## 5. Ancrage TribuZen

La **carte 3D des sorties** est le fil-rouge 3D de TribuZen. La caméra et les projections y servent à trois endroits concrets :

1. **Caméra drone qui survole la carte** — `lookAt(eye, target, up)` avec un `eye` en hauteur incliné vers le sol. Quand l'utilisateur fait un pan/zoom, on modifie `eye`/`target` et on recalcule la matrice de vue.
2. **Étiquettes HTML au-dessus des marqueurs** — chaque sortie (position monde) est projetée en pixel via `projectToScreen` (Exemple 2). On positionne un `<div>` overlay en `(x, y)` seulement si `visible`. C'est le pont classique entre le canvas 3D et le DOM 2D.
3. **Mini-carte en projection orthographique** — un aperçu « vue de dessus » de la carte utilise `orthographicSymmetric(...)` : pas de perspective, échelle constante, idéal pour une minimap dans un coin de l'écran.

```ts
// tribuzen/src/three/OutingsMapCamera.ts — la Camera réutilisable
class Camera {
  constructor(
    public eye: Vec3, public target: Vec3, public up: Vec3,
    public fovY = toRadians(60), public aspect = 16 / 9,
    public near = 0.1, public far = 500,
  ) {}

  viewProjection(): Mat4 {
    const view = lookAt(this.eye, this.target, this.up)
    const proj = perspectiveWebGPU(this.fovY, this.aspect, this.near, this.far)
    return proj.multiply(view)
  }

  // Projette un marqueur 3D en pixel pour poser l'étiquette HTML
  projectToScreen(worldPoint: Vec3, width: number, height: number) {
    const [cx, cy, , cw] = this.viewProjection()
      .multiplyVec4(worldPoint.x, worldPoint.y, worldPoint.z, 1)
    if (cw <= 0) return { x: 0, y: 0, visible: false } // derrière la caméra
    const ndcX = cx / cw, ndcY = cy / cw
    return {
      x: (ndcX + 1) * 0.5 * width,
      y: (1 - ndcY) * 0.5 * height, // Y inversé
      visible: ndcX >= -1 && ndcX <= 1 && ndcY >= -1 && ndcY <= 1,
    }
  }
}
```

Fichiers cibles dans `smaurier/tribuzen` :

```
tribuzen/
  src/
    three/
      OutingsMapCamera.ts    ← lookAt + perspective + projectToScreen
      OutingsMinimap.ts       ← orthographicSymmetric (vue de dessus)
```

---

## 6. Points clés

1. **Pipeline MVP** : `MVP = P · V · M` ; un sommet fait objet → monde → caméra → clip → NDC → écran.
2. **`lookAt(eye, target, up)`** construit la matrice de vue = l'inverse de la transformation caméra.
3. La caméra regarde vers **-Z** : on stocke `-forward` dans la matrice de vue.
4. **Perspective** : `f = 1/tan(fovY/2)`, `f/aspect` corrige l'aspect ; le `-1` copie `-z` dans `w` ⇒ perspective divide ⇒ objets lointains rapetissent.
5. **Orthographique** : `w` reste à 1, pas de perspective divide, taille constante (UI, CAD, shadow maps).
6. **Frustum culling** : tester la sphère englobante contre 6 plans élimine 80–90 % des objets avant le GPU.
7. **Viewport transform** : NDC → pixels, avec **inversion de l'axe Y**.
8. **NDC WebGPU `z ∈ [0, 1]`** vs **WebGL `z ∈ [-1, 1]`** ⇒ matrices de projection différentes.
9. `near` grand + `far` petit + ratio `far/near` minimal ⇒ moins de **z-fighting**.

---

## 7. Seeds Anki

```
Quels sont les 3 paramètres de lookAt et à quoi servent-ils ?|eye (position caméra), target (point regardé), up (direction haut approximative). On en dérive un repère orthonormé forward/right/newUp pour construire l'inverse de la transformation caméra.
Pourquoi stocke-t-on -forward dans la matrice de vue ?|En OpenGL/WebGL/WebGPU la caméra regarde vers -Z. Sans le signe, la scène apparaît derrière la caméra (écran noir). Test : un point vers la cible a z<0 en espace caméra.
Quelle est l'unique différence de NDC entre WebGL et WebGPU ?|La plage de z. WebGL : z ∈ [-1, 1] (near→-1, far→+1). WebGPU : z ∈ [0, 1] (near→0, far→1). x et y restent [-1, 1]. Conséquence : matrices de projection différentes.
Dans la matrice perspective, à quoi sert le -1 en position (ligne 3, colonne 2) ?|Il copie -z dans la composante w. Après le perspective divide (/w), les objets lointains (z grand) sont divisés par un w plus grand et rapetissent. C'est l'essence de la perspective.
Quelle est la différence pratique entre projection perspective et orthographique ?|Perspective : les objets lointains rapetissent (perspective divide, w = -z), pour les scènes 3D. Orthographique : w reste 1, taille constante quelle que soit la distance, pour UI/CAD/shadow maps/minimap.
Comment convertit-on NDC en pixels écran et quel piège éviter ?|screenX = (ndcX+1)*0.5*width ; screenY = (1-ndcY)*0.5*height. Piège : inverser l'axe Y (en NDC y=1 est en haut, en pixels y=0 est en haut). Oubli = scène verticalement inversée.
Pourquoi tester w > 0 avant le perspective divide ?|Un point derrière la caméra a w <= 0. Diviser par un w négatif produit des coordonnées miroir qui semblent valides mais placent l'objet à l'opposé. On teste cw > 0 avant de projeter.
Comment réduire le z-fighting via near et far ?|La précision du depth buffer se concentre près du near plane (non-linéaire en perspective). Prendre near aussi grand que possible, far aussi petit que possible, et minimiser le ratio far/near.
À quoi sert le frustum culling et quel est son coût ?|Éliminer les objets hors du volume visible (6 plans) avant de les envoyer au GPU. Coût : ~6 produits scalaires par sphère englobante. Gain : 80–90 % d'objets écartés dans une grosse scène.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-03-cameras-et-projections/README.md`. Construire une classe `Camera` (lookAt + perspective + orthographique) et projeter des points 3D en pixels dans un vrai navigateur WebGPU — corrigé commenté intégral, oracle = les valeurs projetées affichées à l'écran.
