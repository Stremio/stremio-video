/* eslint-disable -- Generated from @cryguy/mkv-subtitle-extractor 1.0.1 (dbe77e9). See EMBEDDED-ASS-EXTRACTOR-LICENSE. */
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// embeddedASSMatroska.ts
var embeddedASSMatroska_exports = {};
__export(embeddedASSMatroska_exports, {
  CUES: () => CUES,
  RangeReader: () => RangeReader,
  TRACKS: () => TRACKS,
  assembleSubtitle: () => assembleSubtitle,
  parseCues: () => parseCues,
  parseSegment: () => parseSegment,
  parseTracks: () => parseTracks,
  readTargetedBlocks: () => readTargetedBlocks,
  scanClusters: () => scanClusters
});
module.exports = __toCommonJS(embeddedASSMatroska_exports);

// mkv-subtitle-extractor/src/errors.ts
var RangeNotSupportedError = class extends Error {
  constructor(url) {
    super(
      `The server at "${url}" does not support HTTP Range requests. Range requests are required for efficient subtitle extraction. To download the full file instead, pass { allowFullDownload: true } in options.`
    );
    this.name = "RangeNotSupportedError";
  }
};
var MkvParseError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "MkvParseError";
  }
};

// mkv-subtitle-extractor/src/io/range-reader.ts
var _RangeReader = class _RangeReader {
  // 32KB
  constructor(url, options) {
    this.fileSize = 0;
    this.fullBuffer = null;
    this._bytesDownloaded = 0;
    this._requestCount = 0;
    // Read-ahead cache
    this.cacheOffset = -1;
    this.cacheBuffer = null;
    var _a, _b, _c;
    this.url = url;
    this.allowFullDownload = (_a = options == null ? void 0 : options.allowFullDownload) != null ? _a : false;
    this.fetchFn = (_b = options == null ? void 0 : options.fetch) != null ? _b : globalThis.fetch.bind(globalThis);
    this.customHeaders = (_c = options == null ? void 0 : options.headers) != null ? _c : {};
  }
  /** Total bytes downloaded so far */
  get bytesDownloaded() {
    return this._bytesDownloaded;
  }
  /** Total file size in bytes */
  get size() {
    return this.fileSize;
  }
  /** Total number of HTTP requests made */
  get requestCount() {
    return this._requestCount;
  }
  /**
   * Initialize the reader: check Range support and get file size.
   * Pre-fetches a chunk to prime the cache for subsequent reads.
   * Must be called before read().
   */
  async init() {
    const probeSize = 256 * 1024;
    this._requestCount++;
    const response = await this.fetchFn(this.url, {
      method: "GET",
      headers: __spreadProps(__spreadValues({}, this.customHeaders), {
        "Range": `bytes=0-${probeSize - 1}`
      })
    });
    if (response.status === 206) {
      const contentRange = response.headers.get("Content-Range");
      if (contentRange) {
        const match = contentRange.match(/bytes\s+\d+-\d+\/(\d+)/);
        if (match) {
          this.fileSize = parseInt(match[1], 10);
        }
      }
      const buffer2 = await response.arrayBuffer();
      const data = new Uint8Array(buffer2);
      this._bytesDownloaded += data.length;
      this.cacheOffset = 0;
      this.cacheBuffer = data;
      return;
    }
    if (!this.allowFullDownload) {
      throw new RangeNotSupportedError(this.url);
    }
    const fullResponse = response.status === 200 ? response : (this._requestCount++, await this.fetchFn(this.url, { headers: this.customHeaders }));
    const buffer = await fullResponse.arrayBuffer();
    this.fullBuffer = new Uint8Array(buffer);
    this.fileSize = this.fullBuffer.length;
    this._bytesDownloaded = this.fileSize;
  }
  /**
   * Read `length` bytes starting at `offset` from the file.
   */
  async read(offset, length, readAheadSize = _RangeReader.READ_AHEAD_SIZE) {
    if (this.fullBuffer) {
      return this.fullBuffer.slice(offset, offset + length);
    }
    if (this.cacheBuffer && this.cacheOffset >= 0 && offset >= this.cacheOffset && offset + length <= this.cacheOffset + this.cacheBuffer.length) {
      const start = offset - this.cacheOffset;
      return this.cacheBuffer.slice(start, start + length);
    }
    this._requestCount++;
    const readAheadLength = Math.max(length, readAheadSize);
    const end = Math.min(offset + readAheadLength - 1, this.fileSize - 1);
    const response = await this.fetchFn(this.url, {
      headers: __spreadProps(__spreadValues({}, this.customHeaders), {
        "Range": `bytes=${offset}-${end}`
      })
    });
    if (response.status !== 206 && response.status !== 200) {
      throw new Error(`HTTP ${response.status} fetching range ${offset}-${end}`);
    }
    const buffer = await response.arrayBuffer();
    const data = new Uint8Array(buffer);
    this._bytesDownloaded += data.length;
    this.cacheOffset = offset;
    this.cacheBuffer = data;
    return data.slice(0, Math.min(length, data.length));
  }
};
_RangeReader.READ_AHEAD_SIZE = 32 * 1024;
var RangeReader = _RangeReader;

