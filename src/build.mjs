// Сборка блога Фотобюджета: articles/*.md → docs/ (GitHub Pages).
// Читатели видят блог на https://budget.amamontov.site/blog/ (Netlify проксирует /blog/* сюда),
// поэтому все ссылки абсолютные от /blog/, а шрифты берутся с основного сайта (/fonts/…).
// Формат статьи: шапка «ключ: значение» между строками ---, дальше Markdown:
//   ## / ### заголовки, абзацы, списки - и 1., таблицы |, **жирный**, [ссылка](url)
//   > абзац — блок «Коротко» (чек), ::: cta — кнопка в бот, ## Вопросы и ответы → FAQ (### вопрос + ответ)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs');
const SITE = 'https://budget.amamontov.site';
const BASE = '/blog/';
const BOT = 'https://t.me/photobudget_bot';
const AUTHOR = { name: 'Александр Мамонтов', url: 'https://amamontov.site/' };

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const ruDate = d => `${+d.slice(8, 10)} ${MONTHS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;
const slugify = s => s.toLowerCase().replace(/[^\p{L}\d]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60);

function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g, (m, t, u) => `<a href="${u}"${/^https?:/.test(u) && !u.startsWith(SITE) ? ' rel="noopener"' : ''}>${t}</a>`);
}

function parse(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: нет шапки ---`);
  // Значения можно брать в кавычки (так GitHub показывает шапку без ошибок, если в заголовке есть двоеточие)
  const val = v => (/^".*"$/.test(v) ? JSON.parse(v) : v);
  const meta = Object.fromEntries(m[1].split('\n').filter(Boolean).map(l => { const i = l.indexOf(':'); return [l.slice(0, i).trim(), val(l.slice(i + 1).trim())]; }));
  for (const k of ['title', 'description', 'slug', 'date', 'topic']) if (!meta[k]) throw new Error(`${file}: нет поля ${k}`);
  meta.updated ||= meta.date;
  if (/[ёЁ]|—/.test(raw)) throw new Error(`${file}: есть «ё» или длинное тире`);
  return { ...meta, body: m[2] };
}

