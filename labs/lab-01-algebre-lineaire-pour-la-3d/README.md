# Lab 01 — Algèbre linéaire pour la 3D

> **Outcome :** à la fin, tu sais coder une classe `Vec3` (add, sub, scale, normalize, dot, cross) et une `Mat4.multiply`, et tu vérifies chaque opération à la main dans la console du navigateur.
> **Vrai outil :** un fichier `.ts`/`.js` chargé dans une page HTML vierge + la console DevTools d'un navigateur. Pas de test-runner auto-correcteur, pas de framework.
> **Feedback :** le coach valide en session — tu montres tes `console.log` et tu justifies chaque résultat.

---

## Énoncé

Tu construis le **socle mathématique** du globe interactif TribuZen (les points de sortie de la famille posés sur une sphère). Tout le reste du cours réutilisera ces classes.

Tu écris **toi-même** `Vec3` et `Mat4` à partir du starter minimal ci-dessous, puis tu **vérifies** chaque opération avec des valeurs dont tu connais le résultat attendu (triangle 3-4-5, vecteurs unitaires, identité). Pas de gap-fill : tu produis le code entier.

**Contraintes :**
- `Vec3` **immuable** — chaque opération renvoie un nouveau `Vec3`, ne mute jamais `this`.
- `Mat4` stockée en **column-major** dans un `Float32Array(16)` (prêt pour le GPU).
- Tu **prouves** chaque méthode par un `console.log` dont tu as calculé le résultat à la main **avant** de lancer.

### Starter minimal

Crée deux fichiers dans un dossier vide.

`index.html` :

```html
<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Lab 01 — Algèbre linéaire</title></head>
  <body>
    <p>Ouvre la console (F12) pour voir les vérifications.</p>
    <script type="module" src="./math.js"></script>
  </body>
</html>
```

`math.ts` (compile en `math.js`, ou écris directement du JS moderne — pas de bundler nécessaire) :

```ts
// math.ts — À COMPLÉTER
class Vec3 {
  constructor(
    public readonly x: number,
    public readonly y: number,
    public readonly z: number,
  ) {}

  // À écrire : add, sub, scale, length, lengthSquared, normalize, dot, cross
}

class Mat4 {
  constructor(public readonly data = new Float32Array(16)) {}

  // À écrire : static identity(), multiply(other), transformPoint(p)
}

// À écrire : tes vérifications console.log ici
```

Ouvre `index.html` dans Chrome (double-clic ou `npx serve`), puis F12 → Console.

---

## Étapes (en friction)

1. **Écris `add`, `sub`, `scale`** — composante par composante, renvoie un nouveau `Vec3`. Vérifie : `(3,2,0).add(2,3,0)` doit donner `(5,5,0)`.
2. **Écris `lengthSquared` puis `length`** — Pythagore. Vérifie sur le triangle 3-4-5 : `(3,4,0).length() === 5`.
3. **Écris `normalize`** — divise par la longueur, gère le cas longueur 0. Vérifie : `(3,4,0).normalize()` = `(0.6, 0.8, 0)`, et sa longueur = 1.
4. **Écris `dot`** — retourne un **nombre**. Vérifie les 3 cas des vecteurs unitaires : même sens → 1, perpendiculaires → 0, opposés → -1.
5. **Écris `cross`** — retourne un **vecteur**. Vérifie que la normale du triangle `(0,0,0),(1,0,0),(0,1,0)` pointe vers `+Z` = `(0,0,1)`. Puis inverse l'ordre des arêtes et constate que la normale pointe vers `-Z`.
6. **Écris `Mat4.identity()` et `multiply`** — attention au column-major : élément `(row,col)` = `data[col*4 + row]`. Vérifie que `identity × identity = identity`.
7. **Écris `transformPoint`** — `M × (x,y,z,1)`. Vérifie que l'identité ne bouge pas le point `(2,3,4)`.
8. **Bonus vérif métier** — code `latLonToVec3(lat, lon)` (formule dans le corrigé) et affiche la position 3D d'une sortie à Lyon `(45.76, 4.83)`. Vérifie que la longueur du vecteur ≈ 1 (point sur la sphère unité).

