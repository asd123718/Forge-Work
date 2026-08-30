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
import { promiseWithResolvers } from "../../../../base/common/async.js";
import { KeyMod, KeyCode } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { localize, localize2 } from "../../../../nls.js";
import { Action2, IMenuService, MenuId, registerAction2, MenuRegistry, MenuItemAction } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IsSessionsWindowContext } from "../../../common/contextkeys.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as WorkbenchExtensions } from "../../../common/contributions.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
const builtInSource = localize("Built-In", "Built-In");
const category = localize2("Create", "Create");
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "welcome.showNewFileEntries",
      title: localize2("welcome.newFile", "New File..."),
      category,
      f1: true,
      precondition: IsSessionsWindowContext.negate(),
      keybinding: {
        primary: KeyMod.Alt + KeyMod.CtrlCmd + KeyMod.WinCtrl + KeyCode.KeyN,
        weight: KeybindingWeight.WorkbenchContrib
      },
      menu: {
        id: MenuId.MenubarFileMenu,
        group: "1_new",
        order: 2,
        when: IsSessionsWindowContext.negate()
      }
    });
  }
  async run(accessor) {
    return assertReturnsDefined(NewFileTemplatesManager.Instance).run();
  }
});
let NewFileTemplatesManager = class extends Disposable {
  constructor(quickInputService, contextKeyService, commandService, keybindingService, menuService) {
    super();
    this.quickInputService = quickInputService;
    this.contextKeyService = contextKeyService;
    this.commandService = commandService;
    this.keybindingService = keybindingService;
    NewFileTemplatesManager.Instance = this;
    this._register({ dispose() {
      if (NewFileTemplatesManager.Instance === this) {
        NewFileTemplatesManager.Instance = void 0;
      }
    } });
    this.menu = menuService.createMenu(MenuId.NewFile, contextKeyService);
  }
  allEntries() {
    const items = [];
    for (const [groupName, group] of this.menu.getActions({ renderShortTitle: true })) {
      for (const action of group) {
        if (action instanceof MenuItemAction) {
          items.push({ commandID: action.item.id, from: action.item.source?.title ?? builtInSource, title: action.label, group: groupName });
        }
      }
    }
    return items;
  }
  async run() {
    const entries = this.allEntries();
    if (entries.length === 0) {
      throw Error("Unexpected empty new items list");
    } else if (entries.length === 1) {
      this.commandService.executeCommand(entries[0].commandID);
      return true;
    } else {
      return this.selectNewEntry(entries);
    }
  }
  async selectNewEntry(entries) {
    const { promise: resultPromise, resolve: resolveResult } = promiseWithResolvers();
    const disposables = new DisposableStore();
    const qp = this.quickInputService.createQuickPick({ useSeparators: true });
    qp.title = localize("newFileTitle", "New File...");
    qp.placeholder = localize("newFilePlaceholder", "Select File Type or Enter File Name...");
    qp.sortByLabel = false;
    qp.matchOnDetail = true;
    qp.matchOnDescription = true;
    const sortCategories = (a, b) => {
      const categoryPriority = { "file": 1, "notebook": 2 };
      if (categoryPriority[a.group] && categoryPriority[b.group]) {
        if (categoryPriority[a.group] !== categoryPriority[b.group]) {
          return categoryPriority[b.group] - categoryPriority[a.group];
        }
      } else if (categoryPriority[a.group]) {
        return 1;
      } else if (categoryPriority[b.group]) {
        return -1;
      }
      if (a.from === builtInSource) {
        return 1;
      }
      if (b.from === builtInSource) {
        return -1;
      }
      return a.from.localeCompare(b.from);
    };
    const displayCategory = {
      "file": localize("file", "File"),
      "notebook": localize("notebook", "Notebook")
    };
    const refreshQp = (entries2) => {
      const items = [];
      let lastSeparator;
      entries2.sort((a, b) => -sortCategories(a, b)).forEach((entry) => {
        const command = entry.commandID;
        const keybinding = this.keybindingService.lookupKeybinding(command || "", this.contextKeyService);
        if (lastSeparator !== entry.group) {
          items.push({
            type: "separator",
            label: displayCategory[entry.group] ?? entry.group
          });
          lastSeparator = entry.group;
        }
        items.push({
          ...entry,
          label: entry.title,
          type: "item",
          keybinding,
          buttons: command ? [
            {
              iconClass: "codicon codicon-gear",
              tooltip: localize("change keybinding", "Configure Keybinding")
            }
          ] : [],
          detail: "",
          description: entry.from
        });
      });
      qp.items = items;
    };
    refreshQp(entries);
    disposables.add(this.menu.onDidChange(() => refreshQp(this.allEntries())));
    disposables.add(qp.onDidChangeValue((val) => {
      if (val === "") {
        refreshQp(entries);
        return;
      }
      const currentTextEntry = {
        commandID: "workbench.action.files.newFile",
        commandArgs: { languageId: void 0, viewType: void 0, fileName: val },
        title: localize("miNewFileWithName", "Create New File ({0})", val),
        group: "file",
        from: builtInSource
      };
      refreshQp([currentTextEntry, ...entries]);
    }));
    disposables.add(qp.onDidAccept(async (e) => {
      const selected = qp.selectedItems[0];
      resolveResult(!!selected);
      qp.hide();
      if (selected) {
        await this.commandService.executeCommand(selected.commandID, selected.commandArgs);
      }
    }));
    disposables.add(qp.onDidHide(() => {
      qp.dispose();
      disposables.dispose();
      resolveResult(false);
    }));
    disposables.add(qp.onDidTriggerItemButton((e) => {
      qp.hide();
      this.commandService.executeCommand("workbench.action.openGlobalKeybindings", e.item.commandID);
      resolveResult(false);
    }));
    qp.show();
    return resultPromise;
  }
};
NewFileTemplatesManager = __decorateClass([
  __decorateParam(0, IQuickInputService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, ICommandService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IMenuService)
], NewFileTemplatesManager);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(NewFileTemplatesManager, LifecyclePhase.Restored);
MenuRegistry.appendMenuItem(MenuId.NewFile, {
  group: "file",
  command: {
    id: "workbench.action.files.newUntitledFile",
    title: localize("miNewFile2", "Text File")
  },
  order: 1
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHdlbGNvbWVWaWV3c1xcY29tbW9uXFxuZXdGaWxlLmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHByb21pc2VXaXRoUmVzb2x2ZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgS2V5TW9kLCBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGFzc2VydFJldHVybnNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTG9jYWxpemVkU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb24uanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgSU1lbnVTZXJ2aWNlLCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiwgSU1lbnUsIE1lbnVSZWdpc3RyeSwgTWVudUl0ZW1BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSwgSVF1aWNrUGlja1NlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBXb3JrYmVuY2hFeHRlbnNpb25zLCBJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgTGlmZWN5Y2xlUGhhc2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5cbmNvbnN0IGJ1aWx0SW5Tb3VyY2UgPSBsb2NhbGl6ZSgnQnVpbHQtSW4nLCBcIkJ1aWx0LUluXCIpO1xuY29uc3QgY2F0ZWdvcnk6IElMb2NhbGl6ZWRTdHJpbmcgPSBsb2NhbGl6ZTIoJ0NyZWF0ZScsICdDcmVhdGUnKTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd2VsY29tZS5zaG93TmV3RmlsZUVudHJpZXMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignd2VsY29tZS5uZXdGaWxlJywgJ05ldyBGaWxlLi4uJyksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkFsdCArIEtleU1vZC5DdHJsQ21kICsgS2V5TW9kLldpbkN0cmwgKyBLZXlDb2RlLktleU4sXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5NZW51YmFyRmlsZU1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnMV9uZXcnLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0d2hlbjogSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKClcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiBhc3NlcnRSZXR1cm5zRGVmaW5lZChOZXdGaWxlVGVtcGxhdGVzTWFuYWdlci5JbnN0YW5jZSkucnVuKCk7XG5cdH1cbn0pO1xuXG50eXBlIE5ld0ZpbGVJdGVtID0geyBjb21tYW5kSUQ6IHN0cmluZzsgdGl0bGU6IHN0cmluZzsgZnJvbTogc3RyaW5nOyBncm91cDogc3RyaW5nOyBjb21tYW5kQXJncz86IHVua25vd24gfTtcbmNsYXNzIE5ld0ZpbGVUZW1wbGF0ZXNNYW5hZ2VyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHN0YXRpYyBJbnN0YW5jZTogTmV3RmlsZVRlbXBsYXRlc01hbmFnZXIgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBtZW51OiBJTWVudTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHROZXdGaWxlVGVtcGxhdGVzTWFuYWdlci5JbnN0YW5jZSA9IHRoaXM7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih7IGRpc3Bvc2UoKSB7IGlmIChOZXdGaWxlVGVtcGxhdGVzTWFuYWdlci5JbnN0YW5jZSA9PT0gdGhpcykgeyBOZXdGaWxlVGVtcGxhdGVzTWFuYWdlci5JbnN0YW5jZSA9IHVuZGVmaW5lZDsgfSB9IH0pO1xuXG5cdFx0dGhpcy5tZW51ID0gbWVudVNlcnZpY2UuY3JlYXRlTWVudShNZW51SWQuTmV3RmlsZSwgY29udGV4dEtleVNlcnZpY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBhbGxFbnRyaWVzKCk6IE5ld0ZpbGVJdGVtW10ge1xuXHRcdGNvbnN0IGl0ZW1zOiBOZXdGaWxlSXRlbVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBbZ3JvdXBOYW1lLCBncm91cF0gb2YgdGhpcy5tZW51LmdldEFjdGlvbnMoeyByZW5kZXJTaG9ydFRpdGxlOiB0cnVlIH0pKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBncm91cCkge1xuXHRcdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdFx0XHRpdGVtcy5wdXNoKHsgY29tbWFuZElEOiBhY3Rpb24uaXRlbS5pZCwgZnJvbTogYWN0aW9uLml0ZW0uc291cmNlPy50aXRsZSA/PyBidWlsdEluU291cmNlLCB0aXRsZTogYWN0aW9uLmxhYmVsLCBncm91cDogZ3JvdXBOYW1lIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBpdGVtcztcblx0fVxuXG5cdGFzeW5jIHJ1bigpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBlbnRyaWVzID0gdGhpcy5hbGxFbnRyaWVzKCk7XG5cdFx0aWYgKGVudHJpZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aHJvdyBFcnJvcignVW5leHBlY3RlZCBlbXB0eSBuZXcgaXRlbXMgbGlzdCcpO1xuXHRcdH1cblx0XHRlbHNlIGlmIChlbnRyaWVzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChlbnRyaWVzWzBdLmNvbW1hbmRJRCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zZWxlY3ROZXdFbnRyeShlbnRyaWVzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNlbGVjdE5ld0VudHJ5KGVudHJpZXM6IE5ld0ZpbGVJdGVtW10pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCB7IHByb21pc2U6IHJlc3VsdFByb21pc2UsIHJlc29sdmU6IHJlc29sdmVSZXN1bHQgfSA9IHByb21pc2VXaXRoUmVzb2x2ZXJzPGJvb2xlYW4+KCk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBxcCA9IHRoaXMucXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrKHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9KTtcblx0XHRxcC50aXRsZSA9IGxvY2FsaXplKCduZXdGaWxlVGl0bGUnLCBcIk5ldyBGaWxlLi4uXCIpO1xuXHRcdHFwLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ25ld0ZpbGVQbGFjZWhvbGRlcicsIFwiU2VsZWN0IEZpbGUgVHlwZSBvciBFbnRlciBGaWxlIE5hbWUuLi5cIik7XG5cdFx0cXAuc29ydEJ5TGFiZWwgPSBmYWxzZTtcblx0XHRxcC5tYXRjaE9uRGV0YWlsID0gdHJ1ZTtcblx0XHRxcC5tYXRjaE9uRGVzY3JpcHRpb24gPSB0cnVlO1xuXG5cdFx0Y29uc3Qgc29ydENhdGVnb3JpZXMgPSAoYTogTmV3RmlsZUl0ZW0sIGI6IE5ld0ZpbGVJdGVtKTogbnVtYmVyID0+IHtcblx0XHRcdGNvbnN0IGNhdGVnb3J5UHJpb3JpdHk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7ICdmaWxlJzogMSwgJ25vdGVib29rJzogMiB9O1xuXHRcdFx0aWYgKGNhdGVnb3J5UHJpb3JpdHlbYS5ncm91cF0gJiYgY2F0ZWdvcnlQcmlvcml0eVtiLmdyb3VwXSkge1xuXHRcdFx0XHRpZiAoY2F0ZWdvcnlQcmlvcml0eVthLmdyb3VwXSAhPT0gY2F0ZWdvcnlQcmlvcml0eVtiLmdyb3VwXSkge1xuXHRcdFx0XHRcdHJldHVybiBjYXRlZ29yeVByaW9yaXR5W2IuZ3JvdXBdIC0gY2F0ZWdvcnlQcmlvcml0eVthLmdyb3VwXTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0ZWxzZSBpZiAoY2F0ZWdvcnlQcmlvcml0eVthLmdyb3VwXSkgeyByZXR1cm4gMTsgfVxuXHRcdFx0ZWxzZSBpZiAoY2F0ZWdvcnlQcmlvcml0eVtiLmdyb3VwXSkgeyByZXR1cm4gLTE7IH1cblxuXHRcdFx0aWYgKGEuZnJvbSA9PT0gYnVpbHRJblNvdXJjZSkgeyByZXR1cm4gMTsgfVxuXHRcdFx0aWYgKGIuZnJvbSA9PT0gYnVpbHRJblNvdXJjZSkgeyByZXR1cm4gLTE7IH1cblxuXHRcdFx0cmV0dXJuIGEuZnJvbS5sb2NhbGVDb21wYXJlKGIuZnJvbSk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGRpc3BsYXlDYXRlZ29yeTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcblx0XHRcdCdmaWxlJzogbG9jYWxpemUoJ2ZpbGUnLCBcIkZpbGVcIiksXG5cdFx0XHQnbm90ZWJvb2snOiBsb2NhbGl6ZSgnbm90ZWJvb2snLCBcIk5vdGVib29rXCIpLFxuXHRcdH07XG5cblx0XHRjb25zdCByZWZyZXNoUXAgPSAoZW50cmllczogTmV3RmlsZUl0ZW1bXSkgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbXM6ICgoKElRdWlja1BpY2tJdGVtICYgTmV3RmlsZUl0ZW0pIHwgSVF1aWNrUGlja1NlcGFyYXRvcikpW10gPSBbXTtcblx0XHRcdGxldCBsYXN0U2VwYXJhdG9yOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRlbnRyaWVzXG5cdFx0XHRcdC5zb3J0KChhLCBiKSA9PiAtc29ydENhdGVnb3JpZXMoYSwgYikpXG5cdFx0XHRcdC5mb3JFYWNoKChlbnRyeSkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGNvbW1hbmQgPSBlbnRyeS5jb21tYW5kSUQ7XG5cdFx0XHRcdFx0Y29uc3Qga2V5YmluZGluZyA9IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhjb21tYW5kIHx8ICcnLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdFx0XHRpZiAobGFzdFNlcGFyYXRvciAhPT0gZW50cnkuZ3JvdXApIHtcblx0XHRcdFx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc2VwYXJhdG9yJyxcblx0XHRcdFx0XHRcdFx0bGFiZWw6IGRpc3BsYXlDYXRlZ29yeVtlbnRyeS5ncm91cF0gPz8gZW50cnkuZ3JvdXBcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0bGFzdFNlcGFyYXRvciA9IGVudHJ5Lmdyb3VwO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0XHRcdC4uLmVudHJ5LFxuXHRcdFx0XHRcdFx0bGFiZWw6IGVudHJ5LnRpdGxlLFxuXHRcdFx0XHRcdFx0dHlwZTogJ2l0ZW0nLFxuXHRcdFx0XHRcdFx0a2V5YmluZGluZyxcblx0XHRcdFx0XHRcdGJ1dHRvbnM6IGNvbW1hbmQgPyBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRpY29uQ2xhc3M6ICdjb2RpY29uIGNvZGljb24tZ2VhcicsXG5cdFx0XHRcdFx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ2NoYW5nZSBrZXliaW5kaW5nJywgXCJDb25maWd1cmUgS2V5YmluZGluZ1wiKVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRdIDogW10sXG5cdFx0XHRcdFx0XHRkZXRhaWw6ICcnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGVudHJ5LmZyb20sXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0cXAuaXRlbXMgPSBpdGVtcztcblx0XHR9O1xuXHRcdHJlZnJlc2hRcChlbnRyaWVzKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLm1lbnUub25EaWRDaGFuZ2UoKCkgPT4gcmVmcmVzaFFwKHRoaXMuYWxsRW50cmllcygpKSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHFwLm9uRGlkQ2hhbmdlVmFsdWUoKHZhbDogc3RyaW5nKSA9PiB7XG5cdFx0XHRpZiAodmFsID09PSAnJykge1xuXHRcdFx0XHRyZWZyZXNoUXAoZW50cmllcyk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGN1cnJlbnRUZXh0RW50cnk6IE5ld0ZpbGVJdGVtID0ge1xuXHRcdFx0XHRjb21tYW5kSUQ6ICd3b3JrYmVuY2guYWN0aW9uLmZpbGVzLm5ld0ZpbGUnLFxuXHRcdFx0XHRjb21tYW5kQXJnczogeyBsYW5ndWFnZUlkOiB1bmRlZmluZWQsIHZpZXdUeXBlOiB1bmRlZmluZWQsIGZpbGVOYW1lOiB2YWwgfSxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdtaU5ld0ZpbGVXaXRoTmFtZScsIFwiQ3JlYXRlIE5ldyBGaWxlICh7MH0pXCIsIHZhbCksXG5cdFx0XHRcdGdyb3VwOiAnZmlsZScsXG5cdFx0XHRcdGZyb206IGJ1aWx0SW5Tb3VyY2UsXG5cdFx0XHR9O1xuXHRcdFx0cmVmcmVzaFFwKFtjdXJyZW50VGV4dEVudHJ5LCAuLi5lbnRyaWVzXSk7XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHFwLm9uRGlkQWNjZXB0KGFzeW5jIGUgPT4ge1xuXHRcdFx0Y29uc3Qgc2VsZWN0ZWQgPSBxcC5zZWxlY3RlZEl0ZW1zWzBdIGFzIChJUXVpY2tQaWNrSXRlbSAmIE5ld0ZpbGVJdGVtKTtcblx0XHRcdHJlc29sdmVSZXN1bHQoISFzZWxlY3RlZCk7XG5cblx0XHRcdHFwLmhpZGUoKTtcblx0XHRcdGlmIChzZWxlY3RlZCkgeyBhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKHNlbGVjdGVkLmNvbW1hbmRJRCwgc2VsZWN0ZWQuY29tbWFuZEFyZ3MpOyB9XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHFwLm9uRGlkSGlkZSgoKSA9PiB7XG5cdFx0XHRxcC5kaXNwb3NlKCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRyZXNvbHZlUmVzdWx0KGZhbHNlKTtcblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocXAub25EaWRUcmlnZ2VySXRlbUJ1dHRvbihlID0+IHtcblx0XHRcdHFwLmhpZGUoKTtcblx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24ub3Blbkdsb2JhbEtleWJpbmRpbmdzJywgKGUuaXRlbSBhcyAoSVF1aWNrUGlja0l0ZW0gJiBOZXdGaWxlSXRlbSkpLmNvbW1hbmRJRCk7XG5cdFx0XHRyZXNvbHZlUmVzdWx0KGZhbHNlKTtcblx0XHR9KSk7XG5cblx0XHRxcC5zaG93KCk7XG5cblx0XHRyZXR1cm4gcmVzdWx0UHJvbWlzZTtcblx0fVxufVxuXG5SZWdpc3RyeS5hczxJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLldvcmtiZW5jaClcblx0LnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKE5ld0ZpbGVUZW1wbGF0ZXNNYW5hZ2VyLCBMaWZlY3ljbGVQaGFzZS5SZXN0b3JlZCk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTmV3RmlsZSwge1xuXHRncm91cDogJ2ZpbGUnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmZpbGVzLm5ld1VudGl0bGVkRmlsZScsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdtaU5ld0ZpbGUyJywgXCJUZXh0IEZpbGVcIilcblx0fSxcblx0b3JkZXI6IDFcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLFFBQVEsZUFBZTtBQUNoQyxTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsVUFBVSxpQkFBaUI7QUFFcEMsU0FBUyxTQUFTLGNBQWMsUUFBUSxpQkFBd0IsY0FBYyxzQkFBc0I7QUFDcEcsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywrQkFBK0I7QUFFeEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUywwQkFBK0Q7QUFDeEUsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxjQUFjLDJCQUE0RDtBQUNuRixTQUFTLHNCQUFzQjtBQUUvQixNQUFNLGdCQUFnQixTQUFTLFlBQVksVUFBVTtBQUNyRCxNQUFNLFdBQTZCLFVBQVUsVUFBVSxRQUFRO0FBRS9ELGdCQUFnQixjQUFjLFFBQVE7QUFBQSxFQUNyQyxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxVQUFVLG1CQUFtQixhQUFhO0FBQUEsTUFDakQ7QUFBQSxNQUNBLElBQUk7QUFBQSxNQUNKLGNBQWMsd0JBQXdCLE9BQU87QUFBQSxNQUM3QyxZQUFZO0FBQUEsUUFDWCxTQUFTLE9BQU8sTUFBTSxPQUFPLFVBQVUsT0FBTyxVQUFVLFFBQVE7QUFBQSxRQUNoRSxRQUFRLGlCQUFpQjtBQUFBLE1BQzFCO0FBQUEsTUFDQSxNQUFNO0FBQUEsUUFDTCxJQUFJLE9BQU87QUFBQSxRQUNYLE9BQU87QUFBQSxRQUNQLE9BQU87QUFBQSxRQUNQLE1BQU0sd0JBQXdCLE9BQU87QUFBQSxNQUN0QztBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sSUFBSSxVQUE4QztBQUN2RCxXQUFPLHFCQUFxQix3QkFBd0IsUUFBUSxFQUFFLElBQUk7QUFBQSxFQUNuRTtBQUNELENBQUM7QUFHRCxJQUFNLDBCQUFOLGNBQXNDLFdBQVc7QUFBQSxFQUtoRCxZQUNzQyxtQkFDQSxtQkFDSCxnQkFDRyxtQkFDdkIsYUFDYjtBQUNELFVBQU07QUFOK0I7QUFDQTtBQUNIO0FBQ0c7QUFLckMsNEJBQXdCLFdBQVc7QUFFbkMsU0FBSyxVQUFVLEVBQUUsVUFBVTtBQUFFLFVBQUksd0JBQXdCLGFBQWEsTUFBTTtBQUFFLGdDQUF3QixXQUFXO0FBQUEsTUFBVztBQUFBLElBQUUsRUFBRSxDQUFDO0FBRWpJLFNBQUssT0FBTyxZQUFZLFdBQVcsT0FBTyxTQUFTLGlCQUFpQjtBQUFBLEVBQ3JFO0FBQUEsRUFFUSxhQUE0QjtBQUNuQyxVQUFNLFFBQXVCLENBQUM7QUFDOUIsZUFBVyxDQUFDLFdBQVcsS0FBSyxLQUFLLEtBQUssS0FBSyxXQUFXLEVBQUUsa0JBQWtCLEtBQUssQ0FBQyxHQUFHO0FBQ2xGLGlCQUFXLFVBQVUsT0FBTztBQUMzQixZQUFJLGtCQUFrQixnQkFBZ0I7QUFDckMsZ0JBQU0sS0FBSyxFQUFFLFdBQVcsT0FBTyxLQUFLLElBQUksTUFBTSxPQUFPLEtBQUssUUFBUSxTQUFTLGVBQWUsT0FBTyxPQUFPLE9BQU8sT0FBTyxVQUFVLENBQUM7QUFBQSxRQUNsSTtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQU0sTUFBd0I7QUFDN0IsVUFBTSxVQUFVLEtBQUssV0FBVztBQUNoQyxRQUFJLFFBQVEsV0FBVyxHQUFHO0FBQ3pCLFlBQU0sTUFBTSxpQ0FBaUM7QUFBQSxJQUM5QyxXQUNTLFFBQVEsV0FBVyxHQUFHO0FBQzlCLFdBQUssZUFBZSxlQUFlLFFBQVEsQ0FBQyxFQUFFLFNBQVM7QUFDdkQsYUFBTztBQUFBLElBQ1IsT0FDSztBQUNKLGFBQU8sS0FBSyxlQUFlLE9BQU87QUFBQSxJQUNuQztBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsZUFBZSxTQUEwQztBQUN0RSxVQUFNLEVBQUUsU0FBUyxlQUFlLFNBQVMsY0FBYyxJQUFJLHFCQUE4QjtBQUV6RixVQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFDeEMsVUFBTSxLQUFLLEtBQUssa0JBQWtCLGdCQUFnQixFQUFFLGVBQWUsS0FBSyxDQUFDO0FBQ3pFLE9BQUcsUUFBUSxTQUFTLGdCQUFnQixhQUFhO0FBQ2pELE9BQUcsY0FBYyxTQUFTLHNCQUFzQix3Q0FBd0M7QUFDeEYsT0FBRyxjQUFjO0FBQ2pCLE9BQUcsZ0JBQWdCO0FBQ25CLE9BQUcscUJBQXFCO0FBRXhCLFVBQU0saUJBQWlCLENBQUMsR0FBZ0IsTUFBMkI7QUFDbEUsWUFBTSxtQkFBMkMsRUFBRSxRQUFRLEdBQUcsWUFBWSxFQUFFO0FBQzVFLFVBQUksaUJBQWlCLEVBQUUsS0FBSyxLQUFLLGlCQUFpQixFQUFFLEtBQUssR0FBRztBQUMzRCxZQUFJLGlCQUFpQixFQUFFLEtBQUssTUFBTSxpQkFBaUIsRUFBRSxLQUFLLEdBQUc7QUFDNUQsaUJBQU8saUJBQWlCLEVBQUUsS0FBSyxJQUFJLGlCQUFpQixFQUFFLEtBQUs7QUFBQSxRQUM1RDtBQUFBLE1BQ0QsV0FDUyxpQkFBaUIsRUFBRSxLQUFLLEdBQUc7QUFBRSxlQUFPO0FBQUEsTUFBRyxXQUN2QyxpQkFBaUIsRUFBRSxLQUFLLEdBQUc7QUFBRSxlQUFPO0FBQUEsTUFBSTtBQUVqRCxVQUFJLEVBQUUsU0FBUyxlQUFlO0FBQUUsZUFBTztBQUFBLE1BQUc7QUFDMUMsVUFBSSxFQUFFLFNBQVMsZUFBZTtBQUFFLGVBQU87QUFBQSxNQUFJO0FBRTNDLGFBQU8sRUFBRSxLQUFLLGNBQWMsRUFBRSxJQUFJO0FBQUEsSUFDbkM7QUFFQSxVQUFNLGtCQUEwQztBQUFBLE1BQy9DLFFBQVEsU0FBUyxRQUFRLE1BQU07QUFBQSxNQUMvQixZQUFZLFNBQVMsWUFBWSxVQUFVO0FBQUEsSUFDNUM7QUFFQSxVQUFNLFlBQVksQ0FBQ0EsYUFBMkI7QUFDN0MsWUFBTSxRQUFvRSxDQUFDO0FBQzNFLFVBQUk7QUFDSixNQUFBQSxTQUNFLEtBQUssQ0FBQyxHQUFHLE1BQU0sQ0FBQyxlQUFlLEdBQUcsQ0FBQyxDQUFDLEVBQ3BDLFFBQVEsQ0FBQyxVQUFVO0FBQ25CLGNBQU0sVUFBVSxNQUFNO0FBQ3RCLGNBQU0sYUFBYSxLQUFLLGtCQUFrQixpQkFBaUIsV0FBVyxJQUFJLEtBQUssaUJBQWlCO0FBQ2hHLFlBQUksa0JBQWtCLE1BQU0sT0FBTztBQUNsQyxnQkFBTSxLQUFLO0FBQUEsWUFDVixNQUFNO0FBQUEsWUFDTixPQUFPLGdCQUFnQixNQUFNLEtBQUssS0FBSyxNQUFNO0FBQUEsVUFDOUMsQ0FBQztBQUNELDBCQUFnQixNQUFNO0FBQUEsUUFDdkI7QUFDQSxjQUFNLEtBQUs7QUFBQSxVQUNWLEdBQUc7QUFBQSxVQUNILE9BQU8sTUFBTTtBQUFBLFVBQ2IsTUFBTTtBQUFBLFVBQ047QUFBQSxVQUNBLFNBQVMsVUFBVTtBQUFBLFlBQ2xCO0FBQUEsY0FDQyxXQUFXO0FBQUEsY0FDWCxTQUFTLFNBQVMscUJBQXFCLHNCQUFzQjtBQUFBLFlBQzlEO0FBQUEsVUFDRCxJQUFJLENBQUM7QUFBQSxVQUNMLFFBQVE7QUFBQSxVQUNSLGFBQWEsTUFBTTtBQUFBLFFBQ3BCLENBQUM7QUFBQSxNQUNGLENBQUM7QUFDRixTQUFHLFFBQVE7QUFBQSxJQUNaO0FBQ0EsY0FBVSxPQUFPO0FBRWpCLGdCQUFZLElBQUksS0FBSyxLQUFLLFlBQVksTUFBTSxVQUFVLEtBQUssV0FBVyxDQUFDLENBQUMsQ0FBQztBQUV6RSxnQkFBWSxJQUFJLEdBQUcsaUJBQWlCLENBQUMsUUFBZ0I7QUFDcEQsVUFBSSxRQUFRLElBQUk7QUFDZixrQkFBVSxPQUFPO0FBQ2pCO0FBQUEsTUFDRDtBQUNBLFlBQU0sbUJBQWdDO0FBQUEsUUFDckMsV0FBVztBQUFBLFFBQ1gsYUFBYSxFQUFFLFlBQVksUUFBVyxVQUFVLFFBQVcsVUFBVSxJQUFJO0FBQUEsUUFDekUsT0FBTyxTQUFTLHFCQUFxQix5QkFBeUIsR0FBRztBQUFBLFFBQ2pFLE9BQU87QUFBQSxRQUNQLE1BQU07QUFBQSxNQUNQO0FBQ0EsZ0JBQVUsQ0FBQyxrQkFBa0IsR0FBRyxPQUFPLENBQUM7QUFBQSxJQUN6QyxDQUFDLENBQUM7QUFFRixnQkFBWSxJQUFJLEdBQUcsWUFBWSxPQUFNLE1BQUs7QUFDekMsWUFBTSxXQUFXLEdBQUcsY0FBYyxDQUFDO0FBQ25DLG9CQUFjLENBQUMsQ0FBQyxRQUFRO0FBRXhCLFNBQUcsS0FBSztBQUNSLFVBQUksVUFBVTtBQUFFLGNBQU0sS0FBSyxlQUFlLGVBQWUsU0FBUyxXQUFXLFNBQVMsV0FBVztBQUFBLE1BQUc7QUFBQSxJQUNyRyxDQUFDLENBQUM7QUFFRixnQkFBWSxJQUFJLEdBQUcsVUFBVSxNQUFNO0FBQ2xDLFNBQUcsUUFBUTtBQUNYLGtCQUFZLFFBQVE7QUFDcEIsb0JBQWMsS0FBSztBQUFBLElBQ3BCLENBQUMsQ0FBQztBQUVGLGdCQUFZLElBQUksR0FBRyx1QkFBdUIsT0FBSztBQUM5QyxTQUFHLEtBQUs7QUFDUixXQUFLLGVBQWUsZUFBZSwwQ0FBMkMsRUFBRSxLQUF3QyxTQUFTO0FBQ2pJLG9CQUFjLEtBQUs7QUFBQSxJQUNwQixDQUFDLENBQUM7QUFFRixPQUFHLEtBQUs7QUFFUixXQUFPO0FBQUEsRUFDUjtBQUNEO0FBMUpNLDBCQUFOO0FBQUEsRUFNRztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVZHO0FBNEpOLFNBQVMsR0FBb0Msb0JBQW9CLFNBQVMsRUFDeEUsOEJBQThCLHlCQUF5QixlQUFlLFFBQVE7QUFFaEYsYUFBYSxlQUFlLE9BQU8sU0FBUztBQUFBLEVBQzNDLE9BQU87QUFBQSxFQUNQLFNBQVM7QUFBQSxJQUNSLElBQUk7QUFBQSxJQUNKLE9BQU8sU0FBUyxjQUFjLFdBQVc7QUFBQSxFQUMxQztBQUFBLEVBQ0EsT0FBTztBQUNSLENBQUM7IiwKICAibmFtZXMiOiBbImVudHJpZXMiXQp9Cg==
