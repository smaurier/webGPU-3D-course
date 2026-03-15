# Lab 15 — Modeles et animations

## Objectif

Implementer les algorithmes d'animation 3D : interpolation de keyframes, animation mixer,
crossfade, hiérarchie squelettique, skinning, morph targets, instanciation et LOD.

## Concepts clés

### Keyframes et interpolation

Une animation est definie par des **keyframes** (clés) : des paires (temps, valeur).
Pour obtenir la valeur à un instant `t`, on interpole lineairement entre les deux
keyframes qui encadrent `t`.

### Animation mixer

Le mixer géré le temps courant d'une animation et retourne la valeur interpolee.
Il avance avec `update(deltaTime)` et boucle si nécessaire.

### Crossfade

Transition progressive entre deux animations sur une duree donnee.
Le poids de la nouvelle animation croit de 0 a 1, celui de l'ancienne decroit de 1 a 0.

### Squelette et skinning

- Chaque **bone** possede une matrice locale et un parent optionnel.
- La **matrice monde** d'un bone = produit de toutes les matrices locales de la racine au bone.
- Le **skinning** transforme un sommet par une somme ponderee des matrices des bones
  qui l'influencent, multipliees par l'inverse de la matrice de bind.

### Morph targets

Deformation de forme : chaque sommet est interpole entre la forme de base et
une ou plusieurs formes cibles, selon un poids [0,1].

### LOD (Level of Detail)

Selection du niveau de detail en fonction de la distance à la camera.

## Exercices

Completez les fonctions dans `exercise.ts` puis lancez les tests :

```bash
npx tsx exercise.ts
```

Verifiez vos résultats avec la solution :

```bash
npx tsx solution.ts
```