// mkv-subtitle-extractor/src/ebml/vint.ts
function readElementId(data, offset) {
  if (offset >= data.length) {
    throw new Error("Unexpected end of data reading element ID");
  }
  const firstByte = data[offset];
  if (firstByte === 0) {
    throw new Error("Invalid VINT: leading byte is 0");
  }
  const width = vintWidth(firstByte);
  if (offset + width > data.length) {
    throw new Error("Unexpected end of data reading element ID");
  }
  let value = firstByte;
  for (let i = 1; i < width; i++) {
    value = value * 256 + data[offset + i];
  }
  return { value, length: width };
}
function readDataSize(data, offset) {
  if (offset >= data.length) {
    throw new Error("Unexpected end of data reading data size");
  }
  const firstByte = data[offset];
  if (firstByte === 0) {
    throw new Error("Invalid VINT: leading byte is 0");
  }
  const width = vintWidth(firstByte);
  if (offset + width > data.length) {
    throw new Error("Unexpected end of data reading data size");
  }
  const mask = (1 << 8 - width) - 1;
  let value = firstByte & mask;
  let allOnes = (firstByte & mask) === mask;
  for (let i = 1; i < width; i++) {
    value = value * 256 + data[offset + i];
    if (data[offset + i] !== 255) {
      allOnes = false;
    }
  }
  if (allOnes) {
    return { value: -1, length: width };
  }
  return { value, length: width };
}
function readTrackNumber(data, offset) {
  if (offset >= data.length) {
    throw new Error("Unexpected end of data reading track number");
  }
  const firstByte = data[offset];
  if (firstByte === 0) {
    throw new Error("Invalid VINT: leading byte is 0");
  }
  const width = vintWidth(firstByte);
  if (offset + width > data.length) {
    throw new Error("Unexpected end of data reading track number");
  }
  const mask = (1 << 8 - width) - 1;
  let value = firstByte & mask;
  for (let i = 1; i < width; i++) {
    value = value * 256 + data[offset + i];
  }
  return { value, length: width };
}
function vintWidth(firstByte) {
  if (firstByte & 128) return 1;
  if (firstByte & 64) return 2;
  if (firstByte & 32) return 3;
  if (firstByte & 16) return 4;
  if (firstByte & 8) return 5;
  if (firstByte & 4) return 6;
  if (firstByte & 2) return 7;
  if (firstByte & 1) return 8;
  return 1;
}

// mkv-subtitle-extractor/src/ebml/parser.ts
function parseElementHeader(data, offset) {
  const headerOffset = offset;
  const id = readElementId(data, offset);
  offset += id.length;
  const size = readDataSize(data, offset);
  offset += size.length;
  return {
    id: id.value,
    dataSize: size.value === -1 ? -1 : size.value,
    headerOffset,
    dataOffset: offset,
    unknownSize: size.value === -1
  };
}
function* iterateChildren(data, parentDataOffset, parentDataSize) {
  const end = parentDataOffset + parentDataSize;
  let offset = parentDataOffset;
  while (offset < end) {
    if (offset + 2 > data.length) break;
    try {
      const element = parseElementHeader(data, offset);
      yield element;
      if (element.unknownSize) break;
      offset = element.dataOffset + element.dataSize;
    } catch (e) {
      break;
    }
  }
}
function readUint(data, offset, length) {
  let value = 0;
  for (let i = 0; i < length; i++) {
    value = value * 256 + data[offset + i];
  }
  return value;
}
function readUtf8(data, offset, length) {
  const decoder2 = new TextDecoder("utf-8");
  let end = offset + length;
  while (end > offset && data[end - 1] === 0) {
    end--;
  }
  return decoder2.decode(data.subarray(offset, end));
}
function readBinary(data, offset, length) {
  return data.slice(offset, offset + length);
}

