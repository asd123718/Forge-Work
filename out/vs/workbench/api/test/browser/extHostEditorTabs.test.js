import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { mock } from "../../../../base/test/common/mock.js";
import { TabInputKind, TabModelOperationKind } from "../../common/extHost.protocol.js";
import { ExtHostEditorTabs } from "../../common/extHostEditorTabs.js";
import { SingleProxyRPCProtocol } from "../common/testRPCProtocol.js";
import { TextMergeTabInput, TextTabInput } from "../../common/extHostTypes.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
suite("ExtHostEditorTabs", function() {
  const defaultTabDto = {
    id: "uniquestring",
    input: { kind: TabInputKind.TextInput, uri: URI.parse("file://abc/def.txt") },
    isActive: true,
    isDirty: true,
    isPinned: true,
    isPreview: false,
    label: "label1"
  };
  function createTabDto(dto) {
    return { ...defaultTabDto, ...dto };
  }
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("Ensure empty model throws when accessing active group", function() {
    const extHostEditorTabs = new ExtHostEditorTabs(
      SingleProxyRPCProtocol(new class extends mock() {
        // override/implement $moveTab or $closeTab
      }())
    );
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 0);
    assert.throws(() => extHostEditorTabs.tabGroups.activeTabGroup);
  });
  test("single tab", function() {
    const extHostEditorTabs = new ExtHostEditorTabs(
      SingleProxyRPCProtocol(new class extends mock() {
        // override/implement $moveTab or $closeTab
      }())
    );
    const tab = createTabDto({
      id: "uniquestring",
      isActive: true,
      isDirty: true,
      isPinned: true,
      label: "label1"
    });
    extHostEditorTabs.$acceptEditorTabModel([{
      isActive: true,
      viewColumn: 0,
      groupId: 12,
      tabs: [tab]
    }]);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    const [first] = extHostEditorTabs.tabGroups.all;
    assert.ok(first.activeTab);
    assert.strictEqual(first.tabs.indexOf(first.activeTab), 0);
    {
      extHostEditorTabs.$acceptEditorTabModel([{
        isActive: true,
        viewColumn: 0,
        groupId: 12,
        tabs: [tab]
      }]);
      assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
      const [first2] = extHostEditorTabs.tabGroups.all;
      assert.ok(first2.activeTab);
      assert.strictEqual(first2.tabs.indexOf(first2.activeTab), 0);
    }
  });
  test("Empty tab group", function() {
    const extHostEditorTabs = new ExtHostEditorTabs(
      SingleProxyRPCProtocol(new class extends mock() {
        // override/implement $moveTab or $closeTab
      }())
    );
    extHostEditorTabs.$acceptEditorTabModel([{
      isActive: true,
      viewColumn: 0,
      groupId: 12,
      tabs: []
    }]);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    const [first] = extHostEditorTabs.tabGroups.all;
    assert.strictEqual(first.activeTab, void 0);
    assert.strictEqual(first.tabs.length, 0);
  });
  test("Ensure tabGroup change events fires", function() {
    const extHostEditorTabs = new ExtHostEditorTabs(
      SingleProxyRPCProtocol(new class extends mock() {
        // override/implement $moveTab or $closeTab
      }())
    );
    let count = 0;
    store.add(extHostEditorTabs.tabGroups.onDidChangeTabGroups(() => count++));
    assert.strictEqual(count, 0);
    extHostEditorTabs.$acceptEditorTabModel([{
      isActive: true,
      viewColumn: 0,
      groupId: 12,
      tabs: []
    }]);
    assert.ok(extHostEditorTabs.tabGroups.activeTabGroup);
    const activeTabGroup = extHostEditorTabs.tabGroups.activeTabGroup;
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    assert.strictEqual(activeTabGroup.tabs.length, 0);
    assert.strictEqual(count, 1);
  });
  test("Check TabGroupChangeEvent properties", function() {
    const extHostEditorTabs = new ExtHostEditorTabs(
      SingleProxyRPCProtocol(new class extends mock() {
        // override/implement $moveTab or $closeTab
      }())
    );
    const group1Data = {
      isActive: true,
      viewColumn: 0,
      groupId: 12,
      tabs: []
    };
    const group2Data = { ...group1Data, groupId: 13 };
    const events = [];
    store.add(extHostEditorTabs.tabGroups.onDidChangeTabGroups((e) => events.push(e)));
    extHostEditorTabs.$acceptEditorTabModel([group1Data]);
    assert.deepStrictEqual(events, [{
      changed: [],
      closed: [],
      opened: [extHostEditorTabs.tabGroups.activeTabGroup]
    }]);
    events.length = 0;
    extHostEditorTabs.$acceptEditorTabModel([{ ...group1Data, isActive: false }, group2Data]);
    assert.deepStrictEqual(events, [{
      changed: [extHostEditorTabs.tabGroups.all[0]],
      closed: [],
      opened: [extHostEditorTabs.tabGroups.all[1]]
    }]);
    events.length = 0;
    extHostEditorTabs.$acceptEditorTabModel([group1Data, { ...group2Data, isActive: false }]);
    assert.deepStrictEqual(events, [{
      changed: extHostEditorTabs.tabGroups.all,
      closed: [],
      opened: []
    }]);
    events.length = 0;
    const oldActiveGroup = extHostEditorTabs.tabGroups.activeTabGroup;
    extHostEditorTabs.$acceptEditorTabModel([group2Data]);
    assert.deepStrictEqual(events, [{
      changed: extHostEditorTabs.tabGroups.all,
      closed: [oldActiveGroup],
      opened: []
    }]);
  });
  test("Ensure reference equality for activeTab and activeGroup", function() {
    const extHostEditorTabs = new ExtHostEditorTabs(
      SingleProxyRPCProtocol(new class extends mock() {
        // override/implement $moveTab or $closeTab
      }())
    );
    const tab = createTabDto({
      id: "uniquestring",
      isActive: true,
      isDirty: true,
      isPinned: true,
      label: "label1",
      editorId: "default"
    });
    extHostEditorTabs.$acceptEditorTabModel([{
      isActive: true,
      viewColumn: 0,
      groupId: 12,
      tabs: [tab]
    }]);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    const [first] = extHostEditorTabs.tabGroups.all;
    assert.ok(first.activeTab);
    assert.strictEqual(first.tabs.indexOf(first.activeTab), 0);
    assert.strictEqual(first.activeTab, first.tabs[0]);
    assert.strictEqual(extHostEditorTabs.tabGroups.activeTabGroup, first);
  });
  test("TextMergeTabInput surfaces in the UI", function() {
    const extHostEditorTabs = new ExtHostEditorTabs(
      SingleProxyRPCProtocol(new class extends mock() {
        // override/implement $moveTab or $closeTab
      }())
    );
    const tab = createTabDto({
      input: {
        kind: TabInputKind.TextMergeInput,
        base: URI.from({ scheme: "test", path: "base" }),
        input1: URI.from({ scheme: "test", path: "input1" }),
        input2: URI.from({ scheme: "test", path: "input2" }),
        result: URI.from({ scheme: "test", path: "result" })
      }
    });
    extHostEditorTabs.$acceptEditorTabModel([{
      isActive: true,
      viewColumn: 0,
      groupId: 12,
      tabs: [tab]
    }]);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    const [first] = extHostEditorTabs.tabGroups.all;
    assert.ok(first.activeTab);
    assert.strictEqual(first.tabs.indexOf(first.activeTab), 0);
    assert.ok(first.activeTab.input instanceof TextMergeTabInput);
  });
  test("Ensure reference stability", function() {
    const extHostEditorTabs = new ExtHostEditorTabs(
      SingleProxyRPCProtocol(new class extends mock() {
        // override/implement $moveTab or $closeTab
      }())
    );
    const tabDto = createTabDto();
    extHostEditorTabs.$acceptEditorTabModel([{
      isActive: true,
      viewColumn: 0,
      groupId: 12,
      tabs: [tabDto]
    }]);
    let all = extHostEditorTabs.tabGroups.all.map((group) => group.tabs).flat();
    assert.strictEqual(all.length, 1);
    const apiTab1 = all[0];
    assert.ok(apiTab1.input instanceof TextTabInput);
    assert.strictEqual(tabDto.input.kind, TabInputKind.TextInput);
    const dtoResource = tabDto.input.uri;
    assert.strictEqual(apiTab1.input.uri.toString(), URI.revive(dtoResource).toString());
    assert.strictEqual(apiTab1.isDirty, true);
    const tabDto2 = { ...tabDto, isDirty: false };
    extHostEditorTabs.$acceptTabOperation({
      kind: TabModelOperationKind.TAB_UPDATE,
      index: 0,
      tabDto: tabDto2,
      groupId: 12
    });
    all = extHostEditorTabs.tabGroups.all.map((group) => group.tabs).flat();
    assert.strictEqual(all.length, 1);
    const apiTab2 = all[0];
    assert.ok(apiTab1.input instanceof TextTabInput);
    assert.strictEqual(apiTab1.input.uri.toString(), URI.revive(dtoResource).toString());
    assert.strictEqual(apiTab2.isDirty, false);
    assert.strictEqual(apiTab1 === apiTab2, true);
  });
  test("Tab.isActive working", function() {
    const extHostEditorTabs = new ExtHostEditorTabs(
      SingleProxyRPCProtocol(new class extends mock() {
        // override/implement $moveTab or $closeTab
      }())
    );
    const tabDtoAAA = createTabDto({
      id: "AAA",
      isActive: true,
      isDirty: true,
      isPinned: true,
      label: "label1",
      input: { kind: TabInputKind.TextInput, uri: URI.parse("file://abc/AAA.txt") },
      editorId: "default"
    });
    const tabDtoBBB = createTabDto({
      id: "BBB",
      isActive: false,
      isDirty: true,
      isPinned: true,
      label: "label1",
      input: { kind: TabInputKind.TextInput, uri: URI.parse("file://abc/BBB.txt") },
      editorId: "default"
    });
    extHostEditorTabs.$acceptEditorTabModel([{
      isActive: true,
      viewColumn: 0,
      groupId: 12,
      tabs: [tabDtoAAA, tabDtoBBB]
    }]);
    const all = extHostEditorTabs.tabGroups.all.map((group) => group.tabs).flat();
    assert.strictEqual(all.length, 2);
    const activeTab1 = extHostEditorTabs.tabGroups.activeTabGroup?.activeTab;
    assert.ok(activeTab1?.input instanceof TextTabInput);
    assert.strictEqual(tabDtoAAA.input.kind, TabInputKind.TextInput);
    const dtoAAAResource = tabDtoAAA.input.uri;
    assert.strictEqual(activeTab1?.input?.uri.toString(), URI.revive(dtoAAAResource)?.toString());
    assert.strictEqual(activeTab1?.isActive, true);
    extHostEditorTabs.$acceptTabOperation({
      groupId: 12,
      index: 1,
      kind: TabModelOperationKind.TAB_UPDATE,
      tabDto: { ...tabDtoBBB, isActive: true }
      /// BBB is now active
    });
    const activeTab2 = extHostEditorTabs.tabGroups.activeTabGroup?.activeTab;
    assert.ok(activeTab2?.input instanceof TextTabInput);
    assert.strictEqual(tabDtoBBB.input.kind, TabInputKind.TextInput);
    const dtoBBBResource = tabDtoBBB.input.uri;
    assert.strictEqual(activeTab2?.input?.uri.toString(), URI.revive(dtoBBBResource)?.toString());
    assert.strictEqual(activeTab2?.isActive, true);
    assert.strictEqual(activeTab1?.isActive, false);
  });
  test("vscode.window.tagGroups is immutable", function() {
    const extHostEditorTabs = new ExtHostEditorTabs(
      SingleProxyRPCProtocol(new class extends mock() {
        // override/implement $moveTab or $closeTab
      }())
    );
    assert.throws(() => {
      extHostEditorTabs.tabGroups.activeTabGroup = void 0;
    });
    assert.throws(() => {
      extHostEditorTabs.tabGroups.all.length = 0;
    });
    assert.throws(() => {
      extHostEditorTabs.tabGroups.onDidChangeActiveTabGroup = void 0;
    });
    assert.throws(() => {
      extHostEditorTabs.tabGroups.onDidChangeTabGroups = void 0;
    });
  });
  test("Ensure close is called with all tab ids", function() {
    const closedTabIds = [];
    const extHostEditorTabs = new ExtHostEditorTabs(
      SingleProxyRPCProtocol(new class extends mock() {
        // override/implement $moveTab or $closeTab
        async $closeTab(tabIds, preserveFocus) {
          closedTabIds.push(tabIds);
          return true;
        }
      }())
    );
    const tab = createTabDto({
      id: "uniquestring",
      isActive: true,
      isDirty: true,
      isPinned: true,
      label: "label1",
      editorId: "default"
    });
    extHostEditorTabs.$acceptEditorTabModel([{
      isActive: true,
      viewColumn: 0,
      groupId: 12,
      tabs: [tab]
    }]);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    const activeTab = extHostEditorTabs.tabGroups.activeTabGroup?.activeTab;
    assert.ok(activeTab);
    extHostEditorTabs.tabGroups.close(activeTab, false);
    assert.strictEqual(closedTabIds.length, 1);
    assert.deepStrictEqual(closedTabIds[0], ["uniquestring"]);
    extHostEditorTabs.tabGroups.close([activeTab], false);
    assert.strictEqual(closedTabIds.length, 2);
    assert.deepStrictEqual(closedTabIds[1], ["uniquestring"]);
  });
  test("Update tab only sends tab change event", async function() {
    const closedTabIds = [];
    const extHostEditorTabs = new ExtHostEditorTabs(
      SingleProxyRPCProtocol(new class extends mock() {
        // override/implement $moveTab or $closeTab
        async $closeTab(tabIds, preserveFocus) {
          closedTabIds.push(tabIds);
          return true;
        }
      }())
    );
    const tabDto = createTabDto({
      id: "uniquestring",
      isActive: true,
      isDirty: true,
      isPinned: true,
      label: "label1",
      editorId: "default"
    });
    extHostEditorTabs.$acceptEditorTabModel([{
      isActive: true,
      viewColumn: 0,
      groupId: 12,
      tabs: [tabDto]
    }]);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.map((g) => g.tabs).flat().length, 1);
    const tab = extHostEditorTabs.tabGroups.all[0].tabs[0];
    const p = new Promise((resolve) => store.add(extHostEditorTabs.tabGroups.onDidChangeTabs(resolve)));
    extHostEditorTabs.$acceptTabOperation({
      groupId: 12,
      index: 0,
      kind: TabModelOperationKind.TAB_UPDATE,
      tabDto: { ...tabDto, label: "NEW LABEL" }
    });
    const changedTab = (await p).changed[0];
    assert.ok(tab === changedTab);
    assert.strictEqual(changedTab.label, "NEW LABEL");
  });
  test("Active tab", function() {
    const extHostEditorTabs = new ExtHostEditorTabs(
      SingleProxyRPCProtocol(new class extends mock() {
        // override/implement $moveTab or $closeTab
      }())
    );
    const tab1 = createTabDto({
      id: "uniquestring",
      isActive: true,
      isDirty: true,
      isPinned: true,
      label: "label1"
    });
    const tab2 = createTabDto({
      isActive: false,
      id: "uniquestring2"
    });
    const tab3 = createTabDto({
      isActive: false,
      id: "uniquestring3"
    });
    extHostEditorTabs.$acceptEditorTabModel([{
      isActive: true,
      viewColumn: 0,
      groupId: 12,
      tabs: [tab1, tab2, tab3]
    }]);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.map((g) => g.tabs).flat().length, 3);
    assert.strictEqual(extHostEditorTabs.tabGroups.activeTabGroup?.activeTab, extHostEditorTabs.tabGroups.activeTabGroup?.tabs[0]);
    tab1.isActive = false;
    tab2.isActive = true;
    extHostEditorTabs.$acceptTabOperation({
      groupId: 12,
      index: 0,
      kind: TabModelOperationKind.TAB_UPDATE,
      tabDto: tab1
    });
    extHostEditorTabs.$acceptTabOperation({
      groupId: 12,
      index: 1,
      kind: TabModelOperationKind.TAB_UPDATE,
      tabDto: tab2
    });
    assert.strictEqual(extHostEditorTabs.tabGroups.activeTabGroup?.activeTab, extHostEditorTabs.tabGroups.activeTabGroup?.tabs[1]);
    tab3.isActive = true;
    extHostEditorTabs.$acceptEditorTabModel([{
      isActive: true,
      viewColumn: 0,
      groupId: 12,
      tabs: [tab3]
    }]);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.map((g) => g.tabs).flat().length, 1);
    assert.strictEqual(extHostEditorTabs.tabGroups.activeTabGroup?.activeTab, extHostEditorTabs.tabGroups.activeTabGroup?.tabs[0]);
    extHostEditorTabs.$acceptEditorTabModel([{
      isActive: true,
      viewColumn: 0,
      groupId: 12,
      tabs: []
    }]);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.map((g) => g.tabs).flat().length, 0);
    assert.strictEqual(extHostEditorTabs.tabGroups.activeTabGroup?.activeTab, void 0);
  });
  test("Tab operations patches open and close correctly", function() {
    const extHostEditorTabs = new ExtHostEditorTabs(
      SingleProxyRPCProtocol(new class extends mock() {
        // override/implement $moveTab or $closeTab
      }())
    );
    const tab1 = createTabDto({
      id: "uniquestring",
      isActive: true,
      label: "label1"
    });
    const tab2 = createTabDto({
      isActive: false,
      id: "uniquestring2",
      label: "label2"
    });
    const tab3 = createTabDto({
      isActive: false,
      id: "uniquestring3",
      label: "label3"
    });
    extHostEditorTabs.$acceptEditorTabModel([{
      isActive: true,
      viewColumn: 0,
      groupId: 12,
      tabs: [tab1, tab2, tab3]
    }]);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.map((g) => g.tabs).flat().length, 3);
    extHostEditorTabs.$acceptTabOperation({
      groupId: 12,
      index: 1,
      kind: TabModelOperationKind.TAB_CLOSE,
      tabDto: tab2
    });
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.map((g) => g.tabs).flat().length, 2);
    extHostEditorTabs.$acceptTabOperation({
      groupId: 12,
      index: 0,
      kind: TabModelOperationKind.TAB_CLOSE,
      tabDto: tab1
    });
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.map((g) => g.tabs).flat().length, 1);
    tab3.isActive = true;
    extHostEditorTabs.$acceptTabOperation({
      groupId: 12,
      index: 0,
      kind: TabModelOperationKind.TAB_UPDATE,
      tabDto: tab3
    });
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.map((g) => g.tabs).flat().length, 1);
    assert.strictEqual(extHostEditorTabs.tabGroups.all[0]?.activeTab?.label, "label3");
    extHostEditorTabs.$acceptTabOperation({
      groupId: 12,
      index: 1,
      kind: TabModelOperationKind.TAB_OPEN,
      tabDto: tab2
    });
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.map((g) => g.tabs).flat().length, 2);
    assert.strictEqual(extHostEditorTabs.tabGroups.all[0]?.tabs[1]?.label, "label2");
  });
  test("Tab operations patches move correctly", function() {
    const extHostEditorTabs = new ExtHostEditorTabs(
      SingleProxyRPCProtocol(new class extends mock() {
        // override/implement $moveTab or $closeTab
      }())
    );
    const tab1 = createTabDto({
      id: "uniquestring",
      isActive: true,
      label: "label1"
    });
    const tab2 = createTabDto({
      isActive: false,
      id: "uniquestring2",
      label: "label2"
    });
    const tab3 = createTabDto({
      isActive: false,
      id: "uniquestring3",
      label: "label3"
    });
    extHostEditorTabs.$acceptEditorTabModel([{
      isActive: true,
      viewColumn: 0,
      groupId: 12,
      tabs: [tab1, tab2, tab3]
    }]);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.map((g) => g.tabs).flat().length, 3);
    extHostEditorTabs.$acceptTabOperation({
      groupId: 12,
      index: 0,
      oldIndex: 1,
      kind: TabModelOperationKind.TAB_MOVE,
      tabDto: tab2
    });
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.map((g) => g.tabs).flat().length, 3);
    assert.strictEqual(extHostEditorTabs.tabGroups.all[0]?.tabs[0]?.label, "label2");
    extHostEditorTabs.$acceptTabOperation({
      groupId: 12,
      index: 1,
      oldIndex: 2,
      kind: TabModelOperationKind.TAB_MOVE,
      tabDto: tab3
    });
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.map((g) => g.tabs).flat().length, 3);
    assert.strictEqual(extHostEditorTabs.tabGroups.all[0]?.tabs[1]?.label, "label3");
    assert.strictEqual(extHostEditorTabs.tabGroups.all[0]?.tabs[0]?.label, "label2");
    assert.strictEqual(extHostEditorTabs.tabGroups.all[0]?.tabs[2]?.label, "label1");
  });
  test("Reference stability across full model resync", function() {
    const extHostEditorTabs = new ExtHostEditorTabs(
      SingleProxyRPCProtocol(new class extends mock() {
        // override/implement $moveTab or $closeTab
      }())
    );
    const tabAAA = createTabDto({ id: "AAA", label: "AAA", isActive: true, input: { kind: TabInputKind.TextInput, uri: URI.parse("file://abc/AAA.txt") } });
    const tabBBB = createTabDto({ id: "BBB", label: "BBB", isActive: false, input: { kind: TabInputKind.TextInput, uri: URI.parse("file://abc/BBB.txt") } });
    extHostEditorTabs.$acceptEditorTabModel([{
      isActive: true,
      viewColumn: 0,
      groupId: 12,
      tabs: [tabAAA, tabBBB]
    }]);
    const groupBefore = extHostEditorTabs.tabGroups.all[0];
    const tabAAABefore = groupBefore.tabs[0];
    const tabBBBBefore = groupBefore.tabs[1];
    extHostEditorTabs.$acceptEditorTabModel([
      { isActive: false, viewColumn: 0, groupId: 12, tabs: [tabAAA, tabBBB] },
      { isActive: true, viewColumn: 1, groupId: 13, tabs: [] }
    ]);
    const groupAfter = extHostEditorTabs.tabGroups.all.find((g) => g.tabs.length === 2);
    assert.strictEqual(groupAfter, groupBefore);
    assert.strictEqual(groupAfter.tabs[0], tabAAABefore);
    assert.strictEqual(groupAfter.tabs[1], tabBBBBefore);
    extHostEditorTabs.$acceptEditorTabModel([
      { isActive: false, viewColumn: 0, groupId: 12, tabs: [{ ...tabAAA, isActive: true }] },
      { isActive: true, viewColumn: 1, groupId: 13, tabs: [] }
    ]);
    const survivingGroup = extHostEditorTabs.tabGroups.all.find((g) => g.tabs.length === 1);
    assert.strictEqual(survivingGroup, groupBefore);
    assert.strictEqual(survivingGroup.tabs.length, 1);
    assert.strictEqual(survivingGroup.tabs[0], tabAAABefore);
    assert.strictEqual(survivingGroup.activeTab, tabAAABefore);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcdGVzdFxcYnJvd3NlclxcZXh0SG9zdEVkaXRvclRhYnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yVGFiRHRvLCBJRWRpdG9yVGFiR3JvdXBEdG8sIE1haW5UaHJlYWRFZGl0b3JUYWJzU2hhcGUsIFRhYklucHV0S2luZCwgVGFiTW9kZWxPcGVyYXRpb25LaW5kLCBUZXh0SW5wdXREdG8gfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RWRpdG9yVGFicyB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0RWRpdG9yVGFicy5qcyc7XG5pbXBvcnQgeyBTaW5nbGVQcm94eVJQQ1Byb3RvY29sIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RSUENQcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBUZXh0TWVyZ2VUYWJJbnB1dCwgVGV4dFRhYklucHV0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuc3VpdGUoJ0V4dEhvc3RFZGl0b3JUYWJzJywgZnVuY3Rpb24gKCkge1xuXG5cdGNvbnN0IGRlZmF1bHRUYWJEdG86IElFZGl0b3JUYWJEdG8gPSB7XG5cdFx0aWQ6ICd1bmlxdWVzdHJpbmcnLFxuXHRcdGlucHV0OiB7IGtpbmQ6IFRhYklucHV0S2luZC5UZXh0SW5wdXQsIHVyaTogVVJJLnBhcnNlKCdmaWxlOi8vYWJjL2RlZi50eHQnKSB9LFxuXHRcdGlzQWN0aXZlOiB0cnVlLFxuXHRcdGlzRGlydHk6IHRydWUsXG5cdFx0aXNQaW5uZWQ6IHRydWUsXG5cdFx0aXNQcmV2aWV3OiBmYWxzZSxcblx0XHRsYWJlbDogJ2xhYmVsMScsXG5cdH07XG5cblx0ZnVuY3Rpb24gY3JlYXRlVGFiRHRvKGR0bz86IFBhcnRpYWw8SUVkaXRvclRhYkR0bz4pOiBJRWRpdG9yVGFiRHRvIHtcblx0XHRyZXR1cm4geyAuLi5kZWZhdWx0VGFiRHRvLCAuLi5kdG8gfTtcblx0fVxuXG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnRW5zdXJlIGVtcHR5IG1vZGVsIHRocm93cyB3aGVuIGFjY2Vzc2luZyBhY3RpdmUgZ3JvdXAnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZXh0SG9zdEVkaXRvclRhYnMgPSBuZXcgRXh0SG9zdEVkaXRvclRhYnMoXG5cdFx0XHRTaW5nbGVQcm94eVJQQ1Byb3RvY29sKG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZEVkaXRvclRhYnNTaGFwZT4oKSB7XG5cdFx0XHRcdC8vIG92ZXJyaWRlL2ltcGxlbWVudCAkbW92ZVRhYiBvciAkY2xvc2VUYWJcblx0XHRcdH0pXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWxsLmxlbmd0aCwgMCk7XG5cdFx0Ly8gQWN0aXZlIGdyb3VwIHNob3VsZCBuZXZlciBiZSB1bmRlZmluZWQgKHRoZXJlIGlzIGFsd2F5cyBhbiBhY3RpdmUgZ3JvdXApLiBFbnN1cmUgYWNjZXNzaW5nIGl0IHVuZGVmaW5lZCB0aHJvd3MuXG5cdFx0Ly8gVE9ETyBAbHJhbW9zMTUgQWRkIGEgdGhyb3cgb24gdGhlIG1haW4gc2lkZSB3aGVuIGEgbW9kZWwgaXMgc2VudCB3aXRob3V0IGFuIGFjdGl2ZSBncm91cFxuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFjdGl2ZVRhYkdyb3VwKTtcblx0fSk7XG5cblx0dGVzdCgnc2luZ2xlIHRhYicsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IGV4dEhvc3RFZGl0b3JUYWJzID0gbmV3IEV4dEhvc3RFZGl0b3JUYWJzKFxuXHRcdFx0U2luZ2xlUHJveHlSUENQcm90b2NvbChuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRFZGl0b3JUYWJzU2hhcGU+KCkge1xuXHRcdFx0XHQvLyBvdmVycmlkZS9pbXBsZW1lbnQgJG1vdmVUYWIgb3IgJGNsb3NlVGFiXG5cdFx0XHR9KVxuXHRcdCk7XG5cblx0XHRjb25zdCB0YWI6IElFZGl0b3JUYWJEdG8gPSBjcmVhdGVUYWJEdG8oe1xuXHRcdFx0aWQ6ICd1bmlxdWVzdHJpbmcnLFxuXHRcdFx0aXNBY3RpdmU6IHRydWUsXG5cdFx0XHRpc0RpcnR5OiB0cnVlLFxuXHRcdFx0aXNQaW5uZWQ6IHRydWUsXG5cdFx0XHRsYWJlbDogJ2xhYmVsMScsXG5cdFx0fSk7XG5cblx0XHRleHRIb3N0RWRpdG9yVGFicy4kYWNjZXB0RWRpdG9yVGFiTW9kZWwoW3tcblx0XHRcdGlzQWN0aXZlOiB0cnVlLFxuXHRcdFx0dmlld0NvbHVtbjogMCxcblx0XHRcdGdyb3VwSWQ6IDEyLFxuXHRcdFx0dGFiczogW3RhYl1cblx0XHR9XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGwubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBbZmlyc3RdID0gZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbDtcblx0XHRhc3NlcnQub2soZmlyc3QuYWN0aXZlVGFiKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QudGFicy5pbmRleE9mKGZpcnN0LmFjdGl2ZVRhYiksIDApO1xuXG5cdFx0e1xuXHRcdFx0ZXh0SG9zdEVkaXRvclRhYnMuJGFjY2VwdEVkaXRvclRhYk1vZGVsKFt7XG5cdFx0XHRcdGlzQWN0aXZlOiB0cnVlLFxuXHRcdFx0XHR2aWV3Q29sdW1uOiAwLFxuXHRcdFx0XHRncm91cElkOiAxMixcblx0XHRcdFx0dGFiczogW3RhYl1cblx0XHRcdH1dKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWxsLmxlbmd0aCwgMSk7XG5cdFx0XHRjb25zdCBbZmlyc3RdID0gZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbDtcblx0XHRcdGFzc2VydC5vayhmaXJzdC5hY3RpdmVUYWIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnRhYnMuaW5kZXhPZihmaXJzdC5hY3RpdmVUYWIpLCAwKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ0VtcHR5IHRhYiBncm91cCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBleHRIb3N0RWRpdG9yVGFicyA9IG5ldyBFeHRIb3N0RWRpdG9yVGFicyhcblx0XHRcdFNpbmdsZVByb3h5UlBDUHJvdG9jb2wobmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkRWRpdG9yVGFic1NoYXBlPigpIHtcblx0XHRcdFx0Ly8gb3ZlcnJpZGUvaW1wbGVtZW50ICRtb3ZlVGFiIG9yICRjbG9zZVRhYlxuXHRcdFx0fSlcblx0XHQpO1xuXG5cdFx0ZXh0SG9zdEVkaXRvclRhYnMuJGFjY2VwdEVkaXRvclRhYk1vZGVsKFt7XG5cdFx0XHRpc0FjdGl2ZTogdHJ1ZSxcblx0XHRcdHZpZXdDb2x1bW46IDAsXG5cdFx0XHRncm91cElkOiAxMixcblx0XHRcdHRhYnM6IFtdXG5cdFx0fV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWxsLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgW2ZpcnN0XSA9IGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGw7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LmFjdGl2ZVRhYiwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QudGFicy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdFbnN1cmUgdGFiR3JvdXAgY2hhbmdlIGV2ZW50cyBmaXJlcycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBleHRIb3N0RWRpdG9yVGFicyA9IG5ldyBFeHRIb3N0RWRpdG9yVGFicyhcblx0XHRcdFNpbmdsZVByb3h5UlBDUHJvdG9jb2wobmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkRWRpdG9yVGFic1NoYXBlPigpIHtcblx0XHRcdFx0Ly8gb3ZlcnJpZGUvaW1wbGVtZW50ICRtb3ZlVGFiIG9yICRjbG9zZVRhYlxuXHRcdFx0fSlcblx0XHQpO1xuXG5cdFx0bGV0IGNvdW50ID0gMDtcblx0XHRzdG9yZS5hZGQoZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLm9uRGlkQ2hhbmdlVGFiR3JvdXBzKCgpID0+IGNvdW50KyspKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudCwgMCk7XG5cblx0XHRleHRIb3N0RWRpdG9yVGFicy4kYWNjZXB0RWRpdG9yVGFiTW9kZWwoW3tcblx0XHRcdGlzQWN0aXZlOiB0cnVlLFxuXHRcdFx0dmlld0NvbHVtbjogMCxcblx0XHRcdGdyb3VwSWQ6IDEyLFxuXHRcdFx0dGFiczogW11cblx0XHR9XSk7XG5cdFx0YXNzZXJ0Lm9rKGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hY3RpdmVUYWJHcm91cCk7XG5cdFx0Y29uc3QgYWN0aXZlVGFiR3JvdXA6IHZzY29kZS5UYWJHcm91cCA9IGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hY3RpdmVUYWJHcm91cDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3RpdmVUYWJHcm91cC50YWJzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50LCAxKTtcblx0fSk7XG5cblx0dGVzdCgnQ2hlY2sgVGFiR3JvdXBDaGFuZ2VFdmVudCBwcm9wZXJ0aWVzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGV4dEhvc3RFZGl0b3JUYWJzID0gbmV3IEV4dEhvc3RFZGl0b3JUYWJzKFxuXHRcdFx0U2luZ2xlUHJveHlSUENQcm90b2NvbChuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRFZGl0b3JUYWJzU2hhcGU+KCkge1xuXHRcdFx0XHQvLyBvdmVycmlkZS9pbXBsZW1lbnQgJG1vdmVUYWIgb3IgJGNsb3NlVGFiXG5cdFx0XHR9KVxuXHRcdCk7XG5cblx0XHRjb25zdCBncm91cDFEYXRhOiBJRWRpdG9yVGFiR3JvdXBEdG8gPSB7XG5cdFx0XHRpc0FjdGl2ZTogdHJ1ZSxcblx0XHRcdHZpZXdDb2x1bW46IDAsXG5cdFx0XHRncm91cElkOiAxMixcblx0XHRcdHRhYnM6IFtdXG5cdFx0fTtcblx0XHRjb25zdCBncm91cDJEYXRhOiBJRWRpdG9yVGFiR3JvdXBEdG8gPSB7IC4uLmdyb3VwMURhdGEsIGdyb3VwSWQ6IDEzIH07XG5cblx0XHRjb25zdCBldmVudHM6IHZzY29kZS5UYWJHcm91cENoYW5nZUV2ZW50W10gPSBbXTtcblx0XHRzdG9yZS5hZGQoZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLm9uRGlkQ2hhbmdlVGFiR3JvdXBzKGUgPT4gZXZlbnRzLnB1c2goZSkpKTtcblx0XHQvLyBPUEVOXG5cdFx0ZXh0SG9zdEVkaXRvclRhYnMuJGFjY2VwdEVkaXRvclRhYk1vZGVsKFtncm91cDFEYXRhXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudHMsIFt7XG5cdFx0XHRjaGFuZ2VkOiBbXSxcblx0XHRcdGNsb3NlZDogW10sXG5cdFx0XHRvcGVuZWQ6IFtleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWN0aXZlVGFiR3JvdXBdXG5cdFx0fV0pO1xuXG5cdFx0Ly8gT1BFTiwgQ0hBTkdFXG5cdFx0ZXZlbnRzLmxlbmd0aCA9IDA7XG5cdFx0ZXh0SG9zdEVkaXRvclRhYnMuJGFjY2VwdEVkaXRvclRhYk1vZGVsKFt7IC4uLmdyb3VwMURhdGEsIGlzQWN0aXZlOiBmYWxzZSB9LCBncm91cDJEYXRhXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudHMsIFt7XG5cdFx0XHRjaGFuZ2VkOiBbZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbFswXV0sXG5cdFx0XHRjbG9zZWQ6IFtdLFxuXHRcdFx0b3BlbmVkOiBbZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbFsxXV1cblx0XHR9XSk7XG5cblx0XHQvLyBDSEFOR0Vcblx0XHRldmVudHMubGVuZ3RoID0gMDtcblx0XHRleHRIb3N0RWRpdG9yVGFicy4kYWNjZXB0RWRpdG9yVGFiTW9kZWwoW2dyb3VwMURhdGEsIHsgLi4uZ3JvdXAyRGF0YSwgaXNBY3RpdmU6IGZhbHNlIH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50cywgW3tcblx0XHRcdGNoYW5nZWQ6IGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGwsXG5cdFx0XHRjbG9zZWQ6IFtdLFxuXHRcdFx0b3BlbmVkOiBbXVxuXHRcdH1dKTtcblxuXHRcdC8vIENMT1NFLCBDSEFOR0Vcblx0XHRldmVudHMubGVuZ3RoID0gMDtcblx0XHRjb25zdCBvbGRBY3RpdmVHcm91cCA9IGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hY3RpdmVUYWJHcm91cDtcblx0XHRleHRIb3N0RWRpdG9yVGFicy4kYWNjZXB0RWRpdG9yVGFiTW9kZWwoW2dyb3VwMkRhdGFdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50cywgW3tcblx0XHRcdGNoYW5nZWQ6IGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGwsXG5cdFx0XHRjbG9zZWQ6IFtvbGRBY3RpdmVHcm91cF0sXG5cdFx0XHRvcGVuZWQ6IFtdXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFbnN1cmUgcmVmZXJlbmNlIGVxdWFsaXR5IGZvciBhY3RpdmVUYWIgYW5kIGFjdGl2ZUdyb3VwJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGV4dEhvc3RFZGl0b3JUYWJzID0gbmV3IEV4dEhvc3RFZGl0b3JUYWJzKFxuXHRcdFx0U2luZ2xlUHJveHlSUENQcm90b2NvbChuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRFZGl0b3JUYWJzU2hhcGU+KCkge1xuXHRcdFx0XHQvLyBvdmVycmlkZS9pbXBsZW1lbnQgJG1vdmVUYWIgb3IgJGNsb3NlVGFiXG5cdFx0XHR9KVxuXHRcdCk7XG5cdFx0Y29uc3QgdGFiID0gY3JlYXRlVGFiRHRvKHtcblx0XHRcdGlkOiAndW5pcXVlc3RyaW5nJyxcblx0XHRcdGlzQWN0aXZlOiB0cnVlLFxuXHRcdFx0aXNEaXJ0eTogdHJ1ZSxcblx0XHRcdGlzUGlubmVkOiB0cnVlLFxuXHRcdFx0bGFiZWw6ICdsYWJlbDEnLFxuXHRcdFx0ZWRpdG9ySWQ6ICdkZWZhdWx0Jyxcblx0XHR9KTtcblxuXHRcdGV4dEhvc3RFZGl0b3JUYWJzLiRhY2NlcHRFZGl0b3JUYWJNb2RlbChbe1xuXHRcdFx0aXNBY3RpdmU6IHRydWUsXG5cdFx0XHR2aWV3Q29sdW1uOiAwLFxuXHRcdFx0Z3JvdXBJZDogMTIsXG5cdFx0XHR0YWJzOiBbdGFiXVxuXHRcdH1dKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbC5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IFtmaXJzdF0gPSBleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWxsO1xuXHRcdGFzc2VydC5vayhmaXJzdC5hY3RpdmVUYWIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC50YWJzLmluZGV4T2YoZmlyc3QuYWN0aXZlVGFiKSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LmFjdGl2ZVRhYiwgZmlyc3QudGFic1swXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hY3RpdmVUYWJHcm91cCwgZmlyc3QpO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXh0TWVyZ2VUYWJJbnB1dCBzdXJmYWNlcyBpbiB0aGUgVUknLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBleHRIb3N0RWRpdG9yVGFicyA9IG5ldyBFeHRIb3N0RWRpdG9yVGFicyhcblx0XHRcdFNpbmdsZVByb3h5UlBDUHJvdG9jb2wobmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkRWRpdG9yVGFic1NoYXBlPigpIHtcblx0XHRcdFx0Ly8gb3ZlcnJpZGUvaW1wbGVtZW50ICRtb3ZlVGFiIG9yICRjbG9zZVRhYlxuXHRcdFx0fSlcblx0XHQpO1xuXG5cdFx0Y29uc3QgdGFiOiBJRWRpdG9yVGFiRHRvID0gY3JlYXRlVGFiRHRvKHtcblx0XHRcdGlucHV0OiB7XG5cdFx0XHRcdGtpbmQ6IFRhYklucHV0S2luZC5UZXh0TWVyZ2VJbnB1dCxcblx0XHRcdFx0YmFzZTogVVJJLmZyb20oeyBzY2hlbWU6ICd0ZXN0JywgcGF0aDogJ2Jhc2UnIH0pLFxuXHRcdFx0XHRpbnB1dDE6IFVSSS5mcm9tKHsgc2NoZW1lOiAndGVzdCcsIHBhdGg6ICdpbnB1dDEnIH0pLFxuXHRcdFx0XHRpbnB1dDI6IFVSSS5mcm9tKHsgc2NoZW1lOiAndGVzdCcsIHBhdGg6ICdpbnB1dDInIH0pLFxuXHRcdFx0XHRyZXN1bHQ6IFVSSS5mcm9tKHsgc2NoZW1lOiAndGVzdCcsIHBhdGg6ICdyZXN1bHQnIH0pLFxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0ZXh0SG9zdEVkaXRvclRhYnMuJGFjY2VwdEVkaXRvclRhYk1vZGVsKFt7XG5cdFx0XHRpc0FjdGl2ZTogdHJ1ZSxcblx0XHRcdHZpZXdDb2x1bW46IDAsXG5cdFx0XHRncm91cElkOiAxMixcblx0XHRcdHRhYnM6IFt0YWJdXG5cdFx0fV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWxsLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgW2ZpcnN0XSA9IGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGw7XG5cdFx0YXNzZXJ0Lm9rKGZpcnN0LmFjdGl2ZVRhYik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnRhYnMuaW5kZXhPZihmaXJzdC5hY3RpdmVUYWIpLCAwKTtcblx0XHRhc3NlcnQub2soZmlyc3QuYWN0aXZlVGFiLmlucHV0IGluc3RhbmNlb2YgVGV4dE1lcmdlVGFiSW5wdXQpO1xuXHR9KTtcblxuXHR0ZXN0KCdFbnN1cmUgcmVmZXJlbmNlIHN0YWJpbGl0eScsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IGV4dEhvc3RFZGl0b3JUYWJzID0gbmV3IEV4dEhvc3RFZGl0b3JUYWJzKFxuXHRcdFx0U2luZ2xlUHJveHlSUENQcm90b2NvbChuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRFZGl0b3JUYWJzU2hhcGU+KCkge1xuXHRcdFx0XHQvLyBvdmVycmlkZS9pbXBsZW1lbnQgJG1vdmVUYWIgb3IgJGNsb3NlVGFiXG5cdFx0XHR9KVxuXHRcdCk7XG5cdFx0Y29uc3QgdGFiRHRvID0gY3JlYXRlVGFiRHRvKCk7XG5cblx0XHQvLyBzaW5nbGUgZGlydHkgdGFiXG5cblx0XHRleHRIb3N0RWRpdG9yVGFicy4kYWNjZXB0RWRpdG9yVGFiTW9kZWwoW3tcblx0XHRcdGlzQWN0aXZlOiB0cnVlLFxuXHRcdFx0dmlld0NvbHVtbjogMCxcblx0XHRcdGdyb3VwSWQ6IDEyLFxuXHRcdFx0dGFiczogW3RhYkR0b11cblx0XHR9XSk7XG5cdFx0bGV0IGFsbCA9IGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGwubWFwKGdyb3VwID0+IGdyb3VwLnRhYnMpLmZsYXQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWxsLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgYXBpVGFiMSA9IGFsbFswXTtcblx0XHRhc3NlcnQub2soYXBpVGFiMS5pbnB1dCBpbnN0YW5jZW9mIFRleHRUYWJJbnB1dCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhYkR0by5pbnB1dC5raW5kLCBUYWJJbnB1dEtpbmQuVGV4dElucHV0KTtcblx0XHRjb25zdCBkdG9SZXNvdXJjZSA9ICh0YWJEdG8uaW5wdXQgYXMgVGV4dElucHV0RHRvKS51cmk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwaVRhYjEuaW5wdXQudXJpLnRvU3RyaW5nKCksIFVSSS5yZXZpdmUoZHRvUmVzb3VyY2UpLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcGlUYWIxLmlzRGlydHksIHRydWUpO1xuXG5cblx0XHQvLyBOT1QgRElSVFkgYW55bW9yZVxuXG5cdFx0Y29uc3QgdGFiRHRvMjogSUVkaXRvclRhYkR0byA9IHsgLi4udGFiRHRvLCBpc0RpcnR5OiBmYWxzZSB9O1xuXHRcdC8vIEFjY2VwdCBhIHNpbXBsZSB1cGRhdGVcblx0XHRleHRIb3N0RWRpdG9yVGFicy4kYWNjZXB0VGFiT3BlcmF0aW9uKHtcblx0XHRcdGtpbmQ6IFRhYk1vZGVsT3BlcmF0aW9uS2luZC5UQUJfVVBEQVRFLFxuXHRcdFx0aW5kZXg6IDAsXG5cdFx0XHR0YWJEdG86IHRhYkR0bzIsXG5cdFx0XHRncm91cElkOiAxMlxuXHRcdH0pO1xuXG5cdFx0YWxsID0gZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbC5tYXAoZ3JvdXAgPT4gZ3JvdXAudGFicykuZmxhdCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhbGwubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBhcGlUYWIyID0gYWxsWzBdO1xuXHRcdGFzc2VydC5vayhhcGlUYWIxLmlucHV0IGluc3RhbmNlb2YgVGV4dFRhYklucHV0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBpVGFiMS5pbnB1dC51cmkudG9TdHJpbmcoKSwgVVJJLnJldml2ZShkdG9SZXNvdXJjZSkudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwaVRhYjIuaXNEaXJ0eSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwaVRhYjEgPT09IGFwaVRhYjIsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdUYWIuaXNBY3RpdmUgd29ya2luZycsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IGV4dEhvc3RFZGl0b3JUYWJzID0gbmV3IEV4dEhvc3RFZGl0b3JUYWJzKFxuXHRcdFx0U2luZ2xlUHJveHlSUENQcm90b2NvbChuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRFZGl0b3JUYWJzU2hhcGU+KCkge1xuXHRcdFx0XHQvLyBvdmVycmlkZS9pbXBsZW1lbnQgJG1vdmVUYWIgb3IgJGNsb3NlVGFiXG5cdFx0XHR9KVxuXHRcdCk7XG5cdFx0Y29uc3QgdGFiRHRvQUFBID0gY3JlYXRlVGFiRHRvKHtcblx0XHRcdGlkOiAnQUFBJyxcblx0XHRcdGlzQWN0aXZlOiB0cnVlLFxuXHRcdFx0aXNEaXJ0eTogdHJ1ZSxcblx0XHRcdGlzUGlubmVkOiB0cnVlLFxuXHRcdFx0bGFiZWw6ICdsYWJlbDEnLFxuXHRcdFx0aW5wdXQ6IHsga2luZDogVGFiSW5wdXRLaW5kLlRleHRJbnB1dCwgdXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly9hYmMvQUFBLnR4dCcpIH0sXG5cdFx0XHRlZGl0b3JJZDogJ2RlZmF1bHQnXG5cdFx0fSk7XG5cblx0XHRjb25zdCB0YWJEdG9CQkIgPSBjcmVhdGVUYWJEdG8oe1xuXHRcdFx0aWQ6ICdCQkInLFxuXHRcdFx0aXNBY3RpdmU6IGZhbHNlLFxuXHRcdFx0aXNEaXJ0eTogdHJ1ZSxcblx0XHRcdGlzUGlubmVkOiB0cnVlLFxuXHRcdFx0bGFiZWw6ICdsYWJlbDEnLFxuXHRcdFx0aW5wdXQ6IHsga2luZDogVGFiSW5wdXRLaW5kLlRleHRJbnB1dCwgdXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly9hYmMvQkJCLnR4dCcpIH0sXG5cdFx0XHRlZGl0b3JJZDogJ2RlZmF1bHQnXG5cdFx0fSk7XG5cblx0XHQvLyBzaW5nbGUgZGlydHkgdGFiXG5cblx0XHRleHRIb3N0RWRpdG9yVGFicy4kYWNjZXB0RWRpdG9yVGFiTW9kZWwoW3tcblx0XHRcdGlzQWN0aXZlOiB0cnVlLFxuXHRcdFx0dmlld0NvbHVtbjogMCxcblx0XHRcdGdyb3VwSWQ6IDEyLFxuXHRcdFx0dGFiczogW3RhYkR0b0FBQSwgdGFiRHRvQkJCXVxuXHRcdH1dKTtcblxuXHRcdGNvbnN0IGFsbCA9IGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGwubWFwKGdyb3VwID0+IGdyb3VwLnRhYnMpLmZsYXQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWxsLmxlbmd0aCwgMik7XG5cblx0XHRjb25zdCBhY3RpdmVUYWIxID0gZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFjdGl2ZVRhYkdyb3VwPy5hY3RpdmVUYWI7XG5cdFx0YXNzZXJ0Lm9rKGFjdGl2ZVRhYjE/LmlucHV0IGluc3RhbmNlb2YgVGV4dFRhYklucHV0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFiRHRvQUFBLmlucHV0LmtpbmQsIFRhYklucHV0S2luZC5UZXh0SW5wdXQpO1xuXHRcdGNvbnN0IGR0b0FBQVJlc291cmNlID0gKHRhYkR0b0FBQS5pbnB1dCBhcyBUZXh0SW5wdXREdG8pLnVyaTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZlVGFiMT8uaW5wdXQ/LnVyaS50b1N0cmluZygpLCBVUkkucmV2aXZlKGR0b0FBQVJlc291cmNlKT8udG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGl2ZVRhYjE/LmlzQWN0aXZlLCB0cnVlKTtcblxuXHRcdGV4dEhvc3RFZGl0b3JUYWJzLiRhY2NlcHRUYWJPcGVyYXRpb24oe1xuXHRcdFx0Z3JvdXBJZDogMTIsXG5cdFx0XHRpbmRleDogMSxcblx0XHRcdGtpbmQ6IFRhYk1vZGVsT3BlcmF0aW9uS2luZC5UQUJfVVBEQVRFLFxuXHRcdFx0dGFiRHRvOiB7IC4uLnRhYkR0b0JCQiwgaXNBY3RpdmU6IHRydWUgfSAvLy8gQkJCIGlzIG5vdyBhY3RpdmVcblx0XHR9KTtcblxuXHRcdGNvbnN0IGFjdGl2ZVRhYjIgPSBleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWN0aXZlVGFiR3JvdXA/LmFjdGl2ZVRhYjtcblx0XHRhc3NlcnQub2soYWN0aXZlVGFiMj8uaW5wdXQgaW5zdGFuY2VvZiBUZXh0VGFiSW5wdXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YWJEdG9CQkIuaW5wdXQua2luZCwgVGFiSW5wdXRLaW5kLlRleHRJbnB1dCk7XG5cdFx0Y29uc3QgZHRvQkJCUmVzb3VyY2UgPSAodGFiRHRvQkJCLmlucHV0IGFzIFRleHRJbnB1dER0bykudXJpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3RpdmVUYWIyPy5pbnB1dD8udXJpLnRvU3RyaW5nKCksIFVSSS5yZXZpdmUoZHRvQkJCUmVzb3VyY2UpPy50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZlVGFiMj8uaXNBY3RpdmUsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3RpdmVUYWIxPy5pc0FjdGl2ZSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCd2c2NvZGUud2luZG93LnRhZ0dyb3VwcyBpcyBpbW11dGFibGUnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBleHRIb3N0RWRpdG9yVGFicyA9IG5ldyBFeHRIb3N0RWRpdG9yVGFicyhcblx0XHRcdFNpbmdsZVByb3h5UlBDUHJvdG9jb2wobmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkRWRpdG9yVGFic1NoYXBlPigpIHtcblx0XHRcdFx0Ly8gb3ZlcnJpZGUvaW1wbGVtZW50ICRtb3ZlVGFiIG9yICRjbG9zZVRhYlxuXHRcdFx0fSlcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHQvLyBAdHMtZXhwZWN0LWVycm9yIHdyaXRlIHRvIHJlYWRvbmx5IHByb3Bcblx0XHRcdGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hY3RpdmVUYWJHcm91cCA9IHVuZGVmaW5lZDtcblx0XHR9KTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHtcblx0XHRcdC8vIEB0cy1leHBlY3QtZXJyb3Igd3JpdGUgdG8gcmVhZG9ubHkgcHJvcFxuXHRcdFx0ZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbC5sZW5ndGggPSAwO1xuXHRcdH0pO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4ge1xuXHRcdFx0Ly8gQHRzLWV4cGVjdC1lcnJvciB3cml0ZSB0byByZWFkb25seSBwcm9wXG5cdFx0XHRleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMub25EaWRDaGFuZ2VBY3RpdmVUYWJHcm91cCA9IHVuZGVmaW5lZDtcblx0XHR9KTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHtcblx0XHRcdC8vIEB0cy1leHBlY3QtZXJyb3Igd3JpdGUgdG8gcmVhZG9ubHkgcHJvcFxuXHRcdFx0ZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLm9uRGlkQ2hhbmdlVGFiR3JvdXBzID0gdW5kZWZpbmVkO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFbnN1cmUgY2xvc2UgaXMgY2FsbGVkIHdpdGggYWxsIHRhYiBpZHMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgY2xvc2VkVGFiSWRzOiBzdHJpbmdbXVtdID0gW107XG5cdFx0Y29uc3QgZXh0SG9zdEVkaXRvclRhYnMgPSBuZXcgRXh0SG9zdEVkaXRvclRhYnMoXG5cdFx0XHRTaW5nbGVQcm94eVJQQ1Byb3RvY29sKG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZEVkaXRvclRhYnNTaGFwZT4oKSB7XG5cdFx0XHRcdC8vIG92ZXJyaWRlL2ltcGxlbWVudCAkbW92ZVRhYiBvciAkY2xvc2VUYWJcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgJGNsb3NlVGFiKHRhYklkczogc3RyaW5nW10sIHByZXNlcnZlRm9jdXM/OiBib29sZWFuKSB7XG5cdFx0XHRcdFx0Y2xvc2VkVGFiSWRzLnB1c2godGFiSWRzKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSlcblx0XHQpO1xuXHRcdGNvbnN0IHRhYjogSUVkaXRvclRhYkR0byA9IGNyZWF0ZVRhYkR0byh7XG5cdFx0XHRpZDogJ3VuaXF1ZXN0cmluZycsXG5cdFx0XHRpc0FjdGl2ZTogdHJ1ZSxcblx0XHRcdGlzRGlydHk6IHRydWUsXG5cdFx0XHRpc1Bpbm5lZDogdHJ1ZSxcblx0XHRcdGxhYmVsOiAnbGFiZWwxJyxcblx0XHRcdGVkaXRvcklkOiAnZGVmYXVsdCdcblx0XHR9KTtcblxuXHRcdGV4dEhvc3RFZGl0b3JUYWJzLiRhY2NlcHRFZGl0b3JUYWJNb2RlbChbe1xuXHRcdFx0aXNBY3RpdmU6IHRydWUsXG5cdFx0XHR2aWV3Q29sdW1uOiAwLFxuXHRcdFx0Z3JvdXBJZDogMTIsXG5cdFx0XHR0YWJzOiBbdGFiXVxuXHRcdH1dKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbC5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IGFjdGl2ZVRhYiA9IGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hY3RpdmVUYWJHcm91cD8uYWN0aXZlVGFiO1xuXHRcdGFzc2VydC5vayhhY3RpdmVUYWIpO1xuXHRcdGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5jbG9zZShhY3RpdmVUYWIsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xvc2VkVGFiSWRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjbG9zZWRUYWJJZHNbMF0sIFsndW5pcXVlc3RyaW5nJ10pO1xuXHRcdC8vIENsb3NlIHdpdGggYXJyYXlcblx0XHRleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuY2xvc2UoW2FjdGl2ZVRhYl0sIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xvc2VkVGFiSWRzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjbG9zZWRUYWJJZHNbMV0sIFsndW5pcXVlc3RyaW5nJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdVcGRhdGUgdGFiIG9ubHkgc2VuZHMgdGFiIGNoYW5nZSBldmVudCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBjbG9zZWRUYWJJZHM6IHN0cmluZ1tdW10gPSBbXTtcblx0XHRjb25zdCBleHRIb3N0RWRpdG9yVGFicyA9IG5ldyBFeHRIb3N0RWRpdG9yVGFicyhcblx0XHRcdFNpbmdsZVByb3h5UlBDUHJvdG9jb2wobmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkRWRpdG9yVGFic1NoYXBlPigpIHtcblx0XHRcdFx0Ly8gb3ZlcnJpZGUvaW1wbGVtZW50ICRtb3ZlVGFiIG9yICRjbG9zZVRhYlxuXHRcdFx0XHRvdmVycmlkZSBhc3luYyAkY2xvc2VUYWIodGFiSWRzOiBzdHJpbmdbXSwgcHJlc2VydmVGb2N1cz86IGJvb2xlYW4pIHtcblx0XHRcdFx0XHRjbG9zZWRUYWJJZHMucHVzaCh0YWJJZHMpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9KVxuXHRcdCk7XG5cdFx0Y29uc3QgdGFiRHRvOiBJRWRpdG9yVGFiRHRvID0gY3JlYXRlVGFiRHRvKHtcblx0XHRcdGlkOiAndW5pcXVlc3RyaW5nJyxcblx0XHRcdGlzQWN0aXZlOiB0cnVlLFxuXHRcdFx0aXNEaXJ0eTogdHJ1ZSxcblx0XHRcdGlzUGlubmVkOiB0cnVlLFxuXHRcdFx0bGFiZWw6ICdsYWJlbDEnLFxuXHRcdFx0ZWRpdG9ySWQ6ICdkZWZhdWx0J1xuXHRcdH0pO1xuXG5cdFx0ZXh0SG9zdEVkaXRvclRhYnMuJGFjY2VwdEVkaXRvclRhYk1vZGVsKFt7XG5cdFx0XHRpc0FjdGl2ZTogdHJ1ZSxcblx0XHRcdHZpZXdDb2x1bW46IDAsXG5cdFx0XHRncm91cElkOiAxMixcblx0XHRcdHRhYnM6IFt0YWJEdG9dXG5cdFx0fV0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGwubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbC5tYXAoZyA9PiBnLnRhYnMpLmZsYXQoKS5sZW5ndGgsIDEpO1xuXG5cdFx0Y29uc3QgdGFiID0gZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbFswXS50YWJzWzBdO1xuXG5cblx0XHRjb25zdCBwID0gbmV3IFByb21pc2U8dnNjb2RlLlRhYkNoYW5nZUV2ZW50PihyZXNvbHZlID0+IHN0b3JlLmFkZChleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMub25EaWRDaGFuZ2VUYWJzKHJlc29sdmUpKSk7XG5cblx0XHRleHRIb3N0RWRpdG9yVGFicy4kYWNjZXB0VGFiT3BlcmF0aW9uKHtcblx0XHRcdGdyb3VwSWQ6IDEyLFxuXHRcdFx0aW5kZXg6IDAsXG5cdFx0XHRraW5kOiBUYWJNb2RlbE9wZXJhdGlvbktpbmQuVEFCX1VQREFURSxcblx0XHRcdHRhYkR0bzogeyAuLi50YWJEdG8sIGxhYmVsOiAnTkVXIExBQkVMJyB9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBjaGFuZ2VkVGFiID0gKGF3YWl0IHApLmNoYW5nZWRbMF07XG5cblx0XHRhc3NlcnQub2sodGFiID09PSBjaGFuZ2VkVGFiKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlZFRhYi5sYWJlbCwgJ05FVyBMQUJFTCcpO1xuXG5cdH0pO1xuXG5cdHRlc3QoJ0FjdGl2ZSB0YWInLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBleHRIb3N0RWRpdG9yVGFicyA9IG5ldyBFeHRIb3N0RWRpdG9yVGFicyhcblx0XHRcdFNpbmdsZVByb3h5UlBDUHJvdG9jb2wobmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkRWRpdG9yVGFic1NoYXBlPigpIHtcblx0XHRcdFx0Ly8gb3ZlcnJpZGUvaW1wbGVtZW50ICRtb3ZlVGFiIG9yICRjbG9zZVRhYlxuXHRcdFx0fSlcblx0XHQpO1xuXG5cdFx0Y29uc3QgdGFiMTogSUVkaXRvclRhYkR0byA9IGNyZWF0ZVRhYkR0byh7XG5cdFx0XHRpZDogJ3VuaXF1ZXN0cmluZycsXG5cdFx0XHRpc0FjdGl2ZTogdHJ1ZSxcblx0XHRcdGlzRGlydHk6IHRydWUsXG5cdFx0XHRpc1Bpbm5lZDogdHJ1ZSxcblx0XHRcdGxhYmVsOiAnbGFiZWwxJyxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRhYjI6IElFZGl0b3JUYWJEdG8gPSBjcmVhdGVUYWJEdG8oe1xuXHRcdFx0aXNBY3RpdmU6IGZhbHNlLFxuXHRcdFx0aWQ6ICd1bmlxdWVzdHJpbmcyJyxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRhYjM6IElFZGl0b3JUYWJEdG8gPSBjcmVhdGVUYWJEdG8oe1xuXHRcdFx0aXNBY3RpdmU6IGZhbHNlLFxuXHRcdFx0aWQ6ICd1bmlxdWVzdHJpbmczJyxcblx0XHR9KTtcblxuXHRcdGV4dEhvc3RFZGl0b3JUYWJzLiRhY2NlcHRFZGl0b3JUYWJNb2RlbChbe1xuXHRcdFx0aXNBY3RpdmU6IHRydWUsXG5cdFx0XHR2aWV3Q29sdW1uOiAwLFxuXHRcdFx0Z3JvdXBJZDogMTIsXG5cdFx0XHR0YWJzOiBbdGFiMSwgdGFiMiwgdGFiM11cblx0XHR9XSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWxsLm1hcChnID0+IGcudGFicykuZmxhdCgpLmxlbmd0aCwgMyk7XG5cblx0XHQvLyBBY3RpdmUgdGFiIGlzIGNvcnJlY3Rcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFjdGl2ZVRhYkdyb3VwPy5hY3RpdmVUYWIsIGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hY3RpdmVUYWJHcm91cD8udGFic1swXSk7XG5cblx0XHQvLyBTd2l0Y2hpbmcgYWN0aXZlIHRhYiB3b3Jrc1xuXHRcdHRhYjEuaXNBY3RpdmUgPSBmYWxzZTtcblx0XHR0YWIyLmlzQWN0aXZlID0gdHJ1ZTtcblx0XHRleHRIb3N0RWRpdG9yVGFicy4kYWNjZXB0VGFiT3BlcmF0aW9uKHtcblx0XHRcdGdyb3VwSWQ6IDEyLFxuXHRcdFx0aW5kZXg6IDAsXG5cdFx0XHRraW5kOiBUYWJNb2RlbE9wZXJhdGlvbktpbmQuVEFCX1VQREFURSxcblx0XHRcdHRhYkR0bzogdGFiMVxuXHRcdH0pO1xuXHRcdGV4dEhvc3RFZGl0b3JUYWJzLiRhY2NlcHRUYWJPcGVyYXRpb24oe1xuXHRcdFx0Z3JvdXBJZDogMTIsXG5cdFx0XHRpbmRleDogMSxcblx0XHRcdGtpbmQ6IFRhYk1vZGVsT3BlcmF0aW9uS2luZC5UQUJfVVBEQVRFLFxuXHRcdFx0dGFiRHRvOiB0YWIyXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hY3RpdmVUYWJHcm91cD8uYWN0aXZlVGFiLCBleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWN0aXZlVGFiR3JvdXA/LnRhYnNbMV0pO1xuXG5cdFx0Ly9DbG9zaW5nIHRhYnMgb3V0IHdvcmtzXG5cdFx0dGFiMy5pc0FjdGl2ZSA9IHRydWU7XG5cdFx0ZXh0SG9zdEVkaXRvclRhYnMuJGFjY2VwdEVkaXRvclRhYk1vZGVsKFt7XG5cdFx0XHRpc0FjdGl2ZTogdHJ1ZSxcblx0XHRcdHZpZXdDb2x1bW46IDAsXG5cdFx0XHRncm91cElkOiAxMixcblx0XHRcdHRhYnM6IFt0YWIzXVxuXHRcdH1dKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWxsLm1hcChnID0+IGcudGFicykuZmxhdCgpLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hY3RpdmVUYWJHcm91cD8uYWN0aXZlVGFiLCBleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWN0aXZlVGFiR3JvdXA/LnRhYnNbMF0pO1xuXG5cdFx0Ly8gQ2xvc2luZyBvdXQgYWxsIHRhYnMgcmV0dXJucyB1bmRlZmluZSBhY3RpdmUgdGFiXG5cdFx0ZXh0SG9zdEVkaXRvclRhYnMuJGFjY2VwdEVkaXRvclRhYk1vZGVsKFt7XG5cdFx0XHRpc0FjdGl2ZTogdHJ1ZSxcblx0XHRcdHZpZXdDb2x1bW46IDAsXG5cdFx0XHRncm91cElkOiAxMixcblx0XHRcdHRhYnM6IFtdXG5cdFx0fV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWxsLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGwubWFwKGcgPT4gZy50YWJzKS5mbGF0KCkubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFjdGl2ZVRhYkdyb3VwPy5hY3RpdmVUYWIsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1RhYiBvcGVyYXRpb25zIHBhdGNoZXMgb3BlbiBhbmQgY2xvc2UgY29ycmVjdGx5JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGV4dEhvc3RFZGl0b3JUYWJzID0gbmV3IEV4dEhvc3RFZGl0b3JUYWJzKFxuXHRcdFx0U2luZ2xlUHJveHlSUENQcm90b2NvbChuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRFZGl0b3JUYWJzU2hhcGU+KCkge1xuXHRcdFx0XHQvLyBvdmVycmlkZS9pbXBsZW1lbnQgJG1vdmVUYWIgb3IgJGNsb3NlVGFiXG5cdFx0XHR9KVxuXHRcdCk7XG5cblx0XHRjb25zdCB0YWIxOiBJRWRpdG9yVGFiRHRvID0gY3JlYXRlVGFiRHRvKHtcblx0XHRcdGlkOiAndW5pcXVlc3RyaW5nJyxcblx0XHRcdGlzQWN0aXZlOiB0cnVlLFxuXHRcdFx0bGFiZWw6ICdsYWJlbDEnLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdGFiMjogSUVkaXRvclRhYkR0byA9IGNyZWF0ZVRhYkR0byh7XG5cdFx0XHRpc0FjdGl2ZTogZmFsc2UsXG5cdFx0XHRpZDogJ3VuaXF1ZXN0cmluZzInLFxuXHRcdFx0bGFiZWw6ICdsYWJlbDInLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdGFiMzogSUVkaXRvclRhYkR0byA9IGNyZWF0ZVRhYkR0byh7XG5cdFx0XHRpc0FjdGl2ZTogZmFsc2UsXG5cdFx0XHRpZDogJ3VuaXF1ZXN0cmluZzMnLFxuXHRcdFx0bGFiZWw6ICdsYWJlbDMnLFxuXHRcdH0pO1xuXG5cdFx0ZXh0SG9zdEVkaXRvclRhYnMuJGFjY2VwdEVkaXRvclRhYk1vZGVsKFt7XG5cdFx0XHRpc0FjdGl2ZTogdHJ1ZSxcblx0XHRcdHZpZXdDb2x1bW46IDAsXG5cdFx0XHRncm91cElkOiAxMixcblx0XHRcdHRhYnM6IFt0YWIxLCB0YWIyLCB0YWIzXVxuXHRcdH1dKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWxsLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGwubWFwKGcgPT4gZy50YWJzKS5mbGF0KCkubGVuZ3RoLCAzKTtcblxuXHRcdC8vIENsb3NlIHRhYiAyXG5cdFx0ZXh0SG9zdEVkaXRvclRhYnMuJGFjY2VwdFRhYk9wZXJhdGlvbih7XG5cdFx0XHRncm91cElkOiAxMixcblx0XHRcdGluZGV4OiAxLFxuXHRcdFx0a2luZDogVGFiTW9kZWxPcGVyYXRpb25LaW5kLlRBQl9DTE9TRSxcblx0XHRcdHRhYkR0bzogdGFiMlxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWxsLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGwubWFwKGcgPT4gZy50YWJzKS5mbGF0KCkubGVuZ3RoLCAyKTtcblxuXHRcdC8vIENsb3NlIGFjdGl2ZSB0YWIgYW5kIHVwZGF0ZSB0YWIgMyB0byBiZSBhY3RpdmVcblx0XHRleHRIb3N0RWRpdG9yVGFicy4kYWNjZXB0VGFiT3BlcmF0aW9uKHtcblx0XHRcdGdyb3VwSWQ6IDEyLFxuXHRcdFx0aW5kZXg6IDAsXG5cdFx0XHRraW5kOiBUYWJNb2RlbE9wZXJhdGlvbktpbmQuVEFCX0NMT1NFLFxuXHRcdFx0dGFiRHRvOiB0YWIxXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGwubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbC5tYXAoZyA9PiBnLnRhYnMpLmZsYXQoKS5sZW5ndGgsIDEpO1xuXHRcdHRhYjMuaXNBY3RpdmUgPSB0cnVlO1xuXHRcdGV4dEhvc3RFZGl0b3JUYWJzLiRhY2NlcHRUYWJPcGVyYXRpb24oe1xuXHRcdFx0Z3JvdXBJZDogMTIsXG5cdFx0XHRpbmRleDogMCxcblx0XHRcdGtpbmQ6IFRhYk1vZGVsT3BlcmF0aW9uS2luZC5UQUJfVVBEQVRFLFxuXHRcdFx0dGFiRHRvOiB0YWIzXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGwubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbC5tYXAoZyA9PiBnLnRhYnMpLmZsYXQoKS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWxsWzBdPy5hY3RpdmVUYWI/LmxhYmVsLCAnbGFiZWwzJyk7XG5cblx0XHQvLyBPcGVuIHRhYiAyIGJhY2tcblx0XHRleHRIb3N0RWRpdG9yVGFicy4kYWNjZXB0VGFiT3BlcmF0aW9uKHtcblx0XHRcdGdyb3VwSWQ6IDEyLFxuXHRcdFx0aW5kZXg6IDEsXG5cdFx0XHRraW5kOiBUYWJNb2RlbE9wZXJhdGlvbktpbmQuVEFCX09QRU4sXG5cdFx0XHR0YWJEdG86IHRhYjJcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWxsLm1hcChnID0+IGcudGFicykuZmxhdCgpLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGxbMF0/LnRhYnNbMV0/LmxhYmVsLCAnbGFiZWwyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1RhYiBvcGVyYXRpb25zIHBhdGNoZXMgbW92ZSBjb3JyZWN0bHknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZXh0SG9zdEVkaXRvclRhYnMgPSBuZXcgRXh0SG9zdEVkaXRvclRhYnMoXG5cdFx0XHRTaW5nbGVQcm94eVJQQ1Byb3RvY29sKG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZEVkaXRvclRhYnNTaGFwZT4oKSB7XG5cdFx0XHRcdC8vIG92ZXJyaWRlL2ltcGxlbWVudCAkbW92ZVRhYiBvciAkY2xvc2VUYWJcblx0XHRcdH0pXG5cdFx0KTtcblxuXHRcdGNvbnN0IHRhYjE6IElFZGl0b3JUYWJEdG8gPSBjcmVhdGVUYWJEdG8oe1xuXHRcdFx0aWQ6ICd1bmlxdWVzdHJpbmcnLFxuXHRcdFx0aXNBY3RpdmU6IHRydWUsXG5cdFx0XHRsYWJlbDogJ2xhYmVsMScsXG5cdFx0fSk7XG5cblx0XHRjb25zdCB0YWIyOiBJRWRpdG9yVGFiRHRvID0gY3JlYXRlVGFiRHRvKHtcblx0XHRcdGlzQWN0aXZlOiBmYWxzZSxcblx0XHRcdGlkOiAndW5pcXVlc3RyaW5nMicsXG5cdFx0XHRsYWJlbDogJ2xhYmVsMicsXG5cdFx0fSk7XG5cblx0XHRjb25zdCB0YWIzOiBJRWRpdG9yVGFiRHRvID0gY3JlYXRlVGFiRHRvKHtcblx0XHRcdGlzQWN0aXZlOiBmYWxzZSxcblx0XHRcdGlkOiAndW5pcXVlc3RyaW5nMycsXG5cdFx0XHRsYWJlbDogJ2xhYmVsMycsXG5cdFx0fSk7XG5cblx0XHRleHRIb3N0RWRpdG9yVGFicy4kYWNjZXB0RWRpdG9yVGFiTW9kZWwoW3tcblx0XHRcdGlzQWN0aXZlOiB0cnVlLFxuXHRcdFx0dmlld0NvbHVtbjogMCxcblx0XHRcdGdyb3VwSWQ6IDEyLFxuXHRcdFx0dGFiczogW3RhYjEsIHRhYjIsIHRhYjNdXG5cdFx0fV0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGwubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbC5tYXAoZyA9PiBnLnRhYnMpLmZsYXQoKS5sZW5ndGgsIDMpO1xuXG5cdFx0Ly8gTW92ZSB0YWIgMiB0byBpbmRleCAwXG5cdFx0ZXh0SG9zdEVkaXRvclRhYnMuJGFjY2VwdFRhYk9wZXJhdGlvbih7XG5cdFx0XHRncm91cElkOiAxMixcblx0XHRcdGluZGV4OiAwLFxuXHRcdFx0b2xkSW5kZXg6IDEsXG5cdFx0XHRraW5kOiBUYWJNb2RlbE9wZXJhdGlvbktpbmQuVEFCX01PVkUsXG5cdFx0XHR0YWJEdG86IHRhYjJcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWxsLm1hcChnID0+IGcudGFicykuZmxhdCgpLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGxbMF0/LnRhYnNbMF0/LmxhYmVsLCAnbGFiZWwyJyk7XG5cblx0XHQvLyBNb3ZlIHRhYiAzIHRvIGluZGV4IDFcblx0XHRleHRIb3N0RWRpdG9yVGFicy4kYWNjZXB0VGFiT3BlcmF0aW9uKHtcblx0XHRcdGdyb3VwSWQ6IDEyLFxuXHRcdFx0aW5kZXg6IDEsXG5cdFx0XHRvbGRJbmRleDogMixcblx0XHRcdGtpbmQ6IFRhYk1vZGVsT3BlcmF0aW9uS2luZC5UQUJfTU9WRSxcblx0XHRcdHRhYkR0bzogdGFiM1xuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWxsLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGwubWFwKGcgPT4gZy50YWJzKS5mbGF0KCkubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbFswXT8udGFic1sxXT8ubGFiZWwsICdsYWJlbDMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbFswXT8udGFic1swXT8ubGFiZWwsICdsYWJlbDInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbFswXT8udGFic1syXT8ubGFiZWwsICdsYWJlbDEnKTtcblx0fSk7XG5cblx0dGVzdCgnUmVmZXJlbmNlIHN0YWJpbGl0eSBhY3Jvc3MgZnVsbCBtb2RlbCByZXN5bmMnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBleHRIb3N0RWRpdG9yVGFicyA9IG5ldyBFeHRIb3N0RWRpdG9yVGFicyhcblx0XHRcdFNpbmdsZVByb3h5UlBDUHJvdG9jb2wobmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkRWRpdG9yVGFic1NoYXBlPigpIHtcblx0XHRcdFx0Ly8gb3ZlcnJpZGUvaW1wbGVtZW50ICRtb3ZlVGFiIG9yICRjbG9zZVRhYlxuXHRcdFx0fSlcblx0XHQpO1xuXG5cdFx0Y29uc3QgdGFiQUFBID0gY3JlYXRlVGFiRHRvKHsgaWQ6ICdBQUEnLCBsYWJlbDogJ0FBQScsIGlzQWN0aXZlOiB0cnVlLCBpbnB1dDogeyBraW5kOiBUYWJJbnB1dEtpbmQuVGV4dElucHV0LCB1cmk6IFVSSS5wYXJzZSgnZmlsZTovL2FiYy9BQUEudHh0JykgfSB9KTtcblx0XHRjb25zdCB0YWJCQkIgPSBjcmVhdGVUYWJEdG8oeyBpZDogJ0JCQicsIGxhYmVsOiAnQkJCJywgaXNBY3RpdmU6IGZhbHNlLCBpbnB1dDogeyBraW5kOiBUYWJJbnB1dEtpbmQuVGV4dElucHV0LCB1cmk6IFVSSS5wYXJzZSgnZmlsZTovL2FiYy9CQkIudHh0JykgfSB9KTtcblxuXHRcdGV4dEhvc3RFZGl0b3JUYWJzLiRhY2NlcHRFZGl0b3JUYWJNb2RlbChbe1xuXHRcdFx0aXNBY3RpdmU6IHRydWUsXG5cdFx0XHR2aWV3Q29sdW1uOiAwLFxuXHRcdFx0Z3JvdXBJZDogMTIsXG5cdFx0XHR0YWJzOiBbdGFiQUFBLCB0YWJCQkJdXG5cdFx0fV0pO1xuXG5cdFx0Y29uc3QgZ3JvdXBCZWZvcmUgPSBleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWxsWzBdO1xuXHRcdGNvbnN0IHRhYkFBQUJlZm9yZSA9IGdyb3VwQmVmb3JlLnRhYnNbMF07XG5cdFx0Y29uc3QgdGFiQkJCQmVmb3JlID0gZ3JvdXBCZWZvcmUudGFic1sxXTtcblxuXHRcdC8vIEEgc2Vjb25kIGdyb3VwIGlzIG9wZW5lZDogdGhlIGV4aXN0aW5nIG1vZGVsIGlzIHJlc2VudCB3aG9sZXNhbGUsIGJ1dFxuXHRcdC8vIHRoZSBzdXJ2aXZpbmcgZ3JvdXAvdGFiIG9iamVjdHMgbXVzdCBrZWVwIHRoZWlyIGlkZW50aXR5IHNvIHRoYXRcblx0XHQvLyBleHRlbnNpb25zIGtleWluZyBNYXBzL1dlYWtNYXBzIGJ5IHRoZW0ga2VlcCB3b3JraW5nLlxuXHRcdGV4dEhvc3RFZGl0b3JUYWJzLiRhY2NlcHRFZGl0b3JUYWJNb2RlbChbXG5cdFx0XHR7IGlzQWN0aXZlOiBmYWxzZSwgdmlld0NvbHVtbjogMCwgZ3JvdXBJZDogMTIsIHRhYnM6IFt0YWJBQUEsIHRhYkJCQl0gfSxcblx0XHRcdHsgaXNBY3RpdmU6IHRydWUsIHZpZXdDb2x1bW46IDEsIGdyb3VwSWQ6IDEzLCB0YWJzOiBbXSB9XG5cdFx0XSk7XG5cblx0XHRjb25zdCBncm91cEFmdGVyID0gZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbC5maW5kKGcgPT4gZy50YWJzLmxlbmd0aCA9PT0gMikhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cEFmdGVyLCBncm91cEJlZm9yZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwQWZ0ZXIudGFic1swXSwgdGFiQUFBQmVmb3JlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXBBZnRlci50YWJzWzFdLCB0YWJCQkJCZWZvcmUpO1xuXG5cdFx0Ly8gQSB0YWIgaXMgY2xvc2VkIGR1cmluZyB0aGUgcmVzeW5jOiB0aGUgc3Vydml2b3Iga2VlcHMgaXRzIGlkZW50aXR5LFxuXHRcdC8vIGFuZCB0aGUgcmVtb3ZlZCBvbmUgZG9lcyBub3QgcmVhcHBlYXIuXG5cdFx0ZXh0SG9zdEVkaXRvclRhYnMuJGFjY2VwdEVkaXRvclRhYk1vZGVsKFtcblx0XHRcdHsgaXNBY3RpdmU6IGZhbHNlLCB2aWV3Q29sdW1uOiAwLCBncm91cElkOiAxMiwgdGFiczogW3sgLi4udGFiQUFBLCBpc0FjdGl2ZTogdHJ1ZSB9XSB9LFxuXHRcdFx0eyBpc0FjdGl2ZTogdHJ1ZSwgdmlld0NvbHVtbjogMSwgZ3JvdXBJZDogMTMsIHRhYnM6IFtdIH1cblx0XHRdKTtcblxuXHRcdGNvbnN0IHN1cnZpdmluZ0dyb3VwID0gZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbC5maW5kKGcgPT4gZy50YWJzLmxlbmd0aCA9PT0gMSkhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdXJ2aXZpbmdHcm91cCwgZ3JvdXBCZWZvcmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdXJ2aXZpbmdHcm91cC50YWJzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1cnZpdmluZ0dyb3VwLnRhYnNbMF0sIHRhYkFBQUJlZm9yZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1cnZpdmluZ0dyb3VwLmFjdGl2ZVRhYiwgdGFiQUFBQmVmb3JlKTtcblx0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
