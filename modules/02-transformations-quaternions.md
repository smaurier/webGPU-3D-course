# 02 — Transformations et quaternions

| Difficulte | Duree estimee | Lab | Quiz |
|:----------:|:-------------:|:---:|:----:|
| 3/5        | 90 min        | [Lab 02](../labs/lab-02-transformations/) | [Quiz 02](../quizzes/quiz-02-transformations.html) |

## Objectifs pedagogiques

A la fin de ce module, vous serez capable de :

- Construire des matrices de translation, rotation et echelle en 4x4
- Expliquer l'ordre SRT (Scale → Rotate → Translate) et pourquoi il est critique
- Identifier le probleme du gimbal lock avec les angles d'Euler
- Representer une rotation avec un quaternion
- Implementer les operations sur les quaternions (multiplication, slerp, conversion)
- Construire la Model matrix, la View matrix et la Projection matrix
- Concatener des transformations par multiplication de matrices

---

<details>
<summary>Rappel du module precedent</summary>

- **Vec3** : vecteur 3D avec `add`, `sub`, `scale`, `dot`, `cross`, `normalize`
- **Dot product** : `a · b = cos(θ)` (si normalise) — angle, eclairage, backface culling
- **Cross product** : `a × b` — perpendiculaire, normale de triangle
- **Mat4** : matrice 4x4 en **column-major**, avec `multiply`, `inverse`, `transpose`
- **Coordonnees homogenes** : w=1 pour les points, w=0 pour les vecteurs
- **Float32Array** : format natif pour envoyer des donnees au GPU (column-major)

</details>

---

## Analogie : les transformations CSS en 3D

:::tip Analogie pour developpeurs Vue.js
Vous connaissez deja les transformations CSS :

```css
/* CSS : applique de DROITE A GAUCHE dans la chaine de transformations */
.cube {
  transform: translate(100px, 50px) rotate(45deg) scale(2);
  /* Ordre d'application : scale(2) → rotate(45deg) → translate(100px, 50px) */
}
```

En 3D, c'est identique mais avec des matrices 4x4 :

```typescript
// 3D : multiplication de matrices, meme ordre que CSS
const model = translation.multiply(rotation).multiply(scale);
// Ordre d'application : scale → rotation → translation (SRT)
```

L'astuce : en CSS comme en 3D, les transformations se lisent de **droite a gauche** (derniere ecrite = premiere appliquee).
:::

---

## Matrices de transformation elementaires

### Translation

```typescript
// ── translation.ts ──────────────────────────────────────

/**
 * Matrice de translation.
 *
 * ┌ 1  0  0  tx ┐
 * │ 0  1  0  ty │
 * │ 0  0  1  tz │
 * └ 0  0  0   1 ┘
 *
 * La translation est stockee dans la 4e colonne (column-major).
 */
function translationMatrix(tx: number, ty: number, tz: number): Mat4 {
  const m = Mat4.identity();
  m.data[12] = tx;  // colonne 3, ligne 0
  m.data[13] = ty;  // colonne 3, ligne 1
  m.data[14] = tz;  // colonne 3, ligne 2
  return m;
}

// Equivalent : deplacer un objet de 5 unites a droite et 3 vers le haut
const T = translationMatrix(5, 3, 0);

// Appliquer a un point
const point = new Vec3(0, 0, 0);
const moved = T.transformPoint(point);
console.log(moved.toString()); // Vec3(5.000, 3.000, 0.000)

// Appliquer a un vecteur (w=0) — pas affecte !
const direction = new Vec3(1, 0, 0);
const sameDirection = T.transformVector(direction);
console.log(sameDirection.toString()); // Vec3(1.000, 0.000, 0.000) — inchange
```

### Echelle (Scale)

```typescript
// ── scale.ts ────────────────────────────────────────────

/**
 * Matrice d'echelle.
 *
 * ┌ sx  0   0   0 ┐
 * │  0  sy  0   0 │
 * │  0  0   sz  0 │
 * └  0  0   0   1 ┘
 */
function scaleMatrix(sx: number, sy: number, sz: number): Mat4 {
  const m = Mat4.identity();
  m.data[0] = sx;
  m.data[5] = sy;
  m.data[10] = sz;
  return m;
}

// Echelle uniforme (meme facteur sur les 3 axes)
function uniformScaleMatrix(s: number): Mat4 {
  return scaleMatrix(s, s, s);
}

// Doubler la taille d'un objet
const S = uniformScaleMatrix(2);
const scaled = S.transformPoint(new Vec3(3, 4, 5));
console.log(scaled.toString()); // Vec3(6.000, 8.000, 10.000)

// Echelle non-uniforme (deformer un cube en parallelepipede)
const S2 = scaleMatrix(2, 1, 0.5);
const deformed = S2.transformPoint(new Vec3(1, 1, 1));
console.log(deformed.toString()); // Vec3(2.000, 1.000, 0.500)
```

