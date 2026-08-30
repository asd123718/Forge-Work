"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/@microsoft/tiktokenizer/dist/bytePairEncode.js
var require_bytePairEncode = __commonJS({
  "node_modules/@microsoft/tiktokenizer/dist/bytePairEncode.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.bytePairEncode = exports2.BinaryMap = exports2.binaryMapKey = void 0;
    var binaryMapKey = (k, start, end) => {
      const length = end - start;
      const lowerMask = 16777215 >>> Math.max(0, (3 - length) * 8);
      const lower = (k[start + 0] | k[start + 1] << 8 | k[start + 2] << 16) & lowerMask;
      const upperMask = 16777215 >>> Math.min(31, Math.max(0, (6 - length) * 8));
      const upper = (k[start + 3] | k[start + 4] << 8 | k[start + 5] << 16) & upperMask;
      return lower + 16777216 * upper;
    };
    exports2.binaryMapKey = binaryMapKey;
    var BinaryMap = class _BinaryMap {
      constructor() {
        this.nested = /* @__PURE__ */ new Map();
        this.final = /* @__PURE__ */ new Map();
      }
      get(key, start = 0, end = key.length) {
        const isFinal = end < 6 + start;
        const mapKey = (0, exports2.binaryMapKey)(key, start, end);
        if (isFinal) {
          return this.final.get(mapKey);
        }
        return this.nested.get(mapKey)?.get(key, 6 + start, end);
      }
      set(key, value) {
        const k = (0, exports2.binaryMapKey)(key, 0, key.length);
        const isFinal = key.length < 6;
        if (isFinal) {
          this.final.set(k, value);
          return;
        }
        const existing = this.nested.get(k);
        if (existing instanceof _BinaryMap) {
          existing.set(key.subarray(
            6
            /* Constant.BytesPerLevel */
          ), value);
        } else {
          const newMap = new _BinaryMap();
          newMap.set(key.subarray(
            6
            /* Constant.BytesPerLevel */
          ), value);
          this.nested.set(k, newMap);
        }
      }
    };
    exports2.BinaryMap = BinaryMap;
    var ranksBuf = new Int32Array(128);
    var indicesBuf = new Int32Array(128);
    function bytePairEncode(mergingBytes, ranks, length) {
      if (length === 1) {
        return [ranks.get(mergingBytes)];
      }
      let minRank = 2147483647;
      let minIndex = -1;
      while (ranksBuf.length < length * 2) {
        indicesBuf = new Int32Array(indicesBuf.length * 2);
        ranksBuf = new Int32Array(ranksBuf.length * 2);
      }
      for (let i = 0; i < length - 1; i++) {
        const rank = ranks.get(mergingBytes, i, i + 2) ?? 2147483647;
        if (rank < minRank) {
          minRank = rank;
          minIndex = i;
        }
        indicesBuf[i] = i;
        ranksBuf[i] = rank;
      }
      indicesBuf[length - 1] = length - 1;
      ranksBuf[length - 1] = 2147483647;
      indicesBuf[length] = length;
      ranksBuf[length] = 2147483647;
      let maxIndex = length + 1;
      function getRank(startIndex, skip = 0) {
        if (startIndex + skip + 2 < maxIndex) {
          const rank = ranks.get(mergingBytes, indicesBuf[startIndex], indicesBuf[startIndex + skip + 2]);
          if (rank !== void 0) {
            return rank;
          }
        }
        return 2147483647;
      }
      while (minRank !== 2147483647) {
        ranksBuf[indicesBuf[minIndex]] = getRank(minIndex, 1);
        if (minIndex > 0) {
          ranksBuf[indicesBuf[minIndex - 1]] = getRank(minIndex - 1, 1);
        }
        for (let i = minIndex + 1; i < maxIndex - 1; i++) {
          indicesBuf[i] = indicesBuf[i + 1];
        }
        maxIndex--;
        minIndex = -1;
        minRank = 2147483647;
        for (let i = 0; i < maxIndex - 1; i++) {
          const rank = ranksBuf[indicesBuf[i]];
          if (ranksBuf[indicesBuf[i]] < minRank) {
            minRank = rank;
            minIndex = i;
          }
        }
      }
      const outList = [];
      for (let i = 0; i < maxIndex - 1; i++) {
        outList.push(ranks.get(mergingBytes, indicesBuf[i], indicesBuf[i + 1]));
      }
      return outList;
    }
    exports2.bytePairEncode = bytePairEncode;
  }
});

// node_modules/@microsoft/tiktokenizer/dist/textEncoder.js
var require_textEncoder = __commonJS({
  "node_modules/@microsoft/tiktokenizer/dist/textEncoder.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.makeTextEncoder = void 0;
    var UniversalTextEncoder = class {
      constructor() {
        this.length = 0;
        this.encoder = new TextEncoder();
      }
      encode(text) {
        const arr = this.encoder.encode(text);
        this.length = arr.length;
        return arr;
      }
    };
    var NodeTextEncoder = class {
      constructor() {
        this.buffer = Buffer.alloc(256);
        this.length = 0;
      }
      encode(text) {
        while (true) {
          this.length = this.buffer.write(text, "utf8");
          if (this.length < this.buffer.length - 4) {
            return this.buffer;
          }
          this.buffer = Buffer.alloc(this.length * 2);
          this.length = this.buffer.write(text);
        }
      }
    };
    var makeTextEncoder = () => typeof Buffer !== "undefined" ? new NodeTextEncoder() : new UniversalTextEncoder();
    exports2.makeTextEncoder = makeTextEncoder;
  }
});

// node_modules/@microsoft/tiktokenizer/dist/lru.js
var require_lru = __commonJS({
  "node_modules/@microsoft/tiktokenizer/dist/lru.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.LRUCache = void 0;
    var LRUCache = class {
      constructor(size) {
        this.size = size;
        this.nodes = /* @__PURE__ */ new Map();
      }
      get(key) {
        const node = this.nodes.get(key);
        if (node) {
          this.moveToHead(node);
          return node.value;
        }
        return void 0;
      }
      set(key, value) {
        const node = this.nodes.get(key);
        if (node) {
          node.value = value;
          this.moveToHead(node);
        } else {
          const newNode = new Node(key, value);
          this.nodes.set(key, newNode);
          this.addNode(newNode);
          if (this.nodes.size > this.size) {
            this.nodes.delete(this.tail.key);
            this.removeNode(this.tail);
          }
        }
      }
      moveToHead(node) {
        this.removeNode(node);
        node.next = void 0;
        node.prev = void 0;
        this.addNode(node);
      }
      addNode(node) {
        if (this.head) {
          this.head.prev = node;
          node.next = this.head;
        }
        if (!this.tail) {
          this.tail = node;
        }
        this.head = node;
      }
      removeNode(node) {
        if (node.prev) {
          node.prev.next = node.next;
        } else {
          this.head = node.next;
        }
        if (node.next) {
          node.next.prev = node.prev;
        } else {
          this.tail = node.prev;
        }
      }
    };
    exports2.LRUCache = LRUCache;
    var Node = class {
      constructor(key, value) {
        this.key = key;
        this.value = value;
      }
    };
  }
});

