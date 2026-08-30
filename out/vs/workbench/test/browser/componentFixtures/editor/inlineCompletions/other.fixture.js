import { constObservable } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from "../../fixtureUtils.js";
import { EditorExtensionsRegistry } from "../../../../../../editor/browser/editorExtensions.js";
import { CodeEditorWidget } from "../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { observableCodeEditor } from "../../../../../../editor/browser/observableCodeEditor.js";
import { Position } from "../../../../../../editor/common/core/position.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { ILanguageFeaturesService } from "../../../../../../editor/common/services/languageFeatures.js";
import { InlineCompletionsController } from "../../../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionsController.js";
import "../../../../../../editor/contrib/inlineCompletions/browser/inlineCompletions.contribution.js";
import { InlineCompletionsSource, InlineCompletionsState } from "../../../../../../editor/contrib/inlineCompletions/browser/model/inlineCompletionsSource.js";
import { InlineEditItem } from "../../../../../../editor/contrib/inlineCompletions/browser/model/inlineSuggestionItem.js";
import { TextModelValueReference } from "../../../../../../editor/contrib/inlineCompletions/browser/model/textModelValueReference.js";
import { JumpToView } from "../../../../../../editor/contrib/inlineCompletions/browser/view/inlineEdits/inlineEditsViews/jumpToView.js";
import { GutterIndicatorMenuContent } from "../../../../../../editor/contrib/inlineCompletions/browser/view/inlineEdits/components/gutterIndicatorMenu.js";
import { InlineSuggestionGutterMenuData } from "../../../../../../editor/contrib/inlineCompletions/browser/view/inlineEdits/components/gutterIndicatorView.js";
import { IUserInteractionService, MockUserInteractionService } from "../../../../../../platform/userInteraction/browser/userInteractionService.js";
import "../../../../../../editor/contrib/inlineCompletions/browser/hintsWidget/inlineCompletionsHintsWidget.css";
import "../../../../../../editor/contrib/inlineCompletions/browser/view/inlineEdits/view.css";
import "../../../../../../base/browser/ui/codicons/codiconStyles.js";
const SAMPLE_CODE = `function fibonacci(n: number): number {
	if (n <= 1) return n;
	return fibonacci(n - 1) + fibonacci(n - 2);
}

const result = fibonacci(10);
console.log(result);
`;
const LONG_DISTANCE_CODE = `import { readFile, writeFile } from 'fs';
import { join } from 'path';

interface Config {
	inputDir: string;
	outputDir: string;
	verbose: boolean;
}

function loadConfig(): Config {
	return {
		inputDir: './input',
		outputDir: './output',
		verbose: false,
	};
}

function processLine(line: string): string {
	return line.trim().toUpperCase();
}

function validateInput(data: string): boolean {
	return data.length > 0 && data.length < 10000;
}

async function processFile(config: Config, filename: string): Promise<void> {
	const inputPath = join(config.inputDir, filename);
	const data = await readFile(inputPath, 'utf8');
	if (!validateInput(data)) {
		throw new Error('Invalid input');
	}
	const lines = data.split('\\n');
	const processed = lines.map(processLine);
	const outputPath = join(config.outputDir, filename);
	await writeFile(outputPath, processed.join('\\n'));
	if (config.verbose) {
		console.log(\`Processed \${filename}\`);
	}
}

async function main() {
	const config = loadConfig();
	const files = ['a.txt', 'b.txt', 'c.txt'];
	for (const file of files) {
		await processFile(config, file);
	}
}

main();
`;
const HINTS_CODE = `function greet(name: string): string {
	return "Hello, " + name
}

greet("World");
`;
async function renderHintsToolbar(options) {
  const { container, disposableStore, theme } = options;
  container.style.width = "500px";
  container.style.height = "180px";
  container.style.border = "1px solid var(--vscode-editorWidget-border)";
  const instantiationService = createEditorServices(disposableStore, {
    colorTheme: theme,
    additionalServices: (reg) => {
      registerWorkbenchServices(reg);
      if (options.simulateHover) {
        reg.defineInstance(IUserInteractionService, new MockUserInteractionService(true, true));
      }
    }
  });
  const textModel = disposableStore.add(createTextModel(
    instantiationService,
    HINTS_CODE,
    URI.parse("inmemory://hints-toolbar.ts"),
    "typescript"
  ));
  const languageFeaturesService = instantiationService.get(ILanguageFeaturesService);
  disposableStore.add(languageFeaturesService.inlineCompletionsProvider.register({ pattern: "**" }, {
    provideInlineCompletions: () => ({
      items: [{
        insertText: ' + "!";',
        range: new Range(2, 28, 2, 28)
      }]
    }),
    disposeInlineCompletions: () => {
    }
  }));
  const editor = disposableStore.add(instantiationService.createInstance(
    CodeEditorWidget,
    container,
    {
      automaticLayout: true,
      minimap: { enabled: false },
      lineNumbers: "on",
      scrollBeyondLastLine: false,
      fontSize: 14,
      cursorBlinking: "solid",
      inlineSuggest: { showToolbar: "always" }
    },
    { contributions: EditorExtensionsRegistry.getEditorContributions() }
  ));
  editor.setModel(textModel);
  editor.setPosition({ lineNumber: 2, column: 28 });
  editor.focus();
  const controller = InlineCompletionsController.get(editor);
  controller?.model?.get()?.triggerExplicitly();
  await new Promise((resolve) => setTimeout(resolve, 100));
}
function renderJumpToHint({ container, disposableStore, theme }) {
  container.style.width = "500px";
  container.style.height = "200px";
  container.style.border = "1px solid var(--vscode-editorWidget-border)";
  const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });
  const textModel = disposableStore.add(createTextModel(
    instantiationService,
    SAMPLE_CODE,
    URI.parse("inmemory://jump-to-hint.ts"),
    "typescript"
  ));
  const editor = disposableStore.add(instantiationService.createInstance(
    CodeEditorWidget,
    container,
    {
      automaticLayout: true,
      minimap: { enabled: false },
      lineNumbers: "on",
      scrollBeyondLastLine: false,
      fontSize: 14,
      cursorBlinking: "solid"
    },
    { contributions: [] }
  ));
  editor.setModel(textModel);
  editor.setPosition({ lineNumber: 1, column: 1 });
  editor.focus();
  const editorObs = observableCodeEditor(editor);
  disposableStore.add(instantiationService.createInstance(
    JumpToView,
    editorObs,
    { style: "label" },
    constObservable({ jumpToPosition: new Position(6, 18) })
  ));
}
function createLongDistanceEditor(options) {
  const { container, disposableStore, theme } = options;
  container.style.width = "600px";
  container.style.height = "500px";
  container.style.border = "1px solid var(--vscode-editorWidget-border)";
  const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });
  const textModel = disposableStore.add(createTextModel(
    instantiationService,
    options.code,
    URI.parse("inmemory://long-distance.ts"),
    "typescript"
  ));
  instantiationService.stubInstance(InlineCompletionsSource, {
    cancelUpdate: () => {
    },
    clear: () => {
    },
    clearOperationOnTextModelChange: constObservable(void 0),
    clearSuggestWidgetInlineCompletions: () => {
    },
    dispose: () => {
    },
    fetch: async () => true,
    inlineCompletions: constObservable(disposableStore.add(new InlineCompletionsState([
      InlineEditItem.createForTest(
        TextModelValueReference.snapshot(textModel),
        new Range(
          options.editRange.startLineNumber,
          options.editRange.startColumn,
          options.editRange.endLineNumber,
          options.editRange.endColumn
        ),
        options.newText
      )
    ], void 0))),
    loading: constObservable(false),
    seedInlineCompletionsWithSuggestWidget: () => {
    },
    seedWithCompletion: () => {
    },
    suggestWidgetInlineCompletions: constObservable(disposableStore.add(InlineCompletionsState.createEmpty()))
  });
  const editorWidgetOptions = {
    contributions: EditorExtensionsRegistry.getEditorContributions()
  };
  const editor = disposableStore.add(instantiationService.createInstance(
    CodeEditorWidget,
    container,
    {
      automaticLayout: true,
      minimap: { enabled: false },
      lineNumbers: "on",
      scrollBeyondLastLine: false,
      fontSize: 14,
      cursorBlinking: "solid",
      inlineSuggest: {
        edits: { showLongDistanceHint: true }
      },
      ...options.editorOptions
    },
    editorWidgetOptions
  ));
  editor.setModel(textModel);
  editor.setPosition({ lineNumber: options.cursorLine, column: 1 });
  editor.focus();
  const controller = InlineCompletionsController.get(editor);
  controller?.model?.get();
}
function renderNextFileEdit({ container, disposableStore, theme }) {
  container.style.width = "500px";
  container.style.height = "200px";
  container.style.border = "1px solid var(--vscode-editorWidget-border)";
  const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });
  const editorModel = disposableStore.add(createTextModel(
    instantiationService,
    `import { Config } from './config';

export function createApp(config: Config) {
	const app = express();
	app.listen(config.port);
}`,
    URI.parse("inmemory://app.ts"),
    "typescript"
  ));
  const targetModel = disposableStore.add(createTextModel(
    instantiationService,
    `export interface Config {
	port: number;
	host: string;
}`,
    URI.parse("inmemory://config.ts"),
    "typescript"
  ));
  instantiationService.stubInstance(InlineCompletionsSource, {
    cancelUpdate: () => {
    },
    clear: () => {
    },
    clearOperationOnTextModelChange: constObservable(void 0),
    clearSuggestWidgetInlineCompletions: () => {
    },
    dispose: () => {
    },
    fetch: async () => true,
    inlineCompletions: constObservable(disposableStore.add(new InlineCompletionsState([
      InlineEditItem.createForTest(
        TextModelValueReference.snapshot(targetModel),
        new Range(1, 1, 3, 100),
        `export interface Config {
	port: number;
	host: string;
	debug: boolean;
}`
      )
    ], void 0))),
    loading: constObservable(false),
    seedInlineCompletionsWithSuggestWidget: () => {
    },
    seedWithCompletion: () => {
    },
    suggestWidgetInlineCompletions: constObservable(disposableStore.add(InlineCompletionsState.createEmpty()))
  });
  const editor = disposableStore.add(instantiationService.createInstance(
    CodeEditorWidget,
    container,
    {
      automaticLayout: true,
      minimap: { enabled: false },
      lineNumbers: "on",
      scrollBeyondLastLine: false,
      fontSize: 14,
      cursorBlinking: "solid"
    },
    { contributions: EditorExtensionsRegistry.getEditorContributions() }
  ));
  editor.setModel(editorModel);
  editor.setPosition({ lineNumber: 3, column: 1 });
  editor.focus();
  const controller = InlineCompletionsController.get(editor);
  controller?.model?.get();
}
function renderGutterMenu({ container, disposableStore, theme }) {
  container.style.width = "250px";
  container.style.height = "280px";
  const instantiationService = createEditorServices(disposableStore, {
    colorTheme: theme,
    additionalServices: (reg) => {
      registerWorkbenchServices(reg);
    }
  });
  const textModel = disposableStore.add(createTextModel(
    instantiationService,
    "const x = 1;",
    URI.parse("inmemory://gutter-menu.ts"),
    "typescript"
  ));
  const editor = disposableStore.add(instantiationService.createInstance(
    CodeEditorWidget,
    document.createElement("div"),
    { minimap: { enabled: false } },
    { contributions: [] }
  ));
  editor.setModel(textModel);
  const editorObs = observableCodeEditor(editor);
  const menuData = new InlineSuggestionGutterMenuData(
    void 0,
    "Copilot",
    [],
    void 0,
    void 0,
    void 0
  );
  const content = disposableStore.add(
    instantiationService.createInstance(
      GutterIndicatorMenuContent,
      editorObs,
      menuData,
      () => {
      }
    ).toDisposableLiveElement()
  );
  container.style.background = "var(--vscode-editorHoverWidget-background)";
  container.style.border = "2px solid var(--vscode-editorHoverWidget-border)";
  container.style.borderRadius = "3px";
  container.style.color = "var(--vscode-editorHoverWidget-foreground)";
  container.appendChild(content.element);
}
var other_fixture_default = defineThemedFixtureGroup({ path: "editor/inlineCompletions/" }, {
  HintsToolbar: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderHintsToolbar(context)
  }),
  HintsToolbarHovered: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderHintsToolbar({ ...context, simulateHover: true })
  }),
  JumpToHint: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: renderJumpToHint
  }),
  LongDistanceHint: defineComponentFixture({
    labels: { kind: "screenshot", flaky: true },
    render: (context) => createLongDistanceEditor({
      ...context,
      code: LONG_DISTANCE_CODE,
      cursorLine: 1,
      editRange: { startLineNumber: 28, startColumn: 1, endLineNumber: 35, endColumn: 100 },
      newText: `async function processFile(config: Config, filename: string): Promise<void> {
	const inputPath = join(config.inputDir, filename);
	const outputPath = join(config.outputDir, filename);
	const data = await readFile(inputPath, 'utf8');
	if (!validateInput(data)) {
		throw new Error(\`Invalid input in \${filename}\`);
	}
	const processed = data.split('\\n').map(processLine).join('\\n');
	await writeFile(outputPath, processed);`
    })
  }),
  NextFileEditSuggestion: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderNextFileEdit(context)
  }),
  GutterMenu: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: renderGutterMenu
  })
});
export {
  other_fixture_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHRlc3RcXGJyb3dzZXJcXGNvbXBvbmVudEZpeHR1cmVzXFxlZGl0b3JcXGlubGluZUNvbXBsZXRpb25zXFxvdGhlci5maXh0dXJlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlLCBJT2JzZXJ2YWJsZVdpdGhDaGFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBDb21wb25lbnRGaXh0dXJlQ29udGV4dCwgY3JlYXRlRWRpdG9yU2VydmljZXMsIGNyZWF0ZVRleHRNb2RlbCwgZGVmaW5lQ29tcG9uZW50Rml4dHVyZSwgZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwLCByZWdpc3RlcldvcmtiZW5jaFNlcnZpY2VzIH0gZnJvbSAnLi4vLi4vZml4dHVyZVV0aWxzLmpzJztcbmltcG9ydCB7IEVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgQ29kZUVkaXRvcldpZGdldCwgSUNvZGVFZGl0b3JXaWRnZXRPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvY29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL29ic2VydmFibGVDb2RlRWRpdG9yLmpzJztcbmltcG9ydCB7IElFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgSW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvaW5saW5lQ29tcGxldGlvbnMvYnJvd3Nlci9jb250cm9sbGVyL2lubGluZUNvbXBsZXRpb25zQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvaW5saW5lQ29tcGxldGlvbnMuY29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IElubGluZUNvbXBsZXRpb25zU291cmNlLCBJbmxpbmVDb21wbGV0aW9uc1N0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvaW5saW5lQ29tcGxldGlvbnMvYnJvd3Nlci9tb2RlbC9pbmxpbmVDb21wbGV0aW9uc1NvdXJjZS5qcyc7XG5pbXBvcnQgeyBJbmxpbmVFZGl0SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvbW9kZWwvaW5saW5lU3VnZ2VzdGlvbkl0ZW0uanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsVmFsdWVSZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9pbmxpbmVDb21wbGV0aW9ucy9icm93c2VyL21vZGVsL3RleHRNb2RlbFZhbHVlUmVmZXJlbmNlLmpzJztcbmltcG9ydCB7IEp1bXBUb1ZpZXcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9pbmxpbmVDb21wbGV0aW9ucy9icm93c2VyL3ZpZXcvaW5saW5lRWRpdHMvaW5saW5lRWRpdHNWaWV3cy9qdW1wVG9WaWV3LmpzJztcbmltcG9ydCB7IEd1dHRlckluZGljYXRvck1lbnVDb250ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvaW5saW5lQ29tcGxldGlvbnMvYnJvd3Nlci92aWV3L2lubGluZUVkaXRzL2NvbXBvbmVudHMvZ3V0dGVySW5kaWNhdG9yTWVudS5qcyc7XG5pbXBvcnQgeyBJbmxpbmVTdWdnZXN0aW9uR3V0dGVyTWVudURhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9pbmxpbmVDb21wbGV0aW9ucy9icm93c2VyL3ZpZXcvaW5saW5lRWRpdHMvY29tcG9uZW50cy9ndXR0ZXJJbmRpY2F0b3JWaWV3LmpzJztcbmltcG9ydCB7IElVc2VySW50ZXJhY3Rpb25TZXJ2aWNlLCBNb2NrVXNlckludGVyYWN0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJJbnRlcmFjdGlvbi9icm93c2VyL3VzZXJJbnRlcmFjdGlvblNlcnZpY2UuanMnO1xuXG5pbXBvcnQgJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvaGludHNXaWRnZXQvaW5saW5lQ29tcGxldGlvbnNIaW50c1dpZGdldC5jc3MnO1xuaW1wb3J0ICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9pbmxpbmVDb21wbGV0aW9ucy9icm93c2VyL3ZpZXcvaW5saW5lRWRpdHMvdmlldy5jc3MnO1xuaW1wb3J0ICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvY29kaWNvbnMvY29kaWNvblN0eWxlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuXG5jb25zdCBTQU1QTEVfQ09ERSA9IGBmdW5jdGlvbiBmaWJvbmFjY2kobjogbnVtYmVyKTogbnVtYmVyIHtcblx0aWYgKG4gPD0gMSkgcmV0dXJuIG47XG5cdHJldHVybiBmaWJvbmFjY2kobiAtIDEpICsgZmlib25hY2NpKG4gLSAyKTtcbn1cblxuY29uc3QgcmVzdWx0ID0gZmlib25hY2NpKDEwKTtcbmNvbnNvbGUubG9nKHJlc3VsdCk7XG5gO1xuXG5jb25zdCBMT05HX0RJU1RBTkNFX0NPREUgPSBgaW1wb3J0IHsgcmVhZEZpbGUsIHdyaXRlRmlsZSB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICdwYXRoJztcblxuaW50ZXJmYWNlIENvbmZpZyB7XG5cdGlucHV0RGlyOiBzdHJpbmc7XG5cdG91dHB1dERpcjogc3RyaW5nO1xuXHR2ZXJib3NlOiBib29sZWFuO1xufVxuXG5mdW5jdGlvbiBsb2FkQ29uZmlnKCk6IENvbmZpZyB7XG5cdHJldHVybiB7XG5cdFx0aW5wdXREaXI6ICcuL2lucHV0Jyxcblx0XHRvdXRwdXREaXI6ICcuL291dHB1dCcsXG5cdFx0dmVyYm9zZTogZmFsc2UsXG5cdH07XG59XG5cbmZ1bmN0aW9uIHByb2Nlc3NMaW5lKGxpbmU6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBsaW5lLnRyaW0oKS50b1VwcGVyQ2FzZSgpO1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZUlucHV0KGRhdGE6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gZGF0YS5sZW5ndGggPiAwICYmIGRhdGEubGVuZ3RoIDwgMTAwMDA7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHByb2Nlc3NGaWxlKGNvbmZpZzogQ29uZmlnLCBmaWxlbmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdGNvbnN0IGlucHV0UGF0aCA9IGpvaW4oY29uZmlnLmlucHV0RGlyLCBmaWxlbmFtZSk7XG5cdGNvbnN0IGRhdGEgPSBhd2FpdCByZWFkRmlsZShpbnB1dFBhdGgsICd1dGY4Jyk7XG5cdGlmICghdmFsaWRhdGVJbnB1dChkYXRhKSkge1xuXHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBpbnB1dCcpO1xuXHR9XG5cdGNvbnN0IGxpbmVzID0gZGF0YS5zcGxpdCgnXFxcXG4nKTtcblx0Y29uc3QgcHJvY2Vzc2VkID0gbGluZXMubWFwKHByb2Nlc3NMaW5lKTtcblx0Y29uc3Qgb3V0cHV0UGF0aCA9IGpvaW4oY29uZmlnLm91dHB1dERpciwgZmlsZW5hbWUpO1xuXHRhd2FpdCB3cml0ZUZpbGUob3V0cHV0UGF0aCwgcHJvY2Vzc2VkLmpvaW4oJ1xcXFxuJykpO1xuXHRpZiAoY29uZmlnLnZlcmJvc2UpIHtcblx0XHRjb25zb2xlLmxvZyhcXGBQcm9jZXNzZWQgXFwke2ZpbGVuYW1lfVxcYCk7XG5cdH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gbWFpbigpIHtcblx0Y29uc3QgY29uZmlnID0gbG9hZENvbmZpZygpO1xuXHRjb25zdCBmaWxlcyA9IFsnYS50eHQnLCAnYi50eHQnLCAnYy50eHQnXTtcblx0Zm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XG5cdFx0YXdhaXQgcHJvY2Vzc0ZpbGUoY29uZmlnLCBmaWxlKTtcblx0fVxufVxuXG5tYWluKCk7XG5gO1xuXG5pbnRlcmZhY2UgSGludHNUb29sYmFyT3B0aW9ucyBleHRlbmRzIENvbXBvbmVudEZpeHR1cmVDb250ZXh0IHtcblx0c2ltdWxhdGVIb3Zlcj86IGJvb2xlYW47XG59XG5cbmNvbnN0IEhJTlRTX0NPREUgPSBgZnVuY3Rpb24gZ3JlZXQobmFtZTogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIFwiSGVsbG8sIFwiICsgbmFtZVxufVxuXG5ncmVldChcIldvcmxkXCIpO1xuYDtcblxuYXN5bmMgZnVuY3Rpb24gcmVuZGVySGludHNUb29sYmFyKG9wdGlvbnM6IEhpbnRzVG9vbGJhck9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0Y29uc3QgeyBjb250YWluZXIsIGRpc3Bvc2FibGVTdG9yZSwgdGhlbWUgfSA9IG9wdGlvbnM7XG5cdGNvbnRhaW5lci5zdHlsZS53aWR0aCA9ICc1MDBweCc7XG5cdGNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSAnMTgwcHgnO1xuXHRjb250YWluZXIuc3R5bGUuYm9yZGVyID0gJzFweCBzb2xpZCB2YXIoLS12c2NvZGUtZWRpdG9yV2lkZ2V0LWJvcmRlciknO1xuXG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlRWRpdG9yU2VydmljZXMoZGlzcG9zYWJsZVN0b3JlLCB7XG5cdFx0Y29sb3JUaGVtZTogdGhlbWUsXG5cdFx0YWRkaXRpb25hbFNlcnZpY2VzOiAocmVnKSA9PiB7XG5cdFx0XHRyZWdpc3RlcldvcmtiZW5jaFNlcnZpY2VzKHJlZyk7XG5cdFx0XHRpZiAob3B0aW9ucy5zaW11bGF0ZUhvdmVyKSB7XG5cdFx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJVXNlckludGVyYWN0aW9uU2VydmljZSwgbmV3IE1vY2tVc2VySW50ZXJhY3Rpb25TZXJ2aWNlKHRydWUsIHRydWUpKTtcblx0XHRcdH1cblx0XHR9LFxuXHR9KTtcblxuXHRjb25zdCB0ZXh0TW9kZWwgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGNyZWF0ZVRleHRNb2RlbChcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRISU5UU19DT0RFLFxuXHRcdFVSSS5wYXJzZSgnaW5tZW1vcnk6Ly9oaW50cy10b29sYmFyLnRzJyksXG5cdFx0J3R5cGVzY3JpcHQnXG5cdCkpO1xuXG5cdC8vIFJlZ2lzdGVyIGFuIGlubGluZSBjb21wbGV0aW9uIHByb3ZpZGVyIChub3QgYW4gaW5saW5lIGVkaXQpIHNvIHRoZSByZXN1bHQgaXMgZ2hvc3QgdGV4dFxuXHRjb25zdCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRkaXNwb3NhYmxlU3RvcmUuYWRkKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmlubGluZUNvbXBsZXRpb25zUHJvdmlkZXIucmVnaXN0ZXIoeyBwYXR0ZXJuOiAnKionIH0sIHtcblx0XHRwcm92aWRlSW5saW5lQ29tcGxldGlvbnM6ICgpID0+ICh7XG5cdFx0XHRpdGVtczogW3tcblx0XHRcdFx0aW5zZXJ0VGV4dDogJyArIFwiIVwiOycsXG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMiwgMjgsIDIsIDI4KSxcblx0XHRcdH1dLFxuXHRcdH0pLFxuXHRcdGRpc3Bvc2VJbmxpbmVDb21wbGV0aW9uczogKCkgPT4geyB9LFxuXHR9KSk7XG5cblx0Y29uc3QgZWRpdG9yID0gZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRDb2RlRWRpdG9yV2lkZ2V0LFxuXHRcdGNvbnRhaW5lcixcblx0XHR7XG5cdFx0XHRhdXRvbWF0aWNMYXlvdXQ6IHRydWUsXG5cdFx0XHRtaW5pbWFwOiB7IGVuYWJsZWQ6IGZhbHNlIH0sXG5cdFx0XHRsaW5lTnVtYmVyczogJ29uJyxcblx0XHRcdHNjcm9sbEJleW9uZExhc3RMaW5lOiBmYWxzZSxcblx0XHRcdGZvbnRTaXplOiAxNCxcblx0XHRcdGN1cnNvckJsaW5raW5nOiAnc29saWQnLFxuXHRcdFx0aW5saW5lU3VnZ2VzdDogeyBzaG93VG9vbGJhcjogJ2Fsd2F5cycgfSxcblx0XHR9LFxuXHRcdHsgY29udHJpYnV0aW9uczogRWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5LmdldEVkaXRvckNvbnRyaWJ1dGlvbnMoKSB9IHNhdGlzZmllcyBJQ29kZUVkaXRvcldpZGdldE9wdGlvbnNcblx0KSk7XG5cblx0ZWRpdG9yLnNldE1vZGVsKHRleHRNb2RlbCk7XG5cdGVkaXRvci5zZXRQb3NpdGlvbih7IGxpbmVOdW1iZXI6IDIsIGNvbHVtbjogMjggfSk7XG5cdGVkaXRvci5mb2N1cygpO1xuXG5cdGNvbnN0IGNvbnRyb2xsZXIgPSBJbmxpbmVDb21wbGV0aW9uc0NvbnRyb2xsZXIuZ2V0KGVkaXRvcik7XG5cdGNvbnRyb2xsZXI/Lm1vZGVsPy5nZXQoKT8udHJpZ2dlckV4cGxpY2l0bHkoKTtcblxuXHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTAwKSk7XG59XG5cbmZ1bmN0aW9uIHJlbmRlckp1bXBUb0hpbnQoeyBjb250YWluZXIsIGRpc3Bvc2FibGVTdG9yZSwgdGhlbWUgfTogQ29tcG9uZW50Rml4dHVyZUNvbnRleHQpOiB2b2lkIHtcblx0Y29udGFpbmVyLnN0eWxlLndpZHRoID0gJzUwMHB4Jztcblx0Y29udGFpbmVyLnN0eWxlLmhlaWdodCA9ICcyMDBweCc7XG5cdGNvbnRhaW5lci5zdHlsZS5ib3JkZXIgPSAnMXB4IHNvbGlkIHZhcigtLXZzY29kZS1lZGl0b3JXaWRnZXQtYm9yZGVyKSc7XG5cblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVFZGl0b3JTZXJ2aWNlcyhkaXNwb3NhYmxlU3RvcmUsIHsgY29sb3JUaGVtZTogdGhlbWUgfSk7XG5cblx0Y29uc3QgdGV4dE1vZGVsID0gZGlzcG9zYWJsZVN0b3JlLmFkZChjcmVhdGVUZXh0TW9kZWwoXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0U0FNUExFX0NPREUsXG5cdFx0VVJJLnBhcnNlKCdpbm1lbW9yeTovL2p1bXAtdG8taGludC50cycpLFxuXHRcdCd0eXBlc2NyaXB0J1xuXHQpKTtcblxuXHRjb25zdCBlZGl0b3IgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdENvZGVFZGl0b3JXaWRnZXQsXG5cdFx0Y29udGFpbmVyLFxuXHRcdHtcblx0XHRcdGF1dG9tYXRpY0xheW91dDogdHJ1ZSxcblx0XHRcdG1pbmltYXA6IHsgZW5hYmxlZDogZmFsc2UgfSxcblx0XHRcdGxpbmVOdW1iZXJzOiAnb24nLFxuXHRcdFx0c2Nyb2xsQmV5b25kTGFzdExpbmU6IGZhbHNlLFxuXHRcdFx0Zm9udFNpemU6IDE0LFxuXHRcdFx0Y3Vyc29yQmxpbmtpbmc6ICdzb2xpZCcsXG5cdFx0fSxcblx0XHR7IGNvbnRyaWJ1dGlvbnM6IFtdIH0gc2F0aXNmaWVzIElDb2RlRWRpdG9yV2lkZ2V0T3B0aW9uc1xuXHQpKTtcblxuXHRlZGl0b3Iuc2V0TW9kZWwodGV4dE1vZGVsKTtcblx0ZWRpdG9yLnNldFBvc2l0aW9uKHsgbGluZU51bWJlcjogMSwgY29sdW1uOiAxIH0pO1xuXHRlZGl0b3IuZm9jdXMoKTtcblxuXHRjb25zdCBlZGl0b3JPYnMgPSBvYnNlcnZhYmxlQ29kZUVkaXRvcihlZGl0b3IpO1xuXHRkaXNwb3NhYmxlU3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdEp1bXBUb1ZpZXcsXG5cdFx0ZWRpdG9yT2JzLFxuXHRcdHsgc3R5bGU6ICdsYWJlbCcgfSxcblx0XHRjb25zdE9ic2VydmFibGUoeyBqdW1wVG9Qb3NpdGlvbjogbmV3IFBvc2l0aW9uKDYsIDE4KSB9KSxcblx0KSk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUxvbmdEaXN0YW5jZUVkaXRvcihvcHRpb25zOiB7XG5cdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdGRpc3Bvc2FibGVTdG9yZTogRGlzcG9zYWJsZVN0b3JlO1xuXHR0aGVtZTogQ29tcG9uZW50Rml4dHVyZUNvbnRleHRbJ3RoZW1lJ107XG5cdGNvZGU6IHN0cmluZztcblx0Y3Vyc29yTGluZTogbnVtYmVyO1xuXHRlZGl0UmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiBudW1iZXI7IHN0YXJ0Q29sdW1uOiBudW1iZXI7IGVuZExpbmVOdW1iZXI6IG51bWJlcjsgZW5kQ29sdW1uOiBudW1iZXIgfTtcblx0bmV3VGV4dDogc3RyaW5nO1xuXHRlZGl0b3JPcHRpb25zPzogSUVkaXRvck9wdGlvbnM7XG59KTogdm9pZCB7XG5cdGNvbnN0IHsgY29udGFpbmVyLCBkaXNwb3NhYmxlU3RvcmUsIHRoZW1lIH0gPSBvcHRpb25zO1xuXHRjb250YWluZXIuc3R5bGUud2lkdGggPSAnNjAwcHgnO1xuXHRjb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gJzUwMHB4Jztcblx0Y29udGFpbmVyLnN0eWxlLmJvcmRlciA9ICcxcHggc29saWQgdmFyKC0tdnNjb2RlLWVkaXRvcldpZGdldC1ib3JkZXIpJztcblxuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZUVkaXRvclNlcnZpY2VzKGRpc3Bvc2FibGVTdG9yZSwgeyBjb2xvclRoZW1lOiB0aGVtZSB9KTtcblxuXHRjb25zdCB0ZXh0TW9kZWwgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGNyZWF0ZVRleHRNb2RlbChcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRvcHRpb25zLmNvZGUsXG5cdFx0VVJJLnBhcnNlKCdpbm1lbW9yeTovL2xvbmctZGlzdGFuY2UudHMnKSxcblx0XHQndHlwZXNjcmlwdCdcblx0KSk7XG5cblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1Ykluc3RhbmNlKElubGluZUNvbXBsZXRpb25zU291cmNlLCB7XG5cdFx0Y2FuY2VsVXBkYXRlOiAoKSA9PiB7IH0sXG5cdFx0Y2xlYXI6ICgpID0+IHsgfSxcblx0XHRjbGVhck9wZXJhdGlvbk9uVGV4dE1vZGVsQ2hhbmdlOiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSBhcyBJT2JzZXJ2YWJsZVdpdGhDaGFuZ2U8dW5kZWZpbmVkLCB2b2lkPixcblx0XHRjbGVhclN1Z2dlc3RXaWRnZXRJbmxpbmVDb21wbGV0aW9uczogKCkgPT4geyB9LFxuXHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHRmZXRjaDogYXN5bmMgKCkgPT4gdHJ1ZSxcblx0XHRpbmxpbmVDb21wbGV0aW9uczogY29uc3RPYnNlcnZhYmxlKGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IElubGluZUNvbXBsZXRpb25zU3RhdGUoW1xuXHRcdFx0SW5saW5lRWRpdEl0ZW0uY3JlYXRlRm9yVGVzdChcblx0XHRcdFx0VGV4dE1vZGVsVmFsdWVSZWZlcmVuY2Uuc25hcHNob3QodGV4dE1vZGVsKSxcblx0XHRcdFx0bmV3IFJhbmdlKFxuXHRcdFx0XHRcdG9wdGlvbnMuZWRpdFJhbmdlLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0XHRvcHRpb25zLmVkaXRSYW5nZS5zdGFydENvbHVtbixcblx0XHRcdFx0XHRvcHRpb25zLmVkaXRSYW5nZS5lbmRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdG9wdGlvbnMuZWRpdFJhbmdlLmVuZENvbHVtblxuXHRcdFx0XHQpLFxuXHRcdFx0XHRvcHRpb25zLm5ld1RleHRcblx0XHRcdClcblx0XHRdLCB1bmRlZmluZWQpKSksXG5cdFx0bG9hZGluZzogY29uc3RPYnNlcnZhYmxlKGZhbHNlKSxcblx0XHRzZWVkSW5saW5lQ29tcGxldGlvbnNXaXRoU3VnZ2VzdFdpZGdldDogKCkgPT4geyB9LFxuXHRcdHNlZWRXaXRoQ29tcGxldGlvbjogKCkgPT4geyB9LFxuXHRcdHN1Z2dlc3RXaWRnZXRJbmxpbmVDb21wbGV0aW9uczogY29uc3RPYnNlcnZhYmxlKGRpc3Bvc2FibGVTdG9yZS5hZGQoSW5saW5lQ29tcGxldGlvbnNTdGF0ZS5jcmVhdGVFbXB0eSgpKSksXG5cdH0pO1xuXG5cdGNvbnN0IGVkaXRvcldpZGdldE9wdGlvbnM6IElDb2RlRWRpdG9yV2lkZ2V0T3B0aW9ucyA9IHtcblx0XHRjb250cmlidXRpb25zOiBFZGl0b3JFeHRlbnNpb25zUmVnaXN0cnkuZ2V0RWRpdG9yQ29udHJpYnV0aW9ucygpXG5cdH07XG5cblx0Y29uc3QgZWRpdG9yID0gZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRDb2RlRWRpdG9yV2lkZ2V0LFxuXHRcdGNvbnRhaW5lcixcblx0XHR7XG5cdFx0XHRhdXRvbWF0aWNMYXlvdXQ6IHRydWUsXG5cdFx0XHRtaW5pbWFwOiB7IGVuYWJsZWQ6IGZhbHNlIH0sXG5cdFx0XHRsaW5lTnVtYmVyczogJ29uJyxcblx0XHRcdHNjcm9sbEJleW9uZExhc3RMaW5lOiBmYWxzZSxcblx0XHRcdGZvbnRTaXplOiAxNCxcblx0XHRcdGN1cnNvckJsaW5raW5nOiAnc29saWQnLFxuXHRcdFx0aW5saW5lU3VnZ2VzdDoge1xuXHRcdFx0XHRlZGl0czogeyBzaG93TG9uZ0Rpc3RhbmNlSGludDogdHJ1ZSB9LFxuXHRcdFx0fSxcblx0XHRcdC4uLm9wdGlvbnMuZWRpdG9yT3B0aW9ucyxcblx0XHR9LFxuXHRcdGVkaXRvcldpZGdldE9wdGlvbnNcblx0KSk7XG5cblx0ZWRpdG9yLnNldE1vZGVsKHRleHRNb2RlbCk7XG5cdGVkaXRvci5zZXRQb3NpdGlvbih7IGxpbmVOdW1iZXI6IG9wdGlvbnMuY3Vyc29yTGluZSwgY29sdW1uOiAxIH0pO1xuXHRlZGl0b3IuZm9jdXMoKTtcblxuXHRjb25zdCBjb250cm9sbGVyID0gSW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyLmdldChlZGl0b3IpO1xuXHRjb250cm9sbGVyPy5tb2RlbD8uZ2V0KCk7XG59XG5cbmZ1bmN0aW9uIHJlbmRlck5leHRGaWxlRWRpdCh7IGNvbnRhaW5lciwgZGlzcG9zYWJsZVN0b3JlLCB0aGVtZSB9OiBDb21wb25lbnRGaXh0dXJlQ29udGV4dCk6IHZvaWQge1xuXHRjb250YWluZXIuc3R5bGUud2lkdGggPSAnNTAwcHgnO1xuXHRjb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gJzIwMHB4Jztcblx0Y29udGFpbmVyLnN0eWxlLmJvcmRlciA9ICcxcHggc29saWQgdmFyKC0tdnNjb2RlLWVkaXRvcldpZGdldC1ib3JkZXIpJztcblxuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZUVkaXRvclNlcnZpY2VzKGRpc3Bvc2FibGVTdG9yZSwgeyBjb2xvclRoZW1lOiB0aGVtZSB9KTtcblxuXHQvLyBUaGUgZWRpdG9yIHNob3dzIHRoaXMgZmlsZVxuXHRjb25zdCBlZGl0b3JNb2RlbCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoY3JlYXRlVGV4dE1vZGVsKFxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdGBpbXBvcnQgeyBDb25maWcgfSBmcm9tICcuL2NvbmZpZyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVBcHAoY29uZmlnOiBDb25maWcpIHtcblx0Y29uc3QgYXBwID0gZXhwcmVzcygpO1xuXHRhcHAubGlzdGVuKGNvbmZpZy5wb3J0KTtcbn1gLFxuXHRcdFVSSS5wYXJzZSgnaW5tZW1vcnk6Ly9hcHAudHMnKSxcblx0XHQndHlwZXNjcmlwdCdcblx0KSk7XG5cblx0Ly8gVGhlIHN1Z2dlc3Rpb24gdGFyZ2V0cyBhIGRpZmZlcmVudCBmaWxlXG5cdGNvbnN0IHRhcmdldE1vZGVsID0gZGlzcG9zYWJsZVN0b3JlLmFkZChjcmVhdGVUZXh0TW9kZWwoXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0YGV4cG9ydCBpbnRlcmZhY2UgQ29uZmlnIHtcblx0cG9ydDogbnVtYmVyO1xuXHRob3N0OiBzdHJpbmc7XG59YCxcblx0XHRVUkkucGFyc2UoJ2lubWVtb3J5Oi8vY29uZmlnLnRzJyksXG5cdFx0J3R5cGVzY3JpcHQnXG5cdCkpO1xuXG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWJJbnN0YW5jZShJbmxpbmVDb21wbGV0aW9uc1NvdXJjZSwge1xuXHRcdGNhbmNlbFVwZGF0ZTogKCkgPT4geyB9LFxuXHRcdGNsZWFyOiAoKSA9PiB7IH0sXG5cdFx0Y2xlYXJPcGVyYXRpb25PblRleHRNb2RlbENoYW5nZTogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCkgYXMgSU9ic2VydmFibGVXaXRoQ2hhbmdlPHVuZGVmaW5lZCwgdm9pZD4sXG5cdFx0Y2xlYXJTdWdnZXN0V2lkZ2V0SW5saW5lQ29tcGxldGlvbnM6ICgpID0+IHsgfSxcblx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0ZmV0Y2g6IGFzeW5jICgpID0+IHRydWUsXG5cdFx0aW5saW5lQ29tcGxldGlvbnM6IGNvbnN0T2JzZXJ2YWJsZShkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBJbmxpbmVDb21wbGV0aW9uc1N0YXRlKFtcblx0XHRcdElubGluZUVkaXRJdGVtLmNyZWF0ZUZvclRlc3QoXG5cdFx0XHRcdFRleHRNb2RlbFZhbHVlUmVmZXJlbmNlLnNuYXBzaG90KHRhcmdldE1vZGVsKSxcblx0XHRcdFx0bmV3IFJhbmdlKDEsIDEsIDMsIDEwMCksXG5cdFx0XHRcdGBleHBvcnQgaW50ZXJmYWNlIENvbmZpZyB7XFxuXFx0cG9ydDogbnVtYmVyO1xcblxcdGhvc3Q6IHN0cmluZztcXG5cXHRkZWJ1ZzogYm9vbGVhbjtcXG59YFxuXHRcdFx0KVxuXHRcdF0sIHVuZGVmaW5lZCkpKSxcblx0XHRsb2FkaW5nOiBjb25zdE9ic2VydmFibGUoZmFsc2UpLFxuXHRcdHNlZWRJbmxpbmVDb21wbGV0aW9uc1dpdGhTdWdnZXN0V2lkZ2V0OiAoKSA9PiB7IH0sXG5cdFx0c2VlZFdpdGhDb21wbGV0aW9uOiAoKSA9PiB7IH0sXG5cdFx0c3VnZ2VzdFdpZGdldElubGluZUNvbXBsZXRpb25zOiBjb25zdE9ic2VydmFibGUoZGlzcG9zYWJsZVN0b3JlLmFkZChJbmxpbmVDb21wbGV0aW9uc1N0YXRlLmNyZWF0ZUVtcHR5KCkpKSxcblx0fSk7XG5cblx0Y29uc3QgZWRpdG9yID0gZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRDb2RlRWRpdG9yV2lkZ2V0LFxuXHRcdGNvbnRhaW5lcixcblx0XHR7XG5cdFx0XHRhdXRvbWF0aWNMYXlvdXQ6IHRydWUsXG5cdFx0XHRtaW5pbWFwOiB7IGVuYWJsZWQ6IGZhbHNlIH0sXG5cdFx0XHRsaW5lTnVtYmVyczogJ29uJyxcblx0XHRcdHNjcm9sbEJleW9uZExhc3RMaW5lOiBmYWxzZSxcblx0XHRcdGZvbnRTaXplOiAxNCxcblx0XHRcdGN1cnNvckJsaW5raW5nOiAnc29saWQnLFxuXHRcdH0sXG5cdFx0eyBjb250cmlidXRpb25zOiBFZGl0b3JFeHRlbnNpb25zUmVnaXN0cnkuZ2V0RWRpdG9yQ29udHJpYnV0aW9ucygpIH0gc2F0aXNmaWVzIElDb2RlRWRpdG9yV2lkZ2V0T3B0aW9uc1xuXHQpKTtcblxuXHRlZGl0b3Iuc2V0TW9kZWwoZWRpdG9yTW9kZWwpO1xuXHRlZGl0b3Iuc2V0UG9zaXRpb24oeyBsaW5lTnVtYmVyOiAzLCBjb2x1bW46IDEgfSk7XG5cdGVkaXRvci5mb2N1cygpO1xuXG5cdGNvbnN0IGNvbnRyb2xsZXIgPSBJbmxpbmVDb21wbGV0aW9uc0NvbnRyb2xsZXIuZ2V0KGVkaXRvcik7XG5cdGNvbnRyb2xsZXI/Lm1vZGVsPy5nZXQoKTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyR3V0dGVyTWVudSh7IGNvbnRhaW5lciwgZGlzcG9zYWJsZVN0b3JlLCB0aGVtZSB9OiBDb21wb25lbnRGaXh0dXJlQ29udGV4dCk6IHZvaWQge1xuXHRjb250YWluZXIuc3R5bGUud2lkdGggPSAnMjUwcHgnO1xuXHRjb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gJzI4MHB4JztcblxuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZUVkaXRvclNlcnZpY2VzKGRpc3Bvc2FibGVTdG9yZSwge1xuXHRcdGNvbG9yVGhlbWU6IHRoZW1lLFxuXHRcdGFkZGl0aW9uYWxTZXJ2aWNlczogKHJlZykgPT4ge1xuXHRcdFx0cmVnaXN0ZXJXb3JrYmVuY2hTZXJ2aWNlcyhyZWcpO1xuXHRcdH0sXG5cdH0pO1xuXG5cdGNvbnN0IHRleHRNb2RlbCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoY3JlYXRlVGV4dE1vZGVsKFxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdCdjb25zdCB4ID0gMTsnLFxuXHRcdFVSSS5wYXJzZSgnaW5tZW1vcnk6Ly9ndXR0ZXItbWVudS50cycpLFxuXHRcdCd0eXBlc2NyaXB0J1xuXHQpKTtcblxuXHRjb25zdCBlZGl0b3IgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdENvZGVFZGl0b3JXaWRnZXQsXG5cdFx0ZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JyksXG5cdFx0eyBtaW5pbWFwOiB7IGVuYWJsZWQ6IGZhbHNlIH0gfSxcblx0XHR7IGNvbnRyaWJ1dGlvbnM6IFtdIH0gc2F0aXNmaWVzIElDb2RlRWRpdG9yV2lkZ2V0T3B0aW9uc1xuXHQpKTtcblx0ZWRpdG9yLnNldE1vZGVsKHRleHRNb2RlbCk7XG5cblx0Y29uc3QgZWRpdG9yT2JzID0gb2JzZXJ2YWJsZUNvZGVFZGl0b3IoZWRpdG9yKTtcblx0Y29uc3QgbWVudURhdGEgPSBuZXcgSW5saW5lU3VnZ2VzdGlvbkd1dHRlck1lbnVEYXRhKFxuXHRcdHVuZGVmaW5lZCxcblx0XHQnQ29waWxvdCcsXG5cdFx0W10sXG5cdFx0dW5kZWZpbmVkLFxuXHRcdHVuZGVmaW5lZCxcblx0XHR1bmRlZmluZWQsXG5cdCk7XG5cblx0Y29uc3QgY29udGVudCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRHdXR0ZXJJbmRpY2F0b3JNZW51Q29udGVudCxcblx0XHRcdGVkaXRvck9icyxcblx0XHRcdG1lbnVEYXRhLFxuXHRcdFx0KCkgPT4geyB9LFxuXHRcdCkudG9EaXNwb3NhYmxlTGl2ZUVsZW1lbnQoKVxuXHQpO1xuXG5cdGNvbnRhaW5lci5zdHlsZS5iYWNrZ3JvdW5kID0gJ3ZhcigtLXZzY29kZS1lZGl0b3JIb3ZlcldpZGdldC1iYWNrZ3JvdW5kKSc7XG5cdGNvbnRhaW5lci5zdHlsZS5ib3JkZXIgPSAnMnB4IHNvbGlkIHZhcigtLXZzY29kZS1lZGl0b3JIb3ZlcldpZGdldC1ib3JkZXIpJztcblx0Y29udGFpbmVyLnN0eWxlLmJvcmRlclJhZGl1cyA9ICczcHgnO1xuXHRjb250YWluZXIuc3R5bGUuY29sb3IgPSAndmFyKC0tdnNjb2RlLWVkaXRvckhvdmVyV2lkZ2V0LWZvcmVncm91bmQpJztcblx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGNvbnRlbnQuZWxlbWVudCk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZVRoZW1lZEZpeHR1cmVHcm91cCh7IHBhdGg6ICdlZGl0b3IvaW5saW5lQ29tcGxldGlvbnMvJyB9LCB7XG5cdEhpbnRzVG9vbGJhcjogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogKGNvbnRleHQpID0+IHJlbmRlckhpbnRzVG9vbGJhcihjb250ZXh0KSxcblx0fSksXG5cdEhpbnRzVG9vbGJhckhvdmVyZWQ6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IChjb250ZXh0KSA9PiByZW5kZXJIaW50c1Rvb2xiYXIoeyAuLi5jb250ZXh0LCBzaW11bGF0ZUhvdmVyOiB0cnVlIH0pLFxuXHR9KSxcblx0SnVtcFRvSGludDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogcmVuZGVySnVtcFRvSGludCxcblx0fSksXG5cdExvbmdEaXN0YW5jZUhpbnQ6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcsIGZsYWt5OiB0cnVlIH0sXG5cdFx0cmVuZGVyOiAoY29udGV4dCkgPT4gY3JlYXRlTG9uZ0Rpc3RhbmNlRWRpdG9yKHtcblx0XHRcdC4uLmNvbnRleHQsXG5cdFx0XHRjb2RlOiBMT05HX0RJU1RBTkNFX0NPREUsXG5cdFx0XHRjdXJzb3JMaW5lOiAxLFxuXHRcdFx0ZWRpdFJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogMjgsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiAzNSwgZW5kQ29sdW1uOiAxMDAgfSxcblx0XHRcdG5ld1RleHQ6IGBhc3luYyBmdW5jdGlvbiBwcm9jZXNzRmlsZShjb25maWc6IENvbmZpZywgZmlsZW5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBpbnB1dFBhdGggPSBqb2luKGNvbmZpZy5pbnB1dERpciwgZmlsZW5hbWUpO1xuXHRjb25zdCBvdXRwdXRQYXRoID0gam9pbihjb25maWcub3V0cHV0RGlyLCBmaWxlbmFtZSk7XG5cdGNvbnN0IGRhdGEgPSBhd2FpdCByZWFkRmlsZShpbnB1dFBhdGgsICd1dGY4Jyk7XG5cdGlmICghdmFsaWRhdGVJbnB1dChkYXRhKSkge1xuXHRcdHRocm93IG5ldyBFcnJvcihcXGBJbnZhbGlkIGlucHV0IGluIFxcJHtmaWxlbmFtZX1cXGApO1xuXHR9XG5cdGNvbnN0IHByb2Nlc3NlZCA9IGRhdGEuc3BsaXQoJ1xcXFxuJykubWFwKHByb2Nlc3NMaW5lKS5qb2luKCdcXFxcbicpO1xuXHRhd2FpdCB3cml0ZUZpbGUob3V0cHV0UGF0aCwgcHJvY2Vzc2VkKTtgLFxuXHRcdH0pLFxuXHR9KSxcblx0TmV4dEZpbGVFZGl0U3VnZ2VzdGlvbjogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogKGNvbnRleHQpID0+IHJlbmRlck5leHRGaWxlRWRpdChjb250ZXh0KSxcblx0fSksXG5cdEd1dHRlck1lbnU6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IHJlbmRlckd1dHRlck1lbnUsXG5cdH0pLFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHVCQUE4QztBQUN2RCxTQUFTLFdBQVc7QUFDcEIsU0FBa0Msc0JBQXNCLGlCQUFpQix3QkFBd0IsMEJBQTBCLGlDQUFpQztBQUM1SixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHdCQUFrRDtBQUMzRCxTQUFTLDRCQUE0QjtBQUVyQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxtQ0FBbUM7QUFDNUMsT0FBTztBQUNQLFNBQVMseUJBQXlCLDhCQUE4QjtBQUNoRSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLHlCQUF5QixrQ0FBa0M7QUFFcEUsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBR1AsTUFBTSxjQUFjO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFTcEIsTUFBTSxxQkFBcUI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFB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
