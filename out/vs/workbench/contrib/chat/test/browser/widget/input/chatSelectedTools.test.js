import assert from "assert";
import { TestConfigurationService } from "../../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ContextKeyService } from "../../../../../../../platform/contextkey/browser/contextKeyService.js";
import { workbenchInstantiationService } from "../../../../../../test/browser/workbenchTestServices.js";
import { LanguageModelToolsService } from "../../../../browser/tools/languageModelToolsService.js";
import { IChatService } from "../../../../common/chatService/chatService.js";
import { ILanguageModelToolsService, ToolAndToolSetEnablementMap, ToolDataSource } from "../../../../common/tools/languageModelToolsService.js";
import { MockChatService } from "../../../common/chatService/mockChatService.js";
import { ChatSelectedTools } from "../../../../browser/widget/input/chatSelectedTools.js";
import { constObservable } from "../../../../../../../base/common/observable.js";
import { Iterable } from "../../../../../../../base/common/iterator.js";
import { DisposableStore } from "../../../../../../../base/common/lifecycle.js";
import { runWithFakedTimers } from "../../../../../../../base/test/common/timeTravelScheduler.js";
import { timeout } from "../../../../../../../base/common/async.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { ChatMode } from "../../../../common/chatModes.js";
suite("ChatSelectedTools", () => {
  let store;
  let toolsService;
  let selectedTools;
  setup(() => {
    store = new DisposableStore();
    const instaService = workbenchInstantiationService({
      contextKeyService: () => store.add(new ContextKeyService(new TestConfigurationService()))
    }, store);
    instaService.stub(IChatService, new MockChatService());
    instaService.stub(ILanguageModelToolsService, instaService.createInstance(LanguageModelToolsService));
    store.add(instaService);
    toolsService = instaService.get(ILanguageModelToolsService);
    selectedTools = store.add(instaService.createInstance(ChatSelectedTools, constObservable(ChatMode.Agent), constObservable(void 0)));
  });
  teardown(function() {
    store.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  const mcpSource = { type: "mcp", label: "MCP", collectionId: "", definitionId: "", instructions: "", serverLabel: "" };
  test("Can't enable/disable MCP tools directly #18161", () => {
    return runWithFakedTimers({}, async () => {
      const toolData1 = {
        id: "testTool1",
        modelDescription: "Test Tool 1",
        displayName: "Test Tool 1",
        canBeReferencedInPrompt: true,
        toolReferenceName: "t1",
        source: mcpSource
      };
      const toolData2 = {
        id: "testTool2",
        modelDescription: "Test Tool 2",
        displayName: "Test Tool 2",
        source: mcpSource,
        canBeReferencedInPrompt: true,
        toolReferenceName: "t2"
      };
      const toolData3 = {
        id: "testTool3",
        modelDescription: "Test Tool 3",
        displayName: "Test Tool 3",
        source: mcpSource,
        canBeReferencedInPrompt: true,
        toolReferenceName: "t3"
      };
      const toolset = toolsService.createToolSet(
        mcpSource,
        "mcp",
        "mcp"
      );
      store.add(toolsService.registerToolData(toolData1));
      store.add(toolsService.registerToolData(toolData2));
      store.add(toolsService.registerToolData(toolData3));
      store.add(toolset);
      store.add(toolset.addTool(toolData1));
      store.add(toolset.addTool(toolData2));
      store.add(toolset.addTool(toolData3));
      assert.strictEqual(Iterable.length(toolsService.getTools(void 0)), 3);
      const size = Iterable.length(toolset.getTools());
      assert.strictEqual(size, 3);
      await timeout(1e3);
      assert.strictEqual(selectedTools.entriesMap.get().size, 8);
      const toSet = ToolAndToolSetEnablementMap.fromEntries([[toolData1, true], [toolData2, false], [toolData3, false], [toolset, false]]);
      selectedTools.set(toSet, false);
      const userSelectedTools = selectedTools.userSelectedTools.get();
      assert.strictEqual(Object.keys(userSelectedTools).length, 3);
      assert.strictEqual(userSelectedTools[toolData1.id], true);
      assert.strictEqual(userSelectedTools[toolData2.id], false);
      assert.strictEqual(userSelectedTools[toolData3.id], false);
    });
  });
  test("Can still enable/disable user toolsets #251640", () => {
    return runWithFakedTimers({}, async () => {
      const toolData1 = {
        id: "testTool1",
        modelDescription: "Test Tool 1",
        displayName: "Test Tool 1",
        canBeReferencedInPrompt: true,
        toolReferenceName: "t1",
        source: ToolDataSource.Internal
      };
      const toolData2 = {
        id: "testTool2",
        modelDescription: "Test Tool 2",
        displayName: "Test Tool 2",
        source: mcpSource,
        canBeReferencedInPrompt: true,
        toolReferenceName: "t2"
      };
      const toolData3 = {
        id: "testTool3",
        modelDescription: "Test Tool 3",
        displayName: "Test Tool 3",
        source: ToolDataSource.Internal,
        canBeReferencedInPrompt: true,
        toolReferenceName: "t3"
      };
      const toolset = toolsService.createToolSet(
        { type: "user", label: "User Toolset", file: URI.file("/userToolset.json") },
        "userToolset",
        "userToolset"
      );
      store.add(toolsService.registerToolData(toolData1));
      store.add(toolsService.registerToolData(toolData2));
      store.add(toolsService.registerToolData(toolData3));
      store.add(toolset);
      store.add(toolset.addTool(toolData1));
      store.add(toolset.addTool(toolData2));
      store.add(toolset.addTool(toolData3));
      assert.strictEqual(Iterable.length(toolsService.getTools(void 0)), 3);
      const size = Iterable.length(toolset.getTools());
      assert.strictEqual(size, 3);
      await timeout(1e3);
      assert.strictEqual(selectedTools.entriesMap.get().size, 8);
      const toSet = ToolAndToolSetEnablementMap.fromEntries([[toolData1, true], [toolData2, false], [toolData3, false], [toolset, true]]);
      selectedTools.set(toSet, false);
      const userSelectedTools = selectedTools.userSelectedTools.get();
      assert.strictEqual(Object.keys(userSelectedTools).length, 3);
      assert.strictEqual(userSelectedTools[toolData1.id], true);
      assert.strictEqual(userSelectedTools[toolData2.id], true);
      assert.strictEqual(userSelectedTools[toolData3.id], true);
    });
  });
  test("Can disable a tool from a hidden tool set #324006", () => {
    return runWithFakedTimers({}, async () => {
      const toolData1 = {
        id: "testTool1",
        modelDescription: "Test Tool 1",
        displayName: "Test Tool 1",
        canBeReferencedInPrompt: true,
        toolReferenceName: "t1",
        source: ToolDataSource.Internal
      };
      const toolData2 = {
        id: "testTool2",
        modelDescription: "Test Tool 2",
        displayName: "Test Tool 2",
        source: ToolDataSource.Internal,
        canBeReferencedInPrompt: true,
        toolReferenceName: "t2"
      };
      const toolset = toolsService.createToolSet(
        ToolDataSource.Internal,
        "hiddenToolSet",
        "hiddenToolSet",
        { hiddenInToolsPicker: true }
      );
      store.add(toolsService.registerToolData(toolData1));
      store.add(toolsService.registerToolData(toolData2));
      store.add(toolset);
      store.add(toolset.addTool(toolData1));
      store.add(toolset.addTool(toolData2));
      await timeout(1e3);
      const toSet = ToolAndToolSetEnablementMap.fromEntries([[toolData1, true], [toolData2, false]]);
      selectedTools.set(toSet, false);
      const userSelectedTools = selectedTools.userSelectedTools.get();
      assert.strictEqual(userSelectedTools[toolData1.id], true);
      assert.strictEqual(userSelectedTools[toolData2.id], false);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcaW5wdXRcXGNoYXRTZWxlY3RlZFRvb2xzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvYnJvd3Nlci9jb250ZXh0S2V5U2VydmljZS5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIElUb29sRGF0YSwgVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwLCBUb29sRGF0YVNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1vY2tDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9tb2NrQ2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFNlbGVjdGVkVG9vbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9pbnB1dC9jaGF0U2VsZWN0ZWRUb29scy5qcyc7XG5pbXBvcnQgeyBjb25zdE9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY2hhdE1vZGVzLmpzJztcblxuc3VpdGUoJ0NoYXRTZWxlY3RlZFRvb2xzJywgKCkgPT4ge1xuXG5cdGxldCBzdG9yZTogRGlzcG9zYWJsZVN0b3JlO1xuXG5cdGxldCB0b29sc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlO1xuXHRsZXQgc2VsZWN0ZWRUb29sczogQ2hhdFNlbGVjdGVkVG9vbHM7XG5cblx0c2V0dXAoKCkgPT4ge1xuXG5cdFx0c3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCBpbnN0YVNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh7XG5cdFx0XHRjb250ZXh0S2V5U2VydmljZTogKCkgPT4gc3RvcmUuYWRkKG5ldyBDb250ZXh0S2V5U2VydmljZShuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKSksXG5cdFx0fSwgc3RvcmUpO1xuXHRcdGluc3RhU2VydmljZS5zdHViKElDaGF0U2VydmljZSwgbmV3IE1vY2tDaGF0U2VydmljZSgpKTtcblx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UpKTtcblxuXHRcdHN0b3JlLmFkZChpbnN0YVNlcnZpY2UpO1xuXHRcdHRvb2xzU2VydmljZSA9IGluc3RhU2VydmljZS5nZXQoSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UpO1xuXHRcdHNlbGVjdGVkVG9vbHMgPSBzdG9yZS5hZGQoaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRTZWxlY3RlZFRvb2xzLCBjb25zdE9ic2VydmFibGUoQ2hhdE1vZGUuQWdlbnQpLCBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSkpO1xuXHR9KTtcblxuXHR0ZWFyZG93bihmdW5jdGlvbiAoKSB7XG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBtY3BTb3VyY2U6IFRvb2xEYXRhU291cmNlID0geyB0eXBlOiAnbWNwJywgbGFiZWw6ICdNQ1AnLCBjb2xsZWN0aW9uSWQ6ICcnLCBkZWZpbml0aW9uSWQ6ICcnLCBpbnN0cnVjdGlvbnM6ICcnLCBzZXJ2ZXJMYWJlbDogJycgfTtcblx0dGVzdCgnQ2FuXFwndCBlbmFibGUvZGlzYWJsZSBNQ1AgdG9vbHMgZGlyZWN0bHkgIzE4MTYxJywgKCkgPT4ge1xuXG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXG5cdFx0XHRjb25zdCB0b29sRGF0YTE6IElUb29sRGF0YSA9IHtcblx0XHRcdFx0aWQ6ICd0ZXN0VG9vbDEnLFxuXHRcdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnVGVzdCBUb29sIDEnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1Rlc3QgVG9vbCAxJyxcblx0XHRcdFx0Y2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsXG5cdFx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAndDEnLFxuXHRcdFx0XHRzb3VyY2U6IG1jcFNvdXJjZSxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHRvb2xEYXRhMjogSVRvb2xEYXRhID0ge1xuXHRcdFx0XHRpZDogJ3Rlc3RUb29sMicsXG5cdFx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdUZXN0IFRvb2wgMicsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnVGVzdCBUb29sIDInLFxuXHRcdFx0XHRzb3VyY2U6IG1jcFNvdXJjZSxcblx0XHRcdFx0Y2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsXG5cdFx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAndDInLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgdG9vbERhdGEzOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRcdGlkOiAndGVzdFRvb2wzJyxcblx0XHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1Rlc3QgVG9vbCAzJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdUZXN0IFRvb2wgMycsXG5cdFx0XHRcdHNvdXJjZTogbWNwU291cmNlLFxuXHRcdFx0XHRjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSxcblx0XHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICd0MycsXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCB0b29sc2V0ID0gdG9vbHNTZXJ2aWNlLmNyZWF0ZVRvb2xTZXQoXG5cdFx0XHRcdG1jcFNvdXJjZSxcblx0XHRcdFx0J21jcCcsICdtY3AnXG5cdFx0XHQpO1xuXG5cdFx0XHRzdG9yZS5hZGQodG9vbHNTZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEodG9vbERhdGExKSk7XG5cdFx0XHRzdG9yZS5hZGQodG9vbHNTZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEodG9vbERhdGEyKSk7XG5cdFx0XHRzdG9yZS5hZGQodG9vbHNTZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEodG9vbERhdGEzKSk7XG5cblx0XHRcdHN0b3JlLmFkZCh0b29sc2V0KTtcblx0XHRcdHN0b3JlLmFkZCh0b29sc2V0LmFkZFRvb2wodG9vbERhdGExKSk7XG5cdFx0XHRzdG9yZS5hZGQodG9vbHNldC5hZGRUb29sKHRvb2xEYXRhMikpO1xuXHRcdFx0c3RvcmUuYWRkKHRvb2xzZXQuYWRkVG9vbCh0b29sRGF0YTMpKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEl0ZXJhYmxlLmxlbmd0aCh0b29sc1NlcnZpY2UuZ2V0VG9vbHModW5kZWZpbmVkKSksIDMpO1xuXG5cdFx0XHRjb25zdCBzaXplID0gSXRlcmFibGUubGVuZ3RoKHRvb2xzZXQuZ2V0VG9vbHMoKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2l6ZSwgMyk7XG5cblx0XHRcdGF3YWl0IHRpbWVvdXQoMTAwMCk7IC8vIFVHTFkgdGhlIHRvb2xzIHNlcnZpY2UgdXBkYXRlcyBpdHMgc3RhdGUgc3luYyBidXQgZW1pdHMgdGhlIGV2ZW50IGFzeW5jICg3NTBtcykgZGVsYXkuIFRoaXMgYWZmZWN0cyB0aGUgb2JzZXJ2YWJsZSB0aGF0IGRlcGVuZHMgb24gdGhlIGV2ZW50XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWxlY3RlZFRvb2xzLmVudHJpZXNNYXAuZ2V0KCkuc2l6ZSwgOCk7IC8vIDEgdG9vbHNldCAoKzQgdnNjb2RlLCBleGVjdXRlLCByZWFkLCBhZ2VudCB0b29sc2V0cyksIDMgdG9vbHNcblxuXHRcdFx0Y29uc3QgdG9TZXQgPSBUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAuZnJvbUVudHJpZXMoW1t0b29sRGF0YTEsIHRydWVdLCBbdG9vbERhdGEyLCBmYWxzZV0sIFt0b29sRGF0YTMsIGZhbHNlXSwgW3Rvb2xzZXQsIGZhbHNlXV0pO1xuXHRcdFx0c2VsZWN0ZWRUb29scy5zZXQodG9TZXQsIGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgdXNlclNlbGVjdGVkVG9vbHMgPSBzZWxlY3RlZFRvb2xzLnVzZXJTZWxlY3RlZFRvb2xzLmdldCgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKE9iamVjdC5rZXlzKHVzZXJTZWxlY3RlZFRvb2xzKS5sZW5ndGgsIDMpOyAvLyAzIHRvb2xzXG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1c2VyU2VsZWN0ZWRUb29sc1t0b29sRGF0YTEuaWRdLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1c2VyU2VsZWN0ZWRUb29sc1t0b29sRGF0YTIuaWRdLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXNlclNlbGVjdGVkVG9vbHNbdG9vbERhdGEzLmlkXSwgZmFsc2UpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdDYW4gc3RpbGwgZW5hYmxlL2Rpc2FibGUgdXNlciB0b29sc2V0cyAjMjUxNjQwJywgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xEYXRhMTogSVRvb2xEYXRhID0ge1xuXHRcdFx0XHRpZDogJ3Rlc3RUb29sMScsXG5cdFx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdUZXN0IFRvb2wgMScsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnVGVzdCBUb29sIDEnLFxuXHRcdFx0XHRjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSxcblx0XHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICd0MScsXG5cdFx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCB0b29sRGF0YTI6IElUb29sRGF0YSA9IHtcblx0XHRcdFx0aWQ6ICd0ZXN0VG9vbDInLFxuXHRcdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnVGVzdCBUb29sIDInLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1Rlc3QgVG9vbCAyJyxcblx0XHRcdFx0c291cmNlOiBtY3BTb3VyY2UsXG5cdFx0XHRcdGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiB0cnVlLFxuXHRcdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ3QyJyxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHRvb2xEYXRhMzogSVRvb2xEYXRhID0ge1xuXHRcdFx0XHRpZDogJ3Rlc3RUb29sMycsXG5cdFx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdUZXN0IFRvb2wgMycsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnVGVzdCBUb29sIDMnLFxuXHRcdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0XHRjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSxcblx0XHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICd0MycsXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCB0b29sc2V0ID0gdG9vbHNTZXJ2aWNlLmNyZWF0ZVRvb2xTZXQoXG5cdFx0XHRcdHsgdHlwZTogJ3VzZXInLCBsYWJlbDogJ1VzZXIgVG9vbHNldCcsIGZpbGU6IFVSSS5maWxlKCcvdXNlclRvb2xzZXQuanNvbicpIH0sXG5cdFx0XHRcdCd1c2VyVG9vbHNldCcsICd1c2VyVG9vbHNldCdcblx0XHRcdCk7XG5cblx0XHRcdHN0b3JlLmFkZCh0b29sc1NlcnZpY2UucmVnaXN0ZXJUb29sRGF0YSh0b29sRGF0YTEpKTtcblx0XHRcdHN0b3JlLmFkZCh0b29sc1NlcnZpY2UucmVnaXN0ZXJUb29sRGF0YSh0b29sRGF0YTIpKTtcblx0XHRcdHN0b3JlLmFkZCh0b29sc1NlcnZpY2UucmVnaXN0ZXJUb29sRGF0YSh0b29sRGF0YTMpKTtcblxuXHRcdFx0c3RvcmUuYWRkKHRvb2xzZXQpO1xuXHRcdFx0c3RvcmUuYWRkKHRvb2xzZXQuYWRkVG9vbCh0b29sRGF0YTEpKTtcblx0XHRcdHN0b3JlLmFkZCh0b29sc2V0LmFkZFRvb2wodG9vbERhdGEyKSk7XG5cdFx0XHRzdG9yZS5hZGQodG9vbHNldC5hZGRUb29sKHRvb2xEYXRhMykpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoSXRlcmFibGUubGVuZ3RoKHRvb2xzU2VydmljZS5nZXRUb29scyh1bmRlZmluZWQpKSwgMyk7XG5cblx0XHRcdGNvbnN0IHNpemUgPSBJdGVyYWJsZS5sZW5ndGgodG9vbHNldC5nZXRUb29scygpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaXplLCAzKTtcblxuXHRcdFx0YXdhaXQgdGltZW91dCgxMDAwKTsgLy8gVUdMWSB0aGUgdG9vbHMgc2VydmljZSB1cGRhdGVzIGl0cyBzdGF0ZSBzeW5jIGJ1dCBlbWl0cyB0aGUgZXZlbnQgYXN5bmMgKDc1MG1zKSBkZWxheS4gVGhpcyBhZmZlY3RzIHRoZSBvYnNlcnZhYmxlIHRoYXQgZGVwZW5kcyBvbiB0aGUgZXZlbnRcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlbGVjdGVkVG9vbHMuZW50cmllc01hcC5nZXQoKS5zaXplLCA4KTsgLy8gMSB0b29sc2V0ICgrNCB2c2NvZGUsIGV4ZWN1dGUsIHJlYWQsIGFnZW50IHRvb2xzZXRzKSwgMyB0b29sc1xuXG5cdFx0XHQvLyBUb29sc2V0IGlzIGNoZWNrZWQsIHRvb2xzIDIgYW5kIDMgYXJlIHVuY2hlY2tlZFxuXHRcdFx0Y29uc3QgdG9TZXQgPSBUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAuZnJvbUVudHJpZXMoW1t0b29sRGF0YTEsIHRydWVdLCBbdG9vbERhdGEyLCBmYWxzZV0sIFt0b29sRGF0YTMsIGZhbHNlXSwgW3Rvb2xzZXQsIHRydWVdXSk7XG5cdFx0XHRzZWxlY3RlZFRvb2xzLnNldCh0b1NldCwgZmFsc2UpO1xuXG5cdFx0XHRjb25zdCB1c2VyU2VsZWN0ZWRUb29scyA9IHNlbGVjdGVkVG9vbHMudXNlclNlbGVjdGVkVG9vbHMuZ2V0KCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoT2JqZWN0LmtleXModXNlclNlbGVjdGVkVG9vbHMpLmxlbmd0aCwgMyk7IC8vIDMgdG9vbHNcblxuXHRcdFx0Ly8gVXNlciB0b29sc2V0IGlzIGVuYWJsZWQgLSBhbGwgdG9vbHMgYXJlIGVuYWJsZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1c2VyU2VsZWN0ZWRUb29sc1t0b29sRGF0YTEuaWRdLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1c2VyU2VsZWN0ZWRUb29sc1t0b29sRGF0YTIuaWRdLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1c2VyU2VsZWN0ZWRUb29sc1t0b29sRGF0YTMuaWRdLCB0cnVlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQ2FuIGRpc2FibGUgYSB0b29sIGZyb20gYSBoaWRkZW4gdG9vbCBzZXQgIzMyNDAwNicsICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sRGF0YTE6IElUb29sRGF0YSA9IHtcblx0XHRcdFx0aWQ6ICd0ZXN0VG9vbDEnLFxuXHRcdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnVGVzdCBUb29sIDEnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1Rlc3QgVG9vbCAxJyxcblx0XHRcdFx0Y2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsXG5cdFx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAndDEnLFxuXHRcdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgdG9vbERhdGEyOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRcdGlkOiAndGVzdFRvb2wyJyxcblx0XHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1Rlc3QgVG9vbCAyJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdUZXN0IFRvb2wgMicsXG5cdFx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHRcdGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiB0cnVlLFxuXHRcdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ3QyJyxcblx0XHRcdH07XG5cblx0XHRcdC8vIEEgdG9vbCBzZXQgdGhhdCBpcyBoaWRkZW4gZnJvbSB0aGUgdG9vbHMgcGlja2VyIChlLmcuIGEgYnVpbHQtaW4gY2xpZW50IHRvb2wgc2V0KS5cblx0XHRcdC8vIFRoZSB1c2VyIGNhbiBub3QgdG9nZ2xlIGl0LCBzbyBpdCBhbHdheXMgcmVzb2x2ZXMgdG8gZW5hYmxlZCBhbmQgbXVzdCBub3QgZm9yY2UgaXRzXG5cdFx0XHQvLyBtZW1iZXIgdG9vbHMgYmFjayBvbiB3aGVuIHRoZXkgYXJlIGluZGl2aWR1YWxseSBkaXNhYmxlZC5cblx0XHRcdGNvbnN0IHRvb2xzZXQgPSB0b29sc1NlcnZpY2UuY3JlYXRlVG9vbFNldChcblx0XHRcdFx0VG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHRcdCdoaWRkZW5Ub29sU2V0JywgJ2hpZGRlblRvb2xTZXQnLFxuXHRcdFx0XHR7IGhpZGRlbkluVG9vbHNQaWNrZXI6IHRydWUgfVxuXHRcdFx0KTtcblxuXHRcdFx0c3RvcmUuYWRkKHRvb2xzU2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHRvb2xEYXRhMSkpO1xuXHRcdFx0c3RvcmUuYWRkKHRvb2xzU2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHRvb2xEYXRhMikpO1xuXG5cdFx0XHRzdG9yZS5hZGQodG9vbHNldCk7XG5cdFx0XHRzdG9yZS5hZGQodG9vbHNldC5hZGRUb29sKHRvb2xEYXRhMSkpO1xuXHRcdFx0c3RvcmUuYWRkKHRvb2xzZXQuYWRkVG9vbCh0b29sRGF0YTIpKTtcblxuXHRcdFx0YXdhaXQgdGltZW91dCgxMDAwKTsgLy8gVUdMWSB0aGUgdG9vbHMgc2VydmljZSB1cGRhdGVzIGl0cyBzdGF0ZSBzeW5jIGJ1dCBlbWl0cyB0aGUgZXZlbnQgYXN5bmMgKDc1MG1zKSBkZWxheS4gVGhpcyBhZmZlY3RzIHRoZSBvYnNlcnZhYmxlIHRoYXQgZGVwZW5kcyBvbiB0aGUgZXZlbnRcblxuXHRcdFx0Ly8gRGlzYWJsZSB0b29sIDIgaW5kaXZpZHVhbGx5LiBUaGUgaGlkZGVuIHRvb2wgc2V0IGhhcyBubyBzdG9yZWQgc3RhdGUgKHRoZSBwaWNrZXJcblx0XHRcdC8vIG5ldmVyIHN1cmZhY2VzIGl0KSwgc28gaXQgZGVmYXVsdHMgdG8gZW5hYmxlZC5cblx0XHRcdGNvbnN0IHRvU2V0ID0gVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwLmZyb21FbnRyaWVzKFtbdG9vbERhdGExLCB0cnVlXSwgW3Rvb2xEYXRhMiwgZmFsc2VdXSk7XG5cdFx0XHRzZWxlY3RlZFRvb2xzLnNldCh0b1NldCwgZmFsc2UpO1xuXG5cdFx0XHRjb25zdCB1c2VyU2VsZWN0ZWRUb29scyA9IHNlbGVjdGVkVG9vbHMudXNlclNlbGVjdGVkVG9vbHMuZ2V0KCk7XG5cblx0XHRcdC8vIFRoZSBpbmRpdmlkdWFsbHkgZGlzYWJsZWQgdG9vbCBzdGF5cyBkaXNhYmxlZCBldmVuIHRob3VnaCBpdHMgb3duaW5nIHRvb2wgc2V0IHJlc29sdmVzIHRvIGVuYWJsZWQuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXNlclNlbGVjdGVkVG9vbHNbdG9vbERhdGExLmlkXSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXNlclNlbGVjdGVkVG9vbHNbdG9vbERhdGEyLmlkXSwgZmFsc2UpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsNEJBQXVDLDZCQUE2QixzQkFBc0I7QUFDbkcsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUV6QixNQUFNLHFCQUFxQixNQUFNO0FBRWhDLE1BQUk7QUFFSixNQUFJO0FBQ0osTUFBSTtBQUVKLFFBQU0sTUFBTTtBQUVYLFlBQVEsSUFBSSxnQkFBZ0I7QUFFNUIsVUFBTSxlQUFlLDhCQUE4QjtBQUFBLE1BQ2xELG1CQUFtQixNQUFNLE1BQU0sSUFBSSxJQUFJLGtCQUFrQixJQUFJLDBCQUF3QixDQUFDO0FBQUEsSUFDdkYsR0FBRyxLQUFLO0FBQ1IsaUJBQWEsS0FB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
