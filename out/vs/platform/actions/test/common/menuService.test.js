import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { isIMenuItem, MenuId, MenuRegistry } from "../../common/actions.js";
import { MenuService } from "../../common/menuService.js";
import { NullCommandService } from "../../../commands/test/common/nullCommandService.js";
import { MockContextKeyService, MockKeybindingService } from "../../../keybinding/test/common/mockKeybindingService.js";
import { InMemoryStorageService } from "../../../storage/common/storage.js";
const contextKeyService = new class extends MockContextKeyService {
  contextMatchesRules() {
    return true;
  }
}();
suite("MenuService", function() {
  let menuService;
  const disposables = new DisposableStore();
  let testMenuId;
  setup(function() {
    menuService = new MenuService(NullCommandService, new MockKeybindingService(), new InMemoryStorageService());
    testMenuId = new MenuId(`testo/${generateUuid()}`);
    disposables.clear();
  });
  teardown(function() {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("group sorting", function() {
    disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
      command: { id: "one", title: "FOO" },
      group: "0_hello"
    }));
    disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
      command: { id: "two", title: "FOO" },
      group: "hello"
    }));
    disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
      command: { id: "three", title: "FOO" },
      group: "Hello"
    }));
    disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
      command: { id: "four", title: "FOO" },
      group: ""
    }));
    disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
      command: { id: "five", title: "FOO" },
      group: "navigation"
    }));
    const groups = disposables.add(menuService.createMenu(testMenuId, contextKeyService)).getActions();
    assert.strictEqual(groups.length, 5);
    const [one, two, three, four, five] = groups;
    assert.strictEqual(one[0], "navigation");
    assert.strictEqual(two[0], "0_hello");
    assert.strictEqual(three[0], "hello");
    assert.strictEqual(four[0], "Hello");
    assert.strictEqual(five[0], "");
  });
  test("in group sorting, by title", function() {
    disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
      command: { id: "a", title: "aaa" },
      group: "Hello"
    }));
    disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
      command: { id: "b", title: "fff" },
      group: "Hello"
    }));
    disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
      command: { id: "c", title: "zzz" },
      group: "Hello"
    }));
    const groups = disposables.add(menuService.createMenu(testMenuId, contextKeyService)).getActions();
    assert.strictEqual(groups.length, 1);
    const [, actions] = groups[0];
    assert.strictEqual(actions.length, 3);
    const [one, two, three] = actions;
    assert.strictEqual(one.id, "a");
    assert.strictEqual(two.id, "b");
    assert.strictEqual(three.id, "c");
  });
  test("in group sorting, by title and order", function() {
    disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
      command: { id: "a", title: "aaa" },
      group: "Hello",
      order: 10
    }));
    disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
      command: { id: "b", title: "fff" },
      group: "Hello"
    }));
    disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
      command: { id: "c", title: "zzz" },
      group: "Hello",
      order: -1
    }));
    disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
      command: { id: "d", title: "yyy" },
      group: "Hello",
      order: -1
    }));
    const groups = disposables.add(menuService.createMenu(testMenuId, contextKeyService)).getActions();
    assert.strictEqual(groups.length, 1);
    const [, actions] = groups[0];
    assert.strictEqual(actions.length, 4);
    const [one, two, three, four] = actions;
    assert.strictEqual(one.id, "d");
    assert.strictEqual(two.id, "c");
    assert.strictEqual(three.id, "b");
    assert.strictEqual(four.id, "a");
  });
  test("in group sorting, special: navigation", function() {
    disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
      command: { id: "a", title: "aaa" },
      group: "navigation",
      order: 1.3
    }));
    disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
      command: { id: "b", title: "fff" },
      group: "navigation",
      order: 1.2
    }));
    disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
      command: { id: "c", title: "zzz" },
      group: "navigation",
      order: 1.1
    }));
    const groups = disposables.add(menuService.createMenu(testMenuId, contextKeyService)).getActions();
    assert.strictEqual(groups.length, 1);
    const [[, actions]] = groups;
    assert.strictEqual(actions.length, 3);
    const [one, two, three] = actions;
    assert.strictEqual(one.id, "c");
    assert.strictEqual(two.id, "b");
    assert.strictEqual(three.id, "a");
  });
  test("special MenuId palette", function() {
    disposables.add(MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
      command: { id: "a", title: "Explicit" }
    }));
    disposables.add(MenuRegistry.addCommand({ id: "b", title: "Implicit" }));
    let foundA = false;
    let foundB = false;
    for (const item of MenuRegistry.getMenuItems(MenuId.CommandPalette)) {
      if (isIMenuItem(item)) {
        if (item.command.id === "a") {
          assert.strictEqual(item.command.title, "Explicit");
          foundA = true;
        }
        if (item.command.id === "b") {
          assert.strictEqual(item.command.title, "Implicit");
          foundB = true;
        }
      }
    }
    assert.strictEqual(foundA, true);
    assert.strictEqual(foundB, true);
  });
  test("Extension contributed submenus missing with errors in output #155030", function() {
    const id = generateUuid();
    const menu = new MenuId(id);
    assert.throws(() => new MenuId(id));
    assert.ok(menu === MenuId.for(id));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWN0aW9uc1xcdGVzdFxcY29tbW9uXFxtZW51U2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBpc0lNZW51SXRlbSwgTWVudUlkLCBNZW51UmVnaXN0cnkgfSBmcm9tICcuLi8uLi9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBNZW51U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tZW51U2VydmljZS5qcyc7XG5pbXBvcnQgeyBOdWxsQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tYW5kcy90ZXN0L2NvbW1vbi9udWxsQ29tbWFuZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTW9ja0NvbnRleHRLZXlTZXJ2aWNlLCBNb2NrS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9rZXliaW5kaW5nL3Rlc3QvY29tbW9uL21vY2tLZXliaW5kaW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5cbi8vIC0tLSBzZXJ2aWNlIGluc3RhbmNlc1xuXG5jb25zdCBjb250ZXh0S2V5U2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIE1vY2tDb250ZXh0S2V5U2VydmljZSB7XG5cdG92ZXJyaWRlIGNvbnRleHRNYXRjaGVzUnVsZXMoKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn07XG5cbi8vIC0tLSB0ZXN0c1xuXG5zdWl0ZSgnTWVudVNlcnZpY2UnLCBmdW5jdGlvbiAoKSB7XG5cblx0bGV0IG1lbnVTZXJ2aWNlOiBNZW51U2VydmljZTtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCB0ZXN0TWVudUlkOiBNZW51SWQ7XG5cblx0c2V0dXAoZnVuY3Rpb24gKCkge1xuXHRcdG1lbnVTZXJ2aWNlID0gbmV3IE1lbnVTZXJ2aWNlKE51bGxDb21tYW5kU2VydmljZSwgbmV3IE1vY2tLZXliaW5kaW5nU2VydmljZSgpLCBuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHR0ZXN0TWVudUlkID0gbmV3IE1lbnVJZChgdGVzdG8vJHtnZW5lcmF0ZVV1aWQoKX1gKTtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblxuXHR0ZWFyZG93bihmdW5jdGlvbiAoKSB7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZ3JvdXAgc29ydGluZycsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0odGVzdE1lbnVJZCwge1xuXHRcdFx0Y29tbWFuZDogeyBpZDogJ29uZScsIHRpdGxlOiAnRk9PJyB9LFxuXHRcdFx0Z3JvdXA6ICcwX2hlbGxvJ1xuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0odGVzdE1lbnVJZCwge1xuXHRcdFx0Y29tbWFuZDogeyBpZDogJ3R3bycsIHRpdGxlOiAnRk9PJyB9LFxuXHRcdFx0Z3JvdXA6ICdoZWxsbydcblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKHRlc3RNZW51SWQsIHtcblx0XHRcdGNvbW1hbmQ6IHsgaWQ6ICd0aHJlZScsIHRpdGxlOiAnRk9PJyB9LFxuXHRcdFx0Z3JvdXA6ICdIZWxsbydcblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKHRlc3RNZW51SWQsIHtcblx0XHRcdGNvbW1hbmQ6IHsgaWQ6ICdmb3VyJywgdGl0bGU6ICdGT08nIH0sXG5cdFx0XHRncm91cDogJydcblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKHRlc3RNZW51SWQsIHtcblx0XHRcdGNvbW1hbmQ6IHsgaWQ6ICdmaXZlJywgdGl0bGU6ICdGT08nIH0sXG5cdFx0XHRncm91cDogJ25hdmlnYXRpb24nXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgZ3JvdXBzID0gZGlzcG9zYWJsZXMuYWRkKG1lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUodGVzdE1lbnVJZCwgY29udGV4dEtleVNlcnZpY2UpKS5nZXRBY3Rpb25zKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXBzLmxlbmd0aCwgNSk7XG5cdFx0Y29uc3QgW29uZSwgdHdvLCB0aHJlZSwgZm91ciwgZml2ZV0gPSBncm91cHM7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob25lWzBdLCAnbmF2aWdhdGlvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0d29bMF0sICcwX2hlbGxvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRocmVlWzBdLCAnaGVsbG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm91clswXSwgJ0hlbGxvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpdmVbMF0sICcnKTtcblx0fSk7XG5cblx0dGVzdCgnaW4gZ3JvdXAgc29ydGluZywgYnkgdGl0bGUnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKHRlc3RNZW51SWQsIHtcblx0XHRcdGNvbW1hbmQ6IHsgaWQ6ICdhJywgdGl0bGU6ICdhYWEnIH0sXG5cdFx0XHRncm91cDogJ0hlbGxvJ1xuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0odGVzdE1lbnVJZCwge1xuXHRcdFx0Y29tbWFuZDogeyBpZDogJ2InLCB0aXRsZTogJ2ZmZicgfSxcblx0XHRcdGdyb3VwOiAnSGVsbG8nXG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbSh0ZXN0TWVudUlkLCB7XG5cdFx0XHRjb21tYW5kOiB7IGlkOiAnYycsIHRpdGxlOiAnenp6JyB9LFxuXHRcdFx0Z3JvdXA6ICdIZWxsbydcblx0XHR9KSk7XG5cblx0XHRjb25zdCBncm91cHMgPSBkaXNwb3NhYmxlcy5hZGQobWVudVNlcnZpY2UuY3JlYXRlTWVudSh0ZXN0TWVudUlkLCBjb250ZXh0S2V5U2VydmljZSkpLmdldEFjdGlvbnMoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cHMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBbLCBhY3Rpb25zXSA9IGdyb3Vwc1swXTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zLmxlbmd0aCwgMyk7XG5cdFx0Y29uc3QgW29uZSwgdHdvLCB0aHJlZV0gPSBhY3Rpb25zO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvbmUuaWQsICdhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR3by5pZCwgJ2InKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhyZWUuaWQsICdjJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luIGdyb3VwIHNvcnRpbmcsIGJ5IHRpdGxlIGFuZCBvcmRlcicsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0odGVzdE1lbnVJZCwge1xuXHRcdFx0Y29tbWFuZDogeyBpZDogJ2EnLCB0aXRsZTogJ2FhYScgfSxcblx0XHRcdGdyb3VwOiAnSGVsbG8nLFxuXHRcdFx0b3JkZXI6IDEwXG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbSh0ZXN0TWVudUlkLCB7XG5cdFx0XHRjb21tYW5kOiB7IGlkOiAnYicsIHRpdGxlOiAnZmZmJyB9LFxuXHRcdFx0Z3JvdXA6ICdIZWxsbydcblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKHRlc3RNZW51SWQsIHtcblx0XHRcdGNvbW1hbmQ6IHsgaWQ6ICdjJywgdGl0bGU6ICd6enonIH0sXG5cdFx0XHRncm91cDogJ0hlbGxvJyxcblx0XHRcdG9yZGVyOiAtMVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0odGVzdE1lbnVJZCwge1xuXHRcdFx0Y29tbWFuZDogeyBpZDogJ2QnLCB0aXRsZTogJ3l5eScgfSxcblx0XHRcdGdyb3VwOiAnSGVsbG8nLFxuXHRcdFx0b3JkZXI6IC0xXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgZ3JvdXBzID0gZGlzcG9zYWJsZXMuYWRkKG1lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUodGVzdE1lbnVJZCwgY29udGV4dEtleVNlcnZpY2UpKS5nZXRBY3Rpb25zKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXBzLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgWywgYWN0aW9uc10gPSBncm91cHNbMF07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9ucy5sZW5ndGgsIDQpO1xuXHRcdGNvbnN0IFtvbmUsIHR3bywgdGhyZWUsIGZvdXJdID0gYWN0aW9ucztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob25lLmlkLCAnZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0d28uaWQsICdjJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRocmVlLmlkLCAnYicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3VyLmlkLCAnYScpO1xuXHR9KTtcblxuXG5cdHRlc3QoJ2luIGdyb3VwIHNvcnRpbmcsIHNwZWNpYWw6IG5hdmlnYXRpb24nLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKHRlc3RNZW51SWQsIHtcblx0XHRcdGNvbW1hbmQ6IHsgaWQ6ICdhJywgdGl0bGU6ICdhYWEnIH0sXG5cdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0b3JkZXI6IDEuM1xuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0odGVzdE1lbnVJZCwge1xuXHRcdFx0Y29tbWFuZDogeyBpZDogJ2InLCB0aXRsZTogJ2ZmZicgfSxcblx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRvcmRlcjogMS4yXG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbSh0ZXN0TWVudUlkLCB7XG5cdFx0XHRjb21tYW5kOiB7IGlkOiAnYycsIHRpdGxlOiAnenp6JyB9LFxuXHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdG9yZGVyOiAxLjFcblx0XHR9KSk7XG5cblx0XHRjb25zdCBncm91cHMgPSBkaXNwb3NhYmxlcy5hZGQobWVudVNlcnZpY2UuY3JlYXRlTWVudSh0ZXN0TWVudUlkLCBjb250ZXh0S2V5U2VydmljZSkpLmdldEFjdGlvbnMoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cHMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBbWywgYWN0aW9uc11dID0gZ3JvdXBzO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnMubGVuZ3RoLCAzKTtcblx0XHRjb25zdCBbb25lLCB0d28sIHRocmVlXSA9IGFjdGlvbnM7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9uZS5pZCwgJ2MnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHdvLmlkLCAnYicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aHJlZS5pZCwgJ2EnKTtcblx0fSk7XG5cblx0dGVzdCgnc3BlY2lhbCBNZW51SWQgcGFsZXR0ZScsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRQYWxldHRlLCB7XG5cdFx0XHRjb21tYW5kOiB7IGlkOiAnYScsIHRpdGxlOiAnRXhwbGljaXQnIH1cblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoTWVudVJlZ2lzdHJ5LmFkZENvbW1hbmQoeyBpZDogJ2InLCB0aXRsZTogJ0ltcGxpY2l0JyB9KSk7XG5cblx0XHRsZXQgZm91bmRBID0gZmFsc2U7XG5cdFx0bGV0IGZvdW5kQiA9IGZhbHNlO1xuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBNZW51UmVnaXN0cnkuZ2V0TWVudUl0ZW1zKE1lbnVJZC5Db21tYW5kUGFsZXR0ZSkpIHtcblx0XHRcdGlmIChpc0lNZW51SXRlbShpdGVtKSkge1xuXHRcdFx0XHRpZiAoaXRlbS5jb21tYW5kLmlkID09PSAnYScpIHtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbS5jb21tYW5kLnRpdGxlLCAnRXhwbGljaXQnKTtcblx0XHRcdFx0XHRmb3VuZEEgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChpdGVtLmNvbW1hbmQuaWQgPT09ICdiJykge1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtLmNvbW1hbmQudGl0bGUsICdJbXBsaWNpdCcpO1xuXHRcdFx0XHRcdGZvdW5kQiA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvdW5kQSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvdW5kQiwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0V4dGVuc2lvbiBjb250cmlidXRlZCBzdWJtZW51cyBtaXNzaW5nIHdpdGggZXJyb3JzIGluIG91dHB1dCAjMTU1MDMwJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgaWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCBtZW51ID0gbmV3IE1lbnVJZChpZCk7XG5cblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IG5ldyBNZW51SWQoaWQpKTtcblx0XHRhc3NlcnQub2sobWVudSA9PT0gTWVudUlkLmZvcihpZCkpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsYUFBYSxRQUFRLG9CQUFvQjtBQUNsRCxTQUFTLG1C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
