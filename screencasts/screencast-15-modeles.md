# Screencast 15 — Chargement de modeles glTF et animations

## Objectifs
- Charger des modeles 3D au format glTF/GLB avec Three.js
- Naviguer dans la hierarchie d'un modele charge (scene graph)
- Jouer des animations skelettales avec AnimationMixer
- Utiliser l'instancing pour afficher de nombreuses copies performantes

## Plan de tournage
| Timing | Contenu | Ecran |
|--------|---------|-------|
| 0:00-1:00 | Le format glTF : le "JPEG de la 3D" | Slides |
| 1:00-2:30 | GLTFLoader : charger un modele .glb | VS Code + navigateur |
| 2:30-4:00 | Explorer le resultat : scene, nodes, meshes, materiaux | VS Code + console |
| 4:00-5:30 | Ajuster la taille et la position du modele charge | VS Code + navigateur |
| 5:30-7:00 | Hierarchie : parcourir le scene graph avec traverse() | VS Code + console |
| 7:00-9:00 | AnimationMixer : jouer les animations embarquees | VS Code + navigateur |
| 9:00-10:30 | Controle des animations : play, pause, crossfade, timeScale | VS Code + navigateur |
| 10:30-12:00 | DRACOLoader : compression pour des fichiers plus legers | VS Code |
| 12:00-14:00 | InstancedMesh : afficher 1000 copies d'un meme modele | VS Code + navigateur |
| 14:00-15:00 | Mettre a jour les matrices d'instances individuellement | VS Code + navigateur |
| 15:00-15:30 | Recapitulatif | Slides |

## Points cles a montrer
- glTF supporte les materiaux PBR, animations, et hierarchie dans un seul fichier
- AnimationMixer fonctionne avec un delta time a chaque frame
- Le crossfade permet des transitions fluides entre animations
- InstancedMesh dessine N copies en un seul draw call, enorme gain de performance

## Ressources
- Code source `labs/15-modeles/`
- Modeles gratuits : https://sketchfab.com/ (filtre glTF)
- glTF viewer : https://gltf-viewer.donmccurdy.com/
- Visualisation `visualizations/scene-graph.html`
