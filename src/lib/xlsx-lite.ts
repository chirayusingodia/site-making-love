// ─────────────────────────────────────────────────────────────
// Minimal, dependency-free .xlsx reader for the FIRST worksheet.
//
// An .xlsx file is a ZIP of XML parts. We read the ZIP central
// directory (robust even when the writer used data descriptors),
// inflate deflated entries with the browser-native
// DecompressionStream('deflate-raw'), and parse the XML with
// DOMParser. Returns a dense string[][] of the sheet's rows.
//
// Modern-browser only (DecompressionStream) — throws a clear,
// user-facing Hindi error where unsupported.
// ─────────────────────────────────────────────────────────────

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) =>
  (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("Is browser me Excel padhne ka support nahi — Chrome ya Edge use karein.");
  }
  const ds = new DecompressionStream("deflate-raw");
  const ab = await new Response(
    new Blob([bytes as BlobPart]).stream().pipeThrough(ds),
  ).arrayBuffer();
  return new Uint8Array(ab);
}

interface ZipEntry {
  name: string;
  method: number;
  comp: number;
  offset: number;
}

function readCentralDirectory(buf: Uint8Array): ZipEntry[] {
  let eocd = -1;
  const min = Math.max(0, buf.length - 22 - 65536);
  for (let i = buf.length - 22; i >= min; i--) {
    if (u32(buf, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Yeh valid .xlsx file nahi lag rahi.");
  const count = u16(buf, eocd + 10);
  let off = u32(buf, eocd + 16);
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (u32(buf, off) !== 0x02014b50) break;
    const method = u16(buf, off + 10);
    const comp = u32(buf, off + 20);
    const nameLen = u16(buf, off + 28);
    const extraLen = u16(buf, off + 30);
    const commentLen = u16(buf, off + 32);
    const localOff = u32(buf, off + 42);
    const name = new TextDecoder().decode(buf.subarray(off + 46, off + 46 + nameLen));
    entries.push({ name, method, comp, offset: localOff });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readEntry(buf: Uint8Array, e: ZipEntry): Promise<Uint8Array> {
  const lo = e.offset;
  if (u32(buf, lo) !== 0x04034b50) throw new Error("ZIP header kharab hai.");
  const nameLen = u16(buf, lo + 26);
  const extraLen = u16(buf, lo + 28);
  const dataStart = lo + 30 + nameLen + extraLen;
  const comp = buf.subarray(dataStart, dataStart + e.comp);
  return e.method === 0 ? comp : inflateRaw(comp);
}

const colIndex = (ref: string) => {
  let s = 0;
  for (const c of ref.replace(/[0-9]/g, "")) s = s * 26 + (c.charCodeAt(0) - 64);
  return s - 1;
};

/** Parse the first worksheet of an .xlsx into a dense string[][]. */
export async function parseXlsxFirstSheet(input: File | ArrayBuffer): Promise<string[][]> {
  const ab = input instanceof ArrayBuffer ? input : await input.arrayBuffer();
  const buf = new Uint8Array(ab);
  const entries = readCentralDirectory(buf);
  const byName = new Map(entries.map((e) => [e.name, e]));
  const dec = new TextDecoder("utf-8");

  // Shared strings table (most cell text lives here).
  let shared: string[] = [];
  const ssE = byName.get("xl/sharedStrings.xml");
  if (ssE) {
    const doc = new DOMParser().parseFromString(
      dec.decode(await readEntry(buf, ssE)),
      "application/xml",
    );
    shared = Array.from(doc.getElementsByTagName("si")).map((si) =>
      Array.from(si.getElementsByTagName("t"))
        .map((t) => t.textContent || "")
        .join(""),
    );
  }

  // First worksheet part.
  let sheetName = byName.has("xl/worksheets/sheet1.xml") ? "xl/worksheets/sheet1.xml" : "";
  if (!sheetName) {
    const first = entries.find((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name));
    if (!first) throw new Error("Excel me koi sheet nahi mili.");
    sheetName = first.name;
  }
  const sdoc = new DOMParser().parseFromString(
    dec.decode(await readEntry(buf, byName.get(sheetName)!)),
    "application/xml",
  );

  const rows: string[][] = [];
  for (const row of Array.from(sdoc.getElementsByTagName("row"))) {
    const cells: string[] = [];
    let maxc = -1;
    for (const c of Array.from(row.getElementsByTagName("c"))) {
      const ref = c.getAttribute("r") || "";
      const t = c.getAttribute("t");
      let val = "";
      const v = c.getElementsByTagName("v")[0];
      if (t === "inlineStr") {
        val = Array.from(c.getElementsByTagName("t"))
          .map((x) => x.textContent || "")
          .join("");
      } else if (v) {
        val = t === "s" ? shared[parseInt(v.textContent || "0", 10)] || "" : v.textContent || "";
      }
      const ci = ref ? colIndex(ref) : cells.length;
      cells[ci] = val;
      if (ci > maxc) maxc = ci;
    }
    const out: string[] = [];
    for (let i = 0; i <= maxc; i++) out.push(cells[i] ?? "");
    rows.push(out);
  }
  return rows;
}
