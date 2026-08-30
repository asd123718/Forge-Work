import { deepStrictEqual, strictEqual } from "assert";
import { Codicon } from "../../../../../base/common/codicons.js";
import Severity from "../../../../../base/common/severity.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { spinningLoading } from "../../../../../platform/theme/common/iconRegistry.js";
import { TerminalStatusList } from "../../browser/terminalStatusList.js";
import { workbenchInstantiationService } from "../../../../test/browser/workbenchTestServices.js";
function statusesEqual(list, expected) {
  deepStrictEqual(list.statuses.map((e) => [e.id, e.severity]), expected);
}
suite("Workbench - TerminalStatusList", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let list;
  setup(() => {
    const instantiationService = workbenchInstantiationService(void 0, store);
    list = store.add(instantiationService.createInstance(TerminalStatusList));
  });
  test("primary", () => {
    strictEqual(list.primary?.id, void 0);
    list.add({ id: "info1", severity: Severity.Info });
    strictEqual(list.primary?.id, "info1");
    list.add({ id: "warning1", severity: Severity.Warning });
    strictEqual(list.primary?.id, "warning1");
    list.add({ id: "info2", severity: Severity.Info });
    strictEqual(list.primary?.id, "warning1");
    list.add({ id: "warning2", severity: Severity.Warning });
    strictEqual(list.primary?.id, "warning2");
    list.add({ id: "info3", severity: Severity.Info });
    strictEqual(list.primary?.id, "warning2");
    list.add({ id: "error1", severity: Severity.Error });
    strictEqual(list.primary?.id, "error1");
    list.add({ id: "warning3", severity: Severity.Warning });
    strictEqual(list.primary?.id, "error1");
    list.add({ id: "error2", severity: Severity.Error });
    strictEqual(list.primary?.id, "error2");
    list.remove("error1");
    strictEqual(list.primary?.id, "error2");
    list.remove("error2");
    strictEqual(list.primary?.id, "warning3");
  });
  test("statuses", () => {
    strictEqual(list.statuses.length, 0);
    list.add({ id: "info", severity: Severity.Info });
    list.add({ id: "warning", severity: Severity.Warning });
    list.add({ id: "error", severity: Severity.Error });
    strictEqual(list.statuses.length, 3);
    statusesEqual(list, [
      ["info", Severity.Info],
      ["warning", Severity.Warning],
      ["error", Severity.Error]
    ]);
    list.remove("info");
    list.remove("warning");
    list.remove("error");
    strictEqual(list.statuses.length, 0);
  });
  test("onDidAddStatus", async () => {
    const result = await new Promise((r) => {
      store.add(list.onDidAddStatus(r));
      list.add({ id: "test", severity: Severity.Info });
    });
    deepStrictEqual(result, { id: "test", severity: Severity.Info });
  });
  test("onDidRemoveStatus", async () => {
    const result = await new Promise((r) => {
      store.add(list.onDidRemoveStatus(r));
      list.add({ id: "test", severity: Severity.Info });
      list.remove("test");
    });
    deepStrictEqual(result, { id: "test", severity: Severity.Info });
  });
  test("onDidChangePrimaryStatus", async () => {
    const result = await new Promise((r) => {
      store.add(list.onDidChangePrimaryStatus(r));
      list.add({ id: "test", severity: Severity.Info });
    });
    deepStrictEqual(result, { id: "test", severity: Severity.Info });
  });
  test("primary is not updated to status without an icon", async () => {
    list.add({ id: "test", severity: Severity.Info, icon: Codicon.check });
    list.add({ id: "warning", severity: Severity.Warning });
    deepStrictEqual(list.primary, { id: "test", severity: Severity.Info, icon: Codicon.check });
  });
  test("add", () => {
    statusesEqual(list, []);
    list.add({ id: "info", severity: Severity.Info });
    statusesEqual(list, [
      ["info", Severity.Info]
    ]);
    list.add({ id: "warning", severity: Severity.Warning });
    statusesEqual(list, [
      ["info", Severity.Info],
      ["warning", Severity.Warning]
    ]);
    list.add({ id: "error", severity: Severity.Error });
    statusesEqual(list, [
      ["info", Severity.Info],
      ["warning", Severity.Warning],
      ["error", Severity.Error]
    ]);
  });
  test("add should remove animation", () => {
    statusesEqual(list, []);
    list.add({ id: "info", severity: Severity.Info, icon: spinningLoading });
    statusesEqual(list, [
      ["info", Severity.Info]
    ]);
    strictEqual(list.statuses[0].icon.id, Codicon.play.id, "loading~spin should be converted to play");
    list.add({ id: "warning", severity: Severity.Warning, icon: ThemeIcon.modify(Codicon.zap, "spin") });
    statusesEqual(list, [
      ["info", Severity.Info],
      ["warning", Severity.Warning]
    ]);
    strictEqual(list.statuses[1].icon.id, Codicon.zap.id, "zap~spin should have animation removed only");
  });
  test("add should fire onDidRemoveStatus if same status id with a different object reference was added", () => {
    const eventCalls = [];
    store.add(list.onDidAddStatus(() => eventCalls.push("add")));
    store.add(list.onDidRemoveStatus(() => eventCalls.push("remove")));
    list.add({ id: "test", severity: Severity.Info });
    list.add({ id: "test", severity: Severity.Info });
    deepStrictEqual(eventCalls, [
      "add",
      "remove",
      "add"
    ]);
  });
  test("remove", () => {
    list.add({ id: "info", severity: Severity.Info });
    list.add({ id: "warning", severity: Severity.Warning });
    list.add({ id: "error", severity: Severity.Error });
    statusesEqual(list, [
      ["info", Severity.Info],
      ["warning", Severity.Warning],
      ["error", Severity.Error]
    ]);
    list.remove("warning");
    statusesEqual(list, [
      ["info", Severity.Info],
      ["error", Severity.Error]
    ]);
    list.remove("info");
    statusesEqual(list, [
      ["error", Severity.Error]
    ]);
    list.remove("error");
    statusesEqual(list, []);
  });
  test("toggle", () => {
    const status = { id: "info", severity: Severity.Info };
    list.toggle(status, true);
    statusesEqual(list, [
      ["info", Severity.Info]
    ]);
    list.toggle(status, false);
    statusesEqual(list, []);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFx0ZXN0XFxicm93c2VyXFx0ZXJtaW5hbFN0YXR1c0xpc3QudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRlZXBTdHJpY3RFcXVhbCwgc3RyaWN0RXF1YWwgfSBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBzcGlubmluZ0xvYWRpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vaWNvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFRlcm1pbmFsU3RhdHVzTGlzdCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdGVybWluYWxTdGF0dXNMaXN0LmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFN0YXR1cyB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuXG5mdW5jdGlvbiBzdGF0dXNlc0VxdWFsKGxpc3Q6IFRlcm1pbmFsU3RhdHVzTGlzdCwgZXhwZWN0ZWQ6IFtzdHJpbmcsIFNldmVyaXR5XVtdKSB7XG5cdGRlZXBTdHJpY3RFcXVhbChsaXN0LnN0YXR1c2VzLm1hcChlID0+IFtlLmlkLCBlLnNldmVyaXR5XSksIGV4cGVjdGVkKTtcbn1cblxuc3VpdGUoJ1dvcmtiZW5jaCAtIFRlcm1pbmFsU3RhdHVzTGlzdCcsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0bGV0IGxpc3Q6IFRlcm1pbmFsU3RhdHVzTGlzdDtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHN0b3JlKTtcblx0XHRsaXN0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsU3RhdHVzTGlzdCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmltYXJ5JywgKCkgPT4ge1xuXHRcdHN0cmljdEVxdWFsKGxpc3QucHJpbWFyeT8uaWQsIHVuZGVmaW5lZCk7XG5cdFx0bGlzdC5hZGQoeyBpZDogJ2luZm8xJywgc2V2ZXJpdHk6IFNldmVyaXR5LkluZm8gfSk7XG5cdFx0c3RyaWN0RXF1YWwobGlzdC5wcmltYXJ5Py5pZCwgJ2luZm8xJyk7XG5cdFx0bGlzdC5hZGQoeyBpZDogJ3dhcm5pbmcxJywgc2V2ZXJpdHk6IFNldmVyaXR5Lldhcm5pbmcgfSk7XG5cdFx0c3RyaWN0RXF1YWwobGlzdC5wcmltYXJ5Py5pZCwgJ3dhcm5pbmcxJyk7XG5cdFx0bGlzdC5hZGQoeyBpZDogJ2luZm8yJywgc2V2ZXJpdHk6IFNldmVyaXR5LkluZm8gfSk7XG5cdFx0c3RyaWN0RXF1YWwobGlzdC5wcmltYXJ5Py5pZCwgJ3dhcm5pbmcxJyk7XG5cdFx0bGlzdC5hZGQoeyBpZDogJ3dhcm5pbmcyJywgc2V2ZXJpdHk6IFNldmVyaXR5Lldhcm5pbmcgfSk7XG5cdFx0c3RyaWN0RXF1YWwobGlzdC5wcmltYXJ5Py5pZCwgJ3dhcm5pbmcyJyk7XG5cdFx0bGlzdC5hZGQoeyBpZDogJ2luZm8zJywgc2V2ZXJpdHk6IFNldmVyaXR5LkluZm8gfSk7XG5cdFx0c3RyaWN0RXF1YWwobGlzdC5wcmltYXJ5Py5pZCwgJ3dhcm5pbmcyJyk7XG5cdFx0bGlzdC5hZGQoeyBpZDogJ2Vycm9yMScsIHNldmVyaXR5OiBTZXZlcml0eS5FcnJvciB9KTtcblx0XHRzdHJpY3RFcXVhbChsaXN0LnByaW1hcnk/LmlkLCAnZXJyb3IxJyk7XG5cdFx0bGlzdC5hZGQoeyBpZDogJ3dhcm5pbmczJywgc2V2ZXJpdHk6IFNldmVyaXR5Lldhcm5pbmcgfSk7XG5cdFx0c3RyaWN0RXF1YWwobGlzdC5wcmltYXJ5Py5pZCwgJ2Vycm9yMScpO1xuXHRcdGxpc3QuYWRkKHsgaWQ6ICdlcnJvcjInLCBzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IgfSk7XG5cdFx0c3RyaWN0RXF1YWwobGlzdC5wcmltYXJ5Py5pZCwgJ2Vycm9yMicpO1xuXHRcdGxpc3QucmVtb3ZlKCdlcnJvcjEnKTtcblx0XHRzdHJpY3RFcXVhbChsaXN0LnByaW1hcnk/LmlkLCAnZXJyb3IyJyk7XG5cdFx0bGlzdC5yZW1vdmUoJ2Vycm9yMicpO1xuXHRcdHN0cmljdEVxdWFsKGxpc3QucHJpbWFyeT8uaWQsICd3YXJuaW5nMycpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGF0dXNlcycsICgpID0+IHtcblx0XHRzdHJpY3RFcXVhbChsaXN0LnN0YXR1c2VzLmxlbmd0aCwgMCk7XG5cdFx0bGlzdC5hZGQoeyBpZDogJ2luZm8nLCBzZXZlcml0eTogU2V2ZXJpdHkuSW5mbyB9KTtcblx0XHRsaXN0LmFkZCh7IGlkOiAnd2FybmluZycsIHNldmVyaXR5OiBTZXZlcml0eS5XYXJuaW5nIH0pO1xuXHRcdGxpc3QuYWRkKHsgaWQ6ICdlcnJvcicsIHNldmVyaXR5OiBTZXZlcml0eS5FcnJvciB9KTtcblx0XHRzdHJpY3RFcXVhbChsaXN0LnN0YXR1c2VzLmxlbmd0aCwgMyk7XG5cdFx0c3RhdHVzZXNFcXVhbChsaXN0LCBbXG5cdFx0XHRbJ2luZm8nLCBTZXZlcml0eS5JbmZvXSxcblx0XHRcdFsnd2FybmluZycsIFNldmVyaXR5Lldhcm5pbmddLFxuXHRcdFx0WydlcnJvcicsIFNldmVyaXR5LkVycm9yXSxcblx0XHRdKTtcblx0XHRsaXN0LnJlbW92ZSgnaW5mbycpO1xuXHRcdGxpc3QucmVtb3ZlKCd3YXJuaW5nJyk7XG5cdFx0bGlzdC5yZW1vdmUoJ2Vycm9yJyk7XG5cdFx0c3RyaWN0RXF1YWwobGlzdC5zdGF0dXNlcy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdvbkRpZEFkZFN0YXR1cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBuZXcgUHJvbWlzZTxJVGVybWluYWxTdGF0dXM+KHIgPT4ge1xuXHRcdFx0c3RvcmUuYWRkKGxpc3Qub25EaWRBZGRTdGF0dXMocikpO1xuXHRcdFx0bGlzdC5hZGQoeyBpZDogJ3Rlc3QnLCBzZXZlcml0eTogU2V2ZXJpdHkuSW5mbyB9KTtcblx0XHR9KTtcblx0XHRkZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IGlkOiAndGVzdCcsIHNldmVyaXR5OiBTZXZlcml0eS5JbmZvIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvbkRpZFJlbW92ZVN0YXR1cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBuZXcgUHJvbWlzZTxJVGVybWluYWxTdGF0dXM+KHIgPT4ge1xuXHRcdFx0c3RvcmUuYWRkKGxpc3Qub25EaWRSZW1vdmVTdGF0dXMocikpO1xuXHRcdFx0bGlzdC5hZGQoeyBpZDogJ3Rlc3QnLCBzZXZlcml0eTogU2V2ZXJpdHkuSW5mbyB9KTtcblx0XHRcdGxpc3QucmVtb3ZlKCd0ZXN0Jyk7XG5cdFx0fSk7XG5cdFx0ZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBpZDogJ3Rlc3QnLCBzZXZlcml0eTogU2V2ZXJpdHkuSW5mbyB9KTtcblx0fSk7XG5cblx0dGVzdCgnb25EaWRDaGFuZ2VQcmltYXJ5U3RhdHVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IG5ldyBQcm9taXNlPElUZXJtaW5hbFN0YXR1cyB8IHVuZGVmaW5lZD4ociA9PiB7XG5cdFx0XHRzdG9yZS5hZGQobGlzdC5vbkRpZENoYW5nZVByaW1hcnlTdGF0dXMocikpO1xuXHRcdFx0bGlzdC5hZGQoeyBpZDogJ3Rlc3QnLCBzZXZlcml0eTogU2V2ZXJpdHkuSW5mbyB9KTtcblx0XHR9KTtcblx0XHRkZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IGlkOiAndGVzdCcsIHNldmVyaXR5OiBTZXZlcml0eS5JbmZvIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmltYXJ5IGlzIG5vdCB1cGRhdGVkIHRvIHN0YXR1cyB3aXRob3V0IGFuIGljb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0bGlzdC5hZGQoeyBpZDogJ3Rlc3QnLCBzZXZlcml0eTogU2V2ZXJpdHkuSW5mbywgaWNvbjogQ29kaWNvbi5jaGVjayB9KTtcblx0XHRsaXN0LmFkZCh7IGlkOiAnd2FybmluZycsIHNldmVyaXR5OiBTZXZlcml0eS5XYXJuaW5nIH0pO1xuXHRcdGRlZXBTdHJpY3RFcXVhbChsaXN0LnByaW1hcnksIHsgaWQ6ICd0ZXN0Jywgc2V2ZXJpdHk6IFNldmVyaXR5LkluZm8sIGljb246IENvZGljb24uY2hlY2sgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkZCcsICgpID0+IHtcblx0XHRzdGF0dXNlc0VxdWFsKGxpc3QsIFtdKTtcblx0XHRsaXN0LmFkZCh7IGlkOiAnaW5mbycsIHNldmVyaXR5OiBTZXZlcml0eS5JbmZvIH0pO1xuXHRcdHN0YXR1c2VzRXF1YWwobGlzdCwgW1xuXHRcdFx0WydpbmZvJywgU2V2ZXJpdHkuSW5mb11cblx0XHRdKTtcblx0XHRsaXN0LmFkZCh7IGlkOiAnd2FybmluZycsIHNldmVyaXR5OiBTZXZlcml0eS5XYXJuaW5nIH0pO1xuXHRcdHN0YXR1c2VzRXF1YWwobGlzdCwgW1xuXHRcdFx0WydpbmZvJywgU2V2ZXJpdHkuSW5mb10sXG5cdFx0XHRbJ3dhcm5pbmcnLCBTZXZlcml0eS5XYXJuaW5nXVxuXHRcdF0pO1xuXHRcdGxpc3QuYWRkKHsgaWQ6ICdlcnJvcicsIHNldmVyaXR5OiBTZXZlcml0eS5FcnJvciB9KTtcblx0XHRzdGF0dXNlc0VxdWFsKGxpc3QsIFtcblx0XHRcdFsnaW5mbycsIFNldmVyaXR5LkluZm9dLFxuXHRcdFx0Wyd3YXJuaW5nJywgU2V2ZXJpdHkuV2FybmluZ10sXG5cdFx0XHRbJ2Vycm9yJywgU2V2ZXJpdHkuRXJyb3JdXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkZCBzaG91bGQgcmVtb3ZlIGFuaW1hdGlvbicsICgpID0+IHtcblx0XHRzdGF0dXNlc0VxdWFsKGxpc3QsIFtdKTtcblx0XHRsaXN0LmFkZCh7IGlkOiAnaW5mbycsIHNldmVyaXR5OiBTZXZlcml0eS5JbmZvLCBpY29uOiBzcGlubmluZ0xvYWRpbmcgfSk7XG5cdFx0c3RhdHVzZXNFcXVhbChsaXN0LCBbXG5cdFx0XHRbJ2luZm8nLCBTZXZlcml0eS5JbmZvXVxuXHRcdF0pO1xuXHRcdHN0cmljdEVxdWFsKGxpc3Quc3RhdHVzZXNbMF0uaWNvbiEuaWQsIENvZGljb24ucGxheS5pZCwgJ2xvYWRpbmd+c3BpbiBzaG91bGQgYmUgY29udmVydGVkIHRvIHBsYXknKTtcblx0XHRsaXN0LmFkZCh7IGlkOiAnd2FybmluZycsIHNldmVyaXR5OiBTZXZlcml0eS5XYXJuaW5nLCBpY29uOiBUaGVtZUljb24ubW9kaWZ5KENvZGljb24uemFwLCAnc3BpbicpIH0pO1xuXHRcdHN0YXR1c2VzRXF1YWwobGlzdCwgW1xuXHRcdFx0WydpbmZvJywgU2V2ZXJpdHkuSW5mb10sXG5cdFx0XHRbJ3dhcm5pbmcnLCBTZXZlcml0eS5XYXJuaW5nXVxuXHRcdF0pO1xuXHRcdHN0cmljdEVxdWFsKGxpc3Quc3RhdHVzZXNbMV0uaWNvbiEuaWQsIENvZGljb24uemFwLmlkLCAnemFwfnNwaW4gc2hvdWxkIGhhdmUgYW5pbWF0aW9uIHJlbW92ZWQgb25seScpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZGQgc2hvdWxkIGZpcmUgb25EaWRSZW1vdmVTdGF0dXMgaWYgc2FtZSBzdGF0dXMgaWQgd2l0aCBhIGRpZmZlcmVudCBvYmplY3QgcmVmZXJlbmNlIHdhcyBhZGRlZCcsICgpID0+IHtcblx0XHRjb25zdCBldmVudENhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdHN0b3JlLmFkZChsaXN0Lm9uRGlkQWRkU3RhdHVzKCgpID0+IGV2ZW50Q2FsbHMucHVzaCgnYWRkJykpKTtcblx0XHRzdG9yZS5hZGQobGlzdC5vbkRpZFJlbW92ZVN0YXR1cygoKSA9PiBldmVudENhbGxzLnB1c2goJ3JlbW92ZScpKSk7XG5cdFx0bGlzdC5hZGQoeyBpZDogJ3Rlc3QnLCBzZXZlcml0eTogU2V2ZXJpdHkuSW5mbyB9KTtcblx0XHRsaXN0LmFkZCh7IGlkOiAndGVzdCcsIHNldmVyaXR5OiBTZXZlcml0eS5JbmZvIH0pO1xuXHRcdGRlZXBTdHJpY3RFcXVhbChldmVudENhbGxzLCBbXG5cdFx0XHQnYWRkJyxcblx0XHRcdCdyZW1vdmUnLFxuXHRcdFx0J2FkZCdcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlJywgKCkgPT4ge1xuXHRcdGxpc3QuYWRkKHsgaWQ6ICdpbmZvJywgc2V2ZXJpdHk6IFNldmVyaXR5LkluZm8gfSk7XG5cdFx0bGlzdC5hZGQoeyBpZDogJ3dhcm5pbmcnLCBzZXZlcml0eTogU2V2ZXJpdHkuV2FybmluZyB9KTtcblx0XHRsaXN0LmFkZCh7IGlkOiAnZXJyb3InLCBzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IgfSk7XG5cdFx0c3RhdHVzZXNFcXVhbChsaXN0LCBbXG5cdFx0XHRbJ2luZm8nLCBTZXZlcml0eS5JbmZvXSxcblx0XHRcdFsnd2FybmluZycsIFNldmVyaXR5Lldhcm5pbmddLFxuXHRcdFx0WydlcnJvcicsIFNldmVyaXR5LkVycm9yXVxuXHRcdF0pO1xuXHRcdGxpc3QucmVtb3ZlKCd3YXJuaW5nJyk7XG5cdFx0c3RhdHVzZXNFcXVhbChsaXN0LCBbXG5cdFx0XHRbJ2luZm8nLCBTZXZlcml0eS5JbmZvXSxcblx0XHRcdFsnZXJyb3InLCBTZXZlcml0eS5FcnJvcl1cblx0XHRdKTtcblx0XHRsaXN0LnJlbW92ZSgnaW5mbycpO1xuXHRcdHN0YXR1c2VzRXF1YWwobGlzdCwgW1xuXHRcdFx0WydlcnJvcicsIFNldmVyaXR5LkVycm9yXVxuXHRcdF0pO1xuXHRcdGxpc3QucmVtb3ZlKCdlcnJvcicpO1xuXHRcdHN0YXR1c2VzRXF1YWwobGlzdCwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCd0b2dnbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdHVzID0geyBpZDogJ2luZm8nLCBzZXZlcml0eTogU2V2ZXJpdHkuSW5mbyB9O1xuXHRcdGxpc3QudG9nZ2xlKHN0YXR1cywgdHJ1ZSk7XG5cdFx0c3RhdHVzZXNFcXVhbChsaXN0LCBbXG5cdFx0XHRbJ2luZm8nLCBTZXZlcml0eS5JbmZvXVxuXHRcdF0pO1xuXHRcdGxpc3QudG9nZ2xlKHN0YXR1cywgZmFsc2UpO1xuXHRcdHN0YXR1c2VzRXF1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
