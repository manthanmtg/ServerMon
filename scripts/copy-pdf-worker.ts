import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const bundledWorker = require.resolve('pdfjs-dist/build/pdf.worker.min.mjs');
const publicWorker = path.resolve('public', path.basename(bundledWorker));
mkdirSync(path.dirname(publicWorker), { recursive: true });
copyFileSync(bundledWorker, publicWorker);
console.log(`Copied ${path.relative(process.cwd(), bundledWorker)} to public/`);
