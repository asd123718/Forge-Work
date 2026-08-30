import * as fs from "fs";
import { pathToFileURL } from "url";
import * as cp from "child_process";
import { cwd } from "../../base/common/process.js";
import { dirname, extname, resolve, join } from "../../base/common/path.js";
import { parseArgs, buildHelpMessage, buildVersionMessage, OPTIONS } from "../../platform/environment/node/argv.js";
import { createWaitMarkerFileSync } from "../../platform/environment/node/wait.js";
import { hasStdinWithoutTty, getStdinFilePath, readFromStdin } from "../../platform/environment/node/stdin.js";
import { DeferredPromise } from "../../base/common/async.js";
import { FileAccess } from "../../base/common/network.js";
const isSupportedForCmd = (optionId) => {
  switch (optionId) {
    case "user-data-dir":
    case "extensions-dir":
    case "export-default-configuration":
    case "install-source":
    case "enable-smoke-test-driver":
    case "extensions-download-dir":
    case "builtin-extensions-dir":
    case "telemetry":
      return false;
    default:
      return true;
  }
};
const isSupportedForPipe = (optionId) => {
  switch (optionId) {
    case "version":
    case "help":
    case "folder-uri":
    case "file-uri":
    case "add":
    case "diff":
    case "merge":
    case "wait":
    case "goto":
    case "reuse-window":
    case "new-window":
    case "status":
    case "install-extension":
    case "uninstall-extension":
    case "update-extensions":
    case "list-extensions":
    case "force":
    case "do-not-include-pack-dependencies":
    case "show-versions":
    case "category":
    case "verbose":
    case "remote":
    case "locate-shell-integration-path":
      return true;
    default:
      return false;
  }
};
const cliPipe = process.env["VSCODE_IPC_HOOK_CLI"];
const cliCommand = process.env["VSCODE_CLIENT_COMMAND"];
const cliCommandCwd = process.env["VSCODE_CLIENT_COMMAND_CWD"];
const cliRemoteAuthority = process.env["VSCODE_CLI_AUTHORITY"];
const cliStdInFilePath = process.env["VSCODE_STDIN_FILE_PATH"];
async function main(desc, args) {
  if (!cliPipe && !cliCommand) {
    console.log("Command is only available in WSL or inside a Visual Studio Code terminal.");
    return;
  }
  const options = { ...OPTIONS, gitCredential: { type: "string" }, openExternal: { type: "boolean" } };
  const isSupported = cliCommand ? isSupportedForCmd : isSupportedForPipe;
  for (const optionId in OPTIONS) {
    const optId = optionId;
    if (!isSupported(optId)) {
      delete options[optId];
    }
  }
  if (cliPipe) {
    options["openExternal"] = { type: "boolean" };
  }
  const errorReporter = {
    onMultipleValues: (id, usedValue) => {
      console.error(`Option '${id}' can only be defined once. Using value ${usedValue}.`);
    },
    onEmptyValue: (id) => {
      console.error(`Ignoring option '${id}': Value must not be empty.`);
    },
    onUnknownOption: (id) => {
      console.error(`Ignoring option '${id}': not supported for ${desc.executableName}.`);
    },
    onDeprecatedOption: (deprecatedOption, message) => {
      console.warn(`Option '${deprecatedOption}' is deprecated: ${message}`);
    }
  };
  const parsedArgs = parseArgs(args, options, errorReporter);
  const mapFileUri = cliRemoteAuthority ? mapFileToRemoteUri : (uri) => uri;
  const verbose = !!parsedArgs["verbose"];
  if (parsedArgs.help) {
    console.log(buildHelpMessage(desc.productName, desc.executableName, desc.version, options));
    return;
  }
  if (parsedArgs.version) {
    console.log(buildVersionMessage(desc.version, desc.commit));
    return;
  }
  if (parsedArgs["locate-shell-integration-path"]) {
    let file;
    switch (parsedArgs["locate-shell-integration-path"]) {
      // Usage: `[[ "$TERM_PROGRAM" == "vscode" ]] && . "$(code --locate-shell-integration-path bash)"`
      case "bash":
        file = "shellIntegration-bash.sh";
        break;
      // Usage: `if ($env:TERM_PROGRAM -eq "vscode") { . "$(code --locate-shell-integration-path pwsh)" }`
      case "pwsh":
        file = "shellIntegration.ps1";
        break;
      // Usage: `[[ "$TERM_PROGRAM" == "vscode" ]] && . "$(code --locate-shell-integration-path zsh)"`
      case "zsh":
        file = "shellIntegration-rc.zsh";
        break;
      // Usage: `string match -q "$TERM_PROGRAM" "vscode"; and . (code --locate-shell-integration-path fish)`
      case "fish":
        file = "shellIntegration.fish";
        break;
      default:
        throw new Error("Error using --locate-shell-integration-path: Invalid shell type");
    }
    console.log(join(getAppRoot(), "out", "vs", "workbench", "contrib", "terminal", "common", "scripts", file));
    return;
  }
  if (cliPipe) {
    if (parsedArgs["openExternal"]) {
      await openInBrowser(parsedArgs["_"], verbose);
      return;
    }
  }
  let remote = parsedArgs.remote;
  if (remote === "local" || remote === "false" || remote === "") {
    remote = null;
  }
  const folderURIs = (parsedArgs["folder-uri"] || []).map(mapFileUri);
  parsedArgs["folder-uri"] = folderURIs;
  const fileURIs = (parsedArgs["file-uri"] || []).map(mapFileUri);
  parsedArgs["file-uri"] = fileURIs;
  const inputPaths = parsedArgs["_"];
  let hasReadStdinArg = false;
  for (const input of inputPaths) {
    if (input === "-") {
      hasReadStdinArg = true;
    } else {
      translatePath(input, mapFileUri, folderURIs, fileURIs);
    }
  }
  parsedArgs["_"] = [];
  let readFromStdinPromise;
  let stdinFilePath;
  if (hasReadStdinArg && hasStdinWithoutTty()) {
    try {
      stdinFilePath = cliStdInFilePath;
      if (!stdinFilePath) {
        stdinFilePath = getStdinFilePath();
        const readFromStdinDone = new DeferredPromise();
        await readFromStdin(stdinFilePath, verbose, () => readFromStdinDone.complete());
        if (!parsedArgs.wait) {
          readFromStdinPromise = readFromStdinDone.p;
        }
      }
      translatePath(stdinFilePath, mapFileUri, folderURIs, fileURIs);
      parsedArgs["skip-add-to-recently-opened"] = true;
      console.log(`Reading from stdin via: ${stdinFilePath}`);
    } catch (e) {
      console.log(`Failed to create file to read via stdin: ${e.toString()}`);
    }
  }
  if (parsedArgs.extensionDevelopmentPath) {
    parsedArgs.extensionDevelopmentPath = parsedArgs.extensionDevelopmentPath.map((p) => mapFileUri(pathToURI(p).href));
  }
  if (parsedArgs.extensionTestsPath) {
    parsedArgs.extensionTestsPath = mapFileUri(pathToURI(parsedArgs["extensionTestsPath"]).href);
  }
  const crashReporterDirectory = parsedArgs["crash-reporter-directory"];
  if (crashReporterDirectory !== void 0 && !crashReporterDirectory.match(/^([a-zA-Z]:[\\\/])/)) {
    console.log(`The crash reporter directory '${crashReporterDirectory}' must be an absolute Windows path (e.g. c:/crashes)`);
    return;
  }
  if (cliCommand) {
    if (parsedArgs["install-extension"] !== void 0 || parsedArgs["uninstall-extension"] !== void 0 || parsedArgs["list-extensions"] || parsedArgs["update-extensions"]) {
      const cmdLine = [];
      parsedArgs["install-extension"]?.forEach((id) => cmdLine.push("--install-extension", id));
      parsedArgs["uninstall-extension"]?.forEach((id) => cmdLine.push("--uninstall-extension", id));
      ["list-extensions", "force", "show-versions", "category"].forEach((opt) => {
        const value = parsedArgs[opt];
        if (value !== void 0) {
          cmdLine.push(`--${opt}=${value}`);
        }
      });
      if (parsedArgs["update-extensions"]) {
        cmdLine.push("--update-extensions");
      }
      const childProcess = cp.fork(FileAccess.asFileUri("server-main").fsPath, cmdLine, { stdio: "inherit" });
      childProcess.on("error", (err) => console.log(err));
      return;
    }
    const newCommandline = [];
    for (const key in parsedArgs) {
      const val = parsedArgs[key];
      if (typeof val === "boolean") {
        if (val) {
          newCommandline.push("--" + key);
        }
      } else if (Array.isArray(val)) {
        for (const entry of val) {
          newCommandline.push(`--${key}=${entry.toString()}`);
        }
      } else if (val) {
        newCommandline.push(`--${key}=${val.toString()}`);
      }
    }
    if (remote !== null) {
      newCommandline.push(`--remote=${remote || cliRemoteAuthority}`);
    }
    const ext = extname(cliCommand);
    if (ext === ".bat" || ext === ".cmd") {
      const processCwd = cliCommandCwd || cwd();
      if (verbose) {
        console.log(`Invoking: cmd.exe /C ${cliCommand} ${newCommandline.join(" ")} in ${processCwd}`);
      }
      cp.spawn("cmd.exe", ["/C", cliCommand, ...newCommandline], {
        stdio: "inherit",
        cwd: processCwd
      });
    } else {
      const cliCwd = dirname(cliCommand);
      const env = { ...process.env, ELECTRON_RUN_AS_NODE: "1" };
      const versionFolder = desc.commit.substring(0, 10);
      if (fs.existsSync(join(cliCwd, versionFolder))) {
        newCommandline.unshift(`${versionFolder}/resources/app/out/cli.js`);
      } else {
        newCommandline.unshift("resources/app/out/cli.js");
      }
      if (verbose) {
        console.log(`Invoking: cd "${cliCwd}" && ELECTRON_RUN_AS_NODE=1 "${cliCommand}" "${newCommandline.join('" "')}"`);
      }
      if (runningInWSL2()) {
        if (verbose) {
          console.log(`Using pipes for output.`);
        }
        const childProcess = cp.spawn(cliCommand, newCommandline, { cwd: cliCwd, env, stdio: ["inherit", "pipe", "pipe"] });
        childProcess.stdout.on("data", (data) => process.stdout.write(data));
        childProcess.stderr.on("data", (data) => process.stderr.write(data));
      } else {
        cp.spawn(cliCommand, newCommandline, { cwd: cliCwd, env, stdio: "inherit" });
      }
    }
  } else {
    if (parsedArgs.status) {
      await sendToPipe({
        type: "status"
      }, verbose).then((res) => {
        console.log(res);
      }).catch((e) => {
        console.error("Error when requesting status:", e);
      });
      return;
    }
    if (parsedArgs["install-extension"] !== void 0 || parsedArgs["uninstall-extension"] !== void 0 || parsedArgs["list-extensions"] || parsedArgs["update-extensions"]) {
      await sendToPipe({
        type: "extensionManagement",
        list: parsedArgs["list-extensions"] ? { showVersions: parsedArgs["show-versions"], category: parsedArgs["category"] } : void 0,
        install: asExtensionIdOrVSIX(parsedArgs["install-extension"]),
        uninstall: asExtensionIdOrVSIX(parsedArgs["uninstall-extension"]),
        force: parsedArgs["force"]
      }, verbose).then((res) => {
        console.log(res);
      }).catch((e) => {
        console.error("Error when invoking the extension management command:", e);
      });
      return;
    }
    let waitMarkerFilePath = void 0;
    if (parsedArgs["wait"]) {
      if (!fileURIs.length) {
        console.log("At least one file must be provided to wait for.");
        return;
      }
      waitMarkerFilePath = createWaitMarkerFileSync(verbose);
    }
    await sendToPipe({
      type: "open",
      fileURIs,
      folderURIs,
      diffMode: parsedArgs.diff,
      mergeMode: parsedArgs.merge,
      addMode: parsedArgs.add,
      removeMode: parsedArgs.remove,
      gotoLineMode: parsedArgs.goto,
      forceReuseWindow: parsedArgs["reuse-window"],
      forceNewWindow: parsedArgs["new-window"],
      waitMarkerFilePath,
      remoteAuthority: remote
    }, verbose).catch((e) => {
      console.error("Error when invoking the open command:", e);
    });
    if (waitMarkerFilePath) {
      await waitForFileDeleted(waitMarkerFilePath);
    }
    if (readFromStdinPromise) {
      await readFromStdinPromise;
    }
    if (waitMarkerFilePath && stdinFilePath) {
      try {
        fs.unlinkSync(stdinFilePath);
      } catch (e) {
      }
    }
  }
}
function runningInWSL2() {
  if (!!process.env["WSL_DISTRO_NAME"]) {
    try {
      return cp.execSync("uname -r", { encoding: "utf8" }).includes("-microsoft-");
    } catch (_e) {
    }
  }
  return false;
}
async function waitForFileDeleted(path) {
  while (fs.existsSync(path)) {
    await new Promise((res) => setTimeout(res, 1e3));
  }
}
async function openInBrowser(args, verbose) {
  const uris = [];
  for (const location of args) {
    try {
      if (/^[a-z-]+:\/\/.+/.test(location)) {
        uris.push(new URL(location).href);
      } else {
        uris.push(pathToURI(location).href);
      }
    } catch (e) {
      console.log(`Invalid url: ${location}`);
    }
  }
  if (uris.length) {
    await sendToPipe({
      type: "openExternal",
      uris
    }, verbose).catch((e) => {
      console.error("Error when invoking the open external command:", e);
    });
  }
}
async function sendToPipe(args, verbose) {
  const http = await import("http");
  if (verbose) {
    console.log(JSON.stringify(args, null, "  "));
  }
  return new Promise((resolve2, reject) => {
    const message = JSON.stringify(args);
    if (!cliPipe) {
      console.log("Message " + message);
      resolve2("");
      return;
    }
    const opts = {
      socketPath: cliPipe,
      path: "/",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "accept": "application/json"
      }
    };
    const req = http.request(opts, (res) => {
      if (res.headers["content-type"] !== "application/json") {
        reject("Error in response: Invalid content type: Expected 'application/json', is: " + res.headers["content-type"]);
        return;
      }
      const chunks = [];
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        chunks.push(chunk);
      });
      res.on("error", (err) => fatal("Error in response.", err));
      res.on("end", () => {
        const content = chunks.join("");
        try {
          const obj = JSON.parse(content);
          if (res.statusCode === 200) {
            resolve2(obj);
          } else {
            reject(obj);
          }
        } catch (e) {
          reject("Error in response: Unable to parse response as JSON: " + content);
        }
      });
    });
    req.on("error", (err) => fatal("Error in request.", err));
    req.write(message);
    req.end();
  });
}
function asExtensionIdOrVSIX(inputs) {
  return inputs?.map((input) => /\.vsix$/i.test(input) ? pathToURI(input).href : input);
}
function fatal(message, err) {
  console.error("Unable to connect to VS Code server: " + message);
  console.error(err);
  process.exit(1);
}
const preferredCwd = process.env.PWD || cwd();
function pathToURI(input) {
  input = input.trim();
  input = resolve(preferredCwd, input);
  return pathToFileURL(input);
}
function translatePath(input, mapFileUri, folderURIS, fileURIS) {
  const url = pathToURI(input);
  const mappedUri = mapFileUri(url.href);
  try {
    const stat = fs.lstatSync(fs.realpathSync(input));
    if (stat.isFile()) {
      fileURIS.push(mappedUri);
    } else if (stat.isDirectory()) {
      folderURIS.push(mappedUri);
    } else if (input === "/dev/null") {
      fileURIS.push(mappedUri);
    }
  } catch (e) {
    if (e.code === "ENOENT") {
      fileURIS.push(mappedUri);
    } else {
      console.log(`Problem accessing file ${input}. Ignoring file`, e);
    }
  }
}
function mapFileToRemoteUri(uri) {
  return uri.replace(/^file:\/\//, "vscode-remote://" + cliRemoteAuthority);
}
function getAppRoot() {
  return dirname(FileAccess.asFileUri("").fsPath);
}
const [, , productName, version, commit, executableName, ...remainingArgs] = process.argv;
main({ productName, version, commit, executableName }, remainingArgs).then(null, (err) => {
  console.error(err.message || err.stack || err);
});
export {
  main
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXJ2ZXJcXG5vZGVcXHNlcnZlci5jbGkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgeyBwYXRoVG9GaWxlVVJMIH0gZnJvbSAndXJsJztcbmltcG9ydCAqIGFzIGNwIGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0IHR5cGUgKiBhcyBodHRwIGZyb20gJ2h0dHAnO1xuaW1wb3J0IHsgY3dkIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vcHJvY2Vzcy5qcyc7XG5pbXBvcnQgeyBkaXJuYW1lLCBleHRuYW1lLCByZXNvbHZlLCBqb2luIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBwYXJzZUFyZ3MsIGJ1aWxkSGVscE1lc3NhZ2UsIGJ1aWxkVmVyc2lvbk1lc3NhZ2UsIE9QVElPTlMsIE9wdGlvbkRlc2NyaXB0aW9ucywgRXJyb3JSZXBvcnRlciB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L25vZGUvYXJndi5qcyc7XG5pbXBvcnQgeyBOYXRpdmVQYXJzZWRBcmdzIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2FyZ3YuanMnO1xuaW1wb3J0IHsgY3JlYXRlV2FpdE1hcmtlckZpbGVTeW5jIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvbm9kZS93YWl0LmpzJztcbmltcG9ydCB7IFBpcGVDb21tYW5kIH0gZnJvbSAnLi4vLi4vd29ya2JlbmNoL2FwaS9ub2RlL2V4dEhvc3RDTElTZXJ2ZXIuanMnO1xuaW1wb3J0IHsgaGFzU3RkaW5XaXRob3V0VHR5LCBnZXRTdGRpbkZpbGVQYXRoLCByZWFkRnJvbVN0ZGluIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvbm9kZS9zdGRpbi5qcyc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBGaWxlQWNjZXNzIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5cbi8qXG4gKiBJbXBsZW1lbnRzIGEgc3RhbmRhbG9uZSBDTEkgYXBwIHRoYXQgb3BlbnMgVlMgQ29kZSBmcm9tIGEgcmVtb3RlIHRlcm1pbmFsLlxuICogIC0gSW4gaW50ZWdyYXRlZCB0ZXJtaW5hbHMgZm9yIHJlbW90ZSB3aW5kb3dzIHRoaXMgY29ubmVjdHMgdG8gdGhlIHJlbW90ZSBzZXJ2ZXIgdGhvdWdoIGEgcGlwZS5cbiAqICAgIFRoZSBwaXBlIGlzIHBhc3NlZCBpbiBlbnYgVlNDT0RFX0lQQ19IT09LX0NMSS5cbiAqICAtIEluIGV4dGVybmFsIHRlcm1pbmFscyBmb3IgV1NMIHRoaXMgY2FsbHMgVlMgQ29kZSBvbiB0aGUgV2luZG93cyBzaWRlLlxuICogICAgVGhlIFZTIENvZGUgZGVza3RvcCBleGVjdXRhYmxlIHBhdGggaXMgcGFzc2VkIGluIGVudiBWU0NPREVfQ0xJRU5UX0NPTU1BTkQuXG4gKi9cblxuXG5pbnRlcmZhY2UgUHJvZHVjdERlc2NyaXB0aW9uIHtcblx0cHJvZHVjdE5hbWU6IHN0cmluZztcblx0dmVyc2lvbjogc3RyaW5nO1xuXHRjb21taXQ6IHN0cmluZztcblx0ZXhlY3V0YWJsZU5hbWU6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIFJlbW90ZVBhcnNlZEFyZ3MgZXh0ZW5kcyBOYXRpdmVQYXJzZWRBcmdzIHsgJ2dpdENyZWRlbnRpYWwnPzogc3RyaW5nOyAnb3BlbkV4dGVybmFsJz86IGJvb2xlYW4gfVxuXG5cbmNvbnN0IGlzU3VwcG9ydGVkRm9yQ21kID0gKG9wdGlvbklkOiBrZXlvZiBSZW1vdGVQYXJzZWRBcmdzKSA9PiB7XG5cdHN3aXRjaCAob3B0aW9uSWQpIHtcblx0XHRjYXNlICd1c2VyLWRhdGEtZGlyJzpcblx0XHRjYXNlICdleHRlbnNpb25zLWRpcic6XG5cdFx0Y2FzZSAnZXhwb3J0LWRlZmF1bHQtY29uZmlndXJhdGlvbic6XG5cdFx0Y2FzZSAnaW5zdGFsbC1zb3VyY2UnOlxuXHRcdGNhc2UgJ2VuYWJsZS1zbW9rZS10ZXN0LWRyaXZlcic6XG5cdFx0Y2FzZSAnZXh0ZW5zaW9ucy1kb3dubG9hZC1kaXInOlxuXHRcdGNhc2UgJ2J1aWx0aW4tZXh0ZW5zaW9ucy1kaXInOlxuXHRcdGNhc2UgJ3RlbGVtZXRyeSc6XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiB0cnVlO1xuXHR9XG59O1xuXG5jb25zdCBpc1N1cHBvcnRlZEZvclBpcGUgPSAob3B0aW9uSWQ6IGtleW9mIFJlbW90ZVBhcnNlZEFyZ3MpID0+IHtcblx0c3dpdGNoIChvcHRpb25JZCkge1xuXHRcdGNhc2UgJ3ZlcnNpb24nOlxuXHRcdGNhc2UgJ2hlbHAnOlxuXHRcdGNhc2UgJ2ZvbGRlci11cmknOlxuXHRcdGNhc2UgJ2ZpbGUtdXJpJzpcblx0XHRjYXNlICdhZGQnOlxuXHRcdGNhc2UgJ2RpZmYnOlxuXHRcdGNhc2UgJ21lcmdlJzpcblx0XHRjYXNlICd3YWl0Jzpcblx0XHRjYXNlICdnb3RvJzpcblx0XHRjYXNlICdyZXVzZS13aW5kb3cnOlxuXHRcdGNhc2UgJ25ldy13aW5kb3cnOlxuXHRcdGNhc2UgJ3N0YXR1cyc6XG5cdFx0Y2FzZSAnaW5zdGFsbC1leHRlbnNpb24nOlxuXHRcdGNhc2UgJ3VuaW5zdGFsbC1leHRlbnNpb24nOlxuXHRcdGNhc2UgJ3VwZGF0ZS1leHRlbnNpb25zJzpcblx0XHRjYXNlICdsaXN0LWV4dGVuc2lvbnMnOlxuXHRcdGNhc2UgJ2ZvcmNlJzpcblx0XHRjYXNlICdkby1ub3QtaW5jbHVkZS1wYWNrLWRlcGVuZGVuY2llcyc6XG5cdFx0Y2FzZSAnc2hvdy12ZXJzaW9ucyc6XG5cdFx0Y2FzZSAnY2F0ZWdvcnknOlxuXHRcdGNhc2UgJ3ZlcmJvc2UnOlxuXHRcdGNhc2UgJ3JlbW90ZSc6XG5cdFx0Y2FzZSAnbG9jYXRlLXNoZWxsLWludGVncmF0aW9uLXBhdGgnOlxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiBmYWxzZTtcblx0fVxufTtcblxuY29uc3QgY2xpUGlwZSA9IHByb2Nlc3MuZW52WydWU0NPREVfSVBDX0hPT0tfQ0xJJ10gYXMgc3RyaW5nO1xuY29uc3QgY2xpQ29tbWFuZCA9IHByb2Nlc3MuZW52WydWU0NPREVfQ0xJRU5UX0NPTU1BTkQnXSBhcyBzdHJpbmc7XG5jb25zdCBjbGlDb21tYW5kQ3dkID0gcHJvY2Vzcy5lbnZbJ1ZTQ09ERV9DTElFTlRfQ09NTUFORF9DV0QnXSBhcyBzdHJpbmc7XG5jb25zdCBjbGlSZW1vdGVBdXRob3JpdHkgPSBwcm9jZXNzLmVudlsnVlNDT0RFX0NMSV9BVVRIT1JJVFknXSBhcyBzdHJpbmc7XG5jb25zdCBjbGlTdGRJbkZpbGVQYXRoID0gcHJvY2Vzcy5lbnZbJ1ZTQ09ERV9TVERJTl9GSUxFX1BBVEgnXSBhcyBzdHJpbmc7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBtYWluKGRlc2M6IFByb2R1Y3REZXNjcmlwdGlvbiwgYXJnczogc3RyaW5nW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0aWYgKCFjbGlQaXBlICYmICFjbGlDb21tYW5kKSB7XG5cdFx0Y29uc29sZS5sb2coJ0NvbW1hbmQgaXMgb25seSBhdmFpbGFibGUgaW4gV1NMIG9yIGluc2lkZSBhIFZpc3VhbCBTdHVkaW8gQ29kZSB0ZXJtaW5hbC4nKTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHQvLyB0YWtlIHRoZSBsb2NhbCBvcHRpb25zIGFuZCByZW1vdmUgdGhlIG9uZXMgdGhhdCBkb24ndCBhcHBseVxuXHRjb25zdCBvcHRpb25zOiBPcHRpb25EZXNjcmlwdGlvbnM8UmVxdWlyZWQ8UmVtb3RlUGFyc2VkQXJncz4+ID0geyAuLi5PUFRJT05TLCBnaXRDcmVkZW50aWFsOiB7IHR5cGU6ICdzdHJpbmcnIH0sIG9wZW5FeHRlcm5hbDogeyB0eXBlOiAnYm9vbGVhbicgfSB9O1xuXHRjb25zdCBpc1N1cHBvcnRlZCA9IGNsaUNvbW1hbmQgPyBpc1N1cHBvcnRlZEZvckNtZCA6IGlzU3VwcG9ydGVkRm9yUGlwZTtcblx0Zm9yIChjb25zdCBvcHRpb25JZCBpbiBPUFRJT05TKSB7XG5cdFx0Y29uc3Qgb3B0SWQgPSA8a2V5b2YgUmVtb3RlUGFyc2VkQXJncz5vcHRpb25JZDtcblx0XHRpZiAoIWlzU3VwcG9ydGVkKG9wdElkKSkge1xuXHRcdFx0ZGVsZXRlIG9wdGlvbnNbb3B0SWRdO1xuXHRcdH1cblx0fVxuXG5cdGlmIChjbGlQaXBlKSB7XG5cdFx0b3B0aW9uc1snb3BlbkV4dGVybmFsJ10gPSB7IHR5cGU6ICdib29sZWFuJyB9O1xuXHR9XG5cblx0Y29uc3QgZXJyb3JSZXBvcnRlcjogRXJyb3JSZXBvcnRlciA9IHtcblx0XHRvbk11bHRpcGxlVmFsdWVzOiAoaWQ6IHN0cmluZywgdXNlZFZhbHVlOiBzdHJpbmcpID0+IHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoYE9wdGlvbiAnJHtpZH0nIGNhbiBvbmx5IGJlIGRlZmluZWQgb25jZS4gVXNpbmcgdmFsdWUgJHt1c2VkVmFsdWV9LmApO1xuXHRcdH0sXG5cdFx0b25FbXB0eVZhbHVlOiAoaWQpID0+IHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoYElnbm9yaW5nIG9wdGlvbiAnJHtpZH0nOiBWYWx1ZSBtdXN0IG5vdCBiZSBlbXB0eS5gKTtcblx0XHR9LFxuXHRcdG9uVW5rbm93bk9wdGlvbjogKGlkOiBzdHJpbmcpID0+IHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoYElnbm9yaW5nIG9wdGlvbiAnJHtpZH0nOiBub3Qgc3VwcG9ydGVkIGZvciAke2Rlc2MuZXhlY3V0YWJsZU5hbWV9LmApO1xuXHRcdH0sXG5cdFx0b25EZXByZWNhdGVkT3B0aW9uOiAoZGVwcmVjYXRlZE9wdGlvbjogc3RyaW5nLCBtZXNzYWdlOiBzdHJpbmcpID0+IHtcblx0XHRcdGNvbnNvbGUud2FybihgT3B0aW9uICcke2RlcHJlY2F0ZWRPcHRpb259JyBpcyBkZXByZWNhdGVkOiAke21lc3NhZ2V9YCk7XG5cdFx0fVxuXHR9O1xuXG5cdGNvbnN0IHBhcnNlZEFyZ3MgPSBwYXJzZUFyZ3MoYXJncywgb3B0aW9ucywgZXJyb3JSZXBvcnRlcik7XG5cdGNvbnN0IG1hcEZpbGVVcmkgPSBjbGlSZW1vdGVBdXRob3JpdHkgPyBtYXBGaWxlVG9SZW1vdGVVcmkgOiAodXJpOiBzdHJpbmcpID0+IHVyaTtcblxuXHRjb25zdCB2ZXJib3NlID0gISFwYXJzZWRBcmdzWyd2ZXJib3NlJ107XG5cblx0aWYgKHBhcnNlZEFyZ3MuaGVscCkge1xuXHRcdGNvbnNvbGUubG9nKGJ1aWxkSGVscE1lc3NhZ2UoZGVzYy5wcm9kdWN0TmFtZSwgZGVzYy5leGVjdXRhYmxlTmFtZSwgZGVzYy52ZXJzaW9uLCBvcHRpb25zKSk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGlmIChwYXJzZWRBcmdzLnZlcnNpb24pIHtcblx0XHRjb25zb2xlLmxvZyhidWlsZFZlcnNpb25NZXNzYWdlKGRlc2MudmVyc2lvbiwgZGVzYy5jb21taXQpKTtcblx0XHRyZXR1cm47XG5cdH1cblx0aWYgKHBhcnNlZEFyZ3NbJ2xvY2F0ZS1zaGVsbC1pbnRlZ3JhdGlvbi1wYXRoJ10pIHtcblx0XHRsZXQgZmlsZTogc3RyaW5nO1xuXHRcdHN3aXRjaCAocGFyc2VkQXJnc1snbG9jYXRlLXNoZWxsLWludGVncmF0aW9uLXBhdGgnXSkge1xuXHRcdFx0Ly8gVXNhZ2U6IGBbWyBcIiRURVJNX1BST0dSQU1cIiA9PSBcInZzY29kZVwiIF1dICYmIC4gXCIkKGNvZGUgLS1sb2NhdGUtc2hlbGwtaW50ZWdyYXRpb24tcGF0aCBiYXNoKVwiYFxuXHRcdFx0Y2FzZSAnYmFzaCc6IGZpbGUgPSAnc2hlbGxJbnRlZ3JhdGlvbi1iYXNoLnNoJzsgYnJlYWs7XG5cdFx0XHQvLyBVc2FnZTogYGlmICgkZW52OlRFUk1fUFJPR1JBTSAtZXEgXCJ2c2NvZGVcIikgeyAuIFwiJChjb2RlIC0tbG9jYXRlLXNoZWxsLWludGVncmF0aW9uLXBhdGggcHdzaClcIiB9YFxuXHRcdFx0Y2FzZSAncHdzaCc6IGZpbGUgPSAnc2hlbGxJbnRlZ3JhdGlvbi5wczEnOyBicmVhaztcblx0XHRcdC8vIFVzYWdlOiBgW1sgXCIkVEVSTV9QUk9HUkFNXCIgPT0gXCJ2c2NvZGVcIiBdXSAmJiAuIFwiJChjb2RlIC0tbG9jYXRlLXNoZWxsLWludGVncmF0aW9uLXBhdGggenNoKVwiYFxuXHRcdFx0Y2FzZSAnenNoJzogZmlsZSA9ICdzaGVsbEludGVncmF0aW9uLXJjLnpzaCc7IGJyZWFrO1xuXHRcdFx0Ly8gVXNhZ2U6IGBzdHJpbmcgbWF0Y2ggLXEgXCIkVEVSTV9QUk9HUkFNXCIgXCJ2c2NvZGVcIjsgYW5kIC4gKGNvZGUgLS1sb2NhdGUtc2hlbGwtaW50ZWdyYXRpb24tcGF0aCBmaXNoKWBcblx0XHRcdGNhc2UgJ2Zpc2gnOiBmaWxlID0gJ3NoZWxsSW50ZWdyYXRpb24uZmlzaCc7IGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDogdGhyb3cgbmV3IEVycm9yKCdFcnJvciB1c2luZyAtLWxvY2F0ZS1zaGVsbC1pbnRlZ3JhdGlvbi1wYXRoOiBJbnZhbGlkIHNoZWxsIHR5cGUnKTtcblx0XHR9XG5cdFx0Y29uc29sZS5sb2coam9pbihnZXRBcHBSb290KCksICdvdXQnLCAndnMnLCAnd29ya2JlbmNoJywgJ2NvbnRyaWInLCAndGVybWluYWwnLCAnY29tbW9uJywgJ3NjcmlwdHMnLCBmaWxlKSk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGlmIChjbGlQaXBlKSB7XG5cdFx0aWYgKHBhcnNlZEFyZ3NbJ29wZW5FeHRlcm5hbCddKSB7XG5cdFx0XHRhd2FpdCBvcGVuSW5Ccm93c2VyKHBhcnNlZEFyZ3NbJ18nXSwgdmVyYm9zZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHR9XG5cblx0bGV0IHJlbW90ZTogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCA9IHBhcnNlZEFyZ3MucmVtb3RlO1xuXHRpZiAocmVtb3RlID09PSAnbG9jYWwnIHx8IHJlbW90ZSA9PT0gJ2ZhbHNlJyB8fCByZW1vdGUgPT09ICcnKSB7XG5cdFx0cmVtb3RlID0gbnVsbDsgLy8gbnVsbCByZXByZXNlbnQgYSBsb2NhbCB3aW5kb3dcblx0fVxuXG5cdGNvbnN0IGZvbGRlclVSSXMgPSAocGFyc2VkQXJnc1snZm9sZGVyLXVyaSddIHx8IFtdKS5tYXAobWFwRmlsZVVyaSk7XG5cdHBhcnNlZEFyZ3NbJ2ZvbGRlci11cmknXSA9IGZvbGRlclVSSXM7XG5cblx0Y29uc3QgZmlsZVVSSXMgPSAocGFyc2VkQXJnc1snZmlsZS11cmknXSB8fCBbXSkubWFwKG1hcEZpbGVVcmkpO1xuXHRwYXJzZWRBcmdzWydmaWxlLXVyaSddID0gZmlsZVVSSXM7XG5cblx0Y29uc3QgaW5wdXRQYXRocyA9IHBhcnNlZEFyZ3NbJ18nXTtcblx0bGV0IGhhc1JlYWRTdGRpbkFyZyA9IGZhbHNlO1xuXHRmb3IgKGNvbnN0IGlucHV0IG9mIGlucHV0UGF0aHMpIHtcblx0XHRpZiAoaW5wdXQgPT09ICctJykge1xuXHRcdFx0aGFzUmVhZFN0ZGluQXJnID0gdHJ1ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dHJhbnNsYXRlUGF0aChpbnB1dCwgbWFwRmlsZVVyaSwgZm9sZGVyVVJJcywgZmlsZVVSSXMpO1xuXHRcdH1cblx0fVxuXG5cdHBhcnNlZEFyZ3NbJ18nXSA9IFtdO1xuXG5cdGxldCByZWFkRnJvbVN0ZGluUHJvbWlzZTogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0bGV0IHN0ZGluRmlsZVBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRpZiAoaGFzUmVhZFN0ZGluQXJnICYmIGhhc1N0ZGluV2l0aG91dFR0eSgpKSB7XG5cdFx0dHJ5IHtcblx0XHRcdHN0ZGluRmlsZVBhdGggPSBjbGlTdGRJbkZpbGVQYXRoO1xuXHRcdFx0aWYgKCFzdGRpbkZpbGVQYXRoKSB7XG5cdFx0XHRcdHN0ZGluRmlsZVBhdGggPSBnZXRTdGRpbkZpbGVQYXRoKCk7XG5cdFx0XHRcdGNvbnN0IHJlYWRGcm9tU3RkaW5Eb25lID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0XHRhd2FpdCByZWFkRnJvbVN0ZGluKHN0ZGluRmlsZVBhdGgsIHZlcmJvc2UsICgpID0+IHJlYWRGcm9tU3RkaW5Eb25lLmNvbXBsZXRlKCkpOyAvLyB0aHJvd3MgZXJyb3IgaWYgZmlsZSBjYW4gbm90IGJlIHdyaXR0ZW5cblx0XHRcdFx0aWYgKCFwYXJzZWRBcmdzLndhaXQpIHtcblx0XHRcdFx0XHQvLyBpZiBgLS13YWl0YCBpcyBub3QgcHJvdmlkZWQsIHdlIGtlZXAgdGhpcyBwcm9jZXNzIGFsaXZlXG5cdFx0XHRcdFx0Ly8gZm9yIGF0IGxlYXN0IGFzIGxvbmcgYXMgdGhlIHN0ZGluIHN0cmVhbSBpcyBvcGVuIHRvXG5cdFx0XHRcdFx0Ly8gZW5zdXJlIHRoYXQgd2UgcmVhZCBhbGwgdGhlIGRhdGEuXG5cdFx0XHRcdFx0cmVhZEZyb21TdGRpblByb21pc2UgPSByZWFkRnJvbVN0ZGluRG9uZS5wO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIE1ha2Ugc3VyZSB0byBvcGVuIHRtcCBmaWxlXG5cdFx0XHR0cmFuc2xhdGVQYXRoKHN0ZGluRmlsZVBhdGgsIG1hcEZpbGVVcmksIGZvbGRlclVSSXMsIGZpbGVVUklzKTtcblxuXHRcdFx0Ly8gSWdub3JlIGFkZGluZyB0aGlzIHRvIGhpc3Rvcnlcblx0XHRcdHBhcnNlZEFyZ3NbJ3NraXAtYWRkLXRvLXJlY2VudGx5LW9wZW5lZCddID0gdHJ1ZTtcblxuXHRcdFx0Y29uc29sZS5sb2coYFJlYWRpbmcgZnJvbSBzdGRpbiB2aWE6ICR7c3RkaW5GaWxlUGF0aH1gKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRjb25zb2xlLmxvZyhgRmFpbGVkIHRvIGNyZWF0ZSBmaWxlIHRvIHJlYWQgdmlhIHN0ZGluOiAke2UudG9TdHJpbmcoKX1gKTtcblx0XHR9XG5cdH1cblxuXHRpZiAocGFyc2VkQXJncy5leHRlbnNpb25EZXZlbG9wbWVudFBhdGgpIHtcblx0XHRwYXJzZWRBcmdzLmV4dGVuc2lvbkRldmVsb3BtZW50UGF0aCA9IHBhcnNlZEFyZ3MuZXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRoLm1hcChwID0+IG1hcEZpbGVVcmkocGF0aFRvVVJJKHApLmhyZWYpKTtcblx0fVxuXG5cdGlmIChwYXJzZWRBcmdzLmV4dGVuc2lvblRlc3RzUGF0aCkge1xuXHRcdHBhcnNlZEFyZ3MuZXh0ZW5zaW9uVGVzdHNQYXRoID0gbWFwRmlsZVVyaShwYXRoVG9VUkkocGFyc2VkQXJnc1snZXh0ZW5zaW9uVGVzdHNQYXRoJ10pLmhyZWYpO1xuXHR9XG5cblx0Y29uc3QgY3Jhc2hSZXBvcnRlckRpcmVjdG9yeSA9IHBhcnNlZEFyZ3NbJ2NyYXNoLXJlcG9ydGVyLWRpcmVjdG9yeSddO1xuXHRpZiAoY3Jhc2hSZXBvcnRlckRpcmVjdG9yeSAhPT0gdW5kZWZpbmVkICYmICFjcmFzaFJlcG9ydGVyRGlyZWN0b3J5Lm1hdGNoKC9eKFthLXpBLVpdOltcXFxcXFwvXSkvKSkge1xuXHRcdGNvbnNvbGUubG9nKGBUaGUgY3Jhc2ggcmVwb3J0ZXIgZGlyZWN0b3J5ICcke2NyYXNoUmVwb3J0ZXJEaXJlY3Rvcnl9JyBtdXN0IGJlIGFuIGFic29sdXRlIFdpbmRvd3MgcGF0aCAoZS5nLiBjOi9jcmFzaGVzKWApO1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGlmIChjbGlDb21tYW5kKSB7XG5cdFx0aWYgKHBhcnNlZEFyZ3NbJ2luc3RhbGwtZXh0ZW5zaW9uJ10gIT09IHVuZGVmaW5lZCB8fCBwYXJzZWRBcmdzWyd1bmluc3RhbGwtZXh0ZW5zaW9uJ10gIT09IHVuZGVmaW5lZCB8fCBwYXJzZWRBcmdzWydsaXN0LWV4dGVuc2lvbnMnXSB8fCBwYXJzZWRBcmdzWyd1cGRhdGUtZXh0ZW5zaW9ucyddKSB7XG5cdFx0XHRjb25zdCBjbWRMaW5lOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0cGFyc2VkQXJnc1snaW5zdGFsbC1leHRlbnNpb24nXT8uZm9yRWFjaChpZCA9PiBjbWRMaW5lLnB1c2goJy0taW5zdGFsbC1leHRlbnNpb24nLCBpZCkpO1xuXHRcdFx0cGFyc2VkQXJnc1sndW5pbnN0YWxsLWV4dGVuc2lvbiddPy5mb3JFYWNoKGlkID0+IGNtZExpbmUucHVzaCgnLS11bmluc3RhbGwtZXh0ZW5zaW9uJywgaWQpKTtcblx0XHRcdFsnbGlzdC1leHRlbnNpb25zJywgJ2ZvcmNlJywgJ3Nob3ctdmVyc2lvbnMnLCAnY2F0ZWdvcnknXS5mb3JFYWNoKG9wdCA9PiB7XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gcGFyc2VkQXJnc1s8a2V5b2YgTmF0aXZlUGFyc2VkQXJncz5vcHRdO1xuXHRcdFx0XHRpZiAodmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGNtZExpbmUucHVzaChgLS0ke29wdH09JHt2YWx1ZX1gKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRpZiAocGFyc2VkQXJnc1sndXBkYXRlLWV4dGVuc2lvbnMnXSkge1xuXHRcdFx0XHRjbWRMaW5lLnB1c2goJy0tdXBkYXRlLWV4dGVuc2lvbnMnKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY2hpbGRQcm9jZXNzID0gY3AuZm9yayhGaWxlQWNjZXNzLmFzRmlsZVVyaSgnc2VydmVyLW1haW4nKS5mc1BhdGgsIGNtZExpbmUsIHsgc3RkaW86ICdpbmhlcml0JyB9KTtcblx0XHRcdGNoaWxkUHJvY2Vzcy5vbignZXJyb3InLCBlcnIgPT4gY29uc29sZS5sb2coZXJyKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV3Q29tbWFuZGxpbmU6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBrZXkgaW4gcGFyc2VkQXJncykge1xuXHRcdFx0Y29uc3QgdmFsID0gcGFyc2VkQXJnc1trZXkgYXMga2V5b2YgdHlwZW9mIHBhcnNlZEFyZ3NdO1xuXHRcdFx0aWYgKHR5cGVvZiB2YWwgPT09ICdib29sZWFuJykge1xuXHRcdFx0XHRpZiAodmFsKSB7XG5cdFx0XHRcdFx0bmV3Q29tbWFuZGxpbmUucHVzaCgnLS0nICsga2V5KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChBcnJheS5pc0FycmF5KHZhbCkpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB2YWwpIHtcblx0XHRcdFx0XHRuZXdDb21tYW5kbGluZS5wdXNoKGAtLSR7a2V5fT0ke2VudHJ5LnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAodmFsKSB7XG5cdFx0XHRcdG5ld0NvbW1hbmRsaW5lLnB1c2goYC0tJHtrZXl9PSR7dmFsLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChyZW1vdGUgIT09IG51bGwpIHtcblx0XHRcdG5ld0NvbW1hbmRsaW5lLnB1c2goYC0tcmVtb3RlPSR7cmVtb3RlIHx8IGNsaVJlbW90ZUF1dGhvcml0eX1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBleHQgPSBleHRuYW1lKGNsaUNvbW1hbmQpO1xuXHRcdGlmIChleHQgPT09ICcuYmF0JyB8fCBleHQgPT09ICcuY21kJykge1xuXHRcdFx0Y29uc3QgcHJvY2Vzc0N3ZCA9IGNsaUNvbW1hbmRDd2QgfHwgY3dkKCk7XG5cdFx0XHRpZiAodmVyYm9zZSkge1xuXHRcdFx0XHRjb25zb2xlLmxvZyhgSW52b2tpbmc6IGNtZC5leGUgL0MgJHtjbGlDb21tYW5kfSAke25ld0NvbW1hbmRsaW5lLmpvaW4oJyAnKX0gaW4gJHtwcm9jZXNzQ3dkfWApO1xuXHRcdFx0fVxuXHRcdFx0Y3Auc3Bhd24oJ2NtZC5leGUnLCBbJy9DJywgY2xpQ29tbWFuZCwgLi4ubmV3Q29tbWFuZGxpbmVdLCB7XG5cdFx0XHRcdHN0ZGlvOiAnaW5oZXJpdCcsXG5cdFx0XHRcdGN3ZDogcHJvY2Vzc0N3ZFxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGNsaUN3ZCA9IGRpcm5hbWUoY2xpQ29tbWFuZCk7XG5cdFx0XHRjb25zdCBlbnYgPSB7IC4uLnByb2Nlc3MuZW52LCBFTEVDVFJPTl9SVU5fQVNfTk9ERTogJzEnIH07XG5cdFx0XHRjb25zdCB2ZXJzaW9uRm9sZGVyID0gZGVzYy5jb21taXQuc3Vic3RyaW5nKDAsIDEwKTtcblx0XHRcdGlmIChmcy5leGlzdHNTeW5jKGpvaW4oY2xpQ3dkLCB2ZXJzaW9uRm9sZGVyKSkpIHtcblx0XHRcdFx0bmV3Q29tbWFuZGxpbmUudW5zaGlmdChgJHt2ZXJzaW9uRm9sZGVyfS9yZXNvdXJjZXMvYXBwL291dC9jbGkuanNgKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG5ld0NvbW1hbmRsaW5lLnVuc2hpZnQoJ3Jlc291cmNlcy9hcHAvb3V0L2NsaS5qcycpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHZlcmJvc2UpIHtcblx0XHRcdFx0Y29uc29sZS5sb2coYEludm9raW5nOiBjZCBcIiR7Y2xpQ3dkfVwiICYmIEVMRUNUUk9OX1JVTl9BU19OT0RFPTEgXCIke2NsaUNvbW1hbmR9XCIgXCIke25ld0NvbW1hbmRsaW5lLmpvaW4oJ1wiIFwiJyl9XCJgKTtcblx0XHRcdH1cblx0XHRcdGlmIChydW5uaW5nSW5XU0wyKCkpIHtcblx0XHRcdFx0aWYgKHZlcmJvc2UpIHtcblx0XHRcdFx0XHRjb25zb2xlLmxvZyhgVXNpbmcgcGlwZXMgZm9yIG91dHB1dC5gKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBjaGlsZFByb2Nlc3MgPSBjcC5zcGF3bihjbGlDb21tYW5kLCBuZXdDb21tYW5kbGluZSwgeyBjd2Q6IGNsaUN3ZCwgZW52LCBzdGRpbzogWydpbmhlcml0JywgJ3BpcGUnLCAncGlwZSddIH0pO1xuXHRcdFx0XHRjaGlsZFByb2Nlc3Muc3Rkb3V0Lm9uKCdkYXRhJywgZGF0YSA9PiBwcm9jZXNzLnN0ZG91dC53cml0ZShkYXRhKSk7XG5cdFx0XHRcdGNoaWxkUHJvY2Vzcy5zdGRlcnIub24oJ2RhdGEnLCBkYXRhID0+IHByb2Nlc3Muc3RkZXJyLndyaXRlKGRhdGEpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNwLnNwYXduKGNsaUNvbW1hbmQsIG5ld0NvbW1hbmRsaW5lLCB7IGN3ZDogY2xpQ3dkLCBlbnYsIHN0ZGlvOiAnaW5oZXJpdCcgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdGlmIChwYXJzZWRBcmdzLnN0YXR1cykge1xuXHRcdFx0YXdhaXQgc2VuZFRvUGlwZSh7XG5cdFx0XHRcdHR5cGU6ICdzdGF0dXMnXG5cdFx0XHR9LCB2ZXJib3NlKS50aGVuKChyZXM6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRjb25zb2xlLmxvZyhyZXMpO1xuXHRcdFx0fSkuY2F0Y2goZSA9PiB7XG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHdoZW4gcmVxdWVzdGluZyBzdGF0dXM6JywgZSk7XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAocGFyc2VkQXJnc1snaW5zdGFsbC1leHRlbnNpb24nXSAhPT0gdW5kZWZpbmVkIHx8IHBhcnNlZEFyZ3NbJ3VuaW5zdGFsbC1leHRlbnNpb24nXSAhPT0gdW5kZWZpbmVkIHx8IHBhcnNlZEFyZ3NbJ2xpc3QtZXh0ZW5zaW9ucyddIHx8IHBhcnNlZEFyZ3NbJ3VwZGF0ZS1leHRlbnNpb25zJ10pIHtcblx0XHRcdGF3YWl0IHNlbmRUb1BpcGUoe1xuXHRcdFx0XHR0eXBlOiAnZXh0ZW5zaW9uTWFuYWdlbWVudCcsXG5cdFx0XHRcdGxpc3Q6IHBhcnNlZEFyZ3NbJ2xpc3QtZXh0ZW5zaW9ucyddID8geyBzaG93VmVyc2lvbnM6IHBhcnNlZEFyZ3NbJ3Nob3ctdmVyc2lvbnMnXSwgY2F0ZWdvcnk6IHBhcnNlZEFyZ3NbJ2NhdGVnb3J5J10gfSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0aW5zdGFsbDogYXNFeHRlbnNpb25JZE9yVlNJWChwYXJzZWRBcmdzWydpbnN0YWxsLWV4dGVuc2lvbiddKSxcblx0XHRcdFx0dW5pbnN0YWxsOiBhc0V4dGVuc2lvbklkT3JWU0lYKHBhcnNlZEFyZ3NbJ3VuaW5zdGFsbC1leHRlbnNpb24nXSksXG5cdFx0XHRcdGZvcmNlOiBwYXJzZWRBcmdzWydmb3JjZSddXG5cdFx0XHR9LCB2ZXJib3NlKS50aGVuKChyZXM6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRjb25zb2xlLmxvZyhyZXMpO1xuXHRcdFx0fSkuY2F0Y2goZSA9PiB7XG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHdoZW4gaW52b2tpbmcgdGhlIGV4dGVuc2lvbiBtYW5hZ2VtZW50IGNvbW1hbmQ6JywgZSk7XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgd2FpdE1hcmtlckZpbGVQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHBhcnNlZEFyZ3NbJ3dhaXQnXSkge1xuXHRcdFx0aWYgKCFmaWxlVVJJcy5sZW5ndGgpIHtcblx0XHRcdFx0Y29uc29sZS5sb2coJ0F0IGxlYXN0IG9uZSBmaWxlIG11c3QgYmUgcHJvdmlkZWQgdG8gd2FpdCBmb3IuJyk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHdhaXRNYXJrZXJGaWxlUGF0aCA9IGNyZWF0ZVdhaXRNYXJrZXJGaWxlU3luYyh2ZXJib3NlKTtcblx0XHR9XG5cblx0XHRhd2FpdCBzZW5kVG9QaXBlKHtcblx0XHRcdHR5cGU6ICdvcGVuJyxcblx0XHRcdGZpbGVVUklzLFxuXHRcdFx0Zm9sZGVyVVJJcyxcblx0XHRcdGRpZmZNb2RlOiBwYXJzZWRBcmdzLmRpZmYsXG5cdFx0XHRtZXJnZU1vZGU6IHBhcnNlZEFyZ3MubWVyZ2UsXG5cdFx0XHRhZGRNb2RlOiBwYXJzZWRBcmdzLmFkZCxcblx0XHRcdHJlbW92ZU1vZGU6IHBhcnNlZEFyZ3MucmVtb3ZlLFxuXHRcdFx0Z290b0xpbmVNb2RlOiBwYXJzZWRBcmdzLmdvdG8sXG5cdFx0XHRmb3JjZVJldXNlV2luZG93OiBwYXJzZWRBcmdzWydyZXVzZS13aW5kb3cnXSxcblx0XHRcdGZvcmNlTmV3V2luZG93OiBwYXJzZWRBcmdzWyduZXctd2luZG93J10sXG5cdFx0XHR3YWl0TWFya2VyRmlsZVBhdGgsXG5cdFx0XHRyZW1vdGVBdXRob3JpdHk6IHJlbW90ZVxuXHRcdH0sIHZlcmJvc2UpLmNhdGNoKGUgPT4ge1xuXHRcdFx0Y29uc29sZS5lcnJvcignRXJyb3Igd2hlbiBpbnZva2luZyB0aGUgb3BlbiBjb21tYW5kOicsIGUpO1xuXHRcdH0pO1xuXG5cdFx0aWYgKHdhaXRNYXJrZXJGaWxlUGF0aCkge1xuXHRcdFx0YXdhaXQgd2FpdEZvckZpbGVEZWxldGVkKHdhaXRNYXJrZXJGaWxlUGF0aCk7XG5cdFx0fVxuXG5cdFx0aWYgKHJlYWRGcm9tU3RkaW5Qcm9taXNlKSB7XG5cdFx0XHRhd2FpdCByZWFkRnJvbVN0ZGluUHJvbWlzZTtcblxuXHRcdH1cblxuXHRcdGlmICh3YWl0TWFya2VyRmlsZVBhdGggJiYgc3RkaW5GaWxlUGF0aCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0ZnMudW5saW5rU3luYyhzdGRpbkZpbGVQYXRoKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0Ly9pZ25vcmVcblx0XHRcdH1cblx0XHR9XG5cdH1cblxufVxuXG5mdW5jdGlvbiBydW5uaW5nSW5XU0wyKCk6IGJvb2xlYW4ge1xuXHRpZiAoISFwcm9jZXNzLmVudlsnV1NMX0RJU1RST19OQU1FJ10pIHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGNwLmV4ZWNTeW5jKCd1bmFtZSAtcicsIHsgZW5jb2Rpbmc6ICd1dGY4JyB9KS5pbmNsdWRlcygnLW1pY3Jvc29mdC0nKTtcblx0XHR9IGNhdGNoIChfZSkge1xuXHRcdFx0Ly8gSWdub3JlXG5cdFx0fVxuXHR9XG5cdHJldHVybiBmYWxzZTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gd2FpdEZvckZpbGVEZWxldGVkKHBhdGg6IHN0cmluZykge1xuXHR3aGlsZSAoZnMuZXhpc3RzU3luYyhwYXRoKSkge1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlcyA9PiBzZXRUaW1lb3V0KHJlcywgMTAwMCkpO1xuXHR9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIG9wZW5JbkJyb3dzZXIoYXJnczogc3RyaW5nW10sIHZlcmJvc2U6IGJvb2xlYW4pIHtcblx0Y29uc3QgdXJpczogc3RyaW5nW10gPSBbXTtcblx0Zm9yIChjb25zdCBsb2NhdGlvbiBvZiBhcmdzKSB7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICgvXlthLXotXSs6XFwvXFwvLisvLnRlc3QobG9jYXRpb24pKSB7XG5cdFx0XHRcdHVyaXMucHVzaChuZXcgVVJMKGxvY2F0aW9uKS5ocmVmKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHVyaXMucHVzaChwYXRoVG9VUkkobG9jYXRpb24pLmhyZWYpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGNvbnNvbGUubG9nKGBJbnZhbGlkIHVybDogJHtsb2NhdGlvbn1gKTtcblx0XHR9XG5cdH1cblx0aWYgKHVyaXMubGVuZ3RoKSB7XG5cdFx0YXdhaXQgc2VuZFRvUGlwZSh7XG5cdFx0XHR0eXBlOiAnb3BlbkV4dGVybmFsJyxcblx0XHRcdHVyaXNcblx0XHR9LCB2ZXJib3NlKS5jYXRjaChlID0+IHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHdoZW4gaW52b2tpbmcgdGhlIG9wZW4gZXh0ZXJuYWwgY29tbWFuZDonLCBlKTtcblx0XHR9KTtcblx0fVxufVxuXG5hc3luYyBmdW5jdGlvbiBzZW5kVG9QaXBlKGFyZ3M6IFBpcGVDb21tYW5kLCB2ZXJib3NlOiBib29sZWFuKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0Y29uc3QgaHR0cCA9IGF3YWl0IGltcG9ydCgnaHR0cCcpO1xuXHRpZiAodmVyYm9zZSkge1xuXHRcdGNvbnNvbGUubG9nKEpTT04uc3RyaW5naWZ5KGFyZ3MsIG51bGwsICcgICcpKTtcblx0fVxuXHRyZXR1cm4gbmV3IFByb21pc2U8c3RyaW5nPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0Y29uc3QgbWVzc2FnZSA9IEpTT04uc3RyaW5naWZ5KGFyZ3MpO1xuXHRcdGlmICghY2xpUGlwZSkge1xuXHRcdFx0Y29uc29sZS5sb2coJ01lc3NhZ2UgJyArIG1lc3NhZ2UpO1xuXHRcdFx0cmVzb2x2ZSgnJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3B0czogaHR0cC5SZXF1ZXN0T3B0aW9ucyA9IHtcblx0XHRcdHNvY2tldFBhdGg6IGNsaVBpcGUsXG5cdFx0XHRwYXRoOiAnLycsXG5cdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0J2NvbnRlbnQtdHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0J2FjY2VwdCc6ICdhcHBsaWNhdGlvbi9qc29uJ1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCByZXEgPSBodHRwLnJlcXVlc3Qob3B0cywgcmVzID0+IHtcblx0XHRcdGlmIChyZXMuaGVhZGVyc1snY29udGVudC10eXBlJ10gIT09ICdhcHBsaWNhdGlvbi9qc29uJykge1xuXHRcdFx0XHRyZWplY3QoJ0Vycm9yIGluIHJlc3BvbnNlOiBJbnZhbGlkIGNvbnRlbnQgdHlwZTogRXhwZWN0ZWQgXFwnYXBwbGljYXRpb24vanNvblxcJywgaXM6ICcgKyByZXMuaGVhZGVyc1snY29udGVudC10eXBlJ10pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNodW5rczogc3RyaW5nW10gPSBbXTtcblx0XHRcdHJlcy5zZXRFbmNvZGluZygndXRmOCcpO1xuXHRcdFx0cmVzLm9uKCdkYXRhJywgY2h1bmsgPT4ge1xuXHRcdFx0XHRjaHVua3MucHVzaChjaHVuayk7XG5cdFx0XHR9KTtcblx0XHRcdHJlcy5vbignZXJyb3InLCAoZXJyKSA9PiBmYXRhbCgnRXJyb3IgaW4gcmVzcG9uc2UuJywgZXJyKSk7XG5cdFx0XHRyZXMub24oJ2VuZCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IGNodW5rcy5qb2luKCcnKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBvYmogPSBKU09OLnBhcnNlKGNvbnRlbnQpO1xuXHRcdFx0XHRcdGlmIChyZXMuc3RhdHVzQ29kZSA9PT0gMjAwKSB7XG5cdFx0XHRcdFx0XHRyZXNvbHZlKG9iaik7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJlamVjdChvYmopO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdHJlamVjdCgnRXJyb3IgaW4gcmVzcG9uc2U6IFVuYWJsZSB0byBwYXJzZSByZXNwb25zZSBhcyBKU09OOiAnICsgY29udGVudCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0cmVxLm9uKCdlcnJvcicsIChlcnIpID0+IGZhdGFsKCdFcnJvciBpbiByZXF1ZXN0LicsIGVycikpO1xuXHRcdHJlcS53cml0ZShtZXNzYWdlKTtcblx0XHRyZXEuZW5kKCk7XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBhc0V4dGVuc2lvbklkT3JWU0lYKGlucHV0czogc3RyaW5nW10gfCB1bmRlZmluZWQpIHtcblx0cmV0dXJuIGlucHV0cz8ubWFwKGlucHV0ID0+IC9cXC52c2l4JC9pLnRlc3QoaW5wdXQpID8gcGF0aFRvVVJJKGlucHV0KS5ocmVmIDogaW5wdXQpO1xufVxuXG5mdW5jdGlvbiBmYXRhbChtZXNzYWdlOiBzdHJpbmcsIGVycjogdW5rbm93bik6IHZvaWQge1xuXHRjb25zb2xlLmVycm9yKCdVbmFibGUgdG8gY29ubmVjdCB0byBWUyBDb2RlIHNlcnZlcjogJyArIG1lc3NhZ2UpO1xuXHRjb25zb2xlLmVycm9yKGVycik7XG5cdHByb2Nlc3MuZXhpdCgxKTtcbn1cblxuY29uc3QgcHJlZmVycmVkQ3dkID0gcHJvY2Vzcy5lbnYuUFdEIHx8IGN3ZCgpOyAvLyBwcmVmZXIgcHJvY2Vzcy5lbnYuUFdEIGFzIGl0IGRvZXMgbm90IGZvbGxvdyBzeW1saW5rc1xuXG5mdW5jdGlvbiBwYXRoVG9VUkkoaW5wdXQ6IHN0cmluZyk6IFVSTCB7XG5cdGlucHV0ID0gaW5wdXQudHJpbSgpO1xuXHRpbnB1dCA9IHJlc29sdmUocHJlZmVycmVkQ3dkLCBpbnB1dCk7XG5cblx0cmV0dXJuIHBhdGhUb0ZpbGVVUkwoaW5wdXQpO1xufVxuXG5mdW5jdGlvbiB0cmFuc2xhdGVQYXRoKGlucHV0OiBzdHJpbmcsIG1hcEZpbGVVcmk6IChpbnB1dDogc3RyaW5nKSA9PiBzdHJpbmcsIGZvbGRlclVSSVM6IHN0cmluZ1tdLCBmaWxlVVJJUzogc3RyaW5nW10pIHtcblx0Y29uc3QgdXJsID0gcGF0aFRvVVJJKGlucHV0KTtcblx0Y29uc3QgbWFwcGVkVXJpID0gbWFwRmlsZVVyaSh1cmwuaHJlZik7XG5cdHRyeSB7XG5cdFx0Y29uc3Qgc3RhdCA9IGZzLmxzdGF0U3luYyhmcy5yZWFscGF0aFN5bmMoaW5wdXQpKTtcblxuXHRcdGlmIChzdGF0LmlzRmlsZSgpKSB7XG5cdFx0XHRmaWxlVVJJUy5wdXNoKG1hcHBlZFVyaSk7XG5cdFx0fSBlbHNlIGlmIChzdGF0LmlzRGlyZWN0b3J5KCkpIHtcblx0XHRcdGZvbGRlclVSSVMucHVzaChtYXBwZWRVcmkpO1xuXHRcdH0gZWxzZSBpZiAoaW5wdXQgPT09ICcvZGV2L251bGwnKSB7XG5cdFx0XHQvLyBoYW5kbGUgL2Rldi9udWxsIHBhc3NlZCB0byB1cyBieSBleHRlcm5hbCB0b29scyBzdWNoIGFzIGBnaXQgZGlmZnRvb2xgXG5cdFx0XHRmaWxlVVJJUy5wdXNoKG1hcHBlZFVyaSk7XG5cdFx0fVxuXHR9IGNhdGNoIChlKSB7XG5cdFx0aWYgKGUuY29kZSA9PT0gJ0VOT0VOVCcpIHtcblx0XHRcdGZpbGVVUklTLnB1c2gobWFwcGVkVXJpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc29sZS5sb2coYFByb2JsZW0gYWNjZXNzaW5nIGZpbGUgJHtpbnB1dH0uIElnbm9yaW5nIGZpbGVgLCBlKTtcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gbWFwRmlsZVRvUmVtb3RlVXJpKHVyaTogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIHVyaS5yZXBsYWNlKC9eZmlsZTpcXC9cXC8vLCAndnNjb2RlLXJlbW90ZTovLycgKyBjbGlSZW1vdGVBdXRob3JpdHkpO1xufVxuXG5mdW5jdGlvbiBnZXRBcHBSb290KCkge1xuXHRyZXR1cm4gZGlybmFtZShGaWxlQWNjZXNzLmFzRmlsZVVyaSgnJykuZnNQYXRoKTtcbn1cblxuY29uc3QgWywgLCBwcm9kdWN0TmFtZSwgdmVyc2lvbiwgY29tbWl0LCBleGVjdXRhYmxlTmFtZSwgLi4ucmVtYWluaW5nQXJnc10gPSBwcm9jZXNzLmFyZ3Y7XG5tYWluKHsgcHJvZHVjdE5hbWUsIHZlcnNpb24sIGNvbW1pdCwgZXhlY3V0YWJsZU5hbWUgfSwgcmVtYWluaW5nQXJncykudGhlbihudWxsLCBlcnIgPT4ge1xuXHRjb25zb2xlLmVycm9yKGVyci5tZXNzYWdlIHx8IGVyci5zdGFjayB8fCBlcnIpO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFFBQVE7QUFDcEIsU0FBUyxxQkFBcUI7QUFDOUIsWUFBWSxRQUFRO0FBRXBCLFNBQVMsV0FBVztBQUNwQixTQUFTLFNBQVMsU0FBUyxTQUFTLFlBQVk7QUFDaEQsU0FBUyxXQUFXLGtCQUFrQixxQkFBcUIsZUFBa0Q7QUFFN0csU0FBUyxnQ0FBZ0M7QUFFekMsU0FBUyxvQkFBb0Isa0JBQWtCLHFCQUFxQjtBQUNwRSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGtCQUFrQjtBQXFCM0IsTUFBTSxvQkFBb0IsQ0FBQyxhQUFxQztBQUMvRCxVQUFRLFVBQVU7QUFBQSxJQUNqQixLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQ0osYUFBTztBQUFBLElBQ1I7QUFDQyxhQUFPO0FBQUEsRUFDVDtBQUNEO0FBRUEsTUFBTSxxQkFBcUIsQ0FBQyxhQUFxQztBQUNoRSxVQUFRLFVBQVU7QUFBQSxJQUNqQixLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQ0osYUFBTztBQUFBLElBQ1I7QUFDQyxhQUFPO0FBQUEsRUFDVDtBQUNEO0FBRUEsTUFBTSxVQUFVLFFBQVEsSUFBSSxxQkFBcUI7QUFDakQsTUFBTSxhQUFhLFFBQVEsSUFBSSx1QkFBdUI7QUFDdEQsTUFBTSxnQkFBZ0IsUUFBUSxJQUFJLDJCQUEyQjtBQUM3RCxNQUFNLHFCQUFxQixRQUFRLElBQUksc0JBQXNCO0FBQzdELE1BQU0sbUJBQW1CLFFBQVEsSUFBSSx3QkFBd0I7QUFFN0QsZUFBc0IsS0FBSyxNQUEwQixNQUErQjtBQUNuRixNQUFJLENBQUMsV0FBVyxDQUFDLFlBQVk7QUFDNUIsWUFBUSxJQUFJLDJFQUEyRTtBQUN2RjtBQUFBLEVBQ0Q7QUFHQSxRQUFNLFVBQTBELEVBQUUsR0FBRyxTQUFTLGVBQWUsRUFBRSxNQUFNLFNBQVMsR0FBRyxjQUFjLEVBQUUsTUFBTSxVQUFVLEVBQUU7QUFDbkosUUFBTSxjQUFjLGFBQWEsb0JBQW9CO0FBQ3JELGFBQVcsWUFBWSxTQUFTO0FBQy9CLFVBQU0sUUFBZ0M7QUFDdEMsUUFBSSxDQUFDLFlBQVksS0FBSyxHQUFHO0FBQ3hCLGFBQU8sUUFBUSxLQUFLO0FBQUEsSUFDckI7QUFBQSxFQUNEO0FBRUEsTUFBSSxTQUFTO0FBQ1osWUFBUSxjQUFjLElBQUksRUFBRSxNQUFNLFVBQVU7QUFBQSxFQUM3QztBQUVBLFFBQU0sZ0JBQStCO0FBQUEsSUFDcEMsa0JBQWtCLENBQUMsSUFBWSxjQUFzQjtBQUNwRCxjQUFRLE1BQU0sV0FBVyxFQUFFLDJDQUEyQyxTQUFTLEdBQUc7QUFBQSxJQUNuRjtBQUFBLElBQ0EsY0FBYyxDQUFDLE9BQU87QUFDckIsY0FBUSxNQUFNLG9CQUFvQixFQUFFLDZCQUE2QjtBQUFBLElBQ2xFO0FBQUEsSUFDQSxpQkFBaUIsQ0FBQyxPQUFlO0FBQ2hDLGNBQVEsTUFBTSxvQkFBb0IsRUFBRSx3QkFBd0IsS0FBSyxjQUFjLEdBQUc7QUFBQSxJQUNuRjtBQUFBLElBQ0Esb0JBQW9CLENBQUMsa0JBQTBCLFlBQW9CO0FBQ2xFLGNBQVEsS0FBSyxXQUFXLGdCQUFnQixvQkFBb0IsT0FBTyxFQUFFO0FBQUEsSUFDdEU7QUFBQSxFQUNEO0FBRUEsUUFBTSxhQUFhLFVBQVUsTUFBTSxTQUFTLGFBQWE7QUFDekQsUUFBTSxhQUFhLHFCQUFxQixxQkFBcUIsQ0FBQyxRQUFnQjtBQUU5RSxRQUFNLFVBQVUsQ0FBQyxDQUFDLFdBQVcsU0FBUztBQUV0QyxNQUFJLFdBQVcsTUFBTTtBQUNwQixZQUFRLElBQUksaUJBQWlCLEtBQUssYUFBYSxLQUFLLGdCQUFnQixLQUFLLFNBQVMsT0FBTyxDQUFDO0FBQzFGO0FBQUEsRUFDRDtBQUNBLE1BQUksV0FBVyxTQUFTO0FBQ3ZCLFlBQVEsSUFBSSxvQkFBb0IsS0FBSyxTQUFTLEtBQUssTUFBTSxDQUFDO0FBQzFEO0FBQUEsRUFDRDtBQUNBLE1BQUksV0FBVywrQkFBK0IsR0FBRztBQUNoRCxRQUFJO0FBQ0osWUFBUSxXQUFXLCtCQUErQixHQUFHO0FBQUE7QUFBQSxNQUVwRCxLQUFLO0FBQVEsZUFBTztBQUE0QjtBQUFBO0FBQUEsTUFFaEQsS0FBSztBQUFRLGVBQU87QUFBd0I7QUFBQTtBQUFBLE1BRTVDLEtBQUs7QUFBTyxlQUFPO0FBQTJCO0FBQUE7QUFBQSxNQUU5QyxLQUFLO0FBQVEsZUFBTztBQUF5QjtBQUFBLE1BQzdDO0FBQVMsY0FBTSxJQUFJLE1BQU0saUVBQWlFO0FBQUEsSUFDM0Y7QUFDQSxZQUFRLElBQUksS0FBSyxXQUFXLEdBQUcsT0FBTyxNQUFNLGFBQWEsV0FBVyxZQUFZLFVBQVUsV0FBVyxJQUFJLENBQUM7QUFDMUc7QUFBQSxFQUNEO0FBQ0EsTUFBSSxTQUFTO0FBQ1osUUFBSSxXQUFXLGNBQWMsR0FBRztBQUMvQixZQUFNLGNBQWMsV0FBVyxHQUFHLEdBQUcsT0FBTztBQUM1QztBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBRUEsTUFBSSxTQUFvQyxXQUFXO0FBQ25ELE1BQUksV0FBVyxXQUFXLFdBQVcsV0FBVyxXQUFXLElBQUk7QUFDOUQsYUFBUztBQUFBLEVBQ1Y7QUFFQSxRQUFNLGNBQWMsV0FBVyxZQUFZLEtBQUssQ0FBQyxHQUFHLElBQUksVUFBVTtBQUNsRSxhQUFXLFlBQVksSUFBSTtBQUUzQixRQUFNLFlBQVksV0FBVyxVQUFVLEtBQUssQ0FBQyxHQUFHLElBQUksVUFBVTtBQUM5RCxhQUFXLFVBQVUsSUFBSTtBQUV6QixRQUFNLGFBQWEsV0FBVyxHQUFHO0FBQ2pDLE1BQUksa0JBQWtCO0FBQ3RCLGFBQVcsU0FBUyxZQUFZO0FBQy9CLFFBQUksVUFBVSxLQUFLO0FBQ2xCLHdCQUFrQjtBQUFBLElBQ25CLE9BQU87QUFDTixvQkFBYyxPQUFPLFlBQVksWUFBWSxRQUFRO0FBQUEsSUFDdEQ7QUFBQSxFQUNEO0FBRUEsYUFBVyxHQUFHLElBQUksQ0FBQztBQUVuQixNQUFJO0FBQ0osTUFBSTtBQUVKLE1BQUksbUJBQW1CLG1CQUFtQixHQUFHO0FBQzVDLFFBQUk7QUFDSCxzQkFBZ0I7QUFDaEIsVUFBSSxDQUFDLGVBQWU7QUFDbkIsd0JBQWdCLGlCQUFpQjtBQUNqQyxjQUFNLG9CQUFvQixJQUFJLGdCQUFzQjtBQUNwRCxjQUFNLGNBQWMsZUFBZSxTQUFTLE1BQU0sa0JBQWtCLFNBQVMsQ0FBQztBQUM5RSxZQUFJLENBQUMsV0FBVyxNQUFNO0FBSXJCLGlDQUF1QixrQkFBa0I7QUFBQSxRQUMxQztBQUFBLE1BQ0Q7QUFHQSxvQkFBYyxlQUFlLFlBQVksWUFBWSxRQUFRO0FBRzdELGlCQUFXLDZCQUE2QixJQUFJO0FBRTVDLGNBQVEsSUFBSSwyQkFBMkIsYUFBYSxFQUFFO0FBQUEsSUFDdkQsU0FBUyxHQUFHO0FBQ1gsY0FBUSxJQUFJLDRDQUE0QyxFQUFFLFNBQVMsQ0FBQyxFQUFFO0FBQUEsSUFDdkU7QUFBQSxFQUNEO0FBRUEsTUFBSSxXQUFXLDBCQUEwQjtBQUN4QyxlQUFXLDJCQUEyQixXQUFXLHlCQUF5QixJQUFJLE9BQUssV0FBVyxVQUFVLENBQUMsRUFBRSxJQUFJLENBQUM7QUFBQSxFQUNqSDtBQUVBLE1BQUksV0FBVyxvQkFBb0I7QUFDbEMsZUFBVyxxQkFBcUIsV0FBVyxVQUFVLFdBQVcsb0JBQW9CLENBQUMsRUFBRSxJQUFJO0FBQUEsRUFDNUY7QUFFQSxRQUFNLHlCQUF5QixXQUFXLDBCQUEwQjtBQUNwRSxNQUFJLDJCQUEyQixVQUFhLENBQUMsdUJBQXVCLE1BQU0sb0JBQW9CLEdBQUc7QUFDaEcsWUFBUSxJQUFJLGlDQUFpQyxzQkFBc0Isc0RBQXNEO0FBQ3pIO0FBQUEsRUFDRDtBQUVBLE1BQUksWUFBWTtBQUNmLFFBQUksV0FBVyxtQkFBbUIsTUFBTSxVQUFhLFdBQVcscUJBQXFCLE1BQU0sVUFBYSxXQUFXLGlCQUFpQixLQUFLLFdBQVcsbUJBQW1CLEdBQUc7QUFDekssWUFBTSxVQUFvQixDQUFDO0FBQzNCLGlCQUFXLG1CQUFtQixHQUFHLFFBQVEsUUFBTSxRQUFRLEtBQUssdUJBQXVCLEVBQUUsQ0FBQztBQUN0RixpQkFBVyxxQkFBcUIsR0FBRyxRQUFRLFFBQU0sUUFBUSxLQUFLLHlCQUF5QixFQUFFLENBQUM7QUFDMUYsT0FBQyxtQkFBbUIsU0FBUyxpQkFBaUIsVUFBVSxFQUFFLFFBQVEsU0FBTztBQUN4RSxjQUFNLFFBQVEsV0FBbUMsR0FBRztBQUNwRCxZQUFJLFVBQVUsUUFBVztBQUN4QixrQkFBUSxLQUFLLEtBQUssR0FBRyxJQUFJLEtBQUssRUFBRTtBQUFBLFFBQ2pDO0FBQUEsTUFDRCxDQUFDO0FBQ0QsVUFBSSxXQUFXLG1CQUFtQixHQUFHO0FBQ3BDLGdCQUFRLEtBQUsscUJBQXFCO0FBQUEsTUFDbkM7QUFFQSxZQUFNLGVBQWUsR0FBRyxLQUFLLFdBQVcsVUFBVSxhQUFhLEVBQUUsUUFBUSxTQUFTLEVBQUUsT0FBTyxVQUFVLENBQUM7QUFDdEcsbUJBQWEsR0FBRyxTQUFTLFNBQU8sUUFBUSxJQUFJLEdBQUcsQ0FBQztBQUNoRDtBQUFBLElBQ0Q7QUFFQSxVQUFNLGlCQUEyQixDQUFDO0FBQ2xDLGVBQVcsT0FBTyxZQUFZO0FBQzdCLFlBQU0sTUFBTSxXQUFXLEdBQThCO0FBQ3JELFVBQUksT0FBTyxRQUFRLFdBQVc7QUFDN0IsWUFBSSxLQUFLO0FBQ1IseUJBQWUsS0FBSyxPQUFPLEdBQUc7QUFBQSxRQUMvQjtBQUFBLE1BQ0QsV0FBVyxNQUFNLFFBQVEsR0FBRyxHQUFHO0FBQzlCLG1CQUFXLFNBQVMsS0FBSztBQUN4Qix5QkFBZSxLQUFLLEtBQUssR0FBRyxJQUFJLE1BQU0sU0FBUyxDQUFDLEVBQUU7QUFBQSxRQUNuRDtBQUFBLE1BQ0QsV0FBVyxLQUFLO0FBQ2YsdUJBQWUsS0FBSyxLQUFLLEdBQUcsSUFBSSxJQUFJLFNBQVMsQ0FBQyxFQUFFO0FBQUEsTUFDakQ7QUFBQSxJQUNEO0FBQ0EsUUFBSSxXQUFXLE1BQU07QUFDcEIscUJBQWUsS0FBSyxZQUFZLFVBQVUsa0JBQWtCLEVBQUU7QUFBQSxJQUMvRDtBQUVBLFVBQU0sTUFBTSxRQUFRLFVBQVU7QUFDOUIsUUFBSSxRQUFRLFVBQVUsUUFBUSxRQUFRO0FBQ3JDLFlBQU0sYUFBYSxpQkFBaUIsSUFBSTtBQUN4QyxVQUFJLFNBQVM7QUFDWixnQkFBUSxJQUFJLHdCQUF3QixVQUFVLElBQUksZUFBZSxLQUFLLEdBQUcsQ0FBQyxPQUFPLFVBQVUsRUFBRTtBQUFBLE1BQzlGO0FBQ0EsU0FBRyxNQUFNLFdBQVcsQ0FBQyxNQUFNLFlBQVksR0FBRyxjQUFjLEdBQUc7QUFBQSxRQUMxRCxPQUFPO0FBQUEsUUFDUCxLQUFLO0FBQUEsTUFDTixDQUFDO0FBQUEsSUFDRixPQUFPO0FBQ04sWUFBTSxTQUFTLFFBQVEsVUFBVTtBQUNqQyxZQUFNLE1BQU0sRUFBRSxHQUFHLFFBQVEsS0FBSyxzQkFBc0IsSUFBSTtBQUN4RCxZQUFNLGdCQUFnQixLQUFLLE9BQU8sVUFBVSxHQUFHLEVBQUU7QUFDakQsVUFBSSxHQUFHLFdBQVcsS0FBSyxRQUFRLGFBQWEsQ0FBQyxHQUFHO0FBQy9DLHVCQUFlLFFBQVEsR0FBRyxhQUFhLDJCQUEyQjtBQUFBLE1BQ25FLE9BQU87QUFDTix1QkFBZSxRQUFRLDBCQUEwQjtBQUFBLE1BQ2xEO0FBQ0EsVUFBSSxTQUFTO0FBQ1osZ0JBQVEsSUFBSSxpQkFBaUIsTUFBTSxnQ0FBZ0MsVUFBVSxNQUFNLGVBQWUsS0FBSyxLQUFLLENBQUMsR0FBRztBQUFBLE1BQ2pIO0FBQ0EsVUFBSSxjQUFjLEdBQUc7QUFDcEIsWUFBSSxTQUFTO0FBQ1osa0JBQVEsSUFBSSx5QkFBeUI7QUFBQSxRQUN0QztBQUNBLGNBQU0sZUFBZSxHQUFHLE1BQU0sWUFBWSxnQkFBZ0IsRUFBRSxLQUFLLFFBQVEsS0FBSyxPQUFPLENBQUMsV0FBVyxRQUFRLE1BQU0sRUFBRSxDQUFDO0FBQ2xILHFCQUFhLE9BQU8sR0FBRyxRQUFRLFVBQVEsUUFBUSxPQUFPLE1BQU0sSUFBSSxDQUFDO0FBQ2pFLHFCQUFhLE9BQU8sR0FBRyxRQUFRLFVBQVEsUUFBUSxPQUFPLE1BQU0sSUFBSSxDQUFDO0FBQUEsTUFDbEUsT0FBTztBQUNOLFdBQUcsTUFBTSxZQUFZLGdCQUFnQixFQUFFLEtBQUssUUFBUSxLQUFLLE9BQU8sVUFBVSxDQUFDO0FBQUEsTUFDNUU7QUFBQSxJQUNEO0FBQUEsRUFDRCxPQUFPO0FBQ04sUUFBSSxXQUFXLFFBQVE7QUFDdEIsWUFBTSxXQUFXO0FBQUEsUUFDaEIsTUFBTTtBQUFBLE1BQ1AsR0FBRyxPQUFPLEVBQUUsS0FBSyxDQUFDLFFBQWdCO0FBQ2pDLGdCQUFRLElBQUksR0FBRztBQUFBLE1BQ2hCLENBQUMsRUFBRSxNQUFNLE9BQUs7QUFDYixnQkFBUSxNQUFNLGlDQUFpQyxDQUFDO0FBQUEsTUFDakQsQ0FBQztBQUNEO0FBQUEsSUFDRDtBQUVBLFFBQUksV0FBVyxtQkFBbUIsTUFBTSxVQUFhLFdBQVcscUJBQXFCLE1BQU0sVUFBYSxXQUFXLGlCQUFpQixLQUFLLFdBQVcsbUJBQW1CLEdBQUc7QUFDekssWUFBTSxXQUFXO0FBQUEsUUFDaEIsTUFBTTtBQUFBLFFBQ04sTUFBTSxXQUFXLGlCQUFpQixJQUFJLEVBQUUsY0FBYyxXQUFXLGVBQWUsR0FBRyxVQUFVLFdBQVcsVUFBVSxFQUFFLElBQUk7QUFBQSxRQUN4SCxTQUFTLG9CQUFvQixXQUFXLG1CQUFtQixDQUFDO0FBQUEsUUFDNUQsV0FBVyxvQkFBb0IsV0FBVyxxQkFBcUIsQ0FBQztBQUFBLFFBQ2hFLE9BQU8sV0FBVyxPQUFPO0FBQUEsTUFDMUIsR0FBRyxPQUFPLEVBQUUsS0FBSyxDQUFDLFFBQWdCO0FBQ2pDLGdCQUFRLElBQUksR0FBRztBQUFBLE1BQ2hCLENBQUMsRUFBRSxNQUFNLE9BQUs7QUFDYixnQkFBUSxNQUFNLHlEQUF5RCxDQUFDO0FBQUEsTUFDekUsQ0FBQztBQUNEO0FBQUEsSUFDRDtBQUVBLFFBQUkscUJBQXlDO0FBQzdDLFFBQUksV0FBVyxNQUFNLEdBQUc7QUFDdkIsVUFBSSxDQUFDLFNBQVMsUUFBUTtBQUNyQixnQkFBUSxJQUFJLGlEQUFpRDtBQUM3RDtBQUFBLE1BQ0Q7QUFDQSwyQkFBcUIseUJBQXlCLE9BQU87QUFBQSxJQUN0RDtBQUVBLFVBQU0sV0FBVztBQUFBLE1BQ2hCLE1BQU07QUFBQSxNQUNOO0FBQUEsTUFDQTtBQUFBLE1BQ0EsVUFBVSxXQUFXO0FBQUEsTUFDckIsV0FBVyxXQUFXO0FBQUEsTUFDdEIsU0FBUyxXQUFXO0FBQUEsTUFDcEIsWUFBWSxXQUFXO0FBQUEsTUFDdkIsY0FBYyxXQUFXO0FBQUEsTUFDekIsa0JBQWtCLFdBQVcsY0FBYztBQUFBLE1BQzNDLGdCQUFnQixXQUFXLFlBQVk7QUFBQSxNQUN2QztBQUFBLE1BQ0EsaUJBQWlCO0FBQUEsSUFDbEIsR0FBRyxPQUFPLEVBQUUsTUFBTSxPQUFLO0FBQ3RCLGNBQVEsTUFBTSx5Q0FBeUMsQ0FBQztBQUFBLElBQ3pELENBQUM7QUFFRCxRQUFJLG9CQUFvQjtBQUN2QixZQUFNLG1CQUFtQixrQkFBa0I7QUFBQSxJQUM1QztBQUVBLFFBQUksc0JBQXNCO0FBQ3pCLFlBQU07QUFBQSxJQUVQO0FBRUEsUUFBSSxzQkFBc0IsZUFBZTtBQUN4QyxVQUFJO0FBQ0gsV0FBRyxXQUFXLGFBQWE7QUFBQSxNQUM1QixTQUFTLEdBQUc7QUFBQSxNQUVaO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFFRDtBQUVBLFNBQVMsZ0JBQXlCO0FBQ2pDLE1BQUksQ0FBQyxDQUFDLFFBQVEsSUFBSSxpQkFBaUIsR0FBRztBQUNyQyxRQUFJO0FBQ0gsYUFBTyxHQUFHLFNBQVMsWUFBWSxFQUFFLFVBQVUsT0FBTyxDQUFDLEVBQUUsU0FBUyxhQUFhO0FBQUEsSUFDNUUsU0FBUyxJQUFJO0FBQUEsSUFFYjtBQUFBLEVBQ0Q7QUFDQSxTQUFPO0FBQ1I7QUFFQSxlQUFlLG1CQUFtQixNQUFjO0FBQy9DLFNBQU8sR0FBRyxXQUFXLElBQUksR0FBRztBQUMzQixVQUFNLElBQUksUUFBUSxTQUFPLFdBQVcsS0FBSyxHQUFJLENBQUM7QUFBQSxFQUMvQztBQUNEO0FBRUEsZUFBZSxjQUFjLE1BQWdCLFNBQWtCO0FBQzlELFFBQU0sT0FBaUIsQ0FBQztBQUN4QixhQUFXLFlBQVksTUFBTTtBQUM1QixRQUFJO0FBQ0gsVUFBSSxrQkFBa0IsS0FBSyxRQUFRLEdBQUc7QUFDckMsYUFBSyxLQUFLLElBQUksSUFBSSxRQUFRLEVBQUUsSUFBSTtBQUFBLE1BQ2pDLE9BQU87QUFDTixhQUFLLEtBQUssVUFBVSxRQUFRLEVBQUUsSUFBSTtBQUFBLE1BQ25DO0FBQUEsSUFDRCxTQUFTLEdBQUc7QUFDWCxjQUFRLElBQUksZ0JBQWdCLFFBQVEsRUFBRTtBQUFBLElBQ3ZDO0FBQUEsRUFDRDtBQUNBLE1BQUksS0FBSyxRQUFRO0FBQ2hCLFVBQU0sV0FBVztBQUFBLE1BQ2hCLE1BQU07QUFBQSxNQUNOO0FBQUEsSUFDRCxHQUFHLE9BQU8sRUFBRSxNQUFNLE9BQUs7QUFDdEIsY0FBUSxNQUFNLGtEQUFrRCxDQUFDO0FBQUEsSUFDbEUsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQUVBLGVBQWUsV0FBVyxNQUFtQixTQUFtQztBQUMvRSxRQUFNLE9BQU8sTUFBTSxPQUFPLE1BQU07QUFDaEMsTUFBSSxTQUFTO0FBQ1osWUFBUSxJQUFJLEtBQUssVUFBVSxNQUFNLE1BQU0sSUFBSSxDQUFDO0FBQUEsRUFDN0M7QUFDQSxTQUFPLElBQUksUUFBZ0IsQ0FBQ0EsVUFBUyxXQUFXO0FBQy9DLFVBQU0sVUFBVSxLQUFLLFVBQVUsSUFBSTtBQUNuQyxRQUFJLENBQUMsU0FBUztBQUNiLGNBQVEsSUFBSSxhQUFhLE9BQU87QUFDaEMsTUFBQUEsU0FBUSxFQUFFO0FBQ1Y7QUFBQSxJQUNEO0FBRUEsVUFBTSxPQUE0QjtBQUFBLE1BQ2pDLFlBQVk7QUFBQSxNQUNaLE1BQU07QUFBQSxNQUNOLFFBQVE7QUFBQSxNQUNSLFNBQVM7QUFBQSxRQUNSLGdCQUFnQjtBQUFBLFFBQ2hCLFVBQVU7QUFBQSxNQUNYO0FBQUEsSUFDRDtBQUVBLFVBQU0sTUFBTSxLQUFLLFFBQVEsTUFBTSxTQUFPO0FBQ3JDLFVBQUksSUFBSSxRQUFRLGNBQWMsTUFBTSxvQkFBb0I7QUFDdkQsZUFBTywrRUFBaUYsSUFBSSxRQUFRLGNBQWMsQ0FBQztBQUNuSDtBQUFBLE1BQ0Q7QUFFQSxZQUFNLFNBQW1CLENBQUM7QUFDMUIsVUFBSSxZQUFZLE1BQU07QUFDdEIsVUFBSSxHQUFHLFFBQVEsV0FBUztBQUN2QixlQUFPLEtBQUssS0FBSztBQUFBLE1BQ2xCLENBQUM7QUFDRCxVQUFJLEdBQUcsU0FBUyxDQUFDLFFBQVEsTUFBTSxzQkFBc0IsR0FBRyxDQUFDO0FBQ3pELFVBQUksR0FBRyxPQUFPLE1BQU07QUFDbkIsY0FBTSxVQUFVLE9BQU8sS0FBSyxFQUFFO0FBQzlCLFlBQUk7QUFDSCxnQkFBTSxNQUFNLEtBQUssTUFBTSxPQUFPO0FBQzlCLGNBQUksSUFBSSxlQUFlLEtBQUs7QUFDM0IsWUFBQUEsU0FBUSxHQUFHO0FBQUEsVUFDWixPQUFPO0FBQ04sbUJBQU8sR0FBRztBQUFBLFVBQ1g7QUFBQSxRQUNELFNBQVMsR0FBRztBQUNYLGlCQUFPLDBEQUEwRCxPQUFPO0FBQUEsUUFDekU7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxRQUFJLEdBQUcsU0FBUyxDQUFDLFFBQVEsTUFBTSxxQkFBcUIsR0FBRyxDQUFDO0FBQ3hELFFBQUksTUFBTSxPQUFPO0FBQ2pCLFFBQUksSUFBSTtBQUFBLEVBQ1QsQ0FBQztBQUNGO0FBRUEsU0FBUyxvQkFBb0IsUUFBOEI7QUFDMUQsU0FBTyxRQUFRLElBQUksV0FBUyxXQUFXLEtBQUssS0FBSyxJQUFJLFVBQVUsS0FBSyxFQUFFLE9BQU8sS0FBSztBQUNuRjtBQUVBLFNBQVMsTUFBTSxTQUFpQixLQUFvQjtBQUNuRCxVQUFRLE1BQU0sMENBQTBDLE9BQU87QUFDL0QsVUFBUSxNQUFNLEdBQUc7QUFDakIsVUFBUSxLQUFLLENBQUM7QUFDZjtBQUVBLE1BQU0sZUFBZSxRQUFRLElBQUksT0FBTyxJQUFJO0FBRTVDLFNBQVMsVUFBVSxPQUFvQjtBQUN0QyxVQUFRLE1BQU0sS0FBSztBQUNuQixVQUFRLFFBQVEsY0FBYyxLQUFLO0FBRW5DLFNBQU8sY0FBYyxLQUFLO0FBQzNCO0FBRUEsU0FBUyxjQUFjLE9BQWUsWUFBdUMsWUFBc0IsVUFBb0I7QUFDdEgsUUFBTSxNQUFNLFVBQVUsS0FBSztBQUMzQixRQUFNLFlBQVksV0FBVyxJQUFJLElBQUk7QUFDckMsTUFBSTtBQUNILFVBQU0sT0FBTyxHQUFHLFVBQVUsR0FBRyxhQUFhLEtBQUssQ0FBQztBQUVoRCxRQUFJLEtBQUssT0FBTyxHQUFHO0FBQ2xCLGVBQVMsS0FBSyxTQUFTO0FBQUEsSUFDeEIsV0FBVyxLQUFLLFlBQVksR0FBRztBQUM5QixpQkFBVyxLQUFLLFNBQVM7QUFBQSxJQUMxQixXQUFXLFVBQVUsYUFBYTtBQUVqQyxlQUFTLEtBQUssU0FBUztBQUFBLElBQ3hCO0FBQUEsRUFDRCxTQUFTLEdBQUc7QUFDWCxRQUFJLEVBQUUsU0FBUyxVQUFVO0FBQ3hCLGVBQVMsS0FBSyxTQUFTO0FBQUEsSUFDeEIsT0FBTztBQUNOLGNBQVEsSUFBSSwwQkFBMEIsS0FBSyxtQkFBbUIsQ0FBQztBQUFBLElBQ2hFO0FBQUEsRUFDRDtBQUNEO0FBRUEsU0FBUyxtQkFBbUIsS0FBcUI7QUFDaEQsU0FBTyxJQUFJLFFBQVEsY0FBYyxxQkFBcUIsa0JBQWtCO0FBQ3pFO0FBRUEsU0FBUyxhQUFhO0FBQ3JCLFNBQU8sUUFBUSxXQUFXLFVBQVUsRUFBRSxFQUFFLE1BQU07QUFDL0M7QUFFQSxNQUFNLENBQUMsRUFBRSxFQUFFLGFBQWEsU0FBUyxRQUFRLGdCQUFnQixHQUFHLGFBQWEsSUFBSSxRQUFRO0FBQ3JGLEtBQUssRUFBRSxhQUFhLFNBQVMsUUFBUSxlQUFlLEdBQUcsYUFBYSxFQUFFLEtBQUssTUFBTSxTQUFPO0FBQ3ZGLFVBQVEsTUFBTSxJQUFJLFdBQVcsSUFBSSxTQUFTLEdBQUc7QUFDOUMsQ0FBQzsiLAogICJuYW1lcyI6IFsicmVzb2x2ZSJdCn0K
