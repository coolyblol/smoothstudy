// Text extraction for common document formats. No npm dependencies:
// Office files are zip archives, read here with Node's built-in zlib.
const zlib = require('zlib');

const KINDS = {
  pdf: 'pdf',
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image',
  docx: 'docx', docm: 'docx', dotx: 'docx',
  pptx: 'pptx', pptm: 'pptx', ppsx: 'pptx', potx: 'pptx',
  xlsx: 'xlsx', xlsm: 'xlsx', xltx: 'xlsx',
  odt: 'odf', odp: 'odf', ods: 'odf',
  txt: 'text', md: 'text', markdown: 'text', csv: 'text', tsv: 'text', json: 'text',
  xml: 'text', yaml: 'text', yml: 'text', log: 'text', tex: 'text',
  html: 'html', htm: 'html',
  rtf: 'rtf',
  doc: 'legacy', ppt: 'legacy', xls: 'legacy',
};
const IMAGE_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };

const extOf = (name) => (String(name).split('.').pop() || '').toLowerCase();
const kindOf = (name) => KINDS[extOf(name)] || null;
const imageTypeOf = (name) => IMAGE_TYPES[extOf(name)] || null;

function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a valid document (could not open it as an Office/zip file).');
  const total = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = {};
  for (let n = 0; n < total; n++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nlen = buf.readUInt16LE(off + 28), elen = buf.readUInt16LE(off + 30), clen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    entries[buf.toString('utf8', off + 46, off + 46 + nlen)] = { method, csize, lho };
    off += 46 + nlen + elen + clen;
  }
  return {
    names: Object.keys(entries),
    read(name) {
      const e = entries[name];
      if (!e) return null;
      const nlen = buf.readUInt16LE(e.lho + 26), elen = buf.readUInt16LE(e.lho + 28);
      const start = e.lho + 30 + nlen + elen;
      const data = buf.subarray(start, start + e.csize);
      if (e.method === 0) return data;
      if (e.method === 8) return zlib.inflateRawSync(data, { maxOutputLength: 200 * 1024 * 1024 });
      throw new Error('uses an unsupported compression method.');
    },
    text(name) { const b = this.read(name); return b ? b.toString('utf8') : null; },
  };
}

function decode(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos|nbsp);/g, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch (_) { return ''; }
    }
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[e];
  });
}

// Collect the text runs of each paragraph in an OOXML part.
function paragraphs(xml, pTag, tTag) {
  const out = [];
  const re = new RegExp('<' + tTag + '(?:\\s[^>]*)?>([^<]*)</' + tTag + '>|<w:tab/>', 'g');
  for (const part of xml.split('</' + pTag + '>')) {
    let line = '', m;
    re.lastIndex = 0;
    while ((m = re.exec(part))) line += m[1] !== undefined ? decode(m[1]) : '\t';
    if (line.trim()) out.push(line);
  }
  return out;
}

function fromDocx(buf) {
  const z = readZip(buf);
  const doc = z.text('word/document.xml');
  if (!doc) throw new Error('is not a Word document.');
  const parts = [paragraphs(doc, 'w:p', 'w:t').join('\n')];
  for (const n of z.names.filter((n) => /^word\/(footnotes|endnotes)\.xml$/.test(n)).sort()) {
    const t = paragraphs(z.text(n), 'w:p', 'w:t').join('\n');
    if (t) parts.push('Notes:\n' + t);
  }
  return parts.join('\n\n');
}

function fromPptx(buf) {
  const z = readZip(buf);
  const slides = z.names
    .map((n) => ({ n, m: n.match(/^ppt\/slides\/slide(\d+)\.xml$/) }))
    .filter((x) => x.m)
    .sort((a, b) => +a.m[1] - +b.m[1]);
  if (!slides.length) throw new Error('is not a PowerPoint file.');
  const out = [];
  slides.forEach((s, i) => {
    const lines = paragraphs(z.text(s.n), 'a:p', 'a:t');
    let notes = [];
    const rels = z.text(`ppt/slides/_rels/slide${s.m[1]}.xml.rels`) || '';
    const nm = rels.match(/notesSlides\/(notesSlide\d+\.xml)/);
    if (nm) {
      const nx = z.text('ppt/notesSlides/' + nm[1]);
      // Notes pages repeat the slide number as a field; keep only real text.
      if (nx) notes = paragraphs(nx, 'a:p', 'a:t').filter((l) => !/^\d+$/.test(l.trim()));
    }
    if (!lines.length && !notes.length) return;
    out.push(`--- Slide ${i + 1} ---\n${lines.join('\n')}` + (notes.length ? `\nSpeaker notes: ${notes.join(' ')}` : ''));
  });
  return out.join('\n\n');
}

