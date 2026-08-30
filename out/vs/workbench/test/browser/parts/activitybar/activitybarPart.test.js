import assert from "assert";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { TestThemeService } from "../../../../../platform/theme/test/common/testThemeService.js";
import { TestStorageService } from "../../../common/workbenchTestServices.js";
import { TestLayoutService } from "../../workbenchTestServices.js";
import { ActivitybarPart } from "../../../../browser/parts/activitybar/activitybarPart.js";
import { LayoutSettings, Parts, Position } from "../../../../services/layout/browser/layoutService.js";
import { mainWindow } from "../../../../../base/browser/window.js";
import { Event, Emitter } from "../../../../../base/common/event.js";
import { Extensions } from "../../../../browser/panecomposite.js";
import { ViewContainerLocation } from "../../../../common/views.js";
class StubPaneCompositePart {
  constructor() {
    this.partId = Parts.SIDEBAR_PART;
    this.registryId = Extensions.Viewlets;
    this.element = void 0;
    this.minimumWidth = 0;
    this.maximumWidth = 0;
    this.minimumHeight = 0;
    this.maximumHeight = 0;
    this.onDidChange = Event.None;
    this.onDidPaneCompositeOpen = new Emitter().event;
    this.onDidPaneCompositeClose = new Emitter().event;
  }
  openPaneComposite() {
    return Promise.resolve(void 0);
  }
  getPaneComposites() {
    return [];
  }
  getPaneComposite() {
    return void 0;
  }
  getActivePaneComposite() {
    return void 0;
  }
  getProgressIndicator() {
    return void 0;
  }
  hideActivePaneComposite() {
  }
  getLastActivePaneCompositeId() {
    return "";
  }
  getPinnedPaneCompositeIds() {
    return [];
  }
  getVisiblePaneCompositeIds() {
    return [];
  }
  getPaneCompositeIds() {
    return [];
  }
  layout() {
  }
  dispose() {
  }
}
class TestFloatingPanelsLayoutService extends TestLayoutService {
  constructor() {
    super(...arguments);
    this.floatingPanelsEnabled = false;
    this.sideBarPosition = Position.LEFT;
  }
  isFloatingPanelsEnabled() {
    return this.floatingPanelsEnabled;
  }
  getSideBarPosition() {
    return this.sideBarPosition;
  }
}
suite("ActivitybarPart", () => {
  const disposables = new DisposableStore();
  let fixture;
  const fixtureId = "activitybar-part-fixture";
  setup(() => {
    fixture = document.createElement("div");
    fixture.id = fixtureId;
    mainWindow.document.body.appendChild(fixture);
  });
  teardown(() => {
    fixture.remove();
    disposables.clear();
  });
  function createActivitybarPart(compact, floatingPanelsEnabled = false, sideBarPosition = Position.LEFT) {
    const configService = new TestConfigurationService({
      [LayoutSettings.ACTIVITY_BAR_COMPACT]: compact,
      [LayoutSettings.MODERN_UI]: floatingPanelsEnabled
    });
    const storageService = disposables.add(new TestStorageService());
    const themeService = new TestThemeService();
    const layoutService = new TestFloatingPanelsLayoutService();
    layoutService.floatingPanelsEnabled = floatingPanelsEnabled;
    layoutService.sideBarPosition = sideBarPosition;
    layoutService.isVisible = (_part) => false;
    const stubInstantiationService = { createInstance: () => {
      throw new Error("not expected");
    } };
    const part = disposables.add(new ActivitybarPart(
      ViewContainerLocation.Sidebar,
      new StubPaneCompositePart(),
      stubInstantiationService,
      layoutService,
      themeService,
      storageService,
      configService
    ));
    return { part, configService, layoutService };
  }
  function fireConfigChange(configService, key) {
    configService.onDidChangeConfigurationEmitter.fire({
      affectsConfiguration: (k) => k === key
    });
  }
  test("default constants match expected dimensions", () => {
    assert.deepStrictEqual(
      {
        width: ActivitybarPart.ACTIVITYBAR_WIDTH,
        actionHeight: ActivitybarPart.ACTION_HEIGHT,
        iconSize: ActivitybarPart.ICON_SIZE
      },
      {
        width: 48,
        actionHeight: 48,
        iconSize: 24
      }
    );
  });
  test("compact constants match reduced dimensions", () => {
    assert.deepStrictEqual(
      {
        width: ActivitybarPart.COMPACT_ACTIVITYBAR_WIDTH,
        actionHeight: ActivitybarPart.COMPACT_ACTION_HEIGHT,
        iconSize: ActivitybarPart.COMPACT_ICON_SIZE
      },
      {
        width: 36,
        actionHeight: 28,
        iconSize: 16
      }
    );
  });
  test("floating constants are narrower than default", () => {
    assert.deepStrictEqual(
      {
        width: ActivitybarPart.FLOATING_ACTIVITYBAR_WIDTH,
        actionHeight: ActivitybarPart.FLOATING_ACTION_HEIGHT,
        compactWidth: ActivitybarPart.FLOATING_COMPACT_ACTIVITYBAR_WIDTH
      },
      {
        width: 36,
        actionHeight: 36,
        compactWidth: 28
      }
    );
  });
  test("default mode returns default width constraints", () => {
    const { part } = createActivitybarPart(false);
    assert.deepStrictEqual(
      { min: part.minimumWidth, max: part.maximumWidth },
      { min: ActivitybarPart.ACTIVITYBAR_WIDTH, max: ActivitybarPart.ACTIVITYBAR_WIDTH }
    );
  });
  test("compact mode returns compact width constraints", () => {
    const { part } = createActivitybarPart(true);
    assert.deepStrictEqual(
      { min: part.minimumWidth, max: part.maximumWidth },
      { min: ActivitybarPart.COMPACT_ACTIVITYBAR_WIDTH, max: ActivitybarPart.COMPACT_ACTIVITYBAR_WIDTH }
    );
  });
  test("height constraints are unbounded", () => {
    const { part } = createActivitybarPart(false);
    assert.strictEqual(part.minimumHeight, 0);
    assert.strictEqual(part.maximumHeight, Number.POSITIVE_INFINITY);
  });
  test("floating panels reserves outer padding on the left", () => {
    const { part } = createActivitybarPart(false, true);
    assert.deepStrictEqual(
      { min: part.minimumWidth, max: part.maximumWidth },
      {
        min: ActivitybarPart.FLOATING_ACTIVITYBAR_WIDTH + ActivitybarPart.FLOATING_MARGIN * 2,
        max: ActivitybarPart.FLOATING_ACTIVITYBAR_WIDTH + ActivitybarPart.FLOATING_MARGIN * 2
      }
    );
  });
  test("floating panels reserves a 4px inner gap and both gutters on the right", () => {
    const { part } = createActivitybarPart(false, true, Position.RIGHT);
    assert.deepStrictEqual(
      { min: part.minimumWidth, max: part.maximumWidth },
      {
        min: ActivitybarPart.FLOATING_ACTIVITYBAR_WIDTH + ActivitybarPart.FLOATING_MARGIN * 3,
        max: ActivitybarPart.FLOATING_ACTIVITYBAR_WIDTH + ActivitybarPart.FLOATING_MARGIN * 3
      }
    );
  });
  test("toggling compact via config changes width constraints", () => {
    const { part, configService } = createActivitybarPart(false);
    assert.strictEqual(part.minimumWidth, ActivitybarPart.ACTIVITYBAR_WIDTH);
    configService.setUserConfiguration(LayoutSettings.ACTIVITY_BAR_COMPACT, true);
    fireConfigChange(configService, LayoutSettings.ACTIVITY_BAR_COMPACT);
    assert.deepStrictEqual(
      { min: part.minimumWidth, max: part.maximumWidth },
      { min: ActivitybarPart.COMPACT_ACTIVITYBAR_WIDTH, max: ActivitybarPart.COMPACT_ACTIVITYBAR_WIDTH }
    );
    configService.setUserConfiguration(LayoutSettings.ACTIVITY_BAR_COMPACT, false);
    fireConfigChange(configService, LayoutSettings.ACTIVITY_BAR_COMPACT);
    assert.deepStrictEqual(
      { min: part.minimumWidth, max: part.maximumWidth },
      { min: ActivitybarPart.ACTIVITYBAR_WIDTH, max: ActivitybarPart.ACTIVITYBAR_WIDTH }
    );
  });
  test("fires onDidChange(undefined) when compact setting changes", () => {
    const { part, configService } = createActivitybarPart(false);
    const events = [];
    disposables.add(part.onDidChange((e) => events.push(e)));
    configService.setUserConfiguration(LayoutSettings.ACTIVITY_BAR_COMPACT, true);
    fireConfigChange(configService, LayoutSettings.ACTIVITY_BAR_COMPACT);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0], void 0, "should fire undefined to signal constraint change");
    configService.setUserConfiguration(LayoutSettings.ACTIVITY_BAR_COMPACT, false);
    fireConfigChange(configService, LayoutSettings.ACTIVITY_BAR_COMPACT);
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[1], void 0);
  });
  test("does not fire onDidChange for unrelated config changes", () => {
    const { part, configService } = createActivitybarPart(false);
    const events = [];
    disposables.add(part.onDidChange((e) => events.push(e)));
    fireConfigChange(configService, "editor.fontSize");
    assert.strictEqual(events.length, 0);
  });
  test("fires onDidChange(undefined) when floating panels setting changes", () => {
    const { part, configService, layoutService } = createActivitybarPart(false, false);
    const events = [];
    disposables.add(part.onDidChange((e) => events.push(e)));
    layoutService.floatingPanelsEnabled = true;
    configService.setUserConfiguration(LayoutSettings.MODERN_UI, true);
    fireConfigChange(configService, LayoutSettings.MODERN_UI);
    assert.deepStrictEqual(events, [void 0]);
    assert.strictEqual(part.minimumWidth, ActivitybarPart.FLOATING_ACTIVITYBAR_WIDTH + ActivitybarPart.FLOATING_MARGIN * 2);
  });
  test("updateCompactStyle sets correct CSS custom properties in default mode", () => {
    const { part } = createActivitybarPart(false);
    const el = document.createElement("div");
    fixture.appendChild(el);
    part.create(el);
    assert.strictEqual(el.style.getPropertyValue("--activity-bar-width"), `${ActivitybarPart.ACTIVITYBAR_WIDTH}px`);
    assert.strictEqual(el.style.getPropertyValue("--activity-bar-action-height"), `${ActivitybarPart.ACTION_HEIGHT}px`);
    assert.strictEqual(el.style.getPropertyValue("--activity-bar-icon-size"), `${ActivitybarPart.ICON_SIZE}px`);
    assert.strictEqual(el.classList.contains("compact"), false);
  });
  test("updateCompactStyle sets correct CSS custom properties in compact mode", () => {
    const { part } = createActivitybarPart(true);
    const el = document.createElement("div");
    fixture.appendChild(el);
    part.create(el);
    assert.strictEqual(el.style.getPropertyValue("--activity-bar-width"), `${ActivitybarPart.COMPACT_ACTIVITYBAR_WIDTH}px`);
    assert.strictEqual(el.style.getPropertyValue("--activity-bar-action-height"), `${ActivitybarPart.COMPACT_ACTION_HEIGHT}px`);
    assert.strictEqual(el.style.getPropertyValue("--activity-bar-icon-size"), `${ActivitybarPart.COMPACT_ICON_SIZE}px`);
    assert.strictEqual(el.classList.contains("compact"), true);
  });
  test("updateCompactStyle sets correct CSS custom properties in floating mode", () => {
    const { part } = createActivitybarPart(false, true);
    const el = document.createElement("div");
    fixture.appendChild(el);
    part.create(el);
    assert.strictEqual(el.style.getPropertyValue("--activity-bar-width"), `${ActivitybarPart.FLOATING_ACTIVITYBAR_WIDTH}px`);
    assert.strictEqual(el.style.getPropertyValue("--activity-bar-action-height"), `${ActivitybarPart.FLOATING_ACTION_HEIGHT}px`);
    assert.strictEqual(el.style.getPropertyValue("--activity-bar-icon-size"), `${ActivitybarPart.ICON_SIZE}px`);
    assert.strictEqual(el.classList.contains("compact"), false);
  });
  test("toggling compact updates CSS custom properties on element", () => {
    const { part, configService } = createActivitybarPart(false);
    const el = document.createElement("div");
    fixture.appendChild(el);
    part.create(el);
    assert.strictEqual(el.style.getPropertyValue("--activity-bar-width"), `${ActivitybarPart.ACTIVITYBAR_WIDTH}px`);
    assert.strictEqual(el.classList.contains("compact"), false);
    configService.setUserConfiguration(LayoutSettings.ACTIVITY_BAR_COMPACT, true);
    fireConfigChange(configService, LayoutSettings.ACTIVITY_BAR_COMPACT);
    assert.strictEqual(el.style.getPropertyValue("--activity-bar-width"), `${ActivitybarPart.COMPACT_ACTIVITYBAR_WIDTH}px`);
    assert.strictEqual(el.style.getPropertyValue("--activity-bar-action-height"), `${ActivitybarPart.COMPACT_ACTION_HEIGHT}px`);
    assert.strictEqual(el.style.getPropertyValue("--activity-bar-icon-size"), `${ActivitybarPart.COMPACT_ICON_SIZE}px`);
    assert.strictEqual(el.classList.contains("compact"), true);
    configService.setUserConfiguration(LayoutSettings.ACTIVITY_BAR_COMPACT, false);
    fireConfigChange(configService, LayoutSettings.ACTIVITY_BAR_COMPACT);
    assert.strictEqual(el.style.getPropertyValue("--activity-bar-width"), `${ActivitybarPart.ACTIVITYBAR_WIDTH}px`);
    assert.strictEqual(el.style.getPropertyValue("--activity-bar-action-height"), `${ActivitybarPart.ACTION_HEIGHT}px`);
    assert.strictEqual(el.style.getPropertyValue("--activity-bar-icon-size"), `${ActivitybarPart.ICON_SIZE}px`);
    assert.strictEqual(el.classList.contains("compact"), false);
  });
  test("toJSON returns correct part type", () => {
    const { part } = createActivitybarPart(false);
    assert.deepStrictEqual(part.toJSON(), { type: Parts.ACTIVITYBAR_PART });
  });
  function layoutContentHeight(visibleParts, floatingPanelsEnabled = true) {
    const { part, layoutService } = createActivitybarPart(false, floatingPanelsEnabled);
    const el = document.createElement("div");
    fixture.appendChild(el);
    part.create(el);
    const visible = new Set(visibleParts);
    layoutService.isVisible = (partId) => visible.has(partId);
    part.layout(100, 300);
    const content = el.querySelector(".content");
    return parseInt(content.style.height, 10);
  }
  test("reserves a doubled gutter on each window edge the activity bar faces", () => {
    const margin = ActivitybarPart.FLOATING_MARGIN;
    const actual = {
      // Windowed default: a title bar above and a status bar below, so neither is a window edge.
      titleAndStatusBarVisible: layoutContentHeight([Parts.TITLEBAR_PART, Parts.STATUSBAR_PART]),
      // Native fullscreen: nothing above the middle section, so the top is a window edge.
      titleBarHidden: layoutContentHeight([Parts.STATUSBAR_PART]),
      // A visible banner still occupies the row above, so the top is not a window edge.
      bannerInsteadOfTitleBar: layoutContentHeight([Parts.BANNER_PART, Parts.STATUSBAR_PART]),
      // Hidden status bar: the activity bar now reaches the window bottom edge.
      statusBarHidden: layoutContentHeight([Parts.TITLEBAR_PART]),
      // Both edges at once.
      bothEdgesExposed: layoutContentHeight([]),
      // Experiment disabled: the activity bar is not a floating card, so no gutters at all.
      floatingPanelsDisabled: layoutContentHeight([], false)
    };
    assert.deepStrictEqual(actual, {
      titleAndStatusBarVisible: 300 - margin,
      titleBarHidden: 300 - margin * 2 - margin,
      bannerInsteadOfTitleBar: 300 - margin,
      statusBarHidden: 300 - margin * 2,
      bothEdgesExposed: 300 - margin * 2 - margin * 2,
      floatingPanelsDisabled: 300
    });
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHRlc3RcXGJyb3dzZXJcXHBhcnRzXFxhY3Rpdml0eWJhclxcYWN0aXZpdHliYXJQYXJ0LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0VGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvdGVzdC9jb21tb24vdGVzdFRoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IFRlc3RMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IEFjdGl2aXR5YmFyUGFydCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvYWN0aXZpdHliYXIvYWN0aXZpdHliYXJQYXJ0LmpzJztcbmltcG9ydCB7IElWaWV3U2l6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ncmlkL2dyaWQuanMnO1xuaW1wb3J0IHsgTGF5b3V0U2V0dGluZ3MsIFBhcnRzLCBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVBhbmVDb21wb3NpdGVQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9wYW5lQ29tcG9zaXRlUGFydC5qcyc7XG5pbXBvcnQgeyBFdmVudCwgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElQYW5lQ29tcG9zaXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3BhbmVjb21wb3NpdGUuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgUGFuZUNvbXBvc2l0ZURlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3BhbmVjb21wb3NpdGUuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBWaWV3Q29udGFpbmVyTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuXG5jbGFzcyBTdHViUGFuZUNvbXBvc2l0ZVBhcnQgaW1wbGVtZW50cyBJUGFuZUNvbXBvc2l0ZVBhcnQge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgcGFydElkID0gUGFydHMuU0lERUJBUl9QQVJUO1xuXHRyZWFkb25seSByZWdpc3RyeUlkID0gRXh0ZW5zaW9ucy5WaWV3bGV0cztcblx0ZWxlbWVudDogSFRNTEVsZW1lbnQgPSB1bmRlZmluZWQhO1xuXHRtaW5pbXVtV2lkdGggPSAwO1xuXHRtYXhpbXVtV2lkdGggPSAwO1xuXHRtaW5pbXVtSGVpZ2h0ID0gMDtcblx0bWF4aW11bUhlaWdodCA9IDA7XG5cdG9uRGlkQ2hhbmdlID0gRXZlbnQuTm9uZTtcblx0b25EaWRQYW5lQ29tcG9zaXRlT3BlbiA9IG5ldyBFbWl0dGVyPElQYW5lQ29tcG9zaXRlPigpLmV2ZW50O1xuXHRvbkRpZFBhbmVDb21wb3NpdGVDbG9zZSA9IG5ldyBFbWl0dGVyPElQYW5lQ29tcG9zaXRlPigpLmV2ZW50O1xuXHRvcGVuUGFuZUNvbXBvc2l0ZSgpOiBQcm9taXNlPElQYW5lQ29tcG9zaXRlIHwgdW5kZWZpbmVkPiB7IHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTsgfVxuXHRnZXRQYW5lQ29tcG9zaXRlcygpOiBQYW5lQ29tcG9zaXRlRGVzY3JpcHRvcltdIHsgcmV0dXJuIFtdOyB9XG5cdGdldFBhbmVDb21wb3NpdGUoKTogUGFuZUNvbXBvc2l0ZURlc2NyaXB0b3IgfCB1bmRlZmluZWQgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGdldEFjdGl2ZVBhbmVDb21wb3NpdGUoKTogSVBhbmVDb21wb3NpdGUgfCB1bmRlZmluZWQgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGdldFByb2dyZXNzSW5kaWNhdG9yKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGhpZGVBY3RpdmVQYW5lQ29tcG9zaXRlKCk6IHZvaWQgeyB9XG5cdGdldExhc3RBY3RpdmVQYW5lQ29tcG9zaXRlSWQoKTogc3RyaW5nIHsgcmV0dXJuICcnOyB9XG5cdGdldFBpbm5lZFBhbmVDb21wb3NpdGVJZHMoKTogc3RyaW5nW10geyByZXR1cm4gW107IH1cblx0Z2V0VmlzaWJsZVBhbmVDb21wb3NpdGVJZHMoKTogc3RyaW5nW10geyByZXR1cm4gW107IH1cblx0Z2V0UGFuZUNvbXBvc2l0ZUlkcygpOiBzdHJpbmdbXSB7IHJldHVybiBbXTsgfVxuXHRsYXlvdXQoKTogdm9pZCB7IH1cblx0ZGlzcG9zZSgpOiB2b2lkIHsgfVxufVxuXG5jbGFzcyBUZXN0RmxvYXRpbmdQYW5lbHNMYXlvdXRTZXJ2aWNlIGV4dGVuZHMgVGVzdExheW91dFNlcnZpY2Uge1xuXHRmbG9hdGluZ1BhbmVsc0VuYWJsZWQgPSBmYWxzZTtcblx0c2lkZUJhclBvc2l0aW9uID0gUG9zaXRpb24uTEVGVDtcblx0b3ZlcnJpZGUgaXNGbG9hdGluZ1BhbmVsc0VuYWJsZWQoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLmZsb2F0aW5nUGFuZWxzRW5hYmxlZDsgfVxuXHRvdmVycmlkZSBnZXRTaWRlQmFyUG9zaXRpb24oKTogUG9zaXRpb24geyByZXR1cm4gdGhpcy5zaWRlQmFyUG9zaXRpb247IH1cbn1cblxuc3VpdGUoJ0FjdGl2aXR5YmFyUGFydCcsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRsZXQgZml4dHVyZTogSFRNTEVsZW1lbnQ7XG5cdGNvbnN0IGZpeHR1cmVJZCA9ICdhY3Rpdml0eWJhci1wYXJ0LWZpeHR1cmUnO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRmaXh0dXJlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0Zml4dHVyZS5pZCA9IGZpeHR1cmVJZDtcblx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoZml4dHVyZSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRmaXh0dXJlLnJlbW92ZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZUFjdGl2aXR5YmFyUGFydChjb21wYWN0OiBib29sZWFuLCBmbG9hdGluZ1BhbmVsc0VuYWJsZWQgPSBmYWxzZSwgc2lkZUJhclBvc2l0aW9uID0gUG9zaXRpb24uTEVGVCk6IHsgcGFydDogQWN0aXZpdHliYXJQYXJ0OyBjb25maWdTZXJ2aWNlOiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2U7IGxheW91dFNlcnZpY2U6IFRlc3RGbG9hdGluZ1BhbmVsc0xheW91dFNlcnZpY2UgfSB7XG5cdFx0Y29uc3QgY29uZmlnU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0W0xheW91dFNldHRpbmdzLkFDVElWSVRZX0JBUl9DT01QQUNUXTogY29tcGFjdCxcblx0XHRcdFtMYXlvdXRTZXR0aW5ncy5NT0RFUk5fVUldOiBmbG9hdGluZ1BhbmVsc0VuYWJsZWQsXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCB0aGVtZVNlcnZpY2UgPSBuZXcgVGVzdFRoZW1lU2VydmljZSgpO1xuXHRcdGNvbnN0IGxheW91dFNlcnZpY2UgPSBuZXcgVGVzdEZsb2F0aW5nUGFuZWxzTGF5b3V0U2VydmljZSgpO1xuXHRcdGxheW91dFNlcnZpY2UuZmxvYXRpbmdQYW5lbHNFbmFibGVkID0gZmxvYXRpbmdQYW5lbHNFbmFibGVkO1xuXHRcdGxheW91dFNlcnZpY2Uuc2lkZUJhclBvc2l0aW9uID0gc2lkZUJhclBvc2l0aW9uO1xuXG5cdFx0Ly8gT3ZlcnJpZGUgaXNWaXNpYmxlIHRvIHJldHVybiBmYWxzZSBzbyB0aGF0IGNyZWF0ZSgpIGRvZXMgbm90IGNhbGwgc2hvdygpXG5cdFx0Ly8gYW5kIGF0dGVtcHQgdG8gaW5zdGFudGlhdGUgdGhlIGNvbXBvc2l0ZSBiYXIgKHdoaWNoIHJlcXVpcmVzIGEgZnVsbCBESSBzZXR1cCkuXG5cdFx0bGF5b3V0U2VydmljZS5pc1Zpc2libGUgPSAoX3BhcnQ6IFBhcnRzKSA9PiBmYWxzZTtcblxuXHRcdC8vIFN0dWIgaW5zdGFudGlhdGlvbiBzZXJ2aWNlXHUyMDE0Y3JlYXRlQ29tcG9zaXRlQmFyIGlzIG9ubHkgY2FsbGVkIGluIHNob3coKSxcblx0XHQvLyB3aGljaCB3ZSBza2lwIGluIHVuaXQgdGVzdHMgZm9jdXNlZCBvbiBkaW1lbnNpb25zIC8gc3R5bGUgYmVoYXZpb3VyLlxuXHRcdGNvbnN0IHN0dWJJbnN0YW50aWF0aW9uU2VydmljZSA9IHsgY3JlYXRlSW5zdGFuY2U6ICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgZXhwZWN0ZWQnKTsgfSB9IGFzIHVua25vd24gYXMgSUluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXG5cdFx0Y29uc3QgcGFydCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWN0aXZpdHliYXJQYXJ0KFxuXHRcdFx0Vmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIsXG5cdFx0XHRuZXcgU3R1YlBhbmVDb21wb3NpdGVQYXJ0KCksXG5cdFx0XHRzdHViSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRsYXlvdXRTZXJ2aWNlLFxuXHRcdFx0dGhlbWVTZXJ2aWNlLFxuXHRcdFx0c3RvcmFnZVNlcnZpY2UsXG5cdFx0XHRjb25maWdTZXJ2aWNlLFxuXHRcdCkpO1xuXG5cdFx0cmV0dXJuIHsgcGFydCwgY29uZmlnU2VydmljZSwgbGF5b3V0U2VydmljZSB9O1xuXHR9XG5cblx0ZnVuY3Rpb24gZmlyZUNvbmZpZ0NoYW5nZShjb25maWdTZXJ2aWNlOiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UsIGtleTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uZmlnU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb25FbWl0dGVyLmZpcmUoe1xuXHRcdFx0YWZmZWN0c0NvbmZpZ3VyYXRpb246IChrOiBzdHJpbmcpID0+IGsgPT09IGtleSxcblx0XHR9IHNhdGlzZmllcyBQYXJ0aWFsPElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQ+IGFzIHVua25vd24gYXMgSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCk7XG5cdH1cblxuXHQvLyAtLS0gU3RhdGljIGNvbnN0YW50cyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHR0ZXN0KCdkZWZhdWx0IGNvbnN0YW50cyBtYXRjaCBleHBlY3RlZCBkaW1lbnNpb25zJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdHdpZHRoOiBBY3Rpdml0eWJhclBhcnQuQUNUSVZJVFlCQVJfV0lEVEgsXG5cdFx0XHRcdGFjdGlvbkhlaWdodDogQWN0aXZpdHliYXJQYXJ0LkFDVElPTl9IRUlHSFQsXG5cdFx0XHRcdGljb25TaXplOiBBY3Rpdml0eWJhclBhcnQuSUNPTl9TSVpFLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0d2lkdGg6IDQ4LFxuXHRcdFx0XHRhY3Rpb25IZWlnaHQ6IDQ4LFxuXHRcdFx0XHRpY29uU2l6ZTogMjQsXG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGFjdCBjb25zdGFudHMgbWF0Y2ggcmVkdWNlZCBkaW1lbnNpb25zJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdHdpZHRoOiBBY3Rpdml0eWJhclBhcnQuQ09NUEFDVF9BQ1RJVklUWUJBUl9XSURUSCxcblx0XHRcdFx0YWN0aW9uSGVpZ2h0OiBBY3Rpdml0eWJhclBhcnQuQ09NUEFDVF9BQ1RJT05fSEVJR0hULFxuXHRcdFx0XHRpY29uU2l6ZTogQWN0aXZpdHliYXJQYXJ0LkNPTVBBQ1RfSUNPTl9TSVpFLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0d2lkdGg6IDM2LFxuXHRcdFx0XHRhY3Rpb25IZWlnaHQ6IDI4LFxuXHRcdFx0XHRpY29uU2l6ZTogMTYsXG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZmxvYXRpbmcgY29uc3RhbnRzIGFyZSBuYXJyb3dlciB0aGFuIGRlZmF1bHQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0d2lkdGg6IEFjdGl2aXR5YmFyUGFydC5GTE9BVElOR19BQ1RJVklUWUJBUl9XSURUSCxcblx0XHRcdFx0YWN0aW9uSGVpZ2h0OiBBY3Rpdml0eWJhclBhcnQuRkxPQVRJTkdfQUNUSU9OX0hFSUdIVCxcblx0XHRcdFx0Y29tcGFjdFdpZHRoOiBBY3Rpdml0eWJhclBhcnQuRkxPQVRJTkdfQ09NUEFDVF9BQ1RJVklUWUJBUl9XSURUSCxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHdpZHRoOiAzNixcblx0XHRcdFx0YWN0aW9uSGVpZ2h0OiAzNixcblx0XHRcdFx0Y29tcGFjdFdpZHRoOiAyOCxcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHQvLyAtLS0gRGltZW5zaW9uIGdldHRlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHR0ZXN0KCdkZWZhdWx0IG1vZGUgcmV0dXJucyBkZWZhdWx0IHdpZHRoIGNvbnN0cmFpbnRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcGFydCB9ID0gY3JlYXRlQWN0aXZpdHliYXJQYXJ0KGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBtaW46IHBhcnQubWluaW11bVdpZHRoLCBtYXg6IHBhcnQubWF4aW11bVdpZHRoIH0sXG5cdFx0XHR7IG1pbjogQWN0aXZpdHliYXJQYXJ0LkFDVElWSVRZQkFSX1dJRFRILCBtYXg6IEFjdGl2aXR5YmFyUGFydC5BQ1RJVklUWUJBUl9XSURUSCB9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGFjdCBtb2RlIHJldHVybnMgY29tcGFjdCB3aWR0aCBjb25zdHJhaW50cycsICgpID0+IHtcblx0XHRjb25zdCB7IHBhcnQgfSA9IGNyZWF0ZUFjdGl2aXR5YmFyUGFydCh0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBtaW46IHBhcnQubWluaW11bVdpZHRoLCBtYXg6IHBhcnQubWF4aW11bVdpZHRoIH0sXG5cdFx0XHR7IG1pbjogQWN0aXZpdHliYXJQYXJ0LkNPTVBBQ1RfQUNUSVZJVFlCQVJfV0lEVEgsIG1heDogQWN0aXZpdHliYXJQYXJ0LkNPTVBBQ1RfQUNUSVZJVFlCQVJfV0lEVEggfVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hlaWdodCBjb25zdHJhaW50cyBhcmUgdW5ib3VuZGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcGFydCB9ID0gY3JlYXRlQWN0aXZpdHliYXJQYXJ0KGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5taW5pbXVtSGVpZ2h0LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5tYXhpbXVtSGVpZ2h0LCBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFkpO1xuXHR9KTtcblxuXHR0ZXN0KCdmbG9hdGluZyBwYW5lbHMgcmVzZXJ2ZXMgb3V0ZXIgcGFkZGluZyBvbiB0aGUgbGVmdCcsICgpID0+IHtcblx0XHRjb25zdCB7IHBhcnQgfSA9IGNyZWF0ZUFjdGl2aXR5YmFyUGFydChmYWxzZSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBtaW46IHBhcnQubWluaW11bVdpZHRoLCBtYXg6IHBhcnQubWF4aW11bVdpZHRoIH0sXG5cdFx0XHR7XG5cdFx0XHRcdG1pbjogQWN0aXZpdHliYXJQYXJ0LkZMT0FUSU5HX0FDVElWSVRZQkFSX1dJRFRIICsgQWN0aXZpdHliYXJQYXJ0LkZMT0FUSU5HX01BUkdJTiAqIDIsXG5cdFx0XHRcdG1heDogQWN0aXZpdHliYXJQYXJ0LkZMT0FUSU5HX0FDVElWSVRZQkFSX1dJRFRIICsgQWN0aXZpdHliYXJQYXJ0LkZMT0FUSU5HX01BUkdJTiAqIDIsXG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZmxvYXRpbmcgcGFuZWxzIHJlc2VydmVzIGEgNHB4IGlubmVyIGdhcCBhbmQgYm90aCBndXR0ZXJzIG9uIHRoZSByaWdodCcsICgpID0+IHtcblx0XHRjb25zdCB7IHBhcnQgfSA9IGNyZWF0ZUFjdGl2aXR5YmFyUGFydChmYWxzZSwgdHJ1ZSwgUG9zaXRpb24uUklHSFQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgbWluOiBwYXJ0Lm1pbmltdW1XaWR0aCwgbWF4OiBwYXJ0Lm1heGltdW1XaWR0aCB9LFxuXHRcdFx0e1xuXHRcdFx0XHRtaW46IEFjdGl2aXR5YmFyUGFydC5GTE9BVElOR19BQ1RJVklUWUJBUl9XSURUSCArIEFjdGl2aXR5YmFyUGFydC5GTE9BVElOR19NQVJHSU4gKiAzLFxuXHRcdFx0XHRtYXg6IEFjdGl2aXR5YmFyUGFydC5GTE9BVElOR19BQ1RJVklUWUJBUl9XSURUSCArIEFjdGl2aXR5YmFyUGFydC5GTE9BVElOR19NQVJHSU4gKiAzLFxuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdC8vIC0tLSBDb25maWd1cmF0aW9uIGNoYW5nZTogZGltZW5zaW9uIHVwZGF0ZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0dGVzdCgndG9nZ2xpbmcgY29tcGFjdCB2aWEgY29uZmlnIGNoYW5nZXMgd2lkdGggY29uc3RyYWludHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwYXJ0LCBjb25maWdTZXJ2aWNlIH0gPSBjcmVhdGVBY3Rpdml0eWJhclBhcnQoZmFsc2UpO1xuXG5cdFx0Ly8gSW5pdGlhbGx5IGRlZmF1bHRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5taW5pbXVtV2lkdGgsIEFjdGl2aXR5YmFyUGFydC5BQ1RJVklUWUJBUl9XSURUSCk7XG5cblx0XHQvLyBTd2l0Y2ggdG8gY29tcGFjdFxuXHRcdGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oTGF5b3V0U2V0dGluZ3MuQUNUSVZJVFlfQkFSX0NPTVBBQ1QsIHRydWUpO1xuXHRcdGZpcmVDb25maWdDaGFuZ2UoY29uZmlnU2VydmljZSwgTGF5b3V0U2V0dGluZ3MuQUNUSVZJVFlfQkFSX0NPTVBBQ1QpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgbWluOiBwYXJ0Lm1pbmltdW1XaWR0aCwgbWF4OiBwYXJ0Lm1heGltdW1XaWR0aCB9LFxuXHRcdFx0eyBtaW46IEFjdGl2aXR5YmFyUGFydC5DT01QQUNUX0FDVElWSVRZQkFSX1dJRFRILCBtYXg6IEFjdGl2aXR5YmFyUGFydC5DT01QQUNUX0FDVElWSVRZQkFSX1dJRFRIIH1cblx0XHQpO1xuXG5cdFx0Ly8gU3dpdGNoIGJhY2sgdG8gZGVmYXVsdFxuXHRcdGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oTGF5b3V0U2V0dGluZ3MuQUNUSVZJVFlfQkFSX0NPTVBBQ1QsIGZhbHNlKTtcblx0XHRmaXJlQ29uZmlnQ2hhbmdlKGNvbmZpZ1NlcnZpY2UsIExheW91dFNldHRpbmdzLkFDVElWSVRZX0JBUl9DT01QQUNUKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IG1pbjogcGFydC5taW5pbXVtV2lkdGgsIG1heDogcGFydC5tYXhpbXVtV2lkdGggfSxcblx0XHRcdHsgbWluOiBBY3Rpdml0eWJhclBhcnQuQUNUSVZJVFlCQVJfV0lEVEgsIG1heDogQWN0aXZpdHliYXJQYXJ0LkFDVElWSVRZQkFSX1dJRFRIIH1cblx0XHQpO1xuXHR9KTtcblxuXHQvLyAtLS0gb25EaWRDaGFuZ2UgZmlyZXMgZm9yIGdyaWQgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHRlc3QoJ2ZpcmVzIG9uRGlkQ2hhbmdlKHVuZGVmaW5lZCkgd2hlbiBjb21wYWN0IHNldHRpbmcgY2hhbmdlcycsICgpID0+IHtcblx0XHRjb25zdCB7IHBhcnQsIGNvbmZpZ1NlcnZpY2UgfSA9IGNyZWF0ZUFjdGl2aXR5YmFyUGFydChmYWxzZSk7XG5cblx0XHRjb25zdCBldmVudHM6IChJVmlld1NpemUgfCB1bmRlZmluZWQpW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocGFydC5vbkRpZENoYW5nZShlID0+IGV2ZW50cy5wdXNoKGUpKSk7XG5cblx0XHQvLyBUb2dnbGUgdG8gY29tcGFjdFxuXHRcdGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oTGF5b3V0U2V0dGluZ3MuQUNUSVZJVFlfQkFSX0NPTVBBQ1QsIHRydWUpO1xuXHRcdGZpcmVDb25maWdDaGFuZ2UoY29uZmlnU2VydmljZSwgTGF5b3V0U2V0dGluZ3MuQUNUSVZJVFlfQkFSX0NPTVBBQ1QpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHNbMF0sIHVuZGVmaW5lZCwgJ3Nob3VsZCBmaXJlIHVuZGVmaW5lZCB0byBzaWduYWwgY29uc3RyYWludCBjaGFuZ2UnKTtcblxuXHRcdC8vIFRvZ2dsZSBiYWNrXG5cdFx0Y29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihMYXlvdXRTZXR0aW5ncy5BQ1RJVklUWV9CQVJfQ09NUEFDVCwgZmFsc2UpO1xuXHRcdGZpcmVDb25maWdDaGFuZ2UoY29uZmlnU2VydmljZSwgTGF5b3V0U2V0dGluZ3MuQUNUSVZJVFlfQkFSX0NPTVBBQ1QpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHNbMV0sIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGZpcmUgb25EaWRDaGFuZ2UgZm9yIHVucmVsYXRlZCBjb25maWcgY2hhbmdlcycsICgpID0+IHtcblx0XHRjb25zdCB7IHBhcnQsIGNvbmZpZ1NlcnZpY2UgfSA9IGNyZWF0ZUFjdGl2aXR5YmFyUGFydChmYWxzZSk7XG5cblx0XHRjb25zdCBldmVudHM6IChJVmlld1NpemUgfCB1bmRlZmluZWQpW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocGFydC5vbkRpZENoYW5nZShlID0+IGV2ZW50cy5wdXNoKGUpKSk7XG5cblx0XHRmaXJlQ29uZmlnQ2hhbmdlKGNvbmZpZ1NlcnZpY2UsICdlZGl0b3IuZm9udFNpemUnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnZmlyZXMgb25EaWRDaGFuZ2UodW5kZWZpbmVkKSB3aGVuIGZsb2F0aW5nIHBhbmVscyBzZXR0aW5nIGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwYXJ0LCBjb25maWdTZXJ2aWNlLCBsYXlvdXRTZXJ2aWNlIH0gPSBjcmVhdGVBY3Rpdml0eWJhclBhcnQoZmFsc2UsIGZhbHNlKTtcblxuXHRcdGNvbnN0IGV2ZW50czogKElWaWV3U2l6ZSB8IHVuZGVmaW5lZClbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwYXJ0Lm9uRGlkQ2hhbmdlKGUgPT4gZXZlbnRzLnB1c2goZSkpKTtcblxuXHRcdGxheW91dFNlcnZpY2UuZmxvYXRpbmdQYW5lbHNFbmFibGVkID0gdHJ1ZTtcblx0XHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKExheW91dFNldHRpbmdzLk1PREVSTl9VSSwgdHJ1ZSk7XG5cdFx0ZmlyZUNvbmZpZ0NoYW5nZShjb25maWdTZXJ2aWNlLCBMYXlvdXRTZXR0aW5ncy5NT0RFUk5fVUkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudHMsIFt1bmRlZmluZWRdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5taW5pbXVtV2lkdGgsIEFjdGl2aXR5YmFyUGFydC5GTE9BVElOR19BQ1RJVklUWUJBUl9XSURUSCArIEFjdGl2aXR5YmFyUGFydC5GTE9BVElOR19NQVJHSU4gKiAyKTtcblx0fSk7XG5cblx0Ly8gLS0tIENTUyBjdXN0b20gcHJvcGVydGllcyBvbiBlbGVtZW50IC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0dGVzdCgndXBkYXRlQ29tcGFjdFN0eWxlIHNldHMgY29ycmVjdCBDU1MgY3VzdG9tIHByb3BlcnRpZXMgaW4gZGVmYXVsdCBtb2RlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcGFydCB9ID0gY3JlYXRlQWN0aXZpdHliYXJQYXJ0KGZhbHNlKTtcblxuXHRcdGNvbnN0IGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0Zml4dHVyZS5hcHBlbmRDaGlsZChlbCk7XG5cdFx0cGFydC5jcmVhdGUoZWwpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVsLnN0eWxlLmdldFByb3BlcnR5VmFsdWUoJy0tYWN0aXZpdHktYmFyLXdpZHRoJyksIGAke0FjdGl2aXR5YmFyUGFydC5BQ1RJVklUWUJBUl9XSURUSH1weGApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbC5zdHlsZS5nZXRQcm9wZXJ0eVZhbHVlKCctLWFjdGl2aXR5LWJhci1hY3Rpb24taGVpZ2h0JyksIGAke0FjdGl2aXR5YmFyUGFydC5BQ1RJT05fSEVJR0hUfXB4YCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVsLnN0eWxlLmdldFByb3BlcnR5VmFsdWUoJy0tYWN0aXZpdHktYmFyLWljb24tc2l6ZScpLCBgJHtBY3Rpdml0eWJhclBhcnQuSUNPTl9TSVpFfXB4YCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVsLmNsYXNzTGlzdC5jb250YWlucygnY29tcGFjdCcpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZUNvbXBhY3RTdHlsZSBzZXRzIGNvcnJlY3QgQ1NTIGN1c3RvbSBwcm9wZXJ0aWVzIGluIGNvbXBhY3QgbW9kZScsICgpID0+IHtcblx0XHRjb25zdCB7IHBhcnQgfSA9IGNyZWF0ZUFjdGl2aXR5YmFyUGFydCh0cnVlKTtcblxuXHRcdGNvbnN0IGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0Zml4dHVyZS5hcHBlbmRDaGlsZChlbCk7XG5cdFx0cGFydC5jcmVhdGUoZWwpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVsLnN0eWxlLmdldFByb3BlcnR5VmFsdWUoJy0tYWN0aXZpdHktYmFyLXdpZHRoJyksIGAke0FjdGl2aXR5YmFyUGFydC5DT01QQUNUX0FDVElWSVRZQkFSX1dJRFRIfXB4YCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVsLnN0eWxlLmdldFByb3BlcnR5VmFsdWUoJy0tYWN0aXZpdHktYmFyLWFjdGlvbi1oZWlnaHQnKSwgYCR7QWN0aXZpdHliYXJQYXJ0LkNPTVBBQ1RfQUNUSU9OX0hFSUdIVH1weGApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbC5zdHlsZS5nZXRQcm9wZXJ0eVZhbHVlKCctLWFjdGl2aXR5LWJhci1pY29uLXNpemUnKSwgYCR7QWN0aXZpdHliYXJQYXJ0LkNPTVBBQ1RfSUNPTl9TSVpFfXB4YCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVsLmNsYXNzTGlzdC5jb250YWlucygnY29tcGFjdCcpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlQ29tcGFjdFN0eWxlIHNldHMgY29ycmVjdCBDU1MgY3VzdG9tIHByb3BlcnRpZXMgaW4gZmxvYXRpbmcgbW9kZScsICgpID0+IHtcblx0XHRjb25zdCB7IHBhcnQgfSA9IGNyZWF0ZUFjdGl2aXR5YmFyUGFydChmYWxzZSwgdHJ1ZSk7XG5cblx0XHRjb25zdCBlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGZpeHR1cmUuYXBwZW5kQ2hpbGQoZWwpO1xuXHRcdHBhcnQuY3JlYXRlKGVsKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbC5zdHlsZS5nZXRQcm9wZXJ0eVZhbHVlKCctLWFjdGl2aXR5LWJhci13aWR0aCcpLCBgJHtBY3Rpdml0eWJhclBhcnQuRkxPQVRJTkdfQUNUSVZJVFlCQVJfV0lEVEh9cHhgKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWwuc3R5bGUuZ2V0UHJvcGVydHlWYWx1ZSgnLS1hY3Rpdml0eS1iYXItYWN0aW9uLWhlaWdodCcpLCBgJHtBY3Rpdml0eWJhclBhcnQuRkxPQVRJTkdfQUNUSU9OX0hFSUdIVH1weGApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbC5zdHlsZS5nZXRQcm9wZXJ0eVZhbHVlKCctLWFjdGl2aXR5LWJhci1pY29uLXNpemUnKSwgYCR7QWN0aXZpdHliYXJQYXJ0LklDT05fU0laRX1weGApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbC5jbGFzc0xpc3QuY29udGFpbnMoJ2NvbXBhY3QnKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCd0b2dnbGluZyBjb21wYWN0IHVwZGF0ZXMgQ1NTIGN1c3RvbSBwcm9wZXJ0aWVzIG9uIGVsZW1lbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwYXJ0LCBjb25maWdTZXJ2aWNlIH0gPSBjcmVhdGVBY3Rpdml0eWJhclBhcnQoZmFsc2UpO1xuXG5cdFx0Y29uc3QgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRmaXh0dXJlLmFwcGVuZENoaWxkKGVsKTtcblx0XHRwYXJ0LmNyZWF0ZShlbCk7XG5cblx0XHQvLyBEZWZhdWx0IHN0YXRlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVsLnN0eWxlLmdldFByb3BlcnR5VmFsdWUoJy0tYWN0aXZpdHktYmFyLXdpZHRoJyksIGAke0FjdGl2aXR5YmFyUGFydC5BQ1RJVklUWUJBUl9XSURUSH1weGApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbC5jbGFzc0xpc3QuY29udGFpbnMoJ2NvbXBhY3QnKSwgZmFsc2UpO1xuXG5cdFx0Ly8gU3dpdGNoIHRvIGNvbXBhY3Rcblx0XHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKExheW91dFNldHRpbmdzLkFDVElWSVRZX0JBUl9DT01QQUNULCB0cnVlKTtcblx0XHRmaXJlQ29uZmlnQ2hhbmdlKGNvbmZpZ1NlcnZpY2UsIExheW91dFNldHRpbmdzLkFDVElWSVRZX0JBUl9DT01QQUNUKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbC5zdHlsZS5nZXRQcm9wZXJ0eVZhbHVlKCctLWFjdGl2aXR5LWJhci13aWR0aCcpLCBgJHtBY3Rpdml0eWJhclBhcnQuQ09NUEFDVF9BQ1RJVklUWUJBUl9XSURUSH1weGApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbC5zdHlsZS5nZXRQcm9wZXJ0eVZhbHVlKCctLWFjdGl2aXR5LWJhci1hY3Rpb24taGVpZ2h0JyksIGAke0FjdGl2aXR5YmFyUGFydC5DT01QQUNUX0FDVElPTl9IRUlHSFR9cHhgKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWwuc3R5bGUuZ2V0UHJvcGVydHlWYWx1ZSgnLS1hY3Rpdml0eS1iYXItaWNvbi1zaXplJyksIGAke0FjdGl2aXR5YmFyUGFydC5DT01QQUNUX0lDT05fU0laRX1weGApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbC5jbGFzc0xpc3QuY29udGFpbnMoJ2NvbXBhY3QnKSwgdHJ1ZSk7XG5cblx0XHQvLyBTd2l0Y2ggYmFja1xuXHRcdGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oTGF5b3V0U2V0dGluZ3MuQUNUSVZJVFlfQkFSX0NPTVBBQ1QsIGZhbHNlKTtcblx0XHRmaXJlQ29uZmlnQ2hhbmdlKGNvbmZpZ1NlcnZpY2UsIExheW91dFNldHRpbmdzLkFDVElWSVRZX0JBUl9DT01QQUNUKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbC5zdHlsZS5nZXRQcm9wZXJ0eVZhbHVlKCctLWFjdGl2aXR5LWJhci13aWR0aCcpLCBgJHtBY3Rpdml0eWJhclBhcnQuQUNUSVZJVFlCQVJfV0lEVEh9cHhgKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWwuc3R5bGUuZ2V0UHJvcGVydHlWYWx1ZSgnLS1hY3Rpdml0eS1iYXItYWN0aW9uLWhlaWdodCcpLCBgJHtBY3Rpdml0eWJhclBhcnQuQUNUSU9OX0hFSUdIVH1weGApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbC5zdHlsZS5nZXRQcm9wZXJ0eVZhbHVlKCctLWFjdGl2aXR5LWJhci1pY29uLXNpemUnKSwgYCR7QWN0aXZpdHliYXJQYXJ0LklDT05fU0laRX1weGApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbC5jbGFzc0xpc3QuY29udGFpbnMoJ2NvbXBhY3QnKSwgZmFsc2UpO1xuXHR9KTtcblxuXHQvLyAtLS0gdG9KU09OIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHRlc3QoJ3RvSlNPTiByZXR1cm5zIGNvcnJlY3QgcGFydCB0eXBlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcGFydCB9ID0gY3JlYXRlQWN0aXZpdHliYXJQYXJ0KGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnQudG9KU09OKCksIHsgdHlwZTogUGFydHMuQUNUSVZJVFlCQVJfUEFSVCB9KTtcblx0fSk7XG5cblx0Ly8gLS0tIGxheW91dDogZmxvYXRpbmcgcGFuZWxzIGd1dHRlciByZXNlcnZhdGlvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0Ly8gVGhlIHBhcnQgaGFzIG5vIHRpdGxlLCBoZWFkZXIgb3IgZm9vdGVyLCBzbyB0aGUgY29udGVudCBhcmVhIGVuZHMgdXAgZXhhY3RseSB0aGUgaGVpZ2h0IGBsYXlvdXQoKWAgcmVzZXJ2ZWQuXG5cdGZ1bmN0aW9uIGxheW91dENvbnRlbnRIZWlnaHQodmlzaWJsZVBhcnRzOiBQYXJ0c1tdLCBmbG9hdGluZ1BhbmVsc0VuYWJsZWQgPSB0cnVlKTogbnVtYmVyIHtcblx0XHRjb25zdCB7IHBhcnQsIGxheW91dFNlcnZpY2UgfSA9IGNyZWF0ZUFjdGl2aXR5YmFyUGFydChmYWxzZSwgZmxvYXRpbmdQYW5lbHNFbmFibGVkKTtcblx0XHRjb25zdCBlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGZpeHR1cmUuYXBwZW5kQ2hpbGQoZWwpO1xuXHRcdHBhcnQuY3JlYXRlKGVsKTtcblxuXHRcdGNvbnN0IHZpc2libGUgPSBuZXcgU2V0KHZpc2libGVQYXJ0cyk7XG5cdFx0bGF5b3V0U2VydmljZS5pc1Zpc2libGUgPSAocGFydElkOiBQYXJ0cykgPT4gdmlzaWJsZS5oYXMocGFydElkKTtcblx0XHRwYXJ0LmxheW91dCgxMDAsIDMwMCk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gZWwucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5jb250ZW50Jyk7XG5cdFx0cmV0dXJuIHBhcnNlSW50KGNvbnRlbnQhLnN0eWxlLmhlaWdodCwgMTApO1xuXHR9XG5cblx0dGVzdCgncmVzZXJ2ZXMgYSBkb3VibGVkIGd1dHRlciBvbiBlYWNoIHdpbmRvdyBlZGdlIHRoZSBhY3Rpdml0eSBiYXIgZmFjZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFyZ2luID0gQWN0aXZpdHliYXJQYXJ0LkZMT0FUSU5HX01BUkdJTjtcblx0XHRjb25zdCBhY3R1YWwgPSB7XG5cdFx0XHQvLyBXaW5kb3dlZCBkZWZhdWx0OiBhIHRpdGxlIGJhciBhYm92ZSBhbmQgYSBzdGF0dXMgYmFyIGJlbG93LCBzbyBuZWl0aGVyIGlzIGEgd2luZG93IGVkZ2UuXG5cdFx0XHR0aXRsZUFuZFN0YXR1c0JhclZpc2libGU6IGxheW91dENvbnRlbnRIZWlnaHQoW1BhcnRzLlRJVExFQkFSX1BBUlQsIFBhcnRzLlNUQVRVU0JBUl9QQVJUXSksXG5cblx0XHRcdC8vIE5hdGl2ZSBmdWxsc2NyZWVuOiBub3RoaW5nIGFib3ZlIHRoZSBtaWRkbGUgc2VjdGlvbiwgc28gdGhlIHRvcCBpcyBhIHdpbmRvdyBlZGdlLlxuXHRcdFx0dGl0bGVCYXJIaWRkZW46IGxheW91dENvbnRlbnRIZWlnaHQoW1BhcnRzLlNUQVRVU0JBUl9QQVJUXSksXG5cblx0XHRcdC8vIEEgdmlzaWJsZSBiYW5uZXIgc3RpbGwgb2NjdXBpZXMgdGhlIHJvdyBhYm92ZSwgc28gdGhlIHRvcCBpcyBub3QgYSB3aW5kb3cgZWRnZS5cblx0XHRcdGJhbm5lckluc3RlYWRPZlRpdGxlQmFyOiBsYXlvdXRDb250ZW50SGVpZ2h0KFtQYXJ0cy5CQU5ORVJfUEFSVCwgUGFydHMuU1RBVFVTQkFSX1BBUlRdKSxcblxuXHRcdFx0Ly8gSGlkZGVuIHN0YXR1cyBiYXI6IHRoZSBhY3Rpdml0eSBiYXIgbm93IHJlYWNoZXMgdGhlIHdpbmRvdyBib3R0b20gZWRnZS5cblx0XHRcdHN0YXR1c0JhckhpZGRlbjogbGF5b3V0Q29udGVudEhlaWdodChbUGFydHMuVElUTEVCQVJfUEFSVF0pLFxuXG5cdFx0XHQvLyBCb3RoIGVkZ2VzIGF0IG9uY2UuXG5cdFx0XHRib3RoRWRnZXNFeHBvc2VkOiBsYXlvdXRDb250ZW50SGVpZ2h0KFtdKSxcblxuXHRcdFx0Ly8gRXhwZXJpbWVudCBkaXNhYmxlZDogdGhlIGFjdGl2aXR5IGJhciBpcyBub3QgYSBmbG9hdGluZyBjYXJkLCBzbyBubyBndXR0ZXJzIGF0IGFsbC5cblx0XHRcdGZsb2F0aW5nUGFuZWxzRGlzYWJsZWQ6IGxheW91dENvbnRlbnRIZWlnaHQoW10sIGZhbHNlKSxcblx0XHR9O1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIHtcblx0XHRcdHRpdGxlQW5kU3RhdHVzQmFyVmlzaWJsZTogMzAwIC0gbWFyZ2luLFxuXHRcdFx0dGl0bGVCYXJIaWRkZW46IDMwMCAtIG1hcmdpbiAqIDIgLSBtYXJnaW4sXG5cdFx0XHRiYW5uZXJJbnN0ZWFkT2ZUaXRsZUJhcjogMzAwIC0gbWFyZ2luLFxuXHRcdFx0c3RhdHVzQmFySGlkZGVuOiAzMDAgLSBtYXJnaW4gKiAyLFxuXHRcdFx0Ym90aEVkZ2VzRXhwb3NlZDogMzAwIC0gbWFyZ2luICogMiAtIG1hcmdpbiAqIDIsXG5cdFx0XHRmbG9hdGluZ1BhbmVsc0Rpc2FibGVkOiAzMDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUyxnQkFBZ0IsT0FBTyxnQkFBZ0I7QUFDaEQsU0FBUyxrQkFBa0I7QUFHM0IsU0FBUyxPQUFPLGVBQWU7QUFFL0IsU0FBUyxrQkFBMkM7QUFFcEQsU0FBUyw2QkFBNkI7QUFFdEMsTUFBTSxzQkFBb0Q7QUFBQSxFQUExRDtBQUVDLFNBQVMsU0FBUyxNQUFNO0FBQ3hCLFNBQVMsYUFBYSxXQUFXO0FBQ2pDLG1CQUF1QjtBQUN2Qix3QkFBZTtBQUNmLHdCQUFlO0FBQ2YseUJBQWdCO0FBQ2hCLHlCQUFnQjtBQUNoQix1QkFBYyxNQUFNO0FBQ3BCLGtDQUF5QixJQUFJLFFBQXdCLEVBQUU7QUFDdkQsbUNBQTBCLElBQUksUUFBd0IsRUFBRTtBQUFBO0FBQUEsRUFDeEQsb0JBQXlEO0FBQUUsV0FBTyxRQUFRLFFBQVEsTUFBUztB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
