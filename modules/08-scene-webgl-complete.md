---
titre: Scène WebGL complète
cours: 20-webgpu-3d
notions:
  - "matrice MVP par objet (projection * view * model)"
  - "scène multi-objets (une model matrix par objet)"
  - "normal matrix (transpose(inverse(mat3(model))))"
  - "éclairage Blinn-Phong (ambiant + diffus + spéculaire)"
  - "boucle de rendu (requestAnimationFrame + delta time)"
  - "depth test (gl.enable(DEPTH_TEST), gl.clear(DEPTH_BUFFER_BIT))"
  - "back-face culling (gl.enable(CULL_FACE))"
  - "caméra orbitale (coordonnées sphériques + lookAt)"
  - "uniforms de matrices (uniformMatrix4fv, transpose = false)"
outcomes:
  - sait assembler une scène WebGL2 avec plusieurs objets ayant chacun leur model matrix
  - sait calculer et passer une matrice MVP et une normal matrix par objet
  - sait implémenter un éclairage Blinn-Phong (ambiant + diffus + spéculaire) dans le fragment shader
  - sait écrire une boucle de rendu stable avec requestAnimationFrame et delta time
  - sait activer le depth test et le back-face culling pour un rendu 3D correct
  - sait piloter une caméra orbitale en coordonnées sphériques
prerequis:
  - "00-prerequis-et-introduction (pipeline GPU, aperçu du rendu)"
  - "01-algebre-lineaire-pour-la-3d (produit scalaire, normalisation)"
  - "02-transformations-et-quaternions (model matrix : translation/rotation/échelle)"
  - "03-cameras-et-projections (view matrix, projection perspective, clip space)"
  - "05-lumiere-materiaux-et-pbr (diffus/spéculaire, modèle d'éclairage)"
  - "06-webgl-fondamentaux (contexte, programme, VBO, uniforms, draw call)"
  - "07-shaders-buffers-textures (VAO, EBO, attributs entrelacés, uniformMatrix)"
next: 09-webgpu-architecture-et-wgsl
libs: []
tribuzen: "moteur de rendu 3D TribuZen — première scène 3D animée et éclairée : plusieurs marqueurs de sortie en volume, tournant sous une lumière, avec caméra orbitale — la brique qui transforme le triangle plat du module 06 en vraie scène"
last-reviewed: 2026-07
---

# Scène WebGL complète

> **Outcomes — tu sauras FAIRE :** assembler une scène WebGL2 multi-objets (une MVP + une normal matrix par objet), l'éclairer en Blinn-Phong, l'animer dans une boucle `requestAnimationFrame`, activer le depth test, et la survoler avec une caméra orbitale.
> **Difficulté :** :star::star::star::star:
>
> **Portée :** ce module est le **module d'intégration** de la partie WebGL. Il n'introduit presque aucune API nouvelle : il **assemble** les maths (modules 01-05) et l'API (modules 06-07) en une seule scène qui bouge et s'éclaire. C'est le premier moteur 3D réel du cours. WebGPU (module 09) reprendra les mêmes idées avec une API moderne.

## 1. Cas concret d'abord

Au module 06, TribuZen a affiché son premier pixel GPU : un triangle rouge, plat, immobile, en clip space brut. Au module 07, on a ajouté les VAO, les textures, l'éclairage Phong isolé. Mais on n'a **jamais assemblé une vraie scène** : plusieurs objets, en 3D, sous une lumière, filmés par une caméra qu'on déplace.

La feature TribuZen visée : la **mini-scène 3D des sorties**. Chaque sortie de la famille (rando, resto, ciné) est un **petit cube** posé dans un espace 3D. La scène tourne doucement, une lumière ponctuelle les éclaire (les faces exposées sont claires, les autres sombres), et l'utilisateur oriente la vue à la souris. C'est le trophée visuel du dashboard — « voici vos 12 sorties du mois en 3D ».

Voici le réflexe qui **ne marche pas** — on prend le triangle du module 06 et on met juste plusieurs objets :

```typescript
// ❌ Trois cubes qui s'affichent en bouillie, sans relief ni profondeur
for (const cube of cubes) {
  gl.drawElements(gl.TRIANGLES, cube.indexCount, gl.UNSIGNED_SHORT, 0);
}
// Résultat : les faces arrière transparaissent, les cubes se chevauchent
// n'importe comment, tout est plat et de la même couleur.
```

