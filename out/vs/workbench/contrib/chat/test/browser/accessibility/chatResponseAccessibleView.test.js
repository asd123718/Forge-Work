import assert from "assert";
import { Event } from "../../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
import { ChatResponseAccessibleView, CHAT_ACCESSIBLE_VIEW_INCLUDE_THINKING_STORAGE_KEY, getToolSpecificDataDescription, getResultDetailsDescription, getToolInvocationA11yDescription } from "../../../browser/accessibility/chatResponseAccessibleView.js";
import { IChatWidgetService } from "../../../browser/chat.js";
import { TestStorageService } from "../../../../../test/common/workbenchTestServices.js";
suite("ChatResponseAccessibleView", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  suite("getToolSpecificDataDescription", () => {
    test("returns empty string for undefined", () => {
      assert.strictEqual(getToolSpecificDataDescription(void 0), "");
    });
    test("returns command line for terminal data", () => {
      const terminalData = {
        kind: "terminal",
        commandLine: {
          original: "npm install",
          toolEdited: "npm ci",
          userEdited: "npm install --save-dev"
        },
        language: "bash"
      };
      assert.strictEqual(getToolSpecificDataDescription(terminalData), "npm install --save-dev");
    });
    test("returns tool edited command for terminal data without user edit", () => {
      const terminalData = {
        kind: "terminal",
        commandLine: {
          original: "npm install",
          toolEdited: "npm ci"
        },
        language: "bash"
      };
      assert.strictEqual(getToolSpecificDataDescription(terminalData), "npm ci");
    });
    test("returns original command for terminal data without edits", () => {
      const terminalData = {
        kind: "terminal",
        commandLine: {
          original: "npm install"
        },
        language: "bash"
      };
      assert.strictEqual(getToolSpecificDataDescription(terminalData), "npm install");
    });
    test("returns description for subagent data", () => {
      const subagentData = {
        kind: "subagent",
        agentName: "TestAgent",
        description: "Running analysis",
        prompt: "Analyze the code"
      };
      const result = getToolSpecificDataDescription(subagentData);
      assert.ok(result.includes("TestAgent"));
      assert.ok(result.includes("Running analysis"));
      assert.ok(result.includes("Analyze the code"));
    });
    test("handles subagent with only description", () => {
      const subagentData = {
        kind: "subagent",
        description: "Running analysis"
      };
      const result = getToolSpecificDataDescription(subagentData);
      assert.strictEqual(result, "Running analysis");
    });
    test("returns extensions list for extensions data", () => {
      const extensionsData = {
        kind: "extensions",
        extensions: ["eslint", "prettier", "typescript"]
      };
      const result = getToolSpecificDataDescription(extensionsData);
      assert.ok(result.includes("eslint"));
      assert.ok(result.includes("prettier"));
      assert.ok(result.includes("typescript"));
    });
    test("returns empty for empty extensions array", () => {
      const extensionsData = {
        kind: "extensions",
        extensions: []
      };
      assert.strictEqual(getToolSpecificDataDescription(extensionsData), "");
    });
    test("returns todo list description for todoList data", () => {
      const todoData = {
        kind: "todoList",
        todoList: [
          { id: "1", title: "Task 1", status: "in-progress" },
          { id: "2", title: "Task 2", status: "completed" }
        ]
      };
      const result = getToolSpecificDataDescription(todoData);
      assert.ok(result.includes("2 items"));
      assert.ok(result.includes("Task 1"));
      assert.ok(result.includes("in-progress"));
      assert.ok(result.includes("Task 2"));
      assert.ok(result.includes("completed"));
    });
    test("returns empty for empty todo list", () => {
      const todoData = {
        kind: "todoList",
        todoList: []
      };
      assert.strictEqual(getToolSpecificDataDescription(todoData), "");
    });
    test("returns PR info for pullRequest data", () => {
      const prData = {
        kind: "pullRequest",
        uri: URI.file("/test"),
        command: { id: "vscode.open", title: "Open Pull Request", arguments: [URI.file("/test")] },
        title: "Add new feature",
        description: "This PR adds a great feature",
        author: "testuser",
        linkTag: "#123"
      };
      const result = getToolSpecificDataDescription(prData);
      assert.ok(result.includes("Add new feature"));
      assert.ok(result.includes("testuser"));
    });
    test("returns raw input for input data (string)", () => {
      const inputData = {
        kind: "input",
        rawInput: "some input string"
      };
      assert.strictEqual(getToolSpecificDataDescription(inputData), "some input string");
    });
    test("returns JSON stringified for input data (object)", () => {
      const inputData = {
        kind: "input",
        rawInput: { key: "value", nested: { data: 123 } }
      };
      const result = getToolSpecificDataDescription(inputData);
      assert.ok(result.includes("key"));
      assert.ok(result.includes("value"));
    });
    test("returns resources list for resources data with URIs", () => {
      const resourcesData = {
        kind: "resources",
        values: [
          URI.file("/path/to/file1.ts"),
          URI.file("/path/to/file2.ts")
        ]
      };
      const result = getToolSpecificDataDescription(resourcesData);
      assert.ok(result.includes("file1.ts"));
      assert.ok(result.includes("file2.ts"));
    });
    test("returns resources list for resources data with Locations", () => {
      const resourcesData = {
        kind: "resources",
        values: [
          { uri: URI.file("/path/to/file1.ts"), range: new Range(1, 1, 10, 1) },
          { uri: URI.file("/path/to/file2.ts"), range: new Range(5, 1, 15, 1) }
        ]
      };
      const result = getToolSpecificDataDescription(resourcesData);
      assert.ok(result.includes("file1.ts"));
      assert.ok(result.includes(":1"));
      assert.ok(result.includes("file2.ts"));
      assert.ok(result.includes(":5"));
    });
    test("returns resources list for mixed URIs and Locations", () => {
      const resourcesData = {
        kind: "resources",
        values: [
          URI.file("/path/to/file1.ts"),
          { uri: URI.file("/path/to/file2.ts"), range: new Range(10, 1, 20, 1) }
        ]
      };
      const result = getToolSpecificDataDescription(resourcesData);
      assert.ok(result.includes("file1.ts"));
      assert.ok(result.includes("file2.ts"));
      assert.ok(result.includes(":10"));
    });
    test("returns empty for empty resources array", () => {
      const resourcesData = {
        kind: "resources",
        values: []
      };
      assert.strictEqual(getToolSpecificDataDescription(resourcesData), "");
    });
    test("describes configured automation results", () => {
      assert.deepStrictEqual([
        getToolSpecificDataDescription({
          kind: "automationConfigured",
          automationId: "automation-1",
          automationName: "Morning review",
          operation: "created"
        }),
        getToolSpecificDataDescription({
          kind: "automationConfigured",
          automationId: "automation-1",
          automationName: "Morning review",
          operation: "updated"
        })
      ], [
        "Created an automation: Morning review",
        "Edited an automation: Morning review"
      ]);
    });
  });
  suite("getResultDetailsDescription", () => {
    test("returns empty object for undefined", () => {
      assert.deepStrictEqual(getResultDetailsDescription(void 0), {});
    });
    test("returns files for URI array", () => {
      const uris = [
        URI.file("/path/to/file1.ts"),
        URI.file("/path/to/file2.ts")
      ];
      const result = getResultDetailsDescription(uris);
      assert.ok(result.files);
      assert.strictEqual(result.files.length, 2);
      assert.ok(result.files[0].includes("file1.ts"));
      assert.ok(result.files[1].includes("file2.ts"));
    });
    test("returns files for Location array", () => {
      const locations = [
        { uri: URI.file("/path/to/file1.ts"), range: new Range(1, 1, 10, 1) },
        { uri: URI.file("/path/to/file2.ts"), range: new Range(5, 1, 15, 1) }
      ];
      const result = getResultDetailsDescription(locations);
      assert.ok(result.files);
      assert.strictEqual(result.files.length, 2);
    });
    test("returns input and isError for IToolResultInputOutputDetails", () => {
      const details = {
        input: "create_file path=/test/file.ts",
        output: [],
        isError: false
      };
      const result = getResultDetailsDescription(details);
      assert.strictEqual(result.input, "create_file path=/test/file.ts");
      assert.strictEqual(result.isError, false);
    });
    test("returns isError true for errored IToolResultInputOutputDetails", () => {
      const details = {
        input: "create_file path=/test/file.ts",
        output: [],
        isError: true
      };
      const result = getResultDetailsDescription(details);
      assert.strictEqual(result.isError, true);
    });
  });
  suite("getToolInvocationA11yDescription", () => {
    test("returns invocation message when not complete", () => {
      const result = getToolInvocationA11yDescription(
        "Creating file",
        "Created file",
        void 0,
        void 0,
        false
      );
      assert.strictEqual(result, "Creating file");
    });
    test("returns past tense message when complete", () => {
      const result = getToolInvocationA11yDescription(
        "Creating file",
        "Created file",
        void 0,
        void 0,
        true
      );
      assert.strictEqual(result, "Created file");
    });
    test("includes tool-specific data description", () => {
      const terminalData = {
        kind: "terminal",
        commandLine: { original: "npm test" },
        language: "bash"
      };
      const result = getToolInvocationA11yDescription(
        "Running command",
        "Ran command",
        terminalData,
        void 0,
        true
      );
      assert.ok(result.includes("Ran command"));
      assert.ok(result.includes("npm test"));
    });
    test("includes files from result details when complete", () => {
      const uris = [
        URI.file("/path/to/file1.ts"),
        URI.file("/path/to/file2.ts")
      ];
      const result = getToolInvocationA11yDescription(
        "Creating files",
        "Created files",
        void 0,
        uris,
        true
      );
      assert.ok(result.includes("Created files"));
      assert.ok(result.includes("file1.ts"));
      assert.ok(result.includes("file2.ts"));
    });
    test("includes error status when result has error", () => {
      const details = {
        input: "create_file path=/test/file.ts",
        output: [],
        isError: true
      };
      const result = getToolInvocationA11yDescription(
        "Creating file",
        "Created file",
        void 0,
        details,
        true
      );
      assert.ok(result.includes("Errored"));
    });
    test("does not show input when tool-specific data is provided", () => {
      const terminalData = {
        kind: "terminal",
        commandLine: { original: "npm test" },
        language: "bash"
      };
      const details = {
        input: "some redundant input",
        output: [],
        isError: false
      };
      const result = getToolInvocationA11yDescription(
        "Running command",
        "Ran command",
        terminalData,
        details,
        true
      );
      assert.ok(result.includes("npm test"));
      assert.ok(!result.includes("Input:"));
    });
    test("shows input when no tool-specific data", () => {
      const details = {
        input: "apply_patch file=/test/file.ts",
        output: [],
        isError: false
      };
      const result = getToolInvocationA11yDescription(
        "Applying patch",
        "Applied patch",
        void 0,
        details,
        true
      );
      assert.ok(result.includes("Applied patch"));
      assert.ok(result.includes("Input:"));
      assert.ok(result.includes("apply_patch"));
    });
    test("handles all parts together", () => {
      const subagentData = {
        kind: "subagent",
        agentName: "CodeReviewer",
        description: "Reviewing code changes"
      };
      const uris = [URI.file("/src/test.ts")];
      const result = getToolInvocationA11yDescription(
        "Starting code review",
        "Completed code review",
        subagentData,
        uris,
        true
      );
      assert.ok(result.includes("Completed code review"));
      assert.ok(result.includes("CodeReviewer"));
      assert.ok(result.includes("Reviewing code changes"));
      assert.ok(result.includes("test.ts"));
    });
  });
  suite("getProvider", () => {
    test("omits thinking content when disabled in storage", () => {
      const instantiationService = store.add(new TestInstantiationService());
      const storageService = store.add(new TestStorageService());
      storageService.store(CHAT_ACCESSIBLE_VIEW_INCLUDE_THINKING_STORAGE_KEY, false, StorageScope.PROFILE, StorageTarget.USER);
      const responseItem = {
        response: { value: [{ kind: "thinking", value: "Hidden reasoning" }, { kind: "markdownContent", content: new MarkdownString("Response content") }] },
        model: { onDidChange: Event.None },
        setVote: () => void 0
      };
      const items = [responseItem];
      let focusedItem = responseItem;
      const widget = {
        hasInputFocus: () => false,
        focusResponseItem: () => {
          focusedItem = responseItem;
        },
        getFocus: () => focusedItem,
        focus: (item) => {
          focusedItem = item;
        },
        viewModel: { getItems: () => items }
      };
      const widgetService = {
        _serviceBrand: void 0,
        lastFocusedWidget: widget,
        onDidAddWidget: Event.None,
        onDidBackgroundSession: Event.None,
        reveal: async () => true,
        revealWidget: async () => widget,
        getAllWidgets: () => [widget],
        getWidgetByInputUri: () => widget,
        openSession: async () => widget,
        getWidgetBySessionResource: () => widget
      };
      instantiationService.stub(IChatWidgetService, widgetService);
      instantiationService.stub(IStorageService, storageService);
      const accessibleView = new ChatResponseAccessibleView();
      const provider = instantiationService.invokeFunction((accessor) => accessibleView.getProvider(accessor));
      assert.ok(provider);
      store.add(provider);
      const content = provider.provideContent();
      assert.ok(content.includes("Response content"));
      assert.ok(!content.includes("Thinking: Hidden reasoning"));
    });
    test("prefers the latest response when focus is on a queued request", () => {
      const instantiationService = store.add(new TestInstantiationService());
      const storageService = store.add(new TestStorageService());
      const responseItem = {
        response: { value: [{ kind: "thinking", value: "Reasoning" }, { kind: "markdownContent", content: new MarkdownString("Response content") }] },
        model: { onDidChange: Event.None },
        setVote: () => void 0
      };
      const queuedRequest = { message: "Queued request" };
      const items = [responseItem, queuedRequest];
      let focusedItem = queuedRequest;
      const widget = {
        hasInputFocus: () => true,
        focusResponseItem: () => {
          focusedItem = queuedRequest;
        },
        getFocus: () => focusedItem,
        focus: (item) => {
          focusedItem = item;
        },
        viewModel: { getItems: () => items }
      };
      const widgetService = {
        _serviceBrand: void 0,
        lastFocusedWidget: widget,
        onDidAddWidget: Event.None,
        onDidBackgroundSession: Event.None,
        reveal: async () => true,
        revealWidget: async () => widget,
        getAllWidgets: () => [widget],
        getWidgetByInputUri: () => widget,
        openSession: async () => widget,
        getWidgetBySessionResource: () => widget
      };
      instantiationService.stub(IChatWidgetService, widgetService);
      instantiationService.stub(IStorageService, storageService);
      const accessibleView = new ChatResponseAccessibleView();
      const provider = instantiationService.invokeFunction((accessor) => accessibleView.getProvider(accessor));
      assert.ok(provider);
      store.add(provider);
      const content = provider.provideContent();
      assert.ok(content.includes("Response content"));
      assert.ok(content.includes("Thinking: Reasoning"));
    });
    test("includes file path for URI inline references", () => {
      const instantiationService = store.add(new TestInstantiationService());
      const storageService = store.add(new TestStorageService());
      const inlineReferenceUri = URI.file("/path/to/index.ts");
      const responseItem = {
        response: {
          value: [
            { kind: "markdownContent", content: new MarkdownString("See file ") },
            { kind: "inlineReference", inlineReference: inlineReferenceUri, name: "index.ts" },
            { kind: "markdownContent", content: new MarkdownString(" for details") }
          ]
        },
        model: { onDidChange: Event.None },
        setVote: () => void 0
      };
      const items = [responseItem];
      let focusedItem = responseItem;
      const widget = {
        hasInputFocus: () => false,
        focusResponseItem: () => {
          focusedItem = responseItem;
        },
        getFocus: () => focusedItem,
        focus: (item) => {
          focusedItem = item;
        },
        viewModel: { getItems: () => items }
      };
      const widgetService = {
        _serviceBrand: void 0,
        lastFocusedWidget: widget,
        onDidAddWidget: Event.None,
        onDidBackgroundSession: Event.None,
        reveal: async () => true,
        revealWidget: async () => widget,
        getAllWidgets: () => [widget],
        getWidgetByInputUri: () => widget,
        openSession: async () => widget,
        getWidgetBySessionResource: () => widget
      };
      instantiationService.stub(IChatWidgetService, widgetService);
      instantiationService.stub(IStorageService, storageService);
      const accessibleView = new ChatResponseAccessibleView();
      const provider = instantiationService.invokeFunction((accessor) => accessibleView.getProvider(accessor));
      assert.ok(provider);
      store.add(provider);
      const content = provider.provideContent();
      assert.ok(content.includes("index.ts"));
      assert.ok(content.includes(inlineReferenceUri.path));
      assert.ok(content.includes("See file"));
      assert.ok(content.includes("for details"));
    });
    test("includes file path and line number for Location inline references", () => {
      const instantiationService = store.add(new TestInstantiationService());
      const storageService = store.add(new TestStorageService());
      const fileLocation = {
        uri: URI.file("/src/app/main.ts"),
        range: new Range(42, 1, 42, 20)
      };
      const responseItem = {
        response: {
          value: [
            { kind: "markdownContent", content: new MarkdownString("Error at ") },
            { kind: "inlineReference", inlineReference: fileLocation, name: "main.ts" }
          ]
        },
        model: { onDidChange: Event.None },
        setVote: () => void 0
      };
      const items = [responseItem];
      let focusedItem = responseItem;
      const widget = {
        hasInputFocus: () => false,
        focusResponseItem: () => {
          focusedItem = responseItem;
        },
        getFocus: () => focusedItem,
        focus: (item) => {
          focusedItem = item;
        },
        viewModel: { getItems: () => items }
      };
      const widgetService = {
        _serviceBrand: void 0,
        lastFocusedWidget: widget,
        onDidAddWidget: Event.None,
        onDidBackgroundSession: Event.None,
        reveal: async () => true,
        revealWidget: async () => widget,
        getAllWidgets: () => [widget],
        getWidgetByInputUri: () => widget,
        openSession: async () => widget,
        getWidgetBySessionResource: () => widget
      };
      instantiationService.stub(IChatWidgetService, widgetService);
      instantiationService.stub(IStorageService, storageService);
      const accessibleView = new ChatResponseAccessibleView();
      const provider = instantiationService.invokeFunction((accessor) => accessibleView.getProvider(accessor));
      assert.ok(provider);
      store.add(provider);
      const content = provider.provideContent();
      assert.ok(content.includes("main.ts"));
      assert.ok(content.includes(`${fileLocation.uri.path}:42`));
    });
    test("uses basename as name for URI inline references without explicit name", () => {
      const instantiationService = store.add(new TestInstantiationService());
      const storageService = store.add(new TestStorageService());
      const inlineReferenceUri = URI.file("/workspace/src/utils.ts");
      const responseItem = {
        response: {
          value: [
            { kind: "inlineReference", inlineReference: inlineReferenceUri }
          ]
        },
        model: { onDidChange: Event.None },
        setVote: () => void 0
      };
      const items = [responseItem];
      let focusedItem = responseItem;
      const widget = {
        hasInputFocus: () => false,
        focusResponseItem: () => {
          focusedItem = responseItem;
        },
        getFocus: () => focusedItem,
        focus: (item) => {
          focusedItem = item;
        },
        viewModel: { getItems: () => items }
      };
      const widgetService = {
        _serviceBrand: void 0,
        lastFocusedWidget: widget,
        onDidAddWidget: Event.None,
        onDidBackgroundSession: Event.None,
        reveal: async () => true,
        revealWidget: async () => widget,
        getAllWidgets: () => [widget],
        getWidgetByInputUri: () => widget,
        openSession: async () => widget,
        getWidgetBySessionResource: () => widget
      };
      instantiationService.stub(IChatWidgetService, widgetService);
      instantiationService.stub(IStorageService, storageService);
      const accessibleView = new ChatResponseAccessibleView();
      const provider = instantiationService.invokeFunction((accessor) => accessibleView.getProvider(accessor));
      assert.ok(provider);
      store.add(provider);
      const content = provider.provideContent();
      assert.ok(content.includes("utils.ts"));
      assert.ok(content.includes(inlineReferenceUri.path));
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGFjY2Vzc2liaWxpdHlcXGNoYXRSZXNwb25zZUFjY2Vzc2libGVWaWV3LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgQ2hhdFJlc3BvbnNlQWNjZXNzaWJsZVZpZXcsIENIQVRfQUNDRVNTSUJMRV9WSUVXX0lOQ0xVREVfVEhJTktJTkdfU1RPUkFHRV9LRVksIGdldFRvb2xTcGVjaWZpY0RhdGFEZXNjcmlwdGlvbiwgZ2V0UmVzdWx0RGV0YWlsc0Rlc2NyaXB0aW9uLCBnZXRUb29sSW52b2NhdGlvbkExMXlEZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWNjZXNzaWJpbGl0eS9jaGF0UmVzcG9uc2VBY2Nlc3NpYmxlVmlldy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldCwgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IElDaGF0RXh0ZW5zaW9uc0NvbnRlbnQsIElDaGF0UHVsbFJlcXVlc3RDb250ZW50LCBJQ2hhdFN1YmFnZW50VG9vbEludm9jYXRpb25EYXRhLCBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhLCBJQ2hhdFRvZG9MaXN0Q29udGVudCwgSUNoYXRUb29sSW5wdXRJbnZvY2F0aW9uRGF0YSwgSUNoYXRUb29sUmVzb3VyY2VzSW52b2NhdGlvbkRhdGEgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdFN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcblxuc3VpdGUoJ0NoYXRSZXNwb25zZUFjY2Vzc2libGVWaWV3JywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdnZXRUb29sU3BlY2lmaWNEYXRhRGVzY3JpcHRpb24nLCAoKSA9PiB7XG5cdFx0dGVzdCgncmV0dXJucyBlbXB0eSBzdHJpbmcgZm9yIHVuZGVmaW5lZCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUb29sU3BlY2lmaWNEYXRhRGVzY3JpcHRpb24odW5kZWZpbmVkKSwgJycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBjb21tYW5kIGxpbmUgZm9yIHRlcm1pbmFsIGRhdGEnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbERhdGE6IElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEgPSB7XG5cdFx0XHRcdGtpbmQ6ICd0ZXJtaW5hbCcsXG5cdFx0XHRcdGNvbW1hbmRMaW5lOiB7XG5cdFx0XHRcdFx0b3JpZ2luYWw6ICducG0gaW5zdGFsbCcsXG5cdFx0XHRcdFx0dG9vbEVkaXRlZDogJ25wbSBjaScsXG5cdFx0XHRcdFx0dXNlckVkaXRlZDogJ25wbSBpbnN0YWxsIC0tc2F2ZS1kZXYnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGxhbmd1YWdlOiAnYmFzaCdcblx0XHRcdH07XG5cdFx0XHQvLyBTaG91bGQgcHJlZmVyIHVzZXJFZGl0ZWQgb3ZlciB0b29sRWRpdGVkIG92ZXIgb3JpZ2luYWxcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUb29sU3BlY2lmaWNEYXRhRGVzY3JpcHRpb24odGVybWluYWxEYXRhKSwgJ25wbSBpbnN0YWxsIC0tc2F2ZS1kZXYnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdG9vbCBlZGl0ZWQgY29tbWFuZCBmb3IgdGVybWluYWwgZGF0YSB3aXRob3V0IHVzZXIgZWRpdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRlcm1pbmFsRGF0YTogSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSA9IHtcblx0XHRcdFx0a2luZDogJ3Rlcm1pbmFsJyxcblx0XHRcdFx0Y29tbWFuZExpbmU6IHtcblx0XHRcdFx0XHRvcmlnaW5hbDogJ25wbSBpbnN0YWxsJyxcblx0XHRcdFx0XHR0b29sRWRpdGVkOiAnbnBtIGNpJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRsYW5ndWFnZTogJ2Jhc2gnXG5cdFx0XHR9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRvb2xTcGVjaWZpY0RhdGFEZXNjcmlwdGlvbih0ZXJtaW5hbERhdGEpLCAnbnBtIGNpJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIG9yaWdpbmFsIGNvbW1hbmQgZm9yIHRlcm1pbmFsIGRhdGEgd2l0aG91dCBlZGl0cycsICgpID0+IHtcblx0XHRcdGNvbnN0IHRlcm1pbmFsRGF0YTogSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSA9IHtcblx0XHRcdFx0a2luZDogJ3Rlcm1pbmFsJyxcblx0XHRcdFx0Y29tbWFuZExpbmU6IHtcblx0XHRcdFx0XHRvcmlnaW5hbDogJ25wbSBpbnN0YWxsJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRsYW5ndWFnZTogJ2Jhc2gnXG5cdFx0XHR9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRvb2xTcGVjaWZpY0RhdGFEZXNjcmlwdGlvbih0ZXJtaW5hbERhdGEpLCAnbnBtIGluc3RhbGwnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZGVzY3JpcHRpb24gZm9yIHN1YmFnZW50IGRhdGEnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdWJhZ2VudERhdGE6IElDaGF0U3ViYWdlbnRUb29sSW52b2NhdGlvbkRhdGEgPSB7XG5cdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdGFnZW50TmFtZTogJ1Rlc3RBZ2VudCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnUnVubmluZyBhbmFseXNpcycsXG5cdFx0XHRcdHByb21wdDogJ0FuYWx5emUgdGhlIGNvZGUnXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0VG9vbFNwZWNpZmljRGF0YURlc2NyaXB0aW9uKHN1YmFnZW50RGF0YSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdUZXN0QWdlbnQnKSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdSdW5uaW5nIGFuYWx5c2lzJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnQW5hbHl6ZSB0aGUgY29kZScpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgc3ViYWdlbnQgd2l0aCBvbmx5IGRlc2NyaXB0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3ViYWdlbnREYXRhOiBJQ2hhdFN1YmFnZW50VG9vbEludm9jYXRpb25EYXRhID0ge1xuXHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1J1bm5pbmcgYW5hbHlzaXMnXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0VG9vbFNwZWNpZmljRGF0YURlc2NyaXB0aW9uKHN1YmFnZW50RGF0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnUnVubmluZyBhbmFseXNpcycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBleHRlbnNpb25zIGxpc3QgZm9yIGV4dGVuc2lvbnMgZGF0YScsICgpID0+IHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbnNEYXRhOiBJQ2hhdEV4dGVuc2lvbnNDb250ZW50ID0ge1xuXHRcdFx0XHRraW5kOiAnZXh0ZW5zaW9ucycsXG5cdFx0XHRcdGV4dGVuc2lvbnM6IFsnZXNsaW50JywgJ3ByZXR0aWVyJywgJ3R5cGVzY3JpcHQnXVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFRvb2xTcGVjaWZpY0RhdGFEZXNjcmlwdGlvbihleHRlbnNpb25zRGF0YSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdlc2xpbnQnKSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdwcmV0dGllcicpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ3R5cGVzY3JpcHQnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGVtcHR5IGZvciBlbXB0eSBleHRlbnNpb25zIGFycmF5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uc0RhdGE6IElDaGF0RXh0ZW5zaW9uc0NvbnRlbnQgPSB7XG5cdFx0XHRcdGtpbmQ6ICdleHRlbnNpb25zJyxcblx0XHRcdFx0ZXh0ZW5zaW9uczogW11cblx0XHRcdH07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VG9vbFNwZWNpZmljRGF0YURlc2NyaXB0aW9uKGV4dGVuc2lvbnNEYXRhKSwgJycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB0b2RvIGxpc3QgZGVzY3JpcHRpb24gZm9yIHRvZG9MaXN0IGRhdGEnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b2RvRGF0YTogSUNoYXRUb2RvTGlzdENvbnRlbnQgPSB7XG5cdFx0XHRcdGtpbmQ6ICd0b2RvTGlzdCcsXG5cdFx0XHRcdHRvZG9MaXN0OiBbXG5cdFx0XHRcdFx0eyBpZDogJzEnLCB0aXRsZTogJ1Rhc2sgMScsIHN0YXR1czogJ2luLXByb2dyZXNzJyB9LFxuXHRcdFx0XHRcdHsgaWQ6ICcyJywgdGl0bGU6ICdUYXNrIDInLCBzdGF0dXM6ICdjb21wbGV0ZWQnIH1cblx0XHRcdFx0XVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFRvb2xTcGVjaWZpY0RhdGFEZXNjcmlwdGlvbih0b2RvRGF0YSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCcyIGl0ZW1zJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnVGFzayAxJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnaW4tcHJvZ3Jlc3MnKSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdUYXNrIDInKSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdjb21wbGV0ZWQnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGVtcHR5IGZvciBlbXB0eSB0b2RvIGxpc3QnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b2RvRGF0YTogSUNoYXRUb2RvTGlzdENvbnRlbnQgPSB7XG5cdFx0XHRcdGtpbmQ6ICd0b2RvTGlzdCcsXG5cdFx0XHRcdHRvZG9MaXN0OiBbXVxuXHRcdFx0fTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUb29sU3BlY2lmaWNEYXRhRGVzY3JpcHRpb24odG9kb0RhdGEpLCAnJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIFBSIGluZm8gZm9yIHB1bGxSZXF1ZXN0IGRhdGEnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwckRhdGE6IElDaGF0UHVsbFJlcXVlc3RDb250ZW50ID0ge1xuXHRcdFx0XHRraW5kOiAncHVsbFJlcXVlc3QnLFxuXHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvdGVzdCcpLFxuXHRcdFx0XHRjb21tYW5kOiB7IGlkOiAndnNjb2RlLm9wZW4nLCB0aXRsZTogJ09wZW4gUHVsbCBSZXF1ZXN0JywgYXJndW1lbnRzOiBbVVJJLmZpbGUoJy90ZXN0JyldIH0sXG5cdFx0XHRcdHRpdGxlOiAnQWRkIG5ldyBmZWF0dXJlJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdUaGlzIFBSIGFkZHMgYSBncmVhdCBmZWF0dXJlJyxcblx0XHRcdFx0YXV0aG9yOiAndGVzdHVzZXInLFxuXHRcdFx0XHRsaW5rVGFnOiAnIzEyMydcblx0XHRcdH07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRUb29sU3BlY2lmaWNEYXRhRGVzY3JpcHRpb24ocHJEYXRhKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ0FkZCBuZXcgZmVhdHVyZScpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ3Rlc3R1c2VyJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyByYXcgaW5wdXQgZm9yIGlucHV0IGRhdGEgKHN0cmluZyknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dERhdGE6IElDaGF0VG9vbElucHV0SW52b2NhdGlvbkRhdGEgPSB7XG5cdFx0XHRcdGtpbmQ6ICdpbnB1dCcsXG5cdFx0XHRcdHJhd0lucHV0OiAnc29tZSBpbnB1dCBzdHJpbmcnXG5cdFx0XHR9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRvb2xTcGVjaWZpY0RhdGFEZXNjcmlwdGlvbihpbnB1dERhdGEpLCAnc29tZSBpbnB1dCBzdHJpbmcnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgSlNPTiBzdHJpbmdpZmllZCBmb3IgaW5wdXQgZGF0YSAob2JqZWN0KScsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0RGF0YTogSUNoYXRUb29sSW5wdXRJbnZvY2F0aW9uRGF0YSA9IHtcblx0XHRcdFx0a2luZDogJ2lucHV0Jyxcblx0XHRcdFx0cmF3SW5wdXQ6IHsga2V5OiAndmFsdWUnLCBuZXN0ZWQ6IHsgZGF0YTogMTIzIH0gfVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFRvb2xTcGVjaWZpY0RhdGFEZXNjcmlwdGlvbihpbnB1dERhdGEpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygna2V5JykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygndmFsdWUnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHJlc291cmNlcyBsaXN0IGZvciByZXNvdXJjZXMgZGF0YSB3aXRoIFVSSXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXNvdXJjZXNEYXRhOiBJQ2hhdFRvb2xSZXNvdXJjZXNJbnZvY2F0aW9uRGF0YSA9IHtcblx0XHRcdFx0a2luZDogJ3Jlc291cmNlcycsXG5cdFx0XHRcdHZhbHVlczogW1xuXHRcdFx0XHRcdFVSSS5maWxlKCcvcGF0aC90by9maWxlMS50cycpLFxuXHRcdFx0XHRcdFVSSS5maWxlKCcvcGF0aC90by9maWxlMi50cycpXG5cdFx0XHRcdF1cblx0XHRcdH07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRUb29sU3BlY2lmaWNEYXRhRGVzY3JpcHRpb24ocmVzb3VyY2VzRGF0YSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdmaWxlMS50cycpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ2ZpbGUyLnRzJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyByZXNvdXJjZXMgbGlzdCBmb3IgcmVzb3VyY2VzIGRhdGEgd2l0aCBMb2NhdGlvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXNvdXJjZXNEYXRhOiBJQ2hhdFRvb2xSZXNvdXJjZXNJbnZvY2F0aW9uRGF0YSA9IHtcblx0XHRcdFx0a2luZDogJ3Jlc291cmNlcycsXG5cdFx0XHRcdHZhbHVlczogW1xuXHRcdFx0XHRcdHsgdXJpOiBVUkkuZmlsZSgnL3BhdGgvdG8vZmlsZTEudHMnKSwgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxMCwgMSkgfSxcblx0XHRcdFx0XHR7IHVyaTogVVJJLmZpbGUoJy9wYXRoL3RvL2ZpbGUyLnRzJyksIHJhbmdlOiBuZXcgUmFuZ2UoNSwgMSwgMTUsIDEpIH1cblx0XHRcdFx0XVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFRvb2xTcGVjaWZpY0RhdGFEZXNjcmlwdGlvbihyZXNvdXJjZXNEYXRhKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ2ZpbGUxLnRzJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnOjEnKSk7IC8vIExpbmUgbnVtYmVyIGluY2x1ZGVkIGZvciBMb2NhdGlvbnNcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ2ZpbGUyLnRzJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnOjUnKSk7IC8vIExpbmUgbnVtYmVyIGluY2x1ZGVkIGZvciBMb2NhdGlvbnNcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgcmVzb3VyY2VzIGxpc3QgZm9yIG1peGVkIFVSSXMgYW5kIExvY2F0aW9ucycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc291cmNlc0RhdGE6IElDaGF0VG9vbFJlc291cmNlc0ludm9jYXRpb25EYXRhID0ge1xuXHRcdFx0XHRraW5kOiAncmVzb3VyY2VzJyxcblx0XHRcdFx0dmFsdWVzOiBbXG5cdFx0XHRcdFx0VVJJLmZpbGUoJy9wYXRoL3RvL2ZpbGUxLnRzJyksXG5cdFx0XHRcdFx0eyB1cmk6IFVSSS5maWxlKCcvcGF0aC90by9maWxlMi50cycpLCByYW5nZTogbmV3IFJhbmdlKDEwLCAxLCAyMCwgMSkgfVxuXHRcdFx0XHRdXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0VG9vbFNwZWNpZmljRGF0YURlc2NyaXB0aW9uKHJlc291cmNlc0RhdGEpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnZmlsZTEudHMnKSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdmaWxlMi50cycpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJzoxMCcpKTsgLy8gTGluZSBudW1iZXIgZm9yIExvY2F0aW9uIG9ubHlcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZW1wdHkgZm9yIGVtcHR5IHJlc291cmNlcyBhcnJheScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc291cmNlc0RhdGE6IElDaGF0VG9vbFJlc291cmNlc0ludm9jYXRpb25EYXRhID0ge1xuXHRcdFx0XHRraW5kOiAncmVzb3VyY2VzJyxcblx0XHRcdFx0dmFsdWVzOiBbXVxuXHRcdFx0fTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUb29sU3BlY2lmaWNEYXRhRGVzY3JpcHRpb24ocmVzb3VyY2VzRGF0YSksICcnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rlc2NyaWJlcyBjb25maWd1cmVkIGF1dG9tYXRpb24gcmVzdWx0cycsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0XHRnZXRUb29sU3BlY2lmaWNEYXRhRGVzY3JpcHRpb24oe1xuXHRcdFx0XHRcdGtpbmQ6ICdhdXRvbWF0aW9uQ29uZmlndXJlZCcsXG5cdFx0XHRcdFx0YXV0b21hdGlvbklkOiAnYXV0b21hdGlvbi0xJyxcblx0XHRcdFx0XHRhdXRvbWF0aW9uTmFtZTogJ01vcm5pbmcgcmV2aWV3Jyxcblx0XHRcdFx0XHRvcGVyYXRpb246ICdjcmVhdGVkJyxcblx0XHRcdFx0fSksXG5cdFx0XHRcdGdldFRvb2xTcGVjaWZpY0RhdGFEZXNjcmlwdGlvbih7XG5cdFx0XHRcdFx0a2luZDogJ2F1dG9tYXRpb25Db25maWd1cmVkJyxcblx0XHRcdFx0XHRhdXRvbWF0aW9uSWQ6ICdhdXRvbWF0aW9uLTEnLFxuXHRcdFx0XHRcdGF1dG9tYXRpb25OYW1lOiAnTW9ybmluZyByZXZpZXcnLFxuXHRcdFx0XHRcdG9wZXJhdGlvbjogJ3VwZGF0ZWQnLFxuXHRcdFx0XHR9KSxcblx0XHRcdF0sIFtcblx0XHRcdFx0J0NyZWF0ZWQgYW4gYXV0b21hdGlvbjogTW9ybmluZyByZXZpZXcnLFxuXHRcdFx0XHQnRWRpdGVkIGFuIGF1dG9tYXRpb246IE1vcm5pbmcgcmV2aWV3Jyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0UmVzdWx0RGV0YWlsc0Rlc2NyaXB0aW9uJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgZW1wdHkgb2JqZWN0IGZvciB1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFJlc3VsdERldGFpbHNEZXNjcmlwdGlvbih1bmRlZmluZWQpLCB7fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGZpbGVzIGZvciBVUkkgYXJyYXknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmlzID0gW1xuXHRcdFx0XHRVUkkuZmlsZSgnL3BhdGgvdG8vZmlsZTEudHMnKSxcblx0XHRcdFx0VVJJLmZpbGUoJy9wYXRoL3RvL2ZpbGUyLnRzJylcblx0XHRcdF07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRSZXN1bHREZXRhaWxzRGVzY3JpcHRpb24odXJpcyk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmZpbGVzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZmlsZXMhLmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmZpbGVzIVswXS5pbmNsdWRlcygnZmlsZTEudHMnKSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmZpbGVzIVsxXS5pbmNsdWRlcygnZmlsZTIudHMnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGZpbGVzIGZvciBMb2NhdGlvbiBhcnJheScsICgpID0+IHtcblx0XHRcdGNvbnN0IGxvY2F0aW9uczogTG9jYXRpb25bXSA9IFtcblx0XHRcdFx0eyB1cmk6IFVSSS5maWxlKCcvcGF0aC90by9maWxlMS50cycpLCByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEwLCAxKSB9LFxuXHRcdFx0XHR7IHVyaTogVVJJLmZpbGUoJy9wYXRoL3RvL2ZpbGUyLnRzJyksIHJhbmdlOiBuZXcgUmFuZ2UoNSwgMSwgMTUsIDEpIH1cblx0XHRcdF07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRSZXN1bHREZXRhaWxzRGVzY3JpcHRpb24obG9jYXRpb25zKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuZmlsZXMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5maWxlcyEubGVuZ3RoLCAyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgaW5wdXQgYW5kIGlzRXJyb3IgZm9yIElUb29sUmVzdWx0SW5wdXRPdXRwdXREZXRhaWxzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGV0YWlscyA9IHtcblx0XHRcdFx0aW5wdXQ6ICdjcmVhdGVfZmlsZSBwYXRoPS90ZXN0L2ZpbGUudHMnLFxuXHRcdFx0XHRvdXRwdXQ6IFtdLFxuXHRcdFx0XHRpc0Vycm9yOiBmYWxzZVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFJlc3VsdERldGFpbHNEZXNjcmlwdGlvbihkZXRhaWxzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW5wdXQsICdjcmVhdGVfZmlsZSBwYXRoPS90ZXN0L2ZpbGUudHMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaXNFcnJvciwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBpc0Vycm9yIHRydWUgZm9yIGVycm9yZWQgSVRvb2xSZXN1bHRJbnB1dE91dHB1dERldGFpbHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZXRhaWxzID0ge1xuXHRcdFx0XHRpbnB1dDogJ2NyZWF0ZV9maWxlIHBhdGg9L3Rlc3QvZmlsZS50cycsXG5cdFx0XHRcdG91dHB1dDogW10sXG5cdFx0XHRcdGlzRXJyb3I6IHRydWVcblx0XHRcdH07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRSZXN1bHREZXRhaWxzRGVzY3JpcHRpb24oZGV0YWlscyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmlzRXJyb3IsIHRydWUpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0VG9vbEludm9jYXRpb25BMTF5RGVzY3JpcHRpb24nLCAoKSA9PiB7XG5cdFx0dGVzdCgncmV0dXJucyBpbnZvY2F0aW9uIG1lc3NhZ2Ugd2hlbiBub3QgY29tcGxldGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRUb29sSW52b2NhdGlvbkExMXlEZXNjcmlwdGlvbihcblx0XHRcdFx0J0NyZWF0aW5nIGZpbGUnLFxuXHRcdFx0XHQnQ3JlYXRlZCBmaWxlJyxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdGZhbHNlXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJ0NyZWF0aW5nIGZpbGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgcGFzdCB0ZW5zZSBtZXNzYWdlIHdoZW4gY29tcGxldGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRUb29sSW52b2NhdGlvbkExMXlEZXNjcmlwdGlvbihcblx0XHRcdFx0J0NyZWF0aW5nIGZpbGUnLFxuXHRcdFx0XHQnQ3JlYXRlZCBmaWxlJyxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdHRydWVcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnQ3JlYXRlZCBmaWxlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmNsdWRlcyB0b29sLXNwZWNpZmljIGRhdGEgZGVzY3JpcHRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbERhdGE6IElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEgPSB7XG5cdFx0XHRcdGtpbmQ6ICd0ZXJtaW5hbCcsXG5cdFx0XHRcdGNvbW1hbmRMaW5lOiB7IG9yaWdpbmFsOiAnbnBtIHRlc3QnIH0sXG5cdFx0XHRcdGxhbmd1YWdlOiAnYmFzaCdcblx0XHRcdH07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRUb29sSW52b2NhdGlvbkExMXlEZXNjcmlwdGlvbihcblx0XHRcdFx0J1J1bm5pbmcgY29tbWFuZCcsXG5cdFx0XHRcdCdSYW4gY29tbWFuZCcsXG5cdFx0XHRcdHRlcm1pbmFsRGF0YSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHR0cnVlXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnUmFuIGNvbW1hbmQnKSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCducG0gdGVzdCcpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luY2x1ZGVzIGZpbGVzIGZyb20gcmVzdWx0IGRldGFpbHMgd2hlbiBjb21wbGV0ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaXMgPSBbXG5cdFx0XHRcdFVSSS5maWxlKCcvcGF0aC90by9maWxlMS50cycpLFxuXHRcdFx0XHRVUkkuZmlsZSgnL3BhdGgvdG8vZmlsZTIudHMnKVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFRvb2xJbnZvY2F0aW9uQTExeURlc2NyaXB0aW9uKFxuXHRcdFx0XHQnQ3JlYXRpbmcgZmlsZXMnLFxuXHRcdFx0XHQnQ3JlYXRlZCBmaWxlcycsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0dXJpcyxcblx0XHRcdFx0dHJ1ZVxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ0NyZWF0ZWQgZmlsZXMnKSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdmaWxlMS50cycpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ2ZpbGUyLnRzJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5jbHVkZXMgZXJyb3Igc3RhdHVzIHdoZW4gcmVzdWx0IGhhcyBlcnJvcicsICgpID0+IHtcblx0XHRcdGNvbnN0IGRldGFpbHMgPSB7XG5cdFx0XHRcdGlucHV0OiAnY3JlYXRlX2ZpbGUgcGF0aD0vdGVzdC9maWxlLnRzJyxcblx0XHRcdFx0b3V0cHV0OiBbXSxcblx0XHRcdFx0aXNFcnJvcjogdHJ1ZVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFRvb2xJbnZvY2F0aW9uQTExeURlc2NyaXB0aW9uKFxuXHRcdFx0XHQnQ3JlYXRpbmcgZmlsZScsXG5cdFx0XHRcdCdDcmVhdGVkIGZpbGUnLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdGRldGFpbHMsXG5cdFx0XHRcdHRydWVcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdFcnJvcmVkJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3Qgc2hvdyBpbnB1dCB3aGVuIHRvb2wtc3BlY2lmaWMgZGF0YSBpcyBwcm92aWRlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRlcm1pbmFsRGF0YTogSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSA9IHtcblx0XHRcdFx0a2luZDogJ3Rlcm1pbmFsJyxcblx0XHRcdFx0Y29tbWFuZExpbmU6IHsgb3JpZ2luYWw6ICducG0gdGVzdCcgfSxcblx0XHRcdFx0bGFuZ3VhZ2U6ICdiYXNoJ1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGRldGFpbHMgPSB7XG5cdFx0XHRcdGlucHV0OiAnc29tZSByZWR1bmRhbnQgaW5wdXQnLFxuXHRcdFx0XHRvdXRwdXQ6IFtdLFxuXHRcdFx0XHRpc0Vycm9yOiBmYWxzZVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFRvb2xJbnZvY2F0aW9uQTExeURlc2NyaXB0aW9uKFxuXHRcdFx0XHQnUnVubmluZyBjb21tYW5kJyxcblx0XHRcdFx0J1JhbiBjb21tYW5kJyxcblx0XHRcdFx0dGVybWluYWxEYXRhLFxuXHRcdFx0XHRkZXRhaWxzLFxuXHRcdFx0XHR0cnVlXG5cdFx0XHQpO1xuXHRcdFx0Ly8gU2hvdWxkIGhhdmUgdG9vbC1zcGVjaWZpYyBkYXRhIGJ1dCBub3QgdGhlIFwiSW5wdXQ6XCIgbGFiZWxcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ25wbSB0ZXN0JykpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFyZXN1bHQuaW5jbHVkZXMoJ0lucHV0OicpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3dzIGlucHV0IHdoZW4gbm8gdG9vbC1zcGVjaWZpYyBkYXRhJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGV0YWlscyA9IHtcblx0XHRcdFx0aW5wdXQ6ICdhcHBseV9wYXRjaCBmaWxlPS90ZXN0L2ZpbGUudHMnLFxuXHRcdFx0XHRvdXRwdXQ6IFtdLFxuXHRcdFx0XHRpc0Vycm9yOiBmYWxzZVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFRvb2xJbnZvY2F0aW9uQTExeURlc2NyaXB0aW9uKFxuXHRcdFx0XHQnQXBwbHlpbmcgcGF0Y2gnLFxuXHRcdFx0XHQnQXBwbGllZCBwYXRjaCcsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0ZGV0YWlscyxcblx0XHRcdFx0dHJ1ZVxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ0FwcGxpZWQgcGF0Y2gnKSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdJbnB1dDonKSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdhcHBseV9wYXRjaCcpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgYWxsIHBhcnRzIHRvZ2V0aGVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3ViYWdlbnREYXRhOiBJQ2hhdFN1YmFnZW50VG9vbEludm9jYXRpb25EYXRhID0ge1xuXHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRhZ2VudE5hbWU6ICdDb2RlUmV2aWV3ZXInLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1Jldmlld2luZyBjb2RlIGNoYW5nZXMnXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgdXJpcyA9IFtVUkkuZmlsZSgnL3NyYy90ZXN0LnRzJyldO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0VG9vbEludm9jYXRpb25BMTF5RGVzY3JpcHRpb24oXG5cdFx0XHRcdCdTdGFydGluZyBjb2RlIHJldmlldycsXG5cdFx0XHRcdCdDb21wbGV0ZWQgY29kZSByZXZpZXcnLFxuXHRcdFx0XHRzdWJhZ2VudERhdGEsXG5cdFx0XHRcdHVyaXMsXG5cdFx0XHRcdHRydWVcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdDb21wbGV0ZWQgY29kZSByZXZpZXcnKSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdDb2RlUmV2aWV3ZXInKSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdSZXZpZXdpbmcgY29kZSBjaGFuZ2VzJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygndGVzdC50cycpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2dldFByb3ZpZGVyJywgKCkgPT4ge1xuXHRcdHRlc3QoJ29taXRzIHRoaW5raW5nIGNvbnRlbnQgd2hlbiBkaXNhYmxlZCBpbiBzdG9yYWdlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0XHRzdG9yYWdlU2VydmljZS5zdG9yZShDSEFUX0FDQ0VTU0lCTEVfVklFV19JTkNMVURFX1RISU5LSU5HX1NUT1JBR0VfS0VZLCBmYWxzZSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cblx0XHRcdGNvbnN0IHJlc3BvbnNlSXRlbSA9IHtcblx0XHRcdFx0cmVzcG9uc2U6IHsgdmFsdWU6IFt7IGtpbmQ6ICd0aGlua2luZycsIHZhbHVlOiAnSGlkZGVuIHJlYXNvbmluZycgfSwgeyBraW5kOiAnbWFya2Rvd25Db250ZW50JywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdSZXNwb25zZSBjb250ZW50JykgfV0gfSxcblx0XHRcdFx0bW9kZWw6IHsgb25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUgfSxcblx0XHRcdFx0c2V0Vm90ZTogKCkgPT4gdW5kZWZpbmVkXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBbcmVzcG9uc2VJdGVtXTtcblx0XHRcdGxldCBmb2N1c2VkSXRlbTogdW5rbm93biA9IHJlc3BvbnNlSXRlbTtcblxuXHRcdFx0Y29uc3Qgd2lkZ2V0ID0ge1xuXHRcdFx0XHRoYXNJbnB1dEZvY3VzOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0Zm9jdXNSZXNwb25zZUl0ZW06ICgpID0+IHsgZm9jdXNlZEl0ZW0gPSByZXNwb25zZUl0ZW07IH0sXG5cdFx0XHRcdGdldEZvY3VzOiAoKSA9PiBmb2N1c2VkSXRlbSxcblx0XHRcdFx0Zm9jdXM6IChpdGVtOiB1bmtub3duKSA9PiB7IGZvY3VzZWRJdGVtID0gaXRlbTsgfSxcblx0XHRcdFx0dmlld01vZGVsOiB7IGdldEl0ZW1zOiAoKSA9PiBpdGVtcyB9XG5cdFx0XHR9IGFzIHVua25vd24gYXMgSUNoYXRXaWRnZXQ7XG5cblx0XHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSB7XG5cdFx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0bGFzdEZvY3VzZWRXaWRnZXQ6IHdpZGdldCxcblx0XHRcdFx0b25EaWRBZGRXaWRnZXQ6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdG9uRGlkQmFja2dyb3VuZFNlc3Npb246IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdHJldmVhbDogYXN5bmMgKCkgPT4gdHJ1ZSxcblx0XHRcdFx0cmV2ZWFsV2lkZ2V0OiBhc3luYyAoKSA9PiB3aWRnZXQsXG5cdFx0XHRcdGdldEFsbFdpZGdldHM6ICgpID0+IFt3aWRnZXRdLFxuXHRcdFx0XHRnZXRXaWRnZXRCeUlucHV0VXJpOiAoKSA9PiB3aWRnZXQsXG5cdFx0XHRcdG9wZW5TZXNzaW9uOiBhc3luYyAoKSA9PiB3aWRnZXQsXG5cdFx0XHRcdGdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlOiAoKSA9PiB3aWRnZXRcblx0XHRcdH0gYXMgdW5rbm93biBhcyBJQ2hhdFdpZGdldFNlcnZpY2U7XG5cblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRXaWRnZXRTZXJ2aWNlLCB3aWRnZXRTZXJ2aWNlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cblx0XHRcdGNvbnN0IGFjY2Vzc2libGVWaWV3ID0gbmV3IENoYXRSZXNwb25zZUFjY2Vzc2libGVWaWV3KCk7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGFjY2Vzc2libGVWaWV3LmdldFByb3ZpZGVyKGFjY2Vzc29yKSk7XG5cdFx0XHRhc3NlcnQub2socHJvdmlkZXIpO1xuXHRcdFx0c3RvcmUuYWRkKHByb3ZpZGVyKTtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBwcm92aWRlci5wcm92aWRlQ29udGVudCgpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbnRlbnQuaW5jbHVkZXMoJ1Jlc3BvbnNlIGNvbnRlbnQnKSk7XG5cdFx0XHRhc3NlcnQub2soIWNvbnRlbnQuaW5jbHVkZXMoJ1RoaW5raW5nOiBIaWRkZW4gcmVhc29uaW5nJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJlZmVycyB0aGUgbGF0ZXN0IHJlc3BvbnNlIHdoZW4gZm9jdXMgaXMgb24gYSBxdWV1ZWQgcmVxdWVzdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2VJdGVtID0ge1xuXHRcdFx0XHRyZXNwb25zZTogeyB2YWx1ZTogW3sga2luZDogJ3RoaW5raW5nJywgdmFsdWU6ICdSZWFzb25pbmcnIH0sIHsga2luZDogJ21hcmtkb3duQ29udGVudCcsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnUmVzcG9uc2UgY29udGVudCcpIH1dIH0sXG5cdFx0XHRcdG1vZGVsOiB7IG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lIH0sXG5cdFx0XHRcdHNldFZvdGU6ICgpID0+IHVuZGVmaW5lZFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHF1ZXVlZFJlcXVlc3QgPSB7IG1lc3NhZ2U6ICdRdWV1ZWQgcmVxdWVzdCcgfTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gW3Jlc3BvbnNlSXRlbSwgcXVldWVkUmVxdWVzdF07XG5cdFx0XHRsZXQgZm9jdXNlZEl0ZW06IHVua25vd24gPSBxdWV1ZWRSZXF1ZXN0O1xuXG5cdFx0XHRjb25zdCB3aWRnZXQgPSB7XG5cdFx0XHRcdGhhc0lucHV0Rm9jdXM6ICgpID0+IHRydWUsXG5cdFx0XHRcdGZvY3VzUmVzcG9uc2VJdGVtOiAoKSA9PiB7IGZvY3VzZWRJdGVtID0gcXVldWVkUmVxdWVzdDsgfSxcblx0XHRcdFx0Z2V0Rm9jdXM6ICgpID0+IGZvY3VzZWRJdGVtLFxuXHRcdFx0XHRmb2N1czogKGl0ZW06IHVua25vd24pID0+IHsgZm9jdXNlZEl0ZW0gPSBpdGVtOyB9LFxuXHRcdFx0XHR2aWV3TW9kZWw6IHsgZ2V0SXRlbXM6ICgpID0+IGl0ZW1zIH1cblx0XHRcdH0gYXMgdW5rbm93biBhcyBJQ2hhdFdpZGdldDtcblxuXHRcdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IHtcblx0XHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRsYXN0Rm9jdXNlZFdpZGdldDogd2lkZ2V0LFxuXHRcdFx0XHRvbkRpZEFkZFdpZGdldDogRXZlbnQuTm9uZSxcblx0XHRcdFx0b25EaWRCYWNrZ3JvdW5kU2Vzc2lvbjogRXZlbnQuTm9uZSxcblx0XHRcdFx0cmV2ZWFsOiBhc3luYyAoKSA9PiB0cnVlLFxuXHRcdFx0XHRyZXZlYWxXaWRnZXQ6IGFzeW5jICgpID0+IHdpZGdldCxcblx0XHRcdFx0Z2V0QWxsV2lkZ2V0czogKCkgPT4gW3dpZGdldF0sXG5cdFx0XHRcdGdldFdpZGdldEJ5SW5wdXRVcmk6ICgpID0+IHdpZGdldCxcblx0XHRcdFx0b3BlblNlc3Npb246IGFzeW5jICgpID0+IHdpZGdldCxcblx0XHRcdFx0Z2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2U6ICgpID0+IHdpZGdldFxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElDaGF0V2lkZ2V0U2VydmljZTtcblxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFdpZGdldFNlcnZpY2UsIHdpZGdldFNlcnZpY2UpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblxuXHRcdFx0Y29uc3QgYWNjZXNzaWJsZVZpZXcgPSBuZXcgQ2hhdFJlc3BvbnNlQWNjZXNzaWJsZVZpZXcoKTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gYWNjZXNzaWJsZVZpZXcuZ2V0UHJvdmlkZXIoYWNjZXNzb3IpKTtcblx0XHRcdGFzc2VydC5vayhwcm92aWRlcik7XG5cdFx0XHRzdG9yZS5hZGQocHJvdmlkZXIpO1xuXHRcdFx0Y29uc3QgY29udGVudCA9IHByb3ZpZGVyLnByb3ZpZGVDb250ZW50KCk7XG5cdFx0XHRhc3NlcnQub2soY29udGVudC5pbmNsdWRlcygnUmVzcG9uc2UgY29udGVudCcpKTtcblx0XHRcdGFzc2VydC5vayhjb250ZW50LmluY2x1ZGVzKCdUaGlua2luZzogUmVhc29uaW5nJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5jbHVkZXMgZmlsZSBwYXRoIGZvciBVUkkgaW5saW5lIHJlZmVyZW5jZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblxuXHRcdFx0Y29uc3QgaW5saW5lUmVmZXJlbmNlVXJpID0gVVJJLmZpbGUoJy9wYXRoL3RvL2luZGV4LnRzJyk7XG5cdFx0XHRjb25zdCByZXNwb25zZUl0ZW0gPSB7XG5cdFx0XHRcdHJlc3BvbnNlOiB7XG5cdFx0XHRcdFx0dmFsdWU6IFtcblx0XHRcdFx0XHRcdHsga2luZDogJ21hcmtkb3duQ29udGVudCcsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnU2VlIGZpbGUgJykgfSxcblx0XHRcdFx0XHRcdHsga2luZDogJ2lubGluZVJlZmVyZW5jZScsIGlubGluZVJlZmVyZW5jZTogaW5saW5lUmVmZXJlbmNlVXJpLCBuYW1lOiAnaW5kZXgudHMnIH0sXG5cdFx0XHRcdFx0XHR7IGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLCBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJyBmb3IgZGV0YWlscycpIH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG1vZGVsOiB7IG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lIH0sXG5cdFx0XHRcdHNldFZvdGU6ICgpID0+IHVuZGVmaW5lZFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gW3Jlc3BvbnNlSXRlbV07XG5cdFx0XHRsZXQgZm9jdXNlZEl0ZW06IHVua25vd24gPSByZXNwb25zZUl0ZW07XG5cblx0XHRcdGNvbnN0IHdpZGdldCA9IHtcblx0XHRcdFx0aGFzSW5wdXRGb2N1czogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdGZvY3VzUmVzcG9uc2VJdGVtOiAoKSA9PiB7IGZvY3VzZWRJdGVtID0gcmVzcG9uc2VJdGVtOyB9LFxuXHRcdFx0XHRnZXRGb2N1czogKCkgPT4gZm9jdXNlZEl0ZW0sXG5cdFx0XHRcdGZvY3VzOiAoaXRlbTogdW5rbm93bikgPT4geyBmb2N1c2VkSXRlbSA9IGl0ZW07IH0sXG5cdFx0XHRcdHZpZXdNb2RlbDogeyBnZXRJdGVtczogKCkgPT4gaXRlbXMgfVxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElDaGF0V2lkZ2V0O1xuXG5cdFx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0ge1xuXHRcdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdGxhc3RGb2N1c2VkV2lkZ2V0OiB3aWRnZXQsXG5cdFx0XHRcdG9uRGlkQWRkV2lkZ2V0OiBFdmVudC5Ob25lLFxuXHRcdFx0XHRvbkRpZEJhY2tncm91bmRTZXNzaW9uOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRyZXZlYWw6IGFzeW5jICgpID0+IHRydWUsXG5cdFx0XHRcdHJldmVhbFdpZGdldDogYXN5bmMgKCkgPT4gd2lkZ2V0LFxuXHRcdFx0XHRnZXRBbGxXaWRnZXRzOiAoKSA9PiBbd2lkZ2V0XSxcblx0XHRcdFx0Z2V0V2lkZ2V0QnlJbnB1dFVyaTogKCkgPT4gd2lkZ2V0LFxuXHRcdFx0XHRvcGVuU2Vzc2lvbjogYXN5bmMgKCkgPT4gd2lkZ2V0LFxuXHRcdFx0XHRnZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZTogKCkgPT4gd2lkZ2V0XG5cdFx0XHR9IGFzIHVua25vd24gYXMgSUNoYXRXaWRnZXRTZXJ2aWNlO1xuXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0U2VydmljZSwgd2lkZ2V0U2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCBhY2Nlc3NpYmxlVmlldyA9IG5ldyBDaGF0UmVzcG9uc2VBY2Nlc3NpYmxlVmlldygpO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBhY2Nlc3NpYmxlVmlldy5nZXRQcm92aWRlcihhY2Nlc3NvcikpO1xuXHRcdFx0YXNzZXJ0Lm9rKHByb3ZpZGVyKTtcblx0XHRcdHN0b3JlLmFkZChwcm92aWRlcik7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gcHJvdmlkZXIucHJvdmlkZUNvbnRlbnQoKTtcblx0XHRcdGFzc2VydC5vayhjb250ZW50LmluY2x1ZGVzKCdpbmRleC50cycpKTtcblx0XHRcdGFzc2VydC5vayhjb250ZW50LmluY2x1ZGVzKGlubGluZVJlZmVyZW5jZVVyaS5wYXRoKSk7XG5cdFx0XHRhc3NlcnQub2soY29udGVudC5pbmNsdWRlcygnU2VlIGZpbGUnKSk7XG5cdFx0XHRhc3NlcnQub2soY29udGVudC5pbmNsdWRlcygnZm9yIGRldGFpbHMnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmNsdWRlcyBmaWxlIHBhdGggYW5kIGxpbmUgbnVtYmVyIGZvciBMb2NhdGlvbiBpbmxpbmUgcmVmZXJlbmNlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXG5cdFx0XHRjb25zdCBmaWxlTG9jYXRpb246IExvY2F0aW9uID0ge1xuXHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvc3JjL2FwcC9tYWluLnRzJyksXG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoNDIsIDEsIDQyLCAyMClcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3BvbnNlSXRlbSA9IHtcblx0XHRcdFx0cmVzcG9uc2U6IHtcblx0XHRcdFx0XHR2YWx1ZTogW1xuXHRcdFx0XHRcdFx0eyBraW5kOiAnbWFya2Rvd25Db250ZW50JywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdFcnJvciBhdCAnKSB9LFxuXHRcdFx0XHRcdFx0eyBraW5kOiAnaW5saW5lUmVmZXJlbmNlJywgaW5saW5lUmVmZXJlbmNlOiBmaWxlTG9jYXRpb24sIG5hbWU6ICdtYWluLnRzJyB9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRtb2RlbDogeyBvbkRpZENoYW5nZTogRXZlbnQuTm9uZSB9LFxuXHRcdFx0XHRzZXRWb3RlOiAoKSA9PiB1bmRlZmluZWRcblx0XHRcdH07XG5cdFx0XHRjb25zdCBpdGVtcyA9IFtyZXNwb25zZUl0ZW1dO1xuXHRcdFx0bGV0IGZvY3VzZWRJdGVtOiB1bmtub3duID0gcmVzcG9uc2VJdGVtO1xuXG5cdFx0XHRjb25zdCB3aWRnZXQgPSB7XG5cdFx0XHRcdGhhc0lucHV0Rm9jdXM6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRmb2N1c1Jlc3BvbnNlSXRlbTogKCkgPT4geyBmb2N1c2VkSXRlbSA9IHJlc3BvbnNlSXRlbTsgfSxcblx0XHRcdFx0Z2V0Rm9jdXM6ICgpID0+IGZvY3VzZWRJdGVtLFxuXHRcdFx0XHRmb2N1czogKGl0ZW06IHVua25vd24pID0+IHsgZm9jdXNlZEl0ZW0gPSBpdGVtOyB9LFxuXHRcdFx0XHR2aWV3TW9kZWw6IHsgZ2V0SXRlbXM6ICgpID0+IGl0ZW1zIH1cblx0XHRcdH0gYXMgdW5rbm93biBhcyBJQ2hhdFdpZGdldDtcblxuXHRcdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IHtcblx0XHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRsYXN0Rm9jdXNlZFdpZGdldDogd2lkZ2V0LFxuXHRcdFx0XHRvbkRpZEFkZFdpZGdldDogRXZlbnQuTm9uZSxcblx0XHRcdFx0b25EaWRCYWNrZ3JvdW5kU2Vzc2lvbjogRXZlbnQuTm9uZSxcblx0XHRcdFx0cmV2ZWFsOiBhc3luYyAoKSA9PiB0cnVlLFxuXHRcdFx0XHRyZXZlYWxXaWRnZXQ6IGFzeW5jICgpID0+IHdpZGdldCxcblx0XHRcdFx0Z2V0QWxsV2lkZ2V0czogKCkgPT4gW3dpZGdldF0sXG5cdFx0XHRcdGdldFdpZGdldEJ5SW5wdXRVcmk6ICgpID0+IHdpZGdldCxcblx0XHRcdFx0b3BlblNlc3Npb246IGFzeW5jICgpID0+IHdpZGdldCxcblx0XHRcdFx0Z2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2U6ICgpID0+IHdpZGdldFxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElDaGF0V2lkZ2V0U2VydmljZTtcblxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFdpZGdldFNlcnZpY2UsIHdpZGdldFNlcnZpY2UpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblxuXHRcdFx0Y29uc3QgYWNjZXNzaWJsZVZpZXcgPSBuZXcgQ2hhdFJlc3BvbnNlQWNjZXNzaWJsZVZpZXcoKTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gYWNjZXNzaWJsZVZpZXcuZ2V0UHJvdmlkZXIoYWNjZXNzb3IpKTtcblx0XHRcdGFzc2VydC5vayhwcm92aWRlcik7XG5cdFx0XHRzdG9yZS5hZGQocHJvdmlkZXIpO1xuXHRcdFx0Y29uc3QgY29udGVudCA9IHByb3ZpZGVyLnByb3ZpZGVDb250ZW50KCk7XG5cdFx0XHRhc3NlcnQub2soY29udGVudC5pbmNsdWRlcygnbWFpbi50cycpKTtcblx0XHRcdGFzc2VydC5vayhjb250ZW50LmluY2x1ZGVzKGAke2ZpbGVMb2NhdGlvbi51cmkucGF0aH06NDJgKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VzIGJhc2VuYW1lIGFzIG5hbWUgZm9yIFVSSSBpbmxpbmUgcmVmZXJlbmNlcyB3aXRob3V0IGV4cGxpY2l0IG5hbWUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblxuXHRcdFx0Y29uc3QgaW5saW5lUmVmZXJlbmNlVXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2Uvc3JjL3V0aWxzLnRzJyk7XG5cdFx0XHRjb25zdCByZXNwb25zZUl0ZW0gPSB7XG5cdFx0XHRcdHJlc3BvbnNlOiB7XG5cdFx0XHRcdFx0dmFsdWU6IFtcblx0XHRcdFx0XHRcdHsga2luZDogJ2lubGluZVJlZmVyZW5jZScsIGlubGluZVJlZmVyZW5jZTogaW5saW5lUmVmZXJlbmNlVXJpIH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG1vZGVsOiB7IG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lIH0sXG5cdFx0XHRcdHNldFZvdGU6ICgpID0+IHVuZGVmaW5lZFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gW3Jlc3BvbnNlSXRlbV07XG5cdFx0XHRsZXQgZm9jdXNlZEl0ZW06IHVua25vd24gPSByZXNwb25zZUl0ZW07XG5cblx0XHRcdGNvbnN0IHdpZGdldCA9IHtcblx0XHRcdFx0aGFzSW5wdXRGb2N1czogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdGZvY3VzUmVzcG9uc2VJdGVtOiAoKSA9PiB7IGZvY3VzZWRJdGVtID0gcmVzcG9uc2VJdGVtOyB9LFxuXHRcdFx0XHRnZXRGb2N1czogKCkgPT4gZm9jdXNlZEl0ZW0sXG5cdFx0XHRcdGZvY3VzOiAoaXRlbTogdW5rbm93bikgPT4geyBmb2N1c2VkSXRlbSA9IGl0ZW07IH0sXG5cdFx0XHRcdHZpZXdNb2RlbDogeyBnZXRJdGVtczogKCkgPT4gaXRlbXMgfVxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElDaGF0V2lkZ2V0O1xuXG5cdFx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0ge1xuXHRcdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdGxhc3RGb2N1c2VkV2lkZ2V0OiB3aWRnZXQsXG5cdFx0XHRcdG9uRGlkQWRkV2lkZ2V0OiBFdmVudC5Ob25lLFxuXHRcdFx0XHRvbkRpZEJhY2tncm91bmRTZXNzaW9uOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRyZXZlYWw6IGFzeW5jICgpID0+IHRydWUsXG5cdFx0XHRcdHJldmVhbFdpZGdldDogYXN5bmMgKCkgPT4gd2lkZ2V0LFxuXHRcdFx0XHRnZXRBbGxXaWRnZXRzOiAoKSA9PiBbd2lkZ2V0XSxcblx0XHRcdFx0Z2V0V2lkZ2V0QnlJbnB1dFVyaTogKCkgPT4gd2lkZ2V0LFxuXHRcdFx0XHRvcGVuU2Vzc2lvbjogYXN5bmMgKCkgPT4gd2lkZ2V0LFxuXHRcdFx0XHRnZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZTogKCkgPT4gd2lkZ2V0XG5cdFx0XHR9IGFzIHVua25vd24gYXMgSUNoYXRXaWRnZXRTZXJ2aWNlO1xuXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0U2VydmljZSwgd2lkZ2V0U2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCBhY2Nlc3NpYmxlVmlldyA9IG5ldyBDaGF0UmVzcG9uc2VBY2Nlc3NpYmxlVmlldygpO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBhY2Nlc3NpYmxlVmlldy5nZXRQcm92aWRlcihhY2Nlc3NvcikpO1xuXHRcdFx0YXNzZXJ0Lm9rKHByb3ZpZGVyKTtcblx0XHRcdHN0b3JlLmFkZChwcm92aWRlcik7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gcHJvdmlkZXIucHJvdmlkZUNvbnRlbnQoKTtcblx0XHRcdGFzc2VydC5vayhjb250ZW50LmluY2x1ZGVzKCd1dGlscy50cycpKTtcblx0XHRcdGFzc2VydC5vayhjb250ZW50LmluY2x1ZGVzKGlubGluZVJlZmVyZW5jZVVyaS5wYXRoKSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGFBQWE7QUFFdEIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyw0QkFBNEIsbURBQW1ELGdDQUFnQyw2QkFBNkIsd0NBQXdDO0FBQzdMLFNBQXNCLDBCQUEwQjtBQUVoRCxTQUFTLDBCQUEwQjtBQUVuQyxNQUFNLDhCQUE4QixNQUFNO0FBQ3pDLFFBQU0sUUFBUSx3Q0FBd0M7QUFFdEQsUUFBTSxrQ0FBa0MsTUFBTTtBQUM3QyxTQUFLLHNDQUFzQyxNQUFNO0FBQ2hELGFBQU8sWUFBWSwrQkFBK0IsTUFBUyxHQUFHLEVBQUU7QUFBQSxJQUNqRSxDQUFDO0FBRUQsU0FBSywwQ0FBMEMsTUFBTTtBQUNwRCxZQUFNLGVBQWdEO0FBQUEsUUFDckQsTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLFVBQ1osVUFBVTtBQUFBLFVBQ1YsWUFBWTtBQUFBLFVBQ1osWUFBWTtBQUFBLFFBQ2I7QUFBQSxRQUNBLFVBQVU7QUFBQSxNQUNYO0FBRUEsYUFBTyxZQUFZLCtCQUErQixZQUFZLEdBQUcsd0JBQXdCO0FBQUEsSUFDMUYsQ0FBQztBQUVELFNBQUssbUVBQW1FLE1BQU07QUFDN0UsWUFBTSxlQUFnRDtBQUFBLFFBQ3JELE1BQU07QUFBQSxRQUNOLGFBQWE7QUFBQSxVQUNaLFVBQVU7QUFBQSxVQUNWLFlBQVk7QUFBQSxRQUNiO0FBQUEsUUFDQSxVQUFVO0FBQUEsTUFDWDtBQUNBLGFBQU8sWUFB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
