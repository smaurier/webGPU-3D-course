# Screencast 13 — Three.js : du hello world à la scene interactive

## Objectifs
- Installer Three.js et comprendre son architecture (Scene, Camera, Renderer)
- Créer des geometries, materiaux et meshes de base
- Ajouter des lumieres et une camera orbite
- Animer la scene avec requestAnimationFrame

## Plan de tournage
| Timing | Contenu | Ecran |
|--------|---------|-------|
| 0:00-1:00 | Pourquoi Three.js : abstraction haut niveau pour la 3D web | Slides |
| 1:00-2:30 | Installation via npm, structure de l'import ES modules | Terminal + VS Code |
| 2:30-4:00 | Le trio fondamental : Scene, Camera, WebGLRenderer | VS Code |
| 4:00-5:30 | Geometries built-in : BoxGeometry, SphereGeometry, PlaneGeometry | VS Code + navigateur |
| 5:30-7:00 | Materiaux de base : MeshBasicMaterial, MeshStandardMaterial | VS Code + navigateur |
| 7:00-8:30 | Créer un mesh et l'ajouter à la scene | VS Code + navigateur |
| 8:30-10:00 | Lumieres : AmbientLight, DirectionalLight, PointLight | VS Code + navigateur |
| 10:00-11:30 | OrbitControls : navigation interactive dans la scene | VS Code + navigateur |
| 11:30-13:00 | Animation : boucle de rendu, rotation, translation | VS Code + navigateur |
| 13:00-14:00 | Gestion du resize et du pixel ratio | VS Code + navigateur |
| 14:00-14:30 | Récapitulatif | Slides |

## Points clés a montrer
- Three.js géré automatiquement les matrices, shaders et états WebGL
- MeshStandardMaterial utilise le PBR par defaut
- OrbitControls est dans le dossier examples/jsm, pas dans le core
- Le pixel ratio (window.devicePixelRatio) est essentiel pour la nettete sur Retina

## Ressources
- Code source `labs/13-threejs/`
- Documentation Three.js : https://threejs.org/docs/
- Three.js examples : https://threejs.org/examples/
