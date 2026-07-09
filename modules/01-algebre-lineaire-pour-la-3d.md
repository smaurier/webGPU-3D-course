---
titre: Algèbre linéaire pour la 3D
cours: 20-webgpu-3d
notions: ["vecteurs 2D/3D/4D", "addition/soustraction/échelle", "longueur et normalisation", "produit scalaire (dot)", "angle et projection", "produit vectoriel (cross)", "normale de surface", "matrices 4x4", "multiplication de matrices", "matrice identité", "matrice transposée", "coordonnées homogènes (w)", "column-major", "Float32Array pour le GPU"]
outcomes:
  - "sait manipuler des vecteurs 2D/3D/4D (addition, soustraction, échelle, normalisation)"
  - "sait calculer un produit scalaire et l'utiliser pour un angle et une projection"
  - "sait calculer un produit vectoriel pour obtenir la normale d'une surface"
  - "sait multiplier deux matrices 4x4 et transformer un point via coordonnées homogènes"
  - "sait distinguer matrice identité et transposée, et exporter en Float32Array pour le GPU"
prerequis: [00-prerequis-et-introduction]
next: 02-transformations-et-quaternions
libs: []
tribuzen: "moteur 3D TribuZen — algèbre du positionnement des points de sortie de la famille sur un globe interactif"
last-reviewed: 2026-07
---

# Algèbre linéaire pour la 3D

> **Outcomes — tu sauras FAIRE :** manipuler des vecteurs (add, sub, scale, normalize), calculer un produit scalaire (angle, projection) et un produit vectoriel (normale), multiplier des matrices 4x4 et transformer un point en coordonnées homogènes.
> **Difficulté :** :star::star::star:
>
> **Portée :** ce module couvre les **briques mathématiques** — vecteurs, produits, matrices. Les matrices de **transformation concrètes** (translation, rotation via `sin`/`cos`, échelle) et les **quaternions** sont le sujet du **module 02**. Les matrices **caméra/projection** (view, perspective) sont le **module 03**. Ici on construit l'outillage `Vec3`/`Mat4` que tous les modules suivants vont réutiliser.

## 1. Cas concret d'abord

TribuZen veut afficher un **globe interactif** : chaque sortie passée de la famille (un pique-nique à Lyon, une rando dans le Vercors) devient un **point lumineux posé à sa latitude/longitude** sur une sphère 3D. Quand l'utilisateur fait tourner le globe, chaque point doit rester collé à sa position, s'orienter correctement, et s'illuminer plus fort quand il fait face à la caméra.

Rien de tout ça ne marche sans algèbre linéaire. Regarde les trois questions que pose une seule sortie :

```ts
// Une sortie de la famille, projetée sur le globe (rayon 1)
// latitude/longitude → position 3D sur la sphère (on verra la formule au §3)
const sortie = { lat: 45.76, lon: 4.83, label: 'Pique-nique Parc de la Tête d\'Or' }

// Q1 — Où est ce point dans l'espace 3D ? → un VECTEUR position (x, y, z)
// Q2 — Ce point fait-il face à la caméra (visible) ou est-il derrière le globe (caché) ?
//      → un PRODUIT SCALAIRE entre la normale du point et la direction caméra
// Q3 — Quand on fait tourner le globe de 30°, où va le point ?
//      → une MULTIPLICATION MATRICE × VECTEUR
```

**Trois outils, un par question :**
1. **Vecteur** — représenter une position et une direction (Q1).
2. **Produit scalaire** — mesurer un angle, décider ce qui est visible (Q2).
3. **Matrice 4x4** — appliquer une rotation/translation à un point (Q3).

Ce module construit ces trois outils en TypeScript, dans des classes `Vec3` et `Mat4` réutilisables par tout le reste du cours. À la fin, tu sauras écrire le code qui pose un point sur le globe et décide s'il est visible.

---

## 2. Théorie complète, concise

### 2.1 Vecteur : direction + magnitude

Un **vecteur** encode une **direction** et une **longueur** (magnitude). Ce n'est pas une position figée : le même vecteur `(4, 3, 0)` signifie toujours « 4 à droite, 3 en haut » d'où qu'il parte. En 3D il a 3 composantes `(x, y, z)` ; en 2D deux ; en 4D quatre (la 4e, `w`, sert aux coordonnées homogènes — §2.7).

