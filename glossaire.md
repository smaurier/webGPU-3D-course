# Glossaire 3D Web

Glossaire de reference pour le cours 3D Web (WebGPU, WebGL, Three.js). Les termes sont classes par ordre alphabetique.

---

**Adapter** — En WebGPU, objet representant un GPU physique ou virtuel disponible sur la machine. On demande un adapter via `navigator.gpu.requestAdapter()` avant de creer un device. Il expose les fonctionnalites et limites du materiel.

**Ambient (eclairage)** — Composante de lumiere constante appliquee uniformement a toute la scene, simulant la lumiere indirecte globale. Dans le modele de Phong, c'est le terme `Ia * Ka`. En PBR, on prefere l'IBL pour un resultat plus realiste.

**AnimationMixer** — Classe Three.js qui gere la lecture d'animations (squelettiques, morph targets, proprietes). On lui passe un objet racine et on enchaine les `clipAction()` pour jouer, fondre ou boucler des clips.

**Attribute** — Variable d'entree par sommet dans un vertex shader. Chaque invocation du shader recoit un jeu d'attributs (position, normale, UV, couleur, etc.) lu depuis un vertex buffer. En GLSL on les declare avec `in`, en WGSL avec `@location`.

**Baking** — Technique de pre-calcul qui grave (bake) des informations complexes (eclairage, ambient occlusion, normales haute resolution) dans des textures. Permet d'obtenir un rendu riche a moindre cout en temps reel.

**Bind group** — En WebGPU, ensemble de ressources (buffers, textures, samplers) liees ensemble et rendues accessibles a un shader via un `GPUBindGroup`. Les bind groups sont decrits par un `GPUBindGroupLayout` et attaches au pipeline avant le draw call.

**Binding** — Association entre une ressource GPU (buffer, texture, sampler) et un point d'acces dans un shader. En WebGPU, chaque binding a un index (`@binding(n)`) et appartient a un groupe (`@group(m)`). En WebGL, on utilise les uniform locations.

**Blinn-Phong** — Variante du modele de Phong qui remplace le vecteur de reflexion par le half-vector (bisectrice entre la direction de la lumiere et la direction de vue). Plus rapide a calculer et souvent plus realiste pour les hautes brillances.

**Bloom** — Effet de post-processing qui simule le halo lumineux autour des zones tres lumineuses. On extrait les pixels au-dessus d'un seuil, on les floute (souvent en plusieurs passes gaussiennes), puis on les re-compose sur l'image finale.

**BRDF** — Bidirectional Reflectance Distribution Function. Fonction mathematique decrivant comment la lumiere est reflechie par une surface en fonction des directions incidente et sortante. En PBR, la BRDF la plus courante combine un terme diffus (Lambert) et un terme speculaire (Cook-Torrance).

**Camera** — En Three.js, objet definissant le point de vue de la scene. `PerspectiveCamera` simule la vision humaine (frustum pyramidal), `OrthographicCamera` produit une projection sans perspective. La camera fournit les matrices view et projection.

**Command buffer** — En WebGPU, conteneur enregistrant une sequence de commandes GPU (render passes, compute passes, copies). On le cree via un `GPUCommandEncoder`, puis on le soumet a la queue pour execution. Cela permet de preparer les commandes a l'avance et de les envoyer en lot.

**Compute shader** — Shader a usage general (GPGPU) execute en parallele sur le GPU, sans lien direct avec le pipeline de rendu graphique. Utilise pour la physique, le traitement d'images, le tri, les simulations de particules, etc. Disponible en WebGPU (pas en WebGL de base).

**Context** — En WebGL, objet `WebGLRenderingContext` (ou `WebGL2RenderingContext`) obtenu depuis un `<canvas>`. Il expose toute l'API : creation de buffers, compilation de shaders, configuration du pipeline, commandes de dessin.

**Cook-Torrance** — Modele de BRDF speculaire physiquement base, combinant trois termes : une distribution des micro-facettes (D, souvent GGX), un terme de geometrie/masquage (G) et un terme de Fresnel (F). Formule : `DGF / (4 * dot(N,L) * dot(N,V))`.

