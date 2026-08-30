import { createWriteStream, promises } from "fs";
import { createCancelablePromise, Sequencer } from "../common/async.js";
import * as path from "../common/path.js";
import { assertReturnsDefined } from "../common/types.js";
import { Promises } from "./pfs.js";
import * as nls from "../../nls.js";
const CorruptZipMessage = "end of central directory record signature not found";
const CORRUPT_ZIP_PATTERN = new RegExp(CorruptZipMessage);
class ExtractError extends Error {
  constructor(type, cause) {
    let message = cause.message;
    switch (type) {
      case "CorruptZip":
        message = `Corrupt ZIP: ${message}`;
        break;
    }
    super(message);
    this.type = type;
    this.cause = cause;
  }
}
function modeFromEntry(entry) {
  const attr = entry.externalFileAttributes >> 16 || 33188;
  return [
    448,
    56,
    7
    /* S_IRWXO */
  ].map((mask) => attr & mask).reduce(
    (a, b) => a + b,
    attr & 61440
    /* S_IFMT */
  );
}
function toExtractError(err) {
  if (err instanceof ExtractError) {
    return err;
  }
  let type = void 0;
  if (CORRUPT_ZIP_PATTERN.test(err.message)) {
    type = "CorruptZip";
  }
  return new ExtractError(type, err);
}
function extractEntry(stream, fileName, mode, targetPath, options, token) {
  const dirName = path.dirname(fileName);
  const targetDirName = path.join(targetPath, dirName);
  if (!targetDirName.startsWith(targetPath)) {
    return Promise.reject(new Error(nls.localize("invalid file", "Error extracting {0}. Invalid file.", fileName)));
  }
  const targetFileName = path.join(targetPath, fileName);
  let istream;
  const listener = token.onCancellationRequested(() => {
    istream?.destroy();
  });
  return Promise.resolve(promises.mkdir(targetDirName, { recursive: true })).then(() => new Promise((c, e) => {
    if (token.isCancellationRequested) {
      c();
      return;
    }
    try {
      istream = createWriteStream(targetFileName, { mode });
      istream.once("close", () => c());
      istream.once("error", e);
      stream.once("error", e);
      stream.pipe(istream);
    } catch (error) {
      e(error);
    }
  })).finally(() => listener.dispose());
}
function extractZip(zipfile, targetPath, options, token) {
  let last = createCancelablePromise(() => Promise.resolve());
  let extractedEntriesCount = 0;
  const listener = token.onCancellationRequested(() => {
    last.cancel();
    zipfile.close();
  });
  return new Promise((c, e) => {
    const throttler = new Sequencer();
    const readNextEntry = (token2) => {
      if (token2.isCancellationRequested) {
        return;
      }
      extractedEntriesCount++;
      zipfile.readEntry();
    };
    zipfile.once("error", e);
    zipfile.once("close", () => last.then(() => {
      if (token.isCancellationRequested || zipfile.entryCount === extractedEntriesCount) {
        c();
      } else {
        e(new ExtractError("Incomplete", new Error(nls.localize("incompleteExtract", "Incomplete. Found {0} of {1} entries", extractedEntriesCount, zipfile.entryCount))));
      }
    }, e));
    zipfile.readEntry();
    zipfile.on("entry", (entry) => {
      if (token.isCancellationRequested) {
        return;
      }
      if (!options.sourcePathRegex.test(entry.fileName)) {
        readNextEntry(token);
        return;
      }
      const fileName = entry.fileName.replace(options.sourcePathRegex, "");
      if (/\/$/.test(fileName)) {
        const targetFileName = path.join(targetPath, fileName);
        last = createCancelablePromise((token2) => promises.mkdir(targetFileName, { recursive: true }).then(() => readNextEntry(token2)).then(void 0, e));
        return;
      }
      const stream = openZipStream(zipfile, entry);
      const mode = modeFromEntry(entry);
      last = createCancelablePromise((token2) => throttler.queue(() => stream.then((stream2) => extractEntry(stream2, fileName, mode, targetPath, options, token2).then(() => readNextEntry(token2)))).then(null, e));
    });
  }).finally(() => listener.dispose());
}
async function openZip(zipFile, lazy = false) {
  const { open } = await import("yauzl");
  return new Promise((resolve, reject) => {
    open(zipFile, lazy ? { lazyEntries: true } : void 0, (error, zipfile) => {
      if (error) {
        reject(toExtractError(error));
      } else {
        resolve(assertReturnsDefined(zipfile));
      }
    });
  });
}
function openZipStream(zipFile, entry) {
  return new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error) {
        reject(toExtractError(error));
      } else {
        resolve(assertReturnsDefined(stream));
      }
    });
  });
}
async function zip(zipPath, files) {
  const { ZipFile } = await import("yazl");
  const zip2 = new ZipFile();
  const zipStream = createWriteStream(zipPath);
  const result = new Promise((c, e) => {
    zip2.outputStream.once("error", e);
    zipStream.once("error", e);
    zipStream.once("finish", () => c(zipPath));
  });
  zip2.outputStream.pipe(zipStream);
  for (const f of files) {
    if (f.contents !== void 0) {
      zip2.addBuffer(typeof f.contents === "string" ? Buffer.from(f.contents, "utf8") : f.contents, f.path);
    } else if (f.localPath) {
      if (f.localPathSize === void 0) {
        zip2.addFile(f.localPath, f.path);
      } else {
        let handle;
        try {
          handle = await promises.open(f.localPath, "r");
        } catch (error) {
          if (error.code === "ENOENT") {
            continue;
          }
          throw error;
        }
        let streamOwnsHandle = false;
        try {
          const size = Math.min(f.localPathSize, (await handle.stat()).size);
          if (size === 0) {
            zip2.addBuffer(Buffer.alloc(0), f.path);
          } else {
            const readStream = handle.createReadStream({ start: 0, end: size - 1 });
            readStream.once("error", (error) => zip2.outputStream.emit("error", error));
            zip2.addReadStream(readStream, f.path, { size });
            streamOwnsHandle = true;
          }
        } finally {
          if (!streamOwnsHandle) {
            await handle.close();
          }
        }
      }
    }
  }
  zip2.end();
  return result;
}
function extract(zipPath, targetPath, options = {}, token) {
  const sourcePathRegex = new RegExp(options.sourcePath ? `^${options.sourcePath}` : "");
  let promise = openZip(zipPath, true);
  if (options.overwrite) {
    promise = promise.then((zipfile) => Promises.rm(targetPath).then(() => zipfile));
  }
  return promise.then((zipfile) => extractZip(zipfile, targetPath, { sourcePathRegex }, token));
}
function read(zipPath, filePath) {
  return openZip(zipPath).then((zipfile) => {
    return new Promise((c, e) => {
      zipfile.once("error", (err) => e(toExtractError(err)));
      zipfile.on("entry", (entry) => {
        if (entry.fileName === filePath) {
          openZipStream(zipfile, entry).then((stream) => c(stream), (err) => e(err));
        }
      });
      zipfile.once("close", () => e(new Error(nls.localize("notFound", "{0} not found inside zip.", filePath))));
    });
  });
}
function buffer(zipPath, filePath) {
  return read(zipPath, filePath).then((stream) => {
    return new Promise((c, e) => {
      const buffers = [];
      stream.once("error", e);
      stream.on("data", (b) => buffers.push(b));
      stream.on("end", () => c(Buffer.concat(buffers)));
    });
  });
}
export {
  CorruptZipMessage,
  ExtractError,
  buffer,
  extract,
  zip
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxub2RlXFx6aXAudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBjcmVhdGVXcml0ZVN0cmVhbSwgV3JpdGVTdHJlYW0sIHByb21pc2VzIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHR5cGUgeyBGaWxlSGFuZGxlIH0gZnJvbSAnZnMvcHJvbWlzZXMnO1xuaW1wb3J0IHsgUmVhZGFibGUgfSBmcm9tICdzdHJlYW0nO1xuaW1wb3J0IHsgY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UsIFNlcXVlbmNlciB9IGZyb20gJy4uL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICcuLi9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBhc3NlcnRSZXR1cm5zRGVmaW5lZCB9IGZyb20gJy4uL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBQcm9taXNlcyB9IGZyb20gJy4vcGZzLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi9ubHMuanMnO1xuaW1wb3J0IHR5cGUgeyBFbnRyeSwgWmlwRmlsZSB9IGZyb20gJ3lhdXpsJztcblxuZXhwb3J0IGNvbnN0IENvcnJ1cHRaaXBNZXNzYWdlOiBzdHJpbmcgPSAnZW5kIG9mIGNlbnRyYWwgZGlyZWN0b3J5IHJlY29yZCBzaWduYXR1cmUgbm90IGZvdW5kJztcbmNvbnN0IENPUlJVUFRfWklQX1BBVFRFUk4gPSBuZXcgUmVnRXhwKENvcnJ1cHRaaXBNZXNzYWdlKTtcblxuZXhwb3J0IGludGVyZmFjZSBJRXh0cmFjdE9wdGlvbnMge1xuXHRvdmVyd3JpdGU/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBTb3VyY2UgcGF0aCB3aXRoaW4gdGhlIFpJUCBhcmNoaXZlLiBPbmx5IHRoZSBmaWxlcyBjb250YWluZWQgaW4gdGhpc1xuXHQgKiBwYXRoIHdpbGwgYmUgZXh0cmFjdGVkLlxuXHQgKi9cblx0c291cmNlUGF0aD86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIElPcHRpb25zIHtcblx0c291cmNlUGF0aFJlZ2V4OiBSZWdFeHA7XG59XG5cbmV4cG9ydCB0eXBlIEV4dHJhY3RFcnJvclR5cGUgPSAnQ29ycnVwdFppcCcgfCAnSW5jb21wbGV0ZSc7XG5cbmV4cG9ydCBjbGFzcyBFeHRyYWN0RXJyb3IgZXh0ZW5kcyBFcnJvciB7XG5cblx0cmVhZG9ubHkgdHlwZT86IEV4dHJhY3RFcnJvclR5cGU7XG5cblx0Y29uc3RydWN0b3IodHlwZTogRXh0cmFjdEVycm9yVHlwZSB8IHVuZGVmaW5lZCwgY2F1c2U6IEVycm9yKSB7XG5cdFx0bGV0IG1lc3NhZ2UgPSBjYXVzZS5tZXNzYWdlO1xuXG5cdFx0c3dpdGNoICh0eXBlKSB7XG5cdFx0XHRjYXNlICdDb3JydXB0WmlwJzogbWVzc2FnZSA9IGBDb3JydXB0IFpJUDogJHttZXNzYWdlfWA7IGJyZWFrO1xuXHRcdH1cblxuXHRcdHN1cGVyKG1lc3NhZ2UpO1xuXHRcdHRoaXMudHlwZSA9IHR5cGU7XG5cdFx0dGhpcy5jYXVzZSA9IGNhdXNlO1xuXHR9XG59XG5cbmZ1bmN0aW9uIG1vZGVGcm9tRW50cnkoZW50cnk6IEVudHJ5KSB7XG5cdGNvbnN0IGF0dHIgPSBlbnRyeS5leHRlcm5hbEZpbGVBdHRyaWJ1dGVzID4+IDE2IHx8IDMzMTg4O1xuXG5cdHJldHVybiBbNDQ4IC8qIFNfSVJXWFUgKi8sIDU2IC8qIFNfSVJXWEcgKi8sIDcgLyogU19JUldYTyAqL11cblx0XHQubWFwKG1hc2sgPT4gYXR0ciAmIG1hc2spXG5cdFx0LnJlZHVjZSgoYSwgYikgPT4gYSArIGIsIGF0dHIgJiA2MTQ0MCAvKiBTX0lGTVQgKi8pO1xufVxuXG5mdW5jdGlvbiB0b0V4dHJhY3RFcnJvcihlcnI6IEVycm9yKTogRXh0cmFjdEVycm9yIHtcblx0aWYgKGVyciBpbnN0YW5jZW9mIEV4dHJhY3RFcnJvcikge1xuXHRcdHJldHVybiBlcnI7XG5cdH1cblxuXHRsZXQgdHlwZTogRXh0cmFjdEVycm9yVHlwZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRpZiAoQ09SUlVQVF9aSVBfUEFUVEVSTi50ZXN0KGVyci5tZXNzYWdlKSkge1xuXHRcdHR5cGUgPSAnQ29ycnVwdFppcCc7XG5cdH1cblxuXHRyZXR1cm4gbmV3IEV4dHJhY3RFcnJvcih0eXBlLCBlcnIpO1xufVxuXG5mdW5jdGlvbiBleHRyYWN0RW50cnkoc3RyZWFtOiBSZWFkYWJsZSwgZmlsZU5hbWU6IHN0cmluZywgbW9kZTogbnVtYmVyLCB0YXJnZXRQYXRoOiBzdHJpbmcsIG9wdGlvbnM6IElPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0Y29uc3QgZGlyTmFtZSA9IHBhdGguZGlybmFtZShmaWxlTmFtZSk7XG5cdGNvbnN0IHRhcmdldERpck5hbWUgPSBwYXRoLmpvaW4odGFyZ2V0UGF0aCwgZGlyTmFtZSk7XG5cdGlmICghdGFyZ2V0RGlyTmFtZS5zdGFydHNXaXRoKHRhcmdldFBhdGgpKSB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcihubHMubG9jYWxpemUoJ2ludmFsaWQgZmlsZScsIFwiRXJyb3IgZXh0cmFjdGluZyB7MH0uIEludmFsaWQgZmlsZS5cIiwgZmlsZU5hbWUpKSk7XG5cdH1cblx0Y29uc3QgdGFyZ2V0RmlsZU5hbWUgPSBwYXRoLmpvaW4odGFyZ2V0UGF0aCwgZmlsZU5hbWUpO1xuXG5cdGxldCBpc3RyZWFtOiBXcml0ZVN0cmVhbTtcblxuXHRjb25zdCBsaXN0ZW5lciA9IHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRpc3RyZWFtPy5kZXN0cm95KCk7XG5cdH0pO1xuXG5cdHJldHVybiBQcm9taXNlLnJlc29sdmUocHJvbWlzZXMubWtkaXIodGFyZ2V0RGlyTmFtZSwgeyByZWN1cnNpdmU6IHRydWUgfSkpLnRoZW4oKCkgPT4gbmV3IFByb21pc2U8dm9pZD4oKGMsIGUpID0+IHtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdGMoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0aXN0cmVhbSA9IGNyZWF0ZVdyaXRlU3RyZWFtKHRhcmdldEZpbGVOYW1lLCB7IG1vZGUgfSk7XG5cdFx0XHRpc3RyZWFtLm9uY2UoJ2Nsb3NlJywgKCkgPT4gYygpKTtcblx0XHRcdGlzdHJlYW0ub25jZSgnZXJyb3InLCBlKTtcblx0XHRcdHN0cmVhbS5vbmNlKCdlcnJvcicsIGUpO1xuXHRcdFx0c3RyZWFtLnBpcGUoaXN0cmVhbSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGUoZXJyb3IpO1xuXHRcdH1cblx0fSkpLmZpbmFsbHkoKCkgPT4gbGlzdGVuZXIuZGlzcG9zZSgpKTtcbn1cblxuZnVuY3Rpb24gZXh0cmFjdFppcCh6aXBmaWxlOiBaaXBGaWxlLCB0YXJnZXRQYXRoOiBzdHJpbmcsIG9wdGlvbnM6IElPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0bGV0IGxhc3QgPSBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZTx2b2lkPigoKSA9PiBQcm9taXNlLnJlc29sdmUoKSk7XG5cdGxldCBleHRyYWN0ZWRFbnRyaWVzQ291bnQgPSAwO1xuXG5cdGNvbnN0IGxpc3RlbmVyID0gdG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdGxhc3QuY2FuY2VsKCk7XG5cdFx0emlwZmlsZS5jbG9zZSgpO1xuXHR9KTtcblxuXHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKGMsIGUpID0+IHtcblx0XHRjb25zdCB0aHJvdHRsZXIgPSBuZXcgU2VxdWVuY2VyKCk7XG5cblx0XHRjb25zdCByZWFkTmV4dEVudHJ5ID0gKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0ZXh0cmFjdGVkRW50cmllc0NvdW50Kys7XG5cdFx0XHR6aXBmaWxlLnJlYWRFbnRyeSgpO1xuXHRcdH07XG5cblx0XHR6aXBmaWxlLm9uY2UoJ2Vycm9yJywgZSk7XG5cdFx0emlwZmlsZS5vbmNlKCdjbG9zZScsICgpID0+IGxhc3QudGhlbigoKSA9PiB7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgfHwgemlwZmlsZS5lbnRyeUNvdW50ID09PSBleHRyYWN0ZWRFbnRyaWVzQ291bnQpIHtcblx0XHRcdFx0YygpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZShuZXcgRXh0cmFjdEVycm9yKCdJbmNvbXBsZXRlJywgbmV3IEVycm9yKG5scy5sb2NhbGl6ZSgnaW5jb21wbGV0ZUV4dHJhY3QnLCBcIkluY29tcGxldGUuIEZvdW5kIHswfSBvZiB7MX0gZW50cmllc1wiLCBleHRyYWN0ZWRFbnRyaWVzQ291bnQsIHppcGZpbGUuZW50cnlDb3VudCkpKSk7XG5cdFx0XHR9XG5cdFx0fSwgZSkpO1xuXHRcdHppcGZpbGUucmVhZEVudHJ5KCk7XG5cdFx0emlwZmlsZS5vbignZW50cnknLCAoZW50cnk6IEVudHJ5KSA9PiB7XG5cblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICghb3B0aW9ucy5zb3VyY2VQYXRoUmVnZXgudGVzdChlbnRyeS5maWxlTmFtZSkpIHtcblx0XHRcdFx0cmVhZE5leHRFbnRyeSh0b2tlbik7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZmlsZU5hbWUgPSBlbnRyeS5maWxlTmFtZS5yZXBsYWNlKG9wdGlvbnMuc291cmNlUGF0aFJlZ2V4LCAnJyk7XG5cblx0XHRcdC8vIGRpcmVjdG9yeSBmaWxlIG5hbWVzIGVuZCB3aXRoICcvJ1xuXHRcdFx0aWYgKC9cXC8kLy50ZXN0KGZpbGVOYW1lKSkge1xuXHRcdFx0XHRjb25zdCB0YXJnZXRGaWxlTmFtZSA9IHBhdGguam9pbih0YXJnZXRQYXRoLCBmaWxlTmFtZSk7XG5cdFx0XHRcdGxhc3QgPSBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSh0b2tlbiA9PiBwcm9taXNlcy5ta2Rpcih0YXJnZXRGaWxlTmFtZSwgeyByZWN1cnNpdmU6IHRydWUgfSkudGhlbigoKSA9PiByZWFkTmV4dEVudHJ5KHRva2VuKSkudGhlbih1bmRlZmluZWQsIGUpKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzdHJlYW0gPSBvcGVuWmlwU3RyZWFtKHppcGZpbGUsIGVudHJ5KTtcblx0XHRcdGNvbnN0IG1vZGUgPSBtb2RlRnJvbUVudHJ5KGVudHJ5KTtcblxuXHRcdFx0bGFzdCA9IGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKHRva2VuID0+IHRocm90dGxlci5xdWV1ZSgoKSA9PiBzdHJlYW0udGhlbihzdHJlYW0gPT4gZXh0cmFjdEVudHJ5KHN0cmVhbSwgZmlsZU5hbWUsIG1vZGUsIHRhcmdldFBhdGgsIG9wdGlvbnMsIHRva2VuKS50aGVuKCgpID0+IHJlYWROZXh0RW50cnkodG9rZW4pKSkpLnRoZW4obnVsbCwgZSkpO1xuXHRcdH0pO1xuXHR9KS5maW5hbGx5KCgpID0+IGxpc3RlbmVyLmRpc3Bvc2UoKSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIG9wZW5aaXAoemlwRmlsZTogc3RyaW5nLCBsYXp5OiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPFppcEZpbGU+IHtcblx0Y29uc3QgeyBvcGVuIH0gPSBhd2FpdCBpbXBvcnQoJ3lhdXpsJyk7XG5cblx0cmV0dXJuIG5ldyBQcm9taXNlPFppcEZpbGU+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRvcGVuKHppcEZpbGUsIGxhenkgPyB7IGxhenlFbnRyaWVzOiB0cnVlIH0gOiB1bmRlZmluZWQhLCAoZXJyb3I6IEVycm9yIHwgbnVsbCwgemlwZmlsZT86IFppcEZpbGUpID0+IHtcblx0XHRcdGlmIChlcnJvcikge1xuXHRcdFx0XHRyZWplY3QodG9FeHRyYWN0RXJyb3IoZXJyb3IpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc29sdmUoYXNzZXJ0UmV0dXJuc0RlZmluZWQoemlwZmlsZSkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gb3BlblppcFN0cmVhbSh6aXBGaWxlOiBaaXBGaWxlLCBlbnRyeTogRW50cnkpOiBQcm9taXNlPFJlYWRhYmxlPiB7XG5cdHJldHVybiBuZXcgUHJvbWlzZTxSZWFkYWJsZT4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdHppcEZpbGUub3BlblJlYWRTdHJlYW0oZW50cnksIChlcnJvcjogRXJyb3IgfCBudWxsLCBzdHJlYW0/OiBSZWFkYWJsZSkgPT4ge1xuXHRcdFx0aWYgKGVycm9yKSB7XG5cdFx0XHRcdHJlamVjdCh0b0V4dHJhY3RFcnJvcihlcnJvcikpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzb2x2ZShhc3NlcnRSZXR1cm5zRGVmaW5lZChzdHJlYW0pKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGUge1xuXHRwYXRoOiBzdHJpbmc7XG5cdGNvbnRlbnRzPzogQnVmZmVyIHwgc3RyaW5nO1xuXHRsb2NhbFBhdGg/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBXaGVuIHNldCAoYW5kIGBjb250ZW50c2AgaXMgbm90IHByb3ZpZGVkKSwgc3RyZWFtIGF0IG1vc3QgdGhpcyBtYW55IGJ5dGVzXG5cdCAqIGZyb20gdGhlIHN0YXJ0IG9mIHtAbGluayBsb2NhbFBhdGh9IGluc3RlYWQgb2YgYWRkaW5nIHRoZSB3aG9sZSBmaWxlLiBUaGVcblx0ICogcHJlZml4IGlzIGNsYW1wZWQgdG8gdGhlIGZpbGUncyBjdXJyZW50IHNpemUgc28gYSByb3RhdGVkIG9yIHRydW5jYXRlZCBmaWxlXG5cdCAqIHN0aWxsIHByb2R1Y2VzIGEgdmFsaWQgZW50cnkuXG5cdCAqL1xuXHRsb2NhbFBhdGhTaXplPzogbnVtYmVyO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gemlwKHppcFBhdGg6IHN0cmluZywgZmlsZXM6IElGaWxlW10pOiBQcm9taXNlPHN0cmluZz4ge1xuXHRjb25zdCB7IFppcEZpbGUgfSA9IGF3YWl0IGltcG9ydCgneWF6bCcpO1xuXG5cdGNvbnN0IHppcCA9IG5ldyBaaXBGaWxlKCk7XG5cdGNvbnN0IHppcFN0cmVhbSA9IGNyZWF0ZVdyaXRlU3RyZWFtKHppcFBhdGgpO1xuXG5cdC8vIEF0dGFjaCBlcnJvci9maW5pc2ggaGFuZGxpbmcgYmVmb3JlIGFkZGluZyBlbnRyaWVzIHNvIGEgcmVhZCBzdHJlYW0gdGhhdFxuXHQvLyBlcnJvcnMgd2hpbGUgYSBsYXRlciBlbnRyeSBpcyBzdGlsbCBhd2FpdGluZyBJL08gaGFzIGEgbGlzdGVuZXIuXG5cdGNvbnN0IHJlc3VsdCA9IG5ldyBQcm9taXNlPHN0cmluZz4oKGMsIGUpID0+IHtcblx0XHR6aXAub3V0cHV0U3RyZWFtLm9uY2UoJ2Vycm9yJywgZSk7XG5cdFx0emlwU3RyZWFtLm9uY2UoJ2Vycm9yJywgZSk7XG5cdFx0emlwU3RyZWFtLm9uY2UoJ2ZpbmlzaCcsICgpID0+IGMoemlwUGF0aCkpO1xuXHR9KTtcblx0emlwLm91dHB1dFN0cmVhbS5waXBlKHppcFN0cmVhbSk7XG5cblx0Zm9yIChjb25zdCBmIG9mIGZpbGVzKSB7XG5cdFx0aWYgKGYuY29udGVudHMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0emlwLmFkZEJ1ZmZlcih0eXBlb2YgZi5jb250ZW50cyA9PT0gJ3N0cmluZycgPyBCdWZmZXIuZnJvbShmLmNvbnRlbnRzLCAndXRmOCcpIDogZi5jb250ZW50cywgZi5wYXRoKTtcblx0XHR9IGVsc2UgaWYgKGYubG9jYWxQYXRoKSB7XG5cdFx0XHRpZiAoZi5sb2NhbFBhdGhTaXplID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0emlwLmFkZEZpbGUoZi5sb2NhbFBhdGgsIGYucGF0aCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyB5YXpsIGFib3J0cyB0aGUgYXJjaGl2ZSB1bmxlc3MgdGhlIHN0cmVhbWVkIGJ5dGUgY291bnQgbWF0Y2hlcyB0aGVcblx0XHRcdFx0Ly8gZGVjbGFyZWQgc2l6ZS4gRGVyaXZlIGJvdGggZnJvbSBhIHNpbmdsZSBoYW5kbGUgc28gdGhlIGNvdW50cyBtYXRjaFxuXHRcdFx0XHQvLyBldmVuIGlmIHRoZSBwYXRoIGlzIHJvdGF0ZWQgb3IgdHJ1bmNhdGVkIGNvbmN1cnJlbnRseTsgc2tpcCBhXG5cdFx0XHRcdC8vIHZhbmlzaGVkIGZpbGUgcmF0aGVyIHRoYW4gZmFpbGluZyB0aGUgd2hvbGUgYXJjaGl2ZS5cblx0XHRcdFx0bGV0IGhhbmRsZTogRmlsZUhhbmRsZTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRoYW5kbGUgPSBhd2FpdCBwcm9taXNlcy5vcGVuKGYubG9jYWxQYXRoLCAncicpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdGlmICgoZXJyb3IgYXMgTm9kZUpTLkVycm5vRXhjZXB0aW9uKS5jb2RlID09PSAnRU5PRU5UJykge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxldCBzdHJlYW1Pd25zSGFuZGxlID0gZmFsc2U7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3Qgc2l6ZSA9IE1hdGgubWluKGYubG9jYWxQYXRoU2l6ZSwgKGF3YWl0IGhhbmRsZS5zdGF0KCkpLnNpemUpO1xuXHRcdFx0XHRcdGlmIChzaXplID09PSAwKSB7XG5cdFx0XHRcdFx0XHR6aXAuYWRkQnVmZmVyKEJ1ZmZlci5hbGxvYygwKSwgZi5wYXRoKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29uc3QgcmVhZFN0cmVhbSA9IGhhbmRsZS5jcmVhdGVSZWFkU3RyZWFtKHsgc3RhcnQ6IDAsIGVuZDogc2l6ZSAtIDEgfSk7XG5cdFx0XHRcdFx0XHRyZWFkU3RyZWFtLm9uY2UoJ2Vycm9yJywgZXJyb3IgPT4gemlwLm91dHB1dFN0cmVhbS5lbWl0KCdlcnJvcicsIGVycm9yKSk7XG5cdFx0XHRcdFx0XHR6aXAuYWRkUmVhZFN0cmVhbShyZWFkU3RyZWFtLCBmLnBhdGgsIHsgc2l6ZSB9KTtcblx0XHRcdFx0XHRcdHN0cmVhbU93bnNIYW5kbGUgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHQvLyBUaGUgcmVhZCBzdHJlYW0gY2xvc2VzIHRoZSBoYW5kbGUgd2hlbiBpdCBmaW5pc2hlcy5cblx0XHRcdFx0XHRpZiAoIXN0cmVhbU93bnNIYW5kbGUpIHtcblx0XHRcdFx0XHRcdGF3YWl0IGhhbmRsZS5jbG9zZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHR6aXAuZW5kKCk7XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3QoemlwUGF0aDogc3RyaW5nLCB0YXJnZXRQYXRoOiBzdHJpbmcsIG9wdGlvbnM6IElFeHRyYWN0T3B0aW9ucyA9IHt9LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0Y29uc3Qgc291cmNlUGF0aFJlZ2V4ID0gbmV3IFJlZ0V4cChvcHRpb25zLnNvdXJjZVBhdGggPyBgXiR7b3B0aW9ucy5zb3VyY2VQYXRofWAgOiAnJyk7XG5cblx0bGV0IHByb21pc2UgPSBvcGVuWmlwKHppcFBhdGgsIHRydWUpO1xuXG5cdGlmIChvcHRpb25zLm92ZXJ3cml0ZSkge1xuXHRcdHByb21pc2UgPSBwcm9taXNlLnRoZW4oemlwZmlsZSA9PiBQcm9taXNlcy5ybSh0YXJnZXRQYXRoKS50aGVuKCgpID0+IHppcGZpbGUpKTtcblx0fVxuXG5cdHJldHVybiBwcm9taXNlLnRoZW4oemlwZmlsZSA9PiBleHRyYWN0WmlwKHppcGZpbGUsIHRhcmdldFBhdGgsIHsgc291cmNlUGF0aFJlZ2V4IH0sIHRva2VuKSk7XG59XG5cbmZ1bmN0aW9uIHJlYWQoemlwUGF0aDogc3RyaW5nLCBmaWxlUGF0aDogc3RyaW5nKTogUHJvbWlzZTxSZWFkYWJsZT4ge1xuXHRyZXR1cm4gb3BlblppcCh6aXBQYXRoKS50aGVuKHppcGZpbGUgPT4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxSZWFkYWJsZT4oKGMsIGUpID0+IHtcblx0XHRcdHppcGZpbGUub25jZSgnZXJyb3InLCBlcnIgPT4gZSh0b0V4dHJhY3RFcnJvcihlcnIpKSk7XG5cdFx0XHR6aXBmaWxlLm9uKCdlbnRyeScsIChlbnRyeTogRW50cnkpID0+IHtcblx0XHRcdFx0aWYgKGVudHJ5LmZpbGVOYW1lID09PSBmaWxlUGF0aCkge1xuXHRcdFx0XHRcdG9wZW5aaXBTdHJlYW0oemlwZmlsZSwgZW50cnkpLnRoZW4oc3RyZWFtID0+IGMoc3RyZWFtKSwgZXJyID0+IGUoZXJyKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHR6aXBmaWxlLm9uY2UoJ2Nsb3NlJywgKCkgPT4gZShuZXcgRXJyb3IobmxzLmxvY2FsaXplKCdub3RGb3VuZCcsIFwiezB9IG5vdCBmb3VuZCBpbnNpZGUgemlwLlwiLCBmaWxlUGF0aCkpKSk7XG5cdFx0fSk7XG5cdH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYnVmZmVyKHppcFBhdGg6IHN0cmluZywgZmlsZVBhdGg6IHN0cmluZyk6IFByb21pc2U8QnVmZmVyPiB7XG5cdHJldHVybiByZWFkKHppcFBhdGgsIGZpbGVQYXRoKS50aGVuKHN0cmVhbSA9PiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPEJ1ZmZlcj4oKGMsIGUpID0+IHtcblx0XHRcdGNvbnN0IGJ1ZmZlcnM6IEJ1ZmZlcltdID0gW107XG5cdFx0XHRzdHJlYW0ub25jZSgnZXJyb3InLCBlKTtcblx0XHRcdHN0cmVhbS5vbignZGF0YScsIChiOiBCdWZmZXIpID0+IGJ1ZmZlcnMucHVzaChiKSk7XG5cdFx0XHRzdHJlYW0ub24oJ2VuZCcsICgpID0+IGMoQnVmZmVyLmNvbmNhdChidWZmZXJzKSkpO1xuXHRcdH0pO1xuXHR9KTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsbUJBQWdDLGdCQUFnQjtBQUd6RCxTQUFTLHlCQUF5QixpQkFBaUI7QUFFbkQsWUFBWSxVQUFVO0FBQ3RCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsZ0JBQWdCO0FBQ3pCLFlBQVksU0FBUztBQUdkLE1BQU0sb0JBQTRCO0FBQ3pDLE1BQU0sc0JBQXNCLElBQUksT0FBTyxpQkFBaUI7QUFrQmpELE1BQU0scUJBQXFCLE1BQU07QUFBQSxFQUl2QyxZQUFZLE1BQW9DLE9BQWM7QUFDN0QsUUFBSSxVQUFVLE1BQU07QUFFcEIsWUFBUSxNQUFNO0FBQUEsTUFDYixLQUFLO0FBQWMsa0JBQVUsZ0JBQWdCLE9BQU87QUFBSTtBQUFBLElBQ3pEO0FBRUEsVUFBTSxPQUFPO0FBQ2Is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