// node_modules/@microsoft/tiktokenizer/dist/tikTokenizer.js
var require_tikTokenizer = __commonJS({
  "node_modules/@microsoft/tiktokenizer/dist/tikTokenizer.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.TikTokenizer = void 0;
    var bytePairEncode_1 = require_bytePairEncode();
    var textEncoder_1 = require_textEncoder();
    var lru_1 = require_lru();
    function loadTikTokenBpe(tikTokenBpeFile) {
      const bpeDict = /* @__PURE__ */ new Map();
      try {
        const fs = require("fs");
        const fileContent = fs.readFileSync(tikTokenBpeFile, "utf-8");
        processBpeRanks(fileContent);
        return bpeDict;
      } catch (ex) {
        throw new Error(`Failed to load from BPE encoder file stream: ${ex}`);
      }
      function processBpeRanks(fileContent) {
        for (const line of fileContent.split(/[\r\n]+/)) {
          if (line.trim() === "") {
            continue;
          }
          const tokens = line.split(" ");
          if (tokens.length !== 2) {
            throw new Error("Invalid format in the BPE encoder file stream");
          }
          const tokenBytes = new Uint8Array(Buffer.from(tokens[0], "base64"));
          const rank = parseInt(tokens[1]);
          if (!isNaN(rank)) {
            bpeDict.set(tokenBytes, rank);
          } else {
            throw new Error(`Can't parse ${tokens[1]} to integer`);
          }
        }
      }
    }
    function escapeRegExp(regex) {
      return regex.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    var TikTokenizer2 = class {
      /**
       * Take the encoder tokens mapping from OpenAI tiktoken dump to build the encoder
       * For gpt-3.5-turbo/gpt4, you can download the BPE tokens mapping from:
       * https://openaipublic.blob.core.windows.net/encodings/cl100k_base.tiktoken
       * @param tikTokenBpeFileOrDict BPE rank file path or parsed dictionary
       * @param specialTokensEncoder special tokens encoder
       * @param regexPattern regex pattern to split the input text
       * @param cacheSize cache size
       */
      constructor(tikTokenBpeFileOrDict, specialTokensEncoder, regexPattern, cacheSize = 8192) {
        this.textEncoder = (0, textEncoder_1.makeTextEncoder)();
        this.textDecoder = new TextDecoder("utf-8");
        this.cache = new lru_1.LRUCache(cacheSize);
        const bpeDict = typeof tikTokenBpeFileOrDict === "string" ? loadTikTokenBpe(tikTokenBpeFileOrDict) : tikTokenBpeFileOrDict;
        this.init(bpeDict, specialTokensEncoder, regexPattern);
      }
      init(bpeDict, specialTokensEncoder, regexPattern) {
        this.encoder = new bytePairEncode_1.BinaryMap();
        for (const [key, value] of bpeDict) {
          this.encoder.set(key, value);
        }
        this.regex = new RegExp(regexPattern, "gu");
        this.specialTokensRegex = new RegExp(Array.from(specialTokensEncoder.keys()).map((s) => escapeRegExp(s)).join("|"));
        this.specialTokensEncoder = specialTokensEncoder;
        this.decoder = /* @__PURE__ */ new Map();
        for (const [key, value] of bpeDict) {
          this.decoder.set(value, key);
        }
        if (bpeDict.size !== this.decoder.size) {
          throw new Error("Encoder and decoder sizes do not match");
        }
        this.specialTokensDecoder = /* @__PURE__ */ new Map();
        for (const [key, value] of specialTokensEncoder) {
          this.specialTokensDecoder.set(value, key);
        }
      }
      findNextSpecialToken(text, start, allowedSpecial) {
        let startFind = start;
        let nextSpecial = null;
        if (allowedSpecial && this.specialTokensRegex) {
          while (true) {
            nextSpecial = text.slice(startFind).match(this.specialTokensRegex);
            if (!nextSpecial) {
              break;
            }
            if (allowedSpecial && allowedSpecial.includes(nextSpecial[0])) {
              break;
            }
            startFind += nextSpecial.index + 1;
          }
        }
        const end = nextSpecial ? startFind + nextSpecial.index : text.length;
        return [nextSpecial, end];
      }
      /**
       * Encode a string with a set of allowed special tokens that are not broken apart.
       * @param text text to encode
       * @param allowedSpecial allowed special tokens
       * @returns number[] encoded token ids
       */
      encode(text, allowedSpecial) {
        const tokenIds = [];
        let start = 0;
        while (true) {
          let nextSpecial;
          let end;
          [nextSpecial, end] = this.findNextSpecialToken(text, start, allowedSpecial);
          if (end > start) {
            this.encodeByIndex(text, tokenIds, start, end);
          }
          if (nextSpecial) {
            start = start + this.encodeSpecialToken(tokenIds, nextSpecial);
            if (start >= text.length) {
              break;
            }
          } else {
            break;
          }
        }
        return tokenIds;
      }
      encodeSpecialToken(tokenIds, nextSpecial) {
        const token = this.specialTokensEncoder?.get(nextSpecial[0]);
        tokenIds.push(token);
        return nextSpecial.index + nextSpecial[0].length;
      }
      encodeByIndex(text, tokenIds, start, end) {
        let match;
        const substring = text.substring(start, end);
        this.regex.lastIndex = 0;
        while (match = this.regex.exec(substring)) {
          const cached = this.cache.get(match[0]);
          if (cached) {
            for (const b of cached) {
              tokenIds.push(b);
            }
          } else {
            const bytes = this.textEncoder.encode(match[0]);
            const token = this.encoder.get(bytes, 0, this.textEncoder.length);
            if (token !== void 0) {
              tokenIds.push(token);
              this.cache.set(match[0], [token]);
            } else {
              const encodedTokens = (0, bytePairEncode_1.bytePairEncode)(bytes, this.encoder, this.textEncoder.length);
              for (const b of encodedTokens) {
                tokenIds.push(b);
              }
              this.cache.set(match[0], encodedTokens);
            }
          }
        }
      }
      encodeTrimSuffixByIndex(text, tokenIds, start, end, maxTokenCount, tokenCount, encodeLength) {
        let match;
        const substring = text.substring(start, end);
        this.regex.lastIndex = 0;
        while (match = this.regex.exec(substring)) {
          const piece = match[0];
          const cachedTokens = this.cache.get(piece);
          if (cachedTokens) {
            if (tokenCount + cachedTokens.length <= maxTokenCount) {
              tokenCount += cachedTokens.length;
              encodeLength += piece.length;
              tokenIds.push(...cachedTokens);
            } else {
              let remainingTokens = maxTokenCount - tokenCount;
              tokenCount += remainingTokens;
              encodeLength += piece.length;
              tokenIds.push(...cachedTokens.slice(0, remainingTokens));
              break;
            }
          } else {
            const bytes = this.textEncoder.encode(piece);
            const token = this.encoder.get(bytes, 0, bytes.length);
            if (token !== void 0) {
              this.cache.set(piece, [token]);
              if (tokenCount + 1 <= maxTokenCount) {
                tokenCount++;
                encodeLength += piece.length;
                tokenIds.push(token);
              } else {
                break;
              }
            } else {
              const encodedTokens = (0, bytePairEncode_1.bytePairEncode)(bytes, this.encoder, this.textEncoder.length);
              this.cache.set(piece, encodedTokens);
              if (tokenCount + encodedTokens.length <= maxTokenCount) {
                tokenCount += encodedTokens.length;
                encodeLength += piece.length;
                for (const b of encodedTokens) {
                  tokenIds.push(b);
                }
              } else {
                let remainingTokens = maxTokenCount - tokenCount;
                tokenCount += remainingTokens;
                encodeLength += piece.length;
                for (let i = 0; i < remainingTokens; i++) {
                  tokenIds.push(encodedTokens[i]);
                }
                break;
              }
            }
          }
          if (tokenCount >= maxTokenCount) {
            break;
          }
        }
        return { tokenCount, encodeLength };
      }
      /**
       * Encode a piece of text limited by max token count through trimming suffix
       * @param text text to encode
       * @param maxTokenCount max token count
       * @param allowedSpecial allowed special tokens
       * @returns { tokenIds: number[], text: string } encoded token ids and trimmed text
       */
      encodeTrimSuffix(text, maxTokenCount, allowedSpecial) {
        const tokenIds = [];
        let start = 0;
        let tokenCount = 0;
        let encodeLength = 0;
        while (true) {
          let nextSpecial;
          let end;
          [nextSpecial, end] = this.findNextSpecialToken(text, start, allowedSpecial);
          if (end > start) {
            const { tokenCount: newTokenCount, encodeLength: newEncodeLength } = this.encodeTrimSuffixByIndex(text, tokenIds, start, end, maxTokenCount, tokenCount, encodeLength);
            tokenCount = newTokenCount;
            encodeLength = newEncodeLength;
            if (tokenCount >= maxTokenCount) {
              break;
            }
          }
          if (nextSpecial !== null) {
            tokenCount++;
            if (tokenCount <= maxTokenCount) {
              start = start + this.encodeSpecialToken(tokenIds, nextSpecial);
              encodeLength += nextSpecial[0].length;
              if (start >= text.length) {
                break;
              }
            }
            if (tokenCount >= maxTokenCount) {
              break;
            }
          } else {
            break;
          }
        }
        const encodedText = encodeLength === text.length ? text : text.slice(0, encodeLength);
        return { tokenIds, text: encodedText };
      }
      /**
       * Encode a piece of text limited by max token count through trimming prefix
       * @param text text to encode
       * @param maxTokenCount max token count
       * @param allowedSpecial allowed special tokens
       * @returns { tokenIds: number[], text: string } encoded token ids and trimmed text
       */
      encodeTrimPrefix(text, maxTokenCount, allowedSpecial) {
        const tokenIds = [];
        let start = 0;
        let tokenCount = 0;
        let encodeLength = 0;
        const tokenCountMap = /* @__PURE__ */ new Map();
        tokenCountMap.set(tokenCount, encodeLength);
        while (true) {
          let nextSpecial;
          let end;
          [nextSpecial, end] = this.findNextSpecialToken(text, start, allowedSpecial);
          if (end > start) {
            let match;
            const substring = text.substring(start, end);
            this.regex.lastIndex = 0;
            while (match = this.regex.exec(substring)) {
              const piece = match[0];
              const cachedTokens = this.cache.get(piece);
              if (cachedTokens) {
                tokenCount += cachedTokens.length;
                encodeLength += piece.length;
                tokenIds.push(...cachedTokens);
                tokenCountMap.set(tokenCount, encodeLength);
              } else {
                const bytes = this.textEncoder.encode(piece);
                const token = this.encoder.get(bytes);
                if (token !== void 0) {
                  this.cache.set(piece, [token]);
                  tokenCount++;
                  encodeLength += piece.length;
                  tokenIds.push(token);
                  tokenCountMap.set(tokenCount, encodeLength);
                } else {
                  const encodedTokens = (0, bytePairEncode_1.bytePairEncode)(bytes, this.encoder, this.textEncoder.length);
                  this.cache.set(piece, encodedTokens);
                  tokenCount += encodedTokens.length;
                  encodeLength += piece.length;
                  for (const b of encodedTokens) {
                    tokenIds.push(b);
                  }
                  tokenCountMap.set(tokenCount, encodeLength);
                }
              }
            }
          }
          if (nextSpecial !== null) {
            start = start + this.encodeSpecialToken(tokenIds, nextSpecial);
            tokenCount++;
            encodeLength += nextSpecial[0].length;
            tokenCountMap.set(tokenCount, encodeLength);
            if (start >= text.length) {
              break;
            }
          } else {
            break;
          }
        }
        if (tokenCount <= maxTokenCount) {
          return { tokenIds, text };
        }
        const prefixTokenCount = tokenCount - maxTokenCount;
        let actualPrefixTokenCount = 0;
        let actualPrefixStrLength = 0;
        for (const [key, value] of tokenCountMap) {
          if (key >= prefixTokenCount) {
            actualPrefixTokenCount = key;
            actualPrefixStrLength = value;
            break;
          }
        }
        if (actualPrefixTokenCount > maxTokenCount) {
          const encodedTokens = this.encode(text, allowedSpecial);
          const slicedTokens = encodedTokens.slice(encodedTokens.length - maxTokenCount);
          return {
            tokenIds: slicedTokens,
            text: this.decode(slicedTokens)
          };
        }
        return {
          tokenIds: tokenIds.slice(actualPrefixTokenCount),
          text: text.slice(actualPrefixStrLength)
        };
      }
      /**
       * Decode an array of integer token ids
       * @param tokens array of integer token ids
       * @returns string decoded text
       */
      decode(tokens) {
        const decoded = [];
        for (const token of tokens) {
          let tokenBytes = [];
          const value = this.decoder?.get(token);
          if (value !== void 0) {
            tokenBytes = Array.from(value);
          } else {
            const specialTokenValue = this.specialTokensDecoder?.get(token);
            if (specialTokenValue !== void 0) {
              const bytes = this.textEncoder.encode(specialTokenValue);
              tokenBytes = Array.from(bytes.subarray(0, this.textEncoder.length));
            }
          }
          decoded.push(...tokenBytes);
        }
        return this.textDecoder.decode(new Uint8Array(decoded));
      }
    };
    exports2.TikTokenizer = TikTokenizer2;
  }
});