**Coordonnees homogenes** — Extension des coordonnees cartesiennes ajoutant une quatrieme composante `w`. Un point 3D `(x, y, z)` devient `(x, y, z, 1)` et un vecteur direction `(x, y, z, 0)`. Cela permet de representer translations, rotations et projections sous forme de matrices 4x4.

**CSM (Cascaded Shadow Maps)** — Technique de shadow mapping qui decoupe le frustum de la camera en plusieurs tranches (cascades), chacune avec sa propre shadow map. Les cascades proches ont une meilleure resolution, ce qui reduit les artefacts de pixelisation.

**Cubemap** — Texture composee de six faces carrees representant l'environnement dans toutes les directions. Utilisee pour les reflexions, l'eclairage base image (IBL), les skyboxes. En WebGL on utilise `TEXTURE_CUBE_MAP`, en Three.js `CubeTexture`.

**Deferred rendering** — Strategie de rendu qui separe la geometrie de l'eclairage. Une premiere passe ecrit les attributs de surface (position, normale, albedo, roughness) dans un G-buffer. Une seconde passe calcule l'eclairage par pixel a partir du G-buffer. Performant avec de nombreuses lumieres.

**Depth buffer** — Buffer (aussi appele z-buffer) stockant la profondeur de chaque pixel. Lors de la rasterisation, un fragment n'est ecrit que si sa profondeur est inferieure a la valeur deja presente, ce qui resout la visibilite sans tri prealable des objets.

**Device** — En WebGPU, objet logique representant une connexion a un GPU. On le cree via `adapter.requestDevice()`. Il permet de creer des buffers, textures, shaders, pipelines et de soumettre des commandes via sa queue.

**Diffuse (eclairage)** — Composante de lumiere qui depend de l'angle entre la normale de la surface et la direction de la lumiere (loi de Lambert : `max(dot(N, L), 0)`). Donne aux objets leur couleur de base eclairee, independante du point de vue.

**Double buffering** — Technique utilisant deux framebuffers : pendant que l'un est affiche a l'ecran (front buffer), le GPU dessine dans l'autre (back buffer). A la fin du frame, on les echange (swap) pour eviter le tearing.

**Draco** — Bibliotheque de compression de geometrie 3D developpee par Google. Reduit considerablement la taille des maillages (positions, normales, UV, indices). Souvent utilisee avec glTF pour le web. Three.js fournit un `DRACOLoader`.

**Draw call** — Commande envoyee au GPU pour dessiner un ensemble de primitives (triangles, lignes, points). Chaque draw call a un cout CPU fixe ; minimiser leur nombre est une optimisation cle. L'instancing et le batching permettent de regrouper plusieurs objets en un seul appel.

**EBO (Element Buffer Object)** — Buffer WebGL contenant les indices des sommets, permettant de reutiliser les vertex pour dessiner des triangles sans dupliquer les donnees. Aussi appele Index Buffer. Lie a `GL_ELEMENT_ARRAY_BUFFER`.

**EffectComposer** — Classe Three.js (addon post-processing) qui chaine des passes de rendu (RenderPass, BloomPass, SSAOPass, ShaderPass, etc.). Chaque passe lit un framebuffer et ecrit dans le suivant, permettant d'empiler des effets.

**Espace tangent** — Repere local a chaque sommet d'un maillage, defini par la tangente (T), la bitangente (B) et la normale (N). Utilise pour le normal mapping : la normal map est stockee dans cet espace, puis transformee en espace monde pour l'eclairage.

**FBO (Framebuffer Object)** — Objet WebGL permettant de dessiner dans des textures ou renderbuffers au lieu de l'ecran. Indispensable pour les shadow maps, le post-processing, les reflexions, le deferred rendering.

