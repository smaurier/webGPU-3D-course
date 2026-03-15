# Lab 13 — Three.js : fondamentaux

## Objectif

Implementer les structures de donnees et algorithmes fondamentaux d'un moteur 3D
comme Three.js : scene graph, génération de geometries, bounding volumes et controles camera.
Tout est testable sans navigateur ni runtime WebGL.

## Concepts clés

### Scene Graph

Un arbre hiérarchique ou chaque noeud possede un nom, des enfants et un parent optionnel.
Les operations `addChild`, `removeChild` et `findByName` permettent de manipuler l'arbre.

### Génération de geometrie

Les geometries procedurales (box, sphere, plan) sont definies par leurs sommets (positions +
normales + UVs) et leurs indices. Une box a 24 sommets uniques (4 par face, car chaque face
a sa propre normale) et 36 indices (2 triangles par face x 6 faces).

### Bounding Volumes

- **AABB** (Axis-Aligned Bounding Box) : le plus petit parallelepipede aligne sur les axes
  contenant tous les sommets.
- **Bounding Sphere** : la plus petite sphere contenant tous les sommets, definie par un
  centre (centroide) et un rayon.

### Camera et controles

- **Aspect ratio** : largeur / hauteur du viewport, mis a jour lors du redimensionnement.
- **Orbit controls** : conversion des angles spheriques (theta, phi) en position cartesienne
  autour d'une cible.

## Exercices

Completez les fonctions dans `exercise.ts` puis lancez les tests :

```bash
npx tsx exercise.ts
```

Verifiez vos résultats avec la solution :

```bash
npx tsx solution.ts
```
