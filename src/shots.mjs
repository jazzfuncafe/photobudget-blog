// Скрины блога (нужен node src/serve.mjs): node src/shots.mjs [slug]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '/Users/aleksandrmamontov/claude/fitness-site/regru/tools/cdp.mjs';
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../out');
const slug = process.argv[2] || 'kak-vesti-semeynyy-byudzhet';
const c = await launch();
try {
  for (const [name, w, h, m, s] of [['desk', 1440, 900, false, 1], ['mob', 390, 844, true, 2]]) {
    await c.viewport(w, h, m, s);
    await c.go(`http://localhost:8812/blog/${slug}/`, 800);
    await c.shot(path.join(OUT, `${slug}-${name}.jpg`), { full: true, quality: 80 });
    await c.go('http://localhost:8812/blog/', 600);
    await c.shot(path.join(OUT, `index-${name}.jpg`), { quality: 80 });
  }
  if (c.errors.length) console.log('! ошибки:', c.errors.join('; '));
} finally { c.close(); }
console.log('ok');