**FBX** — Format de fichier 3D proprietaire (Autodesk) supportant maillages, animations squelettiques, morph targets, materiaux. Courant dans l'industrie du jeu, mais moins adapte au web que glTF. Three.js fournit un `FBXLoader`.

**Forward rendering** — Strategie de rendu classique ou chaque objet est dessine et eclaire en une seule passe. Simple a implementer mais le cout croit avec `nombre_objets * nombre_lumieres`. Adapte aux scenes avec peu de lumieres.

**Fragment** — Candidat potentiel pour devenir un pixel a l'ecran. Produit par la rasterisation d'une primitive, un fragment porte des donnees interpolees (couleur, UV, profondeur). Le fragment shader decide de sa couleur finale (ou le rejette via `discard`).

**Fragment shader** — Programme GPU execute pour chaque fragment produit par la rasterisation. Il calcule la couleur finale du pixel en appliquant textures, eclairage, effets. En GLSL, la sortie est `gl_FragColor` (WebGL1) ou une variable `out`. En WGSL, c'est la valeur de retour annotee `@location(0)`.

**Framebuffer** — Zone memoire GPU contenant les attachments de rendu (couleur, profondeur, stencil). Le framebuffer par defaut correspond a l'ecran ; des framebuffers personnalises (FBO) permettent le rendu off-screen.

**Fresnel** — Effet physique ou la reflectivite d'une surface augmente aux angles rasants. En PBR, on utilise l'approximation de Schlick : `F0 + (1 - F0) * (1 - dot(H, V))^5`. Donne l'aspect brillant sur les bords des objets.

**Frustum culling** — Optimisation consistant a ne pas envoyer au GPU les objets situes en dehors du volume de vision (frustum) de la camera. On teste la bounding box ou bounding sphere de chaque objet contre les six plans du frustum.

**Geometry** — En Three.js, objet contenant les donnees geometriques d'un maillage : positions des sommets, normales, UV, indices. `BufferGeometry` stocke ces donnees dans des `BufferAttribute` directement compatibles avec les buffers GPU.

**GGX** — Fonction de distribution des micro-facettes (NDF) largement utilisee en PBR. Elle modelise la proportion de micro-facettes alignees avec le half-vector. Produit des highlights speculaires avec une longue trainee realiste.

**GLSL** — OpenGL Shading Language. Langage de programmation de shaders utilise par WebGL. Syntaxe proche du C, avec des types integres pour vecteurs (`vec2`, `vec3`, `vec4`), matrices (`mat4`) et fonctions mathematiques (`dot`, `normalize`, `mix`).

**glTF** — Format de fichier 3D ouvert (Khronos), souvent appele "JPEG du 3D". Supporte maillages, materiaux PBR, animations, squelettes, morph targets. Deux variantes : `.gltf` (JSON + binaire separe) et `.glb` (tout-en-un). Format de reference pour le web 3D.

**HDR (High Dynamic Range)** — Technique de rendu ou les valeurs de couleur ne sont pas bornees a [0, 1]. Permet de representer des luminosites tres elevees (soleil, lampes). Necessite un tone mapping final pour ramener les valeurs dans la plage affichable.

**IBL (Image-Based Lighting)** — Eclairage base sur une image d'environnement (souvent un cubemap HDR). On preconvolue l'environnement pour obtenir une irradiance map (diffus) et une prefiltered environment map (speculaire). Donne un eclairage global realiste sans lumieres explicites.

**InstancedMesh** — Classe Three.js permettant de dessiner un grand nombre de copies d'un meme maillage en un seul draw call. Chaque instance peut avoir sa propre matrice de transformation et sa propre couleur. Ideal pour les forets, particules, foules.

**Instancing** — Technique GPU permettant de dessiner plusieurs copies d'un meme maillage en un seul draw call, chaque instance recevant des donnees propres (position, couleur) via des attributs ou des buffers. Reduit drastiquement le nombre de draw calls.

**Interpolation lineaire (lerp)** — Fonction `lerp(a, b, t) = a + t * (b - a)` qui melange deux valeurs proportionnellement au parametre `t` entre 0 et 1. Fondamentale en 3D pour lisser les mouvements, les couleurs, les transitions.