// mkv-subtitle-extractor/src/ebml/ids.ts
var EBML_HEADER = 440786851;
var SEGMENT = 408125543;
var SEEK_HEAD = 290298740;
var SEEK = 19899;
var SEEK_ID = 21419;
var SEEK_POSITION = 21420;
var INFO = 357149030;
var TIMESTAMP_SCALE = 2807729;
var TRACKS = 374648427;
var TRACK_ENTRY = 174;
var TRACK_NUMBER = 215;
var TRACK_TYPE = 131;
var CODEC_ID = 134;
var CODEC_PRIVATE = 25506;
var LANGUAGE = 2274716;
var LANGUAGE_BCP47 = 2274717;
var NAME = 21358;
var DEFAULT_DURATION = 2352003;
var ATTACHMENTS = 423732329;
var CLUSTER = 524531317;
var CLUSTER_TIMESTAMP = 231;
var SIMPLE_BLOCK = 163;
var BLOCK_GROUP = 160;
var BLOCK = 161;
var BLOCK_DURATION = 155;
var BLOCK_ADDITIONS = 30113;
var BLOCK_MORE = 166;
var BLOCK_ADDITIONAL = 165;
var CUES = 475249515;
var CUE_POINT = 187;
var CUE_TIME = 179;
var CUE_TRACK_POSITIONS = 183;
var CUE_TRACK = 247;
var CUE_CLUSTER_POSITION = 241;
var CUE_RELATIVE_POSITION = 240;
var CUE_DURATION = 178;
var CHAPTERS = 272869232;
var TAGS = 307544935;
var SEGMENT_LEVEL_IDS = /* @__PURE__ */ new Set([
  SEEK_HEAD,
  INFO,
  TRACKS,
  ATTACHMENTS,
  CLUSTER,
  CUES,
  CHAPTERS,
  TAGS
]);

// mkv-subtitle-extractor/src/mkv/segment.ts
async function parseSegment(reader) {
  const readSize = Math.min(256 * 1024, reader.size);
  const data = await reader.read(0, readSize);
  const ebmlHeader = parseElementHeader(data, 0);
  if (ebmlHeader.id !== EBML_HEADER) {
    throw new MkvParseError("Not a valid EBML file: missing EBML header");
  }
  const segmentStart = ebmlHeader.dataOffset + ebmlHeader.dataSize;
  const segment = parseElementHeader(data, segmentStart);
  if (segment.id !== SEGMENT) {
    throw new MkvParseError("Not a valid MKV file: missing Segment element");
  }
  const segmentDataOffset = segment.dataOffset;
  const segmentDataSize = segment.unknownSize ? reader.size - segment.dataOffset : segment.dataSize;
  const metaEnd = data.length - segmentDataOffset;
  const segData = data.subarray(segmentDataOffset);
  let seekEntries = [];
  let info = { timestampScale: 1e6 };
  let offset = 0;
  while (offset < metaEnd - 2) {
    let element;
    try {
      element = parseElementHeader(segData, offset);
    } catch (e) {
      break;
    }
    if (element.id === SEEK_HEAD) {
      const entries = parseSeekHead(segData, element);
      seekEntries.push(...entries);
    } else if (element.id === INFO) {
      info = parseInfo(segData, element);
    } else if (element.id === CLUSTER) {
      break;
    }
    if (element.unknownSize) break;
    offset = element.dataOffset + element.dataSize;
  }
  return { segmentDataOffset, segmentDataSize, seekEntries, info };
}
function parseSeekHead(data, seekHeadEl) {
  const entries = [];
  for (const seekEl of iterateChildren(data, seekHeadEl.dataOffset, seekHeadEl.dataSize)) {
    if (seekEl.id !== SEEK) continue;
    let seekId = 0;
    let seekPosition = 0;
    for (const child of iterateChildren(data, seekEl.dataOffset, seekEl.dataSize)) {
      if (child.id === SEEK_ID) {
        const idBytes = data.subarray(child.dataOffset, child.dataOffset + child.dataSize);
        const parsed = readElementId(idBytes, 0);
        seekId = parsed.value;
      } else if (child.id === SEEK_POSITION) {
        seekPosition = readUint(data, child.dataOffset, child.dataSize);
      }
    }
    if (seekId !== 0) {
      entries.push({ id: seekId, position: seekPosition });
    }
  }
  return entries;
}
function parseInfo(data, infoEl) {
  let timestampScale = 1e6;
  for (const child of iterateChildren(data, infoEl.dataOffset, infoEl.dataSize)) {
    if (child.id === TIMESTAMP_SCALE) {
      timestampScale = readUint(data, child.dataOffset, child.dataSize);
    }
  }
  return { timestampScale };
}