Il manque **quatre briques d'intégration** que ce module pose :

1. une **matrice MVP par objet** — chaque cube a sa propre position/rotation (model), vue par une caméra (view) et projetée en perspective (projection) ;
2. le **depth test** — sans lui, l'ordre de dessin décide bêtement ce qui est devant, et les faces arrière transparaissent ;
3. un **éclairage Blinn-Phong** avec la **normal matrix** — pour que le relief soit visible ;
4. une **boucle de rendu** + une **caméra orbitale** — pour que la scène vive et soit explorable.

Ce module les enchaîne jusqu'à la scène animée complète.

---

## 2. Théorie complète, concise

### 2.1 La matrice MVP : chaque objet dans le monde, vu par la caméra

Un sommet part en **espace objet** (coordonnées locales du cube, centré sur l'origine). Trois matrices l'amènent en clip space (revu maths, modules 02-03) :

```
p_clip = Projection · View · Model · p_objet
         └──────── MVP ────────┘
```

- **Model** (module 02) — place l'objet dans le monde : translation + rotation + échelle. **Une par objet.**
- **View** (module 03) — le monde vu depuis la caméra (inverse de la pose caméra, via `lookAt`). **Une par frame**, partagée.
- **Projection** (module 03) — perspective : applique le champ de vision et le ratio d'aspect. **Une**, recalculée au resize.

On peut passer les trois matrices séparément au shader, ou pré-multiplier `MVP` côté CPU. Pour l'éclairage, on a **aussi** besoin de la position monde du sommet (`Model · p`), donc on garde `model`, `view`, `projection` séparés en uniforms.

### 2.2 Passer une matrice au shader : `uniformMatrix4fv`

Une matrice 4×4 est un uniform de type `mat4`. On l'envoie avec `uniformMatrix4fv` (signature confirmée sur MDN) :

```typescript
gl.uniformMatrix4fv(location, transpose, data);
//                              └ GLboolean : TOUJOURS false en WebGL
```

`data` est un `Float32Array` de 16 valeurs en **column-major** (l'ordre attendu par GLSL). Le paramètre `transpose` **doit rester `false`** : WebGL ne sait pas transposer à la volée, on fournit donc déjà la matrice dans le bon ordre. Une `mat3` (la normal matrix) passe par `uniformMatrix3fv`.

### 2.3 Le depth test : qui est devant ?

Avec plusieurs objets en profondeur, l'ordre de dessin ne doit **pas** décider ce qu'on voit. Le **depth buffer** (Z-buffer) stocke, par pixel, la profondeur du fragment le plus proche déjà dessiné ; un nouveau fragment n'est peint que s'il est **plus proche**.

```typescript
gl.enable(gl.DEPTH_TEST);   // activer le test (une fois, au setup)
gl.depthFunc(gl.LESS);      // garde le fragment si sa profondeur < celle stockée (défaut)
```

Deux conséquences pratiques :

- il faut **effacer le depth buffer à chaque frame**, sinon la frame N garde les profondeurs de N-1 :

```typescript
gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);  // les DEUX buffers
```

- la projection perspective doit avoir un `near`/`far` raisonnable (ex. `0.1` / `100`) — un `near` trop petit gaspille la précision du depth buffer (**z-fighting** : surfaces qui clignotent).

### 2.4 Back-face culling : ne pas dessiner l'intérieur

Un cube opaque a 6 faces, mais on ne voit jamais l'intérieur. Le **back-face culling** jette les triangles tournés « dos à la caméra », déterminés par l'**ordre d'enroulement** (winding) de leurs sommets :

```typescript
gl.enable(gl.CULL_FACE);
gl.cullFace(gl.BACK);       // jeter les faces arrière (défaut)
gl.frontFace(gl.CCW);       // « avant » = sommets en sens anti-horaire (défaut)
```

Économie de ~50 % des fragments sur des objets fermés. Si un objet apparaît « à l'envers » (faces manquantes), c'est que ses indices sont enroulés dans l'autre sens.

### 2.5 La normal matrix : garder les normales perpendiculaires

L'éclairage a besoin de la **normale** de chaque surface, en espace monde. On ne peut **pas** transformer une normale avec la model matrix si celle-ci contient un scale non-uniforme : elle cesserait d'être perpendiculaire à la surface. La bonne matrice est :

```
NormalMatrix = transpose(inverse(mat3(Model)))
```

On prend la partie 3×3 de la model (pas de translation sur une normale), on l'inverse, on la transpose. Cas particulier utile : si Model ne contient que **rotation + scale uniforme**, alors `mat3(Model)` suffit (la rotation est orthogonale). On calcule la normal matrix côté CPU et on la passe en `mat3` uniform.

### 2.6 Blinn-Phong : ambiant + diffus + spéculaire

Le modèle d'éclairage (revu module 05), implémenté dans le fragment shader. Pour une lumière ponctuelle, trois termes s'additionnent :

```
ambiant    = couleur_ambiante · albedo                    (lumière minimale partout)
diffus     = max(dot(N, L), 0) · couleur_lumière · albedo (Lambert : faces face à la lumière)
spéculaire = pow(max(dot(N, H), 0), shininess) · couleur  (reflet brillant)
```

avec les vecteurs **normalisés** :

- `N` = normale de la surface (via normal matrix) ;
- `L` = direction surface → lumière ;
- `V` = direction surface → caméra ;
- `H = normalize(L + V)` = **halfway vector**, la spécificité de **Blinn**-Phong (Phong classique utilise `reflect(-L, N)` et `dot(R, V)` ; Blinn utilise `H`, moins cher et plus stable).

`shininess` (ex. 32-128) contrôle la taille du reflet : grand = petit point brillant.

### 2.7 La caméra orbitale en coordonnées sphériques

Pour explorer la scène, la caméra tourne autour d'une cible. On la décrit en **sphérique** (2 angles + un rayon), converti en position cartésienne :

```
x = cible.x + r · cos(θ) · sin(φ)
y = cible.y + r · sin(θ)
z = cible.z + r · cos(θ) · cos(φ)
```

- `φ` (azimut) : rotation horizontale, piloté par la souris en X ;
- `θ` (élévation) : rotation verticale, **clampé** dans `]-π/2, +π/2[` pour ne pas passer les pôles ;
- `r` : distance, pilotée par la molette (zoom).

La position obtenue alimente `lookAt(eye, cible, up)` qui produit la **view matrix**. À chaque mouvement souris, on met à jour les angles puis on reconstruit la view.

### 2.8 La boucle de rendu : `requestAnimationFrame` + delta time

L'animation tourne dans une boucle synchronisée à l'écran :

```typescript
let last = 0;
function frame(now: number): void {   // now en ms, fourni par le navigateur
  const dt = Math.min((now - last) / 1000, 0.1);  // delta en s, clampé
  last = now;
  update(dt);   // faire tourner les cubes proportionnellement à dt
  render();     // clear + dessiner chaque objet
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

Deux règles :

- **animer avec `dt`, pas un incrément fixe** (`angle += vitesse * dt`) — sinon la vitesse dépend du framerate (rapide en 120 Hz, lent en 30 Hz) ;
- **clamper `dt`** (`Math.min(dt, 0.1)`) — après un onglet en arrière-plan, `now - last` peut valoir plusieurs secondes et faire « sauter » l'animation.

`requestAnimationFrame` se met en pause quand l'onglet est caché (économie GPU) et se cale sur le vsync (pas de tearing).

---

## 3. Worked examples

### Exemple 1 — La passe de rendu d'une scène multi-objets (TribuZen)

Le cœur du moteur : dessiner N cubes, chacun avec sa MVP et sa normal matrix, sous une lumière, avec depth test. On suppose acquis du module 07 : chaque objet a un `vao` (positions + normales entrelacées) et un `indexCount`, et un programme Blinn-Phong compilé.

```typescript
interface SceneObject {
  vao: WebGLVertexArrayObject;
  indexCount: number;
  model: Float32Array;   // 16 valeurs, mise à jour dans update()
}

function render(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  objects: SceneObject[],
  view: Float32Array,
  projection: Float32Array,
  cameraPos: Float32Array,
  lightPos: Float32Array,
): void {
  // Effacer couleur ET profondeur — sinon la frame précédente pollue le depth test
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.useProgram(program);

  // Uniforms PARTAGÉS par tous les objets : une seule fois par frame
  const uView = gl.getUniformLocation(program, 'u_view');
  const uProj = gl.getUniformLocation(program, 'u_projection');
  const uCam = gl.getUniformLocation(program, 'u_cameraPos');
  const uLight = gl.getUniformLocation(program, 'u_lightPos');
  gl.uniformMatrix4fv(uView, false, view);           // transpose = false, toujours
  gl.uniformMatrix4fv(uProj, false, projection);
  gl.uniform3fv(uCam, cameraPos);
  gl.uniform3fv(uLight, lightPos);

  const uModel = gl.getUniformLocation(program, 'u_model');
  const uNormalMat = gl.getUniformLocation(program, 'u_normalMatrix');

  // Uniforms PROPRES à chaque objet : model + normal matrix dérivée
  for (const obj of objects) {
    gl.uniformMatrix4fv(uModel, false, obj.model);
    gl.uniformMatrix3fv(uNormalMat, false, computeNormalMatrix(obj.model));

    gl.bindVertexArray(obj.vao);
    // count = nombre d'INDICES ; offset en OCTETS (0 ici) ; type des indices
    gl.drawElements(gl.TRIANGLES, obj.indexCount, gl.UNSIGNED_SHORT, 0);
  }
  gl.bindVertexArray(null);
}
```

Points clés : les uniforms partagés (view, projection, lumière, caméra) sont posés **une fois** par frame ; seuls `model` et `normalMatrix` changent dans la boucle. Le depth test (activé au setup) trie automatiquement les cubes en profondeur.

### Exemple 2 — Le couple vertex + fragment shader Blinn-Phong

Le vertex shader transforme la position en clip space et exporte position-monde + normale-monde ; le fragment shader calcule l'éclairage. Les deux sont alignés sur les uniforms de l'exemple 1.

```glsl
// vertex — assemble la MVP et prépare l'éclairage
#version 300 es
in vec3 a_position;
in vec3 a_normal;

uniform mat4 u_model;
uniform mat4 u_view;
uniform mat4 u_projection;
uniform mat3 u_normalMatrix;

out vec3 v_worldPos;    // position monde, pour calculer L et V
out vec3 v_normal;      // normale monde, pour dot(N, L)

void main() {
  vec4 worldPos = u_model * vec4(a_position, 1.0);
  v_worldPos = worldPos.xyz;
  v_normal = u_normalMatrix * a_normal;   // normale correcte même avec scale
  gl_Position = u_projection * u_view * worldPos;   // MVP
}
```

```glsl
// fragment — Blinn-Phong : ambiant + diffus + spéculaire
#version 300 es
precision highp float;

uniform vec3 u_lightPos;
uniform vec3 u_cameraPos;

in vec3 v_worldPos;
in vec3 v_normal;
out vec4 fragColor;

void main() {
  vec3 albedo = vec3(0.2, 0.6, 0.9);       // couleur du marqueur
  vec3 lightColor = vec3(1.0);

  vec3 N = normalize(v_normal);
  vec3 L = normalize(u_lightPos - v_worldPos);   // surface → lumière
  vec3 V = normalize(u_cameraPos - v_worldPos);  // surface → caméra
  vec3 H = normalize(L + V);                      // halfway (Blinn)

  vec3 ambient = 0.15 * albedo;                              // minimum partout
  float diff = max(dot(N, L), 0.0);
  vec3 diffuse = diff * lightColor * albedo;                 // Lambert
  float spec = pow(max(dot(N, H), 0.0), 64.0);               // shininess = 64
  vec3 specular = spec * lightColor;                         // reflet blanc

  fragColor = vec4(ambient + diffuse + specular, 1.0);
}
```

Les faces face à la lumière ont `dot(N, L)` grand (claires) ; les faces à l'opposé ont `dot(N, L)` négatif → clampé à 0 (seul l'ambiant reste). Le relief du cube devient visible — c'est ce que le depth test seul ne donnait pas.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Oublier `DEPTH_BUFFER_BIT` dans le `clear`

`gl.clear(gl.COLOR_BUFFER_BIT)` seul efface la couleur mais **garde les profondeurs de la frame précédente**. Résultat : après quelques frames, plus rien ne passe le depth test (tout est « derrière » l'ancien contenu), la scène se fige ou clignote. Toujours `COLOR_BUFFER_BIT | DEPTH_BUFFER_BIT` par frame, et `gl.enable(gl.DEPTH_TEST)` au setup.

### PIÈGE #2 — Passer `transpose = true` à `uniformMatrix4fv`

En WebGL le paramètre `transpose` **doit être `false`**. On fournit la matrice déjà en column-major. Mettre `true` (réflexe venu d'autres API) ne transpose pas — c'est une erreur — et donne une scène déformée ou vide.

### PIÈGE #3 — Éclairer avec la normale transformée par la model matrix

Transformer la normale avec `mat3(u_model)` marche **tant qu'il n'y a pas de scale non-uniforme**. Dès qu'un cube est aplati (scale `(2,1,1)`), la normale n'est plus perpendiculaire et l'éclairage devient faux. La solution est la **normal matrix** = `transpose(inverse(mat3(model)))`.

### PIÈGE #4 — Ne pas normaliser N, L, V, H

`dot(N, L)` ne représente le cosinus de l'angle que si les deux vecteurs sont **unitaires**. Une normale interpolée entre deux sommets n'est plus de longueur 1 : sans `normalize(v_normal)` dans le fragment, l'intensité diffuse est fausse (bandes sombres/claires). Normaliser N, L, V et H systématiquement dans le fragment.

### PIÈGE #5 — Animer avec un incrément fixe au lieu du delta time

`angle += 0.01` par frame lie la vitesse au framerate : rapide en 120 Hz, lent en 30 Hz, saccadé sous charge. Utiliser `angle += vitesse * dt` où `dt` est le temps écoulé en secondes, **clampé** (`Math.min(dt, 0.1)`) pour absorber les pauses d'onglet.

### PIÈGE #6 — `count` de `drawElements` = nombre d'indices, offset en octets

`gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, offset)` : `count` est le nombre d'**indices** (36 pour un cube, pas 12 triangles ni 8 sommets), et `offset` est en **octets** dans l'EBO. Le `type` doit correspondre au type des indices (`UNSIGNED_SHORT` pour un `Uint16Array`).

### PIÈGE #7 — Ne pas clamper l'élévation de la caméra orbitale

Laisser `θ` atteindre `±π/2` place la caméra pile sur le pôle : le vecteur `up` devient colinéaire à la direction de vue et `lookAt` produit une matrice dégénérée (la vue « claque »). Clamper `θ` dans `]-π/2 + ε, +π/2 - ε[`.

---

## 5. Ancrage TribuZen

Ce module produit la **première scène 3D animée et éclairée** de TribuZen : la mini-scène des sorties du dashboard.

**Mini-scène 3D des sorties.** Chaque sortie du mois est un **cube** posé dans l'espace ; la scène tourne lentement, une lumière ponctuelle la survole, l'utilisateur oriente la vue à la souris.

- **une model matrix par sortie** — position répartie en grille ou en cercle, légère rotation propre animée au delta time ;
- **une view/projection partagées** — la caméra orbitale que l'utilisateur pilote ;
- **Blinn-Phong** — les faces exposées brillent, le relief rend les cubes lisibles ;
- **couleur d'albédo selon l'état** — bouclée (vert), prévue (orange), en cœur du fragment shader.

C'est le **trophée visuel** du dashboard : la promesse « vos sorties en 3D ». Le module 06 avait posé un triangle ; ici on a une scène qui vit.

Fichiers cibles dans `smaurier/tribuzen` :

```
tribuzen/
  src/
    3d/
      scene/
        SceneRenderer.ts   ← la passe de rendu (Exemple 1) : clear + boucle objets
        OrbitCamera.ts     ← coordonnées sphériques + lookAt (§2.7)
        mat.ts             ← computeNormalMatrix, perspective, lookAt
      shaders/
        blinnPhong.vert     ← §Exemple 2
        blinnPhong.frag
      OutingsScene.vue      ← <canvas> WebGL2 + requestAnimationFrame
```

> Le module 09 (WebGPU) reconstruira cette même scène avec l'API moderne (bind groups, WGSL) ; les concepts — MVP par objet, normal matrix, Blinn-Phong, depth test — sont **identiques**, seule l'API change. C'est pourquoi ce module WebGL reste la fondation.

---

## 6. Points clés

1. Une scène multi-objets = une **model matrix par objet**, une **view** et une **projection** partagées par frame ; `MVP = Projection · View · Model`.
2. `uniformMatrix4fv(loc, transpose, data)` : `transpose` **toujours `false`** en WebGL, `data` en column-major (16 floats).
3. Le **depth test** (`gl.enable(DEPTH_TEST)`) trie les fragments par profondeur ; effacer `COLOR_BUFFER_BIT | DEPTH_BUFFER_BIT` **chaque frame**.
4. Le **back-face culling** (`gl.enable(CULL_FACE)`) jette les faces arrière selon le winding — ~50 % de fragments économisés sur des objets fermés.
5. La **normal matrix** = `transpose(inverse(mat3(model)))` garde les normales perpendiculaires même sous scale non-uniforme.
6. **Blinn-Phong** = ambiant + diffus (`max(dot(N,L),0)`) + spéculaire (`pow(max(dot(N,H),0), shininess)`), tous vecteurs **normalisés**, `H = normalize(L+V)`.
7. La **caméra orbitale** décrit sa position en sphérique (`φ`, `θ` clampé, `r`) et alimente `lookAt` pour la view matrix.
8. La **boucle de rendu** (`requestAnimationFrame`) anime avec un **delta time clampé** (`angle += vitesse * Math.min(dt, 0.1)`).

---

## 7. Seeds Anki

```
Pourquoi faut-il effacer le depth buffer à chaque frame dans une scène WebGL ?|gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT). Sans effacer DEPTH_BUFFER_BIT, la frame garde les profondeurs de la frame précédente : après quelques frames plus rien ne passe le depth test (tout paraît « derrière »), la scène se fige/clignote. Il faut aussi gl.enable(gl.DEPTH_TEST) une fois au setup.
Quelle valeur doit avoir le paramètre transpose de uniformMatrix4fv en WebGL, et pourquoi ?|false, toujours. WebGL ne transpose pas à la volée : on fournit la matrice déjà en column-major (16 floats), l'ordre attendu par GLSL. Mettre true est une erreur qui donne une scène déformée ou vide.
Qu'est-ce que la normal matrix et pourquoi ne pas transformer les normales avec la model matrix ?|La normal matrix = transpose(inverse(mat3(model))). Sous un scale non-uniforme, transformer une normale par mat3(model) la rend non perpendiculaire à la surface → éclairage faux. La normal matrix corrige ça. Si la model n'a que rotation + scale uniforme, mat3(model) suffit.
Quels sont les trois termes de Blinn-Phong et le rôle du halfway vector ?|ambiant (couleur minimale partout) + diffus (max(dot(N,L),0)·couleur·albedo, Lambert) + spéculaire (pow(max(dot(N,H),0), shininess)·couleur). H = normalize(L+V) est le halfway vector : c'est ce qui distingue Blinn-Phong de Phong (qui utilise reflect(-L,N) et dot(R,V)). H est moins cher et plus stable. N, L, V, H doivent être normalisés.
Pourquoi animer avec un delta time plutôt qu'un incrément fixe par frame ?|Un incrément fixe (angle += 0.01) lie la vitesse au framerate : rapide en 120 Hz, lent en 30 Hz. Avec le delta time (angle += vitesse * dt, dt en secondes) la vitesse est constante quel que soit le FPS. Clamper dt (Math.min(dt, 0.1)) évite les sauts après une pause d'onglet.
Dans gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, offset), que valent count et offset ?|count = nombre d'INDICES à lire dans l'EBO (36 pour un cube), pas de triangles ni de sommets. offset = décalage en OCTETS dans l'element array buffer. type (UNSIGNED_SHORT) doit correspondre au type des indices (Uint16Array).
Comment décrit-on la position d'une caméra orbitale et quel piège éviter ?|En coordonnées sphériques : azimut φ (souris X), élévation θ (souris Y), rayon r (molette). x = r·cos(θ)·sin(φ), y = r·sin(θ), z = r·cos(θ)·cos(φ). La position alimente lookAt(eye, cible, up) pour la view matrix. Piège : clamper θ dans ]-π/2, +π/2[, sinon up devient colinéaire à la vue et lookAt dégénère.
À quoi sert le back-face culling et comment l'activer ?|Il jette les triangles tournés dos à la caméra (déterminés par le winding : gl.frontFace(gl.CCW) = avant en sens anti-horaire). gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK). Sur un objet fermé opaque on économise ~50 % des fragments. Si un objet apparaît « à l'envers », ses indices sont enroulés dans l'autre sens.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-08-scene-webgl-complete/README.md`. Construire de zéro une scène WebGL2 animée et éclairée : plusieurs cubes (une model matrix chacun), Blinn-Phong, depth test, boucle `requestAnimationFrame` et caméra orbitale — starter HTML/TS commenté, tournant dans un vrai navigateur.
