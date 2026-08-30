import * as fs from "fs";
import { tmpdir } from "os";
import { promisify } from "util";
import { ResourceQueue, timeout } from "../common/async.js";
import { isEqualOrParent, isRootOrDriveLetter, randomPath } from "../common/extpath.js";
import { normalizeNFC } from "../common/normalization.js";
import { basename, dirname, join, normalize, sep } from "../common/path.js";
import { isLinux, isMacintosh, isWindows } from "../common/platform.js";
import { extUriBiasedIgnorePathCase } from "../common/resources.js";
import { URI } from "../common/uri.js";
import { rtrim } from "../common/strings.js";
var RimRafMode = /* @__PURE__ */ ((RimRafMode2) => {
  RimRafMode2[RimRafMode2["UNLINK"] = 0] = "UNLINK";
  RimRafMode2[RimRafMode2["MOVE"] = 1] = "MOVE";
  return RimRafMode2;
})(RimRafMode || {});
async function rimraf(path, mode = 0 /* UNLINK */, moveToPath) {
  if (isRootOrDriveLetter(path)) {
    throw new Error("rimraf - will refuse to recursively delete root");
  }
  if (mode === 0 /* UNLINK */) {
    return rimrafUnlink(path);
  }
  return rimrafMove(path, moveToPath);
}
async function rimrafMove(path, moveToPath = randomPath(tmpdir())) {
  try {
    try {
      await fs.promises.rename(path, moveToPath);
    } catch (error) {
      if (error.code === "ENOENT") {
        return;
      }
      return rimrafUnlink(path);
    }
    rimrafUnlink(moveToPath).catch(() => {
    });
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}
async function rimrafUnlink(path) {
  return fs.promises.rm(path, { recursive: true, force: true, maxRetries: 3 });
}
async function readdir(path, options) {
  try {
    return await doReaddir(path, options);
  } catch (error) {
    if (error.code === "ENOENT" && isWindows && isRootOrDriveLetter(path)) {
      try {
        return await doReaddir(`${path}.`, options);
      } catch {
      }
    }
    throw error;
  }
}
async function doReaddir(path, options) {
  return handleDirectoryChildren(await (options ? safeReaddirWithFileTypes(path) : fs.promises.readdir(path)));
}
async function safeReaddirWithFileTypes(path) {
  try {
    return await fs.promises.readdir(path, { withFileTypes: true });
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("[node.js fs] readdir with filetypes failed with error: ", error);
    }
  }
  const result = [];
  const children = await readdir(path);
  for (const child of children) {
    let isFile = false;
    let isDirectory = false;
    let isSymbolicLink = false;
    try {
      const lstat = await fs.promises.lstat(join(path, child));
      isFile = lstat.isFile();
      isDirectory = lstat.isDirectory();
      isSymbolicLink = lstat.isSymbolicLink();
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.warn("[node.js fs] unexpected error from lstat after readdir: ", error);
      }
    }
    result.push({
      name: child,
      isFile: () => isFile,
      isDirectory: () => isDirectory,
      isSymbolicLink: () => isSymbolicLink
    });
  }
  return result;
}
function handleDirectoryChildren(children) {
  return children.map((child) => {
    if (typeof child === "string") {
      return isMacintosh ? normalizeNFC(child) : child;
    }
    child.name = isMacintosh ? normalizeNFC(child.name) : child.name;
    return child;
  });
}
async function readDirsInDir(dirPath) {
  const children = await readdir(dirPath);
  const directories = [];
  for (const child of children) {
    if (await SymlinkSupport.existsDirectory(join(dirPath, child))) {
      directories.push(child);
    }
  }
  return directories;
}
function whenDeleted(path, intervalMs = 1e3) {
  return new Promise((resolve) => {
    let running = false;
    const interval = setInterval(() => {
      if (!running) {
        running = true;
        fs.access(path, (err) => {
          running = false;
          if (err) {
            clearInterval(interval);
            resolve(void 0);
          }
        });
      }
    }, intervalMs);
  });
}
var SymlinkSupport;
((SymlinkSupport2) => {
  async function stat(path) {
    let lstats;
    try {
      lstats = await fs.promises.lstat(path);
      if (!lstats.isSymbolicLink()) {
        return { stat: lstats };
      }
    } catch {
    }
    try {
      const stats = await fs.promises.stat(path);
      return { stat: stats, symbolicLink: lstats?.isSymbolicLink() ? { dangling: false } : void 0 };
    } catch (error) {
      if (error.code === "ENOENT" && lstats) {
        return { stat: lstats, symbolicLink: { dangling: true } };
      }
      if (isWindows && error.code === "EACCES") {
        try {
          const stats = await fs.promises.stat(await fs.promises.readlink(path));
          return { stat: stats, symbolicLink: { dangling: false } };
        } catch (error2) {
          if (error2.code === "ENOENT" && lstats) {
            return { stat: lstats, symbolicLink: { dangling: true } };
          }
          throw error2;
        }
      }
      throw error;
    }
  }
  SymlinkSupport2.stat = stat;
  async function existsFile(path) {
    try {
      const { stat: stat2, symbolicLink } = await SymlinkSupport2.stat(path);
      return stat2.isFile() && symbolicLink?.dangling !== true;
    } catch {
    }
    return false;
  }
  SymlinkSupport2.existsFile = existsFile;
  async function existsDirectory(path) {
    try {
      const { stat: stat2, symbolicLink } = await SymlinkSupport2.stat(path);
      return stat2.isDirectory() && symbolicLink?.dangling !== true;
    } catch {
    }
    return false;
  }
  SymlinkSupport2.existsDirectory = existsDirectory;
})(SymlinkSupport || (SymlinkSupport = {}));
const writeQueues = new ResourceQueue();
function writeFile(path, data, options) {
  return writeQueues.queueFor(URI.file(path), () => {
    const ensuredOptions = ensureWriteOptions(options);
    return new Promise((resolve, reject) => doWriteFileAndFlush(path, data, ensuredOptions, (error) => error ? reject(error) : resolve()));
  }, extUriBiasedIgnorePathCase);
}
let canFlush = true;
function configureFlushOnWrite(enabled) {
  canFlush = enabled;
}
function doWriteFileAndFlush(path, data, options, callback) {
  if (!canFlush) {
    return fs.writeFile(path, data, { mode: options.mode, flag: options.flag }, callback);
  }
  fs.open(path, options.flag, options.mode, (openError, fd) => {
    if (openError) {
      return callback(openError);
    }
    fs.writeFile(fd, data, (writeError) => {
      if (writeError) {
        return fs.close(fd, () => callback(writeError));
      }
      fs.fdatasync(fd, (syncError) => {
        if (syncError) {
          console.warn("[node.js fs] fdatasync is now disabled for this session because it failed: ", syncError);
          configureFlushOnWrite(false);
        }
        return fs.close(fd, (closeError) => callback(closeError));
      });
    });
  });
}
function writeFileSync(path, data, options) {
  const ensuredOptions = ensureWriteOptions(options);
  if (!canFlush) {
    return fs.writeFileSync(path, data, { mode: ensuredOptions.mode, flag: ensuredOptions.flag });
  }
  const fd = fs.openSync(path, ensuredOptions.flag, ensuredOptions.mode);
  try {
    fs.writeFileSync(fd, data);
    try {
      fs.fdatasyncSync(fd);
    } catch (syncError) {
      console.warn("[node.js fs] fdatasyncSync is now disabled for this session because it failed: ", syncError);
      configureFlushOnWrite(false);
    }
  } finally {
    fs.closeSync(fd);
  }
}
function ensureWriteOptions(options) {
  if (!options) {
    return { mode: 438, flag: "w" };
  }
  return {
    mode: typeof options.mode === "number" ? options.mode : 438,
    flag: typeof options.flag === "string" ? options.flag : "w"
  };
}
async function rename(source, target, windowsRetryTimeout = 6e4) {
  if (source === target) {
    return;
  }
  try {
    if (isWindows && typeof windowsRetryTimeout === "number") {
      await renameWithRetry(source, target, Date.now(), windowsRetryTimeout);
    } else {
      await fs.promises.rename(source, target);
    }
  } catch (error) {
    if (source.toLowerCase() !== target.toLowerCase() && error.code === "EXDEV" || source.endsWith(".")) {
      await copy(source, target, {
        preserveSymlinks: false
        /* copying to another device */
      });
      await rimraf(source, 1 /* MOVE */);
    } else {
      throw error;
    }
  }
}
async function renameWithRetry(source, target, startTime, retryTimeout, attempt = 0) {
  try {
    return await fs.promises.rename(source, target);
  } catch (error) {
    if (error.code !== "EACCES" && error.code !== "EPERM" && error.code !== "EBUSY") {
      throw error;
    }
    if (Date.now() - startTime >= retryTimeout) {
      console.error(`[node.js fs] rename failed after ${attempt} retries with error: ${error}`);
      throw error;
    }
    if (attempt === 0) {
      let abortRetry = false;
      try {
        const { stat } = await SymlinkSupport.stat(target);
        if (!stat.isFile()) {
          abortRetry = true;
        }
      } catch {
      }
      if (abortRetry) {
        throw error;
      }
    }
    await timeout(Math.min(100, attempt * 10));
    return renameWithRetry(source, target, startTime, retryTimeout, attempt + 1);
  }
}
async function copy(source, target, options) {
  return doCopy(source, target, { root: { source, target }, options, handledSourcePaths: /* @__PURE__ */ new Set() });
}
const COPY_MODE_MASK = 511;
async function doCopy(source, target, payload) {
  if (payload.handledSourcePaths.has(source)) {
    return;
  } else {
    payload.handledSourcePaths.add(source);
  }
  const { stat, symbolicLink } = await SymlinkSupport.stat(source);
  if (symbolicLink) {
    if (payload.options.preserveSymlinks) {
      try {
        return await doCopySymlink(source, target, payload);
      } catch {
      }
    }
    if (symbolicLink.dangling) {
      return;
    }
  }
  if (stat.isDirectory()) {
    return doCopyDirectory(source, target, stat.mode & COPY_MODE_MASK, payload);
  } else {
    return doCopyFile(source, target, stat.mode & COPY_MODE_MASK);
  }
}
async function doCopyDirectory(source, target, mode, payload) {
  await fs.promises.mkdir(target, { recursive: true, mode });
  const files = await readdir(source);
  for (const file of files) {
    await doCopy(join(source, file), join(target, file), payload);
  }
}
async function doCopyFile(source, target, mode) {
  await fs.promises.copyFile(source, target);
  await fs.promises.chmod(target, mode);
}
async function doCopySymlink(source, target, payload) {
  let linkTarget = await fs.promises.readlink(source);
  if (isEqualOrParent(linkTarget, payload.root.source, !isLinux)) {
    linkTarget = join(payload.root.target, linkTarget.substr(payload.root.source.length + 1));
  }
  await fs.promises.symlink(linkTarget, target);
}
async function realcase(path, token) {
  if (isLinux) {
    return path;
  }
  const dir = dirname(path);
  if (path === dir) {
    return path;
  }
  const name = (basename(path) || path).toLowerCase();
  try {
    if (token?.isCancellationRequested) {
      return null;
    }
    const entries = await Promises.readdir(dir);
    const found = entries.filter((e) => e.toLowerCase() === name);
    if (found.length === 1) {
      const prefix = await realcase(dir, token);
      if (prefix) {
        return join(prefix, found[0]);
      }
    } else if (found.length > 1) {
      const ix = found.indexOf(name);
      if (ix >= 0) {
        const prefix = await realcase(dir, token);
        if (prefix) {
          return join(prefix, found[ix]);
        }
      }
    }
  } catch {
  }
  return null;
}
async function realpath(path) {
  try {
    return await promisify(fs.realpath)(path);
  } catch {
    const normalizedPath = normalizePath(path);
    await fs.promises.access(normalizedPath, fs.constants.R_OK);
    return normalizedPath;
  }
}
function realpathSync(path) {
  try {
    return fs.realpathSync(path);
  } catch {
    const normalizedPath = normalizePath(path);
    fs.accessSync(normalizedPath, fs.constants.R_OK);
    return normalizedPath;
  }
}
function normalizePath(path) {
  return rtrim(normalize(path), sep);
}
const Promises = new class {
  //#region Implemented by node.js
  get read() {
    return (fd, buffer, offset, length, position) => {
      return new Promise((resolve, reject) => {
        fs.read(fd, buffer, offset, length, position, (err, bytesRead, buffer2) => {
          if (err) {
            return reject(err);
          }
          return resolve({ bytesRead, buffer: buffer2 });
        });
      });
    };
  }
  get write() {
    return (fd, buffer, offset, length, position) => {
      return new Promise((resolve, reject) => {
        fs.write(fd, buffer, offset, length, position, (err, bytesWritten, buffer2) => {
          if (err) {
            return reject(err);
          }
          return resolve({ bytesWritten, buffer: buffer2 });
        });
      });
    };
  }
  get fdatasync() {
    return promisify(fs.fdatasync);
  }
  // not exposed as API in 22.x yet
  get open() {
    return promisify(fs.open);
  }
  // changed to return `FileHandle` in promise API
  get close() {
    return promisify(fs.close);
  }
  // not exposed as API due to the `FileHandle` return type of `open`
  get ftruncate() {
    return promisify(fs.ftruncate);
  }
  // not exposed as API in 22.x yet
  //#endregion
  //#region Implemented by us
  async exists(path) {
    try {
      await fs.promises.access(path);
      return true;
    } catch {
      return false;
    }
  }
  get readdir() {
    return readdir;
  }
  get readDirsInDir() {
    return readDirsInDir;
  }
  get writeFile() {
    return writeFile;
  }
  get rm() {
    return rimraf;
  }
  get rename() {
    return rename;
  }
  get copy() {
    return copy;
  }
  get realpath() {
    return realpath;
  }
  // `fs.promises.realpath` will use `fs.realpath.native` which we do not want
  //#endregion
}();
export {
  Promises,
  RimRafMode,
  SymlinkSupport,
  configureFlushOnWrite,
  realcase,
  realpathSync,
  whenDeleted,
  writeFileSync
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxub2RlXFxwZnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgeyB0bXBkaXIgfSBmcm9tICdvcyc7XG5pbXBvcnQgeyBwcm9taXNpZnkgfSBmcm9tICd1dGlsJztcbmltcG9ydCB7IFJlc291cmNlUXVldWUsIHRpbWVvdXQgfSBmcm9tICcuLi9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgaXNFcXVhbE9yUGFyZW50LCBpc1Jvb3RPckRyaXZlTGV0dGVyLCByYW5kb21QYXRoIH0gZnJvbSAnLi4vY29tbW9uL2V4dHBhdGguanMnO1xuaW1wb3J0IHsgbm9ybWFsaXplTkZDIH0gZnJvbSAnLi4vY29tbW9uL25vcm1hbGl6YXRpb24uanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGRpcm5hbWUsIGpvaW4sIG5vcm1hbGl6ZSwgc2VwIH0gZnJvbSAnLi4vY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgaXNMaW51eCwgaXNNYWNpbnRvc2gsIGlzV2luZG93cyB9IGZyb20gJy4uL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZSB9IGZyb20gJy4uL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgcnRyaW0gfSBmcm9tICcuLi9jb21tb24vc3RyaW5ncy5qcyc7XG5cbi8vI3JlZ2lvbiByaW1yYWZcblxuZXhwb3J0IGVudW0gUmltUmFmTW9kZSB7XG5cblx0LyoqXG5cdCAqIFNsb3cgdmVyc2lvbiB0aGF0IHVubGlua3MgZWFjaCBmaWxlIGFuZCBmb2xkZXIuXG5cdCAqL1xuXHRVTkxJTkssXG5cblx0LyoqXG5cdCAqIEZhc3QgdmVyc2lvbiB0aGF0IGZpcnN0IG1vdmVzIHRoZSBmaWxlL2ZvbGRlclxuXHQgKiBpbnRvIGEgdGVtcCBkaXJlY3RvcnkgYW5kIHRoZW4gZGVsZXRlcyB0aGF0XG5cdCAqIHdpdGhvdXQgd2FpdGluZyBmb3IgaXQuXG5cdCAqL1xuXHRNT1ZFXG59XG5cbi8qKlxuICogQWxsb3dzIHRvIGRlbGV0ZSB0aGUgcHJvdmlkZWQgcGF0aCAoZWl0aGVyIGZpbGUgb3IgZm9sZGVyKSByZWN1cnNpdmVseVxuICogd2l0aCB0aGUgb3B0aW9uczpcbiAqIC0gYFVOTElOS2A6IGRpcmVjdCByZW1vdmFsIGZyb20gZGlza1xuICogLSBgTU9WRWA6IGZhc3RlciB2YXJpYW50IHRoYXQgZmlyc3QgbW92ZXMgdGhlIHRhcmdldCB0byB0ZW1wIGRpciBhbmQgdGhlblxuICogICAgICAgICAgIGRlbGV0ZXMgaXQgaW4gdGhlIGJhY2tncm91bmQgd2l0aG91dCB3YWl0aW5nIGZvciB0aGF0IHRvIGZpbmlzaC5cbiAqICAgICAgICAgICB0aGUgb3B0aW9uYWwgYG1vdmVUb1BhdGhgIGFsbG93cyB0byBvdmVycmlkZSB3aGVyZSB0byByZW5hbWUgdGhlXG4gKiAgICAgICAgICAgcGF0aCB0byBiZWZvcmUgZGVsZXRpbmcgaXQuXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHJpbXJhZihwYXRoOiBzdHJpbmcsIG1vZGU6IFJpbVJhZk1vZGUuVU5MSU5LKTogUHJvbWlzZTx2b2lkPjtcbmFzeW5jIGZ1bmN0aW9uIHJpbXJhZihwYXRoOiBzdHJpbmcsIG1vZGU6IFJpbVJhZk1vZGUuTU9WRSwgbW92ZVRvUGF0aD86IHN0cmluZyk6IFByb21pc2U8dm9pZD47XG5hc3luYyBmdW5jdGlvbiByaW1yYWYocGF0aDogc3RyaW5nLCBtb2RlPzogUmltUmFmTW9kZSwgbW92ZVRvUGF0aD86IHN0cmluZyk6IFByb21pc2U8dm9pZD47XG5hc3luYyBmdW5jdGlvbiByaW1yYWYocGF0aDogc3RyaW5nLCBtb2RlID0gUmltUmFmTW9kZS5VTkxJTkssIG1vdmVUb1BhdGg/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0aWYgKGlzUm9vdE9yRHJpdmVMZXR0ZXIocGF0aCkpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ3JpbXJhZiAtIHdpbGwgcmVmdXNlIHRvIHJlY3Vyc2l2ZWx5IGRlbGV0ZSByb290Jyk7XG5cdH1cblxuXHQvLyBkZWxldGU6IHZpYSBybVxuXHRpZiAobW9kZSA9PT0gUmltUmFmTW9kZS5VTkxJTkspIHtcblx0XHRyZXR1cm4gcmltcmFmVW5saW5rKHBhdGgpO1xuXHR9XG5cblx0Ly8gZGVsZXRlOiB2aWEgbW92ZVxuXHRyZXR1cm4gcmltcmFmTW92ZShwYXRoLCBtb3ZlVG9QYXRoKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcmltcmFmTW92ZShwYXRoOiBzdHJpbmcsIG1vdmVUb1BhdGggPSByYW5kb21QYXRoKHRtcGRpcigpKSk6IFByb21pc2U8dm9pZD4ge1xuXHR0cnkge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBmcy5wcm9taXNlcy5yZW5hbWUocGF0aCwgbW92ZVRvUGF0aCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmIChlcnJvci5jb2RlID09PSAnRU5PRU5UJykge1xuXHRcdFx0XHRyZXR1cm47IC8vIGlnbm9yZSAtIHBhdGggdG8gZGVsZXRlIGRpZCBub3QgZXhpc3Rcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHJpbXJhZlVubGluayhwYXRoKTsgLy8gb3RoZXJ3aXNlIGZhbGxiYWNrIHRvIHVubGlua1xuXHRcdH1cblxuXHRcdC8vIERlbGV0ZSBidXQgZG8gbm90IHJldHVybiBhcyBwcm9taXNlXG5cdFx0cmltcmFmVW5saW5rKG1vdmVUb1BhdGgpLmNhdGNoKCgpID0+IHsvKiBpZ25vcmUgKi8gfSk7XG5cdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0aWYgKGVycm9yLmNvZGUgIT09ICdFTk9FTlQnKSB7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gcmltcmFmVW5saW5rKHBhdGg6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRyZXR1cm4gZnMucHJvbWlzZXMucm0ocGF0aCwgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlLCBtYXhSZXRyaWVzOiAzIH0pO1xufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIHJlYWRkaXIgd2l0aCBORkMgc3VwcG9ydCAobWFjb3MpXG5cbmV4cG9ydCBpbnRlcmZhY2UgSURpcmVudCB7XG5cdG5hbWU6IHN0cmluZztcblxuXHRpc0ZpbGUoKTogYm9vbGVhbjtcblx0aXNEaXJlY3RvcnkoKTogYm9vbGVhbjtcblx0aXNTeW1ib2xpY0xpbmsoKTogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBEcm9wLWluIHJlcGxhY2VtZW50IG9mIGBmcy5yZWFkZGlyYCB3aXRoIHN1cHBvcnRcbiAqIGZvciBjb252ZXJ0aW5nIGZyb20gbWFjT1MgTkZEIHVuaWNvbiBmb3JtIHRvIE5GQ1xuICogKGh0dHBzOi8vZ2l0aHViLmNvbS9ub2RlanMvbm9kZS9pc3N1ZXMvMjE2NSlcbiAqL1xuYXN5bmMgZnVuY3Rpb24gcmVhZGRpcihwYXRoOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZ1tdPjtcbmFzeW5jIGZ1bmN0aW9uIHJlYWRkaXIocGF0aDogc3RyaW5nLCBvcHRpb25zOiB7IHdpdGhGaWxlVHlwZXM6IHRydWUgfSk6IFByb21pc2U8SURpcmVudFtdPjtcbmFzeW5jIGZ1bmN0aW9uIHJlYWRkaXIocGF0aDogc3RyaW5nLCBvcHRpb25zPzogeyB3aXRoRmlsZVR5cGVzOiB0cnVlIH0pOiBQcm9taXNlPChzdHJpbmcgfCBJRGlyZW50KVtdPiB7XG5cdHRyeSB7XG5cdFx0cmV0dXJuIGF3YWl0IGRvUmVhZGRpcihwYXRoLCBvcHRpb25zKTtcblx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHQvLyBXb3JrYXJvdW5kIGZvciAjMjUyMzYxIHRoYXQgc2hvdWxkIGJlIHJlbW92ZWQgb25jZSB0aGUgdXBzdHJlYW0gaXNzdWVcblx0XHQvLyBpbiBub2RlLmpzIGlzIHJlc29sdmVkLiBBZGRzIGEgdHJhaWxpbmcgZG90IHRvIGEgcm9vdCBkcml2ZSBsZXR0ZXIgcGF0aFxuXHRcdC8vIChHOlxcID0+IEc6XFwuKSBhcyBhIHdvcmthcm91bmQuXG5cdFx0aWYgKGVycm9yLmNvZGUgPT09ICdFTk9FTlQnICYmIGlzV2luZG93cyAmJiBpc1Jvb3RPckRyaXZlTGV0dGVyKHBhdGgpKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgZG9SZWFkZGlyKGAke3BhdGh9LmAsIG9wdGlvbnMpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIGlnbm9yZVxuXHRcdFx0fVxuXHRcdH1cblx0XHR0aHJvdyBlcnJvcjtcblx0fVxufVxuXG5hc3luYyBmdW5jdGlvbiBkb1JlYWRkaXIocGF0aDogc3RyaW5nLCBvcHRpb25zPzogeyB3aXRoRmlsZVR5cGVzOiB0cnVlIH0pOiBQcm9taXNlPChzdHJpbmcgfCBJRGlyZW50KVtdPiB7XG5cdHJldHVybiBoYW5kbGVEaXJlY3RvcnlDaGlsZHJlbihhd2FpdCAob3B0aW9ucyA/IHNhZmVSZWFkZGlyV2l0aEZpbGVUeXBlcyhwYXRoKSA6IGZzLnByb21pc2VzLnJlYWRkaXIocGF0aCkpKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gc2FmZVJlYWRkaXJXaXRoRmlsZVR5cGVzKHBhdGg6IHN0cmluZyk6IFByb21pc2U8SURpcmVudFtdPiB7XG5cdHRyeSB7XG5cdFx0cmV0dXJuIGF3YWl0IGZzLnByb21pc2VzLnJlYWRkaXIocGF0aCwgeyB3aXRoRmlsZVR5cGVzOiB0cnVlIH0pO1xuXHR9IGNhdGNoIChlcnJvcikge1xuXHRcdGlmIChlcnJvci5jb2RlICE9PSAnRU5PRU5UJykge1xuXHRcdFx0Y29uc29sZS53YXJuKCdbbm9kZS5qcyBmc10gcmVhZGRpciB3aXRoIGZpbGV0eXBlcyBmYWlsZWQgd2l0aCBlcnJvcjogJywgZXJyb3IpO1xuXHRcdH1cblx0fVxuXG5cdC8vIEZhbGxiYWNrIHRvIG1hbnVhbGx5IHJlYWRpbmcgYW5kIHJlc29sdmluZyBlYWNoXG5cdC8vIGNoaWxkcmVuIG9mIHRoZSBmb2xkZXIgaW4gY2FzZSB3ZSBoaXQgYW4gZXJyb3Jcblx0Ly8gcHJldmlvdXNseS5cblx0Ly8gVGhpcyBjYW4gb25seSByZWFsbHkgaGFwcGVuIG9uIGV4b3RpYyBmaWxlIHN5c3RlbXNcblx0Ly8gc3VjaCBhcyBleHBsYWluZWQgaW4gIzExNTY0NSB3aGVyZSB3ZSBnZXQgZW50cmllc1xuXHQvLyBmcm9tIGByZWFkZGlyYCB0aGF0IHdlIGNhbiBsYXRlciBub3QgYGxzdGF0YC5cblx0Y29uc3QgcmVzdWx0OiBJRGlyZW50W10gPSBbXTtcblx0Y29uc3QgY2hpbGRyZW4gPSBhd2FpdCByZWFkZGlyKHBhdGgpO1xuXHRmb3IgKGNvbnN0IGNoaWxkIG9mIGNoaWxkcmVuKSB7XG5cdFx0bGV0IGlzRmlsZSA9IGZhbHNlO1xuXHRcdGxldCBpc0RpcmVjdG9yeSA9IGZhbHNlO1xuXHRcdGxldCBpc1N5bWJvbGljTGluayA9IGZhbHNlO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGxzdGF0ID0gYXdhaXQgZnMucHJvbWlzZXMubHN0YXQoam9pbihwYXRoLCBjaGlsZCkpO1xuXG5cdFx0XHRpc0ZpbGUgPSBsc3RhdC5pc0ZpbGUoKTtcblx0XHRcdGlzRGlyZWN0b3J5ID0gbHN0YXQuaXNEaXJlY3RvcnkoKTtcblx0XHRcdGlzU3ltYm9saWNMaW5rID0gbHN0YXQuaXNTeW1ib2xpY0xpbmsoKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKGVycm9yLmNvZGUgIT09ICdFTk9FTlQnKSB7XG5cdFx0XHRcdGNvbnNvbGUud2FybignW25vZGUuanMgZnNdIHVuZXhwZWN0ZWQgZXJyb3IgZnJvbSBsc3RhdCBhZnRlciByZWFkZGlyOiAnLCBlcnJvcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0bmFtZTogY2hpbGQsXG5cdFx0XHRpc0ZpbGU6ICgpID0+IGlzRmlsZSxcblx0XHRcdGlzRGlyZWN0b3J5OiAoKSA9PiBpc0RpcmVjdG9yeSxcblx0XHRcdGlzU3ltYm9saWNMaW5rOiAoKSA9PiBpc1N5bWJvbGljTGlua1xuXHRcdH0pO1xuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gaGFuZGxlRGlyZWN0b3J5Q2hpbGRyZW4oY2hpbGRyZW46IHN0cmluZ1tdKTogc3RyaW5nW107XG5mdW5jdGlvbiBoYW5kbGVEaXJlY3RvcnlDaGlsZHJlbihjaGlsZHJlbjogSURpcmVudFtdKTogSURpcmVudFtdO1xuZnVuY3Rpb24gaGFuZGxlRGlyZWN0b3J5Q2hpbGRyZW4oY2hpbGRyZW46IChzdHJpbmcgfCBJRGlyZW50KVtdKTogKHN0cmluZyB8IElEaXJlbnQpW107XG5mdW5jdGlvbiBoYW5kbGVEaXJlY3RvcnlDaGlsZHJlbihjaGlsZHJlbjogKHN0cmluZyB8IElEaXJlbnQpW10pOiAoc3RyaW5nIHwgSURpcmVudClbXSB7XG5cdHJldHVybiBjaGlsZHJlbi5tYXAoY2hpbGQgPT4ge1xuXG5cdFx0Ly8gTWFjOiB1c2VzIE5GRCB1bmljb2RlIGZvcm0gb24gZGlzaywgYnV0IHdlIHdhbnQgTkZDXG5cdFx0Ly8gU2VlIGFsc28gaHR0cHM6Ly9naXRodWIuY29tL25vZGVqcy9ub2RlL2lzc3Vlcy8yMTY1XG5cblx0XHRpZiAodHlwZW9mIGNoaWxkID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIGlzTWFjaW50b3NoID8gbm9ybWFsaXplTkZDKGNoaWxkKSA6IGNoaWxkO1xuXHRcdH1cblxuXHRcdGNoaWxkLm5hbWUgPSBpc01hY2ludG9zaCA/IG5vcm1hbGl6ZU5GQyhjaGlsZC5uYW1lKSA6IGNoaWxkLm5hbWU7XG5cblx0XHRyZXR1cm4gY2hpbGQ7XG5cdH0pO1xufVxuXG4vKipcbiAqIEEgY29udmVuaWVuY2UgbWV0aG9kIHRvIHJlYWQgYWxsIGNoaWxkcmVuIG9mIGEgcGF0aCB0aGF0XG4gKiBhcmUgZGlyZWN0b3JpZXMuXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHJlYWREaXJzSW5EaXIoZGlyUGF0aDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuXHRjb25zdCBjaGlsZHJlbiA9IGF3YWl0IHJlYWRkaXIoZGlyUGF0aCk7XG5cdGNvbnN0IGRpcmVjdG9yaWVzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdGZvciAoY29uc3QgY2hpbGQgb2YgY2hpbGRyZW4pIHtcblx0XHRpZiAoYXdhaXQgU3ltbGlua1N1cHBvcnQuZXhpc3RzRGlyZWN0b3J5KGpvaW4oZGlyUGF0aCwgY2hpbGQpKSkge1xuXHRcdFx0ZGlyZWN0b3JpZXMucHVzaChjaGlsZCk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGRpcmVjdG9yaWVzO1xufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIHdoZW5EZWxldGVkKClcblxuLyoqXG4gKiBBIGBQcm9taXNlYCB0aGF0IHJlc29sdmVzIHdoZW4gdGhlIHByb3ZpZGVkIGBwYXRoYFxuICogaXMgZGVsZXRlZCBmcm9tIGRpc2suXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3aGVuRGVsZXRlZChwYXRoOiBzdHJpbmcsIGludGVydmFsTXMgPSAxMDAwKTogUHJvbWlzZTx2b2lkPiB7XG5cdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRsZXQgcnVubmluZyA9IGZhbHNlO1xuXHRcdGNvbnN0IGludGVydmFsID0gc2V0SW50ZXJ2YWwoKCkgPT4ge1xuXHRcdFx0aWYgKCFydW5uaW5nKSB7XG5cdFx0XHRcdHJ1bm5pbmcgPSB0cnVlO1xuXHRcdFx0XHRmcy5hY2Nlc3MocGF0aCwgZXJyID0+IHtcblx0XHRcdFx0XHRydW5uaW5nID0gZmFsc2U7XG5cblx0XHRcdFx0XHRpZiAoZXJyKSB7XG5cdFx0XHRcdFx0XHRjbGVhckludGVydmFsKGludGVydmFsKTtcblx0XHRcdFx0XHRcdHJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0sIGludGVydmFsTXMpO1xuXHR9KTtcbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBNZXRob2RzIHdpdGggc3ltYm9saWMgbGlua3Mgc3VwcG9ydFxuXG5leHBvcnQgbmFtZXNwYWNlIFN5bWxpbmtTdXBwb3J0IHtcblxuXHRleHBvcnQgaW50ZXJmYWNlIElTdGF0cyB7XG5cblx0XHQvLyBUaGUgc3RhdHMgb2YgdGhlIGZpbGUuIElmIHRoZSBmaWxlIGlzIGEgc3ltYm9saWNcblx0XHQvLyBsaW5rLCB0aGUgc3RhdHMgd2lsbCBiZSBvZiB0aGF0IHRhcmdldCBmaWxlIGFuZFxuXHRcdC8vIG5vdCB0aGUgbGluayBpdHNlbGYuXG5cdFx0Ly8gSWYgdGhlIGZpbGUgaXMgYSBzeW1ib2xpYyBsaW5rIHBvaW50aW5nIHRvIGEgbm9uXG5cdFx0Ly8gZXhpc3RpbmcgZmlsZSwgdGhlIHN0YXQgd2lsbCBiZSBvZiB0aGUgbGluayBhbmRcblx0XHQvLyB0aGUgYGRhbmdsaW5nYCBmbGFnIHdpbGwgaW5kaWNhdGUgdGhpcy5cblx0XHRzdGF0OiBmcy5TdGF0cztcblxuXHRcdC8vIFdpbGwgYmUgcHJvdmlkZWQgaWYgdGhlIHJlc291cmNlIGlzIGEgc3ltYm9saWMgbGlua1xuXHRcdC8vIG9uIGRpc2suIFVzZSB0aGUgYGRhbmdsaW5nYCBmbGFnIHRvIGZpbmQgb3V0IGlmIGl0XG5cdFx0Ly8gcG9pbnRzIHRvIGEgcmVzb3VyY2UgdGhhdCBkb2VzIG5vdCBleGlzdCBvbiBkaXNrLlxuXHRcdHN5bWJvbGljTGluaz86IHsgZGFuZ2xpbmc6IGJvb2xlYW4gfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlcyB0aGUgYGZzLlN0YXRzYCBvZiB0aGUgcHJvdmlkZWQgcGF0aC4gSWYgdGhlIHBhdGggaXMgYVxuXHQgKiBzeW1ib2xpYyBsaW5rLCB0aGUgYGZzLlN0YXRzYCB3aWxsIGJlIGZyb20gdGhlIHRhcmdldCBpdCBwb2ludHNcblx0ICogdG8uIElmIHRoZSB0YXJnZXQgZG9lcyBub3QgZXhpc3QsIGBkYW5nbGluZzogdHJ1ZWAgd2lsbCBiZSByZXR1cm5lZFxuXHQgKiBhcyBgc3ltYm9saWNMaW5rYCB2YWx1ZS5cblx0ICovXG5cdGV4cG9ydCBhc3luYyBmdW5jdGlvbiBzdGF0KHBhdGg6IHN0cmluZyk6IFByb21pc2U8SVN0YXRzPiB7XG5cblx0XHQvLyBGaXJzdCBzdGF0IHRoZSBsaW5rXG5cdFx0bGV0IGxzdGF0czogZnMuU3RhdHMgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGxzdGF0cyA9IGF3YWl0IGZzLnByb21pc2VzLmxzdGF0KHBhdGgpO1xuXG5cdFx0XHQvLyBSZXR1cm4gZWFybHkgaWYgdGhlIHN0YXQgaXMgbm90IGEgc3ltYm9saWMgbGluayBhdCBhbGxcblx0XHRcdGlmICghbHN0YXRzLmlzU3ltYm9saWNMaW5rKCkpIHtcblx0XHRcdFx0cmV0dXJuIHsgc3RhdDogbHN0YXRzIH07XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvKiBpZ25vcmUgLSB1c2Ugc3RhdCgpIGluc3RlYWQgKi9cblx0XHR9XG5cblx0XHQvLyBJZiB0aGUgc3RhdCBpcyBhIHN5bWJvbGljIGxpbmsgb3IgZmFpbGVkIHRvIHN0YXQsIHVzZSBmcy5zdGF0KClcblx0XHQvLyB3aGljaCBmb3Igc3ltYm9saWMgbGlua3Mgd2lsbCBzdGF0IHRoZSB0YXJnZXQgdGhleSBwb2ludCB0b1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzdGF0cyA9IGF3YWl0IGZzLnByb21pc2VzLnN0YXQocGF0aCk7XG5cblx0XHRcdHJldHVybiB7IHN0YXQ6IHN0YXRzLCBzeW1ib2xpY0xpbms6IGxzdGF0cz8uaXNTeW1ib2xpY0xpbmsoKSA/IHsgZGFuZ2xpbmc6IGZhbHNlIH0gOiB1bmRlZmluZWQgfTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXG5cdFx0XHQvLyBJZiB0aGUgbGluayBwb2ludHMgdG8gYSBub25leGlzdGVudCBmaWxlIHdlIHN0aWxsIHdhbnRcblx0XHRcdC8vIHRvIHJldHVybiBpdCBhcyByZXN1bHQgd2hpbGUgc2V0dGluZyBkYW5nbGluZzogdHJ1ZSBmbGFnXG5cdFx0XHRpZiAoZXJyb3IuY29kZSA9PT0gJ0VOT0VOVCcgJiYgbHN0YXRzKSB7XG5cdFx0XHRcdHJldHVybiB7IHN0YXQ6IGxzdGF0cywgc3ltYm9saWNMaW5rOiB7IGRhbmdsaW5nOiB0cnVlIH0gfTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gV2luZG93czogd29ya2Fyb3VuZCBhIG5vZGUuanMgYnVnIHdoZXJlIHJlcGFyc2UgcG9pbnRzXG5cdFx0XHQvLyBhcmUgbm90IHN1cHBvcnRlZCAoaHR0cHM6Ly9naXRodWIuY29tL25vZGVqcy9ub2RlL2lzc3Vlcy8zNjc5MClcblx0XHRcdGlmIChpc1dpbmRvd3MgJiYgZXJyb3IuY29kZSA9PT0gJ0VBQ0NFUycpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBzdGF0cyA9IGF3YWl0IGZzLnByb21pc2VzLnN0YXQoYXdhaXQgZnMucHJvbWlzZXMucmVhZGxpbmsocGF0aCkpO1xuXG5cdFx0XHRcdFx0cmV0dXJuIHsgc3RhdDogc3RhdHMsIHN5bWJvbGljTGluazogeyBkYW5nbGluZzogZmFsc2UgfSB9O1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXG5cdFx0XHRcdFx0Ly8gSWYgdGhlIGxpbmsgcG9pbnRzIHRvIGEgbm9uZXhpc3RlbnQgZmlsZSB3ZSBzdGlsbCB3YW50XG5cdFx0XHRcdFx0Ly8gdG8gcmV0dXJuIGl0IGFzIHJlc3VsdCB3aGlsZSBzZXR0aW5nIGRhbmdsaW5nOiB0cnVlIGZsYWdcblx0XHRcdFx0XHRpZiAoZXJyb3IuY29kZSA9PT0gJ0VOT0VOVCcgJiYgbHN0YXRzKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBzdGF0OiBsc3RhdHMsIHN5bWJvbGljTGluazogeyBkYW5nbGluZzogdHJ1ZSB9IH07XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEZpZ3VyZXMgb3V0IGlmIHRoZSBgcGF0aGAgZXhpc3RzIGFuZCBpcyBhIGZpbGUgd2l0aCBzdXBwb3J0XG5cdCAqIGZvciBzeW1saW5rcy5cblx0ICpcblx0ICogTm90ZTogdGhpcyB3aWxsIHJldHVybiBgZmFsc2VgIGZvciBhIHN5bWxpbmsgdGhhdCBleGlzdHMgb25cblx0ICogZGlzayBidXQgaXMgZGFuZ2xpbmcgKHBvaW50aW5nIHRvIGEgbm9uZXhpc3RlbnQgcGF0aCkuXG5cdCAqXG5cdCAqIFVzZSBgZXhpc3RzYCBpZiB5b3Ugb25seSBjYXJlIGFib3V0IHRoZSBwYXRoIGV4aXN0aW5nIG9uIGRpc2tcblx0ICogb3Igbm90IHdpdGhvdXQgc3VwcG9ydCBmb3Igc3ltYm9saWMgbGlua3MuXG5cdCAqL1xuXHRleHBvcnQgYXN5bmMgZnVuY3Rpb24gZXhpc3RzRmlsZShwYXRoOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgeyBzdGF0LCBzeW1ib2xpY0xpbmsgfSA9IGF3YWl0IFN5bWxpbmtTdXBwb3J0LnN0YXQocGF0aCk7XG5cblx0XHRcdHJldHVybiBzdGF0LmlzRmlsZSgpICYmIHN5bWJvbGljTGluaz8uZGFuZ2xpbmcgIT09IHRydWU7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBJZ25vcmUsIHBhdGggbWlnaHQgbm90IGV4aXN0XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZpZ3VyZXMgb3V0IGlmIHRoZSBgcGF0aGAgZXhpc3RzIGFuZCBpcyBhIGRpcmVjdG9yeSB3aXRoIHN1cHBvcnQgZm9yXG5cdCAqIHN5bWxpbmtzLlxuXHQgKlxuXHQgKiBOb3RlOiB0aGlzIHdpbGwgcmV0dXJuIGBmYWxzZWAgZm9yIGEgc3ltbGluayB0aGF0IGV4aXN0cyBvblxuXHQgKiBkaXNrIGJ1dCBpcyBkYW5nbGluZyAocG9pbnRpbmcgdG8gYSBub25leGlzdGVudCBwYXRoKS5cblx0ICpcblx0ICogVXNlIGBleGlzdHNgIGlmIHlvdSBvbmx5IGNhcmUgYWJvdXQgdGhlIHBhdGggZXhpc3Rpbmcgb24gZGlza1xuXHQgKiBvciBub3Qgd2l0aG91dCBzdXBwb3J0IGZvciBzeW1ib2xpYyBsaW5rcy5cblx0ICovXG5cdGV4cG9ydCBhc3luYyBmdW5jdGlvbiBleGlzdHNEaXJlY3RvcnkocGF0aDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHsgc3RhdCwgc3ltYm9saWNMaW5rIH0gPSBhd2FpdCBTeW1saW5rU3VwcG9ydC5zdGF0KHBhdGgpO1xuXG5cdFx0XHRyZXR1cm4gc3RhdC5pc0RpcmVjdG9yeSgpICYmIHN5bWJvbGljTGluaz8uZGFuZ2xpbmcgIT09IHRydWU7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBJZ25vcmUsIHBhdGggbWlnaHQgbm90IGV4aXN0XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gV3JpdGUgRmlsZVxuXG4vLyBBY2NvcmRpbmcgdG8gbm9kZS5qcyBkb2NzIChodHRwczovL25vZGVqcy5vcmcvZG9jcy92MTQuMTYuMC9hcGkvZnMuaHRtbCNmc19mc193cml0ZWZpbGVfZmlsZV9kYXRhX29wdGlvbnNfY2FsbGJhY2spXG4vLyBpdCBpcyBub3Qgc2FmZSB0byBjYWxsIHdyaXRlRmlsZSgpIG9uIHRoZSBzYW1lIHBhdGggbXVsdGlwbGUgdGltZXMgd2l0aG91dCB3YWl0aW5nIGZvciB0aGUgY2FsbGJhY2sgdG8gcmV0dXJuLlxuLy8gVGhlcmVmb3Igd2UgdXNlIGEgUXVldWUgb24gdGhlIHBhdGggdGhhdCBpcyBnaXZlbiB0byB1cyB0byBzZXF1ZW50aWFsaXplIGNhbGxzIHRvIHRoZSBzYW1lIHBhdGggcHJvcGVybHkuXG5jb25zdCB3cml0ZVF1ZXVlcyA9IG5ldyBSZXNvdXJjZVF1ZXVlKCk7XG5cbi8qKlxuICogU2FtZSBhcyBgZnMud3JpdGVGaWxlYCBidXQgd2l0aCBhbiBhZGRpdGlvbmFsIGNhbGwgdG9cbiAqIGBmcy5mZGF0YXN5bmNgIGFmdGVyIHdyaXRpbmcgdG8gZW5zdXJlIGNoYW5nZXMgYXJlXG4gKiBmbHVzaGVkIHRvIGRpc2suXG4gKlxuICogSW4gYWRkaXRpb24sIG11bHRpcGxlIHdyaXRlcyB0byB0aGUgc2FtZSBwYXRoIGFyZSBxdWV1ZWQuXG4gKi9cbmZ1bmN0aW9uIHdyaXRlRmlsZShwYXRoOiBzdHJpbmcsIGRhdGE6IHN0cmluZywgb3B0aW9ucz86IElXcml0ZUZpbGVPcHRpb25zKTogUHJvbWlzZTx2b2lkPjtcbmZ1bmN0aW9uIHdyaXRlRmlsZShwYXRoOiBzdHJpbmcsIGRhdGE6IEJ1ZmZlciwgb3B0aW9ucz86IElXcml0ZUZpbGVPcHRpb25zKTogUHJvbWlzZTx2b2lkPjtcbmZ1bmN0aW9uIHdyaXRlRmlsZShwYXRoOiBzdHJpbmcsIGRhdGE6IFVpbnQ4QXJyYXksIG9wdGlvbnM/OiBJV3JpdGVGaWxlT3B0aW9ucyk6IFByb21pc2U8dm9pZD47XG5mdW5jdGlvbiB3cml0ZUZpbGUocGF0aDogc3RyaW5nLCBkYXRhOiBzdHJpbmcgfCBCdWZmZXIgfCBVaW50OEFycmF5LCBvcHRpb25zPzogSVdyaXRlRmlsZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+O1xuZnVuY3Rpb24gd3JpdGVGaWxlKHBhdGg6IHN0cmluZywgZGF0YTogc3RyaW5nIHwgQnVmZmVyIHwgVWludDhBcnJheSwgb3B0aW9ucz86IElXcml0ZUZpbGVPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdHJldHVybiB3cml0ZVF1ZXVlcy5xdWV1ZUZvcihVUkkuZmlsZShwYXRoKSwgKCkgPT4ge1xuXHRcdGNvbnN0IGVuc3VyZWRPcHRpb25zID0gZW5zdXJlV3JpdGVPcHRpb25zKG9wdGlvbnMpO1xuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IGRvV3JpdGVGaWxlQW5kRmx1c2gocGF0aCwgZGF0YSwgZW5zdXJlZE9wdGlvbnMsIGVycm9yID0+IGVycm9yID8gcmVqZWN0KGVycm9yKSA6IHJlc29sdmUoKSkpO1xuXHR9LCBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZSk7XG59XG5cbmludGVyZmFjZSBJV3JpdGVGaWxlT3B0aW9ucyB7XG5cdG1vZGU/OiBudW1iZXI7XG5cdGZsYWc/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJRW5zdXJlZFdyaXRlRmlsZU9wdGlvbnMgZXh0ZW5kcyBJV3JpdGVGaWxlT3B0aW9ucyB7XG5cdG1vZGU6IG51bWJlcjtcblx0ZmxhZzogc3RyaW5nO1xufVxuXG5sZXQgY2FuRmx1c2ggPSB0cnVlO1xuZXhwb3J0IGZ1bmN0aW9uIGNvbmZpZ3VyZUZsdXNoT25Xcml0ZShlbmFibGVkOiBib29sZWFuKTogdm9pZCB7XG5cdGNhbkZsdXNoID0gZW5hYmxlZDtcbn1cblxuLy8gQ2FsbHMgZnMud3JpdGVGaWxlKCkgZm9sbG93ZWQgYnkgYSBmcy5zeW5jKCkgY2FsbCB0byBmbHVzaCB0aGUgY2hhbmdlcyB0byBkaXNrXG4vLyBXZSBkbyB0aGlzIGluIGNhc2VzIHdoZXJlIHdlIHdhbnQgdG8gbWFrZSBzdXJlIHRoZSBkYXRhIGlzIHJlYWxseSBvbiBkaXNrIGFuZFxuLy8gbm90IGluIHNvbWUgY2FjaGUuXG4vL1xuLy8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9ub2RlanMvbm9kZS9ibG9iL3Y1LjEwLjAvbGliL2ZzLmpzI0wxMTk0XG5mdW5jdGlvbiBkb1dyaXRlRmlsZUFuZEZsdXNoKHBhdGg6IHN0cmluZywgZGF0YTogc3RyaW5nIHwgQnVmZmVyIHwgVWludDhBcnJheSwgb3B0aW9uczogSUVuc3VyZWRXcml0ZUZpbGVPcHRpb25zLCBjYWxsYmFjazogKGVycm9yOiBFcnJvciB8IG51bGwpID0+IHZvaWQpOiB2b2lkIHtcblx0aWYgKCFjYW5GbHVzaCkge1xuXHRcdHJldHVybiBmcy53cml0ZUZpbGUocGF0aCwgZGF0YSwgeyBtb2RlOiBvcHRpb25zLm1vZGUsIGZsYWc6IG9wdGlvbnMuZmxhZyB9LCBjYWxsYmFjayk7XG5cdH1cblxuXHQvLyBPcGVuIHRoZSBmaWxlIHdpdGggc2FtZSBmbGFncyBhbmQgbW9kZSBhcyBmcy53cml0ZUZpbGUoKVxuXHRmcy5vcGVuKHBhdGgsIG9wdGlvbnMuZmxhZywgb3B0aW9ucy5tb2RlLCAob3BlbkVycm9yLCBmZCkgPT4ge1xuXHRcdGlmIChvcGVuRXJyb3IpIHtcblx0XHRcdHJldHVybiBjYWxsYmFjayhvcGVuRXJyb3IpO1xuXHRcdH1cblxuXHRcdC8vIEl0IGlzIHZhbGlkIHRvIHBhc3MgYSBmZCBoYW5kbGUgdG8gZnMud3JpdGVGaWxlKCkgYW5kIHRoaXMgd2lsbCBrZWVwIHRoZSBoYW5kbGUgb3BlbiFcblx0XHRmcy53cml0ZUZpbGUoZmQsIGRhdGEsIHdyaXRlRXJyb3IgPT4ge1xuXHRcdFx0aWYgKHdyaXRlRXJyb3IpIHtcblx0XHRcdFx0cmV0dXJuIGZzLmNsb3NlKGZkLCAoKSA9PiBjYWxsYmFjayh3cml0ZUVycm9yKSk7IC8vIHN0aWxsIG5lZWQgdG8gY2xvc2UgdGhlIGhhbmRsZSBvbiBlcnJvciFcblx0XHRcdH1cblxuXHRcdFx0Ly8gRmx1c2ggY29udGVudHMgKG5vdCBtZXRhZGF0YSkgb2YgdGhlIGZpbGUgdG8gZGlza1xuXHRcdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzk1ODlcblx0XHRcdGZzLmZkYXRhc3luYyhmZCwgKHN5bmNFcnJvcjogRXJyb3IgfCBudWxsKSA9PiB7XG5cblx0XHRcdFx0Ly8gSW4gc29tZSBleG90aWMgc2V0dXBzIGl0IGlzIHdlbGwgcG9zc2libGUgdGhhdCBub2RlIGZhaWxzIHRvIHN5bmNcblx0XHRcdFx0Ly8gSW4gdGhhdCBjYXNlIHdlIGRpc2FibGUgZmx1c2hpbmcgYW5kIHdhcm4gdG8gdGhlIGNvbnNvbGVcblx0XHRcdFx0aWYgKHN5bmNFcnJvcikge1xuXHRcdFx0XHRcdGNvbnNvbGUud2FybignW25vZGUuanMgZnNdIGZkYXRhc3luYyBpcyBub3cgZGlzYWJsZWQgZm9yIHRoaXMgc2Vzc2lvbiBiZWNhdXNlIGl0IGZhaWxlZDogJywgc3luY0Vycm9yKTtcblx0XHRcdFx0XHRjb25maWd1cmVGbHVzaE9uV3JpdGUoZmFsc2UpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIGZzLmNsb3NlKGZkLCBjbG9zZUVycm9yID0+IGNhbGxiYWNrKGNsb3NlRXJyb3IpKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcbn1cblxuLyoqXG4gKiBTYW1lIGFzIGBmcy53cml0ZUZpbGVTeW5jYCBidXQgd2l0aCBhbiBhZGRpdGlvbmFsIGNhbGwgdG9cbiAqIGBmcy5mZGF0YXN5bmNTeW5jYCBhZnRlciB3cml0aW5nIHRvIGVuc3VyZSBjaGFuZ2VzIGFyZVxuICogZmx1c2hlZCB0byBkaXNrLlxuICpcbiAqIEBkZXByZWNhdGVkIGFsd2F5cyBwcmVmZXIgYXN5bmMgdmFyaWFudHMgb3ZlciBzeW5jIVxuICovXG5leHBvcnQgZnVuY3Rpb24gd3JpdGVGaWxlU3luYyhwYXRoOiBzdHJpbmcsIGRhdGE6IHN0cmluZyB8IEJ1ZmZlciwgb3B0aW9ucz86IElXcml0ZUZpbGVPcHRpb25zKTogdm9pZCB7XG5cdGNvbnN0IGVuc3VyZWRPcHRpb25zID0gZW5zdXJlV3JpdGVPcHRpb25zKG9wdGlvbnMpO1xuXG5cdGlmICghY2FuRmx1c2gpIHtcblx0XHRyZXR1cm4gZnMud3JpdGVGaWxlU3luYyhwYXRoLCBkYXRhLCB7IG1vZGU6IGVuc3VyZWRPcHRpb25zLm1vZGUsIGZsYWc6IGVuc3VyZWRPcHRpb25zLmZsYWcgfSk7XG5cdH1cblxuXHQvLyBPcGVuIHRoZSBmaWxlIHdpdGggc2FtZSBmbGFncyBhbmQgbW9kZSBhcyBmcy53cml0ZUZpbGUoKVxuXHRjb25zdCBmZCA9IGZzLm9wZW5TeW5jKHBhdGgsIGVuc3VyZWRPcHRpb25zLmZsYWcsIGVuc3VyZWRPcHRpb25zLm1vZGUpO1xuXG5cdHRyeSB7XG5cblx0XHQvLyBJdCBpcyB2YWxpZCB0byBwYXNzIGEgZmQgaGFuZGxlIHRvIGZzLndyaXRlRmlsZSgpIGFuZCB0aGlzIHdpbGwga2VlcCB0aGUgaGFuZGxlIG9wZW4hXG5cdFx0ZnMud3JpdGVGaWxlU3luYyhmZCwgZGF0YSk7XG5cblx0XHQvLyBGbHVzaCBjb250ZW50cyAobm90IG1ldGFkYXRhKSBvZiB0aGUgZmlsZSB0byBkaXNrXG5cdFx0dHJ5IHtcblx0XHRcdGZzLmZkYXRhc3luY1N5bmMoZmQpOyAvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvOTU4OVxuXHRcdH0gY2F0Y2ggKHN5bmNFcnJvcikge1xuXHRcdFx0Y29uc29sZS53YXJuKCdbbm9kZS5qcyBmc10gZmRhdGFzeW5jU3luYyBpcyBub3cgZGlzYWJsZWQgZm9yIHRoaXMgc2Vzc2lvbiBiZWNhdXNlIGl0IGZhaWxlZDogJywgc3luY0Vycm9yKTtcblx0XHRcdGNvbmZpZ3VyZUZsdXNoT25Xcml0ZShmYWxzZSk7XG5cdFx0fVxuXHR9IGZpbmFsbHkge1xuXHRcdGZzLmNsb3NlU3luYyhmZCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZW5zdXJlV3JpdGVPcHRpb25zKG9wdGlvbnM/OiBJV3JpdGVGaWxlT3B0aW9ucyk6IElFbnN1cmVkV3JpdGVGaWxlT3B0aW9ucyB7XG5cdGlmICghb3B0aW9ucykge1xuXHRcdHJldHVybiB7IG1vZGU6IDBvNjY2IC8qIGRlZmF1bHQgbm9kZS5qcyBtb2RlIGZvciBmaWxlcyAqLywgZmxhZzogJ3cnIH07XG5cdH1cblxuXHRyZXR1cm4ge1xuXHRcdG1vZGU6IHR5cGVvZiBvcHRpb25zLm1vZGUgPT09ICdudW1iZXInID8gb3B0aW9ucy5tb2RlIDogMG82NjYgLyogZGVmYXVsdCBub2RlLmpzIG1vZGUgZm9yIGZpbGVzICovLFxuXHRcdGZsYWc6IHR5cGVvZiBvcHRpb25zLmZsYWcgPT09ICdzdHJpbmcnID8gb3B0aW9ucy5mbGFnIDogJ3cnXG5cdH07XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gTW92ZSAvIENvcHlcblxuLyoqXG4gKiBBIGRyb3AtaW4gcmVwbGFjZW1lbnQgZm9yIGBmcy5yZW5hbWVgIHRoYXQ6XG4gKiAtIGFsbG93cyB0byBtb3ZlIGFjcm9zcyBtdWx0aXBsZSBkaXNrc1xuICogLSBhdHRlbXB0cyB0byByZXRyeSB0aGUgb3BlcmF0aW9uIGZvciBjZXJ0YWluIGVycm9yIGNvZGVzIG9uIFdpbmRvd3NcbiAqL1xuYXN5bmMgZnVuY3Rpb24gcmVuYW1lKHNvdXJjZTogc3RyaW5nLCB0YXJnZXQ6IHN0cmluZywgd2luZG93c1JldHJ5VGltZW91dDogbnVtYmVyIHwgZmFsc2UgPSA2MDAwMCk6IFByb21pc2U8dm9pZD4ge1xuXHRpZiAoc291cmNlID09PSB0YXJnZXQpIHtcblx0XHRyZXR1cm47ICAvLyBzaW11bGF0ZSBub2RlLmpzIGJlaGF2aW91ciBoZXJlIGFuZCBkbyBhIG5vLW9wIGlmIHBhdGhzIG1hdGNoXG5cdH1cblxuXHR0cnkge1xuXHRcdGlmIChpc1dpbmRvd3MgJiYgdHlwZW9mIHdpbmRvd3NSZXRyeVRpbWVvdXQgPT09ICdudW1iZXInKSB7XG5cdFx0XHQvLyBPbiBXaW5kb3dzLCBhIHJlbmFtZSBjYW4gZmFpbCB3aGVuIGVpdGhlciBzb3VyY2Ugb3IgdGFyZ2V0XG5cdFx0XHQvLyBpcyBsb2NrZWQgYnkgQVYgc29mdHdhcmUuXG5cdFx0XHRhd2FpdCByZW5hbWVXaXRoUmV0cnkoc291cmNlLCB0YXJnZXQsIERhdGUubm93KCksIHdpbmRvd3NSZXRyeVRpbWVvdXQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCBmcy5wcm9taXNlcy5yZW5hbWUoc291cmNlLCB0YXJnZXQpO1xuXHRcdH1cblx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHQvLyBJbiB0d28gY2FzZXMgd2UgZmFsbGJhY2sgdG8gY2xhc3NpYyBjb3B5IGFuZCBkZWxldGU6XG5cdFx0Ly9cblx0XHQvLyAxLikgVGhlIEVYREVWIGVycm9yIGluZGljYXRlcyB0aGF0IHNvdXJjZSBhbmQgdGFyZ2V0IGFyZSBvbiBkaWZmZXJlbnQgZGV2aWNlc1xuXHRcdC8vIEluIHRoaXMgY2FzZSwgZmFsbGJhY2sgdG8gdXNpbmcgYSBjb3B5KCkgb3BlcmF0aW9uIGFzIHRoZXJlIGlzIG5vIHdheSB0b1xuXHRcdC8vIHJlbmFtZSgpIGJldHdlZW4gZGlmZmVyZW50IGRldmljZXMuXG5cdFx0Ly9cblx0XHQvLyAyLikgVGhlIHVzZXIgdHJpZXMgdG8gcmVuYW1lIGEgZmlsZS9mb2xkZXIgdGhhdCBlbmRzIHdpdGggYSBkb3QuIFRoaXMgaXMgbm90XG5cdFx0Ly8gcmVhbGx5IHBvc3NpYmxlIHRvIG1vdmUgdGhlbiwgYXQgbGVhc3Qgb24gVU5DIGRldmljZXMuXG5cdFx0aWYgKHNvdXJjZS50b0xvd2VyQ2FzZSgpICE9PSB0YXJnZXQudG9Mb3dlckNhc2UoKSAmJiBlcnJvci5jb2RlID09PSAnRVhERVYnIHx8IHNvdXJjZS5lbmRzV2l0aCgnLicpKSB7XG5cdFx0XHRhd2FpdCBjb3B5KHNvdXJjZSwgdGFyZ2V0LCB7IHByZXNlcnZlU3ltbGlua3M6IGZhbHNlIC8qIGNvcHlpbmcgdG8gYW5vdGhlciBkZXZpY2UgKi8gfSk7XG5cdFx0XHRhd2FpdCByaW1yYWYoc291cmNlLCBSaW1SYWZNb2RlLk1PVkUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gcmVuYW1lV2l0aFJldHJ5KHNvdXJjZTogc3RyaW5nLCB0YXJnZXQ6IHN0cmluZywgc3RhcnRUaW1lOiBudW1iZXIsIHJldHJ5VGltZW91dDogbnVtYmVyLCBhdHRlbXB0ID0gMCk6IFByb21pc2U8dm9pZD4ge1xuXHR0cnkge1xuXHRcdHJldHVybiBhd2FpdCBmcy5wcm9taXNlcy5yZW5hbWUoc291cmNlLCB0YXJnZXQpO1xuXHR9IGNhdGNoIChlcnJvcikge1xuXHRcdGlmIChlcnJvci5jb2RlICE9PSAnRUFDQ0VTJyAmJiBlcnJvci5jb2RlICE9PSAnRVBFUk0nICYmIGVycm9yLmNvZGUgIT09ICdFQlVTWScpIHtcblx0XHRcdHRocm93IGVycm9yOyAvLyBvbmx5IGZvciBlcnJvcnMgd2UgdGhpbmsgYXJlIHRlbXBvcmFyeVxuXHRcdH1cblxuXHRcdGlmIChEYXRlLm5vdygpIC0gc3RhcnRUaW1lID49IHJldHJ5VGltZW91dCkge1xuXHRcdFx0Y29uc29sZS5lcnJvcihgW25vZGUuanMgZnNdIHJlbmFtZSBmYWlsZWQgYWZ0ZXIgJHthdHRlbXB0fSByZXRyaWVzIHdpdGggZXJyb3I6ICR7ZXJyb3J9YCk7XG5cblx0XHRcdHRocm93IGVycm9yOyAvLyBnaXZlIHVwIGFmdGVyIGNvbmZpZ3VyYWJsZSB0aW1lb3V0XG5cdFx0fVxuXG5cdFx0aWYgKGF0dGVtcHQgPT09IDApIHtcblx0XHRcdGxldCBhYm9ydFJldHJ5ID0gZmFsc2U7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCB7IHN0YXQgfSA9IGF3YWl0IFN5bWxpbmtTdXBwb3J0LnN0YXQodGFyZ2V0KTtcblx0XHRcdFx0aWYgKCFzdGF0LmlzRmlsZSgpKSB7XG5cdFx0XHRcdFx0YWJvcnRSZXRyeSA9IHRydWU7IC8vIGlmIHRhcmdldCBpcyBub3QgYSBmaWxlLCBFUEVSTSBlcnJvciBtYXkgYmUgcmFpc2VkIGFuZCB3ZSBzaG91bGQgbm90IGF0dGVtcHQgdG8gcmV0cnlcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIElnbm9yZVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoYWJvcnRSZXRyeSkge1xuXHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBEZWxheSB3aXRoIGluY3JlbWVudGFsIGJhY2tvZmYgdXAgdG8gMTAwbXNcblx0XHRhd2FpdCB0aW1lb3V0KE1hdGgubWluKDEwMCwgYXR0ZW1wdCAqIDEwKSk7XG5cblx0XHQvLyBBdHRlbXB0IGFnYWluXG5cdFx0cmV0dXJuIHJlbmFtZVdpdGhSZXRyeShzb3VyY2UsIHRhcmdldCwgc3RhcnRUaW1lLCByZXRyeVRpbWVvdXQsIGF0dGVtcHQgKyAxKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSUNvcHlQYXlsb2FkIHtcblx0cmVhZG9ubHkgcm9vdDogeyBzb3VyY2U6IHN0cmluZzsgdGFyZ2V0OiBzdHJpbmcgfTtcblx0cmVhZG9ubHkgb3B0aW9uczogeyBwcmVzZXJ2ZVN5bWxpbmtzOiBib29sZWFuIH07XG5cdHJlYWRvbmx5IGhhbmRsZWRTb3VyY2VQYXRoczogU2V0PHN0cmluZz47XG59XG5cbi8qKlxuICogUmVjdXJzaXZlbHkgY29waWVzIGFsbCBvZiBgc291cmNlYCB0byBgdGFyZ2V0YC5cbiAqXG4gKiBUaGUgb3B0aW9ucyBgcHJlc2VydmVTeW1saW5rc2AgY29uZmlndXJlcyBob3cgc3ltYm9saWNcbiAqIGxpbmtzIHNob3VsZCBiZSBoYW5kbGVkIHdoZW4gZW5jb3VudGVyZWQuIFNldCB0b1xuICogYGZhbHNlYCB0byBub3QgcHJlc2VydmUgdGhlbSBhbmQgYHRydWVgIG90aGVyd2lzZS5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gY29weShzb3VyY2U6IHN0cmluZywgdGFyZ2V0OiBzdHJpbmcsIG9wdGlvbnM6IHsgcHJlc2VydmVTeW1saW5rczogYm9vbGVhbiB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdHJldHVybiBkb0NvcHkoc291cmNlLCB0YXJnZXQsIHsgcm9vdDogeyBzb3VyY2UsIHRhcmdldCB9LCBvcHRpb25zLCBoYW5kbGVkU291cmNlUGF0aHM6IG5ldyBTZXQ8c3RyaW5nPigpIH0pO1xufVxuXG4vLyBXaGVuIGNvcHlpbmcgYSBmaWxlIG9yIGZvbGRlciwgd2Ugd2FudCB0byBwcmVzZXJ2ZSB0aGUgbW9kZVxuLy8gaXQgaGFkIGFuZCBhcyBzdWNoIHByb3ZpZGUgaXQgd2hlbiBjcmVhdGluZy4gSG93ZXZlciwgbW9kZXNcbi8vIGNhbiBnbyBiZXlvbmQgd2hhdCB3ZSBleHBlY3QgKHNlZSBsaW5rIGJlbG93KSwgc28gd2UgbWFzayBpdC5cbi8vIChodHRwczovL2dpdGh1Yi5jb20vbm9kZWpzL25vZGUtdjAueC1hcmNoaXZlL2lzc3Vlcy8zMDQ1I2lzc3VlY29tbWVudC00ODYyNTg4KVxuY29uc3QgQ09QWV9NT0RFX01BU0sgPSAwbzc3NztcblxuYXN5bmMgZnVuY3Rpb24gZG9Db3B5KHNvdXJjZTogc3RyaW5nLCB0YXJnZXQ6IHN0cmluZywgcGF5bG9hZDogSUNvcHlQYXlsb2FkKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0Ly8gS2VlcCB0cmFjayBvZiBwYXRocyBhbHJlYWR5IGNvcGllZCB0byBwcmV2ZW50XG5cdC8vIGN5Y2xlcyBmcm9tIHN5bWJvbGljIGxpbmtzIHRvIGNhdXNlIGlzc3Vlc1xuXHRpZiAocGF5bG9hZC5oYW5kbGVkU291cmNlUGF0aHMuaGFzKHNvdXJjZSkpIHtcblx0XHRyZXR1cm47XG5cdH0gZWxzZSB7XG5cdFx0cGF5bG9hZC5oYW5kbGVkU291cmNlUGF0aHMuYWRkKHNvdXJjZSk7XG5cdH1cblxuXHRjb25zdCB7IHN0YXQsIHN5bWJvbGljTGluayB9ID0gYXdhaXQgU3ltbGlua1N1cHBvcnQuc3RhdChzb3VyY2UpO1xuXG5cdC8vIFN5bWxpbmtcblx0aWYgKHN5bWJvbGljTGluaykge1xuXG5cdFx0Ly8gVHJ5IHRvIHJlLWNyZWF0ZSB0aGUgc3ltbGluayB1bmxlc3MgYHByZXNlcnZlU3ltbGlua3M6IGZhbHNlYFxuXHRcdGlmIChwYXlsb2FkLm9wdGlvbnMucHJlc2VydmVTeW1saW5rcykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IGRvQ29weVN5bWxpbmsoc291cmNlLCB0YXJnZXQsIHBheWxvYWQpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIGluIGFueSBjYXNlIG9mIGFuIGVycm9yIGZhbGxiYWNrIHRvIG5vcm1hbCBjb3B5IHZpYSBkZXJlZmVyZW5jaW5nXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHN5bWJvbGljTGluay5kYW5nbGluZykge1xuXHRcdFx0cmV0dXJuOyAvLyBza2lwIGRhbmdsaW5nIHN5bWJvbGljIGxpbmtzIGZyb20gaGVyZSBvbiAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzExMTYyMSlcblx0XHR9XG5cdH1cblxuXHQvLyBGb2xkZXJcblx0aWYgKHN0YXQuaXNEaXJlY3RvcnkoKSkge1xuXHRcdHJldHVybiBkb0NvcHlEaXJlY3Rvcnkoc291cmNlLCB0YXJnZXQsIHN0YXQubW9kZSAmIENPUFlfTU9ERV9NQVNLLCBwYXlsb2FkKTtcblx0fVxuXG5cdC8vIEZpbGUgb3IgZmlsZS1saWtlXG5cdGVsc2Uge1xuXHRcdHJldHVybiBkb0NvcHlGaWxlKHNvdXJjZSwgdGFyZ2V0LCBzdGF0Lm1vZGUgJiBDT1BZX01PREVfTUFTSyk7XG5cdH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gZG9Db3B5RGlyZWN0b3J5KHNvdXJjZTogc3RyaW5nLCB0YXJnZXQ6IHN0cmluZywgbW9kZTogbnVtYmVyLCBwYXlsb2FkOiBJQ29weVBheWxvYWQpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHQvLyBDcmVhdGUgZm9sZGVyXG5cdGF3YWl0IGZzLnByb21pc2VzLm1rZGlyKHRhcmdldCwgeyByZWN1cnNpdmU6IHRydWUsIG1vZGUgfSk7XG5cblx0Ly8gQ29weSBlYWNoIGZpbGUgcmVjdXJzaXZlbHlcblx0Y29uc3QgZmlsZXMgPSBhd2FpdCByZWFkZGlyKHNvdXJjZSk7XG5cdGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuXHRcdGF3YWl0IGRvQ29weShqb2luKHNvdXJjZSwgZmlsZSksIGpvaW4odGFyZ2V0LCBmaWxlKSwgcGF5bG9hZCk7XG5cdH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gZG9Db3B5RmlsZShzb3VyY2U6IHN0cmluZywgdGFyZ2V0OiBzdHJpbmcsIG1vZGU6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXG5cdC8vIENvcHkgZmlsZVxuXHRhd2FpdCBmcy5wcm9taXNlcy5jb3B5RmlsZShzb3VyY2UsIHRhcmdldCk7XG5cblx0Ly8gcmVzdG9yZSBtb2RlIChodHRwczovL2dpdGh1Yi5jb20vbm9kZWpzL25vZGUvaXNzdWVzLzExMDQpXG5cdGF3YWl0IGZzLnByb21pc2VzLmNobW9kKHRhcmdldCwgbW9kZSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGRvQ29weVN5bWxpbmsoc291cmNlOiBzdHJpbmcsIHRhcmdldDogc3RyaW5nLCBwYXlsb2FkOiBJQ29weVBheWxvYWQpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHQvLyBGaWd1cmUgb3V0IGxpbmsgdGFyZ2V0XG5cdGxldCBsaW5rVGFyZ2V0ID0gYXdhaXQgZnMucHJvbWlzZXMucmVhZGxpbmsoc291cmNlKTtcblxuXHQvLyBTcGVjaWFsIGNhc2U6IHRoZSBzeW1saW5rIHBvaW50cyB0byBhIHRhcmdldCB0aGF0IGlzXG5cdC8vIGFjdHVhbGx5IHdpdGhpbiB0aGUgcGF0aCB0aGF0IGlzIGJlaW5nIGNvcGllZC4gSW4gdGhhdFxuXHQvLyBjYXNlIHdlIHdhbnQgdGhlIHN5bWxpbmsgdG8gcG9pbnQgdG8gdGhlIHRhcmdldCBhbmRcblx0Ly8gbm90IHRoZSBzb3VyY2Vcblx0aWYgKGlzRXF1YWxPclBhcmVudChsaW5rVGFyZ2V0LCBwYXlsb2FkLnJvb3Quc291cmNlLCAhaXNMaW51eCkpIHtcblx0XHRsaW5rVGFyZ2V0ID0gam9pbihwYXlsb2FkLnJvb3QudGFyZ2V0LCBsaW5rVGFyZ2V0LnN1YnN0cihwYXlsb2FkLnJvb3Quc291cmNlLmxlbmd0aCArIDEpKTtcblx0fVxuXG5cdC8vIENyZWF0ZSBzeW1saW5rXG5cdGF3YWl0IGZzLnByb21pc2VzLnN5bWxpbmsobGlua1RhcmdldCwgdGFyZ2V0KTtcbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBQYXRoIHJlc29sdmVyc1xuXG4vKipcbiAqIEdpdmVuIGFuIGFic29sdXRlLCBub3JtYWxpemVkLCBhbmQgZXhpc3RpbmcgZmlsZSBwYXRoICdyZWFsY2FzZScgcmV0dXJucyB0aGVcbiAqIGV4YWN0IHBhdGggdGhhdCB0aGUgZmlsZSBoYXMgb24gZGlzay5cbiAqIE9uIGEgY2FzZSBpbnNlbnNpdGl2ZSBmaWxlIHN5c3RlbSwgdGhlIHJldHVybmVkIHBhdGggbWlnaHQgZGlmZmVyIGZyb20gdGhlIG9yaWdpbmFsXG4gKiBwYXRoIGJ5IGNoYXJhY3RlciBjYXNpbmcuXG4gKiBPbiBhIGNhc2Ugc2Vuc2l0aXZlIGZpbGUgc3lzdGVtLCB0aGUgcmV0dXJuZWQgcGF0aCB3aWxsIGFsd2F5cyBiZSBpZGVudGljYWwgdG8gdGhlXG4gKiBvcmlnaW5hbCBwYXRoLlxuICogSW4gY2FzZSBvZiBlcnJvcnMsIG51bGwgaXMgcmV0dXJuZWQuIEJ1dCB5b3UgY2Fubm90IHVzZSB0aGlzIGZ1bmN0aW9uIHRvIHZlcmlmeSB0aGF0XG4gKiBhIHBhdGggZXhpc3RzLlxuICpcbiAqIHJlYWxjYXNlIGRvZXMgbm90IGhhbmRsZSAnLi4nIG9yICcuJyBwYXRoIHNlZ21lbnRzIGFuZCBpdCBkb2VzIG5vdCB0YWtlIHRoZSBsb2NhbGUgaW50byBhY2NvdW50LlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVhbGNhc2UocGF0aDogc3RyaW5nLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG5cdGlmIChpc0xpbnV4KSB7XG5cdFx0Ly8gVGhpcyBtZXRob2QgaXMgdW5zdXBwb3J0ZWQgb24gT1MgdGhhdCBoYXZlIGNhc2Ugc2Vuc2l0aXZlXG5cdFx0Ly8gZmlsZSBzeXN0ZW0gd2hlcmUgdGhlIHNhbWUgcGF0aCBjYW4gZXhpc3QgaW4gZGlmZmVyZW50IGZvcm1zXG5cdFx0Ly8gKHNlZSBhbHNvIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMzk3MDkpXG5cdFx0cmV0dXJuIHBhdGg7XG5cdH1cblxuXHRjb25zdCBkaXIgPSBkaXJuYW1lKHBhdGgpO1xuXHRpZiAocGF0aCA9PT0gZGlyKSB7XHQvLyBlbmQgcmVjdXJzaW9uXG5cdFx0cmV0dXJuIHBhdGg7XG5cdH1cblxuXHRjb25zdCBuYW1lID0gKGJhc2VuYW1lKHBhdGgpIC8qIGNhbiBiZSAnJyBmb3Igd2luZG93cyBkcml2ZSBsZXR0ZXJzICovIHx8IHBhdGgpLnRvTG93ZXJDYXNlKCk7XG5cdHRyeSB7XG5cdFx0aWYgKHRva2VuPy5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW50cmllcyA9IGF3YWl0IFByb21pc2VzLnJlYWRkaXIoZGlyKTtcblx0XHRjb25zdCBmb3VuZCA9IGVudHJpZXMuZmlsdGVyKGUgPT4gZS50b0xvd2VyQ2FzZSgpID09PSBuYW1lKTtcdC8vIHVzZSBhIGNhc2UgaW5zZW5zaXRpdmUgc2VhcmNoXG5cdFx0aWYgKGZvdW5kLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0Ly8gb24gYSBjYXNlIHNlbnNpdGl2ZSBmaWxlc3lzdGVtIHdlIGNhbm5vdCBkZXRlcm1pbmUgaGVyZSwgd2hldGhlciB0aGUgZmlsZSBleGlzdHMgb3Igbm90LCBoZW5jZSB3ZSBuZWVkIHRoZSAnZmlsZSBleGlzdHMnIHByZWNvbmRpdGlvblxuXHRcdFx0Y29uc3QgcHJlZml4ID0gYXdhaXQgcmVhbGNhc2UoZGlyLCB0b2tlbik7ICAgLy8gcmVjdXJzZVxuXHRcdFx0aWYgKHByZWZpeCkge1xuXHRcdFx0XHRyZXR1cm4gam9pbihwcmVmaXgsIGZvdW5kWzBdKTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGZvdW5kLmxlbmd0aCA+IDEpIHtcblx0XHRcdC8vIG11c3QgYmUgYSBjYXNlIHNlbnNpdGl2ZSAkZmlsZXN5c3RlbVxuXHRcdFx0Y29uc3QgaXggPSBmb3VuZC5pbmRleE9mKG5hbWUpO1xuXHRcdFx0aWYgKGl4ID49IDApIHtcdC8vIGNhc2Ugc2Vuc2l0aXZlXG5cdFx0XHRcdGNvbnN0IHByZWZpeCA9IGF3YWl0IHJlYWxjYXNlKGRpciwgdG9rZW4pOyAgIC8vIHJlY3Vyc2Vcblx0XHRcdFx0aWYgKHByZWZpeCkge1xuXHRcdFx0XHRcdHJldHVybiBqb2luKHByZWZpeCwgZm91bmRbaXhdKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSBjYXRjaCB7XG5cdFx0Ly8gc2lsZW50bHkgaWdub3JlIGVycm9yXG5cdH1cblxuXHRyZXR1cm4gbnVsbDtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcmVhbHBhdGgocGF0aDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0dHJ5IHtcblx0XHQvLyBETyBOT1QgVVNFIGBmcy5wcm9taXNlcy5yZWFscGF0aGAgaGVyZSBhcyBpdCBpbnRlcm5hbGx5XG5cdFx0Ly8gY2FsbHMgYGZzLm5hdGl2ZS5yZWFscGF0aGAgd2hpY2ggd2lsbCByZXN1bHQgaW4gc3Vic3Rcblx0XHQvLyBkcml2ZXMgdG8gYmUgcmVzb2x2ZWQgdG8gdGhlaXIgdGFyZ2V0IG9uIFdpbmRvd3Ncblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTE4NTYyXG5cdFx0cmV0dXJuIGF3YWl0IHByb21pc2lmeShmcy5yZWFscGF0aCkocGF0aCk7XG5cdH0gY2F0Y2gge1xuXG5cdFx0Ly8gV2UgaGl0IGFuIGVycm9yIGNhbGxpbmcgZnMucmVhbHBhdGgoKS4gU2luY2UgZnMucmVhbHBhdGgoKSBpcyBkb2luZyBzb21lIHBhdGggbm9ybWFsaXphdGlvblxuXHRcdC8vIHdlIG5vdyBkbyBhIHNpbWlsYXIgbm9ybWFsaXphdGlvbiBhbmQgdGhlbiB0cnkgYWdhaW4gaWYgd2UgY2FuIGFjY2VzcyB0aGUgcGF0aCB3aXRoIHJlYWRcblx0XHQvLyBwZXJtaXNzaW9ucyBhdCBsZWFzdC4gSWYgdGhhdCBzdWNjZWVkcywgd2UgcmV0dXJuIHRoYXQgcGF0aC5cblx0XHQvLyBmcy5yZWFscGF0aCgpIGlzIHJlc29sdmluZyBzeW1saW5rcyBhbmQgdGhhdCBjYW4gZmFpbCBpbiBjZXJ0YWluIGNhc2VzLiBUaGUgd29ya2Fyb3VuZCBpc1xuXHRcdC8vIHRvIG5vdCByZXNvbHZlIGxpbmtzIGJ1dCB0byBzaW1wbHkgc2VlIGlmIHRoZSBwYXRoIGlzIHJlYWQgYWNjZXNzaWJsZSBvciBub3QuXG5cdFx0Y29uc3Qgbm9ybWFsaXplZFBhdGggPSBub3JtYWxpemVQYXRoKHBhdGgpO1xuXG5cdFx0YXdhaXQgZnMucHJvbWlzZXMuYWNjZXNzKG5vcm1hbGl6ZWRQYXRoLCBmcy5jb25zdGFudHMuUl9PSyk7XG5cblx0XHRyZXR1cm4gbm9ybWFsaXplZFBhdGg7XG5cdH1cbn1cblxuLyoqXG4gKiBAZGVwcmVjYXRlZCBhbHdheXMgcHJlZmVyIGFzeW5jIHZhcmlhbnRzIG92ZXIgc3luYyFcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlYWxwYXRoU3luYyhwYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuXHR0cnkge1xuXHRcdHJldHVybiBmcy5yZWFscGF0aFN5bmMocGF0aCk7XG5cdH0gY2F0Y2gge1xuXG5cdFx0Ly8gV2UgaGl0IGFuIGVycm9yIGNhbGxpbmcgZnMucmVhbHBhdGhTeW5jKCkuIFNpbmNlIGZzLnJlYWxwYXRoU3luYygpIGlzIGRvaW5nIHNvbWUgcGF0aCBub3JtYWxpemF0aW9uXG5cdFx0Ly8gd2Ugbm93IGRvIGEgc2ltaWxhciBub3JtYWxpemF0aW9uIGFuZCB0aGVuIHRyeSBhZ2FpbiBpZiB3ZSBjYW4gYWNjZXNzIHRoZSBwYXRoIHdpdGggcmVhZFxuXHRcdC8vIHBlcm1pc3Npb25zIGF0IGxlYXN0LiBJZiB0aGF0IHN1Y2NlZWRzLCB3ZSByZXR1cm4gdGhhdCBwYXRoLlxuXHRcdC8vIGZzLnJlYWxwYXRoKCkgaXMgcmVzb2x2aW5nIHN5bWxpbmtzIGFuZCB0aGF0IGNhbiBmYWlsIGluIGNlcnRhaW4gY2FzZXMuIFRoZSB3b3JrYXJvdW5kIGlzXG5cdFx0Ly8gdG8gbm90IHJlc29sdmUgbGlua3MgYnV0IHRvIHNpbXBseSBzZWUgaWYgdGhlIHBhdGggaXMgcmVhZCBhY2Nlc3NpYmxlIG9yIG5vdC5cblx0XHRjb25zdCBub3JtYWxpemVkUGF0aCA9IG5vcm1hbGl6ZVBhdGgocGF0aCk7XG5cblx0XHRmcy5hY2Nlc3NTeW5jKG5vcm1hbGl6ZWRQYXRoLCBmcy5jb25zdGFudHMuUl9PSyk7IC8vIHRocm93cyBpbiBjYXNlIG9mIGFuIGVycm9yXG5cblx0XHRyZXR1cm4gbm9ybWFsaXplZFBhdGg7XG5cdH1cbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplUGF0aChwYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gcnRyaW0obm9ybWFsaXplKHBhdGgpLCBzZXApO1xufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIFByb21pc2UgYmFzZWQgZnMgbWV0aG9kc1xuXG4vKipcbiAqIFNvbWUgbG93IGxldmVsIGBmc2AgbWV0aG9kcyBwcm92aWRlZCBhcyBgUHJvbWlzZXNgIHNpbWlsYXIgdG9cbiAqIGBmcy5wcm9taXNlc2AgYnV0IHdpdGggbm90YWJsZSBkaWZmZXJlbmNlcywgZWl0aGVyIGltcGxlbWVudGVkXG4gKiBieSB1cyBvciBieSByZXN0b3JpbmcgdGhlIG9yaWdpbmFsIGNhbGxiYWNrIGJhc2VkIGJlaGF2aW9yLlxuICpcbiAqIEF0IGxlYXN0IGByZWFscGF0aGAgaXMgaW1wbGVtZW50ZWQgZGlmZmVyZW50bHkgaW4gdGhlIHByb21pc2VcbiAqIGJhc2VkIGltcGxlbWVudGF0aW9uIGNvbXBhcmVkIHRvIHRoZSBjYWxsYmFjayBiYXNlZCBvbmUuIFRoZVxuICogcHJvbWlzZSBiYXNlZCBpbXBsZW1lbnRhdGlvbiBhY3R1YWxseSBjYWxscyBgZnMucmVhbHBhdGgubmF0aXZlYC5cbiAqIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTE4NTYyKVxuICovXG5leHBvcnQgY29uc3QgUHJvbWlzZXMgPSBuZXcgY2xhc3Mge1xuXG5cdC8vI3JlZ2lvbiBJbXBsZW1lbnRlZCBieSBub2RlLmpzXG5cblx0Z2V0IHJlYWQoKSB7XG5cblx0XHQvLyBOb3QgdXNpbmcgYHByb21pc2lmeWAgaGVyZSBmb3IgYSByZWFzb246IHRoZSByZXR1cm5cblx0XHQvLyB0eXBlIGlzIG5vdCBhbiBvYmplY3QgYXMgaW5kaWNhdGVkIGJ5IFR5cGVTY3JpcHQgYnV0XG5cdFx0Ly8ganVzdCB0aGUgYnl0ZXMgcmVhZCwgc28gd2UgY3JlYXRlIG91ciBvd24gd3JhcHBlci5cblxuXHRcdHJldHVybiAoZmQ6IG51bWJlciwgYnVmZmVyOiBVaW50OEFycmF5LCBvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIsIHBvc2l0aW9uOiBudW1iZXIgfCBudWxsKSA9PiB7XG5cdFx0XHRyZXR1cm4gbmV3IFByb21pc2U8eyBieXRlc1JlYWQ6IG51bWJlcjsgYnVmZmVyOiBVaW50OEFycmF5IH0+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdFx0ZnMucmVhZChmZCwgYnVmZmVyLCBvZmZzZXQsIGxlbmd0aCwgcG9zaXRpb24sIChlcnIsIGJ5dGVzUmVhZCwgYnVmZmVyKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHJlamVjdChlcnIpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiByZXNvbHZlKHsgYnl0ZXNSZWFkLCBidWZmZXIgfSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fTtcblx0fVxuXG5cdGdldCB3cml0ZSgpIHtcblxuXHRcdC8vIE5vdCB1c2luZyBgcHJvbWlzaWZ5YCBoZXJlIGZvciBhIHJlYXNvbjogdGhlIHJldHVyblxuXHRcdC8vIHR5cGUgaXMgbm90IGFuIG9iamVjdCBhcyBpbmRpY2F0ZWQgYnkgVHlwZVNjcmlwdCBidXRcblx0XHQvLyBqdXN0IHRoZSBieXRlcyB3cml0dGVuLCBzbyB3ZSBjcmVhdGUgb3VyIG93biB3cmFwcGVyLlxuXG5cdFx0cmV0dXJuIChmZDogbnVtYmVyLCBidWZmZXI6IFVpbnQ4QXJyYXksIG9mZnNldDogbnVtYmVyIHwgdW5kZWZpbmVkIHwgbnVsbCwgbGVuZ3RoOiBudW1iZXIgfCB1bmRlZmluZWQgfCBudWxsLCBwb3NpdGlvbjogbnVtYmVyIHwgdW5kZWZpbmVkIHwgbnVsbCkgPT4ge1xuXHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlPHsgYnl0ZXNXcml0dGVuOiBudW1iZXI7IGJ1ZmZlcjogVWludDhBcnJheSB9PigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRcdGZzLndyaXRlKGZkLCBidWZmZXIsIG9mZnNldCwgbGVuZ3RoLCBwb3NpdGlvbiwgKGVyciwgYnl0ZXNXcml0dGVuLCBidWZmZXIpID0+IHtcblx0XHRcdFx0XHRpZiAoZXJyKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gcmVqZWN0KGVycik7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIHJlc29sdmUoeyBieXRlc1dyaXR0ZW4sIGJ1ZmZlciB9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9O1xuXHR9XG5cblx0Z2V0IGZkYXRhc3luYygpIHsgcmV0dXJuIHByb21pc2lmeShmcy5mZGF0YXN5bmMpOyB9IC8vIG5vdCBleHBvc2VkIGFzIEFQSSBpbiAyMi54IHlldFxuXG5cdGdldCBvcGVuKCkgeyByZXR1cm4gcHJvbWlzaWZ5KGZzLm9wZW4pOyB9IFx0XHRcdC8vIGNoYW5nZWQgdG8gcmV0dXJuIGBGaWxlSGFuZGxlYCBpbiBwcm9taXNlIEFQSVxuXHRnZXQgY2xvc2UoKSB7IHJldHVybiBwcm9taXNpZnkoZnMuY2xvc2UpOyB9IFx0XHQvLyBub3QgZXhwb3NlZCBhcyBBUEkgZHVlIHRvIHRoZSBgRmlsZUhhbmRsZWAgcmV0dXJuIHR5cGUgb2YgYG9wZW5gXG5cblx0Z2V0IGZ0cnVuY2F0ZSgpIHsgcmV0dXJuIHByb21pc2lmeShmcy5mdHJ1bmNhdGUpOyB9IC8vIG5vdCBleHBvc2VkIGFzIEFQSSBpbiAyMi54IHlldFxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBJbXBsZW1lbnRlZCBieSB1c1xuXG5cdGFzeW5jIGV4aXN0cyhwYXRoOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgZnMucHJvbWlzZXMuYWNjZXNzKHBhdGgpO1xuXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRnZXQgcmVhZGRpcigpIHsgcmV0dXJuIHJlYWRkaXI7IH1cblx0Z2V0IHJlYWREaXJzSW5EaXIoKSB7IHJldHVybiByZWFkRGlyc0luRGlyOyB9XG5cblx0Z2V0IHdyaXRlRmlsZSgpIHsgcmV0dXJuIHdyaXRlRmlsZTsgfVxuXG5cdGdldCBybSgpIHsgcmV0dXJuIHJpbXJhZjsgfVxuXG5cdGdldCByZW5hbWUoKSB7IHJldHVybiByZW5hbWU7IH1cblx0Z2V0IGNvcHkoKSB7IHJldHVybiBjb3B5OyB9XG5cblx0Z2V0IHJlYWxwYXRoKCkgeyByZXR1cm4gcmVhbHBhdGg7IH1cdC8vIGBmcy5wcm9taXNlcy5yZWFscGF0aGAgd2lsbCB1c2UgYGZzLnJlYWxwYXRoLm5hdGl2ZWAgd2hpY2ggd2UgZG8gbm90IHdhbnRcblxuXHQvLyNlbmRyZWdpb25cbn07XG5cbi8vI2VuZHJlZ2lvblxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxRQUFRO0FBQ3BCLFNBQVMsY0FBYztBQUN2QixT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QUFDO0FBQUEsTUFDRixDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLElBQUksUUFBUTtBQU1YLFdBQU8sQ0FBQyxJQUFZLFFBQW9CLFFBQW1DLFFBQW1DLGFBQXdDO0FBQ3JKLGFBQU8sSUFBSSxRQUFzRCxDQUFDLFNBQVMsV0FBVztBQUNyRixXQUFHLE1BQU0sSUFBSSxRQUFRLFFBQVEsUUFBUSxVQUFVLENBQUMsS0FBSyxjQUFjQSxZQUFXO0FBQzdFLGNBQUksS0FBSztBQUNSLG1CQUFPLE9BQU8sR0FBRztBQUFBLFVBQ2xCO0FBRUEsaUJBQU8sUUFBUSxFQUFFLGNBQWMsUUFBQUEsUUFBTyxDQUFDO0FBQUEsUUFDeEMsQ0FBQztBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQUEsRUFFQSxJQUFJLFlBQVk7QUFBRSxXQUFPLFVBQVUsR0FBRyxTQUFTO0FBQUEsRUFBRztBQUFBO0FBQUEsRUFFbEQsSUFBSSxPQUFPO0FBQUUsV0FBTyxVQUFVLEdBQUcsSUFBSTtBQUFBLEVBQUc7QUFBQTtBQUFBLEVBQ3hDLElBQUksUUFBUTtBQUFFLFdBQU8sVUFBVSxHQUFHLEtBQUs7QUFBQSxFQUFHO0FBQUE7QUFBQSxFQUUxQyxJQUFJLFlBQVk7QUFBRSxXQUFPLFVBQVUsR0FBRyxTQUFTO0FBQUEsRUFBRztBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTWxELE1BQU0sT0FBTyxNQUFnQztBQUM1QyxRQUFJO0FBQ0gsWUFBTSxHQUFHLFNBQVMsT0FBTyxJQUFJO0FBRTdCLGFBQU87QUFBQSxJQUNSLFFBQVE7QUFDUCxhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLElBQUksVUFBVTtBQUFFLFdBQU87QUFBQSxFQUFTO0FBQUEsRUFDaEMsSUFBSSxnQkFBZ0I7QUFBRSxXQUFPO0FBQUEsRUFBZTtBQUFBLEVBRTVDLElBQUksWUFBWTtBQUFFLFdBQU87QUFBQSxFQUFXO0FBQUEsRUFFcEMsSUFBSSxLQUFLO0FBQUUsV0FBTztBQUFBLEVBQVE7QUFBQSxFQUUxQixJQUFJLFNBQVM7QUFBRSxXQUFPO0FBQUEsRUFBUTtBQUFBLEVBQzlCLElBQUksT0FBTztBQUFFLFdBQU87QUFBQSxFQUFNO0FBQUEsRUFFMUIsSUFBSSxXQUFXO0FBQUUsV0FBTztBQUFBLEVBQVU7QUFBQTtBQUFBO0FBR25DOyIsCiAgIm5hbWVzIjogWyJSaW1SYWZNb2RlIiwgIlN5bWxpbmtTdXBwb3J0IiwgImVycm9yIiwgInN0YXQiLCAiYnVmZmVyIl0KfQo=
