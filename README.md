# SmoothStudy

Upload notes (PDF, JPG, PNG) or type them, get a condensed summary with diagrams, then quiz yourself.

## Run it

Requires Node 18 or newer. There is nothing to install.

1. Open `.env` and paste your Anthropic (or any AI) API key after `ANTHROPIC_API_KEY=`.
2. Run `node server.js`
3. Open http://localhost:3000

## Demo mode (no API key needed)

Run `node server.js --demo` (or set `DEMO_MODE=1`) to skip the AI. Uploads are still validated and read for real, but the summary and quiz come from built-in sample data about photosynthesis, so you can test the summary page, diagrams and the whole quiz flow.

The key is only read by `server.js`. It is never sent to the browser, so do not paste it into `app.js` or `index.html`.

Supported uploads (up to 5 files, 50 MB each): PDF, PowerPoint (.pptx), Word (.docx), Excel (.xlsx), OpenDocument (.odt/.odp/.ods), TXT, Markdown, CSV, JSON, HTML, RTF and images (JPG, PNG, GIF, WebP). Old .doc/.ppt/.xls files must be re-saved in the newer format.

The AI itself accepts at most about 30 MB of PDFs and images per request, and 5 MB per image. Office and text files are converted to text on the server, so they are not affected.

The summary page has a download button that saves the notes as a PDF (text, diagrams, technical box and key terms). It is generated in the browser by `pdf.js`, with no extra libraries. If the notes contain characters the built-in PDF fonts cannot show (for example Cyrillic or Chinese), the button opens the browser's print dialog instead, where you choose "Save as PDF".

Diagrams use Mermaid and fonts come from Google Fonts, so the browser needs internet access.
