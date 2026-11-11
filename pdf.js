/* SmoothStudy PDF export. No dependencies.
   Writes a real vector-text PDF (Helvetica + Courier, WinAnsi) and embeds diagrams as JPEG images.
   Exposes window.SmoothPDF.build(model) -> Uint8Array, or null when the text contains characters the
   built-in PDF fonts cannot show (the caller then falls back to the browser's print dialog). */
(function () {
  'use strict';

  const PAGE = { w: 595.28, h: 841.89, mx: 52, top: 56, bottom: 62 };
  const CW = PAGE.w - PAGE.mx * 2;

  /* ------------------------------------------------------------------ text -> WinAnsi */
  const CP1252 = {
    '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87,
    'ˆ': 0x88, '‰': 0x89, 'Š': 0x8A, '‹': 0x8B, 'Œ': 0x8C, 'Ž': 0x8E, '‘': 0x91,
    '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98,
    '™': 0x99, 'š': 0x9A, '›': 0x9B, 'œ': 0x9C, 'ž': 0x9E, 'Ÿ': 0x9F,
  };
  const SYMBOLS = {
    ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', '​': '', '‌': '', '‍': '', '﻿': '', '­': '',
    '‐': '-', '‑': '-', '‒': '-', '―': '—', '−': '-',
    '→': '->', '←': '<-', '↔': '<->', '⇒': '=>', '⇐': '<=', '⇔': '<=>', '⇌': '<=>', '⇄': '<=>',
    '↑': '(up)', '↓': '(down)',
    '≤': '<=', '≥': '>=', '≠': '!=', '≈': '~', '≅': '~', '≡': '==', '∗': '*', '∙': '·', '⋅': '·',
    '∞': 'infinity', '√': 'sqrt', '∑': 'sum', '∏': 'product', '∆': 'Delta', '∇': 'nabla', '∂': 'd', '∝': 'is proportional to',
    '∈': 'in', '∉': 'not in', '⊂': 'subset of', '∫': 'integral of', '∴': 'therefore', '∵': 'because',
    '′': "'", '″': '"', '●': '•', '▪': '•', '◦': '•', '‣': '•', '⁃': '-',
    '✓': 'yes', '✔': 'yes', '✗': 'no', '✘': 'no',
  };
  const SUPER = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-' };
  const GREEK_NAMES = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rho', 'sigma', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega'];

  function greekName(ch) {
    const c = ch.charCodeAt(0);
    if (c >= 0x3B1 && c <= 0x3C9) return c === 0x3BC ? 'µ' : GREEK_NAMES[c - 0x3B1];
    if (c >= 0x391 && c <= 0x3A9 && c !== 0x3A2) { const n = GREEK_NAMES[c - 0x391]; return n.charAt(0).toUpperCase() + n.slice(1); }
    return null;
  }

  // Turns any string into text the built-in fonts can show. Sets state.bad when something cannot be shown.
  function norm(input, state) {
    let t = String(input == null ? '' : input).normalize('NFC');
    t = t.replace(/[₀-₋]/g, (c) => { const k = c.charCodeAt(0) - 0x2080; return k <= 9 ? String(k) : (k === 10 ? '+' : '-'); });
    t = t.replace(/[⁰¹²³⁴-⁹⁺⁻]+/g, (run) => (/^[¹²³]+$/.test(run) ? run : '^' + Array.from(run).map((c) => SUPER[c] || c).join('')));
    const chars = Array.from(t);
    let out = '';
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i], c = ch.codePointAt(0);
      if (ch === '\n' || ch === '\r') { out += ' '; continue; }
      if (ch === '\t') { out += '    '; continue; }
      if (SYMBOLS[ch] !== undefined) { out += SYMBOLS[ch]; continue; }
      const g = (c >= 0x391 && c <= 0x3C9) ? greekName(ch) : null;
      if (g !== null) {
        out += g;
        if (g !== 'µ' && i + 1 < chars.length && /[A-Za-z0-9Α-ω]/.test(chars[i + 1])) out += ' ';
        continue;
      }
      if (c < 0x20 || (c >= 0x7F && c < 0xA0)) { out += ' '; continue; }
      if (c < 0x7F || (c >= 0xA0 && c <= 0xFF) || CP1252[ch] !== undefined) { out += ch; continue; }
      if (c >= 0x300 && c <= 0x36F) continue; // stray combining mark
      state.bad = true; out += '?';
    }
    return out;
  }

  function pdfStr(s) {
    let o = '(';
    for (const ch of s) {
      let b = CP1252[ch] !== undefined ? CP1252[ch] : ch.charCodeAt(0);
      if (b > 255) b = 63;
      if (ch === '(' || ch === ')' || ch === '\\') o += '\\' + ch;
      else if (b < 32 || b > 126) o += '\\' + b.toString(8).padStart(3, '0');
      else o += String.fromCharCode(b);
    }
    return o + ')';
  }

  /* ------------------------------------------------------------------ measuring */
  const FONT = { R: ['F1', 'Helvetica'], B: ['F2', 'Helvetica-Bold'], M: ['F3', 'Courier'], MB: ['F4', 'Courier-Bold'] };
  let mctx = null;
  const wcache = new Map();
  // Arial / Liberation Sans are metric-compatible with Helvetica, so a canvas gives the real advance widths.
  function unitWidth(text, bold) {
    const key = (bold ? 'b|' : 'r|') + text;
    let w = wcache.get(key);
    if (w === undefined) {
      if (!mctx) { mctx = document.createElement('canvas').getContext('2d'); if ('fontKerning' in mctx) mctx.fontKerning = 'none'; } // PDF text is not kerned
      mctx.font = (bold ? 'bold ' : '') + '100px Helvetica, Arial, "Liberation Sans", "Nimbus Sans", sans-serif';
      w = mctx.measureText(text).width / 100;
      wcache.set(key, w);
    }
    return w;
  }
  // exact = true for placing text; otherwise a 1.5% safety margin is added for line-fitting decisions
  function measure(text, font, size, exact) {
    if (font === 'M' || font === 'MB') return text.length * 0.6 * size;
    return unitWidth(text, font === 'B') * size * (exact ? 1 : 1.015);
  }

  /* ------------------------------------------------------------------ colours */
  const INK = [0.169, 0.129, 0.114];
  const BODY = [0.25, 0.21, 0.19];
  const MUTED = [0.482, 0.416, 0.384];
  const SOFT = [0.984, 0.961, 0.945];
  const BORDER = [0.918, 0.871, 0.843];
  const WHITE = [1, 1, 1];
  const ACCENTS = { light: [0.784, 0.333, 0.239], dark: [0.247, 0.471, 0.659] };
  const rgb = (c) => c.map((v) => v.toFixed(3)).join(' ');
  const f = (v) => (Math.round(v * 100) / 100).toString();
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* ------------------------------------------------------------------ build */
  function build(model) {
    const state = { bad: false };
    const s = model.summary || {};
    const accent = model.dark ? ACCENTS.dark : ACCENTS.light;
    const N = (x) => norm(x, state);

    const title = N(s.title || 'Study notes');
    const overview = N(s.overview || '');
    const sections = (s.sections || []).map((sec, i) => ({
      heading: N(sec.heading || ''),
      points: (sec.points || []).map(N),
      diagram: sec.diagram && sec.diagram.mermaid ? { title: N(sec.diagram.title || 'Diagram'), img: (model.images && model.images[i]) || null } : null,
    }));
    const technical = (s.technical || []).map(N);
    const terms = (s.keyTerms || []).map((k) => ({ term: N(k.term), def: N(k.definition) }));
    if (state.bad) return null;

    const pages = [];
    let page = null, y = 0;
    const images = []; // { pw, ph, data }
    const newPage = () => { page = { ops: [], imgs: new Set() }; pages.push(page); y = PAGE.top; };
    const ensure = (h) => { if (y + h > PAGE.h - PAGE.bottom) newPage(); };
    const Y = (top) => f(PAGE.h - top);

    const fillRect = (x, top, w, h, c) => page.ops.push(`${rgb(c)} rg ${f(x)} ${Y(top + h)} ${f(w)} ${f(h)} re f`);
    const strokeRect = (x, top, w, h, c) => page.ops.push(`${rgb(c)} RG 0.6 w ${f(x)} ${Y(top + h)} ${f(w)} ${f(h)} re S`);
    const circle = (cx, cy, r, c) => {
      const k = 0.5523 * r, X = f(cx), T = Y(cy);
      page.ops.push(`${rgb(c)} rg ${f(cx + r)} ${T} m ` +
        `${f(cx + r)} ${f(PAGE.h - cy + k)} ${f(cx + k)} ${f(PAGE.h - cy + r)} ${X} ${f(PAGE.h - cy + r)} c ` +
        `${f(cx - k)} ${f(PAGE.h - cy + r)} ${f(cx - r)} ${f(PAGE.h - cy + k)} ${f(cx - r)} ${T} c ` +
        `${f(cx - r)} ${f(PAGE.h - cy - k)} ${f(cx - k)} ${f(PAGE.h - cy - r)} ${X} ${f(PAGE.h - cy - r)} c ` +
        `${f(cx + k)} ${f(PAGE.h - cy - r)} ${f(cx + r)} ${f(PAGE.h - cy - k)} ${f(cx + r)} ${T} c f`);
    };
    const text = (str, font, size, x, baseTop, c) =>
      page.ops.push(`BT /${FONT[font][0]} ${size} Tf ${rgb(c)} rg 1 0 0 1 ${f(x)} ${Y(baseTop)} Tm ${pdfStr(str)} Tj ET`);

    // **bold** and `code` inside a string -> styled runs
    const parseInline = (str, baseFont, color) => {
      const runs = [];
      String(str).split(/(\*\*[^*]+\*\*|`[^`]+`)/).forEach((p) => {
        if (!p) return;
        if (p.length > 4 && p.startsWith('**') && p.endsWith('**')) runs.push({ text: p.slice(2, -2), font: baseFont === 'M' ? 'MB' : 'B', color });
        else if (p.length > 2 && p.startsWith('`') && p.endsWith('`')) runs.push({ text: p.slice(1, -1), font: 'M', color: accent });
        else runs.push({ text: p, font: baseFont, color });
      });
      return runs;
    };

    // Greedy word wrap over styled runs -> lines of { segs: [{ text, font, color }] }
    function wrapRuns(runs, size, maxW) {
      const toks = [];
      runs.forEach((r) => r.text.split(/(\s+)/).forEach((tk) => {
        if (tk === '') return;
        toks.push(/^\s+$/.test(tk) ? { sp: true, font: r.font, color: r.color } : { text: tk, font: r.font, color: r.color });
      }));
      const lines = [];
      let cur = { segs: [], w: 0 }, space = null;
      const push = () => { lines.push(cur); cur = { segs: [], w: 0 }; };
      const add = (t, font, color, w) => {
        const last = cur.segs[cur.segs.length - 1];
        if (last && last.font === font && last.color === color) last.text += t; else cur.segs.push({ text: t, font, color });
        cur.w += w;
      };
      for (const t of toks) {
        if (t.sp) { space = t; continue; }
        const ww = measure(t.text, t.font, size);
        const sw = space && cur.segs.length ? measure(' ', space.font, size) : 0;
        if (cur.w + sw + ww <= maxW) {
          if (sw) add(' ', space.font, space.color, sw);
          add(t.text, t.font, t.color, ww);
        } else {
          if (cur.segs.length) push();
          if (ww <= maxW) add(t.text, t.font, t.color, ww);
          else {
            let chunk = '';
            for (const ch of Array.from(t.text)) {
              if (chunk && measure(chunk + ch, t.font, size) > maxW) { add(chunk, t.font, t.color, measure(chunk, t.font, size)); push(); chunk = ch; } else chunk += ch;
            }
            if (chunk) add(chunk, t.font, t.color, measure(chunk, t.font, size));
          }
        }
        space = null;
      }
      if (cur.segs.length) push();
      return lines;
    }

    // Draws wrapped runs line by line (page-breaking as needed). opts: x, w, size, lh, bullet, bar
    function paragraph(runs, opts) {
      const { x, w, size, lh } = opts;
      const lines = wrapRuns(runs, size, w);
      lines.forEach((ln, i) => {
        ensure(lh);
        const base = y + lh / 2 + size * 0.3;
        if (opts.bar) fillRect(opts.bar.x, y, 2.6, lh, opts.bar.color);
        if (opts.bullet && i === 0) text('•', 'B', size, x - 13, base, accent);
        let cx = x;
        ln.segs.forEach((sg) => { text(sg.text, sg.font, size, cx, base, sg.color); cx += measure(sg.text, sg.font, size, true); });
        y += lh;
      });
    }

    function sectionHeading(label) {
      const size = 14.5, lh = 19, w = CW - 14;
      const lines = wrapRuns([{ text: label, font: 'B', color: INK }], size, w);
      ensure(lines.length * lh + 46); // keep the heading together with what follows
      fillRect(PAGE.mx, y + 2, 4, 16, accent);
      paragraph([{ text: label, font: 'B', color: INK }], { x: PAGE.mx + 14, w, size, lh });
      y += 5;
    }

    /* ---- page 1 header ---- */
    newPage();
    circle(PAGE.mx + 5, y + 8, 5, accent);
    text('SmoothStudy', 'B', 12, PAGE.mx + 17, y + 12.2, INK);
    const d = new Date();
    const dateStr = `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    text(dateStr, 'M', 8.5, PAGE.w - PAGE.mx - measure(dateStr, 'M', 8.5), y + 11.5, MUTED);
    y += 40;

    paragraph([{ text: title, font: 'B', color: INK }], { x: PAGE.mx, w: CW, size: 24, lh: 30 });
    y += 6;
    fillRect(PAGE.mx, y, 38, 3, accent);
    y += 20;
    if (overview) {
      paragraph(parseInline(overview, 'R', BODY), { x: PAGE.mx + 13, w: CW - 13, size: 11.5, lh: 17.5, bar: { x: PAGE.mx, color: accent } });
      y += 6;
    }

    /* ---- sections ---- */
    sections.forEach((sec) => {
      y += 16;
      if (sec.heading) sectionHeading(sec.heading);
      sec.points.forEach((p) => {
        paragraph(parseInline(p, 'R', BODY), { x: PAGE.mx + 16, w: CW - 16, size: 10.5, lh: 15.6, bullet: true });
        y += 3;
      });
      const dg = sec.diagram;
      if (dg && dg.img) {
        const im = dg.img;
        const natW = im.w * 0.75, natH = im.h * 0.75;
        const sc = Math.min((CW - 28) / natW, 360 / natH, 1.4);
        const iw = natW * sc, ih = natH * sc;
        const boxH = 12 + 12 + ih + 16;
        y += 8;
        ensure(boxH);
        fillRect(PAGE.mx, y, CW, boxH, SOFT);
        strokeRect(PAGE.mx, y, CW, boxH, BORDER);
        text(dg.title.toUpperCase().slice(0, 90), 'M', 7.5, PAGE.mx + 14, y + 15, MUTED);
        const k = images.push({ pw: im.pw, ph: im.ph, data: im.data }) - 1;
        page.imgs.add(k);
        page.ops.push(`q ${f(iw)} 0 0 ${f(ih)} ${f(PAGE.mx + (CW - iw) / 2)} ${Y(y + 26 + ih)} cm /Im${k} Do Q`);
        y += boxH + 4;
      }
    });

    /* ---- technical reference ---- */
    if (technical.length) {
      y += 24;
      ensure(70);
      fillRect(PAGE.mx, y, CW, 21, accent);
      text('TECHNICAL REFERENCE', 'MB', 8, PAGE.mx + 12, y + 14, WHITE);
      y += 21;
      const size = 9, lh = 15, maxChars = Math.floor((CW - 24) / (0.6 * size));
      const rows = [];
      technical.forEach((t) => {
        let rest = t;
        if (!rest.trim()) return;
        while (rest.length > maxChars) {
          let cut = rest.lastIndexOf(' ', maxChars);
          if (cut < maxChars * 0.5) cut = maxChars;
          rows.push(rest.slice(0, cut));
          rest = rest.slice(cut).replace(/^ /, '');
        }
        rows.push(rest);
      });
      fillRect(PAGE.mx, y, CW, 6, SOFT); y += 6;
      rows.forEach((r) => {
        ensure(lh);
        fillRect(PAGE.mx, y, CW, lh, SOFT);
        text(r, 'M', size, PAGE.mx + 12, y + lh / 2 + size * 0.3, INK);
        y += lh;
      });
      fillRect(PAGE.mx, y, CW, 8, SOFT); y += 8;
    }

    /* ---- key terms ---- */
    if (terms.length) {
      y += 22;
      sectionHeading('Key terms');
      terms.forEach((t) => {
        paragraph(
          [{ text: t.term, font: 'MB', color: accent }, { text: '  –  ' + t.def, font: 'R', color: BODY }],
          { x: PAGE.mx, w: CW, size: 10, lh: 15 }
        );
        y += 4;
      });
    }

    /* ---- footers (need the page count) ---- */
    const total = pages.length;
    pages.forEach((pg, i) => {
      page = pg;
      pg.ops.push(`${rgb(BORDER)} RG 0.5 w ${f(PAGE.mx)} ${f(PAGE.bottom - 14)} m ${f(PAGE.w - PAGE.mx)} ${f(PAGE.bottom - 14)} l S`);
      text(N("SmoothStudy isn't human. It can make mistakes, so double-check it."), 'R', 7.5, PAGE.mx, PAGE.h - (PAGE.bottom - 14) + 14, MUTED);
      const label = `Page ${i + 1} of ${total}`;
      text(label, 'M', 7.5, PAGE.w - PAGE.mx - measure(label, 'M', 7.5), PAGE.h - (PAGE.bottom - 14) + 14, MUTED);
    });

    /* ---- file assembly ---- */
    const objs = [];
    const add = (body) => { objs.push(body); return objs.length; };
    add(null); // 1 catalog
    add(null); // 2 pages
    const fontIds = ['R', 'B', 'M', 'MB'].map((k) => add(`<< /Type /Font /Subtype /Type1 /BaseFont /${FONT[k][1]} /Encoding /WinAnsiEncoding >>`));
    const pad = (n) => String(n).padStart(2, '0');
    const info = add(`<< /Title ${pdfStr(title.replace(/\?/g, ''))} /Producer (SmoothStudy) /Creator (SmoothStudy) /CreationDate (D:${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}) >>`);
    const imgIds = images.map((im) => add(`<< /Type /XObject /Subtype /Image /Width ${im.pw} /Height ${im.ph} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.data.length} >>\nstream\n${im.data}\nendstream`));
    const kids = [];
    pages.forEach((pg) => {
      const content = pg.ops.join('\n');
      const cid = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      const xo = [...pg.imgs].map((k) => `/Im${k} ${imgIds[k]} 0 R`).join(' ');
      const pid = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.w} ${PAGE.h}] /Resources << /Font << ${['F1', 'F2', 'F3', 'F4'].map((n, i) => `/${n} ${fontIds[i]} 0 R`).join(' ')} >>${xo ? ` /XObject << ${xo} >>` : ''} >> /Contents ${cid} 0 R >>`);
      kids.push(`${pid} 0 R`);
    });
    objs[0] = '<< /Type /Catalog /Pages 2 0 R >>';
    objs[1] = `<< /Type /Pages /Count ${kids.length} /Kids [ ${kids.join(' ')} ] >>`;

    let out = '%PDF-1.4\n%âãÏÓ\n';
    const offsets = [];
    objs.forEach((b, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${b}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
    return bytes;
  }

  window.SmoothPDF = { build, normalize: (s) => { const st = { bad: false }; const text = norm(s, st); return { text, bad: st.bad }; } };
})();
