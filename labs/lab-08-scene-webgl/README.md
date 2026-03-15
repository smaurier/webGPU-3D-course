# Lab 08 — Scene graph et WebGL

## Objectif

Implementer les structures de donnees et algorithmes d'un moteur de scene 3D :
camera orbitale, delta time, scene graph hiérarchique, matrice de normales, tri par transparence,
frustum culling, skybox et fusion de geometries.

## Concepts clés

### Camera orbitale

La camera orbitale convertit des coordonnees spheriques `(rayon, theta, phi)` en position cartesienne :
- `x = r * sin(phi) * cos(theta)`
- `y = r * cos(phi)`
- `z = r * sin(phi) * sin(theta)`

### Delta time

Le delta time `dt` est la différence entre deux timestamps successifs, convertie en secondes.
Il permet de rendre les animations independantes du framerate.

### Scene graph

Chaque noeud à une transformation locale (Mat4). La matrice monde d'un noeud est le produit
de la matrice monde du parent par la matrice locale : `worldMatrix = parent.world * local`.

### Matrice de normales

La matrice de normales est la transposee de l'inverse de la partie superieure 3x3 de la matrice modèle.
Elle garantit que les normales restent perpendiculaires après des transformations non uniformes.

### Tri par transparence

Les objets transparents doivent etre dessines du plus eloigne au plus proche (back-to-front)
pour un melange correct.

### Frustum culling

Un test rapide sphere-frustum permet d'exclure les objets hors du champ de vision
avant de les envoyer au GPU.

### Skybox

Un cube englobant dont les 8 sommets et 36 indices definissent les 6 faces internes.

### Fusion de geometries

Concatener plusieurs buffers de positions et decaler les indices pour les fusionner en un seul draw call.

## Exercices

Completez les fonctions dans `exercise.ts` puis lancez les tests :

```bash
npx tsx exercise.ts
```

Verifiez vos résultats avec la solution :

```bash
npx tsx solution.ts
```