// node_modules/@microsoft/tiktokenizer/dist/tokenizerBuilder.js
var require_tokenizerBuilder = __commonJS({
  "node_modules/@microsoft/tiktokenizer/dist/tokenizerBuilder.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createTokenizer = exports2.createByEncoderName = exports2.createByModelName = exports2.getRegexByModel = exports2.getRegexByEncoder = exports2.getSpecialTokensByModel = exports2.getSpecialTokensByEncoder = exports2.MODEL_TO_ENCODING = void 0;
    var tikTokenizer_1 = require_tikTokenizer();
    var MODEL_PREFIX_TO_ENCODING = /* @__PURE__ */ new Map([
      // chat
      ["gpt-4o-", "o200k_base"],
      ["gpt-4-", "cl100k_base"],
      ["gpt-3.5-turbo-", "cl100k_base"],
      ["gpt-35-turbo-", "cl100k_base"]
      // Azure deployment name
    ]);
    exports2.MODEL_TO_ENCODING = /* @__PURE__ */ new Map([
      // chat
      ["gpt-4o", "o200k_base"],
      ["gpt-4", "cl100k_base"],
      ["gpt-3.5-turbo", "cl100k_base"],
      // text
      ["text-davinci-003", "p50k_base"],
      ["text-davinci-002", "p50k_base"],
      ["text-davinci-001", "r50k_base"],
      ["text-curie-001", "r50k_base"],
      ["text-babbage-001", "r50k_base"],
      ["text-ada-001", "r50k_base"],
      ["davinci", "r50k_base"],
      ["curie", "r50k_base"],
      ["babbage", "r50k_base"],
      ["ada", "r50k_base"],
      // code
      ["code-davinci-002", "p50k_base"],
      ["code-davinci-001", "p50k_base"],
      ["code-cushman-002", "p50k_base"],
      ["code-cushman-001", "p50k_base"],
      ["davinci-codex", "p50k_base"],
      ["cushman-codex", "p50k_base"],
      // edit
      ["text-davinci-edit-001", "p50k_edit"],
      ["code-davinci-edit-001", "p50k_edit"],
      // embeddings
      ["text-embedding-ada-002", "cl100k_base"],
      // old embeddings
      ["text-similarity-davinci-001", "r50k_base"],
      ["text-similarity-curie-001", "r50k_base"],
      ["text-similarity-babbage-001", "r50k_base"],
      ["text-similarity-ada-001", "r50k_base"],
      ["text-search-davinci-doc-001", "r50k_base"],
      ["text-search-curie-doc-001", "r50k_base"],
      ["text-search-babbage-doc-001", "r50k_base"],
      ["text-search-ada-doc-001", "r50k_base"],
      ["code-search-babbage-code-001", "r50k_base"],
      ["code-search-ada-code-001", "r50k_base"],
      // open source
      ["gpt2", "gpt2"]
    ]);
    var ENDOFTEXT = "<|endoftext|>";
    var FIM_PREFIX = "<|fim_prefix|>";
    var FIM_MIDDLE = "<|fim_middle|>";
    var FIM_SUFFIX = "<|fim_suffix|>";
    var ENDOFPROMPT = "<|endofprompt|>";
    var REGEX_PATTERN_1 = "'s|'t|'re|'ve|'m|'ll|'d| ?\\p{L}+| ?\\p{N}+| ?[^\\s\\p{L}\\p{N}]+|\\s+(?!\\S)|\\s+";
    var REGEX_PATTERN_2 = "(?:'s|'S|'t|'T|'re|'RE|'Re|'eR|'ve|'VE|'vE|'Ve|'m|'M|'ll|'lL|'Ll|'LL|'d|'D)|[^\\r\\n\\p{L}\\p{N}]?\\p{L}+|\\p{N}{1,3}| ?[^\\s\\p{L}\\p{N}]+[\\r\\n]*|\\s*[\\r\\n]+|\\s+(?!\\S)|\\s+";
    var patterns = [
      `[^\r
\\p{L}\\p{N}]?[\\p{Lu}\\p{Lt}\\p{Lm}\\p{Lo}\\p{M}]*[\\p{Ll}\\p{Lm}\\p{Lo}\\p{M}]+(?:'s|'S|'t|'T|'re|'RE|'Re|'eR|'ve|'VE|'vE|'Ve|'m|'M|'ll|'lL|'Ll|'LL|'d|'D)?`,
      `[^\r
\\p{L}\\p{N}]?[\\p{Lu}\\p{Lt}\\p{Lm}\\p{Lo}\\p{M}]+[\\p{Ll}\\p{Lm}\\p{Lo}\\p{M}]*(?:'s|'S|'t|'T|'re|'RE|'Re|'eR|'ve|'VE|'vE|'Ve|'m|'M|'ll|'lL|'Ll|'LL|'d|'D)?`,
      `\\p{N}{1,3}`,
      ` ?[^\\s\\p{L}\\p{N}]+[\\r\\n/]*`,
      `\\s*[\\r\\n]+`,
      `\\s+(?!\\S)`,
      `\\s+`
    ];
    var REGEX_PATTERN_3 = patterns.join("|");
    function getEncoderFromModelName(modelName) {
      let encoder = "";
      if (!exports2.MODEL_TO_ENCODING.has(modelName)) {
        for (const [prefix, encoding] of MODEL_PREFIX_TO_ENCODING) {
          if (modelName.startsWith(prefix)) {
            encoder = encoding;
            break;
          }
        }
      } else {
        encoder = exports2.MODEL_TO_ENCODING.get(modelName);
      }
      return encoder;
    }
    async function fetchAndSaveFile(mergeableRanksFileUrl, filePath) {
      const fs = require("fs");
      const response = await fetch(mergeableRanksFileUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch file from ${mergeableRanksFileUrl}. Status code: ${response.status}`);
      }
      const text = await response.text();
      fs.writeFileSync(filePath, text);
    }
    function getSpecialTokensByEncoder2(encoder) {
      let specialTokens = /* @__PURE__ */ new Map([[ENDOFTEXT, 50256]]);
      switch (encoder) {
        case "o200k_base":
          specialTokens = /* @__PURE__ */ new Map([
            [ENDOFTEXT, 199999],
            [ENDOFPROMPT, 200018]
          ]);
          break;
        case "cl100k_base":
          specialTokens = /* @__PURE__ */ new Map([
            [ENDOFTEXT, 100257],
            [FIM_PREFIX, 100258],
            [FIM_MIDDLE, 100259],
            [FIM_SUFFIX, 100260],
            [ENDOFPROMPT, 100276]
          ]);
          break;
        case "p50k_edit":
          specialTokens = /* @__PURE__ */ new Map([
            [ENDOFTEXT, 50256],
            [FIM_PREFIX, 50281],
            [FIM_MIDDLE, 50282],
            [FIM_SUFFIX, 50283]
          ]);
          break;
        default:
          break;
      }
      return specialTokens;
    }
    exports2.getSpecialTokensByEncoder = getSpecialTokensByEncoder2;
    function getSpecialTokensByModel(modelName) {
      const encoderName = getEncoderFromModelName(modelName);
      const specialTokens = getSpecialTokensByEncoder2(encoderName);
      return specialTokens;
    }
    exports2.getSpecialTokensByModel = getSpecialTokensByModel;
    function getRegexByEncoder2(encoder) {
      switch (encoder) {
        case "o200k_base":
          return REGEX_PATTERN_3;
        case "cl100k_base":
          return REGEX_PATTERN_2;
        default:
          break;
      }
      return REGEX_PATTERN_1;
    }
    exports2.getRegexByEncoder = getRegexByEncoder2;
    function getRegexByModel(modelName) {
      const encoderName = getEncoderFromModelName(modelName);
      const regexPattern = getRegexByEncoder2(encoderName);
      return regexPattern;
    }
    exports2.getRegexByModel = getRegexByModel;
    async function createByModelName(modelName, extraSpecialTokens = null) {
      return createByEncoderName(getEncoderFromModelName(modelName), extraSpecialTokens);
    }
    exports2.createByModelName = createByModelName;
    async function createByEncoderName(encoderName, extraSpecialTokens = null) {
      let regexPattern;
      let mergeableRanksFileUrl;
      let specialTokens = getSpecialTokensByEncoder2(encoderName);
      switch (encoderName) {
        case "o200k_base":
          regexPattern = REGEX_PATTERN_3;
          mergeableRanksFileUrl = `https://openaipublic.blob.core.windows.net/encodings/o200k_base.tiktoken`;
          break;
        case "cl100k_base":
          regexPattern = REGEX_PATTERN_2;
          mergeableRanksFileUrl = `https://openaipublic.blob.core.windows.net/encodings/cl100k_base.tiktoken`;
          break;
        case "p50k_base":
          regexPattern = REGEX_PATTERN_1;
          mergeableRanksFileUrl = `https://openaipublic.blob.core.windows.net/encodings/p50k_base.tiktoken`;
          break;
        case "p50k_edit":
          regexPattern = REGEX_PATTERN_1;
          mergeableRanksFileUrl = `https://openaipublic.blob.core.windows.net/encodings/p50k_base.tiktoken`;
          break;
        case "r50k_base":
          regexPattern = REGEX_PATTERN_1;
          mergeableRanksFileUrl = `https://openaipublic.blob.core.windows.net/encodings/r50k_base.tiktoken`;
          break;
        case "gpt2":
          regexPattern = REGEX_PATTERN_1;
          mergeableRanksFileUrl = `https://raw.githubusercontent.com/microsoft/Tokenizer/main/model/gpt2.tiktoken`;
          break;
        default:
          throw new Error(`Doesn't support this encoder [${encoderName}]`);
      }
      if (extraSpecialTokens !== null) {
        specialTokens = new Map([...specialTokens, ...extraSpecialTokens]);
      }
      const fs = require("fs");
      const path = require("path");
      const fileName = path.basename(mergeableRanksFileUrl);
      const dirPath = path.resolve(__dirname, "..", "model");
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      const filePath = path.resolve(dirPath, fileName);
      if (!fs.existsSync(filePath)) {
        console.log(`Downloading file from ${mergeableRanksFileUrl}`);
        await fetchAndSaveFile(mergeableRanksFileUrl, filePath);
        console.log(`Saved file to ${filePath}`);
      }
      return createTokenizer2(filePath, specialTokens, regexPattern);
    }
    exports2.createByEncoderName = createByEncoderName;
    function createTokenizer2(tikTokenBpeFileOrDict, specialTokensEncoder, regexPattern, cacheSize = 8192) {
      const tikTokenizer = new tikTokenizer_1.TikTokenizer(tikTokenBpeFileOrDict, specialTokensEncoder, regexPattern, cacheSize);
      return tikTokenizer;
    }
    exports2.createTokenizer = createTokenizer2;
  }
});