---

## Corrigé complet commenté

```ts
// math.ts — corrigé
class Vec3 {
  constructor(
    public readonly x: number,
    public readonly y: number,
    public readonly z: number,
  ) {}

  static readonly ZERO = new Vec3(0, 0, 0)

  // Composante par composante. Immuable : nouveau Vec3 à chaque fois.
  add(o: Vec3): Vec3 { return new Vec3(this.x + o.x, this.y + o.y, this.z + o.z) }
  sub(o: Vec3): Vec3 { return new Vec3(this.x - o.x, this.y - o.y, this.z - o.z) }
  scale(k: number): Vec3 { return new Vec3(this.x * k, this.y * k, this.z * k) }

  // Pythagore. lengthSquared évite le sqrt quand on veut juste comparer.
  lengthSquared(): number { return this.x ** 2 + this.y ** 2 + this.z ** 2 }
  length(): number { return Math.sqrt(this.lengthSquared()) }

  // Divise par la longueur → vecteur unitaire. Garde-fou sur la longueur 0.
  normalize(): Vec3 {
    const len = this.length()
    return len === 0 ? Vec3.ZERO : this.scale(1 / len)
  }

  // dot : NOMBRE. Si a et b normalisés, = cos(angle).
  dot(o: Vec3): number { return this.x * o.x + this.y * o.y + this.z * o.z }

  // cross : VECTEUR perpendiculaire aux deux. a×b = -(b×a).
  cross(o: Vec3): Vec3 {
    return new Vec3(
      this.y * o.z - this.z * o.y,
      this.z * o.x - this.x * o.z,
      this.x * o.y - this.y * o.x,
    )
  }
}

class Mat4 {
  constructor(public readonly data = new Float32Array(16)) {}

  // Identité : 1 sur la diagonale (indices 0,5,10,15), 0 ailleurs.
  static identity(): Mat4 {
    const m = new Mat4()
    m.data[0] = 1; m.data[5] = 1; m.data[10] = 1; m.data[15] = 1
    return m
  }

  // this × other, column-major. (row,col) = data[col*4 + row].
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

  // M × (x,y,z,1). Perspective divide si w final ≠ 1.
  transformPoint(p: Vec3): Vec3 {
    const m = this.data
    const x = m[0] * p.x + m[4] * p.y + m[8]  * p.z + m[12]
    const y = m[1] * p.x + m[5] * p.y + m[9]  * p.z + m[13]
    const z = m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14]
    const w = m[3] * p.x + m[7] * p.y + m[11] * p.z + m[15]
    return w !== 0 && w !== 1 ? new Vec3(x / w, y / w, z / w) : new Vec3(x, y, z)
  }
}

// lat/lon (degrés) → position sur la sphère unité (Y-up)
function latLonToVec3(latDeg: number, lonDeg: number): Vec3 {
  const lat = (latDeg * Math.PI) / 180
  const lon = (lonDeg * Math.PI) / 180
  return new Vec3(
    Math.cos(lat) * Math.sin(lon),
    Math.sin(lat),
    Math.cos(lat) * Math.cos(lon),
  )
}

// ── Vérifications (résultats calculés à la main AVANT exécution) ──
console.log(new Vec3(3, 2, 0).add(new Vec3(2, 3, 0)))   // Vec3(5, 5, 0)
console.log(new Vec3(3, 4, 0).length())                 // 5  (triangle 3-4-5)
console.log(new Vec3(3, 4, 0).normalize())              // Vec3(0.6, 0.8, 0)
console.log(new Vec3(3, 4, 0).normalize().length())     // 1

const ux = new Vec3(1, 0, 0), uy = new Vec3(0, 1, 0)
console.log(ux.dot(ux))                                 // 1  (même sens)
console.log(ux.dot(uy))                                 // 0  (perpendiculaires)
console.log(ux.dot(ux.scale(-1)))                       // -1 (opposés)

const v0 = new Vec3(0, 0, 0), v1 = new Vec3(1, 0, 0), v2 = new Vec3(0, 1, 0)
console.log(v1.sub(v0).cross(v2.sub(v0)).normalize())   // Vec3(0, 0, 1)  → +Z
console.log(v2.sub(v0).cross(v1.sub(v0)).normalize())   // Vec3(0, 0, -1) → ordre inversé

const I = Mat4.identity()
console.log(I.multiply(I).data.join(','))               // 1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1
console.log(I.transformPoint(new Vec3(2, 3, 4)))        // Vec3(2, 3, 4)

const lyon = latLonToVec3(45.76, 4.83)
console.log(lyon, 'longueur =', lyon.length().toFixed(4)) // longueur ≈ 1.0000
```

