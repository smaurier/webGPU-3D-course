# Module 22 — Modelisation 3D (annexe)

| Difficulte | Duree estimee | Lab | Quiz |
|:----------:|:-------------:|:---:|:----:|
| 3/5        | 120 min       | [Lab 22](../labs/lab-22-modelisation-3d/) | [Quiz 22](../quizzes/quiz-22-modelisation-3d.html) |

## Objectifs pedagogiques

A la fin de ce module, vous serez capable de :

- Naviguer dans l'interface de Blender et utiliser les raccourcis essentiels
- Comprendre la modelisation polygonale : vertices, edges, faces, quads vs tris
- Appliquer les modifiers courants (Subdivision Surface, Mirror, Boolean, Array)
- Derouler les UVs d'un modele et comprendre les seams
- Configurer un materiau PBR dans Blender (Principled BSDF)
- Baker des normal maps, AO maps et lightmaps
- Creer un squelette basique (armature), peindre les poids et poser un modele
- Animer avec des keyframes et exporter en glTF 2.0
- Optimiser les modeles pour le web (polycount, LOD, decimation)
- Comprendre la structure interne du format glTF (JSON + binaire)

---

<details>
<summary>Rappel du cours precedent — Projet final (Module 21)</summary>

Au module 21, nous avons assemble tous les concepts du cours :

- **Architecture modulaire** : classes separees pour Engine, Terrain, Water, Physics, Particles, Camera, PostProcessing, UI
- **Terrain procedural** : FBM dans le vertex shader + heightfield Rapier cote CPU
- **Eclairage complet** : HemisphereLight + DirectionalLight avec ombres + PointLights decoratives
- **Post-processing** : EffectComposer avec RenderPass, UnrealBloomPass, SSAO, vignette, OutputPass
- **Physique** : Rapier world avec fixed timestep, bodies dynamiques, raycasting pour le picking
- **Camera duale** : OrbitControls + PointerLockControls avec toggle
- **Checklist qualite** : 60 FPS, 0 memory leaks, progressive loading, dispose cleanup

Ce module annexe couvre la creation des assets 3D eux-memes — le "contenu" que votre code affiche.

</details>

---

## Pourquoi un dev 3D web doit comprendre la modelisation

:::tip Analogie
Un developpeur web frontend n'a pas besoin d'etre graphiste, mais il doit comprendre les formats d'images, les couleurs, les polices. De la meme maniere, un dev 3D web n'a pas besoin d'etre modeliseur, mais il doit comprendre comment les modeles sont construits — pour debugger les UV qui ne collent pas, le mesh qui a des faces inversees, l'animation qui ne joue pas, ou le fichier glTF de 50 MB qui devrait en faire 5. Connaitre le pipeline de creation d'assets, c'est pouvoir communiquer avec les artistes 3D et diagnostiquer les problemes a la source.
:::

### Ce que vous devez savoir faire

```
Competences d'un dev 3D web en modelisation
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Ouvrir un modele dans Blender et inspecter sa topologie
✓ Corriger des normales inversees, des UV manquants
✓ Reduire le polycount d'un modele trop lourd
✓ Exporter en glTF avec les bons parametres
✓ Comprendre le baking de textures (normal map, AO)
✓ Creer un modele simple de prototypage (cubes, cylindres)
✓ Deboguer une animation qui ne s'exporte pas correctement

✗ Sculpter un personnage photoraliste (c'est le job du modeliseur)
✗ Creer des textures PBR from scratch (c'est le job du texture artist)
✗ Rigger un personnage complexe (c'est le job du rigger)
```

---

## Blender : interface et navigation

### Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────┐
│  Menu : File  Edit  Render  Window  Help                       │
├────────────┬────────────────────────────────────────┬───────────┤
│            │                                        │           │
│  Outliner  │        3D Viewport                     │ Properties│
│  (scene    │                                        │ (Object,  │
│   tree)    │    Grille + objets                     │  Material,│
│            │    Navigation avec la souris            │  Modifier,│
│            │                                        │  Physics, │
│            │                                        │  etc.)    │
│            │                                        │           │
├────────────┴────────────────────────────────────────┴───────────┤
│  Timeline (animation) / Shader Editor / UV Editor              │
└─────────────────────────────────────────────────────────────────┘
```

### Navigation 3D

| Action | Raccourci | Description |
|--------|-----------|-------------|
| **Orbiter** | MMB (molette clic) + glisser | Tourner autour du point de focus |
| **Zoomer** | Scroll molette | Rapprocher / eloigner |
| **Pan** | Shift + MMB + glisser | Deplacer lateralement |
| **Vue face** | Numpad 1 | Vue de face (-Y) |
| **Vue droite** | Numpad 3 | Vue de droite (+X) |
| **Vue dessus** | Numpad 7 | Vue du dessus (-Z) |
| **Vue camera** | Numpad 0 | Vue depuis la camera active |
| **Cadrer selection** | Numpad . | Zoomer sur l'objet selectionne |
| **Ortho/Persp** | Numpad 5 | Basculer orthographique / perspective |

### Raccourcis essentiels

```
Mode Objet (Object Mode)
━━━━━━━━━━━━━━━━━━━━━━━
G           Grab (deplacer)         G puis X/Y/Z = contraindre sur un axe
R           Rotate (tourner)        R puis X/Y/Z = contraindre
S           Scale (mettre a l'echelle)  S puis X/Y/Z = contraindre
Tab         Basculer Object Mode ↔ Edit Mode
Shift+A     Ajouter un objet (Add menu)
X / Delete  Supprimer la selection
Ctrl+Z      Annuler
Ctrl+S      Sauvegarder

G, 0, Enter    Remettre a zero sur l'axe actif
R, 90, Enter   Tourner de 90 degres
S, 2, Enter    Doubler la taille

Mode Edition (Edit Mode) — Tab pour y entrer
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1           Mode vertex (sommets)
2           Mode edge (aretes)
3           Mode face
E           Extrude (etendre la geometrie)
Ctrl+R      Loop cut (ajouter une boucle d'aretes)
I           Inset face (creer une face interieure)
F           Fill (creer une face entre les vertices selectionnes)
M           Merge vertices (fusionner)
Alt+clic    Selectionner un edge loop
K           Knife tool (couper la geometrie)
```

---

## Modelisation polygonale

### Vertices, edges, faces

```
Vertex (sommet)         Edge (arete)           Face
Un point dans           Segment entre          Surface delimitee
l'espace 3D             2 vertices             par 3+ edges

    ●                   ●─────────●            ┌─────────┐
                                               │         │
                                               │  FACE   │
                                               │         │
                                               └─────────┘
```

### Quads vs Tris vs Ngons

```
Triangle (tri)         Quad                   Ngon (5+ cotes)
3 vertices             4 vertices             5+ vertices

    ╱╲                 ┌────┐                 ╱──────╲
   ╱  ╲                │    │                ╱        ╲
  ╱    ╲               │    │               │          │
 ╱──────╲              └────┘                ╲        ╱
                                              ╲──────╱

✓ Le GPU ne                                  ✗ A EVITER
  comprend que ca         ✓ Meilleur pour      Les ngons causent
✓ Toujours valide           la subdivision     des artefacts de
  (pas d'ambiguite)       ✓ Edge loops          shading et ne se
✗ Moins lisible             propres              subdivisent pas
  pour le modeliseur      ✓ Deformations         correctement
                            propres
```

**Regle d'or** : modeliser en quads, le moteur triangulera automatiquement a l'export.

### Workflow de modelisation

```
1. Bloquer les volumes        2. Affiner la topologie
   (formes primitives)           (loop cuts, extrusions)

   ┌───┐                        ┌─┬─┬─┐
   │   │ ← Cube                 │ │ │ │ ← Loop cuts
   │   │                        ├─┼─┼─┤
   └───┘                        │ │ │ │
                                └─┴─┴─┘

3. Ajouter les details        4. Subdivision Surface
   (biseaux, insets)              (lissage)

   ┌─╱──╲─┐                     ╱────────╲
   │╱    ╲│                    ╱           ╲
   ├      ┤                   │             │
   │╲    ╱│                    ╲           ╱
   └─╲──╱─┘                     ╲────────╱
```

---

## Modifiers

### Les modifiers essentiels

Les modifiers sont des operations non-destructives — ils modifient l'apparence du mesh sans alterer la geometrie source.

```
┌──────────────────────────────────────────────────────────────┐
│  Subdivision Surface                                         │
│  Lisse le mesh en subdivisant chaque face                   │
│                                                              │
│  Avant:    ┌───┐     Apres (level 1):   ╱─────╲            │
│            │   │                        ╱       ╲           │
│            └───┘                       ╲         ╱          │
│                                         ╲─────╱            │
│                                                              │
│  Level 1 : x4 faces   Level 2 : x16 faces                  │
│  Attention : chaque level quadruple le nombre de triangles ! │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Mirror                                                      │
│  Duplique le mesh en miroir sur un ou plusieurs axes        │
│                                                              │
│  Modeliser la moitie  →  Mirror active  →  Modele complet  │
│       ╱│                    ╱││╲                             │
│      ╱ │                   ╱ ││ ╲                            │
│     ╱  │                  ╱  ││  ╲                           │
│                                                              │
│  ✓ Parfait pour les objets/personnages symetriques          │
│  ✓ Activer "Clipping" pour eviter les vertices qui passent  │
│    de l'autre cote de l'axe                                  │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Boolean                                                     │
│  Operations booleennes entre 2 meshes                       │
│                                                              │
│  Union        Intersection     Difference                    │
│  ○○ → ◎       ○○ → ◍           ○○ → ◐                      │
│                                                              │
│  ✗ Cree souvent une mauvaise topologie (ngons, tris)        │
│  → Nettoyer la topologie apres l'application                │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Array                                                       │
│  Duplique le mesh N fois avec un offset                     │
│                                                              │
│  ▬  ▬  ▬  ▬  ▬     (Array count=5, offset X)               │
│                                                              │
│  ✓ Clotures, escaliers, chaines, colonnades                 │
│  Peut combiner avec un modifier Curve pour suivre une courbe│
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Solidify                                                    │
│  Ajoute de l'epaisseur a un mesh plat                       │
│                                                              │
│  Avant: ──────     Apres: ═══════                           │
│  (plan)            (plan avec epaisseur)                     │
│                                                              │
│  ✓ Murs, coques, feuilles, armures                          │
└──────────────────────────────────────────────────────────────┘
```

---

## UV unwrapping

### Qu'est-ce que les UVs ?

Les UV sont la correspondance 2D ↔ 3D : elles indiquent comment "deplier" la surface 3D du mesh sur une image 2D (la texture).

```
Mesh 3D                           UV Map (espace 2D)
   ╱──────╲                       ┌────────────────┐
  ╱   face  ╲                     │   ╱╲           │
 ╱    1      ╲                    │  ╱  ╲  face 1  │
│              │                  │ ╱    ╲         │
│    face 2    │     ──UV──►      │╱──────╲        │
│              │    unwrap        │                 │
 ╲            ╱                   │ ┌──────┐       │
  ╲──────────╱                    │ │face 2│       │
                                  │ └──────┘       │
                                  └────────────────┘
                                  0,0           1,1
```

### Seams (coutures)

Les seams sont les aretes ou le mesh est "coupe" pour le deplier. Comme les coutures d'un patron de couture.

```
Ou placer les seams ?
━━━━━━━━━━━━━━━━━━━━

✓ Le long des aretes cachees (sous le bras, derriere la tete)
✓ Le long des changements de materiau
✓ Le long des aretes dures (coins d'un cube)
✗ PAS au milieu d'une grande surface visible (distorsion)
```

### Workflow UV dans Blender

```
1. Selectionner les edges pour les seams
   Edit Mode → Mode Edge (2) → Selectionner → Mark Seam (Ctrl+E)

2. Selectionner tout (A)

3. Unwrap
   UV → Unwrap (U → Unwrap)
   ou UV → Smart UV Project (automatique, bon pour le debug)

4. Ouvrir l'UV Editor (en bas, ou Window → New Main Window)
   Verifier que les iles UV ne se chevauchent pas
   Ajuster manuellement si necessaire

5. Viser un remplissage maximal de l'espace 0-1
   Pack Islands (Ctrl+P dans l'UV Editor)
```

### Types d'unwrap

| Methode | Quand l'utiliser | Qualite |
|---------|-----------------|---------|
| **Unwrap** | Mesh avec seams bien places | Excellente |
| **Smart UV Project** | Prototypage rapide, debug | Moyenne |
| **Cube Projection** | Objets architecturaux, murs | Bonne pour les cubes |
| **Cylinder Projection** | Cylindres, bouteilles | Bonne pour les cylindres |
| **Sphere Projection** | Spheres, planetes | Bonne pour les spheres |
| **Project from View** | Decals, projections planes | Specifique |

---

## Materiaux Blender : Principled BSDF

### Le shader Principled BSDF = PBR metallic-roughness

Le Principled BSDF de Blender est l'exact equivalent du modele PBR metallic-roughness utilise par Three.js (`MeshStandardMaterial`/`MeshPhysicalMaterial`).

```
Blender Principled BSDF           Three.js MeshStandardMaterial
━━━━━━━━━━━━━━━━━━━━━━           ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Base Color                  →     color / map
Metallic                    →     metalness / metalnessMap
Roughness                   →     roughness / roughnessMap
Normal Map (node)           →     normalMap
Emission Color + Strength   →     emissive / emissiveMap / emissiveIntensity
Alpha                       →     opacity / alphaMap
IOR                         →     ior (MeshPhysicalMaterial)
Transmission                →     transmission (MeshPhysicalMaterial)
Clearcoat Weight            →     clearcoat (MeshPhysicalMaterial)
Sheen Weight                →     sheen (MeshPhysicalMaterial)
```

### Node editor basics

```
Blender utilise un systeme de nodes pour les materiaux.
Pour du PBR web, il suffit de :

┌────────────┐     ┌─────────────────────────┐     ┌────────────┐
│ Image      │────►│ Principled BSDF          │────►│ Material   │
│ Texture    │     │                           │     │ Output     │
│ (albedo)   │     │ Base Color: ← texture     │     │            │
└────────────┘     │ Metallic: 0.0 / 1.0       │     │ Surface ←──│
                   │ Roughness: 0.0 - 1.0      │     └────────────┘
┌────────────┐     │ Normal: ← normal map      │
│ Normal Map │────►│                           │
│ node       │     └─────────────────────────┘
│            │
└────────────┘

Attention : connecter la texture de couleur a "Base Color"
et la normal map via un node "Normal Map" (pas directement).
```

### Parametrage pour l'export glTF

```
Ce qui est exporte en glTF :
✓ Base Color (texture ou valeur)
✓ Metallic + Roughness (souvent packees dans une texture :
  - Canal bleu = metallic
  - Canal vert = roughness)
✓ Normal Map
✓ Emissive Color + Emissive Strength
✓ Occlusion (AO, dans le canal rouge de la texture metallic-roughness)
✓ Alpha (pour la transparence)

Ce qui N'est PAS exporte en glTF :
✗ Shader nodes personnalises
✗ Displacement node
✗ Subsurface scattering
✗ Procedural textures Blender (noise, voronoi, etc.)
  → Il faut les BAKER en images avant l'export
```

---

## Baking

### Pourquoi baker ?

Le baking "cuit" un calcul complexe en une simple texture. C'est le pont entre la complexite de Blender et la performance du web.

```
High-poly (1M triangles)     →  Baker  →     Low-poly (5K triangles)
avec tous les details                         + Normal Map
sculptes                                      + AO Map

Le low-poly + normal map a l'air presque identique
au high-poly, mais tourne a 60 FPS dans le navigateur.
```

### Types de bake

| Type | Ce qu'il capture | Texture resultante |
|------|-----------------|-------------------|
| **Normal** | Details de surface du high-poly | Normal map (tangent space, bleu-violet) |
| **Ambient Occlusion** | Ombres dans les creux/contacts | AO map (niveaux de gris) |
| **Diffuse** | Couleur de base sans eclairage | Albedo bake |
| **Emit** | Zones emissives | Emissive map |
| **Combined** | Rendu complet (diffuse + specular + AO) | Lightmap |

### Workflow de baking dans Blender

```
Normal Map : High-poly → Low-poly
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Avoir les deux meshes superposes :
   - High-poly : le modele detaille (sculpture, etc.)
   - Low-poly : le modele optimise avec des UVs propres

2. Selectionner le low-poly
   Creer une Image Texture node (vide, ex: 2048x2048) dans le materiau
   S'assurer que ce node est SELECTIONNE (active, bord blanc)

3. Selectionner le high-poly PUIS le low-poly (Shift+clic)
   (le low-poly doit etre l'objet actif = dernier selectionne)

4. Render Properties → Bake
   - Bake Type : Normal
   - ✓ Selected to Active (high → low)
   - Ray Distance : 0.05 (ajuster si necessaire)
   - Space : Tangent

5. Cliquer "Bake"

6. Sauvegarder la texture (Image → Save As)
   Format : PNG 16-bit pour la precision

AO Map :
━━━━━━━

Meme workflow mais :
- Bake Type : Ambient Occlusion
- Pas besoin de high-poly (juste le low-poly)
- Samples : 128+ pour un resultat propre
```

---

## Rigging basics

### Armature et bones

```
Un rig (squelette) est une hierarchie de bones qui deforme le mesh.

                    ● Spine
                   ╱│╲
                  ╱ │ ╲
        L_Arm ● ╱  │  ╲ ● R_Arm
              │    │    │
        L_Hand●  ● Hips ● R_Hand
                ╱    ╲
               ╱      ╲
        L_Leg ●        ● R_Leg
              │          │
        L_Foot●          ● R_Foot

Chaque bone controle une zone du mesh.
La zone d'influence est definie par le weight painting.
```

### Creer une armature dans Blender

```
1. Shift+A → Armature → Single Bone
   → Un os apparait (la racine du squelette)

2. Edit Mode (Tab) :
   - Selectionner le bout de l'os → E (Extrude)
     → Creer un nouvel os enfant
   - Repeter pour construire la hierarchie
   - Nommer chaque os clairement (Spine, L_Arm, R_Leg, etc.)

3. Poser le mesh sur l'armature :
   - Selectionner le MESH, puis Shift+selectionner l'ARMATURE
   - Ctrl+P → Armature Deform → With Automatic Weights
   → Blender calcule automatiquement quels vertices sont influences
     par quels bones (weight painting automatique)

4. Verifier en Pose Mode :
   - Selectionner l'armature → Ctrl+Tab (Pose Mode)
   - Tourner un os et verifier que le mesh se deforme correctement
```

### Weight painting

```
Le weight painting definit l'influence de chaque bone sur chaque vertex.

Poids = 0.0 (bleu)           Poids = 1.0 (rouge)
Le vertex ne suit PAS         Le vertex suit COMPLETEMENT
ce bone                       ce bone

Bleu ──── Vert ──── Jaune ──── Rouge
0.0       0.33      0.66       1.0

Problemes courants :
- Des vertices a poids 0 partout → ils restent fixes (bug visible)
- Transition trop brusque → deformation moche aux articulations
- Solution : peindre manuellement avec le Weight Paint mode
  (selectionner le mesh, passer en Weight Paint mode)
```

### IK constraints (Inverse Kinematics)

```
Sans IK (Forward Kinematics)        Avec IK (Inverse Kinematics)
On tourne chaque bone                On deplace le pied,
un par un pour poser                 tout le reste suit

Hips → Spine → Shoulder → Arm       On pose la Main →
(fastidieux, peu intuitif)           L'Arm, Shoulder, Spine s'ajustent

Usage : bras qui attrapent, pieds qui touchent le sol
```

---

## Animation dans Blender

### Keyframes

```
Timeline
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Frame:  0    10    20    30    40    50    60
        ●─────────●─────────────────●
     Idle      Walk start          Walk end

● = Keyframe (pose sauvegardee a un moment precis)
  Entre les keyframes, Blender INTERPOLE automatiquement
```

### Workflow d'animation

```
1. Passer en Pose Mode (Ctrl+Tab sur l'armature)

2. Frame 0 : placer la pose initiale
   - Poser les bones
   - I → Location & Rotation (ou LocRotScale)
   → Un keyframe est cree pour TOUS les bones selectionnes

3. Avancer dans la timeline (fleche droite ou cliquer)
   Frame 30 : placer la pose suivante
   - Deplacer/tourner les bones
   - I → Location & Rotation

4. Blender interpole entre les keyframes

5. Visualiser : Espace (play/pause)
```

### Outils d'animation avances

| Outil | Role | Quand l'utiliser |
|-------|------|-----------------|
| **Timeline** | Vue lineaire des keyframes | Navigation basique |
| **Dope Sheet** | Grille keyframes × bones | Voir/deplacer tous les keyframes |
| **Graph Editor** | Courbes d'interpolation (F-curves) | Ajuster le timing (ease in/out) |
| **NLA Editor** | Empiler des clips d'animation | Combiner idle + walk + attack en sequence |

```
Graph Editor — F-curves

Valeur
  │        ╱──── Ease out
  │       ╱
  │      ╱
  │    ╱─── Lineaire
  │   ╱
  │  ╱
  │╱──── Ease in
  │
  └─────────────────── Temps

Les F-curves controlent comment Blender interpole entre les keyframes.
- Lineaire : vitesse constante (robot)
- Bezier (ease in/out) : acceleration/deceleration naturelle
- Constant : saut brusque (pas d'interpolation)
```

---

## Export glTF

### Parametres d'export

```
File → Export → glTF 2.0 (.glb/.gltf)

Format :
  ● glTF Binary (.glb)    ← RECOMMANDE pour le web
    Un seul fichier, tout inclus (mesh + textures + animations)

  ○ glTF Separate (.gltf + .bin + textures)
    Plusieurs fichiers, utile pour l'inspection/debug

  ○ glTF Embedded (.gltf)
    JSON avec textures en base64 (gros fichier)

Include :
  ✓ Selected Objects     (n'exporter que la selection)
  ✓ Custom Properties    (metadata utiles)

Transform :
  ✓ +Y Up               (Three.js / WebGL convention)

Geometry :
  ✓ Apply Modifiers      (appliquer Subdivision, Mirror, etc.)
  ✓ UVs
  ✓ Normals
  ✓ Vertex Colors        (si utilises)
  ✓ Tangents             (necessaires pour les normal maps)

Mesh :
  ✓ Draco Compression    (reduit la taille ~60-80%)
    Compression Level: 6

Animation :
  ✓ Animations
  ✓ Shape Keys (morph targets)
  ✓ Skinning             (armature)
  Sampling Rate: 1       (un keyframe par frame)
  ✓ Optimize Animation   (supprimer les keyframes redondants)
  ✓ Force keeping channels for bones
```

### Erreurs courantes a l'export

| Probleme | Cause | Solution |
|----------|-------|----------|
| Textures manquantes | Fichiers non packes | File → External Data → Pack All Into .blend |
| Mesh invisible | Normales inversees | Edit Mode → Mesh → Normals → Recalculate Outside |
| Animation cassee | Bones non exportes | Verifier que l'armature est selectionnee |
| Fichier trop gros | Textures non compressees | Reduire la resolution, activer Draco |
| Materiaux noirs | Nodes non-standard | Utiliser uniquement Principled BSDF |
| Scale incorrecte | Unite Blender ≠ metre | Appliquer le scale : Ctrl+A → Scale |

---

## Pipeline asset : Blender → glTF → Three.js

```
Blender                    glTF                      Three.js
━━━━━━━                    ━━━━                      ━━━━━━━━

Mesh                   →   mesh.primitives[]     →   THREE.Mesh
Armature               →   skin + joints[]       →   THREE.SkinnedMesh
Keyframes              →   animation.channels[]  →   THREE.AnimationClip
Principled BSDF        →   material.pbrMetallic  →   MeshStandardMaterial
Camera                 →   camera                →   THREE.PerspectiveCamera
PointLight             →   KHR_lights_punctual   →   THREE.PointLight
```

```typescript
// Charger et utiliser un glTF dans Three.js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('/draco/');

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

const gltf = await gltfLoader.loadAsync('/models/character.glb');

// Le modele
const model = gltf.scene;
scene.add(model);

// Les animations
const mixer = new THREE.AnimationMixer(model);
gltf.animations.forEach((clip) => {
  console.log(`Animation: ${clip.name}, duration: ${clip.duration}s`);
});

// Jouer l'animation "Walk"
const walkClip = gltf.animations.find(c => c.name === 'Walk');
if (walkClip) {
  const action = mixer.clipAction(walkClip);
  action.play();
}

// Dans le game loop :
mixer.update(deltaTime);
```

---

## Optimisation des modeles

### Polycount budget

| Cible | Budget par objet | Budget scene total |
|-------|:----------------:|:------------------:|
| **Desktop (bon GPU)** | 10K-100K tris | 500K-2M tris |
| **Desktop (moyen)** | 5K-30K tris | 200K-500K tris |
| **Mobile** | 1K-10K tris | 50K-150K tris |
| **VR** | 5K-30K tris | 200K-500K tris (x2 yeux) |

### LOD creation dans Blender

```
1. Dupliquer le modele (Shift+D)
2. Renommer : Character_LOD0, Character_LOD1, Character_LOD2

3. Sur LOD1 :
   Modifier → Decimate
   - Type : Collapse
   - Ratio : 0.3 (30% du modele original)
   - Appliquer le modifier

4. Sur LOD2 :
   Modifier → Decimate → Ratio : 0.1 (10%)

5. Exporter les 3 LODs dans le meme glTF
   ou en fichiers separes

Resultat :
  LOD0 : 10,000 tris (proche)
  LOD1 :  3,000 tris (moyen)
  LOD2 :  1,000 tris (loin)
```

### Optimisations avant export

```
Checklist d'optimisation :
━━━━━━━━━━━━━━━━━━━━━━━━

□ Supprimer les doubles vertices (Edit Mode → M → By Distance)
□ Recalculer les normales (Mesh → Normals → Recalculate Outside)
□ Supprimer les faces internes non visibles
□ Appliquer les transforms (Ctrl+A → All Transforms)
□ Verifier qu'il n'y a pas de ngons (Select → All by Trait → Faces by Sides > 4)
□ Reduire la resolution des textures (2048 → 1024 si acceptable)
□ Merger les materiaux quand c'est possible (1 materiau = 1 draw call)
□ Activer la compression Draco a l'export
□ Verifier la taille du fichier final (.glb < 5MB ideal pour le web)
```

---

## Texture preparation : sets PBR

### Les textures d'un set PBR complet

```
┌────────────┬──────────────────┬───────────────────┬──────────────┐
│  Albedo    │  Normal Map      │  Metal-Roughness  │  AO          │
│  (Base     │  (Tangent Space) │  (pack channels)  │  (Ambient    │
│   Color)   │                  │                    │   Occlusion) │
│            │                  │                    │              │
│  sRGB      │  Linear          │  Linear            │  Linear      │
│  .jpg/.png │  .png (16-bit)   │  .jpg/.png         │  .jpg/.png   │
├────────────┼──────────────────┼───────────────────┼──────────────┤
│  Emissive  │  Height          │                    │              │
│  (zones    │  (displacement   │                    │              │
│   lumineuses│  optionnel)     │                    │              │
│  sRGB      │  Linear          │                    │              │
│  .jpg/.png │  .png            │                    │              │
└────────────┴──────────────────┴───────────────────┴──────────────┘

Convention glTF pour le packing :
- occlusionTexture : canal R de la texture ORM
- metallicRoughnessTexture : canaux B (metallic) et G (roughness)
  → On peut packer AO + Roughness + Metallic dans une seule texture RGB
     R = AO, G = Roughness, B = Metallic

Resolutions recommandees :
- Hero objects (personnage principal) : 2048x2048 ou 4096x4096
- Props (objets secondaires) : 1024x1024
- Background (decor lointain) : 512x512
- Mobile : diviser par 2
```

### Ou trouver des textures et modeles gratuits

| Source | Type | Licence | URL |
|--------|------|---------|-----|
| **Poly Haven** | HDRI + Textures + Modeles | CC0 (domaine public) | polyhaven.com |
| **ambientCG** | Textures PBR | CC0 | ambientcg.com |
| **Sketchfab** | Modeles 3D | Varies (CC-BY, CC0) | sketchfab.com |
| **Mixamo** | Personnages + Animations | Gratuit (Adobe) | mixamo.com |
| **Quaternius** | Modeles low-poly | CC0 | quaternius.com |
| **Kenney** | Assets jeu (low-poly) | CC0 | kenney.nl |

---

## Format glTF en detail

### Structure du fichier

```json
{
  "asset": {
    "version": "2.0",
    "generator": "Blender 4.0"
  },

  "scenes": [
    {
      "name": "Scene",
      "nodes": [0, 1, 2]
    }
  ],

  "nodes": [
    {
      "name": "Character",
      "mesh": 0,
      "skin": 0,
      "translation": [0, 0, 0],
      "rotation": [0, 0, 0, 1],
      "scale": [1, 1, 1],
      "children": [1]
    },
    {
      "name": "Armature",
      "children": [2, 3, 4]
    }
  ],

  "meshes": [
    {
      "name": "Body",
      "primitives": [
        {
          "attributes": {
            "POSITION": 0,
            "NORMAL": 1,
            "TEXCOORD_0": 2,
            "JOINTS_0": 3,
            "WEIGHTS_0": 4
          },
          "indices": 5,
          "material": 0
        }
      ]
    }
  ],

  "materials": [
    {
      "name": "Skin",
      "pbrMetallicRoughness": {
        "baseColorTexture": { "index": 0 },
        "metallicFactor": 0.0,
        "roughnessFactor": 0.7,
        "metallicRoughnessTexture": { "index": 1 }
      },
      "normalTexture": { "index": 2 },
      "occlusionTexture": { "index": 3 },
      "emissiveFactor": [0, 0, 0]
    }
  ],

  "accessors": [
    {
      "bufferView": 0,
      "componentType": 5126,
      "count": 5000,
      "type": "VEC3",
      "max": [1.0, 2.0, 0.5],
      "min": [-1.0, 0.0, -0.5]
    }
  ],

  "bufferViews": [
    {
      "buffer": 0,
      "byteOffset": 0,
      "byteLength": 60000,
      "target": 34962
    }
  ],

  "buffers": [
    {
      "uri": "character.bin",
      "byteLength": 240000
    }
  ],

  "images": [
    {
      "uri": "textures/albedo.png",
      "mimeType": "image/png"
    }
  ],

  "animations": [
    {
      "name": "Walk",
      "channels": [
        {
          "sampler": 0,
          "target": {
            "node": 2,
            "path": "rotation"
          }
        }
      ],
      "samplers": [
        {
          "input": 10,
          "interpolation": "LINEAR",
          "output": 11
        }
      ]
    }
  ]
}
```

### Comprendre les accessors et bufferViews

```
Le systeme accessor/bufferView/buffer est la colonne vertebrale du glTF.
C'est le meme concept que les buffers WebGL/WebGPU :

Buffer (fichier binaire .bin)
┌──────────────────────────────────────────────────────────────┐
│ 00 00 80 3F 00 00 00 40 CD CC 4C 3E ... (octets bruts)     │
└──────────────────────────────────────────────────────────────┘
        ▲                                       ▲
        │  byteOffset=0                         │  byteOffset=60000
        │  byteLength=60000                     │  byteLength=24000
┌───────┴────────────┐              ┌───────────┴──────────┐
│   BufferView 0     │              │   BufferView 1       │
│   (positions)      │              │   (normales)         │
└───────┬────────────┘              └───────────┬──────────┘
        │                                       │
        ▼                                       ▼
┌───────────────────┐               ┌───────────────────┐
│   Accessor 0      │               │   Accessor 1      │
│   type: VEC3      │               │   type: VEC3      │
│   count: 5000     │               │   count: 5000     │
│   componentType:  │               │   componentType:  │
│     FLOAT (5126)  │               │     FLOAT (5126)  │
└───────────────────┘               └───────────────────┘

Accessor = "comment lire les donnees" (type, count, component)
BufferView = "ou dans le buffer" (offset, length)
Buffer = "le fichier binaire" (les octets bruts)
```

### Extensions glTF courantes

| Extension | Role | Support Three.js |
|-----------|------|:-:|
| **KHR_draco_mesh_compression** | Compression geometrie Draco | Oui (DRACOLoader) |
| **KHR_mesh_quantization** | Quantification des attributs | Oui |
| **KHR_materials_unlit** | Materiau sans eclairage | Oui |
| **KHR_lights_punctual** | Point, spot, directional lights | Oui |
| **KHR_texture_transform** | Offset/scale/rotation des UVs | Oui |
| **EXT_meshopt_compression** | Compression Meshopt | Oui (MeshoptDecoder) |
| **KHR_materials_transmission** | Transparence (verre, eau) | Oui |
| **KHR_materials_clearcoat** | Couche vernis | Oui |

---

## Outils alternatifs

| Outil | Specialite | Prix | Pour qui |
|-------|-----------|------|----------|
| **Blender** | Modelisation, animation, rendu | Gratuit (GPL) | Tout le monde |
| **Substance 3D Painter** | Texturing PBR | Payant (Adobe) | Texture artists |
| **ZBrush** | Sculpting haute resolution | Payant | Character artists |
| **Maya** | Animation, rigging avance | Payant (Autodesk) | Studios AAA |
| **3ds Max** | Arch-viz, jeux (Windows) | Payant (Autodesk) | Studios Windows |
| **Houdini** | Effets proceduraux | Payant (Apprentice gratuit) | FX artists |
| **MagicaVoxel** | Modelisation voxel | Gratuit | Prototypage, jeux retro |

---

## Pratique

### Exercice MOD.1 — Exporter un modele de Blender vers Three.js

1. Ouvrir Blender, creer un objet simple (une maison avec un toit)
2. Ajouter un materiau Principled BSDF avec une couleur de base
3. Exporter en .glb avec compression Draco
4. Charger le modele dans Three.js avec GLTFLoader + DRACOLoader
5. Verifier que le materiau est correctement applique

```typescript
// TODO: Configurer le DRACOLoader
// TODO: Charger le fichier .glb
// TODO: Ajouter le modele a la scene
// TODO: Configurer une lumiere pour voir le materiau
```

<details>
<summary>Solution</summary>

```typescript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

// Camera
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
camera.position.set(3, 3, 5);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Lumieres
scene.add(new THREE.HemisphereLight(0x87ceeb, 0x362907, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(5, 8, 3);
scene.add(sun);

// Sol
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({ color: 0x55aa55 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// Charger le modele glTF
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

async function loadModel(): Promise<void> {
  try {
    const gltf = await gltfLoader.loadAsync('/models/house.glb');

    const model = gltf.scene;

    // Configurer les ombres
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    scene.add(model);
    console.log('Modele charge avec succes');

    // Afficher les infos du modele
    let triangleCount = 0;
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const geo = child.geometry;
        const index = geo.index;
        triangleCount += index
          ? index.count / 3
          : geo.attributes.position.count / 3;
      }
    });
    console.log(`Triangles: ${triangleCount}`);

    // Lister les animations disponibles
    if (gltf.animations.length > 0) {
      console.log('Animations:');
      gltf.animations.forEach((clip) => {
        console.log(`  - ${clip.name} (${clip.duration.toFixed(2)}s)`);
      });
    }
  } catch (error) {
    console.error('Erreur de chargement:', error);

    // Fallback : creer une maison procedurale
    const houseGroup = new THREE.Group();

    // Murs
    const walls = new THREE.Mesh(
      new THREE.BoxGeometry(2, 1.5, 2),
      new THREE.MeshStandardMaterial({ color: 0xddbb88 })
    );
    walls.position.y = 0.75;
    houseGroup.add(walls);

    // Toit
    const roofGeo = new THREE.ConeGeometry(1.8, 1, 4);
    roofGeo.rotateY(Math.PI / 4);
    const roof = new THREE.Mesh(
      roofGeo,
      new THREE.MeshStandardMaterial({ color: 0x884422 })
    );
    roof.position.y = 2.0;
    houseGroup.add(roof);

    scene.add(houseGroup);
    console.log('Modele de fallback cree (pas de fichier .glb trouve)');
  }
}

loadModel();

// Animation loop
function animate(): void {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();

// Resize
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
```
</details>

---

## Resume

| Concept | Description | Outil |
|---------|-------------|-------|
| **Modelisation polygonale** | Vertices, edges, faces (quads preferred) | Blender Edit Mode |
| **Modifiers** | Operations non-destructives (Subdivision, Mirror, Boolean) | Blender Modifier panel |
| **UV unwrapping** | Deplier le mesh 3D en 2D pour appliquer des textures | Blender UV Editor |
| **Principled BSDF** | Shader PBR = metallic-roughness (equivalent MeshStandardMaterial) | Blender Shader Editor |
| **Baking** | "Cuire" les details high-poly en textures (normal, AO) | Blender Render → Bake |
| **Rigging** | Squelette de bones pour deformer le mesh | Blender Armature |
| **Weight painting** | Definir l'influence de chaque bone sur chaque vertex | Blender Weight Paint mode |
| **Animation** | Keyframes, interpolation, F-curves, NLA | Blender Timeline + Graph Editor |
| **Export glTF** | Format standard 3D web (.glb = binaire unique) | Blender File → Export |
| **Draco** | Compression geometrie (~60-80% reduction) | Extension glTF |
| **LOD** | Plusieurs niveaux de detail pour la performance | Decimate modifier |

| Etape pipeline | Input | Output | Responsable |
|---------------|-------|--------|-------------|
| **Modelisation** | Concept art / specifications | Mesh .blend | Modeliseur |
| **UV** | Mesh | Mesh avec UVs | Modeliseur |
| **Texturing** | Mesh + UVs | Textures PBR (albedo, normal, rough, metal, AO) | Texture artist |
| **Rigging** | Mesh | Mesh + Armature | Rigger |
| **Animation** | Mesh + Armature | Clips d'animation | Animateur |
| **Export** | .blend complet | .glb optimise | Dev 3D / Pipeline TD |
| **Integration** | .glb | Scene Three.js | Dev 3D web |

---

## Navigation

| Precedent | Suivant |
|:---------:|:-------:|
| [21 - Projet final](./21-projet-final.md) | — |

**Ressources associees :**
- [Lab 22 — Modelisation 3D](../labs/lab-22-modelisation-3d/)
- [Quiz 22 — Modelisation 3D](../quizzes/quiz-22-modelisation-3d.html)
