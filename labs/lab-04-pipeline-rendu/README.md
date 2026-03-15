# Lab 04 — Pipeline de rendu

## Objectif

Implementer les étapes clés du pipeline de rasterisation : edge function, coordonnees
barycentriques, interpolation d'attributs, depth test, vertex transform et backface culling.

## Concepts clés

### Edge function

L'edge function déterminé de quel cote d'une arete se trouve un point.
Pour une arete de A a B et un point P :
`edge(A, B, P) = (B.x - A.x) * (P.y - A.y) - (B.y - A.y) * (P.x - A.x)`

Un point est a l'interieur du triangle si les trois edge functions ont le même signe.

### Coordonnees barycentriques

Trois poids (u, v, w) tels que `P = u*A + v*B + w*C` et `u + v + w = 1`.
Calculees à partir des aires des sous-triangles via les edge functions.

### Interpolation d'attributs

Les couleurs, normales et UVs sont interpolees en utilisant les coordonnees barycentriques :
`attribut = u * attrA + v * attrB + w * attrC`

### Depth test

Le fragment le plus proche de la camera (z plus petit) gagne et ecrase le précédent.

### Backface culling

Un triangle dont les sommets sont dans l'ordre horaire (clockwise) vu depuis la camera
est considere comme "dos" et peut etre elimine. On détecté cela avec le signe de l'aire
signee (edge function appliquee aux 3 sommets en 2D).

## Exercices

```bash
npx tsx exercise.ts
```
