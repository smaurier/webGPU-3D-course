import {
  createTestRunner,
  assertApprox,
  assertTrue,
  type Vec3,
} from '../test-utils.ts';

// ─── Beer-Lambert transmittance ─────────────────────────────────────────────

function beerLambert(sigma: number, distance: number): number {
  // TODO: retourner la transmittance T = exp(-sigma * distance)
  return 0;
}

// ─── Henyey-Greenstein phase function ───────────────────────────────────────

function henyeyGreenstein(cosTheta: number, g: number): number {
  // TODO: implementer la fonction de phase Henyey-Greenstein
  // HG = (1 - g^2) / (4*PI * (1 + g^2 - 2*g*cosTheta)^1.5)
  return 0;
}

// ─── Rayleigh phase function ────────────────────────────────────────────────

function rayleighPhase(cosTheta: number): number {
  // TODO: implementer la fonction de phase Rayleigh
  // R = (3 / (16*PI)) * (1 + cosTheta^2)
  return 0;
}

// ─── Ray march integration ──────────────────────────────────────────────────

/**
 * Marche le long d'un rayon et accumule couleur + transmittance.
 * densityField(t) retourne la densite au parametre t le long du rayon.
 * Retourne { color (RGB), finalTransmittance }.
 */
function rayMarchVolume(
  densityField: (t: number) => number,
  mediumColor: Vec3,
  tMin: number,
  tMax: number,
  steps: number,
): { color: Vec3; transmittance: number } {
  // TODO: implementer le ray marching volumetrique
  // Pour chaque pas :
  //   1. Calculer la position t = tMin + (i + 0.5) * stepSize
  //   2. Echantillonner la densite
  //   3. Calculer extinction = exp(-densite * stepSize)
  //   4. Accumuler la couleur : absorbed = transmittance * (1 - extinction)
  //   5. Mettre a jour la transmittance
  return { color: [0, 0, 0], transmittance: 1 };
}

// ─── Linear fog ─────────────────────────────────────────────────────────────

function linearFog(distance: number, near: number, far: number): number {
  // TODO: retourner le facteur de brouillard lineaire
  // factor = (distance - near) / (far - near), clamp [0, 1]
  return 0;
}

// ─── Exponential fog ────────────────────────────────────────────────────────

function exponentialFog(distance: number, density: number): number {
  // TODO: retourner le facteur de brouillard exponentiel
  // factor = 1 - exp(-density * distance)
  return 0;
}

// ─── Height fog ─────────────────────────────────────────────────────────────

/**
 * Densite du brouillard qui decroit exponentiellement avec l'altitude.
 * baseDensity a altitude 0, falloff controle la decroissance.
 */
function heightFogDensity(altitude: number, baseDensity: number, falloff: number): number {
  // TODO: retourner baseDensity * exp(-falloff * max(0, altitude))
  return 0;
}

// ─── Volumetric light sampling ──────────────────────────────────────────────

/**
 * Marche le long d'un rayon et accumule la fraction eclairee.
 * shadowSampler(t) retourne 1 si le point est eclaire, 0 si dans l'ombre.
 */
function volumetricLightSampling(
  shadowSampler: (t: number) => number,
  tMin: number,
  tMax: number,
  steps: number,
): number {
  // TODO: echantillonner shadowSampler a chaque pas et retourner la moyenne
  return 0;
}

// ─── Cloud density from noise ───────────────────────────────────────────────

/**
 * Remap une valeur de bruit en densite de nuage.
 * Si noise < threshold, densite = 0.
 * Sinon, smooth remap vers [0, 1].
 */
function cloudDensityRemap(noise: number, threshold: number): number {
  // TODO: si noise < threshold, retourner 0
  // sinon retourner min(1, (noise - threshold) / (1 - threshold))
  return 0;
}

// ─── Multi-octave cloud noise ───────────────────────────────────────────────

/**
 * Combine bruit de forme (shape) et bruit de detail.
 * Le detail est soustrait du shape pour creer des bords irreguliers.
 */
function cloudNoiseCombine(
  shapeNoise: number,
  detailNoise: number,
  detailWeight: number,
): number {
  // TODO: result = shapeNoise - detailWeight * detailNoise, clamp [0, 1]
  return 0;
}

// ─── Atmospheric Rayleigh coefficient ───────────────────────────────────────

/**
 * Le coefficient de diffusion Rayleigh est inversement proportionnel
 * a la puissance 4 de la longueur d'onde.
 * beta(lambda) = coefficient / lambda^4
 */
function rayleighCoefficient(wavelength: number, coefficient: number): number {
  // TODO: retourner coefficient / wavelength^4
  return 0;
}

// ─── Optical depth integration ──────────────────────────────────────────────

/**
 * Integre la densite le long d'un chemin (somme de densite * stepSize).
 */
function opticalDepth(
  densityField: (t: number) => number,
  tMin: number,
  tMax: number,
  steps: number,
): number {
  // TODO: pour chaque pas, accumuler densityField(t) * stepSize
  return 0;
}

// ─── Transmittance from optical depth ───────────────────────────────────────