### Rotation autour des axes principaux

```typescript
// ── rotation.ts ─────────────────────────────────────────

/**
 * Rotation autour de l'axe X.
 *
 * ┌ 1    0       0    0 ┐
 * │ 0  cos(θ) -sin(θ) 0 │
 * │ 0  sin(θ)  cos(θ) 0 │
 * └ 0    0       0    1 ┘
 */
function rotationX(angleRad: number): Mat4 {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  const m = Mat4.identity();
  m.data[5] = c;   m.data[9] = -s;
  m.data[6] = s;   m.data[10] = c;
  return m;
}

/**
 * Rotation autour de l'axe Y.
 *
 * ┌  cos(θ)  0  sin(θ)  0 ┐
 * │    0     1    0      0 │
 * │ -sin(θ)  0  cos(θ)  0 │
 * └    0     0    0      1 ┘
 */
function rotationY(angleRad: number): Mat4 {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  const m = Mat4.identity();
  m.data[0] = c;    m.data[8] = s;
  m.data[2] = -s;   m.data[10] = c;
  return m;
}

/**
 * Rotation autour de l'axe Z.
 *
 * ┌ cos(θ) -sin(θ)  0  0 ┐
 * │ sin(θ)  cos(θ)  0  0 │
 * │   0       0     1  0 │
 * └   0       0     0  1 ┘
 */
function rotationZ(angleRad: number): Mat4 {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  const m = Mat4.identity();
  m.data[0] = c;   m.data[4] = -s;
  m.data[1] = s;   m.data[5] = c;
  return m;
}

/**
 * Rotation autour d'un axe arbitraire (formule de Rodrigues en matrice).
 */
function rotationAxis(axis: Vec3, angleRad: number): Mat4 {
  const n = axis.normalize();
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  const t = 1 - c;

  return Mat4.fromRows(
    t * n.x * n.x + c,         t * n.x * n.y - s * n.z,   t * n.x * n.z + s * n.y,   0,
    t * n.x * n.y + s * n.z,   t * n.y * n.y + c,         t * n.y * n.z - s * n.x,   0,
    t * n.x * n.z - s * n.y,   t * n.y * n.z + s * n.x,   t * n.z * n.z + c,         0,
    0,                          0,                          0,                          1,
  );
}

// Utilitaire : degres → radians
function toRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}

// Tourner de 90 degres autour de l'axe Y
const R = rotationY(toRadians(90));
const rotated = R.transformPoint(new Vec3(1, 0, 0)); // (1,0,0) → (0,0,-1)
console.log(rotated.toString()); // Vec3(0.000, 0.000, -1.000)
```

---

## L'ordre des transformations : SRT

```
ORDRE SRT (Scale → Rotate → Translate)
═══════════════════════════════════════════════════════════

La "model matrix" se construit ainsi :

  ModelMatrix = Translation * Rotation * Scale

L'application se fait de DROITE A GAUCHE :
  1. Scale (d'abord)
  2. Rotate (ensuite)
  3. Translate (en dernier)

Pourquoi cet ordre ?
  - Scaler PUIS translater : l'objet se deplace de la bonne distance
  - Translater PUIS scaler : la translation est multipliee par le scale !
```

