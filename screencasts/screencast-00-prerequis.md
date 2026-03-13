# Screencast 00 — Prerequis et setup du projet

## Objectifs
- Installer l'environnement de developpement (Node.js, VS Code, extensions)
- Comprendre l'architecture d'un GPU et pourquoi il est optimise pour le rendu 3D
- Creer un premier canvas HTML et obtenir un contexte WebGL/WebGPU
- Verifier la compatibilite GPU du navigateur

## Plan de tournage
| Timing | Contenu | Ecran |
|--------|---------|-------|
| 0:00-0:30 | Introduction du cours et objectifs generaux | Slides |
| 0:30-2:00 | Installation de Node.js, pnpm, VS Code | Terminal + VS Code |
| 2:00-3:30 | Extensions VS Code recommandees (Shader languages, WebGL GLSL Editor) | VS Code |
| 3:30-5:00 | Architecture CPU vs GPU : parallelisme massif, pipeline fixe | Slides schema |
| 5:00-6:30 | Anatomie d'un GPU : cores, VRAM, bus memoire | Slides schema |
| 6:30-8:00 | Creation du projet avec Vite, structure des dossiers | Terminal + VS Code |
| 8:00-9:30 | Premier canvas HTML, detection WebGL2 et WebGPU | VS Code + navigateur |
| 9:30-10:30 | Verification GPU : chrome://gpu, adapter.requestDevice() | Navigateur |
| 10:30-11:00 | Recapitulatif et prochaine etape | Slides |

## Points cles a montrer
- La difference fondamentale entre CPU (sequentiel) et GPU (parallele)
- Comment verifier si WebGPU est disponible dans le navigateur
- Le fallback WebGL2 quand WebGPU n'est pas supporte
- La structure de dossiers du projet qui sera utilisee tout au long du cours

## Ressources
- https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
- https://webgpufundamentals.org/
- Template Vite dans `labs/00-setup/`
- Slides `modules/00-prerequis/slides.md`
