import { defineConfig } from 'vitepress'

export default defineConfig({
  title: '3D Web — WebGPU, WebGL & Three.js',
  description: 'Formation complète 3D Web : théorie 3D, WebGL, WebGPU, Three.js, shaders, modélisation',
  lang: 'fr-FR',
  ignoreDeadLinks: true,

  themeConfig: {
    nav: [
      { text: 'Accueil', link: '/' },
      { text: 'Modules', link: '/modules/00-prerequis-et-introduction' },
      { text: 'Labs', link: '/labs/lab-01-algebre-lineaire/' },
      { text: 'Quizzes', link: '/quizzes/' },
      { text: 'Visualizations', link: '/visualizations/' },
      { text: 'Glossaire', link: '/glossaire' },
    ],

    sidebar: [
      {
        text: 'Phase 1 — Théorie 3D',
        collapsed: false,
        items: [
          { text: '00. Prérequis et introduction', link: '/modules/00-prerequis-et-introduction' },
          { text: '01. Algèbre linéaire pour la 3D', link: '/modules/01-algebre-lineaire' },
          { text: '02. Transformations et quaternions', link: '/modules/02-transformations-quaternions' },
          { text: '03. Caméras et projections', link: '/modules/03-cameras-projections' },
          { text: '04. Pipeline de rendu', link: '/modules/04-pipeline-rendu' },
          { text: '05. Lumière, matériaux et PBR', link: '/modules/05-lumiere-materiaux-pbr' },
        ],
      },
      {
        text: 'Phase 2 — WebGL',
        collapsed: false,
        items: [
          { text: '06. WebGL fondamentaux et GLSL', link: '/modules/06-webgl-fondamentaux' },
          { text: '07. Shaders, buffers et textures', link: '/modules/07-shaders-buffers-textures' },
          { text: '08. Scène WebGL complète', link: '/modules/08-scene-webgl-complete' },
        ],
      },
      {
        text: 'Phase 3 — WebGPU',
        collapsed: false,
        items: [
          { text: '09. WebGPU architecture et WGSL', link: '/modules/09-webgpu-architecture-wgsl' },
          { text: '10. Render pipeline et bind groups', link: '/modules/10-render-pipeline-bind-groups' },
          { text: '11. Compute shaders et GPGPU', link: '/modules/11-compute-shaders-gpgpu' },
          { text: '12. Techniques avancées WebGPU', link: '/modules/12-webgpu-avance' },
        ],
      },
      {
        text: 'Phase 4 — Three.js',
        collapsed: false,
        items: [
          { text: '13. Three.js fondamentaux', link: '/modules/13-threejs-fondamentaux' },
          { text: '14. Matériaux et lumières Three.js', link: '/modules/14-materiaux-lumieres-threejs' },
          { text: '15. Modèles et animations', link: '/modules/15-modeles-animations' },
          { text: '16. Post-processing et effets', link: '/modules/16-post-processing-effets' },
          { text: '17. Performance et optimisation', link: '/modules/17-performance-optimisation' },
        ],
      },
      {
        text: 'Phase 5 — Avancé',
        collapsed: false,
        items: [
          { text: '18. Shadow mapping', link: '/modules/18-shadow-mapping' },
          { text: '19. Shaders créatifs et procedural', link: '/modules/19-shaders-creatifs' },
          { text: '20. Physique et interactions', link: '/modules/20-physique-interactions' },
          { text: '21. Projet final', link: '/modules/21-projet-final' },
        ],
      },
      {
        text: 'Annexe',
        collapsed: false,
        items: [
          { text: '22. Modélisation 3D', link: '/modules/22-modelisation-3d' },
        ],
      },
      {
        text: 'Labs',
        collapsed: true,
        items: [
          { text: 'Lab 01 — Algèbre linéaire', link: '/labs/lab-01-algebre-lineaire/' },
          { text: 'Lab 02 — Transformations', link: '/labs/lab-02-transformations/' },
          { text: 'Lab 03 — Caméra et projection', link: '/labs/lab-03-camera-projection/' },
          { text: 'Lab 04 — Pipeline de rendu', link: '/labs/lab-04-pipeline-rendu/' },
          { text: 'Lab 05 — Lumière et matériaux', link: '/labs/lab-05-lumiere-materiaux/' },
          { text: 'Lab 06 — WebGL fondamentaux', link: '/labs/lab-06-webgl-fondamentaux/' },
          { text: 'Lab 07 — Shaders GLSL', link: '/labs/lab-07-shaders-glsl/' },
          { text: 'Lab 08 — Scène WebGL', link: '/labs/lab-08-scene-webgl/' },
          { text: 'Lab 09 — WebGPU fondamentaux', link: '/labs/lab-09-webgpu-fondamentaux/' },
          { text: 'Lab 10 — Render pipeline', link: '/labs/lab-10-render-pipeline/' },
          { text: 'Lab 11 — Compute shaders', link: '/labs/lab-11-compute-shaders/' },
          { text: 'Lab 12 — WebGPU avancé', link: '/labs/lab-12-webgpu-avance/' },
          { text: 'Lab 13 — Three.js fondamentaux', link: '/labs/lab-13-threejs-fondamentaux/' },
          { text: 'Lab 14 — Matériaux et lumières', link: '/labs/lab-14-materiaux-lumieres/' },
          { text: 'Lab 15 — Modèles et animations', link: '/labs/lab-15-modeles-animations/' },
          { text: 'Lab 16 — Post-processing', link: '/labs/lab-16-post-processing/' },
          { text: 'Lab 17 — Performance', link: '/labs/lab-17-performance/' },
          { text: 'Lab 18 — Shadow mapping', link: '/labs/lab-18-shadow-mapping/' },
          { text: 'Lab 19 — Shaders créatifs', link: '/labs/lab-19-shaders-creatifs/' },
          { text: 'Lab 20 — Physique', link: '/labs/lab-20-physique/' },
          { text: 'Lab 21 — Projet final', link: '/labs/lab-21-projet-final/' },
          { text: 'Lab 22 — Modélisation', link: '/labs/lab-22-modelisation/' },
        ],
      },
      {
        text: 'Quizzes',
        collapsed: true,
        items: [
          { text: 'Tous les quizzes', link: '/quizzes/' },
        ],
      },
      {
        text: 'Visualizations',
        collapsed: true,
        items: [
          { text: 'Toutes les visualizations', link: '/visualizations/' },
        ],
      },
      {
        text: 'Ressources',
        collapsed: true,
        items: [
          { text: 'Glossaire', link: '/glossaire' },
        ],
      },
    ],

    outline: { level: [2, 3] },
    search: { provider: 'local' },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/smaurier/webGPU-3D-course' },
    ],
  },
})