```typescript
// ── model-matrix.ts ─────────────────────────────────────

/**
 * Construire une model matrix a partir de position, rotation, echelle.
 *
 * C'est l'equivalent 3D de la propriete CSS `transform`.
 */
function buildModelMatrix(
  position: Vec3,
  rotationEuler: Vec3, // angles en radians (pitch, yaw, roll)
  scale: Vec3,
): Mat4 {
  const T = translationMatrix(position.x, position.y, position.z);
  const Rx = rotationX(rotationEuler.x); // pitch
  const Ry = rotationY(rotationEuler.y); // yaw
  const Rz = rotationZ(rotationEuler.z); // roll
  const S = scaleMatrix(scale.x, scale.y, scale.z);

  // SRT : Model = T * Rz * Ry * Rx * S
  // Convention : Y-X-Z rotation order (la plus courante en 3D web)
  return T.multiply(Rz).multiply(Ry).multiply(Rx).multiply(S);
}

// Exemple : un cube a la position (5, 0, -10), tourne de 45° autour de Y, double taille
const model = buildModelMatrix(
  new Vec3(5, 0, -10),
  new Vec3(0, toRadians(45), 0),
  new Vec3(2, 2, 2),
);
console.log('Model matrix:\n' + model.toString());
```

### Demontrer l'importance de l'ordre

```typescript
// ── order-matters.ts ────────────────────────────────────

// L'ordre des transformations change le resultat !

const T = translationMatrix(5, 0, 0);
const R = rotationZ(toRadians(90));

// Cas 1 : Translate puis Rotate (T * R)
// → L'objet est d'abord translate a (5,0,0), puis tourne autour de l'ORIGINE
const TR = T.multiply(R);
const p1 = TR.transformPoint(new Vec3(0, 0, 0));
console.log('T*R:', p1.toString()); // Vec3(5.000, 0.000, 0.000)

// Cas 2 : Rotate puis Translate (R * T)
// → L'objet est d'abord tourne, puis translate le long de l'axe TOURNE
const RT = R.multiply(T);
const p2 = RT.transformPoint(new Vec3(0, 0, 0));
console.log('R*T:', p2.toString()); // Vec3(0.000, 5.000, 0.000) — different !

// Le point (1,0,0) vu par chaque combinaison :
const pTR = TR.transformPoint(new Vec3(1, 0, 0));
const pRT = RT.transformPoint(new Vec3(1, 0, 0));
console.log('T*R applied to (1,0,0):', pTR.toString()); // Vec3(5.000, 1.000, 0.000)
console.log('R*T applied to (1,0,0):', pRT.toString()); // Vec3(-0.000, 6.000, 0.000)
```

:::warning Piege classique
L'erreur la plus frequente des debutants en 3D : multiplier les matrices dans le mauvais ordre. `A * B ≠ B * A`. Souvenez-vous du SRT : **S**cale, **R**otate, **T**ranslate — et la matrice se construit en sens inverse : `T * R * S`.
:::

---

## Angles d'Euler et le Gimbal Lock

### Les 3 angles d'Euler

```
ANGLES D'EULER
═══════════════════════════════════════════════════════════

Pitch (rotation autour de X) = "lever/baisser le nez"
     ▲ Y
     │   ╱ nez
     │  ╱ ↕ pitch
     │ ╱
     └──────► Z

Yaw (rotation autour de Y) = "tourner la tete"
     ▲ Y
     │
     │   → yaw
     └──────► Z
    ╱
   ╱ X

Roll (rotation autour de Z) = "pencher la tete"
     ▲ Y
     │ ↻ roll
     │
     └──────► X
```

### Le probleme du Gimbal Lock

```
GIMBAL LOCK
═══════════════════════════════════════════════════════════

Quand le pitch est a 90°, les axes yaw et roll s'ALIGNENT.
On perd un degre de liberte.

Normal (3 axes independants) :
  Yaw   ──────  ┐
  Pitch ──────  ├──  3 axes libres
  Roll  ──────  ┘

Gimbal lock (pitch = 90°) :
  Yaw   ──────  ┐
  Roll  ──────  ┘  ← Yaw et Roll font la MEME rotation !
  Pitch = 90°  (bloque)

  → Seulement 2 degres de liberte au lieu de 3
  → L'objet ne peut plus tourner dans certaines directions
  → L'interpolation entre deux orientations devient instable
```

```typescript
// ── gimbal-lock-demo.ts ─────────────────────────────────

/**
 * Demonstration du gimbal lock.
 *
 * Quand pitch = 90°, changer le yaw et le roll produit le meme mouvement.
 */
function demonstrateGimbalLock(): void {
  const pitch90 = toRadians(90);

  // Orientation A : pitch=90°, yaw=30°, roll=0°
  const rotA = rotationZ(0)
    .multiply(rotationY(toRadians(30)))
    .multiply(rotationX(pitch90));

  // Orientation B : pitch=90°, yaw=0°, roll=30°
  const rotB = rotationZ(toRadians(30))
    .multiply(rotationY(0))
    .multiply(rotationX(pitch90));

  // Ces deux orientations sont IDENTIQUES — on a perdu un degre de liberte
  const pointA = rotA.transformPoint(new Vec3(1, 0, 0));
  const pointB = rotB.transformPoint(new Vec3(1, 0, 0));

  console.log('Orientation A:', pointA.toString());
  console.log('Orientation B:', pointB.toString());
  console.log('Identiques ?', pointA.distanceTo(pointB) < 0.001); // true !
}
```

