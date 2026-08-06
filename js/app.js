/* ── Lang Learner — multi-language exam-prep app ── */

/* Registry of available language content packs. Adding a new language later
   is just: drop a new data/xx-yy.json following the same item schema, add
   one entry here. */
const LANGUAGES = [
  { code: 'cs', name: 'Czech', flag: '🇨🇿', file: 'data/cs-b2.json', lessonsFile: 'data/cs-lessons.json' }
];
const ACTIVE_LANGUAGE = LANGUAGES[0];

const SECTION_INFO = {
  reading: { name: 'Čtení s porozuměním', short: 'Reading',  color: '#2563eb' },
  grammar: { name: 'Gramaticko-lexikální test', short: 'Grammar', color: '#16a34a' },
  vocab:   { name: 'Slovní zásoba', short: 'Vocabulary', color: '#9333ea' },
  writing: { name: 'Psaní', short: 'Writing', color: '#d97706' }
};

const AVATARS = ['🧑‍💻','👩‍💻','🧑‍🎓','👩‍🎓','🧑‍🏫','👨‍🏫','🦉','🐺','🦊','🐯','🚀','⚡','🎯','🏆','📚','✍️'];

/* Inline SVG speaker icon — renders identically everywhere, unlike the 🔊
   emoji glyph which varies wildly by OS/browser font. */
const ICON_SPEAKER = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 9v6h4l5 5V4L8 9H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M19 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity="0.6"/></svg>';

/* ── localStorage keys ── */
const LS_PROFILE  = 'lang_profile';
const LS_HISTORY  = 'lang_history';
const LS_SESSION  = 'lang_session';
const LS_PROGRESS = 'lang_lesson_progress'; // { [lessonId]: { done: true, pct: 100 } }

/* ── State ── */
let items      = [];   // all gradable items (excludes 'writing' reference items)
let writingItems = [];
let shuffled   = [];
let current    = 0;
let score      = 0;
let answered   = false;
let qResults   = [];   // {itemId, section, correct}
let totalStart = 0;

let activeMode    = 'full';
let activeSections = new Set(['reading', 'grammar', 'vocab']);

/* ── Learn-track state ── */
let appMode = 'learn'; // 'learn' | 'exam'
let levels = [];
let currentLevel = null;
let currentLesson = null;
let lcQueue = [];      // this lesson's check items, shuffled
let lcCurrent = 0;
let lcScore = 0;
let lcAnswered = false;

/* ── DOM refs ── */
const startScreen    = document.getElementById('startScreen');
const quizScreen     = document.getElementById('quizScreen');
const writingScreen  = document.getElementById('writingScreen');
const resultScreen   = document.getElementById('resultScreen');
const profileModal   = document.getElementById('profileModal');
const startBtn       = document.getElementById('startBtn');
const nextBtn        = document.getElementById('nextBtn');
const retakeBtn      = document.getElementById('retakeBtn');
const backToStartBtn = document.getElementById('backToStartBtn');
const reviewToggle   = document.getElementById('reviewToggleBtn');
const loadError      = document.getElementById('loadError');
const resumeBanner   = document.getElementById('resumeBanner');

const learnHomeScreenEl     = document.getElementById('learnHomeScreen');
const lessonScreenEl        = document.getElementById('lessonScreen');
const lessonCheckScreenEl   = document.getElementById('lessonCheckScreen');
const lessonCompleteScreenEl = document.getElementById('lessonCompleteScreen');

