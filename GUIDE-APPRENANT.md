# Guide de l'apprenant -- WebGPU & 3D

> **Ce guide est ta boussole.** Il t'aide a savoir ou tu en es, par ou passer,
> et quoi faire quand tu bloques. Lis-le avant de commencer, et reviens-y regulierement.
>
> **Temps estime** : ~200-280h (5-7 mois a 10-12h/semaine)
>
> **Philosophie** : La 3D sur le web, c'est l'intersection des mathematiques,
> de l'informatique graphique, et du developpement web. C'est exigeant,
> mais c'est aussi l'un des domaines les plus gratifiants -- tu VOIS le resultat
> de ton code, litteralement. Chaque shader, chaque matrice, chaque lumiere
> devient visible a l'ecran.

---

## Avant de commencer -- Auto-diagnostic

Reponds honnetement. Ce n'est pas un examen -- c'est un GPS.

### Prerequis techniques

Coche ce que tu sais faire SANS chercher sur Google :
- [ ] Tu es a l'aise avec les vecteurs (addition, produit scalaire, produit vectoriel)
- [ ] Tu sais ce qu'est une matrice 4x4 et a quoi elle sert en 3D
- [ ] Tu connais les bases de la trigonometrie (sin, cos, tan)
- [ ] Tu as deja touche au Canvas HTML (2D ou 3D)
- [ ] Tu es a l'aise avec TypeScript
- [ ] Tu comprends les concepts de base de la programmation (boucles, fonctions, objets)

**6/6** -> Tu es pret. Tu peux aller vite sur les prerequis maths et attaquer le module 04.
**4-5/6** -> Commence par le prerequis maths et les modules 01-03.
**< 4/6** -> Pas de panique. Le cours commence par les maths necessaires. Mais prevois du temps supplementaire.

### 3D et GPU -- ou en es-tu deja ?

- [ ] Tu as deja ecrit un shader (GLSL, WGSL, HLSL)
- [ ] Tu sais ce qu'est un pipeline de rendu (vertex -> rasterization -> fragment)
- [ ] Tu as deja utilise Three.js ou Babylon.js
- [ ] Tu sais ce qu'est WebGL ou WebGPU
- [ ] Tu as deja fait du ray tracing (meme basique)

**5/5** -> Tu as de l'experience. Commence a la Phase 3 (module 09) apres avoir verifie le checkpoint Phase 2.
**2-4/5** -> Tu as des bases. Le cours va les structurer et les approfondir.
**0-1/5** -> C'est le parcours classique. La 3D est accessible a tous avec de la motivation.

### Le test decisif

Mentalement, comment transformerais-tu un cube 3D pour l'afficher a l'ecran ?

- Si tu penses a : matrice modele (position/rotation/scale) -> matrice vue (camera) -> matrice projection (perspective) -> NDC -> ecran -> tu connais le pipeline. Verifie la Phase 2.
- Si tu sais qu'il faut "des maths" mais tu n'es pas sur lesquelles -> le prerequis maths et les modules 01-03 sont faits pour toi.
- Si tu ne sais pas du tout -> parfait, c'est exactement ce qu'on va apprendre. Et c'est passionnant.

---

## Les 5 phases de ta progression

### Phase 1 -- Maths et fondations (prerequis + modules 00-03) ~35-45h

> **Objectif** : Maitriser les mathematiques de la 3D : vecteurs, matrices,
> transformations, quaternions, cameras et projections.
>
> **Analogie** : C'est comme apprendre le solfege avant de jouer de la musique. Indispensable et moins ennuyeux qu'on le croit.

| Module | Sujet | Temps | Note |
|---|---|---|---|
| prereq | Maths pour la 3D | 4h | Rappels : vecteurs, matrices, trigonometrie |
| 00 | Prerequis et introduction | 2h | Vue d'ensemble du cours, setup |
| 01 | Algebre lineaire | 4h | **Cours cle** -- vecteurs, matrices, transformations |
| 02 | Transformations et quaternions | 4h | **Cours cle** -- rotation, scale, translation, gimbal lock |
| 03 | Cameras et projections | 4h | Perspective, orthographique, matrices de vue |

**Exercices Phase 1** : Implemente les operations de base (multiplication de matrices,
produit vectoriel) a la main en TypeScript. Ca ancre la comprehension.

**Checkpoint Phase 1** :
- [ ] Tu sais multiplier deux matrices 4x4 a la main (ou au moins en code)
- [ ] Tu sais ce qu'est le gimbal lock et pourquoi on utilise des quaternions
- [ ] Tu sais construire une matrice de projection perspective
- [ ] Tu sais construire une matrice "lookAt" pour positionner une camera
- [ ] Tu sais transformer un point 3D en coordonnees ecran (NDC)

