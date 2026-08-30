var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import * as fs from "fs";
import * as tar from "tar";
import { VSBuffer } from "../../../base/common/buffer.js";
import { CancellationError } from "../../../base/common/errors.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../base/common/lifecycle.js";
import * as path from "../../../base/common/path.js";
import { format2 } from "../../../base/common/strings.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { detectLibcSync } from "../../../base/node/libc.js";
import { INativeEnvironmentService } from "../../environment/common/environment.js";
import { FileOperationError, FileOperationResult, IFileService, toFileOperationResult } from "../../files/common/files.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { ILogService } from "../../log/common/log.js";
import { IProductService } from "../../product/common/productService.js";
import { IRequestService } from "../../request/common/request.js";
const SUPPORTED_PLATFORMS = /* @__PURE__ */ new Set(["linux", "darwin", "win32"]);
const SUPPORTED_ARCHES = /* @__PURE__ */ new Set(["x64", "arm64"]);
function resolveSdkTarget(pkg, host = { platform: process.platform, arch: process.arch, libc: detectLibcSync() }) {
  if (!SUPPORTED_PLATFORMS.has(host.platform) || !SUPPORTED_ARCHES.has(host.arch)) {
    return void 0;
  }
  if (host.platform === "linux" && pkg.hasSeparateMuslLinuxPackage && host.libc === "musl") {
    return `linux-${host.arch}-musl`;
  }
  return `${host.platform}-${host.arch}`;
}
const IAgentSdkDownloader = createDecorator("agentSdkDownloader");
const LOAD_FAILURE_NEGATIVE_CACHE_MS = 3e4;
const PROGRESS_EMIT_THROTTLE_MS = 250;
function parseContentLength(header) {
  if (typeof header !== "string" || !/^\d+$/.test(header)) {
    return void 0;
  }
  const parsed = parseInt(header, 10);
  return parsed > 0 ? parsed : void 0;
}
let AgentSdkDownloader = class extends Disposable {
  constructor(_environmentService, _productService, _requestService, _fileService, _logService) {
    super();
    this._environmentService = _environmentService;
    this._productService = _productService;
    this._requestService = _requestService;
    this._fileService = _fileService;
    this._logService = _logService;
    this._onDidDownloadProgress = this._register(new Emitter());
    this.onDidDownloadProgress = this._onDidDownloadProgress.event;
    /**
     * In-flight downloads keyed by the destination `cacheDir` (which
     * already encodes `<pkg>/<sdkVersion>/<sdkTarget>`). Concurrent
     * `loadSdkRoot` calls in the same process share the same promise so
     * we never download the same tarball twice. Universal launches that
     * resolve to different targets get distinct entries because their
     * cacheDirs differ.
     */
    this._pendingDownloads = /* @__PURE__ */ new Map();
    /** Refcounted user-initiated progress interest, keyed by package id. */
    this._explicitProgressInterest = /* @__PURE__ */ new Map();
    /**
     * Negative cache: most recent failure per package id, with an expiry.
     * While within the window, `loadSdkRoot` re-throws the cached error
     * immediately instead of re-attempting the download. Without this, a
     * broken CDN causes every SDK method call (poll-driven UIs hit this
     * hard) to fire a fresh request.
     *
     * Keyed by `pkg.id` (not the finer cacheDir): CDN failures are
     * effectively global per SDK (DNS, proxy auth, 5xx) and per-target
     * latching wouldn't protect against the actual failure modes — the
     * broader latch is intentional.
     */
    this._failureLatch = /* @__PURE__ */ new Map();
  }
  isAvailable(pkg) {
    if (process.env[pkg.devOverrideEnvVar]) {
      return true;
    }
    return !!this._productService.agentSdks?.[pkg.id] && resolveSdkTarget(pkg) !== void 0;
  }
  acquireDownloadProgressInterest(pkg) {
    this._explicitProgressInterest.set(pkg.id, (this._explicitProgressInterest.get(pkg.id) ?? 0) + 1);
    return toDisposable(() => {
      const count = this._explicitProgressInterest.get(pkg.id) ?? 0;
      if (count <= 1) {
        this._explicitProgressInterest.delete(pkg.id);
      } else {
        this._explicitProgressInterest.set(pkg.id, count - 1);
      }
    });
  }
  async isSdkResolvableWithoutDownload(pkg) {
    if (process.env[pkg.devOverrideEnvVar]) {
      return true;
    }
    const config = this._productService.agentSdks?.[pkg.id];
    if (!config) {
      return false;
    }
    const sdkTarget = resolveSdkTarget(pkg);
    if (!sdkTarget) {
      return false;
    }
    const sentinel = URI.joinPath(URI.file(this._cacheDir(pkg.id, config.version, sdkTarget)), ".complete");
    return this._fileService.exists(sentinel);
  }
  async loadSdkRoot(pkg, token) {
    const override = process.env[pkg.devOverrideEnvVar];
    if (override) {
      this._logService.info(`[AgentSdkDownloader] ${pkg.id}: using dev override at ${override}`);
      return override;
    }
    const latched = this._failureLatch.get(pkg.id);
    if (latched && latched.expiresAt > Date.now()) {
      throw latched.error;
    }
    try {
      const root = await this._resolveOrDownload(pkg, token);
      this._failureLatch.delete(pkg.id);
      return root;
    } catch (err) {
      if (token.isCancellationRequested) {
        throw err;
      }
      const error = err instanceof Error ? err : new Error(String(err));
      this._failureLatch.set(pkg.id, {
        error,
        expiresAt: Date.now() + LOAD_FAILURE_NEGATIVE_CACHE_MS
      });
      throw error;
    }
  }
  async _resolveOrDownload(pkg, token) {
    const config = this._productService.agentSdks?.[pkg.id];
    if (!config) {
      throw new Error(
        `Cannot load ${pkg.id} SDK: no \`product.agentSdks.${pkg.id}\` configured and no ${pkg.devOverrideEnvVar} dev override set.`
      );
    }
    const sdkTarget = resolveSdkTarget(pkg);
    if (!sdkTarget) {
      throw new Error(
        `Cannot load ${pkg.id} SDK: no SDK target for this host (${process.platform}/${process.arch}). Set ${pkg.devOverrideEnvVar} to a local SDK root to bypass.`
      );
    }
    const url = format2(config.urlTemplate, { sdkTarget });
    const stray = /{[^}]+}/.exec(url);
    if (stray) {
      throw new Error(
        `Cannot load ${pkg.id} SDK: \`product.agentSdks.${pkg.id}.urlTemplate\` contains an unknown placeholder ${stray[0]} \u2014 only {sdkTarget} is substituted. Template: ${config.urlTemplate}`
      );
    }
    const cacheDir = this._cacheDir(pkg.id, config.version, sdkTarget);
    const sentinel = URI.joinPath(URI.file(cacheDir), ".complete");
    if (await this._fileService.exists(sentinel)) {
      return cacheDir;
    }
    let pending = this._pendingDownloads.get(cacheDir);
    if (!pending) {
      pending = this._download(pkg, url, cacheDir, sentinel, token).finally(() => {
        this._pendingDownloads.delete(cacheDir);
      });
      this._pendingDownloads.set(cacheDir, pending);
    }
    return pending;
  }
  _cacheDir(packageId, sdkVersion, sdkTarget) {
    return path.join(
      this._environmentService.userDataPath,
      "agent-host",
      "sdk-cache",
      packageId,
      sdkVersion,
      sdkTarget
    );
  }
  async _download(pkg, url, cacheDir, sentinel, token) {
    this._logService.info(`[AgentSdkDownloader] ${pkg.id}: downloading from ${url}`);
    const start = Date.now();
    const parent = path.dirname(cacheDir);
    await this._fileService.createFolder(URI.file(parent));
    const tmpDir = `${cacheDir}.tmp.${process.pid}`;
    const tmpDirUri = URI.file(tmpDir);
    await this._delIgnoringMissing(tmpDirUri);
    await this._fileService.createFolder(tmpDirUri);
    const downloadId = generateUuid();
    let lastReceived = 0;
    let lastTotal;
    this._fireProgress(pkg, downloadId, "started", 0, void 0);
    try {
      const tarballPath = path.join(tmpDir, "sdk.tgz");
      await this._fetch(url, tarballPath, token, (receivedBytes, totalBytes) => {
        lastReceived = receivedBytes;
        lastTotal = totalBytes;
        this._fireProgress(pkg, downloadId, "progress", receivedBytes, totalBytes);
      });
      await this._extractTarGz(tarballPath, tmpDir);
      await this._fileService.del(URI.file(tarballPath));
      await this._fileService.writeFile(
        URI.joinPath(tmpDirUri, ".complete"),
        VSBuffer.fromString("")
      );
      try {
        await this._fileService.move(tmpDirUri, URI.file(cacheDir));
      } catch (err) {
        if (await this._handleRenameLoser(err, sentinel, tmpDirUri)) {
          this._logService.info(`[AgentSdkDownloader] ${pkg.id}: lost rename race, using existing cache`);
          this._fireProgress(pkg, downloadId, "completed", lastReceived, lastTotal);
          return cacheDir;
        }
        throw err;
      }
      const elapsed = Math.round((Date.now() - start) / 1e3);
      this._logService.info(`[AgentSdkDownloader] ${pkg.id}: downloaded in ${elapsed}s`);
      this._fireProgress(pkg, downloadId, "completed", lastTotal ?? lastReceived, lastTotal);
      return cacheDir;
    } catch (err) {
      await this._delIgnoringMissing(tmpDirUri);
      if (token.isCancellationRequested) {
        this._fireProgress(pkg, downloadId, "failed", lastReceived, lastTotal, "cancelled");
        throw new CancellationError();
      }
      const message = err instanceof Error ? err.message : String(err);
      this._fireProgress(pkg, downloadId, "failed", lastReceived, lastTotal, message);
      throw new Error(
        `Failed to download ${pkg.id} SDK from ${url} (cache target: ${cacheDir}). Set ${pkg.devOverrideEnvVar} to a local SDK root to bypass. Cause: ${message}`
      );
    }
  }
  _fireProgress(pkg, downloadId, phase, receivedBytes, totalBytes, error) {
    this._onDidDownloadProgress.fire({
      downloadId,
      packageId: pkg.id,
      displayName: pkg.displayName,
      phase,
      receivedBytes,
      totalBytes,
      explicitlyRequested: this._explicitProgressInterest.has(pkg.id),
      ...error !== void 0 ? { error } : {}
    });
  }
  async _handleRenameLoser(err, sentinel, tmpDirUri) {
    if (!(err instanceof FileOperationError) || err.fileOperationResult !== FileOperationResult.FILE_MOVE_CONFLICT) {
      return false;
    }
    if (!await this._fileService.exists(sentinel)) {
      return false;
    }
    await this._delIgnoringMissing(tmpDirUri);
    return true;
  }
  async _fetch(url, dest, token, onBytes) {
    if (token.isCancellationRequested) {
      throw new CancellationError();
    }
    const context = await this._requestService.request({
      url,
      type: "GET",
      callSite: "agentSdkDownloader"
    }, token);
    if (token.isCancellationRequested) {
      context.stream.destroy();
      throw new CancellationError();
    }
    const statusCode = context.res.statusCode ?? 0;
    if (statusCode < 200 || statusCode >= 300) {
      context.stream.destroy();
      throw new Error(`HTTP ${statusCode} fetching ${url}`);
    }
    const totalBytes = parseContentLength(context.res.headers["content-length"]);
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(dest);
      let settled = false;
      let receivedBytes = 0;
      let lastEmitTime = 0;
      const emitBytes = (force) => {
        if (!onBytes) {
          return;
        }
        const now = Date.now();
        if (!force && now - lastEmitTime < PROGRESS_EMIT_THROTTLE_MS) {
          return;
        }
        lastEmitTime = now;
        onBytes(receivedBytes, totalBytes);
      };
      const settleResolve = () => {
        if (settled) {
          return;
        }
        settled = true;
        cancelSub.dispose();
        resolve();
      };
      const settleReject = (err) => {
        if (settled) {
          return;
        }
        settled = true;
        cancelSub.dispose();
        context.stream.destroy();
        out.destroy();
        reject(err);
      };
      const cancelSub = token.onCancellationRequested(() => settleReject(new CancellationError()));
      out.on("error", settleReject);
      out.on("finish", settleResolve);
      out.on("drain", () => context.stream.resume());
      context.stream.on("data", (chunk) => {
        receivedBytes += chunk.byteLength;
        emitBytes(false);
        if (!out.write(chunk.buffer)) {
          context.stream.pause();
        }
      });
      context.stream.on("end", () => {
        emitBytes(true);
        out.end();
      });
      context.stream.on("error", settleReject);
    });
  }
  async _extractTarGz(tarball, dest) {
    await tar.x({ file: tarball, cwd: dest });
  }
  async _delIgnoringMissing(uri) {
    try {
      await this._fileService.del(uri, { recursive: true });
    } catch (err) {
      if (toFileOperationResult(err) !== FileOperationResult.FILE_NOT_FOUND) {
        throw err;
      }
    }
  }
};
AgentSdkDownloader = __decorateClass([
  __decorateParam(0, INativeEnvironmentService),
  __decorateParam(1, IProductService),
  __decorateParam(2, IRequestService),
  __decorateParam(3, IFileService),
  __decorateParam(4, ILogService)
], AgentSdkDownloader);
export {
  AgentSdkDownloader,
  IAgentSdkDownloader,
  resolveSdkTarget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxhZ2VudFNka0Rvd25sb2FkZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyB0YXIgZnJvbSAndGFyJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgZm9ybWF0MiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgZGV0ZWN0TGliY1N5bmMsIHR5cGUgTGliY0ZhbWlseSB9IGZyb20gJy4uLy4uLy4uL2Jhc2Uvbm9kZS9saWJjLmpzJztcbmltcG9ydCB7IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgRmlsZU9wZXJhdGlvbkVycm9yLCBGaWxlT3BlcmF0aW9uUmVzdWx0LCBJRmlsZVNlcnZpY2UsIHRvRmlsZU9wZXJhdGlvblJlc3VsdCB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBJUmVxdWVzdENvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL3BhcnRzL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QuanMnO1xuXG4vLyAjcmVnaW9uIFBlci1wYWNrYWdlIHN0cmF0ZWd5XG5cbi8qKlxuICogT25lIGFnZW50LVNESyBwYWNrYWdlIHRoZSBkb3dubG9hZGVyIGNhbiBmZXRjaC4gSG9sZHMgdGhlIHBlci1wYWNrYWdlXG4gKiBrbm93bGVkZ2UgdGhhdCB2YXJpZXMgYmV0d2VlbiBDbGF1ZGUsIENvZGV4LCBhbmQgYW55IGZ1dHVyZSBwcm92aWRlciBcdTIwMTRcbiAqIHRoZSBwYWNrYWdlIGlkLCB0aGUgZW52IHZhciB0aGF0IGFjdHMgYXMgYSBkZXYgb3ZlcnJpZGUsIGFuZCBvbmVcbiAqIGJvb2xlYW4gY292ZXJpbmcgdGhlIG9ubHkgbWFwcGluZyBkZXRhaWwgdGhhdCBkaWZmZXJzIGJldHdlZW4gU0RLc1xuICogdG9kYXkgKENsYXVkZSBoYXMgc2VwYXJhdGUgYGxpbnV4LSotbXVzbGAgU0tVczsgQ29kZXgncyBMaW51eCBiaW5hcnlcbiAqIGlzIHN0YXRpY2FsbHkgbXVzbC1saW5rZWQgYW5kIHNoaXBzIGFzIGEgc2luZ2xlIGBsaW51eC0qYCBTS1UpLlxuICpcbiAqIFRoZSBkb3dubG9hZGVyIGl0c2VsZiBpcyBwYWNrYWdlLWFnbm9zdGljOiBpdCBjb25zdW1lcyB0aGlzIGludGVyZmFjZSBhbmRcbiAqIG5ldmVyIGJyYW5jaGVzIG9uIGBpZGAuIENvbmNyZXRlIGBJQWdlbnRTZGtQYWNrYWdlYCBpbnN0YW5jZXMgbGl2ZSBpblxuICogdGhlaXIgb3duaW5nIGFnZW50IG1vZHVsZSAoZS5nLiBgQ2xhdWRlU2RrUGFja2FnZWAgaW5cbiAqIGBjbGF1ZGUvY2xhdWRlQWdlbnRTZGtTZXJ2aWNlLnRzYCwgYENvZGV4U2RrUGFja2FnZWAgaW5cbiAqIGBjb2RleC9jb2RleEFnZW50LnRzYCkgc28gQ2xhdWRlLXNwZWNpZmljIC8gQ29kZXgtc3BlY2lmaWMga25vd2xlZGdlXG4gKiBzdGF5cyBpbiB0aG9zZSBtb2R1bGVzIFx1MjAxNCB0aGUgZG93bmxvYWRlciBkb2Vzbid0IG5hbWUgdGhlIHByb3ZpZGVycyBpdFxuICogc2VydmVzLlxuICpcbiAqIEVhY2ggc2hpcHBlZCBgcHJvZHVjdC5qc29uYCBjYXJyaWVzIG9uZSBge3ZlcnNpb24sIHVybFRlbXBsYXRlfWAgcGVyXG4gKiBTREsuIFRoZSBkb3dubG9hZGVyIHN1YnN0aXR1dGVzIGB7c2RrVGFyZ2V0fWAgKHJlc29sdmVkIHZpYVxuICogYHJlc29sdmVTZGtUYXJnZXQocGtnKWApIGludG8gdGhlIHRlbXBsYXRlIHRvIGdldCB0aGUgcGVyLXRhcmdldFxuICogdGFyYmFsbCBVUkwuIFRoaXMgc2hhcGUgc3VwcG9ydHMgbWFjT1MgVW5pdmVyc2FsIGJ1aWxkcywgd2hlcmUgdGhlXG4gKiBzYW1lIGBwcm9kdWN0Lmpzb25gIGlzIHNoYXJlZCBieSBhcm02NCBhbmQgeDY0IGxhdW5jaGVzLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudFNka1BhY2thZ2Uge1xuXHQvKiogS2V5IHVuZGVyIGBwcm9kdWN0LmFnZW50U2Rrc2AgXHUyMDE0IGUuZy4gYCdjbGF1ZGUnYCwgYCdjb2RleCdgLiAqL1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHQvKipcblx0ICogQnJhbmQgZGlzcGxheSBuYW1lIGZvciB1c2VyLWZhY2luZyBwcm9ncmVzcywgZS5nLiBgJ0NsYXVkZSdgLCBgJ0NvZGV4J2AuXG5cdCAqIFRoZSBkb3dubG9hZGVyIHB1dHMgdGhpcyBvbiB7QGxpbmsgSUFnZW50U2RrRG93bmxvYWRQcm9ncmVzcy5kaXNwbGF5TmFtZX1cblx0ICogc28gY2xpZW50cyBjYW4gYnVpbGQgYSBsb2NhbGl6ZWQgXCJEb3dubG9hZGluZyB7ZGlzcGxheU5hbWV9IGFnZW50XCIgbGFiZWwuXG5cdCAqL1xuXHRyZWFkb25seSBkaXNwbGF5TmFtZTogc3RyaW5nO1xuXHQvKiogRW52IHZhciB0aGF0LCB3aGVuIHNldCwgYmVjb21lcyB0aGUgU0RLIHJvb3QgYW5kIHNob3J0LWNpcmN1aXRzIHRoZSBkb3dubG9hZC4gKi9cblx0cmVhZG9ubHkgZGV2T3ZlcnJpZGVFbnZWYXI6IHN0cmluZztcblx0LyoqXG5cdCAqIFRydWUgaWZmIHRoaXMgU0RLIHB1Ymxpc2hlcyBzZXBhcmF0ZSBgbGludXgte3g2NCxhcm02NH0tbXVzbGBcblx0ICogcGFja2FnZXMgYWxvbmdzaWRlIHRoZSBnbGliYyBkZWZhdWx0LiBDbGF1ZGUgZG9lczsgQ29kZXggZG9lc24ndFxuXHQgKiAoaXRzIExpbnV4IGJpbmFyeSBpcyBzdGF0aWNhbGx5IG11c2wtbGlua2VkIGFuZCBydW5zIG9uIGJvdGgpLlxuXHQgKi9cblx0cmVhZG9ubHkgaGFzU2VwYXJhdGVNdXNsTGludXhQYWNrYWdlOiBib29sZWFuO1xufVxuXG4vKipcbiAqIFBlci1ob3N0IGluZm8gdXNlZCBieSBgcmVzb2x2ZVNka1RhcmdldGAuIERlZmF1bHRlZCBmcm9tIHRoZSBydW5uaW5nXG4gKiBwcm9jZXNzOyB0ZXN0cyBpbmplY3Qgc3ludGhldGljIHZhbHVlcyB0byBleGVyY2lzZSB0YXJnZXRzIHRoZSB0ZXN0XG4gKiBob3N0IGRvZXNuJ3QgYWN0dWFsbHkgcnVuIG9uIChVbml2ZXJzYWwtbGF1bmNoIGNhc2UsIG11c2wsIGV0Yy4pLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElTZGtUYXJnZXRIb3N0IHtcblx0cmVhZG9ubHkgcGxhdGZvcm06IE5vZGVKUy5QbGF0Zm9ybTtcblx0cmVhZG9ubHkgYXJjaDogc3RyaW5nO1xuXHRyZWFkb25seSBsaWJjOiBMaWJjRmFtaWx5IHwgdW5kZWZpbmVkO1xufVxuXG5jb25zdCBTVVBQT1JURURfUExBVEZPUk1TID0gbmV3IFNldDxOb2RlSlMuUGxhdGZvcm0+KFsnbGludXgnLCAnZGFyd2luJywgJ3dpbjMyJ10pO1xuY29uc3QgU1VQUE9SVEVEX0FSQ0hFUyA9IG5ldyBTZXQ8c3RyaW5nPihbJ3g2NCcsICdhcm02NCddKTtcblxuLyoqXG4gKiBSZXNvbHZlcyB0aGUgYnVpbGQncyBgc2RrVGFyZ2V0YCBzdWZmaXggZm9yIHRoZSBnaXZlbiBob3N0LiBEZWZhdWx0c1xuICogdG8gdGhlIGN1cnJlbnQgTm9kZSBwcm9jZXNzIFx1MjAxNCBwcm9kdWN0aW9uIGNhbGxlcnMgb21pdCBgaG9zdGA7IHRlc3RzXG4gKiBwYXNzIGEgc3ludGhldGljIGhvc3QgdG8gY292ZXIgdGFyZ2V0cyB0aGUgdGVzdCBtYWNoaW5lIGNhbid0IHJlYWNoXG4gKiAoVW5pdmVyc2FsIGxhdW5jaGVzIGZyb20gYSBzaW5nbGUtYXJjaCBob3N0LCBtdXNsIExpbnV4IG9uIG1hY09TIENJLFxuICogZXRjLikuXG4gKlxuICogICAtIGNsYXVkZSBvbiBnbGliYyBMaW51eDogYGxpbnV4LXg2NGAgLyBgbGludXgtYXJtNjRgXG4gKiAgIC0gY2xhdWRlIG9uIG11c2wgTGludXg6ICBgbGludXgteDY0LW11c2xgIC8gYGxpbnV4LWFybTY0LW11c2xgXG4gKiAgIC0gY29kZXggTGludXggKGFueSBsaWJjKTogYGxpbnV4LXg2NGAgLyBgbGludXgtYXJtNjRgXG4gKiAgIC0gZXZlcnl3aGVyZSBlbHNlOiAgICAgICBgPHBsYXRmb3JtPi08YXJjaD5gXG4gKlxuICogUmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuIG5vIFNESyBhcHBsaWVzIChgYXJtaGZgLCB3ZWIsIGV0Yy4pOyB0aGVcbiAqIGRvd25sb2FkZXIgdHJlYXRzIHRoYXQgdGhlIHNhbWUgYXMgXCJubyBwcm9kdWN0IGNvbmZpZ1wiIGFuZCBuZXZlclxuICogcmVnaXN0ZXJzIHRoZSBwcm92aWRlci5cbiAqXG4gKiBNaXJyb3Igb2YgdGhlIGJ1aWxkIHBpcGVsaW5lJ3MgYGdldFNka1RhcmdldEZvckJ1aWxkYCAoaW5cbiAqIGBidWlsZC9hZ2VudC1zZGsvY29tbW9uLnRzYCkgdHJhbnNsYXRlZCBmcm9tIGJ1aWxkLXRpbWVcbiAqIGB2c2NvZGVQbGF0Zm9ybWAgdG8gcnVudGltZSBgcHJvY2Vzcy5wbGF0Zm9ybWAgKyBsaWJjIGRldGVjdGlvbi5cbiAqIEtlZXAgdGhlIHR3byBpbiBzeW5jIHdoZW4gYWRkaW5nIG5ldyB0YXJnZXQgU0tVcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVTZGtUYXJnZXQoXG5cdHBrZzogUGljazxJQWdlbnRTZGtQYWNrYWdlLCAnaGFzU2VwYXJhdGVNdXNsTGludXhQYWNrYWdlJz4sXG5cdGhvc3Q6IElTZGtUYXJnZXRIb3N0ID0geyBwbGF0Zm9ybTogcHJvY2Vzcy5wbGF0Zm9ybSwgYXJjaDogcHJvY2Vzcy5hcmNoLCBsaWJjOiBkZXRlY3RMaWJjU3luYygpIH0sXG4pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAoIVNVUFBPUlRFRF9QTEFURk9STVMuaGFzKGhvc3QucGxhdGZvcm0pIHx8ICFTVVBQT1JURURfQVJDSEVTLmhhcyhob3N0LmFyY2gpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRpZiAoaG9zdC5wbGF0Zm9ybSA9PT0gJ2xpbnV4JyAmJiBwa2cuaGFzU2VwYXJhdGVNdXNsTGludXhQYWNrYWdlICYmIGhvc3QubGliYyA9PT0gJ211c2wnKSB7XG5cdFx0cmV0dXJuIGBsaW51eC0ke2hvc3QuYXJjaH0tbXVzbGA7XG5cdH1cblx0cmV0dXJuIGAke2hvc3QucGxhdGZvcm19LSR7aG9zdC5hcmNofWA7XG59XG5cbi8vICNlbmRyZWdpb25cblxuLy8gI3JlZ2lvbiBTZXJ2aWNlIGRlY29yYXRvclxuXG5leHBvcnQgY29uc3QgSUFnZW50U2RrRG93bmxvYWRlciA9IGNyZWF0ZURlY29yYXRvcjxJQWdlbnRTZGtEb3dubG9hZGVyPignYWdlbnRTZGtEb3dubG9hZGVyJyk7XG5cbi8qKiBMaWZlY3ljbGUgcGhhc2Ugb2YgYSBzaW5nbGUgU0RLIGRvd25sb2FkIChkb3dubG9hZGVyLWludGVybmFsKS4gKi9cbmV4cG9ydCB0eXBlIEFnZW50U2RrRG93bmxvYWRQaGFzZSA9ICdzdGFydGVkJyB8ICdwcm9ncmVzcycgfCAnY29tcGxldGVkJyB8ICdmYWlsZWQnO1xuXG4vKipcbiAqIEEgcHJvY2Vzcy1nbG9iYWwgZG93bmxvYWQtcHJvZ3Jlc3Mgc2FtcGxlIGZpcmVkIG9uXG4gKiB7QGxpbmsgSUFnZW50U2RrRG93bmxvYWRlci5vbkRpZERvd25sb2FkUHJvZ3Jlc3N9LiBUaGUgZG93bmxvYWRlciBvd25zIHRoZVxuICogbGlmZWN5Y2xlOiBvbmUgYHN0YXJ0ZWRgLCB0aHJvdHRsZWQgYHByb2dyZXNzYCBmcmFtZXMsIHRoZW4gZXhhY3RseSBvbmVcbiAqIHRlcm1pbmFsIGBjb21wbGV0ZWRgIC8gYGZhaWxlZGAgXHUyMDE0IGFsbCBzaGFyaW5nIGEgYGRvd25sb2FkSWRgLiBDb25jdXJyZW50XG4gKiBgbG9hZFNka1Jvb3RgIGNhbGxlcnMgZm9yIHRoZSBzYW1lIHRhcmJhbGwgYXJlIGRlZHVwZWQsIHNvIHRoZXkgb2JzZXJ2ZSBvbmVcbiAqIHNoYXJlZCBkb3dubG9hZCAob25lIGBkb3dubG9hZElkYCkuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50U2RrRG93bmxvYWRQcm9ncmVzcyB7XG5cdC8qKiBTdGFibGUgaWQgZm9yIG9uZSBkb3dubG9hZDsgY29hbGVzY2VzIGZyYW1lcyBhbmQgZGlzdGluZ3Vpc2hlcyBjb25jdXJyZW50IGZldGNoZXMuICovXG5cdHJlYWRvbmx5IGRvd25sb2FkSWQ6IHN0cmluZztcblx0LyoqIFBhY2thZ2UgaWQsIGUuZy4gYCdjbGF1ZGUnYCAvIGAnY29kZXgnYC4gKi9cblx0cmVhZG9ubHkgcGFja2FnZUlkOiBzdHJpbmc7XG5cdC8qKiBCcmFuZCBkaXNwbGF5IG5hbWUsIGUuZy4gYCdDbGF1ZGUnYC4gKi9cblx0cmVhZG9ubHkgZGlzcGxheU5hbWU6IHN0cmluZztcblx0LyoqIExpZmVjeWNsZSBwaGFzZSBvZiB0aGlzIGZyYW1lLiAqL1xuXHRyZWFkb25seSBwaGFzZTogQWdlbnRTZGtEb3dubG9hZFBoYXNlO1xuXHQvKiogQnl0ZXMgd3JpdHRlbiBzbyBmYXIuIE1vbm90b25pY2FsbHkgbm9uLWRlY3JlYXNpbmcgd2l0aGluIGEgYGRvd25sb2FkSWRgLiAqL1xuXHRyZWFkb25seSByZWNlaXZlZEJ5dGVzOiBudW1iZXI7XG5cdC8qKiBUb3RhbCBieXRlcyBmcm9tIGBDb250ZW50LUxlbmd0aGAsIG9yIGB1bmRlZmluZWRgIHdoZW4gdW5rbm93biAoaW5kZXRlcm1pbmF0ZSkuICovXG5cdHJlYWRvbmx5IHRvdGFsQnl0ZXM6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0LyoqIFdoZXRoZXIgYSB1c2VyLWluaXRpYXRlZCBmbG93IGV4cGxpY2l0bHkgcmVxdWVzdGVkIHRoYXQgdGhpcyBkb3dubG9hZCBiZSBzdXJmYWNlZC4gKi9cblx0cmVhZG9ubHkgZXhwbGljaXRseVJlcXVlc3RlZDogYm9vbGVhbjtcblx0LyoqIFNob3J0LCBub24tbG9jYWxpemVkIGZhaWx1cmUgcmVhc29uOyBwcmVzZW50IG9ubHkgd2hlbiBgcGhhc2U6ICdmYWlsZWQnYC4gKi9cblx0cmVhZG9ubHkgZXJyb3I/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50U2RrRG93bmxvYWRlciB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogRmlyZXMgd2hpbGUgYSB0YXJiYWxsIGlzIGJlaW5nIGZldGNoZWQgKGNvbGQgY2FjaGUgb25seSk6IG9uZSBgc3RhcnRlZGAsXG5cdCAqIHRocm90dGxlZCBgcHJvZ3Jlc3NgIHNhbXBsZXMsIHRoZW4gb25lIHRlcm1pbmFsIGBjb21wbGV0ZWRgIC8gYGZhaWxlZGAuXG5cdCAqIE5ldmVyIGZpcmVzIGZvciBkZXYtb3ZlcnJpZGUgb3IgY2FjaGUtaGl0IHJlc29sdXRpb25zIChubyBieXRlcyBtb3ZlKS5cblx0ICogUHJvY2Vzcy1nbG9iYWwgc28gYSBzaW5nbGUgc3Vic2NyaWJlciAodGhlIHByb3RvY29sIHNlcnZlcikgY2FuIGZvcndhcmRcblx0ICogcHJvZ3Jlc3MgdG8gY2xpZW50cyByZWdhcmRsZXNzIG9mIHdoaWNoIHNlc3Npb24gdHJpZ2dlcmVkIHRoZSBmZXRjaC5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkRG93bmxvYWRQcm9ncmVzczogRXZlbnQ8SUFnZW50U2RrRG93bmxvYWRQcm9ncmVzcz47XG5cblx0LyoqXG5cdCAqIEtlZXAgZG93bmxvYWQgcHJvZ3Jlc3MgdmlzaWJsZSBmb3IgYSB1c2VyLWluaXRpYXRlZCBmbG93IHRoYXQgZG9lcyBub3Rcblx0ICogaGF2ZSBhIHNlc3Npb24gcHJvZ3Jlc3MgdG9rZW4sIHN1Y2ggYXMgQ2hhdEdQVCBzaWduLWluLiBEaXNwb3NlIHRoZVxuXHQgKiByZXR1cm5lZCBoYW5kbGUgd2hlbiB0aGUgZmxvdyBmaW5pc2hlcy5cblx0ICovXG5cdGFjcXVpcmVEb3dubG9hZFByb2dyZXNzSW50ZXJlc3QocGtnOiBJQWdlbnRTZGtQYWNrYWdlKTogSURpc3Bvc2FibGU7XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGFic29sdXRlIHBhdGggb2YgdGhlIFNESyByb290IGRpcmVjdG9yeSBcdTIwMTQgdGhlIGRpcmVjdG9yeSB0aGF0XG5cdCAqIGNvbnRhaW5zIHRoZSBwYWNrYWdlJ3MgYG5vZGVfbW9kdWxlcy9gIHN1YnRyZWUuIENhbGxlcnMgcmVzb2x2ZSB0aGVcblx0ICogcGFja2FnZS1zcGVjaWZpYyBlbnRyeXBvaW50IGZyb20gdGhlcmUgdGhlbXNlbHZlcy5cblx0ICpcblx0ICogUmVzb2x1dGlvbiBvcmRlcjpcblx0ICogICAxLiBkZXYtb3ZlcnJpZGUgZW52IHZhciAocmV0dXJuZWQgdW5jaGFuZ2VkKVxuXHQgKiAgIDIuIG9uLWRpc2sgY2FjaGUgaGl0IChgLmNvbXBsZXRlYCBzZW50aW5lbCBwcmVzZW50KVxuXHQgKiAgIDMuIGRvd25sb2FkIGZyb20gYHByb2R1Y3QuYWdlbnRTZGtzPy5bcGtnLmlkXWAgd2l0aFxuXHQgKiAgICAgIGB7c2RrVGFyZ2V0fWAgc3Vic3RpdHV0ZWQgaW50byB0aGUgdXJsVGVtcGxhdGVcblx0ICpcblx0ICogUmVwZWF0ZWQgZmFpbHVyZXMgYXJlIGxhdGNoZWQgZm9yIHtAbGluayBMT0FEX0ZBSUxVUkVfTkVHQVRJVkVfQ0FDSEVfTVN9XG5cdCAqIHNvIGEgbWlzY29uZmlndXJlZCBDRE4gZG9lc24ndCBnZXQgaGFtbWVyZWQgb24gZXZlcnkgU0RLIG1ldGhvZCBjYWxsLlxuXHQgKi9cblx0bG9hZFNka1Jvb3QocGtnOiBJQWdlbnRTZGtQYWNrYWdlLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZz47XG5cblx0LyoqXG5cdCAqIENoZWFwLCBzeW5jaHJvbm91cyBnYXRlIHVzZWQgYXQgc3RhcnR1cCB0byBkZWNpZGUgd2hldGhlciB0byByZWdpc3RlclxuXHQgKiB0aGUgY29ycmVzcG9uZGluZyBhZ2VudCBwcm92aWRlci4gVHJ1ZSBpZmYgdGhlIGRldiBvdmVycmlkZSBpcyBzZXQsIE9SXG5cdCAqIChgcHJvZHVjdC5hZ2VudFNka3M/Lltwa2cuaWRdYCBpcyBwb3B1bGF0ZWQgQU5EIGBwa2cuY3VycmVudFNka1RhcmdldCgpYFxuXHQgKiByZXNvbHZlcyBcdTIwMTQgaS5lLiBhbiBTREsgZXhpc3RzIGZvciB0aGlzIGhvc3QpLiBEb2VzIE5PVCB0cmlnZ2VyIGFcblx0ICogZG93bmxvYWQuXG5cdCAqL1xuXHRpc0F2YWlsYWJsZShwa2c6IElBZ2VudFNka1BhY2thZ2UpOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBUcnVlIGlmZiB7QGxpbmsgbG9hZFNka1Jvb3R9IHdvdWxkIHJlc29sdmUgV0lUSE9VVCBhIG5ldHdvcmsgZG93bmxvYWQgXHUyMDE0XG5cdCAqIHRoZSBkZXYgb3ZlcnJpZGUgaXMgc2V0LCBvciBhIGNvbXBsZXRlZCBjYWNoZSBmb3IgdGhlIGNvbmZpZ3VyZWQgdmVyc2lvblxuXHQgKiBhbHJlYWR5IGV4aXN0cyBvbiBkaXNrLiBGYWxzZSB3aGVuIHByb2R1Y3QgY29uZmlnIGlzIHByZXNlbnQgYnV0IHRoZVxuXHQgKiBjYWNoZSBpcyBjb2xkIChhIGZldGNoIHdvdWxkIGJlIHJlcXVpcmVkKSwgYW5kIGZhbHNlIHdoZW4gbmVpdGhlciBhblxuXHQgKiBvdmVycmlkZSBub3IgcHJvZHVjdCBjb25maWcgaXMgY29uZmlndXJlZC5cblx0ICpcblx0ICogUGVyZm9ybXMgYXQgbW9zdCBhIHNpbmdsZSBzZW50aW5lbCBgZXhpc3RzYCBjaGVjayBhbmQgbmV2ZXIgZG93bmxvYWRzLlxuXHQgKiBFYWdlciAvIGJhY2tncm91bmQgY2FsbGVycyAoZS5nLiBhIHByb3ZpZGVyIGxpc3RpbmcgaXRzIHNlc3Npb25zIGF0XG5cdCAqIHN0YXJ0dXApIHVzZSB0aGlzIHRvIGF2b2lkIGtpY2tpbmcgb2ZmIGEgbXVsdGktc2Vjb25kIGNvbGQgZG93bmxvYWRcblx0ICogYmVmb3JlIHRoZSB1c2VyIGhhcyBhc2tlZCBmb3IgYW55dGhpbmcuXG5cdCAqL1xuXHRpc1Nka1Jlc29sdmFibGVXaXRob3V0RG93bmxvYWQocGtnOiBJQWdlbnRTZGtQYWNrYWdlKTogUHJvbWlzZTxib29sZWFuPjtcbn1cblxuLy8gI2VuZHJlZ2lvblxuXG4vLyAjcmVnaW9uIEltcGxlbWVudGF0aW9uXG5cbi8qKiBIb3cgbG9uZyBhIGBsb2FkU2RrUm9vdGAgZmFpbHVyZSBsYXRjaGVzIGJlZm9yZSB3ZSB0cnkgYWdhaW4uICovXG5jb25zdCBMT0FEX0ZBSUxVUkVfTkVHQVRJVkVfQ0FDSEVfTVMgPSAzMF8wMDA7XG5cbi8qKlxuICogTWluaW11bSBnYXAgYmV0d2VlbiBkb3dubG9hZC1wcm9ncmVzcyBzYW1wbGVzLiBBIDcwLTk1TUIgdGFyYmFsbCBvdmVyIGEgZmFzdFxuICogbGluayBwcm9kdWNlcyB0aG91c2FuZHMgb2YgY2h1bmtzOyB3aXRob3V0IHRocm90dGxpbmcgd2UnZCBmbG9vZCB0aGUgcHJvZ3Jlc3NcbiAqIGNoYW5uZWwuIH4yNTBtcyBrZWVwcyB0aGUgcGVyY2VudGFnZSB2aXNpYmx5IG1vdmluZyB3aXRob3V0IHNwYW1taW5nLlxuICovXG5jb25zdCBQUk9HUkVTU19FTUlUX1RIUk9UVExFX01TID0gMjUwO1xuXG4vKipcbiAqIFBhcnNlcyBhIGBDb250ZW50LUxlbmd0aGAgaGVhZGVyIGludG8gYSBwb3NpdGl2ZSBpbnRlZ2VyIGJ5dGUgY291bnQsIG9yXG4gKiBgdW5kZWZpbmVkYCB3aGVuIHRoZSBoZWFkZXIgaXMgYWJzZW50LCBhbiBhcnJheSwgb3Igbm90IGEgY2xlYW4gaW50ZWdlci5cbiAqL1xuZnVuY3Rpb24gcGFyc2VDb250ZW50TGVuZ3RoKGhlYWRlcjogc3RyaW5nIHwgc3RyaW5nW10gfCB1bmRlZmluZWQpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRpZiAodHlwZW9mIGhlYWRlciAhPT0gJ3N0cmluZycgfHwgIS9eXFxkKyQvLnRlc3QoaGVhZGVyKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgcGFyc2VkID0gcGFyc2VJbnQoaGVhZGVyLCAxMCk7XG5cdHJldHVybiBwYXJzZWQgPiAwID8gcGFyc2VkIDogdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgY2xhc3MgQWdlbnRTZGtEb3dubG9hZGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBZ2VudFNka0Rvd25sb2FkZXIge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZERvd25sb2FkUHJvZ3Jlc3MgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQWdlbnRTZGtEb3dubG9hZFByb2dyZXNzPigpKTtcblx0cmVhZG9ubHkgb25EaWREb3dubG9hZFByb2dyZXNzOiBFdmVudDxJQWdlbnRTZGtEb3dubG9hZFByb2dyZXNzPiA9IHRoaXMuX29uRGlkRG93bmxvYWRQcm9ncmVzcy5ldmVudDtcblxuXHQvKipcblx0ICogSW4tZmxpZ2h0IGRvd25sb2FkcyBrZXllZCBieSB0aGUgZGVzdGluYXRpb24gYGNhY2hlRGlyYCAod2hpY2hcblx0ICogYWxyZWFkeSBlbmNvZGVzIGA8cGtnPi88c2RrVmVyc2lvbj4vPHNka1RhcmdldD5gKS4gQ29uY3VycmVudFxuXHQgKiBgbG9hZFNka1Jvb3RgIGNhbGxzIGluIHRoZSBzYW1lIHByb2Nlc3Mgc2hhcmUgdGhlIHNhbWUgcHJvbWlzZSBzb1xuXHQgKiB3ZSBuZXZlciBkb3dubG9hZCB0aGUgc2FtZSB0YXJiYWxsIHR3aWNlLiBVbml2ZXJzYWwgbGF1bmNoZXMgdGhhdFxuXHQgKiByZXNvbHZlIHRvIGRpZmZlcmVudCB0YXJnZXRzIGdldCBkaXN0aW5jdCBlbnRyaWVzIGJlY2F1c2UgdGhlaXJcblx0ICogY2FjaGVEaXJzIGRpZmZlci5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdEb3dubG9hZHMgPSBuZXcgTWFwPHN0cmluZywgUHJvbWlzZTxzdHJpbmc+PigpO1xuXHQvKiogUmVmY291bnRlZCB1c2VyLWluaXRpYXRlZCBwcm9ncmVzcyBpbnRlcmVzdCwga2V5ZWQgYnkgcGFja2FnZSBpZC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZXhwbGljaXRQcm9ncmVzc0ludGVyZXN0ID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblxuXHQvKipcblx0ICogTmVnYXRpdmUgY2FjaGU6IG1vc3QgcmVjZW50IGZhaWx1cmUgcGVyIHBhY2thZ2UgaWQsIHdpdGggYW4gZXhwaXJ5LlxuXHQgKiBXaGlsZSB3aXRoaW4gdGhlIHdpbmRvdywgYGxvYWRTZGtSb290YCByZS10aHJvd3MgdGhlIGNhY2hlZCBlcnJvclxuXHQgKiBpbW1lZGlhdGVseSBpbnN0ZWFkIG9mIHJlLWF0dGVtcHRpbmcgdGhlIGRvd25sb2FkLiBXaXRob3V0IHRoaXMsIGFcblx0ICogYnJva2VuIENETiBjYXVzZXMgZXZlcnkgU0RLIG1ldGhvZCBjYWxsIChwb2xsLWRyaXZlbiBVSXMgaGl0IHRoaXNcblx0ICogaGFyZCkgdG8gZmlyZSBhIGZyZXNoIHJlcXVlc3QuXG5cdCAqXG5cdCAqIEtleWVkIGJ5IGBwa2cuaWRgIChub3QgdGhlIGZpbmVyIGNhY2hlRGlyKTogQ0ROIGZhaWx1cmVzIGFyZVxuXHQgKiBlZmZlY3RpdmVseSBnbG9iYWwgcGVyIFNESyAoRE5TLCBwcm94eSBhdXRoLCA1eHgpIGFuZCBwZXItdGFyZ2V0XG5cdCAqIGxhdGNoaW5nIHdvdWxkbid0IHByb3RlY3QgYWdhaW5zdCB0aGUgYWN0dWFsIGZhaWx1cmUgbW9kZXMgXHUyMDE0IHRoZVxuXHQgKiBicm9hZGVyIGxhdGNoIGlzIGludGVudGlvbmFsLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZmFpbHVyZUxhdGNoID0gbmV3IE1hcDxzdHJpbmcsIHsgZXJyb3I6IEVycm9yOyBleHBpcmVzQXQ6IG51bWJlciB9PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50U2VydmljZTogSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElSZXF1ZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZXF1ZXN0U2VydmljZTogSVJlcXVlc3RTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRpc0F2YWlsYWJsZShwa2c6IElBZ2VudFNka1BhY2thZ2UpOiBib29sZWFuIHtcblx0XHRpZiAocHJvY2Vzcy5lbnZbcGtnLmRldk92ZXJyaWRlRW52VmFyXSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiAhIXRoaXMuX3Byb2R1Y3RTZXJ2aWNlLmFnZW50U2Rrcz8uW3BrZy5pZF0gJiYgcmVzb2x2ZVNka1RhcmdldChwa2cpICE9PSB1bmRlZmluZWQ7XG5cdH1cblxuXHRhY3F1aXJlRG93bmxvYWRQcm9ncmVzc0ludGVyZXN0KHBrZzogSUFnZW50U2RrUGFja2FnZSk6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLl9leHBsaWNpdFByb2dyZXNzSW50ZXJlc3Quc2V0KHBrZy5pZCwgKHRoaXMuX2V4cGxpY2l0UHJvZ3Jlc3NJbnRlcmVzdC5nZXQocGtnLmlkKSA/PyAwKSArIDEpO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0Y29uc3QgY291bnQgPSB0aGlzLl9leHBsaWNpdFByb2dyZXNzSW50ZXJlc3QuZ2V0KHBrZy5pZCkgPz8gMDtcblx0XHRcdGlmIChjb3VudCA8PSAxKSB7XG5cdFx0XHRcdHRoaXMuX2V4cGxpY2l0UHJvZ3Jlc3NJbnRlcmVzdC5kZWxldGUocGtnLmlkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2V4cGxpY2l0UHJvZ3Jlc3NJbnRlcmVzdC5zZXQocGtnLmlkLCBjb3VudCAtIDEpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgaXNTZGtSZXNvbHZhYmxlV2l0aG91dERvd25sb2FkKHBrZzogSUFnZW50U2RrUGFja2FnZSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmIChwcm9jZXNzLmVudltwa2cuZGV2T3ZlcnJpZGVFbnZWYXJdKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3QgY29uZmlnID0gdGhpcy5fcHJvZHVjdFNlcnZpY2UuYWdlbnRTZGtzPy5bcGtnLmlkXTtcblx0XHRpZiAoIWNvbmZpZykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBzZGtUYXJnZXQgPSByZXNvbHZlU2RrVGFyZ2V0KHBrZyk7XG5cdFx0aWYgKCFzZGtUYXJnZXQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3Qgc2VudGluZWwgPSBVUkkuam9pblBhdGgoVVJJLmZpbGUodGhpcy5fY2FjaGVEaXIocGtnLmlkLCBjb25maWcudmVyc2lvbiwgc2RrVGFyZ2V0KSksICcuY29tcGxldGUnKTtcblx0XHRyZXR1cm4gdGhpcy5fZmlsZVNlcnZpY2UuZXhpc3RzKHNlbnRpbmVsKTtcblx0fVxuXG5cdGFzeW5jIGxvYWRTZGtSb290KHBrZzogSUFnZW50U2RrUGFja2FnZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHQvLyAxLiBEZXYgb3ZlcnJpZGUuXG5cdFx0Y29uc3Qgb3ZlcnJpZGUgPSBwcm9jZXNzLmVudltwa2cuZGV2T3ZlcnJpZGVFbnZWYXJdO1xuXHRcdGlmIChvdmVycmlkZSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQWdlbnRTZGtEb3dubG9hZGVyXSAke3BrZy5pZH06IHVzaW5nIGRldiBvdmVycmlkZSBhdCAke292ZXJyaWRlfWApO1xuXHRcdFx0cmV0dXJuIG92ZXJyaWRlO1xuXHRcdH1cblxuXHRcdC8vIDIuIE5lZ2F0aXZlIGNhY2hlOiBhIHJlY2VudCBmYWlsdXJlIHNob3J0LWNpcmN1aXRzIHdpdGhvdXQgSS9PLlxuXHRcdGNvbnN0IGxhdGNoZWQgPSB0aGlzLl9mYWlsdXJlTGF0Y2guZ2V0KHBrZy5pZCk7XG5cdFx0aWYgKGxhdGNoZWQgJiYgbGF0Y2hlZC5leHBpcmVzQXQgPiBEYXRlLm5vdygpKSB7XG5cdFx0XHR0aHJvdyBsYXRjaGVkLmVycm9yO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByb290ID0gYXdhaXQgdGhpcy5fcmVzb2x2ZU9yRG93bmxvYWQocGtnLCB0b2tlbik7XG5cdFx0XHR0aGlzLl9mYWlsdXJlTGF0Y2guZGVsZXRlKHBrZy5pZCk7XG5cdFx0XHRyZXR1cm4gcm9vdDtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHQvLyBEb24ndCBsYXRjaCBjYW5jZWxsYXRpb25zIFx1MjAxNCB1c2VyIGludGVudCwgbm90IGEgcmVhbCBmYWlsdXJlLlxuXHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBlcnJvciA9IGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyIDogbmV3IEVycm9yKFN0cmluZyhlcnIpKTtcblx0XHRcdHRoaXMuX2ZhaWx1cmVMYXRjaC5zZXQocGtnLmlkLCB7XG5cdFx0XHRcdGVycm9yLFxuXHRcdFx0XHRleHBpcmVzQXQ6IERhdGUubm93KCkgKyBMT0FEX0ZBSUxVUkVfTkVHQVRJVkVfQ0FDSEVfTVMsXG5cdFx0XHR9KTtcblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVPckRvd25sb2FkKHBrZzogSUFnZW50U2RrUGFja2FnZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBjb25maWcgPSB0aGlzLl9wcm9kdWN0U2VydmljZS5hZ2VudFNka3M/Lltwa2cuaWRdO1xuXHRcdGlmICghY29uZmlnKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXG5cdFx0XHRcdGBDYW5ub3QgbG9hZCAke3BrZy5pZH0gU0RLOiBubyBcXGBwcm9kdWN0LmFnZW50U2Rrcy4ke3BrZy5pZH1cXGAgY29uZmlndXJlZCBhbmQgYCArXG5cdFx0XHRcdGBubyAke3BrZy5kZXZPdmVycmlkZUVudlZhcn0gZGV2IG92ZXJyaWRlIHNldC5gLFxuXHRcdFx0KTtcblx0XHR9XG5cdFx0Y29uc3Qgc2RrVGFyZ2V0ID0gcmVzb2x2ZVNka1RhcmdldChwa2cpO1xuXHRcdGlmICghc2RrVGFyZ2V0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXG5cdFx0XHRcdGBDYW5ub3QgbG9hZCAke3BrZy5pZH0gU0RLOiBubyBTREsgdGFyZ2V0IGZvciB0aGlzIGhvc3QgYCArXG5cdFx0XHRcdGAoJHtwcm9jZXNzLnBsYXRmb3JtfS8ke3Byb2Nlc3MuYXJjaH0pLiBgICtcblx0XHRcdFx0YFNldCAke3BrZy5kZXZPdmVycmlkZUVudlZhcn0gdG8gYSBsb2NhbCBTREsgcm9vdCB0byBieXBhc3MuYCxcblx0XHRcdCk7XG5cdFx0fVxuXHRcdGNvbnN0IHVybCA9IGZvcm1hdDIoY29uZmlnLnVybFRlbXBsYXRlLCB7IHNka1RhcmdldCB9KTtcblx0XHQvLyBgZm9ybWF0MmAgbGVhdmVzIHVua25vd24gYHtwbGFjZWhvbGRlcn1gIHNlZ21lbnRzIHVudG91Y2hlZDsgY2F0Y2hcblx0XHQvLyB2c2NvZGUtZGlzdHJvIHR5cG9zIGxpa2UgYHtzZGtUYXJldH1gIGhlcmUgaW5zdGVhZCBvZiBsZXR0aW5nIHRoZVxuXHRcdC8vIENETiByZXR1cm4gYSA0MDQgYWdhaW5zdCBhIGNsZWFybHktYnJva2VuIFVSTC5cblx0XHRjb25zdCBzdHJheSA9IC97W159XSt9Ly5leGVjKHVybCk7XG5cdFx0aWYgKHN0cmF5KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXG5cdFx0XHRcdGBDYW5ub3QgbG9hZCAke3BrZy5pZH0gU0RLOiBcXGBwcm9kdWN0LmFnZW50U2Rrcy4ke3BrZy5pZH0udXJsVGVtcGxhdGVcXGAgYCArXG5cdFx0XHRcdGBjb250YWlucyBhbiB1bmtub3duIHBsYWNlaG9sZGVyICR7c3RyYXlbMF19IFx1MjAxNCBvbmx5IHtzZGtUYXJnZXR9IGlzIHN1YnN0aXR1dGVkLiBgICtcblx0XHRcdFx0YFRlbXBsYXRlOiAke2NvbmZpZy51cmxUZW1wbGF0ZX1gLFxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRjb25zdCBjYWNoZURpciA9IHRoaXMuX2NhY2hlRGlyKHBrZy5pZCwgY29uZmlnLnZlcnNpb24sIHNka1RhcmdldCk7XG5cdFx0Y29uc3Qgc2VudGluZWwgPSBVUkkuam9pblBhdGgoVVJJLmZpbGUoY2FjaGVEaXIpLCAnLmNvbXBsZXRlJyk7XG5cblx0XHQvLyBgLmNvbXBsZXRlYCdzIG1lcmUgcHJlc2VuY2UgaXMgdGhlIGludGVncml0eSBzaWduYWwgXHUyMDE0IGV4dHJhY3RzXG5cdFx0Ly8gdGhhdCBjcmFzaGVkIG1pZC13YXkgbmV2ZXIgd3JpdGUgaXQuIFNlZSBgX2Rvd25sb2FkYCBmb3Igd2h5XG5cdFx0Ly8gdGhlIHNlbnRpbmVsIGlzIHdyaXR0ZW4gaW5zaWRlIHRoZSB0bXAgZGlyIGJlZm9yZSB0aGUgcmVuYW1lLlxuXHRcdGlmIChhd2FpdCB0aGlzLl9maWxlU2VydmljZS5leGlzdHMoc2VudGluZWwpKSB7XG5cdFx0XHRyZXR1cm4gY2FjaGVEaXI7XG5cdFx0fVxuXG5cdFx0Ly8gRG93bmxvYWQgKGRlZHVwZWQgYWNyb3NzIGNvbmN1cnJlbnQgY2FsbGVycyBpbiB0aGUgc2FtZSBwcm9jZXNzKS5cblx0XHQvLyBjYWNoZURpciBpcyBhbHJlYWR5IHVuaXF1ZSBwZXIgKHBrZywgdmVyc2lvbiwgc2RrVGFyZ2V0KSBcdTIwMTQgd2l0aGluXG5cdFx0Ly8gYSBzaW5nbGUgZG93bmxvYWRlciBpbnN0YW5jZSB1c2VyRGF0YVBhdGggaXMgZml4ZWQsIHNvIGl0IHNlcnZlc1xuXHRcdC8vIGFzIHRoZSBkZWR1cCBrZXkgd2l0aG91dCBhbiBleHRyYSBzdHJpbmcgYWxsb2NhdGlvbi5cblx0XHRsZXQgcGVuZGluZyA9IHRoaXMuX3BlbmRpbmdEb3dubG9hZHMuZ2V0KGNhY2hlRGlyKTtcblx0XHRpZiAoIXBlbmRpbmcpIHtcblx0XHRcdHBlbmRpbmcgPSB0aGlzLl9kb3dubG9hZChwa2csIHVybCwgY2FjaGVEaXIsIHNlbnRpbmVsLCB0b2tlbikuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdEb3dubG9hZHMuZGVsZXRlKGNhY2hlRGlyKTtcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fcGVuZGluZ0Rvd25sb2Fkcy5zZXQoY2FjaGVEaXIsIHBlbmRpbmcpO1xuXHRcdH1cblx0XHRyZXR1cm4gcGVuZGluZztcblx0fVxuXG5cdHByaXZhdGUgX2NhY2hlRGlyKHBhY2thZ2VJZDogc3RyaW5nLCBzZGtWZXJzaW9uOiBzdHJpbmcsIHNka1RhcmdldDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHQvLyBgc2RrVGFyZ2V0YCBpcyBpbiB0aGUgcGF0aCBzbyBtYWNPUyBVbml2ZXJzYWwgYnVpbGRzIGtlZXAgdHdvXG5cdFx0Ly8gaW5kZXBlbmRlbnQgY2FjaGVzIFx1MjAxNCBvbmUgcGVyIHJlc29sdmVkIHRhcmdldCBcdTIwMTQgaW5zdGVhZCBvZlxuXHRcdC8vIHRocmFzaGluZyBhIHNpbmdsZSBzaGFyZWQgb25lIGFzIGxhdW5jaGVzIGFsdGVybmF0ZS5cblx0XHRyZXR1cm4gcGF0aC5qb2luKFxuXHRcdFx0dGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhUGF0aCxcblx0XHRcdCdhZ2VudC1ob3N0Jyxcblx0XHRcdCdzZGstY2FjaGUnLFxuXHRcdFx0cGFja2FnZUlkLFxuXHRcdFx0c2RrVmVyc2lvbixcblx0XHRcdHNka1RhcmdldCxcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZG93bmxvYWQoXG5cdFx0cGtnOiBJQWdlbnRTZGtQYWNrYWdlLFxuXHRcdHVybDogc3RyaW5nLFxuXHRcdGNhY2hlRGlyOiBzdHJpbmcsXG5cdFx0c2VudGluZWw6IFVSSSxcblx0XHR0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sXG5cdCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQWdlbnRTZGtEb3dubG9hZGVyXSAke3BrZy5pZH06IGRvd25sb2FkaW5nIGZyb20gJHt1cmx9YCk7XG5cdFx0Y29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xuXHRcdGNvbnN0IHBhcmVudCA9IHBhdGguZGlybmFtZShjYWNoZURpcik7XG5cdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKFVSSS5maWxlKHBhcmVudCkpO1xuXG5cdFx0Ly8gRXh0cmFjdCB0byBhIHBlci1waWQgc2NyYXRjaCBkaXIgYWxvbmdzaWRlIHRoZSBmaW5hbCBjYWNoZSBkaXIsIHRoZW5cblx0XHQvLyByZW5hbWUgaW50byBwbGFjZS4gSWYgdHdvIHdpbmRvd3Mgb2YgdGhlIHNhbWUgaW5zdGFsbCByYWNlLCB0aGUgbG9zZXJcblx0XHQvLyBjYXRjaGVzIHRoZSBgbW92ZWAncyBgRklMRV9NT1ZFX0NPTkZMSUNUYCwgY2hlY2tzIHRoZSBleGlzdGluZ1xuXHRcdC8vIC5jb21wbGV0ZSBzZW50aW5lbCwgYW5kIHVzZXMgdGhhdCBpbnN0ZWFkIFx1MjAxNCBzZWUgdGhlIHJlbmFtZS1sb3NlclxuXHRcdC8vIHBhdGggYmVsb3cuXG5cdFx0Y29uc3QgdG1wRGlyID0gYCR7Y2FjaGVEaXJ9LnRtcC4ke3Byb2Nlc3MucGlkfWA7XG5cdFx0Y29uc3QgdG1wRGlyVXJpID0gVVJJLmZpbGUodG1wRGlyKTtcblx0XHRhd2FpdCB0aGlzLl9kZWxJZ25vcmluZ01pc3NpbmcodG1wRGlyVXJpKTtcblx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS5jcmVhdGVGb2xkZXIodG1wRGlyVXJpKTtcblxuXHRcdC8vIEZpcmUgdGhlIGRvd25sb2FkIGxpZmVjeWNsZSBvbiB0aGUgcHJvY2Vzcy1nbG9iYWwgZXZlbnQgc28gYSBzaW5nbGVcblx0XHQvLyBzdWJzY3JpYmVyICh0aGUgcHJvdG9jb2wgc2VydmVyKSBjYW4gZm9yd2FyZCBpdCB0byBjbGllbnRzLiBPbmVcblx0XHQvLyBgc3RhcnRlZGAsIHRocm90dGxlZCBgcHJvZ3Jlc3NgIGZyb20gYF9mZXRjaGAsIHRoZW4gYSB0ZXJtaW5hbCBmcmFtZS5cblx0XHRjb25zdCBkb3dubG9hZElkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0bGV0IGxhc3RSZWNlaXZlZCA9IDA7XG5cdFx0bGV0IGxhc3RUb3RhbDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2ZpcmVQcm9ncmVzcyhwa2csIGRvd25sb2FkSWQsICdzdGFydGVkJywgMCwgdW5kZWZpbmVkKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB0YXJiYWxsUGF0aCA9IHBhdGguam9pbih0bXBEaXIsICdzZGsudGd6Jyk7XG5cdFx0XHRhd2FpdCB0aGlzLl9mZXRjaCh1cmwsIHRhcmJhbGxQYXRoLCB0b2tlbiwgKHJlY2VpdmVkQnl0ZXMsIHRvdGFsQnl0ZXMpID0+IHtcblx0XHRcdFx0bGFzdFJlY2VpdmVkID0gcmVjZWl2ZWRCeXRlcztcblx0XHRcdFx0bGFzdFRvdGFsID0gdG90YWxCeXRlcztcblx0XHRcdFx0dGhpcy5fZmlyZVByb2dyZXNzKHBrZywgZG93bmxvYWRJZCwgJ3Byb2dyZXNzJywgcmVjZWl2ZWRCeXRlcywgdG90YWxCeXRlcyk7XG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHRoaXMuX2V4dHJhY3RUYXJHeih0YXJiYWxsUGF0aCwgdG1wRGlyKTtcblx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmRlbChVUkkuZmlsZSh0YXJiYWxsUGF0aCkpO1xuXG5cdFx0XHQvLyBXcml0ZSB0aGUgYC5jb21wbGV0ZWAgc2VudGluZWwgaW5zaWRlIHRoZSB0bXAgZGlyIEJFRk9SRSB0aGVcblx0XHRcdC8vIG1vdmUgc28gdGhlIG1vdmUgYXRvbWljYWxseSBwdWJsaXNoZXMgYSBkaXJlY3RvcnkgdGhhdFxuXHRcdFx0Ly8gYWxyZWFkeSBjYXJyaWVzIGl0cyBzZW50aW5lbCBcdTIwMTQgYSBjcmFzaCBiZXR3ZWVuIG1vdmUgYW5kXG5cdFx0XHQvLyBzZW50aW5lbC13cml0ZSBjYW4ndCBsZWF2ZSBhIHdlZGdlZCwgc2VudGluZWwtbGVzcyBjYWNoZURpclxuXHRcdFx0Ly8gYmVoaW5kLiBDb250ZW50IGlzIGludGVudGlvbmFsbHkgZW1wdHk6IG9ubHkgZXhpc3RlbmNlXG5cdFx0XHQvLyBtYXR0ZXJzLCBhbmQgdGhlIGNhY2hlIGRpciBwYXRoIGFscmVhZHkgZW5jb2Rlc1xuXHRcdFx0Ly8gYDxwa2c+Lzx2ZXJzaW9uPi88c2RrVGFyZ2V0PmAgZm9yIGRlYnVnZ2luZy5cblx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLndyaXRlRmlsZShcblx0XHRcdFx0VVJJLmpvaW5QYXRoKHRtcERpclVyaSwgJy5jb21wbGV0ZScpLFxuXHRcdFx0XHRWU0J1ZmZlci5mcm9tU3RyaW5nKCcnKSxcblx0XHRcdCk7XG5cblx0XHRcdC8vIEF0b21pYyBwdWJsaXNoIG9mIHRoZSBjb21wbGV0ZWQgZXh0cmFjdGlvbi5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLm1vdmUodG1wRGlyVXJpLCBVUkkuZmlsZShjYWNoZURpcikpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdGlmIChhd2FpdCB0aGlzLl9oYW5kbGVSZW5hbWVMb3NlcihlcnIsIHNlbnRpbmVsLCB0bXBEaXJVcmkpKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQWdlbnRTZGtEb3dubG9hZGVyXSAke3BrZy5pZH06IGxvc3QgcmVuYW1lIHJhY2UsIHVzaW5nIGV4aXN0aW5nIGNhY2hlYCk7XG5cdFx0XHRcdFx0dGhpcy5fZmlyZVByb2dyZXNzKHBrZywgZG93bmxvYWRJZCwgJ2NvbXBsZXRlZCcsIGxhc3RSZWNlaXZlZCwgbGFzdFRvdGFsKTtcblx0XHRcdFx0XHRyZXR1cm4gY2FjaGVEaXI7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBlbGFwc2VkID0gTWF0aC5yb3VuZCgoRGF0ZS5ub3coKSAtIHN0YXJ0KSAvIDEwMDApO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQWdlbnRTZGtEb3dubG9hZGVyXSAke3BrZy5pZH06IGRvd25sb2FkZWQgaW4gJHtlbGFwc2VkfXNgKTtcblx0XHRcdHRoaXMuX2ZpcmVQcm9ncmVzcyhwa2csIGRvd25sb2FkSWQsICdjb21wbGV0ZWQnLCBsYXN0VG90YWwgPz8gbGFzdFJlY2VpdmVkLCBsYXN0VG90YWwpO1xuXHRcdFx0cmV0dXJuIGNhY2hlRGlyO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0YXdhaXQgdGhpcy5fZGVsSWdub3JpbmdNaXNzaW5nKHRtcERpclVyaSk7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0dGhpcy5fZmlyZVByb2dyZXNzKHBrZywgZG93bmxvYWRJZCwgJ2ZhaWxlZCcsIGxhc3RSZWNlaXZlZCwgbGFzdFRvdGFsLCAnY2FuY2VsbGVkJyk7XG5cdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKTtcblx0XHRcdHRoaXMuX2ZpcmVQcm9ncmVzcyhwa2csIGRvd25sb2FkSWQsICdmYWlsZWQnLCBsYXN0UmVjZWl2ZWQsIGxhc3RUb3RhbCwgbWVzc2FnZSk7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXG5cdFx0XHRcdGBGYWlsZWQgdG8gZG93bmxvYWQgJHtwa2cuaWR9IFNESyBmcm9tICR7dXJsfSBgICtcblx0XHRcdFx0YChjYWNoZSB0YXJnZXQ6ICR7Y2FjaGVEaXJ9KS4gYCArXG5cdFx0XHRcdGBTZXQgJHtwa2cuZGV2T3ZlcnJpZGVFbnZWYXJ9IHRvIGEgbG9jYWwgU0RLIHJvb3QgdG8gYnlwYXNzLiBgICtcblx0XHRcdFx0YENhdXNlOiAke21lc3NhZ2V9YCxcblx0XHRcdCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZmlyZVByb2dyZXNzKFxuXHRcdHBrZzogSUFnZW50U2RrUGFja2FnZSxcblx0XHRkb3dubG9hZElkOiBzdHJpbmcsXG5cdFx0cGhhc2U6IEFnZW50U2RrRG93bmxvYWRQaGFzZSxcblx0XHRyZWNlaXZlZEJ5dGVzOiBudW1iZXIsXG5cdFx0dG90YWxCeXRlczogbnVtYmVyIHwgdW5kZWZpbmVkLFxuXHRcdGVycm9yPzogc3RyaW5nLFxuXHQpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZERvd25sb2FkUHJvZ3Jlc3MuZmlyZSh7XG5cdFx0XHRkb3dubG9hZElkLFxuXHRcdFx0cGFja2FnZUlkOiBwa2cuaWQsXG5cdFx0XHRkaXNwbGF5TmFtZTogcGtnLmRpc3BsYXlOYW1lLFxuXHRcdFx0cGhhc2UsXG5cdFx0XHRyZWNlaXZlZEJ5dGVzLFxuXHRcdFx0dG90YWxCeXRlcyxcblx0XHRcdGV4cGxpY2l0bHlSZXF1ZXN0ZWQ6IHRoaXMuX2V4cGxpY2l0UHJvZ3Jlc3NJbnRlcmVzdC5oYXMocGtnLmlkKSxcblx0XHRcdC4uLihlcnJvciAhPT0gdW5kZWZpbmVkID8geyBlcnJvciB9IDoge30pLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlUmVuYW1lTG9zZXIoXG5cdFx0ZXJyOiB1bmtub3duLFxuXHRcdHNlbnRpbmVsOiBVUkksXG5cdFx0dG1wRGlyVXJpOiBVUkksXG5cdCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdC8vIGBJRmlsZVNlcnZpY2UubW92ZWAgd2l0aCBkZWZhdWx0IChvdmVyd3JpdGU6IGZhbHNlKSB0aHJvd3MgYVxuXHRcdC8vIEZpbGVPcGVyYXRpb25FcnJvciB3aXRoIEZJTEVfTU9WRV9DT05GTElDVCB3aGVuIHRoZSB0YXJnZXQgZXhpc3RzLlxuXHRcdC8vIEFueXRoaW5nIGVsc2UgaXMgYSByZWFsIGVycm9yLlxuXHRcdGlmICghKGVyciBpbnN0YW5jZW9mIEZpbGVPcGVyYXRpb25FcnJvcikgfHwgZXJyLmZpbGVPcGVyYXRpb25SZXN1bHQgIT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9NT1ZFX0NPTkZMSUNUKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICghKGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmV4aXN0cyhzZW50aW5lbCkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdC8vIFdpbm5lciBhbHJlYWR5IHB1Ymxpc2hlZCBhIGNvbXBsZXRlIGNhY2hlLiBEcm9wIG91ciBzY3JhdGNoIGRpci5cblx0XHRhd2FpdCB0aGlzLl9kZWxJZ25vcmluZ01pc3NpbmcodG1wRGlyVXJpKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2ZldGNoKFxuXHRcdHVybDogc3RyaW5nLFxuXHRcdGRlc3Q6IHN0cmluZyxcblx0XHR0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sXG5cdFx0b25CeXRlcz86IChyZWNlaXZlZEJ5dGVzOiBudW1iZXIsIHRvdGFsQnl0ZXM6IG51bWJlciB8IHVuZGVmaW5lZCkgPT4gdm9pZCxcblx0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gRGVsZWdhdGUgdG8gSVJlcXVlc3RTZXJ2aWNlIChjb3Jwb3JhdGUgcHJveHksIHN0cmljdFNTTCwga2VyYmVyb3MsXG5cdFx0Ly8gcmV0cmllcywgcmVkaXJlY3QgZm9sbG93KS4gYGZzLmNyZWF0ZVdyaXRlU3RyZWFtYCAobm90XG5cdFx0Ly8gYElGaWxlU2VydmljZS53cml0ZUZpbGVgKSBzbyB0aGF0IGNhbmNlbGxpbmcgYSBtdWx0aS1NQiBkb3dubG9hZFxuXHRcdC8vIGFib3J0cyBwcm9tcHRseSB2aWEgZGVzdHJveSgpLiBNYW51YWwgcGlwZSAobm90IGBzdHJlYW0ucGlwZWxpbmVgKVxuXHRcdC8vIGJlY2F1c2UgdGhlIHNvdXJjZSBpcyBhIFZTQnVmZmVyUmVhZGFibGVTdHJlYW0gXHUyMDE0IG5vdCBhIE5vZGVcblx0XHQvLyBSZWFkYWJsZSBcdTIwMTQgc28gbm9kZS1zdHJlYW0gdXRpbGl0aWVzIGNhbid0IGludHJvc3BlY3QgaXQuXG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHR9XG5cdFx0Y29uc3QgY29udGV4dDogSVJlcXVlc3RDb250ZXh0ID0gYXdhaXQgdGhpcy5fcmVxdWVzdFNlcnZpY2UucmVxdWVzdCh7XG5cdFx0XHR1cmwsXG5cdFx0XHR0eXBlOiAnR0VUJyxcblx0XHRcdGNhbGxTaXRlOiAnYWdlbnRTZGtEb3dubG9hZGVyJyxcblx0XHR9LCB0b2tlbik7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRjb250ZXh0LnN0cmVhbS5kZXN0cm95KCk7XG5cdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHR9XG5cblx0XHRjb25zdCBzdGF0dXNDb2RlID0gY29udGV4dC5yZXMuc3RhdHVzQ29kZSA/PyAwO1xuXHRcdGlmIChzdGF0dXNDb2RlIDwgMjAwIHx8IHN0YXR1c0NvZGUgPj0gMzAwKSB7XG5cdFx0XHRjb250ZXh0LnN0cmVhbS5kZXN0cm95KCk7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEhUVFAgJHtzdGF0dXNDb2RlfSBmZXRjaGluZyAke3VybH1gKTtcblx0XHR9XG5cblx0XHQvLyBUaGUgQ0ROIHNlbmRzIGBDb250ZW50LUxlbmd0aGAgZm9yIHRoZXNlIHN0YXRpYyB0YXJiYWxscywgd2hpY2ggbGV0c1xuXHRcdC8vIHVzIHJlcG9ydCBkZXRlcm1pbmF0ZSBwZXJjZW50YWdlIHByb2dyZXNzLiBBIG1pc3NpbmcvZ2FyYmxlZCBoZWFkZXJcblx0XHQvLyBkZWdyYWRlcyBncmFjZWZ1bGx5IHRvIGFuIGluZGV0ZXJtaW5hdGUgKGJ5dGUtY291bnQgb25seSkgcmVwb3J0LlxuXHRcdGNvbnN0IHRvdGFsQnl0ZXMgPSBwYXJzZUNvbnRlbnRMZW5ndGgoY29udGV4dC5yZXMuaGVhZGVyc1snY29udGVudC1sZW5ndGgnXSk7XG5cblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRjb25zdCBvdXQgPSBmcy5jcmVhdGVXcml0ZVN0cmVhbShkZXN0KTtcblx0XHRcdGxldCBzZXR0bGVkID0gZmFsc2U7XG5cdFx0XHQvLyBUaHJvdHRsZSBwcm9ncmVzcyBzbyBhIGZhc3QgbGluayBkb2Vzbid0IGZpcmUgdGhvdXNhbmRzIG9mXG5cdFx0XHQvLyBzYW1wbGVzLiBUaGUgZmlyc3QgY2h1bmsgYWx3YXlzIHBhc3NlcyAobGFzdEVtaXQgc3RhcnRzIGF0IDApXG5cdFx0XHQvLyBhbmQgJ2VuZCcgZm9yY2VzIGEgZmluYWwgc2FtcGxlLCBzbyBjb25zdW1lcnMgc2VlIGEgc3RhcnQgYW5kIGFcblx0XHRcdC8vIDEwMCUgZmluaXNoIHJlZ2FyZGxlc3Mgb2YgY2h1bmsgdGltaW5nLlxuXHRcdFx0bGV0IHJlY2VpdmVkQnl0ZXMgPSAwO1xuXHRcdFx0bGV0IGxhc3RFbWl0VGltZSA9IDA7XG5cdFx0XHRjb25zdCBlbWl0Qnl0ZXMgPSAoZm9yY2U6IGJvb2xlYW4pID0+IHtcblx0XHRcdFx0aWYgKCFvbkJ5dGVzKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHRcdGlmICghZm9yY2UgJiYgbm93IC0gbGFzdEVtaXRUaW1lIDwgUFJPR1JFU1NfRU1JVF9USFJPVFRMRV9NUykge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRsYXN0RW1pdFRpbWUgPSBub3c7XG5cdFx0XHRcdG9uQnl0ZXMocmVjZWl2ZWRCeXRlcywgdG90YWxCeXRlcyk7XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3Qgc2V0dGxlUmVzb2x2ZSA9ICgpID0+IHtcblx0XHRcdFx0aWYgKHNldHRsZWQpIHsgcmV0dXJuOyB9XG5cdFx0XHRcdHNldHRsZWQgPSB0cnVlO1xuXHRcdFx0XHRjYW5jZWxTdWIuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3Qgc2V0dGxlUmVqZWN0ID0gKGVycjogdW5rbm93bikgPT4ge1xuXHRcdFx0XHRpZiAoc2V0dGxlZCkgeyByZXR1cm47IH1cblx0XHRcdFx0c2V0dGxlZCA9IHRydWU7XG5cdFx0XHRcdGNhbmNlbFN1Yi5kaXNwb3NlKCk7XG5cdFx0XHRcdGNvbnRleHQuc3RyZWFtLmRlc3Ryb3koKTtcblx0XHRcdFx0b3V0LmRlc3Ryb3koKTtcblx0XHRcdFx0cmVqZWN0KGVycik7XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgY2FuY2VsU3ViID0gdG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gc2V0dGxlUmVqZWN0KG5ldyBDYW5jZWxsYXRpb25FcnJvcigpKSk7XG5cdFx0XHRvdXQub24oJ2Vycm9yJywgc2V0dGxlUmVqZWN0KTtcblx0XHRcdG91dC5vbignZmluaXNoJywgc2V0dGxlUmVzb2x2ZSk7XG5cdFx0XHQvLyBCYWNrcHJlc3N1cmU6IHRhcmJhbGxzIGFyZSA3MC05NU1COyBpZiB0aGUgZGlzayBpcyBzbG93ZXJcblx0XHRcdC8vIHRoYW4gdGhlIG5ldHdvcmsgKFdpbmRvd3MgQVYgc2NhbiwgbmV0d29yayBob21lIGRpciwgXHUyMDI2KSBhblxuXHRcdFx0Ly8gdW50aHJvdHRsZWQgcGlwZSBidWZmZXJzIHRoZSB3aG9sZSB0aGluZyBpbiBtZW1vcnkuIFBhdXNlIHRoZVxuXHRcdFx0Ly8gc291cmNlIHdoZW4gdGhlIHNpbmsncyBpbnRlcm5hbCBidWZmZXIgaGl0cyBoaWdoV2F0ZXJNYXJrIGFuZFxuXHRcdFx0Ly8gcmVzdW1lIG9uICdkcmFpbicuXG5cdFx0XHRvdXQub24oJ2RyYWluJywgKCkgPT4gY29udGV4dC5zdHJlYW0ucmVzdW1lKCkpO1xuXHRcdFx0Y29udGV4dC5zdHJlYW0ub24oJ2RhdGEnLCBjaHVuayA9PiB7XG5cdFx0XHRcdHJlY2VpdmVkQnl0ZXMgKz0gY2h1bmsuYnl0ZUxlbmd0aDtcblx0XHRcdFx0ZW1pdEJ5dGVzKGZhbHNlKTtcblx0XHRcdFx0aWYgKCFvdXQud3JpdGUoY2h1bmsuYnVmZmVyKSkge1xuXHRcdFx0XHRcdGNvbnRleHQuc3RyZWFtLnBhdXNlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0Y29udGV4dC5zdHJlYW0ub24oJ2VuZCcsICgpID0+IHtcblx0XHRcdFx0ZW1pdEJ5dGVzKHRydWUpO1xuXHRcdFx0XHRvdXQuZW5kKCk7XG5cdFx0XHR9KTtcblx0XHRcdGNvbnRleHQuc3RyZWFtLm9uKCdlcnJvcicsIHNldHRsZVJlamVjdCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9leHRyYWN0VGFyR3oodGFyYmFsbDogc3RyaW5nLCBkZXN0OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBgdGFyYCAobm9kZS10YXIpIGlzIHB1cmUgSlMgXHUyMDE0IHdvcmtzIG9uIGV2ZXJ5IHBsYXRmb3JtIHRoZSBhZ2VudCBob3N0XG5cdFx0Ly8gcnVucyBvbiB3aXRob3V0IGRlcGVuZGluZyBvbiBhIHN5c3RlbSBgdGFyYCBiaW5hcnkuXG5cdFx0YXdhaXQgdGFyLngoeyBmaWxlOiB0YXJiYWxsLCBjd2Q6IGRlc3QgfSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9kZWxJZ25vcmluZ01pc3NpbmcodXJpOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZGVsKHVyaSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHQvLyBgZm9yY2U6IHRydWVgIGJlaGF2aW91cjogbWlzc2luZyBwYXRoIGlzIGEgbm8tb3AuXG5cdFx0XHRpZiAodG9GaWxlT3BlcmF0aW9uUmVzdWx0KGVyciBhcyBFcnJvcikgIT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpIHtcblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG4vLyAjZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksUUFBUTtBQUNwQixZQUFZLFNBQVM7QUFDckIsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFlBQXlCLG9CQUFvQjtBQUN0RCxZQUFZLFVBQVU7QUFDdEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHNCQUF1QztBQUNoRCxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLG9CQUFvQixxQkFBcUIsY0FBYyw2QkFBNkI7QUFDN0YsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx1QkFBdUI7QUFD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
