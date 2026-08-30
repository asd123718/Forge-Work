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
import { RunOnceScheduler } from "../../../../../base/common/async.js";
import { BugIndicatingError, ErrorNoTelemetry } from "../../../../../base/common/errors.js";
import { Lazy } from "../../../../../base/common/lazy.js";
import { Disposable, MutableDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { posix, win32 } from "../../../../../base/common/path.js";
import { ITreeSitterLibraryService } from "../../../../../editor/common/services/treeSitter/treeSitterLibraryService.js";
import { shouldRequireConfirmationForAutoApproveParse } from "../../../../../platform/terminal/common/autoApprove/autoApproveParseSafety.js";
import { SedFileWriteParser } from "../../../../../platform/terminal/common/autoApprove/sedFileWriteParser.js";
var TreeSitterCommandParserLanguage = /* @__PURE__ */ ((TreeSitterCommandParserLanguage2) => {
  TreeSitterCommandParserLanguage2["Bash"] = "bash";
  TreeSitterCommandParserLanguage2["PowerShell"] = "powershell";
  return TreeSitterCommandParserLanguage2;
})(TreeSitterCommandParserLanguage || {});
const pwshFlagEqualsRegex = /(^|\s)(-{1,2}[\w-]+)=/g;
const envOptionsWithValue = /* @__PURE__ */ new Set(["-u", "--unset", "-C", "--chdir", "-a", "--argv0"]);
function maskPwshFlagEquals(commandLine) {
  return commandLine.replace(pwshFlagEqualsRegex, (_, pre, flag) => `${pre}${flag} `);
}
let TreeSitterCommandParser = class extends Disposable {
  constructor(_treeSitterLibraryService) {
    super();
    this._treeSitterLibraryService = _treeSitterLibraryService;
    this._treeCache = this._register(new TreeCache());
    this._commandFileWriteParsers = [
      new SedFileWriteParser()
    ];
    this._parser = new Lazy(() => this._treeSitterLibraryService.getParserClass().then((ParserCtor) => new ParserCtor()));
  }
  async extractSubCommands(languageId, commandLine) {
    if (languageId === "powershell" /* PowerShell */) {
      const masked = maskPwshFlagEquals(commandLine);
      if (masked !== commandLine) {
        const captures2 = await this._queryTree(languageId, masked, "(command) @command");
        return captures2.map((e) => commandLine.substring(e.node.startIndex, e.node.endIndex));
      }
    }
    const captures = await this._queryTree(languageId, commandLine, "(command) @command");
    return captures.map((e) => e.node.text);
  }
  async extractAutoApprovalSubCommands(languageId, commandLine) {
    const masked = languageId === "powershell" /* PowerShell */ ? maskPwshFlagEquals(commandLine) : commandLine;
    const querySource = languageId === "powershell" /* PowerShell */ ? "(command) @command (assignment_expression) @unanalyzable (invokation_expression) @unanalyzable" : "(command) @command (variable_assignment) @unanalyzable (declaration_command) @unanalyzable";
    const { captures, hasError } = await this._queryTreeWithParseStatus(languageId, masked, querySource);
    const subCommands = [];
    let hasUnanalyzableSyntax = false;
    for (const capture of captures) {
      if (capture.name === "command") {
        subCommands.push(masked === commandLine ? capture.node.text : commandLine.substring(capture.node.startIndex, capture.node.endIndex));
      } else if (capture.name === "unanalyzable") {
        if (capture.node.type !== "variable_assignment" || capture.node.parent?.type !== "command") {
          hasUnanalyzableSyntax = true;
        }
      }
    }
    hasUnanalyzableSyntax ||= shouldRequireConfirmationForAutoApproveParse(
      languageId === "powershell" /* PowerShell */ ? "powershell" : "bash",
      hasError
    );
    return { subCommands, hasUnanalyzableSyntax };
  }
  async extractPwshDoubleAmpersandChainOperators(commandLine) {
    const captures = await this._queryTree("powershell" /* PowerShell */, commandLine, [
      "(",
      "  (pipeline",
      "    (pipeline_chain_tail) @double.ampersand)",
      ")"
    ].join("\n"));
    return captures;
  }
  /**
   * Extracts executable command invocations from the command line and returns
   * normalized command details for sandbox allow-listing.
   *
   * Example: `PATH=/bin /usr/bin/git commit -S -m "test" && npm install`
   * returns:
   * `[
   * 	{ keyword: 'git', args: ['commit', '-S', '-m', 'test'] },
   * 	{ keyword: 'npm', args: ['install'] }
   * ]`.
   */
  async extractCommands(languageId, commandLine) {
    const commands = [];
    for (const commandText of await this.extractSubCommands(languageId, commandLine)) {
      const command = this._parseCommand(commandText);
      if (command) {
        commands.push(command);
      }
    }
    return commands;
  }
  async getFileWrites(languageId, commandLine) {
    let query;
    switch (languageId) {
      case "bash" /* Bash */:
        query = [
          "(file_redirect",
          "  destination: [(word) (string (string_content)) (raw_string) (concatenation)] @file)"
        ].join("\n");
        break;
      case "powershell" /* PowerShell */:
        query = [
          "(redirection",
          "  (redirected_file_name) @file)"
        ].join("\n");
        break;
    }
    const captures = await this._queryTree(languageId, commandLine, query);
    return captures.map((e) => e.node.text.trim());
  }
  /**
   * Extracts file targets from commands that perform file writes beyond shell redirections.
   * Uses registered command parsers (e.g., for `sed -i`) to detect command-specific file writes.
   * Returns an array of file paths that would be modified.
   */
  async getCommandFileWrites(languageId, commandLine) {
    if (languageId !== "bash" /* Bash */) {
      return [];
    }
    const query = "(command) @command";
    const captures = await this._queryTree(languageId, commandLine, query);
    const result = [];
    for (const capture of captures) {
      const commandText = capture.node.text;
      for (const parser of this._commandFileWriteParsers) {
        if (parser.canHandle(commandText)) {
          result.push(...parser.extractFileWrites(commandText));
        }
      }
    }
    return result;
  }
  async _queryTree(languageId, commandLine, querySource) {
    const { tree, query } = await this._doQuery(languageId, commandLine, querySource);
    try {
      return query.captures(tree.rootNode);
    } finally {
      query.delete();
    }
  }
  async _queryTreeWithParseStatus(languageId, commandLine, querySource) {
    const { tree, query } = await this._doQuery(languageId, commandLine, querySource);
    try {
      return {
        captures: query.captures(tree.rootNode),
        hasError: tree.rootNode.hasError
      };
    } finally {
      query.delete();
    }
  }
  /**
   * Converts a command token to the stable keyword used by sandbox allow-list
   * rules by stripping quotes, path segments, and common executable suffixes.
   */
  _normalizeCommandKeyword(token) {
    const unquoted = token.replace(/^['"]|['"]$/g, "");
    if (!unquoted) {
      return void 0;
    }
    const pathBase = unquoted.includes("\\") ? win32.basename(unquoted) : posix.basename(unquoted);
    const normalized = pathBase.toLowerCase().replace(/\.(?:exe|cmd|bat|ps1)$/i, "");
    return normalized || void 0;
  }
  /**
   * Parses a single tree-sitter command node into command details, ignoring
   * leading environment variable assignments such as `NODE_ENV=test npm run build`.
   */
  _parseCommand(commandText) {
    const tokens = this._splitCommandTokens(commandText);
    let commandIndex = 0;
    while (commandIndex < tokens.length && this._isVariableAssignment(tokens[commandIndex])) {
      commandIndex++;
    }
    let keyword = this._normalizeCommandKeyword(tokens[commandIndex] ?? "");
    if (!keyword) {
      return void 0;
    }
    if (keyword === "env") {
      const wrappedCommandIndex = this._getEnvWrappedCommandIndex(tokens, commandIndex + 1);
      if (wrappedCommandIndex !== void 0) {
        commandIndex = wrappedCommandIndex;
        keyword = this._normalizeCommandKeyword(tokens[commandIndex] ?? "");
        if (!keyword) {
          return void 0;
        }
      }
    }
    return {
      keyword,
      args: tokens.slice(commandIndex + 1)
    };
  }
  _getEnvWrappedCommandIndex(tokens, startIndex) {
    for (let i = startIndex; i < tokens.length; i++) {
      const token = tokens[i];
      if (this._isVariableAssignment(token)) {
        continue;
      }
      if (token === "--") {
        return i + 1 < tokens.length ? i + 1 : void 0;
      }
      if (token === "-" || token.startsWith("-")) {
        const option = token.includes("=") ? token.substring(0, token.indexOf("=")) : token;
        if (!token.includes("=") && envOptionsWithValue.has(option)) {
          i++;
        }
        continue;
      }
      return i;
    }
    return void 0;
  }
  /**
   * Splits enough shell syntax for sandbox allow-listing: whitespace separates
   * tokens, quotes are removed, and backslash escapes preserve the escaped char.
   */
  _splitCommandTokens(commandText) {
    const tokens = [];
    let current = "";
    let quote;
    let escaping = false;
    for (const char of commandText.trim()) {
      if (escaping) {
        current += char;
        escaping = false;
        continue;
      }
      if (char === "\\" && quote !== "'") {
        escaping = true;
        continue;
      }
      if (quote) {
        if (char === quote) {
          quote = void 0;
        } else {
          current += char;
        }
        continue;
      }
      if (char === "'" || char === '"') {
        quote = char;
        continue;
      }
      if (/\s/.test(char)) {
        if (current) {
          tokens.push(current);
          current = "";
        }
        continue;
      }
      current += char;
    }
    if (escaping) {
      current += "\\";
    }
    if (current) {
      tokens.push(current);
    }
    return tokens;
  }
  /**
   * Returns true for simple shell-style environment variable assignments that
   * can prefix a command invocation.
   */
  _isVariableAssignment(token) {
    return /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token);
  }
  async _doQuery(languageId, commandLine, querySource) {
    const language = await this._treeSitterLibraryService.getLanguagePromise(languageId);
    if (!language) {
      throw new BugIndicatingError("Failed to fetch language grammar");
    }
    let tree = this._treeCache.get(languageId, commandLine);
    if (!tree) {
      const parser = await this._parser.value;
      parser.setLanguage(language);
      const parsedTree = parser.parse(commandLine);
      if (!parsedTree) {
        throw new ErrorNoTelemetry("Failed to parse tree");
      }
      tree = parsedTree;
      this._treeCache.set(languageId, commandLine, tree);
    }
    const query = await this._treeSitterLibraryService.createQuery(language, querySource);
    if (!query) {
      throw new BugIndicatingError("Failed to create tree sitter query");
    }
    return { tree, query };
  }
};
TreeSitterCommandParser = __decorateClass([
  __decorateParam(0, ITreeSitterLibraryService)
], TreeSitterCommandParser);
class TreeCache extends Disposable {
  constructor() {
    super();
    this._cache = /* @__PURE__ */ new Map();
    this._clearScheduler = this._register(new MutableDisposable());
    this._register(toDisposable(() => this._cache.clear()));
  }
  get(languageId, commandLine) {
    this._resetClearTimer();
    return this._cache.get(this._getCacheKey(languageId, commandLine));
  }
  set(languageId, commandLine, tree) {
    this._resetClearTimer();
    this._cache.set(this._getCacheKey(languageId, commandLine), tree);
  }
  _getCacheKey(languageId, commandLine) {
    return `${languageId}:${commandLine}`;
  }
  _resetClearTimer() {
    this._clearScheduler.value = new RunOnceScheduler(() => {
      this._cache.clear();
    }, 1e4);
    this._clearScheduler.value.schedule();
  }
}
export {
  TreeSitterCommandParser,
  TreeSitterCommandParserLanguage
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXGJyb3dzZXJcXHRyZWVTaXR0ZXJDb21tYW5kUGFyc2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgeyBQYXJzZXIsIFF1ZXJ5LCBRdWVyeUNhcHR1cmUsIFRyZWUgfSBmcm9tICdAdnNjb2RlL3RyZWUtc2l0dGVyLXdhc20nO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciwgRXJyb3JOb1RlbGVtZXRyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IHBvc2l4LCB3aW4zMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgSVRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvdHJlZVNpdHRlci90cmVlU2l0dGVyTGlicmFyeVNlcnZpY2UuanMnO1xuaW1wb3J0IHR5cGUgeyBJVGVybWluYWxTYW5kYm94Q29tbWFuZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3NhbmRib3gvY29tbW9uL3Rlcm1pbmFsU2FuZGJveFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgc2hvdWxkUmVxdWlyZUNvbmZpcm1hdGlvbkZvckF1dG9BcHByb3ZlUGFyc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vYXV0b0FwcHJvdmUvYXV0b0FwcHJvdmVQYXJzZVNhZmV0eS5qcyc7XG5pbXBvcnQgeyBTZWRGaWxlV3JpdGVQYXJzZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vYXV0b0FwcHJvdmUvc2VkRmlsZVdyaXRlUGFyc2VyLmpzJztcbmltcG9ydCB7IElDb21tYW5kRmlsZVdyaXRlUGFyc2VyIH0gZnJvbSAnLi9jb21tYW5kUGFyc2Vycy9jb21tYW5kRmlsZVdyaXRlUGFyc2VyLmpzJztcblxuZXhwb3J0IGNvbnN0IGVudW0gVHJlZVNpdHRlckNvbW1hbmRQYXJzZXJMYW5ndWFnZSB7XG5cdEJhc2ggPSAnYmFzaCcsXG5cdFBvd2VyU2hlbGwgPSAncG93ZXJzaGVsbCcsXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUF1dG9BcHByb3ZhbENvbW1hbmRQYXJzZVJlc3VsdCB7XG5cdHJlYWRvbmx5IHN1YkNvbW1hbmRzOiBzdHJpbmdbXTtcblx0cmVhZG9ubHkgaGFzVW5hbmFseXphYmxlU3ludGF4OiBib29sZWFuO1xufVxuXG4vKipcbiAqIE1hdGNoZXMgYSBQb3dlclNoZWxsIGNvbW1hbmQgdG9rZW4gb2YgdGhlIGZvcm0gYC1mbGFnPWAgb3IgYC0tZmxhZz1gIGF0IHRoZVxuICogc3RhcnQgb2YgaW5wdXQgb3IgZm9sbG93aW5nIHdoaXRlc3BhY2UuIFVzZWQgdG8gd29yayBhcm91bmQgYSB0cmVlLXNpdHRlclxuICogUG93ZXJTaGVsbCBncmFtbWFyIGxpbWl0YXRpb24gd2hlcmUgUE9TSVgtc3R5bGUgYC0tZmxhZz12YWx1ZWAgYXJndW1lbnRzXG4gKiAoZS5nLiBgZ2l0IGxvZyAtLWZvcm1hdD1cImF8YlwiYCkgYXJlIHBhcnNlZCBhcyBhc3NpZ25tZW50IGV4cHJlc3Npb25zIGFuZFxuICogdHJ1bmNhdGUgdGhlIHN1cnJvdW5kaW5nIGNvbW1hbmQuXG4gKlxuICogU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yOTQwMTBcbiAqIFRPRE86IFJlbW92ZSBvbmNlIHVwc3RyZWFtIHRyZWUtc2l0dGVyIFBvd2VyU2hlbGwgZ3JhbW1lciBpcyB1cGRhdGVkLlxuICovXG5jb25zdCBwd3NoRmxhZ0VxdWFsc1JlZ2V4ID0gLyhefFxccykoLXsxLDJ9W1xcdy1dKyk9L2c7XG5cbmNvbnN0IGVudk9wdGlvbnNXaXRoVmFsdWUgPSBuZXcgU2V0KFsnLXUnLCAnLS11bnNldCcsICctQycsICctLWNoZGlyJywgJy1hJywgJy0tYXJndjAnXSk7XG5cbi8vIFRPRE86IFJlbW92ZSBvbmNlIHVwc3RyZWFtIHRyZWUtc2l0dGVyIFBvd2VyU2hlbGwgZ3JhbW1lciBpcyB1cGRhdGVkLlxuZnVuY3Rpb24gbWFza1B3c2hGbGFnRXF1YWxzKGNvbW1hbmRMaW5lOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gY29tbWFuZExpbmUucmVwbGFjZShwd3NoRmxhZ0VxdWFsc1JlZ2V4LCAoXywgcHJlLCBmbGFnKSA9PiBgJHtwcmV9JHtmbGFnfSBgKTtcbn1cblxuZXhwb3J0IGNsYXNzIFRyZWVTaXR0ZXJDb21tYW5kUGFyc2VyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BhcnNlcjogTGF6eTxQcm9taXNlPFBhcnNlcj4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF90cmVlQ2FjaGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgVHJlZUNhY2hlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kRmlsZVdyaXRlUGFyc2VyczogSUNvbW1hbmRGaWxlV3JpdGVQYXJzZXJbXSA9IFtcblx0XHRuZXcgU2VkRmlsZVdyaXRlUGFyc2VyKCksXG5cdF07XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElUcmVlU2l0dGVyTGlicmFyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlOiBJVHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3BhcnNlciA9IG5ldyBMYXp5KCgpID0+IHRoaXMuX3RyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZS5nZXRQYXJzZXJDbGFzcygpLnRoZW4oUGFyc2VyQ3RvciA9PiBuZXcgUGFyc2VyQ3RvcigpKSk7XG5cdH1cblxuXHRhc3luYyBleHRyYWN0U3ViQ29tbWFuZHMobGFuZ3VhZ2VJZDogVHJlZVNpdHRlckNvbW1hbmRQYXJzZXJMYW5ndWFnZSwgY29tbWFuZExpbmU6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHRpZiAobGFuZ3VhZ2VJZCA9PT0gVHJlZVNpdHRlckNvbW1hbmRQYXJzZXJMYW5ndWFnZS5Qb3dlclNoZWxsKSB7XG5cdFx0XHRjb25zdCBtYXNrZWQgPSBtYXNrUHdzaEZsYWdFcXVhbHMoY29tbWFuZExpbmUpO1xuXHRcdFx0aWYgKG1hc2tlZCAhPT0gY29tbWFuZExpbmUpIHtcblx0XHRcdFx0Y29uc3QgY2FwdHVyZXMgPSBhd2FpdCB0aGlzLl9xdWVyeVRyZWUobGFuZ3VhZ2VJZCwgbWFza2VkLCAnKGNvbW1hbmQpIEBjb21tYW5kJyk7XG5cdFx0XHRcdC8vIE1hc2tlZCBjb21tYW5kIGxpbmUgaGFzIGlkZW50aWNhbCBjaGFyYWN0ZXIgcG9zaXRpb25zLCBzbyBzbGljZSB0aGUgb3JpZ2luYWxcblx0XHRcdFx0Ly8gdG8gcHJlc2VydmUgdGhlIHVzZXItdmlzaWJsZSB0ZXh0IChpbmNsdWRpbmcgdGhlIGA9YCBjaGFyYWN0ZXJzKS5cblx0XHRcdFx0cmV0dXJuIGNhcHR1cmVzLm1hcChlID0+IGNvbW1hbmRMaW5lLnN1YnN0cmluZyhlLm5vZGUuc3RhcnRJbmRleCwgZS5ub2RlLmVuZEluZGV4KSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGNhcHR1cmVzID0gYXdhaXQgdGhpcy5fcXVlcnlUcmVlKGxhbmd1YWdlSWQsIGNvbW1hbmRMaW5lLCAnKGNvbW1hbmQpIEBjb21tYW5kJyk7XG5cdFx0cmV0dXJuIGNhcHR1cmVzLm1hcChlID0+IGUubm9kZS50ZXh0KTtcblx0fVxuXG5cdGFzeW5jIGV4dHJhY3RBdXRvQXBwcm92YWxTdWJDb21tYW5kcyhsYW5ndWFnZUlkOiBUcmVlU2l0dGVyQ29tbWFuZFBhcnNlckxhbmd1YWdlLCBjb21tYW5kTGluZTogc3RyaW5nKTogUHJvbWlzZTxJQXV0b0FwcHJvdmFsQ29tbWFuZFBhcnNlUmVzdWx0PiB7XG5cdFx0Y29uc3QgbWFza2VkID0gbGFuZ3VhZ2VJZCA9PT0gVHJlZVNpdHRlckNvbW1hbmRQYXJzZXJMYW5ndWFnZS5Qb3dlclNoZWxsID8gbWFza1B3c2hGbGFnRXF1YWxzKGNvbW1hbmRMaW5lKSA6IGNvbW1hbmRMaW5lO1xuXHRcdGNvbnN0IHF1ZXJ5U291cmNlID0gbGFuZ3VhZ2VJZCA9PT0gVHJlZVNpdHRlckNvbW1hbmRQYXJzZXJMYW5ndWFnZS5Qb3dlclNoZWxsXG5cdFx0XHQ/ICcoY29tbWFuZCkgQGNvbW1hbmQgKGFzc2lnbm1lbnRfZXhwcmVzc2lvbikgQHVuYW5hbHl6YWJsZSAoaW52b2thdGlvbl9leHByZXNzaW9uKSBAdW5hbmFseXphYmxlJ1xuXHRcdFx0OiAnKGNvbW1hbmQpIEBjb21tYW5kICh2YXJpYWJsZV9hc3NpZ25tZW50KSBAdW5hbmFseXphYmxlIChkZWNsYXJhdGlvbl9jb21tYW5kKSBAdW5hbmFseXphYmxlJztcblx0XHRjb25zdCB7IGNhcHR1cmVzLCBoYXNFcnJvciB9ID0gYXdhaXQgdGhpcy5fcXVlcnlUcmVlV2l0aFBhcnNlU3RhdHVzKGxhbmd1YWdlSWQsIG1hc2tlZCwgcXVlcnlTb3VyY2UpO1xuXHRcdGNvbnN0IHN1YkNvbW1hbmRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGxldCBoYXNVbmFuYWx5emFibGVTeW50YXggPSBmYWxzZTtcblx0XHRmb3IgKGNvbnN0IGNhcHR1cmUgb2YgY2FwdHVyZXMpIHtcblx0XHRcdGlmIChjYXB0dXJlLm5hbWUgPT09ICdjb21tYW5kJykge1xuXHRcdFx0XHRzdWJDb21tYW5kcy5wdXNoKG1hc2tlZCA9PT0gY29tbWFuZExpbmUgPyBjYXB0dXJlLm5vZGUudGV4dCA6IGNvbW1hbmRMaW5lLnN1YnN0cmluZyhjYXB0dXJlLm5vZGUuc3RhcnRJbmRleCwgY2FwdHVyZS5ub2RlLmVuZEluZGV4KSk7XG5cdFx0XHR9IGVsc2UgaWYgKGNhcHR1cmUubmFtZSA9PT0gJ3VuYW5hbHl6YWJsZScpIHtcblx0XHRcdFx0Ly8gUHJlZml4IGVudiBhc3NpZ25tZW50cyAoYEZPTz1iYXIgZ2l0IHN0YXR1c2ApIGFyZSBjaGlsZHJlbiBvZiB0aGVcblx0XHRcdFx0Ly8gY29tbWFuZCBub2RlIGFuZCBhcmUgaGFuZGxlZCBieSB0aGUgZXhpc3RpbmcgdHJhbnNpZW50LWVudiBkZW55XG5cdFx0XHRcdC8vIHBhdGg7IG9ubHkgc3RhbmRhbG9uZSBzaGVsbC1zdGF0ZSBtdXRhdGlvbnMgZmFpbCBjbG9zZWQgaGVyZS5cblx0XHRcdFx0aWYgKGNhcHR1cmUubm9kZS50eXBlICE9PSAndmFyaWFibGVfYXNzaWdubWVudCcgfHwgY2FwdHVyZS5ub2RlLnBhcmVudD8udHlwZSAhPT0gJ2NvbW1hbmQnKSB7XG5cdFx0XHRcdFx0aGFzVW5hbmFseXphYmxlU3ludGF4ID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRoYXNVbmFuYWx5emFibGVTeW50YXggfHw9IHNob3VsZFJlcXVpcmVDb25maXJtYXRpb25Gb3JBdXRvQXBwcm92ZVBhcnNlKFxuXHRcdFx0bGFuZ3VhZ2VJZCA9PT0gVHJlZVNpdHRlckNvbW1hbmRQYXJzZXJMYW5ndWFnZS5Qb3dlclNoZWxsID8gJ3Bvd2Vyc2hlbGwnIDogJ2Jhc2gnLFxuXHRcdFx0aGFzRXJyb3IsXG5cdFx0KTtcblx0XHRyZXR1cm4geyBzdWJDb21tYW5kcywgaGFzVW5hbmFseXphYmxlU3ludGF4IH07XG5cdH1cblxuXHRhc3luYyBleHRyYWN0UHdzaERvdWJsZUFtcGVyc2FuZENoYWluT3BlcmF0b3JzKGNvbW1hbmRMaW5lOiBzdHJpbmcpOiBQcm9taXNlPFF1ZXJ5Q2FwdHVyZVtdPiB7XG5cdFx0Y29uc3QgY2FwdHVyZXMgPSBhd2FpdCB0aGlzLl9xdWVyeVRyZWUoVHJlZVNpdHRlckNvbW1hbmRQYXJzZXJMYW5ndWFnZS5Qb3dlclNoZWxsLCBjb21tYW5kTGluZSwgW1xuXHRcdFx0JygnLFxuXHRcdFx0JyAgKHBpcGVsaW5lJyxcblx0XHRcdCcgICAgKHBpcGVsaW5lX2NoYWluX3RhaWwpIEBkb3VibGUuYW1wZXJzYW5kKScsXG5cdFx0XHQnKScsXG5cdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0cmV0dXJuIGNhcHR1cmVzO1xuXHR9XG5cblx0LyoqXG5cdCAqIEV4dHJhY3RzIGV4ZWN1dGFibGUgY29tbWFuZCBpbnZvY2F0aW9ucyBmcm9tIHRoZSBjb21tYW5kIGxpbmUgYW5kIHJldHVybnNcblx0ICogbm9ybWFsaXplZCBjb21tYW5kIGRldGFpbHMgZm9yIHNhbmRib3ggYWxsb3ctbGlzdGluZy5cblx0ICpcblx0ICogRXhhbXBsZTogYFBBVEg9L2JpbiAvdXNyL2Jpbi9naXQgY29tbWl0IC1TIC1tIFwidGVzdFwiICYmIG5wbSBpbnN0YWxsYFxuXHQgKiByZXR1cm5zOlxuXHQgKiBgW1xuXHQgKiBcdHsga2V5d29yZDogJ2dpdCcsIGFyZ3M6IFsnY29tbWl0JywgJy1TJywgJy1tJywgJ3Rlc3QnXSB9LFxuXHQgKiBcdHsga2V5d29yZDogJ25wbScsIGFyZ3M6IFsnaW5zdGFsbCddIH1cblx0ICogXWAuXG5cdCAqL1xuXHRhc3luYyBleHRyYWN0Q29tbWFuZHMobGFuZ3VhZ2VJZDogVHJlZVNpdHRlckNvbW1hbmRQYXJzZXJMYW5ndWFnZSwgY29tbWFuZExpbmU6IHN0cmluZyk6IFByb21pc2U8SVRlcm1pbmFsU2FuZGJveENvbW1hbmRbXT4ge1xuXHRcdGNvbnN0IGNvbW1hbmRzOiBJVGVybWluYWxTYW5kYm94Q29tbWFuZFtdID0gW107XG5cdFx0Zm9yIChjb25zdCBjb21tYW5kVGV4dCBvZiBhd2FpdCB0aGlzLmV4dHJhY3RTdWJDb21tYW5kcyhsYW5ndWFnZUlkLCBjb21tYW5kTGluZSkpIHtcblx0XHRcdGNvbnN0IGNvbW1hbmQgPSB0aGlzLl9wYXJzZUNvbW1hbmQoY29tbWFuZFRleHQpO1xuXHRcdFx0aWYgKGNvbW1hbmQpIHtcblx0XHRcdFx0Y29tbWFuZHMucHVzaChjb21tYW5kKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGNvbW1hbmRzO1xuXHR9XG5cblx0YXN5bmMgZ2V0RmlsZVdyaXRlcyhsYW5ndWFnZUlkOiBUcmVlU2l0dGVyQ29tbWFuZFBhcnNlckxhbmd1YWdlLCBjb21tYW5kTGluZTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuXHRcdGxldCBxdWVyeTogc3RyaW5nO1xuXHRcdHN3aXRjaCAobGFuZ3VhZ2VJZCkge1xuXHRcdFx0Y2FzZSBUcmVlU2l0dGVyQ29tbWFuZFBhcnNlckxhbmd1YWdlLkJhc2g6XG5cdFx0XHRcdHF1ZXJ5ID0gW1xuXHRcdFx0XHRcdCcoZmlsZV9yZWRpcmVjdCcsXG5cdFx0XHRcdFx0JyAgZGVzdGluYXRpb246IFsod29yZCkgKHN0cmluZyAoc3RyaW5nX2NvbnRlbnQpKSAocmF3X3N0cmluZykgKGNvbmNhdGVuYXRpb24pXSBAZmlsZSknLFxuXHRcdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgVHJlZVNpdHRlckNvbW1hbmRQYXJzZXJMYW5ndWFnZS5Qb3dlclNoZWxsOlxuXHRcdFx0XHRxdWVyeSA9IFtcblx0XHRcdFx0XHQnKHJlZGlyZWN0aW9uJyxcblx0XHRcdFx0XHQnICAocmVkaXJlY3RlZF9maWxlX25hbWUpIEBmaWxlKScsXG5cdFx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRjb25zdCBjYXB0dXJlcyA9IGF3YWl0IHRoaXMuX3F1ZXJ5VHJlZShsYW5ndWFnZUlkLCBjb21tYW5kTGluZSwgcXVlcnkpO1xuXHRcdHJldHVybiBjYXB0dXJlcy5tYXAoZSA9PiBlLm5vZGUudGV4dC50cmltKCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEV4dHJhY3RzIGZpbGUgdGFyZ2V0cyBmcm9tIGNvbW1hbmRzIHRoYXQgcGVyZm9ybSBmaWxlIHdyaXRlcyBiZXlvbmQgc2hlbGwgcmVkaXJlY3Rpb25zLlxuXHQgKiBVc2VzIHJlZ2lzdGVyZWQgY29tbWFuZCBwYXJzZXJzIChlLmcuLCBmb3IgYHNlZCAtaWApIHRvIGRldGVjdCBjb21tYW5kLXNwZWNpZmljIGZpbGUgd3JpdGVzLlxuXHQgKiBSZXR1cm5zIGFuIGFycmF5IG9mIGZpbGUgcGF0aHMgdGhhdCB3b3VsZCBiZSBtb2RpZmllZC5cblx0ICovXG5cdGFzeW5jIGdldENvbW1hbmRGaWxlV3JpdGVzKGxhbmd1YWdlSWQ6IFRyZWVTaXR0ZXJDb21tYW5kUGFyc2VyTGFuZ3VhZ2UsIGNvbW1hbmRMaW5lOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0Ly8gQ3VycmVudGx5IG9ubHkgYmFzaC1saWtlIHNoZWxscyBhcmUgc3VwcG9ydGVkIGZvciBjb21tYW5kLXNwZWNpZmljIHBhcnNpbmdcblx0XHRpZiAobGFuZ3VhZ2VJZCAhPT0gVHJlZVNpdHRlckNvbW1hbmRQYXJzZXJMYW5ndWFnZS5CYXNoKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Ly8gUXVlcnkgZm9yIGFsbCBjb21tYW5kc1xuXHRcdGNvbnN0IHF1ZXJ5ID0gJyhjb21tYW5kKSBAY29tbWFuZCc7XG5cdFx0Y29uc3QgY2FwdHVyZXMgPSBhd2FpdCB0aGlzLl9xdWVyeVRyZWUobGFuZ3VhZ2VJZCwgY29tbWFuZExpbmUsIHF1ZXJ5KTtcblxuXHRcdGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGNhcHR1cmUgb2YgY2FwdHVyZXMpIHtcblx0XHRcdGNvbnN0IGNvbW1hbmRUZXh0ID0gY2FwdHVyZS5ub2RlLnRleHQ7XG5cdFx0XHRmb3IgKGNvbnN0IHBhcnNlciBvZiB0aGlzLl9jb21tYW5kRmlsZVdyaXRlUGFyc2Vycykge1xuXHRcdFx0XHRpZiAocGFyc2VyLmNhbkhhbmRsZShjb21tYW5kVGV4dCkpIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaCguLi5wYXJzZXIuZXh0cmFjdEZpbGVXcml0ZXMoY29tbWFuZFRleHQpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcXVlcnlUcmVlKGxhbmd1YWdlSWQ6IFRyZWVTaXR0ZXJDb21tYW5kUGFyc2VyTGFuZ3VhZ2UsIGNvbW1hbmRMaW5lOiBzdHJpbmcsIHF1ZXJ5U291cmNlOiBzdHJpbmcpOiBQcm9taXNlPFF1ZXJ5Q2FwdHVyZVtdPiB7XG5cdFx0Y29uc3QgeyB0cmVlLCBxdWVyeSB9ID0gYXdhaXQgdGhpcy5fZG9RdWVyeShsYW5ndWFnZUlkLCBjb21tYW5kTGluZSwgcXVlcnlTb3VyY2UpO1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gcXVlcnkuY2FwdHVyZXModHJlZS5yb290Tm9kZSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHF1ZXJ5LmRlbGV0ZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3F1ZXJ5VHJlZVdpdGhQYXJzZVN0YXR1cyhsYW5ndWFnZUlkOiBUcmVlU2l0dGVyQ29tbWFuZFBhcnNlckxhbmd1YWdlLCBjb21tYW5kTGluZTogc3RyaW5nLCBxdWVyeVNvdXJjZTogc3RyaW5nKTogUHJvbWlzZTx7IGNhcHR1cmVzOiBRdWVyeUNhcHR1cmVbXTsgaGFzRXJyb3I6IGJvb2xlYW4gfT4ge1xuXHRcdGNvbnN0IHsgdHJlZSwgcXVlcnkgfSA9IGF3YWl0IHRoaXMuX2RvUXVlcnkobGFuZ3VhZ2VJZCwgY29tbWFuZExpbmUsIHF1ZXJ5U291cmNlKTtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y2FwdHVyZXM6IHF1ZXJ5LmNhcHR1cmVzKHRyZWUucm9vdE5vZGUpLFxuXHRcdFx0XHRoYXNFcnJvcjogdHJlZS5yb290Tm9kZS5oYXNFcnJvcixcblx0XHRcdH07XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHF1ZXJ5LmRlbGV0ZSgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIGNvbW1hbmQgdG9rZW4gdG8gdGhlIHN0YWJsZSBrZXl3b3JkIHVzZWQgYnkgc2FuZGJveCBhbGxvdy1saXN0XG5cdCAqIHJ1bGVzIGJ5IHN0cmlwcGluZyBxdW90ZXMsIHBhdGggc2VnbWVudHMsIGFuZCBjb21tb24gZXhlY3V0YWJsZSBzdWZmaXhlcy5cblx0ICovXG5cdHByaXZhdGUgX25vcm1hbGl6ZUNvbW1hbmRLZXl3b3JkKHRva2VuOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHVucXVvdGVkID0gdG9rZW4ucmVwbGFjZSgvXlsnXCJdfFsnXCJdJC9nLCAnJyk7XG5cdFx0aWYgKCF1bnF1b3RlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBwYXRoQmFzZSA9IHVucXVvdGVkLmluY2x1ZGVzKCdcXFxcJykgPyB3aW4zMi5iYXNlbmFtZSh1bnF1b3RlZCkgOiBwb3NpeC5iYXNlbmFtZSh1bnF1b3RlZCk7XG5cdFx0Y29uc3Qgbm9ybWFsaXplZCA9IHBhdGhCYXNlLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvXFwuKD86ZXhlfGNtZHxiYXR8cHMxKSQvaSwgJycpO1xuXHRcdHJldHVybiBub3JtYWxpemVkIHx8IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBQYXJzZXMgYSBzaW5nbGUgdHJlZS1zaXR0ZXIgY29tbWFuZCBub2RlIGludG8gY29tbWFuZCBkZXRhaWxzLCBpZ25vcmluZ1xuXHQgKiBsZWFkaW5nIGVudmlyb25tZW50IHZhcmlhYmxlIGFzc2lnbm1lbnRzIHN1Y2ggYXMgYE5PREVfRU5WPXRlc3QgbnBtIHJ1biBidWlsZGAuXG5cdCAqL1xuXHRwcml2YXRlIF9wYXJzZUNvbW1hbmQoY29tbWFuZFRleHQ6IHN0cmluZyk6IElUZXJtaW5hbFNhbmRib3hDb21tYW5kIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB0b2tlbnMgPSB0aGlzLl9zcGxpdENvbW1hbmRUb2tlbnMoY29tbWFuZFRleHQpO1xuXHRcdGxldCBjb21tYW5kSW5kZXggPSAwO1xuXHRcdHdoaWxlIChjb21tYW5kSW5kZXggPCB0b2tlbnMubGVuZ3RoICYmIHRoaXMuX2lzVmFyaWFibGVBc3NpZ25tZW50KHRva2Vuc1tjb21tYW5kSW5kZXhdKSkge1xuXHRcdFx0Y29tbWFuZEluZGV4Kys7XG5cdFx0fVxuXG5cdFx0bGV0IGtleXdvcmQgPSB0aGlzLl9ub3JtYWxpemVDb21tYW5kS2V5d29yZCh0b2tlbnNbY29tbWFuZEluZGV4XSA/PyAnJyk7XG5cdFx0aWYgKCFrZXl3b3JkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoa2V5d29yZCA9PT0gJ2VudicpIHtcblx0XHRcdGNvbnN0IHdyYXBwZWRDb21tYW5kSW5kZXggPSB0aGlzLl9nZXRFbnZXcmFwcGVkQ29tbWFuZEluZGV4KHRva2VucywgY29tbWFuZEluZGV4ICsgMSk7XG5cdFx0XHRpZiAod3JhcHBlZENvbW1hbmRJbmRleCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbW1hbmRJbmRleCA9IHdyYXBwZWRDb21tYW5kSW5kZXg7XG5cdFx0XHRcdGtleXdvcmQgPSB0aGlzLl9ub3JtYWxpemVDb21tYW5kS2V5d29yZCh0b2tlbnNbY29tbWFuZEluZGV4XSA/PyAnJyk7XG5cdFx0XHRcdGlmICgha2V5d29yZCkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0a2V5d29yZCxcblx0XHRcdGFyZ3M6IHRva2Vucy5zbGljZShjb21tYW5kSW5kZXggKyAxKSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0RW52V3JhcHBlZENvbW1hbmRJbmRleCh0b2tlbnM6IHJlYWRvbmx5IHN0cmluZ1tdLCBzdGFydEluZGV4OiBudW1iZXIpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdGZvciAobGV0IGkgPSBzdGFydEluZGV4OyBpIDwgdG9rZW5zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCB0b2tlbiA9IHRva2Vuc1tpXTtcblx0XHRcdGlmICh0aGlzLl9pc1ZhcmlhYmxlQXNzaWdubWVudCh0b2tlbikpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAodG9rZW4gPT09ICctLScpIHtcblx0XHRcdFx0cmV0dXJuIGkgKyAxIDwgdG9rZW5zLmxlbmd0aCA/IGkgKyAxIDogdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRva2VuID09PSAnLScgfHwgdG9rZW4uc3RhcnRzV2l0aCgnLScpKSB7XG5cdFx0XHRcdGNvbnN0IG9wdGlvbiA9IHRva2VuLmluY2x1ZGVzKCc9JykgPyB0b2tlbi5zdWJzdHJpbmcoMCwgdG9rZW4uaW5kZXhPZignPScpKSA6IHRva2VuO1xuXHRcdFx0XHRpZiAoIXRva2VuLmluY2x1ZGVzKCc9JykgJiYgZW52T3B0aW9uc1dpdGhWYWx1ZS5oYXMob3B0aW9uKSkge1xuXHRcdFx0XHRcdGkrKztcblx0XHRcdFx0fVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNwbGl0cyBlbm91Z2ggc2hlbGwgc3ludGF4IGZvciBzYW5kYm94IGFsbG93LWxpc3Rpbmc6IHdoaXRlc3BhY2Ugc2VwYXJhdGVzXG5cdCAqIHRva2VucywgcXVvdGVzIGFyZSByZW1vdmVkLCBhbmQgYmFja3NsYXNoIGVzY2FwZXMgcHJlc2VydmUgdGhlIGVzY2FwZWQgY2hhci5cblx0ICovXG5cdHByaXZhdGUgX3NwbGl0Q29tbWFuZFRva2Vucyhjb21tYW5kVGV4dDogc3RyaW5nKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IHRva2Vuczogc3RyaW5nW10gPSBbXTtcblx0XHRsZXQgY3VycmVudCA9ICcnO1xuXHRcdGxldCBxdW90ZTogJ1xcJycgfCAnXCInIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBlc2NhcGluZyA9IGZhbHNlO1xuXG5cdFx0Zm9yIChjb25zdCBjaGFyIG9mIGNvbW1hbmRUZXh0LnRyaW0oKSkge1xuXHRcdFx0aWYgKGVzY2FwaW5nKSB7XG5cdFx0XHRcdGN1cnJlbnQgKz0gY2hhcjtcblx0XHRcdFx0ZXNjYXBpbmcgPSBmYWxzZTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjaGFyID09PSAnXFxcXCcgJiYgcXVvdGUgIT09ICdcXCcnKSB7XG5cdFx0XHRcdGVzY2FwaW5nID0gdHJ1ZTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChxdW90ZSkge1xuXHRcdFx0XHRpZiAoY2hhciA9PT0gcXVvdGUpIHtcblx0XHRcdFx0XHRxdW90ZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjdXJyZW50ICs9IGNoYXI7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjaGFyID09PSAnXFwnJyB8fCBjaGFyID09PSAnXCInKSB7XG5cdFx0XHRcdHF1b3RlID0gY2hhcjtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmICgvXFxzLy50ZXN0KGNoYXIpKSB7XG5cdFx0XHRcdGlmIChjdXJyZW50KSB7XG5cdFx0XHRcdFx0dG9rZW5zLnB1c2goY3VycmVudCk7XG5cdFx0XHRcdFx0Y3VycmVudCA9ICcnO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjdXJyZW50ICs9IGNoYXI7XG5cdFx0fVxuXG5cdFx0aWYgKGVzY2FwaW5nKSB7XG5cdFx0XHRjdXJyZW50ICs9ICdcXFxcJztcblx0XHR9XG5cblx0XHRpZiAoY3VycmVudCkge1xuXHRcdFx0dG9rZW5zLnB1c2goY3VycmVudCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRva2Vucztcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRydWUgZm9yIHNpbXBsZSBzaGVsbC1zdHlsZSBlbnZpcm9ubWVudCB2YXJpYWJsZSBhc3NpZ25tZW50cyB0aGF0XG5cdCAqIGNhbiBwcmVmaXggYSBjb21tYW5kIGludm9jYXRpb24uXG5cdCAqL1xuXHRwcml2YXRlIF9pc1ZhcmlhYmxlQXNzaWdubWVudCh0b2tlbjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIC9eW0EtWmEtel9dW0EtWmEtejAtOV9dKj0uKi8udGVzdCh0b2tlbik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9kb1F1ZXJ5KGxhbmd1YWdlSWQ6IFRyZWVTaXR0ZXJDb21tYW5kUGFyc2VyTGFuZ3VhZ2UsIGNvbW1hbmRMaW5lOiBzdHJpbmcsIHF1ZXJ5U291cmNlOiBzdHJpbmcpOiBQcm9taXNlPHsgdHJlZTogVHJlZTsgcXVlcnk6IFF1ZXJ5IH0+IHtcblx0XHRjb25zdCBsYW5ndWFnZSA9IGF3YWl0IHRoaXMuX3RyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZS5nZXRMYW5ndWFnZVByb21pc2UobGFuZ3VhZ2VJZCk7XG5cdFx0aWYgKCFsYW5ndWFnZSkge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignRmFpbGVkIHRvIGZldGNoIGxhbmd1YWdlIGdyYW1tYXInKTtcblx0XHR9XG5cblx0XHRsZXQgdHJlZSA9IHRoaXMuX3RyZWVDYWNoZS5nZXQobGFuZ3VhZ2VJZCwgY29tbWFuZExpbmUpO1xuXHRcdGlmICghdHJlZSkge1xuXHRcdFx0Y29uc3QgcGFyc2VyID0gYXdhaXQgdGhpcy5fcGFyc2VyLnZhbHVlO1xuXHRcdFx0cGFyc2VyLnNldExhbmd1YWdlKGxhbmd1YWdlKTtcblx0XHRcdGNvbnN0IHBhcnNlZFRyZWUgPSBwYXJzZXIucGFyc2UoY29tbWFuZExpbmUpO1xuXHRcdFx0aWYgKCFwYXJzZWRUcmVlKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvck5vVGVsZW1ldHJ5KCdGYWlsZWQgdG8gcGFyc2UgdHJlZScpO1xuXHRcdFx0fVxuXG5cdFx0XHR0cmVlID0gcGFyc2VkVHJlZTtcblx0XHRcdHRoaXMuX3RyZWVDYWNoZS5zZXQobGFuZ3VhZ2VJZCwgY29tbWFuZExpbmUsIHRyZWUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHF1ZXJ5ID0gYXdhaXQgdGhpcy5fdHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlLmNyZWF0ZVF1ZXJ5KGxhbmd1YWdlLCBxdWVyeVNvdXJjZSk7XG5cdFx0aWYgKCFxdWVyeSkge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignRmFpbGVkIHRvIGNyZWF0ZSB0cmVlIHNpdHRlciBxdWVyeScpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IHRyZWUsIHF1ZXJ5IH07XG5cdH1cbn1cblxuLyoqXG4gKiBDYWNoZXMgdHJlZXMgdGVtcG9yYXJpbHkgdG8gYXZvaWQgcmVwYXJzaW5nIHRoZSBzYW1lIGNvbW1hbmQgbGluZSBtdWx0aXBsZVxuICogdGltZXMgaW4gcXVpY2sgc3VjY2Vzc2lvbi5cbiAqL1xuY2xhc3MgVHJlZUNhY2hlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NhY2hlID0gbmV3IE1hcDxzdHJpbmcsIFRyZWU+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NsZWFyU2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPFJ1bk9uY2VTY2hlZHVsZXI+KCkpO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX2NhY2hlLmNsZWFyKCkpKTtcblx0fVxuXG5cdGdldChsYW5ndWFnZUlkOiBUcmVlU2l0dGVyQ29tbWFuZFBhcnNlckxhbmd1YWdlLCBjb21tYW5kTGluZTogc3RyaW5nKTogVHJlZSB8IHVuZGVmaW5lZCB7XG5cdFx0dGhpcy5fcmVzZXRDbGVhclRpbWVyKCk7XG5cdFx0cmV0dXJuIHRoaXMuX2NhY2hlLmdldCh0aGlzLl9nZXRDYWNoZUtleShsYW5ndWFnZUlkLCBjb21tYW5kTGluZSkpO1xuXHR9XG5cblx0c2V0KGxhbmd1YWdlSWQ6IFRyZWVTaXR0ZXJDb21tYW5kUGFyc2VyTGFuZ3VhZ2UsIGNvbW1hbmRMaW5lOiBzdHJpbmcsIHRyZWU6IFRyZWUpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXNldENsZWFyVGltZXIoKTtcblx0XHR0aGlzLl9jYWNoZS5zZXQodGhpcy5fZ2V0Q2FjaGVLZXkobGFuZ3VhZ2VJZCwgY29tbWFuZExpbmUpLCB0cmVlKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldENhY2hlS2V5KGxhbmd1YWdlSWQ6IFRyZWVTaXR0ZXJDb21tYW5kUGFyc2VyTGFuZ3VhZ2UsIGNvbW1hbmRMaW5lOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHtsYW5ndWFnZUlkfToke2NvbW1hbmRMaW5lfWA7XG5cdH1cblxuXHRwcml2YXRlIF9yZXNldENsZWFyVGltZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fY2xlYXJTY2hlZHVsZXIudmFsdWUgPSBuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHR0aGlzLl9jYWNoZS5jbGVhcigpO1xuXHRcdH0sIDEwMDAwKTtcblx0XHR0aGlzLl9jbGVhclNjaGVkdWxlci52YWx1ZS5zY2hlZHVsZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsb0JBQW9CLHdCQUF3QjtBQUNyRCxTQUFTLFlBQVk7QUFDckIsU0FBUyxZQUFZLG1CQUFtQixvQkFBb0I7QUFDNUQsU0FBUyxPQUFPLGFBQWE7QUFDN0IsU0FBUyxpQ0FBaUM7QUFFMUMsU0FBUyxvREFBb0Q7QUFDN0QsU0FBUywwQkFBMEI7QUFHNUIsSUFBVyxrQ0FBWCxrQkFBV0EscUNBQVg7QUFDTixFQUFBQSxpQ0FBQSxVQUFPO0FBQ1AsRUFBQUEsaUNBQUEsZ0JBQWE7QUFGSSxTQUFBQTtBQUFBLEdBQUE7QUFvQmxCLE1BQU0sc0JBQXNCO0FBRTVCLE1BQU0sc0JBQXNCLG9CQUFJLElBQUksQ0FBQyxNQUFNLFdBQVcsTUFBTSxXQUFXLE1BQU0sU0FBUyxDQUFDO0FBR3ZGLFNBQVMsbUJBQW1CLGFBQTZCO0FBQ3hELFNBQU8sWUFBWSxRQUFRLHFCQUFxQixDQUFDLEdBQUcsS0FBSyxTQUFTLEdBQUcsR0FBRyxHQUFHLElBQUksR0FBRztBQUNuRjtBQUVPLElBQU0sMEJBQU4sY0FBc0MsV0FBVztBQUFBLEVBT3ZELFlBQzZDLDJCQUMzQztBQUNELFVBQU07QUFGc0M7QUFON0MsU0FBaUIsYUFBYSxLQUFLLFVBQVUsSUFBSSxVQUFVLENBQUM7QUFDNUQsU0FBaUIsMkJBQXNEO0FBQUEsTUFDdEUsSUFBSSxtQkFBbUI7QUFBQSxJQUN4QjtBQU1DLFNBQUssVUFBVSxJQUFJLEtBQUssTUFBTSxLQUFLLDBCQUEw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QjtBQUNyRCxXQUFPLDZCQUE2QixLQUFLLEtBQUs7QUFBQSxFQUMvQztBQUFBLEVBRUEsTUFBYyxTQUFTLFlBQTZDLGFBQXFCLGFBQTREO0FBQ3BKLFVBQU0sV0FBVyxNQUFNLEtBQUssMEJBQTBCLG1CQUFtQixVQUFVO0FBQ25GLFFBQUksQ0FBQyxVQUFVO0FBQ2QsWUFBTSxJQUFJLG1CQUFtQixrQ0FBa0M7QUFBQSxJQUNoRTtBQUVBLFFBQUksT0FBTyxLQUFLLFdBQVcsSUFBSSxZQUFZLFdBQVc7QUFDdEQsUUFBSSxDQUFDLE1BQU07QUFDVixZQUFNLFNBQVMsTUFBTSxLQUFLLFFBQVE7QUFDbEMsYUFBTyxZQUFZLFFBQVE7QUFDM0IsWUFBTSxhQUFhLE9BQU8sTUFBTSxXQUFXO0FBQzNDLFVBQUksQ0FBQyxZQUFZO0FBQ2hCLGNBQU0sSUFBSSxpQkFBaUIsc0JBQXNCO0FBQUEsTUFDbEQ7QUFFQSxhQUFPO0FBQ1AsV0FBSyxXQUFXLElBQUksWUFBWSxhQUFhLElBQUk7QUFBQSxJQUNsRDtBQUVBLFVBQU0sUUFBUSxNQUFNLEtBQUssMEJBQTBCLFlBQVksVUFBVSxXQUFXO0FBQ3BGLFFBQUksQ0FBQyxPQUFPO0FBQ1gsWUFBTSxJQUFJLG1CQUFtQixvQ0FBb0M7QUFBQSxJQUNsRTtBQUVBLFdBQU8sRUFBRSxNQUFNLE1BQU07QUFBQSxFQUN0QjtBQUNEO0FBM1RhLDBCQUFOO0FBQUEsRUFRSjtBQUFBLEdBUlU7QUFpVWIsTUFBTSxrQkFBa0IsV0FBVztBQUFBLEVBSWxDLGNBQWM7QUFDYixVQUFNO0FBSlAsU0FBaUIsU0FBUyxvQkFBSSxJQUFrQjtBQUNoRCxTQUFpQixrQkFBa0IsS0FBSyxVQUFVLElBQUksa0JBQW9DLENBQUM7QUFJMUYsU0FBSyxVQUFVLGFBQWEsTUFBTSxLQUFLLE9BQU8sTUFBTSxDQUFDLENBQUM7QUFBQSxFQUN2RDtBQUFBLEVBRUEsSUFBSSxZQUE2QyxhQUF1QztBQUN2RixTQUFLLGlCQUFpQjtBQUN0QixXQUFPLEtBQUssT0FBTyxJQUFJLEtBQUssYUFBYSxZQUFZLFdBQVcsQ0FBQztBQUFBLEVBQ2xFO0FBQUEsRUFFQSxJQUFJLFlBQTZDLGFBQXFCLE1BQWtCO0FBQ3ZGLFNBQUssaUJBQWlCO0FBQ3RCLFNBQUssT0FBTyxJQUFJLEtBQUssYUFBYSxZQUFZLFdBQVcsR0FBRyxJQUFJO0FBQUEsRUFDakU7QUFBQSxFQUVRLGFBQWEsWUFBNkMsYUFBNkI7QUFDOUYsV0FBTyxHQUFHLFVBQVUsSUFBSSxXQUFXO0FBQUEsRUFDcEM7QUFBQSxFQUVRLG1CQUF5QjtBQUNoQyxTQUFLLGdCQUFnQixRQUFRLElBQUksaUJBQWlCLE1BQU07QUFDdkQsV0FBSyxPQUFPLE1BQU07QUFBQSxJQUNuQixHQUFHLEdBQUs7QUFDUixTQUFLLGdCQUFnQixNQUFNLFNBQVM7QUFBQSxFQUNyQztBQUNEOyIsCiAgIm5hbWVzIjogWyJUcmVlU2l0dGVyQ29tbWFuZFBhcnNlckxhbmd1YWdlIiwgImNhcHR1cmVzIl0KfQo=