// node_modules/@microsoft/tiktokenizer/dist/index.js
var require_dist = __commonJS({
  "node_modules/@microsoft/tiktokenizer/dist/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createTokenizer = exports2.createByEncoderName = exports2.createByModelName = exports2.getSpecialTokensByModel = exports2.getSpecialTokensByEncoder = exports2.getRegexByModel = exports2.getRegexByEncoder = exports2.MODEL_TO_ENCODING = exports2.TikTokenizer = void 0;
    var tikTokenizer_1 = require_tikTokenizer();
    Object.defineProperty(exports2, "TikTokenizer", { enumerable: true, get: function() {
      return tikTokenizer_1.TikTokenizer;
    } });
    var tokenizerBuilder_1 = require_tokenizerBuilder();
    Object.defineProperty(exports2, "MODEL_TO_ENCODING", { enumerable: true, get: function() {
      return tokenizerBuilder_1.MODEL_TO_ENCODING;
    } });
    Object.defineProperty(exports2, "getRegexByEncoder", { enumerable: true, get: function() {
      return tokenizerBuilder_1.getRegexByEncoder;
    } });
    Object.defineProperty(exports2, "getRegexByModel", { enumerable: true, get: function() {
      return tokenizerBuilder_1.getRegexByModel;
    } });
    Object.defineProperty(exports2, "getSpecialTokensByEncoder", { enumerable: true, get: function() {
      return tokenizerBuilder_1.getSpecialTokensByEncoder;
    } });
    Object.defineProperty(exports2, "getSpecialTokensByModel", { enumerable: true, get: function() {
      return tokenizerBuilder_1.getSpecialTokensByModel;
    } });
    Object.defineProperty(exports2, "createByModelName", { enumerable: true, get: function() {
      return tokenizerBuilder_1.createByModelName;
    } });
    Object.defineProperty(exports2, "createByEncoderName", { enumerable: true, get: function() {
      return tokenizerBuilder_1.createByEncoderName;
    } });
    Object.defineProperty(exports2, "createTokenizer", { enumerable: true, get: function() {
      return tokenizerBuilder_1.createTokenizer;
    } });
  }
});

// src/platform/tokenizer/node/tikTokenizerWorker.ts
var import_worker_threads = require("worker_threads");

// src/platform/tokenizer/node/tikTokenizerImpl.ts
var import_tiktokenizer = __toESM(require_dist());

// src/util/vs/base/common/errors.ts
var ErrorHandler = class {
  constructor() {
    this.listeners = [];
    this.unexpectedErrorHandler = function(e) {
      setTimeout(() => {
        if (e.stack) {
          if (ErrorNoTelemetry.isErrorNoTelemetry(e)) {
            throw new ErrorNoTelemetry(e.message + "\n\n" + e.stack);
          }
          throw new Error(e.message + "\n\n" + e.stack);
        }
        throw e;
      }, 0);
    };
  }
  addListener(listener) {
    this.listeners.push(listener);
    return () => {
      this._removeListener(listener);
    };
  }
  emit(e) {
    this.listeners.forEach((listener) => {
      listener(e);
    });
  }
  _removeListener(listener) {
    this.listeners.splice(this.listeners.indexOf(listener), 1);
  }
  setUnexpectedErrorHandler(newUnexpectedErrorHandler) {
    this.unexpectedErrorHandler = newUnexpectedErrorHandler;
  }
  getUnexpectedErrorHandler() {
    return this.unexpectedErrorHandler;
  }
  onUnexpectedError(e) {
    this.unexpectedErrorHandler(e);
    this.emit(e);
  }
  // For external errors, we don't want the listeners to be called
  onUnexpectedExternalError(e) {
    this.unexpectedErrorHandler(e);
  }
};
var errorHandler = new ErrorHandler();
function onUnexpectedError(e) {
  if (!isCancellationError(e)) {
    errorHandler.onUnexpectedError(e);
  }
  return void 0;
}
var canceledName = "Canceled";
function isCancellationError(error) {
  if (error instanceof CancellationError) {
    return true;
  }
  return error instanceof Error && error.name === canceledName && error.message === canceledName;
}
var CancellationError = class extends Error {
  constructor() {
    super(canceledName);
    this.name = this.message;
  }
};
var PendingMigrationError = class _PendingMigrationError extends Error {
  static {
    this._name = "PendingMigrationError";
  }
  static is(error) {
    return error instanceof _PendingMigrationError || error instanceof Error && error.name === _PendingMigrationError._name;
  }
  constructor(message) {
    super(message);
    this.name = _PendingMigrationError._name;
  }
};
var ErrorNoTelemetry = class _ErrorNoTelemetry extends Error {
  constructor(msg) {
    super(msg);
    this.name = "CodeExpectedError";
  }
  static fromError(err) {
    if (err instanceof _ErrorNoTelemetry) {
      return err;
    }
    const result = new _ErrorNoTelemetry();
    result.message = err.message;
    result.stack = err.stack;
    return result;
  }
  static isErrorNoTelemetry(err) {
    return err.name === "CodeExpectedError";
  }
};
var BugIndicatingError = class _BugIndicatingError extends Error {
  constructor(message) {
    super(message || "An unexpected bug occurred.");
    Object.setPrototypeOf(this, _BugIndicatingError.prototype);
  }
};

// src/util/vs/base/common/numbers.ts
var MovingAverage = class {
  constructor() {
    this._n = 1;
    this._val = 0;
  }
  update(value) {
    this._val = this._val + (value - this._val) / this._n;
    this._n += 1;
    return this._val;
  }
  get value() {
    return this._val;
  }
};

// src/util/vs/base/common/stopwatch.ts
var performanceNow = globalThis.performance.now.bind(globalThis.performance);
var StopWatch = class _StopWatch {
  static create(highResolution) {
    return new _StopWatch(highResolution);
  }
  constructor(highResolution) {
    this._now = highResolution === false ? Date.now : performanceNow;
    this._startTime = this._now();
    this._stopTime = -1;
  }
  stop() {
    this._stopTime = this._now();
  }
  reset() {
    this._startTime = this._now();
    this._stopTime = -1;
  }
  elapsed() {
    if (this._stopTime !== -1) {
      return this._stopTime - this._startTime;
    }
    return this._now() - this._startTime;
  }
};

// src/platform/tokenizer/node/parseTikTokens.ts
var import_fs = require("fs");

// src/util/vs/base/common/lazy.ts
var Lazy = class {
  constructor(executor) {
    this.executor = executor;
    this._state = 0 /* Uninitialized */;
  }
  /**
   * True if the lazy value has been resolved.
   */
  get hasValue() {
    return this._state === 2 /* Completed */;
  }
  /**
   * Get the wrapped value.
   *
   * This will force evaluation of the lazy value if it has not been resolved yet. Lazy values are only
   * resolved once. `getValue` will re-throw exceptions that are hit while resolving the value
   */
  get value() {
    if (this._state === 0 /* Uninitialized */) {
      this._state = 1 /* Running */;
      try {
        this._value = this.executor();
      } catch (err) {
        this._error = err;
      } finally {
        this._state = 2 /* Completed */;
      }
    } else if (this._state === 1 /* Running */) {
      throw new Error("Cannot read the value of a lazy that is being initialized");
    }
    if (this._error) {
      throw this._error;
    }
    return this._value;
  }
  /**
   * Get the wrapped value without forcing evaluation.
   */
  get rawValue() {
    return this._value;
  }
};

// src/util/vs/base/common/arraysFind.ts
function findLastIdxMonotonous(array, predicate, startIdx = 0, endIdxEx = array.length) {
  let i = startIdx;
  let j = endIdxEx;
  while (i < j) {
    const k = Math.floor((i + j) / 2);
    if (predicate(array[k])) {
      i = k + 1;
    } else {
      j = k;
    }
  }
  return i - 1;
}
var MonotonousArray = class _MonotonousArray {
  constructor(_array) {
    this._array = _array;
    this._findLastMonotonousLastIdx = 0;
  }
  static {
    this.assertInvariants = false;
  }
  /**
   * The predicate must be monotonous, i.e. `arr.map(predicate)` must be like `[true, ..., true, false, ..., false]`!
   * For subsequent calls, current predicate must be weaker than (or equal to) the previous predicate, i.e. more entries must be `true`.
   */
  findLastMonotonous(predicate) {
    if (_MonotonousArray.assertInvariants) {
      if (this._prevFindLastPredicate) {
        for (const item of this._array) {
          if (this._prevFindLastPredicate(item) && !predicate(item)) {
            throw new Error("MonotonousArray: current predicate must be weaker than (or equal to) the previous predicate.");
          }
        }
      }
      this._prevFindLastPredicate = predicate;
    }
    const idx = findLastIdxMonotonous(this._array, predicate, this._findLastMonotonousLastIdx);
    this._findLastMonotonousLastIdx = idx + 1;
    return idx === -1 ? void 0 : this._array[idx];
  }
};