**Irradiance** — Quantite de lumiere incidente totale en un point de surface, integree sur tout l'hemisphere. En IBL, l'irradiance map est un cubemap floute representant la contribution diffuse de l'environnement pour chaque direction de normale.

**LOD (Level of Detail)** — Technique d'optimisation qui affiche des versions simplifiees (moins de polygones) d'un objet quand il est eloigne de la camera. En Three.js, la classe `LOD` gere automatiquement le basculement entre les niveaux de detail.

**Material** — En Three.js, objet definissant l'apparence d'une surface : couleur, textures, proprietes PBR (metalness, roughness), transparence, etc. Types courants : `MeshStandardMaterial` (PBR), `MeshBasicMaterial` (non eclaire), `ShaderMaterial` (custom).

**Matrice** — Tableau rectangulaire de nombres. En 3D, les matrices 4x4 encodent les transformations (translation, rotation, echelle, projection). On les multiplie pour combiner les transformations. L'ordre de multiplication compte (non commutatif).

**Mesh** — En Three.js, objet combinant une `Geometry` et un `Material` pour former un element visible dans la scene. Herite de `Object3D` et peut etre positionne, tourne, mis a l'echelle dans le graphe de scene.

**Metalness** — En PBR, parametre entre 0 (dielectrique) et 1 (metal) qui controle le comportement de reflexion. Les metaux teintent leurs reflexions speculaires avec leur couleur de base (albedo) et n'ont pas de diffuse.

**Mipmap** — Serie de versions pre-reduites d'une texture (chaque niveau divise la resolution par deux). Le GPU choisit automatiquement le niveau adapte a la distance de l'objet, ce qui reduit l'aliasing et ameliore les performances.

**Morph target** — Technique d'animation deformant un maillage en interpolant entre plusieurs poses predefinies (blendshapes). Chaque target stocke des deltas de position (et parfois de normales). Utilise pour les expressions faciales, le lip-sync.

**MSAA (Multisample Anti-Aliasing)** — Technique d'anti-aliasing hardware qui echantillonne chaque pixel en plusieurs points (4x, 8x) pour adoucir les bords des polygones. Le fragment shader n'est execute qu'une fois par pixel, mais le test de couverture est fait par echantillon.

**Normal mapping** — Technique utilisant une texture (normal map) pour perturber les normales de surface pixel par pixel, donnant l'illusion de details geometriques sans polygones supplementaires. Les normales sont stockees en espace tangent (R, G, B → X, Y, Z).

**Occlusion culling** — Optimisation qui evite de dessiner les objets masques par d'autres objets. Plus complexe que le frustum culling, elle necessite un test de visibilite (hardware occlusion queries, Hi-Z buffer, ou approches CPU).

**PBR (Physically Based Rendering)** — Approche de rendu ou les materiaux et l'eclairage respectent les principes physiques : conservation de l'energie, BRDF realistique, eclairage lineaire (HDR). Parametres principaux : albedo, metalness, roughness. Standard dans les moteurs modernes.

**PCF (Percentage Closer Filtering)** — Technique adoucissant les ombres en echantillonnant plusieurs texels voisins dans la shadow map et en moyennant les resultats du test de profondeur. Produit des ombres aux bords progressifs au lieu d'un aliasing dur.

**Phong** — Modele d'eclairage empirique decomposant la lumiere en trois composantes : ambiante, diffuse et speculaire. La composante speculaire depend du vecteur de reflexion et de la direction de vue, avec un exposant controlant la brillance.

**Pipeline de rendu** — Sequence d'etapes transformant les donnees 3D en image 2D. Etapes principales : vertex shader → assemblage de primitives → rasterisation → fragment shader → tests (depth, stencil) → blending → framebuffer. En WebGPU, on cree un `GPURenderPipeline` explicite.