**Point vs vecteur** : un *point* est une position (`w = 1`), un *vecteur* est un déplacement/direction (`w = 0`). La distinction devient cruciale avec les matrices (§2.7).

Convention du cours : **Y vers le haut**, **-Z vers l'avant** (WebGL/WebGPU/Three.js). Certains moteurs (Blender, Unreal) utilisent Z-up — d'où beaucoup de bugs d'import.

### 2.2 Opérations composante par composante

Addition, soustraction et mise à l'échelle se font **composante par composante** :

```ts
// a + b : additionne chaque composante
(ax + bx, ay + by, az + bz)
// a - b : le vecteur qui va de b vers a
(ax - bx, ay - by, az - bz)
// k * a : allonge (k>1) / raccourcit (k<1) / inverse (k<0) sans changer l'axe
(k*ax, k*ay, k*az)
```

Cas d'usage clé : `b - a` donne le **vecteur de a vers b**. Pour aller « du centre du globe vers un point de sortie », c'est `sortie - centre`.

### 2.3 Longueur et normalisation

La **longueur** (norme) est le théorème de Pythagore en 3D :

```
|v| = sqrt(x² + y² + z²)
```

Un vecteur **normalisé** (unitaire) garde sa direction mais a une longueur de 1 : on divise chaque composante par la longueur.

```
v_normalisé = v / |v|      (indéfini si |v| = 0)
```

On normalise **toute direction** (direction de lumière, normale de surface, axe de rotation) pour que sa « force » ne dépende que de son orientation, pas de sa longueur.

> **Astuce perf :** comparer des distances ne nécessite pas `sqrt`. Utilise `lengthSquared()` (`x² + y² + z²`) et compare au carré du seuil. `sqrt` est coûteux, surtout en boucle.

### 2.4 Produit scalaire (dot product) — retourne un NOMBRE

Le produit scalaire prend deux vecteurs et rend un **scalaire** (un nombre), pas un vecteur :

```
a · b = ax*bx + ay*by + az*bz          (par composantes)
a · b = |a| * |b| * cos(θ)             (géométrique)
```

Si `a` et `b` sont **normalisés**, alors `a · b = cos(θ)` directement. C'est l'opération la plus utilisée en 3D. Trois lectures :

| `a · b` (normalisés) | angle θ | signification |
|---|---|---|
| `> 0` | `< 90°` | même sens général |
| `= 0` | `= 90°` | perpendiculaires |
| `< 0` | `> 90°` | sens opposés |

