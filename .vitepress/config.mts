import { defineConfig } from 'vitepress'

export default defineConfig({
  title: '3D Web',
  description:
    '3D temps réel sur le web : maths 3D, pipeline de rendu, WebGL, WebGPU/WGSL, Three.js, shaders, PBR, ombres, ray tracing, GI, volumétrique, WebXR (débutant → expert)',
  lang: 'fr-FR',
  srcDir: '.',
  ignoreDeadLinks: true,

  // NB : PAS d'override `vue.template.compilerOptions.delimiters` (il casse le `{{ }}` du
  // thème par défaut — menu/outline). Le contenu garde ses accolades WGSL/GLSL/JS dans des
  // blocs de code (non interprétés). cf docs/curriculum/DETTE-vitepress-delimiters.md

  srcExclude: [
    'quizzes/**',
    'screencasts/**',
    'visualizations/**',
    'demo-app/**',
    'config/**',
    'scripts/**',
  ],

  themeConfig: {
    nav: [
      { text: 'Modules', link: '/modules/00-prerequis-et-introduction' },
      { text: 'Labs', link: '/labs/lab-00-prerequis-et-introduction/README' },
    ],

    sidebar: {
      '/modules/': [
        {
          text: 'Phase 1 — Maths & théorie',
          collapsed: false,
          items: [
            { text: '00 · Prérequis & introduction', link: '/modules/00-prerequis-et-introduction' },
            { text: '01 · Algèbre linéaire pour la 3D', link: '/modules/01-algebre-lineaire-pour-la-3d' },
            { text: '02 · Transformations & quaternions', link: '/modules/02-transformations-et-quaternions' },
            { text: '03 · Caméras & projections', link: '/modules/03-cameras-et-projections' },
            { text: '04 · Pipeline de rendu', link: '/modules/04-pipeline-de-rendu' },
            { text: '05 · Lumière, matériaux & PBR', link: '/modules/05-lumiere-materiaux-et-pbr' },
          ],
        },
        {
          text: 'Phase 2 — WebGL',
          collapsed: false,
          items: [
            { text: '06 · WebGL fondamentaux', link: '/modules/06-webgl-fondamentaux' },
            { text: '07 · Shaders, buffers & textures', link: '/modules/07-shaders-buffers-textures' },
            { text: '08 · Scène WebGL complète', link: '/modules/08-scene-webgl-complete' },
          ],
        },
        {
          text: 'Phase 3 — WebGPU & WGSL',
          collapsed: false,
          items: [
            { text: '09 · Architecture WebGPU & WGSL', link: '/modules/09-webgpu-architecture-et-wgsl' },
            { text: '10 · Render pipeline & bind groups', link: '/modules/10-render-pipeline-et-bind-groups' },
            { text: '11 · Compute shaders & GPGPU', link: '/modules/11-compute-shaders-et-gpgpu' },
            { text: '12 · WebGPU avancé', link: '/modules/12-webgpu-avance' },
          ],
        },
        {
          text: 'Phase 4 — Three.js',
          collapsed: false,
          items: [
            { text: '13 · Three.js fondamentaux', link: '/modules/13-threejs-fondamentaux' },
            { text: '14 · Matériaux & lumières (Three.js)', link: '/modules/14-materiaux-et-lumieres-threejs' },
            { text: '15 · Modèles & animations', link: '/modules/15-modeles-et-animations' },
            { text: '16 · Post-processing & effets', link: '/modules/16-post-processing-et-effets' },
            { text: '17 · Performance & optimisation', link: '/modules/17-performance-et-optimisation' },
          ],
        },
        {
          text: 'Phase 5 — Rendu avancé',
          collapsed: false,
          items: [
            { text: '18 · Shadow mapping', link: '/modules/18-shadow-mapping' },
            { text: '19 · Shaders créatifs', link: '/modules/19-shaders-creatifs' },
            { text: '20 · Physique & interactions', link: '/modules/20-physique-et-interactions' },
            { text: '21 · Modélisation 3D & géométrie', link: '/modules/21-modelisation-3d-et-geometrie' },
          ],
        },
        {
          text: 'Phase 6 — Expert',
          collapsed: false,
          items: [
            { text: '22 · Ray tracing', link: '/modules/22-ray-tracing' },
            { text: '23 · Global illumination & screen-space', link: '/modules/23-global-illumination-et-screen-space' },
            { text: '24 · Rendu volumétrique', link: '/modules/24-rendu-volumetrique' },
            { text: '25 · WebXR & animation procédurale', link: '/modules/25-webxr-et-animation-procedurale' },
            { text: '26 · Audio 3D spatial', link: '/modules/26-audio-3d-spatial' },
            { text: '27 · Virtual textures & streaming', link: '/modules/27-virtual-textures-et-streaming' },
            { text: '28 · Projet final', link: '/modules/28-projet-final' },
          ],
        },
      ],

      '/labs/': [
        {
          text: 'Labs — pratique (navigateur WebGPU/WebGL réel)',
          collapsed: false,
          items: [
            { text: 'Lab 00 · Prérequis & introduction', link: '/labs/lab-00-prerequis-et-introduction/README' },
            { text: 'Lab 01 · Algèbre linéaire', link: '/labs/lab-01-algebre-lineaire-pour-la-3d/README' },
            { text: 'Lab 02 · Transformations & quaternions', link: '/labs/lab-02-transformations-et-quaternions/README' },
            { text: 'Lab 03 · Caméras & projections', link: '/labs/lab-03-cameras-et-projections/README' },
            { text: 'Lab 04 · Pipeline de rendu', link: '/labs/lab-04-pipeline-de-rendu/README' },
            { text: 'Lab 05 · Lumière, matériaux & PBR', link: '/labs/lab-05-lumiere-materiaux-et-pbr/README' },
            { text: 'Lab 06 · WebGL fondamentaux', link: '/labs/lab-06-webgl-fondamentaux/README' },
            { text: 'Lab 07 · Shaders, buffers & textures', link: '/labs/lab-07-shaders-buffers-textures/README' },
            { text: 'Lab 08 · Scène WebGL complète', link: '/labs/lab-08-scene-webgl-complete/README' },
            { text: 'Lab 09 · Architecture WebGPU & WGSL', link: '/labs/lab-09-webgpu-architecture-et-wgsl/README' },
            { text: 'Lab 10 · Render pipeline & bind groups', link: '/labs/lab-10-render-pipeline-et-bind-groups/README' },
            { text: 'Lab 11 · Compute shaders & GPGPU', link: '/labs/lab-11-compute-shaders-et-gpgpu/README' },
            { text: 'Lab 12 · WebGPU avancé', link: '/labs/lab-12-webgpu-avance/README' },
            { text: 'Lab 13 · Three.js fondamentaux', link: '/labs/lab-13-threejs-fondamentaux/README' },
            { text: 'Lab 14 · Matériaux & lumières', link: '/labs/lab-14-materiaux-et-lumieres-threejs/README' },
            { text: 'Lab 15 · Modèles & animations', link: '/labs/lab-15-modeles-et-animations/README' },
            { text: 'Lab 16 · Post-processing & effets', link: '/labs/lab-16-post-processing-et-effets/README' },
            { text: 'Lab 17 · Performance & optimisation', link: '/labs/lab-17-performance-et-optimisation/README' },
            { text: 'Lab 18 · Shadow mapping', link: '/labs/lab-18-shadow-mapping/README' },
            { text: 'Lab 19 · Shaders créatifs', link: '/labs/lab-19-shaders-creatifs/README' },
            { text: 'Lab 20 · Physique & interactions', link: '/labs/lab-20-physique-et-interactions/README' },
            { text: 'Lab 21 · Modélisation 3D & géométrie', link: '/labs/lab-21-modelisation-3d-et-geometrie/README' },
            { text: 'Lab 22 · Ray tracing', link: '/labs/lab-22-ray-tracing/README' },
            { text: 'Lab 23 · Global illumination & screen-space', link: '/labs/lab-23-global-illumination-et-screen-space/README' },
            { text: 'Lab 24 · Rendu volumétrique', link: '/labs/lab-24-rendu-volumetrique/README' },
            { text: 'Lab 25 · WebXR & animation procédurale', link: '/labs/lab-25-webxr-et-animation-procedurale/README' },
            { text: 'Lab 26 · Audio 3D spatial', link: '/labs/lab-26-audio-3d-spatial/README' },
            { text: 'Lab 27 · Virtual textures & streaming', link: '/labs/lab-27-virtual-textures-et-streaming/README' },
            { text: 'Lab 28 · Projet final', link: '/labs/lab-28-projet-final/README' },
          ],
        },
      ],
    },

    search: { provider: 'local' },
    outline: { level: [2, 3], label: 'Sur cette page' },
    docFooter: { prev: 'Page précédente', next: 'Page suivante' },
  },
})
