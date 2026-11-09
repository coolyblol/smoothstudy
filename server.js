// SmoothStudy server: no npm dependencies (Node 18+).
// The Anthropic API key stays here on the server and is never sent to the browser.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { kindOf, imageTypeOf, extractText } = require('./extract');

// Minimal .env loader
try {
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
} catch (_) {}

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5';
const PORT = process.env.PORT || 3000;
const MAX_BODY = 360 * 1024 * 1024; // 5 files x 50 MB, base64-encoded

const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
};

const SUMMARY_SYSTEM = `You are SmoothStudy, an expert study-notes condenser. You receive a student's notes or textbook material (text, images, PDFs).
Produce a summary that keeps ALL the important information and every key concept, but scaled down (roughly 30-40% of the original length) so the student can finish studying faster. Do not invent facts that are not supported by the material.

Return ONLY valid JSON (no markdown fences, no commentary) with this exact shape:
{
  "title": "short title for the material",
  "overview": "2-3 sentence big-picture overview",
  "sections": [
    {
      "heading": "section heading",
      "points": ["concise study point, may use **bold** for key terms and \`code\` for formulas or technical tokens", "..."],
      "diagram": { "title": "diagram title", "mermaid": "mermaid source" } 
    }
  ],
  "technical": ["formulas, equations, code or exact technical facts worth memorising, one per entry"],
  "keyTerms": [ { "term": "term", "definition": "short definition" } ]
}

Rules:
- "diagram" is optional per section; include it (as a flowchart, sequence, mindmap or timeline) only where it genuinely helps understanding, at most 4 diagrams in total. Otherwise use null.
- Mermaid rules: valid Mermaid syntax only. Start with e.g. "flowchart TD". Wrap every node label in double quotes, e.g. A["Label text"]. Avoid parentheses, quotes, colons and special characters inside labels. Keep diagrams small (under 12 nodes).
- "technical" and "keyTerms" may be empty arrays.
- Write in clear student-friendly language in the same language as the source material.`;

const QUIZ_SYSTEM = `You are SmoothStudy's quiz generator. Using ONLY the study summary provided, write multiple choice questions that test understanding.
Return ONLY valid JSON (no markdown fences, no commentary) with this exact shape:
{ "questions": [ { "question": "text", "options": ["A text", "B text", "C text", "D text"], "answer": 0, "explanation": "why the answer is right, one or two sentences", "difficulty": "Easy" | "Medium" | "Hard" } ] }
Rules:
- Exactly 4 options per question, exactly one correct; "answer" is the zero-based index of the correct option.
- Vary the position of the correct answer. Distractors must be plausible, not silly.
- Easy = direct recall of a fact or term. Medium = understanding and applying a concept. Hard = multi-step reasoning, comparing concepts, or edge cases.
- If the requested difficulty is Mixed, use a roughly even spread of Easy, Medium and Hard. Otherwise every question uses the requested difficulty.
- Do not repeat questions. Cover the whole summary rather than one section.`;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('Upload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function extractJSON(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('The AI did not return structured data. Please try again.');
  return JSON.parse(text.slice(start, end + 1));
}

async function callClaude(system, content, maxTokens) {
  if (!KEY) throw new Error('Server has no ANTHROPIC_API_KEY set. See README.md.');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data.error && data.error.message) || `AI request failed (${r.status})`);
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

const API_MAX_BYTES = 30 * 1024 * 1024; // the AI request limit is 32 MB in total
const IMAGE_MAX_BYTES = 5 * 1024 * 1024; // per-image limit of the AI
const TEXT_CAP_PER_FILE = 300000;
const TEXT_CAP_TOTAL = 700000;

