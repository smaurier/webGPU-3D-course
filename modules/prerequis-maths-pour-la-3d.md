# Prerequis — Maths pour la 3D (depuis zero)

| Difficulte | Duree estimee | Lab | Quiz |
|:----------:|:-------------:|:---:|:----:|
| 0/5        | 120 min       | --  | --   |

## Objectifs pedagogiques

A la fin de ce module, vous serez capable de :

- Manipuler les nombres entiers, decimaux et negatifs dans un contexte 3D
- Comprendre et implementer l'interpolation lineaire (`lerp`)
- Lire la notation scientifique utilisee par les GPU (epsilon, distances)
- Comprendre les fonctions mathematiques et leur composition
- Convertir degres en radians et vice-versa
- Utiliser sin, cos, tan et atan2 pour les rotations et les angles
- Calculer des distances en 2D et 3D avec le theoreme de Pythagore
- Manipuler des vecteurs : longueur, normalisation, addition, scalaire
- Calculer un produit scalaire et comprendre son interpretation geometrique
- Avoir une intuition du produit vectoriel et des matrices
- Implementer lerp, clamp, smoothstep et les fonctions d'easing

---

## Analogie : les maths 3D, c'est comme le CSS

:::tip Analogie pour developpeurs web
Vous connaissez deja plus de maths 3D que vous ne le pensez. Quand vous ecrivez en CSS :

```css
transform: translate(100px, 50px) rotate(45deg) scale(1.5);
```

Vous faites **exactement** ce qu'on fait en 3D : deplacer, tourner, redimensionner. La seule difference : en CSS, le navigateur fait les maths pour vous. En 3D, c'est vous qui les faites.

Ce module part de zero — niveau 6eme — et vous amene progressivement jusqu'au niveau necessaire pour comprendre les transformations 3D. Pas de panique : si vous savez coder, vous savez deja penser de facon logique. Les maths, c'est juste une autre facon de coder.
:::

---

## 1. Les nombres et les proportions

### Les nombres dont on a besoin en 3D

En 3D, on utilise trois familles de nombres :

```
LES NOMBRES EN 3D
══════════════════════════════════════════════════════════════

  Entiers (integers)     Decimaux (floats)      Negatifs
  ────────────────       ─────────────────      ─────────
  0, 1, 2, 42           0.5, 3.14, 0.001      -1, -0.5, -100

  Nombre de triangles    Position x = 1.5      "A gauche" = -x
  Nombre de pixels       Couleur r = 0.78      "En bas" = -y
  Index dans un buffer   Angle = 0.785 rad     "Derriere" = -z
```

En pratique, le GPU travaille presque exclusivement avec des **nombres a virgule flottante** (`float`). En TypeScript, c'est le type `number`. En WGSL (le langage du GPU), c'est `f32` (float 32 bits).

```typescript
// En 3D, tout est un nombre decimal
const positionX: number = 3.5;    // Position d'un objet
const rouge: number = 0.8;        // Composante rouge (0.0 a 1.0)
const angle: number = 1.5708;     // Angle en radians (≈ 90 degres)
const deltaTime: number = 0.016;  // Temps entre deux frames (~60 FPS)
```

### Pourcentages et proportions

En 3D, on exprime souvent les choses en **proportion** (un nombre entre 0 et 1) plutot qu'en pourcentage :

```
PROPORTIONS EN 3D
══════════════════════════════════════════════════════════════

  Pourcentage       Proportion (0-1)       Utilisation 3D
  ───────────       ────────────────       ──────────────
  0%                0.0                    Rien, debut
  25%               0.25                   Quart du chemin
  50%               0.5                    Milieu
  75%               0.75                   Trois quarts
  100%              1.0                    Fin, maximum

  Exemple : une couleur rouge a 80% d'intensite → r = 0.8
  Exemple : une animation a mi-parcours → t = 0.5
```

### L'interpolation lineaire (lerp)

C'est **la** formule la plus utilisee en 3D, en animation, en jeux video. Elle repond a une question simple : "comment aller de A a B progressivement ?"

```
INTERPOLATION LINEAIRE (lerp)
══════════════════════════════════════════════════════════════

  Formule : lerp(a, b, t) = a + (b - a) * t

  a = valeur de depart
  b = valeur d'arrivee
  t = progression (0.0 = depart, 1.0 = arrivee)

  Exemple : lerp(0, 100, 0.5) = 0 + (100 - 0) * 0.5 = 50
  Exemple : lerp(10, 20, 0.25) = 10 + (20 - 10) * 0.25 = 12.5

  Visuellement :

  a=0 ────────|────────────── b=100
  t=0    t=0.25   t=0.5   t=0.75   t=1.0
  0        25       50       75       100
```

```typescript
// ── lerp : la fonction la plus importante de la 3D ──────

/**
 * Interpolation lineaire entre a et b.
 *
 * t = 0 → retourne a
 * t = 1 → retourne b
 * t = 0.5 → retourne le milieu entre a et b
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Exemples concrets
console.log(lerp(0, 100, 0.0));   // 0   — depart
console.log(lerp(0, 100, 0.5));   // 50  — milieu
console.log(lerp(0, 100, 1.0));   // 100 — arrivee
console.log(lerp(0, 100, 0.25));  // 25  — un quart

// Animation : deplacer un objet de x=10 a x=50 sur 60 frames
for (let frame = 0; frame <= 60; frame++) {
  const t = frame / 60;            // t va de 0 a 1
  const x = lerp(10, 50, t);       // x va de 10 a 50
  // Ici on dessinerait l'objet a la position x
}
```

:::tip Analogie developpeur
`lerp` c'est comme une transition CSS : `transition: left 1s linear`. Le navigateur fait un `lerp` entre la valeur de depart et la valeur d'arrivee, avec `t` qui va de 0 a 1 pendant la duree de la transition.
:::

### Notation scientifique

Les GPU utilisent souvent des nombres tres grands ou tres petits. TypeScript (et JavaScript) supportent la notation scientifique :

```typescript
// Notation scientifique : 1e-6 = 0.000001, 1e3 = 1000

const epsilon = 1e-6;    // 0.000001 — seuil de precision
const farPlane = 1e4;    // 10000 — distance maximale visible
const nearPlane = 1e-1;  // 0.1 — distance minimale visible

// Pourquoi epsilon ?
// Les nombres a virgule flottante ne sont pas parfaitement precis.
// 0.1 + 0.2 = 0.30000000000000004 en JavaScript !
// On compare donc avec une marge d'erreur (epsilon).

function approximately(a: number, b: number, eps: number = 1e-6): boolean {
  return Math.abs(a - b) < eps;
}

console.log(0.1 + 0.2 === 0.3);                // false !
console.log(approximately(0.1 + 0.2, 0.3));     // true
```

---

## 2. Les fonctions

### Qu'est-ce qu'une fonction mathematique ?

Une fonction prend une entree et donne une sortie. C'est exactement comme une fonction TypeScript — ou comme un composant Vue qui prend des props et rend du HTML.

```
QU'EST-CE QU'UNE FONCTION ?
══════════════════════════════════════════════════════════════

  Maths :    f(x) = 2x + 3
  TypeScript: function f(x: number): number { return 2 * x + 3; }
  Vue :       <Composant :x="5" /> → affiche 13

  Entree (x)   →   [ Boite noire ]   →   Sortie f(x)
     5          →   [ 2 * 5 + 3  ]   →      13
     0          →   [ 2 * 0 + 3  ]   →       3
    -1          →   [ 2 *-1 + 3  ]   →       1
```

### Fonctions courantes en 3D

```typescript
// ── Fonctions lineaires : f(x) = ax + b ────────────────
// Une droite. Utilisee partout : interpolation, mapping de valeurs.

function lineaire(x: number): number {
  const a = 2;  // pente (steepness)
  const b = 3;  // ordonnee a l'origine (offset)
  return a * x + b;
}

// ── Fonction quadratique : f(x) = x² ───────────────────
// Croissance acceleree. Utilisee pour la gravite, l'attenuation de lumiere.

function quadratique(x: number): number {
  return x * x;
}

// ── Racine carree : f(x) = sqrt(x) ─────────────────────
// L'inverse de x². Utilisee pour calculer des distances.

function racineCarree(x: number): number {
  return Math.sqrt(x);
}

// ── Valeur absolue : f(x) = |x| ────────────────────────
// Toujours positif. Utilisee pour des distances sans direction.

function valeurAbsolue(x: number): number {
  return Math.abs(x);
}
```