/* ── Boot ── */
window.addEventListener('DOMContentLoaded', () => {
  buildAvatarGrid();
  document.getElementById('langBadge').textContent = ACTIVE_LANGUAGE.flag + ' ' + ACTIVE_LANGUAGE.name;

  fetch(ACTIVE_LANGUAGE.file)
    .then(r => { if (!r.ok) throw new Error(); return r.json(); })
    .then(data => {
      const raw = data.items;
      items = raw.filter(it => it.section !== 'writing');
      writingItems = raw.filter(it => it.section === 'writing');
      // resolve passage refs so ref-based items carry the full passage inline
      items.forEach(it => { it._passage = resolvePassage(it, raw); });

      document.getElementById('totalBadge').textContent = items.length + ' Items';
      buildSectionChips();
      buildWritingList();
      updateSummary();
      initProfile();
      checkResumable();
      startBtn.addEventListener('click', startPractice);
    })
    .catch(() => {
      startBtn.disabled = true;
      loadError.style.display = 'block';
    });

  fetch(ACTIVE_LANGUAGE.lessonsFile)
    .then(r => { if (!r.ok) throw new Error(); return r.json(); })
    .then(data => {
      levels = data.levels;
      renderLevelPath();
    })
    .catch(() => {
      document.getElementById('levelPath').innerHTML = '<p class="load-error">Could not load lesson data.</p>';
    });

  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => setAppMode(tab.dataset.appMode));
  });
  document.getElementById('lessonBackBtn').addEventListener('click', () => { hide(lessonScreenEl); show(learnHomeScreenEl); });
  document.getElementById('lessonCheckBackBtn').addEventListener('click', () => {
    if (!confirm('Exit this check? Your progress on it will be lost.')) return;
    hide(lessonCheckScreenEl); show(lessonScreenEl);
  });
  document.getElementById('lcNextBtn').addEventListener('click', lcNextItem);
  document.getElementById('lcNextLessonBtn').addEventListener('click', goToNextLesson);
  document.getElementById('lcBackToLessonsBtn').addEventListener('click', () => { hide(lessonCompleteScreenEl); show(learnHomeScreenEl); });
  document.getElementById('learnEditProfileBtn').addEventListener('click', openProfileModal);

  nextBtn.addEventListener('click', nextItem);
  retakeBtn.addEventListener('click', startPractice);
  backToStartBtn.addEventListener('click', () => { hide(resultScreen); show(startScreen); });
  reviewToggle.addEventListener('click', toggleReview);

  document.getElementById('backBtn').addEventListener('click', () => exitToStart(true));
  document.getElementById('writingBackBtn').addEventListener('click', () => { hide(writingScreen); show(startScreen); });
  document.getElementById('resumeBtn').addEventListener('click', resumeSession);
  document.getElementById('discardBtn').addEventListener('click', discardSession);
  document.getElementById('editProfileBtn').addEventListener('click', openProfileModal);
  document.getElementById('profileSaveBtn').addEventListener('click', saveProfile);
  document.getElementById('profileNameInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveProfile();
  });

  /* mode buttons */
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeMode = btn.dataset.mode;
      document.getElementById('sectionFilter').style.display = activeMode === 'section' ? 'block' : 'none';
      if (activeMode === 'writing') {
        startBtn.textContent = 'Open writing prompts →';
      } else {
        startBtn.textContent = 'Start practice →';
      }
      updateSummary();
    });
  });
});

/* ── Passage resolution ── */
function resolvePassage(item, raw) {
  if (!item.passage) return null;
  if (item.passage.ref) {
    const source = raw.find(x => x.id === item.passage.ref);
    return source ? source.passage : null;
  }
  return item.passage;
}

/* ── Profile ── */
function buildAvatarGrid() {
  const grid = document.getElementById('avatarGrid');
  AVATARS.forEach((av, i) => {
    const btn = document.createElement('button');
    btn.className = 'avatar-opt' + (i === 0 ? ' selected' : '');
    btn.textContent = av;
    btn.dataset.av = av;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.avatar-opt').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
    grid.appendChild(btn);
  });
}

function getProfile() {
  try { return JSON.parse(localStorage.getItem(LS_PROFILE)) || null; } catch { return null; }
}

function initProfile() {
  const p = getProfile();
  if (!p) openProfileModal(true);
  else renderProfileBar(p);
}

function openProfileModal(isFirst = false) {
  const p = getProfile();
  if (p) {
    document.getElementById('profileNameInput').value = p.name;
    document.querySelectorAll('.avatar-opt').forEach(b => b.classList.toggle('selected', b.dataset.av === p.avatar));
  }
  profileModal.style.display = 'flex';
  profileModal.querySelector('.modal-title').textContent = isFirst ? "Welcome! Let's set up your profile" : 'Edit your profile';
  setTimeout(() => document.getElementById('profileNameInput').focus(), 100);
}

function saveProfile() {
  const name = document.getElementById('profileNameInput').value.trim();
  if (!name) { document.getElementById('profileNameInput').focus(); return; }
  const avatar = document.querySelector('.avatar-opt.selected')?.dataset.av || AVATARS[0];
  const existing = getProfile();
  const profile = { name, avatar, createdAt: existing?.createdAt || Date.now() };
  localStorage.setItem(LS_PROFILE, JSON.stringify(profile));
  profileModal.style.display = 'none';
  renderProfileBar(profile);
}

