// Progress + Next Actions engine.
//
// Every percentage here is a plain "done / required" count over real records — no
// AI-guessed confidence scores. See each function for exactly what counts as "required"
// and "done" for that row, so a number on screen can always be explained by pointing at
// this file.

import * as db from './db.js';

export const VISUAL_TYPE_LABELS = {
  OWN: 'Own footage',
  SOURCE: 'Source',
  GRAPHIC: 'Graphic',
  FREE: 'Free/PD',
  STOCK: 'Stock',
  ARCHIVE: 'Archive',
  PHOTO: 'Photo',
};

export function beatNeedsSource(beat, claimsForBeat) {
  return beat.visualType === 'SOURCE' || (claimsForBeat && claimsForBeat.length > 0);
}

// Auto-derived status label for a beat, unless the beat has a manual statusOverride.
// Priority when multiple things are missing: narration, then source, then visual —
// narration blocks everything downstream, so it's called out first.
export function beatStatus(beat, claimsForBeat) {
  if (beat.statusOverride) return beat.statusOverride;
  const missingNarration = !beat.narration || !beat.narration.trim();
  const needsSource = beatNeedsSource(beat, claimsForBeat);
  const missingSource = needsSource && !beat.sourceId;
  const missingVisual = !beat.assetIds || beat.assetIds.length === 0;

  if (missingNarration) return 'NEEDS NARRATION';
  if (missingSource) return 'NEEDS SOURCE';
  if (missingVisual) return beat.visualType === 'GRAPHIC' ? 'NEEDS GRAPHIC' : 'MISSING ASSET';
  return 'READY';
}

export const STATUS_TIER = {
  READY: 'ok',
  'NEEDS NARRATION': 'bad',
  'NEEDS SOURCE': 'caution',
  'NEEDS GRAPHIC': 'caution',
  'MISSING ASSET': 'caution',
};

function pct(done, total) {
  if (!total) return null; // no requirement of this kind yet — excluded from overall average
  return Math.round((done / total) * 100);
}

export async function computeEpisodeProgress(episodeId) {
  const [beats, claims, assets] = await Promise.all([
    db.listBeats(episodeId),
    db.listClaims(episodeId),
    db.listAssets({ episodeId }),
  ]);

  const claimsByBeat = new Map();
  for (const c of claims) {
    if (!c.beatId) continue;
    if (!claimsByBeat.has(c.beatId)) claimsByBeat.set(c.beatId, []);
    claimsByBeat.get(c.beatId).push(c);
  }

  const scriptDone = beats.filter((b) => b.narration && b.narration.trim()).length;
  const visualsDone = beats.filter((b) => b.assetIds && b.assetIds.length > 0).length;

  const sourceBeats = beats.filter((b) => beatNeedsSource(b, claimsByBeat.get(b.id)));
  const sourcesDone = sourceBeats.filter((b) => b.sourceId).length;

  const graphicBeats = beats.filter((b) => b.visualType === 'GRAPHIC');
  const graphicsDone = graphicBeats.filter((b) => b.assetIds && b.assetIds.length > 0).length;

  const factOkTiers = new Set(['ok']);
  const factDone = claims.filter((c) => factOkTiers.has(db.FACT_STATUS_TIER[c.status])).length;

  const beatsWithStatus = beats.map((b) => ({ beat: b, status: beatStatus(b, claimsByBeat.get(b.id)) }));
  const beatsReadyDone = beatsWithStatus.filter((x) => x.status === 'READY').length;

  const rows = {
    script: { done: scriptDone, total: beats.length, pct: pct(scriptDone, beats.length) },
    visuals: { done: visualsDone, total: beats.length, pct: pct(visualsDone, beats.length) },
    sources: { done: sourcesDone, total: sourceBeats.length, pct: pct(sourcesDone, sourceBeats.length) },
    graphics: { done: graphicsDone, total: graphicBeats.length, pct: pct(graphicsDone, graphicBeats.length) },
    factCheck: { done: factDone, total: claims.length, pct: pct(factDone, claims.length) },
  };

  const known = Object.values(rows).filter((r) => r.pct !== null);
  const overallPct = known.length ? Math.round(known.reduce((s, r) => s + r.pct, 0) / known.length) : 0;

  const voiceover = assets.find((a) => a.type === 'Voiceover');
  const subtitle = assets.find((a) => a.type === 'Subtitle');

  const readyForResolve =
    beats.length > 0 &&
    beatsReadyDone === beats.length &&
    (claims.length === 0 || factDone === claims.length) &&
    !!voiceover &&
    !!subtitle;

  return {
    rows,
    overallPct,
    beatsReady: { done: beatsReadyDone, total: beats.length },
    beatsWithStatus,
    voiceoverPresent: !!voiceover,
    subtitlePresent: !!subtitle,
    readyForResolve,
    claims,
    beats,
  };
}

// Builds the "NEXT THINGS TO DO" list for an episode — concrete, clickable items derived
// straight from the same data the progress rows above are computed from.
export async function computeNextActions(episodeId, maxItems = 8) {
  const progress = await computeEpisodeProgress(episodeId);
  const actions = [];

  for (const { beat, status } of progress.beatsWithStatus) {
    if (status === 'READY') continue;
    if (status === 'NEEDS NARRATION') {
      actions.push({ label: `Write narration — ${beat.title}`, view: 'edit', episodeId, beatId: beat.id });
    } else if (status === 'NEEDS SOURCE') {
      actions.push({ label: `Add source — ${beat.title}`, view: 'edit', episodeId, beatId: beat.id, focus: 'source' });
    } else if (status === 'NEEDS GRAPHIC') {
      actions.push({
        label: `Create graphic — ${beat.title}`,
        view: 'edit',
        episodeId,
        beatId: beat.id,
        action: 'create-graphic',
      });
    } else if (status === 'MISSING ASSET') {
      actions.push({
        label: `Add ${VISUAL_TYPE_LABELS[beat.visualType] || beat.visualType} — ${beat.title}`,
        view: 'assets',
        episodeId,
        beatId: beat.id,
      });
    }
  }

  for (const c of progress.claims) {
    if (db.FACT_STATUS_TIER[c.status] !== 'ok') {
      actions.push({ label: `Review fact ${c.code}`, view: 'factcheck', episodeId, claimId: c.id });
    }
  }

  if (!progress.voiceoverPresent) {
    actions.push({ label: 'Upload voiceover', view: 'dashboard', episodeId, action: 'voiceover' });
  } else if (!progress.subtitlePresent) {
    actions.push({ label: 'Generate subtitles', view: 'dashboard', episodeId, action: 'subtitles' });
  }

  return { actions: actions.slice(0, maxItems), total: actions.length, progress };
}