### Graphes : abscisse et ordonnee

Un graphe permet de visualiser une fonction. L'axe horizontal s'appelle **l'abscisse** (x), l'axe vertical s'appelle **l'ordonnee** (y).

```
GRAPHE DE f(x) = 2x + 3
══════════════════════════════════════════════════════════════

  y (ordonnee)
  │
 9├─────────────────────────●  f(3) = 9
  │                       ╱
 7├───────────────────●  ╱     f(2) = 7
  │                 ╱  ╱
 5├───────────●   ╱  ╱         f(1) = 5
  │         ╱   ╱  ╱
 3├───●   ╱   ╱  ╱             f(0) = 3
  │     ╱   ╱  ╱
 1├───────╱──╱─────────────── x (abscisse)
  │     ╱  ╱
  └──┼──┼──┼──┼──┼──┼──┼──→
    -1  0  1  2  3  4  5

  La pente (a=2) indique que y augmente de 2 quand x augmente de 1.
  L'ordonnee a l'origine (b=3) est la valeur de y quand x=0.


GRAPHE DE f(x) = x²
══════════════════════════════════════════════════════════════

  y
  │
 9├●─────────────────────────●  f(-3) = f(3) = 9
  │
  │
  │
 4├──●───────────────────●      f(-2) = f(2) = 4
  │
  │
 1├────●─────────────●          f(-1) = f(1) = 1
  │
 0├──────────●                  f(0) = 0
  └──┼──┼──┼──┼──┼──┼──┼──→ x
    -3 -2 -1  0  1  2  3

  Symetrique : f(-x) = f(x). La parabole.
```

### Composition de fonctions

Composer des fonctions, c'est enchainer des transformations. C'est comme les pipes Unix ou les composables Vue.

```typescript
// Composition : f(g(x)) — on applique g d'abord, puis f

function double(x: number): number { return x * 2; }
function addThree(x: number): number { return x + 3; }

// f(g(x)) : d'abord doubler, puis ajouter 3
const result = addThree(double(5));  // double(5) = 10, addThree(10) = 13

// En 3D, on compose des transformations :
// position finale = rotation(translation(scale(position_originale)))
// C'est comme les transformations CSS empilees !
```

:::tip Analogie Unix / Vue
```bash
# Unix pipe : chaque commande transforme la sortie de la precedente
cat data.txt | sort | uniq | head -10
# = head(uniq(sort(cat("data.txt"))))
```

```typescript
// Composable Vue : chaque fonction enrichit le resultat
const { data } = useFetch('/api/items')
const filtered = computed(() => data.value?.filter(isActive))
const sorted = computed(() => filtered.value?.sort(byDate))
// Chaque etape transforme le resultat de la precedente
```
:::

---

## 3. La trigonometrie (essentielle pour la 3D)

La trigonometrie est **partout** en 3D : rotations, cameras, eclairage, animations circulaires. Cette section est la plus importante du module.

### Le cercle et les angles

Il y a deux facons de mesurer un angle : les **degres** (que les humains utilisent) et les **radians** (que les maths et les GPU utilisent).

```
DEGRES vs RADIANS
══════════════════════════════════════════════════════════════

  Un tour complet :
    360 degres  =  2 * PI radians  ≈  6.2832 radians

  Conversions courantes :
    0°    =  0 rad
    30°   =  PI/6   ≈ 0.5236 rad
    45°   =  PI/4   ≈ 0.7854 rad
    90°   =  PI/2   ≈ 1.5708 rad
    180°  =  PI     ≈ 3.1416 rad
    270°  =  3PI/2  ≈ 4.7124 rad
    360°  =  2PI    ≈ 6.2832 rad

  Le cercle en degres :          Le cercle en radians :

          90°                          PI/2
           │                            │
  180° ────┼──── 0°           PI ───────┼─────── 0
           │                            │
          270°                        3PI/2
```

### Conversion degres <-> radians

```typescript
// ── Conversion degres <-> radians ───────────────────────

/**
 * Convertir des degres en radians.
 * Formule : radians = degres * (PI / 180)
 */
function degToRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Convertir des radians en degres.
 * Formule : degres = radians * (180 / PI)
 */
function radToDeg(radians: number): number {
  return radians * (180 / Math.PI);
}

// Tests
console.log(degToRad(90));    // 1.5707963... ≈ PI/2
console.log(degToRad(180));   // 3.1415926... ≈ PI
console.log(degToRad(360));   // 6.2831853... ≈ 2*PI

console.log(radToDeg(Math.PI));       // 180
console.log(radToDeg(Math.PI / 2));   // 90
console.log(radToDeg(2 * Math.PI));   // 360
```

:::warning Point cle
Toutes les fonctions trigonometriques de JavaScript (`Math.sin`, `Math.cos`, `Math.atan2`, etc.) travaillent en **radians**, pas en degres. C'est la source d'erreur #1 des debutants en 3D. Convertissez toujours vos degres en radians avant d'appeler ces fonctions !
:::

### Sin et cos visuellement

Imaginez un point qui se deplace sur un cercle de rayon 1 (le **cercle unite**). L'angle de ce point par rapport a l'horizontale s'appelle **theta** (θ).

- **cos(θ)** = la position horizontale (x) du point
- **sin(θ)** = la position verticale (y) du point

```
LE CERCLE UNITE : sin et cos
══════════════════════════════════════════════════════════════

              sin(θ) = y
                 ↑
            ╭────┼────╮
          ╱      │   ●  ╲        ● = point sur le cercle
        ╱        │  ╱│    ╲      angle θ depuis l'axe x
       │         │╱  │     │
  ─────┼─────────┼───┼─────┼──→ cos(θ) = x
       │         │   │     │
        ╲        │   │    ╱
          ╲      │   │  ╱
            ╰────┼───┼╯
                 │
                 ↓

  Le point ● est a l'angle θ.
  Sa coordonnee x = cos(θ)
  Sa coordonnee y = sin(θ)

  Le rayon du cercle = 1, donc :
  cos²(θ) + sin²(θ) = 1     (theoreme de Pythagore !)


  VALEURS REMARQUABLES :

  θ = 0°    (0 rad)      →  cos = 1,    sin = 0     (droite)
  θ = 90°   (PI/2 rad)   →  cos = 0,    sin = 1     (haut)
  θ = 180°  (PI rad)     →  cos = -1,   sin = 0     (gauche)
  θ = 270°  (3PI/2 rad)  →  cos = 0,    sin = -1    (bas)
  θ = 45°   (PI/4 rad)   →  cos ≈ 0.707, sin ≈ 0.707
```

```typescript
// ── Verification des valeurs remarquables ───────────────

console.log('sin(0) =', Math.sin(0));                  // 0
console.log('cos(0) =', Math.cos(0));                  // 1
console.log('sin(PI/2) =', Math.sin(Math.PI / 2));     // 1
console.log('cos(PI/2) =', Math.cos(Math.PI / 2));     // ~0 (6.12e-17)
console.log('sin(PI) =', Math.sin(Math.PI));            // ~0 (1.22e-16)
console.log('cos(PI) =', Math.cos(Math.PI));            // -1
console.log('sin(PI/4) =', Math.sin(Math.PI / 4));     // ~0.7071
console.log('cos(PI/4) =', Math.cos(Math.PI / 4));     // ~0.7071

// Identite fondamentale : sin² + cos² = 1
const angle = 1.234; // n'importe quel angle
const sinVal = Math.sin(angle);
const cosVal = Math.cos(angle);
console.log('sin² + cos² =', sinVal * sinVal + cosVal * cosVal); // 1.0

// Utilisation pratique : faire tourner un point autour d'un centre
function pointOnCircle(
  centerX: number,
  centerY: number,
  radius: number,
  angleRad: number,
): { x: number; y: number } {
  return {
    x: centerX + radius * Math.cos(angleRad),
    y: centerY + radius * Math.sin(angleRad),
  };
}

// Dessiner 8 points en cercle (comme une horloge)
for (let i = 0; i < 8; i++) {
  const angle = (i / 8) * 2 * Math.PI; // Repartir 8 angles sur 360°
  const point = pointOnCircle(0, 0, 100, angle);
  console.log(`Point ${i}: (${point.x.toFixed(1)}, ${point.y.toFixed(1)})`);
}
```

