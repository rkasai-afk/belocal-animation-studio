// Pure text/structure parsing for the BeLocal production-document format ("Redesigned"
// docs) — no DOM, no browser APIs, so this half of the importer is unit-testable in plain
// Node (see tests/test_production_import_parse.js) independent of how the source bytes were
// pulled out of a .docx or .pdf. The browser-only extraction (ZIP+XML for .docx, pdf.js for
// .pdf) lives in import_docx.js / import_pdf.js and just produces the block/line arrays
// these functions consume.
//
// Both the older plain format (EP01-13) and the newer "bracketed" format (EP14, with
// [OWN]/[GRAPHIC]/[SOURCE] visual-type tags and a RESEARCH EVALUATION confidence section)
// are handled — this is a real, evolving house style, not one fixed template. Parsing is
// deliberately best-effort: nothing here throws on a line it doesn't recognize, and every
// section falls back to "leave it blank, let the user fill it in after import" rather than
// guessing wrong. See production/README.md for the full field-mapping writeup.

const VISUAL_TAGS = ['OWN', 'SOURCE', 'GRAPHIC', 'FREE', 'STOCK', 'ARCHIVE', 'PHOTO'];

export function detectVisualType(text) {
  const bracketMatch = text.match(/\[(OWN|SOURCE|GRAPHIC|FREE|STOCK|ARCHIVE|PHOTO)\]/);
  if (bracketMatch) return bracketMatch[1];
  const lower = text.toLowerCase();
  if (lower.includes('graphic') || lower.includes('chart') || lower.includes('map graphic')) return 'GRAPHIC';
  if (/\bstock\b/.test(lower)) return 'STOCK';
  if (/\barchive\b/.test(lower)) return 'ARCHIVE';
  if (/\bphoto\b/.test(lower)) return 'PHOTO';
  if (lower.includes('source') && !lower.includes('b-roll') && !lower.includes('footage') && !lower.includes('shot')) return 'SOURCE';
  return 'OWN';
}

export function extractSourceCodes(text) {
  const codes = [...text.matchAll(/S(\d{2})/g)].map((m) => `S${m[1]}`);
  return [...new Set(codes)];
}

// "1.  Publisher — Title, extra detail. mlit.go.jp/foo/bar.html" (URL is often written
// without a protocol in these docs) -> { code, publisher, title, url }
export function parseSourceLine(line, index) {
  const m = line.match(/^\s*(\d+)\.\s*(.+)$/);
  const body = m ? m[2] : line;
  const urlMatch = body.match(/(https?:\/\/[^\s]+)|([a-z0-9.-]+\.(?:go\.jp|co\.jp|or\.jp|ne\.jp|jp|com|org|net)(?:\/[^\s]*)?)/i);
  let url = '';
  let rest = body;
  if (urlMatch) {
    url = urlMatch[0].replace(/[.,]+$/, '');
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    rest = (body.slice(0, urlMatch.index) + body.slice(urlMatch.index + urlMatch[0].length)).trim();
  }
  rest = rest.replace(/\.\s*$/, '').trim();
  const dashSplit = rest.split(/\s[-–—]\s/);
  const publisher = dashSplit.length > 1 ? dashSplit[0].trim() : '';
  const title = dashSplit.length > 1 ? dashSplit.slice(1).join(' — ').trim() : rest;
  return { code: `S${String(index + 1).padStart(2, '0')}`, publisher, title, url };
}

function bannerToFactStatus(banner) {
  const b = (banner || '').toUpperCase();
  if (b.includes('MANDATORY') || b.includes('RECHECK') || b.includes('TIME-SENSITIVE') || b.includes('HIGH-STAKES')) return 'RECHECK REQUIRED';
  if (b.includes('VERIFIED') || b.includes('READY') || b.includes('CURRENT')) return 'CURRENT';
  return 'UNVERIFIED';
}

