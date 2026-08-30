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
import { compareFileNames } from "../../../../base/common/comparers.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { createMatches } from "../../../../base/common/filters.js";
import * as glob from "../../../../base/common/glob.js";
import { DisposableStore, MutableDisposable, Disposable } from "../../../../base/common/lifecycle.js";
import { posix, relative } from "../../../../base/common/path.js";
import { basename, dirname, isEqual } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import "./media/breadcrumbscontrol.css";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { FileKind, FileSystemProviderCapabilities, IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { WorkbenchDataTree, WorkbenchAsyncDataTree } from "../../../../platform/list/browser/listService.js";
import { breadcrumbsPickerBackground, widgetBorder } from "../../../../platform/theme/common/colorRegistry.js";
import { isWorkspace, isWorkspaceFolder, IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { ResourceLabels, DEFAULT_LABELS_CONTAINER } from "../../labels.js";
import { BreadcrumbsConfig } from "./breadcrumbs.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { localize } from "../../../../nls.js";
import { IEditorService, SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
let BreadcrumbsPicker = class {
  constructor(parent, resource, _instantiationService, _themeService, _configurationService) {
    this.resource = resource;
    this._instantiationService = _instantiationService;
    this._themeService = _themeService;
    this._configurationService = _configurationService;
    this._disposables = new DisposableStore();
    this._fakeEvent = new UIEvent("fakeEvent");
    this._onWillPickElement = new Emitter();
    this.onWillPickElement = this._onWillPickElement.event;
    this._previewDispoables = new MutableDisposable();
    this._domNode = document.createElement("div");
    this._domNode.className = "monaco-breadcrumbs-picker show-file-icons";
    parent.appendChild(this._domNode);
  }
  dispose() {
    this._disposables.dispose();
    this._previewDispoables.dispose();
    this._onWillPickElement.dispose();
    this._domNode.remove();
    setTimeout(() => this._tree.dispose(), 0);
  }
  async show(input, maxHeight, width, arrowSize, arrowOffset) {
    const theme = this._themeService.getColorTheme();
    const color = theme.getColor(breadcrumbsPickerBackground);
    this._arrow = document.createElement("div");
    this._arrow.className = "arrow";
    this._arrow.style.borderColor = `transparent transparent ${color ? color.toString() : ""}`;
    this._domNode.appendChild(this._arrow);
    this._treeContainer = document.createElement("div");
    this._treeContainer.style.background = color ? color.toString() : "";
    this._treeContainer.style.paddingTop = "2px";
    this._treeContainer.style.borderRadius = "3px";
    this._treeContainer.style.boxShadow = "var(--vscode-shadow-lg)";
    this._treeContainer.style.border = `1px solid ${this._themeService.getColorTheme().getColor(widgetBorder)}`;
    this._domNode.appendChild(this._treeContainer);
    this._layoutInfo = { maxHeight, width, arrowSize, arrowOffset, inputHeight: 0 };
    this._tree = this._createTree(this._treeContainer, input);
    this._disposables.add(this._tree.onDidOpen(async (e) => {
      const { element, editorOptions, sideBySide } = e;
      const didReveal = await this._revealElement(element, { ...editorOptions, preserveFocus: false }, sideBySide);
      if (!didReveal) {
        return;
      }
    }));
    this._disposables.add(this._tree.onDidChangeFocus((e) => {
      this._previewDispoables.value = this._previewElement(e.elements[0]);
    }));
    this._disposables.add(this._tree.onDidChangeContentHeight(() => {
      this._layout();
    }));
    this._domNode.focus();
    try {
      await this._setInput(input);
      this._layout();
    } catch (err) {
      onUnexpectedError(err);
    }
  }
  _layout() {
    const headerHeight = 2 * this._layoutInfo.arrowSize;
    const treeHeight = Math.min(this._layoutInfo.maxHeight - headerHeight, this._tree.contentHeight);
    const totalHeight = treeHeight + headerHeight;
    this._domNode.style.height = `${totalHeight}px`;
    this._domNode.style.width = `${this._layoutInfo.width}px`;
    this._arrow.style.top = `-${2 * this._layoutInfo.arrowSize}px`;
    this._arrow.style.borderWidth = `${this._layoutInfo.arrowSize}px`;
    this._arrow.style.marginLeft = `${this._layoutInfo.arrowOffset}px`;
    this._treeContainer.style.height = `${treeHeight}px`;
    this._treeContainer.style.width = `${this._layoutInfo.width}px`;
    this._tree.layout(treeHeight, this._layoutInfo.width);
  }
  restoreViewState() {
  }
};
BreadcrumbsPicker = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IThemeService),
  __decorateParam(4, IConfigurationService)
], BreadcrumbsPicker);
class FileVirtualDelegate {
  getHeight(_element) {
    return 22;
  }
  getTemplateId(_element) {
    return "FileStat";
  }
}
class FileIdentityProvider {
  getId(element) {
    if (URI.isUri(element)) {
      return element.toString();
    } else if (isWorkspace(element)) {
      return element.id;
    } else if (isWorkspaceFolder(element)) {
      return element.uri.toString();
    } else {
      return element.resource.toString();
    }
  }
}
let FileDataSource = class {
  constructor(_fileService) {
    this._fileService = _fileService;
  }
  hasChildren(element) {
    return URI.isUri(element) || isWorkspace(element) || isWorkspaceFolder(element) || element.isDirectory;
  }
  async getChildren(element) {
    if (isWorkspace(element)) {
      return element.folders;
    }
    let uri;
    if (isWorkspaceFolder(element)) {
      uri = element.uri;
    } else if (URI.isUri(element)) {
      uri = element;
    } else {
      uri = element.resource;
    }
    const stat = await this._fileService.resolve(uri);
    return stat.children ?? [];
  }
};
FileDataSource = __decorateClass([
  __decorateParam(0, IFileService)
], FileDataSource);
let FileRenderer = class {
  constructor(_labels, _configService) {
    this._labels = _labels;
    this._configService = _configService;
    this.templateId = "FileStat";
  }
  renderTemplate(container) {
    return this._labels.create(container, { supportHighlights: true });
  }
  renderElement(node, index, templateData) {
    const fileDecorations = this._configService.getValue("explorer.decorations");
    const { element } = node;
    let resource;
    let fileKind;
    if (isWorkspaceFolder(element)) {
      resource = element.uri;
      fileKind = FileKind.ROOT_FOLDER;
    } else {
      resource = element.resource;
      fileKind = element.isDirectory ? FileKind.FOLDER : FileKind.FILE;
    }
    templateData.setFile(resource, {
      fileKind,
      hidePath: true,
      fileDecorations,
      matches: createMatches(node.filterData),
      extraClasses: ["picker-item"]
    });
  }
  disposeTemplate(templateData) {
    templateData.dispose();
  }
};
FileRenderer = __decorateClass([
  __decorateParam(1, IConfigurationService)
], FileRenderer);
class FileNavigationLabelProvider {
  getKeyboardNavigationLabel(element) {
    return element.name;
  }
}
class FileAccessibilityProvider {
  getWidgetAriaLabel() {
    return localize("breadcrumbs", "Breadcrumbs");
  }
  getAriaLabel(element) {
    return element.name;
  }
}
let FileFilter = class {
  constructor(_workspaceService, configService, fileService) {
    this._workspaceService = _workspaceService;
    this._cachedExpressions = /* @__PURE__ */ new Map();
    this._disposables = new DisposableStore();
    const config = BreadcrumbsConfig.FileExcludes.bindTo(configService);
    const update = () => {
      _workspaceService.getWorkspace().folders.forEach((folder) => {
        const excludesConfig = config.getValue({ resource: folder.uri });
        if (!excludesConfig) {
          return;
        }
        const adjustedConfig = {};
        for (const pattern in excludesConfig) {
          if (typeof excludesConfig[pattern] !== "boolean") {
            continue;
          }
          const patternAbs = pattern.indexOf("**/") !== 0 ? posix.join(folder.uri.path, pattern) : pattern;
          adjustedConfig[patternAbs] = excludesConfig[pattern];
        }
        const ignoreCase = !fileService.hasCapability(folder.uri, FileSystemProviderCapabilities.PathCaseSensitive);
        this._cachedExpressions.set(folder.uri.toString(), glob.parse(adjustedConfig, { ignoreCase }));
      });
    };
    update();
    this._disposables.add(config);
    this._disposables.add(config.onDidChange(update));
    this._disposables.add(_workspaceService.onDidChangeWorkspaceFolders(update));
  }
  dispose() {
    this._disposables.dispose();
  }
  filter(element, _parentVisibility) {
    if (isWorkspaceFolder(element)) {
      return true;
    }
    const folder = this._workspaceService.getWorkspaceFolder(element.resource);
    if (!folder || !this._cachedExpressions.has(folder.uri.toString())) {
      return true;
    }
    const expression = this._cachedExpressions.get(folder.uri.toString());
    return !expression(relative(folder.uri.path, element.resource.path), basename(element.resource));
  }
};
FileFilter = __decorateClass([
  __decorateParam(0, IWorkspaceContextService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IFileService)
], FileFilter);
class FileSorter {
  compare(a, b) {
    if (isWorkspaceFolder(a) && isWorkspaceFolder(b)) {
      return a.index - b.index;
    }
    if (a.isDirectory === b.isDirectory) {
      return compareFileNames(a.name, b.name);
    } else if (a.isDirectory) {
      return -1;
    } else {
      return 1;
    }
  }
}
let BreadcrumbsFilePicker = class extends BreadcrumbsPicker {
  constructor(parent, resource, instantiationService, themeService, configService, _workspaceService, _editorService) {
    super(parent, resource, instantiationService, themeService, configService);
    this._workspaceService = _workspaceService;
    this._editorService = _editorService;
  }
  _createTree(container) {
    this._treeContainer.classList.add("file-icon-themable-tree");
    this._treeContainer.classList.add("show-file-icons");
    const onFileIconThemeChange = (fileIconTheme) => {
      this._treeContainer.classList.toggle("align-icons-and-twisties", fileIconTheme.hasFileIcons && !fileIconTheme.hasFolderIcons);
      this._treeContainer.classList.toggle("hide-arrows", fileIconTheme.hidesExplorerArrows === true);
    };
    this._disposables.add(this._themeService.onDidFileIconThemeChange(onFileIconThemeChange));
    onFileIconThemeChange(this._themeService.getFileIconTheme());
    const labels = this._instantiationService.createInstance(
      ResourceLabels,
      DEFAULT_LABELS_CONTAINER
      /* TODO@Jo visibility propagation */
    );
    this._disposables.add(labels);
    return this._instantiationService.createInstance(
      WorkbenchAsyncDataTree,
      "BreadcrumbsFilePicker",
      container,
      new FileVirtualDelegate(),
      [this._instantiationService.createInstance(FileRenderer, labels)],
      this._instantiationService.createInstance(FileDataSource),
      {
        multipleSelectionSupport: false,
        sorter: new FileSorter(),
        filter: this._instantiationService.createInstance(FileFilter),
        identityProvider: new FileIdentityProvider(),
        keyboardNavigationLabelProvider: new FileNavigationLabelProvider(),
        accessibilityProvider: this._instantiationService.createInstance(FileAccessibilityProvider),
        showNotFoundMessage: false,
        overrideStyles: {
          listBackground: breadcrumbsPickerBackground
        }
      }
    );
  }
  async _setInput(element) {
    const { uri, kind } = element;
    let input;
    if (kind === FileKind.ROOT_FOLDER) {
      input = this._workspaceService.getWorkspace();
    } else {
      input = dirname(uri);
    }
    const tree = this._tree;
    await tree.setInput(input);
    let focusElement;
    for (const { element: element2 } of tree.getNode().children) {
      if (isWorkspaceFolder(element2) && isEqual(element2.uri, uri)) {
        focusElement = element2;
        break;
      } else if (isEqual(element2.resource, uri)) {
        focusElement = element2;
        break;
      }
    }
    if (focusElement) {
      tree.reveal(focusElement, 0.5);
      tree.setFocus([focusElement], this._fakeEvent);
    }
    tree.domFocus();
  }
  _previewElement(_element) {
    return Disposable.None;
  }
  async _revealElement(element, options, sideBySide) {
    if (!isWorkspaceFolder(element) && element.isFile) {
      this._onWillPickElement.fire();
      await this._editorService.openEditor({ resource: element.resource, options }, sideBySide ? SIDE_GROUP : void 0);
      return true;
    }
    return false;
  }
};
BreadcrumbsFilePicker = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IThemeService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IWorkspaceContextService),
  __decorateParam(6, IEditorService)
], BreadcrumbsFilePicker);
let OutlineTreeSorter = class {
  constructor(comparator, uri, configService) {
    this.comparator = comparator;
    this._order = configService.getValue(uri, "breadcrumbs.symbolSortOrder");
  }
  compare(a, b) {
    if (this._order === "name") {
      return this.comparator.compareByName(a, b);
    } else if (this._order === "type") {
      return this.comparator.compareByType(a, b);
    } else {
      return this.comparator.compareByPosition(a, b);
    }
  }
};
OutlineTreeSorter = __decorateClass([
  __decorateParam(2, ITextResourceConfigurationService)
], OutlineTreeSorter);
class BreadcrumbsOutlinePicker extends BreadcrumbsPicker {
  _createTree(container, input) {
    const { config } = input.outline;
    return this._instantiationService.createInstance(
      WorkbenchDataTree,
      "BreadcrumbsOutlinePicker",
      container,
      config.delegate,
      config.renderers,
      config.treeDataSource,
      {
        ...config.options,
        sorter: this._instantiationService.createInstance(OutlineTreeSorter, config.comparator, void 0),
        collapseByDefault: true,
        expandOnlyOnTwistieClick: true,
        multipleSelectionSupport: false,
        showNotFoundMessage: false
      }
    );
  }
  _setInput(input) {
    const viewState = input.outline.captureViewState();
    this.restoreViewState = () => {
      viewState.dispose();
    };
    const tree = this._tree;
    tree.setInput(input.outline);
    if (input.element !== input.outline) {
      tree.reveal(input.element, 0.5);
      tree.setFocus([input.element], this._fakeEvent);
    }
    tree.domFocus();
    return Promise.resolve();
  }
  _previewElement(element) {
    const outline = this._tree.getInput();
    return outline.preview(element);
  }
  async _revealElement(element, options, sideBySide) {
    this._onWillPickElement.fire();
    const outline = this._tree.getInput();
    await outline.reveal(element, options, sideBySide, false);
    return true;
  }
}
export {
  BreadcrumbsFilePicker,
  BreadcrumbsOutlinePicker,
  BreadcrumbsPicker,
  FileSorter
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxlZGl0b3JcXGJyZWFkY3J1bWJzUGlja2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgY29tcGFyZUZpbGVOYW1lcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbXBhcmVycy5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGNyZWF0ZU1hdGNoZXMsIEZ1enp5U2NvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCAqIGFzIGdsb2IgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZ2xvYi5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSwgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBwb3NpeCwgcmVsYXRpdmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBkaXJuYW1lLCBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgJy4vbWVkaWEvYnJlYWRjcnVtYnNjb250cm9sLmNzcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEZpbGVLaW5kLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMsIElGaWxlU2VydmljZSwgSUZpbGVTdGF0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoRGF0YVRyZWUsIFdvcmtiZW5jaEFzeW5jRGF0YVRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYnJlYWRjcnVtYnNQaWNrZXJCYWNrZ3JvdW5kLCB3aWRnZXRCb3JkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBpc1dvcmtzcGFjZSwgaXNXb3Jrc3BhY2VGb2xkZXIsIElXb3Jrc3BhY2UsIElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVdvcmtzcGFjZUZvbGRlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTGFiZWxzLCBJUmVzb3VyY2VMYWJlbCwgREVGQVVMVF9MQUJFTFNfQ09OVEFJTkVSIH0gZnJvbSAnLi4vLi4vbGFiZWxzLmpzJztcbmltcG9ydCB7IEJyZWFkY3J1bWJzQ29uZmlnIH0gZnJvbSAnLi9icmVhZGNydW1icy5qcyc7XG5pbXBvcnQgeyBPdXRsaW5lRWxlbWVudDIsIEZpbGVFbGVtZW50IH0gZnJvbSAnLi9icmVhZGNydW1ic01vZGVsLmpzJztcbmltcG9ydCB7IElBc3luY0RhdGFTb3VyY2UsIElUcmVlUmVuZGVyZXIsIElUcmVlTm9kZSwgSVRyZWVGaWx0ZXIsIFRyZWVWaXNpYmlsaXR5LCBJVHJlZVNvcnRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgSUlkZW50aXR5UHJvdmlkZXIsIElMaXN0VmlydHVhbERlbGVnYXRlLCBJS2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgSUZpbGVJY29uVGhlbWUsIElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJT3V0bGluZSwgSU91dGxpbmVDb21wYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvb3V0bGluZS9icm93c2VyL291dGxpbmUuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSwgU0lERV9HUk9VUCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb24uanMnO1xuXG5pbnRlcmZhY2UgSUxheW91dEluZm8ge1xuXHRtYXhIZWlnaHQ6IG51bWJlcjtcblx0d2lkdGg6IG51bWJlcjtcblx0YXJyb3dTaXplOiBudW1iZXI7XG5cdGFycm93T2Zmc2V0OiBudW1iZXI7XG5cdGlucHV0SGVpZ2h0OiBudW1iZXI7XG59XG5cbnR5cGUgVHJlZTxJLCBFPiA9IFdvcmtiZW5jaERhdGFUcmVlPEksIEUsIEZ1enp5U2NvcmU+IHwgV29ya2JlbmNoQXN5bmNEYXRhVHJlZTxJLCBFLCBGdXp6eVNjb3JlPjtcblxuZXhwb3J0IGludGVyZmFjZSBTZWxlY3RFdmVudCB7XG5cdHRhcmdldDogdW5rbm93bjtcblx0YnJvd3NlckV2ZW50OiBVSUV2ZW50O1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQnJlYWRjcnVtYnNQaWNrZXI8VElucHV0LCBURWxlbWVudD4ge1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByb3RlY3RlZCByZWFkb25seSBfZG9tTm9kZTogSFRNTERpdkVsZW1lbnQ7XG5cdHByb3RlY3RlZCBfYXJyb3chOiBIVE1MRGl2RWxlbWVudDtcblx0cHJvdGVjdGVkIF90cmVlQ29udGFpbmVyITogSFRNTERpdkVsZW1lbnQ7XG5cdHByb3RlY3RlZCBfdHJlZSE6IFRyZWU8VElucHV0LCBURWxlbWVudD47XG5cdHByb3RlY3RlZCBfZmFrZUV2ZW50ID0gbmV3IFVJRXZlbnQoJ2Zha2VFdmVudCcpO1xuXHRwcm90ZWN0ZWQgX2xheW91dEluZm8hOiBJTGF5b3V0SW5mbztcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uV2lsbFBpY2tFbGVtZW50ID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cmVhZG9ubHkgb25XaWxsUGlja0VsZW1lbnQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25XaWxsUGlja0VsZW1lbnQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJldmlld0Rpc3BvYWJsZXMgPSBuZXcgTXV0YWJsZURpc3Bvc2FibGUoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwYXJlbnQ6IEhUTUxFbGVtZW50LFxuXHRcdHByb3RlY3RlZCByZXNvdXJjZTogVVJJLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLl9kb21Ob2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGhpcy5fZG9tTm9kZS5jbGFzc05hbWUgPSAnbW9uYWNvLWJyZWFkY3J1bWJzLXBpY2tlciBzaG93LWZpbGUtaWNvbnMnO1xuXHRcdHBhcmVudC5hcHBlbmRDaGlsZCh0aGlzLl9kb21Ob2RlKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3ByZXZpZXdEaXNwb2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbldpbGxQaWNrRWxlbWVudC5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fZG9tTm9kZS5yZW1vdmUoKTtcblx0XHRzZXRUaW1lb3V0KCgpID0+IHRoaXMuX3RyZWUuZGlzcG9zZSgpLCAwKTsgLy8gdHJlZSBjYW5ub3QgYmUgZGlzcG9zZWQgd2hpbGUgYmVpbmcgb3BlbmVkLi4uXG5cdH1cblxuXHRhc3luYyBzaG93KGlucHV0OiBGaWxlRWxlbWVudCB8IE91dGxpbmVFbGVtZW50MiwgbWF4SGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGFycm93U2l6ZTogbnVtYmVyLCBhcnJvd09mZnNldDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHRjb25zdCB0aGVtZSA9IHRoaXMuX3RoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCk7XG5cdFx0Y29uc3QgY29sb3IgPSB0aGVtZS5nZXRDb2xvcihicmVhZGNydW1ic1BpY2tlckJhY2tncm91bmQpO1xuXG5cdFx0dGhpcy5fYXJyb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLl9hcnJvdy5jbGFzc05hbWUgPSAnYXJyb3cnO1xuXHRcdHRoaXMuX2Fycm93LnN0eWxlLmJvcmRlckNvbG9yID0gYHRyYW5zcGFyZW50IHRyYW5zcGFyZW50ICR7Y29sb3IgPyBjb2xvci50b1N0cmluZygpIDogJyd9YDtcblx0XHR0aGlzLl9kb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMuX2Fycm93KTtcblxuXHRcdHRoaXMuX3RyZWVDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLl90cmVlQ29udGFpbmVyLnN0eWxlLmJhY2tncm91bmQgPSBjb2xvciA/IGNvbG9yLnRvU3RyaW5nKCkgOiAnJztcblx0XHR0aGlzLl90cmVlQ29udGFpbmVyLnN0eWxlLnBhZGRpbmdUb3AgPSAnMnB4Jztcblx0XHR0aGlzLl90cmVlQ29udGFpbmVyLnN0eWxlLmJvcmRlclJhZGl1cyA9ICczcHgnO1xuXHRcdHRoaXMuX3RyZWVDb250YWluZXIuc3R5bGUuYm94U2hhZG93ID0gJ3ZhcigtLXZzY29kZS1zaGFkb3ctbGcpJztcblx0XHR0aGlzLl90cmVlQ29udGFpbmVyLnN0eWxlLmJvcmRlciA9IGAxcHggc29saWQgJHt0aGlzLl90aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLmdldENvbG9yKHdpZGdldEJvcmRlcil9YDtcblx0XHR0aGlzLl9kb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMuX3RyZWVDb250YWluZXIpO1xuXG5cdFx0dGhpcy5fbGF5b3V0SW5mbyA9IHsgbWF4SGVpZ2h0LCB3aWR0aCwgYXJyb3dTaXplLCBhcnJvd09mZnNldCwgaW5wdXRIZWlnaHQ6IDAgfTtcblx0XHR0aGlzLl90cmVlID0gdGhpcy5fY3JlYXRlVHJlZSh0aGlzLl90cmVlQ29udGFpbmVyLCBpbnB1dCk7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fdHJlZS5vbkRpZE9wZW4oYXN5bmMgZSA9PiB7XG5cdFx0XHRjb25zdCB7IGVsZW1lbnQsIGVkaXRvck9wdGlvbnMsIHNpZGVCeVNpZGUgfSA9IGU7XG5cdFx0XHRjb25zdCBkaWRSZXZlYWwgPSBhd2FpdCB0aGlzLl9yZXZlYWxFbGVtZW50KGVsZW1lbnQsIHsgLi4uZWRpdG9yT3B0aW9ucywgcHJlc2VydmVGb2N1czogZmFsc2UgfSwgc2lkZUJ5U2lkZSk7XG5cdFx0XHRpZiAoIWRpZFJldmVhbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl90cmVlLm9uRGlkQ2hhbmdlRm9jdXMoZSA9PiB7XG5cdFx0XHR0aGlzLl9wcmV2aWV3RGlzcG9hYmxlcy52YWx1ZSA9IHRoaXMuX3ByZXZpZXdFbGVtZW50KGUuZWxlbWVudHNbMF0pO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fdHJlZS5vbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fbGF5b3V0KCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fZG9tTm9kZS5mb2N1cygpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9zZXRJbnB1dChpbnB1dCk7XG5cdFx0XHR0aGlzLl9sYXlvdXQoKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycik7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIF9sYXlvdXQoKTogdm9pZCB7XG5cblx0XHRjb25zdCBoZWFkZXJIZWlnaHQgPSAyICogdGhpcy5fbGF5b3V0SW5mby5hcnJvd1NpemU7XG5cdFx0Y29uc3QgdHJlZUhlaWdodCA9IE1hdGgubWluKHRoaXMuX2xheW91dEluZm8ubWF4SGVpZ2h0IC0gaGVhZGVySGVpZ2h0LCB0aGlzLl90cmVlLmNvbnRlbnRIZWlnaHQpO1xuXHRcdGNvbnN0IHRvdGFsSGVpZ2h0ID0gdHJlZUhlaWdodCArIGhlYWRlckhlaWdodDtcblxuXHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUuaGVpZ2h0ID0gYCR7dG90YWxIZWlnaHR9cHhgO1xuXHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUud2lkdGggPSBgJHt0aGlzLl9sYXlvdXRJbmZvLndpZHRofXB4YDtcblx0XHR0aGlzLl9hcnJvdy5zdHlsZS50b3AgPSBgLSR7MiAqIHRoaXMuX2xheW91dEluZm8uYXJyb3dTaXplfXB4YDtcblx0XHR0aGlzLl9hcnJvdy5zdHlsZS5ib3JkZXJXaWR0aCA9IGAke3RoaXMuX2xheW91dEluZm8uYXJyb3dTaXplfXB4YDtcblx0XHR0aGlzLl9hcnJvdy5zdHlsZS5tYXJnaW5MZWZ0ID0gYCR7dGhpcy5fbGF5b3V0SW5mby5hcnJvd09mZnNldH1weGA7XG5cdFx0dGhpcy5fdHJlZUNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHt0cmVlSGVpZ2h0fXB4YDtcblx0XHR0aGlzLl90cmVlQ29udGFpbmVyLnN0eWxlLndpZHRoID0gYCR7dGhpcy5fbGF5b3V0SW5mby53aWR0aH1weGA7XG5cdFx0dGhpcy5fdHJlZS5sYXlvdXQodHJlZUhlaWdodCwgdGhpcy5fbGF5b3V0SW5mby53aWR0aCk7XG5cdH1cblxuXHRyZXN0b3JlVmlld1N0YXRlKCk6IHZvaWQgeyB9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IF9zZXRJbnB1dChlbGVtZW50OiBGaWxlRWxlbWVudCB8IE91dGxpbmVFbGVtZW50Mik6IFByb21pc2U8dm9pZD47XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfY3JlYXRlVHJlZShjb250YWluZXI6IEhUTUxFbGVtZW50LCBpbnB1dDogdW5rbm93bik6IFRyZWU8VElucHV0LCBURWxlbWVudD47XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfcHJldmlld0VsZW1lbnQoZWxlbWVudDogdW5rbm93bik6IElEaXNwb3NhYmxlO1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgX3JldmVhbEVsZW1lbnQoZWxlbWVudDogdW5rbm93biwgb3B0aW9uczogSUVkaXRvck9wdGlvbnMsIHNpZGVCeVNpZGU6IGJvb2xlYW4pOiBQcm9taXNlPGJvb2xlYW4+O1xuXG59XG5cbi8vI3JlZ2lvbiAtIEZpbGVzXG5cbmNsYXNzIEZpbGVWaXJ0dWFsRGVsZWdhdGUgaW1wbGVtZW50cyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxJRmlsZVN0YXQgfCBJV29ya3NwYWNlRm9sZGVyPiB7XG5cdGdldEhlaWdodChfZWxlbWVudDogSUZpbGVTdGF0IHwgSVdvcmtzcGFjZUZvbGRlcikge1xuXHRcdHJldHVybiAyMjtcblx0fVxuXHRnZXRUZW1wbGF0ZUlkKF9lbGVtZW50OiBJRmlsZVN0YXQgfCBJV29ya3NwYWNlRm9sZGVyKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gJ0ZpbGVTdGF0Jztcblx0fVxufVxuXG5jbGFzcyBGaWxlSWRlbnRpdHlQcm92aWRlciBpbXBsZW1lbnRzIElJZGVudGl0eVByb3ZpZGVyPElXb3Jrc3BhY2UgfCBJV29ya3NwYWNlRm9sZGVyIHwgSUZpbGVTdGF0IHwgVVJJPiB7XG5cdGdldElkKGVsZW1lbnQ6IElXb3Jrc3BhY2UgfCBJV29ya3NwYWNlRm9sZGVyIHwgSUZpbGVTdGF0IHwgVVJJKTogeyB0b1N0cmluZygpOiBzdHJpbmcgfSB7XG5cdFx0aWYgKFVSSS5pc1VyaShlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQudG9TdHJpbmcoKTtcblx0XHR9IGVsc2UgaWYgKGlzV29ya3NwYWNlKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gZWxlbWVudC5pZDtcblx0XHR9IGVsc2UgaWYgKGlzV29ya3NwYWNlRm9sZGVyKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gZWxlbWVudC51cmkudG9TdHJpbmcoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQucmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHR9XG5cdH1cbn1cblxuXG5jbGFzcyBGaWxlRGF0YVNvdXJjZSBpbXBsZW1lbnRzIElBc3luY0RhdGFTb3VyY2U8SVdvcmtzcGFjZSB8IFVSSSwgSVdvcmtzcGFjZUZvbGRlciB8IElGaWxlU3RhdD4ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0KSB7IH1cblxuXHRoYXNDaGlsZHJlbihlbGVtZW50OiBJV29ya3NwYWNlIHwgVVJJIHwgSVdvcmtzcGFjZUZvbGRlciB8IElGaWxlU3RhdCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBVUkkuaXNVcmkoZWxlbWVudClcblx0XHRcdHx8IGlzV29ya3NwYWNlKGVsZW1lbnQpXG5cdFx0XHR8fCBpc1dvcmtzcGFjZUZvbGRlcihlbGVtZW50KVxuXHRcdFx0fHwgZWxlbWVudC5pc0RpcmVjdG9yeTtcblx0fVxuXG5cdGFzeW5jIGdldENoaWxkcmVuKGVsZW1lbnQ6IElXb3Jrc3BhY2UgfCBVUkkgfCBJV29ya3NwYWNlRm9sZGVyIHwgSUZpbGVTdGF0KTogUHJvbWlzZTwoSVdvcmtzcGFjZUZvbGRlciB8IElGaWxlU3RhdClbXT4ge1xuXHRcdGlmIChpc1dvcmtzcGFjZShlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQuZm9sZGVycztcblx0XHR9XG5cdFx0bGV0IHVyaTogVVJJO1xuXHRcdGlmIChpc1dvcmtzcGFjZUZvbGRlcihlbGVtZW50KSkge1xuXHRcdFx0dXJpID0gZWxlbWVudC51cmk7XG5cdFx0fSBlbHNlIGlmIChVUkkuaXNVcmkoZWxlbWVudCkpIHtcblx0XHRcdHVyaSA9IGVsZW1lbnQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHVyaSA9IGVsZW1lbnQucmVzb3VyY2U7XG5cdFx0fVxuXHRcdGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZXNvbHZlKHVyaSk7XG5cdFx0cmV0dXJuIHN0YXQuY2hpbGRyZW4gPz8gW107XG5cdH1cbn1cblxuY2xhc3MgRmlsZVJlbmRlcmVyIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxJRmlsZVN0YXQgfCBJV29ya3NwYWNlRm9sZGVyLCBGdXp6eVNjb3JlLCBJUmVzb3VyY2VMYWJlbD4ge1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZyA9ICdGaWxlU3RhdCc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbGFiZWxzOiBSZXNvdXJjZUxhYmVscyxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ1NlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7IH1cblxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJUmVzb3VyY2VMYWJlbCB7XG5cdFx0cmV0dXJuIHRoaXMuX2xhYmVscy5jcmVhdGUoY29udGFpbmVyLCB7IHN1cHBvcnRIaWdobGlnaHRzOiB0cnVlIH0pO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8SVdvcmtzcGFjZUZvbGRlciB8IElGaWxlU3RhdCwgW251bWJlciwgbnVtYmVyLCBudW1iZXJdPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJUmVzb3VyY2VMYWJlbCk6IHZvaWQge1xuXHRcdGNvbnN0IGZpbGVEZWNvcmF0aW9ucyA9IHRoaXMuX2NvbmZpZ1NlcnZpY2UuZ2V0VmFsdWU8eyBjb2xvcnM6IGJvb2xlYW47IGJhZGdlczogYm9vbGVhbiB9PignZXhwbG9yZXIuZGVjb3JhdGlvbnMnKTtcblx0XHRjb25zdCB7IGVsZW1lbnQgfSA9IG5vZGU7XG5cdFx0bGV0IHJlc291cmNlOiBVUkk7XG5cdFx0bGV0IGZpbGVLaW5kOiBGaWxlS2luZDtcblx0XHRpZiAoaXNXb3Jrc3BhY2VGb2xkZXIoZWxlbWVudCkpIHtcblx0XHRcdHJlc291cmNlID0gZWxlbWVudC51cmk7XG5cdFx0XHRmaWxlS2luZCA9IEZpbGVLaW5kLlJPT1RfRk9MREVSO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXNvdXJjZSA9IGVsZW1lbnQucmVzb3VyY2U7XG5cdFx0XHRmaWxlS2luZCA9IGVsZW1lbnQuaXNEaXJlY3RvcnkgPyBGaWxlS2luZC5GT0xERVIgOiBGaWxlS2luZC5GSUxFO1xuXHRcdH1cblx0XHR0ZW1wbGF0ZURhdGEuc2V0RmlsZShyZXNvdXJjZSwge1xuXHRcdFx0ZmlsZUtpbmQsXG5cdFx0XHRoaWRlUGF0aDogdHJ1ZSxcblx0XHRcdGZpbGVEZWNvcmF0aW9uczogZmlsZURlY29yYXRpb25zLFxuXHRcdFx0bWF0Y2hlczogY3JlYXRlTWF0Y2hlcyhub2RlLmZpbHRlckRhdGEpLFxuXHRcdFx0ZXh0cmFDbGFzc2VzOiBbJ3BpY2tlci1pdGVtJ11cblx0XHR9KTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElSZXNvdXJjZUxhYmVsKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBGaWxlTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXIgaW1wbGVtZW50cyBJS2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcjxJV29ya3NwYWNlRm9sZGVyIHwgSUZpbGVTdGF0PiB7XG5cblx0Z2V0S2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWwoZWxlbWVudDogSVdvcmtzcGFjZUZvbGRlciB8IElGaWxlU3RhdCk6IHsgdG9TdHJpbmcoKTogc3RyaW5nIH0ge1xuXHRcdHJldHVybiBlbGVtZW50Lm5hbWU7XG5cdH1cbn1cblxuY2xhc3MgRmlsZUFjY2Vzc2liaWxpdHlQcm92aWRlciBpbXBsZW1lbnRzIElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyPElXb3Jrc3BhY2VGb2xkZXIgfCBJRmlsZVN0YXQ+IHtcblxuXHRnZXRXaWRnZXRBcmlhTGFiZWwoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ2JyZWFkY3J1bWJzJywgXCJCcmVhZGNydW1ic1wiKTtcblx0fVxuXG5cdGdldEFyaWFMYWJlbChlbGVtZW50OiBJV29ya3NwYWNlRm9sZGVyIHwgSUZpbGVTdGF0KTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0cmV0dXJuIGVsZW1lbnQubmFtZTtcblx0fVxufVxuXG5jbGFzcyBGaWxlRmlsdGVyIGltcGxlbWVudHMgSVRyZWVGaWx0ZXI8SVdvcmtzcGFjZUZvbGRlciB8IElGaWxlU3RhdD4ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NhY2hlZEV4cHJlc3Npb25zID0gbmV3IE1hcDxzdHJpbmcsIGdsb2IuUGFyc2VkRXhwcmVzc2lvbj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWdTZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHQpIHtcblx0XHRjb25zdCBjb25maWcgPSBCcmVhZGNydW1ic0NvbmZpZy5GaWxlRXhjbHVkZXMuYmluZFRvKGNvbmZpZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IHVwZGF0ZSA9ICgpID0+IHtcblx0XHRcdF93b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMuZm9yRWFjaChmb2xkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBleGNsdWRlc0NvbmZpZyA9IGNvbmZpZy5nZXRWYWx1ZSh7IHJlc291cmNlOiBmb2xkZXIudXJpIH0pO1xuXHRcdFx0XHRpZiAoIWV4Y2x1ZGVzQ29uZmlnKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIGFkanVzdCBwYXR0ZXJucyB0byBiZSBhYnNvbHV0ZSBpbiBjYXNlIHRoZXkgYXJlbid0XG5cdFx0XHRcdC8vIGZyZWUgZmxvYXRpbmcgKCoqLylcblx0XHRcdFx0Y29uc3QgYWRqdXN0ZWRDb25maWc6IGdsb2IuSUV4cHJlc3Npb24gPSB7fTtcblx0XHRcdFx0Zm9yIChjb25zdCBwYXR0ZXJuIGluIGV4Y2x1ZGVzQ29uZmlnKSB7XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiBleGNsdWRlc0NvbmZpZ1twYXR0ZXJuXSAhPT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgcGF0dGVybkFicyA9IHBhdHRlcm4uaW5kZXhPZignKiovJykgIT09IDBcblx0XHRcdFx0XHRcdD8gcG9zaXguam9pbihmb2xkZXIudXJpLnBhdGgsIHBhdHRlcm4pXG5cdFx0XHRcdFx0XHQ6IHBhdHRlcm47XG5cblx0XHRcdFx0XHRhZGp1c3RlZENvbmZpZ1twYXR0ZXJuQWJzXSA9IGV4Y2x1ZGVzQ29uZmlnW3BhdHRlcm5dO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGlnbm9yZUNhc2UgPSAhZmlsZVNlcnZpY2UuaGFzQ2FwYWJpbGl0eShmb2xkZXIudXJpLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuUGF0aENhc2VTZW5zaXRpdmUpO1xuXHRcdFx0XHR0aGlzLl9jYWNoZWRFeHByZXNzaW9ucy5zZXQoZm9sZGVyLnVyaS50b1N0cmluZygpLCBnbG9iLnBhcnNlKGFkanVzdGVkQ29uZmlnLCB7IGlnbm9yZUNhc2UgfSkpO1xuXHRcdFx0fSk7XG5cdFx0fTtcblx0XHR1cGRhdGUoKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQoY29uZmlnKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQoY29uZmlnLm9uRGlkQ2hhbmdlKHVwZGF0ZSkpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChfd29ya3NwYWNlU2VydmljZS5vbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnModXBkYXRlKSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGZpbHRlcihlbGVtZW50OiBJV29ya3NwYWNlRm9sZGVyIHwgSUZpbGVTdGF0LCBfcGFyZW50VmlzaWJpbGl0eTogVHJlZVZpc2liaWxpdHkpOiBib29sZWFuIHtcblx0XHRpZiAoaXNXb3Jrc3BhY2VGb2xkZXIoZWxlbWVudCkpIHtcblx0XHRcdC8vIG5vdCBhIGZpbGVcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRjb25zdCBmb2xkZXIgPSB0aGlzLl93b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtzcGFjZUZvbGRlcihlbGVtZW50LnJlc291cmNlKTtcblx0XHRpZiAoIWZvbGRlciB8fCAhdGhpcy5fY2FjaGVkRXhwcmVzc2lvbnMuaGFzKGZvbGRlci51cmkudG9TdHJpbmcoKSkpIHtcblx0XHRcdC8vIG5vIGZvbGRlciBvciBubyBmaWxlclxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXhwcmVzc2lvbiA9IHRoaXMuX2NhY2hlZEV4cHJlc3Npb25zLmdldChmb2xkZXIudXJpLnRvU3RyaW5nKCkpITtcblx0XHRyZXR1cm4gIWV4cHJlc3Npb24ocmVsYXRpdmUoZm9sZGVyLnVyaS5wYXRoLCBlbGVtZW50LnJlc291cmNlLnBhdGgpLCBiYXNlbmFtZShlbGVtZW50LnJlc291cmNlKSk7XG5cdH1cbn1cblxuXG5leHBvcnQgY2xhc3MgRmlsZVNvcnRlciBpbXBsZW1lbnRzIElUcmVlU29ydGVyPElGaWxlU3RhdCB8IElXb3Jrc3BhY2VGb2xkZXI+IHtcblx0Y29tcGFyZShhOiBJRmlsZVN0YXQgfCBJV29ya3NwYWNlRm9sZGVyLCBiOiBJRmlsZVN0YXQgfCBJV29ya3NwYWNlRm9sZGVyKTogbnVtYmVyIHtcblx0XHRpZiAoaXNXb3Jrc3BhY2VGb2xkZXIoYSkgJiYgaXNXb3Jrc3BhY2VGb2xkZXIoYikpIHtcblx0XHRcdHJldHVybiBhLmluZGV4IC0gYi5pbmRleDtcblx0XHR9XG5cdFx0aWYgKChhIGFzIElGaWxlU3RhdCkuaXNEaXJlY3RvcnkgPT09IChiIGFzIElGaWxlU3RhdCkuaXNEaXJlY3RvcnkpIHtcblx0XHRcdC8vIHNhbWUgdHlwZSAtPiBjb21wYXJlIG9uIG5hbWVzXG5cdFx0XHRyZXR1cm4gY29tcGFyZUZpbGVOYW1lcyhhLm5hbWUsIGIubmFtZSk7XG5cdFx0fSBlbHNlIGlmICgoYSBhcyBJRmlsZVN0YXQpLmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiAxO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQnJlYWRjcnVtYnNGaWxlUGlja2VyIGV4dGVuZHMgQnJlYWRjcnVtYnNQaWNrZXI8SVdvcmtzcGFjZSB8IFVSSSwgSVdvcmtzcGFjZUZvbGRlciB8IElGaWxlU3RhdD4ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHBhcmVudDogSFRNTEVsZW1lbnQsXG5cdFx0cmVzb3VyY2U6IFVSSSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlnU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlU2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIocGFyZW50LCByZXNvdXJjZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIHRoZW1lU2VydmljZSwgY29uZmlnU2VydmljZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2NyZWF0ZVRyZWUoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuXG5cdFx0Ly8gdHJlZSBpY29uIHRoZW1lIHNwZWNpYWxzXG5cdFx0dGhpcy5fdHJlZUNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdmaWxlLWljb24tdGhlbWFibGUtdHJlZScpO1xuXHRcdHRoaXMuX3RyZWVDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnc2hvdy1maWxlLWljb25zJyk7XG5cdFx0Y29uc3Qgb25GaWxlSWNvblRoZW1lQ2hhbmdlID0gKGZpbGVJY29uVGhlbWU6IElGaWxlSWNvblRoZW1lKSA9PiB7XG5cdFx0XHR0aGlzLl90cmVlQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2FsaWduLWljb25zLWFuZC10d2lzdGllcycsIGZpbGVJY29uVGhlbWUuaGFzRmlsZUljb25zICYmICFmaWxlSWNvblRoZW1lLmhhc0ZvbGRlckljb25zKTtcblx0XHRcdHRoaXMuX3RyZWVDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZS1hcnJvd3MnLCBmaWxlSWNvblRoZW1lLmhpZGVzRXhwbG9yZXJBcnJvd3MgPT09IHRydWUpO1xuXHRcdH07XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3RoZW1lU2VydmljZS5vbkRpZEZpbGVJY29uVGhlbWVDaGFuZ2Uob25GaWxlSWNvblRoZW1lQ2hhbmdlKSk7XG5cdFx0b25GaWxlSWNvblRoZW1lQ2hhbmdlKHRoaXMuX3RoZW1lU2VydmljZS5nZXRGaWxlSWNvblRoZW1lKCkpO1xuXG5cdFx0Y29uc3QgbGFiZWxzID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VMYWJlbHMsIERFRkFVTFRfTEFCRUxTX0NPTlRBSU5FUiAvKiBUT0RPQEpvIHZpc2liaWxpdHkgcHJvcGFnYXRpb24gKi8pO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChsYWJlbHMpO1xuXG5cdFx0cmV0dXJuIHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0V29ya2JlbmNoQXN5bmNEYXRhVHJlZTxJV29ya3NwYWNlIHwgVVJJLCBJV29ya3NwYWNlRm9sZGVyIHwgSUZpbGVTdGF0LCBGdXp6eVNjb3JlPixcblx0XHRcdCdCcmVhZGNydW1ic0ZpbGVQaWNrZXInLFxuXHRcdFx0Y29udGFpbmVyLFxuXHRcdFx0bmV3IEZpbGVWaXJ0dWFsRGVsZWdhdGUoKSxcblx0XHRcdFt0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShGaWxlUmVuZGVyZXIsIGxhYmVscyldLFxuXHRcdFx0dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRmlsZURhdGFTb3VyY2UpLFxuXHRcdFx0e1xuXHRcdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0XHRzb3J0ZXI6IG5ldyBGaWxlU29ydGVyKCksXG5cdFx0XHRcdGZpbHRlcjogdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRmlsZUZpbHRlciksXG5cdFx0XHRcdGlkZW50aXR5UHJvdmlkZXI6IG5ldyBGaWxlSWRlbnRpdHlQcm92aWRlcigpLFxuXHRcdFx0XHRrZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyOiBuZXcgRmlsZU5hdmlnYXRpb25MYWJlbFByb3ZpZGVyKCksXG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjogdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRmlsZUFjY2Vzc2liaWxpdHlQcm92aWRlciksXG5cdFx0XHRcdHNob3dOb3RGb3VuZE1lc3NhZ2U6IGZhbHNlLFxuXHRcdFx0XHRvdmVycmlkZVN0eWxlczoge1xuXHRcdFx0XHRcdGxpc3RCYWNrZ3JvdW5kOiBicmVhZGNydW1ic1BpY2tlckJhY2tncm91bmRcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIF9zZXRJbnB1dChlbGVtZW50OiBGaWxlRWxlbWVudCB8IE91dGxpbmVFbGVtZW50Mik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHsgdXJpLCBraW5kIH0gPSAoZWxlbWVudCBhcyBGaWxlRWxlbWVudCk7XG5cdFx0bGV0IGlucHV0OiBJV29ya3NwYWNlIHwgVVJJO1xuXHRcdGlmIChraW5kID09PSBGaWxlS2luZC5ST09UX0ZPTERFUikge1xuXHRcdFx0aW5wdXQgPSB0aGlzLl93b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtzcGFjZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpbnB1dCA9IGRpcm5hbWUodXJpKTtcblx0XHR9XG5cblx0XHRjb25zdCB0cmVlID0gdGhpcy5fdHJlZSBhcyBXb3JrYmVuY2hBc3luY0RhdGFUcmVlPElXb3Jrc3BhY2UgfCBVUkksIElXb3Jrc3BhY2VGb2xkZXIgfCBJRmlsZVN0YXQsIEZ1enp5U2NvcmU+O1xuXHRcdGF3YWl0IHRyZWUuc2V0SW5wdXQoaW5wdXQpO1xuXHRcdGxldCBmb2N1c0VsZW1lbnQ6IElXb3Jrc3BhY2VGb2xkZXIgfCBJRmlsZVN0YXQgfCB1bmRlZmluZWQ7XG5cdFx0Zm9yIChjb25zdCB7IGVsZW1lbnQgfSBvZiB0cmVlLmdldE5vZGUoKS5jaGlsZHJlbikge1xuXHRcdFx0aWYgKGlzV29ya3NwYWNlRm9sZGVyKGVsZW1lbnQpICYmIGlzRXF1YWwoZWxlbWVudC51cmksIHVyaSkpIHtcblx0XHRcdFx0Zm9jdXNFbGVtZW50ID0gZWxlbWVudDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9IGVsc2UgaWYgKGlzRXF1YWwoKGVsZW1lbnQgYXMgSUZpbGVTdGF0KS5yZXNvdXJjZSwgdXJpKSkge1xuXHRcdFx0XHRmb2N1c0VsZW1lbnQgPSBlbGVtZW50IGFzIElGaWxlU3RhdDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChmb2N1c0VsZW1lbnQpIHtcblx0XHRcdHRyZWUucmV2ZWFsKGZvY3VzRWxlbWVudCwgMC41KTtcblx0XHRcdHRyZWUuc2V0Rm9jdXMoW2ZvY3VzRWxlbWVudF0sIHRoaXMuX2Zha2VFdmVudCk7XG5cdFx0fVxuXHRcdHRyZWUuZG9tRm9jdXMoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfcHJldmlld0VsZW1lbnQoX2VsZW1lbnQ6IHVua25vd24pOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIERpc3Bvc2FibGUuTm9uZTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBfcmV2ZWFsRWxlbWVudChlbGVtZW50OiBJRmlsZVN0YXQgfCBJV29ya3NwYWNlRm9sZGVyLCBvcHRpb25zOiBJRWRpdG9yT3B0aW9ucywgc2lkZUJ5U2lkZTogYm9vbGVhbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICghaXNXb3Jrc3BhY2VGb2xkZXIoZWxlbWVudCkgJiYgZWxlbWVudC5pc0ZpbGUpIHtcblx0XHRcdHRoaXMuX29uV2lsbFBpY2tFbGVtZW50LmZpcmUoKTtcblx0XHRcdGF3YWl0IHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiBlbGVtZW50LnJlc291cmNlLCBvcHRpb25zIH0sIHNpZGVCeVNpZGUgPyBTSURFX0dST1VQIDogdW5kZWZpbmVkKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gLSBPdXRsaW5lXG5cbmNsYXNzIE91dGxpbmVUcmVlU29ydGVyPEU+IGltcGxlbWVudHMgSVRyZWVTb3J0ZXI8RT4ge1xuXG5cdHByaXZhdGUgX29yZGVyOiAnbmFtZScgfCAndHlwZScgfCAncG9zaXRpb24nO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgY29tcGFyYXRvcjogSU91dGxpbmVDb21wYXJhdG9yPEU+LFxuXHRcdHVyaTogVVJJIHwgdW5kZWZpbmVkLFxuXHRcdEBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlnU2VydmljZTogSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLl9vcmRlciA9IGNvbmZpZ1NlcnZpY2UuZ2V0VmFsdWUodXJpLCAnYnJlYWRjcnVtYnMuc3ltYm9sU29ydE9yZGVyJyk7XG5cdH1cblxuXHRjb21wYXJlKGE6IEUsIGI6IEUpOiBudW1iZXIge1xuXHRcdGlmICh0aGlzLl9vcmRlciA9PT0gJ25hbWUnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jb21wYXJhdG9yLmNvbXBhcmVCeU5hbWUoYSwgYik7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9vcmRlciA9PT0gJ3R5cGUnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jb21wYXJhdG9yLmNvbXBhcmVCeVR5cGUoYSwgYik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLmNvbXBhcmF0b3IuY29tcGFyZUJ5UG9zaXRpb24oYSwgYik7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBCcmVhZGNydW1ic091dGxpbmVQaWNrZXIgZXh0ZW5kcyBCcmVhZGNydW1ic1BpY2tlcjxJT3V0bGluZTx1bmtub3duPiwgdW5rbm93bj4ge1xuXG5cdHByb3RlY3RlZCBfY3JlYXRlVHJlZShjb250YWluZXI6IEhUTUxFbGVtZW50LCBpbnB1dDogT3V0bGluZUVsZW1lbnQyKSB7XG5cblx0XHRjb25zdCB7IGNvbmZpZyB9ID0gaW5wdXQub3V0bGluZTtcblxuXHRcdHJldHVybiB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFdvcmtiZW5jaERhdGFUcmVlPElPdXRsaW5lPHVua25vd24+LCB1bmtub3duLCBGdXp6eVNjb3JlPixcblx0XHRcdCdCcmVhZGNydW1ic091dGxpbmVQaWNrZXInLFxuXHRcdFx0Y29udGFpbmVyLFxuXHRcdFx0Y29uZmlnLmRlbGVnYXRlLFxuXHRcdFx0Y29uZmlnLnJlbmRlcmVycyxcblx0XHRcdGNvbmZpZy50cmVlRGF0YVNvdXJjZSxcblx0XHRcdHtcblx0XHRcdFx0Li4uY29uZmlnLm9wdGlvbnMsXG5cdFx0XHRcdHNvcnRlcjogdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoT3V0bGluZVRyZWVTb3J0ZXIsIGNvbmZpZy5jb21wYXJhdG9yLCB1bmRlZmluZWQpLFxuXHRcdFx0XHRjb2xsYXBzZUJ5RGVmYXVsdDogdHJ1ZSxcblx0XHRcdFx0ZXhwYW5kT25seU9uVHdpc3RpZUNsaWNrOiB0cnVlLFxuXHRcdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0XHRzaG93Tm90Rm91bmRNZXNzYWdlOiBmYWxzZVxuXHRcdFx0fVxuXHRcdCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX3NldElucHV0KGlucHV0OiBPdXRsaW5lRWxlbWVudDIpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdGNvbnN0IHZpZXdTdGF0ZSA9IGlucHV0Lm91dGxpbmUuY2FwdHVyZVZpZXdTdGF0ZSgpO1xuXHRcdHRoaXMucmVzdG9yZVZpZXdTdGF0ZSA9ICgpID0+IHsgdmlld1N0YXRlLmRpc3Bvc2UoKTsgfTtcblxuXHRcdGNvbnN0IHRyZWUgPSB0aGlzLl90cmVlIGFzIFdvcmtiZW5jaERhdGFUcmVlPElPdXRsaW5lPHVua25vd24+LCB1bmtub3duLCBGdXp6eVNjb3JlPjtcblxuXHRcdHRyZWUuc2V0SW5wdXQoaW5wdXQub3V0bGluZSk7XG5cdFx0aWYgKGlucHV0LmVsZW1lbnQgIT09IGlucHV0Lm91dGxpbmUpIHtcblx0XHRcdHRyZWUucmV2ZWFsKGlucHV0LmVsZW1lbnQsIDAuNSk7XG5cdFx0XHR0cmVlLnNldEZvY3VzKFtpbnB1dC5lbGVtZW50XSwgdGhpcy5fZmFrZUV2ZW50KTtcblx0XHR9XG5cdFx0dHJlZS5kb21Gb2N1cygpO1xuXG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9wcmV2aWV3RWxlbWVudChlbGVtZW50OiB1bmtub3duKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IG91dGxpbmU6IElPdXRsaW5lPHVua25vd24+ID0gdGhpcy5fdHJlZS5nZXRJbnB1dCgpITtcblx0XHRyZXR1cm4gb3V0bGluZS5wcmV2aWV3KGVsZW1lbnQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIF9yZXZlYWxFbGVtZW50KGVsZW1lbnQ6IHVua25vd24sIG9wdGlvbnM6IElFZGl0b3JPcHRpb25zLCBzaWRlQnlTaWRlOiBib29sZWFuKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dGhpcy5fb25XaWxsUGlja0VsZW1lbnQuZmlyZSgpO1xuXHRcdGNvbnN0IG91dGxpbmU6IElPdXRsaW5lPHVua25vd24+ID0gdGhpcy5fdHJlZS5nZXRJbnB1dCgpITtcblx0XHRhd2FpdCBvdXRsaW5lLnJldmVhbChlbGVtZW50LCBvcHRpb25zLCBzaWRlQnlTaWRlLCBmYWxzZSk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxxQkFBaUM7QUFDMUMsWUFBWSxVQUFVO0FBQ3RCLFNBQXNCLGlCQUFpQixtQkFBbUIsa0JBQWtCO0FBQzVFLFNBQVMsT0FBTyxnQkFBZ0I7QUFDaEMsU0FBUyxVQUFVLFNBQVMsZUFBZTtBQUMzQyxTQUFTLFdBQVc7QUFDcEIsT0FBTztBQUNQLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsVUFBVSxnQ0FBZ0Msb0JBQStCO0FBQ2xGLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CLDhCQUE4QjtBQUMxRCxTQUFTLDZCQUE2QixvQkFBb0I7QUFDMUQsU0FBUyxhQUFhLG1CQUErQixnQ0FBa0Q7QUFDdkcsU0FBUyxnQkFBZ0MsZ0NBQWdDO0FBQ3pFLFNBQVMseUJBQXlCO0FBSWxDLFNBQXlCLHFCQUFxQjtBQUU5QyxTQUFTLGdCQUFnQjtBQUd6QixTQUFTLGdCQUFnQixrQkFBa0I7QUFDM0MsU0FBUyx5Q0FBeUM7QUFpQjNDLElBQWUsb0JBQWYsTUFBbUQ7QUFBQSxFQWV6RCxZQUNDLFFBQ1UsVUFDZ0MsdUJBQ1IsZUFDUSx1QkFDekM7QUFKUztBQUNnQztBQUNSO0FBQ1E7QUFsQjNDLFNBQW1CLGVBQWUsSUFBSSxnQkFBZ0I7QUFLdEQsU0FBVSxhQUFhLElBQUksUUFBUSxXQUFXO0FBRzlDLFNBQW1CLHFCQUFxQixJQUFJLFFBQWM7QUFDMUQsU0FBUyxvQkFBaUMsS0FBSyxtQkFBbUI7QUFFbEUsU0FBaUIscUJBQXFCLElBQUksa0JBQWtCO0FBUzNELFNBQUssV0FBVyxTQUFTLGNBQWMsS0FBSztBQUM1QyxTQUFLLFNBQVMsWUFBWTtBQUMxQixXQUFPLFlBQVksS0FBSyxRQUFRO0FBQUEsRUFDakM7QUFB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S0FBSyxXQUFXLFFBQVE7QUFDM0IsYUFBTyxLQUFLLFdBQVcsY0FBYyxHQUFHLENBQUM7QUFBQSxJQUMxQyxXQUFXLEtBQUssV0FBVyxRQUFRO0FBQ2xDLGFBQU8sS0FBSyxXQUFXLGNBQWMsR0FBRyxDQUFDO0FBQUEsSUFDMUMsT0FBTztBQUNOLGFBQU8sS0FBSyxXQUFXLGtCQUFrQixHQUFHLENBQUM7QUFBQSxJQUM5QztBQUFBLEVBQ0Q7QUFDRDtBQXJCTSxvQkFBTjtBQUFBLEVBT0c7QUFBQSxHQVBHO0FBdUJDLE1BQU0saUNBQWlDLGtCQUE4QztBQUFBLEVBRWpGLFlBQVksV0FBd0IsT0FBd0I7QUFFckUsVUFBTSxFQUFFLE9BQU8sSUFBSSxNQUFNO0FBRXpCLFdBQU8sS0FBSyxzQkFBc0I7QUFBQSxNQUNqQztBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxPQUFPO0FBQUEsTUFDUCxPQUFPO0FBQUEsTUFDUCxPQUFPO0FBQUEsTUFDUDtBQUFBLFFBQ0MsR0FBRyxPQUFPO0FBQUEsUUFDVixRQUFRLEtBQUssc0JBQXNCLGVBQWUsbUJBQW1CLE9BQU8sWUFBWSxNQUFTO0FBQUEsUUFDakcsbUJBQW1CO0FBQUEsUUFDbkIsMEJBQTBCO0FBQUEsUUFDMUIsMEJBQTBCO0FBQUEsUUFDMUIscUJBQXFCO0FBQUEsTUFDdEI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRVUsVUFBVSxPQUF1QztBQUUxRCxVQUFNLFlBQVksTUFBTSxRQUFRLGlCQUFpQjtBQUNqRCxTQUFLLG1CQUFtQixNQUFNO0FBQUUsZ0JBQVUsUUFBUTtBQUFBLElBQUc7QUFFckQsVUFBTSxPQUFPLEtBQUs7QUFFbEIsU0FBSyxTQUFTLE1BQU0sT0FBTztBQUMzQixRQUFJLE1BQU0sWUFBWSxNQUFNLFNBQVM7QUFDcEMsV0FBSyxPQUFPLE1BQU0sU0FBUyxHQUFHO0FBQzlCLFdBQUssU0FBUyxDQUFDLE1BQU0sT0FBTyxHQUFHLEtBQUssVUFBVTtBQUFBLElBQy9DO0FBQ0EsU0FBSyxTQUFTO0FBRWQsV0FBTyxRQUFRLFFBQVE7QUFBQSxFQUN4QjtBQUFBLEVBRVUsZ0JBQWdCLFNBQStCO0FBQ3hELFVBQU0sVUFBNkIsS0FBSyxNQUFNLFNBQVM7QUFDdkQsV0FBTyxRQUFRLFFBQVEsT0FBTztBQUFBLEVBQy9CO0FBQUEsRUFFQSxNQUFnQixlQUFlLFNBQWtCLFNBQXlCLFlBQXVDO0FBQ2hILFNBQUssbUJBQW1CLEtBQUs7QUFDN0IsVUFBTSxVQUE2QixLQUFLLE1BQU0sU0FBUztBQUN2RCxVQUFNLFFBQVEsT0FBTyxTQUFTLFNBQVMsWUFBWSxLQUFLO0FBQ3hELFdBQU87QUFBQSxFQUNSO0FBQ0Q7IiwKICAibmFtZXMiOiBbImVsZW1lbnQiXQp9Cg==
