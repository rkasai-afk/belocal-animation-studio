// Top-level "Import Production Document" entry point — picks the right browser-side
// extractor by file type, runs it through the shared parser (import_parse.js), and applies
// the result to the database. Kept separate from the parsing logic itself so the parser
// stays unit-testable without touching IndexedDB or File objects.

import * as db from './db.js';
import { parseFromDocxBlocks, parseFromPdfLines } from './import_parse.js';
import { extractDocxBlocks } from './import_docx.js';
import { extractPdfLines } from './import_pdf.js';

export async function parseProductionDocument(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.docx')) {
    const blocks = await extractDocxBlocks(file);
    return parseFromDocxBlocks(blocks);
  }
  if (name.endsWith('.pdf')) {
    const lines = await extractPdfLines(file);
    return parseFromPdfLines(lines);
  }
  throw new Error('Import supports the standard BeLocal production document as .docx or .pdf.');
}

// Writes a parsed document into the database as a brand-new episode. Never mutates an
// existing episode — re-importing the same file always creates a fresh one, so a bad parse
// never silently overwrites hand-edited data. The caller (view_episodes.js) shows a preview
// first and lets the user confirm before this runs.
export async function applyParsedEpisode(parsed) {
  const episode = await db.createEpisode({
    number: parsed.number,
    title: parsed.title || 'Imported Episode',
    description: parsed.description,
    runtimeTarget: parsed.runtimeTarget,
    longScript: parsed.longScript,
    shortScript: parsed.shortScript,
    masterCaption: parsed.masterCaption,
  });
  episode.productionNotes = parsed.productionNotes;
  await db.saveEpisode(episode);

  const codeToSourceId = new Map();
  for (const s of parsed.sources) {
    const created = await db.createSource(episode.id, {
      publisher: s.publisher,
      title: s.title,
      url: s.url,
    });
    codeToSourceId.set(s.code, created.id);
  }

  for (const b of parsed.beats) {
    await db.createBeat(episode.id, {
      timeStart: b.timeStart,
      timeEnd: b.timeEnd,
      title: b.title,
      narration: b.narration,
      visualType: b.visualType,
      visualInstruction: b.visualInstruction,
      sourceId: b.sourceCode ? codeToSourceId.get(b.sourceCode) || null : null,
      notes: b.editCaution,
    });
  }

  for (const c of parsed.claims) {
    await db.createClaim(episode.id, {
      claim: c.claim,
      status: c.status,
      risk: c.risk,
    });
  }

  return episode;
}
