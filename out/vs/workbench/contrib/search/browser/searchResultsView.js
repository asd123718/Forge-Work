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
import * as DOM from "../../../../base/browser/dom.js";
import { CountBadge } from "../../../../base/browser/ui/countBadge/countBadge.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import * as paths from "../../../../base/common/path.js";
import * as nls from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { FileKind } from "../../../../platform/files/common/files.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { isEqual } from "../../../../base/common/resources.js";
import { MenuId } from "../../../../platform/actions/common/actions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { defaultCountBadgeStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { SearchContext } from "../common/constants.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { isSearchTreeMatch, isSearchTreeFileMatch, isSearchTreeFolderMatch, isTextSearchHeading, isSearchTreeFolderMatchWorkspaceRoot, isSearchTreeFolderMatchNoRoot, isPlainTextSearchHeading } from "./searchTreeModel/searchTreeCommon.js";
import { isSearchTreeAIFileMatch } from "./AISearch/aiSearchModelBase.js";
const _SearchDelegate = class _SearchDelegate {
  getHeight(element) {
    return _SearchDelegate.ITEM_HEIGHT;
  }
  getTemplateId(element) {
    if (isSearchTreeFolderMatch(element)) {
      return FolderMatchRenderer.TEMPLATE_ID;
    } else if (isSearchTreeFileMatch(element)) {
      return FileMatchRenderer.TEMPLATE_ID;
    } else if (isSearchTreeMatch(element)) {
      return MatchRenderer.TEMPLATE_ID;
    } else if (isTextSearchHeading(element)) {
      return TextSearchResultRenderer.TEMPLATE_ID;
    }
    console.error("Invalid search tree element", element);
    throw new Error("Invalid search tree element");
  }
};
_SearchDelegate.ITEM_HEIGHT = 22;
let SearchDelegate = _SearchDelegate;
let TextSearchResultRenderer = class extends Disposable {
  constructor(labels, contextService, instantiationService, contextKeyService) {
    super();
    this.labels = labels;
    this.contextService = contextService;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.templateId = TextSearchResultRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const textSearchResultElement = DOM.append(container, DOM.$(".textsearchresult"));
    const label = this.labels.create(textSearchResultElement, { supportDescriptionHighlights: true, supportHighlights: true, supportIcons: true });
    disposables.add(label);
    const actionBarContainer = DOM.append(textSearchResultElement, DOM.$(".actionBarContainer"));
    const contextKeyServiceMain = disposables.add(this.contextKeyService.createScoped(container));
    const instantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyServiceMain])));
    const actions = disposables.add(instantiationService.createInstance(MenuWorkbenchToolBar, actionBarContainer, MenuId.SearchActionMenu, {
      menuOptions: {
        shouldForwardArgs: true
      },
      highlightToggledItems: true,
      hiddenItemStrategy: HiddenItemStrategy.Ignore,
      toolbarOptions: {
        primaryGroup: (g) => /^inline/.test(g)
      }
    }));
    return { label, disposables, actions, contextKeyService: contextKeyServiceMain };
  }
  async renderElement(node, index, templateData) {
    if (isPlainTextSearchHeading(node.element)) {
      templateData.label.setLabel(nls.localize("searchFolderMatch.plainText.label", "Text Results"));
      SearchContext.AIResultsTitle.bindTo(templateData.contextKeyService).set(false);
      SearchContext.MatchFocusKey.bindTo(templateData.contextKeyService).set(false);
      SearchContext.FileFocusKey.bindTo(templateData.contextKeyService).set(false);
      SearchContext.FolderFocusKey.bindTo(templateData.contextKeyService).set(false);
    } else {
      try {
        await node.element.parent().searchModel.getAITextResultProviderName();
      } catch {
      }
      const localizedLabel = nls.localize({
        key: "searchFolderMatch.aiText.label",
        comment: ['This is displayed before the AI text search results, now always "AI-assisted results".']
      }, "AI-assisted results");
      templateData.label.setLabel(`$(${Codicon.searchSparkle.id}) ${localizedLabel}`);
      SearchContext.AIResultsTitle.bindTo(templateData.contextKeyService).set(true);
      SearchContext.MatchFocusKey.bindTo(templateData.contextKeyService).set(false);
      SearchContext.FileFocusKey.bindTo(templateData.contextKeyService).set(false);
      SearchContext.FolderFocusKey.bindTo(templateData.contextKeyService).set(false);
    }
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
  }
  renderCompressedElements(node, index, templateData) {
  }
};
TextSearchResultRenderer.TEMPLATE_ID = "textResultMatch";
TextSearchResultRenderer = __decorateClass([
  __decorateParam(1, IWorkspaceContextService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IContextKeyService)
], TextSearchResultRenderer);
let FolderMatchRenderer = class extends Disposable {
  constructor(searchView, labels, contextService, labelService, instantiationService, contextKeyService) {
    super();
    this.searchView = searchView;
    this.labels = labels;
    this.contextService = contextService;
    this.labelService = labelService;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.templateId = FolderMatchRenderer.TEMPLATE_ID;
  }
  renderCompressedElements(node, index, templateData) {
    const compressed = node.element;
    const folder = compressed.elements[compressed.elements.length - 1];
    const label = compressed.elements.map((e) => e.name());
    if (folder.resource) {
      const fileKind = isSearchTreeFolderMatchWorkspaceRoot(folder) ? FileKind.ROOT_FOLDER : FileKind.FOLDER;
      templateData.label.setResource({ resource: folder.resource, name: label }, {
        fileKind,
        separator: this.labelService.getSeparator(folder.resource.scheme)
      });
    } else {
      templateData.label.setLabel(nls.localize("searchFolderMatch.other.label", "Other files"));
    }
    this.renderFolderDetails(folder, templateData);
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const folderMatchElement = DOM.append(container, DOM.$(".foldermatch"));
    const label = this.labels.create(folderMatchElement, { supportDescriptionHighlights: true, supportHighlights: true });
    disposables.add(label);
    const badge = new CountBadge(DOM.append(folderMatchElement, DOM.$(".badge")), {}, defaultCountBadgeStyles);
    disposables.add(badge);
    const actionBarContainer = DOM.append(folderMatchElement, DOM.$(".actionBarContainer"));
    const elementDisposables = new DisposableStore();
    disposables.add(elementDisposables);
    const contextKeyServiceMain = disposables.add(this.contextKeyService.createScoped(container));
    SearchContext.AIResultsTitle.bindTo(contextKeyServiceMain).set(false);
    SearchContext.MatchFocusKey.bindTo(contextKeyServiceMain).set(false);
    SearchContext.FileFocusKey.bindTo(contextKeyServiceMain).set(false);
    SearchContext.FolderFocusKey.bindTo(contextKeyServiceMain).set(true);
    const instantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyServiceMain])));
    const actions = disposables.add(instantiationService.createInstance(MenuWorkbenchToolBar, actionBarContainer, MenuId.SearchActionMenu, {
      menuOptions: {
        shouldForwardArgs: true
      },
      hiddenItemStrategy: HiddenItemStrategy.Ignore,
      toolbarOptions: {
        primaryGroup: (g) => /^inline/.test(g)
      }
    }));
    return {
      label,
      badge,
      actions,
      disposables,
      elementDisposables,
      contextKeyService: contextKeyServiceMain
    };
  }
  renderElement(node, index, templateData) {
    const folderMatch = node.element;
    if (folderMatch.resource) {
      const workspaceFolder = this.contextService.getWorkspaceFolder(folderMatch.resource);
      if (workspaceFolder && isEqual(workspaceFolder.uri, folderMatch.resource)) {
        templateData.label.setFile(folderMatch.resource, { fileKind: FileKind.ROOT_FOLDER, hidePath: true });
      } else {
        templateData.label.setFile(folderMatch.resource, { fileKind: FileKind.FOLDER, hidePath: this.searchView.isTreeLayoutViewVisible });
      }
    } else {
      templateData.label.setLabel(nls.localize("searchFolderMatch.other.label", "Other files"));
    }
    SearchContext.IsEditableItemKey.bindTo(templateData.contextKeyService).set(!folderMatch.hasOnlyReadOnlyMatches());
    templateData.elementDisposables.add(folderMatch.onChange(() => {
      SearchContext.IsEditableItemKey.bindTo(templateData.contextKeyService).set(!folderMatch.hasOnlyReadOnlyMatches());
    }));
    this.renderFolderDetails(folderMatch, templateData);
  }
  disposeElement(element, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeCompressedElements(node, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
  }
  renderFolderDetails(folder, templateData) {
    const count = folder.recursiveMatchCount();
    templateData.badge.setCount(count);
    templateData.badge.setTitleFormat(count > 1 ? nls.localize("searchFileMatches", "{0} files found", count) : nls.localize("searchFileMatch", "{0} file found", count));
    templateData.actions.context = { viewer: this.searchView.getControl(), element: folder };
  }
};
FolderMatchRenderer.TEMPLATE_ID = "folderMatch";
FolderMatchRenderer = __decorateClass([
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, ILabelService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IContextKeyService)
], FolderMatchRenderer);
let FileMatchRenderer = class extends Disposable {
  constructor(searchView, labels, contextService, configurationService, instantiationService, contextKeyService) {
    super();
    this.searchView = searchView;
    this.labels = labels;
    this.contextService = contextService;
    this.configurationService = configurationService;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.templateId = FileMatchRenderer.TEMPLATE_ID;
  }
  renderCompressedElements(node, index, templateData) {
    throw new Error("Should never happen since node is incompressible.");
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const elementDisposables = new DisposableStore();
    disposables.add(elementDisposables);
    const fileMatchElement = DOM.append(container, DOM.$(".filematch"));
    const label = this.labels.create(fileMatchElement);
    disposables.add(label);
    const badge = new CountBadge(DOM.append(fileMatchElement, DOM.$(".badge")), {}, defaultCountBadgeStyles);
    disposables.add(badge);
    const actionBarContainer = DOM.append(fileMatchElement, DOM.$(".actionBarContainer"));
    const contextKeyServiceMain = disposables.add(this.contextKeyService.createScoped(container));
    SearchContext.AIResultsTitle.bindTo(contextKeyServiceMain).set(false);
    SearchContext.MatchFocusKey.bindTo(contextKeyServiceMain).set(false);
    SearchContext.FileFocusKey.bindTo(contextKeyServiceMain).set(true);
    SearchContext.FolderFocusKey.bindTo(contextKeyServiceMain).set(false);
    const instantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyServiceMain])));
    const actions = disposables.add(instantiationService.createInstance(MenuWorkbenchToolBar, actionBarContainer, MenuId.SearchActionMenu, {
      menuOptions: {
        shouldForwardArgs: true
      },
      hiddenItemStrategy: HiddenItemStrategy.Ignore,
      toolbarOptions: {
        primaryGroup: (g) => /^inline/.test(g)
      }
    }));
    return {
      el: fileMatchElement,
      label,
      badge,
      actions,
      disposables,
      elementDisposables,
      contextKeyService: contextKeyServiceMain
    };
  }
  renderElement(node, index, templateData) {
    const fileMatch = node.element;
    templateData.el.setAttribute("data-resource", fileMatch.resource.toString());
    const decorationConfig = this.configurationService.getValue("search").decorations;
    templateData.label.setFile(fileMatch.resource, { range: isSearchTreeAIFileMatch(fileMatch) ? fileMatch.getFullRange() : void 0, hidePath: this.searchView.isTreeLayoutViewVisible && !isSearchTreeFolderMatchNoRoot(fileMatch.parent()), hideIcon: false, fileDecorations: { colors: decorationConfig.colors, badges: decorationConfig.badges } });
    const count = fileMatch.count();
    templateData.badge.setCount(count);
    templateData.badge.setTitleFormat(count > 1 ? nls.localize("searchMatches", "{0} matches found", count) : nls.localize("searchMatch", "{0} match found", count));
    templateData.actions.context = { viewer: this.searchView.getControl(), element: fileMatch };
    SearchContext.IsEditableItemKey.bindTo(templateData.contextKeyService).set(!fileMatch.hasOnlyReadOnlyMatches());
    templateData.elementDisposables.add(fileMatch.onChange(() => {
      SearchContext.IsEditableItemKey.bindTo(templateData.contextKeyService).set(!fileMatch.hasOnlyReadOnlyMatches());
    }));
    const twistieContainer = templateData.el.parentElement?.parentElement?.querySelector(".monaco-tl-twistie");
    twistieContainer?.classList.add("force-twistie");
  }
  disposeElement(element, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
  }
};
FileMatchRenderer.TEMPLATE_ID = "fileMatch";
FileMatchRenderer = __decorateClass([
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IContextKeyService)
], FileMatchRenderer);
let MatchRenderer = class extends Disposable {
  constructor(searchView, contextService, configurationService, instantiationService, contextKeyService, hoverService) {
    super();
    this.searchView = searchView;
    this.contextService = contextService;
    this.configurationService = configurationService;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.hoverService = hoverService;
    this.templateId = MatchRenderer.TEMPLATE_ID;
  }
  renderCompressedElements(node, index, templateData) {
    throw new Error("Should never happen since node is incompressible.");
  }
  renderTemplate(container) {
    container.classList.add("linematch");
    const lineNumber = DOM.append(container, DOM.$("span.matchLineNum"));
    const parent = DOM.append(container, DOM.$("a.plain.match"));
    const before = DOM.append(parent, DOM.$("span"));
    const match = DOM.append(parent, DOM.$("span.findInFileMatch"));
    const replace = DOM.append(parent, DOM.$("span.replaceMatch"));
    const after = DOM.append(parent, DOM.$("span"));
    const actionBarContainer = DOM.append(container, DOM.$("span.actionBarContainer"));
    const disposables = new DisposableStore();
    const contextKeyServiceMain = disposables.add(this.contextKeyService.createScoped(container));
    SearchContext.AIResultsTitle.bindTo(contextKeyServiceMain).set(false);
    SearchContext.MatchFocusKey.bindTo(contextKeyServiceMain).set(true);
    SearchContext.FileFocusKey.bindTo(contextKeyServiceMain).set(false);
    SearchContext.FolderFocusKey.bindTo(contextKeyServiceMain).set(false);
    const instantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyServiceMain])));
    const actions = disposables.add(instantiationService.createInstance(MenuWorkbenchToolBar, actionBarContainer, MenuId.SearchActionMenu, {
      menuOptions: {
        shouldForwardArgs: true
      },
      hiddenItemStrategy: HiddenItemStrategy.Ignore,
      toolbarOptions: {
        primaryGroup: (g) => /^inline/.test(g)
      }
    }));
    const parentHover = disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), parent, ""));
    const lineNumberHover = disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), lineNumber, ""));
    return {
      parent,
      before,
      match,
      replace,
      after,
      lineNumber,
      actions,
      parentHover,
      lineNumberHover,
      disposables,
      contextKeyService: contextKeyServiceMain
    };
  }
  renderElement(node, index, templateData) {
    const match = node.element;
    const preview = match.preview();
    const replace = this.searchView.model.isReplaceActive() && !!this.searchView.model.replaceString && !match.isReadonly;
    templateData.before.textContent = preview.before;
    templateData.match.textContent = preview.inside;
    templateData.match.classList.toggle("replace", replace);
    templateData.replace.textContent = replace ? match.replaceString : "";
    templateData.after.textContent = preview.after;
    const title = (preview.fullBefore + (replace ? match.replaceString : preview.inside) + preview.after).trim().substr(0, 999);
    templateData.parentHover.update(title);
    SearchContext.IsEditableItemKey.bindTo(templateData.contextKeyService).set(!match.isReadonly);
    const numLines = match.range().endLineNumber - match.range().startLineNumber;
    const extraLinesStr = numLines > 0 ? `+${numLines}` : "";
    const showLineNumbers = this.configurationService.getValue("search").showLineNumbers;
    const lineNumberStr = showLineNumbers ? `${match.range().startLineNumber}:` : "";
    templateData.lineNumber.classList.toggle("show", numLines > 0 || showLineNumbers);
    templateData.lineNumber.textContent = lineNumberStr + extraLinesStr;
    templateData.lineNumberHover.update(this.getMatchTitle(match, showLineNumbers));
    templateData.actions.context = { viewer: this.searchView.getControl(), element: match };
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
  }
  getMatchTitle(match, showLineNumbers) {
    const startLine = match.range().startLineNumber;
    const numLines = match.range().endLineNumber - match.range().startLineNumber;
    const lineNumStr = showLineNumbers ? nls.localize("lineNumStr", "From line {0}", startLine, numLines) + " " : "";
    const numLinesStr = numLines > 0 ? "+ " + nls.localize("numLinesStr", "{0} more lines", numLines) : "";
    return lineNumStr + numLinesStr;
  }
};
MatchRenderer.TEMPLATE_ID = "match";
MatchRenderer = __decorateClass([
  __decorateParam(1, IWorkspaceContextService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IHoverService)
], MatchRenderer);
let SearchAccessibilityProvider = class {
  constructor(searchView, labelService) {
    this.searchView = searchView;
    this.labelService = labelService;
  }
  getWidgetAriaLabel() {
    return nls.localize("search", "Search");
  }
  getAriaLabel(element) {
    if (isSearchTreeFolderMatch(element)) {
      const count = element.allDownstreamFileMatches().reduce((total, current) => total + current.count(), 0);
      return element.resource ? nls.localize("folderMatchAriaLabel", "{0} matches in folder root {1}, Search result", count, element.name()) : nls.localize("otherFilesAriaLabel", "{0} matches outside of the workspace, Search result", count);
    }
    if (isSearchTreeFileMatch(element)) {
      const path = this.labelService.getUriLabel(element.resource, { relative: true }) || element.resource.fsPath;
      return nls.localize("fileMatchAriaLabel", "{0} matches in file {1} of folder {2}, Search result", element.count(), element.name(), paths.dirname(path));
    }
    if (isSearchTreeMatch(element)) {
      const match = element;
      const searchModel = this.searchView.model;
      const replace = searchModel.isReplaceActive() && !!searchModel.replaceString;
      const matchString = match.getMatchString();
      const range = match.range();
      const matchText = match.text().substr(0, range.endColumn + 150);
      if (replace) {
        return nls.localize("replacePreviewResultAria", "'{0}' at column {1} replace {2} with {3}", matchText, range.startColumn, matchString, match.replaceString);
      }
      return nls.localize("searchResultAria", "'{0}' at column {1} found {2}", matchText, range.startColumn, matchString);
    }
    return null;
  }
};
SearchAccessibilityProvider = __decorateClass([
  __decorateParam(1, ILabelService)
], SearchAccessibilityProvider);
export {
  FileMatchRenderer,
  FolderMatchRenderer,
  MatchRenderer,
  SearchAccessibilityProvider,
  SearchDelegate,
  TextSearchResultRenderer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNlYXJjaFxcYnJvd3Nlclxcc2VhcmNoUmVzdWx0c1ZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBDb3VudEJhZGdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2NvdW50QmFkZ2UvY291bnRCYWRnZS5qcyc7XG5pbXBvcnQgeyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IElUcmVlTm9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCAqIGFzIHBhdGhzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEZpbGVLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSVNlYXJjaENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVJlc291cmNlTGFiZWwsIFJlc291cmNlTGFiZWxzIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9sYWJlbHMuanMnO1xuaW1wb3J0IHsgU2VhcmNoVmlldyB9IGZyb20gJy4vc2VhcmNoVmlldy5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElDb21wcmVzc2libGVUcmVlUmVuZGVyZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9vYmplY3RUcmVlLmpzJztcbmltcG9ydCB7IElDb21wcmVzc2VkVHJlZU5vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9jb21wcmVzc2VkT2JqZWN0VHJlZU1vZGVsLmpzJztcbmltcG9ydCB7IE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBIaWRkZW5JdGVtU3RyYXRlZ3ksIE1lbnVXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgSVNlYXJjaEFjdGlvbkNvbnRleHQgfSBmcm9tICcuL3NlYXJjaEFjdGlvbnNSZW1vdmVSZXBsYWNlLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0Q291bnRCYWRnZVN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBTZWFyY2hDb250ZXh0IH0gZnJvbSAnLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgdHlwZSB7IElNYW5hZ2VkSG92ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IElTZWFyY2hUcmVlTWF0Y2gsIGlzU2VhcmNoVHJlZU1hdGNoLCBSZW5kZXJhYmxlTWF0Y2gsIElUZXh0U2VhcmNoSGVhZGluZywgSVNlYXJjaFRyZWVGb2xkZXJNYXRjaCwgSVNlYXJjaFRyZWVGaWxlTWF0Y2gsIGlzU2VhcmNoVHJlZUZpbGVNYXRjaCwgaXNTZWFyY2hUcmVlRm9sZGVyTWF0Y2gsIGlzVGV4dFNlYXJjaEhlYWRpbmcsIElTZWFyY2hNb2RlbCwgaXNTZWFyY2hUcmVlRm9sZGVyTWF0Y2hXb3Jrc3BhY2VSb290LCBpc1NlYXJjaFRyZWVGb2xkZXJNYXRjaE5vUm9vdCwgaXNQbGFpblRleHRTZWFyY2hIZWFkaW5nIH0gZnJvbSAnLi9zZWFyY2hUcmVlTW9kZWwvc2VhcmNoVHJlZUNvbW1vbi5qcyc7XG5pbXBvcnQgeyBpc1NlYXJjaFRyZWVBSUZpbGVNYXRjaCB9IGZyb20gJy4vQUlTZWFyY2gvYWlTZWFyY2hNb2RlbEJhc2UuanMnO1xuXG5pbnRlcmZhY2UgSUZvbGRlck1hdGNoVGVtcGxhdGUge1xuXHRsYWJlbDogSVJlc291cmNlTGFiZWw7XG5cdGJhZGdlOiBDb3VudEJhZGdlO1xuXHRhY3Rpb25zOiBNZW51V29ya2JlbmNoVG9vbEJhcjtcblx0ZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0ZWxlbWVudERpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2U7XG59XG5cbmludGVyZmFjZSBJVGV4dFNlYXJjaFJlc3VsdFRlbXBsYXRlIHtcblx0bGFiZWw6IElSZXNvdXJjZUxhYmVsO1xuXHRkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRhY3Rpb25zOiBNZW51V29ya2JlbmNoVG9vbEJhcjtcblx0Y29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZTtcbn1cblxuaW50ZXJmYWNlIElGaWxlTWF0Y2hUZW1wbGF0ZSB7XG5cdGVsOiBIVE1MRWxlbWVudDtcblx0bGFiZWw6IElSZXNvdXJjZUxhYmVsO1xuXHRiYWRnZTogQ291bnRCYWRnZTtcblx0YWN0aW9uczogTWVudVdvcmtiZW5jaFRvb2xCYXI7XG5cdGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdGVsZW1lbnREaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlO1xufVxuXG5pbnRlcmZhY2UgSU1hdGNoVGVtcGxhdGUge1xuXHRsaW5lTnVtYmVyOiBIVE1MRWxlbWVudDtcblx0cGFyZW50OiBIVE1MRWxlbWVudDtcblx0YmVmb3JlOiBIVE1MRWxlbWVudDtcblx0bWF0Y2g6IEhUTUxFbGVtZW50O1xuXHRyZXBsYWNlOiBIVE1MRWxlbWVudDtcblx0YWZ0ZXI6IEhUTUxFbGVtZW50O1xuXHRhY3Rpb25zOiBNZW51V29ya2JlbmNoVG9vbEJhcjtcblx0cGFyZW50SG92ZXI6IElNYW5hZ2VkSG92ZXI7XG5cdGxpbmVOdW1iZXJIb3ZlcjogSU1hbmFnZWRIb3Zlcjtcblx0ZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0Y29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZTtcbn1cblxuZXhwb3J0IGNsYXNzIFNlYXJjaERlbGVnYXRlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8UmVuZGVyYWJsZU1hdGNoPiB7XG5cblx0cHVibGljIHN0YXRpYyBJVEVNX0hFSUdIVCA9IDIyO1xuXG5cdGdldEhlaWdodChlbGVtZW50OiBSZW5kZXJhYmxlTWF0Y2gpOiBudW1iZXIge1xuXHRcdHJldHVybiBTZWFyY2hEZWxlZ2F0ZS5JVEVNX0hFSUdIVDtcblx0fVxuXG5cdGdldFRlbXBsYXRlSWQoZWxlbWVudDogUmVuZGVyYWJsZU1hdGNoKTogc3RyaW5nIHtcblx0XHRpZiAoaXNTZWFyY2hUcmVlRm9sZGVyTWF0Y2goZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBGb2xkZXJNYXRjaFJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXHRcdH0gZWxzZSBpZiAoaXNTZWFyY2hUcmVlRmlsZU1hdGNoKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gRmlsZU1hdGNoUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cdFx0fSBlbHNlIGlmIChpc1NlYXJjaFRyZWVNYXRjaChlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIE1hdGNoUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cdFx0fSBlbHNlIGlmIChpc1RleHRTZWFyY2hIZWFkaW5nKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gVGV4dFNlYXJjaFJlc3VsdFJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXHRcdH1cblxuXHRcdGNvbnNvbGUuZXJyb3IoJ0ludmFsaWQgc2VhcmNoIHRyZWUgZWxlbWVudCcsIGVsZW1lbnQpO1xuXHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBzZWFyY2ggdHJlZSBlbGVtZW50Jyk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRleHRTZWFyY2hSZXN1bHRSZW5kZXJlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyPElUZXh0U2VhcmNoSGVhZGluZywgYW55LCBJVGV4dFNlYXJjaFJlc3VsdFRlbXBsYXRlPiB7XG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICd0ZXh0UmVzdWx0TWF0Y2gnO1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQgPSBUZXh0U2VhcmNoUmVzdWx0UmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBsYWJlbHM6IFJlc291cmNlTGFiZWxzLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJvdGVjdGVkIGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElUZXh0U2VhcmNoUmVzdWx0VGVtcGxhdGUge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHRleHRTZWFyY2hSZXN1bHRFbGVtZW50ID0gRE9NLmFwcGVuZChjb250YWluZXIsIERPTS4kKCcudGV4dHNlYXJjaHJlc3VsdCcpKTtcblx0XHRjb25zdCBsYWJlbCA9IHRoaXMubGFiZWxzLmNyZWF0ZSh0ZXh0U2VhcmNoUmVzdWx0RWxlbWVudCwgeyBzdXBwb3J0RGVzY3JpcHRpb25IaWdobGlnaHRzOiB0cnVlLCBzdXBwb3J0SGlnaGxpZ2h0czogdHJ1ZSwgc3VwcG9ydEljb25zOiB0cnVlIH0pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYWJlbCk7XG5cblx0XHRjb25zdCBhY3Rpb25CYXJDb250YWluZXIgPSBET00uYXBwZW5kKHRleHRTZWFyY2hSZXN1bHRFbGVtZW50LCBET00uJCgnLmFjdGlvbkJhckNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZU1haW4gPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQoY29udGFpbmVyKSk7XG5cblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZU1haW5dKSkpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIGFjdGlvbkJhckNvbnRhaW5lciwgTWVudUlkLlNlYXJjaEFjdGlvbk1lbnUsIHtcblx0XHRcdG1lbnVPcHRpb25zOiB7XG5cdFx0XHRcdHNob3VsZEZvcndhcmRBcmdzOiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0aGlnaGxpZ2h0VG9nZ2xlZEl0ZW1zOiB0cnVlLFxuXHRcdFx0aGlkZGVuSXRlbVN0cmF0ZWd5OiBIaWRkZW5JdGVtU3RyYXRlZ3kuSWdub3JlLFxuXHRcdFx0dG9vbGJhck9wdGlvbnM6IHtcblx0XHRcdFx0cHJpbWFyeUdyb3VwOiAoZzogc3RyaW5nKSA9PiAvXmlubGluZS8udGVzdChnKSxcblx0XHRcdH0sXG5cdFx0fSkpO1xuXHRcdHJldHVybiB7IGxhYmVsLCBkaXNwb3NhYmxlcywgYWN0aW9ucywgY29udGV4dEtleVNlcnZpY2U6IGNvbnRleHRLZXlTZXJ2aWNlTWFpbiB9O1xuXHR9XG5cblx0YXN5bmMgcmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8SVRleHRTZWFyY2hIZWFkaW5nLCBhbnk+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElGb2xkZXJNYXRjaFRlbXBsYXRlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGlzUGxhaW5UZXh0U2VhcmNoSGVhZGluZyhub2RlLmVsZW1lbnQpKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuc2V0TGFiZWwobmxzLmxvY2FsaXplKCdzZWFyY2hGb2xkZXJNYXRjaC5wbGFpblRleHQubGFiZWwnLCBcIlRleHQgUmVzdWx0c1wiKSk7XG5cdFx0XHRTZWFyY2hDb250ZXh0LkFJUmVzdWx0c1RpdGxlLmJpbmRUbyh0ZW1wbGF0ZURhdGEuY29udGV4dEtleVNlcnZpY2UpLnNldChmYWxzZSk7XG5cdFx0XHRTZWFyY2hDb250ZXh0Lk1hdGNoRm9jdXNLZXkuYmluZFRvKHRlbXBsYXRlRGF0YS5jb250ZXh0S2V5U2VydmljZSkuc2V0KGZhbHNlKTtcblx0XHRcdFNlYXJjaENvbnRleHQuRmlsZUZvY3VzS2V5LmJpbmRUbyh0ZW1wbGF0ZURhdGEuY29udGV4dEtleVNlcnZpY2UpLnNldChmYWxzZSk7XG5cdFx0XHRTZWFyY2hDb250ZXh0LkZvbGRlckZvY3VzS2V5LmJpbmRUbyh0ZW1wbGF0ZURhdGEuY29udGV4dEtleVNlcnZpY2UpLnNldChmYWxzZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IG5vZGUuZWxlbWVudC5wYXJlbnQoKS5zZWFyY2hNb2RlbC5nZXRBSVRleHRSZXN1bHRQcm92aWRlck5hbWUoKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBpZ25vcmVcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbG9jYWxpemVkTGFiZWwgPSBubHMubG9jYWxpemUoe1xuXHRcdFx0XHRrZXk6ICdzZWFyY2hGb2xkZXJNYXRjaC5haVRleHQubGFiZWwnLFxuXHRcdFx0XHRjb21tZW50OiBbJ1RoaXMgaXMgZGlzcGxheWVkIGJlZm9yZSB0aGUgQUkgdGV4dCBzZWFyY2ggcmVzdWx0cywgbm93IGFsd2F5cyBcIkFJLWFzc2lzdGVkIHJlc3VsdHNcIi4nXVxuXHRcdFx0fSwgJ0FJLWFzc2lzdGVkIHJlc3VsdHMnKTtcblxuXHRcdFx0Ly8gdG9kbzogbWFrZSBpY29uIGV4dGVuc2lvbi1jb250cmlidXRlZC5cblx0XHRcdHRlbXBsYXRlRGF0YS5sYWJlbC5zZXRMYWJlbChgJCgke0NvZGljb24uc2VhcmNoU3BhcmtsZS5pZH0pICR7bG9jYWxpemVkTGFiZWx9YCk7XG5cblx0XHRcdFNlYXJjaENvbnRleHQuQUlSZXN1bHRzVGl0bGUuYmluZFRvKHRlbXBsYXRlRGF0YS5jb250ZXh0S2V5U2VydmljZSkuc2V0KHRydWUpO1xuXHRcdFx0U2VhcmNoQ29udGV4dC5NYXRjaEZvY3VzS2V5LmJpbmRUbyh0ZW1wbGF0ZURhdGEuY29udGV4dEtleVNlcnZpY2UpLnNldChmYWxzZSk7XG5cdFx0XHRTZWFyY2hDb250ZXh0LkZpbGVGb2N1c0tleS5iaW5kVG8odGVtcGxhdGVEYXRhLmNvbnRleHRLZXlTZXJ2aWNlKS5zZXQoZmFsc2UpO1xuXHRcdFx0U2VhcmNoQ29udGV4dC5Gb2xkZXJGb2N1c0tleS5iaW5kVG8odGVtcGxhdGVEYXRhLmNvbnRleHRLZXlTZXJ2aWNlKS5zZXQoZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElGb2xkZXJNYXRjaFRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHJlbmRlckNvbXByZXNzZWRFbGVtZW50cyhub2RlOiBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxJVGV4dFNlYXJjaEhlYWRpbmc+LCBhbnk+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElUZXh0U2VhcmNoUmVzdWx0VGVtcGxhdGUpOiB2b2lkIHtcblx0fVxuXG59XG5leHBvcnQgY2xhc3MgRm9sZGVyTWF0Y2hSZW5kZXJlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyPElTZWFyY2hUcmVlRm9sZGVyTWF0Y2gsIGFueSwgSUZvbGRlck1hdGNoVGVtcGxhdGU+IHtcblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ2ZvbGRlck1hdGNoJztcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkID0gRm9sZGVyTWF0Y2hSZW5kZXJlci5URU1QTEFURV9JRDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHNlYXJjaFZpZXc6IFNlYXJjaFZpZXcsXG5cdFx0cHJpdmF0ZSBsYWJlbHM6IFJlc291cmNlTGFiZWxzLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJvdGVjdGVkIGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRyZW5kZXJDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8SVNlYXJjaFRyZWVGb2xkZXJNYXRjaD4sIGFueT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUZvbGRlck1hdGNoVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRjb25zdCBjb21wcmVzc2VkID0gbm9kZS5lbGVtZW50O1xuXHRcdGNvbnN0IGZvbGRlciA9IGNvbXByZXNzZWQuZWxlbWVudHNbY29tcHJlc3NlZC5lbGVtZW50cy5sZW5ndGggLSAxXTtcblx0XHRjb25zdCBsYWJlbCA9IGNvbXByZXNzZWQuZWxlbWVudHMubWFwKGUgPT4gZS5uYW1lKCkpO1xuXG5cdFx0aWYgKGZvbGRlci5yZXNvdXJjZSkge1xuXHRcdFx0Y29uc3QgZmlsZUtpbmQgPSAoaXNTZWFyY2hUcmVlRm9sZGVyTWF0Y2hXb3Jrc3BhY2VSb290KGZvbGRlcikpID8gRmlsZUtpbmQuUk9PVF9GT0xERVIgOiBGaWxlS2luZC5GT0xERVI7XG5cdFx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuc2V0UmVzb3VyY2UoeyByZXNvdXJjZTogZm9sZGVyLnJlc291cmNlLCBuYW1lOiBsYWJlbCB9LCB7XG5cdFx0XHRcdGZpbGVLaW5kLFxuXHRcdFx0XHRzZXBhcmF0b3I6IHRoaXMubGFiZWxTZXJ2aWNlLmdldFNlcGFyYXRvcihmb2xkZXIucmVzb3VyY2Uuc2NoZW1lKSxcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuc2V0TGFiZWwobmxzLmxvY2FsaXplKCdzZWFyY2hGb2xkZXJNYXRjaC5vdGhlci5sYWJlbCcsIFwiT3RoZXIgZmlsZXNcIikpO1xuXHRcdH1cblxuXHRcdHRoaXMucmVuZGVyRm9sZGVyRGV0YWlscyhmb2xkZXIsIHRlbXBsYXRlRGF0YSk7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUZvbGRlck1hdGNoVGVtcGxhdGUge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29uc3QgZm9sZGVyTWF0Y2hFbGVtZW50ID0gRE9NLmFwcGVuZChjb250YWluZXIsIERPTS4kKCcuZm9sZGVybWF0Y2gnKSk7XG5cdFx0Y29uc3QgbGFiZWwgPSB0aGlzLmxhYmVscy5jcmVhdGUoZm9sZGVyTWF0Y2hFbGVtZW50LCB7IHN1cHBvcnREZXNjcmlwdGlvbkhpZ2hsaWdodHM6IHRydWUsIHN1cHBvcnRIaWdobGlnaHRzOiB0cnVlIH0pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYWJlbCk7XG5cdFx0Y29uc3QgYmFkZ2UgPSBuZXcgQ291bnRCYWRnZShET00uYXBwZW5kKGZvbGRlck1hdGNoRWxlbWVudCwgRE9NLiQoJy5iYWRnZScpKSwge30sIGRlZmF1bHRDb3VudEJhZGdlU3R5bGVzKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoYmFkZ2UpO1xuXHRcdGNvbnN0IGFjdGlvbkJhckNvbnRhaW5lciA9IERPTS5hcHBlbmQoZm9sZGVyTWF0Y2hFbGVtZW50LCBET00uJCgnLmFjdGlvbkJhckNvbnRhaW5lcicpKTtcblxuXHRcdGNvbnN0IGVsZW1lbnREaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZWxlbWVudERpc3Bvc2FibGVzKTtcblxuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlTWFpbiA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZChjb250YWluZXIpKTtcblx0XHRTZWFyY2hDb250ZXh0LkFJUmVzdWx0c1RpdGxlLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZU1haW4pLnNldChmYWxzZSk7XG5cdFx0U2VhcmNoQ29udGV4dC5NYXRjaEZvY3VzS2V5LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZU1haW4pLnNldChmYWxzZSk7XG5cdFx0U2VhcmNoQ29udGV4dC5GaWxlRm9jdXNLZXkuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlTWFpbikuc2V0KGZhbHNlKTtcblx0XHRTZWFyY2hDb250ZXh0LkZvbGRlckZvY3VzS2V5LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZU1haW4pLnNldCh0cnVlKTtcblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ29udGV4dEtleVNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlTWFpbl0pKSk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgYWN0aW9uQmFyQ29udGFpbmVyLCBNZW51SWQuU2VhcmNoQWN0aW9uTWVudSwge1xuXHRcdFx0bWVudU9wdGlvbnM6IHtcblx0XHRcdFx0c2hvdWxkRm9yd2FyZEFyZ3M6IHRydWVcblx0XHRcdH0sXG5cdFx0XHRoaWRkZW5JdGVtU3RyYXRlZ3k6IEhpZGRlbkl0ZW1TdHJhdGVneS5JZ25vcmUsXG5cdFx0XHR0b29sYmFyT3B0aW9uczoge1xuXHRcdFx0XHRwcmltYXJ5R3JvdXA6IChnOiBzdHJpbmcpID0+IC9eaW5saW5lLy50ZXN0KGcpLFxuXHRcdFx0fSxcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bGFiZWwsXG5cdFx0XHRiYWRnZSxcblx0XHRcdGFjdGlvbnMsXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHRcdGVsZW1lbnREaXNwb3NhYmxlcyxcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlOiBjb250ZXh0S2V5U2VydmljZU1haW5cblx0XHR9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8SVNlYXJjaFRyZWVGb2xkZXJNYXRjaCwgYW55PiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJRm9sZGVyTWF0Y2hUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGZvbGRlck1hdGNoID0gbm9kZS5lbGVtZW50O1xuXHRcdGlmIChmb2xkZXJNYXRjaC5yZXNvdXJjZSkge1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2VGb2xkZXIoZm9sZGVyTWF0Y2gucmVzb3VyY2UpO1xuXHRcdFx0aWYgKHdvcmtzcGFjZUZvbGRlciAmJiBpc0VxdWFsKHdvcmtzcGFjZUZvbGRlci51cmksIGZvbGRlck1hdGNoLnJlc291cmNlKSkge1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuc2V0RmlsZShmb2xkZXJNYXRjaC5yZXNvdXJjZSwgeyBmaWxlS2luZDogRmlsZUtpbmQuUk9PVF9GT0xERVIsIGhpZGVQYXRoOiB0cnVlIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnNldEZpbGUoZm9sZGVyTWF0Y2gucmVzb3VyY2UsIHsgZmlsZUtpbmQ6IEZpbGVLaW5kLkZPTERFUiwgaGlkZVBhdGg6IHRoaXMuc2VhcmNoVmlldy5pc1RyZWVMYXlvdXRWaWV3VmlzaWJsZSB9KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnNldExhYmVsKG5scy5sb2NhbGl6ZSgnc2VhcmNoRm9sZGVyTWF0Y2gub3RoZXIubGFiZWwnLCBcIk90aGVyIGZpbGVzXCIpKTtcblx0XHR9XG5cblx0XHRTZWFyY2hDb250ZXh0LklzRWRpdGFibGVJdGVtS2V5LmJpbmRUbyh0ZW1wbGF0ZURhdGEuY29udGV4dEtleVNlcnZpY2UpLnNldCghZm9sZGVyTWF0Y2guaGFzT25seVJlYWRPbmx5TWF0Y2hlcygpKTtcblxuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKGZvbGRlck1hdGNoLm9uQ2hhbmdlKCgpID0+IHtcblx0XHRcdFNlYXJjaENvbnRleHQuSXNFZGl0YWJsZUl0ZW1LZXkuYmluZFRvKHRlbXBsYXRlRGF0YS5jb250ZXh0S2V5U2VydmljZSkuc2V0KCFmb2xkZXJNYXRjaC5oYXNPbmx5UmVhZE9ubHlNYXRjaGVzKCkpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMucmVuZGVyRm9sZGVyRGV0YWlscyhmb2xkZXJNYXRjaCwgdGVtcGxhdGVEYXRhKTtcblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxSZW5kZXJhYmxlTWF0Y2gsIGFueT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUZvbGRlck1hdGNoVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRkaXNwb3NlQ29tcHJlc3NlZEVsZW1lbnRzKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPElTZWFyY2hUcmVlRm9sZGVyTWF0Y2g+LCBhbnk+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElGb2xkZXJNYXRjaFRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUZvbGRlck1hdGNoVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJGb2xkZXJEZXRhaWxzKGZvbGRlcjogSVNlYXJjaFRyZWVGb2xkZXJNYXRjaCwgdGVtcGxhdGVEYXRhOiBJRm9sZGVyTWF0Y2hUZW1wbGF0ZSkge1xuXHRcdGNvbnN0IGNvdW50ID0gZm9sZGVyLnJlY3Vyc2l2ZU1hdGNoQ291bnQoKTtcblx0XHR0ZW1wbGF0ZURhdGEuYmFkZ2Uuc2V0Q291bnQoY291bnQpO1xuXHRcdHRlbXBsYXRlRGF0YS5iYWRnZS5zZXRUaXRsZUZvcm1hdChjb3VudCA+IDEgPyBubHMubG9jYWxpemUoJ3NlYXJjaEZpbGVNYXRjaGVzJywgXCJ7MH0gZmlsZXMgZm91bmRcIiwgY291bnQpIDogbmxzLmxvY2FsaXplKCdzZWFyY2hGaWxlTWF0Y2gnLCBcInswfSBmaWxlIGZvdW5kXCIsIGNvdW50KSk7XG5cblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9ucy5jb250ZXh0ID0geyB2aWV3ZXI6IHRoaXMuc2VhcmNoVmlldy5nZXRDb250cm9sKCksIGVsZW1lbnQ6IGZvbGRlciB9IHNhdGlzZmllcyBJU2VhcmNoQWN0aW9uQ29udGV4dDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRmlsZU1hdGNoUmVuZGVyZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNvbXByZXNzaWJsZVRyZWVSZW5kZXJlcjxJU2VhcmNoVHJlZUZpbGVNYXRjaCwgYW55LCBJRmlsZU1hdGNoVGVtcGxhdGU+IHtcblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ2ZpbGVNYXRjaCc7XG5cblx0cmVhZG9ubHkgdGVtcGxhdGVJZCA9IEZpbGVNYXRjaFJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgc2VhcmNoVmlldzogU2VhcmNoVmlldyxcblx0XHRwcml2YXRlIGxhYmVsczogUmVzb3VyY2VMYWJlbHMsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcm90ZWN0ZWQgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHJlbmRlckNvbXByZXNzZWRFbGVtZW50cyhub2RlOiBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxJU2VhcmNoVHJlZUZpbGVNYXRjaD4sIGFueT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUZpbGVNYXRjaFRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdTaG91bGQgbmV2ZXIgaGFwcGVuIHNpbmNlIG5vZGUgaXMgaW5jb21wcmVzc2libGUuJyk7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUZpbGVNYXRjaFRlbXBsYXRlIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBlbGVtZW50RGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGVsZW1lbnREaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgZmlsZU1hdGNoRWxlbWVudCA9IERPTS5hcHBlbmQoY29udGFpbmVyLCBET00uJCgnLmZpbGVtYXRjaCcpKTtcblx0XHRjb25zdCBsYWJlbCA9IHRoaXMubGFiZWxzLmNyZWF0ZShmaWxlTWF0Y2hFbGVtZW50KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFiZWwpO1xuXHRcdGNvbnN0IGJhZGdlID0gbmV3IENvdW50QmFkZ2UoRE9NLmFwcGVuZChmaWxlTWF0Y2hFbGVtZW50LCBET00uJCgnLmJhZGdlJykpLCB7fSwgZGVmYXVsdENvdW50QmFkZ2VTdHlsZXMpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChiYWRnZSk7XG5cdFx0Y29uc3QgYWN0aW9uQmFyQ29udGFpbmVyID0gRE9NLmFwcGVuZChmaWxlTWF0Y2hFbGVtZW50LCBET00uJCgnLmFjdGlvbkJhckNvbnRhaW5lcicpKTtcblxuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlTWFpbiA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZChjb250YWluZXIpKTtcblx0XHRTZWFyY2hDb250ZXh0LkFJUmVzdWx0c1RpdGxlLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZU1haW4pLnNldChmYWxzZSk7XG5cdFx0U2VhcmNoQ29udGV4dC5NYXRjaEZvY3VzS2V5LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZU1haW4pLnNldChmYWxzZSk7XG5cdFx0U2VhcmNoQ29udGV4dC5GaWxlRm9jdXNLZXkuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlTWFpbikuc2V0KHRydWUpO1xuXHRcdFNlYXJjaENvbnRleHQuRm9sZGVyRm9jdXNLZXkuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlTWFpbikuc2V0KGZhbHNlKTtcblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ29udGV4dEtleVNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlTWFpbl0pKSk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgYWN0aW9uQmFyQ29udGFpbmVyLCBNZW51SWQuU2VhcmNoQWN0aW9uTWVudSwge1xuXHRcdFx0bWVudU9wdGlvbnM6IHtcblx0XHRcdFx0c2hvdWxkRm9yd2FyZEFyZ3M6IHRydWVcblx0XHRcdH0sXG5cdFx0XHRoaWRkZW5JdGVtU3RyYXRlZ3k6IEhpZGRlbkl0ZW1TdHJhdGVneS5JZ25vcmUsXG5cdFx0XHR0b29sYmFyT3B0aW9uczoge1xuXHRcdFx0XHRwcmltYXJ5R3JvdXA6IChnOiBzdHJpbmcpID0+IC9eaW5saW5lLy50ZXN0KGcpLFxuXHRcdFx0fSxcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZWw6IGZpbGVNYXRjaEVsZW1lbnQsXG5cdFx0XHRsYWJlbCxcblx0XHRcdGJhZGdlLFxuXHRcdFx0YWN0aW9ucyxcblx0XHRcdGRpc3Bvc2FibGVzLFxuXHRcdFx0ZWxlbWVudERpc3Bvc2FibGVzLFxuXHRcdFx0Y29udGV4dEtleVNlcnZpY2U6IGNvbnRleHRLZXlTZXJ2aWNlTWFpblxuXHRcdH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxJU2VhcmNoVHJlZUZpbGVNYXRjaCwgYW55PiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJRmlsZU1hdGNoVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRjb25zdCBmaWxlTWF0Y2ggPSBub2RlLmVsZW1lbnQ7XG5cdFx0dGVtcGxhdGVEYXRhLmVsLnNldEF0dHJpYnV0ZSgnZGF0YS1yZXNvdXJjZScsIGZpbGVNYXRjaC5yZXNvdXJjZS50b1N0cmluZygpKTtcblxuXHRcdGNvbnN0IGRlY29yYXRpb25Db25maWcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElTZWFyY2hDb25maWd1cmF0aW9uUHJvcGVydGllcz4oJ3NlYXJjaCcpLmRlY29yYXRpb25zO1xuXHRcdHRlbXBsYXRlRGF0YS5sYWJlbC5zZXRGaWxlKGZpbGVNYXRjaC5yZXNvdXJjZSwgeyByYW5nZTogaXNTZWFyY2hUcmVlQUlGaWxlTWF0Y2goZmlsZU1hdGNoKSA/IGZpbGVNYXRjaC5nZXRGdWxsUmFuZ2UoKSA6IHVuZGVmaW5lZCwgaGlkZVBhdGg6IHRoaXMuc2VhcmNoVmlldy5pc1RyZWVMYXlvdXRWaWV3VmlzaWJsZSAmJiAhKGlzU2VhcmNoVHJlZUZvbGRlck1hdGNoTm9Sb290KGZpbGVNYXRjaC5wYXJlbnQoKSkpLCBoaWRlSWNvbjogZmFsc2UsIGZpbGVEZWNvcmF0aW9uczogeyBjb2xvcnM6IGRlY29yYXRpb25Db25maWcuY29sb3JzLCBiYWRnZXM6IGRlY29yYXRpb25Db25maWcuYmFkZ2VzIH0gfSk7XG5cdFx0Y29uc3QgY291bnQgPSBmaWxlTWF0Y2guY291bnQoKTtcblx0XHR0ZW1wbGF0ZURhdGEuYmFkZ2Uuc2V0Q291bnQoY291bnQpO1xuXHRcdHRlbXBsYXRlRGF0YS5iYWRnZS5zZXRUaXRsZUZvcm1hdChjb3VudCA+IDEgPyBubHMubG9jYWxpemUoJ3NlYXJjaE1hdGNoZXMnLCBcInswfSBtYXRjaGVzIGZvdW5kXCIsIGNvdW50KSA6IG5scy5sb2NhbGl6ZSgnc2VhcmNoTWF0Y2gnLCBcInswfSBtYXRjaCBmb3VuZFwiLCBjb3VudCkpO1xuXG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbnMuY29udGV4dCA9IHsgdmlld2VyOiB0aGlzLnNlYXJjaFZpZXcuZ2V0Q29udHJvbCgpLCBlbGVtZW50OiBmaWxlTWF0Y2ggfSBzYXRpc2ZpZXMgSVNlYXJjaEFjdGlvbkNvbnRleHQ7XG5cblx0XHRTZWFyY2hDb250ZXh0LklzRWRpdGFibGVJdGVtS2V5LmJpbmRUbyh0ZW1wbGF0ZURhdGEuY29udGV4dEtleVNlcnZpY2UpLnNldCghZmlsZU1hdGNoLmhhc09ubHlSZWFkT25seU1hdGNoZXMoKSk7XG5cblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZChmaWxlTWF0Y2gub25DaGFuZ2UoKCkgPT4ge1xuXHRcdFx0U2VhcmNoQ29udGV4dC5Jc0VkaXRhYmxlSXRlbUtleS5iaW5kVG8odGVtcGxhdGVEYXRhLmNvbnRleHRLZXlTZXJ2aWNlKS5zZXQoIWZpbGVNYXRjaC5oYXNPbmx5UmVhZE9ubHlNYXRjaGVzKCkpO1xuXHRcdH0pKTtcblxuXHRcdC8vIHdoZW4gaGlkZXNFeHBsb3JlckFycm93czogdHJ1ZSwgdGhlbiB0aGUgZmlsZSBub2RlcyBzaG91bGQgc3RpbGwgaGF2ZSBhIHR3aXN0aWUgYmVjYXVzZSBpdCB3b3VsZCBvdGhlcndpc2Vcblx0XHQvLyBiZSBoYXJkIHRvIHRlbGwgd2hldGhlciB0aGUgbm9kZSBpcyBjb2xsYXBzZWQgb3IgZXhwYW5kZWQuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgdHdpc3RpZUNvbnRhaW5lciA9IHRlbXBsYXRlRGF0YS5lbC5wYXJlbnRFbGVtZW50Py5wYXJlbnRFbGVtZW50Py5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLXRsLXR3aXN0aWUnKTtcblx0XHR0d2lzdGllQ29udGFpbmVyPy5jbGFzc0xpc3QuYWRkKCdmb3JjZS10d2lzdGllJyk7XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChlbGVtZW50OiBJVHJlZU5vZGU8UmVuZGVyYWJsZU1hdGNoLCBhbnk+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElGaWxlTWF0Y2hUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElGaWxlTWF0Y2hUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1hdGNoUmVuZGVyZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNvbXByZXNzaWJsZVRyZWVSZW5kZXJlcjxJU2VhcmNoVHJlZU1hdGNoLCB2b2lkLCBJTWF0Y2hUZW1wbGF0ZT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnbWF0Y2gnO1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQgPSBNYXRjaFJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgc2VhcmNoVmlldzogU2VhcmNoVmlldyxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByb3RlY3RlZCBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblx0cmVuZGVyQ29tcHJlc3NlZEVsZW1lbnRzKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPElTZWFyY2hUcmVlTWF0Y2g+LCB2b2lkPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJTWF0Y2hUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRocm93IG5ldyBFcnJvcignU2hvdWxkIG5ldmVyIGhhcHBlbiBzaW5jZSBub2RlIGlzIGluY29tcHJlc3NpYmxlLicpO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElNYXRjaFRlbXBsYXRlIHtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnbGluZW1hdGNoJyk7XG5cblx0XHRjb25zdCBsaW5lTnVtYmVyID0gRE9NLmFwcGVuZChjb250YWluZXIsIERPTS4kKCdzcGFuLm1hdGNoTGluZU51bScpKTtcblx0XHRjb25zdCBwYXJlbnQgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgRE9NLiQoJ2EucGxhaW4ubWF0Y2gnKSk7XG5cdFx0Y29uc3QgYmVmb3JlID0gRE9NLmFwcGVuZChwYXJlbnQsIERPTS4kKCdzcGFuJykpO1xuXHRcdGNvbnN0IG1hdGNoID0gRE9NLmFwcGVuZChwYXJlbnQsIERPTS4kKCdzcGFuLmZpbmRJbkZpbGVNYXRjaCcpKTtcblx0XHRjb25zdCByZXBsYWNlID0gRE9NLmFwcGVuZChwYXJlbnQsIERPTS4kKCdzcGFuLnJlcGxhY2VNYXRjaCcpKTtcblx0XHRjb25zdCBhZnRlciA9IERPTS5hcHBlbmQocGFyZW50LCBET00uJCgnc3BhbicpKTtcblx0XHRjb25zdCBhY3Rpb25CYXJDb250YWluZXIgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgRE9NLiQoJ3NwYW4uYWN0aW9uQmFyQ29udGFpbmVyJykpO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZU1haW4gPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQoY29udGFpbmVyKSk7XG5cdFx0U2VhcmNoQ29udGV4dC5BSVJlc3VsdHNUaXRsZS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2VNYWluKS5zZXQoZmFsc2UpO1xuXHRcdFNlYXJjaENvbnRleHQuTWF0Y2hGb2N1c0tleS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2VNYWluKS5zZXQodHJ1ZSk7XG5cdFx0U2VhcmNoQ29udGV4dC5GaWxlRm9jdXNLZXkuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlTWFpbikuc2V0KGZhbHNlKTtcblx0XHRTZWFyY2hDb250ZXh0LkZvbGRlckZvY3VzS2V5LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZU1haW4pLnNldChmYWxzZSk7XG5cblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZU1haW5dKSkpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIGFjdGlvbkJhckNvbnRhaW5lciwgTWVudUlkLlNlYXJjaEFjdGlvbk1lbnUsIHtcblx0XHRcdG1lbnVPcHRpb25zOiB7XG5cdFx0XHRcdHNob3VsZEZvcndhcmRBcmdzOiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0aGlkZGVuSXRlbVN0cmF0ZWd5OiBIaWRkZW5JdGVtU3RyYXRlZ3kuSWdub3JlLFxuXHRcdFx0dG9vbGJhck9wdGlvbnM6IHtcblx0XHRcdFx0cHJpbWFyeUdyb3VwOiAoZzogc3RyaW5nKSA9PiAvXmlubGluZS8udGVzdChnKSxcblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcGFyZW50SG92ZXIgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIHBhcmVudCwgJycpKTtcblx0XHRjb25zdCBsaW5lTnVtYmVySG92ZXIgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIGxpbmVOdW1iZXIsICcnKSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0cGFyZW50LFxuXHRcdFx0YmVmb3JlLFxuXHRcdFx0bWF0Y2gsXG5cdFx0XHRyZXBsYWNlLFxuXHRcdFx0YWZ0ZXIsXG5cdFx0XHRsaW5lTnVtYmVyLFxuXHRcdFx0YWN0aW9ucyxcblx0XHRcdHBhcmVudEhvdmVyLFxuXHRcdFx0bGluZU51bWJlckhvdmVyLFxuXHRcdFx0ZGlzcG9zYWJsZXMsXG5cdFx0XHRjb250ZXh0S2V5U2VydmljZTogY29udGV4dEtleVNlcnZpY2VNYWluXG5cdFx0fTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQobm9kZTogSVRyZWVOb2RlPElTZWFyY2hUcmVlTWF0Y2gsIGFueT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSU1hdGNoVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRjb25zdCBtYXRjaCA9IG5vZGUuZWxlbWVudDtcblx0XHRjb25zdCBwcmV2aWV3ID0gbWF0Y2gucHJldmlldygpO1xuXHRcdGNvbnN0IHJlcGxhY2UgPSB0aGlzLnNlYXJjaFZpZXcubW9kZWwuaXNSZXBsYWNlQWN0aXZlKCkgJiZcblx0XHRcdCEhdGhpcy5zZWFyY2hWaWV3Lm1vZGVsLnJlcGxhY2VTdHJpbmcgJiZcblx0XHRcdCFtYXRjaC5pc1JlYWRvbmx5O1xuXG5cdFx0dGVtcGxhdGVEYXRhLmJlZm9yZS50ZXh0Q29udGVudCA9IHByZXZpZXcuYmVmb3JlO1xuXHRcdHRlbXBsYXRlRGF0YS5tYXRjaC50ZXh0Q29udGVudCA9IHByZXZpZXcuaW5zaWRlO1xuXHRcdHRlbXBsYXRlRGF0YS5tYXRjaC5jbGFzc0xpc3QudG9nZ2xlKCdyZXBsYWNlJywgcmVwbGFjZSk7XG5cdFx0dGVtcGxhdGVEYXRhLnJlcGxhY2UudGV4dENvbnRlbnQgPSByZXBsYWNlID8gbWF0Y2gucmVwbGFjZVN0cmluZyA6ICcnO1xuXHRcdHRlbXBsYXRlRGF0YS5hZnRlci50ZXh0Q29udGVudCA9IHByZXZpZXcuYWZ0ZXI7XG5cblx0XHRjb25zdCB0aXRsZSA9IChwcmV2aWV3LmZ1bGxCZWZvcmUgKyAocmVwbGFjZSA/IG1hdGNoLnJlcGxhY2VTdHJpbmcgOiBwcmV2aWV3Lmluc2lkZSkgKyBwcmV2aWV3LmFmdGVyKS50cmltKCkuc3Vic3RyKDAsIDk5OSk7XG5cdFx0dGVtcGxhdGVEYXRhLnBhcmVudEhvdmVyLnVwZGF0ZSh0aXRsZSk7XG5cblx0XHRTZWFyY2hDb250ZXh0LklzRWRpdGFibGVJdGVtS2V5LmJpbmRUbyh0ZW1wbGF0ZURhdGEuY29udGV4dEtleVNlcnZpY2UpLnNldCghbWF0Y2guaXNSZWFkb25seSk7XG5cblx0XHRjb25zdCBudW1MaW5lcyA9IG1hdGNoLnJhbmdlKCkuZW5kTGluZU51bWJlciAtIG1hdGNoLnJhbmdlKCkuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IGV4dHJhTGluZXNTdHIgPSBudW1MaW5lcyA+IDAgPyBgKyR7bnVtTGluZXN9YCA6ICcnO1xuXG5cdFx0Y29uc3Qgc2hvd0xpbmVOdW1iZXJzID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJU2VhcmNoQ29uZmlndXJhdGlvblByb3BlcnRpZXM+KCdzZWFyY2gnKS5zaG93TGluZU51bWJlcnM7XG5cdFx0Y29uc3QgbGluZU51bWJlclN0ciA9IHNob3dMaW5lTnVtYmVycyA/IGAke21hdGNoLnJhbmdlKCkuc3RhcnRMaW5lTnVtYmVyfTpgIDogJyc7XG5cdFx0dGVtcGxhdGVEYXRhLmxpbmVOdW1iZXIuY2xhc3NMaXN0LnRvZ2dsZSgnc2hvdycsIChudW1MaW5lcyA+IDApIHx8IHNob3dMaW5lTnVtYmVycyk7XG5cblx0XHR0ZW1wbGF0ZURhdGEubGluZU51bWJlci50ZXh0Q29udGVudCA9IGxpbmVOdW1iZXJTdHIgKyBleHRyYUxpbmVzU3RyO1xuXHRcdHRlbXBsYXRlRGF0YS5saW5lTnVtYmVySG92ZXIudXBkYXRlKHRoaXMuZ2V0TWF0Y2hUaXRsZShtYXRjaCwgc2hvd0xpbmVOdW1iZXJzKSk7XG5cblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9ucy5jb250ZXh0ID0geyB2aWV3ZXI6IHRoaXMuc2VhcmNoVmlldy5nZXRDb250cm9sKCksIGVsZW1lbnQ6IG1hdGNoIH0gc2F0aXNmaWVzIElTZWFyY2hBY3Rpb25Db250ZXh0O1xuXG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJTWF0Y2hUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldE1hdGNoVGl0bGUobWF0Y2g6IElTZWFyY2hUcmVlTWF0Y2gsIHNob3dMaW5lTnVtYmVyczogYm9vbGVhbik6IHN0cmluZyB7XG5cdFx0Y29uc3Qgc3RhcnRMaW5lID0gbWF0Y2gucmFuZ2UoKS5zdGFydExpbmVOdW1iZXI7XG5cdFx0Y29uc3QgbnVtTGluZXMgPSBtYXRjaC5yYW5nZSgpLmVuZExpbmVOdW1iZXIgLSBtYXRjaC5yYW5nZSgpLnN0YXJ0TGluZU51bWJlcjtcblxuXHRcdGNvbnN0IGxpbmVOdW1TdHIgPSBzaG93TGluZU51bWJlcnMgP1xuXHRcdFx0bmxzLmxvY2FsaXplKCdsaW5lTnVtU3RyJywgXCJGcm9tIGxpbmUgezB9XCIsIHN0YXJ0TGluZSwgbnVtTGluZXMpICsgJyAnIDpcblx0XHRcdCcnO1xuXG5cdFx0Y29uc3QgbnVtTGluZXNTdHIgPSBudW1MaW5lcyA+IDAgP1xuXHRcdFx0JysgJyArIG5scy5sb2NhbGl6ZSgnbnVtTGluZXNTdHInLCBcInswfSBtb3JlIGxpbmVzXCIsIG51bUxpbmVzKSA6XG5cdFx0XHQnJztcblxuXHRcdHJldHVybiBsaW5lTnVtU3RyICsgbnVtTGluZXNTdHI7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNlYXJjaEFjY2Vzc2liaWxpdHlQcm92aWRlciBpbXBsZW1lbnRzIElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyPFJlbmRlcmFibGVNYXRjaD4ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgc2VhcmNoVmlldzogU2VhcmNoVmlldyxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZVxuXHQpIHtcblx0fVxuXG5cdGdldFdpZGdldEFyaWFMYWJlbCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBubHMubG9jYWxpemUoJ3NlYXJjaCcsIFwiU2VhcmNoXCIpO1xuXHR9XG5cblx0Z2V0QXJpYUxhYmVsKGVsZW1lbnQ6IFJlbmRlcmFibGVNYXRjaCk6IHN0cmluZyB8IG51bGwge1xuXHRcdGlmIChpc1NlYXJjaFRyZWVGb2xkZXJNYXRjaChlbGVtZW50KSkge1xuXHRcdFx0Y29uc3QgY291bnQgPSBlbGVtZW50LmFsbERvd25zdHJlYW1GaWxlTWF0Y2hlcygpLnJlZHVjZSgodG90YWwsIGN1cnJlbnQpID0+IHRvdGFsICsgY3VycmVudC5jb3VudCgpLCAwKTtcblx0XHRcdHJldHVybiBlbGVtZW50LnJlc291cmNlID9cblx0XHRcdFx0bmxzLmxvY2FsaXplKCdmb2xkZXJNYXRjaEFyaWFMYWJlbCcsIFwiezB9IG1hdGNoZXMgaW4gZm9sZGVyIHJvb3QgezF9LCBTZWFyY2ggcmVzdWx0XCIsIGNvdW50LCBlbGVtZW50Lm5hbWUoKSkgOlxuXHRcdFx0XHRubHMubG9jYWxpemUoJ290aGVyRmlsZXNBcmlhTGFiZWwnLCBcInswfSBtYXRjaGVzIG91dHNpZGUgb2YgdGhlIHdvcmtzcGFjZSwgU2VhcmNoIHJlc3VsdFwiLCBjb3VudCk7XG5cdFx0fVxuXG5cdFx0aWYgKGlzU2VhcmNoVHJlZUZpbGVNYXRjaChlbGVtZW50KSkge1xuXHRcdFx0Y29uc3QgcGF0aCA9IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGVsZW1lbnQucmVzb3VyY2UsIHsgcmVsYXRpdmU6IHRydWUgfSkgfHwgZWxlbWVudC5yZXNvdXJjZS5mc1BhdGg7XG5cblx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ2ZpbGVNYXRjaEFyaWFMYWJlbCcsIFwiezB9IG1hdGNoZXMgaW4gZmlsZSB7MX0gb2YgZm9sZGVyIHsyfSwgU2VhcmNoIHJlc3VsdFwiLCBlbGVtZW50LmNvdW50KCksIGVsZW1lbnQubmFtZSgpLCBwYXRocy5kaXJuYW1lKHBhdGgpKTtcblx0XHR9XG5cblx0XHRpZiAoaXNTZWFyY2hUcmVlTWF0Y2goZWxlbWVudCkpIHtcblx0XHRcdGNvbnN0IG1hdGNoID0gPElTZWFyY2hUcmVlTWF0Y2g+ZWxlbWVudDtcblx0XHRcdGNvbnN0IHNlYXJjaE1vZGVsOiBJU2VhcmNoTW9kZWwgPSB0aGlzLnNlYXJjaFZpZXcubW9kZWw7XG5cdFx0XHRjb25zdCByZXBsYWNlID0gc2VhcmNoTW9kZWwuaXNSZXBsYWNlQWN0aXZlKCkgJiYgISFzZWFyY2hNb2RlbC5yZXBsYWNlU3RyaW5nO1xuXHRcdFx0Y29uc3QgbWF0Y2hTdHJpbmcgPSBtYXRjaC5nZXRNYXRjaFN0cmluZygpO1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSBtYXRjaC5yYW5nZSgpO1xuXHRcdFx0Y29uc3QgbWF0Y2hUZXh0ID0gbWF0Y2gudGV4dCgpLnN1YnN0cigwLCByYW5nZS5lbmRDb2x1bW4gKyAxNTApO1xuXHRcdFx0aWYgKHJlcGxhY2UpIHtcblx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgncmVwbGFjZVByZXZpZXdSZXN1bHRBcmlhJywgXCInezB9JyBhdCBjb2x1bW4gezF9IHJlcGxhY2UgezJ9IHdpdGggezN9XCIsIG1hdGNoVGV4dCwgcmFuZ2Uuc3RhcnRDb2x1bW4sIG1hdGNoU3RyaW5nLCBtYXRjaC5yZXBsYWNlU3RyaW5nKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnc2VhcmNoUmVzdWx0QXJpYScsIFwiJ3swfScgYXQgY29sdW1uIHsxfSBmb3VuZCB7Mn1cIiwgbWF0Y2hUZXh0LCByYW5nZS5zdGFydENvbHVtbiwgbWF0Y2hTdHJpbmcpO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxrQkFBa0I7QUFJM0IsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxZQUFZLFdBQVc7QUFDdkIsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMscUJBQXFCO0FBRTlCLFNBQVMsZ0NBQWdDO0FBR3pDLFNBQVMsZUFBZTtBQUd4QixTQUFTLGNBQWM7QUFDdkIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxvQkFBb0IsNEJBQTRCO0FBRXpELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsK0JBQStCO0FBRXhDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZUFBZTtBQUN4QixTQUEyQixtQkFBc0csdUJBQXVCLHlCQUF5QixxQkFBbUMsc0NBQXNDLCtCQUErQixnQ0FBZ0M7QUFDelQsU0FBUywrQkFBK0I7QUEwQ2pDLE1BQU0sa0JBQU4sTUFBTSxnQkFBZ0U7QUFBQSxFQUk1RSxVQUFVLFNBQWtDO0FBQzNDLFdBQU8sZ0JBQWU7QUFBQSxFQUN2QjtBQUFBLEVBRUEsY0FBYyxTQUFrQztBQUMvQyxRQUFJLHdCQUF3QixPQUFPLEdBQUc7QUFDckMsYUFBTyxvQkFBb0I7QUFBQSxJQUM1QixXQUFXLHNCQUFzQixPQUFPLEdBQUc7QUFDMUMsYUFBTyxrQkFBa0I7QUFBQSxJQUMxQixXQUFXLGtCQUFrQixPQUFPLEdBQUc7QUFDdEMsYUFBTyxjQUFjO0FBQUEsSUFDdEIsV0FBVyxvQkFBb0IsT0FBTyxHQUFH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