function renderProfileBar(p) {
  document.getElementById('profileBar').style.display = 'flex';
  document.getElementById('profileAvatar').textContent = p.avatar;
  document.getElementById('profileName').textContent = p.name;

  document.getElementById('learnProfileInfo').style.display = 'flex';
  document.getElementById('learnEditProfileBtn').style.display = 'inline-flex';
  document.getElementById('learnProfileAvatar').textContent = p.avatar;
  document.getElementById('learnProfileName').textContent = p.name;

  const history = getHistory();
  if (history.length > 0) {
    const best = Math.max(...history.map(h => h.pct));
    document.getElementById('profileBest').textContent = 'Best: ' + best + '%';
    document.getElementById('profileAttempts').textContent = history.length + ' session' + (history.length === 1 ? '' : 's');
  } else {
    document.getElementById('profileBest').textContent = 'No sessions yet';
    document.getElementById('profileAttempts').textContent = '';
  }
}

/* ── Score history ── */
function getHistory() {
  try { return JSON.parse(localStorage.getItem(LS_HISTORY)) || []; } catch { return []; }
}
function saveHistoryEntry(entry) {
  const h = getHistory();
  h.unshift(entry);
  localStorage.setItem(LS_HISTORY, JSON.stringify(h.slice(0, 50)));
}
function renderHistory() {
  const el = document.getElementById('scoreHistory');
  const h = getHistory();
  if (h.length === 0) { el.innerHTML = '<p class="history-empty">No sessions yet — this is your first one!</p>'; return; }
  el.innerHTML = h.slice(0, 10).map(e => {
    const d = new Date(e.date);
    const dateStr = (d.getMonth()+1) + '/' + d.getDate();
    return `<div class="hist-row">
      <span class="hist-date">${dateStr}</span>
      <span class="hist-mode">${e.mode}</span>
      <span class="hist-score ${e.pct >= 70 ? 'hist-pass' : 'hist-fail'}">${e.pct}%</span>
      <span class="hist-detail">${e.correct}/${e.total}</span>
    </div>`;
  }).join('');
}

/* ── Session persistence ── */
function saveSessionCheckpoint() {
  localStorage.setItem(LS_SESSION, JSON.stringify({
    shuffledIds: shuffled.map(q => q.id),
    current, score, qResults, totalStart,
    savedAt: Date.now()
  }));
}
function clearSession() { localStorage.removeItem(LS_SESSION); }

function checkResumable() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_SESSION));
    if (!s || !s.shuffledIds || s.current >= s.shuffledIds.length) { clearSession(); return; }
    const age = Date.now() - s.savedAt;
    if (age > 30 * 24 * 60 * 60 * 1000) { clearSession(); return; }
    const remaining = s.shuffledIds.length - s.current;
    document.getElementById('resumeDetail').textContent =
      `Item ${s.current + 1} of ${s.shuffledIds.length} · ${remaining} remaining · Score so far: ${s.score}/${s.current}`;
    resumeBanner.style.display = 'block';
  } catch { clearSession(); }
}

function resumeSession() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_SESSION));
    shuffled  = s.shuffledIds.map(id => items.find(q => q.id === id)).filter(Boolean);
    current   = s.current;
    score     = s.score;
    qResults  = s.qResults;
    totalStart = s.totalStart;
    resumeBanner.style.display = 'none';
    hide(startScreen); hide(resultScreen);
    document.getElementById('reviewSection').style.display = 'none';
    show(quizScreen);
    loadItem();
  } catch { discardSession(); }
}
function discardSession() { clearSession(); resumeBanner.style.display = 'none'; }

/* ── Filter / start ── */
function getFilteredItems() {
  if (activeMode === 'full')    return items;
  if (activeMode === 'section') return items.filter(q => activeSections.has(q.section));
  return items;
}

function buildSectionChips() {
  const row = document.getElementById('sectionChipRow');
  row.innerHTML = '';
  ['reading', 'grammar', 'vocab'].forEach(sec => {
    const count = items.filter(q => q.section === sec).length;
    const info = SECTION_INFO[sec];
    const chip = document.createElement('button');
    chip.className = 'chip active';
    chip.innerHTML = info.short + ' <span class="chip-sub">(' + count + ')</span>';
    chip.addEventListener('click', () => {
      if (activeSections.has(sec)) {
        if (activeSections.size > 1) { activeSections.delete(sec); chip.classList.remove('active'); }
      } else { activeSections.add(sec); chip.classList.add('active'); }
      updateSummary();
    });
    row.appendChild(chip);
  });
}

