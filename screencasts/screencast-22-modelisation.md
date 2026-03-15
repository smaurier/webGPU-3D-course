# Screencast 22 — Pipeline Blender vers Three.js

## Objectifs
- Decouvrir les bases de Blender pour la modelisation 3D web
- Exporter correctement un modèle au format glTF depuis Blender
- Optimiser la geometrie et les textures pour le web
- Intégrer un modèle Blender dans une scene Three.js

## Plan de tournage
| Timing | Contenu | Ecran |
|--------|---------|-------|
| 0:00-1:00 | Pourquoi Blender : outil gratuit et standard de l'industrie | Slides |
| 1:00-3:00 | Interface Blender : viewport, modes, raccourcis essentiels | Blender |
| 3:00-5:00 | Modelisation basique : extrude, loop cut, bevel | Blender |
| 5:00-6:30 | UV unwrapping : derouler le modèle pour appliquer des textures | Blender |
| 6:30-8:00 | Materiaux Blender : Principled BSDF (compatible PBR/glTF) | Blender |
| 8:00-9:30 | Baking de textures : normal map, AO depuis un modèle high-poly | Blender |
| 9:30-11:00 | Export glTF : paramètres, embedded vs separate, compression Draco | Blender |
| 11:00-12:30 | Vérifier l'export dans le glTF viewer en ligne | Navigateur |
| 12:30-14:00 | Charger le modèle dans Three.js, ajuster les materiaux | VS Code + navigateur |
| 14:00-15:00 | Animations Blender : armature, keyframes, export NLA | Blender |
| 15:00-16:00 | Jouer les animations dans Three.js avec AnimationMixer | VS Code + navigateur |
| 16:00-16:30 | Récapitulatif | Slides |

## Points clés a montrer
- Le Principled BSDF de Blender correspond directement au PBR de Three.js
- L'UV unwrapping est essentiel pour un texturage correct
- Le baking permet de transferer les details d'un modèle high-poly vers un low-poly
- Toujours vérifier l'export glTF avant de l'intégrer dans le code

## Ressources
- Code source `labs/22-modelisation/`
- Blender : https://www.blender.org/
- glTF viewer : https://gltf-viewer.donmccurdy.com/
- Blender glTF exporter doc : https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html
