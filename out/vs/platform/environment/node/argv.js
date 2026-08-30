import minimist from "minimist";
import { isWindows } from "../../../base/common/platform.js";
import { localize } from "../../../nls.js";
const helpCategories = {
  o: localize("optionsUpperCase", "Options"),
  e: localize("extensionsManagement", "Extensions Management"),
  t: localize("troubleshooting", "Troubleshooting"),
  m: localize("mcp", "Model Context Protocol")
};
const NATIVE_CLI_COMMANDS = ["tunnel", "serve-web", "agent"];
const OPTIONS = {
  "chat": {
    type: "subcommand",
    description: "Pass in a prompt to run in a chat session in the current working directory.",
    options: {
      "_": { type: "string[]", description: localize("prompt", "The prompt to use as chat.") },
      "mode": { type: "string", cat: "o", alias: "m", args: "mode", description: localize("chatMode", "The mode to use for the chat session. Available options: 'ask', 'edit', 'agent', or the identifier of a custom mode. Defaults to 'agent'.") },
      "add-file": { type: "string[]", cat: "o", alias: "a", args: "path", description: localize("addFile", "Add files as context to the chat session.") },
      "maximize": { type: "boolean", cat: "o", description: localize("chatMaximize", "Maximize the chat session view.") },
      "reuse-window": { type: "boolean", cat: "o", alias: "r", description: localize("reuseWindowForChat", "Force to use the last active window for the chat session.") },
      "new-window": { type: "boolean", cat: "o", alias: "n", description: localize("newWindowForChat", "Force to open an empty window for the chat session.") },
      "profile": { type: "string", "cat": "o", args: "profileName", description: localize("profileName", "Opens the provided folder or workspace with the given profile and associates the profile with the workspace. If the profile does not exist, a new empty one is created.") },
      "help": { type: "boolean", alias: "h", description: localize("help", "Print usage.") }
    }
  },
  "serve-web": {
    type: "subcommand",
    description: "Run a server that displays the editor UI in browsers.",
    options: {
      "cli-data-dir": { type: "string", args: "dir", description: localize("cliDataDir", "Directory where CLI metadata should be stored.") },
      "disable-telemetry": { type: "boolean" },
      "telemetry-level": { type: "string" }
    }
  },
  "agent": {
    type: "subcommand",
    description: "Start and interact with AI agent hosts.",
    options: {
      "cli-data-dir": { type: "string", args: "dir", description: localize("cliDataDir", "Directory where CLI metadata should be stored.") },
      "disable-telemetry": { type: "boolean" },
      "telemetry-level": { type: "string" }
    }
  },
  "tunnel": {
    type: "subcommand",
    description: "Make the current machine accessible from vscode.dev or other machines through a secure tunnel.",
    options: {
      "cli-data-dir": { type: "string", args: "dir", description: localize("cliDataDir", "Directory where CLI metadata should be stored.") },
      "disable-telemetry": { type: "boolean" },
      "telemetry-level": { type: "string" },
      user: {
        type: "subcommand",
        options: {
          login: {
            type: "subcommand",
            options: {
              provider: { type: "string" },
              "access-token": { type: "string" }
            }
          }
        }
      }
    }
  },
  "diff": { type: "boolean", cat: "o", alias: "d", args: ["file", "file"], description: localize("diff", "Compare two files with each other.") },
  "merge": { type: "boolean", cat: "o", alias: "m", args: ["path1", "path2", "base", "result"], description: localize("merge", "Perform a three-way merge by providing paths for two modified versions of a file, the common origin of both modified versions and the output file to save merge results.") },
  "add": { type: "boolean", cat: "o", alias: "a", args: "folder", description: localize("add", "Add folder(s) to the last active window.") },
  "remove": { type: "boolean", cat: "o", args: "folder", description: localize("remove", "Remove folder(s) from the last active window.") },
  "goto": { type: "boolean", cat: "o", alias: "g", args: "file:line[:character]", description: localize("goto", "Open a file at the path on the specified line and character position.") },
  "new-window": { type: "boolean", cat: "o", alias: "n", description: localize("newWindow", "Force to open a new window.") },
  "reuse-window": { type: "boolean", cat: "o", alias: "r", description: localize("reuseWindow", "Force to open a file or folder in an already opened window.") },
  "agents": { type: "boolean", cat: "o", deprecates: ["sessions"], description: localize("agents", "Opens the agents window.") },
  "wait": { type: "boolean", cat: "o", alias: "w", description: localize("wait", "Wait for the files to be closed before returning.") },
  "waitMarkerFilePath": { type: "string" },
  "locale": { type: "string", cat: "o", args: "locale", description: localize("locale", "The locale to use (e.g. en-US or zh-TW).") },
  "user-data-dir": { type: "string", cat: "o", args: "dir", description: localize("userDataDir", "Specifies the directory that user data is kept in. Can be used to open multiple distinct instances of Code.") },
  "profile": { type: "string", "cat": "o", args: "profileName", description: localize("profileName", "Opens the provided folder or workspace with the given profile and associates the profile with the workspace. If the profile does not exist, a new empty one is created.") },
  "help": { type: "boolean", cat: "o", alias: "h", description: localize("help", "Print usage.") },
  "extensions-dir": { type: "string", deprecates: ["extensionHomePath"], cat: "e", args: "dir", description: localize("extensionHomePath", "Set the root path for extensions.") },
  "extensions-download-dir": { type: "string" },
  "builtin-extensions-dir": { type: "string" },
  "shared-data-dir": { type: "string" },
  "list-extensions": { type: "boolean", cat: "e", description: localize("listExtensions", "List the installed extensions.") },
  "agent-plugins-dir": { type: "string" },
  "agents-user-data-dir": { type: "string" },
  "agents-extensions-dir": { type: "string" },
  "show-versions": { type: "boolean", cat: "e", description: localize("showVersions", "Show versions of installed extensions, when using --list-extensions.") },
  "category": { type: "string", allowEmptyValue: true, cat: "e", description: localize("category", "Filters installed extensions by provided category, when using --list-extensions."), args: "category" },
  "install-extension": { type: "string[]", cat: "e", args: "ext-id | path", description: localize("installExtension", "Installs or updates an extension. The argument is either an extension id or a path to a VSIX. The identifier of an extension is '${publisher}.${name}'. Use '--force' argument to update to latest version. To install a specific version provide '@${version}'. For example: 'vscode.csharp@1.2.3'.") },
  "pre-release": { type: "boolean", cat: "e", description: localize("install prerelease", "Installs the pre-release version of the extension, when using --install-extension") },
  "uninstall-extension": { type: "string[]", cat: "e", args: "ext-id", description: localize("uninstallExtension", "Uninstalls an extension.") },
  "update-extensions": { type: "boolean", cat: "e", description: localize("updateExtensions", "Update the installed extensions.") },
  "enable-proposed-api": { type: "string[]", allowEmptyValue: true, cat: "e", args: "ext-id", description: localize("experimentalApis", "Enables proposed API features for extensions. Can receive one or more extension IDs to enable individually.") },
  "add-mcp": { type: "string[]", cat: "m", args: "json", description: localize("addMcp", `Adds a Model Context Protocol server definition to the user profile. Accepts JSON input in the form '{"name":"server-name","command":...}'`) },
  "version": { type: "boolean", cat: "t", alias: "v", description: localize("version", "Print version.") },
  "verbose": { type: "boolean", cat: "t", global: true, description: localize("verbose", "Print verbose output (implies --wait).") },
  "log": { type: "string[]", cat: "t", args: "level", global: true, description: localize("log", "Log level to use. Default is 'info'. Allowed values are 'critical', 'error', 'warn', 'info', 'debug', 'trace', 'off'. You can also configure the log level of an extension by passing extension id and log level in the following format: '${publisher}.${name}:${logLevel}'. For example: 'vscode.csharp:trace'. Can receive one or more such entries.") },
  "status": { type: "boolean", alias: "s", cat: "t", description: localize("status", "Print process usage and diagnostics information.") },
  "prof-startup": { type: "boolean", cat: "t", description: localize("prof-startup", "Run CPU profiler during startup.") },
  "prof-append-timers": { type: "string" },
  "prof-duration-markers": { type: "string[]" },
  "prof-duration-markers-file": { type: "string" },
  "no-cached-data": { type: "boolean" },
  "prof-startup-prefix": { type: "string" },
  "prof-v8-extensions": { type: "boolean" },
  "disable-extensions": { type: "boolean", deprecates: ["disableExtensions"], cat: "t", description: localize("disableExtensions", "Disable all installed extensions. This option is not persisted and is effective only when the command opens a new window.") },
  "disable-extension": { type: "string[]", cat: "t", args: "ext-id", description: localize("disableExtension", "Disable the provided extension. This option is not persisted and is effective only when the command opens a new window.") },
  "sync": { type: "string", cat: "t", description: localize("turn sync", "Turn sync on or off."), args: ["on | off"] },
  "inspect-extensions": { type: "string", allowEmptyValue: true, deprecates: ["debugPluginHost"], args: "port", cat: "t", description: localize("inspect-extensions", "Allow debugging and profiling of extensions. Check the developer tools for the connection URI.") },
  "inspect-brk-extensions": { type: "string", allowEmptyValue: true, deprecates: ["debugBrkPluginHost"], args: "port", cat: "t", description: localize("inspect-brk-extensions", "Allow debugging and profiling of extensions with the extension host being paused after start. Check the developer tools for the connection URI.") },
  "disable-lcd-text": { type: "boolean", cat: "t", description: localize("disableLCDText", "Disable LCD font rendering.") },
  "disable-gpu": { type: "boolean", cat: "t", description: localize("disableGPU", "Disable GPU hardware acceleration.") },
  "disable-chromium-sandbox": { type: "boolean", cat: "t", description: localize("disableChromiumSandbox", "Use this option only when there is requirement to launch the application as sudo user on Linux or when running as an elevated user in an applocker environment on Windows.") },
  "sandbox": { type: "boolean" },
  "locate-shell-integration-path": { type: "string", cat: "t", args: ["shell"], description: localize("locateShellIntegrationPath", "Print the path to a terminal shell integration script. Allowed values are 'bash', 'pwsh', 'zsh' or 'fish'.") },
  "telemetry": { type: "boolean", cat: "t", description: localize("telemetry", "Shows all telemetry events which VS code collects.") },
  "remote": { type: "string", allowEmptyValue: true },
  "folder-uri": { type: "string[]", cat: "o", args: "uri" },
  "file-uri": { type: "string[]", cat: "o", args: "uri" },
  "locate-extension": { type: "string[]" },
  "extensionDevelopmentPath": { type: "string[]" },
  "extensionDevelopmentKind": { type: "string[]" },
  "extensionTestsPath": { type: "string" },
  "extensionEnvironment": { type: "string" },
  "debugId": { type: "string" },
  "debugRenderer": { type: "boolean" },
  "inspect-ptyhost": { type: "string", allowEmptyValue: true },
  "inspect-brk-ptyhost": { type: "string", allowEmptyValue: true },
  "inspect-agenthost": { type: "string", allowEmptyValue: true },
  "inspect-brk-agenthost": { type: "string", allowEmptyValue: true },
  "inspect-sharedprocess": { type: "string", allowEmptyValue: true },
  "inspect-brk-sharedprocess": { type: "string", allowEmptyValue: true },
  "export-default-configuration": { type: "string" },
  "export-policy-data": { type: "string", allowEmptyValue: true },
  "export-default-keybindings": { type: "string", allowEmptyValue: true },
  "install-source": { type: "string" },
  "enable-smoke-test-driver": { type: "boolean" },
  "skip-sessions-welcome": { type: "boolean" },
  "logExtensionHostCommunication": { type: "boolean" },
  "skip-release-notes": { type: "boolean" },
  "skip-welcome": { type: "boolean" },
  "disable-telemetry": { type: "boolean" },
  "disable-updates": { type: "boolean" },
  "share-secrets-with-agents-app": { type: "boolean" },
  "transient": { type: "boolean", cat: "t", description: localize("transient", "Run with temporary data and extension directories, as if launched for the first time.") },
  "use-inmemory-secretstorage": { type: "boolean", deprecates: ["disable-keytar"] },
  "password-store": { type: "string" },
  "disable-workspace-trust": { type: "boolean" },
  "disable-crash-reporter": { type: "boolean" },
  "crash-reporter-directory": { type: "string" },
  "crash-reporter-id": { type: "string" },
  "skip-add-to-recently-opened": { type: "boolean" },
  "open-url": { type: "boolean" },
  "file-write": { type: "boolean" },
  "file-chmod": { type: "boolean" },
  "install-builtin-extension": { type: "string[]" },
  "force": { type: "boolean" },
  "do-not-sync": { type: "boolean" },
  "do-not-include-pack-dependencies": { type: "boolean" },
  "trace": { type: "boolean" },
  "trace-memory-infra": { type: "boolean" },
  "trace-category-filter": { type: "string" },
  "trace-options": { type: "string" },
  "preserve-env": { type: "boolean" },
  "force-user-env": { type: "boolean" },
  "force-disable-user-env": { type: "boolean" },
  "open-devtools": { type: "boolean" },
  "disable-gpu-sandbox": { type: "boolean" },
  "logsPath": { type: "string" },
  "__enable-file-policy": { type: "boolean" },
  "editSessionId": { type: "string" },
  "continueOn": { type: "string" },
  "enable-coi": { type: "boolean" },
  "unresponsive-sample-interval": { type: "string" },
  "unresponsive-sample-period": { type: "string" },
  "enable-rdp-display-tracking": { type: "boolean" },
  "disable-layout-restore": { type: "boolean" },
  "disable-experiments": { type: "boolean" },
  // chromium flags
  "no-proxy-server": { type: "boolean" },
  // Minimist incorrectly parses keys that start with `--no`
  // https://github.com/substack/minimist/blob/aeb3e27dae0412de5c0494e9563a5f10c82cc7a9/index.js#L118-L121
  // If --no-sandbox is passed via cli wrapper it will be treated as --sandbox which is incorrect, we use
  // the alias here to make sure --no-sandbox is always respected.
  // For https://github.com/microsoft/vscode/issues/128279
  "no-sandbox": { type: "boolean", alias: "sandbox" },
  "proxy-server": { type: "string" },
  "proxy-bypass-list": { type: "string" },
  "proxy-pac-url": { type: "string" },
  "js-flags": { type: "string" },
  // chrome js flags
  "inspect": { type: "string", allowEmptyValue: true },
  "inspect-brk": { type: "string", allowEmptyValue: true },
  "nolazy": { type: "boolean" },
  // node inspect
  "force-device-scale-factor": { type: "string" },
  "force-renderer-accessibility": { type: "boolean" },
  "ignore-certificate-errors": { type: "boolean" },
  "allow-insecure-localhost": { type: "boolean" },
  "log-net-log": { type: "string" },
  "vmodule": { type: "string" },
  "_urls": { type: "string[]" },
  "disable-dev-shm-usage": { type: "boolean" },
  "profile-temp": { type: "boolean" },
  "ozone-platform": { type: "string" },
  "enable-tracing": { type: "string" },
  "trace-startup-format": { type: "string" },
  "trace-startup-file": { type: "string" },
  "trace-startup-duration": { type: "string" },
  "xdg-portal-required-version": { type: "string" },
  _: { type: "string[]" }
  // main arguments
};
const ignoringReporter = {
  onUnknownOption: () => {
  },
  onMultipleValues: () => {
  },
  onEmptyValue: () => {
  },
  onDeprecatedOption: () => {
  }
};
function parseArgs(args, options, errorReporter = ignoringReporter) {
  const firstPossibleCommand = args.find((a, i) => a.length > 0 && a[0] !== "-" && options.hasOwnProperty(a) && options[a].type === "subcommand");
  const alias = {};
  const stringOptions = ["_"];
  const booleanOptions = [];
  const globalOptions = {};
  let command = void 0;
  for (const optionId in options) {
    const o = options[optionId];
    if (o.type === "subcommand") {
      if (optionId === firstPossibleCommand) {
        command = o;
      }
    } else {
      if (o.alias) {
        alias[optionId] = o.alias;
      }
      if (o.type === "string" || o.type === "string[]") {
        stringOptions.push(optionId);
        if (o.deprecates) {
          stringOptions.push(...o.deprecates);
        }
      } else if (o.type === "boolean") {
        booleanOptions.push(optionId);
        if (o.deprecates) {
          booleanOptions.push(...o.deprecates);
        }
      }
      if (o.global) {
        globalOptions[optionId] = o;
      }
    }
  }
  if (command && firstPossibleCommand) {
    const options2 = globalOptions;
    for (const optionId in command.options) {
      options2[optionId] = command.options[optionId];
    }
    const newArgs = args.filter((a) => a !== firstPossibleCommand);
    const reporter = errorReporter.getSubcommandReporter ? errorReporter.getSubcommandReporter(firstPossibleCommand) : void 0;
    const subcommandOptions = parseArgs(newArgs, options2, reporter);
    return {
      [firstPossibleCommand]: subcommandOptions,
      _: []
    };
  }
  const parsedArgs = minimist(args, { string: stringOptions, boolean: booleanOptions, alias });
  const cleanedArgs = {};
  const remainingArgs = parsedArgs;
  cleanedArgs._ = parsedArgs._.map((arg) => String(arg)).filter((arg) => arg.length > 0);
  delete remainingArgs._;
  for (const optionId in options) {
    const o = options[optionId];
    if (o.type === "subcommand") {
      continue;
    }
    if (o.alias) {
      delete remainingArgs[o.alias];
    }
    let val = remainingArgs[optionId];
    if (o.deprecates) {
      for (const deprecatedId of o.deprecates) {
        if (remainingArgs.hasOwnProperty(deprecatedId)) {
          if (!val) {
            val = remainingArgs[deprecatedId];
            if (val) {
              errorReporter.onDeprecatedOption(deprecatedId, o.deprecationMessage || localize("deprecated.useInstead", "Use {0} instead.", optionId));
            }
          }
          delete remainingArgs[deprecatedId];
        }
      }
    }
    if (typeof val !== "undefined") {
      if (o.type === "string[]") {
        if (!Array.isArray(val)) {
          val = [val];
        }
        if (!o.allowEmptyValue) {
          const sanitized = val.filter((v) => v.length > 0);
          if (sanitized.length !== val.length) {
            errorReporter.onEmptyValue(optionId);
            val = sanitized.length > 0 ? sanitized : void 0;
          }
        }
      } else if (o.type === "string") {
        if (Array.isArray(val)) {
          val = val.pop();
          errorReporter.onMultipleValues(optionId, val);
        } else if (!val && !o.allowEmptyValue) {
          errorReporter.onEmptyValue(optionId);
          val = void 0;
        }
      }
      cleanedArgs[optionId] = val;
      if (o.deprecationMessage) {
        errorReporter.onDeprecatedOption(optionId, o.deprecationMessage);
      }
    }
    delete remainingArgs[optionId];
  }
  for (const key in remainingArgs) {
    errorReporter.onUnknownOption(key);
  }
  return cleanedArgs;
}
function formatUsage(optionId, option) {
  let args = "";
  if (option.args) {
    if (Array.isArray(option.args)) {
      args = ` <${option.args.join("> <")}>`;
    } else {
      args = ` <${option.args}>`;
    }
  }
  if (option.alias) {
    return `-${option.alias} --${optionId}${args}`;
  }
  return `--${optionId}${args}`;
}
function formatOptions(options, columns) {
  const usageTexts = [];
  for (const optionId in options) {
    const o = options[optionId];
    const usageText = formatUsage(optionId, o);
    usageTexts.push([usageText, o.description]);
  }
  return formatUsageTexts(usageTexts, columns);
}
function formatUsageTexts(usageTexts, columns) {
  const maxLength = usageTexts.reduce((previous, e) => Math.max(previous, e[0].length), 12);
  const argLength = maxLength + 2 + 1;
  if (columns - argLength < 25) {
    return usageTexts.reduce((r, ut) => r.concat([`  ${ut[0]}`, `      ${ut[1]}`]), []);
  }
  const descriptionColumns = columns - argLength - 1;
  const result = [];
  for (const ut of usageTexts) {
    const usage = ut[0];
    const wrappedDescription = wrapText(ut[1], descriptionColumns);
    const keyPadding = indent(
      argLength - usage.length - 2
      /*left padding*/
    );
    result.push("  " + usage + keyPadding + wrappedDescription[0]);
    for (let i = 1; i < wrappedDescription.length; i++) {
      result.push(indent(argLength) + wrappedDescription[i]);
    }
  }
  return result;
}
function indent(count) {
  return " ".repeat(count);
}
function wrapText(text, columns) {
  const lines = [];
  while (text.length) {
    let index = text.length < columns ? text.length : text.lastIndexOf(" ", columns);
    if (index === 0) {
      index = columns;
    }
    const line = text.slice(0, index).trim();
    text = text.slice(index).trimStart();
    lines.push(line);
  }
  return lines;
}
function buildHelpMessage(productName, executableName, version, options, capabilities) {
  const columns = process.stdout.isTTY && process.stdout.columns || 80;
  const inputFiles = capabilities?.noInputFiles ? "" : capabilities?.isChat ? ` [${localize("cliPrompt", "prompt")}]` : ` [${localize("paths", "paths")}...]`;
  const subcommand = capabilities?.isChat ? " chat" : "";
  const help = [`${productName} ${version}`];
  help.push("");
  help.push(`${localize("usage", "Usage")}: ${executableName}${subcommand} [${localize("options", "options")}]${inputFiles}`);
  help.push("");
  if (capabilities?.noPipe !== true) {
    help.push(buildStdinMessage(executableName, capabilities?.isChat));
    help.push("");
  }
  const optionsByCategory = {};
  const subcommands = [];
  for (const optionId in options) {
    const o = options[optionId];
    if (o.type === "subcommand") {
      if (o.description) {
        subcommands.push({ command: optionId, description: o.description });
      }
    } else if (o.description && o.cat) {
      const cat = o.cat;
      let optionsByCat = optionsByCategory[cat];
      if (!optionsByCat) {
        optionsByCategory[cat] = optionsByCat = {};
      }
      optionsByCat[optionId] = o;
    }
  }
  for (const helpCategoryKey in optionsByCategory) {
    const key = helpCategoryKey;
    const categoryOptions = optionsByCategory[key];
    if (categoryOptions) {
      help.push(helpCategories[key]);
      help.push(...formatOptions(categoryOptions, columns));
      help.push("");
    }
  }
  if (subcommands.length) {
    help.push(localize("subcommands", "Subcommands"));
    help.push(...formatUsageTexts(subcommands.map((s) => [s.command, s.description]), columns));
    help.push("");
  }
  return help.join("\n");
}
function buildStdinMessage(executableName, isChat) {
  let example;
  if (isWindows) {
    if (isChat) {
      example = `echo Hello World | ${executableName} chat <prompt> -`;
    } else {
      example = `echo Hello World | ${executableName} -`;
    }
  } else {
    if (isChat) {
      example = `ps aux | grep code | ${executableName} chat <prompt> -`;
    } else {
      example = `ps aux | grep code | ${executableName} -`;
    }
  }
  return localize("stdinUsage", "To read from stdin, append '-' (e.g. '{0}')", example);
}
function buildVersionMessage(version, commit) {
  return `${version || localize("unknownVersion", "Unknown version")}
${commit || localize("unknownCommit", "Unknown commit")}
${process.arch}`;
}
export {
  NATIVE_CLI_COMMANDS,
  OPTIONS,
  buildHelpMessage,
  buildStdinMessage,
  buildVersionMessage,
  formatOptions,
  parseArgs
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZW52aXJvbm1lbnRcXG5vZGVcXGFyZ3YudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgbWluaW1pc3QgZnJvbSAnbWluaW1pc3QnO1xuaW1wb3J0IHsgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTmF0aXZlUGFyc2VkQXJncyB9IGZyb20gJy4uL2NvbW1vbi9hcmd2LmpzJztcblxuLyoqXG4gKiBUaGlzIGNvZGUgaXMgYWxzbyB1c2VkIGJ5IHN0YW5kYWxvbmUgY2xpJ3MuIEF2b2lkIGFkZGluZyBhbnkgb3RoZXIgZGVwZW5kZW5jaWVzLlxuICovXG5jb25zdCBoZWxwQ2F0ZWdvcmllcyA9IHtcblx0bzogbG9jYWxpemUoJ29wdGlvbnNVcHBlckNhc2UnLCBcIk9wdGlvbnNcIiksXG5cdGU6IGxvY2FsaXplKCdleHRlbnNpb25zTWFuYWdlbWVudCcsIFwiRXh0ZW5zaW9ucyBNYW5hZ2VtZW50XCIpLFxuXHR0OiBsb2NhbGl6ZSgndHJvdWJsZXNob290aW5nJywgXCJUcm91Ymxlc2hvb3RpbmdcIiksXG5cdG06IGxvY2FsaXplKCdtY3AnLCBcIk1vZGVsIENvbnRleHQgUHJvdG9jb2xcIilcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgT3B0aW9uPE9wdGlvblR5cGU+IHtcblx0dHlwZTogT3B0aW9uVHlwZTtcblx0YWxpYXM/OiBzdHJpbmc7XG5cdGRlcHJlY2F0ZXM/OiBzdHJpbmdbXTsgLy8gb2xkIGRlcHJlY2F0ZWQgaWRzXG5cdGFyZ3M/OiBzdHJpbmcgfCBzdHJpbmdbXTtcblx0ZGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdGRlcHJlY2F0aW9uTWVzc2FnZT86IHN0cmluZztcblx0YWxsb3dFbXB0eVZhbHVlPzogYm9vbGVhbjtcblx0Y2F0Pzoga2V5b2YgdHlwZW9mIGhlbHBDYXRlZ29yaWVzO1xuXHRnbG9iYWw/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN1YmNvbW1hbmQ8VD4ge1xuXHR0eXBlOiAnc3ViY29tbWFuZCc7XG5cdGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuXHRkZXByZWNhdGlvbk1lc3NhZ2U/OiBzdHJpbmc7XG5cdG9wdGlvbnM6IE9wdGlvbkRlc2NyaXB0aW9uczxSZXF1aXJlZDxUPj47XG59XG5cbmV4cG9ydCB0eXBlIE9wdGlvbkRlc2NyaXB0aW9uczxUPiA9IHtcblx0W1AgaW4ga2V5b2YgVF06XG5cdFRbUF0gZXh0ZW5kcyBib29sZWFuIHwgdW5kZWZpbmVkID8gT3B0aW9uPCdib29sZWFuJz4gOlxuXHRUW1BdIGV4dGVuZHMgc3RyaW5nIHwgdW5kZWZpbmVkID8gT3B0aW9uPCdzdHJpbmcnPiA6XG5cdFRbUF0gZXh0ZW5kcyBzdHJpbmdbXSB8IHVuZGVmaW5lZCA/IE9wdGlvbjwnc3RyaW5nW10nPiA6XG5cdFN1YmNvbW1hbmQ8VFtQXT5cbn07XG5cbmV4cG9ydCBjb25zdCBOQVRJVkVfQ0xJX0NPTU1BTkRTID0gWyd0dW5uZWwnLCAnc2VydmUtd2ViJywgJ2FnZW50J10gYXMgY29uc3Q7XG5cbmV4cG9ydCBjb25zdCBPUFRJT05TOiBPcHRpb25EZXNjcmlwdGlvbnM8UmVxdWlyZWQ8TmF0aXZlUGFyc2VkQXJncz4+ID0ge1xuXHQnY2hhdCc6IHtcblx0XHR0eXBlOiAnc3ViY29tbWFuZCcsXG5cdFx0ZGVzY3JpcHRpb246ICdQYXNzIGluIGEgcHJvbXB0IHRvIHJ1biBpbiBhIGNoYXQgc2Vzc2lvbiBpbiB0aGUgY3VycmVudCB3b3JraW5nIGRpcmVjdG9yeS4nLFxuXHRcdG9wdGlvbnM6IHtcblx0XHRcdCdfJzogeyB0eXBlOiAnc3RyaW5nW10nLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Byb21wdCcsIFwiVGhlIHByb21wdCB0byB1c2UgYXMgY2hhdC5cIikgfSxcblx0XHRcdCdtb2RlJzogeyB0eXBlOiAnc3RyaW5nJywgY2F0OiAnbycsIGFsaWFzOiAnbScsIGFyZ3M6ICdtb2RlJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0TW9kZScsIFwiVGhlIG1vZGUgdG8gdXNlIGZvciB0aGUgY2hhdCBzZXNzaW9uLiBBdmFpbGFibGUgb3B0aW9uczogJ2FzaycsICdlZGl0JywgJ2FnZW50Jywgb3IgdGhlIGlkZW50aWZpZXIgb2YgYSBjdXN0b20gbW9kZS4gRGVmYXVsdHMgdG8gJ2FnZW50Jy5cIikgfSxcblx0XHRcdCdhZGQtZmlsZSc6IHsgdHlwZTogJ3N0cmluZ1tdJywgY2F0OiAnbycsIGFsaWFzOiAnYScsIGFyZ3M6ICdwYXRoJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdhZGRGaWxlJywgXCJBZGQgZmlsZXMgYXMgY29udGV4dCB0byB0aGUgY2hhdCBzZXNzaW9uLlwiKSB9LFxuXHRcdFx0J21heGltaXplJzogeyB0eXBlOiAnYm9vbGVhbicsIGNhdDogJ28nLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRNYXhpbWl6ZScsIFwiTWF4aW1pemUgdGhlIGNoYXQgc2Vzc2lvbiB2aWV3LlwiKSB9LFxuXHRcdFx0J3JldXNlLXdpbmRvdyc6IHsgdHlwZTogJ2Jvb2xlYW4nLCBjYXQ6ICdvJywgYWxpYXM6ICdyJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdyZXVzZVdpbmRvd0ZvckNoYXQnLCBcIkZvcmNlIHRvIHVzZSB0aGUgbGFzdCBhY3RpdmUgd2luZG93IGZvciB0aGUgY2hhdCBzZXNzaW9uLlwiKSB9LFxuXHRcdFx0J25ldy13aW5kb3cnOiB7IHR5cGU6ICdib29sZWFuJywgY2F0OiAnbycsIGFsaWFzOiAnbicsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbmV3V2luZG93Rm9yQ2hhdCcsIFwiRm9yY2UgdG8gb3BlbiBhbiBlbXB0eSB3aW5kb3cgZm9yIHRoZSBjaGF0IHNlc3Npb24uXCIpIH0sXG5cdFx0XHQncHJvZmlsZSc6IHsgdHlwZTogJ3N0cmluZycsICdjYXQnOiAnbycsIGFyZ3M6ICdwcm9maWxlTmFtZScsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJvZmlsZU5hbWUnLCBcIk9wZW5zIHRoZSBwcm92aWRlZCBmb2xkZXIgb3Igd29ya3NwYWNlIHdpdGggdGhlIGdpdmVuIHByb2ZpbGUgYW5kIGFzc29jaWF0ZXMgdGhlIHByb2ZpbGUgd2l0aCB0aGUgd29ya3NwYWNlLiBJZiB0aGUgcHJvZmlsZSBkb2VzIG5vdCBleGlzdCwgYSBuZXcgZW1wdHkgb25lIGlzIGNyZWF0ZWQuXCIpIH0sXG5cdFx0XHQnaGVscCc6IHsgdHlwZTogJ2Jvb2xlYW4nLCBhbGlhczogJ2gnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2hlbHAnLCBcIlByaW50IHVzYWdlLlwiKSB9XG5cdFx0fVxuXHR9LFxuXHQnc2VydmUtd2ViJzoge1xuXHRcdHR5cGU6ICdzdWJjb21tYW5kJyxcblx0XHRkZXNjcmlwdGlvbjogJ1J1biBhIHNlcnZlciB0aGF0IGRpc3BsYXlzIHRoZSBlZGl0b3IgVUkgaW4gYnJvd3NlcnMuJyxcblx0XHRvcHRpb25zOiB7XG5cdFx0XHQnY2xpLWRhdGEtZGlyJzogeyB0eXBlOiAnc3RyaW5nJywgYXJnczogJ2RpcicsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xpRGF0YURpcicsIFwiRGlyZWN0b3J5IHdoZXJlIENMSSBtZXRhZGF0YSBzaG91bGQgYmUgc3RvcmVkLlwiKSB9LFxuXHRcdFx0J2Rpc2FibGUtdGVsZW1ldHJ5JzogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0XHRcdCd0ZWxlbWV0cnktbGV2ZWwnOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0fVxuXHR9LFxuXHQnYWdlbnQnOiB7XG5cdFx0dHlwZTogJ3N1YmNvbW1hbmQnLFxuXHRcdGRlc2NyaXB0aW9uOiAnU3RhcnQgYW5kIGludGVyYWN0IHdpdGggQUkgYWdlbnQgaG9zdHMuJyxcblx0XHRvcHRpb25zOiB7XG5cdFx0XHQnY2xpLWRhdGEtZGlyJzogeyB0eXBlOiAnc3RyaW5nJywgYXJnczogJ2RpcicsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xpRGF0YURpcicsIFwiRGlyZWN0b3J5IHdoZXJlIENMSSBtZXRhZGF0YSBzaG91bGQgYmUgc3RvcmVkLlwiKSB9LFxuXHRcdFx0J2Rpc2FibGUtdGVsZW1ldHJ5JzogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0XHRcdCd0ZWxlbWV0cnktbGV2ZWwnOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0fVxuXHR9LFxuXHQndHVubmVsJzoge1xuXHRcdHR5cGU6ICdzdWJjb21tYW5kJyxcblx0XHRkZXNjcmlwdGlvbjogJ01ha2UgdGhlIGN1cnJlbnQgbWFjaGluZSBhY2Nlc3NpYmxlIGZyb20gdnNjb2RlLmRldiBvciBvdGhlciBtYWNoaW5lcyB0aHJvdWdoIGEgc2VjdXJlIHR1bm5lbC4nLFxuXHRcdG9wdGlvbnM6IHtcblx0XHRcdCdjbGktZGF0YS1kaXInOiB7IHR5cGU6ICdzdHJpbmcnLCBhcmdzOiAnZGlyJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGlEYXRhRGlyJywgXCJEaXJlY3Rvcnkgd2hlcmUgQ0xJIG1ldGFkYXRhIHNob3VsZCBiZSBzdG9yZWQuXCIpIH0sXG5cdFx0XHQnZGlzYWJsZS10ZWxlbWV0cnknOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHRcdFx0J3RlbGVtZXRyeS1sZXZlbCc6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdHVzZXI6IHtcblx0XHRcdFx0dHlwZTogJ3N1YmNvbW1hbmQnLFxuXHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0bG9naW46IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdWJjb21tYW5kJyxcblx0XHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0cHJvdmlkZXI6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0XHRcdFx0J2FjY2Vzcy10b2tlbic6IHsgdHlwZTogJ3N0cmluZycgfVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSxcblx0J2RpZmYnOiB7IHR5cGU6ICdib29sZWFuJywgY2F0OiAnbycsIGFsaWFzOiAnZCcsIGFyZ3M6IFsnZmlsZScsICdmaWxlJ10sIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZGlmZicsIFwiQ29tcGFyZSB0d28gZmlsZXMgd2l0aCBlYWNoIG90aGVyLlwiKSB9LFxuXHQnbWVyZ2UnOiB7IHR5cGU6ICdib29sZWFuJywgY2F0OiAnbycsIGFsaWFzOiAnbScsIGFyZ3M6IFsncGF0aDEnLCAncGF0aDInLCAnYmFzZScsICdyZXN1bHQnXSwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZXJnZScsIFwiUGVyZm9ybSBhIHRocmVlLXdheSBtZXJnZSBieSBwcm92aWRpbmcgcGF0aHMgZm9yIHR3byBtb2RpZmllZCB2ZXJzaW9ucyBvZiBhIGZpbGUsIHRoZSBjb21tb24gb3JpZ2luIG9mIGJvdGggbW9kaWZpZWQgdmVyc2lvbnMgYW5kIHRoZSBvdXRwdXQgZmlsZSB0byBzYXZlIG1lcmdlIHJlc3VsdHMuXCIpIH0sXG5cdCdhZGQnOiB7IHR5cGU6ICdib29sZWFuJywgY2F0OiAnbycsIGFsaWFzOiAnYScsIGFyZ3M6ICdmb2xkZXInLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FkZCcsIFwiQWRkIGZvbGRlcihzKSB0byB0aGUgbGFzdCBhY3RpdmUgd2luZG93LlwiKSB9LFxuXHQncmVtb3ZlJzogeyB0eXBlOiAnYm9vbGVhbicsIGNhdDogJ28nLCBhcmdzOiAnZm9sZGVyJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdyZW1vdmUnLCBcIlJlbW92ZSBmb2xkZXIocykgZnJvbSB0aGUgbGFzdCBhY3RpdmUgd2luZG93LlwiKSB9LFxuXHQnZ290byc6IHsgdHlwZTogJ2Jvb2xlYW4nLCBjYXQ6ICdvJywgYWxpYXM6ICdnJywgYXJnczogJ2ZpbGU6bGluZVs6Y2hhcmFjdGVyXScsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ290bycsIFwiT3BlbiBhIGZpbGUgYXQgdGhlIHBhdGggb24gdGhlIHNwZWNpZmllZCBsaW5lIGFuZCBjaGFyYWN0ZXIgcG9zaXRpb24uXCIpIH0sXG5cdCduZXctd2luZG93JzogeyB0eXBlOiAnYm9vbGVhbicsIGNhdDogJ28nLCBhbGlhczogJ24nLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ25ld1dpbmRvdycsIFwiRm9yY2UgdG8gb3BlbiBhIG5ldyB3aW5kb3cuXCIpIH0sXG5cdCdyZXVzZS13aW5kb3cnOiB7IHR5cGU6ICdib29sZWFuJywgY2F0OiAnbycsIGFsaWFzOiAncicsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncmV1c2VXaW5kb3cnLCBcIkZvcmNlIHRvIG9wZW4gYSBmaWxlIG9yIGZvbGRlciBpbiBhbiBhbHJlYWR5IG9wZW5lZCB3aW5kb3cuXCIpIH0sXG5cdCdhZ2VudHMnOiB7IHR5cGU6ICdib29sZWFuJywgY2F0OiAnbycsIGRlcHJlY2F0ZXM6IFsnc2Vzc2lvbnMnXSwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdhZ2VudHMnLCBcIk9wZW5zIHRoZSBhZ2VudHMgd2luZG93LlwiKSB9LFxuXHQnd2FpdCc6IHsgdHlwZTogJ2Jvb2xlYW4nLCBjYXQ6ICdvJywgYWxpYXM6ICd3JywgZGVzY3JpcHRpb246IGxvY2FsaXplKCd3YWl0JywgXCJXYWl0IGZvciB0aGUgZmlsZXMgdG8gYmUgY2xvc2VkIGJlZm9yZSByZXR1cm5pbmcuXCIpIH0sXG5cdCd3YWl0TWFya2VyRmlsZVBhdGgnOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdCdsb2NhbGUnOiB7IHR5cGU6ICdzdHJpbmcnLCBjYXQ6ICdvJywgYXJnczogJ2xvY2FsZScsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbG9jYWxlJywgXCJUaGUgbG9jYWxlIHRvIHVzZSAoZS5nLiBlbi1VUyBvciB6aC1UVykuXCIpIH0sXG5cdCd1c2VyLWRhdGEtZGlyJzogeyB0eXBlOiAnc3RyaW5nJywgY2F0OiAnbycsIGFyZ3M6ICdkaXInLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3VzZXJEYXRhRGlyJywgXCJTcGVjaWZpZXMgdGhlIGRpcmVjdG9yeSB0aGF0IHVzZXIgZGF0YSBpcyBrZXB0IGluLiBDYW4gYmUgdXNlZCB0byBvcGVuIG11bHRpcGxlIGRpc3RpbmN0IGluc3RhbmNlcyBvZiBDb2RlLlwiKSB9LFxuXHQncHJvZmlsZSc6IHsgdHlwZTogJ3N0cmluZycsICdjYXQnOiAnbycsIGFyZ3M6ICdwcm9maWxlTmFtZScsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJvZmlsZU5hbWUnLCBcIk9wZW5zIHRoZSBwcm92aWRlZCBmb2xkZXIgb3Igd29ya3NwYWNlIHdpdGggdGhlIGdpdmVuIHByb2ZpbGUgYW5kIGFzc29jaWF0ZXMgdGhlIHByb2ZpbGUgd2l0aCB0aGUgd29ya3NwYWNlLiBJZiB0aGUgcHJvZmlsZSBkb2VzIG5vdCBleGlzdCwgYSBuZXcgZW1wdHkgb25lIGlzIGNyZWF0ZWQuXCIpIH0sXG5cdCdoZWxwJzogeyB0eXBlOiAnYm9vbGVhbicsIGNhdDogJ28nLCBhbGlhczogJ2gnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2hlbHAnLCBcIlByaW50IHVzYWdlLlwiKSB9LFxuXG5cdCdleHRlbnNpb25zLWRpcic6IHsgdHlwZTogJ3N0cmluZycsIGRlcHJlY2F0ZXM6IFsnZXh0ZW5zaW9uSG9tZVBhdGgnXSwgY2F0OiAnZScsIGFyZ3M6ICdkaXInLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2V4dGVuc2lvbkhvbWVQYXRoJywgXCJTZXQgdGhlIHJvb3QgcGF0aCBmb3IgZXh0ZW5zaW9ucy5cIikgfSxcblx0J2V4dGVuc2lvbnMtZG93bmxvYWQtZGlyJzogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHQnYnVpbHRpbi1leHRlbnNpb25zLWRpcic6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0J3NoYXJlZC1kYXRhLWRpcic6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0J2xpc3QtZXh0ZW5zaW9ucyc6IHsgdHlwZTogJ2Jvb2xlYW4nLCBjYXQ6ICdlJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdsaXN0RXh0ZW5zaW9ucycsIFwiTGlzdCB0aGUgaW5zdGFsbGVkIGV4dGVuc2lvbnMuXCIpIH0sXG5cdCdhZ2VudC1wbHVnaW5zLWRpcic6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0J2FnZW50cy11c2VyLWRhdGEtZGlyJzogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHQnYWdlbnRzLWV4dGVuc2lvbnMtZGlyJzogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHQnc2hvdy12ZXJzaW9ucyc6IHsgdHlwZTogJ2Jvb2xlYW4nLCBjYXQ6ICdlJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdzaG93VmVyc2lvbnMnLCBcIlNob3cgdmVyc2lvbnMgb2YgaW5zdGFsbGVkIGV4dGVuc2lvbnMsIHdoZW4gdXNpbmcgLS1saXN0LWV4dGVuc2lvbnMuXCIpIH0sXG5cdCdjYXRlZ29yeSc6IHsgdHlwZTogJ3N0cmluZycsIGFsbG93RW1wdHlWYWx1ZTogdHJ1ZSwgY2F0OiAnZScsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2F0ZWdvcnknLCBcIkZpbHRlcnMgaW5zdGFsbGVkIGV4dGVuc2lvbnMgYnkgcHJvdmlkZWQgY2F0ZWdvcnksIHdoZW4gdXNpbmcgLS1saXN0LWV4dGVuc2lvbnMuXCIpLCBhcmdzOiAnY2F0ZWdvcnknIH0sXG5cdCdpbnN0YWxsLWV4dGVuc2lvbic6IHsgdHlwZTogJ3N0cmluZ1tdJywgY2F0OiAnZScsIGFyZ3M6ICdleHQtaWQgfCBwYXRoJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdpbnN0YWxsRXh0ZW5zaW9uJywgXCJJbnN0YWxscyBvciB1cGRhdGVzIGFuIGV4dGVuc2lvbi4gVGhlIGFyZ3VtZW50IGlzIGVpdGhlciBhbiBleHRlbnNpb24gaWQgb3IgYSBwYXRoIHRvIGEgVlNJWC4gVGhlIGlkZW50aWZpZXIgb2YgYW4gZXh0ZW5zaW9uIGlzICcke3B1Ymxpc2hlcn0uJHtuYW1lfScuIFVzZSAnLS1mb3JjZScgYXJndW1lbnQgdG8gdXBkYXRlIHRvIGxhdGVzdCB2ZXJzaW9uLiBUbyBpbnN0YWxsIGEgc3BlY2lmaWMgdmVyc2lvbiBwcm92aWRlICdAJHt2ZXJzaW9ufScuIEZvciBleGFtcGxlOiAndnNjb2RlLmNzaGFycEAxLjIuMycuXCIpIH0sXG5cdCdwcmUtcmVsZWFzZSc6IHsgdHlwZTogJ2Jvb2xlYW4nLCBjYXQ6ICdlJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdpbnN0YWxsIHByZXJlbGVhc2UnLCBcIkluc3RhbGxzIHRoZSBwcmUtcmVsZWFzZSB2ZXJzaW9uIG9mIHRoZSBleHRlbnNpb24sIHdoZW4gdXNpbmcgLS1pbnN0YWxsLWV4dGVuc2lvblwiKSB9LFxuXHQndW5pbnN0YWxsLWV4dGVuc2lvbic6IHsgdHlwZTogJ3N0cmluZ1tdJywgY2F0OiAnZScsIGFyZ3M6ICdleHQtaWQnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3VuaW5zdGFsbEV4dGVuc2lvbicsIFwiVW5pbnN0YWxscyBhbiBleHRlbnNpb24uXCIpIH0sXG5cdCd1cGRhdGUtZXh0ZW5zaW9ucyc6IHsgdHlwZTogJ2Jvb2xlYW4nLCBjYXQ6ICdlJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCd1cGRhdGVFeHRlbnNpb25zJywgXCJVcGRhdGUgdGhlIGluc3RhbGxlZCBleHRlbnNpb25zLlwiKSB9LFxuXHQnZW5hYmxlLXByb3Bvc2VkLWFwaSc6IHsgdHlwZTogJ3N0cmluZ1tdJywgYWxsb3dFbXB0eVZhbHVlOiB0cnVlLCBjYXQ6ICdlJywgYXJnczogJ2V4dC1pZCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZXhwZXJpbWVudGFsQXBpcycsIFwiRW5hYmxlcyBwcm9wb3NlZCBBUEkgZmVhdHVyZXMgZm9yIGV4dGVuc2lvbnMuIENhbiByZWNlaXZlIG9uZSBvciBtb3JlIGV4dGVuc2lvbiBJRHMgdG8gZW5hYmxlIGluZGl2aWR1YWxseS5cIikgfSxcblxuXHQnYWRkLW1jcCc6IHsgdHlwZTogJ3N0cmluZ1tdJywgY2F0OiAnbScsIGFyZ3M6ICdqc29uJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdhZGRNY3AnLCBcIkFkZHMgYSBNb2RlbCBDb250ZXh0IFByb3RvY29sIHNlcnZlciBkZWZpbml0aW9uIHRvIHRoZSB1c2VyIHByb2ZpbGUuIEFjY2VwdHMgSlNPTiBpbnB1dCBpbiB0aGUgZm9ybSAne1xcXCJuYW1lXFxcIjpcXFwic2VydmVyLW5hbWVcXFwiLFxcXCJjb21tYW5kXFxcIjouLi59J1wiKSB9LFxuXG5cdCd2ZXJzaW9uJzogeyB0eXBlOiAnYm9vbGVhbicsIGNhdDogJ3QnLCBhbGlhczogJ3YnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZlcnNpb24nLCBcIlByaW50IHZlcnNpb24uXCIpIH0sXG5cdCd2ZXJib3NlJzogeyB0eXBlOiAnYm9vbGVhbicsIGNhdDogJ3QnLCBnbG9iYWw6IHRydWUsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndmVyYm9zZScsIFwiUHJpbnQgdmVyYm9zZSBvdXRwdXQgKGltcGxpZXMgLS13YWl0KS5cIikgfSxcblx0J2xvZyc6IHsgdHlwZTogJ3N0cmluZ1tdJywgY2F0OiAndCcsIGFyZ3M6ICdsZXZlbCcsIGdsb2JhbDogdHJ1ZSwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdsb2cnLCBcIkxvZyBsZXZlbCB0byB1c2UuIERlZmF1bHQgaXMgJ2luZm8nLiBBbGxvd2VkIHZhbHVlcyBhcmUgJ2NyaXRpY2FsJywgJ2Vycm9yJywgJ3dhcm4nLCAnaW5mbycsICdkZWJ1ZycsICd0cmFjZScsICdvZmYnLiBZb3UgY2FuIGFsc28gY29uZmlndXJlIHRoZSBsb2cgbGV2ZWwgb2YgYW4gZXh0ZW5zaW9uIGJ5IHBhc3NpbmcgZXh0ZW5zaW9uIGlkIGFuZCBsb2cgbGV2ZWwgaW4gdGhlIGZvbGxvd2luZyBmb3JtYXQ6ICcke3B1Ymxpc2hlcn0uJHtuYW1lfToke2xvZ0xldmVsfScuIEZvciBleGFtcGxlOiAndnNjb2RlLmNzaGFycDp0cmFjZScuIENhbiByZWNlaXZlIG9uZSBvciBtb3JlIHN1Y2ggZW50cmllcy5cIikgfSxcblx0J3N0YXR1cyc6IHsgdHlwZTogJ2Jvb2xlYW4nLCBhbGlhczogJ3MnLCBjYXQ6ICd0JywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdzdGF0dXMnLCBcIlByaW50IHByb2Nlc3MgdXNhZ2UgYW5kIGRpYWdub3N0aWNzIGluZm9ybWF0aW9uLlwiKSB9LFxuXHQncHJvZi1zdGFydHVwJzogeyB0eXBlOiAnYm9vbGVhbicsIGNhdDogJ3QnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Byb2Ytc3RhcnR1cCcsIFwiUnVuIENQVSBwcm9maWxlciBkdXJpbmcgc3RhcnR1cC5cIikgfSxcblx0J3Byb2YtYXBwZW5kLXRpbWVycyc6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0J3Byb2YtZHVyYXRpb24tbWFya2Vycyc6IHsgdHlwZTogJ3N0cmluZ1tdJyB9LFxuXHQncHJvZi1kdXJhdGlvbi1tYXJrZXJzLWZpbGUnOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdCduby1jYWNoZWQtZGF0YSc6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdCdwcm9mLXN0YXJ0dXAtcHJlZml4JzogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHQncHJvZi12OC1leHRlbnNpb25zJzogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0J2Rpc2FibGUtZXh0ZW5zaW9ucyc6IHsgdHlwZTogJ2Jvb2xlYW4nLCBkZXByZWNhdGVzOiBbJ2Rpc2FibGVFeHRlbnNpb25zJ10sIGNhdDogJ3QnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2Rpc2FibGVFeHRlbnNpb25zJywgXCJEaXNhYmxlIGFsbCBpbnN0YWxsZWQgZXh0ZW5zaW9ucy4gVGhpcyBvcHRpb24gaXMgbm90IHBlcnNpc3RlZCBhbmQgaXMgZWZmZWN0aXZlIG9ubHkgd2hlbiB0aGUgY29tbWFuZCBvcGVucyBhIG5ldyB3aW5kb3cuXCIpIH0sXG5cdCdkaXNhYmxlLWV4dGVuc2lvbic6IHsgdHlwZTogJ3N0cmluZ1tdJywgY2F0OiAndCcsIGFyZ3M6ICdleHQtaWQnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2Rpc2FibGVFeHRlbnNpb24nLCBcIkRpc2FibGUgdGhlIHByb3ZpZGVkIGV4dGVuc2lvbi4gVGhpcyBvcHRpb24gaXMgbm90IHBlcnNpc3RlZCBhbmQgaXMgZWZmZWN0aXZlIG9ubHkgd2hlbiB0aGUgY29tbWFuZCBvcGVucyBhIG5ldyB3aW5kb3cuXCIpIH0sXG5cdCdzeW5jJzogeyB0eXBlOiAnc3RyaW5nJywgY2F0OiAndCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndHVybiBzeW5jJywgXCJUdXJuIHN5bmMgb24gb3Igb2ZmLlwiKSwgYXJnczogWydvbiB8IG9mZiddIH0sXG5cblx0J2luc3BlY3QtZXh0ZW5zaW9ucyc6IHsgdHlwZTogJ3N0cmluZycsIGFsbG93RW1wdHlWYWx1ZTogdHJ1ZSwgZGVwcmVjYXRlczogWydkZWJ1Z1BsdWdpbkhvc3QnXSwgYXJnczogJ3BvcnQnLCBjYXQ6ICd0JywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdpbnNwZWN0LWV4dGVuc2lvbnMnLCBcIkFsbG93IGRlYnVnZ2luZyBhbmQgcHJvZmlsaW5nIG9mIGV4dGVuc2lvbnMuIENoZWNrIHRoZSBkZXZlbG9wZXIgdG9vbHMgZm9yIHRoZSBjb25uZWN0aW9uIFVSSS5cIikgfSxcblx0J2luc3BlY3QtYnJrLWV4dGVuc2lvbnMnOiB7IHR5cGU6ICdzdHJpbmcnLCBhbGxvd0VtcHR5VmFsdWU6IHRydWUsIGRlcHJlY2F0ZXM6IFsnZGVidWdCcmtQbHVnaW5Ib3N0J10sIGFyZ3M6ICdwb3J0JywgY2F0OiAndCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnaW5zcGVjdC1icmstZXh0ZW5zaW9ucycsIFwiQWxsb3cgZGVidWdnaW5nIGFuZCBwcm9maWxpbmcgb2YgZXh0ZW5zaW9ucyB3aXRoIHRoZSBleHRlbnNpb24gaG9zdCBiZWluZyBwYXVzZWQgYWZ0ZXIgc3RhcnQuIENoZWNrIHRoZSBkZXZlbG9wZXIgdG9vbHMgZm9yIHRoZSBjb25uZWN0aW9uIFVSSS5cIikgfSxcblx0J2Rpc2FibGUtbGNkLXRleHQnOiB7IHR5cGU6ICdib29sZWFuJywgY2F0OiAndCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZGlzYWJsZUxDRFRleHQnLCBcIkRpc2FibGUgTENEIGZvbnQgcmVuZGVyaW5nLlwiKSB9LFxuXHQnZGlzYWJsZS1ncHUnOiB7IHR5cGU6ICdib29sZWFuJywgY2F0OiAndCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZGlzYWJsZUdQVScsIFwiRGlzYWJsZSBHUFUgaGFyZHdhcmUgYWNjZWxlcmF0aW9uLlwiKSB9LFxuXHQnZGlzYWJsZS1jaHJvbWl1bS1zYW5kYm94JzogeyB0eXBlOiAnYm9vbGVhbicsIGNhdDogJ3QnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2Rpc2FibGVDaHJvbWl1bVNhbmRib3gnLCBcIlVzZSB0aGlzIG9wdGlvbiBvbmx5IHdoZW4gdGhlcmUgaXMgcmVxdWlyZW1lbnQgdG8gbGF1bmNoIHRoZSBhcHBsaWNhdGlvbiBhcyBzdWRvIHVzZXIgb24gTGludXggb3Igd2hlbiBydW5uaW5nIGFzIGFuIGVsZXZhdGVkIHVzZXIgaW4gYW4gYXBwbG9ja2VyIGVudmlyb25tZW50IG9uIFdpbmRvd3MuXCIpIH0sXG5cdCdzYW5kYm94JzogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0J2xvY2F0ZS1zaGVsbC1pbnRlZ3JhdGlvbi1wYXRoJzogeyB0eXBlOiAnc3RyaW5nJywgY2F0OiAndCcsIGFyZ3M6IFsnc2hlbGwnXSwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdsb2NhdGVTaGVsbEludGVncmF0aW9uUGF0aCcsIFwiUHJpbnQgdGhlIHBhdGggdG8gYSB0ZXJtaW5hbCBzaGVsbCBpbnRlZ3JhdGlvbiBzY3JpcHQuIEFsbG93ZWQgdmFsdWVzIGFyZSAnYmFzaCcsICdwd3NoJywgJ3pzaCcgb3IgJ2Zpc2gnLlwiKSB9LFxuXHQndGVsZW1ldHJ5JzogeyB0eXBlOiAnYm9vbGVhbicsIGNhdDogJ3QnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3RlbGVtZXRyeScsIFwiU2hvd3MgYWxsIHRlbGVtZXRyeSBldmVudHMgd2hpY2ggVlMgY29kZSBjb2xsZWN0cy5cIikgfSxcblxuXHQncmVtb3RlJzogeyB0eXBlOiAnc3RyaW5nJywgYWxsb3dFbXB0eVZhbHVlOiB0cnVlIH0sXG5cdCdmb2xkZXItdXJpJzogeyB0eXBlOiAnc3RyaW5nW10nLCBjYXQ6ICdvJywgYXJnczogJ3VyaScgfSxcblx0J2ZpbGUtdXJpJzogeyB0eXBlOiAnc3RyaW5nW10nLCBjYXQ6ICdvJywgYXJnczogJ3VyaScgfSxcblxuXHQnbG9jYXRlLWV4dGVuc2lvbic6IHsgdHlwZTogJ3N0cmluZ1tdJyB9LFxuXHQnZXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRoJzogeyB0eXBlOiAnc3RyaW5nW10nIH0sXG5cdCdleHRlbnNpb25EZXZlbG9wbWVudEtpbmQnOiB7IHR5cGU6ICdzdHJpbmdbXScgfSxcblx0J2V4dGVuc2lvblRlc3RzUGF0aCc6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0J2V4dGVuc2lvbkVudmlyb25tZW50JzogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHQnZGVidWdJZCc6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0J2RlYnVnUmVuZGVyZXInOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHQnaW5zcGVjdC1wdHlob3N0JzogeyB0eXBlOiAnc3RyaW5nJywgYWxsb3dFbXB0eVZhbHVlOiB0cnVlIH0sXG5cdCdpbnNwZWN0LWJyay1wdHlob3N0JzogeyB0eXBlOiAnc3RyaW5nJywgYWxsb3dFbXB0eVZhbHVlOiB0cnVlIH0sXG5cdCdpbnNwZWN0LWFnZW50aG9zdCc6IHsgdHlwZTogJ3N0cmluZycsIGFsbG93RW1wdHlWYWx1ZTogdHJ1ZSB9LFxuXHQnaW5zcGVjdC1icmstYWdlbnRob3N0JzogeyB0eXBlOiAnc3RyaW5nJywgYWxsb3dFbXB0eVZhbHVlOiB0cnVlIH0sXG5cdCdpbnNwZWN0LXNoYXJlZHByb2Nlc3MnOiB7IHR5cGU6ICdzdHJpbmcnLCBhbGxvd0VtcHR5VmFsdWU6IHRydWUgfSxcblx0J2luc3BlY3QtYnJrLXNoYXJlZHByb2Nlc3MnOiB7IHR5cGU6ICdzdHJpbmcnLCBhbGxvd0VtcHR5VmFsdWU6IHRydWUgfSxcblx0J2V4cG9ydC1kZWZhdWx0LWNvbmZpZ3VyYXRpb24nOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdCdleHBvcnQtcG9saWN5LWRhdGEnOiB7IHR5cGU6ICdzdHJpbmcnLCBhbGxvd0VtcHR5VmFsdWU6IHRydWUgfSxcblx0J2V4cG9ydC1kZWZhdWx0LWtleWJpbmRpbmdzJzogeyB0eXBlOiAnc3RyaW5nJywgYWxsb3dFbXB0eVZhbHVlOiB0cnVlIH0sXG5cdCdpbnN0YWxsLXNvdXJjZSc6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0J2VuYWJsZS1zbW9rZS10ZXN0LWRyaXZlcic6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdCdza2lwLXNlc3Npb25zLXdlbGNvbWUnOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHQnbG9nRXh0ZW5zaW9uSG9zdENvbW11bmljYXRpb24nOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHQnc2tpcC1yZWxlYXNlLW5vdGVzJzogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0J3NraXAtd2VsY29tZSc6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdCdkaXNhYmxlLXRlbGVtZXRyeSc6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdCdkaXNhYmxlLXVwZGF0ZXMnOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHQnc2hhcmUtc2VjcmV0cy13aXRoLWFnZW50cy1hcHAnOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHQndHJhbnNpZW50JzogeyB0eXBlOiAnYm9vbGVhbicsIGNhdDogJ3QnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3RyYW5zaWVudCcsIFwiUnVuIHdpdGggdGVtcG9yYXJ5IGRhdGEgYW5kIGV4dGVuc2lvbiBkaXJlY3RvcmllcywgYXMgaWYgbGF1bmNoZWQgZm9yIHRoZSBmaXJzdCB0aW1lLlwiKSB9LFxuXHQndXNlLWlubWVtb3J5LXNlY3JldHN0b3JhZ2UnOiB7IHR5cGU6ICdib29sZWFuJywgZGVwcmVjYXRlczogWydkaXNhYmxlLWtleXRhciddIH0sXG5cdCdwYXNzd29yZC1zdG9yZSc6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0J2Rpc2FibGUtd29ya3NwYWNlLXRydXN0JzogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0J2Rpc2FibGUtY3Jhc2gtcmVwb3J0ZXInOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHQnY3Jhc2gtcmVwb3J0ZXItZGlyZWN0b3J5JzogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHQnY3Jhc2gtcmVwb3J0ZXItaWQnOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdCdza2lwLWFkZC10by1yZWNlbnRseS1vcGVuZWQnOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHQnb3Blbi11cmwnOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHQnZmlsZS13cml0ZSc6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdCdmaWxlLWNobW9kJzogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0J2luc3RhbGwtYnVpbHRpbi1leHRlbnNpb24nOiB7IHR5cGU6ICdzdHJpbmdbXScgfSxcblx0J2ZvcmNlJzogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0J2RvLW5vdC1zeW5jJzogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0J2RvLW5vdC1pbmNsdWRlLXBhY2stZGVwZW5kZW5jaWVzJzogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0J3RyYWNlJzogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0J3RyYWNlLW1lbW9yeS1pbmZyYSc6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdCd0cmFjZS1jYXRlZ29yeS1maWx0ZXInOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdCd0cmFjZS1vcHRpb25zJzogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHQncHJlc2VydmUtZW52JzogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0J2ZvcmNlLXVzZXItZW52JzogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0J2ZvcmNlLWRpc2FibGUtdXNlci1lbnYnOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHQnb3Blbi1kZXZ0b29scyc6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdCdkaXNhYmxlLWdwdS1zYW5kYm94JzogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0J2xvZ3NQYXRoJzogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHQnX19lbmFibGUtZmlsZS1wb2xpY3knOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHQnZWRpdFNlc3Npb25JZCc6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0J2NvbnRpbnVlT24nOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdCdlbmFibGUtY29pJzogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0J3VucmVzcG9uc2l2ZS1zYW1wbGUtaW50ZXJ2YWwnOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdCd1bnJlc3BvbnNpdmUtc2FtcGxlLXBlcmlvZCc6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0J2VuYWJsZS1yZHAtZGlzcGxheS10cmFja2luZyc6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdCdkaXNhYmxlLWxheW91dC1yZXN0b3JlJzogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0J2Rpc2FibGUtZXhwZXJpbWVudHMnOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXG5cdC8vIGNocm9taXVtIGZsYWdzXG5cdCduby1wcm94eS1zZXJ2ZXInOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHQvLyBNaW5pbWlzdCBpbmNvcnJlY3RseSBwYXJzZXMga2V5cyB0aGF0IHN0YXJ0IHdpdGggYC0tbm9gXG5cdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9zdWJzdGFjay9taW5pbWlzdC9ibG9iL2FlYjNlMjdkYWUwNDEyZGU1YzA0OTRlOTU2M2E1ZjEwYzgyY2M3YTkvaW5kZXguanMjTDExOC1MMTIxXG5cdC8vIElmIC0tbm8tc2FuZGJveCBpcyBwYXNzZWQgdmlhIGNsaSB3cmFwcGVyIGl0IHdpbGwgYmUgdHJlYXRlZCBhcyAtLXNhbmRib3ggd2hpY2ggaXMgaW5jb3JyZWN0LCB3ZSB1c2Vcblx0Ly8gdGhlIGFsaWFzIGhlcmUgdG8gbWFrZSBzdXJlIC0tbm8tc2FuZGJveCBpcyBhbHdheXMgcmVzcGVjdGVkLlxuXHQvLyBGb3IgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEyODI3OVxuXHQnbm8tc2FuZGJveCc6IHsgdHlwZTogJ2Jvb2xlYW4nLCBhbGlhczogJ3NhbmRib3gnIH0sXG5cdCdwcm94eS1zZXJ2ZXInOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdCdwcm94eS1ieXBhc3MtbGlzdCc6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0J3Byb3h5LXBhYy11cmwnOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdCdqcy1mbGFncyc6IHsgdHlwZTogJ3N0cmluZycgfSwgLy8gY2hyb21lIGpzIGZsYWdzXG5cdCdpbnNwZWN0JzogeyB0eXBlOiAnc3RyaW5nJywgYWxsb3dFbXB0eVZhbHVlOiB0cnVlIH0sXG5cdCdpbnNwZWN0LWJyayc6IHsgdHlwZTogJ3N0cmluZycsIGFsbG93RW1wdHlWYWx1ZTogdHJ1ZSB9LFxuXHQnbm9sYXp5JzogeyB0eXBlOiAnYm9vbGVhbicgfSwgLy8gbm9kZSBpbnNwZWN0XG5cdCdmb3JjZS1kZXZpY2Utc2NhbGUtZmFjdG9yJzogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHQnZm9yY2UtcmVuZGVyZXItYWNjZXNzaWJpbGl0eSc6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdCdpZ25vcmUtY2VydGlmaWNhdGUtZXJyb3JzJzogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0J2FsbG93LWluc2VjdXJlLWxvY2FsaG9zdCc6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdCdsb2ctbmV0LWxvZyc6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0J3Ztb2R1bGUnOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdCdfdXJscyc6IHsgdHlwZTogJ3N0cmluZ1tdJyB9LFxuXHQnZGlzYWJsZS1kZXYtc2htLXVzYWdlJzogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0J3Byb2ZpbGUtdGVtcCc6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdCdvem9uZS1wbGF0Zm9ybSc6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0J2VuYWJsZS10cmFjaW5nJzogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHQndHJhY2Utc3RhcnR1cC1mb3JtYXQnOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdCd0cmFjZS1zdGFydHVwLWZpbGUnOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdCd0cmFjZS1zdGFydHVwLWR1cmF0aW9uJzogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHQneGRnLXBvcnRhbC1yZXF1aXJlZC12ZXJzaW9uJzogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXG5cdF86IHsgdHlwZTogJ3N0cmluZ1tdJyB9IC8vIG1haW4gYXJndW1lbnRzXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIEVycm9yUmVwb3J0ZXIge1xuXHRvblVua25vd25PcHRpb24oaWQ6IHN0cmluZyk6IHZvaWQ7XG5cdG9uTXVsdGlwbGVWYWx1ZXMoaWQ6IHN0cmluZywgdXNlZFZhbHVlOiBzdHJpbmcpOiB2b2lkO1xuXHRvbkVtcHR5VmFsdWUoaWQ6IHN0cmluZyk6IHZvaWQ7XG5cdG9uRGVwcmVjYXRlZE9wdGlvbihkZXByZWNhdGVkSWQ6IHN0cmluZywgbWVzc2FnZTogc3RyaW5nKTogdm9pZDtcblxuXHRnZXRTdWJjb21tYW5kUmVwb3J0ZXI/KGNvbW1hbmQ6IHN0cmluZyk6IEVycm9yUmVwb3J0ZXI7XG59XG5cbmNvbnN0IGlnbm9yaW5nUmVwb3J0ZXIgPSB7XG5cdG9uVW5rbm93bk9wdGlvbjogKCkgPT4geyB9LFxuXHRvbk11bHRpcGxlVmFsdWVzOiAoKSA9PiB7IH0sXG5cdG9uRW1wdHlWYWx1ZTogKCkgPT4geyB9LFxuXHRvbkRlcHJlY2F0ZWRPcHRpb246ICgpID0+IHsgfVxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlQXJnczxUPihhcmdzOiBzdHJpbmdbXSwgb3B0aW9uczogT3B0aW9uRGVzY3JpcHRpb25zPFQ+LCBlcnJvclJlcG9ydGVyOiBFcnJvclJlcG9ydGVyID0gaWdub3JpbmdSZXBvcnRlcik6IFQge1xuXHQvLyBGaW5kIHRoZSBmaXJzdCBub24tb3B0aW9uIGFyZywgd2hpY2ggYWxzbyBpc24ndCB0aGUgdmFsdWUgZm9yIGEgcHJldmlvdXMgYC0tZmxhZ2Bcblx0Y29uc3QgZmlyc3RQb3NzaWJsZUNvbW1hbmQgPSBhcmdzLmZpbmQoKGEsIGkpID0+IGEubGVuZ3RoID4gMCAmJiBhWzBdICE9PSAnLScgJiYgb3B0aW9ucy5oYXNPd25Qcm9wZXJ0eShhKSAmJiBvcHRpb25zW2EgYXMgVF0udHlwZSA9PT0gJ3N1YmNvbW1hbmQnKTtcblxuXHRjb25zdCBhbGlhczogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfSA9IHt9O1xuXHRjb25zdCBzdHJpbmdPcHRpb25zOiBzdHJpbmdbXSA9IFsnXyddO1xuXHRjb25zdCBib29sZWFuT3B0aW9uczogc3RyaW5nW10gPSBbXTtcblx0Y29uc3QgZ2xvYmFsT3B0aW9uczogUmVjb3JkPHN0cmluZywgT3B0aW9uPCdib29sZWFuJz4gfCBPcHRpb248J3N0cmluZyc+IHwgT3B0aW9uPCdzdHJpbmdbXSc+PiA9IHt9O1xuXHRsZXQgY29tbWFuZDogU3ViY29tbWFuZDxSZWNvcmQ8c3RyaW5nLCB1bmtub3duPj4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGZvciAoY29uc3Qgb3B0aW9uSWQgaW4gb3B0aW9ucykge1xuXHRcdGNvbnN0IG8gPSBvcHRpb25zW29wdGlvbklkXTtcblx0XHRpZiAoby50eXBlID09PSAnc3ViY29tbWFuZCcpIHtcblx0XHRcdGlmIChvcHRpb25JZCA9PT0gZmlyc3RQb3NzaWJsZUNvbW1hbmQpIHtcblx0XHRcdFx0Y29tbWFuZCA9IG87XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChvLmFsaWFzKSB7XG5cdFx0XHRcdGFsaWFzW29wdGlvbklkXSA9IG8uYWxpYXM7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChvLnR5cGUgPT09ICdzdHJpbmcnIHx8IG8udHlwZSA9PT0gJ3N0cmluZ1tdJykge1xuXHRcdFx0XHRzdHJpbmdPcHRpb25zLnB1c2gob3B0aW9uSWQpO1xuXHRcdFx0XHRpZiAoby5kZXByZWNhdGVzKSB7XG5cdFx0XHRcdFx0c3RyaW5nT3B0aW9ucy5wdXNoKC4uLm8uZGVwcmVjYXRlcyk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoby50eXBlID09PSAnYm9vbGVhbicpIHtcblx0XHRcdFx0Ym9vbGVhbk9wdGlvbnMucHVzaChvcHRpb25JZCk7XG5cdFx0XHRcdGlmIChvLmRlcHJlY2F0ZXMpIHtcblx0XHRcdFx0XHRib29sZWFuT3B0aW9ucy5wdXNoKC4uLm8uZGVwcmVjYXRlcyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChvLmdsb2JhbCkge1xuXHRcdFx0XHRnbG9iYWxPcHRpb25zW29wdGlvbklkXSA9IG87XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdGlmIChjb21tYW5kICYmIGZpcnN0UG9zc2libGVDb21tYW5kKSB7XG5cdFx0Y29uc3Qgb3B0aW9uczogUmVjb3JkPHN0cmluZywgT3B0aW9uPCdib29sZWFuJz4gfCBPcHRpb248J3N0cmluZyc+IHwgT3B0aW9uPCdzdHJpbmdbXSc+IHwgU3ViY29tbWFuZDxSZWNvcmQ8c3RyaW5nLCB1bmtub3duPj4+ID0gZ2xvYmFsT3B0aW9ucztcblx0XHRmb3IgKGNvbnN0IG9wdGlvbklkIGluIGNvbW1hbmQub3B0aW9ucykge1xuXHRcdFx0b3B0aW9uc1tvcHRpb25JZF0gPSBjb21tYW5kLm9wdGlvbnNbb3B0aW9uSWRdO1xuXHRcdH1cblx0XHRjb25zdCBuZXdBcmdzID0gYXJncy5maWx0ZXIoYSA9PiBhICE9PSBmaXJzdFBvc3NpYmxlQ29tbWFuZCk7XG5cdFx0Y29uc3QgcmVwb3J0ZXIgPSBlcnJvclJlcG9ydGVyLmdldFN1YmNvbW1hbmRSZXBvcnRlciA/IGVycm9yUmVwb3J0ZXIuZ2V0U3ViY29tbWFuZFJlcG9ydGVyKGZpcnN0UG9zc2libGVDb21tYW5kKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBzdWJjb21tYW5kT3B0aW9ucyA9IHBhcnNlQXJncyhuZXdBcmdzLCBvcHRpb25zIGFzIE9wdGlvbkRlc2NyaXB0aW9uczxSZWNvcmQ8c3RyaW5nLCB1bmtub3duPj4sIHJlcG9ydGVyKTtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1kYW5nZXJvdXMtdHlwZS1hc3NlcnRpb25zXG5cdFx0cmV0dXJuIDxUPntcblx0XHRcdFtmaXJzdFBvc3NpYmxlQ29tbWFuZF06IHN1YmNvbW1hbmRPcHRpb25zLFxuXHRcdFx0XzogW11cblx0XHR9O1xuXHR9XG5cblxuXHQvLyByZW1vdmUgYWxpYXNlcyB0byBhdm9pZCBjb25mdXNpb25cblx0Y29uc3QgcGFyc2VkQXJncyA9IG1pbmltaXN0KGFyZ3MsIHsgc3RyaW5nOiBzdHJpbmdPcHRpb25zLCBib29sZWFuOiBib29sZWFuT3B0aW9ucywgYWxpYXMgfSk7XG5cblx0Y29uc3QgY2xlYW5lZEFyZ3M6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge307XG5cdGNvbnN0IHJlbWFpbmluZ0FyZ3M6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0gcGFyc2VkQXJncztcblxuXHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNTgxNzcsIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMDY2MTdcblx0Y2xlYW5lZEFyZ3MuXyA9IHBhcnNlZEFyZ3MuXy5tYXAoYXJnID0+IFN0cmluZyhhcmcpKS5maWx0ZXIoYXJnID0+IGFyZy5sZW5ndGggPiAwKTtcblxuXHRkZWxldGUgcmVtYWluaW5nQXJncy5fO1xuXG5cdGZvciAoY29uc3Qgb3B0aW9uSWQgaW4gb3B0aW9ucykge1xuXHRcdGNvbnN0IG8gPSBvcHRpb25zW29wdGlvbklkXTtcblx0XHRpZiAoby50eXBlID09PSAnc3ViY29tbWFuZCcpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpZiAoby5hbGlhcykge1xuXHRcdFx0ZGVsZXRlIHJlbWFpbmluZ0FyZ3Nbby5hbGlhc107XG5cdFx0fVxuXG5cdFx0bGV0IHZhbCA9IHJlbWFpbmluZ0FyZ3Nbb3B0aW9uSWRdO1xuXHRcdGlmIChvLmRlcHJlY2F0ZXMpIHtcblx0XHRcdGZvciAoY29uc3QgZGVwcmVjYXRlZElkIG9mIG8uZGVwcmVjYXRlcykge1xuXHRcdFx0XHRpZiAocmVtYWluaW5nQXJncy5oYXNPd25Qcm9wZXJ0eShkZXByZWNhdGVkSWQpKSB7XG5cdFx0XHRcdFx0aWYgKCF2YWwpIHtcblx0XHRcdFx0XHRcdHZhbCA9IHJlbWFpbmluZ0FyZ3NbZGVwcmVjYXRlZElkXTtcblx0XHRcdFx0XHRcdGlmICh2YWwpIHtcblx0XHRcdFx0XHRcdFx0ZXJyb3JSZXBvcnRlci5vbkRlcHJlY2F0ZWRPcHRpb24oZGVwcmVjYXRlZElkLCBvLmRlcHJlY2F0aW9uTWVzc2FnZSB8fCBsb2NhbGl6ZSgnZGVwcmVjYXRlZC51c2VJbnN0ZWFkJywgJ1VzZSB7MH0gaW5zdGVhZC4nLCBvcHRpb25JZCkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRkZWxldGUgcmVtYWluaW5nQXJnc1tkZXByZWNhdGVkSWRdO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiB2YWwgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRpZiAoby50eXBlID09PSAnc3RyaW5nW10nKSB7XG5cdFx0XHRcdGlmICghQXJyYXkuaXNBcnJheSh2YWwpKSB7XG5cdFx0XHRcdFx0dmFsID0gW3ZhbF07XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFvLmFsbG93RW1wdHlWYWx1ZSkge1xuXHRcdFx0XHRcdGNvbnN0IHNhbml0aXplZCA9ICh2YWwgYXMgc3RyaW5nW10pLmZpbHRlcigodjogc3RyaW5nKSA9PiB2Lmxlbmd0aCA+IDApO1xuXHRcdFx0XHRcdGlmIChzYW5pdGl6ZWQubGVuZ3RoICE9PSAodmFsIGFzIHN0cmluZ1tdKS5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdGVycm9yUmVwb3J0ZXIub25FbXB0eVZhbHVlKG9wdGlvbklkKTtcblx0XHRcdFx0XHRcdHZhbCA9IHNhbml0aXplZC5sZW5ndGggPiAwID8gc2FuaXRpemVkIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChvLnR5cGUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGlmIChBcnJheS5pc0FycmF5KHZhbCkpIHtcblx0XHRcdFx0XHR2YWwgPSB2YWwucG9wKCk7IC8vIHRha2UgdGhlIGxhc3Rcblx0XHRcdFx0XHRlcnJvclJlcG9ydGVyLm9uTXVsdGlwbGVWYWx1ZXMob3B0aW9uSWQsIHZhbCBhcyBzdHJpbmcpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKCF2YWwgJiYgIW8uYWxsb3dFbXB0eVZhbHVlKSB7XG5cdFx0XHRcdFx0ZXJyb3JSZXBvcnRlci5vbkVtcHR5VmFsdWUob3B0aW9uSWQpO1xuXHRcdFx0XHRcdHZhbCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y2xlYW5lZEFyZ3Nbb3B0aW9uSWRdID0gdmFsO1xuXG5cdFx0XHRpZiAoby5kZXByZWNhdGlvbk1lc3NhZ2UpIHtcblx0XHRcdFx0ZXJyb3JSZXBvcnRlci5vbkRlcHJlY2F0ZWRPcHRpb24ob3B0aW9uSWQsIG8uZGVwcmVjYXRpb25NZXNzYWdlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0ZGVsZXRlIHJlbWFpbmluZ0FyZ3Nbb3B0aW9uSWRdO1xuXHR9XG5cblx0Zm9yIChjb25zdCBrZXkgaW4gcmVtYWluaW5nQXJncykge1xuXHRcdGVycm9yUmVwb3J0ZXIub25Vbmtub3duT3B0aW9uKGtleSk7XG5cdH1cblxuXHRyZXR1cm4gY2xlYW5lZEFyZ3MgYXMgVDtcbn1cblxuZnVuY3Rpb24gZm9ybWF0VXNhZ2Uob3B0aW9uSWQ6IHN0cmluZywgb3B0aW9uOiBPcHRpb248J2Jvb2xlYW4nPiB8IE9wdGlvbjwnc3RyaW5nJz4gfCBPcHRpb248J3N0cmluZ1tdJz4pIHtcblx0bGV0IGFyZ3MgPSAnJztcblx0aWYgKG9wdGlvbi5hcmdzKSB7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkob3B0aW9uLmFyZ3MpKSB7XG5cdFx0XHRhcmdzID0gYCA8JHtvcHRpb24uYXJncy5qb2luKCc+IDwnKX0+YDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXJncyA9IGAgPCR7b3B0aW9uLmFyZ3N9PmA7XG5cdFx0fVxuXHR9XG5cdGlmIChvcHRpb24uYWxpYXMpIHtcblx0XHRyZXR1cm4gYC0ke29wdGlvbi5hbGlhc30gLS0ke29wdGlvbklkfSR7YXJnc31gO1xuXHR9XG5cdHJldHVybiBgLS0ke29wdGlvbklkfSR7YXJnc31gO1xufVxuXG4vLyBleHBvcnRlZCBvbmx5IGZvciB0ZXN0aW5nXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0T3B0aW9ucyhvcHRpb25zOiBPcHRpb25EZXNjcmlwdGlvbnM8dW5rbm93bj4gfCBSZWNvcmQ8c3RyaW5nLCBPcHRpb248J2Jvb2xlYW4nPiB8IE9wdGlvbjwnc3RyaW5nJz4gfCBPcHRpb248J3N0cmluZ1tdJz4+LCBjb2x1bW5zOiBudW1iZXIpOiBzdHJpbmdbXSB7XG5cdGNvbnN0IHVzYWdlVGV4dHM6IFtzdHJpbmcsIHN0cmluZ11bXSA9IFtdO1xuXHRmb3IgKGNvbnN0IG9wdGlvbklkIGluIG9wdGlvbnMpIHtcblx0XHRjb25zdCBvID0gb3B0aW9uc1tvcHRpb25JZCBhcyBrZXlvZiB0eXBlb2Ygb3B0aW9uc10gYXMgT3B0aW9uPCdib29sZWFuJz4gfCBPcHRpb248J3N0cmluZyc+IHwgT3B0aW9uPCdzdHJpbmdbXSc+O1xuXHRcdGNvbnN0IHVzYWdlVGV4dCA9IGZvcm1hdFVzYWdlKG9wdGlvbklkLCBvKTtcblx0XHR1c2FnZVRleHRzLnB1c2goW3VzYWdlVGV4dCwgby5kZXNjcmlwdGlvbiFdKTtcblx0fVxuXHRyZXR1cm4gZm9ybWF0VXNhZ2VUZXh0cyh1c2FnZVRleHRzLCBjb2x1bW5zKTtcbn1cblxuZnVuY3Rpb24gZm9ybWF0VXNhZ2VUZXh0cyh1c2FnZVRleHRzOiBbc3RyaW5nLCBzdHJpbmddW10sIGNvbHVtbnM6IG51bWJlcikge1xuXHRjb25zdCBtYXhMZW5ndGggPSB1c2FnZVRleHRzLnJlZHVjZSgocHJldmlvdXMsIGUpID0+IE1hdGgubWF4KHByZXZpb3VzLCBlWzBdLmxlbmd0aCksIDEyKTtcblx0Y29uc3QgYXJnTGVuZ3RoID0gbWF4TGVuZ3RoICsgMi8qbGVmdCBwYWRkaW5nKi8gKyAxLypyaWdodCBwYWRkaW5nKi87XG5cdGlmIChjb2x1bW5zIC0gYXJnTGVuZ3RoIDwgMjUpIHtcblx0XHQvLyBVc2UgYSBjb25kZW5zZWQgdmVyc2lvbiBvbiBuYXJyb3cgdGVybWluYWxzXG5cdFx0cmV0dXJuIHVzYWdlVGV4dHMucmVkdWNlPHN0cmluZ1tdPigociwgdXQpID0+IHIuY29uY2F0KFtgICAke3V0WzBdfWAsIGAgICAgICAke3V0WzFdfWBdKSwgW10pO1xuXHR9XG5cdGNvbnN0IGRlc2NyaXB0aW9uQ29sdW1ucyA9IGNvbHVtbnMgLSBhcmdMZW5ndGggLSAxO1xuXHRjb25zdCByZXN1bHQ6IHN0cmluZ1tdID0gW107XG5cdGZvciAoY29uc3QgdXQgb2YgdXNhZ2VUZXh0cykge1xuXHRcdGNvbnN0IHVzYWdlID0gdXRbMF07XG5cdFx0Y29uc3Qgd3JhcHBlZERlc2NyaXB0aW9uID0gd3JhcFRleHQodXRbMV0sIGRlc2NyaXB0aW9uQ29sdW1ucyk7XG5cdFx0Y29uc3Qga2V5UGFkZGluZyA9IGluZGVudChhcmdMZW5ndGggLSB1c2FnZS5sZW5ndGggLSAyLypsZWZ0IHBhZGRpbmcqLyk7XG5cdFx0cmVzdWx0LnB1c2goJyAgJyArIHVzYWdlICsga2V5UGFkZGluZyArIHdyYXBwZWREZXNjcmlwdGlvblswXSk7XG5cdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCB3cmFwcGVkRGVzY3JpcHRpb24ubGVuZ3RoOyBpKyspIHtcblx0XHRcdHJlc3VsdC5wdXNoKGluZGVudChhcmdMZW5ndGgpICsgd3JhcHBlZERlc2NyaXB0aW9uW2ldKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gaW5kZW50KGNvdW50OiBudW1iZXIpOiBzdHJpbmcge1xuXHRyZXR1cm4gJyAnLnJlcGVhdChjb3VudCk7XG59XG5cbmZ1bmN0aW9uIHdyYXBUZXh0KHRleHQ6IHN0cmluZywgY29sdW1uczogbnVtYmVyKTogc3RyaW5nW10ge1xuXHRjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXTtcblx0d2hpbGUgKHRleHQubGVuZ3RoKSB7XG5cdFx0bGV0IGluZGV4ID0gdGV4dC5sZW5ndGggPCBjb2x1bW5zID8gdGV4dC5sZW5ndGggOiB0ZXh0Lmxhc3RJbmRleE9mKCcgJywgY29sdW1ucyk7XG5cdFx0aWYgKGluZGV4ID09PSAwKSB7XG5cdFx0XHRpbmRleCA9IGNvbHVtbnM7XG5cdFx0fVxuXHRcdGNvbnN0IGxpbmUgPSB0ZXh0LnNsaWNlKDAsIGluZGV4KS50cmltKCk7XG5cdFx0dGV4dCA9IHRleHQuc2xpY2UoaW5kZXgpLnRyaW1TdGFydCgpO1xuXHRcdGxpbmVzLnB1c2gobGluZSk7XG5cdH1cblx0cmV0dXJuIGxpbmVzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRIZWxwTWVzc2FnZShwcm9kdWN0TmFtZTogc3RyaW5nLCBleGVjdXRhYmxlTmFtZTogc3RyaW5nLCB2ZXJzaW9uOiBzdHJpbmcsIG9wdGlvbnM6IE9wdGlvbkRlc2NyaXB0aW9uczx1bmtub3duPiB8IFJlY29yZDxzdHJpbmcsIE9wdGlvbjwnYm9vbGVhbic+IHwgT3B0aW9uPCdzdHJpbmcnPiB8IE9wdGlvbjwnc3RyaW5nW10nPiB8IFN1YmNvbW1hbmQ8UmVjb3JkPHN0cmluZywgdW5rbm93bj4+PiwgY2FwYWJpbGl0aWVzPzogeyBub1BpcGU/OiBib29sZWFuOyBub0lucHV0RmlsZXM/OiBib29sZWFuOyBpc0NoYXQ/OiBib29sZWFuIH0pOiBzdHJpbmcge1xuXHRjb25zdCBjb2x1bW5zID0gKHByb2Nlc3Muc3Rkb3V0KS5pc1RUWSAmJiAocHJvY2Vzcy5zdGRvdXQpLmNvbHVtbnMgfHwgODA7XG5cdGNvbnN0IGlucHV0RmlsZXMgPSBjYXBhYmlsaXRpZXM/Lm5vSW5wdXRGaWxlcyA/ICcnIDogY2FwYWJpbGl0aWVzPy5pc0NoYXQgPyBgIFske2xvY2FsaXplKCdjbGlQcm9tcHQnLCAncHJvbXB0Jyl9XWAgOiBgIFske2xvY2FsaXplKCdwYXRocycsICdwYXRocycpfS4uLl1gO1xuXHRjb25zdCBzdWJjb21tYW5kID0gY2FwYWJpbGl0aWVzPy5pc0NoYXQgPyAnIGNoYXQnIDogJyc7XG5cblx0Y29uc3QgaGVscCA9IFtgJHtwcm9kdWN0TmFtZX0gJHt2ZXJzaW9ufWBdO1xuXHRoZWxwLnB1c2goJycpO1xuXHRoZWxwLnB1c2goYCR7bG9jYWxpemUoJ3VzYWdlJywgXCJVc2FnZVwiKX06ICR7ZXhlY3V0YWJsZU5hbWV9JHtzdWJjb21tYW5kfSBbJHtsb2NhbGl6ZSgnb3B0aW9ucycsIFwib3B0aW9uc1wiKX1dJHtpbnB1dEZpbGVzfWApO1xuXHRoZWxwLnB1c2goJycpO1xuXHRpZiAoY2FwYWJpbGl0aWVzPy5ub1BpcGUgIT09IHRydWUpIHtcblx0XHRoZWxwLnB1c2goYnVpbGRTdGRpbk1lc3NhZ2UoZXhlY3V0YWJsZU5hbWUsIGNhcGFiaWxpdGllcz8uaXNDaGF0KSk7XG5cdFx0aGVscC5wdXNoKCcnKTtcblx0fVxuXHRjb25zdCBvcHRpb25zQnlDYXRlZ29yeTogeyBbUCBpbiBrZXlvZiB0eXBlb2YgaGVscENhdGVnb3JpZXNdPzogUmVjb3JkPHN0cmluZywgT3B0aW9uPCdib29sZWFuJz4gfCBPcHRpb248J3N0cmluZyc+IHwgT3B0aW9uPCdzdHJpbmdbXSc+PiB9ID0ge307XG5cdGNvbnN0IHN1YmNvbW1hbmRzOiB7IGNvbW1hbmQ6IHN0cmluZzsgZGVzY3JpcHRpb246IHN0cmluZyB9W10gPSBbXTtcblx0Zm9yIChjb25zdCBvcHRpb25JZCBpbiBvcHRpb25zKSB7XG5cdFx0Y29uc3QgbyA9IG9wdGlvbnNbb3B0aW9uSWQgYXMga2V5b2YgdHlwZW9mIG9wdGlvbnNdIGFzIE9wdGlvbjwnYm9vbGVhbic+IHwgT3B0aW9uPCdzdHJpbmcnPiB8IE9wdGlvbjwnc3RyaW5nW10nPiB8IFN1YmNvbW1hbmQ8UmVjb3JkPHN0cmluZywgdW5rbm93bj4+O1xuXHRcdGlmIChvLnR5cGUgPT09ICdzdWJjb21tYW5kJykge1xuXHRcdFx0aWYgKG8uZGVzY3JpcHRpb24pIHtcblx0XHRcdFx0c3ViY29tbWFuZHMucHVzaCh7IGNvbW1hbmQ6IG9wdGlvbklkLCBkZXNjcmlwdGlvbjogby5kZXNjcmlwdGlvbiB9KTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKG8uZGVzY3JpcHRpb24gJiYgby5jYXQpIHtcblx0XHRcdGNvbnN0IGNhdCA9IG8uY2F0O1xuXHRcdFx0bGV0IG9wdGlvbnNCeUNhdCA9IG9wdGlvbnNCeUNhdGVnb3J5W2NhdF07XG5cdFx0XHRpZiAoIW9wdGlvbnNCeUNhdCkge1xuXHRcdFx0XHRvcHRpb25zQnlDYXRlZ29yeVtjYXRdID0gb3B0aW9uc0J5Q2F0ID0ge307XG5cdFx0XHR9XG5cdFx0XHRvcHRpb25zQnlDYXRbb3B0aW9uSWRdID0gbztcblx0XHR9XG5cdH1cblxuXHRmb3IgKGNvbnN0IGhlbHBDYXRlZ29yeUtleSBpbiBvcHRpb25zQnlDYXRlZ29yeSkge1xuXHRcdGNvbnN0IGtleSA9IDxrZXlvZiB0eXBlb2YgaGVscENhdGVnb3JpZXM+aGVscENhdGVnb3J5S2V5O1xuXG5cdFx0Y29uc3QgY2F0ZWdvcnlPcHRpb25zID0gb3B0aW9uc0J5Q2F0ZWdvcnlba2V5XTtcblx0XHRpZiAoY2F0ZWdvcnlPcHRpb25zKSB7XG5cdFx0XHRoZWxwLnB1c2goaGVscENhdGVnb3JpZXNba2V5XSk7XG5cdFx0XHRoZWxwLnB1c2goLi4uZm9ybWF0T3B0aW9ucyhjYXRlZ29yeU9wdGlvbnMsIGNvbHVtbnMpKTtcblx0XHRcdGhlbHAucHVzaCgnJyk7XG5cdFx0fVxuXHR9XG5cblx0aWYgKHN1YmNvbW1hbmRzLmxlbmd0aCkge1xuXHRcdGhlbHAucHVzaChsb2NhbGl6ZSgnc3ViY29tbWFuZHMnLCBcIlN1YmNvbW1hbmRzXCIpKTtcblx0XHRoZWxwLnB1c2goLi4uZm9ybWF0VXNhZ2VUZXh0cyhzdWJjb21tYW5kcy5tYXAocyA9PiBbcy5jb21tYW5kLCBzLmRlc2NyaXB0aW9uXSksIGNvbHVtbnMpKTtcblx0XHRoZWxwLnB1c2goJycpO1xuXHR9XG5cblx0cmV0dXJuIGhlbHAuam9pbignXFxuJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBidWlsZFN0ZGluTWVzc2FnZShleGVjdXRhYmxlTmFtZTogc3RyaW5nLCBpc0NoYXQ/OiBib29sZWFuKTogc3RyaW5nIHtcblx0bGV0IGV4YW1wbGU6IHN0cmluZztcblx0aWYgKGlzV2luZG93cykge1xuXHRcdGlmIChpc0NoYXQpIHtcblx0XHRcdGV4YW1wbGUgPSBgZWNobyBIZWxsbyBXb3JsZCB8ICR7ZXhlY3V0YWJsZU5hbWV9IGNoYXQgPHByb21wdD4gLWA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGV4YW1wbGUgPSBgZWNobyBIZWxsbyBXb3JsZCB8ICR7ZXhlY3V0YWJsZU5hbWV9IC1gO1xuXHRcdH1cblx0fSBlbHNlIHtcblx0XHRpZiAoaXNDaGF0KSB7XG5cdFx0XHRleGFtcGxlID0gYHBzIGF1eCB8IGdyZXAgY29kZSB8ICR7ZXhlY3V0YWJsZU5hbWV9IGNoYXQgPHByb21wdD4gLWA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGV4YW1wbGUgPSBgcHMgYXV4IHwgZ3JlcCBjb2RlIHwgJHtleGVjdXRhYmxlTmFtZX0gLWA7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGxvY2FsaXplKCdzdGRpblVzYWdlJywgXCJUbyByZWFkIGZyb20gc3RkaW4sIGFwcGVuZCAnLScgKGUuZy4gJ3swfScpXCIsIGV4YW1wbGUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRWZXJzaW9uTWVzc2FnZSh2ZXJzaW9uOiBzdHJpbmcgfCB1bmRlZmluZWQsIGNvbW1pdDogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0cmV0dXJuIGAke3ZlcnNpb24gfHwgbG9jYWxpemUoJ3Vua25vd25WZXJzaW9uJywgXCJVbmtub3duIHZlcnNpb25cIil9XFxuJHtjb21taXQgfHwgbG9jYWxpemUoJ3Vua25vd25Db21taXQnLCBcIlVua25vd24gY29tbWl0XCIpfVxcbiR7cHJvY2Vzcy5hcmNofWA7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLGNBQWM7QUFDckIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQkFBZ0I7QUFNekIsTUFBTSxpQkFBaUI7QUFBQSxFQUN0QixHQUFHLFNBQVMsb0JBQW9CLFNBQVM7QUFBQSxFQUN6QyxHQUFHLFNBQVMsd0JBQXdCLHVCQUF1QjtBQUFBLEVBQzNELEdBQUcsU0FBUyxtQkFBbUIsaUJBQWlCO0FBQUEsRUFDaEQsR0FBRyxTQUFTLE9BQU8sd0JBQXdCO0FBQzVDO0FBNkJPLE1BQU0sc0JBQXNCLENBQUMsVUFBVSxhQUFhLE9BQU87QUFFM0QsTUFBTSxVQUEwRDtBQUFBLEVBQ3RFLFFBQVE7QUFBQSxJQUNQLE1BQU07QUFB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
