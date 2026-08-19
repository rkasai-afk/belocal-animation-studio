// Cross-tool handoff with the Animation Maker (../) and Auto Subtitles (../subtitles/).
//
// Both tools already live on the same origin as this one (same GitHub Pages domain), so a
// window opened with window.open() can exchange postMessage() with its opener — including
// Blobs, which the structured-clone algorithm supports directly. That means a graphic or an
// SRT built in the other tool can come straight back as a Documentary Studio asset with no
// manual download-then-reupload step, while leaving both tools' own file-based save/export
// completely intact for anyone using them standalone.

import * as db from './db.js';
import { toast } from './util.js';

function buildUrl(base, params) {
  const usp = new URLSearchParams();
  usp.set('docHandoff', '1');
  Object.entries(params).forEach(([k, v]) => { if (v) usp.set(k, v); });
  return `${base}?${usp.toString()}`;
}

// Renders a short-lived <video> off-DOM to grab a frame as a thumbnail. Best-effort —
// if it fails for any reason the asset just falls back to its type icon in the grid.
export function videoThumbnail(blob) {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(blob);
      const video = document.createElement('video');
      video.muted = true;
      video.src = url;
      video.addEventListener('loadeddata', () => {
        video.currentTime = Math.min(0.2, (video.duration || 1) / 2);
      });
      video.addEventListener('seeked', () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 320;
          canvas.height = Math.round((video.videoHeight / video.videoWidth) * 320) || 180;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((thumb) => {
            URL.revokeObjectURL(url);
            resolve(thumb || null);
          }, 'image/jpeg', 0.8);
        } catch {
          URL.revokeObjectURL(url);
          resolve(null);
        }
      });
      video.addEventListener('error', () => { URL.revokeObjectURL(url); resolve(null); });
      setTimeout(() => resolve(null), 4000); // don't hang the flow if a codec stalls
    } catch {
      resolve(null);
    }
  });
}

async function attachIncomingAsset(msg, onDone) {
  const { kind, filename, blob, mime, docContext } = msg;
  const type = kind === 'graphic' ? 'Graphic' : kind === 'subtitle' ? 'Subtitle' : 'Other';
  const file = new File([blob], filename || `${type}.dat`, { type: mime || blob.type });
  const thumb = kind === 'graphic' ? await videoThumbnail(blob) : null;
  const asset = await db.createAsset({
    filename: file.name,
    type,
    episodeId: docContext.episodeId || null,
    beatId: docContext.beatId || null,
    description: docContext.title ? `Created for beat: ${docContext.title}` : '',
  }, file, thumb);
  if (docContext.episodeId && docContext.beatId) {
    await db.attachAssetToBeat(asset.id, docContext.episodeId, docContext.beatId);
  }
  toast(`${type} attached${docContext.title ? ` to "${docContext.title}"` : ''}.`);
  if (onDone) onDone(asset);
}

// Opens the Animation Maker pre-loaded with beat context. Returns nothing — the resulting
// graphic arrives asynchronously via postMessage and is attached automatically.
export function openAnimationMakerForBeat(episodeId, beat, onAttached) {
  const url = buildUrl('../', {
    episodeId,
    beatId: beat.id,
    title: beat.title,
    notes: beat.visualInstruction,
    source: beat.notes,
  });
  window.open(url, '_blank');

  const handler = (event) => {
    if (event.origin !== window.location.origin) return;
    const msg = event.data;
    if (!msg || msg.type !== 'doc-asset' || msg.kind !== 'graphic') return;
    if (!msg.docContext || msg.docContext.episodeId !== episodeId || msg.docContext.beatId !== beat.id) return;
    attachIncomingAsset(msg, onAttached);
  };
  window.addEventListener('message', handler);
}

// Opens Auto Subtitles, hands it the given voiceover Blob once the child signals it's
// ready to receive it, and attaches whatever SRT comes back as a Subtitle asset.
export function openSubtitlesForEpisode(episodeId, episodeTitle, voiceoverBlob, voiceoverName, onAttached) {
  const url = buildUrl('../subtitles/', { episodeId, title: episodeTitle });
  const child = window.open(url, '_blank');

  const handler = (event) => {
    if (event.origin !== window.location.origin) return;
    const msg = event.data;
    if (!msg) return;
    if (msg.type === 'doc-subtitles-ready') {
      child.postMessage({ type: 'doc-audio', blob: voiceoverBlob, filename: voiceoverName }, window.location.origin);
    } else if (msg.type === 'doc-asset' && msg.kind === 'subtitle') {
      if (!msg.docContext || msg.docContext.episodeId !== episodeId) return;
      attachIncomingAsset(msg, onAttached);
    }
  };
  window.addEventListener('message', handler);
}