### Le triangle rectangle : SOH-CAH-TOA

En 3D, on travaille constamment avec des triangles rectangles (triangles qui ont un angle de 90°). Les fonctions sin, cos et tan relient les cotes du triangle a ses angles.

```
LE TRIANGLE RECTANGLE
══════════════════════════════════════════════════════════════

                    ╱│
                  ╱  │
   Hypotenuse  ╱    │  Oppose
    (hyp)    ╱      │  (opp)
           ╱        │
         ╱ θ        │
        ╱────────────│
          Adjacent
            (adj)

  SOH :  sin(θ) = Oppose / Hypotenuse    →  opp = hyp * sin(θ)
  CAH :  cos(θ) = Adjacent / Hypotenuse  →  adj = hyp * cos(θ)
  TOA :  tan(θ) = Oppose / Adjacent       →  opp = adj * tan(θ)

  Moyen mnemotechnique : "SOH-CAH-TOA"
  (prononcez "so-ca-toa" — ca se retient tout seul !)

  RELATION IMPORTANTE :
  tan(θ) = sin(θ) / cos(θ)
```

```typescript
// ── SOH-CAH-TOA en pratique ─────────────────────────────

// Scenario : une camera regarde un objet au sol depuis une hauteur de 10m.
// L'angle de vue vers le bas est de 30°. A quelle distance horizontale
// est l'objet ?

const hauteur = 10;                    // oppose = 10m
const angleVue = degToRad(30);         // 30 degres en radians

// tan(θ) = oppose / adjacent
// Donc : adjacent = oppose / tan(θ)
const distanceHorizontale = hauteur / Math.tan(angleVue);
console.log('Distance:', distanceHorizontale.toFixed(2)); // 17.32m

// Verification avec sin et cos :
const hypotenuse = hauteur / Math.sin(angleVue); // hyp = opp / sin
console.log('Hypotenuse:', hypotenuse.toFixed(2)); // 20.00m

const adjVerif = hypotenuse * Math.cos(angleVue); // adj = hyp * cos
console.log('Distance (verif):', adjVerif.toFixed(2)); // 17.32m
```

### atan2(y, x) : retrouver l'angle depuis les coordonnees

`atan2` est la fonction inverse de sin/cos combinee. Elle repond a la question : "j'ai un point (x, y), quel est l'angle ?"

```
ATAN2 : RETROUVER L'ANGLE
══════════════════════════════════════════════════════════════

  Math.atan2(y, x) retourne l'angle en radians entre -PI et PI.

  Attention a l'ordre : atan2(Y, X), pas atan2(X, Y) !

           y+
           │  ● (3, 4)
           │ ╱
           │╱ θ = atan2(4, 3) ≈ 0.927 rad ≈ 53.1°
  ─────────┼───────── x+
           │
           │

  Pourquoi atan2 plutot que atan ?
  - atan(y/x) ne distingue pas les quadrants (confusion 0° et 180°)
  - atan2(y, x) donne l'angle correct dans les 4 quadrants
  - atan2 gere le cas x=0 (atan ferait une division par zero)
```

```typescript
// ── atan2 en pratique ───────────────────────────────────

// Trouver l'angle d'un point par rapport a l'origine
const x = 3;
const y = 4;
const angleRad = Math.atan2(y, x);
console.log('Angle (rad):', angleRad.toFixed(4));     // 0.9273
console.log('Angle (deg):', radToDeg(angleRad).toFixed(1));  // 53.1°

// Faire tourner un personnage pour "regarder" un point cible
function angleBetweenPoints(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): number {
  const dx = toX - fromX;
  const dy = toY - fromY;
  return Math.atan2(dy, dx);
}

// Un personnage en (0, 0) regarde vers un ennemi en (10, 10)
const lookAngle = angleBetweenPoints(0, 0, 10, 10);
console.log('Angle de visee:', radToDeg(lookAngle).toFixed(1)); // 45.0°

// Un personnage en (5, 5) regarde vers un ennemi en (5, 10)
const lookAngle2 = angleBetweenPoints(5, 5, 5, 10);
console.log('Angle de visee:', radToDeg(lookAngle2).toFixed(1)); // 90.0° (pile au-dessus)
```

### Identites trigonometriques utiles en 3D

```typescript
// ── Identites utilisees en 3D ───────────────────────────

// 1. Identite fondamentale : sin²(θ) + cos²(θ) = 1
//    → Utilisee pour normaliser, verifier des calculs

// 2. Formules de rotation 2D :
//    x' = x * cos(θ) - y * sin(θ)
//    y' = x * sin(θ) + y * cos(θ)
//    → C'est la BASE de toutes les rotations en 3D

function rotate2D(
  x: number,
  y: number,
  angleRad: number,
): { x: number; y: number } {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  };
}

// Faire tourner le point (1, 0) de 90 degres
const rotated = rotate2D(1, 0, degToRad(90));
console.log(`(${rotated.x.toFixed(2)}, ${rotated.y.toFixed(2)})`);
// → (0.00, 1.00) — le point a tourne vers le haut

// Faire tourner le point (1, 0) de 45 degres
const rotated45 = rotate2D(1, 0, degToRad(45));
console.log(`(${rotated45.x.toFixed(2)}, ${rotated45.y.toFixed(2)})`);
// → (0.71, 0.71) — a mi-chemin entre droite et haut
```

---

## 4. Les coordonnees

### Systeme de coordonnees 2D

Un systeme de coordonnees, c'est comme un plan avec une adresse pour chaque point. L'axe X va de gauche a droite, l'axe Y va de bas en haut.

```
SYSTEME DE COORDONNEES 2D
══════════════════════════════════════════════════════════════

  y
  │
  4├          ● B(3, 4)
  │         ╱
  3├       ╱
  │      ╱
  2├   ● A(1, 2)
  │
  1├
  │
  0├──┼──┼──┼──┼──┼──→ x
     1  2  3  4  5

  Le point A est a 1 unite a droite et 2 unites en haut.
  Le point B est a 3 unites a droite et 4 unites en haut.

  Les coordonnees negatives :

  y
  2├       ●(2, 2)
  │
  0├───┼───┼───┼──→ x
  │
 -2├       ●(2, -2)
  │
  └──-2──0──2──4

  (2, -2) est a droite et en bas.
  (-2, 2) est a gauche et en haut.
```

### Distance entre deux points : le theoreme de Pythagore

Le theoreme de Pythagore est l'outil fondamental pour calculer des distances. Dans un triangle rectangle : **a² + b² = c²** (ou c est l'hypotenuse).

```
DISTANCE ENTRE DEUX POINTS
══════════════════════════════════════════════════════════════

  Pour trouver la distance entre A(1, 2) et B(4, 6) :

  y
  6├────────────● B(4, 6)
  │            │
  │            │ dy = 6 - 2 = 4
  │            │
  2├● A(1, 2)──┘
  │   dx = 4 - 1 = 3
  └──┼──┼──┼──┼──┼──→ x
     1  2  3  4  5

  dx = 4 - 1 = 3
  dy = 6 - 2 = 4

  distance = sqrt(dx² + dy²)
           = sqrt(3² + 4²)
           = sqrt(9 + 16)
           = sqrt(25)
           = 5

  C'est un triangle 3-4-5 ! (le plus celebre des triangles rectangles)
```

