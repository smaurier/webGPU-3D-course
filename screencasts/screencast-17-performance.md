# Screencast 17 — Performance GPU et profiling

## Objectifs
- Utiliser Chrome DevTools pour profiler le GPU
- Identifier les goulots d'etranglement : CPU-bound vs GPU-bound
- Appliquer les techniques d'optimisation courantes
- Mesurer l'impact de chaque optimisation

## Plan de tournage
| Timing | Contenu | Ecran |
|--------|---------|-------|
| 0:00-1:00 | Pourquoi profiler : "premature optimization is the root of all evil" | Slides |
| 1:00-2:30 | Chrome DevTools : onglet Performance, GPU timeline | Navigateur DevTools |
| 2:30-4:00 | Spector.js : capturer et inspecter les draw calls WebGL | Navigateur + extension |
| 4:00-5:30 | stats.js et renderer.info : metriques en temps reel | VS Code + navigateur |
| 5:30-7:00 | CPU-bound vs GPU-bound : comment les distinguer | Slides + demo |
| 7:00-8:30 | Draw calls : pourquoi les reduire, batching et merging | VS Code + navigateur |
| 8:30-10:00 | Level of Detail (LOD) : afficher moins de polygones a distance | VS Code + navigateur |
| 10:00-11:30 | Frustum culling : ne pas dessiner ce qui est hors champ | VS Code + navigateur |
| 11:30-13:00 | Textures : compression (basis/KTX2), atlas, resolution adaptative | VS Code + navigateur |
| 13:00-14:30 | Instancing et geometry merging : avant/apres comparaison | VS Code + navigateur |
| 14:30-15:30 | Checklist d'optimisation recapitulative | Slides |
| 15:30-16:00 | Recapitulatif | Slides |

## Points cles a montrer
- Toujours mesurer avant d'optimiser
- Les draw calls sont souvent le premier goulot d'etranglement
- Le LOD est crucial pour les scenes avec beaucoup de geometrie
- La compression de textures KTX2 reduit drastiquement l'utilisation memoire GPU

## Ressources
- Code source `labs/17-performance/`
- Spector.js : https://spector.babylonjs.com/
- Three.js performance tips : https://discoverthreejs.com/tips-and-tricks/
