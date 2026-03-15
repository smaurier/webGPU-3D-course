# Lab 03 — Camera et projection

## Objectif

Implementer les matrices de vue (lookAt) et de projection (perspective, orthographique),
ainsi que les transformations entre les différents espaces de coordonnees.

## Concepts clés

### Matrice lookAt

Positionne la camera dans la scene. Elle transforme les coordonnees monde en coordonnees vue.
Parametres : position de l'oeil (`eye`), point cible (`target`), vecteur haut (`up`).

Construction :
1. `forward = normalize(eye - target)`
2. `right = normalize(cross(up, forward))`
3. `newUp = cross(forward, right)`
4. Combiner la rotation (3 axes) et la translation (-eye)

### Projection perspective

Simule la vision humaine : les objets lointains paraissent plus petits.
Parametres : champ de vision (`fov`), ratio d'aspect, plans near et far.

### Projection orthographique

Pas de deformation par la distance — utile pour les editeurs 2D, les vues techniques.

### NDC (Normalized Device Coordinates)

Après la perspective divide (division par w), les coordonnees sont dans [-1, 1].
WebGL utilise NDC avec Z dans [-1, 1], WebGPU utilise Z dans [0, 1].
Ce lab utilise la convention OpenGL/WebGL (Z dans [-1, 1]).

### Viewport transform

Convertit les NDC en pixels ecran : `screenX = (ndcX + 1) / 2 * width`.

## Exercices

```bash
npx tsx exercise.ts
```