**Pipeline layout** — En WebGPU, objet `GPUPipelineLayout` decrivant l'agencement des bind group layouts utilises par un pipeline. Il definit quels groupes de ressources le shader attend et dans quel ordre.

**Polygone** — Surface plane delimitee par trois sommets ou plus. En rendu temps reel, tout est decompose en triangles car le GPU ne rasterise nativement que des triangles. Un quad (4 sommets) est compose de deux triangles.

**Produit scalaire (dot product)** — Operation entre deux vecteurs produisant un scalaire : `dot(A, B) = |A| * |B| * cos(theta)`. Fondamental en 3D pour calculer angles, projections, eclairage (Lambert), tests de visibilite.

**Produit vectoriel (cross product)** — Operation entre deux vecteurs 3D produisant un vecteur perpendiculaire aux deux : `cross(A, B)`. Sa norme egale l'aire du parallelogramme forme par A et B. Utilise pour calculer les normales de surface et construire des reperes.

**Quad** — Polygone a quatre sommets. Bien que le GPU ne rasterise que des triangles, les quads sont courants en modelisation et sont automatiquement triangules (deux triangles). En plein ecran (fullscreen quad), on l'utilise pour le post-processing.

**Quaternion** — Nombre hyperplexe a quatre composantes (x, y, z, w) representant une rotation 3D sans gimbal lock. Plus compact qu'une matrice, interpolable en douceur (slerp). En Three.js, `Quaternion` est utilise en interne par `Object3D.rotation`.

**Queue** — En WebGPU, file de soumission des command buffers au GPU. Obtenue via `device.queue`. On y soumet des command buffers (`queue.submit()`) et on peut aussi ecrire directement dans des buffers (`queue.writeBuffer()`).

**Rasterisation** — Etape du pipeline de rendu convertissant les primitives (triangles projetes en 2D) en fragments. Pour chaque pixel couvert par un triangle, la rasterisation interpole les attributs des sommets (position, UV, normale) et produit un fragment.

**Ray marching** — Technique de rendu volumetrique ou l'on avance pas a pas le long d'un rayon, testant a chaque etape si l'on a atteint une surface. Souvent utilisee avec les SDF pour creer des formes procedurales, des nuages, du brouillard.

**Raycaster** — Classe Three.js qui lance un rayon dans la scene et retourne les objets intersectes, tries par distance. Utilise pour la selection d'objets (picking) au clic de souris, la detection de collisions, les tests de visibilite.

**Render bundle** — En WebGPU, ensemble preenregistre de commandes de dessin (`GPURenderBundle`) qui peut etre rejoue dans un render pass sans re-encoder les commandes. Utile pour optimiser les scenes statiques ou les elements qui ne changent pas entre les frames.

**Render pass** — En WebGPU, bloc delimitant une phase de rendu dans un command buffer. On y specifie les attachments (couleur, profondeur), les operations de chargement/stockage, puis on enregistre les draw calls. Equivalent conceptuel d'un FBO bind en WebGL.

**Renderer** — En Three.js, `WebGLRenderer` (ou le futur `WebGPURenderer`) orchestre le rendu de la scene. Il gere le canvas, le context GPU, l'etat OpenGL/WebGPU, le shadow mapping et appelle `render(scene, camera)` a chaque frame.

**Rigging** — Processus de creation d'un squelette (armature) de bones pour un maillage 3D. Chaque bone influence un sous-ensemble de sommets. Le rigging permet ensuite d'animer le modele par rotation des bones (animation squelettique).

**Roughness** — En PBR, parametre entre 0 (parfaitement lisse, miroir) et 1 (completement rugueux, mat) controlant la largeur du lobe speculaire. Il determine la distribution des micro-facettes dans le modele GGX.

**Sampler** — Objet GPU definissant comment une texture est echantillonnee : filtrage (nearest, linear, anisotropique), mode de repetition (clamp, repeat, mirror), comparaison pour shadow maps. En WebGPU, c'est un objet `GPUSampler` distinct de la texture.

