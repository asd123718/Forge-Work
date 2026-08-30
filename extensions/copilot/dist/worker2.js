"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};

// node_modules/web-tree-sitter/tree-sitter.js
var require_tree_sitter = __commonJS({
  "node_modules/web-tree-sitter/tree-sitter.js"(exports, module) {
    var Module = typeof Module != "undefined" ? Module : {};
    var ENVIRONMENT_IS_WEB = typeof window == "object";
    var ENVIRONMENT_IS_WORKER = typeof importScripts == "function";
    var ENVIRONMENT_IS_NODE = typeof process == "object" && typeof process.versions == "object" && typeof process.versions.node == "string";
    if (ENVIRONMENT_IS_NODE) {
    }
    var TreeSitter = (function() {
      var initPromise;
      var document = typeof window == "object" ? {
        currentScript: window.document.currentScript
      } : null;
      class Parser {
        constructor() {
          this.initialize();
        }
        initialize() {
          throw new Error("cannot construct a Parser before calling `init()`");
        }
        static init(moduleOptions) {
          if (initPromise) return initPromise;
          Module = Object.assign({}, Module, moduleOptions);
          return initPromise = new Promise((resolveInitPromise) => {
            var moduleOverrides = Object.assign({}, Module);
            var arguments_ = [];
            var thisProgram = "./this.program";
            var quit_ = (status, toThrow) => {
              throw toThrow;
            };
            var scriptDirectory = "";
            function locateFile(path) {
              if (Module["locateFile"]) {
                return Module["locateFile"](path, scriptDirectory);
              }
              return scriptDirectory + path;
            }
            var readAsync, readBinary;
            if (ENVIRONMENT_IS_NODE) {
              var fs = require("fs");
              var nodePath = require("path");
              scriptDirectory = __dirname + "/";
              readBinary = (filename) => {
                filename = isFileURI(filename) ? new URL(filename) : nodePath.normalize(filename);
                var ret = fs.readFileSync(filename);
                return ret;
              };
              readAsync = (filename, binary2 = true) => {
                filename = isFileURI(filename) ? new URL(filename) : nodePath.normalize(filename);
                return new Promise((resolve2, reject) => {
                  fs.readFile(filename, binary2 ? void 0 : "utf8", (err2, data) => {
                    if (err2) reject(err2);
                    else resolve2(binary2 ? data.buffer : data);
                  });
                });
              };
              if (!Module["thisProgram"] && process.argv.length > 1) {
                thisProgram = process.argv[1].replace(/\\/g, "/");
              }
              arguments_ = process.argv.slice(2);
              if (typeof module != "undefined") {
                module["exports"] = Module;
              }
              quit_ = (status, toThrow) => {
                process.exitCode = status;
                throw toThrow;
              };
            } else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
              if (ENVIRONMENT_IS_WORKER) {
                scriptDirectory = self.location.href;
              } else if (typeof document != "undefined" && document.currentScript) {
                scriptDirectory = document.currentScript.src;
              }
              if (scriptDirectory.startsWith("blob:")) {
                scriptDirectory = "";
              } else {
                scriptDirectory = scriptDirectory.substr(0, scriptDirectory.replace(/[?#].*/, "").lastIndexOf("/") + 1);
              }
              {
                if (ENVIRONMENT_IS_WORKER) {
                  readBinary = (url) => {
                    var xhr = new XMLHttpRequest();
                    xhr.open("GET", url, false);
                    xhr.responseType = "arraybuffer";
                    xhr.send(null);
                    return new Uint8Array(
                      /** @type{!ArrayBuffer} */
                      xhr.response
                    );
                  };
                }
                readAsync = (url) => {
                  if (isFileURI(url)) {
                    return new Promise((reject, resolve2) => {
                      var xhr = new XMLHttpRequest();
                      xhr.open("GET", url, true);
                      xhr.responseType = "arraybuffer";
                      xhr.onload = () => {
                        if (xhr.status == 200 || xhr.status == 0 && xhr.response) {
                          resolve2(xhr.response);
                        }
                        reject(xhr.status);
                      };
                      xhr.onerror = reject;
                      xhr.send(null);
                    });
                  }
                  return fetch(url, {
                    credentials: "same-origin"
                  }).then((response) => {
                    if (response.ok) {
                      return response.arrayBuffer();
                    }
                    return Promise.reject(new Error(response.status + " : " + response.url));
                  });
                };
              }
            } else {
            }
            var out = Module["print"] || console.log.bind(console);
            var err = Module["printErr"] || console.error.bind(console);
            Object.assign(Module, moduleOverrides);
            moduleOverrides = null;
            if (Module["arguments"]) arguments_ = Module["arguments"];
            if (Module["thisProgram"]) thisProgram = Module["thisProgram"];
            if (Module["quit"]) quit_ = Module["quit"];
            var dynamicLibraries = Module["dynamicLibraries"] || [];
            var wasmBinary;
            if (Module["wasmBinary"]) wasmBinary = Module["wasmBinary"];
            var wasmMemory;
            var ABORT = false;
            var EXITSTATUS;
            var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
            var HEAP_DATA_VIEW;
            function updateMemoryViews() {
              var b = wasmMemory.buffer;
              Module["HEAP_DATA_VIEW"] = HEAP_DATA_VIEW = new DataView(b);
              Module["HEAP8"] = HEAP8 = new Int8Array(b);
              Module["HEAP16"] = HEAP16 = new Int16Array(b);
              Module["HEAPU8"] = HEAPU8 = new Uint8Array(b);
              Module["HEAPU16"] = HEAPU16 = new Uint16Array(b);
              Module["HEAP32"] = HEAP32 = new Int32Array(b);
              Module["HEAPU32"] = HEAPU32 = new Uint32Array(b);
              Module["HEAPF32"] = HEAPF32 = new Float32Array(b);
              Module["HEAPF64"] = HEAPF64 = new Float64Array(b);
            }
            if (Module["wasmMemory"]) {
              wasmMemory = Module["wasmMemory"];
            } else {
              var INITIAL_MEMORY = Module["INITIAL_MEMORY"] || 33554432;
              wasmMemory = new WebAssembly.Memory({
                "initial": INITIAL_MEMORY / 65536,
                // In theory we should not need to emit the maximum if we want "unlimited"
                // or 4GB of memory, but VMs error on that atm, see
                // https://github.com/emscripten-core/emscripten/issues/14130
                // And in the pthreads case we definitely need to emit a maximum. So
                // always emit one.
                "maximum": 2147483648 / 65536
              });
            }
            updateMemoryViews();
            var __ATPRERUN__ = [];
            var __ATINIT__ = [];
            var __ATMAIN__ = [];
            var __ATPOSTRUN__ = [];
            var __RELOC_FUNCS__ = [];
            var runtimeInitialized = false;
            function preRun() {
              if (Module["preRun"]) {
                if (typeof Module["preRun"] == "function") Module["preRun"] = [Module["preRun"]];
                while (Module["preRun"].length) {
                  addOnPreRun(Module["preRun"].shift());
                }
              }
              callRuntimeCallbacks(__ATPRERUN__);
            }
            function initRuntime() {
              runtimeInitialized = true;
              callRuntimeCallbacks(__RELOC_FUNCS__);
              callRuntimeCallbacks(__ATINIT__);
            }
            function preMain() {
              callRuntimeCallbacks(__ATMAIN__);
            }
            function postRun() {
              if (Module["postRun"]) {
                if (typeof Module["postRun"] == "function") Module["postRun"] = [Module["postRun"]];
                while (Module["postRun"].length) {
                  addOnPostRun(Module["postRun"].shift());
                }
              }
              callRuntimeCallbacks(__ATPOSTRUN__);
            }
            function addOnPreRun(cb) {
              __ATPRERUN__.unshift(cb);
            }
            function addOnInit(cb) {
              __ATINIT__.unshift(cb);
            }
            function addOnPostRun(cb) {
              __ATPOSTRUN__.unshift(cb);
            }
            var runDependencies = 0;
            var runDependencyWatcher = null;
            var dependenciesFulfilled = null;
            function getUniqueRunDependency(id) {
              return id;
            }
            function addRunDependency(id) {
              runDependencies++;
              Module["monitorRunDependencies"]?.(runDependencies);
            }
            function removeRunDependency(id) {
              runDependencies--;
              Module["monitorRunDependencies"]?.(runDependencies);
              if (runDependencies == 0) {
                if (runDependencyWatcher !== null) {
                  clearInterval(runDependencyWatcher);
                  runDependencyWatcher = null;
                }
                if (dependenciesFulfilled) {
                  var callback = dependenciesFulfilled;
                  dependenciesFulfilled = null;
                  callback();
                }
              }
            }
            function abort(what) {
              Module["onAbort"]?.(what);
              what = "Aborted(" + what + ")";
              err(what);
              ABORT = true;
              EXITSTATUS = 1;
              what += ". Build with -sASSERTIONS for more info.";
              var e = new WebAssembly.RuntimeError(what);
              throw e;
            }
            var dataURIPrefix = "data:application/octet-stream;base64,";
            var isDataURI = (filename) => filename.startsWith(dataURIPrefix);
            var isFileURI = (filename) => filename.startsWith("file://");
            function findWasmBinary() {
              var f = "tree-sitter.wasm";
              if (!isDataURI(f)) {
                return locateFile(f);
              }
              return f;
            }
            var wasmBinaryFile;
            function getBinarySync(file) {
              if (file == wasmBinaryFile && wasmBinary) {
                return new Uint8Array(wasmBinary);
              }
              if (readBinary) {
                return readBinary(file);
              }
              throw "both async and sync fetching of the wasm failed";
            }
            function getBinaryPromise(binaryFile) {
              if (!wasmBinary) {
                return readAsync(binaryFile).then(
                  (response) => new Uint8Array(
                    /** @type{!ArrayBuffer} */
                    response
                  ),
                  // Fall back to getBinarySync if readAsync fails
                  () => getBinarySync(binaryFile)
                );
              }
              return Promise.resolve().then(() => getBinarySync(binaryFile));
            }
            function instantiateArrayBuffer(binaryFile, imports, receiver) {
              return getBinaryPromise(binaryFile).then((binary2) => WebAssembly.instantiate(binary2, imports)).then(receiver, (reason) => {
                err(`failed to asynchronously prepare wasm: ${reason}`);
                abort(reason);
              });
            }
            function instantiateAsync(binary2, binaryFile, imports, callback) {
              if (!binary2 && typeof WebAssembly.instantiateStreaming == "function" && !isDataURI(binaryFile) && // Don't use streaming for file:// delivered objects in a webview, fetch them synchronously.
              !isFileURI(binaryFile) && // Avoid instantiateStreaming() on Node.js environment for now, as while
              // Node.js v18.1.0 implements it, it does not have a full fetch()
              // implementation yet.
              // Reference:
              //   https://github.com/emscripten-core/emscripten/pull/16917
              !ENVIRONMENT_IS_NODE && typeof fetch == "function") {
                return fetch(binaryFile, {
                  credentials: "same-origin"
                }).then((response) => {
                  var result = WebAssembly.instantiateStreaming(response, imports);
                  return result.then(callback, function(reason) {
                    err(`wasm streaming compile failed: ${reason}`);
                    err("falling back to ArrayBuffer instantiation");
                    return instantiateArrayBuffer(binaryFile, imports, callback);
                  });
                });
              }
              return instantiateArrayBuffer(binaryFile, imports, callback);
            }
            function getWasmImports() {
              return {
                "env": wasmImports,
                "wasi_snapshot_preview1": wasmImports,
                "GOT.mem": new Proxy(wasmImports, GOTHandler),
                "GOT.func": new Proxy(wasmImports, GOTHandler)
              };
            }
            function createWasm() {
              var info2 = getWasmImports();
              function receiveInstance(instance2, module2) {
                wasmExports = instance2.exports;
                wasmExports = relocateExports(wasmExports, 1024);
                var metadata2 = getDylinkMetadata(module2);
                if (metadata2.neededDynlibs) {
                  dynamicLibraries = metadata2.neededDynlibs.concat(dynamicLibraries);
                }
                mergeLibSymbols(wasmExports, "main");
                LDSO.init();
                loadDylibs();
                addOnInit(wasmExports["__wasm_call_ctors"]);
                __RELOC_FUNCS__.push(wasmExports["__wasm_apply_data_relocs"]);
                removeRunDependency("wasm-instantiate");
                return wasmExports;
              }
              addRunDependency("wasm-instantiate");
              function receiveInstantiationResult(result) {
                receiveInstance(result["instance"], result["module"]);
              }
              if (Module["instantiateWasm"]) {
                try {
                  return Module["instantiateWasm"](info2, receiveInstance);
                } catch (e) {
                  err(`Module.instantiateWasm callback failed with error: ${e}`);
                  return false;
                }
              }
              if (!wasmBinaryFile) wasmBinaryFile = findWasmBinary();
              instantiateAsync(wasmBinary, wasmBinaryFile, info2, receiveInstantiationResult);
              return {};
            }
            var ASM_CONSTS = {};
            function ExitStatus(status) {
              this.name = "ExitStatus";
              this.message = `Program terminated with exit(${status})`;
              this.status = status;
            }
            var GOT = {};
            var currentModuleWeakSymbols = /* @__PURE__ */ new Set([]);
            var GOTHandler = {
              get(obj, symName) {
                var rtn = GOT[symName];
                if (!rtn) {
                  rtn = GOT[symName] = new WebAssembly.Global({
                    "value": "i32",
                    "mutable": true
                  });
                }
                if (!currentModuleWeakSymbols.has(symName)) {
                  rtn.required = true;
                }
                return rtn;
              }
            };
            var LE_HEAP_LOAD_F32 = (byteOffset) => HEAP_DATA_VIEW.getFloat32(byteOffset, true);
            var LE_HEAP_LOAD_F64 = (byteOffset) => HEAP_DATA_VIEW.getFloat64(byteOffset, true);
            var LE_HEAP_LOAD_I16 = (byteOffset) => HEAP_DATA_VIEW.getInt16(byteOffset, true);
            var LE_HEAP_LOAD_I32 = (byteOffset) => HEAP_DATA_VIEW.getInt32(byteOffset, true);
            var LE_HEAP_LOAD_U32 = (byteOffset) => HEAP_DATA_VIEW.getUint32(byteOffset, true);
            var LE_HEAP_STORE_F32 = (byteOffset, value) => HEAP_DATA_VIEW.setFloat32(byteOffset, value, true);
            var LE_HEAP_STORE_F64 = (byteOffset, value) => HEAP_DATA_VIEW.setFloat64(byteOffset, value, true);
            var LE_HEAP_STORE_I16 = (byteOffset, value) => HEAP_DATA_VIEW.setInt16(byteOffset, value, true);
            var LE_HEAP_STORE_I32 = (byteOffset, value) => HEAP_DATA_VIEW.setInt32(byteOffset, value, true);
            var LE_HEAP_STORE_U32 = (byteOffset, value) => HEAP_DATA_VIEW.setUint32(byteOffset, value, true);
            var callRuntimeCallbacks = (callbacks) => {
              while (callbacks.length > 0) {
                callbacks.shift()(Module);
              }
            };
            var UTF8Decoder = typeof TextDecoder != "undefined" ? new TextDecoder() : void 0;
            var UTF8ArrayToString = (heapOrArray, idx, maxBytesToRead) => {
              var endIdx = idx + maxBytesToRead;
              var endPtr = idx;
              while (heapOrArray[endPtr] && !(endPtr >= endIdx)) ++endPtr;
              if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
                return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr));
              }
              var str = "";
              while (idx < endPtr) {
                var u0 = heapOrArray[idx++];
                if (!(u0 & 128)) {
                  str += String.fromCharCode(u0);
                  continue;
                }
                var u1 = heapOrArray[idx++] & 63;
                if ((u0 & 224) == 192) {
                  str += String.fromCharCode((u0 & 31) << 6 | u1);
                  continue;
                }
                var u2 = heapOrArray[idx++] & 63;
                if ((u0 & 240) == 224) {
                  u0 = (u0 & 15) << 12 | u1 << 6 | u2;
                } else {
                  u0 = (u0 & 7) << 18 | u1 << 12 | u2 << 6 | heapOrArray[idx++] & 63;
                }
                if (u0 < 65536) {
                  str += String.fromCharCode(u0);
                } else {
                  var ch = u0 - 65536;
                  str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023);
                }
              }
              return str;
            };
            var getDylinkMetadata = (binary2) => {
              var offset = 0;
              var end = 0;
              function getU8() {
                return binary2[offset++];
              }
              function getLEB() {
                var ret = 0;
                var mul = 1;
                while (1) {
                  var byte = binary2[offset++];
                  ret += (byte & 127) * mul;
                  mul *= 128;
                  if (!(byte & 128)) break;
                }
                return ret;
              }
              function getString() {
                var len = getLEB();
                offset += len;
                return UTF8ArrayToString(binary2, offset - len, len);
              }
              function failIf(condition, message) {
                if (condition) throw new Error(message);
              }
              var name2 = "dylink.0";
              if (binary2 instanceof WebAssembly.Module) {
                var dylinkSection = WebAssembly.Module.customSections(binary2, name2);
                if (dylinkSection.length === 0) {
                  name2 = "dylink";
                  dylinkSection = WebAssembly.Module.customSections(binary2, name2);
                }
                failIf(dylinkSection.length === 0, "need dylink section");
                binary2 = new Uint8Array(dylinkSection[0]);
                end = binary2.length;
              } else {
                var int32View = new Uint32Array(new Uint8Array(binary2.subarray(0, 24)).buffer);
                var magicNumberFound = int32View[0] == 1836278016 || int32View[0] == 6386541;
                failIf(!magicNumberFound, "need to see wasm magic number");
                failIf(binary2[8] !== 0, "need the dylink section to be first");
                offset = 9;
                var section_size = getLEB();
                end = offset + section_size;
                name2 = getString();
              }
              var customSection = {
                neededDynlibs: [],
                tlsExports: /* @__PURE__ */ new Set(),
                weakImports: /* @__PURE__ */ new Set()
              };
              if (name2 == "dylink") {
                customSection.memorySize = getLEB();
                customSection.memoryAlign = getLEB();
                customSection.tableSize = getLEB();
                customSection.tableAlign = getLEB();
                var neededDynlibsCount = getLEB();
                for (var i2 = 0; i2 < neededDynlibsCount; ++i2) {
                  var libname = getString();
                  customSection.neededDynlibs.push(libname);
                }
              } else {
                failIf(name2 !== "dylink.0");
                var WASM_DYLINK_MEM_INFO = 1;
                var WASM_DYLINK_NEEDED = 2;
                var WASM_DYLINK_EXPORT_INFO = 3;
                var WASM_DYLINK_IMPORT_INFO = 4;
                var WASM_SYMBOL_TLS = 256;
                var WASM_SYMBOL_BINDING_MASK = 3;
                var WASM_SYMBOL_BINDING_WEAK = 1;
                while (offset < end) {
                  var subsectionType = getU8();
                  var subsectionSize = getLEB();
                  if (subsectionType === WASM_DYLINK_MEM_INFO) {
                    customSection.memorySize = getLEB();
                    customSection.memoryAlign = getLEB();
                    customSection.tableSize = getLEB();
                    customSection.tableAlign = getLEB();
                  } else if (subsectionType === WASM_DYLINK_NEEDED) {
                    var neededDynlibsCount = getLEB();
                    for (var i2 = 0; i2 < neededDynlibsCount; ++i2) {
                      libname = getString();
                      customSection.neededDynlibs.push(libname);
                    }
                  } else if (subsectionType === WASM_DYLINK_EXPORT_INFO) {
                    var count = getLEB();
                    while (count--) {
                      var symname = getString();
                      var flags2 = getLEB();
                      if (flags2 & WASM_SYMBOL_TLS) {
                        customSection.tlsExports.add(symname);
                      }
                    }
                  } else if (subsectionType === WASM_DYLINK_IMPORT_INFO) {
                    var count = getLEB();
                    while (count--) {
                      var modname = getString();
                      var symname = getString();
                      var flags2 = getLEB();
                      if ((flags2 & WASM_SYMBOL_BINDING_MASK) == WASM_SYMBOL_BINDING_WEAK) {
                        customSection.weakImports.add(symname);
                      }
                    }
                  } else {
                    offset += subsectionSize;
                  }
                }
              }
              return customSection;
            };
            function getValue(ptr, type = "i8") {
              if (type.endsWith("*")) type = "*";
              switch (type) {
                case "i1":
                  return HEAP8[ptr];
                case "i8":
                  return HEAP8[ptr];
                case "i16":
                  return LE_HEAP_LOAD_I16((ptr >> 1) * 2);
                case "i32":
                  return LE_HEAP_LOAD_I32((ptr >> 2) * 4);
                case "i64":
                  abort("to do getValue(i64) use WASM_BIGINT");
                case "float":
                  return LE_HEAP_LOAD_F32((ptr >> 2) * 4);
                case "double":
                  return LE_HEAP_LOAD_F64((ptr >> 3) * 8);
                case "*":
                  return LE_HEAP_LOAD_U32((ptr >> 2) * 4);
                default:
                  abort(`invalid type for getValue: ${type}`);
              }
            }
            var newDSO = (name2, handle2, syms) => {
              var dso = {
                refcount: Infinity,
                name: name2,
                exports: syms,
                global: true
              };
              LDSO.loadedLibsByName[name2] = dso;
              if (handle2 != void 0) {
                LDSO.loadedLibsByHandle[handle2] = dso;
              }
              return dso;
            };
            var LDSO = {
              loadedLibsByName: {},
              loadedLibsByHandle: {},
              init() {
                newDSO("__main__", 0, wasmImports);
              }
            };
            var ___heap_base = 78112;
            var zeroMemory = (address, size) => {
              HEAPU8.fill(0, address, address + size);
              return address;
            };
            var alignMemory = (size, alignment) => Math.ceil(size / alignment) * alignment;
            var getMemory = (size) => {
              if (runtimeInitialized) {
                return zeroMemory(_malloc(size), size);
              }
              var ret = ___heap_base;
              var end = ret + alignMemory(size, 16);
              ___heap_base = end;
              GOT["__heap_base"].value = end;
              return ret;
            };
            var isInternalSym = (symName) => ["__cpp_exception", "__c_longjmp", "__wasm_apply_data_relocs", "__dso_handle", "__tls_size", "__tls_align", "__set_stack_limits", "_emscripten_tls_init", "__wasm_init_tls", "__wasm_call_ctors", "__start_em_asm", "__stop_em_asm", "__start_em_js", "__stop_em_js"].includes(symName) || symName.startsWith("__em_js__");
            var uleb128Encode = (n, target) => {
              if (n < 128) {
                target.push(n);
              } else {
                target.push(n % 128 | 128, n >> 7);
              }
            };
            var sigToWasmTypes = (sig) => {
              var typeNames = {
                "i": "i32",
                "j": "i64",
                "f": "f32",
                "d": "f64",
                "e": "externref",
                "p": "i32"
              };
              var type = {
                parameters: [],
                results: sig[0] == "v" ? [] : [typeNames[sig[0]]]
              };
              for (var i2 = 1; i2 < sig.length; ++i2) {
                type.parameters.push(typeNames[sig[i2]]);
              }
              return type;
            };
            var generateFuncType = (sig, target) => {
              var sigRet = sig.slice(0, 1);
              var sigParam = sig.slice(1);
              var typeCodes = {
                "i": 127,
                // i32
                "p": 127,
                // i32
                "j": 126,
                // i64
                "f": 125,
                // f32
                "d": 124,
                // f64
                "e": 111
              };
              target.push(96);
              uleb128Encode(sigParam.length, target);
              for (var i2 = 0; i2 < sigParam.length; ++i2) {
                target.push(typeCodes[sigParam[i2]]);
              }
              if (sigRet == "v") {
                target.push(0);
              } else {
                target.push(1, typeCodes[sigRet]);
              }
            };
            var convertJsFunctionToWasm = (func2, sig) => {
              if (typeof WebAssembly.Function == "function") {
                return new WebAssembly.Function(sigToWasmTypes(sig), func2);
              }
              var typeSectionBody = [1];
              generateFuncType(sig, typeSectionBody);
              var bytes = [
                0,
                97,
                115,
                109,
                // magic ("\0asm")
                1,
                0,
                0,
                0,
                // version: 1
                1
              ];
              uleb128Encode(typeSectionBody.length, bytes);
              bytes.push(...typeSectionBody);
              bytes.push(
                2,
                7,
                // import section
                // (import "e" "f" (func 0 (type 0)))
                1,
                1,
                101,
                1,
                102,
                0,
                0,
                7,
                5,
                // export section
                // (export "f" (func 0 (type 0)))
                1,
                1,
                102,
                0,
                0
              );
              var module2 = new WebAssembly.Module(new Uint8Array(bytes));
              var instance2 = new WebAssembly.Instance(module2, {
                "e": {
                  "f": func2
                }
              });
              var wrappedFunc = instance2.exports["f"];
              return wrappedFunc;
            };
            var wasmTableMirror = [];
            var wasmTable = new WebAssembly.Table({
              "initial": 28,
              "element": "anyfunc"
            });
            var getWasmTableEntry = (funcPtr) => {
              var func2 = wasmTableMirror[funcPtr];
              if (!func2) {
                if (funcPtr >= wasmTableMirror.length) wasmTableMirror.length = funcPtr + 1;
                wasmTableMirror[funcPtr] = func2 = wasmTable.get(funcPtr);
              }
              return func2;
            };
            var updateTableMap = (offset, count) => {
              if (functionsInTableMap) {
                for (var i2 = offset; i2 < offset + count; i2++) {
                  var item = getWasmTableEntry(i2);
                  if (item) {
                    functionsInTableMap.set(item, i2);
                  }
                }
              }
            };
            var functionsInTableMap;
            var getFunctionAddress = (func2) => {
              if (!functionsInTableMap) {
                functionsInTableMap = /* @__PURE__ */ new WeakMap();
                updateTableMap(0, wasmTable.length);
              }
              return functionsInTableMap.get(func2) || 0;
            };
            var freeTableIndexes = [];
            var getEmptyTableSlot = () => {
              if (freeTableIndexes.length) {
                return freeTableIndexes.pop();
              }
              try {
                wasmTable.grow(1);
              } catch (err2) {
                if (!(err2 instanceof RangeError)) {
                  throw err2;
                }
                throw "Unable to grow wasm table. Set ALLOW_TABLE_GROWTH.";
              }
              return wasmTable.length - 1;
            };
            var setWasmTableEntry = (idx, func2) => {
              wasmTable.set(idx, func2);
              wasmTableMirror[idx] = wasmTable.get(idx);
            };
            var addFunction = (func2, sig) => {
              var rtn = getFunctionAddress(func2);
              if (rtn) {
                return rtn;
              }
              var ret = getEmptyTableSlot();
              try {
                setWasmTableEntry(ret, func2);
              } catch (err2) {
                if (!(err2 instanceof TypeError)) {
                  throw err2;
                }
                var wrapped = convertJsFunctionToWasm(func2, sig);
                setWasmTableEntry(ret, wrapped);
              }
              functionsInTableMap.set(func2, ret);
              return ret;
            };
            var updateGOT = (exports2, replace) => {
              for (var symName in exports2) {
                if (isInternalSym(symName)) {
                  continue;
                }
                var value = exports2[symName];
                if (symName.startsWith("orig$")) {
                  symName = symName.split("$")[1];
                  replace = true;
                }
                GOT[symName] ||= new WebAssembly.Global({
                  "value": "i32",
                  "mutable": true
                });
                if (replace || GOT[symName].value == 0) {
                  if (typeof value == "function") {
                    GOT[symName].value = addFunction(value);
                  } else if (typeof value == "number") {
                    GOT[symName].value = value;
                  } else {
                    err(`unhandled export type for '${symName}': ${typeof value}`);
                  }
                }
              }
            };
            var relocateExports = (exports2, memoryBase2, replace) => {
              var relocated = {};
              for (var e in exports2) {
                var value = exports2[e];
                if (typeof value == "object") {
                  value = value.value;
                }
                if (typeof value == "number") {
                  value += memoryBase2;
                }
                relocated[e] = value;
              }
              updateGOT(relocated, replace);
              return relocated;
            };
            var isSymbolDefined = (symName) => {
              var existing = wasmImports[symName];
              if (!existing || existing.stub) {
                return false;
              }
              return true;
            };
            var dynCallLegacy = (sig, ptr, args2) => {
              sig = sig.replace(/p/g, "i");
              var f = Module["dynCall_" + sig];
              return f(ptr, ...args2);
            };
            var dynCall = (sig, ptr, args2 = []) => {
              if (sig.includes("j")) {
                return dynCallLegacy(sig, ptr, args2);
              }
              var rtn = getWasmTableEntry(ptr)(...args2);
              return rtn;
            };
            var stackSave = () => _emscripten_stack_get_current();
            var stackRestore = (val) => __emscripten_stack_restore(val);
            var createInvokeFunction = (sig) => (ptr, ...args2) => {
              var sp = stackSave();
              try {
                return dynCall(sig, ptr, args2);
              } catch (e) {
                stackRestore(sp);
                if (e !== e + 0) throw e;
                _setThrew(1, 0);
              }
            };
            var resolveGlobalSymbol = (symName, direct = false) => {
              var sym;
              if (direct && "orig$" + symName in wasmImports) {
                symName = "orig$" + symName;
              }
              if (isSymbolDefined(symName)) {
                sym = wasmImports[symName];
              } else if (symName.startsWith("invoke_")) {
                sym = wasmImports[symName] = createInvokeFunction(symName.split("_")[1]);
              }
              return {
                sym,
                name: symName
              };
            };
            var UTF8ToString = (ptr, maxBytesToRead) => ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : "";
            var loadWebAssemblyModule = (binary, flags, libName, localScope, handle) => {
              var metadata = getDylinkMetadata(binary);
              currentModuleWeakSymbols = metadata.weakImports;
              function loadModule() {
                var firstLoad = !handle || !HEAP8[handle + 8];
                if (firstLoad) {
                  var memAlign = Math.pow(2, metadata.memoryAlign);
                  var memoryBase = metadata.memorySize ? alignMemory(getMemory(metadata.memorySize + memAlign), memAlign) : 0;
                  var tableBase = metadata.tableSize ? wasmTable.length : 0;
                  if (handle) {
                    HEAP8[handle + 8] = 1;
                    LE_HEAP_STORE_U32((handle + 12 >> 2) * 4, memoryBase);
                    LE_HEAP_STORE_I32((handle + 16 >> 2) * 4, metadata.memorySize);
                    LE_HEAP_STORE_U32((handle + 20 >> 2) * 4, tableBase);
                    LE_HEAP_STORE_I32((handle + 24 >> 2) * 4, metadata.tableSize);
                  }
                } else {
                  memoryBase = LE_HEAP_LOAD_U32((handle + 12 >> 2) * 4);
                  tableBase = LE_HEAP_LOAD_U32((handle + 20 >> 2) * 4);
                }
                var tableGrowthNeeded = tableBase + metadata.tableSize - wasmTable.length;
                if (tableGrowthNeeded > 0) {
                  wasmTable.grow(tableGrowthNeeded);
                }
                var moduleExports;
                function resolveSymbol(sym) {
                  var resolved = resolveGlobalSymbol(sym).sym;
                  if (!resolved && localScope) {
                    resolved = localScope[sym];
                  }
                  if (!resolved) {
                    resolved = moduleExports[sym];
                  }
                  return resolved;
                }
                var proxyHandler = {
                  get(stubs, prop) {
                    switch (prop) {
                      case "__memory_base":
                        return memoryBase;
                      case "__table_base":
                        return tableBase;
                    }
                    if (prop in wasmImports && !wasmImports[prop].stub) {
                      return wasmImports[prop];
                    }
                    if (!(prop in stubs)) {
                      var resolved;
                      stubs[prop] = (...args2) => {
                        resolved ||= resolveSymbol(prop);
                        return resolved(...args2);
                      };
                    }
                    return stubs[prop];
                  }
                };
                var proxy = new Proxy({}, proxyHandler);
                var info = {
                  "GOT.mem": new Proxy({}, GOTHandler),
                  "GOT.func": new Proxy({}, GOTHandler),
                  "env": proxy,
                  "wasi_snapshot_preview1": proxy
                };
                function postInstantiation(module, instance) {
                  updateTableMap(tableBase, metadata.tableSize);
                  moduleExports = relocateExports(instance.exports, memoryBase);
                  if (!flags.allowUndefined) {
                    reportUndefinedSymbols();
                  }
                  function addEmAsm(addr, body) {
                    var args = [];
                    var arity = 0;
                    for (; arity < 16; arity++) {
                      if (body.indexOf("$" + arity) != -1) {
                        args.push("$" + arity);
                      } else {
                        break;
                      }
                    }
                    args = args.join(",");
                    var func = `(${args}) => { ${body} };`;
                    ASM_CONSTS[start] = eval(func);
                  }
                  if ("__start_em_asm" in moduleExports) {
                    var start = moduleExports["__start_em_asm"];
                    var stop = moduleExports["__stop_em_asm"];
                    while (start < stop) {
                      var jsString = UTF8ToString(start);
                      addEmAsm(start, jsString);
                      start = HEAPU8.indexOf(0, start) + 1;
                    }
                  }
                  function addEmJs(name, cSig, body) {
                    var jsArgs = [];
                    cSig = cSig.slice(1, -1);
                    if (cSig != "void") {
                      cSig = cSig.split(",");
                      for (var i in cSig) {
                        var jsArg = cSig[i].split(" ").pop();
                        jsArgs.push(jsArg.replace("*", ""));
                      }
                    }
                    var func = `(${jsArgs}) => ${body};`;
                    moduleExports[name] = eval(func);
                  }
                  for (var name in moduleExports) {
                    if (name.startsWith("__em_js__")) {
                      var start = moduleExports[name];
                      var jsString = UTF8ToString(start);
                      var parts = jsString.split("<::>");
                      addEmJs(name.replace("__em_js__", ""), parts[0], parts[1]);
                      delete moduleExports[name];
                    }
                  }
                  var applyRelocs = moduleExports["__wasm_apply_data_relocs"];
                  if (applyRelocs) {
                    if (runtimeInitialized) {
                      applyRelocs();
                    } else {
                      __RELOC_FUNCS__.push(applyRelocs);
                    }
                  }
                  var init = moduleExports["__wasm_call_ctors"];
                  if (init) {
                    if (runtimeInitialized) {
                      init();
                    } else {
                      __ATINIT__.push(init);
                    }
                  }
                  return moduleExports;
                }
                if (flags.loadAsync) {
                  if (binary instanceof WebAssembly.Module) {
                    var instance = new WebAssembly.Instance(binary, info);
                    return Promise.resolve(postInstantiation(binary, instance));
                  }
                  return WebAssembly.instantiate(binary, info).then((result) => postInstantiation(result.module, result.instance));
                }
                var module = binary instanceof WebAssembly.Module ? binary : new WebAssembly.Module(binary);
                var instance = new WebAssembly.Instance(module, info);
                return postInstantiation(module, instance);
              }
              if (flags.loadAsync) {
                return metadata.neededDynlibs.reduce((chain, dynNeeded) => chain.then(() => loadDynamicLibrary(dynNeeded, flags, localScope)), Promise.resolve()).then(loadModule);
              }
              metadata.neededDynlibs.forEach((needed) => loadDynamicLibrary(needed, flags, localScope));
              return loadModule();
            };
            var mergeLibSymbols = (exports2, libName2) => {
              for (var [sym, exp] of Object.entries(exports2)) {
                const setImport = (target) => {
                  if (!isSymbolDefined(target)) {
                    wasmImports[target] = exp;
                  }
                };
                setImport(sym);
                const main_alias = "__main_argc_argv";
                if (sym == "main") {
                  setImport(main_alias);
                }
                if (sym == main_alias) {
                  setImport("main");
                }
                if (sym.startsWith("dynCall_") && !Module.hasOwnProperty(sym)) {
                  Module[sym] = exp;
                }
              }
            };
            var asyncLoad = (url, onload, onerror, noRunDep) => {
              var dep = !noRunDep ? getUniqueRunDependency(`al ${url}`) : "";
              readAsync(url).then((arrayBuffer) => {
                onload(new Uint8Array(arrayBuffer));
                if (dep) removeRunDependency(dep);
              }, (err2) => {
                if (onerror) {
                  onerror();
                } else {
                  throw `Loading data file "${url}" failed.`;
                }
              });
              if (dep) addRunDependency(dep);
            };
            function loadDynamicLibrary(libName2, flags2 = {
              global: true,
              nodelete: true
            }, localScope2, handle2) {
              var dso = LDSO.loadedLibsByName[libName2];
              if (dso) {
                if (!flags2.global) {
                  if (localScope2) {
                    Object.assign(localScope2, dso.exports);
                  }
                } else if (!dso.global) {
                  dso.global = true;
                  mergeLibSymbols(dso.exports, libName2);
                }
                if (flags2.nodelete && dso.refcount !== Infinity) {
                  dso.refcount = Infinity;
                }
                dso.refcount++;
                if (handle2) {
                  LDSO.loadedLibsByHandle[handle2] = dso;
                }
                return flags2.loadAsync ? Promise.resolve(true) : true;
              }
              dso = newDSO(libName2, handle2, "loading");
              dso.refcount = flags2.nodelete ? Infinity : 1;
              dso.global = flags2.global;
              function loadLibData() {
                if (handle2) {
                  var data = LE_HEAP_LOAD_U32((handle2 + 28 >> 2) * 4);
                  var dataSize = LE_HEAP_LOAD_U32((handle2 + 32 >> 2) * 4);
                  if (data && dataSize) {
                    var libData = HEAP8.slice(data, data + dataSize);
                    return flags2.loadAsync ? Promise.resolve(libData) : libData;
                  }
                }
                var libFile = locateFile(libName2);
                if (flags2.loadAsync) {
                  return new Promise(function(resolve2, reject) {
                    asyncLoad(libFile, resolve2, reject);
                  });
                }
                if (!readBinary) {
                  throw new Error(`${libFile}: file not found, and synchronous loading of external files is not available`);
                }
                return readBinary(libFile);
              }
              function getExports() {
                if (flags2.loadAsync) {
                  return loadLibData().then((libData) => loadWebAssemblyModule(libData, flags2, libName2, localScope2, handle2));
                }
                return loadWebAssemblyModule(loadLibData(), flags2, libName2, localScope2, handle2);
              }
              function moduleLoaded(exports2) {
                if (dso.global) {
                  mergeLibSymbols(exports2, libName2);
                } else if (localScope2) {
                  Object.assign(localScope2, exports2);
                }
                dso.exports = exports2;
              }
              if (flags2.loadAsync) {
                return getExports().then((exports2) => {
                  moduleLoaded(exports2);
                  return true;
                });
              }
              moduleLoaded(getExports());
              return true;
            }
            var reportUndefinedSymbols = () => {
              for (var [symName, entry] of Object.entries(GOT)) {
                if (entry.value == 0) {
                  var value = resolveGlobalSymbol(symName, true).sym;
                  if (!value && !entry.required) {
                    continue;
                  }
                  if (typeof value == "function") {
                    entry.value = addFunction(value, value.sig);
                  } else if (typeof value == "number") {
                    entry.value = value;
                  } else {
                    throw new Error(`bad export type for '${symName}': ${typeof value}`);
                  }
                }
              }
            };
            var loadDylibs = () => {
              if (!dynamicLibraries.length) {
                reportUndefinedSymbols();
                return;
              }
              addRunDependency("loadDylibs");
              dynamicLibraries.reduce((chain, lib) => chain.then(() => loadDynamicLibrary(lib, {
                loadAsync: true,
                global: true,
                nodelete: true,
                allowUndefined: true
              })), Promise.resolve()).then(() => {
                reportUndefinedSymbols();
                removeRunDependency("loadDylibs");
              });
            };
            var noExitRuntime = Module["noExitRuntime"] || true;
            function setValue(ptr, value, type = "i8") {
              if (type.endsWith("*")) type = "*";
              switch (type) {
                case "i1":
                  HEAP8[ptr] = value;
                  break;
                case "i8":
                  HEAP8[ptr] = value;
                  break;
                case "i16":
                  LE_HEAP_STORE_I16((ptr >> 1) * 2, value);
                  break;
                case "i32":
                  LE_HEAP_STORE_I32((ptr >> 2) * 4, value);
                  break;
                case "i64":
                  abort("to do setValue(i64) use WASM_BIGINT");
                case "float":
                  LE_HEAP_STORE_F32((ptr >> 2) * 4, value);
                  break;
                case "double":
                  LE_HEAP_STORE_F64((ptr >> 3) * 8, value);
                  break;
                case "*":
                  LE_HEAP_STORE_U32((ptr >> 2) * 4, value);
                  break;
                default:
                  abort(`invalid type for setValue: ${type}`);
              }
            }
            var ___memory_base = new WebAssembly.Global({
              "value": "i32",
              "mutable": false
            }, 1024);
            var ___stack_pointer = new WebAssembly.Global({
              "value": "i32",
              "mutable": true
            }, 78112);
            var ___table_base = new WebAssembly.Global({
              "value": "i32",
              "mutable": false
            }, 1);
            var __abort_js = () => {
              abort("");
            };
            __abort_js.sig = "v";
            var nowIsMonotonic = 1;
            var __emscripten_get_now_is_monotonic = () => nowIsMonotonic;
            __emscripten_get_now_is_monotonic.sig = "i";
            var __emscripten_memcpy_js = (dest, src, num) => HEAPU8.copyWithin(dest, src, src + num);
            __emscripten_memcpy_js.sig = "vppp";
            var _emscripten_date_now = () => Date.now();
            _emscripten_date_now.sig = "d";
            var _emscripten_get_now;
            _emscripten_get_now = () => performance.now();
            _emscripten_get_now.sig = "d";
            var getHeapMax = () => (
              // Stay one Wasm page short of 4GB: while e.g. Chrome is able to allocate
              // full 4GB Wasm memories, the size will wrap back to 0 bytes in Wasm side
              // for any code that deals with heap sizes, which would require special
              // casing all heap size related code to treat 0 specially.
              2147483648
            );
            var growMemory = (size) => {
              var b = wasmMemory.buffer;
              var pages = (size - b.byteLength + 65535) / 65536;
              try {
                wasmMemory.grow(pages);
                updateMemoryViews();
                return 1;
              } catch (e) {
              }
            };
            var _emscripten_resize_heap = (requestedSize) => {
              var oldSize = HEAPU8.length;
              requestedSize >>>= 0;
              var maxHeapSize = getHeapMax();
              if (requestedSize > maxHeapSize) {
                return false;
              }
              var alignUp = (x, multiple) => x + (multiple - x % multiple) % multiple;
              for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
                var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown);
                overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
                var newSize = Math.min(maxHeapSize, alignUp(Math.max(requestedSize, overGrownHeapSize), 65536));
                var replacement = growMemory(newSize);
                if (replacement) {
                  return true;
                }
              }
              return false;
            };
            _emscripten_resize_heap.sig = "ip";
            var _fd_close = (fd) => 52;
            _fd_close.sig = "ii";
            var convertI32PairToI53Checked = (lo, hi) => hi + 2097152 >>> 0 < 4194305 - !!lo ? (lo >>> 0) + hi * 4294967296 : NaN;
            function _fd_seek(fd, offset_low, offset_high, whence, newOffset) {
              var offset = convertI32PairToI53Checked(offset_low, offset_high);
              return 70;
            }
            _fd_seek.sig = "iiiiip";
            var printCharBuffers = [null, [], []];
            var printChar = (stream, curr) => {
              var buffer = printCharBuffers[stream];
              if (curr === 0 || curr === 10) {
                (stream === 1 ? out : err)(UTF8ArrayToString(buffer, 0));
                buffer.length = 0;
              } else {
                buffer.push(curr);
              }
            };
            var _fd_write = (fd, iov, iovcnt, pnum) => {
              var num = 0;
              for (var i2 = 0; i2 < iovcnt; i2++) {
                var ptr = LE_HEAP_LOAD_U32((iov >> 2) * 4);
                var len = LE_HEAP_LOAD_U32((iov + 4 >> 2) * 4);
                iov += 8;
                for (var j = 0; j < len; j++) {
                  printChar(fd, HEAPU8[ptr + j]);
                }
                num += len;
              }
              LE_HEAP_STORE_U32((pnum >> 2) * 4, num);
              return 0;
            };
            _fd_write.sig = "iippp";
            function _tree_sitter_log_callback(isLexMessage, messageAddress) {
              if (currentLogCallback) {
                const message = UTF8ToString(messageAddress);
                currentLogCallback(message, isLexMessage !== 0);
              }
            }
            function _tree_sitter_parse_callback(inputBufferAddress, index, row, column, lengthAddress) {
              const INPUT_BUFFER_SIZE = 10 * 1024;
              const string = currentParseCallback(index, {
                row,
                column
              });
              if (typeof string === "string") {
                setValue(lengthAddress, string.length, "i32");
                stringToUTF16(string, inputBufferAddress, INPUT_BUFFER_SIZE);
              } else {
                setValue(lengthAddress, 0, "i32");
              }
            }
            var runtimeKeepaliveCounter = 0;
            var keepRuntimeAlive = () => noExitRuntime || runtimeKeepaliveCounter > 0;
            var _proc_exit = (code) => {
              EXITSTATUS = code;
              if (!keepRuntimeAlive()) {
                Module["onExit"]?.(code);
                ABORT = true;
              }
              quit_(code, new ExitStatus(code));
            };
            _proc_exit.sig = "vi";
            var exitJS = (status, implicit) => {
              EXITSTATUS = status;
              _proc_exit(status);
            };
            var handleException = (e) => {
              if (e instanceof ExitStatus || e == "unwind") {
                return EXITSTATUS;
              }
              quit_(1, e);
            };
            var lengthBytesUTF8 = (str) => {
              var len = 0;
              for (var i2 = 0; i2 < str.length; ++i2) {
                var c = str.charCodeAt(i2);
                if (c <= 127) {
                  len++;
                } else if (c <= 2047) {
                  len += 2;
                } else if (c >= 55296 && c <= 57343) {
                  len += 4;
                  ++i2;
                } else {
                  len += 3;
                }
              }
              return len;
            };
            var stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {
              if (!(maxBytesToWrite > 0)) return 0;
              var startIdx = outIdx;
              var endIdx = outIdx + maxBytesToWrite - 1;
              for (var i2 = 0; i2 < str.length; ++i2) {
                var u = str.charCodeAt(i2);
                if (u >= 55296 && u <= 57343) {
                  var u1 = str.charCodeAt(++i2);
                  u = 65536 + ((u & 1023) << 10) | u1 & 1023;
                }
                if (u <= 127) {
                  if (outIdx >= endIdx) break;
                  heap[outIdx++] = u;
                } else if (u <= 2047) {
                  if (outIdx + 1 >= endIdx) break;
                  heap[outIdx++] = 192 | u >> 6;
                  heap[outIdx++] = 128 | u & 63;
                } else if (u <= 65535) {
                  if (outIdx + 2 >= endIdx) break;
                  heap[outIdx++] = 224 | u >> 12;
                  heap[outIdx++] = 128 | u >> 6 & 63;
                  heap[outIdx++] = 128 | u & 63;
                } else {
                  if (outIdx + 3 >= endIdx) break;
                  heap[outIdx++] = 240 | u >> 18;
                  heap[outIdx++] = 128 | u >> 12 & 63;
                  heap[outIdx++] = 128 | u >> 6 & 63;
                  heap[outIdx++] = 128 | u & 63;
                }
              }
              heap[outIdx] = 0;
              return outIdx - startIdx;
            };
            var stringToUTF8 = (str, outPtr, maxBytesToWrite) => stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
            var stackAlloc = (sz) => __emscripten_stack_alloc(sz);
            var stringToUTF8OnStack = (str) => {
              var size = lengthBytesUTF8(str) + 1;
              var ret = stackAlloc(size);
              stringToUTF8(str, ret, size);
              return ret;
            };
            var stringToUTF16 = (str, outPtr, maxBytesToWrite) => {
              maxBytesToWrite ??= 2147483647;
              if (maxBytesToWrite < 2) return 0;
              maxBytesToWrite -= 2;
              var startPtr = outPtr;
              var numCharsToWrite = maxBytesToWrite < str.length * 2 ? maxBytesToWrite / 2 : str.length;
              for (var i2 = 0; i2 < numCharsToWrite; ++i2) {
                var codeUnit = str.charCodeAt(i2);
                LE_HEAP_STORE_I16((outPtr >> 1) * 2, codeUnit);
                outPtr += 2;
              }
              LE_HEAP_STORE_I16((outPtr >> 1) * 2, 0);
              return outPtr - startPtr;
            };
            var AsciiToString = (ptr) => {
              var str = "";
              while (1) {
                var ch = HEAPU8[ptr++];
                if (!ch) return str;
                str += String.fromCharCode(ch);
              }
            };
            var wasmImports = {
              /** @export */
              __heap_base: ___heap_base,
              /** @export */
              __indirect_function_table: wasmTable,
              /** @export */
              __memory_base: ___memory_base,
              /** @export */
              __stack_pointer: ___stack_pointer,
              /** @export */
              __table_base: ___table_base,
              /** @export */
              _abort_js: __abort_js,
              /** @export */
              _emscripten_get_now_is_monotonic: __emscripten_get_now_is_monotonic,
              /** @export */
              _emscripten_memcpy_js: __emscripten_memcpy_js,
              /** @export */
              emscripten_get_now: _emscripten_get_now,
              /** @export */
              emscripten_resize_heap: _emscripten_resize_heap,
              /** @export */
              fd_close: _fd_close,
              /** @export */
              fd_seek: _fd_seek,
              /** @export */
              fd_write: _fd_write,
              /** @export */
              memory: wasmMemory,
              /** @export */
              tree_sitter_log_callback: _tree_sitter_log_callback,
              /** @export */
              tree_sitter_parse_callback: _tree_sitter_parse_callback
            };
            var wasmExports = createWasm();
            var ___wasm_call_ctors = () => (___wasm_call_ctors = wasmExports["__wasm_call_ctors"])();
            var ___wasm_apply_data_relocs = () => (___wasm_apply_data_relocs = wasmExports["__wasm_apply_data_relocs"])();
            var _malloc = Module["_malloc"] = (a0) => (_malloc = Module["_malloc"] = wasmExports["malloc"])(a0);
            var _calloc = Module["_calloc"] = (a0, a1) => (_calloc = Module["_calloc"] = wasmExports["calloc"])(a0, a1);
            var _realloc = Module["_realloc"] = (a0, a1) => (_realloc = Module["_realloc"] = wasmExports["realloc"])(a0, a1);
            var _free = Module["_free"] = (a0) => (_free = Module["_free"] = wasmExports["free"])(a0);
            var _ts_language_symbol_count = Module["_ts_language_symbol_count"] = (a0) => (_ts_language_symbol_count = Module["_ts_language_symbol_count"] = wasmExports["ts_language_symbol_count"])(a0);
            var _ts_language_state_count = Module["_ts_language_state_count"] = (a0) => (_ts_language_state_count = Module["_ts_language_state_count"] = wasmExports["ts_language_state_count"])(a0);
            var _ts_language_version = Module["_ts_language_version"] = (a0) => (_ts_language_version = Module["_ts_language_version"] = wasmExports["ts_language_version"])(a0);
            var _ts_language_field_count = Module["_ts_language_field_count"] = (a0) => (_ts_language_field_count = Module["_ts_language_field_count"] = wasmExports["ts_language_field_count"])(a0);
            var _ts_language_next_state = Module["_ts_language_next_state"] = (a0, a1, a2) => (_ts_language_next_state = Module["_ts_language_next_state"] = wasmExports["ts_language_next_state"])(a0, a1, a2);
            var _ts_language_symbol_name = Module["_ts_language_symbol_name"] = (a0, a1) => (_ts_language_symbol_name = Module["_ts_language_symbol_name"] = wasmExports["ts_language_symbol_name"])(a0, a1);
            var _ts_language_symbol_for_name = Module["_ts_language_symbol_for_name"] = (a0, a1, a2, a3) => (_ts_language_symbol_for_name = Module["_ts_language_symbol_for_name"] = wasmExports["ts_language_symbol_for_name"])(a0, a1, a2, a3);
            var _strncmp = Module["_strncmp"] = (a0, a1, a2) => (_strncmp = Module["_strncmp"] = wasmExports["strncmp"])(a0, a1, a2);
            var _ts_language_symbol_type = Module["_ts_language_symbol_type"] = (a0, a1) => (_ts_language_symbol_type = Module["_ts_language_symbol_type"] = wasmExports["ts_language_symbol_type"])(a0, a1);
            var _ts_language_field_name_for_id = Module["_ts_language_field_name_for_id"] = (a0, a1) => (_ts_language_field_name_for_id = Module["_ts_language_field_name_for_id"] = wasmExports["ts_language_field_name_for_id"])(a0, a1);
            var _ts_lookahead_iterator_new = Module["_ts_lookahead_iterator_new"] = (a0, a1) => (_ts_lookahead_iterator_new = Module["_ts_lookahead_iterator_new"] = wasmExports["ts_lookahead_iterator_new"])(a0, a1);
            var _ts_lookahead_iterator_delete = Module["_ts_lookahead_iterator_delete"] = (a0) => (_ts_lookahead_iterator_delete = Module["_ts_lookahead_iterator_delete"] = wasmExports["ts_lookahead_iterator_delete"])(a0);
            var _ts_lookahead_iterator_reset_state = Module["_ts_lookahead_iterator_reset_state"] = (a0, a1) => (_ts_lookahead_iterator_reset_state = Module["_ts_lookahead_iterator_reset_state"] = wasmExports["ts_lookahead_iterator_reset_state"])(a0, a1);
            var _ts_lookahead_iterator_reset = Module["_ts_lookahead_iterator_reset"] = (a0, a1, a2) => (_ts_lookahead_iterator_reset = Module["_ts_lookahead_iterator_reset"] = wasmExports["ts_lookahead_iterator_reset"])(a0, a1, a2);
            var _ts_lookahead_iterator_next = Module["_ts_lookahead_iterator_next"] = (a0) => (_ts_lookahead_iterator_next = Module["_ts_lookahead_iterator_next"] = wasmExports["ts_lookahead_iterator_next"])(a0);
            var _ts_lookahead_iterator_current_symbol = Module["_ts_lookahead_iterator_current_symbol"] = (a0) => (_ts_lookahead_iterator_current_symbol = Module["_ts_lookahead_iterator_current_symbol"] = wasmExports["ts_lookahead_iterator_current_symbol"])(a0);
            var _memset = Module["_memset"] = (a0, a1, a2) => (_memset = Module["_memset"] = wasmExports["memset"])(a0, a1, a2);
            var _memcpy = Module["_memcpy"] = (a0, a1, a2) => (_memcpy = Module["_memcpy"] = wasmExports["memcpy"])(a0, a1, a2);
            var _ts_parser_delete = Module["_ts_parser_delete"] = (a0) => (_ts_parser_delete = Module["_ts_parser_delete"] = wasmExports["ts_parser_delete"])(a0);
            var _ts_parser_reset = Module["_ts_parser_reset"] = (a0) => (_ts_parser_reset = Module["_ts_parser_reset"] = wasmExports["ts_parser_reset"])(a0);
            var _ts_parser_set_language = Module["_ts_parser_set_language"] = (a0, a1) => (_ts_parser_set_language = Module["_ts_parser_set_language"] = wasmExports["ts_parser_set_language"])(a0, a1);
            var _ts_parser_timeout_micros = Module["_ts_parser_timeout_micros"] = (a0) => (_ts_parser_timeout_micros = Module["_ts_parser_timeout_micros"] = wasmExports["ts_parser_timeout_micros"])(a0);
            var _ts_parser_set_timeout_micros = Module["_ts_parser_set_timeout_micros"] = (a0, a1, a2) => (_ts_parser_set_timeout_micros = Module["_ts_parser_set_timeout_micros"] = wasmExports["ts_parser_set_timeout_micros"])(a0, a1, a2);
            var _ts_parser_set_included_ranges = Module["_ts_parser_set_included_ranges"] = (a0, a1, a2) => (_ts_parser_set_included_ranges = Module["_ts_parser_set_included_ranges"] = wasmExports["ts_parser_set_included_ranges"])(a0, a1, a2);
            var _memmove = Module["_memmove"] = (a0, a1, a2) => (_memmove = Module["_memmove"] = wasmExports["memmove"])(a0, a1, a2);
            var _memcmp = Module["_memcmp"] = (a0, a1, a2) => (_memcmp = Module["_memcmp"] = wasmExports["memcmp"])(a0, a1, a2);
            var _ts_query_new = Module["_ts_query_new"] = (a0, a1, a2, a3, a4) => (_ts_query_new = Module["_ts_query_new"] = wasmExports["ts_query_new"])(a0, a1, a2, a3, a4);
            var _ts_query_delete = Module["_ts_query_delete"] = (a0) => (_ts_query_delete = Module["_ts_query_delete"] = wasmExports["ts_query_delete"])(a0);
            var _iswspace = Module["_iswspace"] = (a0) => (_iswspace = Module["_iswspace"] = wasmExports["iswspace"])(a0);
            var _iswalnum = Module["_iswalnum"] = (a0) => (_iswalnum = Module["_iswalnum"] = wasmExports["iswalnum"])(a0);
            var _ts_query_pattern_count = Module["_ts_query_pattern_count"] = (a0) => (_ts_query_pattern_count = Module["_ts_query_pattern_count"] = wasmExports["ts_query_pattern_count"])(a0);
            var _ts_query_capture_count = Module["_ts_query_capture_count"] = (a0) => (_ts_query_capture_count = Module["_ts_query_capture_count"] = wasmExports["ts_query_capture_count"])(a0);
            var _ts_query_string_count = Module["_ts_query_string_count"] = (a0) => (_ts_query_string_count = Module["_ts_query_string_count"] = wasmExports["ts_query_string_count"])(a0);
            var _ts_query_capture_name_for_id = Module["_ts_query_capture_name_for_id"] = (a0, a1, a2) => (_ts_query_capture_name_for_id = Module["_ts_query_capture_name_for_id"] = wasmExports["ts_query_capture_name_for_id"])(a0, a1, a2);
            var _ts_query_string_value_for_id = Module["_ts_query_string_value_for_id"] = (a0, a1, a2) => (_ts_query_string_value_for_id = Module["_ts_query_string_value_for_id"] = wasmExports["ts_query_string_value_for_id"])(a0, a1, a2);
            var _ts_query_predicates_for_pattern = Module["_ts_query_predicates_for_pattern"] = (a0, a1, a2) => (_ts_query_predicates_for_pattern = Module["_ts_query_predicates_for_pattern"] = wasmExports["ts_query_predicates_for_pattern"])(a0, a1, a2);
            var _ts_query_disable_capture = Module["_ts_query_disable_capture"] = (a0, a1, a2) => (_ts_query_disable_capture = Module["_ts_query_disable_capture"] = wasmExports["ts_query_disable_capture"])(a0, a1, a2);
            var _ts_tree_copy = Module["_ts_tree_copy"] = (a0) => (_ts_tree_copy = Module["_ts_tree_copy"] = wasmExports["ts_tree_copy"])(a0);
            var _ts_tree_delete = Module["_ts_tree_delete"] = (a0) => (_ts_tree_delete = Module["_ts_tree_delete"] = wasmExports["ts_tree_delete"])(a0);
            var _ts_init = Module["_ts_init"] = () => (_ts_init = Module["_ts_init"] = wasmExports["ts_init"])();
            var _ts_parser_new_wasm = Module["_ts_parser_new_wasm"] = () => (_ts_parser_new_wasm = Module["_ts_parser_new_wasm"] = wasmExports["ts_parser_new_wasm"])();
            var _ts_parser_enable_logger_wasm = Module["_ts_parser_enable_logger_wasm"] = (a0, a1) => (_ts_parser_enable_logger_wasm = Module["_ts_parser_enable_logger_wasm"] = wasmExports["ts_parser_enable_logger_wasm"])(a0, a1);
            var _ts_parser_parse_wasm = Module["_ts_parser_parse_wasm"] = (a0, a1, a2, a3, a4) => (_ts_parser_parse_wasm = Module["_ts_parser_parse_wasm"] = wasmExports["ts_parser_parse_wasm"])(a0, a1, a2, a3, a4);
            var _ts_parser_included_ranges_wasm = Module["_ts_parser_included_ranges_wasm"] = (a0) => (_ts_parser_included_ranges_wasm = Module["_ts_parser_included_ranges_wasm"] = wasmExports["ts_parser_included_ranges_wasm"])(a0);
            var _ts_language_type_is_named_wasm = Module["_ts_language_type_is_named_wasm"] = (a0, a1) => (_ts_language_type_is_named_wasm = Module["_ts_language_type_is_named_wasm"] = wasmExports["ts_language_type_is_named_wasm"])(a0, a1);
            var _ts_language_type_is_visible_wasm = Module["_ts_language_type_is_visible_wasm"] = (a0, a1) => (_ts_language_type_is_visible_wasm = Module["_ts_language_type_is_visible_wasm"] = wasmExports["ts_language_type_is_visible_wasm"])(a0, a1);
            var _ts_tree_root_node_wasm = Module["_ts_tree_root_node_wasm"] = (a0) => (_ts_tree_root_node_wasm = Module["_ts_tree_root_node_wasm"] = wasmExports["ts_tree_root_node_wasm"])(a0);
            var _ts_tree_root_node_with_offset_wasm = Module["_ts_tree_root_node_with_offset_wasm"] = (a0) => (_ts_tree_root_node_with_offset_wasm = Module["_ts_tree_root_node_with_offset_wasm"] = wasmExports["ts_tree_root_node_with_offset_wasm"])(a0);
            var _ts_tree_edit_wasm = Module["_ts_tree_edit_wasm"] = (a0) => (_ts_tree_edit_wasm = Module["_ts_tree_edit_wasm"] = wasmExports["ts_tree_edit_wasm"])(a0);
            var _ts_tree_included_ranges_wasm = Module["_ts_tree_included_ranges_wasm"] = (a0) => (_ts_tree_included_ranges_wasm = Module["_ts_tree_included_ranges_wasm"] = wasmExports["ts_tree_included_ranges_wasm"])(a0);
            var _ts_tree_get_changed_ranges_wasm = Module["_ts_tree_get_changed_ranges_wasm"] = (a0, a1) => (_ts_tree_get_changed_ranges_wasm = Module["_ts_tree_get_changed_ranges_wasm"] = wasmExports["ts_tree_get_changed_ranges_wasm"])(a0, a1);
            var _ts_tree_cursor_new_wasm = Module["_ts_tree_cursor_new_wasm"] = (a0) => (_ts_tree_cursor_new_wasm = Module["_ts_tree_cursor_new_wasm"] = wasmExports["ts_tree_cursor_new_wasm"])(a0);
            var _ts_tree_cursor_delete_wasm = Module["_ts_tree_cursor_delete_wasm"] = (a0) => (_ts_tree_cursor_delete_wasm = Module["_ts_tree_cursor_delete_wasm"] = wasmExports["ts_tree_cursor_delete_wasm"])(a0);
            var _ts_tree_cursor_reset_wasm = Module["_ts_tree_cursor_reset_wasm"] = (a0) => (_ts_tree_cursor_reset_wasm = Module["_ts_tree_cursor_reset_wasm"] = wasmExports["ts_tree_cursor_reset_wasm"])(a0);
            var _ts_tree_cursor_reset_to_wasm = Module["_ts_tree_cursor_reset_to_wasm"] = (a0, a1) => (_ts_tree_cursor_reset_to_wasm = Module["_ts_tree_cursor_reset_to_wasm"] = wasmExports["ts_tree_cursor_reset_to_wasm"])(a0, a1);
            var _ts_tree_cursor_goto_first_child_wasm = Module["_ts_tree_cursor_goto_first_child_wasm"] = (a0) => (_ts_tree_cursor_goto_first_child_wasm = Module["_ts_tree_cursor_goto_first_child_wasm"] = wasmExports["ts_tree_cursor_goto_first_child_wasm"])(a0);
            var _ts_tree_cursor_goto_last_child_wasm = Module["_ts_tree_cursor_goto_last_child_wasm"] = (a0) => (_ts_tree_cursor_goto_last_child_wasm = Module["_ts_tree_cursor_goto_last_child_wasm"] = wasmExports["ts_tree_cursor_goto_last_child_wasm"])(a0);
            var _ts_tree_cursor_goto_first_child_for_index_wasm = Module["_ts_tree_cursor_goto_first_child_for_index_wasm"] = (a0) => (_ts_tree_cursor_goto_first_child_for_index_wasm = Module["_ts_tree_cursor_goto_first_child_for_index_wasm"] = wasmExports["ts_tree_cursor_goto_first_child_for_index_wasm"])(a0);
            var _ts_tree_cursor_goto_first_child_for_position_wasm = Module["_ts_tree_cursor_goto_first_child_for_position_wasm"] = (a0) => (_ts_tree_cursor_goto_first_child_for_position_wasm = Module["_ts_tree_cursor_goto_first_child_for_position_wasm"] = wasmExports["ts_tree_cursor_goto_first_child_for_position_wasm"])(a0);
            var _ts_tree_cursor_goto_next_sibling_wasm = Module["_ts_tree_cursor_goto_next_sibling_wasm"] = (a0) => (_ts_tree_cursor_goto_next_sibling_wasm = Module["_ts_tree_cursor_goto_next_sibling_wasm"] = wasmExports["ts_tree_cursor_goto_next_sibling_wasm"])(a0);
            var _ts_tree_cursor_goto_previous_sibling_wasm = Module["_ts_tree_cursor_goto_previous_sibling_wasm"] = (a0) => (_ts_tree_cursor_goto_previous_sibling_wasm = Module["_ts_tree_cursor_goto_previous_sibling_wasm"] = wasmExports["ts_tree_cursor_goto_previous_sibling_wasm"])(a0);
            var _ts_tree_cursor_goto_descendant_wasm = Module["_ts_tree_cursor_goto_descendant_wasm"] = (a0, a1) => (_ts_tree_cursor_goto_descendant_wasm = Module["_ts_tree_cursor_goto_descendant_wasm"] = wasmExports["ts_tree_cursor_goto_descendant_wasm"])(a0, a1);
            var _ts_tree_cursor_goto_parent_wasm = Module["_ts_tree_cursor_goto_parent_wasm"] = (a0) => (_ts_tree_cursor_goto_parent_wasm = Module["_ts_tree_cursor_goto_parent_wasm"] = wasmExports["ts_tree_cursor_goto_parent_wasm"])(a0);
            var _ts_tree_cursor_current_node_type_id_wasm = Module["_ts_tree_cursor_current_node_type_id_wasm"] = (a0) => (_ts_tree_cursor_current_node_type_id_wasm = Module["_ts_tree_cursor_current_node_type_id_wasm"] = wasmExports["ts_tree_cursor_current_node_type_id_wasm"])(a0);
            var _ts_tree_cursor_current_node_state_id_wasm = Module["_ts_tree_cursor_current_node_state_id_wasm"] = (a0) => (_ts_tree_cursor_current_node_state_id_wasm = Module["_ts_tree_cursor_current_node_state_id_wasm"] = wasmExports["ts_tree_cursor_current_node_state_id_wasm"])(a0);
            var _ts_tree_cursor_current_node_is_named_wasm = Module["_ts_tree_cursor_current_node_is_named_wasm"] = (a0) => (_ts_tree_cursor_current_node_is_named_wasm = Module["_ts_tree_cursor_current_node_is_named_wasm"] = wasmExports["ts_tree_cursor_current_node_is_named_wasm"])(a0);
            var _ts_tree_cursor_current_node_is_missing_wasm = Module["_ts_tree_cursor_current_node_is_missing_wasm"] = (a0) => (_ts_tree_cursor_current_node_is_missing_wasm = Module["_ts_tree_cursor_current_node_is_missing_wasm"] = wasmExports["ts_tree_cursor_current_node_is_missing_wasm"])(a0);
            var _ts_tree_cursor_current_node_id_wasm = Module["_ts_tree_cursor_current_node_id_wasm"] = (a0) => (_ts_tree_cursor_current_node_id_wasm = Module["_ts_tree_cursor_current_node_id_wasm"] = wasmExports["ts_tree_cursor_current_node_id_wasm"])(a0);
            var _ts_tree_cursor_start_position_wasm = Module["_ts_tree_cursor_start_position_wasm"] = (a0) => (_ts_tree_cursor_start_position_wasm = Module["_ts_tree_cursor_start_position_wasm"] = wasmExports["ts_tree_cursor_start_position_wasm"])(a0);
            var _ts_tree_cursor_end_position_wasm = Module["_ts_tree_cursor_end_position_wasm"] = (a0) => (_ts_tree_cursor_end_position_wasm = Module["_ts_tree_cursor_end_position_wasm"] = wasmExports["ts_tree_cursor_end_position_wasm"])(a0);
            var _ts_tree_cursor_start_index_wasm = Module["_ts_tree_cursor_start_index_wasm"] = (a0) => (_ts_tree_cursor_start_index_wasm = Module["_ts_tree_cursor_start_index_wasm"] = wasmExports["ts_tree_cursor_start_index_wasm"])(a0);
            var _ts_tree_cursor_end_index_wasm = Module["_ts_tree_cursor_end_index_wasm"] = (a0) => (_ts_tree_cursor_end_index_wasm = Module["_ts_tree_cursor_end_index_wasm"] = wasmExports["ts_tree_cursor_end_index_wasm"])(a0);
            var _ts_tree_cursor_current_field_id_wasm = Module["_ts_tree_cursor_current_field_id_wasm"] = (a0) => (_ts_tree_cursor_current_field_id_wasm = Module["_ts_tree_cursor_current_field_id_wasm"] = wasmExports["ts_tree_cursor_current_field_id_wasm"])(a0);
            var _ts_tree_cursor_current_depth_wasm = Module["_ts_tree_cursor_current_depth_wasm"] = (a0) => (_ts_tree_cursor_current_depth_wasm = Module["_ts_tree_cursor_current_depth_wasm"] = wasmExports["ts_tree_cursor_current_depth_wasm"])(a0);
            var _ts_tree_cursor_current_descendant_index_wasm = Module["_ts_tree_cursor_current_descendant_index_wasm"] = (a0) => (_ts_tree_cursor_current_descendant_index_wasm = Module["_ts_tree_cursor_current_descendant_index_wasm"] = wasmExports["ts_tree_cursor_current_descendant_index_wasm"])(a0);
            var _ts_tree_cursor_current_node_wasm = Module["_ts_tree_cursor_current_node_wasm"] = (a0) => (_ts_tree_cursor_current_node_wasm = Module["_ts_tree_cursor_current_node_wasm"] = wasmExports["ts_tree_cursor_current_node_wasm"])(a0);
            var _ts_node_symbol_wasm = Module["_ts_node_symbol_wasm"] = (a0) => (_ts_node_symbol_wasm = Module["_ts_node_symbol_wasm"] = wasmExports["ts_node_symbol_wasm"])(a0);
            var _ts_node_field_name_for_child_wasm = Module["_ts_node_field_name_for_child_wasm"] = (a0, a1) => (_ts_node_field_name_for_child_wasm = Module["_ts_node_field_name_for_child_wasm"] = wasmExports["ts_node_field_name_for_child_wasm"])(a0, a1);
            var _ts_node_children_by_field_id_wasm = Module["_ts_node_children_by_field_id_wasm"] = (a0, a1) => (_ts_node_children_by_field_id_wasm = Module["_ts_node_children_by_field_id_wasm"] = wasmExports["ts_node_children_by_field_id_wasm"])(a0, a1);
            var _ts_node_first_child_for_byte_wasm = Module["_ts_node_first_child_for_byte_wasm"] = (a0) => (_ts_node_first_child_for_byte_wasm = Module["_ts_node_first_child_for_byte_wasm"] = wasmExports["ts_node_first_child_for_byte_wasm"])(a0);
            var _ts_node_first_named_child_for_byte_wasm = Module["_ts_node_first_named_child_for_byte_wasm"] = (a0) => (_ts_node_first_named_child_for_byte_wasm = Module["_ts_node_first_named_child_for_byte_wasm"] = wasmExports["ts_node_first_named_child_for_byte_wasm"])(a0);
            var _ts_node_grammar_symbol_wasm = Module["_ts_node_grammar_symbol_wasm"] = (a0) => (_ts_node_grammar_symbol_wasm = Module["_ts_node_grammar_symbol_wasm"] = wasmExports["ts_node_grammar_symbol_wasm"])(a0);
            var _ts_node_child_count_wasm = Module["_ts_node_child_count_wasm"] = (a0) => (_ts_node_child_count_wasm = Module["_ts_node_child_count_wasm"] = wasmExports["ts_node_child_count_wasm"])(a0);
            var _ts_node_named_child_count_wasm = Module["_ts_node_named_child_count_wasm"] = (a0) => (_ts_node_named_child_count_wasm = Module["_ts_node_named_child_count_wasm"] = wasmExports["ts_node_named_child_count_wasm"])(a0);
            var _ts_node_child_wasm = Module["_ts_node_child_wasm"] = (a0, a1) => (_ts_node_child_wasm = Module["_ts_node_child_wasm"] = wasmExports["ts_node_child_wasm"])(a0, a1);
            var _ts_node_named_child_wasm = Module["_ts_node_named_child_wasm"] = (a0, a1) => (_ts_node_named_child_wasm = Module["_ts_node_named_child_wasm"] = wasmExports["ts_node_named_child_wasm"])(a0, a1);
            var _ts_node_child_by_field_id_wasm = Module["_ts_node_child_by_field_id_wasm"] = (a0, a1) => (_ts_node_child_by_field_id_wasm = Module["_ts_node_child_by_field_id_wasm"] = wasmExports["ts_node_child_by_field_id_wasm"])(a0, a1);
            var _ts_node_next_sibling_wasm = Module["_ts_node_next_sibling_wasm"] = (a0) => (_ts_node_next_sibling_wasm = Module["_ts_node_next_sibling_wasm"] = wasmExports["ts_node_next_sibling_wasm"])(a0);
            var _ts_node_prev_sibling_wasm = Module["_ts_node_prev_sibling_wasm"] = (a0) => (_ts_node_prev_sibling_wasm = Module["_ts_node_prev_sibling_wasm"] = wasmExports["ts_node_prev_sibling_wasm"])(a0);
            var _ts_node_next_named_sibling_wasm = Module["_ts_node_next_named_sibling_wasm"] = (a0) => (_ts_node_next_named_sibling_wasm = Module["_ts_node_next_named_sibling_wasm"] = wasmExports["ts_node_next_named_sibling_wasm"])(a0);
            var _ts_node_prev_named_sibling_wasm = Module["_ts_node_prev_named_sibling_wasm"] = (a0) => (_ts_node_prev_named_sibling_wasm = Module["_ts_node_prev_named_sibling_wasm"] = wasmExports["ts_node_prev_named_sibling_wasm"])(a0);
            var _ts_node_descendant_count_wasm = Module["_ts_node_descendant_count_wasm"] = (a0) => (_ts_node_descendant_count_wasm = Module["_ts_node_descendant_count_wasm"] = wasmExports["ts_node_descendant_count_wasm"])(a0);
            var _ts_node_parent_wasm = Module["_ts_node_parent_wasm"] = (a0) => (_ts_node_parent_wasm = Module["_ts_node_parent_wasm"] = wasmExports["ts_node_parent_wasm"])(a0);
            var _ts_node_descendant_for_index_wasm = Module["_ts_node_descendant_for_index_wasm"] = (a0) => (_ts_node_descendant_for_index_wasm = Module["_ts_node_descendant_for_index_wasm"] = wasmExports["ts_node_descendant_for_index_wasm"])(a0);
            var _ts_node_named_descendant_for_index_wasm = Module["_ts_node_named_descendant_for_index_wasm"] = (a0) => (_ts_node_named_descendant_for_index_wasm = Module["_ts_node_named_descendant_for_index_wasm"] = wasmExports["ts_node_named_descendant_for_index_wasm"])(a0);
            var _ts_node_descendant_for_position_wasm = Module["_ts_node_descendant_for_position_wasm"] = (a0) => (_ts_node_descendant_for_position_wasm = Module["_ts_node_descendant_for_position_wasm"] = wasmExports["ts_node_descendant_for_position_wasm"])(a0);
            var _ts_node_named_descendant_for_position_wasm = Module["_ts_node_named_descendant_for_position_wasm"] = (a0) => (_ts_node_named_descendant_for_position_wasm = Module["_ts_node_named_descendant_for_position_wasm"] = wasmExports["ts_node_named_descendant_for_position_wasm"])(a0);
            var _ts_node_start_point_wasm = Module["_ts_node_start_point_wasm"] = (a0) => (_ts_node_start_point_wasm = Module["_ts_node_start_point_wasm"] = wasmExports["ts_node_start_point_wasm"])(a0);
            var _ts_node_end_point_wasm = Module["_ts_node_end_point_wasm"] = (a0) => (_ts_node_end_point_wasm = Module["_ts_node_end_point_wasm"] = wasmExports["ts_node_end_point_wasm"])(a0);
            var _ts_node_start_index_wasm = Module["_ts_node_start_index_wasm"] = (a0) => (_ts_node_start_index_wasm = Module["_ts_node_start_index_wasm"] = wasmExports["ts_node_start_index_wasm"])(a0);
            var _ts_node_end_index_wasm = Module["_ts_node_end_index_wasm"] = (a0) => (_ts_node_end_index_wasm = Module["_ts_node_end_index_wasm"] = wasmExports["ts_node_end_index_wasm"])(a0);
            var _ts_node_to_string_wasm = Module["_ts_node_to_string_wasm"] = (a0) => (_ts_node_to_string_wasm = Module["_ts_node_to_string_wasm"] = wasmExports["ts_node_to_string_wasm"])(a0);
            var _ts_node_children_wasm = Module["_ts_node_children_wasm"] = (a0) => (_ts_node_children_wasm = Module["_ts_node_children_wasm"] = wasmExports["ts_node_children_wasm"])(a0);
            var _ts_node_named_children_wasm = Module["_ts_node_named_children_wasm"] = (a0) => (_ts_node_named_children_wasm = Module["_ts_node_named_children_wasm"] = wasmExports["ts_node_named_children_wasm"])(a0);
            var _ts_node_descendants_of_type_wasm = Module["_ts_node_descendants_of_type_wasm"] = (a0, a1, a2, a3, a4, a5, a6) => (_ts_node_descendants_of_type_wasm = Module["_ts_node_descendants_of_type_wasm"] = wasmExports["ts_node_descendants_of_type_wasm"])(a0, a1, a2, a3, a4, a5, a6);
            var _ts_node_is_named_wasm = Module["_ts_node_is_named_wasm"] = (a0) => (_ts_node_is_named_wasm = Module["_ts_node_is_named_wasm"] = wasmExports["ts_node_is_named_wasm"])(a0);
            var _ts_node_has_changes_wasm = Module["_ts_node_has_changes_wasm"] = (a0) => (_ts_node_has_changes_wasm = Module["_ts_node_has_changes_wasm"] = wasmExports["ts_node_has_changes_wasm"])(a0);
            var _ts_node_has_error_wasm = Module["_ts_node_has_error_wasm"] = (a0) => (_ts_node_has_error_wasm = Module["_ts_node_has_error_wasm"] = wasmExports["ts_node_has_error_wasm"])(a0);
            var _ts_node_is_error_wasm = Module["_ts_node_is_error_wasm"] = (a0) => (_ts_node_is_error_wasm = Module["_ts_node_is_error_wasm"] = wasmExports["ts_node_is_error_wasm"])(a0);
            var _ts_node_is_missing_wasm = Module["_ts_node_is_missing_wasm"] = (a0) => (_ts_node_is_missing_wasm = Module["_ts_node_is_missing_wasm"] = wasmExports["ts_node_is_missing_wasm"])(a0);
            var _ts_node_is_extra_wasm = Module["_ts_node_is_extra_wasm"] = (a0) => (_ts_node_is_extra_wasm = Module["_ts_node_is_extra_wasm"] = wasmExports["ts_node_is_extra_wasm"])(a0);
            var _ts_node_parse_state_wasm = Module["_ts_node_parse_state_wasm"] = (a0) => (_ts_node_parse_state_wasm = Module["_ts_node_parse_state_wasm"] = wasmExports["ts_node_parse_state_wasm"])(a0);
            var _ts_node_next_parse_state_wasm = Module["_ts_node_next_parse_state_wasm"] = (a0) => (_ts_node_next_parse_state_wasm = Module["_ts_node_next_parse_state_wasm"] = wasmExports["ts_node_next_parse_state_wasm"])(a0);
            var _ts_query_matches_wasm = Module["_ts_query_matches_wasm"] = (a0, a1, a2, a3, a4, a5, a6, a7, a8, a9) => (_ts_query_matches_wasm = Module["_ts_query_matches_wasm"] = wasmExports["ts_query_matches_wasm"])(a0, a1, a2, a3, a4, a5, a6, a7, a8, a9);
            var _ts_query_captures_wasm = Module["_ts_query_captures_wasm"] = (a0, a1, a2, a3, a4, a5, a6, a7, a8, a9) => (_ts_query_captures_wasm = Module["_ts_query_captures_wasm"] = wasmExports["ts_query_captures_wasm"])(a0, a1, a2, a3, a4, a5, a6, a7, a8, a9);
            var _iswalpha = Module["_iswalpha"] = (a0) => (_iswalpha = Module["_iswalpha"] = wasmExports["iswalpha"])(a0);
            var _iswblank = Module["_iswblank"] = (a0) => (_iswblank = Module["_iswblank"] = wasmExports["iswblank"])(a0);
            var _iswdigit = Module["_iswdigit"] = (a0) => (_iswdigit = Module["_iswdigit"] = wasmExports["iswdigit"])(a0);
            var _iswlower = Module["_iswlower"] = (a0) => (_iswlower = Module["_iswlower"] = wasmExports["iswlower"])(a0);
            var _iswupper = Module["_iswupper"] = (a0) => (_iswupper = Module["_iswupper"] = wasmExports["iswupper"])(a0);
            var _iswxdigit = Module["_iswxdigit"] = (a0) => (_iswxdigit = Module["_iswxdigit"] = wasmExports["iswxdigit"])(a0);
            var _memchr = Module["_memchr"] = (a0, a1, a2) => (_memchr = Module["_memchr"] = wasmExports["memchr"])(a0, a1, a2);
            var _strlen = Module["_strlen"] = (a0) => (_strlen = Module["_strlen"] = wasmExports["strlen"])(a0);
            var _strcmp = Module["_strcmp"] = (a0, a1) => (_strcmp = Module["_strcmp"] = wasmExports["strcmp"])(a0, a1);
            var _strncat = Module["_strncat"] = (a0, a1, a2) => (_strncat = Module["_strncat"] = wasmExports["strncat"])(a0, a1, a2);
            var _strncpy = Module["_strncpy"] = (a0, a1, a2) => (_strncpy = Module["_strncpy"] = wasmExports["strncpy"])(a0, a1, a2);
            var _towlower = Module["_towlower"] = (a0) => (_towlower = Module["_towlower"] = wasmExports["towlower"])(a0);
            var _towupper = Module["_towupper"] = (a0) => (_towupper = Module["_towupper"] = wasmExports["towupper"])(a0);
            var _setThrew = (a0, a1) => (_setThrew = wasmExports["setThrew"])(a0, a1);
            var __emscripten_stack_restore = (a0) => (__emscripten_stack_restore = wasmExports["_emscripten_stack_restore"])(a0);
            var __emscripten_stack_alloc = (a0) => (__emscripten_stack_alloc = wasmExports["_emscripten_stack_alloc"])(a0);
            var _emscripten_stack_get_current = () => (_emscripten_stack_get_current = wasmExports["emscripten_stack_get_current"])();
            var dynCall_jiji = Module["dynCall_jiji"] = (a0, a1, a2, a3, a4) => (dynCall_jiji = Module["dynCall_jiji"] = wasmExports["dynCall_jiji"])(a0, a1, a2, a3, a4);
            var _orig$ts_parser_timeout_micros = Module["_orig$ts_parser_timeout_micros"] = (a0) => (_orig$ts_parser_timeout_micros = Module["_orig$ts_parser_timeout_micros"] = wasmExports["orig$ts_parser_timeout_micros"])(a0);
            var _orig$ts_parser_set_timeout_micros = Module["_orig$ts_parser_set_timeout_micros"] = (a0, a1) => (_orig$ts_parser_set_timeout_micros = Module["_orig$ts_parser_set_timeout_micros"] = wasmExports["orig$ts_parser_set_timeout_micros"])(a0, a1);
            Module["AsciiToString"] = AsciiToString;
            Module["stringToUTF16"] = stringToUTF16;
            var calledRun;
            dependenciesFulfilled = function runCaller() {
              if (!calledRun) run();
              if (!calledRun) dependenciesFulfilled = runCaller;
            };
            function callMain(args2 = []) {
              var entryFunction = resolveGlobalSymbol("main").sym;
              if (!entryFunction) return;
              args2.unshift(thisProgram);
              var argc = args2.length;
              var argv = stackAlloc((argc + 1) * 4);
              var argv_ptr = argv;
              args2.forEach((arg) => {
                LE_HEAP_STORE_U32((argv_ptr >> 2) * 4, stringToUTF8OnStack(arg));
                argv_ptr += 4;
              });
              LE_HEAP_STORE_U32((argv_ptr >> 2) * 4, 0);
              try {
                var ret = entryFunction(argc, argv);
                exitJS(
                  ret,
                  /* implicit = */
                  true
                );
                return ret;
              } catch (e) {
                return handleException(e);
              }
            }
            function run(args2 = arguments_) {
              if (runDependencies > 0) {
                return;
              }
              preRun();
              if (runDependencies > 0) {
                return;
              }
              function doRun() {
                if (calledRun) return;
                calledRun = true;
                Module["calledRun"] = true;
                if (ABORT) return;
                initRuntime();
                preMain();
                Module["onRuntimeInitialized"]?.();
                if (shouldRunNow) callMain(args2);
                postRun();
              }
              if (Module["setStatus"]) {
                Module["setStatus"]("Running...");
                setTimeout(function() {
                  setTimeout(function() {
                    Module["setStatus"]("");
                  }, 1);
                  doRun();
                }, 1);
              } else {
                doRun();
              }
            }
            if (Module["preInit"]) {
              if (typeof Module["preInit"] == "function") Module["preInit"] = [Module["preInit"]];
              while (Module["preInit"].length > 0) {
                Module["preInit"].pop()();
              }
            }
            var shouldRunNow = true;
            if (Module["noInitialRun"]) shouldRunNow = false;
            run();
            const C = Module;
            const INTERNAL = {};
            const SIZE_OF_INT = 4;
            const SIZE_OF_CURSOR = 4 * SIZE_OF_INT;
            const SIZE_OF_NODE = 5 * SIZE_OF_INT;
            const SIZE_OF_POINT = 2 * SIZE_OF_INT;
            const SIZE_OF_RANGE = 2 * SIZE_OF_INT + 2 * SIZE_OF_POINT;
            const ZERO_POINT = {
              row: 0,
              column: 0
            };
            const QUERY_WORD_REGEX = /[\w-.]*/g;
            const PREDICATE_STEP_TYPE_CAPTURE = 1;
            const PREDICATE_STEP_TYPE_STRING = 2;
            const LANGUAGE_FUNCTION_REGEX = /^_?tree_sitter_\w+/;
            let VERSION;
            let MIN_COMPATIBLE_VERSION;
            let TRANSFER_BUFFER;
            let currentParseCallback;
            let currentLogCallback;
            class ParserImpl {
              static init() {
                TRANSFER_BUFFER = C._ts_init();
                VERSION = getValue(TRANSFER_BUFFER, "i32");
                MIN_COMPATIBLE_VERSION = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
              }
              initialize() {
                C._ts_parser_new_wasm();
                this[0] = getValue(TRANSFER_BUFFER, "i32");
                this[1] = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
              }
              delete() {
                C._ts_parser_delete(this[0]);
                C._free(this[1]);
                this[0] = 0;
                this[1] = 0;
              }
              setLanguage(language2) {
                let address;
                if (!language2) {
                  address = 0;
                  language2 = null;
                } else if (language2.constructor === Language) {
                  address = language2[0];
                  const version = C._ts_language_version(address);
                  if (version < MIN_COMPATIBLE_VERSION || VERSION < version) {
                    throw new Error(`Incompatible language version ${version}. Compatibility range ${MIN_COMPATIBLE_VERSION} through ${VERSION}.`);
                  }
                } else {
                  throw new Error("Argument must be a Language");
                }
                this.language = language2;
                C._ts_parser_set_language(this[0], address);
                return this;
              }
              getLanguage() {
                return this.language;
              }
              parse(callback, oldTree, options) {
                if (typeof callback === "string") {
                  currentParseCallback = (index, _) => callback.slice(index);
                } else if (typeof callback === "function") {
                  currentParseCallback = callback;
                } else {
                  throw new Error("Argument must be a string or a function");
                }
                if (this.logCallback) {
                  currentLogCallback = this.logCallback;
                  C._ts_parser_enable_logger_wasm(this[0], 1);
                } else {
                  currentLogCallback = null;
                  C._ts_parser_enable_logger_wasm(this[0], 0);
                }
                let rangeCount = 0;
                let rangeAddress = 0;
                if (options?.includedRanges) {
                  rangeCount = options.includedRanges.length;
                  rangeAddress = C._calloc(rangeCount, SIZE_OF_RANGE);
                  let address = rangeAddress;
                  for (let i2 = 0; i2 < rangeCount; i2++) {
                    marshalRange(address, options.includedRanges[i2]);
                    address += SIZE_OF_RANGE;
                  }
                }
                const treeAddress = C._ts_parser_parse_wasm(this[0], this[1], oldTree ? oldTree[0] : 0, rangeAddress, rangeCount);
                if (!treeAddress) {
                  currentParseCallback = null;
                  currentLogCallback = null;
                  throw new Error("Parsing failed");
                }
                const result = new Tree(INTERNAL, treeAddress, this.language, currentParseCallback);
                currentParseCallback = null;
                currentLogCallback = null;
                return result;
              }
              reset() {
                C._ts_parser_reset(this[0]);
              }
              getIncludedRanges() {
                C._ts_parser_included_ranges_wasm(this[0]);
                const count = getValue(TRANSFER_BUFFER, "i32");
                const buffer = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
                const result = new Array(count);
                if (count > 0) {
                  let address = buffer;
                  for (let i2 = 0; i2 < count; i2++) {
                    result[i2] = unmarshalRange(address);
                    address += SIZE_OF_RANGE;
                  }
                  C._free(buffer);
                }
                return result;
              }
              getTimeoutMicros() {
                return C._ts_parser_timeout_micros(this[0]);
              }
              setTimeoutMicros(timeout) {
                C._ts_parser_set_timeout_micros(this[0], timeout);
              }
              setLogger(callback) {
                if (!callback) {
                  callback = null;
                } else if (typeof callback !== "function") {
                  throw new Error("Logger callback must be a function");
                }
                this.logCallback = callback;
                return this;
              }
              getLogger() {
                return this.logCallback;
              }
            }
            class Tree {
              constructor(internal, address, language2, textCallback) {
                assertInternal(internal);
                this[0] = address;
                this.language = language2;
                this.textCallback = textCallback;
              }
              copy() {
                const address = C._ts_tree_copy(this[0]);
                return new Tree(INTERNAL, address, this.language, this.textCallback);
              }
              delete() {
                C._ts_tree_delete(this[0]);
                this[0] = 0;
              }
              edit(edit) {
                marshalEdit(edit);
                C._ts_tree_edit_wasm(this[0]);
              }
              get rootNode() {
                C._ts_tree_root_node_wasm(this[0]);
                return unmarshalNode(this);
              }
              rootNodeWithOffset(offsetBytes, offsetExtent) {
                const address = TRANSFER_BUFFER + SIZE_OF_NODE;
                setValue(address, offsetBytes, "i32");
                marshalPoint(address + SIZE_OF_INT, offsetExtent);
                C._ts_tree_root_node_with_offset_wasm(this[0]);
                return unmarshalNode(this);
              }
              getLanguage() {
                return this.language;
              }
              walk() {
                return this.rootNode.walk();
              }
              getChangedRanges(other) {
                if (other.constructor !== Tree) {
                  throw new TypeError("Argument must be a Tree");
                }
                C._ts_tree_get_changed_ranges_wasm(this[0], other[0]);
                const count = getValue(TRANSFER_BUFFER, "i32");
                const buffer = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
                const result = new Array(count);
                if (count > 0) {
                  let address = buffer;
                  for (let i2 = 0; i2 < count; i2++) {
                    result[i2] = unmarshalRange(address);
                    address += SIZE_OF_RANGE;
                  }
                  C._free(buffer);
                }
                return result;
              }
              getIncludedRanges() {
                C._ts_tree_included_ranges_wasm(this[0]);
                const count = getValue(TRANSFER_BUFFER, "i32");
                const buffer = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
                const result = new Array(count);
                if (count > 0) {
                  let address = buffer;
                  for (let i2 = 0; i2 < count; i2++) {
                    result[i2] = unmarshalRange(address);
                    address += SIZE_OF_RANGE;
                  }
                  C._free(buffer);
                }
                return result;
              }
            }
            class Node {
              constructor(internal, tree) {
                assertInternal(internal);
                this.tree = tree;
              }
              get typeId() {
                marshalNode(this);
                return C._ts_node_symbol_wasm(this.tree[0]);
              }
              get grammarId() {
                marshalNode(this);
                return C._ts_node_grammar_symbol_wasm(this.tree[0]);
              }
              get type() {
                return this.tree.language.types[this.typeId] || "ERROR";
              }
              get grammarType() {
                return this.tree.language.types[this.grammarId] || "ERROR";
              }
              get endPosition() {
                marshalNode(this);
                C._ts_node_end_point_wasm(this.tree[0]);
                return unmarshalPoint(TRANSFER_BUFFER);
              }
              get endIndex() {
                marshalNode(this);
                return C._ts_node_end_index_wasm(this.tree[0]);
              }
              get text() {
                return getText(this.tree, this.startIndex, this.endIndex);
              }
              get parseState() {
                marshalNode(this);
                return C._ts_node_parse_state_wasm(this.tree[0]);
              }
              get nextParseState() {
                marshalNode(this);
                return C._ts_node_next_parse_state_wasm(this.tree[0]);
              }
              get isNamed() {
                marshalNode(this);
                return C._ts_node_is_named_wasm(this.tree[0]) === 1;
              }
              get hasError() {
                marshalNode(this);
                return C._ts_node_has_error_wasm(this.tree[0]) === 1;
              }
              get hasChanges() {
                marshalNode(this);
                return C._ts_node_has_changes_wasm(this.tree[0]) === 1;
              }
              get isError() {
                marshalNode(this);
                return C._ts_node_is_error_wasm(this.tree[0]) === 1;
              }
              get isMissing() {
                marshalNode(this);
                return C._ts_node_is_missing_wasm(this.tree[0]) === 1;
              }
              get isExtra() {
                marshalNode(this);
                return C._ts_node_is_extra_wasm(this.tree[0]) === 1;
              }
              equals(other) {
                return this.id === other.id;
              }
              child(index) {
                marshalNode(this);
                C._ts_node_child_wasm(this.tree[0], index);
                return unmarshalNode(this.tree);
              }
              namedChild(index) {
                marshalNode(this);
                C._ts_node_named_child_wasm(this.tree[0], index);
                return unmarshalNode(this.tree);
              }
              childForFieldId(fieldId) {
                marshalNode(this);
                C._ts_node_child_by_field_id_wasm(this.tree[0], fieldId);
                return unmarshalNode(this.tree);
              }
              childForFieldName(fieldName) {
                const fieldId = this.tree.language.fields.indexOf(fieldName);
                if (fieldId !== -1) return this.childForFieldId(fieldId);
                return null;
              }
              fieldNameForChild(index) {
                marshalNode(this);
                const address = C._ts_node_field_name_for_child_wasm(this.tree[0], index);
                if (!address) {
                  return null;
                }
                const result = AsciiToString(address);
                return result;
              }
              childrenForFieldName(fieldName) {
                const fieldId = this.tree.language.fields.indexOf(fieldName);
                if (fieldId !== -1 && fieldId !== 0) return this.childrenForFieldId(fieldId);
                return [];
              }
              childrenForFieldId(fieldId) {
                marshalNode(this);
                C._ts_node_children_by_field_id_wasm(this.tree[0], fieldId);
                const count = getValue(TRANSFER_BUFFER, "i32");
                const buffer = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
                const result = new Array(count);
                if (count > 0) {
                  let address = buffer;
                  for (let i2 = 0; i2 < count; i2++) {
                    result[i2] = unmarshalNode(this.tree, address);
                    address += SIZE_OF_NODE;
                  }
                  C._free(buffer);
                }
                return result;
              }
              firstChildForIndex(index) {
                marshalNode(this);
                const address = TRANSFER_BUFFER + SIZE_OF_NODE;
                setValue(address, index, "i32");
                C._ts_node_first_child_for_byte_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              firstNamedChildForIndex(index) {
                marshalNode(this);
                const address = TRANSFER_BUFFER + SIZE_OF_NODE;
                setValue(address, index, "i32");
                C._ts_node_first_named_child_for_byte_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              get childCount() {
                marshalNode(this);
                return C._ts_node_child_count_wasm(this.tree[0]);
              }
              get namedChildCount() {
                marshalNode(this);
                return C._ts_node_named_child_count_wasm(this.tree[0]);
              }
              get firstChild() {
                return this.child(0);
              }
              get firstNamedChild() {
                return this.namedChild(0);
              }
              get lastChild() {
                return this.child(this.childCount - 1);
              }
              get lastNamedChild() {
                return this.namedChild(this.namedChildCount - 1);
              }
              get children() {
                if (!this._children) {
                  marshalNode(this);
                  C._ts_node_children_wasm(this.tree[0]);
                  const count = getValue(TRANSFER_BUFFER, "i32");
                  const buffer = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
                  this._children = new Array(count);
                  if (count > 0) {
                    let address = buffer;
                    for (let i2 = 0; i2 < count; i2++) {
                      this._children[i2] = unmarshalNode(this.tree, address);
                      address += SIZE_OF_NODE;
                    }
                    C._free(buffer);
                  }
                }
                return this._children;
              }
              get namedChildren() {
                if (!this._namedChildren) {
                  marshalNode(this);
                  C._ts_node_named_children_wasm(this.tree[0]);
                  const count = getValue(TRANSFER_BUFFER, "i32");
                  const buffer = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
                  this._namedChildren = new Array(count);
                  if (count > 0) {
                    let address = buffer;
                    for (let i2 = 0; i2 < count; i2++) {
                      this._namedChildren[i2] = unmarshalNode(this.tree, address);
                      address += SIZE_OF_NODE;
                    }
                    C._free(buffer);
                  }
                }
                return this._namedChildren;
              }
              descendantsOfType(types, startPosition, endPosition) {
                if (!Array.isArray(types)) types = [types];
                if (!startPosition) startPosition = ZERO_POINT;
                if (!endPosition) endPosition = ZERO_POINT;
                const symbols = [];
                const typesBySymbol = this.tree.language.types;
                for (let i2 = 0, n = typesBySymbol.length; i2 < n; i2++) {
                  if (types.includes(typesBySymbol[i2])) {
                    symbols.push(i2);
                  }
                }
                const symbolsAddress = C._malloc(SIZE_OF_INT * symbols.length);
                for (let i2 = 0, n = symbols.length; i2 < n; i2++) {
                  setValue(symbolsAddress + i2 * SIZE_OF_INT, symbols[i2], "i32");
                }
                marshalNode(this);
                C._ts_node_descendants_of_type_wasm(this.tree[0], symbolsAddress, symbols.length, startPosition.row, startPosition.column, endPosition.row, endPosition.column);
                const descendantCount = getValue(TRANSFER_BUFFER, "i32");
                const descendantAddress = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
                const result = new Array(descendantCount);
                if (descendantCount > 0) {
                  let address = descendantAddress;
                  for (let i2 = 0; i2 < descendantCount; i2++) {
                    result[i2] = unmarshalNode(this.tree, address);
                    address += SIZE_OF_NODE;
                  }
                }
                C._free(descendantAddress);
                C._free(symbolsAddress);
                return result;
              }
              get nextSibling() {
                marshalNode(this);
                C._ts_node_next_sibling_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              get previousSibling() {
                marshalNode(this);
                C._ts_node_prev_sibling_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              get nextNamedSibling() {
                marshalNode(this);
                C._ts_node_next_named_sibling_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              get previousNamedSibling() {
                marshalNode(this);
                C._ts_node_prev_named_sibling_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              get descendantCount() {
                marshalNode(this);
                return C._ts_node_descendant_count_wasm(this.tree[0]);
              }
              get parent() {
                marshalNode(this);
                C._ts_node_parent_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              descendantForIndex(start2, end = start2) {
                if (typeof start2 !== "number" || typeof end !== "number") {
                  throw new Error("Arguments must be numbers");
                }
                marshalNode(this);
                const address = TRANSFER_BUFFER + SIZE_OF_NODE;
                setValue(address, start2, "i32");
                setValue(address + SIZE_OF_INT, end, "i32");
                C._ts_node_descendant_for_index_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              namedDescendantForIndex(start2, end = start2) {
                if (typeof start2 !== "number" || typeof end !== "number") {
                  throw new Error("Arguments must be numbers");
                }
                marshalNode(this);
                const address = TRANSFER_BUFFER + SIZE_OF_NODE;
                setValue(address, start2, "i32");
                setValue(address + SIZE_OF_INT, end, "i32");
                C._ts_node_named_descendant_for_index_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              descendantForPosition(start2, end = start2) {
                if (!isPoint(start2) || !isPoint(end)) {
                  throw new Error("Arguments must be {row, column} objects");
                }
                marshalNode(this);
                const address = TRANSFER_BUFFER + SIZE_OF_NODE;
                marshalPoint(address, start2);
                marshalPoint(address + SIZE_OF_POINT, end);
                C._ts_node_descendant_for_position_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              namedDescendantForPosition(start2, end = start2) {
                if (!isPoint(start2) || !isPoint(end)) {
                  throw new Error("Arguments must be {row, column} objects");
                }
                marshalNode(this);
                const address = TRANSFER_BUFFER + SIZE_OF_NODE;
                marshalPoint(address, start2);
                marshalPoint(address + SIZE_OF_POINT, end);
                C._ts_node_named_descendant_for_position_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              walk() {
                marshalNode(this);
                C._ts_tree_cursor_new_wasm(this.tree[0]);
                return new TreeCursor(INTERNAL, this.tree);
              }
              toString() {
                marshalNode(this);
                const address = C._ts_node_to_string_wasm(this.tree[0]);
                const result = AsciiToString(address);
                C._free(address);
                return result;
              }
            }
            class TreeCursor {
              constructor(internal, tree) {
                assertInternal(internal);
                this.tree = tree;
                unmarshalTreeCursor(this);
              }
              delete() {
                marshalTreeCursor(this);
                C._ts_tree_cursor_delete_wasm(this.tree[0]);
                this[0] = this[1] = this[2] = 0;
              }
              reset(node) {
                marshalNode(node);
                marshalTreeCursor(this, TRANSFER_BUFFER + SIZE_OF_NODE);
                C._ts_tree_cursor_reset_wasm(this.tree[0]);
                unmarshalTreeCursor(this);
              }
              resetTo(cursor) {
                marshalTreeCursor(this, TRANSFER_BUFFER);
                marshalTreeCursor(cursor, TRANSFER_BUFFER + SIZE_OF_CURSOR);
                C._ts_tree_cursor_reset_to_wasm(this.tree[0], cursor.tree[0]);
                unmarshalTreeCursor(this);
              }
              get nodeType() {
                return this.tree.language.types[this.nodeTypeId] || "ERROR";
              }
              get nodeTypeId() {
                marshalTreeCursor(this);
                return C._ts_tree_cursor_current_node_type_id_wasm(this.tree[0]);
              }
              get nodeStateId() {
                marshalTreeCursor(this);
                return C._ts_tree_cursor_current_node_state_id_wasm(this.tree[0]);
              }
              get nodeId() {
                marshalTreeCursor(this);
                return C._ts_tree_cursor_current_node_id_wasm(this.tree[0]);
              }
              get nodeIsNamed() {
                marshalTreeCursor(this);
                return C._ts_tree_cursor_current_node_is_named_wasm(this.tree[0]) === 1;
              }
              get nodeIsMissing() {
                marshalTreeCursor(this);
                return C._ts_tree_cursor_current_node_is_missing_wasm(this.tree[0]) === 1;
              }
              get nodeText() {
                marshalTreeCursor(this);
                const startIndex = C._ts_tree_cursor_start_index_wasm(this.tree[0]);
                const endIndex = C._ts_tree_cursor_end_index_wasm(this.tree[0]);
                return getText(this.tree, startIndex, endIndex);
              }
              get startPosition() {
                marshalTreeCursor(this);
                C._ts_tree_cursor_start_position_wasm(this.tree[0]);
                return unmarshalPoint(TRANSFER_BUFFER);
              }
              get endPosition() {
                marshalTreeCursor(this);
                C._ts_tree_cursor_end_position_wasm(this.tree[0]);
                return unmarshalPoint(TRANSFER_BUFFER);
              }
              get startIndex() {
                marshalTreeCursor(this);
                return C._ts_tree_cursor_start_index_wasm(this.tree[0]);
              }
              get endIndex() {
                marshalTreeCursor(this);
                return C._ts_tree_cursor_end_index_wasm(this.tree[0]);
              }
              get currentNode() {
                marshalTreeCursor(this);
                C._ts_tree_cursor_current_node_wasm(this.tree[0]);
                return unmarshalNode(this.tree);
              }
              get currentFieldId() {
                marshalTreeCursor(this);
                return C._ts_tree_cursor_current_field_id_wasm(this.tree[0]);
              }
              get currentFieldName() {
                return this.tree.language.fields[this.currentFieldId];
              }
              get currentDepth() {
                marshalTreeCursor(this);
                return C._ts_tree_cursor_current_depth_wasm(this.tree[0]);
              }
              get currentDescendantIndex() {
                marshalTreeCursor(this);
                return C._ts_tree_cursor_current_descendant_index_wasm(this.tree[0]);
              }
              gotoFirstChild() {
                marshalTreeCursor(this);
                const result = C._ts_tree_cursor_goto_first_child_wasm(this.tree[0]);
                unmarshalTreeCursor(this);
                return result === 1;
              }
              gotoLastChild() {
                marshalTreeCursor(this);
                const result = C._ts_tree_cursor_goto_last_child_wasm(this.tree[0]);
                unmarshalTreeCursor(this);
                return result === 1;
              }
              gotoFirstChildForIndex(goalIndex) {
                marshalTreeCursor(this);
                setValue(TRANSFER_BUFFER + SIZE_OF_CURSOR, goalIndex, "i32");
                const result = C._ts_tree_cursor_goto_first_child_for_index_wasm(this.tree[0]);
                unmarshalTreeCursor(this);
                return result === 1;
              }
              gotoFirstChildForPosition(goalPosition) {
                marshalTreeCursor(this);
                marshalPoint(TRANSFER_BUFFER + SIZE_OF_CURSOR, goalPosition);
                const result = C._ts_tree_cursor_goto_first_child_for_position_wasm(this.tree[0]);
                unmarshalTreeCursor(this);
                return result === 1;
              }
              gotoNextSibling() {
                marshalTreeCursor(this);
                const result = C._ts_tree_cursor_goto_next_sibling_wasm(this.tree[0]);
                unmarshalTreeCursor(this);
                return result === 1;
              }
              gotoPreviousSibling() {
                marshalTreeCursor(this);
                const result = C._ts_tree_cursor_goto_previous_sibling_wasm(this.tree[0]);
                unmarshalTreeCursor(this);
                return result === 1;
              }
              gotoDescendant(goalDescendantindex) {
                marshalTreeCursor(this);
                C._ts_tree_cursor_goto_descendant_wasm(this.tree[0], goalDescendantindex);
                unmarshalTreeCursor(this);
              }
              gotoParent() {
                marshalTreeCursor(this);
                const result = C._ts_tree_cursor_goto_parent_wasm(this.tree[0]);
                unmarshalTreeCursor(this);
                return result === 1;
              }
            }
            class Language {
              constructor(internal, address) {
                assertInternal(internal);
                this[0] = address;
                this.types = new Array(C._ts_language_symbol_count(this[0]));
                for (let i2 = 0, n = this.types.length; i2 < n; i2++) {
                  if (C._ts_language_symbol_type(this[0], i2) < 2) {
                    this.types[i2] = UTF8ToString(C._ts_language_symbol_name(this[0], i2));
                  }
                }
                this.fields = new Array(C._ts_language_field_count(this[0]) + 1);
                for (let i2 = 0, n = this.fields.length; i2 < n; i2++) {
                  const fieldName = C._ts_language_field_name_for_id(this[0], i2);
                  if (fieldName !== 0) {
                    this.fields[i2] = UTF8ToString(fieldName);
                  } else {
                    this.fields[i2] = null;
                  }
                }
              }
              get version() {
                return C._ts_language_version(this[0]);
              }
              get fieldCount() {
                return this.fields.length - 1;
              }
              get stateCount() {
                return C._ts_language_state_count(this[0]);
              }
              fieldIdForName(fieldName) {
                const result = this.fields.indexOf(fieldName);
                if (result !== -1) {
                  return result;
                } else {
                  return null;
                }
              }
              fieldNameForId(fieldId) {
                return this.fields[fieldId] || null;
              }
              idForNodeType(type, named) {
                const typeLength = lengthBytesUTF8(type);
                const typeAddress = C._malloc(typeLength + 1);
                stringToUTF8(type, typeAddress, typeLength + 1);
                const result = C._ts_language_symbol_for_name(this[0], typeAddress, typeLength, named);
                C._free(typeAddress);
                return result || null;
              }
              get nodeTypeCount() {
                return C._ts_language_symbol_count(this[0]);
              }
              nodeTypeForId(typeId) {
                const name2 = C._ts_language_symbol_name(this[0], typeId);
                return name2 ? UTF8ToString(name2) : null;
              }
              nodeTypeIsNamed(typeId) {
                return C._ts_language_type_is_named_wasm(this[0], typeId) ? true : false;
              }
              nodeTypeIsVisible(typeId) {
                return C._ts_language_type_is_visible_wasm(this[0], typeId) ? true : false;
              }
              nextState(stateId, typeId) {
                return C._ts_language_next_state(this[0], stateId, typeId);
              }
              lookaheadIterator(stateId) {
                const address = C._ts_lookahead_iterator_new(this[0], stateId);
                if (address) return new LookaheadIterable(INTERNAL, address, this);
                return null;
              }
              query(source) {
                const sourceLength = lengthBytesUTF8(source);
                const sourceAddress = C._malloc(sourceLength + 1);
                stringToUTF8(source, sourceAddress, sourceLength + 1);
                const address = C._ts_query_new(this[0], sourceAddress, sourceLength, TRANSFER_BUFFER, TRANSFER_BUFFER + SIZE_OF_INT);
                if (!address) {
                  const errorId = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
                  const errorByte = getValue(TRANSFER_BUFFER, "i32");
                  const errorIndex = UTF8ToString(sourceAddress, errorByte).length;
                  const suffix = source.substr(errorIndex, 100).split("\n")[0];
                  let word = suffix.match(QUERY_WORD_REGEX)[0];
                  let error;
                  switch (errorId) {
                    case 2:
                      error = new RangeError(`Bad node name '${word}'`);
                      break;
                    case 3:
                      error = new RangeError(`Bad field name '${word}'`);
                      break;
                    case 4:
                      error = new RangeError(`Bad capture name @${word}`);
                      break;
                    case 5:
                      error = new TypeError(`Bad pattern structure at offset ${errorIndex}: '${suffix}'...`);
                      word = "";
                      break;
                    default:
                      error = new SyntaxError(`Bad syntax at offset ${errorIndex}: '${suffix}'...`);
                      word = "";
                      break;
                  }
                  error.index = errorIndex;
                  error.length = word.length;
                  C._free(sourceAddress);
                  throw error;
                }
                const stringCount = C._ts_query_string_count(address);
                const captureCount = C._ts_query_capture_count(address);
                const patternCount = C._ts_query_pattern_count(address);
                const captureNames = new Array(captureCount);
                const stringValues = new Array(stringCount);
                for (let i2 = 0; i2 < captureCount; i2++) {
                  const nameAddress = C._ts_query_capture_name_for_id(address, i2, TRANSFER_BUFFER);
                  const nameLength = getValue(TRANSFER_BUFFER, "i32");
                  captureNames[i2] = UTF8ToString(nameAddress, nameLength);
                }
                for (let i2 = 0; i2 < stringCount; i2++) {
                  const valueAddress = C._ts_query_string_value_for_id(address, i2, TRANSFER_BUFFER);
                  const nameLength = getValue(TRANSFER_BUFFER, "i32");
                  stringValues[i2] = UTF8ToString(valueAddress, nameLength);
                }
                const setProperties = new Array(patternCount);
                const assertedProperties = new Array(patternCount);
                const refutedProperties = new Array(patternCount);
                const predicates = new Array(patternCount);
                const textPredicates = new Array(patternCount);
                for (let i2 = 0; i2 < patternCount; i2++) {
                  const predicatesAddress = C._ts_query_predicates_for_pattern(address, i2, TRANSFER_BUFFER);
                  const stepCount = getValue(TRANSFER_BUFFER, "i32");
                  predicates[i2] = [];
                  textPredicates[i2] = [];
                  const steps = [];
                  let stepAddress = predicatesAddress;
                  for (let j = 0; j < stepCount; j++) {
                    const stepType = getValue(stepAddress, "i32");
                    stepAddress += SIZE_OF_INT;
                    const stepValueId = getValue(stepAddress, "i32");
                    stepAddress += SIZE_OF_INT;
                    if (stepType === PREDICATE_STEP_TYPE_CAPTURE) {
                      steps.push({
                        type: "capture",
                        name: captureNames[stepValueId]
                      });
                    } else if (stepType === PREDICATE_STEP_TYPE_STRING) {
                      steps.push({
                        type: "string",
                        value: stringValues[stepValueId]
                      });
                    } else if (steps.length > 0) {
                      if (steps[0].type !== "string") {
                        throw new Error("Predicates must begin with a literal value");
                      }
                      const operator = steps[0].value;
                      let isPositive = true;
                      let matchAll = true;
                      let captureName;
                      switch (operator) {
                        case "any-not-eq?":
                        case "not-eq?":
                          isPositive = false;
                        case "any-eq?":
                        case "eq?":
                          if (steps.length !== 3) {
                            throw new Error(`Wrong number of arguments to \`#${operator}\` predicate. Expected 2, got ${steps.length - 1}`);
                          }
                          if (steps[1].type !== "capture") {
                            throw new Error(`First argument of \`#${operator}\` predicate must be a capture. Got "${steps[1].value}"`);
                          }
                          matchAll = !operator.startsWith("any-");
                          if (steps[2].type === "capture") {
                            const captureName1 = steps[1].name;
                            const captureName2 = steps[2].name;
                            textPredicates[i2].push((captures) => {
                              const nodes1 = [];
                              const nodes2 = [];
                              for (const c of captures) {
                                if (c.name === captureName1) nodes1.push(c.node);
                                if (c.name === captureName2) nodes2.push(c.node);
                              }
                              const compare = (n1, n2, positive) => positive ? n1.text === n2.text : n1.text !== n2.text;
                              return matchAll ? nodes1.every((n1) => nodes2.some((n2) => compare(n1, n2, isPositive))) : nodes1.some((n1) => nodes2.some((n2) => compare(n1, n2, isPositive)));
                            });
                          } else {
                            captureName = steps[1].name;
                            const stringValue = steps[2].value;
                            const matches = (n) => n.text === stringValue;
                            const doesNotMatch = (n) => n.text !== stringValue;
                            textPredicates[i2].push((captures) => {
                              const nodes = [];
                              for (const c of captures) {
                                if (c.name === captureName) nodes.push(c.node);
                              }
                              const test = isPositive ? matches : doesNotMatch;
                              return matchAll ? nodes.every(test) : nodes.some(test);
                            });
                          }
                          break;
                        case "any-not-match?":
                        case "not-match?":
                          isPositive = false;
                        case "any-match?":
                        case "match?":
                          if (steps.length !== 3) {
                            throw new Error(`Wrong number of arguments to \`#${operator}\` predicate. Expected 2, got ${steps.length - 1}.`);
                          }
                          if (steps[1].type !== "capture") {
                            throw new Error(`First argument of \`#${operator}\` predicate must be a capture. Got "${steps[1].value}".`);
                          }
                          if (steps[2].type !== "string") {
                            throw new Error(`Second argument of \`#${operator}\` predicate must be a string. Got @${steps[2].value}.`);
                          }
                          captureName = steps[1].name;
                          const regex = new RegExp(steps[2].value);
                          matchAll = !operator.startsWith("any-");
                          textPredicates[i2].push((captures) => {
                            const nodes = [];
                            for (const c of captures) {
                              if (c.name === captureName) nodes.push(c.node.text);
                            }
                            const test = (text, positive) => positive ? regex.test(text) : !regex.test(text);
                            if (nodes.length === 0) return !isPositive;
                            return matchAll ? nodes.every((text) => test(text, isPositive)) : nodes.some((text) => test(text, isPositive));
                          });
                          break;
                        case "set!":
                          if (steps.length < 2 || steps.length > 3) {
                            throw new Error(`Wrong number of arguments to \`#set!\` predicate. Expected 1 or 2. Got ${steps.length - 1}.`);
                          }
                          if (steps.some((s) => s.type !== "string")) {
                            throw new Error(`Arguments to \`#set!\` predicate must be a strings.".`);
                          }
                          if (!setProperties[i2]) setProperties[i2] = {};
                          setProperties[i2][steps[1].value] = steps[2] ? steps[2].value : null;
                          break;
                        case "is?":
                        case "is-not?":
                          if (steps.length < 2 || steps.length > 3) {
                            throw new Error(`Wrong number of arguments to \`#${operator}\` predicate. Expected 1 or 2. Got ${steps.length - 1}.`);
                          }
                          if (steps.some((s) => s.type !== "string")) {
                            throw new Error(`Arguments to \`#${operator}\` predicate must be a strings.".`);
                          }
                          const properties = operator === "is?" ? assertedProperties : refutedProperties;
                          if (!properties[i2]) properties[i2] = {};
                          properties[i2][steps[1].value] = steps[2] ? steps[2].value : null;
                          break;
                        case "not-any-of?":
                          isPositive = false;
                        case "any-of?":
                          if (steps.length < 2) {
                            throw new Error(`Wrong number of arguments to \`#${operator}\` predicate. Expected at least 1. Got ${steps.length - 1}.`);
                          }
                          if (steps[1].type !== "capture") {
                            throw new Error(`First argument of \`#${operator}\` predicate must be a capture. Got "${steps[1].value}".`);
                          }
                          for (let i3 = 2; i3 < steps.length; i3++) {
                            if (steps[i3].type !== "string") {
                              throw new Error(`Arguments to \`#${operator}\` predicate must be a strings.".`);
                            }
                          }
                          captureName = steps[1].name;
                          const values = steps.slice(2).map((s) => s.value);
                          textPredicates[i2].push((captures) => {
                            const nodes = [];
                            for (const c of captures) {
                              if (c.name === captureName) nodes.push(c.node.text);
                            }
                            if (nodes.length === 0) return !isPositive;
                            return nodes.every((text) => values.includes(text)) === isPositive;
                          });
                          break;
                        default:
                          predicates[i2].push({
                            operator,
                            operands: steps.slice(1)
                          });
                      }
                      steps.length = 0;
                    }
                  }
                  Object.freeze(setProperties[i2]);
                  Object.freeze(assertedProperties[i2]);
                  Object.freeze(refutedProperties[i2]);
                }
                C._free(sourceAddress);
                return new Query(INTERNAL, address, captureNames, textPredicates, predicates, Object.freeze(setProperties), Object.freeze(assertedProperties), Object.freeze(refutedProperties));
              }
              static load(input) {
                let bytes;
                if (input instanceof Uint8Array) {
                  bytes = Promise.resolve(input);
                } else {
                  const url = input;
                  if (typeof process !== "undefined" && process.versions && process.versions.node) {
                    const fs2 = require("fs");
                    bytes = Promise.resolve(fs2.readFileSync(url));
                  } else {
                    bytes = fetch(url).then((response) => response.arrayBuffer().then((buffer) => {
                      if (response.ok) {
                        return new Uint8Array(buffer);
                      } else {
                        const body2 = new TextDecoder("utf-8").decode(buffer);
                        throw new Error(`Language.load failed with status ${response.status}.

${body2}`);
                      }
                    }));
                  }
                }
                return bytes.then((bytes2) => loadWebAssemblyModule(bytes2, {
                  loadAsync: true
                })).then((mod) => {
                  const symbolNames = Object.keys(mod);
                  const functionName = symbolNames.find((key) => LANGUAGE_FUNCTION_REGEX.test(key) && !key.includes("external_scanner_"));
                  if (!functionName) {
                    console.log(`Couldn't find language function in WASM file. Symbols:
${JSON.stringify(symbolNames, null, 2)}`);
                  }
                  const languageAddress = mod[functionName]();
                  return new Language(INTERNAL, languageAddress);
                });
              }
            }
            class LookaheadIterable {
              constructor(internal, address, language2) {
                assertInternal(internal);
                this[0] = address;
                this.language = language2;
              }
              get currentTypeId() {
                return C._ts_lookahead_iterator_current_symbol(this[0]);
              }
              get currentType() {
                return this.language.types[this.currentTypeId] || "ERROR";
              }
              delete() {
                C._ts_lookahead_iterator_delete(this[0]);
                this[0] = 0;
              }
              resetState(stateId) {
                return C._ts_lookahead_iterator_reset_state(this[0], stateId);
              }
              reset(language2, stateId) {
                if (C._ts_lookahead_iterator_reset(this[0], language2[0], stateId)) {
                  this.language = language2;
                  return true;
                }
                return false;
              }
              [Symbol.iterator]() {
                const self2 = this;
                return {
                  next() {
                    if (C._ts_lookahead_iterator_next(self2[0])) {
                      return {
                        done: false,
                        value: self2.currentType
                      };
                    }
                    return {
                      done: true,
                      value: ""
                    };
                  }
                };
              }
            }
            class Query {
              constructor(internal, address, captureNames, textPredicates, predicates, setProperties, assertedProperties, refutedProperties) {
                assertInternal(internal);
                this[0] = address;
                this.captureNames = captureNames;
                this.textPredicates = textPredicates;
                this.predicates = predicates;
                this.setProperties = setProperties;
                this.assertedProperties = assertedProperties;
                this.refutedProperties = refutedProperties;
                this.exceededMatchLimit = false;
              }
              delete() {
                C._ts_query_delete(this[0]);
                this[0] = 0;
              }
              matches(node, { startPosition = ZERO_POINT, endPosition = ZERO_POINT, startIndex = 0, endIndex = 0, matchLimit = 4294967295, maxStartDepth = 4294967295 } = {}) {
                if (typeof matchLimit !== "number") {
                  throw new Error("Arguments must be numbers");
                }
                marshalNode(node);
                C._ts_query_matches_wasm(this[0], node.tree[0], startPosition.row, startPosition.column, endPosition.row, endPosition.column, startIndex, endIndex, matchLimit, maxStartDepth);
                const rawCount = getValue(TRANSFER_BUFFER, "i32");
                const startAddress = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
                const didExceedMatchLimit = getValue(TRANSFER_BUFFER + 2 * SIZE_OF_INT, "i32");
                const result = new Array(rawCount);
                this.exceededMatchLimit = Boolean(didExceedMatchLimit);
                let filteredCount = 0;
                let address = startAddress;
                for (let i2 = 0; i2 < rawCount; i2++) {
                  const pattern = getValue(address, "i32");
                  address += SIZE_OF_INT;
                  const captureCount = getValue(address, "i32");
                  address += SIZE_OF_INT;
                  const captures = new Array(captureCount);
                  address = unmarshalCaptures(this, node.tree, address, captures);
                  if (this.textPredicates[pattern].every((p) => p(captures))) {
                    result[filteredCount] = {
                      pattern,
                      captures
                    };
                    const setProperties = this.setProperties[pattern];
                    if (setProperties) result[filteredCount].setProperties = setProperties;
                    const assertedProperties = this.assertedProperties[pattern];
                    if (assertedProperties) result[filteredCount].assertedProperties = assertedProperties;
                    const refutedProperties = this.refutedProperties[pattern];
                    if (refutedProperties) result[filteredCount].refutedProperties = refutedProperties;
                    filteredCount++;
                  }
                }
                result.length = filteredCount;
                C._free(startAddress);
                return result;
              }
              captures(node, { startPosition = ZERO_POINT, endPosition = ZERO_POINT, startIndex = 0, endIndex = 0, matchLimit = 4294967295, maxStartDepth = 4294967295 } = {}) {
                if (typeof matchLimit !== "number") {
                  throw new Error("Arguments must be numbers");
                }
                marshalNode(node);
                C._ts_query_captures_wasm(this[0], node.tree[0], startPosition.row, startPosition.column, endPosition.row, endPosition.column, startIndex, endIndex, matchLimit, maxStartDepth);
                const count = getValue(TRANSFER_BUFFER, "i32");
                const startAddress = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
                const didExceedMatchLimit = getValue(TRANSFER_BUFFER + 2 * SIZE_OF_INT, "i32");
                const result = [];
                this.exceededMatchLimit = Boolean(didExceedMatchLimit);
                const captures = [];
                let address = startAddress;
                for (let i2 = 0; i2 < count; i2++) {
                  const pattern = getValue(address, "i32");
                  address += SIZE_OF_INT;
                  const captureCount = getValue(address, "i32");
                  address += SIZE_OF_INT;
                  const captureIndex = getValue(address, "i32");
                  address += SIZE_OF_INT;
                  captures.length = captureCount;
                  address = unmarshalCaptures(this, node.tree, address, captures);
                  if (this.textPredicates[pattern].every((p) => p(captures))) {
                    const capture = captures[captureIndex];
                    const setProperties = this.setProperties[pattern];
                    if (setProperties) capture.setProperties = setProperties;
                    const assertedProperties = this.assertedProperties[pattern];
                    if (assertedProperties) capture.assertedProperties = assertedProperties;
                    const refutedProperties = this.refutedProperties[pattern];
                    if (refutedProperties) capture.refutedProperties = refutedProperties;
                    result.push(capture);
                  }
                }
                C._free(startAddress);
                return result;
              }
              predicatesForPattern(patternIndex) {
                return this.predicates[patternIndex];
              }
              disableCapture(captureName) {
                const captureNameLength = lengthBytesUTF8(captureName);
                const captureNameAddress = C._malloc(captureNameLength + 1);
                stringToUTF8(captureName, captureNameAddress, captureNameLength + 1);
                C._ts_query_disable_capture(this[0], captureNameAddress, captureNameLength);
                C._free(captureNameAddress);
              }
              didExceedMatchLimit() {
                return this.exceededMatchLimit;
              }
            }
            function getText(tree, startIndex, endIndex) {
              const length = endIndex - startIndex;
              let result = tree.textCallback(startIndex, null, endIndex);
              startIndex += result.length;
              while (startIndex < endIndex) {
                const string = tree.textCallback(startIndex, null, endIndex);
                if (string && string.length > 0) {
                  startIndex += string.length;
                  result += string;
                } else {
                  break;
                }
              }
              if (startIndex > endIndex) {
                result = result.slice(0, length);
              }
              return result;
            }
            function unmarshalCaptures(query, tree, address, result) {
              for (let i2 = 0, n = result.length; i2 < n; i2++) {
                const captureIndex = getValue(address, "i32");
                address += SIZE_OF_INT;
                const node = unmarshalNode(tree, address);
                address += SIZE_OF_NODE;
                result[i2] = {
                  name: query.captureNames[captureIndex],
                  node
                };
              }
              return address;
            }
            function assertInternal(x) {
              if (x !== INTERNAL) throw new Error("Illegal constructor");
            }
            function isPoint(point) {
              return point && typeof point.row === "number" && typeof point.column === "number";
            }
            function marshalNode(node) {
              let address = TRANSFER_BUFFER;
              setValue(address, node.id, "i32");
              address += SIZE_OF_INT;
              setValue(address, node.startIndex, "i32");
              address += SIZE_OF_INT;
              setValue(address, node.startPosition.row, "i32");
              address += SIZE_OF_INT;
              setValue(address, node.startPosition.column, "i32");
              address += SIZE_OF_INT;
              setValue(address, node[0], "i32");
            }
            function unmarshalNode(tree, address = TRANSFER_BUFFER) {
              const id = getValue(address, "i32");
              address += SIZE_OF_INT;
              if (id === 0) return null;
              const index = getValue(address, "i32");
              address += SIZE_OF_INT;
              const row = getValue(address, "i32");
              address += SIZE_OF_INT;
              const column = getValue(address, "i32");
              address += SIZE_OF_INT;
              const other = getValue(address, "i32");
              const result = new Node(INTERNAL, tree);
              result.id = id;
              result.startIndex = index;
              result.startPosition = {
                row,
                column
              };
              result[0] = other;
              return result;
            }
            function marshalTreeCursor(cursor, address = TRANSFER_BUFFER) {
              setValue(address + 0 * SIZE_OF_INT, cursor[0], "i32");
              setValue(address + 1 * SIZE_OF_INT, cursor[1], "i32");
              setValue(address + 2 * SIZE_OF_INT, cursor[2], "i32");
              setValue(address + 3 * SIZE_OF_INT, cursor[3], "i32");
            }
            function unmarshalTreeCursor(cursor) {
              cursor[0] = getValue(TRANSFER_BUFFER + 0 * SIZE_OF_INT, "i32");
              cursor[1] = getValue(TRANSFER_BUFFER + 1 * SIZE_OF_INT, "i32");
              cursor[2] = getValue(TRANSFER_BUFFER + 2 * SIZE_OF_INT, "i32");
              cursor[3] = getValue(TRANSFER_BUFFER + 3 * SIZE_OF_INT, "i32");
            }
            function marshalPoint(address, point) {
              setValue(address, point.row, "i32");
              setValue(address + SIZE_OF_INT, point.column, "i32");
            }
            function unmarshalPoint(address) {
              const result = {
                row: getValue(address, "i32") >>> 0,
                column: getValue(address + SIZE_OF_INT, "i32") >>> 0
              };
              return result;
            }
            function marshalRange(address, range) {
              marshalPoint(address, range.startPosition);
              address += SIZE_OF_POINT;
              marshalPoint(address, range.endPosition);
              address += SIZE_OF_POINT;
              setValue(address, range.startIndex, "i32");
              address += SIZE_OF_INT;
              setValue(address, range.endIndex, "i32");
              address += SIZE_OF_INT;
            }
            function unmarshalRange(address) {
              const result = {};
              result.startPosition = unmarshalPoint(address);
              address += SIZE_OF_POINT;
              result.endPosition = unmarshalPoint(address);
              address += SIZE_OF_POINT;
              result.startIndex = getValue(address, "i32") >>> 0;
              address += SIZE_OF_INT;
              result.endIndex = getValue(address, "i32") >>> 0;
              return result;
            }
            function marshalEdit(edit) {
              let address = TRANSFER_BUFFER;
              marshalPoint(address, edit.startPosition);
              address += SIZE_OF_POINT;
              marshalPoint(address, edit.oldEndPosition);
              address += SIZE_OF_POINT;
              marshalPoint(address, edit.newEndPosition);
              address += SIZE_OF_POINT;
              setValue(address, edit.startIndex, "i32");
              address += SIZE_OF_INT;
              setValue(address, edit.oldEndIndex, "i32");
              address += SIZE_OF_INT;
              setValue(address, edit.newEndIndex, "i32");
              address += SIZE_OF_INT;
            }
            for (const name2 of Object.getOwnPropertyNames(ParserImpl.prototype)) {
              Object.defineProperty(Parser.prototype, name2, {
                value: ParserImpl.prototype[name2],
                enumerable: false,
                writable: false
              });
            }
            Parser.Language = Language;
            Module.onRuntimeInitialized = () => {
              ParserImpl.init();
              resolveInitPromise();
            };
          });
        }
      }
      return Parser;
    })();
    if (typeof exports === "object") {
      module.exports = TreeSitter;
    }
  }
});

// src/platform/parser/node/parserWorker.ts
var import_worker_threads = require("worker_threads");

// src/platform/parser/node/parserImpl.ts
var parserImpl_exports = {};
__export(parserImpl_exports, {
  _dispose: () => _dispose,
  _findLastTest: () => _findLastTest,
  _getCallExpressions: () => _getCallExpressions,
  _getClassDeclarations: () => _getClassDeclarations,
  _getClassReferences: () => _getClassReferences,
  _getCoarseParentScope: () => _getCoarseParentScope,
  _getDocumentableNodeIfOnIdentifier: () => _getDocumentableNodeIfOnIdentifier,
  _getFineScopes: () => _getFineScopes,
  _getFixSelectionOfInterest: () => _getFixSelectionOfInterest,
  _getFunctionBodies: () => _getFunctionBodies,
  _getFunctionDefinitions: () => _getFunctionDefinitions,
  _getNodeMatchingSelection: () => _getNodeMatchingSelection,
  _getNodeToDocument: () => _getNodeToDocument,
  _getNodeToExplain: () => _getNodeToExplain,
  _getParseErrorCount: () => _getParseErrorCount,
  _getSemanticChunkNames: () => _getSemanticChunkNames,
  _getSemanticChunkTree: () => _getSemanticChunkTree,
  _getStructure: () => _getStructure,
  _getSymbols: () => _getSymbols,
  _getTypeDeclarations: () => _getTypeDeclarations,
  _getTypeReferences: () => _getTypeReferences,
  getBlockNameTree: () => getBlockNameTree
});

// src/util/common/arrays.ts
function findInsertionIndexInSortedArray(array, value, isBeforeFunction) {
  let low = 0;
  let high = array.length;
  while (low < high) {
    const mid = low + high >>> 1;
    if (isBeforeFunction(array[mid], value)) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}
function max(arr, compare) {
  if (arr.length === 0) {
    return void 0;
  }
  let maxElement = arr[0];
  for (let i2 = 1; i2 < arr.length; i2++) {
    const currentElement = arr[i2];
    if (compare(currentElement, maxElement) > 0) {
      maxElement = currentElement;
    }
  }
  return maxElement;
}

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
  static fromError(err2) {
    if (err2 instanceof _ErrorNoTelemetry) {
      return err2;
    }
    const result = new _ErrorNoTelemetry();
    result.message = err2.message;
    result.stack = err2.stack;
    return result;
  }
  static isErrorNoTelemetry(err2) {
    return err2.name === "CodeExpectedError";
  }
};
var BugIndicatingError = class _BugIndicatingError extends Error {
  constructor(message) {
    super(message || "An unexpected bug occurred.");
    Object.setPrototypeOf(this, _BugIndicatingError.prototype);
  }
};

// src/platform/parser/node/nodes.ts
var TreeSitterOffsetRange = {
  /** check if `container` contains `containee` (non-strict, ie [0, 3] contains [0, 3] */
  doesContain: (container, containee) => container.startIndex <= containee.startIndex && containee.endIndex <= container.endIndex,
  ofSyntaxNode: (n) => ({ startIndex: n.startIndex, endIndex: n.endIndex }),
  /** sort by `node.startIndex`, break ties by `node.endIndex` (so that nodes with same start index are sorted in descending order) */
  compare: (a, b) => a.startIndex - b.startIndex || b.endIndex - a.endIndex,
  isEqual: (a, b) => TreeSitterOffsetRange.compare(a, b) === 0,
  doIntersect: (a, b) => {
    const start2 = Math.max(a.startIndex, b.startIndex);
    const end = Math.min(a.endIndex, b.endIndex);
    return start2 < end;
  },
  len: (n) => n.endIndex - n.startIndex,
  /** Given offset ranges [a0, a1] and [b0, b1], returns overlap size */
  intersectionSize: (a, b) => {
    const start2 = Math.max(a.startIndex, b.startIndex);
    const end = Math.min(a.endIndex, b.endIndex);
    return Math.max(end - start2, 0);
  },
  /** Check the given object extends TreeSitterOffsetRange  */
  isTreeSitterOffsetRange(obj) {
    return typeof obj.startIndex === "number" && typeof obj.endIndex === "number";
  }
};
var TreeSitterPoint = {
  isEqual(n, other) {
    return n.row === other.row && n.column === other.column;
  },
  isBefore(n, other) {
    if (n.row < other.row || n.row === other.row && n.column < other.column) {
      return true;
    }
    return false;
  },
  isAfter(n, other) {
    return TreeSitterPoint.isBefore(other, n);
  },
  isBeforeOrEqual(n, other) {
    const isBefore = TreeSitterPoint.isBefore(n, other);
    const isEqual = TreeSitterPoint.isEqual(n, other);
    if (isBefore || isEqual) {
      return true;
    }
    return false;
  },
  equals(n, other) {
    return n.column === other.column && n.row === other.row;
  },
  isAfterOrEqual(n, other) {
    return TreeSitterPoint.isBeforeOrEqual(other, n);
  },
  ofPoint: (n) => ({
    row: n.row,
    column: n.column
  })
};
var TreeSitterPointRange = {
  /** check if `container` contains `containee` (non-strict) */
  doesContain: (container, containee) => {
    return TreeSitterPoint.isBeforeOrEqual(container.startPosition, containee.startPosition) && TreeSitterPoint.isAfterOrEqual(container.endPosition, containee.endPosition);
  },
  equals: (a, b) => {
    return TreeSitterPoint.equals(a.startPosition, b.startPosition) && TreeSitterPoint.equals(a.endPosition, b.endPosition);
  },
  ofSyntaxNode: (n) => ({
    startPosition: n.startPosition,
    endPosition: n.endPosition
  })
};
var Node2 = {
  ofSyntaxNode: (n) => ({
    type: n.type,
    startIndex: n.startIndex,
    endIndex: n.endIndex
  })
};
var TreeSitterChunkHeaderInfo = {
  ofSyntaxNode: (n) => ({
    range: TreeSitterPointRange.ofSyntaxNode(n),
    startIndex: n.startIndex,
    text: n.text,
    endIndex: n.endIndex
  })
};
var OverlayNode = class {
  constructor(startIndex, endIndex, kind, children) {
    this.startIndex = startIndex;
    this.endIndex = endIndex;
    this.kind = kind;
    this.children = children;
    if (startIndex > endIndex) {
      throw new BugIndicatingError("startIndex must be less than endIndex");
    }
    let minStartIndex = startIndex;
    for (const child of children) {
      if (child.startIndex < minStartIndex) {
        throw new BugIndicatingError("Invalid child startIndex");
      }
      if (child.endIndex > endIndex) {
        throw new BugIndicatingError("Invalid child endIndex");
      }
      minStartIndex = Math.max(child.endIndex, minStartIndex);
    }
  }
  toString() {
    const printedNodes = [];
    function toString(node, indent = "") {
      printedNodes.push(`${indent}${node.kind} [${node.startIndex}, ${node.endIndex}]`);
      node.children.forEach((child) => toString(child, indent + "    "));
    }
    toString(this);
    return printedNodes.join("\n");
  }
};

// src/platform/parser/node/chunkGroupTypes.ts
var QueryMatchTree = class {
  /**
   * @remark mutates the passed `groups`
   */
  constructor(groups, syntaxTreeRoot) {
    this.syntaxTreeRoot = syntaxTreeRoot;
    this.roots = [];
    this.formTree(groups);
  }
  /**
   * This assumes that overlapping blocks imply that one fully overlaps another.
   * Runs with the same assumptions as `removeOverlapping`.
   * @param groups to use as node content in the tree
   */
  formTree(groups) {
    groups.sort((a, b) => a.mainBlock.startIndex - b.mainBlock.startIndex || a.mainBlock.endIndex - b.mainBlock.endIndex);
    const recentParentStack = [];
    const peekParent = () => {
      return recentParentStack[recentParentStack.length - 1];
    };
    const hasEqualRange = (a, b) => {
      return a.mainBlock.startIndex === b.mainBlock.startIndex && a.mainBlock.endIndex === b.mainBlock.endIndex;
    };
    for (const group of groups) {
      const matchNode = {
        info: group,
        children: []
      };
      let currParent = peekParent();
      if (!currParent) {
        this.roots.push(matchNode);
        recentParentStack.push(matchNode);
        continue;
      }
      if (hasEqualRange(currParent.info, group)) {
        continue;
      }
      while (currParent && !TreeSitterOffsetRange.doesContain(currParent.info.mainBlock, group.mainBlock)) {
        recentParentStack.pop();
        currParent = peekParent();
      }
      if (currParent) {
        currParent.children.push(matchNode);
      } else {
        this.roots.push(matchNode);
      }
      recentParentStack.push(matchNode);
    }
  }
};

// src/util/common/cache.ts
var Node3 = class {
  constructor(key, value) {
    this.prev = null;
    this.next = null;
    this.key = key;
    this.value = value;
  }
};
var LRUCache = class {
  constructor(size = 10) {
    if (size < 1) {
      throw new Error("Cache size must be at least 1");
    }
    this._capacity = size;
    this._cache = /* @__PURE__ */ new Map();
    this._head = new Node3("", null);
    this._tail = new Node3("", null);
    this._head.next = this._tail;
    this._tail.prev = this._head;
  }
  _addNode(node) {
    node.prev = this._head;
    node.next = this._head.next;
    this._head.next.prev = node;
    this._head.next = node;
  }
  _removeNode(node) {
    const prev = node.prev;
    const next = node.next;
    prev.next = next;
    next.prev = prev;
  }
  _moveToHead(node) {
    this._removeNode(node);
    this._addNode(node);
  }
  _popTail() {
    const res = this._tail.prev;
    this._removeNode(res);
    return res;
  }
  clear() {
    this._cache.clear();
    this._head.next = this._tail;
    this._tail.prev = this._head;
  }
  /**
   * Deletes the cache entry for the given key, if it exists.
   * @param key The key of the cache entry to delete.
   * @returns The value of the deleted cache entry, or undefined if the key was not found.
   */
  deleteKey(key) {
    const node = this._cache.get(key);
    if (!node) {
      return void 0;
    }
    this._removeNode(node);
    this._cache.delete(key);
    return node.value;
  }
  get(key) {
    const node = this._cache.get(key);
    if (!node) {
      return void 0;
    }
    this._moveToHead(node);
    return node.value;
  }
  /**
   * Return a copy of all the keys stored in the LRU cache, in LRU order.
   *
   * The returned array is safe to modify, as this call allocates a copy of a
   * private array used to represent those keys.
   */
  keys() {
    const keys = [];
    let current = this._head.next;
    while (current !== this._tail) {
      keys.push(current.key);
      current = current.next;
    }
    return keys;
  }
  getValues() {
    const values = [];
    let current = this._head.next;
    while (current !== this._tail) {
      values.push(current.value);
      current = current.next;
    }
    return values;
  }
  /** @returns the evicted [key, value]  */
  put(key, value) {
    let node = this._cache.get(key);
    if (node) {
      node.value = value;
      this._moveToHead(node);
    } else {
      node = new Node3(key, value);
      this._cache.set(key, node);
      this._addNode(node);
      if (this._cache.size > this._capacity) {
        const tail = this._popTail();
        this._cache.delete(tail.key);
        return [tail.key, tail.value];
      }
    }
  }
  entries() {
    const entries = [];
    let current = this._head.next;
    while (current !== this._tail) {
      entries.push([current.key, current.value]);
      current = current.next;
    }
    return entries;
  }
};
var DisposablesLRUCache = class {
  constructor(size) {
    this.actual = new LRUCache(size);
  }
  dispose() {
    this.clear();
  }
  clear() {
    const values = this.actual.getValues();
    for (const value of values) {
      value.dispose();
    }
    this.actual.clear();
  }
  deleteKey(key) {
    const value = this.actual.deleteKey(key);
    if (value) {
      value.dispose();
    }
  }
  get(key) {
    return this.actual.get(key);
  }
  keys() {
    return this.actual.keys();
  }
  getValues() {
    return this.actual.getValues();
  }
  put(key, value) {
    const evicted = this.actual.put(key, value);
    if (evicted) {
      evicted[1].dispose();
    }
  }
};

// src/util/vs/nls.ts
function getNLSLanguage() {
  return globalThis._VSCODE_NLS_LANGUAGE;
}
var isPseudo = getNLSLanguage() === "pseudo" || typeof document !== "undefined" && document.location && typeof document.location.hash === "string" && document.location.hash.indexOf("pseudo=true") >= 0;

// src/util/vs/base/common/platform.ts
var LANGUAGE_DEFAULT = "en";
var _isWindows = false;
var _isMacintosh = false;
var _isLinux = false;
var _isLinuxSnap = false;
var _isNative = false;
var _isWeb = false;
var _isElectron = false;
var _isIOS = false;
var _isCI = false;
var _isMobile = false;
var _locale = void 0;
var _language = LANGUAGE_DEFAULT;
var _platformLocale = LANGUAGE_DEFAULT;
var _translationsConfigFile = void 0;
var _userAgent = void 0;
var $globalThis = globalThis;
var nodeProcess = void 0;
if (typeof $globalThis.vscode !== "undefined" && typeof $globalThis.vscode.process !== "undefined") {
  nodeProcess = $globalThis.vscode.process;
} else if (typeof process !== "undefined" && typeof process?.versions?.node === "string") {
  nodeProcess = process;
}
var isElectronProcess = typeof nodeProcess?.versions?.electron === "string";
var isElectronRenderer = isElectronProcess && nodeProcess?.type === "renderer";
if (typeof nodeProcess === "object") {
  _isWindows = nodeProcess.platform === "win32";
  _isMacintosh = nodeProcess.platform === "darwin";
  _isLinux = nodeProcess.platform === "linux";
  _isLinuxSnap = _isLinux && !!nodeProcess.env["SNAP"] && !!nodeProcess.env["SNAP_REVISION"];
  _isElectron = isElectronProcess;
  _isCI = !!nodeProcess.env["CI"] || !!nodeProcess.env["BUILD_ARTIFACTSTAGINGDIRECTORY"] || !!nodeProcess.env["GITHUB_WORKSPACE"];
  _locale = LANGUAGE_DEFAULT;
  _language = LANGUAGE_DEFAULT;
  const rawNlsConfig = nodeProcess.env["VSCODE_NLS_CONFIG"];
  if (rawNlsConfig) {
    try {
      const nlsConfig = JSON.parse(rawNlsConfig);
      _locale = nlsConfig.userLocale;
      _platformLocale = nlsConfig.osLocale;
      _language = nlsConfig.resolvedLanguage || LANGUAGE_DEFAULT;
      _translationsConfigFile = nlsConfig.languagePack?.translationsConfigFile;
    } catch (e) {
    }
  }
  _isNative = true;
} else if (typeof navigator === "object" && !isElectronRenderer) {
  _userAgent = navigator.userAgent;
  _isWindows = _userAgent.indexOf("Windows") >= 0;
  _isMacintosh = _userAgent.indexOf("Macintosh") >= 0;
  _isIOS = (_userAgent.indexOf("Macintosh") >= 0 || _userAgent.indexOf("iPad") >= 0 || _userAgent.indexOf("iPhone") >= 0) && !!navigator.maxTouchPoints && navigator.maxTouchPoints > 0;
  _isLinux = _userAgent.indexOf("Linux") >= 0;
  _isMobile = _userAgent?.indexOf("Mobi") >= 0;
  _isWeb = true;
  _language = getNLSLanguage() || LANGUAGE_DEFAULT;
  _locale = navigator.language.toLowerCase();
  _platformLocale = _locale;
} else {
  console.error("Unable to resolve platform.");
}
var _platform = 0 /* Web */;
if (_isMacintosh) {
  _platform = 1 /* Mac */;
} else if (_isWindows) {
  _platform = 3 /* Windows */;
} else if (_isLinux) {
  _platform = 2 /* Linux */;
}
var isWindows = _isWindows;
var isMacintosh = _isMacintosh;
var isWebWorker = _isWeb && typeof $globalThis.importScripts === "function";
var webWorkerOrigin = isWebWorker ? $globalThis.origin : void 0;
var userAgent = _userAgent;
var language = _language;
var Language2;
((Language3) => {
  function value() {
    return language;
  }
  Language3.value = value;
  function isDefaultVariant() {
    if (language.length === 2) {
      return language === "en";
    } else if (language.length >= 3) {
      return language[0] === "e" && language[1] === "n" && language[2] === "-";
    } else {
      return false;
    }
  }
  Language3.isDefaultVariant = isDefaultVariant;
  function isDefault() {
    return language === "en";
  }
  Language3.isDefault = isDefault;
})(Language2 || (Language2 = {}));
var setTimeout0IsFaster = typeof $globalThis.postMessage === "function" && !$globalThis.importScripts;
var setTimeout0 = (() => {
  if (setTimeout0IsFaster) {
    const pending = [];
    $globalThis.addEventListener("message", (e) => {
      if (e.data && e.data.vscodeScheduleAsyncWork) {
        for (let i2 = 0, len = pending.length; i2 < len; i2++) {
          const candidate = pending[i2];
          if (candidate.id === e.data.vscodeScheduleAsyncWork) {
            pending.splice(i2, 1);
            candidate.callback();
            return;
          }
        }
      }
    });
    let lastId = 0;
    return (callback) => {
      const myId = ++lastId;
      pending.push({
        id: myId,
        callback
      });
      $globalThis.postMessage({ vscodeScheduleAsyncWork: myId }, "*");
    };
  }
  return (callback) => setTimeout(callback);
})();
var isChrome = !!(userAgent && userAgent.indexOf("Chrome") >= 0);
var isFirefox = !!(userAgent && userAgent.indexOf("Firefox") >= 0);
var isSafari = !!(!isChrome && (userAgent && userAgent.indexOf("Safari") >= 0));
var isEdge = !!(userAgent && userAgent.indexOf("Edg/") >= 0);
var isAndroid = !!(userAgent && userAgent.indexOf("Android") >= 0);

// src/util/vs/base/common/process.ts
var safeProcess;
var vscodeGlobal = globalThis.vscode;
if (typeof vscodeGlobal !== "undefined" && typeof vscodeGlobal.process !== "undefined") {
  const sandboxProcess = vscodeGlobal.process;
  safeProcess = {
    get platform() {
      return sandboxProcess.platform;
    },
    get arch() {
      return sandboxProcess.arch;
    },
    get env() {
      return sandboxProcess.env;
    },
    cwd() {
      return sandboxProcess.cwd();
    }
  };
} else if (typeof process !== "undefined" && typeof process?.versions?.node === "string") {
  safeProcess = {
    get platform() {
      return process.platform;
    },
    get arch() {
      return process.arch;
    },
    get env() {
      return process.env;
    },
    cwd() {
      return process.env["VSCODE_CWD"] || process.cwd();
    }
  };
} else {
  safeProcess = {
    // Supported
    get platform() {
      return isWindows ? "win32" : isMacintosh ? "darwin" : "linux";
    },
    get arch() {
      return void 0;
    },
    // Unsupported
    get env() {
      return {};
    },
    cwd() {
      return "/";
    }
  };
}
var cwd = safeProcess.cwd;
var env = safeProcess.env;
var platform = safeProcess.platform;
var arch = safeProcess.arch;

// src/util/vs/base/common/path.ts
var CHAR_UPPERCASE_A = 65;
var CHAR_LOWERCASE_A = 97;
var CHAR_UPPERCASE_Z = 90;
var CHAR_LOWERCASE_Z = 122;
var CHAR_DOT = 46;
var CHAR_FORWARD_SLASH = 47;
var CHAR_BACKWARD_SLASH = 92;
var CHAR_COLON = 58;
var CHAR_QUESTION_MARK = 63;
var ErrorInvalidArgType = class extends Error {
  constructor(name2, expected, actual) {
    let determiner;
    if (typeof expected === "string" && expected.indexOf("not ") === 0) {
      determiner = "must not be";
      expected = expected.replace(/^not /, "");
    } else {
      determiner = "must be";
    }
    const type = name2.indexOf(".") !== -1 ? "property" : "argument";
    let msg = `The "${name2}" ${type} ${determiner} of type ${expected}`;
    msg += `. Received type ${typeof actual}`;
    super(msg);
    this.code = "ERR_INVALID_ARG_TYPE";
  }
};
function validateObject(pathObject, name2) {
  if (pathObject === null || typeof pathObject !== "object") {
    throw new ErrorInvalidArgType(name2, "Object", pathObject);
  }
}
function validateString(value, name2) {
  if (typeof value !== "string") {
    throw new ErrorInvalidArgType(name2, "string", value);
  }
}
var platformIsWin32 = platform === "win32";
function isPathSeparator(code) {
  return code === CHAR_FORWARD_SLASH || code === CHAR_BACKWARD_SLASH;
}
function isPosixPathSeparator(code) {
  return code === CHAR_FORWARD_SLASH;
}
function isWindowsDeviceRoot(code) {
  return code >= CHAR_UPPERCASE_A && code <= CHAR_UPPERCASE_Z || code >= CHAR_LOWERCASE_A && code <= CHAR_LOWERCASE_Z;
}
function normalizeString(path, allowAboveRoot, separator, isPathSeparator2) {
  let res = "";
  let lastSegmentLength = 0;
  let lastSlash = -1;
  let dots = 0;
  let code = 0;
  for (let i2 = 0; i2 <= path.length; ++i2) {
    if (i2 < path.length) {
      code = path.charCodeAt(i2);
    } else if (isPathSeparator2(code)) {
      break;
    } else {
      code = CHAR_FORWARD_SLASH;
    }
    if (isPathSeparator2(code)) {
      if (lastSlash === i2 - 1 || dots === 1) {
      } else if (dots === 2) {
        if (res.length < 2 || lastSegmentLength !== 2 || res.charCodeAt(res.length - 1) !== CHAR_DOT || res.charCodeAt(res.length - 2) !== CHAR_DOT) {
          if (res.length > 2) {
            const lastSlashIndex = res.lastIndexOf(separator);
            if (lastSlashIndex === -1) {
              res = "";
              lastSegmentLength = 0;
            } else {
              res = res.slice(0, lastSlashIndex);
              lastSegmentLength = res.length - 1 - res.lastIndexOf(separator);
            }
            lastSlash = i2;
            dots = 0;
            continue;
          } else if (res.length !== 0) {
            res = "";
            lastSegmentLength = 0;
            lastSlash = i2;
            dots = 0;
            continue;
          }
        }
        if (allowAboveRoot) {
          res += res.length > 0 ? `${separator}..` : "..";
          lastSegmentLength = 2;
        }
      } else {
        if (res.length > 0) {
          res += `${separator}${path.slice(lastSlash + 1, i2)}`;
        } else {
          res = path.slice(lastSlash + 1, i2);
        }
        lastSegmentLength = i2 - lastSlash - 1;
      }
      lastSlash = i2;
      dots = 0;
    } else if (code === CHAR_DOT && dots !== -1) {
      ++dots;
    } else {
      dots = -1;
    }
  }
  return res;
}
function formatExt(ext) {
  return ext ? `${ext[0] === "." ? "" : "."}${ext}` : "";
}
function _format(sep2, pathObject) {
  validateObject(pathObject, "pathObject");
  const dir = pathObject.dir || pathObject.root;
  const base = pathObject.base || `${pathObject.name || ""}${formatExt(pathObject.ext)}`;
  if (!dir) {
    return base;
  }
  return dir === pathObject.root ? `${dir}${base}` : `${dir}${sep2}${base}`;
}
var win32 = {
  // path.resolve([from ...], to)
  resolve(...pathSegments) {
    let resolvedDevice = "";
    let resolvedTail = "";
    let resolvedAbsolute = false;
    for (let i2 = pathSegments.length - 1; i2 >= -1; i2--) {
      let path;
      if (i2 >= 0) {
        path = pathSegments[i2];
        validateString(path, `paths[${i2}]`);
        if (path.length === 0) {
          continue;
        }
      } else if (resolvedDevice.length === 0) {
        path = cwd();
      } else {
        path = env[`=${resolvedDevice}`] || cwd();
        if (path === void 0 || path.slice(0, 2).toLowerCase() !== resolvedDevice.toLowerCase() && path.charCodeAt(2) === CHAR_BACKWARD_SLASH) {
          path = `${resolvedDevice}\\`;
        }
      }
      const len = path.length;
      let rootEnd = 0;
      let device = "";
      let isAbsolute2 = false;
      const code = path.charCodeAt(0);
      if (len === 1) {
        if (isPathSeparator(code)) {
          rootEnd = 1;
          isAbsolute2 = true;
        }
      } else if (isPathSeparator(code)) {
        isAbsolute2 = true;
        if (isPathSeparator(path.charCodeAt(1))) {
          let j = 2;
          let last = j;
          while (j < len && !isPathSeparator(path.charCodeAt(j))) {
            j++;
          }
          if (j < len && j !== last) {
            const firstPart = path.slice(last, j);
            last = j;
            while (j < len && isPathSeparator(path.charCodeAt(j))) {
              j++;
            }
            if (j < len && j !== last) {
              last = j;
              while (j < len && !isPathSeparator(path.charCodeAt(j))) {
                j++;
              }
              if (j === len || j !== last) {
                device = `\\\\${firstPart}\\${path.slice(last, j)}`;
                rootEnd = j;
              }
            }
          }
        } else {
          rootEnd = 1;
        }
      } else if (isWindowsDeviceRoot(code) && path.charCodeAt(1) === CHAR_COLON) {
        device = path.slice(0, 2);
        rootEnd = 2;
        if (len > 2 && isPathSeparator(path.charCodeAt(2))) {
          isAbsolute2 = true;
          rootEnd = 3;
        }
      }
      if (device.length > 0) {
        if (resolvedDevice.length > 0) {
          if (device.toLowerCase() !== resolvedDevice.toLowerCase()) {
            continue;
          }
        } else {
          resolvedDevice = device;
        }
      }
      if (resolvedAbsolute) {
        if (resolvedDevice.length > 0) {
          break;
        }
      } else {
        resolvedTail = `${path.slice(rootEnd)}\\${resolvedTail}`;
        resolvedAbsolute = isAbsolute2;
        if (isAbsolute2 && resolvedDevice.length > 0) {
          break;
        }
      }
    }
    resolvedTail = normalizeString(
      resolvedTail,
      !resolvedAbsolute,
      "\\",
      isPathSeparator
    );
    return resolvedAbsolute ? `${resolvedDevice}\\${resolvedTail}` : `${resolvedDevice}${resolvedTail}` || ".";
  },
  normalize(path) {
    validateString(path, "path");
    const len = path.length;
    if (len === 0) {
      return ".";
    }
    let rootEnd = 0;
    let device;
    let isAbsolute2 = false;
    const code = path.charCodeAt(0);
    if (len === 1) {
      return isPosixPathSeparator(code) ? "\\" : path;
    }
    if (isPathSeparator(code)) {
      isAbsolute2 = true;
      if (isPathSeparator(path.charCodeAt(1))) {
        let j = 2;
        let last = j;
        while (j < len && !isPathSeparator(path.charCodeAt(j))) {
          j++;
        }
        if (j < len && j !== last) {
          const firstPart = path.slice(last, j);
          last = j;
          while (j < len && isPathSeparator(path.charCodeAt(j))) {
            j++;
          }
          if (j < len && j !== last) {
            last = j;
            while (j < len && !isPathSeparator(path.charCodeAt(j))) {
              j++;
            }
            if (j === len) {
              return `\\\\${firstPart}\\${path.slice(last)}\\`;
            }
            if (j !== last) {
              device = `\\\\${firstPart}\\${path.slice(last, j)}`;
              rootEnd = j;
            }
          }
        }
      } else {
        rootEnd = 1;
      }
    } else if (isWindowsDeviceRoot(code) && path.charCodeAt(1) === CHAR_COLON) {
      device = path.slice(0, 2);
      rootEnd = 2;
      if (len > 2 && isPathSeparator(path.charCodeAt(2))) {
        isAbsolute2 = true;
        rootEnd = 3;
      }
    }
    let tail = rootEnd < len ? normalizeString(path.slice(rootEnd), !isAbsolute2, "\\", isPathSeparator) : "";
    if (tail.length === 0 && !isAbsolute2) {
      tail = ".";
    }
    if (tail.length > 0 && isPathSeparator(path.charCodeAt(len - 1))) {
      tail += "\\";
    }
    if (!isAbsolute2 && device === void 0 && path.includes(":")) {
      if (tail.length >= 2 && isWindowsDeviceRoot(tail.charCodeAt(0)) && tail.charCodeAt(1) === CHAR_COLON) {
        return `.\\${tail}`;
      }
      let index = path.indexOf(":");
      do {
        if (index === len - 1 || isPathSeparator(path.charCodeAt(index + 1))) {
          return `.\\${tail}`;
        }
      } while ((index = path.indexOf(":", index + 1)) !== -1);
    }
    if (device === void 0) {
      return isAbsolute2 ? `\\${tail}` : tail;
    }
    return isAbsolute2 ? `${device}\\${tail}` : `${device}${tail}`;
  },
  isAbsolute(path) {
    validateString(path, "path");
    const len = path.length;
    if (len === 0) {
      return false;
    }
    const code = path.charCodeAt(0);
    return isPathSeparator(code) || // Possible device root
    len > 2 && isWindowsDeviceRoot(code) && path.charCodeAt(1) === CHAR_COLON && isPathSeparator(path.charCodeAt(2));
  },
  join(...paths) {
    if (paths.length === 0) {
      return ".";
    }
    let joined;
    let firstPart;
    for (let i2 = 0; i2 < paths.length; ++i2) {
      const arg = paths[i2];
      validateString(arg, "path");
      if (arg.length > 0) {
        if (joined === void 0) {
          joined = firstPart = arg;
        } else {
          joined += `\\${arg}`;
        }
      }
    }
    if (joined === void 0) {
      return ".";
    }
    let needsReplace = true;
    let slashCount = 0;
    if (typeof firstPart === "string" && isPathSeparator(firstPart.charCodeAt(0))) {
      ++slashCount;
      const firstLen = firstPart.length;
      if (firstLen > 1 && isPathSeparator(firstPart.charCodeAt(1))) {
        ++slashCount;
        if (firstLen > 2) {
          if (isPathSeparator(firstPart.charCodeAt(2))) {
            ++slashCount;
          } else {
            needsReplace = false;
          }
        }
      }
    }
    if (needsReplace) {
      while (slashCount < joined.length && isPathSeparator(joined.charCodeAt(slashCount))) {
        slashCount++;
      }
      if (slashCount >= 2) {
        joined = `\\${joined.slice(slashCount)}`;
      }
    }
    return win32.normalize(joined);
  },
  // It will solve the relative path from `from` to `to`, for instance:
  //  from = 'C:\\orandea\\test\\aaa'
  //  to = 'C:\\orandea\\impl\\bbb'
  // The output of the function should be: '..\\..\\impl\\bbb'
  relative(from, to) {
    validateString(from, "from");
    validateString(to, "to");
    if (from === to) {
      return "";
    }
    const fromOrig = win32.resolve(from);
    const toOrig = win32.resolve(to);
    if (fromOrig === toOrig) {
      return "";
    }
    from = fromOrig.toLowerCase();
    to = toOrig.toLowerCase();
    if (from === to) {
      return "";
    }
    if (fromOrig.length !== from.length || toOrig.length !== to.length) {
      const fromSplit = fromOrig.split("\\");
      const toSplit = toOrig.split("\\");
      if (fromSplit[fromSplit.length - 1] === "") {
        fromSplit.pop();
      }
      if (toSplit[toSplit.length - 1] === "") {
        toSplit.pop();
      }
      const fromLen2 = fromSplit.length;
      const toLen2 = toSplit.length;
      const length2 = fromLen2 < toLen2 ? fromLen2 : toLen2;
      let i3;
      for (i3 = 0; i3 < length2; i3++) {
        if (fromSplit[i3].toLowerCase() !== toSplit[i3].toLowerCase()) {
          break;
        }
      }
      if (i3 === 0) {
        return toOrig;
      } else if (i3 === length2) {
        if (toLen2 > length2) {
          return toSplit.slice(i3).join("\\");
        }
        if (fromLen2 > length2) {
          return "..\\".repeat(fromLen2 - 1 - i3) + "..";
        }
        return "";
      }
      return "..\\".repeat(fromLen2 - i3) + toSplit.slice(i3).join("\\");
    }
    let fromStart = 0;
    while (fromStart < from.length && from.charCodeAt(fromStart) === CHAR_BACKWARD_SLASH) {
      fromStart++;
    }
    let fromEnd = from.length;
    while (fromEnd - 1 > fromStart && from.charCodeAt(fromEnd - 1) === CHAR_BACKWARD_SLASH) {
      fromEnd--;
    }
    const fromLen = fromEnd - fromStart;
    let toStart = 0;
    while (toStart < to.length && to.charCodeAt(toStart) === CHAR_BACKWARD_SLASH) {
      toStart++;
    }
    let toEnd = to.length;
    while (toEnd - 1 > toStart && to.charCodeAt(toEnd - 1) === CHAR_BACKWARD_SLASH) {
      toEnd--;
    }
    const toLen = toEnd - toStart;
    const length = fromLen < toLen ? fromLen : toLen;
    let lastCommonSep = -1;
    let i2 = 0;
    for (; i2 < length; i2++) {
      const fromCode = from.charCodeAt(fromStart + i2);
      if (fromCode !== to.charCodeAt(toStart + i2)) {
        break;
      } else if (fromCode === CHAR_BACKWARD_SLASH) {
        lastCommonSep = i2;
      }
    }
    if (i2 !== length) {
      if (lastCommonSep === -1) {
        return toOrig;
      }
    } else {
      if (toLen > length) {
        if (to.charCodeAt(toStart + i2) === CHAR_BACKWARD_SLASH) {
          return toOrig.slice(toStart + i2 + 1);
        }
        if (i2 === 2) {
          return toOrig.slice(toStart + i2);
        }
      }
      if (fromLen > length) {
        if (from.charCodeAt(fromStart + i2) === CHAR_BACKWARD_SLASH) {
          lastCommonSep = i2;
        } else if (i2 === 2) {
          lastCommonSep = 3;
        }
      }
      if (lastCommonSep === -1) {
        lastCommonSep = 0;
      }
    }
    let out2 = "";
    for (i2 = fromStart + lastCommonSep + 1; i2 <= fromEnd; ++i2) {
      if (i2 === fromEnd || from.charCodeAt(i2) === CHAR_BACKWARD_SLASH) {
        out2 += out2.length === 0 ? ".." : "\\..";
      }
    }
    toStart += lastCommonSep;
    if (out2.length > 0) {
      return `${out2}${toOrig.slice(toStart, toEnd)}`;
    }
    if (toOrig.charCodeAt(toStart) === CHAR_BACKWARD_SLASH) {
      ++toStart;
    }
    return toOrig.slice(toStart, toEnd);
  },
  toNamespacedPath(path) {
    if (typeof path !== "string" || path.length === 0) {
      return path;
    }
    const resolvedPath = win32.resolve(path);
    if (resolvedPath.length <= 2) {
      return path;
    }
    if (resolvedPath.charCodeAt(0) === CHAR_BACKWARD_SLASH) {
      if (resolvedPath.charCodeAt(1) === CHAR_BACKWARD_SLASH) {
        const code = resolvedPath.charCodeAt(2);
        if (code !== CHAR_QUESTION_MARK && code !== CHAR_DOT) {
          return `\\\\?\\UNC\\${resolvedPath.slice(2)}`;
        }
      }
    } else if (isWindowsDeviceRoot(resolvedPath.charCodeAt(0)) && resolvedPath.charCodeAt(1) === CHAR_COLON && resolvedPath.charCodeAt(2) === CHAR_BACKWARD_SLASH) {
      return `\\\\?\\${resolvedPath}`;
    }
    return resolvedPath;
  },
  dirname(path) {
    validateString(path, "path");
    const len = path.length;
    if (len === 0) {
      return ".";
    }
    let rootEnd = -1;
    let offset = 0;
    const code = path.charCodeAt(0);
    if (len === 1) {
      return isPathSeparator(code) ? path : ".";
    }
    if (isPathSeparator(code)) {
      rootEnd = offset = 1;
      if (isPathSeparator(path.charCodeAt(1))) {
        let j = 2;
        let last = j;
        while (j < len && !isPathSeparator(path.charCodeAt(j))) {
          j++;
        }
        if (j < len && j !== last) {
          last = j;
          while (j < len && isPathSeparator(path.charCodeAt(j))) {
            j++;
          }
          if (j < len && j !== last) {
            last = j;
            while (j < len && !isPathSeparator(path.charCodeAt(j))) {
              j++;
            }
            if (j === len) {
              return path;
            }
            if (j !== last) {
              rootEnd = offset = j + 1;
            }
          }
        }
      }
    } else if (isWindowsDeviceRoot(code) && path.charCodeAt(1) === CHAR_COLON) {
      rootEnd = len > 2 && isPathSeparator(path.charCodeAt(2)) ? 3 : 2;
      offset = rootEnd;
    }
    let end = -1;
    let matchedSlash = true;
    for (let i2 = len - 1; i2 >= offset; --i2) {
      if (isPathSeparator(path.charCodeAt(i2))) {
        if (!matchedSlash) {
          end = i2;
          break;
        }
      } else {
        matchedSlash = false;
      }
    }
    if (end === -1) {
      if (rootEnd === -1) {
        return ".";
      }
      end = rootEnd;
    }
    return path.slice(0, end);
  },
  basename(path, suffix) {
    if (suffix !== void 0) {
      validateString(suffix, "suffix");
    }
    validateString(path, "path");
    let start2 = 0;
    let end = -1;
    let matchedSlash = true;
    let i2;
    if (path.length >= 2 && isWindowsDeviceRoot(path.charCodeAt(0)) && path.charCodeAt(1) === CHAR_COLON) {
      start2 = 2;
    }
    if (suffix !== void 0 && suffix.length > 0 && suffix.length <= path.length) {
      if (suffix === path) {
        return "";
      }
      let extIdx = suffix.length - 1;
      let firstNonSlashEnd = -1;
      for (i2 = path.length - 1; i2 >= start2; --i2) {
        const code = path.charCodeAt(i2);
        if (isPathSeparator(code)) {
          if (!matchedSlash) {
            start2 = i2 + 1;
            break;
          }
        } else {
          if (firstNonSlashEnd === -1) {
            matchedSlash = false;
            firstNonSlashEnd = i2 + 1;
          }
          if (extIdx >= 0) {
            if (code === suffix.charCodeAt(extIdx)) {
              if (--extIdx === -1) {
                end = i2;
              }
            } else {
              extIdx = -1;
              end = firstNonSlashEnd;
            }
          }
        }
      }
      if (start2 === end) {
        end = firstNonSlashEnd;
      } else if (end === -1) {
        end = path.length;
      }
      return path.slice(start2, end);
    }
    for (i2 = path.length - 1; i2 >= start2; --i2) {
      if (isPathSeparator(path.charCodeAt(i2))) {
        if (!matchedSlash) {
          start2 = i2 + 1;
          break;
        }
      } else if (end === -1) {
        matchedSlash = false;
        end = i2 + 1;
      }
    }
    if (end === -1) {
      return "";
    }
    return path.slice(start2, end);
  },
  extname(path) {
    validateString(path, "path");
    let start2 = 0;
    let startDot = -1;
    let startPart = 0;
    let end = -1;
    let matchedSlash = true;
    let preDotState = 0;
    if (path.length >= 2 && path.charCodeAt(1) === CHAR_COLON && isWindowsDeviceRoot(path.charCodeAt(0))) {
      start2 = startPart = 2;
    }
    for (let i2 = path.length - 1; i2 >= start2; --i2) {
      const code = path.charCodeAt(i2);
      if (isPathSeparator(code)) {
        if (!matchedSlash) {
          startPart = i2 + 1;
          break;
        }
        continue;
      }
      if (end === -1) {
        matchedSlash = false;
        end = i2 + 1;
      }
      if (code === CHAR_DOT) {
        if (startDot === -1) {
          startDot = i2;
        } else if (preDotState !== 1) {
          preDotState = 1;
        }
      } else if (startDot !== -1) {
        preDotState = -1;
      }
    }
    if (startDot === -1 || end === -1 || // We saw a non-dot character immediately before the dot
    preDotState === 0 || // The (right-most) trimmed path component is exactly '..'
    preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
      return "";
    }
    return path.slice(startDot, end);
  },
  format: _format.bind(null, "\\"),
  parse(path) {
    validateString(path, "path");
    const ret = { root: "", dir: "", base: "", ext: "", name: "" };
    if (path.length === 0) {
      return ret;
    }
    const len = path.length;
    let rootEnd = 0;
    let code = path.charCodeAt(0);
    if (len === 1) {
      if (isPathSeparator(code)) {
        ret.root = ret.dir = path;
        return ret;
      }
      ret.base = ret.name = path;
      return ret;
    }
    if (isPathSeparator(code)) {
      rootEnd = 1;
      if (isPathSeparator(path.charCodeAt(1))) {
        let j = 2;
        let last = j;
        while (j < len && !isPathSeparator(path.charCodeAt(j))) {
          j++;
        }
        if (j < len && j !== last) {
          last = j;
          while (j < len && isPathSeparator(path.charCodeAt(j))) {
            j++;
          }
          if (j < len && j !== last) {
            last = j;
            while (j < len && !isPathSeparator(path.charCodeAt(j))) {
              j++;
            }
            if (j === len) {
              rootEnd = j;
            } else if (j !== last) {
              rootEnd = j + 1;
            }
          }
        }
      }
    } else if (isWindowsDeviceRoot(code) && path.charCodeAt(1) === CHAR_COLON) {
      if (len <= 2) {
        ret.root = ret.dir = path;
        return ret;
      }
      rootEnd = 2;
      if (isPathSeparator(path.charCodeAt(2))) {
        if (len === 3) {
          ret.root = ret.dir = path;
          return ret;
        }
        rootEnd = 3;
      }
    }
    if (rootEnd > 0) {
      ret.root = path.slice(0, rootEnd);
    }
    let startDot = -1;
    let startPart = rootEnd;
    let end = -1;
    let matchedSlash = true;
    let i2 = path.length - 1;
    let preDotState = 0;
    for (; i2 >= rootEnd; --i2) {
      code = path.charCodeAt(i2);
      if (isPathSeparator(code)) {
        if (!matchedSlash) {
          startPart = i2 + 1;
          break;
        }
        continue;
      }
      if (end === -1) {
        matchedSlash = false;
        end = i2 + 1;
      }
      if (code === CHAR_DOT) {
        if (startDot === -1) {
          startDot = i2;
        } else if (preDotState !== 1) {
          preDotState = 1;
        }
      } else if (startDot !== -1) {
        preDotState = -1;
      }
    }
    if (end !== -1) {
      if (startDot === -1 || // We saw a non-dot character immediately before the dot
      preDotState === 0 || // The (right-most) trimmed path component is exactly '..'
      preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
        ret.base = ret.name = path.slice(startPart, end);
      } else {
        ret.name = path.slice(startPart, startDot);
        ret.base = path.slice(startPart, end);
        ret.ext = path.slice(startDot, end);
      }
    }
    if (startPart > 0 && startPart !== rootEnd) {
      ret.dir = path.slice(0, startPart - 1);
    } else {
      ret.dir = ret.root;
    }
    return ret;
  },
  sep: "\\",
  delimiter: ";",
  win32: null,
  posix: null
};
var posixCwd = (() => {
  if (platformIsWin32) {
    const regexp = /\\/g;
    return () => {
      const cwd2 = cwd().replace(regexp, "/");
      return cwd2.slice(cwd2.indexOf("/"));
    };
  }
  return () => cwd();
})();
var posix = {
  // path.resolve([from ...], to)
  resolve(...pathSegments) {
    let resolvedPath = "";
    let resolvedAbsolute = false;
    for (let i2 = pathSegments.length - 1; i2 >= 0 && !resolvedAbsolute; i2--) {
      const path = pathSegments[i2];
      validateString(path, `paths[${i2}]`);
      if (path.length === 0) {
        continue;
      }
      resolvedPath = `${path}/${resolvedPath}`;
      resolvedAbsolute = path.charCodeAt(0) === CHAR_FORWARD_SLASH;
    }
    if (!resolvedAbsolute) {
      const cwd2 = posixCwd();
      resolvedPath = `${cwd2}/${resolvedPath}`;
      resolvedAbsolute = cwd2.charCodeAt(0) === CHAR_FORWARD_SLASH;
    }
    resolvedPath = normalizeString(
      resolvedPath,
      !resolvedAbsolute,
      "/",
      isPosixPathSeparator
    );
    if (resolvedAbsolute) {
      return `/${resolvedPath}`;
    }
    return resolvedPath.length > 0 ? resolvedPath : ".";
  },
  normalize(path) {
    validateString(path, "path");
    if (path.length === 0) {
      return ".";
    }
    const isAbsolute2 = path.charCodeAt(0) === CHAR_FORWARD_SLASH;
    const trailingSeparator = path.charCodeAt(path.length - 1) === CHAR_FORWARD_SLASH;
    path = normalizeString(path, !isAbsolute2, "/", isPosixPathSeparator);
    if (path.length === 0) {
      if (isAbsolute2) {
        return "/";
      }
      return trailingSeparator ? "./" : ".";
    }
    if (trailingSeparator) {
      path += "/";
    }
    return isAbsolute2 ? `/${path}` : path;
  },
  isAbsolute(path) {
    validateString(path, "path");
    return path.length > 0 && path.charCodeAt(0) === CHAR_FORWARD_SLASH;
  },
  join(...paths) {
    if (paths.length === 0) {
      return ".";
    }
    const path = [];
    for (let i2 = 0; i2 < paths.length; ++i2) {
      const arg = paths[i2];
      validateString(arg, "path");
      if (arg.length > 0) {
        path.push(arg);
      }
    }
    if (path.length === 0) {
      return ".";
    }
    return posix.normalize(path.join("/"));
  },
  relative(from, to) {
    validateString(from, "from");
    validateString(to, "to");
    if (from === to) {
      return "";
    }
    from = posix.resolve(from);
    to = posix.resolve(to);
    if (from === to) {
      return "";
    }
    const fromStart = 1;
    const fromEnd = from.length;
    const fromLen = fromEnd - fromStart;
    const toStart = 1;
    const toLen = to.length - toStart;
    const length = fromLen < toLen ? fromLen : toLen;
    let lastCommonSep = -1;
    let i2 = 0;
    for (; i2 < length; i2++) {
      const fromCode = from.charCodeAt(fromStart + i2);
      if (fromCode !== to.charCodeAt(toStart + i2)) {
        break;
      } else if (fromCode === CHAR_FORWARD_SLASH) {
        lastCommonSep = i2;
      }
    }
    if (i2 === length) {
      if (toLen > length) {
        if (to.charCodeAt(toStart + i2) === CHAR_FORWARD_SLASH) {
          return to.slice(toStart + i2 + 1);
        }
        if (i2 === 0) {
          return to.slice(toStart + i2);
        }
      } else if (fromLen > length) {
        if (from.charCodeAt(fromStart + i2) === CHAR_FORWARD_SLASH) {
          lastCommonSep = i2;
        } else if (i2 === 0) {
          lastCommonSep = 0;
        }
      }
    }
    let out2 = "";
    for (i2 = fromStart + lastCommonSep + 1; i2 <= fromEnd; ++i2) {
      if (i2 === fromEnd || from.charCodeAt(i2) === CHAR_FORWARD_SLASH) {
        out2 += out2.length === 0 ? ".." : "/..";
      }
    }
    return `${out2}${to.slice(toStart + lastCommonSep)}`;
  },
  toNamespacedPath(path) {
    return path;
  },
  dirname(path) {
    validateString(path, "path");
    if (path.length === 0) {
      return ".";
    }
    const hasRoot = path.charCodeAt(0) === CHAR_FORWARD_SLASH;
    let end = -1;
    let matchedSlash = true;
    for (let i2 = path.length - 1; i2 >= 1; --i2) {
      if (path.charCodeAt(i2) === CHAR_FORWARD_SLASH) {
        if (!matchedSlash) {
          end = i2;
          break;
        }
      } else {
        matchedSlash = false;
      }
    }
    if (end === -1) {
      return hasRoot ? "/" : ".";
    }
    if (hasRoot && end === 1) {
      return "//";
    }
    return path.slice(0, end);
  },
  basename(path, suffix) {
    if (suffix !== void 0) {
      validateString(suffix, "suffix");
    }
    validateString(path, "path");
    let start2 = 0;
    let end = -1;
    let matchedSlash = true;
    let i2;
    if (suffix !== void 0 && suffix.length > 0 && suffix.length <= path.length) {
      if (suffix === path) {
        return "";
      }
      let extIdx = suffix.length - 1;
      let firstNonSlashEnd = -1;
      for (i2 = path.length - 1; i2 >= 0; --i2) {
        const code = path.charCodeAt(i2);
        if (code === CHAR_FORWARD_SLASH) {
          if (!matchedSlash) {
            start2 = i2 + 1;
            break;
          }
        } else {
          if (firstNonSlashEnd === -1) {
            matchedSlash = false;
            firstNonSlashEnd = i2 + 1;
          }
          if (extIdx >= 0) {
            if (code === suffix.charCodeAt(extIdx)) {
              if (--extIdx === -1) {
                end = i2;
              }
            } else {
              extIdx = -1;
              end = firstNonSlashEnd;
            }
          }
        }
      }
      if (start2 === end) {
        end = firstNonSlashEnd;
      } else if (end === -1) {
        end = path.length;
      }
      return path.slice(start2, end);
    }
    for (i2 = path.length - 1; i2 >= 0; --i2) {
      if (path.charCodeAt(i2) === CHAR_FORWARD_SLASH) {
        if (!matchedSlash) {
          start2 = i2 + 1;
          break;
        }
      } else if (end === -1) {
        matchedSlash = false;
        end = i2 + 1;
      }
    }
    if (end === -1) {
      return "";
    }
    return path.slice(start2, end);
  },
  extname(path) {
    validateString(path, "path");
    let startDot = -1;
    let startPart = 0;
    let end = -1;
    let matchedSlash = true;
    let preDotState = 0;
    for (let i2 = path.length - 1; i2 >= 0; --i2) {
      const char = path[i2];
      if (char === "/") {
        if (!matchedSlash) {
          startPart = i2 + 1;
          break;
        }
        continue;
      }
      if (end === -1) {
        matchedSlash = false;
        end = i2 + 1;
      }
      if (char === ".") {
        if (startDot === -1) {
          startDot = i2;
        } else if (preDotState !== 1) {
          preDotState = 1;
        }
      } else if (startDot !== -1) {
        preDotState = -1;
      }
    }
    if (startDot === -1 || end === -1 || // We saw a non-dot character immediately before the dot
    preDotState === 0 || // The (right-most) trimmed path component is exactly '..'
    preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
      return "";
    }
    return path.slice(startDot, end);
  },
  format: _format.bind(null, "/"),
  parse(path) {
    validateString(path, "path");
    const ret = { root: "", dir: "", base: "", ext: "", name: "" };
    if (path.length === 0) {
      return ret;
    }
    const isAbsolute2 = path.charCodeAt(0) === CHAR_FORWARD_SLASH;
    let start2;
    if (isAbsolute2) {
      ret.root = "/";
      start2 = 1;
    } else {
      start2 = 0;
    }
    let startDot = -1;
    let startPart = 0;
    let end = -1;
    let matchedSlash = true;
    let i2 = path.length - 1;
    let preDotState = 0;
    for (; i2 >= start2; --i2) {
      const code = path.charCodeAt(i2);
      if (code === CHAR_FORWARD_SLASH) {
        if (!matchedSlash) {
          startPart = i2 + 1;
          break;
        }
        continue;
      }
      if (end === -1) {
        matchedSlash = false;
        end = i2 + 1;
      }
      if (code === CHAR_DOT) {
        if (startDot === -1) {
          startDot = i2;
        } else if (preDotState !== 1) {
          preDotState = 1;
        }
      } else if (startDot !== -1) {
        preDotState = -1;
      }
    }
    if (end !== -1) {
      const start3 = startPart === 0 && isAbsolute2 ? 1 : startPart;
      if (startDot === -1 || // We saw a non-dot character immediately before the dot
      preDotState === 0 || // The (right-most) trimmed path component is exactly '..'
      preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
        ret.base = ret.name = path.slice(start3, end);
      } else {
        ret.name = path.slice(start3, startDot);
        ret.base = path.slice(start3, end);
        ret.ext = path.slice(startDot, end);
      }
    }
    if (startPart > 0) {
      ret.dir = path.slice(0, startPart - 1);
    } else if (isAbsolute2) {
      ret.dir = "/";
    }
    return ret;
  },
  sep: "/",
  delimiter: ":",
  win32: null,
  posix: null
};
posix.win32 = win32.win32 = win32;
posix.posix = win32.posix = posix;
var normalize = platformIsWin32 ? win32.normalize : posix.normalize;
var isAbsolute = platformIsWin32 ? win32.isAbsolute : posix.isAbsolute;
var join = platformIsWin32 ? win32.join : posix.join;
var resolve = platformIsWin32 ? win32.resolve : posix.resolve;
var relative = platformIsWin32 ? win32.relative : posix.relative;
var dirname = platformIsWin32 ? win32.dirname : posix.dirname;
var basename = platformIsWin32 ? win32.basename : posix.basename;
var extname = platformIsWin32 ? win32.extname : posix.extname;
var format = platformIsWin32 ? win32.format : posix.format;
var parse = platformIsWin32 ? win32.parse : posix.parse;
var toNamespacedPath = platformIsWin32 ? win32.toNamespacedPath : posix.toNamespacedPath;
var sep = platformIsWin32 ? win32.sep : posix.sep;
var delimiter = platformIsWin32 ? win32.delimiter : posix.delimiter;

// src/platform/parser/node/languageLoader.ts
var Parser2 = require_tree_sitter();
var LanguageLoader = class {
  constructor() {
    this.loadedLanguagesCache = /* @__PURE__ */ new Map();
  }
  loadLanguage(wasmLanguage) {
    if (!this.loadedLanguagesCache.has(wasmLanguage)) {
      this.loadedLanguagesCache.set(wasmLanguage, this._doLoadLanguage(wasmLanguage));
    }
    return this.loadedLanguagesCache.get(wasmLanguage);
  }
  _doLoadLanguage(language2) {
    const wasmFileLang = language2 === "csharp" ? "c-sharp" : language2;
    const wasmFilename = `tree-sitter-${wasmFileLang}.wasm`;
    const wasmFile = basename(__dirname) === "dist" ? resolve(__dirname, wasmFilename) : resolve(__dirname, "../../../../dist", wasmFilename);
    return Parser2.Language.load(wasmFile);
  }
};

// src/platform/parser/node/parserWithCaching.ts
var Parser3 = require_tree_sitter();
var ParserWithCaching = class _ParserWithCaching {
  static {
    this.INSTANCE = new _ParserWithCaching();
  }
  static {
    this.CACHE_SIZE_PER_LANGUAGE = 5;
  }
  constructor() {
    this.caches = /* @__PURE__ */ new Map();
    this.languageLoader = new LanguageLoader();
    this._parser = null;
  }
  /** @remarks must not be called before `Parser.init()` */
  get parser() {
    if (!this._parser) {
      this._parser = new Parser3();
    }
    return this._parser;
  }
  /**
   * @remarks Do not `delete()` the returned parse tree manually.
   */
  async parse(lang, source) {
    await Parser3.init();
    const cache = this.getParseTreeCache(lang);
    let cacheEntry = cache.get(source);
    if (cacheEntry) {
      return cacheEntry.createReference();
    }
    const parserLang = await this.languageLoader.loadLanguage(lang);
    this.parser.setLanguage(parserLang);
    cacheEntry = cache.get(source);
    if (cacheEntry) {
      return cacheEntry.createReference();
    }
    const parseTree = this.parser.parse(source);
    cacheEntry = new CacheableParseTree(parseTree);
    cache.put(source, cacheEntry);
    return cacheEntry.createReference();
  }
  dispose() {
    if (this._parser) {
      this.parser.delete();
      this._parser = null;
    }
    for (const cache of this.caches.values()) {
      cache.dispose();
    }
  }
  getParseTreeCache(lang) {
    let cache = this.caches.get(lang);
    if (!cache) {
      cache = new DisposablesLRUCache(_ParserWithCaching.CACHE_SIZE_PER_LANGUAGE);
      this.caches.set(lang, cache);
    }
    return cache;
  }
};
var CacheableParseTree = class {
  constructor(tree) {
    this._tree = new RefCountedParseTree(tree);
  }
  dispose() {
    this._tree.deref();
  }
  createReference() {
    return new ParseTreeReference(this._tree);
  }
};
var ParseTreeReference = class {
  constructor(_parseTree) {
    this._parseTree = _parseTree;
    this._parseTree.ref();
  }
  get tree() {
    return this._parseTree.tree;
  }
  dispose() {
    this._parseTree.deref();
  }
};
var RefCountedParseTree = class {
  constructor(_tree) {
    this._tree = _tree;
    this._refCount = 1;
  }
  get tree() {
    if (this._refCount === 0) {
      throw new Error(`Cannot access disposed RefCountedParseTree`);
    }
    return this._tree;
  }
  ref() {
    if (this._refCount === 0) {
      throw new Error(`Cannot ref disposed RefCountedParseTree`);
    }
    this._refCount++;
  }
  deref() {
    if (this._refCount === 0) {
      throw new Error(`Cannot deref disposed RefCountedParseTree`);
    }
    this._refCount--;
    if (this._refCount === 0) {
      this._tree.delete();
    }
  }
};
function _dispose() {
  ParserWithCaching.INSTANCE.dispose();
}
function _parse(language2, source) {
  return ParserWithCaching.INSTANCE.parse(language2, source);
}

// src/util/vs/base/common/arraysFind.ts
function findLastIdxMonotonous(array, predicate, startIdx = 0, endIdxEx = array.length) {
  let i2 = startIdx;
  let j = endIdxEx;
  while (i2 < j) {
    const k = Math.floor((i2 + j) / 2);
    if (predicate(array[k])) {
      i2 = k + 1;
    } else {
      j = k;
    }
  }
  return i2 - 1;
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
function pushMany(arr, items) {
  for (const item of items) {
    arr.push(item);
  }
}
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

// src/platform/parser/node/querying.ts
var LanguageQueryCache = class {
  constructor(language2) {
    this.language = language2;
    this.map = /* @__PURE__ */ new Map();
  }
  getQuery(query) {
    if (!this.map.has(query)) {
      this.map.set(query, this.language.query(query));
    }
    return this.map.get(query);
  }
};
var QueryCache = class _QueryCache {
  constructor() {
    this.map = /* @__PURE__ */ new Map();
  }
  static {
    this.INSTANCE = new _QueryCache();
  }
  getQuery(language2, query) {
    if (!this.map.has(language2)) {
      this.map.set(language2, new LanguageQueryCache(language2));
    }
    return this.map.get(language2).getQuery(query);
  }
};
function runQueries(queries, root) {
  const matches = [];
  for (const query of queries) {
    const compiledQuery = QueryCache.INSTANCE.getQuery(root.tree.getLanguage(), query);
    const queryMatches = compiledQuery.matches(root);
    pushMany(matches, queryMatches);
  }
  return matches;
}

// src/platform/parser/node/util.ts
function extractIdentifier(node, languageId) {
  switch (languageId) {
    case "python":
    case "csharp":
      return node.children.find((c) => c.type.match(/identifier/))?.text;
    case "go": {
      const identifierChild = node.children.find((c) => c.type.match(/identifier/));
      if (identifierChild) {
        return identifierChild.text;
      }
      const specChild = node.children.find((c) => c.type.match(/spec/));
      return specChild?.children.find((c) => c.type.match(/identifier/))?.text;
    }
    case "javascript":
    case "javascriptreact":
    case "typescript":
    case "typescriptreact":
    case "cpp": {
      const declarator = node.children.find((c) => c.type.match(/declarator/));
      if (declarator) {
        return declarator.children.find((c) => c.type.match(/identifier/))?.text;
      }
      const identifierChild = node.children.find((c) => c.type.match(/identifier/));
      return identifierChild?.text;
    }
    case "java": {
      const identifierChild = node.children.find((c) => c.type === "identifier");
      return identifierChild?.text;
    }
    case "ruby":
      return node.children.find((c) => c.type.match(/constant|identifier/))?.text;
    default:
      return node.children.find((c) => c.type.match(/identifier/))?.text;
  }
}
function isDocumentableNode(node, language2) {
  switch (language2) {
    case "typescript" /* TypeScript */:
    case "tsx" /* TypeScriptTsx */:
    case "javascript" /* JavaScript */:
      return node.type.match(/definition|declaration|declarator|export_statement/);
    case "go" /* Go */:
      return node.type.match(/definition|declaration|declarator|var_spec/);
    case "cpp" /* Cpp */:
      return node.type.match(/definition|declaration|class_specifier/);
    case "ruby" /* Ruby */:
      return node.type.match(/module|class|method|assignment/);
    case "python" /* Python */:
      return node.type.match(/^(function_definition|class_definition|decorated_definition)$/);
    default:
      return node.type.match(/definition|declaration|declarator/);
  }
}
function unwrapPythonDecoratedDefinition(node, language2) {
  if (language2 !== "python" /* Python */ || node.type !== "decorated_definition") {
    return node;
  }
  return node.children.find((c) => c.type === "function_definition" || c.type === "class_definition") ?? node;
}

// src/platform/parser/node/selectionParsing.ts
function _getNodeMatchingSelection(parseTree, containerRange, language2, match = isDocumentableNode) {
  let frontier = [parseTree.rootNode];
  const documentableNodes = [];
  while (true) {
    const candidates = frontier.map((node) => [node, TreeSitterOffsetRange.intersectionSize(node, containerRange)]).filter(([_, s]) => s > 0).sort(([_, s0], [__, s1]) => s1 - s0);
    if (candidates.length === 0) {
      return documentableNodes.length === 0 ? void 0 : max(documentableNodes, ([_, s0], [__, s1]) => s0 - s1)[0];
    } else {
      const reweighedCandidates = candidates.map(([n, overlapSize]) => {
        const nLen = TreeSitterOffsetRange.len(n);
        const nonOverlappingSize = Math.abs(TreeSitterOffsetRange.len(containerRange) - overlapSize);
        const penalizedWeigth = overlapSize - nonOverlappingSize;
        const normalizedPenalizedWeight = penalizedWeigth / nLen;
        return [n, normalizedPenalizedWeight];
      });
      documentableNodes.push(...reweighedCandidates.filter(([node, _]) => match(node, language2)));
      frontier = [];
      frontier.push(...reweighedCandidates.flatMap(([n, s]) => n.children));
    }
  }
}

// src/platform/parser/node/treeSitterQueries.ts
var treeSitterQuery = /* @__PURE__ */ (() => {
  function defaultBehavior(query, ...values) {
    return query.length === 1 ? query[0] : query.reduce((result, string, i2) => `${result}${string}${values[i2] || ""}`, "");
  }
  return {
    typescript: defaultBehavior,
    javascript: defaultBehavior,
    python: defaultBehavior,
    go: defaultBehavior,
    ruby: defaultBehavior,
    csharp: defaultBehavior,
    cpp: defaultBehavior,
    java: defaultBehavior,
    rust: defaultBehavior
  };
})();
function forLanguages(languages, query) {
  return Object.fromEntries(languages.map((language2) => [language2, query]));
}
var allKnownQueries = {
  ["javascript" /* JavaScript */]: [],
  ["typescript" /* TypeScript */]: [],
  ["tsx" /* TypeScriptTsx */]: [],
  ["python" /* Python */]: [],
  ["csharp" /* Csharp */]: [],
  ["go" /* Go */]: [],
  ["java" /* Java */]: [],
  ["ruby" /* Ruby */]: [],
  ["cpp" /* Cpp */]: [],
  ["rust" /* Rust */]: []
};
function q(queryMap) {
  for (const key in queryMap) {
    const queries = queryMap[key];
    allKnownQueries[key].push(...queries);
  }
  return queryMap;
}
var callExpressionQuery = q({
  ...forLanguages(["javascript" /* JavaScript */, "typescript" /* TypeScript */, "tsx" /* TypeScriptTsx */], [
    `[
			(call_expression
				function: (identifier) @identifier)
			(call_expression
				function: (member_expression
					(property_identifier) @identifier))
		] @call_expression`
  ]),
  ["python" /* Python */]: [
    `[
			(call
				function: (identifier) @identifier)
			(call
				function: (attribute
					attribute: (identifier) @identifier))
		] @call_expression`
  ],
  ["csharp" /* Csharp */]: [
    `[
			(invocation_expression
				function: (identifier) @identifier)
			(invocation_expression
				function: (member_access_expression
					name: (identifier) @identifier))
		] @call_expression`
  ],
  ["go" /* Go */]: [
    `[
			(call_expression
				((selector_expression
					(field_identifier) @identifier)))
			(call_expression
				(identifier) @identifier)
		] @call_expression`
  ],
  ["java" /* Java */]: [
    `[
			(method_invocation
				name: (identifier) @identifier)
		] @call_expression`
  ],
  ["ruby" /* Ruby */]: [
    /**
     * TODO@joyceerhl figure out how to support matching
     * direct method calls i.e.
     * ```
     * def say_hello
     *	puts "Hello, world!"
     *	end
     * say_hello
     * ```
     * which is matchable only by the `identifier` syntax node
     * and could have performance implications
     */
    `[
			(call (identifier) @identifier
				(#not-match? @identifier "new|send|public_send|method"))
			(call
				receiver: (identifier)
				method: (identifier) @method
				(#match? @method "^(send|public_send|method)")
				arguments: (argument_list
					(simple_symbol) @symbol))
		] @call_expression`
  ],
  ["cpp" /* Cpp */]: [
    `[
			(function_declarator
				(identifier) @identifier)
			(function_declarator
				(field_identifier) @identifier)
			(call_expression (identifier) @identifier)
			(call_expression
				(field_expression
					field: (field_identifier) @identifier))
			(call_expression
				(call_expression
					(primitive_type)
					(argument_list
						(pointer_expression
						(identifier) @identifier))))
		] @call_expression`
  ],
  ["rust" /* Rust */]: [
    `[
			(call_expression (identifier) @identifier)
			(call_expression (field_expression (identifier) (field_identifier) @identifier))
			(call_expression (scoped_identifier (identifier) (identifier) @identifier (#not-match? @identifier "new")))
		] @call_expression`
  ]
});
var classDeclarationQuery = q({
  ...forLanguages(["javascript" /* JavaScript */, "typescript" /* TypeScript */, "tsx" /* TypeScriptTsx */], [
    `(class_declaration) @class_declaration`
  ]),
  ["java" /* Java */]: [
    `(class_declaration) @class_declaration`
  ],
  ["csharp" /* Csharp */]: [
    `(class_declaration) @class_declaration`
  ],
  ["python" /* Python */]: [
    `(class_definition) @class_declaration`
  ],
  ["cpp" /* Cpp */]: [
    `(class_specifier) @class_declaration`
  ],
  ["ruby" /* Ruby */]: [
    `(class) @class_declaration`
  ],
  ["go" /* Go */]: [
    `(type_declaration
			(type_spec
				(type_identifier) @type_identifier)) @class_declaration`
  ],
  ["rust" /* Rust */]: [
    `(impl_item (type_identifier) @type_identifier) @class_declaration`
  ]
});
var typeDeclarationQuery = q({
  // No types in JavaScript
  ["typescript" /* TypeScript */]: [
    `[
			(interface_declaration)
			(type_alias_declaration)
		] @type_declaration`
  ],
  ["csharp" /* Csharp */]: [
    `(interface_declaration
			(identifier) @type_identifier) @type_declaration`
  ],
  ["cpp" /* Cpp */]: [
    `[
			(struct_specifier
				(type_identifier) @type_identifier)
			(union_specifier
				(type_identifier) @type_identifier)
			(enum_specifier
				(type_identifier) @type_identifier)
		] @type_declaration`
  ],
  ["java" /* Java */]: [
    `(interface_declaration
			(identifier) @type_identifier) @type_declaration`
  ],
  ["go" /* Go */]: [
    `(type_declaration
			(type_spec
				(type_identifier) @type_identifier)) @type_declaration`
  ],
  ["ruby" /* Ruby */]: [
    `((constant) @type_identifier) @type_declaration`
  ],
  ["python" /* Python */]: [
    `(class_definition
			(identifier) @type_identifier) @type_declaration`
  ]
});
var typeReferenceQuery = q({
  // No types in JavaScript
  ["typescript" /* TypeScript */]: [
    `(type_identifier) @type_identifier`
  ],
  ["go" /* Go */]: [
    `(type_identifier) @type_identifier`
  ],
  ["ruby" /* Ruby */]: [
    `(constant) @type_identifier`
  ],
  ["csharp" /* Csharp */]: [
    `[
			(base_list
				(identifier) @type_identifier)
			(variable_declaration
				(identifier) @type_identifier)
		]`
  ],
  ["cpp" /* Cpp */]: [
    `(type_identifier) @type_identifier`
  ],
  ["java" /* Java */]: [
    `(type_identifier) @type_identifier`
  ],
  ["python" /* Python */]: [
    `[
			(type (identifier) @type_identifier)
			(argument_list
				(identifier) @type_identifier)
		]`
  ]
});
var classReferenceQuery = q({
  ...forLanguages(["javascript" /* JavaScript */, "typescript" /* TypeScript */, "tsx" /* TypeScriptTsx */], [
    `(new_expression
			constructor: (identifier) @new_expression)`
  ]),
  ["python" /* Python */]: [
    `(call
			function: (identifier) @new_expression)`
  ],
  ["csharp" /* Csharp */]: [
    `(object_creation_expression
			(identifier) @new_expression)`
  ],
  ["java" /* Java */]: [
    `(object_creation_expression
			(type_identifier) @new_expression)`
  ],
  ["cpp" /* Cpp */]: [
    `[
			(declaration
				(type_identifier) @new_expression)
			(class_specifier
				(type_identifier) @new_expression)
		]`
  ],
  ["go" /* Go */]: [
    `(composite_literal (type_identifier) @new_expression)`
  ],
  ["ruby" /* Ruby */]: [
    `((call
			receiver: ((constant) @new_expression)
			method: (identifier) @method)
				(#eq? @method "new"))`
  ],
  ["rust" /* Rust */]: [
    `(call_expression
			(scoped_identifier
				(identifier) @new_expression
				(identifier) @identifier
				(#eq? @identifier "new")))`
  ]
});
var functionQuery = q({
  python: [
    // `(function_definition)` is defined in python grammar:
    // https://github.com/tree-sitter/tree-sitter-python/blob/c4282ba411d990d313c5f8e7850bcaaf46fbf7da/grammar.js#L325-L338
    // docstring is represented in grammar as an optional `(initial expression_statement (string))`
    // at the start of the body block
    `[
			(function_definition
				name: (identifier) @identifier
				body: (block
						(expression_statement (string))? @docstring) @body)
			(assignment
				left: (identifier) @identifier
				right: (lambda) @body)
		] @function`,
    // handle malformed defs - no trailing semicolon or no body
    `(ERROR ("def" (identifier) (parameters))) @function`
  ],
  ...forLanguages(["javascript" /* JavaScript */, "typescript" /* TypeScript */, "tsx" /* TypeScriptTsx */], [
    // function patterns defined in javascript grammar which is shared by ts
    // https://github.com/tree-sitter/tree-sitter-javascript/blob/3d9fe9786ee74fa5067577f138e1a7129f80fb41/grammar.js#L595-L629
    // include `arrow_function` as well
    `[
			(function_expression
				name: (identifier)? @identifier
				body: (statement_block) @body)
			(function_declaration
				name: (identifier)? @identifier
				body: (statement_block) @body)
			(generator_function
				name: (identifier)? @identifier
				body: (statement_block) @body)
			(generator_function_declaration
				name: (identifier)? @identifier
				body: (statement_block) @body)
			(method_definition
				name: (property_identifier)? @identifier
				body: (statement_block) @body)
			(arrow_function
				body: (statement_block) @body)
		] @function`
  ]),
  go: [
    // function patterns defined in go grammar:
    // https://github.com/tree-sitter/tree-sitter-go/blob/b0c78230146705e867034e49a5ece20245b33490/grammar.js#L194-L209
    `[
			(function_declaration
				name: (identifier) @identifier
				body: (block) @body)
			(method_declaration
				name: (field_identifier) @identifier
				body: (block) @body)
		] @function`
  ],
  ruby: [
    // function patterns defined in ruby grammar:
    // https://github.com/tree-sitter/tree-sitter-ruby/blob/master/grammar.js
    // NOTE: Use a @params label for optional parameters to avoid capturing as
    // 	part of @body if parameters are present.
    `[
			(method
				name: (_) @identifier
				parameters: (method_parameters)? @params
				[(_)+ "end"] @body)
			(singleton_method
				name: (_) @identifier
				parameters: (method_parameters)? @params
				[(_)+ "end"] @body)
		] @function`
  ],
  csharp: [
    // function patterns defined in csharp grammar:
    // https://github.com/tree-sitter/tree-sitter-c-sharp/blob/master/grammar.js
    `[
			(constructor_declaration
				(identifier) @identifier
				(block) @body)
			(destructor_declaration
				(identifier) @identifier
				(block) @body)
			(operator_declaration
				(block) @body)
			(method_declaration
				(identifier) @identifier
				(block) @body)
			(local_function_statement
				(identifier) @identifier
				(block) @body)
		] @function`
  ],
  cpp: [
    // function patterns defined in cpp grammar:
    // https://github.com/tree-sitter/tree-sitter-cpp/blob/master/grammar.js
    `[
			(function_definition
				(_
					(identifier) @identifier)
					(compound_statement) @body)
			(function_definition
				(function_declarator
					(qualified_identifier
						(identifier) @identifier))
					(compound_statement) @body)
		] @function`
  ],
  java: [
    `[
			(constructor_declaration
				name: (identifier) @identifier
				body: (constructor_body) @body)
			(method_declaration
				name: (_) @identifier
				body: (block) @body)
			(lambda_expression
				body: (block) @body)
		] @function`
  ],
  rust: [
    `[
			(function_item (identifier) @identifier)
			(let_declaration (identifier) @identifier)
		] @function`
  ]
});
var docCommentQueries = q({
  ["javascript" /* JavaScript */]: [
    treeSitterQuery.javascript`((comment) @comment
			(#match? @comment "^\\\\/\\\\*\\\\*")) @docComment`
  ],
  ...forLanguages(["typescript" /* TypeScript */, "tsx" /* TypeScriptTsx */], [
    treeSitterQuery.typescript`((comment) @comment
			(#match? @comment "^\\\\/\\\\*\\\\*")) @docComment`
  ]),
  ["java" /* Java */]: [
    treeSitterQuery.java`((block_comment) @block_comment
			(#match? @block_comment "^\\\\/\\\\*\\\\*")) @docComment`
  ],
  ["cpp" /* Cpp */]: [
    treeSitterQuery.cpp`((comment) @comment
			(#match? @comment "^\\\\/\\\\*\\\\*")) @docComment`
  ],
  ["csharp" /* Csharp */]: [
    treeSitterQuery.csharp`(
			((comment) @c
				(#match? @c "^\\\\/\\\\/\\\\/"))+
		) @docComment`
  ],
  ["rust" /* Rust */]: [
    treeSitterQuery.rust`((line_comment) @comment
			(#match? @comment "^\/\/\/|^\/\/!"))+ @docComment`
  ],
  // note: golang & ruby have same prefix for a doc comment and line comment
  ["go" /* Go */]: [
    treeSitterQuery.go`((comment)+) @docComment`
  ],
  ["ruby" /* Ruby */]: [
    treeSitterQuery.ruby`((comment)+) @docComment`
  ],
  // NOT yet supported:
  // we don't support python with this yet because of its placement of a docstring (under signature)
  ["python" /* Python */]: [
    `(expression_statement
			(string) @docComment)`
  ]
});
var symbolQueries = q({
  ["javascript" /* JavaScript */]: [
    treeSitterQuery.javascript`[
			(identifier) @symbol
			(property_identifier) @symbol
			(private_property_identifier) @symbol
		]`
  ],
  ...forLanguages(["typescript" /* TypeScript */, "tsx" /* TypeScriptTsx */], [
    treeSitterQuery.typescript`[
			(identifier) @symbol
			(type_identifier) @symbol
			(property_identifier) @symbol
			(private_property_identifier) @symbol
		]`
  ]),
  ["cpp" /* Cpp */]: [
    treeSitterQuery.cpp`[
			(identifier) @symbol
			(type_identifier) @symbol
		]`
  ],
  ["csharp" /* Csharp */]: [
    treeSitterQuery.csharp`[
			(identifier) @symbol
		]`
  ],
  ["go" /* Go */]: [
    treeSitterQuery.go`[
			(identifier) @symbol
		]`
  ],
  ["java" /* Java */]: [
    treeSitterQuery.java`[
			(identifier) @symbol
		]`
  ],
  ["python" /* Python */]: [
    treeSitterQuery.python`[
			(identifier) @symbol
		]`
  ],
  ["ruby" /* Ruby */]: [
    treeSitterQuery.ruby`[
			(identifier) @symbol
		]`
  ],
  ["rust" /* Rust */]: [
    treeSitterQuery.rust`[
			(identifier) @symbol
		]`
  ]
});
var syntacticallyValidAtoms = q({
  ["typescript" /* TypeScript */]: [
    treeSitterQuery.typescript`
			[
				(comment) @comment ;; split into multiple comment kinds?

				(declaration) @declaration

				;; class declaration related
				(public_field_definition) @public_field_definition
				(method_definition) @method_definition
				(class_declaration (_ (method_signature) @method_signature))
				(abstract_method_signature) @abstract_method_signature

				;; enum declaration related
				(enum_assignment) @enum_assignment

				;; interface declaration related
				(interface_declaration (_ (method_signature) @method_signature))
				(interface_declaration (_ (property_signature) @property_signature))

				;; statements

				(import_statement) @import_statement
				(export_statement) @export_statement

				(expression_statement) @expression_statement

				(for_in_statement) @for_in_statement
				;; exclude any children found in the for loop condition
				(for_statement condition: (_) @for_statement.exclude_captures ) @for_statement
				(break_statement) @break_statement
				(continue_statement) @continue_statement
				(do_statement) @do_statement
				(if_statement) @if_statement
				(if_statement
					consequence: [
						(expression_statement)
						(if_statement)
					] @if_statement.exclude_captures)
				(else_clause
					[
						(expression_statement)
						(if_statement) ; for if-else chains
					] @else_clause.exclude_captures)
				(switch_statement) @switch_statement
				(switch_case) @switch_case
				(try_statement) @try_statement
				(throw_statement) @throw_statement
				(debugger_statement) @debugger_statement
				(return_statement) @return_statement
			]
		`
  ],
  ["tsx" /* TypeScriptTsx */]: [
    treeSitterQuery.typescript`
			[
				(comment) @comment ;; split into multiple comment kinds?

				(declaration) @declaration

				;; class declaration related
				(public_field_definition) @public_field_definition
				(method_definition) @method_definition
				(class_declaration (_ (method_signature) @method_signature))
				(abstract_method_signature) @abstract_method_signature

				;; enum declaration related
				(enum_assignment) @enum_assignment

				;; interface declaration related
				(interface_declaration (_ (method_signature) @method_signature))
				(interface_declaration (_ (property_signature) @property_signature))

				;; statements

				(import_statement) @import_statement
				(export_statement) @export_statement

				(expression_statement) @expression_statement

				(for_in_statement) @for_in_statement
				;; exclude any children found in the for loop condition
				(for_statement condition: (_) @for_statement.exclude_captures ) @for_statement
				(break_statement) @break_statement
				(continue_statement) @continue_statement
				(do_statement) @do_statement
				(if_statement) @if_statement
				(if_statement
					consequence: [
						(expression_statement)
						(if_statement)
					] @if_statement.exclude_captures)
				(else_clause
					[
						(expression_statement)
						(if_statement) ; for if-else chains
					] @else_clause.exclude_captures)
				(switch_statement) @switch_statement
				(switch_case) @switch_case
				(try_statement) @try_statement
				(throw_statement) @throw_statement
				(debugger_statement) @debugger_statement
				(return_statement) @return_statement

				;; jsx
				(jsx_element) @jsx_element
				(jsx_element (_ (jsx_expression) @jsx_expression))
			]
		`
  ],
  ["python" /* Python */]: [
    treeSitterQuery.python`
			[
				(comment) @comment

				;; simple statements
				(assert_statement) @assert_statement
				(break_statement) @break_statement
				(continue_statement) @continue_statement
				(delete_statement) @delete_statement
				(exec_statement) @exec_statement
				(expression_statement) @expression_statement
				(future_import_statement) @future_import_statement
				(global_statement) @global_statement
				(import_from_statement) @import_from_statement
				(import_statement) @import_statement
				(nonlocal_statement) @nonlocal_statement
				(pass_statement) @pass_statement
				(print_statement) @print_statement
				(raise_statement) @raise_statement
				(return_statement) @return_statement
				(type_alias_statement) @type_alias_statement


				;; compound statements

				(class_definition) @class_definition
				(decorated_definition) @decorated_definition
				(for_statement) @for_statement
				(function_definition) @function_definition
				(if_statement) @if_statement
				(try_statement) @try_statement
				(while_statement) @while_statement
				(with_statement) @with_statement


				;; expressions

				(expression_list) @expression_list
				(expression_statement) @expression_statement
			]
		`
  ],
  ["javascript" /* JavaScript */]: [
    treeSitterQuery.javascript`
			[
				(comment) @comment ;; split into multiple comment kinds?

				(declaration) @declaration

				;; class declaration related

				(field_definition) @field_definition
				(method_definition) @method_definition

				;; statements

				(import_statement) @import_statement
				(export_statement) @export_statement

				(expression_statement) @expression_statement

				(for_in_statement) @for_in_statement
				;; exclude any children found in the for loop condition
				(for_statement condition: (_) @for_statement.exclude_captures ) @for_statement
				(break_statement) @break_statement
				(continue_statement) @continue_statement
				(do_statement) @do_statement
				(if_statement) @if_statement
				(switch_statement) @switch_statement
				(switch_case) @switch_case
				(try_statement) @try_statement
				(throw_statement) @throw_statement
				(debugger_statement) @debugger_statement
				(return_statement) @return_statement
			]`
  ],
  ["go" /* Go */]: [
    treeSitterQuery.go`
		[
			(_statement) @statement
			(function_declaration) @function_declaration
			(import_declaration) @import_declaration
			(method_declaration) @method_declaration
			(package_clause) @package_clause

			(if_statement
				initializer: (_) @for_statement.exclude_captures) @for_statement

			(expression_case) @expression_case ;; e.g., case 0:
		]
		`
  ],
  ["ruby" /* Ruby */]: [
    treeSitterQuery.ruby`
			[
				(comment) @comment

				(assignment) @assignment

				(if) @if

				(call) @call

				(case) @case

				(when) @when

				(while) @while

				(for) @for

				(method) @method

				(class) @class

				(module) @module

				(begin) @begin
			]
		`
  ],
  ["csharp" /* Csharp */]: [
    treeSitterQuery.csharp`
			[
				(comment) @comment

				(class_declaration) @class_declaration
				(constructor_declaration) @constructor_declaration
				(method_declaration) @method_declaration
				(delegate_declaration) @delegate_declaration
				(enum_declaration) @enum_declaration
				(extern_alias_directive) @extern_alias_directive
				(file_scoped_namespace_declaration) @file_scoped_namespace_declaration
				(global_attribute) @global_attribute
				(global_statement) @global_statement
				(interface_declaration) @interface_declaration
				(namespace_declaration) @namespace_declaration
				(record_declaration) @record_declaration
				(struct_declaration) @struct_declaration
				(using_directive) @using_directive

				(local_declaration_statement) @local_declaration_statement
				(expression_statement) @expression_statement
				(for_statement) @for_statement
				(foreach_statement) @foreach_statement
				(continue_statement) @continue_statement
				(break_statement) @break_statement
				(throw_statement) @throw_statement
				(return_statement) @return_statement
				(try_statement) @try_statement
			]
		`
  ],
  ["cpp" /* Cpp */]: [
    treeSitterQuery.cpp`
			[
				(preproc_ifdef) @preproc_ifdef
				(preproc_call) @preproc_call
				(preproc_def) @preproc_def
				(type_definition) @type_definition
				(type_definition
					type:(_) @type_definition.exclude_captures) @type_definition

				(declaration) @declaration

				(expression_statement) @expression_statement

				(comment) @comment

				(preproc_include) @preproc_include

				(namespace_definition) @namespace_definition

				(enum_specifier) @enum_specifier

				(struct_specifier) @struct_specifier

				(template_declaration) @template_declaration

				(function_definition) @function_definition

				(return_statement) @return_statement

				(class_specifier) @class_specifier

				(try_statement) @try_statement

				(throw_statement) @throw_statement

				(for_statement) @for_statement
				(for_statement
					initializer:(_) @for_statement.exclude_captures) @for_statement

				(for_range_loop) @for_range_loop

				(while_statement) @while_statement
				(do_statement) @do_statement
				(if_statement) @if_statement

				(labeled_statement) @labeled_statement
				(goto_statement) @goto_statement

				(break_statement) @break_statement
			]
		`
  ],
  ["java" /* Java */]: [
    treeSitterQuery.java`
		[
			(statement) @statement ;; @ulugbekna: this includes (declaration); but somehow it can't capture inner classes

			(line_comment) @line_comment
			(block_comment) @block_comment

			(for_statement
				init: (_) @for_statement.exclude_captures)

			(block) @block.exclude_captures

			(class_declaration) @class_declaration

			(constructor_declaration) @constructor_declaration

			(field_declaration) @field_declaration

			(method_declaration) @method_declaration
		]
		`
  ],
  ["rust" /* Rust */]: [
    // treeSitterQuery.rust`
    // [
    // 	(line_comment) @line_comment
    // 	(let_declaration) @let_declaration
    // 	(extern_crate_declaration) @extern_crate_declaration
    // 	(use_declaration) @use_declaration
    // 	(attribute_item) @attribute_item
    // 	(const_item) @const_item
    // 	(enum_item) @enum_item
    // 	(foreign_mod_item) @foreign_mod_item
    // 	(function_item) @function_item
    // 	(function_signature_item) @function_signature_item
    // 	(impl_item) @impl_item
    // 	(inner_attribute_item) @inner_attribute_item
    // 	(mod_item) @mod_item
    // 	(static_item) @static_item
    // 	(struct_item) @struct_item
    // 	(trait_item) @trait_item
    // 	(type_item) @type_item
    // 	(union_item) @union_item
    // 	(macro_definition) @macro_definition
    // 	(empty_statement) @empty_statement
    // 	(compound_assignment_expr) @compound_assignment_expr
    // 	(generic_function) @generic_function
    // 	(metavariable) @metavariable
    // 	(match_arm) @match_arm
    // 	(async_block) @async_block
    // 	(const_block) @const_block
    // 	(unsafe_block) @unsafe_block
    // 	(block) @block.exclude_captures
    // ]
    // `
  ]
});
var coarseScopeTypes = {
  ...forLanguages(["typescript" /* TypeScript */, "tsx" /* TypeScriptTsx */], [
    "program",
    "interface_declaration",
    "class_declaration",
    "function_declaration",
    "function_expression",
    "type_alias_declaration",
    "method_definition"
  ]),
  ["javascript" /* JavaScript */]: [
    "program",
    "class_declaration",
    "function_declaration",
    "function_expression",
    "method_definition"
  ],
  ["java" /* Java */]: [
    "program",
    "class_declaration",
    "interface_declaration",
    "method_declaration"
  ],
  ["cpp" /* Cpp */]: [
    "translation_unit",
    "class_specifier",
    "function_definition"
  ],
  ["csharp" /* Csharp */]: [
    "compilation_unit",
    "class_declaration",
    "interface_declaration",
    "method_declaration"
  ],
  ["python" /* Python */]: [
    "module",
    "class_definition",
    "function_definition"
  ],
  ["go" /* Go */]: [
    "source_file",
    "type_declaration",
    "function_declaration",
    "method_declaration"
  ],
  ["ruby" /* Ruby */]: [
    "program",
    "method",
    "class",
    "method"
  ],
  ["rust" /* Rust */]: [
    "source_file",
    "function_item",
    "impl_item",
    "let_declaration"
  ]
};
var coarseScopesQuery = q({
  ["typescript" /* TypeScript */]: [
    coarseScopesQueryForLanguage("typescript" /* TypeScript */)
  ],
  ["tsx" /* TypeScriptTsx */]: [
    coarseScopesQueryForLanguage("tsx" /* TypeScriptTsx */)
  ],
  ["javascript" /* JavaScript */]: [
    coarseScopesQueryForLanguage("javascript" /* JavaScript */)
  ],
  ["java" /* Java */]: [
    coarseScopesQueryForLanguage("java" /* Java */)
  ],
  ["cpp" /* Cpp */]: [
    coarseScopesQueryForLanguage("cpp" /* Cpp */)
  ],
  ["csharp" /* Csharp */]: [
    coarseScopesQueryForLanguage("csharp" /* Csharp */)
  ],
  ["python" /* Python */]: [
    coarseScopesQueryForLanguage("python" /* Python */)
  ],
  ["go" /* Go */]: [
    coarseScopesQueryForLanguage("go" /* Go */)
  ],
  ["ruby" /* Ruby */]: [
    coarseScopesQueryForLanguage("ruby" /* Ruby */)
  ],
  ["rust" /* Rust */]: [
    coarseScopesQueryForLanguage("rust" /* Rust */)
  ]
});
var fineScopeTypes = {
  ...forLanguages(["typescript" /* TypeScript */, "tsx" /* TypeScriptTsx */, "javascript" /* JavaScript */], [
    "for_in_statement",
    "for_statement",
    "if_statement",
    "while_statement",
    "do_statement",
    "try_statement",
    "switch_statement"
  ]),
  ["java" /* Java */]: [
    "for_statement",
    "enhanced_for_statement",
    "if_statement",
    "while_statement",
    "do_statement",
    "try_statement",
    "switch_expression"
  ],
  ["cpp" /* Cpp */]: [
    "for_statement",
    "for_range_loop",
    "if_statement",
    "while_statement",
    "do_statement",
    "try_statement",
    "switch_statement"
  ],
  ["csharp" /* Csharp */]: [
    "for_statement",
    "for_each_statement",
    "if_statement",
    "while_statement",
    "do_statement",
    "try_statement",
    "switch_expression"
  ],
  ["python" /* Python */]: [
    "for_statement",
    "if_statement",
    "while_statement",
    "try_statement"
  ],
  ["go" /* Go */]: [
    "for_statement",
    "if_statement",
    "type_switch_statement"
  ],
  ["ruby" /* Ruby */]: [
    "while",
    "for",
    "if",
    "case"
  ],
  ["rust" /* Rust */]: [
    "for_statement",
    "if_statement",
    "while_statement",
    "loop_statement",
    "match_expression"
  ]
};
var statementTypes = {
  ...forLanguages(["typescript" /* TypeScript */, "tsx" /* TypeScriptTsx */], [
    "lexical_declaration",
    "expression_statement",
    "public_field_definition"
  ]),
  ["javascript" /* JavaScript */]: [
    "call_expression",
    "expression_statement",
    "variable_declaration",
    "public_field_definition"
  ],
  ["java" /* Java */]: [
    "expression_statement",
    "local_variable_declaration",
    "field_declaration"
  ],
  ["cpp" /* Cpp */]: [
    "field_declaration",
    "expression_statement",
    "declaration"
  ],
  ["csharp" /* Csharp */]: [
    "field_declaration",
    "expression_statement"
  ],
  ["python" /* Python */]: [
    "expression_statement"
  ],
  ["go" /* Go */]: [
    "short_var_declaration",
    "call_expression"
  ],
  ["ruby" /* Ruby */]: [
    "call",
    "assignment"
  ],
  ["rust" /* Rust */]: [
    "expression_statement",
    "let_declaration",
    "use_declaration",
    "assignment_expression",
    "macro_definition",
    "extern_crate_declaration"
  ]
};
var semanticChunkTargetTypes = {
  ...forLanguages(["typescript" /* TypeScript */, "tsx" /* TypeScriptTsx */], [
    "class_declaration",
    "function_declaration",
    "generator_function_declaration",
    "interface_declaration",
    "internal_module",
    "method_definition",
    "abstract_class_declaration",
    "abstract_method_signature",
    "enum_declaration"
  ]),
  ["javascript" /* JavaScript */]: [
    "class_declaration",
    "function_declaration",
    "generator_function_declaration",
    "method_definition"
  ],
  ["java" /* Java */]: [
    "class_declaration",
    "constructor_declaration",
    "enum_declaration",
    "interface_declaration",
    "method_declaration",
    "module_declaration"
  ],
  ["cpp" /* Cpp */]: [
    "class_specifier",
    "function_definition",
    "namespace_definition",
    "struct_specifier"
  ],
  ["csharp" /* Csharp */]: [
    "class_declaration",
    "constructor_declaration",
    "destructor_declaration",
    "enum_declaration",
    "interface_declaration",
    "method_declaration",
    "namespace_declaration",
    "struct_declaration"
  ],
  ["python" /* Python */]: [
    "function_definition",
    "class_definition"
  ],
  ["go" /* Go */]: [
    "function_declaration",
    "method_declaration"
  ],
  ["ruby" /* Ruby */]: [
    "class",
    "method",
    "module"
  ],
  ["rust" /* Rust */]: [
    "function_item",
    "impl_item",
    "mod_item",
    "struct_item",
    "trait_item",
    "union_item"
  ]
};
var semanticChunkingTargetQuery = q({
  ["typescript" /* TypeScript */]: [
    semanticChunkingTargetQueryForLanguage("typescript" /* TypeScript */)
  ],
  ["tsx" /* TypeScriptTsx */]: [
    semanticChunkingTargetQueryForLanguage("tsx" /* TypeScriptTsx */)
  ],
  ["javascript" /* JavaScript */]: [
    semanticChunkingTargetQueryForLanguage("javascript" /* JavaScript */)
  ],
  ["java" /* Java */]: [
    semanticChunkingTargetQueryForLanguage("java" /* Java */)
  ],
  ["cpp" /* Cpp */]: [
    semanticChunkingTargetQueryForLanguage("cpp" /* Cpp */)
  ],
  ["csharp" /* Csharp */]: [
    semanticChunkingTargetQueryForLanguage("csharp" /* Csharp */)
  ],
  ["python" /* Python */]: [
    semanticChunkingTargetQueryForLanguage("python" /* Python */)
  ],
  ["go" /* Go */]: [
    semanticChunkingTargetQueryForLanguage("go" /* Go */)
  ],
  ["rust" /* Rust */]: [
    semanticChunkingTargetQueryForLanguage("rust" /* Rust */)
  ],
  ["ruby" /* Ruby */]: [
    semanticChunkingTargetQueryForLanguage("ruby" /* Ruby */)
  ]
});
function coarseScopesQueryForLanguage(language2) {
  return coarseScopeTypes[language2].map((scope) => `(${scope}) @scope`).join("\n");
}
function semanticChunkingTargetQueryForLanguage(language2) {
  const blocks = semanticChunkTargetTypes[language2].map((blockType) => `(${blockType})`).join("\n");
  return `[
		${blocks}
	] @definition`;
}
function _isScope(language2, node) {
  return coarseScopeTypes[language2].includes(node.type) || fineScopeTypes[language2].includes(node.type);
}
function _isFineScope(language2, node) {
  return fineScopeTypes[language2].includes(node.type);
}
function _isStatement(language2, node) {
  return statementTypes[language2].includes(node.type);
}
var testInSuiteQueries = {
  ...forLanguages(["typescript" /* TypeScript */, "tsx" /* TypeScriptTsx */], [
    treeSitterQuery.typescript`[
			(expression_statement
				(call_expression
					function: (identifier) @fn
					(#any-of? @fn "test" "it")
				)
			) @test
		]`
  ]),
  ["javascript" /* JavaScript */]: [
    // same as typescript, but we want different tree-sitter query linting to prevent breakages in future
    treeSitterQuery.javascript`[
			(call_expression
				function: (identifier) @fn
				(#any-of? @fn "test" "it")
			) @test
		]`
  ],
  ["python" /* Python */]: [
    treeSitterQuery.python`[
			(function_definition
				name: (identifier) @fn
				(#match? @fn "^test_")
			) @test
		]`
  ],
  ["java" /* Java */]: [
    treeSitterQuery.java`[
			(method_declaration
				name: (identifier) @fn
				(#match? @fn "^test")
			) @test
		]`
  ],
  ["go" /* Go */]: [
    treeSitterQuery.go`[
			(function_declaration
				name: (identifier) @fn
				(#match? @fn "^Test")
			) @test
		]`
  ],
  ["ruby" /* Ruby */]: [],
  ["csharp" /* Csharp */]: [],
  ["cpp" /* Cpp */]: [],
  ["rust" /* Rust */]: []
};

// src/platform/parser/node/structure.ts
var StructureComputer = class {
  constructor() {
    this._cache = new LRUCache(5);
  }
  setCacheSize(size) {
    this._cache = new LRUCache(size);
  }
  async getStructure(lang, source) {
    const cacheKey = `${lang}:${source}`;
    let cacheValue = this._cache.get(cacheKey);
    if (!cacheValue) {
      cacheValue = await this._getStructure(lang, source);
      this._cache.put(cacheKey, cacheValue);
    }
    return cacheValue;
  }
  async _getStructure(lang, source) {
    const queries = syntacticallyValidAtoms[lang];
    if (queries.length === 0) {
      return void 0;
    }
    const treeRef = await _parse(lang, source);
    try {
      const captures = runQueries(queries, treeRef.tree.rootNode).flatMap((e) => e.captures).sort((a, b) => TreeSitterOffsetRange.compare(a.node, b.node));
      const excludedRanges = [];
      for (const capture of captures) {
        if (capture.name.endsWith(".exclude_captures")) {
          excludedRanges.push(TreeSitterOffsetRange.ofSyntaxNode(capture.node));
        }
      }
      const root = new OverlayNode(0, source.length, "root", []);
      const parentStack = [root];
      for (let i2 = 0; i2 < captures.length; ++i2) {
        const currentCapture = captures[i2];
        const currentNode = currentCapture.node;
        if (excludedRanges.some((r) => TreeSitterOffsetRange.isEqual(r, currentNode))) {
          continue;
        }
        let currentParent;
        do {
          currentParent = parentStack.pop();
        } while (currentParent && !TreeSitterOffsetRange.doesContain(currentParent, currentNode));
        const ambientParents = /* @__PURE__ */ new Set(["export_statement", "ambient_declaration"]);
        if (ambientParents.has(currentParent.kind)) {
          currentParent.kind = currentNode.type;
          parentStack.push(currentParent);
        } else {
          let nodeKind = currentNode.type;
          if ((lang === "typescript" /* TypeScript */ || lang === "tsx" /* TypeScriptTsx */ || lang === "javascript" /* JavaScript */) && nodeKind === "method_definition" && currentNode.namedChildren.some((c) => c.type === "property_identifier" && c.text === "constructor")) {
            nodeKind = "constructor";
          }
          let startIndex = currentNode.startIndex;
          const prevSibling = currentNode.previousSibling;
          if (prevSibling !== null) {
            const textBetweenNodes = source.substring(prevSibling.endIndex, currentNode.startIndex);
            const nlIdx = textBetweenNodes.indexOf("\n");
            if (nlIdx === -1) {
              startIndex = prevSibling.endIndex;
            } else {
              startIndex = prevSibling.endIndex + nlIdx + 1;
            }
          }
          let endIndex = currentNode.endIndex;
          if (currentNode.nextSibling !== null) {
            let nextSibling = currentNode.nextSibling;
            if (lang === "typescript" /* TypeScript */ || lang === "tsx" /* TypeScriptTsx */ || lang === "javascript" /* JavaScript */ || lang === "cpp" /* Cpp */) {
              while (nextSibling && (nextSibling.type === ";" || nextSibling.type === "," || nextSibling.type === "comment" && !source.substring(endIndex, nextSibling.startIndex).includes("\n"))) {
                excludedRanges.push(TreeSitterOffsetRange.ofSyntaxNode(nextSibling));
                endIndex = nextSibling.endIndex;
                nextSibling = nextSibling.nextSibling;
              }
            }
            if (nextSibling !== null) {
              const textBetweenNodes = source.substring(endIndex, nextSibling.startIndex);
              const nlIdx = textBetweenNodes.indexOf("\n");
              if (nlIdx !== -1) {
                endIndex = endIndex + nlIdx + 1;
              }
            }
          }
          const newNode = new OverlayNode(startIndex, endIndex, nodeKind, []);
          currentParent.children.push(newNode);
          parentStack.push(currentParent, newNode);
        }
      }
      return root;
    } catch (e) {
      console.error(e instanceof Error ? e : new Error(e));
    } finally {
      treeRef.dispose();
    }
  }
};
var structureComputer = new StructureComputer();

// src/platform/parser/node/docGenParsing.ts
async function _getNodeToDocument(language2, source, selection) {
  const treeRef = await _parse(language2, source);
  try {
    const isSelectionEmpty = selection.startIndex === selection.endIndex;
    const selectionMatchedNode = isSelectionEmpty ? void 0 : _getNodeMatchingSelection(treeRef.tree, selection, language2);
    if (selectionMatchedNode) {
      const unwrapped = unwrapPythonDecoratedDefinition(selectionMatchedNode, language2);
      const nodeIdentifier2 = extractIdentifier(unwrapped, language2);
      return {
        nodeIdentifier: nodeIdentifier2,
        nodeToDocument: Node2.ofSyntaxNode(unwrapped),
        nodeSelectionBy: "matchingSelection"
      };
    }
    const nodeContainingCursor = treeRef.tree.rootNode.descendantForIndex(selection.startIndex, selection.endIndex);
    let nodeToDocument = nodeContainingCursor;
    let nNodesClimbedUp = 0;
    while (!isDocumentableNode(nodeToDocument, language2) && nodeToDocument.parent !== null) {
      nodeToDocument = nodeToDocument.parent;
      ++nNodesClimbedUp;
    }
    nodeToDocument = unwrapPythonDecoratedDefinition(nodeToDocument, language2);
    const nodeIdentifier = extractIdentifier(nodeToDocument, language2);
    return {
      nodeIdentifier,
      nodeToDocument: Node2.ofSyntaxNode(nodeToDocument),
      nodeSelectionBy: "expanding"
    };
  } finally {
    treeRef.dispose();
  }
}
async function _getDocumentableNodeIfOnIdentifier(language2, source, range) {
  const treeRef = await _parse(language2, source);
  try {
    const smallestNodeContainingRange = treeRef.tree.rootNode.descendantForIndex(range.startIndex, range.endIndex);
    if (smallestNodeContainingRange.type.match(/identifier/) && (smallestNodeContainingRange.parent === null || isDocumentableNode(smallestNodeContainingRange.parent, language2))) {
      const parent = smallestNodeContainingRange.parent === null ? null : unwrapPythonDecoratedDefinition(smallestNodeContainingRange.parent, language2);
      const parentNodeRange = parent === null ? void 0 : { startIndex: parent.startIndex, endIndex: parent.endIndex };
      return {
        identifier: smallestNodeContainingRange.text,
        nodeRange: parentNodeRange
      };
    }
  } finally {
    treeRef.dispose();
  }
}

// src/platform/parser/node/testGenParsing.ts
async function _findLastTest(lang, src) {
  const treeRef = await _parse(lang, src);
  try {
    const queryResults = runQueries(testInSuiteQueries[lang], treeRef.tree.rootNode);
    const captures = queryResults.flatMap((e) => e.captures).sort((a, b) => a.node.endIndex - b.node.endIndex).filter((c) => c.name === "test");
    if (captures.length === 0) {
      return null;
    }
    const lastTest = captures[captures.length - 1].node;
    return {
      startIndex: lastTest.startIndex,
      endIndex: lastTest.endIndex
    };
  } finally {
    treeRef.dispose();
  }
}

// src/platform/parser/node/parserImpl.ts
var Parser4 = require_tree_sitter();
function queryCoarseScopes(language2, root) {
  const queries = coarseScopesQuery[language2];
  return runQueries(queries, root);
}
function queryFunctions(language2, root) {
  const queries = functionQuery[language2];
  return runQueries(queries, root);
}
function queryCallExpressions(language2, root) {
  const queries = callExpressionQuery[language2];
  if (!queries) {
    return [];
  }
  return runQueries(queries, root);
}
function queryClasses(language2, root) {
  const queries = classDeclarationQuery[language2];
  if (!queries) {
    return [];
  }
  return runQueries(queries, root);
}
function queryTypeDeclarations(language2, root) {
  const queries = typeDeclarationQuery[language2];
  if (!queries) {
    return [];
  }
  return runQueries(queries, root);
}
function queryTypeReferences(language2, root) {
  const queries = typeReferenceQuery[language2];
  if (!queries) {
    return [];
  }
  return runQueries(queries, root);
}
function queryClassReferences(language2, root) {
  const queries = classReferenceQuery[language2];
  if (!queries) {
    return [];
  }
  return runQueries(queries, root);
}
function querySemanticTargets(language2, root) {
  const queries = semanticChunkingTargetQuery[language2];
  return runQueries(queries, root);
}
async function _getCallExpressions(language2, source, selection) {
  const treeRef = await _parse(language2, source);
  try {
    const results = queryCallExpressions(language2, treeRef.tree.rootNode);
    const positions = results.reduce((acc, res) => {
      const fn = res.captures.find((c) => c.name === "call_expression").node;
      if (TreeSitterOffsetRange.doIntersect(selection, fn)) {
        let identifier;
        let identifierNode;
        if (language2 === "ruby") {
          identifierNode = res.captures.find((c) => c.name === "symbol")?.node;
          identifier = identifierNode?.text?.slice(1);
        }
        identifierNode ??= res.captures.find((c) => c.name === "identifier")?.node;
        identifier ??= identifierNode?.text;
        acc.push({
          identifier: identifier ?? "",
          text: fn.text,
          startIndex: (identifierNode ?? fn).startIndex,
          endIndex: (identifierNode ?? fn).endIndex
        });
      }
      return acc;
    }, []);
    return positions;
  } finally {
    treeRef.dispose();
  }
}
async function _getFunctionDefinitions(language2, source) {
  const treeRef = await _parse(language2, source);
  try {
    const results = queryFunctions(language2, treeRef.tree.rootNode);
    const positions = results.map((res) => {
      const fn = res.captures.find((c) => c.name === "function").node;
      const identifier = res.captures.find((c) => c.name === "identifier")?.node.text;
      return {
        identifier: identifier ?? "",
        text: fn.text,
        startIndex: fn.startIndex,
        endIndex: fn.endIndex
      };
    });
    return positions;
  } finally {
    treeRef.dispose();
  }
}
async function _getClassDeclarations(language2, source) {
  const treeRef = await _parse(language2, source);
  try {
    const results = queryClasses(language2, treeRef.tree.rootNode);
    const positions = results.map((res) => {
      const fn = res.captures.find((c) => c.name === "class_declaration").node;
      const identifier = fn?.children.find(
        (c) => c.type === "type_identifier" || c.type === "identifier" || c.type === "constant"
        // ruby
      )?.text;
      return {
        identifier: identifier ?? "",
        text: fn.text,
        startIndex: fn.startIndex,
        endIndex: fn.endIndex
      };
    });
    return positions;
  } finally {
    treeRef.dispose();
  }
}
async function _getTypeDeclarations(language2, source) {
  const treeRef = await _parse(language2, source);
  try {
    const results = queryTypeDeclarations(language2, treeRef.tree.rootNode);
    const positions = results.map((res) => {
      const fn = res.captures.find((c) => c.name === "type_declaration").node;
      let identifier = res.captures.find((c) => c.name === "type_identifier")?.node.text;
      if (!identifier) {
        identifier = fn?.children.find((c) => c.type === "type_identifier")?.text;
      }
      return {
        identifier: identifier ?? "",
        text: fn.text,
        startIndex: fn.startIndex,
        endIndex: fn.endIndex
      };
    });
    return positions;
  } finally {
    treeRef.dispose();
  }
}
async function _getTypeReferences(language2, source, selection) {
  const treeRef = await _parse(language2, source);
  try {
    const results = queryTypeReferences(language2, treeRef.tree.rootNode);
    const positions = results.reduce((acc, res) => {
      const typeIdentifier = res.captures.find((c) => c.name === "type_identifier").node;
      if (TreeSitterOffsetRange.doIntersect(selection, typeIdentifier)) {
        acc.push({
          identifier: typeIdentifier.text,
          text: typeIdentifier.text,
          startIndex: typeIdentifier.startIndex,
          endIndex: typeIdentifier.endIndex
        });
      }
      return acc;
    }, []);
    return positions;
  } finally {
    treeRef.dispose();
  }
}
async function _getClassReferences(language2, source, selection) {
  const treeRef = await _parse(language2, source);
  try {
    const results = queryClassReferences(language2, treeRef.tree.rootNode);
    const positions = results.reduce((acc, res) => {
      const fn = res.captures.find((c) => c.name === "new_expression").node;
      if (TreeSitterOffsetRange.doIntersect(selection, fn)) {
        acc.push({
          identifier: fn.text,
          text: fn.text,
          startIndex: fn.startIndex,
          endIndex: fn.endIndex
        });
      }
      return acc;
    }, []);
    return positions;
  } finally {
    treeRef.dispose();
  }
}
async function _getSymbols(language2, source, selection) {
  const treeRef = await _parse(language2, source);
  try {
    const queries = symbolQueries[language2];
    const results = runQueries(queries, treeRef.tree.rootNode);
    const positions = results.reduce((acc, res) => {
      const fn = res.captures.find((c) => c.name === "symbol").node;
      if (TreeSitterOffsetRange.doIntersect(selection, fn)) {
        acc.push({
          identifier: fn.text,
          text: fn.text,
          startIndex: fn.startIndex,
          endIndex: fn.endIndex
        });
      }
      return acc;
    }, []);
    return positions;
  } finally {
    treeRef.dispose();
  }
}
async function _getSemanticChunkTree(language2, source) {
  const treeRef = await _parse(language2, source);
  try {
    const results = querySemanticTargets(language2, treeRef.tree.rootNode);
    return getQueryMatchTree(language2, results, treeRef.tree.rootNode);
  } finally {
    treeRef.dispose();
  }
}
async function _getSemanticChunkNames(language2, source) {
  const treeRef = await _parse(language2, source);
  try {
    const results = querySemanticTargets(language2, treeRef.tree.rootNode);
    return getBlockNameTree(language2, results, treeRef.tree.rootNode);
  } finally {
    treeRef.dispose();
  }
}
async function _getFunctionBodies(language2, source) {
  const treeRef = await _parse(language2, source);
  try {
    const results = queryFunctions(language2, treeRef.tree.rootNode);
    const positions = results.map((res) => {
      const fn = res.captures.find((c) => c.name === "body").node;
      return {
        startIndex: fn.startIndex,
        endIndex: fn.endIndex
      };
    });
    return positions;
  } finally {
    treeRef.dispose();
  }
}
async function _getCoarseParentScope(language2, source, range) {
  const treeRef = await _parse(language2, source);
  try {
    const scopes = queryCoarseScopes(language2, treeRef.tree.rootNode);
    let parentNode;
    for (const scope of scopes) {
      const captureNode = scope.captures[0].node;
      const captureNodeRange = TreeSitterPointRange.ofSyntaxNode(captureNode);
      if (TreeSitterPointRange.doesContain(captureNodeRange, range)) {
        parentNode = captureNode;
      }
      if (TreeSitterPoint.isBefore(range.endPosition, captureNodeRange.startPosition)) {
        break;
      }
    }
    if (!parentNode) {
      throw new Error("No parent node found");
    } else {
      return TreeSitterPointRange.ofSyntaxNode(parentNode);
    }
  } finally {
    treeRef.dispose();
  }
}
async function _getFixSelectionOfInterest(language2, source, range, maxNumberOfLines) {
  const treeRef = await _parse(language2, source);
  try {
    const smallestNode = treeRef.tree.rootNode.descendantForPosition(range.startPosition, range.endPosition);
    const initialRange = { startPosition: smallestNode.startPosition, endPosition: smallestNode.endPosition };
    const biggestRange = _getBiggestRangeContainingNodeSmallerThan(language2, smallestNode, maxNumberOfLines, range, true);
    if (TreeSitterPointRange.equals(initialRange, biggestRange)) {
      return _getSmallestRangeContainingNode(language2, smallestNode);
    }
    return biggestRange;
  } finally {
    treeRef.dispose();
  }
}
function _getSmallestRangeContainingNode(language2, node) {
  const parent = node.parent;
  const range = { startPosition: node.startPosition, endPosition: node.endPosition };
  if (_isScope(language2, node) || !parent) {
    return range;
  }
  const { filteredRanges, indexOfInterest } = _findFilteredRangesAndIndexOfInterest(language2, parent.children, range, false);
  if (indexOfInterest - 1 >= 0 && indexOfInterest + 1 <= filteredRanges.length - 1) {
    const siblingAbove = filteredRanges[indexOfInterest - 1];
    const siblingBelow = filteredRanges[indexOfInterest + 1];
    return { startPosition: siblingAbove.startPosition, endPosition: siblingBelow.endPosition };
  }
  return _getSmallestRangeContainingNode(language2, parent);
}
function _getBiggestRangeContainingNodeSmallerThan(language2, node, maxNumberOfLines, range, firstCall) {
  const children = node.children;
  const lengthSpannedByNode = node.endPosition.row - node.startPosition.row + 1;
  if (lengthSpannedByNode <= maxNumberOfLines) {
    const newRange = _isScope(language2, node) ? { startPosition: node.startPosition, endPosition: node.endPosition } : _getBiggestRangeContainingNodeAmongNodesSmallerThan(language2, children, maxNumberOfLines, range, firstCall);
    const parent = node.parent;
    return parent ? _getBiggestRangeContainingNodeSmallerThan(language2, parent, maxNumberOfLines, newRange, false) : newRange;
  }
  return _getBiggestRangeContainingNodeAmongNodesSmallerThan(language2, children, maxNumberOfLines, range, firstCall);
}
function _numberOfLinesSpannedByRanges(range1, range2) {
  return range2.endPosition.row - range1.startPosition.row + 1;
}
function _getBiggestRangeContainingNodeAmongNodesSmallerThan(language2, nodes, maxNumberOfLines, lastRange, firstCall) {
  if (nodes.length === 0) {
    return lastRange;
  }
  const { filteredRanges, indexOfInterest } = _findFilteredRangesAndIndexOfInterest(language2, nodes, lastRange, firstCall);
  let siblingAboveIndex = 0;
  let siblingBelowIndex = filteredRanges.length - 1;
  let siblingAbove = filteredRanges[siblingAboveIndex];
  let siblingBelow = filteredRanges[siblingBelowIndex];
  while (_numberOfLinesSpannedByRanges(siblingAbove, siblingBelow) > maxNumberOfLines) {
    if (siblingAboveIndex === siblingBelowIndex) {
      break;
    } else if (indexOfInterest - siblingAboveIndex < siblingBelowIndex - indexOfInterest) {
      siblingBelowIndex--;
      siblingBelow = filteredRanges[siblingBelowIndex];
    } else {
      siblingAboveIndex++;
      siblingAbove = filteredRanges[siblingAboveIndex];
    }
  }
  if (_numberOfLinesSpannedByRanges(siblingAbove, siblingBelow) <= maxNumberOfLines) {
    return { startPosition: siblingAbove.startPosition, endPosition: siblingBelow.endPosition };
  }
  return lastRange;
}
function _findFilteredRangesAndIndexOfInterest(language2, nodes, range, firstCall) {
  let filteredRanges;
  let indexOfInterest;
  if (firstCall) {
    filteredRanges = nodes.filter((child) => _isScope(language2, child) || _isStatement(language2, child));
    indexOfInterest = findInsertionIndexInSortedArray(filteredRanges, range, (a, b) => TreeSitterPoint.isBefore(a.startPosition, b.startPosition));
    filteredRanges.splice(indexOfInterest, 0, range);
  } else {
    filteredRanges = nodes.filter((child) => TreeSitterPointRange.doesContain(child, range) || _isScope(language2, child) || _isStatement(language2, child));
    indexOfInterest = filteredRanges.findIndex((child) => TreeSitterPointRange.doesContain(child, range));
  }
  if (indexOfInterest === -1) {
    throw new Error(`Valid index not found`);
  }
  return { filteredRanges, indexOfInterest };
}
async function _getFineScopes(language2, source, selection) {
  const blockScopes = [];
  const treeRef = await _parse(language2, source);
  const syntaxNode = treeRef.tree.rootNode.descendantForIndex(selection.startIndex, selection.endIndex);
  let currentNode = syntaxNode;
  while (currentNode !== null) {
    if (_isFineScope(language2, currentNode)) {
      blockScopes.push({ startIndex: currentNode.startIndex, endIndex: currentNode.endIndex });
    }
    currentNode = currentNode.parent;
  }
  return blockScopes;
}
async function _getNodeToExplain(language2, source, selection) {
  const treeRef = await _parse(language2, source);
  try {
    const isSelectionEmpty = selection.startIndex === selection.endIndex;
    if (isSelectionEmpty) {
      return;
    }
    const identifier = isSelectionEmpty ? void 0 : _getNodeMatchingSelection(treeRef.tree, selection, language2);
    const fullDefinition = isSelectionEmpty ? void 0 : _getNodeMatchingSelection(treeRef.tree, selection, language2, isExplainableNode);
    if (fullDefinition && identifier) {
      const nodeIdentifier = extractIdentifier(identifier, language2);
      return {
        nodeIdentifier,
        nodeToExplain: Node2.ofSyntaxNode(fullDefinition)
      };
    }
  } finally {
    treeRef.dispose();
  }
}
function isExplainableNode(node, language2) {
  return node.type.match(/definition/);
}
function getBlockNameTree(language2, queryMatches, root) {
  const matches = /* @__PURE__ */ new Map();
  queryMatches.forEach((n) => {
    const captures = n.captures;
    let definitionNode = captures.find((v) => v.name === "definition")?.node;
    let keyword;
    if (language2 === "cpp" /* Cpp */ && definitionNode?.type === "function_definition") {
      keyword = definitionNode?.childForFieldName("declarator")?.childForFieldName("declarator");
    } else if (language2 === "rust" /* Rust */ && definitionNode?.type === "impl_item") {
      keyword = definitionNode?.childForFieldName("trait");
    } else {
      keyword = definitionNode?.childForFieldName("name");
    }
    const bodyNode = definitionNode?.childForFieldName("body");
    if (definitionNode && bodyNode) {
      switch (language2) {
        case "typescript" /* TypeScript */:
        case "javascript" /* JavaScript */: {
          const { definition } = getCommentsAndDefFromTSJSDefinition(definitionNode);
          definitionNode = definition;
          break;
        }
      }
      const existingMatch = matches.get(definitionNode.id);
      if (!existingMatch) {
        matches.set(definitionNode.id, {
          mainBlock: TreeSitterChunkHeaderInfo.ofSyntaxNode(definitionNode),
          detailBlocks: {
            body: TreeSitterChunkHeaderInfo.ofSyntaxNode(bodyNode),
            name: keyword?.text
          }
        });
      }
    }
  });
  const groups = Array.from(matches.values());
  return new QueryMatchTree(groups, TreeSitterChunkHeaderInfo.ofSyntaxNode(root));
}
function getQueryMatchTree(language2, queryMatches, root) {
  let groups;
  switch (language2) {
    case "python" /* Python */:
      groups = queryCapturesToPythonSemanticGroup(queryMatches);
      break;
    case "ruby" /* Ruby */:
      groups = queryCapturesToRubySemanticGroup(queryMatches);
      break;
    default: {
      groups = queryCapturesToGenericSemanticGroup(queryMatches, language2);
      break;
    }
  }
  const queryTree = new QueryMatchTree(groups, TreeSitterChunkHeaderInfo.ofSyntaxNode(root));
  return queryTree;
}
function queryCapturesToGenericSemanticGroup(queryMatches, wasmLang) {
  const matches = /* @__PURE__ */ new Map();
  queryMatches.forEach((n) => {
    const captures = n.captures;
    let definitionNode = captures.find((v) => v.name === "definition")?.node;
    const bodyNode = definitionNode?.childForFieldName("body");
    if (definitionNode && bodyNode) {
      let commentNodes;
      switch (wasmLang) {
        case "typescript" /* TypeScript */:
        case "javascript" /* JavaScript */: {
          const { definition, comments } = getCommentsAndDefFromTSJSDefinition(definitionNode);
          definitionNode = definition;
          commentNodes = comments;
          break;
        }
        case "java" /* Java */:
        case "rust" /* Rust */:
          commentNodes = getCommentsFromJavaRustDefinition(definitionNode);
          break;
        default: {
          commentNodes = getCommentsFromDefinition(definitionNode);
          break;
        }
      }
      const existingMatch = matches.get(definitionNode.id);
      if (!existingMatch) {
        matches.set(definitionNode.id, {
          mainBlock: TreeSitterChunkHeaderInfo.ofSyntaxNode(definitionNode),
          detailBlocks: {
            comments: commentNodes.map((e) => TreeSitterChunkHeaderInfo.ofSyntaxNode(e)),
            body: TreeSitterChunkHeaderInfo.ofSyntaxNode(bodyNode)
          }
        });
      }
    }
  });
  return Array.from(matches.values());
}
function getFirstBodyParamForRuby(namedNodes) {
  if (namedNodes.length < 2) {
    return void 0;
  }
  for (let i2 = 1; i2 < namedNodes.length; i2++) {
    const node = namedNodes[i2];
    if (!node.type.includes("parameters")) {
      return node;
    }
  }
  return void 0;
}
function queryCapturesToRubySemanticGroup(queryMatches) {
  const matches = /* @__PURE__ */ new Map();
  queryMatches.forEach((n) => {
    const captures = n.captures;
    const definitionNode = captures.find((v) => v.name === "definition")?.node;
    if (definitionNode) {
      const defChildren = definitionNode.namedChildren;
      const startChild = getFirstBodyParamForRuby(defChildren);
      if (startChild) {
        const endChild = defChildren[defChildren.length - 1];
        const childText = definitionNode.text.substring(startChild.startIndex - definitionNode.startIndex, endChild.endIndex - definitionNode.startIndex);
        const commentNodes = getCommentsFromDefinition(definitionNode);
        const existingMatch = matches.get(definitionNode.id);
        if (!existingMatch) {
          matches.set(definitionNode.id, {
            mainBlock: TreeSitterChunkHeaderInfo.ofSyntaxNode(definitionNode),
            detailBlocks: {
              comments: commentNodes.map((e) => TreeSitterChunkHeaderInfo.ofSyntaxNode(e)),
              body: {
                range: {
                  startPosition: { row: startChild.startPosition.row, column: startChild.startPosition.column },
                  endPosition: { row: endChild.endPosition.row, column: endChild.endPosition.column }
                },
                startIndex: startChild.startIndex,
                text: childText,
                endIndex: endChild.endIndex
              }
            }
          });
        }
      }
    }
  });
  return Array.from(matches.values());
}
function queryCapturesToPythonSemanticGroup(queryMatches) {
  const matches = /* @__PURE__ */ new Map();
  queryMatches.forEach((n) => {
    const captures = n.captures;
    const definitionNode = captures.find((v) => v.name === "definition")?.node;
    const bodyNode = definitionNode?.childForFieldName("body");
    if (definitionNode && bodyNode) {
      const docstringNode = getDocstringFromBody(bodyNode);
      const decoratorNode = getDecoratorFromDefinition(definitionNode);
      matches.set(definitionNode.id, {
        mainBlock: TreeSitterChunkHeaderInfo.ofSyntaxNode(definitionNode),
        detailBlocks: {
          docstring: docstringNode ? TreeSitterChunkHeaderInfo.ofSyntaxNode(docstringNode) : void 0,
          decorator: decoratorNode ? TreeSitterChunkHeaderInfo.ofSyntaxNode(decoratorNode) : void 0,
          body: TreeSitterChunkHeaderInfo.ofSyntaxNode(bodyNode)
        }
      });
      return;
    }
  });
  return Array.from(matches.values());
}
function getCommentsFromDefinition(definition, commentNodeNames = ["comment"]) {
  const ret = [];
  let prevSibling = definition.previousNamedSibling;
  while (prevSibling && commentNodeNames.some((e) => e === prevSibling?.type)) {
    ret.push(prevSibling);
    prevSibling = prevSibling.previousNamedSibling;
  }
  return ret.reverse();
}
function getCommentsAndDefFromTSJSDefinition(definition) {
  const parent = definition.parent;
  if (parent?.type === "export_statement") {
    return {
      definition: parent,
      comments: getCommentsFromDefinition(parent)
    };
  }
  return {
    definition,
    comments: getCommentsFromDefinition(definition)
  };
}
function getCommentsFromJavaRustDefinition(definition) {
  return getCommentsFromDefinition(definition, ["block_comment", "line_comment"]);
}
function getDecoratorFromDefinition(definition) {
  const prevSibling = definition.previousNamedSibling;
  return prevSibling?.type === "decorator" ? prevSibling : void 0;
}
function getDocstringFromBody(body2) {
  const firstChild = body2.firstChild;
  if (!firstChild || firstChild.type !== "expression_statement") {
    return;
  }
  const potentialDocstring = firstChild.firstChild;
  return potentialDocstring?.type === "string" ? potentialDocstring : void 0;
}
function _getStructure(lang, source) {
  return structureComputer.getStructure(lang, source);
}
async function _getParseErrorCount(language2, source) {
  const treeRef = await _parse(language2, source);
  try {
    let countErrors2 = function(node) {
      let count = node.type === "ERROR" ? 1 : 0;
      for (const child of node.children) {
        count += countErrors2(child);
      }
      return count;
    };
    var countErrors = countErrors2;
    if (!treeRef.tree.rootNode.hasError) {
      return 0;
    }
    return countErrors2(treeRef.tree.rootNode);
  } finally {
    treeRef.dispose();
  }
}

// src/platform/parser/node/parserWorker.ts
function main() {
  const port = import_worker_threads.parentPort;
  if (!port) {
    throw new Error(`This module should only be used in a worker thread.`);
  }
  port.on("message", async ({ id, fn, args: args2 }) => {
    try {
      const res = await parserImpl_exports[fn](...args2);
      port.postMessage({ id, res });
    } catch (err2) {
      port.postMessage({ id, err: err2 });
    }
  });
}
main();
//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'
//# sourceMappingURL=worker2.js.map