function updateSummary() {
  const el = document.getElementById('selectionSummary');
  if (activeMode === 'writing') {
    el.textContent = writingItems.length + ' writing prompt' + (writingItems.length === 1 ? '' : 's') + ' available for reference';
    el.className = 'selection-summary';
    startBtn.disabled = writingItems.length === 0;
    return;
  }
  const pool = getFilteredItems();
  if (pool.length === 0) {
    el.textContent = 'No items match — select at least one section above.';
    el.className = 'selection-summary selection-empty';
    startBtn.disabled = true;
  } else {
    el.textContent = pool.length + ' item' + (pool.length === 1 ? '' : 's') + ' in this session';
    el.className = 'selection-summary';
    startBtn.disabled = false;
  }
}

function startPractice() {
  if (activeMode === 'writing') { openWritingScreen(); return; }
  const pool = getFilteredItems();
  if (pool.length === 0) return;
  clearSession();
  shuffled = shuffle(pool);
  current = 0; score = 0; qResults = [];
  totalStart = Date.now();
  hide(startScreen); hide(resultScreen);
  document.getElementById('reviewSection').style.display = 'none';
  show(quizScreen);
  loadItem();
}

function exitToStart(confirmFirst) {
  if (confirmFirst && !confirm('Exit practice? Your progress will be saved and you can resume later.')) return;
  saveSessionCheckpoint();
  hide(quizScreen);
  show(startScreen);
  checkResumable();
}

/* ── Writing reference screen ── */
function buildWritingList() {
  const el = document.getElementById('writingList');
  el.innerHTML = writingItems.map(w => `
    <div class="writing-card">
      <p class="writing-card-title">${w.title}</p>
      <p class="writing-card-prompt">${w.prompt}</p>
      <ul class="writing-rubric">${w.rubric.map(r => '<li>' + r + '</li>').join('')}</ul>
      <div class="topic-box">
        <p class="topic-heading">📘 How to use this</p>
        <div><p>${w.note}</p></div>
      </div>
    </div>
  `).join('');
}
function openWritingScreen() {
  hide(startScreen);
  show(writingScreen);
}

/* ── Helpers ── */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function show(el) { el.classList.add('active'); }
function hide(el) { el.classList.remove('active'); }
function normalize(s) {
  return s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.,!?;:]+$/g, '');
}

/* ── Load item ── */
function loadItem() {
  answered = false;
  const q = shuffled[current];
  const info = SECTION_INFO[q.section];

  document.getElementById('sectionLabel').textContent = info.name;
  const tb = document.getElementById('taskLabel');
  tb.textContent = q.task.replace('_', ' ');
  tb.className = 'diff-badge diff-moderate';

  const pct = Math.round((current / shuffled.length) * 100);
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressLabel').textContent = (current + 1) + ' / ' + shuffled.length;
  document.getElementById('scoreRunning').textContent = 'Score: ' + score + ' / ' + current;

  const passageBox = document.getElementById('passageBox');
  if (q._passage) {
    document.getElementById('passageTitle').textContent = q._passage.title || '';
    let text = q._passage.text;
    if (q._passage.gaps) {
      q._passage.gaps.forEach((g, i) => {
        text = text.replace('[' + g + ']', '<span class="gap-tag">' + (i + 1) + '</span>');
      });
    }
    document.getElementById('passageText').innerHTML = text;
    passageBox.style.display = 'block';
  } else {
    passageBox.style.display = 'none';
  }

  document.getElementById('qText').textContent = q.prompt;
  document.getElementById('explanationBox').style.display = 'none';
  document.getElementById('topicBox').style.display = 'none';
  nextBtn.style.display = 'none';

  renderItemBody(q);
  totalStart = totalStart || Date.now();
}