> **Test** : Pourquoi utiliser des quaternions au lieu des angles d'Euler ?
> Si tu reponds "pour eviter le gimbal lock et permettre l'interpolation fluide (slerp)", c'est bon.

---

### Phase 2 -- WebGL (modules 04-08) ~35-45h

> **Objectif** : Comprendre le pipeline de rendu, les shaders, les buffers,
> les textures, et construire une scene WebGL complete.
>
> **Analogie** : Tu apprends a peindre pixel par pixel. C'est bas niveau mais tu comprends TOUT.

| Module | Sujet | Temps | Note |
|---|---|---|---|
| 04 | Pipeline de rendu | 3h | **Cours cle** -- vertex -> rasterization -> fragment |
| 05 | Lumiere, materiaux et PBR | 4h | **Cours cle** -- Phong, Cook-Torrance, metallic/roughness |
| 06 | WebGL fondamentaux | 4h | Context, draw calls, state machine |
| 07 | Shaders, buffers et textures | 5h | **Cours cle** -- GLSL, vertex/fragment shaders, uniforms |
| 08 | Scene WebGL complete | 5h | Assembler une scene avec camera, lumiere, objets |

**Conseil** : Les shaders (module 07) sont le coeur de la programmation graphique.
C'est un nouveau paradigme : tu programmes le GPU, pas le CPU.
Chaque pixel est calcule en parallele. Prends ton temps.

**Checkpoint Phase 2** :
- [ ] Tu sais decrire le pipeline de rendu etape par etape
- [ ] Tu sais ecrire un vertex shader et un fragment shader en GLSL
- [ ] Tu sais ce qu'est un buffer (VBO, EBO) et comment envoyer des donnees au GPU
- [ ] Tu sais appliquer une texture et comprendre les UV coordinates
- [ ] Tu as construit une scene WebGL avec camera, lumiere et objets

> **Test** : Quelle est la difference entre un vertex shader et un fragment shader ?
> Si tu reponds "le vertex shader transforme les positions, le fragment shader calcule la couleur de chaque pixel", c'est bon.

---

### Phase 3 -- WebGPU (modules 09-12) ~25-35h

> **Objectif** : Passer a l'API graphique moderne. WebGPU, WGSL,
> render pipelines, bind groups, et compute shaders.
>
> **Analogie** : Tu passes de la peinture a l'huile au numerique. Memes principes, outils modernes.

| Module | Sujet | Temps | Note |
|---|---|---|---|
| 09 | WebGPU architecture et WGSL | 4h | **Cours cle** -- le successeur de WebGL |
| 10 | Render pipeline et bind groups | 4h | Configuration du pipeline, resources, uniforms |
| 11 | Compute shaders et GPGPU | 4h | **Cours cle** -- utiliser le GPU pour le calcul general |
| 12 | WebGPU avance | 4h | Multi-pass rendering, instancing, optimisations |

**Attention** : WebGPU est plus explicite que WebGL. Tu controles tout (creation des buffers,
layout des pipelines, synchronisation). C'est plus de code mais moins de "magie" cachee.

**Checkpoint Phase 3** :
- [ ] Tu sais configurer un render pipeline WebGPU complet
- [ ] Tu sais ecrire des shaders en WGSL (le langage de shading de WebGPU)
- [ ] Tu sais utiliser les bind groups pour passer des donnees aux shaders
- [ ] Tu sais ecrire un compute shader pour du calcul parallele sur GPU
- [ ] Tu comprends les differences cles entre WebGL et WebGPU

> **Test** : Pourquoi WebGPU est meilleur que WebGL ?
> Si tu cites : API explicite, compute shaders, meilleur mapping vers Vulkan/Metal/DX12,
> et multi-threading, c'est bon.

---

### Phase 4 -- Three.js (modules 13-17) ~30-40h

> **Objectif** : Utiliser Three.js pour creer des experiences 3D de haut niveau.
> Materiaux, lumieres, modeles 3D, animations, post-processing, et performance.
>
> **Analogie** : Tu as appris la mecanique du moteur. Maintenant tu conduis une voiture de course.

| Module | Sujet | Temps | Note |
|---|---|---|---|
| 13 | Three.js fondamentaux | 4h | Scene, camera, renderer, geometries |
| 14 | Materiaux et lumieres Three.js | 4h | MeshStandardMaterial, environment maps, PBR |
| 15 | Modeles et animations | 4h | **Cours cle** -- glTF, skeletal animation, AnimationMixer |
| 16 | Post-processing et effets | 3h | EffectComposer, bloom, SSAO, color grading |
| 17 | Performance et optimisation | 4h | **Cours cle** -- draw calls, LOD, instancing, culling |