:::warning Pourquoi c'est grave ?
En animation 3D, le gimbal lock provoque des "sauts" brusques et des rotations imprevisibles. C'est pourquoi les moteurs 3D modernes (Unity, Unreal, Three.js) utilisent des **quaternions** en interne, meme si l'interface expose des angles d'Euler.
:::

---

## Quaternions : la solution elegante

### Qu'est-ce qu'un quaternion ?

Un quaternion est un nombre hypercomplex avec 4 composantes : `q = w + xi + yj + zk`

```
QUATERNION DE ROTATION
═══════════════════════════════════════════════════════════

Un quaternion unitaire encode une rotation autour d'un axe :

  q = (cos(θ/2), sin(θ/2) * axis_x, sin(θ/2) * axis_y, sin(θ/2) * axis_z)
      ╰─ w ───╯  ╰─── x ──────────╯ ╰─── y ──────────╯ ╰─── z ──────────╯

Proprietes :
- |q| = 1 (quaternion unitaire = rotation pure)
- Pas de gimbal lock
- Interpolation fluide (slerp)
- Plus compact qu'une matrice (4 floats vs 16)
- Multiplication = composition de rotations
```

### Implementation TypeScript

```typescript
// ── quaternion.ts ───────────────────────────────────────

/**
 * Quaternion pour representer les rotations 3D.
 *
 * Convention : q = (w, x, y, z) ou w est la partie scalaire.
 */
class Quat {
  constructor(
    public readonly w: number,
    public readonly x: number,
    public readonly y: number,
    public readonly z: number,
  ) {}

  // ── Constructeurs statiques ──────────────────────────

  /** Quaternion identite (pas de rotation) */
  static readonly IDENTITY = new Quat(1, 0, 0, 0);

  /**
   * Creer un quaternion a partir d'un axe et d'un angle.
   *
   * C'est le constructeur le plus intuitif.
   */
  static fromAxisAngle(axis: Vec3, angleRad: number): Quat {
    const half = angleRad / 2;
    const s = Math.sin(half);
    const n = axis.normalize();
    return new Quat(
      Math.cos(half),
      n.x * s,
      n.y * s,
      n.z * s,
    );
  }

  /**
   * Creer a partir d'angles d'Euler (pitch, yaw, roll).
   *
   * Utile pour l'input utilisateur (sliders, editeurs).
   */
  static fromEuler(pitchRad: number, yawRad: number, rollRad: number): Quat {
    const cy = Math.cos(yawRad / 2);
    const sy = Math.sin(yawRad / 2);
    const cp = Math.cos(pitchRad / 2);
    const sp = Math.sin(pitchRad / 2);
    const cr = Math.cos(rollRad / 2);
    const sr = Math.sin(rollRad / 2);

    return new Quat(
      cr * cp * cy + sr * sp * sy,
      sr * cp * cy - cr * sp * sy,
      cr * sp * cy + sr * cp * sy,
      cr * cp * sy - sr * sp * cy,
    );
  }

  // ── Operations ───────────────────────────────────────

  /** Longueur du quaternion */
  length(): number {
    return Math.sqrt(this.w * this.w + this.x * this.x + this.y * this.y + this.z * this.z);
  }

  /** Normaliser (rendre unitaire) */
  normalize(): Quat {
    const len = this.length();
    if (len === 0) return Quat.IDENTITY;
    return new Quat(this.w / len, this.x / len, this.y / len, this.z / len);
  }

  /** Conjugue : q* = (w, -x, -y, -z) */
  conjugate(): Quat {
    return new Quat(this.w, -this.x, -this.y, -this.z);
  }

  /** Inverse : q^-1 = q* / |q|^2 (pour un quaternion unitaire, inverse = conjugue) */
  inverse(): Quat {
    const lenSq = this.w * this.w + this.x * this.x + this.y * this.y + this.z * this.z;
    if (lenSq === 0) return Quat.IDENTITY;
    return new Quat(this.w / lenSq, -this.x / lenSq, -this.y / lenSq, -this.z / lenSq);
  }

  /**
   * Multiplication de quaternions : q1 * q2
   *
   * Compose les rotations : q1 * q2 applique d'abord q2, puis q1.
   * (Meme convention que la multiplication de matrices)
   */
  multiply(other: Quat): Quat {
    return new Quat(
      this.w * other.w - this.x * other.x - this.y * other.y - this.z * other.z,
      this.w * other.x + this.x * other.w + this.y * other.z - this.z * other.y,
      this.w * other.y - this.x * other.z + this.y * other.w + this.z * other.x,
      this.w * other.z + this.x * other.y - this.y * other.x + this.z * other.w,
    );
  }

  /**
   * Appliquer la rotation a un vecteur : q * v * q^-1
   */
  rotateVector(v: Vec3): Vec3 {
    // Optimisation : eviter la double multiplication de quaternions
    // On utilise la formule directe :
    // result = v + 2 * w * (u × v) + 2 * (u × (u × v))
    // ou u = (x, y, z)
    const u = new Vec3(this.x, this.y, this.z);
    const uv = u.cross(v);
    const uuv = u.cross(uv);
    return v.add(uv.scale(2 * this.w)).add(uuv.scale(2));
  }

  /**
   * Produit scalaire entre quaternions.
   * Utile pour slerp et pour determiner le plus court chemin.
   */
  dot(other: Quat): number {
    return this.w * other.w + this.x * other.x + this.y * other.y + this.z * other.z;
  }

  // ── Interpolation ────────────────────────────────────

  /**
   * SLERP : Spherical Linear Interpolation.
   *
   * Interpole entre deux rotations de facon fluide et a vitesse constante.
   * C'est l'avantage majeur des quaternions par rapport aux angles d'Euler.
   *
   * t = 0 → this
   * t = 1 → other
   */
  slerp(other: Quat, t: number): Quat {
    let dot = this.dot(other);

    // Si le dot product est negatif, inverser un quaternion pour prendre le chemin le plus court
    let target = other;
    if (dot < 0) {
      target = new Quat(-other.w, -other.x, -other.y, -other.z);
      dot = -dot;
    }

    // Si les quaternions sont presque identiques, utiliser lerp (evite division par zero)
    if (dot > 0.9995) {
      return new Quat(
        this.w + t * (target.w - this.w),
        this.x + t * (target.x - this.x),
        this.y + t * (target.y - this.y),
        this.z + t * (target.z - this.z),
      ).normalize();
    }

    const theta0 = Math.acos(dot);          // Angle entre les deux rotations
    const theta = theta0 * t;                // Angle partiel
    const sinTheta = Math.sin(theta);
    const sinTheta0 = Math.sin(theta0);

    const s0 = Math.cos(theta) - dot * sinTheta / sinTheta0;
    const s1 = sinTheta / sinTheta0;

    return new Quat(
      s0 * this.w + s1 * target.w,
      s0 * this.x + s1 * target.x,
      s0 * this.y + s1 * target.y,
      s0 * this.z + s1 * target.z,
    ).normalize();
  }

  // ── Conversions ──────────────────────────────────────

  /** Convertir en matrice de rotation 4x4 */
  toMat4(): Mat4 {
    const { w, x, y, z } = this;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;

    return Mat4.fromRows(
      1 - (yy + zz),  xy - wz,        xz + wy,        0,
      xy + wz,         1 - (xx + zz),  yz - wx,        0,
      xz - wy,         yz + wx,        1 - (xx + yy),  0,
      0,                0,              0,               1,
    );
  }

  /** Extraire l'axe et l'angle */
  toAxisAngle(): { axis: Vec3; angle: number } {
    const angle = 2 * Math.acos(Math.max(-1, Math.min(1, this.w)));
    const s = Math.sqrt(1 - this.w * this.w);

    if (s < 0.0001) {
      return { axis: Vec3.UP, angle: 0 }; // Pas de rotation significative
    }

    return {
      axis: new Vec3(this.x / s, this.y / s, this.z / s),
      angle,
    };
  }

  /** Extraire les angles d'Euler (pitch, yaw, roll) */
  toEuler(): { pitch: number; yaw: number; roll: number } {
    const { w, x, y, z } = this;

    // Roll (rotation autour de Z)
    const sinr_cosp = 2 * (w * x + y * z);
    const cosr_cosp = 1 - 2 * (x * x + y * y);
    const roll = Math.atan2(sinr_cosp, cosr_cosp);

    // Pitch (rotation autour de X)
    const sinp = 2 * (w * y - z * x);
    const pitch = Math.abs(sinp) >= 1
      ? Math.sign(sinp) * Math.PI / 2 // Gimbal lock
      : Math.asin(sinp);

    // Yaw (rotation autour de Y)
    const siny_cosp = 2 * (w * z + x * y);
    const cosy_cosp = 1 - 2 * (y * y + z * z);
    const yaw = Math.atan2(siny_cosp, cosy_cosp);

    return { pitch, yaw, roll };
  }

  /** Creer depuis une matrice de rotation */
  static fromMat4(m: Mat4): Quat {
    const d = m.data;
    const trace = d[0] + d[5] + d[10];

    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1.0);
      return new Quat(
        0.25 / s,
        (d[6] - d[9]) * s,
        (d[8] - d[2]) * s,
        (d[1] - d[4]) * s,
      );
    } else if (d[0] > d[5] && d[0] > d[10]) {
      const s = 2.0 * Math.sqrt(1.0 + d[0] - d[5] - d[10]);
      return new Quat(
        (d[6] - d[9]) / s,
        0.25 * s,
        (d[4] + d[1]) / s,
        (d[8] + d[2]) / s,
      );
    } else if (d[5] > d[10]) {
      const s = 2.0 * Math.sqrt(1.0 + d[5] - d[0] - d[10]);
      return new Quat(
        (d[8] - d[2]) / s,
        (d[4] + d[1]) / s,
        0.25 * s,
        (d[9] + d[6]) / s,
      );
    } else {
      const s = 2.0 * Math.sqrt(1.0 + d[10] - d[0] - d[5]);
      return new Quat(
        (d[1] - d[4]) / s,
        (d[8] + d[2]) / s,
        (d[9] + d[6]) / s,
        0.25 * s,
      );
    }
  }

  toString(): string {
    return `Quat(w=${this.w.toFixed(3)}, x=${this.x.toFixed(3)}, y=${this.y.toFixed(3)}, z=${this.z.toFixed(3)})`;
  }
}
```

