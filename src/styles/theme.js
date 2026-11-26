// The canvas needs resolved colors. DOM components use the matching CSS tokens.
export const accents = { lilac: '#ddb4f4', blue: '#9dcaff', sage: '#a9d8ba' };
export const validAccent = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

function mix(a, b, amount) {
  const rgb = [1, 3, 5].map(i => {
    const start = parseInt(a.slice(i, i + 2), 16), end = parseInt(b.slice(i, i + 2), 16);
    return Math.round(start + (end - start) * amount).toString(16).padStart(2, '0');
  });
  return '#' + rgb.join('');
}

export function palette(value) {
  const hue = validAccent(value) ? value : accents.lilac;
  // Lift very dark custom colors so selections and labels stay legible.
  const luminance = [1, 3, 5].map(i => (parseInt(hue.slice(i, i + 2), 16) / 255 + 0.055) / 1.055)
    .reduce((sum, channel, i) => sum + channel ** 2.4 * [0.2126, 0.7152, 0.0722][i], 0);
  const accent = luminance < 0.35 ? mix(hue, '#ffffff', 0.64) : hue;
  return {
    bg: mix('#111015', hue, 0.046), bgDeep: mix('#100f13', hue, 0.025),
    bgPanel: mix('#19171d', hue, 0.055), bgCard: mix('#201e24', hue, 0.09),
    border: mix('#302d35', hue, 0.14), borderHi: mix('#564d61', accent, 0.28),
    accent, accentHi: mix(accent, '#ffffff', 0.55), accentDim: accent + '20', hover: accent + '16',
  };
}

const fixed = {
  rose: '#dfab91', amber: '#d5b887', purple: '#bca8cf', blue: '#93b5d1', green: '#9bc2aa',
  textHi: '#efeaf2', textMid: '#c7bfce', textLow: '#a69cae',
  ui: "'Segoe UI', system-ui, sans-serif", mono: "'JetBrains Mono', ui-monospace, monospace",
};

export const theme = Object.freeze({
  ...fixed, ...Object.fromEntries(Object.keys(palette()).map(key => [key, 'var(--' + key + ')'])),
});