```typescript
// ── Distance 2D ─────────────────────────────────────────

/**
 * Distance entre deux points en 2D.
 * Formule : sqrt((x2-x1)² + (y2-y1)²)
 */
function distance2D(
  x1: number, y1: number,
  x2: number, y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

// Test avec le triangle 3-4-5
console.log(distance2D(1, 2, 4, 6)); // 5

// Distance entre l'origine et un point
console.log(distance2D(0, 0, 3, 4)); // 5
console.log(distance2D(0, 0, 1, 1)); // ~1.414 = sqrt(2)
```

### Systeme de coordonnees 3D : l'axe Z

En 3D, on ajoute un troisieme axe : **Z** (la profondeur).

```
SYSTEME DE COORDONNEES 3D
══════════════════════════════════════════════════════════════

  Convention Y-up (WebGL, WebGPU, Three.js) :

      y (haut)
      │
      │    z (vers nous / profondeur)
      │   ╱
      │  ╱
      │ ╱
      │╱
      └───────── x (droite)

  Un point 3D : P(x, y, z)
  Exemple : P(3, 5, -2) est a droite, en haut, et devant nous

  ATTENTION aux conventions :

  │ Convention │ Y-up (Three.js, WebGL)  │ Z-up (Blender)       │
  │────────────│─────────────────────────│──────────────────────│
  │ Droite     │ +X                      │ +X                   │
  │ Haut       │ +Y                      │ +Z                   │
  │ Devant     │ -Z                      │ +Y                   │

  Dans ce cours, on utilise la convention Y-up (Three.js / WebGL / WebGPU).
  -Z pointe "devant la camera" par defaut.
```

### Distance 3D

La distance 3D est une extension naturelle du theoreme de Pythagore :

```typescript
// ── Distance 3D ─────────────────────────────────────────

/**
 * Distance entre deux points en 3D.
 * Formule : sqrt((x2-x1)² + (y2-y1)² + (z2-z1)²)
 *
 * C'est le theoreme de Pythagore en 3D !
 */
function distance3D(
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dz = z2 - z1;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Test
console.log(distance3D(0, 0, 0, 1, 2, 2)); // 3
// Verification : sqrt(1² + 2² + 2²) = sqrt(1 + 4 + 4) = sqrt(9) = 3

// Utilisation : est-ce que deux objets se touchent ?
function areObjectsClose(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  threshold: number,
): boolean {
  return distance3D(ax, ay, az, bx, by, bz) < threshold;
}

console.log(areObjectsClose(0, 0, 0, 1, 1, 1, 5));   // true (dist ≈ 1.73)
console.log(areObjectsClose(0, 0, 0, 10, 10, 10, 5)); // false (dist ≈ 17.32)
```

:::tip Optimisation GPU
Calculer `sqrt` est couteux. Quand on veut juste **comparer** des distances (sans connaitre la valeur exacte), on compare les distances **au carre** pour eviter le `sqrt` :

```typescript
function distanceSquared3D(
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dz = z2 - z1;
  return dx * dx + dy * dy + dz * dz; // Pas de sqrt !
}

// Au lieu de : distance < 5
// On ecrit :  distanceSquared < 5 * 5 = 25
// C'est mathematiquement equivalent, mais plus rapide.
```
:::

---

## 5. Les vecteurs (intuition)

### Qu'est-ce qu'un vecteur ?

Un vecteur est une **fleche** qui a une direction et une longueur. Ce n'est PAS une position — c'est un **deplacement**, un **delta**.

```
VECTEUR vs POINT
══════════════════════════════════════════════════════════════

  Un POINT = une position (une adresse)
    "Je suis au point (3, 4)"

  Un VECTEUR = un deplacement (une direction + une distance)
    "Je me deplace de (2, 1)" = 2 unites a droite, 1 unite en haut

  Analogie GPS :
    Point  = "Tu es au 15 rue de la Paix"   (latitude, longitude)
    Vecteur = "Avance de 100m vers le nord"  (direction + distance)


  y
  │
  5├       B(5, 5)
  │       ↗
  4├     ╱      Le vecteur AB = B - A = (5-1, 5-2) = (4, 3)
  │    ╱        Direction : haut-droite
  3├  ╱         Longueur : sqrt(4² + 3²) = 5
  │ ╱
  2├ A(1, 2)
  │
  └──┼──┼──┼──┼──┼──┼──→ x
     1  2  3  4  5  6

  Le meme vecteur (4, 3) peut partir de n'importe quel point.
  Il represente toujours "4 a droite, 3 en haut".
```

### Representation en TypeScript

```typescript
// ── Un vecteur 3D simple ────────────────────────────────

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// Creer un vecteur
const deplacement: Vec3 = { x: 4, y: 3, z: 0 };

// Vecteurs remarquables
const ZERO: Vec3  = { x: 0, y: 0, z: 0 };  // Pas de mouvement
const UP: Vec3    = { x: 0, y: 1, z: 0 };   // Vers le haut
const RIGHT: Vec3 = { x: 1, y: 0, z: 0 };   // Vers la droite
const FORWARD: Vec3 = { x: 0, y: 0, z: -1 }; // Devant (convention WebGL)
```

### Longueur (magnitude) d'un vecteur

La longueur d'un vecteur, c'est la distance qu'il represente. On l'appelle aussi la **magnitude** ou la **norme**.

```typescript
// ── Longueur d'un vecteur ───────────────────────────────

/**
 * Longueur (magnitude) d'un vecteur 3D.
 * C'est le theoreme de Pythagore en 3D.
 */
function vecLength(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

// Tests
console.log(vecLength({ x: 3, y: 4, z: 0 }));   // 5
console.log(vecLength({ x: 1, y: 0, z: 0 }));   // 1
console.log(vecLength({ x: 0, y: 0, z: 0 }));   // 0
console.log(vecLength({ x: 1, y: 1, z: 1 }));   // ~1.732 = sqrt(3)
```

### Vecteur unitaire (normalise)

Un vecteur **normalise** (ou **unitaire**) a une longueur de 1. Il garde sa direction, mais sa longueur est standardisee. C'est essentiel en 3D pour les directions, les normales de surface, l'eclairage.

```
NORMALISATION
══════════════════════════════════════════════════════════════

  Vecteur original : (3, 4, 0)   longueur = 5
  Vecteur normalise : (0.6, 0.8, 0)   longueur = 1

  On divise chaque composante par la longueur :
    x' = 3 / 5 = 0.6
    y' = 4 / 5 = 0.8
    z' = 0 / 5 = 0.0

  Le vecteur pointe toujours dans la meme direction,
  mais sa longueur est maintenant 1.

  Pourquoi normaliser ?
  → Pour que la "force" du vecteur ne depende que de sa direction.
  → En eclairage : la direction de la lumiere doit etre normalisee.
  → En mouvement : la direction du deplacement doit etre normalisee,
    puis on multiplie par la vitesse.
```

```typescript
// ── Normalisation ───────────────────────────────────────

/**
 * Normaliser un vecteur (lui donner une longueur de 1).
 * Retourne le vecteur zero si la longueur est 0.
 */
function vecNormalize(v: Vec3): Vec3 {
  const len = vecLength(v);
  if (len === 0) return { x: 0, y: 0, z: 0 };
  return {
    x: v.x / len,
    y: v.y / len,
    z: v.z / len,
  };
}

// Test
const dir = vecNormalize({ x: 3, y: 4, z: 0 });
console.log(dir);                    // { x: 0.6, y: 0.8, z: 0 }
console.log(vecLength(dir));         // 1 (ou tres proche)

// Utilisation : deplacer un personnage a vitesse constante
const vitesse = 5; // unites par seconde
const direction = vecNormalize({ x: 3, y: 0, z: -4 }); // direction quelconque
const deplacement2: Vec3 = {
  x: direction.x * vitesse,
  y: direction.y * vitesse,
  z: direction.z * vitesse,
};
// Le personnage se deplace a exactement 5 unites/sec,
// quelle que soit la direction choisie.
```

### Operations sur les vecteurs

