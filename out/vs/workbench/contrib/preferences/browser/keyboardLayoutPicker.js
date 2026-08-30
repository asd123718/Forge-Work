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
import * as nls from "../../../../nls.js";
import { StatusbarAlignment, IStatusbarService } from "../../../services/statusbar/browser/statusbar.js";
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { parseKeyboardLayoutDescription, areKeyboardLayoutsEqual, getKeyboardLayoutId, IKeyboardLayoutService } from "../../../../platform/keyboardLayout/common/keyboardLayout.js";
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../../common/contributions.js";
import { KEYBOARD_LAYOUT_OPEN_PICKER } from "../common/preferences.js";
import { isMacintosh, isWindows } from "../../../../base/common/platform.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
let KeyboardLayoutPickerContribution = class extends Disposable {
  constructor(keyboardLayoutService, statusbarService) {
    super();
    this.keyboardLayoutService = keyboardLayoutService;
    this.statusbarService = statusbarService;
    this.pickerElement = this._register(new MutableDisposable());
    const name = nls.localize("status.workbench.keyboardLayout", "Keyboard Layout");
    const layout = this.keyboardLayoutService.getCurrentKeyboardLayout();
    if (layout) {
      const layoutInfo = parseKeyboardLayoutDescription(layout);
      const text = nls.localize("keyboardLayout", "Layout: {0}", layoutInfo.label);
      this.pickerElement.value = this.statusbarService.addEntry(
        {
          name,
          text,
          ariaLabel: text,
          command: KEYBOARD_LAYOUT_OPEN_PICKER
        },
        "status.workbench.keyboardLayout",
        StatusbarAlignment.RIGHT
      );
    }
    this._register(this.keyboardLayoutService.onDidChangeKeyboardLayout(() => {
      const layout2 = this.keyboardLayoutService.getCurrentKeyboardLayout();
      const layoutInfo = parseKeyboardLayoutDescription(layout2);
      if (this.pickerElement.value) {
        const text = nls.localize("keyboardLayout", "Layout: {0}", layoutInfo.label);
        this.pickerElement.value.update({
          name,
          text,
          ariaLabel: text,
          command: KEYBOARD_LAYOUT_OPEN_PICKER
        });
      } else {
        const text = nls.localize("keyboardLayout", "Layout: {0}", layoutInfo.label);
        this.pickerElement.value = this.statusbarService.addEntry(
          {
            name,
            text,
            ariaLabel: text,
            command: KEYBOARD_LAYOUT_OPEN_PICKER
          },
          "status.workbench.keyboardLayout",
          StatusbarAlignment.RIGHT
        );
      }
    }));
  }
};
KeyboardLayoutPickerContribution.ID = "workbench.contrib.keyboardLayoutPicker";
KeyboardLayoutPickerContribution = __decorateClass([
  __decorateParam(0, IKeyboardLayoutService),
  __decorateParam(1, IStatusbarService)
], KeyboardLayoutPickerContribution);
registerWorkbenchContribution2(KeyboardLayoutPickerContribution.ID, KeyboardLayoutPickerContribution, WorkbenchPhase.BlockStartup);
const DEFAULT_CONTENT = [
  `// ${nls.localize("displayLanguage", "Defines the keyboard layout used in VS Code in the browser environment.")}`,
  `// ${nls.localize("doc", 'Open VS Code and run "Developer: Inspect Key Mappings (JSON)" from Command Palette.')}`,
  ``,
  `// Once you have the keyboard layout info, please paste it below.`,
  "\n"
].join("\n");
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: KEYBOARD_LAYOUT_OPEN_PICKER,
      title: nls.localize2("keyboard.chooseLayout", "Change Keyboard Layout"),
      f1: true
    });
  }
  async run(accessor) {
    const keyboardLayoutService = accessor.get(IKeyboardLayoutService);
    const quickInputService = accessor.get(IQuickInputService);
    const configurationService = accessor.get(IConfigurationService);
    const environmentService = accessor.get(IEnvironmentService);
    const editorService = accessor.get(IEditorService);
    const fileService = accessor.get(IFileService);
    const layouts = keyboardLayoutService.getAllKeyboardLayouts();
    const currentLayout = keyboardLayoutService.getCurrentKeyboardLayout();
    const layoutConfig = configurationService.getValue("keyboard.layout");
    const isAutoDetect = layoutConfig === "autodetect";
    const picks = layouts.map((layout) => {
      const picked = !isAutoDetect && areKeyboardLayoutsEqual(currentLayout, layout);
      const layoutInfo = parseKeyboardLayoutDescription(layout);
      return {
        layout,
        label: [layoutInfo.label, layout && layout.isUserKeyboardLayout ? "(User configured layout)" : ""].join(" "),
        id: layout.text || layout.lang || layout.layout,
        description: layoutInfo.description + (picked ? " (Current layout)" : ""),
        picked: !isAutoDetect && areKeyboardLayoutsEqual(currentLayout, layout)
      };
    }).sort((a, b) => {
      return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
    });
    if (picks.length > 0) {
      const platform = isMacintosh ? "Mac" : isWindows ? "Win" : "Linux";
      picks.unshift({ type: "separator", label: nls.localize("layoutPicks", "Keyboard Layouts ({0})", platform) });
    }
    const configureKeyboardLayout = { label: nls.localize("configureKeyboardLayout", "Configure Keyboard Layout") };
    picks.unshift(configureKeyboardLayout);
    const autoDetectMode = {
      label: nls.localize("autoDetect", "Auto Detect"),
      description: isAutoDetect ? `Current: ${parseKeyboardLayoutDescription(currentLayout).label}` : void 0,
      picked: isAutoDetect ? true : void 0
    };
    picks.unshift(autoDetectMode);
    const pick = await quickInputService.pick(picks, { placeHolder: nls.localize("pickKeyboardLayout", "Select Keyboard Layout"), matchOnDescription: true });
    if (!pick) {
      return;
    }
    if (pick === autoDetectMode) {
      configurationService.updateValue("keyboard.layout", "autodetect");
      return;
    }
    if (pick === configureKeyboardLayout) {
      const file = environmentService.keyboardLayoutResource;
      await fileService.stat(file).then(void 0, () => {
        return fileService.createFile(file, VSBuffer.fromString(DEFAULT_CONTENT));
      }).then((stat) => {
        if (!stat) {
          return void 0;
        }
        return editorService.openEditor({
          resource: stat.resource,
          languageId: "jsonc",
          options: { pinned: true }
        });
      }, (error) => {
        throw new Error(nls.localize("fail.createSettings", "Unable to create '{0}' ({1}).", file.toString(), error));
      });
      return Promise.resolve();
    }
    configurationService.updateValue("keyboard.layout", getKeyboardLayoutId(pick.layout));
  }
});
export {
  KeyboardLayoutPickerContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHByZWZlcmVuY2VzXFxicm93c2VyXFxrZXlib2FyZExheW91dFBpY2tlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgU3RhdHVzYmFyQWxpZ25tZW50LCBJU3RhdHVzYmFyU2VydmljZSwgSVN0YXR1c2JhckVudHJ5QWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zdGF0dXNiYXIvYnJvd3Nlci9zdGF0dXNiYXIuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgcGFyc2VLZXlib2FyZExheW91dERlc2NyaXB0aW9uLCBhcmVLZXlib2FyZExheW91dHNFcXVhbCwgZ2V0S2V5Ym9hcmRMYXlvdXRJZCwgSUtleWJvYXJkTGF5b3V0U2VydmljZSwgSUtleWJvYXJkTGF5b3V0SW5mbyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJvYXJkTGF5b3V0L2NvbW1vbi9rZXlib2FyZExheW91dC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZSwgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgS0VZQk9BUkRfTEFZT1VUX09QRU5fUElDS0VSIH0gZnJvbSAnLi4vY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcbmltcG9ydCB7IGlzTWFjaW50b3NoLCBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBRdWlja1BpY2tJbnB1dCwgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IElFZGl0b3JQYW5lIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5cbmV4cG9ydCBjbGFzcyBLZXlib2FyZExheW91dFBpY2tlckNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIua2V5Ym9hcmRMYXlvdXRQaWNrZXInO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcGlja2VyRWxlbWVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJU3RhdHVzYmFyRW50cnlBY2Nlc3Nvcj4oKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElLZXlib2FyZExheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXlib2FyZExheW91dFNlcnZpY2U6IElLZXlib2FyZExheW91dFNlcnZpY2UsXG5cdFx0QElTdGF0dXNiYXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RhdHVzYmFyU2VydmljZTogSVN0YXR1c2JhclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBuYW1lID0gbmxzLmxvY2FsaXplKCdzdGF0dXMud29ya2JlbmNoLmtleWJvYXJkTGF5b3V0JywgXCJLZXlib2FyZCBMYXlvdXRcIik7XG5cblx0XHRjb25zdCBsYXlvdXQgPSB0aGlzLmtleWJvYXJkTGF5b3V0U2VydmljZS5nZXRDdXJyZW50S2V5Ym9hcmRMYXlvdXQoKTtcblx0XHRpZiAobGF5b3V0KSB7XG5cdFx0XHRjb25zdCBsYXlvdXRJbmZvID0gcGFyc2VLZXlib2FyZExheW91dERlc2NyaXB0aW9uKGxheW91dCk7XG5cdFx0XHRjb25zdCB0ZXh0ID0gbmxzLmxvY2FsaXplKCdrZXlib2FyZExheW91dCcsIFwiTGF5b3V0OiB7MH1cIiwgbGF5b3V0SW5mby5sYWJlbCk7XG5cblx0XHRcdHRoaXMucGlja2VyRWxlbWVudC52YWx1ZSA9IHRoaXMuc3RhdHVzYmFyU2VydmljZS5hZGRFbnRyeShcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG5hbWUsXG5cdFx0XHRcdFx0dGV4dCxcblx0XHRcdFx0XHRhcmlhTGFiZWw6IHRleHQsXG5cdFx0XHRcdFx0Y29tbWFuZDogS0VZQk9BUkRfTEFZT1VUX09QRU5fUElDS0VSXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdzdGF0dXMud29ya2JlbmNoLmtleWJvYXJkTGF5b3V0Jyxcblx0XHRcdFx0U3RhdHVzYmFyQWxpZ25tZW50LlJJR0hUXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMua2V5Ym9hcmRMYXlvdXRTZXJ2aWNlLm9uRGlkQ2hhbmdlS2V5Ym9hcmRMYXlvdXQoKCkgPT4ge1xuXHRcdFx0Y29uc3QgbGF5b3V0ID0gdGhpcy5rZXlib2FyZExheW91dFNlcnZpY2UuZ2V0Q3VycmVudEtleWJvYXJkTGF5b3V0KCk7XG5cdFx0XHRjb25zdCBsYXlvdXRJbmZvID0gcGFyc2VLZXlib2FyZExheW91dERlc2NyaXB0aW9uKGxheW91dCk7XG5cblx0XHRcdGlmICh0aGlzLnBpY2tlckVsZW1lbnQudmFsdWUpIHtcblx0XHRcdFx0Y29uc3QgdGV4dCA9IG5scy5sb2NhbGl6ZSgna2V5Ym9hcmRMYXlvdXQnLCBcIkxheW91dDogezB9XCIsIGxheW91dEluZm8ubGFiZWwpO1xuXHRcdFx0XHR0aGlzLnBpY2tlckVsZW1lbnQudmFsdWUudXBkYXRlKHtcblx0XHRcdFx0XHRuYW1lLFxuXHRcdFx0XHRcdHRleHQsXG5cdFx0XHRcdFx0YXJpYUxhYmVsOiB0ZXh0LFxuXHRcdFx0XHRcdGNvbW1hbmQ6IEtFWUJPQVJEX0xBWU9VVF9PUEVOX1BJQ0tFUlxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHRleHQgPSBubHMubG9jYWxpemUoJ2tleWJvYXJkTGF5b3V0JywgXCJMYXlvdXQ6IHswfVwiLCBsYXlvdXRJbmZvLmxhYmVsKTtcblx0XHRcdFx0dGhpcy5waWNrZXJFbGVtZW50LnZhbHVlID0gdGhpcy5zdGF0dXNiYXJTZXJ2aWNlLmFkZEVudHJ5KFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdG5hbWUsXG5cdFx0XHRcdFx0XHR0ZXh0LFxuXHRcdFx0XHRcdFx0YXJpYUxhYmVsOiB0ZXh0LFxuXHRcdFx0XHRcdFx0Y29tbWFuZDogS0VZQk9BUkRfTEFZT1VUX09QRU5fUElDS0VSXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHQnc3RhdHVzLndvcmtiZW5jaC5rZXlib2FyZExheW91dCcsXG5cdFx0XHRcdFx0U3RhdHVzYmFyQWxpZ25tZW50LlJJR0hUXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG59XG5cbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihLZXlib2FyZExheW91dFBpY2tlckNvbnRyaWJ1dGlvbi5JRCwgS2V5Ym9hcmRMYXlvdXRQaWNrZXJDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkJsb2NrU3RhcnR1cCk7XG5cbmludGVyZmFjZSBMYXlvdXRRdWlja1BpY2tJdGVtIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0ge1xuXHRsYXlvdXQ6IElLZXlib2FyZExheW91dEluZm87XG59XG5cbmludGVyZmFjZSBJVW5rbm93bkxheW91dCB7XG5cdHRleHQ/OiBzdHJpbmc7XG5cdGxhbmc/OiBzdHJpbmc7XG5cdGxheW91dD86IHN0cmluZztcbn1cblxuY29uc3QgREVGQVVMVF9DT05URU5UOiBzdHJpbmcgPSBbXG5cdGAvLyAke25scy5sb2NhbGl6ZSgnZGlzcGxheUxhbmd1YWdlJywgJ0RlZmluZXMgdGhlIGtleWJvYXJkIGxheW91dCB1c2VkIGluIFZTIENvZGUgaW4gdGhlIGJyb3dzZXIgZW52aXJvbm1lbnQuJyl9YCxcblx0YC8vICR7bmxzLmxvY2FsaXplKCdkb2MnLCAnT3BlbiBWUyBDb2RlIGFuZCBydW4gXCJEZXZlbG9wZXI6IEluc3BlY3QgS2V5IE1hcHBpbmdzIChKU09OKVwiIGZyb20gQ29tbWFuZCBQYWxldHRlLicpfWAsXG5cdGBgLFxuXHRgLy8gT25jZSB5b3UgaGF2ZSB0aGUga2V5Ym9hcmQgbGF5b3V0IGluZm8sIHBsZWFzZSBwYXN0ZSBpdCBiZWxvdy5gLFxuXHQnXFxuJ1xuXS5qb2luKCdcXG4nKTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBLRVlCT0FSRF9MQVlPVVRfT1BFTl9QSUNLRVIsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMigna2V5Ym9hcmQuY2hvb3NlTGF5b3V0JywgXCJDaGFuZ2UgS2V5Ym9hcmQgTGF5b3V0XCIpLFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGtleWJvYXJkTGF5b3V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJS2V5Ym9hcmRMYXlvdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlU2VydmljZSk7XG5cblx0XHRjb25zdCBsYXlvdXRzID0ga2V5Ym9hcmRMYXlvdXRTZXJ2aWNlLmdldEFsbEtleWJvYXJkTGF5b3V0cygpO1xuXHRcdGNvbnN0IGN1cnJlbnRMYXlvdXQgPSBrZXlib2FyZExheW91dFNlcnZpY2UuZ2V0Q3VycmVudEtleWJvYXJkTGF5b3V0KCk7XG5cdFx0Y29uc3QgbGF5b3V0Q29uZmlnID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2tleWJvYXJkLmxheW91dCcpO1xuXHRcdGNvbnN0IGlzQXV0b0RldGVjdCA9IGxheW91dENvbmZpZyA9PT0gJ2F1dG9kZXRlY3QnO1xuXG5cdFx0Y29uc3QgcGlja3M6IFF1aWNrUGlja0lucHV0W10gPSBsYXlvdXRzLm1hcChsYXlvdXQgPT4ge1xuXHRcdFx0Y29uc3QgcGlja2VkID0gIWlzQXV0b0RldGVjdCAmJiBhcmVLZXlib2FyZExheW91dHNFcXVhbChjdXJyZW50TGF5b3V0LCBsYXlvdXQpO1xuXHRcdFx0Y29uc3QgbGF5b3V0SW5mbyA9IHBhcnNlS2V5Ym9hcmRMYXlvdXREZXNjcmlwdGlvbihsYXlvdXQpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bGF5b3V0OiBsYXlvdXQsXG5cdFx0XHRcdGxhYmVsOiBbbGF5b3V0SW5mby5sYWJlbCwgKGxheW91dCAmJiBsYXlvdXQuaXNVc2VyS2V5Ym9hcmRMYXlvdXQpID8gJyhVc2VyIGNvbmZpZ3VyZWQgbGF5b3V0KScgOiAnJ10uam9pbignICcpLFxuXHRcdFx0XHRpZDogKGxheW91dCBhcyBJVW5rbm93bkxheW91dCkudGV4dCB8fCAobGF5b3V0IGFzIElVbmtub3duTGF5b3V0KS5sYW5nIHx8IChsYXlvdXQgYXMgSVVua25vd25MYXlvdXQpLmxheW91dCxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxheW91dEluZm8uZGVzY3JpcHRpb24gKyAocGlja2VkID8gJyAoQ3VycmVudCBsYXlvdXQpJyA6ICcnKSxcblx0XHRcdFx0cGlja2VkOiAhaXNBdXRvRGV0ZWN0ICYmIGFyZUtleWJvYXJkTGF5b3V0c0VxdWFsKGN1cnJlbnRMYXlvdXQsIGxheW91dClcblx0XHRcdH07XG5cdFx0fSkuc29ydCgoYTogSVF1aWNrUGlja0l0ZW0sIGI6IElRdWlja1BpY2tJdGVtKSA9PiB7XG5cdFx0XHRyZXR1cm4gYS5sYWJlbCA8IGIubGFiZWwgPyAtMSA6IChhLmxhYmVsID4gYi5sYWJlbCA/IDEgOiAwKTtcblx0XHR9KTtcblxuXHRcdGlmIChwaWNrcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBwbGF0Zm9ybSA9IGlzTWFjaW50b3NoID8gJ01hYycgOiBpc1dpbmRvd3MgPyAnV2luJyA6ICdMaW51eCc7XG5cdFx0XHRwaWNrcy51bnNoaWZ0KHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBubHMubG9jYWxpemUoJ2xheW91dFBpY2tzJywgXCJLZXlib2FyZCBMYXlvdXRzICh7MH0pXCIsIHBsYXRmb3JtKSB9KTtcblx0XHR9XG5cblx0XHRjb25zdCBjb25maWd1cmVLZXlib2FyZExheW91dDogSVF1aWNrUGlja0l0ZW0gPSB7IGxhYmVsOiBubHMubG9jYWxpemUoJ2NvbmZpZ3VyZUtleWJvYXJkTGF5b3V0JywgXCJDb25maWd1cmUgS2V5Ym9hcmQgTGF5b3V0XCIpIH07XG5cblx0XHRwaWNrcy51bnNoaWZ0KGNvbmZpZ3VyZUtleWJvYXJkTGF5b3V0KTtcblxuXHRcdC8vIE9mZmVyIHRvIFwiQXV0byBEZXRlY3RcIlxuXHRcdGNvbnN0IGF1dG9EZXRlY3RNb2RlOiBJUXVpY2tQaWNrSXRlbSA9IHtcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2F1dG9EZXRlY3QnLCBcIkF1dG8gRGV0ZWN0XCIpLFxuXHRcdFx0ZGVzY3JpcHRpb246IGlzQXV0b0RldGVjdCA/IGBDdXJyZW50OiAke3BhcnNlS2V5Ym9hcmRMYXlvdXREZXNjcmlwdGlvbihjdXJyZW50TGF5b3V0KS5sYWJlbH1gIDogdW5kZWZpbmVkLFxuXHRcdFx0cGlja2VkOiBpc0F1dG9EZXRlY3QgPyB0cnVlIDogdW5kZWZpbmVkXG5cdFx0fTtcblxuXHRcdHBpY2tzLnVuc2hpZnQoYXV0b0RldGVjdE1vZGUpO1xuXG5cdFx0Y29uc3QgcGljayA9IGF3YWl0IHF1aWNrSW5wdXRTZXJ2aWNlLnBpY2socGlja3MsIHsgcGxhY2VIb2xkZXI6IG5scy5sb2NhbGl6ZSgncGlja0tleWJvYXJkTGF5b3V0JywgXCJTZWxlY3QgS2V5Ym9hcmQgTGF5b3V0XCIpLCBtYXRjaE9uRGVzY3JpcHRpb246IHRydWUgfSk7XG5cdFx0aWYgKCFwaWNrKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHBpY2sgPT09IGF1dG9EZXRlY3RNb2RlKSB7XG5cdFx0XHQvLyBzZXQga2V5bWFwIHNlcnZpY2UgdG8gYXV0byBtb2RlXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZSgna2V5Ym9hcmQubGF5b3V0JywgJ2F1dG9kZXRlY3QnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAocGljayA9PT0gY29uZmlndXJlS2V5Ym9hcmRMYXlvdXQpIHtcblx0XHRcdGNvbnN0IGZpbGUgPSBlbnZpcm9ubWVudFNlcnZpY2Uua2V5Ym9hcmRMYXlvdXRSZXNvdXJjZTtcblxuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uuc3RhdChmaWxlKS50aGVuKHVuZGVmaW5lZCwgKCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gZmlsZVNlcnZpY2UuY3JlYXRlRmlsZShmaWxlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKERFRkFVTFRfQ09OVEVOVCkpO1xuXHRcdFx0fSkudGhlbigoc3RhdCk6IFByb21pc2U8SUVkaXRvclBhbmUgfCB1bmRlZmluZWQ+IHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdFx0aWYgKCFzdGF0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0XHRyZXNvdXJjZTogc3RhdC5yZXNvdXJjZSxcblx0XHRcdFx0XHRsYW5ndWFnZUlkOiAnanNvbmMnLFxuXHRcdFx0XHRcdG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9LCAoZXJyb3IpID0+IHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKG5scy5sb2NhbGl6ZSgnZmFpbC5jcmVhdGVTZXR0aW5ncycsIFwiVW5hYmxlIHRvIGNyZWF0ZSAnezB9JyAoezF9KS5cIiwgZmlsZS50b1N0cmluZygpLCBlcnJvcikpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cblx0XHRjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZSgna2V5Ym9hcmQubGF5b3V0JywgZ2V0S2V5Ym9hcmRMYXlvdXRJZCgoPExheW91dFF1aWNrUGlja0l0ZW0+cGljaykubGF5b3V0KSk7XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxvQkFBb0IseUJBQWtEO0FBQy9FLFNBQVMsWUFBWSx5QkFBeUI7QUFDOUMsU0FBUyxnQ0FBZ0MseUJBQXlCLHFCQUFxQiw4QkFBbUQ7QUFDMUksU0FBaUMsZ0JBQWdCLHNDQUFzQztBQUN2RixTQUFTLG1DQUFtQztBQUM1QyxTQUFTLGFBQWEsaUJBQWlCO0FBQ3ZDLFNBQXlCLDBCQUEwQztBQUNuRSxTQUFTLFNBQVMsdUJBQXVCO0FBQ3pDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZ0JBQWdCO0FBSWxCLElBQU0sbUNBQU4sY0FBK0MsV0FBNkM7QUFBQSxFQU1sRyxZQUMwQyx1QkFD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