---

## Comparaison : Euler vs Quaternion

```
EULER vs QUATERNION
═══════════════════════════════════════════════════════════

                  Angles d'Euler         Quaternion
Representation    3 floats (pitch,       4 floats (w, x, y, z)
                  yaw, roll)
Gimbal lock       OUI (a 90° pitch)      NON
Interpolation     Irreguliere, sauts     Fluide (slerp)
Intuition         Facile a comprendre    Abstrait
Composition       Multiplier 3 matrices  Multiplier 2 quats
Performance       3 sin/cos par axe      1 multiplication
Utilisation       UI (sliders, editeurs) Interne (moteur 3D)
```

```typescript
// ── slerp-demo.ts ───────────────────────────────────────

/**
 * Demonstration de l'interpolation fluide avec slerp.
 *
 * Imagine un vaisseau spatial qui tourne de face vers le haut.
 */
function slerpDemo(): void {
  // Orientation initiale : face (regardant -Z)
  const startQuat = Quat.fromAxisAngle(Vec3.UP, 0);

  // Orientation finale : tourner de 180° autour de Y
  const endQuat = Quat.fromAxisAngle(Vec3.UP, Math.PI);

  console.log('Interpolation slerp (0% a 100%) :');

  for (let t = 0; t <= 1.0; t += 0.1) {
    const interpolated = startQuat.slerp(endQuat, t);
    const forward = interpolated.rotateVector(Vec3.FORWARD);

    console.log(
      `  t=${t.toFixed(1)} | direction = ${forward.toString()}`,
    );
  }
  // La rotation est fluide, a vitesse constante, sans gimbal lock
}

/**
 * Avec les angles d'Euler, l'interpolation lineaire (lerp)
 * ne suit PAS un arc de cercle → mouvement irregulier.
 */
function eulerLerpDemo(): void {
  // De (0, 0, 0) a (0, 180°, 0)
  const startEuler = new Vec3(0, 0, 0);
  const endEuler = new Vec3(0, Math.PI, 0);

  console.log('Interpolation lineaire Euler :');

  for (let t = 0; t <= 1.0; t += 0.1) {
    // Lerp naif des angles
    const pitch = startEuler.x + t * (endEuler.x - startEuler.x);
    const yaw = startEuler.y + t * (endEuler.y - startEuler.y);
    const roll = startEuler.z + t * (endEuler.z - startEuler.z);

    // Construire la matrice et extraire la direction
    const rot = rotationY(yaw).multiply(rotationX(pitch)).multiply(rotationZ(roll));
    const forward = rot.transformVector(Vec3.FORWARD);

    console.log(
      `  t=${t.toFixed(1)} | direction = ${forward.toString()}`,
    );
  }
  // Le mouvement SEMBLE correct ici car on tourne autour d'un seul axe.
  // Mais avec 2+ axes, le lerp d'Euler donne des resultats non-lineaires.
}
```

