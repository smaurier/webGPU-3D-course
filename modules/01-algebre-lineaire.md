# 01 — Algebre lineaire pour la 3D

| Difficulte | Duree estimee | Lab | Quiz |
|:----------:|:-------------:|:---:|:----:|
| 2.5/5      | 90 min        | [Lab 01](../labs/lab-01-algebre-lineaire/) | [Quiz 01](../quizzes/quiz-01-algebre-lineaire.html) |

## Objectifs pedagogiques

A la fin de ce module, vous serez capable de :

- Manipuler des vecteurs 2D, 3D et 4D (addition, soustraction, echelle, normalisation)
- Calculer le produit scalaire (dot product) et expliquer son utilite (projection, angle, backface culling)
- Calculer le produit vectoriel (cross product) pour obtenir la normale d'un plan
- Construire et multiplier des matrices 4x4
- Expliquer les coordonnees homogenes (w=1 pour les points, w=0 pour les vecteurs)
- Implementer des classes `Vec3` et `Mat4` completes en TypeScript
- Convertir ces structures vers `Float32Array` pour l'envoi au GPU

---

<details>
<summary>Rappel du module precedent</summary>

- Le GPU est optimise pour le **throughput** (milliers de cores simples en parallele)
- WebGPU utilise des **descripteurs immutables** (pas d'etat global comme WebGL)
- Three.js est une **abstraction** au-dessus de WebGL/WebGPU (comme Vue.js au-dessus du DOM)
- La boucle de rendu utilise `requestAnimationFrame` avec un **deltaTime**
- Le **device pixel ratio** assure un rendu net sur les ecrans HiDPI
- Minimiser les transferts CPU → GPU via le bus PCIe

</details>

---

## Analogie : l'algebre lineaire c'est le CSS de la 3D

:::tip Analogie pour developpeurs Vue.js
En CSS, vous positionnez des elements avec `translate`, `rotate`, `scale` et `transform-origin`. En 3D, c'est exactement la meme chose, mais avec des **vecteurs** et des **matrices**.

| CSS | 3D |
|-----|-----|
| `transform: translate(10px, 20px)` | `vec3(10, 20, 0)` |
| `transform: rotate(45deg)` | Matrice de rotation |
| `transform: scale(2)` | Matrice d'echelle |
| `transform-origin` | Origine locale de l'objet |
| `transform: translate() rotate() scale()` | Multiplication de matrices (dans l'ordre inverse !) |

La difference : en CSS, le navigateur fait les maths pour vous. En 3D, c'est vous qui les implementez.
:::

---

## Du prerequis a l'algebre lineaire

Au module prerequis (Lab 00), vous avez decouvert les vecteurs de maniere intuitive :

- Un **vecteur** est une fleche avec une direction et une longueur
- Le **produit scalaire** (`dotProduct2D(a, b)`) mesure a quel point deux vecteurs "vont dans le meme sens"
- Les **operations de base** (addition, soustraction, mise a l'echelle) se font composante par composante
- Les **proportions** et l'interpolation lineaire permettent de melanger deux valeurs

Tout cela, vous l'avez ecrit avec des tableaux simples (`number[]`) et des fonctions libres. C'etait parfait pour comprendre les concepts.

Maintenant, on va **formaliser** ces idees dans du code TypeScript reutilisable. Au module prerequis vous avez ecrit `dotProduct2D(a, b)` avec des tableaux. Maintenant on va structurer ca proprement avec des classes `Vec3` et `Mat4` qui encapsulent les donnees et les operations. Cela nous donne :

- La **securite du typage** : impossible de passer accidentellement un Vec2 la ou on attend un Vec3
- Le **chainage** : `a.sub(b).normalize().dot(c)` se lit naturellement
- La **3eme dimension** : on passe de `[x, y]` a `(x, y, z)` — et meme `(x, y, z, w)` pour les coordonnees homogenes

:::tip Vous avez deja les bases
Si vous avez reussi le Lab 00, vous avez deja toutes les bases necessaires. Ce module ajoute la rigueur mathematique et la 3eme dimension, mais les principes restent les memes. Le dot product en 3D, c'est juste un terme de plus : `a.x*b.x + a.y*b.y + a.z*b.z`.
:::

---

## Vecteurs : les briques de base

Un vecteur represente une **direction** et une **magnitude** (longueur). En 3D, il a 3 composantes : x, y, z.

### Representation TypeScript

```typescript
// ── vec3.ts ─────────────────────────────────────────────

/**
 * Vecteur 3D immutable.
 *
 * Convention : Y pointe vers le haut (comme Three.js et la plupart des outils 3D web).
 * Certains moteurs (Unity, Unreal) utilisent Z-up.
 */
class Vec3 {
  constructor(
    public readonly x: number,
    public readonly y: number,
    public readonly z: number,
  ) {}

  // ── Constantes utiles ────────────────────────────────
  static readonly ZERO = new Vec3(0, 0, 0);
  static readonly ONE = new Vec3(1, 1, 1);
  static readonly UP = new Vec3(0, 1, 0);
  static readonly DOWN = new Vec3(0, -1, 0);
  static readonly RIGHT = new Vec3(1, 0, 0);
  static readonly LEFT = new Vec3(-1, 0, 0);
  static readonly FORWARD = new Vec3(0, 0, -1); // Convention WebGL/WebGPU : -Z = devant
  static readonly BACK = new Vec3(0, 0, 1);

  // ── Operations de base ───────────────────────────────

  /** Addition : a + b */
  add(other: Vec3): Vec3 {
    return new Vec3(
      this.x + other.x,
      this.y + other.y,
      this.z + other.z,
    );
  }

  /** Soustraction : a - b */
  sub(other: Vec3): Vec3 {
    return new Vec3(
      this.x - other.x,
      this.y - other.y,
      this.z - other.z,
    );
  }

  /** Multiplication par un scalaire */
  scale(factor: number): Vec3 {
    return new Vec3(
      this.x * factor,
      this.y * factor,
      this.z * factor,
    );
  }

  /** Negation : -v */
  negate(): Vec3 {
    return new Vec3(-this.x, -this.y, -this.z);
  }

  /** Multiplication composante par composante (Hadamard) */
  multiply(other: Vec3): Vec3 {
    return new Vec3(
      this.x * other.x,
      this.y * other.y,
      this.z * other.z,
    );
  }

  // ── Longueur et normalisation ────────────────────────

  /** Longueur au carre (evite sqrt, utile pour les comparaisons) */
  lengthSquared(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  /** Longueur (magnitude) du vecteur */
  length(): number {
    return Math.sqrt(this.lengthSquared());
  }

  /** Vecteur normalise (longueur = 1) */
  normalize(): Vec3 {
    const len = this.length();
    if (len === 0) return Vec3.ZERO;
    return this.scale(1 / len);
  }

  /** Distance entre deux points */
  distanceTo(other: Vec3): number {
    return this.sub(other).length();
  }

  // ── Produit scalaire (dot product) ───────────────────

  /**
   * Produit scalaire : a · b = |a| * |b| * cos(θ)
   *
   * Retourne un SCALAIRE (nombre), pas un vecteur.
   *
   * Utilisations :
   * - Angle entre deux vecteurs
   * - Projection d'un vecteur sur un autre
   * - Backface culling (la face regarde-t-elle la camera ?)
   */
  dot(other: Vec3): number {
    return this.x * other.x + this.y * other.y + this.z * other.z;
  }

  // ── Produit vectoriel (cross product) ────────────────

  /**
   * Produit vectoriel : a × b
   *
   * Retourne un VECTEUR perpendiculaire aux deux vecteurs d'entree.
   *
   * Utilisations :
   * - Calculer la normale d'un triangle
   * - Determiner l'orientation (gauche/droite)
   * - Construire un repere orthogonal
   *
   * ATTENTION : a × b ≠ b × a (a × b = -(b × a))
   */
  cross(other: Vec3): Vec3 {
    return new Vec3(
      this.y * other.z - this.z * other.y,
      this.z * other.x - this.x * other.z,
      this.x * other.y - this.y * other.x,
    );
  }

  // ── Interpolation lineaire (lerp) ───────────────────

  /** Interpolation lineaire : a + t * (b - a) */
  lerp(other: Vec3, t: number): Vec3 {
    return new Vec3(
      this.x + t * (other.x - this.x),
      this.y + t * (other.y - this.y),
      this.z + t * (other.z - this.z),
    );
  }

  // ── Conversion pour le GPU ───────────────────────────

  /** Convertir en Float32Array (3 elements) */
  toArray(): Float32Array {
    return new Float32Array([this.x, this.y, this.z]);
  }

  /** Convertir en Float32Array 4D (avec w) pour le GPU */
  toArray4(w: number = 1.0): Float32Array {
    return new Float32Array([this.x, this.y, this.z, w]);
  }

  /** Creer depuis un tableau */
  static fromArray(arr: ArrayLike<number>): Vec3 {
    return new Vec3(arr[0] ?? 0, arr[1] ?? 0, arr[2] ?? 0);
  }

  // ── Utilitaires ──────────────────────────────────────

  /** Angle entre deux vecteurs (en radians) */
  angleTo(other: Vec3): number {
    const d = this.normalize().dot(other.normalize());
    // Clamper pour eviter les erreurs d'arrondi avec acos
    return Math.acos(Math.max(-1, Math.min(1, d)));
  }

  /** Reflexion par rapport a une normale */
  reflect(normal: Vec3): Vec3 {
    // r = v - 2 * (v · n) * n
    const d = this.dot(normal);
    return this.sub(normal.scale(2 * d));
  }

  toString(): string {
    return `Vec3(${this.x.toFixed(3)}, ${this.y.toFixed(3)}, ${this.z.toFixed(3)})`;
  }
}
```

---

## Produit scalaire (dot product) en detail

Le produit scalaire est l'operation la plus utilisee en graphisme 3D. Il encode l'**angle** entre deux vecteurs.

```
PRODUIT SCALAIRE : a · b = |a| * |b| * cos(θ)
═══════════════════════════════════════════════════════════

Si les deux vecteurs sont normalises (longueur 1) :
  a · b = cos(θ)

        a · b > 0         a · b = 0         a · b < 0
     ┌────────────┐    ┌────────────┐    ┌────────────┐
     │    a ↗     │    │    a ↑     │    │    a ↗     │
     │   ↗        │    │            │    │   ↗        │
     │  b →       │    │  b →       │    │           ← b
     │            │    │            │    │            │
     │ θ < 90°    │    │ θ = 90°    │    │ θ > 90°    │
     │ Meme sens  │    │ Perpen-    │    │ Sens       │
     │ general    │    │ diculaires │    │ oppose     │
     └────────────┘    └────────────┘    └────────────┘
```

### Application 1 : Backface Culling

```typescript
/**
 * Backface culling : determiner si un triangle fait face a la camera.
 *
 * En rendu 3D, les faces arriere des objets sont invisibles.
 * Le produit scalaire entre la normale du triangle et la direction
 * vers la camera permet de savoir si la face est visible.
 */
function isFacingCamera(
  triangleNormal: Vec3,
  triangleCenter: Vec3,
  cameraPosition: Vec3,
): boolean {
  // Direction du triangle vers la camera
  const toCamera = cameraPosition.sub(triangleCenter).normalize();

  // Si le dot product est positif, la face regarde vers la camera
  return triangleNormal.dot(toCamera) > 0;
}

// Exemple
const normal = new Vec3(0, 0, 1);       // Face pointe vers +Z
const center = new Vec3(0, 0, 0);        // Centre du triangle
const camera = new Vec3(0, 0, 5);        // Camera devant

console.log(isFacingCamera(normal, center, camera)); // true — face visible

const cameraBack = new Vec3(0, 0, -5);   // Camera derriere
console.log(isFacingCamera(normal, center, cameraBack)); // false — face cachee
```

### Application 2 : eclairage diffus (Lambert)

```typescript
/**
 * Eclairage diffus de Lambert.
 *
 * L'intensite de la lumiere sur une surface depend de l'angle
 * entre la normale de la surface et la direction de la lumiere.
 *
 * intensity = max(0, N · L)
 */
function lambertDiffuse(
  surfaceNormal: Vec3,
  lightDirection: Vec3,
): number {
  // lightDirection pointe VERS la lumiere (pas depuis la lumiere)
  const NdotL = surfaceNormal.normalize().dot(lightDirection.normalize());
  return Math.max(0, NdotL); // Clamper a 0 : pas de lumiere negative
}

// Surface horizontale, lumiere du dessus
const normal = Vec3.UP;                          // (0, 1, 0)
const lightFromAbove = new Vec3(0, 1, 0);        // Lumiere pile au-dessus
console.log(lambertDiffuse(normal, lightFromAbove)); // 1.0 — pleine intensite

const lightAt45deg = new Vec3(1, 1, 0);          // Lumiere a 45 degres
console.log(lambertDiffuse(normal, lightAt45deg));   // ~0.707

const lightFromBelow = new Vec3(0, -1, 0);       // Lumiere d'en bas
console.log(lambertDiffuse(normal, lightFromBelow)); // 0.0 — dans l'ombre
```

### Application 3 : projection d'un vecteur

```typescript
/**
 * Projection du vecteur a sur le vecteur b.
 *
 * proj_b(a) = (a · b / b · b) * b
 *
 * Utile pour : decomposer un mouvement en composantes,
 * calculer la distance a un plan, etc.
 */
function project(a: Vec3, onto: Vec3): Vec3 {
  const bDotB = onto.dot(onto);
  if (bDotB === 0) return Vec3.ZERO;
  const scalar = a.dot(onto) / bDotB;
  return onto.scale(scalar);
}

// Projeter un vecteur diagonal sur l'axe X
const diagonal = new Vec3(3, 4, 0);
const xAxis = Vec3.RIGHT; // (1, 0, 0)
const projected = project(diagonal, xAxis);
console.log(projected.toString()); // Vec3(3.000, 0.000, 0.000)
```

---

## Produit vectoriel (cross product) en detail

Le produit vectoriel de deux vecteurs donne un **troisieme vecteur perpendiculaire** aux deux premiers.

```
PRODUIT VECTORIEL : a × b
═══════════════════════════════════════════════════════════

         a × b (resultat)
           ↑
           │
           │
           │
     a ────┼────► b
           │
           │

Le resultat est PERPENDICULAIRE au plan forme par a et b.
La direction suit la regle de la main droite :
  - Index = a
  - Majeur = b
  - Pouce = a × b

ATTENTION : l'ordre compte !
  a × b = -(b × a)
```

### Calculer la normale d'un triangle

```typescript
/**
 * Calculer la normale d'un triangle a partir de ses 3 sommets.
 *
 * La normale est perpendiculaire a la surface du triangle.
 * Elle est utilisee pour l'eclairage et le backface culling.
 */
function triangleNormal(v0: Vec3, v1: Vec3, v2: Vec3): Vec3 {
  // Deux aretes du triangle
  const edge1 = v1.sub(v0);
  const edge2 = v2.sub(v0);

  // Le cross product donne la normale
  return edge1.cross(edge2).normalize();
}

// Triangle dans le plan XY (pointe vers +Z)
const v0 = new Vec3(0, 0, 0);
const v1 = new Vec3(1, 0, 0);
const v2 = new Vec3(0, 1, 0);

const normal = triangleNormal(v0, v1, v2);
console.log(normal.toString()); // Vec3(0.000, 0.000, 1.000) — pointe vers +Z

// Inverser l'ordre des vertices inverse la normale
const normalFlipped = triangleNormal(v0, v2, v1);
console.log(normalFlipped.toString()); // Vec3(0.000, 0.000, -1.000) — pointe vers -Z
```

:::warning Winding order
L'ordre des vertices d'un triangle determine la direction de sa normale. En WebGL/WebGPU, les triangles en **counter-clockwise** (sens anti-horaire) sont consideres comme "face avant" par defaut. C'est comme le z-index en CSS : l'ordre compte.
:::

---

## Matrices 4x4 : le moteur des transformations

### Pourquoi 4x4 et pas 3x3 ?

Une matrice 3x3 suffit pour la rotation et l'echelle, mais **pas pour la translation**. La translation necessite des **coordonnees homogenes** (4D).

```
COORDONNEES HOMOGENES
═══════════════════════════════════════════════════════════

Point 3D  (x, y, z)    →  Point 4D  (x, y, z, 1)    w = 1
Vecteur 3D (x, y, z)   →  Vecteur 4D (x, y, z, 0)   w = 0

Pourquoi ?
- Un POINT a une position dans l'espace → il DOIT etre translate
- Un VECTEUR est une direction → la translation ne change PAS une direction

Avec w = 1 (point) :
┌         ┐   ┌   ┐     ┌         ┐
│ 1 0 0 tx│   │ x │     │ x + tx  │   ← La translation fonctionne !
│ 0 1 0 ty│ × │ y │  =  │ y + ty  │
│ 0 0 1 tz│   │ z │     │ z + tz  │
│ 0 0 0  1│   │ 1 │     │   1     │
└         ┘   └   ┘     └         ┘

Avec w = 0 (vecteur) :
┌         ┐   ┌   ┐     ┌     ┐
│ 1 0 0 tx│   │ x │     │  x  │   ← La translation est ignoree !
│ 0 1 0 ty│ × │ y │  =  │  y  │      Un vecteur (direction) n'a pas
│ 0 0 1 tz│   │ z │     │  z  │      de position.
│ 0 0 0  1│   │ 0 │     │  0  │
└         ┘   └   ┘     └     ┘
```

### Convention Column-Major

```
COLUMN-MAJOR (convention OpenGL / WebGL / WebGPU)
═══════════════════════════════════════════════════════════

En memoire (Float32Array), les colonnes sont stockees les unes apres les autres :

Matrice logique :         Stockage memoire (column-major) :
┌             ┐
│ m0  m4  m8  m12 │       [m0, m1, m2, m3,    ← colonne 0
│ m1  m5  m9  m13 │        m4, m5, m6, m7,    ← colonne 1
│ m2  m6  m10 m14 │        m8, m9, m10, m11,  ← colonne 2
│ m3  m7  m11 m15 │        m12, m13, m14, m15] ← colonne 3
└             ┘

La colonne 3 (m12, m13, m14, m15) contient la TRANSLATION (tx, ty, tz, 1).

ATTENTION : c'est l'inverse de la convention mathematique classique (row-major) !
Beaucoup de bugs viennent de cette confusion.
```

### Implementation Mat4

```typescript
// ── mat4.ts ─────────────────────────────────────────────

/**
 * Matrice 4x4 en column-major order.
 *
 * Stockee comme un Float32Array de 16 elements.
 * Compatible directement avec les uniform buffers GPU.
 */
class Mat4 {
  /** Les 16 elements en column-major order */
  public readonly data: Float32Array;

  constructor(data?: Float32Array) {
    this.data = data ?? new Float32Array(16);
  }

  // ── Constructeurs statiques ──────────────────────────

  /** Matrice identite */
  static identity(): Mat4 {
    const m = new Mat4();
    m.data[0] = 1;
    m.data[5] = 1;
    m.data[10] = 1;
    m.data[15] = 1;
    return m;
  }

  /** Matrice nulle */
  static zero(): Mat4 {
    return new Mat4();
  }

  /**
   * Creer depuis les valeurs en ROW-major (plus lisible en code).
   * Convertit automatiquement en column-major.
   */
  static fromRows(
    r0c0: number, r0c1: number, r0c2: number, r0c3: number,
    r1c0: number, r1c1: number, r1c2: number, r1c3: number,
    r2c0: number, r2c1: number, r2c2: number, r2c3: number,
    r3c0: number, r3c1: number, r3c2: number, r3c3: number,
  ): Mat4 {
    const m = new Mat4();
    // Colonne 0
    m.data[0] = r0c0; m.data[1] = r1c0; m.data[2] = r2c0; m.data[3] = r3c0;
    // Colonne 1
    m.data[4] = r0c1; m.data[5] = r1c1; m.data[6] = r2c1; m.data[7] = r3c1;
    // Colonne 2
    m.data[8] = r0c2; m.data[9] = r1c2; m.data[10] = r2c2; m.data[11] = r3c2;
    // Colonne 3
    m.data[12] = r0c3; m.data[13] = r1c3; m.data[14] = r2c3; m.data[15] = r3c3;
    return m;
  }

  // ── Acces aux elements ───────────────────────────────

  /** Acceder a l'element (row, col) */
  get(row: number, col: number): number {
    return this.data[col * 4 + row];
  }

  /** Modifier un element (row, col) — retourne une NOUVELLE matrice */
  set(row: number, col: number, value: number): Mat4 {
    const result = new Mat4(new Float32Array(this.data));
    result.data[col * 4 + row] = value;
    return result;
  }

  // ── Multiplication ───────────────────────────────────

  /**
   * Multiplication de matrices : this * other
   *
   * C'est l'operation la plus importante en 3D.
   * Elle permet de COMBINER des transformations.
   *
   * ATTENTION : l'ordre compte ! A * B ≠ B * A
   */
  multiply(other: Mat4): Mat4 {
    const a = this.data;
    const b = other.data;
    const result = new Float32Array(16);

    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 4; row++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          sum += a[k * 4 + row] * b[col * 4 + k];
        }
        result[col * 4 + row] = sum;
      }
    }

    return new Mat4(result);
  }

  /**
   * Multiplier par un vecteur 4D : M * v
   */
  multiplyVec4(x: number, y: number, z: number, w: number): [number, number, number, number] {
    const m = this.data;
    return [
      m[0] * x + m[4] * y + m[8] * z + m[12] * w,
      m[1] * x + m[5] * y + m[9] * z + m[13] * w,
      m[2] * x + m[6] * y + m[10] * z + m[14] * w,
      m[3] * x + m[7] * y + m[11] * z + m[15] * w,
    ];
  }

  /** Transformer un point (w=1) */
  transformPoint(p: Vec3): Vec3 {
    const [x, y, z, w] = this.multiplyVec4(p.x, p.y, p.z, 1);
    // Diviser par w (perspective divide)
    if (w !== 0 && w !== 1) {
      return new Vec3(x / w, y / w, z / w);
    }
    return new Vec3(x, y, z);
  }

  /** Transformer un vecteur (w=0, ignore la translation) */
  transformVector(v: Vec3): Vec3 {
    const [x, y, z] = this.multiplyVec4(v.x, v.y, v.z, 0);
    return new Vec3(x, y, z);
  }

  // ── Transposee ───────────────────────────────────────

  /** Transposee : echanger lignes et colonnes */
  transpose(): Mat4 {
    const m = this.data;
    return Mat4.fromRows(
      m[0], m[1], m[2], m[3],
      m[4], m[5], m[6], m[7],
      m[8], m[9], m[10], m[11],
      m[12], m[13], m[14], m[15],
    );
    // Note : fromRows transpose car il attend row-major et stocke en column-major
  }

  // ── Inverse ──────────────────────────────────────────

  /**
   * Inverse de la matrice.
   *
   * M * M^-1 = Identite
   *
   * Utilisee pour :
   * - Passer de world space a camera space (view matrix = inverse de la camera transform)
   * - Calculer les normales (inverse transpose de la model matrix)
   */
  inverse(): Mat4 {
    const m = this.data;
    const inv = new Float32Array(16);

    inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] -
             m[9] * m[6] * m[15] + m[9] * m[7] * m[14] +
             m[13] * m[6] * m[11] - m[13] * m[7] * m[10];

    inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] +
              m[8] * m[6] * m[15] - m[8] * m[7] * m[14] -
              m[12] * m[6] * m[11] + m[12] * m[7] * m[10];

    inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] -
             m[8] * m[5] * m[15] + m[8] * m[7] * m[13] +
             m[12] * m[5] * m[11] - m[12] * m[7] * m[9];

    inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] +
               m[8] * m[5] * m[14] - m[8] * m[6] * m[13] -
               m[12] * m[5] * m[10] + m[12] * m[6] * m[9];

    inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] +
              m[9] * m[2] * m[15] - m[9] * m[3] * m[14] -
              m[13] * m[2] * m[11] + m[13] * m[3] * m[10];

    inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] -
             m[8] * m[2] * m[15] + m[8] * m[3] * m[14] +
             m[12] * m[2] * m[11] - m[12] * m[3] * m[10];

    inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] +
              m[8] * m[1] * m[15] - m[8] * m[3] * m[13] -
              m[12] * m[1] * m[11] + m[12] * m[3] * m[9];

    inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] -
              m[8] * m[1] * m[14] + m[8] * m[2] * m[13] +
              m[12] * m[1] * m[10] - m[12] * m[2] * m[9];

    inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] -
             m[5] * m[2] * m[15] + m[5] * m[3] * m[14] +
             m[13] * m[2] * m[7] - m[13] * m[3] * m[6];

    inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] +
              m[4] * m[2] * m[15] - m[4] * m[3] * m[14] -
              m[12] * m[2] * m[7] + m[12] * m[3] * m[6];

    inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] -
              m[4] * m[1] * m[15] + m[4] * m[3] * m[13] +
              m[12] * m[1] * m[7] - m[12] * m[3] * m[5];

    inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] +
               m[4] * m[1] * m[14] - m[4] * m[2] * m[13] -
               m[12] * m[1] * m[6] + m[12] * m[2] * m[5];

    inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] +
              m[5] * m[2] * m[11] - m[5] * m[3] * m[10] -
              m[9] * m[2] * m[7] + m[9] * m[3] * m[6];

    inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] -
             m[4] * m[2] * m[11] + m[4] * m[3] * m[10] +
             m[8] * m[2] * m[7] - m[8] * m[3] * m[6];

    inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] +
               m[4] * m[1] * m[11] - m[4] * m[3] * m[9] -
               m[8] * m[1] * m[7] + m[8] * m[3] * m[5];

    inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] -
              m[4] * m[1] * m[10] + m[4] * m[2] * m[9] +
              m[8] * m[1] * m[6] - m[8] * m[2] * m[5];

    const det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];

    if (Math.abs(det) < 1e-10) {
      throw new Error('Matrix is not invertible (determinant ≈ 0)');
    }

    const invDet = 1.0 / det;
    const result = new Float32Array(16);
    for (let i = 0; i < 16; i++) {
      result[i] = inv[i] * invDet;
    }

    return new Mat4(result);
  }

  // ── Utilitaires ──────────────────────────────────────

  /** Extraire la translation (colonne 3) */
  getTranslation(): Vec3 {
    return new Vec3(this.data[12], this.data[13], this.data[14]);
  }

  /** Extraire l'echelle (longueur de chaque colonne) */
  getScale(): Vec3 {
    const sx = new Vec3(this.data[0], this.data[1], this.data[2]).length();
    const sy = new Vec3(this.data[4], this.data[5], this.data[6]).length();
    const sz = new Vec3(this.data[8], this.data[9], this.data[10]).length();
    return new Vec3(sx, sy, sz);
  }

  /** Cloner la matrice */
  clone(): Mat4 {
    return new Mat4(new Float32Array(this.data));
  }

  toString(): string {
    const m = this.data;
    const fmt = (n: number) => n.toFixed(3).padStart(8);
    return [
      `┌${fmt(m[0])} ${fmt(m[4])} ${fmt(m[8])} ${fmt(m[12])} ┐`,
      `│${fmt(m[1])} ${fmt(m[5])} ${fmt(m[9])} ${fmt(m[13])} │`,
      `│${fmt(m[2])} ${fmt(m[6])} ${fmt(m[10])} ${fmt(m[14])} │`,
      `└${fmt(m[3])} ${fmt(m[7])} ${fmt(m[11])} ${fmt(m[15])} ┘`,
    ].join('\n');
  }
}
```

---

## Utilisation pratique : Float32Array et GPU

```typescript
// ── gpu-upload.ts ───────────────────────────────────────

/**
 * Envoyer une matrice au GPU via un uniform buffer.
 *
 * Le GPU attend un Float32Array en column-major.
 * Notre classe Mat4 stocke deja en column-major → zero conversion !
 */
function uploadMatrixToGPU(
  device: GPUDevice,
  matrix: Mat4,
): GPUBuffer {
  const buffer = device.createBuffer({
    size: 64, // 16 floats x 4 bytes = 64 bytes
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Ecrire directement — le format est deja correct
  device.queue.writeBuffer(buffer, 0, matrix.data);

  return buffer;
}

/**
 * Envoyer un tableau de vertices (position + couleur) au GPU.
 */
function uploadVertices(
  device: GPUDevice,
  positions: Vec3[],
  colors: Vec3[],
): GPUBuffer {
  // Entrelacement : [px, py, pz, cr, cg, cb, px, py, pz, cr, cg, cb, ...]
  const data = new Float32Array(positions.length * 6);

  for (let i = 0; i < positions.length; i++) {
    const offset = i * 6;
    data[offset + 0] = positions[i].x;
    data[offset + 1] = positions[i].y;
    data[offset + 2] = positions[i].z;
    data[offset + 3] = colors[i].x;  // r
    data[offset + 4] = colors[i].y;  // g
    data[offset + 5] = colors[i].z;  // b
  }

  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });

  new Float32Array(buffer.getMappedRange()).set(data);
  buffer.unmap();

  return buffer;
}
```

:::tip Alignement memoire
Les GPU ont des contraintes d'alignement strictes. Un `mat4x4<f32>` en WGSL doit etre aligne sur 16 bytes. Un `vec3<f32>` est en realite stocke avec 4 floats (padding a 16 bytes). Gardez cela en tete quand vous construisez vos uniform buffers.
:::

---

## Vecteurs 2D et 4D

```typescript
// ── vec2.ts (version simplifiee) ────────────────────────

class Vec2 {
  constructor(
    public readonly x: number,
    public readonly y: number,
  ) {}

  static readonly ZERO = new Vec2(0, 0);
  static readonly ONE = new Vec2(1, 1);

  add(other: Vec2): Vec2 { return new Vec2(this.x + other.x, this.y + other.y); }
  sub(other: Vec2): Vec2 { return new Vec2(this.x - other.x, this.y - other.y); }
  scale(f: number): Vec2 { return new Vec2(this.x * f, this.y * f); }
  dot(other: Vec2): number { return this.x * other.x + this.y * other.y; }
  length(): number { return Math.sqrt(this.x * this.x + this.y * this.y); }
  normalize(): Vec2 { const l = this.length(); return l === 0 ? Vec2.ZERO : this.scale(1 / l); }

  /** Perpendiculaire (rotation 90 degres) */
  perp(): Vec2 { return new Vec2(-this.y, this.x); }

  /** Utile pour les coordonnees de texture (UV) */
  toArray(): Float32Array { return new Float32Array([this.x, this.y]); }
}

// ── vec4.ts (pour les couleurs et coordonnees homogenes) ─

class Vec4 {
  constructor(
    public readonly x: number,
    public readonly y: number,
    public readonly z: number,
    public readonly w: number,
  ) {}

  static readonly ZERO = new Vec4(0, 0, 0, 0);
  static readonly ONE = new Vec4(1, 1, 1, 1);

  add(other: Vec4): Vec4 {
    return new Vec4(this.x + other.x, this.y + other.y, this.z + other.z, this.w + other.w);
  }

  scale(f: number): Vec4 {
    return new Vec4(this.x * f, this.y * f, this.z * f, this.w * f);
  }

  dot(other: Vec4): number {
    return this.x * other.x + this.y * other.y + this.z * other.z + this.w * other.w;
  }

  /** Conversion vers Vec3 (perspective divide si w ≠ 1) */
  toVec3(): Vec3 {
    if (this.w !== 0 && this.w !== 1) {
      return new Vec3(this.x / this.w, this.y / this.w, this.z / this.w);
    }
    return new Vec3(this.x, this.y, this.z);
  }

  /** Pour les couleurs RGBA */
  static rgba(r: number, g: number, b: number, a: number = 1.0): Vec4 {
    return new Vec4(r, g, b, a);
  }

  toArray(): Float32Array {
    return new Float32Array([this.x, this.y, this.z, this.w]);
  }
}
```

---

## Exercice pratique

### Enonce

Implementez les fonctions suivantes en utilisant les classes `Vec3` et `Mat4` :

1. `computeTriangleArea(v0, v1, v2)` — calculer l'aire d'un triangle en 3D
2. `isPointInFrontOfPlane(point, planeNormal, planePoint)` — determiner si un point est devant un plan
3. `verifyMatrixInverse(matrix)` — verifier que M * M^-1 = identite (a un epsilon pres)

<details>
<summary>Voir la solution</summary>

```typescript
/**
 * Aire d'un triangle = ||(v1 - v0) × (v2 - v0)|| / 2
 */
function computeTriangleArea(v0: Vec3, v1: Vec3, v2: Vec3): number {
  const edge1 = v1.sub(v0);
  const edge2 = v2.sub(v0);
  const crossProduct = edge1.cross(edge2);
  return crossProduct.length() / 2;
}

// Test
const area = computeTriangleArea(
  new Vec3(0, 0, 0),
  new Vec3(4, 0, 0),
  new Vec3(0, 3, 0),
);
console.log('Area:', area); // 6.0 (triangle 3-4-5, aire = 4*3/2)

/**
 * Un point est "devant" un plan si le dot product entre
 * (point - planePoint) et planeNormal est positif.
 */
function isPointInFrontOfPlane(
  point: Vec3,
  planeNormal: Vec3,
  planePoint: Vec3,
): boolean {
  const toPoint = point.sub(planePoint);
  return toPoint.dot(planeNormal) > 0;
}

// Test : plan horizontal (normal vers le haut)
const above = isPointInFrontOfPlane(
  new Vec3(0, 5, 0),       // Point au-dessus
  Vec3.UP,                   // Normal du plan = vers le haut
  new Vec3(0, 0, 0),        // Point sur le plan
);
console.log('Above:', above); // true

const below = isPointInFrontOfPlane(
  new Vec3(0, -5, 0),       // Point en-dessous
  Vec3.UP,
  new Vec3(0, 0, 0),
);
console.log('Below:', below); // false

/**
 * Verifier que M * M^-1 ≈ Identite
 */
function verifyMatrixInverse(matrix: Mat4, epsilon: number = 1e-6): boolean {
  const inv = matrix.inverse();
  const product = matrix.multiply(inv);
  const identity = Mat4.identity();

  for (let i = 0; i < 16; i++) {
    if (Math.abs(product.data[i] - identity.data[i]) > epsilon) {
      console.error(`Mismatch at index ${i}: ${product.data[i]} vs ${identity.data[i]}`);
      return false;
    }
  }
  return true;
}

// Test avec une matrice quelconque
const testMatrix = Mat4.fromRows(
  2, 0, 0, 5,
  0, 3, 0, -1,
  0, 0, 4, 2,
  0, 0, 0, 1,
);
console.log('Inverse valid:', verifyMatrixInverse(testMatrix)); // true
```

</details>

---

## Resume

| Concept | Explication |
|---------|-------------|
| Vec3 | Vecteur 3D avec x, y, z — represente un point (w=1) ou une direction (w=0) |
| Dot product | `a · b = cos(θ)` (si normalise) — angle, projection, backface culling |
| Cross product | `a × b` — vecteur perpendiculaire, normale de triangle |
| Normalisation | Rendre la longueur = 1, essentiel pour les directions et les normales |
| Mat4 | Matrice 4x4 en column-major — encode toutes les transformations 3D |
| Coordonnees homogenes | w=1 pour les points (translatable), w=0 pour les vecteurs |
| Column-major | Les colonnes sont stockees les unes apres les autres en memoire |
| Multiplication | `M1 * M2` combine les transformations — l'ordre est important |
| Inverse | `M^-1` annule la transformation — utile pour la view matrix |
| Float32Array | Format natif pour envoyer des donnees au GPU |
| Alignement GPU | `vec3` est stocke comme `vec4` (16 bytes padding) en WGSL |

---

## Pour aller plus loin

- [3D Math Primer for Graphics and Game Development](https://gamemath.com/)
- [Immersive Linear Algebra (interactif)](http://immersivemath.com/ila/index.html)
- [glMatrix — librairie d'algebre lineaire optimisee](https://glmatrix.net/)
- [WebGPU WGSL types and alignment](https://www.w3.org/TR/WGSL/#alignment-and-size)