**Scene** — En Three.js, noeud racine du graphe de scene. Tous les objets visibles (meshes, lumieres, cameras) sont ajoutes a la scene via `scene.add()`. Elle peut avoir un arriere-plan (couleur, texture, cubemap) et un brouillard.

**SDF (Signed Distance Function)** — Fonction mathematique retournant la distance signee d'un point a une surface (negatif a l'interieur, positif a l'exterieur). Permet de modeliser des formes procedurales, de les combiner (union, intersection, soustraction) et de les rendre par ray marching.

**Seam** — Ligne de coupure sur un maillage 3D le long de laquelle les coordonnees UV sont discontinues. Les seams sont necessaires pour deployer (unwrap) une surface 3D sur un plan 2D (la texture). Ils peuvent creer des artefacts visibles si mal places.

**Shader** — Programme execute sur le GPU. Les vertex shaders traitent chaque sommet, les fragment shaders chaque fragment (pixel candidat), les compute shaders executent du calcul general. Ecrits en GLSL (WebGL) ou WGSL (WebGPU).

**ShaderMaterial** — Classe Three.js permettant d'ecrire ses propres vertex et fragment shaders en GLSL, tout en beneficiant des uniforms automatiques de Three.js (matrices, lumieres). Pour un controle total, on utilise `RawShaderMaterial`.

**Shadow mapping** — Technique de generation d'ombres en deux passes. Premiere passe : on rend la scene du point de vue de la lumiere dans une depth texture (shadow map). Seconde passe : pour chaque pixel, on compare sa profondeur vue de la lumiere avec la shadow map pour determiner s'il est dans l'ombre.

**Skinning** — Processus de deformation d'un maillage en fonction des transformations des bones du squelette. Chaque sommet a des poids (weights) indiquant l'influence de chaque bone. Le vertex shader calcule la position finale en combinant les matrices de bones ponderees.

**Slerp** — Spherical Linear Interpolation. Interpolation entre deux quaternions le long du plus court arc sur la sphere unite. Produit une rotation a vitesse angulaire constante, contrairement a une interpolation lineaire naive qui deforme le mouvement.

**Specular (eclairage)** — Composante de lumiere representant les reflets brillants sur une surface. Depend de la direction de vue, de la direction de la lumiere et de la normale. En Phong : `pow(max(dot(R, V), 0), shininess)`. En PBR, calculee via la BRDF Cook-Torrance.

**SSAO (Screen-Space Ambient Occlusion)** — Technique de post-processing qui simule l'assombrissement dans les creux et les coins en echantillonnant la profondeur des pixels voisins dans l'espace ecran. Donne de la profondeur visuelle sans calcul global d'illumination.

**Staging buffer** — En WebGPU, buffer intermediaire en memoire partagee (CPU + GPU) utilise pour transferer des donnees entre le CPU et le GPU. On ecrit dans le staging buffer cote CPU, puis on copie vers un buffer GPU (ou inversement pour lire les resultats).

**Stencil buffer** — Buffer supplementaire (souvent 8 bits par pixel) stockant une valeur entiere par pixel. Permet des operations conditionnelles : masques, contours, portails, reflexions planes, effets de decoupe. Configure via le stencil test dans le pipeline.

**Storage buffer** — En WebGPU, buffer accessible en lecture et ecriture depuis un compute shader (ou en lecture seule depuis un vertex/fragment shader). Permet de stocker de grandes quantites de donnees structurees (particules, instances, resultats de simulation).

**Swap chain** — Mecanisme gerant l'alternance des framebuffers (double ou triple buffering) pour l'affichage. En WebGPU, on configure la swap chain via `context.configure()` et on obtient la texture courante via `context.getCurrentTexture()`.

**Texture unit** — En WebGL, emplacement logique (`GL_TEXTURE0`, `GL_TEXTURE1`, etc.) ou l'on lie une texture pour qu'un shader y accede. Le nombre de texture units est limite par le materiel (generalement 16 ou 32). En WebGPU, ce concept est remplace par les bind groups.