**Pourquoi ce corrigé est correct :**
- `Vec3` est **immuable** : aucune méthode ne modifie `this`, ce qui évite les bugs d'alias (un point partagé entre deux sorties qui bougeraient ensemble par erreur).
- La vérif `cross` teste **les deux ordres** : ça prouve la non-commutativité `a×b = -(b×a)` et ancre le lien avec le winding order.
- `multiply` respecte l'indexation column-major (`col*4 + row`) : `identity × identity` doit rendre exactement l'identité — si un `1` se retrouve ailleurs que sur la diagonale, l'indexation est fausse.
- La longueur du vecteur `latLonToVec3` vaut ≈ 1 car un point sur la sphère unité est à distance 1 de l'origine — c'est la preuve que la formule est bonne.

---

## Variante J+30 (fading)

**Même socle, contraintes ajoutées. En 30 minutes, sans rouvrir ce corrigé ni le module :**

1. Ajoute `Vec3.angleTo(other)` qui retourne l'angle en radians entre deux vecteurs — **avec le clamp** avant `Math.acos` (sinon `NaN`). Vérifie : `ux.angleTo(uy)` ≈ `1.5708` (π/2).
2. Ajoute `Vec3.projectOnto(other)` : la projection `(a·b / b·b) * b`. Vérifie : `(3,4,0)` projeté sur l'axe X `(1,0,0)` = `(3,0,0)`.
3. Écris `estVisible(pointSurGlobe, positionCamera)` (produit scalaire normale·caméra > 0) et teste qu'une sortie à Lyon est visible depuis une caméra en `(0,0,5)` mais cachée depuis `(0,0,-5)`.

**Critère de réussite :** les trois vérifications passent dans la console, et tu expliques à voix haute pourquoi `angleTo` a besoin du clamp.

---

## Application TribuZen

Dans le repo `smaurier/tribuzen`, ce socle vit ici :

```
tribuzen/
  src/
    three/
      math/
        Vec3.ts          ← ce lab
        Mat4.ts          ← ce lab
      globe/
        latLonToVec3.ts  ← positionnement des sorties sur le globe
        visibility.ts    ← estVisible() (variante J+30)
```

**Différences par rapport au lab :**
- En vrai produit, on **n'écrit pas** son propre `Vec3`/`Mat4` : on utilise `three` (`THREE.Vector3`, `THREE.Matrix4`) ou `gl-matrix`. Ce lab te fait coder la version « from scratch » **une fois** pour comprendre ce que ces libs font en interne — indispensable pour débugger.
- Les positions viendront des vraies sorties stockées en base (lat/lon de chaque événement famille), pas de valeurs en dur.
- La matrice de rotation du globe sera construite au **module 02** ; ici on a seulement l'algèbre qui la consomme.

**Commit cible :**
```
feat(globe): socle algèbre 3D (Vec3, Mat4) + positionnement lat/lon des sorties
```