// mkv-subtitle-extractor/src/mkv/tracks.ts
var SUBTITLE_TRACK_TYPE = 17;
async function parseTracks(reader, segmentDataOffset, tracksPosition) {
  const absoluteOffset = segmentDataOffset + tracksPosition;
  const headerData = await reader.read(absoluteOffset, 12);
  const tracksEl = parseElementHeader(headerData, 0);
  const totalSize = tracksEl.dataOffset + tracksEl.dataSize;
  const tracksData = await reader.read(absoluteOffset, totalSize);
  const subtitleTracks = [];
  for (const entryEl of iterateChildren(tracksData, tracksEl.dataOffset, tracksEl.dataSize)) {
    if (entryEl.id !== TRACK_ENTRY) continue;
    let trackNumber = 0;
    let trackType = 0;
    let codecId = "";
    let codecPrivate = null;
    let language;
    let trackName;
    let defaultDuration;
    for (const child of iterateChildren(tracksData, entryEl.dataOffset, entryEl.dataSize)) {
      switch (child.id) {
        case TRACK_NUMBER:
          trackNumber = readUint(tracksData, child.dataOffset, child.dataSize);
          break;
        case TRACK_TYPE:
          trackType = readUint(tracksData, child.dataOffset, child.dataSize);
          break;
        case CODEC_ID:
          codecId = readUtf8(tracksData, child.dataOffset, child.dataSize);
          break;
        case CODEC_PRIVATE:
          codecPrivate = readBinary(tracksData, child.dataOffset, child.dataSize);
          break;
        case LANGUAGE:
          if (language === void 0) {
            language = readUtf8(tracksData, child.dataOffset, child.dataSize);
          }
          break;
        case LANGUAGE_BCP47:
          language = readUtf8(tracksData, child.dataOffset, child.dataSize);
          break;
        case NAME:
          trackName = readUtf8(tracksData, child.dataOffset, child.dataSize);
          break;
        case DEFAULT_DURATION:
          defaultDuration = readUint(tracksData, child.dataOffset, child.dataSize);
          break;
      }
    }
    if (trackType === SUBTITLE_TRACK_TYPE) {
      subtitleTracks.push({
        trackNumber,
        codecId,
        codecPrivate,
        language: language === "und" ? void 0 : language,
        trackName,
        defaultDuration
      });
    }
  }
  return subtitleTracks;
}

// mkv-subtitle-extractor/src/mkv/cues.ts
async function parseCues(reader, segmentDataOffset, cuesPosition) {
  const absoluteOffset = segmentDataOffset + cuesPosition;
  const headerData = await reader.read(absoluteOffset, 12);
  const cuesEl = parseElementHeader(headerData, 0);
  const totalSize = cuesEl.dataOffset + cuesEl.dataSize;
  const cuesData = await reader.read(absoluteOffset, totalSize);
  const entries = [];
  for (const pointEl of iterateChildren(cuesData, cuesEl.dataOffset, cuesEl.dataSize)) {
    if (pointEl.id !== CUE_POINT) continue;
    let cueTime = 0;
    for (const child of iterateChildren(cuesData, pointEl.dataOffset, pointEl.dataSize)) {
      if (child.id === CUE_TIME) {
        cueTime = readUint(cuesData, child.dataOffset, child.dataSize);
        break;
      }
    }
    for (const child of iterateChildren(cuesData, pointEl.dataOffset, pointEl.dataSize)) {
      if (child.id !== CUE_TRACK_POSITIONS) continue;
      let track = 0;
      let clusterPosition = 0;
      let relativePosition;
      let duration;
      for (const posChild of iterateChildren(cuesData, child.dataOffset, child.dataSize)) {
        switch (posChild.id) {
          case CUE_TRACK:
            track = readUint(cuesData, posChild.dataOffset, posChild.dataSize);
            break;
          case CUE_CLUSTER_POSITION:
            clusterPosition = readUint(cuesData, posChild.dataOffset, posChild.dataSize);
            break;
          case CUE_RELATIVE_POSITION:
            relativePosition = readUint(cuesData, posChild.dataOffset, posChild.dataSize);
            break;
          case CUE_DURATION:
            duration = readUint(cuesData, posChild.dataOffset, posChild.dataSize);
            break;
        }
      }
      entries.push({ time: cueTime, track, clusterPosition, relativePosition, duration });
    }
  }
  return entries;
}

