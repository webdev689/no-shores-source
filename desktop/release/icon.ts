// Writes the app's icon, `out/resources/icon.png`, for the installers to make each platform's own from: the logo's
// first letter on the night with the moon's halo, drawn by the site's own code as the Discord server's icon is, so the
// app, the site and the server wear one mark and no picture is kept in git.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { serverIconSheet } from '../../site/src/art/logo.ts';
import { pngOf } from '../../site/src/art/sheet.ts';

const out = path.join(import.meta.dirname, '..', 'out', 'resources', 'icon.png');
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, pngOf(serverIconSheet()));
console.log(`wrote ${path.relative(process.cwd(), out)}`);