// src/util/vs/base/common/arrays.ts
var CompareResult;
((CompareResult2) => {
  function isLessThan(result) {
    return result < 0;
  }
  CompareResult2.isLessThan = isLessThan;
  function isLessThanOrEqual(result) {
    return result <= 0;
  }
  CompareResult2.isLessThanOrEqual = isLessThanOrEqual;
  function isGreaterThan(result) {
    return result > 0;
  }
  CompareResult2.isGreaterThan = isGreaterThan;
  function isNeitherLessOrGreaterThan(result) {
    return result === 0;
  }
  CompareResult2.isNeitherLessOrGreaterThan = isNeitherLessOrGreaterThan;
  CompareResult2.greaterThan = 1;
  CompareResult2.lessThan = -1;
  CompareResult2.neitherLessOrGreaterThan = 0;
})(CompareResult || (CompareResult = {}));
function compareBy(selector, comparator) {
  return (a, b) => comparator(selector(a), selector(b));
}
var numberComparator = (a, b) => a - b;
var CallbackIterable = class _CallbackIterable {
  constructor(iterate) {
    this.iterate = iterate;
  }
  static {
    this.empty = new _CallbackIterable((_callback) => {
    });
  }
  forEach(handler) {
    this.iterate((item) => {
      handler(item);
      return true;
    });
  }
  toArray() {
    const result = [];
    this.iterate((item) => {
      result.push(item);
      return true;
    });
    return result;
  }
  filter(predicate) {
    return new _CallbackIterable((cb) => this.iterate((item) => predicate(item) ? cb(item) : true));
  }
  map(mapFn) {
    return new _CallbackIterable((cb) => this.iterate((item) => cb(mapFn(item))));
  }
  some(predicate) {
    let result = false;
    this.iterate((item) => {
      result = predicate(item);
      return !result;
    });
    return result;
  }
  findFirst(predicate) {
    let result;
    this.iterate((item) => {
      if (predicate(item)) {
        result = item;
        return false;
      }
      return true;
    });
    return result;
  }
  findLast(predicate) {
    let result;
    this.iterate((item) => {
      if (predicate(item)) {
        result = item;
      }
      return true;
    });
    return result;
  }
  findLastMaxBy(comparator) {
    let result;
    let first = true;
    this.iterate((item) => {
      if (first || CompareResult.isGreaterThan(comparator(item, result))) {
        first = false;
        result = item;
      }
      return true;
    });
    return result;
  }
};

// src/util/vs/base/common/collections.ts
function groupBy(data, groupFn) {
  const result = /* @__PURE__ */ Object.create(null);
  for (const element of data) {
    const key = groupFn(element);
    let target = result[key];
    if (!target) {
      target = result[key] = [];
    }
    target.push(element);
  }
  return result;
}
var _a, _b;
var SetWithKey = class {
  constructor(values, toKey) {
    this.toKey = toKey;
    this._map = /* @__PURE__ */ new Map();
    this[_a] = "SetWithKey";
    for (const value of values) {
      this.add(value);
    }
  }
  get size() {
    return this._map.size;
  }
  add(value) {
    const key = this.toKey(value);
    this._map.set(key, value);
    return this;
  }
  delete(value) {
    return this._map.delete(this.toKey(value));
  }
  has(value) {
    return this._map.has(this.toKey(value));
  }
  *entries() {
    for (const entry of this._map.values()) {
      yield [entry, entry];
    }
  }
  keys() {
    return this.values();
  }
  *values() {
    for (const entry of this._map.values()) {
      yield entry;
    }
  }
  clear() {
    this._map.clear();
  }
  forEach(callbackfn, thisArg) {
    this._map.forEach((entry) => callbackfn.call(thisArg, entry, entry, this));
  }
  [(_b = Symbol.iterator, _a = Symbol.toStringTag, _b)]() {
    return this.values();
  }
};

