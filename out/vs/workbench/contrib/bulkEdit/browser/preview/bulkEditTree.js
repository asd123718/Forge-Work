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
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { createMatches } from "../../../../../base/common/filters.js";
import { HighlightedLabel } from "../../../../../base/browser/ui/highlightedlabel/highlightedLabel.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { Checkbox } from "../../../../../base/browser/ui/toggle/toggle.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { TextModel } from "../../../../../editor/common/model/textModel.js";
import { BulkFileOperations, BulkFileOperationType } from "./bulkEditPreview.js";
import { FileKind } from "../../../../../platform/files/common/files.js";
import { localize } from "../../../../../nls.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { IconLabel } from "../../../../../base/browser/ui/iconLabel/iconLabel.js";
import { basename } from "../../../../../base/common/resources.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { compare } from "../../../../../base/common/strings.js";
import { URI } from "../../../../../base/common/uri.js";
import { ResourceFileEdit } from "../../../../../editor/browser/services/bulkEditService.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../../../../editor/common/languages/modesRegistry.js";
import { SnippetParser } from "../../../../../editor/contrib/snippet/browser/snippetParser.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import * as css from "../../../../../base/browser/cssValue.js";
import { defaultCheckboxStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
class CategoryElement {
  constructor(parent, category) {
    this.parent = parent;
    this.category = category;
  }
  isChecked() {
    const model = this.parent;
    let checked = true;
    for (const file of this.category.fileOperations) {
      for (const edit of file.originalEdits.values()) {
        checked = checked && model.checked.isChecked(edit);
      }
    }
    return checked;
  }
  setChecked(value) {
    const model = this.parent;
    for (const file of this.category.fileOperations) {
      for (const edit of file.originalEdits.values()) {
        model.checked.updateChecked(edit, value);
      }
    }
  }
}
class FileElement {
  constructor(parent, edit) {
    this.parent = parent;
    this.edit = edit;
  }
  isChecked() {
    const model = this.parent instanceof CategoryElement ? this.parent.parent : this.parent;
    let checked = true;
    if (this.edit.type === BulkFileOperationType.TextEdit) {
      checked = !this.edit.textEdits.every((edit) => !model.checked.isChecked(edit.textEdit));
    }
    for (const edit of this.edit.originalEdits.values()) {
      if (edit instanceof ResourceFileEdit) {
        checked = checked && model.checked.isChecked(edit);
      }
    }
    if (this.parent instanceof CategoryElement && this.edit.type === BulkFileOperationType.TextEdit) {
      for (const category of model.categories) {
        for (const file of category.fileOperations) {
          if (file.uri.toString() === this.edit.uri.toString()) {
            for (const edit of file.originalEdits.values()) {
              if (edit instanceof ResourceFileEdit) {
                checked = checked && model.checked.isChecked(edit);
              }
            }
          }
        }
      }
    }
    return checked;
  }
  setChecked(value) {
    const model = this.parent instanceof CategoryElement ? this.parent.parent : this.parent;
    for (const edit of this.edit.originalEdits.values()) {
      model.checked.updateChecked(edit, value);
    }
    if (this.parent instanceof CategoryElement && this.edit.type !== BulkFileOperationType.TextEdit) {
      for (const category of model.categories) {
        for (const file of category.fileOperations) {
          if (file.uri.toString() === this.edit.uri.toString()) {
            for (const edit of file.originalEdits.values()) {
              model.checked.updateChecked(edit, value);
            }
          }
        }
      }
    }
  }
  isDisabled() {
    if (this.parent instanceof CategoryElement && this.edit.type === BulkFileOperationType.TextEdit) {
      const model = this.parent.parent;
      let checked = true;
      for (const category of model.categories) {
        for (const file of category.fileOperations) {
          if (file.uri.toString() === this.edit.uri.toString()) {
            for (const edit of file.originalEdits.values()) {
              if (edit instanceof ResourceFileEdit) {
                checked = checked && model.checked.isChecked(edit);
              }
            }
          }
        }
      }
      return !checked;
    }
    return false;
  }
}
class TextEditElement {
  constructor(parent, idx, edit, prefix, selecting, inserting, suffix) {
    this.parent = parent;
    this.idx = idx;
    this.edit = edit;
    this.prefix = prefix;
    this.selecting = selecting;
    this.inserting = inserting;
    this.suffix = suffix;
  }
  isChecked() {
    let model = this.parent.parent;
    if (model instanceof CategoryElement) {
      model = model.parent;
    }
    return model.checked.isChecked(this.edit.textEdit);
  }
  setChecked(value) {
    let model = this.parent.parent;
    if (model instanceof CategoryElement) {
      model = model.parent;
    }
    model.checked.updateChecked(this.edit.textEdit, value);
    if (value) {
      for (const edit of this.parent.edit.originalEdits.values()) {
        if (edit instanceof ResourceFileEdit) {
          model.checked.updateChecked(edit, value);
        }
      }
    }
  }
  isDisabled() {
    return this.parent.isDisabled();
  }
}
let BulkEditDataSource = class {
  constructor(_textModelService, _instantiationService) {
    this._textModelService = _textModelService;
    this._instantiationService = _instantiationService;
    this.groupByFile = true;
  }
  hasChildren(element) {
    if (element instanceof FileElement) {
      return element.edit.textEdits.length > 0;
    }
    if (element instanceof TextEditElement) {
      return false;
    }
    return true;
  }
  async getChildren(element) {
    if (element instanceof BulkFileOperations) {
      return this.groupByFile ? element.fileOperations.map((op) => new FileElement(element, op)) : element.categories.map((cat) => new CategoryElement(element, cat));
    }
    if (element instanceof CategoryElement) {
      return Array.from(element.category.fileOperations, (op) => new FileElement(element, op));
    }
    if (element instanceof FileElement && element.edit.textEdits.length > 0) {
      let textModel;
      let textModelDisposable;
      try {
        const ref = await this._textModelService.createModelReference(element.edit.uri);
        textModel = ref.object.textEditorModel;
        textModelDisposable = ref;
      } catch {
        textModel = this._instantiationService.createInstance(TextModel, "", PLAINTEXT_LANGUAGE_ID, TextModel.DEFAULT_CREATION_OPTIONS, null);
        textModelDisposable = textModel;
      }
      const result = element.edit.textEdits.map((edit, idx) => {
        const range = textModel.validateRange(edit.textEdit.textEdit.range);
        const startTokens = textModel.tokenization.getLineTokens(range.startLineNumber);
        let prefixLen = 23;
        for (let idx2 = startTokens.findTokenIndexAtOffset(range.startColumn - 1) - 1; prefixLen < 50 && idx2 >= 0; idx2--) {
          prefixLen = range.startColumn - startTokens.getStartOffset(idx2);
        }
        const endTokens = textModel.tokenization.getLineTokens(range.endLineNumber);
        let suffixLen = 0;
        for (let idx2 = endTokens.findTokenIndexAtOffset(range.endColumn - 1); suffixLen < 50 && idx2 < endTokens.getCount(); idx2++) {
          suffixLen += endTokens.getEndOffset(idx2) - endTokens.getStartOffset(idx2);
        }
        return new TextEditElement(
          element,
          idx,
          edit,
          textModel.getValueInRange(new Range(range.startLineNumber, range.startColumn - prefixLen, range.startLineNumber, range.startColumn)),
          textModel.getValueInRange(range),
          !edit.textEdit.textEdit.insertAsSnippet ? edit.textEdit.textEdit.text : SnippetParser.asInsertText(edit.textEdit.textEdit.text),
          textModel.getValueInRange(new Range(range.endLineNumber, range.endColumn, range.endLineNumber, range.endColumn + suffixLen))
        );
      });
      textModelDisposable.dispose();
      return result;
    }
    return [];
  }
};
BulkEditDataSource = __decorateClass([
  __decorateParam(0, ITextModelService),
  __decorateParam(1, IInstantiationService)
], BulkEditDataSource);
class BulkEditSorter {
  compare(a, b) {
    if (a instanceof FileElement && b instanceof FileElement) {
      return compareBulkFileOperations(a.edit, b.edit);
    }
    if (a instanceof TextEditElement && b instanceof TextEditElement) {
      return Range.compareRangesUsingStarts(a.edit.textEdit.textEdit.range, b.edit.textEdit.textEdit.range);
    }
    return 0;
  }
}
function compareBulkFileOperations(a, b) {
  return compare(a.uri.toString(), b.uri.toString());
}
let BulkEditAccessibilityProvider = class {
  constructor(_labelService) {
    this._labelService = _labelService;
  }
  getWidgetAriaLabel() {
    return localize("bulkEdit", "Bulk Edit");
  }
  getRole(_element) {
    return "checkbox";
  }
  getAriaLabel(element) {
    if (element instanceof FileElement) {
      if (element.edit.textEdits.length > 0) {
        if (element.edit.type & BulkFileOperationType.Rename && element.edit.newUri) {
          return localize(
            "aria.renameAndEdit",
            "Renaming {0} to {1}, also making text edits",
            this._labelService.getUriLabel(element.edit.uri, { relative: true }),
            this._labelService.getUriLabel(element.edit.newUri, { relative: true })
          );
        } else if (element.edit.type & BulkFileOperationType.Create) {
          return localize(
            "aria.createAndEdit",
            "Creating {0}, also making text edits",
            this._labelService.getUriLabel(element.edit.uri, { relative: true })
          );
        } else if (element.edit.type & BulkFileOperationType.Delete) {
          return localize(
            "aria.deleteAndEdit",
            "Deleting {0}, also making text edits",
            this._labelService.getUriLabel(element.edit.uri, { relative: true })
          );
        } else {
          return localize(
            "aria.editOnly",
            "{0}, making text edits",
            this._labelService.getUriLabel(element.edit.uri, { relative: true })
          );
        }
      } else {
        if (element.edit.type & BulkFileOperationType.Rename && element.edit.newUri) {
          return localize(
            "aria.rename",
            "Renaming {0} to {1}",
            this._labelService.getUriLabel(element.edit.uri, { relative: true }),
            this._labelService.getUriLabel(element.edit.newUri, { relative: true })
          );
        } else if (element.edit.type & BulkFileOperationType.Create) {
          return localize(
            "aria.create",
            "Creating {0}",
            this._labelService.getUriLabel(element.edit.uri, { relative: true })
          );
        } else if (element.edit.type & BulkFileOperationType.Delete) {
          return localize(
            "aria.delete",
            "Deleting {0}",
            this._labelService.getUriLabel(element.edit.uri, { relative: true })
          );
        }
      }
    }
    if (element instanceof TextEditElement) {
      if (element.selecting.length > 0 && element.inserting.length > 0) {
        return localize("aria.replace", "line {0}, replacing {1} with {2}", element.edit.textEdit.textEdit.range.startLineNumber, element.selecting, element.inserting);
      } else if (element.selecting.length > 0 && element.inserting.length === 0) {
        return localize("aria.del", "line {0}, removing {1}", element.edit.textEdit.textEdit.range.startLineNumber, element.selecting);
      } else if (element.selecting.length === 0 && element.inserting.length > 0) {
        return localize("aria.insert", "line {0}, inserting {1}", element.edit.textEdit.textEdit.range.startLineNumber, element.selecting);
      }
    }
    return null;
  }
};
BulkEditAccessibilityProvider = __decorateClass([
  __decorateParam(0, ILabelService)
], BulkEditAccessibilityProvider);
class BulkEditIdentityProvider {
  getId(element) {
    if (element instanceof FileElement) {
      return element.edit.uri + (element.parent instanceof CategoryElement ? JSON.stringify(element.parent.category.metadata) : "");
    } else if (element instanceof TextEditElement) {
      return element.parent.edit.uri.toString() + element.idx;
    } else {
      return JSON.stringify(element.category.metadata);
    }
  }
}
class CategoryElementTemplate {
  constructor(container) {
    container.classList.add("category");
    this.icon = document.createElement("div");
    container.appendChild(this.icon);
    this.label = new IconLabel(container);
  }
}
let CategoryElementRenderer = class {
  constructor(_themeService) {
    this._themeService = _themeService;
    this.templateId = CategoryElementRenderer.id;
  }
  renderTemplate(container) {
    return new CategoryElementTemplate(container);
  }
  renderElement(node, _index, template) {
    template.icon.style.setProperty("--background-dark", null);
    template.icon.style.setProperty("--background-light", null);
    template.icon.style.color = "";
    const { metadata } = node.element.category;
    if (ThemeIcon.isThemeIcon(metadata.iconPath)) {
      const className = ThemeIcon.asClassName(metadata.iconPath);
      template.icon.className = className ? `theme-icon ${className}` : "";
      template.icon.style.color = metadata.iconPath.color ? this._themeService.getColorTheme().getColor(metadata.iconPath.color.id)?.toString() ?? "" : "";
    } else if (URI.isUri(metadata.iconPath)) {
      template.icon.className = "uri-icon";
      template.icon.style.setProperty("--background-dark", css.asCSSUrl(metadata.iconPath));
      template.icon.style.setProperty("--background-light", css.asCSSUrl(metadata.iconPath));
    } else if (metadata.iconPath) {
      template.icon.className = "uri-icon";
      template.icon.style.setProperty("--background-dark", css.asCSSUrl(metadata.iconPath.dark));
      template.icon.style.setProperty("--background-light", css.asCSSUrl(metadata.iconPath.light));
    }
    template.label.setLabel(metadata.label, metadata.description, {
      descriptionMatches: createMatches(node.filterData)
    });
  }
  disposeTemplate(template) {
    template.label.dispose();
  }
};
CategoryElementRenderer.id = "CategoryElementRenderer";
CategoryElementRenderer = __decorateClass([
  __decorateParam(0, IThemeService)
], CategoryElementRenderer);
let FileElementTemplate = class {
  constructor(container, resourceLabels, _labelService) {
    this._labelService = _labelService;
    this._disposables = new DisposableStore();
    this._localDisposables = new DisposableStore();
    this._checkbox = this._disposables.add(new Checkbox("", false, defaultCheckboxStyles));
    this._checkbox.domNode.classList.add("edit-checkbox");
    this._checkbox.domNode.tabIndex = -1;
    container.appendChild(this._checkbox.domNode);
    this._label = resourceLabels.create(container, { supportHighlights: true });
    this._details = document.createElement("span");
    this._details.className = "details";
    container.appendChild(this._details);
  }
  dispose() {
    this._localDisposables.dispose();
    this._disposables.dispose();
    this._label.dispose();
  }
  set(element, score) {
    this._localDisposables.clear();
    this._checkbox.checked = element.isChecked();
    if (element.isDisabled()) {
      this._checkbox.disable();
    } else {
      this._checkbox.enable();
    }
    this._checkbox.domNode.tabIndex = -1;
    this._localDisposables.add(this._checkbox.onChange(() => {
      element.setChecked(this._checkbox.checked);
    }));
    if (element.edit.type & BulkFileOperationType.Rename && element.edit.newUri) {
      this._label.setResource({
        resource: element.edit.uri,
        name: localize("rename.label", "{0} \u2192 {1}", this._labelService.getUriLabel(element.edit.uri, { relative: true }), this._labelService.getUriLabel(element.edit.newUri, { relative: true }))
      }, {
        fileDecorations: { colors: true, badges: false }
      });
      this._details.innerText = localize("detail.rename", "(renaming)");
    } else {
      const options = {
        matches: createMatches(score),
        fileKind: FileKind.FILE,
        fileDecorations: { colors: true, badges: false },
        extraClasses: []
      };
      if (element.edit.type & BulkFileOperationType.Create) {
        this._details.innerText = localize("detail.create", "(creating)");
      } else if (element.edit.type & BulkFileOperationType.Delete) {
        this._details.innerText = localize("detail.del", "(deleting)");
        options.extraClasses.push("delete");
      } else {
        this._details.innerText = "";
      }
      this._label.setFile(element.edit.uri, options);
    }
  }
};
FileElementTemplate = __decorateClass([
  __decorateParam(2, ILabelService)
], FileElementTemplate);
let FileElementRenderer = class {
  constructor(_resourceLabels, _labelService) {
    this._resourceLabels = _resourceLabels;
    this._labelService = _labelService;
    this.templateId = FileElementRenderer.id;
  }
  renderTemplate(container) {
    return new FileElementTemplate(container, this._resourceLabels, this._labelService);
  }
  renderElement(node, _index, template) {
    template.set(node.element, node.filterData);
  }
  disposeTemplate(template) {
    template.dispose();
  }
};
FileElementRenderer.id = "FileElementRenderer";
FileElementRenderer = __decorateClass([
  __decorateParam(1, ILabelService)
], FileElementRenderer);
let TextEditElementTemplate = class {
  constructor(container, _themeService) {
    this._themeService = _themeService;
    this._disposables = new DisposableStore();
    this._localDisposables = new DisposableStore();
    container.classList.add("textedit");
    this._checkbox = this._disposables.add(new Checkbox("", false, defaultCheckboxStyles));
    this._checkbox.domNode.classList.add("edit-checkbox");
    this._checkbox.domNode.tabIndex = -1;
    container.appendChild(this._checkbox.domNode);
    this._icon = document.createElement("div");
    container.appendChild(this._icon);
    this._label = this._disposables.add(new HighlightedLabel(container));
  }
  dispose() {
    this._localDisposables.dispose();
    this._disposables.dispose();
  }
  set(element) {
    this._localDisposables.clear();
    this._localDisposables.add(this._checkbox.onChange(() => {
      element.setChecked(this._checkbox.checked);
    }));
    this._checkbox.checked = element.isChecked();
    if (element.isDisabled()) {
      this._checkbox.disable();
    } else {
      this._checkbox.enable();
    }
    this._checkbox.domNode.tabIndex = -1;
    let value = "";
    value += element.prefix;
    value += element.selecting;
    value += element.inserting;
    value += element.suffix;
    const selectHighlight = { start: element.prefix.length, end: element.prefix.length + element.selecting.length, extraClasses: ["remove"] };
    const insertHighlight = { start: selectHighlight.end, end: selectHighlight.end + element.inserting.length, extraClasses: ["insert"] };
    let title;
    const { metadata } = element.edit.textEdit;
    if (metadata && metadata.description) {
      title = localize("title", "{0} - {1}", metadata.label, metadata.description);
    } else if (metadata) {
      title = metadata.label;
    }
    const iconPath = metadata?.iconPath;
    if (!iconPath) {
      this._icon.style.display = "none";
    } else {
      this._icon.style.display = "block";
      this._icon.style.setProperty("--background-dark", null);
      this._icon.style.setProperty("--background-light", null);
      if (ThemeIcon.isThemeIcon(iconPath)) {
        const className = ThemeIcon.asClassName(iconPath);
        this._icon.className = className ? `theme-icon ${className}` : "";
        this._icon.style.color = iconPath.color ? this._themeService.getColorTheme().getColor(iconPath.color.id)?.toString() ?? "" : "";
      } else if (URI.isUri(iconPath)) {
        this._icon.className = "uri-icon";
        this._icon.style.setProperty("--background-dark", css.asCSSUrl(iconPath));
        this._icon.style.setProperty("--background-light", css.asCSSUrl(iconPath));
      } else {
        this._icon.className = "uri-icon";
        this._icon.style.setProperty("--background-dark", css.asCSSUrl(iconPath.dark));
        this._icon.style.setProperty("--background-light", css.asCSSUrl(iconPath.light));
      }
    }
    this._label.set(value, [selectHighlight, insertHighlight], title, true);
    this._icon.title = title || "";
  }
};
TextEditElementTemplate = __decorateClass([
  __decorateParam(1, IThemeService)
], TextEditElementTemplate);
let TextEditElementRenderer = class {
  constructor(_themeService) {
    this._themeService = _themeService;
    this.templateId = TextEditElementRenderer.id;
  }
  renderTemplate(container) {
    return new TextEditElementTemplate(container, this._themeService);
  }
  renderElement({ element }, _index, template) {
    template.set(element);
  }
  disposeTemplate(template) {
    template.dispose();
  }
};
TextEditElementRenderer.id = "TextEditElementRenderer";
TextEditElementRenderer = __decorateClass([
  __decorateParam(0, IThemeService)
], TextEditElementRenderer);
class BulkEditDelegate {
  getHeight() {
    return 23;
  }
  getTemplateId(element) {
    if (element instanceof FileElement) {
      return FileElementRenderer.id;
    } else if (element instanceof TextEditElement) {
      return TextEditElementRenderer.id;
    } else {
      return CategoryElementRenderer.id;
    }
  }
}
class BulkEditNaviLabelProvider {
  getKeyboardNavigationLabel(element) {
    if (element instanceof FileElement) {
      return basename(element.edit.uri);
    } else if (element instanceof CategoryElement) {
      return element.category.metadata.label;
    }
    return void 0;
  }
}
export {
  BulkEditAccessibilityProvider,
  BulkEditDataSource,
  BulkEditDelegate,
  BulkEditIdentityProvider,
  BulkEditNaviLabelProvider,
  BulkEditSorter,
  CategoryElement,
  CategoryElementRenderer,
  FileElement,
  FileElementRenderer,
  TextEditElement,
  TextEditElementRenderer,
  compareBulkFileOperations
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJ1bGtFZGl0XFxicm93c2VyXFxwcmV2aWV3XFxidWxrRWRpdFRyZWUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJQXN5bmNEYXRhU291cmNlLCBJVHJlZVJlbmRlcmVyLCBJVHJlZU5vZGUsIElUcmVlU29ydGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEZ1enp5U2NvcmUsIGNyZWF0ZU1hdGNoZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCB7IElSZXNvdXJjZUxhYmVsLCBSZXNvdXJjZUxhYmVscyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvbGFiZWxzLmpzJztcbmltcG9ydCB7IEhpZ2hsaWdodGVkTGFiZWwsIElIaWdobGlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaGlnaGxpZ2h0ZWRsYWJlbC9oaWdobGlnaHRlZExhYmVsLmpzJztcbmltcG9ydCB7IElJZGVudGl0eVByb3ZpZGVyLCBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSwgSUtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IENoZWNrYm94IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RvZ2dsZS90b2dnbGUuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBCdWxrRmlsZU9wZXJhdGlvbnMsIEJ1bGtGaWxlT3BlcmF0aW9uLCBCdWxrRmlsZU9wZXJhdGlvblR5cGUsIEJ1bGtUZXh0RWRpdCwgQnVsa0NhdGVnb3J5IH0gZnJvbSAnLi9idWxrRWRpdFByZXZpZXcuanMnO1xuaW1wb3J0IHsgRmlsZUtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgdHlwZSB7IElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBJY29uTGFiZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbC5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgY29tcGFyZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFJlc291cmNlRmlsZUVkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9idWxrRWRpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUExBSU5URVhUX0xBTkdVQUdFX0lEIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbW9kZXNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBTbmlwcGV0UGFyc2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvc25pcHBldC9icm93c2VyL3NuaXBwZXRQYXJzZXIuanMnO1xuaW1wb3J0IHsgQXJpYVJvbGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0ICogYXMgY3NzIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9jc3NWYWx1ZS5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0Q2hlY2tib3hTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuXG4vLyAtLS0gVklFVyBNT0RFTFxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGVja2FibGUge1xuXHRpc0NoZWNrZWQoKTogYm9vbGVhbjtcblx0c2V0Q2hlY2tlZCh2YWx1ZTogYm9vbGVhbik6IHZvaWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBDYXRlZ29yeUVsZW1lbnQgaW1wbGVtZW50cyBJQ2hlY2thYmxlIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBwYXJlbnQ6IEJ1bGtGaWxlT3BlcmF0aW9ucyxcblx0XHRyZWFkb25seSBjYXRlZ29yeTogQnVsa0NhdGVnb3J5XG5cdCkgeyB9XG5cblx0aXNDaGVja2VkKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5wYXJlbnQ7XG5cdFx0bGV0IGNoZWNrZWQgPSB0cnVlO1xuXHRcdGZvciAoY29uc3QgZmlsZSBvZiB0aGlzLmNhdGVnb3J5LmZpbGVPcGVyYXRpb25zKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGVkaXQgb2YgZmlsZS5vcmlnaW5hbEVkaXRzLnZhbHVlcygpKSB7XG5cdFx0XHRcdGNoZWNrZWQgPSBjaGVja2VkICYmIG1vZGVsLmNoZWNrZWQuaXNDaGVja2VkKGVkaXQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gY2hlY2tlZDtcblx0fVxuXG5cdHNldENoZWNrZWQodmFsdWU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMucGFyZW50O1xuXHRcdGZvciAoY29uc3QgZmlsZSBvZiB0aGlzLmNhdGVnb3J5LmZpbGVPcGVyYXRpb25zKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGVkaXQgb2YgZmlsZS5vcmlnaW5hbEVkaXRzLnZhbHVlcygpKSB7XG5cdFx0XHRcdG1vZGVsLmNoZWNrZWQudXBkYXRlQ2hlY2tlZChlZGl0LCB2YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBGaWxlRWxlbWVudCBpbXBsZW1lbnRzIElDaGVja2FibGUge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHBhcmVudDogQ2F0ZWdvcnlFbGVtZW50IHwgQnVsa0ZpbGVPcGVyYXRpb25zLFxuXHRcdHJlYWRvbmx5IGVkaXQ6IEJ1bGtGaWxlT3BlcmF0aW9uXG5cdCkgeyB9XG5cblx0aXNDaGVja2VkKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5wYXJlbnQgaW5zdGFuY2VvZiBDYXRlZ29yeUVsZW1lbnQgPyB0aGlzLnBhcmVudC5wYXJlbnQgOiB0aGlzLnBhcmVudDtcblxuXHRcdGxldCBjaGVja2VkID0gdHJ1ZTtcblxuXHRcdC8vIG9ubHkgdGV4dCBlZGl0IGNoaWxkcmVuIC0+IHJlZmxlY3QgY2hpbGRyZW4gc3RhdGVcblx0XHRpZiAodGhpcy5lZGl0LnR5cGUgPT09IEJ1bGtGaWxlT3BlcmF0aW9uVHlwZS5UZXh0RWRpdCkge1xuXHRcdFx0Y2hlY2tlZCA9ICF0aGlzLmVkaXQudGV4dEVkaXRzLmV2ZXJ5KGVkaXQgPT4gIW1vZGVsLmNoZWNrZWQuaXNDaGVja2VkKGVkaXQudGV4dEVkaXQpKTtcblx0XHR9XG5cblx0XHQvLyBtdWx0aXBsZSBmaWxlIGVkaXRzIC0+IHJlZmxlY3Qgc2luZ2xlIHN0YXRlXG5cdFx0Zm9yIChjb25zdCBlZGl0IG9mIHRoaXMuZWRpdC5vcmlnaW5hbEVkaXRzLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAoZWRpdCBpbnN0YW5jZW9mIFJlc291cmNlRmlsZUVkaXQpIHtcblx0XHRcdFx0Y2hlY2tlZCA9IGNoZWNrZWQgJiYgbW9kZWwuY2hlY2tlZC5pc0NoZWNrZWQoZWRpdCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gbXVsdGlwbGUgY2F0ZWdvcmllcyBhbmQgdGV4dCBjaGFuZ2UgLT4gcmVhZCBhbGwgZWxlbWVudHNcblx0XHRpZiAodGhpcy5wYXJlbnQgaW5zdGFuY2VvZiBDYXRlZ29yeUVsZW1lbnQgJiYgdGhpcy5lZGl0LnR5cGUgPT09IEJ1bGtGaWxlT3BlcmF0aW9uVHlwZS5UZXh0RWRpdCkge1xuXHRcdFx0Zm9yIChjb25zdCBjYXRlZ29yeSBvZiBtb2RlbC5jYXRlZ29yaWVzKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgZmlsZSBvZiBjYXRlZ29yeS5maWxlT3BlcmF0aW9ucykge1xuXHRcdFx0XHRcdGlmIChmaWxlLnVyaS50b1N0cmluZygpID09PSB0aGlzLmVkaXQudXJpLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgZWRpdCBvZiBmaWxlLm9yaWdpbmFsRWRpdHMudmFsdWVzKCkpIHtcblx0XHRcdFx0XHRcdFx0aWYgKGVkaXQgaW5zdGFuY2VvZiBSZXNvdXJjZUZpbGVFZGl0KSB7XG5cdFx0XHRcdFx0XHRcdFx0Y2hlY2tlZCA9IGNoZWNrZWQgJiYgbW9kZWwuY2hlY2tlZC5pc0NoZWNrZWQoZWRpdCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gY2hlY2tlZDtcblx0fVxuXG5cdHNldENoZWNrZWQodmFsdWU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMucGFyZW50IGluc3RhbmNlb2YgQ2F0ZWdvcnlFbGVtZW50ID8gdGhpcy5wYXJlbnQucGFyZW50IDogdGhpcy5wYXJlbnQ7XG5cdFx0Zm9yIChjb25zdCBlZGl0IG9mIHRoaXMuZWRpdC5vcmlnaW5hbEVkaXRzLnZhbHVlcygpKSB7XG5cdFx0XHRtb2RlbC5jaGVja2VkLnVwZGF0ZUNoZWNrZWQoZWRpdCwgdmFsdWUpO1xuXHRcdH1cblxuXHRcdC8vIG11bHRpcGxlIGNhdGVnb3JpZXMgYW5kIGZpbGUgY2hhbmdlIC0+IHVwZGF0ZSBhbGwgZWxlbWVudHNcblx0XHRpZiAodGhpcy5wYXJlbnQgaW5zdGFuY2VvZiBDYXRlZ29yeUVsZW1lbnQgJiYgdGhpcy5lZGl0LnR5cGUgIT09IEJ1bGtGaWxlT3BlcmF0aW9uVHlwZS5UZXh0RWRpdCkge1xuXHRcdFx0Zm9yIChjb25zdCBjYXRlZ29yeSBvZiBtb2RlbC5jYXRlZ29yaWVzKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgZmlsZSBvZiBjYXRlZ29yeS5maWxlT3BlcmF0aW9ucykge1xuXHRcdFx0XHRcdGlmIChmaWxlLnVyaS50b1N0cmluZygpID09PSB0aGlzLmVkaXQudXJpLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgZWRpdCBvZiBmaWxlLm9yaWdpbmFsRWRpdHMudmFsdWVzKCkpIHtcblx0XHRcdFx0XHRcdFx0bW9kZWwuY2hlY2tlZC51cGRhdGVDaGVja2VkKGVkaXQsIHZhbHVlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRpc0Rpc2FibGVkKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLnBhcmVudCBpbnN0YW5jZW9mIENhdGVnb3J5RWxlbWVudCAmJiB0aGlzLmVkaXQudHlwZSA9PT0gQnVsa0ZpbGVPcGVyYXRpb25UeXBlLlRleHRFZGl0KSB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMucGFyZW50LnBhcmVudDtcblx0XHRcdGxldCBjaGVja2VkID0gdHJ1ZTtcblx0XHRcdGZvciAoY29uc3QgY2F0ZWdvcnkgb2YgbW9kZWwuY2F0ZWdvcmllcykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGZpbGUgb2YgY2F0ZWdvcnkuZmlsZU9wZXJhdGlvbnMpIHtcblx0XHRcdFx0XHRpZiAoZmlsZS51cmkudG9TdHJpbmcoKSA9PT0gdGhpcy5lZGl0LnVyaS50b1N0cmluZygpKSB7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IGVkaXQgb2YgZmlsZS5vcmlnaW5hbEVkaXRzLnZhbHVlcygpKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChlZGl0IGluc3RhbmNlb2YgUmVzb3VyY2VGaWxlRWRpdCkge1xuXHRcdFx0XHRcdFx0XHRcdGNoZWNrZWQgPSBjaGVja2VkICYmIG1vZGVsLmNoZWNrZWQuaXNDaGVja2VkKGVkaXQpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gIWNoZWNrZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGV4dEVkaXRFbGVtZW50IGltcGxlbWVudHMgSUNoZWNrYWJsZSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgcGFyZW50OiBGaWxlRWxlbWVudCxcblx0XHRyZWFkb25seSBpZHg6IG51bWJlcixcblx0XHRyZWFkb25seSBlZGl0OiBCdWxrVGV4dEVkaXQsXG5cdFx0cmVhZG9ubHkgcHJlZml4OiBzdHJpbmcsIHJlYWRvbmx5IHNlbGVjdGluZzogc3RyaW5nLCByZWFkb25seSBpbnNlcnRpbmc6IHN0cmluZywgcmVhZG9ubHkgc3VmZml4OiBzdHJpbmdcblx0KSB7IH1cblxuXHRpc0NoZWNrZWQoKTogYm9vbGVhbiB7XG5cdFx0bGV0IG1vZGVsID0gdGhpcy5wYXJlbnQucGFyZW50O1xuXHRcdGlmIChtb2RlbCBpbnN0YW5jZW9mIENhdGVnb3J5RWxlbWVudCkge1xuXHRcdFx0bW9kZWwgPSBtb2RlbC5wYXJlbnQ7XG5cdFx0fVxuXHRcdHJldHVybiBtb2RlbC5jaGVja2VkLmlzQ2hlY2tlZCh0aGlzLmVkaXQudGV4dEVkaXQpO1xuXHR9XG5cblx0c2V0Q2hlY2tlZCh2YWx1ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGxldCBtb2RlbCA9IHRoaXMucGFyZW50LnBhcmVudDtcblx0XHRpZiAobW9kZWwgaW5zdGFuY2VvZiBDYXRlZ29yeUVsZW1lbnQpIHtcblx0XHRcdG1vZGVsID0gbW9kZWwucGFyZW50O1xuXHRcdH1cblxuXHRcdC8vIGNoZWNrL3VuY2hlY2sgdGhpcyBlbGVtZW50XG5cdFx0bW9kZWwuY2hlY2tlZC51cGRhdGVDaGVja2VkKHRoaXMuZWRpdC50ZXh0RWRpdCwgdmFsdWUpO1xuXG5cdFx0Ly8gbWFrZSBzdXJlIHBhcmVudCBpcyBjaGVja2VkIHdoZW4gdGhpcyBlbGVtZW50IGlzIGNoZWNrZWQuLi5cblx0XHRpZiAodmFsdWUpIHtcblx0XHRcdGZvciAoY29uc3QgZWRpdCBvZiB0aGlzLnBhcmVudC5lZGl0Lm9yaWdpbmFsRWRpdHMudmFsdWVzKCkpIHtcblx0XHRcdFx0aWYgKGVkaXQgaW5zdGFuY2VvZiBSZXNvdXJjZUZpbGVFZGl0KSB7XG5cdFx0XHRcdFx0KDxCdWxrRmlsZU9wZXJhdGlvbnM+bW9kZWwpLmNoZWNrZWQudXBkYXRlQ2hlY2tlZChlZGl0LCB2YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRpc0Rpc2FibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnBhcmVudC5pc0Rpc2FibGVkKCk7XG5cdH1cbn1cblxuZXhwb3J0IHR5cGUgQnVsa0VkaXRFbGVtZW50ID0gQ2F0ZWdvcnlFbGVtZW50IHwgRmlsZUVsZW1lbnQgfCBUZXh0RWRpdEVsZW1lbnQ7XG5cbi8vIC0tLSBEQVRBIFNPVVJDRVxuXG5leHBvcnQgY2xhc3MgQnVsa0VkaXREYXRhU291cmNlIGltcGxlbWVudHMgSUFzeW5jRGF0YVNvdXJjZTxCdWxrRmlsZU9wZXJhdGlvbnMsIEJ1bGtFZGl0RWxlbWVudD4ge1xuXG5cdHB1YmxpYyBncm91cEJ5RmlsZTogYm9vbGVhbiA9IHRydWU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7IH1cblxuXHRoYXNDaGlsZHJlbihlbGVtZW50OiBCdWxrRmlsZU9wZXJhdGlvbnMgfCBCdWxrRWRpdEVsZW1lbnQpOiBib29sZWFuIHtcblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEZpbGVFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm4gZWxlbWVudC5lZGl0LnRleHRFZGl0cy5sZW5ndGggPiAwO1xuXHRcdH1cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFRleHRFZGl0RWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGFzeW5jIGdldENoaWxkcmVuKGVsZW1lbnQ6IEJ1bGtGaWxlT3BlcmF0aW9ucyB8IEJ1bGtFZGl0RWxlbWVudCk6IFByb21pc2U8QnVsa0VkaXRFbGVtZW50W10+IHtcblxuXHRcdC8vIHJvb3QgLT4gZmlsZS90ZXh0IGVkaXRzXG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBCdWxrRmlsZU9wZXJhdGlvbnMpIHtcblx0XHRcdHJldHVybiB0aGlzLmdyb3VwQnlGaWxlXG5cdFx0XHRcdD8gZWxlbWVudC5maWxlT3BlcmF0aW9ucy5tYXAob3AgPT4gbmV3IEZpbGVFbGVtZW50KGVsZW1lbnQsIG9wKSlcblx0XHRcdFx0OiBlbGVtZW50LmNhdGVnb3JpZXMubWFwKGNhdCA9PiBuZXcgQ2F0ZWdvcnlFbGVtZW50KGVsZW1lbnQsIGNhdCkpO1xuXHRcdH1cblxuXHRcdC8vIGNhdGVnb3J5XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBDYXRlZ29yeUVsZW1lbnQpIHtcblx0XHRcdHJldHVybiBBcnJheS5mcm9tKGVsZW1lbnQuY2F0ZWdvcnkuZmlsZU9wZXJhdGlvbnMsIG9wID0+IG5ldyBGaWxlRWxlbWVudChlbGVtZW50LCBvcCkpO1xuXHRcdH1cblxuXHRcdC8vIGZpbGU6IHRleHQgZWRpdFxuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgRmlsZUVsZW1lbnQgJiYgZWxlbWVudC5lZGl0LnRleHRFZGl0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHQvLyBjb25zdCBwcmV2aWV3VXJpID0gQnVsa0VkaXRQcmV2aWV3UHJvdmlkZXIuYXNQcmV2aWV3VXJpKGVsZW1lbnQuZWRpdC5yZXNvdXJjZSk7XG5cdFx0XHRsZXQgdGV4dE1vZGVsOiBJVGV4dE1vZGVsO1xuXHRcdFx0bGV0IHRleHRNb2RlbERpc3Bvc2FibGU6IElEaXNwb3NhYmxlO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy5fdGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShlbGVtZW50LmVkaXQudXJpKTtcblx0XHRcdFx0dGV4dE1vZGVsID0gcmVmLm9iamVjdC50ZXh0RWRpdG9yTW9kZWw7XG5cdFx0XHRcdHRleHRNb2RlbERpc3Bvc2FibGUgPSByZWY7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0dGV4dE1vZGVsID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGV4dE1vZGVsLCAnJywgUExBSU5URVhUX0xBTkdVQUdFX0lELCBUZXh0TW9kZWwuREVGQVVMVF9DUkVBVElPTl9PUFRJT05TLCBudWxsKTtcblx0XHRcdFx0dGV4dE1vZGVsRGlzcG9zYWJsZSA9IHRleHRNb2RlbDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZWxlbWVudC5lZGl0LnRleHRFZGl0cy5tYXAoKGVkaXQsIGlkeCkgPT4ge1xuXHRcdFx0XHRjb25zdCByYW5nZSA9IHRleHRNb2RlbC52YWxpZGF0ZVJhbmdlKGVkaXQudGV4dEVkaXQudGV4dEVkaXQucmFuZ2UpO1xuXG5cdFx0XHRcdC8vcHJlZml4LW1hdGhcblx0XHRcdFx0Y29uc3Qgc3RhcnRUb2tlbnMgPSB0ZXh0TW9kZWwudG9rZW5pemF0aW9uLmdldExpbmVUb2tlbnMocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdFx0bGV0IHByZWZpeExlbiA9IDIzOyAvLyBkZWZhdWx0IHZhbHVlIGZvciB0aGUgbm8gdG9rZW5zL2dyYW1tYXIgY2FzZVxuXHRcdFx0XHRmb3IgKGxldCBpZHggPSBzdGFydFRva2Vucy5maW5kVG9rZW5JbmRleEF0T2Zmc2V0KHJhbmdlLnN0YXJ0Q29sdW1uIC0gMSkgLSAxOyBwcmVmaXhMZW4gPCA1MCAmJiBpZHggPj0gMDsgaWR4LS0pIHtcblx0XHRcdFx0XHRwcmVmaXhMZW4gPSByYW5nZS5zdGFydENvbHVtbiAtIHN0YXJ0VG9rZW5zLmdldFN0YXJ0T2Zmc2V0KGlkeCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvL3N1ZmZpeC1tYXRoXG5cdFx0XHRcdGNvbnN0IGVuZFRva2VucyA9IHRleHRNb2RlbC50b2tlbml6YXRpb24uZ2V0TGluZVRva2VucyhyYW5nZS5lbmRMaW5lTnVtYmVyKTtcblx0XHRcdFx0bGV0IHN1ZmZpeExlbiA9IDA7XG5cdFx0XHRcdGZvciAobGV0IGlkeCA9IGVuZFRva2Vucy5maW5kVG9rZW5JbmRleEF0T2Zmc2V0KHJhbmdlLmVuZENvbHVtbiAtIDEpOyBzdWZmaXhMZW4gPCA1MCAmJiBpZHggPCBlbmRUb2tlbnMuZ2V0Q291bnQoKTsgaWR4KyspIHtcblx0XHRcdFx0XHRzdWZmaXhMZW4gKz0gZW5kVG9rZW5zLmdldEVuZE9mZnNldChpZHgpIC0gZW5kVG9rZW5zLmdldFN0YXJ0T2Zmc2V0KGlkeCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gbmV3IFRleHRFZGl0RWxlbWVudChcblx0XHRcdFx0XHRlbGVtZW50LFxuXHRcdFx0XHRcdGlkeCxcblx0XHRcdFx0XHRlZGl0LFxuXHRcdFx0XHRcdHRleHRNb2RlbC5nZXRWYWx1ZUluUmFuZ2UobmV3IFJhbmdlKHJhbmdlLnN0YXJ0TGluZU51bWJlciwgcmFuZ2Uuc3RhcnRDb2x1bW4gLSBwcmVmaXhMZW4sIHJhbmdlLnN0YXJ0TGluZU51bWJlciwgcmFuZ2Uuc3RhcnRDb2x1bW4pKSxcblx0XHRcdFx0XHR0ZXh0TW9kZWwuZ2V0VmFsdWVJblJhbmdlKHJhbmdlKSxcblx0XHRcdFx0XHQhZWRpdC50ZXh0RWRpdC50ZXh0RWRpdC5pbnNlcnRBc1NuaXBwZXQgPyBlZGl0LnRleHRFZGl0LnRleHRFZGl0LnRleHQgOiBTbmlwcGV0UGFyc2VyLmFzSW5zZXJ0VGV4dChlZGl0LnRleHRFZGl0LnRleHRFZGl0LnRleHQpLFxuXHRcdFx0XHRcdHRleHRNb2RlbC5nZXRWYWx1ZUluUmFuZ2UobmV3IFJhbmdlKHJhbmdlLmVuZExpbmVOdW1iZXIsIHJhbmdlLmVuZENvbHVtbiwgcmFuZ2UuZW5kTGluZU51bWJlciwgcmFuZ2UuZW5kQ29sdW1uICsgc3VmZml4TGVuKSlcblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXh0TW9kZWxEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFtdO1xuXHR9XG59XG5cblxuZXhwb3J0IGNsYXNzIEJ1bGtFZGl0U29ydGVyIGltcGxlbWVudHMgSVRyZWVTb3J0ZXI8QnVsa0VkaXRFbGVtZW50PiB7XG5cblx0Y29tcGFyZShhOiBCdWxrRWRpdEVsZW1lbnQsIGI6IEJ1bGtFZGl0RWxlbWVudCk6IG51bWJlciB7XG5cdFx0aWYgKGEgaW5zdGFuY2VvZiBGaWxlRWxlbWVudCAmJiBiIGluc3RhbmNlb2YgRmlsZUVsZW1lbnQpIHtcblx0XHRcdHJldHVybiBjb21wYXJlQnVsa0ZpbGVPcGVyYXRpb25zKGEuZWRpdCwgYi5lZGl0KTtcblx0XHR9XG5cblx0XHRpZiAoYSBpbnN0YW5jZW9mIFRleHRFZGl0RWxlbWVudCAmJiBiIGluc3RhbmNlb2YgVGV4dEVkaXRFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm4gUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzKGEuZWRpdC50ZXh0RWRpdC50ZXh0RWRpdC5yYW5nZSwgYi5lZGl0LnRleHRFZGl0LnRleHRFZGl0LnJhbmdlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gMDtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY29tcGFyZUJ1bGtGaWxlT3BlcmF0aW9ucyhhOiBCdWxrRmlsZU9wZXJhdGlvbiwgYjogQnVsa0ZpbGVPcGVyYXRpb24pOiBudW1iZXIge1xuXHRyZXR1cm4gY29tcGFyZShhLnVyaS50b1N0cmluZygpLCBiLnVyaS50b1N0cmluZygpKTtcbn1cblxuLy8gLS0tIEFDQ0VTU0lcblxuZXhwb3J0IGNsYXNzIEJ1bGtFZGl0QWNjZXNzaWJpbGl0eVByb3ZpZGVyIGltcGxlbWVudHMgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXI8QnVsa0VkaXRFbGVtZW50PiB7XG5cblx0Y29uc3RydWN0b3IoQElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlKSB7IH1cblxuXHRnZXRXaWRnZXRBcmlhTGFiZWwoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ2J1bGtFZGl0JywgXCJCdWxrIEVkaXRcIik7XG5cdH1cblxuXHRnZXRSb2xlKF9lbGVtZW50OiBCdWxrRWRpdEVsZW1lbnQpOiBBcmlhUm9sZSB7XG5cdFx0cmV0dXJuICdjaGVja2JveCc7XG5cdH1cblxuXHRnZXRBcmlhTGFiZWwoZWxlbWVudDogQnVsa0VkaXRFbGVtZW50KTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBGaWxlRWxlbWVudCkge1xuXHRcdFx0aWYgKGVsZW1lbnQuZWRpdC50ZXh0RWRpdHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRpZiAoZWxlbWVudC5lZGl0LnR5cGUgJiBCdWxrRmlsZU9wZXJhdGlvblR5cGUuUmVuYW1lICYmIGVsZW1lbnQuZWRpdC5uZXdVcmkpIHtcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoXG5cdFx0XHRcdFx0XHQnYXJpYS5yZW5hbWVBbmRFZGl0JywgXCJSZW5hbWluZyB7MH0gdG8gezF9LCBhbHNvIG1ha2luZyB0ZXh0IGVkaXRzXCIsXG5cdFx0XHRcdFx0XHR0aGlzLl9sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZWxlbWVudC5lZGl0LnVyaSwgeyByZWxhdGl2ZTogdHJ1ZSB9KSwgdGhpcy5fbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGVsZW1lbnQuZWRpdC5uZXdVcmksIHsgcmVsYXRpdmU6IHRydWUgfSlcblx0XHRcdFx0XHQpO1xuXG5cdFx0XHRcdH0gZWxzZSBpZiAoZWxlbWVudC5lZGl0LnR5cGUgJiBCdWxrRmlsZU9wZXJhdGlvblR5cGUuQ3JlYXRlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKFxuXHRcdFx0XHRcdFx0J2FyaWEuY3JlYXRlQW5kRWRpdCcsIFwiQ3JlYXRpbmcgezB9LCBhbHNvIG1ha2luZyB0ZXh0IGVkaXRzXCIsXG5cdFx0XHRcdFx0XHR0aGlzLl9sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZWxlbWVudC5lZGl0LnVyaSwgeyByZWxhdGl2ZTogdHJ1ZSB9KVxuXHRcdFx0XHRcdCk7XG5cblx0XHRcdFx0fSBlbHNlIGlmIChlbGVtZW50LmVkaXQudHlwZSAmIEJ1bGtGaWxlT3BlcmF0aW9uVHlwZS5EZWxldGUpIHtcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoXG5cdFx0XHRcdFx0XHQnYXJpYS5kZWxldGVBbmRFZGl0JywgXCJEZWxldGluZyB7MH0sIGFsc28gbWFraW5nIHRleHQgZWRpdHNcIixcblx0XHRcdFx0XHRcdHRoaXMuX2xhYmVsU2VydmljZS5nZXRVcmlMYWJlbChlbGVtZW50LmVkaXQudXJpLCB7IHJlbGF0aXZlOiB0cnVlIH0pLFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKFxuXHRcdFx0XHRcdFx0J2FyaWEuZWRpdE9ubHknLCBcInswfSwgbWFraW5nIHRleHQgZWRpdHNcIixcblx0XHRcdFx0XHRcdHRoaXMuX2xhYmVsU2VydmljZS5nZXRVcmlMYWJlbChlbGVtZW50LmVkaXQudXJpLCB7IHJlbGF0aXZlOiB0cnVlIH0pLFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKGVsZW1lbnQuZWRpdC50eXBlICYgQnVsa0ZpbGVPcGVyYXRpb25UeXBlLlJlbmFtZSAmJiBlbGVtZW50LmVkaXQubmV3VXJpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKFxuXHRcdFx0XHRcdFx0J2FyaWEucmVuYW1lJywgXCJSZW5hbWluZyB7MH0gdG8gezF9XCIsXG5cdFx0XHRcdFx0XHR0aGlzLl9sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZWxlbWVudC5lZGl0LnVyaSwgeyByZWxhdGl2ZTogdHJ1ZSB9KSwgdGhpcy5fbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGVsZW1lbnQuZWRpdC5uZXdVcmksIHsgcmVsYXRpdmU6IHRydWUgfSlcblx0XHRcdFx0XHQpO1xuXG5cdFx0XHRcdH0gZWxzZSBpZiAoZWxlbWVudC5lZGl0LnR5cGUgJiBCdWxrRmlsZU9wZXJhdGlvblR5cGUuQ3JlYXRlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKFxuXHRcdFx0XHRcdFx0J2FyaWEuY3JlYXRlJywgXCJDcmVhdGluZyB7MH1cIixcblx0XHRcdFx0XHRcdHRoaXMuX2xhYmVsU2VydmljZS5nZXRVcmlMYWJlbChlbGVtZW50LmVkaXQudXJpLCB7IHJlbGF0aXZlOiB0cnVlIH0pXG5cdFx0XHRcdFx0KTtcblxuXHRcdFx0XHR9IGVsc2UgaWYgKGVsZW1lbnQuZWRpdC50eXBlICYgQnVsa0ZpbGVPcGVyYXRpb25UeXBlLkRlbGV0ZSkge1xuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZShcblx0XHRcdFx0XHRcdCdhcmlhLmRlbGV0ZScsIFwiRGVsZXRpbmcgezB9XCIsXG5cdFx0XHRcdFx0XHR0aGlzLl9sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZWxlbWVudC5lZGl0LnVyaSwgeyByZWxhdGl2ZTogdHJ1ZSB9KSxcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBUZXh0RWRpdEVsZW1lbnQpIHtcblx0XHRcdGlmIChlbGVtZW50LnNlbGVjdGluZy5sZW5ndGggPiAwICYmIGVsZW1lbnQuaW5zZXJ0aW5nLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Ly8gZWRpdDogcmVwbGFjZVxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2FyaWEucmVwbGFjZScsIFwibGluZSB7MH0sIHJlcGxhY2luZyB7MX0gd2l0aCB7Mn1cIiwgZWxlbWVudC5lZGl0LnRleHRFZGl0LnRleHRFZGl0LnJhbmdlLnN0YXJ0TGluZU51bWJlciwgZWxlbWVudC5zZWxlY3RpbmcsIGVsZW1lbnQuaW5zZXJ0aW5nKTtcblx0XHRcdH0gZWxzZSBpZiAoZWxlbWVudC5zZWxlY3RpbmcubGVuZ3RoID4gMCAmJiBlbGVtZW50Lmluc2VydGluZy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0Ly8gZWRpdDogZGVsZXRlXG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnYXJpYS5kZWwnLCBcImxpbmUgezB9LCByZW1vdmluZyB7MX1cIiwgZWxlbWVudC5lZGl0LnRleHRFZGl0LnRleHRFZGl0LnJhbmdlLnN0YXJ0TGluZU51bWJlciwgZWxlbWVudC5zZWxlY3RpbmcpO1xuXHRcdFx0fSBlbHNlIGlmIChlbGVtZW50LnNlbGVjdGluZy5sZW5ndGggPT09IDAgJiYgZWxlbWVudC5pbnNlcnRpbmcubGVuZ3RoID4gMCkge1xuXHRcdFx0XHQvLyBlZGl0OiBpbnNlcnRcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdhcmlhLmluc2VydCcsIFwibGluZSB7MH0sIGluc2VydGluZyB7MX1cIiwgZWxlbWVudC5lZGl0LnRleHRFZGl0LnRleHRFZGl0LnJhbmdlLnN0YXJ0TGluZU51bWJlciwgZWxlbWVudC5zZWxlY3RpbmcpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG59XG5cbi8vIC0tLSBJREVOVFxuXG5leHBvcnQgY2xhc3MgQnVsa0VkaXRJZGVudGl0eVByb3ZpZGVyIGltcGxlbWVudHMgSUlkZW50aXR5UHJvdmlkZXI8QnVsa0VkaXRFbGVtZW50PiB7XG5cblx0Z2V0SWQoZWxlbWVudDogQnVsa0VkaXRFbGVtZW50KTogeyB0b1N0cmluZygpOiBzdHJpbmcgfSB7XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBGaWxlRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQuZWRpdC51cmkgKyAoZWxlbWVudC5wYXJlbnQgaW5zdGFuY2VvZiBDYXRlZ29yeUVsZW1lbnQgPyBKU09OLnN0cmluZ2lmeShlbGVtZW50LnBhcmVudC5jYXRlZ29yeS5tZXRhZGF0YSkgOiAnJyk7XG5cdFx0fSBlbHNlIGlmIChlbGVtZW50IGluc3RhbmNlb2YgVGV4dEVkaXRFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm4gZWxlbWVudC5wYXJlbnQuZWRpdC51cmkudG9TdHJpbmcoKSArIGVsZW1lbnQuaWR4O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoZWxlbWVudC5jYXRlZ29yeS5tZXRhZGF0YSk7XG5cdFx0fVxuXHR9XG59XG5cbi8vIC0tLSBSRU5ERVJFUlxuXG5jbGFzcyBDYXRlZ29yeUVsZW1lbnRUZW1wbGF0ZSB7XG5cblx0cmVhZG9ubHkgaWNvbjogSFRNTERpdkVsZW1lbnQ7XG5cdHJlYWRvbmx5IGxhYmVsOiBJY29uTGFiZWw7XG5cblx0Y29uc3RydWN0b3IoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjYXRlZ29yeScpO1xuXHRcdHRoaXMuaWNvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLmljb24pO1xuXHRcdHRoaXMubGFiZWwgPSBuZXcgSWNvbkxhYmVsKGNvbnRhaW5lcik7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENhdGVnb3J5RWxlbWVudFJlbmRlcmVyIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxDYXRlZ29yeUVsZW1lbnQsIEZ1enp5U2NvcmUsIENhdGVnb3J5RWxlbWVudFRlbXBsYXRlPiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IGlkOiBzdHJpbmcgPSAnQ2F0ZWdvcnlFbGVtZW50UmVuZGVyZXInO1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZyA9IENhdGVnb3J5RWxlbWVudFJlbmRlcmVyLmlkO1xuXG5cdGNvbnN0cnVjdG9yKEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSkgeyB9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IENhdGVnb3J5RWxlbWVudFRlbXBsYXRlIHtcblx0XHRyZXR1cm4gbmV3IENhdGVnb3J5RWxlbWVudFRlbXBsYXRlKGNvbnRhaW5lcik7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxDYXRlZ29yeUVsZW1lbnQsIEZ1enp5U2NvcmU+LCBfaW5kZXg6IG51bWJlciwgdGVtcGxhdGU6IENhdGVnb3J5RWxlbWVudFRlbXBsYXRlKTogdm9pZCB7XG5cblx0XHR0ZW1wbGF0ZS5pY29uLnN0eWxlLnNldFByb3BlcnR5KCctLWJhY2tncm91bmQtZGFyaycsIG51bGwpO1xuXHRcdHRlbXBsYXRlLmljb24uc3R5bGUuc2V0UHJvcGVydHkoJy0tYmFja2dyb3VuZC1saWdodCcsIG51bGwpO1xuXHRcdHRlbXBsYXRlLmljb24uc3R5bGUuY29sb3IgPSAnJztcblxuXHRcdGNvbnN0IHsgbWV0YWRhdGEgfSA9IG5vZGUuZWxlbWVudC5jYXRlZ29yeTtcblx0XHRpZiAoVGhlbWVJY29uLmlzVGhlbWVJY29uKG1ldGFkYXRhLmljb25QYXRoKSkge1xuXHRcdFx0Ly8gY3NzXG5cdFx0XHRjb25zdCBjbGFzc05hbWUgPSBUaGVtZUljb24uYXNDbGFzc05hbWUobWV0YWRhdGEuaWNvblBhdGgpO1xuXHRcdFx0dGVtcGxhdGUuaWNvbi5jbGFzc05hbWUgPSBjbGFzc05hbWUgPyBgdGhlbWUtaWNvbiAke2NsYXNzTmFtZX1gIDogJyc7XG5cdFx0XHR0ZW1wbGF0ZS5pY29uLnN0eWxlLmNvbG9yID0gbWV0YWRhdGEuaWNvblBhdGguY29sb3IgPyB0aGlzLl90aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLmdldENvbG9yKG1ldGFkYXRhLmljb25QYXRoLmNvbG9yLmlkKT8udG9TdHJpbmcoKSA/PyAnJyA6ICcnO1xuXG5cblx0XHR9IGVsc2UgaWYgKFVSSS5pc1VyaShtZXRhZGF0YS5pY29uUGF0aCkpIHtcblx0XHRcdC8vIGJhY2tncm91bmQtaW1hZ2Vcblx0XHRcdHRlbXBsYXRlLmljb24uY2xhc3NOYW1lID0gJ3VyaS1pY29uJztcblx0XHRcdHRlbXBsYXRlLmljb24uc3R5bGUuc2V0UHJvcGVydHkoJy0tYmFja2dyb3VuZC1kYXJrJywgY3NzLmFzQ1NTVXJsKG1ldGFkYXRhLmljb25QYXRoKSk7XG5cdFx0XHR0ZW1wbGF0ZS5pY29uLnN0eWxlLnNldFByb3BlcnR5KCctLWJhY2tncm91bmQtbGlnaHQnLCBjc3MuYXNDU1NVcmwobWV0YWRhdGEuaWNvblBhdGgpKTtcblxuXHRcdH0gZWxzZSBpZiAobWV0YWRhdGEuaWNvblBhdGgpIHtcblx0XHRcdC8vIGJhY2tncm91bmQtaW1hZ2Vcblx0XHRcdHRlbXBsYXRlLmljb24uY2xhc3NOYW1lID0gJ3VyaS1pY29uJztcblx0XHRcdHRlbXBsYXRlLmljb24uc3R5bGUuc2V0UHJvcGVydHkoJy0tYmFja2dyb3VuZC1kYXJrJywgY3NzLmFzQ1NTVXJsKG1ldGFkYXRhLmljb25QYXRoLmRhcmspKTtcblx0XHRcdHRlbXBsYXRlLmljb24uc3R5bGUuc2V0UHJvcGVydHkoJy0tYmFja2dyb3VuZC1saWdodCcsIGNzcy5hc0NTU1VybChtZXRhZGF0YS5pY29uUGF0aC5saWdodCkpO1xuXHRcdH1cblxuXHRcdHRlbXBsYXRlLmxhYmVsLnNldExhYmVsKG1ldGFkYXRhLmxhYmVsLCBtZXRhZGF0YS5kZXNjcmlwdGlvbiwge1xuXHRcdFx0ZGVzY3JpcHRpb25NYXRjaGVzOiBjcmVhdGVNYXRjaGVzKG5vZGUuZmlsdGVyRGF0YSksXG5cdFx0fSk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGU6IENhdGVnb3J5RWxlbWVudFRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGUubGFiZWwuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIEZpbGVFbGVtZW50VGVtcGxhdGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2NhbERpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoZWNrYm94OiBDaGVja2JveDtcblx0cHJpdmF0ZSByZWFkb25seSBfbGFiZWw6IElSZXNvdXJjZUxhYmVsO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZXRhaWxzOiBIVE1MU3BhbkVsZW1lbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRyZXNvdXJjZUxhYmVsczogUmVzb3VyY2VMYWJlbHMsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHQpIHtcblxuXHRcdHRoaXMuX2NoZWNrYm94ID0gdGhpcy5fZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGVja2JveCgnJywgZmFsc2UsIGRlZmF1bHRDaGVja2JveFN0eWxlcykpO1xuXHRcdHRoaXMuX2NoZWNrYm94LmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnZWRpdC1jaGVja2JveCcpO1xuXHRcdHRoaXMuX2NoZWNrYm94LmRvbU5vZGUudGFiSW5kZXggPSAtMTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5fY2hlY2tib3guZG9tTm9kZSk7XG5cblx0XHR0aGlzLl9sYWJlbCA9IHJlc291cmNlTGFiZWxzLmNyZWF0ZShjb250YWluZXIsIHsgc3VwcG9ydEhpZ2hsaWdodHM6IHRydWUgfSk7XG5cblx0XHR0aGlzLl9kZXRhaWxzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuXHRcdHRoaXMuX2RldGFpbHMuY2xhc3NOYW1lID0gJ2RldGFpbHMnO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLl9kZXRhaWxzKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fbG9jYWxEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2xhYmVsLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHNldChlbGVtZW50OiBGaWxlRWxlbWVudCwgc2NvcmU6IEZ1enp5U2NvcmUgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9sb2NhbERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHR0aGlzLl9jaGVja2JveC5jaGVja2VkID0gZWxlbWVudC5pc0NoZWNrZWQoKTtcblx0XHRpZiAoZWxlbWVudC5pc0Rpc2FibGVkKCkpIHtcblx0XHRcdHRoaXMuX2NoZWNrYm94LmRpc2FibGUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fY2hlY2tib3guZW5hYmxlKCk7XG5cdFx0fVxuXHRcdC8vIGVuYWJsZSgpL2Rpc2FibGUoKSByZXNldCB0aGUgdGFiSW5kZXg7IGtlZXAgdGhlIGNoZWNrYm94IG91dCBvZiB0aGUgdHJlZSdzIHRhYiBvcmRlclxuXHRcdHRoaXMuX2NoZWNrYm94LmRvbU5vZGUudGFiSW5kZXggPSAtMTtcblx0XHR0aGlzLl9sb2NhbERpc3Bvc2FibGVzLmFkZCh0aGlzLl9jaGVja2JveC5vbkNoYW5nZSgoKSA9PiB7XG5cdFx0XHRlbGVtZW50LnNldENoZWNrZWQodGhpcy5fY2hlY2tib3guY2hlY2tlZCk7XG5cdFx0fSkpO1xuXG5cdFx0aWYgKGVsZW1lbnQuZWRpdC50eXBlICYgQnVsa0ZpbGVPcGVyYXRpb25UeXBlLlJlbmFtZSAmJiBlbGVtZW50LmVkaXQubmV3VXJpKSB7XG5cdFx0XHQvLyByZW5hbWU6IG9sZE5hbWUgXHUyMTkyIG5ld05hbWVcblx0XHRcdHRoaXMuX2xhYmVsLnNldFJlc291cmNlKHtcblx0XHRcdFx0cmVzb3VyY2U6IGVsZW1lbnQuZWRpdC51cmksXG5cdFx0XHRcdG5hbWU6IGxvY2FsaXplKCdyZW5hbWUubGFiZWwnLCBcInswfSBcdTIxOTIgezF9XCIsIHRoaXMuX2xhYmVsU2VydmljZS5nZXRVcmlMYWJlbChlbGVtZW50LmVkaXQudXJpLCB7IHJlbGF0aXZlOiB0cnVlIH0pLCB0aGlzLl9sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZWxlbWVudC5lZGl0Lm5ld1VyaSwgeyByZWxhdGl2ZTogdHJ1ZSB9KSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGZpbGVEZWNvcmF0aW9uczogeyBjb2xvcnM6IHRydWUsIGJhZGdlczogZmFsc2UgfVxuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMuX2RldGFpbHMuaW5uZXJUZXh0ID0gbG9jYWxpemUoJ2RldGFpbC5yZW5hbWUnLCBcIihyZW5hbWluZylcIik7XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gY3JlYXRlLCBkZWxldGUsIGVkaXQ6IE5BTUVcblx0XHRcdGNvbnN0IG9wdGlvbnMgPSB7XG5cdFx0XHRcdG1hdGNoZXM6IGNyZWF0ZU1hdGNoZXMoc2NvcmUpLFxuXHRcdFx0XHRmaWxlS2luZDogRmlsZUtpbmQuRklMRSxcblx0XHRcdFx0ZmlsZURlY29yYXRpb25zOiB7IGNvbG9yczogdHJ1ZSwgYmFkZ2VzOiBmYWxzZSB9LFxuXHRcdFx0XHRleHRyYUNsYXNzZXM6IDxzdHJpbmdbXT5bXVxuXHRcdFx0fTtcblx0XHRcdGlmIChlbGVtZW50LmVkaXQudHlwZSAmIEJ1bGtGaWxlT3BlcmF0aW9uVHlwZS5DcmVhdGUpIHtcblx0XHRcdFx0dGhpcy5fZGV0YWlscy5pbm5lclRleHQgPSBsb2NhbGl6ZSgnZGV0YWlsLmNyZWF0ZScsIFwiKGNyZWF0aW5nKVwiKTtcblx0XHRcdH0gZWxzZSBpZiAoZWxlbWVudC5lZGl0LnR5cGUgJiBCdWxrRmlsZU9wZXJhdGlvblR5cGUuRGVsZXRlKSB7XG5cdFx0XHRcdHRoaXMuX2RldGFpbHMuaW5uZXJUZXh0ID0gbG9jYWxpemUoJ2RldGFpbC5kZWwnLCBcIihkZWxldGluZylcIik7XG5cdFx0XHRcdG9wdGlvbnMuZXh0cmFDbGFzc2VzLnB1c2goJ2RlbGV0ZScpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fZGV0YWlscy5pbm5lclRleHQgPSAnJztcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xhYmVsLnNldEZpbGUoZWxlbWVudC5lZGl0LnVyaSwgb3B0aW9ucyk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBGaWxlRWxlbWVudFJlbmRlcmVyIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxGaWxlRWxlbWVudCwgRnV6enlTY29yZSwgRmlsZUVsZW1lbnRUZW1wbGF0ZT4ge1xuXG5cdHN0YXRpYyByZWFkb25seSBpZDogc3RyaW5nID0gJ0ZpbGVFbGVtZW50UmVuZGVyZXInO1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZyA9IEZpbGVFbGVtZW50UmVuZGVyZXIuaWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcmVzb3VyY2VMYWJlbHM6IFJlc291cmNlTGFiZWxzLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0KSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogRmlsZUVsZW1lbnRUZW1wbGF0ZSB7XG5cdFx0cmV0dXJuIG5ldyBGaWxlRWxlbWVudFRlbXBsYXRlKGNvbnRhaW5lciwgdGhpcy5fcmVzb3VyY2VMYWJlbHMsIHRoaXMuX2xhYmVsU2VydmljZSk7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxGaWxlRWxlbWVudCwgRnV6enlTY29yZT4sIF9pbmRleDogbnVtYmVyLCB0ZW1wbGF0ZTogRmlsZUVsZW1lbnRUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlLnNldChub2RlLmVsZW1lbnQsIG5vZGUuZmlsdGVyRGF0YSk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGU6IEZpbGVFbGVtZW50VGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgVGV4dEVkaXRFbGVtZW50VGVtcGxhdGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2NhbERpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoZWNrYm94OiBDaGVja2JveDtcblx0cHJpdmF0ZSByZWFkb25seSBfaWNvbjogSFRNTERpdkVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsOiBIaWdobGlnaHRlZExhYmVsO1xuXG5cdGNvbnN0cnVjdG9yKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSkge1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCd0ZXh0ZWRpdCcpO1xuXG5cdFx0dGhpcy5fY2hlY2tib3ggPSB0aGlzLl9kaXNwb3NhYmxlcy5hZGQobmV3IENoZWNrYm94KCcnLCBmYWxzZSwgZGVmYXVsdENoZWNrYm94U3R5bGVzKSk7XG5cdFx0dGhpcy5fY2hlY2tib3guZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdlZGl0LWNoZWNrYm94Jyk7XG5cdFx0dGhpcy5fY2hlY2tib3guZG9tTm9kZS50YWJJbmRleCA9IC0xO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLl9jaGVja2JveC5kb21Ob2RlKTtcblxuXHRcdHRoaXMuX2ljb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5faWNvbik7XG5cblx0XHR0aGlzLl9sYWJlbCA9IHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChuZXcgSGlnaGxpZ2h0ZWRMYWJlbChjb250YWluZXIpKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fbG9jYWxEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG5cblx0c2V0KGVsZW1lbnQ6IFRleHRFZGl0RWxlbWVudCkge1xuXHRcdHRoaXMuX2xvY2FsRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdHRoaXMuX2xvY2FsRGlzcG9zYWJsZXMuYWRkKHRoaXMuX2NoZWNrYm94Lm9uQ2hhbmdlKCgpID0+IHtcblx0XHRcdGVsZW1lbnQuc2V0Q2hlY2tlZCh0aGlzLl9jaGVja2JveC5jaGVja2VkKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fY2hlY2tib3guY2hlY2tlZCA9IGVsZW1lbnQuaXNDaGVja2VkKCk7XG5cdFx0aWYgKGVsZW1lbnQuaXNEaXNhYmxlZCgpKSB7XG5cdFx0XHR0aGlzLl9jaGVja2JveC5kaXNhYmxlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2NoZWNrYm94LmVuYWJsZSgpO1xuXHRcdH1cblx0XHQvLyBlbmFibGUoKS9kaXNhYmxlKCkgcmVzZXQgdGhlIHRhYkluZGV4OyBrZWVwIHRoZSBjaGVja2JveCBvdXQgb2YgdGhlIHRyZWUncyB0YWIgb3JkZXJcblx0XHR0aGlzLl9jaGVja2JveC5kb21Ob2RlLnRhYkluZGV4ID0gLTE7XG5cblx0XHRsZXQgdmFsdWUgPSAnJztcblx0XHR2YWx1ZSArPSBlbGVtZW50LnByZWZpeDtcblx0XHR2YWx1ZSArPSBlbGVtZW50LnNlbGVjdGluZztcblx0XHR2YWx1ZSArPSBlbGVtZW50Lmluc2VydGluZztcblx0XHR2YWx1ZSArPSBlbGVtZW50LnN1ZmZpeDtcblxuXHRcdGNvbnN0IHNlbGVjdEhpZ2hsaWdodDogSUhpZ2hsaWdodCA9IHsgc3RhcnQ6IGVsZW1lbnQucHJlZml4Lmxlbmd0aCwgZW5kOiBlbGVtZW50LnByZWZpeC5sZW5ndGggKyBlbGVtZW50LnNlbGVjdGluZy5sZW5ndGgsIGV4dHJhQ2xhc3NlczogWydyZW1vdmUnXSB9O1xuXHRcdGNvbnN0IGluc2VydEhpZ2hsaWdodDogSUhpZ2hsaWdodCA9IHsgc3RhcnQ6IHNlbGVjdEhpZ2hsaWdodC5lbmQsIGVuZDogc2VsZWN0SGlnaGxpZ2h0LmVuZCArIGVsZW1lbnQuaW5zZXJ0aW5nLmxlbmd0aCwgZXh0cmFDbGFzc2VzOiBbJ2luc2VydCddIH07XG5cblx0XHRsZXQgdGl0bGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCB7IG1ldGFkYXRhIH0gPSBlbGVtZW50LmVkaXQudGV4dEVkaXQ7XG5cdFx0aWYgKG1ldGFkYXRhICYmIG1ldGFkYXRhLmRlc2NyaXB0aW9uKSB7XG5cdFx0XHR0aXRsZSA9IGxvY2FsaXplKCd0aXRsZScsIFwiezB9IC0gezF9XCIsIG1ldGFkYXRhLmxhYmVsLCBtZXRhZGF0YS5kZXNjcmlwdGlvbik7XG5cdFx0fSBlbHNlIGlmIChtZXRhZGF0YSkge1xuXHRcdFx0dGl0bGUgPSBtZXRhZGF0YS5sYWJlbDtcblx0XHR9XG5cblx0XHRjb25zdCBpY29uUGF0aCA9IG1ldGFkYXRhPy5pY29uUGF0aDtcblx0XHRpZiAoIWljb25QYXRoKSB7XG5cdFx0XHR0aGlzLl9pY29uLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2ljb24uc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG5cblx0XHRcdHRoaXMuX2ljb24uc3R5bGUuc2V0UHJvcGVydHkoJy0tYmFja2dyb3VuZC1kYXJrJywgbnVsbCk7XG5cdFx0XHR0aGlzLl9pY29uLnN0eWxlLnNldFByb3BlcnR5KCctLWJhY2tncm91bmQtbGlnaHQnLCBudWxsKTtcblxuXHRcdFx0aWYgKFRoZW1lSWNvbi5pc1RoZW1lSWNvbihpY29uUGF0aCkpIHtcblx0XHRcdFx0Ly8gY3NzXG5cdFx0XHRcdGNvbnN0IGNsYXNzTmFtZSA9IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShpY29uUGF0aCk7XG5cdFx0XHRcdHRoaXMuX2ljb24uY2xhc3NOYW1lID0gY2xhc3NOYW1lID8gYHRoZW1lLWljb24gJHtjbGFzc05hbWV9YCA6ICcnO1xuXHRcdFx0XHR0aGlzLl9pY29uLnN0eWxlLmNvbG9yID0gaWNvblBhdGguY29sb3IgPyB0aGlzLl90aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLmdldENvbG9yKGljb25QYXRoLmNvbG9yLmlkKT8udG9TdHJpbmcoKSA/PyAnJyA6ICcnO1xuXG5cblx0XHRcdH0gZWxzZSBpZiAoVVJJLmlzVXJpKGljb25QYXRoKSkge1xuXHRcdFx0XHQvLyBiYWNrZ3JvdW5kLWltYWdlXG5cdFx0XHRcdHRoaXMuX2ljb24uY2xhc3NOYW1lID0gJ3VyaS1pY29uJztcblx0XHRcdFx0dGhpcy5faWNvbi5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1iYWNrZ3JvdW5kLWRhcmsnLCBjc3MuYXNDU1NVcmwoaWNvblBhdGgpKTtcblx0XHRcdFx0dGhpcy5faWNvbi5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1iYWNrZ3JvdW5kLWxpZ2h0JywgY3NzLmFzQ1NTVXJsKGljb25QYXRoKSk7XG5cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIGJhY2tncm91bmQtaW1hZ2Vcblx0XHRcdFx0dGhpcy5faWNvbi5jbGFzc05hbWUgPSAndXJpLWljb24nO1xuXHRcdFx0XHR0aGlzLl9pY29uLnN0eWxlLnNldFByb3BlcnR5KCctLWJhY2tncm91bmQtZGFyaycsIGNzcy5hc0NTU1VybChpY29uUGF0aC5kYXJrKSk7XG5cdFx0XHRcdHRoaXMuX2ljb24uc3R5bGUuc2V0UHJvcGVydHkoJy0tYmFja2dyb3VuZC1saWdodCcsIGNzcy5hc0NTU1VybChpY29uUGF0aC5saWdodCkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2xhYmVsLnNldCh2YWx1ZSwgW3NlbGVjdEhpZ2hsaWdodCwgaW5zZXJ0SGlnaGxpZ2h0XSwgdGl0bGUsIHRydWUpO1xuXHRcdHRoaXMuX2ljb24udGl0bGUgPSB0aXRsZSB8fCAnJztcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGV4dEVkaXRFbGVtZW50UmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPFRleHRFZGl0RWxlbWVudCwgRnV6enlTY29yZSwgVGV4dEVkaXRFbGVtZW50VGVtcGxhdGU+IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgaWQgPSAnVGV4dEVkaXRFbGVtZW50UmVuZGVyZXInO1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZyA9IFRleHRFZGl0RWxlbWVudFJlbmRlcmVyLmlkO1xuXG5cdGNvbnN0cnVjdG9yKEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSkgeyB9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IFRleHRFZGl0RWxlbWVudFRlbXBsYXRlIHtcblx0XHRyZXR1cm4gbmV3IFRleHRFZGl0RWxlbWVudFRlbXBsYXRlKGNvbnRhaW5lciwgdGhpcy5fdGhlbWVTZXJ2aWNlKTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoeyBlbGVtZW50IH06IElUcmVlTm9kZTxUZXh0RWRpdEVsZW1lbnQsIEZ1enp5U2NvcmU+LCBfaW5kZXg6IG51bWJlciwgdGVtcGxhdGU6IFRleHRFZGl0RWxlbWVudFRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGUuc2V0KGVsZW1lbnQpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlOiBUZXh0RWRpdEVsZW1lbnRUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQnVsa0VkaXREZWxlZ2F0ZSBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPEJ1bGtFZGl0RWxlbWVudD4ge1xuXG5cdGdldEhlaWdodCgpOiBudW1iZXIge1xuXHRcdHJldHVybiAyMztcblx0fVxuXG5cdGdldFRlbXBsYXRlSWQoZWxlbWVudDogQnVsa0VkaXRFbGVtZW50KTogc3RyaW5nIHtcblxuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgRmlsZUVsZW1lbnQpIHtcblx0XHRcdHJldHVybiBGaWxlRWxlbWVudFJlbmRlcmVyLmlkO1xuXHRcdH0gZWxzZSBpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFRleHRFZGl0RWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIFRleHRFZGl0RWxlbWVudFJlbmRlcmVyLmlkO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gQ2F0ZWdvcnlFbGVtZW50UmVuZGVyZXIuaWQ7XG5cdFx0fVxuXHR9XG59XG5cblxuZXhwb3J0IGNsYXNzIEJ1bGtFZGl0TmF2aUxhYmVsUHJvdmlkZXIgaW1wbGVtZW50cyBJS2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcjxCdWxrRWRpdEVsZW1lbnQ+IHtcblxuXHRnZXRLZXlib2FyZE5hdmlnYXRpb25MYWJlbChlbGVtZW50OiBCdWxrRWRpdEVsZW1lbnQpIHtcblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEZpbGVFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm4gYmFzZW5hbWUoZWxlbWVudC5lZGl0LnVyaSk7XG5cdFx0fSBlbHNlIGlmIChlbGVtZW50IGluc3RhbmNlb2YgQ2F0ZWdvcnlFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm4gZWxlbWVudC5jYXRlZ29yeS5tZXRhZGF0YS5sYWJlbDtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFxQixxQkFBcUI7QUFFMUMsU0FBUyx3QkFBb0M7QUFFN0MsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQXNCLHVCQUF1QjtBQUM3QyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLG9CQUF1Qyw2QkFBeUQ7QUFDekcsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxxQkFBcUI7QUFFOUIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUNwQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQjtBQUU5QixTQUFTLDZCQUE2QjtBQUN0QyxZQUFZLFNBQVM7QUFDckIsU0FBUyw2QkFBNkI7QUFTL0IsTUFBTSxnQkFBc0M7QUFBQSxFQUVsRCxZQUNVLFFBQ0EsVUFDUjtBQUZRO0FBQ0E7QUFBQSxFQUNOO0FBQUEsRUFFSixZQUFxQjtBQUNwQixVQUFNLFFBQVEsS0FBSztBQUNuQixRQUFJLFVBQVU7QUFDZCxlQUFXLFFBQVEsS0FBSyxTQUFTLGdCQUFnQjtBQUNoRCxpQkFBVyxRQUFRLEtBQUssY0FBYyxPQUFPLEdBQUc7QUFDL0Msa0JBQVUsV0FBVyxNQUFNLFFBQVEsVUFBVSxJQUFJO0FBQUEsTUFDbEQ7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLFdB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LHFCQUFxQixJQUFJLFNBQVMsUUFBUSxDQUFDO0FBQ3hFLGFBQUssTUFBTSxNQUFNLFlBQVksc0JBQXNCLElBQUksU0FBUyxRQUFRLENBQUM7QUFBQSxNQUUxRSxPQUFPO0FBRU4sYUFBSyxNQUFNLFlBQVk7QUFDdkIsYUFBSyxNQUFNLE1BQU0sWUFBWSxxQkFBcUIsSUFBSSxTQUFTLFNBQVMsSUFBSSxDQUFDO0FBQzdFLGFBQUssTUFBTSxNQUFNLFlBQVksc0JBQXNCLElBQUksU0FBUyxTQUFTLEtBQUssQ0FBQztBQUFBLE1BQ2hGO0FBQUEsSUFDRDtBQUVBLFNBQUssT0FBTyxJQUFJLE9BQU8sQ0FBQyxpQkFBaUIsZUFBZSxHQUFHLE9BQU8sSUFBSTtBQUN0RSxTQUFLLE1BQU0sUUFBUSxTQUFTO0FBQUEsRUFDN0I7QUFDRDtBQTdGTSwwQkFBTjtBQUFBLEVBU3NDO0FBQUEsR0FUaEM7QUErRkMsSUFBTSwwQkFBTixNQUE2RztBQUFBLEVBTW5ILFlBQTRDLGVBQThCO0FBQTlCO0FBRjVDLFNBQVMsYUFBcUIsd0JBQXdCO0FBQUEsRUFFc0I7QUFBQSxFQUU1RSxlQUFlLFdBQWlEO0FBQy9ELFdBQU8sSUFBSSx3QkFBd0IsV0FBVyxLQUFLLGFBQWE7QUFBQSxFQUNqRTtBQUFBLEVBRUEsY0FBYyxFQUFFLFFBQVEsR0FBMkMsUUFBZ0IsVUFBeUM7QUFDM0gsYUFBUyxJQUFJLE9BQU87QUFBQSxFQUNyQjtBQUFBLEVBRUEsZ0JBQWdCLFVBQXlDO0FBQ3hELGFBQVMsUUFBUTtBQUFBLEVBQ2xCO0FBQ0Q7QUFuQmEsd0JBRUksS0FBSztBQUZULDBCQUFOO0FBQUEsRUFNTztBQUFBLEdBTkQ7QUFxQk4sTUFBTSxpQkFBa0U7QUFBQSxFQUU5RSxZQUFvQjtBQUNuQixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsY0FBYyxTQUFrQztBQUUvQyxRQUFJLG1CQUFtQixhQUFhO0FBQ25DLGFBQU8sb0JBQW9CO0FBQUEsSUFDNUIsV0FBVyxtQkFBbUIsaUJBQWlCO0FBQzlDLGFBQU8sd0JBQXdCO0FBQUEsSUFDaEMsT0FBTztBQUNOLGFBQU8sd0JBQXdCO0FBQUEsSUFDaEM7QUFBQSxFQUNEO0FBQ0Q7QUFHTyxNQUFNLDBCQUF1RjtBQUFBLEVBRW5HLDJCQUEyQixTQUEwQjtBQUNwRCxRQUFJLG1CQUFtQixhQUFhO0FBQ25DLGFBQU8sU0FBUyxRQUFRLEtBQUssR0FBRztBQUFBLElBQ2pDLFdBQVcsbUJBQW1CLGlCQUFpQjtBQUM5QyxhQUFPLFFBQVEsU0FBUyxTQUFTO0FBQUEsSUFDbEM7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUNEOyIsCiAgIm5hbWVzIjogWyJpZHgiXQp9Cg==
