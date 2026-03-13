# Lab 01 — Algebre lineaire

## Objectif

Implementer les operations fondamentales d'algebre lineaire utilisees en 3D temps reel :
vecteurs 3D, produit scalaire, produit vectoriel, matrices 4x4 et coordonnees homogenes.

## Concepts cles

### Vecteurs 3D (Vec3)

Un vecteur `[x, y, z]` represente une direction ou un point dans l'espace 3D.
Operations de base : addition, soustraction, mise a l'echelle, longueur, normalisation.

### Produit scalaire (dot product)

`a . b = ax*bx + ay*by + az*bz`

Retourne un scalaire. Si les deux vecteurs sont normalises, le resultat est le cosinus
de l'angle entre eux. Utile pour le calcul d'eclairage (Lambert) et les projections.

### Produit vectoriel (cross product)

`a x b` retourne un vecteur perpendiculaire au plan forme par `a` et `b`.
Essentiel pour calculer les normales de surface.

### Matrices 4x4 (Mat4)

Representees en **column-major order** (comme OpenGL/WebGL/WebGPU) :
les 4 premiers elements sont la premiere colonne.

```
| m0  m4  m8   m12 |
| m1  m5  m9   m13 |
| m2  m6  m10  m14 |
| m3  m7  m11  m15 |
```

### Coordonnees homogenes

Un point 3D `[x, y, z]` devient `[x, y, z, 1]` (w=1) pour pouvoir etre translate.
Une direction `[x, y, z]` devient `[x, y, z, 0]` (w=0) — les translations ne l'affectent pas.

## Exercices

Completez les fonctions dans `exercise.ts` puis lancez les tests :

```bash
npx tsx exercise.ts
```

Verifiez vos resultats avec la solution :

```bash
npx tsx solution.ts
```