---

## Model, View, Projection

Chaque sommet 3D passe par 3 transformations successives :

```
MVP : MODEL → VIEW → PROJECTION
═══════════════════════════════════════════════════════════

Espace objet     →  Espace monde     →  Espace camera    →  Clip space
(local)              (world)              (view/eye)          (NDC apres /w)
                                                              → Ecran

┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
│  Objet   │ ──M──│  Monde   │ ──V──│  Camera  │ ──P──│  Clip    │
│ (0,0,0)  │      │ (5,0,-10)│      │ relative │      │ (-1..1)  │
│ centre   │      │ position │      │ a cam    │      │          │
└──────────┘      └──────────┘      └──────────┘      └──────────┘

M = Model matrix   (position, rotation, echelle de l'objet dans le monde)
V = View matrix    (position et orientation de la camera)
P = Projection     (perspective ou orthographique)

Position ecran = P * V * M * vertex_local
```

```typescript
// ── mvp.ts ──────────────────────────────────────────────

/**
 * Construire la Model matrix a partir d'un Transform.
 */
interface Transform {
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
}

function modelMatrix(transform: Transform): Mat4 {
  const T = translationMatrix(
    transform.position.x,
    transform.position.y,
    transform.position.z,
  );
  const R = transform.rotation.toMat4();
  const S = scaleMatrix(
    transform.scale.x,
    transform.scale.y,
    transform.scale.z,
  );
  return T.multiply(R).multiply(S);
}

/**
 * La View matrix est l'INVERSE de la transformation de la camera.
 *
 * La camera est un objet dans le monde. Sa transformation (position + rotation)
 * definit ou elle se trouve. La view matrix annule cette transformation pour
 * ramener la scene dans l'espace de la camera.
 */
function viewMatrix(cameraTransform: Transform): Mat4 {
  return modelMatrix(cameraTransform).inverse();
}

/**
 * Calcul complet du MVP pour un vertex.
 */
function transformVertex(
  vertex: Vec3,
  model: Mat4,
  view: Mat4,
  projection: Mat4,
): Vec3 {
  const mvp = projection.multiply(view).multiply(model);
  return mvp.transformPoint(vertex);
}
```

