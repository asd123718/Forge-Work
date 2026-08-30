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
import { Dimension } from "../../../../../base/browser/dom.js";
import { Event, ValueWithChangeEvent } from "../../../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { createTimeout, timeout } from "../../../../../base/common/async.js";
import { MultiDiffEditorWidget } from "../../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidget.js";
import { RefCounted } from "../../../../../editor/browser/widget/diffEditor/utils.js";
import { IDiffProviderFactoryService } from "../../../../../editor/browser/widget/diffEditor/diffProviderFactoryService.js";
import { TestDiffProviderFactoryService } from "../../../../../editor/test/browser/diff/testDiffProviderFactoryService.js";
import { linesDiffComputers } from "../../../../../editor/common/diff/linesDiffComputers.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IEditorProgressService } from "../../../../../platform/progress/common/progress.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { ResourceLabel } from "../../../../browser/labels.js";
import { IDecorationsService } from "../../../../services/decorations/common/decorations.js";
import { INotebookDocumentService } from "../../../../services/notebook/common/notebookDocumentService.js";
import { ITextFileService } from "../../../../services/textfile/common/textfiles.js";
import { createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from "../fixtureUtils.js";
let FixtureWorkbenchUIElementFactory = class {
  constructor(_instantiationService) {
    this._instantiationService = _instantiationService;
  }
  createResourceLabel(element) {
    const label = this._instantiationService.createInstance(ResourceLabel, element, {});
    return {
      setUri(uri, options = {}) {
        if (!uri) {
          label.element.clear();
        } else {
          label.element.setFile(uri, { strikethrough: options.strikethrough });
        }
      },
      dispose() {
        label.dispose();
      }
    };
  }
};
FixtureWorkbenchUIElementFactory = __decorateClass([
  __decorateParam(0, IInstantiationService)
], FixtureWorkbenchUIElementFactory);
const ORIGINAL_CODE_1 = `function greet(name: string): string {
	return 'Hello, ' + name;
}

function main() {
	console.log(greet('World'));
}`;
const MODIFIED_CODE_1 = `function greet(name: string, greeting = 'Hello'): string {
	return \`\${greeting}, \${name}!\`;
}

function farewell(name: string): string {
	return \`Goodbye, \${name}!\`;
}

function main() {
	console.log(greet('World'));
	console.log(farewell('World'));
}`;
const ORIGINAL_CODE_2 = `export interface Config {
	host: string;
	port: number;
}

export const defaultConfig: Config = {
	host: 'localhost',
	port: 3000,
};`;
const MODIFIED_CODE_2 = `export interface Config {
	host: string;
	port: number;
	secure: boolean;
	timeout: number;
}

export const defaultConfig: Config = {
	host: 'localhost',
	port: 8080,
	secure: true,
	timeout: 30000,
};`;
const ORIGINAL_CODE_3 = `import { Config } from './config';

export function createServer(config: Config) {
	return { config };
}`;
const MODIFIED_CODE_3 = `import { Config } from './config';

export function createServer(config: Config) {
	const { host, port, secure } = config;
	const protocol = secure ? 'https' : 'http';
	console.log(\`Starting server at \${protocol}://\${host}:\${port}\`);
	return { config, url: \`\${protocol}://\${host}:\${port}\` };
}`;
function renderMultiDiffEditor({ container, disposableStore, disposableStackStore, theme }) {
  container.style.width = "800px";
  container.style.height = "600px";
  container.style.border = "1px solid var(--vscode-editorWidget-border)";
  const instantiationService = createCommonServices(disposableStore, theme, new TestDiffProviderFactoryService());
  const textModels = disposableStackStore.add(new DisposableStore());
  const { doc1, doc2, doc3 } = createDocuments(instantiationService, textModels);
  const widget = disposableStackStore.add(createWidget(instantiationService, container));
  const model = {
    documents: ValueWithChangeEvent.const([doc1, doc2, doc3])
  };
  const viewModel = disposableStackStore.add(widget.createViewModel(model));
  widget.setViewModel(viewModel);
  widget.layout(new Dimension(800, 600));
  disposableStackStore.add(toDisposable(() => widget.setViewModel(void 0)));
}
const UNCHANGED_BLOCK = Array.from({ length: 20 }, (_, i) => `const value${i} = ${i};`).join("\n");
const ORIGINAL_HIDDEN = `${UNCHANGED_BLOCK}
const changed = 'before';
${UNCHANGED_BLOCK}`;
const MODIFIED_HIDDEN = `${UNCHANGED_BLOCK}
const changed = 'after';
const added = true;
${UNCHANGED_BLOCK}`;
function renderMultiDiffEditorHideOriginalLineNumbers({ container, disposableStore, disposableStackStore, theme }) {
  container.style.width = "800px";
  container.style.height = "600px";
  container.style.border = "1px solid var(--vscode-editorWidget-border)";
  const instantiationService = createCommonServices(disposableStore, theme, new TestDiffProviderFactoryService());
  const textModels = disposableStackStore.add(new DisposableStore());
  const original = textModels.add(createTextModel(instantiationService, ORIGINAL_HIDDEN, URI.parse("inmemory://original/settings.ts"), "typescript"));
  const modified = textModels.add(createTextModel(instantiationService, MODIFIED_HIDDEN, URI.parse("inmemory://modified/settings.ts"), "typescript"));
  const doc = RefCounted.createOfNonDisposable({ original, modified }, { dispose() {
  } });
  const widget = disposableStackStore.add(createWidget(instantiationService, container, {
    hideOriginalLineNumbers: true,
    hideUnchangedRegions: { enabled: true }
  }));
  widget.setRenderSideBySide(false);
  const model = {
    documents: ValueWithChangeEvent.const([doc])
  };
  const viewModel = disposableStackStore.add(widget.createViewModel(model));
  widget.setViewModel(viewModel);
  widget.layout(new Dimension(800, 600));
  disposableStackStore.add(toDisposable(() => widget.setViewModel(void 0)));
}
class DelayedDiffProviderFactoryService {
  constructor(_delayMs) {
    this._delayMs = _delayMs;
  }
  createDiffProvider() {
    return new DelayedDocumentDiffProvider(this._delayMs);
  }
}
class DelayedDocumentDiffProvider {
  constructor(_delayMs) {
    this._delayMs = _delayMs;
    this.onDidChange = () => toDisposable(() => {
    });
  }
  async computeDiff(original, modified, options, cancellationToken) {
    await timeout(this._delayMs, cancellationToken);
    if (cancellationToken.isCancellationRequested || original.isDisposed() || modified.isDisposed()) {
      return {
        changes: [],
        quitEarly: true,
        identical: false,
        moves: []
      };
    }
    const result = linesDiffComputers.getDefault().computeDiff(original.getLinesContent(), modified.getLinesContent(), options);
    return {
      changes: result.changes,
      quitEarly: result.hitTimeout,
      identical: original.getValue() === modified.getValue(),
      moves: result.moves
    };
  }
}
function createCommonServices(disposableStore, theme, diffProviderFactory) {
  return createEditorServices(disposableStore, {
    colorTheme: theme,
    additionalServices: (reg) => {
      reg.defineInstance(IDiffProviderFactoryService, diffProviderFactory);
      reg.definePartialInstance(IEditorProgressService, {
        show: () => ({ total: () => {
        }, worked: () => {
        }, done: () => {
        } })
      });
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
      reg.definePartialInstance(INotebookDocumentService, { getNotebook: () => void 0 });
      registerWorkbenchServices(reg);
    }
  });
}
function createWidget(instantiationService, container, diffEditorOptions) {
  const uiFactory = instantiationService.createInstance(FixtureWorkbenchUIElementFactory);
  return instantiationService.createInstance(
    MultiDiffEditorWidget,
    container,
    uiFactory,
    diffEditorOptions
  );
}
function createDocuments(instantiationService, textModels) {
  const original1 = textModels.add(createTextModel(instantiationService, ORIGINAL_CODE_1, URI.parse("inmemory://original/greet.ts"), "typescript"));
  const modified1 = textModels.add(createTextModel(instantiationService, MODIFIED_CODE_1, URI.parse("inmemory://modified/greet.ts"), "typescript"));
  const original2 = textModels.add(createTextModel(instantiationService, ORIGINAL_CODE_2, URI.parse("inmemory://original/config.ts"), "typescript"));
  const modified2 = textModels.add(createTextModel(instantiationService, MODIFIED_CODE_2, URI.parse("inmemory://modified/config.ts"), "typescript"));
  const original3 = textModels.add(createTextModel(instantiationService, ORIGINAL_CODE_3, URI.parse("inmemory://original/server.ts"), "typescript"));
  const modified3 = textModels.add(createTextModel(instantiationService, MODIFIED_CODE_3, URI.parse("inmemory://modified/server.ts"), "typescript"));
  return {
    doc1: RefCounted.createOfNonDisposable({ original: original1, modified: modified1 }, { dispose() {
    } }),
    doc2: RefCounted.createOfNonDisposable({ original: original2, modified: modified2 }, { dispose() {
    } }),
    doc3: RefCounted.createOfNonDisposable({ original: original3, modified: modified3 }, { dispose() {
    } })
  };
}
function renderMultiDiffEditorIncrementalUpdate() {
  return ({ container, disposableStore, disposableStackStore, theme }) => {
    container.style.width = "800px";
    container.style.height = "600px";
    container.style.border = "1px solid var(--vscode-editorWidget-border)";
    const delayedFactory = new DelayedDiffProviderFactoryService(800);
    const instantiationService = createCommonServices(disposableStore, theme, delayedFactory);
    const textModels = disposableStackStore.add(new DisposableStore());
    const { doc1, doc2, doc3 } = createDocuments(instantiationService, textModels);
    const widget = disposableStackStore.add(createWidget(instantiationService, container));
    const documents = new ValueWithChangeEvent([doc1]);
    const model = { documents };
    const viewModel = disposableStackStore.add(widget.createViewModel(model));
    widget.setViewModel(viewModel);
    disposableStackStore.add(toDisposable(() => widget.setViewModel(void 0)));
    widget.layout(new Dimension(800, 600));
    disposableStore.add(createTimeout(900, () => {
      documents.value = [doc1, doc2, doc3];
    }));
  };
}
function renderMultiDiffEditorDocumentSwap() {
  return ({ container, disposableStore, disposableStackStore, theme }) => {
    container.style.width = "800px";
    container.style.height = "600px";
    container.style.border = "1px solid var(--vscode-editorWidget-border)";
    const delayedFactory = new DelayedDiffProviderFactoryService(800);
    const instantiationService = createCommonServices(disposableStore, theme, delayedFactory);
    const textModels = disposableStackStore.add(new DisposableStore());
    const widget = disposableStackStore.add(createWidget(instantiationService, container));
    const makeDoc = (origText, modText, name) => {
      const original = textModels.add(createTextModel(instantiationService, origText, URI.parse(`inmemory://original/${name}`), "typescript"));
      const modified = textModels.add(createTextModel(instantiationService, modText, URI.parse(`inmemory://modified/${name}`), "typescript"));
      return RefCounted.createOfNonDisposable({ original, modified }, { dispose() {
      } });
    };
    const codeA_orig = 'const greeting = "hello";';
    const codeA_mod = 'const greeting = "hi";';
    const codeB_orig = "const port = 3000;";
    const codeB_mod = "const port = 8080;";
    const codeD_orig = 'const env = "development";';
    const codeD_mod = 'const env = "production";';
    const docA = makeDoc(codeA_orig, codeA_mod, "greet.ts");
    const docB = makeDoc(codeB_orig, codeB_mod, "config.ts");
    const documents = new ValueWithChangeEvent([docA, docB]);
    const model = { documents };
    const viewModel = disposableStackStore.add(widget.createViewModel(model));
    widget.setViewModel(viewModel);
    widget.layout(new Dimension(800, 600));
    disposableStore.add(createTimeout(900, () => {
      const docC = makeDoc(codeB_orig, codeB_mod, "config-v2.ts");
      const docD = makeDoc(codeD_orig, codeD_mod, "server.ts");
      documents.value = [docA, docC, docD];
    }));
    disposableStackStore.add(toDisposable(() => widget.setViewModel(void 0)));
  };
}
var multiDiffEditor_fixture_default = defineThemedFixtureGroup({ path: "editor/" }, {
  MultiDiffEditor: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderMultiDiffEditor(context)
  }),
  MultiDiffEditorHideOriginalLineNumbers: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderMultiDiffEditorHideOriginalLineNumbers(context)
  }),
  MultiDiffEditorIncrementalPending: defineComponentFixture({
    labels: { kind: "screenshot" },
    virtualTime: { enabled: true, durationMs: 1200 },
    render: renderMultiDiffEditorIncrementalUpdate()
  }),
  MultiDiffEditorIncrementalResolved: defineComponentFixture({
    labels: { kind: "screenshot" },
    virtualTime: { enabled: true, durationMs: 2e3 },
    render: renderMultiDiffEditorIncrementalUpdate()
  }),
  MultiDiffEditorIncrementalResolvedRealtime: defineComponentFixture({
    labels: { kind: "animated" },
    virtualTime: { enabled: false },
    render: renderMultiDiffEditorIncrementalUpdate()
  }),
  MultiDiffEditorDocumentSwapBefore: defineComponentFixture({
    labels: { kind: "screenshot" },
    virtualTime: { enabled: true, durationMs: 100 },
    render: renderMultiDiffEditorDocumentSwap()
  }),
  MultiDiffEditorDocumentSwapAfter: defineComponentFixture({
    labels: { kind: "screenshot" },
    virtualTime: { enabled: true, durationMs: 2e3 },
    render: renderMultiDiffEditorDocumentSwap()
  }),
  MultiDiffEditorDocumentSwapRealtime: defineComponentFixture({
    labels: { kind: "animated" },
    virtualTime: { enabled: false },
    render: renderMultiDiffEditorDocumentSwap()
  })
});
export {
  multiDiffEditor_fixture_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHRlc3RcXGJyb3dzZXJcXGNvbXBvbmVudEZpeHR1cmVzXFxlZGl0b3JcXG11bHRpRGlmZkVkaXRvci5maXh0dXJlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGltZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBFdmVudCwgVmFsdWVXaXRoQ2hhbmdlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUaW1lb3V0LCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgTXVsdGlEaWZmRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L211bHRpRGlmZkVkaXRvci9tdWx0aURpZmZFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgSURpZmZFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRG9jdW1lbnREaWZmSXRlbSwgSU11bHRpRGlmZkVkaXRvck1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L211bHRpRGlmZkVkaXRvci9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJUmVzb3VyY2VMYWJlbCBhcyBJTXVsdGlEaWZmUmVzb3VyY2VMYWJlbCwgSVdvcmtiZW5jaFVJRWxlbWVudEZhY3RvcnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvbXVsdGlEaWZmRWRpdG9yL3dvcmtiZW5jaFVJRWxlbWVudEZhY3RvcnkuanMnO1xuaW1wb3J0IHsgUmVmQ291bnRlZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9kaWZmRWRpdG9yL3V0aWxzLmpzJztcbmltcG9ydCB7IElEaWZmUHJvdmlkZXJGYWN0b3J5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9kaWZmRWRpdG9yL2RpZmZQcm92aWRlckZhY3RvcnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3REaWZmUHJvdmlkZXJGYWN0b3J5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci90ZXN0L2Jyb3dzZXIvZGlmZi90ZXN0RGlmZlByb3ZpZGVyRmFjdG9yeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSURvY3VtZW50RGlmZiwgSURvY3VtZW50RGlmZlByb3ZpZGVyLCBJRG9jdW1lbnREaWZmUHJvdmlkZXJPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9kaWZmL2RvY3VtZW50RGlmZlByb3ZpZGVyLmpzJztcbmltcG9ydCB7IGxpbmVzRGlmZkNvbXB1dGVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZGlmZi9saW5lc0RpZmZDb21wdXRlcnMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVdvcmtzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTGFiZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBJRGVjb3JhdGlvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZGVjb3JhdGlvbnMvY29tbW9uL2RlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0RvY3VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0RvY3VtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGV4dEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBDb21wb25lbnRGaXh0dXJlQ29udGV4dCwgY3JlYXRlRWRpdG9yU2VydmljZXMsIGNyZWF0ZVRleHRNb2RlbCwgZGVmaW5lQ29tcG9uZW50Rml4dHVyZSwgZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwLCByZWdpc3RlcldvcmtiZW5jaFNlcnZpY2VzIH0gZnJvbSAnLi4vZml4dHVyZVV0aWxzLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcblxuY2xhc3MgRml4dHVyZVdvcmtiZW5jaFVJRWxlbWVudEZhY3RvcnkgaW1wbGVtZW50cyBJV29ya2JlbmNoVUlFbGVtZW50RmFjdG9yeSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7IH1cblxuXHRjcmVhdGVSZXNvdXJjZUxhYmVsKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogSU11bHRpRGlmZlJlc291cmNlTGFiZWwge1xuXHRcdGNvbnN0IGxhYmVsID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VMYWJlbCwgZWxlbWVudCwge30pO1xuXHRcdHJldHVybiB7XG5cdFx0XHRzZXRVcmkodXJpLCBvcHRpb25zID0ge30pIHtcblx0XHRcdFx0aWYgKCF1cmkpIHtcblx0XHRcdFx0XHRsYWJlbC5lbGVtZW50LmNsZWFyKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bGFiZWwuZWxlbWVudC5zZXRGaWxlKHVyaSwgeyBzdHJpa2V0aHJvdWdoOiBvcHRpb25zLnN0cmlrZXRocm91Z2ggfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRkaXNwb3NlKCkge1xuXHRcdFx0XHRsYWJlbC5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxufVxuXG5jb25zdCBPUklHSU5BTF9DT0RFXzEgPSBgZnVuY3Rpb24gZ3JlZXQobmFtZTogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuICdIZWxsbywgJyArIG5hbWU7XG59XG5cbmZ1bmN0aW9uIG1haW4oKSB7XG5cdGNvbnNvbGUubG9nKGdyZWV0KCdXb3JsZCcpKTtcbn1gO1xuXG5jb25zdCBNT0RJRklFRF9DT0RFXzEgPSBgZnVuY3Rpb24gZ3JlZXQobmFtZTogc3RyaW5nLCBncmVldGluZyA9ICdIZWxsbycpOiBzdHJpbmcge1xuXHRyZXR1cm4gXFxgXFwke2dyZWV0aW5nfSwgXFwke25hbWV9IVxcYDtcbn1cblxuZnVuY3Rpb24gZmFyZXdlbGwobmFtZTogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIFxcYEdvb2RieWUsIFxcJHtuYW1lfSFcXGA7XG59XG5cbmZ1bmN0aW9uIG1haW4oKSB7XG5cdGNvbnNvbGUubG9nKGdyZWV0KCdXb3JsZCcpKTtcblx0Y29uc29sZS5sb2coZmFyZXdlbGwoJ1dvcmxkJykpO1xufWA7XG5cbmNvbnN0IE9SSUdJTkFMX0NPREVfMiA9IGBleHBvcnQgaW50ZXJmYWNlIENvbmZpZyB7XG5cdGhvc3Q6IHN0cmluZztcblx0cG9ydDogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgZGVmYXVsdENvbmZpZzogQ29uZmlnID0ge1xuXHRob3N0OiAnbG9jYWxob3N0Jyxcblx0cG9ydDogMzAwMCxcbn07YDtcblxuY29uc3QgTU9ESUZJRURfQ09ERV8yID0gYGV4cG9ydCBpbnRlcmZhY2UgQ29uZmlnIHtcblx0aG9zdDogc3RyaW5nO1xuXHRwb3J0OiBudW1iZXI7XG5cdHNlY3VyZTogYm9vbGVhbjtcblx0dGltZW91dDogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgZGVmYXVsdENvbmZpZzogQ29uZmlnID0ge1xuXHRob3N0OiAnbG9jYWxob3N0Jyxcblx0cG9ydDogODA4MCxcblx0c2VjdXJlOiB0cnVlLFxuXHR0aW1lb3V0OiAzMDAwMCxcbn07YDtcblxuY29uc3QgT1JJR0lOQUxfQ09ERV8zID0gYGltcG9ydCB7IENvbmZpZyB9IGZyb20gJy4vY29uZmlnJztcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVNlcnZlcihjb25maWc6IENvbmZpZykge1xuXHRyZXR1cm4geyBjb25maWcgfTtcbn1gO1xuXG5jb25zdCBNT0RJRklFRF9DT0RFXzMgPSBgaW1wb3J0IHsgQ29uZmlnIH0gZnJvbSAnLi9jb25maWcnO1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlU2VydmVyKGNvbmZpZzogQ29uZmlnKSB7XG5cdGNvbnN0IHsgaG9zdCwgcG9ydCwgc2VjdXJlIH0gPSBjb25maWc7XG5cdGNvbnN0IHByb3RvY29sID0gc2VjdXJlID8gJ2h0dHBzJyA6ICdodHRwJztcblx0Y29uc29sZS5sb2coXFxgU3RhcnRpbmcgc2VydmVyIGF0IFxcJHtwcm90b2NvbH06Ly9cXCR7aG9zdH06XFwke3BvcnR9XFxgKTtcblx0cmV0dXJuIHsgY29uZmlnLCB1cmw6IFxcYFxcJHtwcm90b2NvbH06Ly9cXCR7aG9zdH06XFwke3BvcnR9XFxgIH07XG59YDtcblxuZnVuY3Rpb24gcmVuZGVyTXVsdGlEaWZmRWRpdG9yKHsgY29udGFpbmVyLCBkaXNwb3NhYmxlU3RvcmUsIGRpc3Bvc2FibGVTdGFja1N0b3JlLCB0aGVtZSB9OiBDb21wb25lbnRGaXh0dXJlQ29udGV4dCk6IHZvaWQge1xuXHRjb250YWluZXIuc3R5bGUud2lkdGggPSAnODAwcHgnO1xuXHRjb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gJzYwMHB4Jztcblx0Y29udGFpbmVyLnN0eWxlLmJvcmRlciA9ICcxcHggc29saWQgdmFyKC0tdnNjb2RlLWVkaXRvcldpZGdldC1ib3JkZXIpJztcblxuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZUNvbW1vblNlcnZpY2VzKGRpc3Bvc2FibGVTdG9yZSwgdGhlbWUsIG5ldyBUZXN0RGlmZlByb3ZpZGVyRmFjdG9yeVNlcnZpY2UoKSk7XG5cblx0Y29uc3QgdGV4dE1vZGVscyA9IGRpc3Bvc2FibGVTdGFja1N0b3JlLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRjb25zdCB7IGRvYzEsIGRvYzIsIGRvYzMgfSA9IGNyZWF0ZURvY3VtZW50cyhpbnN0YW50aWF0aW9uU2VydmljZSwgdGV4dE1vZGVscyk7XG5cdGNvbnN0IHdpZGdldCA9IGRpc3Bvc2FibGVTdGFja1N0b3JlLmFkZChjcmVhdGVXaWRnZXQoaW5zdGFudGlhdGlvblNlcnZpY2UsIGNvbnRhaW5lcikpO1xuXG5cdGNvbnN0IG1vZGVsOiBJTXVsdGlEaWZmRWRpdG9yTW9kZWwgPSB7XG5cdFx0ZG9jdW1lbnRzOiBWYWx1ZVdpdGhDaGFuZ2VFdmVudC5jb25zdChbZG9jMSwgZG9jMiwgZG9jM10pLFxuXHR9O1xuXG5cdGNvbnN0IHZpZXdNb2RlbCA9IGRpc3Bvc2FibGVTdGFja1N0b3JlLmFkZCh3aWRnZXQuY3JlYXRlVmlld01vZGVsKG1vZGVsKSk7XG5cdHdpZGdldC5zZXRWaWV3TW9kZWwodmlld01vZGVsKTtcblx0d2lkZ2V0LmxheW91dChuZXcgRGltZW5zaW9uKDgwMCwgNjAwKSk7XG5cblx0ZGlzcG9zYWJsZVN0YWNrU3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB3aWRnZXQuc2V0Vmlld01vZGVsKHVuZGVmaW5lZCkpKTtcbn1cblxuLy8gQSBsb25nIHVuY2hhbmdlZCBwcmVmaXgvc3VmZml4IGFyb3VuZCBhIHNpbmdsZSBjaGFuZ2Ugc28gYGhpZGVVbmNoYW5nZWRSZWdpb25zYFxuLy8gY29sbGFwc2VzIHRoZSBzdXJyb3VuZGluZyBjb250ZXh0IGludG8gXCJOIGhpZGRlbiBsaW5lc1wiIHdpZGdldHMuXG5jb25zdCBVTkNIQU5HRURfQkxPQ0sgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiAyMCB9LCAoXywgaSkgPT4gYGNvbnN0IHZhbHVlJHtpfSA9ICR7aX07YCkuam9pbignXFxuJyk7XG5jb25zdCBPUklHSU5BTF9ISURERU4gPSBgJHtVTkNIQU5HRURfQkxPQ0t9XFxuY29uc3QgY2hhbmdlZCA9ICdiZWZvcmUnO1xcbiR7VU5DSEFOR0VEX0JMT0NLfWA7XG5jb25zdCBNT0RJRklFRF9ISURERU4gPSBgJHtVTkNIQU5HRURfQkxPQ0t9XFxuY29uc3QgY2hhbmdlZCA9ICdhZnRlcic7XFxuY29uc3QgYWRkZWQgPSB0cnVlO1xcbiR7VU5DSEFOR0VEX0JMT0NLfWA7XG5cbi8qKlxuICogUmVuZGVycyB0aGUgbXVsdGktZGlmZiBpbiBpbmxpbmUgdmlldyB3aXRoIGBoaWRlT3JpZ2luYWxMaW5lTnVtYmVyc2AgKHRoZVxuICogQWdlbnRzIHdpbmRvdyBDaGFuZ2VzIGVkaXRvciBjb25maWd1cmF0aW9uKTogdGhlIG9yaWdpbmFsIGxpbmUtbnVtYmVyIGNvbHVtblxuICogaXMgZHJvcHBlZCBzbyB0aGUgY29kZSBzaXRzIGZsdXNoIGxlZnQsIHdoaWxlIHRoZSBmdWxsIGV4cGFuZGFibGVcbiAqIGhpZGRlbi1yZWdpb24gd2lkZ2V0cyBhcmUgc3RpbGwgc2hvd24uXG4gKi9cbmZ1bmN0aW9uIHJlbmRlck11bHRpRGlmZkVkaXRvckhpZGVPcmlnaW5hbExpbmVOdW1iZXJzKHsgY29udGFpbmVyLCBkaXNwb3NhYmxlU3RvcmUsIGRpc3Bvc2FibGVTdGFja1N0b3JlLCB0aGVtZSB9OiBDb21wb25lbnRGaXh0dXJlQ29udGV4dCk6IHZvaWQge1xuXHRjb250YWluZXIuc3R5bGUud2lkdGggPSAnODAwcHgnO1xuXHRjb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gJzYwMHB4Jztcblx0Y29udGFpbmVyLnN0eWxlLmJvcmRlciA9ICcxcHggc29saWQgdmFyKC0tdnNjb2RlLWVkaXRvcldpZGdldC1ib3JkZXIpJztcblxuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZUNvbW1vblNlcnZpY2VzKGRpc3Bvc2FibGVTdG9yZSwgdGhlbWUsIG5ldyBUZXN0RGlmZlByb3ZpZGVyRmFjdG9yeVNlcnZpY2UoKSk7XG5cblx0Y29uc3QgdGV4dE1vZGVscyA9IGRpc3Bvc2FibGVTdGFja1N0b3JlLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRjb25zdCBvcmlnaW5hbCA9IHRleHRNb2RlbHMuYWRkKGNyZWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgT1JJR0lOQUxfSElEREVOLCBVUkkucGFyc2UoJ2lubWVtb3J5Oi8vb3JpZ2luYWwvc2V0dGluZ3MudHMnKSwgJ3R5cGVzY3JpcHQnKSk7XG5cdGNvbnN0IG1vZGlmaWVkID0gdGV4dE1vZGVscy5hZGQoY3JlYXRlVGV4dE1vZGVsKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBNT0RJRklFRF9ISURERU4sIFVSSS5wYXJzZSgnaW5tZW1vcnk6Ly9tb2RpZmllZC9zZXR0aW5ncy50cycpLCAndHlwZXNjcmlwdCcpKTtcblx0Y29uc3QgZG9jID0gUmVmQ291bnRlZC5jcmVhdGVPZk5vbkRpc3Bvc2FibGU8SURvY3VtZW50RGlmZkl0ZW0+KHsgb3JpZ2luYWwsIG1vZGlmaWVkIH0sIHsgZGlzcG9zZSgpIHsgfSB9KTtcblxuXHRjb25zdCB3aWRnZXQgPSBkaXNwb3NhYmxlU3RhY2tTdG9yZS5hZGQoY3JlYXRlV2lkZ2V0KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBjb250YWluZXIsIHtcblx0XHRoaWRlT3JpZ2luYWxMaW5lTnVtYmVyczogdHJ1ZSxcblx0XHRoaWRlVW5jaGFuZ2VkUmVnaW9uczogeyBlbmFibGVkOiB0cnVlIH0sXG5cdH0pKTtcblx0Ly8gYGhpZGVPcmlnaW5hbExpbmVOdW1iZXJzYCBvbmx5IGFmZmVjdHMgdGhlIGlubGluZSB2aWV3LlxuXHR3aWRnZXQuc2V0UmVuZGVyU2lkZUJ5U2lkZShmYWxzZSk7XG5cblx0Y29uc3QgbW9kZWw6IElNdWx0aURpZmZFZGl0b3JNb2RlbCA9IHtcblx0XHRkb2N1bWVudHM6IFZhbHVlV2l0aENoYW5nZUV2ZW50LmNvbnN0KFtkb2NdKSxcblx0fTtcblxuXHRjb25zdCB2aWV3TW9kZWwgPSBkaXNwb3NhYmxlU3RhY2tTdG9yZS5hZGQod2lkZ2V0LmNyZWF0ZVZpZXdNb2RlbChtb2RlbCkpO1xuXHR3aWRnZXQuc2V0Vmlld01vZGVsKHZpZXdNb2RlbCk7XG5cdHdpZGdldC5sYXlvdXQobmV3IERpbWVuc2lvbig4MDAsIDYwMCkpO1xuXG5cdGRpc3Bvc2FibGVTdGFja1N0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gd2lkZ2V0LnNldFZpZXdNb2RlbCh1bmRlZmluZWQpKSk7XG59XG5cbmNsYXNzIERlbGF5ZWREaWZmUHJvdmlkZXJGYWN0b3J5U2VydmljZSBpbXBsZW1lbnRzIElEaWZmUHJvdmlkZXJGYWN0b3J5U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF9kZWxheU1zOiBudW1iZXIpIHsgfVxuXHRjcmVhdGVEaWZmUHJvdmlkZXIoKTogSURvY3VtZW50RGlmZlByb3ZpZGVyIHtcblx0XHRyZXR1cm4gbmV3IERlbGF5ZWREb2N1bWVudERpZmZQcm92aWRlcih0aGlzLl9kZWxheU1zKTtcblx0fVxufVxuXG5jbGFzcyBEZWxheWVkRG9jdW1lbnREaWZmUHJvdmlkZXIgaW1wbGVtZW50cyBJRG9jdW1lbnREaWZmUHJvdmlkZXIge1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8dm9pZD4gPSAoKSA9PiB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KTtcblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfZGVsYXlNczogbnVtYmVyKSB7IH1cblxuXHRhc3luYyBjb21wdXRlRGlmZihvcmlnaW5hbDogSVRleHRNb2RlbCwgbW9kaWZpZWQ6IElUZXh0TW9kZWwsIG9wdGlvbnM6IElEb2N1bWVudERpZmZQcm92aWRlck9wdGlvbnMsIGNhbmNlbGxhdGlvblRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SURvY3VtZW50RGlmZj4ge1xuXHRcdGF3YWl0IHRpbWVvdXQodGhpcy5fZGVsYXlNcywgY2FuY2VsbGF0aW9uVG9rZW4pO1xuXHRcdGlmIChjYW5jZWxsYXRpb25Ub2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCB8fCBvcmlnaW5hbC5pc0Rpc3Bvc2VkKCkgfHwgbW9kaWZpZWQuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRyZXR1cm4gKHtcblx0XHRcdFx0Y2hhbmdlczogW10sXG5cdFx0XHRcdHF1aXRFYXJseTogdHJ1ZSxcblx0XHRcdFx0aWRlbnRpY2FsOiBmYWxzZSxcblx0XHRcdFx0bW92ZXM6IFtdLFxuXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gbGluZXNEaWZmQ29tcHV0ZXJzLmdldERlZmF1bHQoKS5jb21wdXRlRGlmZihvcmlnaW5hbC5nZXRMaW5lc0NvbnRlbnQoKSwgbW9kaWZpZWQuZ2V0TGluZXNDb250ZW50KCksIG9wdGlvbnMpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRjaGFuZ2VzOiByZXN1bHQuY2hhbmdlcyxcblx0XHRcdHF1aXRFYXJseTogcmVzdWx0LmhpdFRpbWVvdXQsXG5cdFx0XHRpZGVudGljYWw6IG9yaWdpbmFsLmdldFZhbHVlKCkgPT09IG1vZGlmaWVkLmdldFZhbHVlKCksXG5cdFx0XHRtb3ZlczogcmVzdWx0Lm1vdmVzLFxuXHRcdH07XG5cdH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlQ29tbW9uU2VydmljZXMoZGlzcG9zYWJsZVN0b3JlOiBEaXNwb3NhYmxlU3RvcmUsIHRoZW1lOiBDb21wb25lbnRGaXh0dXJlQ29udGV4dFsndGhlbWUnXSwgZGlmZlByb3ZpZGVyRmFjdG9yeTogSURpZmZQcm92aWRlckZhY3RvcnlTZXJ2aWNlKSB7XG5cdHJldHVybiBjcmVhdGVFZGl0b3JTZXJ2aWNlcyhkaXNwb3NhYmxlU3RvcmUsIHtcblx0XHRjb2xvclRoZW1lOiB0aGVtZSxcblx0XHRhZGRpdGlvbmFsU2VydmljZXM6IChyZWcpID0+IHtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJRGlmZlByb3ZpZGVyRmFjdG9yeVNlcnZpY2UsIGRpZmZQcm92aWRlckZhY3RvcnkpO1xuXHRcdFx0cmVnLmRlZmluZVBhcnRpYWxJbnN0YW5jZShJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlLCB7XG5cdFx0XHRcdHNob3c6ICgpID0+ICh7IHRvdGFsOiAoKSA9PiB7IH0sIHdvcmtlZDogKCkgPT4geyB9LCBkb25lOiAoKSA9PiB7IH0gfSksXG5cdFx0XHR9KTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJRGVjb3JhdGlvbnNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElEZWNvcmF0aW9uc1NlcnZpY2U+KCkgeyBvdmVycmlkZSBvbkRpZENoYW5nZURlY29yYXRpb25zID0gRXZlbnQuTm9uZTsgfSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJVGV4dEZpbGVTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElUZXh0RmlsZVNlcnZpY2U+KCkgeyBvdmVycmlkZSByZWFkb25seSB1bnRpdGxlZCA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVRleHRGaWxlU2VydmljZVsndW50aXRsZWQnXT4oKSB7IG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlTGFiZWwgPSBFdmVudC5Ob25lOyB9KCk7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElXb3Jrc3BhY2VDb250ZXh0U2VydmljZT4oKSB7IG92ZXJyaWRlIG9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycyA9IEV2ZW50Lk5vbmU7IG92ZXJyaWRlIGdldFdvcmtzcGFjZSgpOiBJV29ya3NwYWNlIHsgcmV0dXJuIHsgaWQ6ICcnLCBmb2xkZXJzOiBbXSwgY29uZmlndXJhdGlvbjogdW5kZWZpbmVkIH07IH0gfSgpKTtcblx0XHRcdHJlZy5kZWZpbmVQYXJ0aWFsSW5zdGFuY2UoSU5vdGVib29rRG9jdW1lbnRTZXJ2aWNlLCB7IGdldE5vdGVib29rOiAoKSA9PiB1bmRlZmluZWQgfSk7XG5cdFx0XHRyZWdpc3RlcldvcmtiZW5jaFNlcnZpY2VzKHJlZyk7XG5cdFx0fSxcblx0fSk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVdpZGdldChpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBjb250YWluZXI6IEhUTUxFbGVtZW50LCBkaWZmRWRpdG9yT3B0aW9ucz86IElEaWZmRWRpdG9yT3B0aW9ucykge1xuXHRjb25zdCB1aUZhY3RvcnkgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShGaXh0dXJlV29ya2JlbmNoVUlFbGVtZW50RmFjdG9yeSk7XG5cdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRNdWx0aURpZmZFZGl0b3JXaWRnZXQsXG5cdFx0Y29udGFpbmVyLFxuXHRcdHVpRmFjdG9yeSxcblx0XHRkaWZmRWRpdG9yT3B0aW9ucyxcblx0KTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlRG9jdW1lbnRzKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UsIHRleHRNb2RlbHM6IERpc3Bvc2FibGVTdG9yZSkge1xuXHRjb25zdCBvcmlnaW5hbDEgPSB0ZXh0TW9kZWxzLmFkZChjcmVhdGVUZXh0TW9kZWwoaW5zdGFudGlhdGlvblNlcnZpY2UsIE9SSUdJTkFMX0NPREVfMSwgVVJJLnBhcnNlKCdpbm1lbW9yeTovL29yaWdpbmFsL2dyZWV0LnRzJyksICd0eXBlc2NyaXB0JykpO1xuXHRjb25zdCBtb2RpZmllZDEgPSB0ZXh0TW9kZWxzLmFkZChjcmVhdGVUZXh0TW9kZWwoaW5zdGFudGlhdGlvblNlcnZpY2UsIE1PRElGSUVEX0NPREVfMSwgVVJJLnBhcnNlKCdpbm1lbW9yeTovL21vZGlmaWVkL2dyZWV0LnRzJyksICd0eXBlc2NyaXB0JykpO1xuXHRjb25zdCBvcmlnaW5hbDIgPSB0ZXh0TW9kZWxzLmFkZChjcmVhdGVUZXh0TW9kZWwoaW5zdGFudGlhdGlvblNlcnZpY2UsIE9SSUdJTkFMX0NPREVfMiwgVVJJLnBhcnNlKCdpbm1lbW9yeTovL29yaWdpbmFsL2NvbmZpZy50cycpLCAndHlwZXNjcmlwdCcpKTtcblx0Y29uc3QgbW9kaWZpZWQyID0gdGV4dE1vZGVscy5hZGQoY3JlYXRlVGV4dE1vZGVsKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBNT0RJRklFRF9DT0RFXzIsIFVSSS5wYXJzZSgnaW5tZW1vcnk6Ly9tb2RpZmllZC9jb25maWcudHMnKSwgJ3R5cGVzY3JpcHQnKSk7XG5cdGNvbnN0IG9yaWdpbmFsMyA9IHRleHRNb2RlbHMuYWRkKGNyZWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgT1JJR0lOQUxfQ09ERV8zLCBVUkkucGFyc2UoJ2lubWVtb3J5Oi8vb3JpZ2luYWwvc2VydmVyLnRzJyksICd0eXBlc2NyaXB0JykpO1xuXHRjb25zdCBtb2RpZmllZDMgPSB0ZXh0TW9kZWxzLmFkZChjcmVhdGVUZXh0TW9kZWwoaW5zdGFudGlhdGlvblNlcnZpY2UsIE1PRElGSUVEX0NPREVfMywgVVJJLnBhcnNlKCdpbm1lbW9yeTovL21vZGlmaWVkL3NlcnZlci50cycpLCAndHlwZXNjcmlwdCcpKTtcblx0cmV0dXJuIHtcblx0XHRkb2MxOiBSZWZDb3VudGVkLmNyZWF0ZU9mTm9uRGlzcG9zYWJsZTxJRG9jdW1lbnREaWZmSXRlbT4oeyBvcmlnaW5hbDogb3JpZ2luYWwxLCBtb2RpZmllZDogbW9kaWZpZWQxIH0sIHsgZGlzcG9zZSgpIHsgfSB9KSxcblx0XHRkb2MyOiBSZWZDb3VudGVkLmNyZWF0ZU9mTm9uRGlzcG9zYWJsZTxJRG9jdW1lbnREaWZmSXRlbT4oeyBvcmlnaW5hbDogb3JpZ2luYWwyLCBtb2RpZmllZDogbW9kaWZpZWQyIH0sIHsgZGlzcG9zZSgpIHsgfSB9KSxcblx0XHRkb2MzOiBSZWZDb3VudGVkLmNyZWF0ZU9mTm9uRGlzcG9zYWJsZTxJRG9jdW1lbnREaWZmSXRlbT4oeyBvcmlnaW5hbDogb3JpZ2luYWwzLCBtb2RpZmllZDogbW9kaWZpZWQzIH0sIHsgZGlzcG9zZSgpIHsgfSB9KSxcblx0fTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyTXVsdGlEaWZmRWRpdG9ySW5jcmVtZW50YWxVcGRhdGUoKSB7XG5cdHJldHVybiAoeyBjb250YWluZXIsIGRpc3Bvc2FibGVTdG9yZSwgZGlzcG9zYWJsZVN0YWNrU3RvcmUsIHRoZW1lIH06IENvbXBvbmVudEZpeHR1cmVDb250ZXh0KSA9PiB7XG5cdFx0Y29udGFpbmVyLnN0eWxlLndpZHRoID0gJzgwMHB4Jztcblx0XHRjb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gJzYwMHB4Jztcblx0XHRjb250YWluZXIuc3R5bGUuYm9yZGVyID0gJzFweCBzb2xpZCB2YXIoLS12c2NvZGUtZWRpdG9yV2lkZ2V0LWJvcmRlciknO1xuXG5cdFx0Ly8gRmlyc3QgZmlsZTogc3luYyBkaWZmcyAoYWxyZWFkeSByZXNvbHZlZCkuIEZpbGVzIDIrMzogODAwbXMgZGVsYXkuXG5cdFx0Y29uc3QgZGVsYXllZEZhY3RvcnkgPSBuZXcgRGVsYXllZERpZmZQcm92aWRlckZhY3RvcnlTZXJ2aWNlKDgwMCk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVDb21tb25TZXJ2aWNlcyhkaXNwb3NhYmxlU3RvcmUsIHRoZW1lLCBkZWxheWVkRmFjdG9yeSk7XG5cblx0XHRjb25zdCB0ZXh0TW9kZWxzID0gZGlzcG9zYWJsZVN0YWNrU3RvcmUuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3QgeyBkb2MxLCBkb2MyLCBkb2MzIH0gPSBjcmVhdGVEb2N1bWVudHMoaW5zdGFudGlhdGlvblNlcnZpY2UsIHRleHRNb2RlbHMpO1xuXHRcdGNvbnN0IHdpZGdldCA9IGRpc3Bvc2FibGVTdGFja1N0b3JlLmFkZChjcmVhdGVXaWRnZXQoaW5zdGFudGlhdGlvblNlcnZpY2UsIGNvbnRhaW5lcikpO1xuXG5cdFx0Ly8gU3RhcnQgd2l0aCBvbmx5IGRvYzEgXHUyMDE0IGl0cyBkaWZmIHJlc29sdmVzIGltbWVkaWF0ZWx5ICg4MDBtcyB2aXJ0dWFsKVxuXHRcdGNvbnN0IGRvY3VtZW50cyA9IG5ldyBWYWx1ZVdpdGhDaGFuZ2VFdmVudDxyZWFkb25seSBSZWZDb3VudGVkPElEb2N1bWVudERpZmZJdGVtPltdPihbZG9jMV0pO1xuXHRcdGNvbnN0IG1vZGVsOiBJTXVsdGlEaWZmRWRpdG9yTW9kZWwgPSB7IGRvY3VtZW50cyB9O1xuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IGRpc3Bvc2FibGVTdGFja1N0b3JlLmFkZCh3aWRnZXQuY3JlYXRlVmlld01vZGVsKG1vZGVsKSk7XG5cdFx0d2lkZ2V0LnNldFZpZXdNb2RlbCh2aWV3TW9kZWwpO1xuXHRcdGRpc3Bvc2FibGVTdGFja1N0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gd2lkZ2V0LnNldFZpZXdNb2RlbCh1bmRlZmluZWQpKSk7XG5cblx0XHR3aWRnZXQubGF5b3V0KG5ldyBEaW1lbnNpb24oODAwLCA2MDApKTtcblxuXHRcdC8vIEF0IFQ9OTAwbXM6IGFkZCBkb2MyIGFuZCBkb2MzLiBUaGVpciBkaWZmcyB0YWtlIDgwMG1zIChyZXNvbHZlIGF0IFQ9MTcwMG1zKS5cblx0XHQvLyBUaGUgMXMgZ2F0ZSBtZWFucyB0aGV5IGFwcGVhciBhdCBtaW4oVD0xNzAwbXMsIFQ9MTkwMG1zKSA9IFQ9MTcwMG1zLlxuXHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQoY3JlYXRlVGltZW91dCg5MDAsICgpID0+IHtcblx0XHRcdGRvY3VtZW50cy52YWx1ZSA9IFtkb2MxLCBkb2MyLCBkb2MzXTtcblx0XHR9KSk7XG5cdH07XG59XG5cbmZ1bmN0aW9uIHJlbmRlck11bHRpRGlmZkVkaXRvckRvY3VtZW50U3dhcCgpIHtcblx0cmV0dXJuICh7IGNvbnRhaW5lciwgZGlzcG9zYWJsZVN0b3JlLCBkaXNwb3NhYmxlU3RhY2tTdG9yZSwgdGhlbWUgfTogQ29tcG9uZW50Rml4dHVyZUNvbnRleHQpID0+IHtcblx0XHRjb250YWluZXIuc3R5bGUud2lkdGggPSAnODAwcHgnO1xuXHRcdGNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSAnNjAwcHgnO1xuXHRcdGNvbnRhaW5lci5zdHlsZS5ib3JkZXIgPSAnMXB4IHNvbGlkIHZhcigtLXZzY29kZS1lZGl0b3JXaWRnZXQtYm9yZGVyKSc7XG5cblx0XHRjb25zdCBkZWxheWVkRmFjdG9yeSA9IG5ldyBEZWxheWVkRGlmZlByb3ZpZGVyRmFjdG9yeVNlcnZpY2UoODAwKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZUNvbW1vblNlcnZpY2VzKGRpc3Bvc2FibGVTdG9yZSwgdGhlbWUsIGRlbGF5ZWRGYWN0b3J5KTtcblxuXHRcdGNvbnN0IHRleHRNb2RlbHMgPSBkaXNwb3NhYmxlU3RhY2tTdG9yZS5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCB3aWRnZXQgPSBkaXNwb3NhYmxlU3RhY2tTdG9yZS5hZGQoY3JlYXRlV2lkZ2V0KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBjb250YWluZXIpKTtcblxuXHRcdGNvbnN0IG1ha2VEb2MgPSAob3JpZ1RleHQ6IHN0cmluZywgbW9kVGV4dDogc3RyaW5nLCBuYW1lOiBzdHJpbmcpID0+IHtcblx0XHRcdGNvbnN0IG9yaWdpbmFsID0gdGV4dE1vZGVscy5hZGQoY3JlYXRlVGV4dE1vZGVsKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBvcmlnVGV4dCwgVVJJLnBhcnNlKGBpbm1lbW9yeTovL29yaWdpbmFsLyR7bmFtZX1gKSwgJ3R5cGVzY3JpcHQnKSk7XG5cdFx0XHRjb25zdCBtb2RpZmllZCA9IHRleHRNb2RlbHMuYWRkKGNyZWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgbW9kVGV4dCwgVVJJLnBhcnNlKGBpbm1lbW9yeTovL21vZGlmaWVkLyR7bmFtZX1gKSwgJ3R5cGVzY3JpcHQnKSk7XG5cdFx0XHRyZXR1cm4gUmVmQ291bnRlZC5jcmVhdGVPZk5vbkRpc3Bvc2FibGU8SURvY3VtZW50RGlmZkl0ZW0+KHsgb3JpZ2luYWwsIG1vZGlmaWVkIH0sIHsgZGlzcG9zZSgpIHsgfSB9KTtcblx0XHR9O1xuXG5cdFx0Ly8gRWFjaCBkb2N1bWVudCBoYXMgZXhhY3RseSBvbmUgbGluZSBjaGFuZ2UuXG5cdFx0Y29uc3QgY29kZUFfb3JpZyA9ICdjb25zdCBncmVldGluZyA9IFwiaGVsbG9cIjsnO1xuXHRcdGNvbnN0IGNvZGVBX21vZCA9ICdjb25zdCBncmVldGluZyA9IFwiaGlcIjsnO1xuXHRcdGNvbnN0IGNvZGVCX29yaWcgPSAnY29uc3QgcG9ydCA9IDMwMDA7Jztcblx0XHRjb25zdCBjb2RlQl9tb2QgPSAnY29uc3QgcG9ydCA9IDgwODA7Jztcblx0XHRjb25zdCBjb2RlRF9vcmlnID0gJ2NvbnN0IGVudiA9IFwiZGV2ZWxvcG1lbnRcIjsnO1xuXHRcdGNvbnN0IGNvZGVEX21vZCA9ICdjb25zdCBlbnYgPSBcInByb2R1Y3Rpb25cIjsnO1xuXG5cdFx0Y29uc3QgZG9jQSA9IG1ha2VEb2MoY29kZUFfb3JpZywgY29kZUFfbW9kLCAnZ3JlZXQudHMnKTtcblx0XHRjb25zdCBkb2NCID0gbWFrZURvYyhjb2RlQl9vcmlnLCBjb2RlQl9tb2QsICdjb25maWcudHMnKTtcblxuXHRcdC8vIFN0YXJ0IHdpdGggQSBhbmQgQlxuXHRcdGNvbnN0IGRvY3VtZW50cyA9IG5ldyBWYWx1ZVdpdGhDaGFuZ2VFdmVudDxyZWFkb25seSBSZWZDb3VudGVkPElEb2N1bWVudERpZmZJdGVtPltdPihbZG9jQSwgZG9jQl0pO1xuXHRcdGNvbnN0IG1vZGVsOiBJTXVsdGlEaWZmRWRpdG9yTW9kZWwgPSB7IGRvY3VtZW50cyB9O1xuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IGRpc3Bvc2FibGVTdGFja1N0b3JlLmFkZCh3aWRnZXQuY3JlYXRlVmlld01vZGVsKG1vZGVsKSk7XG5cdFx0d2lkZ2V0LnNldFZpZXdNb2RlbCh2aWV3TW9kZWwpO1xuXHRcdHdpZGdldC5sYXlvdXQobmV3IERpbWVuc2lvbig4MDAsIDYwMCkpO1xuXG5cdFx0Ly8gQXQgVD05MDBtczogcmVwbGFjZSB3aXRoIEEsIEMsIEQuXG5cdFx0Ly8gQyBoYXMgdGhlIHNhbWUgY29udGVudCBhcyBCIGJ1dCBhIGRpZmZlcmVudCBVUkkuXG5cdFx0Ly8gRCBpcyBhIG5ldyBkb2N1bWVudC5cblx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKGNyZWF0ZVRpbWVvdXQoOTAwLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkb2NDID0gbWFrZURvYyhjb2RlQl9vcmlnLCBjb2RlQl9tb2QsICdjb25maWctdjIudHMnKTtcblx0XHRcdGNvbnN0IGRvY0QgPSBtYWtlRG9jKGNvZGVEX29yaWcsIGNvZGVEX21vZCwgJ3NlcnZlci50cycpO1xuXHRcdFx0ZG9jdW1lbnRzLnZhbHVlID0gW2RvY0EsIGRvY0MsIGRvY0RdO1xuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVTdGFja1N0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gd2lkZ2V0LnNldFZpZXdNb2RlbCh1bmRlZmluZWQpKSk7XG5cdH07XG59XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZVRoZW1lZEZpeHR1cmVHcm91cCh7IHBhdGg6ICdlZGl0b3IvJyB9LCB7XG5cdE11bHRpRGlmZkVkaXRvcjogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogKGNvbnRleHQpID0+IHJlbmRlck11bHRpRGlmZkVkaXRvcihjb250ZXh0KSxcblx0fSksXG5cdE11bHRpRGlmZkVkaXRvckhpZGVPcmlnaW5hbExpbmVOdW1iZXJzOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiAoY29udGV4dCkgPT4gcmVuZGVyTXVsdGlEaWZmRWRpdG9ySGlkZU9yaWdpbmFsTGluZU51bWJlcnMoY29udGV4dCksXG5cdH0pLFxuXHRNdWx0aURpZmZFZGl0b3JJbmNyZW1lbnRhbFBlbmRpbmc6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHR2aXJ0dWFsVGltZTogeyBlbmFibGVkOiB0cnVlLCBkdXJhdGlvbk1zOiAxMjAwIH0sXG5cdFx0cmVuZGVyOiByZW5kZXJNdWx0aURpZmZFZGl0b3JJbmNyZW1lbnRhbFVwZGF0ZSgpLFxuXHR9KSxcblx0TXVsdGlEaWZmRWRpdG9ySW5jcmVtZW50YWxSZXNvbHZlZDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHZpcnR1YWxUaW1lOiB7IGVuYWJsZWQ6IHRydWUsIGR1cmF0aW9uTXM6IDIwMDAgfSxcblx0XHRyZW5kZXI6IHJlbmRlck11bHRpRGlmZkVkaXRvckluY3JlbWVudGFsVXBkYXRlKCksXG5cdH0pLFxuXHRNdWx0aURpZmZFZGl0b3JJbmNyZW1lbnRhbFJlc29sdmVkUmVhbHRpbWU6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnYW5pbWF0ZWQnIH0sXG5cdFx0dmlydHVhbFRpbWU6IHsgZW5hYmxlZDogZmFsc2UgfSxcblx0XHRyZW5kZXI6IHJlbmRlck11bHRpRGlmZkVkaXRvckluY3JlbWVudGFsVXBkYXRlKCksXG5cdH0pLFxuXHRNdWx0aURpZmZFZGl0b3JEb2N1bWVudFN3YXBCZWZvcmU6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHR2aXJ0dWFsVGltZTogeyBlbmFibGVkOiB0cnVlLCBkdXJhdGlvbk1zOiAxMDAgfSxcblx0XHRyZW5kZXI6IHJlbmRlck11bHRpRGlmZkVkaXRvckRvY3VtZW50U3dhcCgpLFxuXHR9KSxcblx0TXVsdGlEaWZmRWRpdG9yRG9jdW1lbnRTd2FwQWZ0ZXI6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHR2aXJ0dWFsVGltZTogeyBlbmFibGVkOiB0cnVlLCBkdXJhdGlvbk1zOiAyMDAwIH0sXG5cdFx0cmVuZGVyOiByZW5kZXJNdWx0aURpZmZFZGl0b3JEb2N1bWVudFN3YXAoKSxcblx0fSksXG5cdE11bHRpRGlmZkVkaXRvckRvY3VtZW50U3dhcFJlYWx0aW1lOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ2FuaW1hdGVkJyB9LFxuXHRcdHZpcnR1YWxUaW1lOiB7IGVuYWJsZWQ6IGZhbHNlIH0sXG5cdFx0cmVuZGVyOiByZW5kZXJNdWx0aURpZmZFZGl0b3JEb2N1bWVudFN3YXAoKSxcblx0fSksXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxPQUFPLDRCQUE0QjtBQUM1QyxTQUFTLGlCQUFpQixvQkFBb0I7QUFDOUMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsWUFBWTtBQUVyQixTQUFTLGVBQWUsZUFBZTtBQUN2QyxTQUFTLDZCQUE2QjtBQUl0QyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG1DQUFtQztBQUM1QyxTQUFTLHNDQUFzQztBQUUvQyxTQUFTLDBCQUEwQjtBQUVuQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLGdDQUE0QztBQUNyRCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGdDQUFnQztB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