// Markdown → { html, toc, faq, words }
function render(md) {
  const lines = md.split('\n');
  const out = [], toc = [], faq = [];
  let i = 0, inFaq = false, words = 0;
  const para = [];
  const flush = () => { if (para.length) { const t = para.join(' '); words += t.split(/\s+/).length; out.push(`<p>${inline(t)}</p>`); if (inFaq && faq.length) faq[faq.length - 1].a.push(t); para.length = 0; } };
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { flush(); i++; continue; }
    let h;
    if ((h = l.match(/^## (.+)/))) {
      flush();
      inFaq = /^Вопросы и ответы/.test(h[1]);
      const id = slugify(h[1]);
      toc.push({ id, t: h[1] });
      out.push(`<h2 id="${id}">${inline(h[1])}</h2>`);
      i++; continue;
    }
    if ((h = l.match(/^### (.+)/))) {
      flush();
      if (inFaq) faq.push({ q: h[1], a: [] });
      out.push(`<h3>${inline(h[1])}</h3>`);
      i++; continue;
    }
    if (/^> /.test(l)) {
      flush();
      const box = [];
      while (i < lines.length && /^> ?/.test(lines[i])) box.push(lines[i++].replace(/^> ?/, ''));
      words += box.join(' ').split(/\s+/).length;
      out.push(`<aside class="short"><div class="k">Коротко</div><p>${inline(box.join(' '))}</p></aside>`);
      continue;
    }
    if (/^::: cta/.test(l)) {
      flush();
      const t = []; i++;
      while (i < lines.length && !/^:::/.test(lines[i])) t.push(lines[i++]);
      i++;
      out.push(`<aside class="cta"><p>${inline(t.join(' '))}</p><a class="btn" href="${BOT}">Попробовать в Телеграме <span>→</span></a></aside>`);
      continue;
    }
    if (/^\|/.test(l)) {
      flush();
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      // Столбец из сумм и процентов — по правому краю
      const isNum = c => /^[*≈−+\-\d\s.,%₽$€₫]+$/.test(c.replace(/\*\*/g, '')) && /\d/.test(c);
      const numCol = head.map((_, k) => body.length && body.every(r => isNum(r[k] || '')));
      const cls = k => (numCol[k] ? ' class="n"' : '');
      out.push(`<div class="tbl"><table><thead><tr>${head.map((c, k) => `<th${cls(k)}>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.map((c, k) => `<td${cls(k)}>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^(- |\d+\. )/.test(l)) {
      flush();
      const ol = /^\d+\. /.test(l);
      const items = [];
      while (i < lines.length && /^(- |\d+\. )/.test(lines[i])) items.push(lines[i++].replace(/^(- |\d+\. )/, ''));
      words += items.join(' ').split(/\s+/).length;
      out.push(`<${ol ? 'ol' : 'ul'}>${items.map(t => `<li>${inline(t)}</li>`).join('')}</${ol ? 'ol' : 'ul'}>`);
      if (inFaq && faq.length) faq[faq.length - 1].a.push(items.join('; '));
      continue;
    }
    para.push(l.trim());
    i++;
  }
  flush();
  return { html: out.join('\n'), toc, faq, words };
}

const head = ({ title, description, url, type = 'website', jsonld, image = `${SITE}/og.jpg` }) => `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#18191b">
<meta property="og:type" content="${type}">
<meta property="og:locale" content="ru_RU">
<meta property="og:site_name" content="Фотобюджет">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${image}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" sizes="192x192" href="/favicon-192.png">
<link rel="alternate" type="application/rss+xml" title="Блог Фотобюджета" href="${SITE}${BASE}rss.xml">
<link rel="stylesheet" href="${BASE}blog.css">
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
</head>`;

const nav = `<header class="nav"><a class="mark" href="/"><i></i>Фотобюджет</a><nav><a href="${BASE}">Блог</a><a class="go" href="${BOT}">Открыть бота</a></nav></header>`;
const foot = `<footer class="foot"><div class="k">© 2026 Фотобюджет</div><div class="k"><a href="/">Главная</a> · <a href="${BASE}">Блог</a> · <a href="${BASE}rss.xml">RSS</a> · <a href="https://amamontov.site/">Сделано в amamontov.site</a></div></footer>`;

function articlePage(a, all) {
  const url = `${SITE}${BASE}${a.slug}/`;
  const { html, toc, faq, words } = render(a.body);
  const minutes = Math.max(2, Math.round(words / 180));
  const related = all.filter(x => x.slug !== a.slug).slice(0, 3);
  const jsonld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'Article', headline: a.title, description: a.description, datePublished: a.date, dateModified: a.updated, inLanguage: 'ru',
      mainEntityOfPage: url, image: `${SITE}/og.jpg`, author: { '@type': 'Person', ...AUTHOR }, publisher: { '@type': 'Organization', name: 'Фотобюджет', url: `${SITE}/` } },
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Фотобюджет', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Блог', item: `${SITE}${BASE}` },
      { '@type': 'ListItem', position: 3, name: a.title, item: url }] },
    ...(faq.length ? [{ '@type': 'FAQPage', mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a.join(' ').replace(/\*\*/g, '') } })) }] : []),
  ] };
  return `${head({ title: `${a.title} | Фотобюджет`, description: a.description, url, type: 'article', jsonld })}
<body>
${nav}
<main class="art">
  <div class="crumbs k"><a href="/">Фотобюджет</a> / <a href="${BASE}">Блог</a> / ${esc(a.topic)}</div>
  <h1>${inline(a.title)}</h1>
  <div class="meta k"><span>${esc(AUTHOR.name)}</span><span>Опубликовано ${ruDate(a.date)}</span>${a.updated !== a.date ? `<span>Обновлено ${ruDate(a.updated)}</span>` : ''}<span>${minutes} мин</span></div>
  ${toc.length > 2 ? `<nav class="toc"><div class="k">Содержание</div><ol>${toc.map(t => `<li><a href="#${t.id}">${inline(t.t)}</a></li>`).join('')}</ol></nav>` : ''}
  <article class="body">
${html}
  </article>
  <aside class="author"><div class="k">Автор</div><p><b>${esc(AUTHOR.name)}</b>. Живем с женой в Нячанге и ведем семейный бюджет в донгах и рублях. Сделал Фотобюджет сначала для нашей семьи, потом открыл всем.</p></aside>
  ${related.length ? `<section class="more"><div class="k">Еще в блоге</div>${related.map(r => `<a class="card" href="${BASE}${r.slug}/"><span class="k">${esc(r.topic)}</span><b>${esc(r.title)}</b></a>`).join('')}</section>` : ''}
</main>
${foot}
</body>
</html>
`;
}

function indexPage(all) {
  const url = `${SITE}${BASE}`;
  const jsonld = { '@context': 'https://schema.org', '@type': 'Blog', name: 'Блог Фотобюджета', url, inLanguage: 'ru',
    blogPost: all.map(a => ({ '@type': 'BlogPosting', headline: a.title, url: `${url}${a.slug}/`, datePublished: a.date })) };
  return `${head({ title: 'Блог Фотобюджета: семейный бюджет, цены и деньги за границей', description: 'Как вести семейный бюджет, сколько можно тратить в день, цены и деньги во Вьетнаме и других странах. Пишем по своим чекам.', url, jsonld })}
<body>
${nav}
<main class="list">
  <h1>Блог</h1>
  <p class="lead">Семейный бюджет без таблиц, цены и деньги за границей. Пишем по своим чекам и своему опыту.</p>
  ${all.map(a => `<a class="row" href="${BASE}${a.slug}/"><span class="k">${esc(a.topic)} · ${ruDate(a.date)}</span><b>${esc(a.title)}</b><span class="d">${esc(a.description)}</span></a>`).join('\n  ')}
</main>
${foot}
</body>
</html>
`;
}

const sitemap = all => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}${BASE}</loc><lastmod>${all[0]?.updated || ''}</lastmod></url>
${all.map(a => `  <url><loc>${SITE}${BASE}${a.slug}/</loc><lastmod>${a.updated}</lastmod></url>`).join('\n')}
</urlset>
`;

const rss = all => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Блог Фотобюджета</title><link>${SITE}${BASE}</link><description>Семейный бюджет, цены и деньги за границей</description><language>ru</language>
${all.map(a => `<item><title>${esc(a.title)}</title><link>${SITE}${BASE}${a.slug}/</link><guid>${SITE}${BASE}${a.slug}/</guid><pubDate>${new Date(a.date + 'T09:00:00+07:00').toUTCString()}</pubDate><description>${esc(a.description)}</description></item>`).join('\n')}
</channel></rss>
`;

// ---------- сборка ----------
// Черновики лежат в drafts/ (не в репозитории); --drafts собирает их для просмотра. Одобрили — файл переезжает в articles/.
const dirs = ['articles', ...(process.argv.includes('--drafts') ? ['drafts'] : [])];
const all = dirs.flatMap(d => fs.existsSync(path.join(ROOT, d)) ? fs.readdirSync(path.join(ROOT, d)).filter(f => f.endsWith('.md')).map(f => parse(path.join(ROOT, d, f))) : [])
  .sort((a, b) => (a.date < b.date ? 1 : -1));
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.copyFileSync(path.join(ROOT, 'src', 'blog.css'), path.join(OUT, 'blog.css'));
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
fs.writeFileSync(path.join(OUT, 'index.html'), indexPage(all));
for (const a of all) {
  fs.mkdirSync(path.join(OUT, a.slug), { recursive: true });
  fs.writeFileSync(path.join(OUT, a.slug, 'index.html'), articlePage(a, all));
}
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), sitemap(all));
fs.writeFileSync(path.join(OUT, 'rss.xml'), rss(all));
console.log(`статей: ${all.length} → docs/`);
