# Lab 02 — Transformations

## Objectif

Implementer les transformations 3D : matrices de translation, rotation, mise a l'echelle,
et les quaternions pour les rotations fluides.

## Concepts clés

### Matrices de transformation

En column-major order, une matrice de translation place `tx, ty, tz` aux indices 12, 13, 14.
Une matrice de mise a l'echelle place `sx, sy, sz` sur la diagonale (indices 0, 5, 10).

### Ordre SRT

L'ordre standard est **Scale -> Rotate -> Translate** (SRT).
En column-major, cela s'écrit : `M = T * R * S` (on multiplie dans l'ordre inverse).

### Quaternions

Un quaternion `[x, y, z, w]` represente une rotation de manière compacte et sans gimbal lock.
- Création depuis un axe et un angle : `q = [axis * sin(angle/2), cos(angle/2)]`
- Multiplication : combine deux rotations
- Slerp : interpolation spherique pour des animations fluides

### Conversion quaternion -> matrice

Nécessaire pour envoyer la rotation au GPU sous forme de matrice 4x4.

## Exercices

Completez les fonctions dans `exercise.ts` puis lancez les tests :

```bash
npx tsx exercise.ts
```
