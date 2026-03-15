# Screencast 16 — Post-processing : Bloom, SSAO et custom passes

## Objectifs
- Comprendre le post-processing : rendu offscreen puis effets en fullscreen
- Implementer Bloom (eclat lumineux) avec EffectComposer
- Ajouter SSAO (occlusion ambiante en espace ecran)
- Écrire un shader pass personnalise

## Plan de tournage
| Timing | Contenu | Ecran |
|--------|---------|-------|
| 0:00-1:00 | Post-processing : le rendu ne s'arrete pas au draw call final | Slides |
| 1:00-2:30 | EffectComposer : chaine de passes de rendu | Slides schema |
| 2:30-4:00 | Setup : EffectComposer, RenderPass comme première passe | VS Code |
| 4:00-6:00 | UnrealBloomPass : paramètres (strength, radius, threshold) | VS Code + navigateur |
| 6:00-7:30 | Bloom selectif : emissive materials pour controler quoi brille | VS Code + navigateur |
| 7:30-9:30 | SSAOPass : occlusion ambiante pour plus de profondeur | VS Code + navigateur |
| 9:30-10:30 | Parametrer le SSAO : radius, minDistance, maxDistance | VS Code + navigateur |
| 10:30-12:30 | ShaderPass personnalise : écrire un effet vignette | VS Code |
| 12:30-14:00 | ShaderPass personnalise : effet de distorsion chromatique | VS Code + navigateur |
| 14:00-15:00 | Performance : cout de chaque passe, quand optimiser | Navigateur DevTools |
| 15:00-15:30 | Récapitulatif | Slides |

## Points clés a montrer
- Chaque passe lit un framebuffer et écrit dans un autre (ping-pong)
- Le Bloom fonctionne en isolant les pixels lumineux puis en les floutant
- Le SSAO simule l'occlusion dans les creux et les coins
- Un shader pass personnalise est juste un fragment shader fullscreen

## Ressources
- Code source `labs/16-post-processing/`
- Three.js examples : postprocessing
- Référence : "GPU Gems" chapitres sur Bloom et SSAO
