// Browser-side .pdf -> line-array extraction, via a vendored pdf.js (production/vendor/,
// same "vendor a finished build artifact" pattern src/fabric.min.js and
// subtitles/transformers.min.js already use in this repo — PDF text extraction is not a
// small enough problem to hand-roll like the .docx ZIP reader is). Produces a flat array of
// text lines, grouped by y-position jumps in each page's text layer, for
// import_parse.js's parseFromPdfLines() to consume.

let pdfjsLib = null;
async function getPdfjs() {
  if (!pdfjsLib) {
    pdfjsLib = await import('./vendor/pdf.min.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;
  }
  return pdfjsLib;
}

export async function extractPdfLines(file) {
  const lib = await getPdfjs();
  const buf = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: buf }).promise;
  const lines = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    let lastY = null;
    let current = '';
    for (const item of content.items) {
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        if (current.trim()) lines.push(current.trim());
        current = '';
      }
      current += (current && !current.endsWith(' ') && !item.str.startsWith(' ') ? ' ' : '') + item.str;
      lastY = y;
      if (item.hasEOL) {
        if (current.trim()) lines.push(current.trim());
        current = '';
        lastY = null;
      }
    }
    if (current.trim()) lines.push(current.trim());
  }
  return lines;
}