// src/util/vs/base/common/map.ts
var ResourceMapEntry = class {
  constructor(uri, value) {
    this.uri = uri;
    this.value = value;
  }
};
function isEntries(arg) {
  return Array.isArray(arg);
}
var _a2;
var ResourceMap = class _ResourceMap {
  constructor(arg, toKey) {
    this[_a2] = "ResourceMap";
    if (arg instanceof _ResourceMap) {
      this.map = new Map(arg.map);
      this.toKey = toKey ?? _ResourceMap.defaultToKey;
    } else if (isEntries(arg)) {
      this.map = /* @__PURE__ */ new Map();
      this.toKey = toKey ?? _ResourceMap.defaultToKey;
      for (const [resource, value] of arg) {
        this.set(resource, value);
      }
    } else {
      this.map = /* @__PURE__ */ new Map();
      this.toKey = arg ?? _ResourceMap.defaultToKey;
    }
  }
  static {
    this.defaultToKey = (resource) => resource.toString();
  }
  set(resource, value) {
    this.map.set(this.toKey(resource), new ResourceMapEntry(resource, value));
    return this;
  }
  get(resource) {
    return this.map.get(this.toKey(resource))?.value;
  }
  has(resource) {
    return this.map.has(this.toKey(resource));
  }
  get size() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  delete(resource) {
    return this.map.delete(this.toKey(resource));
  }
  forEach(clb, thisArg) {
    if (typeof thisArg !== "undefined") {
      clb = clb.bind(thisArg);
    }
    for (const [_, entry] of this.map) {
      clb(entry.value, entry.uri, this);
    }
  }
  *values() {
    for (const entry of this.map.values()) {
      yield entry.value;
    }
  }
  *keys() {
    for (const entry of this.map.values()) {
      yield entry.uri;
    }
  }
  *entries() {
    for (const entry of this.map.values()) {
      yield [entry.uri, entry.value];
    }
  }
  *[(_a2 = Symbol.toStringTag, Symbol.iterator)]() {
    for (const [, entry] of this.map) {
      yield [entry.uri, entry.value];
    }
  }
};
var _a3;
var ResourceSet = class {
  constructor(entriesOrKey, toKey) {
    this[_a3] = "ResourceSet";
    if (!entriesOrKey || typeof entriesOrKey === "function") {
      this._map = new ResourceMap(entriesOrKey);
    } else {
      this._map = new ResourceMap(toKey);
      entriesOrKey.forEach(this.add, this);
    }
  }
  get size() {
    return this._map.size;
  }
  add(value) {
    this._map.set(value, value);
    return this;
  }
  clear() {
    this._map.clear();
  }
  delete(value) {
    return this._map.delete(value);
  }
  forEach(callbackfn, thisArg) {
    this._map.forEach((_value, key) => callbackfn.call(thisArg, key, key, this));
  }
  has(value) {
    return this._map.has(value);
  }
  entries() {
    return this._map.entries();
  }
  keys() {
    return this._map.keys();
  }
  values() {
    return this._map.keys();
  }
  [(_a3 = Symbol.toStringTag, Symbol.iterator)]() {
    return this.keys();
  }
};
var _a4;
var LinkedMap = class {
  constructor() {
    this[_a4] = "LinkedMap";
    this._map = /* @__PURE__ */ new Map();
    this._head = void 0;
    this._tail = void 0;
    this._size = 0;
    this._state = 0;
  }
  clear() {
    this._map.clear();
    this._head = void 0;
    this._tail = void 0;
    this._size = 0;
    this._state++;
  }
  isEmpty() {
    return !this._head && !this._tail;
  }
  get size() {
    return this._size;
  }
  get first() {
    return this._head?.value;
  }
  get last() {
    return this._tail?.value;
  }
  has(key) {
    return this._map.has(key);
  }
  get(key, touch = 0 /* None */) {
    const item = this._map.get(key);
    if (!item) {
      return void 0;
    }
    if (touch !== 0 /* None */) {
      this.touch(item, touch);
    }
    return item.value;
  }
  set(key, value, touch = 0 /* None */) {
    let item = this._map.get(key);
    if (item) {
      item.value = value;
      if (touch !== 0 /* None */) {
        this.touch(item, touch);
      }
    } else {
      item = { key, value, next: void 0, previous: void 0 };
      switch (touch) {
        case 0 /* None */:
          this.addItemLast(item);
          break;
        case 1 /* AsOld */:
          this.addItemFirst(item);
          break;
        case 2 /* AsNew */:
          this.addItemLast(item);
          break;
        default:
          this.addItemLast(item);
          break;
      }
      this._map.set(key, item);
      this._size++;
    }
    return this;
  }
  delete(key) {
    return !!this.remove(key);
  }
  remove(key) {
    const item = this._map.get(key);
    if (!item) {
      return void 0;
    }
    this._map.delete(key);
    this.removeItem(item);
    this._size--;
    return item.value;
  }
  shift() {
    if (!this._head && !this._tail) {
      return void 0;
    }
    if (!this._head || !this._tail) {
      throw new Error("Invalid list");
    }
    const item = this._head;
    this._map.delete(item.key);
    this.removeItem(item);
    this._size--;
    return item.value;
  }
  forEach(callbackfn, thisArg) {
    const state = this._state;
    let current = this._head;
    while (current) {
      if (thisArg) {
        callbackfn.bind(thisArg)(current.value, current.key, this);
      } else {
        callbackfn(current.value, current.key, this);
      }
      if (this._state !== state) {
        throw new Error(`LinkedMap got modified during iteration.`);
      }
      current = current.next;
    }
  }
  keys() {
    const map = this;
    const state = this._state;
    let current = this._head;
    const iterator = {
      [Symbol.iterator]() {
        return iterator;
      },
      next() {
        if (map._state !== state) {
          throw new Error(`LinkedMap got modified during iteration.`);
        }
        if (current) {
          const result = { value: current.key, done: false };
          current = current.next;
          return result;
        } else {
          return { value: void 0, done: true };
        }
      }
    };
    return iterator;
  }
  values() {
    const map = this;
    const state = this._state;
    let current = this._head;
    const iterator = {
      [Symbol.iterator]() {
        return iterator;
      },
      next() {
        if (map._state !== state) {
          throw new Error(`LinkedMap got modified during iteration.`);
        }
        if (current) {
          const result = { value: current.value, done: false };
          current = current.next;
          return result;
        } else {
          return { value: void 0, done: true };
        }
      }
    };
    return iterator;
  }
  entries() {
    const map = this;
    const state = this._state;
    let current = this._head;
    const iterator = {
      [Symbol.iterator]() {
        return iterator;
      },
      next() {
        if (map._state !== state) {
          throw new Error(`LinkedMap got modified during iteration.`);
        }
        if (current) {
          const result = { value: [current.key, current.value], done: false };
          current = current.next;
          return result;
        } else {
          return { value: void 0, done: true };
        }
      }
    };
    return iterator;
  }
  [(_a4 = Symbol.toStringTag, Symbol.iterator)]() {
    return this.entries();
  }
  trimOld(newSize) {
    if (newSize >= this.size) {
      return;
    }
    if (newSize === 0) {
      this.clear();
      return;
    }
    let current = this._head;
    let currentSize = this.size;
    while (current && currentSize > newSize) {
      this._map.delete(current.key);
      current = current.next;
      currentSize--;
    }
    this._head = current;
    this._size = currentSize;
    if (current) {
      current.previous = void 0;
    }
    this._state++;
  }
  trimNew(newSize) {
    if (newSize >= this.size) {
      return;
    }
    if (newSize === 0) {
      this.clear();
      return;
    }
    let current = this._tail;
    let currentSize = this.size;
    while (current && currentSize > newSize) {
      this._map.delete(current.key);
      current = current.previous;
      currentSize--;
    }
    this._tail = current;
    this._size = currentSize;
    if (current) {
      current.next = void 0;
    }
    this._state++;
  }
  addItemFirst(item) {
    if (!this._head && !this._tail) {
      this._tail = item;
    } else if (!this._head) {
      throw new Error("Invalid list");
    } else {
      item.next = this._head;
      this._head.previous = item;
    }
    this._head = item;
    this._state++;
  }
  addItemLast(item) {
    if (!this._head && !this._tail) {
      this._head = item;
    } else if (!this._tail) {
      throw new Error("Invalid list");
    } else {
      item.previous = this._tail;
      this._tail.next = item;
    }
    this._tail = item;
    this._state++;
  }
  removeItem(item) {
    if (item === this._head && item === this._tail) {
      this._head = void 0;
      this._tail = void 0;
    } else if (item === this._head) {
      if (!item.next) {
        throw new Error("Invalid list");
      }
      item.next.previous = void 0;
      this._head = item.next;
    } else if (item === this._tail) {
      if (!item.previous) {
        throw new Error("Invalid list");
      }
      item.previous.next = void 0;
      this._tail = item.previous;
    } else {
      const next = item.next;
      const previous = item.previous;
      if (!next || !previous) {
        throw new Error("Invalid list");
      }
      next.previous = previous;
      previous.next = next;
    }
    item.next = void 0;
    item.previous = void 0;
    this._state++;
  }
  touch(item, touch) {
    if (!this._head || !this._tail) {
      throw new Error("Invalid list");
    }
    if (touch !== 1 /* AsOld */ && touch !== 2 /* AsNew */) {
      return;
    }
    if (touch === 1 /* AsOld */) {
      if (item === this._head) {
        return;
      }
      const next = item.next;
      const previous = item.previous;
      if (item === this._tail) {
        previous.next = void 0;
        this._tail = previous;
      } else {
        next.previous = previous;
        previous.next = next;
      }
      item.previous = void 0;
      item.next = this._head;
      this._head.previous = item;
      this._head = item;
      this._state++;
    } else if (touch === 2 /* AsNew */) {
      if (item === this._tail) {
        return;
      }
      const next = item.next;
      const previous = item.previous;
      if (item === this._head) {
        next.previous = void 0;
        this._head = next;
      } else {
        next.previous = previous;
        previous.next = next;
      }
      item.next = void 0;
      item.previous = this._tail;
      this._tail.next = item;
      this._tail = item;
      this._state++;
    }
  }
  toJSON() {
    const data = [];
    this.forEach((value, key) => {
      data.push([key, value]);
    });
    return data;
  }
  fromJSON(data) {
    this.clear();
    for (const [key, value] of data) {
      this.set(key, value);
    }
  }
};
var SetMap = class {
  constructor() {
    this.map = /* @__PURE__ */ new Map();
  }
  add(key, value) {
    let values = this.map.get(key);
    if (!values) {
      values = /* @__PURE__ */ new Set();
      this.map.set(key, values);
    }
    values.add(value);
  }
  delete(key, value) {
    const values = this.map.get(key);
    if (!values) {
      return;
    }
    values.delete(value);
    if (values.size === 0) {
      this.map.delete(key);
    }
  }
  forEach(key, fn) {
    const values = this.map.get(key);
    if (!values) {
      return;
    }
    values.forEach(fn);
  }
  get(key) {
    const values = this.map.get(key);
    if (!values) {
      return /* @__PURE__ */ new Set();
    }
    return values;
  }
};

// src/util/vs/base/common/types.ts
function isIterable(obj) {
  return !!obj && typeof obj[Symbol.iterator] === "function";
}

// src/util/vs/base/common/iterator.ts
var Iterable;
((Iterable2) => {
  function is(thing) {
    return !!thing && typeof thing === "object" && typeof thing[Symbol.iterator] === "function";
  }
  Iterable2.is = is;
  const _empty = Object.freeze([]);
  function empty() {
    return _empty;
  }
  Iterable2.empty = empty;
  function* single(element) {
    yield element;
  }
  Iterable2.single = single;
  function wrap(iterableOrElement) {
    if (is(iterableOrElement)) {
      return iterableOrElement;
    } else {
      return single(iterableOrElement);
    }
  }
  Iterable2.wrap = wrap;
  function from(iterable) {
    return iterable ?? _empty;
  }
  Iterable2.from = from;
  function* reverse(array) {
    for (let i = array.length - 1; i >= 0; i--) {
      yield array[i];
    }
  }
  Iterable2.reverse = reverse;
  function isEmpty(iterable) {
    return !iterable || iterable[Symbol.iterator]().next().done === true;
  }
  Iterable2.isEmpty = isEmpty;
  function first(iterable) {
    return iterable[Symbol.iterator]().next().value;
  }
  Iterable2.first = first;
  function some(iterable, predicate) {
    let i = 0;
    for (const element of iterable) {
      if (predicate(element, i++)) {
        return true;
      }
    }
    return false;
  }
  Iterable2.some = some;
  function every(iterable, predicate) {
    let i = 0;
    for (const element of iterable) {
      if (!predicate(element, i++)) {
        return false;
      }
    }
    return true;
  }
  Iterable2.every = every;
  function find(iterable, predicate) {
    for (const element of iterable) {
      if (predicate(element)) {
        return element;
      }
    }
    return void 0;
  }
  Iterable2.find = find;
  function* filter(iterable, predicate) {
    for (const element of iterable) {
      if (predicate(element)) {
        yield element;
      }
    }
  }
  Iterable2.filter = filter;
  function* map(iterable, fn) {
    let index = 0;
    for (const element of iterable) {
      yield fn(element, index++);
    }
  }
  Iterable2.map = map;
  function* flatMap(iterable, fn) {
    let index = 0;
    for (const element of iterable) {
      yield* fn(element, index++);
    }
  }
  Iterable2.flatMap = flatMap;
  function* concat(...iterables) {
    for (const item of iterables) {
      if (isIterable(item)) {
        yield* item;
      } else {
        yield item;
      }
    }
  }
  Iterable2.concat = concat;
  function reduce(iterable, reducer, initialValue) {
    let value = initialValue;
    for (const element of iterable) {
      value = reducer(value, element);
    }
    return value;
  }
  Iterable2.reduce = reduce;
  function length(iterable) {
    let count = 0;
    for (const _ of iterable) {
      count++;
    }
    return count;
  }
  Iterable2.length = length;
  function* slice(arr, from2, to = arr.length) {
    if (from2 < -arr.length) {
      from2 = 0;
    }
    if (from2 < 0) {
      from2 += arr.length;
    }
    if (to < 0) {
      to += arr.length;
    } else if (to > arr.length) {
      to = arr.length;
    }
    for (; from2 < to; from2++) {
      yield arr[from2];
    }
  }
  Iterable2.slice = slice;
  function consume(iterable, atMost = Number.POSITIVE_INFINITY) {
    const consumed = [];
    if (atMost === 0) {
      return [consumed, iterable];
    }
    const iterator = iterable[Symbol.iterator]();
    for (let i = 0; i < atMost; i++) {
      const next = iterator.next();
      if (next.done) {
        return [consumed, Iterable2.empty()];
      }
      consumed.push(next.value);
    }
    return [consumed, { [Symbol.iterator]() {
      return iterator;
    } }];
  }
  Iterable2.consume = consume;
  async function asyncToArray(iterable) {
    const result = [];
    for await (const item of iterable) {
      result.push(item);
    }
    return result;
  }
  Iterable2.asyncToArray = asyncToArray;
  async function asyncToArrayFlat(iterable) {
    let result = [];
    for await (const item of iterable) {
      result = result.concat(item);
    }
    return result;
  }
  Iterable2.asyncToArrayFlat = asyncToArrayFlat;
})(Iterable || (Iterable = {}));

