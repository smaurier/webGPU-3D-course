# Screencast 02 — Transformations geometriques

## Objectifs
- Comprendre les trois transformations fondamentales : Scale, Rotation, Translation (SRT)
- Construire les matrices de transformation 4x4 correspondantes
- Decouvrir les quaternions comme alternative aux angles d'Euler
- Visualiser le probleme du gimbal lock et comment le resoudre

## Plan de tournage
| Timing | Contenu | Ecran |
|--------|---------|-------|
| 0:00-0:45 | Rappel : pourquoi transformer des objets dans l'espace | Slides |
| 0:45-2:30 | Matrice de translation : construction, demonstration | VS Code + visualisation |
| 2:30-4:00 | Matrice de scale : uniforme vs non-uniforme | VS Code + visualisation |
| 4:00-6:00 | Matrice de rotation : autour de X, Y, Z, axe arbitraire | VS Code + visualisation |
| 6:00-7:30 | Ordre SRT : pourquoi Scale puis Rotate puis Translate | Visualisation interactive |
| 7:30-8:30 | Angles d'Euler : roulis, tangage, lacet | Slides + demo |
| 8:30-10:00 | Gimbal lock : demonstration visuelle du probleme | Demo 3D animee |
| 10:00-12:00 | Quaternions : intuition, creation, interpolation (slerp) | Slides + VS Code |
| 12:00-13:30 | Implementation : classe Transform avec position, rotation, scale | VS Code |
| 13:30-14:00 | Recapitulatif | Slides |

## Points cles a montrer
- L'ordre de multiplication des matrices change le resultat visuellement
- Le gimbal lock se produit quand deux axes de rotation s'alignent
- Les quaternions evitent le gimbal lock et permettent des interpolations lisses
- La fonction slerp pour des transitions fluides entre orientations

## Ressources
- Visualisation `visualizations/transformations.html`
- Code source `labs/02-transformations/`
- Demo gimbal lock avec Three.js Euler vs Quaternion
