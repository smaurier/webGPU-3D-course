# Lab 11 — Compute shaders

## Objectif

Comprendre les patterns fondamentaux des compute shaders : dispatch de workgroups,
prefix sum, systeme de particules, simulation de grille 2D, histogramme,
reduction parallele, multiplication matrice-vecteur et calcul de bounding box.

## Concepts cles

### Dispatch de workgroups

Le nombre de workgroups a dispatcher est `ceil(totalItems / workgroupSize)`.
Chaque workgroup execute `workgroupSize` threads en parallele.

### Prefix sum (scan)

Le prefix sum exclusif d'un tableau `[a, b, c, d]` est `[0, a, a+b, a+b+c]`.
C'est un algorithme fondamental pour le tri, la compaction et l'allocation parallele.

### Systeme de particules

Chaque particule a une position et une velocite. A chaque pas :
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

Reduire un tableau a une seule valeur (somme, min, max) par etapes
successives de reduction par moitie.

### Multiplication matrice-vecteur

Chaque thread calcule un element du vecteur resultat :
`result[i] = sum(matrix[i][j] * vector[j])`.

### Bounding box

Trouver les coordonnees min/max d'un nuage de points.

## Exercices

Completez les fonctions dans `exercise.ts` puis lancez les tests :

```bash
npx tsx exercise.ts
```

Verifiez vos resultats avec la solution :

```bash
npx tsx solution.ts
```
