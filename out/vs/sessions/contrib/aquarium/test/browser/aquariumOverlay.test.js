import assert from "assert";
import { toDisposable } from "../../../../../base/common/lifecycle.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { TestAccessibilityService } from "../../../../../platform/accessibility/test/common/testAccessibilityService.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { MockContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { InMemoryStorageService, StorageScope } from "../../../../../platform/storage/common/storage.js";
import { NullTelemetryServiceShape } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { AquariumService, SESSIONS_DEVELOPER_JOY_ENABLED_SETTING } from "../../browser/aquariumOverlay.js";
import { disposeSharedFishDefs, Fish, FishSpecies } from "../../browser/fish.js";
suite("AquariumService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("persists and applies aquarium action visibility to mounted buttons", () => {
    const mainContainer = document.createElement("div");
    const toggleContainer = document.createElement("div");
    document.body.append(mainContainer, toggleContainer);
    store.add(toDisposable(() => {
      mainContainer.remove();
      toggleContainer.remove();
    }));
    const storageService = store.add(new InMemoryStorageService());
    const layoutService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.mainContainer = mainContainer;
      }
    }();
    const hoverService = new class extends mock() {
      setupManagedHover() {
        return {
          dispose() {
          },
          show() {
          },
          hide() {
          },
          update() {
          }
        };
      }
    }();
    const configurationService = new TestConfigurationService({ [SESSIONS_DEVELOPER_JOY_ENABLED_SETTING]: true });
    store.add(configurationService.onDidChangeConfigurationEmitter);
    const service = store.add(new AquariumService(
      layoutService,
      new MockContextKeyService(),
      hoverService,
      storageService,
      configurationService,
      new TestAccessibilityService(),
      new NullTelemetryServiceShape()
    ));
    store.add(service.mountToggle(toggleContainer));
    const button = toggleContainer.querySelector(".agents-aquarium-toggle");
    const initial = {
      visible: service.actionVisible.get(),
      display: button?.style.display
    };
    const hidden = service.toggleActionVisibility();
    const afterHide = {
      visible: service.actionVisible.get(),
      display: button?.style.display,
      stored: storageService.getBoolean("sessions.aquarium.action.visible", StorageScope.APPLICATION)
    };
    const shown = service.toggleActionVisibility();
    const afterShow = {
      visible: service.actionVisible.get(),
      display: button?.style.display
    };
    assert.deepStrictEqual({
      initial,
      hidden,
      afterHide,
      shown,
      afterShow
    }, {
      initial: { visible: true, display: "" },
      hidden: false,
      afterHide: { visible: false, display: "none", stored: false },
      shown: true,
      afterShow: { visible: true, display: "" }
    });
  });
  test("creates aquarium elements in the main realm for an auxiliary window", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    store.add(toDisposable(() => iframe.remove()));
    const auxiliaryDocument = iframe.contentDocument;
    const toggleContainer = document.createElement("div");
    auxiliaryDocument.body.appendChild(toggleContainer);
    const createElement = auxiliaryDocument.createElement;
    auxiliaryDocument.createElement = () => {
      throw new Error("Not allowed to create elements in child window JavaScript context.");
    };
    store.add(toDisposable(() => auxiliaryDocument.createElement = createElement));
    const storageService = store.add(new InMemoryStorageService());
    const layoutService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.mainContainer = document.createElement("div");
      }
    }();
    const hoverService = new class extends mock() {
      setupManagedHover() {
        return {
          dispose() {
          },
          show() {
          },
          hide() {
          },
          update() {
          }
        };
      }
    }();
    const configurationService = new TestConfigurationService({ [SESSIONS_DEVELOPER_JOY_ENABLED_SETTING]: true });
    store.add(configurationService.onDidChangeConfigurationEmitter);
    const service = store.add(new AquariumService(
      layoutService,
      new MockContextKeyService(),
      hoverService,
      storageService,
      configurationService,
      new TestAccessibilityService(),
      new NullTelemetryServiceShape()
    ));
    store.add(service.mountToggle(toggleContainer));
    const fish = new Fish({
      species: FishSpecies.Stable,
      size: 24,
      positionX: 0,
      positionY: 0,
      velocityX: 1,
      velocityY: 0
    }, auxiliaryDocument);
    auxiliaryDocument.body.appendChild(fish.element);
    store.add(toDisposable(() => {
      fish.element.remove();
      disposeSharedFishDefs(auxiliaryDocument);
    }));
    const button = toggleContainer.querySelector(".agents-aquarium-toggle");
    const svg = fish.element.querySelector("svg");
    assert.deepStrictEqual({
      buttonOwnerDocument: button?.ownerDocument === auxiliaryDocument,
      fishOwnerDocument: fish.element.ownerDocument === auxiliaryDocument,
      mainRealmButton: button instanceof HTMLButtonElement,
      mainRealmFish: fish.element instanceof HTMLDivElement,
      mainRealmSvg: svg instanceof SVGSVGElement
    }, {
      buttonOwnerDocument: true,
      fishOwnerDocument: true,
      mainRealmButton: true,
      mainRealmFish: true,
      mainRealmSvg: true
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcYXF1YXJpdW1cXHRlc3RcXGJyb3dzZXJcXGFxdWFyaXVtT3ZlcmxheS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgSU1hbmFnZWRIb3ZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFRlc3RBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvdGVzdC9jb21tb24vdGVzdEFjY2Vzc2liaWxpdHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IE1vY2tDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvdGVzdC9jb21tb24vbW9ja0tleWJpbmRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgTnVsbFRlbGVtZXRyeVNlcnZpY2VTaGFwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBcXVhcml1bVNlcnZpY2UsIFNFU1NJT05TX0RFVkVMT1BFUl9KT1lfRU5BQkxFRF9TRVRUSU5HIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9hcXVhcml1bU92ZXJsYXkuanMnO1xuaW1wb3J0IHsgZGlzcG9zZVNoYXJlZEZpc2hEZWZzLCBGaXNoLCBGaXNoU3BlY2llcyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvZmlzaC5qcyc7XG5cbnN1aXRlKCdBcXVhcml1bVNlcnZpY2UnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncGVyc2lzdHMgYW5kIGFwcGxpZXMgYXF1YXJpdW0gYWN0aW9uIHZpc2liaWxpdHkgdG8gbW91bnRlZCBidXR0b25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1haW5Db250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRjb25zdCB0b2dnbGVDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZChtYWluQ29udGFpbmVyLCB0b2dnbGVDb250YWluZXIpO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0bWFpbkNvbnRhaW5lci5yZW1vdmUoKTtcblx0XHRcdHRvZ2dsZUNvbnRhaW5lci5yZW1vdmUoKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IHN0b3JlLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCBsYXlvdXRTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJV29ya2JlbmNoTGF5b3V0U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBtYWluQ29udGFpbmVyID0gbWFpbkNvbnRhaW5lcjtcblx0XHR9KCk7XG5cdFx0Y29uc3QgaG92ZXJTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJSG92ZXJTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHNldHVwTWFuYWdlZEhvdmVyKCk6IElNYW5hZ2VkSG92ZXIge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGRpc3Bvc2UoKSB7IH0sXG5cdFx0XHRcdFx0c2hvdygpIHsgfSxcblx0XHRcdFx0XHRoaWRlKCkgeyB9LFxuXHRcdFx0XHRcdHVwZGF0ZSgpIHsgfSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9KCk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHsgW1NFU1NJT05TX0RFVkVMT1BFUl9KT1lfRU5BQkxFRF9TRVRUSU5HXTogdHJ1ZSB9KTtcblx0XHRzdG9yZS5hZGQoY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uRW1pdHRlcik7XG5cdFx0Y29uc3Qgc2VydmljZSA9IHN0b3JlLmFkZChuZXcgQXF1YXJpdW1TZXJ2aWNlKFxuXHRcdFx0bGF5b3V0U2VydmljZSxcblx0XHRcdG5ldyBNb2NrQ29udGV4dEtleVNlcnZpY2UoKSxcblx0XHRcdGhvdmVyU2VydmljZSxcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLFxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHRuZXcgVGVzdEFjY2Vzc2liaWxpdHlTZXJ2aWNlKCksXG5cdFx0XHRuZXcgTnVsbFRlbGVtZXRyeVNlcnZpY2VTaGFwZSgpLFxuXHRcdCkpO1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLm1vdW50VG9nZ2xlKHRvZ2dsZUNvbnRhaW5lcikpO1xuXHRcdGNvbnN0IGJ1dHRvbiA9IHRvZ2dsZUNvbnRhaW5lci5xdWVyeVNlbGVjdG9yPEhUTUxCdXR0b25FbGVtZW50PignLmFnZW50cy1hcXVhcml1bS10b2dnbGUnKTtcblxuXHRcdGNvbnN0IGluaXRpYWwgPSB7XG5cdFx0XHR2aXNpYmxlOiBzZXJ2aWNlLmFjdGlvblZpc2libGUuZ2V0KCksXG5cdFx0XHRkaXNwbGF5OiBidXR0b24/LnN0eWxlLmRpc3BsYXksXG5cdFx0fTtcblx0XHRjb25zdCBoaWRkZW4gPSBzZXJ2aWNlLnRvZ2dsZUFjdGlvblZpc2liaWxpdHkoKTtcblx0XHRjb25zdCBhZnRlckhpZGUgPSB7XG5cdFx0XHR2aXNpYmxlOiBzZXJ2aWNlLmFjdGlvblZpc2libGUuZ2V0KCksXG5cdFx0XHRkaXNwbGF5OiBidXR0b24/LnN0eWxlLmRpc3BsYXksXG5cdFx0XHRzdG9yZWQ6IHN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oJ3Nlc3Npb25zLmFxdWFyaXVtLmFjdGlvbi52aXNpYmxlJywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKSxcblx0XHR9O1xuXHRcdGNvbnN0IHNob3duID0gc2VydmljZS50b2dnbGVBY3Rpb25WaXNpYmlsaXR5KCk7XG5cdFx0Y29uc3QgYWZ0ZXJTaG93ID0ge1xuXHRcdFx0dmlzaWJsZTogc2VydmljZS5hY3Rpb25WaXNpYmxlLmdldCgpLFxuXHRcdFx0ZGlzcGxheTogYnV0dG9uPy5zdHlsZS5kaXNwbGF5LFxuXHRcdH07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGluaXRpYWwsXG5cdFx0XHRoaWRkZW4sXG5cdFx0XHRhZnRlckhpZGUsXG5cdFx0XHRzaG93bixcblx0XHRcdGFmdGVyU2hvdyxcblx0XHR9LCB7XG5cdFx0XHRpbml0aWFsOiB7IHZpc2libGU6IHRydWUsIGRpc3BsYXk6ICcnIH0sXG5cdFx0XHRoaWRkZW46IGZhbHNlLFxuXHRcdFx0YWZ0ZXJIaWRlOiB7IHZpc2libGU6IGZhbHNlLCBkaXNwbGF5OiAnbm9uZScsIHN0b3JlZDogZmFsc2UgfSxcblx0XHRcdHNob3duOiB0cnVlLFxuXHRcdFx0YWZ0ZXJTaG93OiB7IHZpc2libGU6IHRydWUsIGRpc3BsYXk6ICcnIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZXMgYXF1YXJpdW0gZWxlbWVudHMgaW4gdGhlIG1haW4gcmVhbG0gZm9yIGFuIGF1eGlsaWFyeSB3aW5kb3cnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaWZyYW1lID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaWZyYW1lJyk7XG5cdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChpZnJhbWUpO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gaWZyYW1lLnJlbW92ZSgpKSk7XG5cblx0XHRjb25zdCBhdXhpbGlhcnlEb2N1bWVudCA9IGlmcmFtZS5jb250ZW50RG9jdW1lbnQhO1xuXHRcdGNvbnN0IHRvZ2dsZUNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGF1eGlsaWFyeURvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodG9nZ2xlQ29udGFpbmVyKTtcblx0XHRjb25zdCBjcmVhdGVFbGVtZW50ID0gYXV4aWxpYXJ5RG9jdW1lbnQuY3JlYXRlRWxlbWVudDtcblx0XHRhdXhpbGlhcnlEb2N1bWVudC5jcmVhdGVFbGVtZW50ID0gKCkgPT4ge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdOb3QgYWxsb3dlZCB0byBjcmVhdGUgZWxlbWVudHMgaW4gY2hpbGQgd2luZG93IEphdmFTY3JpcHQgY29udGV4dC4nKTtcblx0XHR9O1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gYXV4aWxpYXJ5RG9jdW1lbnQuY3JlYXRlRWxlbWVudCA9IGNyZWF0ZUVsZW1lbnQpKTtcblxuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGxheW91dFNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG1haW5Db250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR9KCk7XG5cdFx0Y29uc3QgaG92ZXJTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJSG92ZXJTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHNldHVwTWFuYWdlZEhvdmVyKCk6IElNYW5hZ2VkSG92ZXIge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGRpc3Bvc2UoKSB7IH0sXG5cdFx0XHRcdFx0c2hvdygpIHsgfSxcblx0XHRcdFx0XHRoaWRlKCkgeyB9LFxuXHRcdFx0XHRcdHVwZGF0ZSgpIHsgfSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9KCk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHsgW1NFU1NJT05TX0RFVkVMT1BFUl9KT1lfRU5BQkxFRF9TRVRUSU5HXTogdHJ1ZSB9KTtcblx0XHRzdG9yZS5hZGQoY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uRW1pdHRlcik7XG5cdFx0Y29uc3Qgc2VydmljZSA9IHN0b3JlLmFkZChuZXcgQXF1YXJpdW1TZXJ2aWNlKFxuXHRcdFx0bGF5b3V0U2VydmljZSxcblx0XHRcdG5ldyBNb2NrQ29udGV4dEtleVNlcnZpY2UoKSxcblx0XHRcdGhvdmVyU2VydmljZSxcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLFxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHRuZXcgVGVzdEFjY2Vzc2liaWxpdHlTZXJ2aWNlKCksXG5cdFx0XHRuZXcgTnVsbFRlbGVtZXRyeVNlcnZpY2VTaGFwZSgpLFxuXHRcdCkpO1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLm1vdW50VG9nZ2xlKHRvZ2dsZUNvbnRhaW5lcikpO1xuXHRcdGNvbnN0IGZpc2ggPSBuZXcgRmlzaCh7XG5cdFx0XHRzcGVjaWVzOiBGaXNoU3BlY2llcy5TdGFibGUsXG5cdFx0XHRzaXplOiAyNCxcblx0XHRcdHBvc2l0aW9uWDogMCxcblx0XHRcdHBvc2l0aW9uWTogMCxcblx0XHRcdHZlbG9jaXR5WDogMSxcblx0XHRcdHZlbG9jaXR5WTogMCxcblx0XHR9LCBhdXhpbGlhcnlEb2N1bWVudCk7XG5cdFx0YXV4aWxpYXJ5RG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChmaXNoLmVsZW1lbnQpO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0ZmlzaC5lbGVtZW50LnJlbW92ZSgpO1xuXHRcdFx0ZGlzcG9zZVNoYXJlZEZpc2hEZWZzKGF1eGlsaWFyeURvY3VtZW50KTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBidXR0b24gPSB0b2dnbGVDb250YWluZXIucXVlcnlTZWxlY3RvcignLmFnZW50cy1hcXVhcml1bS10b2dnbGUnKTtcblx0XHRjb25zdCBzdmcgPSBmaXNoLmVsZW1lbnQucXVlcnlTZWxlY3Rvcignc3ZnJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRidXR0b25Pd25lckRvY3VtZW50OiBidXR0b24/Lm93bmVyRG9jdW1lbnQgPT09IGF1eGlsaWFyeURvY3VtZW50LFxuXHRcdFx0ZmlzaE93bmVyRG9jdW1lbnQ6IGZpc2guZWxlbWVudC5vd25lckRvY3VtZW50ID09PSBhdXhpbGlhcnlEb2N1bWVudCxcblx0XHRcdG1haW5SZWFsbUJ1dHRvbjogYnV0dG9uIGluc3RhbmNlb2YgSFRNTEJ1dHRvbkVsZW1lbnQsXG5cdFx0XHRtYWluUmVhbG1GaXNoOiBmaXNoLmVsZW1lbnQgaW5zdGFuY2VvZiBIVE1MRGl2RWxlbWVudCxcblx0XHRcdG1haW5SZWFsbVN2Zzogc3ZnIGluc3RhbmNlb2YgU1ZHU1ZHRWxlbWVudCxcblx0XHR9LCB7XG5cdFx0XHRidXR0b25Pd25lckRvY3VtZW50OiB0cnVlLFxuXHRcdFx0ZmlzaE93bmVyRG9jdW1lbnQ6IHRydWUsXG5cdFx0XHRtYWluUmVhbG1CdXR0b246IHRydWUsXG5cdFx0XHRtYWluUmVhbG1GaXNoOiB0cnVlLFxuXHRcdFx0bWFpblJlYWxtU3ZnOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBRW5CLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsWUFBWTtBQUNyQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdDQUFnQztBQUV6QyxTQUFTLDZC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
