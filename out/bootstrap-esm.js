import * as fs from "node:fs";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { product, pkg } from "./bootstrap-meta.js";
import "./bootstrap-node.js";
import * as performance from "./vs/base/common/performance.js";
globalThis._VSCODE_PRODUCT_JSON = { ...product };
globalThis._VSCODE_PACKAGE_JSON = { ...pkg };
globalThis._VSCODE_FILE_ROOT = import.meta.dirname;
function enableASARSupport() {
  if (!process.env["ELECTRON_RUN_AS_NODE"] && !process.versions["electron"]) {
    return;
  }
  const jsCode = `
	import { createRequire, isBuiltin } from 'node:module';
	import { pathToFileURL, fileURLToPath } from 'node:url';
	import { appendFileSync } from 'node:fs';

	let asarRequire;
	let resourcesPath;
	let trace;

	function setupTrace(sink) {
		if (!sink) { return; }
		const prefix = '[asar-resolve] ';
		if (sink === '1' || sink === 'true' || sink === 'on' || sink === 'stderr') {
			trace = msg => { try { process.stderr.write(prefix + msg + '\\n'); } catch { /* ignore */ } };
		} else {
			// Any other value is treated as a log file path to append to.
			trace = msg => { try { appendFileSync(sink, prefix + msg + '\\n'); } catch { /* ignore */ } };
		}
		trace('tracing enabled (node ' + process.versions.node + '); resourcesPath=' + resourcesPath);
	}

	// True only for *bare package specifiers* \u2014 the exact inputs Node routes to
	// its PACKAGE_RESOLVE (node_modules walk / self-reference / 'exports'/'main').
	//  - relative ('./', '../') and absolute ('/') paths -> new URL(specifier, base)
	//  - '#name' subpath imports                         -> PACKAGE_IMPORTS_RESOLVE
	//  - URL-scheme specifiers ('file:', 'data:', 'node:', 'electron:', ...) -> used verbatim
	function isBarePackageSpecifier(specifier) {
		if (specifier === '') { return false; }
		const c = specifier[0];
		if (c === '.' || c === '/' || c === '#') { return false; }
		return !URL.canParse(specifier);
	}

	// Electron injects a synthetic 'electron' module (also reachable via the
	// 'electron/main', 'electron/common' and 'electron/renderer' aliases) that
	// the loader resolves to the 'electron:' URL scheme rather than a real file.
	// 'node:module#isBuiltin' does not recognize it, so we detect it explicitly
	// and treat it like a Node built-in: it lives in the runtime, never in
	// 'node_modules', and must never be redirected into the archive.
	function isElectronBuiltin(specifier) {
		return specifier === 'electron' || specifier.startsWith('electron/');
	}

	function normalizeDriveLetter(path) {
		if (process.platform === 'win32'
			&& path.length >= 2
			&& (path.charCodeAt(0) >= 65 && path.charCodeAt(0) <= 90 || path.charCodeAt(0) >= 97 && path.charCodeAt(0) <= 122)
			&& path.charCodeAt(1) === 58) {
			return path[0].toLowerCase() + path.slice(1);
		}
		return path;
	}

	// Extract the package name from a bare specifier, e.g.
	// 'foo/lib/x.js' -> 'foo', '@scope/bar/baz' -> '@scope/bar'.
	function packageNameOf(specifier) {
		if (specifier[0] === '@') {
			const firstSlash = specifier.indexOf('/');
			if (firstSlash === -1) { return specifier; }
			const secondSlash = specifier.indexOf('/', firstSlash + 1);
			return secondSlash === -1 ? specifier : specifier.slice(0, secondSlash);
		}
		const slash = specifier.indexOf('/');
		return slash === -1 ? specifier : specifier.slice(0, slash);
	}

	export async function initialize({ resourcesPath: resPath, asarPath, traceSink }) {
		if (asarPath) {
			resourcesPath = normalizeDriveLetter(resPath);
			// A require rooted at the archive: 'require.resolve("./<module>")'
			// resolves into '<asarPath>/<module>' (top-level layout). The leading
			// './' is required so resolution is relative to the archive root rather
			// than a bare-specifier node_modules walk (the archive directory is
			// named node_modules.asar, so a bare walk would never find it).
			asarRequire = createRequire(asarPath + '/x.js');
		}
		setupTrace(traceSink);
	}

	export async function resolve(specifier, context, nextResolve) {
		if (specifier === 'fs') {
			if (trace) { trace('map "fs" -> node:original-fs (from ' + context.parentURL + ')'); }
			return {
				format: 'builtin',
				shortCircuit: true,
				url: 'node:original-fs'
			};
		}

		if (asarRequire && context.parentURL && isBarePackageSpecifier(specifier) && !isBuiltin(specifier) && !isElectronBuiltin(specifier)) {
			let parentPath;
			try { parentPath = normalizeDriveLetter(fileURLToPath(context.parentURL)); } catch { parentPath = undefined; }
			if (parentPath && parentPath.startsWith(resourcesPath)) {
				if (trace) { trace('resolve "' + specifier + '" from "' + context.parentURL + '"'); }
				// Try the default resolution first so an importer that ships its own
				// dependencies (e.g. a built-in extension that bundles a different copy
				// of a package) resolves against its own, closer 'node_modules' instead
				// of being redirected into the app archive. The archive stands in for
				// the application's own (farthest) 'node_modules', so it must only be
				// consulted once the default walk has found nothing.
				let defaultResult;
				let defaultError;
				try {
					defaultResult = await nextResolve(specifier, context);
				} catch (err) {
					defaultError = err;
				}

				// Only accept a default resolution that lands INSIDE the application
				// tree (a closer copy under 'resources/app', e.g. one bundled by a
				// built-in extension). A resolution ABOVE the app root must not win
				// over the archive: when the app is nested inside a larger tree (e.g.
				// '@vscode/test-electron' downloads the packaged app under the repo's
				// own 'node_modules'), the default node_modules walk can escape the app
				// and find a stale / ABI-mismatched copy. The archive stands in for the
				// application's own 'node_modules' and must take precedence over
				// anything outside 'resources/app'.
				if (defaultResult) {
					let resolvedPath;
					try { resolvedPath = normalizeDriveLetter(fileURLToPath(defaultResult.url)); } catch { resolvedPath = undefined; }
					if (!resolvedPath || resolvedPath.startsWith(resourcesPath)) {
						if (trace) { trace('  default -> ' + defaultResult.url + ' (in app, ACCEPT)'); }
						return defaultResult;
					}
					if (trace) { trace('  default -> ' + defaultResult.url + ' (outside app, reject)'); }
				} else if (trace) {
					trace('  default -> <none> (' + (defaultError && (defaultError.code || defaultError.message)) + ')');
				}

				// Locate the package inside the archive via its package.json (this is
				// resolution-condition independent), so we can re-root resolution
				// inside it below.
				let packageJsonPath;
				try {
					packageJsonPath = asarRequire.resolve('./' + packageNameOf(specifier) + '/package.json');
				} catch {
					// The package is part of neither 'resources/app' (the default
					// resolution above did not land inside the app) nor the archive.
					// Do NOT fall back to a copy from an outer 'node_modules' (e.g. a
					// parent checkout the app is nested under): the application must
					// resolve its own dependencies exclusively from its own resources.
					// Surface the original resolution error so a missing/misplaced
					// dependency fails loudly instead of silently loading a foreign copy.
					if (trace) { trace('  archive: package "' + packageNameOf(specifier) + '" NOT in archive -> throw'); }
					throw defaultError ?? new Error("Cannot find package '" + specifier + "' within the application resources");
				}
				if (trace) { trace('  archive pkg.json -> ' + packageJsonPath); }
				// Re-run the default ESM resolution rooted *inside* the archived
				// package (via its package.json) so Node resolves the request as a
				// package self-reference, applying the real 'exports'/'main' fields and
				// ESM conditions ('import' over 'require').
				try {
					const selfRef = await nextResolve(specifier, { ...context, parentURL: pathToFileURL(packageJsonPath).href });
					// A package without an 'exports' field does not self-reference: Node
					// falls back to a 'node_modules' walk from the package dir that can
					// climb *out* of the archive into an outer 'node_modules' (e.g. the
					// checkout the app is nested under). Only accept a result that stays
					// inside the app resources; otherwise fall back to the direct,
					// escape-proof archive resolution below.
					let selfRefPath;
					try { selfRefPath = normalizeDriveLetter(fileURLToPath(selfRef.url)); } catch { selfRefPath = undefined; }
					if (selfRefPath && selfRefPath.startsWith(resourcesPath)) {
						if (trace) { trace('  self-ref -> ' + selfRef.url + ' (in app, ACCEPT)'); }
						return selfRef;
					}
					if (trace) { trace('  self-ref -> ' + selfRef.url + ' (escaped app, reject)'); }
				} catch (err) {
					// Fall through to direct resolution below.
					if (trace) { trace('  self-ref -> <throw> (' + (err && (err.code || err.message)) + ')'); }
				}
				const resolved = asarRequire.resolve('./' + specifier);
				const url = pathToFileURL(resolved).href;
				if (trace) { trace('  direct -> ' + url + ' (ACCEPT)'); }
				return { url, shortCircuit: true };
			} else if (trace) {
				trace('defer "' + specifier + '" (parent outside app resources: ' + context.parentURL + ')');
			}
		}

		// Defer to the next hook in the chain, which would be the
		// Node.js default resolve if this is the last user-specified loader.
		return nextResolve(specifier, context);
	}`;
  const traceSink = process.env["VSCODE_ASAR_TRACE"] || void 0;
  const appRoot = dirname(import.meta.dirname);
  register(`data:text/javascript;base64,${Buffer.from(jsCode).toString("base64")}`, import.meta.url, {
    data: process.env["VSCODE_DEV"] ? {} : {
      resourcesPath: appRoot,
      asarPath: join(appRoot, "node_modules.asar"),
      traceSink
    }
  });
}
enableASARSupport();
let setupNLSResult = void 0;
function setupNLS() {
  if (!setupNLSResult) {
    setupNLSResult = doSetupNLS();
  }
  return setupNLSResult;
}
async function doSetupNLS() {
  performance.mark("code/willLoadNls");
  let nlsConfig = void 0;
  let messagesFile;
  if (process.env["VSCODE_NLS_CONFIG"]) {
    try {
      nlsConfig = JSON.parse(process.env["VSCODE_NLS_CONFIG"]);
      if (nlsConfig?.languagePack?.messagesFile) {
        messagesFile = nlsConfig.languagePack.messagesFile;
      } else if (nlsConfig?.defaultMessagesFile) {
        messagesFile = nlsConfig.defaultMessagesFile;
      }
      globalThis._VSCODE_NLS_LANGUAGE = nlsConfig?.resolvedLanguage;
    } catch (e) {
      console.error(`Error reading VSCODE_NLS_CONFIG from environment: ${e}`);
    }
  }
  if (process.env["VSCODE_DEV"] || // no NLS support in dev mode
  !messagesFile) {
    return void 0;
  }
  try {
    globalThis._VSCODE_NLS_MESSAGES = JSON.parse((await fs.promises.readFile(messagesFile)).toString());
  } catch (error) {
    console.error(`Error reading NLS messages file ${messagesFile}: ${error}`);
    if (nlsConfig?.languagePack?.corruptMarkerFile) {
      try {
        await fs.promises.writeFile(nlsConfig.languagePack.corruptMarkerFile, "corrupted");
      } catch (error2) {
        console.error(`Error writing corrupted NLS marker file: ${error2}`);
      }
    }
    if (nlsConfig?.defaultMessagesFile && nlsConfig.defaultMessagesFile !== messagesFile) {
      try {
        globalThis._VSCODE_NLS_MESSAGES = JSON.parse((await fs.promises.readFile(nlsConfig.defaultMessagesFile)).toString());
      } catch (error2) {
        console.error(`Error reading default NLS messages file ${nlsConfig.defaultMessagesFile}: ${error2}`);
      }
    }
  }
  performance.mark("code/didLoadNls");
  return nlsConfig;
}
async function bootstrapESM() {
  await setupNLS();
}
export {
  bootstrapESM
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXGJvb3RzdHJhcC1lc20udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdub2RlOmZzJztcbmltcG9ydCB7IHJlZ2lzdGVyIH0gZnJvbSAnbm9kZTptb2R1bGUnO1xuaW1wb3J0IHsgZGlybmFtZSwgam9pbiB9IGZyb20gJ25vZGU6cGF0aCc7XG5pbXBvcnQgeyBwcm9kdWN0LCBwa2cgfSBmcm9tICcuL2Jvb3RzdHJhcC1tZXRhLmpzJztcbmltcG9ydCAnLi9ib290c3RyYXAtbm9kZS5qcyc7XG5pbXBvcnQgKiBhcyBwZXJmb3JtYW5jZSBmcm9tICcuL3ZzL2Jhc2UvY29tbW9uL3BlcmZvcm1hbmNlLmpzJztcbmltcG9ydCB7IElOTFNDb25maWd1cmF0aW9uIH0gZnJvbSAnLi92cy9ubHMuanMnO1xuXG4vLyBQcmVwYXJlIGdsb2JhbHMgdGhhdCBhcmUgbmVlZGVkIGZvciBydW5uaW5nXG5nbG9iYWxUaGlzLl9WU0NPREVfUFJPRFVDVF9KU09OID0geyAuLi5wcm9kdWN0IH07XG5nbG9iYWxUaGlzLl9WU0NPREVfUEFDS0FHRV9KU09OID0geyAuLi5wa2cgfTtcbmdsb2JhbFRoaXMuX1ZTQ09ERV9GSUxFX1JPT1QgPSBpbXBvcnQubWV0YS5kaXJuYW1lO1xuXG4vLyBJbnN0YWxsIGEgaG9vayB0byBFU00gbW9kdWxlIHJlc29sdXRpb24gdGhhdFxuLy8gMSkgbWFwcyAnZnMnIHRvICdvcmlnaW5hbC1mcycgKHRoZSBBU0FSLXVuYXdhcmUgTm9kZS5qcyBgZnNgKSwgYW5kXG4vLyAyKSByZXNvbHZlcyBiYXJlIG1vZHVsZSBzcGVjaWZpZXJzIGludG8gb3VyIGBub2RlX21vZHVsZXMuYXNhcmAgYXJjaGl2ZS5cbi8vXG4vLyBUaGUgYXJjaGl2ZSBrZWVwcyB0aGUgc2FtZSB0b3AtbGV2ZWwgbGF5b3V0IGFzIGBub2RlX21vZHVsZXNgXG4vLyAoYG5vZGVfbW9kdWxlcy5hc2FyLzxtb2R1bGU+YCkuIE5vZGUncyBkZWZhdWx0IEVTTSByZXNvbHZlciBvbmx5IGV2ZXIgbG9va3Ncbi8vIGludG8gZGlyZWN0b3JpZXMgbGl0ZXJhbGx5IG5hbWVkIGBub2RlX21vZHVsZXNgLCBzbyBpdCBjYW5ub3QgZmluZCBtb2R1bGVzIGF0XG4vLyB0aGUgYXJjaGl2ZSdzIHRvcCBsZXZlbCBvbiBpdHMgb3duLiBXZSB0aGVyZWZvcmUgbG9jYXRlIHRoZSB0YXJnZXQgcGFja2FnZVxuLy8gaW5zaWRlIHRoZSBhcmNoaXZlICh2aWEgaXRzIGBwYWNrYWdlLmpzb25gKSBhbmQgcmUtcnVuIHRoZSBkZWZhdWx0IHJlc29sdXRpb25cbi8vIHJvb3RlZCBpbnNpZGUgdGhhdCBwYWNrYWdlIHNvIE5vZGUgcmVzb2x2ZXMgaXQgYXMgYSBwYWNrYWdlIHNlbGYtcmVmZXJlbmNlLFxuLy8gYXBwbHlpbmcgdGhlIHBhY2thZ2UncyByZWFsIGBleHBvcnRzYC9gbWFpbmAgZmllbGRzIGFuZCBFU00gY29uZGl0aW9ucy4gVGhpc1xuLy8gdG9wLWxldmVsIGxheW91dCBpcyB3aGF0IGFsbG93cyBleHRlbnNpb25zIChlLmcuIERldiBDb250YWluZXJzKSB0aGF0IHJlYWNoXG4vLyBpbnRvIGAke2FwcFJvb3R9L25vZGVfbW9kdWxlcy5hc2FyLzxtb2R1bGU+YCB0byBrZWVwIHdvcmtpbmcuXG4vL1xuLy8gVGhlIGFyY2hpdmUgc3RhbmRzIGluIGZvciB0aGUgYXBwbGljYXRpb24ncyBvd24gYG5vZGVfbW9kdWxlc2AgZm9sZGVyLCB3aGljaFxuLy8gaXMgdGhlICpmYXJ0aGVzdCogZGlyZWN0b3J5IE5vZGUgd291bGQgd2FsayB0by4gV2UgdGhlcmVmb3JlIGFsd2F5cyB0cnkgdGhlXG4vLyBkZWZhdWx0IHJlc29sdXRpb24gZmlyc3Q6IGFuIGltcG9ydGVyIHRoYXQgc2hpcHMgaXRzIG93biBkZXBlbmRlbmNpZXMgKGUuZy4gYVxuLy8gYnVpbHQtaW4gZXh0ZW5zaW9uIHVuZGVyIGAke2FwcFJvb3R9L2V4dGVuc2lvbnMvPGV4dD5gIHRoYXQgYnVuZGxlcyBhXG4vLyBkaWZmZXJlbnQgY29weSBvZiBhIHBhY2thZ2UpIG11c3QgcmVzb2x2ZSBhZ2FpbnN0IGl0cyBvd24sIGNsb3NlclxuLy8gYG5vZGVfbW9kdWxlc2AgXHUyMDE0IGV4YWN0bHkgYXMgaXQgd291bGQgd2l0aG91dCB0aGUgYXJjaGl2ZS4gT25seSB3aGVuIHRoZVxuLy8gZGVmYXVsdCByZXNvbHV0aW9uIGZpbmRzIG5vdGhpbmcgZG8gd2UgY29uc3VsdCB0aGUgYXJjaGl2ZS5cbmZ1bmN0aW9uIGVuYWJsZUFTQVJTdXBwb3J0KCk6IHZvaWQge1xuXHRpZiAoIXByb2Nlc3MuZW52WydFTEVDVFJPTl9SVU5fQVNfTk9ERSddICYmICFwcm9jZXNzLnZlcnNpb25zWydlbGVjdHJvbiddKSB7XG5cdFx0cmV0dXJuOyAvLyBvbmx5IG9uIEVsZWN0cm9uIC8gRWxlY3Ryb24tYXMtbm9kZVxuXHR9XG5cblx0Y29uc3QganNDb2RlID0gYFxuXHRpbXBvcnQgeyBjcmVhdGVSZXF1aXJlLCBpc0J1aWx0aW4gfSBmcm9tICdub2RlOm1vZHVsZSc7XG5cdGltcG9ydCB7IHBhdGhUb0ZpbGVVUkwsIGZpbGVVUkxUb1BhdGggfSBmcm9tICdub2RlOnVybCc7XG5cdGltcG9ydCB7IGFwcGVuZEZpbGVTeW5jIH0gZnJvbSAnbm9kZTpmcyc7XG5cblx0bGV0IGFzYXJSZXF1aXJlO1xuXHRsZXQgcmVzb3VyY2VzUGF0aDtcblx0bGV0IHRyYWNlO1xuXG5cdGZ1bmN0aW9uIHNldHVwVHJhY2Uoc2luaykge1xuXHRcdGlmICghc2luaykgeyByZXR1cm47IH1cblx0XHRjb25zdCBwcmVmaXggPSAnW2FzYXItcmVzb2x2ZV0gJztcblx0XHRpZiAoc2luayA9PT0gJzEnIHx8IHNpbmsgPT09ICd0cnVlJyB8fCBzaW5rID09PSAnb24nIHx8IHNpbmsgPT09ICdzdGRlcnInKSB7XG5cdFx0XHR0cmFjZSA9IG1zZyA9PiB7IHRyeSB7IHByb2Nlc3Muc3RkZXJyLndyaXRlKHByZWZpeCArIG1zZyArICdcXFxcbicpOyB9IGNhdGNoIHsgLyogaWdub3JlICovIH0gfTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gQW55IG90aGVyIHZhbHVlIGlzIHRyZWF0ZWQgYXMgYSBsb2cgZmlsZSBwYXRoIHRvIGFwcGVuZCB0by5cblx0XHRcdHRyYWNlID0gbXNnID0+IHsgdHJ5IHsgYXBwZW5kRmlsZVN5bmMoc2luaywgcHJlZml4ICsgbXNnICsgJ1xcXFxuJyk7IH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfSB9O1xuXHRcdH1cblx0XHR0cmFjZSgndHJhY2luZyBlbmFibGVkIChub2RlICcgKyBwcm9jZXNzLnZlcnNpb25zLm5vZGUgKyAnKTsgcmVzb3VyY2VzUGF0aD0nICsgcmVzb3VyY2VzUGF0aCk7XG5cdH1cblxuXHQvLyBUcnVlIG9ubHkgZm9yICpiYXJlIHBhY2thZ2Ugc3BlY2lmaWVycyogXHUyMDE0IHRoZSBleGFjdCBpbnB1dHMgTm9kZSByb3V0ZXMgdG9cblx0Ly8gaXRzIFBBQ0tBR0VfUkVTT0xWRSAobm9kZV9tb2R1bGVzIHdhbGsgLyBzZWxmLXJlZmVyZW5jZSAvICdleHBvcnRzJy8nbWFpbicpLlxuXHQvLyAgLSByZWxhdGl2ZSAoJy4vJywgJy4uLycpIGFuZCBhYnNvbHV0ZSAoJy8nKSBwYXRocyAtPiBuZXcgVVJMKHNwZWNpZmllciwgYmFzZSlcblx0Ly8gIC0gJyNuYW1lJyBzdWJwYXRoIGltcG9ydHMgICAgICAgICAgICAgICAgICAgICAgICAgLT4gUEFDS0FHRV9JTVBPUlRTX1JFU09MVkVcblx0Ly8gIC0gVVJMLXNjaGVtZSBzcGVjaWZpZXJzICgnZmlsZTonLCAnZGF0YTonLCAnbm9kZTonLCAnZWxlY3Ryb246JywgLi4uKSAtPiB1c2VkIHZlcmJhdGltXG5cdGZ1bmN0aW9uIGlzQmFyZVBhY2thZ2VTcGVjaWZpZXIoc3BlY2lmaWVyKSB7XG5cdFx0aWYgKHNwZWNpZmllciA9PT0gJycpIHsgcmV0dXJuIGZhbHNlOyB9XG5cdFx0Y29uc3QgYyA9IHNwZWNpZmllclswXTtcblx0XHRpZiAoYyA9PT0gJy4nIHx8IGMgPT09ICcvJyB8fCBjID09PSAnIycpIHsgcmV0dXJuIGZhbHNlOyB9XG5cdFx0cmV0dXJuICFVUkwuY2FuUGFyc2Uoc3BlY2lmaWVyKTtcblx0fVxuXG5cdC8vIEVsZWN0cm9uIGluamVjdHMgYSBzeW50aGV0aWMgJ2VsZWN0cm9uJyBtb2R1bGUgKGFsc28gcmVhY2hhYmxlIHZpYSB0aGVcblx0Ly8gJ2VsZWN0cm9uL21haW4nLCAnZWxlY3Ryb24vY29tbW9uJyBhbmQgJ2VsZWN0cm9uL3JlbmRlcmVyJyBhbGlhc2VzKSB0aGF0XG5cdC8vIHRoZSBsb2FkZXIgcmVzb2x2ZXMgdG8gdGhlICdlbGVjdHJvbjonIFVSTCBzY2hlbWUgcmF0aGVyIHRoYW4gYSByZWFsIGZpbGUuXG5cdC8vICdub2RlOm1vZHVsZSNpc0J1aWx0aW4nIGRvZXMgbm90IHJlY29nbml6ZSBpdCwgc28gd2UgZGV0ZWN0IGl0IGV4cGxpY2l0bHlcblx0Ly8gYW5kIHRyZWF0IGl0IGxpa2UgYSBOb2RlIGJ1aWx0LWluOiBpdCBsaXZlcyBpbiB0aGUgcnVudGltZSwgbmV2ZXIgaW5cblx0Ly8gJ25vZGVfbW9kdWxlcycsIGFuZCBtdXN0IG5ldmVyIGJlIHJlZGlyZWN0ZWQgaW50byB0aGUgYXJjaGl2ZS5cblx0ZnVuY3Rpb24gaXNFbGVjdHJvbkJ1aWx0aW4oc3BlY2lmaWVyKSB7XG5cdFx0cmV0dXJuIHNwZWNpZmllciA9PT0gJ2VsZWN0cm9uJyB8fCBzcGVjaWZpZXIuc3RhcnRzV2l0aCgnZWxlY3Ryb24vJyk7XG5cdH1cblxuXHRmdW5jdGlvbiBub3JtYWxpemVEcml2ZUxldHRlcihwYXRoKSB7XG5cdFx0aWYgKHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMidcblx0XHRcdCYmIHBhdGgubGVuZ3RoID49IDJcblx0XHRcdCYmIChwYXRoLmNoYXJDb2RlQXQoMCkgPj0gNjUgJiYgcGF0aC5jaGFyQ29kZUF0KDApIDw9IDkwIHx8IHBhdGguY2hhckNvZGVBdCgwKSA+PSA5NyAmJiBwYXRoLmNoYXJDb2RlQXQoMCkgPD0gMTIyKVxuXHRcdFx0JiYgcGF0aC5jaGFyQ29kZUF0KDEpID09PSA1OCkge1xuXHRcdFx0cmV0dXJuIHBhdGhbMF0udG9Mb3dlckNhc2UoKSArIHBhdGguc2xpY2UoMSk7XG5cdFx0fVxuXHRcdHJldHVybiBwYXRoO1xuXHR9XG5cblx0Ly8gRXh0cmFjdCB0aGUgcGFja2FnZSBuYW1lIGZyb20gYSBiYXJlIHNwZWNpZmllciwgZS5nLlxuXHQvLyAnZm9vL2xpYi94LmpzJyAtPiAnZm9vJywgJ0BzY29wZS9iYXIvYmF6JyAtPiAnQHNjb3BlL2JhcicuXG5cdGZ1bmN0aW9uIHBhY2thZ2VOYW1lT2Yoc3BlY2lmaWVyKSB7XG5cdFx0aWYgKHNwZWNpZmllclswXSA9PT0gJ0AnKSB7XG5cdFx0XHRjb25zdCBmaXJzdFNsYXNoID0gc3BlY2lmaWVyLmluZGV4T2YoJy8nKTtcblx0XHRcdGlmIChmaXJzdFNsYXNoID09PSAtMSkgeyByZXR1cm4gc3BlY2lmaWVyOyB9XG5cdFx0XHRjb25zdCBzZWNvbmRTbGFzaCA9IHNwZWNpZmllci5pbmRleE9mKCcvJywgZmlyc3RTbGFzaCArIDEpO1xuXHRcdFx0cmV0dXJuIHNlY29uZFNsYXNoID09PSAtMSA/IHNwZWNpZmllciA6IHNwZWNpZmllci5zbGljZSgwLCBzZWNvbmRTbGFzaCk7XG5cdFx0fVxuXHRcdGNvbnN0IHNsYXNoID0gc3BlY2lmaWVyLmluZGV4T2YoJy8nKTtcblx0XHRyZXR1cm4gc2xhc2ggPT09IC0xID8gc3BlY2lmaWVyIDogc3BlY2lmaWVyLnNsaWNlKDAsIHNsYXNoKTtcblx0fVxuXG5cdGV4cG9ydCBhc3luYyBmdW5jdGlvbiBpbml0aWFsaXplKHsgcmVzb3VyY2VzUGF0aDogcmVzUGF0aCwgYXNhclBhdGgsIHRyYWNlU2luayB9KSB7XG5cdFx0aWYgKGFzYXJQYXRoKSB7XG5cdFx0XHRyZXNvdXJjZXNQYXRoID0gbm9ybWFsaXplRHJpdmVMZXR0ZXIocmVzUGF0aCk7XG5cdFx0XHQvLyBBIHJlcXVpcmUgcm9vdGVkIGF0IHRoZSBhcmNoaXZlOiAncmVxdWlyZS5yZXNvbHZlKFwiLi88bW9kdWxlPlwiKSdcblx0XHRcdC8vIHJlc29sdmVzIGludG8gJzxhc2FyUGF0aD4vPG1vZHVsZT4nICh0b3AtbGV2ZWwgbGF5b3V0KS4gVGhlIGxlYWRpbmdcblx0XHRcdC8vICcuLycgaXMgcmVxdWlyZWQgc28gcmVzb2x1dGlvbiBpcyByZWxhdGl2ZSB0byB0aGUgYXJjaGl2ZSByb290IHJhdGhlclxuXHRcdFx0Ly8gdGhhbiBhIGJhcmUtc3BlY2lmaWVyIG5vZGVfbW9kdWxlcyB3YWxrICh0aGUgYXJjaGl2ZSBkaXJlY3RvcnkgaXNcblx0XHRcdC8vIG5hbWVkIG5vZGVfbW9kdWxlcy5hc2FyLCBzbyBhIGJhcmUgd2FsayB3b3VsZCBuZXZlciBmaW5kIGl0KS5cblx0XHRcdGFzYXJSZXF1aXJlID0gY3JlYXRlUmVxdWlyZShhc2FyUGF0aCArICcveC5qcycpO1xuXHRcdH1cblx0XHRzZXR1cFRyYWNlKHRyYWNlU2luayk7XG5cdH1cblxuXHRleHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZShzcGVjaWZpZXIsIGNvbnRleHQsIG5leHRSZXNvbHZlKSB7XG5cdFx0aWYgKHNwZWNpZmllciA9PT0gJ2ZzJykge1xuXHRcdFx0aWYgKHRyYWNlKSB7IHRyYWNlKCdtYXAgXCJmc1wiIC0+IG5vZGU6b3JpZ2luYWwtZnMgKGZyb20gJyArIGNvbnRleHQucGFyZW50VVJMICsgJyknKTsgfVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Zm9ybWF0OiAnYnVpbHRpbicsXG5cdFx0XHRcdHNob3J0Q2lyY3VpdDogdHJ1ZSxcblx0XHRcdFx0dXJsOiAnbm9kZTpvcmlnaW5hbC1mcydcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKGFzYXJSZXF1aXJlICYmIGNvbnRleHQucGFyZW50VVJMICYmIGlzQmFyZVBhY2thZ2VTcGVjaWZpZXIoc3BlY2lmaWVyKSAmJiAhaXNCdWlsdGluKHNwZWNpZmllcikgJiYgIWlzRWxlY3Ryb25CdWlsdGluKHNwZWNpZmllcikpIHtcblx0XHRcdGxldCBwYXJlbnRQYXRoO1xuXHRcdFx0dHJ5IHsgcGFyZW50UGF0aCA9IG5vcm1hbGl6ZURyaXZlTGV0dGVyKGZpbGVVUkxUb1BhdGgoY29udGV4dC5wYXJlbnRVUkwpKTsgfSBjYXRjaCB7IHBhcmVudFBhdGggPSB1bmRlZmluZWQ7IH1cblx0XHRcdGlmIChwYXJlbnRQYXRoICYmIHBhcmVudFBhdGguc3RhcnRzV2l0aChyZXNvdXJjZXNQYXRoKSkge1xuXHRcdFx0XHRpZiAodHJhY2UpIHsgdHJhY2UoJ3Jlc29sdmUgXCInICsgc3BlY2lmaWVyICsgJ1wiIGZyb20gXCInICsgY29udGV4dC5wYXJlbnRVUkwgKyAnXCInKTsgfVxuXHRcdFx0XHQvLyBUcnkgdGhlIGRlZmF1bHQgcmVzb2x1dGlvbiBmaXJzdCBzbyBhbiBpbXBvcnRlciB0aGF0IHNoaXBzIGl0cyBvd25cblx0XHRcdFx0Ly8gZGVwZW5kZW5jaWVzIChlLmcuIGEgYnVpbHQtaW4gZXh0ZW5zaW9uIHRoYXQgYnVuZGxlcyBhIGRpZmZlcmVudCBjb3B5XG5cdFx0XHRcdC8vIG9mIGEgcGFja2FnZSkgcmVzb2x2ZXMgYWdhaW5zdCBpdHMgb3duLCBjbG9zZXIgJ25vZGVfbW9kdWxlcycgaW5zdGVhZFxuXHRcdFx0XHQvLyBvZiBiZWluZyByZWRpcmVjdGVkIGludG8gdGhlIGFwcCBhcmNoaXZlLiBUaGUgYXJjaGl2ZSBzdGFuZHMgaW4gZm9yXG5cdFx0XHRcdC8vIHRoZSBhcHBsaWNhdGlvbidzIG93biAoZmFydGhlc3QpICdub2RlX21vZHVsZXMnLCBzbyBpdCBtdXN0IG9ubHkgYmVcblx0XHRcdFx0Ly8gY29uc3VsdGVkIG9uY2UgdGhlIGRlZmF1bHQgd2FsayBoYXMgZm91bmQgbm90aGluZy5cblx0XHRcdFx0bGV0IGRlZmF1bHRSZXN1bHQ7XG5cdFx0XHRcdGxldCBkZWZhdWx0RXJyb3I7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0ZGVmYXVsdFJlc3VsdCA9IGF3YWl0IG5leHRSZXNvbHZlKHNwZWNpZmllciwgY29udGV4dCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdGRlZmF1bHRFcnJvciA9IGVycjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIE9ubHkgYWNjZXB0IGEgZGVmYXVsdCByZXNvbHV0aW9uIHRoYXQgbGFuZHMgSU5TSURFIHRoZSBhcHBsaWNhdGlvblxuXHRcdFx0XHQvLyB0cmVlIChhIGNsb3NlciBjb3B5IHVuZGVyICdyZXNvdXJjZXMvYXBwJywgZS5nLiBvbmUgYnVuZGxlZCBieSBhXG5cdFx0XHRcdC8vIGJ1aWx0LWluIGV4dGVuc2lvbikuIEEgcmVzb2x1dGlvbiBBQk9WRSB0aGUgYXBwIHJvb3QgbXVzdCBub3Qgd2luXG5cdFx0XHRcdC8vIG92ZXIgdGhlIGFyY2hpdmU6IHdoZW4gdGhlIGFwcCBpcyBuZXN0ZWQgaW5zaWRlIGEgbGFyZ2VyIHRyZWUgKGUuZy5cblx0XHRcdFx0Ly8gJ0B2c2NvZGUvdGVzdC1lbGVjdHJvbicgZG93bmxvYWRzIHRoZSBwYWNrYWdlZCBhcHAgdW5kZXIgdGhlIHJlcG8nc1xuXHRcdFx0XHQvLyBvd24gJ25vZGVfbW9kdWxlcycpLCB0aGUgZGVmYXVsdCBub2RlX21vZHVsZXMgd2FsayBjYW4gZXNjYXBlIHRoZSBhcHBcblx0XHRcdFx0Ly8gYW5kIGZpbmQgYSBzdGFsZSAvIEFCSS1taXNtYXRjaGVkIGNvcHkuIFRoZSBhcmNoaXZlIHN0YW5kcyBpbiBmb3IgdGhlXG5cdFx0XHRcdC8vIGFwcGxpY2F0aW9uJ3Mgb3duICdub2RlX21vZHVsZXMnIGFuZCBtdXN0IHRha2UgcHJlY2VkZW5jZSBvdmVyXG5cdFx0XHRcdC8vIGFueXRoaW5nIG91dHNpZGUgJ3Jlc291cmNlcy9hcHAnLlxuXHRcdFx0XHRpZiAoZGVmYXVsdFJlc3VsdCkge1xuXHRcdFx0XHRcdGxldCByZXNvbHZlZFBhdGg7XG5cdFx0XHRcdFx0dHJ5IHsgcmVzb2x2ZWRQYXRoID0gbm9ybWFsaXplRHJpdmVMZXR0ZXIoZmlsZVVSTFRvUGF0aChkZWZhdWx0UmVzdWx0LnVybCkpOyB9IGNhdGNoIHsgcmVzb2x2ZWRQYXRoID0gdW5kZWZpbmVkOyB9XG5cdFx0XHRcdFx0aWYgKCFyZXNvbHZlZFBhdGggfHwgcmVzb2x2ZWRQYXRoLnN0YXJ0c1dpdGgocmVzb3VyY2VzUGF0aCkpIHtcblx0XHRcdFx0XHRcdGlmICh0cmFjZSkgeyB0cmFjZSgnICBkZWZhdWx0IC0+ICcgKyBkZWZhdWx0UmVzdWx0LnVybCArICcgKGluIGFwcCwgQUNDRVBUKScpOyB9XG5cdFx0XHRcdFx0XHRyZXR1cm4gZGVmYXVsdFJlc3VsdDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHRyYWNlKSB7IHRyYWNlKCcgIGRlZmF1bHQgLT4gJyArIGRlZmF1bHRSZXN1bHQudXJsICsgJyAob3V0c2lkZSBhcHAsIHJlamVjdCknKTsgfVxuXHRcdFx0XHR9IGVsc2UgaWYgKHRyYWNlKSB7XG5cdFx0XHRcdFx0dHJhY2UoJyAgZGVmYXVsdCAtPiA8bm9uZT4gKCcgKyAoZGVmYXVsdEVycm9yICYmIChkZWZhdWx0RXJyb3IuY29kZSB8fCBkZWZhdWx0RXJyb3IubWVzc2FnZSkpICsgJyknKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIExvY2F0ZSB0aGUgcGFja2FnZSBpbnNpZGUgdGhlIGFyY2hpdmUgdmlhIGl0cyBwYWNrYWdlLmpzb24gKHRoaXMgaXNcblx0XHRcdFx0Ly8gcmVzb2x1dGlvbi1jb25kaXRpb24gaW5kZXBlbmRlbnQpLCBzbyB3ZSBjYW4gcmUtcm9vdCByZXNvbHV0aW9uXG5cdFx0XHRcdC8vIGluc2lkZSBpdCBiZWxvdy5cblx0XHRcdFx0bGV0IHBhY2thZ2VKc29uUGF0aDtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRwYWNrYWdlSnNvblBhdGggPSBhc2FyUmVxdWlyZS5yZXNvbHZlKCcuLycgKyBwYWNrYWdlTmFtZU9mKHNwZWNpZmllcikgKyAnL3BhY2thZ2UuanNvbicpO1xuXHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHQvLyBUaGUgcGFja2FnZSBpcyBwYXJ0IG9mIG5laXRoZXIgJ3Jlc291cmNlcy9hcHAnICh0aGUgZGVmYXVsdFxuXHRcdFx0XHRcdC8vIHJlc29sdXRpb24gYWJvdmUgZGlkIG5vdCBsYW5kIGluc2lkZSB0aGUgYXBwKSBub3IgdGhlIGFyY2hpdmUuXG5cdFx0XHRcdFx0Ly8gRG8gTk9UIGZhbGwgYmFjayB0byBhIGNvcHkgZnJvbSBhbiBvdXRlciAnbm9kZV9tb2R1bGVzJyAoZS5nLiBhXG5cdFx0XHRcdFx0Ly8gcGFyZW50IGNoZWNrb3V0IHRoZSBhcHAgaXMgbmVzdGVkIHVuZGVyKTogdGhlIGFwcGxpY2F0aW9uIG11c3Rcblx0XHRcdFx0XHQvLyByZXNvbHZlIGl0cyBvd24gZGVwZW5kZW5jaWVzIGV4Y2x1c2l2ZWx5IGZyb20gaXRzIG93biByZXNvdXJjZXMuXG5cdFx0XHRcdFx0Ly8gU3VyZmFjZSB0aGUgb3JpZ2luYWwgcmVzb2x1dGlvbiBlcnJvciBzbyBhIG1pc3NpbmcvbWlzcGxhY2VkXG5cdFx0XHRcdFx0Ly8gZGVwZW5kZW5jeSBmYWlscyBsb3VkbHkgaW5zdGVhZCBvZiBzaWxlbnRseSBsb2FkaW5nIGEgZm9yZWlnbiBjb3B5LlxuXHRcdFx0XHRcdGlmICh0cmFjZSkgeyB0cmFjZSgnICBhcmNoaXZlOiBwYWNrYWdlIFwiJyArIHBhY2thZ2VOYW1lT2Yoc3BlY2lmaWVyKSArICdcIiBOT1QgaW4gYXJjaGl2ZSAtPiB0aHJvdycpOyB9XG5cdFx0XHRcdFx0dGhyb3cgZGVmYXVsdEVycm9yID8/IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIHBhY2thZ2UgJ1wiICsgc3BlY2lmaWVyICsgXCInIHdpdGhpbiB0aGUgYXBwbGljYXRpb24gcmVzb3VyY2VzXCIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0cmFjZSkgeyB0cmFjZSgnICBhcmNoaXZlIHBrZy5qc29uIC0+ICcgKyBwYWNrYWdlSnNvblBhdGgpOyB9XG5cdFx0XHRcdC8vIFJlLXJ1biB0aGUgZGVmYXVsdCBFU00gcmVzb2x1dGlvbiByb290ZWQgKmluc2lkZSogdGhlIGFyY2hpdmVkXG5cdFx0XHRcdC8vIHBhY2thZ2UgKHZpYSBpdHMgcGFja2FnZS5qc29uKSBzbyBOb2RlIHJlc29sdmVzIHRoZSByZXF1ZXN0IGFzIGFcblx0XHRcdFx0Ly8gcGFja2FnZSBzZWxmLXJlZmVyZW5jZSwgYXBwbHlpbmcgdGhlIHJlYWwgJ2V4cG9ydHMnLydtYWluJyBmaWVsZHMgYW5kXG5cdFx0XHRcdC8vIEVTTSBjb25kaXRpb25zICgnaW1wb3J0JyBvdmVyICdyZXF1aXJlJykuXG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3Qgc2VsZlJlZiA9IGF3YWl0IG5leHRSZXNvbHZlKHNwZWNpZmllciwgeyAuLi5jb250ZXh0LCBwYXJlbnRVUkw6IHBhdGhUb0ZpbGVVUkwocGFja2FnZUpzb25QYXRoKS5ocmVmIH0pO1xuXHRcdFx0XHRcdC8vIEEgcGFja2FnZSB3aXRob3V0IGFuICdleHBvcnRzJyBmaWVsZCBkb2VzIG5vdCBzZWxmLXJlZmVyZW5jZTogTm9kZVxuXHRcdFx0XHRcdC8vIGZhbGxzIGJhY2sgdG8gYSAnbm9kZV9tb2R1bGVzJyB3YWxrIGZyb20gdGhlIHBhY2thZ2UgZGlyIHRoYXQgY2FuXG5cdFx0XHRcdFx0Ly8gY2xpbWIgKm91dCogb2YgdGhlIGFyY2hpdmUgaW50byBhbiBvdXRlciAnbm9kZV9tb2R1bGVzJyAoZS5nLiB0aGVcblx0XHRcdFx0XHQvLyBjaGVja291dCB0aGUgYXBwIGlzIG5lc3RlZCB1bmRlcikuIE9ubHkgYWNjZXB0IGEgcmVzdWx0IHRoYXQgc3RheXNcblx0XHRcdFx0XHQvLyBpbnNpZGUgdGhlIGFwcCByZXNvdXJjZXM7IG90aGVyd2lzZSBmYWxsIGJhY2sgdG8gdGhlIGRpcmVjdCxcblx0XHRcdFx0XHQvLyBlc2NhcGUtcHJvb2YgYXJjaGl2ZSByZXNvbHV0aW9uIGJlbG93LlxuXHRcdFx0XHRcdGxldCBzZWxmUmVmUGF0aDtcblx0XHRcdFx0XHR0cnkgeyBzZWxmUmVmUGF0aCA9IG5vcm1hbGl6ZURyaXZlTGV0dGVyKGZpbGVVUkxUb1BhdGgoc2VsZlJlZi51cmwpKTsgfSBjYXRjaCB7IHNlbGZSZWZQYXRoID0gdW5kZWZpbmVkOyB9XG5cdFx0XHRcdFx0aWYgKHNlbGZSZWZQYXRoICYmIHNlbGZSZWZQYXRoLnN0YXJ0c1dpdGgocmVzb3VyY2VzUGF0aCkpIHtcblx0XHRcdFx0XHRcdGlmICh0cmFjZSkgeyB0cmFjZSgnICBzZWxmLXJlZiAtPiAnICsgc2VsZlJlZi51cmwgKyAnIChpbiBhcHAsIEFDQ0VQVCknKTsgfVxuXHRcdFx0XHRcdFx0cmV0dXJuIHNlbGZSZWY7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICh0cmFjZSkgeyB0cmFjZSgnICBzZWxmLXJlZiAtPiAnICsgc2VsZlJlZi51cmwgKyAnIChlc2NhcGVkIGFwcCwgcmVqZWN0KScpOyB9XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdC8vIEZhbGwgdGhyb3VnaCB0byBkaXJlY3QgcmVzb2x1dGlvbiBiZWxvdy5cblx0XHRcdFx0XHRpZiAodHJhY2UpIHsgdHJhY2UoJyAgc2VsZi1yZWYgLT4gPHRocm93PiAoJyArIChlcnIgJiYgKGVyci5jb2RlIHx8IGVyci5tZXNzYWdlKSkgKyAnKScpOyB9XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSBhc2FyUmVxdWlyZS5yZXNvbHZlKCcuLycgKyBzcGVjaWZpZXIpO1xuXHRcdFx0XHRjb25zdCB1cmwgPSBwYXRoVG9GaWxlVVJMKHJlc29sdmVkKS5ocmVmO1xuXHRcdFx0XHRpZiAodHJhY2UpIHsgdHJhY2UoJyAgZGlyZWN0IC0+ICcgKyB1cmwgKyAnIChBQ0NFUFQpJyk7IH1cblx0XHRcdFx0cmV0dXJuIHsgdXJsLCBzaG9ydENpcmN1aXQ6IHRydWUgfTtcblx0XHRcdH0gZWxzZSBpZiAodHJhY2UpIHtcblx0XHRcdFx0dHJhY2UoJ2RlZmVyIFwiJyArIHNwZWNpZmllciArICdcIiAocGFyZW50IG91dHNpZGUgYXBwIHJlc291cmNlczogJyArIGNvbnRleHQucGFyZW50VVJMICsgJyknKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBEZWZlciB0byB0aGUgbmV4dCBob29rIGluIHRoZSBjaGFpbiwgd2hpY2ggd291bGQgYmUgdGhlXG5cdFx0Ly8gTm9kZS5qcyBkZWZhdWx0IHJlc29sdmUgaWYgdGhpcyBpcyB0aGUgbGFzdCB1c2VyLXNwZWNpZmllZCBsb2FkZXIuXG5cdFx0cmV0dXJuIG5leHRSZXNvbHZlKHNwZWNpZmllciwgY29udGV4dCk7XG5cdH1gO1xuXG5cdC8vIE9wdC1pbiByZXNvbHV0aW9uIHRyYWNpbmcsIG9mZiBieSBkZWZhdWx0LiBTZXQgVlNDT0RFX0FTQVJfVFJBQ0UgdG8gZW5hYmxlOlxuXHQvLyAgIFZTQ09ERV9BU0FSX1RSQUNFPTEgICAgICAgICAgICAtPiB0cmFjZSB0byBzdGRlcnIgKGFsc28gJ1widHJ1ZVwiJywgJ1wib25cIicsICdcInN0ZGVyclwiJylcblx0Ly8gICBWU0NPREVfQVNBUl9UUkFDRT0vcGF0aC94LmxvZyAgLT4gYXBwZW5kIHRoZSB0cmFjZSB0byB0aGF0IGZpbGVcblx0Y29uc3QgdHJhY2VTaW5rID0gcHJvY2Vzcy5lbnZbJ1ZTQ09ERV9BU0FSX1RSQUNFJ10gfHwgdW5kZWZpbmVkO1xuXHQvLyBVbmxpa2UgcHJvY2Vzcy5yZXNvdXJjZXNQYXRoLCBpbXBvcnQubWV0YS5kaXJuYW1lIHJlZmxlY3RzIE5vZGUncyBqdW5jdGlvbi1yZXNvbHZlZCBtb2R1bGUgcGF0aC5cblx0Y29uc3QgYXBwUm9vdCA9IGRpcm5hbWUoaW1wb3J0Lm1ldGEuZGlybmFtZSk7XG5cblx0cmVnaXN0ZXIoYGRhdGE6dGV4dC9qYXZhc2NyaXB0O2Jhc2U2NCwke0J1ZmZlci5mcm9tKGpzQ29kZSkudG9TdHJpbmcoJ2Jhc2U2NCcpfWAsIGltcG9ydC5tZXRhLnVybCwge1xuXHRcdGRhdGE6IHByb2Nlc3MuZW52WydWU0NPREVfREVWJ10gPyB7fSA6IHtcblx0XHRcdHJlc291cmNlc1BhdGg6IGFwcFJvb3QsXG5cdFx0XHRhc2FyUGF0aDogam9pbihhcHBSb290LCAnbm9kZV9tb2R1bGVzLmFzYXInKSxcblx0XHRcdHRyYWNlU2luayxcblx0XHR9XG5cdH0pO1xufVxuXG5lbmFibGVBU0FSU3VwcG9ydCgpO1xuXG4vLyNyZWdpb24gTkxTIGhlbHBlcnNcblxubGV0IHNldHVwTkxTUmVzdWx0OiBQcm9taXNlPElOTFNDb25maWd1cmF0aW9uIHwgdW5kZWZpbmVkPiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuZnVuY3Rpb24gc2V0dXBOTFMoKTogUHJvbWlzZTxJTkxTQ29uZmlndXJhdGlvbiB8IHVuZGVmaW5lZD4ge1xuXHRpZiAoIXNldHVwTkxTUmVzdWx0KSB7XG5cdFx0c2V0dXBOTFNSZXN1bHQgPSBkb1NldHVwTkxTKCk7XG5cdH1cblxuXHRyZXR1cm4gc2V0dXBOTFNSZXN1bHQ7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGRvU2V0dXBOTFMoKTogUHJvbWlzZTxJTkxTQ29uZmlndXJhdGlvbiB8IHVuZGVmaW5lZD4ge1xuXHRwZXJmb3JtYW5jZS5tYXJrKCdjb2RlL3dpbGxMb2FkTmxzJyk7XG5cblx0bGV0IG5sc0NvbmZpZzogSU5MU0NvbmZpZ3VyYXRpb24gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0bGV0IG1lc3NhZ2VzRmlsZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRpZiAocHJvY2Vzcy5lbnZbJ1ZTQ09ERV9OTFNfQ09ORklHJ10pIHtcblx0XHR0cnkge1xuXHRcdFx0bmxzQ29uZmlnID0gSlNPTi5wYXJzZShwcm9jZXNzLmVudlsnVlNDT0RFX05MU19DT05GSUcnXSk7XG5cdFx0XHRpZiAobmxzQ29uZmlnPy5sYW5ndWFnZVBhY2s/Lm1lc3NhZ2VzRmlsZSkge1xuXHRcdFx0XHRtZXNzYWdlc0ZpbGUgPSBubHNDb25maWcubGFuZ3VhZ2VQYWNrLm1lc3NhZ2VzRmlsZTtcblx0XHRcdH0gZWxzZSBpZiAobmxzQ29uZmlnPy5kZWZhdWx0TWVzc2FnZXNGaWxlKSB7XG5cdFx0XHRcdG1lc3NhZ2VzRmlsZSA9IG5sc0NvbmZpZy5kZWZhdWx0TWVzc2FnZXNGaWxlO1xuXHRcdFx0fVxuXG5cdFx0XHRnbG9iYWxUaGlzLl9WU0NPREVfTkxTX0xBTkdVQUdFID0gbmxzQ29uZmlnPy5yZXNvbHZlZExhbmd1YWdlO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoYEVycm9yIHJlYWRpbmcgVlNDT0RFX05MU19DT05GSUcgZnJvbSBlbnZpcm9ubWVudDogJHtlfWApO1xuXHRcdH1cblx0fVxuXG5cdGlmIChcblx0XHRwcm9jZXNzLmVudlsnVlNDT0RFX0RFViddIHx8XHQvLyBubyBOTFMgc3VwcG9ydCBpbiBkZXYgbW9kZVxuXHRcdCFtZXNzYWdlc0ZpbGVcdFx0XHRcdFx0Ly8gbm8gTkxTIG1lc3NhZ2VzIGZpbGVcblx0KSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHRyeSB7XG5cdFx0Z2xvYmFsVGhpcy5fVlNDT0RFX05MU19NRVNTQUdFUyA9IEpTT04ucGFyc2UoKGF3YWl0IGZzLnByb21pc2VzLnJlYWRGaWxlKG1lc3NhZ2VzRmlsZSkpLnRvU3RyaW5nKCkpO1xuXHR9IGNhdGNoIChlcnJvcikge1xuXHRcdGNvbnNvbGUuZXJyb3IoYEVycm9yIHJlYWRpbmcgTkxTIG1lc3NhZ2VzIGZpbGUgJHttZXNzYWdlc0ZpbGV9OiAke2Vycm9yfWApO1xuXG5cdFx0Ly8gTWFyayBhcyBjb3JydXB0OiB0aGlzIHdpbGwgcmUtY3JlYXRlIHRoZSBsYW5ndWFnZSBwYWNrIGNhY2hlIG5leHQgc3RhcnR1cFxuXHRcdGlmIChubHNDb25maWc/Lmxhbmd1YWdlUGFjaz8uY29ycnVwdE1hcmtlckZpbGUpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGZzLnByb21pc2VzLndyaXRlRmlsZShubHNDb25maWcubGFuZ3VhZ2VQYWNrLmNvcnJ1cHRNYXJrZXJGaWxlLCAnY29ycnVwdGVkJyk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRjb25zb2xlLmVycm9yKGBFcnJvciB3cml0aW5nIGNvcnJ1cHRlZCBOTFMgbWFya2VyIGZpbGU6ICR7ZXJyb3J9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRmFsbGJhY2sgdG8gdGhlIGRlZmF1bHQgbWVzc2FnZSBmaWxlIHRvIGVuc3VyZSBlbmdsaXNoIHRyYW5zbGF0aW9uIGF0IGxlYXN0XG5cdFx0aWYgKG5sc0NvbmZpZz8uZGVmYXVsdE1lc3NhZ2VzRmlsZSAmJiBubHNDb25maWcuZGVmYXVsdE1lc3NhZ2VzRmlsZSAhPT0gbWVzc2FnZXNGaWxlKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRnbG9iYWxUaGlzLl9WU0NPREVfTkxTX01FU1NBR0VTID0gSlNPTi5wYXJzZSgoYXdhaXQgZnMucHJvbWlzZXMucmVhZEZpbGUobmxzQ29uZmlnLmRlZmF1bHRNZXNzYWdlc0ZpbGUpKS50b1N0cmluZygpKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IoYEVycm9yIHJlYWRpbmcgZGVmYXVsdCBOTFMgbWVzc2FnZXMgZmlsZSAke25sc0NvbmZpZy5kZWZhdWx0TWVzc2FnZXNGaWxlfTogJHtlcnJvcn1gKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwZXJmb3JtYW5jZS5tYXJrKCdjb2RlL2RpZExvYWRObHMnKTtcblxuXHRyZXR1cm4gbmxzQ29uZmlnO1xufVxuXG4vLyNlbmRyZWdpb25cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGJvb3RzdHJhcEVTTSgpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHQvLyBOTFNcblx0YXdhaXQgc2V0dXBOTFMoKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksUUFBUTtBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFNBQVMsWUFBWTtBQUM5QixTQUFTLFNBQVMsV0FBVztBQUM3QixPQUFPO0FBQ1AsWUFBWSxpQkFBaUI7QUFJN0IsV0FBVyx1QkFBdUIsRUFBRSxHQUFHLFFBQVE7QUFDL0MsV0FBVyx1QkFBdUIsRUFBRSxHQUFHLElBQUk7QUFDM0MsV0FBVyxvQkFBb0IsWUFBWTtBQXVCM0MsU0FBUyxvQkFBMEI7QUFDbEMsTUFBSSxDQUFDLFFBQVEsSUFBSSxzQkFBc0IsS0FBSyxDQUFDLFFBQVEsU0FBUyxVQUFVLEdBQUc7QUFDMUU7QUFBQSxFQUNEO0FBRUEsUUFBTSxTQUFTO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQTJMZixRQUFNLFlBQVksUUFBUSxJQUFJLG1CQUFtQixLQUFLO0FBRXRELFFBQU0sVUFBVSxRQUFRLFlBQVksT0FBTztBQUUzQyxXQUFTLCtCQUErQixPQUFPLEtBQUssTUFBTSxFQUFFLFNBQVMsUUFBUSxDQUFDLElBQUksWUFBWSxLQUFLO0FBQUEsSUFDbEcsTUFBTSxRQUFRLElBQUksWUFBWSxJQUFJLENBQUMsSUFBSTtBQUFBLE1BQ3RDLGVBQWU7QUFBQSxNQUNmLFVBQVUsS0FBSyxTQUFTLG1CQUFtQjtBQUFBLE1BQzNDO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUNGO0FBRUEsa0JBQWtCO0FBSWxCLElBQUksaUJBQXFFO0FBRXpFLFNBQVMsV0FBbUQ7QUFDM0QsTUFBSSxDQUFDLGdCQUFnQjtBQUNwQixxQkFBaUIsV0FBVztBQUFBLEVBQzdCO0FBRUEsU0FBTztBQUNSO0FBRUEsZUFBZSxhQUFxRDtBQUNuRSxjQUFZLEtBQUssa0JBQWtCO0FBRW5DLE1BQUksWUFBMkM7QUFFL0MsTUFBSTtBQUNKLE1BQUksUUFBUSxJQUFJLG1CQUFtQixHQUFHO0FBQ3JDLFFBQUk7QUFDSCxrQkFBWSxLQUFLLE1BQU0sUUFBUSxJQUFJLG1CQUFtQixDQUFDO0FBQ3ZELFVBQUksV0FBVyxjQUFjLGNBQWM7QUFDMUMsdUJBQWUsVUFBVSxhQUFhO0FBQUEsTUFDdkMsV0FBVyxXQUFXLHFCQUFxQjtBQUMxQyx1QkFBZSxVQUFVO0FBQUEsTUFDMUI7QUFFQSxpQkFBVyx1QkFBdUIsV0FBVztBQUFBLElBQzlDLFNBQVMsR0FBRztBQUNYLGNBQVEsTUFBTSxxREFBcUQsQ0FBQyxFQUFFO0FBQUEsSUFDdkU7QUFBQSxFQUNEO0FBRUEsTUFDQyxRQUFRLElBQUksWUFBWTtBQUFBLEVBQ3hCLENBQUMsY0FDQTtBQUNELFdBQU87QUFBQSxFQUNSO0FBRUEsTUFBSTtBQUNILGVBQVcsdUJBQXVCLEtBQUssT0FBTyxNQUFNLEdBQUcsU0FBUyxTQUFTLFlBQVksR0FBRyxTQUFTLENBQUM7QUFBQSxFQUNuRyxTQUFTLE9BQU87QUFDZixZQUFRLE1BQU0sbUNBQW1DLFlBQVksS0FBSyxLQUFLLEVBQUU7QUFHekUsUUFBSSxXQUFXLGNBQWMsbUJBQW1CO0FBQy9DLFVBQUk7QUFDSCxjQUFNLEdBQUcsU0FBUyxVQUFVLFVBQVUsYUFBYSxtQkFBbUIsV0FBVztBQUFBLE1BQ2xGLFNBQVNBLFFBQU87QUFDZixnQkFBUSxNQUFNLDRDQUE0Q0EsTUFBSyxFQUFFO0FBQUEsTUFDbEU7QUFBQSxJQUNEO0FBR0EsUUFBSSxXQUFXLHVCQUF1QixVQUFVLHdCQUF3QixjQUFjO0FBQ3JGLFVBQUk7QUFDSCxtQkFBVyx1QkFBdUIsS0FBSyxPQUFPLE1BQU0sR0FBRyxTQUFTLFNBQVMsVUFBVSxtQkFBbUIsR0FBRyxTQUFTLENBQUM7QUFBQSxNQUNwSCxTQUFTQSxRQUFPO0FBQ2YsZ0JBQVEsTUFBTSwyQ0FBMkMsVUFBVSxtQkFBbUIsS0FBS0EsTUFBSyxFQUFFO0FBQUEsTUFDbkc7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUVBLGNBQVksS0FBSyxpQkFBaUI7QUFFbEMsU0FBTztBQUNSO0FBSUEsZUFBc0IsZUFBOEI7QUFHbkQsUUFBTSxTQUFTO0FBQ2hCOyIsCiAgIm5hbWVzIjogWyJlcnJvciJdCn0K