// src/util/vs/base/common/lifecycle.ts
var TRACK_DISPOSABLES = false;
var disposableTracker = null;
var DisposableTracker = class _DisposableTracker {
  constructor() {
    this.livingDisposables = /* @__PURE__ */ new Map();
  }
  static {
    this.idx = 0;
  }
  getDisposableData(d) {
    let val = this.livingDisposables.get(d);
    if (!val) {
      val = { parent: null, source: null, isSingleton: false, value: d, idx: _DisposableTracker.idx++ };
      this.livingDisposables.set(d, val);
    }
    return val;
  }
  trackDisposable(d) {
    const data = this.getDisposableData(d);
    if (!data.source) {
      data.source = new Error().stack;
    }
  }
  setParent(child, parent) {
    const data = this.getDisposableData(child);
    data.parent = parent;
  }
  markAsDisposed(x) {
    this.livingDisposables.delete(x);
  }
  markAsSingleton(disposable) {
    this.getDisposableData(disposable).isSingleton = true;
  }
  getRootParent(data, cache) {
    const cacheValue = cache.get(data);
    if (cacheValue) {
      return cacheValue;
    }
    const result = data.parent ? this.getRootParent(this.getDisposableData(data.parent), cache) : data;
    cache.set(data, result);
    return result;
  }
  getTrackedDisposables() {
    const rootParentCache = /* @__PURE__ */ new Map();
    const leaking = [...this.livingDisposables.entries()].filter(([, v]) => v.source !== null && !this.getRootParent(v, rootParentCache).isSingleton).flatMap(([k]) => k);
    return leaking;
  }
  computeLeakingDisposables(maxReported = 10, preComputedLeaks) {
    let uncoveredLeakingObjs;
    if (preComputedLeaks) {
      uncoveredLeakingObjs = preComputedLeaks;
    } else {
      const rootParentCache = /* @__PURE__ */ new Map();
      const leakingObjects = [...this.livingDisposables.values()].filter((info) => info.source !== null && !this.getRootParent(info, rootParentCache).isSingleton);
      if (leakingObjects.length === 0) {
        return;
      }
      const leakingObjsSet = new Set(leakingObjects.map((o) => o.value));
      uncoveredLeakingObjs = leakingObjects.filter((l) => {
        return !(l.parent && leakingObjsSet.has(l.parent));
      });
      if (uncoveredLeakingObjs.length === 0) {
        throw new Error("There are cyclic diposable chains!");
      }
    }
    if (!uncoveredLeakingObjs) {
      return void 0;
    }
    function getStackTracePath(leaking) {
      function removePrefix(array, linesToRemove) {
        while (array.length > 0 && linesToRemove.some((regexp) => typeof regexp === "string" ? regexp === array[0] : array[0].match(regexp))) {
          array.shift();
        }
      }
      const lines = leaking.source.split("\n").map((p) => p.trim().replace("at ", "")).filter((l) => l !== "");
      removePrefix(lines, ["Error", /^trackDisposable \(.*\)$/, /^DisposableTracker.trackDisposable \(.*\)$/]);
      return lines.reverse();
    }
    const stackTraceStarts = new SetMap();
    for (const leaking of uncoveredLeakingObjs) {
      const stackTracePath = getStackTracePath(leaking);
      for (let i2 = 0; i2 <= stackTracePath.length; i2++) {
        stackTraceStarts.add(stackTracePath.slice(0, i2).join("\n"), leaking);
      }
    }
    uncoveredLeakingObjs.sort(compareBy((l) => l.idx, numberComparator));
    let message = "";
    let i = 0;
    for (const leaking of uncoveredLeakingObjs.slice(0, maxReported)) {
      i++;
      const stackTracePath = getStackTracePath(leaking);
      const stackTraceFormattedLines = [];
      for (let i2 = 0; i2 < stackTracePath.length; i2++) {
        let line = stackTracePath[i2];
        const starts = stackTraceStarts.get(stackTracePath.slice(0, i2 + 1).join("\n"));
        line = `(shared with ${starts.size}/${uncoveredLeakingObjs.length} leaks) at ${line}`;
        const prevStarts = stackTraceStarts.get(stackTracePath.slice(0, i2).join("\n"));
        const continuations = groupBy([...prevStarts].map((d) => getStackTracePath(d)[i2]), (v) => v);
        delete continuations[stackTracePath[i2]];
        for (const [cont, set] of Object.entries(continuations)) {
          if (set) {
            stackTraceFormattedLines.unshift(`    - stacktraces of ${set.length} other leaks continue with ${cont}`);
          }
        }
        stackTraceFormattedLines.unshift(line);
      }
      message += `


==================== Leaking disposable ${i}/${uncoveredLeakingObjs.length}: ${leaking.value.constructor.name} ====================
${stackTraceFormattedLines.join("\n")}
============================================================

`;
    }
    if (uncoveredLeakingObjs.length > maxReported) {
      message += `


... and ${uncoveredLeakingObjs.length - maxReported} more leaking disposables

`;
    }
    return { leaks: uncoveredLeakingObjs, details: message };
  }
};
function setDisposableTracker(tracker) {
  disposableTracker = tracker;
}
if (TRACK_DISPOSABLES) {
  const __is_disposable_tracked__ = "__is_disposable_tracked__";
  setDisposableTracker(new class {
    trackDisposable(x) {
      const stack = new Error("Potentially leaked disposable").stack;
      setTimeout(() => {
        if (!x[__is_disposable_tracked__]) {
          console.log(stack);
        }
      }, 3e3);
    }
    setParent(child, parent) {
      if (child && child !== Disposable.None) {
        try {
          child[__is_disposable_tracked__] = true;
        } catch {
        }
      }
    }
    markAsDisposed(disposable) {
      if (disposable && disposable !== Disposable.None) {
        try {
          disposable[__is_disposable_tracked__] = true;
        } catch {
        }
      }
    }
    markAsSingleton(disposable) {
    }
  }());
}
function trackDisposable(x) {
  disposableTracker?.trackDisposable(x);
  return x;
}
function markAsDisposed(disposable) {
  disposableTracker?.markAsDisposed(disposable);
}
function setParentOfDisposable(child, parent) {
  disposableTracker?.setParent(child, parent);
}
function dispose(arg) {
  if (Iterable.is(arg)) {
    const errors = [];
    for (const d of arg) {
      if (d) {
        try {
          d.dispose();
        } catch (e) {
          errors.push(e);
        }
      }
    }
    if (errors.length === 1) {
      throw errors[0];
    } else if (errors.length > 1) {
      throw new AggregateError(errors, "Encountered errors while disposing of store");
    }
    return Array.isArray(arg) ? [] : arg;
  } else if (arg) {
    arg.dispose();
    return arg;
  }
}
var DisposableStore = class _DisposableStore {
  constructor() {
    this._toDispose = /* @__PURE__ */ new Set();
    this._isDisposed = false;
    trackDisposable(this);
  }
  static {
    this.DISABLE_DISPOSED_WARNING = false;
  }
  /**
   * Dispose of all registered disposables and mark this object as disposed.
   *
   * Any future disposables added to this object will be disposed of on `add`.
   */
  dispose() {
    if (this._isDisposed) {
      return;
    }
    markAsDisposed(this);
    this._isDisposed = true;
    this.clear();
  }
  /**
   * @return `true` if this object has been disposed of.
   */
  get isDisposed() {
    return this._isDisposed;
  }
  /**
   * Dispose of all registered disposables but do not mark this object as disposed.
   */
  clear() {
    if (this._toDispose.size === 0) {
      return;
    }
    try {
      dispose(this._toDispose);
    } finally {
      this._toDispose.clear();
    }
  }
  /**
   * Add a new {@link IDisposable disposable} to the collection.
   */
  add(o) {
    if (!o || o === Disposable.None) {
      return o;
    }
    if (o === this) {
      throw new Error("Cannot register a disposable on itself!");
    }
    setParentOfDisposable(o, this);
    if (this._isDisposed) {
      if (!_DisposableStore.DISABLE_DISPOSED_WARNING) {
        console.warn(new Error("Trying to add a disposable to a DisposableStore that has already been disposed of. The added object will be leaked!").stack);
      }
    } else {
      this._toDispose.add(o);
    }
    return o;
  }
  /**
   * Deletes a disposable from store and disposes of it. This will not throw or warn and proceed to dispose the
   * disposable even when the disposable is not part in the store.
   */
  delete(o) {
    if (!o) {
      return;
    }
    if (o === this) {
      throw new Error("Cannot dispose a disposable on itself!");
    }
    this._toDispose.delete(o);
    o.dispose();
  }
  /**
   * Deletes the value from the store, but does not dispose it.
   */
  deleteAndLeak(o) {
    if (!o) {
      return;
    }
    if (this._toDispose.delete(o)) {
      setParentOfDisposable(o, null);
    }
  }
  assertNotDisposed() {
    if (this._isDisposed) {
      onUnexpectedError(new BugIndicatingError("Object disposed"));
    }
  }
};
var Disposable = class {
  constructor() {
    this._store = new DisposableStore();
    trackDisposable(this);
    setParentOfDisposable(this._store, this);
  }
  static {
    /**
     * A disposable that does nothing when it is disposed of.
     *
     * TODO: This should not be a static property.
     */
    this.None = Object.freeze({ dispose() {
    } });
  }
  dispose() {
    markAsDisposed(this);
    this._store.dispose();
  }
  /**
   * Adds `o` to the collection of disposables managed by this object.
   */
  _register(o) {
    if (o === this) {
      throw new Error("Cannot register a disposable on itself!");
    }
    return this._store.add(o);
  }
};

