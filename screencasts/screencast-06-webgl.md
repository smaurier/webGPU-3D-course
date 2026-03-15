# Screencast 06 — Premier triangle WebGL

## Objectifs
- Obtenir un contexte WebGL2 et comprendre sa machine a états
- Écrire un vertex shader et un fragment shader en GLSL
- Compiler, linker et utiliser un programme shader
- Dessiner un premier triangle colore a l'ecran

## Plan de tournage
| Timing | Contenu | Ecran |
|--------|---------|-------|
| 0:00-0:45 | Introduction a WebGL : API bas niveau dans le navigateur | Slides |
| 0:45-2:00 | Obtenir le contexte WebGL2 depuis un canvas | VS Code + navigateur |
| 2:00-3:30 | La machine a états : gl.bindBuffer, gl.useProgram, etc. | Slides schema |
| 3:30-5:30 | Écrire le vertex shader GLSL : attribute position, gl_Position | VS Code |
| 5:30-7:00 | Écrire le fragment shader GLSL : couleur de sortie | VS Code |
| 7:00-9:00 | Compilation et linkage du programme shader | VS Code + console navigateur |
| 9:00-10:30 | Créer un vertex buffer avec les coordonnees du triangle | VS Code |
| 10:30-12:00 | Configurer les vertex attributes et dessiner | VS Code + navigateur |
| 12:00-13:30 | Debugging : erreurs courantes de compilation shader | VS Code + console |
| 13:30-14:00 | Récapitulatif | Slides |

## Points clés a montrer
- WebGL est une machine a états : chaque appel modifie l'état global
- Les shaders sont des programmes qui s'executent sur le GPU
- La compilation de shaders peut echouer : toujours vérifier gl.getShaderInfoLog
- Les coordonnees clip space vont de -1 a +1 sur chaque axe

## Ressources
- Code source `labs/06-webgl/`
- WebGL2 Fundamentals : https://webgl2fundamentals.org/
- MDN WebGL API : https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API
