# Screencast 26 — WebXR et Animation

## Objectifs
- Configurer une session WebXR immersive-vr avec rendu stereo
- Implementer un solveur IK avec l'algorithme FABRIK
- Creer un cycle de marche procedural avec des sinusoides
- Comprendre le foveated rendering et ses benefices en VR

## Plan de tournage
| Timing | Contenu | Ecran |
|--------|---------|-------|
| 0:00-1:30 | Introduction : WebXR API, modes immersive-vr et immersive-ar | Slides avec schema d'architecture |
| 1:30-4:30 | Setup WebXR : requestSession, reference spaces, render loop XR | Code + navigateur avec emulateur XR |
| 4:30-7:00 | Rendu stereo : deux viewports, matrices de projection par oeil, IPD | Demo dans l'emulateur VR |
| 7:00-9:00 | Input XR : controllers, hand tracking, hit test basique | Demo interaction mains |
| 9:00-11:30 | Foveated rendering : principe, niveaux de qualite, implementation | Schema + comparaison perf GPU |
| 11:30-14:00 | Cinematique inverse : probleme IK, approche analytique 2 joints | Demo 2D interactive |
| 14:00-17:00 | FABRIK : algorithme forward/backward, implementation pas a pas | Code + visualisation chaine IK |
| 17:00-19:30 | Marche procedurale : sinusoides dephasees, placement des pieds | Demo personnage qui marche |
| 19:30-20:30 | Integration : personnage VR avec IK sur les mains trackees | Demo finale dans le casque |
| 20:30-21:30 | Recap et bonnes pratiques VR (framerate, motion sickness) | Slides de synthese |

## Points cles a montrer
- Cycle de vie complet d'une session WebXR dans le navigateur
- Split-screen montrant les deux rendus oeil gauche / oeil droit
- Animation pas a pas de FABRIK : forward pass puis backward pass
- Sliders pour la frequence et l'amplitude du cycle de marche procedural
- Overlay montrant les zones de resolution en foveated rendering (centre vs peripherie)

## Ressources
- Specification WebXR Device API (W3C)
- Three.js VR examples et documentation WebXR
- "FABRIK: A fast, iterative solver for the Inverse Kinematics problem" (Aristidou & Lasenby)
- Immersive Web Developer Home : https://immersiveweb.dev/
- WebXR Emulator Extension pour Chrome/Firefox
