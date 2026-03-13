# Lab 19 — Shaders creatifs

## Objectif

Implementer les algorithmes mathematiques utilises dans les shaders creatifs :
bruit de Perlin et Simplex, FBM, domain warping, SDF (Signed Distance Functions),
ray marching, effets Fresnel, toon shading et generation procedurale.

## Concepts cles

### Bruit de Perlin

Le bruit de Perlin utilise des gradients pseudo-aleatoires aux sommets d'une grille
et interpole entre eux. Il produit un signal continu et lisse, ideal pour les textures procedurales.

### Bruit Simplex

Variante plus efficace du bruit de Perlin, utilisant un maillage simplexe (triangles en 2D)
au lieu d'une grille carree. Moins d'artefacts directionnels.

### FBM (Fractional Brownian Motion)

Superposition de plusieurs octaves de bruit avec des frequences croissantes (lacunarite)
et des amplitudes decroissantes (gain). Produit des details multi-echelles.

### SDF (Signed Distance Functions)

Une SDF retourne la distance signee d'un point a une surface : negative a l'interieur,
positive a l'exterieur. Permet de combiner des formes avec min (union), max (intersection),
et smooth min (union douce).

### Ray Marching

Technique qui avance le long d'un rayon par pas egaux a la distance SDF.
Quand la distance est suffisamment petite, on considere qu'on a touche la surface.

### Effet Fresnel

L'approximation de Schlick modele la reflexion aux angles rasants :
`F = F0 + (1 - F0) * (1 - cos(theta))^5`

## Exercices

Completez les fonctions dans `exercise.ts` puis lancez les tests :

```bash
npx tsx exercise.ts
```

Verifiez vos resultats avec la solution :

```bash
npx tsx solution.ts
```