async function handleSummarize(body) {
  const blocks = [];
  let inlineBytes = 0, textTotal = 0;
  for (const f of body.files || []) {
    if (!f || typeof f.data !== 'string') continue;
    const name = String(f.name || 'file');
    const kind = kindOf(name);
    if (!kind) throw new Error(`${name}: this file type isn't supported.`);
    if (kind === 'legacy') throw new Error(`${name}: old .doc, .ppt and .xls files can't be read. Open it and save as .docx, .pptx or .xlsx (or export to PDF), then upload again.`);
    const buf = Buffer.from(f.data, 'base64');
    if (kind === 'pdf' || kind === 'image') {
      if (kind === 'image' && buf.length > IMAGE_MAX_BYTES) throw new Error(`${name}: images over 5 MB can't be read by the AI. Resize or compress it first.`);
      inlineBytes += buf.length;
      if (inlineBytes > API_MAX_BYTES) throw new Error('PDFs and images together are over the ~30 MB the AI can read in one go. Upload fewer or smaller ones, or split the PDF.');
      if (kind === 'pdf') blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.data } });
      else blocks.push({ type: 'image', source: { type: 'base64', media_type: imageTypeOf(name), data: f.data } });
    } else {
      let text;
      try { text = extractText(kind, buf).trim(); }
      catch (e) { throw new Error(`${name}: ${e.message}`); }
      if (!text) throw new Error(`${name}: no readable text found (a deck made only of pictures, for example). Export it to PDF and upload that instead.`);
      text = text.slice(0, Math.min(TEXT_CAP_PER_FILE, Math.max(0, TEXT_CAP_TOTAL - textTotal)));
      textTotal += text.length;
      if (text) blocks.push({ type: 'text', text: `Content of "${name}":\n\n${text}` });
    }
  }
  const typed = (body.text || '').toString().slice(0, 200000);
  if (typed.trim()) blocks.push({ type: 'text', text: `Student's typed notes:\n\n${typed}` });
  if (!blocks.length) throw new Error('Nothing to summarise. Add notes or upload a file.');
  blocks.push({ type: 'text', text: 'Create the study summary JSON now.' });
  return extractJSON(await callClaude(SUMMARY_SYSTEM, blocks, 12000));
}

async function handleQuiz(body) {
  const count = [5, 10, 20].includes(body.count) ? body.count : 10;
  const difficulty = ['Easy', 'Medium', 'Hard', 'Mixed'].includes(body.difficulty) ? body.difficulty : 'Mixed';
  const summary = JSON.stringify(body.summary || {}).slice(0, 150000);
  const prompt = `Study summary (JSON):\n${summary}\n\nWrite exactly ${count} multiple choice questions. Difficulty: ${difficulty}.`;
  const out = extractJSON(await callClaude(QUIZ_SYSTEM, [{ type: 'text', text: prompt }], 12000));
  const qs = (out.questions || []).filter(
    (q) => q && q.question && Array.isArray(q.options) && q.options.length >= 2 && Number.isInteger(q.answer) && q.options[q.answer] !== undefined
  );
  if (!qs.length) throw new Error('Could not build a quiz from that summary. Please try again.');
  return { questions: qs.slice(0, count) };
}

http
  .createServer(async (req, res) => {
    try {
      const url = req.url.split('?')[0];
      if (req.method === 'GET' && STATIC[url]) {
        const [file, type] = STATIC[url];
        res.writeHead(200, { 'Content-Type': type });
        return res.end(fs.readFileSync(path.join(__dirname, file)));
      }
      if (req.method === 'POST' && (url === '/api/summarize' || url === '/api/quiz')) {
        const body = JSON.parse((await readBody(req)) || '{}');
        const result = url === '/api/summarize' ? await handleSummarize(body) : await handleQuiz(body);
        return send(res, 200, result);
      }
      res.writeHead(404);
      res.end('Not found');
    } catch (e) {
      send(res, 500, { error: e.message || 'Something went wrong' });
    }
  })
  .listen(PORT, () => {
    console.log(`SmoothStudy running at http://localhost:${PORT}`);
    if (!KEY) console.log('Warning: ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.');
  });
