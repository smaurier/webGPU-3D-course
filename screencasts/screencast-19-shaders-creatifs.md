# Screencast 19 — Shaders creatifs : terrain et eau

## Objectifs
- Generer un terrain procedural avec du bruit de Perlin/Simplex
- Appliquer des textures par altitude (herbe, roche, neige)
- Creer un shader d'eau realiste avec reflexion et refraction
- Live coder les shaders en temps reel avec hot reload

## Plan de tournage
| Timing | Contenu | Ecran |
|--------|---------|-------|
| 0:00-1:00 | Les shaders creatifs : quand les maths deviennent de l'art | Slides |
| 1:00-3:00 | Bruit de Perlin : principe, implementation GLSL, octaves | VS Code |
| 3:00-5:00 | Terrain : deplacer les vertices d'un plan avec le bruit | VS Code + navigateur |
| 5:00-7:00 | Coloration par altitude : mix() entre textures selon la hauteur | VS Code + navigateur |
| 7:00-8:30 | Normales recalculees : eclairage correct sur le terrain deforme | VS Code + navigateur |
| 8:30-10:00 | Shader d'eau : surface animee avec des vagues sinusoidales | VS Code + navigateur |
| 10:00-11:30 | Reflexion planaire : render-to-texture avec camera inversee | VS Code + navigateur |
| 11:30-13:00 | Effet de Fresnel : plus de reflexion en angle rasant | VS Code + navigateur |
| 13:00-14:30 | Combiner terrain + eau dans une scene complete | VS Code + navigateur |
| 14:30-15:30 | Ajout de brouillard pour la profondeur atmospherique | VS Code + navigateur |
| 15:30-16:00 | Recapitulatif | Slides |

## Points cles a montrer
- Le bruit de Perlin est la base de quasiment toute generation procedurale
- Les octaves de bruit ajoutent du detail a differentes echelles
- Le ShaderMaterial de Three.js permet d'ecrire des vertex et fragment shaders custom
- L'effet de Fresnel est essentiel pour un rendu d'eau convaincant

## Ressources
- Visualisation `visualizations/shader-sandbox.html`
- Code source `labs/19-shaders-creatifs/`
- Shadertoy pour l'inspiration : https://www.shadertoy.com/
- The Book of Shaders : https://thebookofshaders.com/
