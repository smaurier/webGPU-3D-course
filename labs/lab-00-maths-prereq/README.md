# Lab 00 — Prérequis mathematiques

## Objectif

Revoir les bases mathematiques indispensables avant de plonger dans la 3D temps réel :
conversions d'angles, interpolation, fonctions utilitaires, distances, vecteurs 2D et trigonometrie.

## Concepts clés

### Conversions d'angles

Les GPU et les fonctions trigonometriques travaillent en **radians**, mais on pense souvent en degres.

- `degToRad(d) = d * PI / 180`
- `radToDeg(r) = r * 180 / PI`

### Interpolation lineaire (lerp)

`lerp(a, b, t) = a + (b - a) * t`

Quand `t = 0` on obtient `a`, quand `t = 1` on obtient `b`, et `t = 0.5` donne le milieu.

### Clamp et Smoothstep

- `clamp(x, min, max)` force une valeur dans un intervalle
- `smoothstep(edge0, edge1, x)` interpole de façon lisse entre 0 et 1 avec une courbe cubique hermitienne

### Distance

- **2D** : `sqrt((x2-x1)^2 + (y2-y1)^2)`
- **3D** : `sqrt((x2-x1)^2 + (y2-y1)^2 + (z2-z1)^2)`

### Vecteurs 2D

Un vecteur `[x, y]` à une longueur (`sqrt(x^2 + y^2)`) et peut etre normalise (longueur ramenee a 1).

### Produit scalaire 2D

`a . b = ax*bx + ay*by`

Si les vecteurs sont perpendiculaires, le produit scalaire vaut 0.
Si paralleles et de même direction, il vaut le produit de leurs longueurs.

### Trigonometrie de base

- `sin(0) = 0`, `cos(0) = 1`, `sin(PI/2) = 1`
- `atan2(y, x)` retourne l'angle en radians depuis l'axe X positif

### Théorème de Pythagore

Dans un triangle rectangle : `a^2 + b^2 = c^2` (c = hypotenuse).

## Exercices

Completez les fonctions dans `exercise.ts` puis lancez les tests :

```bash
npx tsx exercise.ts
```

Verifiez vos résultats avec la solution :

```bash
npx tsx solution.ts
```