**Conseil** : Three.js abstrait WebGL/WebGPU. C'est grace aux phases 2-3 que tu comprends
ce qui se passe sous le capot. Quand Three.js ne fait pas ce que tu veux, tu sais pourquoi.

**Checkpoint Phase 4** :
- [ ] Tu sais creer une scene Three.js complete avec lumieres, materiaux PBR et shadows
- [ ] Tu sais charger et animer un modele 3D (glTF)
- [ ] Tu sais appliquer des effets de post-processing (bloom, SSAO)
- [ ] Tu sais optimiser une scene pour 60fps (draw calls, instancing, LOD)
- [ ] Tu sais ecrire un shader custom dans Three.js (ShaderMaterial)

> **Test** : Ta scene Three.js tourne a 15fps. Par ou commences-tu ?
> Si tu ouvres le profiler, comptes les draw calls, cherches les objets non-instancies,
> et verifies les textures surdimensionnees, c'est bon.

---

### Phase 5 -- Expert (modules 18-29) ~60-80h

> **Objectif** : Techniques avancees : shadow mapping, shaders creatifs,
> physique, ray tracing, global illumination, WebXR, audio 3D, et deux projets finaux.
>
> **Analogie** : Tu es artiste et ingenieur. Tu crees des mondes.

| Module | Sujet | Temps | Note |
|---|---|---|---|
| 18 | Shadow mapping | 3h | PCF, cascaded shadows, variance shadow maps |
| 19 | Shaders creatifs | 4h | **Cours cle** -- noise, SDF, procedural patterns |
| 20 | Physique et interactions | 4h | Rapier, Cannon.js, collisions, rigid bodies |
| 21 | Projet final | 8h+ | Scene 3D interactive complete |
| 22 | Modelisation 3D | 3h | Blender basics, workflow de production |
| 23 | Ray tracing | 4h | Path tracing, BVH, rendu realiste |
| 24 | Global illumination | 3h | Screen-space techniques, light probes |
| 25 | Rendu volumetrique | 3h | Nuages, brouillard, raymarching |
| 26 | WebXR et animation procedurale | 4h | VR/AR, IK, animation procedurale |
| 27 | Audio 3D spatial | 3h | Web Audio API, spatialisation, HRTF |
| 28 | Virtual textures et streaming | 3h | Megatextures, LOD de textures, streaming |
| 29 | Projet final expert | 10h+ | Experience 3D complete et optimisee |

**Checkpoint Phase 5** :
- [ ] Tu sais implementer des shadow maps avec PCF
- [ ] Tu sais ecrire des shaders creatifs avec du noise et des SDFs
- [ ] Tu sais integrer un moteur physique (Rapier ou Cannon.js)
- [ ] Tu sais les bases du ray tracing et tu peux implementer un path tracer simple
- [ ] Tu as termine les deux projets finaux avec des scenes interactives et performantes

> **Test** : On te demande de creer un configurateur produit 3D interactif pour le web.
> Si tu proposes Three.js + glTF + PBR materials + environment map + post-processing,
> avec une architecture performante et accessible, c'est bon.

---

## Quand tu bloques

La 3D a ses propres frustrations. Voici comment debloquer :