function transmittanceFromOpticalDepth(od: number): number {
  // TODO: retourner exp(-od)
  return 0;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 25 — Rendu volumetrique');

// Beer-Lambert
runner.test('Beer-Lambert : T=1 a distance 0', () => {
  assertApprox(beerLambert(0.5, 0), 1);
});

runner.test('Beer-Lambert : T~0 a grande distance', () => {
  const t = beerLambert(0.5, 100);
  assertTrue(t < 0.001, `T devrait etre proche de 0, got ${t}`);
});

runner.test('Beer-Lambert : valeur intermediaire', () => {
  assertApprox(beerLambert(1, 1), Math.exp(-1), 1e-6);
});

// Henyey-Greenstein
runner.test('Henyey-Greenstein : g=0 isotrope (1/4PI)', () => {
  assertApprox(henyeyGreenstein(0.5, 0), 1 / (4 * Math.PI), 1e-6);
});

runner.test('Henyey-Greenstein : g=0.8 pic vers avant (cosTheta=1 > cosTheta=-1)', () => {
  const forward = henyeyGreenstein(1, 0.8);
  const backward = henyeyGreenstein(-1, 0.8);
  assertTrue(forward > backward, `forward=${forward} devrait etre > backward=${backward}`);
});

runner.test('Henyey-Greenstein : g=-0.5 retrodiffusion (cosTheta=-1 > cosTheta=1)', () => {
  const forward = henyeyGreenstein(1, -0.5);
  const backward = henyeyGreenstein(-1, -0.5);
  assertTrue(backward > forward, `backward=${backward} devrait etre > forward=${forward}`);
});

// Rayleigh
runner.test('Rayleigh : symetrique (theta et PI-theta meme valeur)', () => {
  const val0 = rayleighPhase(Math.cos(0));
  const valPI = rayleighPhase(Math.cos(Math.PI));
  assertApprox(val0, valPI, 1e-6);
});

runner.test('Rayleigh : pics a 0 et PI, minimum a PI/2', () => {
  const peak = rayleighPhase(1); // cos(0) = 1
  const trough = rayleighPhase(0); // cos(PI/2) = 0
  assertTrue(peak > trough, `peak=${peak} devrait etre > trough=${trough}`);
});

// Ray marching
runner.test('Ray march : densite uniforme accumule couleur', () => {
  const result = rayMarchVolume(() => 0.5, [1, 0.5, 0.2], 0, 10, 100);
  assertTrue(result.color[0] > 0, 'Couleur R devrait etre > 0');
  assertTrue(result.transmittance < 1, 'Transmittance devrait diminuer');
  assertTrue(result.transmittance > 0, 'Transmittance devrait rester > 0');
});

runner.test('Ray march : densite nulle ne change rien', () => {
  const result = rayMarchVolume(() => 0, [1, 1, 1], 0, 10, 100);
  assertApprox(result.transmittance, 1, 1e-6);
  assertApprox(result.color[0], 0, 1e-6);
});

// Linear fog
runner.test('Linear fog : 0 a near', () => {
  assertApprox(linearFog(10, 10, 100), 0);
});

runner.test('Linear fog : 1 a far', () => {
  assertApprox(linearFog(100, 10, 100), 1);
});

runner.test('Linear fog : 0.5 au milieu', () => {
  assertApprox(linearFog(55, 10, 100), 0.5);
});

// Exponential fog
runner.test('Exponential fog : valeur attendue', () => {
  assertApprox(exponentialFog(2, 0.5), 1 - Math.exp(-1), 1e-6);
});

// Height fog
runner.test('Height fog : densite decroit avec altitude', () => {
  const low = heightFogDensity(0, 1, 0.5);
  const high = heightFogDensity(10, 1, 0.5);
  assertTrue(low > high, `low=${low} devrait etre > high=${high}`);
});

// Volumetric light
runner.test('Volumetric light : tout eclaire = 1', () => {
  assertApprox(volumetricLightSampling(() => 1, 0, 10, 50), 1, 1e-6);
});

runner.test('Volumetric light : tout dans ombre = 0', () => {
  assertApprox(volumetricLightSampling(() => 0, 0, 10, 50), 0, 1e-6);
});

// Cloud density
runner.test('Cloud density remap : sous le seuil = 0', () => {
  assertApprox(cloudDensityRemap(0.3, 0.5), 0);
});

runner.test('Cloud density remap : au dessus du seuil remap correct', () => {
  assertApprox(cloudDensityRemap(0.75, 0.5), 0.5, 1e-6);
});

// Multi-octave cloud noise
runner.test('Cloud noise combine : detail reduit la densite', () => {
  const withoutDetail = cloudNoiseCombine(0.8, 0, 0.5);
  const withDetail = cloudNoiseCombine(0.8, 0.5, 0.5);
  assertTrue(withoutDetail > withDetail, 'Detail devrait reduire la densite');
});

// Rayleigh coefficient
runner.test('Rayleigh coefficient : bleu > vert > rouge', () => {
  const coeff = 1;
  const blue = rayleighCoefficient(450, coeff);
  const green = rayleighCoefficient(550, coeff);
  const red = rayleighCoefficient(700, coeff);
  assertTrue(blue > green, `blue=${blue} devrait etre > green=${green}`);
  assertTrue(green > red, `green=${green} devrait etre > red=${red}`);
});

// Optical depth
runner.test('Optical depth : densite uniforme = densite * longueur', () => {
  const od = opticalDepth(() => 2, 0, 5, 100);
  assertApprox(od, 10, 0.01);
});

// Transmittance from optical depth
runner.test('Transmittance : opticalDepth=0 => T=1', () => {
  assertApprox(transmittanceFromOpticalDepth(0), 1);
});

runner.test('Transmittance : opticalDepth eleve => T~0', () => {
  const t = transmittanceFromOpticalDepth(20);
  assertTrue(t < 1e-6, `T devrait etre ~0, got ${t}`);
});

runner.run();
