# Screencast 12 — WebGPU avance : deferred rendering et render bundles

## Objectifs
- Comprendre le rendu differe (deferred rendering) et ses avantages
- Implementer un G-buffer avec plusieurs render targets
- Utiliser les render bundles pour pre-enregistrer des commandes
- Optimiser les performances avec le multi-sampling (MSAA)

## Plan de tournage
| Timing | Contenu | Ecran |
|--------|---------|-------|
| 0:00-1:00 | Forward vs deferred rendering : pourquoi changer d'approche | Slides |
| 1:00-3:00 | G-buffer : stocker position, normale, albedo dans des textures | Slides schema |
| 3:00-5:00 | Premiere passe : ecrire le G-buffer avec MRT (Multiple Render Targets) | VS Code |
| 5:00-7:00 | Deuxieme passe : lighting pass en fullscreen quad | VS Code |
| 7:00-9:00 | Avantage : des dizaines de lumieres sans exploser le cout | VS Code + navigateur |
| 9:00-10:30 | Render bundles : enregistrer une fois, rejouer plusieurs fois | VS Code |
| 10:30-12:00 | Quand utiliser les render bundles : scenes statiques, UI | VS Code + navigateur |
| 12:00-13:30 | MSAA en WebGPU : configurer le multi-sampling | VS Code + navigateur |
| 13:30-14:30 | Profiling : mesurer l'impact des optimisations | Navigateur DevTools |
| 14:30-15:00 | Recapitulatif | Slides |

## Points cles a montrer
- Le deferred rendering decouple la geometrie de l'eclairage
- Le G-buffer consomme beaucoup de memoire : chaque pixel stocke plusieurs textures
- Les render bundles reduisent le cout CPU de l'enregistrement de commandes
- MSAA lisse les bords sans le cout du super-sampling

## Ressources
- Code source `labs/12-webgpu-avance/`
- Reference : "Deferred Shading" sur learnopengl.com