### "Les maths me font peur"
1. Commence par la visualisation. Dessine les vecteurs sur papier
2. Utilise [3Blue1Brown -- Essence of Linear Algebra](https://www.youtube.com/playlist?list=PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab) -- la meilleure serie de videos
3. Tu n'as pas besoin d'etre un mathematicien. Tu as besoin de comprendre les operations de base
4. Les quaternions sont obscurs. Retiens juste : "rotation sans gimbal lock" et utilise les fonctions de la lib

### "Mon ecran est noir (rien ne s'affiche)"
1. Probleme numero 1 en 3D. Verifie dans l'ordre :
2. La camera regarde-t-elle dans la bonne direction ? (`lookAt` bien configure ?)
3. L'objet est-il a l'interieur du frustum (entre near et far) ?
4. Y a-t-il une lumiere dans la scene ? (un objet sans lumiere est noir)
5. Le shader compile-t-il sans erreur ? (verifie la console)

### "Mon shader ne compile pas"
1. Les erreurs de shader sont cryptiques. Lis le numero de ligne en premier
2. GLSL/WGSL sont types strictement -- pas de conversion implicite (`float` vs `int`)
3. Verifie les types : `vec3` vs `vec4`, `float` vs `int`
4. Utilise [Shadertoy](https://www.shadertoy.com/) pour prototyper et debugger tes fragment shaders

### "Les performances sont mauvaises"
1. Compte les draw calls -- c'est souvent le coupable numero 1
2. Utilise l'instancing pour les objets repetes (arbres, particules)
3. Verifie les textures : trop grandes = trop de memoire GPU
4. Active le frustum culling pour ne pas rendre ce qui est hors camera
5. Profile avec Chrome DevTools > Performance ou Spector.js

### "WebGPU est trop verbeux par rapport a WebGL"
1. C'est voulu. WebGPU est explicite -- tu controles tout
2. Cree des fonctions utilitaires pour encapsuler les patterns repetitifs
3. Une fois le boilerplate en place, tu vas plus vite et tu comprends ce qui se passe
4. Pense a WebGPU comme a Vulkan pour le web -- plus de controle, plus de performance

### "Je n'arrive pas a faire l'exercice"
1. Commence par le cas le plus simple (un triangle, un cube, une couleur unie)
2. Ajoute de la complexite progressivement (texture, lumiere, animation)
3. Utilise Shadertoy ou le playground Three.js pour prototyper rapidement

---

## Auto-evaluation par phase

Apres chaque phase, pose-toi ces questions. Si tu ne sais pas repondre,
reviens en arriere -- c'est un signe, pas un echec.

**Apres Phase 1** : "Que fait une matrice de projection perspective ?"
-> Si tu reponds "elle transforme les coordonnees 3D en coordonnees normalisees (NDC) en simulant la perspective (les objets lointains sont plus petits)", c'est bon.

**Apres Phase 2** : "Comment fonctionne le modele d'eclairage PBR ?"
-> Si tu parles de metallic/roughness, de conservation de l'energie, et de la BRDF de Cook-Torrance, c'est bon.

**Apres Phase 3** : "Qu'est-ce qu'un compute shader et pourquoi c'est important ?"
-> Si tu reponds "c'est un programme GPU pour le calcul general (pas juste le rendu), utile pour les particules, la simulation, le post-processing", c'est bon.

**Apres Phase 4** : "Comment optimiser une scene Three.js qui rame ?"
-> Si tu analyses draw calls, instancing, LOD, textures, et frustum culling, c'est bon.

---

## Rythme recommande

| Rythme | Par semaine | Duree totale |
|---|---|---|
| **Decouverte** (a cote du boulot) | 4-6h | 8-10 mois |
| **Regulier** (motivation) | 10-12h | 5-7 mois |
| **Intensif** (objectif pro) | 15-20h | 3-5 mois |

### Conseils concrets

- **1 module = 2-3 sessions.** Les modules de shaders (07, 19) peuvent prendre une semaine.
- **Visualise.** La 3D est visuelle par nature. Dessine, utilise Shadertoy, manipule les scenes.
- **Les maths (Phase 1) meritent 2 semaines.** Ne les survole pas, elles reviennent partout.
- **Les shaders (07, 19) meritent une semaine chacun.** C'est un nouveau paradigme de programmation.
- **Les projets finaux (21, 29) valent 2-3 semaines chacun.** C'est la que tout prend forme.

### Quand faire une pause

- Si les matrices te donnent le vertige -> regarde les videos de 3Blue1Brown, dessine, reviens
- Si l'ecran reste noir depuis 1h -> prends du recul, verifie la camera et les coordonnees
- Si les shaders te frustrent -> utilise Shadertoy pour experimenter de facon ludique

---

## Ressources complementaires

### Quand tu veux approfondir
- [3Blue1Brown -- Linear Algebra](https://www.youtube.com/playlist?list=PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab) -- la meilleure visualisation des maths
- [LearnOpenGL](https://learnopengl.com/) -- excellent tutoriel (concepts transferables a WebGL/WebGPU)
- [Shadertoy](https://www.shadertoy.com/) -- playground pour les shaders
- [Three.js Journey](https://threejs-journey.com/) -- cours Three.js tres complet
- *Real-Time Rendering* (Akenine-Moller et al.) -- LA reference du rendu temps reel

### Quand tu cherches une reponse rapide
- Spector.js -- capturer et inspecter les draw calls WebGL
- Three.js Editor (editor.threejs.org) -- prototyper des scenes rapidement
- Chrome DevTools > Performance -- profiler les frames et identifier les bottlenecks

---

## Et apres ?

Tu as fini les 30 modules ? Tu maitrises la programmation graphique sur le web.

Voici les prochaines etapes :
1. **Cree une experience 3D et publie-la** -- portfolio, outil interactif, ou jeu
2. **Explore le game development** -- les concepts s'appliquent directement
3. **Approfondis Blender** -- la modelisation 3D complete ton profil
4. **Contribue a Three.js ou a l'ecosysteme WebGPU** -- le domaine est en pleine croissance
