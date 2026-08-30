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
import assert from "assert";
import { Separator } from "../../../../../base/common/actions.js";
import { Event } from "../../../../../base/common/event.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
import { IMenuService } from "../../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { IStorageService } from "../../../../../platform/storage/common/storage.js";
import { IUpdateService, State } from "../../../../../platform/update/common/update.js";
import { IWorkspacesService } from "../../../../../platform/workspaces/common/workspaces.js";
import { MenubarControl } from "../../../../browser/parts/titlebar/menubarControl.js";
import { IWorkbenchEnvironmentService } from "../../../../services/environment/common/environmentService.js";
import { IHostService } from "../../../../services/host/browser/host.js";
import { IPreferencesService } from "../../../../services/preferences/common/preferences.js";
import { TestMenuService, workbenchInstantiationService } from "../../workbenchTestServices.js";
class TestMenubarMenuService extends TestMenuService {
  createMenu() {
    return {
      onDidChange: Event.None,
      dispose: () => {
      },
      getActions: () => [["", []]]
    };
  }
}
let TestMenubarControl = class extends MenubarControl {
  constructor(menuService, workspacesService, contextKeyService, keybindingService, configurationService, labelService, updateService, storageService, notificationService, preferencesService, environmentService, accessibilityService, hostService, commandService) {
    super(menuService, workspacesService, contextKeyService, keybindingService, configurationService, labelService, updateService, storageService, notificationService, preferencesService, environmentService, accessibilityService, hostService, commandService);
  }
  doUpdateMenubar(_firstTime) {
  }
  getOpenRecentActionsForTest(recentlyOpened) {
    this.recentlyOpened = recentlyOpened;
    return this.getOpenRecentActions().filter((action) => !(action instanceof Separator));
  }
};
TestMenubarControl = __decorateClass([
  __decorateParam(0, IMenuService),
  __decorateParam(1, IWorkspacesService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, ILabelService),
  __decorateParam(6, IUpdateService),
  __decorateParam(7, IStorageService),
  __decorateParam(8, INotificationService),
  __decorateParam(9, IPreferencesService),
  __decorateParam(10, IWorkbenchEnvironmentService),
  __decorateParam(11, IAccessibilityService),
  __decorateParam(12, IHostService),
  __decorateParam(13, ICommandService)
], TestMenubarControl);
suite("MenubarControl", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("bounds open recent menu labels without splitting surrogate pairs", () => {
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    instantiationService.stub(IMenuService, new TestMenubarMenuService());
    instantiationService.stub(IUpdateService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onStateChange = Event.None;
        this.state = State.Uninitialized;
      }
    }());
    instantiationService.stub(IPreferencesService, new class extends mock() {
    }());
    instantiationService.stub(ICommandService, new class extends mock() {
    }());
    const control = disposables.add(instantiationService.createInstance(TestMenubarControl));
    const folderUri = URI.file("folder");
    const workspaceUri = URI.file("workspace.code-workspace");
    const fileUri = URI.file("file.txt");
    const folderLabel = `${"a".repeat(58)}\u{1F600}${"b".repeat(61)}`;
    const workspaceLabel = "workspace.code-workspace";
    const fileLabel = `${"a".repeat(60)}\u{1F600}${"b".repeat(59)}`;
    const actions = control.getOpenRecentActionsForTest({
      workspaces: [
        { folderUri, label: folderLabel },
        { workspace: { id: "workspace", configPath: workspaceUri }, label: workspaceLabel }
      ],
      files: [{ fileUri, label: fileLabel, remoteAuthority: "remote" }]
    });
    assert.deepStrictEqual(actions.map((action) => ({
      label: action.label,
      labelLength: action.label.length,
      uri: action.uri,
      remoteAuthority: action.remoteAuthority
    })), [
      { label: `${"a".repeat(58)}\u2026${"b".repeat(60)}`, labelLength: 119, uri: folderUri, remoteAuthority: void 0 },
      { label: workspaceLabel, labelLength: workspaceLabel.length, uri: workspaceUri, remoteAuthority: void 0 },
      { label: `${"a".repeat(59)}\u2026${"b".repeat(59)}`, labelLength: 119, uri: fileUri, remoteAuthority: "remote" }
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHRlc3RcXGJyb3dzZXJcXHBhcnRzXFx0aXRsZWJhclxcbWVudWJhckNvbnRyb2wudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFNlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgSU1lbnUsIElNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElVcGRhdGVTZXJ2aWNlLCBTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VwZGF0ZS9jb21tb24vdXBkYXRlLmpzJztcbmltcG9ydCB7IElSZWNlbnRseU9wZW5lZCwgSVdvcmtzcGFjZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlcy9jb21tb24vd29ya3NwYWNlcy5qcyc7XG5pbXBvcnQgeyBJT3BlblJlY2VudEFjdGlvbiwgTWVudWJhckNvbnRyb2wgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3BhcnRzL3RpdGxlYmFyL21lbnViYXJDb250cm9sLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IElQcmVmZXJlbmNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgVGVzdE1lbnVTZXJ2aWNlLCB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5cbmNsYXNzIFRlc3RNZW51YmFyTWVudVNlcnZpY2UgZXh0ZW5kcyBUZXN0TWVudVNlcnZpY2Uge1xuXHRvdmVycmlkZSBjcmVhdGVNZW51KCk6IElNZW51IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBbWycnLCBbXV1dXG5cdFx0fTtcblx0fVxufVxuXG5jbGFzcyBUZXN0TWVudWJhckNvbnRyb2wgZXh0ZW5kcyBNZW51YmFyQ29udHJvbCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTWVudVNlcnZpY2UgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASVdvcmtzcGFjZXNTZXJ2aWNlIHdvcmtzcGFjZXNTZXJ2aWNlOiBJV29ya3NwYWNlc1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJVXBkYXRlU2VydmljZSB1cGRhdGVTZXJ2aWNlOiBJVXBkYXRlU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJUHJlZmVyZW5jZXNTZXJ2aWNlIHByZWZlcmVuY2VzU2VydmljZTogSVByZWZlcmVuY2VzU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIobWVudVNlcnZpY2UsIHdvcmtzcGFjZXNTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwga2V5YmluZGluZ1NlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBsYWJlbFNlcnZpY2UsIHVwZGF0ZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBub3RpZmljYXRpb25TZXJ2aWNlLCBwcmVmZXJlbmNlc1NlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwgYWNjZXNzaWJpbGl0eVNlcnZpY2UsIGhvc3RTZXJ2aWNlLCBjb21tYW5kU2VydmljZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZG9VcGRhdGVNZW51YmFyKF9maXJzdFRpbWU6IGJvb2xlYW4pOiB2b2lkIHsgfVxuXG5cdGdldE9wZW5SZWNlbnRBY3Rpb25zRm9yVGVzdChyZWNlbnRseU9wZW5lZDogSVJlY2VudGx5T3BlbmVkKTogSU9wZW5SZWNlbnRBY3Rpb25bXSB7XG5cdFx0dGhpcy5yZWNlbnRseU9wZW5lZCA9IHJlY2VudGx5T3BlbmVkO1xuXG5cdFx0cmV0dXJuIHRoaXMuZ2V0T3BlblJlY2VudEFjdGlvbnMoKS5maWx0ZXIoKGFjdGlvbik6IGFjdGlvbiBpcyBJT3BlblJlY2VudEFjdGlvbiA9PiAhKGFjdGlvbiBpbnN0YW5jZW9mIFNlcGFyYXRvcikpO1xuXHR9XG59XG5cbnN1aXRlKCdNZW51YmFyQ29udHJvbCcsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdib3VuZHMgb3BlbiByZWNlbnQgbWVudSBsYWJlbHMgd2l0aG91dCBzcGxpdHRpbmcgc3Vycm9nYXRlIHBhaXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBkaXNwb3NhYmxlcyk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTWVudVNlcnZpY2UsIG5ldyBUZXN0TWVudWJhck1lbnVTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVwZGF0ZVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVVwZGF0ZVNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25TdGF0ZUNoYW5nZSA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBzdGF0ZSA9IFN0YXRlLlVuaW5pdGlhbGl6ZWQ7XG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJlZmVyZW5jZXNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElQcmVmZXJlbmNlc1NlcnZpY2U+KCkgeyB9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb21tYW5kU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ29tbWFuZFNlcnZpY2U+KCkgeyB9KTtcblxuXHRcdGNvbnN0IGNvbnRyb2wgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdE1lbnViYXJDb250cm9sKSk7XG5cdFx0Y29uc3QgZm9sZGVyVXJpID0gVVJJLmZpbGUoJ2ZvbGRlcicpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZVVyaSA9IFVSSS5maWxlKCd3b3Jrc3BhY2UuY29kZS13b3Jrc3BhY2UnKTtcblx0XHRjb25zdCBmaWxlVXJpID0gVVJJLmZpbGUoJ2ZpbGUudHh0Jyk7XG5cdFx0Y29uc3QgZm9sZGVyTGFiZWwgPSBgJHsnYScucmVwZWF0KDU4KX1cdUQ4M0RcdURFMDAkeydiJy5yZXBlYXQoNjEpfWA7XG5cdFx0Y29uc3Qgd29ya3NwYWNlTGFiZWwgPSAnd29ya3NwYWNlLmNvZGUtd29ya3NwYWNlJztcblx0XHRjb25zdCBmaWxlTGFiZWwgPSBgJHsnYScucmVwZWF0KDYwKX1cdUQ4M0RcdURFMDAkeydiJy5yZXBlYXQoNTkpfWA7XG5cblx0XHRjb25zdCBhY3Rpb25zID0gY29udHJvbC5nZXRPcGVuUmVjZW50QWN0aW9uc0ZvclRlc3Qoe1xuXHRcdFx0d29ya3NwYWNlczogW1xuXHRcdFx0XHR7IGZvbGRlclVyaSwgbGFiZWw6IGZvbGRlckxhYmVsIH0sXG5cdFx0XHRcdHsgd29ya3NwYWNlOiB7IGlkOiAnd29ya3NwYWNlJywgY29uZmlnUGF0aDogd29ya3NwYWNlVXJpIH0sIGxhYmVsOiB3b3Jrc3BhY2VMYWJlbCB9XG5cdFx0XHRdLFxuXHRcdFx0ZmlsZXM6IFt7IGZpbGVVcmksIGxhYmVsOiBmaWxlTGFiZWwsIHJlbW90ZUF1dGhvcml0eTogJ3JlbW90ZScgfV1cblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0aW9ucy5tYXAoYWN0aW9uID0+ICh7XG5cdFx0XHRsYWJlbDogYWN0aW9uLmxhYmVsLFxuXHRcdFx0bGFiZWxMZW5ndGg6IGFjdGlvbi5sYWJlbC5sZW5ndGgsXG5cdFx0XHR1cmk6IGFjdGlvbi51cmksXG5cdFx0XHRyZW1vdGVBdXRob3JpdHk6IGFjdGlvbi5yZW1vdGVBdXRob3JpdHlcblx0XHR9KSksIFtcblx0XHRcdHsgbGFiZWw6IGAkeydhJy5yZXBlYXQoNTgpfVx1MjAyNiR7J2InLnJlcGVhdCg2MCl9YCwgbGFiZWxMZW5ndGg6IDExOSwgdXJpOiBmb2xkZXJVcmksIHJlbW90ZUF1dGhvcml0eTogdW5kZWZpbmVkIH0sXG5cdFx0XHR7IGxhYmVsOiB3b3Jrc3BhY2VMYWJlbCwgbGFiZWxMZW5ndGg6IHdvcmtzcGFjZUxhYmVsLmxlbmd0aCwgdXJpOiB3b3Jrc3BhY2VVcmksIHJlbW90ZUF1dGhvcml0eTogdW5kZWZpbmVkIH0sXG5cdFx0XHR7IGxhYmVsOiBgJHsnYScucmVwZWF0KDU5KX1cdTIwMjYkeydiJy5yZXBlYXQoNTkpfWAsIGxhYmVsTGVuZ3RoOiAxMTksIHVyaTogZmlsZVVyaSwgcmVtb3RlQXV0aG9yaXR5OiAncmVtb3RlJyB9XG5cdFx0XSk7XG5cdH0p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
