import { spawn } from "child_process";
import { chmodSync, existsSync, readFileSync, statSync, truncateSync, unlinkSync } from "fs";
import { homedir, tmpdir } from "os";
import { startProfiling } from "../../base/node/profiling.js";
import { Event } from "../../base/common/event.js";
import { isAbsolute, resolve, join, dirname } from "../../base/common/path.js";
import { isMacintosh, isWindows } from "../../base/common/platform.js";
import { randomPort } from "../../base/common/ports.js";
import { whenDeleted, writeFileSync } from "../../base/node/pfs.js";
import { findFreePort } from "../../base/node/ports.js";
import { watchFileContents } from "../../platform/files/node/watcher/nodejs/nodejsWatcherLib.js";
import { buildHelpMessage, buildStdinMessage, buildVersionMessage, NATIVE_CLI_COMMANDS, OPTIONS } from "../../platform/environment/node/argv.js";
import { addArg, parseCLIProcessArgv } from "../../platform/environment/node/argvHelper.js";
import { combineUriFlags } from "./cliArgs.js";
import { getStdinFilePath, hasStdinWithoutTty, readFromStdin, stdinDataListener } from "../../platform/environment/node/stdin.js";
import { createWaitMarkerFileSync } from "../../platform/environment/node/wait.js";
import product from "../../platform/product/common/product.js";
import { CancellationTokenSource } from "../../base/common/cancellation.js";
import { isUNC, randomPath } from "../../base/common/extpath.js";
import { Utils } from "../../platform/profiling/common/profiling.js";
import { FileAccess } from "../../base/common/network.js";
import { cwd } from "../../base/common/process.js";
import { addUNCHostToAllowlist } from "../../base/node/unc.js";
import { URI } from "../../base/common/uri.js";
import { DeferredPromise } from "../../base/common/async.js";
function shouldSpawnCliProcess(argv) {
  return !!argv["install-source"] || !!argv["list-extensions"] || !!argv["install-extension"] || !!argv["uninstall-extension"] || !!argv["update-extensions"] || !!argv["locate-extension"] || !!argv["add-mcp"] || !!argv["telemetry"];
}
async function main(argv) {
  let args;
  try {
    args = parseCLIProcessArgv(argv);
  } catch (err) {
    console.error(err.message);
    return;
  }
  for (const subcommand of NATIVE_CLI_COMMANDS) {
    if (args[subcommand]) {
      if (!product.tunnelApplicationName) {
        console.error(`'${subcommand}' command not supported in ${product.applicationName}`);
        return;
      }
      const env = {
        ...process.env
      };
      delete env["ELECTRON_RUN_AS_NODE"];
      const tunnelArgs = argv.slice(argv.indexOf(subcommand) + 1);
      return new Promise((resolve2, reject) => {
        let tunnelProcess;
        const stdio = ["ignore", "pipe", "pipe"];
        if (process.env["VSCODE_DEV"]) {
          tunnelProcess = spawn("cargo", ["run", "--", subcommand, ...tunnelArgs], { cwd: join(getAppRoot(), "cli"), stdio, env });
        } else {
          const appPath = process.platform === "darwin" ? join(dirname(dirname(process.execPath)), "Resources", "app") : dirname(process.execPath);
          const tunnelCommand = join(appPath, "bin", `${product.tunnelApplicationName}${isWindows ? ".exe" : ""}`);
          tunnelProcess = spawn(tunnelCommand, [subcommand, ...tunnelArgs], { cwd: cwd(), stdio, env });
        }
        tunnelProcess.stdout.pipe(process.stdout);
        tunnelProcess.stderr.pipe(process.stderr);
        tunnelProcess.on("exit", resolve2);
        tunnelProcess.on("error", reject);
      });
    }
  }
  if (args.help) {
    const executable = `${product.applicationName}${isWindows ? ".exe" : ""}`;
    console.log(buildHelpMessage(product.nameLong, executable, product.version, OPTIONS));
  } else if (args.chat?.help) {
    const executable = `${product.applicationName}${isWindows ? ".exe" : ""}`;
    console.log(buildHelpMessage(product.nameLong, executable, product.version, OPTIONS.chat.options, { isChat: true }));
  } else if (args.version) {
    console.log(buildVersionMessage(product.version, product.commit));
  } else if (args["locate-shell-integration-path"]) {
    let file;
    switch (args["locate-shell-integration-path"]) {
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
  } else if (shouldSpawnCliProcess(args)) {
    let cliProcessMain;
    if (process.env["VSCODE_DEV"]) {
      cliProcessMain = "./cliProcessMain.js";
    } else {
      cliProcessMain = "./vs/code/node/cliProcessMain.js";
    }
    const cli = await import(cliProcessMain);
    await cli.main(args);
    return;
  } else if (args["file-write"]) {
    const argsFile = args._[0];
    if (!argsFile || !isAbsolute(argsFile) || !existsSync(argsFile) || !statSync(argsFile).isFile()) {
      throw new Error("Using --file-write with invalid arguments.");
    }
    let source;
    let target;
    try {
      const argsContents = JSON.parse(readFileSync(argsFile, "utf8"));
      source = argsContents.source;
      target = argsContents.target;
    } catch (error) {
      throw new Error("Using --file-write with invalid arguments.");
    }
    if (isWindows) {
      for (const path of [source, target]) {
        if (typeof path === "string" && isUNC(path)) {
          addUNCHostToAllowlist(URI.file(path).authority);
        }
      }
    }
    if (!source || !target || source === target || // make sure source and target are provided and are not the same
    !isAbsolute(source) || !isAbsolute(target) || // make sure both source and target are absolute paths
    !existsSync(source) || !statSync(source).isFile() || // make sure source exists as file
    !existsSync(target) || !statSync(target).isFile()) {
      throw new Error("Using --file-write with invalid arguments.");
    }
    try {
      let targetMode = 0;
      let restoreMode = false;
      if (args["file-chmod"]) {
        targetMode = statSync(target).mode;
        if (!(targetMode & 128)) {
          chmodSync(target, targetMode | 128);
          restoreMode = true;
        }
      }
      const data = readFileSync(source);
      if (isWindows) {
        truncateSync(target, 0);
        writeFileSync(target, data, { flag: "r+" });
      } else {
        writeFileSync(target, data);
      }
      if (restoreMode) {
        chmodSync(target, targetMode);
      }
    } catch (error) {
      error.message = `Error using --file-write: ${error.message}`;
      throw error;
    }
  } else {
    const env = {
      ...process.env,
      "ELECTRON_NO_ATTACH_CONSOLE": "1"
    };
    delete env["ELECTRON_RUN_AS_NODE"];
    const processCallbacks = [];
    if (args.verbose) {
      env["ELECTRON_ENABLE_LOGGING"] = "1";
    }
    if (args.verbose || args.status) {
      processCallbacks.push(async (child2) => {
        child2.stdout?.on("data", (data) => console.log(data.toString("utf8").trim()));
        child2.stderr?.on("data", (data) => console.log(data.toString("utf8").trim()));
        await Event.toPromise(Event.fromNodeEventEmitter(child2, "exit"));
      });
    }
    if (args["transient"]) {
      const tempParentDir = randomPath(tmpdir(), "vscode");
      const tempUserDataDir = join(tempParentDir, "data");
      const tempExtensionsDir = join(tempParentDir, "extensions");
      const tempSharedDataDir = join(tempParentDir, "shared");
      const tempAgentPluginsDir = join(tempParentDir, "agent-plugins");
      const tempAgentsUserDataDir = join(tempParentDir, "agents-data");
      const tempAgentsExtensionsDir = join(tempParentDir, "agents-extensions");
      addArg(argv, "--user-data-dir", tempUserDataDir);
      addArg(argv, "--extensions-dir", tempExtensionsDir);
      addArg(argv, "--shared-data-dir", tempSharedDataDir);
      addArg(argv, "--agent-plugins-dir", tempAgentPluginsDir);
      addArg(argv, "--agents-user-data-dir", tempAgentsUserDataDir);
      addArg(argv, "--agents-extensions-dir", tempAgentsExtensionsDir);
      console.log(`State is temporarily stored. Relaunch this state with: ${product.applicationName} --user-data-dir "${tempUserDataDir}" --extensions-dir "${tempExtensionsDir}" --shared-data-dir "${tempSharedDataDir}" --agent-plugins-dir "${tempAgentPluginsDir}" --agents-user-data-dir "${tempAgentsUserDataDir}" --agents-extensions-dir "${tempAgentsExtensionsDir}"`);
    }
    const hasReadStdinArg = args._.some((arg) => arg === "-") || args.chat?._.some((arg) => arg === "-");
    if (hasReadStdinArg) {
      args._ = args._.filter((a) => a !== "-");
      argv = argv.filter((a) => a !== "-");
    }
    let stdinFilePath;
    if (hasStdinWithoutTty()) {
      if (hasReadStdinArg) {
        stdinFilePath = getStdinFilePath();
        try {
          const readFromStdinDone = new DeferredPromise();
          await readFromStdin(stdinFilePath, !!args.verbose, () => readFromStdinDone.complete());
          if (!args.wait) {
            processCallbacks.push(() => readFromStdinDone.p);
          }
          if (args.chat) {
            addArg(argv, "--add-file", stdinFilePath);
          } else {
            addArg(argv, stdinFilePath);
            addArg(argv, "--skip-add-to-recently-opened");
          }
          console.log(`Reading from stdin via: ${stdinFilePath}`);
        } catch (e) {
          console.log(`Failed to create file to read via stdin: ${e.toString()}`);
          stdinFilePath = void 0;
        }
      } else {
        processCallbacks.push((_) => stdinDataListener(1e3).then((dataReceived) => {
          if (dataReceived) {
            console.log(buildStdinMessage(product.applicationName, !!args.chat));
          }
        }));
      }
    }
    let waitMarkerFilePath;
    if (args.wait) {
      waitMarkerFilePath = createWaitMarkerFileSync(args.verbose);
      if (waitMarkerFilePath) {
        addArg(argv, "--waitMarkerFilePath", waitMarkerFilePath);
      }
      processCallbacks.push(async (child2) => {
        let childExitPromise;
        if (isMacintosh) {
          childExitPromise = new Promise((resolve2) => {
            child2.on("exit", (code, signal) => {
              if (code !== 0 || signal) {
                resolve2();
              }
            });
          });
        } else {
          childExitPromise = Event.toPromise(Event.fromNodeEventEmitter(child2, "exit"));
        }
        try {
          await Promise.race([
            whenDeleted(waitMarkerFilePath),
            Event.toPromise(Event.fromNodeEventEmitter(child2, "error")),
            childExitPromise
          ]);
        } finally {
          if (stdinFilePath) {
            unlinkSync(stdinFilePath);
          }
        }
      });
    }
    if (args["prof-startup"]) {
      const profileHost = "127.0.0.1";
      const portMain = await findFreePort(randomPort(), 10, 3e3);
      const portRenderer = await findFreePort(portMain + 1, 10, 3e3);
      const portExthost = await findFreePort(portRenderer + 1, 10, 3e3);
      if (portMain * portRenderer * portExthost === 0) {
        throw new Error("Failed to find free ports for profiler. Make sure to shutdown all instances of the editor first.");
      }
      const filenamePrefix = randomPath(homedir(), "prof");
      addArg(argv, `--inspect-brk=${portMain}`);
      addArg(argv, `--remote-debugging-port=${portRenderer}`);
      addArg(argv, `--inspect-brk-extensions=${portExthost}`);
      addArg(argv, `--prof-startup-prefix`, filenamePrefix);
      addArg(argv, `--no-cached-data`);
      writeFileSync(filenamePrefix, argv.slice(-6).join("|"));
      processCallbacks.push(async (_child) => {
        class Profiler {
          static async start(name, filenamePrefix2, opts) {
            let session;
            try {
              session = await startProfiling({ ...opts, host: profileHost });
            } catch (err) {
              console.error(`FAILED to start profiling for '${name}' on port '${opts.port}'`);
            }
            return {
              async stop() {
                if (!session) {
                  return;
                }
                let suffix = "";
                const result = await session.stop();
                if (!process.env["VSCODE_DEV"]) {
                  result.profile = Utils.rewriteAbsolutePaths(result.profile, "piiRemoved");
                  suffix = ".txt";
                }
                writeFileSync(`${filenamePrefix2}.${name}.cpuprofile${suffix}`, JSON.stringify(result.profile, void 0, 4));
              }
            };
          }
        }
        try {
          const mainProfileRequest = Profiler.start("main", filenamePrefix, { port: portMain });
          const extHostProfileRequest = Profiler.start("extHost", filenamePrefix, { port: portExthost, tries: 300 });
          const rendererProfileRequest = Profiler.start("renderer", filenamePrefix, {
            port: portRenderer,
            tries: 200,
            target: function(targets) {
              return targets.filter((target) => {
                if (!target.webSocketDebuggerUrl) {
                  return false;
                }
                if (target.type === "page") {
                  return target.url.indexOf("workbench/workbench.html") > 0 || target.url.indexOf("workbench/workbench-dev.html") > 0;
                } else {
                  return true;
                }
              })[0];
            }
          });
          const main2 = await mainProfileRequest;
          const extHost = await extHostProfileRequest;
          const renderer = await rendererProfileRequest;
          await whenDeleted(filenamePrefix);
          await main2.stop();
          await renderer.stop();
          await extHost.stop();
          writeFileSync(filenamePrefix, "");
        } catch (e) {
          console.error("Failed to profile startup. Make sure to quit Code first.");
        }
      });
    }
    const options = {
      detached: true,
      env
    };
    if (!args.verbose) {
      options["stdio"] = "ignore";
    }
    let child;
    if (!isMacintosh) {
      if (!args.verbose && args.status) {
        options["stdio"] = ["ignore", "pipe", "ignore"];
      }
      const spawnArgs = isWindows ? combineUriFlags(argv.slice(2)) : argv.slice(2);
      child = spawn(process.execPath, spawnArgs, options);
    } else {
      const spawnArgs = ["-n", "-g"];
      spawnArgs.push("-a", process.execPath);
      if (args.verbose || args.status) {
        spawnArgs.push("--wait-apps");
        for (const outputType of args.verbose ? ["stdout", "stderr"] : ["stdout"]) {
          const tmpName = randomPath(tmpdir(), `code-${outputType}`);
          writeFileSync(tmpName, "");
          spawnArgs.push(`--${outputType}`, tmpName);
          processCallbacks.push(async (child2) => {
            try {
              const stream = outputType === "stdout" ? process.stdout : process.stderr;
              const cts = new CancellationTokenSource();
              child2.on("close", () => {
                setTimeout(() => cts.dispose(true), 200);
              });
              await watchFileContents(tmpName, (chunk) => stream.write(chunk), () => {
              }, cts.token);
            } finally {
              unlinkSync(tmpName);
            }
          });
        }
      }
      for (const e in env) {
        if (e !== "_") {
          spawnArgs.push("--env");
          spawnArgs.push(`${e}=${env[e]}`);
        }
      }
      spawnArgs.push("--args", ...argv.slice(2));
      if (env["VSCODE_DEV"]) {
        const curdir = ".";
        const launchDirIndex = spawnArgs.indexOf(curdir);
        if (launchDirIndex !== -1) {
          spawnArgs[launchDirIndex] = resolve(curdir);
        }
      }
      child = spawn("open", spawnArgs, { ...options, env: {} });
    }
    await Promise.all(processCallbacks.map((callback) => callback(child)));
  }
}
function getAppRoot() {
  return dirname(FileAccess.asFileUri("").fsPath);
}
function eventuallyExit(code) {
  setTimeout(() => process.exit(code), 0);
}
main(process.argv).then(() => eventuallyExit(0)).then(null, (err) => {
  console.error(err.message || err.stack || err);
  eventuallyExit(1);
});
export {
  main
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxjb2RlXFxub2RlXFxjbGkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDaGlsZFByb2Nlc3MsIHNwYXduLCBTcGF3bk9wdGlvbnMsIFN0ZGlvT3B0aW9ucyB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0IHsgY2htb2RTeW5jLCBleGlzdHNTeW5jLCByZWFkRmlsZVN5bmMsIHN0YXRTeW5jLCB0cnVuY2F0ZVN5bmMsIHVubGlua1N5bmMgfSBmcm9tICdmcyc7XG5pbXBvcnQgeyBob21lZGlyLCB0bXBkaXIgfSBmcm9tICdvcyc7XG5pbXBvcnQgeyBzdGFydFByb2ZpbGluZywgUHJvZmlsaW5nU2Vzc2lvbiwgVGFyZ2V0IH0gZnJvbSAnLi4vLi4vYmFzZS9ub2RlL3Byb2ZpbGluZy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGlzQWJzb2x1dGUsIHJlc29sdmUsIGpvaW4sIGRpcm5hbWUgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IElQcm9jZXNzRW52aXJvbm1lbnQsIGlzTWFjaW50b3NoLCBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyByYW5kb21Qb3J0IH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vcG9ydHMuanMnO1xuaW1wb3J0IHsgd2hlbkRlbGV0ZWQsIHdyaXRlRmlsZVN5bmMgfSBmcm9tICcuLi8uLi9iYXNlL25vZGUvcGZzLmpzJztcbmltcG9ydCB7IGZpbmRGcmVlUG9ydCB9IGZyb20gJy4uLy4uL2Jhc2Uvbm9kZS9wb3J0cy5qcyc7XG5pbXBvcnQgeyB3YXRjaEZpbGVDb250ZW50cyB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2ZpbGVzL25vZGUvd2F0Y2hlci9ub2RlanMvbm9kZWpzV2F0Y2hlckxpYi5qcyc7XG5pbXBvcnQgeyBOYXRpdmVQYXJzZWRBcmdzIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2FyZ3YuanMnO1xuaW1wb3J0IHsgYnVpbGRIZWxwTWVzc2FnZSwgYnVpbGRTdGRpbk1lc3NhZ2UsIGJ1aWxkVmVyc2lvbk1lc3NhZ2UsIE5BVElWRV9DTElfQ09NTUFORFMsIE9QVElPTlMgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9ub2RlL2FyZ3YuanMnO1xuaW1wb3J0IHsgYWRkQXJnLCBwYXJzZUNMSVByb2Nlc3NBcmd2IH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvbm9kZS9hcmd2SGVscGVyLmpzJztcbmltcG9ydCB7IGNvbWJpbmVVcmlGbGFncyB9IGZyb20gJy4vY2xpQXJncy5qcyc7XG5pbXBvcnQgeyBnZXRTdGRpbkZpbGVQYXRoLCBoYXNTdGRpbldpdGhvdXRUdHksIHJlYWRGcm9tU3RkaW4sIHN0ZGluRGF0YUxpc3RlbmVyIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvbm9kZS9zdGRpbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVXYWl0TWFya2VyRmlsZVN5bmMgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9ub2RlL3dhaXQuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBpc1VOQywgcmFuZG9tUGF0aCB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2V4dHBhdGguanMnO1xuaW1wb3J0IHsgVXRpbHMgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9wcm9maWxpbmcvY29tbW9uL3Byb2ZpbGluZy5qcyc7XG5pbXBvcnQgeyBGaWxlQWNjZXNzIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBjd2QgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9wcm9jZXNzLmpzJztcbmltcG9ydCB7IGFkZFVOQ0hvc3RUb0FsbG93bGlzdCB9IGZyb20gJy4uLy4uL2Jhc2Uvbm9kZS91bmMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcblxuZnVuY3Rpb24gc2hvdWxkU3Bhd25DbGlQcm9jZXNzKGFyZ3Y6IE5hdGl2ZVBhcnNlZEFyZ3MpOiBib29sZWFuIHtcblx0cmV0dXJuICEhYXJndlsnaW5zdGFsbC1zb3VyY2UnXVxuXHRcdHx8ICEhYXJndlsnbGlzdC1leHRlbnNpb25zJ11cblx0XHR8fCAhIWFyZ3ZbJ2luc3RhbGwtZXh0ZW5zaW9uJ11cblx0XHR8fCAhIWFyZ3ZbJ3VuaW5zdGFsbC1leHRlbnNpb24nXVxuXHRcdHx8ICEhYXJndlsndXBkYXRlLWV4dGVuc2lvbnMnXVxuXHRcdHx8ICEhYXJndlsnbG9jYXRlLWV4dGVuc2lvbiddXG5cdFx0fHwgISFhcmd2WydhZGQtbWNwJ11cblx0XHR8fCAhIWFyZ3ZbJ3RlbGVtZXRyeSddO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbWFpbihhcmd2OiBzdHJpbmdbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRsZXQgYXJnczogTmF0aXZlUGFyc2VkQXJncztcblxuXHR0cnkge1xuXHRcdGFyZ3MgPSBwYXJzZUNMSVByb2Nlc3NBcmd2KGFyZ3YpO1xuXHR9IGNhdGNoIChlcnIpIHtcblx0XHRjb25zb2xlLmVycm9yKGVyci5tZXNzYWdlKTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRmb3IgKGNvbnN0IHN1YmNvbW1hbmQgb2YgTkFUSVZFX0NMSV9DT01NQU5EUykge1xuXHRcdGlmIChhcmdzW3N1YmNvbW1hbmRdKSB7XG5cdFx0XHRpZiAoIXByb2R1Y3QudHVubmVsQXBwbGljYXRpb25OYW1lKSB7XG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IoYCcke3N1YmNvbW1hbmR9JyBjb21tYW5kIG5vdCBzdXBwb3J0ZWQgaW4gJHtwcm9kdWN0LmFwcGxpY2F0aW9uTmFtZX1gKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZW52OiBJUHJvY2Vzc0Vudmlyb25tZW50ID0ge1xuXHRcdFx0XHQuLi5wcm9jZXNzLmVudlxuXHRcdFx0fTtcblx0XHRcdC8vIGJvb3RzdHJhcC1lc20uanMgZGV0ZXJtaW5lcyB0aGUgZWxlY3Ryb24gZW52aXJvbm1lbnQgYmFzZWRcblx0XHRcdC8vIG9uIHRoZSBmb2xsb3dpbmcgdmFyaWFibGUuIEZvciB0aGUgc2VydmVyIHdlIG5lZWQgdG8gdW5zZXRcblx0XHRcdC8vIGl0IHRvIHByZXZlbnQgaW1wb3J0aW5nIGFueSBlbGVjdHJvbiBzcGVjaWZpYyBtb2R1bGVzLlxuXHRcdFx0Ly8gUmVmcyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjIxODgzXG5cdFx0XHRkZWxldGUgZW52WydFTEVDVFJPTl9SVU5fQVNfTk9ERSddO1xuXG5cdFx0XHRjb25zdCB0dW5uZWxBcmdzID0gYXJndi5zbGljZShhcmd2LmluZGV4T2Yoc3ViY29tbWFuZCkgKyAxKTsgLy8gYWxsIGFyZ3VtZW50cyBiZWhpbmQgYHR1bm5lbGBcblx0XHRcdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRcdGxldCB0dW5uZWxQcm9jZXNzOiBDaGlsZFByb2Nlc3M7XG5cdFx0XHRcdGNvbnN0IHN0ZGlvOiBTdGRpb09wdGlvbnMgPSBbJ2lnbm9yZScsICdwaXBlJywgJ3BpcGUnXTtcblx0XHRcdFx0aWYgKHByb2Nlc3MuZW52WydWU0NPREVfREVWJ10pIHtcblx0XHRcdFx0XHR0dW5uZWxQcm9jZXNzID0gc3Bhd24oJ2NhcmdvJywgWydydW4nLCAnLS0nLCBzdWJjb21tYW5kLCAuLi50dW5uZWxBcmdzXSwgeyBjd2Q6IGpvaW4oZ2V0QXBwUm9vdCgpLCAnY2xpJyksIHN0ZGlvLCBlbnYgfSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgYXBwUGF0aCA9IHByb2Nlc3MucGxhdGZvcm0gPT09ICdkYXJ3aW4nXG5cdFx0XHRcdFx0XHQvLyAuL0NvbnRlbnRzL01hY09TL0NvZGUgPT4gLi9Db250ZW50cy9SZXNvdXJjZXMvYXBwL2Jpbi9jb2RlLXR1bm5lbC1pbnNpZGVyc1xuXHRcdFx0XHRcdFx0PyBqb2luKGRpcm5hbWUoZGlybmFtZShwcm9jZXNzLmV4ZWNQYXRoKSksICdSZXNvdXJjZXMnLCAnYXBwJylcblx0XHRcdFx0XHRcdDogZGlybmFtZShwcm9jZXNzLmV4ZWNQYXRoKTtcblx0XHRcdFx0XHRjb25zdCB0dW5uZWxDb21tYW5kID0gam9pbihhcHBQYXRoLCAnYmluJywgYCR7cHJvZHVjdC50dW5uZWxBcHBsaWNhdGlvbk5hbWV9JHtpc1dpbmRvd3MgPyAnLmV4ZScgOiAnJ31gKTtcblx0XHRcdFx0XHR0dW5uZWxQcm9jZXNzID0gc3Bhd24odHVubmVsQ29tbWFuZCwgW3N1YmNvbW1hbmQsIC4uLnR1bm5lbEFyZ3NdLCB7IGN3ZDogY3dkKCksIHN0ZGlvLCBlbnYgfSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0dW5uZWxQcm9jZXNzLnN0ZG91dCEucGlwZShwcm9jZXNzLnN0ZG91dCk7XG5cdFx0XHRcdHR1bm5lbFByb2Nlc3Muc3RkZXJyIS5waXBlKHByb2Nlc3Muc3RkZXJyKTtcblx0XHRcdFx0dHVubmVsUHJvY2Vzcy5vbignZXhpdCcsIHJlc29sdmUpO1xuXHRcdFx0XHR0dW5uZWxQcm9jZXNzLm9uKCdlcnJvcicsIHJlamVjdCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHQvLyBIZWxwIChnZW5lcmFsKVxuXHRpZiAoYXJncy5oZWxwKSB7XG5cdFx0Y29uc3QgZXhlY3V0YWJsZSA9IGAke3Byb2R1Y3QuYXBwbGljYXRpb25OYW1lfSR7aXNXaW5kb3dzID8gJy5leGUnIDogJyd9YDtcblx0XHRjb25zb2xlLmxvZyhidWlsZEhlbHBNZXNzYWdlKHByb2R1Y3QubmFtZUxvbmcsIGV4ZWN1dGFibGUsIHByb2R1Y3QudmVyc2lvbiwgT1BUSU9OUykpO1xuXHR9XG5cblx0Ly8gSGVscCAoY2hhdClcblx0ZWxzZSBpZiAoYXJncy5jaGF0Py5oZWxwKSB7XG5cdFx0Y29uc3QgZXhlY3V0YWJsZSA9IGAke3Byb2R1Y3QuYXBwbGljYXRpb25OYW1lfSR7aXNXaW5kb3dzID8gJy5leGUnIDogJyd9YDtcblx0XHRjb25zb2xlLmxvZyhidWlsZEhlbHBNZXNzYWdlKHByb2R1Y3QubmFtZUxvbmcsIGV4ZWN1dGFibGUsIHByb2R1Y3QudmVyc2lvbiwgT1BUSU9OUy5jaGF0Lm9wdGlvbnMsIHsgaXNDaGF0OiB0cnVlIH0pKTtcblx0fVxuXG5cdC8vIFZlcnNpb24gSW5mb1xuXHRlbHNlIGlmIChhcmdzLnZlcnNpb24pIHtcblx0XHRjb25zb2xlLmxvZyhidWlsZFZlcnNpb25NZXNzYWdlKHByb2R1Y3QudmVyc2lvbiwgcHJvZHVjdC5jb21taXQpKTtcblx0fVxuXG5cdC8vIFNoZWxsIGludGVncmF0aW9uXG5cdGVsc2UgaWYgKGFyZ3NbJ2xvY2F0ZS1zaGVsbC1pbnRlZ3JhdGlvbi1wYXRoJ10pIHtcblx0XHRsZXQgZmlsZTogc3RyaW5nO1xuXHRcdHN3aXRjaCAoYXJnc1snbG9jYXRlLXNoZWxsLWludGVncmF0aW9uLXBhdGgnXSkge1xuXHRcdFx0Ly8gVXNhZ2U6IGBbWyBcIiRURVJNX1BST0dSQU1cIiA9PSBcInZzY29kZVwiIF1dICYmIC4gXCIkKGNvZGUgLS1sb2NhdGUtc2hlbGwtaW50ZWdyYXRpb24tcGF0aCBiYXNoKVwiYFxuXHRcdFx0Y2FzZSAnYmFzaCc6IGZpbGUgPSAnc2hlbGxJbnRlZ3JhdGlvbi1iYXNoLnNoJzsgYnJlYWs7XG5cdFx0XHQvLyBVc2FnZTogYGlmICgkZW52OlRFUk1fUFJPR1JBTSAtZXEgXCJ2c2NvZGVcIikgeyAuIFwiJChjb2RlIC0tbG9jYXRlLXNoZWxsLWludGVncmF0aW9uLXBhdGggcHdzaClcIiB9YFxuXHRcdFx0Y2FzZSAncHdzaCc6IGZpbGUgPSAnc2hlbGxJbnRlZ3JhdGlvbi5wczEnOyBicmVhaztcblx0XHRcdC8vIFVzYWdlOiBgW1sgXCIkVEVSTV9QUk9HUkFNXCIgPT0gXCJ2c2NvZGVcIiBdXSAmJiAuIFwiJChjb2RlIC0tbG9jYXRlLXNoZWxsLWludGVncmF0aW9uLXBhdGggenNoKVwiYFxuXHRcdFx0Y2FzZSAnenNoJzogZmlsZSA9ICdzaGVsbEludGVncmF0aW9uLXJjLnpzaCc7IGJyZWFrO1xuXHRcdFx0Ly8gVXNhZ2U6IGBzdHJpbmcgbWF0Y2ggLXEgXCIkVEVSTV9QUk9HUkFNXCIgXCJ2c2NvZGVcIjsgYW5kIC4gKGNvZGUgLS1sb2NhdGUtc2hlbGwtaW50ZWdyYXRpb24tcGF0aCBmaXNoKWBcblx0XHRcdGNhc2UgJ2Zpc2gnOiBmaWxlID0gJ3NoZWxsSW50ZWdyYXRpb24uZmlzaCc7IGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDogdGhyb3cgbmV3IEVycm9yKCdFcnJvciB1c2luZyAtLWxvY2F0ZS1zaGVsbC1pbnRlZ3JhdGlvbi1wYXRoOiBJbnZhbGlkIHNoZWxsIHR5cGUnKTtcblx0XHR9XG5cdFx0Y29uc29sZS5sb2coam9pbihnZXRBcHBSb290KCksICdvdXQnLCAndnMnLCAnd29ya2JlbmNoJywgJ2NvbnRyaWInLCAndGVybWluYWwnLCAnY29tbW9uJywgJ3NjcmlwdHMnLCBmaWxlKSk7XG5cdH1cblxuXHQvLyBFeHRlbnNpb25zIE1hbmFnZW1lbnRcblx0ZWxzZSBpZiAoc2hvdWxkU3Bhd25DbGlQcm9jZXNzKGFyZ3MpKSB7XG5cblx0XHQvLyBXZSBkbyBub3QgYnVuZGxlIGBjbGlQcm9jZXNzTWFpbi5qc2AgaW50byB0aGlzIGZpbGUgYmVjYXVzZVxuXHRcdC8vIGl0IGlzIHJhdGhlciBsYXJnZSBhbmQgb25seSBuZWVkZWQgZm9yIHZlcnkgZmV3IENMSSBvcGVyYXRpb25zLlxuXHRcdC8vIFRoaXMgaGFzIHRoZSBkb3duc2lkZSB0aGF0IHdlIG5lZWQgdG8ga25vdyBpZiB3ZSBydW4gT1NTIG9yXG5cdFx0Ly8gYnVpbHQsIGJlY2F1c2Ugb3VyIGxvY2F0aW9uIG9uIGRpc2sgaXMgZGlmZmVyZW50IGlmIGJ1aWx0LlxuXG5cdFx0bGV0IGNsaVByb2Nlc3NNYWluOiBzdHJpbmc7XG5cdFx0aWYgKHByb2Nlc3MuZW52WydWU0NPREVfREVWJ10pIHtcblx0XHRcdGNsaVByb2Nlc3NNYWluID0gJy4vY2xpUHJvY2Vzc01haW4uanMnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjbGlQcm9jZXNzTWFpbiA9ICcuL3ZzL2NvZGUvbm9kZS9jbGlQcm9jZXNzTWFpbi5qcyc7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2xpID0gYXdhaXQgaW1wb3J0KGNsaVByb2Nlc3NNYWluKTtcblx0XHRhd2FpdCBjbGkubWFpbihhcmdzKTtcblxuXHRcdHJldHVybjtcblx0fVxuXG5cdC8vIFdyaXRlIEZpbGVcblx0ZWxzZSBpZiAoYXJnc1snZmlsZS13cml0ZSddKSB7XG5cdFx0Y29uc3QgYXJnc0ZpbGUgPSBhcmdzLl9bMF07XG5cdFx0aWYgKCFhcmdzRmlsZSB8fCAhaXNBYnNvbHV0ZShhcmdzRmlsZSkgfHwgIWV4aXN0c1N5bmMoYXJnc0ZpbGUpIHx8ICFzdGF0U3luYyhhcmdzRmlsZSkuaXNGaWxlKCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVXNpbmcgLS1maWxlLXdyaXRlIHdpdGggaW52YWxpZCBhcmd1bWVudHMuJyk7XG5cdFx0fVxuXG5cdFx0bGV0IHNvdXJjZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxldCB0YXJnZXQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYXJnc0NvbnRlbnRzOiB7IHNvdXJjZTogc3RyaW5nOyB0YXJnZXQ6IHN0cmluZyB9ID0gSlNPTi5wYXJzZShyZWFkRmlsZVN5bmMoYXJnc0ZpbGUsICd1dGY4JykpO1xuXHRcdFx0c291cmNlID0gYXJnc0NvbnRlbnRzLnNvdXJjZTtcblx0XHRcdHRhcmdldCA9IGFyZ3NDb250ZW50cy50YXJnZXQ7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVXNpbmcgLS1maWxlLXdyaXRlIHdpdGggaW52YWxpZCBhcmd1bWVudHMuJyk7XG5cdFx0fVxuXG5cdFx0Ly8gV2luZG93czogc2V0IHRoZSBwYXRocyBhcyBhbGxvd2VkIFVOQyBwYXRocyBnaXZlblxuXHRcdC8vIHRoZXkgYXJlIGV4cGxpY2l0bHkgcHJvdmlkZWQgYnkgdGhlIHVzZXIgYXMgYXJndW1lbnRzXG5cdFx0aWYgKGlzV2luZG93cykge1xuXHRcdFx0Zm9yIChjb25zdCBwYXRoIG9mIFtzb3VyY2UsIHRhcmdldF0pIHtcblx0XHRcdFx0aWYgKHR5cGVvZiBwYXRoID09PSAnc3RyaW5nJyAmJiBpc1VOQyhwYXRoKSkge1xuXHRcdFx0XHRcdGFkZFVOQ0hvc3RUb0FsbG93bGlzdChVUkkuZmlsZShwYXRoKS5hdXRob3JpdHkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVmFsaWRhdGVcblx0XHRpZiAoXG5cdFx0XHQhc291cmNlIHx8ICF0YXJnZXQgfHwgc291cmNlID09PSB0YXJnZXQgfHxcdFx0XHRcdC8vIG1ha2Ugc3VyZSBzb3VyY2UgYW5kIHRhcmdldCBhcmUgcHJvdmlkZWQgYW5kIGFyZSBub3QgdGhlIHNhbWVcblx0XHRcdCFpc0Fic29sdXRlKHNvdXJjZSkgfHwgIWlzQWJzb2x1dGUodGFyZ2V0KSB8fFx0XHRcdC8vIG1ha2Ugc3VyZSBib3RoIHNvdXJjZSBhbmQgdGFyZ2V0IGFyZSBhYnNvbHV0ZSBwYXRoc1xuXHRcdFx0IWV4aXN0c1N5bmMoc291cmNlKSB8fCAhc3RhdFN5bmMoc291cmNlKS5pc0ZpbGUoKSB8fFx0Ly8gbWFrZSBzdXJlIHNvdXJjZSBleGlzdHMgYXMgZmlsZVxuXHRcdFx0IWV4aXN0c1N5bmModGFyZ2V0KSB8fCAhc3RhdFN5bmModGFyZ2V0KS5pc0ZpbGUoKVx0XHQvLyBtYWtlIHN1cmUgdGFyZ2V0IGV4aXN0cyBhcyBmaWxlXG5cdFx0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1VzaW5nIC0tZmlsZS13cml0ZSB3aXRoIGludmFsaWQgYXJndW1lbnRzLicpO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cblx0XHRcdC8vIENoZWNrIGZvciByZWFkb25seSBzdGF0dXMgYW5kIGNobW9kIGlmIHNvIGlmIHdlIGFyZSB0b2xkIHNvXG5cdFx0XHRsZXQgdGFyZ2V0TW9kZSA9IDA7XG5cdFx0XHRsZXQgcmVzdG9yZU1vZGUgPSBmYWxzZTtcblx0XHRcdGlmIChhcmdzWydmaWxlLWNobW9kJ10pIHtcblx0XHRcdFx0dGFyZ2V0TW9kZSA9IHN0YXRTeW5jKHRhcmdldCkubW9kZTtcblx0XHRcdFx0aWYgKCEodGFyZ2V0TW9kZSAmIDBvMjAwIC8qIEZpbGUgbW9kZSBpbmRpY2F0aW5nIHdyaXRhYmxlIGJ5IG93bmVyICovKSkge1xuXHRcdFx0XHRcdGNobW9kU3luYyh0YXJnZXQsIHRhcmdldE1vZGUgfCAwbzIwMCk7XG5cdFx0XHRcdFx0cmVzdG9yZU1vZGUgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFdyaXRlIHNvdXJjZSB0byB0YXJnZXRcblx0XHRcdGNvbnN0IGRhdGEgPSByZWFkRmlsZVN5bmMoc291cmNlKTtcblx0XHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdFx0Ly8gT24gV2luZG93cyB3ZSB1c2UgYSBkaWZmZXJlbnQgc3RyYXRlZ3kgb2Ygc2F2aW5nIHRoZSBmaWxlXG5cdFx0XHRcdC8vIGJ5IGZpcnN0IHRydW5jYXRpbmcgdGhlIGZpbGUgYW5kIHRoZW4gd3JpdGluZyB3aXRoIHIrIG1vZGUuXG5cdFx0XHRcdC8vIFRoaXMgaGVscHMgdG8gc2F2ZSBoaWRkZW4gZmlsZXMgb24gV2luZG93c1xuXHRcdFx0XHQvLyAoc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy85MzEpIGFuZFxuXHRcdFx0XHQvLyBwcmV2ZW50IHJlbW92aW5nIGFsdGVybmF0ZSBkYXRhIHN0cmVhbXNcblx0XHRcdFx0Ly8gKHNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNjM2Mylcblx0XHRcdFx0dHJ1bmNhdGVTeW5jKHRhcmdldCwgMCk7XG5cdFx0XHRcdHdyaXRlRmlsZVN5bmModGFyZ2V0LCBkYXRhLCB7IGZsYWc6ICdyKycgfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR3cml0ZUZpbGVTeW5jKHRhcmdldCwgZGF0YSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlc3RvcmUgcHJldmlvdXMgbW9kZSBhcyBuZWVkZWRcblx0XHRcdGlmIChyZXN0b3JlTW9kZSkge1xuXHRcdFx0XHRjaG1vZFN5bmModGFyZ2V0LCB0YXJnZXRNb2RlKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0ZXJyb3IubWVzc2FnZSA9IGBFcnJvciB1c2luZyAtLWZpbGUtd3JpdGU6ICR7ZXJyb3IubWVzc2FnZX1gO1xuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0Ly8gSnVzdCBDb2RlXG5cdGVsc2Uge1xuXHRcdGNvbnN0IGVudjogSVByb2Nlc3NFbnZpcm9ubWVudCA9IHtcblx0XHRcdC4uLnByb2Nlc3MuZW52LFxuXHRcdFx0J0VMRUNUUk9OX05PX0FUVEFDSF9DT05TT0xFJzogJzEnXG5cdFx0fTtcblxuXHRcdGRlbGV0ZSBlbnZbJ0VMRUNUUk9OX1JVTl9BU19OT0RFJ107XG5cblx0XHRjb25zdCBwcm9jZXNzQ2FsbGJhY2tzOiAoKGNoaWxkOiBDaGlsZFByb2Nlc3MpID0+IFByb21pc2U8dm9pZD4pW10gPSBbXTtcblxuXHRcdGlmIChhcmdzLnZlcmJvc2UpIHtcblx0XHRcdGVudlsnRUxFQ1RST05fRU5BQkxFX0xPR0dJTkcnXSA9ICcxJztcblx0XHR9XG5cblx0XHRpZiAoYXJncy52ZXJib3NlIHx8IGFyZ3Muc3RhdHVzKSB7XG5cdFx0XHRwcm9jZXNzQ2FsbGJhY2tzLnB1c2goYXN5bmMgY2hpbGQgPT4ge1xuXHRcdFx0XHRjaGlsZC5zdGRvdXQ/Lm9uKCdkYXRhJywgKGRhdGE6IEJ1ZmZlcikgPT4gY29uc29sZS5sb2coZGF0YS50b1N0cmluZygndXRmOCcpLnRyaW0oKSkpO1xuXHRcdFx0XHRjaGlsZC5zdGRlcnI/Lm9uKCdkYXRhJywgKGRhdGE6IEJ1ZmZlcikgPT4gY29uc29sZS5sb2coZGF0YS50b1N0cmluZygndXRmOCcpLnRyaW0oKSkpO1xuXG5cdFx0XHRcdGF3YWl0IEV2ZW50LnRvUHJvbWlzZShFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcihjaGlsZCwgJ2V4aXQnKSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBIYW5kbGUgLS10cmFuc2llbnQgb3B0aW9uXG5cdFx0aWYgKGFyZ3NbJ3RyYW5zaWVudCddKSB7XG5cdFx0XHRjb25zdCB0ZW1wUGFyZW50RGlyID0gcmFuZG9tUGF0aCh0bXBkaXIoKSwgJ3ZzY29kZScpO1xuXHRcdFx0Y29uc3QgdGVtcFVzZXJEYXRhRGlyID0gam9pbih0ZW1wUGFyZW50RGlyLCAnZGF0YScpO1xuXHRcdFx0Y29uc3QgdGVtcEV4dGVuc2lvbnNEaXIgPSBqb2luKHRlbXBQYXJlbnREaXIsICdleHRlbnNpb25zJyk7XG5cdFx0XHRjb25zdCB0ZW1wU2hhcmVkRGF0YURpciA9IGpvaW4odGVtcFBhcmVudERpciwgJ3NoYXJlZCcpO1xuXHRcdFx0Y29uc3QgdGVtcEFnZW50UGx1Z2luc0RpciA9IGpvaW4odGVtcFBhcmVudERpciwgJ2FnZW50LXBsdWdpbnMnKTtcblx0XHRcdGNvbnN0IHRlbXBBZ2VudHNVc2VyRGF0YURpciA9IGpvaW4odGVtcFBhcmVudERpciwgJ2FnZW50cy1kYXRhJyk7XG5cdFx0XHRjb25zdCB0ZW1wQWdlbnRzRXh0ZW5zaW9uc0RpciA9IGpvaW4odGVtcFBhcmVudERpciwgJ2FnZW50cy1leHRlbnNpb25zJyk7XG5cblx0XHRcdGFkZEFyZyhhcmd2LCAnLS11c2VyLWRhdGEtZGlyJywgdGVtcFVzZXJEYXRhRGlyKTtcblx0XHRcdGFkZEFyZyhhcmd2LCAnLS1leHRlbnNpb25zLWRpcicsIHRlbXBFeHRlbnNpb25zRGlyKTtcblx0XHRcdGFkZEFyZyhhcmd2LCAnLS1zaGFyZWQtZGF0YS1kaXInLCB0ZW1wU2hhcmVkRGF0YURpcik7XG5cdFx0XHRhZGRBcmcoYXJndiwgJy0tYWdlbnQtcGx1Z2lucy1kaXInLCB0ZW1wQWdlbnRQbHVnaW5zRGlyKTtcblx0XHRcdGFkZEFyZyhhcmd2LCAnLS1hZ2VudHMtdXNlci1kYXRhLWRpcicsIHRlbXBBZ2VudHNVc2VyRGF0YURpcik7XG5cdFx0XHRhZGRBcmcoYXJndiwgJy0tYWdlbnRzLWV4dGVuc2lvbnMtZGlyJywgdGVtcEFnZW50c0V4dGVuc2lvbnNEaXIpO1xuXG5cdFx0XHRjb25zb2xlLmxvZyhgU3RhdGUgaXMgdGVtcG9yYXJpbHkgc3RvcmVkLiBSZWxhdW5jaCB0aGlzIHN0YXRlIHdpdGg6ICR7cHJvZHVjdC5hcHBsaWNhdGlvbk5hbWV9IC0tdXNlci1kYXRhLWRpciBcIiR7dGVtcFVzZXJEYXRhRGlyfVwiIC0tZXh0ZW5zaW9ucy1kaXIgXCIke3RlbXBFeHRlbnNpb25zRGlyfVwiIC0tc2hhcmVkLWRhdGEtZGlyIFwiJHt0ZW1wU2hhcmVkRGF0YURpcn1cIiAtLWFnZW50LXBsdWdpbnMtZGlyIFwiJHt0ZW1wQWdlbnRQbHVnaW5zRGlyfVwiIC0tYWdlbnRzLXVzZXItZGF0YS1kaXIgXCIke3RlbXBBZ2VudHNVc2VyRGF0YURpcn1cIiAtLWFnZW50cy1leHRlbnNpb25zLWRpciBcIiR7dGVtcEFnZW50c0V4dGVuc2lvbnNEaXJ9XCJgKTtcblx0XHR9XG5cblx0XHRjb25zdCBoYXNSZWFkU3RkaW5BcmcgPSBhcmdzLl8uc29tZShhcmcgPT4gYXJnID09PSAnLScpIHx8IGFyZ3MuY2hhdD8uXy5zb21lKGFyZyA9PiBhcmcgPT09ICctJyk7XG5cdFx0aWYgKGhhc1JlYWRTdGRpbkFyZykge1xuXHRcdFx0Ly8gcmVtb3ZlIHRoZSBcIi1cIiBhcmd1bWVudCB3aGVuIHdlIHJlYWQgZnJvbSBzdGRpblxuXHRcdFx0YXJncy5fID0gYXJncy5fLmZpbHRlcihhID0+IGEgIT09ICctJyk7XG5cdFx0XHRhcmd2ID0gYXJndi5maWx0ZXIoYSA9PiBhICE9PSAnLScpO1xuXHRcdH1cblxuXHRcdGxldCBzdGRpbkZpbGVQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGhhc1N0ZGluV2l0aG91dFR0eSgpKSB7XG5cblx0XHRcdC8vIFJlYWQgZnJvbSBzdGRpbjogd2UgcmVxdWlyZSBhIHNpbmdsZSBcIi1cIiBhcmd1bWVudCB0byBiZSBwYXNzZWQgaW4gb3JkZXIgdG8gc3RhcnQgcmVhZGluZyBmcm9tXG5cdFx0XHQvLyBzdGRpbi4gV2UgZG8gdGhpcyBiZWNhdXNlIHRoZXJlIGlzIG5vIHJlbGlhYmxlIHdheSB0byBmaW5kIG91dCBpZiBkYXRhIGlzIHBpcGVkIHRvIHN0ZGluLiBKdXN0XG5cdFx0XHQvLyBjaGVja2luZyBmb3Igc3RkaW4gYmVpbmcgY29ubmVjdGVkIHRvIGEgVFRZIGlzIG5vdCBlbm91Z2ggKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy80MDM1MSlcblxuXHRcdFx0aWYgKGhhc1JlYWRTdGRpbkFyZykge1xuXHRcdFx0XHRzdGRpbkZpbGVQYXRoID0gZ2V0U3RkaW5GaWxlUGF0aCgpO1xuXG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVhZEZyb21TdGRpbkRvbmUgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0XHRcdFx0YXdhaXQgcmVhZEZyb21TdGRpbihzdGRpbkZpbGVQYXRoLCAhIWFyZ3MudmVyYm9zZSwgKCkgPT4gcmVhZEZyb21TdGRpbkRvbmUuY29tcGxldGUoKSk7XG5cdFx0XHRcdFx0aWYgKCFhcmdzLndhaXQpIHtcblxuXHRcdFx0XHRcdFx0Ly8gaWYgYC0td2FpdGAgaXMgbm90IHByb3ZpZGVkLCB3ZSBrZWVwIHRoaXMgcHJvY2VzcyBhbGl2ZVxuXHRcdFx0XHRcdFx0Ly8gZm9yIGF0IGxlYXN0IGFzIGxvbmcgYXMgdGhlIHN0ZGluIHN0cmVhbSBpcyBvcGVuIHRvXG5cdFx0XHRcdFx0XHQvLyBlbnN1cmUgdGhhdCB3ZSByZWFkIGFsbCB0aGUgZGF0YS5cblx0XHRcdFx0XHRcdC8vIHRoZSBkb3duc2lkZSBpcyB0aGF0IHRoZSBDb2RlIENMSSBwcm9jZXNzIHdpbGwgdGhlbiBub3Rcblx0XHRcdFx0XHRcdC8vIHRlcm1pbmF0ZSB1bnRpbCBzdGRpbiBpcyBjbG9zZWQsIGJ1dCB1c2VycyBjYW4gYWx3YXlzXG5cdFx0XHRcdFx0XHQvLyBwYXNzIGAtLXdhaXRgIHRvIHByZXZlbnQgdGhhdCBmcm9tIGhhcHBlbmluZyAodGhpcyBpc1xuXHRcdFx0XHRcdFx0Ly8gYWN0dWFsbHkgd2hhdCB3ZSBlbmZvcmNlZCB1bnRpbCB2MS44NS54IGJ1dCB0aGVuIHdhc1xuXHRcdFx0XHRcdFx0Ly8gY2hhbmdlZCB0byBub3QgZW5mb3JjZSBpdCBhbnltb3JlKS5cblx0XHRcdFx0XHRcdC8vIGEgc29sdXRpb24gaW4gdGhlIGZ1dHVyZSB3b3VsZCBwb3NzaWJseSBiZSB0byBleGl0LCB3aGVuXG5cdFx0XHRcdFx0XHQvLyB0aGUgQ29kZSBwcm9jZXNzIGV4aXRzLiB0aGlzIHdvdWxkIHJlcXVpcmUgc29tZSBjYXJlZnVsXG5cdFx0XHRcdFx0XHQvLyBzb2x1dGlvbiB0aG91Z2ggaW4gY2FzZSBDb2RlIGlzIGFscmVhZHkgcnVubmluZyBhbmQgdGhpc1xuXHRcdFx0XHRcdFx0Ly8gaXMgYSBzZWNvbmQgaW5zdGFuY2UgdGVsbGluZyB0aGUgZmlyc3QgaW5zdGFuY2Ugd2hhdCB0b1xuXHRcdFx0XHRcdFx0Ly8gb3Blbi5cblxuXHRcdFx0XHRcdFx0cHJvY2Vzc0NhbGxiYWNrcy5wdXNoKCgpID0+IHJlYWRGcm9tU3RkaW5Eb25lLnApO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChhcmdzLmNoYXQpIHtcblx0XHRcdFx0XHRcdC8vIE1ha2Ugc3VyZSB0byBhZGQgdG1wIGZpbGUgYXMgY29udGV4dCB0byBjaGF0XG5cdFx0XHRcdFx0XHRhZGRBcmcoYXJndiwgJy0tYWRkLWZpbGUnLCBzdGRpbkZpbGVQYXRoKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8gTWFrZSBzdXJlIHRvIG9wZW4gdG1wIGZpbGUgYXMgZWRpdG9yIGJ1dCBpZ25vcmVcblx0XHRcdFx0XHRcdC8vIGl0IGluIHRoZSBcInJlY2VudGx5IG9wZW5cIiBsaXN0XG5cdFx0XHRcdFx0XHRhZGRBcmcoYXJndiwgc3RkaW5GaWxlUGF0aCk7XG5cdFx0XHRcdFx0XHRhZGRBcmcoYXJndiwgJy0tc2tpcC1hZGQtdG8tcmVjZW50bHktb3BlbmVkJyk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc29sZS5sb2coYFJlYWRpbmcgZnJvbSBzdGRpbiB2aWE6ICR7c3RkaW5GaWxlUGF0aH1gKTtcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdGNvbnNvbGUubG9nKGBGYWlsZWQgdG8gY3JlYXRlIGZpbGUgdG8gcmVhZCB2aWEgc3RkaW46ICR7ZS50b1N0cmluZygpfWApO1xuXHRcdFx0XHRcdHN0ZGluRmlsZVBhdGggPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cblx0XHRcdFx0Ly8gSWYgdGhlIHVzZXIgcGlwZXMgZGF0YSB2aWEgc3RkaW4gYnV0IGZvcmdvdCB0byBhZGQgdGhlIFwiLVwiIGFyZ3VtZW50LCBoZWxwIGJ5IHByaW50aW5nIGEgbWVzc2FnZVxuXHRcdFx0XHQvLyBpZiB3ZSBkZXRlY3QgdGhhdCBkYXRhIGZsb3dzIGludG8gdmlhIHN0ZGluIGFmdGVyIGEgY2VydGFpbiB0aW1lb3V0LlxuXHRcdFx0XHRwcm9jZXNzQ2FsbGJhY2tzLnB1c2goXyA9PiBzdGRpbkRhdGFMaXN0ZW5lcigxMDAwKS50aGVuKGRhdGFSZWNlaXZlZCA9PiB7XG5cdFx0XHRcdFx0aWYgKGRhdGFSZWNlaXZlZCkge1xuXHRcdFx0XHRcdFx0Y29uc29sZS5sb2coYnVpbGRTdGRpbk1lc3NhZ2UocHJvZHVjdC5hcHBsaWNhdGlvbk5hbWUsICEhYXJncy5jaGF0KSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSWYgd2UgYXJlIHN0YXJ0ZWQgd2l0aCAtLXdhaXQgY3JlYXRlIGEgcmFuZG9tIHRlbXBvcmFyeSBmaWxlXG5cdFx0Ly8gYW5kIHBhc3MgaXQgb3ZlciB0byB0aGUgc3RhcnRpbmcgaW5zdGFuY2UuIFdlIGNhbiB1c2UgdGhpcyBmaWxlXG5cdFx0Ly8gdG8gd2FpdCBmb3IgaXQgdG8gYmUgZGVsZXRlZCB0byBtb25pdG9yIHRoYXQgdGhlIGVkaXRlZCBmaWxlXG5cdFx0Ly8gaXMgY2xvc2VkIGFuZCB0aGVuIGV4aXQgdGhlIHdhaXRpbmcgcHJvY2Vzcy5cblx0XHRsZXQgd2FpdE1hcmtlckZpbGVQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGFyZ3Mud2FpdCkge1xuXHRcdFx0d2FpdE1hcmtlckZpbGVQYXRoID0gY3JlYXRlV2FpdE1hcmtlckZpbGVTeW5jKGFyZ3MudmVyYm9zZSk7XG5cdFx0XHRpZiAod2FpdE1hcmtlckZpbGVQYXRoKSB7XG5cdFx0XHRcdGFkZEFyZyhhcmd2LCAnLS13YWl0TWFya2VyRmlsZVBhdGgnLCB3YWl0TWFya2VyRmlsZVBhdGgpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBXaGVuIHJ1bm5pbmcgd2l0aCAtLXdhaXQsIHdlIHdhbnQgdG8gY29udGludWUgcnVubmluZyBDTEkgcHJvY2Vzc1xuXHRcdFx0Ly8gdW50aWwgZWl0aGVyOlxuXHRcdFx0Ly8gLSB0aGUgd2FpdCBtYXJrZXIgZmlsZSBoYXMgYmVlbiBkZWxldGVkIChlLmcuIHdoZW4gY2xvc2luZyB0aGUgZWRpdG9yKVxuXHRcdFx0Ly8gLSB0aGUgbGF1bmNoZWQgcHJvY2VzcyB0ZXJtaW5hdGVzIChlLmcuIGR1ZSB0byBhIGNyYXNoKVxuXHRcdFx0cHJvY2Vzc0NhbGxiYWNrcy5wdXNoKGFzeW5jIGNoaWxkID0+IHtcblx0XHRcdFx0bGV0IGNoaWxkRXhpdFByb21pc2U7XG5cdFx0XHRcdGlmIChpc01hY2ludG9zaCkge1xuXHRcdFx0XHRcdC8vIE9uIG1hY09TLCB3ZSByZXNvbHZlIHRoZSBmb2xsb3dpbmcgcHJvbWlzZSBvbmx5IHdoZW4gdGhlIGNoaWxkLFxuXHRcdFx0XHRcdC8vIGkuZS4gdGhlIG9wZW4gY29tbWFuZCwgZXhpdGVkIHdpdGggYSBzaWduYWwgb3IgZXJyb3IuIE90aGVyd2lzZSwgd2Vcblx0XHRcdFx0XHQvLyB3YWl0IGZvciB0aGUgbWFya2VyIGZpbGUgdG8gYmUgZGVsZXRlZCBvciBmb3IgdGhlIGNoaWxkIHRvIGVycm9yLlxuXHRcdFx0XHRcdGNoaWxkRXhpdFByb21pc2UgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdFx0XHRcdC8vIE9ubHkgcmVzb2x2ZSB0aGlzIHByb21pc2UgaWYgdGhlIGNoaWxkIChpLmUuIG9wZW4pIGV4aXRlZCB3aXRoIGFuIGVycm9yXG5cdFx0XHRcdFx0XHRjaGlsZC5vbignZXhpdCcsIChjb2RlLCBzaWduYWwpID0+IHtcblx0XHRcdFx0XHRcdFx0aWYgKGNvZGUgIT09IDAgfHwgc2lnbmFsKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBPbiBvdGhlciBwbGF0Zm9ybXMsIHdlIGxpc3RlbiBmb3IgZXhpdCBpbiBjYXNlIHRoZSBjaGlsZCBleGl0cyBiZWZvcmUgdGhlXG5cdFx0XHRcdFx0Ly8gbWFya2VyIGZpbGUgaXMgZGVsZXRlZC5cblx0XHRcdFx0XHRjaGlsZEV4aXRQcm9taXNlID0gRXZlbnQudG9Qcm9taXNlKEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyKGNoaWxkLCAnZXhpdCcpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IFByb21pc2UucmFjZShbXG5cdFx0XHRcdFx0XHR3aGVuRGVsZXRlZCh3YWl0TWFya2VyRmlsZVBhdGghKSxcblx0XHRcdFx0XHRcdEV2ZW50LnRvUHJvbWlzZShFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcihjaGlsZCwgJ2Vycm9yJykpLFxuXHRcdFx0XHRcdFx0Y2hpbGRFeGl0UHJvbWlzZVxuXHRcdFx0XHRcdF0pO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdGlmIChzdGRpbkZpbGVQYXRoKSB7XG5cdFx0XHRcdFx0XHR1bmxpbmtTeW5jKHN0ZGluRmlsZVBhdGgpOyAvLyBNYWtlIHN1cmUgdG8gZGVsZXRlIHRoZSB0bXAgc3RkaW4gZmlsZSBpZiB3ZSBoYXZlIGFueVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgd2UgaGF2ZSBiZWVuIHN0YXJ0ZWQgd2l0aCBgLS1wcm9mLXN0YXJ0dXBgIHdlIG5lZWQgdG8gZmluZCBmcmVlIHBvcnRzIHRvIHByb2ZpbGVcblx0XHQvLyB0aGUgbWFpbiBwcm9jZXNzLCB0aGUgcmVuZGVyZXIsIGFuZCB0aGUgZXh0ZW5zaW9uIGhvc3QuIFdlIGFsc28gZGlzYWJsZSB2OCBjYWNoZWQgZGF0YVxuXHRcdC8vIHRvIGdldCBiZXR0ZXIgcHJvZmlsZSB0cmFjZXMuIExhc3QsIHdlIGxpc3RlbiBvbiBzdGRvdXQgZm9yIGEgc2lnbmFsIHRoYXQgdGVsbHMgdXMgdG9cblx0XHQvLyBzdG9wIHByb2ZpbGluZy5cblx0XHRpZiAoYXJnc1sncHJvZi1zdGFydHVwJ10pIHtcblx0XHRcdGNvbnN0IHByb2ZpbGVIb3N0ID0gJzEyNy4wLjAuMSc7XG5cdFx0XHRjb25zdCBwb3J0TWFpbiA9IGF3YWl0IGZpbmRGcmVlUG9ydChyYW5kb21Qb3J0KCksIDEwLCAzMDAwKTtcblx0XHRcdGNvbnN0IHBvcnRSZW5kZXJlciA9IGF3YWl0IGZpbmRGcmVlUG9ydChwb3J0TWFpbiArIDEsIDEwLCAzMDAwKTtcblx0XHRcdGNvbnN0IHBvcnRFeHRob3N0ID0gYXdhaXQgZmluZEZyZWVQb3J0KHBvcnRSZW5kZXJlciArIDEsIDEwLCAzMDAwKTtcblxuXHRcdFx0Ly8gZmFpbCB0aGUgb3BlcmF0aW9uIHdoZW4gb25lIG9mIHRoZSBwb3J0cyBjb3VsZG4ndCBiZSBhY3F1aXJlZC5cblx0XHRcdGlmIChwb3J0TWFpbiAqIHBvcnRSZW5kZXJlciAqIHBvcnRFeHRob3N0ID09PSAwKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIGZpbmQgZnJlZSBwb3J0cyBmb3IgcHJvZmlsZXIuIE1ha2Ugc3VyZSB0byBzaHV0ZG93biBhbGwgaW5zdGFuY2VzIG9mIHRoZSBlZGl0b3IgZmlyc3QuJyk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGZpbGVuYW1lUHJlZml4ID0gcmFuZG9tUGF0aChob21lZGlyKCksICdwcm9mJyk7XG5cblx0XHRcdGFkZEFyZyhhcmd2LCBgLS1pbnNwZWN0LWJyaz0ke3BvcnRNYWlufWApO1xuXHRcdFx0YWRkQXJnKGFyZ3YsIGAtLXJlbW90ZS1kZWJ1Z2dpbmctcG9ydD0ke3BvcnRSZW5kZXJlcn1gKTtcblx0XHRcdGFkZEFyZyhhcmd2LCBgLS1pbnNwZWN0LWJyay1leHRlbnNpb25zPSR7cG9ydEV4dGhvc3R9YCk7XG5cdFx0XHRhZGRBcmcoYXJndiwgYC0tcHJvZi1zdGFydHVwLXByZWZpeGAsIGZpbGVuYW1lUHJlZml4KTtcblx0XHRcdGFkZEFyZyhhcmd2LCBgLS1uby1jYWNoZWQtZGF0YWApO1xuXG5cdFx0XHR3cml0ZUZpbGVTeW5jKGZpbGVuYW1lUHJlZml4LCBhcmd2LnNsaWNlKC02KS5qb2luKCd8JykpO1xuXG5cdFx0XHRwcm9jZXNzQ2FsbGJhY2tzLnB1c2goYXN5bmMgX2NoaWxkID0+IHtcblxuXHRcdFx0XHRjbGFzcyBQcm9maWxlciB7XG5cdFx0XHRcdFx0c3RhdGljIGFzeW5jIHN0YXJ0KG5hbWU6IHN0cmluZywgZmlsZW5hbWVQcmVmaXg6IHN0cmluZywgb3B0czogeyBwb3J0OiBudW1iZXI7IHRyaWVzPzogbnVtYmVyOyB0YXJnZXQ/OiAodGFyZ2V0czogVGFyZ2V0W10pID0+IFRhcmdldCB9KSB7XG5cblx0XHRcdFx0XHRcdGxldCBzZXNzaW9uOiBQcm9maWxpbmdTZXNzaW9uO1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0c2Vzc2lvbiA9IGF3YWl0IHN0YXJ0UHJvZmlsaW5nKHsgLi4ub3B0cywgaG9zdDogcHJvZmlsZUhvc3QgfSk7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRcdFx0Y29uc29sZS5lcnJvcihgRkFJTEVEIHRvIHN0YXJ0IHByb2ZpbGluZyBmb3IgJyR7bmFtZX0nIG9uIHBvcnQgJyR7b3B0cy5wb3J0fSdgKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0YXN5bmMgc3RvcCgpIHtcblx0XHRcdFx0XHRcdFx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0bGV0IHN1ZmZpeCA9ICcnO1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlc3Npb24uc3RvcCgpO1xuXHRcdFx0XHRcdFx0XHRcdGlmICghcHJvY2Vzcy5lbnZbJ1ZTQ09ERV9ERVYnXSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0Ly8gd2hlbiBydW5uaW5nIGZyb20gYSBub3QtZGV2ZWxvcG1lbnQtYnVpbGQgd2UgcmVtb3ZlXG5cdFx0XHRcdFx0XHRcdFx0XHQvLyBhYnNvbHV0ZSBmaWxlbmFtZXMgYmVjYXVzZSB3ZSBkb24ndCB3YW50IHRvIHJldmVhbCBhbnl0aGluZ1xuXHRcdFx0XHRcdFx0XHRcdFx0Ly8gYWJvdXQgdXNlcnMuIFdlIGFsc28gYXBwZW5kIHRoZSBgLnR4dGAgc3VmZml4IHRvIG1ha2UgaXRcblx0XHRcdFx0XHRcdFx0XHRcdC8vIGVhc2llciB0byBhdHRhY2ggdGhlc2UgZmlsZXMgdG8gR0ggaXNzdWVzXG5cdFx0XHRcdFx0XHRcdFx0XHRyZXN1bHQucHJvZmlsZSA9IFV0aWxzLnJld3JpdGVBYnNvbHV0ZVBhdGhzKHJlc3VsdC5wcm9maWxlLCAncGlpUmVtb3ZlZCcpO1xuXHRcdFx0XHRcdFx0XHRcdFx0c3VmZml4ID0gJy50eHQnO1xuXHRcdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRcdHdyaXRlRmlsZVN5bmMoYCR7ZmlsZW5hbWVQcmVmaXh9LiR7bmFtZX0uY3B1cHJvZmlsZSR7c3VmZml4fWAsIEpTT04uc3RyaW5naWZ5KHJlc3VsdC5wcm9maWxlLCB1bmRlZmluZWQsIDQpKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdC8vIGxvYWQgYW5kIHN0YXJ0IHByb2ZpbGVyXG5cdFx0XHRcdFx0Y29uc3QgbWFpblByb2ZpbGVSZXF1ZXN0ID0gUHJvZmlsZXIuc3RhcnQoJ21haW4nLCBmaWxlbmFtZVByZWZpeCwgeyBwb3J0OiBwb3J0TWFpbiB9KTtcblx0XHRcdFx0XHRjb25zdCBleHRIb3N0UHJvZmlsZVJlcXVlc3QgPSBQcm9maWxlci5zdGFydCgnZXh0SG9zdCcsIGZpbGVuYW1lUHJlZml4LCB7IHBvcnQ6IHBvcnRFeHRob3N0LCB0cmllczogMzAwIH0pO1xuXHRcdFx0XHRcdGNvbnN0IHJlbmRlcmVyUHJvZmlsZVJlcXVlc3QgPSBQcm9maWxlci5zdGFydCgncmVuZGVyZXInLCBmaWxlbmFtZVByZWZpeCwge1xuXHRcdFx0XHRcdFx0cG9ydDogcG9ydFJlbmRlcmVyLFxuXHRcdFx0XHRcdFx0dHJpZXM6IDIwMCxcblx0XHRcdFx0XHRcdHRhcmdldDogZnVuY3Rpb24gKHRhcmdldHMpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRhcmdldHMuZmlsdGVyKHRhcmdldCA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKCF0YXJnZXQud2ViU29ja2V0RGVidWdnZXJVcmwpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0aWYgKHRhcmdldC50eXBlID09PSAncGFnZScpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiB0YXJnZXQudXJsLmluZGV4T2YoJ3dvcmtiZW5jaC93b3JrYmVuY2guaHRtbCcpID4gMCB8fCB0YXJnZXQudXJsLmluZGV4T2YoJ3dvcmtiZW5jaC93b3JrYmVuY2gtZGV2Lmh0bWwnKSA+IDA7XG5cdFx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSlbMF07XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRjb25zdCBtYWluID0gYXdhaXQgbWFpblByb2ZpbGVSZXF1ZXN0O1xuXHRcdFx0XHRcdGNvbnN0IGV4dEhvc3QgPSBhd2FpdCBleHRIb3N0UHJvZmlsZVJlcXVlc3Q7XG5cdFx0XHRcdFx0Y29uc3QgcmVuZGVyZXIgPSBhd2FpdCByZW5kZXJlclByb2ZpbGVSZXF1ZXN0O1xuXG5cdFx0XHRcdFx0Ly8gd2FpdCBmb3IgdGhlIHJlbmRlcmVyIHRvIGRlbGV0ZSB0aGUgbWFya2VyIGZpbGVcblx0XHRcdFx0XHRhd2FpdCB3aGVuRGVsZXRlZChmaWxlbmFtZVByZWZpeCk7XG5cblx0XHRcdFx0XHQvLyBzdG9wIHByb2ZpbGluZ1xuXHRcdFx0XHRcdGF3YWl0IG1haW4uc3RvcCgpO1xuXHRcdFx0XHRcdGF3YWl0IHJlbmRlcmVyLnN0b3AoKTtcblx0XHRcdFx0XHRhd2FpdCBleHRIb3N0LnN0b3AoKTtcblxuXHRcdFx0XHRcdC8vIHJlLWNyZWF0ZSB0aGUgbWFya2VyIGZpbGUgdG8gc2lnbmFsIHRoYXQgcHJvZmlsaW5nIGlzIGRvbmVcblx0XHRcdFx0XHR3cml0ZUZpbGVTeW5jKGZpbGVuYW1lUHJlZml4LCAnJyk7XG5cblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBwcm9maWxlIHN0YXJ0dXAuIE1ha2Ugc3VyZSB0byBxdWl0IENvZGUgZmlyc3QuJyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9wdGlvbnM6IFNwYXduT3B0aW9ucyA9IHtcblx0XHRcdGRldGFjaGVkOiB0cnVlLFxuXHRcdFx0ZW52XG5cdFx0fTtcblxuXHRcdGlmICghYXJncy52ZXJib3NlKSB7XG5cdFx0XHRvcHRpb25zWydzdGRpbyddID0gJ2lnbm9yZSc7XG5cdFx0fVxuXG5cdFx0bGV0IGNoaWxkOiBDaGlsZFByb2Nlc3M7XG5cdFx0aWYgKCFpc01hY2ludG9zaCkge1xuXHRcdFx0aWYgKCFhcmdzLnZlcmJvc2UgJiYgYXJncy5zdGF0dXMpIHtcblx0XHRcdFx0b3B0aW9uc1snc3RkaW8nXSA9IFsnaWdub3JlJywgJ3BpcGUnLCAnaWdub3JlJ107IC8vIHJlc3RvcmUgYWJpbGl0eSB0byBzZWUgb3V0cHV0IHdoZW4gLS1zdGF0dXMgaXMgdXNlZFxuXHRcdFx0fVxuXG5cdFx0XHQvLyBPbiBXaW5kb3dzLCBDaHJvbWl1bSBmaWx0ZXJzIHN0YW5kYWxvbmUgVVJMLWxpa2UgYXJndiB0b2tlbnMgKGNvbnRhaW5pbmcgXCI6Ly9cIilcblx0XHRcdC8vIGJlZm9yZSBtYWluLmpzIHJ1bnMsIHNvIHJld3JpdGUgYC0tZm9sZGVyLXVyaSA8dXJpPmAgLyBgLS1maWxlLXVyaSA8dXJpPmAgdG9cblx0XHRcdC8vIGAtLWZsYWc9dmFsdWVgIGZvcm0uIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjA5MDcyLlxuXHRcdFx0Y29uc3Qgc3Bhd25BcmdzID0gaXNXaW5kb3dzID8gY29tYmluZVVyaUZsYWdzKGFyZ3Yuc2xpY2UoMikpIDogYXJndi5zbGljZSgyKTtcblxuXHRcdFx0Ly8gV2Ugc3Bhd24gdGhlIHJlc29sdmVkIGV4ZWN1dGFibGUgZGlyZWN0bHlcblx0XHRcdGNoaWxkID0gc3Bhd24ocHJvY2Vzcy5leGVjUGF0aCwgc3Bhd25BcmdzLCBvcHRpb25zKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gT24gbWFjT1MsIHdlIHNwYXduIHVzaW5nIHRoZSBvcGVuIGNvbW1hbmQgdG8gb2J0YWluIGJlaGF2aW9yXG5cdFx0XHQvLyBzaW1pbGFyIHRvIGlmIHRoZSBhcHAgd2FzIGxhdW5jaGVkIGZyb20gdGhlIGRvY2tcblx0XHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMDI5NzVcblxuXHRcdFx0Ly8gVGhlIGZvbGxvd2luZyBhcmdzIGFyZSBmb3IgdGhlIG9wZW4gY29tbWFuZCBpdHNlbGYsIHJhdGhlciB0aGFuIGZvciBWUyBDb2RlOlxuXHRcdFx0Ly8gLW4gY3JlYXRlcyBhIG5ldyBpbnN0YW5jZS5cblx0XHRcdC8vICAgIFdpdGhvdXQgLW4sIHRoZSBvcGVuIGNvbW1hbmQgcmUtb3BlbnMgdGhlIGV4aXN0aW5nIGluc3RhbmNlIGFzLWlzLlxuXHRcdFx0Ly8gLWcgc3RhcnRzIHRoZSBuZXcgaW5zdGFuY2UgaW4gdGhlIGJhY2tncm91bmQuXG5cdFx0XHQvLyAgICBMYXRlciwgRWxlY3Ryb24gYnJpbmdzIHRoZSBpbnN0YW5jZSB0byB0aGUgZm9yZWdyb3VuZC5cblx0XHRcdC8vICAgIFRoaXMgd2F5LCBNYWMgZG9lcyBub3QgYXV0b21hdGljYWxseSB0cnkgdG8gZm9yZWdyb3VuZCB0aGUgbmV3IGluc3RhbmNlLCB3aGljaCBjYXVzZXNcblx0XHRcdC8vICAgIGZvY3VzaW5nIGlzc3VlcyB3aGVuIHRoZSBuZXcgaW5zdGFuY2Ugb25seSBzZW5kcyBkYXRhIHRvIGEgcHJldmlvdXMgaW5zdGFuY2UgYW5kIHRoZW4gY2xvc2VzLlxuXHRcdFx0Y29uc3Qgc3Bhd25BcmdzID0gWyctbicsICctZyddO1xuXHRcdFx0c3Bhd25BcmdzLnB1c2goJy1hJywgcHJvY2Vzcy5leGVjUGF0aCk7IC8vIC1hIG9wZW5zIHRoZSBnaXZlbiBhcHBsaWNhdGlvbi5cblxuXHRcdFx0aWYgKGFyZ3MudmVyYm9zZSB8fCBhcmdzLnN0YXR1cykge1xuXHRcdFx0XHRzcGF3bkFyZ3MucHVzaCgnLS13YWl0LWFwcHMnKTsgLy8gYG9wZW4gLS13YWl0LWFwcHNgOiBibG9ja3MgdW50aWwgdGhlIGxhdW5jaGVkIGFwcCBpcyBjbG9zZWQgKGV2ZW4gaWYgdGhleSB3ZXJlIGFscmVhZHkgcnVubmluZylcblxuXHRcdFx0XHQvLyBUaGUgb3BlbiBjb21tYW5kIG9ubHkgYWxsb3dzIGZvciByZWRpcmVjdGluZyBzdGRlcnIgYW5kIHN0ZG91dCB0byBmaWxlcyxcblx0XHRcdFx0Ly8gc28gd2UgbWFrZSBpdCByZWRpcmVjdCB0aG9zZSB0byB0ZW1wIGZpbGVzLCBhbmQgdGhlbiB1c2UgYSBsb2dnZXIgdG9cblx0XHRcdFx0Ly8gcmVkaXJlY3QgdGhlIGZpbGUgb3V0cHV0IHRvIHRoZSBjb25zb2xlXG5cdFx0XHRcdGZvciAoY29uc3Qgb3V0cHV0VHlwZSBvZiBhcmdzLnZlcmJvc2UgPyBbJ3N0ZG91dCcsICdzdGRlcnInXSA6IFsnc3Rkb3V0J10pIHtcblxuXHRcdFx0XHRcdC8vIFRtcCBmaWxlIHRvIHRhcmdldCBvdXRwdXQgdG9cblx0XHRcdFx0XHRjb25zdCB0bXBOYW1lID0gcmFuZG9tUGF0aCh0bXBkaXIoKSwgYGNvZGUtJHtvdXRwdXRUeXBlfWApO1xuXHRcdFx0XHRcdHdyaXRlRmlsZVN5bmModG1wTmFtZSwgJycpO1xuXHRcdFx0XHRcdHNwYXduQXJncy5wdXNoKGAtLSR7b3V0cHV0VHlwZX1gLCB0bXBOYW1lKTtcblxuXHRcdFx0XHRcdC8vIExpc3RlbmVyIHRvIHJlZGlyZWN0IGNvbnRlbnQgdG8gc3Rkb3V0L3N0ZGVyclxuXHRcdFx0XHRcdHByb2Nlc3NDYWxsYmFja3MucHVzaChhc3luYyBjaGlsZCA9PiB7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBzdHJlYW0gPSBvdXRwdXRUeXBlID09PSAnc3Rkb3V0JyA/IHByb2Nlc3Muc3Rkb3V0IDogcHJvY2Vzcy5zdGRlcnI7XG5cblx0XHRcdFx0XHRcdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0XHRcdFx0XHRcdGNoaWxkLm9uKCdjbG9zZScsICgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHQvLyBXZSBtdXN0IGRpc3Bvc2UgdGhlIHRva2VuIHRvIHN0b3Agd2F0Y2hpbmcsXG5cdFx0XHRcdFx0XHRcdFx0Ly8gYnV0IHRoZSB3YXRjaGVyIG1pZ2h0IHN0aWxsIGJlIHJlYWRpbmcgZGF0YS5cblx0XHRcdFx0XHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IGN0cy5kaXNwb3NlKHRydWUpLCAyMDApO1xuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0YXdhaXQgd2F0Y2hGaWxlQ29udGVudHModG1wTmFtZSwgY2h1bmsgPT4gc3RyZWFtLndyaXRlKGNodW5rKSwgKCkgPT4geyAvKiBpZ25vcmUgKi8gfSwgY3RzLnRva2VuKTtcblx0XHRcdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0XHRcdHVubGlua1N5bmModG1wTmFtZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBlIGluIGVudikge1xuXHRcdFx0XHQvLyBJZ25vcmUgdGhlIF8gZW52IHZhciwgYmVjYXVzZSB0aGUgb3BlbiBjb21tYW5kXG5cdFx0XHRcdC8vIGlnbm9yZXMgaXQgYW55d2F5LlxuXHRcdFx0XHQvLyBQYXNzIHRoZSByZXN0IG9mIHRoZSBlbnYgdmFycyBpbiB0byBmaXhcblx0XHRcdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEzNDY5Ni5cblx0XHRcdFx0aWYgKGUgIT09ICdfJykge1xuXHRcdFx0XHRcdHNwYXduQXJncy5wdXNoKCctLWVudicpO1xuXHRcdFx0XHRcdHNwYXduQXJncy5wdXNoKGAke2V9PSR7ZW52W2VdfWApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHNwYXduQXJncy5wdXNoKCctLWFyZ3MnLCAuLi5hcmd2LnNsaWNlKDIpKTsgLy8gcGFzcyBvbiBvdXIgYXJndW1lbnRzXG5cblx0XHRcdGlmIChlbnZbJ1ZTQ09ERV9ERVYnXSkge1xuXHRcdFx0XHQvLyBJZiB3ZSdyZSBpbiBkZXZlbG9wbWVudCBtb2RlLCByZXBsYWNlIHRoZSAuIGFyZyB3aXRoIHRoZVxuXHRcdFx0XHQvLyB2c2NvZGUgc291cmNlIGFyZy4gQmVjYXVzZSB0aGUgT1NTIGFwcCBpc24ndCBidW5kbGVkLFxuXHRcdFx0XHQvLyBpdCBuZWVkcyB0aGUgZnVsbCB2c2NvZGUgc291cmNlIGFyZyB0byBsYXVuY2ggcHJvcGVybHkuXG5cdFx0XHRcdGNvbnN0IGN1cmRpciA9ICcuJztcblx0XHRcdFx0Y29uc3QgbGF1bmNoRGlySW5kZXggPSBzcGF3bkFyZ3MuaW5kZXhPZihjdXJkaXIpO1xuXHRcdFx0XHRpZiAobGF1bmNoRGlySW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdFx0c3Bhd25BcmdzW2xhdW5jaERpckluZGV4XSA9IHJlc29sdmUoY3VyZGlyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBXZSBhbHJlYWR5IHBhc3NlZCBvdmVyIHRoZSBlbnYgdmFyaWFibGVzXG5cdFx0XHQvLyB1c2luZyB0aGUgLS1lbnYgZmxhZ3MsIHNvIHdlIGNhbiBsZWF2ZSB0aGVtIG91dCBoZXJlLlxuXHRcdFx0Ly8gQWxzbywgd2UgZG9uJ3QgbmVlZCB0byBwYXNzIGVudi5fLCB3aGljaCBpcyBkaWZmZXJlbnQgZnJvbSBhcmd2Ll9cblx0XHRcdGNoaWxkID0gc3Bhd24oJ29wZW4nLCBzcGF3bkFyZ3MsIHsgLi4ub3B0aW9ucywgZW52OiB7fSB9KTtcblx0XHR9XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChwcm9jZXNzQ2FsbGJhY2tzLm1hcChjYWxsYmFjayA9PiBjYWxsYmFjayhjaGlsZCkpKTtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXRBcHBSb290KCkge1xuXHRyZXR1cm4gZGlybmFtZShGaWxlQWNjZXNzLmFzRmlsZVVyaSgnJykuZnNQYXRoKTtcbn1cblxuZnVuY3Rpb24gZXZlbnR1YWxseUV4aXQoY29kZTogbnVtYmVyKTogdm9pZCB7XG5cdHNldFRpbWVvdXQoKCkgPT4gcHJvY2Vzcy5leGl0KGNvZGUpLCAwKTtcbn1cblxubWFpbihwcm9jZXNzLmFyZ3YpXG5cdC50aGVuKCgpID0+IGV2ZW50dWFsbHlFeGl0KDApKVxuXHQudGhlbihudWxsLCBlcnIgPT4ge1xuXHRcdGNvbnNvbGUuZXJyb3IoZXJyLm1lc3NhZ2UgfHwgZXJyLnN0YWNrIHx8IGVycik7XG5cdFx0ZXZlbnR1YWxseUV4aXQoMSk7XG5cdH0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBdUIsYUFBeUM7QUFDaEUsU0FBUyxXQUFXLFlBQVksY0FBYyxV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QUFNLFNBQVMsZUFBZSxXQUFXLFFBQVEsU0FBUyxRQUFRO0FBRWxFLG9CQUFNLE1BQU0sSUFBSSx3QkFBd0I7QUFDeEMsY0FBQUEsT0FBTSxHQUFHLFNBQVMsTUFBTTtBQUd2QiwyQkFBVyxNQUFNLElBQUksUUFBUSxJQUFJLEdBQUcsR0FBRztBQUFBLGNBQ3hDLENBQUM7QUFDRCxvQkFBTSxrQkFBa0IsU0FBUyxXQUFTLE9BQU8sTUFBTSxLQUFLLEdBQUcsTUFBTTtBQUFBLGNBQWUsR0FBRyxJQUFJLEtBQUs7QUFBQSxZQUNqRyxVQUFFO0FBQ0QseUJBQVcsT0FBTztBQUFBLFlBQ25CO0FBQUEsVUFDRCxDQUFDO0FBQUEsUUFDRjtBQUFBLE1BQ0Q7QUFFQSxpQkFBVyxLQUFLLEtBQUs7QUFLcEIsWUFBSSxNQUFNLEtBQUs7QUFDZCxvQkFBVSxLQUFLLE9BQU87QUFDdEIsb0JBQVUsS0FBSyxHQUFHLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxFQUFFO0FBQUEsUUFDaEM7QUFBQSxNQUNEO0FBRUEsZ0JBQVUsS0FBSyxVQUFVLEdBQUcsS0FBSyxNQUFNLENBQUMsQ0FBQztBQUV6QyxVQUFJLElBQUksWUFBWSxHQUFHO0FBSXRCLGNBQU0sU0FBUztBQUNmLGNBQU0saUJBQWlCLFVBQVUsUUFBUSxNQUFNO0FBQy9DLFlBQUksbUJBQW1CLElBQUk7QUFDMUIsb0JBQVUsY0FBYyxJQUFJLFFBQVEsTUFBTTtBQUFBLFFBQzNDO0FBQUEsTUFDRDtBQUtBLGNBQVEsTUFBTSxRQUFRLFdBQVcsRUFBRSxHQUFHLFNBQVMsS0FBSyxDQUFDLEVBQUUsQ0FBQztBQUFBLElBQ3pEO0FBRUEsVUFBTSxRQUFRLElBQUksaUJBQWlCLElBQUksY0FBWSxTQUFTLEtBQUssQ0FBQyxDQUFDO0FBQUEsRUFDcEU7QUFDRDtBQUVBLFNBQVMsYUFBYTtBQUNyQixTQUFPLFFBQVEsV0FBVyxVQUFVLEVBQUUsRUFBRSxNQUFNO0FBQy9DO0FBRUEsU0FBUyxlQUFlLE1BQW9CO0FBQzNDLGFBQVcsTUFBTSxRQUFRLEtBQUssSUFBSSxHQUFHLENBQUM7QUFDdkM7QUFFQSxLQUFLLFFBQVEsSUFBSSxFQUNmLEtBQUssTUFBTSxlQUFlLENBQUMsQ0FBQyxFQUM1QixLQUFLLE1BQU0sU0FBTztBQUNsQixVQUFRLE1BQU0sSUFBSSxXQUFXLElBQUksU0FBUyxHQUFHO0FBQzdDLGlCQUFlLENBQUM7QUFDakIsQ0FBQzsiLAogICJuYW1lcyI6IFsicmVzb2x2ZSIsICJjaGlsZCIsICJmaWxlbmFtZVByZWZpeCIsICJtYWluIl0KfQo=