// mkv-subtitle-extractor/src/mkv/clusters.ts
var HEADER_READ_SIZE = 16;
var MAX_BATCH_GAP = 2 * 1024 * 1024;
var BLOCK_SIZE_ESTIMATE = 4096;
// Keep adjacent cues from turning into a read of the intervening video.
var MAX_BATCH_BYTES = 128 * 1024;
var READ_AHEAD = 32 * 1024;
async function scanClusters(reader, startOffset, endOffset, subtitleTrackNumbers, timestampScale) {
  const blocks = [];
  let offset = startOffset;
  const tsMultiplier = timestampScale / 1e6;
  while (offset < endOffset) {
    const remaining = endOffset - offset;
    if (remaining < 4) break;
    const headerBuf = await reader.read(offset, Math.min(HEADER_READ_SIZE, remaining));
    let element;
    try {
      element = parseElementHeader(headerBuf, 0);
    } catch (e) {
      break;
    }
    const headerSize = element.dataOffset;
    const absDataOffset = offset + headerSize;
    if (element.id === CLUSTER) {
      const clusterEnd = element.unknownSize ? endOffset : absDataOffset + element.dataSize;
      const { clusterBlocks, nextOffset } = await processCluster(
        reader,
        absDataOffset,
        clusterEnd,
        element.unknownSize,
        subtitleTrackNumbers,
        tsMultiplier
      );
      blocks.push(...clusterBlocks);
      offset = nextOffset;
    } else {
      if (element.unknownSize) break;
      offset = absDataOffset + element.dataSize;
    }
  }
  return blocks;
}
async function processCluster(reader, clusterDataStart, clusterEnd, unknownSize, subtitleTrackNumbers, tsMultiplier) {
  const blocks = [];
  let offset = clusterDataStart;
  let clusterTimestamp = 0;
  while (offset < clusterEnd) {
    const remaining = clusterEnd - offset;
    if (remaining < 4) break;
    const headerBuf = await reader.read(offset, Math.min(HEADER_READ_SIZE, remaining));
    let element;
    try {
      element = parseElementHeader(headerBuf, 0);
    } catch (e) {
      break;
    }
    const headerSize = element.dataOffset;
    const absDataOffset = offset + headerSize;
    if (unknownSize && SEGMENT_LEVEL_IDS.has(element.id)) {
      return { clusterBlocks: blocks, nextOffset: offset };
    }
    if (element.id === CLUSTER_TIMESTAMP) {
      if (element.dataSize <= headerBuf.length - headerSize) {
        clusterTimestamp = readUint(headerBuf, headerSize, element.dataSize);
      } else {
        const tsData = await reader.read(absDataOffset, element.dataSize);
        clusterTimestamp = readUint(tsData, 0, element.dataSize);
      }
      offset = absDataOffset + element.dataSize;
    } else if (element.id === SIMPLE_BLOCK) {
      const block = await parseSimpleBlock(
        reader,
        absDataOffset,
        element.dataSize,
        clusterTimestamp,
        tsMultiplier,
        subtitleTrackNumbers
      );
      if (block) blocks.push(block);
      offset = absDataOffset + element.dataSize;
    } else if (element.id === BLOCK_GROUP) {
      const groupBlocks = await processBlockGroup(
        reader,
        absDataOffset,
        element.dataSize,
        clusterTimestamp,
        tsMultiplier,
        subtitleTrackNumbers
      );
      blocks.push(...groupBlocks);
      offset = absDataOffset + element.dataSize;
    } else {
      if (element.unknownSize) break;
      offset = absDataOffset + element.dataSize;
    }
  }
  return { clusterBlocks: blocks, nextOffset: clusterEnd };
}
async function parseSimpleBlock(reader, dataOffset, dataSize, clusterTimestamp, tsMultiplier, subtitleTrackNumbers) {
  const peekSize = Math.min(8, dataSize);
  const peekBuf = await reader.read(dataOffset, peekSize);
  const trackVint = readTrackNumber(peekBuf, 0);
  const trackNum = trackVint.value;
  if (!subtitleTrackNumbers.has(trackNum)) {
    return null;
  }
  const blockData = await reader.read(dataOffset, dataSize);
  const tsOffset = trackVint.length;
  const relativeTimestamp = blockData[tsOffset] << 8 | blockData[tsOffset + 1];
  const signedRelTs = relativeTimestamp > 32767 ? relativeTimestamp - 65536 : relativeTimestamp;
  const payloadStart = tsOffset + 3;
  const payload = blockData.slice(payloadStart);
  const absoluteTimestamp = (clusterTimestamp + signedRelTs) * tsMultiplier;
  return {
    trackNumber: trackNum,
    timestampMs: absoluteTimestamp,
    durationMs: void 0,
    data: payload,
    additions: null
  };
}
async function processBlockGroup(reader, groupDataStart, groupDataSize, clusterTimestamp, tsMultiplier, subtitleTrackNumbers) {
  const peekSize = Math.min(32, groupDataSize);
  const peekBuf = await reader.read(groupDataStart, peekSize);
  let peekOffset = 0;
  let blockTrackNum = -1;
  while (peekOffset < peekBuf.length - 4) {
    try {
      const el = parseElementHeader(peekBuf, peekOffset);
      if (el.id === BLOCK) {
        const blockHeaderStart = el.dataOffset;
        if (blockHeaderStart < peekBuf.length) {
          const tv = readTrackNumber(peekBuf, blockHeaderStart);
          blockTrackNum = tv.value;
        }
        break;
      }
      if (el.unknownSize) break;
      peekOffset = el.dataOffset + el.dataSize;
    } catch (e) {
      break;
    }
  }
  if (blockTrackNum < 0 || !subtitleTrackNumbers.has(blockTrackNum)) {
    return [];
  }
  const groupData = await reader.read(groupDataStart, groupDataSize);
  let blockElement = null;
  let blockDuration;
  let additions = null;
  for (const child of iterateChildren(groupData, 0, groupDataSize)) {
    if (child.id === BLOCK) {
      blockElement = child;
    } else if (child.id === BLOCK_DURATION) {
      blockDuration = readUint(groupData, child.dataOffset, child.dataSize);
    } else if (child.id === BLOCK_ADDITIONS) {
      additions = parseBlockAdditions(groupData, child);
    }
  }
  if (!blockElement) return [];
  const blockData = groupData.subarray(blockElement.dataOffset, blockElement.dataOffset + blockElement.dataSize);
  const trackVint = readTrackNumber(blockData, 0);
  const tsOffset = trackVint.length;
  const relativeTimestamp = blockData[tsOffset] << 8 | blockData[tsOffset + 1];
  const signedRelTs = relativeTimestamp > 32767 ? relativeTimestamp - 65536 : relativeTimestamp;
  const payloadStart = tsOffset + 3;
  const payload = blockData.slice(payloadStart);
  const absoluteTimestamp = (clusterTimestamp + signedRelTs) * tsMultiplier;
  const durationMs = blockDuration !== void 0 ? blockDuration * tsMultiplier : void 0;
  return [{
    trackNumber: trackVint.value,
    timestampMs: absoluteTimestamp,
    durationMs,
    data: payload,
    additions
  }];
}
function parseBlockAdditions(data, additionsEl) {
  for (const blockMore of iterateChildren(data, additionsEl.dataOffset, additionsEl.dataSize)) {
    if (blockMore.id !== BLOCK_MORE) continue;
    for (const child of iterateChildren(data, blockMore.dataOffset, blockMore.dataSize)) {
      if (child.id === BLOCK_ADDITIONAL) {
        return data.slice(child.dataOffset, child.dataOffset + child.dataSize);
      }
    }
  }
  return null;
}
async function readTargetedBlocks(reader, segmentDataOffset, cueEntries, subtitleTrackNumbers, timestampScale, concurrency, log) {
  const blocks = [];
  const tsMultiplier = timestampScale / 1e6;
  const workers = Math.max(1, concurrency != null ? concurrency : 1);
  const clusterGroups = /* @__PURE__ */ new Map();
  for (const entry of cueEntries) {
    const group = clusterGroups.get(entry.clusterPosition);
    if (group) {
      group.push(entry);
    } else {
      clusterGroups.set(entry.clusterPosition, [entry]);
    }
  }
  const firstClusterPos = cueEntries[0].clusterPosition;
  const probeBuf = await reader.read(segmentDataOffset + firstClusterPos, HEADER_READ_SIZE, HEADER_READ_SIZE);
  const clusterHeaderSize = parseElementHeader(probeBuf, 0).dataOffset;
  const directTargets = [];
  const fallbackClusters = [];
  for (const [clusterPos, entries] of clusterGroups) {
    if (entries.every((e) => e.relativePosition !== void 0)) {
      for (const entry of entries) {
        directTargets.push({
          absPos: segmentDataOffset + clusterPos + clusterHeaderSize + entry.relativePosition,
          entry
        });
      }
    } else {
      fallbackClusters.push([clusterPos, entries]);
    }
  }
  directTargets.sort((a, b) => a.absPos - b.absPos);
  if (directTargets.length > 0) {
    const batchThreshold = computeBatchThreshold(directTargets);
    const batches = groupIntoBatches(directTargets, batchThreshold);
    log == null ? void 0 : log(`[mkv-extract] Batch heuristic: ${directTargets.length} blocks \u2192 ${batches.length} read(s) (gap threshold: ${formatSize(batchThreshold)})${workers > 1 ? `, concurrency=${workers}` : ""}`);
    async function processBatch(batch) {
      const batchBlocks = [];
      const readStart = batch[0].absPos;
      const readEnd = batch[batch.length - 1].absPos + BLOCK_SIZE_ESTIMATE;
      const batchData = await reader.read(readStart, readEnd - readStart, BLOCK_SIZE_ESTIMATE);
      for (const target of batch) {
        const localOffset = target.absPos - readStart;
        const remaining = batchData.length - localOffset;
        if (remaining < HEADER_READ_SIZE) continue;
        let elementData;
        let el;
        try {
          const headerEl = parseElementHeader(batchData, localOffset);
          const elementEnd = headerEl.dataOffset + headerEl.dataSize;
          if (elementEnd <= batchData.length) {
            elementData = batchData.subarray(localOffset, elementEnd);
            el = parseElementHeader(elementData, 0);
          } else {
            const elementSize = headerEl.dataOffset - localOffset + headerEl.dataSize;
            elementData = await reader.read(target.absPos, elementSize, BLOCK_SIZE_ESTIMATE);
            el = parseElementHeader(elementData, 0);
          }
        } catch (e) {
          continue;
        }
        const block = parseBlockElement(
          elementData,
          el,
          target.entry.time * tsMultiplier,
          subtitleTrackNumbers,
          tsMultiplier
        );
        if (block) batchBlocks.push(block);
      }
      return batchBlocks;
    }
    if (workers <= 1) {
      for (const batch of batches) {
        blocks.push(...await processBatch(batch));
      }
    } else {
      const results = await mapConcurrent(batches, workers, processBatch);
      for (const batchBlocks of results) {
        blocks.push(...batchBlocks);
      }
    }
  }
  for (const [clusterPos] of fallbackClusters) {
    const absPos = segmentDataOffset + clusterPos;
    const headerBuf = await reader.read(absPos, HEADER_READ_SIZE);
    const clusterEl = parseElementHeader(headerBuf, 0);
    const clusterDataStart = absPos + clusterEl.dataOffset;
    const clusterEnd = clusterEl.unknownSize ? reader.size : clusterDataStart + clusterEl.dataSize;
    const { clusterBlocks } = await processCluster(
      reader,
      clusterDataStart,
      clusterEnd,
      clusterEl.unknownSize,
      subtitleTrackNumbers,
      tsMultiplier
    );
    blocks.push(...clusterBlocks);
  }
  blocks.sort((a, b) => a.timestampMs - b.timestampMs);
  return blocks;
}
async function mapConcurrent(items, concurrency, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}
function computeBatchThreshold(targets) {
  if (targets.length < 2) return 0;
  const gaps = [];
  for (let i = 1; i < targets.length; i++) {
    gaps.push(targets[i].absPos - targets[i - 1].absPos);
  }
  gaps.sort((a, b) => a - b);
  const medianGap = gaps[Math.floor(gaps.length / 2)];
  if (medianGap < MAX_BATCH_GAP) {
    return Math.min(Math.max(medianGap * 2, READ_AHEAD), MAX_BATCH_GAP);
  }
  return 128 * 1024;
}
function groupIntoBatches(targets, threshold) {
  const batches = [];
  let current = [targets[0]];
  for (let i = 1; i < targets.length; i++) {
    const gap = targets[i].absPos - targets[i - 1].absPos;
    const span = targets[i].absPos - current[0].absPos + BLOCK_SIZE_ESTIMATE;
    if (gap <= threshold && span <= MAX_BATCH_BYTES) {
      current.push(targets[i]);
    } else {
      batches.push(current);
      current = [targets[i]];
    }
  }
  batches.push(current);
  return batches;
}
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function parseBlockElement(elementData, el, cueTimeMs, subtitleTrackNumbers, tsMultiplier) {
  if (el.id === SIMPLE_BLOCK) {
    const blockData = elementData.subarray(el.dataOffset, el.dataOffset + el.dataSize);
    const trackVint = readTrackNumber(blockData, 0);
    if (!subtitleTrackNumbers.has(trackVint.value)) return null;
    const payloadStart = trackVint.length + 3;
    return {
      trackNumber: trackVint.value,
      timestampMs: cueTimeMs,
      durationMs: void 0,
      data: blockData.slice(payloadStart),
      additions: null
    };
  }
  if (el.id === BLOCK_GROUP) {
    let blockPayload = null;
    let trackNum = 0;
    let blockDuration;
    let additions = null;
    for (const child of iterateChildren(elementData, el.dataOffset, el.dataSize)) {
      if (child.id === BLOCK) {
        const raw = elementData.subarray(child.dataOffset, child.dataOffset + child.dataSize);
        const tv = readTrackNumber(raw, 0);
        trackNum = tv.value;
        const payloadStart = tv.length + 3;
        blockPayload = raw.slice(payloadStart);
      } else if (child.id === BLOCK_DURATION) {
        blockDuration = readUint(elementData, child.dataOffset, child.dataSize);
      } else if (child.id === BLOCK_ADDITIONS) {
        additions = parseBlockAdditions(elementData, child);
      }
    }
    if (!blockPayload || !subtitleTrackNumbers.has(trackNum)) return null;
    return {
      trackNumber: trackNum,
      timestampMs: cueTimeMs,
      durationMs: blockDuration !== void 0 ? blockDuration * tsMultiplier : void 0,
      data: blockPayload,
      additions
    };
  }
  return null;
}