```
ADDITION DE VECTEURS
══════════════════════════════════════════════════════════════

  a + b = mettre les fleches bout a bout

        ● resultat (5, 5)
       ╱│
      ╱ │
  b= ╱  │ b = (2, 3)
    ╱   │
   ╱    │
  ●─────┘
  │  a = (3, 2)
  │
  ● origine

  a + b = (3+2, 2+3) = (5, 5)


MULTIPLICATION PAR UN SCALAIRE
══════════════════════════════════════════════════════════════

  v = (2, 1)

  2 * v = (4, 2)    — meme direction, double longueur
  0.5 * v = (1, 0.5) — meme direction, moitie longueur
  -1 * v = (-2, -1)  — direction opposee, meme longueur

      -v ←─── ● ────→ v
               │
               │ 2v
               │
               ↓ (double longueur, meme direction)
```

```typescript
// ── Operations sur les vecteurs ─────────────────────────

/** Addition de deux vecteurs */
function vecAdd(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/** Soustraction de deux vecteurs */
function vecSub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/** Multiplication par un scalaire */
function vecScale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

/** Vecteur oppose */
function vecNegate(v: Vec3): Vec3 {
  return { x: -v.x, y: -v.y, z: -v.z };
}

// Tests
const a: Vec3 = { x: 3, y: 2, z: 0 };
const b: Vec3 = { x: 2, y: 3, z: 0 };

console.log(vecAdd(a, b));            // { x: 5, y: 5, z: 0 }
console.log(vecSub(b, a));            // { x: -1, y: 1, z: 0 }
console.log(vecScale(a, 2));          // { x: 6, y: 4, z: 0 }
console.log(vecNegate(a));            // { x: -3, y: -2, z: 0 }

// Utilisation : calculer le vecteur de A vers B
const posA: Vec3 = { x: 1, y: 2, z: 3 };
const posB: Vec3 = { x: 4, y: 6, z: 3 };
const aToB = vecSub(posB, posA);   // { x: 3, y: 4, z: 0 }
const dirAtoB = vecNormalize(aToB); // direction normalisee de A vers B
```

---

## 6. Produit scalaire et produit vectoriel (apercu)

### Le produit scalaire (dot product)

Le produit scalaire prend deux vecteurs et retourne un **nombre** (un scalaire). Ce nombre indique a quel point les deux vecteurs "pointent dans la meme direction".

```
PRODUIT SCALAIRE : a . b
══════════════════════════════════════════════════════════════

  Formule geometrique : a . b = |a| * |b| * cos(θ)
  Formule par composantes : a . b = ax*bx + ay*by + az*bz

  Si les deux vecteurs sont normalises (longueur 1) :
    a . b = cos(θ)   (l'angle entre les deux directions)

  INTERPRETATION VISUELLE :

    a . b > 0           a . b = 0           a . b < 0
  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
  │   a ↗       │    │   a ↑       │    │   a ↗       │
  │  ↗          │    │             │    │  ↗          │
  │ b →         │    │ b →         │    │          ← b│
  │             │    │             │    │             │
  │ θ < 90°    │    │ θ = 90°    │    │ θ > 90°    │
  │ "Meme sens" │    │ "Perpen-   │    │ "Opposes"  │
  │ dot ≈ 0.7   │    │ diculaires"│    │ dot ≈ -0.7  │
  └─────────────┘    └─────────────┘    └─────────────┘

  CAS EXTREMES (vecteurs normalises) :
    Meme direction     → dot = 1     (cos 0° = 1)
    Perpendiculaires   → dot = 0     (cos 90° = 0)
    Direction opposee  → dot = -1    (cos 180° = -1)
```

```typescript
// ── Produit scalaire ────────────────────────────────────

/**
 * Produit scalaire (dot product) de deux vecteurs 2D.
 * Retourne un nombre, pas un vecteur.
 */
function dotProduct2D(
  ax: number, ay: number,
  bx: number, by: number,
): number {
  return ax * bx + ay * by;
}

/**
 * Produit scalaire de deux vecteurs 3D.
 */
function dotProduct3D(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

// Tests avec des vecteurs unitaires
console.log(dotProduct2D(1, 0, 1, 0));    //  1  (meme direction)
console.log(dotProduct2D(1, 0, 0, 1));    //  0  (perpendiculaires)
console.log(dotProduct2D(1, 0, -1, 0));   // -1  (opposes)

// Application : est-ce qu'un ennemi est devant ou derriere moi ?
function isInFront(
  myPosition: Vec3,
  myForward: Vec3,     // direction ou je regarde (normalisee)
  targetPosition: Vec3,
): boolean {
  const toTarget = vecNormalize(vecSub(targetPosition, myPosition));
  const dot = dotProduct3D(myForward, toTarget);
  return dot > 0; // Positif = devant, negatif = derriere
}

const me: Vec3 = { x: 0, y: 0, z: 0 };
const forward: Vec3 = { x: 0, y: 0, z: -1 }; // je regarde vers -Z
const enemy1: Vec3 = { x: 1, y: 0, z: -5 };  // devant moi
const enemy2: Vec3 = { x: 0, y: 0, z: 5 };   // derriere moi

console.log(isInFront(me, forward, enemy1)); // true
console.log(isInFront(me, forward, enemy2)); // false
```

### Le produit vectoriel (cross product) — apercu

Le produit vectoriel prend deux vecteurs et retourne un **troisieme vecteur** qui est **perpendiculaire** aux deux premiers. C'est comme ca qu'on calcule la "normale" d'une surface en 3D.

```
PRODUIT VECTORIEL : a x b
══════════════════════════════════════════════════════════════

  a x b = vecteur perpendiculaire a a ET a b

       resultat (a x b)
          ↑
          │
          │
          │
     b ←──┼──→ a
          │
          (perpendiculaire au plan forme par a et b)

  REGLE DE LA MAIN DROITE :
  1. Pointez les doigts de la main droite dans la direction de a
  2. Courbez-les vers b
  3. Votre pouce pointe dans la direction de a x b

  FORMULE (par composantes) :
    (a x b).x = a.y * b.z - a.z * b.y
    (a x b).y = a.z * b.x - a.x * b.z
    (a x b).z = a.x * b.y - a.y * b.x

  ATTENTION : a x b ≠ b x a !
  En fait : a x b = -(b x a)   (direction opposee)
```

```typescript
// ── Produit vectoriel ───────────────────────────────────

/**
 * Produit vectoriel (cross product) de deux vecteurs 3D.
 * Retourne un vecteur perpendiculaire aux deux.
 */
function crossProduct(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

// Exemple : trouver la normale d'un triangle
// Un triangle a 3 sommets : v0, v1, v2
const v0: Vec3 = { x: 0, y: 0, z: 0 };
const v1: Vec3 = { x: 1, y: 0, z: 0 };
const v2: Vec3 = { x: 0, y: 1, z: 0 };

// Deux aretes du triangle
const edge1 = vecSub(v1, v0); // { x: 1, y: 0, z: 0 }
const edge2 = vecSub(v2, v0); // { x: 0, y: 1, z: 0 }

// Le produit vectoriel donne la normale
const normal = crossProduct(edge1, edge2);
console.log(normal); // { x: 0, y: 0, z: 1 } — pointe vers +Z

// Normaliser la normale (tres important pour l'eclairage)
const normalUnit = vecNormalize(normal);
console.log(normalUnit); // { x: 0, y: 0, z: 1 }
```

:::tip Pourquoi les normales ?
La normale d'une surface dit "dans quelle direction la surface pointe". C'est essentiel pour l'eclairage : une surface qui pointe vers la lumiere est eclairee, une surface qui pointe a l'oppose est dans l'ombre. Le produit scalaire entre la normale et la direction de la lumiere donne l'intensite lumineuse. On en reparlera au module 05 (lumiere et materiaux PBR).
:::

---

## 7. Les matrices (apercu intuitif)

### Qu'est-ce qu'une matrice ?

Une matrice est un **tableau de nombres organise en lignes et colonnes**. En 3D, les matrices servent a decrire des **transformations** : translation, rotation, echelle.

