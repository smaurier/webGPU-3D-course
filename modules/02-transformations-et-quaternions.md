---
titre: Transformations et quaternions
cours: 20-webgpu-3d
notions: [matrice de translation, matrice de rotation, matrice d'échelle, composition de transformations, "ordre SRT (Scale-Rotate-Translate)", "espace modèle vs espace monde", "angles d'Euler", "gimbal lock", quaternion unitaire, "axe-angle", "slerp (interpolation sphérique)"]
outcomes:
  - sait construire les matrices 4x4 de translation, rotation et échelle
  - sait composer une model matrix dans l'ordre SRT et expliquer pourquoi l'ordre compte
  - sait distinguer espace modèle et espace monde et situer la model matrix dans le pipeline
  - sait expliquer le gimbal lock des angles d'Euler et pourquoi il survient
  - sait construire un quaternion axe-angle et interpoler deux rotations avec slerp
prerequis: [00-prerequis-et-introduction, 01-algebre-lineaire-pour-la-3d]
next: 03-cameras-et-projections
libs: []
tribuzen: couche visualisation 3D TribuZen — faire tourner le globe des sorties de la famille sans gimbal lock (orientation par quaternion + slerp)
last-reviewed: 2026-07
---

# Transformations et quaternions

> **Outcomes — tu sauras FAIRE :** construire les matrices de translation/rotation/échelle et les composer en model matrix (SRT), situer une transformation entre espace modèle et espace monde, expliquer le gimbal lock, et orienter/interpoler un objet avec des quaternions (axe-angle + slerp).
> **Difficulté :** :star::star::star:

## 1. Cas concret d'abord

TribuZen affiche un **globe 3D des sorties de la famille** : chaque sortie (rando, resto, ciné) est un pin planté sur un globe qu'on peut faire tourner. Tu implémentes la caméra qui suit un pin : quand l'utilisateur tape sur un pin, le globe doit **pivoter en douceur** pour amener ce pin face à l'écran.

Première tentative avec des angles d'Euler (yaw / pitch / roll) :

```ts
// globe-rotation.ts — première tentative naïve (bugguée)
let yaw = 0    // rotation autour de Y (axe vertical du globe)
let pitch = 0  // rotation autour de X (bascule haut/bas)

function orientVers(pin: { yaw: number; pitch: number }) {
  // On interpole linéairement chaque angle indépendamment
  yaw = lerp(yaw, pin.yaw, 0.1)
  pitch = lerp(pitch, pin.pitch, 0.1)
  // ... puis on reconstruit la rotation Y * X
}
```

Deux bugs apparaissent :

1. **Quand un pin est proche du pôle** (pitch ≈ 90°), le globe se met à tourner de façon erratique : yaw et pitch se marchent dessus. C'est le **gimbal lock**.
2. **L'interpolation n'est pas la plus courte** : le globe fait parfois un demi-tour complet là où un petit arc suffisait.

La solution que ce module construit : représenter l'orientation du globe par un **quaternion** et interpoler avec **slerp**. Le globe suivra alors toujours l'arc le plus court, sans jamais se bloquer aux pôles. Mais avant les quaternions, il faut maîtriser les matrices de transformation qui placent chaque pin sur le globe.

## 2. Théorie complète, concise

> **Convention de ce module.** Matrices 4x4 en **column-major** (format GPU), vecteurs colonnes, transformation appliquée à gauche : `v' = M · v`. La composition se lit **de droite à gauche** (la matrice la plus à droite s'applique en premier). On suppose `Vec3` et `Mat4` du module 01 disponibles (`Mat4.identity()`, `.multiply()`, `.inverse()`, `Mat4.fromRows(...)`, `.transformPoint()`, `.transformVector()`).

### 2.1 Les trois transformations élémentaires

Toute transformation d'un objet rigide + mise à l'échelle se décompose en translation, rotation, échelle. Chacune est une matrice 4x4 agissant sur des **coordonnées homogènes** (point = `w:1`, vecteur/direction = `w:0`).

**Translation** — décale un point ; les composantes vont dans la 4ᵉ colonne (column-major) :

```
┌ 1  0  0  tx ┐
│ 0  1  0  ty │
│ 0  0  1  tz │
└ 0  0  0   1 ┘
```

```ts
// transformations.ts — translation
function translationMatrix(tx: number, ty: number, tz: number): Mat4 {
  const m = Mat4.identity()
  m.data[12] = tx // colonne 3, ligne 0 (indices column-major)
  m.data[13] = ty
  m.data[14] = tz
  return m
}
```

Un point (`w:1`) est déplacé ; une direction (`w:0`) est **invariante** par translation — c'est tout l'intérêt des coordonnées homogènes.

**Échelle** — facteurs sur la diagonale :

```
┌ sx  0   0  0 ┐
│  0  sy  0  0 │
│  0   0 sz  0 │
└  0   0  0  1 ┘
```

```ts
function scaleMatrix(sx: number, sy: number, sz: number): Mat4 {
  const m = Mat4.identity()
  m.data[0] = sx
  m.data[5] = sy
  m.data[10] = sz
  return m
}
```

**Rotation** — autour des axes principaux, via sin/cos de l'angle (radians). Autour de Y (le plus utile pour un globe) :

```
┌  cos θ  0  sin θ  0 ┐
│    0    1    0    0 │
│ -sin θ  0  cos θ  0 │
└    0    0    0    1 ┘
```

```ts
function rotationY(theta: number): Mat4 {
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  const m = Mat4.identity()
  // column-major : data[col*4 + row]
  m.data[0] = c;  m.data[8] = s
  m.data[2] = -s; m.data[10] = c
  return m
}
```

Rotation autour d'un **axe arbitraire** `n` (unitaire), angle θ — formule de Rodrigues en matrice, avec `t = 1 - cos θ` :

```ts
function rotationAxis(axis: Vec3, theta: number): Mat4 {
  const n = axis.normalize()
  const c = Math.cos(theta), s = Math.sin(theta), t = 1 - c
  return Mat4.fromRows(
    t*n.x*n.x + c,     t*n.x*n.y - s*n.z, t*n.x*n.z + s*n.y, 0,
    t*n.x*n.y + s*n.z, t*n.y*n.y + c,     t*n.y*n.z - s*n.x, 0,
    t*n.x*n.z - s*n.y, t*n.y*n.z + s*n.x, t*n.z*n.z + c,     0,
    0,                 0,                 0,                 1,
  )
}
```

### 2.2 Composition et ordre SRT

La **model matrix** place l'objet dans le monde en composant les trois transformations. L'ordre standard est **SRT** : on met à l'**S**cale, puis on **R**otate, puis on **T**ranslate. Comme la composition se lit de droite à gauche, la matrice s'écrit dans l'ordre **inverse** :

```
ModelMatrix = T · R · S
```

```ts
function buildModelMatrix(position: Vec3, rotation: Mat4, scale: Vec3): Mat4 {
  const T = translationMatrix(position.x, position.y, position.z)
  const S = scaleMatrix(scale.x, scale.y, scale.z)
  // Appliqué à un vertex : S d'abord (le plus à droite), puis R, puis T
  return T.multiply(rotation).multiply(S)
}
```

Pourquoi cet ordre ? Parce que la matrice multiplie le vertex **à droite** : `T·R·S·v` applique d'abord `S` (au plus près de `v`), puis `R`, puis `T`. Si on translatait avant de scaler, le facteur d'échelle multiplierait aussi la translation — l'objet s'envolerait. L'ordre SRT garantit que l'objet est mis à l'échelle et orienté **sur place**, autour de son origine locale, avant d'être posé à sa position monde.

**La multiplication de matrices n'est pas commutative** : `T·R ≠ R·T`.

- `T·R` : l'objet tourne sur lui-même, puis est déplacé → il tourne autour de **son** centre.
- `R·T` : l'objet est déplacé, puis tourné autour de **l'origine du monde** → il décrit un arc (utile pour une orbite).

### 2.3 Espace modèle vs espace monde

Un vertex traverse plusieurs **espaces** :

```
espace modèle  ──[ Model ]──►  espace monde  ──[ View ]──►  espace caméra  ──[ Projection ]──►  clip space
   (local,                        (position                    (relatif à                          (−1..1
    objet centré                   dans la                      la caméra)                          après /w)
    sur son origine)               scène)
```

- **Espace modèle (local)** : coordonnées telles que l'artiste a modélisé l'objet, centré sur sa propre origine. Un pin de globe est modélisé une fois, à l'origine.
- **Espace monde** : après la **model matrix**, chaque instance du pin est placée, orientée, dimensionnée dans la scène commune.

La model matrix est donc le pont **modèle → monde**. La **view matrix** (module 03) est l'inverse de la transformation de la caméra ; la **projection** passe en clip space. Position finale d'un vertex : `P · V · M · v_local`.

### 2.4 Angles d'Euler et gimbal lock

Une orientation peut se décrire par **3 angles d'Euler** appliqués successivement autour de trois axes : yaw (Y), pitch (X), roll (Z). Intuitif, mais avec un défaut structurel.

**Gimbal lock** : quand l'angle du milieu atteint ±90°, deux des trois axes de rotation **s'alignent**. On perd un degré de liberté : deux des trois angles produisent alors la **même** rotation, et certaines orientations deviennent inatteignables ou instables à l'interpolation.

```
3 axes indépendants          pitch = 90° → gimbal lock
   yaw   ─┐                     yaw  ─┐
   pitch ─┼─ 3 DDL              roll ─┘ même rotation !
   roll  ─┘                     pitch bloqué (2 DDL au lieu de 3)
```

```ts
// gimbal-lock-demo.ts — deux triplets d'Euler DIFFÉRENTS, MÊME rotation
const rad = (d: number) => (d * Math.PI) / 180

// Orientation A : yaw=30°, pitch=90°, roll=0°
const A = rotationY(rad(30)).multiply(rotationX(rad(90)))
// Orientation B : yaw=0°, pitch=90°, roll=30°
const B = rotationX(rad(90)).multiply(rotationZ(rad(30)))

const pA = A.transformPoint(new Vec3(1, 0, 0))
const pB = B.transformPoint(new Vec3(1, 0, 0))
console.log(pA.distanceTo(pB) < 1e-3) // true : yaw et roll font la même chose
```

C'est exactement le bug du globe : un pin proche du pôle amène le pitch vers 90°, et le globe devient incontrôlable. Les moteurs 3D (Three.js, Unity, Unreal) stockent les orientations en **quaternions** en interne, même s'ils exposent parfois des angles d'Euler à l'UI.

### 2.5 Quaternions : représentation d'une rotation

Un quaternion est un nombre à 4 composantes `q = w + xi + yj + zk`, noté `(w, x, y, z)`. Un **quaternion unitaire** (`|q| = 1`) encode une rotation d'angle θ autour d'un axe unitaire `n` :

```
q = ( cos(θ/2),  sin(θ/2)·n.x,  sin(θ/2)·n.y,  sin(θ/2)·n.z )
      └─ w ──┘   └──────────── partie vectorielle (x, y, z) ───────┘
```

Le **demi-angle** `θ/2` est la clé : une rotation de θ correspond à un quaternion construit avec θ/2 (conséquence de la formule de rotation `q·v·q⁻¹`, qui applique la rotation deux fois — d'où la moitié).

Propriétés qui règlent nos bugs :

- **Pas de gimbal lock** : l'orientation est une seule entité à 4 nombres, pas 3 rotations enchaînées.
- **Composition = multiplication** : `q1 · q2` compose les rotations (q2 d'abord, comme les matrices).
- **Interpolation fluide** via **slerp** (§2.6), à vitesse angulaire constante.
- **Compact** : 4 floats contre 9 (rotation 3x3) ou 16 (4x4).
- **Double couverture** : `q` et `−q` représentent la **même** rotation (θ/2 → l'angle 4π ramène à l'identité). Ce détail est central pour choisir le chemin court dans slerp.

```ts
// quaternion.ts — construction axe-angle + opérations de base
class Quat {
  constructor(
    readonly w: number, readonly x: number,
    readonly y: number, readonly z: number,
  ) {}

  static readonly IDENTITY = new Quat(1, 0, 0, 0)

  static fromAxisAngle(axis: Vec3, theta: number): Quat {
    const half = theta / 2
    const s = Math.sin(half)
    const n = axis.normalize()
    return new Quat(Math.cos(half), n.x * s, n.y * s, n.z * s)
  }

  length(): number {
    return Math.hypot(this.w, this.x, this.y, this.z)
  }

  normalize(): Quat {
    const l = this.length()
    if (l === 0) return Quat.IDENTITY
    return new Quat(this.w / l, this.x / l, this.y / l, this.z / l)
  }

  // Conjugué = inverse pour un quaternion UNITAIRE
  conjugate(): Quat {
    return new Quat(this.w, -this.x, -this.y, -this.z)
  }

  dot(o: Quat): number {
    return this.w * o.w + this.x * o.x + this.y * o.y + this.z * o.z
  }

  // Composition : this puis... non — applique d'abord `o`, puis `this`
  multiply(o: Quat): Quat {
    return new Quat(
      this.w*o.w - this.x*o.x - this.y*o.y - this.z*o.z,
      this.w*o.x + this.x*o.w + this.y*o.z - this.z*o.y,
      this.w*o.y - this.x*o.z + this.y*o.w + this.z*o.x,
      this.w*o.z + this.x*o.y - this.y*o.x + this.z*o.w,
    )
  }

  // Rotation d'un vecteur — formule optimisée équivalente à q·v·q⁻¹
  rotateVector(v: Vec3): Vec3 {
    const u = new Vec3(this.x, this.y, this.z)
    const uv = u.cross(v)
    const uuv = u.cross(uv)
    return v.add(uv.scale(2 * this.w)).add(uuv.scale(2))
  }
}
```

### 2.6 Slerp : interpolation sphérique

**Slerp** (Spherical Linear intERPolation) interpole deux rotations le long de l'arc de grand cercle qui les relie, à **vitesse angulaire constante** :

```
slerp(q0, q1, t) = ( sin((1−t)·Ω) / sin Ω )·q0  +  ( sin(t·Ω) / sin Ω )·q1
```

où `Ω = acos(q0 · q1)` est l'angle entre les deux quaternions. Deux garde-fous obligatoires :

1. **Chemin court.** Si `q0 · q1 < 0`, on nie `q1` (`−q1` = même rotation) pour interpoler sur l'arc court, pas le tour complet.
2. **Quasi-colinéaires.** Si `q0 · q1 ≈ 1`, `sin Ω ≈ 0` → division par ~0. On bascule alors sur un **nlerp** (lerp linéaire + normalisation), numériquement stable.

```ts
// slerp.ts — dans la classe Quat
slerp(o: Quat, t: number): Quat {
  let dot = this.dot(o)
  let target = o

  // 1. Chemin le plus court : q et -q sont la même rotation
  if (dot < 0) {
    target = new Quat(-o.w, -o.x, -o.y, -o.z)
    dot = -dot
  }

  // 2. Presque colinéaires → nlerp (évite division par ~0)
  if (dot > 0.9995) {
    return new Quat(
      this.w + t * (target.w - this.w),
      this.x + t * (target.x - this.x),
      this.y + t * (target.y - this.y),
      this.z + t * (target.z - this.z),
    ).normalize()
  }

  const omega = Math.acos(dot)      // angle entre les deux rotations
  const sinOmega = Math.sin(omega)
  const s0 = Math.sin((1 - t) * omega) / sinOmega
  const s1 = Math.sin(t * omega) / sinOmega

  return new Quat(
    s0 * this.w + s1 * target.w,
    s0 * this.x + s1 * target.x,
    s0 * this.y + s1 * target.y,
    s0 * this.z + s1 * target.z,
  )
}
```

C'est la brique qui fait tourner le globe TribuZen en douceur, sur l'arc le plus court, sans jamais se bloquer.

## 3. Worked examples

### Exemple 1 — Placer un pin sur le globe (model matrix SRT)

On modélise un pin à l'origine (espace modèle), puis on le place sur le globe : réduit à 20 %, orienté vers l'extérieur, poussé à la surface (rayon 1).

```ts
// place-pin.ts
const rad = (d: number) => (d * Math.PI) / 180

// Le pin doit apparaître à yaw=40° sur l'équateur du globe.
const yaw = rad(40)

// 1. Scale : le pin de base fait 1 unité, on le veut à 20 %
const scale = new Vec3(0.2, 0.2, 0.2)

// 2. Rotate : orienter le pin selon la longitude (autour de Y)
const rotation = rotationY(yaw)

// 3. Translate : le pousser à la surface. Sur l'équateur, à yaw=40°,
//    le point de surface (rayon 1) est (sin yaw, 0, cos yaw).
const position = new Vec3(Math.sin(yaw), 0, Math.cos(yaw))

// Model matrix = T · R · S (ordre SRT)
const model = buildModelMatrix(position, rotation, scale)

// Vérif : le sommet local (0,0,0) du pin doit atterrir sur la surface
const base = model.transformPoint(new Vec3(0, 0, 0))
console.log(base.toString()) // ≈ Vec3(0.643, 0.000, 0.766) = (sin40°, 0, cos40°)
```

Le pin est mis à l'échelle et orienté **à l'origine** (là où le scale et la rotation agissent proprement), puis translaté à sa position finale. Inverser T et S (translater avant de scaler) diviserait la position par 5 — le pin s'enfoncerait au centre du globe.

### Exemple 2 — Faire tourner le globe vers un pin, sans gimbal lock (slerp)

L'orientation du globe est un **quaternion**. On interpole de l'orientation courante vers celle qui amène le pin face à la caméra.

```ts
// spin-globe.ts
// Orientation actuelle du globe (identité = pin de longitude 0 face caméra)
let globe = Quat.IDENTITY

// L'utilisateur tape un pin à yaw=40°, pitch=70° (proche du pôle : Euler galèrerait)
const cible = Quat
  .fromAxisAngle(new Vec3(0, 1, 0), rad(40))          // longitude
  .multiply(Quat.fromAxisAngle(new Vec3(1, 0, 0), rad(70))) // latitude

// Boucle d'animation : slerp vers la cible, un pas par frame
function frame(alpha: number) {
  globe = globe.slerp(cible, alpha) // alpha = 0.12 par frame typiquement
  const orientation = globe.toString?.() ?? globe
  // On applique globe.rotateVector(...) à chaque pin pour le rendu
  return globe.rotateVector(new Vec3(0, 0, 1)) // direction "face caméra" du globe
}

// Simulation de 5 frames
let dir = new Vec3(0, 0, 1)
for (let i = 0; i < 5; i++) dir = frame(0.25)
// Le globe converge vers la cible sur l'arc le plus court,
// même avec un pitch de 70° qui aurait piégé les angles d'Euler.
```

Le slerp choisit automatiquement le chemin court (garde-fou `dot < 0`) et reste stable près de la cible (garde-fou nlerp). Aucun angle d'Euler n'est reconstruit → aucun gimbal lock possible.

## 4. Pièges & misconceptions

### PIÈGE #1 — Inverser l'ordre SRT

```ts
// ❌ T·S·R ou S·T : la translation est mise à l'échelle / l'objet orbite au lieu de tourner sur place
const wrong = scaleMatrix(0.2,0.2,0.2).multiply(translationMatrix(1,0,0))
// ✅ T·R·S — scale et rotation d'abord, à l'origine, translation en dernier
const right = translationMatrix(1,0,0).multiply(rotationY(theta)).multiply(scaleMatrix(0.2,0.2,0.2))
```

**Pourquoi c'est faux :** la matrice multiplie le vertex à droite ; ce qui est le plus à droite s'applique en premier. Mettre `S` à gauche de `T` scale la translation elle-même. Retiens : **la lecture SRT est l'ordre d'application ; l'écriture est l'inverse (T·R·S)**.

### PIÈGE #2 — Croire que `A·B = B·A`

La multiplication de matrices (et de quaternions) **n'est pas commutative**. `T·R` (tourne sur place puis déplace) ≠ `R·T` (déplace puis met en orbite). Toujours se demander : autour de quel centre veux-tu tourner ?

### PIÈGE #3 — Quaternion construit avec l'angle plein au lieu du demi-angle

```ts
// ❌ oubli du /2 : rotation deux fois trop grande
new Quat(Math.cos(theta), n.x*Math.sin(theta), n.y*Math.sin(theta), n.z*Math.sin(theta))
// ✅ demi-angle
Quat.fromAxisAngle(n, theta) // cos(θ/2), sin(θ/2)·n
```

**Pourquoi :** la rotation d'un vecteur est `q·v·q⁻¹`, qui applique l'effet **deux fois**. Le demi-angle compense. Symptôme typique : tout tourne du double de l'angle attendu.

### PIÈGE #4 — Slerp sans gérer le signe (chemin le plus long)

Sans le test `dot < 0`, slerp interpole parfois sur l'arc **complémentaire** : le globe fait presque un tour complet là où un petit arc suffisait. `q` et `−q` sont la même orientation ; il faut nier la cible quand le produit scalaire est négatif pour rester sur l'arc court.

### PIÈGE #5 — Oublier de renormaliser après des multiplications répétées

Les erreurs d'arrondi font dériver `|q|` loin de 1 après des dizaines de compositions. Un quaternion non unitaire n'est plus une rotation pure (il introduit une échelle parasite). **Renormalise** périodiquement (`q.normalize()`) dans une boucle d'animation longue.

### PIÈGE #6 — Confondre la model matrix et la view matrix

La **model** place l'objet dans le monde (modèle → monde). La **view** est l'**inverse** de la transformation de la caméra (monde → caméra). Les construire pareil (sans inverser pour la caméra) fait bouger la scène dans le mauvais sens. Détail traité au module 03.

## 5. Ancrage TribuZen

La couche **visualisation 3D** de TribuZen s'appuie directement sur ce module :

- **Placement des pins** (Exemple 1) — chaque sortie de la famille est un pin posé à la surface du globe via une model matrix SRT : `scale` (taille du pin selon l'importance de la sortie), `rotationY`/`rotationAxis` (longitude/latitude), `translation` (surface du globe). C'est le passage **espace modèle → espace monde** pour chaque instance.
- **Rotation du globe** (Exemple 2) — l'orientation du globe est stockée en **quaternion** dans le state du composant. Taper un pin lance un **slerp** vers la cible : le globe pivote sur l'arc le plus court, sans gimbal lock même pour les sorties proches des pôles.
- **Badge/trophée 3D** (modules suivants) — les trophées de la famille tournent en boucle via `Quat.fromAxisAngle(UP, t)` : rotation continue, stable, renormalisée.

Fichiers cibles dans `smaurier/tribuzen` :

```
tribuzen/
  src/
    viz/
      globe/
        placePin.ts        ← model matrix SRT (Exemple 1)
        globeOrientation.ts ← quaternion + slerp (Exemple 2)
      math/
        Quat.ts            ← axe-angle, multiply, slerp
```

> La caméra qui regarde le globe (view + projection) relève du **module 03 (caméras et projections)**. Ici on reste sur la transformation des objets (model) et leur orientation (quaternion).

## 6. Points clés

1. Translation / échelle / rotation sont trois matrices 4x4 sur coordonnées homogènes ; une direction (`w:0`) ignore la translation.
2. La model matrix se compose en **T·R·S** : lecture SRT (scale, rotate, translate), écriture inversée.
3. La multiplication de matrices (et de quaternions) **n'est pas commutative** — l'ordre choisit le centre de rotation.
4. La model matrix fait le pont **espace modèle → espace monde** ; la view (inverse caméra) et la projection suivent.
5. Les **angles d'Euler** souffrent du **gimbal lock** : à ±90° sur l'axe du milieu, deux axes s'alignent et un degré de liberté disparaît.
6. Un **quaternion unitaire** encode une rotation via l'**axe-angle** avec le **demi-angle** : `(cos(θ/2), sin(θ/2)·n)`.
7. `q` et `−q` sont la même rotation (double couverture) — d'où le test de signe dans slerp.
8. **Slerp** interpole deux rotations à vitesse angulaire constante sur l'arc court ; garde-fou nlerp quand les quaternions sont quasi colinéaires.

## 7. Seeds Anki

```
Dans quel ordre s'écrit une model matrix SRT et pourquoi ?|On écrit T·R·S (inverse de la lecture SRT). La matrice multiplie le vertex à droite, donc S (le plus à droite) s'applique en premier : scale et rotation à l'origine, translation en dernier. Écrire S à gauche de T mettrait la translation à l'échelle.
Pourquoi T·R n'est-il pas égal à R·T ?|La multiplication de matrices n'est pas commutative. T·R fait tourner l'objet sur son propre centre puis le déplace ; R·T le déplace puis le fait tourner autour de l'origine du monde (orbite).
Qu'est-ce que le gimbal lock ?|Avec des angles d'Euler, quand l'angle du milieu atteint ±90°, deux des trois axes de rotation s'alignent. On perd un degré de liberté : deux angles produisent la même rotation et l'interpolation devient instable.
Comment construit-on un quaternion unitaire depuis un axe n et un angle θ ?|q = (cos(θ/2), sin(θ/2)·n.x, sin(θ/2)·n.y, sin(θ/2)·n.z). On utilise le DEMI-angle car la rotation q·v·q⁻¹ applique l'effet deux fois.
Pourquoi q et -q représentent-ils la même rotation ?|Double couverture : les quaternions unitaires recouvrent deux fois le groupe des rotations. Nier les 4 composantes donne la même orientation. C'est pourquoi slerp teste le signe du produit scalaire pour prendre l'arc le plus court.
Qu'apporte slerp par rapport à un lerp d'angles d'Euler ?|Slerp interpole deux rotations à vitesse angulaire constante sur l'arc de grand cercle le plus court, sans gimbal lock. Le lerp d'Euler donne une vitesse irrégulière et peut se bloquer/sauter près des pôles.
Quels deux garde-fous doit contenir une implémentation correcte de slerp ?|1) Si dot(q0,q1) < 0, nier q1 pour rester sur le chemin court. 2) Si dot ≈ 1 (quasi colinéaires), basculer sur nlerp (lerp + normalize) pour éviter la division par sin(Ω) ≈ 0.
Quelle est la différence entre model matrix et view matrix ?|La model place l'objet dans le monde (espace modèle → monde). La view est l'inverse de la transformation de la caméra (monde → espace caméra). Position finale d'un vertex : P·V·M·v_local.
```

## Pont vers le lab

> Lab associé : `labs/lab-02-transformations-et-quaternions/README.md`. Composer une model matrix SRT pour placer un objet, puis orienter et interpoler cet objet avec un quaternion + slerp — code exécuté dans le navigateur, corrigé commenté intégral.
