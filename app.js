(function () {
  const $ = (id) => document.getElementById(id);
  const MAX_FILES = 5, MAX_MB = 50;
  const EXTS = new Set('pdf pptx pptm ppsx potx docx docm dotx xlsx xlsm xltx odt odp ods txt md markdown csv tsv json xml yaml yml log tex html htm rtf jpg jpeg png gif webp doc ppt xls'.split(' '));

  let files = [];
  let summary = null;
  let quiz = [], qi = 0, score = 0;

  /* ---------------- Theme ---------------- */
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : { matches: false };
  function getPref() {
    try { const v = localStorage.getItem('ss-theme'); if (v === 'light' || v === 'dark' || v === 'system') return v; } catch (e) { }
    return 'system';
  }
  function setTheme(pref, save) {
    const resolved = pref === 'system' ? (mq.matches ? 'dark' : 'light') : pref;
    document.documentElement.setAttribute('data-theme', resolved);
    document.querySelectorAll('.ts-opt').forEach((b) => b.classList.toggle('active', b.dataset.themeChoice === pref));
    if (save) { try { localStorage.setItem('ss-theme', pref); } catch (e) { } }
    initMermaid();
    renderDiagrams();
  }
  const onSystemChange = () => { if (getPref() === 'system') setTheme('system', false); };
  if (mq.addEventListener) mq.addEventListener('change', onSystemChange);
  else if (mq.addListener) mq.addListener(onSystemChange);
  document.querySelectorAll('.ts-opt').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.themeChoice, true)));

  function initMermaid() {
    if (!window.mermaid) return;
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      securityLevel: 'strict',
      fontFamily: 'Lexend, sans-serif',
      themeVariables: dark
        ? { background: '#151e29', primaryColor: '#1d2a3a', primaryTextColor: '#eef0ec', primaryBorderColor: '#8fb8de', lineColor: '#c4d8e6', secondaryColor: '#243142', tertiaryColor: '#151e29' }
        : { background: '#ffffff', primaryColor: '#fbe6dc', primaryTextColor: '#2b211d', primaryBorderColor: '#c8553d', lineColor: '#e07a5a', secondaryColor: '#fdf0e9', tertiaryColor: '#ffffff' },
    });
  }

  /* ---------------- Helpers ---------------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  const words = (s) => (String(s).match(/\S+/g) || []).length;
  function setLoading(btn, on) { btn.classList.toggle('loading', on); btn.disabled = on; }
  function toBase64(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1]);
      r.onerror = () => rej(new Error('Could not read ' + file.name));
      r.readAsDataURL(file);
    });
  }
  async function post(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  /* ---------------- Upload ---------------- */
  const dz = $('dropzone'), fi = $('fileInput');
  function typeOf(f) {
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    return EXTS.has(ext) ? ext : null;
  }
  function addFiles(list) {
    $('uploadError').textContent = '';
    for (const f of list) {
      if (!typeOf(f)) { $('uploadError').textContent = f.name + " isn't a supported file type."; continue; }
      if (f.size > MAX_MB * 1024 * 1024) { $('uploadError').textContent = f.name + ' is over ' + MAX_MB + ' MB.'; continue; }
      if (files.length >= MAX_FILES) { $('uploadError').textContent = 'Up to ' + MAX_FILES + ' files at a time.'; break; }
      files.push(f);
    }
    renderFiles();
  }
  function renderFiles() {
    $('fileList').innerHTML = files.map((f, i) =>
      `<li><span class="fname">${esc(f.name)}</span><span class="fmeta">${(f.size / 1024 / 1024).toFixed(2)} MB</span><button data-i="${i}" aria-label="Remove ${esc(f.name)}">&times;</button></li>`).join('');
    $('fileList').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { files.splice(+b.dataset.i, 1); renderFiles(); }));
  }
  fi.addEventListener('change', () => { addFiles([...fi.files]); fi.value = ''; });
  dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } });
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', (e) => addFiles([...e.dataTransfer.files]));

  /* ---------------- Summary ---------------- */
  $('summarizeBtn').addEventListener('click', async () => {
    const text = $('notes').value;
    $('uploadError').textContent = '';
    if (!files.length && !text.trim()) { $('uploadError').textContent = 'Add a file or type some notes first.'; return; }
    const btn = $('summarizeBtn');
    setLoading(btn, true);
    try {
      const payload = [];
      for (const f of files) payload.push({ name: f.name, data: await toBase64(f) });
      summary = await post('/api/summarize', { files: payload, text });
      renderSummary(text);
      $('quizRun').classList.add('hidden'); $('quizResult').classList.add('hidden'); $('quizSetup').classList.remove('hidden');
      $('summarySection').classList.remove('hidden');
      $('quiz').classList.remove('hidden');
      $('summarySection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      $('uploadError').textContent = e.message;
    } finally { setLoading(btn, false); }
  });

  function summaryText() {
    if (!summary) return '';
    const out = [summary.title, '', summary.overview, ''];
    (summary.sections || []).forEach((s) => { out.push(s.heading); (s.points || []).forEach((p) => out.push('- ' + p.replace(/\*\*/g, ''))); out.push(''); });
    if ((summary.technical || []).length) { out.push('Technical'); summary.technical.forEach((t) => out.push(t)); out.push(''); }
    if ((summary.keyTerms || []).length) { out.push('Key terms'); summary.keyTerms.forEach((k) => out.push(k.term + ': ' + k.definition)); }
    return out.join('\n');
  }

  function renderSummary(inputText) {
    $('sumTitle').textContent = summary.title || 'Your summary';
    $('sumOverview').textContent = summary.overview || '';
    const outWords = words(summaryText());
    $('sumStat').textContent = outWords + ' words' + (words(inputText) > 50 ? ' (from ' + words(inputText) + ')' : '');
    $('sumBody').innerHTML = (summary.sections || []).map((s) => `
      <div class="sum-section">
        <h3>${esc(s.heading)}</h3>
        <ul>${(s.points || []).map((p) => `<li>${fmt(p)}</li>`).join('')}</ul>
        ${s.diagram && s.diagram.mermaid ? `<div class="diagram"><div class="d-title">${esc(s.diagram.title || 'Diagram')}</div><div class="mermaid-box" data-src="${esc(s.diagram.mermaid)}"></div></div>` : ''}
      </div>`).join('');
    const tech = summary.technical || [];
    $('sumTechnical').innerHTML = tech.length
      ? `<div class="tech-box"><div class="t-head">Technical reference</div><pre>${tech.map(esc).join('\n')}</pre></div>` : '';
    const terms = summary.keyTerms || [];
    $('sumTerms').innerHTML = terms.length
      ? `<div class="terms"><h3>Key terms</h3><div class="term-grid">${terms.map((k) => `<div class="term"><b>${esc(k.term)}</b><span>${esc(k.definition)}</span></div>`).join('')}</div></div>` : '';
    initMermaid();
    renderDiagrams();
  }

  async function renderDiagrams() {
    if (!window.mermaid) return;
    const boxes = document.querySelectorAll('.mermaid-box');
    let n = 0;
    for (const el of boxes) {
      const src = el.dataset.src;
      try {
        const { svg } = await mermaid.render('mmd-' + Date.now() + '-' + n++, src);
        el.innerHTML = svg;
      } catch (e) {
        document.querySelectorAll('[id^="dmmd-"]').forEach((x) => x.remove());
        el.innerHTML = '<pre>' + esc(src) + '</pre>';
      }
    }
  }

  $('copyBtn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(summaryText()); $('copyBtn').textContent = 'Copied'; }
    catch (e) { $('copyBtn').textContent = 'Copy failed'; }
    setTimeout(() => ($('copyBtn').textContent = 'Copy summary'), 1600);
  });

  /* ---------------- Quiz ---------------- */
  let count = 10, difficulty = 'Mixed';
  function seg(id, cb) {
    $(id).querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => {
      $(id).querySelectorAll('.seg-btn').forEach((x) => x.classList.remove('active'));
      b.classList.add('active'); cb(b.dataset.v);
    }));
  }
  seg('countSeg', (v) => (count = +v));
  seg('diffSeg', (v) => (difficulty = v));

  $('startQuizBtn').addEventListener('click', async () => {
    $('quizError').textContent = '';
    if (!summary) { $('quizError').textContent = 'Generate a summary first.'; return; }
    const btn = $('startQuizBtn');
    setLoading(btn, true);
    try {
      const data = await post('/api/quiz', { summary, count, difficulty });
      quiz = data.questions;
      beginQuiz();
    } catch (e) { $('quizError').textContent = e.message; }
    finally { setLoading(btn, false); }
  });

  function beginQuiz() {
    qi = 0; score = 0;
    $('quizSetup').classList.add('hidden'); $('quizResult').classList.add('hidden'); $('quizRun').classList.remove('hidden');
    showQ();
    $('quiz').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function showQ() {
    const q = quiz[qi];
    $('qCount').textContent = 'Question ' + (qi + 1) + ' / ' + quiz.length;
    $('qDiff').textContent = q.difficulty || difficulty;
    $('progressBar').style.width = (qi / quiz.length) * 100 + '%';
    $('qText').textContent = q.question;
    $('qExplain').classList.add('hidden');
    $('nextBtn').classList.add('hidden');
    $('nextBtn').textContent = qi === quiz.length - 1 ? 'See results' : 'Next';
    $('qOptions').innerHTML = q.options.map((o, i) =>
      `<button class="opt" data-i="${i}"><span class="letter">${'ABCDEFGH'[i]}</span><span>${esc(o)}</span></button>`).join('');
    $('qOptions').querySelectorAll('.opt').forEach((b) => b.addEventListener('click', () => answer(+b.dataset.i)));
  }

  function answer(i) {
    const q = quiz[qi];
    const btns = $('qOptions').querySelectorAll('.opt');
    btns.forEach((b, idx) => {
      b.disabled = true;
      if (idx === q.answer) b.classList.add('correct');
      else if (idx === i) b.classList.add('wrong');
    });
    if (i === q.answer) score++;
    $('qExplain').innerHTML = '<b>' + (i === q.answer ? 'Correct' : 'Not quite') + '</b>' + esc(q.explanation || '');
    $('qExplain').classList.remove('hidden');
    $('nextBtn').classList.remove('hidden');
    $('progressBar').style.width = ((qi + 1) / quiz.length) * 100 + '%';
  }

  $('nextBtn').addEventListener('click', () => {
    qi++;
    if (qi >= quiz.length) return showResult();
    showQ();
  });

  function showResult() {
    $('quizRun').classList.add('hidden');
    $('quizResult').classList.remove('hidden');
    const pct = Math.round((score / quiz.length) * 100);
    $('scoreRing').style.setProperty('--p', pct);
    $('scoreText').textContent = score + ' / ' + quiz.length;
    $('resultMsg').textContent = pct >= 90 ? 'Excellent. You have this material down.' : pct >= 70 ? 'Solid work. A quick skim of the summary should lock it in.' : pct >= 50 ? 'Getting there. Re-read the sections you missed and try again.' : 'Worth another pass through the summary, then retake the quiz.';
  }
  $('retryBtn').addEventListener('click', beginQuiz);
  $('newQuizBtn').addEventListener('click', () => { $('quizResult').classList.add('hidden'); $('quizSetup').classList.remove('hidden'); });

  setTheme(getPref(), false);
})();
