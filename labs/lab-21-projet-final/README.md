# Lab 21 — Projet final

## Objectif

Ce lab intégré les concepts de l'ensemble du cours dans un projet complet :
scene graph, terrain procedural, frustum culling, eclairage PBR, shadow mapping,
système de particules, animations, LOD, raycasting, cameras et gestion de ressources.

## Concepts clés

### Scene Graph

Arbre hiérarchique ou chaque noeud possede une transformation locale.
La transformation monde d'un noeud est le produit de la transformation monde du parent
et de la transformation locale : `world = parent.world * local`.

### Terrain procedural

Le terrain est généré à partir de bruit (Perlin/FBM). On echantillonne la hauteur
en un point (x, z) et on calcule les normales par différences finies.

### Frustum Culling

Technique d'optimisation : on ne rend que les objets dont l'AABB est a l'interieur
(où chevauche) le frustum de la camera. Le frustum est défini par 6 plans.

### PBR (Physically Based Rendering)

Modèle Cook-Torrance : D (distribution GGX), F (Fresnel Schlick), G (Smith GGX).
Le BRDF speculaire est `DFG / (4 * NdotV * NdotL)`.

### Système de particules

Chaque particule à une position, une velocite et une duree de vie.
A chaque pas, on met a jour la position, decremente la duree de vie,
et on respawne les particules mortes.

### LOD (Level of Detail)

On selectionne le niveau de detail en fonction de la distance à la camera.
Plus l'objet est loin, moins il a de polygones.

## Exercices

Completez les fonctions dans `exercise.ts` puis lancez les tests :

```bash
npx tsx exercise.ts
```

Verifiez vos résultats avec la solution :

```bash
npx tsx solution.ts
```
