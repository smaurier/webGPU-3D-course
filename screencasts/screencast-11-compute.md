# Screencast 11 — Compute shaders et simulation de particules

## Objectifs
- Comprendre les compute shaders : workgroups, invocations, dispatch
- Creer un storage buffer pour des donnees lues et ecrites par le GPU
- Implementer une simulation de particules entierement sur GPU
- Combiner compute et render dans un meme frame

## Plan de tournage
| Timing | Contenu | Ecran |
|--------|---------|-------|
| 0:00-1:00 | Compute shaders : le GPU au-dela du rendu | Slides |
| 1:00-2:30 | Workgroups et invocations : modele d'execution parallele | Slides schema |
| 2:30-4:00 | Storage buffers : lecture/ecriture depuis le compute shader | VS Code |
| 4:00-5:30 | Premier compute shader : doubler les valeurs d'un tableau | VS Code + console |
| 5:30-7:00 | Dispatch : lancer le calcul et lire les resultats | VS Code + console |
| 7:00-9:00 | Simulation de particules : structure de donnees (position, vitesse, couleur) | VS Code |
| 9:00-11:00 | Compute shader : mise a jour des positions avec gravite et rebonds | VS Code |
| 11:00-13:00 | Render pass : dessiner les particules comme des points | VS Code + navigateur |
| 13:00-14:30 | Double buffering : ping-pong entre deux storage buffers | VS Code + navigateur |
| 14:30-15:30 | Optimisation : taille des workgroups, occupancy | VS Code + navigateur |
| 15:30-16:00 | Recapitulatif | Slides |

## Points cles a montrer
- Les compute shaders n'ont pas de pipeline graphique : entree libre, sortie libre
- Un workgroup est un groupe de threads qui peuvent partager de la memoire
- Le double buffering evite les conflits de lecture/ecriture
- Des milliers de particules a 60fps grace au parallelisme GPU

## Ressources
- Code source `labs/11-compute/`
- WebGPU compute tutorial : https://web.dev/gpu-compute/
