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
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { TerminalCapability } from "../../../../../platform/terminal/common/capabilities/capabilities.js";
import * as dom from "../../../../../base/browser/dom.js";
import { asArray } from "../../../../../base/common/arrays.js";
import { localize } from "../../../../../nls.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { DecorationSelector, updateLayout } from "../../../terminal/browser/xterm/decorationStyles.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { IExtensionService } from "../../../../services/extensions/common/extensions.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { IActionWidgetService } from "../../../../../platform/actionWidget/browser/actionWidget.js";
import { getLinesForCommand } from "../../../../../platform/terminal/common/capabilities/commandDetectionCapability.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { Schemas } from "../../../../../base/common/network.js";
import { ITerminalQuickFixService, TerminalQuickFixType } from "./quickFix.js";
import { TerminalSettingId } from "../../../../../platform/terminal/common/terminal.js";
import { ActionListItemKind } from "../../../../../platform/actionWidget/browser/actionList.js";
import { CodeActionKind } from "../../../../../editor/contrib/codeAction/common/types.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { hasKey } from "../../../../../base/common/types.js";
var QuickFixDecorationSelector = /* @__PURE__ */ ((QuickFixDecorationSelector2) => {
  QuickFixDecorationSelector2["QuickFix"] = "quick-fix";
  return QuickFixDecorationSelector2;
})(QuickFixDecorationSelector || {});
const quickFixClasses = [
  "quick-fix" /* QuickFix */,
  DecorationSelector.Codicon,
  DecorationSelector.CommandDecoration,
  DecorationSelector.XtermDecoration
];
let TerminalQuickFixAddon = class extends Disposable {
  constructor(_sessionId, _aliases, _capabilities, _accessibilitySignalService, _actionWidgetService, _commandService, _configurationService, _extensionService, _labelService, _openerService, _telemetryService, _quickFixService) {
    super();
    this._sessionId = _sessionId;
    this._aliases = _aliases;
    this._capabilities = _capabilities;
    this._accessibilitySignalService = _accessibilitySignalService;
    this._actionWidgetService = _actionWidgetService;
    this._commandService = _commandService;
    this._configurationService = _configurationService;
    this._extensionService = _extensionService;
    this._labelService = _labelService;
    this._openerService = _openerService;
    this._telemetryService = _telemetryService;
    this._quickFixService = _quickFixService;
    this._commandListeners = /* @__PURE__ */ new Map();
    this._decoration = this._register(new MutableDisposable());
    this._decorationDisposables = this._register(new MutableDisposable());
    this._registeredSelectors = /* @__PURE__ */ new Set();
    this._didRun = false;
    this._onDidRequestRerunCommand = this._register(new Emitter());
    this.onDidRequestRerunCommand = this._onDidRequestRerunCommand.event;
    this._onDidUpdateQuickFixes = this._register(new Emitter());
    this.onDidUpdateQuickFixes = this._onDidUpdateQuickFixes.event;
    const commandDetectionCapability = this._capabilities.get(TerminalCapability.CommandDetection);
    if (commandDetectionCapability) {
      this._registerCommandHandlers();
    } else {
      this._register(this._capabilities.onDidAddCommandDetectionCapability(() => {
        this._registerCommandHandlers();
      }));
    }
    this._register(this._quickFixService.onDidRegisterProvider((result) => this.registerCommandFinishedListener(convertToQuickFixOptions(result))));
    this._quickFixService.extensionQuickFixes.then((quickFixSelectors) => {
      for (const selector of quickFixSelectors) {
        this.registerCommandSelector(selector);
      }
    });
    this._register(this._quickFixService.onDidRegisterCommandSelector((selector) => this.registerCommandSelector(selector)));
    this._register(this._quickFixService.onDidUnregisterProvider((id) => this._commandListeners.delete(id)));
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(TerminalSettingId.ShellIntegrationQuickFixEnabled)) {
        this._decoration.clear();
        this._decorationDisposables.clear();
      }
    }));
  }
  activate(terminal) {
    this._terminal = terminal;
  }
  showMenu() {
    if (!this._currentRenderContext) {
      return;
    }
    const actions = this._currentRenderContext.quickFixes.map((f) => new TerminalQuickFixItem(f, f.type, f.source, f.label, f.kind));
    const actionSet = {
      allActions: actions,
      hasAutoFix: false,
      hasAIFix: false,
      allAIFixes: false,
      validActions: actions,
      dispose: () => {
      }
    };
    const delegate = {
      onSelect: async (fix) => {
        fix.action?.run();
        this._actionWidgetService.hide();
      },
      onHide: () => {
        this._terminal?.focus();
      }
    };
    this._actionWidgetService.show("quickFixWidget", false, toActionWidgetItems(actionSet.validActions, true), delegate, this._currentRenderContext.anchor, this._currentRenderContext.parentElement);
  }
  registerCommandSelector(selector) {
    if (this._registeredSelectors.has(selector.id)) {
      return;
    }
    const matcherKey = selector.commandLineMatcher.toString();
    const currentOptions = this._commandListeners.get(matcherKey) || [];
    currentOptions.push({
      id: selector.id,
      type: "unresolved",
      commandLineMatcher: selector.commandLineMatcher,
      outputMatcher: selector.outputMatcher,
      commandExitResult: selector.commandExitResult,
      kind: selector.kind
    });
    this._registeredSelectors.add(selector.id);
    this._commandListeners.set(matcherKey, currentOptions);
  }
  registerCommandFinishedListener(options) {
    const matcherKey = options.commandLineMatcher.toString();
    let currentOptions = this._commandListeners.get(matcherKey) || [];
    currentOptions = currentOptions.filter((o) => o.id !== options.id);
    currentOptions.push(options);
    this._commandListeners.set(matcherKey, currentOptions);
  }
  _registerCommandHandlers() {
    const terminal = this._terminal;
    const commandDetection = this._capabilities.get(TerminalCapability.CommandDetection);
    if (!terminal || !commandDetection) {
      return;
    }
    this._register(commandDetection.onCommandFinished(async (command) => await this._resolveQuickFixes(command, this._aliases)));
  }
  /**
   * Resolves quick fixes, if any, based on the
   * @param command & its output
   */
  async _resolveQuickFixes(command, aliases) {
    const terminal = this._terminal;
    if (!terminal || command.wasReplayed) {
      return;
    }
    if (command.command !== "" && this._lastQuickFixId) {
      this._disposeQuickFix(command, this._lastQuickFixId);
    }
    const resolver = async (selector, lines) => {
      if (lines === void 0) {
        return void 0;
      }
      const id = selector.id;
      await this._extensionService.activateByEvent(`onTerminalQuickFixRequest:${id}`);
      return this._quickFixService.providers.get(id)?.provideTerminalQuickFixes(command, lines, {
        type: "resolved",
        commandLineMatcher: selector.commandLineMatcher,
        outputMatcher: selector.outputMatcher,
        commandExitResult: selector.commandExitResult,
        kind: selector.kind,
        id: selector.id
      }, new CancellationTokenSource().token);
    };
    const result = await getQuickFixesForCommand(aliases, terminal, command, this._commandListeners, this._commandService, this._openerService, this._labelService, this._onDidRequestRerunCommand, resolver);
    if (!result) {
      return;
    }
    this._quickFixes = result;
    this._lastQuickFixId = this._quickFixes[0].id;
    this._registerQuickFixDecoration();
    this._onDidUpdateQuickFixes.fire({ command, actions: this._quickFixes });
    this._quickFixes = void 0;
  }
  _disposeQuickFix(command, id) {
    this._telemetryService?.publicLog2("terminal/quick-fix", {
      quickFixId: id,
      ranQuickFix: this._didRun,
      terminalSessionId: this._sessionId
    });
    this._decoration.clear();
    this._decorationDisposables.clear();
    this._onDidUpdateQuickFixes.fire({ command, actions: this._quickFixes });
    this._quickFixes = void 0;
    this._lastQuickFixId = void 0;
    this._didRun = false;
  }
  /**
   * Registers a decoration with the quick fixes
   */
  _registerQuickFixDecoration() {
    if (!this._terminal) {
      return;
    }
    const quickFixEnabled = this._configurationService.getValue(TerminalSettingId.ShellIntegrationQuickFixEnabled);
    if (!quickFixEnabled) {
      return;
    }
    this._decoration.clear();
    this._decorationDisposables.clear();
    const quickFixes = this._quickFixes;
    if (!quickFixes || quickFixes.length === 0) {
      return;
    }
    const marker = this._terminal.registerMarker();
    if (!marker) {
      return;
    }
    const decoration = this._decoration.value = this._terminal.registerDecoration({ marker, width: 2, layer: "top" });
    if (!decoration) {
      return;
    }
    const store = this._decorationDisposables.value = new DisposableStore();
    store.add(decoration.onRender((e) => {
      const rect = e.getBoundingClientRect();
      const anchor = {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      };
      if (e.classList.contains("quick-fix" /* QuickFix */)) {
        if (this._currentRenderContext) {
          this._currentRenderContext.anchor = anchor;
        }
        return;
      }
      e.classList.add(...quickFixClasses);
      const isExplainOnly = quickFixes.every((e2) => e2.kind === "explain");
      if (isExplainOnly) {
        e.classList.add("explainOnly");
      }
      e.classList.add(...ThemeIcon.asClassNameArray(isExplainOnly ? Codicon.sparkle : Codicon.lightBulb));
      updateLayout(this._configurationService, e);
      this._accessibilitySignalService.playSignal(AccessibilitySignal.terminalQuickFix);
      const parentElement = e.closest(".xterm")?.parentElement;
      if (!parentElement) {
        return;
      }
      this._currentRenderContext = { quickFixes, anchor, parentElement };
      this._register(dom.addDisposableListener(e, dom.EventType.CLICK, () => this.showMenu()));
    }));
    store.add(decoration.onDispose(() => this._currentRenderContext = void 0));
  }
};
TerminalQuickFixAddon = __decorateClass([
  __decorateParam(3, IAccessibilitySignalService),
  __decorateParam(4, IActionWidgetService),
  __decorateParam(5, ICommandService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IExtensionService),
  __decorateParam(8, ILabelService),
  __decorateParam(9, IOpenerService),
  __decorateParam(10, ITelemetryService),
  __decorateParam(11, ITerminalQuickFixService)
], TerminalQuickFixAddon);
async function getQuickFixesForCommand(aliases, terminal, terminalCommand, quickFixOptions, commandService, openerService, labelService, onDidRequestRerunCommand, getResolvedFixes) {
  const commandQuickFixSet = /* @__PURE__ */ new Set();
  const openQuickFixSet = /* @__PURE__ */ new Set();
  const fixes = [];
  const newCommand = terminalCommand.command;
  for (const options of quickFixOptions.values()) {
    for (const option of options) {
      if (option.commandExitResult === "success" && terminalCommand.exitCode !== 0 || option.commandExitResult === "error" && terminalCommand.exitCode === 0) {
        continue;
      }
      let quickFixes;
      if (option.type === "resolved") {
        quickFixes = await option.getQuickFixes(terminalCommand, getLinesForCommand(terminal.buffer.active, terminalCommand, terminal.cols, option.outputMatcher), option, new CancellationTokenSource().token);
      } else if (option.type === "unresolved") {
        if (!getResolvedFixes) {
          throw new Error("No resolved fix provider");
        }
        quickFixes = await getResolvedFixes(option, option.outputMatcher ? getLinesForCommand(terminal.buffer.active, terminalCommand, terminal.cols, option.outputMatcher) : void 0);
      } else if (option.type === "internal") {
        const commandLineMatch = newCommand.match(option.commandLineMatcher);
        if (!commandLineMatch) {
          continue;
        }
        const outputMatcher = option.outputMatcher;
        let outputMatch;
        if (outputMatcher) {
          outputMatch = terminalCommand.getOutputMatch(outputMatcher);
        }
        if (!outputMatch) {
          continue;
        }
        const matchResult = { commandLineMatch, outputMatch, commandLine: terminalCommand.command };
        quickFixes = option.getQuickFixes(matchResult);
      }
      if (quickFixes) {
        for (const quickFix of asArray(quickFixes)) {
          let action;
          if (hasKey(quickFix, { type: true })) {
            switch (quickFix.type) {
              case TerminalQuickFixType.TerminalCommand: {
                const fix = quickFix;
                if (commandQuickFixSet.has(fix.terminalCommand)) {
                  continue;
                }
                commandQuickFixSet.add(fix.terminalCommand);
                const label = localize("quickFix.command", "Run: {0}", fix.terminalCommand);
                action = {
                  type: TerminalQuickFixType.TerminalCommand,
                  kind: option.kind,
                  class: void 0,
                  source: quickFix.source,
                  id: quickFix.id,
                  label,
                  enabled: true,
                  run: () => {
                    onDidRequestRerunCommand?.fire({
                      command: fix.terminalCommand,
                      shouldExecute: fix.shouldExecute ?? true
                    });
                  },
                  tooltip: label,
                  command: fix.terminalCommand,
                  shouldExecute: fix.shouldExecute
                };
                break;
              }
              case TerminalQuickFixType.Opener: {
                const fix = quickFix;
                if (!fix.uri) {
                  return;
                }
                if (openQuickFixSet.has(fix.uri.toString())) {
                  continue;
                }
                openQuickFixSet.add(fix.uri.toString());
                const isUrl = fix.uri.scheme === Schemas.http || fix.uri.scheme === Schemas.https;
                const uriLabel = isUrl ? encodeURI(fix.uri.toString(true)) : labelService.getUriLabel(fix.uri);
                const label = localize("quickFix.opener", "Open: {0}", uriLabel);
                action = {
                  source: quickFix.source,
                  id: quickFix.id,
                  label,
                  type: TerminalQuickFixType.Opener,
                  kind: option.kind,
                  class: void 0,
                  enabled: true,
                  run: () => openerService.open(fix.uri),
                  tooltip: label,
                  uri: fix.uri
                };
                break;
              }
              case TerminalQuickFixType.Port: {
                const fix = quickFix;
                action = {
                  source: "builtin",
                  type: fix.type,
                  kind: option.kind,
                  id: fix.id,
                  label: fix.label,
                  class: fix.class,
                  enabled: fix.enabled,
                  run: () => {
                    fix.run();
                  },
                  tooltip: fix.tooltip
                };
                break;
              }
              case TerminalQuickFixType.VscodeCommand: {
                const fix = quickFix;
                action = {
                  source: quickFix.source,
                  type: fix.type,
                  kind: option.kind,
                  id: fix.id,
                  label: fix.title,
                  class: void 0,
                  enabled: true,
                  run: () => commandService.executeCommand(fix.id),
                  tooltip: fix.title
                };
                break;
              }
            }
            if (action) {
              fixes.push(action);
            }
          }
        }
      }
    }
  }
  return fixes.length > 0 ? fixes : void 0;
}
function convertToQuickFixOptions(selectorProvider) {
  return {
    id: selectorProvider.selector.id,
    type: "resolved",
    commandLineMatcher: selectorProvider.selector.commandLineMatcher,
    outputMatcher: selectorProvider.selector.outputMatcher,
    commandExitResult: selectorProvider.selector.commandExitResult,
    kind: selectorProvider.selector.kind,
    getQuickFixes: selectorProvider.provider.provideTerminalQuickFixes
  };
}
class TerminalQuickFixItem {
  constructor(action, type, source, title, kind = "fix") {
    this.action = action;
    this.type = type;
    this.source = source;
    this.title = title;
    this.kind = kind;
    this.disabled = false;
  }
}
function toActionWidgetItems(inputQuickFixes, showHeaders) {
  const menuItems = [];
  menuItems.push({
    kind: ActionListItemKind.Header,
    group: {
      kind: CodeActionKind.QuickFix,
      title: localize("codeAction.widget.id.quickfix", "Quick Fix")
    }
  });
  for (const quickFix of showHeaders ? inputQuickFixes : inputQuickFixes.filter((i) => !!i.action)) {
    if (!quickFix.disabled && quickFix.action) {
      menuItems.push({
        kind: ActionListItemKind.Action,
        item: quickFix,
        group: {
          kind: CodeActionKind.QuickFix,
          icon: getQuickFixIcon(quickFix),
          title: quickFix.action.label
        },
        disabled: false,
        label: quickFix.title
      });
    }
  }
  return menuItems;
}
function getQuickFixIcon(quickFix) {
  if (quickFix.kind === "explain") {
    return Codicon.sparkle;
  }
  switch (quickFix.type) {
    case TerminalQuickFixType.Opener:
      if (quickFix.action.uri) {
        const isUrl = quickFix.action.uri.scheme === Schemas.http || quickFix.action.uri.scheme === Schemas.https;
        return isUrl ? Codicon.linkExternal : Codicon.goToFile;
      }
    case TerminalQuickFixType.TerminalCommand:
      return Codicon.run;
    case TerminalQuickFixType.Port:
      return Codicon.debugDisconnect;
    case TerminalQuickFixType.VscodeCommand:
      return Codicon.lightbulb;
  }
}
export {
  TerminalQuickFixAddon,
  getQuickFixesForCommand
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxccXVpY2tGaXhcXGJyb3dzZXJcXHF1aWNrRml4QWRkb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSB7IElUZXJtaW5hbEFkZG9uIH0gZnJvbSAnQHh0ZXJtL2hlYWRsZXNzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdHlwZSBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxDYXBhYmlsaXR5U3RvcmUsIElUZXJtaW5hbENvbW1hbmQsIFRlcm1pbmFsQ2FwYWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY2FwYWJpbGl0aWVzLmpzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IERlY29yYXRpb25TZWxlY3RvciwgdXBkYXRlTGF5b3V0IH0gZnJvbSAnLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci94dGVybS9kZWNvcmF0aW9uU3R5bGVzLmpzJztcbmltcG9ydCB0eXBlIHsgSURlY29yYXRpb24sIFRlcm1pbmFsIH0gZnJvbSAnQHh0ZXJtL3h0ZXJtJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlTaWduYWwsIElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHlTaWduYWwvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uV2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBBY3Rpb25TZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvY29tbW9uL2FjdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBnZXRMaW5lc0ZvckNvbW1hbmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL2NvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5LmpzJztcbmltcG9ydCB7IElBbmNob3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvY29udGV4dHZpZXcvY29udGV4dHZpZXcuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsUXVpY2tGaXhJbnRlcm5hbE9wdGlvbnMsIElUZXJtaW5hbFF1aWNrRml4UmVzb2x2ZWRFeHRlbnNpb25PcHRpb25zLCBJVGVybWluYWxRdWlja0ZpeCwgSVRlcm1pbmFsUXVpY2tGaXhUZXJtaW5hbENvbW1hbmRBY3Rpb24sIElUZXJtaW5hbFF1aWNrRml4T3BlbmVyQWN0aW9uLCBJVGVybWluYWxRdWlja0ZpeE9wdGlvbnMsIElUZXJtaW5hbFF1aWNrRml4UHJvdmlkZXJTZWxlY3RvciwgSVRlcm1pbmFsUXVpY2tGaXhTZXJ2aWNlLCBJVGVybWluYWxRdWlja0ZpeFVucmVzb2x2ZWRFeHRlbnNpb25PcHRpb25zLCBUZXJtaW5hbFF1aWNrRml4VHlwZSwgSVRlcm1pbmFsUXVpY2tGaXhDb21tYW5kQWN0aW9uIH0gZnJvbSAnLi9xdWlja0ZpeC5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxDb21tYW5kU2VsZWN0b3IsIFRlcm1pbmFsU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IEFjdGlvbkxpc3RJdGVtS2luZCwgSUFjdGlvbkxpc3RJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uTGlzdC5qcyc7XG5pbXBvcnQgeyBDb2RlQWN0aW9uS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2NvZGVBY3Rpb24vY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IGhhc0tleSwgdHlwZSBTaW5nbGVPck1hbnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5cbmNvbnN0IGVudW0gUXVpY2tGaXhEZWNvcmF0aW9uU2VsZWN0b3Ige1xuXHRRdWlja0ZpeCA9ICdxdWljay1maXgnXG59XG5cbmNvbnN0IHF1aWNrRml4Q2xhc3NlcyA9IFtcblx0UXVpY2tGaXhEZWNvcmF0aW9uU2VsZWN0b3IuUXVpY2tGaXgsXG5cdERlY29yYXRpb25TZWxlY3Rvci5Db2RpY29uLFxuXHREZWNvcmF0aW9uU2VsZWN0b3IuQ29tbWFuZERlY29yYXRpb24sXG5cdERlY29yYXRpb25TZWxlY3Rvci5YdGVybURlY29yYXRpb25cbl07XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRlcm1pbmFsUXVpY2tGaXhBZGRvbiB7XG5cdHJlYWRvbmx5IG9uRGlkUmVxdWVzdFJlcnVuQ29tbWFuZDogRXZlbnQ8eyBjb21tYW5kOiBzdHJpbmc7IHNob3VsZEV4ZWN1dGU/OiBib29sZWFuIH0+O1xuXHRyZWFkb25seSBvbkRpZFVwZGF0ZVF1aWNrRml4ZXM6IEV2ZW50PHsgY29tbWFuZDogSVRlcm1pbmFsQ29tbWFuZDsgYWN0aW9uczogSVRlcm1pbmFsQWN0aW9uW10gfCB1bmRlZmluZWQgfT47XG5cdHNob3dNZW51KCk6IHZvaWQ7XG5cdC8qKlxuXHQgKiBSZWdpc3RlcnMgYSBsaXN0ZW5lciBvbiBvbkNvbW1hbmRGaW5pc2hlZCBzY29wZWQgdG8gYSBwYXJ0aWN1bGFyIGNvbW1hbmQgb3IgcmVndWxhclxuXHQgKiBleHByZXNzaW9uIGFuZCBwcm92aWRlcyBhIGNhbGxiYWNrIHRvIGJlIGV4ZWN1dGVkIGZvciBjb21tYW5kcyB0aGF0IG1hdGNoLlxuXHQgKi9cblx0cmVnaXN0ZXJDb21tYW5kRmluaXNoZWRMaXN0ZW5lcihvcHRpb25zOiBJVGVybWluYWxRdWlja0ZpeE9wdGlvbnMpOiB2b2lkO1xufVxuXG5leHBvcnQgY2xhc3MgVGVybWluYWxRdWlja0ZpeEFkZG9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUZXJtaW5hbEFkZG9uLCBJVGVybWluYWxRdWlja0ZpeEFkZG9uIHtcblxuXHRwcml2YXRlIF90ZXJtaW5hbDogVGVybWluYWwgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfY29tbWFuZExpc3RlbmVyczogTWFwPHN0cmluZywgKElUZXJtaW5hbFF1aWNrRml4T3B0aW9ucyB8IElUZXJtaW5hbFF1aWNrRml4UmVzb2x2ZWRFeHRlbnNpb25PcHRpb25zIHwgSVRlcm1pbmFsUXVpY2tGaXhVbnJlc29sdmVkRXh0ZW5zaW9uT3B0aW9ucylbXT4gPSBuZXcgTWFwKCk7XG5cblx0cHJpdmF0ZSBfcXVpY2tGaXhlczogSVRlcm1pbmFsQWN0aW9uW10gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGVjb3JhdGlvbjogTXV0YWJsZURpc3Bvc2FibGU8SURlY29yYXRpb24+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWNvcmF0aW9uRGlzcG9zYWJsZXM6IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRwcml2YXRlIF9jdXJyZW50UmVuZGVyQ29udGV4dDogeyBxdWlja0ZpeGVzOiBJVGVybWluYWxBY3Rpb25bXTsgYW5jaG9yOiBJQW5jaG9yOyBwYXJlbnRFbGVtZW50OiBIVE1MRWxlbWVudCB9IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX2xhc3RRdWlja0ZpeElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcmVnaXN0ZXJlZFNlbGVjdG9yczogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XG5cblx0cHJpdmF0ZSBfZGlkUnVuOiBib29sZWFuID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXF1ZXN0UmVydW5Db21tYW5kID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBjb21tYW5kOiBzdHJpbmc7IHNob3VsZEV4ZWN1dGU/OiBib29sZWFuIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlcXVlc3RSZXJ1bkNvbW1hbmQgPSB0aGlzLl9vbkRpZFJlcXVlc3RSZXJ1bkNvbW1hbmQuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkVXBkYXRlUXVpY2tGaXhlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgY29tbWFuZDogSVRlcm1pbmFsQ29tbWFuZDsgYWN0aW9uczogSVRlcm1pbmFsQWN0aW9uW10gfCB1bmRlZmluZWQgfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkVXBkYXRlUXVpY2tGaXhlcyA9IHRoaXMuX29uRGlkVXBkYXRlUXVpY2tGaXhlcy5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uSWQ6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9hbGlhc2VzOiBzdHJpbmdbXVtdIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NhcGFiaWxpdGllczogSVRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSxcblx0XHRASUFjdGlvbldpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWN0aW9uV2lkZ2V0U2VydmljZTogSUFjdGlvbldpZGdldFNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9vcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbFF1aWNrRml4U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9xdWlja0ZpeFNlcnZpY2U6IElUZXJtaW5hbFF1aWNrRml4U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRjb25zdCBjb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSA9IHRoaXMuX2NhcGFiaWxpdGllcy5nZXQoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pO1xuXHRcdGlmIChjb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXJDb21tYW5kSGFuZGxlcnMoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY2FwYWJpbGl0aWVzLm9uRGlkQWRkQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9yZWdpc3RlckNvbW1hbmRIYW5kbGVycygpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9xdWlja0ZpeFNlcnZpY2Uub25EaWRSZWdpc3RlclByb3ZpZGVyKHJlc3VsdCA9PiB0aGlzLnJlZ2lzdGVyQ29tbWFuZEZpbmlzaGVkTGlzdGVuZXIoY29udmVydFRvUXVpY2tGaXhPcHRpb25zKHJlc3VsdCkpKSk7XG5cdFx0dGhpcy5fcXVpY2tGaXhTZXJ2aWNlLmV4dGVuc2lvblF1aWNrRml4ZXMudGhlbihxdWlja0ZpeFNlbGVjdG9ycyA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIHF1aWNrRml4U2VsZWN0b3JzKSB7XG5cdFx0XHRcdHRoaXMucmVnaXN0ZXJDb21tYW5kU2VsZWN0b3Ioc2VsZWN0b3IpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3F1aWNrRml4U2VydmljZS5vbkRpZFJlZ2lzdGVyQ29tbWFuZFNlbGVjdG9yKHNlbGVjdG9yID0+IHRoaXMucmVnaXN0ZXJDb21tYW5kU2VsZWN0b3Ioc2VsZWN0b3IpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcXVpY2tGaXhTZXJ2aWNlLm9uRGlkVW5yZWdpc3RlclByb3ZpZGVyKGlkID0+IHRoaXMuX2NvbW1hbmRMaXN0ZW5lcnMuZGVsZXRlKGlkKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRlcm1pbmFsU2V0dGluZ0lkLlNoZWxsSW50ZWdyYXRpb25RdWlja0ZpeEVuYWJsZWQpKSB7XG5cdFx0XHRcdC8vIENsZWFyIGV4aXN0aW5nIGRlY29yYXRpb25zIHdoZW4gc2V0dGluZyBjaGFuZ2VzXG5cdFx0XHRcdHRoaXMuX2RlY29yYXRpb24uY2xlYXIoKTtcblx0XHRcdFx0dGhpcy5fZGVjb3JhdGlvbkRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0YWN0aXZhdGUodGVybWluYWw6IFRlcm1pbmFsKTogdm9pZCB7XG5cdFx0dGhpcy5fdGVybWluYWwgPSB0ZXJtaW5hbDtcblx0fVxuXG5cdHNob3dNZW51KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY3VycmVudFJlbmRlckNvbnRleHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhY3Rpb25zID0gdGhpcy5fY3VycmVudFJlbmRlckNvbnRleHQucXVpY2tGaXhlcy5tYXAoZiA9PiBuZXcgVGVybWluYWxRdWlja0ZpeEl0ZW0oZiwgZi50eXBlLCBmLnNvdXJjZSwgZi5sYWJlbCwgZi5raW5kKSk7XG5cdFx0Y29uc3QgYWN0aW9uU2V0ID0ge1xuXHRcdFx0YWxsQWN0aW9uczogYWN0aW9ucyxcblx0XHRcdGhhc0F1dG9GaXg6IGZhbHNlLFxuXHRcdFx0aGFzQUlGaXg6IGZhbHNlLFxuXHRcdFx0YWxsQUlGaXhlczogZmFsc2UsXG5cdFx0XHR2YWxpZEFjdGlvbnM6IGFjdGlvbnMsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH1cblx0XHR9IHNhdGlzZmllcyBBY3Rpb25TZXQ8VGVybWluYWxRdWlja0ZpeEl0ZW0+O1xuXHRcdGNvbnN0IGRlbGVnYXRlID0ge1xuXHRcdFx0b25TZWxlY3Q6IGFzeW5jIChmaXg6IFRlcm1pbmFsUXVpY2tGaXhJdGVtKSA9PiB7XG5cdFx0XHRcdGZpeC5hY3Rpb24/LnJ1bigpO1xuXHRcdFx0XHR0aGlzLl9hY3Rpb25XaWRnZXRTZXJ2aWNlLmhpZGUoKTtcblx0XHRcdH0sXG5cdFx0XHRvbkhpZGU6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5fdGVybWluYWw/LmZvY3VzKCk7XG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0dGhpcy5fYWN0aW9uV2lkZ2V0U2VydmljZS5zaG93KCdxdWlja0ZpeFdpZGdldCcsIGZhbHNlLCB0b0FjdGlvbldpZGdldEl0ZW1zKGFjdGlvblNldC52YWxpZEFjdGlvbnMsIHRydWUpLCBkZWxlZ2F0ZSwgdGhpcy5fY3VycmVudFJlbmRlckNvbnRleHQuYW5jaG9yLCB0aGlzLl9jdXJyZW50UmVuZGVyQ29udGV4dC5wYXJlbnRFbGVtZW50KTtcblx0fVxuXG5cdHJlZ2lzdGVyQ29tbWFuZFNlbGVjdG9yKHNlbGVjdG9yOiBJVGVybWluYWxDb21tYW5kU2VsZWN0b3IpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcmVnaXN0ZXJlZFNlbGVjdG9ycy5oYXMoc2VsZWN0b3IuaWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG1hdGNoZXJLZXkgPSBzZWxlY3Rvci5jb21tYW5kTGluZU1hdGNoZXIudG9TdHJpbmcoKTtcblx0XHRjb25zdCBjdXJyZW50T3B0aW9ucyA9IHRoaXMuX2NvbW1hbmRMaXN0ZW5lcnMuZ2V0KG1hdGNoZXJLZXkpIHx8IFtdO1xuXHRcdGN1cnJlbnRPcHRpb25zLnB1c2goe1xuXHRcdFx0aWQ6IHNlbGVjdG9yLmlkLFxuXHRcdFx0dHlwZTogJ3VucmVzb2x2ZWQnLFxuXHRcdFx0Y29tbWFuZExpbmVNYXRjaGVyOiBzZWxlY3Rvci5jb21tYW5kTGluZU1hdGNoZXIsXG5cdFx0XHRvdXRwdXRNYXRjaGVyOiBzZWxlY3Rvci5vdXRwdXRNYXRjaGVyLFxuXHRcdFx0Y29tbWFuZEV4aXRSZXN1bHQ6IHNlbGVjdG9yLmNvbW1hbmRFeGl0UmVzdWx0LFxuXHRcdFx0a2luZDogc2VsZWN0b3Iua2luZFxuXHRcdH0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyZWRTZWxlY3RvcnMuYWRkKHNlbGVjdG9yLmlkKTtcblx0XHR0aGlzLl9jb21tYW5kTGlzdGVuZXJzLnNldChtYXRjaGVyS2V5LCBjdXJyZW50T3B0aW9ucyk7XG5cdH1cblxuXHRyZWdpc3RlckNvbW1hbmRGaW5pc2hlZExpc3RlbmVyKG9wdGlvbnM6IElUZXJtaW5hbFF1aWNrRml4T3B0aW9ucyB8IElUZXJtaW5hbFF1aWNrRml4UmVzb2x2ZWRFeHRlbnNpb25PcHRpb25zKTogdm9pZCB7XG5cdFx0Y29uc3QgbWF0Y2hlcktleSA9IG9wdGlvbnMuY29tbWFuZExpbmVNYXRjaGVyLnRvU3RyaW5nKCk7XG5cdFx0bGV0IGN1cnJlbnRPcHRpb25zID0gdGhpcy5fY29tbWFuZExpc3RlbmVycy5nZXQobWF0Y2hlcktleSkgfHwgW107XG5cdFx0Ly8gcmVtb3ZlcyB0aGUgdW5yZXNvbHZlZCBvcHRpb25zXG5cdFx0Y3VycmVudE9wdGlvbnMgPSBjdXJyZW50T3B0aW9ucy5maWx0ZXIobyA9PiBvLmlkICE9PSBvcHRpb25zLmlkKTtcblx0XHRjdXJyZW50T3B0aW9ucy5wdXNoKG9wdGlvbnMpO1xuXHRcdHRoaXMuX2NvbW1hbmRMaXN0ZW5lcnMuc2V0KG1hdGNoZXJLZXksIGN1cnJlbnRPcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyQ29tbWFuZEhhbmRsZXJzKCk6IHZvaWQge1xuXHRcdGNvbnN0IHRlcm1pbmFsID0gdGhpcy5fdGVybWluYWw7XG5cdFx0Y29uc3QgY29tbWFuZERldGVjdGlvbiA9IHRoaXMuX2NhcGFiaWxpdGllcy5nZXQoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pO1xuXHRcdGlmICghdGVybWluYWwgfHwgIWNvbW1hbmREZXRlY3Rpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29tbWFuZERldGVjdGlvbi5vbkNvbW1hbmRGaW5pc2hlZChhc3luYyBjb21tYW5kID0+IGF3YWl0IHRoaXMuX3Jlc29sdmVRdWlja0ZpeGVzKGNvbW1hbmQsIHRoaXMuX2FsaWFzZXMpKSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZXMgcXVpY2sgZml4ZXMsIGlmIGFueSwgYmFzZWQgb24gdGhlXG5cdCAqIEBwYXJhbSBjb21tYW5kICYgaXRzIG91dHB1dFxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZVF1aWNrRml4ZXMoY29tbWFuZDogSVRlcm1pbmFsQ29tbWFuZCwgYWxpYXNlcz86IHN0cmluZ1tdW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0ZXJtaW5hbCA9IHRoaXMuX3Rlcm1pbmFsO1xuXHRcdGlmICghdGVybWluYWwgfHwgY29tbWFuZC53YXNSZXBsYXllZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoY29tbWFuZC5jb21tYW5kICE9PSAnJyAmJiB0aGlzLl9sYXN0UXVpY2tGaXhJZCkge1xuXHRcdFx0dGhpcy5fZGlzcG9zZVF1aWNrRml4KGNvbW1hbmQsIHRoaXMuX2xhc3RRdWlja0ZpeElkKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXNvbHZlciA9IGFzeW5jIChzZWxlY3RvcjogSVRlcm1pbmFsUXVpY2tGaXhPcHRpb25zLCBsaW5lcz86IHN0cmluZ1tdKSA9PiB7XG5cdFx0XHRpZiAobGluZXMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaWQgPSBzZWxlY3Rvci5pZDtcblx0XHRcdGF3YWl0IHRoaXMuX2V4dGVuc2lvblNlcnZpY2UuYWN0aXZhdGVCeUV2ZW50KGBvblRlcm1pbmFsUXVpY2tGaXhSZXF1ZXN0OiR7aWR9YCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcXVpY2tGaXhTZXJ2aWNlLnByb3ZpZGVycy5nZXQoaWQpPy5wcm92aWRlVGVybWluYWxRdWlja0ZpeGVzKGNvbW1hbmQsIGxpbmVzLCB7XG5cdFx0XHRcdHR5cGU6ICdyZXNvbHZlZCcsXG5cdFx0XHRcdGNvbW1hbmRMaW5lTWF0Y2hlcjogc2VsZWN0b3IuY29tbWFuZExpbmVNYXRjaGVyLFxuXHRcdFx0XHRvdXRwdXRNYXRjaGVyOiBzZWxlY3Rvci5vdXRwdXRNYXRjaGVyLFxuXHRcdFx0XHRjb21tYW5kRXhpdFJlc3VsdDogc2VsZWN0b3IuY29tbWFuZEV4aXRSZXN1bHQsXG5cdFx0XHRcdGtpbmQ6IHNlbGVjdG9yLmtpbmQsXG5cdFx0XHRcdGlkOiBzZWxlY3Rvci5pZFxuXHRcdFx0fSwgbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkudG9rZW4pO1xuXHRcdH07XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZ2V0UXVpY2tGaXhlc0ZvckNvbW1hbmQoYWxpYXNlcywgdGVybWluYWwsIGNvbW1hbmQsIHRoaXMuX2NvbW1hbmRMaXN0ZW5lcnMsIHRoaXMuX2NvbW1hbmRTZXJ2aWNlLCB0aGlzLl9vcGVuZXJTZXJ2aWNlLCB0aGlzLl9sYWJlbFNlcnZpY2UsIHRoaXMuX29uRGlkUmVxdWVzdFJlcnVuQ29tbWFuZCwgcmVzb2x2ZXIpO1xuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fcXVpY2tGaXhlcyA9IHJlc3VsdDtcblx0XHR0aGlzLl9sYXN0UXVpY2tGaXhJZCA9IHRoaXMuX3F1aWNrRml4ZXNbMF0uaWQ7XG5cdFx0dGhpcy5fcmVnaXN0ZXJRdWlja0ZpeERlY29yYXRpb24oKTtcblx0XHR0aGlzLl9vbkRpZFVwZGF0ZVF1aWNrRml4ZXMuZmlyZSh7IGNvbW1hbmQsIGFjdGlvbnM6IHRoaXMuX3F1aWNrRml4ZXMgfSk7XG5cdFx0dGhpcy5fcXVpY2tGaXhlcyA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2Rpc3Bvc2VRdWlja0ZpeChjb21tYW5kOiBJVGVybWluYWxDb21tYW5kLCBpZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dHlwZSBRdWlja0ZpeFJlc3VsdFRlbGVtZXRyeUV2ZW50ID0ge1xuXHRcdFx0cXVpY2tGaXhJZDogc3RyaW5nO1xuXHRcdFx0cmFuUXVpY2tGaXg6IGJvb2xlYW47XG5cdFx0XHR0ZXJtaW5hbFNlc3Npb25JZDogc3RyaW5nO1xuXHRcdH07XG5cdFx0dHlwZSBRdWlja0ZpeENsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0b3duZXI6ICdtZWdhbnJvZ2dlJztcblx0XHRcdHF1aWNrRml4SWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgcXVpY2sgZml4IElEJyB9O1xuXHRcdFx0cmFuUXVpY2tGaXg6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSBxdWljayBmaXggd2FzIHJ1bicgfTtcblx0XHRcdHRlcm1pbmFsU2Vzc2lvbklkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHRlcm1pbmFsIHNlc3Npb24gSUQnIH07XG5cdFx0XHRjb21tZW50OiAnVGVybWluYWwgcXVpY2sgZml4ZXMnO1xuXHRcdH07XG5cdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZT8ucHVibGljTG9nMjxRdWlja0ZpeFJlc3VsdFRlbGVtZXRyeUV2ZW50LCBRdWlja0ZpeENsYXNzaWZpY2F0aW9uPigndGVybWluYWwvcXVpY2stZml4Jywge1xuXHRcdFx0cXVpY2tGaXhJZDogaWQsXG5cdFx0XHRyYW5RdWlja0ZpeDogdGhpcy5fZGlkUnVuLFxuXHRcdFx0dGVybWluYWxTZXNzaW9uSWQ6IHRoaXMuX3Nlc3Npb25JZFxuXHRcdH0pO1xuXHRcdHRoaXMuX2RlY29yYXRpb24uY2xlYXIoKTtcblx0XHR0aGlzLl9kZWNvcmF0aW9uRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9vbkRpZFVwZGF0ZVF1aWNrRml4ZXMuZmlyZSh7IGNvbW1hbmQsIGFjdGlvbnM6IHRoaXMuX3F1aWNrRml4ZXMgfSk7XG5cdFx0dGhpcy5fcXVpY2tGaXhlcyA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9sYXN0UXVpY2tGaXhJZCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9kaWRSdW4gPSBmYWxzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWdpc3RlcnMgYSBkZWNvcmF0aW9uIHdpdGggdGhlIHF1aWNrIGZpeGVzXG5cdCAqL1xuXHRwcml2YXRlIF9yZWdpc3RlclF1aWNrRml4RGVjb3JhdGlvbigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3Rlcm1pbmFsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgcXVpY2sgZml4IGRlY29yYXRpb25zIGFyZSBlbmFibGVkXG5cdFx0Y29uc3QgcXVpY2tGaXhFbmFibGVkID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oVGVybWluYWxTZXR0aW5nSWQuU2hlbGxJbnRlZ3JhdGlvblF1aWNrRml4RW5hYmxlZCk7XG5cdFx0aWYgKCFxdWlja0ZpeEVuYWJsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9kZWNvcmF0aW9uLmNsZWFyKCk7XG5cdFx0dGhpcy5fZGVjb3JhdGlvbkRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0Y29uc3QgcXVpY2tGaXhlcyA9IHRoaXMuX3F1aWNrRml4ZXM7XG5cdFx0aWYgKCFxdWlja0ZpeGVzIHx8IHF1aWNrRml4ZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG1hcmtlciA9IHRoaXMuX3Rlcm1pbmFsLnJlZ2lzdGVyTWFya2VyKCk7XG5cdFx0aWYgKCFtYXJrZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZGVjb3JhdGlvbiA9IHRoaXMuX2RlY29yYXRpb24udmFsdWUgPSB0aGlzLl90ZXJtaW5hbC5yZWdpc3RlckRlY29yYXRpb24oeyBtYXJrZXIsIHdpZHRoOiAyLCBsYXllcjogJ3RvcCcgfSk7XG5cdFx0aWYgKCFkZWNvcmF0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHN0b3JlID0gdGhpcy5fZGVjb3JhdGlvbkRpc3Bvc2FibGVzLnZhbHVlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHN0b3JlLmFkZChkZWNvcmF0aW9uLm9uUmVuZGVyKGUgPT4ge1xuXHRcdFx0Y29uc3QgcmVjdCA9IGUuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0XHRjb25zdCBhbmNob3IgPSB7XG5cdFx0XHRcdHg6IHJlY3QueCxcblx0XHRcdFx0eTogcmVjdC55LFxuXHRcdFx0XHR3aWR0aDogcmVjdC53aWR0aCxcblx0XHRcdFx0aGVpZ2h0OiByZWN0LmhlaWdodFxuXHRcdFx0fTtcblxuXHRcdFx0aWYgKGUuY2xhc3NMaXN0LmNvbnRhaW5zKFF1aWNrRml4RGVjb3JhdGlvblNlbGVjdG9yLlF1aWNrRml4KSkge1xuXHRcdFx0XHRpZiAodGhpcy5fY3VycmVudFJlbmRlckNvbnRleHQpIHtcblx0XHRcdFx0XHR0aGlzLl9jdXJyZW50UmVuZGVyQ29udGV4dC5hbmNob3IgPSBhbmNob3I7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGUuY2xhc3NMaXN0LmFkZCguLi5xdWlja0ZpeENsYXNzZXMpO1xuXHRcdFx0Y29uc3QgaXNFeHBsYWluT25seSA9IHF1aWNrRml4ZXMuZXZlcnkoZSA9PiBlLmtpbmQgPT09ICdleHBsYWluJyk7XG5cdFx0XHRpZiAoaXNFeHBsYWluT25seSkge1xuXHRcdFx0XHRlLmNsYXNzTGlzdC5hZGQoJ2V4cGxhaW5Pbmx5Jyk7XG5cdFx0XHR9XG5cdFx0XHRlLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoaXNFeHBsYWluT25seSA/IENvZGljb24uc3BhcmtsZSA6IENvZGljb24ubGlnaHRCdWxiKSk7XG5cblx0XHRcdHVwZGF0ZUxheW91dCh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSwgZSk7XG5cdFx0XHR0aGlzLl9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5wbGF5U2lnbmFsKEFjY2Vzc2liaWxpdHlTaWduYWwudGVybWluYWxRdWlja0ZpeCk7XG5cblx0XHRcdGNvbnN0IHBhcmVudEVsZW1lbnQgPSBlLmNsb3Nlc3QoJy54dGVybScpPy5wYXJlbnRFbGVtZW50O1xuXHRcdFx0aWYgKCFwYXJlbnRFbGVtZW50KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fY3VycmVudFJlbmRlckNvbnRleHQgPSB7IHF1aWNrRml4ZXMsIGFuY2hvciwgcGFyZW50RWxlbWVudCB9O1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihlLCBkb20uRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB0aGlzLnNob3dNZW51KCkpKTtcblx0XHR9KSk7XG5cdFx0c3RvcmUuYWRkKGRlY29yYXRpb24ub25EaXNwb3NlKCgpID0+IHRoaXMuX2N1cnJlbnRSZW5kZXJDb250ZXh0ID0gdW5kZWZpbmVkKSk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGVybWluYWxBY3Rpb24gZXh0ZW5kcyBJQWN0aW9uIHtcblx0dHlwZTogVGVybWluYWxRdWlja0ZpeFR5cGU7XG5cdGtpbmQ/OiAnZml4JyB8ICdleHBsYWluJztcblx0c291cmNlOiBzdHJpbmc7XG5cdHVyaT86IFVSSTtcblx0Y29tbWFuZD86IHN0cmluZztcblx0c2hvdWxkRXhlY3V0ZT86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRRdWlja0ZpeGVzRm9yQ29tbWFuZChcblx0YWxpYXNlczogc3RyaW5nW11bXSB8IHVuZGVmaW5lZCxcblx0dGVybWluYWw6IFRlcm1pbmFsLFxuXHR0ZXJtaW5hbENvbW1hbmQ6IElUZXJtaW5hbENvbW1hbmQsXG5cdHF1aWNrRml4T3B0aW9uczogTWFwPHN0cmluZywgSVRlcm1pbmFsUXVpY2tGaXhPcHRpb25zW10+LFxuXHRjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0bGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRvbkRpZFJlcXVlc3RSZXJ1bkNvbW1hbmQ/OiBFbWl0dGVyPHsgY29tbWFuZDogc3RyaW5nOyBzaG91bGRFeGVjdXRlPzogYm9vbGVhbiB9Pixcblx0Z2V0UmVzb2x2ZWRGaXhlcz86IChzZWxlY3RvcjogSVRlcm1pbmFsUXVpY2tGaXhPcHRpb25zLCBsaW5lcz86IHN0cmluZ1tdKSA9PiBQcm9taXNlPFNpbmdsZU9yTWFueTxJVGVybWluYWxRdWlja0ZpeD4gfCB1bmRlZmluZWQ+XG4pOiBQcm9taXNlPElUZXJtaW5hbEFjdGlvbltdIHwgdW5kZWZpbmVkPiB7XG5cdC8vIFByZXZlbnQgZHVwbGljYXRlcyBieSB0cmFja2luZyBhZGRlZCBlbnRyaWVzXG5cdGNvbnN0IGNvbW1hbmRRdWlja0ZpeFNldDogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XG5cdGNvbnN0IG9wZW5RdWlja0ZpeFNldDogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XG5cblx0Y29uc3QgZml4ZXM6IElUZXJtaW5hbEFjdGlvbltdID0gW107XG5cdGNvbnN0IG5ld0NvbW1hbmQgPSB0ZXJtaW5hbENvbW1hbmQuY29tbWFuZDtcblx0Zm9yIChjb25zdCBvcHRpb25zIG9mIHF1aWNrRml4T3B0aW9ucy52YWx1ZXMoKSkge1xuXHRcdGZvciAoY29uc3Qgb3B0aW9uIG9mIG9wdGlvbnMpIHtcblx0XHRcdGlmICgob3B0aW9uLmNvbW1hbmRFeGl0UmVzdWx0ID09PSAnc3VjY2VzcycgJiYgdGVybWluYWxDb21tYW5kLmV4aXRDb2RlICE9PSAwKSB8fCAob3B0aW9uLmNvbW1hbmRFeGl0UmVzdWx0ID09PSAnZXJyb3InICYmIHRlcm1pbmFsQ29tbWFuZC5leGl0Q29kZSA9PT0gMCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRsZXQgcXVpY2tGaXhlcztcblx0XHRcdGlmIChvcHRpb24udHlwZSA9PT0gJ3Jlc29sdmVkJykge1xuXHRcdFx0XHRxdWlja0ZpeGVzID0gYXdhaXQgKG9wdGlvbiBhcyBJVGVybWluYWxRdWlja0ZpeFJlc29sdmVkRXh0ZW5zaW9uT3B0aW9ucykuZ2V0UXVpY2tGaXhlcyh0ZXJtaW5hbENvbW1hbmQsIGdldExpbmVzRm9yQ29tbWFuZCh0ZXJtaW5hbC5idWZmZXIuYWN0aXZlLCB0ZXJtaW5hbENvbW1hbmQsIHRlcm1pbmFsLmNvbHMsIG9wdGlvbi5vdXRwdXRNYXRjaGVyKSwgb3B0aW9uLCBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKS50b2tlbik7XG5cdFx0XHR9IGVsc2UgaWYgKG9wdGlvbi50eXBlID09PSAndW5yZXNvbHZlZCcpIHtcblx0XHRcdFx0aWYgKCFnZXRSZXNvbHZlZEZpeGVzKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdObyByZXNvbHZlZCBmaXggcHJvdmlkZXInKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRxdWlja0ZpeGVzID0gYXdhaXQgZ2V0UmVzb2x2ZWRGaXhlcyhvcHRpb24sIG9wdGlvbi5vdXRwdXRNYXRjaGVyID8gZ2V0TGluZXNGb3JDb21tYW5kKHRlcm1pbmFsLmJ1ZmZlci5hY3RpdmUsIHRlcm1pbmFsQ29tbWFuZCwgdGVybWluYWwuY29scywgb3B0aW9uLm91dHB1dE1hdGNoZXIpIDogdW5kZWZpbmVkKTtcblx0XHRcdH0gZWxzZSBpZiAob3B0aW9uLnR5cGUgPT09ICdpbnRlcm5hbCcpIHtcblx0XHRcdFx0Y29uc3QgY29tbWFuZExpbmVNYXRjaCA9IG5ld0NvbW1hbmQubWF0Y2gob3B0aW9uLmNvbW1hbmRMaW5lTWF0Y2hlcik7XG5cdFx0XHRcdGlmICghY29tbWFuZExpbmVNYXRjaCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IG91dHB1dE1hdGNoZXIgPSBvcHRpb24ub3V0cHV0TWF0Y2hlcjtcblx0XHRcdFx0bGV0IG91dHB1dE1hdGNoO1xuXHRcdFx0XHRpZiAob3V0cHV0TWF0Y2hlcikge1xuXHRcdFx0XHRcdG91dHB1dE1hdGNoID0gdGVybWluYWxDb21tYW5kLmdldE91dHB1dE1hdGNoKG91dHB1dE1hdGNoZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghb3V0cHV0TWF0Y2gpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBtYXRjaFJlc3VsdCA9IHsgY29tbWFuZExpbmVNYXRjaCwgb3V0cHV0TWF0Y2gsIGNvbW1hbmRMaW5lOiB0ZXJtaW5hbENvbW1hbmQuY29tbWFuZCB9O1xuXHRcdFx0XHRxdWlja0ZpeGVzID0gKG9wdGlvbiBhcyBJVGVybWluYWxRdWlja0ZpeEludGVybmFsT3B0aW9ucykuZ2V0UXVpY2tGaXhlcyhtYXRjaFJlc3VsdCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChxdWlja0ZpeGVzKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgcXVpY2tGaXggb2YgYXNBcnJheShxdWlja0ZpeGVzKSkge1xuXHRcdFx0XHRcdGxldCBhY3Rpb246IElUZXJtaW5hbEFjdGlvbiB8IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRpZiAoaGFzS2V5KHF1aWNrRml4LCB7IHR5cGU6IHRydWUgfSkpIHtcblx0XHRcdFx0XHRcdHN3aXRjaCAocXVpY2tGaXgudHlwZSkge1xuXHRcdFx0XHRcdFx0XHRjYXNlIFRlcm1pbmFsUXVpY2tGaXhUeXBlLlRlcm1pbmFsQ29tbWFuZDoge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGZpeCA9IHF1aWNrRml4IGFzIElUZXJtaW5hbFF1aWNrRml4VGVybWluYWxDb21tYW5kQWN0aW9uO1xuXHRcdFx0XHRcdFx0XHRcdGlmIChjb21tYW5kUXVpY2tGaXhTZXQuaGFzKGZpeC50ZXJtaW5hbENvbW1hbmQpKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0Y29tbWFuZFF1aWNrRml4U2V0LmFkZChmaXgudGVybWluYWxDb21tYW5kKTtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBsYWJlbCA9IGxvY2FsaXplKCdxdWlja0ZpeC5jb21tYW5kJywgJ1J1bjogezB9JywgZml4LnRlcm1pbmFsQ29tbWFuZCk7XG5cdFx0XHRcdFx0XHRcdFx0YWN0aW9uID0ge1xuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogVGVybWluYWxRdWlja0ZpeFR5cGUuVGVybWluYWxDb21tYW5kLFxuXHRcdFx0XHRcdFx0XHRcdFx0a2luZDogb3B0aW9uLmtpbmQsXG5cdFx0XHRcdFx0XHRcdFx0XHRjbGFzczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRcdFx0c291cmNlOiBxdWlja0ZpeC5zb3VyY2UsXG5cdFx0XHRcdFx0XHRcdFx0XHRpZDogcXVpY2tGaXguaWQsXG5cdFx0XHRcdFx0XHRcdFx0XHRsYWJlbCxcblx0XHRcdFx0XHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0b25EaWRSZXF1ZXN0UmVydW5Db21tYW5kPy5maXJlKHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRjb21tYW5kOiBmaXgudGVybWluYWxDb21tYW5kLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHNob3VsZEV4ZWN1dGU6IGZpeC5zaG91bGRFeGVjdXRlID8/IHRydWVcblx0XHRcdFx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0dG9vbHRpcDogbGFiZWwsXG5cdFx0XHRcdFx0XHRcdFx0XHRjb21tYW5kOiBmaXgudGVybWluYWxDb21tYW5kLFxuXHRcdFx0XHRcdFx0XHRcdFx0c2hvdWxkRXhlY3V0ZTogZml4LnNob3VsZEV4ZWN1dGVcblx0XHRcdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGNhc2UgVGVybWluYWxRdWlja0ZpeFR5cGUuT3BlbmVyOiB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgZml4ID0gcXVpY2tGaXggYXMgSVRlcm1pbmFsUXVpY2tGaXhPcGVuZXJBY3Rpb247XG5cdFx0XHRcdFx0XHRcdFx0aWYgKCFmaXgudXJpKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdGlmIChvcGVuUXVpY2tGaXhTZXQuaGFzKGZpeC51cmkudG9TdHJpbmcoKSkpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRvcGVuUXVpY2tGaXhTZXQuYWRkKGZpeC51cmkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgaXNVcmwgPSAoZml4LnVyaS5zY2hlbWUgPT09IFNjaGVtYXMuaHR0cCB8fCBmaXgudXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5odHRwcyk7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgdXJpTGFiZWwgPSBpc1VybCA/IGVuY29kZVVSSShmaXgudXJpLnRvU3RyaW5nKHRydWUpKSA6IGxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChmaXgudXJpKTtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBsYWJlbCA9IGxvY2FsaXplKCdxdWlja0ZpeC5vcGVuZXInLCAnT3BlbjogezB9JywgdXJpTGFiZWwpO1xuXHRcdFx0XHRcdFx0XHRcdGFjdGlvbiA9IHtcblx0XHRcdFx0XHRcdFx0XHRcdHNvdXJjZTogcXVpY2tGaXguc291cmNlLFxuXHRcdFx0XHRcdFx0XHRcdFx0aWQ6IHF1aWNrRml4LmlkLFxuXHRcdFx0XHRcdFx0XHRcdFx0bGFiZWwsXG5cdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiBUZXJtaW5hbFF1aWNrRml4VHlwZS5PcGVuZXIsXG5cdFx0XHRcdFx0XHRcdFx0XHRraW5kOiBvcHRpb24ua2luZCxcblx0XHRcdFx0XHRcdFx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiBvcGVuZXJTZXJ2aWNlLm9wZW4oZml4LnVyaSksXG5cdFx0XHRcdFx0XHRcdFx0XHR0b29sdGlwOiBsYWJlbCxcblx0XHRcdFx0XHRcdFx0XHRcdHVyaTogZml4LnVyaVxuXHRcdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0Y2FzZSBUZXJtaW5hbFF1aWNrRml4VHlwZS5Qb3J0OiB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgZml4ID0gcXVpY2tGaXggYXMgSVRlcm1pbmFsQWN0aW9uO1xuXHRcdFx0XHRcdFx0XHRcdGFjdGlvbiA9IHtcblx0XHRcdFx0XHRcdFx0XHRcdHNvdXJjZTogJ2J1aWx0aW4nLFxuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogZml4LnR5cGUsXG5cdFx0XHRcdFx0XHRcdFx0XHRraW5kOiBvcHRpb24ua2luZCxcblx0XHRcdFx0XHRcdFx0XHRcdGlkOiBmaXguaWQsXG5cdFx0XHRcdFx0XHRcdFx0XHRsYWJlbDogZml4LmxhYmVsLFxuXHRcdFx0XHRcdFx0XHRcdFx0Y2xhc3M6IGZpeC5jbGFzcyxcblx0XHRcdFx0XHRcdFx0XHRcdGVuYWJsZWQ6IGZpeC5lbmFibGVkLFxuXHRcdFx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGZpeC5ydW4oKTtcblx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHR0b29sdGlwOiBmaXgudG9vbHRpcFxuXHRcdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0Y2FzZSBUZXJtaW5hbFF1aWNrRml4VHlwZS5Wc2NvZGVDb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgZml4ID0gcXVpY2tGaXggYXMgSVRlcm1pbmFsUXVpY2tGaXhDb21tYW5kQWN0aW9uO1xuXHRcdFx0XHRcdFx0XHRcdGFjdGlvbiA9IHtcblx0XHRcdFx0XHRcdFx0XHRcdHNvdXJjZTogcXVpY2tGaXguc291cmNlLFxuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogZml4LnR5cGUsXG5cdFx0XHRcdFx0XHRcdFx0XHRraW5kOiBvcHRpb24ua2luZCxcblx0XHRcdFx0XHRcdFx0XHRcdGlkOiBmaXguaWQsXG5cdFx0XHRcdFx0XHRcdFx0XHRsYWJlbDogZml4LnRpdGxlLFxuXHRcdFx0XHRcdFx0XHRcdFx0Y2xhc3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRcdFx0XHRydW46ICgpID0+IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGZpeC5pZCksXG5cdFx0XHRcdFx0XHRcdFx0XHR0b29sdGlwOiBmaXgudGl0bGVcblx0XHRcdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoYWN0aW9uKSB7XG5cdFx0XHRcdFx0XHRcdGZpeGVzLnB1c2goYWN0aW9uKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIGZpeGVzLmxlbmd0aCA+IDAgPyBmaXhlcyA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gY29udmVydFRvUXVpY2tGaXhPcHRpb25zKHNlbGVjdG9yUHJvdmlkZXI6IElUZXJtaW5hbFF1aWNrRml4UHJvdmlkZXJTZWxlY3Rvcik6IElUZXJtaW5hbFF1aWNrRml4UmVzb2x2ZWRFeHRlbnNpb25PcHRpb25zIHtcblx0cmV0dXJuIHtcblx0XHRpZDogc2VsZWN0b3JQcm92aWRlci5zZWxlY3Rvci5pZCxcblx0XHR0eXBlOiAncmVzb2x2ZWQnLFxuXHRcdGNvbW1hbmRMaW5lTWF0Y2hlcjogc2VsZWN0b3JQcm92aWRlci5zZWxlY3Rvci5jb21tYW5kTGluZU1hdGNoZXIsXG5cdFx0b3V0cHV0TWF0Y2hlcjogc2VsZWN0b3JQcm92aWRlci5zZWxlY3Rvci5vdXRwdXRNYXRjaGVyLFxuXHRcdGNvbW1hbmRFeGl0UmVzdWx0OiBzZWxlY3RvclByb3ZpZGVyLnNlbGVjdG9yLmNvbW1hbmRFeGl0UmVzdWx0LFxuXHRcdGtpbmQ6IHNlbGVjdG9yUHJvdmlkZXIuc2VsZWN0b3Iua2luZCxcblx0XHRnZXRRdWlja0ZpeGVzOiBzZWxlY3RvclByb3ZpZGVyLnByb3ZpZGVyLnByb3ZpZGVUZXJtaW5hbFF1aWNrRml4ZXNcblx0fTtcbn1cblxuY2xhc3MgVGVybWluYWxRdWlja0ZpeEl0ZW0ge1xuXHRyZWFkb25seSBkaXNhYmxlZCA9IGZhbHNlO1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBhY3Rpb246IElUZXJtaW5hbEFjdGlvbixcblx0XHRyZWFkb25seSB0eXBlOiBUZXJtaW5hbFF1aWNrRml4VHlwZSxcblx0XHRyZWFkb25seSBzb3VyY2U6IHN0cmluZyxcblx0XHRyZWFkb25seSB0aXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdHJlYWRvbmx5IGtpbmQ6ICdmaXgnIHwgJ2V4cGxhaW4nID0gJ2ZpeCdcblx0KSB7XG5cdH1cbn1cblxuZnVuY3Rpb24gdG9BY3Rpb25XaWRnZXRJdGVtcyhpbnB1dFF1aWNrRml4ZXM6IHJlYWRvbmx5IFRlcm1pbmFsUXVpY2tGaXhJdGVtW10sIHNob3dIZWFkZXJzOiBib29sZWFuKTogSUFjdGlvbkxpc3RJdGVtPFRlcm1pbmFsUXVpY2tGaXhJdGVtPltdIHtcblx0Y29uc3QgbWVudUl0ZW1zOiBJQWN0aW9uTGlzdEl0ZW08VGVybWluYWxRdWlja0ZpeEl0ZW0+W10gPSBbXTtcblx0bWVudUl0ZW1zLnB1c2goe1xuXHRcdGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5IZWFkZXIsXG5cdFx0Z3JvdXA6IHtcblx0XHRcdGtpbmQ6IENvZGVBY3Rpb25LaW5kLlF1aWNrRml4LFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjb2RlQWN0aW9uLndpZGdldC5pZC5xdWlja2ZpeCcsICdRdWljayBGaXgnKVxuXHRcdH1cblx0fSk7XG5cdGZvciAoY29uc3QgcXVpY2tGaXggb2Ygc2hvd0hlYWRlcnMgPyBpbnB1dFF1aWNrRml4ZXMgOiBpbnB1dFF1aWNrRml4ZXMuZmlsdGVyKGkgPT4gISFpLmFjdGlvbikpIHtcblx0XHRpZiAoIXF1aWNrRml4LmRpc2FibGVkICYmIHF1aWNrRml4LmFjdGlvbikge1xuXHRcdFx0bWVudUl0ZW1zLnB1c2goe1xuXHRcdFx0XHRraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuQWN0aW9uLFxuXHRcdFx0XHRpdGVtOiBxdWlja0ZpeCxcblx0XHRcdFx0Z3JvdXA6IHtcblx0XHRcdFx0XHRraW5kOiBDb2RlQWN0aW9uS2luZC5RdWlja0ZpeCxcblx0XHRcdFx0XHRpY29uOiBnZXRRdWlja0ZpeEljb24ocXVpY2tGaXgpLFxuXHRcdFx0XHRcdHRpdGxlOiBxdWlja0ZpeC5hY3Rpb24ubGFiZWxcblx0XHRcdFx0fSxcblx0XHRcdFx0ZGlzYWJsZWQ6IGZhbHNlLFxuXHRcdFx0XHRsYWJlbDogcXVpY2tGaXgudGl0bGVcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gbWVudUl0ZW1zO1xufVxuXG5mdW5jdGlvbiBnZXRRdWlja0ZpeEljb24ocXVpY2tGaXg6IFRlcm1pbmFsUXVpY2tGaXhJdGVtKTogVGhlbWVJY29uIHtcblx0aWYgKHF1aWNrRml4LmtpbmQgPT09ICdleHBsYWluJykge1xuXHRcdHJldHVybiBDb2RpY29uLnNwYXJrbGU7XG5cdH1cblx0c3dpdGNoIChxdWlja0ZpeC50eXBlKSB7XG5cdFx0Y2FzZSBUZXJtaW5hbFF1aWNrRml4VHlwZS5PcGVuZXI6XG5cdFx0XHRpZiAocXVpY2tGaXguYWN0aW9uLnVyaSkge1xuXHRcdFx0XHRjb25zdCBpc1VybCA9IChxdWlja0ZpeC5hY3Rpb24udXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5odHRwIHx8IHF1aWNrRml4LmFjdGlvbi51cmkuc2NoZW1lID09PSBTY2hlbWFzLmh0dHBzKTtcblx0XHRcdFx0cmV0dXJuIGlzVXJsID8gQ29kaWNvbi5saW5rRXh0ZXJuYWwgOiBDb2RpY29uLmdvVG9GaWxlO1xuXHRcdFx0fVxuXHRcdGNhc2UgVGVybWluYWxRdWlja0ZpeFR5cGUuVGVybWluYWxDb21tYW5kOlxuXHRcdFx0cmV0dXJuIENvZGljb24ucnVuO1xuXHRcdGNhc2UgVGVybWluYWxRdWlja0ZpeFR5cGUuUG9ydDpcblx0XHRcdHJldHVybiBDb2RpY29uLmRlYnVnRGlzY29ubmVjdDtcblx0XHRjYXNlIFRlcm1pbmFsUXVpY2tGaXhUeXBlLlZzY29kZUNvbW1hbmQ6XG5cdFx0XHRyZXR1cm4gQ29kaWNvbi5saWdodGJ1bGI7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6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bUIsaUJBQWlCLFNBQVM7QUFBQSxJQUM3QyxNQUFNLGlCQUFpQixTQUFTO0FBQUEsSUFDaEMsZUFBZSxpQkFBaUIsU0FBUztBQUFBLEVBQzFDO0FBQ0Q7QUFFQSxNQUFNLHFCQUFxQjtBQUFBLEVBRTFCLFlBQ1UsUUFDQSxNQUNBLFFBQ0EsT0FDQSxPQUEwQixPQUNsQztBQUxRO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFOVixTQUFTLFdBQVc7QUFBQSxFQVFwQjtBQUNEO0FBRUEsU0FBUyxvQkFBb0IsaUJBQWtELGFBQStEO0FBQzdJLFFBQU0sWUFBcUQsQ0FBQztBQUM1RCxZQUFVLEtBQUs7QUFBQSxJQUNkLE1BQU0sbUJBQW1CO0FBQUEsSUFDekIsT0FBTztBQUFBLE1BQ04sTUFBTSxlQUFlO0FBQUEsTUFDckIsT0FBTyxTQUFTLGlDQUFpQyxXQUFXO0FBQUEsSUFDN0Q7QUFBQSxFQUNELENBQUM7QUFDRCxhQUFXLFlBQVksY0FBYyxrQkFBa0IsZ0JBQWdCLE9BQU8sT0FBSyxDQUFDLENBQUMsRUFBRSxNQUFNLEdBQUc7QUFDL0YsUUFBSSxDQUFDLFNBQVMsWUFBWSxTQUFTLFFBQVE7QUFDMUMsZ0JBQVUsS0FBSztBQUFBLFFBQ2QsTUFBTSxtQkFBbUI7QUFBQSxRQUN6QixNQUFNO0FBQUEsUUFDTixPQUFPO0FBQUEsVUFDTixNQUFNLGVBQWU7QUFBQSxVQUNyQixNQUFNLGdCQUFnQixRQUFRO0FBQUEsVUFDOUIsT0FBTyxTQUFTLE9BQU87QUFBQSxRQUN4QjtBQUFBLFFBQ0EsVUFBVTtBQUFBLFFBQ1YsT0FBTyxTQUFTO0FBQUEsTUFDakIsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQ0EsU0FBTztBQUNSO0FBRUEsU0FBUyxnQkFBZ0IsVUFBMkM7QUFDbkUsTUFBSSxTQUFTLFNBQVMsV0FBVztBQUNoQyxXQUFPLFFBQVE7QUFBQSxFQUNoQjtBQUNBLFVBQVEsU0FBUyxNQUFNO0FBQUEsSUFDdEIsS0FBSyxxQkFBcUI7QUFDekIsVUFBSSxTQUFTLE9BQU8sS0FBSztBQUN4QixjQUFNLFFBQVMsU0FBUyxPQUFPLElBQUksV0FBVyxRQUFRLFFBQVEsU0FBUyxPQUFPLElBQUksV0FBVyxRQUFRO0FBQ3JHLGVBQU8sUUFBUSxRQUFRLGVBQWUsUUFBUTtBQUFBLE1BQy9DO0FBQUEsSUFDRCxLQUFLLHFCQUFxQjtBQUN6QixhQUFPLFFBQVE7QUFBQSxJQUNoQixLQUFLLHFCQUFxQjtBQUN6QixhQUFPLFFBQVE7QUFBQSxJQUNoQixLQUFLLHFCQUFxQjtBQUN6QixhQUFPLFFBQVE7QUFBQSxFQUNqQjtBQUNEOyIsCiAgIm5hbWVzIjogWyJRdWlja0ZpeERlY29yYXRpb25TZWxlY3RvciIsICJlIl0KfQo=