// mkv-subtitle-extractor/src/util.ts
var encoder = new TextEncoder();
var decoder = new TextDecoder("utf-8");
function decodeUtf8(data) {
  return decoder.decode(data);
}
function encodeUtf8(text) {
  return encoder.encode(text);
}

// mkv-subtitle-extractor/src/subtitle/srt.ts
function formatSrtTimestamp(ms) {
  const totalMs = Math.round(ms);
  const hours = Math.floor(totalMs / 36e5);
  const minutes = Math.floor(totalMs % 36e5 / 6e4);
  const seconds = Math.floor(totalMs % 6e4 / 1e3);
  const millis = totalMs % 1e3;
  return String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0") + "," + String(millis).padStart(3, "0");
}
function assembleSrt(blocks) {
  var _a;
  const sorted = [...blocks].sort((a, b) => a.timestampMs - b.timestampMs);
  const lines = [];
  for (let i = 0; i < sorted.length; i++) {
    const block = sorted[i];
    const index = i + 1;
    const start = formatSrtTimestamp(block.timestampMs);
    const end = formatSrtTimestamp(block.timestampMs + ((_a = block.durationMs) != null ? _a : 0));
    const text = decodeUtf8(block.data);
    lines.push(`${index}`);
    lines.push(`${start} --> ${end}`);
    lines.push(text);
    lines.push("");
  }
  return encodeUtf8(lines.join("\n"));
}

