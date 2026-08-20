// BeLocal Documentary Studio — data layer.
//
// This whole tool runs the same way the rest of the repo does: no server, no account,
// nothing leaves the browser. GitHub Pages only serves static files, so there is no
// backend this app could call even if it wanted one. Persistence is IndexedDB — it has
// no practical size ceiling like localStorage, and can hold the actual asset files
// (thumbnails, small graphic/audio exports) as Blobs, not just their metadata.
//
// Raw footage is NOT assumed to live inside this database. A "Log Asset" entry can exist
// with no file at all (just filename/tags/location) for footage that stays on disk/NAS
// and gets pulled into Resolve directly — this tool tracks that it exists and where, it
// doesn't need to own the bytes. Uploading a file is supported and stores the actual Blob
// (used for thumbnails, small graphics, audio, subtitles), but nothing here requires it.

const DB_NAME = 'belocal_docstudio';
const DB_VERSION = 1;

let _dbPromise = null;

function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('episodes')) {
        db.createObjectStore('episodes', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('beats')) {
        const s = db.createObjectStore('beats', { keyPath: 'id' });
        s.createIndex('episodeId', 'episodeId', { unique: false });
      }
      if (!db.objectStoreNames.contains('sources')) {
        const s = db.createObjectStore('sources', { keyPath: 'id' });
        s.createIndex('episodeId', 'episodeId', { unique: false });
      }
      if (!db.objectStoreNames.contains('claims')) {
        const s = db.createObjectStore('claims', { keyPath: 'id' });
        s.createIndex('episodeId', 'episodeId', { unique: false });
      }
      if (!db.objectStoreNames.contains('assets')) {
        const s = db.createObjectStore('assets', { keyPath: 'id' });
        s.createIndex('episodeId', 'episodeId', { unique: false });
        s.createIndex('type', 'type', { unique: false });
      }
      if (!db.objectStoreNames.contains('blobs')) {
        db.createObjectStore('blobs', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function tx(storeName, mode) {
  return openDb().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function put(storeName, record) {
  const store = await tx(storeName, 'readwrite');
  await reqToPromise(store.put(record));
  return record;
}

async function get(storeName, id) {
  const store = await tx(storeName, 'readonly');
  return reqToPromise(store.get(id));
}

async function del(storeName, id) {
  const store = await tx(storeName, 'readwrite');
  return reqToPromise(store.delete(id));
}

async function all(storeName) {
  const store = await tx(storeName, 'readonly');
  return reqToPromise(store.getAll());
}

async function byIndex(storeName, indexName, value) {
  const store = await tx(storeName, 'readonly');
  return reqToPromise(store.index(indexName).getAll(value));
}

// --- Episodes -------------------------------------------------------------

export async function listEpisodes() {
  const rows = await all('episodes');
  return rows.filter((e) => !e.archived).sort((a, b) => (a.number || 0) - (b.number || 0));
}

export async function getEpisode(id) {
  return get('episodes', id);
}

export async function saveEpisode(ep) {
  ep.updatedAt = Date.now();
  return put('episodes', ep);
}

export async function createEpisode(fields) {
  const ep = {
    id: newId('ep'),
    number: fields.number || '',
    title: fields.title || 'Untitled Episode',
    description: fields.description || '',
    runtimeTarget: fields.runtimeTarget || '',
    longScript: fields.longScript || '',
    shortScript: fields.shortScript || '',
    masterCaption: fields.masterCaption || '',
    productionNotes: fields.productionNotes || '',
    lastFactCheckedDate: fields.lastFactCheckedDate || '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    archived: false,
  };
  return put('episodes', ep);
}

export async function archiveEpisode(id) {
  const ep = await get('episodes', id);
  if (!ep) return;
  ep.archived = true;
  return put('episodes', ep);
}

// --- Beats (Edit Blueprint) ------------------------------------------------

export async function listBeats(episodeId) {
  const rows = await byIndex('beats', 'episodeId', episodeId);
  return rows.filter((b) => !b.archived).sort((a, b) => (a.order || 0) - (b.order || 0));
}

export async function getBeat(id) {
  return get('beats', id);
}

export async function saveBeat(beat) {
  beat.updatedAt = Date.now();
  return put('beats', beat);
}

export async function createBeat(episodeId, fields = {}) {
  const existing = await listBeats(episodeId);
  const beat = {
    id: newId('bt'),
    episodeId,
    order: existing.length ? existing[existing.length - 1].order + 1 : 0,
    timeStart: fields.timeStart || '',
    timeEnd: fields.timeEnd || '',
    title: fields.title || 'New story beat',
    narration: fields.narration || '',
    visualType: fields.visualType || 'OWN',
    visualInstruction: fields.visualInstruction || '',
    sourceId: fields.sourceId || null,
    assetIds: fields.assetIds || [],
    notes: fields.notes || '',
    statusOverride: null, // null = auto-derive; or 'READY' to force-mark done
    createdAt: Date.now(),
    updatedAt: Date.now(),
    archived: false,
  };
  return put('beats', beat);
}

export async function archiveBeat(id) {
  const beat = await get('beats', id);
  if (!beat) return;
  beat.archived = true;
  return put('beats', beat);
}

export async function reorderBeats(episodeId, orderedIds) {
  const beats = await listBeats(episodeId);
  const byId = new Map(beats.map((b) => [b.id, b]));
  await Promise.all(
    orderedIds.map((id, i) => {
      const b = byId.get(id);
      if (!b) return null;
      b.order = i;
      return put('beats', b);
    })
  );
}

// --- Sources -----------------------------------------------------------

export async function listSources(episodeId) {
  return byIndex('sources', 'episodeId', episodeId);
}

export async function getSource(id) {
  return get('sources', id);
}

export async function saveSource(source) {
  source.updatedAt = Date.now();
  return put('sources', source);
}

export async function createSource(episodeId, fields = {}) {
  const source = {
    id: newId('src'),
    episodeId,
    publisher: fields.publisher || '',
    title: fields.title || 'Untitled source',
    url: fields.url || '',
    pubDate: fields.pubDate || '',
    lastChecked: fields.lastChecked || todayStr(),
    supports: fields.supports || '',
    notes: fields.notes || '',
    screenshotAssetId: fields.screenshotAssetId || null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  return put('sources', source);
}

export async function deleteSource(id) {
  return del('sources', id);
}

// --- Claims (Fact Lock) --------------------------------------------------

export const FACT_STATUSES = [
  'VERIFIED',
  'VERIFIED WITH QUALIFIER',
  'CURRENT',
  'PLANNED / NOT YET IN EFFECT',
  'PROPOSED / NOT LAW',
  'ANALYSIS / INFERENCE',
  'INTERVIEW CLAIM',
  'UNVERIFIED',
  'OUTDATED',
  'RECHECK REQUIRED',
];

export const FACT_STATUS_TIER = {
  VERIFIED: 'ok',
  'VERIFIED WITH QUALIFIER': 'caution',
  CURRENT: 'ok',
  'PLANNED / NOT YET IN EFFECT': 'caution',
  'PROPOSED / NOT LAW': 'caution',
  'ANALYSIS / INFERENCE': 'caution',
  'INTERVIEW CLAIM': 'caution',
  UNVERIFIED: 'bad',
  OUTDATED: 'bad',
  'RECHECK REQUIRED': 'caution',
};

export async function listClaims(episodeId) {
  const rows = await byIndex('claims', 'episodeId', episodeId);
  return rows.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
}

export async function getClaim(id) {
  return get('claims', id);
}

export async function saveClaim(claim) {
  claim.updatedAt = Date.now();
  return put('claims', claim);
}

export async function createClaim(episodeId, fields = {}) {
  const existing = await listClaims(episodeId);
  const code = fields.code || `C${String(existing.length + 1).padStart(2, '0')}`;
  const claim = {
    id: newId('cl'),
    episodeId,
    beatId: fields.beatId || null,
    code,
    claim: fields.claim || '',
    status: fields.status || 'UNVERIFIED',
    sourceId: fields.sourceId || null,
    lastVerified: fields.lastVerified || '',
    risk: fields.risk || 'LOW',
    allowedInScript: fields.allowedInScript !== false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  return put('claims', claim);
}

export async function deleteClaim(id) {
  return del('claims', id);
}

// --- Assets --------------------------------------------------------------

export const ASSET_TYPES = [
  'Own footage',
  'Source capture',
  'Graphic',
  'Stock',
  'Archive',
  'Photo',
  'Audio',
  'Voiceover',
  'Subtitle',
  'Other',
];

export async function listAssets(filter = {}) {
  let rows = filter.episodeId ? await byIndex('assets', 'episodeId', filter.episodeId) : await all('assets');
  if (filter.type) rows = rows.filter((a) => a.type === filter.type);
  if (filter.beatId) rows = rows.filter((a) => a.beatId === filter.beatId);
  return rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function getAsset(id) {
  return get('assets', id);
}

export async function saveAsset(asset) {
  asset.updatedAt = Date.now();
  return put('assets', asset);
}

// file/thumb are optional Blobs (or omitted for a metadata-only "logged" asset).
export async function createAsset(fields, file, thumbBlob) {
  const asset = {
    id: newId('as'),
    filename: fields.filename || (file && file.name) || 'Untitled asset',
    type: fields.type || 'Other',
    tags: fields.tags || [],
    location: fields.location || '',
    date: fields.date || todayStr(),
    description: fields.description || '',
    episodeId: fields.episodeId || null,
    beatId: fields.beatId || null,
    license: fields.license || '',
    notes: fields.notes || '',
    hasFile: !!file,
    hasThumb: !!thumbBlob,
    fileSize: file ? file.size : 0,
    fileMime: file ? file.type : '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await put('assets', asset);
  if (file || thumbBlob) {
    await put('blobs', { id: asset.id, file: file || null, thumb: thumbBlob || null });
  }
  return asset;
}

export async function getAssetBlobRecord(id) {
  return get('blobs', id);
}

export async function deleteAsset(id) {
  const asset = await get('assets', id);
  await del('assets', id);
  await del('blobs', id);
  if (asset && asset.episodeId) {
    const beats = await listBeats(asset.episodeId);
    await Promise.all(
      beats
        .filter((b) => b.assetIds && b.assetIds.includes(id))
        .map((b) => {
          b.assetIds = b.assetIds.filter((aid) => aid !== id);
          return put('beats', b);
        })
    );
  }
}

export async function attachAssetToBeat(assetId, episodeId, beatId) {
  const asset = await get('assets', assetId);
  if (!asset) return;
  asset.episodeId = episodeId;
  asset.beatId = beatId;
  await saveAsset(asset);
  const beat = await get('beats', beatId);
  if (beat && !beat.assetIds.includes(assetId)) {
    beat.assetIds.push(assetId);
    await saveBeat(beat);
  }
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