function colIndex(ref) {
  const letters = (ref.match(/^[A-Z]+/) || ['A'])[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function fromXlsx(buf) {
  const z = readZip(buf);
  const shared = [];
  const ss = z.text('xl/sharedStrings.xml');
  if (ss) {
    for (const si of ss.match(/<si>[\s\S]*?<\/si>|<si\/>/g) || []) {
      shared.push(decode((si.match(/<t(?:\s[^>]*)?>[^<]*<\/t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join('')));
    }
  }
  const wb = z.text('xl/workbook.xml') || '';
  const rels = z.text('xl/_rels/workbook.xml.rels') || '';
  const relMap = {};
  for (const r of rels.match(/<Relationship\b[^>]*>/g) || []) {
    const id = (r.match(/\bId="([^"]+)"/) || [])[1];
    const target = (r.match(/\bTarget="([^"]+)"/) || [])[1];
    if (id && target) relMap[id] = target.replace(/^\/?(xl\/)?/, 'xl/');
  }
  const sheets = [];
  for (const s of wb.match(/<sheet\b[^>]*>/g) || []) {
    const name = decode((s.match(/\bname="([^"]*)"/) || [])[1] || 'Sheet');
    const rid = (s.match(/\br:id="([^"]+)"/) || [])[1];
    if (relMap[rid]) sheets.push({ name, path: relMap[rid] });
  }
  if (!sheets.length) throw new Error('is not an Excel workbook.');
  const out = [];
  for (const sh of sheets) {
    const xml = z.text(sh.path);
    if (!xml) continue;
    const rows = [];
    for (const row of xml.match(/<row\b[\s\S]*?<\/row>/g) || []) {
      const cells = [];
      const cre = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
      let m;
      while ((m = cre.exec(row))) {
        const attrs = m[1], inner = m[2] || '';
        const ref = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1];
        const t = (attrs.match(/\bt="(\w+)"/) || [])[1];
        let val = '';
        if (t === 's') val = shared[+((inner.match(/<v>(\d+)<\/v>/) || [])[1])] || '';
        else if (t === 'inlineStr') val = decode((inner.match(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g) || []).map((x) => x.replace(/<[^>]+>/g, '')).join(''));
        else val = decode((inner.match(/<v>([^<]*)<\/v>/) || [])[1] || '');
        if (val !== '' && ref) cells[colIndex(ref)] = val;
      }
      if (cells.length) rows.push(Array.from(cells, (c) => c || '').join('\t'));
    }
    if (rows.length) out.push(`--- Sheet: ${sh.name} ---\n${rows.join('\n')}`);
  }
  return out.join('\n\n');
}

function fromOdf(buf) {
  const z = readZip(buf);
  let xml = z.text('content.xml');
  if (!xml) throw new Error('is not an OpenDocument file.');
  xml = xml
    .replace(/<text:(tab)\/>/g, '\t')
    .replace(/<text:line-break\/>/g, '\n')
    .replace(/<\/draw:page>/g, '\n\n--- next slide ---\n\n')
    .replace(/<\/(text:p|text:h|table:table-row)>/g, '\n')
    .replace(/<\/table:table-cell>/g, '\t')
    .replace(/<[^>]+>/g, '');
  return decode(xml).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
}

function fromHtml(buf) {
  return decode(
    buf.toString('utf8')
      .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>|<\/(p|div|li|tr|h[1-6]|section|article)>/gi, '\n')
      .replace(/<\/t[dh]>/gi, '\t')
      .replace(/<[^>]+>/g, '')
  ).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
}

function fromRtf(buf) {
  return buf.toString('latin1')
    .replace(/\{\\\*[^{}]*\}/g, '')
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\'([0-9a-fA-F]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\[a-zA-Z]+-?\d* ?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\n{3,}/g, '\n\n');
}

// kind is one of the text-based kinds from kindOf(). Returns plain text.
function extractText(kind, buf) {
  switch (kind) {
    case 'docx': return fromDocx(buf);
    case 'pptx': return fromPptx(buf);
    case 'xlsx': return fromXlsx(buf);
    case 'odf': return fromOdf(buf);
    case 'html': return fromHtml(buf);
    case 'rtf': return fromRtf(buf);
    case 'text': return buf.toString('utf8').replace(/^﻿/, '');
    default: throw new Error('is not a supported file type.');
  }
}

module.exports = { kindOf, imageTypeOf, extractText };
