# Lab 22 — Modelisation

## Objectif

Implementer les algorithmes de traitement de maillages 3D : parsing de structures glTF,
validation de topologie, calcul de bounding box, surface area, normales par vertex,
detection d'aretes non-manifold, ilots UV et quantification de positions.

## Concepts clés

### Format glTF

Le format glTF (GL Transmission Format) est un standard ouvert pour les scenes 3D.
La structure JSON decrit des meshes, materiaux, animations, etc.
Les donnees geometriques sont stockees dans des accessors références par des buffer views.

### Topologie de maillage

Un maillage valide doit avoir des triangles non-degeneres (aire > 0).
Chaque arete d'un maillage manifold est partagee par exactement 2 faces.

### Normales par vertex

Les normales par vertex sont calculees comme la moyenne ponderee par l'aire
des normales des faces adjacentes. Cela produit un rendu lisse (smooth shading).

### Ilots UV (UV Islands)

Les UV d'un maillage forment des composantes connexes dans l'espace UV.
Deux triangles sont dans le même ilot s'ils partagent une arete UV.

### Quantification (Draco-like)

Pour compresser les maillages, on peut quantifier les positions flottantes
en entiers sur N bits, puis les dequantifier pour les utiliser.
`quantized = round((value - min) / (max - min) * (2^N - 1))`

## Exercices

Completez les fonctions dans `exercise.ts` puis lancez les tests :

```bash
npx tsx exercise.ts
```

Verifiez vos résultats avec la solution :

```bash
npx tsx solution.ts
```
