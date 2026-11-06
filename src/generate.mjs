// Генератор черновика статьи: берет следующую тему из topics.json и пишет текст через Gemini.
//   GEMINI_API_KEY=… node src/generate.mjs [--slug=…] [--out=articles|drafts]
// Пишет файл <out>/<slug>.md и печатает его путь. Ничего не публикует: публикация = одобрение (merge PR).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY;
const MODELS = (process.env.GEMINI_MODELS || 'gemini-3.6-flash,gemini-flash-latest,gemini-3.1-flash-lite').split(',');
const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1];
const OUT = arg('out') || 'articles';
if (!KEY) throw new Error('нет GEMINI_API_KEY');

const published = new Set(['articles', 'drafts'].flatMap(d => fs.existsSync(path.join(ROOT, d)) ? fs.readdirSync(path.join(ROOT, d)) : []).map(f => f.replace(/\.md$/, '')));
const { topics } = JSON.parse(fs.readFileSync(path.join(ROOT, 'topics.json'), 'utf8'));
const t = arg('slug') ? topics.find(x => x.slug === arg('slug')) : topics.find(x => !published.has(x.slug));
if (!t) { console.log('NO_TOPIC'); process.exit(0); }

const SYSTEM = `Ты пишешь статью для блога «Фотобюджет» (budget.amamontov.site/blog/). Автор: Александр Мамонтов, живет с женой в Нячанге (Вьетнам), они ведут семейный бюджет вдвоем. Читатель: русскоязычная семья в России или за границей.

Жесткие правила текста:
- Никогда не используй букву «ё», только «е». Никогда не используй длинное тире «—» и среднее «–»: вместо них двоеточие, запятая или новое предложение. Дефис только внутри слов.
- Никаких цифр, процентов и фактов, кроме тех, что даны в разделе «Факты», и условных примеров. Условный пример помечай один раз в начале («Условный пример:» или «Пример:»), не повторяй «условно» у каждой цифры. Не ставь двоеточие вместо тире внутри предложения («а второй: 60 000»), лучше перестрой фразу. Не придумывай исследования, опросы, цитаты экспертов, истории читателей и случаи из жизни автора.
- Факты из раздела «Факты» приводи с ссылкой на источник в формате Markdown: ([источник](URL)).
- Пиши просто и конкретно, как для друга: короткие абзацы по 2–4 предложения, без воды, без канцелярита, без «в современном мире», «важно отметить», «таким образом».
- Обращение на «вы». Без восклицательных знаков и смайлов.
- Не обещай доходность и не давай инвестиционных советов.

Формат ответа: только тело статьи в Markdown, без заголовка H1 и без шапки.
1. Первым идет блок «Коротко»: одна строка, начинается с «> », 40–60 слов, прямой ответ на главный вопрос статьи с конкретным советом (не «все зависит»).
2. Дальше 4–6 разделов «## Заголовок» (заголовки как вопросы или запросы людей), в них абзацы, списки «- » или «1. », таблицы Markdown (| … |, вторая строка |---|).
3. Минимум одна таблица.
4. Ровно один блок призыва в середине или ближе к концу, строго в таком виде (три строки):
::: cta
Одно-два предложения: как с этим помогает Фотобюджет (бот в Телеграме: фото чека разбирается по строчкам, бюджет сам считает лимит на день, вторая половина видит траты; пока бесплатно, так и пиши: «пока бесплатно»).
:::
5. Последний раздел «## Вопросы и ответы»: 4–5 вопросов «### Вопрос?» и ответ 2–4 предложения под каждым.
6. Объем 900–1300 слов. Жирным (**…**) выделяй только ключевые мысли в начале пунктов списка.`;

const USER = `Тема: ${t.title}
Описание: ${t.description}
Что ищут люди (Wordstat): ${t.keywords}
Подход и что обязательно раскрыть: ${t.angle}
Факты (только их можно использовать как цифры):
${t.facts.length ? t.facts.map(f => `- ${f}`).join('\n') : '- нет; используй только условные примеры'}`;

// Чистка того, что модель часто нарушает
const clean = s => s.replace(/\r/g, '').replace(/ё/g, 'е').replace(/Ё/g, 'Е')
  .replace(/\s+[—–]\s+это\s+/g, ' это ').replace(/\s+[—–]\s+/g, ', ').replace(/[—–]/g, '-').replace(/^```(?:markdown)?\n|```\s*$/g, '').trim();

function problems(md) {
  const p = [];
  if (!/^> \S/.test(md)) p.push('первая строка должна быть блоком «> » (Коротко)');
  const h2 = (md.match(/^## /gm) || []).length;
  if (h2 < 5) p.push(`мало разделов ## (${h2})`);
  if (!/^## Вопросы и ответы/m.test(md)) p.push('нет раздела «## Вопросы и ответы»');
  else if ((md.split(/^## Вопросы и ответы/m)[1].match(/^### /gm) || []).length < 3) p.push('в «Вопросах и ответах» меньше 3 вопросов');
  if ((md.match(/^::: cta$/gm) || []).length !== 1) p.push('нужен ровно один блок ::: cta');
  if (!/^\|.*\|\n\|[-| :]+\|/m.test(md)) p.push('нет таблицы');
  if (/^# /m.test(md)) p.push('не нужен заголовок H1');
  const vague = md.match(/эксперт\w*|исследовани\w* показ\w*|ученые|по статистике|статистика показ\w*|специалисты (советуют|рекомендуют)|многие (финансисты|психологи)/gi);
  if (vague) p.push(`ссылки на выдуманные авторитеты (${[...new Set(vague)].join(', ')}): убрать или заменить фактом из списка`);
  const words = md.split(/\s+/).length;
  if (words < 700) p.push(`слишком коротко (${words} слов)`);
  if (/\d+[.,]?\d*\s*%/.test(md.replace(/\(\[источник\][^)]*\)/g, '')) && !t.facts.length && !/услов|пример/i.test(md)) p.push('проценты без фактов и без пометки «условно»');
  return p;
}

async function gemini(model, contents) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify({ system_instruction: { parts: [{ text: SYSTEM }] }, contents, generationConfig: { temperature: 0.6, maxOutputTokens: 8192 } }),
    signal: AbortSignal.timeout(120000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${model}: ${r.status} ${data.error?.message || ''}`.slice(0, 200));
  return (data.candidates?.[0]?.content?.parts || []).map(x => x.text || '').join('');
}

let md = '', used = '';
const contents = [{ role: 'user', parts: [{ text: USER }] }];
for (let attempt = 0; attempt < 3; attempt++) {
  let err;
  for (const model of MODELS) {
    try { md = clean(await gemini(model, contents)); used = model; err = null; break; } catch (e) { err = e; console.error(String(e.message)); }
  }
  if (err) throw err;
  const p = problems(md);
  if (!p.length) break;
  console.error(`попытка ${attempt + 1}: ${p.join('; ')}`);
  if (attempt === 2) throw new Error(`черновик не прошел проверку: ${p.join('; ')}`);
  contents.push({ role: 'model', parts: [{ text: md }] }, { role: 'user', parts: [{ text: `Исправь и пришли статью целиком заново. Проблемы: ${p.join('; ')}.` }] });
}

const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10); // день по Нячангу
const file = path.join(ROOT, OUT, `${t.slug}.md`);
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, `---\ntitle: ${t.title}\ndescription: ${t.description}\nslug: ${t.slug}\ndate: ${today}\ntopic: ${t.topic}\n---\n${md}\n`);
console.log(`OK ${path.relative(ROOT, file)} ${used} ${md.split(/\s+/).length} слов`);
