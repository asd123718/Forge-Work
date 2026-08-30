import assert from "assert";
import "../../browser/keyboardLayouts/en.darwin.js";
import "../../browser/keyboardLayouts/de.darwin.js";
import { KeyboardLayoutContribution } from "../../browser/keyboardLayouts/_.contribution.js";
import { BrowserKeyboardMapperFactoryBase } from "../../browser/keyboardLayoutService.js";
import { KeymapInfo } from "../../common/keymapInfo.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { TestNotificationService } from "../../../../../platform/notification/test/common/testNotificationService.js";
import { TestStorageService } from "../../../../test/common/workbenchTestServices.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
class TestKeyboardMapperFactory extends BrowserKeyboardMapperFactoryBase {
  constructor(configurationService, notificationService, storageService, commandService) {
    super(configurationService);
    const keymapInfos = KeyboardLayoutContribution.INSTANCE.layoutInfos;
    this._keymapInfos.push(...keymapInfos.map((info) => new KeymapInfo(info.layout, info.secondaryLayouts, info.mapping, info.isUserKeyboardLayout)));
    this._mru = this._keymapInfos;
    this._initialized = true;
    this.setLayoutFromBrowserAPI();
    const usLayout = this.getUSStandardLayout();
    if (usLayout) {
      this.setActiveKeyMapping(usLayout.mapping);
    }
  }
}
suite("keyboard layout loader", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let instance;
  setup(() => {
    instantiationService = new TestInstantiationService();
    const storageService = new TestStorageService();
    const notitifcationService = instantiationService.stub(INotificationService, new TestNotificationService());
    const configurationService = instantiationService.stub(IConfigurationService, new TestConfigurationService());
    const commandService = instantiationService.stub(ICommandService, {});
    ds.add(instantiationService);
    ds.add(storageService);
    instance = new TestKeyboardMapperFactory(configurationService, notitifcationService, storageService, commandService);
    ds.add(instance);
  });
  teardown(() => {
    instantiationService.dispose();
  });
  test("load default US keyboard layout", () => {
    assert.notStrictEqual(instance.activeKeyboardLayout, null);
  });
  test("isKeyMappingActive", () => {
    instance.setUSKeyboardLayout();
    assert.strictEqual(instance.isKeyMappingActive({
      KeyA: {
        value: "a",
        valueIsDeadKey: false,
        withShift: "A",
        withShiftIsDeadKey: false,
        withAltGr: "\xE5",
        withAltGrIsDeadKey: false,
        withShiftAltGr: "\xC5",
        withShiftAltGrIsDeadKey: false
      }
    }), true);
    assert.strictEqual(instance.isKeyMappingActive({
      KeyA: {
        value: "a",
        valueIsDeadKey: false,
        withShift: "A",
        withShiftIsDeadKey: false,
        withAltGr: "\xE5",
        withAltGrIsDeadKey: false,
        withShiftAltGr: "\xC5",
        withShiftAltGrIsDeadKey: false
      },
      KeyZ: {
        value: "z",
        valueIsDeadKey: false,
        withShift: "Z",
        withShiftIsDeadKey: false,
        withAltGr: "\u03A9",
        withAltGrIsDeadKey: false,
        withShiftAltGr: "\xB8",
        withShiftAltGrIsDeadKey: false
      }
    }), true);
    assert.strictEqual(instance.isKeyMappingActive({
      KeyZ: {
        value: "y",
        valueIsDeadKey: false,
        withShift: "Y",
        withShiftIsDeadKey: false,
        withAltGr: "\xA5",
        withAltGrIsDeadKey: false,
        withShiftAltGr: "\u0178",
        withShiftAltGrIsDeadKey: false
      }
    }), false);
  });
  test("Switch keymapping", () => {
    instance.setActiveKeyMapping({
      KeyZ: {
        value: "y",
        valueIsDeadKey: false,
        withShift: "Y",
        withShiftIsDeadKey: false,
        withAltGr: "\xA5",
        withAltGrIsDeadKey: false,
        withShiftAltGr: "\u0178",
        withShiftAltGrIsDeadKey: false
      }
    });
    assert.strictEqual(!!instance.activeKeyboardLayout.isUSStandard, false);
    assert.strictEqual(instance.isKeyMappingActive({
      KeyZ: {
        value: "y",
        valueIsDeadKey: false,
        withShift: "Y",
        withShiftIsDeadKey: false,
        withAltGr: "\xA5",
        withAltGrIsDeadKey: false,
        withShiftAltGr: "\u0178",
        withShiftAltGrIsDeadKey: false
      }
    }), true);
    instance.setUSKeyboardLayout();
    assert.strictEqual(instance.activeKeyboardLayout.isUSStandard, true);
  });
  test("Switch keyboard layout info", () => {
    instance.setKeyboardLayout("com.apple.keylayout.German");
    assert.strictEqual(!!instance.activeKeyboardLayout.isUSStandard, false);
    assert.strictEqual(instance.isKeyMappingActive({
      KeyZ: {
        value: "y",
        valueIsDeadKey: false,
        withShift: "Y",
        withShiftIsDeadKey: false,
        withAltGr: "\xA5",
        withAltGrIsDeadKey: false,
        withShiftAltGr: "\u0178",
        withShiftAltGrIsDeadKey: false
      }
    }), true);
    instance.setUSKeyboardLayout();
    assert.strictEqual(instance.activeKeyboardLayout.isUSStandard, true);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxrZXliaW5kaW5nXFx0ZXN0XFxicm93c2VyXFxicm93c2VyS2V5Ym9hcmRNYXBwZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgJy4uLy4uL2Jyb3dzZXIva2V5Ym9hcmRMYXlvdXRzL2VuLmRhcndpbi5qcyc7XG5pbXBvcnQgJy4uLy4uL2Jyb3dzZXIva2V5Ym9hcmRMYXlvdXRzL2RlLmRhcndpbi5qcyc7XG5pbXBvcnQgeyBLZXlib2FyZExheW91dENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uL2Jyb3dzZXIva2V5Ym9hcmRMYXlvdXRzL18uY29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IEJyb3dzZXJLZXlib2FyZE1hcHBlckZhY3RvcnlCYXNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9rZXlib2FyZExheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgS2V5bWFwSW5mbywgSUtleW1hcEluZm8gfSBmcm9tICcuLi8uLi9jb21tb24va2V5bWFwSW5mby5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL3Rlc3QvY29tbW9uL3Rlc3ROb3RpZmljYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuXG5jbGFzcyBUZXN0S2V5Ym9hcmRNYXBwZXJGYWN0b3J5IGV4dGVuZHMgQnJvd3NlcktleWJvYXJkTWFwcGVyRmFjdG9yeUJhc2Uge1xuXHRjb25zdHJ1Y3Rvcihjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSwgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSwgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSkge1xuXHRcdC8vIHN1cGVyKG5vdGlmaWNhdGlvblNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBjb21tYW5kU2VydmljZSk7XG5cdFx0c3VwZXIoY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qga2V5bWFwSW5mb3M6IElLZXltYXBJbmZvW10gPSBLZXlib2FyZExheW91dENvbnRyaWJ1dGlvbi5JTlNUQU5DRS5sYXlvdXRJbmZvcztcblx0XHR0aGlzLl9rZXltYXBJbmZvcy5wdXNoKC4uLmtleW1hcEluZm9zLm1hcChpbmZvID0+IChuZXcgS2V5bWFwSW5mbyhpbmZvLmxheW91dCwgaW5mby5zZWNvbmRhcnlMYXlvdXRzLCBpbmZvLm1hcHBpbmcsIGluZm8uaXNVc2VyS2V5Ym9hcmRMYXlvdXQpKSkpO1xuXHRcdHRoaXMuX21ydSA9IHRoaXMuX2tleW1hcEluZm9zO1xuXHRcdHRoaXMuX2luaXRpYWxpemVkID0gdHJ1ZTtcblx0XHR0aGlzLnNldExheW91dEZyb21Ccm93c2VyQVBJKCk7XG5cdFx0Y29uc3QgdXNMYXlvdXQgPSB0aGlzLmdldFVTU3RhbmRhcmRMYXlvdXQoKTtcblx0XHRpZiAodXNMYXlvdXQpIHtcblx0XHRcdHRoaXMuc2V0QWN0aXZlS2V5TWFwcGluZyh1c0xheW91dC5tYXBwaW5nKTtcblx0XHR9XG5cdH1cbn1cblxuc3VpdGUoJ2tleWJvYXJkIGxheW91dCBsb2FkZXInLCAoKSA9PiB7XG5cdGNvbnN0IGRzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgaW5zdGFuY2U6IFRlc3RLZXlib2FyZE1hcHBlckZhY3Rvcnk7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpO1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gbmV3IFRlc3RTdG9yYWdlU2VydmljZSgpO1xuXHRcdGNvbnN0IG5vdGl0aWZjYXRpb25TZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTm90aWZpY2F0aW9uU2VydmljZSwgbmV3IFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb21tYW5kU2VydmljZSwge30pO1xuXG5cdFx0ZHMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRkcy5hZGQoc3RvcmFnZVNlcnZpY2UpO1xuXG5cdFx0aW5zdGFuY2UgPSBuZXcgVGVzdEtleWJvYXJkTWFwcGVyRmFjdG9yeShjb25maWd1cmF0aW9uU2VydmljZSwgbm90aXRpZmNhdGlvblNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBjb21tYW5kU2VydmljZSk7XG5cdFx0ZHMuYWRkKGluc3RhbmNlKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnbG9hZCBkZWZhdWx0IFVTIGtleWJvYXJkIGxheW91dCcsICgpID0+IHtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoaW5zdGFuY2UuYWN0aXZlS2V5Ym9hcmRMYXlvdXQsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc0tleU1hcHBpbmdBY3RpdmUnLCAoKSA9PiB7XG5cdFx0aW5zdGFuY2Uuc2V0VVNLZXlib2FyZExheW91dCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnN0YW5jZS5pc0tleU1hcHBpbmdBY3RpdmUoe1xuXHRcdFx0S2V5QToge1xuXHRcdFx0XHR2YWx1ZTogJ2EnLFxuXHRcdFx0XHR2YWx1ZUlzRGVhZEtleTogZmFsc2UsXG5cdFx0XHRcdHdpdGhTaGlmdDogJ0EnLFxuXHRcdFx0XHR3aXRoU2hpZnRJc0RlYWRLZXk6IGZhbHNlLFxuXHRcdFx0XHR3aXRoQWx0R3I6ICdcdTAwRTUnLFxuXHRcdFx0XHR3aXRoQWx0R3JJc0RlYWRLZXk6IGZhbHNlLFxuXHRcdFx0XHR3aXRoU2hpZnRBbHRHcjogJ1x1MDBDNScsXG5cdFx0XHRcdHdpdGhTaGlmdEFsdEdySXNEZWFkS2V5OiBmYWxzZVxuXHRcdFx0fVxuXHRcdH0pLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnN0YW5jZS5pc0tleU1hcHBpbmdBY3RpdmUoe1xuXHRcdFx0S2V5QToge1xuXHRcdFx0XHR2YWx1ZTogJ2EnLFxuXHRcdFx0XHR2YWx1ZUlzRGVhZEtleTogZmFsc2UsXG5cdFx0XHRcdHdpdGhTaGlmdDogJ0EnLFxuXHRcdFx0XHR3aXRoU2hpZnRJc0RlYWRLZXk6IGZhbHNlLFxuXHRcdFx0XHR3aXRoQWx0R3I6ICdcdTAwRTUnLFxuXHRcdFx0XHR3aXRoQWx0R3JJc0RlYWRLZXk6IGZhbHNlLFxuXHRcdFx0XHR3aXRoU2hpZnRBbHRHcjogJ1x1MDBDNScsXG5cdFx0XHRcdHdpdGhTaGlmdEFsdEdySXNEZWFkS2V5OiBmYWxzZVxuXHRcdFx0fSxcblx0XHRcdEtleVo6IHtcblx0XHRcdFx0dmFsdWU6ICd6Jyxcblx0XHRcdFx0dmFsdWVJc0RlYWRLZXk6IGZhbHNlLFxuXHRcdFx0XHR3aXRoU2hpZnQ6ICdaJyxcblx0XHRcdFx0d2l0aFNoaWZ0SXNEZWFkS2V5OiBmYWxzZSxcblx0XHRcdFx0d2l0aEFsdEdyOiAnXHUwM0E5Jyxcblx0XHRcdFx0d2l0aEFsdEdySXNEZWFkS2V5OiBmYWxzZSxcblx0XHRcdFx0d2l0aFNoaWZ0QWx0R3I6ICdcdTAwQjgnLFxuXHRcdFx0XHR3aXRoU2hpZnRBbHRHcklzRGVhZEtleTogZmFsc2Vcblx0XHRcdH1cblx0XHR9KSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zdGFuY2UuaXNLZXlNYXBwaW5nQWN0aXZlKHtcblx0XHRcdEtleVo6IHtcblx0XHRcdFx0dmFsdWU6ICd5Jyxcblx0XHRcdFx0dmFsdWVJc0RlYWRLZXk6IGZhbHNlLFxuXHRcdFx0XHR3aXRoU2hpZnQ6ICdZJyxcblx0XHRcdFx0d2l0aFNoaWZ0SXNEZWFkS2V5OiBmYWxzZSxcblx0XHRcdFx0d2l0aEFsdEdyOiAnXHUwMEE1Jyxcblx0XHRcdFx0d2l0aEFsdEdySXNEZWFkS2V5OiBmYWxzZSxcblx0XHRcdFx0d2l0aFNoaWZ0QWx0R3I6ICdcdTAxNzgnLFxuXHRcdFx0XHR3aXRoU2hpZnRBbHRHcklzRGVhZEtleTogZmFsc2Vcblx0XHRcdH0sXG5cdFx0fSksIGZhbHNlKTtcblxuXHR9KTtcblxuXHR0ZXN0KCdTd2l0Y2gga2V5bWFwcGluZycsICgpID0+IHtcblx0XHRpbnN0YW5jZS5zZXRBY3RpdmVLZXlNYXBwaW5nKHtcblx0XHRcdEtleVo6IHtcblx0XHRcdFx0dmFsdWU6ICd5Jyxcblx0XHRcdFx0dmFsdWVJc0RlYWRLZXk6IGZhbHNlLFxuXHRcdFx0XHR3aXRoU2hpZnQ6ICdZJyxcblx0XHRcdFx0d2l0aFNoaWZ0SXNEZWFkS2V5OiBmYWxzZSxcblx0XHRcdFx0d2l0aEFsdEdyOiAnXHUwMEE1Jyxcblx0XHRcdFx0d2l0aEFsdEdySXNEZWFkS2V5OiBmYWxzZSxcblx0XHRcdFx0d2l0aFNoaWZ0QWx0R3I6ICdcdTAxNzgnLFxuXHRcdFx0XHR3aXRoU2hpZnRBbHRHcklzRGVhZEtleTogZmFsc2Vcblx0XHRcdH1cblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoISFpbnN0YW5jZS5hY3RpdmVLZXlib2FyZExheW91dCEuaXNVU1N0YW5kYXJkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluc3RhbmNlLmlzS2V5TWFwcGluZ0FjdGl2ZSh7XG5cdFx0XHRLZXlaOiB7XG5cdFx0XHRcdHZhbHVlOiAneScsXG5cdFx0XHRcdHZhbHVlSXNEZWFkS2V5OiBmYWxzZSxcblx0XHRcdFx0d2l0aFNoaWZ0OiAnWScsXG5cdFx0XHRcdHdpdGhTaGlmdElzRGVhZEtleTogZmFsc2UsXG5cdFx0XHRcdHdpdGhBbHRHcjogJ1x1MDBBNScsXG5cdFx0XHRcdHdpdGhBbHRHcklzRGVhZEtleTogZmFsc2UsXG5cdFx0XHRcdHdpdGhTaGlmdEFsdEdyOiAnXHUwMTc4Jyxcblx0XHRcdFx0d2l0aFNoaWZ0QWx0R3JJc0RlYWRLZXk6IGZhbHNlXG5cdFx0XHR9LFxuXHRcdH0pLCB0cnVlKTtcblxuXHRcdGluc3RhbmNlLnNldFVTS2V5Ym9hcmRMYXlvdXQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zdGFuY2UuYWN0aXZlS2V5Ym9hcmRMYXlvdXQhLmlzVVNTdGFuZGFyZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1N3aXRjaCBrZXlib2FyZCBsYXlvdXQgaW5mbycsICgpID0+IHtcblx0XHRpbnN0YW5jZS5zZXRLZXlib2FyZExheW91dCgnY29tLmFwcGxlLmtleWxheW91dC5HZXJtYW4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoISFpbnN0YW5jZS5hY3RpdmVLZXlib2FyZExheW91dCEuaXNVU1N0YW5kYXJkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluc3RhbmNlLmlzS2V5TWFwcGluZ0FjdGl2ZSh7XG5cdFx0XHRLZXlaOiB7XG5cdFx0XHRcdHZhbHVlOiAneScsXG5cdFx0XHRcdHZhbHVlSXNEZWFkS2V5OiBmYWxzZSxcblx0XHRcdFx0d2l0aFNoaWZ0OiAnWScsXG5cdFx0XHRcdHdpdGhTaGlmdElzRGVhZEtleTogZmFsc2UsXG5cdFx0XHRcdHdpdGhBbHRHcjogJ1x1MDBBNScsXG5cdFx0XHRcdHdpdGhBbHRHcklzRGVhZEtleTogZmFsc2UsXG5cdFx0XHRcdHdpdGhTaGlmdEFsdEdyOiAnXHUwMTc4Jyxcblx0XHRcdFx0d2l0aFNoaWZ0QWx0R3JJc0RlYWRLZXk6IGZhbHNlXG5cdFx0XHR9LFxuXHRcdH0pLCB0cnVlKTtcblxuXHRcdGluc3RhbmNlLnNldFVTS2V5Ym9hcmRMYXlvdXQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zdGFuY2UuYWN0aXZlS2V5Ym9hcmRMYXlvdXQhLmlzVVNTdGFuZGFyZCwgdHJ1ZSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFJQSxPQUFPLFlBQVk7QUFDbkIsT0FBTztBQUNQLE9BQU87QUFDUCxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHdDQUF3QztBQUNqRCxTQUFTLGtCQUErQjtBQUN4QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLCtDQUErQztBQUV4RCxNQUFNLGtDQUFrQyxpQ0FBaUM7QUFBQSxFQUN4RSxZQUFZLHNCQUE2QyxxQkFBMkMsZ0JBQWlDLGdCQUFpQztBQUVySyxVQUFNLG9CQUFvQjtBQUUxQixVQUFNLGNBQTZCLDJCQUEyQixTQUFTO0FBQ3ZFLFNBQUssYUFBYSxLQUFLLEdBQUcsWUFBWSxJQUFJLFVBQVMsSUFBSSxXQUFXLEtBQUssUUFBUSxLQUFLLGtCQUFrQixLQUFL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