---

## Exercice pratique

### Enonce

1. Implementez une classe `Transform` avec position, rotation (Quat) et scale
2. Ajoutez une methode `lookAt(target: Vec3)` qui oriente le transform vers un point
3. Demonstrez que l'interpolation slerp entre deux orientations est plus fluide que le lerp d'Euler

<details>
<summary>Voir la solution</summary>

```typescript
class Transform3D {
  position: Vec3;
  rotation: Quat;
  scale: Vec3;

  constructor(
    position: Vec3 = Vec3.ZERO,
    rotation: Quat = Quat.IDENTITY,
    scale: Vec3 = Vec3.ONE,
  ) {
    this.position = position;
    this.rotation = rotation;
    this.scale = scale;
  }

  /** Construire la model matrix */
  toMatrix(): Mat4 {
    const T = translationMatrix(this.position.x, this.position.y, this.position.z);
    const R = this.rotation.toMat4();
    const S = scaleMatrix(this.scale.x, this.scale.y, this.scale.z);
    return T.multiply(R).multiply(S);
  }

  /**
   * Orienter le transform pour qu'il regarde un point cible.
   *
   * Construit un quaternion a partir de la direction vers la cible.
   */
  lookAt(target: Vec3, up: Vec3 = Vec3.UP): void {
    const forward = target.sub(this.position).normalize();
    const right = up.cross(forward).normalize();
    const correctedUp = forward.cross(right).normalize();

    // Construire la matrice de rotation a partir des 3 axes
    const rotMat = Mat4.fromRows(
      right.x,       right.y,       right.z,       0,
      correctedUp.x, correctedUp.y, correctedUp.z, 0,
      forward.x,     forward.y,     forward.z,     0,
      0,              0,             0,              1,
    );

    this.rotation = Quat.fromMat4(rotMat);
  }

  /** Interpoler vers un autre transform */
  lerp(other: Transform3D, t: number): Transform3D {
    return new Transform3D(
      this.position.lerp(other.position, t),       // Position : lerp lineaire
      this.rotation.slerp(other.rotation, t),      // Rotation : slerp spherique
      this.scale.lerp(other.scale, t),              // Scale : lerp lineaire
    );
  }
}

// --- Demonstration slerp vs lerp Euler ---

function compareInterpolations(): void {
  // Orientation A : regarder vers -Z
  const quatA = Quat.fromAxisAngle(Vec3.UP, 0);
  // Orientation B : regarder vers +X (90° autour de Y)
  const quatB = Quat.fromAxisAngle(Vec3.UP, toRadians(90));

  // Euler equivalents
  const eulerA = new Vec3(0, 0, 0);
  const eulerB = new Vec3(0, toRadians(90), 0);

  console.log('=== Comparaison SLERP vs EULER LERP ===');
  console.log('(on mesure la distance angulaire parcourue entre chaque pas)\n');

  let prevDirSlerp = quatA.rotateVector(Vec3.FORWARD);
  let prevDirEuler = Vec3.FORWARD;

  for (let t = 0.1; t <= 1.0; t += 0.1) {
    // Slerp
    const q = quatA.slerp(quatB, t);
    const dirSlerp = q.rotateVector(Vec3.FORWARD);
    const angleSlerp = prevDirSlerp.angleTo(dirSlerp) * 180 / Math.PI;
    prevDirSlerp = dirSlerp;

    // Euler lerp
    const yaw = eulerA.y + t * (eulerB.y - eulerA.y);
    const dirEuler = rotationY(yaw).transformVector(Vec3.FORWARD);
    const angleEuler = prevDirEuler.angleTo(dirEuler) * 180 / Math.PI;
    prevDirEuler = dirEuler;

    console.log(
      `t=${t.toFixed(1)} | slerp: ${angleSlerp.toFixed(1)}° | euler: ${angleEuler.toFixed(1)}°`,
    );
  }

  // Pour un seul axe, les deux sont identiques (9° par pas).
  // La difference apparait avec des rotations multi-axes.
  console.log('\n→ Sur un seul axe, les deux sont similaires.');
  console.log('→ Sur 2+ axes, slerp reste constant, euler varie.');
}

compareInterpolations();
```

