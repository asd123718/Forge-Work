import * as fs from "fs";
import { Disposable, toDisposable } from "../../../base/common/lifecycle.js";
import { FileAccess } from "../../../base/common/network.js";
import { escapeRegExpCharacters, regExpLeadsToEndlessLoop } from "../../../base/common/strings.js";
import { URI } from "../../../base/common/uri.js";
import { getAppNodeModulesPath } from "./appNodeModules.js";
import { shouldRequireConfirmationForAutoApproveParse } from "../../terminal/common/autoApprove/autoApproveParseSafety.js";
import { gitAutoApproveRules } from "../../terminal/common/autoApprove/gitAutoApproveRules.js";
import { powershellAutoApproveRules } from "../../terminal/common/autoApprove/powershellAutoApproveRules.js";
import { SedFileWriteParser } from "../../terminal/common/autoApprove/sedFileWriteParser.js";
import { sortAutoApproveRules } from "../../terminal/common/autoApprove/sortAutoApproveRules.js";
const SAFE_POSIX_REDIRECT_TARGETS = /* @__PURE__ */ new Set([
  "/dev/null",
  "/dev/stdout",
  "/dev/stderr",
  "/dev/tty"
]);
function isSafeRedirectDestination(dest, isPowerShell) {
  let cleaned = dest.trim();
  if (cleaned.length === 0) {
    return false;
  }
  if (isPowerShell && cleaned.toLowerCase() === "$null") {
    return true;
  }
  if (cleaned.startsWith(`'`) && cleaned.endsWith(`'`) || cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1);
  }
  if (/^&[0-9]+-?$/.test(cleaned)) {
    return true;
  }
  return !isPowerShell && SAFE_POSIX_REDIRECT_TARGETS.has(cleaned);
}
function classifyFileRedirect(redirectText, isPowerShell) {
  if (!redirectText.includes(">")) {
    return { kind: "read" };
  }
  const destMatch = redirectText.match(/(?:[0-9]+|&|\*)?>>?\|?\s*(.+)$/);
  if (!destMatch) {
    return { kind: "unsafeWrite", dest: void 0 };
  }
  const rawDest = destMatch[1].trim();
  if (isSafeRedirectDestination(rawDest, isPowerShell)) {
    return { kind: "safeWrite" };
  }
  let dest = rawDest;
  if (dest.startsWith(`'`) && dest.endsWith(`'`) || dest.startsWith('"') && dest.endsWith('"')) {
    dest = dest.slice(1, -1);
  }
  return { kind: "unsafeWrite", dest };
}
const pwshFlagEqualsRegex = /(^|\s)(-{1,2}[\w-]+)=/g;
function maskPwshFlagEquals(commandLine) {
  return commandLine.replace(pwshFlagEqualsRegex, (_, pre, flag) => `${pre}${flag} `);
}
const pwshNoSpaceRedirectRegex = /^[0-9*]?>>?/;
const neverMatchRegex = /(?!.*)/;
const transientEnvVarRegex = /^[A-Z_][A-Z0-9_]*=/i;
const sedFileWriteParser = new SedFileWriteParser();
let treeSitterResourcesPromise;
function getTreeSitterResources() {
  return treeSitterResourcesPromise ??= loadTreeSitterResources();
}
async function loadTreeSitterResources() {
  const { default: TreeSitter } = await import("@vscode/tree-sitter-wasm");
  const moduleRoot = URI.joinPath(FileAccess.asFileUri(getAppNodeModulesPath()), "@vscode", "tree-sitter-wasm", "wasm");
  const wasmPath = URI.joinPath(moduleRoot, "tree-sitter.wasm").fsPath;
  await TreeSitter.Parser.init({
    locateFile() {
      return wasmPath;
    }
  });
  const loadGrammar = async (fileName) => {
    const grammarWasm = await fs.promises.readFile(URI.joinPath(moduleRoot, fileName).fsPath);
    return TreeSitter.Language.load(new Uint8Array(grammarWasm.buffer, grammarWasm.byteOffset, grammarWasm.byteLength));
  };
  const [bashLanguage, powershellLanguage] = await Promise.allSettled([
    loadGrammar("tree-sitter-bash.wasm"),
    loadGrammar("tree-sitter-powershell.wasm")
  ]);
  return {
    parserClass: TreeSitter.Parser,
    queryClass: TreeSitter.Query,
    bashLanguage,
    powershellLanguage
  };
}
class CommandAutoApprover extends Disposable {
  constructor(_logService) {
    super();
    this._logService = _logService;
    this._initPromise = this._initTreeSitter();
  }
  /**
   * Returns a promise that resolves once tree-sitter WASM has been loaded.
   * Await this before processing any events to guarantee that
   * {@link shouldAutoApprove} can parse commands synchronously.
   */
  initialize() {
    return this._initPromise;
  }
  /**
   * Synchronously check whether the given command line should be auto-approved.
   * Uses tree-sitter (if loaded) to parse compound commands into sub-commands.
   *
   * When the command contains write redirections, `options.isWriteDestApproved`
   * is consulted for each destination. If every destination is approved by the
   * predicate, write redirections do not block auto-approval.
   */
  shouldAutoApprove(commandLine, options) {
    return this.evaluate(commandLine, options).result;
  }
  /** Evaluates the command and reports whether adding a persistent allow rule could resolve the result. */
  evaluate(commandLine, options) {
    const trimmed = commandLine.trimStart();
    if (trimmed.length === 0) {
      return { result: "approved", autoApproveRuleResolvable: false };
    }
    const rules = this._compileRules(options?.autoApproveRules);
    const isPowerShell = options?.language === "powershell";
    if (this._matchesCommandLineRule(trimmed, rules.denyCommandLineRules)) {
      return { result: "denied", autoApproveRuleResolvable: false };
    }
    const parsed = this._extractSubCommands(trimmed, isPowerShell);
    if (!parsed) {
      this._logService.trace("[CommandAutoApprover] Command line could not be analyzed, requiring confirmation");
      return { result: "noMatch", autoApproveRuleResolvable: false };
    }
    const hasUnapprovedRedirect = () => parsed.unsafeWriteDests.some((dest) => dest === void 0 || !options?.isWriteDestApproved?.(dest));
    let result = this._matchSubCommands(parsed.subCommands, rules, isPowerShell);
    if (result !== "denied" && this._matchesCommandLineRule(trimmed, rules.allowCommandLineRules)) {
      result = "approved";
    }
    if (result === "approved" && hasUnapprovedRedirect()) {
      this._logService.trace("[CommandAutoApprover] Write redirection to non-approved destination, requiring confirmation");
      return { result: "noMatch", autoApproveRuleResolvable: false };
    }
    return { result, autoApproveRuleResolvable: result === "noMatch" && !hasUnapprovedRedirect() };
  }
  _matchSubCommands(subCommands, rules, isPowerShell) {
    let allApproved = true;
    for (const subCommand of subCommands) {
      if (sedFileWriteParser.canHandle(subCommand)) {
        return "denied";
      }
      if (transientEnvVarRegex.test(subCommand)) {
        return "denied";
      }
      const result = this._matchSingleCommand(subCommand, rules, isPowerShell);
      if (result === "denied") {
        return "denied";
      }
      if (result !== "approved") {
        allApproved = false;
      }
    }
    return allApproved ? "approved" : "noMatch";
  }
  _matchSingleCommand(command, rules, isPowerShell) {
    if (this._matchesRule(command, rules.denyRules, isPowerShell)) {
      return "denied";
    }
    if (this._matchesRule(command, rules.allowRules, isPowerShell)) {
      return "approved";
    }
    return "noMatch";
  }
  _matchesCommandLineRule(commandLine, rules) {
    return rules.some((rule) => rule.regex.test(commandLine));
  }
  _matchesRule(command, rules, isPowerShell) {
    for (const rule of rules) {
      if ((isPowerShell ? rule.regexCaseInsensitive : rule.regex).test(command)) {
        return true;
      }
      if (isPowerShell && command.startsWith("(") && rule.regexCaseInsensitive.test(command.slice(1))) {
        return true;
      }
    }
    return false;
  }
  // ---- Tree-sitter --------------------------------------------------------
  _extractSubCommands(commandLine, isPowerShell) {
    const language = isPowerShell ? this._powershellLanguage : this._bashLanguage;
    if (!this._parser || !language || !this._queryClass) {
      return void 0;
    }
    try {
      this._parser.setLanguage(language);
      const masked = isPowerShell ? maskPwshFlagEquals(commandLine) : commandLine;
      const tree = this._parser.parse(masked);
      if (!tree) {
        return void 0;
      }
      try {
        if (shouldRequireConfirmationForAutoApproveParse(isPowerShell ? "powershell" : "bash", tree.rootNode.hasError)) {
          this._logService.trace("[CommandAutoApprover] PowerShell parse contains errors, requiring confirmation");
          return void 0;
        }
        const query = new this._queryClass(language, isPowerShell ? "(command) @command (redirection) @redirection (generic_token) @generic_token (assignment_expression) @unanalyzable (invokation_expression) @unanalyzable" : "(command) @command (file_redirect) @file_redirect (heredoc_redirect) @heredoc_redirect (herestring_redirect) @herestring_redirect (variable_assignment) @unanalyzable (declaration_command) @unanalyzable");
        const captures = query.captures(tree.rootNode);
        const subCommands = [];
        const unsafeWriteDests = [];
        let unanalyzableType;
        for (const capture of captures) {
          const text = masked === commandLine ? capture.node.text : commandLine.substring(capture.node.startIndex, capture.node.endIndex);
          if (capture.name === "command") {
            subCommands.push(text);
          } else if (capture.name === "unanalyzable" && (capture.node.type !== "variable_assignment" || capture.node.parent?.type !== "command")) {
            unanalyzableType ??= capture.node.type;
          } else if (capture.name === "file_redirect" || capture.name === "redirection" || capture.name === "generic_token" && pwshNoSpaceRedirectRegex.test(text)) {
            const cls = classifyFileRedirect(text, isPowerShell);
            if (cls.kind === "unsafeWrite") {
              unsafeWriteDests.push(cls.dest);
            }
          } else if (capture.name === "heredoc_redirect" || capture.name === "herestring_redirect") {
          }
        }
        query.delete();
        if (unanalyzableType) {
          this._logService.trace(`[CommandAutoApprover] Command line contains an unanalyzable ${unanalyzableType}, requiring confirmation`);
          return void 0;
        }
        return subCommands.length > 0 || unsafeWriteDests.length > 0 ? { subCommands, unsafeWriteDests } : void 0;
      } finally {
        tree.delete();
      }
    } catch (err) {
      this._logService.warn("[CommandAutoApprover] Tree-sitter parsing failed", err);
      return void 0;
    }
  }
  async _initTreeSitter() {
    try {
      const resources = await getTreeSitterResources();
      if (this._store.isDisposed) {
        return;
      }
      const parser = new resources.parserClass();
      this._register(toDisposable(() => {
        try {
          parser.delete();
        } catch {
        }
      }));
      this._parser = parser;
      this._queryClass = resources.queryClass;
      if (resources.bashLanguage.status === "fulfilled") {
        this._bashLanguage = resources.bashLanguage.value;
      } else {
        this._logService.warn("[CommandAutoApprover] Failed to load the bash grammar; bash commands will require confirmation", resources.bashLanguage.reason);
      }
      if (resources.powershellLanguage.status === "fulfilled") {
        this._powershellLanguage = resources.powershellLanguage.value;
      } else {
        this._logService.warn("[CommandAutoApprover] Failed to load the PowerShell grammar; PowerShell commands will require confirmation", resources.powershellLanguage.reason);
      }
      this._logService.info(`[CommandAutoApprover] Tree-sitter initialized (bash=${this._bashLanguage ? "available" : "unavailable"}, powershell=${this._powershellLanguage ? "available" : "unavailable"})`);
    } catch (err) {
      this._logService.warn("[CommandAutoApprover] Failed to initialize tree-sitter", err);
    }
  }
  // ---- Rules --------------------------------------------------------------
  _compileRules(ruleConfig) {
    if (!ruleConfig) {
      if (!this._fallbackRules) {
        this._fallbackRules = this._compileRuleEntries(DEFAULT_TERMINAL_AUTO_APPROVE_RULES);
      }
      return this._fallbackRules;
    }
    if (this._cachedRuleConfig === ruleConfig && this._cachedRules) {
      return this._cachedRules;
    }
    this._cachedRuleConfig = ruleConfig;
    this._cachedRules = this._compileRuleEntries(ruleConfig);
    return this._cachedRules;
  }
  _compileRuleEntries(ruleConfig) {
    const allowRules = [];
    const denyRules = [];
    const allowCommandLineRules = [];
    const denyCommandLineRules = [];
    for (const [key, value] of Object.entries(ruleConfig)) {
      const regex = convertAutoApproveEntryToRegex(key);
      const rule = {
        regex,
        regexCaseInsensitive: regex.flags.includes("i") ? regex : new RegExp(regex.source, regex.flags + "i")
      };
      if (value === true) {
        allowRules.push(rule);
      } else if (value === false) {
        denyRules.push(rule);
      } else if (value && typeof value === "object" && typeof value.approve === "boolean") {
        if (value.approve) {
          if (value.matchCommandLine === true) {
            allowCommandLineRules.push(rule);
          } else {
            allowRules.push(rule);
          }
        } else {
          if (value.matchCommandLine === true) {
            denyCommandLineRules.push(rule);
          } else {
            denyRules.push(rule);
          }
        }
      }
    }
    return { allowRules, denyRules, allowCommandLineRules, denyCommandLineRules };
  }
}
function convertAutoApproveEntryToRegex(value) {
  const regexMatch = value.match(/^\/(?<pattern>.+)\/(?<flags>[dgimsuvy]*)$/);
  const regexPattern = regexMatch?.groups?.pattern;
  if (regexPattern) {
    let flags = regexMatch.groups?.flags;
    if (flags) {
      flags = flags.replaceAll("g", "");
    }
    if (regexPattern === ".*") {
      return new RegExp(regexPattern);
    }
    try {
      const regex = new RegExp(regexPattern, flags || void 0);
      if (regExpLeadsToEndlessLoop(regex)) {
        return neverMatchRegex;
      }
      return regex;
    } catch {
      return neverMatchRegex;
    }
  }
  if (value === "") {
    return neverMatchRegex;
  }
  let sanitizedValue;
  if (value.includes("/") || value.includes("\\")) {
    let pattern = value.replace(/[/\\]/g, "%%PATH_SEP%%");
    pattern = escapeRegExpCharacters(pattern);
    pattern = pattern.replace(/%%PATH_SEP%%*/g, "[/\\\\]");
    sanitizedValue = `^(?:\\.[/\\\\])?${pattern}`;
  } else {
    sanitizedValue = escapeRegExpCharacters(value);
  }
  return new RegExp(`^${sanitizedValue}\\b`);
}
const DEFAULT_TERMINAL_AUTO_APPROVE_RULES = {
  // Safe readonly commands
  cd: true,
  echo: true,
  ls: true,
  dir: true,
  pwd: true,
  cat: true,
  head: true,
  tail: true,
  findstr: true,
  wc: true,
  tr: true,
  cut: true,
  cmp: true,
  which: true,
  basename: true,
  dirname: true,
  realpath: true,
  readlink: true,
  stat: true,
  file: true,
  od: true,
  du: true,
  df: true,
  sleep: true,
  nl: true,
  grep: true,
  // Safe git sub-commands
  ...gitAutoApproveRules,
  // Docker readonly sub-commands
  "/^docker\\s+(ps|images|info|version|inspect|logs|top|stats|port|diff|search|events)\\b/": true,
  "/^docker\\s+(container|image|network|volume|context|system)\\s+(ls|ps|inspect|history|show|df|info)\\b/": true,
  "/^docker\\s+compose\\s+(ps|ls|top|logs|images|config|version|port|events)\\b/": true,
  // PowerShell
  ...powershellAutoApproveRules,
  // Package manager read-only commands
  "/^npm\\s+(ls|list|outdated|view|info|show|explain|why|root|prefix|bin|search|doctor|fund|repo|bugs|docs|home|help(-search)?)\\b/": true,
  "/^npm\\s+config\\s+(list|get)\\b/": true,
  "/^npm\\s+pkg\\s+get\\b/": true,
  "/^npm\\s+audit$/": true,
  "/^npm\\s+cache\\s+verify\\b/": true,
  "/^yarn\\s+(list|outdated|info|why|bin|help|versions)\\b/": true,
  "/^yarn\\s+licenses\\b/": true,
  "/^yarn\\s+audit\\b(?!.*\\bfix\\b)/": true,
  "/^yarn\\s+config\\s+(list|get)\\b/": true,
  "/^yarn\\s+cache\\s+dir\\b/": true,
  "/^pnpm\\s+(ls|list|outdated|why|root|bin|doctor)\\b/": true,
  "/^pnpm\\s+licenses\\b/": true,
  "/^pnpm\\s+audit\\b(?!.*\\bfix\\b)/": true,
  "/^pnpm\\s+config\\s+(list|get)\\b/": true,
  // Safe lockfile-only installs
  "npm ci": true,
  "/^yarn\\s+install\\s+--frozen-lockfile\\b/": true,
  "/^pnpm\\s+install\\s+--frozen-lockfile\\b/": true,
  // Safe commands with dangerous arg blocking
  column: true,
  "/^column\\b.*\\s-c\\s+[0-9]{4,}/": false,
  date: true,
  "/^date\\b.*\\s(-s|--set)\\b/": false,
  find: true,
  "/^find\\b.*\\s-(delete|exec|execdir|fprint|fprintf|fls|ok|okdir)\\b/": false,
  rg: true,
  "/^rg\\b.*\\s(--pre|--hostname-bin)\\b/": false,
  // TODO: replace sed deny regexes with a shared script analyzer — https://github.com/microsoft/vscode/issues/329218
  sed: true,
  "/^sed\\b.*\\s(-[a-zA-Z]*(e|f)[a-zA-Z]*|--expression|--file)\\b/": false,
  "/^sed\\b.*s\\/.*\\/.*\\/[ew]/": false,
  // Quoted positional script whose first command is e/r/R/w/W. The opening quote is
  // captured so the closing quote must match it, and whitespace and `!` are allowed
  // around the optional address since sed ignores them. The option prefix also skips
  // the separate operand consumed by -l/--line-length.
  "/^sed\\b(?:\\s+(?:(?:-l|--line-length)\\s+\\S+|--line-length=\\S+|-\\S+))*\\s+(['\"])\\s*(?:(?:\\d+|\\$|\\/(?:\\\\.|[^\\/])*\\/)(?:\\s*,\\s*(?:\\d+|\\$|\\/(?:\\\\.|[^\\/])*\\/))?)?\\s*!?\\s*[erRwW](?:\\s|\\1)/": false,
  // Same dangerous commands after a `;` or `{` separator inside a quoted script.
  // Escaped characters are consumed before testing for the matching closing quote.
  "/^sed\\b(?:\\s+(?:(?:-l|--line-length)\\s+\\S+|--line-length=\\S+|-\\S+))*\\s+(['\"])(?:\\\\.|(?!\\1).)*[;{]\\s*(?:(?:\\d+|\\$|\\/(?:\\\\.|[^\\/])*\\/)(?:\\s*,\\s*(?:\\d+|\\$|\\/(?:\\\\.|[^\\/])*\\/))?)?\\s*!?\\s*[erRwW](?:\\s|\\1|[;}])/": false,
  // Unquoted positional script form (e.g. `sed 1e id`, `sed w file`, `sed /pat/e file`)
  "/^sed\\b(?:\\s+(?:(?:-l|--line-length)\\s+\\S+|--line-length=\\S+|-\\S+))*\\s+(?:(?:\\d+|\\$|\\/(?:\\\\.|[^\\/])*\\/)(?:\\s*,\\s*(?:\\d+|\\$|\\/(?:\\\\.|[^\\/])*\\/))?)?\\s*!?\\s*[erRwW](?:\\s|$)/": false,
  ...sortAutoApproveRules,
  tree: true,
  "/^tree\\b.*\\s-o\\b/": false,
  "/^xxd$/": true,
  "/^xxd\\b(\\s+-\\S+)*\\s+[^-\\s]\\S*$/": true,
  // Dangerous commands
  rm: false,
  rmdir: false,
  del: false,
  "Remove-Item": false,
  ri: false,
  rd: false,
  erase: false,
  dd: false,
  kill: false,
  ps: false,
  top: false,
  "Stop-Process": false,
  spps: false,
  taskkill: false,
  "taskkill.exe": false,
  curl: false,
  wget: false,
  "Invoke-RestMethod": false,
  "Invoke-WebRequest": false,
  irm: false,
  iwr: false,
  chmod: false,
  chown: false,
  "Set-ItemProperty": false,
  sp: false,
  "Set-Acl": false,
  jq: false,
  xargs: false,
  eval: false,
  "Invoke-Expression": false,
  iex: false
};
export {
  CommandAutoApprover
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxjb21tYW5kQXV0b0FwcHJvdmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgeyBMYW5ndWFnZSwgUGFyc2VyLCBRdWVyeSwgUXVlcnlDYXB0dXJlIH0gZnJvbSAnQHZzY29kZS90cmVlLXNpdHRlci13YXNtJztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBGaWxlQWNjZXNzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBlc2NhcGVSZWdFeHBDaGFyYWN0ZXJzLCByZWdFeHBMZWFkc1RvRW5kbGVzc0xvb3AgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZXRBcHBOb2RlTW9kdWxlc1BhdGggfSBmcm9tICcuL2FwcE5vZGVNb2R1bGVzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgc2hvdWxkUmVxdWlyZUNvbmZpcm1hdGlvbkZvckF1dG9BcHByb3ZlUGFyc2UgfSBmcm9tICcuLi8uLi90ZXJtaW5hbC9jb21tb24vYXV0b0FwcHJvdmUvYXV0b0FwcHJvdmVQYXJzZVNhZmV0eS5qcyc7XG5pbXBvcnQgeyBnaXRBdXRvQXBwcm92ZVJ1bGVzIH0gZnJvbSAnLi4vLi4vdGVybWluYWwvY29tbW9uL2F1dG9BcHByb3ZlL2dpdEF1dG9BcHByb3ZlUnVsZXMuanMnO1xuaW1wb3J0IHsgcG93ZXJzaGVsbEF1dG9BcHByb3ZlUnVsZXMgfSBmcm9tICcuLi8uLi90ZXJtaW5hbC9jb21tb24vYXV0b0FwcHJvdmUvcG93ZXJzaGVsbEF1dG9BcHByb3ZlUnVsZXMuanMnO1xuaW1wb3J0IHsgU2VkRmlsZVdyaXRlUGFyc2VyIH0gZnJvbSAnLi4vLi4vdGVybWluYWwvY29tbW9uL2F1dG9BcHByb3ZlL3NlZEZpbGVXcml0ZVBhcnNlci5qcyc7XG5pbXBvcnQgeyBzb3J0QXV0b0FwcHJvdmVSdWxlcyB9IGZyb20gJy4uLy4uL3Rlcm1pbmFsL2NvbW1vbi9hdXRvQXBwcm92ZS9zb3J0QXV0b0FwcHJvdmVSdWxlcy5qcyc7XG5pbXBvcnQgdHlwZSB7IEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlVmFsdWUsIEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlcyB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RTY2hlbWEuanMnO1xuXG4vKipcbiAqIFJlZGlyZWN0IGRlc3RpbmF0aW9ucyB0aGF0IGRvIG5vdCByZXN1bHQgaW4gYSB3cml0ZSB0byBhbiBhcmJpdHJhcnkgZmlsZVxuICogb24gZGlzazogdGhlIC9kZXYgc2lua3MgdGhhdCBkaXNjYXJkIG91dHB1dCAoYC9kZXYvbnVsbGApIG9yIHdyaXRlIGJhY2sgdG9cbiAqIHRoZSBzYW1lIHRlcm1pbmFsIChgL2Rldi9zdGRvdXRgLCBgL2Rldi9zdGRlcnJgLCBgL2Rldi90dHlgKS5cbiAqL1xuY29uc3QgU0FGRV9QT1NJWF9SRURJUkVDVF9UQVJHRVRTOiBSZWFkb25seVNldDxzdHJpbmc+ID0gbmV3IFNldChbXG5cdCcvZGV2L251bGwnLFxuXHQnL2Rldi9zdGRvdXQnLFxuXHQnL2Rldi9zdGRlcnInLFxuXHQnL2Rldi90dHknLFxuXSk7XG5cbi8qKlxuICogUmV0dXJucyB0cnVlIHdoZW4gdGhlIGdpdmVuIHJlZGlyZWN0aW9uIGRlc3RpbmF0aW9uIGlzIGtub3duIHRvIGJlIHNhZmU6XG4gKiBlaXRoZXIgdGhlIHNoZWxsJ3MgbnVsbC9vdXRwdXQgc2luayBvciBhIGZpbGUtZGVzY3JpcHRvciBkdXBsaWNhdGlvbiB0YXJnZXRcbiAqIGxpa2UgYCYxYCAodXNlZCBpbiBgMj4mMWApLlxuICovXG5mdW5jdGlvbiBpc1NhZmVSZWRpcmVjdERlc3RpbmF0aW9uKGRlc3Q6IHN0cmluZywgaXNQb3dlclNoZWxsPzogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRsZXQgY2xlYW5lZCA9IGRlc3QudHJpbSgpO1xuXHRpZiAoY2xlYW5lZC5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Ly8gYCRudWxsYCBkaXNjYXJkcyBvdXRwdXQgaW4gUG93ZXJTaGVsbCBsaWtlIC9kZXYvbnVsbDsgdmFyaWFibGUgbmFtZXMgYXJlXG5cdC8vIGNhc2UtaW5zZW5zaXRpdmUuIFF1b3RlZCBmb3JtcyBhcmUgc3RyaW5ncyByYXRoZXIgdGhhbiB0aGUgbnVsbCBzaW5rLlxuXHRpZiAoaXNQb3dlclNoZWxsICYmIGNsZWFuZWQudG9Mb3dlckNhc2UoKSA9PT0gJyRudWxsJykge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdGlmICgoY2xlYW5lZC5zdGFydHNXaXRoKGAnYCkgJiYgY2xlYW5lZC5lbmRzV2l0aChgJ2ApKSB8fFxuXHRcdChjbGVhbmVkLnN0YXJ0c1dpdGgoJ1wiJykgJiYgY2xlYW5lZC5lbmRzV2l0aCgnXCInKSkpIHtcblx0XHRjbGVhbmVkID0gY2xlYW5lZC5zbGljZSgxLCAtMSk7XG5cdH1cblx0Ly8gRmlsZS1kZXNjcmlwdG9yIGR1cGxpY2F0aW9uOiBgJk5gLCBvcHRpb25hbGx5IGZvbGxvd2VkIGJ5IGAtYCB0byBjbG9zZS5cblx0aWYgKC9eJlswLTldKy0/JC8udGVzdChjbGVhbmVkKSkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdC8vIFBvd2VyU2hlbGwgdXNlcyBgJG51bGxgIGFzIGl0cyBudWxsIHNpbmsuIEluIHBhcnRpY3VsYXIsIGAvZGV2L251bGxgXG5cdC8vIHJlc29sdmVzIGFzIGEgZmlsZXN5c3RlbSBwYXRoIG9uIFdpbmRvd3MuXG5cdHJldHVybiAhaXNQb3dlclNoZWxsICYmIFNBRkVfUE9TSVhfUkVESVJFQ1RfVEFSR0VUUy5oYXMoY2xlYW5lZCk7XG59XG5cbi8qKlxuICogQ2xhc3NpZmljYXRpb24gb2YgYSB0cmVlLXNpdHRlciBgZmlsZV9yZWRpcmVjdGAgbm9kZS5cbiAqIC0gYHJlYWRgOiBpbnB1dC1vbmx5IHJlZGlyZWN0IChgPGAsIGA8Jk5gKSBcdTIwMTQgbmV2ZXIgd3JpdGVzLlxuICogLSBgc2FmZVdyaXRlYDogd3JpdGUgdG8gYSBrbm93bi1zYWZlIHNpbmsgKGAvZGV2L251bGxgLCBmZCBkdXBsaWNhdGlvbiwgLi4uKS5cbiAqIC0gYHVuc2FmZVdyaXRlYDogd3JpdGUgdG8gYW4gYXJiaXRyYXJ5IGRlc3RpbmF0aW9uLiBUaGUgZGVzdGluYXRpb24gc3RyaW5nXG4gKiAgICh3aXRoIHN1cnJvdW5kaW5nIHF1b3RlcyBzdHJpcHBlZCkgaXMgaW5jbHVkZWQgd2hlbiBpdCBjb3VsZCBiZSBwYXJzZWQsXG4gKiAgIHNvIHRoZSBjYWxsZXIgbWF5IGRlY2lkZSB3aGV0aGVyIHRoZSB0YXJnZXQgaXMgYWNjZXB0YWJsZS5cbiAqL1xudHlwZSBGaWxlUmVkaXJlY3RDbGFzc2lmaWNhdGlvbiA9XG5cdHwgeyBraW5kOiAncmVhZCcgfVxuXHR8IHsga2luZDogJ3NhZmVXcml0ZScgfVxuXHR8IHsga2luZDogJ3Vuc2FmZVdyaXRlJzsgZGVzdDogc3RyaW5nIHwgdW5kZWZpbmVkIH07XG5cbmZ1bmN0aW9uIGNsYXNzaWZ5RmlsZVJlZGlyZWN0KHJlZGlyZWN0VGV4dDogc3RyaW5nLCBpc1Bvd2VyU2hlbGw/OiBib29sZWFuKTogRmlsZVJlZGlyZWN0Q2xhc3NpZmljYXRpb24ge1xuXHRpZiAoIXJlZGlyZWN0VGV4dC5pbmNsdWRlcygnPicpKSB7XG5cdFx0cmV0dXJuIHsga2luZDogJ3JlYWQnIH07XG5cdH1cblx0Y29uc3QgZGVzdE1hdGNoID0gcmVkaXJlY3RUZXh0Lm1hdGNoKC8oPzpbMC05XSt8JnxcXCopPz4+P1xcfD9cXHMqKC4rKSQvKTtcblx0aWYgKCFkZXN0TWF0Y2gpIHtcblx0XHRyZXR1cm4geyBraW5kOiAndW5zYWZlV3JpdGUnLCBkZXN0OiB1bmRlZmluZWQgfTtcblx0fVxuXHRjb25zdCByYXdEZXN0ID0gZGVzdE1hdGNoWzFdLnRyaW0oKTtcblx0aWYgKGlzU2FmZVJlZGlyZWN0RGVzdGluYXRpb24ocmF3RGVzdCwgaXNQb3dlclNoZWxsKSkge1xuXHRcdHJldHVybiB7IGtpbmQ6ICdzYWZlV3JpdGUnIH07XG5cdH1cblx0bGV0IGRlc3QgPSByYXdEZXN0O1xuXHRpZiAoKGRlc3Quc3RhcnRzV2l0aChgJ2ApICYmIGRlc3QuZW5kc1dpdGgoYCdgKSkgfHxcblx0XHQoZGVzdC5zdGFydHNXaXRoKCdcIicpICYmIGRlc3QuZW5kc1dpdGgoJ1wiJykpKSB7XG5cdFx0ZGVzdCA9IGRlc3Quc2xpY2UoMSwgLTEpO1xuXHR9XG5cdHJldHVybiB7IGtpbmQ6ICd1bnNhZmVXcml0ZScsIGRlc3QgfTtcbn1cblxuLyoqXG4gKiBNYXRjaGVzIGEgUG93ZXJTaGVsbCBjb21tYW5kIHRva2VuIG9mIHRoZSBmb3JtIGAtZmxhZz1gIG9yIGAtLWZsYWc9YCBhdCB0aGVcbiAqIHN0YXJ0IG9mIGlucHV0IG9yIGZvbGxvd2luZyB3aGl0ZXNwYWNlLiBVc2VkIHRvIHdvcmsgYXJvdW5kIGEgdHJlZS1zaXR0ZXJcbiAqIFBvd2VyU2hlbGwgZ3JhbW1hciBsaW1pdGF0aW9uIHdoZXJlIFBPU0lYLXN0eWxlIGAtLWZsYWc9dmFsdWVgIGFyZ3VtZW50c1xuICogKGUuZy4gYGdpdCBsb2cgLS1mb3JtYXQ9XCJhfGJcImApIGFyZSBwYXJzZWQgYXMgYXNzaWdubWVudCBleHByZXNzaW9ucyBhbmRcbiAqIHRydW5jYXRlIHRoZSBzdXJyb3VuZGluZyBjb21tYW5kLiBNaXJyb3JzIHRoZSB3b3JrYmVuY2gnc1xuICogYFRyZWVTaXR0ZXJDb21tYW5kUGFyc2VyYCB3b3JrYXJvdW5kLlxuICpcbiAqIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjk0MDEwXG4gKiBUT0RPOiBSZW1vdmUgb25jZSB1cHN0cmVhbSB0cmVlLXNpdHRlciBQb3dlclNoZWxsIGdyYW1tYXIgaXMgdXBkYXRlZC5cbiAqL1xuY29uc3QgcHdzaEZsYWdFcXVhbHNSZWdleCA9IC8oXnxcXHMpKC17MSwyfVtcXHctXSspPS9nO1xuXG4vLyBUT0RPOiBSZW1vdmUgb25jZSB1cHN0cmVhbSB0cmVlLXNpdHRlciBQb3dlclNoZWxsIGdyYW1tYXIgaXMgdXBkYXRlZC5cbmZ1bmN0aW9uIG1hc2tQd3NoRmxhZ0VxdWFscyhjb21tYW5kTGluZTogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGNvbW1hbmRMaW5lLnJlcGxhY2UocHdzaEZsYWdFcXVhbHNSZWdleCwgKF8sIHByZSwgZmxhZykgPT4gYCR7cHJlfSR7ZmxhZ30gYCk7XG59XG5cbi8qKlxuICogTWF0Y2hlcyBQb3dlclNoZWxsIHJlZGlyZWN0cyBnbHVlZCB0byB0aGVpciB0YXJnZXQgKGAyPiRudWxsYCwgYD5vdXQudHh0YCxcbiAqIGAqPj5sb2cudHh0YCkuIFRoZSBncmFtbWFyIHBhcnNlcyB0aGVzZSBhcyBgZ2VuZXJpY190b2tlbmAgY29tbWFuZCBhcmd1bWVudHNcbiAqIHJhdGhlciB0aGFuIGByZWRpcmVjdGlvbmAgbm9kZXMsIHdoaWNoIG9ubHkgY292ZXIgdGhlIHNwYWNlZCBmb3JtLlxuICovXG5jb25zdCBwd3NoTm9TcGFjZVJlZGlyZWN0UmVnZXggPSAvXlswLTkqXT8+Pj8vO1xuXG4vKipcbiAqIFJlc3VsdCBvZiBhIGNvbW1hbmQgYXV0by1hcHByb3ZhbCBjaGVjay5cbiAqIC0gYGFwcHJvdmVkYDogYWxsIHN1Yi1jb21tYW5kcyBtYXRjaCBhbGxvdyBydWxlcyBhbmQgbm9uZSBhcmUgZGVuaWVkXG4gKiAtIGBkZW5pZWRgOiBhdCBsZWFzdCBvbmUgc3ViLWNvbW1hbmQgbWF0Y2hlcyBhIGRlbnkgcnVsZVxuICogLSBgbm9NYXRjaGA6IG5vIHJ1bGUgbWF0Y2hlZCBcdTIwMTQgcmVxdWlyZXMgdXNlciBjb25maXJtYXRpb25cbiAqL1xuZXhwb3J0IHR5cGUgQ29tbWFuZEFwcHJvdmFsUmVzdWx0ID0gJ2FwcHJvdmVkJyB8ICdkZW5pZWQnIHwgJ25vTWF0Y2gnO1xuXG4vKiogU3RydWN0dXJlZCBvdXRjb21lIG9mIHtAbGluayBDb21tYW5kQXV0b0FwcHJvdmVyLmV2YWx1YXRlfS4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbW1hbmRBcHByb3ZhbEV2YWx1YXRpb24ge1xuXHQvKiogRmluYWwgYXBwcm92YWwgb3V0Y29tZSwgaWRlbnRpY2FsIHRvIHtAbGluayBDb21tYW5kQXV0b0FwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlfS4gKi9cblx0cmVhZG9ubHkgcmVzdWx0OiBDb21tYW5kQXBwcm92YWxSZXN1bHQ7XG5cdC8qKiBXaGV0aGVyIGEgbWlzc2luZyBhbGxvdyBydWxlIGlzIHRoZSBvbmx5IHJlYXNvbiBjb25maXJtYXRpb24gaXMgcmVxdWlyZWQuICovXG5cdHJlYWRvbmx5IGF1dG9BcHByb3ZlUnVsZVJlc29sdmFibGU6IGJvb2xlYW47XG59XG5cbi8qKiBPcHRpb25zIGZvciB7QGxpbmsgQ29tbWFuZEF1dG9BcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZX0uICovXG5leHBvcnQgaW50ZXJmYWNlIElTaG91bGRBdXRvQXBwcm92ZU9wdGlvbnMge1xuXHQvKipcblx0ICogUHJlZGljYXRlIHRoYXQgZGVjaWRlcyB3aGV0aGVyIGEgd3JpdGUgcmVkaXJlY3Rpb24gdG8gdGhlIGdpdmVuXG5cdCAqIGRlc3RpbmF0aW9uIGlzIGFjY2VwdGFibGUuIENhbGxlZCBvbmNlIHBlciB3cml0ZS1yZWRpcmVjdCBkZXN0aW5hdGlvblxuXHQgKiBmb3VuZCBpbiB0aGUgY29tbWFuZCBsaW5lOyB0aGUgZGVzdGluYXRpb24gaXMgdGhlIHJhdyBzdHJpbmcgdGhlIHVzZXJcblx0ICogdHlwZWQgKHdpdGggc3Vycm91bmRpbmcgcXVvdGVzIHN0cmlwcGVkKS4gVGhlIHByZWRpY2F0ZSBpcyByZXNwb25zaWJsZVxuXHQgKiBmb3IgcmVzb2x2aW5nIHJlbGF0aXZlIHBhdGhzIGFuZCBhcHBseWluZyBpdHMgb3duIHBvbGljeS5cblx0ICpcblx0ICogV2hlbiBvbWl0dGVkLCBhbnkgd3JpdGUgcmVkaXJlY3QgdG8gYSBkZXN0aW5hdGlvbiBvdXRzaWRlIHRoZSBrbm93bi1zYWZlXG5cdCAqIHNpbmtzIChlLmcuIGAvZGV2L251bGxgKSBkb3duZ3JhZGVzIHRoZSByZXN1bHQgdG8gYG5vTWF0Y2hgLlxuXHQgKi9cblx0cmVhZG9ubHkgaXNXcml0ZURlc3RBcHByb3ZlZD86IChkZXN0OiBzdHJpbmcpID0+IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBFZmZlY3RpdmUgVlMgQ29kZSBgY2hhdC50b29scy50ZXJtaW5hbC5hdXRvQXBwcm92ZWAgcnVsZXMgZm9yd2FyZGVkIGZyb21cblx0ICogdGhlIHJlbmRlcmVyLiBXaGVuIG9taXR0ZWQsIHRoZSBhZ2VudCBob3N0IGZhbGxzIGJhY2sgdG8gaXRzIGJ1bmRsZWRcblx0ICogZGVmYXVsdCBydWxlcyBmb3IgY29tcGF0aWJpbGl0eSB3aXRoIG9sZGVyIGNsaWVudHMuXG5cdCAqL1xuXHRyZWFkb25seSBhdXRvQXBwcm92ZVJ1bGVzPzogQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzO1xuXHQvKipcblx0ICogU2hlbGwgZ3JhbW1hciB0byBwYXJzZSB0aGUgY29tbWFuZCBsaW5lIHdpdGguIFBvd2VyU2hlbGwgY29tbWFuZHMgYXJlXG5cdCAqIHBhcnNlZCB3aXRoIHRoZSBQb3dlclNoZWxsIGdyYW1tYXIuIFN1Yi1jb21tYW5kIHJ1bGVzIGFyZSBtYXRjaGVkXG5cdCAqIGNhc2UtaW5zZW5zaXRpdmVseSwgbGlrZSBQb3dlclNoZWxsIGl0c2VsZjsgZnVsbC1jb21tYW5kIHJ1bGVzIHJldGFpblxuXHQgKiB0aGVpciBjb25maWd1cmVkIGNhc2luZy4gRGVmYXVsdHMgdG8gYGJhc2hgLlxuXHQgKi9cblx0cmVhZG9ubHkgbGFuZ3VhZ2U/OiAnYmFzaCcgfCAncG93ZXJzaGVsbCc7XG59XG5cbmludGVyZmFjZSBJQXV0b0FwcHJvdmVSdWxlIHtcblx0cmVhZG9ubHkgcmVnZXg6IFJlZ0V4cDtcblx0LyoqIENhc2UtaW5zZW5zaXRpdmUgdmFyaWFudCBvZiB7QGxpbmsgcmVnZXh9LCB1c2VkIGZvciBQb3dlclNoZWxsIG1hdGNoaW5nLiAqL1xuXHRyZWFkb25seSByZWdleENhc2VJbnNlbnNpdGl2ZTogUmVnRXhwO1xufVxuXG5pbnRlcmZhY2UgSUF1dG9BcHByb3ZlUnVsZXMge1xuXHRyZWFkb25seSBhbGxvd1J1bGVzOiBJQXV0b0FwcHJvdmVSdWxlW107XG5cdHJlYWRvbmx5IGRlbnlSdWxlczogSUF1dG9BcHByb3ZlUnVsZVtdO1xuXHRyZWFkb25seSBhbGxvd0NvbW1hbmRMaW5lUnVsZXM6IElBdXRvQXBwcm92ZVJ1bGVbXTtcblx0cmVhZG9ubHkgZGVueUNvbW1hbmRMaW5lUnVsZXM6IElBdXRvQXBwcm92ZVJ1bGVbXTtcbn1cblxuY29uc3QgbmV2ZXJNYXRjaFJlZ2V4ID0gLyg/IS4qKS87XG5jb25zdCB0cmFuc2llbnRFbnZWYXJSZWdleCA9IC9eW0EtWl9dW0EtWjAtOV9dKj0vaTtcbmNvbnN0IHNlZEZpbGVXcml0ZVBhcnNlciA9IG5ldyBTZWRGaWxlV3JpdGVQYXJzZXIoKTtcblxuaW50ZXJmYWNlIElUcmVlU2l0dGVyUmVzb3VyY2VzIHtcblx0cmVhZG9ubHkgcGFyc2VyQ2xhc3M6IHR5cGVvZiBQYXJzZXI7XG5cdHJlYWRvbmx5IHF1ZXJ5Q2xhc3M6IHR5cGVvZiBRdWVyeTtcblx0cmVhZG9ubHkgYmFzaExhbmd1YWdlOiBQcm9taXNlU2V0dGxlZFJlc3VsdDxMYW5ndWFnZT47XG5cdHJlYWRvbmx5IHBvd2Vyc2hlbGxMYW5ndWFnZTogUHJvbWlzZVNldHRsZWRSZXN1bHQ8TGFuZ3VhZ2U+O1xufVxuXG5sZXQgdHJlZVNpdHRlclJlc291cmNlc1Byb21pc2U6IFByb21pc2U8SVRyZWVTaXR0ZXJSZXNvdXJjZXM+IHwgdW5kZWZpbmVkO1xuXG5mdW5jdGlvbiBnZXRUcmVlU2l0dGVyUmVzb3VyY2VzKCk6IFByb21pc2U8SVRyZWVTaXR0ZXJSZXNvdXJjZXM+IHtcblx0Ly8gUGFyc2VyLmluaXQgYW5kIExhbmd1YWdlLmxvYWQgbXV0YXRlIHByb2Nlc3MtZ2xvYmFsIFdBU00gc3RhdGUsIHNvIGxvYWQgdGhlbSBvbmNlLlxuXHRyZXR1cm4gdHJlZVNpdHRlclJlc291cmNlc1Byb21pc2UgPz89IGxvYWRUcmVlU2l0dGVyUmVzb3VyY2VzKCk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGxvYWRUcmVlU2l0dGVyUmVzb3VyY2VzKCk6IFByb21pc2U8SVRyZWVTaXR0ZXJSZXNvdXJjZXM+IHtcblx0Y29uc3QgeyBkZWZhdWx0OiBUcmVlU2l0dGVyIH0gPSBhd2FpdCBpbXBvcnQoJ0B2c2NvZGUvdHJlZS1zaXR0ZXItd2FzbScpO1xuXHRjb25zdCBtb2R1bGVSb290ID0gVVJJLmpvaW5QYXRoKEZpbGVBY2Nlc3MuYXNGaWxlVXJpKGdldEFwcE5vZGVNb2R1bGVzUGF0aCgpKSwgJ0B2c2NvZGUnLCAndHJlZS1zaXR0ZXItd2FzbScsICd3YXNtJyk7XG5cdGNvbnN0IHdhc21QYXRoID0gVVJJLmpvaW5QYXRoKG1vZHVsZVJvb3QsICd0cmVlLXNpdHRlci53YXNtJykuZnNQYXRoO1xuXG5cdGF3YWl0IFRyZWVTaXR0ZXIuUGFyc2VyLmluaXQoe1xuXHRcdGxvY2F0ZUZpbGUoKSB7XG5cdFx0XHRyZXR1cm4gd2FzbVBhdGg7XG5cdFx0fVxuXHR9KTtcblxuXHRjb25zdCBsb2FkR3JhbW1hciA9IGFzeW5jIChmaWxlTmFtZTogc3RyaW5nKSA9PiB7XG5cdFx0Y29uc3QgZ3JhbW1hcldhc20gPSBhd2FpdCBmcy5wcm9taXNlcy5yZWFkRmlsZShVUkkuam9pblBhdGgobW9kdWxlUm9vdCwgZmlsZU5hbWUpLmZzUGF0aCk7XG5cdFx0cmV0dXJuIFRyZWVTaXR0ZXIuTGFuZ3VhZ2UubG9hZChuZXcgVWludDhBcnJheShncmFtbWFyV2FzbS5idWZmZXIsIGdyYW1tYXJXYXNtLmJ5dGVPZmZzZXQsIGdyYW1tYXJXYXNtLmJ5dGVMZW5ndGgpKTtcblx0fTtcblx0Y29uc3QgW2Jhc2hMYW5ndWFnZSwgcG93ZXJzaGVsbExhbmd1YWdlXSA9IGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChbXG5cdFx0bG9hZEdyYW1tYXIoJ3RyZWUtc2l0dGVyLWJhc2gud2FzbScpLFxuXHRcdGxvYWRHcmFtbWFyKCd0cmVlLXNpdHRlci1wb3dlcnNoZWxsLndhc20nKSxcblx0XSk7XG5cblx0cmV0dXJuIHtcblx0XHRwYXJzZXJDbGFzczogVHJlZVNpdHRlci5QYXJzZXIsXG5cdFx0cXVlcnlDbGFzczogVHJlZVNpdHRlci5RdWVyeSxcblx0XHRiYXNoTGFuZ3VhZ2UsXG5cdFx0cG93ZXJzaGVsbExhbmd1YWdlLFxuXHR9O1xufVxuXG4vKipcbiAqIEF1dG8tYXBwcm92ZXMgb3IgZGVuaWVzIHNoZWxsIGNvbW1hbmRzIGJhc2VkIG9uIHRlcm1pbmFsIGF1dG8tYXBwcm92ZSBydWxlcy5cbiAqXG4gKiBVc2VzIHRyZWUtc2l0dGVyIHRvIHBhcnNlIGNvbXBvdW5kIGNvbW1hbmRzIChgZm9vICYmIGJhcmApIGludG9cbiAqIHN1Yi1jb21tYW5kcyB0aGF0IGFyZSBpbmRpdmlkdWFsbHkgY2hlY2tlZCBhZ2FpbnN0IGFsbG93L2RlbnkgbGlzdHMuXG4gKiBUaGUgcnVsZXMgYXJlIG5vcm1hbGx5IGZvcndhcmRlZCBmcm9tIFZTIENvZGUnc1xuICogYGNoYXQudG9vbHMudGVybWluYWwuYXV0b0FwcHJvdmVgIHNldHRpbmcuIEEgYnVuZGxlZCBkZWZhdWx0IHRhYmxlIGlzIGtlcHRcbiAqIGFzIGEgY29tcGF0aWJpbGl0eSBmYWxsYmFjayBmb3IgY2xpZW50cyB0aGF0IGhhdmUgbm90IGZvcndhcmRlZCBydWxlcyB5ZXQuXG4gKlxuICogVHJlZS1zaXR0ZXIgaXMgaW5pdGlhbGl6ZWQgZWFnZXJseTsgY2FsbCB7QGxpbmsgaW5pdGlhbGl6ZX0gYW5kIGF3YWl0IHRoZVxuICogcmVzdWx0IGJlZm9yZSB1c2luZyB7QGxpbmsgc2hvdWxkQXV0b0FwcHJvdmV9IHRvIGd1YXJhbnRlZSBzeW5jaHJvbm91c1xuICogcGFyc2luZy4gSWYgdHJlZS1zaXR0ZXIgZmFpbHMgdG8gbG9hZCBvciBwYXJzZSB0aGUgY29tbWFuZCxcbiAqIHtAbGluayBzaG91bGRBdXRvQXBwcm92ZX0gcmV0dXJucyBgbm9NYXRjaGAgc28gdGhlIHVzZXIgaXMgcHJvbXB0ZWQgZm9yXG4gKiBjb25maXJtYXRpb24gcmF0aGVyIHRoYW4gYXV0by1hcHByb3ZpbmcgYmFzZWQgb24gdGhlIGNvbW1hbmQgbmFtZSBhbG9uZS5cbiAqL1xuZXhwb3J0IGNsYXNzIENvbW1hbmRBdXRvQXBwcm92ZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIF9mYWxsYmFja1J1bGVzOiBJQXV0b0FwcHJvdmVSdWxlcyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY2FjaGVkUnVsZUNvbmZpZzogQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jYWNoZWRSdWxlczogSUF1dG9BcHByb3ZlUnVsZXMgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3BhcnNlcjogUGFyc2VyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9iYXNoTGFuZ3VhZ2U6IExhbmd1YWdlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9wb3dlcnNoZWxsTGFuZ3VhZ2U6IExhbmd1YWdlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9xdWVyeUNsYXNzOiB0eXBlb2YgUXVlcnkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2luaXRQcm9taXNlOiBQcm9taXNlPHZvaWQ+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2luaXRQcm9taXNlID0gdGhpcy5faW5pdFRyZWVTaXR0ZXIoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIG9uY2UgdHJlZS1zaXR0ZXIgV0FTTSBoYXMgYmVlbiBsb2FkZWQuXG5cdCAqIEF3YWl0IHRoaXMgYmVmb3JlIHByb2Nlc3NpbmcgYW55IGV2ZW50cyB0byBndWFyYW50ZWUgdGhhdFxuXHQgKiB7QGxpbmsgc2hvdWxkQXV0b0FwcHJvdmV9IGNhbiBwYXJzZSBjb21tYW5kcyBzeW5jaHJvbm91c2x5LlxuXHQgKi9cblx0aW5pdGlhbGl6ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5faW5pdFByb21pc2U7XG5cdH1cblxuXHQvKipcblx0ICogU3luY2hyb25vdXNseSBjaGVjayB3aGV0aGVyIHRoZSBnaXZlbiBjb21tYW5kIGxpbmUgc2hvdWxkIGJlIGF1dG8tYXBwcm92ZWQuXG5cdCAqIFVzZXMgdHJlZS1zaXR0ZXIgKGlmIGxvYWRlZCkgdG8gcGFyc2UgY29tcG91bmQgY29tbWFuZHMgaW50byBzdWItY29tbWFuZHMuXG5cdCAqXG5cdCAqIFdoZW4gdGhlIGNvbW1hbmQgY29udGFpbnMgd3JpdGUgcmVkaXJlY3Rpb25zLCBgb3B0aW9ucy5pc1dyaXRlRGVzdEFwcHJvdmVkYFxuXHQgKiBpcyBjb25zdWx0ZWQgZm9yIGVhY2ggZGVzdGluYXRpb24uIElmIGV2ZXJ5IGRlc3RpbmF0aW9uIGlzIGFwcHJvdmVkIGJ5IHRoZVxuXHQgKiBwcmVkaWNhdGUsIHdyaXRlIHJlZGlyZWN0aW9ucyBkbyBub3QgYmxvY2sgYXV0by1hcHByb3ZhbC5cblx0ICovXG5cdHNob3VsZEF1dG9BcHByb3ZlKGNvbW1hbmRMaW5lOiBzdHJpbmcsIG9wdGlvbnM/OiBJU2hvdWxkQXV0b0FwcHJvdmVPcHRpb25zKTogQ29tbWFuZEFwcHJvdmFsUmVzdWx0IHtcblx0XHRyZXR1cm4gdGhpcy5ldmFsdWF0ZShjb21tYW5kTGluZSwgb3B0aW9ucykucmVzdWx0O1xuXHR9XG5cblx0LyoqIEV2YWx1YXRlcyB0aGUgY29tbWFuZCBhbmQgcmVwb3J0cyB3aGV0aGVyIGFkZGluZyBhIHBlcnNpc3RlbnQgYWxsb3cgcnVsZSBjb3VsZCByZXNvbHZlIHRoZSByZXN1bHQuICovXG5cdGV2YWx1YXRlKGNvbW1hbmRMaW5lOiBzdHJpbmcsIG9wdGlvbnM/OiBJU2hvdWxkQXV0b0FwcHJvdmVPcHRpb25zKTogSUNvbW1hbmRBcHByb3ZhbEV2YWx1YXRpb24ge1xuXHRcdGNvbnN0IHRyaW1tZWQgPSBjb21tYW5kTGluZS50cmltU3RhcnQoKTtcblx0XHRpZiAodHJpbW1lZC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB7IHJlc3VsdDogJ2FwcHJvdmVkJywgYXV0b0FwcHJvdmVSdWxlUmVzb2x2YWJsZTogZmFsc2UgfTtcblx0XHR9XG5cblx0XHRjb25zdCBydWxlcyA9IHRoaXMuX2NvbXBpbGVSdWxlcyhvcHRpb25zPy5hdXRvQXBwcm92ZVJ1bGVzKTtcblx0XHRjb25zdCBpc1Bvd2VyU2hlbGwgPSBvcHRpb25zPy5sYW5ndWFnZSA9PT0gJ3Bvd2Vyc2hlbGwnO1xuXG5cdFx0aWYgKHRoaXMuX21hdGNoZXNDb21tYW5kTGluZVJ1bGUodHJpbW1lZCwgcnVsZXMuZGVueUNvbW1hbmRMaW5lUnVsZXMpKSB7XG5cdFx0XHRyZXR1cm4geyByZXN1bHQ6ICdkZW5pZWQnLCBhdXRvQXBwcm92ZVJ1bGVSZXNvbHZhYmxlOiBmYWxzZSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhcnNlZCA9IHRoaXMuX2V4dHJhY3RTdWJDb21tYW5kcyh0cmltbWVkLCBpc1Bvd2VyU2hlbGwpO1xuXHRcdGlmICghcGFyc2VkKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdbQ29tbWFuZEF1dG9BcHByb3Zlcl0gQ29tbWFuZCBsaW5lIGNvdWxkIG5vdCBiZSBhbmFseXplZCwgcmVxdWlyaW5nIGNvbmZpcm1hdGlvbicpO1xuXHRcdFx0cmV0dXJuIHsgcmVzdWx0OiAnbm9NYXRjaCcsIGF1dG9BcHByb3ZlUnVsZVJlc29sdmFibGU6IGZhbHNlIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGFzVW5hcHByb3ZlZFJlZGlyZWN0ID0gKCkgPT4gcGFyc2VkLnVuc2FmZVdyaXRlRGVzdHMuc29tZShkZXN0ID0+IGRlc3QgPT09IHVuZGVmaW5lZCB8fCAhb3B0aW9ucz8uaXNXcml0ZURlc3RBcHByb3ZlZD8uKGRlc3QpKTtcblxuXHRcdGxldCByZXN1bHQgPSB0aGlzLl9tYXRjaFN1YkNvbW1hbmRzKHBhcnNlZC5zdWJDb21tYW5kcywgcnVsZXMsIGlzUG93ZXJTaGVsbCk7XG5cdFx0aWYgKHJlc3VsdCAhPT0gJ2RlbmllZCcgJiYgdGhpcy5fbWF0Y2hlc0NvbW1hbmRMaW5lUnVsZSh0cmltbWVkLCBydWxlcy5hbGxvd0NvbW1hbmRMaW5lUnVsZXMpKSB7XG5cdFx0XHRyZXN1bHQgPSAnYXBwcm92ZWQnO1xuXHRcdH1cblx0XHRpZiAocmVzdWx0ID09PSAnYXBwcm92ZWQnICYmIGhhc1VuYXBwcm92ZWRSZWRpcmVjdCgpKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdbQ29tbWFuZEF1dG9BcHByb3Zlcl0gV3JpdGUgcmVkaXJlY3Rpb24gdG8gbm9uLWFwcHJvdmVkIGRlc3RpbmF0aW9uLCByZXF1aXJpbmcgY29uZmlybWF0aW9uJyk7XG5cdFx0XHRyZXR1cm4geyByZXN1bHQ6ICdub01hdGNoJywgYXV0b0FwcHJvdmVSdWxlUmVzb2x2YWJsZTogZmFsc2UgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgcmVzdWx0LCBhdXRvQXBwcm92ZVJ1bGVSZXNvbHZhYmxlOiByZXN1bHQgPT09ICdub01hdGNoJyAmJiAhaGFzVW5hcHByb3ZlZFJlZGlyZWN0KCkgfTtcblx0fVxuXG5cdHByaXZhdGUgX21hdGNoU3ViQ29tbWFuZHMoc3ViQ29tbWFuZHM6IHN0cmluZ1tdLCBydWxlczogSUF1dG9BcHByb3ZlUnVsZXMsIGlzUG93ZXJTaGVsbDogYm9vbGVhbik6IENvbW1hbmRBcHByb3ZhbFJlc3VsdCB7XG5cdFx0bGV0IGFsbEFwcHJvdmVkID0gdHJ1ZTtcblx0XHRmb3IgKGNvbnN0IHN1YkNvbW1hbmQgb2Ygc3ViQ29tbWFuZHMpIHtcblx0XHRcdGlmIChzZWRGaWxlV3JpdGVQYXJzZXIuY2FuSGFuZGxlKHN1YkNvbW1hbmQpKSB7XG5cdFx0XHRcdHJldHVybiAnZGVuaWVkJztcblx0XHRcdH1cblx0XHRcdC8vIERlbnkgdHJhbnNpZW50IGVudiB2YXIgYXNzaWdubWVudHNcblx0XHRcdGlmICh0cmFuc2llbnRFbnZWYXJSZWdleC50ZXN0KHN1YkNvbW1hbmQpKSB7XG5cdFx0XHRcdHJldHVybiAnZGVuaWVkJztcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5fbWF0Y2hTaW5nbGVDb21tYW5kKHN1YkNvbW1hbmQsIHJ1bGVzLCBpc1Bvd2VyU2hlbGwpO1xuXHRcdFx0aWYgKHJlc3VsdCA9PT0gJ2RlbmllZCcpIHtcblx0XHRcdFx0cmV0dXJuICdkZW5pZWQnO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlc3VsdCAhPT0gJ2FwcHJvdmVkJykge1xuXHRcdFx0XHRhbGxBcHByb3ZlZCA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gYWxsQXBwcm92ZWQgPyAnYXBwcm92ZWQnIDogJ25vTWF0Y2gnO1xuXHR9XG5cblx0cHJpdmF0ZSBfbWF0Y2hTaW5nbGVDb21tYW5kKGNvbW1hbmQ6IHN0cmluZywgcnVsZXM6IElBdXRvQXBwcm92ZVJ1bGVzLCBpc1Bvd2VyU2hlbGw6IGJvb2xlYW4pOiBDb21tYW5kQXBwcm92YWxSZXN1bHQge1xuXHRcdC8vIENoZWNrIGRlbnkgcnVsZXMgZmlyc3Rcblx0XHRpZiAodGhpcy5fbWF0Y2hlc1J1bGUoY29tbWFuZCwgcnVsZXMuZGVueVJ1bGVzLCBpc1Bvd2VyU2hlbGwpKSB7XG5cdFx0XHRyZXR1cm4gJ2RlbmllZCc7XG5cdFx0fVxuXG5cdFx0Ly8gVGhlbiBjaGVjayBhbGxvdyBydWxlc1xuXHRcdGlmICh0aGlzLl9tYXRjaGVzUnVsZShjb21tYW5kLCBydWxlcy5hbGxvd1J1bGVzLCBpc1Bvd2VyU2hlbGwpKSB7XG5cdFx0XHRyZXR1cm4gJ2FwcHJvdmVkJztcblx0XHR9XG5cblx0XHRyZXR1cm4gJ25vTWF0Y2gnO1xuXHR9XG5cblx0cHJpdmF0ZSBfbWF0Y2hlc0NvbW1hbmRMaW5lUnVsZShjb21tYW5kTGluZTogc3RyaW5nLCBydWxlczogcmVhZG9ubHkgSUF1dG9BcHByb3ZlUnVsZVtdKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHJ1bGVzLnNvbWUocnVsZSA9PiBydWxlLnJlZ2V4LnRlc3QoY29tbWFuZExpbmUpKTtcblx0fVxuXG5cdHByaXZhdGUgX21hdGNoZXNSdWxlKGNvbW1hbmQ6IHN0cmluZywgcnVsZXM6IHJlYWRvbmx5IElBdXRvQXBwcm92ZVJ1bGVbXSwgaXNQb3dlclNoZWxsPzogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdGZvciAoY29uc3QgcnVsZSBvZiBydWxlcykge1xuXHRcdFx0Ly8gUG93ZXJTaGVsbCBydWxlIG1hdGNoaW5nIGlzIGNhc2UtaW5zZW5zaXRpdmUsIGxpa2UgdGhlIHNoZWxsIGl0c2VsZi5cblx0XHRcdGlmICgoaXNQb3dlclNoZWxsID8gcnVsZS5yZWdleENhc2VJbnNlbnNpdGl2ZSA6IHJ1bGUucmVnZXgpLnRlc3QoY29tbWFuZCkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHQvLyBJZ25vcmUgYSBsZWFkaW5nICggZm9yIFBvd2VyU2hlbGwgY29tbWFuZHM6IGl0J3MgYSBjb21tYW5kIHBhdHRlcm5cblx0XHRcdC8vIG9wZXJhdGluZyBvbiB0aGUgb3V0cHV0IG9mIGEgY29tbWFuZCwgZS5nLiBgKEdldC1Db250ZW50IFJFQURNRS5tZCkgLi4uYC5cblx0XHRcdGlmIChpc1Bvd2VyU2hlbGwgJiYgY29tbWFuZC5zdGFydHNXaXRoKCcoJykgJiYgcnVsZS5yZWdleENhc2VJbnNlbnNpdGl2ZS50ZXN0KGNvbW1hbmQuc2xpY2UoMSkpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvLyAtLS0tIFRyZWUtc2l0dGVyIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJpdmF0ZSBfZXh0cmFjdFN1YkNvbW1hbmRzKGNvbW1hbmRMaW5lOiBzdHJpbmcsIGlzUG93ZXJTaGVsbDogYm9vbGVhbik6IHsgc3ViQ29tbWFuZHM6IHN0cmluZ1tdOyB1bnNhZmVXcml0ZURlc3RzOiAoc3RyaW5nIHwgdW5kZWZpbmVkKVtdIH0gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGxhbmd1YWdlID0gaXNQb3dlclNoZWxsID8gdGhpcy5fcG93ZXJzaGVsbExhbmd1YWdlIDogdGhpcy5fYmFzaExhbmd1YWdlO1xuXHRcdGlmICghdGhpcy5fcGFyc2VyIHx8ICFsYW5ndWFnZSB8fCAhdGhpcy5fcXVlcnlDbGFzcykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fcGFyc2VyLnNldExhbmd1YWdlKGxhbmd1YWdlKTtcblx0XHRcdC8vIFRoZSBQb3dlclNoZWxsIGdyYW1tYXIgdHJ1bmNhdGVzIGNvbW1hbmRzIGFyb3VuZCBgLS1mbGFnPXZhbHVlYFxuXHRcdFx0Ly8gYXJndW1lbnRzLCBzbyB0aGV5IGFyZSBtYXNrZWQgYmVmb3JlIHBhcnNpbmcgKHBvc2l0aW9ucyBhcmVcblx0XHRcdC8vIHByZXNlcnZlZCkgYW5kIGNhcHR1cmUgdGV4dCBpcyBzbGljZWQgZnJvbSB0aGUgb3JpZ2luYWwuXG5cdFx0XHRjb25zdCBtYXNrZWQgPSBpc1Bvd2VyU2hlbGwgPyBtYXNrUHdzaEZsYWdFcXVhbHMoY29tbWFuZExpbmUpIDogY29tbWFuZExpbmU7XG5cdFx0XHRjb25zdCB0cmVlID0gdGhpcy5fcGFyc2VyLnBhcnNlKG1hc2tlZCk7XG5cdFx0XHRpZiAoIXRyZWUpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0aWYgKHNob3VsZFJlcXVpcmVDb25maXJtYXRpb25Gb3JBdXRvQXBwcm92ZVBhcnNlKGlzUG93ZXJTaGVsbCA/ICdwb3dlcnNoZWxsJyA6ICdiYXNoJywgdHJlZS5yb290Tm9kZS5oYXNFcnJvcikpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdbQ29tbWFuZEF1dG9BcHByb3Zlcl0gUG93ZXJTaGVsbCBwYXJzZSBjb250YWlucyBlcnJvcnMsIHJlcXVpcmluZyBjb25maXJtYXRpb24nKTtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIE5vLXNwYWNlIFBvd2VyU2hlbGwgcmVkaXJlY3RzIChgMj4kbnVsbGApIHBhcnNlIGFzIGdlbmVyaWNfdG9rZW5cblx0XHRcdFx0Ly8gY29tbWFuZCBhcmd1bWVudHMgcmF0aGVyIHRoYW4gcmVkaXJlY3Rpb24gbm9kZXMsIHNvIGJvdGggYXJlXG5cdFx0XHRcdC8vIGNhcHR1cmVkIGFuZCBmaWx0ZXJlZCBieSBzaGFwZSBiZWxvdy4gQXNzaWdubWVudHMgYW5kIG1ldGhvZFxuXHRcdFx0XHQvLyBpbnZvY2F0aW9ucyBhcmUgY2FwdHVyZWQgc28gdGhlIGNvbW1hbmQgbGluZSBjYW4gZmFpbCBjbG9zZWRcblx0XHRcdFx0Ly8gd2hlbiBpdCBjb250YWlucyBjb2RlIHRoZSBydWxlcyBjYW5ub3Qgc2VlLlxuXHRcdFx0XHRjb25zdCBxdWVyeSA9IG5ldyB0aGlzLl9xdWVyeUNsYXNzKGxhbmd1YWdlLCBpc1Bvd2VyU2hlbGxcblx0XHRcdFx0XHQ/ICcoY29tbWFuZCkgQGNvbW1hbmQgKHJlZGlyZWN0aW9uKSBAcmVkaXJlY3Rpb24gKGdlbmVyaWNfdG9rZW4pIEBnZW5lcmljX3Rva2VuIChhc3NpZ25tZW50X2V4cHJlc3Npb24pIEB1bmFuYWx5emFibGUgKGludm9rYXRpb25fZXhwcmVzc2lvbikgQHVuYW5hbHl6YWJsZSdcblx0XHRcdFx0XHQ6ICcoY29tbWFuZCkgQGNvbW1hbmQgKGZpbGVfcmVkaXJlY3QpIEBmaWxlX3JlZGlyZWN0IChoZXJlZG9jX3JlZGlyZWN0KSBAaGVyZWRvY19yZWRpcmVjdCAoaGVyZXN0cmluZ19yZWRpcmVjdCkgQGhlcmVzdHJpbmdfcmVkaXJlY3QgKHZhcmlhYmxlX2Fzc2lnbm1lbnQpIEB1bmFuYWx5emFibGUgKGRlY2xhcmF0aW9uX2NvbW1hbmQpIEB1bmFuYWx5emFibGUnKTtcblx0XHRcdFx0Y29uc3QgY2FwdHVyZXM6IFF1ZXJ5Q2FwdHVyZVtdID0gcXVlcnkuY2FwdHVyZXModHJlZS5yb290Tm9kZSk7XG5cdFx0XHRcdGNvbnN0IHN1YkNvbW1hbmRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0XHRjb25zdCB1bnNhZmVXcml0ZURlc3RzOiAoc3RyaW5nIHwgdW5kZWZpbmVkKVtdID0gW107XG5cdFx0XHRcdGxldCB1bmFuYWx5emFibGVUeXBlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGZvciAoY29uc3QgY2FwdHVyZSBvZiBjYXB0dXJlcykge1xuXHRcdFx0XHRcdGNvbnN0IHRleHQgPSBtYXNrZWQgPT09IGNvbW1hbmRMaW5lID8gY2FwdHVyZS5ub2RlLnRleHQgOiBjb21tYW5kTGluZS5zdWJzdHJpbmcoY2FwdHVyZS5ub2RlLnN0YXJ0SW5kZXgsIGNhcHR1cmUubm9kZS5lbmRJbmRleCk7XG5cdFx0XHRcdFx0aWYgKGNhcHR1cmUubmFtZSA9PT0gJ2NvbW1hbmQnKSB7XG5cdFx0XHRcdFx0XHRzdWJDb21tYW5kcy5wdXNoKHRleHQpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoY2FwdHVyZS5uYW1lID09PSAndW5hbmFseXphYmxlJyAmJiAoY2FwdHVyZS5ub2RlLnR5cGUgIT09ICd2YXJpYWJsZV9hc3NpZ25tZW50JyB8fCBjYXB0dXJlLm5vZGUucGFyZW50Py50eXBlICE9PSAnY29tbWFuZCcpKSB7XG5cdFx0XHRcdFx0XHR1bmFuYWx5emFibGVUeXBlID8/PSBjYXB0dXJlLm5vZGUudHlwZTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGNhcHR1cmUubmFtZSA9PT0gJ2ZpbGVfcmVkaXJlY3QnIHx8IGNhcHR1cmUubmFtZSA9PT0gJ3JlZGlyZWN0aW9uJyB8fCAoY2FwdHVyZS5uYW1lID09PSAnZ2VuZXJpY190b2tlbicgJiYgcHdzaE5vU3BhY2VSZWRpcmVjdFJlZ2V4LnRlc3QodGV4dCkpKSB7XG5cdFx0XHRcdFx0XHQvLyBXcml0ZXMgdG8ga25vd24tc2FmZSBzaW5rcyAoZS5nLiBgPiAvZGV2L251bGxgLCBgMj4kbnVsbGApXG5cdFx0XHRcdFx0XHQvLyBhbmQgZmlsZS1kZXNjcmlwdG9yIGR1cGxpY2F0aW9ucyAoZS5nLiBgMj4mMWApIGFyZSBhbGxvd2VkLlxuXHRcdFx0XHRcdFx0Y29uc3QgY2xzID0gY2xhc3NpZnlGaWxlUmVkaXJlY3QodGV4dCwgaXNQb3dlclNoZWxsKTtcblx0XHRcdFx0XHRcdGlmIChjbHMua2luZCA9PT0gJ3Vuc2FmZVdyaXRlJykge1xuXHRcdFx0XHRcdFx0XHR1bnNhZmVXcml0ZURlc3RzLnB1c2goY2xzLmRlc3QpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSBpZiAoY2FwdHVyZS5uYW1lID09PSAnaGVyZWRvY19yZWRpcmVjdCcgfHwgY2FwdHVyZS5uYW1lID09PSAnaGVyZXN0cmluZ19yZWRpcmVjdCcpIHtcblx0XHRcdFx0XHRcdC8vIEhlcmVkb2MvaGVyZXN0cmluZyBmZWVkIGRhdGEgaW50byBzdGRpbjsgdGhleSBkbyBub3Qgd3JpdGVcblx0XHRcdFx0XHRcdC8vIGZpbGVzLCBzbyB0aGV5IGFyZSBub3QgdHJlYXRlZCBhcyB3cml0ZSByZWRpcmVjdHMgaGVyZS5cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cXVlcnkuZGVsZXRlKCk7XG5cblx0XHRcdFx0aWYgKHVuYW5hbHl6YWJsZVR5cGUpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29tbWFuZEF1dG9BcHByb3Zlcl0gQ29tbWFuZCBsaW5lIGNvbnRhaW5zIGFuIHVuYW5hbHl6YWJsZSAke3VuYW5hbHl6YWJsZVR5cGV9LCByZXF1aXJpbmcgY29uZmlybWF0aW9uYCk7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gc3ViQ29tbWFuZHMubGVuZ3RoID4gMCB8fCB1bnNhZmVXcml0ZURlc3RzLmxlbmd0aCA+IDAgPyB7IHN1YkNvbW1hbmRzLCB1bnNhZmVXcml0ZURlc3RzIH0gOiB1bmRlZmluZWQ7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHR0cmVlLmRlbGV0ZSgpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdbQ29tbWFuZEF1dG9BcHByb3Zlcl0gVHJlZS1zaXR0ZXIgcGFyc2luZyBmYWlsZWQnLCBlcnIpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9pbml0VHJlZVNpdHRlcigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VzID0gYXdhaXQgZ2V0VHJlZVNpdHRlclJlc291cmNlcygpO1xuXG5cdFx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHBhcnNlciA9IG5ldyByZXNvdXJjZXMucGFyc2VyQ2xhc3MoKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0cGFyc2VyLmRlbGV0ZSgpO1xuXHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHQvLyBXQVNNIG1lbW9yeSBtYXkgYWxyZWFkeSBiZSBmcmVlZFxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuX3BhcnNlciA9IHBhcnNlcjtcblx0XHRcdHRoaXMuX3F1ZXJ5Q2xhc3MgPSByZXNvdXJjZXMucXVlcnlDbGFzcztcblx0XHRcdC8vIEEgZ3JhbW1hciB0aGF0IGZhaWxzIHRvIGxvYWQgbGVhdmVzIGl0cyBsYW5ndWFnZSB1bmRlZmluZWQsIHNvXG5cdFx0XHQvLyBjb21tYW5kcyBmb3IgdGhhdCBzaGVsbCBmYWxsIGJhY2sgdG8gYG5vTWF0Y2hgIGFuZCByZXF1aXJlXG5cdFx0XHQvLyBjb25maXJtYXRpb24gcmF0aGVyIHRoYW4gYXV0by1hcHByb3ZpbmcuXG5cdFx0XHRpZiAocmVzb3VyY2VzLmJhc2hMYW5ndWFnZS5zdGF0dXMgPT09ICdmdWxmaWxsZWQnKSB7XG5cdFx0XHRcdHRoaXMuX2Jhc2hMYW5ndWFnZSA9IHJlc291cmNlcy5iYXNoTGFuZ3VhZ2UudmFsdWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ1tDb21tYW5kQXV0b0FwcHJvdmVyXSBGYWlsZWQgdG8gbG9hZCB0aGUgYmFzaCBncmFtbWFyOyBiYXNoIGNvbW1hbmRzIHdpbGwgcmVxdWlyZSBjb25maXJtYXRpb24nLCByZXNvdXJjZXMuYmFzaExhbmd1YWdlLnJlYXNvbik7XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVzb3VyY2VzLnBvd2Vyc2hlbGxMYW5ndWFnZS5zdGF0dXMgPT09ICdmdWxmaWxsZWQnKSB7XG5cdFx0XHRcdHRoaXMuX3Bvd2Vyc2hlbGxMYW5ndWFnZSA9IHJlc291cmNlcy5wb3dlcnNoZWxsTGFuZ3VhZ2UudmFsdWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ1tDb21tYW5kQXV0b0FwcHJvdmVyXSBGYWlsZWQgdG8gbG9hZCB0aGUgUG93ZXJTaGVsbCBncmFtbWFyOyBQb3dlclNoZWxsIGNvbW1hbmRzIHdpbGwgcmVxdWlyZSBjb25maXJtYXRpb24nLCByZXNvdXJjZXMucG93ZXJzaGVsbExhbmd1YWdlLnJlYXNvbik7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb21tYW5kQXV0b0FwcHJvdmVyXSBUcmVlLXNpdHRlciBpbml0aWFsaXplZCAoYmFzaD0ke3RoaXMuX2Jhc2hMYW5ndWFnZSA/ICdhdmFpbGFibGUnIDogJ3VuYXZhaWxhYmxlJ30sIHBvd2Vyc2hlbGw9JHt0aGlzLl9wb3dlcnNoZWxsTGFuZ3VhZ2UgPyAnYXZhaWxhYmxlJyA6ICd1bmF2YWlsYWJsZSd9KWApO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdbQ29tbWFuZEF1dG9BcHByb3Zlcl0gRmFpbGVkIHRvIGluaXRpYWxpemUgdHJlZS1zaXR0ZXInLCBlcnIpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLS0gUnVsZXMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIF9jb21waWxlUnVsZXMocnVsZUNvbmZpZzogQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzIHwgdW5kZWZpbmVkKTogSUF1dG9BcHByb3ZlUnVsZXMge1xuXHRcdGlmICghcnVsZUNvbmZpZykge1xuXHRcdFx0aWYgKCF0aGlzLl9mYWxsYmFja1J1bGVzKSB7XG5cdFx0XHRcdHRoaXMuX2ZhbGxiYWNrUnVsZXMgPSB0aGlzLl9jb21waWxlUnVsZUVudHJpZXMoREVGQVVMVF9URVJNSU5BTF9BVVRPX0FQUFJPVkVfUlVMRVMpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMuX2ZhbGxiYWNrUnVsZXM7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2NhY2hlZFJ1bGVDb25maWcgPT09IHJ1bGVDb25maWcgJiYgdGhpcy5fY2FjaGVkUnVsZXMpIHtcblx0XHRcdHJldHVybiB0aGlzLl9jYWNoZWRSdWxlcztcblx0XHR9XG5cblx0XHR0aGlzLl9jYWNoZWRSdWxlQ29uZmlnID0gcnVsZUNvbmZpZztcblx0XHR0aGlzLl9jYWNoZWRSdWxlcyA9IHRoaXMuX2NvbXBpbGVSdWxlRW50cmllcyhydWxlQ29uZmlnKTtcblx0XHRyZXR1cm4gdGhpcy5fY2FjaGVkUnVsZXM7XG5cdH1cblxuXHRwcml2YXRlIF9jb21waWxlUnVsZUVudHJpZXMocnVsZUNvbmZpZzogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVWYWx1ZT4+KTogSUF1dG9BcHByb3ZlUnVsZXMge1xuXHRcdGNvbnN0IGFsbG93UnVsZXM6IElBdXRvQXBwcm92ZVJ1bGVbXSA9IFtdO1xuXHRcdGNvbnN0IGRlbnlSdWxlczogSUF1dG9BcHByb3ZlUnVsZVtdID0gW107XG5cdFx0Y29uc3QgYWxsb3dDb21tYW5kTGluZVJ1bGVzOiBJQXV0b0FwcHJvdmVSdWxlW10gPSBbXTtcblx0XHRjb25zdCBkZW55Q29tbWFuZExpbmVSdWxlczogSUF1dG9BcHByb3ZlUnVsZVtdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhydWxlQ29uZmlnKSkge1xuXHRcdFx0Y29uc3QgcmVnZXggPSBjb252ZXJ0QXV0b0FwcHJvdmVFbnRyeVRvUmVnZXgoa2V5KTtcblx0XHRcdGNvbnN0IHJ1bGUgPSB7XG5cdFx0XHRcdHJlZ2V4LFxuXHRcdFx0XHRyZWdleENhc2VJbnNlbnNpdGl2ZTogcmVnZXguZmxhZ3MuaW5jbHVkZXMoJ2knKSA/IHJlZ2V4IDogbmV3IFJlZ0V4cChyZWdleC5zb3VyY2UsIHJlZ2V4LmZsYWdzICsgJ2knKSxcblx0XHRcdH07XG5cdFx0XHRpZiAodmFsdWUgPT09IHRydWUpIHtcblx0XHRcdFx0YWxsb3dSdWxlcy5wdXNoKHJ1bGUpO1xuXHRcdFx0fSBlbHNlIGlmICh2YWx1ZSA9PT0gZmFsc2UpIHtcblx0XHRcdFx0ZGVueVJ1bGVzLnB1c2gocnVsZSk7XG5cdFx0XHR9IGVsc2UgaWYgKHZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdHlwZW9mIHZhbHVlLmFwcHJvdmUgPT09ICdib29sZWFuJykge1xuXHRcdFx0XHRpZiAodmFsdWUuYXBwcm92ZSkge1xuXHRcdFx0XHRcdGlmICh2YWx1ZS5tYXRjaENvbW1hbmRMaW5lID09PSB0cnVlKSB7XG5cdFx0XHRcdFx0XHRhbGxvd0NvbW1hbmRMaW5lUnVsZXMucHVzaChydWxlKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0YWxsb3dSdWxlcy5wdXNoKHJ1bGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpZiAodmFsdWUubWF0Y2hDb21tYW5kTGluZSA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRcdFx0ZGVueUNvbW1hbmRMaW5lUnVsZXMucHVzaChydWxlKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZGVueVJ1bGVzLnB1c2gocnVsZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgYWxsb3dSdWxlcywgZGVueVJ1bGVzLCBhbGxvd0NvbW1hbmRMaW5lUnVsZXMsIGRlbnlDb21tYW5kTGluZVJ1bGVzIH07XG5cdH1cbn1cblxuLy8gLS0tLSBSZWdleCBjb252ZXJzaW9uIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZnVuY3Rpb24gY29udmVydEF1dG9BcHByb3ZlRW50cnlUb1JlZ2V4KHZhbHVlOiBzdHJpbmcpOiBSZWdFeHAge1xuXHQvLyBJZiB3cmFwcGVkIGluIGAvYCwgdHJlYXQgYXMgcmVnZXhcblx0Y29uc3QgcmVnZXhNYXRjaCA9IHZhbHVlLm1hdGNoKC9eXFwvKD88cGF0dGVybj4uKylcXC8oPzxmbGFncz5bZGdpbXN1dnldKikkLyk7XG5cdGNvbnN0IHJlZ2V4UGF0dGVybiA9IHJlZ2V4TWF0Y2g/Lmdyb3Vwcz8ucGF0dGVybjtcblx0aWYgKHJlZ2V4UGF0dGVybikge1xuXHRcdGxldCBmbGFncyA9IHJlZ2V4TWF0Y2guZ3JvdXBzPy5mbGFncztcblx0XHRpZiAoZmxhZ3MpIHtcblx0XHRcdGZsYWdzID0gZmxhZ3MucmVwbGFjZUFsbCgnZycsICcnKTtcblx0XHR9XG5cblx0XHRpZiAocmVnZXhQYXR0ZXJuID09PSAnLionKSB7XG5cdFx0XHRyZXR1cm4gbmV3IFJlZ0V4cChyZWdleFBhdHRlcm4pO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZWdleCA9IG5ldyBSZWdFeHAocmVnZXhQYXR0ZXJuLCBmbGFncyB8fCB1bmRlZmluZWQpO1xuXHRcdFx0aWYgKHJlZ0V4cExlYWRzVG9FbmRsZXNzTG9vcChyZWdleCkpIHtcblx0XHRcdFx0cmV0dXJuIG5ldmVyTWF0Y2hSZWdleDtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZWdleDtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBuZXZlck1hdGNoUmVnZXg7XG5cdFx0fVxuXHR9XG5cblx0aWYgKHZhbHVlID09PSAnJykge1xuXHRcdHJldHVybiBuZXZlck1hdGNoUmVnZXg7XG5cdH1cblxuXHRsZXQgc2FuaXRpemVkVmFsdWU6IHN0cmluZztcblxuXHQvLyBNYXRjaCBib3RoIHBhdGggc2VwYXJhdG9ycyBpZiBpdCBsb29rcyBsaWtlIGEgcGF0aFxuXHRpZiAodmFsdWUuaW5jbHVkZXMoJy8nKSB8fCB2YWx1ZS5pbmNsdWRlcygnXFxcXCcpKSB7XG5cdFx0bGV0IHBhdHRlcm4gPSB2YWx1ZS5yZXBsYWNlKC9bL1xcXFxdL2csICclJVBBVEhfU0VQJSUnKTtcblx0XHRwYXR0ZXJuID0gZXNjYXBlUmVnRXhwQ2hhcmFjdGVycyhwYXR0ZXJuKTtcblx0XHRwYXR0ZXJuID0gcGF0dGVybi5yZXBsYWNlKC8lJVBBVEhfU0VQJSUqL2csICdbL1xcXFxcXFxcXScpO1xuXHRcdHNhbml0aXplZFZhbHVlID0gYF4oPzpcXFxcLlsvXFxcXFxcXFxdKT8ke3BhdHRlcm59YDtcblx0fSBlbHNlIHtcblx0XHRzYW5pdGl6ZWRWYWx1ZSA9IGVzY2FwZVJlZ0V4cENoYXJhY3RlcnModmFsdWUpO1xuXHR9XG5cblx0cmV0dXJuIG5ldyBSZWdFeHAoYF4ke3Nhbml0aXplZFZhbHVlfVxcXFxiYCk7XG59XG5cbi8vIC0tLS0gRGVmYXVsdCBydWxlcyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vL1xuLy8gQ29tcGF0aWJpbGl0eSBmYWxsYmFjayBmb3IgY2xpZW50cyB0aGF0IGRvIG5vdCBmb3J3YXJkIHRoZSBWUyBDb2RlXG4vLyBgY2hhdC50b29scy50ZXJtaW5hbC5hdXRvQXBwcm92ZWAgc2V0dGluZy5cbi8vIFRPRE86IFJlbW92ZSB0aGlzIGZhbGxiYWNrIG9uY2UgYWxsIGFnZW50LWhvc3QgY2xpZW50cyBhcmUgZ3VhcmFudGVlZCB0b1xuLy8gZm9yd2FyZCBgY2hhdC50b29scy50ZXJtaW5hbC5hdXRvQXBwcm92ZWAgYmVmb3JlIHNoZWxsIGFwcHJvdmFscyBydW4uXG5cbmNvbnN0IERFRkFVTFRfVEVSTUlOQUxfQVVUT19BUFBST1ZFX1JVTEVTOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZVZhbHVlPj4gPSB7XG5cdC8vIFNhZmUgcmVhZG9ubHkgY29tbWFuZHNcblx0Y2Q6IHRydWUsXG5cdGVjaG86IHRydWUsXG5cdGxzOiB0cnVlLFxuXHRkaXI6IHRydWUsXG5cdHB3ZDogdHJ1ZSxcblx0Y2F0OiB0cnVlLFxuXHRoZWFkOiB0cnVlLFxuXHR0YWlsOiB0cnVlLFxuXHRmaW5kc3RyOiB0cnVlLFxuXHR3YzogdHJ1ZSxcblx0dHI6IHRydWUsXG5cdGN1dDogdHJ1ZSxcblx0Y21wOiB0cnVlLFxuXHR3aGljaDogdHJ1ZSxcblx0YmFzZW5hbWU6IHRydWUsXG5cdGRpcm5hbWU6IHRydWUsXG5cdHJlYWxwYXRoOiB0cnVlLFxuXHRyZWFkbGluazogdHJ1ZSxcblx0c3RhdDogdHJ1ZSxcblx0ZmlsZTogdHJ1ZSxcblx0b2Q6IHRydWUsXG5cdGR1OiB0cnVlLFxuXHRkZjogdHJ1ZSxcblx0c2xlZXA6IHRydWUsXG5cdG5sOiB0cnVlLFxuXG5cdGdyZXA6IHRydWUsXG5cblx0Ly8gU2FmZSBnaXQgc3ViLWNvbW1hbmRzXG5cdC4uLmdpdEF1dG9BcHByb3ZlUnVsZXMsXG5cblx0Ly8gRG9ja2VyIHJlYWRvbmx5IHN1Yi1jb21tYW5kc1xuXHQnL15kb2NrZXJcXFxccysocHN8aW1hZ2VzfGluZm98dmVyc2lvbnxpbnNwZWN0fGxvZ3N8dG9wfHN0YXRzfHBvcnR8ZGlmZnxzZWFyY2h8ZXZlbnRzKVxcXFxiLyc6IHRydWUsXG5cdCcvXmRvY2tlclxcXFxzKyhjb250YWluZXJ8aW1hZ2V8bmV0d29ya3x2b2x1bWV8Y29udGV4dHxzeXN0ZW0pXFxcXHMrKGxzfHBzfGluc3BlY3R8aGlzdG9yeXxzaG93fGRmfGluZm8pXFxcXGIvJzogdHJ1ZSxcblx0Jy9eZG9ja2VyXFxcXHMrY29tcG9zZVxcXFxzKyhwc3xsc3x0b3B8bG9nc3xpbWFnZXN8Y29uZmlnfHZlcnNpb258cG9ydHxldmVudHMpXFxcXGIvJzogdHJ1ZSxcblxuXHQvLyBQb3dlclNoZWxsXG5cdC4uLnBvd2Vyc2hlbGxBdXRvQXBwcm92ZVJ1bGVzLFxuXG5cdC8vIFBhY2thZ2UgbWFuYWdlciByZWFkLW9ubHkgY29tbWFuZHNcblx0Jy9ebnBtXFxcXHMrKGxzfGxpc3R8b3V0ZGF0ZWR8dmlld3xpbmZvfHNob3d8ZXhwbGFpbnx3aHl8cm9vdHxwcmVmaXh8YmlufHNlYXJjaHxkb2N0b3J8ZnVuZHxyZXBvfGJ1Z3N8ZG9jc3xob21lfGhlbHAoLXNlYXJjaCk/KVxcXFxiLyc6IHRydWUsXG5cdCcvXm5wbVxcXFxzK2NvbmZpZ1xcXFxzKyhsaXN0fGdldClcXFxcYi8nOiB0cnVlLFxuXHQnL15ucG1cXFxccytwa2dcXFxccytnZXRcXFxcYi8nOiB0cnVlLFxuXHQnL15ucG1cXFxccythdWRpdCQvJzogdHJ1ZSxcblx0Jy9ebnBtXFxcXHMrY2FjaGVcXFxccyt2ZXJpZnlcXFxcYi8nOiB0cnVlLFxuXHQnL155YXJuXFxcXHMrKGxpc3R8b3V0ZGF0ZWR8aW5mb3x3aHl8YmlufGhlbHB8dmVyc2lvbnMpXFxcXGIvJzogdHJ1ZSxcblx0Jy9eeWFyblxcXFxzK2xpY2Vuc2VzXFxcXGIvJzogdHJ1ZSxcblx0Jy9eeWFyblxcXFxzK2F1ZGl0XFxcXGIoPyEuKlxcXFxiZml4XFxcXGIpLyc6IHRydWUsXG5cdCcvXnlhcm5cXFxccytjb25maWdcXFxccysobGlzdHxnZXQpXFxcXGIvJzogdHJ1ZSxcblx0Jy9eeWFyblxcXFxzK2NhY2hlXFxcXHMrZGlyXFxcXGIvJzogdHJ1ZSxcblx0Jy9ecG5wbVxcXFxzKyhsc3xsaXN0fG91dGRhdGVkfHdoeXxyb290fGJpbnxkb2N0b3IpXFxcXGIvJzogdHJ1ZSxcblx0Jy9ecG5wbVxcXFxzK2xpY2Vuc2VzXFxcXGIvJzogdHJ1ZSxcblx0Jy9ecG5wbVxcXFxzK2F1ZGl0XFxcXGIoPyEuKlxcXFxiZml4XFxcXGIpLyc6IHRydWUsXG5cdCcvXnBucG1cXFxccytjb25maWdcXFxccysobGlzdHxnZXQpXFxcXGIvJzogdHJ1ZSxcblxuXHQvLyBTYWZlIGxvY2tmaWxlLW9ubHkgaW5zdGFsbHNcblx0J25wbSBjaSc6IHRydWUsXG5cdCcvXnlhcm5cXFxccytpbnN0YWxsXFxcXHMrLS1mcm96ZW4tbG9ja2ZpbGVcXFxcYi8nOiB0cnVlLFxuXHQnL15wbnBtXFxcXHMraW5zdGFsbFxcXFxzKy0tZnJvemVuLWxvY2tmaWxlXFxcXGIvJzogdHJ1ZSxcblxuXHQvLyBTYWZlIGNvbW1hbmRzIHdpdGggZGFuZ2Vyb3VzIGFyZyBibG9ja2luZ1xuXHRjb2x1bW46IHRydWUsXG5cdCcvXmNvbHVtblxcXFxiLipcXFxccy1jXFxcXHMrWzAtOV17NCx9Lyc6IGZhbHNlLFxuXHRkYXRlOiB0cnVlLFxuXHQnL15kYXRlXFxcXGIuKlxcXFxzKC1zfC0tc2V0KVxcXFxiLyc6IGZhbHNlLFxuXHRmaW5kOiB0cnVlLFxuXHQnL15maW5kXFxcXGIuKlxcXFxzLShkZWxldGV8ZXhlY3xleGVjZGlyfGZwcmludHxmcHJpbnRmfGZsc3xva3xva2RpcilcXFxcYi8nOiBmYWxzZSxcblx0cmc6IHRydWUsXG5cdCcvXnJnXFxcXGIuKlxcXFxzKC0tcHJlfC0taG9zdG5hbWUtYmluKVxcXFxiLyc6IGZhbHNlLFxuXHQvLyBUT0RPOiByZXBsYWNlIHNlZCBkZW55IHJlZ2V4ZXMgd2l0aCBhIHNoYXJlZCBzY3JpcHQgYW5hbHl6ZXIgXHUyMDE0IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8zMjkyMThcblx0c2VkOiB0cnVlLFxuXHQnL15zZWRcXFxcYi4qXFxcXHMoLVthLXpBLVpdKihlfGYpW2EtekEtWl0qfC0tZXhwcmVzc2lvbnwtLWZpbGUpXFxcXGIvJzogZmFsc2UsXG5cdCcvXnNlZFxcXFxiLipzXFxcXC8uKlxcXFwvLipcXFxcL1tld10vJzogZmFsc2UsXG5cdC8vIFF1b3RlZCBwb3NpdGlvbmFsIHNjcmlwdCB3aG9zZSBmaXJzdCBjb21tYW5kIGlzIGUvci9SL3cvVy4gVGhlIG9wZW5pbmcgcXVvdGUgaXNcblx0Ly8gY2FwdHVyZWQgc28gdGhlIGNsb3NpbmcgcXVvdGUgbXVzdCBtYXRjaCBpdCwgYW5kIHdoaXRlc3BhY2UgYW5kIGAhYCBhcmUgYWxsb3dlZFxuXHQvLyBhcm91bmQgdGhlIG9wdGlvbmFsIGFkZHJlc3Mgc2luY2Ugc2VkIGlnbm9yZXMgdGhlbS4gVGhlIG9wdGlvbiBwcmVmaXggYWxzbyBza2lwc1xuXHQvLyB0aGUgc2VwYXJhdGUgb3BlcmFuZCBjb25zdW1lZCBieSAtbC8tLWxpbmUtbGVuZ3RoLlxuXHQnL15zZWRcXFxcYig/OlxcXFxzKyg/Oig/Oi1sfC0tbGluZS1sZW5ndGgpXFxcXHMrXFxcXFMrfC0tbGluZS1sZW5ndGg9XFxcXFMrfC1cXFxcUyspKSpcXFxccysoW1xcJ1wiXSlcXFxccyooPzooPzpcXFxcZCt8XFxcXCR8XFxcXC8oPzpcXFxcXFxcXC58W15cXFxcL10pKlxcXFwvKSg/OlxcXFxzKixcXFxccyooPzpcXFxcZCt8XFxcXCR8XFxcXC8oPzpcXFxcXFxcXC58W15cXFxcL10pKlxcXFwvKSk/KT9cXFxccyohP1xcXFxzKltlclJ3V10oPzpcXFxcc3xcXFxcMSkvJzogZmFsc2UsXG5cdC8vIFNhbWUgZGFuZ2Vyb3VzIGNvbW1hbmRzIGFmdGVyIGEgYDtgIG9yIGB7YCBzZXBhcmF0b3IgaW5zaWRlIGEgcXVvdGVkIHNjcmlwdC5cblx0Ly8gRXNjYXBlZCBjaGFyYWN0ZXJzIGFyZSBjb25zdW1lZCBiZWZvcmUgdGVzdGluZyBmb3IgdGhlIG1hdGNoaW5nIGNsb3NpbmcgcXVvdGUuXG5cdCcvXnNlZFxcXFxiKD86XFxcXHMrKD86KD86LWx8LS1saW5lLWxlbmd0aClcXFxccytcXFxcUyt8LS1saW5lLWxlbmd0aD1cXFxcUyt8LVxcXFxTKykpKlxcXFxzKyhbXFwnXCJdKSg/OlxcXFxcXFxcLnwoPyFcXFxcMSkuKSpbO3tdXFxcXHMqKD86KD86XFxcXGQrfFxcXFwkfFxcXFwvKD86XFxcXFxcXFwufFteXFxcXC9dKSpcXFxcLykoPzpcXFxccyosXFxcXHMqKD86XFxcXGQrfFxcXFwkfFxcXFwvKD86XFxcXFxcXFwufFteXFxcXC9dKSpcXFxcLykpPyk/XFxcXHMqIT9cXFxccypbZXJSd1ddKD86XFxcXHN8XFxcXDF8Wzt9XSkvJzogZmFsc2UsXG5cdC8vIFVucXVvdGVkIHBvc2l0aW9uYWwgc2NyaXB0IGZvcm0gKGUuZy4gYHNlZCAxZSBpZGAsIGBzZWQgdyBmaWxlYCwgYHNlZCAvcGF0L2UgZmlsZWApXG5cdCcvXnNlZFxcXFxiKD86XFxcXHMrKD86KD86LWx8LS1saW5lLWxlbmd0aClcXFxccytcXFxcUyt8LS1saW5lLWxlbmd0aD1cXFxcUyt8LVxcXFxTKykpKlxcXFxzKyg/Oig/OlxcXFxkK3xcXFxcJHxcXFxcLyg/OlxcXFxcXFxcLnxbXlxcXFwvXSkqXFxcXC8pKD86XFxcXHMqLFxcXFxzKig/OlxcXFxkK3xcXFxcJHxcXFxcLyg/OlxcXFxcXFxcLnxbXlxcXFwvXSkqXFxcXC8pKT8pP1xcXFxzKiE/XFxcXHMqW2VyUndXXSg/OlxcXFxzfCQpLyc6IGZhbHNlLFxuXHQuLi5zb3J0QXV0b0FwcHJvdmVSdWxlcyxcblx0dHJlZTogdHJ1ZSxcblx0Jy9edHJlZVxcXFxiLipcXFxccy1vXFxcXGIvJzogZmFsc2UsXG5cdCcvXnh4ZCQvJzogdHJ1ZSxcblx0Jy9eeHhkXFxcXGIoXFxcXHMrLVxcXFxTKykqXFxcXHMrW14tXFxcXHNdXFxcXFMqJC8nOiB0cnVlLFxuXG5cdC8vIERhbmdlcm91cyBjb21tYW5kc1xuXHRybTogZmFsc2UsXG5cdHJtZGlyOiBmYWxzZSxcblx0ZGVsOiBmYWxzZSxcblx0J1JlbW92ZS1JdGVtJzogZmFsc2UsXG5cdHJpOiBmYWxzZSxcblx0cmQ6IGZhbHNlLFxuXHRlcmFzZTogZmFsc2UsXG5cdGRkOiBmYWxzZSxcblx0a2lsbDogZmFsc2UsXG5cdHBzOiBmYWxzZSxcblx0dG9wOiBmYWxzZSxcblx0J1N0b3AtUHJvY2Vzcyc6IGZhbHNlLFxuXHRzcHBzOiBmYWxzZSxcblx0dGFza2tpbGw6IGZhbHNlLFxuXHQndGFza2tpbGwuZXhlJzogZmFsc2UsXG5cdGN1cmw6IGZhbHNlLFxuXHR3Z2V0OiBmYWxzZSxcblx0J0ludm9rZS1SZXN0TWV0aG9kJzogZmFsc2UsXG5cdCdJbnZva2UtV2ViUmVxdWVzdCc6IGZhbHNlLFxuXHRpcm06IGZhbHNlLFxuXHRpd3I6IGZhbHNlLFxuXHRjaG1vZDogZmFsc2UsXG5cdGNob3duOiBmYWxzZSxcblx0J1NldC1JdGVtUHJvcGVydHknOiBmYWxzZSxcblx0c3A6IGZhbHNlLFxuXHQnU2V0LUFjbCc6IGZhbHNlLFxuXHRqcTogZmFsc2UsXG5cdHhhcmdzOiBmYWxzZSxcblx0ZXZhbDogZmFsc2UsXG5cdCdJbnZva2UtRXhwcmVzc2lvbic6IGZhbHNlLFxuXHRpZXg6IGZhbHNlLFxufTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFlBQVksUUFBUTtBQUNwQixTQUFTLFlBQVksb0JBQW9CO0FBQ3pDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsd0JBQXdCLGdDQUFnQztBQUNqRSxTQUFTLFdBQVc7QUFDcEIsU0FBUyw2QkFBNkI7QUFFdEMsU0FBUyxvREFBb0Q7QUFDN0QsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw0QkFBNEI7QUFRckMsTUFBTSw4QkFBbUQsb0JBQUksSUFBSTtBQUFBLEVBQ2hFO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQ0QsQ0FBQztBQU9ELFNBQVMsMEJBQTBCLE1BQWMsY0FBaUM7QUFDakYsTUFBSSxVQUFVLEtBQUssS0FBSztBQUN4QixNQUFJLFFBQVEsV0FBVyxHQUFHO0FBQ3pCLFdBQU87QUFBQSxFQUNSO0FBR0EsTUFBSSxnQkFBZ0IsUUFBUSxZQUFZLE1BQU0sU0FBUztBQUN0RCxXQUFPO0FBQUEsRUFDUjtBQUNBLE1BQUssUUFBUSxXQUFXLEdBQUcsS0FBSyxRQUFRLFNBQVMsR0FBRyxLQUNsRCxRQUFRLFdBQVcsR0FBRyxLQUFLLFFBQVEsU0FBUyxHQUFHLEdBQUk7QUFDcEQsY0FBVSxRQUFRLE1BQU0sR0FBRyxFQUFFO0FBQUEsRUFDOUI7QUFFQSxNQUFJ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
