// Renders the app icons from the VidFriends mark (the web favicon): iOS/Android icon, Android
// adaptive foreground/background/monochrome, and the splash mark. Run from the repo root:
//   node apps/mobile/scripts/icons.mjs     (uses sharp from apps/server)
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../server/package.json', import.meta.url));
const sharp = require('sharp');
const out = (name) => fileURLToPath(new URL(`../assets/${name}`, import.meta.url));
const PURPLE = '#7c3aed';
const play = (size, fill, scale = 1) => {
  // The play triangle of the web mark (M24 18v28l22-14z on a 64 grid), scaled about the centre.
  const k = (size / 64) * scale;
  const o = (size - 64 * k) / 2;
  const p = (x, y) => `${o + x * k},${o + y * k}`;
  return `<path d="M${p(24, 18)} L${p(24, 46)} L${p(46, 32)} Z" fill="${fill}"/>`;
};
const svg = (size, body) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${body}</svg>`,
  );

await sharp(svg(1024, `<rect width="1024" height="1024" fill="${PURPLE}"/>${play(1024, '#fff')}`))
  .png()
  .toFile(out('icon.png'));
// Adaptive icons: the system masks a 108 dp canvas; keep the mark inside the 66 dp safe zone.
await sharp(svg(512, play(512, '#fff', 0.7)))
  .png()
  .toFile(out('android-icon-foreground.png'));
await sharp(svg(512, `<rect width="512" height="512" fill="${PURPLE}"/>`))
  .png()
  .toFile(out('android-icon-background.png'));
await sharp(svg(432, play(432, '#000', 0.7)))
  .png()
  .toFile(out('android-icon-monochrome.png'));
await sharp(
  svg(
    1024,
    `<rect x="256" y="256" width="512" height="512" rx="112" fill="${PURPLE}"/>${play(1024, '#fff', 0.5)}`,
  ),
)
  .png()
  .toFile(out('splash-icon.png'));
await sharp(svg(48, `<rect width="48" height="48" rx="10" fill="${PURPLE}"/>${play(48, '#fff')}`))
  .png()
  .toFile(out('favicon.png'));
