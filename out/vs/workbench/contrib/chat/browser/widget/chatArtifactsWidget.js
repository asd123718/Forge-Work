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
import * as dom from "../../../../../base/browser/dom.js";
import { ActionBar } from "../../../../../base/browser/ui/actionbar/actionbar.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { autorun, derived, observableValue } from "../../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize } from "../../../../../nls.js";
import { toAction } from "../../../../../base/common/actions.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IFileDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { WorkbenchObjectTree } from "../../../../../platform/list/browser/listService.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { ChatConfiguration } from "../../common/constants.js";
import { ChatMemoryFileResource } from "../../common/chatArtifactExtraction.js";
import { IChatArtifactsService } from "../../common/tools/chatArtifactsService.js";
import { IChatImageCarouselService } from "../chatImageCarouselService.js";
import { getEditorOverrideForChatResource } from "./chatEditorAssociations.js";
import { ChatInputStackSlot, setChatInputStackSlot } from "./input/chatInputStack.js";
const ARTIFACT_TYPE_ICONS = {
  devServer: Codicon.globe,
  screenshot: Codicon.file,
  plan: Codicon.book
};
function isGroupNode(element) {
  return element.kind === "group";
}
function isLeafNode(element) {
  return element.kind === "leaf";
}
let ChatArtifactsWidget = class extends Disposable {
  constructor(_chatArtifactsService, _instantiationService, _openerService, _configurationService, _commandService, _fileService, _fileDialogService, _chatImageCarouselService) {
    super();
    this._chatArtifactsService = _chatArtifactsService;
    this._instantiationService = _instantiationService;
    this._openerService = _openerService;
    this._configurationService = _configurationService;
    this._commandService = _commandService;
    this._fileService = _fileService;
    this._fileDialogService = _fileDialogService;
    this._chatImageCarouselService = _chatImageCarouselService;
    this._visible = false;
    this._sessionResource = observableValue(this, void 0);
    this._isCollapsed = observableValue(this, false);
    this._currentArtifacts = derived(this, (reader) => {
      const sr = this._sessionResource.read(reader);
      return sr ? this._chatArtifactsService.getArtifacts(sr) : void 0;
    });
    this._treeData = derived(this, (reader) => {
      const artifacts = this._currentArtifacts.read(reader);
      if (!artifacts) {
        return void 0;
      }
      const groups = artifacts.artifactGroups.read(reader);
      const totalCount = groups.reduce((sum, g) => sum + g.artifacts.length, 0);
      if (totalCount === 0) {
        return void 0;
      }
      const multiSource = groups.length > 1;
      const treeElements = buildTreeElementsFromGroups(groups, multiSource, (source) => this._clearSource(source));
      const visibleCount = countVisibleRows(treeElements);
      const itemsShown = Math.min(visibleCount, ChatArtifactsWidget.MAX_ITEMS_SHOWN);
      return {
        totalCount,
        treeElements,
        treeHeight: itemsShown * ChatArtifactsWidget.ELEMENT_HEIGHT
      };
    });
    this.domNode = dom.$(".chat-artifacts-widget");
    this.domNode.style.display = "none";
    this._register(autorun((reader) => {
      const artifacts = this._currentArtifacts.read(reader);
      dom.clearNode(this.domNode);
      if (!artifacts) {
        this._setVisible(false);
        return;
      }
      const store = reader.store;
      const expandoContainer = dom.$(".chat-artifacts-expand");
      const headerButton = store.add(new Button(expandoContainer, { supportIcons: true }));
      const titleSection = dom.$(".chat-artifacts-title-section");
      const expandIcon = dom.$(".expand-icon.codicon");
      expandIcon.setAttribute("aria-hidden", "true");
      const titleElement = dom.$(".chat-artifacts-title");
      titleSection.appendChild(expandIcon);
      titleSection.appendChild(titleElement);
      headerButton.element.appendChild(titleSection);
      this.domNode.appendChild(expandoContainer);
      const listContainer = dom.$(".chat-artifacts-list");
      this.domNode.appendChild(listContainer);
      const tree = store.add(this._instantiationService.createInstance(
        WorkbenchObjectTree,
        "ChatArtifactsTree",
        listContainer,
        new ChatArtifactsTreeDelegate(),
        [
          new ChatArtifactGroupRenderer(),
          new ChatArtifactLeafRenderer((artifact) => this._saveArtifact(artifact))
        ],
        {
          alwaysConsumeMouseWheel: false,
          accessibilityProvider: new ChatArtifactsAccessibilityProvider()
        }
      ));
      store.add(tree.onDidOpen((e) => {
        if (!e.element) {
          return;
        }
        if (isGroupNode(e.element)) {
          if (e.element.onlyShowGroup) {
            this._openGroupInCarousel(e.element);
          }
        } else if (isLeafNode(e.element)) {
          this._openLeafArtifact(e.element.artifact);
        }
      }));
      store.add(headerButton.onDidClick(() => {
        this._isCollapsed.set(!this._isCollapsed.read(void 0), void 0);
      }));
      store.add(autorun((reader2) => {
        const collapsed = this._isCollapsed.read(reader2);
        expandIcon.classList.toggle("codicon-chevron-down", !collapsed);
        expandIcon.classList.toggle("codicon-chevron-right", collapsed);
        headerButton.element.setAttribute("aria-expanded", String(!collapsed));
        listContainer.style.display = collapsed ? "none" : "block";
      }));
      store.add(autorun((reader2) => {
        const data = this._treeData.read(reader2);
        if (!data) {
          this._setVisible(false);
          return;
        }
        this._setVisible(true);
        titleElement.textContent = data.totalCount === 1 ? localize("chat.artifacts.one", "1 Artifact") : localize("chat.artifacts.count", "{0} Artifacts", data.totalCount);
        tree.layout(data.treeHeight);
        tree.getHTMLElement().style.height = `${data.treeHeight}px`;
        tree.setChildren(null, data.treeElements);
      }));
    }));
  }
  setSessionResource(sessionResource) {
    this._sessionResource.set(sessionResource, void 0);
  }
  /** Add the list to its slot in the chat input stack. */
  attachTo(slot) {
    this._slot = slot;
    slot.appendChild(this.domNode);
    setChatInputStackSlot(slot, this._visible ? ChatInputStackSlot.Docked : ChatInputStackSlot.Empty);
  }
  /** Show or hide the list, and report the same to the stack. */
  _setVisible(visible) {
    this._visible = visible;
    this.domNode.style.display = visible ? "" : "none";
    setChatInputStackSlot(this._slot, visible ? ChatInputStackSlot.Docked : ChatInputStackSlot.Empty);
  }
  async _openGroupInCarousel(group) {
    const first = group.artifacts[0];
    if (first?.uri) {
      await this._chatImageCarouselService.openCarouselAtResource(URI.parse(first.uri));
    }
  }
  _openLeafArtifact(artifact) {
    if (artifact.type === "screenshot" && this._configurationService.getValue(ChatConfiguration.ImageCarouselEnabled)) {
      this._openScreenshotInCarousel(artifact);
    } else if (artifact.uri) {
      const uri = URI.parse(artifact.uri);
      if (ChatMemoryFileResource.isChatMemoryFileUri(uri)) {
        this._openMemoryFileArtifact(uri);
      } else {
        const editorOverride = getEditorOverrideForChatResource(uri, this._configurationService);
        this._openerService.open(uri, {
          fromUserGesture: true,
          editorOptions: { override: editorOverride }
        });
      }
    }
  }
  async _openScreenshotInCarousel(clicked) {
    if (clicked.uri) {
      await this._chatImageCarouselService.openCarouselAtResource(URI.parse(clicked.uri));
    }
  }
  async _openMemoryFileArtifact(uri) {
    const { memoryPath, sessionResource } = ChatMemoryFileResource.parse(uri);
    const resolvedUriStr = await this._commandService.executeCommand(
      "github.copilot.chat.tools.memory.resolveMemoryFileUri",
      memoryPath,
      sessionResource
    );
    if (resolvedUriStr) {
      const resolvedUri = URI.parse(resolvedUriStr);
      const editorOverride = getEditorOverrideForChatResource(resolvedUri, this._configurationService);
      this._openerService.open(resolvedUri, {
        fromUserGesture: true,
        editorOptions: { override: editorOverride }
      });
    }
  }
  _clearSource(source) {
    const artifacts = this._currentArtifacts.get();
    if (!artifacts) {
      return;
    }
    switch (source.kind) {
      case "agent":
        artifacts.clearAgentArtifacts();
        break;
      case "subagent":
        artifacts.clearSubagentArtifacts(source.invocationId);
        break;
    }
  }
  async _saveArtifact(artifact) {
    const sourceUri = URI.parse(artifact.uri);
    const defaultFileName = sourceUri.path.split("/").pop() ?? artifact.label;
    const defaultPath = await this._fileDialogService.defaultFilePath();
    const defaultUri = URI.joinPath(defaultPath, defaultFileName);
    const targetUri = await this._fileDialogService.showSaveDialog({
      defaultUri,
      title: localize("chat.artifacts.saveDialog.title", "Save Artifact")
    });
    if (targetUri) {
      const content = await this._fileService.readFile(sourceUri);
      await this._fileService.writeFile(targetUri, content.value);
    }
  }
};
ChatArtifactsWidget.ELEMENT_HEIGHT = 22;
ChatArtifactsWidget.MAX_ITEMS_SHOWN = 6;
ChatArtifactsWidget = __decorateClass([
  __decorateParam(0, IChatArtifactsService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IOpenerService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, ICommandService),
  __decorateParam(5, IFileService),
  __decorateParam(6, IFileDialogService),
  __decorateParam(7, IChatImageCarouselService)
], ChatArtifactsWidget);
function sourceDisplayName(source) {
  switch (source.kind) {
    case "rules":
      return localize("chat.artifacts.source.rules", "Rules");
    case "agent":
      return localize("chat.artifacts.source.agent", "Agent");
    case "subagent":
      return source.name ?? localize("chat.artifacts.source.subagent", "Subagent");
  }
}
function buildTreeElementsFromGroups(sourceGroups, multiSource, onClearSource) {
  const elements = [];
  for (const sourceGroup of sourceGroups) {
    const prefix = multiSource ? sourceDisplayName(sourceGroup.source) : void 0;
    const clearable = sourceGroup.source.kind !== "rules";
    const onClear = clearable ? () => onClearSource(sourceGroup.source) : void 0;
    const groups = /* @__PURE__ */ new Map();
    const ungrouped = [];
    for (const artifact of sourceGroup.artifacts) {
      if (artifact.groupName) {
        let group = groups.get(artifact.groupName);
        if (!group) {
          group = { config: { groupName: artifact.groupName, onlyShowGroup: artifact.onlyShowGroup ?? false }, artifacts: [] };
          groups.set(artifact.groupName, group);
        }
        group.artifacts.push(artifact);
      } else {
        ungrouped.push(artifact);
      }
    }
    for (const [, group] of groups) {
      const displayName = prefix ? `${prefix}: ${group.config.groupName}` : group.config.groupName;
      if (group.artifacts.length === 1 && !group.config.onlyShowGroup) {
        elements.push({ element: { kind: "leaf", artifact: group.artifacts[0], description: displayName, onClear } });
        continue;
      }
      const groupNode = {
        kind: "group",
        groupName: displayName,
        artifacts: group.artifacts,
        onlyShowGroup: group.config.onlyShowGroup,
        onClear
      };
      if (group.config.onlyShowGroup) {
        elements.push({ element: groupNode, collapsible: false, collapsed: false });
      } else {
        elements.push({
          element: groupNode,
          collapsible: true,
          collapsed: false,
          children: group.artifacts.map((a) => ({ element: { kind: "leaf", artifact: a } }))
        });
      }
    }
    if (ungrouped.length > 0 && prefix) {
      if (ungrouped.length === 1) {
        elements.push({ element: { kind: "leaf", artifact: ungrouped[0], description: prefix, onClear } });
      } else {
        const groupNode = {
          kind: "group",
          groupName: prefix,
          artifacts: ungrouped,
          onlyShowGroup: false,
          onClear
        };
        elements.push({
          element: groupNode,
          collapsible: true,
          collapsed: false,
          children: ungrouped.map((a) => ({ element: { kind: "leaf", artifact: a } }))
        });
      }
    } else {
      for (const artifact of ungrouped) {
        elements.push({ element: { kind: "leaf", artifact, onClear } });
      }
    }
  }
  return elements;
}
function countVisibleRows(elements) {
  let count = 0;
  for (const el of elements) {
    count++;
    if (el.children && !el.collapsed) {
      count += countVisibleRows([...el.children]);
    }
  }
  return count;
}
class ChatArtifactsTreeDelegate {
  getHeight() {
    return ChatArtifactsWidget.ELEMENT_HEIGHT;
  }
  getTemplateId(element) {
    return isGroupNode(element) ? ChatArtifactGroupRenderer.TEMPLATE_ID : ChatArtifactLeafRenderer.TEMPLATE_ID;
  }
}
class ChatArtifactsAccessibilityProvider {
  getAriaLabel(element) {
    if (isGroupNode(element)) {
      return localize("chat.artifacts.group.aria", "{0} ({1} items)", element.groupName, element.artifacts.length);
    }
    return element.artifact.label;
  }
  getWidgetAriaLabel() {
    return localize("chat.artifacts.widget.aria", "Chat Artifacts");
  }
}
const _ChatArtifactGroupRenderer = class _ChatArtifactGroupRenderer {
  constructor() {
    this.templateId = _ChatArtifactGroupRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const row = dom.append(container, dom.$(".chat-artifacts-list-row"));
    const iconElement = dom.append(row, dom.$(".chat-artifacts-list-icon"));
    const labelElement = dom.append(row, dom.$(".chat-artifacts-list-label"));
    const actionsContainer = dom.append(row, dom.$(".chat-artifacts-list-actions"));
    const elementDisposables = new DisposableStore();
    const actionBar = new ActionBar(actionsContainer);
    return { container: row, iconElement, labelElement, actionBar, elementDisposables };
  }
  renderElement(node, _index, templateData) {
    const group = node.element;
    if (!isGroupNode(group)) {
      return;
    }
    templateData.elementDisposables.clear();
    const firstType = group.artifacts[0]?.type;
    const icon = firstType && ARTIFACT_TYPE_ICONS[firstType] || Codicon.archive;
    templateData.iconElement.className = "chat-artifacts-list-icon " + ThemeIcon.asClassName(icon);
    templateData.labelElement.textContent = `${group.groupName} (${group.artifacts.length})`;
    templateData.container.title = group.groupName;
    templateData.actionBar.clear();
    if (group.onClear) {
      const clearFn = group.onClear;
      templateData.actionBar.push(toAction({
        id: "chatArtifacts.clearSource",
        label: localize("chat.artifacts.clearSource", "Clear"),
        class: ThemeIcon.asClassName(Codicon.closeSmall),
        run: () => clearFn()
      }), { icon: true, label: false });
    }
  }
  disposeElement(_element, _index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.elementDisposables.dispose();
    templateData.actionBar.dispose();
  }
};
_ChatArtifactGroupRenderer.TEMPLATE_ID = "chatArtifactGroupRenderer";
let ChatArtifactGroupRenderer = _ChatArtifactGroupRenderer;
const _ChatArtifactLeafRenderer = class _ChatArtifactLeafRenderer {
  constructor(_onSave) {
    this._onSave = _onSave;
    this.templateId = _ChatArtifactLeafRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const row = dom.append(container, dom.$(".chat-artifacts-list-row"));
    const iconElement = dom.append(row, dom.$(".chat-artifacts-list-icon"));
    const labelElement = dom.append(row, dom.$(".chat-artifacts-list-label"));
    const descriptionElement = dom.append(row, dom.$(".chat-artifacts-list-description"));
    const actionsContainer = dom.append(row, dom.$(".chat-artifacts-list-actions"));
    const elementDisposables = new DisposableStore();
    const actionBar = new ActionBar(actionsContainer);
    return { container: row, iconElement, labelElement, descriptionElement, actionBar, elementDisposables };
  }
  renderElement(node, _index, templateData) {
    if (!isLeafNode(node.element)) {
      return;
    }
    templateData.elementDisposables.clear();
    const { artifact, description, onClear } = node.element;
    const icon = artifact.type && ARTIFACT_TYPE_ICONS[artifact.type] || Codicon.archive;
    templateData.iconElement.className = "chat-artifacts-list-icon " + ThemeIcon.asClassName(icon);
    templateData.labelElement.textContent = artifact.label;
    templateData.descriptionElement.textContent = description ?? "";
    templateData.descriptionElement.style.display = description ? "" : "none";
    templateData.container.title = artifact.uri;
    templateData.actionBar.clear();
    const actions = [];
    if (onClear) {
      const clearFn = onClear;
      actions.push(toAction({
        id: "chatArtifacts.clearSource",
        label: localize("chat.artifacts.clearSource", "Clear"),
        class: ThemeIcon.asClassName(Codicon.closeSmall),
        run: () => clearFn()
      }));
    }
    actions.push(toAction({
      id: "chatArtifacts.save",
      label: localize("chat.artifacts.save", "Save artifact"),
      class: ThemeIcon.asClassName(Codicon.save),
      run: () => this._onSave(artifact)
    }));
    templateData.actionBar.push(actions, { icon: true, label: false });
  }
  disposeElement(_element, _index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.elementDisposables.dispose();
    templateData.actionBar.dispose();
  }
};
_ChatArtifactLeafRenderer.TEMPLATE_ID = "chatArtifactLeafRenderer";
let ChatArtifactLeafRenderer = _ChatArtifactLeafRenderer;
export {
  ChatArtifactsWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdEFydGlmYWN0c1dpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IElMaXN0VmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBJT2JqZWN0VHJlZUVsZW1lbnQsIElUcmVlTm9kZSwgSVRyZWVSZW5kZXJlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBkZXJpdmVkLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElGaWxlRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaE9iamVjdFRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQ2hhdE1lbW9yeUZpbGVSZXNvdXJjZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0QXJ0aWZhY3RFeHRyYWN0aW9uLmpzJztcbmltcG9ydCB7IElDaGF0QXJ0aWZhY3QsIElDaGF0QXJ0aWZhY3RzU2VydmljZSwgSUFydGlmYWN0U291cmNlR3JvdXAsIEFydGlmYWN0U291cmNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rvb2xzL2NoYXRBcnRpZmFjdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0SW1hZ2VDYXJvdXNlbFNlcnZpY2UgfSBmcm9tICcuLi9jaGF0SW1hZ2VDYXJvdXNlbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0RWRpdG9yT3ZlcnJpZGVGb3JDaGF0UmVzb3VyY2UgfSBmcm9tICcuL2NoYXRFZGl0b3JBc3NvY2lhdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhdElucHV0U3RhY2tTbG90LCBzZXRDaGF0SW5wdXRTdGFja1Nsb3QgfSBmcm9tICcuL2lucHV0L2NoYXRJbnB1dFN0YWNrLmpzJztcblxuY29uc3QgQVJUSUZBQ1RfVFlQRV9JQ09OUzogUmVjb3JkPHN0cmluZywgVGhlbWVJY29uPiA9IHtcblx0ZGV2U2VydmVyOiBDb2RpY29uLmdsb2JlLFxuXHRzY3JlZW5zaG90OiBDb2RpY29uLmZpbGUsXG5cdHBsYW46IENvZGljb24uYm9vayxcbn07XG5cbi8qKlxuICogQSBncm91cCBub2RlIGluIHRoZSBhcnRpZmFjdCB0cmVlLiBHcm91cHMgYXJ0aWZhY3RzIGJ5IGBncm91cE5hbWVgLlxuICovXG5pbnRlcmZhY2UgSUFydGlmYWN0R3JvdXBOb2RlIHtcblx0cmVhZG9ubHkga2luZDogJ2dyb3VwJztcblx0cmVhZG9ubHkgZ3JvdXBOYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGFydGlmYWN0czogSUNoYXRBcnRpZmFjdFtdO1xuXHRyZWFkb25seSBvbmx5U2hvd0dyb3VwOiBib29sZWFuO1xuXHRyZWFkb25seSBvbkNsZWFyPzogKCkgPT4gdm9pZDtcbn1cblxuLyoqXG4gKiBBIGxlYWYgYXJ0aWZhY3Qgbm9kZSwgb3B0aW9uYWxseSBhbm5vdGF0ZWQgd2l0aCBzdWJ0ZXh0IChlLmcuIHNvdXJjZS9ncm91cCBuYW1lXG4gKiB3aGVuIHRoZSBhcnRpZmFjdCBpcyB0aGUgc29sZSBpdGVtIG9mIGl0cyBncm91cCwgc2hvd24gYXQgdG9wIGxldmVsKS5cbiAqL1xuaW50ZXJmYWNlIElBcnRpZmFjdExlYWZOb2RlIHtcblx0cmVhZG9ubHkga2luZDogJ2xlYWYnO1xuXHRyZWFkb25seSBhcnRpZmFjdDogSUNoYXRBcnRpZmFjdDtcblx0cmVhZG9ubHkgZGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IG9uQ2xlYXI/OiAoKSA9PiB2b2lkO1xufVxuXG50eXBlIEFydGlmYWN0VHJlZUVsZW1lbnQgPSBJQXJ0aWZhY3RHcm91cE5vZGUgfCBJQXJ0aWZhY3RMZWFmTm9kZTtcblxuZnVuY3Rpb24gaXNHcm91cE5vZGUoZWxlbWVudDogQXJ0aWZhY3RUcmVlRWxlbWVudCk6IGVsZW1lbnQgaXMgSUFydGlmYWN0R3JvdXBOb2RlIHtcblx0cmV0dXJuIGVsZW1lbnQua2luZCA9PT0gJ2dyb3VwJztcbn1cblxuZnVuY3Rpb24gaXNMZWFmTm9kZShlbGVtZW50OiBBcnRpZmFjdFRyZWVFbGVtZW50KTogZWxlbWVudCBpcyBJQXJ0aWZhY3RMZWFmTm9kZSB7XG5cdHJldHVybiBlbGVtZW50LmtpbmQgPT09ICdsZWFmJztcbn1cblxuZXhwb3J0IGNsYXNzIENoYXRBcnRpZmFjdHNXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cmVhZG9ubHkgZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX3Nsb3Q6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF92aXNpYmxlID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvblJlc291cmNlID0gb2JzZXJ2YWJsZVZhbHVlPFVSSSB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0cHJpdmF0ZSByZWFkb25seSBfaXNDb2xsYXBzZWQgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgZmFsc2UpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2N1cnJlbnRBcnRpZmFjdHMgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0Y29uc3Qgc3IgPSB0aGlzLl9zZXNzaW9uUmVzb3VyY2UucmVhZChyZWFkZXIpO1xuXHRcdHJldHVybiBzciA/IHRoaXMuX2NoYXRBcnRpZmFjdHNTZXJ2aWNlLmdldEFydGlmYWN0cyhzcikgOiB1bmRlZmluZWQ7XG5cdH0pO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RyZWVEYXRhID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IGFydGlmYWN0cyA9IHRoaXMuX2N1cnJlbnRBcnRpZmFjdHMucmVhZChyZWFkZXIpO1xuXHRcdGlmICghYXJ0aWZhY3RzKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBncm91cHMgPSBhcnRpZmFjdHMuYXJ0aWZhY3RHcm91cHMucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IHRvdGFsQ291bnQgPSBncm91cHMucmVkdWNlKChzdW0sIGcpID0+IHN1bSArIGcuYXJ0aWZhY3RzLmxlbmd0aCwgMCk7XG5cdFx0aWYgKHRvdGFsQ291bnQgPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IG11bHRpU291cmNlID0gZ3JvdXBzLmxlbmd0aCA+IDE7XG5cdFx0Y29uc3QgdHJlZUVsZW1lbnRzID0gYnVpbGRUcmVlRWxlbWVudHNGcm9tR3JvdXBzKGdyb3VwcywgbXVsdGlTb3VyY2UsIHNvdXJjZSA9PiB0aGlzLl9jbGVhclNvdXJjZShzb3VyY2UpKTtcblx0XHRjb25zdCB2aXNpYmxlQ291bnQgPSBjb3VudFZpc2libGVSb3dzKHRyZWVFbGVtZW50cyk7XG5cdFx0Y29uc3QgaXRlbXNTaG93biA9IE1hdGgubWluKHZpc2libGVDb3VudCwgQ2hhdEFydGlmYWN0c1dpZGdldC5NQVhfSVRFTVNfU0hPV04pO1xuXHRcdHJldHVybiB7XG5cdFx0XHR0b3RhbENvdW50LFxuXHRcdFx0dHJlZUVsZW1lbnRzLFxuXHRcdFx0dHJlZUhlaWdodDogaXRlbXNTaG93biAqIENoYXRBcnRpZmFjdHNXaWRnZXQuRUxFTUVOVF9IRUlHSFQsXG5cdFx0fTtcblx0fSk7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBFTEVNRU5UX0hFSUdIVCA9IDIyO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBNQVhfSVRFTVNfU0hPV04gPSA2O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ2hhdEFydGlmYWN0c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdEFydGlmYWN0c1NlcnZpY2U6IElDaGF0QXJ0aWZhY3RzU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX29wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJRmlsZURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZURpYWxvZ1NlcnZpY2U6IElGaWxlRGlhbG9nU2VydmljZSxcblx0XHRASUNoYXRJbWFnZUNhcm91c2VsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0SW1hZ2VDYXJvdXNlbFNlcnZpY2U6IElDaGF0SW1hZ2VDYXJvdXNlbFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5kb21Ob2RlID0gZG9tLiQoJy5jaGF0LWFydGlmYWN0cy13aWRnZXQnKTtcblx0XHR0aGlzLmRvbU5vZGUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGFydGlmYWN0cyA9IHRoaXMuX2N1cnJlbnRBcnRpZmFjdHMucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRkb20uY2xlYXJOb2RlKHRoaXMuZG9tTm9kZSk7XG5cblx0XHRcdGlmICghYXJ0aWZhY3RzKSB7XG5cdFx0XHRcdHRoaXMuX3NldFZpc2libGUoZmFsc2UpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHN0b3JlID0gcmVhZGVyLnN0b3JlO1xuXG5cdFx0XHRjb25zdCBleHBhbmRvQ29udGFpbmVyID0gZG9tLiQoJy5jaGF0LWFydGlmYWN0cy1leHBhbmQnKTtcblx0XHRcdGNvbnN0IGhlYWRlckJ1dHRvbiA9IHN0b3JlLmFkZChuZXcgQnV0dG9uKGV4cGFuZG9Db250YWluZXIsIHsgc3VwcG9ydEljb25zOiB0cnVlIH0pKTtcblxuXHRcdFx0Y29uc3QgdGl0bGVTZWN0aW9uID0gZG9tLiQoJy5jaGF0LWFydGlmYWN0cy10aXRsZS1zZWN0aW9uJyk7XG5cdFx0XHRjb25zdCBleHBhbmRJY29uID0gZG9tLiQoJy5leHBhbmQtaWNvbi5jb2RpY29uJyk7XG5cdFx0XHRleHBhbmRJY29uLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdFx0Y29uc3QgdGl0bGVFbGVtZW50ID0gZG9tLiQoJy5jaGF0LWFydGlmYWN0cy10aXRsZScpO1xuXG5cdFx0XHR0aXRsZVNlY3Rpb24uYXBwZW5kQ2hpbGQoZXhwYW5kSWNvbik7XG5cdFx0XHR0aXRsZVNlY3Rpb24uYXBwZW5kQ2hpbGQodGl0bGVFbGVtZW50KTtcblx0XHRcdGhlYWRlckJ1dHRvbi5lbGVtZW50LmFwcGVuZENoaWxkKHRpdGxlU2VjdGlvbik7XG5cblx0XHRcdHRoaXMuZG9tTm9kZS5hcHBlbmRDaGlsZChleHBhbmRvQ29udGFpbmVyKTtcblxuXHRcdFx0Y29uc3QgbGlzdENvbnRhaW5lciA9IGRvbS4kKCcuY2hhdC1hcnRpZmFjdHMtbGlzdCcpO1xuXHRcdFx0dGhpcy5kb21Ob2RlLmFwcGVuZENoaWxkKGxpc3RDb250YWluZXIpO1xuXG5cdFx0XHRjb25zdCB0cmVlID0gc3RvcmUuYWRkKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRXb3JrYmVuY2hPYmplY3RUcmVlPEFydGlmYWN0VHJlZUVsZW1lbnQ+LFxuXHRcdFx0XHQnQ2hhdEFydGlmYWN0c1RyZWUnLFxuXHRcdFx0XHRsaXN0Q29udGFpbmVyLFxuXHRcdFx0XHRuZXcgQ2hhdEFydGlmYWN0c1RyZWVEZWxlZ2F0ZSgpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0bmV3IENoYXRBcnRpZmFjdEdyb3VwUmVuZGVyZXIoKSxcblx0XHRcdFx0XHRuZXcgQ2hhdEFydGlmYWN0TGVhZlJlbmRlcmVyKGFydGlmYWN0ID0+IHRoaXMuX3NhdmVBcnRpZmFjdChhcnRpZmFjdCkpLFxuXHRcdFx0XHRdLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0YWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw6IGZhbHNlLFxuXHRcdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjogbmV3IENoYXRBcnRpZmFjdHNBY2Nlc3NpYmlsaXR5UHJvdmlkZXIoKSxcblx0XHRcdFx0fSxcblx0XHRcdCkpO1xuXG5cdFx0XHRzdG9yZS5hZGQodHJlZS5vbkRpZE9wZW4oZSA9PiB7XG5cdFx0XHRcdGlmICghZS5lbGVtZW50KSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChpc0dyb3VwTm9kZShlLmVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0aWYgKGUuZWxlbWVudC5vbmx5U2hvd0dyb3VwKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9vcGVuR3JvdXBJbkNhcm91c2VsKGUuZWxlbWVudCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKGlzTGVhZk5vZGUoZS5lbGVtZW50KSkge1xuXHRcdFx0XHRcdHRoaXMuX29wZW5MZWFmQXJ0aWZhY3QoZS5lbGVtZW50LmFydGlmYWN0KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRzdG9yZS5hZGQoaGVhZGVyQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9pc0NvbGxhcHNlZC5zZXQoIXRoaXMuX2lzQ29sbGFwc2VkLnJlYWQodW5kZWZpbmVkKSwgdW5kZWZpbmVkKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0c3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgY29sbGFwc2VkID0gdGhpcy5faXNDb2xsYXBzZWQucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRleHBhbmRJY29uLmNsYXNzTGlzdC50b2dnbGUoJ2NvZGljb24tY2hldnJvbi1kb3duJywgIWNvbGxhcHNlZCk7XG5cdFx0XHRcdGV4cGFuZEljb24uY2xhc3NMaXN0LnRvZ2dsZSgnY29kaWNvbi1jaGV2cm9uLXJpZ2h0JywgY29sbGFwc2VkKTtcblx0XHRcdFx0aGVhZGVyQnV0dG9uLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgU3RyaW5nKCFjb2xsYXBzZWQpKTtcblx0XHRcdFx0bGlzdENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gY29sbGFwc2VkID8gJ25vbmUnIDogJ2Jsb2NrJztcblx0XHRcdH0pKTtcblxuXHRcdFx0c3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgZGF0YSA9IHRoaXMuX3RyZWVEYXRhLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRcdFx0dGhpcy5fc2V0VmlzaWJsZShmYWxzZSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3NldFZpc2libGUodHJ1ZSk7XG5cblx0XHRcdFx0dGl0bGVFbGVtZW50LnRleHRDb250ZW50ID0gZGF0YS50b3RhbENvdW50ID09PSAxXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5hcnRpZmFjdHMub25lJywgXCIxIEFydGlmYWN0XCIpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC5hcnRpZmFjdHMuY291bnQnLCBcInswfSBBcnRpZmFjdHNcIiwgZGF0YS50b3RhbENvdW50KTtcblxuXHRcdFx0XHR0cmVlLmxheW91dChkYXRhLnRyZWVIZWlnaHQpO1xuXHRcdFx0XHR0cmVlLmdldEhUTUxFbGVtZW50KCkuc3R5bGUuaGVpZ2h0ID0gYCR7ZGF0YS50cmVlSGVpZ2h0fXB4YDtcblx0XHRcdFx0dHJlZS5zZXRDaGlsZHJlbihudWxsLCBkYXRhLnRyZWVFbGVtZW50cyk7XG5cdFx0XHR9KSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0c2V0U2Vzc2lvblJlc291cmNlKHNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fc2Vzc2lvblJlc291cmNlLnNldChzZXNzaW9uUmVzb3VyY2UsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHQvKiogQWRkIHRoZSBsaXN0IHRvIGl0cyBzbG90IGluIHRoZSBjaGF0IGlucHV0IHN0YWNrLiAqL1xuXHRhdHRhY2hUbyhzbG90OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX3Nsb3QgPSBzbG90O1xuXHRcdHNsb3QuYXBwZW5kQ2hpbGQodGhpcy5kb21Ob2RlKTtcblx0XHRzZXRDaGF0SW5wdXRTdGFja1Nsb3Qoc2xvdCwgdGhpcy5fdmlzaWJsZSA/IENoYXRJbnB1dFN0YWNrU2xvdC5Eb2NrZWQgOiBDaGF0SW5wdXRTdGFja1Nsb3QuRW1wdHkpO1xuXHR9XG5cblx0LyoqIFNob3cgb3IgaGlkZSB0aGUgbGlzdCwgYW5kIHJlcG9ydCB0aGUgc2FtZSB0byB0aGUgc3RhY2suICovXG5cdHByaXZhdGUgX3NldFZpc2libGUodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3Zpc2libGUgPSB2aXNpYmxlO1xuXHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5kaXNwbGF5ID0gdmlzaWJsZSA/ICcnIDogJ25vbmUnO1xuXHRcdHNldENoYXRJbnB1dFN0YWNrU2xvdCh0aGlzLl9zbG90LCB2aXNpYmxlID8gQ2hhdElucHV0U3RhY2tTbG90LkRvY2tlZCA6IENoYXRJbnB1dFN0YWNrU2xvdC5FbXB0eSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9vcGVuR3JvdXBJbkNhcm91c2VsKGdyb3VwOiBJQXJ0aWZhY3RHcm91cE5vZGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBPcGVuIHRoZSBmaXJzdCBhcnRpZmFjdCBpbiB0aGUgZ3JvdXAgXHUyMDE0IHRoZSBjYXJvdXNlbCBzZXJ2aWNlIHdpbGwgY29sbGVjdFxuXHRcdC8vIGFsbCBpbWFnZXMgZnJvbSB0aGUgY2hhdCB3aWRnZXQgc2Vzc2lvbiBhdXRvbWF0aWNhbGx5LlxuXHRcdGNvbnN0IGZpcnN0ID0gZ3JvdXAuYXJ0aWZhY3RzWzBdO1xuXHRcdGlmIChmaXJzdD8udXJpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9jaGF0SW1hZ2VDYXJvdXNlbFNlcnZpY2Uub3BlbkNhcm91c2VsQXRSZXNvdXJjZShVUkkucGFyc2UoZmlyc3QudXJpKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfb3BlbkxlYWZBcnRpZmFjdChhcnRpZmFjdDogSUNoYXRBcnRpZmFjdCk6IHZvaWQge1xuXHRcdGlmIChhcnRpZmFjdC50eXBlID09PSAnc2NyZWVuc2hvdCcgJiYgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uSW1hZ2VDYXJvdXNlbEVuYWJsZWQpKSB7XG5cdFx0XHR0aGlzLl9vcGVuU2NyZWVuc2hvdEluQ2Fyb3VzZWwoYXJ0aWZhY3QpO1xuXHRcdH0gZWxzZSBpZiAoYXJ0aWZhY3QudXJpKSB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoYXJ0aWZhY3QudXJpKTtcblx0XHRcdGlmIChDaGF0TWVtb3J5RmlsZVJlc291cmNlLmlzQ2hhdE1lbW9yeUZpbGVVcmkodXJpKSkge1xuXHRcdFx0XHR0aGlzLl9vcGVuTWVtb3J5RmlsZUFydGlmYWN0KHVyaSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBlZGl0b3JPdmVycmlkZSA9IGdldEVkaXRvck92ZXJyaWRlRm9yQ2hhdFJlc291cmNlKHVyaSwgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHR0aGlzLl9vcGVuZXJTZXJ2aWNlLm9wZW4odXJpLCB7XG5cdFx0XHRcdFx0ZnJvbVVzZXJHZXN0dXJlOiB0cnVlLFxuXHRcdFx0XHRcdGVkaXRvck9wdGlvbnM6IHsgb3ZlcnJpZGU6IGVkaXRvck92ZXJyaWRlIH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX29wZW5TY3JlZW5zaG90SW5DYXJvdXNlbChjbGlja2VkOiBJQ2hhdEFydGlmYWN0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGNsaWNrZWQudXJpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9jaGF0SW1hZ2VDYXJvdXNlbFNlcnZpY2Uub3BlbkNhcm91c2VsQXRSZXNvdXJjZShVUkkucGFyc2UoY2xpY2tlZC51cmkpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9vcGVuTWVtb3J5RmlsZUFydGlmYWN0KHVyaTogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgeyBtZW1vcnlQYXRoLCBzZXNzaW9uUmVzb3VyY2UgfSA9IENoYXRNZW1vcnlGaWxlUmVzb3VyY2UucGFyc2UodXJpKTtcblx0XHRjb25zdCByZXNvbHZlZFVyaVN0cjogc3RyaW5nIHwgdW5kZWZpbmVkID0gYXdhaXQgdGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoXG5cdFx0XHQnZ2l0aHViLmNvcGlsb3QuY2hhdC50b29scy5tZW1vcnkucmVzb2x2ZU1lbW9yeUZpbGVVcmknLFxuXHRcdFx0bWVtb3J5UGF0aCxcblx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHQpO1xuXHRcdGlmIChyZXNvbHZlZFVyaVN0cikge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRVcmkgPSBVUkkucGFyc2UocmVzb2x2ZWRVcmlTdHIpO1xuXHRcdFx0Y29uc3QgZWRpdG9yT3ZlcnJpZGUgPSBnZXRFZGl0b3JPdmVycmlkZUZvckNoYXRSZXNvdXJjZShyZXNvbHZlZFVyaSwgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0dGhpcy5fb3BlbmVyU2VydmljZS5vcGVuKHJlc29sdmVkVXJpLCB7XG5cdFx0XHRcdGZyb21Vc2VyR2VzdHVyZTogdHJ1ZSxcblx0XHRcdFx0ZWRpdG9yT3B0aW9uczogeyBvdmVycmlkZTogZWRpdG9yT3ZlcnJpZGUgfSxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NsZWFyU291cmNlKHNvdXJjZTogQXJ0aWZhY3RTb3VyY2UpOiB2b2lkIHtcblx0XHRjb25zdCBhcnRpZmFjdHMgPSB0aGlzLl9jdXJyZW50QXJ0aWZhY3RzLmdldCgpO1xuXHRcdGlmICghYXJ0aWZhY3RzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHN3aXRjaCAoc291cmNlLmtpbmQpIHtcblx0XHRcdGNhc2UgJ2FnZW50Jzpcblx0XHRcdFx0YXJ0aWZhY3RzLmNsZWFyQWdlbnRBcnRpZmFjdHMoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdzdWJhZ2VudCc6XG5cdFx0XHRcdGFydGlmYWN0cy5jbGVhclN1YmFnZW50QXJ0aWZhY3RzKHNvdXJjZS5pbnZvY2F0aW9uSWQpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zYXZlQXJ0aWZhY3QoYXJ0aWZhY3Q6IElDaGF0QXJ0aWZhY3QpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzb3VyY2VVcmkgPSBVUkkucGFyc2UoYXJ0aWZhY3QudXJpKTtcblx0XHRjb25zdCBkZWZhdWx0RmlsZU5hbWUgPSBzb3VyY2VVcmkucGF0aC5zcGxpdCgnLycpLnBvcCgpID8/IGFydGlmYWN0LmxhYmVsO1xuXHRcdGNvbnN0IGRlZmF1bHRQYXRoID0gYXdhaXQgdGhpcy5fZmlsZURpYWxvZ1NlcnZpY2UuZGVmYXVsdEZpbGVQYXRoKCk7XG5cdFx0Y29uc3QgZGVmYXVsdFVyaSA9IFVSSS5qb2luUGF0aChkZWZhdWx0UGF0aCwgZGVmYXVsdEZpbGVOYW1lKTtcblxuXHRcdGNvbnN0IHRhcmdldFVyaSA9IGF3YWl0IHRoaXMuX2ZpbGVEaWFsb2dTZXJ2aWNlLnNob3dTYXZlRGlhbG9nKHtcblx0XHRcdGRlZmF1bHRVcmksXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NoYXQuYXJ0aWZhY3RzLnNhdmVEaWFsb2cudGl0bGUnLCBcIlNhdmUgQXJ0aWZhY3RcIiksXG5cdFx0fSk7XG5cblx0XHRpZiAodGFyZ2V0VXJpKSB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUoc291cmNlVXJpKTtcblx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLndyaXRlRmlsZSh0YXJnZXRVcmksIGNvbnRlbnQudmFsdWUpO1xuXHRcdH1cblx0fVxufVxuXG4vLyAtLS0gVHJlZSBpbmZyYXN0cnVjdHVyZSAtLS1cblxuZnVuY3Rpb24gc291cmNlRGlzcGxheU5hbWUoc291cmNlOiBBcnRpZmFjdFNvdXJjZSk6IHN0cmluZyB7XG5cdHN3aXRjaCAoc291cmNlLmtpbmQpIHtcblx0XHRjYXNlICdydWxlcyc6IHJldHVybiBsb2NhbGl6ZSgnY2hhdC5hcnRpZmFjdHMuc291cmNlLnJ1bGVzJywgXCJSdWxlc1wiKTtcblx0XHRjYXNlICdhZ2VudCc6IHJldHVybiBsb2NhbGl6ZSgnY2hhdC5hcnRpZmFjdHMuc291cmNlLmFnZW50JywgXCJBZ2VudFwiKTtcblx0XHRjYXNlICdzdWJhZ2VudCc6IHJldHVybiBzb3VyY2UubmFtZSA/PyBsb2NhbGl6ZSgnY2hhdC5hcnRpZmFjdHMuc291cmNlLnN1YmFnZW50JywgXCJTdWJhZ2VudFwiKTtcblx0fVxufVxuXG5mdW5jdGlvbiBidWlsZFRyZWVFbGVtZW50c0Zyb21Hcm91cHMoc291cmNlR3JvdXBzOiByZWFkb25seSBJQXJ0aWZhY3RTb3VyY2VHcm91cFtdLCBtdWx0aVNvdXJjZTogYm9vbGVhbiwgb25DbGVhclNvdXJjZTogKHNvdXJjZTogQXJ0aWZhY3RTb3VyY2UpID0+IHZvaWQpOiBJT2JqZWN0VHJlZUVsZW1lbnQ8QXJ0aWZhY3RUcmVlRWxlbWVudD5bXSB7XG5cdGNvbnN0IGVsZW1lbnRzOiBJT2JqZWN0VHJlZUVsZW1lbnQ8QXJ0aWZhY3RUcmVlRWxlbWVudD5bXSA9IFtdO1xuXG5cdGZvciAoY29uc3Qgc291cmNlR3JvdXAgb2Ygc291cmNlR3JvdXBzKSB7XG5cdFx0Y29uc3QgcHJlZml4ID0gbXVsdGlTb3VyY2UgPyBzb3VyY2VEaXNwbGF5TmFtZShzb3VyY2VHcm91cC5zb3VyY2UpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGNsZWFyYWJsZSA9IHNvdXJjZUdyb3VwLnNvdXJjZS5raW5kICE9PSAncnVsZXMnO1xuXHRcdGNvbnN0IG9uQ2xlYXIgPSBjbGVhcmFibGUgPyAoKSA9PiBvbkNsZWFyU291cmNlKHNvdXJjZUdyb3VwLnNvdXJjZSkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZ3JvdXBzID0gbmV3IE1hcDxzdHJpbmcsIHsgY29uZmlnOiB7IGdyb3VwTmFtZTogc3RyaW5nOyBvbmx5U2hvd0dyb3VwOiBib29sZWFuIH07IGFydGlmYWN0czogSUNoYXRBcnRpZmFjdFtdIH0+KCk7XG5cdFx0Y29uc3QgdW5ncm91cGVkOiBJQ2hhdEFydGlmYWN0W10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgYXJ0aWZhY3Qgb2Ygc291cmNlR3JvdXAuYXJ0aWZhY3RzKSB7XG5cdFx0XHRpZiAoYXJ0aWZhY3QuZ3JvdXBOYW1lKSB7XG5cdFx0XHRcdGxldCBncm91cCA9IGdyb3Vwcy5nZXQoYXJ0aWZhY3QuZ3JvdXBOYW1lKTtcblx0XHRcdFx0aWYgKCFncm91cCkge1xuXHRcdFx0XHRcdGdyb3VwID0geyBjb25maWc6IHsgZ3JvdXBOYW1lOiBhcnRpZmFjdC5ncm91cE5hbWUsIG9ubHlTaG93R3JvdXA6IGFydGlmYWN0Lm9ubHlTaG93R3JvdXAgPz8gZmFsc2UgfSwgYXJ0aWZhY3RzOiBbXSB9O1xuXHRcdFx0XHRcdGdyb3Vwcy5zZXQoYXJ0aWZhY3QuZ3JvdXBOYW1lLCBncm91cCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Z3JvdXAuYXJ0aWZhY3RzLnB1c2goYXJ0aWZhY3QpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dW5ncm91cGVkLnB1c2goYXJ0aWZhY3QpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgWywgZ3JvdXBdIG9mIGdyb3Vwcykge1xuXHRcdFx0Y29uc3QgZGlzcGxheU5hbWUgPSBwcmVmaXggPyBgJHtwcmVmaXh9OiAke2dyb3VwLmNvbmZpZy5ncm91cE5hbWV9YCA6IGdyb3VwLmNvbmZpZy5ncm91cE5hbWU7XG5cblx0XHRcdC8vIFNpbmdsZS1hcnRpZmFjdCBncm91cDogcHJvbW90ZSB0byB0b3AtbGV2ZWwgbGVhZiB3aXRoIGRlc2NyaXB0aW9uXG5cdFx0XHRpZiAoZ3JvdXAuYXJ0aWZhY3RzLmxlbmd0aCA9PT0gMSAmJiAhZ3JvdXAuY29uZmlnLm9ubHlTaG93R3JvdXApIHtcblx0XHRcdFx0ZWxlbWVudHMucHVzaCh7IGVsZW1lbnQ6IHsga2luZDogJ2xlYWYnLCBhcnRpZmFjdDogZ3JvdXAuYXJ0aWZhY3RzWzBdLCBkZXNjcmlwdGlvbjogZGlzcGxheU5hbWUsIG9uQ2xlYXIgfSB9KTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGdyb3VwTm9kZTogSUFydGlmYWN0R3JvdXBOb2RlID0ge1xuXHRcdFx0XHRraW5kOiAnZ3JvdXAnLFxuXHRcdFx0XHRncm91cE5hbWU6IGRpc3BsYXlOYW1lLFxuXHRcdFx0XHRhcnRpZmFjdHM6IGdyb3VwLmFydGlmYWN0cyxcblx0XHRcdFx0b25seVNob3dHcm91cDogZ3JvdXAuY29uZmlnLm9ubHlTaG93R3JvdXAsXG5cdFx0XHRcdG9uQ2xlYXIsXG5cdFx0XHR9O1xuXG5cdFx0XHRpZiAoZ3JvdXAuY29uZmlnLm9ubHlTaG93R3JvdXApIHtcblx0XHRcdFx0ZWxlbWVudHMucHVzaCh7IGVsZW1lbnQ6IGdyb3VwTm9kZSwgY29sbGFwc2libGU6IGZhbHNlLCBjb2xsYXBzZWQ6IGZhbHNlIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZWxlbWVudHMucHVzaCh7XG5cdFx0XHRcdFx0ZWxlbWVudDogZ3JvdXBOb2RlLFxuXHRcdFx0XHRcdGNvbGxhcHNpYmxlOiB0cnVlLFxuXHRcdFx0XHRcdGNvbGxhcHNlZDogZmFsc2UsXG5cdFx0XHRcdFx0Y2hpbGRyZW46IGdyb3VwLmFydGlmYWN0cy5tYXAoKGEpOiBJT2JqZWN0VHJlZUVsZW1lbnQ8QXJ0aWZhY3RUcmVlRWxlbWVudD4gPT4gKHsgZWxlbWVudDogeyBraW5kOiAnbGVhZicsIGFydGlmYWN0OiBhIH0gfSkpLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodW5ncm91cGVkLmxlbmd0aCA+IDAgJiYgcHJlZml4KSB7XG5cdFx0XHQvLyBTaW5nbGUgdW5ncm91cGVkIGFydGlmYWN0IGZyb20gYSBzb3VyY2U6IHNob3cgYXMgbGVhZiB3aXRoIHNvdXJjZSBuYW1lXG5cdFx0XHRpZiAodW5ncm91cGVkLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRlbGVtZW50cy5wdXNoKHsgZWxlbWVudDogeyBraW5kOiAnbGVhZicsIGFydGlmYWN0OiB1bmdyb3VwZWRbMF0sIGRlc2NyaXB0aW9uOiBwcmVmaXgsIG9uQ2xlYXIgfSB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGdyb3VwTm9kZTogSUFydGlmYWN0R3JvdXBOb2RlID0ge1xuXHRcdFx0XHRcdGtpbmQ6ICdncm91cCcsXG5cdFx0XHRcdFx0Z3JvdXBOYW1lOiBwcmVmaXgsXG5cdFx0XHRcdFx0YXJ0aWZhY3RzOiB1bmdyb3VwZWQsXG5cdFx0XHRcdFx0b25seVNob3dHcm91cDogZmFsc2UsXG5cdFx0XHRcdFx0b25DbGVhcixcblx0XHRcdFx0fTtcblx0XHRcdFx0ZWxlbWVudHMucHVzaCh7XG5cdFx0XHRcdFx0ZWxlbWVudDogZ3JvdXBOb2RlLFxuXHRcdFx0XHRcdGNvbGxhcHNpYmxlOiB0cnVlLFxuXHRcdFx0XHRcdGNvbGxhcHNlZDogZmFsc2UsXG5cdFx0XHRcdFx0Y2hpbGRyZW46IHVuZ3JvdXBlZC5tYXAoKGEpOiBJT2JqZWN0VHJlZUVsZW1lbnQ8QXJ0aWZhY3RUcmVlRWxlbWVudD4gPT4gKHsgZWxlbWVudDogeyBraW5kOiAnbGVhZicsIGFydGlmYWN0OiBhIH0gfSkpLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Zm9yIChjb25zdCBhcnRpZmFjdCBvZiB1bmdyb3VwZWQpIHtcblx0XHRcdFx0ZWxlbWVudHMucHVzaCh7IGVsZW1lbnQ6IHsga2luZDogJ2xlYWYnLCBhcnRpZmFjdCwgb25DbGVhciB9IH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJldHVybiBlbGVtZW50cztcbn1cblxuZnVuY3Rpb24gY291bnRWaXNpYmxlUm93cyhlbGVtZW50czogSU9iamVjdFRyZWVFbGVtZW50PEFydGlmYWN0VHJlZUVsZW1lbnQ+W10pOiBudW1iZXIge1xuXHRsZXQgY291bnQgPSAwO1xuXHRmb3IgKGNvbnN0IGVsIG9mIGVsZW1lbnRzKSB7XG5cdFx0Y291bnQrKzsgLy8gVGhlIGVsZW1lbnQgaXRzZWxmXG5cdFx0aWYgKGVsLmNoaWxkcmVuICYmICFlbC5jb2xsYXBzZWQpIHtcblx0XHRcdGNvdW50ICs9IGNvdW50VmlzaWJsZVJvd3MoWy4uLmVsLmNoaWxkcmVuXSk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBjb3VudDtcbn1cblxuY2xhc3MgQ2hhdEFydGlmYWN0c1RyZWVEZWxlZ2F0ZSBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPEFydGlmYWN0VHJlZUVsZW1lbnQ+IHtcblx0Z2V0SGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIENoYXRBcnRpZmFjdHNXaWRnZXQuRUxFTUVOVF9IRUlHSFQ7XG5cdH1cblx0Z2V0VGVtcGxhdGVJZChlbGVtZW50OiBBcnRpZmFjdFRyZWVFbGVtZW50KTogc3RyaW5nIHtcblx0XHRyZXR1cm4gaXNHcm91cE5vZGUoZWxlbWVudClcblx0XHRcdD8gQ2hhdEFydGlmYWN0R3JvdXBSZW5kZXJlci5URU1QTEFURV9JRFxuXHRcdFx0OiBDaGF0QXJ0aWZhY3RMZWFmUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cdH1cbn1cblxuY2xhc3MgQ2hhdEFydGlmYWN0c0FjY2Vzc2liaWxpdHlQcm92aWRlciBpbXBsZW1lbnRzIElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyPEFydGlmYWN0VHJlZUVsZW1lbnQ+IHtcblx0Z2V0QXJpYUxhYmVsKGVsZW1lbnQ6IEFydGlmYWN0VHJlZUVsZW1lbnQpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRpZiAoaXNHcm91cE5vZGUoZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2hhdC5hcnRpZmFjdHMuZ3JvdXAuYXJpYScsIFwiezB9ICh7MX0gaXRlbXMpXCIsIGVsZW1lbnQuZ3JvdXBOYW1lLCBlbGVtZW50LmFydGlmYWN0cy5sZW5ndGgpO1xuXHRcdH1cblx0XHRyZXR1cm4gZWxlbWVudC5hcnRpZmFjdC5sYWJlbDtcblx0fVxuXHRnZXRXaWRnZXRBcmlhTGFiZWwoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ2NoYXQuYXJ0aWZhY3RzLndpZGdldC5hcmlhJywgXCJDaGF0IEFydGlmYWN0c1wiKTtcblx0fVxufVxuXG4vLyAtLS0gR3JvdXAgcmVuZGVyZXIgLS0tXG5cbmludGVyZmFjZSBJQXJ0aWZhY3RHcm91cFRlbXBsYXRlIHtcblx0cmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgaWNvbkVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBsYWJlbEVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBhY3Rpb25CYXI6IEFjdGlvbkJhcjtcblx0cmVhZG9ubHkgZWxlbWVudERpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbmNsYXNzIENoYXRBcnRpZmFjdEdyb3VwUmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPEFydGlmYWN0VHJlZUVsZW1lbnQsIHZvaWQsIElBcnRpZmFjdEdyb3VwVGVtcGxhdGU+IHtcblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ2NoYXRBcnRpZmFjdEdyb3VwUmVuZGVyZXInO1xuXHRyZWFkb25seSB0ZW1wbGF0ZUlkID0gQ2hhdEFydGlmYWN0R3JvdXBSZW5kZXJlci5URU1QTEFURV9JRDtcblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUFydGlmYWN0R3JvdXBUZW1wbGF0ZSB7XG5cdFx0Y29uc3Qgcm93ID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcuY2hhdC1hcnRpZmFjdHMtbGlzdC1yb3cnKSk7XG5cdFx0Y29uc3QgaWNvbkVsZW1lbnQgPSBkb20uYXBwZW5kKHJvdywgZG9tLiQoJy5jaGF0LWFydGlmYWN0cy1saXN0LWljb24nKSk7XG5cdFx0Y29uc3QgbGFiZWxFbGVtZW50ID0gZG9tLmFwcGVuZChyb3csIGRvbS4kKCcuY2hhdC1hcnRpZmFjdHMtbGlzdC1sYWJlbCcpKTtcblx0XHRjb25zdCBhY3Rpb25zQ29udGFpbmVyID0gZG9tLmFwcGVuZChyb3csIGRvbS4kKCcuY2hhdC1hcnRpZmFjdHMtbGlzdC1hY3Rpb25zJykpO1xuXHRcdGNvbnN0IGVsZW1lbnREaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBhY3Rpb25CYXIgPSBuZXcgQWN0aW9uQmFyKGFjdGlvbnNDb250YWluZXIpO1xuXHRcdHJldHVybiB7IGNvbnRhaW5lcjogcm93LCBpY29uRWxlbWVudCwgbGFiZWxFbGVtZW50LCBhY3Rpb25CYXIsIGVsZW1lbnREaXNwb3NhYmxlcyB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8QXJ0aWZhY3RUcmVlRWxlbWVudD4sIF9pbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElBcnRpZmFjdEdyb3VwVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRjb25zdCBncm91cCA9IG5vZGUuZWxlbWVudDtcblx0XHRpZiAoIWlzR3JvdXBOb2RlKGdyb3VwKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdGNvbnN0IGZpcnN0VHlwZSA9IGdyb3VwLmFydGlmYWN0c1swXT8udHlwZTtcblx0XHRjb25zdCBpY29uID0gKGZpcnN0VHlwZSAmJiBBUlRJRkFDVF9UWVBFX0lDT05TW2ZpcnN0VHlwZV0pIHx8IENvZGljb24uYXJjaGl2ZTtcblx0XHR0ZW1wbGF0ZURhdGEuaWNvbkVsZW1lbnQuY2xhc3NOYW1lID0gJ2NoYXQtYXJ0aWZhY3RzLWxpc3QtaWNvbiAnICsgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGljb24pO1xuXHRcdHRlbXBsYXRlRGF0YS5sYWJlbEVsZW1lbnQudGV4dENvbnRlbnQgPSBgJHtncm91cC5ncm91cE5hbWV9ICgke2dyb3VwLmFydGlmYWN0cy5sZW5ndGh9KWA7XG5cdFx0dGVtcGxhdGVEYXRhLmNvbnRhaW5lci50aXRsZSA9IGdyb3VwLmdyb3VwTmFtZTtcblxuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuY2xlYXIoKTtcblx0XHRpZiAoZ3JvdXAub25DbGVhcikge1xuXHRcdFx0Y29uc3QgY2xlYXJGbiA9IGdyb3VwLm9uQ2xlYXI7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLnB1c2godG9BY3Rpb24oe1xuXHRcdFx0XHRpZDogJ2NoYXRBcnRpZmFjdHMuY2xlYXJTb3VyY2UnLFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NoYXQuYXJ0aWZhY3RzLmNsZWFyU291cmNlJywgXCJDbGVhclwiKSxcblx0XHRcdFx0Y2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmNsb3NlU21hbGwpLFxuXHRcdFx0XHRydW46ICgpID0+IGNsZWFyRm4oKSxcblx0XHRcdH0pLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChfZWxlbWVudDogSVRyZWVOb2RlPEFydGlmYWN0VHJlZUVsZW1lbnQ+LCBfaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJQXJ0aWZhY3RHcm91cFRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUFydGlmYWN0R3JvdXBUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbi8vIC0tLSBMZWFmIGFydGlmYWN0IHJlbmRlcmVyIC0tLVxuXG5pbnRlcmZhY2UgSUFydGlmYWN0TGVhZlRlbXBsYXRlIHtcblx0cmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgaWNvbkVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBsYWJlbEVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbkVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBhY3Rpb25CYXI6IEFjdGlvbkJhcjtcblx0cmVhZG9ubHkgZWxlbWVudERpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbmNsYXNzIENoYXRBcnRpZmFjdExlYWZSZW5kZXJlciBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8QXJ0aWZhY3RUcmVlRWxlbWVudCwgdm9pZCwgSUFydGlmYWN0TGVhZlRlbXBsYXRlPiB7XG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdjaGF0QXJ0aWZhY3RMZWFmUmVuZGVyZXInO1xuXHRyZWFkb25seSB0ZW1wbGF0ZUlkID0gQ2hhdEFydGlmYWN0TGVhZlJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgX29uU2F2ZTogKGFydGlmYWN0OiBJQ2hhdEFydGlmYWN0KSA9PiB2b2lkKSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUFydGlmYWN0TGVhZlRlbXBsYXRlIHtcblx0XHRjb25zdCByb3cgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5jaGF0LWFydGlmYWN0cy1saXN0LXJvdycpKTtcblx0XHRjb25zdCBpY29uRWxlbWVudCA9IGRvbS5hcHBlbmQocm93LCBkb20uJCgnLmNoYXQtYXJ0aWZhY3RzLWxpc3QtaWNvbicpKTtcblx0XHRjb25zdCBsYWJlbEVsZW1lbnQgPSBkb20uYXBwZW5kKHJvdywgZG9tLiQoJy5jaGF0LWFydGlmYWN0cy1saXN0LWxhYmVsJykpO1xuXHRcdGNvbnN0IGRlc2NyaXB0aW9uRWxlbWVudCA9IGRvbS5hcHBlbmQocm93LCBkb20uJCgnLmNoYXQtYXJ0aWZhY3RzLWxpc3QtZGVzY3JpcHRpb24nKSk7XG5cdFx0Y29uc3QgYWN0aW9uc0NvbnRhaW5lciA9IGRvbS5hcHBlbmQocm93LCBkb20uJCgnLmNoYXQtYXJ0aWZhY3RzLWxpc3QtYWN0aW9ucycpKTtcblx0XHRjb25zdCBlbGVtZW50RGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgYWN0aW9uQmFyID0gbmV3IEFjdGlvbkJhcihhY3Rpb25zQ29udGFpbmVyKTtcblx0XHRyZXR1cm4geyBjb250YWluZXI6IHJvdywgaWNvbkVsZW1lbnQsIGxhYmVsRWxlbWVudCwgZGVzY3JpcHRpb25FbGVtZW50LCBhY3Rpb25CYXIsIGVsZW1lbnREaXNwb3NhYmxlcyB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8QXJ0aWZhY3RUcmVlRWxlbWVudD4sIF9pbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElBcnRpZmFjdExlYWZUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdGlmICghaXNMZWFmTm9kZShub2RlLmVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0Y29uc3QgeyBhcnRpZmFjdCwgZGVzY3JpcHRpb24sIG9uQ2xlYXIgfSA9IG5vZGUuZWxlbWVudDtcblx0XHRjb25zdCBpY29uID0gKGFydGlmYWN0LnR5cGUgJiYgQVJUSUZBQ1RfVFlQRV9JQ09OU1thcnRpZmFjdC50eXBlXSkgfHwgQ29kaWNvbi5hcmNoaXZlO1xuXHRcdHRlbXBsYXRlRGF0YS5pY29uRWxlbWVudC5jbGFzc05hbWUgPSAnY2hhdC1hcnRpZmFjdHMtbGlzdC1pY29uICcgKyBUaGVtZUljb24uYXNDbGFzc05hbWUoaWNvbik7XG5cdFx0dGVtcGxhdGVEYXRhLmxhYmVsRWxlbWVudC50ZXh0Q29udGVudCA9IGFydGlmYWN0LmxhYmVsO1xuXHRcdHRlbXBsYXRlRGF0YS5kZXNjcmlwdGlvbkVsZW1lbnQudGV4dENvbnRlbnQgPSBkZXNjcmlwdGlvbiA/PyAnJztcblx0XHR0ZW1wbGF0ZURhdGEuZGVzY3JpcHRpb25FbGVtZW50LnN0eWxlLmRpc3BsYXkgPSBkZXNjcmlwdGlvbiA/ICcnIDogJ25vbmUnO1xuXHRcdHRlbXBsYXRlRGF0YS5jb250YWluZXIudGl0bGUgPSBhcnRpZmFjdC51cmk7XG5cblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmNsZWFyKCk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IFtdO1xuXHRcdGlmIChvbkNsZWFyKSB7XG5cdFx0XHRjb25zdCBjbGVhckZuID0gb25DbGVhcjtcblx0XHRcdGFjdGlvbnMucHVzaCh0b0FjdGlvbih7XG5cdFx0XHRcdGlkOiAnY2hhdEFydGlmYWN0cy5jbGVhclNvdXJjZScsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2hhdC5hcnRpZmFjdHMuY2xlYXJTb3VyY2UnLCBcIkNsZWFyXCIpLFxuXHRcdFx0XHRjbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uY2xvc2VTbWFsbCksXG5cdFx0XHRcdHJ1bjogKCkgPT4gY2xlYXJGbigpLFxuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHRhY3Rpb25zLnB1c2godG9BY3Rpb24oe1xuXHRcdFx0aWQ6ICdjaGF0QXJ0aWZhY3RzLnNhdmUnLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjaGF0LmFydGlmYWN0cy5zYXZlJywgXCJTYXZlIGFydGlmYWN0XCIpLFxuXHRcdFx0Y2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnNhdmUpLFxuXHRcdFx0cnVuOiAoKSA9PiB0aGlzLl9vblNhdmUoYXJ0aWZhY3QpLFxuXHRcdH0pKTtcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLnB1c2goYWN0aW9ucywgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChfZWxlbWVudDogSVRyZWVOb2RlPEFydGlmYWN0VHJlZUVsZW1lbnQ+LCBfaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJQXJ0aWZhY3RMZWFmVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJQXJ0aWZhY3RMZWFmVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxjQUFjO0FBR3ZCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsU0FBUyxTQUFTLHVCQUF1QjtBQUNsRCxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFD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
