// Gera duas versões do logo Studio Personal a partir de /assets-marca/logo-studio-personal.jpg:
//   1) "cutout"  — fundo cinza removido (PNG transparente), para usar solto sobre o tema escuro.
//   2) "selo"    — o mesmo recorte, mantendo o cartão cinza, com cantos arredondados (fica um "selo").
// Rode de novo se o logo original for trocado: `npm run logo` (dentro de scripts/assets).
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const SRC = '../../assets-marca/logo-studio-personal.jpg';
const OUT = '../../web/src/assets';
mkdirSync(OUT, { recursive: true });

// Cor de fundo do logo original (cinza chapado) e tolerância do chroma-key.
const BG = { r: 112, g: 112, b: 112 };
const TOLERANCE = 42; // px mais perto da cor = mais transparente
const FEATHER = 1.1; // desfoque leve no alfa para não serrilhar a borda das letras

async function loadCropped() {
  const img = sharp(SRC);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  // Acha a caixa do retângulo cinza (o JPG tem ~24px de moldura branca ao redor).
  const isGray = (i) => Math.abs(data[i] - BG.r) < 20 && Math.abs(data[i + 1] - BG.g) < 20 && Math.abs(data[i + 2] - BG.b) < 20;
  const rowHasGray = (y) => {
    let n = 0;
    for (let x = 0; x < width; x += 4) if (isGray((y * width + x) * channels)) n++;
    return n > width / 16;
  };
  const colHasGray = (x) => {
    let n = 0;
    for (let y = 0; y < height; y += 4) if (isGray((y * width + x) * channels)) n++;
    return n > height / 16;
  };
  let top = 0;
  while (top < height && !rowHasGray(top)) top++;
  let bottom = height - 1;
  while (bottom > top && !rowHasGray(bottom)) bottom--;
  let left = 0;
  while (left < width && !colHasGray(left)) left++;
  let right = width - 1;
  while (right > left && !colHasGray(right)) right--;

  return sharp(SRC).extract({ left, top, width: right - left + 1, height: bottom - top + 1 });
}

async function makeCutout(cropped) {
  const { data, info } = await cropped.clone().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0, p = 0; i < data.length; i += channels, p += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const dist = Math.sqrt((r - BG.r) ** 2 + (g - BG.g) ** 2 + (b - BG.b) ** 2);
    const alpha = Math.max(0, Math.min(255, Math.round(((dist - TOLERANCE) / 40) * 255)));
    out[p] = r;
    out[p + 1] = g;
    out[p + 2] = b;
    out[p + 3] = alpha;
  }
  // desfoca só o canal alfa (evita halo cinza e serrilhado nas bordas das letras)
  const alphaImg = sharp(out, { raw: { width, height, channels: 4 } }).extractChannel('alpha').blur(FEATHER);
  const alphaBuf = await alphaImg.raw().toBuffer();
  for (let p = 0; p < width * height; p++) out[p * 4 + 3] = alphaBuf[p];

  // Corta para a caixa exata onde há pixel visível (alfa > 0), em vez de confiar
  // na heurística de cor do sharp — aqui o fundo já é transparente, então isso é exato.
  let top = height, bottom = 0, left = width, right = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (out[(y * width + x) * 4 + 3] > 8) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  const pad = 4;
  const cropLeft = Math.max(0, left - pad);
  const cropTop = Math.max(0, top - pad);
  const cropWidth = Math.min(width - cropLeft, right - left + 1 + pad * 2);
  const cropHeight = Math.min(height - cropTop, bottom - top + 1 + pad * 2);
  await sharp(out, { raw: { width, height, channels: 4 } })
    .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
    .png()
    .toFile(`${OUT}/logo-cutout.png`);
}

async function makeSelo(cropped) {
  const { info } = await cropped.clone().png().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const radius = Math.round(Math.min(width, height) * 0.06);
  const mask = Buffer.from(
    `<svg width="${width}" height="${height}"><rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
  );
  await cropped
    .clone()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toFile(`${OUT}/logo-selo.png`);
}

const cropped = await loadCropped();
await makeCutout(cropped);
await makeSelo(cropped);

// Versão leve para usar na interface (login/cabeçalho exibem no máximo ~72px de altura;
// 480px de largura já cobre até telas 5x). O PNG em resolução cheia fica só para os ícones do PWA.
await sharp(`${OUT}/logo-cutout.png`)
  .resize({ width: 480 })
  .png({ compressionLevel: 9 })
  .toFile(`${OUT}/logo-cutout-web.png`);

const a = await sharp(`${OUT}/logo-cutout.png`).metadata();
const b = await sharp(`${OUT}/logo-selo.png`).metadata();
const c = await sharp(`${OUT}/logo-cutout-web.png`).metadata();
console.log(`logo-cutout.png      ${a.width}x${a.height}  (fundo transparente, resolução cheia — usar para gerar ícones)`);
console.log(`logo-selo.png        ${b.width}x${b.height}  (cartão cinza, cantos arredondados)`);
console.log(`logo-cutout-web.png  ${c.width}x${c.height}  (leve, para usar na interface)`);
