import { execFile } from "child_process";
import { existsSync } from "fs";
import * as http from "http";
import { homedir } from "os";
import { join } from "path";
import { ollamaTagsUrl, parseOllamaListOutput, parseOllamaTagsJson, uniqueModelNames } from "../common/ollamaList.js";
const OLLAMA_LIST_TIMEOUT_MS = 8e3;
const OLLAMA_HTTP_TIMEOUT_MS = 4e3;
async function listOllamaModelsFromMachine(baseUrl) {
  const fromCli = await listOllamaModelsFromCli();
  if (fromCli.length > 0) {
    return fromCli;
  }
  return listOllamaModelsFromHttp(baseUrl);
}
async function listOllamaModelsFromCli() {
  const env = ollamaProcessEnv();
  const binaries = await resolveOllamaBinaries(env);
  for (const binary of binaries) {
    try {
      const stdout = await execFileUtf8(binary, ["list"], env);
      const names = parseOllamaListOutput(stdout);
      if (names.length > 0) {
        return names;
      }
    } catch {
      continue;
    }
  }
  return [];
}
async function listOllamaModelsFromHttp(baseUrl) {
  const urls = uniqueModelNames([
    baseUrl ? ollamaTagsUrl(baseUrl) : "",
    ollamaTagsUrl(process.env.OLLAMA_HOST ? hostToBaseUrl(process.env.OLLAMA_HOST) : "http://127.0.0.1:11434/v1"),
    "http://127.0.0.1:11434/api/tags",
    "http://localhost:11434/api/tags"
  ]);
  for (const url of urls) {
    try {
      const names = parseOllamaTagsJson(await httpGetJson(url));
      if (names.length > 0) {
        return names;
      }
    } catch {
      continue;
    }
  }
  return [];
}
function hostToBaseUrl(host) {
  if (/^https?:\/\//i.test(host)) {
    return host;
  }
  return `http://${host}`;
}
function ollamaProcessEnv() {
  const extra = ollamaInstallDirs().join(process.platform === "win32" ? ";" : ":");
  const pathKey = process.platform === "win32" && process.env.Path && !process.env.PATH ? "Path" : "PATH";
  const current = process.env[pathKey] || process.env.PATH || process.env.Path || "";
  return {
    ...process.env,
    [pathKey]: extra ? `${extra}${process.platform === "win32" ? ";" : ":"}${current}` : current
  };
}
function ollamaInstallDirs() {
  if (process.platform !== "win32") {
    return ["/usr/local/bin", "/opt/homebrew/bin"];
  }
  return uniqueModelNames([
    join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "Programs", "Ollama"),
    join(homedir(), "AppData", "Local", "Programs", "Ollama"),
    join(process.env.ProgramFiles || "C:\\Program Files", "Ollama"),
    join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Ollama")
  ]);
}
async function resolveOllamaBinaries(env) {
  const exe = process.platform === "win32" ? "ollama.exe" : "ollama";
  const ordered = [];
  for (const dir of ollamaInstallDirs()) {
    ordered.push(join(dir, exe));
  }
  if (process.platform === "win32") {
    try {
      const whereOutput = await execFileUtf8("where.exe", ["ollama"], env);
      for (const line of whereOutput.split(/\r?\n/)) {
        const candidate = line.trim();
        if (candidate) {
          ordered.push(candidate);
        }
      }
    } catch {
    }
  }
  ordered.push(process.platform === "win32" ? "ollama.exe" : "ollama");
  return uniqueModelNames(ordered.filter((candidate) => candidate === "ollama" || candidate === "ollama.exe" || existsSync(candidate)));
}
function execFileUtf8(command, args, env) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      timeout: OLLAMA_LIST_TIMEOUT_MS,
      windowsHide: true,
      env,
      encoding: "utf8",
      maxBuffer: 2 * 1024 * 1024
    }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(`${stdout ?? ""}
${stderr ?? ""}`);
    });
  });
}
function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout: OLLAMA_HTTP_TIMEOUT_MS }, (response) => {
      if (response.statusCode && response.statusCode >= 400) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      const chunks = [];
      response.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch (error) {
          reject(error);
        }
      });
      response.on("error", reject);
    });
    request.on("timeout", () => {
      request.destroy();
      reject(new Error(`timeout ${url}`));
    });
    request.on("error", reject);
  });
}
export {
  listOllamaModelsFromCli,
  listOllamaModelsFromHttp,
  listOllamaModelsFromMachine
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcbmF0aXZlXFxub2RlXFxvbGxhbWFDbGkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBleGVjRmlsZSB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0IHsgZXhpc3RzU3luYyB9IGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIGh0dHAgZnJvbSAnaHR0cCc7XG5pbXBvcnQgeyBob21lZGlyIH0gZnJvbSAnb3MnO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgb2xsYW1hVGFnc1VybCwgcGFyc2VPbGxhbWFMaXN0T3V0cHV0LCBwYXJzZU9sbGFtYVRhZ3NKc29uLCB1bmlxdWVNb2RlbE5hbWVzIH0gZnJvbSAnLi4vY29tbW9uL29sbGFtYUxpc3QuanMnO1xuXG5jb25zdCBPTExBTUFfTElTVF9USU1FT1VUX01TID0gOF8wMDA7XG5jb25zdCBPTExBTUFfSFRUUF9USU1FT1VUX01TID0gNF8wMDA7XG5cbi8qKlxuICogTGlzdCBpbnN0YWxsZWQgT2xsYW1hIG1vZGVscyB0aGUgc2FtZSB3YXkgYG9sbGFtYSBsaXN0YCBkb2VzIGluIGEgdGVybWluYWw6XG4gKiByZXNvbHZlIHRoZSByZWFsIGBvbGxhbWEuZXhlYCAoR1VJIGFwcHMgb2Z0ZW4gbGFjayBpdCBvbiBQQVRIKSwgcnVuIGBsaXN0YCxcbiAqIHRoZW4gZmFsbCBiYWNrIHRvIGBHRVQgL2FwaS90YWdzYCBvbiAxMjcuMC4wLjEuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBsaXN0T2xsYW1hTW9kZWxzRnJvbU1hY2hpbmUoYmFzZVVybD86IHN0cmluZyk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0Y29uc3QgZnJvbUNsaSA9IGF3YWl0IGxpc3RPbGxhbWFNb2RlbHNGcm9tQ2xpKCk7XG5cdGlmIChmcm9tQ2xpLmxlbmd0aCA+IDApIHtcblx0XHRyZXR1cm4gZnJvbUNsaTtcblx0fVxuXHRyZXR1cm4gbGlzdE9sbGFtYU1vZGVsc0Zyb21IdHRwKGJhc2VVcmwpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbGlzdE9sbGFtYU1vZGVsc0Zyb21DbGkoKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuXHRjb25zdCBlbnYgPSBvbGxhbWFQcm9jZXNzRW52KCk7XG5cdGNvbnN0IGJpbmFyaWVzID0gYXdhaXQgcmVzb2x2ZU9sbGFtYUJpbmFyaWVzKGVudik7XG5cdGZvciAoY29uc3QgYmluYXJ5IG9mIGJpbmFyaWVzKSB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHN0ZG91dCA9IGF3YWl0IGV4ZWNGaWxlVXRmOChiaW5hcnksIFsnbGlzdCddLCBlbnYpO1xuXHRcdFx0Y29uc3QgbmFtZXMgPSBwYXJzZU9sbGFtYUxpc3RPdXRwdXQoc3Rkb3V0KTtcblx0XHRcdGlmIChuYW1lcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHJldHVybiBuYW1lcztcblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gW107XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBsaXN0T2xsYW1hTW9kZWxzRnJvbUh0dHAoYmFzZVVybD86IHN0cmluZyk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0Y29uc3QgdXJscyA9IHVuaXF1ZU1vZGVsTmFtZXMoW1xuXHRcdGJhc2VVcmwgPyBvbGxhbWFUYWdzVXJsKGJhc2VVcmwpIDogJycsXG5cdFx0b2xsYW1hVGFnc1VybChwcm9jZXNzLmVudi5PTExBTUFfSE9TVCA/IGhvc3RUb0Jhc2VVcmwocHJvY2Vzcy5lbnYuT0xMQU1BX0hPU1QpIDogJ2h0dHA6Ly8xMjcuMC4wLjE6MTE0MzQvdjEnKSxcblx0XHQnaHR0cDovLzEyNy4wLjAuMToxMTQzNC9hcGkvdGFncycsXG5cdFx0J2h0dHA6Ly9sb2NhbGhvc3Q6MTE0MzQvYXBpL3RhZ3MnLFxuXHRdKTtcblx0Zm9yIChjb25zdCB1cmwgb2YgdXJscykge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBuYW1lcyA9IHBhcnNlT2xsYW1hVGFnc0pzb24oYXdhaXQgaHR0cEdldEpzb24odXJsKSk7XG5cdFx0XHRpZiAobmFtZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRyZXR1cm4gbmFtZXM7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIFtdO1xufVxuXG5mdW5jdGlvbiBob3N0VG9CYXNlVXJsKGhvc3Q6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmICgvXmh0dHBzPzpcXC9cXC8vaS50ZXN0KGhvc3QpKSB7XG5cdFx0cmV0dXJuIGhvc3Q7XG5cdH1cblx0cmV0dXJuIGBodHRwOi8vJHtob3N0fWA7XG59XG5cbmZ1bmN0aW9uIG9sbGFtYVByb2Nlc3NFbnYoKTogTm9kZUpTLlByb2Nlc3NFbnYge1xuXHRjb25zdCBleHRyYSA9IG9sbGFtYUluc3RhbGxEaXJzKCkuam9pbihwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInID8gJzsnIDogJzonKTtcblx0Y29uc3QgcGF0aEtleSA9IHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMicgJiYgcHJvY2Vzcy5lbnYuUGF0aCAmJiAhcHJvY2Vzcy5lbnYuUEFUSCA/ICdQYXRoJyA6ICdQQVRIJztcblx0Y29uc3QgY3VycmVudCA9IHByb2Nlc3MuZW52W3BhdGhLZXldIHx8IHByb2Nlc3MuZW52LlBBVEggfHwgcHJvY2Vzcy5lbnYuUGF0aCB8fCAnJztcblx0cmV0dXJuIHtcblx0XHQuLi5wcm9jZXNzLmVudixcblx0XHRbcGF0aEtleV06IGV4dHJhID8gYCR7ZXh0cmF9JHtwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInID8gJzsnIDogJzonfSR7Y3VycmVudH1gIDogY3VycmVudCxcblx0fTtcbn1cblxuZnVuY3Rpb24gb2xsYW1hSW5zdGFsbERpcnMoKTogc3RyaW5nW10ge1xuXHRpZiAocHJvY2Vzcy5wbGF0Zm9ybSAhPT0gJ3dpbjMyJykge1xuXHRcdHJldHVybiBbJy91c3IvbG9jYWwvYmluJywgJy9vcHQvaG9tZWJyZXcvYmluJ107XG5cdH1cblx0cmV0dXJuIHVuaXF1ZU1vZGVsTmFtZXMoW1xuXHRcdGpvaW4ocHJvY2Vzcy5lbnYuTE9DQUxBUFBEQVRBIHx8IGpvaW4oaG9tZWRpcigpLCAnQXBwRGF0YScsICdMb2NhbCcpLCAnUHJvZ3JhbXMnLCAnT2xsYW1hJyksXG5cdFx0am9pbihob21lZGlyKCksICdBcHBEYXRhJywgJ0xvY2FsJywgJ1Byb2dyYW1zJywgJ09sbGFtYScpLFxuXHRcdGpvaW4ocHJvY2Vzcy5lbnYuUHJvZ3JhbUZpbGVzIHx8ICdDOlxcXFxQcm9ncmFtIEZpbGVzJywgJ09sbGFtYScpLFxuXHRcdGpvaW4ocHJvY2Vzcy5lbnZbJ1Byb2dyYW1GaWxlcyh4ODYpJ10gfHwgJ0M6XFxcXFByb2dyYW0gRmlsZXMgKHg4NiknLCAnT2xsYW1hJyksXG5cdF0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiByZXNvbHZlT2xsYW1hQmluYXJpZXMoZW52OiBOb2RlSlMuUHJvY2Vzc0Vudik6IFByb21pc2U8c3RyaW5nW10+IHtcblx0Y29uc3QgZXhlID0gcHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJyA/ICdvbGxhbWEuZXhlJyA6ICdvbGxhbWEnO1xuXHRjb25zdCBvcmRlcmVkOiBzdHJpbmdbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGRpciBvZiBvbGxhbWFJbnN0YWxsRGlycygpKSB7XG5cdFx0b3JkZXJlZC5wdXNoKGpvaW4oZGlyLCBleGUpKTtcblx0fVxuXHRpZiAocHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJykge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB3aGVyZU91dHB1dCA9IGF3YWl0IGV4ZWNGaWxlVXRmOCgnd2hlcmUuZXhlJywgWydvbGxhbWEnXSwgZW52KTtcblx0XHRcdGZvciAoY29uc3QgbGluZSBvZiB3aGVyZU91dHB1dC5zcGxpdCgvXFxyP1xcbi8pKSB7XG5cdFx0XHRcdGNvbnN0IGNhbmRpZGF0ZSA9IGxpbmUudHJpbSgpO1xuXHRcdFx0XHRpZiAoY2FuZGlkYXRlKSB7XG5cdFx0XHRcdFx0b3JkZXJlZC5wdXNoKGNhbmRpZGF0ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIFBBVEggbWF5IG5vdCBjb250YWluIG9sbGFtYTsgdGhlIGluc3RhbGwtZGlyIGNhbmRpZGF0ZXMgc3RpbGwgYXBwbHkuXG5cdFx0fVxuXHR9XG5cdG9yZGVyZWQucHVzaChwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInID8gJ29sbGFtYS5leGUnIDogJ29sbGFtYScpO1xuXHRyZXR1cm4gdW5pcXVlTW9kZWxOYW1lcyhvcmRlcmVkLmZpbHRlcihjYW5kaWRhdGUgPT4gY2FuZGlkYXRlID09PSAnb2xsYW1hJyB8fCBjYW5kaWRhdGUgPT09ICdvbGxhbWEuZXhlJyB8fCBleGlzdHNTeW5jKGNhbmRpZGF0ZSkpKTtcbn1cblxuZnVuY3Rpb24gZXhlY0ZpbGVVdGY4KGNvbW1hbmQ6IHN0cmluZywgYXJnczogc3RyaW5nW10sIGVudjogTm9kZUpTLlByb2Nlc3NFbnYpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdGV4ZWNGaWxlKGNvbW1hbmQsIGFyZ3MsIHtcblx0XHRcdHRpbWVvdXQ6IE9MTEFNQV9MSVNUX1RJTUVPVVRfTVMsXG5cdFx0XHR3aW5kb3dzSGlkZTogdHJ1ZSxcblx0XHRcdGVudixcblx0XHRcdGVuY29kaW5nOiAndXRmOCcsXG5cdFx0XHRtYXhCdWZmZXI6IDIgKiAxMDI0ICogMTAyNCxcblx0XHR9LCAoZXJyb3IsIHN0ZG91dCwgc3RkZXJyKSA9PiB7XG5cdFx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdFx0cmVqZWN0KGVycm9yKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0cmVzb2x2ZShgJHtzdGRvdXQgPz8gJyd9XFxuJHtzdGRlcnIgPz8gJyd9YCk7XG5cdFx0fSk7XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBodHRwR2V0SnNvbih1cmw6IHN0cmluZyk6IFByb21pc2U8dW5rbm93bj4ge1xuXHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBodHRwLmdldCh1cmwsIHsgdGltZW91dDogT0xMQU1BX0hUVFBfVElNRU9VVF9NUyB9LCByZXNwb25zZSA9PiB7XG5cdFx0XHRpZiAocmVzcG9uc2Uuc3RhdHVzQ29kZSAmJiByZXNwb25zZS5zdGF0dXNDb2RlID49IDQwMCkge1xuXHRcdFx0XHRyZXNwb25zZS5yZXN1bWUoKTtcblx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcihgSFRUUCAke3Jlc3BvbnNlLnN0YXR1c0NvZGV9YCkpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjaHVua3M6IEJ1ZmZlcltdID0gW107XG5cdFx0XHRyZXNwb25zZS5vbignZGF0YScsIGNodW5rID0+IGNodW5rcy5wdXNoKEJ1ZmZlci5pc0J1ZmZlcihjaHVuaykgPyBjaHVuayA6IEJ1ZmZlci5mcm9tKGNodW5rKSkpO1xuXHRcdFx0cmVzcG9uc2Uub24oJ2VuZCcsICgpID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRyZXNvbHZlKEpTT04ucGFyc2UoQnVmZmVyLmNvbmNhdChjaHVua3MpLnRvU3RyaW5nKCd1dGY4JykpKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRyZWplY3QoZXJyb3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHJlc3BvbnNlLm9uKCdlcnJvcicsIHJlamVjdCk7XG5cdFx0fSk7XG5cdFx0cmVxdWVzdC5vbigndGltZW91dCcsICgpID0+IHtcblx0XHRcdHJlcXVlc3QuZGVzdHJveSgpO1xuXHRcdFx0cmVqZWN0KG5ldyBFcnJvcihgdGltZW91dCAke3VybH1gKSk7XG5cdFx0fSk7XG5cdFx0cmVxdWVzdC5vbignZXJyb3InLCByZWplY3QpO1xuXHR9KTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsa0JBQWtCO0FBQzNCLFlBQVksVUFBVTtBQUN0QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsZUFBZSx1QkFBdUIscUJBQXFCLHdCQUF3QjtBQUU1RixNQUFNLHlCQUF5QjtBQUMvQixNQUFNLHlCQUF5QjtBQU8vQixlQUFzQiw0QkFBNEIsU0FBcUM7QUFDdEYsUUFBTSxVQUFVLE1BQU0sd0JBQXdCO0FBQzlDLE1BQUksUUFBUSxTQUFTLEdBQUc7QUFDdkIsV0FBTztBQUFBLEVBQ1I7QUFDQSxTQUFPLHlCQUF5QixPQUFPO0FBQ3hDO0FBRUEsZUFBc0IsMEJBQTZDO0FBQ2xFLFFBQU0sTUFBTSxpQkFBaUI7QUFDN0IsUUFBTSxXQUFXLE1BQU0sc0JBQXNCLEdBQUc7QUFDaEQsYUFBVyxVQUFVLFVBQVU7QUFDOUIsUUFBSTtBQUNILFlBQU0sU0FBUyxNQUFNLGFBQWEsUUFBUSxDQUFDLE1BQU0sR0FBRyxHQUFHO0FBQ3ZELFlBQU0sUUFBUSxzQkFBc0IsTUFBTTtBQUMxQyxVQUFJLE1B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
