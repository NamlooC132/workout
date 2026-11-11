// Background picture: find the picture's colors and turn them into theme colors.
// Pure functions (no browser needed) so they can be tested.

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let hh;
  if (mx === r) hh = ((g - b) / d + (g < b ? 6 : 0));
  else if (mx === g) hh = (b - r) / d + 2;
  else hh = (r - g) / d + 4;
  return [hh * 60, s, l];
}

/** pixels: RGBA bytes (canvas ImageData.data). Returns { hue, sat, avgHue, avgSat, light } (hue null for grey pictures). */
export function analyzePixels(pixels) {
  const bins = new Array(36).fill(0), binSat = new Array(36).fill(0);
  let sumR = 0, sumG = 0, sumB = 0, n = 0, total = 0;
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    sumR += r; sumG += g; sumB += b; n++;
    const [hh, s, l] = rgbToHsl(r, g, b);
    const w = s * (1 - Math.abs(2 * l - 1)); // colorful, not too dark / too bright
    const bin = Math.min(35, Math.floor(hh / 10));
    bins[bin] += w; binSat[bin] += w * s; total += w;
  }
  if (!n) return { hue: null, sat: 0, avgHue: 0, avgSat: 0, light: 0.5 };
  const [avgHue, avgSat, light] = rgbToHsl(sumR / n, sumG / n, sumB / n);
  if (total < n * 0.02) return { hue: null, sat: 0, avgHue, avgSat, light };
  let best = 0;
  for (let i = 1; i < 36; i++) if (bins[i] > bins[best]) best = i;
  const pick = [best - 1, best, best + 1].map((i) => (i + 36) % 36);
  const w = pick.reduce((a, i) => a + bins[i], 0);
  let x = 0, y = 0, sat = 0;
  for (const i of pick) { const a = ((i * 10 + 5) * Math.PI) / 180; x += bins[i] * Math.cos(a); y += bins[i] * Math.sin(a); sat += binSat[i]; }
  const hue = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return { hue: Math.round(hue), sat: Math.min(0.9, Math.max(0.5, sat / w)), avgHue: Math.round(avgHue), avgSat, light };
}

const hsl = (h, s, l, a = 1) => `hsla(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%, ${a})`;

/** CSS variables for the theme. `stats` from analyzePixels, `dark` = dark mode. */
export function wallpaperVars(stats, dark, glass = 50) {
  const g = Math.max(0, Math.min(100, Number.isFinite(+glass) ? +glass : 50));
  // 0 = solid cards, 50 = the original look, 100 = almost clear glass.
  const mix = (solid, mid, clear) => (g <= 50 ? solid + (mid - solid) * (g / 50) : mid + (clear - mid) * ((g - 50) / 50));
  const r2 = (n) => Math.round(n * 100) / 100;
  const ah = stats.avgHue ?? 0, as = Math.min(0.4, stats.avgSat ?? 0);
  const vars = dark
    ? {
      '--bg': hsl(ah, as, 0.09),
      '--card': hsl(ah, as, 0.15, r2(mix(0.97, 0.74, 0.22))),
      '--card2': hsl(ah, as, 0.2, r2(mix(0.97, 0.74, 0.22))),
      '--card-solid': hsl(ah, as, 0.15),
      '--card2-solid': hsl(ah, as, 0.2),
      '--wall-dim': 'linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5))',
    }
    : {
      '--bg': hsl(ah, as, 0.95),
      '--card': hsl(ah, as * 0.5, 0.99, r2(mix(0.97, 0.78, 0.25))),
      '--card2': hsl(ah, as, 0.96, r2(mix(0.97, 0.75, 0.25))),
      '--card-solid': hsl(ah, as * 0.5, 0.99),
      '--card2-solid': hsl(ah, as, 0.96),
      '--wall-dim': 'linear-gradient(rgba(255, 255, 255, 0.5), rgba(255, 255, 255, 0.5))',
    };
  vars['--wall-blur'] = `${r2(mix(0, 14, 26))}px`;
  vars['--wall-bar'] = `${Math.round(mix(96, 55, 20))}%`;
  if (stats.hue !== null && stats.hue !== undefined) {
    const l = dark ? 0.64 : 0.38;
    vars['--accent'] = hsl(stats.hue, stats.sat, l);
    vars['--accent-soft'] = hsl(stats.hue, stats.sat, l, 0.2);
    vars['--green'] = hsl(stats.hue, stats.sat, l);
    vars['--green-soft'] = hsl(stats.hue, stats.sat, l, 0.2);
    vars['--on-accent'] = dark ? '#0b0b0d' : '#ffffff';
  }
  return vars;
}
