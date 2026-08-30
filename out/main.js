import * as path from "node:path";
import * as fs from "original-fs";
import * as os from "node:os";
import { performance } from "node:perf_hooks";
import { configurePortable } from "./bootstrap-node.js";
import { bootstrapESM } from "./bootstrap-esm.js";
import { app, protocol, crashReporter, Menu, contentTracing } from "electron";
import minimist from "minimist";
import { product } from "./bootstrap-meta.js";
import { parse } from "./vs/base/common/jsonc.js";
import { getUserDataPath } from "./vs/platform/environment/node/userDataPath.js";
import * as perf from "./vs/base/common/performance.js";
import { resolveNLSConfiguration } from "./vs/base/node/nls.js";
import { getUNCHost, addUNCHostToAllowlist } from "./vs/base/node/unc.js";
perf.mark("code/didStartMain");
perf.mark("code/willLoadMainBundle", {
  // When built, the main bundle is a single JS file with all
  // dependencies inlined. As such, we mark `willLoadMainBundle`
  // as the start of the main bundle loading process.
  startTime: Math.floor(performance.timeOrigin)
});
perf.mark("code/didLoadMainBundle");
const portable = configurePortable(product);
const args = parseCLIArgs();
const argvConfig = configureCommandlineSwitchesSync(args);
if (args["sandbox"] && !args["disable-chromium-sandbox"] && !argvConfig["disable-chromium-sandbox"]) {
  app.enableSandbox();
} else if (app.commandLine.hasSwitch("no-sandbox") && !app.commandLine.hasSwitch("disable-gpu-sandbox")) {
  app.commandLine.appendSwitch("disable-gpu-sandbox");
} else {
  app.commandLine.appendSwitch("no-sandbox");
  app.commandLine.appendSwitch("disable-gpu-sandbox");
}
const userDataPath = getUserDataPath(args, product.nameShort ?? "code-oss-dev");
if (process.platform === "win32") {
  const userDataUNCHost = getUNCHost(userDataPath);
  if (userDataUNCHost) {
    addUNCHostToAllowlist(userDataUNCHost);
  }
}
app.setPath("userData", userDataPath);
const codeCachePath = getCodeCachePath();
Menu.setApplicationMenu(null);
perf.mark("code/willStartCrashReporter");
if (args["crash-reporter-directory"] || argvConfig["enable-crash-reporter"] && !args["disable-crash-reporter"]) {
  configureCrashReporter();
}
perf.mark("code/didStartCrashReporter");
if (portable.isPortable) {
  app.setAppLogsPath(path.join(userDataPath, "logs"));
}
protocol.registerSchemesAsPrivileged([
  {
    scheme: "vscode-webview",
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, allowServiceWorkers: true, codeCache: true }
  },
  {
    scheme: "vscode-file",
    privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true, codeCache: true }
  },
  {
    scheme: "vscode-remote-resource",
    privileges: { secure: true, supportFetchAPI: true, corsEnabled: true }
  },
  {
    scheme: "vscode-managed-remote-resource",
    privileges: { secure: true, supportFetchAPI: true, corsEnabled: true }
  }
]);
registerListeners();
let nlsConfigurationPromise = void 0;
const osLocale = processZhLocale((app.getPreferredSystemLanguages()?.[0] ?? "en").toLowerCase());
const userLocale = getUserDefinedLocale(argvConfig);
if (userLocale) {
  nlsConfigurationPromise = resolveNLSConfiguration({
    userLocale,
    osLocale,
    commit: product.commit,
    userDataPath,
    nlsMetadataPath: import.meta.dirname
  });
}
if (process.platform === "win32" || process.platform === "linux") {
  const electronLocale = !userLocale || userLocale === "qps-ploc" ? "en" : userLocale;
  app.commandLine.appendSwitch("lang", electronLocale);
}
app.once("ready", function() {
  if (args["trace"]) {
    let traceOptions;
    if (args["trace-memory-infra"]) {
      const customCategories = args["trace-category-filter"]?.split(",") || [];
      customCategories.push("disabled-by-default-memory-infra", "disabled-by-default-memory-infra.v8.code_stats");
      traceOptions = {
        included_categories: customCategories,
        excluded_categories: ["*"],
        memory_dump_config: {
          allowed_dump_modes: ["light", "detailed"],
          triggers: [
            {
              type: "periodic_interval",
              mode: "detailed",
              min_time_between_dumps_ms: 1e4
            },
            {
              type: "periodic_interval",
              mode: "light",
              min_time_between_dumps_ms: 1e3
            }
          ]
        }
      };
    } else {
      traceOptions = {
        categoryFilter: args["trace-category-filter"] || "*",
        traceOptions: args["trace-options"] || "record-until-full,enable-sampling"
      };
    }
    contentTracing.startRecording(traceOptions).finally(() => onReady());
  } else {
    onReady();
  }
});
async function onReady() {
  perf.mark("code/mainAppReady");
  try {
    const [, nlsConfig] = await Promise.all([
      mkdirpIgnoreError(codeCachePath),
      resolveNlsConfiguration()
    ]);
    await startup(codeCachePath, nlsConfig);
  } catch (error) {
    console.error(error);
  }
}
async function startup(codeCachePath2, nlsConfig) {
  process.env["VSCODE_NLS_CONFIG"] = JSON.stringify(nlsConfig);
  process.env["VSCODE_CODE_CACHE_PATH"] = codeCachePath2 || "";
  await bootstrapESM();
  await import("./vs/code/electron-main/main.js");
  perf.mark("code/didRunMainBundle");
}
function configureCommandlineSwitchesSync(cliArgs) {
  const SUPPORTED_ELECTRON_SWITCHES = [
    // alias from us for --disable-gpu
    "disable-hardware-acceleration",
    // override for the color profile to use
    "force-color-profile",
    // disable LCD font rendering, a Chromium flag
    "disable-lcd-text",
    // bypass any specified proxy for the given semi-colon-separated list of hosts
    "proxy-bypass-list",
    "remote-debugging-port"
  ];
  if (process.platform === "linux") {
    SUPPORTED_ELECTRON_SWITCHES.push("force-renderer-accessibility");
    SUPPORTED_ELECTRON_SWITCHES.push("password-store");
  }
  const SUPPORTED_MAIN_PROCESS_SWITCHES = [
    // Persistently enable proposed api via argv.json: https://github.com/microsoft/vscode/issues/99775
    "enable-proposed-api",
    // Log level to use. Default is 'info'. Allowed values are 'error', 'warn', 'info', 'debug', 'trace', 'off'.
    "log-level",
    // Use an in-memory storage for secrets
    "use-inmemory-secretstorage",
    // Enables display tracking to restore maximized windows under RDP: https://github.com/electron/electron/issues/47016
    "enable-rdp-display-tracking"
  ];
  const argvConfig2 = readArgvConfigSync();
  Object.keys(argvConfig2).forEach((argvKey) => {
    const argvValue = argvConfig2[argvKey];
    if (SUPPORTED_ELECTRON_SWITCHES.indexOf(argvKey) !== -1) {
      if (argvValue === true || argvValue === "true") {
        if (argvKey === "disable-hardware-acceleration") {
          app.disableHardwareAcceleration();
        } else {
          app.commandLine.appendSwitch(argvKey);
        }
      } else if (typeof argvValue === "string" && argvValue) {
        if (argvKey === "password-store") {
          let migratedArgvValue = argvValue;
          if (argvValue === "gnome" || argvValue === "gnome-keyring") {
            migratedArgvValue = "gnome-libsecret";
          }
          app.commandLine.appendSwitch(argvKey, migratedArgvValue);
        } else {
          app.commandLine.appendSwitch(argvKey, argvValue);
        }
      }
    } else if (SUPPORTED_MAIN_PROCESS_SWITCHES.indexOf(argvKey) !== -1) {
      switch (argvKey) {
        case "enable-proposed-api":
          if (Array.isArray(argvValue)) {
            argvValue.forEach((id) => id && typeof id === "string" && process.argv.push("--enable-proposed-api", id));
          } else {
            console.error(`Unexpected value for \`enable-proposed-api\` in argv.json. Expected array of extension ids.`);
          }
          break;
        case "log-level":
          if (typeof argvValue === "string") {
            process.argv.push("--log", argvValue);
          } else if (Array.isArray(argvValue)) {
            for (const value of argvValue) {
              process.argv.push("--log", value);
            }
          }
          break;
        case "use-inmemory-secretstorage":
          if (argvValue) {
            process.argv.push("--use-inmemory-secretstorage");
          }
          break;
        case "enable-rdp-display-tracking":
          if (argvValue) {
            process.argv.push("--enable-rdp-display-tracking");
          }
          break;
      }
    }
  });
  const featuresToEnable = `NetAdapterMaxBufSizeFeature:NetAdapterMaxBufSize/8192,DocumentPolicyIncludeJSCallStacksInCrashReports,EarlyEstablishGpuChannel,EstablishGpuChannelAsync${process.platform === "linux" ? ",GlobalShortcutsPortal" : ""},${app.commandLine.getSwitchValue("enable-features")}`;
  app.commandLine.appendSwitch("enable-features", featuresToEnable);
  const featuresToDisable = `CalculateNativeWinOcclusion,${app.commandLine.getSwitchValue("disable-features")}`;
  app.commandLine.appendSwitch("disable-features", featuresToDisable);
  const blinkFeaturesToDisable = `FontMatchingCTMigration,StandardizedBrowserZoom,${app.commandLine.getSwitchValue("disable-blink-features")}`;
  app.commandLine.appendSwitch("disable-blink-features", blinkFeaturesToDisable);
  const jsFlags = getJSFlags(cliArgs, argvConfig2);
  if (jsFlags) {
    app.commandLine.appendSwitch("js-flags", jsFlags);
  }
  app.commandLine.appendSwitch("xdg-portal-required-version", "4");
  app.commandLine.appendSwitch("max-active-webgl-contexts", "32");
  return argvConfig2;
}
function readArgvConfigSync() {
  const argvConfigPath = getArgvConfigPath();
  let argvConfig2 = void 0;
  try {
    argvConfig2 = parse(fs.readFileSync(argvConfigPath).toString());
  } catch (error) {
    if (error && error.code === "ENOENT") {
      createDefaultArgvConfigSync(argvConfigPath);
    } else {
      console.warn(`Unable to read argv.json configuration file in ${argvConfigPath}, falling back to defaults (${error})`);
    }
  }
  if (!argvConfig2) {
    argvConfig2 = {};
  }
  return argvConfig2;
}
function createDefaultArgvConfigSync(argvConfigPath) {
  try {
    const argvConfigPathDirname = path.dirname(argvConfigPath);
    if (!fs.existsSync(argvConfigPathDirname)) {
      fs.mkdirSync(argvConfigPathDirname);
    }
    const defaultArgvConfigContent = [
      "// This configuration file allows you to pass permanent command line arguments to VS Code.",
      "// Only a subset of arguments is currently supported to reduce the likelihood of breaking",
      "// the installation.",
      "//",
      "// PLEASE DO NOT CHANGE WITHOUT UNDERSTANDING THE IMPACT",
      "//",
      "// NOTE: Changing this file requires a restart of VS Code.",
      "{",
      "	// Use software rendering instead of hardware accelerated rendering.",
      "	// This can help in cases where you see rendering issues in VS Code.",
      '	// "disable-hardware-acceleration": true',
      "}"
    ];
    fs.writeFileSync(argvConfigPath, defaultArgvConfigContent.join("\n"));
  } catch (error) {
    console.error(`Unable to create argv.json configuration file in ${argvConfigPath}, falling back to defaults (${error})`);
  }
}
function getArgvConfigPath() {
  const vscodePortable = process.env["VSCODE_PORTABLE"];
  if (vscodePortable) {
    return path.join(vscodePortable, "argv.json");
  }
  let dataFolderName = product.dataFolderName;
  if (process.env["VSCODE_DEV"]) {
    dataFolderName = `${dataFolderName}-dev`;
  }
  return path.join(os.homedir(), dataFolderName, "argv.json");
}
function configureCrashReporter() {
  let crashReporterDirectory = args["crash-reporter-directory"];
  let submitURL = "";
  if (crashReporterDirectory) {
    crashReporterDirectory = path.normalize(crashReporterDirectory);
    if (!path.isAbsolute(crashReporterDirectory)) {
      console.error(`The path '${crashReporterDirectory}' specified for --crash-reporter-directory must be absolute.`);
      app.exit(1);
    }
    if (!fs.existsSync(crashReporterDirectory)) {
      try {
        fs.mkdirSync(crashReporterDirectory, { recursive: true });
      } catch (error) {
        console.error(`The path '${crashReporterDirectory}' specified for --crash-reporter-directory does not seem to exist or cannot be created.`);
        app.exit(1);
      }
    }
    console.log(`Found --crash-reporter-directory argument. Setting crashDumps directory to be '${crashReporterDirectory}'`);
    app.setPath("crashDumps", crashReporterDirectory);
  } else {
    const appCenter = product.appCenter;
    if (appCenter) {
      const isWindows = process.platform === "win32";
      const isLinux = process.platform === "linux";
      const isDarwin = process.platform === "darwin";
      const crashReporterId = argvConfig["crash-reporter-id"];
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (crashReporterId && uuidPattern.test(crashReporterId)) {
        if (isWindows) {
          switch (process.arch) {
            case "x64":
              submitURL = appCenter["win32-x64"];
              break;
            case "arm64":
              submitURL = appCenter["win32-arm64"];
              break;
          }
        } else if (isDarwin) {
          if (product.darwinUniversalAssetId) {
            submitURL = appCenter["darwin-universal"];
          } else {
            switch (process.arch) {
              case "x64":
                submitURL = appCenter["darwin"];
                break;
              case "arm64":
                submitURL = appCenter["darwin-arm64"];
                break;
            }
          }
        } else if (isLinux) {
          submitURL = appCenter["linux-x64"];
        }
        submitURL = submitURL.concat("&uid=", crashReporterId, "&iid=", crashReporterId, "&sid=", crashReporterId);
        const argv = process.argv;
        const endOfArgsMarkerIndex = argv.indexOf("--");
        if (endOfArgsMarkerIndex === -1) {
          argv.push("--crash-reporter-id", crashReporterId);
        } else {
          argv.splice(endOfArgsMarkerIndex, 0, "--crash-reporter-id", crashReporterId);
        }
      }
    }
  }
  const productName = (product.crashReporter ? product.crashReporter.productName : void 0) || product.nameShort;
  const companyName = (product.crashReporter ? product.crashReporter.companyName : void 0) || "Microsoft";
  const uploadToServer = Boolean(!process.env["VSCODE_DEV"] && submitURL && !crashReporterDirectory);
  crashReporter.start({
    companyName,
    productName: process.env["VSCODE_DEV"] ? `${productName} Dev` : productName,
    submitURL,
    uploadToServer,
    compress: true,
    ignoreSystemCrashHandler: true
  });
}
function getJSFlags(cliArgs, argvConfig2) {
  const jsFlags = [];
  if (cliArgs["js-flags"]) {
    jsFlags.push(cliArgs["js-flags"]);
  }
  if (typeof argvConfig2["js-flags"] === "string" && argvConfig2["js-flags"]) {
    jsFlags.push(argvConfig2["js-flags"]);
  }
  return jsFlags.length > 0 ? jsFlags.join(" ") : null;
}
function parseCLIArgs() {
  return minimist(process.argv, {
    string: [
      "user-data-dir",
      "locale",
      "js-flags",
      "crash-reporter-directory"
    ],
    boolean: [
      "disable-chromium-sandbox"
    ],
    default: {
      "sandbox": true
    },
    alias: {
      "no-sandbox": "sandbox"
    }
  });
}
function registerListeners() {
  const macOpenFiles = [];
  globalThis.macOpenFiles = macOpenFiles;
  app.on("open-file", function(event, path2) {
    macOpenFiles.push(path2);
  });
  const openUrls = [];
  const onOpenUrl = function(event, url) {
    event.preventDefault();
    openUrls.push(url);
  };
  app.on("will-finish-launching", function() {
    app.on("open-url", onOpenUrl);
  });
  globalThis.getOpenUrls = function() {
    app.removeListener("open-url", onOpenUrl);
    return openUrls;
  };
}
function getCodeCachePath() {
  if (process.argv.indexOf("--no-cached-data") > 0) {
    return void 0;
  }
  if (process.env["VSCODE_DEV"]) {
    return void 0;
  }
  const commit = product.commit;
  if (!commit) {
    return void 0;
  }
  return path.join(userDataPath, "CachedData", commit);
}
async function mkdirpIgnoreError(dir) {
  if (typeof dir === "string") {
    try {
      await fs.promises.mkdir(dir, { recursive: true });
      return dir;
    } catch (error) {
    }
  }
  return void 0;
}
function processZhLocale(appLocale) {
  if (appLocale.startsWith("zh")) {
    const region = appLocale.split("-")[1];
    if (["hans", "cn", "sg", "my"].includes(region)) {
      return "zh-cn";
    }
    return "zh-tw";
  }
  return appLocale;
}
async function resolveNlsConfiguration() {
  const nlsConfiguration = nlsConfigurationPromise ? await nlsConfigurationPromise : void 0;
  if (nlsConfiguration) {
    return nlsConfiguration;
  }
  let userLocale2 = app.getLocale();
  if (!userLocale2) {
    return {
      userLocale: "en",
      osLocale,
      resolvedLanguage: "en",
      defaultMessagesFile: path.join(import.meta.dirname, "nls.messages.json"),
      // NLS: below 2 are a relic from old times only used by vscode-nls and deprecated
      locale: "en",
      availableLanguages: {}
    };
  }
  userLocale2 = processZhLocale(userLocale2.toLowerCase());
  return resolveNLSConfiguration({
    userLocale: userLocale2,
    osLocale,
    commit: product.commit,
    userDataPath,
    nlsMetadataPath: import.meta.dirname
  });
}
function getUserDefinedLocale(argvConfig2) {
  const locale = args["locale"];
  if (locale) {
    return locale.toLowerCase();
  }
  return typeof argvConfig2?.locale === "string" ? argvConfig2.locale.toLowerCase() : void 0;
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXG1haW4udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ25vZGU6cGF0aCc7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdvcmlnaW5hbC1mcyc7XG5pbXBvcnQgKiBhcyBvcyBmcm9tICdub2RlOm9zJztcbmltcG9ydCB7IHBlcmZvcm1hbmNlIH0gZnJvbSAnbm9kZTpwZXJmX2hvb2tzJztcbmltcG9ydCB7IGNvbmZpZ3VyZVBvcnRhYmxlIH0gZnJvbSAnLi9ib290c3RyYXAtbm9kZS5qcyc7XG5pbXBvcnQgeyBib290c3RyYXBFU00gfSBmcm9tICcuL2Jvb3RzdHJhcC1lc20uanMnO1xuaW1wb3J0IHsgYXBwLCBwcm90b2NvbCwgY3Jhc2hSZXBvcnRlciwgTWVudSwgY29udGVudFRyYWNpbmcgfSBmcm9tICdlbGVjdHJvbic7XG5pbXBvcnQgbWluaW1pc3QgZnJvbSAnbWluaW1pc3QnO1xuaW1wb3J0IHsgcHJvZHVjdCB9IGZyb20gJy4vYm9vdHN0cmFwLW1ldGEuanMnO1xuaW1wb3J0IHsgcGFyc2UgfSBmcm9tICcuL3ZzL2Jhc2UvY29tbW9uL2pzb25jLmpzJztcbmltcG9ydCB7IGdldFVzZXJEYXRhUGF0aCB9IGZyb20gJy4vdnMvcGxhdGZvcm0vZW52aXJvbm1lbnQvbm9kZS91c2VyRGF0YVBhdGguanMnO1xuaW1wb3J0ICogYXMgcGVyZiBmcm9tICcuL3ZzL2Jhc2UvY29tbW9uL3BlcmZvcm1hbmNlLmpzJztcbmltcG9ydCB7IHJlc29sdmVOTFNDb25maWd1cmF0aW9uIH0gZnJvbSAnLi92cy9iYXNlL25vZGUvbmxzLmpzJztcbmltcG9ydCB7IGdldFVOQ0hvc3QsIGFkZFVOQ0hvc3RUb0FsbG93bGlzdCB9IGZyb20gJy4vdnMvYmFzZS9ub2RlL3VuYy5qcyc7XG5pbXBvcnQgeyBJTkxTQ29uZmlndXJhdGlvbiB9IGZyb20gJy4vdnMvbmxzLmpzJztcbmltcG9ydCB7IE5hdGl2ZVBhcnNlZEFyZ3MgfSBmcm9tICcuL3ZzL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9hcmd2LmpzJztcblxucGVyZi5tYXJrKCdjb2RlL2RpZFN0YXJ0TWFpbicpO1xuXG5wZXJmLm1hcmsoJ2NvZGUvd2lsbExvYWRNYWluQnVuZGxlJywge1xuXHQvLyBXaGVuIGJ1aWx0LCB0aGUgbWFpbiBidW5kbGUgaXMgYSBzaW5nbGUgSlMgZmlsZSB3aXRoIGFsbFxuXHQvLyBkZXBlbmRlbmNpZXMgaW5saW5lZC4gQXMgc3VjaCwgd2UgbWFyayBgd2lsbExvYWRNYWluQnVuZGxlYFxuXHQvLyBhcyB0aGUgc3RhcnQgb2YgdGhlIG1haW4gYnVuZGxlIGxvYWRpbmcgcHJvY2Vzcy5cblx0c3RhcnRUaW1lOiBNYXRoLmZsb29yKHBlcmZvcm1hbmNlLnRpbWVPcmlnaW4pXG59KTtcbnBlcmYubWFyaygnY29kZS9kaWRMb2FkTWFpbkJ1bmRsZScpO1xuXG4vLyBFbmFibGUgcG9ydGFibGUgc3VwcG9ydFxuY29uc3QgcG9ydGFibGUgPSBjb25maWd1cmVQb3J0YWJsZShwcm9kdWN0KTtcblxuY29uc3QgYXJncyA9IHBhcnNlQ0xJQXJncygpO1xuLy8gQ29uZmlndXJlIHN0YXRpYyBjb21tYW5kIGxpbmUgYXJndW1lbnRzXG5jb25zdCBhcmd2Q29uZmlnID0gY29uZmlndXJlQ29tbWFuZGxpbmVTd2l0Y2hlc1N5bmMoYXJncyk7XG4vLyBFbmFibGUgc2FuZGJveCBnbG9iYWxseSB1bmxlc3Ncbi8vIDEpIGRpc2FibGVkIHZpYSBjb21tYW5kIGxpbmUgdXNpbmcgZWl0aGVyXG4vLyAgICBgLS1uby1zYW5kYm94YCBvciBgLS1kaXNhYmxlLWNocm9taXVtLXNhbmRib3hgIGFyZ3VtZW50LlxuLy8gMikgYXJndi5qc29uIGNvbnRhaW5zIGBkaXNhYmxlLWNocm9taXVtLXNhbmRib3g6IHRydWVgLlxuaWYgKGFyZ3NbJ3NhbmRib3gnXSAmJlxuXHQhYXJnc1snZGlzYWJsZS1jaHJvbWl1bS1zYW5kYm94J10gJiZcblx0IWFyZ3ZDb25maWdbJ2Rpc2FibGUtY2hyb21pdW0tc2FuZGJveCddKSB7XG5cdGFwcC5lbmFibGVTYW5kYm94KCk7XG59IGVsc2UgaWYgKGFwcC5jb21tYW5kTGluZS5oYXNTd2l0Y2goJ25vLXNhbmRib3gnKSAmJlxuXHQhYXBwLmNvbW1hbmRMaW5lLmhhc1N3aXRjaCgnZGlzYWJsZS1ncHUtc2FuZGJveCcpKSB7XG5cdC8vIERpc2FibGUgR1BVIHNhbmRib3ggd2hlbmV2ZXIgLS1uby1zYW5kYm94IGlzIHVzZWQuXG5cdGFwcC5jb21tYW5kTGluZS5hcHBlbmRTd2l0Y2goJ2Rpc2FibGUtZ3B1LXNhbmRib3gnKTtcbn0gZWxzZSB7XG5cdGFwcC5jb21tYW5kTGluZS5hcHBlbmRTd2l0Y2goJ25vLXNhbmRib3gnKTtcblx0YXBwLmNvbW1hbmRMaW5lLmFwcGVuZFN3aXRjaCgnZGlzYWJsZS1ncHUtc2FuZGJveCcpO1xufVxuXG4vLyBTZXQgdXNlckRhdGEgcGF0aCBiZWZvcmUgYXBwICdyZWFkeScgZXZlbnRcbmNvbnN0IHVzZXJEYXRhUGF0aCA9IGdldFVzZXJEYXRhUGF0aChhcmdzLCBwcm9kdWN0Lm5hbWVTaG9ydCA/PyAnY29kZS1vc3MtZGV2Jyk7XG5pZiAocHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJykge1xuXHRjb25zdCB1c2VyRGF0YVVOQ0hvc3QgPSBnZXRVTkNIb3N0KHVzZXJEYXRhUGF0aCk7XG5cdGlmICh1c2VyRGF0YVVOQ0hvc3QpIHtcblx0XHRhZGRVTkNIb3N0VG9BbGxvd2xpc3QodXNlckRhdGFVTkNIb3N0KTsgLy8gZW5hYmxlcyB0byB1c2UgVU5DIHBhdGhzIGluIHVzZXJEYXRhUGF0aFxuXHR9XG59XG5hcHAuc2V0UGF0aCgndXNlckRhdGEnLCB1c2VyRGF0YVBhdGgpO1xuXG4vLyBSZXNvbHZlIGNvZGUgY2FjaGUgcGF0aFxuY29uc3QgY29kZUNhY2hlUGF0aCA9IGdldENvZGVDYWNoZVBhdGgoKTtcblxuLy8gRGlzYWJsZSBkZWZhdWx0IG1lbnUgKGh0dHBzOi8vZ2l0aHViLmNvbS9lbGVjdHJvbi9lbGVjdHJvbi9pc3N1ZXMvMzU1MTIpXG5NZW51LnNldEFwcGxpY2F0aW9uTWVudShudWxsKTtcblxuLy8gQ29uZmlndXJlIGNyYXNoIHJlcG9ydGVyXG5wZXJmLm1hcmsoJ2NvZGUvd2lsbFN0YXJ0Q3Jhc2hSZXBvcnRlcicpO1xuLy8gSWYgYSBjcmFzaC1yZXBvcnRlci1kaXJlY3RvcnkgaXMgc3BlY2lmaWVkIHdlIHN0b3JlIHRoZSBjcmFzaCByZXBvcnRzXG4vLyBpbiB0aGUgc3BlY2lmaWVkIGRpcmVjdG9yeSBhbmQgZG9uJ3QgdXBsb2FkIHRoZW0gdG8gdGhlIGNyYXNoIHNlcnZlci5cbi8vXG4vLyBBcHBjZW50ZXIgY3Jhc2ggcmVwb3J0aW5nIGlzIGVuYWJsZWQgaWZcbi8vICogZW5hYmxlLWNyYXNoLXJlcG9ydGVyIHJ1bnRpbWUgYXJndW1lbnQgaXMgc2V0IHRvICd0cnVlJ1xuLy8gKiAtLWRpc2FibGUtY3Jhc2gtcmVwb3J0ZXIgY29tbWFuZCBsaW5lIHBhcmFtZXRlciBpcyBub3Qgc2V0XG4vL1xuLy8gRGlzYWJsZSBjcmFzaCByZXBvcnRpbmcgaW4gYWxsIG90aGVyIGNhc2VzLlxuaWYgKGFyZ3NbJ2NyYXNoLXJlcG9ydGVyLWRpcmVjdG9yeSddIHx8IChhcmd2Q29uZmlnWydlbmFibGUtY3Jhc2gtcmVwb3J0ZXInXSAmJiAhYXJnc1snZGlzYWJsZS1jcmFzaC1yZXBvcnRlciddKSkge1xuXHRjb25maWd1cmVDcmFzaFJlcG9ydGVyKCk7XG59XG5wZXJmLm1hcmsoJ2NvZGUvZGlkU3RhcnRDcmFzaFJlcG9ydGVyJyk7XG5cbi8vIFNldCBsb2dzIHBhdGggYmVmb3JlIGFwcCAncmVhZHknIGV2ZW50IGlmIHJ1bm5pbmcgcG9ydGFibGVcbi8vIHRvIGVuc3VyZSB0aGF0IG5vICdsb2dzJyBmb2xkZXIgaXMgY3JlYXRlZCBvbiBkaXNrIGF0IGFcbi8vIGxvY2F0aW9uIG91dHNpZGUgb2YgdGhlIHBvcnRhYmxlIGRpcmVjdG9yeVxuLy8gKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy81NjY1MSlcbmlmIChwb3J0YWJsZS5pc1BvcnRhYmxlKSB7XG5cdGFwcC5zZXRBcHBMb2dzUGF0aChwYXRoLmpvaW4odXNlckRhdGFQYXRoLCAnbG9ncycpKTtcbn1cblxuLy8gUmVnaXN0ZXIgY3VzdG9tIHNjaGVtZXMgd2l0aCBwcml2aWxlZ2VzXG5wcm90b2NvbC5yZWdpc3RlclNjaGVtZXNBc1ByaXZpbGVnZWQoW1xuXHR7XG5cdFx0c2NoZW1lOiAndnNjb2RlLXdlYnZpZXcnLFxuXHRcdHByaXZpbGVnZXM6IHsgc3RhbmRhcmQ6IHRydWUsIHNlY3VyZTogdHJ1ZSwgc3VwcG9ydEZldGNoQVBJOiB0cnVlLCBjb3JzRW5hYmxlZDogdHJ1ZSwgYWxsb3dTZXJ2aWNlV29ya2VyczogdHJ1ZSwgY29kZUNhY2hlOiB0cnVlIH1cblx0fSxcblx0e1xuXHRcdHNjaGVtZTogJ3ZzY29kZS1maWxlJyxcblx0XHRwcml2aWxlZ2VzOiB7IHNlY3VyZTogdHJ1ZSwgc3RhbmRhcmQ6IHRydWUsIHN1cHBvcnRGZXRjaEFQSTogdHJ1ZSwgY29yc0VuYWJsZWQ6IHRydWUsIGNvZGVDYWNoZTogdHJ1ZSB9XG5cdH0sXG5cdHtcblx0XHRzY2hlbWU6ICd2c2NvZGUtcmVtb3RlLXJlc291cmNlJyxcblx0XHRwcml2aWxlZ2VzOiB7IHNlY3VyZTogdHJ1ZSwgc3VwcG9ydEZldGNoQVBJOiB0cnVlLCBjb3JzRW5hYmxlZDogdHJ1ZSB9XG5cdH0sXG5cdHtcblx0XHRzY2hlbWU6ICd2c2NvZGUtbWFuYWdlZC1yZW1vdGUtcmVzb3VyY2UnLFxuXHRcdHByaXZpbGVnZXM6IHsgc2VjdXJlOiB0cnVlLCBzdXBwb3J0RmV0Y2hBUEk6IHRydWUsIGNvcnNFbmFibGVkOiB0cnVlIH1cblx0fVxuXSk7XG5cbi8vIEdsb2JhbCBhcHAgbGlzdGVuZXJzXG5yZWdpc3Rlckxpc3RlbmVycygpO1xuXG4vKipcbiAqIFdlIGNhbiByZXNvbHZlIHRoZSBOTFMgY29uZmlndXJhdGlvbiBlYXJseSBpZiBpdCBpcyBkZWZpbmVkXG4gKiBpbiBhcmd2Lmpzb24gYmVmb3JlIGBhcHAucmVhZHlgIGV2ZW50LiBPdGhlcndpc2Ugd2UgY2FuIG9ubHlcbiAqIHJlc29sdmUgTkxTIGFmdGVyIGBhcHAucmVhZHlgIGV2ZW50IHRvIHJlc29sdmUgdGhlIE9TIGxvY2FsZS5cbiAqL1xubGV0IG5sc0NvbmZpZ3VyYXRpb25Qcm9taXNlOiBQcm9taXNlPElOTFNDb25maWd1cmF0aW9uPiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuLy8gVXNlIHRoZSBtb3N0IHByZWZlcnJlZCBPUyBsYW5ndWFnZSBmb3IgbGFuZ3VhZ2UgcmVjb21tZW5kYXRpb24uXG4vLyBUaGUgQVBJIG1pZ2h0IHJldHVybiBhbiBlbXB0eSBhcnJheSBvbiBMaW51eCwgc3VjaCBhcyB3aGVuXG4vLyB0aGUgJ0MnIGxvY2FsZSBpcyB0aGUgdXNlcidzIG9ubHkgY29uZmlndXJlZCBsb2NhbGUuXG4vLyBObyBtYXR0ZXIgdGhlIE9TLCBpZiB0aGUgYXJyYXkgaXMgZW1wdHksIGRlZmF1bHQgYmFjayB0byAnZW4nLlxuY29uc3Qgb3NMb2NhbGUgPSBwcm9jZXNzWmhMb2NhbGUoKGFwcC5nZXRQcmVmZXJyZWRTeXN0ZW1MYW5ndWFnZXMoKT8uWzBdID8/ICdlbicpLnRvTG93ZXJDYXNlKCkpO1xuY29uc3QgdXNlckxvY2FsZSA9IGdldFVzZXJEZWZpbmVkTG9jYWxlKGFyZ3ZDb25maWcpO1xuaWYgKHVzZXJMb2NhbGUpIHtcblx0bmxzQ29uZmlndXJhdGlvblByb21pc2UgPSByZXNvbHZlTkxTQ29uZmlndXJhdGlvbih7XG5cdFx0dXNlckxvY2FsZSxcblx0XHRvc0xvY2FsZSxcblx0XHRjb21taXQ6IHByb2R1Y3QuY29tbWl0LFxuXHRcdHVzZXJEYXRhUGF0aCxcblx0XHRubHNNZXRhZGF0YVBhdGg6IGltcG9ydC5tZXRhLmRpcm5hbWVcblx0fSk7XG59XG5cbi8vIFBhc3MgaW4gdGhlIGxvY2FsZSB0byBFbGVjdHJvbiBzbyB0aGF0IHRoZVxuLy8gV2luZG93cyBDb250cm9sIE92ZXJsYXkgaXMgcmVuZGVyZWQgY29ycmVjdGx5IG9uIFdpbmRvd3MuXG4vLyBGb3Igbm93LCBkb24ndCBwYXNzIGluIHRoZSBsb2NhbGUgb24gbWFjT1MgZHVlIHRvXG4vLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTY3NTQzLlxuLy8gSWYgdGhlIGxvY2FsZSBpcyBgcXBzLXBsb2NgLCB0aGUgTWljcm9zb2Z0XG4vLyBQc2V1ZG8gTGFuZ3VhZ2UgTGFuZ3VhZ2UgUGFjayBpcyBiZWluZyB1c2VkLlxuLy8gSW4gdGhhdCBjYXNlLCB1c2UgYGVuYCBhcyB0aGUgRWxlY3Ryb24gbG9jYWxlLlxuXG5pZiAocHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJyB8fCBwcm9jZXNzLnBsYXRmb3JtID09PSAnbGludXgnKSB7XG5cdGNvbnN0IGVsZWN0cm9uTG9jYWxlID0gKCF1c2VyTG9jYWxlIHx8IHVzZXJMb2NhbGUgPT09ICdxcHMtcGxvYycpID8gJ2VuJyA6IHVzZXJMb2NhbGU7XG5cdGFwcC5jb21tYW5kTGluZS5hcHBlbmRTd2l0Y2goJ2xhbmcnLCBlbGVjdHJvbkxvY2FsZSk7XG59XG5cbi8vIExvYWQgb3VyIGNvZGUgb25jZSByZWFkeVxuYXBwLm9uY2UoJ3JlYWR5JywgZnVuY3Rpb24gKCkge1xuXHRpZiAoYXJnc1sndHJhY2UnXSkge1xuXHRcdGxldCB0cmFjZU9wdGlvbnM6IEVsZWN0cm9uLlRyYWNlQ29uZmlnIHwgRWxlY3Ryb24uVHJhY2VDYXRlZ29yaWVzQW5kT3B0aW9ucztcblx0XHRpZiAoYXJnc1sndHJhY2UtbWVtb3J5LWluZnJhJ10pIHtcblx0XHRcdGNvbnN0IGN1c3RvbUNhdGVnb3JpZXMgPSBhcmdzWyd0cmFjZS1jYXRlZ29yeS1maWx0ZXInXT8uc3BsaXQoJywnKSB8fCBbXTtcblx0XHRcdGN1c3RvbUNhdGVnb3JpZXMucHVzaCgnZGlzYWJsZWQtYnktZGVmYXVsdC1tZW1vcnktaW5mcmEnLCAnZGlzYWJsZWQtYnktZGVmYXVsdC1tZW1vcnktaW5mcmEudjguY29kZV9zdGF0cycpO1xuXHRcdFx0dHJhY2VPcHRpb25zID0ge1xuXHRcdFx0XHRpbmNsdWRlZF9jYXRlZ29yaWVzOiBjdXN0b21DYXRlZ29yaWVzLFxuXHRcdFx0XHRleGNsdWRlZF9jYXRlZ29yaWVzOiBbJyonXSxcblx0XHRcdFx0bWVtb3J5X2R1bXBfY29uZmlnOiB7XG5cdFx0XHRcdFx0YWxsb3dlZF9kdW1wX21vZGVzOiBbJ2xpZ2h0JywgJ2RldGFpbGVkJ10sXG5cdFx0XHRcdFx0dHJpZ2dlcnM6IFtcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3BlcmlvZGljX2ludGVydmFsJyxcblx0XHRcdFx0XHRcdFx0bW9kZTogJ2RldGFpbGVkJyxcblx0XHRcdFx0XHRcdFx0bWluX3RpbWVfYmV0d2Vlbl9kdW1wc19tczogMTAwMDBcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdwZXJpb2RpY19pbnRlcnZhbCcsXG5cdFx0XHRcdFx0XHRcdG1vZGU6ICdsaWdodCcsXG5cdFx0XHRcdFx0XHRcdG1pbl90aW1lX2JldHdlZW5fZHVtcHNfbXM6IDEwMDBcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRyYWNlT3B0aW9ucyA9IHtcblx0XHRcdFx0Y2F0ZWdvcnlGaWx0ZXI6IGFyZ3NbJ3RyYWNlLWNhdGVnb3J5LWZpbHRlciddIHx8ICcqJyxcblx0XHRcdFx0dHJhY2VPcHRpb25zOiBhcmdzWyd0cmFjZS1vcHRpb25zJ10gfHwgJ3JlY29yZC11bnRpbC1mdWxsLGVuYWJsZS1zYW1wbGluZydcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29udGVudFRyYWNpbmcuc3RhcnRSZWNvcmRpbmcodHJhY2VPcHRpb25zKS5maW5hbGx5KCgpID0+IG9uUmVhZHkoKSk7XG5cdH0gZWxzZSB7XG5cdFx0b25SZWFkeSgpO1xuXHR9XG59KTtcblxuYXN5bmMgZnVuY3Rpb24gb25SZWFkeSgpIHtcblx0cGVyZi5tYXJrKCdjb2RlL21haW5BcHBSZWFkeScpO1xuXG5cdHRyeSB7XG5cdFx0Y29uc3QgWywgbmxzQ29uZmlnXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdG1rZGlycElnbm9yZUVycm9yKGNvZGVDYWNoZVBhdGgpLFxuXHRcdFx0cmVzb2x2ZU5sc0NvbmZpZ3VyYXRpb24oKVxuXHRcdF0pO1xuXG5cdFx0YXdhaXQgc3RhcnR1cChjb2RlQ2FjaGVQYXRoLCBubHNDb25maWcpO1xuXHR9IGNhdGNoIChlcnJvcikge1xuXHRcdGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuXHR9XG59XG5cbi8qKlxuICogTWFpbiBzdGFydHVwIHJvdXRpbmVcbiAqL1xuYXN5bmMgZnVuY3Rpb24gc3RhcnR1cChjb2RlQ2FjaGVQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQsIG5sc0NvbmZpZzogSU5MU0NvbmZpZ3VyYXRpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0cHJvY2Vzcy5lbnZbJ1ZTQ09ERV9OTFNfQ09ORklHJ10gPSBKU09OLnN0cmluZ2lmeShubHNDb25maWcpO1xuXHRwcm9jZXNzLmVudlsnVlNDT0RFX0NPREVfQ0FDSEVfUEFUSCddID0gY29kZUNhY2hlUGF0aCB8fCAnJztcblxuXHQvLyBCb290c3RyYXAgRVNNXG5cdGF3YWl0IGJvb3RzdHJhcEVTTSgpO1xuXG5cdC8vIExvYWQgTWFpblxuXHRhd2FpdCBpbXBvcnQoJy4vdnMvY29kZS9lbGVjdHJvbi1tYWluL21haW4uanMnKTtcblx0cGVyZi5tYXJrKCdjb2RlL2RpZFJ1bk1haW5CdW5kbGUnKTtcbn1cblxuZnVuY3Rpb24gY29uZmlndXJlQ29tbWFuZGxpbmVTd2l0Y2hlc1N5bmMoY2xpQXJnczogTmF0aXZlUGFyc2VkQXJncykge1xuXHRjb25zdCBTVVBQT1JURURfRUxFQ1RST05fU1dJVENIRVMgPSBbXG5cblx0XHQvLyBhbGlhcyBmcm9tIHVzIGZvciAtLWRpc2FibGUtZ3B1XG5cdFx0J2Rpc2FibGUtaGFyZHdhcmUtYWNjZWxlcmF0aW9uJyxcblxuXHRcdC8vIG92ZXJyaWRlIGZvciB0aGUgY29sb3IgcHJvZmlsZSB0byB1c2Vcblx0XHQnZm9yY2UtY29sb3ItcHJvZmlsZScsXG5cblx0XHQvLyBkaXNhYmxlIExDRCBmb250IHJlbmRlcmluZywgYSBDaHJvbWl1bSBmbGFnXG5cdFx0J2Rpc2FibGUtbGNkLXRleHQnLFxuXG5cdFx0Ly8gYnlwYXNzIGFueSBzcGVjaWZpZWQgcHJveHkgZm9yIHRoZSBnaXZlbiBzZW1pLWNvbG9uLXNlcGFyYXRlZCBsaXN0IG9mIGhvc3RzXG5cdFx0J3Byb3h5LWJ5cGFzcy1saXN0JyxcblxuXHRcdCdyZW1vdGUtZGVidWdnaW5nLXBvcnQnXG5cdF07XG5cblx0aWYgKHByb2Nlc3MucGxhdGZvcm0gPT09ICdsaW51eCcpIHtcblxuXHRcdC8vIEZvcmNlIGVuYWJsZSBzY3JlZW4gcmVhZGVycyBvbiBMaW51eCB2aWEgdGhpcyBmbGFnXG5cdFx0U1VQUE9SVEVEX0VMRUNUUk9OX1NXSVRDSEVTLnB1c2goJ2ZvcmNlLXJlbmRlcmVyLWFjY2Vzc2liaWxpdHknKTtcblxuXHRcdC8vIG92ZXJyaWRlIHdoaWNoIHBhc3N3b3JkLXN0b3JlIGlzIHVzZWQgb24gTGludXhcblx0XHRTVVBQT1JURURfRUxFQ1RST05fU1dJVENIRVMucHVzaCgncGFzc3dvcmQtc3RvcmUnKTtcblx0fVxuXG5cdGNvbnN0IFNVUFBPUlRFRF9NQUlOX1BST0NFU1NfU1dJVENIRVMgPSBbXG5cblx0XHQvLyBQZXJzaXN0ZW50bHkgZW5hYmxlIHByb3Bvc2VkIGFwaSB2aWEgYXJndi5qc29uOiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvOTk3NzVcblx0XHQnZW5hYmxlLXByb3Bvc2VkLWFwaScsXG5cblx0XHQvLyBMb2cgbGV2ZWwgdG8gdXNlLiBEZWZhdWx0IGlzICdpbmZvJy4gQWxsb3dlZCB2YWx1ZXMgYXJlICdlcnJvcicsICd3YXJuJywgJ2luZm8nLCAnZGVidWcnLCAndHJhY2UnLCAnb2ZmJy5cblx0XHQnbG9nLWxldmVsJyxcblxuXHRcdC8vIFVzZSBhbiBpbi1tZW1vcnkgc3RvcmFnZSBmb3Igc2VjcmV0c1xuXHRcdCd1c2UtaW5tZW1vcnktc2VjcmV0c3RvcmFnZScsXG5cblx0XHQvLyBFbmFibGVzIGRpc3BsYXkgdHJhY2tpbmcgdG8gcmVzdG9yZSBtYXhpbWl6ZWQgd2luZG93cyB1bmRlciBSRFA6IGh0dHBzOi8vZ2l0aHViLmNvbS9lbGVjdHJvbi9lbGVjdHJvbi9pc3N1ZXMvNDcwMTZcblx0XHQnZW5hYmxlLXJkcC1kaXNwbGF5LXRyYWNraW5nJyxcblx0XTtcblxuXHQvLyBSZWFkIGFyZ3YgY29uZmlnXG5cdGNvbnN0IGFyZ3ZDb25maWcgPSByZWFkQXJndkNvbmZpZ1N5bmMoKTtcblxuXHRPYmplY3Qua2V5cyhhcmd2Q29uZmlnKS5mb3JFYWNoKGFyZ3ZLZXkgPT4ge1xuXHRcdGNvbnN0IGFyZ3ZWYWx1ZSA9IGFyZ3ZDb25maWdbYXJndktleV07XG5cblx0XHQvLyBBcHBlbmQgRWxlY3Ryb24gZmxhZ3MgdG8gRWxlY3Ryb25cblx0XHRpZiAoU1VQUE9SVEVEX0VMRUNUUk9OX1NXSVRDSEVTLmluZGV4T2YoYXJndktleSkgIT09IC0xKSB7XG5cdFx0XHRpZiAoYXJndlZhbHVlID09PSB0cnVlIHx8IGFyZ3ZWYWx1ZSA9PT0gJ3RydWUnKSB7XG5cdFx0XHRcdGlmIChhcmd2S2V5ID09PSAnZGlzYWJsZS1oYXJkd2FyZS1hY2NlbGVyYXRpb24nKSB7XG5cdFx0XHRcdFx0YXBwLmRpc2FibGVIYXJkd2FyZUFjY2VsZXJhdGlvbigpOyAvLyBuZWVkcyB0byBiZSBjYWxsZWQgZXhwbGljaXRseVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGFwcC5jb21tYW5kTGluZS5hcHBlbmRTd2l0Y2goYXJndktleSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIGFyZ3ZWYWx1ZSA9PT0gJ3N0cmluZycgJiYgYXJndlZhbHVlKSB7XG5cdFx0XHRcdGlmIChhcmd2S2V5ID09PSAncGFzc3dvcmQtc3RvcmUnKSB7XG5cdFx0XHRcdFx0Ly8gUGFzc3dvcmQgc3RvcmVcblx0XHRcdFx0XHQvLyBUT0RPQFR5bGVyTGVvbmhhcmR0OiBSZW1vdmUgdGhpcyBtaWdyYXRpb24gaW4gMyBtb250aHNcblx0XHRcdFx0XHRsZXQgbWlncmF0ZWRBcmd2VmFsdWUgPSBhcmd2VmFsdWU7XG5cdFx0XHRcdFx0aWYgKGFyZ3ZWYWx1ZSA9PT0gJ2dub21lJyB8fCBhcmd2VmFsdWUgPT09ICdnbm9tZS1rZXlyaW5nJykge1xuXHRcdFx0XHRcdFx0bWlncmF0ZWRBcmd2VmFsdWUgPSAnZ25vbWUtbGlic2VjcmV0Jztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YXBwLmNvbW1hbmRMaW5lLmFwcGVuZFN3aXRjaChhcmd2S2V5LCBtaWdyYXRlZEFyZ3ZWYWx1ZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YXBwLmNvbW1hbmRMaW5lLmFwcGVuZFN3aXRjaChhcmd2S2V5LCBhcmd2VmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQXBwZW5kIG1haW4gcHJvY2VzcyBmbGFncyB0byBwcm9jZXNzLmFyZ3Zcblx0XHRlbHNlIGlmIChTVVBQT1JURURfTUFJTl9QUk9DRVNTX1NXSVRDSEVTLmluZGV4T2YoYXJndktleSkgIT09IC0xKSB7XG5cdFx0XHRzd2l0Y2ggKGFyZ3ZLZXkpIHtcblx0XHRcdFx0Y2FzZSAnZW5hYmxlLXByb3Bvc2VkLWFwaSc6XG5cdFx0XHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoYXJndlZhbHVlKSkge1xuXHRcdFx0XHRcdFx0YXJndlZhbHVlLmZvckVhY2goaWQgPT4gaWQgJiYgdHlwZW9mIGlkID09PSAnc3RyaW5nJyAmJiBwcm9jZXNzLmFyZ3YucHVzaCgnLS1lbmFibGUtcHJvcG9zZWQtYXBpJywgaWQpKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29uc29sZS5lcnJvcihgVW5leHBlY3RlZCB2YWx1ZSBmb3IgXFxgZW5hYmxlLXByb3Bvc2VkLWFwaVxcYCBpbiBhcmd2Lmpzb24uIEV4cGVjdGVkIGFycmF5IG9mIGV4dGVuc2lvbiBpZHMuYCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgJ2xvZy1sZXZlbCc6XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiBhcmd2VmFsdWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHRwcm9jZXNzLmFyZ3YucHVzaCgnLS1sb2cnLCBhcmd2VmFsdWUpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShhcmd2VmFsdWUpKSB7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IHZhbHVlIG9mIGFyZ3ZWYWx1ZSkge1xuXHRcdFx0XHRcdFx0XHRwcm9jZXNzLmFyZ3YucHVzaCgnLS1sb2cnLCB2YWx1ZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgJ3VzZS1pbm1lbW9yeS1zZWNyZXRzdG9yYWdlJzpcblx0XHRcdFx0XHRpZiAoYXJndlZhbHVlKSB7XG5cdFx0XHRcdFx0XHRwcm9jZXNzLmFyZ3YucHVzaCgnLS11c2UtaW5tZW1vcnktc2VjcmV0c3RvcmFnZScpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlICdlbmFibGUtcmRwLWRpc3BsYXktdHJhY2tpbmcnOlxuXHRcdFx0XHRcdGlmIChhcmd2VmFsdWUpIHtcblx0XHRcdFx0XHRcdHByb2Nlc3MuYXJndi5wdXNoKCctLWVuYWJsZS1yZHAtZGlzcGxheS10cmFja2luZycpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdC8vIEZvbGxvd2luZyBmZWF0dXJlcyBhcmUgZW5hYmxlZCBmcm9tIHRoZSBydW50aW1lOlxuXHQvLyBgTmV0QWRhcHRlck1heEJ1ZlNpemVGZWF0dXJlYCAtIFNwZWNpZnkgdGhlIG1heCBidWZmZXIgc2l6ZSBmb3IgTmV0VG9Nb2pvUGVuZGluZ0J1ZmZlciwgcmVmcyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjY4ODAwXG5cdC8vIGBEb2N1bWVudFBvbGljeUluY2x1ZGVKU0NhbGxTdGFja3NJbkNyYXNoUmVwb3J0c2AgLSBodHRwczovL3d3dy5lbGVjdHJvbmpzLm9yZy9kb2NzL2xhdGVzdC9hcGkvd2ViLWZyYW1lLW1haW4jZnJhbWVjb2xsZWN0amF2YXNjcmlwdGNhbGxzdGFjay1leHBlcmltZW50YWxcblx0Ly8gYEVhcmx5RXN0YWJsaXNoR3B1Q2hhbm5lbGAgLSBSZWZzIGh0dHBzOi8vaXNzdWVzLmNocm9taXVtLm9yZy9pc3N1ZXMvNDAyMDgwNjVcblx0Ly8gYEVzdGFibGlzaEdwdUNoYW5uZWxBc3luY2AgLSBSZWZzIGh0dHBzOi8vaXNzdWVzLmNocm9taXVtLm9yZy9pc3N1ZXMvNDAyMDgwNjVcblx0Ly8gYEdsb2JhbFNob3J0Y3V0c1BvcnRhbGAgLSBFbmFibGVzIEVsZWN0cm9uJ3MgYGdsb2JhbFNob3J0Y3V0YCAoc3lzdGVtLXdpZGUga2V5YmluZGluZ3MpIG9uIExpbnV4IFdheWxhbmQgdmlhIHRoZSBYREcgZ2xvYmFsIHNob3J0Y3V0cyBwb3J0YWwgKG5vLW9wIGVsc2V3aGVyZSlcblx0Y29uc3QgZmVhdHVyZXNUb0VuYWJsZSA9XG5cdFx0YE5ldEFkYXB0ZXJNYXhCdWZTaXplRmVhdHVyZTpOZXRBZGFwdGVyTWF4QnVmU2l6ZS84MTkyLERvY3VtZW50UG9saWN5SW5jbHVkZUpTQ2FsbFN0YWNrc0luQ3Jhc2hSZXBvcnRzLEVhcmx5RXN0YWJsaXNoR3B1Q2hhbm5lbCxFc3RhYmxpc2hHcHVDaGFubmVsQXN5bmMke3Byb2Nlc3MucGxhdGZvcm0gPT09ICdsaW51eCcgPyAnLEdsb2JhbFNob3J0Y3V0c1BvcnRhbCcgOiAnJ30sJHthcHAuY29tbWFuZExpbmUuZ2V0U3dpdGNoVmFsdWUoJ2VuYWJsZS1mZWF0dXJlcycpfWA7XG5cdGFwcC5jb21tYW5kTGluZS5hcHBlbmRTd2l0Y2goJ2VuYWJsZS1mZWF0dXJlcycsIGZlYXR1cmVzVG9FbmFibGUpO1xuXG5cdC8vIEZvbGxvd2luZyBmZWF0dXJlcyBhcmUgZGlzYWJsZWQgZnJvbSB0aGUgcnVudGltZTpcblx0Ly8gYENhbGN1bGF0ZU5hdGl2ZVdpbk9jY2x1c2lvbmAgLSBEaXNhYmxlIG5hdGl2ZSB3aW5kb3cgb2NjbHVzaW9uIHRyYWNrZXIgKGh0dHBzOi8vZ3JvdXBzLmdvb2dsZS5jb20vYS9jaHJvbWl1bS5vcmcvZy9lbWJlZGRlci1kZXYvYy9aRjN1SEh5V0xLdy9tL1ZETjJoRFhNQUFBSilcblx0Y29uc3QgZmVhdHVyZXNUb0Rpc2FibGUgPVxuXHRcdGBDYWxjdWxhdGVOYXRpdmVXaW5PY2NsdXNpb24sJHthcHAuY29tbWFuZExpbmUuZ2V0U3dpdGNoVmFsdWUoJ2Rpc2FibGUtZmVhdHVyZXMnKX1gO1xuXHRhcHAuY29tbWFuZExpbmUuYXBwZW5kU3dpdGNoKCdkaXNhYmxlLWZlYXR1cmVzJywgZmVhdHVyZXNUb0Rpc2FibGUpO1xuXG5cdC8vIEJsaW5rIGZlYXR1cmVzIHRvIGNvbmZpZ3VyZS5cblx0Ly8gYEZvbnRNYXRjaGluZ0NUTWlncmF0aW9uYCAtIFNpd3RjaCBmb250IG1hdGNoaW5nIG9uIG1hY09TIHRvIEFwcGtpdCAoUmVmcyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjI0NDk2I2lzc3VlY29tbWVudC0yMjcwNDE4NDcwKS5cblx0Ly8gYFN0YW5kYXJkaXplZEJyb3dzZXJab29tYCAtIERpc2FibGUgem9vbSBhZGp1c3RtZW50IGZvciBib3VuZGluZyBib3ggKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMzI3NTAjaXNzdWVjb21tZW50LTI0NTk0OTUzOTQpXG5cdGNvbnN0IGJsaW5rRmVhdHVyZXNUb0Rpc2FibGUgPVxuXHRcdGBGb250TWF0Y2hpbmdDVE1pZ3JhdGlvbixTdGFuZGFyZGl6ZWRCcm93c2VyWm9vbSwke2FwcC5jb21tYW5kTGluZS5nZXRTd2l0Y2hWYWx1ZSgnZGlzYWJsZS1ibGluay1mZWF0dXJlcycpfWA7XG5cdGFwcC5jb21tYW5kTGluZS5hcHBlbmRTd2l0Y2goJ2Rpc2FibGUtYmxpbmstZmVhdHVyZXMnLCBibGlua0ZlYXR1cmVzVG9EaXNhYmxlKTtcblxuXHQvLyBTdXBwb3J0IEpTIEZsYWdzXG5cdGNvbnN0IGpzRmxhZ3MgPSBnZXRKU0ZsYWdzKGNsaUFyZ3MsIGFyZ3ZDb25maWcpO1xuXHRpZiAoanNGbGFncykge1xuXHRcdGFwcC5jb21tYW5kTGluZS5hcHBlbmRTd2l0Y2goJ2pzLWZsYWdzJywganNGbGFncyk7XG5cdH1cblxuXHQvLyBVc2UgcG9ydGFsIHZlcnNpb24gNCB0aGF0IHN1cHBvcnRzIGN1cnJlbnRfZm9sZGVyIG9wdGlvblxuXHQvLyB0byBhZGRyZXNzIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMTM3ODBcblx0Ly8gUnVudGltZSBzZXRzIHRoZSBkZWZhdWx0IHZlcnNpb24gdG8gMywgcmVmcyBodHRwczovL2dpdGh1Yi5jb20vZWxlY3Ryb24vZWxlY3Ryb24vcHVsbC80NDQyNlxuXHRhcHAuY29tbWFuZExpbmUuYXBwZW5kU3dpdGNoKCd4ZGctcG9ydGFsLXJlcXVpcmVkLXZlcnNpb24nLCAnNCcpO1xuXG5cdC8vIEluY3JlYXNlIHRoZSBtYXhpbXVtIG51bWJlciBvZiBhY3RpdmUgV2ViR0wgY29udGV4dHMgYXMgZWFjaCB0ZXJtaW5hbCBtYXlcblx0Ly8gdXNlIHVwIHRvIDJcblx0YXBwLmNvbW1hbmRMaW5lLmFwcGVuZFN3aXRjaCgnbWF4LWFjdGl2ZS13ZWJnbC1jb250ZXh0cycsICczMicpO1xuXG5cdHJldHVybiBhcmd2Q29uZmlnO1xufVxuXG5pbnRlcmZhY2UgSUFyZ3ZDb25maWcge1xuXHRba2V5OiBzdHJpbmddOiBzdHJpbmcgfCBzdHJpbmdbXSB8IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGxvY2FsZT86IHN0cmluZztcblx0cmVhZG9ubHkgJ2Rpc2FibGUtbGNkLXRleHQnPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgJ3Byb3h5LWJ5cGFzcy1saXN0Jz86IHN0cmluZztcblx0cmVhZG9ubHkgJ2Rpc2FibGUtaGFyZHdhcmUtYWNjZWxlcmF0aW9uJz86IGJvb2xlYW47XG5cdHJlYWRvbmx5ICdmb3JjZS1jb2xvci1wcm9maWxlJz86IHN0cmluZztcblx0cmVhZG9ubHkgJ2VuYWJsZS1jcmFzaC1yZXBvcnRlcic/OiBib29sZWFuO1xuXHRyZWFkb25seSAnY3Jhc2gtcmVwb3J0ZXItaWQnPzogc3RyaW5nO1xuXHRyZWFkb25seSAnZW5hYmxlLXByb3Bvc2VkLWFwaSc/OiBzdHJpbmdbXTtcblx0cmVhZG9ubHkgJ2xvZy1sZXZlbCc/OiBzdHJpbmcgfCBzdHJpbmdbXTtcblx0cmVhZG9ubHkgJ2Rpc2FibGUtY2hyb21pdW0tc2FuZGJveCc/OiBib29sZWFuO1xuXHRyZWFkb25seSAndXNlLWlubWVtb3J5LXNlY3JldHN0b3JhZ2UnPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgJ2VuYWJsZS1yZHAtZGlzcGxheS10cmFja2luZyc/OiBib29sZWFuO1xuXHRyZWFkb25seSAncmVtb3RlLWRlYnVnZ2luZy1wb3J0Jz86IHN0cmluZztcblx0cmVhZG9ubHkgJ2pzLWZsYWdzJz86IHN0cmluZztcbn1cblxuZnVuY3Rpb24gcmVhZEFyZ3ZDb25maWdTeW5jKCk6IElBcmd2Q29uZmlnIHtcblxuXHQvLyBSZWFkIG9yIGNyZWF0ZSB0aGUgYXJndi5qc29uIGNvbmZpZyBmaWxlIHN5bmMgYmVmb3JlIGFwcCgncmVhZHknKVxuXHRjb25zdCBhcmd2Q29uZmlnUGF0aCA9IGdldEFyZ3ZDb25maWdQYXRoKCk7XG5cdGxldCBhcmd2Q29uZmlnOiBJQXJndkNvbmZpZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0dHJ5IHtcblx0XHRhcmd2Q29uZmlnID0gcGFyc2UoZnMucmVhZEZpbGVTeW5jKGFyZ3ZDb25maWdQYXRoKS50b1N0cmluZygpKTtcblx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRpZiAoZXJyb3IgJiYgZXJyb3IuY29kZSA9PT0gJ0VOT0VOVCcpIHtcblx0XHRcdGNyZWF0ZURlZmF1bHRBcmd2Q29uZmlnU3luYyhhcmd2Q29uZmlnUGF0aCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnNvbGUud2FybihgVW5hYmxlIHRvIHJlYWQgYXJndi5qc29uIGNvbmZpZ3VyYXRpb24gZmlsZSBpbiAke2FyZ3ZDb25maWdQYXRofSwgZmFsbGluZyBiYWNrIHRvIGRlZmF1bHRzICgke2Vycm9yfSlgKTtcblx0XHR9XG5cdH1cblxuXHQvLyBGYWxsYmFjayB0byBkZWZhdWx0XG5cdGlmICghYXJndkNvbmZpZykge1xuXHRcdGFyZ3ZDb25maWcgPSB7fTtcblx0fVxuXG5cdHJldHVybiBhcmd2Q29uZmlnO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVEZWZhdWx0QXJndkNvbmZpZ1N5bmMoYXJndkNvbmZpZ1BhdGg6IHN0cmluZyk6IHZvaWQge1xuXHR0cnkge1xuXG5cdFx0Ly8gRW5zdXJlIGFyZ3YgY29uZmlnIHBhcmVudCBleGlzdHNcblx0XHRjb25zdCBhcmd2Q29uZmlnUGF0aERpcm5hbWUgPSBwYXRoLmRpcm5hbWUoYXJndkNvbmZpZ1BhdGgpO1xuXHRcdGlmICghZnMuZXhpc3RzU3luYyhhcmd2Q29uZmlnUGF0aERpcm5hbWUpKSB7XG5cdFx0XHRmcy5ta2RpclN5bmMoYXJndkNvbmZpZ1BhdGhEaXJuYW1lKTtcblx0XHR9XG5cblx0XHQvLyBEZWZhdWx0IGFyZ3YgY29udGVudFxuXHRcdGNvbnN0IGRlZmF1bHRBcmd2Q29uZmlnQ29udGVudCA9IFtcblx0XHRcdCcvLyBUaGlzIGNvbmZpZ3VyYXRpb24gZmlsZSBhbGxvd3MgeW91IHRvIHBhc3MgcGVybWFuZW50IGNvbW1hbmQgbGluZSBhcmd1bWVudHMgdG8gVlMgQ29kZS4nLFxuXHRcdFx0Jy8vIE9ubHkgYSBzdWJzZXQgb2YgYXJndW1lbnRzIGlzIGN1cnJlbnRseSBzdXBwb3J0ZWQgdG8gcmVkdWNlIHRoZSBsaWtlbGlob29kIG9mIGJyZWFraW5nJyxcblx0XHRcdCcvLyB0aGUgaW5zdGFsbGF0aW9uLicsXG5cdFx0XHQnLy8nLFxuXHRcdFx0Jy8vIFBMRUFTRSBETyBOT1QgQ0hBTkdFIFdJVEhPVVQgVU5ERVJTVEFORElORyBUSEUgSU1QQUNUJyxcblx0XHRcdCcvLycsXG5cdFx0XHQnLy8gTk9URTogQ2hhbmdpbmcgdGhpcyBmaWxlIHJlcXVpcmVzIGEgcmVzdGFydCBvZiBWUyBDb2RlLicsXG5cdFx0XHQneycsXG5cdFx0XHQnXHQvLyBVc2Ugc29mdHdhcmUgcmVuZGVyaW5nIGluc3RlYWQgb2YgaGFyZHdhcmUgYWNjZWxlcmF0ZWQgcmVuZGVyaW5nLicsXG5cdFx0XHQnXHQvLyBUaGlzIGNhbiBoZWxwIGluIGNhc2VzIHdoZXJlIHlvdSBzZWUgcmVuZGVyaW5nIGlzc3VlcyBpbiBWUyBDb2RlLicsXG5cdFx0XHQnXHQvLyBcImRpc2FibGUtaGFyZHdhcmUtYWNjZWxlcmF0aW9uXCI6IHRydWUnLFxuXHRcdFx0J30nXG5cdFx0XTtcblxuXHRcdC8vIENyZWF0ZSBpbml0aWFsIGFyZ3YuanNvbiB3aXRoIGRlZmF1bHQgY29udGVudFxuXHRcdGZzLndyaXRlRmlsZVN5bmMoYXJndkNvbmZpZ1BhdGgsIGRlZmF1bHRBcmd2Q29uZmlnQ29udGVudC5qb2luKCdcXG4nKSk7XG5cdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0Y29uc29sZS5lcnJvcihgVW5hYmxlIHRvIGNyZWF0ZSBhcmd2Lmpzb24gY29uZmlndXJhdGlvbiBmaWxlIGluICR7YXJndkNvbmZpZ1BhdGh9LCBmYWxsaW5nIGJhY2sgdG8gZGVmYXVsdHMgKCR7ZXJyb3J9KWApO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldEFyZ3ZDb25maWdQYXRoKCk6IHN0cmluZyB7XG5cdGNvbnN0IHZzY29kZVBvcnRhYmxlID0gcHJvY2Vzcy5lbnZbJ1ZTQ09ERV9QT1JUQUJMRSddO1xuXHRpZiAodnNjb2RlUG9ydGFibGUpIHtcblx0XHRyZXR1cm4gcGF0aC5qb2luKHZzY29kZVBvcnRhYmxlLCAnYXJndi5qc29uJyk7XG5cdH1cblxuXHRsZXQgZGF0YUZvbGRlck5hbWUgPSBwcm9kdWN0LmRhdGFGb2xkZXJOYW1lO1xuXHRpZiAocHJvY2Vzcy5lbnZbJ1ZTQ09ERV9ERVYnXSkge1xuXHRcdGRhdGFGb2xkZXJOYW1lID0gYCR7ZGF0YUZvbGRlck5hbWV9LWRldmA7XG5cdH1cblxuXHRyZXR1cm4gcGF0aC5qb2luKG9zLmhvbWVkaXIoKSwgZGF0YUZvbGRlck5hbWUhLCAnYXJndi5qc29uJyk7XG59XG5cbmZ1bmN0aW9uIGNvbmZpZ3VyZUNyYXNoUmVwb3J0ZXIoKTogdm9pZCB7XG5cdGxldCBjcmFzaFJlcG9ydGVyRGlyZWN0b3J5ID0gYXJnc1snY3Jhc2gtcmVwb3J0ZXItZGlyZWN0b3J5J107XG5cdGxldCBzdWJtaXRVUkwgPSAnJztcblx0aWYgKGNyYXNoUmVwb3J0ZXJEaXJlY3RvcnkpIHtcblx0XHRjcmFzaFJlcG9ydGVyRGlyZWN0b3J5ID0gcGF0aC5ub3JtYWxpemUoY3Jhc2hSZXBvcnRlckRpcmVjdG9yeSk7XG5cblx0XHRpZiAoIXBhdGguaXNBYnNvbHV0ZShjcmFzaFJlcG9ydGVyRGlyZWN0b3J5KSkge1xuXHRcdFx0Y29uc29sZS5lcnJvcihgVGhlIHBhdGggJyR7Y3Jhc2hSZXBvcnRlckRpcmVjdG9yeX0nIHNwZWNpZmllZCBmb3IgLS1jcmFzaC1yZXBvcnRlci1kaXJlY3RvcnkgbXVzdCBiZSBhYnNvbHV0ZS5gKTtcblx0XHRcdGFwcC5leGl0KDEpO1xuXHRcdH1cblxuXHRcdGlmICghZnMuZXhpc3RzU3luYyhjcmFzaFJlcG9ydGVyRGlyZWN0b3J5KSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0ZnMubWtkaXJTeW5jKGNyYXNoUmVwb3J0ZXJEaXJlY3RvcnksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0Y29uc29sZS5lcnJvcihgVGhlIHBhdGggJyR7Y3Jhc2hSZXBvcnRlckRpcmVjdG9yeX0nIHNwZWNpZmllZCBmb3IgLS1jcmFzaC1yZXBvcnRlci1kaXJlY3RvcnkgZG9lcyBub3Qgc2VlbSB0byBleGlzdCBvciBjYW5ub3QgYmUgY3JlYXRlZC5gKTtcblx0XHRcdFx0YXBwLmV4aXQoMSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ3Jhc2hlcyBhcmUgc3RvcmVkIGluIHRoZSBjcmFzaER1bXBzIGRpcmVjdG9yeSBieSBkZWZhdWx0LCBzbyB3ZVxuXHRcdC8vIG5lZWQgdG8gY2hhbmdlIHRoYXQgZGlyZWN0b3J5IHRvIHRoZSBwcm92aWRlZCBvbmVcblx0XHRjb25zb2xlLmxvZyhgRm91bmQgLS1jcmFzaC1yZXBvcnRlci1kaXJlY3RvcnkgYXJndW1lbnQuIFNldHRpbmcgY3Jhc2hEdW1wcyBkaXJlY3RvcnkgdG8gYmUgJyR7Y3Jhc2hSZXBvcnRlckRpcmVjdG9yeX0nYCk7XG5cdFx0YXBwLnNldFBhdGgoJ2NyYXNoRHVtcHMnLCBjcmFzaFJlcG9ydGVyRGlyZWN0b3J5KTtcblx0fVxuXG5cdC8vIE90aGVyd2lzZSB3ZSBjb25maWd1cmUgdGhlIGNyYXNoIHJlcG9ydGVyIGZyb20gcHJvZHVjdC5qc29uXG5cdGVsc2Uge1xuXHRcdGNvbnN0IGFwcENlbnRlciA9IHByb2R1Y3QuYXBwQ2VudGVyO1xuXHRcdGlmIChhcHBDZW50ZXIpIHtcblx0XHRcdGNvbnN0IGlzV2luZG93cyA9IChwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInKTtcblx0XHRcdGNvbnN0IGlzTGludXggPSAocHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ2xpbnV4Jyk7XG5cdFx0XHRjb25zdCBpc0RhcndpbiA9IChwcm9jZXNzLnBsYXRmb3JtID09PSAnZGFyd2luJyk7XG5cdFx0XHRjb25zdCBjcmFzaFJlcG9ydGVySWQgPSBhcmd2Q29uZmlnWydjcmFzaC1yZXBvcnRlci1pZCddO1xuXHRcdFx0Y29uc3QgdXVpZFBhdHRlcm4gPSAvXlswLTlhLWZdezh9LVswLTlhLWZdezR9LVswLTlhLWZdezR9LVswLTlhLWZdezR9LVswLTlhLWZdezEyfSQvaTtcblx0XHRcdGlmIChjcmFzaFJlcG9ydGVySWQgJiYgdXVpZFBhdHRlcm4udGVzdChjcmFzaFJlcG9ydGVySWQpKSB7XG5cdFx0XHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdFx0XHRzd2l0Y2ggKHByb2Nlc3MuYXJjaCkge1xuXHRcdFx0XHRcdFx0Y2FzZSAneDY0Jzpcblx0XHRcdFx0XHRcdFx0c3VibWl0VVJMID0gYXBwQ2VudGVyWyd3aW4zMi14NjQnXTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRjYXNlICdhcm02NCc6XG5cdFx0XHRcdFx0XHRcdHN1Ym1pdFVSTCA9IGFwcENlbnRlclsnd2luMzItYXJtNjQnXTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKGlzRGFyd2luKSB7XG5cdFx0XHRcdFx0aWYgKHByb2R1Y3QuZGFyd2luVW5pdmVyc2FsQXNzZXRJZCkge1xuXHRcdFx0XHRcdFx0c3VibWl0VVJMID0gYXBwQ2VudGVyWydkYXJ3aW4tdW5pdmVyc2FsJ107XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHN3aXRjaCAocHJvY2Vzcy5hcmNoKSB7XG5cdFx0XHRcdFx0XHRcdGNhc2UgJ3g2NCc6XG5cdFx0XHRcdFx0XHRcdFx0c3VibWl0VVJMID0gYXBwQ2VudGVyWydkYXJ3aW4nXTtcblx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0Y2FzZSAnYXJtNjQnOlxuXHRcdFx0XHRcdFx0XHRcdHN1Ym1pdFVSTCA9IGFwcENlbnRlclsnZGFyd2luLWFybTY0J107XG5cdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKGlzTGludXgpIHtcblx0XHRcdFx0XHRzdWJtaXRVUkwgPSBhcHBDZW50ZXJbJ2xpbnV4LXg2NCddO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHN1Ym1pdFVSTCA9IHN1Ym1pdFVSTC5jb25jYXQoJyZ1aWQ9JywgY3Jhc2hSZXBvcnRlcklkLCAnJmlpZD0nLCBjcmFzaFJlcG9ydGVySWQsICcmc2lkPScsIGNyYXNoUmVwb3J0ZXJJZCk7XG5cdFx0XHRcdC8vIFNlbmQgdGhlIGlkIGZvciBjaGlsZCBub2RlIHByb2Nlc3MgdGhhdCBhcmUgZXhwbGljaXRseSBzdGFydGluZyBjcmFzaCByZXBvcnRlci5cblx0XHRcdFx0Ly8gRm9yIHZzY29kZSB0aGlzIGlzIEV4dGVuc2lvbkhvc3QgcHJvY2VzcyBjdXJyZW50bHkuXG5cdFx0XHRcdGNvbnN0IGFyZ3YgPSBwcm9jZXNzLmFyZ3Y7XG5cdFx0XHRcdGNvbnN0IGVuZE9mQXJnc01hcmtlckluZGV4ID0gYXJndi5pbmRleE9mKCctLScpO1xuXHRcdFx0XHRpZiAoZW5kT2ZBcmdzTWFya2VySW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdFx0YXJndi5wdXNoKCctLWNyYXNoLXJlcG9ydGVyLWlkJywgY3Jhc2hSZXBvcnRlcklkKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBpZiB0aGUgd2UgaGF2ZSBhbiBhcmd1bWVudCBcIi0tXCIgKGVuZCBvZiBhcmd1bWVudCBtYXJrZXIpXG5cdFx0XHRcdFx0Ly8gd2UgY2Fubm90IGFkZCBhcmd1bWVudHMgYXQgdGhlIGVuZC4gcmF0aGVyLCB3ZSBhZGRcblx0XHRcdFx0XHQvLyBhcmd1bWVudHMgYmVmb3JlIHRoZSBcIi0tXCIgbWFya2VyLlxuXHRcdFx0XHRcdGFyZ3Yuc3BsaWNlKGVuZE9mQXJnc01hcmtlckluZGV4LCAwLCAnLS1jcmFzaC1yZXBvcnRlci1pZCcsIGNyYXNoUmVwb3J0ZXJJZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyBTdGFydCBjcmFzaCByZXBvcnRlciBmb3IgYWxsIHByb2Nlc3Nlc1xuXHRjb25zdCBwcm9kdWN0TmFtZSA9IChwcm9kdWN0LmNyYXNoUmVwb3J0ZXIgPyBwcm9kdWN0LmNyYXNoUmVwb3J0ZXIucHJvZHVjdE5hbWUgOiB1bmRlZmluZWQpIHx8IHByb2R1Y3QubmFtZVNob3J0O1xuXHRjb25zdCBjb21wYW55TmFtZSA9IChwcm9kdWN0LmNyYXNoUmVwb3J0ZXIgPyBwcm9kdWN0LmNyYXNoUmVwb3J0ZXIuY29tcGFueU5hbWUgOiB1bmRlZmluZWQpIHx8ICdNaWNyb3NvZnQnO1xuXHRjb25zdCB1cGxvYWRUb1NlcnZlciA9IEJvb2xlYW4oIXByb2Nlc3MuZW52WydWU0NPREVfREVWJ10gJiYgc3VibWl0VVJMICYmICFjcmFzaFJlcG9ydGVyRGlyZWN0b3J5KTtcblx0Y3Jhc2hSZXBvcnRlci5zdGFydCh7XG5cdFx0Y29tcGFueU5hbWUsXG5cdFx0cHJvZHVjdE5hbWU6IHByb2Nlc3MuZW52WydWU0NPREVfREVWJ10gPyBgJHtwcm9kdWN0TmFtZX0gRGV2YCA6IHByb2R1Y3ROYW1lLFxuXHRcdHN1Ym1pdFVSTCxcblx0XHR1cGxvYWRUb1NlcnZlcixcblx0XHRjb21wcmVzczogdHJ1ZSxcblx0XHRpZ25vcmVTeXN0ZW1DcmFzaEhhbmRsZXI6IHRydWVcblx0fSk7XG59XG5cbmZ1bmN0aW9uIGdldEpTRmxhZ3MoY2xpQXJnczogTmF0aXZlUGFyc2VkQXJncywgYXJndkNvbmZpZzogSUFyZ3ZDb25maWcpOiBzdHJpbmcgfCBudWxsIHtcblx0Y29uc3QganNGbGFnczogc3RyaW5nW10gPSBbXTtcblxuXHQvLyBBZGQgYW55IGV4aXN0aW5nIEpTIGZsYWdzIHdlIGFscmVhZHkgZ290IGZyb20gdGhlIGNvbW1hbmQgbGluZVxuXHRpZiAoY2xpQXJnc1snanMtZmxhZ3MnXSkge1xuXHRcdGpzRmxhZ3MucHVzaChjbGlBcmdzWydqcy1mbGFncyddKTtcblx0fVxuXG5cdC8vIEFkZCBKUyBmbGFncyBmcm9tIHJ1bnRpbWUgYXJndW1lbnRzIChhcmd2Lmpzb24pXG5cdGlmICh0eXBlb2YgYXJndkNvbmZpZ1snanMtZmxhZ3MnXSA9PT0gJ3N0cmluZycgJiYgYXJndkNvbmZpZ1snanMtZmxhZ3MnXSkge1xuXHRcdGpzRmxhZ3MucHVzaChhcmd2Q29uZmlnWydqcy1mbGFncyddKTtcblx0fVxuXG5cdHJldHVybiBqc0ZsYWdzLmxlbmd0aCA+IDAgPyBqc0ZsYWdzLmpvaW4oJyAnKSA6IG51bGw7XG59XG5cbmZ1bmN0aW9uIHBhcnNlQ0xJQXJncygpOiBOYXRpdmVQYXJzZWRBcmdzIHtcblx0cmV0dXJuIG1pbmltaXN0KHByb2Nlc3MuYXJndiwge1xuXHRcdHN0cmluZzogW1xuXHRcdFx0J3VzZXItZGF0YS1kaXInLFxuXHRcdFx0J2xvY2FsZScsXG5cdFx0XHQnanMtZmxhZ3MnLFxuXHRcdFx0J2NyYXNoLXJlcG9ydGVyLWRpcmVjdG9yeSdcblx0XHRdLFxuXHRcdGJvb2xlYW46IFtcblx0XHRcdCdkaXNhYmxlLWNocm9taXVtLXNhbmRib3gnLFxuXHRcdF0sXG5cdFx0ZGVmYXVsdDoge1xuXHRcdFx0J3NhbmRib3gnOiB0cnVlXG5cdFx0fSxcblx0XHRhbGlhczoge1xuXHRcdFx0J25vLXNhbmRib3gnOiAnc2FuZGJveCdcblx0XHR9XG5cdH0pO1xufVxuXG5mdW5jdGlvbiByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblxuXHQvKipcblx0ICogbWFjT1M6IHdoZW4gc29tZW9uZSBkcm9wcyBhIGZpbGUgdG8gdGhlIG5vdC15ZXQgcnVubmluZyBWU0NvZGUsIHRoZSBvcGVuLWZpbGUgZXZlbnQgZmlyZXMgZXZlbiBiZWZvcmVcblx0ICogdGhlIGFwcC1yZWFkeSBldmVudC4gV2UgbGlzdGVuIHZlcnkgZWFybHkgZm9yIG9wZW4tZmlsZSBhbmQgcmVtZW1iZXIgdGhpcyB1cG9uIHN0YXJ0dXAgYXMgcGF0aCB0byBvcGVuLlxuXHQgKi9cblx0Y29uc3QgbWFjT3BlbkZpbGVzOiBzdHJpbmdbXSA9IFtdO1xuXHQoZ2xvYmFsVGhpcyBhcyB7IG1hY09wZW5GaWxlcz86IHN0cmluZ1tdIH0pLm1hY09wZW5GaWxlcyA9IG1hY09wZW5GaWxlcztcblx0YXBwLm9uKCdvcGVuLWZpbGUnLCBmdW5jdGlvbiAoZXZlbnQsIHBhdGgpIHtcblx0XHRtYWNPcGVuRmlsZXMucHVzaChwYXRoKTtcblx0fSk7XG5cblx0LyoqXG5cdCAqIG1hY09TOiByZWFjdCB0byBvcGVuLXVybCByZXF1ZXN0cy5cblx0ICovXG5cdGNvbnN0IG9wZW5VcmxzOiBzdHJpbmdbXSA9IFtdO1xuXHRjb25zdCBvbk9wZW5VcmwgPVxuXHRcdGZ1bmN0aW9uIChldmVudDogeyBwcmV2ZW50RGVmYXVsdDogKCkgPT4gdm9pZCB9LCB1cmw6IHN0cmluZykge1xuXHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblxuXHRcdFx0b3BlblVybHMucHVzaCh1cmwpO1xuXHRcdH07XG5cblx0YXBwLm9uKCd3aWxsLWZpbmlzaC1sYXVuY2hpbmcnLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXBwLm9uKCdvcGVuLXVybCcsIG9uT3BlblVybCk7XG5cdH0pO1xuXG5cdChnbG9iYWxUaGlzIGFzIHsgZ2V0T3BlblVybHM/OiAoKSA9PiBzdHJpbmdbXSB9KS5nZXRPcGVuVXJscyA9IGZ1bmN0aW9uICgpIHtcblx0XHRhcHAucmVtb3ZlTGlzdGVuZXIoJ29wZW4tdXJsJywgb25PcGVuVXJsKTtcblxuXHRcdHJldHVybiBvcGVuVXJscztcblx0fTtcbn1cblxuZnVuY3Rpb24gZ2V0Q29kZUNhY2hlUGF0aCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXG5cdC8vIGV4cGxpY2l0bHkgZGlzYWJsZWQgdmlhIENMSSBhcmdzXG5cdGlmIChwcm9jZXNzLmFyZ3YuaW5kZXhPZignLS1uby1jYWNoZWQtZGF0YScpID4gMCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvLyBydW5uaW5nIG91dCBvZiBzb3VyY2VzXG5cdGlmIChwcm9jZXNzLmVudlsnVlNDT0RFX0RFViddKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8vIHJlcXVpcmUgY29tbWl0IGlkXG5cdGNvbnN0IGNvbW1pdCA9IHByb2R1Y3QuY29tbWl0O1xuXHRpZiAoIWNvbW1pdCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRyZXR1cm4gcGF0aC5qb2luKHVzZXJEYXRhUGF0aCwgJ0NhY2hlZERhdGEnLCBjb21taXQpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBta2RpcnBJZ25vcmVFcnJvcihkaXI6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdGlmICh0eXBlb2YgZGlyID09PSAnc3RyaW5nJykge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBmcy5wcm9taXNlcy5ta2RpcihkaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXG5cdFx0XHRyZXR1cm4gZGlyO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHQvLyBpZ25vcmVcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG4vLyNyZWdpb24gTkxTIFN1cHBvcnRcblxuZnVuY3Rpb24gcHJvY2Vzc1poTG9jYWxlKGFwcExvY2FsZTogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKGFwcExvY2FsZS5zdGFydHNXaXRoKCd6aCcpKSB7XG5cdFx0Y29uc3QgcmVnaW9uID0gYXBwTG9jYWxlLnNwbGl0KCctJylbMV07XG5cblx0XHQvLyBPbiBXaW5kb3dzIGFuZCBtYWNPUywgQ2hpbmVzZSBsYW5ndWFnZXMgcmV0dXJuZWQgYnlcblx0XHQvLyBhcHAuZ2V0UHJlZmVycmVkU3lzdGVtTGFuZ3VhZ2VzKCkgc3RhcnQgd2l0aCB6aC1oYW5zXG5cdFx0Ly8gZm9yIFNpbXBsaWZpZWQgQ2hpbmVzZSBvciB6aC1oYW50IGZvciBUcmFkaXRpb25hbCBDaGluZXNlLFxuXHRcdC8vIHNvIHdlIGNhbiBlYXNpbHkgZGV0ZXJtaW5lIHdoZXRoZXIgdG8gdXNlIFNpbXBsaWZpZWQgb3IgVHJhZGl0aW9uYWwuXG5cdFx0Ly8gSG93ZXZlciwgb24gTGludXgsIENoaW5lc2UgbGFuZ3VhZ2VzIHJldHVybmVkIGJ5IHRoYXQgc2FtZSBBUElcblx0XHQvLyBhcmUgb2YgdGhlIGZvcm0gemgtWFksIHdoZXJlIFhZIGlzIGEgY291bnRyeSBjb2RlLlxuXHRcdC8vIEZvciBDaGluYSAoQ04pLCBTaW5nYXBvcmUgKFNHKSwgYW5kIE1hbGF5c2lhIChNWSlcblx0XHQvLyBjb3VudHJ5IGNvZGVzLCBhc3N1bWUgdGhleSB1c2UgU2ltcGxpZmllZCBDaGluZXNlLlxuXHRcdC8vIEZvciBvdGhlciBjYXNlcywgYXNzdW1lIHRoZXkgdXNlIFRyYWRpdGlvbmFsLlxuXHRcdGlmIChbJ2hhbnMnLCAnY24nLCAnc2cnLCAnbXknXS5pbmNsdWRlcyhyZWdpb24pKSB7XG5cdFx0XHRyZXR1cm4gJ3poLWNuJztcblx0XHR9XG5cblx0XHRyZXR1cm4gJ3poLXR3Jztcblx0fVxuXG5cdHJldHVybiBhcHBMb2NhbGU7XG59XG5cbi8qKlxuICogUmVzb2x2ZSB0aGUgTkxTIGNvbmZpZ3VyYXRpb25cbiAqL1xuYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZU5sc0NvbmZpZ3VyYXRpb24oKTogUHJvbWlzZTxJTkxTQ29uZmlndXJhdGlvbj4ge1xuXG5cdC8vIEZpcnN0LCB3ZSBuZWVkIHRvIHRlc3QgYSB1c2VyIGRlZmluZWQgbG9jYWxlLlxuXHQvLyBJZiBpdCBmYWlscyB3ZSB0cnkgdGhlIGFwcCBsb2NhbGUuXG5cdC8vIElmIHRoYXQgZmFpbHMgd2UgZmFsbCBiYWNrIHRvIEVuZ2xpc2guXG5cblx0Y29uc3QgbmxzQ29uZmlndXJhdGlvbiA9IG5sc0NvbmZpZ3VyYXRpb25Qcm9taXNlID8gYXdhaXQgbmxzQ29uZmlndXJhdGlvblByb21pc2UgOiB1bmRlZmluZWQ7XG5cdGlmIChubHNDb25maWd1cmF0aW9uKSB7XG5cdFx0cmV0dXJuIG5sc0NvbmZpZ3VyYXRpb247XG5cdH1cblxuXHQvLyBUcnkgdG8gdXNlIHRoZSBhcHAgbG9jYWxlIHdoaWNoIGlzIG9ubHkgdmFsaWRcblx0Ly8gYWZ0ZXIgdGhlIGFwcCByZWFkeSBldmVudCBoYXMgYmVlbiBmaXJlZC5cblxuXHRsZXQgdXNlckxvY2FsZSA9IGFwcC5nZXRMb2NhbGUoKTtcblx0aWYgKCF1c2VyTG9jYWxlKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHVzZXJMb2NhbGU6ICdlbicsXG5cdFx0XHRvc0xvY2FsZSxcblx0XHRcdHJlc29sdmVkTGFuZ3VhZ2U6ICdlbicsXG5cdFx0XHRkZWZhdWx0TWVzc2FnZXNGaWxlOiBwYXRoLmpvaW4oaW1wb3J0Lm1ldGEuZGlybmFtZSwgJ25scy5tZXNzYWdlcy5qc29uJyksXG5cblx0XHRcdC8vIE5MUzogYmVsb3cgMiBhcmUgYSByZWxpYyBmcm9tIG9sZCB0aW1lcyBvbmx5IHVzZWQgYnkgdnNjb2RlLW5scyBhbmQgZGVwcmVjYXRlZFxuXHRcdFx0bG9jYWxlOiAnZW4nLFxuXHRcdFx0YXZhaWxhYmxlTGFuZ3VhZ2VzOiB7fVxuXHRcdH07XG5cdH1cblxuXHQvLyBTZWUgYWJvdmUgdGhlIGNvbW1lbnQgYWJvdXQgdGhlIGxvYWRlciBhbmQgY2FzZSBzZW5zaXRpdmVuZXNzXG5cdHVzZXJMb2NhbGUgPSBwcm9jZXNzWmhMb2NhbGUodXNlckxvY2FsZS50b0xvd2VyQ2FzZSgpKTtcblxuXHRyZXR1cm4gcmVzb2x2ZU5MU0NvbmZpZ3VyYXRpb24oe1xuXHRcdHVzZXJMb2NhbGUsXG5cdFx0b3NMb2NhbGUsXG5cdFx0Y29tbWl0OiBwcm9kdWN0LmNvbW1pdCxcblx0XHR1c2VyRGF0YVBhdGgsXG5cdFx0bmxzTWV0YWRhdGFQYXRoOiBpbXBvcnQubWV0YS5kaXJuYW1lXG5cdH0pO1xufVxuXG4vKipcbiAqIExhbmd1YWdlIHRhZ3MgYXJlIGNhc2UgaW5zZW5zaXRpdmUgaG93ZXZlciBhbiBFU00gbG9hZGVyIGlzIGNhc2Ugc2Vuc2l0aXZlXG4gKiBUbyBtYWtlIHRoaXMgd29yayBvbiBjYXNlIHByZXNlcnZpbmcgJiBpbnNlbnNpdGl2ZSBGUyB3ZSBkbyB0aGUgZm9sbG93aW5nOlxuICogdGhlIGxhbmd1YWdlIGJ1bmRsZXMgaGF2ZSBsb3dlciBjYXNlIGxhbmd1YWdlIHRhZ3MgYW5kIHdlIGFsd2F5cyBsb3dlciBjYXNlXG4gKiB0aGUgbG9jYWxlIHdlIHJlY2VpdmUgZnJvbSB0aGUgdXNlciBvciBPUy5cbiAqL1xuZnVuY3Rpb24gZ2V0VXNlckRlZmluZWRMb2NhbGUoYXJndkNvbmZpZzogSUFyZ3ZDb25maWcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCBsb2NhbGUgPSBhcmdzWydsb2NhbGUnXTtcblx0aWYgKGxvY2FsZSkge1xuXHRcdHJldHVybiBsb2NhbGUudG9Mb3dlckNhc2UoKTsgLy8gYSBkaXJlY3RseSBwcm92aWRlZCAtLWxvY2FsZSBhbHdheXMgd2luc1xuXHR9XG5cblx0cmV0dXJuIHR5cGVvZiBhcmd2Q29uZmlnPy5sb2NhbGUgPT09ICdzdHJpbmcnID8gYXJndkNvbmZpZy5sb2NhbGUudG9Mb3dlckNhc2UoKSA6IHVuZGVmaW5lZDtcbn1cblxuLy8jZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFVBQVU7QUFDdEIsWUFBWSxRQUFRO0FBQ3BCLFlBQVksUUFBUTtBQUNwQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLEtBQUssVUFBVSxlQUFlLE1BQU0sc0JBQXNCO0FBQ25FLE9BQU8sY0FBYztBQUNyQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsdUJBQXVCO0FBQ2hDLFlBQVksVUFBVTtBQUN0QixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLFlBQVksNkJBQTZCO0FBSWxELEtBQUssS0FBSyxtQkFBbUI7QUFFN0IsS0FBSyxLQUFLLDJCQUEyQjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBSXBDLFdBQVcsS0FBSyxNQUFNLFlBQVksVUFBVTtBQUM3QyxDQUFDO0FBQ0QsS0FBSyxLQUFLLHdCQUF3QjtBQUdsQyxNQUFNLFdBQVcsa0JBQWtCLE9BQU87QUFFMUMsTUFBTSxPQUFPLGFBQWE7QUFFMUIsTUFBTSxhQUFhLGlDQUFpQyxJQUFJO0FBS3hELElBQUksS0FBSyxTQUFTLEtBQ2pCLENBQUMsS0FBSywwQkFBMEIsS0FDaEMsQ0FBQyxXQUFXLDBCQUEwQixHQUFHO0FBQ3pDLE1BQUksY0FBYztBQUNuQixXQUFXLElBQUksWUFBWSxVQUFVLFlBQVksS0FDaEQsQ0FBQyxJQUFJLFlBQVksVUFBVSxxQkFBcUIsR0FBRztBQUVuRCxNQUFJLFlBQVksYUFBYSxxQkFBcUI7QUFDbkQsT0FBTztBQUNOLE1BQUksWUFBWSxhQUFhLFlBQVk7QUFDekMsTUFBSSxZQUFZLGFBQWEscUJBQXFCO0FBQ25EO0FBR0EsTUFBTSxlQUFlLGdCQUFnQixNQUFNLFFBQVEsYUFBYSxjQUFjO0FBQzlFLElBQUksUUFBUSxhQUFhLFNBQVM7QUFDakMsUUFBTSxrQkFBa0IsV0FBVyxZQUFZO0FBQy9DLE1BQUksaUJBQWlCO0FBQ3BCLDBCQUFzQixlQUFlO0FBQUEsRUFDdEM7QUFDRDtBQUNBLElBQUksUUFBUSxZQUFZLFlBQVk7QUFHcEMsTUFBTSxnQkFBZ0IsaUJBQWlCO0FBR3ZDLEtBQUssbUJBQW1CLElBQUk7QUFHNUIsS0FBSyxLQUFLLDZCQUE2QjtBQVN2QyxJQUFJLEtBQUssMEJBQTBCLEtBQU0sV0FBVyx1QkFBdUIsS0FBSyxDQUFDLEtBQUssd0JBQXdCLEdBQUk7QUFDakgseUJBQXVCO0FBQ3hCO0FBQ0EsS0FBSyxLQUFLLDRCQUE0QjtBQU10QyxJQUFJLFNBQVMsWUFBWTtBQUN4QixNQUFJLGVBQWUsS0FBSyxLQUFLLGNBQWMsTUFBTSxDQUFDO0FBQ25EO0FBR0EsU0FBUyw0QkFBNEI7QUFBQSxFQUNwQztBQUFBLElBQ0MsUUFBUTtBQUFBLElBQ1IsWUFBWSxFQUFFLFVBQVUsTUFBTSxRQUFRLE1BQU0saUJBQWlCLE1BQU0sYUFBYSxNQUFNLHFCQUFxQixNQUFNLFdBQVcsS0FBSztBQUFBLEVBQ2xJO0FBQUEsRUFDQTtBQUFBLElBQ0MsUUFBUTtBQUFBLElBQ1IsWUFBWSxFQUFFLFFBQVEsTUFBTSxVQUFVLE1BQU0saUJBQWlCLE1BQU0sYUFBYSxNQUFNLFdBQVcsS0FBSztBQUFBLEVBQ3ZHO0FBQUEsRUFDQTtBQUFBLElBQ0MsUUFBUTtBQUFBLElBQ1IsWUFBWSxFQUFFLFFBQVEsTUFBTSxpQkFBaUIsTUFBTSxhQUFhLEtBQUs7QUFBQSxFQUN0RTtBQUFBLEVBQ0E7QUFBQSxJQUNDLFFBQVE7QUFBQSxJQUNSLFlBQVksRUFBRSxRQUFRLE1BQU0saUJBQWlCLE1BQU0sYUFBYSxLQUFLO0FBQUEsRUFDdEU7QUFDRCxDQUFDO0FBR0Qsa0JBQWtCO0FBT2xCLElBQUksMEJBQWtFO0FBTXRFLE1BQU0sV0FBVyxpQkFBaUIsSUFBSSw0QkFBNEIsSUFBSSxDQUFDLEtBQUssTUFBTSxZQUFZLENBQUM7QUFDL0YsTUFBTSxhQUFhLHFCQUFxQixVQUFVO0FBQ2xELElBQUksWUFBWTtBQUNmLDRCQUEwQix3QkFBd0I7QUFBQSxJQUNqRDtBQUFBLElBQ0E7QUFBQSxJQUNBLFFBQVEsUUFBUTtBQUFBLElBQ2hCO0FBQUEsSUFDQSxpQkFBaUIsWUFBWTtBQUFBLEVBQzlCLENBQUM7QUFDRjtBQVVBLElBQUksUUFBUSxhQUFhLFdBQVcsUUFBUSxhQUFhLFNBQVM7QUFDakUsUUFBTSxpQkFBa0IsQ0FBQyxjQUFjLGVBQWUsYUFBYyxPQUFPO0FBQzNFLE1BQUksWUFBWSxhQUFhLFFBQVEsY0FBYztBQUNwRDtBQUdBLElBQUksS0FBSyxTQUFTLFdBQVk7QUFDN0IsTUFBSSxLQUFLLE9BQU8sR0FBRztBQUNsQixRQUFJO0FBQ0osUUFBSSxLQUFLLG9CQUFvQixHQUFHO0FBQy9CLFlBQU0sbUJBQW1CLEtBQUssdUJBQXVCLEdBQUcsTUFBTSxHQUFHLEtBQUssQ0FBQztBQUN2RSx1QkFBaUIsS0FBSyxvQ0FBb0MsZ0RBQWdEO0FBQzFHLHFCQUFlO0FBQUEsUUFDZCxxQkFBcUI7QUFBQSxRQUNyQixxQkFBcUIsQ0FBQyxHQUFHO0FBQUEsUUFDekIsb0JBQW9CO0FBQUEsVUFDbkIsb0JBQW9CLENBQUMsU0FBUyxVQUFVO0FBQUEsVUFDeEMsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxjQUNDLE1BQU07QUFBQSxjQUNOLE1BQU07QUFBQSxjQUNOLDJCQUEyQjtBQUFBLFlBQzVCO0FBQUEsWUFDQTtBQUFBLGNBQ0MsTUFBTTtBQUFBLGNBQ04sTUFBTTtBQUFBLGNBQ04sMkJBQTJCO0FBQUEsWUFDNUI7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELE9BQU87QUFDTixxQkFBZTtBQUFBLFFBQ2QsZ0JBQWdCLEtBQUssdUJBQXVCLEtBQUs7QUFBQSxRQUNqRCxjQUFjLEtBQUssZUFBZSxLQUFLO0FBQUEsTUFDeEM7QUFBQSxJQUNEO0FBRUEsbUJBQWUsZUFBZSxZQUFZLEVBQUUsUUFBUSxNQUFNLFFBQVEsQ0FBQztBQUFBLEVBQ3BFLE9BQU87QUFDTixZQUFRO0FBQUEsRUFDVDtBQUNELENBQUM7QUFFRCxlQUFlLFVBQVU7QUFDeEIsT0FBSyxLQUFLLG1CQUFtQjtBQUU3QixNQUFJO0FBQ0gsVUFBTSxDQUFDLEVBQUUsU0FBUyxJQUFJLE1BQU0sUUFBUSxJQUFJO0FBQUEsTUFDdkMsa0JBQWtCLGFBQWE7QUFBQSxNQUMvQix3QkFBd0I7QUFBQSxJQUN6QixDQUFDO0FBRUQsVUFBTSxRQUFRLGVBQWUsU0FBUztBQUFBLEVBQ3ZDLFNBQVMsT0FBTztBQUNmLFlBQVEsTUFBTSxLQUFLO0FBQUEsRUFDcEI7QUFDRDtBQUtBLGVBQWUsUUFBUUEsZ0JBQW1DLFdBQTZDO0FBQ3RHLFVBQVEsSUFBSSxtQkFBbUIsSUFBSSxLQUFLLFVBQVUsU0FBUztBQUMzRCxVQUFRLElBQUksd0JBQXdCLElBQUlBLGtCQUFpQjtBQUd6RCxRQUFNLGFBQWE7QUFHbkIsUUFBTSxPQUFPLGlDQUFpQztBQUM5QyxPQUFLLEtBQUssdUJBQXVCO0FBQ2xDO0FBRUEsU0FBUyxpQ0FBaUMsU0FBMkI7QUFDcEUsUUFBTSw4QkFBOEI7QUFBQTtBQUFBLElBR25DO0FBQUE7QUFBQSxJQUdBO0FBQUE7QUFBQSxJQUdBO0FBQUE7QUFBQSxJQUdBO0FBQUEsSUFFQTtBQUFBLEVBQ0Q7QUFFQSxNQUFJLFFBQVEsYUFBYSxTQUFTO0FBR2pDLGdDQUE0QixLQUFLLDhCQUE4QjtBQUcvRCxnQ0FBNEIsS0FBSyxnQkFBZ0I7QUFBQSxFQUNsRDtBQUVBLFFBQU0sa0NBQWtDO0FBQUE7QUFBQSxJQUd2QztBQUFBO0FBQUEsSUFHQTtBQUFBO0FBQUEsSUFHQTtBQUFBO0FBQUEsSUFHQTtBQUFBLEVBQ0Q7QUFHQSxRQUFNQyxjQUFhLG1CQUFtQjtBQUV0QyxTQUFPLEtBQUtBLFdBQVUsRUFBRSxRQUFRLGFBQVc7QUFDMUMsVUFBTSxZQUFZQSxZQUFXLE9BQU87QUFHcEMsUUFBSSw0QkFBNEIsUUFBUSxPQUFPLE1BQU0sSUFBSTtBQUN4RCxVQUFJLGNBQWMsUUFBUSxjQUFjLFFBQVE7QUFDL0MsWUFBSSxZQUFZLGlDQUFpQztBQUNoRCxjQUFJLDRCQUE0QjtBQUFBLFFBQ2pDLE9BQU87QUFDTixjQUFJLFlBQVksYUFBYSxPQUFPO0FBQUEsUUFDckM7QUFBQSxNQUNELFdBQVcsT0FBTyxjQUFjLFlBQVksV0FBVztBQUN0RCxZQUFJLFlBQVksa0JBQWtCO0FBR2pDLGNBQUksb0JBQW9CO0FBQ3hCLGNBQUksY0FBYyxXQUFXLGNBQWMsaUJBQWlCO0FBQzNELGdDQUFvQjtBQUFBLFVBQ3JCO0FBQ0EsY0FBSSxZQUFZLGFBQWEsU0FBUyxpQkFBaUI7QUFBQSxRQUN4RCxPQUFPO0FBQ04sY0FBSSxZQUFZLGFBQWEsU0FBUyxTQUFTO0FBQUEsUUFDaEQ7QUFBQSxNQUNEO0FBQUEsSUFDRCxXQUdTLGdDQUFnQyxRQUFRLE9BQU8sTUFBTSxJQUFJO0FBQ2pFLGNBQVEsU0FBUztBQUFBLFFBQ2hCLEtBQUs7QUFDSixjQUFJLE1BQU0sUUFBUSxTQUFTLEdBQUc7QUFDN0Isc0JBQVUsUUFBUSxRQUFNLE1BQU0sT0FBTyxPQUFPLFlBQVksUUFBUSxLQUFLLEtBQUsseUJBQXlCLEVBQUUsQ0FBQztBQUFBLFVBQ3ZHLE9BQU87QUFDTixvQkFBUSxNQUFNLDZGQUE2RjtBQUFBLFVBQzVHO0FBQ0E7QUFBQSxRQUVELEtBQUs7QUFDSixjQUFJLE9BQU8sY0FBYyxVQUFVO0FBQ2xDLG9CQUFRLEtBQUssS0FBSyxTQUFTLFNBQVM7QUFBQSxVQUNyQyxXQUFXLE1BQU0sUUFBUSxTQUFTLEdBQUc7QUFDcEMsdUJBQVcsU0FBUyxXQUFXO0FBQzlCLHNCQUFRLEtBQUssS0FBSyxTQUFTLEtBQUs7QUFBQSxZQUNqQztBQUFBLFVBQ0Q7QUFDQTtBQUFBLFFBRUQsS0FBSztBQUNKLGNBQUksV0FBVztBQUNkLG9CQUFRLEtBQUssS0FBSyw4QkFBOEI7QUFBQSxVQUNqRDtBQUNBO0FBQUEsUUFFRCxLQUFLO0FBQ0osY0FBSSxXQUFXO0FBQ2Qsb0JBQVEsS0FBSyxLQUFLLCtCQUErQjtBQUFBLFVBQ2xEO0FBQ0E7QUFBQSxNQUNGO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQVFELFFBQU0sbUJBQ0wsMEpBQTBKLFFBQVEsYUFBYSxVQUFVLDJCQUEyQixFQUFFLElBQUksSUFBSSxZQUFZLGVBQWUsaUJBQWlCLENBQUM7QUFDNVEsTUFBSSxZQUFZLGFBQWEsbUJBQW1CLGdCQUFnQjtBQUloRSxRQUFNLG9CQUNMLCtCQUErQixJQUFJLFlBQVksZUFBZSxrQkFBa0IsQ0FBQztBQUNsRixNQUFJLFlBQVksYUFBYSxvQkFBb0IsaUJBQWlCO0FBS2xFLFFBQU0seUJBQ0wsbURBQW1ELElBQUksWUFBWSxlQUFlLHdCQUF3QixDQUFDO0FBQzVHLE1BQUksWUFBWSxhQUFhLDBCQUEwQixzQkFBc0I7QUFHN0UsUUFBTSxVQUFVLFdBQVcsU0FBU0EsV0FBVTtBQUM5QyxNQUFJLFNBQVM7QUFDWixRQUFJLFlBQVksYUFBYSxZQUFZLE9BQU87QUFBQSxFQUNqRDtBQUtBLE1BQUksWUFBWSxhQUFhLCtCQUErQixHQUFHO0FBSS9ELE1BQUksWUFBWSxhQUFhLDZCQUE2QixJQUFJO0FBRTlELFNBQU9BO0FBQ1I7QUFvQkEsU0FBUyxxQkFBa0M7QUFHMUMsUUFBTSxpQkFBaUIsa0JBQWtCO0FBQ3pDLE1BQUlBLGNBQXNDO0FBQzFDLE1BQUk7QUFDSCxJQUFBQSxjQUFhLE1BQU0sR0FBRyxhQUFhLGNBQWMsRUFBRSxTQUFTLENBQUM7QUFBQSxFQUM5RCxTQUFTLE9BQU87QUFDZixRQUFJLFNBQVMsTUFBTSxTQUFTLFVBQVU7QUFDckMsa0NBQTRCLGNBQWM7QUFBQSxJQUMzQyxPQUFPO0FBQ04sY0FBUSxLQUFLLGtEQUFrRCxjQUFjLCtCQUErQixLQUFLLEdBQUc7QUFBQSxJQUNySDtBQUFBLEVBQ0Q7QUFHQSxNQUFJLENBQUNBLGFBQVk7QUFDaEIsSUFBQUEsY0FBYSxDQUFDO0FBQUEsRUFDZjtBQUVBLFNBQU9BO0FBQ1I7QUFFQSxTQUFTLDRCQUE0QixnQkFBOEI7QUFDbEUsTUFBSTtBQUdILFVBQU0sd0JBQXdCLEtBQUssUUFBUSxjQUFjO0FBQ3pELFFBQUksQ0FBQyxHQUFHLFdBQVcscUJBQXFCLEdBQUc7QUFDMUMsU0FBRyxVQUFVLHFCQUFxQjtBQUFBLElBQ25DO0FBR0EsVUFBTSwyQkFBMkI7QUFBQSxNQUNoQztBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUdBLE9BQUcsY0FBYyxnQkFBZ0IseUJBQXlCLEtBQUssSUFBSSxDQUFDO0FBQUEsRUFDckUsU0FBUyxPQUFPO0FBQ2YsWUFBUSxNQUFNLG9EQUFvRCxjQUFjLCtCQUErQixLQUFLLEdBQUc7QUFBQSxFQUN4SDtBQUNEO0FBRUEsU0FBUyxvQkFBNEI7QUFDcEMsUUFBTSxpQkFBaUIsUUFBUSxJQUFJLGlCQUFpQjtBQUNwRCxNQUFJLGdCQUFnQjtBQUNuQixXQUFPLEtBQUssS0FBSyxnQkFBZ0IsV0FBVztBQUFBLEVBQzdDO0FBRUEsTUFBSSxpQkFBaUIsUUFBUTtBQUM3QixNQUFJLFFBQVEsSUFBSSxZQUFZLEdBQUc7QUFDOUIscUJBQWlCLEdBQUcsY0FBYztBQUFBLEVBQ25DO0FBRUEsU0FBTyxLQUFLLEtBQUssR0FBRyxRQUFRLEdBQUcsZ0JBQWlCLFdBQVc7QUFDNUQ7QUFFQSxTQUFTLHlCQUErQjtBQUN2QyxNQUFJLHlCQUF5QixLQUFLLDBCQUEwQjtBQUM1RCxNQUFJLFlBQVk7QUFDaEIsTUFBSSx3QkFBd0I7QUFDM0IsNkJBQXlCLEtBQUssVUFBVSxzQkFBc0I7QUFFOUQsUUFBSSxDQUFDLEtBQUssV0FBVyxzQkFBc0IsR0FBRztBQUM3QyxjQUFRLE1BQU0sYUFBYSxzQkFBc0IsOERBQThEO0FBQy9HLFVBQUksS0FBSyxDQUFDO0FBQUEsSUFDWDtBQUVBLFFBQUksQ0FBQyxHQUFHLFdBQVcsc0JBQXNCLEdBQUc7QUFDM0MsVUFBSTtBQUNILFdBQUcsVUFBVSx3QkFBd0IsRUFBRSxXQUFXLEtBQUssQ0FBQztBQUFBLE1BQ3pELFNBQVMsT0FBTztBQUNmLGdCQUFRLE1BQU0sYUFBYSxzQkFBc0IseUZBQXlGO0FBQzFJLFlBQUksS0FBSyxDQUFDO0FBQUEsTUFDWDtBQUFBLElBQ0Q7QUFJQSxZQUFRLElBQUksa0ZBQWtGLHNCQUFzQixHQUFHO0FBQ3ZILFFBQUksUUFBUSxjQUFjLHNCQUFzQjtBQUFBLEVBQ2pELE9BR0s7QUFDSixVQUFNLFlBQVksUUFBUTtBQUMxQixRQUFJLFdBQVc7QUFDZCxZQUFNLFlBQWEsUUFBUSxhQUFhO0FBQ3hDLFlBQU0sVUFBVyxRQUFRLGFBQWE7QUFDdEMsWUFBTSxXQUFZLFFBQVEsYUFBYTtBQUN2QyxZQUFNLGtCQUFrQixXQUFXLG1CQUFtQjtBQUN0RCxZQUFNLGNBQWM7QUFDcEIsVUFBSSxtQkFBbUIsWUFBWSxLQUFLLGVBQWUsR0FBRztBQUN6RCxZQUFJLFdBQVc7QUFDZCxrQkFBUSxRQUFRLE1BQU07QUFBQSxZQUNyQixLQUFLO0FBQ0osMEJBQVksVUFBVSxXQUFXO0FBQ2pDO0FBQUEsWUFDRCxLQUFLO0FBQ0osMEJBQVksVUFBVSxhQUFhO0FBQ25DO0FBQUEsVUFDRjtBQUFBLFFBQ0QsV0FBVyxVQUFVO0FBQ3BCLGNBQUksUUFBUSx3QkFBd0I7QUFDbkMsd0JBQVksVUFBVSxrQkFBa0I7QUFBQSxVQUN6QyxPQUFPO0FBQ04sb0JBQVEsUUFBUSxNQUFNO0FBQUEsY0FDckIsS0FBSztBQUNKLDRCQUFZLFVBQVUsUUFBUTtBQUM5QjtBQUFBLGNBQ0QsS0FBSztBQUNKLDRCQUFZLFVBQVUsY0FBYztBQUNwQztBQUFBLFlBQ0Y7QUFBQSxVQUNEO0FBQUEsUUFDRCxXQUFXLFNBQVM7QUFDbkIsc0JBQVksVUFBVSxXQUFXO0FBQUEsUUFDbEM7QUFDQSxvQkFBWSxVQUFVLE9BQU8sU0FBUyxpQkFBaUIsU0FBUyxpQkFBaUIsU0FBUyxlQUFlO0FBR3pHLGNBQU0sT0FBTyxRQUFRO0FBQ3JCLGNBQU0sdUJBQXVCLEtBQUssUUFBUSxJQUFJO0FBQzlDLFlBQUkseUJBQXlCLElBQUk7QUFDaEMsZUFBSyxLQUFLLHVCQUF1QixlQUFlO0FBQUEsUUFDakQsT0FBTztBQUlOLGVBQUssT0FBTyxzQkFBc0IsR0FBRyx1QkFBdUIsZUFBZTtBQUFBLFFBQzVFO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBR0EsUUFBTSxlQUFlLFFBQVEsZ0JBQWdCLFFBQVEsY0FBYyxjQUFjLFdBQWMsUUFBUTtBQUN2RyxRQUFNLGVBQWUsUUFBUSxnQkFBZ0IsUUFBUSxjQUFjLGNBQWMsV0FBYztBQUMvRixRQUFNLGlCQUFpQixRQUFRLENBQUMsUUFBUSxJQUFJLFlBQVksS0FBSyxhQUFhLENBQUMsc0JBQXNCO0FBQ2pHLGdCQUFjLE1BQU07QUFBQSxJQUNuQjtBQUFBLElBQ0EsYUFBYSxRQUFRLElBQUksWUFBWSxJQUFJLEdBQUcsV0FBVyxTQUFTO0FBQUEsSUFDaEU7QUFBQSxJQUNBO0FBQUEsSUFDQSxVQUFVO0FBQUEsSUFDViwwQkFBMEI7QUFBQSxFQUMzQixDQUFDO0FBQ0Y7QUFFQSxTQUFTLFdBQVcsU0FBMkJBLGFBQXdDO0FBQ3RGLFFBQU0sVUFBb0IsQ0FBQztBQUczQixNQUFJLFFBQVEsVUFBVSxHQUFHO0FBQ3hCLFlBQVEsS0FBSyxRQUFRLFVBQVUsQ0FBQztBQUFBLEVBQ2pDO0FBR0EsTUFBSSxPQUFPQSxZQUFXLFVBQVUsTUFBTSxZQUFZQSxZQUFXLFVBQVUsR0FBRztBQUN6RSxZQUFRLEtBQUtBLFlBQVcsVUFBVSxDQUFDO0FBQUEsRUFDcEM7QUFFQSxTQUFPLFFBQVEsU0FBUyxJQUFJLFFBQVEsS0FBSyxHQUFHLElBQUk7QUFDakQ7QUFFQSxTQUFTLGVBQWlDO0FBQ3pDLFNBQU8sU0FBUyxRQUFRLE1BQU07QUFBQSxJQUM3QixRQUFRO0FBQUEsTUFDUDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFBQSxJQUNBLFNBQVM7QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUFBLElBQ0EsU0FBUztBQUFBLE1BQ1IsV0FBVztBQUFBLElBQ1o7QUFBQSxJQUNBLE9BQU87QUFBQSxNQUNOLGNBQWM7QUFBQSxJQUNmO0FBQUEsRUFDRCxDQUFDO0FBQ0Y7QUFFQSxTQUFTLG9CQUEwQjtBQU1sQyxRQUFNLGVBQXlCLENBQUM7QUFDaEMsRUFBQyxXQUEyQyxlQUFlO0FBQzNELE1BQUksR0FBRyxhQUFhLFNBQVUsT0FBT0MsT0FBTTtBQUMxQyxpQkFBYSxLQUFLQSxLQUFJO0FBQUEsRUFDdkIsQ0FBQztBQUtELFFBQU0sV0FBcUIsQ0FBQztBQUM1QixRQUFNLFlBQ0wsU0FBVSxPQUF1QyxLQUFhO0FBQzdELFVBQU0sZUFBZTtBQUVyQixhQUFTLEtBQUssR0FBRztBQUFBLEVBQ2xCO0FBRUQsTUFBSSxHQUFHLHlCQUF5QixXQUFZO0FBQzNDLFFBQUksR0FBRyxZQUFZLFNBQVM7QUFBQSxFQUM3QixDQUFDO0FBRUQsRUFBQyxXQUFnRCxjQUFjLFdBQVk7QUFDMUUsUUFBSSxlQUFlLFlBQVksU0FBUztBQUV4QyxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBRUEsU0FBUyxtQkFBdUM7QUFHL0MsTUFBSSxRQUFRLEtBQUssUUFBUSxrQkFBa0IsSUFBSSxHQUFHO0FBQ2pELFdBQU87QUFBQSxFQUNSO0FBR0EsTUFBSSxRQUFRLElBQUksWUFBWSxHQUFHO0FBQzlCLFdBQU87QUFBQSxFQUNSO0FBR0EsUUFBTSxTQUFTLFFBQVE7QUFDdkIsTUFBSSxDQUFDLFFBQVE7QUFDWixXQUFPO0FBQUEsRUFDUjtBQUVBLFNBQU8sS0FBSyxLQUFLLGNBQWMsY0FBYyxNQUFNO0FBQ3BEO0FBRUEsZUFBZSxrQkFBa0IsS0FBc0Q7QUFDdEYsTUFBSSxPQUFPLFFBQVEsVUFBVTtBQUM1QixRQUFJO0FBQ0gsWUFBTSxHQUFHLFNBQVMsTUFBTSxLQUFLLEVBQUUsV0FBVyxLQUFLLENBQUM7QUFFaEQsYUFBTztBQUFBLElBQ1IsU0FBUyxPQUFPO0FBQUEsSUFFaEI7QUFBQSxFQUNEO0FBRUEsU0FBTztBQUNSO0FBSUEsU0FBUyxnQkFBZ0IsV0FBMkI7QUFDbkQsTUFBSSxVQUFVLFdBQVcsSUFBSSxHQUFHO0FBQy9CLFVBQU0sU0FBUyxVQUFVLE1BQU0sR0FBRyxFQUFFLENBQUM7QUFXckMsUUFBSSxDQUFDLFFBQVEsTUFBTSxNQUFNLElBQUksRUFBRSxTQUFTLE1BQU0sR0FBRztBQUNoRCxhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU87QUFBQSxFQUNSO0FBRUEsU0FBTztBQUNSO0FBS0EsZUFBZSwwQkFBc0Q7QUFNcEUsUUFBTSxtQkFBbUIsMEJBQTBCLE1BQU0sMEJBQTBCO0FBQ25GLE1BQUksa0JBQWtCO0FBQ3JCLFdBQU87QUFBQSxFQUNSO0FBS0EsTUFBSUMsY0FBYSxJQUFJLFVBQVU7QUFDL0IsTUFBSSxDQUFDQSxhQUFZO0FBQ2hCLFdBQU87QUFBQSxNQUNOLFlBQVk7QUFBQSxNQUNaO0FBQUEsTUFDQSxrQkFBa0I7QUFBQSxNQUNsQixxQkFBcUIsS0FBSyxLQUFLLFlBQVksU0FBUyxtQkFBbUI7QUFBQTtBQUFBLE1BR3ZFLFFBQVE7QUFBQSxNQUNSLG9CQUFvQixDQUFDO0FBQUEsSUFDdEI7QUFBQSxFQUNEO0FBR0EsRUFBQUEsY0FBYSxnQkFBZ0JBLFlBQVcsWUFBWSxDQUFDO0FBRXJELFNBQU8sd0JBQXdCO0FBQUEsSUFDOUIsWUFBQUE7QUFBQSxJQUNBO0FBQUEsSUFDQSxRQUFRLFFBQVE7QUFBQSxJQUNoQjtBQUFBLElBQ0EsaUJBQWlCLFlBQVk7QUFBQSxFQUM5QixDQUFDO0FBQ0Y7QUFRQSxTQUFTLHFCQUFxQkYsYUFBNkM7QUFDMUUsUUFBTSxTQUFTLEtBQUssUUFBUTtBQUM1QixNQUFJLFFBQVE7QUFDWCxXQUFPLE9BQU8sWUFBWTtBQUFBLEVBQzNCO0FBRUEsU0FBTyxPQUFPQSxhQUFZLFdBQVcsV0FBV0EsWUFBVyxPQUFPLFlBQVksSUFBSTtBQUNuRjsiLAogICJuYW1lcyI6IFsiY29kZUNhY2hlUGF0aCIsICJhcmd2Q29uZmlnIiwgInBhdGgiLCAidXNlckxvY2FsZSJdCn0K
