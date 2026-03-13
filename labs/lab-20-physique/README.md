# Lab 20 — Physique

## Objectif

Implementer les algorithmes de simulation physique utilises en 3D temps reel :
detection de collisions (AABB, sphere, rayon), reponse par impulsion,
integration d'Euler, simulation de gravite, GJK support, broad phase, et ressorts.

## Concepts cles

### Detection de collisions

- **AABB-AABB** : deux boites alignees aux axes se chevauchent si elles se chevauchent sur les 3 axes.
- **Sphere-sphere** : collision si la distance entre les centres est inferieure a la somme des rayons.
- **Sphere-plan** : collision si la distance signee du centre au plan est inferieure au rayon.
- **Ray-AABB** : methode des slabs — calculer les intervalles d'intersection par axe et verifier leur chevauchement.

### Integration d'Euler

La methode la plus simple pour simuler le mouvement :
- `position += velocity * dt`
- `velocity += acceleration * dt`

### Reponse par impulsion

Lors d'une collision entre deux objets, l'impulsion depend de la vitesse relative,
de la normale de contact et du coefficient de restitution (elasticite du rebond).

### GJK (Gilbert-Johnson-Keerthi)

Algorithme de detection de collision base sur la difference de Minkowski.
La fonction support retourne le point le plus eloigne d'une forme dans une direction donnee.

### Broad Phase

Premiere passe rapide pour eliminer les paires d'objets qui ne peuvent pas entrer en collision.
Techniques : grille spatiale (spatial hash) ou sweep-and-prune.

### Ressorts (loi de Hooke)

`F = -k * x - d * v` ou k est la raideur, x le deplacement et d l'amortissement.

## Exercices

Completez les fonctions dans `exercise.ts` puis lancez les tests :

```bash
npx tsx exercise.ts
```

Verifiez vos resultats avec la solution :

```bash
npx tsx solution.ts
```