// Shared post-processing once a format-specific parser has produced the raw sections:
// resolves per-beat source codes against the parsed source list, and derives the Fact Lock
// claims (one from THE VERDICT, plus one per bullet in a RESEARCH EVALUATION section when
// the doc has one — REJECTED OVERCLAIM bullets become guardrail notes instead of claims,
// since they describe what NOT to say, not something the script asserts).
export function finalizeParsedEpisode(raw) {
  const sources = raw.sources.map((s, i) => ({ ...s, code: s.code || `S${String(i + 1).padStart(2, '0')}` }));
  const sourceByCode = new Map(sources.map((s) => [s.code, s]));

  const beats = raw.beats.map((b) => {
    const codes = extractSourceCodes(b.sourceNote || '');
    const primary = codes.find((c) => sourceByCode.has(c)) || null;
    return { ...b, sourceCode: primary, allSourceCodes: codes };
  });

  const guardrailParts = [];
  if (raw.verdict) guardrailParts.push(`THE VERDICT\n${raw.verdict}`);
  if (raw.thingsToKnow.length) guardrailParts.push(`3 THINGS TO KNOW BEFORE YOU FILM\n${raw.thingsToKnow.map((t) => `• ${t}`).join('\n')}`);
  if (raw.notThis.length) guardrailParts.push(`WHAT THIS EPISODE IS NOT\n${raw.notThis.map((t) => `• ${t}`).join('\n')}`);
  if (raw.guardrails) guardrailParts.push(`EDITORIAL GUARDRAILS\n${raw.guardrails}`);
  if (raw.researchEval?.rejected?.length) {
    guardrailParts.push(`REJECTED OVERCLAIMS — do not say these\n${raw.researchEval.rejected.map((t) => `• ${t}`).join('\n')}`);
  }
  if (raw.recheck) guardrailParts.push(`RECHECK CONDITION\n${raw.recheck}`);

  const claims = [];
  if (raw.verdict) {
    claims.push({ claim: raw.verdict, status: bannerToFactStatus(raw.banner), risk: 'MEDIUM' });
  }
  for (const item of raw.researchEval?.high || []) {
    claims.push({ claim: item, status: 'VERIFIED', risk: 'LOW' });
  }
  for (const item of raw.researchEval?.moderate || []) {
    claims.push({ claim: item, status: 'VERIFIED WITH QUALIFIER', risk: 'MEDIUM' });
  }

  return {
    number: raw.number,
    title: raw.title,
    description: raw.verdict,
    runtimeTarget: raw.runtime,
    productionNotes: guardrailParts.join('\n\n'),
    longScript: beats.map((b) => `[${b.timeStart || b.title}] ${b.title}\n${b.narration}`).join('\n\n'),
    shortScript: raw.shortScript,
    masterCaption: raw.masterCaption,
    beats,
    sources,
    claims,
  };
}

// --- .docx: parses the {type:'p'|'tr', text|cells} block list from import_docx.js -------

