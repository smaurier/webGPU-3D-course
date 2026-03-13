# Lab 18 — Shadow Mapping

## Objectif

Implementer les algorithmes mathematiques du shadow mapping : projection dans l'espace lumiere,
echantillonnage de la shadow map, calcul de biais, PCF (Percentage-Closer Filtering),
cascaded shadow maps et variance shadow maps.

## Concepts cles

### Light Space Matrix

Pour generer une shadow map, on projette la scene depuis le point de vue de la lumiere.
La matrice light-space est le produit d'une projection orthographique et d'une matrice lookAt
depuis la position de la lumiere.

### Shadow Map Lookup

Pour savoir si un fragment est dans l'ombre, on projette sa position monde dans l'espace lumiere,
puis on compare sa profondeur avec la valeur stockee dans la shadow map.

### Shadow Bias

Le "shadow acne" apparait quand la resolution de la shadow map est insuffisante.
Un biais base sur la pente (slope-based bias) utilise l'angle entre la normale et la direction
de la lumiere pour ajuster le decalage.

### PCF (Percentage-Closer Filtering)

Plutot que de faire un seul test binaire, on echantillonne plusieurs texels voisins (ex: grille 3x3)
et on moyenne les resultats pour obtenir des ombres douces.

### Cascaded Shadow Maps (CSM)

On divise le frustum de la camera en cascades. Chaque cascade a sa propre shadow map.
Le "practical split scheme" melange decoupage logarithmique et lineaire.

### Variance Shadow Maps (VSM)

Au lieu de stocker uniquement la profondeur, on stocke aussi le carre de la profondeur.
Cela permet d'estimer la variance et d'utiliser l'inegalite de Tchebychev pour un filtrage doux.

## Exercices

Completez les fonctions dans `exercise.ts` puis lancez les tests :

```bash
npx tsx exercise.ts
```

Verifiez vos resultats avec la solution :

```bash
npx tsx solution.ts
```
