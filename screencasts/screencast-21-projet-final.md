# Screencast 21 — Projet final etape par etape

## Objectifs
- Assembler toutes les competences du cours dans un projet complet
- Structurer un projet 3D web de qualite professionnelle
- Implementer un chargement progressif et une gestion des ressources
- Deployer le projet en production

## Plan de tournage
| Timing | Contenu | Ecran |
|--------|---------|-------|
| 0:00-1:00 | Presentation du projet final : galerie 3D interactive | Slides maquette |
| 1:00-3:00 | Architecture du projet : modules, assets, shaders, types | VS Code |
| 3:00-5:00 | Setup : Vite + Three.js + TypeScript, structure des dossiers | Terminal + VS Code |
| 5:00-7:00 | Chargement des modeles glTF avec barre de progression | VS Code + navigateur |
| 7:00-9:00 | Scene setup : eclairage PBR, environment map HDR | VS Code + navigateur |
| 9:00-11:00 | Navigation : camera orbite avec transitions animees entre points de vue | VS Code + navigateur |
| 11:00-13:00 | Interaction : raycasting pour selectionner des objets, panel d'info | VS Code + navigateur |
| 13:00-15:00 | Post-processing : Bloom selectif, SSAO, vignette | VS Code + navigateur |
| 15:00-16:30 | Responsive : adapter le renderer au resize, gerer le mobile | VS Code + navigateur |
| 16:30-18:00 | Optimisation : LOD, texture compression KTX2, lazy loading | VS Code |
| 18:00-19:00 | Deploiement : build Vite, deployer sur Vercel/Netlify | Terminal + navigateur |
| 19:00-19:30 | Recapitulatif et perspectives | Slides |

## Points cles a montrer
- Un projet 3D web professionnel necessite une architecture bien pensee
- Le chargement progressif ameliore l'experience utilisateur
- La combinaison de toutes les techniques vues dans le cours
- L'optimisation est necessaire pour un deploiement en production

## Ressources
- Code source `labs/21-projet-final/`
- Vercel : https://vercel.com/
- Template de projet disponible dans le depot
