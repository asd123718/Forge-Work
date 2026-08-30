import assert from "assert";
import { isMarkdownString } from "../../../../../../base/common/htmlContent.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import {
  AgentHostPermissionMode,
  IAgentHostResourceService
} from "../../../../../../platform/agentHost/common/agentHostResourceService.js";
import { AGENT_HOST_SCHEME, agentHostAuthority } from "../../../../../../platform/agentHost/common/agentHostUri.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { Event } from "../../../../../../base/common/event.js";
import { MockLabelService } from "../../../../../services/label/test/common/mockLabelService.js";
import { AgentHostPermissionUiContribution } from "../../../browser/agentSessions/agentHost/agentHostPermissionUiContribution.js";
import {
  ChatInputNotificationActionKind,
  IChatInputNotificationService
} from "../../../browser/widget/input/chatInputNotificationService.js";
class FakePermissionService extends Disposable {
  constructor() {
    super(...arguments);
    this.pending = observableValue("pending", []);
    this.allPending = this.pending;
    this.list = async () => {
      throw new Error("not implemented");
    };
    this.read = async () => {
      throw new Error("not implemented");
    };
    this.write = async () => {
      throw new Error("not implemented");
    };
    this.del = async () => {
      throw new Error("not implemented");
    };
    this.move = async () => {
      throw new Error("not implemented");
    };
    this.copy = async () => {
      throw new Error("not implemented");
    };
    this.resolve = async () => {
      throw new Error("not implemented");
    };
    this.mkdir = async () => {
      throw new Error("not implemented");
    };
    this.check = async () => true;
    this.request = async () => {
    };
    this.pendingFor = () => this.pending;
    this.findPending = (id) => this.pending.get().find((r) => r.id === id);
    this.grantImplicitRead = () => Disposable.None;
    this.connectionClosed = () => {
    };
  }
}
class FakeNotificationService {
  constructor() {
    this.onDidChange = Event.None;
    this.onDidDismiss = Event.None;
    this.setCalls = [];
    this.deleteCalls = [];
  }
  setNotification(notification) {
    this.setCalls.push(notification);
  }
  deleteNotification(id) {
    this.deleteCalls.push(id);
  }
  dismissNotification(_id) {
  }
  getActiveNotification() {
    return void 0;
  }
  handleMessageSent() {
  }
  announceRendered() {
  }
}
class StubLabelService extends MockLabelService {
  constructor() {
    super(...arguments);
    this._hostLabels = /* @__PURE__ */ new Map();
  }
  setHostName(address, name) {
    this._hostLabels.set(agentHostAuthority(address), name);
  }
  getHostLabel(scheme, authority) {
    if (scheme === AGENT_HOST_SCHEME && authority && this._hostLabels.has(authority)) {
      return this._hostLabels.get(authority);
    }
    return authority ?? "";
  }
}
function makePending(opts) {
  return {
    id: `req-${opts.address}-${opts.uri.toString()}`,
    address: opts.address,
    mode: opts.mode,
    uri: opts.uri,
    allow: () => {
    },
    allowAlways: () => {
    },
    deny: () => {
    }
  };
}
suite("AgentHostPermissionUiContribution", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let permissionService;
  let notificationService;
  let labelService;
  setup(() => {
    permissionService = disposables.add(new FakePermissionService());
    notificationService = new FakeNotificationService();
    labelService = new StubLabelService();
    labelService.setHostName("host:1234", "My Host");
  });
  function createContribution() {
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IAgentHostResourceService, permissionService);
    instantiationService.stub(IChatInputNotificationService, notificationService);
    instantiationService.stub(ILabelService, labelService);
    const contribution = instantiationService.createInstance(AgentHostPermissionUiContribution);
    disposables.add(contribution);
    return contribution;
  }
  test("renders a markdown notification with three actions when a request arrives", () => {
    createContribution();
    const request = makePending({
      address: "host:1234",
      mode: AgentHostPermissionMode.Read,
      uri: URI.file("/Users/me/.gitconfig")
    });
    permissionService.pending.set([request], void 0);
    assert.strictEqual(notificationService.setCalls.length, 1);
    const notification = notificationService.setCalls[0];
    assert.ok(isMarkdownString(notification.message), "message should be an IMarkdownString");
    const actions = notification.actions.filter((action) => action.kind === ChatInputNotificationActionKind.Command);
    assert.strictEqual(actions.length, notification.actions.length);
    assert.strictEqual(
      actions.map((action) => action.commandId).join(","),
      "_agentHost.permission.deny,_agentHost.permission.allow,_agentHost.permission.allowAlways"
    );
    for (const action of actions) {
      assert.deepStrictEqual(action.commandArgs, [request.id], "each action carries the request id");
    }
  });
  test("clears the notification when the queue empties", () => {
    createContribution();
    const request = makePending({
      address: "host:1234",
      mode: AgentHostPermissionMode.Read,
      uri: URI.file("/etc/foo")
    });
    permissionService.pending.set([request], void 0);
    permissionService.pending.set([], void 0);
    assert.deepStrictEqual(
      notificationService.deleteCalls,
      ["agentHost.permissionRequest"]
    );
  });
  test('write-mode requests use a "wants to write" message', () => {
    createContribution();
    permissionService.pending.set([
      makePending({
        address: "host:1234",
        mode: AgentHostPermissionMode.Write,
        uri: URI.file("/etc/foo")
      })
    ], void 0);
    const text = notificationService.setCalls[0].message;
    const value = isMarkdownString(text) ? text.value : text;
    assert.match(value, /wants to write/);
    assert.match(value, /My Host/);
  });
  test('read-mode requests use a "wants to read" message', () => {
    createContribution();
    permissionService.pending.set([
      makePending({
        address: "host:1234",
        mode: AgentHostPermissionMode.Read,
        uri: URI.file("/etc/foo")
      })
    ], void 0);
    const text = notificationService.setCalls[0].message;
    const value = isMarkdownString(text) ? text.value : text;
    assert.match(value, /wants to read/);
  });
  test("paths are wrapped in a markdown code span using a fence longer than any embedded backticks", () => {
    createContribution();
    const uri = URI.file("/weird/`name`.txt");
    permissionService.pending.set([
      makePending({ address: "host:1234", mode: AgentHostPermissionMode.Read, uri })
    ], void 0);
    const text = notificationService.setCalls[0].message;
    const value = isMarkdownString(text) ? text.value : text;
    const match = value.match(/(`{2,})([^`]|`(?!\1))*\1/);
    assert.ok(match, `expected a code span fence, got: ${value}`);
    assert.ok(match[0].includes("`name`"), "path with embedded backticks should be inside the fence");
  });
  test("falls back to the raw address when no host entry is known", () => {
    createContribution();
    permissionService.pending.set([
      makePending({
        address: "unknown:9999",
        mode: AgentHostPermissionMode.Read,
        uri: URI.file("/etc/foo")
      })
    ], void 0);
    const text = notificationService.setCalls[0].message;
    const value = isMarkdownString(text) ? text.value : text;
    assert.match(value, /unknown:9999/);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50SG9zdFBlcm1pc3Npb25VaUNvbnRyaWJ1dGlvbi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgaXNNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBJU2V0dGFibGVPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7XG5cdEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlLFxuXHRJQWdlbnRIb3N0UmVzb3VyY2VTZXJ2aWNlLFxuXHRJUGVuZGluZ1Jlc291cmNlUmVxdWVzdCxcbn0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RSZXNvdXJjZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQUdFTlRfSE9TVF9TQ0hFTUUsIGFnZW50SG9zdEF1dGhvcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0VXJpLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBNb2NrTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvbGFiZWwvdGVzdC9jb21tb24vbW9ja0xhYmVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RQZXJtaXNzaW9uVWlDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdFBlcm1pc3Npb25VaUNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQge1xuXHRDaGF0SW5wdXROb3RpZmljYXRpb25BY3Rpb25LaW5kLFxuXHRJQ2hhdElucHV0Tm90aWZpY2F0aW9uLFxuXHRJQ2hhdElucHV0Tm90aWZpY2F0aW9uQ29tbWFuZEFjdGlvbixcblx0SUNoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2UsXG59IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2lucHV0L2NoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2UuanMnO1xuXG5jbGFzcyBGYWtlUGVybWlzc2lvblNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFnZW50SG9zdFJlc291cmNlU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRyZWFkb25seSBwZW5kaW5nOiBJU2V0dGFibGVPYnNlcnZhYmxlPHJlYWRvbmx5IElQZW5kaW5nUmVzb3VyY2VSZXF1ZXN0W10+ID0gb2JzZXJ2YWJsZVZhbHVlKCdwZW5kaW5nJywgW10pO1xuXHRyZWFkb25seSBhbGxQZW5kaW5nOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJUGVuZGluZ1Jlc291cmNlUmVxdWVzdFtdPiA9IHRoaXMucGVuZGluZztcblxuXHRsaXN0ID0gYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9O1xuXHRyZWFkID0gYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9O1xuXHR3cml0ZSA9IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfTtcblx0ZGVsID0gYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9O1xuXHRtb3ZlID0gYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9O1xuXHRjb3B5ID0gYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9O1xuXHRyZXNvbHZlID0gYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9O1xuXHRta2RpciA9IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfTtcblx0Y2hlY2sgPSBhc3luYyAoKSA9PiB0cnVlO1xuXHRyZXF1ZXN0ID0gYXN5bmMgKCkgPT4geyAvKiAqLyB9O1xuXHRwZW5kaW5nRm9yID0gKCkgPT4gdGhpcy5wZW5kaW5nO1xuXHRmaW5kUGVuZGluZyA9IChpZDogc3RyaW5nKSA9PiB0aGlzLnBlbmRpbmcuZ2V0KCkuZmluZChyID0+IHIuaWQgPT09IGlkKTtcblx0Z3JhbnRJbXBsaWNpdFJlYWQgPSAoKSA9PiBEaXNwb3NhYmxlLk5vbmU7XG5cdGNvbm5lY3Rpb25DbG9zZWQgPSAoKSA9PiB7IC8qICovIH07XG59XG5cbmNsYXNzIEZha2VOb3RpZmljYXRpb25TZXJ2aWNlIGltcGxlbWVudHMgSUNoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PHZvaWQ+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWREaXNtaXNzOiBFdmVudDxzdHJpbmc+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgc2V0Q2FsbHM6IElDaGF0SW5wdXROb3RpZmljYXRpb25bXSA9IFtdO1xuXHRyZWFkb25seSBkZWxldGVDYWxsczogc3RyaW5nW10gPSBbXTtcblxuXHRzZXROb3RpZmljYXRpb24obm90aWZpY2F0aW9uOiBJQ2hhdElucHV0Tm90aWZpY2F0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5zZXRDYWxscy5wdXNoKG5vdGlmaWNhdGlvbik7XG5cdH1cblx0ZGVsZXRlTm90aWZpY2F0aW9uKGlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLmRlbGV0ZUNhbGxzLnB1c2goaWQpO1xuXHR9XG5cdGRpc21pc3NOb3RpZmljYXRpb24oX2lkOiBzdHJpbmcpOiB2b2lkIHsgLyogKi8gfVxuXHRnZXRBY3RpdmVOb3RpZmljYXRpb24oKTogSUNoYXRJbnB1dE5vdGlmaWNhdGlvbiB8IHVuZGVmaW5lZCB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0aGFuZGxlTWVzc2FnZVNlbnQoKTogdm9pZCB7IC8qICovIH1cblx0YW5ub3VuY2VSZW5kZXJlZCgpOiB2b2lkIHsgLyogKi8gfVxufVxuXG4vKipcbiAqIE1vY2sgbGFiZWwgc2VydmljZSB0aGF0IHJlc29sdmVzIGhvc3QgbGFiZWxzIGZvciB0aGUge0BsaW5rIEFHRU5UX0hPU1RfU0NIRU1FfVxuICogYnkgbWFwcGluZyBhdXRob3JpdGllcyBlbmNvZGVkIHZpYSB7QGxpbmsgYWdlbnRIb3N0QXV0aG9yaXR5fSB0byB0aGVcbiAqIGZyaWVuZGx5IG5hbWUgcmVnaXN0ZXJlZCB0aHJvdWdoIHtAbGluayBTdHViTGFiZWxTZXJ2aWNlLnNldEhvc3ROYW1lfS5cbiAqIFVua25vd24gYXV0aG9yaXRpZXMgYXJlIHJldHVybmVkIHVuY2hhbmdlZC5cbiAqL1xuY2xhc3MgU3R1YkxhYmVsU2VydmljZSBleHRlbmRzIE1vY2tMYWJlbFNlcnZpY2Uge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ob3N0TGFiZWxzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblxuXHRzZXRIb3N0TmFtZShhZGRyZXNzOiBzdHJpbmcsIG5hbWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2hvc3RMYWJlbHMuc2V0KGFnZW50SG9zdEF1dGhvcml0eShhZGRyZXNzKSwgbmFtZSk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRIb3N0TGFiZWwoc2NoZW1lOiBzdHJpbmcsIGF1dGhvcml0eT86IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0aWYgKHNjaGVtZSA9PT0gQUdFTlRfSE9TVF9TQ0hFTUUgJiYgYXV0aG9yaXR5ICYmIHRoaXMuX2hvc3RMYWJlbHMuaGFzKGF1dGhvcml0eSkpIHtcblx0XHRcdHJldHVybiB0aGlzLl9ob3N0TGFiZWxzLmdldChhdXRob3JpdHkpITtcblx0XHR9XG5cdFx0cmV0dXJuIGF1dGhvcml0eSA/PyAnJztcblx0fVxufVxuXG5mdW5jdGlvbiBtYWtlUGVuZGluZyhvcHRzOiB7XG5cdGFkZHJlc3M6IHN0cmluZztcblx0bW9kZTogQWdlbnRIb3N0UGVybWlzc2lvbk1vZGU7XG5cdHVyaTogVVJJO1xufSk6IElQZW5kaW5nUmVzb3VyY2VSZXF1ZXN0IHtcblx0cmV0dXJuIHtcblx0XHRpZDogYHJlcS0ke29wdHMuYWRkcmVzc30tJHtvcHRzLnVyaS50b1N0cmluZygpfWAsXG5cdFx0YWRkcmVzczogb3B0cy5hZGRyZXNzLFxuXHRcdG1vZGU6IG9wdHMubW9kZSxcblx0XHR1cmk6IG9wdHMudXJpLFxuXHRcdGFsbG93OiAoKSA9PiB7IC8qICovIH0sXG5cdFx0YWxsb3dBbHdheXM6ICgpID0+IHsgLyogKi8gfSxcblx0XHRkZW55OiAoKSA9PiB7IC8qICovIH0sXG5cdH07XG59XG5cbnN1aXRlKCdBZ2VudEhvc3RQZXJtaXNzaW9uVWlDb250cmlidXRpb24nLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IHBlcm1pc3Npb25TZXJ2aWNlOiBGYWtlUGVybWlzc2lvblNlcnZpY2U7XG5cdGxldCBub3RpZmljYXRpb25TZXJ2aWNlOiBGYWtlTm90aWZpY2F0aW9uU2VydmljZTtcblx0bGV0IGxhYmVsU2VydmljZTogU3R1YkxhYmVsU2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0cGVybWlzc2lvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZha2VQZXJtaXNzaW9uU2VydmljZSgpKTtcblx0XHRub3RpZmljYXRpb25TZXJ2aWNlID0gbmV3IEZha2VOb3RpZmljYXRpb25TZXJ2aWNlKCk7XG5cdFx0bGFiZWxTZXJ2aWNlID0gbmV3IFN0dWJMYWJlbFNlcnZpY2UoKTtcblx0XHRsYWJlbFNlcnZpY2Uuc2V0SG9zdE5hbWUoJ2hvc3Q6MTIzNCcsICdNeSBIb3N0Jyk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZUNvbnRyaWJ1dGlvbigpOiBBZ2VudEhvc3RQZXJtaXNzaW9uVWlDb250cmlidXRpb24ge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRIb3N0UmVzb3VyY2VTZXJ2aWNlLCBwZXJtaXNzaW9uU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGFiZWxTZXJ2aWNlLCBsYWJlbFNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdFBlcm1pc3Npb25VaUNvbnRyaWJ1dGlvbik7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGNvbnRyaWJ1dGlvbiBhcyB1bmtub3duIGFzIElEaXNwb3NhYmxlKTtcblx0XHRyZXR1cm4gY29udHJpYnV0aW9uO1xuXHR9XG5cblx0dGVzdCgncmVuZGVycyBhIG1hcmtkb3duIG5vdGlmaWNhdGlvbiB3aXRoIHRocmVlIGFjdGlvbnMgd2hlbiBhIHJlcXVlc3QgYXJyaXZlcycsICgpID0+IHtcblx0XHRjcmVhdGVDb250cmlidXRpb24oKTtcblx0XHRjb25zdCByZXF1ZXN0ID0gbWFrZVBlbmRpbmcoe1xuXHRcdFx0YWRkcmVzczogJ2hvc3Q6MTIzNCcsXG5cdFx0XHRtb2RlOiBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5SZWFkLFxuXHRcdFx0dXJpOiBVUkkuZmlsZSgnL1VzZXJzL21lLy5naXRjb25maWcnKSxcblx0XHR9KTtcblxuXHRcdHBlcm1pc3Npb25TZXJ2aWNlLnBlbmRpbmcuc2V0KFtyZXF1ZXN0XSwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RpZmljYXRpb25TZXJ2aWNlLnNldENhbGxzLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uID0gbm90aWZpY2F0aW9uU2VydmljZS5zZXRDYWxsc1swXTtcblx0XHRhc3NlcnQub2soaXNNYXJrZG93blN0cmluZyhub3RpZmljYXRpb24ubWVzc2FnZSksICdtZXNzYWdlIHNob3VsZCBiZSBhbiBJTWFya2Rvd25TdHJpbmcnKTtcblx0XHRjb25zdCBhY3Rpb25zID0gbm90aWZpY2F0aW9uLmFjdGlvbnMuZmlsdGVyKChhY3Rpb24pOiBhY3Rpb24gaXMgSUNoYXRJbnB1dE5vdGlmaWNhdGlvbkNvbW1hbmRBY3Rpb24gPT4gYWN0aW9uLmtpbmQgPT09IENoYXRJbnB1dE5vdGlmaWNhdGlvbkFjdGlvbktpbmQuQ29tbWFuZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnMubGVuZ3RoLCBub3RpZmljYXRpb24uYWN0aW9ucy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGFjdGlvbnMubWFwKGFjdGlvbiA9PiBhY3Rpb24uY29tbWFuZElkKS5qb2luKCcsJyksXG5cdFx0XHQnX2FnZW50SG9zdC5wZXJtaXNzaW9uLmRlbnksX2FnZW50SG9zdC5wZXJtaXNzaW9uLmFsbG93LF9hZ2VudEhvc3QucGVybWlzc2lvbi5hbGxvd0Fsd2F5cycsXG5cdFx0KTtcblx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBhY3Rpb25zKSB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbi5jb21tYW5kQXJncywgW3JlcXVlc3QuaWRdLCAnZWFjaCBhY3Rpb24gY2FycmllcyB0aGUgcmVxdWVzdCBpZCcpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnY2xlYXJzIHRoZSBub3RpZmljYXRpb24gd2hlbiB0aGUgcXVldWUgZW1wdGllcycsICgpID0+IHtcblx0XHRjcmVhdGVDb250cmlidXRpb24oKTtcblx0XHRjb25zdCByZXF1ZXN0ID0gbWFrZVBlbmRpbmcoe1xuXHRcdFx0YWRkcmVzczogJ2hvc3Q6MTIzNCcsXG5cdFx0XHRtb2RlOiBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5SZWFkLFxuXHRcdFx0dXJpOiBVUkkuZmlsZSgnL2V0Yy9mb28nKSxcblx0XHR9KTtcblx0XHRwZXJtaXNzaW9uU2VydmljZS5wZW5kaW5nLnNldChbcmVxdWVzdF0sIHVuZGVmaW5lZCk7XG5cblx0XHRwZXJtaXNzaW9uU2VydmljZS5wZW5kaW5nLnNldChbXSwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmRlbGV0ZUNhbGxzLFxuXHRcdFx0WydhZ2VudEhvc3QucGVybWlzc2lvblJlcXVlc3QnXSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZS1tb2RlIHJlcXVlc3RzIHVzZSBhIFwid2FudHMgdG8gd3JpdGVcIiBtZXNzYWdlJywgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyaWJ1dGlvbigpO1xuXHRcdHBlcm1pc3Npb25TZXJ2aWNlLnBlbmRpbmcuc2V0KFtcblx0XHRcdG1ha2VQZW5kaW5nKHtcblx0XHRcdFx0YWRkcmVzczogJ2hvc3Q6MTIzNCcsXG5cdFx0XHRcdG1vZGU6IEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlLldyaXRlLFxuXHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvZXRjL2ZvbycpLFxuXHRcdFx0fSksXG5cdFx0XSwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IHRleHQgPSBub3RpZmljYXRpb25TZXJ2aWNlLnNldENhbGxzWzBdLm1lc3NhZ2U7XG5cdFx0Y29uc3QgdmFsdWUgPSBpc01hcmtkb3duU3RyaW5nKHRleHQpID8gdGV4dC52YWx1ZSA6IHRleHQ7XG5cdFx0YXNzZXJ0Lm1hdGNoKHZhbHVlLCAvd2FudHMgdG8gd3JpdGUvKTtcblx0XHRhc3NlcnQubWF0Y2godmFsdWUsIC9NeSBIb3N0Lyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWQtbW9kZSByZXF1ZXN0cyB1c2UgYSBcIndhbnRzIHRvIHJlYWRcIiBtZXNzYWdlJywgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyaWJ1dGlvbigpO1xuXHRcdHBlcm1pc3Npb25TZXJ2aWNlLnBlbmRpbmcuc2V0KFtcblx0XHRcdG1ha2VQZW5kaW5nKHtcblx0XHRcdFx0YWRkcmVzczogJ2hvc3Q6MTIzNCcsXG5cdFx0XHRcdG1vZGU6IEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlLlJlYWQsXG5cdFx0XHRcdHVyaTogVVJJLmZpbGUoJy9ldGMvZm9vJyksXG5cdFx0XHR9KSxcblx0XHRdLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgdGV4dCA9IG5vdGlmaWNhdGlvblNlcnZpY2Uuc2V0Q2FsbHNbMF0ubWVzc2FnZTtcblx0XHRjb25zdCB2YWx1ZSA9IGlzTWFya2Rvd25TdHJpbmcodGV4dCkgPyB0ZXh0LnZhbHVlIDogdGV4dDtcblx0XHRhc3NlcnQubWF0Y2godmFsdWUsIC93YW50cyB0byByZWFkLyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhdGhzIGFyZSB3cmFwcGVkIGluIGEgbWFya2Rvd24gY29kZSBzcGFuIHVzaW5nIGEgZmVuY2UgbG9uZ2VyIHRoYW4gYW55IGVtYmVkZGVkIGJhY2t0aWNrcycsICgpID0+IHtcblx0XHRjcmVhdGVDb250cmlidXRpb24oKTtcblx0XHQvLyBQYXRoIGNvbnRhaW5pbmcgYSBzaW5nbGUgYmFja3RpY2sgXHUyMDE0IHRoZSBmZW5jZSBtdXN0IGJlIGF0IGxlYXN0XG5cdFx0Ly8gdHdvIGJhY2t0aWNrcyBzbyB0aGUgZW1iZWRkZWQgb25lIGRvZXNuJ3QgY2xvc2UgdGhlIHNwYW4uXG5cdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy93ZWlyZC9gbmFtZWAudHh0Jyk7XG5cdFx0cGVybWlzc2lvblNlcnZpY2UucGVuZGluZy5zZXQoW1xuXHRcdFx0bWFrZVBlbmRpbmcoeyBhZGRyZXNzOiAnaG9zdDoxMjM0JywgbW9kZTogQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUuUmVhZCwgdXJpIH0pLFxuXHRcdF0sIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCB0ZXh0ID0gbm90aWZpY2F0aW9uU2VydmljZS5zZXRDYWxsc1swXS5tZXNzYWdlO1xuXHRcdGNvbnN0IHZhbHVlID0gaXNNYXJrZG93blN0cmluZyh0ZXh0KSA/IHRleHQudmFsdWUgOiB0ZXh0O1xuXHRcdC8vIEZpbmQgdGhlIG9wZW5pbmcgZmVuY2U7IGl0IG11c3QgYmUgXHUyMjY1MiBiYWNrdGlja3MgYW5kIHRoZSBwYXRoIG11c3QgZm9sbG93IGl0LlxuXHRcdGNvbnN0IG1hdGNoID0gdmFsdWUubWF0Y2goLyhgezIsfSkoW15gXXxgKD8hXFwxKSkqXFwxLyk7XG5cdFx0YXNzZXJ0Lm9rKG1hdGNoLCBgZXhwZWN0ZWQgYSBjb2RlIHNwYW4gZmVuY2UsIGdvdDogJHt2YWx1ZX1gKTtcblx0XHRhc3NlcnQub2sobWF0Y2ghWzBdLmluY2x1ZGVzKCdgbmFtZWAnKSwgJ3BhdGggd2l0aCBlbWJlZGRlZCBiYWNrdGlja3Mgc2hvdWxkIGJlIGluc2lkZSB0aGUgZmVuY2UnKTtcblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayB0byB0aGUgcmF3IGFkZHJlc3Mgd2hlbiBubyBob3N0IGVudHJ5IGlzIGtub3duJywgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyaWJ1dGlvbigpO1xuXHRcdHBlcm1pc3Npb25TZXJ2aWNlLnBlbmRpbmcuc2V0KFtcblx0XHRcdG1ha2VQZW5kaW5nKHtcblx0XHRcdFx0YWRkcmVzczogJ3Vua25vd246OTk5OScsXG5cdFx0XHRcdG1vZGU6IEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlLlJlYWQsXG5cdFx0XHRcdHVyaTogVVJJLmZpbGUoJy9ldGMvZm9vJyksXG5cdFx0XHR9KSxcblx0XHRdLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgdGV4dCA9IG5vdGlmaWNhdGlvblNlcnZpY2Uuc2V0Q2FsbHNbMF0ubWVzc2FnZTtcblx0XHRjb25zdCB2YWx1ZSA9IGlzTWFya2Rvd25TdHJpbmcodGV4dCkgPyB0ZXh0LnZhbHVlIDogdGV4dDtcblx0XHRhc3NlcnQubWF0Y2godmFsdWUsIC91bmtub3duOjk5OTkvKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGtCQUErQjtBQUN4QyxTQUEyQyx1QkFBdUI7QUFDbEUsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hEO0FBQUEsRUFDQztBQUFBLEVBQ0E7QUFBQSxPQUVNO0FBQ1AsU0FBUyxtQkFBbUIsMEJBQTBCO0FBQ3RELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsYUFBYTtBQUN0QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHlDQUF5QztBQUNsRDtBQUFBLEVBQ0M7QUFBQSxFQUdBO0FBQUEsT0FDTTtBQUVQLE1BQU0sOEJBQThCLFdBQWdEO0FBQUEsRUFBcEY7QUFBQTtBQUVDLFNBQVMsVUFBbUUsZ0JBQWdCLFdBQVcsQ0FBQyxDQUFDO0FBQ3pHLFNBQVMsYUFBOEQsS0FBSztBQUU1RSxnQkFBTyxZQUFZO0FBQUUsWUFBTSxJQUFJLE1BQU0saUJBQWlCO0FBQUEsSUFBRztBQUN6RCxnQkFBTyxZQUFZO0FBQUUsWUFBTSxJQUFJLE1BQU0saUJBQWlCO0FBQUEsSUFBRztBQUN6RCxpQkFBUSxZQUFZO0FBQUUsWUFBTSxJQUFJLE1BQU0saUJBQWlCO0FBQUEsSUFBRztBQUMxRCxlQUFNLFlBQVk7QUFBRSxZQUFNLElBQUksTUFBTSxpQkFBaUI7QUFBQSxJQUFHO0FBQ3hELGdCQUFPLFlB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
