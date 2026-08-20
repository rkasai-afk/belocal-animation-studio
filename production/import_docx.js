// Browser-side .docx -> block-list extraction: minimal ZIP central-directory reader +
// DEFLATE inflate via the native DecompressionStream API, then a DOMParser walk of
// word/document.xml. No vendored library needed for this half — deliberately, since a ZIP
// reader + an XML walk are both small, well-bounded problems and the browser already has
// everything required (DecompressionStream, DOMParser). Produces the same {type:'p'|'tr',
// text|cells} block shape that import_parse.js's parseFromDocxBlocks() consumes — that
// function is pure and unit-tested independent of this extraction step.

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

async function readZipEntries(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const dv = new DataView(arrayBuffer);
  const EOCD_SIG = 0x06054b50;
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65536); i--) {
    if (dv.getUint32(i, true) === EOCD_SIG) { eocdOffset = i; break; }
  }
  if (eocdOffset === -1) throw new Error('Could not read this file as a .docx (not a valid ZIP archive).');
  const entryCount = dv.getUint16(eocdOffset + 10, true);
  const cdOffset = dv.getUint32(eocdOffset + 16, true);

  const entries = new Map();
  let offset = cdOffset;
  const CDH_SIG = 0x02014b50;
  for (let i = 0; i < entryCount; i++) {
    if (dv.getUint32(offset, true) !== CDH_SIG) break;
    const method = dv.getUint16(offset + 10, true);
    const compSize = dv.getUint32(offset + 20, true);
    const nameLen = dv.getUint16(offset + 28, true);
    const extraLen = dv.getUint16(offset + 30, true);
    const commentLen = dv.getUint16(offset + 32, true);
    const localHeaderOffset = dv.getUint32(offset + 42, true);
    const name = new TextDecoder('utf-8').decode(bytes.subarray(offset + 46, offset + 46 + nameLen));
    entries.set(name, { method, compSize, localHeaderOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }

  return {
    async get(name) {
      const meta = entries.get(name);
      if (!meta) return null;
      const lh = meta.localHeaderOffset;
      const nameLen = dv.getUint16(lh + 26, true);
      const extraLen = dv.getUint16(lh + 28, true);
      const dataStart = lh + 30 + nameLen + extraLen;
      const compData = bytes.subarray(dataStart, dataStart + meta.compSize);
      if (meta.method === 0) return compData;
      if (meta.method === 8) {
        if (typeof DecompressionStream === 'undefined') {
          throw new Error('This browser cannot read .docx files here (missing DecompressionStream) — try Chrome or Edge.');
        }
        const ds = new DecompressionStream('deflate-raw');
        const writer = ds.writable.getWriter();
        writer.write(compData);
        writer.close();
        const out = await new Response(ds.readable).arrayBuffer();
        return new Uint8Array(out);
      }
      throw new Error('Unsupported compression method in this .docx file.');
    },
  };
}

function paraText(p) {
  const ts = p.getElementsByTagNameNS(W_NS, 't');
  let s = '';
  for (const t of ts) s += t.textContent;
  return s;
}

export async function extractDocxBlocks(file) {
  const buf = await file.arrayBuffer();
  const zip = await readZipEntries(buf);
  const xmlBytes = await zip.get('word/document.xml');
  if (!xmlBytes) throw new Error('This .docx file is missing word/document.xml — is it really a Word document?');
  const xmlText = new TextDecoder('utf-8').decode(xmlBytes);
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error('Could not parse this .docx file\'s XML — it may be corrupted.');
  }
  const body = doc.getElementsByTagNameNS(W_NS, 'body')[0];
  if (!body) throw new Error('This .docx file has no readable document body.');

  const blocks = [];
  function walk(el) {
    for (const child of el.children) {
      const tag = child.localName;
      if (tag === 'p') {
        const text = paraText(child);
        if (text.trim()) blocks.push({ type: 'p', text });
      } else if (tag === 'tbl') {
        const rows = Array.from(child.children).filter((c) => c.localName === 'tr');
        for (const row of rows) {
          const cells = [];
          const tcs = Array.from(row.children).filter((c) => c.localName === 'tc');
          for (const tc of tcs) {
            const ps = tc.getElementsByTagNameNS(W_NS, 'p');
            let ctext = '';
            for (const p of ps) ctext += (ctext ? ' ' : '') + paraText(p);
            cells.push(ctext);
          }
          blocks.push({ type: 'tr', cells });
        }
      } else {
        walk(child);
      }
    }
  }
  walk(body);
  return blocks;
}
