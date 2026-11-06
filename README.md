# Блог Фотобюджета

Статические страницы блога https://budget.amamontov.site/blog/ (Netlify проксирует `/blog/*` на GitHub Pages этого репозитория).

- `articles/*.md` — опубликованные статьи, `drafts/` — черновики (не в репозитории)
- `npm run build` → `docs/` (GitHub Pages: ветка main, папка /docs); `node src/build.mjs --drafts` — со черновиками для просмотра
- `npm run serve` → http://localhost:8812/blog/
