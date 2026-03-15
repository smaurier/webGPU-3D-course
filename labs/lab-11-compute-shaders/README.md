# Lab 11 — Compute shaders

## Objectif

Comprendre les patterns fondamentaux des compute shaders : dispatch de workgroups,
prefix sum, système de particules, simulation de grille 2D, histogramme,
reduction parallele, multiplication matrice-vecteur et calcul de bounding box.

## Concepts clés

### Dispatch de workgroups

Le nombre de workgroups a dispatcher est `ceil(totalItems / workgroupSize)`.
Chaque workgroup exécuté `workgroupSize` threads en parallele.

### Prefix sum (scan)

Le prefix sum exclusif d'un tableau `[a, b, c, d]` est `[0, a, a+b, a+b+c]`.
C'est un algorithme fondamental pour le tri, la compaction et l'allocation parallele.

### Système de particules

Chaque particule à une position et une velocite. A chaque pas :
`position += velocity * dt`, `velocity += gravity * dt`.

### Simulation de grille (Game of Life)

Chaque cellule compte ses 8 voisins. Regles :
- Vivante avec 2 ou 3 voisins → reste vivante
- Morte avec exactement 3 voisins → nait
- Sinon → meurt

### Histogramme

Compter la frequence de chaque valeur dans un tableau.
En GPU, on utilise `atomicAdd` pour incrementer les compteurs.

### Reduction parallele

Reduire un tableau à une seule valeur (somme, min, max) par étapes
successives de reduction par moitie.

### Multiplication matrice-vecteur

Chaque thread calcule un élément du vecteur résultat :
`result[i] = sum(matrix[i][j] * vector[j])`.

### Bounding box

Trouver les coordonnees min/max d'un nuage de points.

## Exercices

Completez les fonctions dans `exercise.ts` puis lancez les tests :

```bash
npx tsx exercise.ts
```

Verifiez vos résultats avec la solution :

```bash
npx tsx solution.ts
```
