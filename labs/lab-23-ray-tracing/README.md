# Lab 23 — Ray Tracing

## Objectif

Implementer les algorithmes fondamentaux du ray tracing : intersections rayon-geometrie,
structures d'acceleration (BVH), reflexion, refraction et echantillonnage Monte Carlo.

## Concepts clés

### Intersection rayon-sphere

Un rayon `P(t) = O + t*D` intersecte une sphere de centre `C` et rayon `r` quand
le discriminant de l'equation quadratique `|P(t) - C|^2 = r^2` est positif.

- **Hit** : discriminant > 0, deux solutions (entree et sortie)
- **Tangent** : discriminant = 0, une seule solution
- **Miss** : discriminant < 0

### Intersection rayon-triangle (Moller-Trumbore)

Algorithme efficace qui calcule simultanement le paramètre `t` et les coordonnees
barycentriques `(u, v)` du point d'impact. Le rayon est parallele au triangle si
le determinant est proche de zero.

### Intersection rayon-AABB (méthode des slabs)

Pour chaque axe, calculer `tmin` et `tmax` d'entree/sortie dans la boite.
L'intersection globale est `max(tmin_x, tmin_y, tmin_z)` a `min(tmax_x, tmax_y, tmax_z)`.

### BVH (Bounding Volume Hierarchy)

Arbre binaire ou chaque noeud contient une AABB. Les feuilles contiennent les triangles.
La construction divise les triangles selon un axe et la traversee evite les branches
dont l'AABB n'est pas touchee par le rayon.

### Reflexion et refraction

- **Reflexion** : `R = I - 2(I . N)N`
- **Refraction** : loi de Snell, `eta = n1/n2`, avec reflexion totale interne possible
- **Fresnel** : approximation de Schlick pour la reflectance en fonction de l'angle

### Echantillonnage Monte Carlo

- **Echantillonnage cosinus** : générer des directions dans un hemisphere pondere par le cosinus
- **Estimation de PI** : méthode classique par points aleatoires dans un carre unitaire

## Exercices

Completez les fonctions dans `exercise.ts` puis lancez les tests :

```bash
npx tsx exercise.ts
```

Verifiez vos résultats avec la solution :

```bash
npx tsx solution.ts
```