```
QU'EST-CE QU'UNE MATRICE ?
══════════════════════════════════════════════════════════════

  Une matrice 2x2 (2 lignes, 2 colonnes) :

  ┌       ┐
  │ a   b │     4 nombres, organises en grille.
  │ c   d │
  └       ┘

  Une matrice 4x4 (utilisee en 3D) :

  ┌                 ┐
  │ a  b  c  d │
  │ e  f  g  h │     16 nombres.
  │ i  j  k  l │     Encode rotation + echelle + translation
  │ m  n  o  p │     en une seule structure.
  └                 ┘

  Analogie : une matrice est une "RECETTE DE TRANSFORMATION".
  On la multiplie par un point, et le point est transforme.
```

### Multiplication matrice * vecteur (2D)

Pour comprendre, commençons en 2D avec une matrice 2x2 :

```
MULTIPLICATION MATRICE * VECTEUR
══════════════════════════════════════════════════════════════

  ┌       ┐   ┌   ┐     ┌             ┐
  │ a   b │ * │ x │  =  │ a*x + b*y   │
  │ c   d │   │ y │     │ c*x + d*y   │
  └       ┘   └   ┘     └             ┘

  Chaque ligne de la matrice "pese" les composantes du vecteur.

  Exemple : rotation de 90° (dans le sens anti-horaire)

  ┌        ┐   ┌   ┐     ┌              ┐     ┌    ┐
  │  0  -1 │ * │ 1 │  =  │ 0*1 + (-1)*0 │  =  │  0 │
  │  1   0 │   │ 0 │     │ 1*1 +   0 *0 │     │  1 │
  └        ┘   └   ┘     └              ┘     └    ┘

  Le point (1, 0) → (0, 1) : il a tourne de 90° !

  Exemple : echelle x2

  ┌       ┐   ┌   ┐     ┌     ┐
  │ 2   0 │ * │ 3 │  =  │  6  │
  │ 0   2 │   │ 4 │     │  8  │
  └       ┘   └   ┘     └     ┘

  Le point (3, 4) → (6, 8) : chaque coordonnee est doublee.
```

```typescript
// ── Multiplication matrice 2x2 * vecteur 2D ─────────────

/**
 * Multiplie une matrice 2x2 par un vecteur 2D.
 * La matrice est stockee comme [a, b, c, d] :
 *   | a  b |
 *   | c  d |
 */
function mat2MulVec2(
  mat: [number, number, number, number],
  x: number,
  y: number,
): { x: number; y: number } {
  const [a, b, c, d] = mat;
  return {
    x: a * x + b * y,
    y: c * x + d * y,
  };
}

// Rotation de 90 degres
const rot90: [number, number, number, number] = [0, -1, 1, 0];
console.log(mat2MulVec2(rot90, 1, 0));  // { x: 0, y: 1 }
console.log(mat2MulVec2(rot90, 0, 1));  // { x: -1, y: 0 }

// Echelle x2
const scale2: [number, number, number, number] = [2, 0, 0, 2];
console.log(mat2MulVec2(scale2, 3, 4)); // { x: 6, y: 8 }

// Matrice identite : ne change rien
const identity: [number, number, number, number] = [1, 0, 0, 1];
console.log(mat2MulVec2(identity, 5, 7)); // { x: 5, y: 7 }
```

### La matrice identite

La matrice identite est la matrice qui **ne change rien**. C'est le "zero" des transformations.

```
MATRICE IDENTITE
══════════════════════════════════════════════════════════════

  2x2 :                    4x4 :
  ┌       ┐               ┌               ┐
  │ 1   0 │               │ 1  0  0  0 │
  │ 0   1 │               │ 0  1  0  0 │
  └       ┘               │ 0  0  1  0 │
                           │ 0  0  0  1 │
                           └               ┘

  Des 1 sur la diagonale, des 0 partout ailleurs.

  Identite * n'importe quel vecteur = le meme vecteur
  Identite * n'importe quelle matrice = la meme matrice

  Analogie CSS : c'est comme transform: none;
```

### Apercu des matrices 4x4

En 3D, on utilise des matrices 4x4 pour combiner rotation, echelle ET translation en une seule matrice. On y reviendra en detail au module 01 (algebre lineaire) et au module 02 (transformations).

```
MATRICE 4x4 : STRUCTURE
══════════════════════════════════════════════════════════════

  ┌                          ┐
  │ Rx  Ux  Fx  Tx │     R = Right (axe X transforme)
  │ Ry  Uy  Fy  Ty │     U = Up (axe Y transforme)
  │ Rz  Uz  Fz  Tz │     F = Forward (axe Z transforme)
  │  0   0   0   1 │     T = Translation (position)
  └                          ┘

  Les 3 premieres colonnes encodent la rotation + echelle.
  La 4eme colonne encode la translation.
  La derniere ligne est toujours [0, 0, 0, 1] pour les transformations classiques.

  → On decomposera tout cela au module 01 !
```

---

## 8. Interpolation et courbes

### Rappel : interpolation lineaire

On a vu `lerp` au debut du module. Recapitulons et allons plus loin :

```typescript
// ── lerp, clamp, smoothstep ─────────────────────────────

/**
 * Interpolation lineaire entre a et b.
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Borner une valeur entre min et max.
 * Si x < min → retourne min
 * Si x > max → retourne max
 * Sinon → retourne x
 */
function clamp(x: number, min: number, max: number): number {
  return Math.min(Math.max(x, min), max);
}

// Tests clamp
console.log(clamp(0.5, 0, 1));   // 0.5 (dans les bornes)
console.log(clamp(-0.3, 0, 1));  // 0   (en dessous → borne a 0)
console.log(clamp(1.7, 0, 1));   // 1   (au dessus → borne a 1)
```

### Smoothstep : interpolation douce

`lerp` avance a vitesse constante (lineaire). `smoothstep` accelere au debut et decelere a la fin, comme une voiture qui demarre et freine en douceur.

```
LERP vs SMOOTHSTEP
══════════════════════════════════════════════════════════════

  Lerp (lineaire) :                  Smoothstep (doux) :

  sortie                             sortie
  1├──────────────╱│                 1├──────────────╱│
   │            ╱  │                  │          ╱─── │
   │          ╱    │                  │        ╱      │
   │        ╱      │                  │      ╱        │
   │      ╱        │                  │    ╱          │
   │    ╱          │                  │ ──╱           │
  0├──╱────────────│                 0├╱──────────────│
   └──┼────────────┼→ t              └──┼────────────┼→ t
     0             1                   0             1

  Lerp : vitesse constante            Smoothstep : acceleration
  du debut a la fin.                   puis deceleration.

  Smoothstep est tres utilisee en shaders pour des transitions douces.
  Formule : 3t² - 2t³   (avec t deja bornee entre 0 et 1)
```

```typescript
// ── Smoothstep ──────────────────────────────────────────

/**
 * Interpolation douce entre 0 et 1.
 * Accelere au debut, decelere a la fin.
 *
 * edge0 : valeur ou la transition commence (sortie = 0)
 * edge1 : valeur ou la transition finit (sortie = 1)
 * x : valeur d'entree
 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  // Borner t entre 0 et 1
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  // Formule de Hermite : 3t² - 2t³
  return t * t * (3 - 2 * t);
}

// Tests
console.log(smoothstep(0, 1, 0.0));   // 0.0   — debut
console.log(smoothstep(0, 1, 0.25));  // 0.156 — lent au debut
console.log(smoothstep(0, 1, 0.5));   // 0.5   — milieu (comme lerp)
console.log(smoothstep(0, 1, 0.75));  // 0.844 — lent a la fin
console.log(smoothstep(0, 1, 1.0));   // 1.0   — fin

// Utilisation : transition douce de la transparence
for (let frame = 0; frame <= 20; frame++) {
  const t = frame / 20;
  const opacityLinear = lerp(0, 1, t);
  const opacitySmooth = smoothstep(0, 1, t);
  console.log(
    `frame ${frame.toString().padStart(2)}: ` +
    `linear=${opacityLinear.toFixed(3)} ` +
    `smooth=${opacitySmooth.toFixed(3)}`
  );
}
```

