# Screencast 23 — Ray Tracing

## Objectifs
- Implementer un ray tracer basique en compute shader WebGPU
- Visualiser la construction et la traversee d'un BVH
- Observer la convergence du path tracing en fonction du nombre de SPP
- Comprendre les concepts d'intersection rayon-sphere et rayon-triangle

## Plan de tournage
| Timing | Contenu | Ecran |
|--------|---------|-------|
| 0:00-1:30 | Introduction au ray tracing : principe du lancer de rayons | Slides avec diagramme |
| 1:30-4:00 | Intersection rayon-sphere : equation quadratique, discriminant | Code WGSL + visualisation |
| 4:00-7:00 | Écriture du compute shader : génération de rayons depuis la camera | VS Code + rendu WebGPU en direct |
| 7:00-10:00 | Ajout de materiaux diffus et metalliques, loi de reflexion | Code + rendu progressif |
| 10:00-13:00 | Construction du BVH : visualisation des boites englobantes | Demo BVH avec boites colorees par niveau |
| 13:00-16:00 | Path tracing : accumulation SPP, convergence Monte Carlo | Demo side-by-side 1 SPP vs 64 vs 256 |
| 16:00-18:00 | Refraction et loi de Snell, materiaux dielectriques | Sphere de verre en demo |
| 18:00-19:00 | Recap et pistes d'optimisation | Slides de synthese |

## Points clés a montrer
- Le compute shader qui écrit directement dans une texture de sortie
- Visualisation pas a pas des rebonds d'un rayon dans la scene
- Overlay des boites BVH avec code couleur par profondeur
- Graphique de convergence : bruit en fonction du nombre de SPP
- Comparaison visuelle avant/après BVH (compteur d'intersections testees)

## Ressources
- "Ray Tracing in One Weekend" de Peter Shirley
- Specification WebGPU compute shaders
- PBRT (Physically Based Rendering)
- https://raytracing.github.io/
