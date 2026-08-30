import assert from "assert";
import { ModifierKeyEmitter } from "../../../../../../base/browser/dom.js";
import { ActionRunner } from "../../../../../../base/common/actions.js";
import { DeferredPromise } from "../../../../../../base/common/async.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { toDisposable } from "../../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { MenuItemAction } from "../../../../../../platform/actions/common/actions.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { ForkConversationActionId } from "../../../browser/actions/chatForkActions.js";
import { ChatForkActionViewItem } from "../../../browser/widget/chatForkActionViewItem.js";
suite("ChatForkActionViewItem", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("shows a spinner while the fork action is running", async () => {
    store.add(toDisposable(() => ModifierKeyEmitter.disposeInstance()));
    const instantiationService = workbenchInstantiationService(void 0, store);
    const action = instantiationService.createInstance(MenuItemAction, {
      id: ForkConversationActionId,
      title: "Fork Conversation",
      tooltip: "Fork conversation from this point",
      icon: Codicon.repoForked
    }, void 0, void 0, void 0, void 0);
    const viewItem = store.add(instantiationService.createInstance(ChatForkActionViewItem, action, void 0));
    const container = document.createElement("div");
    viewItem.render(container);
    const operation = new DeferredPromise();
    const actionRunner = store.add(new class extends ActionRunner {
      async runAction(_action) {
        await operation.p;
      }
    }());
    viewItem.actionRunner = actionRunner;
    const forkIconClass = `codicon-${Codicon.repoForked.id}`;
    const loadingIconClass = `codicon-${Codicon.loading.id}`;
    const runPromise = actionRunner.run(action);
    const label = container.querySelector(".action-label");
    const icon = label?.querySelector(".chat-fork-action-icon");
    assert.ok(label);
    assert.ok(icon);
    assert.deepStrictEqual({
      during: {
        buttonCodicon: label.classList.contains("codicon"),
        buttonSpinning: label.classList.contains("codicon-modifier-spin"),
        forkIcon: icon.classList.contains(forkIconClass),
        loadingIcon: icon.classList.contains(loadingIconClass),
        iconSpinning: icon.classList.contains("codicon-modifier-spin"),
        busy: label.getAttribute("aria-busy"),
        label: label.getAttribute("aria-label")
      }
    }, {
      during: {
        buttonCodicon: true,
        buttonSpinning: false,
        forkIcon: false,
        loadingIcon: true,
        iconSpinning: true,
        busy: "true",
        label: "Forking conversation"
      }
    });
    operation.complete();
    await runPromise;
    assert.deepStrictEqual({
      buttonCodicon: label.classList.contains("codicon"),
      buttonSpinning: label.classList.contains("codicon-modifier-spin"),
      forkIcon: icon.classList.contains(forkIconClass),
      loadingIcon: icon.classList.contains(loadingIconClass),
      iconSpinning: icon.classList.contains("codicon-modifier-spin"),
      busy: label.getAttribute("aria-busy"),
      label: label.getAttribute("aria-label")
    }, {
      buttonCodicon: true,
      buttonSpinning: false,
      forkIcon: true,
      loadingIcon: false,
      iconSpinning: false,
      busy: "false",
      label: "Fork conversation from this point"
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcY2hhdEZvcmtBY3Rpb25WaWV3SXRlbS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgTW9kaWZpZXJLZXlFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25SdW5uZXIsIElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBNZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IEZvcmtDb252ZXJzYXRpb25BY3Rpb25JZCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWN0aW9ucy9jaGF0Rm9ya0FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhdEZvcmtBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRGb3JrQWN0aW9uVmlld0l0ZW0uanMnO1xuXG5zdWl0ZSgnQ2hhdEZvcmtBY3Rpb25WaWV3SXRlbScsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdzaG93cyBhIHNwaW5uZXIgd2hpbGUgdGhlIGZvcmsgYWN0aW9uIGlzIHJ1bm5pbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBNb2RpZmllcktleUVtaXR0ZXIuZGlzcG9zZUluc3RhbmNlKCkpKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgc3RvcmUpO1xuXHRcdGNvbnN0IGFjdGlvbiA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVJdGVtQWN0aW9uLCB7XG5cdFx0XHRpZDogRm9ya0NvbnZlcnNhdGlvbkFjdGlvbklkLFxuXHRcdFx0dGl0bGU6ICdGb3JrIENvbnZlcnNhdGlvbicsXG5cdFx0XHR0b29sdGlwOiAnRm9yayBjb252ZXJzYXRpb24gZnJvbSB0aGlzIHBvaW50Jyxcblx0XHRcdGljb246IENvZGljb24ucmVwb0ZvcmtlZCxcblx0XHR9LCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IHZpZXdJdGVtID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRGb3JrQWN0aW9uVmlld0l0ZW0sIGFjdGlvbiwgdW5kZWZpbmVkKSk7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dmlld0l0ZW0ucmVuZGVyKGNvbnRhaW5lcik7XG5cblx0XHRjb25zdCBvcGVyYXRpb24gPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3QgYWN0aW9uUnVubmVyID0gc3RvcmUuYWRkKG5ldyBjbGFzcyBleHRlbmRzIEFjdGlvblJ1bm5lciB7XG5cdFx0XHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgcnVuQWN0aW9uKF9hY3Rpb246IElBY3Rpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0YXdhaXQgb3BlcmF0aW9uLnA7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dmlld0l0ZW0uYWN0aW9uUnVubmVyID0gYWN0aW9uUnVubmVyO1xuXG5cdFx0Y29uc3QgZm9ya0ljb25DbGFzcyA9IGBjb2RpY29uLSR7Q29kaWNvbi5yZXBvRm9ya2VkLmlkfWA7XG5cdFx0Y29uc3QgbG9hZGluZ0ljb25DbGFzcyA9IGBjb2RpY29uLSR7Q29kaWNvbi5sb2FkaW5nLmlkfWA7XG5cdFx0Y29uc3QgcnVuUHJvbWlzZSA9IGFjdGlvblJ1bm5lci5ydW4oYWN0aW9uKTtcblx0XHRjb25zdCBsYWJlbCA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmFjdGlvbi1sYWJlbCcpO1xuXHRcdGNvbnN0IGljb24gPSBsYWJlbD8ucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5jaGF0LWZvcmstYWN0aW9uLWljb24nKTtcblx0XHRhc3NlcnQub2sobGFiZWwpO1xuXHRcdGFzc2VydC5vayhpY29uKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZHVyaW5nOiB7XG5cdFx0XHRcdGJ1dHRvbkNvZGljb246IGxhYmVsLmNsYXNzTGlzdC5jb250YWlucygnY29kaWNvbicpLFxuXHRcdFx0XHRidXR0b25TcGlubmluZzogbGFiZWwuY2xhc3NMaXN0LmNvbnRhaW5zKCdjb2RpY29uLW1vZGlmaWVyLXNwaW4nKSxcblx0XHRcdFx0Zm9ya0ljb246IGljb24uY2xhc3NMaXN0LmNvbnRhaW5zKGZvcmtJY29uQ2xhc3MpLFxuXHRcdFx0XHRsb2FkaW5nSWNvbjogaWNvbi5jbGFzc0xpc3QuY29udGFpbnMobG9hZGluZ0ljb25DbGFzcyksXG5cdFx0XHRcdGljb25TcGlubmluZzogaWNvbi5jbGFzc0xpc3QuY29udGFpbnMoJ2NvZGljb24tbW9kaWZpZXItc3BpbicpLFxuXHRcdFx0XHRidXN5OiBsYWJlbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtYnVzeScpLFxuXHRcdFx0XHRsYWJlbDogbGFiZWwuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyksXG5cdFx0XHR9LFxuXHRcdH0sIHtcblx0XHRcdGR1cmluZzoge1xuXHRcdFx0XHRidXR0b25Db2RpY29uOiB0cnVlLFxuXHRcdFx0XHRidXR0b25TcGlubmluZzogZmFsc2UsXG5cdFx0XHRcdGZvcmtJY29uOiBmYWxzZSxcblx0XHRcdFx0bG9hZGluZ0ljb246IHRydWUsXG5cdFx0XHRcdGljb25TcGlubmluZzogdHJ1ZSxcblx0XHRcdFx0YnVzeTogJ3RydWUnLFxuXHRcdFx0XHRsYWJlbDogJ0ZvcmtpbmcgY29udmVyc2F0aW9uJyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRvcGVyYXRpb24uY29tcGxldGUoKTtcblx0XHRhd2FpdCBydW5Qcm9taXNlO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRidXR0b25Db2RpY29uOiBsYWJlbC5jbGFzc0xpc3QuY29udGFpbnMoJ2NvZGljb24nKSxcblx0XHRcdGJ1dHRvblNwaW5uaW5nOiBsYWJlbC5jbGFzc0xpc3QuY29udGFpbnMoJ2NvZGljb24tbW9kaWZpZXItc3BpbicpLFxuXHRcdFx0Zm9ya0ljb246IGljb24uY2xhc3NMaXN0LmNvbnRhaW5zKGZvcmtJY29uQ2xhc3MpLFxuXHRcdFx0bG9hZGluZ0ljb246IGljb24uY2xhc3NMaXN0LmNvbnRhaW5zKGxvYWRpbmdJY29uQ2xhc3MpLFxuXHRcdFx0aWNvblNwaW5uaW5nOiBpY29uLmNsYXNzTGlzdC5jb250YWlucygnY29kaWNvbi1tb2RpZmllci1zcGluJyksXG5cdFx0XHRidXN5OiBsYWJlbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtYnVzeScpLFxuXHRcdFx0bGFiZWw6IGxhYmVsLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpLFxuXHRcdH0sIHtcblx0XHRcdGJ1dHRvbkNvZGljb246IHRydWUsXG5cdFx0XHRidXR0b25TcGlubmluZzogZmFsc2UsXG5cdFx0XHRmb3JrSWNvbjogdHJ1ZSxcblx0XHRcdGxvYWRpbmdJY29uOiBmYWxzZSxcblx0XHRcdGljb25TcGlubmluZzogZmFsc2UsXG5cdFx0XHRidXN5OiAnZmFsc2UnLFxuXHRcdFx0bGFiZWw6ICdGb3JrIGNvbnZlcnNhdGlvbiBmcm9tIHRoaXMgcG9pbnQnLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsb0JBQTZCO0FBQ3RDLFNBQVMsdUJBQXVCO0FBQ2hDLFNB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
