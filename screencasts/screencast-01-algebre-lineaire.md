# Screencast 01 — Algebre lineaire pour la 3D

## Objectifs
- Comprendre les vecteurs 2D et 3D : addition, soustraction, normalisation
- Maitriser le produit scalaire (dot) et le produit vectoriel (cross)
- Comprendre les matrices 4x4 et la multiplication matricielle
- Visualiser les operations vectorielles de maniere interactive

## Plan de tournage
| Timing | Contenu | Ecran |
|--------|---------|-------|
| 0:00-0:45 | Pourquoi l'algebre lineaire est essentielle en 3D | Slides |
| 0:45-2:30 | Vecteurs : representation, addition, soustraction | Slides + visualisation interactive |
| 2:30-4:00 | Longueur d'un vecteur, normalisation, direction | Visualisation interactive |
| 4:00-5:30 | Produit scalaire : formule, cas d'usage (angle, projection) | VS Code + canvas demo |
| 5:30-7:00 | Produit vectoriel : formule, normale a un plan | VS Code + canvas demo |
| 7:00-9:00 | Matrices 4x4 : structure, identite, multiplication | Slides + VS Code |
| 9:00-11:00 | Implementation en TypeScript : classe Vec3 et Mat4 | VS Code |
| 11:00-12:30 | Demo interactive : manipulation de vecteurs en temps reel | Navigateur |
| 12:30-13:00 | Recapitulatif et exercices | Slides |

## Points cles a montrer
- Le dot product retourne un scalaire, utile pour les angles et la lumiere
- Le cross product retourne un vecteur perpendiculaire, utile pour les normales
- Les matrices 4x4 (pas 3x3) pour inclure la translation via coordonnees homogenes
- L'ordre de multiplication des matrices compte (non commutatif)

## Ressources
- Visualisation `visualizations/transformations.html`
- Code source `labs/01-algebre-lineaire/`
- Livre de reference : "3D Math Primer for Graphics and Game Development"