function renderItemBody(q) {
  const body = document.getElementById('itemBody');
  body.innerHTML = '';

  if (q.task === 'mc' || q.task === 'true_false') {
    const list = document.createElement('div');
    list.className = 'options-list';
    const letters = ['A', 'B', 'C', 'D', 'E'];
    q.options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.innerHTML = '<span class="opt-letter">' + letters[i] + '</span><span>' + opt + '</span>';
      btn.addEventListener('click', () => gradeChoice(q, i, list));
      list.appendChild(btn);
    });
    body.appendChild(list);

  } else if (q.task === 'image_mc') {
    const emoji = document.createElement('div');
    emoji.className = 'vocab-emoji';
    emoji.textContent = q.emoji;
    body.appendChild(emoji);
    const list = document.createElement('div');
    list.className = 'options-list';
    const letters = ['A', 'B', 'C', 'D'];
    q.options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.innerHTML = '<span class="opt-letter">' + letters[i] + '</span><span>' + opt + '</span>';
      btn.addEventListener('click', () => gradeChoice(q, i, list));
      list.appendChild(btn);
    });
    body.appendChild(list);

  } else if (q.task === 'matching_gap') {
    const list = document.createElement('div');
    list.className = 'gap-select-list';
    const selects = [];
    q._passage.gaps.forEach((g, i) => {
      const row = document.createElement('div');
      row.className = 'gap-select-row';
      const label = document.createElement('span');
      label.className = 'gap-select-label';
      label.textContent = 'Gap ' + (i + 1);
      const select = document.createElement('select');
      select.className = 'gap-select';
      select.dataset.gapIndex = i;
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = '— choose —';
      select.appendChild(placeholder);
      q.candidates.forEach((c, ci) => {
        const opt = document.createElement('option');
        opt.value = ci;
        opt.textContent = c;
        select.appendChild(opt);
      });
      row.appendChild(label);
      row.appendChild(select);
      list.appendChild(row);
      selects.push(select);
    });
    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn btn-primary';
    submitBtn.style.marginTop = '12px';
    submitBtn.textContent = 'Check answers';
    submitBtn.addEventListener('click', () => gradeMatching(q, selects, list, submitBtn));
    body.appendChild(list);
    body.appendChild(submitBtn);

  } else if (q.task === 'gap_fill' || q.task === 'transformation') {
    const wrap = document.createElement('div');
    wrap.className = 'text-input-wrap';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'text-answer-input';
    input.placeholder = q.task === 'transformation' ? 'Type the rewritten sentence…' : 'Type your answer…';
    input.autocomplete = 'off';
    const hint = document.createElement('p');
    hint.className = 'text-answer-hint';
    hint.textContent = 'Answers are matched loosely (case-insensitive) — close spelling variants below still count.';
    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn btn-primary';
    submitBtn.textContent = 'Check answer';
    const submit = () => gradeText(q, input, submitBtn);
    submitBtn.addEventListener('click', submit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    wrap.appendChild(input);
    wrap.appendChild(hint);
    wrap.appendChild(submitBtn);
    body.appendChild(wrap);
    setTimeout(() => input.focus(), 50);
  }
}

/* ── Grading ── */
function finishAnswer(q, isCorrect) {
  answered = true;
  if (isCorrect) score++;
  qResults.push({ itemId: q.id, section: q.section, correct: isCorrect });
  showExplanation(q);
  document.getElementById('scoreRunning').textContent = 'Score: ' + score + ' / ' + (current + 1);
  nextBtn.style.display = 'inline-flex';
  saveSessionCheckpoint();
}

function gradeChoice(q, idx, list) {
  if (answered) return;
  const isCorrect = idx === q.answer;
  list.querySelectorAll('.option-btn').forEach((btn, i) => {
    btn.disabled = true;
    if (i === q.answer) btn.classList.add('correct');
    else if (i === idx) btn.classList.add('wrong');
  });
  finishAnswer(q, isCorrect);
}

function gradeMatching(q, selects, list, submitBtn) {
  if (answered) return;
  const chosen = selects.map(s => s.value === '' ? -1 : parseInt(s.value));
  const isCorrect = JSON.stringify(chosen) === JSON.stringify(q.answer);
  selects.forEach((s, i) => {
    s.disabled = true;
    const row = s.closest('.gap-select-row');
    row.classList.add(chosen[i] === q.answer[i] ? 'correct' : 'wrong');
  });
  submitBtn.style.display = 'none';
  finishAnswer(q, isCorrect);
}

function gradeText(q, input, submitBtn) {
  if (answered) return;
  const given = normalize(input.value);
  const isCorrect = q.accepted.some(a => normalize(a) === given);
  input.disabled = true;
  input.classList.add(isCorrect ? 'correct' : 'wrong');
  submitBtn.style.display = 'none';
  if (!isCorrect) {
    const box = document.createElement('div');
    box.className = 'accepted-answers';
    box.textContent = 'Accepted answer(s): ' + q.accepted.join(' / ');
    input.parentElement.appendChild(box);
  }
  finishAnswer(q, isCorrect);
}

function showExplanation(q) {
  document.getElementById('expContent').innerHTML = '<p class="exp-item exp-correct">' + q.explanation + '</p>';
  document.getElementById('explanationBox').style.display = 'block';

  const topicBox = document.getElementById('topicBox');
  if (q.note) {
    document.getElementById('topicContent').innerHTML = '<p>' + q.note + '</p>';
    topicBox.style.display = 'block';
  }
}

