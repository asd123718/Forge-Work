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
import { assertNever } from "../../../../base/common/assert.js";
import { disposableTimeout, RunOnceScheduler, timeout } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, derived, ObservablePromise, observableSignalFromEvent, observableValue } from "../../../../base/common/observable.js";
import { basename } from "../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { getIconClasses } from "../../../../editor/common/services/getIconClasses.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { localize } from "../../../../nls.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { TerminalCapability } from "../../../../platform/terminal/common/capabilities/capabilities.js";
import { TerminalLocation } from "../../../../platform/terminal/common/terminal.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { QueryBuilder } from "../../../services/search/common/queryBuilder.js";
import { ISearchService } from "../../../services/search/common/search.js";
import { ITerminalGroupService, ITerminalService } from "../../terminal/browser/terminal.js";
const SHELL_INTEGRATION_TIMEOUT = 5e3;
const NO_SHELL_INTEGRATION_IDLE = 1e3;
const SUGGEST_DEBOUNCE = 200;
let McpPromptArgumentPick = class extends Disposable {
  constructor(prompt, _quickInputService, _terminalService, _searchService, _workspaceContextService, _labelService, _fileService, _modelService, _languageService, _terminalGroupService, _instantiationService, _codeEditorService, _editorService) {
    super();
    this.prompt = prompt;
    this._quickInputService = _quickInputService;
    this._terminalService = _terminalService;
    this._searchService = _searchService;
    this._workspaceContextService = _workspaceContextService;
    this._labelService = _labelService;
    this._fileService = _fileService;
    this._modelService = _modelService;
    this._languageService = _languageService;
    this._terminalGroupService = _terminalGroupService;
    this._instantiationService = _instantiationService;
    this._codeEditorService = _codeEditorService;
    this._editorService = _editorService;
    this.quickPick = this._register(_quickInputService.createQuickPick({ useSeparators: true }));
  }
  async createArgs(token) {
    const { quickPick, prompt } = this;
    quickPick.totalSteps = prompt.arguments.length;
    quickPick.step = 0;
    quickPick.ignoreFocusOut = true;
    quickPick.sortByLabel = false;
    const args = {};
    const backSnapshots = [];
    for (let i = 0; i < prompt.arguments.length; i++) {
      const arg = prompt.arguments[i];
      const restore = backSnapshots.at(i);
      quickPick.step = i + 1;
      quickPick.placeholder = arg.required ? arg.description : `${arg.description || ""} (${localize("optional", "Optional")})`;
      quickPick.title = localize("mcp.prompt.pick.title", "Value for: {0}", arg.title || arg.name);
      quickPick.value = restore?.value ?? (args.hasOwnProperty(arg.name) && args[arg.name] || "");
      quickPick.items = restore?.items ?? [];
      quickPick.activeItems = restore?.activeItems ?? [];
      quickPick.buttons = i > 0 ? [this._quickInputService.backButton] : [];
      const value = await this._getArg(arg, !!restore, args, token);
      if (value.type === "back") {
        i -= 2;
      } else if (value.type === "cancel") {
        return void 0;
      } else if (value.type === "arg") {
        backSnapshots[i] = { value: quickPick.value, items: quickPick.items.slice(), activeItems: quickPick.activeItems.slice() };
        args[arg.name] = value.value;
      } else {
        assertNever(value);
      }
    }
    quickPick.value = "";
    quickPick.placeholder = localize("loading", "Loading...");
    quickPick.busy = true;
    return args;
  }
  async _getArg(arg, didRestoreState, argsSoFar, token) {
    const { quickPick } = this;
    const store = new DisposableStore();
    const input$ = observableValue(this, quickPick.value);
    const asyncPicks = [
      {
        name: localize("mcp.arg.suggestions", "Suggestions"),
        observer: this._promptCompletions(arg, input$, argsSoFar)
      },
      {
        name: localize("mcp.arg.activeFiles", "Active File"),
        observer: this._activeFileCompletions()
      },
      {
        name: localize("mcp.arg.files", "Files"),
        observer: this._fileCompletions(input$)
      }
    ];
    store.add(autorun((reader) => {
      if (didRestoreState) {
        input$.read(reader);
        return;
      }
      let items = [];
      items.push({ id: "insert-text", label: localize("mcp.arg.asText", "Insert as text"), iconClass: ThemeIcon.asClassName(Codicon.textSize), action: "text", alwaysShow: true });
      items.push({ id: "run-command", label: localize("mcp.arg.asCommand", "Run as Command"), description: localize("mcp.arg.asCommand.description", "Inserts the command output as the prompt argument"), iconClass: ThemeIcon.asClassName(Codicon.terminal), action: "command", alwaysShow: true });
      let busy = false;
      for (const pick of asyncPicks) {
        const state = pick.observer.read(reader);
        busy ||= state.busy;
        if (state.picks) {
          items.push({ label: pick.name, type: "separator" });
          items = items.concat(state.picks);
        }
      }
      const previouslyActive = quickPick.activeItems;
      quickPick.busy = busy;
      quickPick.items = items;
      const lastActive = items.find((i) => previouslyActive.some((a) => a.id === i.id));
      const serverSuggestions = asyncPicks[0].observer;
      if (lastActive) {
        quickPick.activeItems = [lastActive];
      } else if (serverSuggestions.read(reader).picks?.length) {
        quickPick.activeItems = [items[3]];
      } else if (busy) {
        quickPick.activeItems = [];
      } else {
        quickPick.activeItems = [items[0]];
      }
    }));
    try {
      const value = await new Promise((resolve) => {
        if (token) {
          store.add(token.onCancellationRequested(() => {
            resolve(void 0);
          }));
        }
        store.add(quickPick.onDidChangeValue((value2) => {
          quickPick.validationMessage = void 0;
          input$.set(value2, void 0);
        }));
        store.add(quickPick.onDidAccept(() => {
          const item = quickPick.selectedItems[0];
          if (!quickPick.value && arg.required && (!item || item.action === "text" || item.action === "command")) {
            quickPick.validationMessage = localize("mcp.arg.required", "This argument is required");
          } else if (!item) {
            resolve({ id: "insert-text", label: "", action: "text" });
          } else {
            resolve(item);
          }
        }));
        store.add(quickPick.onDidTriggerButton(() => {
          resolve("back");
        }));
        store.add(quickPick.onDidHide(() => {
          resolve(void 0);
        }));
        quickPick.show();
      });
      if (value === "back") {
        return { type: "back" };
      }
      if (value === void 0) {
        return { type: "cancel" };
      }
      store.clear();
      const cts = new CancellationTokenSource();
      store.add(toDisposable(() => cts.dispose(true)));
      store.add(quickPick.onDidHide(() => store.dispose()));
      switch (value.action) {
        case "text":
          return { type: "arg", value: quickPick.value || void 0 };
        case "command":
          if (!quickPick.value) {
            return { type: "arg", value: void 0 };
          }
          quickPick.busy = true;
          return { type: "arg", value: await this._getTerminalOutput(quickPick.value, cts.token) };
        case "suggest":
          return { type: "arg", value: value.label };
        case "file":
          quickPick.busy = true;
          return { type: "arg", value: await this._fileService.readFile(value.uri).then((c) => c.value.toString()) };
        case "selectedText":
          return { type: "arg", value: value.selectedText };
        default:
          assertNever(value);
      }
    } finally {
      store.dispose();
    }
  }
  _promptCompletions(arg, input, argsSoFar) {
    const alreadyResolved = {};
    for (const [key, value] of Object.entries(argsSoFar)) {
      if (value) {
        alreadyResolved[key] = value;
      }
    }
    return this._asyncCompletions(input, async (i, t) => {
      const items = await this.prompt.complete(arg.name, i, alreadyResolved, t);
      return items.map((i2) => ({ id: `suggest:${i2}`, label: i2, action: "suggest" }));
    });
  }
  _fileCompletions(input) {
    const qb = this._instantiationService.createInstance(QueryBuilder);
    return this._asyncCompletions(input, async (i, token) => {
      if (!i) {
        return [];
      }
      const query = qb.file(this._workspaceContextService.getWorkspace().folders, {
        filePattern: i,
        maxResults: 10
      });
      const { results } = await this._searchService.fileSearch(query, token);
      return results.map((i2) => ({
        id: i2.resource.toString(),
        label: basename(i2.resource),
        description: this._labelService.getUriLabel(i2.resource),
        iconClasses: getIconClasses(this._modelService, this._languageService, i2.resource),
        uri: i2.resource,
        action: "file"
      }));
    });
  }
  _activeFileCompletions() {
    const activeEditorChange = observableSignalFromEvent(this, this._editorService.onDidActiveEditorChange);
    const activeEditor = derived((reader) => {
      activeEditorChange.read(reader);
      return this._codeEditorService.getActiveCodeEditor();
    });
    const resourceObs = activeEditor.map((e) => e ? observableSignalFromEvent(this, e.onDidChangeModel).map(() => e.getModel()?.uri) : void 0).map((o, reader) => o?.read(reader));
    const selectionObs = activeEditor.map((e) => e ? observableSignalFromEvent(this, e.onDidChangeCursorSelection).map(() => ({ range: e.getSelection(), model: e.getModel() })) : void 0).map((o, reader) => o?.read(reader));
    return derived((reader) => {
      const resource = resourceObs.read(reader);
      if (!resource) {
        return { busy: false, picks: [] };
      }
      const items = [];
      items.push({
        id: "active-file",
        label: localize("mcp.arg.activeFile", "Active File"),
        description: this._labelService.getUriLabel(resource),
        iconClasses: getIconClasses(this._modelService, this._languageService, resource),
        uri: resource,
        action: "file"
      });
      const selection = selectionObs.read(reader);
      if (selection && selection.model && selection.range && !selection.range.isEmpty()) {
        const selectedText = selection.model.getValueInRange(selection.range);
        const lineCount = selection.range.endLineNumber - selection.range.startLineNumber + 1;
        const description = lineCount === 1 ? localize("mcp.arg.selectedText.singleLine", "line {0}", selection.range.startLineNumber) : localize("mcp.arg.selectedText.multiLine", "{0} lines", lineCount);
        items.push({
          id: "selected-text",
          label: localize("mcp.arg.selectedText", "Selected Text"),
          description,
          selectedText,
          iconClass: ThemeIcon.asClassName(Codicon.selection),
          uri: resource,
          action: "selectedText"
        });
      }
      return { picks: items, busy: false };
    });
  }
  _asyncCompletions(input, mapper) {
    const promise = derived((reader) => {
      const queryValue = input.read(reader);
      const cts = new CancellationTokenSource();
      reader.store.add(toDisposable(() => cts.dispose(true)));
      return new ObservablePromise(
        timeout(SUGGEST_DEBOUNCE, cts.token).then(() => mapper(queryValue, cts.token)).catch(() => [])
      );
    });
    return promise.map((value, reader) => {
      const result = value.promiseResult.read(reader);
      return { picks: result?.data || [], busy: result === void 0 };
    });
  }
  async _getTerminalOutput(command, token) {
    const terminal = this._terminal ??= this._register(await this._terminalService.createTerminal({
      config: {
        name: localize("mcp.terminal.name", "MCP Terminal"),
        isTransient: true,
        forceShellIntegration: true,
        isFeatureTerminal: true
      },
      location: TerminalLocation.Panel
    }));
    this._terminalService.setActiveInstance(terminal);
    this._terminalGroupService.showPanel(false);
    const shellIntegration = terminal.capabilities.get(TerminalCapability.CommandDetection);
    if (shellIntegration) {
      return this._getTerminalOutputInner(terminal, command, shellIntegration, token);
    }
    const store = new DisposableStore();
    return await new Promise((resolve) => {
      store.add(terminal.capabilities.onDidAddCapability((e) => {
        if (e.id === TerminalCapability.CommandDetection) {
          store.dispose();
          resolve(this._getTerminalOutputInner(terminal, command, e.capability, token));
        }
      }));
      store.add(token.onCancellationRequested(() => {
        store.dispose();
        resolve(void 0);
      }));
      store.add(disposableTimeout(() => {
        store.dispose();
        resolve(this._getTerminalOutputInner(terminal, command, void 0, token));
      }, SHELL_INTEGRATION_TIMEOUT));
    });
  }
  async _getTerminalOutputInner(terminal, command, shellIntegration, token) {
    const store = new DisposableStore();
    return new Promise((resolve) => {
      let allData = "";
      store.add(terminal.onLineData((d) => allData += d + "\n"));
      if (shellIntegration) {
        store.add(shellIntegration.onCommandFinished((e) => resolve(e.getOutput() || allData)));
      } else {
        const done = store.add(new RunOnceScheduler(() => resolve(allData), NO_SHELL_INTEGRATION_IDLE));
        store.add(terminal.onData(() => done.schedule()));
      }
      store.add(token.onCancellationRequested(() => resolve(void 0)));
      store.add(terminal.onDisposed(() => resolve(void 0)));
      terminal.runCommand(command, true);
    }).finally(() => {
      store.dispose();
    });
  }
};
McpPromptArgumentPick = __decorateClass([
  __decorateParam(1, IQuickInputService),
  __decorateParam(2, ITerminalService),
  __decorateParam(3, ISearchService),
  __decorateParam(4, IWorkspaceContextService),
  __decorateParam(5, ILabelService),
  __decorateParam(6, IFileService),
  __decorateParam(7, IModelService),
  __decorateParam(8, ILanguageService),
  __decorateParam(9, ITerminalGroupService),
  __decorateParam(10, IInstantiationService),
  __decorateParam(11, ICodeEditorService),
  __decorateParam(12, IEditorService)
], McpPromptArgumentPick);
export {
  McpPromptArgumentPick
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcYnJvd3NlclxcbWNwUHJvbXB0QXJndW1lbnRQaWNrLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgYXNzZXJ0TmV2ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3NlcnQuanMnO1xuaW1wb3J0IHsgZGlzcG9zYWJsZVRpbWVvdXQsIFJ1bk9uY2VTY2hlZHVsZXIsIHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGRlcml2ZWQsIElPYnNlcnZhYmxlLCBPYnNlcnZhYmxlUHJvbWlzZSwgb2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudCwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBnZXRJY29uQ2xhc3NlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvZ2V0SWNvbkNsYXNzZXMuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2ssIElRdWlja1BpY2tJdGVtLCBJUXVpY2tQaWNrU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHksIFRlcm1pbmFsQ2FwYWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY2FwYWJpbGl0aWVzLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUXVlcnlCdWlsZGVyIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9xdWVyeUJ1aWxkZXIuanMnO1xuaW1wb3J0IHsgSVNlYXJjaFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3NlYXJjaC5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxHcm91cFNlcnZpY2UsIElUZXJtaW5hbEluc3RhbmNlLCBJVGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJTWNwUHJvbXB0IH0gZnJvbSAnLi4vY29tbW9uL21jcFR5cGVzLmpzJztcbmltcG9ydCB7IE1DUCB9IGZyb20gJy4uL2NvbW1vbi9tb2RlbENvbnRleHRQcm90b2NvbC5qcyc7XG5cbnR5cGUgUGlja0l0ZW0gPSBJUXVpY2tQaWNrSXRlbSAmIChcblx0fCB7IGFjdGlvbjogJ3RleHQnIHwgJ2NvbW1hbmQnIHwgJ3N1Z2dlc3QnIH1cblx0fCB7IGFjdGlvbjogJ2ZpbGUnOyB1cmk6IFVSSSB9XG5cdHwgeyBhY3Rpb246ICdzZWxlY3RlZFRleHQnOyB1cmk6IFVSSTsgc2VsZWN0ZWRUZXh0OiBzdHJpbmcgfVxuKTtcblxuY29uc3QgU0hFTExfSU5URUdSQVRJT05fVElNRU9VVCA9IDUwMDA7XG5jb25zdCBOT19TSEVMTF9JTlRFR1JBVElPTl9JRExFID0gMTAwMDtcbmNvbnN0IFNVR0dFU1RfREVCT1VOQ0UgPSAyMDA7XG5cbnR5cGUgQWN0aW9uID0geyB0eXBlOiAnYXJnJzsgdmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCB9IHwgeyB0eXBlOiAnYmFjaycgfSB8IHsgdHlwZTogJ2NhbmNlbCcgfTtcblxuZXhwb3J0IGNsYXNzIE1jcFByb21wdEFyZ3VtZW50UGljayBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IHF1aWNrUGljazogSVF1aWNrUGljazxQaWNrSXRlbSwgeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0+O1xuXHRwcml2YXRlIF90ZXJtaW5hbD86IElUZXJtaW5hbEluc3RhbmNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcHJvbXB0OiBJTWNwUHJvbXB0LFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASVRlcm1pbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFNlcnZpY2U6IElUZXJtaW5hbFNlcnZpY2UsXG5cdFx0QElTZWFyY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3NlYXJjaFNlcnZpY2U6IElTZWFyY2hTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbEdyb3VwU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbEdyb3VwU2VydmljZTogSVRlcm1pbmFsR3JvdXBTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMucXVpY2tQaWNrID0gdGhpcy5fcmVnaXN0ZXIoX3F1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljayh7IHVzZVNlcGFyYXRvcnM6IHRydWUgfSkpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGNyZWF0ZUFyZ3ModG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8UmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHsgcXVpY2tQaWNrLCBwcm9tcHQgfSA9IHRoaXM7XG5cblx0XHRxdWlja1BpY2sudG90YWxTdGVwcyA9IHByb21wdC5hcmd1bWVudHMubGVuZ3RoO1xuXHRcdHF1aWNrUGljay5zdGVwID0gMDtcblx0XHRxdWlja1BpY2suaWdub3JlRm9jdXNPdXQgPSB0cnVlO1xuXHRcdHF1aWNrUGljay5zb3J0QnlMYWJlbCA9IGZhbHNlO1xuXG5cdFx0Y29uc3QgYXJnczogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPiA9IHt9O1xuXHRcdGNvbnN0IGJhY2tTbmFwc2hvdHM6IHsgdmFsdWU6IHN0cmluZzsgaXRlbXM6IHJlYWRvbmx5IChQaWNrSXRlbSB8IElRdWlja1BpY2tTZXBhcmF0b3IpW107IGFjdGl2ZUl0ZW1zOiByZWFkb25seSBQaWNrSXRlbVtdIH1bXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcHJvbXB0LmFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgYXJnID0gcHJvbXB0LmFyZ3VtZW50c1tpXTtcblx0XHRcdGNvbnN0IHJlc3RvcmUgPSBiYWNrU25hcHNob3RzLmF0KGkpO1xuXHRcdFx0cXVpY2tQaWNrLnN0ZXAgPSBpICsgMTtcblx0XHRcdHF1aWNrUGljay5wbGFjZWhvbGRlciA9IGFyZy5yZXF1aXJlZCA/IGFyZy5kZXNjcmlwdGlvbiA6IGAke2FyZy5kZXNjcmlwdGlvbiB8fCAnJ30gKCR7bG9jYWxpemUoJ29wdGlvbmFsJywgJ09wdGlvbmFsJyl9KWA7XG5cdFx0XHRxdWlja1BpY2sudGl0bGUgPSBsb2NhbGl6ZSgnbWNwLnByb21wdC5waWNrLnRpdGxlJywgJ1ZhbHVlIGZvcjogezB9JywgYXJnLnRpdGxlIHx8IGFyZy5uYW1lKTtcblx0XHRcdHF1aWNrUGljay52YWx1ZSA9IHJlc3RvcmU/LnZhbHVlID8/ICgoYXJncy5oYXNPd25Qcm9wZXJ0eShhcmcubmFtZSkgJiYgYXJnc1thcmcubmFtZV0pIHx8ICcnKTtcblx0XHRcdHF1aWNrUGljay5pdGVtcyA9IHJlc3RvcmU/Lml0ZW1zID8/IFtdO1xuXHRcdFx0cXVpY2tQaWNrLmFjdGl2ZUl0ZW1zID0gcmVzdG9yZT8uYWN0aXZlSXRlbXMgPz8gW107XG5cdFx0XHRxdWlja1BpY2suYnV0dG9ucyA9IGkgPiAwID8gW3RoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLmJhY2tCdXR0b25dIDogW107XG5cblx0XHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgdGhpcy5fZ2V0QXJnKGFyZywgISFyZXN0b3JlLCBhcmdzLCB0b2tlbik7XG5cdFx0XHRpZiAodmFsdWUudHlwZSA9PT0gJ2JhY2snKSB7XG5cdFx0XHRcdGkgLT0gMjtcblx0XHRcdH0gZWxzZSBpZiAodmFsdWUudHlwZSA9PT0gJ2NhbmNlbCcpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0gZWxzZSBpZiAodmFsdWUudHlwZSA9PT0gJ2FyZycpIHtcblx0XHRcdFx0YmFja1NuYXBzaG90c1tpXSA9IHsgdmFsdWU6IHF1aWNrUGljay52YWx1ZSwgaXRlbXM6IHF1aWNrUGljay5pdGVtcy5zbGljZSgpLCBhY3RpdmVJdGVtczogcXVpY2tQaWNrLmFjdGl2ZUl0ZW1zLnNsaWNlKCkgfTtcblx0XHRcdFx0YXJnc1thcmcubmFtZV0gPSB2YWx1ZS52YWx1ZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGFzc2VydE5ldmVyKHZhbHVlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRxdWlja1BpY2sudmFsdWUgPSAnJztcblx0XHRxdWlja1BpY2sucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnbG9hZGluZycsICdMb2FkaW5nLi4uJyk7XG5cdFx0cXVpY2tQaWNrLmJ1c3kgPSB0cnVlO1xuXG5cdFx0cmV0dXJuIGFyZ3M7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRBcmcoYXJnOiBNQ1AuUHJvbXB0QXJndW1lbnQsIGRpZFJlc3RvcmVTdGF0ZTogYm9vbGVhbiwgYXJnc1NvRmFyOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+LCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxBY3Rpb24+IHtcblx0XHRjb25zdCB7IHF1aWNrUGljayB9ID0gdGhpcztcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IGlucHV0JCA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBxdWlja1BpY2sudmFsdWUpO1xuXHRcdGNvbnN0IGFzeW5jUGlja3MgPSBbXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6IGxvY2FsaXplKCdtY3AuYXJnLnN1Z2dlc3Rpb25zJywgJ1N1Z2dlc3Rpb25zJyksXG5cdFx0XHRcdG9ic2VydmVyOiB0aGlzLl9wcm9tcHRDb21wbGV0aW9ucyhhcmcsIGlucHV0JCwgYXJnc1NvRmFyKSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6IGxvY2FsaXplKCdtY3AuYXJnLmFjdGl2ZUZpbGVzJywgJ0FjdGl2ZSBGaWxlJyksXG5cdFx0XHRcdG9ic2VydmVyOiB0aGlzLl9hY3RpdmVGaWxlQ29tcGxldGlvbnMoKSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6IGxvY2FsaXplKCdtY3AuYXJnLmZpbGVzJywgJ0ZpbGVzJyksXG5cdFx0XHRcdG9ic2VydmVyOiB0aGlzLl9maWxlQ29tcGxldGlvbnMoaW5wdXQkKSxcblx0XHRcdH1cblx0XHRdO1xuXG5cdFx0c3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGlmIChkaWRSZXN0b3JlU3RhdGUpIHtcblx0XHRcdFx0aW5wdXQkLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0cmV0dXJuOyAvLyBkb24ndCBvdmVyd3JpdGUgaW5pdGlhbCBpdGVtcyB1bnRpbCB0aGUgdXNlciB0eXBlc1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgaXRlbXM6IChQaWNrSXRlbSB8IElRdWlja1BpY2tTZXBhcmF0b3IpW10gPSBbXTtcblx0XHRcdGl0ZW1zLnB1c2goeyBpZDogJ2luc2VydC10ZXh0JywgbGFiZWw6IGxvY2FsaXplKCdtY3AuYXJnLmFzVGV4dCcsICdJbnNlcnQgYXMgdGV4dCcpLCBpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnRleHRTaXplKSwgYWN0aW9uOiAndGV4dCcsIGFsd2F5c1Nob3c6IHRydWUgfSk7XG5cdFx0XHRpdGVtcy5wdXNoKHsgaWQ6ICdydW4tY29tbWFuZCcsIGxhYmVsOiBsb2NhbGl6ZSgnbWNwLmFyZy5hc0NvbW1hbmQnLCAnUnVuIGFzIENvbW1hbmQnKSwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdtY3AuYXJnLmFzQ29tbWFuZC5kZXNjcmlwdGlvbicsICdJbnNlcnRzIHRoZSBjb21tYW5kIG91dHB1dCBhcyB0aGUgcHJvbXB0IGFyZ3VtZW50JyksIGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24udGVybWluYWwpLCBhY3Rpb246ICdjb21tYW5kJywgYWx3YXlzU2hvdzogdHJ1ZSB9KTtcblxuXHRcdFx0bGV0IGJ1c3kgPSBmYWxzZTtcblx0XHRcdGZvciAoY29uc3QgcGljayBvZiBhc3luY1BpY2tzKSB7XG5cdFx0XHRcdGNvbnN0IHN0YXRlID0gcGljay5vYnNlcnZlci5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGJ1c3kgfHw9IHN0YXRlLmJ1c3k7XG5cdFx0XHRcdGlmIChzdGF0ZS5waWNrcykge1xuXHRcdFx0XHRcdGl0ZW1zLnB1c2goeyBsYWJlbDogcGljay5uYW1lLCB0eXBlOiAnc2VwYXJhdG9yJyB9KTtcblx0XHRcdFx0XHRpdGVtcyA9IGl0ZW1zLmNvbmNhdChzdGF0ZS5waWNrcyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcHJldmlvdXNseUFjdGl2ZSA9IHF1aWNrUGljay5hY3RpdmVJdGVtcztcblx0XHRcdHF1aWNrUGljay5idXN5ID0gYnVzeTtcblx0XHRcdHF1aWNrUGljay5pdGVtcyA9IGl0ZW1zO1xuXG5cdFx0XHRjb25zdCBsYXN0QWN0aXZlID0gaXRlbXMuZmluZChpID0+IHByZXZpb3VzbHlBY3RpdmUuc29tZShhID0+IGEuaWQgPT09IGkuaWQpKSBhcyBQaWNrSXRlbSB8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHNlcnZlclN1Z2dlc3Rpb25zID0gYXN5bmNQaWNrc1swXS5vYnNlcnZlcjtcblx0XHRcdC8vIEtlZXAgYW55IHNlbGVjdGlvbiBzdGF0ZSwgYnV0IG90aGVyd2lzZSBzZWxlY3QgdGhlIGZpcnN0IGNvbXBsZXRpb24gaXRlbSwgYW5kIGF2b2lkIGRlZmF1bHQtc2VsZWN0aW5nIHRoZSB0b3AgaXRlbSB1bmxlc3MgdGhlcmUgYXJlIG5vIGNvbXBsdGlvbnNcblx0XHRcdGlmIChsYXN0QWN0aXZlKSB7XG5cdFx0XHRcdHF1aWNrUGljay5hY3RpdmVJdGVtcyA9IFtsYXN0QWN0aXZlXTtcblx0XHRcdH0gZWxzZSBpZiAoc2VydmVyU3VnZ2VzdGlvbnMucmVhZChyZWFkZXIpLnBpY2tzPy5sZW5ndGgpIHtcblx0XHRcdFx0cXVpY2tQaWNrLmFjdGl2ZUl0ZW1zID0gW2l0ZW1zWzNdIGFzIFBpY2tJdGVtXTtcblx0XHRcdH0gZWxzZSBpZiAoYnVzeSkge1xuXHRcdFx0XHRxdWlja1BpY2suYWN0aXZlSXRlbXMgPSBbXTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHF1aWNrUGljay5hY3RpdmVJdGVtcyA9IFtpdGVtc1swXSBhcyBQaWNrSXRlbV07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgbmV3IFByb21pc2U8UGlja0l0ZW0gfCAnYmFjaycgfCB1bmRlZmluZWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHRpZiAodG9rZW4pIHtcblx0XHRcdFx0XHRzdG9yZS5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzdG9yZS5hZGQocXVpY2tQaWNrLm9uRGlkQ2hhbmdlVmFsdWUodmFsdWUgPT4ge1xuXHRcdFx0XHRcdHF1aWNrUGljay52YWxpZGF0aW9uTWVzc2FnZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRpbnB1dCQuc2V0KHZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHN0b3JlLmFkZChxdWlja1BpY2sub25EaWRBY2NlcHQoKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGl0ZW0gPSBxdWlja1BpY2suc2VsZWN0ZWRJdGVtc1swXTtcblx0XHRcdFx0XHRpZiAoIXF1aWNrUGljay52YWx1ZSAmJiBhcmcucmVxdWlyZWQgJiYgKCFpdGVtIHx8IGl0ZW0uYWN0aW9uID09PSAndGV4dCcgfHwgaXRlbS5hY3Rpb24gPT09ICdjb21tYW5kJykpIHtcblx0XHRcdFx0XHRcdHF1aWNrUGljay52YWxpZGF0aW9uTWVzc2FnZSA9IGxvY2FsaXplKCdtY3AuYXJnLnJlcXVpcmVkJywgXCJUaGlzIGFyZ3VtZW50IGlzIHJlcXVpcmVkXCIpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoIWl0ZW0pIHtcblx0XHRcdFx0XHRcdC8vIEZvciBvcHRpb25hbCBhcmd1bWVudHMgd2hlbiBubyBpdGVtIGlzIHNlbGVjdGVkLCByZXR1cm4gZW1wdHkgdGV4dCBhY3Rpb25cblx0XHRcdFx0XHRcdHJlc29sdmUoeyBpZDogJ2luc2VydC10ZXh0JywgbGFiZWw6ICcnLCBhY3Rpb246ICd0ZXh0JyB9KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmVzb2x2ZShpdGVtKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0c3RvcmUuYWRkKHF1aWNrUGljay5vbkRpZFRyaWdnZXJCdXR0b24oKCkgPT4ge1xuXHRcdFx0XHRcdHJlc29sdmUoJ2JhY2snKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRzdG9yZS5hZGQocXVpY2tQaWNrLm9uRGlkSGlkZSgoKSA9PiB7XG5cdFx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHF1aWNrUGljay5zaG93KCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKHZhbHVlID09PSAnYmFjaycpIHtcblx0XHRcdFx0cmV0dXJuIHsgdHlwZTogJ2JhY2snIH07XG5cdFx0XHR9XG5cblx0XHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiB7IHR5cGU6ICdjYW5jZWwnIH07XG5cdFx0XHR9XG5cblx0XHRcdHN0b3JlLmNsZWFyKCk7XG5cdFx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY3RzLmRpc3Bvc2UodHJ1ZSkpKTtcblx0XHRcdHN0b3JlLmFkZChxdWlja1BpY2sub25EaWRIaWRlKCgpID0+IHN0b3JlLmRpc3Bvc2UoKSkpO1xuXG5cdFx0XHRzd2l0Y2ggKHZhbHVlLmFjdGlvbikge1xuXHRcdFx0XHRjYXNlICd0ZXh0Jzpcblx0XHRcdFx0XHRyZXR1cm4geyB0eXBlOiAnYXJnJywgdmFsdWU6IHF1aWNrUGljay52YWx1ZSB8fCB1bmRlZmluZWQgfTtcblx0XHRcdFx0Y2FzZSAnY29tbWFuZCc6XG5cdFx0XHRcdFx0aWYgKCFxdWlja1BpY2sudmFsdWUpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7IHR5cGU6ICdhcmcnLCB2YWx1ZTogdW5kZWZpbmVkIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHF1aWNrUGljay5idXN5ID0gdHJ1ZTtcblx0XHRcdFx0XHRyZXR1cm4geyB0eXBlOiAnYXJnJywgdmFsdWU6IGF3YWl0IHRoaXMuX2dldFRlcm1pbmFsT3V0cHV0KHF1aWNrUGljay52YWx1ZSwgY3RzLnRva2VuKSB9O1xuXHRcdFx0XHRjYXNlICdzdWdnZXN0Jzpcblx0XHRcdFx0XHRyZXR1cm4geyB0eXBlOiAnYXJnJywgdmFsdWU6IHZhbHVlLmxhYmVsIH07XG5cdFx0XHRcdGNhc2UgJ2ZpbGUnOlxuXHRcdFx0XHRcdHF1aWNrUGljay5idXN5ID0gdHJ1ZTtcblx0XHRcdFx0XHRyZXR1cm4geyB0eXBlOiAnYXJnJywgdmFsdWU6IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlYWRGaWxlKHZhbHVlLnVyaSkudGhlbihjID0+IGMudmFsdWUudG9TdHJpbmcoKSkgfTtcblx0XHRcdFx0Y2FzZSAnc2VsZWN0ZWRUZXh0Jzpcblx0XHRcdFx0XHRyZXR1cm4geyB0eXBlOiAnYXJnJywgdmFsdWU6IHZhbHVlLnNlbGVjdGVkVGV4dCB9O1xuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdGFzc2VydE5ldmVyKHZhbHVlKTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Byb21wdENvbXBsZXRpb25zKGFyZzogTUNQLlByb21wdEFyZ3VtZW50LCBpbnB1dDogSU9ic2VydmFibGU8c3RyaW5nPiwgYXJnc1NvRmFyOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+KSB7XG5cdFx0Y29uc3QgYWxyZWFkeVJlc29sdmVkOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG5cdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoYXJnc1NvRmFyKSkge1xuXHRcdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHRcdGFscmVhZHlSZXNvbHZlZFtrZXldID0gdmFsdWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2FzeW5jQ29tcGxldGlvbnMoaW5wdXQsIGFzeW5jIChpLCB0KSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHRoaXMucHJvbXB0LmNvbXBsZXRlKGFyZy5uYW1lLCBpLCBhbHJlYWR5UmVzb2x2ZWQsIHQpO1xuXHRcdFx0cmV0dXJuIGl0ZW1zLm1hcCgoaSk6IFBpY2tJdGVtID0+ICh7IGlkOiBgc3VnZ2VzdDoke2l9YCwgbGFiZWw6IGksIGFjdGlvbjogJ3N1Z2dlc3QnIH0pKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbGVDb21wbGV0aW9ucyhpbnB1dDogSU9ic2VydmFibGU8c3RyaW5nPikge1xuXHRcdGNvbnN0IHFiID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUXVlcnlCdWlsZGVyKTtcblx0XHRyZXR1cm4gdGhpcy5fYXN5bmNDb21wbGV0aW9ucyhpbnB1dCwgYXN5bmMgKGksIHRva2VuKSA9PiB7XG5cdFx0XHRpZiAoIWkpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBxdWVyeSA9IHFiLmZpbGUodGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycywge1xuXHRcdFx0XHRmaWxlUGF0dGVybjogaSxcblx0XHRcdFx0bWF4UmVzdWx0czogMTAsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgeyByZXN1bHRzIH0gPSBhd2FpdCB0aGlzLl9zZWFyY2hTZXJ2aWNlLmZpbGVTZWFyY2gocXVlcnksIHRva2VuKTtcblxuXHRcdFx0cmV0dXJuIHJlc3VsdHMubWFwKChpKTogUGlja0l0ZW0gPT4gKHtcblx0XHRcdFx0aWQ6IGkucmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0bGFiZWw6IGJhc2VuYW1lKGkucmVzb3VyY2UpLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogdGhpcy5fbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGkucmVzb3VyY2UpLFxuXHRcdFx0XHRpY29uQ2xhc3NlczogZ2V0SWNvbkNsYXNzZXModGhpcy5fbW9kZWxTZXJ2aWNlLCB0aGlzLl9sYW5ndWFnZVNlcnZpY2UsIGkucmVzb3VyY2UpLFxuXHRcdFx0XHR1cmk6IGkucmVzb3VyY2UsXG5cdFx0XHRcdGFjdGlvbjogJ2ZpbGUnLFxuXHRcdFx0fSkpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWN0aXZlRmlsZUNvbXBsZXRpb25zKCkge1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvckNoYW5nZSA9IG9ic2VydmFibGVTaWduYWxGcm9tRXZlbnQodGhpcywgdGhpcy5fZWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSk7XG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0YWN0aXZlRWRpdG9yQ2hhbmdlLnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiB0aGlzLl9jb2RlRWRpdG9yU2VydmljZS5nZXRBY3RpdmVDb2RlRWRpdG9yKCk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXNvdXJjZU9icyA9IGFjdGl2ZUVkaXRvclxuXHRcdFx0Lm1hcChlID0+IGUgPyBvYnNlcnZhYmxlU2lnbmFsRnJvbUV2ZW50KHRoaXMsIGUub25EaWRDaGFuZ2VNb2RlbCkubWFwKCgpID0+IGUuZ2V0TW9kZWwoKT8udXJpKSA6IHVuZGVmaW5lZClcblx0XHRcdC5tYXAoKG8sIHJlYWRlcikgPT4gbz8ucmVhZChyZWFkZXIpKTtcblx0XHRjb25zdCBzZWxlY3Rpb25PYnMgPSBhY3RpdmVFZGl0b3Jcblx0XHRcdC5tYXAoZSA9PiBlID8gb2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudCh0aGlzLCBlLm9uRGlkQ2hhbmdlQ3Vyc29yU2VsZWN0aW9uKS5tYXAoKCkgPT4gKHsgcmFuZ2U6IGUuZ2V0U2VsZWN0aW9uKCksIG1vZGVsOiBlLmdldE1vZGVsKCkgfSkpIDogdW5kZWZpbmVkKVxuXHRcdFx0Lm1hcCgobywgcmVhZGVyKSA9PiBvPy5yZWFkKHJlYWRlcikpO1xuXG5cdFx0cmV0dXJuIGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gcmVzb3VyY2VPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFyZXNvdXJjZSkge1xuXHRcdFx0XHRyZXR1cm4geyBidXN5OiBmYWxzZSwgcGlja3M6IFtdIH07XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGl0ZW1zOiBQaWNrSXRlbVtdID0gW107XG5cblx0XHRcdC8vIEFkZCBhY3RpdmUgZmlsZSBvcHRpb25cblx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRpZDogJ2FjdGl2ZS1maWxlJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtY3AuYXJnLmFjdGl2ZUZpbGUnLCAnQWN0aXZlIEZpbGUnKSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IHRoaXMuX2xhYmVsU2VydmljZS5nZXRVcmlMYWJlbChyZXNvdXJjZSksXG5cdFx0XHRcdGljb25DbGFzc2VzOiBnZXRJY29uQ2xhc3Nlcyh0aGlzLl9tb2RlbFNlcnZpY2UsIHRoaXMuX2xhbmd1YWdlU2VydmljZSwgcmVzb3VyY2UpLFxuXHRcdFx0XHR1cmk6IHJlc291cmNlLFxuXHRcdFx0XHRhY3Rpb246ICdmaWxlJyxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBzZWxlY3Rpb25PYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Ly8gQWRkIHNlbGVjdGVkIHRleHQgb3B0aW9uIGlmIHRoZXJlJ3MgYSBzZWxlY3Rpb25cblx0XHRcdGlmIChzZWxlY3Rpb24gJiYgc2VsZWN0aW9uLm1vZGVsICYmIHNlbGVjdGlvbi5yYW5nZSAmJiAhc2VsZWN0aW9uLnJhbmdlLmlzRW1wdHkoKSkge1xuXHRcdFx0XHRjb25zdCBzZWxlY3RlZFRleHQgPSBzZWxlY3Rpb24ubW9kZWwuZ2V0VmFsdWVJblJhbmdlKHNlbGVjdGlvbi5yYW5nZSk7XG5cdFx0XHRcdGNvbnN0IGxpbmVDb3VudCA9IHNlbGVjdGlvbi5yYW5nZS5lbmRMaW5lTnVtYmVyIC0gc2VsZWN0aW9uLnJhbmdlLnN0YXJ0TGluZU51bWJlciArIDE7XG5cdFx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gbGluZUNvdW50ID09PSAxXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnbWNwLmFyZy5zZWxlY3RlZFRleHQuc2luZ2xlTGluZScsICdsaW5lIHswfScsIHNlbGVjdGlvbi5yYW5nZS5zdGFydExpbmVOdW1iZXIpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnbWNwLmFyZy5zZWxlY3RlZFRleHQubXVsdGlMaW5lJywgJ3swfSBsaW5lcycsIGxpbmVDb3VudCk7XG5cblx0XHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdFx0aWQ6ICdzZWxlY3RlZC10ZXh0Jyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ21jcC5hcmcuc2VsZWN0ZWRUZXh0JywgJ1NlbGVjdGVkIFRleHQnKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbixcblx0XHRcdFx0XHRzZWxlY3RlZFRleHQsXG5cdFx0XHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5zZWxlY3Rpb24pLFxuXHRcdFx0XHRcdHVyaTogcmVzb3VyY2UsXG5cdFx0XHRcdFx0YWN0aW9uOiAnc2VsZWN0ZWRUZXh0Jyxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7IHBpY2tzOiBpdGVtcywgYnVzeTogZmFsc2UgfTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2FzeW5jQ29tcGxldGlvbnMoaW5wdXQ6IElPYnNlcnZhYmxlPHN0cmluZz4sIG1hcHBlcjogKGlucHV0OiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4gUHJvbWlzZTxQaWNrSXRlbVtdPik6IElPYnNlcnZhYmxlPHsgYnVzeTogYm9vbGVhbjsgcGlja3M6IFBpY2tJdGVtW10gfCB1bmRlZmluZWQgfT4ge1xuXHRcdGNvbnN0IHByb21pc2UgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBxdWVyeVZhbHVlID0gaW5wdXQucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0XHRyZWFkZXIuc3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjdHMuZGlzcG9zZSh0cnVlKSkpO1xuXHRcdFx0cmV0dXJuIG5ldyBPYnNlcnZhYmxlUHJvbWlzZShcblx0XHRcdFx0dGltZW91dChTVUdHRVNUX0RFQk9VTkNFLCBjdHMudG9rZW4pXG5cdFx0XHRcdFx0LnRoZW4oKCkgPT4gbWFwcGVyKHF1ZXJ5VmFsdWUsIGN0cy50b2tlbikpXG5cdFx0XHRcdFx0LmNhdGNoKCgpID0+IFtdKVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBwcm9taXNlLm1hcCgodmFsdWUsIHJlYWRlcikgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdmFsdWUucHJvbWlzZVJlc3VsdC5yZWFkKHJlYWRlcik7XG5cdFx0XHRyZXR1cm4geyBwaWNrczogcmVzdWx0Py5kYXRhIHx8IFtdLCBidXN5OiByZXN1bHQgPT09IHVuZGVmaW5lZCB9O1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0VGVybWluYWxPdXRwdXQoY29tbWFuZDogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdC8vIFRoZSB0ZXJtaW5hbCBvdXRsaXZlcyB0aGUgc3BlY2lmaWMgcGljayBhcmd1bWVudC4gVGhpcyBpcyBib3RoIGEgZmVhdHVyZSBhbmQgYSBidWcuXG5cdFx0Ly8gRmVhdHVyZTogd2UgY2FuIHJldXNlIHRoZSB0ZXJtaW5hbCBpZiB0aGUgdXNlciBwdXRzIGluIG11bHRpcGxlIGFyZ3Ncblx0XHQvLyBCdWcgd29ya2Fyb3VuZDogaWYgd2UgZGlzcG9zZSB0aGUgdGVybWluYWwgaGVyZSBhbmQgdGhhdCByZXN1bHRzIGluIHRoZSBwYW5lbFxuXHRcdC8vIGNsb3NpbmcsIHRoZW4gZm9jdXMgbW92ZXMgb3V0IG9mIHRoZSBxdWlja3BpY2sgYW5kIGludG8gdGhlIGFjdGl2ZSBlZGl0b3IgcGFuZSAoY2hhdCBpbnB1dClcblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9ibG9iLzZhMDE2ZjI1MDdjZDIwMGIxMmNhNmVlY2RhYjJmNTlkYTE1YWFjYjEvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JHcm91cFZpZXcudHMjTDEwODRcblx0XHRjb25zdCB0ZXJtaW5hbCA9ICh0aGlzLl90ZXJtaW5hbCA/Pz0gdGhpcy5fcmVnaXN0ZXIoYXdhaXQgdGhpcy5fdGVybWluYWxTZXJ2aWNlLmNyZWF0ZVRlcm1pbmFsKHtcblx0XHRcdGNvbmZpZzoge1xuXHRcdFx0XHRuYW1lOiBsb2NhbGl6ZSgnbWNwLnRlcm1pbmFsLm5hbWUnLCBcIk1DUCBUZXJtaW5hbFwiKSxcblx0XHRcdFx0aXNUcmFuc2llbnQ6IHRydWUsXG5cdFx0XHRcdGZvcmNlU2hlbGxJbnRlZ3JhdGlvbjogdHJ1ZSxcblx0XHRcdFx0aXNGZWF0dXJlVGVybWluYWw6IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0bG9jYXRpb246IFRlcm1pbmFsTG9jYXRpb24uUGFuZWwsXG5cdFx0fSkpKTtcblxuXHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5zZXRBY3RpdmVJbnN0YW5jZSh0ZXJtaW5hbCk7XG5cdFx0dGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2Uuc2hvd1BhbmVsKGZhbHNlKTtcblxuXHRcdGNvbnN0IHNoZWxsSW50ZWdyYXRpb24gPSB0ZXJtaW5hbC5jYXBhYmlsaXRpZXMuZ2V0KFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKTtcblx0XHRpZiAoc2hlbGxJbnRlZ3JhdGlvbikge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2dldFRlcm1pbmFsT3V0cHV0SW5uZXIodGVybWluYWwsIGNvbW1hbmQsIHNoZWxsSW50ZWdyYXRpb24sIHRva2VuKTtcblx0XHR9XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRyZXR1cm4gYXdhaXQgbmV3IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPihyZXNvbHZlID0+IHtcblx0XHRcdHN0b3JlLmFkZCh0ZXJtaW5hbC5jYXBhYmlsaXRpZXMub25EaWRBZGRDYXBhYmlsaXR5KGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5pZCA9PT0gVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pIHtcblx0XHRcdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmVzb2x2ZSh0aGlzLl9nZXRUZXJtaW5hbE91dHB1dElubmVyKHRlcm1pbmFsLCBjb21tYW5kLCBlLmNhcGFiaWxpdHksIHRva2VuKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdHN0b3JlLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB7XG5cdFx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0fSkpO1xuXHRcdFx0c3RvcmUuYWRkKGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXNvbHZlKHRoaXMuX2dldFRlcm1pbmFsT3V0cHV0SW5uZXIodGVybWluYWwsIGNvbW1hbmQsIHVuZGVmaW5lZCwgdG9rZW4pKTtcblx0XHRcdH0sIFNIRUxMX0lOVEVHUkFUSU9OX1RJTUVPVVQpKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldFRlcm1pbmFsT3V0cHV0SW5uZXIodGVybWluYWw6IElUZXJtaW5hbEluc3RhbmNlLCBjb21tYW5kOiBzdHJpbmcsIHNoZWxsSW50ZWdyYXRpb246IElDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSB8IHVuZGVmaW5lZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRsZXQgYWxsRGF0YTogc3RyaW5nID0gJyc7XG5cdFx0XHRzdG9yZS5hZGQodGVybWluYWwub25MaW5lRGF0YShkID0+IGFsbERhdGEgKz0gZCArICdcXG4nKSk7XG5cdFx0XHRpZiAoc2hlbGxJbnRlZ3JhdGlvbikge1xuXHRcdFx0XHRzdG9yZS5hZGQoc2hlbGxJbnRlZ3JhdGlvbi5vbkNvbW1hbmRGaW5pc2hlZChlID0+IHJlc29sdmUoZS5nZXRPdXRwdXQoKSB8fCBhbGxEYXRhKSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgZG9uZSA9IHN0b3JlLmFkZChuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiByZXNvbHZlKGFsbERhdGEpLCBOT19TSEVMTF9JTlRFR1JBVElPTl9JRExFKSk7XG5cdFx0XHRcdHN0b3JlLmFkZCh0ZXJtaW5hbC5vbkRhdGEoKCkgPT4gZG9uZS5zY2hlZHVsZSgpKSk7XG5cdFx0XHR9XG5cdFx0XHRzdG9yZS5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gcmVzb2x2ZSh1bmRlZmluZWQpKSk7XG5cdFx0XHRzdG9yZS5hZGQodGVybWluYWwub25EaXNwb3NlZCgoKSA9PiByZXNvbHZlKHVuZGVmaW5lZCkpKTtcblxuXHRcdFx0dGVybWluYWwucnVuQ29tbWFuZChjb21tYW5kLCB0cnVlKTtcblx0XHR9KS5maW5hbGx5KCgpID0+IHtcblx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLG1CQUFtQixrQkFBa0IsZUFBZTtBQUM3RCxTQUE0QiwrQkFBK0I7QUFDM0QsU0FBUyxlQUFlO0FBQ3hCLFNBQVMs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bUIsa0JBQWtCO0FBQ2pELGdCQUFNLFFBQVE7QUFDZCxrQkFBUSxLQUFLLHdCQUF3QixVQUFVLFNBQVMsRUFBRSxZQUFZLEtBQUssQ0FBQztBQUFBLFFBQzdFO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFDRixZQUFNLElBQUksTUFBTSx3QkFBd0IsTUFBTTtBQUM3QyxjQUFNLFFBQVE7QUFDZCxnQkFBUSxNQUFTO0FBQUEsTUFDbEIsQ0FBQyxDQUFDO0FBQ0YsWUFBTSxJQUFJLGtCQUFrQixNQUFNO0FBQ2pDLGNBQU0sUUFBUTtBQUNkLGdCQUFRLEtBQUssd0JBQXdCLFVBQVUsU0FBUyxRQUFXLEtBQUssQ0FBQztBQUFBLE1BQzFFLEdBQUcseUJBQXlCLENBQUM7QUFBQSxJQUM5QixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBYyx3QkFBd0IsVUFBNkIsU0FBaUIsa0JBQTJELE9BQTBCO0FBQ3hLLFVBQU0sUUFBUSxJQUFJLGdCQUFnQjtBQUNsQyxXQUFPLElBQUksUUFBNEIsYUFBVztBQUNqRCxVQUFJLFVBQWtCO0FBQ3RCLFlBQU0sSUFBSSxTQUFTLFdBQVcsT0FBSyxXQUFXLElBQUksSUFBSSxDQUFDO0FBQ3ZELFVBQUksa0JBQWtCO0FBQ3JCLGNBQU0sSUFBSSxpQkFBaUIsa0JBQWtCLE9BQUssUUFBUSxFQUFFLFVBQVUsS0FBSyxPQUFPLENBQUMsQ0FBQztBQUFBLE1BQ3JGLE9BQU87QUFDTixjQUFNLE9BQU8sTUFBTSxJQUFJLElBQUksaUJBQWlCLE1BQU0sUUFBUSxPQUFPLEdBQUcseUJBQXlCLENBQUM7QUFDOUYsY0FBTSxJQUFJLFNBQVMsT0FBTyxNQUFNLEtBQUssU0FBUyxDQUFDLENBQUM7QUFBQSxNQUNqRDtBQUNBLFlBQU0sSUFBSSxNQUFNLHdCQUF3QixNQUFNLFFBQVEsTUFBUyxDQUFDLENBQUM7QUFDakUsWUFBTSxJQUFJLFNBQVMsV0FBVyxNQUFNLFFBQVEsTUFBUyxDQUFDLENBQUM7QUFFdkQsZUFBUyxXQUFXLFNBQVMsSUFBSTtBQUFBLElBQ2xDLENBQUMsRUFBRSxRQUFRLE1BQU07QUFDaEIsWUFBTSxRQUFRO0FBQUEsSUFDZixDQUFDO0FBQUEsRUFDRjtBQUNEO0FBN1dhLHdCQUFOO0FBQUEsRUFNSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FqQlU7IiwKICAibmFtZXMiOiBbInZhbHVlIiwgImkiXQp9Cg==