**Texture2D** — Texture bidimensionnelle classique (image) envoyee au GPU pour etre plaquee sur un maillage. En WebGL, on la cree avec `gl.texImage2D()`. Peut contenir de la couleur (albedo), des normales, de la roughness, etc.

**Timestamp query** — En WebGPU, mecanisme de mesure de performance GPU. On insere des `GPUQuerySet` de type timestamp dans les render/compute passes pour mesurer le temps d'execution de commandes specifiques sur le GPU.

**Tone mapping** — Transformation appliquee aux valeurs HDR pour les ramener dans la plage affichable [0, 1]. Algorithmes courants : Reinhard, ACES filmic, AgX. Preserve les details dans les hautes et basses luminosites. En Three.js : `renderer.toneMapping`.

**Transformation affine** — Transformation geometrique preservant les droites et le parallelisme : combinaison de translation, rotation, echelle et cisaillement. Representee par une matrice 4x4 en coordonnees homogenes. Composable par multiplication matricielle.

**Triangle strip** — Mode de dessin ou chaque nouveau sommet forme un triangle avec les deux sommets precedents. Reduit la quantite de donnees envoyees : `n` triangles necessitent `n + 2` sommets au lieu de `3n`. Moins utilise aujourd'hui grace aux index buffers.

**Uniform** — Variable globale passee du CPU au shader, constante pour tous les sommets/fragments d'un draw call. Exemples : matrices model/view/projection, couleur de lumiere, temps. En GLSL : `uniform mat4 uProjection;`. En WGSL : `@group(0) @binding(0) var<uniform>`.

**UV** — Coordonnees de texture assignees a chaque sommet d'un maillage, definissant comment une image 2D se plaque sur la surface 3D. U correspond a l'axe horizontal et V a l'axe vertical de la texture. Les valeurs vont generalement de 0 a 1.

**VAO (Vertex Array Object)** — Objet WebGL encapsulant la configuration des attributs de vertex (quels buffers, quels formats, quels offsets). Permet de basculer rapidement entre differentes configurations de geometrie en liant un seul VAO.

**Varying** — Variable interpolee passee du vertex shader au fragment shader. Le rasteriseur interpole les valeurs entre les sommets du triangle (interpolation barycentrique). En GLSL WebGL1 on utilise `varying`, en GLSL ES 3.0+ et WGSL on utilise `out`/`in` ou des structures.

**VBO (Vertex Buffer Object)** — Buffer GPU contenant les donnees de sommets (positions, normales, UV, couleurs). En WebGL, on le cree avec `gl.createBuffer()` et on le remplit avec `gl.bufferData()`. Lie a `GL_ARRAY_BUFFER`.

**Vecteur** — Entite mathematique ayant une direction et une magnitude. En 3D, represente par trois composantes (x, y, z). Utilise pour les positions, directions, normales, vitesses, forces. Operations essentielles : addition, produit scalaire, produit vectoriel, normalisation.

**Vertex** — Sommet d'un maillage 3D. Chaque vertex porte des attributs : position (obligatoire), normale, coordonnees UV, couleur, tangente, poids de skinning, etc. Le vertex shader transforme chaque vertex de l'espace local a l'espace clip.

**Vertex shader** — Programme GPU execute une fois par sommet. Son role principal est de transformer les positions de l'espace local (model space) a l'espace clip (clip space) via les matrices MVP. Peut aussi calculer l'eclairage par sommet, deformer la geometrie, passer des varyings au fragment shader.

**WGSL** — WebGPU Shading Language. Langage de shaders de WebGPU, fortement type avec une syntaxe moderne (inspiree de Rust). Supporte les types vecteurs/matrices, les structures, les annotations de binding (`@group`, `@binding`, `@location`).

**Workgroup** — En compute shaders (WebGPU), unite d'execution parallele composee de plusieurs invocations partageant une memoire locale. La taille du workgroup (ex. `@workgroup_size(64)`) est definie dans le shader. Les invocations d'un meme workgroup peuvent se synchroniser via des barrieres.
