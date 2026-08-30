import assert from "assert";
import { Event } from "../../../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { DisposableStore } from "../../../../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../../../../base/common/observable.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { mainWindow } from "../../../../../../../base/browser/window.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { Range } from "../../../../../../../editor/common/core/range.js";
import { SymbolKind, SymbolTag } from "../../../../../../../editor/common/languages.js";
import { ILinkPresentationService } from "../../../../../../../platform/dataChannel/common/dataChannel.js";
import { IHoverService } from "../../../../../../../platform/hover/browser/hover.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { toAgentHostUri } from "../../../../../../../platform/agentHost/common/agentHostUri.js";
import { workbenchInstantiationService } from "../../../../../../test/browser/workbenchTestServices.js";
import { ChatMarkdownContentPart } from "../../../../browser/widget/chatContentParts/chatMarkdownContentPart.js";
import { ChatContentMarkdownRenderer } from "../../../../browser/widget/chatContentMarkdownRenderer.js";
import { IChatOutputRendererService } from "../../../../browser/chatOutputItemRenderer.js";
import { IChatOutputPartStateCache } from "../../../../browser/widget/chatContentParts/chatOutputPartStateCache.js";
import { IChatSessionsService } from "../../../../common/chatSessionsService.js";
import { ChatConfiguration } from "../../../../common/constants.js";
import { rewriteAgentHostLinkTarget } from "../../../../browser/agentSessions/agentHost/stateToProgressAdapter.js";
import { IAiEditTelemetryService } from "../../../../../editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js";
import { IViewDescriptorService } from "../../../../../../common/views.js";
import { MockChatSessionsService } from "../../../common/mockChatSessionsService.js";
suite("ChatMarkdownContentPart", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let disposables;
  let instantiationService;
  let editorPool;
  let renderer;
  let chatSessionsService;
  const renderedCodeBlocks = [];
  const renderedCodeBlockOutputs = [];
  let outputStateCache;
  function createMockEditorPool() {
    return {
      get() {
        const element = mainWindow.document.createElement("div");
        const mockPart = {
          element,
          get uri() {
            return void 0;
          },
          render(data, _width) {
            renderedCodeBlocks.push(data);
          },
          layout() {
          },
          focus() {
          },
          reset() {
          },
          onDidRemount() {
          }
        };
        return {
          object: mockPart,
          isStale: () => false,
          dispose: () => {
          }
        };
      },
      inUse: () => [],
      dispose: () => {
      }
    };
  }
  function createRenderContext(isComplete = true) {
    const mockElement = {
      isComplete,
      isCompleteAddedRequest: false,
      id: "test-response-id",
      sessionResource: URI.parse("chat-session://test/session1"),
      setVote: () => {
      },
      contentReferences: [],
      get model() {
        return {};
      }
    };
    const markdownContent = { kind: "markdownContent", content: new MarkdownString("") };
    return {
      element: mockElement,
      inlineTextModels: void 0,
      elementIndex: 0,
      container: mainWindow.document.createElement("div"),
      content: [markdownContent],
      contentIndex: 0,
      editorPool,
      codeBlockStartIndex: 0,
      treeStartIndex: 0,
      diffEditorPool: {},
      currentWidth: observableValue("currentWidth", 500),
      onDidChangeVisibility: Event.None
    };
  }
  function createMarkdownPart(markdownText, context, fillInIncompleteTokens = false) {
    const ctx = context ?? createRenderContext();
    return store.add(instantiationService.createInstance(
      ChatMarkdownContentPart,
      { kind: "markdownContent", content: new MarkdownString(markdownText) },
      ctx,
      editorPool,
      fillInIncompleteTokens,
      ctx.codeBlockStartIndex,
      renderer,
      void 0,
      // markdownRenderOptions
      500,
      // currentWidth
      {}
      // rendererOptions
    ));
  }
  function createMarkdownPartWithInlineReferences(markdownText, inlineReferences, context, fillInIncompleteTokens = false) {
    const ctx = context ?? createRenderContext();
    return store.add(instantiationService.createInstance(
      ChatMarkdownContentPart,
      { kind: "markdownContent", content: new MarkdownString(markdownText), inlineReferences },
      ctx,
      editorPool,
      fillInIncompleteTokens,
      ctx.codeBlockStartIndex,
      renderer,
      void 0,
      500,
      {}
    ));
  }
  setup(() => {
    disposables = store.add(new DisposableStore());
    instantiationService = workbenchInstantiationService(void 0, disposables);
    chatSessionsService = new MockChatSessionsService();
    instantiationService.stub(IChatSessionsService, chatSessionsService);
    renderedCodeBlocks.length = 0;
    renderedCodeBlockOutputs.length = 0;
    outputStateCache = /* @__PURE__ */ new Map();
    const configService = instantiationService.get(IConfigurationService);
    configService.setUserConfiguration("chat", {
      editor: {
        fontSize: 13,
        fontFamily: "default",
        fontWeight: "normal",
        lineHeight: 0,
        wordWrap: "on"
      }
    });
    configService.setUserConfiguration("editor", {
      fontFamily: "Consolas",
      fontLigatures: false,
      accessibilitySupport: "off"
    });
    instantiationService.stub(IHoverService, {
      _serviceBrand: void 0,
      showDelayedHover: () => void 0,
      setupDelayedHover: () => ({ dispose: () => {
      } }),
      setupDelayedHoverAtMouse: () => ({ dispose: () => {
      } }),
      showInstantHover: () => void 0,
      hideHover: () => {
      },
      showAndFocusLastHover: () => {
      },
      setupManagedHover: () => ({ dispose: () => {
      }, show: () => {
      }, hide: () => {
      }, update: () => {
      } }),
      showManagedHover: () => {
      }
    });
    instantiationService.stub(IAiEditTelemetryService, {
      _serviceBrand: void 0,
      createSuggestionId: () => void 0,
      handleCodeAccepted: () => {
      },
      handleCodeRejected: () => {
      }
    });
    instantiationService.stub(IChatOutputRendererService, {
      _serviceBrand: void 0,
      registerRenderer: () => ({ dispose: () => {
      } }),
      hasCodeBlockRenderer: (identifier) => identifier.toLowerCase() === "mermaid",
      renderOutputPart: async () => {
        throw new Error("Unexpected output render");
      },
      renderCodeBlock: async (identifier, data) => {
        renderedCodeBlockOutputs.push({ identifier, text: new TextDecoder().decode(data) });
        return {
          webview: {
            focus: () => {
            },
            onDidWheel: Event.None,
            onDidUpdateState: Event.None
          },
          onDidChangeHeight: Event.None,
          reinitialize: () => {
          },
          dispose: () => {
          }
        };
      }
    });
    instantiationService.stub(IChatOutputPartStateCache, {
      _serviceBrand: void 0,
      get: (key) => outputStateCache.get(key),
      set: (key, state) => outputStateCache.set(key, state)
    });
    instantiationService.stub(IViewDescriptorService, {
      onDidChangeLocation: Event.None,
      onDidChangeContainer: Event.None,
      getViewLocationById: () => null
    });
    renderer = instantiationService.createInstance(ChatContentMarkdownRenderer);
    editorPool = createMockEditorPool();
  });
  teardown(() => {
    disposables.dispose();
  });
  test("transforms accumulated response Markdown while preserving link text", () => {
    disposables.add(chatSessionsService.registerChatSessionContentProvider("chat-session", {
      provideChatSessionContent: async () => {
        throw new Error("Unexpected session resolution");
      },
      resolveChatResponseUri: (_resource, href) => rewriteAgentHostLinkTarget(href, "my-host")
    }));
    const part = createMarkdownPart('`[foo.ts](/code.ts)` [a[b].ts](/remote/a.ts "/remote/a.ts"), [a\\*b.ts](/remote/b.ts), [line.ts](/remote/line.ts:42), [column.ts](/remote/column.ts:42:7), [windows.ts](C:/remote/windows.ts:42), [unc.ts](//server/share/unc.ts:42), [skill](/remote/skill/SKILL.md), and [file-uri.ts](file:///remote/file-uri.ts:42). ![image](/remote/image.png)');
    const links = Array.from(part.domNode.querySelectorAll("a"));
    const skillUri = toAgentHostUri(URI.file("/remote/skill/SKILL.md"), "my-host");
    assert.deepStrictEqual(
      {
        links: links.map((link) => ({ text: link.textContent, href: link.dataset.href })),
        imageSource: part.domNode.querySelector("img")?.getAttribute("src")
      },
      {
        links: [
          { text: "a[b].ts", href: toAgentHostUri(URI.file("/remote/a.ts"), "my-host").toString() },
          { text: "a*b.ts", href: toAgentHostUri(URI.file("/remote/b.ts"), "my-host").toString() },
          { text: "line.ts", href: toAgentHostUri(URI.file("/remote/line.ts").with({ fragment: "L42" }), "my-host").toString() },
          { text: "column.ts", href: toAgentHostUri(URI.file("/remote/column.ts").with({ fragment: "L42,7" }), "my-host").toString() },
          { text: "windows.ts", href: toAgentHostUri(URI.file("C:/remote/windows.ts").with({ fragment: "L42" }), "my-host").toString() },
          { text: "unc.ts", href: toAgentHostUri(URI.file("//server/share/unc.ts").with({ fragment: "L42" }), "my-host").toString() },
          { text: "skill", href: skillUri.with({ query: `${skillUri.query}&vscodeLinkType=skill` }).toString() },
          { text: "file-uri.ts", href: toAgentHostUri(URI.file("/remote/file-uri.ts").with({ fragment: "L42" }), "my-host").toString() }
        ],
        imageSource: null
      }
    );
  });
  test("renders plain markdown without code blocks", () => {
    const part = createMarkdownPart("Hello, world!");
    assert.ok(part.domNode);
    assert.strictEqual(part.codeblocks.length, 0);
    assert.strictEqual(renderedCodeBlocks.length, 0);
    assert.ok(part.domNode.textContent?.includes("Hello, world!"));
  });
  test("gates rich link rendering behind the chat setting", () => {
    const rule = {
      id: "test.linkPresentation",
      uriPattern: /^https:\/\/github\.com\/microsoft\/vscode\/pull\/1$/,
      initialKind: "pullRequest"
    };
    const presentation = observableValue("test.linkPresentation", {
      kind: "pullRequest",
      title: "Test pull request"
    });
    let ruleChecks = 0;
    let watcherCreations = 0;
    instantiationService.stub(ILinkPresentationService, {
      _serviceBrand: void 0,
      onDidChangeLinkPresentationRules: Event.None,
      linkPresentationRules: [rule],
      registerLinkPresentationProvider: () => ({ dispose: () => {
      } }),
      registerExtensionLinkPresentationProvider: () => ({ dispose: () => {
      } }),
      getLinkPresentationRule: (resource) => {
        ruleChecks++;
        return rule.uriPattern.test(resource.toString(true)) ? rule : void 0;
      },
      createLinkPresentationWatcher: () => {
        watcherCreations++;
        return { presentation, dispose: () => {
        } };
      }
    });
    const configurationService = instantiationService.get(IConfigurationService);
    configurationService.setUserConfiguration(ChatConfiguration.RichLinks, false);
    const disabledPart = createMarkdownPart("[pull request](https://github.com/microsoft/vscode/pull/1)");
    configurationService.setUserConfiguration(ChatConfiguration.RichLinks, true);
    const enabledPart = createMarkdownPart("[pull request](https://github.com/microsoft/vscode/pull/1)");
    assert.deepStrictEqual({
      disabledRichLinks: disabledPart.domNode.querySelectorAll(".chat-rich-link").length,
      enabledRichLinks: enabledPart.domNode.querySelectorAll(".chat-rich-link").length,
      ruleChecks,
      watcherCreations
    }, {
      disabledRichLinks: 0,
      enabledRichLinks: 1,
      ruleChecks: 1,
      watcherCreations: 1
    });
  });
  test("renders a single code block and passes text to CodeBlockPart", () => {
    const part = createMarkdownPart('```javascript\nconsole.log("hello");\n```');
    assert.strictEqual(part.codeblocks.length, 1);
    assert.strictEqual(part.codeblocks[0].codeBlockIndex, 0);
    assert.strictEqual(part.codeblocks[0].languageId, "javascript");
    assert.strictEqual(renderedCodeBlocks.length, 1);
    assert.strictEqual(renderedCodeBlocks[0].text, 'console.log("hello");');
    assert.strictEqual(renderedCodeBlocks[0].languageId, "javascript");
  });
  test("renders complete code block with contributed chat output renderer", () => {
    const part = createMarkdownPart("```mermaid\ngraph TD\n```");
    assert.strictEqual(part.codeblocks.length, 1);
    assert.strictEqual(part.codeblocks[0].languageId, "mermaid");
    assert.strictEqual(renderedCodeBlocks.length, 0);
    assert.deepStrictEqual(renderedCodeBlockOutputs, [{ identifier: "mermaid", text: "graph TD" }]);
    assert.ok(part.domNode.querySelector(".chat-output-code-block"));
  });
  test("renders complete code block with contributed chat output renderer case-insensitively", () => {
    const part = createMarkdownPart("```Mermaid\ngraph TD\n```");
    assert.strictEqual(part.codeblocks.length, 1);
    assert.strictEqual(part.codeblocks[0].languageId, "Mermaid");
    assert.strictEqual(renderedCodeBlocks.length, 0);
    assert.deepStrictEqual(renderedCodeBlockOutputs, [{ identifier: "Mermaid", text: "graph TD" }]);
    assert.ok(part.domNode.querySelector(".chat-output-code-block"));
  });
  test("reuses rendered code block webview across incremental rerenders when content is unchanged", async () => {
    const configService = instantiationService.get(IConfigurationService);
    configService.setUserConfiguration(ChatConfiguration.IncrementalRendering, true);
    const ctx = createRenderContext(false);
    const markdown = "```mermaid\ngraph TD\n```";
    const part = createMarkdownPart(markdown, ctx, true);
    assert.strictEqual(renderedCodeBlockOutputs.length, 1);
    assert.strictEqual(part.tryIncrementalUpdate({ kind: "markdownContent", content: new MarkdownString(`${markdown}

Next paragraph`) }), true);
    await new Promise((resolve) => mainWindow.requestAnimationFrame(() => resolve()));
    assert.deepStrictEqual({
      renderedOutputs: renderedCodeBlockOutputs,
      outputBlockCount: part.domNode.querySelectorAll(".chat-output-code-block").length
    }, {
      renderedOutputs: [{ identifier: "mermaid", text: "graph TD" }],
      outputBlockCount: 1
    });
  });
  test("does not render initial incomplete code fence", () => {
    const ctx = createRenderContext(false);
    const part = createMarkdownPart("```", ctx);
    assert.strictEqual(part.codeblocks.length, 0);
    assert.strictEqual(renderedCodeBlocks.length, 0);
    assert.strictEqual(renderedCodeBlockOutputs.length, 0);
    assert.strictEqual(part.domNode.querySelector(".interactive-result-code-block"), null);
  });
  test("shows pending chat output renderer for incomplete code block", () => {
    const ctx = createRenderContext(false);
    const part = createMarkdownPart("```mermaid\ngraph TD", ctx);
    assert.strictEqual(renderedCodeBlockOutputs.length, 0);
    assert.strictEqual(renderedCodeBlocks.length, 0);
    assert.strictEqual(part.codeblocks.length, 1);
    assert.strictEqual(part.codeblocks[0].languageId, "mermaid");
    assert.ok(part.domNode.querySelector(".chat-output-code-block"));
    assert.ok(part.domNode.textContent?.includes("Rendering code block"));
  });
  test("renders multiple code blocks with correct indices", () => {
    const part = createMarkdownPart(
      'Some text\n```python\nprint("a")\n```\nMore text\n```typescript\nconst x = 1;\n```'
    );
    assert.strictEqual(part.codeblocks.length, 2);
    assert.strictEqual(part.codeblocks[0].codeBlockIndex, 0);
    assert.strictEqual(part.codeblocks[0].languageId, "python");
    assert.strictEqual(part.codeblocks[1].codeBlockIndex, 1);
    assert.strictEqual(part.codeblocks[1].languageId, "typescript");
    assert.strictEqual(renderedCodeBlocks[0].text, 'print("a")');
    assert.strictEqual(renderedCodeBlocks[1].text, "const x = 1;");
  });
  test("code block text is passed correctly", () => {
    const code = 'function greet() {\n  return "hello";\n}';
    createMarkdownPart("```javascript\n" + code + "\n```");
    assert.strictEqual(renderedCodeBlocks.length, 1);
    assert.strictEqual(renderedCodeBlocks[0].text, code);
    assert.strictEqual(renderedCodeBlocks[0].languageId, "javascript");
  });
  test("code block without language id passes empty languageId", () => {
    createMarkdownPart("```\nsome text\n```");
    assert.strictEqual(renderedCodeBlocks.length, 1);
    assert.strictEqual(renderedCodeBlocks[0].text, "some text");
  });
  test("respects codeBlockStartIndex for global indexing", () => {
    const ctx = createRenderContext();
    const part = store.add(instantiationService.createInstance(
      ChatMarkdownContentPart,
      { kind: "markdownContent", content: new MarkdownString("```js\ncode\n```") },
      ctx,
      editorPool,
      false,
      5,
      // codeBlockStartIndex
      renderer,
      void 0,
      500,
      {}
    ));
    assert.strictEqual(part.codeblocks.length, 1);
    assert.strictEqual(part.codeblocks[0].codeBlockIndex, 5);
  });
  test("hasSameContent returns true for same markdown", () => {
    const part = createMarkdownPart("Hello");
    assert.ok(part.hasSameContent({ kind: "markdownContent", content: new MarkdownString("Hello") }));
  });
  test("hasSameContent returns false for different markdown", () => {
    const part = createMarkdownPart("Hello");
    assert.ok(!part.hasSameContent({ kind: "markdownContent", content: new MarkdownString("Goodbye") }));
  });
  test("hasSameContent compares inline reference metadata", () => {
    const uri = URI.parse("file:///workspace/foo.ts");
    const content = "Foo";
    const initialReference = {
      kind: "inlineReference",
      resolveId: "resolve1",
      inlineReference: { uri, range: new Range(1, 1, 1, 1) },
      name: "Foo"
    };
    const part = createMarkdownPartWithInlineReferences(content, { 0: initialReference });
    assert.deepStrictEqual({
      equivalentReference: part.hasSameContent({
        kind: "markdownContent",
        content: new MarkdownString(content),
        inlineReferences: {
          0: {
            kind: "inlineReference",
            resolveId: "resolve1",
            inlineReference: { uri, range: new Range(1, 1, 1, 1) },
            name: "Foo"
          }
        }
      }),
      resolvedReference: part.hasSameContent({
        kind: "markdownContent",
        content: new MarkdownString(content),
        inlineReferences: {
          0: {
            kind: "inlineReference",
            resolveId: "resolve1",
            inlineReference: {
              name: "Foo",
              kind: SymbolKind.Class,
              location: { uri, range: new Range(2, 7, 2, 10) }
            },
            name: "Foo"
          }
        }
      })
    }, {
      equivalentReference: true,
      resolvedReference: false
    });
  });
  test("hasSameContent compares workspace symbol metadata", () => {
    const uri = URI.parse("file:///workspace/foo.ts");
    const content = "Foo";
    const initialReference = {
      kind: "inlineReference",
      resolveId: "resolve1",
      inlineReference: {
        name: "Foo",
        containerName: "Bar",
        kind: SymbolKind.Class,
        tags: [SymbolTag.Deprecated],
        location: { uri, range: new Range(2, 7, 2, 10) }
      },
      name: "Foo"
    };
    const part = createMarkdownPartWithInlineReferences(content, { 0: initialReference });
    assert.deepStrictEqual({
      equivalentSymbol: part.hasSameContent({
        kind: "markdownContent",
        content: new MarkdownString(content),
        inlineReferences: {
          0: {
            kind: "inlineReference",
            resolveId: "resolve1",
            inlineReference: {
              name: "Foo",
              containerName: "Bar",
              kind: SymbolKind.Class,
              tags: [SymbolTag.Deprecated],
              location: { uri, range: new Range(2, 7, 2, 10) }
            },
            name: "Foo"
          }
        }
      }),
      differentContainer: part.hasSameContent({
        kind: "markdownContent",
        content: new MarkdownString(content),
        inlineReferences: {
          0: {
            kind: "inlineReference",
            resolveId: "resolve1",
            inlineReference: {
              name: "Foo",
              containerName: "Baz",
              kind: SymbolKind.Class,
              tags: [SymbolTag.Deprecated],
              location: { uri, range: new Range(2, 7, 2, 10) }
            },
            name: "Foo"
          }
        }
      }),
      differentTags: part.hasSameContent({
        kind: "markdownContent",
        content: new MarkdownString(content),
        inlineReferences: {
          0: {
            kind: "inlineReference",
            resolveId: "resolve1",
            inlineReference: {
              name: "Foo",
              containerName: "Bar",
              kind: SymbolKind.Class,
              tags: [],
              location: { uri, range: new Range(2, 7, 2, 10) }
            },
            name: "Foo"
          }
        }
      })
    }, {
      equivalentSymbol: true,
      differentContainer: false,
      differentTags: false
    });
  });
  test("tryIncrementalUpdate requires unchanged inline reference metadata", () => {
    const configService = instantiationService.get(IConfigurationService);
    configService.setUserConfiguration(ChatConfiguration.IncrementalRendering, true);
    const uri = URI.parse("file:///workspace/foo.ts");
    const content = "Foo";
    const initialReference = {
      kind: "inlineReference",
      resolveId: "resolve1",
      inlineReference: { uri, range: new Range(1, 1, 1, 1) },
      name: "Foo"
    };
    const context = createRenderContext(false);
    const part = createMarkdownPartWithInlineReferences(content, { 0: initialReference }, context, true);
    assert.deepStrictEqual({
      unchangedReference: part.tryIncrementalUpdate({
        kind: "markdownContent",
        content: new MarkdownString(content),
        inlineReferences: { 0: initialReference }
      }),
      resolvedReference: part.tryIncrementalUpdate({
        kind: "markdownContent",
        content: new MarkdownString(content),
        inlineReferences: {
          0: {
            kind: "inlineReference",
            resolveId: "resolve1",
            inlineReference: {
              name: "Foo",
              kind: SymbolKind.Class,
              location: { uri, range: new Range(2, 7, 2, 10) }
            },
            name: "Foo"
          }
        }
      })
    }, {
      unchangedReference: true,
      resolvedReference: false
    });
  });
  test("php code blocks get php opening tag prepended", () => {
    createMarkdownPart('```php\necho "hello";\n```');
    assert.strictEqual(renderedCodeBlocks.length, 1);
    assert.ok(renderedCodeBlocks[0].text.startsWith("<?php\n"), "PHP code should have <?php prepended");
  });
  test("php code blocks with existing opening tag are not modified", () => {
    createMarkdownPart('```php\n<?php\necho "hello";\n```');
    assert.strictEqual(renderedCodeBlocks.length, 1);
    assert.ok(!renderedCodeBlocks[0].text.startsWith("<?php\n<?php"), "PHP code with existing tag should not be doubled");
  });
  test("strips codeblock uri annotations before rendering standard code blocks", () => {
    createMarkdownPart("```typescript\nconst value = 1;\n<vscode_codeblock_uri>file:///test.ts</vscode_codeblock_uri>\n```");
    assert.strictEqual(renderedCodeBlocks.length, 1);
    assert.ok(!renderedCodeBlocks[0].text.includes("<vscode_codeblock_uri"));
    assert.strictEqual(renderedCodeBlocks[0].codemapperUri?.toString(), "file:///test.ts");
  });
  test("code block toolbar context is set correctly with code text", () => {
    createMarkdownPart('```js\nconsole.log("hello");\n```');
    assert.strictEqual(renderedCodeBlocks.length, 1);
    assert.strictEqual(renderedCodeBlocks[0].text, 'console.log("hello");');
    assert.strictEqual(renderedCodeBlocks[0].languageId, "js");
    assert.strictEqual(renderedCodeBlocks[0].codeBlockIndex, 0);
  });
  test("code block maintains content when markdown is re-rendered during streaming", () => {
    const ctx = createRenderContext(
      false
      /* isComplete = false, simulating streaming */
    );
    const part1 = createMarkdownPart("```js\nconsole\n```", ctx);
    assert.strictEqual(renderedCodeBlocks.length, 1);
    assert.strictEqual(renderedCodeBlocks[0].text, "console");
    assert.strictEqual(part1.codeblocks.length, 1);
    renderedCodeBlocks.length = 0;
    const part2 = createMarkdownPart('```js\nconsole.log("hello");\n```', ctx);
    assert.strictEqual(renderedCodeBlocks.length, 1);
    assert.strictEqual(renderedCodeBlocks[0].text, 'console.log("hello");');
    assert.strictEqual(part2.codeblocks.length, 1);
    assert.strictEqual(part2.codeblocks[0].codeBlockIndex, 0);
  });
  test("code block part element is reused from pool across streaming renders", () => {
    const elements = [];
    const poolWithTracking = {
      get() {
        const element = mainWindow.document.createElement("div");
        elements.push(element);
        const mockPart = {
          element,
          get uri() {
            return void 0;
          },
          render(data, _width) {
            renderedCodeBlocks.push(data);
          },
          layout() {
          },
          focus() {
          },
          reset() {
          },
          onDidRemount() {
          }
        };
        return {
          object: mockPart,
          isStale: () => false,
          dispose: () => {
          }
        };
      },
      inUse: () => [],
      dispose: () => {
      }
    };
    const ctx = createRenderContext(false);
    store.add(instantiationService.createInstance(
      ChatMarkdownContentPart,
      { kind: "markdownContent", content: new MarkdownString("```js\nconsole\n```") },
      ctx,
      poolWithTracking,
      false,
      0,
      renderer,
      void 0,
      500,
      {}
    ));
    store.add(instantiationService.createInstance(
      ChatMarkdownContentPart,
      { kind: "markdownContent", content: new MarkdownString('```js\nconsole.log("hello");\n```') },
      ctx,
      poolWithTracking,
      false,
      0,
      renderer,
      void 0,
      500,
      {}
    ));
    assert.strictEqual(renderedCodeBlocks.length, 2);
    assert.strictEqual(renderedCodeBlocks[0].text, "console");
    assert.strictEqual(renderedCodeBlocks[1].text, 'console.log("hello");');
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdE1hcmtkb3duQ29udGVudFBhcnQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTeW1ib2xLaW5kLCBTeW1ib2xUYWcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTGlua1ByZXNlbnRhdGlvbiwgSUxpbmtQcmVzZW50YXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGF0YUNoYW5uZWwvY29tbW9uL2RhdGFDaGFubmVsLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgdG9BZ2VudEhvc3RVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdFVyaS5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRDb250ZW50UGFydHMuanMnO1xuaW1wb3J0IHsgQ2hhdE1hcmtkb3duQ29udGVudFBhcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRNYXJrZG93bkNvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRDb250ZW50TWFya2Rvd25SZW5kZXJlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50TWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQb29sLCBEaWZmRWRpdG9yUG9vbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdENvbnRlbnRDb2RlUG9vbHMuanMnO1xuaW1wb3J0IHsgQ29kZUJsb2NrUGFydCwgSUNvZGVCbG9ja0RhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NvZGVCbG9ja1BhcnQuanMnO1xuaW1wb3J0IHsgSUNoYXRPdXRwdXRSZW5kZXJlclNlcnZpY2UsIHR5cGUgUmVuZGVyZWRPdXRwdXRQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9jaGF0T3V0cHV0SXRlbVJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElDaGF0T3V0cHV0UGFydFN0YXRlQ2FjaGUsIElPdXRwdXRQYXJ0U3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRPdXRwdXRQYXJ0U3RhdGVDYWNoZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlc3BvbnNlVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50SW5saW5lUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdENvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IHJld3JpdGVBZ2VudEhvc3RMaW5rVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9zdGF0ZVRvUHJvZ3Jlc3NBZGFwdGVyLmpzJztcbmltcG9ydCB7IElBaUVkaXRUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdFRlbGVtZXRyeS9icm93c2VyL3RlbGVtZXRyeS9haUVkaXRUZWxlbWV0cnkvYWlFZGl0VGVsZW1ldHJ5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0Q29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuXG5zdWl0ZSgnQ2hhdE1hcmtkb3duQ29udGVudFBhcnQnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogUmV0dXJuVHlwZTx0eXBlb2Ygd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2U+O1xuXHRsZXQgZWRpdG9yUG9vbDogRWRpdG9yUG9vbDtcblx0bGV0IHJlbmRlcmVyOiBJTWFya2Rvd25SZW5kZXJlcjtcblx0bGV0IGNoYXRTZXNzaW9uc1NlcnZpY2U6IE1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlO1xuXG5cdC8qKiBEYXRhIGNhcHR1cmVkIGZyb20gZWFjaCBDb2RlQmxvY2tQYXJ0LnJlbmRlcigpIGNhbGwgKi9cblx0Y29uc3QgcmVuZGVyZWRDb2RlQmxvY2tzOiBJQ29kZUJsb2NrRGF0YVtdID0gW107XG5cdGNvbnN0IHJlbmRlcmVkQ29kZUJsb2NrT3V0cHV0czogeyBpZGVudGlmaWVyOiBzdHJpbmc7IHRleHQ6IHN0cmluZyB9W10gPSBbXTtcblx0bGV0IG91dHB1dFN0YXRlQ2FjaGU6IE1hcDxzdHJpbmcsIElPdXRwdXRQYXJ0U3RhdGU+O1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1vY2tFZGl0b3JQb29sKCk6IEVkaXRvclBvb2wge1xuXHRcdHJldHVybiB7XG5cdFx0XHRnZXQoKTogSURpc3Bvc2FibGVSZWZlcmVuY2U8Q29kZUJsb2NrUGFydD4ge1xuXHRcdFx0XHRjb25zdCBlbGVtZW50ID0gbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdFx0Y29uc3QgbW9ja1BhcnQgPSB7XG5cdFx0XHRcdFx0ZWxlbWVudCxcblx0XHRcdFx0XHRnZXQgdXJpKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9LFxuXHRcdFx0XHRcdHJlbmRlcihkYXRhOiBJQ29kZUJsb2NrRGF0YSwgX3dpZHRoOiBudW1iZXIpIHtcblx0XHRcdFx0XHRcdHJlbmRlcmVkQ29kZUJsb2Nrcy5wdXNoKGRhdGEpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0bGF5b3V0KCkgeyB9LFxuXHRcdFx0XHRcdGZvY3VzKCkgeyB9LFxuXHRcdFx0XHRcdHJlc2V0KCkgeyB9LFxuXHRcdFx0XHRcdG9uRGlkUmVtb3VudCgpIHsgfSxcblx0XHRcdFx0fSBhcyB1bmtub3duIGFzIENvZGVCbG9ja1BhcnQ7XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRvYmplY3Q6IG1vY2tQYXJ0LFxuXHRcdFx0XHRcdGlzU3RhbGU6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHRcdFx0fTtcblx0XHRcdH0sXG5cdFx0XHRpblVzZTogKCkgPT4gW10sXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIEVkaXRvclBvb2w7XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVSZW5kZXJDb250ZXh0KGlzQ29tcGxldGU6IGJvb2xlYW4gPSB0cnVlKTogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQge1xuXHRcdGNvbnN0IG1vY2tFbGVtZW50OiBQYXJ0aWFsPElDaGF0UmVzcG9uc2VWaWV3TW9kZWw+ID0ge1xuXHRcdFx0aXNDb21wbGV0ZSxcblx0XHRcdGlzQ29tcGxldGVBZGRlZFJlcXVlc3Q6IGZhbHNlLFxuXHRcdFx0aWQ6ICd0ZXN0LXJlc3BvbnNlLWlkJyxcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCdjaGF0LXNlc3Npb246Ly90ZXN0L3Nlc3Npb24xJyksXG5cdFx0XHRzZXRWb3RlOiAoKSA9PiB7IH0sXG5cdFx0XHRjb250ZW50UmVmZXJlbmNlczogW10sXG5cdFx0XHRnZXQgbW9kZWwoKSB7IHJldHVybiB7fSBhcyBJQ2hhdFJlc3BvbnNlVmlld01vZGVsWydtb2RlbCddOyB9LFxuXHRcdH07XG5cblx0XHRjb25zdCBtYXJrZG93bkNvbnRlbnQgPSB7IGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnIGFzIGNvbnN0LCBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJycpIH07XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZWxlbWVudDogbW9ja0VsZW1lbnQgYXMgSUNoYXRSZXNwb25zZVZpZXdNb2RlbCxcblx0XHRcdGlubGluZVRleHRNb2RlbHM6IHVuZGVmaW5lZCEsXG5cdFx0XHRlbGVtZW50SW5kZXg6IDAsXG5cdFx0XHRjb250YWluZXI6IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JyksXG5cdFx0XHRjb250ZW50OiBbbWFya2Rvd25Db250ZW50XSxcblx0XHRcdGNvbnRlbnRJbmRleDogMCxcblx0XHRcdGVkaXRvclBvb2wsXG5cdFx0XHRjb2RlQmxvY2tTdGFydEluZGV4OiAwLFxuXHRcdFx0dHJlZVN0YXJ0SW5kZXg6IDAsXG5cdFx0XHRkaWZmRWRpdG9yUG9vbDoge30gYXMgRGlmZkVkaXRvclBvb2wsXG5cdFx0XHRjdXJyZW50V2lkdGg6IG9ic2VydmFibGVWYWx1ZSgnY3VycmVudFdpZHRoJywgNTAwKSxcblx0XHRcdG9uRGlkQ2hhbmdlVmlzaWJpbGl0eTogRXZlbnQuTm9uZSxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlTWFya2Rvd25QYXJ0KG1hcmtkb3duVGV4dDogc3RyaW5nLCBjb250ZXh0PzogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsIGZpbGxJbkluY29tcGxldGVUb2tlbnMgPSBmYWxzZSk6IENoYXRNYXJrZG93bkNvbnRlbnRQYXJ0IHtcblx0XHRjb25zdCBjdHggPSBjb250ZXh0ID8/IGNyZWF0ZVJlbmRlckNvbnRleHQoKTtcblx0XHRyZXR1cm4gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdE1hcmtkb3duQ29udGVudFBhcnQsXG5cdFx0XHR7IGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLCBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcobWFya2Rvd25UZXh0KSB9LFxuXHRcdFx0Y3R4LFxuXHRcdFx0ZWRpdG9yUG9vbCxcblx0XHRcdGZpbGxJbkluY29tcGxldGVUb2tlbnMsXG5cdFx0XHRjdHguY29kZUJsb2NrU3RhcnRJbmRleCxcblx0XHRcdHJlbmRlcmVyLFxuXHRcdFx0dW5kZWZpbmVkLCAvLyBtYXJrZG93blJlbmRlck9wdGlvbnNcblx0XHRcdDUwMCwgLy8gY3VycmVudFdpZHRoXG5cdFx0XHR7fSwgLy8gcmVuZGVyZXJPcHRpb25zXG5cdFx0KSk7XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVNYXJrZG93blBhcnRXaXRoSW5saW5lUmVmZXJlbmNlcyhtYXJrZG93blRleHQ6IHN0cmluZywgaW5saW5lUmVmZXJlbmNlczogUmVjb3JkPHN0cmluZywgSUNoYXRDb250ZW50SW5saW5lUmVmZXJlbmNlPiwgY29udGV4dD86IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LCBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zID0gZmFsc2UpOiBDaGF0TWFya2Rvd25Db250ZW50UGFydCB7XG5cdFx0Y29uc3QgY3R4ID0gY29udGV4dCA/PyBjcmVhdGVSZW5kZXJDb250ZXh0KCk7XG5cdFx0cmV0dXJuIHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRNYXJrZG93bkNvbnRlbnRQYXJ0LFxuXHRcdFx0eyBraW5kOiAnbWFya2Rvd25Db250ZW50JywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKG1hcmtkb3duVGV4dCksIGlubGluZVJlZmVyZW5jZXMgfSxcblx0XHRcdGN0eCxcblx0XHRcdGVkaXRvclBvb2wsXG5cdFx0XHRmaWxsSW5JbmNvbXBsZXRlVG9rZW5zLFxuXHRcdFx0Y3R4LmNvZGVCbG9ja1N0YXJ0SW5kZXgsXG5cdFx0XHRyZW5kZXJlcixcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdDUwMCxcblx0XHRcdHt9LFxuXHRcdCkpO1xuXHR9XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzID0gc3RvcmUuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKTtcblx0XHRjaGF0U2Vzc2lvbnNTZXJ2aWNlID0gbmV3IE1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlKCk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlc3Npb25zU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSk7XG5cdFx0cmVuZGVyZWRDb2RlQmxvY2tzLmxlbmd0aCA9IDA7XG5cdFx0cmVuZGVyZWRDb2RlQmxvY2tPdXRwdXRzLmxlbmd0aCA9IDA7XG5cdFx0b3V0cHV0U3RhdGVDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBJT3V0cHV0UGFydFN0YXRlPigpO1xuXG5cdFx0Ly8gU2VlZCBjb25maWd1cmF0aW9uIHZhbHVlcyBuZWVkZWQgYnkgQ2hhdEVkaXRvck9wdGlvbnNcblx0XHRjb25zdCBjb25maWdTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSkgYXMgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRcdGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2NoYXQnLCB7XG5cdFx0XHRlZGl0b3I6IHtcblx0XHRcdFx0Zm9udFNpemU6IDEzLFxuXHRcdFx0XHRmb250RmFtaWx5OiAnZGVmYXVsdCcsXG5cdFx0XHRcdGZvbnRXZWlnaHQ6ICdub3JtYWwnLFxuXHRcdFx0XHRsaW5lSGVpZ2h0OiAwLFxuXHRcdFx0XHR3b3JkV3JhcDogJ29uJyxcblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdlZGl0b3InLCB7XG5cdFx0XHRmb250RmFtaWx5OiAnQ29uc29sYXMnLFxuXHRcdFx0Zm9udExpZ2F0dXJlczogZmFsc2UsXG5cdFx0XHRhY2Nlc3NpYmlsaXR5U3VwcG9ydDogJ29mZicsXG5cdFx0fSk7XG5cblx0XHQvLyBTdHViIGhvdmVyIHNlcnZpY2Vcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElIb3ZlclNlcnZpY2UsIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdHNob3dEZWxheWVkSG92ZXI6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdHNldHVwRGVsYXllZEhvdmVyOiAoKSA9PiAoeyBkaXNwb3NlOiAoKSA9PiB7IH0gfSksXG5cdFx0XHRzZXR1cERlbGF5ZWRIb3ZlckF0TW91c2U6ICgpID0+ICh7IGRpc3Bvc2U6ICgpID0+IHsgfSB9KSxcblx0XHRcdHNob3dJbnN0YW50SG92ZXI6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdGhpZGVIb3ZlcjogKCkgPT4geyB9LFxuXHRcdFx0c2hvd0FuZEZvY3VzTGFzdEhvdmVyOiAoKSA9PiB7IH0sXG5cdFx0XHRzZXR1cE1hbmFnZWRIb3ZlcjogKCkgPT4gKHsgZGlzcG9zZTogKCkgPT4geyB9LCBzaG93OiAoKSA9PiB7IH0sIGhpZGU6ICgpID0+IHsgfSwgdXBkYXRlOiAoKSA9PiB7IH0gfSksXG5cdFx0XHRzaG93TWFuYWdlZEhvdmVyOiAoKSA9PiB7IH0sXG5cdFx0fSk7XG5cblx0XHQvLyBTdHViIEFJIGVkaXQgdGVsZW1ldHJ5IHNlcnZpY2Vcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBaUVkaXRUZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRjcmVhdGVTdWdnZXN0aW9uSWQ6ICgpID0+IHVuZGVmaW5lZCEsXG5cdFx0XHRoYW5kbGVDb2RlQWNjZXB0ZWQ6ICgpID0+IHsgfSxcblx0XHRcdGhhbmRsZUNvZGVSZWplY3RlZDogKCkgPT4geyB9LFxuXHRcdH0pO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdE91dHB1dFJlbmRlcmVyU2VydmljZSwge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0cmVnaXN0ZXJSZW5kZXJlcjogKCkgPT4gKHsgZGlzcG9zZTogKCkgPT4geyB9IH0pLFxuXHRcdFx0aGFzQ29kZUJsb2NrUmVuZGVyZXI6IGlkZW50aWZpZXIgPT4gaWRlbnRpZmllci50b0xvd2VyQ2FzZSgpID09PSAnbWVybWFpZCcsXG5cdFx0XHRyZW5kZXJPdXRwdXRQYXJ0OiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCBvdXRwdXQgcmVuZGVyJyk7IH0sXG5cdFx0XHRyZW5kZXJDb2RlQmxvY2s6IGFzeW5jIChpZGVudGlmaWVyLCBkYXRhKSA9PiB7XG5cdFx0XHRcdHJlbmRlcmVkQ29kZUJsb2NrT3V0cHV0cy5wdXNoKHsgaWRlbnRpZmllciwgdGV4dDogbmV3IFRleHREZWNvZGVyKCkuZGVjb2RlKGRhdGEpIH0pO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHdlYnZpZXc6IHtcblx0XHRcdFx0XHRcdGZvY3VzOiAoKSA9PiB7IH0sXG5cdFx0XHRcdFx0XHRvbkRpZFdoZWVsOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRcdFx0b25EaWRVcGRhdGVTdGF0ZTogRXZlbnQuTm9uZSxcblx0XHRcdFx0XHR9IGFzIFJlbmRlcmVkT3V0cHV0UGFydFsnd2VidmlldyddLFxuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlSGVpZ2h0OiBFdmVudC5Ob25lLFxuXHRcdFx0XHRcdHJlaW5pdGlhbGl6ZTogKCkgPT4geyB9LFxuXHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHRcdFx0fTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0T3V0cHV0UGFydFN0YXRlQ2FjaGUsIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdGdldDoga2V5ID0+IG91dHB1dFN0YXRlQ2FjaGUuZ2V0KGtleSksXG5cdFx0XHRzZXQ6IChrZXksIHN0YXRlKSA9PiBvdXRwdXRTdGF0ZUNhY2hlLnNldChrZXksIHN0YXRlKSxcblx0XHR9KTtcblxuXHRcdC8vIFN0dWIgdmlldyBkZXNjcmlwdG9yIHNlcnZpY2Vcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElWaWV3RGVzY3JpcHRvclNlcnZpY2UsIHtcblx0XHRcdG9uRGlkQ2hhbmdlTG9jYXRpb246IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkRpZENoYW5nZUNvbnRhaW5lcjogRXZlbnQuTm9uZSxcblx0XHRcdGdldFZpZXdMb2NhdGlvbkJ5SWQ6ICgpID0+IG51bGwsXG5cdFx0fSk7XG5cblx0XHRyZW5kZXJlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRDb250ZW50TWFya2Rvd25SZW5kZXJlcik7XG5cblx0XHQvLyBDcmVhdGUgYSBtb2NrIGVkaXRvciBwb29sXG5cdFx0ZWRpdG9yUG9vbCA9IGNyZWF0ZU1vY2tFZGl0b3JQb29sKCk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyYW5zZm9ybXMgYWNjdW11bGF0ZWQgcmVzcG9uc2UgTWFya2Rvd24gd2hpbGUgcHJlc2VydmluZyBsaW5rIHRleHQnLCAoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGNoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcignY2hhdC1zZXNzaW9uJywge1xuXHRcdFx0cHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudDogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgc2Vzc2lvbiByZXNvbHV0aW9uJyk7IH0sXG5cdFx0XHRyZXNvbHZlQ2hhdFJlc3BvbnNlVXJpOiAoX3Jlc291cmNlLCBocmVmKSA9PiByZXdyaXRlQWdlbnRIb3N0TGlua1RhcmdldChocmVmLCAnbXktaG9zdCcpLFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVNYXJrZG93blBhcnQoJ2BbZm9vLnRzXSgvY29kZS50cylgIFthW2JdLnRzXSgvcmVtb3RlL2EudHMgXCIvcmVtb3RlL2EudHNcIiksIFthXFxcXCpiLnRzXSgvcmVtb3RlL2IudHMpLCBbbGluZS50c10oL3JlbW90ZS9saW5lLnRzOjQyKSwgW2NvbHVtbi50c10oL3JlbW90ZS9jb2x1bW4udHM6NDI6NyksIFt3aW5kb3dzLnRzXShDOi9yZW1vdGUvd2luZG93cy50czo0MiksIFt1bmMudHNdKC8vc2VydmVyL3NoYXJlL3VuYy50czo0MiksIFtza2lsbF0oL3JlbW90ZS9za2lsbC9TS0lMTC5tZCksIGFuZCBbZmlsZS11cmkudHNdKGZpbGU6Ly8vcmVtb3RlL2ZpbGUtdXJpLnRzOjQyKS4gIVtpbWFnZV0oL3JlbW90ZS9pbWFnZS5wbmcpJyk7XG5cdFx0Y29uc3QgbGlua3MgPSBBcnJheS5mcm9tKHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yQWxsKCdhJykpO1xuXHRcdGNvbnN0IHNraWxsVXJpID0gdG9BZ2VudEhvc3RVcmkoVVJJLmZpbGUoJy9yZW1vdGUvc2tpbGwvU0tJTEwubWQnKSwgJ215LWhvc3QnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHRsaW5rczogbGlua3MubWFwKGxpbmsgPT4gKHsgdGV4dDogbGluay50ZXh0Q29udGVudCwgaHJlZjogbGluay5kYXRhc2V0LmhyZWYgfSkpLFxuXHRcdFx0XHRpbWFnZVNvdXJjZTogcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJ2ltZycpPy5nZXRBdHRyaWJ1dGUoJ3NyYycpLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGlua3M6IFtcblx0XHRcdFx0XHR7IHRleHQ6ICdhW2JdLnRzJywgaHJlZjogdG9BZ2VudEhvc3RVcmkoVVJJLmZpbGUoJy9yZW1vdGUvYS50cycpLCAnbXktaG9zdCcpLnRvU3RyaW5nKCkgfSxcblx0XHRcdFx0XHR7IHRleHQ6ICdhKmIudHMnLCBocmVmOiB0b0FnZW50SG9zdFVyaShVUkkuZmlsZSgnL3JlbW90ZS9iLnRzJyksICdteS1ob3N0JykudG9TdHJpbmcoKSB9LFxuXHRcdFx0XHRcdHsgdGV4dDogJ2xpbmUudHMnLCBocmVmOiB0b0FnZW50SG9zdFVyaShVUkkuZmlsZSgnL3JlbW90ZS9saW5lLnRzJykud2l0aCh7IGZyYWdtZW50OiAnTDQyJyB9KSwgJ215LWhvc3QnKS50b1N0cmluZygpIH0sXG5cdFx0XHRcdFx0eyB0ZXh0OiAnY29sdW1uLnRzJywgaHJlZjogdG9BZ2VudEhvc3RVcmkoVVJJLmZpbGUoJy9yZW1vdGUvY29sdW1uLnRzJykud2l0aCh7IGZyYWdtZW50OiAnTDQyLDcnIH0pLCAnbXktaG9zdCcpLnRvU3RyaW5nKCkgfSxcblx0XHRcdFx0XHR7IHRleHQ6ICd3aW5kb3dzLnRzJywgaHJlZjogdG9BZ2VudEhvc3RVcmkoVVJJLmZpbGUoJ0M6L3JlbW90ZS93aW5kb3dzLnRzJykud2l0aCh7IGZyYWdtZW50OiAnTDQyJyB9KSwgJ215LWhvc3QnKS50b1N0cmluZygpIH0sXG5cdFx0XHRcdFx0eyB0ZXh0OiAndW5jLnRzJywgaHJlZjogdG9BZ2VudEhvc3RVcmkoVVJJLmZpbGUoJy8vc2VydmVyL3NoYXJlL3VuYy50cycpLndpdGgoeyBmcmFnbWVudDogJ0w0MicgfSksICdteS1ob3N0JykudG9TdHJpbmcoKSB9LFxuXHRcdFx0XHRcdHsgdGV4dDogJ3NraWxsJywgaHJlZjogc2tpbGxVcmkud2l0aCh7IHF1ZXJ5OiBgJHtza2lsbFVyaS5xdWVyeX0mdnNjb2RlTGlua1R5cGU9c2tpbGxgIH0pLnRvU3RyaW5nKCkgfSxcblx0XHRcdFx0XHR7IHRleHQ6ICdmaWxlLXVyaS50cycsIGhyZWY6IHRvQWdlbnRIb3N0VXJpKFVSSS5maWxlKCcvcmVtb3RlL2ZpbGUtdXJpLnRzJykud2l0aCh7IGZyYWdtZW50OiAnTDQyJyB9KSwgJ215LWhvc3QnKS50b1N0cmluZygpIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGltYWdlU291cmNlOiBudWxsLFxuXHRcdFx0fSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW5kZXJzIHBsYWluIG1hcmtkb3duIHdpdGhvdXQgY29kZSBibG9ja3MnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGFydCA9IGNyZWF0ZU1hcmtkb3duUGFydCgnSGVsbG8sIHdvcmxkIScpO1xuXG5cdFx0YXNzZXJ0Lm9rKHBhcnQuZG9tTm9kZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuY29kZWJsb2Nrcy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlZENvZGVCbG9ja3MubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQub2socGFydC5kb21Ob2RlLnRleHRDb250ZW50Py5pbmNsdWRlcygnSGVsbG8sIHdvcmxkIScpKTtcblx0fSk7XG5cblx0dGVzdCgnZ2F0ZXMgcmljaCBsaW5rIHJlbmRlcmluZyBiZWhpbmQgdGhlIGNoYXQgc2V0dGluZycsICgpID0+IHtcblx0XHRjb25zdCBydWxlID0ge1xuXHRcdFx0aWQ6ICd0ZXN0LmxpbmtQcmVzZW50YXRpb24nLFxuXHRcdFx0dXJpUGF0dGVybjogL15odHRwczpcXC9cXC9naXRodWJcXC5jb21cXC9taWNyb3NvZnRcXC92c2NvZGVcXC9wdWxsXFwvMSQvLFxuXHRcdFx0aW5pdGlhbEtpbmQ6ICdwdWxsUmVxdWVzdCcgYXMgY29uc3QsXG5cdFx0fTtcblx0XHRjb25zdCBwcmVzZW50YXRpb24gPSBvYnNlcnZhYmxlVmFsdWU8SUxpbmtQcmVzZW50YXRpb24gfCB1bmRlZmluZWQ+KCd0ZXN0LmxpbmtQcmVzZW50YXRpb24nLCB7XG5cdFx0XHRraW5kOiAncHVsbFJlcXVlc3QnLFxuXHRcdFx0dGl0bGU6ICdUZXN0IHB1bGwgcmVxdWVzdCcsXG5cdFx0fSk7XG5cdFx0bGV0IHJ1bGVDaGVja3MgPSAwO1xuXHRcdGxldCB3YXRjaGVyQ3JlYXRpb25zID0gMDtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMaW5rUHJlc2VudGF0aW9uU2VydmljZSwge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0b25EaWRDaGFuZ2VMaW5rUHJlc2VudGF0aW9uUnVsZXM6IEV2ZW50Lk5vbmUsXG5cdFx0XHRsaW5rUHJlc2VudGF0aW9uUnVsZXM6IFtydWxlXSxcblx0XHRcdHJlZ2lzdGVyTGlua1ByZXNlbnRhdGlvblByb3ZpZGVyOiAoKSA9PiAoeyBkaXNwb3NlOiAoKSA9PiB7IH0gfSksXG5cdFx0XHRyZWdpc3RlckV4dGVuc2lvbkxpbmtQcmVzZW50YXRpb25Qcm92aWRlcjogKCkgPT4gKHsgZGlzcG9zZTogKCkgPT4geyB9IH0pLFxuXHRcdFx0Z2V0TGlua1ByZXNlbnRhdGlvblJ1bGU6IHJlc291cmNlID0+IHtcblx0XHRcdFx0cnVsZUNoZWNrcysrO1xuXHRcdFx0XHRyZXR1cm4gcnVsZS51cmlQYXR0ZXJuLnRlc3QocmVzb3VyY2UudG9TdHJpbmcodHJ1ZSkpID8gcnVsZSA6IHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0XHRjcmVhdGVMaW5rUHJlc2VudGF0aW9uV2F0Y2hlcjogKCkgPT4ge1xuXHRcdFx0XHR3YXRjaGVyQ3JlYXRpb25zKys7XG5cdFx0XHRcdHJldHVybiB7IHByZXNlbnRhdGlvbiwgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSBhcyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uUmljaExpbmtzLCBmYWxzZSk7XG5cdFx0Y29uc3QgZGlzYWJsZWRQYXJ0ID0gY3JlYXRlTWFya2Rvd25QYXJ0KCdbcHVsbCByZXF1ZXN0XShodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzEpJyk7XG5cblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5SaWNoTGlua3MsIHRydWUpO1xuXHRcdGNvbnN0IGVuYWJsZWRQYXJ0ID0gY3JlYXRlTWFya2Rvd25QYXJ0KCdbcHVsbCByZXF1ZXN0XShodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzEpJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRpc2FibGVkUmljaExpbmtzOiBkaXNhYmxlZFBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yQWxsKCcuY2hhdC1yaWNoLWxpbmsnKS5sZW5ndGgsXG5cdFx0XHRlbmFibGVkUmljaExpbmtzOiBlbmFibGVkUGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LXJpY2gtbGluaycpLmxlbmd0aCxcblx0XHRcdHJ1bGVDaGVja3MsXG5cdFx0XHR3YXRjaGVyQ3JlYXRpb25zLFxuXHRcdH0sIHtcblx0XHRcdGRpc2FibGVkUmljaExpbmtzOiAwLFxuXHRcdFx0ZW5hYmxlZFJpY2hMaW5rczogMSxcblx0XHRcdHJ1bGVDaGVja3M6IDEsXG5cdFx0XHR3YXRjaGVyQ3JlYXRpb25zOiAxLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW5kZXJzIGEgc2luZ2xlIGNvZGUgYmxvY2sgYW5kIHBhc3NlcyB0ZXh0IHRvIENvZGVCbG9ja1BhcnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGFydCA9IGNyZWF0ZU1hcmtkb3duUGFydCgnYGBgamF2YXNjcmlwdFxcbmNvbnNvbGUubG9nKFwiaGVsbG9cIik7XFxuYGBgJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5jb2RlYmxvY2tzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuY29kZWJsb2Nrc1swXS5jb2RlQmxvY2tJbmRleCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuY29kZWJsb2Nrc1swXS5sYW5ndWFnZUlkLCAnamF2YXNjcmlwdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlZENvZGVCbG9ja3MubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVuZGVyZWRDb2RlQmxvY2tzWzBdLnRleHQsICdjb25zb2xlLmxvZyhcImhlbGxvXCIpOycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlZENvZGVCbG9ja3NbMF0ubGFuZ3VhZ2VJZCwgJ2phdmFzY3JpcHQnKTtcblx0fSk7XG5cblx0dGVzdCgncmVuZGVycyBjb21wbGV0ZSBjb2RlIGJsb2NrIHdpdGggY29udHJpYnV0ZWQgY2hhdCBvdXRwdXQgcmVuZGVyZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGFydCA9IGNyZWF0ZU1hcmtkb3duUGFydCgnYGBgbWVybWFpZFxcbmdyYXBoIFREXFxuYGBgJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5jb2RlYmxvY2tzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuY29kZWJsb2Nrc1swXS5sYW5ndWFnZUlkLCAnbWVybWFpZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlZENvZGVCbG9ja3MubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlbmRlcmVkQ29kZUJsb2NrT3V0cHV0cywgW3sgaWRlbnRpZmllcjogJ21lcm1haWQnLCB0ZXh0OiAnZ3JhcGggVEQnIH1dKTtcblx0XHRhc3NlcnQub2socGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LW91dHB1dC1jb2RlLWJsb2NrJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW5kZXJzIGNvbXBsZXRlIGNvZGUgYmxvY2sgd2l0aCBjb250cmlidXRlZCBjaGF0IG91dHB1dCByZW5kZXJlciBjYXNlLWluc2Vuc2l0aXZlbHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGFydCA9IGNyZWF0ZU1hcmtkb3duUGFydCgnYGBgTWVybWFpZFxcbmdyYXBoIFREXFxuYGBgJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5jb2RlYmxvY2tzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuY29kZWJsb2Nrc1swXS5sYW5ndWFnZUlkLCAnTWVybWFpZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlZENvZGVCbG9ja3MubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlbmRlcmVkQ29kZUJsb2NrT3V0cHV0cywgW3sgaWRlbnRpZmllcjogJ01lcm1haWQnLCB0ZXh0OiAnZ3JhcGggVEQnIH1dKTtcblx0XHRhc3NlcnQub2socGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LW91dHB1dC1jb2RlLWJsb2NrJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXVzZXMgcmVuZGVyZWQgY29kZSBibG9jayB3ZWJ2aWV3IGFjcm9zcyBpbmNyZW1lbnRhbCByZXJlbmRlcnMgd2hlbiBjb250ZW50IGlzIHVuY2hhbmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25maWdTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSkgYXMgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRcdGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uSW5jcmVtZW50YWxSZW5kZXJpbmcsIHRydWUpO1xuXG5cdFx0Y29uc3QgY3R4ID0gY3JlYXRlUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cdFx0Y29uc3QgbWFya2Rvd24gPSAnYGBgbWVybWFpZFxcbmdyYXBoIFREXFxuYGBgJztcblx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlTWFya2Rvd25QYXJ0KG1hcmtkb3duLCBjdHgsIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbmRlcmVkQ29kZUJsb2NrT3V0cHV0cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LnRyeUluY3JlbWVudGFsVXBkYXRlKHsga2luZDogJ21hcmtkb3duQ29udGVudCcsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZyhgJHttYXJrZG93bn1cXG5cXG5OZXh0IHBhcmFncmFwaGApIH0pLCB0cnVlKTtcblxuXHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gbWFpbldpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4gcmVzb2x2ZSgpKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlbmRlcmVkT3V0cHV0czogcmVuZGVyZWRDb2RlQmxvY2tPdXRwdXRzLFxuXHRcdFx0b3V0cHV0QmxvY2tDb3VudDogcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LW91dHB1dC1jb2RlLWJsb2NrJykubGVuZ3RoLFxuXHRcdH0sIHtcblx0XHRcdHJlbmRlcmVkT3V0cHV0czogW3sgaWRlbnRpZmllcjogJ21lcm1haWQnLCB0ZXh0OiAnZ3JhcGggVEQnIH1dLFxuXHRcdFx0b3V0cHV0QmxvY2tDb3VudDogMSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmVuZGVyIGluaXRpYWwgaW5jb21wbGV0ZSBjb2RlIGZlbmNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGN0eCA9IGNyZWF0ZVJlbmRlckNvbnRleHQoZmFsc2UpO1xuXHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVNYXJrZG93blBhcnQoJ2BgYCcsIGN0eCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5jb2RlYmxvY2tzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbmRlcmVkQ29kZUJsb2Nrcy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlZENvZGVCbG9ja091dHB1dHMubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5pbnRlcmFjdGl2ZS1yZXN1bHQtY29kZS1ibG9jaycpLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvd3MgcGVuZGluZyBjaGF0IG91dHB1dCByZW5kZXJlciBmb3IgaW5jb21wbGV0ZSBjb2RlIGJsb2NrJywgKCkgPT4ge1xuXHRcdGNvbnN0IGN0eCA9IGNyZWF0ZVJlbmRlckNvbnRleHQoZmFsc2UpO1xuXHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVNYXJrZG93blBhcnQoJ2BgYG1lcm1haWRcXG5ncmFwaCBURCcsIGN0eCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVuZGVyZWRDb2RlQmxvY2tPdXRwdXRzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbmRlcmVkQ29kZUJsb2Nrcy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmNvZGVibG9ja3MubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5jb2RlYmxvY2tzWzBdLmxhbmd1YWdlSWQsICdtZXJtYWlkJyk7XG5cdFx0YXNzZXJ0Lm9rKHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1vdXRwdXQtY29kZS1ibG9jaycpKTtcblx0XHRhc3NlcnQub2socGFydC5kb21Ob2RlLnRleHRDb250ZW50Py5pbmNsdWRlcygnUmVuZGVyaW5nIGNvZGUgYmxvY2snKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbmRlcnMgbXVsdGlwbGUgY29kZSBibG9ja3Mgd2l0aCBjb3JyZWN0IGluZGljZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGFydCA9IGNyZWF0ZU1hcmtkb3duUGFydChcblx0XHRcdCdTb21lIHRleHRcXG5gYGBweXRob25cXG5wcmludChcImFcIilcXG5gYGBcXG5Nb3JlIHRleHRcXG5gYGB0eXBlc2NyaXB0XFxuY29uc3QgeCA9IDE7XFxuYGBgJ1xuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5jb2RlYmxvY2tzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuY29kZWJsb2Nrc1swXS5jb2RlQmxvY2tJbmRleCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuY29kZWJsb2Nrc1swXS5sYW5ndWFnZUlkLCAncHl0aG9uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuY29kZWJsb2Nrc1sxXS5jb2RlQmxvY2tJbmRleCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuY29kZWJsb2Nrc1sxXS5sYW5ndWFnZUlkLCAndHlwZXNjcmlwdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlZENvZGVCbG9ja3NbMF0udGV4dCwgJ3ByaW50KFwiYVwiKScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlZENvZGVCbG9ja3NbMV0udGV4dCwgJ2NvbnN0IHggPSAxOycpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb2RlIGJsb2NrIHRleHQgaXMgcGFzc2VkIGNvcnJlY3RseScsICgpID0+IHtcblx0XHRjb25zdCBjb2RlID0gJ2Z1bmN0aW9uIGdyZWV0KCkge1xcbiAgcmV0dXJuIFwiaGVsbG9cIjtcXG59Jztcblx0XHRjcmVhdGVNYXJrZG93blBhcnQoJ2BgYGphdmFzY3JpcHRcXG4nICsgY29kZSArICdcXG5gYGAnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlZENvZGVCbG9ja3MubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVuZGVyZWRDb2RlQmxvY2tzWzBdLnRleHQsIGNvZGUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlZENvZGVCbG9ja3NbMF0ubGFuZ3VhZ2VJZCwgJ2phdmFzY3JpcHQnKTtcblx0fSk7XG5cblx0dGVzdCgnY29kZSBibG9jayB3aXRob3V0IGxhbmd1YWdlIGlkIHBhc3NlcyBlbXB0eSBsYW5ndWFnZUlkJywgKCkgPT4ge1xuXHRcdGNyZWF0ZU1hcmtkb3duUGFydCgnYGBgXFxuc29tZSB0ZXh0XFxuYGBgJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVuZGVyZWRDb2RlQmxvY2tzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbmRlcmVkQ29kZUJsb2Nrc1swXS50ZXh0LCAnc29tZSB0ZXh0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3BlY3RzIGNvZGVCbG9ja1N0YXJ0SW5kZXggZm9yIGdsb2JhbCBpbmRleGluZycsICgpID0+IHtcblx0XHRjb25zdCBjdHggPSBjcmVhdGVSZW5kZXJDb250ZXh0KCk7XG5cdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRNYXJrZG93bkNvbnRlbnRQYXJ0LFxuXHRcdFx0eyBraW5kOiAnbWFya2Rvd25Db250ZW50JywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdgYGBqc1xcbmNvZGVcXG5gYGAnKSB9LFxuXHRcdFx0Y3R4LFxuXHRcdFx0ZWRpdG9yUG9vbCxcblx0XHRcdGZhbHNlLFxuXHRcdFx0NSwgLy8gY29kZUJsb2NrU3RhcnRJbmRleFxuXHRcdFx0cmVuZGVyZXIsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHQ1MDAsXG5cdFx0XHR7fSxcblx0XHQpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmNvZGVibG9ja3MubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5jb2RlYmxvY2tzWzBdLmNvZGVCbG9ja0luZGV4LCA1KTtcblx0fSk7XG5cblx0dGVzdCgnaGFzU2FtZUNvbnRlbnQgcmV0dXJucyB0cnVlIGZvciBzYW1lIG1hcmtkb3duJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVNYXJrZG93blBhcnQoJ0hlbGxvJyk7XG5cdFx0YXNzZXJ0Lm9rKHBhcnQuaGFzU2FtZUNvbnRlbnQoeyBraW5kOiAnbWFya2Rvd25Db250ZW50JywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdIZWxsbycpIH0pKTtcblx0fSk7XG5cblx0dGVzdCgnaGFzU2FtZUNvbnRlbnQgcmV0dXJucyBmYWxzZSBmb3IgZGlmZmVyZW50IG1hcmtkb3duJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVNYXJrZG93blBhcnQoJ0hlbGxvJyk7XG5cdFx0YXNzZXJ0Lm9rKCFwYXJ0Lmhhc1NhbWVDb250ZW50KHsga2luZDogJ21hcmtkb3duQ29udGVudCcsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnR29vZGJ5ZScpIH0pKTtcblx0fSk7XG5cblx0dGVzdCgnaGFzU2FtZUNvbnRlbnQgY29tcGFyZXMgaW5saW5lIHJlZmVyZW5jZSBtZXRhZGF0YScsICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vd29ya3NwYWNlL2Zvby50cycpO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSAnRm9vJztcblx0XHRjb25zdCBpbml0aWFsUmVmZXJlbmNlOiBJQ2hhdENvbnRlbnRJbmxpbmVSZWZlcmVuY2UgPSB7XG5cdFx0XHRraW5kOiAnaW5saW5lUmVmZXJlbmNlJyxcblx0XHRcdHJlc29sdmVJZDogJ3Jlc29sdmUxJyxcblx0XHRcdGlubGluZVJlZmVyZW5jZTogeyB1cmksIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSkgfSxcblx0XHRcdG5hbWU6ICdGb28nLFxuXHRcdH07XG5cdFx0Y29uc3QgcGFydCA9IGNyZWF0ZU1hcmtkb3duUGFydFdpdGhJbmxpbmVSZWZlcmVuY2VzKGNvbnRlbnQsIHsgMDogaW5pdGlhbFJlZmVyZW5jZSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZXF1aXZhbGVudFJlZmVyZW5jZTogcGFydC5oYXNTYW1lQ29udGVudCh7XG5cdFx0XHRcdGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLFxuXHRcdFx0XHRjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoY29udGVudCksXG5cdFx0XHRcdGlubGluZVJlZmVyZW5jZXM6IHtcblx0XHRcdFx0XHQwOiB7XG5cdFx0XHRcdFx0XHRraW5kOiAnaW5saW5lUmVmZXJlbmNlJyxcblx0XHRcdFx0XHRcdHJlc29sdmVJZDogJ3Jlc29sdmUxJyxcblx0XHRcdFx0XHRcdGlubGluZVJlZmVyZW5jZTogeyB1cmksIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSkgfSxcblx0XHRcdFx0XHRcdG5hbWU6ICdGb28nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSxcblx0XHRcdHJlc29sdmVkUmVmZXJlbmNlOiBwYXJ0Lmhhc1NhbWVDb250ZW50KHtcblx0XHRcdFx0a2luZDogJ21hcmtkb3duQ29udGVudCcsXG5cdFx0XHRcdGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZyhjb250ZW50KSxcblx0XHRcdFx0aW5saW5lUmVmZXJlbmNlczoge1xuXHRcdFx0XHRcdDA6IHtcblx0XHRcdFx0XHRcdGtpbmQ6ICdpbmxpbmVSZWZlcmVuY2UnLFxuXHRcdFx0XHRcdFx0cmVzb2x2ZUlkOiAncmVzb2x2ZTEnLFxuXHRcdFx0XHRcdFx0aW5saW5lUmVmZXJlbmNlOiB7XG5cdFx0XHRcdFx0XHRcdG5hbWU6ICdGb28nLFxuXHRcdFx0XHRcdFx0XHRraW5kOiBTeW1ib2xLaW5kLkNsYXNzLFxuXHRcdFx0XHRcdFx0XHRsb2NhdGlvbjogeyB1cmksIHJhbmdlOiBuZXcgUmFuZ2UoMiwgNywgMiwgMTApIH0sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0bmFtZTogJ0ZvbycsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH0pLFxuXHRcdH0sIHtcblx0XHRcdGVxdWl2YWxlbnRSZWZlcmVuY2U6IHRydWUsXG5cdFx0XHRyZXNvbHZlZFJlZmVyZW5jZTogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhc1NhbWVDb250ZW50IGNvbXBhcmVzIHdvcmtzcGFjZSBzeW1ib2wgbWV0YWRhdGEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3dvcmtzcGFjZS9mb28udHMnKTtcblx0XHRjb25zdCBjb250ZW50ID0gJ0Zvbyc7XG5cdFx0Y29uc3QgaW5pdGlhbFJlZmVyZW5jZTogSUNoYXRDb250ZW50SW5saW5lUmVmZXJlbmNlID0ge1xuXHRcdFx0a2luZDogJ2lubGluZVJlZmVyZW5jZScsXG5cdFx0XHRyZXNvbHZlSWQ6ICdyZXNvbHZlMScsXG5cdFx0XHRpbmxpbmVSZWZlcmVuY2U6IHtcblx0XHRcdFx0bmFtZTogJ0ZvbycsXG5cdFx0XHRcdGNvbnRhaW5lck5hbWU6ICdCYXInLFxuXHRcdFx0XHRraW5kOiBTeW1ib2xLaW5kLkNsYXNzLFxuXHRcdFx0XHR0YWdzOiBbU3ltYm9sVGFnLkRlcHJlY2F0ZWRdLFxuXHRcdFx0XHRsb2NhdGlvbjogeyB1cmksIHJhbmdlOiBuZXcgUmFuZ2UoMiwgNywgMiwgMTApIH0sXG5cdFx0XHR9LFxuXHRcdFx0bmFtZTogJ0ZvbycsXG5cdFx0fTtcblx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlTWFya2Rvd25QYXJ0V2l0aElubGluZVJlZmVyZW5jZXMoY29udGVudCwgeyAwOiBpbml0aWFsUmVmZXJlbmNlIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlcXVpdmFsZW50U3ltYm9sOiBwYXJ0Lmhhc1NhbWVDb250ZW50KHtcblx0XHRcdFx0a2luZDogJ21hcmtkb3duQ29udGVudCcsXG5cdFx0XHRcdGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZyhjb250ZW50KSxcblx0XHRcdFx0aW5saW5lUmVmZXJlbmNlczoge1xuXHRcdFx0XHRcdDA6IHtcblx0XHRcdFx0XHRcdGtpbmQ6ICdpbmxpbmVSZWZlcmVuY2UnLFxuXHRcdFx0XHRcdFx0cmVzb2x2ZUlkOiAncmVzb2x2ZTEnLFxuXHRcdFx0XHRcdFx0aW5saW5lUmVmZXJlbmNlOiB7XG5cdFx0XHRcdFx0XHRcdG5hbWU6ICdGb28nLFxuXHRcdFx0XHRcdFx0XHRjb250YWluZXJOYW1lOiAnQmFyJyxcblx0XHRcdFx0XHRcdFx0a2luZDogU3ltYm9sS2luZC5DbGFzcyxcblx0XHRcdFx0XHRcdFx0dGFnczogW1N5bWJvbFRhZy5EZXByZWNhdGVkXSxcblx0XHRcdFx0XHRcdFx0bG9jYXRpb246IHsgdXJpLCByYW5nZTogbmV3IFJhbmdlKDIsIDcsIDIsIDEwKSB9LFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdG5hbWU6ICdGb28nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSxcblx0XHRcdGRpZmZlcmVudENvbnRhaW5lcjogcGFydC5oYXNTYW1lQ29udGVudCh7XG5cdFx0XHRcdGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLFxuXHRcdFx0XHRjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoY29udGVudCksXG5cdFx0XHRcdGlubGluZVJlZmVyZW5jZXM6IHtcblx0XHRcdFx0XHQwOiB7XG5cdFx0XHRcdFx0XHRraW5kOiAnaW5saW5lUmVmZXJlbmNlJyxcblx0XHRcdFx0XHRcdHJlc29sdmVJZDogJ3Jlc29sdmUxJyxcblx0XHRcdFx0XHRcdGlubGluZVJlZmVyZW5jZToge1xuXHRcdFx0XHRcdFx0XHRuYW1lOiAnRm9vJyxcblx0XHRcdFx0XHRcdFx0Y29udGFpbmVyTmFtZTogJ0JheicsXG5cdFx0XHRcdFx0XHRcdGtpbmQ6IFN5bWJvbEtpbmQuQ2xhc3MsXG5cdFx0XHRcdFx0XHRcdHRhZ3M6IFtTeW1ib2xUYWcuRGVwcmVjYXRlZF0sXG5cdFx0XHRcdFx0XHRcdGxvY2F0aW9uOiB7IHVyaSwgcmFuZ2U6IG5ldyBSYW5nZSgyLCA3LCAyLCAxMCkgfSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRuYW1lOiAnRm9vJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSksXG5cdFx0XHRkaWZmZXJlbnRUYWdzOiBwYXJ0Lmhhc1NhbWVDb250ZW50KHtcblx0XHRcdFx0a2luZDogJ21hcmtkb3duQ29udGVudCcsXG5cdFx0XHRcdGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZyhjb250ZW50KSxcblx0XHRcdFx0aW5saW5lUmVmZXJlbmNlczoge1xuXHRcdFx0XHRcdDA6IHtcblx0XHRcdFx0XHRcdGtpbmQ6ICdpbmxpbmVSZWZlcmVuY2UnLFxuXHRcdFx0XHRcdFx0cmVzb2x2ZUlkOiAncmVzb2x2ZTEnLFxuXHRcdFx0XHRcdFx0aW5saW5lUmVmZXJlbmNlOiB7XG5cdFx0XHRcdFx0XHRcdG5hbWU6ICdGb28nLFxuXHRcdFx0XHRcdFx0XHRjb250YWluZXJOYW1lOiAnQmFyJyxcblx0XHRcdFx0XHRcdFx0a2luZDogU3ltYm9sS2luZC5DbGFzcyxcblx0XHRcdFx0XHRcdFx0dGFnczogW10sXG5cdFx0XHRcdFx0XHRcdGxvY2F0aW9uOiB7IHVyaSwgcmFuZ2U6IG5ldyBSYW5nZSgyLCA3LCAyLCAxMCkgfSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRuYW1lOiAnRm9vJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSksXG5cdFx0fSwge1xuXHRcdFx0ZXF1aXZhbGVudFN5bWJvbDogdHJ1ZSxcblx0XHRcdGRpZmZlcmVudENvbnRhaW5lcjogZmFsc2UsXG5cdFx0XHRkaWZmZXJlbnRUYWdzOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndHJ5SW5jcmVtZW50YWxVcGRhdGUgcmVxdWlyZXMgdW5jaGFuZ2VkIGlubGluZSByZWZlcmVuY2UgbWV0YWRhdGEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlnU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpIGFzIFRlc3RDb25maWd1cmF0aW9uU2VydmljZTtcblx0XHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkluY3JlbWVudGFsUmVuZGVyaW5nLCB0cnVlKTtcblxuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy93b3Jrc3BhY2UvZm9vLnRzJyk7XG5cdFx0Y29uc3QgY29udGVudCA9ICdGb28nO1xuXHRcdGNvbnN0IGluaXRpYWxSZWZlcmVuY2U6IElDaGF0Q29udGVudElubGluZVJlZmVyZW5jZSA9IHtcblx0XHRcdGtpbmQ6ICdpbmxpbmVSZWZlcmVuY2UnLFxuXHRcdFx0cmVzb2x2ZUlkOiAncmVzb2x2ZTEnLFxuXHRcdFx0aW5saW5lUmVmZXJlbmNlOiB7IHVyaSwgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxKSB9LFxuXHRcdFx0bmFtZTogJ0ZvbycsXG5cdFx0fTtcblx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cdFx0Y29uc3QgcGFydCA9IGNyZWF0ZU1hcmtkb3duUGFydFdpdGhJbmxpbmVSZWZlcmVuY2VzKGNvbnRlbnQsIHsgMDogaW5pdGlhbFJlZmVyZW5jZSB9LCBjb250ZXh0LCB0cnVlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dW5jaGFuZ2VkUmVmZXJlbmNlOiBwYXJ0LnRyeUluY3JlbWVudGFsVXBkYXRlKHtcblx0XHRcdFx0a2luZDogJ21hcmtkb3duQ29udGVudCcsXG5cdFx0XHRcdGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZyhjb250ZW50KSxcblx0XHRcdFx0aW5saW5lUmVmZXJlbmNlczogeyAwOiBpbml0aWFsUmVmZXJlbmNlIH0sXG5cdFx0XHR9KSxcblx0XHRcdHJlc29sdmVkUmVmZXJlbmNlOiBwYXJ0LnRyeUluY3JlbWVudGFsVXBkYXRlKHtcblx0XHRcdFx0a2luZDogJ21hcmtkb3duQ29udGVudCcsXG5cdFx0XHRcdGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZyhjb250ZW50KSxcblx0XHRcdFx0aW5saW5lUmVmZXJlbmNlczoge1xuXHRcdFx0XHRcdDA6IHtcblx0XHRcdFx0XHRcdGtpbmQ6ICdpbmxpbmVSZWZlcmVuY2UnLFxuXHRcdFx0XHRcdFx0cmVzb2x2ZUlkOiAncmVzb2x2ZTEnLFxuXHRcdFx0XHRcdFx0aW5saW5lUmVmZXJlbmNlOiB7XG5cdFx0XHRcdFx0XHRcdG5hbWU6ICdGb28nLFxuXHRcdFx0XHRcdFx0XHRraW5kOiBTeW1ib2xLaW5kLkNsYXNzLFxuXHRcdFx0XHRcdFx0XHRsb2NhdGlvbjogeyB1cmksIHJhbmdlOiBuZXcgUmFuZ2UoMiwgNywgMiwgMTApIH0sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0bmFtZTogJ0ZvbycsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH0pLFxuXHRcdH0sIHtcblx0XHRcdHVuY2hhbmdlZFJlZmVyZW5jZTogdHJ1ZSxcblx0XHRcdHJlc29sdmVkUmVmZXJlbmNlOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncGhwIGNvZGUgYmxvY2tzIGdldCBwaHAgb3BlbmluZyB0YWcgcHJlcGVuZGVkJywgKCkgPT4ge1xuXHRcdGNyZWF0ZU1hcmtkb3duUGFydCgnYGBgcGhwXFxuZWNobyBcImhlbGxvXCI7XFxuYGBgJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVuZGVyZWRDb2RlQmxvY2tzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0Lm9rKHJlbmRlcmVkQ29kZUJsb2Nrc1swXS50ZXh0LnN0YXJ0c1dpdGgoJzw/cGhwXFxuJyksICdQSFAgY29kZSBzaG91bGQgaGF2ZSA8P3BocCBwcmVwZW5kZWQnKTtcblx0fSk7XG5cblx0dGVzdCgncGhwIGNvZGUgYmxvY2tzIHdpdGggZXhpc3Rpbmcgb3BlbmluZyB0YWcgYXJlIG5vdCBtb2RpZmllZCcsICgpID0+IHtcblx0XHRjcmVhdGVNYXJrZG93blBhcnQoJ2BgYHBocFxcbjw/cGhwXFxuZWNobyBcImhlbGxvXCI7XFxuYGBgJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVuZGVyZWRDb2RlQmxvY2tzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0Lm9rKCFyZW5kZXJlZENvZGVCbG9ja3NbMF0udGV4dC5zdGFydHNXaXRoKCc8P3BocFxcbjw/cGhwJyksICdQSFAgY29kZSB3aXRoIGV4aXN0aW5nIHRhZyBzaG91bGQgbm90IGJlIGRvdWJsZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnc3RyaXBzIGNvZGVibG9jayB1cmkgYW5ub3RhdGlvbnMgYmVmb3JlIHJlbmRlcmluZyBzdGFuZGFyZCBjb2RlIGJsb2NrcycsICgpID0+IHtcblx0XHRjcmVhdGVNYXJrZG93blBhcnQoJ2BgYHR5cGVzY3JpcHRcXG5jb25zdCB2YWx1ZSA9IDE7XFxuPHZzY29kZV9jb2RlYmxvY2tfdXJpPmZpbGU6Ly8vdGVzdC50czwvdnNjb2RlX2NvZGVibG9ja191cmk+XFxuYGBgJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVuZGVyZWRDb2RlQmxvY2tzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0Lm9rKCFyZW5kZXJlZENvZGVCbG9ja3NbMF0udGV4dC5pbmNsdWRlcygnPHZzY29kZV9jb2RlYmxvY2tfdXJpJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlZENvZGVCbG9ja3NbMF0uY29kZW1hcHBlclVyaT8udG9TdHJpbmcoKSwgJ2ZpbGU6Ly8vdGVzdC50cycpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb2RlIGJsb2NrIHRvb2xiYXIgY29udGV4dCBpcyBzZXQgY29ycmVjdGx5IHdpdGggY29kZSB0ZXh0JywgKCkgPT4ge1xuXHRcdC8vIFNpbXVsYXRlcyB0aGUgc2NlbmFyaW8gaW4gIzI1NTI5MDogdGhlIGNvcHkgYnV0dG9uIHNob3VsZCBoYXZlXG5cdFx0Ly8gdmFsaWQgY29kZSB0ZXh0IGR1cmluZyBzdHJlYW1pbmcgZXZlbiBhcyBjb2RlIGJsb2NrcyBhcmUgcmUtcmVuZGVyZWQuXG5cdFx0Y3JlYXRlTWFya2Rvd25QYXJ0KCdgYGBqc1xcbmNvbnNvbGUubG9nKFwiaGVsbG9cIik7XFxuYGBgJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVuZGVyZWRDb2RlQmxvY2tzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbmRlcmVkQ29kZUJsb2Nrc1swXS50ZXh0LCAnY29uc29sZS5sb2coXCJoZWxsb1wiKTsnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVuZGVyZWRDb2RlQmxvY2tzWzBdLmxhbmd1YWdlSWQsICdqcycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlZENvZGVCbG9ja3NbMF0uY29kZUJsb2NrSW5kZXgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdjb2RlIGJsb2NrIG1haW50YWlucyBjb250ZW50IHdoZW4gbWFya2Rvd24gaXMgcmUtcmVuZGVyZWQgZHVyaW5nIHN0cmVhbWluZycsICgpID0+IHtcblx0XHQvLyBTaW11bGF0ZXMgcHJvZ3Jlc3NpdmUgcmVuZGVyaW5nOiBmaXJzdCB0aWNrIHNob3dzIHBhcnRpYWwgY29kZSwgc2Vjb25kIHRpY2sgYWRkcyBtb3JlLlxuXHRcdC8vIEVhY2ggcmVuZGVyIGNyZWF0ZXMgYSBuZXcgQ2hhdE1hcmtkb3duQ29udGVudFBhcnQgKGFzIGhhcHBlbnMgZHVyaW5nIHN0cmVhbWluZykuXG5cdFx0Ly8gVGhlIGNvZGUgYmxvY2sgc2hvdWxkIGdldCB0aGUgdXBkYXRlZCB0ZXh0IGVhY2ggdGltZS5cblx0XHRjb25zdCBjdHggPSBjcmVhdGVSZW5kZXJDb250ZXh0KGZhbHNlIC8qIGlzQ29tcGxldGUgPSBmYWxzZSwgc2ltdWxhdGluZyBzdHJlYW1pbmcgKi8pO1xuXG5cdFx0Ly8gRmlyc3QgcmVuZGVyIHdpdGggcGFydGlhbCBjb2RlXG5cdFx0Y29uc3QgcGFydDEgPSBjcmVhdGVNYXJrZG93blBhcnQoJ2BgYGpzXFxuY29uc29sZVxcbmBgYCcsIGN0eCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbmRlcmVkQ29kZUJsb2Nrcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlZENvZGVCbG9ja3NbMF0udGV4dCwgJ2NvbnNvbGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydDEuY29kZWJsb2Nrcy5sZW5ndGgsIDEpO1xuXG5cdFx0Ly8gU2Vjb25kIHJlbmRlciB3aXRoIG1vcmUgY29kZSAoc2ltdWxhdGluZyBzdHJlYW1pbmcgcHJvZ3Jlc3MpXG5cdFx0cmVuZGVyZWRDb2RlQmxvY2tzLmxlbmd0aCA9IDA7XG5cdFx0Y29uc3QgcGFydDIgPSBjcmVhdGVNYXJrZG93blBhcnQoJ2BgYGpzXFxuY29uc29sZS5sb2coXCJoZWxsb1wiKTtcXG5gYGAnLCBjdHgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlZENvZGVCbG9ja3MubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVuZGVyZWRDb2RlQmxvY2tzWzBdLnRleHQsICdjb25zb2xlLmxvZyhcImhlbGxvXCIpOycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0Mi5jb2RlYmxvY2tzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQyLmNvZGVibG9ja3NbMF0uY29kZUJsb2NrSW5kZXgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdjb2RlIGJsb2NrIHBhcnQgZWxlbWVudCBpcyByZXVzZWQgZnJvbSBwb29sIGFjcm9zcyBzdHJlYW1pbmcgcmVuZGVycycsICgpID0+IHtcblx0XHQvLyBWZXJpZnkgdGhlIHNhbWUgQ29kZUJsb2NrUGFydCBlbGVtZW50IGlzIHJldHVybmVkIGZyb20gdGhlIHBvb2wgZm9yIHRoZSBzYW1lIGtleVxuXHRcdGNvbnN0IGVsZW1lbnRzOiBIVE1MRWxlbWVudFtdID0gW107XG5cdFx0Y29uc3QgcG9vbFdpdGhUcmFja2luZyA9IHtcblx0XHRcdGdldCgpOiBJRGlzcG9zYWJsZVJlZmVyZW5jZTxDb2RlQmxvY2tQYXJ0PiB7XG5cdFx0XHRcdGNvbnN0IGVsZW1lbnQgPSBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0XHRlbGVtZW50cy5wdXNoKGVsZW1lbnQpO1xuXHRcdFx0XHRjb25zdCBtb2NrUGFydCA9IHtcblx0XHRcdFx0XHRlbGVtZW50LFxuXHRcdFx0XHRcdGdldCB1cmkoKSB7IHJldHVybiB1bmRlZmluZWQ7IH0sXG5cdFx0XHRcdFx0cmVuZGVyKGRhdGE6IElDb2RlQmxvY2tEYXRhLCBfd2lkdGg6IG51bWJlcikge1xuXHRcdFx0XHRcdFx0cmVuZGVyZWRDb2RlQmxvY2tzLnB1c2goZGF0YSk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRsYXlvdXQoKSB7IH0sXG5cdFx0XHRcdFx0Zm9jdXMoKSB7IH0sXG5cdFx0XHRcdFx0cmVzZXQoKSB7IH0sXG5cdFx0XHRcdFx0b25EaWRSZW1vdW50KCkgeyB9LFxuXHRcdFx0XHR9IGFzIHVua25vd24gYXMgQ29kZUJsb2NrUGFydDtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRvYmplY3Q6IG1vY2tQYXJ0LFxuXHRcdFx0XHRcdGlzU3RhbGU6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHRcdFx0fTtcblx0XHRcdH0sXG5cdFx0XHRpblVzZTogKCkgPT4gW10sXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIEVkaXRvclBvb2w7XG5cblx0XHRjb25zdCBjdHggPSBjcmVhdGVSZW5kZXJDb250ZXh0KGZhbHNlKTtcblx0XHRzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0TWFya2Rvd25Db250ZW50UGFydCxcblx0XHRcdHsga2luZDogJ21hcmtkb3duQ29udGVudCcsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnYGBganNcXG5jb25zb2xlXFxuYGBgJykgfSxcblx0XHRcdGN0eCwgcG9vbFdpdGhUcmFja2luZywgZmFsc2UsIDAsIHJlbmRlcmVyLCB1bmRlZmluZWQsIDUwMCwge30sXG5cdFx0KSk7XG5cblx0XHRzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0TWFya2Rvd25Db250ZW50UGFydCxcblx0XHRcdHsga2luZDogJ21hcmtkb3duQ29udGVudCcsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnYGBganNcXG5jb25zb2xlLmxvZyhcImhlbGxvXCIpO1xcbmBgYCcpIH0sXG5cdFx0XHRjdHgsIHBvb2xXaXRoVHJhY2tpbmcsIGZhbHNlLCAwLCByZW5kZXJlciwgdW5kZWZpbmVkLCA1MDAsIHt9LFxuXHRcdCkpO1xuXG5cdFx0Ly8gQm90aCByZW5kZXJzIHNob3VsZCBoYXZlIGNyZWF0ZWQgY29kZSBibG9ja3Mgd2l0aCB0aGUgY29ycmVjdCB0ZXh0XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbmRlcmVkQ29kZUJsb2Nrcy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlZENvZGVCbG9ja3NbMF0udGV4dCwgJ2NvbnNvbGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVuZGVyZWRDb2RlQmxvY2tzWzFdLnRleHQsICdjb25zb2xlLmxvZyhcImhlbGxvXCIpOycpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsYUFBYTtBQUN0QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFT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