export function parseFromDocxBlocks(blocks) {
  const raw = {
    number: '', title: '', banner: '', runtime: '', recheck: '', verdict: '',
    thingsToKnow: [], notThis: [], guardrails: '', researchEval: null,
    beats: [], sources: [], shortScript: '', masterCaption: '',
  };
  let section = 'header';
  let pendingTitle = '';
  let sourceIndex = 0;

  for (const block of blocks) {
    if (block.type === 'p') {
      const text = block.text.trim();
      if (!text) continue;
      if (/^EPISODE\s+(\d+)/i.test(text)) { raw.number = text.match(/\d+/)[0]; continue; }
      if (section === 'header' && !raw.title) { raw.title = text; continue; }
      if (/^3 THINGS TO KNOW/i.test(text)) { section = 'things'; continue; }
      if (/^WHAT THIS EPISODE IS NOT/i.test(text)) { section = 'notthis'; continue; }
      if (/^Script (&|and) Video Directions/i.test(text)) { section = 'beats'; continue; }
      if (/^Sources$/i.test(text)) { section = 'sources'; continue; }
      if (/^Short-Form Cut/i.test(text)) { section = 'shortform'; continue; }
      if (/^Publishing Copy/i.test(text)) { section = 'publishing'; continue; }
      if (/^Before You Publish/i.test(text)) { section = 'footer'; continue; }
      if (section === 'things') { raw.thingsToKnow.push(text); continue; }
      if (section === 'notthis') { raw.notThis.push(text); continue; }
      if (section === 'sources' && /^\d+\.\s/.test(text)) { raw.sources.push(parseSourceLine(text, sourceIndex++)); continue; }
      if (section === 'beats') { pendingTitle = text; continue; } // beat title paragraph, table row follows
    } else if (block.type === 'tr') {
      const [c0, c1] = block.cells;
      const cell0 = (c0 || '').trim();
      if (!raw.banner && section === 'header' && block.cells.length === 1) { raw.banner = cell0; continue; }
      if (/^RUNTIME/i.test(cell0)) {
        raw.runtime = cell0.replace(/^RUNTIME/i, '').replace(/\|.*$/, '').trim();
        const recheckMatch = block.cells.join(' | ').match(/RECHECK\s*(.+)$/i);
        if (recheckMatch) raw.recheck = recheckMatch[1].trim();
        continue;
      }
      if (/^THE VERDICT/i.test(cell0)) { raw.verdict = cell0.replace(/^THE VERDICT/i, '').trim(); continue; }
      if (/^EDITORIAL GUARDRAILS/i.test(cell0)) { raw.guardrails = cell0.replace(/^EDITORIAL GUARDRAILS/i, '').trim(); continue; }
      if (/^NARRATION/i.test(cell0)) {
        const narration = cell0.replace(/^NARRATION/i, '').trim();
        const visualRaw = (c1 || '').replace(/^VISUAL\s*&?\s*SOURCE/i, '').trim();
        const sourceMatch = visualRaw.match(/Sources?:\s*([^.]*)\.?/i);
        const editCautionMatch = visualRaw.match(/EDIT CAUTION:\s*(.+)$/i);
        const timeMatch = pendingTitle.match(/^(\d{2}:\d{2})\s*[–—-]\s*(\d{2}:\d{2})\s+(.*)$/);
        raw.beats.push({
          timeStart: timeMatch ? timeMatch[1] : '',
          timeEnd: timeMatch ? timeMatch[2] : '',
          title: timeMatch ? timeMatch[3] : pendingTitle,
          narration,
          visualType: detectVisualType(visualRaw),
          visualInstruction: visualRaw,
          sourceNote: sourceMatch ? sourceMatch[0] : visualRaw,
          editCaution: editCautionMatch ? editCautionMatch[1].trim() : '',
        });
        continue;
      }
      if (/^FINAL SPOKEN SCRIPT/i.test(cell0)) { raw.shortScript = cell0.replace(/^FINAL SPOKEN SCRIPT/i, '').trim(); continue; }
      if (/^YOUTUBE DESCRIPTION/i.test(cell0)) { raw.masterCaption = cell0.replace(/^YOUTUBE DESCRIPTION[^)]*\)?/i, '').trim(); continue; }
    }
  }

  return finalizeParsedEpisode(raw);
}

// --- .pdf: parses the flat, y-position-grouped line array from import_pdf.js -------------

const PDF_HEADINGS = [
  '3 THINGS TO KNOW BEFORE YOU FILM', 'WHAT THIS EPISODE IS NOT', 'EDITORIAL GUARDRAILS',
  'RESEARCH EVALUATION', 'Script and Video Directions', 'Script & Video Directions', 'Sources',
  'Short-Form Cut', 'Publishing Copy', 'Before You Publish', 'RUNTIME', 'RECHECK', 'THE VERDICT',
];

function isHeading(line, pattern) {
  return new RegExp(`^${pattern}`, 'i').test(line.trim());
}