/* ── Next / results ── */
function nextItem() {
  current++;
  if (current >= shuffled.length) showResults();
  else loadItem();
}

function showResults() {
  clearSession();
  hide(quizScreen);
  show(resultScreen);

  const total = shuffled.length;
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const passing = pct >= 70;

  document.getElementById('finalScore').textContent = pct + '%';
  document.getElementById('scoreCircle').className = 'score-circle ' + (passing ? 'passing' : 'failing');
  document.getElementById('passFailLabel').textContent = passing ? 'STRONG' : 'KEEP PRACTICING';
  document.getElementById('passFailLabel').className = 'score-sub ' + (passing ? 'pass' : 'fail');

  document.getElementById('mCorrect').textContent = score + '/' + total;
  document.getElementById('mTotal').textContent = total;
  const hist = getHistory();
  const best = hist.length ? Math.max(pct, ...hist.map(h => h.pct)) : pct;
  document.getElementById('mBest').textContent = best + '%';

  const sd = {};
  ['reading', 'grammar', 'vocab'].forEach(s => sd[s] = { t: 0, c: 0 });
  shuffled.forEach((q, i) => { if (sd[q.section]) { sd[q.section].t++; if (qResults[i] && qResults[i].correct) sd[q.section].c++; } });
  const sdEl = document.getElementById('sectionScores');
  sdEl.innerHTML = Object.keys(sd).filter(s => sd[s].t > 0).map(s => {
    const info = SECTION_INFO[s];
    const p = Math.round((sd[s].c / sd[s].t) * 100);
    return `<div class="ds-row">
      <span class="ds-name">${info.name}</span>
      <div class="ds-bar-bg"><div class="ds-bar-fill" style="width:${p}%; background:${info.color};"></div></div>
      <span class="ds-pct">${p}%</span>
    </div>`;
  }).join('');

  saveHistoryEntry({ date: Date.now(), mode: activeMode === 'section' ? 'By section' : 'Full practice', pct, correct: score, total });
  renderHistory();

  document.getElementById('reviewSection').style.display = 'none';
  reviewToggle.textContent = 'Review wrong answers';
}

/* ── Review ── */
function toggleReview() {
  const sec = document.getElementById('reviewSection');
  const showing = sec.style.display === 'block';
  sec.style.display = showing ? 'none' : 'block';
  reviewToggle.textContent = showing ? 'Review wrong answers' : 'Hide review';
  if (!showing) renderReview();
}

function renderReview() {
  const el = document.getElementById('reviewList');
  const wrong = shuffled.map((q, i) => ({ q, r: qResults[i] })).filter(x => x.r && !x.r.correct);
  if (wrong.length === 0) {
    el.innerHTML = '<div class="no-wrong">🎉 Perfect session — nothing to review!</div>';
    return;
  }
  el.innerHTML = wrong.map(({ q }) => `
    <div class="review-card">
      <p class="review-q"><strong>${SECTION_INFO[q.section].short}:</strong> ${q.prompt}</p>
      <div class="review-exp">${q.explanation}</div>
    </div>
  `).join('');
}

/* ══════════════ Learn track ══════════════ */

function setAppMode(mode) {
  appMode = mode;
  document.querySelectorAll('.mode-tab').forEach(t => t.classList.toggle('active', t.dataset.appMode === mode));
  if (mode === 'learn') {
    hide(startScreen); hide(quizScreen); hide(writingScreen); hide(resultScreen);
    show(learnHomeScreenEl);
  } else {
    hide(learnHomeScreenEl); hide(lessonScreenEl); hide(lessonCheckScreenEl); hide(lessonCompleteScreenEl);
    show(startScreen);
  }
}

/* ── Progress ── */
function getLessonProgress() {
  try { return JSON.parse(localStorage.getItem(LS_PROGRESS)) || {}; } catch { return {}; }
}
function markLessonDone(lessonId, pct) {
  const p = getLessonProgress();
  p[lessonId] = { done: true, pct };
  localStorage.setItem(LS_PROGRESS, JSON.stringify(p));
}

