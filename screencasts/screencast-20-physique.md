# Screencast 20 — Physique avec Rapier.js et Three.js

## Objectifs
- Intégrer un moteur physique (Rapier.js) avec Three.js
- Créer des corps rigides : dynamiques, statiques, cinematiques
- Configurer des colliders : boite, sphere, capsule, trimesh
- Construire un playground physique interactif

## Plan de tournage
| Timing | Contenu | Ecran |
|--------|---------|-------|
| 0:00-1:00 | La physique en temps réel : simulation vs realisme | Slides |
| 1:00-2:30 | Rapier.js : installation, WASM, création du monde | Terminal + VS Code |
| 2:30-4:00 | Corps rigides : RigidBodyDesc, types (dynamic, fixed, kinematic) | VS Code |
| 4:00-5:30 | Colliders : formes, friction, restitution (rebond) | VS Code |
| 5:30-7:00 | Synchroniser les positions Rapier -> Three.js à chaque frame | VS Code + navigateur |
| 7:00-9:00 | Demo : cubes qui tombent sur un sol avec gravite | VS Code + navigateur |
| 9:00-10:30 | Joints : connecter des corps rigides (charniere, ressort) | VS Code + navigateur |
| 10:30-12:00 | Raycasting physique : détecter les clics sur des objets | VS Code + navigateur |
| 12:00-13:30 | Appliquer des forces et des impulsions au clic | VS Code + navigateur |
| 13:30-15:00 | Playground complet : lancer des balles sur une pile de cubes | VS Code + navigateur |
| 15:00-15:30 | Récapitulatif | Slides |

## Points clés a montrer
- Rapier.js utilise du WASM pour des performances proches du natif
- La simulation physique tourne à un pas de temps fixe, independant du framerate
- Chaque mesh Three.js à un corps rigide Rapier correspondant
- Le raycasting physique est plus précis que le raycasting Three.js pour les collisions

## Ressources
- Code source `labs/20-physique/`
- Rapier.js documentation : https://rapier.rs/docs/user_guides/javascript/
- Exemples Rapier + Three.js