</details>

---

## Resume

| Concept | Explication |
|---------|-------------|
| Translation | Matrice 4x4 avec (tx, ty, tz) dans la colonne 3 |
| Rotation | Matrice 4x4 basee sur sin/cos de l'angle |
| Scale | Matrice 4x4 avec (sx, sy, sz) sur la diagonale |
| Ordre SRT | Scale → Rotate → Translate (lecture droite a gauche) |
| Angles d'Euler | 3 angles (pitch, yaw, roll) — intuitifs mais gimbal lock |
| Gimbal lock | Perte d'un degre de liberte quand pitch = ±90° |
| Quaternion | 4 composantes (w, x, y, z) — rotation sans gimbal lock |
| SLERP | Interpolation spherique — mouvement fluide a vitesse constante |
| Model matrix | Transformation objet → monde (T * R * S) |
| View matrix | Inverse de la transformation camera |
| Projection matrix | Perspective ou orthographique (monde → clip space) |
| MVP | Projection * View * Model — pipeline complet de transformation |

---

## Pour aller plus loin

- [Quaternion visualization (3Blue1Brown)](https://eater.net/quaternions)
- [Understanding Quaternions (Wolfram)](https://mathworld.wolfram.com/Quaternion.html)
- [Gimbal Lock explained (YouTube)](https://www.youtube.com/watch?v=zc8b2Jo7mno)
- [Rotation Formalisms (Wikipedia)](https://en.wikipedia.org/wiki/Rotation_formalisms_in_three_dimensions)
