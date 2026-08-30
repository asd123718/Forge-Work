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
import { localize } from "../../nls.js";
import { URI } from "../../base/common/uri.js";
import { dirname, isEqual, basenameOrAuthority } from "../../base/common/resources.js";
import { IconLabel } from "../../base/browser/ui/iconLabel/iconLabel.js";
import { ILanguageService } from "../../editor/common/languages/language.js";
import { IWorkspaceContextService } from "../../platform/workspace/common/workspace.js";
import { IConfigurationService } from "../../platform/configuration/common/configuration.js";
import { IModelService } from "../../editor/common/services/model.js";
import { ITextFileService } from "../services/textfile/common/textfiles.js";
import { IDecorationsService } from "../services/decorations/common/decorations.js";
import { Schemas } from "../../base/common/network.js";
import { FileKind, FILES_ASSOCIATIONS_CONFIG } from "../../platform/files/common/files.js";
import { IThemeService } from "../../platform/theme/common/themeService.js";
import { Event, Emitter } from "../../base/common/event.js";
import { ILabelService } from "../../platform/label/common/label.js";
import { getIconClasses } from "../../editor/common/services/getIconClasses.js";
import { Disposable, dispose, MutableDisposable } from "../../base/common/lifecycle.js";
import { IInstantiationService } from "../../platform/instantiation/common/instantiation.js";
import { normalizeDriveLetter } from "../../base/common/labels.js";
import { INotebookDocumentService, extractCellOutputDetails } from "../services/notebook/common/notebookDocumentService.js";
function toResource(props) {
  if (!props?.resource) {
    return void 0;
  }
  if (URI.isUri(props.resource)) {
    return props.resource;
  }
  return props.resource.primary;
}
const DEFAULT_LABELS_CONTAINER = {
  onDidChangeVisibility: Event.None
};
let ResourceLabels = class extends Disposable {
  constructor(container, instantiationService, configurationService, modelService, workspaceService, languageService, decorationsService, themeService, labelService, textFileService) {
    super();
    this.instantiationService = instantiationService;
    this.configurationService = configurationService;
    this.modelService = modelService;
    this.workspaceService = workspaceService;
    this.languageService = languageService;
    this.decorationsService = decorationsService;
    this.themeService = themeService;
    this.labelService = labelService;
    this.textFileService = textFileService;
    this._onDidChangeDecorations = this._register(new Emitter());
    this.widgets = [];
    this.labels = [];
    this.registerListeners(container);
  }
  get onDidChangeDecorations() {
    return this._onDidChangeDecorations.event;
  }
  registerListeners(container) {
    this._register(container.onDidChangeVisibility((visible) => {
      this.widgets.forEach((widget) => widget.notifyVisibilityChanged(visible));
    }));
    this._register(this.languageService.onDidChange(() => this.widgets.forEach((widget) => widget.notifyExtensionsRegistered())));
    this._register(this.modelService.onModelLanguageChanged((e) => {
      if (!e.model.uri) {
        return;
      }
      this.widgets.forEach((widget) => widget.notifyModelLanguageChanged(e.model));
    }));
    this._register(this.modelService.onModelAdded((model) => {
      if (!model.uri) {
        return;
      }
      this.widgets.forEach((widget) => widget.notifyModelAdded(model));
    }));
    this._register(this.workspaceService.onDidChangeWorkspaceFolders(() => {
      this.widgets.forEach((widget) => widget.notifyWorkspaceFoldersChange());
    }));
    this._register(this.decorationsService.onDidChangeDecorations((e) => {
      let notifyDidChangeDecorations = false;
      this.widgets.forEach((widget) => {
        if (widget.notifyFileDecorationsChanges(e)) {
          notifyDidChangeDecorations = true;
        }
      });
      if (notifyDidChangeDecorations) {
        this._onDidChangeDecorations.fire();
      }
    }));
    this._register(this.themeService.onDidColorThemeChange(() => this.widgets.forEach((widget) => widget.notifyThemeChange())));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(FILES_ASSOCIATIONS_CONFIG)) {
        this.widgets.forEach((widget) => widget.notifyFileAssociationsChange());
      }
    }));
    this._register(this.labelService.onDidChangeFormatters((e) => {
      this.widgets.forEach((widget) => widget.notifyFormattersChange(e.scheme));
    }));
    this._register(this.textFileService.untitled.onDidChangeLabel((model) => {
      this.widgets.forEach((widget) => widget.notifyUntitledLabelChange(model.resource));
    }));
  }
  get(index) {
    return this.labels[index];
  }
  create(container, options) {
    const widget = this.instantiationService.createInstance(ResourceLabelWidget, container, options);
    const label = {
      element: widget.element,
      get onDidRender() {
        return widget.onDidRender;
      },
      setLabel: (label2, description, options2) => widget.setLabel(label2, description, options2),
      setResource: (label2, options2) => widget.setResource(label2, options2),
      setFile: (resource, options2) => widget.setFile(resource, options2),
      clear: () => widget.clear(),
      dispose: () => this.disposeWidget(widget)
    };
    this.labels.push(label);
    this.widgets.push(widget);
    return label;
  }
  disposeWidget(widget) {
    const index = this.widgets.indexOf(widget);
    if (index > -1) {
      this.widgets.splice(index, 1);
      this.labels.splice(index, 1);
    }
    dispose(widget);
  }
  clear() {
    this.widgets = dispose(this.widgets);
    this.labels = [];
  }
  dispose() {
    super.dispose();
    this.clear();
  }
};
ResourceLabels = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IModelService),
  __decorateParam(4, IWorkspaceContextService),
  __decorateParam(5, ILanguageService),
  __decorateParam(6, IDecorationsService),
  __decorateParam(7, IThemeService),
  __decorateParam(8, ILabelService),
  __decorateParam(9, ITextFileService)
], ResourceLabels);
let ResourceLabel = class extends ResourceLabels {
  get element() {
    return this.label;
  }
  constructor(container, options, instantiationService, configurationService, modelService, workspaceService, languageService, decorationsService, themeService, labelService, textFileService) {
    super(DEFAULT_LABELS_CONTAINER, instantiationService, configurationService, modelService, workspaceService, languageService, decorationsService, themeService, labelService, textFileService);
    this.label = this._register(this.create(container, options));
  }
};
ResourceLabel = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IModelService),
  __decorateParam(5, IWorkspaceContextService),
  __decorateParam(6, ILanguageService),
  __decorateParam(7, IDecorationsService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, ILabelService),
  __decorateParam(10, ITextFileService)
], ResourceLabel);
var Redraw = /* @__PURE__ */ ((Redraw2) => {
  Redraw2[Redraw2["Basic"] = 1] = "Basic";
  Redraw2[Redraw2["Full"] = 2] = "Full";
  return Redraw2;
})(Redraw || {});
let ResourceLabelWidget = class extends IconLabel {
  constructor(container, options, languageService, modelService, decorationsService, labelService, textFileService, contextService, notebookDocumentService) {
    super(container, options);
    this.languageService = languageService;
    this.modelService = modelService;
    this.decorationsService = decorationsService;
    this.labelService = labelService;
    this.textFileService = textFileService;
    this.contextService = contextService;
    this.notebookDocumentService = notebookDocumentService;
    this._onDidRender = this._register(new Emitter());
    this.label = void 0;
    this.decoration = this._register(new MutableDisposable());
    this.options = void 0;
    this.computedIconClasses = void 0;
    this.computedLanguageId = void 0;
    this.computedPathLabel = void 0;
    this.computedWorkspaceFolderLabel = void 0;
    this.needsRedraw = void 0;
    this.isHidden = false;
  }
  get onDidRender() {
    return this._onDidRender.event;
  }
  notifyVisibilityChanged(visible) {
    if (visible === this.isHidden) {
      this.isHidden = !visible;
      if (visible && this.needsRedraw) {
        this.render({
          updateIcon: this.needsRedraw === 2 /* Full */,
          updateDecoration: this.needsRedraw === 2 /* Full */
        });
        this.needsRedraw = void 0;
      }
    }
  }
  notifyModelLanguageChanged(model) {
    this.handleModelEvent(model);
  }
  notifyModelAdded(model) {
    this.handleModelEvent(model);
  }
  handleModelEvent(model) {
    const resource = toResource(this.label);
    if (!resource) {
      return;
    }
    if (isEqual(model.uri, resource)) {
      if (this.computedLanguageId !== model.getLanguageId()) {
        this.computedLanguageId = model.getLanguageId();
        this.render({ updateIcon: true, updateDecoration: false });
      }
    }
  }
  notifyFileDecorationsChanges(e) {
    if (!this.options) {
      return false;
    }
    const resource = toResource(this.label);
    if (!resource) {
      return false;
    }
    if (this.options.fileDecorations && e.affectsResource(resource)) {
      return this.render({ updateIcon: false, updateDecoration: true });
    }
    return false;
  }
  notifyExtensionsRegistered() {
    this.render({ updateIcon: true, updateDecoration: false });
  }
  notifyThemeChange() {
    this.render({ updateIcon: false, updateDecoration: false });
  }
  notifyFileAssociationsChange() {
    this.render({ updateIcon: true, updateDecoration: false });
  }
  notifyFormattersChange(scheme) {
    if (toResource(this.label)?.scheme === scheme) {
      this.render({ updateIcon: false, updateDecoration: false });
    }
  }
  notifyUntitledLabelChange(resource) {
    if (isEqual(resource, toResource(this.label))) {
      this.render({ updateIcon: false, updateDecoration: false });
    }
  }
  notifyWorkspaceFoldersChange() {
    if (typeof this.computedWorkspaceFolderLabel === "string") {
      const resource = toResource(this.label);
      if (URI.isUri(resource) && this.label?.name === this.computedWorkspaceFolderLabel) {
        this.setFile(resource, this.options);
      }
    }
  }
  setFile(resource, options) {
    const hideLabel = options?.hideLabel;
    let name;
    if (!hideLabel) {
      if (options?.fileKind === FileKind.ROOT_FOLDER) {
        const workspaceFolder = this.contextService.getWorkspaceFolder(resource);
        if (workspaceFolder) {
          name = workspaceFolder.name;
          this.computedWorkspaceFolderLabel = name;
        }
      }
      if (!name) {
        name = normalizeDriveLetter(basenameOrAuthority(resource));
      }
    }
    let description;
    if (!options?.hidePath) {
      const descriptionCandidate = this.labelService.getUriLabel(dirname(resource), { relative: true });
      if (descriptionCandidate && descriptionCandidate !== ".") {
        description = descriptionCandidate;
      }
    }
    this.setResource({ resource, name, description, range: options?.range }, options);
  }
  setResource(label, options = /* @__PURE__ */ Object.create(null)) {
    const resource = toResource(label);
    const isSideBySideEditor = label?.resource && !URI.isUri(label.resource);
    if (!options.forceLabel && !isSideBySideEditor && resource?.scheme === Schemas.untitled) {
      const untitledModel = this.textFileService.untitled.get(resource);
      if (untitledModel && !untitledModel.hasAssociatedFilePath) {
        if (typeof label.name === "string") {
          label.name = untitledModel.name;
        }
        if (typeof label.description === "string") {
          const untitledDescription = untitledModel.resource.path;
          if (label.name !== untitledDescription) {
            label.description = untitledDescription;
          } else {
            label.description = void 0;
          }
        }
        const untitledTitle = untitledModel.resource.path;
        if (untitledModel.name !== untitledTitle) {
          options.title = `${untitledModel.name} \u2022 ${untitledTitle}`;
        } else {
          options.title = untitledTitle;
        }
      }
    }
    if (!options.forceLabel && !isSideBySideEditor && resource?.scheme === Schemas.vscodeNotebookCell) {
      const notebookDocument = this.notebookDocumentService.getNotebook(resource);
      const cellIndex = notebookDocument?.getCellIndex(resource);
      if (notebookDocument && cellIndex !== void 0 && typeof label.name === "string") {
        options.title = localize("notebookCellLabel", "{0} \u2022 Cell {1}", label.name, `${cellIndex + 1}`);
      }
      if (typeof label.name === "string" && notebookDocument && cellIndex !== void 0 && typeof label.name === "string") {
        label.name = localize("notebookCellLabel", "{0} \u2022 Cell {1}", label.name, `${cellIndex + 1}`);
      }
    }
    if (!options.forceLabel && !isSideBySideEditor && resource?.scheme === Schemas.vscodeNotebookCellOutput) {
      const notebookDocument = this.notebookDocumentService.getNotebook(resource);
      const outputUriData = extractCellOutputDetails(resource);
      if (outputUriData?.cellFragment) {
        if (!outputUriData.notebook) {
          return;
        }
        const cellUri = outputUriData.notebook.with({
          scheme: Schemas.vscodeNotebookCell,
          fragment: outputUriData.cellFragment
        });
        const cellIndex = notebookDocument?.getCellIndex(cellUri);
        const outputIndex = outputUriData.outputIndex;
        if (cellIndex !== void 0 && outputIndex !== void 0 && typeof label.name === "string") {
          label.name = localize(
            "notebookCellOutputLabel",
            "{0} \u2022 Cell {1} \u2022 Output {2}",
            label.name,
            `${cellIndex + 1}`,
            `${outputIndex + 1}`
          );
        } else if (cellIndex !== void 0 && typeof label.name === "string") {
          label.name = localize(
            "notebookCellOutputLabelSimple",
            "{0} \u2022 Cell {1} \u2022 Output",
            label.name,
            `${cellIndex + 1}`
          );
        }
      }
    }
    if (options.namePrefix) {
      if (typeof label.name === "string") {
        label.name = options.namePrefix + label.name;
      } else if (Array.isArray(label.name) && label.name.length > 0) {
        label.name = [options.namePrefix + label.name[0], ...label.name.slice(1)];
      }
    }
    if (options.nameSuffix) {
      if (typeof label.name === "string") {
        label.name = label.name + options.nameSuffix;
      } else if (Array.isArray(label.name) && label.name.length > 0) {
        label.name = [...label.name.slice(0, label.name.length - 1), label.name[label.name.length - 1] + options.nameSuffix];
      }
    }
    const hasResourceChanged = this.hasResourceChanged(label);
    const hasPathLabelChanged = hasResourceChanged || this.hasPathLabelChanged(label);
    const hasFileKindChanged = this.hasFileKindChanged(options);
    const hasIconChanged = this.hasIconChanged(options);
    this.label = label;
    this.options = options;
    if (hasResourceChanged) {
      this.computedLanguageId = void 0;
    }
    if (hasPathLabelChanged) {
      this.computedPathLabel = void 0;
    }
    this.render({
      updateIcon: hasResourceChanged || hasFileKindChanged || hasIconChanged,
      updateDecoration: hasResourceChanged || hasFileKindChanged
    });
  }
  hasFileKindChanged(newOptions) {
    const newFileKind = newOptions?.fileKind;
    const oldFileKind = this.options?.fileKind;
    return newFileKind !== oldFileKind;
  }
  hasResourceChanged(newLabel) {
    const newResource = toResource(newLabel);
    const oldResource = toResource(this.label);
    if (newResource && oldResource) {
      return newResource.toString() !== oldResource.toString();
    }
    if (!newResource && !oldResource) {
      return false;
    }
    return true;
  }
  hasPathLabelChanged(newLabel) {
    const newResource = toResource(newLabel);
    return !!newResource && this.computedPathLabel !== this.labelService.getUriLabel(newResource);
  }
  hasIconChanged(newOptions) {
    return this.options?.icon !== newOptions?.icon;
  }
  clear() {
    this.label = void 0;
    this.options = void 0;
    this.computedLanguageId = void 0;
    this.computedIconClasses = void 0;
    this.computedPathLabel = void 0;
    this.setLabel("");
  }
  render(options) {
    if (this.isHidden) {
      if (this.needsRedraw !== 2 /* Full */) {
        this.needsRedraw = options.updateIcon || options.updateDecoration ? 2 /* Full */ : 1 /* Basic */;
      }
      return false;
    }
    if (options.updateIcon) {
      this.computedIconClasses = void 0;
    }
    if (!this.label) {
      return false;
    }
    const iconLabelOptions = {
      title: "",
      bold: this.options?.bold,
      italic: this.options?.italic,
      strikethrough: this.options?.strikethrough,
      matches: this.options?.matches,
      descriptionMatches: this.options?.descriptionMatches,
      extraClasses: [],
      separator: this.options?.separator,
      domId: this.options?.domId,
      disabledCommand: this.options?.disabledCommand,
      labelEscapeNewLines: this.options?.labelEscapeNewLines,
      descriptionTitle: this.options?.descriptionTitle,
      supportIcons: this.options?.supportIcons
    };
    const resource = toResource(this.label);
    if (this.options?.title !== void 0) {
      iconLabelOptions.title = this.options.title;
    }
    if (resource && resource.scheme !== Schemas.data && (!this.options?.title || typeof this.options.title !== "string" && !this.options.title.markdownNotSupportedFallback)) {
      if (!this.computedPathLabel) {
        this.computedPathLabel = this.labelService.getUriLabel(resource);
      }
      if (!iconLabelOptions.title || typeof iconLabelOptions.title === "string") {
        iconLabelOptions.title = this.computedPathLabel;
      } else if (!iconLabelOptions.title.markdownNotSupportedFallback) {
        iconLabelOptions.title.markdownNotSupportedFallback = this.computedPathLabel;
      }
    }
    if (this.options && !this.options.hideIcon) {
      if (!this.computedIconClasses) {
        this.computedIconClasses = getIconClasses(this.modelService, this.languageService, resource, this.options.fileKind, this.options.icon);
      }
      if (URI.isUri(this.options.icon)) {
        iconLabelOptions.iconPath = this.options.icon;
      }
      iconLabelOptions.extraClasses = this.computedIconClasses.slice(0);
    }
    if (this.options?.extraClasses) {
      iconLabelOptions.extraClasses.push(...this.options.extraClasses);
    }
    if (this.options?.fileDecorations && resource) {
      if (options.updateDecoration) {
        this.decoration.value = this.decorationsService.getDecoration(resource, this.options.fileKind !== FileKind.FILE);
      }
      const decoration = this.decoration.value;
      if (decoration) {
        if (decoration.tooltip) {
          if (typeof iconLabelOptions.title === "string") {
            iconLabelOptions.title = `${iconLabelOptions.title} \u2022 ${decoration.tooltip}`;
          } else if (typeof iconLabelOptions.title?.markdown === "string") {
            const title = `${iconLabelOptions.title.markdown} \u2022 ${decoration.tooltip}`;
            iconLabelOptions.title = { markdown: title, markdownNotSupportedFallback: title };
          }
        }
        if (decoration.strikethrough) {
          iconLabelOptions.strikethrough = true;
        }
        if (this.options.fileDecorations.colors) {
          iconLabelOptions.extraClasses.push(decoration.labelClassName);
        }
        if (this.options.fileDecorations.badges) {
          iconLabelOptions.extraClasses.push(decoration.badgeClassName);
          iconLabelOptions.extraClasses.push(decoration.iconClassName);
        }
      }
    }
    if (this.label.range) {
      iconLabelOptions.suffix = this.label.range.startLineNumber !== this.label.range.endLineNumber ? `:${this.label.range.startLineNumber}-${this.label.range.endLineNumber}` : `:${this.label.range.startLineNumber}`;
    }
    this.setLabel(this.label.name ?? "", this.label.description, iconLabelOptions);
    this._onDidRender.fire();
    return true;
  }
  dispose() {
    super.dispose();
    this.label = void 0;
    this.options = void 0;
    this.computedLanguageId = void 0;
    this.computedIconClasses = void 0;
    this.computedPathLabel = void 0;
    this.computedWorkspaceFolderLabel = void 0;
  }
};
ResourceLabelWidget = __decorateClass([
  __decorateParam(2, ILanguageService),
  __decorateParam(3, IModelService),
  __decorateParam(4, IDecorationsService),
  __decorateParam(5, ILabelService),
  __decorateParam(6, ITextFileService),
  __decorateParam(7, IWorkspaceContextService),
  __decorateParam(8, INotebookDocumentService)
], ResourceLabelWidget);
export {
  DEFAULT_LABELS_CONTAINER,
  ResourceLabel,
  ResourceLabels
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXGxhYmVscy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBkaXJuYW1lLCBpc0VxdWFsLCBiYXNlbmFtZU9yQXV0aG9yaXR5IH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IEljb25MYWJlbCwgSUljb25MYWJlbFZhbHVlT3B0aW9ucywgSUljb25MYWJlbENyZWF0aW9uT3B0aW9ucyB9IGZyb20gJy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IElUZXh0RmlsZVNlcnZpY2UgfSBmcm9tICcuLi9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dGZpbGVzLmpzJztcbmltcG9ydCB7IElEZWNvcmF0aW9uLCBJRGVjb3JhdGlvbnNTZXJ2aWNlLCBJUmVzb3VyY2VEZWNvcmF0aW9uQ2hhbmdlRXZlbnQgfSBmcm9tICcuLi9zZXJ2aWNlcy9kZWNvcmF0aW9ucy9jb21tb24vZGVjb3JhdGlvbnMuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgRmlsZUtpbmQsIEZJTEVTX0FTU09DSUFUSU9OU19DT05GSUcgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXZlbnQsIEVtaXR0ZXIgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IGdldEljb25DbGFzc2VzIH0gZnJvbSAnLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9nZXRJY29uQ2xhc3Nlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBkaXNwb3NlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBub3JtYWxpemVEcml2ZUxldHRlciB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UgfSBmcm9tICcuLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0RvY3VtZW50U2VydmljZSwgZXh0cmFjdENlbGxPdXRwdXREZXRhaWxzIH0gZnJvbSAnLi4vc2VydmljZXMvbm90ZWJvb2svY29tbW9uL25vdGVib29rRG9jdW1lbnRTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJUmVzb3VyY2VMYWJlbFByb3BzIHtcblx0cmVzb3VyY2U/OiBVUkkgfCB7IHByaW1hcnk/OiBVUkk7IHNlY29uZGFyeT86IFVSSSB9O1xuXHRuYW1lPzogc3RyaW5nIHwgc3RyaW5nW107XG5cdHJhbmdlPzogSVJhbmdlO1xuXHRkZXNjcmlwdGlvbj86IHN0cmluZztcbn1cblxuZnVuY3Rpb24gdG9SZXNvdXJjZShwcm9wczogSVJlc291cmNlTGFiZWxQcm9wcyB8IHVuZGVmaW5lZCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdGlmICghcHJvcHM/LnJlc291cmNlKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGlmIChVUkkuaXNVcmkocHJvcHMucmVzb3VyY2UpKSB7XG5cdFx0cmV0dXJuIHByb3BzLnJlc291cmNlO1xuXHR9XG5cblx0cmV0dXJuIHByb3BzLnJlc291cmNlLnByaW1hcnk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlc291cmNlTGFiZWxPcHRpb25zIGV4dGVuZHMgSUljb25MYWJlbFZhbHVlT3B0aW9ucyB7XG5cblx0LyoqXG5cdCAqIEEgaGludCB0byB0aGUgZmlsZSBraW5kIG9mIHRoZSByZXNvdXJjZS5cblx0ICovXG5cdGZpbGVLaW5kPzogRmlsZUtpbmQ7XG5cblx0LyoqXG5cdCAqIEZpbGUgZGVjb3JhdGlvbnMgdG8gdXNlIGZvciB0aGUgbGFiZWwuXG5cdCAqL1xuXHRyZWFkb25seSBmaWxlRGVjb3JhdGlvbnM/OiB7IGNvbG9yczogYm9vbGVhbjsgYmFkZ2VzOiBib29sZWFuIH07XG5cblx0LyoqXG5cdCAqIFdpbGwgdGFrZSB0aGUgcHJvdmlkZWQgbGFiZWwgYXMgaXMgYW5kIGUuZy4gbm90IG92ZXJyaWRlIGl0IGZvciB1bnRpdGxlZCBmaWxlcy5cblx0ICovXG5cdHJlYWRvbmx5IGZvcmNlTGFiZWw/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBBIHByZWZpeCB0byBiZSBhZGRlZCB0byB0aGUgbmFtZSBvZiB0aGUgbGFiZWwuXG5cdCAqL1xuXHRyZWFkb25seSBuYW1lUHJlZml4Pzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBBIHN1ZmZpeCB0byBiZSBhZGRlZCB0byB0aGUgbmFtZSBvZiB0aGUgbGFiZWwuXG5cdCAqL1xuXHRyZWFkb25seSBuYW1lU3VmZml4Pzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBVc2VzIHRoZSBwcm92aWRlZCBpY29uIGluc3RlYWQgb2YgZGVyaXZpbmcgYSByZXNvdXJjZSBpY29uLlxuXHQgKi9cblx0cmVhZG9ubHkgaWNvbj86IFRoZW1lSWNvbiB8IFVSSTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZUxhYmVsT3B0aW9ucyBleHRlbmRzIElSZXNvdXJjZUxhYmVsT3B0aW9ucyB7XG5cdGhpZGVMYWJlbD86IGJvb2xlYW47XG5cdGhpZGVQYXRoPzogYm9vbGVhbjtcblx0cmFuZ2U/OiBJUmFuZ2U7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlc291cmNlTGFiZWwgZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cblx0cmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cblx0cmVhZG9ubHkgb25EaWRSZW5kZXI6IEV2ZW50PHZvaWQ+O1xuXG5cdC8qKlxuXHQgKiBNb3N0IGdlbmVyaWMgd2F5IHRvIGFwcGx5IGEgbGFiZWwgd2l0aCByYXcgaW5mb3JtYXRpb24uXG5cdCAqL1xuXHRzZXRMYWJlbChsYWJlbD86IHN0cmluZywgZGVzY3JpcHRpb24/OiBzdHJpbmcsIG9wdGlvbnM/OiBJSWNvbkxhYmVsVmFsdWVPcHRpb25zKTogdm9pZDtcblxuXHQvKipcblx0ICogQ29udmVuaWVudCBtZXRob2QgdG8gYXBwbHkgYSBsYWJlbCBieSBwYXNzaW5nIGEgcmVzb3VyY2UgYWxvbmcuXG5cdCAqXG5cdCAqIE5vdGU6IGZvciBmaWxlIHJlc291cmNlcyBjb25zaWRlciB0byB1c2UgdGhlICNzZXRGaWxlKCkgbWV0aG9kIGluc3RlYWQuXG5cdCAqL1xuXHRzZXRSZXNvdXJjZShsYWJlbDogSVJlc291cmNlTGFiZWxQcm9wcywgb3B0aW9ucz86IElSZXNvdXJjZUxhYmVsT3B0aW9ucyk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIENvbnZlbmllbnQgbWV0aG9kIHRvIHJlbmRlciBhIGZpbGUgbGFiZWwgYmFzZWQgb24gYSByZXNvdXJjZS5cblx0ICovXG5cdHNldEZpbGUocmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IElGaWxlTGFiZWxPcHRpb25zKTogdm9pZDtcblxuXHQvKipcblx0ICogUmVzZXRzIHRoZSBsYWJlbCB0byBiZSBlbXB0eS5cblx0ICovXG5cdGNsZWFyKCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlc291cmNlTGFiZWxzQ29udGFpbmVyIHtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VWaXNpYmlsaXR5OiBFdmVudDxib29sZWFuPjtcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfTEFCRUxTX0NPTlRBSU5FUjogSVJlc291cmNlTGFiZWxzQ29udGFpbmVyID0ge1xuXHRvbkRpZENoYW5nZVZpc2liaWxpdHk6IEV2ZW50Lk5vbmVcbn07XG5cbmV4cG9ydCBjbGFzcyBSZXNvdXJjZUxhYmVscyBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0Z2V0IG9uRGlkQ2hhbmdlRGVjb3JhdGlvbnMoKSB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSB3aWRnZXRzOiBSZXNvdXJjZUxhYmVsV2lkZ2V0W10gPSBbXTtcblx0cHJpdmF0ZSBsYWJlbHM6IElSZXNvdXJjZUxhYmVsW10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250YWluZXI6IElSZXNvdXJjZUxhYmVsc0NvbnRhaW5lcixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlU2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJRGVjb3JhdGlvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGVjb3JhdGlvbnNTZXJ2aWNlOiBJRGVjb3JhdGlvbnNTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJVGV4dEZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dEZpbGVTZXJ2aWNlOiBJVGV4dEZpbGVTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKGNvbnRhaW5lcik7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKGNvbnRhaW5lcjogSVJlc291cmNlTGFiZWxzQ29udGFpbmVyKTogdm9pZCB7XG5cblx0XHQvLyBub3RpZnkgd2hlbiB2aXNpYmlsaXR5IGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3Rlcihjb250YWluZXIub25EaWRDaGFuZ2VWaXNpYmlsaXR5KHZpc2libGUgPT4ge1xuXHRcdFx0dGhpcy53aWRnZXRzLmZvckVhY2god2lkZ2V0ID0+IHdpZGdldC5ub3RpZnlWaXNpYmlsaXR5Q2hhbmdlZCh2aXNpYmxlKSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gbm90aWZ5IHdoZW4gZXh0ZW5zaW9ucyBhcmUgcmVnaXN0ZXJlZCB3aXRoIHBvdGVudGlhbGx5IG5ldyBsYW5ndWFnZXNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxhbmd1YWdlU2VydmljZS5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLndpZGdldHMuZm9yRWFjaCh3aWRnZXQgPT4gd2lkZ2V0Lm5vdGlmeUV4dGVuc2lvbnNSZWdpc3RlcmVkKCkpKSk7XG5cblx0XHQvLyBub3RpZnkgd2hlbiBtb2RlbCBsYW5ndWFnZSBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5tb2RlbFNlcnZpY2Uub25Nb2RlbExhbmd1YWdlQ2hhbmdlZChlID0+IHtcblx0XHRcdGlmICghZS5tb2RlbC51cmkpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyB3ZSBuZWVkIHRoZSByZXNvdXJjZSB0byBjb21wYXJlXG5cdFx0XHR9XG5cblx0XHRcdHRoaXMud2lkZ2V0cy5mb3JFYWNoKHdpZGdldCA9PiB3aWRnZXQubm90aWZ5TW9kZWxMYW5ndWFnZUNoYW5nZWQoZS5tb2RlbCkpO1xuXHRcdH0pKTtcblxuXHRcdC8vIG5vdGlmeSB3aGVuIG1vZGVsIGlzIGFkZGVkXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5tb2RlbFNlcnZpY2Uub25Nb2RlbEFkZGVkKG1vZGVsID0+IHtcblx0XHRcdGlmICghbW9kZWwudXJpKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gd2UgbmVlZCB0aGUgcmVzb3VyY2UgdG8gY29tcGFyZVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLndpZGdldHMuZm9yRWFjaCh3aWRnZXQgPT4gd2lkZ2V0Lm5vdGlmeU1vZGVsQWRkZWQobW9kZWwpKTtcblx0XHR9KSk7XG5cblx0XHQvLyBub3RpZnkgd2hlbiB3b3Jrc3BhY2UgZm9sZGVycyBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3Jrc3BhY2VTZXJ2aWNlLm9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycygoKSA9PiB7XG5cdFx0XHR0aGlzLndpZGdldHMuZm9yRWFjaCh3aWRnZXQgPT4gd2lkZ2V0Lm5vdGlmeVdvcmtzcGFjZUZvbGRlcnNDaGFuZ2UoKSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gbm90aWZ5IHdoZW4gZmlsZSBkZWNvcmF0aW9uIGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRlY29yYXRpb25zU2VydmljZS5vbkRpZENoYW5nZURlY29yYXRpb25zKGUgPT4ge1xuXHRcdFx0bGV0IG5vdGlmeURpZENoYW5nZURlY29yYXRpb25zID0gZmFsc2U7XG5cdFx0XHR0aGlzLndpZGdldHMuZm9yRWFjaCh3aWRnZXQgPT4ge1xuXHRcdFx0XHRpZiAod2lkZ2V0Lm5vdGlmeUZpbGVEZWNvcmF0aW9uc0NoYW5nZXMoZSkpIHtcblx0XHRcdFx0XHRub3RpZnlEaWRDaGFuZ2VEZWNvcmF0aW9ucyA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAobm90aWZ5RGlkQ2hhbmdlRGVjb3JhdGlvbnMpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gbm90aWZ5IHdoZW4gdGhlbWUgY2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZSgoKSA9PiB0aGlzLndpZGdldHMuZm9yRWFjaCh3aWRnZXQgPT4gd2lkZ2V0Lm5vdGlmeVRoZW1lQ2hhbmdlKCkpKSk7XG5cblx0XHQvLyBub3RpZnkgd2hlbiBmaWxlcy5hc3NvY2lhdGlvbnMgY2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oRklMRVNfQVNTT0NJQVRJT05TX0NPTkZJRykpIHtcblx0XHRcdFx0dGhpcy53aWRnZXRzLmZvckVhY2god2lkZ2V0ID0+IHdpZGdldC5ub3RpZnlGaWxlQXNzb2NpYXRpb25zQ2hhbmdlKCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIG5vdGlmeSB3aGVuIGxhYmVsIGZvcm1hdHRlcnMgY2hhbmdlXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5sYWJlbFNlcnZpY2Uub25EaWRDaGFuZ2VGb3JtYXR0ZXJzKGUgPT4ge1xuXHRcdFx0dGhpcy53aWRnZXRzLmZvckVhY2god2lkZ2V0ID0+IHdpZGdldC5ub3RpZnlGb3JtYXR0ZXJzQ2hhbmdlKGUuc2NoZW1lKSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gbm90aWZ5IHdoZW4gdW50aXRsZWQgbGFiZWxzIGNoYW5nZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudGV4dEZpbGVTZXJ2aWNlLnVudGl0bGVkLm9uRGlkQ2hhbmdlTGFiZWwobW9kZWwgPT4ge1xuXHRcdFx0dGhpcy53aWRnZXRzLmZvckVhY2god2lkZ2V0ID0+IHdpZGdldC5ub3RpZnlVbnRpdGxlZExhYmVsQ2hhbmdlKG1vZGVsLnJlc291cmNlKSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0Z2V0KGluZGV4OiBudW1iZXIpOiBJUmVzb3VyY2VMYWJlbCB7XG5cdFx0cmV0dXJuIHRoaXMubGFiZWxzW2luZGV4XTtcblx0fVxuXG5cdGNyZWF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50LCBvcHRpb25zPzogSUljb25MYWJlbENyZWF0aW9uT3B0aW9ucyk6IElSZXNvdXJjZUxhYmVsIHtcblx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlc291cmNlTGFiZWxXaWRnZXQsIGNvbnRhaW5lciwgb3B0aW9ucyk7XG5cblx0XHQvLyBPbmx5IGV4cG9zZSBhIGhhbmRsZSB0byB0aGUgb3V0c2lkZVxuXHRcdGNvbnN0IGxhYmVsOiBJUmVzb3VyY2VMYWJlbCA9IHtcblx0XHRcdGVsZW1lbnQ6IHdpZGdldC5lbGVtZW50LFxuXHRcdFx0Z2V0IG9uRGlkUmVuZGVyKCkgeyByZXR1cm4gd2lkZ2V0Lm9uRGlkUmVuZGVyOyB9LFxuXHRcdFx0c2V0TGFiZWw6IChsYWJlbDogc3RyaW5nLCBkZXNjcmlwdGlvbj86IHN0cmluZywgb3B0aW9ucz86IElJY29uTGFiZWxWYWx1ZU9wdGlvbnMpID0+IHdpZGdldC5zZXRMYWJlbChsYWJlbCwgZGVzY3JpcHRpb24sIG9wdGlvbnMpLFxuXHRcdFx0c2V0UmVzb3VyY2U6IChsYWJlbDogSVJlc291cmNlTGFiZWxQcm9wcywgb3B0aW9ucz86IElSZXNvdXJjZUxhYmVsT3B0aW9ucykgPT4gd2lkZ2V0LnNldFJlc291cmNlKGxhYmVsLCBvcHRpb25zKSxcblx0XHRcdHNldEZpbGU6IChyZXNvdXJjZTogVVJJLCBvcHRpb25zPzogSUZpbGVMYWJlbE9wdGlvbnMpID0+IHdpZGdldC5zZXRGaWxlKHJlc291cmNlLCBvcHRpb25zKSxcblx0XHRcdGNsZWFyOiAoKSA9PiB3aWRnZXQuY2xlYXIoKSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHRoaXMuZGlzcG9zZVdpZGdldCh3aWRnZXQpXG5cdFx0fTtcblxuXHRcdC8vIFN0b3JlXG5cdFx0dGhpcy5sYWJlbHMucHVzaChsYWJlbCk7XG5cdFx0dGhpcy53aWRnZXRzLnB1c2god2lkZ2V0KTtcblxuXHRcdHJldHVybiBsYWJlbDtcblx0fVxuXG5cdHByaXZhdGUgZGlzcG9zZVdpZGdldCh3aWRnZXQ6IFJlc291cmNlTGFiZWxXaWRnZXQpOiB2b2lkIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMud2lkZ2V0cy5pbmRleE9mKHdpZGdldCk7XG5cdFx0aWYgKGluZGV4ID4gLTEpIHtcblx0XHRcdHRoaXMud2lkZ2V0cy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdFx0dGhpcy5sYWJlbHMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHR9XG5cblx0XHRkaXNwb3NlKHdpZGdldCk7XG5cdH1cblxuXHRjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLndpZGdldHMgPSBkaXNwb3NlKHRoaXMud2lkZ2V0cyk7XG5cdFx0dGhpcy5sYWJlbHMgPSBbXTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXG5cdFx0dGhpcy5jbGVhcigpO1xuXHR9XG59XG5cbi8qKlxuICogTm90ZTogcGxlYXNlIGNvbnNpZGVyIHRvIHVzZSBgUmVzb3VyY2VMYWJlbHNgIGlmIHlvdSBhcmUgaW4gbmVlZFxuICogb2YgbW9yZSB0aGFuIG9uZSBsYWJlbCBmb3IgeW91ciB3aWRnZXQuXG4gKi9cbmV4cG9ydCBjbGFzcyBSZXNvdXJjZUxhYmVsIGV4dGVuZHMgUmVzb3VyY2VMYWJlbHMge1xuXG5cdHByaXZhdGUgbGFiZWw6IElSZXNvdXJjZUxhYmVsO1xuXHRnZXQgZWxlbWVudCgpOiBJUmVzb3VyY2VMYWJlbCB7IHJldHVybiB0aGlzLmxhYmVsOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRvcHRpb25zOiBJSWNvbkxhYmVsQ3JlYXRpb25PcHRpb25zIHwgdW5kZWZpbmVkLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2Ugd29ya3NwYWNlU2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASURlY29yYXRpb25zU2VydmljZSBkZWNvcmF0aW9uc1NlcnZpY2U6IElEZWNvcmF0aW9uc1NlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASVRleHRGaWxlU2VydmljZSB0ZXh0RmlsZVNlcnZpY2U6IElUZXh0RmlsZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoREVGQVVMVF9MQUJFTFNfQ09OVEFJTkVSLCBpbnN0YW50aWF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIG1vZGVsU2VydmljZSwgd29ya3NwYWNlU2VydmljZSwgbGFuZ3VhZ2VTZXJ2aWNlLCBkZWNvcmF0aW9uc1NlcnZpY2UsIHRoZW1lU2VydmljZSwgbGFiZWxTZXJ2aWNlLCB0ZXh0RmlsZVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5sYWJlbCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuY3JlYXRlKGNvbnRhaW5lciwgb3B0aW9ucykpO1xuXHR9XG59XG5cbmVudW0gUmVkcmF3IHtcblx0QmFzaWMgPSAxLFxuXHRGdWxsID0gMlxufVxuXG5jbGFzcyBSZXNvdXJjZUxhYmVsV2lkZ2V0IGV4dGVuZHMgSWNvbkxhYmVsIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlbmRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRnZXQgb25EaWRSZW5kZXIoKSB7IHJldHVybiB0aGlzLl9vbkRpZFJlbmRlci5ldmVudDsgfVxuXG5cdHByaXZhdGUgbGFiZWw6IElSZXNvdXJjZUxhYmVsUHJvcHMgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGVjb3JhdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGVjb3JhdGlvbj4oKSk7XG5cdHByaXZhdGUgb3B0aW9uczogSVJlc291cmNlTGFiZWxPcHRpb25zIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgY29tcHV0ZWRJY29uQ2xhc3Nlczogc3RyaW5nW10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY29tcHV0ZWRMYW5ndWFnZUlkOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY29tcHV0ZWRQYXRoTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjb21wdXRlZFdvcmtzcGFjZUZvbGRlckxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBuZWVkc1JlZHJhdzogUmVkcmF3IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIGlzSGlkZGVuOiBib29sZWFuID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRvcHRpb25zOiBJSWNvbkxhYmVsQ3JlYXRpb25PcHRpb25zIHwgdW5kZWZpbmVkLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJRGVjb3JhdGlvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGVjb3JhdGlvbnNTZXJ2aWNlOiBJRGVjb3JhdGlvbnNTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJVGV4dEZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dEZpbGVTZXJ2aWNlOiBJVGV4dEZpbGVTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tEb2N1bWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RlYm9va0RvY3VtZW50U2VydmljZTogSU5vdGVib29rRG9jdW1lbnRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGNvbnRhaW5lciwgb3B0aW9ucyk7XG5cdH1cblxuXHRub3RpZnlWaXNpYmlsaXR5Q2hhbmdlZCh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHZpc2libGUgPT09IHRoaXMuaXNIaWRkZW4pIHtcblx0XHRcdHRoaXMuaXNIaWRkZW4gPSAhdmlzaWJsZTtcblxuXHRcdFx0aWYgKHZpc2libGUgJiYgdGhpcy5uZWVkc1JlZHJhdykge1xuXHRcdFx0XHR0aGlzLnJlbmRlcih7XG5cdFx0XHRcdFx0dXBkYXRlSWNvbjogdGhpcy5uZWVkc1JlZHJhdyA9PT0gUmVkcmF3LkZ1bGwsXG5cdFx0XHRcdFx0dXBkYXRlRGVjb3JhdGlvbjogdGhpcy5uZWVkc1JlZHJhdyA9PT0gUmVkcmF3LkZ1bGxcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dGhpcy5uZWVkc1JlZHJhdyA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRub3RpZnlNb2RlbExhbmd1YWdlQ2hhbmdlZChtb2RlbDogSVRleHRNb2RlbCk6IHZvaWQge1xuXHRcdHRoaXMuaGFuZGxlTW9kZWxFdmVudChtb2RlbCk7XG5cdH1cblxuXHRub3RpZnlNb2RlbEFkZGVkKG1vZGVsOiBJVGV4dE1vZGVsKTogdm9pZCB7XG5cdFx0dGhpcy5oYW5kbGVNb2RlbEV2ZW50KG1vZGVsKTtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlTW9kZWxFdmVudChtb2RlbDogSVRleHRNb2RlbCk6IHZvaWQge1xuXHRcdGNvbnN0IHJlc291cmNlID0gdG9SZXNvdXJjZSh0aGlzLmxhYmVsKTtcblx0XHRpZiAoIXJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm47IC8vIG9ubHkgdXBkYXRlIGlmIHJlc291cmNlIGV4aXN0c1xuXHRcdH1cblxuXHRcdGlmIChpc0VxdWFsKG1vZGVsLnVyaSwgcmVzb3VyY2UpKSB7XG5cdFx0XHRpZiAodGhpcy5jb21wdXRlZExhbmd1YWdlSWQgIT09IG1vZGVsLmdldExhbmd1YWdlSWQoKSkge1xuXHRcdFx0XHR0aGlzLmNvbXB1dGVkTGFuZ3VhZ2VJZCA9IG1vZGVsLmdldExhbmd1YWdlSWQoKTtcblx0XHRcdFx0dGhpcy5yZW5kZXIoeyB1cGRhdGVJY29uOiB0cnVlLCB1cGRhdGVEZWNvcmF0aW9uOiBmYWxzZSB9KTsgLy8gdXBkYXRlIGlmIHRoZSBsYW5ndWFnZSBpZCBvZiB0aGUgbW9kZWwgaGFzIGNoYW5nZWQgZnJvbSBvdXIgbGFzdCBrbm93biBzdGF0ZVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdG5vdGlmeUZpbGVEZWNvcmF0aW9uc0NoYW5nZXMoZTogSVJlc291cmNlRGVjb3JhdGlvbkNoYW5nZUV2ZW50KTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLm9wdGlvbnMpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCByZXNvdXJjZSA9IHRvUmVzb3VyY2UodGhpcy5sYWJlbCk7XG5cdFx0aWYgKCFyZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLm9wdGlvbnMuZmlsZURlY29yYXRpb25zICYmIGUuYWZmZWN0c1Jlc291cmNlKHJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMucmVuZGVyKHsgdXBkYXRlSWNvbjogZmFsc2UsIHVwZGF0ZURlY29yYXRpb246IHRydWUgfSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0bm90aWZ5RXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5yZW5kZXIoeyB1cGRhdGVJY29uOiB0cnVlLCB1cGRhdGVEZWNvcmF0aW9uOiBmYWxzZSB9KTtcblx0fVxuXG5cdG5vdGlmeVRoZW1lQ2hhbmdlKCk6IHZvaWQge1xuXHRcdHRoaXMucmVuZGVyKHsgdXBkYXRlSWNvbjogZmFsc2UsIHVwZGF0ZURlY29yYXRpb246IGZhbHNlIH0pO1xuXHR9XG5cblx0bm90aWZ5RmlsZUFzc29jaWF0aW9uc0NoYW5nZSgpOiB2b2lkIHtcblx0XHR0aGlzLnJlbmRlcih7IHVwZGF0ZUljb246IHRydWUsIHVwZGF0ZURlY29yYXRpb246IGZhbHNlIH0pO1xuXHR9XG5cblx0bm90aWZ5Rm9ybWF0dGVyc0NoYW5nZShzY2hlbWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0b1Jlc291cmNlKHRoaXMubGFiZWwpPy5zY2hlbWUgPT09IHNjaGVtZSkge1xuXHRcdFx0dGhpcy5yZW5kZXIoeyB1cGRhdGVJY29uOiBmYWxzZSwgdXBkYXRlRGVjb3JhdGlvbjogZmFsc2UgfSk7XG5cdFx0fVxuXHR9XG5cblx0bm90aWZ5VW50aXRsZWRMYWJlbENoYW5nZShyZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0aWYgKGlzRXF1YWwocmVzb3VyY2UsIHRvUmVzb3VyY2UodGhpcy5sYWJlbCkpKSB7XG5cdFx0XHR0aGlzLnJlbmRlcih7IHVwZGF0ZUljb246IGZhbHNlLCB1cGRhdGVEZWNvcmF0aW9uOiBmYWxzZSB9KTtcblx0XHR9XG5cdH1cblxuXHRub3RpZnlXb3Jrc3BhY2VGb2xkZXJzQ2hhbmdlKCk6IHZvaWQge1xuXHRcdGlmICh0eXBlb2YgdGhpcy5jb21wdXRlZFdvcmtzcGFjZUZvbGRlckxhYmVsID09PSAnc3RyaW5nJykge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSB0b1Jlc291cmNlKHRoaXMubGFiZWwpO1xuXHRcdFx0aWYgKFVSSS5pc1VyaShyZXNvdXJjZSkgJiYgdGhpcy5sYWJlbD8ubmFtZSA9PT0gdGhpcy5jb21wdXRlZFdvcmtzcGFjZUZvbGRlckxhYmVsKSB7XG5cdFx0XHRcdHRoaXMuc2V0RmlsZShyZXNvdXJjZSwgdGhpcy5vcHRpb25zKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRzZXRGaWxlKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJRmlsZUxhYmVsT3B0aW9ucyk6IHZvaWQge1xuXHRcdGNvbnN0IGhpZGVMYWJlbCA9IG9wdGlvbnM/LmhpZGVMYWJlbDtcblx0XHRsZXQgbmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGlmICghaGlkZUxhYmVsKSB7XG5cdFx0XHRpZiAob3B0aW9ucz8uZmlsZUtpbmQgPT09IEZpbGVLaW5kLlJPT1RfRk9MREVSKSB7XG5cdFx0XHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlciA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKHJlc291cmNlKTtcblx0XHRcdFx0aWYgKHdvcmtzcGFjZUZvbGRlcikge1xuXHRcdFx0XHRcdG5hbWUgPSB3b3Jrc3BhY2VGb2xkZXIubmFtZTtcblx0XHRcdFx0XHR0aGlzLmNvbXB1dGVkV29ya3NwYWNlRm9sZGVyTGFiZWwgPSBuYW1lO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICghbmFtZSkge1xuXHRcdFx0XHRuYW1lID0gbm9ybWFsaXplRHJpdmVMZXR0ZXIoYmFzZW5hbWVPckF1dGhvcml0eShyZXNvdXJjZSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBkZXNjcmlwdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGlmICghb3B0aW9ucz8uaGlkZVBhdGgpIHtcblx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uQ2FuZGlkYXRlID0gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZGlybmFtZShyZXNvdXJjZSksIHsgcmVsYXRpdmU6IHRydWUgfSk7XG5cdFx0XHRpZiAoZGVzY3JpcHRpb25DYW5kaWRhdGUgJiYgZGVzY3JpcHRpb25DYW5kaWRhdGUgIT09ICcuJykge1xuXHRcdFx0XHQvLyBvbWl0IGRlc2NyaXB0aW9uIGlmIGl0cyBub3Qgc2lnbmlmaWNhbnQ6IGEgcmVsYXRpdmUgcGF0aFxuXHRcdFx0XHQvLyBvZiAnLicganVzdCBpbmRpY2F0ZXMgdGhhdCB0aGVyZSBpcyBubyBwYXJlbnQgdG8gdGhlIHBhdGhcblx0XHRcdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzIwODY5MlxuXHRcdFx0XHRkZXNjcmlwdGlvbiA9IGRlc2NyaXB0aW9uQ2FuZGlkYXRlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuc2V0UmVzb3VyY2UoeyByZXNvdXJjZSwgbmFtZSwgZGVzY3JpcHRpb24sIHJhbmdlOiBvcHRpb25zPy5yYW5nZSB9LCBvcHRpb25zKTtcblx0fVxuXG5cdHNldFJlc291cmNlKGxhYmVsOiBJUmVzb3VyY2VMYWJlbFByb3BzLCBvcHRpb25zOiBJUmVzb3VyY2VMYWJlbE9wdGlvbnMgPSBPYmplY3QuY3JlYXRlKG51bGwpKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSB0b1Jlc291cmNlKGxhYmVsKTtcblx0XHRjb25zdCBpc1NpZGVCeVNpZGVFZGl0b3IgPSBsYWJlbD8ucmVzb3VyY2UgJiYgIVVSSS5pc1VyaShsYWJlbC5yZXNvdXJjZSk7XG5cblx0XHRpZiAoIW9wdGlvbnMuZm9yY2VMYWJlbCAmJiAhaXNTaWRlQnlTaWRlRWRpdG9yICYmIHJlc291cmNlPy5zY2hlbWUgPT09IFNjaGVtYXMudW50aXRsZWQpIHtcblx0XHRcdC8vIFVudGl0bGVkIGxhYmVscyBhcmUgdmVyeSBkeW5hbWljIGJlY2F1c2UgdGhleSBtYXkgY2hhbmdlXG5cdFx0XHQvLyB3aGVuZXZlciB0aGUgY29udGVudCBjaGFuZ2VzICh1bmxlc3MgYSBwYXRoIGlzIGFzc29jaWF0ZWQpLlxuXHRcdFx0Ly8gQXMgc3VjaCB3ZSBhbHdheXMgYXNrIHRoZSBhY3R1YWwgZWRpdG9yIGZvciBpdCdzIG5hbWUgYW5kXG5cdFx0XHQvLyBkZXNjcmlwdGlvbiB0byBnZXQgbGF0ZXN0IGluIGNhc2UgbmFtZS9kZXNjcmlwdGlvbiBhcmVcblx0XHRcdC8vIHByb3ZpZGVkLiBJZiB0aGV5IGFyZSBub3QgcHJvdmlkZWQgZnJvbSB0aGUgbGFiZWwgd2UgZ290XG5cdFx0XHQvLyB3ZSBhc3N1bWUgdGhhdCB0aGUgY2xpZW50IGRvZXMgbm90IHdhbnQgdG8gZGlzcGxheSB0aGVtXG5cdFx0XHQvLyBhbmQgYXMgc3VjaCBkbyBub3Qgb3ZlcnJpZGUuXG5cdFx0XHQvL1xuXHRcdFx0Ly8gV2UgZG8gbm90IHRvdWNoIHRoZSBsYWJlbCBpZiBpdCByZXByZXNlbnRzIGEgcHJpbWFyeS1zZWNvbmRhcnlcblx0XHRcdC8vIGJlY2F1c2UgaW4gdGhhdCBjYXNlIHdlIGV4cGVjdCBpdCB0byBjYXJyeSBhIHByb3BlciBsYWJlbFxuXHRcdFx0Ly8gYW5kIGRlc2NyaXB0aW9uLlxuXHRcdFx0Y29uc3QgdW50aXRsZWRNb2RlbCA9IHRoaXMudGV4dEZpbGVTZXJ2aWNlLnVudGl0bGVkLmdldChyZXNvdXJjZSk7XG5cdFx0XHRpZiAodW50aXRsZWRNb2RlbCAmJiAhdW50aXRsZWRNb2RlbC5oYXNBc3NvY2lhdGVkRmlsZVBhdGgpIHtcblx0XHRcdFx0aWYgKHR5cGVvZiBsYWJlbC5uYW1lID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdGxhYmVsLm5hbWUgPSB1bnRpdGxlZE1vZGVsLm5hbWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodHlwZW9mIGxhYmVsLmRlc2NyaXB0aW9uID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdGNvbnN0IHVudGl0bGVkRGVzY3JpcHRpb24gPSB1bnRpdGxlZE1vZGVsLnJlc291cmNlLnBhdGg7XG5cdFx0XHRcdFx0aWYgKGxhYmVsLm5hbWUgIT09IHVudGl0bGVkRGVzY3JpcHRpb24pIHtcblx0XHRcdFx0XHRcdGxhYmVsLmRlc2NyaXB0aW9uID0gdW50aXRsZWREZXNjcmlwdGlvbjtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bGFiZWwuZGVzY3JpcHRpb24gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgdW50aXRsZWRUaXRsZSA9IHVudGl0bGVkTW9kZWwucmVzb3VyY2UucGF0aDtcblx0XHRcdFx0aWYgKHVudGl0bGVkTW9kZWwubmFtZSAhPT0gdW50aXRsZWRUaXRsZSkge1xuXHRcdFx0XHRcdG9wdGlvbnMudGl0bGUgPSBgJHt1bnRpdGxlZE1vZGVsLm5hbWV9IFx1MjAyMiAke3VudGl0bGVkVGl0bGV9YDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRvcHRpb25zLnRpdGxlID0gdW50aXRsZWRUaXRsZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghb3B0aW9ucy5mb3JjZUxhYmVsICYmICFpc1NpZGVCeVNpZGVFZGl0b3IgJiYgcmVzb3VyY2U/LnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGwpIHtcblx0XHRcdC8vIE5vdGVib29rIGNlbGxzIGFyZSBlbWJlZGVkIGluIGEgbm90ZWJvb2sgZG9jdW1lbnRcblx0XHRcdC8vIEFzIHN1Y2ggd2UgYWx3YXlzIGFzayB0aGUgYWN0dWFsIG5vdGVib29rIGRvY3VtZW50XG5cdFx0XHQvLyBmb3IgaXRzIHBvc2l0aW9uIGluIHRoZSBkb2N1bWVudC5cblx0XHRcdGNvbnN0IG5vdGVib29rRG9jdW1lbnQgPSB0aGlzLm5vdGVib29rRG9jdW1lbnRTZXJ2aWNlLmdldE5vdGVib29rKHJlc291cmNlKTtcblx0XHRcdGNvbnN0IGNlbGxJbmRleCA9IG5vdGVib29rRG9jdW1lbnQ/LmdldENlbGxJbmRleChyZXNvdXJjZSk7XG5cdFx0XHRpZiAobm90ZWJvb2tEb2N1bWVudCAmJiBjZWxsSW5kZXggIT09IHVuZGVmaW5lZCAmJiB0eXBlb2YgbGFiZWwubmFtZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0b3B0aW9ucy50aXRsZSA9IGxvY2FsaXplKCdub3RlYm9va0NlbGxMYWJlbCcsIFwiezB9IFx1MjAyMiBDZWxsIHsxfVwiLCBsYWJlbC5uYW1lLCBgJHtjZWxsSW5kZXggKyAxfWApO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodHlwZW9mIGxhYmVsLm5hbWUgPT09ICdzdHJpbmcnICYmIG5vdGVib29rRG9jdW1lbnQgJiYgY2VsbEluZGV4ICE9PSB1bmRlZmluZWQgJiYgdHlwZW9mIGxhYmVsLm5hbWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGxhYmVsLm5hbWUgPSBsb2NhbGl6ZSgnbm90ZWJvb2tDZWxsTGFiZWwnLCBcInswfSBcdTIwMjIgQ2VsbCB7MX1cIiwgbGFiZWwubmFtZSwgYCR7Y2VsbEluZGV4ICsgMX1gKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIW9wdGlvbnMuZm9yY2VMYWJlbCAmJiAhaXNTaWRlQnlTaWRlRWRpdG9yICYmIHJlc291cmNlPy5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlTm90ZWJvb2tDZWxsT3V0cHV0KSB7XG5cdFx0XHRjb25zdCBub3RlYm9va0RvY3VtZW50ID0gdGhpcy5ub3RlYm9va0RvY3VtZW50U2VydmljZS5nZXROb3RlYm9vayhyZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBvdXRwdXRVcmlEYXRhID0gZXh0cmFjdENlbGxPdXRwdXREZXRhaWxzKHJlc291cmNlKTtcblx0XHRcdGlmIChvdXRwdXRVcmlEYXRhPy5jZWxsRnJhZ21lbnQpIHtcblx0XHRcdFx0aWYgKCFvdXRwdXRVcmlEYXRhLm5vdGVib29rKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGNlbGxVcmkgPSBvdXRwdXRVcmlEYXRhLm5vdGVib29rLndpdGgoe1xuXHRcdFx0XHRcdHNjaGVtZTogU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGwsXG5cdFx0XHRcdFx0ZnJhZ21lbnQ6IG91dHB1dFVyaURhdGEuY2VsbEZyYWdtZW50XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjb25zdCBjZWxsSW5kZXggPSBub3RlYm9va0RvY3VtZW50Py5nZXRDZWxsSW5kZXgoY2VsbFVyaSk7XG5cdFx0XHRcdGNvbnN0IG91dHB1dEluZGV4ID0gb3V0cHV0VXJpRGF0YS5vdXRwdXRJbmRleDtcblxuXHRcdFx0XHRpZiAoY2VsbEluZGV4ICE9PSB1bmRlZmluZWQgJiYgb3V0cHV0SW5kZXggIT09IHVuZGVmaW5lZCAmJiB0eXBlb2YgbGFiZWwubmFtZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRsYWJlbC5uYW1lID0gbG9jYWxpemUoXG5cdFx0XHRcdFx0XHQnbm90ZWJvb2tDZWxsT3V0cHV0TGFiZWwnLFxuXHRcdFx0XHRcdFx0XCJ7MH0gXHUyMDIyIENlbGwgezF9IFx1MjAyMiBPdXRwdXQgezJ9XCIsXG5cdFx0XHRcdFx0XHRsYWJlbC5uYW1lLFxuXHRcdFx0XHRcdFx0YCR7Y2VsbEluZGV4ICsgMX1gLFxuXHRcdFx0XHRcdFx0YCR7b3V0cHV0SW5kZXggKyAxfWBcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGNlbGxJbmRleCAhPT0gdW5kZWZpbmVkICYmIHR5cGVvZiBsYWJlbC5uYW1lID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdGxhYmVsLm5hbWUgPSBsb2NhbGl6ZShcblx0XHRcdFx0XHRcdCdub3RlYm9va0NlbGxPdXRwdXRMYWJlbFNpbXBsZScsXG5cdFx0XHRcdFx0XHRcInswfSBcdTIwMjIgQ2VsbCB7MX0gXHUyMDIyIE91dHB1dFwiLFxuXHRcdFx0XHRcdFx0bGFiZWwubmFtZSxcblx0XHRcdFx0XHRcdGAke2NlbGxJbmRleCArIDF9YFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucy5uYW1lUHJlZml4KSB7XG5cdFx0XHRpZiAodHlwZW9mIGxhYmVsLm5hbWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGxhYmVsLm5hbWUgPSBvcHRpb25zLm5hbWVQcmVmaXggKyBsYWJlbC5uYW1lO1xuXHRcdFx0fSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGxhYmVsLm5hbWUpICYmIGxhYmVsLm5hbWUubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRsYWJlbC5uYW1lID0gW29wdGlvbnMubmFtZVByZWZpeCArIGxhYmVsLm5hbWVbMF0sIC4uLmxhYmVsLm5hbWUuc2xpY2UoMSldO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zLm5hbWVTdWZmaXgpIHtcblx0XHRcdGlmICh0eXBlb2YgbGFiZWwubmFtZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0bGFiZWwubmFtZSA9IGxhYmVsLm5hbWUgKyBvcHRpb25zLm5hbWVTdWZmaXg7XG5cdFx0XHR9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkobGFiZWwubmFtZSkgJiYgbGFiZWwubmFtZS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGxhYmVsLm5hbWUgPSBbLi4ubGFiZWwubmFtZS5zbGljZSgwLCBsYWJlbC5uYW1lLmxlbmd0aCAtIDEpLCBsYWJlbC5uYW1lW2xhYmVsLm5hbWUubGVuZ3RoIC0gMV0gKyBvcHRpb25zLm5hbWVTdWZmaXhdO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGhhc1Jlc291cmNlQ2hhbmdlZCA9IHRoaXMuaGFzUmVzb3VyY2VDaGFuZ2VkKGxhYmVsKTtcblx0XHRjb25zdCBoYXNQYXRoTGFiZWxDaGFuZ2VkID0gaGFzUmVzb3VyY2VDaGFuZ2VkIHx8IHRoaXMuaGFzUGF0aExhYmVsQ2hhbmdlZChsYWJlbCk7XG5cdFx0Y29uc3QgaGFzRmlsZUtpbmRDaGFuZ2VkID0gdGhpcy5oYXNGaWxlS2luZENoYW5nZWQob3B0aW9ucyk7XG5cdFx0Y29uc3QgaGFzSWNvbkNoYW5nZWQgPSB0aGlzLmhhc0ljb25DaGFuZ2VkKG9wdGlvbnMpO1xuXG5cdFx0dGhpcy5sYWJlbCA9IGxhYmVsO1xuXHRcdHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG5cblx0XHRpZiAoaGFzUmVzb3VyY2VDaGFuZ2VkKSB7XG5cdFx0XHR0aGlzLmNvbXB1dGVkTGFuZ3VhZ2VJZCA9IHVuZGVmaW5lZDsgLy8gcmVzZXQgY29tcHV0ZWQgbGFuZ3VhZ2Ugc2luY2UgcmVzb3VyY2UgY2hhbmdlZFxuXHRcdH1cblxuXHRcdGlmIChoYXNQYXRoTGFiZWxDaGFuZ2VkKSB7XG5cdFx0XHR0aGlzLmNvbXB1dGVkUGF0aExhYmVsID0gdW5kZWZpbmVkOyAvLyByZXNldCBwYXRoIGxhYmVsIGR1ZSB0byByZXNvdXJjZS9wYXRoLWxhYmVsIGNoYW5nZVxuXHRcdH1cblxuXHRcdHRoaXMucmVuZGVyKHtcblx0XHRcdHVwZGF0ZUljb246IGhhc1Jlc291cmNlQ2hhbmdlZCB8fCBoYXNGaWxlS2luZENoYW5nZWQgfHwgaGFzSWNvbkNoYW5nZWQsXG5cdFx0XHR1cGRhdGVEZWNvcmF0aW9uOiBoYXNSZXNvdXJjZUNoYW5nZWQgfHwgaGFzRmlsZUtpbmRDaGFuZ2VkXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGhhc0ZpbGVLaW5kQ2hhbmdlZChuZXdPcHRpb25zPzogSVJlc291cmNlTGFiZWxPcHRpb25zKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgbmV3RmlsZUtpbmQgPSBuZXdPcHRpb25zPy5maWxlS2luZDtcblx0XHRjb25zdCBvbGRGaWxlS2luZCA9IHRoaXMub3B0aW9ucz8uZmlsZUtpbmQ7XG5cblx0XHRyZXR1cm4gbmV3RmlsZUtpbmQgIT09IG9sZEZpbGVLaW5kOyAvLyBzYW1lIHJlc291cmNlIGJ1dCBkaWZmZXJlbnQga2luZCAoZmlsZSwgZm9sZGVyKVxuXHR9XG5cblx0cHJpdmF0ZSBoYXNSZXNvdXJjZUNoYW5nZWQobmV3TGFiZWw6IElSZXNvdXJjZUxhYmVsUHJvcHMpOiBib29sZWFuIHtcblx0XHRjb25zdCBuZXdSZXNvdXJjZSA9IHRvUmVzb3VyY2UobmV3TGFiZWwpO1xuXHRcdGNvbnN0IG9sZFJlc291cmNlID0gdG9SZXNvdXJjZSh0aGlzLmxhYmVsKTtcblxuXHRcdGlmIChuZXdSZXNvdXJjZSAmJiBvbGRSZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIG5ld1Jlc291cmNlLnRvU3RyaW5nKCkgIT09IG9sZFJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0fVxuXG5cdFx0aWYgKCFuZXdSZXNvdXJjZSAmJiAhb2xkUmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgaGFzUGF0aExhYmVsQ2hhbmdlZChuZXdMYWJlbDogSVJlc291cmNlTGFiZWxQcm9wcyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IG5ld1Jlc291cmNlID0gdG9SZXNvdXJjZShuZXdMYWJlbCk7XG5cblx0XHRyZXR1cm4gISFuZXdSZXNvdXJjZSAmJiB0aGlzLmNvbXB1dGVkUGF0aExhYmVsICE9PSB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChuZXdSZXNvdXJjZSk7XG5cdH1cblxuXHRwcml2YXRlIGhhc0ljb25DaGFuZ2VkKG5ld09wdGlvbnM/OiBJUmVzb3VyY2VMYWJlbE9wdGlvbnMpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5vcHRpb25zPy5pY29uICE9PSBuZXdPcHRpb25zPy5pY29uO1xuXHR9XG5cblx0Y2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5sYWJlbCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLm9wdGlvbnMgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5jb21wdXRlZExhbmd1YWdlSWQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5jb21wdXRlZEljb25DbGFzc2VzID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuY29tcHV0ZWRQYXRoTGFiZWwgPSB1bmRlZmluZWQ7XG5cblx0XHR0aGlzLnNldExhYmVsKCcnKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyKG9wdGlvbnM6IHsgdXBkYXRlSWNvbjogYm9vbGVhbjsgdXBkYXRlRGVjb3JhdGlvbjogYm9vbGVhbiB9KTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuaXNIaWRkZW4pIHtcblx0XHRcdGlmICh0aGlzLm5lZWRzUmVkcmF3ICE9PSBSZWRyYXcuRnVsbCkge1xuXHRcdFx0XHR0aGlzLm5lZWRzUmVkcmF3ID0gKG9wdGlvbnMudXBkYXRlSWNvbiB8fCBvcHRpb25zLnVwZGF0ZURlY29yYXRpb24pID8gUmVkcmF3LkZ1bGwgOiBSZWRyYXcuQmFzaWM7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucy51cGRhdGVJY29uKSB7XG5cdFx0XHR0aGlzLmNvbXB1dGVkSWNvbkNsYXNzZXMgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmxhYmVsKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaWNvbkxhYmVsT3B0aW9uczogSUljb25MYWJlbFZhbHVlT3B0aW9ucyAmIHsgZXh0cmFDbGFzc2VzOiBzdHJpbmdbXSB9ID0ge1xuXHRcdFx0dGl0bGU6ICcnLFxuXHRcdFx0Ym9sZDogdGhpcy5vcHRpb25zPy5ib2xkLFxuXHRcdFx0aXRhbGljOiB0aGlzLm9wdGlvbnM/Lml0YWxpYyxcblx0XHRcdHN0cmlrZXRocm91Z2g6IHRoaXMub3B0aW9ucz8uc3RyaWtldGhyb3VnaCxcblx0XHRcdG1hdGNoZXM6IHRoaXMub3B0aW9ucz8ubWF0Y2hlcyxcblx0XHRcdGRlc2NyaXB0aW9uTWF0Y2hlczogdGhpcy5vcHRpb25zPy5kZXNjcmlwdGlvbk1hdGNoZXMsXG5cdFx0XHRleHRyYUNsYXNzZXM6IFtdLFxuXHRcdFx0c2VwYXJhdG9yOiB0aGlzLm9wdGlvbnM/LnNlcGFyYXRvcixcblx0XHRcdGRvbUlkOiB0aGlzLm9wdGlvbnM/LmRvbUlkLFxuXHRcdFx0ZGlzYWJsZWRDb21tYW5kOiB0aGlzLm9wdGlvbnM/LmRpc2FibGVkQ29tbWFuZCxcblx0XHRcdGxhYmVsRXNjYXBlTmV3TGluZXM6IHRoaXMub3B0aW9ucz8ubGFiZWxFc2NhcGVOZXdMaW5lcyxcblx0XHRcdGRlc2NyaXB0aW9uVGl0bGU6IHRoaXMub3B0aW9ucz8uZGVzY3JpcHRpb25UaXRsZSxcblx0XHRcdHN1cHBvcnRJY29uczogdGhpcy5vcHRpb25zPy5zdXBwb3J0SWNvbnMsXG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gdG9SZXNvdXJjZSh0aGlzLmxhYmVsKTtcblxuXHRcdGlmICh0aGlzLm9wdGlvbnM/LnRpdGxlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGljb25MYWJlbE9wdGlvbnMudGl0bGUgPSB0aGlzLm9wdGlvbnMudGl0bGU7XG5cdFx0fVxuXG5cdFx0aWYgKHJlc291cmNlICYmIHJlc291cmNlLnNjaGVtZSAhPT0gU2NoZW1hcy5kYXRhIC8qIGRvIG5vdCBhY2NpZGVudGFsbHkgaW5saW5lIERhdGEgVVJJcyAqL1xuXHRcdFx0JiYgKFxuXHRcdFx0XHQoIXRoaXMub3B0aW9ucz8udGl0bGUpXG5cdFx0XHRcdHx8ICgodHlwZW9mIHRoaXMub3B0aW9ucy50aXRsZSAhPT0gJ3N0cmluZycpICYmICF0aGlzLm9wdGlvbnMudGl0bGUubWFya2Rvd25Ob3RTdXBwb3J0ZWRGYWxsYmFjaylcblx0XHRcdCkpIHtcblxuXHRcdFx0aWYgKCF0aGlzLmNvbXB1dGVkUGF0aExhYmVsKSB7XG5cdFx0XHRcdHRoaXMuY29tcHV0ZWRQYXRoTGFiZWwgPSB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChyZXNvdXJjZSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghaWNvbkxhYmVsT3B0aW9ucy50aXRsZSB8fCAodHlwZW9mIGljb25MYWJlbE9wdGlvbnMudGl0bGUgPT09ICdzdHJpbmcnKSkge1xuXHRcdFx0XHRpY29uTGFiZWxPcHRpb25zLnRpdGxlID0gdGhpcy5jb21wdXRlZFBhdGhMYWJlbDtcblx0XHRcdH0gZWxzZSBpZiAoIWljb25MYWJlbE9wdGlvbnMudGl0bGUubWFya2Rvd25Ob3RTdXBwb3J0ZWRGYWxsYmFjaykge1xuXHRcdFx0XHRpY29uTGFiZWxPcHRpb25zLnRpdGxlLm1hcmtkb3duTm90U3VwcG9ydGVkRmFsbGJhY2sgPSB0aGlzLmNvbXB1dGVkUGF0aExhYmVsO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLm9wdGlvbnMgJiYgIXRoaXMub3B0aW9ucy5oaWRlSWNvbikge1xuXHRcdFx0aWYgKCF0aGlzLmNvbXB1dGVkSWNvbkNsYXNzZXMpIHtcblx0XHRcdFx0dGhpcy5jb21wdXRlZEljb25DbGFzc2VzID0gZ2V0SWNvbkNsYXNzZXModGhpcy5tb2RlbFNlcnZpY2UsIHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLCByZXNvdXJjZSwgdGhpcy5vcHRpb25zLmZpbGVLaW5kLCB0aGlzLm9wdGlvbnMuaWNvbik7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChVUkkuaXNVcmkodGhpcy5vcHRpb25zLmljb24pKSB7XG5cdFx0XHRcdGljb25MYWJlbE9wdGlvbnMuaWNvblBhdGggPSB0aGlzLm9wdGlvbnMuaWNvbjtcblx0XHRcdH1cblxuXHRcdFx0aWNvbkxhYmVsT3B0aW9ucy5leHRyYUNsYXNzZXMgPSB0aGlzLmNvbXB1dGVkSWNvbkNsYXNzZXMuc2xpY2UoMCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMub3B0aW9ucz8uZXh0cmFDbGFzc2VzKSB7XG5cdFx0XHRpY29uTGFiZWxPcHRpb25zLmV4dHJhQ2xhc3Nlcy5wdXNoKC4uLnRoaXMub3B0aW9ucy5leHRyYUNsYXNzZXMpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLm9wdGlvbnM/LmZpbGVEZWNvcmF0aW9ucyAmJiByZXNvdXJjZSkge1xuXHRcdFx0aWYgKG9wdGlvbnMudXBkYXRlRGVjb3JhdGlvbikge1xuXHRcdFx0XHR0aGlzLmRlY29yYXRpb24udmFsdWUgPSB0aGlzLmRlY29yYXRpb25zU2VydmljZS5nZXREZWNvcmF0aW9uKHJlc291cmNlLCB0aGlzLm9wdGlvbnMuZmlsZUtpbmQgIT09IEZpbGVLaW5kLkZJTEUpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkZWNvcmF0aW9uID0gdGhpcy5kZWNvcmF0aW9uLnZhbHVlO1xuXHRcdFx0aWYgKGRlY29yYXRpb24pIHtcblx0XHRcdFx0aWYgKGRlY29yYXRpb24udG9vbHRpcCkge1xuXHRcdFx0XHRcdGlmICh0eXBlb2YgaWNvbkxhYmVsT3B0aW9ucy50aXRsZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdGljb25MYWJlbE9wdGlvbnMudGl0bGUgPSBgJHtpY29uTGFiZWxPcHRpb25zLnRpdGxlfSBcdTIwMjIgJHtkZWNvcmF0aW9uLnRvb2x0aXB9YDtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiBpY29uTGFiZWxPcHRpb25zLnRpdGxlPy5tYXJrZG93biA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHRpdGxlID0gYCR7aWNvbkxhYmVsT3B0aW9ucy50aXRsZS5tYXJrZG93bn0gXHUyMDIyICR7ZGVjb3JhdGlvbi50b29sdGlwfWA7XG5cdFx0XHRcdFx0XHRpY29uTGFiZWxPcHRpb25zLnRpdGxlID0geyBtYXJrZG93bjogdGl0bGUsIG1hcmtkb3duTm90U3VwcG9ydGVkRmFsbGJhY2s6IHRpdGxlIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGRlY29yYXRpb24uc3RyaWtldGhyb3VnaCkge1xuXHRcdFx0XHRcdGljb25MYWJlbE9wdGlvbnMuc3RyaWtldGhyb3VnaCA9IHRydWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodGhpcy5vcHRpb25zLmZpbGVEZWNvcmF0aW9ucy5jb2xvcnMpIHtcblx0XHRcdFx0XHRpY29uTGFiZWxPcHRpb25zLmV4dHJhQ2xhc3Nlcy5wdXNoKGRlY29yYXRpb24ubGFiZWxDbGFzc05hbWUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHRoaXMub3B0aW9ucy5maWxlRGVjb3JhdGlvbnMuYmFkZ2VzKSB7XG5cdFx0XHRcdFx0aWNvbkxhYmVsT3B0aW9ucy5leHRyYUNsYXNzZXMucHVzaChkZWNvcmF0aW9uLmJhZGdlQ2xhc3NOYW1lKTtcblx0XHRcdFx0XHRpY29uTGFiZWxPcHRpb25zLmV4dHJhQ2xhc3Nlcy5wdXNoKGRlY29yYXRpb24uaWNvbkNsYXNzTmFtZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5sYWJlbC5yYW5nZSkge1xuXHRcdFx0aWNvbkxhYmVsT3B0aW9ucy5zdWZmaXggPSB0aGlzLmxhYmVsLnJhbmdlLnN0YXJ0TGluZU51bWJlciAhPT0gdGhpcy5sYWJlbC5yYW5nZS5lbmRMaW5lTnVtYmVyID9cblx0XHRcdFx0YDoke3RoaXMubGFiZWwucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyfS0ke3RoaXMubGFiZWwucmFuZ2UuZW5kTGluZU51bWJlcn1gIDpcblx0XHRcdFx0YDoke3RoaXMubGFiZWwucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyfWA7XG5cdFx0fVxuXG5cdFx0dGhpcy5zZXRMYWJlbCh0aGlzLmxhYmVsLm5hbWUgPz8gJycsIHRoaXMubGFiZWwuZGVzY3JpcHRpb24sIGljb25MYWJlbE9wdGlvbnMpO1xuXG5cdFx0dGhpcy5fb25EaWRSZW5kZXIuZmlyZSgpO1xuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblxuXHRcdHRoaXMubGFiZWwgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5vcHRpb25zID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuY29tcHV0ZWRMYW5ndWFnZUlkID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuY29tcHV0ZWRJY29uQ2xhc3NlcyA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmNvbXB1dGVkUGF0aExhYmVsID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuY29tcHV0ZWRXb3Jrc3BhY2VGb2xkZXJMYWJlbCA9IHVuZGVmaW5lZDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxTQUFTLFNBQVMsMkJBQTJCO0FBQ3RELFNBQVMsaUJBQW9FO0FBQzdFLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQXNCLDJCQUEyRDtBQUNqRixTQUFTLGVBQWU7QUFDeEIsU0FBUyxVQUFVLGlDQUFpQztBQUVwRCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLE9BQU8sZUFBZTtBQUMvQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFlBQVksU0FBc0IseUJBQXlCO0FBQ3BFLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNEJBQTRCO0FBR3JDLFNBQVMsMEJBQTBCLGdDQUFnQztBQVNuRSxTQUFTLFdBQVcsT0FBeUQ7QUFDNUUsTUFBSSxDQUFDLE9BQU8sVUFBVTtBQUNyQixXQUFPO0FBQUEsRUFDUjtBQUVBLE1BQUksSUFB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
