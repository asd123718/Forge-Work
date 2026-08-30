import { MainContext } from "./extHost.protocol.js";
import * as typeConvert from "./extHostTypeConverters.js";
import { StandardTokenType, Range, LanguageStatusSeverity } from "./extHostTypes.js";
import Severity from "../../../base/common/severity.js";
import { disposableTimeout } from "../../../base/common/async.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { checkProposedApiEnabled } from "../../services/extensions/common/extensions.js";
import { Emitter } from "../../../base/common/event.js";
class ExtHostLanguages {
  constructor(mainContext, _documents, _commands, _uriTransformer) {
    this._documents = _documents;
    this._commands = _commands;
    this._uriTransformer = _uriTransformer;
    this._languageIds = [];
    this._onDidChangeSyntaxHighlighting = new Emitter();
    this.onDidChangeSyntaxHighlighting = this._onDidChangeSyntaxHighlighting.event;
    this._handlePool = 0;
    this._ids = /* @__PURE__ */ new Set();
    this._proxy = mainContext.getProxy(MainContext.MainThreadLanguages);
  }
  $acceptLanguageIds(ids) {
    this._languageIds = ids;
  }
  $acceptSyntaxHighlightingThemeChanged() {
    this._onDidChangeSyntaxHighlighting.fire();
  }
  async computeFullSyntaxHighlighting(source, languageId) {
    const result = await this._proxy.$computeFullSyntaxHighlighting(source, languageId);
    return result;
  }
  async getLanguages() {
    return this._languageIds.slice(0);
  }
  async changeLanguage(uri, languageId) {
    await this._proxy.$changeLanguage(uri, languageId);
    const data = this._documents.getDocumentData(uri);
    if (!data) {
      throw new Error(`document '${uri.toString()}' NOT found`);
    }
    return data.document;
  }
  async tokenAtPosition(document, position) {
    const versionNow = document.version;
    const pos = typeConvert.Position.from(position);
    const info = await this._proxy.$tokensAtPosition(document.uri, pos);
    const defaultRange = {
      type: StandardTokenType.Other,
      range: document.getWordRangeAtPosition(position) ?? new Range(position.line, position.character, position.line, position.character)
    };
    if (!info) {
      return defaultRange;
    }
    const result = {
      range: typeConvert.Range.to(info.range),
      type: typeConvert.TokenType.to(info.type)
    };
    if (!result.range.contains(position)) {
      return defaultRange;
    }
    if (versionNow !== document.version) {
      return defaultRange;
    }
    return result;
  }
  createLanguageStatusItem(extension, id, selector) {
    const handle = this._handlePool++;
    const proxy = this._proxy;
    const ids = this._ids;
    const fullyQualifiedId = `${extension.identifier.value}/${id}`;
    if (ids.has(fullyQualifiedId)) {
      throw new Error(`LanguageStatusItem with id '${id}' ALREADY exists`);
    }
    ids.add(fullyQualifiedId);
    const data = {
      selector,
      id,
      name: extension.displayName ?? extension.name,
      severity: LanguageStatusSeverity.Information,
      command: void 0,
      text: "",
      detail: "",
      busy: false
    };
    let soonHandle;
    const commandDisposables = new DisposableStore();
    const updateAsync = () => {
      soonHandle?.dispose();
      if (!ids.has(fullyQualifiedId)) {
        console.warn(`LanguageStatusItem (${id}) from ${extension.identifier.value} has been disposed and CANNOT be updated anymore`);
        return;
      }
      soonHandle = disposableTimeout(() => {
        commandDisposables.clear();
        this._proxy.$setLanguageStatus(handle, {
          id: fullyQualifiedId,
          name: data.name ?? extension.displayName ?? extension.name,
          source: extension.displayName ?? extension.name,
          selector: typeConvert.DocumentSelector.from(data.selector, this._uriTransformer),
          label: data.text,
          detail: data.detail ?? "",
          severity: data.severity === LanguageStatusSeverity.Error ? Severity.Error : data.severity === LanguageStatusSeverity.Warning ? Severity.Warning : Severity.Info,
          command: data.command && this._commands.toInternal(data.command, commandDisposables),
          accessibilityInfo: data.accessibilityInformation,
          busy: data.busy
        });
      }, 0);
    };
    const result = {
      dispose() {
        commandDisposables.dispose();
        soonHandle?.dispose();
        proxy.$removeLanguageStatus(handle);
        ids.delete(fullyQualifiedId);
      },
      get id() {
        return data.id;
      },
      get name() {
        return data.name;
      },
      set name(value) {
        data.name = value;
        updateAsync();
      },
      get selector() {
        return data.selector;
      },
      set selector(value) {
        data.selector = value;
        updateAsync();
      },
      get text() {
        return data.text;
      },
      set text(value) {
        data.text = value;
        updateAsync();
      },
      set text2(value) {
        checkProposedApiEnabled(extension, "languageStatusText");
        data.text = value;
        updateAsync();
      },
      get text2() {
        checkProposedApiEnabled(extension, "languageStatusText");
        return data.text;
      },
      get detail() {
        return data.detail;
      },
      set detail(value) {
        data.detail = value;
        updateAsync();
      },
      get severity() {
        return data.severity;
      },
      set severity(value) {
        data.severity = value;
        updateAsync();
      },
      get accessibilityInformation() {
        return data.accessibilityInformation;
      },
      set accessibilityInformation(value) {
        data.accessibilityInformation = value;
        updateAsync();
      },
      get command() {
        return data.command;
      },
      set command(value) {
        data.command = value;
        updateAsync();
      },
      get busy() {
        return data.busy;
      },
      set busy(value) {
        data.busy = value;
        updateAsync();
      }
    };
    updateAsync();
    return result;
  }
}
export {
  ExtHostLanguages
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0TGFuZ3VhZ2VzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgTWFpbkNvbnRleHQsIE1haW5UaHJlYWRMYW5ndWFnZXNTaGFwZSwgSU1haW5Db250ZXh0LCBFeHRIb3N0TGFuZ3VhZ2VzU2hhcGUgfSBmcm9tICcuL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHR5cGUgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IEV4dEhvc3REb2N1bWVudHMgfSBmcm9tICcuL2V4dEhvc3REb2N1bWVudHMuanMnO1xuaW1wb3J0ICogYXMgdHlwZUNvbnZlcnQgZnJvbSAnLi9leHRIb3N0VHlwZUNvbnZlcnRlcnMuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRUb2tlblR5cGUsIFJhbmdlLCBQb3NpdGlvbiwgTGFuZ3VhZ2VTdGF0dXNTZXZlcml0eSB9IGZyb20gJy4vZXh0SG9zdFR5cGVzLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBkaXNwb3NhYmxlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc0NvbnZlcnRlciB9IGZyb20gJy4vZXh0SG9zdENvbW1hbmRzLmpzJztcbmltcG9ydCB7IElVUklUcmFuc2Zvcm1lciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaUlwYy5qcyc7XG5pbXBvcnQgeyBjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcblxuZXhwb3J0IGNsYXNzIEV4dEhvc3RMYW5ndWFnZXMgaW1wbGVtZW50cyBFeHRIb3N0TGFuZ3VhZ2VzU2hhcGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBNYWluVGhyZWFkTGFuZ3VhZ2VzU2hhcGU7XG5cblx0cHJpdmF0ZSBfbGFuZ3VhZ2VJZHM6IHN0cmluZ1tdID0gW107XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTeW50YXhIaWdobGlnaHRpbmcgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVN5bnRheEhpZ2hsaWdodGluZyA9IHRoaXMuX29uRGlkQ2hhbmdlU3ludGF4SGlnaGxpZ2h0aW5nLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG1haW5Db250ZXh0OiBJTWFpbkNvbnRleHQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZG9jdW1lbnRzOiBFeHRIb3N0RG9jdW1lbnRzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRzOiBDb21tYW5kc0NvbnZlcnRlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF91cmlUcmFuc2Zvcm1lcjogSVVSSVRyYW5zZm9ybWVyIHwgdW5kZWZpbmVkXG5cdCkge1xuXHRcdHRoaXMuX3Byb3h5ID0gbWFpbkNvbnRleHQuZ2V0UHJveHkoTWFpbkNvbnRleHQuTWFpblRocmVhZExhbmd1YWdlcyk7XG5cdH1cblxuXHQkYWNjZXB0TGFuZ3VhZ2VJZHMoaWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuXHRcdHRoaXMuX2xhbmd1YWdlSWRzID0gaWRzO1xuXHR9XG5cblx0JGFjY2VwdFN5bnRheEhpZ2hsaWdodGluZ1RoZW1lQ2hhbmdlZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVN5bnRheEhpZ2hsaWdodGluZy5maXJlKCk7XG5cdH1cblxuXHRhc3luYyBjb21wdXRlRnVsbFN5bnRheEhpZ2hsaWdodGluZyhzb3VyY2U6IHN0cmluZywgbGFuZ3VhZ2VJZDogc3RyaW5nKTogUHJvbWlzZTx2c2NvZGUuU3ludGF4SGlnaGxpZ2h0aW5nUmVzdWx0PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fcHJveHkuJGNvbXB1dGVGdWxsU3ludGF4SGlnaGxpZ2h0aW5nKHNvdXJjZSwgbGFuZ3VhZ2VJZCk7XG5cdFx0cmV0dXJuIHJlc3VsdCBhcyB2c2NvZGUuU3ludGF4SGlnaGxpZ2h0aW5nUmVzdWx0O1xuXHR9XG5cblx0YXN5bmMgZ2V0TGFuZ3VhZ2VzKCk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHRyZXR1cm4gdGhpcy5fbGFuZ3VhZ2VJZHMuc2xpY2UoMCk7XG5cdH1cblxuXHRhc3luYyBjaGFuZ2VMYW5ndWFnZSh1cmk6IHZzY29kZS5VcmksIGxhbmd1YWdlSWQ6IHN0cmluZyk6IFByb21pc2U8dnNjb2RlLlRleHREb2N1bWVudD4ge1xuXHRcdGF3YWl0IHRoaXMuX3Byb3h5LiRjaGFuZ2VMYW5ndWFnZSh1cmksIGxhbmd1YWdlSWQpO1xuXHRcdGNvbnN0IGRhdGEgPSB0aGlzLl9kb2N1bWVudHMuZ2V0RG9jdW1lbnREYXRhKHVyaSk7XG5cdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYGRvY3VtZW50ICcke3VyaS50b1N0cmluZygpfScgTk9UIGZvdW5kYCk7XG5cdFx0fVxuXHRcdHJldHVybiBkYXRhLmRvY3VtZW50O1xuXHR9XG5cblx0YXN5bmMgdG9rZW5BdFBvc2l0aW9uKGRvY3VtZW50OiB2c2NvZGUuVGV4dERvY3VtZW50LCBwb3NpdGlvbjogdnNjb2RlLlBvc2l0aW9uKTogUHJvbWlzZTx2c2NvZGUuVG9rZW5JbmZvcm1hdGlvbj4ge1xuXHRcdGNvbnN0IHZlcnNpb25Ob3cgPSBkb2N1bWVudC52ZXJzaW9uO1xuXHRcdGNvbnN0IHBvcyA9IHR5cGVDb252ZXJ0LlBvc2l0aW9uLmZyb20ocG9zaXRpb24pO1xuXHRcdGNvbnN0IGluZm8gPSBhd2FpdCB0aGlzLl9wcm94eS4kdG9rZW5zQXRQb3NpdGlvbihkb2N1bWVudC51cmksIHBvcyk7XG5cdFx0Y29uc3QgZGVmYXVsdFJhbmdlID0ge1xuXHRcdFx0dHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIsXG5cdFx0XHRyYW5nZTogZG9jdW1lbnQuZ2V0V29yZFJhbmdlQXRQb3NpdGlvbihwb3NpdGlvbikgPz8gbmV3IFJhbmdlKHBvc2l0aW9uLmxpbmUsIHBvc2l0aW9uLmNoYXJhY3RlciwgcG9zaXRpb24ubGluZSwgcG9zaXRpb24uY2hhcmFjdGVyKVxuXHRcdH07XG5cdFx0aWYgKCFpbmZvKSB7XG5cdFx0XHQvLyBubyByZXN1bHRcblx0XHRcdHJldHVybiBkZWZhdWx0UmFuZ2U7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdCA9IHtcblx0XHRcdHJhbmdlOiB0eXBlQ29udmVydC5SYW5nZS50byhpbmZvLnJhbmdlKSxcblx0XHRcdHR5cGU6IHR5cGVDb252ZXJ0LlRva2VuVHlwZS50byhpbmZvLnR5cGUpXG5cdFx0fTtcblx0XHRpZiAoIXJlc3VsdC5yYW5nZS5jb250YWlucyg8UG9zaXRpb24+cG9zaXRpb24pKSB7XG5cdFx0XHQvLyBib2dvdXMgcmVzdWx0XG5cdFx0XHRyZXR1cm4gZGVmYXVsdFJhbmdlO1xuXHRcdH1cblx0XHRpZiAodmVyc2lvbk5vdyAhPT0gZG9jdW1lbnQudmVyc2lvbikge1xuXHRcdFx0Ly8gY29uY3VycmVudCBjaGFuZ2Vcblx0XHRcdHJldHVybiBkZWZhdWx0UmFuZ2U7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVQb29sOiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIF9pZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRjcmVhdGVMYW5ndWFnZVN0YXR1c0l0ZW0oZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGlkOiBzdHJpbmcsIHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3Rvcik6IHZzY29kZS5MYW5ndWFnZVN0YXR1c0l0ZW0ge1xuXG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5faGFuZGxlUG9vbCsrO1xuXHRcdGNvbnN0IHByb3h5ID0gdGhpcy5fcHJveHk7XG5cdFx0Y29uc3QgaWRzID0gdGhpcy5faWRzO1xuXG5cdFx0Ly8gZW5mb3JjZSBleHRlbnNpb24gdW5pcXVlIGlkZW50aWZpZXJcblx0XHRjb25zdCBmdWxseVF1YWxpZmllZElkID0gYCR7ZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWV9LyR7aWR9YDtcblx0XHRpZiAoaWRzLmhhcyhmdWxseVF1YWxpZmllZElkKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBMYW5ndWFnZVN0YXR1c0l0ZW0gd2l0aCBpZCAnJHtpZH0nIEFMUkVBRFkgZXhpc3RzYCk7XG5cdFx0fVxuXHRcdGlkcy5hZGQoZnVsbHlRdWFsaWZpZWRJZCk7XG5cblx0XHRjb25zdCBkYXRhOiBPbWl0PHZzY29kZS5MYW5ndWFnZVN0YXR1c0l0ZW0sICdkaXNwb3NlJyB8ICd0ZXh0Mic+ID0ge1xuXHRcdFx0c2VsZWN0b3IsXG5cdFx0XHRpZCxcblx0XHRcdG5hbWU6IGV4dGVuc2lvbi5kaXNwbGF5TmFtZSA/PyBleHRlbnNpb24ubmFtZSxcblx0XHRcdHNldmVyaXR5OiBMYW5ndWFnZVN0YXR1c1NldmVyaXR5LkluZm9ybWF0aW9uLFxuXHRcdFx0Y29tbWFuZDogdW5kZWZpbmVkLFxuXHRcdFx0dGV4dDogJycsXG5cdFx0XHRkZXRhaWw6ICcnLFxuXHRcdFx0YnVzeTogZmFsc2Vcblx0XHR9O1xuXG5cblx0XHRsZXQgc29vbkhhbmRsZTogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgY29tbWFuZERpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHVwZGF0ZUFzeW5jID0gKCkgPT4ge1xuXHRcdFx0c29vbkhhbmRsZT8uZGlzcG9zZSgpO1xuXG5cdFx0XHRpZiAoIWlkcy5oYXMoZnVsbHlRdWFsaWZpZWRJZCkpIHtcblx0XHRcdFx0Y29uc29sZS53YXJuKGBMYW5ndWFnZVN0YXR1c0l0ZW0gKCR7aWR9KSBmcm9tICR7ZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWV9IGhhcyBiZWVuIGRpc3Bvc2VkIGFuZCBDQU5OT1QgYmUgdXBkYXRlZCBhbnltb3JlYCk7XG5cdFx0XHRcdHJldHVybjsgLy8gZGlzcG9zZWQgaW4gdGhlIG1lYW50aW1lXG5cdFx0XHR9XG5cblx0XHRcdHNvb25IYW5kbGUgPSBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdGNvbW1hbmREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kc2V0TGFuZ3VhZ2VTdGF0dXMoaGFuZGxlLCB7XG5cdFx0XHRcdFx0aWQ6IGZ1bGx5UXVhbGlmaWVkSWQsXG5cdFx0XHRcdFx0bmFtZTogZGF0YS5uYW1lID8/IGV4dGVuc2lvbi5kaXNwbGF5TmFtZSA/PyBleHRlbnNpb24ubmFtZSxcblx0XHRcdFx0XHRzb3VyY2U6IGV4dGVuc2lvbi5kaXNwbGF5TmFtZSA/PyBleHRlbnNpb24ubmFtZSxcblx0XHRcdFx0XHRzZWxlY3RvcjogdHlwZUNvbnZlcnQuRG9jdW1lbnRTZWxlY3Rvci5mcm9tKGRhdGEuc2VsZWN0b3IsIHRoaXMuX3VyaVRyYW5zZm9ybWVyKSxcblx0XHRcdFx0XHRsYWJlbDogZGF0YS50ZXh0LFxuXHRcdFx0XHRcdGRldGFpbDogZGF0YS5kZXRhaWwgPz8gJycsXG5cdFx0XHRcdFx0c2V2ZXJpdHk6IGRhdGEuc2V2ZXJpdHkgPT09IExhbmd1YWdlU3RhdHVzU2V2ZXJpdHkuRXJyb3IgPyBTZXZlcml0eS5FcnJvciA6IGRhdGEuc2V2ZXJpdHkgPT09IExhbmd1YWdlU3RhdHVzU2V2ZXJpdHkuV2FybmluZyA/IFNldmVyaXR5Lldhcm5pbmcgOiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IGRhdGEuY29tbWFuZCAmJiB0aGlzLl9jb21tYW5kcy50b0ludGVybmFsKGRhdGEuY29tbWFuZCwgY29tbWFuZERpc3Bvc2FibGVzKSxcblx0XHRcdFx0XHRhY2Nlc3NpYmlsaXR5SW5mbzogZGF0YS5hY2Nlc3NpYmlsaXR5SW5mb3JtYXRpb24sXG5cdFx0XHRcdFx0YnVzeTogZGF0YS5idXN5XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSwgMCk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlc3VsdDogdnNjb2RlLkxhbmd1YWdlU3RhdHVzSXRlbSA9IHtcblx0XHRcdGRpc3Bvc2UoKSB7XG5cdFx0XHRcdGNvbW1hbmREaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdHNvb25IYW5kbGU/LmRpc3Bvc2UoKTtcblx0XHRcdFx0cHJveHkuJHJlbW92ZUxhbmd1YWdlU3RhdHVzKGhhbmRsZSk7XG5cdFx0XHRcdGlkcy5kZWxldGUoZnVsbHlRdWFsaWZpZWRJZCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGlkKCkge1xuXHRcdFx0XHRyZXR1cm4gZGF0YS5pZDtcblx0XHRcdH0sXG5cdFx0XHRnZXQgbmFtZSgpIHtcblx0XHRcdFx0cmV0dXJuIGRhdGEubmFtZTtcblx0XHRcdH0sXG5cdFx0XHRzZXQgbmFtZSh2YWx1ZSkge1xuXHRcdFx0XHRkYXRhLm5hbWUgPSB2YWx1ZTtcblx0XHRcdFx0dXBkYXRlQXN5bmMoKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgc2VsZWN0b3IoKSB7XG5cdFx0XHRcdHJldHVybiBkYXRhLnNlbGVjdG9yO1xuXHRcdFx0fSxcblx0XHRcdHNldCBzZWxlY3Rvcih2YWx1ZSkge1xuXHRcdFx0XHRkYXRhLnNlbGVjdG9yID0gdmFsdWU7XG5cdFx0XHRcdHVwZGF0ZUFzeW5jKCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IHRleHQoKSB7XG5cdFx0XHRcdHJldHVybiBkYXRhLnRleHQ7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IHRleHQodmFsdWUpIHtcblx0XHRcdFx0ZGF0YS50ZXh0ID0gdmFsdWU7XG5cdFx0XHRcdHVwZGF0ZUFzeW5jKCk7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IHRleHQyKHZhbHVlKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2xhbmd1YWdlU3RhdHVzVGV4dCcpO1xuXHRcdFx0XHRkYXRhLnRleHQgPSB2YWx1ZTtcblx0XHRcdFx0dXBkYXRlQXN5bmMoKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgdGV4dDIoKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2xhbmd1YWdlU3RhdHVzVGV4dCcpO1xuXHRcdFx0XHRyZXR1cm4gZGF0YS50ZXh0O1xuXHRcdFx0fSxcblx0XHRcdGdldCBkZXRhaWwoKSB7XG5cdFx0XHRcdHJldHVybiBkYXRhLmRldGFpbDtcblx0XHRcdH0sXG5cdFx0XHRzZXQgZGV0YWlsKHZhbHVlKSB7XG5cdFx0XHRcdGRhdGEuZGV0YWlsID0gdmFsdWU7XG5cdFx0XHRcdHVwZGF0ZUFzeW5jKCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IHNldmVyaXR5KCkge1xuXHRcdFx0XHRyZXR1cm4gZGF0YS5zZXZlcml0eTtcblx0XHRcdH0sXG5cdFx0XHRzZXQgc2V2ZXJpdHkodmFsdWUpIHtcblx0XHRcdFx0ZGF0YS5zZXZlcml0eSA9IHZhbHVlO1xuXHRcdFx0XHR1cGRhdGVBc3luYygpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBhY2Nlc3NpYmlsaXR5SW5mb3JtYXRpb24oKSB7XG5cdFx0XHRcdHJldHVybiBkYXRhLmFjY2Vzc2liaWxpdHlJbmZvcm1hdGlvbjtcblx0XHRcdH0sXG5cdFx0XHRzZXQgYWNjZXNzaWJpbGl0eUluZm9ybWF0aW9uKHZhbHVlKSB7XG5cdFx0XHRcdGRhdGEuYWNjZXNzaWJpbGl0eUluZm9ybWF0aW9uID0gdmFsdWU7XG5cdFx0XHRcdHVwZGF0ZUFzeW5jKCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGNvbW1hbmQoKSB7XG5cdFx0XHRcdHJldHVybiBkYXRhLmNvbW1hbmQ7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IGNvbW1hbmQodmFsdWUpIHtcblx0XHRcdFx0ZGF0YS5jb21tYW5kID0gdmFsdWU7XG5cdFx0XHRcdHVwZGF0ZUFzeW5jKCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGJ1c3koKSB7XG5cdFx0XHRcdHJldHVybiBkYXRhLmJ1c3k7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IGJ1c3kodmFsdWU6IGJvb2xlYW4pIHtcblx0XHRcdFx0ZGF0YS5idXN5ID0gdmFsdWU7XG5cdFx0XHRcdHVwZGF0ZUFzeW5jKCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHR1cGRhdGVBc3luYygpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsbUJBQWtGO0FBRzNGLFlBQVksaUJBQWlCO0FBQzdCLFNBQVMsbUJBQW1CLE9BQWlCLDhCQUE4QjtBQUMzRSxPQUFPLGNBQWM7QUFDckIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx1QkFBb0M7QUFJN0MsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxlQUFlO0FBRWpCLE1BQU0saUJBQWtEO0FBQUEsRUFTOUQsWUFDQyxhQUNpQixZQUNBLFdBQ0EsaUJBQ2hCO0FBSGdCO0FBQ0E7QUFDQTtBQVRsQixTQUFRLGVBQXlCLENBQUM7QUFFbEMsU0FBaUIsaUNBQWlDLElBQUksUUFBYztBQUNwRSxTQUFTLGdDQUFnQyxLQUFLLCtCQUErQjtBQWdFN0UsU0FBUSxjQUFzQjtBQUM5QixTQUFRLE9BQU8sb0JBQUksSUFBWTtBQXpEOUIsU0FBSyxTQUFTLFlBQVksU0FBUyxZQUFZLG1CQUFtQjtBQUFBLEVBQ25FO0FBQUEsRUFFQSxtQkFBbUIsS0FBcUI7QUFDdkMsU0FBSyxlQUFlO0FBQUEsRUFDckI7QUFBQSxFQUVBLHdDQUE4QztBQUM3QyxTQUFLLCtCQUErQixLQUFLO0FBQUEsRUFDMUM7QUFBQSxFQUVBLE1BQU0sOEJBQThCLFFBQWdCLFlBQThEO0FBQ2pILFVBQU0sU0FBUyxNQUFNLEtBQUssT0FBTywrQkFBK0IsUUFBUSxVQUFVO0FBQ2xGLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFNLGVBQWtDO0FBQ3ZDLFdBQU8sS0FBSyxhQUFhLE1BQU0sQ0FBQztBQUFBLEVBQ2pDO0FBQUEsRUFFQSxNQUFNLGVBQWUsS0FBaUIsWUFBa0Q7QUFDdkYsVUFBTSxLQUFLLE9BQU8sZ0JBQWdCLEtBQUssVUFBVTtBQUNqRCxVQUFNLE9BQU8sS0FBSyxXQUFXLGdCQUFnQixHQUFHO0FBQ2hELFFBQUksQ0FBQyxNQUFNO0FBQ1YsWUFBTSxJQUFJLE1BQU0sYUFBYSxJQUFJLFNBQVMsQ0FBQyxhQUFhO0FBQUEsSUFDekQ7QUFDQSxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxNQUFNLGdCQUFnQixVQUErQixVQUE2RDtBQUNqSCxVQUFNLGFBQWEsU0FBUztBQUM1QixVQUFNLE1BQU0sWUFBWSxTQUFTLEtBQUssUUFBUTtBQUM5QyxVQUFNLE9BQU8sTUFBTSxLQUFLLE9BQU8sa0JBQWtCLFNBQVMsS0FBSyxHQUFHO0FBQ2xFLFVBQU0sZUFBZTtBQUFBLE1BQ3BCLE1BQU0sa0JBQWtCO0FBQUEsTUFDeEIsT0FBTyxTQUFTLHVCQUF1QixRQUFRLEtBQUssSUFBSSxNQUFNLFNBQVMsTUFBTSxTQUFTLFdBQVcsU0FBUyxNQUFNLFNBQVMsU0FBUztBQUFBLElBQ25JO0FBQ0EsUUFBSSxDQUFDLE1BQU07QUFFVixhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sU0FBUztBQUFBLE1BQ2QsT0FBTyxZQUFZLE1BQU0sR0FBRyxLQUFLLEtBQUs7QUFBQSxNQUN0QyxNQUFNLFlBQVksVUFBVSxHQUFHLEtBQUssSUFBSTtBQUFBLElBQ3pDO0FBQ0EsUUFBSSxDQUFDLE9BQU8sTUFBTSxTQUFtQixRQUFRLEdBQUc7QUFFL0MsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLGVBQWUsU0FBUyxTQUFTO0FBRXBDLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUtBLHlCQUF5QixXQUFrQyxJQUFZLFVBQThEO0FBRXBJLFVBQU0sU0FBUyxLQUFLO0FBQ3BCLFVBQU0sUUFBUSxLQUFLO0FBQ25CLFVBQU0sTUFBTSxLQUFLO0FBR2pCLFVBQU0sbUJBQW1CLEdBQUcsVUFBVSxXQUFXLEtBQUssSUFBSSxFQUFFO0FBQzVELFFBQUksSUFBSSxJQUFJLGdCQUFnQixHQUFHO0FBQzlCLFlBQU0sSUFBSSxNQUFNLCtCQUErQixFQUFFLGtCQUFrQjtBQUFBLElBQ3BFO0FBQ0EsUUFBSSxJQUFJLGdCQUFnQjtBQUV4QixVQUFNLE9BQTZEO0FBQUEsTUFDbEU7QUFBQSxNQUNBO0FBQUEsTUFDQSxNQUFNLFVBQVUsZUFBZSxVQUFVO0FBQUEsTUFDekMsVUFBVSx1QkFBdUI7QUFBQSxNQUNqQyxTQUFTO0FBQUEsTUFDVCxNQUFNO0FBQUEsTUFDTixRQUFRO0FBQUEsTUFDUixNQUFNO0FBQUEsSUFDUDtBQUdBLFFBQUk7QUFDSixVQUFNLHFCQUFxQixJQUFJLGdCQUFnQjtBQUMvQyxVQUFNLGNBQWMsTUFBTTtBQUN6QixrQkFBWSxRQUFRO0FBRXBCLFVBQUksQ0FBQyxJQUFJLElBQUksZ0JBQWdCLEdBQUc7QUFDL0IsZ0JBQVEsS0FBSyx1QkFBdUIsRUFBRSxVQUFVLFVBQVUsV0FBVyxLQUFLLGtEQUFrRDtBQUM1SDtBQUFBLE1BQ0Q7QUFFQSxtQkFBYSxrQkFBa0IsTUFBTTtBQUNwQywyQkFBbUIsTUFBTTtBQUN6QixhQUFLLE9BQU8sbUJBQW1CLFFBQVE7QUFBQSxVQUN0QyxJQUFJO0FBQUEsVUFDSixNQUFNLEtBQUssUUFBUSxVQUFVLGVBQWUsVUFBVTtBQUFBLFVBQ3RELFFBQVEsVUFBVSxlQUFlLFVBQVU7QUFBQSxVQUMzQyxVQUFVLFlBQVksaUJBQWlCLEtBQUssS0FBSyxVQUFVLEtBQUssZUFBZTtBQUFBLFVBQy9FLE9BQU8sS0FBSztBQUFBLFVBQ1osUUFBUSxLQUFLLFVBQVU7QUFBQSxVQUN2QixVQUFVLEtBQUssYUFBYSx1QkFBdUIsUUFBUSxTQUFTLFFBQVEsS0FBSyxhQUFhLHVCQUF1QixVQUFVLFNBQVMsVUFBVSxTQUFTO0FBQUEsVUFDM0osU0FBUyxLQUFLLFdBQVcsS0FBSyxVQUFVLFdBQVcsS0FBSyxTQUFTLGtCQUFrQjtBQUFBLFVBQ25GLG1CQUFtQixLQUFLO0FBQUEsVUFDeEIsTUFBTSxLQUFLO0FBQUEsUUFDWixDQUFDO0FBQUEsTUFDRixHQUFHLENBQUM7QUFBQSxJQUNMO0FBRUEsVUFBTSxTQUFvQztBQUFBLE1BQ3pDLFVBQVU7QUFDVCwyQkFBbUIsUUFBUTtBQUMzQixvQkFBWSxRQUFRO0FBQ3BCLGNBQU0sc0JBQXNCLE1BQU07QUFDbEMsWUFBSSxPQUFPLGdCQUFnQjtBQUFBLE1BQzVCO0FBQUEsTUFDQSxJQUFJLEtBQUs7QUFDUixlQUFPLEtBQUs7QUFBQSxNQUNiO0FBQUEsTUFDQSxJQUFJLE9BQU87QUFDVixlQUFPLEtBQUs7QUFBQSxNQUNiO0FBQUEsTUFDQSxJQUFJLEtBQUssT0FBTztBQUNmLGFBQUssT0FBTztBQUNaLG9CQUFZO0FBQUEsTUFDYjtBQUFBLE1BQ0EsSUFBSSxXQUFXO0FBQ2QsZUFBTyxLQUFLO0FBQUEsTUFDYjtBQUFBLE1BQ0EsSUFBSSxTQUFTLE9BQU87QUFDbkIsYUFBSyxXQUFXO0FBQ2hCLG9CQUFZO0FBQUEsTUFDYjtBQUFBLE1BQ0EsSUFBSSxPQUFPO0FBQ1YsZUFBTyxLQUFLO0FBQUEsTUFDYjtBQUFBLE1BQ0EsSUFBSSxLQUFLLE9BQU87QUFDZixhQUFLLE9BQU87QUFDWixvQkFBWTtBQUFBLE1BQ2I7QUFBQSxNQUNBLElBQUksTUFBTSxPQUFPO0FBQ2hCLGdDQUF3QixXQUFXLG9CQUFvQjtBQUN2RCxhQUFLLE9BQU87QUFDWixvQkFBWTtBQUFBLE1BQ2I7QUFBQSxNQUNBLElBQUksUUFBUTtBQUNYLGdDQUF3QixXQUFXLG9CQUFvQjtBQUN2RCxlQUFPLEtBQUs7QUFBQSxNQUNiO0FBQUEsTUFDQSxJQUFJLFNBQVM7QUFDWixlQUFPLEtBQUs7QUFBQSxNQUNiO0FBQUEsTUFDQSxJQUFJLE9BQU8sT0FBTztBQUNqQixhQUFLLFNBQVM7QUFDZCxvQkFBWTtBQUFBLE1BQ2I7QUFBQSxNQUNBLElBQUksV0FBVztBQUNkLGVBQU8sS0FBSztBQUFBLE1BQ2I7QUFBQSxNQUNBLElBQUksU0FBUyxPQUFPO0FBQ25CLGFBQUssV0FBVztBQUNoQixvQkFBWTtBQUFBLE1BQ2I7QUFBQSxNQUNBLElBQUksMkJBQTJCO0FBQzlCLGVBQU8sS0FBSztBQUFBLE1BQ2I7QUFBQSxNQUNBLElBQUkseUJBQXlCLE9BQU87QUFDbkMsYUFBSywyQkFBMkI7QUFDaEMsb0JBQVk7QUFBQSxNQUNiO0FBQUEsTUFDQSxJQUFJLFVBQVU7QUFDYixlQUFPLEtBQUs7QUFBQSxNQUNiO0FBQUEsTUFDQSxJQUFJLFFBQVEsT0FBTztBQUNsQixhQUFLLFVBQVU7QUFDZixvQkFBWTtBQUFBLE1BQ2I7QUFBQSxNQUNBLElBQUksT0FBTztBQUNWLGVBQU8sS0FBSztBQUFBLE1BQ2I7QUFBQSxNQUNBLElBQUksS0FBSyxPQUFnQjtBQUN4QixhQUFLLE9BQU87QUFDWixvQkFBWTtBQUFBLE1BQ2I7QUFBQSxJQUNEO0FBQ0EsZ0JBQVk7QUFDWixXQUFPO0FBQUEsRUFDUjtBQUNEOyIsCiAgIm5hbWVzIjogW10KfQo=