/* ── Level path ── */
function renderLevelPath() {
  const el = document.getElementById('levelPath');
  const progress = getLessonProgress();
  el.innerHTML = '';

  levels.forEach(level => {
    const card = document.createElement('div');
    card.className = 'level-card' + (level.locked ? ' locked' : '');

    const doneCount = level.lessons.filter(l => progress[l.id]?.done).length;

    const head = document.createElement('div');
    head.className = 'level-card-head';
    head.innerHTML = `
      <div class="level-badge">${level.code}</div>
      <div class="level-info">
        <div class="level-name">${level.name}</div>
        <div class="level-tagline">${level.locked ? 'Unlocks after the previous level · ' + level.tagline : (level.lessons.length ? doneCount + ' / ' + level.lessons.length + ' lessons done' : 'Coming soon') + ' · ' + level.tagline}</div>
      </div>
      ${level.locked ? '<span class="level-lock-icon">🔒</span>' : '<span class="level-chevron">▸</span>'}
    `;
    card.appendChild(head);

    const list = document.createElement('div');
    list.className = 'lesson-list';
    if (level.lessons.length === 0 && !level.locked) {
      list.innerHTML = '<p class="level-empty">Lessons for this level are coming soon.</p>';
    } else {
      level.lessons.forEach(lesson => {
        const done = progress[lesson.id]?.done;
        const lc = document.createElement('button');
        lc.className = 'lesson-card';
        lc.innerHTML = `
          <span class="lesson-card-icon">${lesson.icon}</span>
          <span class="lesson-card-body">
            <span class="lesson-card-title">${lesson.title}</span>
            <span class="lesson-card-blurb">${lesson.blurb}</span>
          </span>
          <span class="lesson-card-status ${done ? 'done' : 'todo'}">${done ? '✓ Done' : 'Start'}</span>
        `;
        lc.addEventListener('click', () => openLesson(level, lesson));
        list.appendChild(lc);
      });
    }
    card.appendChild(list);

    if (!level.locked) {
      head.addEventListener('click', () => {
        card.classList.toggle('expanded');
      });
    }

    el.appendChild(card);
  });
}

/* ── Lesson detail ── */
function openLesson(level, lesson) {
  currentLevel = level;
  currentLesson = lesson;
  const el = document.getElementById('lessonContent');
  el.innerHTML = `
    <div class="lesson-hero">
      <div class="lesson-hero-icon">${lesson.icon}</div>
      <h2 class="lesson-hero-title">${lesson.title}</h2>
    </div>
    <div class="vocab-grid">
      ${lesson.vocab.map(v => `
        <div class="vocab-card">
          <div class="vocab-word-row">
            <span class="vocab-word">${v.word}</span>
            ${v.audioWord ? `<button class="audio-btn" data-audio="${v.audioWord}" title="Play pronunciation">${ICON_SPEAKER}</button>` : ''}
          </div>
          <div class="vocab-translation">${v.translation}</div>
          <div class="vocab-example-row">
            <span class="vocab-example">${v.example}</span>
            ${v.audioExample ? `<button class="audio-btn audio-btn-sm" data-audio="${v.audioExample}" title="Play example">${ICON_SPEAKER}</button>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
    <div class="grammar-note-card">
      <div class="grammar-note-title">💡 ${lesson.grammarNote.title}</div>
      <div class="grammar-note-text">${lesson.grammarNote.text}</div>
    </div>
    <button class="btn btn-primary lesson-practice-btn" id="lessonPracticeBtn">Practice this lesson (${lesson.check.length} questions) →</button>
  `;
  document.getElementById('lessonPracticeBtn').addEventListener('click', startLessonCheck);
  wireAudioButtons(el);
  hide(learnHomeScreenEl);
  show(lessonScreenEl);
  window.scrollTo(0, 0);
}

function goToNextLesson() {
  const lessons = currentLevel.lessons;
  const idx = lessons.findIndex(l => l.id === currentLesson.id);
  hide(lessonCompleteScreenEl);
  if (idx >= 0 && idx < lessons.length - 1) {
    openLesson(currentLevel, lessons[idx + 1]);
  } else {
    show(learnHomeScreenEl);
    renderLevelPath();
  }
}

/* ── Lesson check (mini quiz) ── */
function startLessonCheck() {
  lcQueue = shuffle(currentLesson.check);
  lcCurrent = 0;
  lcScore = 0;
  hide(lessonScreenEl);
  show(lessonCheckScreenEl);
  document.getElementById('lessonCheckLabel').textContent = currentLesson.title;
  lcLoadItem();
}

function lcLoadItem() {
  lcAnswered = false;
  const q = lcQueue[lcCurrent];
  const pct = Math.round((lcCurrent / lcQueue.length) * 100);
  document.getElementById('lcProgressFill').style.width = pct + '%';
  document.getElementById('lcProgressLabel').textContent = (lcCurrent + 1) + ' / ' + lcQueue.length;
  document.getElementById('lcScoreRunning').textContent = 'Score: ' + lcScore + ' / ' + lcCurrent;
  document.getElementById('lcQText').textContent = q.prompt;
  document.getElementById('lcExplanationBox').style.display = 'none';
  document.getElementById('lcTopicBox').style.display = 'none';
  document.getElementById('lcNextBtn').style.display = 'none';

  const body = document.getElementById('lcItemBody');
  body.innerHTML = '';
  const letters = ['A', 'B', 'C', 'D', 'E'];

  if (q.task === 'mc' || q.task === 'true_false' || q.task === 'image_mc') {
    const list = document.createElement('div');
    list.className = 'options-list';
    q.options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.innerHTML = '<span class="opt-letter">' + letters[i] + '</span><span>' + opt + '</span>';
      btn.addEventListener('click', () => lcGradeChoice(q, i, list));
      list.appendChild(btn);
    });
    body.appendChild(list);
  } else if (q.task === 'gap_fill' || q.task === 'transformation') {
    const wrap = document.createElement('div');
    wrap.className = 'text-input-wrap';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'text-answer-input';
    input.placeholder = 'Type your answer…';
    input.autocomplete = 'off';
    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn btn-primary';
    submitBtn.textContent = 'Check answer';
    const submit = () => lcGradeText(q, input, submitBtn);
    submitBtn.addEventListener('click', submit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    wrap.appendChild(input);
    wrap.appendChild(submitBtn);
    body.appendChild(wrap);
    setTimeout(() => input.focus(), 50);
  }
}