### Courbes de Bezier (concept)

Les courbes de Bezier sont utilisees partout : polices de caracteres, animations CSS, chemins de cameras en 3D. Le concept : au lieu d'aller en ligne droite de A a B, on passe par des **points de controle** qui courbent la trajectoire.

```
COURBE DE BEZIER QUADRATIQUE
══════════════════════════════════════════════════════════════

  3 points : debut (P0), controle (P1), fin (P2)

          P1 (point de controle)
          ●
         ╱ ╲
        ╱   ╲         La courbe est "attiree" vers P1
       ╱     ╲        sans jamais le toucher.
      ╱  ╭────╲───╮
  P0 ●  ╱      ╲   ● P2
       ╱         ╲╱
      (courbe de Bezier)

  Formule (Bezier quadratique) :
    B(t) = (1-t)² * P0 + 2*(1-t)*t * P1 + t² * P2

  C'est un double lerp :
    1. On interpole entre P0 et P1 → point intermediaire Q0
    2. On interpole entre P1 et P2 → point intermediaire Q1
    3. On interpole entre Q0 et Q1 → point sur la courbe
```

```typescript
// ── Bezier quadratique (concept) ────────────────────────

interface Point2D {
  x: number;
  y: number;
}

/**
 * Point sur une courbe de Bezier quadratique.
 * t va de 0 (debut) a 1 (fin).
 */
function bezierQuadratic(
  p0: Point2D,
  p1: Point2D, // point de controle
  p2: Point2D,
  t: number,
): Point2D {
  const mt = 1 - t; // "1 minus t"
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

// Tracer 10 points sur une courbe
const start: Point2D = { x: 0, y: 0 };
const control: Point2D = { x: 50, y: 100 }; // "tire" la courbe vers le haut
const end: Point2D = { x: 100, y: 0 };

for (let i = 0; i <= 10; i++) {
  const t = i / 10;
  const pt = bezierQuadratic(start, control, end, t);
  console.log(`t=${t.toFixed(1)} → (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)})`);
}
```

### Fonctions d'easing

Les fonctions d'easing combinent lerp avec des courbes pour creer des animations naturelles. Ce sont les memes que celles de CSS (`ease-in`, `ease-out`, `ease-in-out`).

```
EASING FUNCTIONS
══════════════════════════════════════════════════════════════

  Ease-in (lent au debut, rapide a la fin) :
    → La balle qui tombe : elle accelere avec la gravite.
    Formule simple : t²

  Ease-out (rapide au debut, lent a la fin) :
    → La balle qui rebondit : elle decelere.
    Formule simple : 1 - (1-t)²

  Ease-in-out (lent-rapide-lent) :
    → La voiture qui demarre et freine.
    Formule : smoothstep (vue plus haut)

  sortie
  1├──────────╱─╱─╱──
   │        ╱ ╱ ╱
   │      ╱ ╱ ╱
   │    ╱ ╱ ╱
   │  ╱ ╱ ╱          ╱ = linear
  0├╱─╱─╱───────────  ╱ = ease-in (t²)
   └──┼──────────┼→    ╱ = ease-out
     0           1
```

```typescript
// ── Easing functions ────────────────────────────────────

/** Ease-in : lent au debut, rapide a la fin (acceleration) */
function easeIn(t: number): number {
  return t * t;
}

/** Ease-out : rapide au debut, lent a la fin (deceleration) */
function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/** Ease-in-out : lent, rapide, lent (comme smoothstep) */
function easeInOut(t: number): number {
  return t < 0.5
    ? 2 * t * t
    : 1 - 2 * (1 - t) * (1 - t);
}

// Comparaison des 4 approches pour une animation de 0 a 100
function compareEasings(): void {
  console.log('t      | linear | ease-in | ease-out | ease-in-out');
  console.log('-------+--------+---------+----------+-----------');

  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const lin = lerp(0, 100, t);
    const ein = lerp(0, 100, easeIn(t));
    const eout = lerp(0, 100, easeOut(t));
    const einout = lerp(0, 100, easeInOut(t));
    console.log(
      `${t.toFixed(1).padStart(5)} | ` +
      `${lin.toFixed(1).padStart(6)} | ` +
      `${ein.toFixed(1).padStart(7)} | ` +
      `${eout.toFixed(1).padStart(8)} | ` +
      `${einout.toFixed(1).padStart(9)}`
    );
  }
}

compareEasings();
```

:::tip Analogie CSS
```css
/* Ces transitions CSS utilisent exactement les memes concepts */
.element {
  transition: transform 0.3s ease-in;     /* = t² */
  transition: transform 0.3s ease-out;    /* = 1-(1-t)² */
  transition: transform 0.3s ease-in-out; /* = smoothstep */
  transition: transform 0.3s linear;      /* = lerp simple */
}
```
:::

---

## Exercice pratique

### Enonce

Implementez les 10 fonctions suivantes. Chaque fonction est independante. Testez-les avec les valeurs fournies.

```typescript
// ── math-prereq.ts ──────────────────────────────────────
// Implementez les 10 fonctions suivantes.

// 1. degToRad(degrees: number): number
//    Convertir des degres en radians.
//    Tests : degToRad(0) === 0, degToRad(180) ≈ PI, degToRad(360) ≈ 2*PI

// 2. radToDeg(radians: number): number
//    Convertir des radians en degres.
//    Tests : radToDeg(0) === 0, radToDeg(PI) ≈ 180, radToDeg(2*PI) ≈ 360

// 3. lerp(a: number, b: number, t: number): number
//    Interpolation lineaire entre a et b.
//    Tests : lerp(0, 10, 0) === 0, lerp(0, 10, 0.5) === 5, lerp(0, 10, 1) === 10

// 4. clamp(x: number, min: number, max: number): number
//    Borner x entre min et max.
//    Tests : clamp(5, 0, 10) === 5, clamp(-3, 0, 10) === 0, clamp(15, 0, 10) === 10

// 5. smoothstep(edge0: number, edge1: number, x: number): number
//    Interpolation douce entre edge0 et edge1.
//    Tests : smoothstep(0, 1, 0) === 0, smoothstep(0, 1, 0.5) === 0.5,
//            smoothstep(0, 1, 1) === 1

// 6. distance2D(x1, y1, x2, y2): number
//    Distance entre deux points 2D.
//    Tests : distance2D(0, 0, 3, 4) === 5, distance2D(1, 1, 1, 1) === 0

// 7. distance3D(x1, y1, z1, x2, y2, z2): number
//    Distance entre deux points 3D.
//    Tests : distance3D(0, 0, 0, 1, 2, 2) === 3

// 8. vecLength(v: {x, y, z}): number
//    Longueur d'un vecteur 3D.
//    Tests : vecLength({x:3,y:4,z:0}) === 5, vecLength({x:0,y:0,z:0}) === 0

// 9. vecNormalize(v: {x, y, z}): {x, y, z}
//    Normaliser un vecteur (longueur = 1).
//    Tests : vecLength(vecNormalize({x:3,y:4,z:0})) ≈ 1

// 10. dotProduct2D(ax, ay, bx, by): number
//     Produit scalaire de deux vecteurs 2D.
//     Tests : dotProduct2D(1,0,1,0) === 1, dotProduct2D(1,0,0,1) === 0,
//             dotProduct2D(1,0,-1,0) === -1
```

<details>
<summary>Voir la solution</summary>

