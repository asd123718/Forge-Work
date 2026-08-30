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
import "../../browser/media/multiFileDiffEditor.css";
import "../../../agentFeedback/browser/media/agentFeedbackEditorInput.css";
import "../../../../../base/browser/ui/codicons/codiconStyles.js";
import { $, Dimension, getWindow } from "../../../../../base/browser/dom.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Event, ValueWithChangeEvent } from "../../../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { constObservable } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { MultiDiffEditorWidget } from "../../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidget.js";
import { IDiffProviderFactoryService } from "../../../../../editor/browser/widget/diffEditor/diffProviderFactoryService.js";
import { RefCounted } from "../../../../../editor/browser/widget/diffEditor/utils.js";
import { TestDiffProviderFactoryService } from "../../../../../editor/test/browser/diff/testDiffProviderFactoryService.js";
import { IMenuService, MenuItemAction } from "../../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { MockContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { ResourceLabel } from "../../../../../workbench/browser/labels.js";
import { IDecorationsService } from "../../../../../workbench/services/decorations/common/decorations.js";
import { IEditorProgressService } from "../../../../../platform/progress/common/progress.js";
import { INotebookDocumentService } from "../../../../../workbench/services/notebook/common/notebookDocumentService.js";
import { ITextFileService } from "../../../../../workbench/services/textfile/common/textfiles.js";
import { createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from "../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js";
import { TestEditorInput } from "../../../../../workbench/test/browser/workbenchTestServices.js";
import { AgentFeedbackEditorInputContribution } from "../../../agentFeedback/browser/agentFeedbackEditorInputContribution.js";
import { AgentFeedbackOverlayController } from "../../../agentFeedback/browser/agentFeedbackEditorOverlay.js";
import { clearAllFeedbackActionId, navigateNextFeedbackActionId, navigatePreviousFeedbackActionId, navigationBearingFakeActionId, submitFeedbackActionId } from "../../../agentFeedback/browser/agentFeedbackEditorActions.js";
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedbackService } from "../../../agentFeedback/browser/agentFeedbackService.js";
import { Menus } from "../../../../browser/menus.js";
const SESSION_RESOURCE = URI.parse("fixture-session://agents-diff");
const MODIFIED_FIRST_RESOURCE = URI.file("/workspace/src/first.ts");
const OVERLAY_RESOURCE = URI.file("/workspace/changes.diff");
const FIXTURE_WIDTH = 860;
const FIXTURE_HEIGHT = 620;
const DETAIL_WIDTH = 280;
const UNCHANGED_LINES = Array.from({ length: 18 }, (_, index) => `const unchanged${index} = ${index};`).join("\n");
let FixtureAgentFeedbackMenuService = class {
  constructor(instantiationService) {
    this.instantiationService = instantiationService;
  }
  createMenu(id) {
    if (id !== Menus.AgentFeedbackEditorContent) {
      return {
        onDidChange: Event.None,
        dispose: () => {
        },
        getActions: () => []
      };
    }
    const createAction = (actionId, title, icon) => this.instantiationService.createInstance(
      MenuItemAction,
      { id: actionId, title, icon },
      void 0,
      { renderShortTitle: true },
      void 0,
      void 0
    );
    const navigateActions = [
      createAction(navigationBearingFakeActionId, "Navigation Status", Codicon.commentDiscussion),
      createAction(navigatePreviousFeedbackActionId, "Previous", Codicon.arrowUp),
      createAction(navigateNextFeedbackActionId, "Next", Codicon.arrowDown)
    ];
    const submitActions = [
      createAction(submitFeedbackActionId, "Submit", Codicon.send),
      createAction(clearAllFeedbackActionId, "Clear", Codicon.clearAll)
    ];
    return {
      onDidChange: Event.None,
      dispose: () => {
      },
      getActions: () => [
        ["navigate", navigateActions],
        ["a_submit", submitActions]
      ]
    };
  }
  getMenuActions(_id, _contextKeyService, _options) {
    return [];
  }
  getMenuContexts() {
    return /* @__PURE__ */ new Set();
  }
  resetHiddenStates() {
  }
};
FixtureAgentFeedbackMenuService = __decorateClass([
  __decorateParam(0, IInstantiationService)
], FixtureAgentFeedbackMenuService);
let AgentsDiffUIElementFactory = class {
  constructor(instantiationService) {
    this.instantiationService = instantiationService;
  }
  createResourceLabel(element) {
    const label = this.instantiationService.createInstance(ResourceLabel, element, {});
    return {
      setUri(uri, options = {}) {
        if (!uri) {
          label.element.clear();
        } else {
          label.element.setFile(uri, { strikethrough: options.strikethrough });
        }
      },
      dispose: () => label.dispose()
    };
  }
};
AgentsDiffUIElementFactory = __decorateClass([
  __decorateParam(0, IInstantiationService)
], AgentsDiffUIElementFactory);
function createFixtureSession() {
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.resource = SESSION_RESOURCE;
      this.changes = constObservable([]);
    }
  }();
}
function createAgentFeedbackService(feedback = [], feedbackScopeResource = MODIFIED_FIRST_RESOURCE) {
  const session = createFixtureSession();
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeFeedback = Event.None;
      this.onDidChangeNavigation = Event.None;
      this.onDidChangeFeedbackScope = Event.None;
    }
    getSessionForFile(resource) {
      return resource.toString() === MODIFIED_FIRST_RESOURCE.toString() ? session : void 0;
    }
    getFeedbackSessionResource(resource) {
      return resource.toString() === feedbackScopeResource.toString() ? SESSION_RESOURCE : void 0;
    }
    getFeedback() {
      return feedback;
    }
    getNavigationBearing() {
      return { activeIdx: feedback.length > 0 ? 0 : -1, totalCount: feedback.length };
    }
  }();
}
class FixtureOverlayEditorGroup extends mock() {
  constructor(editorPaneContainer, input) {
    super();
    this.editorPaneContainer = editorPaneContainer;
    this.id = 1;
    this.onDidActiveEditorChange = Event.None;
    this.onDidModelChange = Event.None;
    this.activeEditor = input;
    this.activeEditorPane = new class extends mock() {
      constructor() {
        super(...arguments);
        this.input = input;
      }
    }();
  }
  getIndexOfEditor(editor) {
    return editor === this.activeEditor ? 0 : -1;
  }
  async closeEditor() {
    return true;
  }
}
function createContextKeyService() {
  return new class extends MockContextKeyService {
    contextMatchesRules() {
      return true;
    }
  }();
}
async function renderAgentsDiffEditor({ container, disposableStore, disposableStackStore, theme }, options = {}) {
  const editorWidth = options.showSubmitOverlay ? FIXTURE_WIDTH - DETAIL_WIDTH : 520;
  const fixtureWidth = options.showSubmitOverlay ? FIXTURE_WIDTH : editorWidth;
  container.classList.add("agent-sessions-workbench", "dock-detail-panel");
  container.style.width = `${fixtureWidth}px`;
  container.style.height = `${FIXTURE_HEIGHT}px`;
  container.style.background = "var(--vscode-agentsPanel-background)";
  const editorPart = container.appendChild($(".part.editor"));
  editorPart.style.position = "relative";
  editorPart.style.width = "100%";
  editorPart.style.height = "100%";
  const editorContent = editorPart.appendChild($(".content"));
  editorContent.style.width = "100%";
  editorContent.style.height = "100%";
  const editorGroup = editorContent.appendChild($(".editor-group-container"));
  editorGroup.style.position = "relative";
  editorGroup.style.width = "100%";
  editorGroup.style.height = "100%";
  const editorPane = editorGroup.appendChild($(".editor-container"));
  editorPane.style.width = `${editorWidth}px`;
  editorPane.style.height = "100%";
  const editorInstance = editorPane.appendChild($(".editor-instance"));
  editorInstance.style.width = "100%";
  editorInstance.style.height = "100%";
  const feedback = options.showSubmitOverlay ? [{
    id: "feedback-1",
    text: "Keep the submit control with the diff.",
    resourceUri: MODIFIED_FIRST_RESOURCE,
    range: { startLineNumber: 19, startColumn: 1, endLineNumber: 19, endColumn: 1 },
    sessionResource: SESSION_RESOURCE,
    kind: AgentFeedbackKind.UserReview,
    state: AgentFeedbackState.Accepted
  }] : [];
  const agentFeedbackService = createAgentFeedbackService(feedback, options.showSubmitOverlay ? OVERLAY_RESOURCE : MODIFIED_FIRST_RESOURCE);
  const instantiationService = createEditorServices(disposableStore, {
    colorTheme: theme,
    additionalServices: (reg) => {
      registerWorkbenchServices(reg);
      reg.defineInstance(IAgentFeedbackService, agentFeedbackService);
      reg.defineInstance(IContextKeyService, createContextKeyService());
      reg.define(IMenuService, FixtureAgentFeedbackMenuService);
      reg.defineInstance(IDecorationsService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeDecorations = Event.None;
        }
      }());
      reg.defineInstance(ITextFileService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.untitled = new class extends mock() {
            constructor() {
              super(...arguments);
              this.onDidChangeLabel = Event.None;
            }
          }();
        }
      }());
      reg.defineInstance(IWorkspaceContextService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeWorkspaceFolders = Event.None;
        }
        getWorkspace() {
          return { id: "", folders: [], configuration: void 0 };
        }
      }());
      reg.defineInstance(INotebookDocumentService, new class extends mock() {
        getNotebook() {
          return void 0;
        }
      }());
      reg.definePartialInstance(IEditorProgressService, {
        show: () => ({ total: () => {
        }, worked: () => {
        }, done: () => {
        } })
      });
      reg.defineInstance(IDiffProviderFactoryService, new TestDiffProviderFactoryService());
    }
  });
  const textModels = disposableStackStore.add(new DisposableStore());
  const firstOriginal = textModels.add(createTextModel(instantiationService, `${UNCHANGED_LINES}
const status = 'before';
${UNCHANGED_LINES}`, URI.file("/workspace/src/first.original.ts"), "typescript"));
  const firstModified = textModels.add(createTextModel(instantiationService, `${UNCHANGED_LINES}
const status = 'after';
const enabled = true;
${UNCHANGED_LINES}`, MODIFIED_FIRST_RESOURCE, "typescript"));
  const secondOriginal = textModels.add(createTextModel(instantiationService, "export function count() {\n	return 1;\n}", URI.file("/workspace/src/second.original.ts"), "typescript"));
  const secondModified = textModels.add(createTextModel(instantiationService, "export function count() {\n	return 2;\n}", URI.file("/workspace/src/second.ts"), "typescript"));
  const first = RefCounted.createOfNonDisposable({ original: firstOriginal, modified: firstModified }, { dispose() {
  } });
  const second = RefCounted.createOfNonDisposable({ original: secondOriginal, modified: secondModified }, { dispose() {
  } });
  const widget = disposableStackStore.add(instantiationService.createInstance(
    MultiDiffEditorWidget,
    editorInstance,
    instantiationService.createInstance(AgentsDiffUIElementFactory),
    {
      hideOriginalLineNumbers: true,
      folding: false,
      hideUnchangedRegions: { enabled: true },
      lineNumbersMinChars: 3
    }
  ));
  widget.setRenderSideBySide(false);
  const viewModel = disposableStackStore.add(widget.createViewModel({
    documents: ValueWithChangeEvent.const([first, second])
  }));
  widget.setViewModel(viewModel);
  widget.layout(new Dimension(editorWidth, FIXTURE_HEIGHT));
  disposableStackStore.add(toDisposable(() => widget.setViewModel(void 0)));
  if (options.showSubmitOverlay) {
    renderDockedDetailPanel(editorPart);
    const input = disposableStackStore.add(new TestEditorInput(OVERLAY_RESOURCE, "fixture.agentsDiff"));
    const group = new FixtureOverlayEditorGroup(editorPane, input);
    disposableStackStore.add(instantiationService.createInstance(AgentFeedbackOverlayController, group));
    return;
  }
  const targetWindow = getWindow(container);
  await new Promise((resolve) => targetWindow.requestAnimationFrame(() => targetWindow.requestAnimationFrame(() => resolve())));
  const editor = widget.tryGetCodeEditor(MODIFIED_FIRST_RESOURCE)?.editor;
  if (editor) {
    disposableStackStore.add(widget.getScopedInstantiationService().createInstance(AgentFeedbackEditorInputContribution, editor));
  }
  const lineNumber = editor?.getDomNode()?.querySelector(".line-numbers");
  lineNumber?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: lineNumber.getBoundingClientRect().left + 1, clientY: lineNumber.getBoundingClientRect().top + 1 }));
  await new Promise((resolve) => targetWindow.requestAnimationFrame(() => resolve()));
}
function renderDockedDetailPanel(editorPart) {
  const detail = editorPart.appendChild($(".part.auxiliarybar.docked-auxiliarybar"));
  detail.style.position = "absolute";
  detail.style.top = "0";
  detail.style.right = "0";
  detail.style.width = `${DETAIL_WIDTH}px`;
  detail.style.height = "100%";
  detail.style.boxSizing = "border-box";
  detail.style.background = "var(--vscode-sideBar-background)";
  detail.style.borderLeft = "var(--vscode-strokeThickness) solid var(--vscode-sideBar-border)";
  const title = detail.appendChild($(".fixture-docked-detail-title"));
  title.textContent = "Files";
  title.style.height = "35px";
  title.style.boxSizing = "border-box";
  title.style.padding = "8px 12px";
  title.style.fontWeight = "var(--vscode-fontWeight-semiBold)";
  title.style.borderBottom = "var(--vscode-strokeThickness) solid var(--vscode-sideBar-border)";
  const files = detail.appendChild($(".fixture-docked-detail-files"));
  files.style.padding = "8px 12px";
  for (const [name, stats] of [["first.ts", "+2 -1"], ["second.ts", "+1 -1"], ["README.md", "+4 -0"]]) {
    const row = files.appendChild($(".fixture-docked-detail-file"));
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.padding = "6px 0";
    row.appendChild(document.createTextNode(name));
    const count = row.appendChild($("span"));
    count.textContent = stats;
    count.style.color = "var(--vscode-descriptionForeground)";
  }
}
var agentsDiffEditor_fixture_default = defineThemedFixtureGroup({ path: "sessions/changes/" }, {
  CompactDiffWithFeedback: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: renderAgentsDiffEditor
  }),
  CompactDiffWithSubmitOverlay: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderAgentsDiffEditor(context, { showSubmitOverlay: true })
  })
});
export {
  agentsDiffEditor_fixture_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhbmdlc1xcdGVzdFxcYnJvd3NlclxcYWdlbnRzRGlmZkVkaXRvci5maXh0dXJlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuLi8uLi9icm93c2VyL21lZGlhL211bHRpRmlsZURpZmZFZGl0b3IuY3NzJztcbmltcG9ydCAnLi4vLi4vLi4vYWdlbnRGZWVkYmFjay9icm93c2VyL21lZGlhL2FnZW50RmVlZGJhY2tFZGl0b3JJbnB1dC5jc3MnO1xuaW1wb3J0ICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvY29kaWNvbnMvY29kaWNvblN0eWxlcy5qcyc7XG5pbXBvcnQgeyAkLCBEaW1lbnNpb24sIGdldFdpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEV2ZW50LCBWYWx1ZVdpdGhDaGFuZ2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IE11bHRpRGlmZkVkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9tdWx0aURpZmZFZGl0b3IvbXVsdGlEaWZmRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IElEaWZmUHJvdmlkZXJGYWN0b3J5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9kaWZmRWRpdG9yL2RpZmZQcm92aWRlckZhY3RvcnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFJlZkNvdW50ZWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvZGlmZkVkaXRvci91dGlscy5qcyc7XG5pbXBvcnQgeyBJRG9jdW1lbnREaWZmSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9tdWx0aURpZmZFZGl0b3IvbW9kZWwuanMnO1xuaW1wb3J0IHsgSVJlc291cmNlTGFiZWwsIElXb3JrYmVuY2hVSUVsZW1lbnRGYWN0b3J5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L211bHRpRGlmZkVkaXRvci93b3JrYmVuY2hVSUVsZW1lbnRGYWN0b3J5LmpzJztcbmltcG9ydCB7IFRlc3REaWZmUHJvdmlkZXJGYWN0b3J5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci90ZXN0L2Jyb3dzZXIvZGlmZi90ZXN0RGlmZlByb3ZpZGVyRmFjdG9yeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1lbnUsIElNZW51QWN0aW9uT3B0aW9ucywgSU1lbnVTZXJ2aWNlLCBNZW51SWQsIE1lbnVJdGVtQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgTW9ja0NvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy90ZXN0L2NvbW1vbi9tb2NrS2V5YmluZGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZSwgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VMYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9icm93c2VyL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBJVmlzaWJsZUVkaXRvclBhbmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vZWRpdG9yL2VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElEZWNvcmF0aW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvZGVjb3JhdGlvbnMvY29tbW9uL2RlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclByb2dyZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tEb2N1bWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvbm90ZWJvb2svY29tbW9uL25vdGVib29rRG9jdW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXh0RmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBDb21wb25lbnRGaXh0dXJlQ29udGV4dCwgY3JlYXRlRWRpdG9yU2VydmljZXMsIGNyZWF0ZVRleHRNb2RlbCwgZGVmaW5lQ29tcG9uZW50Rml4dHVyZSwgZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwLCByZWdpc3RlcldvcmtiZW5jaFNlcnZpY2VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3Rlc3QvYnJvd3Nlci9jb21wb25lbnRGaXh0dXJlcy9maXh0dXJlVXRpbHMuanMnO1xuaW1wb3J0IHsgVGVzdEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgQWdlbnRGZWVkYmFja0VkaXRvcklucHV0Q29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYWdlbnRGZWVkYmFjay9icm93c2VyL2FnZW50RmVlZGJhY2tFZGl0b3JJbnB1dENvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBBZ2VudEZlZWRiYWNrT3ZlcmxheUNvbnRyb2xsZXIsIElBZ2VudEZlZWRiYWNrT3ZlcmxheUVkaXRvckdyb3VwIH0gZnJvbSAnLi4vLi4vLi4vYWdlbnRGZWVkYmFjay9icm93c2VyL2FnZW50RmVlZGJhY2tFZGl0b3JPdmVybGF5LmpzJztcbmltcG9ydCB7IGNsZWFyQWxsRmVlZGJhY2tBY3Rpb25JZCwgbmF2aWdhdGVOZXh0RmVlZGJhY2tBY3Rpb25JZCwgbmF2aWdhdGVQcmV2aW91c0ZlZWRiYWNrQWN0aW9uSWQsIG5hdmlnYXRpb25CZWFyaW5nRmFrZUFjdGlvbklkLCBzdWJtaXRGZWVkYmFja0FjdGlvbklkIH0gZnJvbSAnLi4vLi4vLi4vYWdlbnRGZWVkYmFjay9icm93c2VyL2FnZW50RmVlZGJhY2tFZGl0b3JBY3Rpb25zLmpzJztcbmltcG9ydCB7IEFnZW50RmVlZGJhY2tLaW5kLCBBZ2VudEZlZWRiYWNrU3RhdGUsIElBZ2VudEZlZWRiYWNrLCBJQWdlbnRGZWVkYmFja1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9hZ2VudEZlZWRiYWNrL2Jyb3dzZXIvYWdlbnRGZWVkYmFja1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgTWVudXMgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL21lbnVzLmpzJztcbmltcG9ydCB7IElTZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuXG5jb25zdCBTRVNTSU9OX1JFU09VUkNFID0gVVJJLnBhcnNlKCdmaXh0dXJlLXNlc3Npb246Ly9hZ2VudHMtZGlmZicpO1xuY29uc3QgTU9ESUZJRURfRklSU1RfUkVTT1VSQ0UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9zcmMvZmlyc3QudHMnKTtcbmNvbnN0IE9WRVJMQVlfUkVTT1VSQ0UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9jaGFuZ2VzLmRpZmYnKTtcbmNvbnN0IEZJWFRVUkVfV0lEVEggPSA4NjA7XG5jb25zdCBGSVhUVVJFX0hFSUdIVCA9IDYyMDtcbmNvbnN0IERFVEFJTF9XSURUSCA9IDI4MDtcblxuY29uc3QgVU5DSEFOR0VEX0xJTkVTID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogMTggfSwgKF8sIGluZGV4KSA9PiBgY29uc3QgdW5jaGFuZ2VkJHtpbmRleH0gPSAke2luZGV4fTtgKS5qb2luKCdcXG4nKTtcblxuY2xhc3MgRml4dHVyZUFnZW50RmVlZGJhY2tNZW51U2VydmljZSBpbXBsZW1lbnRzIElNZW51U2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkgeyB9XG5cblx0Y3JlYXRlTWVudShpZDogTWVudUlkKTogSU1lbnUge1xuXHRcdGlmIChpZCAhPT0gTWVudXMuQWdlbnRGZWVkYmFja0VkaXRvckNvbnRlbnQpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IFtdLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0Y29uc3QgY3JlYXRlQWN0aW9uID0gKGFjdGlvbklkOiBzdHJpbmcsIHRpdGxlOiBzdHJpbmcsIGljb246IFRoZW1lSWNvbikgPT4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdE1lbnVJdGVtQWN0aW9uLFxuXHRcdFx0eyBpZDogYWN0aW9uSWQsIHRpdGxlLCBpY29uIH0sXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR7IHJlbmRlclNob3J0VGl0bGU6IHRydWUgfSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHQpO1xuXHRcdGNvbnN0IG5hdmlnYXRlQWN0aW9ucyA9IFtcblx0XHRcdGNyZWF0ZUFjdGlvbihuYXZpZ2F0aW9uQmVhcmluZ0Zha2VBY3Rpb25JZCwgJ05hdmlnYXRpb24gU3RhdHVzJywgQ29kaWNvbi5jb21tZW50RGlzY3Vzc2lvbiksXG5cdFx0XHRjcmVhdGVBY3Rpb24obmF2aWdhdGVQcmV2aW91c0ZlZWRiYWNrQWN0aW9uSWQsICdQcmV2aW91cycsIENvZGljb24uYXJyb3dVcCksXG5cdFx0XHRjcmVhdGVBY3Rpb24obmF2aWdhdGVOZXh0RmVlZGJhY2tBY3Rpb25JZCwgJ05leHQnLCBDb2RpY29uLmFycm93RG93biksXG5cdFx0XTtcblx0XHRjb25zdCBzdWJtaXRBY3Rpb25zID0gW1xuXHRcdFx0Y3JlYXRlQWN0aW9uKHN1Ym1pdEZlZWRiYWNrQWN0aW9uSWQsICdTdWJtaXQnLCBDb2RpY29uLnNlbmQpLFxuXHRcdFx0Y3JlYXRlQWN0aW9uKGNsZWFyQWxsRmVlZGJhY2tBY3Rpb25JZCwgJ0NsZWFyJywgQ29kaWNvbi5jbGVhckFsbCksXG5cdFx0XTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBbXG5cdFx0XHRcdFsnbmF2aWdhdGUnLCBuYXZpZ2F0ZUFjdGlvbnNdLFxuXHRcdFx0XHRbJ2Ffc3VibWl0Jywgc3VibWl0QWN0aW9uc10sXG5cdFx0XHRdLFxuXHRcdH07XG5cdH1cblxuXHRnZXRNZW51QWN0aW9ucyhfaWQ6IE1lbnVJZCwgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsIF9vcHRpb25zPzogSU1lbnVBY3Rpb25PcHRpb25zKSB7IHJldHVybiBbXTsgfVxuXHRnZXRNZW51Q29udGV4dHMoKSB7IHJldHVybiBuZXcgU2V0PHN0cmluZz4oKTsgfVxuXHRyZXNldEhpZGRlblN0YXRlcygpIHsgfVxufVxuXG5jbGFzcyBBZ2VudHNEaWZmVUlFbGVtZW50RmFjdG9yeSBpbXBsZW1lbnRzIElXb3JrYmVuY2hVSUVsZW1lbnRGYWN0b3J5IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7IH1cblxuXHRjcmVhdGVSZXNvdXJjZUxhYmVsKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogSVJlc291cmNlTGFiZWwge1xuXHRcdGNvbnN0IGxhYmVsID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXNvdXJjZUxhYmVsLCBlbGVtZW50LCB7fSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHNldFVyaSh1cmksIG9wdGlvbnMgPSB7fSkge1xuXHRcdFx0XHRpZiAoIXVyaSkge1xuXHRcdFx0XHRcdGxhYmVsLmVsZW1lbnQuY2xlYXIoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRsYWJlbC5lbGVtZW50LnNldEZpbGUodXJpLCB7IHN0cmlrZXRocm91Z2g6IG9wdGlvbnMuc3RyaWtldGhyb3VnaCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IGxhYmVsLmRpc3Bvc2UoKSxcblx0XHR9O1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUZpeHR1cmVTZXNzaW9uKCk6IElTZXNzaW9uIHtcblx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb24+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHJlc291cmNlID0gU0VTU0lPTl9SRVNPVVJDRTtcblx0XHRvdmVycmlkZSByZWFkb25seSBjaGFuZ2VzID0gY29uc3RPYnNlcnZhYmxlKFtdKTtcblx0fSgpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVBZ2VudEZlZWRiYWNrU2VydmljZShmZWVkYmFjazogcmVhZG9ubHkgSUFnZW50RmVlZGJhY2tbXSA9IFtdLCBmZWVkYmFja1Njb3BlUmVzb3VyY2U6IFVSSSA9IE1PRElGSUVEX0ZJUlNUX1JFU09VUkNFKTogSUFnZW50RmVlZGJhY2tTZXJ2aWNlIHtcblx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZUZpeHR1cmVTZXNzaW9uKCk7XG5cdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudEZlZWRiYWNrU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VGZWVkYmFjayA9IEV2ZW50Lk5vbmU7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VOYXZpZ2F0aW9uID0gRXZlbnQuTm9uZTtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUZlZWRiYWNrU2NvcGUgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIGdldFNlc3Npb25Gb3JGaWxlKHJlc291cmNlOiBVUkkpOiBJU2Vzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0XHRyZXR1cm4gcmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gTU9ESUZJRURfRklSU1RfUkVTT1VSQ0UudG9TdHJpbmcoKSA/IHNlc3Npb24gOiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdG92ZXJyaWRlIGdldEZlZWRiYWNrU2Vzc2lvblJlc291cmNlKHJlc291cmNlOiBVUkkpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdFx0cmV0dXJuIHJlc291cmNlLnRvU3RyaW5nKCkgPT09IGZlZWRiYWNrU2NvcGVSZXNvdXJjZS50b1N0cmluZygpID8gU0VTU0lPTl9SRVNPVVJDRSA6IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0b3ZlcnJpZGUgZ2V0RmVlZGJhY2soKSB7XG5cdFx0XHRyZXR1cm4gZmVlZGJhY2s7XG5cdFx0fVxuXHRcdG92ZXJyaWRlIGdldE5hdmlnYXRpb25CZWFyaW5nKCkge1xuXHRcdFx0cmV0dXJuIHsgYWN0aXZlSWR4OiBmZWVkYmFjay5sZW5ndGggPiAwID8gMCA6IC0xLCB0b3RhbENvdW50OiBmZWVkYmFjay5sZW5ndGggfTtcblx0XHR9XG5cdH0oKTtcbn1cblxuY2xhc3MgRml4dHVyZU92ZXJsYXlFZGl0b3JHcm91cCBleHRlbmRzIG1vY2s8SUVkaXRvckdyb3VwPigpIGltcGxlbWVudHMgSUFnZW50RmVlZGJhY2tPdmVybGF5RWRpdG9yR3JvdXAge1xuXG5cdG92ZXJyaWRlIHJlYWRvbmx5IGlkID0gMTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UgPSBFdmVudC5Ob25lO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZE1vZGVsQ2hhbmdlID0gRXZlbnQuTm9uZTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgYWN0aXZlRWRpdG9yOiBUZXN0RWRpdG9ySW5wdXQ7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZUVkaXRvclBhbmU6IElWaXNpYmxlRWRpdG9yUGFuZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBlZGl0b3JQYW5lQ29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRpbnB1dDogVGVzdEVkaXRvcklucHV0LFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuYWN0aXZlRWRpdG9yID0gaW5wdXQ7XG5cdFx0dGhpcy5hY3RpdmVFZGl0b3JQYW5lID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVmlzaWJsZUVkaXRvclBhbmU+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaW5wdXQgPSBpbnB1dDtcblx0XHR9KCk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRJbmRleE9mRWRpdG9yKGVkaXRvcjogRWRpdG9ySW5wdXQpOiBudW1iZXIge1xuXHRcdHJldHVybiBlZGl0b3IgPT09IHRoaXMuYWN0aXZlRWRpdG9yID8gMCA6IC0xO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgY2xvc2VFZGl0b3IoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlQ29udGV4dEtleVNlcnZpY2UoKTogSUNvbnRleHRLZXlTZXJ2aWNlIHtcblx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIE1vY2tDb250ZXh0S2V5U2VydmljZSB7XG5cdFx0b3ZlcnJpZGUgY29udGV4dE1hdGNoZXNSdWxlcygpOiBib29sZWFuIHsgcmV0dXJuIHRydWU7IH1cblx0fSgpO1xufVxuXG5pbnRlcmZhY2UgSUFnZW50c0RpZmZGaXh0dXJlT3B0aW9ucyB7XG5cdHJlYWRvbmx5IHNob3dTdWJtaXRPdmVybGF5PzogYm9vbGVhbjtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcmVuZGVyQWdlbnRzRGlmZkVkaXRvcih7IGNvbnRhaW5lciwgZGlzcG9zYWJsZVN0b3JlLCBkaXNwb3NhYmxlU3RhY2tTdG9yZSwgdGhlbWUgfTogQ29tcG9uZW50Rml4dHVyZUNvbnRleHQsIG9wdGlvbnM6IElBZ2VudHNEaWZmRml4dHVyZU9wdGlvbnMgPSB7fSk6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBlZGl0b3JXaWR0aCA9IG9wdGlvbnMuc2hvd1N1Ym1pdE92ZXJsYXkgPyBGSVhUVVJFX1dJRFRIIC0gREVUQUlMX1dJRFRIIDogNTIwO1xuXHRjb25zdCBmaXh0dXJlV2lkdGggPSBvcHRpb25zLnNob3dTdWJtaXRPdmVybGF5ID8gRklYVFVSRV9XSURUSCA6IGVkaXRvcldpZHRoO1xuXHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnYWdlbnQtc2Vzc2lvbnMtd29ya2JlbmNoJywgJ2RvY2stZGV0YWlsLXBhbmVsJyk7XG5cdGNvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAke2ZpeHR1cmVXaWR0aH1weGA7XG5cdGNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHtGSVhUVVJFX0hFSUdIVH1weGA7XG5cdGNvbnRhaW5lci5zdHlsZS5iYWNrZ3JvdW5kID0gJ3ZhcigtLXZzY29kZS1hZ2VudHNQYW5lbC1iYWNrZ3JvdW5kKSc7XG5cblx0Y29uc3QgZWRpdG9yUGFydCA9IGNvbnRhaW5lci5hcHBlbmRDaGlsZCgkKCcucGFydC5lZGl0b3InKSk7XG5cdGVkaXRvclBhcnQuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xuXHRlZGl0b3JQYXJ0LnN0eWxlLndpZHRoID0gJzEwMCUnO1xuXHRlZGl0b3JQYXJ0LnN0eWxlLmhlaWdodCA9ICcxMDAlJztcblxuXHRjb25zdCBlZGl0b3JDb250ZW50ID0gZWRpdG9yUGFydC5hcHBlbmRDaGlsZCgkKCcuY29udGVudCcpKTtcblx0ZWRpdG9yQ29udGVudC5zdHlsZS53aWR0aCA9ICcxMDAlJztcblx0ZWRpdG9yQ29udGVudC5zdHlsZS5oZWlnaHQgPSAnMTAwJSc7XG5cblx0Y29uc3QgZWRpdG9yR3JvdXAgPSBlZGl0b3JDb250ZW50LmFwcGVuZENoaWxkKCQoJy5lZGl0b3ItZ3JvdXAtY29udGFpbmVyJykpO1xuXHRlZGl0b3JHcm91cC5zdHlsZS5wb3NpdGlvbiA9ICdyZWxhdGl2ZSc7XG5cdGVkaXRvckdyb3VwLnN0eWxlLndpZHRoID0gJzEwMCUnO1xuXHRlZGl0b3JHcm91cC5zdHlsZS5oZWlnaHQgPSAnMTAwJSc7XG5cblx0Y29uc3QgZWRpdG9yUGFuZSA9IGVkaXRvckdyb3VwLmFwcGVuZENoaWxkKCQoJy5lZGl0b3ItY29udGFpbmVyJykpO1xuXHRlZGl0b3JQYW5lLnN0eWxlLndpZHRoID0gYCR7ZWRpdG9yV2lkdGh9cHhgO1xuXHRlZGl0b3JQYW5lLnN0eWxlLmhlaWdodCA9ICcxMDAlJztcblxuXHRjb25zdCBlZGl0b3JJbnN0YW5jZSA9IGVkaXRvclBhbmUuYXBwZW5kQ2hpbGQoJCgnLmVkaXRvci1pbnN0YW5jZScpKTtcblx0ZWRpdG9ySW5zdGFuY2Uuc3R5bGUud2lkdGggPSAnMTAwJSc7XG5cdGVkaXRvckluc3RhbmNlLnN0eWxlLmhlaWdodCA9ICcxMDAlJztcblxuXHRjb25zdCBmZWVkYmFjazogcmVhZG9ubHkgSUFnZW50RmVlZGJhY2tbXSA9IG9wdGlvbnMuc2hvd1N1Ym1pdE92ZXJsYXkgPyBbe1xuXHRcdGlkOiAnZmVlZGJhY2stMScsXG5cdFx0dGV4dDogJ0tlZXAgdGhlIHN1Ym1pdCBjb250cm9sIHdpdGggdGhlIGRpZmYuJyxcblx0XHRyZXNvdXJjZVVyaTogTU9ESUZJRURfRklSU1RfUkVTT1VSQ0UsXG5cdFx0cmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiAxOSwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDE5LCBlbmRDb2x1bW46IDEgfSxcblx0XHRzZXNzaW9uUmVzb3VyY2U6IFNFU1NJT05fUkVTT1VSQ0UsXG5cdFx0a2luZDogQWdlbnRGZWVkYmFja0tpbmQuVXNlclJldmlldyxcblx0XHRzdGF0ZTogQWdlbnRGZWVkYmFja1N0YXRlLkFjY2VwdGVkLFxuXHR9XSA6IFtdO1xuXHRjb25zdCBhZ2VudEZlZWRiYWNrU2VydmljZSA9IGNyZWF0ZUFnZW50RmVlZGJhY2tTZXJ2aWNlKGZlZWRiYWNrLCBvcHRpb25zLnNob3dTdWJtaXRPdmVybGF5ID8gT1ZFUkxBWV9SRVNPVVJDRSA6IE1PRElGSUVEX0ZJUlNUX1JFU09VUkNFKTtcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVFZGl0b3JTZXJ2aWNlcyhkaXNwb3NhYmxlU3RvcmUsIHtcblx0XHRjb2xvclRoZW1lOiB0aGVtZSxcblx0XHRhZGRpdGlvbmFsU2VydmljZXM6IHJlZyA9PiB7XG5cdFx0XHRyZWdpc3RlcldvcmtiZW5jaFNlcnZpY2VzKHJlZyk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUFnZW50RmVlZGJhY2tTZXJ2aWNlLCBhZ2VudEZlZWRiYWNrU2VydmljZSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNvbnRleHRLZXlTZXJ2aWNlLCBjcmVhdGVDb250ZXh0S2V5U2VydmljZSgpKTtcblx0XHRcdHJlZy5kZWZpbmUoSU1lbnVTZXJ2aWNlLCBGaXh0dXJlQWdlbnRGZWVkYmFja01lbnVTZXJ2aWNlKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJRGVjb3JhdGlvbnNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElEZWNvcmF0aW9uc1NlcnZpY2U+KCkgeyBvdmVycmlkZSBvbkRpZENoYW5nZURlY29yYXRpb25zID0gRXZlbnQuTm9uZTsgfSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJVGV4dEZpbGVTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElUZXh0RmlsZVNlcnZpY2U+KCkgeyBvdmVycmlkZSByZWFkb25seSB1bnRpdGxlZCA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVRleHRGaWxlU2VydmljZVsndW50aXRsZWQnXT4oKSB7IG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlTGFiZWwgPSBFdmVudC5Ob25lOyB9KCk7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElXb3Jrc3BhY2VDb250ZXh0U2VydmljZT4oKSB7IG92ZXJyaWRlIG9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycyA9IEV2ZW50Lk5vbmU7IG92ZXJyaWRlIGdldFdvcmtzcGFjZSgpOiBJV29ya3NwYWNlIHsgcmV0dXJuIHsgaWQ6ICcnLCBmb2xkZXJzOiBbXSwgY29uZmlndXJhdGlvbjogdW5kZWZpbmVkIH07IH0gfSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJTm90ZWJvb2tEb2N1bWVudFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SU5vdGVib29rRG9jdW1lbnRTZXJ2aWNlPigpIHsgb3ZlcnJpZGUgZ2V0Tm90ZWJvb2soKTogdW5kZWZpbmVkIHsgcmV0dXJuIHVuZGVmaW5lZDsgfSB9KCkpO1xuXHRcdFx0cmVnLmRlZmluZVBhcnRpYWxJbnN0YW5jZShJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlLCB7XG5cdFx0XHRcdHNob3c6ICgpID0+ICh7IHRvdGFsOiAoKSA9PiB7IH0sIHdvcmtlZDogKCkgPT4geyB9LCBkb25lOiAoKSA9PiB7IH0gfSksXG5cdFx0XHR9KTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJRGlmZlByb3ZpZGVyRmFjdG9yeVNlcnZpY2UsIG5ldyBUZXN0RGlmZlByb3ZpZGVyRmFjdG9yeVNlcnZpY2UoKSk7XG5cdFx0fSxcblx0fSk7XG5cblx0Y29uc3QgdGV4dE1vZGVscyA9IGRpc3Bvc2FibGVTdGFja1N0b3JlLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRjb25zdCBmaXJzdE9yaWdpbmFsID0gdGV4dE1vZGVscy5hZGQoY3JlYXRlVGV4dE1vZGVsKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBgJHtVTkNIQU5HRURfTElORVN9XFxuY29uc3Qgc3RhdHVzID0gJ2JlZm9yZSc7XFxuJHtVTkNIQU5HRURfTElORVN9YCwgVVJJLmZpbGUoJy93b3Jrc3BhY2Uvc3JjL2ZpcnN0Lm9yaWdpbmFsLnRzJyksICd0eXBlc2NyaXB0JykpO1xuXHRjb25zdCBmaXJzdE1vZGlmaWVkID0gdGV4dE1vZGVscy5hZGQoY3JlYXRlVGV4dE1vZGVsKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBgJHtVTkNIQU5HRURfTElORVN9XFxuY29uc3Qgc3RhdHVzID0gJ2FmdGVyJztcXG5jb25zdCBlbmFibGVkID0gdHJ1ZTtcXG4ke1VOQ0hBTkdFRF9MSU5FU31gLCBNT0RJRklFRF9GSVJTVF9SRVNPVVJDRSwgJ3R5cGVzY3JpcHQnKSk7XG5cdGNvbnN0IHNlY29uZE9yaWdpbmFsID0gdGV4dE1vZGVscy5hZGQoY3JlYXRlVGV4dE1vZGVsKGluc3RhbnRpYXRpb25TZXJ2aWNlLCAnZXhwb3J0IGZ1bmN0aW9uIGNvdW50KCkge1xcblxcdHJldHVybiAxO1xcbn0nLCBVUkkuZmlsZSgnL3dvcmtzcGFjZS9zcmMvc2Vjb25kLm9yaWdpbmFsLnRzJyksICd0eXBlc2NyaXB0JykpO1xuXHRjb25zdCBzZWNvbmRNb2RpZmllZCA9IHRleHRNb2RlbHMuYWRkKGNyZWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgJ2V4cG9ydCBmdW5jdGlvbiBjb3VudCgpIHtcXG5cXHRyZXR1cm4gMjtcXG59JywgVVJJLmZpbGUoJy93b3Jrc3BhY2Uvc3JjL3NlY29uZC50cycpLCAndHlwZXNjcmlwdCcpKTtcblxuXHRjb25zdCBmaXJzdCA9IFJlZkNvdW50ZWQuY3JlYXRlT2ZOb25EaXNwb3NhYmxlPElEb2N1bWVudERpZmZJdGVtPih7IG9yaWdpbmFsOiBmaXJzdE9yaWdpbmFsLCBtb2RpZmllZDogZmlyc3RNb2RpZmllZCB9LCB7IGRpc3Bvc2UoKSB7IH0gfSk7XG5cdGNvbnN0IHNlY29uZCA9IFJlZkNvdW50ZWQuY3JlYXRlT2ZOb25EaXNwb3NhYmxlPElEb2N1bWVudERpZmZJdGVtPih7IG9yaWdpbmFsOiBzZWNvbmRPcmlnaW5hbCwgbW9kaWZpZWQ6IHNlY29uZE1vZGlmaWVkIH0sIHsgZGlzcG9zZSgpIHsgfSB9KTtcblx0Y29uc3Qgd2lkZ2V0ID0gZGlzcG9zYWJsZVN0YWNrU3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdE11bHRpRGlmZkVkaXRvcldpZGdldCxcblx0XHRlZGl0b3JJbnN0YW5jZSxcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudHNEaWZmVUlFbGVtZW50RmFjdG9yeSksXG5cdFx0e1xuXHRcdFx0aGlkZU9yaWdpbmFsTGluZU51bWJlcnM6IHRydWUsXG5cdFx0XHRmb2xkaW5nOiBmYWxzZSxcblx0XHRcdGhpZGVVbmNoYW5nZWRSZWdpb25zOiB7IGVuYWJsZWQ6IHRydWUgfSxcblx0XHRcdGxpbmVOdW1iZXJzTWluQ2hhcnM6IDMsXG5cdFx0fSxcblx0KSk7XG5cdHdpZGdldC5zZXRSZW5kZXJTaWRlQnlTaWRlKGZhbHNlKTtcblxuXHRjb25zdCB2aWV3TW9kZWwgPSBkaXNwb3NhYmxlU3RhY2tTdG9yZS5hZGQod2lkZ2V0LmNyZWF0ZVZpZXdNb2RlbCh7XG5cdFx0ZG9jdW1lbnRzOiBWYWx1ZVdpdGhDaGFuZ2VFdmVudC5jb25zdChbZmlyc3QsIHNlY29uZF0pLFxuXHR9KSk7XG5cdHdpZGdldC5zZXRWaWV3TW9kZWwodmlld01vZGVsKTtcblx0d2lkZ2V0LmxheW91dChuZXcgRGltZW5zaW9uKGVkaXRvcldpZHRoLCBGSVhUVVJFX0hFSUdIVCkpO1xuXHRkaXNwb3NhYmxlU3RhY2tTdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHdpZGdldC5zZXRWaWV3TW9kZWwodW5kZWZpbmVkKSkpO1xuXG5cdGlmIChvcHRpb25zLnNob3dTdWJtaXRPdmVybGF5KSB7XG5cdFx0cmVuZGVyRG9ja2VkRGV0YWlsUGFuZWwoZWRpdG9yUGFydCk7XG5cdFx0Y29uc3QgaW5wdXQgPSBkaXNwb3NhYmxlU3RhY2tTdG9yZS5hZGQobmV3IFRlc3RFZGl0b3JJbnB1dChPVkVSTEFZX1JFU09VUkNFLCAnZml4dHVyZS5hZ2VudHNEaWZmJykpO1xuXHRcdGNvbnN0IGdyb3VwID0gbmV3IEZpeHR1cmVPdmVybGF5RWRpdG9yR3JvdXAoZWRpdG9yUGFuZSwgaW5wdXQpO1xuXHRcdGRpc3Bvc2FibGVTdGFja1N0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEZlZWRiYWNrT3ZlcmxheUNvbnRyb2xsZXIsIGdyb3VwKSk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Y29uc3QgdGFyZ2V0V2luZG93ID0gZ2V0V2luZG93KGNvbnRhaW5lcik7XG5cdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gdGFyZ2V0V2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB0YXJnZXRXaW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHJlc29sdmUoKSkpKTtcblxuXHRjb25zdCBlZGl0b3IgPSB3aWRnZXQudHJ5R2V0Q29kZUVkaXRvcihNT0RJRklFRF9GSVJTVF9SRVNPVVJDRSk/LmVkaXRvcjtcblx0aWYgKGVkaXRvcikge1xuXHRcdGRpc3Bvc2FibGVTdGFja1N0b3JlLmFkZCh3aWRnZXQuZ2V0U2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UoKS5jcmVhdGVJbnN0YW5jZShBZ2VudEZlZWRiYWNrRWRpdG9ySW5wdXRDb250cmlidXRpb24sIGVkaXRvcikpO1xuXHR9XG5cdGNvbnN0IGxpbmVOdW1iZXIgPSBlZGl0b3I/LmdldERvbU5vZGUoKT8ucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5saW5lLW51bWJlcnMnKTtcblx0bGluZU51bWJlcj8uZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2Vtb3ZlJywgeyBidWJibGVzOiB0cnVlLCBjbGllbnRYOiBsaW5lTnVtYmVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLmxlZnQgKyAxLCBjbGllbnRZOiBsaW5lTnVtYmVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLnRvcCArIDEgfSkpO1xuXHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHRhcmdldFdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4gcmVzb2x2ZSgpKSk7XG59XG5cbmZ1bmN0aW9uIHJlbmRlckRvY2tlZERldGFpbFBhbmVsKGVkaXRvclBhcnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdGNvbnN0IGRldGFpbCA9IGVkaXRvclBhcnQuYXBwZW5kQ2hpbGQoJCgnLnBhcnQuYXV4aWxpYXJ5YmFyLmRvY2tlZC1hdXhpbGlhcnliYXInKSk7XG5cdGRldGFpbC5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG5cdGRldGFpbC5zdHlsZS50b3AgPSAnMCc7XG5cdGRldGFpbC5zdHlsZS5yaWdodCA9ICcwJztcblx0ZGV0YWlsLnN0eWxlLndpZHRoID0gYCR7REVUQUlMX1dJRFRIfXB4YDtcblx0ZGV0YWlsLnN0eWxlLmhlaWdodCA9ICcxMDAlJztcblx0ZGV0YWlsLnN0eWxlLmJveFNpemluZyA9ICdib3JkZXItYm94Jztcblx0ZGV0YWlsLnN0eWxlLmJhY2tncm91bmQgPSAndmFyKC0tdnNjb2RlLXNpZGVCYXItYmFja2dyb3VuZCknO1xuXHRkZXRhaWwuc3R5bGUuYm9yZGVyTGVmdCA9ICd2YXIoLS12c2NvZGUtc3Ryb2tlVGhpY2tuZXNzKSBzb2xpZCB2YXIoLS12c2NvZGUtc2lkZUJhci1ib3JkZXIpJztcblxuXHRjb25zdCB0aXRsZSA9IGRldGFpbC5hcHBlbmRDaGlsZCgkKCcuZml4dHVyZS1kb2NrZWQtZGV0YWlsLXRpdGxlJykpO1xuXHR0aXRsZS50ZXh0Q29udGVudCA9ICdGaWxlcyc7XG5cdHRpdGxlLnN0eWxlLmhlaWdodCA9ICczNXB4Jztcblx0dGl0bGUuc3R5bGUuYm94U2l6aW5nID0gJ2JvcmRlci1ib3gnO1xuXHR0aXRsZS5zdHlsZS5wYWRkaW5nID0gJzhweCAxMnB4Jztcblx0dGl0bGUuc3R5bGUuZm9udFdlaWdodCA9ICd2YXIoLS12c2NvZGUtZm9udFdlaWdodC1zZW1pQm9sZCknO1xuXHR0aXRsZS5zdHlsZS5ib3JkZXJCb3R0b20gPSAndmFyKC0tdnNjb2RlLXN0cm9rZVRoaWNrbmVzcykgc29saWQgdmFyKC0tdnNjb2RlLXNpZGVCYXItYm9yZGVyKSc7XG5cblx0Y29uc3QgZmlsZXMgPSBkZXRhaWwuYXBwZW5kQ2hpbGQoJCgnLmZpeHR1cmUtZG9ja2VkLWRldGFpbC1maWxlcycpKTtcblx0ZmlsZXMuc3R5bGUucGFkZGluZyA9ICc4cHggMTJweCc7XG5cdGZvciAoY29uc3QgW25hbWUsIHN0YXRzXSBvZiBbWydmaXJzdC50cycsICcrMiAtMSddLCBbJ3NlY29uZC50cycsICcrMSAtMSddLCBbJ1JFQURNRS5tZCcsICcrNCAtMCddXSkge1xuXHRcdGNvbnN0IHJvdyA9IGZpbGVzLmFwcGVuZENoaWxkKCQoJy5maXh0dXJlLWRvY2tlZC1kZXRhaWwtZmlsZScpKTtcblx0XHRyb3cuc3R5bGUuZGlzcGxheSA9ICdmbGV4Jztcblx0XHRyb3cuc3R5bGUuanVzdGlmeUNvbnRlbnQgPSAnc3BhY2UtYmV0d2Vlbic7XG5cdFx0cm93LnN0eWxlLnBhZGRpbmcgPSAnNnB4IDAnO1xuXHRcdHJvdy5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShuYW1lKSk7XG5cdFx0Y29uc3QgY291bnQgPSByb3cuYXBwZW5kQ2hpbGQoJCgnc3BhbicpKTtcblx0XHRjb3VudC50ZXh0Q29udGVudCA9IHN0YXRzO1xuXHRcdGNvdW50LnN0eWxlLmNvbG9yID0gJ3ZhcigtLXZzY29kZS1kZXNjcmlwdGlvbkZvcmVncm91bmQpJztcblx0fVxufVxuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVUaGVtZWRGaXh0dXJlR3JvdXAoeyBwYXRoOiAnc2Vzc2lvbnMvY2hhbmdlcy8nIH0sIHtcblx0Q29tcGFjdERpZmZXaXRoRmVlZGJhY2s6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IHJlbmRlckFnZW50c0RpZmZFZGl0b3IsXG5cdH0pLFxuXHRDb21wYWN0RGlmZldpdGhTdWJtaXRPdmVybGF5OiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiBjb250ZXh0ID0+IHJlbmRlckFnZW50c0RpZmZFZGl0b3IoY29udGV4dCwgeyBzaG93U3VibWl0T3ZlcmxheTogdHJ1ZSB9KSxcblx0fSksXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsU0FBUyxHQUFHLFdBQVcsaUJBQWlCO0FBQ3hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLE9BQU8sNEJBQTRCO0FBQzVDLFNBQVMsaUJB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