**Trois usages** :
- **Angle** : `θ = acos(clamp(a·b, -1, 1))` (le clamp évite les `NaN` d'arrondi).
- **Visibilité / backface** : la face regarde la caméra si `normale · versLaCaméra > 0`.
- **Éclairage diffus (Lambert)** : intensité `= max(0, N · L)` où `N` = normale, `L` = direction vers la lumière.
- **Projection** de `a` sur `b` : `proj = (a·b / b·b) * b`.

### 2.5 Produit vectoriel (cross product) — retourne un VECTEUR

Le produit vectoriel prend deux vecteurs et rend un **troisième vecteur perpendiculaire aux deux** :

```
(a × b).x = ay*bz - az*by
(a × b).y = az*bx - ax*bz
(a × b).z = ax*by - ay*bx
```

Usage central : la **normale d'un triangle**. À partir de deux arêtes `e1 = v1 - v0` et `e2 = v2 - v0`, la normale est `(e1 × e2).normalize()`.

**L'ordre compte** : `a × b = -(b × a)`. La direction suit la **règle de la main droite** (index = a, majeur = b, pouce = a×b). L'ordre des sommets d'un triangle (**winding order**) détermine donc de quel côté pointe sa normale — en WebGL/WebGPU, le sens **counter-clockwise** est « face avant » par défaut.

### 2.6 Matrices 4x4 : le moteur des transformations

Une matrice est une grille de nombres qui encode une **transformation** appliquée à un vecteur. En 3D on utilise du **4x4** (16 nombres) car une 3x3 gère rotation et échelle mais **pas la translation** — celle-ci exige la 4e dimension (§2.7).

Structure d'une matrice de transformation :

```
| Rx  Ux  Fx  Tx |     colonnes 0-2 : base (rotation + échelle)
| Ry  Uy  Fy  Ty |     R = axe X transformé, U = axe Y, F = axe Z
| Rz  Uz  Fz  Tz |     colonne 3 (Tx,Ty,Tz) : translation
|  0   0   0   1 |     dernière ligne : [0,0,0,1] (transfo affine)
```

**Matrice identité** — la transformation « qui ne change rien » (l'équivalent de `transform: none` en CSS) : des 1 sur la diagonale, 0 ailleurs. `Identité × v = v`.

**Multiplication `M × v`** : chaque ligne de `M` « pèse » les composantes de `v`. Pour un vecteur 4D :

```
résultat.i = M[ligne i] · v
```

**Multiplication `A × B`** : combine deux transformations en une seule. **L'ordre compte** : `A × B ≠ B × A`. Convention : la matrice de droite s'applique **en premier** au vecteur. `Model × v` puis `View × (Model × v)` = `(View × Model) × v`.

**Transposée** — on échange lignes et colonnes (`Mᵀ[i][j] = M[j][i]`). Utile pour convertir entre conventions row/column-major, et pour la matrice des normales (`inverse-transpose` de la model matrix).

### 2.7 Coordonnées homogènes : la 4e composante `w`

On étend `(x, y, z)` en `(x, y, z, w)` :

```
Point 3D   → (x, y, z, 1)    w = 1   (translatable)
Vecteur 3D → (x, y, z, 0)    w = 0   (direction : NON translatable)
```

Avec `w = 1`, la colonne de translation d'une matrice s'ajoute (le point bouge). Avec `w = 0`, elle est **ignorée** (une direction n'a pas de position). C'est exactement pour ça qu'un point et une direction se transforment différemment.

Après une projection perspective (module 03), `w ≠ 1` : on fait le **perspective divide** (`x/w, y/w, z/w`) pour revenir en 3D.

### 2.8 Column-major et Float32Array pour le GPU

WebGL/WebGPU stockent les matrices en **column-major** : les colonnes sont contiguës en mémoire.

```
Matrice logique :          Float32Array (column-major) :
| m0  m4  m8  m12 |        [m0,m1,m2,m3,   ← colonne 0
| m1  m5  m9  m13 |         m4,m5,m6,m7,   ← colonne 1
| m2  m6  m10 m14 |         m8,m9,m10,m11, ← colonne 2
| m3  m7  m11 m15 |         m12,m13,m14,m15] ← colonne 3 (translation)
```

C'est l'**inverse** de la convention row-major des maths classiques — source n°1 de bugs. On stocke `Mat4` directement en column-major → zéro conversion pour l'envoyer au GPU via un `Float32Array` de 16 flottants (64 octets).

> **Alignement WGSL :** un `mat4x4<f32>` s'aligne sur 16 octets ; un `vec3<f32>` est en réalité padé à 16 octets (4 flottants). À garder en tête pour les uniform buffers (module 10).

---

## 3. Worked examples

### Exemple 1 — La classe `Vec3` (cœur du moteur)

```ts
// vec3.ts — vecteur 3D immuable (chaque opération renvoie un nouveau Vec3)
class Vec3 {
  constructor(
    public readonly x: number,
    public readonly y: number,
    public readonly z: number,
  ) {}

  static readonly ZERO = new Vec3(0, 0, 0)
  static readonly UP = new Vec3(0, 1, 0)
  static readonly FORWARD = new Vec3(0, 0, -1) // -Z devant (WebGL/WebGPU)

  add(o: Vec3): Vec3 { return new Vec3(this.x + o.x, this.y + o.y, this.z + o.z) }
  sub(o: Vec3): Vec3 { return new Vec3(this.x - o.x, this.y - o.y, this.z - o.z) }
  scale(k: number): Vec3 { return new Vec3(this.x * k, this.y * k, this.z * k) }

  lengthSquared(): number { return this.x ** 2 + this.y ** 2 + this.z ** 2 }
  length(): number { return Math.sqrt(this.lengthSquared()) }

  normalize(): Vec3 {
    const len = this.length()
    return len === 0 ? Vec3.ZERO : this.scale(1 / len)
  }

  // dot : NOMBRE. |a||b|cos θ. Angle, projection, visibilité.
  dot(o: Vec3): number { return this.x * o.x + this.y * o.y + this.z * o.z }

  // cross : VECTEUR perpendiculaire. Normale de surface. a×b = -(b×a).
  cross(o: Vec3): Vec3 {
    return new Vec3(
      this.y * o.z - this.z * o.y,
      this.z * o.x - this.x * o.z,
      this.x * o.y - this.y * o.x,
    )
  }

  // Angle en radians entre deux vecteurs. clamp obligatoire : sinon acos(1.0000001) = NaN.
  angleTo(o: Vec3): number {
    const d = this.normalize().dot(o.normalize())
    return Math.acos(Math.max(-1, Math.min(1, d)))
  }

  // Vers le GPU : (x, y, z) ou (x, y, z, w)
  toArray(): Float32Array { return new Float32Array([this.x, this.y, this.z]) }
  toArray4(w = 1): Float32Array { return new Float32Array([this.x, this.y, this.z, w]) }
}
```

Vérification rapide dans la console :

```ts
console.log(new Vec3(3, 4, 0).length())          // 5   (triangle 3-4-5)
console.log(new Vec3(3, 4, 0).normalize())       // Vec3(0.6, 0.8, 0)
console.log(Vec3.UP.dot(new Vec3(0, 1, 0)))      // 1   (même direction)
console.log(Vec3.UP.dot(new Vec3(1, 0, 0)))      // 0   (perpendiculaires)
```

### Exemple 2 — Poser un point de sortie sur le globe et décider s'il est visible

Le cas concret du §1, entièrement résolu. On projette lat/lon sur une sphère de rayon 1, puis on teste la visibilité avec un **produit scalaire**.

```ts
// globe.ts — algèbre du positionnement TribuZen

// lat/lon (degrés) → position 3D sur la sphère unité (Y-up)
function latLonToVec3(latDeg: number, lonDeg: number): Vec3 {
  const lat = (latDeg * Math.PI) / 180
  const lon = (lonDeg * Math.PI) / 180
  // Y = haut/bas (latitude), le plan XZ = équateur (longitude)
  return new Vec3(
    Math.cos(lat) * Math.sin(lon), // x
    Math.sin(lat),                 // y
    Math.cos(lat) * Math.cos(lon), // z
  )
}

// Un point sur une sphère unité EST sa propre normale (centre = origine) :
// la direction centre→point coïncide avec la normale de surface.
function estVisible(pointSurGlobe: Vec3, positionCamera: Vec3): boolean {
  const normale = pointSurGlobe.normalize()      // sphère unité → déjà ~unitaire
  const versCamera = positionCamera.sub(pointSurGlobe).normalize()
  // dot > 0 : la face du globe à cet endroit regarde la caméra → visible
  return normale.dot(versCamera) > 0
}

// --- Test avec une vraie sortie ---
const sortie = latLonToVec3(45.76, 4.83)         // Lyon
const camera = new Vec3(0, 0, 5)                 // caméra devant, sur +Z

console.log(sortie.toArray())                    // position à uploader au GPU
console.log(estVisible(sortie, camera))          // true si Lyon fait face à la caméra
```

Pas-à-pas de `estVisible` :
1. `pointSurGlobe.normalize()` → la normale (le point sur une sphère de rayon 1 pointe déjà « vers l'extérieur »).
2. `positionCamera.sub(pointSurGlobe)` → le vecteur du point vers la caméra ; `.normalize()` pour ne garder que la direction.
3. `normale.dot(versCamera)` → `cos θ`. Positif = angle aigu = même côté = **visible**. Négatif = point derrière le globe = **caché**.

### Exemple 3 — Multiplier deux matrices 4x4

```ts
// mat4.ts — column-major, prêt pour le GPU
class Mat4 {
  constructor(public readonly data = new Float32Array(16)) {}

  static identity(): Mat4 {
    const m = new Mat4()
    m.data[0] = 1; m.data[5] = 1; m.data[10] = 1; m.data[15] = 1
    return m
  }

  // this × other. Boucle triple : pour chaque (col, row), somme sur k.
  // Index column-major : élément (row, col) = data[col*4 + row].
  multiply(other: Mat4): Mat4 {
    const a = this.data, b = other.data
    const r = new Float32Array(16)
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 4; row++) {
        let sum = 0
        for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k]
        r[col * 4 + row] = sum
      }
    }
    return new Mat4(r)
  }

  // M × (x, y, z, w). w=1 pour un point (translation appliquée), w=0 pour une direction.
  transformPoint(p: Vec3): Vec3 {
    const m = this.data
    const x = m[0] * p.x + m[4] * p.y + m[8]  * p.z + m[12]
    const y = m[1] * p.x + m[5] * p.y + m[9]  * p.z + m[13]
    const z = m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14]
    const w = m[3] * p.x + m[7] * p.y + m[11] * p.z + m[15]
    return w !== 0 && w !== 1 ? new Vec3(x / w, y / w, z / w) : new Vec3(x, y, z)
  }
}

// Vérification : Identité × Identité = Identité
const i = Mat4.identity()
console.log(i.multiply(i).data.join(',')) // 1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1

// Identité ne bouge pas un point
console.log(i.transformPoint(new Vec3(2, 3, 4))) // Vec3(2, 3, 4)
```

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Confondre `dot` (nombre) et `cross` (vecteur)

`a.dot(b)` retourne un **scalaire** (angle, projection, visibilité). `a.cross(b)` retourne un **vecteur** (normale, perpendiculaire). Les deux prennent deux vecteurs mais ne répondent pas à la même question. Réflexe : « je veux un angle/une intensité » → dot ; « je veux une direction perpendiculaire » → cross.

### PIÈGE #2 — `a × b` n'est pas commutatif

`a × b = -(b × a)`. Inverser l'ordre des deux arêtes d'un triangle **retourne sa normale**, donc le triangle passe de face-avant à face-arrière (backface culling). Un modèle qui apparaît « à l'envers » ou dont les faces disparaissent vient presque toujours d'un mauvais **winding order**.

### PIÈGE #3 — `acos` sans clamp → `NaN`

`a.normalize().dot(b.normalize())` devrait être dans `[-1, 1]`, mais les arrondis flottants donnent parfois `1.0000000002`. `Math.acos(1.0000000002)` renvoie `NaN`. **Toujours** clamper : `acos(max(-1, min(1, d)))`.

### PIÈGE #4 — Oublier le `w` : point vs vecteur

Transformer une **direction** (normale, axe) avec `w = 1` lui ajoute par erreur la translation de la matrice → la direction est faussée. Une direction se transforme avec `w = 0` (`transformVector`), un point avec `w = 1` (`transformPoint`). Symptôme classique : normales qui « dérivent » quand l'objet est déplacé.

### PIÈGE #5 — Row-major vs column-major

Les maths écrivent les matrices en row-major ; WebGL/WebGPU les stockent en **column-major**. Copier un `Float32Array` sans tenir compte de ça donne une matrice **transposée** — l'objet part en biais ou disparaît. Règle : l'élément `(row, col)` est à `data[col * 4 + row]`, et la **translation** vit aux indices `12, 13, 14`.

### PIÈGE #6 — Ordre de multiplication des matrices

`A × B ≠ B × A`. `translation × rotation` fait tourner **autour de la nouvelle origine**, `rotation × translation` fait le contraire. La matrice de **droite** s'applique en premier au vecteur. Un objet qui orbite au lieu de tourner sur lui-même = ordre inversé.

---

## 5. Ancrage TribuZen

Le **globe interactif des sorties** est la première feature 3D de TribuZen, et c'est de l'algèbre linéaire pure :

- **Positionner une sortie** — `latLonToVec3(lat, lon)` (Exemple 2) transforme chaque sortie enregistrée en une **position `Vec3`** sur la sphère. Ces positions partent au GPU via `toArray()`.
- **Décider ce qui est visible** — `estVisible()` utilise un **produit scalaire** normale·caméra pour n'illuminer que les points de l'hémisphère face à l'utilisateur (les autres sont derrière le globe).
- **Faire tourner le globe** — la rotation utilisateur est une **`Mat4`** ; chaque frame, chaque point de sortie passe par `transformPoint()`. La matrice de rotation elle-même est construite au **module 02**.
- **Orienter un pin/badge** — le **produit vectoriel** donne un repère local à chaque point (tangente au globe) pour poser un pin « debout » sur la surface.

Fichiers cibles dans `smaurier/tribuzen` :

```
tribuzen/
  src/
    three/
      math/
        Vec3.ts          ← Exemple 1
        Mat4.ts          ← Exemple 3
      globe/
        latLonToVec3.ts  ← Exemple 2 (positionnement des sorties)
        visibility.ts    ← estVisible() (produit scalaire)
```

> La construction des matrices de rotation/translation concrètes (via `sin`/`cos`) est le **module 02**. Ici on a l'algèbre ; là-bas on fabrique les transformations.

---

## 6. Points clés

1. Un **vecteur** encode direction + longueur ; add/sub/scale se font composante par composante ; `b - a` = vecteur de a vers b.
2. **Normaliser** (`v / |v|`) rend un vecteur de longueur 1 — obligatoire pour toute direction, normale ou axe.
3. Le **produit scalaire** `a·b` retourne un **nombre** = `|a||b|cos θ` — angle, projection, visibilité, éclairage diffus.
4. Le **produit vectoriel** `a×b` retourne un **vecteur** perpendiculaire — normale de surface ; `a×b = -(b×a)`, l'ordre compte.
5. Une **matrice 4x4** encode une transformation ; **identité** ne change rien ; **transposée** échange lignes/colonnes.
6. La **multiplication** de matrices combine des transformations et **n'est pas commutative** ; la matrice de droite s'applique en premier.
7. Les **coordonnées homogènes** distinguent point (`w=1`, translatable) et vecteur (`w=0`, non translatable).
8. WebGL/WebGPU stockent en **column-major** ; un `Mat4` en column-major s'envoie tel quel au GPU en `Float32Array` (16 flottants, 64 octets).

---

## 7. Seeds Anki

```
Que retourne le produit scalaire a·b, et à quoi sert-il ?|Un NOMBRE (scalaire) = |a|*|b|*cos θ. Si a et b sont normalisés, a·b = cos θ. Sert à mesurer un angle, projeter un vecteur, tester la visibilité (backface), calculer l'éclairage diffus max(0, N·L).
Que retourne le produit vectoriel a×b, et quelle est sa propriété d'ordre ?|Un VECTEUR perpendiculaire aux deux (règle de la main droite). Usage principal : la normale d'une surface via (e1 × e2). Non commutatif : a×b = -(b×a), donc l'ordre des sommets (winding) détermine la direction de la normale.
Pourquoi utilise-t-on des matrices 4x4 et pas 3x3 en 3D ?|Une 3x3 gère rotation et échelle mais PAS la translation. La translation nécessite la 4e dimension (coordonnées homogènes) : la colonne de translation ne s'ajoute que si w=1.
Quelle est la différence entre coordonnées homogènes w=1 et w=0 ?|w=1 = un POINT : la translation de la matrice s'applique (le point bouge). w=0 = un VECTEUR/direction : la translation est ignorée (une direction n'a pas de position). Transformer une normale avec w=1 la fausse.
Pourquoi faut-il clamper avant Math.acos pour un angle entre vecteurs ?|acos attend une entrée dans [-1, 1]. Les arrondis flottants peuvent donner 1.0000000002, et acos hors domaine renvoie NaN. On écrit acos(max(-1, min(1, a·b))).
Qu'est-ce que le column-major et pourquoi est-ce important pour le GPU ?|Les colonnes de la matrice sont contiguës en mémoire (convention WebGL/WebGPU), l'inverse du row-major mathématique. Un Mat4 stocké en column-major s'envoie tel quel au GPU en Float32Array sans conversion. L'élément (row, col) est à data[col*4 + row], la translation aux indices 12/13/14.
La multiplication de matrices est-elle commutative ? Quelle matrice s'applique en premier ?|Non : A×B ≠ B×A. La matrice de DROITE s'applique en premier au vecteur. translation×rotation ≠ rotation×translation (orbiter vs tourner sur soi-même).
Comment obtient-on la normale d'un triangle (v0, v1, v2) ?|On prend deux arêtes e1 = v1 - v0 et e2 = v2 - v0, puis normale = (e1 × e2).normalize(). Inverser l'ordre des arêtes inverse la normale.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-01-algebre-lineaire-pour-la-3d/README.md`. Coder `Vec3` (add/sub/scale/normalize/dot/cross) et une `Mat4.multiply`, puis vérifier chaque opération à la main dans la console d'un navigateur — zéro harnais, corrigé commenté intégral.
