# Lab 24 — Global Illumination

## Objectif

Implementer les techniques de base de l'illumination globale : harmoniques spheriques,
sondes de lumiere, Screen-Space Reflections (SSR), Temporal Anti-Aliasing (TAA),
et Horizon-Based Ambient Occlusion (HBAO).

## Concepts cles

### Harmoniques spheriques (SH)

Les SH permettent de stocker une approximation basse frequence de l'eclairage
sous forme de quelques coefficients. La bande 0 capture la lumiere ambiante constante,
la bande 1 capture la composante directionnelle.

- Bande 0 : `Y00 = 0.2821` (constante)
- Bande 1 : `Y1m` depend de la direction `(x, y, z)`

### Sondes de lumiere (Light Probes)

Un volume 3D est discretise en une grille de sondes contenant des coefficients SH.
L'interpolation trilineaire entre les 8 sondes voisines donne l'eclairage en tout point.

### Screen-Space Reflections (SSR)

Un rayon est marche en espace ecran : a chaque pas, on avance en UV et on compare
la profondeur du rayon avec le depth buffer. Un hit est detecte quand le rayon passe
derriere la geometrie.

### Temporal Anti-Aliasing (TAA)

- **Jitter** : offsets de Halton (base 2 et 3) appliques a la projection
- **Motion vectors** : difference entre la position actuelle et precedente en clip space
- **History clamping** : on contraint la couleur historique dans le min/max du voisinage 3x3

### HBAO (Horizon-Based Ambient Occlusion)

L'angle d'horizon est mesure en echantillonnant le depth buffer autour de chaque pixel.
Un filtre bilateral preserve les aretes en tenant compte des differences de profondeur.

## Exercices

Completez les fonctions dans `exercise.ts` puis lancez les tests :

```bash
npx tsx exercise.ts
```

Verifiez vos resultats avec la solution :

```bash
npx tsx solution.ts
```