```typescript
// ── math-prereq.ts — Solution ───────────────────────────

// ── 1. degToRad ─────────────────────────────────────────
function degToRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

// ── 2. radToDeg ─────────────────────────────────────────
function radToDeg(radians: number): number {
  return radians * (180 / Math.PI);
}

// ── 3. lerp ─────────────────────────────────────────────
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ── 4. clamp ────────────────────────────────────────────
function clamp(x: number, min: number, max: number): number {
  return Math.min(Math.max(x, min), max);
}

// ── 5. smoothstep ───────────────────────────────────────
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// ── 6. distance2D ───────────────────────────────────────
function distance2D(
  x1: number, y1: number,
  x2: number, y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

// ── 7. distance3D ───────────────────────────────────────
function distance3D(
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dz = z2 - z1;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ── 8. vecLength ────────────────────────────────────────
interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function vecLength(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

// ── 9. vecNormalize ─────────────────────────────────────
function vecNormalize(v: Vec3): Vec3 {
  const len = vecLength(v);
  if (len === 0) return { x: 0, y: 0, z: 0 };
  return {
    x: v.x / len,
    y: v.y / len,
    z: v.z / len,
  };
}

// ── 10. dotProduct2D ────────────────────────────────────
function dotProduct2D(
  ax: number, ay: number,
  bx: number, by: number,
): number {
  return ax * bx + ay * by;
}

// ═════════════════════════════════════════════════════════
// TESTS
// ═════════════════════════════════════════════════════════

const EPSILON = 1e-6;

function assertApprox(actual: number, expected: number, label: string): void {
  const pass = Math.abs(actual - expected) < EPSILON;
  console.log(pass ? `  ✓ ${label}` : `  ✗ ${label}: got ${actual}, expected ${expected}`);
}

console.log('--- degToRad ---');
assertApprox(degToRad(0), 0, 'degToRad(0)');
assertApprox(degToRad(90), Math.PI / 2, 'degToRad(90)');
assertApprox(degToRad(180), Math.PI, 'degToRad(180)');
assertApprox(degToRad(360), 2 * Math.PI, 'degToRad(360)');

console.log('--- radToDeg ---');
assertApprox(radToDeg(0), 0, 'radToDeg(0)');
assertApprox(radToDeg(Math.PI), 180, 'radToDeg(PI)');
assertApprox(radToDeg(2 * Math.PI), 360, 'radToDeg(2*PI)');

console.log('--- lerp ---');
assertApprox(lerp(0, 10, 0), 0, 'lerp(0,10,0)');
assertApprox(lerp(0, 10, 0.5), 5, 'lerp(0,10,0.5)');
assertApprox(lerp(0, 10, 1), 10, 'lerp(0,10,1)');
assertApprox(lerp(10, 20, 0.25), 12.5, 'lerp(10,20,0.25)');

console.log('--- clamp ---');
assertApprox(clamp(5, 0, 10), 5, 'clamp(5,0,10)');
assertApprox(clamp(-3, 0, 10), 0, 'clamp(-3,0,10)');
assertApprox(clamp(15, 0, 10), 10, 'clamp(15,0,10)');

console.log('--- smoothstep ---');
assertApprox(smoothstep(0, 1, 0), 0, 'smoothstep(0,1,0)');
assertApprox(smoothstep(0, 1, 0.5), 0.5, 'smoothstep(0,1,0.5)');
assertApprox(smoothstep(0, 1, 1), 1, 'smoothstep(0,1,1)');
assertApprox(smoothstep(0, 1, -1), 0, 'smoothstep(0,1,-1) clamped');
assertApprox(smoothstep(0, 1, 2), 1, 'smoothstep(0,1,2) clamped');

console.log('--- distance2D ---');
assertApprox(distance2D(0, 0, 3, 4), 5, 'distance2D(0,0,3,4)');
assertApprox(distance2D(1, 1, 1, 1), 0, 'distance2D(1,1,1,1)');
assertApprox(distance2D(0, 0, 1, 1), Math.sqrt(2), 'distance2D(0,0,1,1)');

console.log('--- distance3D ---');
assertApprox(distance3D(0, 0, 0, 1, 2, 2), 3, 'distance3D(0,0,0,1,2,2)');
assertApprox(distance3D(0, 0, 0, 0, 0, 0), 0, 'distance3D origin');

console.log('--- vecLength ---');
assertApprox(vecLength({ x: 3, y: 4, z: 0 }), 5, 'vecLength(3,4,0)');
assertApprox(vecLength({ x: 0, y: 0, z: 0 }), 0, 'vecLength(0,0,0)');
assertApprox(vecLength({ x: 1, y: 1, z: 1 }), Math.sqrt(3), 'vecLength(1,1,1)');

console.log('--- vecNormalize ---');
const n1 = vecNormalize({ x: 3, y: 4, z: 0 });
assertApprox(vecLength(n1), 1, 'vecNormalize(3,4,0) length');
assertApprox(n1.x, 0.6, 'vecNormalize(3,4,0).x');
assertApprox(n1.y, 0.8, 'vecNormalize(3,4,0).y');
const n2 = vecNormalize({ x: 0, y: 0, z: 0 });
assertApprox(vecLength(n2), 0, 'vecNormalize(0,0,0) is zero');

console.log('--- dotProduct2D ---');
assertApprox(dotProduct2D(1, 0, 1, 0), 1, 'dot same direction');
assertApprox(dotProduct2D(1, 0, 0, 1), 0, 'dot perpendicular');
assertApprox(dotProduct2D(1, 0, -1, 0), -1, 'dot opposite');
```

</details>

---

## Resume

| Concept | Formule / Explication | Utilisation en 3D |
|---------|----------------------|-------------------|
| Nombres decimaux (float) | `f32` sur le GPU, `number` en TS | Positions, couleurs, angles — tout |
| Proportion (0-1) | Pourcentage / 100 | Couleurs, opacite, UV, progression |
| Notation scientifique | `1e-6` = 0.000001, `1e3` = 1000 | Epsilon, distances, near/far plane |
| Fonction | `f(x) = ...` entree → sortie | Transformation de valeurs |
| Degres → Radians | `rad = deg * (PI / 180)` | Toutes les fonctions trigo de JS |
| Radians → Degres | `deg = rad * (180 / PI)` | Affichage lisible pour les humains |
| sin(θ), cos(θ) | Projection sur le cercle unite | Rotations, ondes, animations |
| tan(θ) | sin / cos | Angles de vue, pentes |
| atan2(y, x) | Angle depuis les coordonnees | "Regarder vers" une cible |
| sin² + cos² = 1 | Identite de Pythagore | Verification, normalisation |
| Rotation 2D | x' = x*cos - y*sin, y' = x*sin + y*cos | Base de toutes les rotations |
| Distance 2D | `sqrt(dx² + dy²)` | Detection de collision, proximite |
| Distance 3D | `sqrt(dx² + dy² + dz²)` | Idem en 3D |
| Vecteur | (dx, dy, dz) — direction + longueur | Deplacement, direction, vitesse |
| Longueur (magnitude) | `sqrt(x² + y² + z²)` | Mesurer la "force" d'un vecteur |
| Normalisation | v / longueur(v) → longueur = 1 | Directions, normales, eclairage |
| Produit scalaire | `ax*bx + ay*by + az*bz` = cos(θ) si normalise | Angle, eclairage, backface culling |
| Produit vectoriel | Vecteur perpendiculaire aux deux | Normales de surface |
| Matrice | Tableau de nombres = "recette de transformation" | Rotation, echelle, translation |
| Matrice identite | Diagonale de 1 — ne change rien | "transform: none" |
| lerp(a, b, t) | `a + (b - a) * t` | Animation, transition, melange |
| clamp(x, min, max) | Borner une valeur | Eviter les depassements |
| smoothstep | `3t² - 2t³` (Hermite) | Transitions douces, shaders |
| Easing | ease-in (t²), ease-out (1-(1-t)²) | Animations naturelles |
| Bezier | Double lerp avec points de controle | Courbes, chemins de camera |

---

## Pour aller plus loin

- [3Blue1Brown — Essence of Linear Algebra (video, en anglais)](https://www.youtube.com/playlist?list=PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab)
- [Khan Academy — Trigonometrie (gratuit, avec exercices)](https://www.khanacademy.org/math/trigonometry)
- [The Book of Shaders — smoothstep interactif](https://thebookofshaders.com/glossary/?search=smoothstep)
- [Easings.net — visualisation interactive des fonctions d'easing](https://easings.net/)
- [Bezier.method.ac — jeu interactif pour comprendre les courbes de Bezier](https://bezier.method.ac/)
- [Immersive Linear Algebra (livre interactif)](http://immersivemath.com/ila/index.html)
