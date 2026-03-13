# Lab 17 — Performance

## Objectif

Implementer les algorithmes et structures de donnees essentiels a l'optimisation
des performances dans les applications 3D temps reel : LOD, frustum culling,
batching, atlas de textures, gestion memoire et metriques de performance.

## Concepts cles

### LOD (Level of Detail)

Selectionner le niveau de detail en fonction de la taille en pixels de l'objet
a l'ecran. Plus l'objet est petit, moins il a besoin de polygones.

### Frustum culling

Eliminer les objets qui ne sont pas visibles par la camera. On teste chaque
bounding sphere contre les 6 plans du frustum. Si un objet est entierement
en dehors d'un plan, il est rejete.

### Draw call batching

Regrouper les objets qui partagent le meme materiau pour reduire le nombre
d'appels de dessin (draw calls), ce qui est couteux sur le GPU.

### Texture atlas

Placer plusieurs petites textures dans une seule grande texture. Les coordonnees
UV doivent etre remappees vers la sous-region correspondante.

### Object pool

Reutiliser les objets au lieu de les allouer/desallouer en permanence, ce qui
evite les pauses du garbage collector.

### Spatial hash grid

Diviser l'espace en cellules et inserer les objets dans la cellule correspondante.
Permet des requetes de voisinage en O(1) au lieu de O(n).

## Exercices

Completez les fonctions dans `exercise.ts` puis lancez les tests :

```bash
npx tsx exercise.ts
```

Verifiez vos resultats avec la solution :

```bash
npx tsx solution.ts
```
