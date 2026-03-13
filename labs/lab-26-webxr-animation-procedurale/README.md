# Lab 26 — WebXR et animation procedurale

## Objectif

Implementer les concepts fondamentaux de la realite virtuelle/augmentee (XR) et de
l'animation procedurale : configuration stereo, cinematique inverse (IK), cycles de
marche proceduraux, ressorts amortis, machines a etats d'animation et rendu foveate.

## Concepts cles

### Camera stereo

En VR, on rend deux images : une pour chaque oeil. Les cameras sont decalees de +/- IPD/2
(Inter-Pupillary Distance, ~63mm) le long du vecteur droit. Chaque oeil utilise un
frustum asymetrique pour que les deux images convergent correctement.

### Cinematique inverse (IK)

L'IK calcule les angles des articulations pour qu'un effecteur terminal atteigne une cible.

- **CCD** (Cyclic Coordinate Descent) : itere sur chaque joint en partant du bout, ajuste
  l'angle pour rapprocher l'effecteur de la cible.
- **FABRIK** (Forward And Backward Reaching IK) : passe avant (effecteur vers cible) puis
  passe arriere (racine vers position d'origine). Converge rapidement.

### Animation procedurale

- **Cycle de marche** : hauteur du pied = amplitude * sin(phase + temps * frequence)
- **Ressort amorti** : simule un mouvement elastique qui converge vers une position cible.
  `acceleration = -stiffness * (pos - target) - damping * velocity`

### Machine a etats d'animation

Transitions entre etats (idle, walk, run) basees sur des conditions (vitesse, input).
Chaque etat a une animation associee, les transitions peuvent avoir des conditions de garde.

### Look-at constraint

Calcule les angles yaw (lacet) et pitch (tangage) pour orienter un objet vers une cible.

### Blend de poses

Interpolation lineaire (lerp) entre deux poses pour creer des transitions fluides.

### Rendu foveate

En VR, on rend le centre du regard en haute resolution et la peripherie en basse resolution.
Classification des pixels en zones : inner (haute res), middle (moyenne res), outer (basse res).

### Matrice de vue XR

Convertit une pose XR (position + orientation quaternion) en matrice de vue pour le rendu.

## Exercices

Completez les fonctions dans `exercise.ts` puis lancez les tests :

```bash
npx tsx exercise.ts
```

Verifiez vos resultats avec la solution :

```bash
npx tsx solution.ts
```