// src/util/vs/base/common/buffer.ts
var hasBuffer = typeof Buffer !== "undefined";
var indexOfTable = new Lazy(() => new Uint8Array(256));
var textEncoder;
var textDecoder;
var VSBuffer = class _VSBuffer {
  /**
   * When running in a nodejs context, the backing store for the returned `VSBuffer` instance
   * might use a nodejs Buffer allocated from node's Buffer pool, which is not transferrable.
   */
  static alloc(byteLength) {
    if (hasBuffer) {
      return new _VSBuffer(Buffer.allocUnsafe(byteLength));
    } else {
      return new _VSBuffer(new Uint8Array(byteLength));
    }
  }
  /**
   * When running in a nodejs context, if `actual` is not a nodejs Buffer, the backing store for
   * the returned `VSBuffer` instance might use a nodejs Buffer allocated from node's Buffer pool,
   * which is not transferrable.
   */
  static wrap(actual) {
    if (hasBuffer && !Buffer.isBuffer(actual)) {
      actual = Buffer.from(actual.buffer, actual.byteOffset, actual.byteLength);
    }
    return new _VSBuffer(actual);
  }
  /**
   * When running in a nodejs context, the backing store for the returned `VSBuffer` instance
   * might use a nodejs Buffer allocated from node's Buffer pool, which is not transferrable.
   */
  static fromString(source, options) {
    const dontUseNodeBuffer = options?.dontUseNodeBuffer || false;
    if (!dontUseNodeBuffer && hasBuffer) {
      return new _VSBuffer(Buffer.from(source));
    } else {
      if (!textEncoder) {
        textEncoder = new TextEncoder();
      }
      return new _VSBuffer(textEncoder.encode(source));
    }
  }
  /**
   * When running in a nodejs context, the backing store for the returned `VSBuffer` instance
   * might use a nodejs Buffer allocated from node's Buffer pool, which is not transferrable.
   */
  static fromByteArray(source) {
    const result = _VSBuffer.alloc(source.length);
    for (let i = 0, len = source.length; i < len; i++) {
      result.buffer[i] = source[i];
    }
    return result;
  }
  /**
   * When running in a nodejs context, the backing store for the returned `VSBuffer` instance
   * might use a nodejs Buffer allocated from node's Buffer pool, which is not transferrable.
   */
  static concat(buffers, totalLength) {
    if (typeof totalLength === "undefined") {
      totalLength = 0;
      for (let i = 0, len = buffers.length; i < len; i++) {
        totalLength += buffers[i].byteLength;
      }
    }
    const ret = _VSBuffer.alloc(totalLength);
    let offset = 0;
    for (let i = 0, len = buffers.length; i < len; i++) {
      const element = buffers[i];
      ret.set(element, offset);
      offset += element.byteLength;
    }
    return ret;
  }
  static isNativeBuffer(buffer) {
    return hasBuffer && Buffer.isBuffer(buffer);
  }
  constructor(buffer) {
    this.buffer = buffer;
    this.byteLength = this.buffer.byteLength;
  }
  /**
   * When running in a nodejs context, the backing store for the returned `VSBuffer` instance
   * might use a nodejs Buffer allocated from node's Buffer pool, which is not transferrable.
   */
  clone() {
    const result = _VSBuffer.alloc(this.byteLength);
    result.set(this);
    return result;
  }
  toString() {
    if (hasBuffer) {
      return this.buffer.toString();
    } else {
      if (!textDecoder) {
        textDecoder = new TextDecoder(void 0, { ignoreBOM: true });
      }
      return textDecoder.decode(this.buffer);
    }
  }
  slice(start, end) {
    return new _VSBuffer(this.buffer.subarray(start, end));
  }
  set(array, offset) {
    if (array instanceof _VSBuffer) {
      this.buffer.set(array.buffer, offset);
    } else if (array instanceof Uint8Array) {
      this.buffer.set(array, offset);
    } else if (array instanceof ArrayBuffer) {
      this.buffer.set(new Uint8Array(array), offset);
    } else if (ArrayBuffer.isView(array)) {
      this.buffer.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), offset);
    } else {
      throw new Error(`Unknown argument 'array'`);
    }
  }
  readUInt32BE(offset) {
    return readUInt32BE(this.buffer, offset);
  }
  writeUInt32BE(value, offset) {
    writeUInt32BE(this.buffer, value, offset);
  }
  readUInt32LE(offset) {
    return readUInt32LE(this.buffer, offset);
  }
  writeUInt32LE(value, offset) {
    writeUInt32LE(this.buffer, value, offset);
  }
  readUInt8(offset) {
    return readUInt8(this.buffer, offset);
  }
  writeUInt8(value, offset) {
    writeUInt8(this.buffer, value, offset);
  }
  indexOf(subarray, offset = 0) {
    return binaryIndexOf(this.buffer, subarray instanceof _VSBuffer ? subarray.buffer : subarray, offset);
  }
  equals(other) {
    if (this === other) {
      return true;
    }
    if (this.byteLength !== other.byteLength) {
      return false;
    }
    return this.buffer.every((value, index) => value === other.buffer[index]);
  }
};
function binaryIndexOf(haystack, needle, offset = 0) {
  const needleLen = needle.byteLength;
  const haystackLen = haystack.byteLength;
  if (needleLen === 0) {
    return 0;
  }
  if (needleLen === 1) {
    return haystack.indexOf(needle[0], offset);
  }
  if (needleLen > haystackLen - offset) {
    return -1;
  }
  const table = indexOfTable.value;
  table.fill(needle.length);
  for (let i2 = 0; i2 < needle.length; i2++) {
    table[needle[i2]] = needle.length - i2 - 1;
  }
  let i = offset + needle.length - 1;
  let j = i;
  let result = -1;
  while (i < haystackLen) {
    if (haystack[i] === needle[j]) {
      if (j === 0) {
        result = i;
        break;
      }
      i--;
      j--;
    } else {
      i += Math.max(needle.length - j, table[haystack[i]]);
      j = needle.length - 1;
    }
  }
  return result;
}
function readUInt32BE(source, offset) {
  return source[offset] * 2 ** 24 + source[offset + 1] * 2 ** 16 + source[offset + 2] * 2 ** 8 + source[offset + 3];
}
function writeUInt32BE(destination, value, offset) {
  destination[offset + 3] = value;
  value = value >>> 8;
  destination[offset + 2] = value;
  value = value >>> 8;
  destination[offset + 1] = value;
  value = value >>> 8;
  destination[offset] = value;
}
function readUInt32LE(source, offset) {
  return source[offset + 0] << 0 >>> 0 | source[offset + 1] << 8 >>> 0 | source[offset + 2] << 16 >>> 0 | source[offset + 3] << 24 >>> 0;
}
function writeUInt32LE(destination, value, offset) {
  destination[offset + 0] = value & 255;
  value = value >>> 8;
  destination[offset + 1] = value & 255;
  value = value >>> 8;
  destination[offset + 2] = value & 255;
  value = value >>> 8;
  destination[offset + 3] = value & 255;
}
function readUInt8(source, offset) {
  return source[offset];
}
function writeUInt8(destination, value, offset) {
  destination[offset] = value;
}

// src/util/common/variableLengthQuantity.ts
function readVariableLengthQuantity(buffer, offset) {
  let result = 0;
  let consumed = 0;
  let byte;
  do {
    byte = buffer.readUInt8(offset + consumed);
    result |= (byte & 127) << consumed * 7;
    consumed++;
  } while (byte & 128);
  return { value: result, consumed };
}

// src/platform/tokenizer/node/parseTikTokens.ts
var parseTikTokenBinary = (file) => {
  const contents = (0, import_fs.readFileSync)(file);
  const result = /* @__PURE__ */ new Map();
  for (let i = 0; i < contents.length; ) {
    const termLength = readVariableLengthQuantity(VSBuffer.wrap(contents), i);
    i += termLength.consumed;
    result.set(contents.subarray(i, i + termLength.value), result.size);
    i += termLength.value;
  }
  return result;
};

// src/platform/tokenizer/node/tikTokenizerImpl.ts
var TikTokenImpl = class _TikTokenImpl {
  constructor() {
    this._values = [];
    this._stats = {
      encodeDuration: new MovingAverage(),
      textLength: new MovingAverage(),
      callCount: 0
    };
  }
  static get instance() {
    if (!this._instance) {
      this._instance = new _TikTokenImpl();
    }
    return this._instance;
  }
  init(tokenFilePath, encoderName, useBinaryTokens) {
    const handle = this._values.length;
    const parser = useBinaryTokens ? parseTikTokenBinary : (f) => f;
    this._values.push((0, import_tiktokenizer.createTokenizer)(
      parser(tokenFilePath),
      (0, import_tiktokenizer.getSpecialTokensByEncoder)(encoderName),
      (0, import_tiktokenizer.getRegexByEncoder)(encoderName),
      64e3
    ));
    return handle;
  }
  encode(handle, text, allowedSpecial) {
    const sw = StopWatch.create(true);
    const result = this._values[handle].encode(text, allowedSpecial);
    this._stats.callCount += 1;
    this._stats.encodeDuration.update(sw.elapsed());
    this._stats.textLength.update(text.length);
    return result;
  }
  destroy(handle) {
    this._values[handle] = void 0;
  }
  resetStats() {
    const oldValue = this._stats;
    const result = {
      callCount: oldValue.callCount,
      encodeDuration: oldValue.encodeDuration.value,
      textLength: oldValue.textLength.value
    };
    this._stats.encodeDuration = new MovingAverage();
    this._stats.textLength = new MovingAverage();
    this._stats.callCount = 0;
    return result;
  }
};

// src/platform/tokenizer/node/tikTokenizerWorker.ts
function main() {
  const port = import_worker_threads.parentPort;
  if (!port) {
    throw new Error(`This module should only be used in a worker thread.`);
  }
  port.on("message", async (message) => {
    try {
      const res = await TikTokenImpl.instance[message.fn](...message.args);
      port.postMessage({ id: message.id, res });
    } catch (err) {
      port.postMessage({ id: message.id, err });
    }
  });
}
main();
//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'
//# sourceMappingURL=tikTokenizerWorker.js.map