// mkv-subtitle-extractor/src/subtitle/ass.ts
function formatAssTimestamp(ms) {
  const totalCs = Math.round(ms / 10);
  const hours = Math.floor(totalCs / 36e4);
  const minutes = Math.floor(totalCs % 36e4 / 6e3);
  const seconds = Math.floor(totalCs % 6e3 / 100);
  const centis = totalCs % 100;
  return String(hours) + ":" + String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0") + "." + String(centis).padStart(2, "0");
}
function parseAssBlockPayload(text) {
  const parts = [];
  let start = 0;
  for (let i = 0; i < 8; i++) {
    const commaIdx = text.indexOf(",", start);
    if (commaIdx === -1) return null;
    parts.push(text.substring(start, commaIdx));
    start = commaIdx + 1;
  }
  const dialogueText = text.substring(start);
  return {
    readOrder: parseInt(parts[0], 10),
    layer: parts[1],
    style: parts[2],
    name: parts[3],
    marginL: parts[4],
    marginR: parts[5],
    marginV: parts[6],
    effect: parts[7],
    dialogueText
  };
}
function assembleAss(track, blocks) {
  var _a;
  const header = track.codecPrivate ? decodeUtf8(track.codecPrivate) : "";
  const lineEnding = header.includes("\r\n") ? "\r\n" : "\n";
  const hasEvents = header.includes("[Events]");
  const parsedBlocks = [];
  for (const block of blocks) {
    const text = decodeUtf8(block.data);
    const parsed = parseAssBlockPayload(text);
    if (parsed) {
      parsedBlocks.push({ parsed, block });
    }
  }
  parsedBlocks.sort((a, b) => a.parsed.readOrder - b.parsed.readOrder);
  const parts = [];
  if (hasEvents) {
    parts.push(header.trimEnd() + lineEnding);
  } else {
    parts.push(header.trimEnd());
    parts.push(lineEnding + lineEnding);
    parts.push("[Events]" + lineEnding);
    parts.push("Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text" + lineEnding);
  }
  for (const { parsed, block } of parsedBlocks) {
    const start = formatAssTimestamp(block.timestampMs);
    const end = formatAssTimestamp(block.timestampMs + ((_a = block.durationMs) != null ? _a : 0));
    parts.push(
      `Dialogue: ${parsed.layer},${start},${end},${parsed.style},${parsed.name},${parsed.marginL},${parsed.marginR},${parsed.marginV},${parsed.effect},${parsed.dialogueText}` + lineEnding
    );
  }
  parts.push(lineEnding);
  return encodeUtf8(parts.join(""));
}

