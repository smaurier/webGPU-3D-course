# Screencast Maths — Prérequis mathematiques

## Objectifs
- Comprendre visuellement la trigonometrie (sin, cos) sur le cercle unite
- Maîtriser l'interpolation lineaire (lerp) et ses applications en animation
- Revoir le théorème de Pythagore et le produit scalaire dans un contexte 3D
- Savoir convertir degres/radians et manipuler les angles

## Plan de tournage
| Timing | Contenu | Ecran |
|--------|---------|-------|
| 0:00-1:30 | Introduction : pourquoi les maths sont essentielles en 3D | Slides avec exemples visuels |
| 1:30-4:00 | Cercle unite interactif : sin/cos en temps réel, point qui tourne | Demo Canvas 2D interactive |
| 4:00-6:00 | Conversion degres/radians, formule et exemples pratiques | Code + visualisation |
| 6:00-8:30 | Lerp : formule, interpolation de positions, couleurs, demo animee | Demo lerp interactive avec slider |
| 8:30-10:30 | Pythagore : calcul de distance 2D/3D, norme d'un vecteur | Visualisation geometrique |
| 10:30-13:00 | Dot product : projection, angle entre vecteurs, demo interactive | Demo 2D avec vecteurs draggables |
| 13:00-14:00 | Recap et exercices à faire soi-même | Slides de synthese |

## Points clés a montrer
- Animation du point sur le cercle unite avec projection sin/cos sur les axes
- Slider interactif pour le paramètre t de lerp, montrant la position resultante
- Calcul de distance en direct entre deux points cliquables
- Visualisation du dot product : angle qui change quand on deplace un vecteur
- Cas pratiques : orienter un personnage vers une cible, deplacer une camera en douceur

## Ressources
- MDN : Math.sin(), Math.cos(), Math.atan2()
- Canvas 2D API pour les demos interactives
- Livre "3D Math Primer for Graphics and Game Development"
- https://www.mathsisfun.com/algebra/trig-interactive-unit-circle.html
