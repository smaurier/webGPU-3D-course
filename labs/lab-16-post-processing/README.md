# Lab 16 — Post-processing

## Objectif

Implementer les algorithmes de post-processing utilises dans les moteurs 3D :
chaine de rendu, bloom, flou gaussien, vignette, tone mapping, color grading,
aberration chromatique, profondeur de champ, raycasting et projection ecran.

## Concepts clés

### Chaine de rendu (Render Target Chain)

Les effets de post-processing s'enchainent : l'image de sortie d'un pass devient
l'entree du suivant. Chaque pass est identifie et connecte au précédent.

### Bloom

1. **Threshold** : les pixels dont la luminance dépasse un seuil sont conserves, les autres deviennent noirs.
2. **Blur** : le résultat est floute (noyau gaussien).
3. **Combine** : l'image floutee est ajoutee a l'image originale.

### Tone mapping

Convertit les valeurs HDR (High Dynamic Range) en LDR [0,1] :
- **Reinhard** : `x / (1 + x)`
- **ACES Filmic** : approximation de la courbe ACES

### Color grading

Ajustement de la luminosite, du contraste et de la saturation via une matrice 3x3.

### Raycasting

Intersection rayon-sphere et rayon-AABB pour la selection d'objets.

### Projection ecran

Transformer une position 3D en coordonnees UV [0,1] via la matrice MVP.

## Exercices

Completez les fonctions dans `exercise.ts` puis lancez les tests :

```bash
npx tsx exercise.ts
```

Verifiez vos résultats avec la solution :

```bash
npx tsx solution.ts
```
