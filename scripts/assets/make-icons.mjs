// Gera os ícones do PWA a partir do logo já recortado (logo-cutout.png).
// Rode de novo se o logo mudar: primeiro `npm run logo`, depois `npm run icons`.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const LOGO = '../../web/src/assets/logo-cutout.png';
const OUT = '../../web/public/pwa';
mkdirSync(OUT, { recursive: true });

const THEME_BG = '#0a0a0a';

/** Ícone quadrado: fundo do tema + logo centralizado, com uma margem (fração do lado). */
async function squareIcon(size, margin, file, { rounded = 0 } = {}) {
  const logoSize = Math.round(size * (1 - margin * 2));
  const logo = await sharp(LOGO)
    .resize(logoSize, logoSize, { fit: 'inside', withoutEnlargement: false })
    .toBuffer();
  const logoMeta = await sharp(logo).metadata();

  let base = sharp({
    create: { width: size, height: size, channels: 4, background: THEME_BG },
  });
  if (rounded > 0) {
    const mask = Buffer.from(
      `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${rounded}" ry="${rounded}" fill="#fff"/></svg>`,
    );
    base = sharp(await base.png().toBuffer()).composite([{ input: mask, blend: 'dest-in' }]);
  }

  await sharp(await base.png().toBuffer())
    .composite([
      {
        input: logo,
        left: Math.round((size - logoMeta.width) / 2),
        top: Math.round((size - logoMeta.height) / 2),
      },
    ])
    .png()
    .toFile(`${OUT}/${file}`);
}

// Ícones normais: pouca margem, cantos vivos (o SO já aplica o recorte que quiser).
await squareIcon(192, 0.12, 'pwa-192.png');
await squareIcon(512, 0.12, 'pwa-512.png');
await squareIcon(180, 0.14, 'apple-touch-icon.png', { rounded: 34 }); // iOS não recorta sozinho
await squareIcon(48, 0.1, 'favicon.png');

// Maskable: o SO pode recortar um círculo/squircle central de ~80% — margem maior para não cortar o texto.
await squareIcon(512, 0.22, 'maskable-512.png');

console.log('Ícones gerados em web/public/pwa/');
