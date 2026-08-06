# Lang Learner

Free, open-source language-learning app. Currently: **Czech, A1 → B2**, with a bite-sized "Learn" track and CCE-B2 exam-prep practice. Static HTML/CSS/JS, no build step, no backend — runs anywhere, including GitHub Pages.

- `index.html` / `css/style.css` / `js/app.js` — the app
- `data/cs-lessons.json` — Learn-track lesson content (vocab, grammar notes, check questions)
- `data/cs-b2.json` — CCE-B2 exam-prep item bank (reading, grammar, vocab, writing prompts)
- `CURRICULUM.md` — the full A1→B2 roadmap this app is built around

See `CURRICULUM.md` for the learning path and how it maps to lesson content still to be written.

## Roadmap / TODO

**Now:**
- [ ] Cross-device progress sync (lightweight account, no password fatigue)
- [ ] Finish A1 end-to-end (remaining ~10 lessons per `CURRICULUM.md`)
- [ ] Scheduled job that drafts new lesson/question content on a cadence, for human review before publishing

**Later (not started, intentionally deferred):**
- [ ] Live multiplayer / social practice sessions
- [ ] AI tutor chat for in-lesson questions
- [ ] Listening (audio comprehension) section, once Learn track core is solid
- [ ] Additional languages beyond Czech (architecture already supports it — see `LANGUAGES` in `js/app.js`)