// mkv-subtitle-extractor/src/subtitle/vtt.ts
function formatVttTimestamp(ms) {
  const totalMs = Math.round(ms);
  const hours = Math.floor(totalMs / 36e5);
  const minutes = Math.floor(totalMs % 36e5 / 6e4);
  const seconds = Math.floor(totalMs % 6e4 / 1e3);
  const millis = totalMs % 1e3;
  return String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0") + "." + String(millis).padStart(3, "0");
}
function parseVttAdditions(additions) {
  if (!additions || additions.length === 0) {
    return { cueId: "", cueSettings: "", comments: "" };
  }
  const text = decodeUtf8(additions);
  const lines = text.split("\n");
  return {
    cueId: lines[0] || "",
    cueSettings: lines[1] || "",
    comments: lines.slice(2).join("\n")
  };
}
function assembleVtt(track, blocks) {
  var _a;
  const header = track.codecPrivate ? decodeUtf8(track.codecPrivate) : "WEBVTT";
  const sorted = [...blocks].sort((a, b) => a.timestampMs - b.timestampMs);
  const lines = [];
  lines.push(header.trimEnd());
  lines.push("");
  for (const block of sorted) {
    const { cueId, cueSettings, comments } = parseVttAdditions(block.additions);
    if (comments) {
      lines.push(comments);
      lines.push("");
    }
    if (cueId) {
      lines.push(cueId);
    }
    const start = formatVttTimestamp(block.timestampMs);
    const end = formatVttTimestamp(block.timestampMs + ((_a = block.durationMs) != null ? _a : 0));
    const timeLine = cueSettings ? `${start} --> ${end} ${cueSettings}` : `${start} --> ${end}`;
    lines.push(timeLine);
    const text = decodeUtf8(block.data);
    lines.push(text);
    lines.push("");
  }
  return encodeUtf8(lines.join("\n"));
}

// mkv-subtitle-extractor/src/subtitle/assembler.ts
function assembleSubtitle(track, blocks) {
  switch (track.codecId) {
    case "S_TEXT/UTF8":
      return assembleSrt(blocks);
    case "S_TEXT/ASS":
    case "S_TEXT/SSA":
      return assembleAss(track, blocks);
    case "S_TEXT/WEBVTT":
      return assembleVtt(track, blocks);
    default:
      return assembleSrt(blocks);
  }
}