export function parseFromPdfLines(lines) {
  const clean = lines
    .map((l) => l.trim())
    .filter((l) => l && !/^BELOCAL JAPAN EXPLAINER SERIES/i.test(l) && !/^\d+$/.test(l));

  const raw = {
    number: '', title: '', banner: '', runtime: '', recheck: '', verdict: '',
    thingsToKnow: [], notThis: [], guardrails: '', researchEval: { high: [], moderate: [], rejected: [] },
    beats: [], sources: [], shortScript: '', masterCaption: '',
  };

  let i = 0;
  const epMatch = clean.find((l) => /^EPISODE\s+\d+/i.test(l));
  if (epMatch) raw.number = epMatch.match(/\d+/)[0];
  const epIdx = clean.findIndex((l) => /^EPISODE\s+\d+/i.test(l));
  if (epIdx >= 0 && clean[epIdx + 1]) raw.title = clean[epIdx + 1];

  const runtimeIdx = clean.findIndex((l) => /^RUNTIME$/i.test(l));
  const rechIdx = clean.findIndex((l) => /^RECHECK$/i.test(l));
  if (runtimeIdx >= 0) {
    raw.banner = clean[epIdx + 2] && clean[epIdx + 2] !== 'RUNTIME' ? clean[epIdx + 2] : '';
    raw.runtime = clean.slice(runtimeIdx + 1, rechIdx > runtimeIdx ? rechIdx : runtimeIdx + 2).join(' ');
  }
  const verdictIdx = clean.findIndex((l) => /^THE VERDICT$/i.test(l));
  const thingsIdx = clean.findIndex((l) => /^3 THINGS TO KNOW/i.test(l));
  if (rechIdx >= 0 && verdictIdx > rechIdx) raw.recheck = clean.slice(rechIdx + 1, verdictIdx).join(' ');
  if (verdictIdx >= 0 && thingsIdx > verdictIdx) raw.verdict = clean.slice(verdictIdx + 1, thingsIdx).join(' ');

  const notThisIdx = clean.findIndex((l) => /^WHAT THIS EPISODE IS NOT/i.test(l));
  if (thingsIdx >= 0 && notThisIdx > thingsIdx) {
    raw.thingsToKnow = clean.slice(thingsIdx + 1, notThisIdx).map((l) => l.replace(/^[●•]\s*/, ''));
  }
  const guardrailsIdx = clean.findIndex((l) => /^EDITORIAL GUARDRAILS/i.test(l));
  if (notThisIdx >= 0 && guardrailsIdx > notThisIdx) {
    raw.notThis = clean.slice(notThisIdx + 1, guardrailsIdx).map((l) => l.replace(/^[●•]\s*/, ''));
  }
  const researchIdx = clean.findIndex((l) => /^RESEARCH EVALUATION/i.test(l));
  const scriptIdx = clean.findIndex((l) => /^Script (and|&) Video Directions/i.test(l));
  const guardrailsEnd = researchIdx >= 0 ? researchIdx : scriptIdx;
  if (guardrailsIdx >= 0 && guardrailsEnd > guardrailsIdx) {
    raw.guardrails = clean.slice(guardrailsIdx + 1, guardrailsEnd).map((l) => l.replace(/^[●•]\s*/, '')).join(' ');
  }
  if (researchIdx >= 0 && scriptIdx > researchIdx) {
    const block = clean.slice(researchIdx + 1, scriptIdx).join(' ');
    const highM = block.match(/HIGH CONFIDENCE:\s*(.+?)(?:MODERATE BUT SUPPORTIVE:|REJECTED OVERCLAIM:|$)/i);
    const modM = block.match(/MODERATE BUT SUPPORTIVE:\s*(.+?)(?:REJECTED OVERCLAIM:|$)/i);
    const rejM = block.match(/REJECTED OVERCLAIM:\s*(.+)$/i);
    const splitItems = (s) => (s || '').split(/[;.]\s+/).map((x) => x.trim()).filter(Boolean);
    raw.researchEval.high = highM ? splitItems(highM[1]) : [];
    raw.researchEval.moderate = modM ? splitItems(modM[1]) : [];
    raw.researchEval.rejected = rejM ? splitItems(rejM[1]) : [];
  }

  const sourcesIdx = clean.findIndex((l) => /^Sources$/i.test(l));
  const shortFormIdx = clean.findIndex((l) => /^Short-Form Cut/i.test(l));
  if (sourcesIdx >= 0 && shortFormIdx > sourcesIdx) {
    // Long entries wrap across multiple extracted lines (the URL often lands on its own
    // line) — regroup into one chunk per numbered entry before parsing each.
    const chunks = [];
    for (const l of clean.slice(sourcesIdx + 1, shortFormIdx)) {
      if (/^\d+\.\s/.test(l)) chunks.push(l);
      else if (chunks.length) chunks[chunks.length - 1] += ` ${l}`;
    }
    chunks.forEach((chunk, idx) => raw.sources.push(parseSourceLine(chunk, idx)));
  }

  const publishingIdx = clean.findIndex((l) => /^Publishing Copy/i.test(l));
  if (shortFormIdx >= 0) {
    const end = publishingIdx > shortFormIdx ? publishingIdx : clean.length;
    const body = clean.slice(shortFormIdx + 1, end);
    raw.shortScript = body.filter((l) => !/^FINAL SPOKEN SCRIPT$/i.test(l)).join(' ');
  }
  if (publishingIdx >= 0) {
    const beforeIdx = clean.findIndex((l, idx) => idx > publishingIdx && /^Before You Publish/i.test(l));
    const end = beforeIdx > publishingIdx ? beforeIdx : clean.length;
    const body = clean.slice(publishingIdx + 1, end);
    const capIdx = body.findIndex((l) => /^YOUTUBE DESCRIPTION|^MASTER CAPTION/i.test(l));
    raw.masterCaption = (capIdx >= 0 ? body.slice(capIdx + 1) : body).join(' ');
  }

  // Beats: every "HH:MM-HH:MM  Title" (or, for the older style, a short standalone line
  // immediately followed by "NARRATION") starts a new beat; it runs until the next such
  // line or the Sources section.
  const beatsEnd = sourcesIdx >= 0 ? sourcesIdx : clean.length;
  const beatStartIdxs = [];
  for (let idx = (scriptIdx >= 0 ? scriptIdx + 1 : 0); idx < beatsEnd; idx++) {
    if (/^\d{2}:\d{2}\s*[-–—]\s*\d{2}:\d{2}/.test(clean[idx]) && clean[idx + 1] && /^NARRATION$/i.test(clean[idx + 1])) {
      beatStartIdxs.push(idx);
    }
  }
  for (let b = 0; b < beatStartIdxs.length; b++) {
    const start = beatStartIdxs[b];
    const end = b + 1 < beatStartIdxs.length ? beatStartIdxs[b + 1] : beatsEnd;
    const titleLine = clean[start];
    const timeMatch = titleLine.match(/^(\d{2}:\d{2})\s*[-–—]\s*(\d{2}:\d{2})\s*(.*)$/);
    const body = clean.slice(start + 2, end); // skip title line + "NARRATION" marker
    const visualIdx = body.findIndex((l) => /^VISUAL\s*&?\s*SOURCE$/i.test(l));
    const narration = (visualIdx >= 0 ? body.slice(0, visualIdx) : body).join(' ');
    const visualBody = visualIdx >= 0 ? body.slice(visualIdx + 1) : [];
    const editIdx = visualBody.findIndex((l) => /^EDIT CAUTION:/i.test(l));
    const sourceIdx2 = visualBody.findIndex((l) => /^Sources?:/i.test(l));
    const visualEnd = [editIdx, sourceIdx2].filter((x) => x >= 0).sort((a, c) => a - c)[0];
    const visualText = (visualEnd >= 0 ? visualBody.slice(0, visualEnd) : visualBody).join(' ');
    const editCaution = editIdx >= 0 ? visualBody[editIdx].replace(/^EDIT CAUTION:\s*/i, '') : '';
    const sourceNote = sourceIdx2 >= 0 ? visualBody[sourceIdx2] : '';
    raw.beats.push({
      timeStart: timeMatch ? timeMatch[1] : '',
      timeEnd: timeMatch ? timeMatch[2] : '',
      title: timeMatch ? timeMatch[3] : titleLine,
      narration,
      visualType: detectVisualType(visualText),
      visualInstruction: visualText,
      sourceNote,
      editCaution,
    });
  }

  return finalizeParsedEpisode(raw);
}