function lcFinish(q, isCorrect) {
  lcAnswered = true;
  if (isCorrect) lcScore++;
  document.getElementById('lcExpContent').innerHTML = '<p class="exp-item exp-correct">' + q.explanation + '</p>';
  document.getElementById('lcExplanationBox').style.display = 'block';
  if (q.note) {
    document.getElementById('lcTopicContent').innerHTML = '<p>' + q.note + '</p>';
    document.getElementById('lcTopicBox').style.display = 'block';
  }
  document.getElementById('lcScoreRunning').textContent = 'Score: ' + lcScore + ' / ' + (lcCurrent + 1);
  document.getElementById('lcNextBtn').style.display = 'inline-flex';
}

function lcGradeChoice(q, idx, list) {
  if (lcAnswered) return;
  const isCorrect = idx === q.answer;
  list.querySelectorAll('.option-btn').forEach((btn, i) => {
    btn.disabled = true;
    if (i === q.answer) btn.classList.add('correct');
    else if (i === idx) btn.classList.add('wrong');
  });
  lcFinish(q, isCorrect);
}

function lcGradeText(q, input, submitBtn) {
  if (lcAnswered) return;
  const given = normalize(input.value);
  const isCorrect = q.accepted.some(a => normalize(a) === given);
  input.disabled = true;
  input.classList.add(isCorrect ? 'correct' : 'wrong');
  submitBtn.style.display = 'none';
  if (!isCorrect) {
    const box = document.createElement('div');
    box.className = 'accepted-answers';
    box.textContent = 'Accepted answer(s): ' + q.accepted.join(' / ');
    input.parentElement.appendChild(box);
  }
  lcFinish(q, isCorrect);
}

function lcNextItem() {
  lcCurrent++;
  if (lcCurrent >= lcQueue.length) showLessonComplete();
  else lcLoadItem();
}

function showLessonComplete() {
  const pct = Math.round((lcScore / lcQueue.length) * 100);
  markLessonDone(currentLesson.id, pct);
  hide(lessonCheckScreenEl);
  show(lessonCompleteScreenEl);
  document.getElementById('lcScoreText').textContent = `You scored ${lcScore} / ${lcQueue.length} (${pct}%) on "${currentLesson.title}".`;
  renderLevelPath();
}

/* ── Audio playback ── */
let currentAudio = null;
function wireAudioButtons(container) {
  container.querySelectorAll('.audio-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const src = btn.dataset.audio;
      if (currentAudio) { currentAudio.pause(); currentAudio.currentTime = 0; }
      currentAudio = new Audio(src);
      btn.classList.add('playing');
      currentAudio.addEventListener('ended', () => btn.classList.remove('playing'));
      currentAudio.play().catch(() => btn.classList.remove('playing'));
    });
  });
}
