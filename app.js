(function () {
  const $ = (id) => document.getElementById(id);
  const MAX_FILES = 5, MAX_MB = 50;
  const EXTS = new Set('pdf pptx pptm ppsx potx docx docm dotx xlsx xlsm xltx odt odp ods txt md markdown csv tsv json xml yaml yml log tex html htm rtf jpg jpeg png gif webp doc ppt xls'.split(' '));

  let files = [];
  let summary = null;
  let quiz = [], quizSource = [], lastQuestionOrder = '', qi = 0, score = 0;

  /* ---------------- Theme ---------------- */
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : { matches: false };
  const THEME_KEY = 'ss-theme-v2'; // v2: ignores values saved by earlier builds, so first open is System
  function getPref() {
    try { const v = localStorage.getItem(THEME_KEY); if (v === 'light' || v === 'dark' || v === 'system') return v; } catch (e) { }
    return 'system';
  }
  function setTheme(pref, save) {
    const resolved = pref === 'system' ? (mq.matches ? 'dark' : 'light') : pref;
    document.documentElement.setAttribute('data-theme', resolved);
    document.querySelectorAll('.ts-opt').forEach((b) => b.classList.toggle('active', b.dataset.themeChoice === pref));
    if (save) { try { localStorage.setItem(THEME_KEY, pref); } catch (e) { } }
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
      quizSource = data.questions;
      beginQuiz();
    } catch (e) { $('quizError').textContent = e.message; }
    finally { setLoading(btn, false); }
  });

  // Options that refer to each other ("All of the above", "Both A and B") must keep their position.
  const ORDER_DEPENDENT = /\b(all|none|both|neither)\s+of\s+the\s+(above|below|these|options)\b|\b(both|either)\s+[A-D]\s+(and|or)\s+[A-D]\b|\ball\s+(the\s+)?above\b/i;
  function shuffled(q) {
    const n = q.options.length;
    const orderKey = (o) => o.join('|');
    if (n < 2 || q.options.some((o) => ORDER_DEPENDENT.test(String(o)))) return { ...q };
    let idx;
    for (let tries = 0; tries < 20; tries++) {
      idx = q.options.map((_, i) => i);
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      // a retake should never show the same arrangement as the attempt before it
      if (orderKey(idx) !== q._last) break;
    }
    q._last = orderKey(idx);
    return { ...q, options: idx.map((i) => q.options[i]), answer: idx.indexOf(q.answer) };
  }

  function beginQuiz() {
    // Fresh question order too; a retake never repeats the previous order.
    const order = quizSource.map((_, i) => i);
    for (let tries = 0; tries < 20; tries++) {
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      if (order.length < 2 || order.join(',') !== lastQuestionOrder) break;
    }
    lastQuestionOrder = order.join(',');
    quiz = order.map((i) => shuffled(quizSource[i]));
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
    $('qExplain').innerHTML = '<b>' + (i === q.answer ? 'Correct' : 'Incorrect') + '</b>' + esc(q.explanation || '');
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

  /* ---------------- PDF download ---------------- */
  const PDF_VARS = {
    light: { background: '#ffffff', primaryColor: '#fbe6dc', primaryTextColor: '#2b211d', primaryBorderColor: '#c8553d', lineColor: '#e07a5a', secondaryColor: '#fdf0e9', tertiaryColor: '#ffffff' },
    dark: { background: '#ffffff', primaryColor: '#e6eff8', primaryTextColor: '#1d2a3a', primaryBorderColor: '#3f78a8', lineColor: '#5f8fba', secondaryColor: '#f1f6fb', tertiaryColor: '#ffffff' },
  };

  // One diagram, drawn for paper (white page, plain SVG text so the canvas stays untainted) and returned as JPEG data.
  async function diagramImage(src, n) {
    const svg = (await mermaid.render('pdf-d-' + Date.now() + '-' + n, src)).svg;
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const el = doc.documentElement;
    if (doc.querySelector('parsererror') || el.nodeName.toLowerCase() !== 'svg') throw new Error('bad svg');
    const vb = (el.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
    const w = vb.length === 4 && vb[2] > 0 ? vb[2] : parseFloat(el.getAttribute('width'));
    const h = vb.length === 4 && vb[3] > 0 ? vb[3] : parseFloat(el.getAttribute('height'));
    if (!(w > 0 && h > 0)) throw new Error('no size');
    el.setAttribute('width', w); el.setAttribute('height', h);
    el.removeAttribute('style');
    el.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const img = new Image();
    await new Promise((ok, no) => {
      img.onload = ok; img.onerror = () => no(new Error('svg load'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(el));
    });
    const k = Math.min(3, Math.max(1.5, 1800 / w));
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(w * k); cv.height = Math.ceil(h * k);
    const cx = cv.getContext('2d');
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
    cx.drawImage(img, 0, 0, cv.width, cv.height);
    return { data: atob(cv.toDataURL('image/jpeg', 0.92).split(',')[1]), w, h, pw: cv.width, ph: cv.height };
  }

  async function diagramImages(dark) {
    const out = (summary.sections || []).map(() => null);
    if (!window.mermaid) return out;
    mermaid.initialize({
      startOnLoad: false, theme: 'base', securityLevel: 'strict', fontFamily: 'Helvetica, Arial, sans-serif',
      htmlLabels: false, flowchart: { htmlLabels: false }, themeVariables: dark ? PDF_VARS.dark : PDF_VARS.light,
    });
    try {
      for (let i = 0; i < out.length; i++) {
        const dg = summary.sections[i].diagram;
        if (!dg || !dg.mermaid) continue;
        try { out[i] = await diagramImage(dg.mermaid, i); }
        catch (e) { document.querySelectorAll('[id^="dpdf-d-"]').forEach((x) => x.remove()); } // a diagram that fails is left out
      }
    } finally { initMermaid(); }
    return out;
  }

  function saveBlob(bytes, name) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // Fallback for notes whose characters the built-in PDF fonts cannot show (e.g. Cyrillic, CJK): the browser's own
  // "Save as PDF" through the print dialog, restricted to the summary.
  function printSummary() {
    const root = document.documentElement, prev = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'light');
    root.classList.add('print-summary');
    const done = () => { root.classList.remove('print-summary'); root.setAttribute('data-theme', prev); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  }

  $('dlBtn').addEventListener('click', async () => {
    if (!summary) return;
    const btn = $('dlBtn');
    $('dlError').textContent = '';
    btn.classList.add('busy');
    try {
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      const bytes = window.SmoothPDF ? window.SmoothPDF.build({ summary, images: await diagramImages(dark), dark }) : null;
      if (bytes) {
        const name = String(summary.title || 'SmoothStudy notes').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'SmoothStudy notes';
        saveBlob(bytes, name + '.pdf');
      } else printSummary();
    } catch (e) {
      $('dlError').textContent = "Couldn't create the PDF. Please try again.";
    } finally { btn.classList.remove('busy'); }
  });

  /* ---------------- Scroll buttons ---------------- */
  (function () {
    const up = $('scrollUp'), down = $('scrollDown');
    if (!up || !down) return;
    const EDGE = 4;
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const suppressed = { up: false, down: false }; // a clicked button stays hidden until the user scrolls back
    let auto = null, autoTimer = null;             // direction of the scroll we started, if still running
    const atTop = () => window.scrollY <= EDGE;
    const atBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - EDGE;

    function update() {
      if (!auto) {
        if (suppressed.up && !atTop()) suppressed.up = false;
        if (suppressed.down && !atBottom()) suppressed.down = false;
      }
      up.classList.toggle('is-hidden', atTop() || suppressed.up);
      down.classList.toggle('is-hidden', atBottom() || suppressed.down);
    }
    function armTimer() {
      clearTimeout(autoTimer);
      autoTimer = setTimeout(() => { auto = null; update(); }, 400); // our scroll has finished (or stalled)
    }
    function go(dir) {
      suppressed[dir] = true;
      auto = dir;
      window.scrollTo({ top: dir === 'up' ? 0 : document.documentElement.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
      update();
      armTimer();
    }
    // The user taking over mid-scroll cancels ours and brings the button back.
    function interrupt() {
      if (!auto) return;
      suppressed[auto] = false;
      auto = null;
      clearTimeout(autoTimer);
      update();
    }

    up.addEventListener('click', () => go('up'));
    down.addEventListener('click', () => go('down'));
    window.addEventListener('scroll', () => { if (auto) armTimer(); update(); }, { passive: true });
    window.addEventListener('resize', update);
    window.addEventListener('wheel', interrupt, { passive: true });
    window.addEventListener('touchstart', interrupt, { passive: true });
    window.addEventListener('keydown', (e) => { if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) interrupt(); });
    if (window.ResizeObserver) new ResizeObserver(update).observe(document.body); // page grows when the summary appears
    update();
  })();

  setTheme(getPref(), false);
})();
