import assert from "assert";
import { mainWindow } from "../../../../../base/browser/window.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { FLOATING_PANEL_INNER_MARGIN, FLOATING_PANEL_MARGIN, getFloatingEditorVerticalMargins, getFloatingOuterEdgeOwners, getFloatingPaneCompositeHorizontalMargins, getFloatingPaneCompositeVerticalMargins, getFloatingSidebarSiblingToEditorStatus, isFloatingTopEdgeExposed, Parts, Position } from "../../browser/layoutService.js";
import { TestLayoutService } from "../../../../test/browser/workbenchTestServices.js";
suite("LayoutService - isFloatingTopEdgeExposed", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  class VisibilityLayoutService extends TestLayoutService {
    constructor() {
      super(...arguments);
      this.visibleParts = /* @__PURE__ */ new Set();
    }
    isVisible(part) {
      return this.visibleParts.has(part);
    }
  }
  function topEdgeExposed(visible) {
    const service = new VisibilityLayoutService();
    service.visibleParts = new Set(visible);
    return isFloatingTopEdgeExposed(service, mainWindow);
  }
  test("exposed only when both the title bar and the banner are hidden", () => {
    const actual = {
      bothHidden: topEdgeExposed([]),
      titleBarVisible: topEdgeExposed([Parts.TITLEBAR_PART]),
      bannerVisible: topEdgeExposed([Parts.BANNER_PART]),
      bothVisible: topEdgeExposed([Parts.TITLEBAR_PART, Parts.BANNER_PART])
    };
    assert.deepStrictEqual(actual, {
      bothHidden: true,
      titleBarVisible: false,
      bannerVisible: false,
      bothVisible: false
    });
  });
});
suite("LayoutService - floating panel spacing", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("uses a 4px inter-card gap", () => {
    assert.deepStrictEqual({
      leadingMargin: FLOATING_PANEL_MARGIN,
      trailingMargin: FLOATING_PANEL_INNER_MARGIN,
      gap: FLOATING_PANEL_MARGIN + FLOATING_PANEL_INNER_MARGIN
    }, {
      leadingMargin: 4,
      trailingMargin: 0,
      gap: 4
    });
  });
});
suite("LayoutService - getFloatingOuterEdgeOwners", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  class ConfigurableLayoutService extends TestLayoutService {
    constructor() {
      super(...arguments);
      this.floatingPanelsEnabled = true;
      this.sideBarPosition = Position.LEFT;
      this.panelPosition = Position.BOTTOM;
      this.visibleParts = /* @__PURE__ */ new Set();
    }
    isFloatingPanelsEnabled() {
      return this.floatingPanelsEnabled;
    }
    getSideBarPosition() {
      return this.sideBarPosition;
    }
    getPanelPosition() {
      return this.panelPosition;
    }
    isVisible(part) {
      return this.visibleParts.has(part);
    }
  }
  function owners(configure) {
    const service = new ConfigurableLayoutService();
    configure(service);
    return getFloatingOuterEdgeOwners(service);
  }
  test("edge ownership across layouts", () => {
    const actual = {
      // Experiment disabled: no owners regardless of layout.
      disabled: owners((s) => {
        s.floatingPanelsEnabled = false;
        s.visibleParts = /* @__PURE__ */ new Set([Parts.AUXILIARYBAR_PART]);
      }),
      // Default full layout (side bar left): activity bar hugs the left edge (no owner),
      // the secondary side bar owns the right edge.
      defaultFull: owners((s) => {
        s.visibleParts = /* @__PURE__ */ new Set([Parts.ACTIVITYBAR_PART, Parts.SIDEBAR_PART, Parts.EDITOR_PART, Parts.AUXILIARYBAR_PART]);
      }),
      // Maximized aux bar with the activity bar in its default (visible) position: the
      // activity bar still hugs the left edge, the aux bar owns the right edge.
      maximizedAuxWithActivityBar: owners((s) => {
        s.visibleParts = /* @__PURE__ */ new Set([Parts.ACTIVITYBAR_PART, Parts.AUXILIARYBAR_PART]);
      }),
      // Maximized aux bar with the activity bar not in its default position (hidden from
      // the side column): the aux bar spans the full width and owns both edges.
      maximizedAuxNoActivityBar: owners((s) => {
        s.visibleParts = /* @__PURE__ */ new Set([Parts.AUXILIARYBAR_PART]);
      }),
      // Same, but the side bar is on the right: the aux bar still spans and owns both edges.
      maximizedAuxNoActivityBarSideBarRight: owners((s) => {
        s.sideBarPosition = Position.RIGHT;
        s.visibleParts = /* @__PURE__ */ new Set([Parts.AUXILIARYBAR_PART]);
      }),
      // Only the editor visible with the activity bar hidden: the editor is the sole card
      // and owns both edges.
      editorOnly: owners((s) => {
        s.visibleParts = /* @__PURE__ */ new Set([Parts.EDITOR_PART]);
      }),
      // Full layout with a visible left vertical panel: the panel sits between the editor
      // and the side bar, so it never reaches an edge.
      verticalPanelFull: owners((s) => {
        s.panelPosition = Position.LEFT;
        s.visibleParts = /* @__PURE__ */ new Set([Parts.ACTIVITYBAR_PART, Parts.SIDEBAR_PART, Parts.PANEL_PART, Parts.EDITOR_PART, Parts.AUXILIARYBAR_PART]);
      }),
      // Maximized left vertical panel with the activity bar hidden: the panel spans the
      // full width and owns both edges.
      maximizedVerticalPanel: owners((s) => {
        s.panelPosition = Position.LEFT;
        s.visibleParts = /* @__PURE__ */ new Set([Parts.PANEL_PART]);
      }),
      // Visible horizontal (bottom) panel: not part of the vertical order, so it owns no
      // edge; the secondary side bar still owns the right edge.
      horizontalPanelVisible: owners((s) => {
        s.panelPosition = Position.BOTTOM;
        s.visibleParts = /* @__PURE__ */ new Set([Parts.SIDEBAR_PART, Parts.EDITOR_PART, Parts.PANEL_PART, Parts.AUXILIARYBAR_PART]);
      })
    };
    assert.deepStrictEqual(actual, {
      disabled: { left: void 0, right: void 0 },
      defaultFull: { left: void 0, right: Parts.AUXILIARYBAR_PART },
      maximizedAuxWithActivityBar: { left: void 0, right: Parts.AUXILIARYBAR_PART },
      maximizedAuxNoActivityBar: { left: Parts.AUXILIARYBAR_PART, right: Parts.AUXILIARYBAR_PART },
      maximizedAuxNoActivityBarSideBarRight: { left: Parts.AUXILIARYBAR_PART, right: Parts.AUXILIARYBAR_PART },
      editorOnly: { left: Parts.EDITOR_PART, right: Parts.EDITOR_PART },
      verticalPanelFull: { left: void 0, right: Parts.AUXILIARYBAR_PART },
      maximizedVerticalPanel: { left: Parts.PANEL_PART, right: Parts.PANEL_PART },
      horizontalPanelVisible: { left: Parts.SIDEBAR_PART, right: Parts.AUXILIARYBAR_PART }
    });
  });
});
suite("LayoutService - getFloatingPaneCompositeHorizontalMargins", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  class HorizontalMarginLayoutService extends TestLayoutService {
    constructor() {
      super(...arguments);
      this.floatingPanelsEnabled = true;
      this.sideBarPosition = Position.LEFT;
      this.visibleParts = /* @__PURE__ */ new Set();
    }
    isFloatingPanelsEnabled() {
      return this.floatingPanelsEnabled;
    }
    getSideBarPosition() {
      return this.sideBarPosition;
    }
    isVisible(part) {
      return this.visibleParts.has(part);
    }
  }
  function margins(partId, visibleParts, sideBarPosition = Position.LEFT) {
    const service = new HorizontalMarginLayoutService();
    service.sideBarPosition = sideBarPosition;
    service.visibleParts = new Set(visibleParts);
    return getFloatingPaneCompositeHorizontalMargins(service, partId);
  }
  test("secondary side bar uses an 8px gutter opposite the activity bar", () => {
    assert.deepStrictEqual({
      activityBarLeft: margins(Parts.AUXILIARYBAR_PART, [Parts.ACTIVITYBAR_PART, Parts.SIDEBAR_PART, Parts.EDITOR_PART, Parts.AUXILIARYBAR_PART]),
      activityBarRight: margins(Parts.AUXILIARYBAR_PART, [Parts.ACTIVITYBAR_PART, Parts.SIDEBAR_PART, Parts.EDITOR_PART, Parts.AUXILIARYBAR_PART], Position.RIGHT),
      secondarySideBarOnly: margins(Parts.AUXILIARYBAR_PART, [Parts.AUXILIARYBAR_PART])
    }, {
      activityBarLeft: { left: 4, right: 8 },
      activityBarRight: { left: 8, right: 0 },
      secondarySideBarOnly: { left: 8, right: 8 }
    });
  });
});
suite("LayoutService - getFloatingSidebarSiblingToEditorStatus", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  class SiblingStatusLayoutService extends TestLayoutService {
    constructor() {
      super(...arguments);
      this.sideBarPosition = Position.LEFT;
      this.panelAlignment = "center";
    }
    getSideBarPosition() {
      return this.sideBarPosition;
    }
    getPanelAlignment() {
      return this.panelAlignment;
    }
  }
  function siblingStatus(configure) {
    const s = new SiblingStatusLayoutService();
    configure(s);
    return getFloatingSidebarSiblingToEditorStatus(s);
  }
  test("sibling-to-editor status across alignment and sidebar-position combinations", () => {
    const actual = {
      // center: neither bar is a sibling (both span full height)
      centerLeft: siblingStatus((s) => {
        s.sideBarPosition = Position.LEFT;
        s.panelAlignment = "center";
      }),
      centerRight: siblingStatus((s) => {
        s.sideBarPosition = Position.RIGHT;
        s.panelAlignment = "center";
      }),
      // justify: both bars are siblings (panel spans the full width)
      justifyLeft: siblingStatus((s) => {
        s.sideBarPosition = Position.LEFT;
        s.panelAlignment = "justify";
      }),
      justifyRight: siblingStatus((s) => {
        s.sideBarPosition = Position.RIGHT;
        s.panelAlignment = "justify";
      }),
      // left alignment, sidebar on LEFT: sidebar IS sibling, aux bar is NOT
      leftAlignSidebarLeft: siblingStatus((s) => {
        s.sideBarPosition = Position.LEFT;
        s.panelAlignment = "left";
      }),
      // left alignment, sidebar on RIGHT: sidebar is NOT sibling, aux bar IS
      leftAlignSidebarRight: siblingStatus((s) => {
        s.sideBarPosition = Position.RIGHT;
        s.panelAlignment = "left";
      }),
      // right alignment, sidebar on LEFT: sidebar is NOT sibling, aux bar IS
      rightAlignSidebarLeft: siblingStatus((s) => {
        s.sideBarPosition = Position.LEFT;
        s.panelAlignment = "right";
      }),
      // right alignment, sidebar on RIGHT: sidebar IS sibling, aux bar is NOT
      rightAlignSidebarRight: siblingStatus((s) => {
        s.sideBarPosition = Position.RIGHT;
        s.panelAlignment = "right";
      })
    };
    assert.deepStrictEqual(actual, {
      centerLeft: { sideBar: false, auxBar: false },
      centerRight: { sideBar: false, auxBar: false },
      justifyLeft: { sideBar: true, auxBar: true },
      justifyRight: { sideBar: true, auxBar: true },
      leftAlignSidebarLeft: { sideBar: true, auxBar: false },
      leftAlignSidebarRight: { sideBar: false, auxBar: true },
      rightAlignSidebarLeft: { sideBar: false, auxBar: true },
      rightAlignSidebarRight: { sideBar: true, auxBar: false }
    });
  });
});
class VerticalMarginLayoutService extends TestLayoutService {
  constructor() {
    super(...arguments);
    this.floatingPanelsEnabled = true;
    this.panelPosition = Position.BOTTOM;
    this.panelAlignment = "center";
    this.visibleParts = /* @__PURE__ */ new Set([Parts.TITLEBAR_PART, Parts.STATUSBAR_PART, Parts.EDITOR_PART]);
  }
  isFloatingPanelsEnabled() {
    return this.floatingPanelsEnabled;
  }
  getPanelPosition() {
    return this.panelPosition;
  }
  getPanelAlignment() {
    return this.panelAlignment;
  }
  isVisible(part) {
    return this.visibleParts.has(part);
  }
}
suite("LayoutService - getFloatingPaneCompositeVerticalMargins", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function margins(partId, configure) {
    const service = new VerticalMarginLayoutService();
    configure(service);
    return getFloatingPaneCompositeVerticalMargins(service, partId, mainWindow);
  }
  const inner = FLOATING_PANEL_INNER_MARGIN;
  const margin = FLOATING_PANEL_MARGIN;
  const outer = FLOATING_PANEL_MARGIN * 2;
  test("bottom panel top margin across editor visibility and top edge", () => {
    const bottomPanel = (configure) => margins(Parts.PANEL_PART, (s) => {
      s.visibleParts.add(Parts.PANEL_PART);
      configure(s);
    });
    const actual = {
      // Editor above the panel: the gap is between two cards.
      editorVisible: bottomPanel(() => {
      }),
      // Maximized panel (editor hidden) below a title bar: it takes over that row.
      maximizedUnderTitleBar: bottomPanel((s) => {
        s.visibleParts.delete(Parts.EDITOR_PART);
      }),
      // Maximized panel with nothing above it: the top is now a window edge.
      maximizedAtTopEdge: bottomPanel((s) => {
        s.visibleParts.delete(Parts.EDITOR_PART);
        s.visibleParts.delete(Parts.TITLEBAR_PART);
      }),
      // Maximized panel with a banner above it: still not a window edge.
      maximizedUnderBanner: bottomPanel((s) => {
        s.visibleParts.delete(Parts.EDITOR_PART);
        s.visibleParts.delete(Parts.TITLEBAR_PART);
        s.visibleParts.add(Parts.BANNER_PART);
      })
    };
    assert.deepStrictEqual(actual, {
      editorVisible: { top: margin, bottom: margin },
      maximizedUnderTitleBar: { top: inner, bottom: margin },
      maximizedAtTopEdge: { top: outer, bottom: margin },
      maximizedUnderBanner: { top: inner, bottom: margin }
    });
  });
  test("margins across panel positions", () => {
    const actual = {
      // Top panel: its bottom faces the editor, so it never reaches the window bottom.
      topPanelStatusBarHidden: margins(Parts.PANEL_PART, (s) => {
        s.panelPosition = Position.TOP;
        s.visibleParts.add(Parts.PANEL_PART);
        s.visibleParts.delete(Parts.STATUSBAR_PART);
      }),
      // Vertical panel: full height, so both edges are window edges.
      leftPanelAtBothEdges: margins(Parts.PANEL_PART, (s) => {
        s.panelPosition = Position.LEFT;
        s.visibleParts.add(Parts.PANEL_PART);
        s.visibleParts.delete(Parts.TITLEBAR_PART);
        s.visibleParts.delete(Parts.STATUSBAR_PART);
      }),
      // Side bar beside a top panel, center alignment: full height, so it starts at the top edge.
      sideBarTopPanelCentered: margins(Parts.SIDEBAR_PART, (s) => {
        s.panelPosition = Position.TOP;
        s.visibleParts.add(Parts.PANEL_PART);
        s.visibleParts.delete(Parts.TITLEBAR_PART);
      }),
      // Same but justified: the bar is a sibling, so its top faces the panel card.
      sideBarTopPanelJustified: margins(Parts.SIDEBAR_PART, (s) => {
        s.panelPosition = Position.TOP;
        s.panelAlignment = "justify";
        s.visibleParts.add(Parts.PANEL_PART);
        s.visibleParts.delete(Parts.TITLEBAR_PART);
      }),
      // Sibling bar above a bottom panel: its bottom faces the panel, not the window.
      sideBarBottomPanelJustified: margins(Parts.SIDEBAR_PART, (s) => {
        s.panelAlignment = "justify";
        s.visibleParts.add(Parts.PANEL_PART);
        s.visibleParts.delete(Parts.STATUSBAR_PART);
      }),
      // Full-height bar with the status bar hidden: it does reach the window bottom.
      sideBarBottomPanelCentered: margins(Parts.SIDEBAR_PART, (s) => {
        s.visibleParts.add(Parts.PANEL_PART);
        s.visibleParts.delete(Parts.STATUSBAR_PART);
      }),
      // Experiment off: the parts are not cards at all.
      disabled: margins(Parts.SIDEBAR_PART, (s) => {
        s.floatingPanelsEnabled = false;
        s.visibleParts.clear();
      })
    };
    assert.deepStrictEqual(actual, {
      topPanelStatusBarHidden: { top: inner, bottom: inner },
      leftPanelAtBothEdges: { top: outer, bottom: outer },
      sideBarTopPanelCentered: { top: outer, bottom: margin },
      sideBarTopPanelJustified: { top: margin, bottom: margin },
      sideBarBottomPanelJustified: { top: inner, bottom: inner },
      sideBarBottomPanelCentered: { top: inner, bottom: outer },
      disabled: { top: 0, bottom: 0 }
    });
  });
});
suite("LayoutService - getFloatingEditorVerticalMargins", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function margins(configure) {
    const service = new VerticalMarginLayoutService();
    configure(service);
    return getFloatingEditorVerticalMargins(service, mainWindow);
  }
  const inner = FLOATING_PANEL_INNER_MARGIN;
  const margin = FLOATING_PANEL_MARGIN;
  const outer = FLOATING_PANEL_MARGIN * 2;
  test("margins across panel positions, title bar, banner and status bar", () => {
    const actual = {
      // Windowed default: a title bar above and a status bar below.
      titleAndStatusBarVisible: margins(() => {
      }),
      // Native fullscreen: nothing above the editor.
      titleBarHidden: margins((s) => {
        s.visibleParts.delete(Parts.TITLEBAR_PART);
      }),
      // A banner keeps the editor off the window edge.
      bannerInsteadOfTitleBar: margins((s) => {
        s.visibleParts.delete(Parts.TITLEBAR_PART);
        s.visibleParts.add(Parts.BANNER_PART);
      }),
      // A top panel takes the place of the title bar, so the gap stays an inter-card one.
      topPanelAtTopEdge: margins((s) => {
        s.panelPosition = Position.TOP;
        s.visibleParts.add(Parts.PANEL_PART);
        s.visibleParts.delete(Parts.TITLEBAR_PART);
      }),
      // Status bar hidden: the editor reaches the window bottom.
      statusBarHidden: margins((s) => {
        s.visibleParts.delete(Parts.STATUSBAR_PART);
      }),
      // A bottom panel takes the place of the status bar.
      bottomPanelStatusBarHidden: margins((s) => {
        s.visibleParts.add(Parts.PANEL_PART);
        s.visibleParts.delete(Parts.STATUSBAR_PART);
      }),
      // Experiment off.
      disabled: margins((s) => {
        s.floatingPanelsEnabled = false;
        s.visibleParts.clear();
      })
    };
    assert.deepStrictEqual(actual, {
      titleAndStatusBarVisible: { top: inner, bottom: margin },
      titleBarHidden: { top: outer, bottom: margin },
      bannerInsteadOfTitleBar: { top: inner, bottom: margin },
      topPanelAtTopEdge: { top: margin, bottom: margin },
      statusBarHidden: { top: inner, bottom: outer },
      bottomPanelStatusBarHidden: { top: inner, bottom: inner },
      disabled: { top: 0, bottom: 0 }
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxsYXlvdXRcXHRlc3RcXGJyb3dzZXJcXGxheW91dFNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRkxPQVRJTkdfUEFORUxfSU5ORVJfTUFSR0lOLCBGTE9BVElOR19QQU5FTF9NQVJHSU4sIGdldEZsb2F0aW5nRWRpdG9yVmVydGljYWxNYXJnaW5zLCBnZXRGbG9hdGluZ091dGVyRWRnZU93bmVycywgZ2V0RmxvYXRpbmdQYW5lQ29tcG9zaXRlSG9yaXpvbnRhbE1hcmdpbnMsIGdldEZsb2F0aW5nUGFuZUNvbXBvc2l0ZVZlcnRpY2FsTWFyZ2lucywgZ2V0RmxvYXRpbmdTaWRlYmFyU2libGluZ1RvRWRpdG9yU3RhdHVzLCBpc0Zsb2F0aW5nVG9wRWRnZUV4cG9zZWQsIHR5cGUgUGFuZWxBbGlnbm1lbnQsIFBhcnRzLCBQb3NpdGlvbiB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0TGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuXG5zdWl0ZSgnTGF5b3V0U2VydmljZSAtIGlzRmxvYXRpbmdUb3BFZGdlRXhwb3NlZCcsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjbGFzcyBWaXNpYmlsaXR5TGF5b3V0U2VydmljZSBleHRlbmRzIFRlc3RMYXlvdXRTZXJ2aWNlIHtcblx0XHR2aXNpYmxlUGFydHMgPSBuZXcgU2V0PFBhcnRzPigpO1xuXHRcdG92ZXJyaWRlIGlzVmlzaWJsZShwYXJ0OiBQYXJ0cyk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy52aXNpYmxlUGFydHMuaGFzKHBhcnQpOyB9XG5cdH1cblxuXHRmdW5jdGlvbiB0b3BFZGdlRXhwb3NlZCh2aXNpYmxlOiBQYXJ0c1tdKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBWaXNpYmlsaXR5TGF5b3V0U2VydmljZSgpO1xuXHRcdHNlcnZpY2UudmlzaWJsZVBhcnRzID0gbmV3IFNldCh2aXNpYmxlKTtcblx0XHRyZXR1cm4gaXNGbG9hdGluZ1RvcEVkZ2VFeHBvc2VkKHNlcnZpY2UsIG1haW5XaW5kb3cpO1xuXHR9XG5cblx0dGVzdCgnZXhwb3NlZCBvbmx5IHdoZW4gYm90aCB0aGUgdGl0bGUgYmFyIGFuZCB0aGUgYmFubmVyIGFyZSBoaWRkZW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0dWFsID0ge1xuXHRcdFx0Ym90aEhpZGRlbjogdG9wRWRnZUV4cG9zZWQoW10pLFxuXHRcdFx0dGl0bGVCYXJWaXNpYmxlOiB0b3BFZGdlRXhwb3NlZChbUGFydHMuVElUTEVCQVJfUEFSVF0pLFxuXHRcdFx0YmFubmVyVmlzaWJsZTogdG9wRWRnZUV4cG9zZWQoW1BhcnRzLkJBTk5FUl9QQVJUXSksXG5cdFx0XHRib3RoVmlzaWJsZTogdG9wRWRnZUV4cG9zZWQoW1BhcnRzLlRJVExFQkFSX1BBUlQsIFBhcnRzLkJBTk5FUl9QQVJUXSksXG5cdFx0fTtcblxuXHRcdC8vIEEgdmlzaWJsZSBiYW5uZXIgZ2l2ZXMgdGhlIGNhcmRzIGEgdG9wIGVkZ2UgdG8gc2l0IGFnYWluc3QsIHNhbWUgYXMgYSB2aXNpYmxlIHRpdGxlIGJhci5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwge1xuXHRcdFx0Ym90aEhpZGRlbjogdHJ1ZSxcblx0XHRcdHRpdGxlQmFyVmlzaWJsZTogZmFsc2UsXG5cdFx0XHRiYW5uZXJWaXNpYmxlOiBmYWxzZSxcblx0XHRcdGJvdGhWaXNpYmxlOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0xheW91dFNlcnZpY2UgLSBmbG9hdGluZyBwYW5lbCBzcGFjaW5nJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3VzZXMgYSA0cHggaW50ZXItY2FyZCBnYXAnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRsZWFkaW5nTWFyZ2luOiBGTE9BVElOR19QQU5FTF9NQVJHSU4sXG5cdFx0XHR0cmFpbGluZ01hcmdpbjogRkxPQVRJTkdfUEFORUxfSU5ORVJfTUFSR0lOLFxuXHRcdFx0Z2FwOiBGTE9BVElOR19QQU5FTF9NQVJHSU4gKyBGTE9BVElOR19QQU5FTF9JTk5FUl9NQVJHSU4sXG5cdFx0fSwge1xuXHRcdFx0bGVhZGluZ01hcmdpbjogNCxcblx0XHRcdHRyYWlsaW5nTWFyZ2luOiAwLFxuXHRcdFx0Z2FwOiA0LFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnTGF5b3V0U2VydmljZSAtIGdldEZsb2F0aW5nT3V0ZXJFZGdlT3duZXJzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNsYXNzIENvbmZpZ3VyYWJsZUxheW91dFNlcnZpY2UgZXh0ZW5kcyBUZXN0TGF5b3V0U2VydmljZSB7XG5cdFx0ZmxvYXRpbmdQYW5lbHNFbmFibGVkID0gdHJ1ZTtcblx0XHRzaWRlQmFyUG9zaXRpb24gPSBQb3NpdGlvbi5MRUZUO1xuXHRcdHBhbmVsUG9zaXRpb24gPSBQb3NpdGlvbi5CT1RUT007XG5cdFx0dmlzaWJsZVBhcnRzID0gbmV3IFNldDxQYXJ0cz4oKTtcblxuXHRcdG92ZXJyaWRlIGlzRmxvYXRpbmdQYW5lbHNFbmFibGVkKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5mbG9hdGluZ1BhbmVsc0VuYWJsZWQ7IH1cblx0XHRvdmVycmlkZSBnZXRTaWRlQmFyUG9zaXRpb24oKTogUG9zaXRpb24geyByZXR1cm4gdGhpcy5zaWRlQmFyUG9zaXRpb247IH1cblx0XHRvdmVycmlkZSBnZXRQYW5lbFBvc2l0aW9uKCk6IFBvc2l0aW9uIHsgcmV0dXJuIHRoaXMucGFuZWxQb3NpdGlvbjsgfVxuXHRcdG92ZXJyaWRlIGlzVmlzaWJsZShwYXJ0OiBQYXJ0cyk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy52aXNpYmxlUGFydHMuaGFzKHBhcnQpOyB9XG5cdH1cblxuXHRmdW5jdGlvbiBvd25lcnMoY29uZmlndXJlOiAoc2VydmljZTogQ29uZmlndXJhYmxlTGF5b3V0U2VydmljZSkgPT4gdm9pZCk6IHsgbGVmdDogUGFydHMgfCB1bmRlZmluZWQ7IHJpZ2h0OiBQYXJ0cyB8IHVuZGVmaW5lZCB9IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IENvbmZpZ3VyYWJsZUxheW91dFNlcnZpY2UoKTtcblx0XHRjb25maWd1cmUoc2VydmljZSk7XG5cdFx0cmV0dXJuIGdldEZsb2F0aW5nT3V0ZXJFZGdlT3duZXJzKHNlcnZpY2UpO1xuXHR9XG5cblx0dGVzdCgnZWRnZSBvd25lcnNoaXAgYWNyb3NzIGxheW91dHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0dWFsID0ge1xuXHRcdFx0Ly8gRXhwZXJpbWVudCBkaXNhYmxlZDogbm8gb3duZXJzIHJlZ2FyZGxlc3Mgb2YgbGF5b3V0LlxuXHRcdFx0ZGlzYWJsZWQ6IG93bmVycyhzID0+IHsgcy5mbG9hdGluZ1BhbmVsc0VuYWJsZWQgPSBmYWxzZTsgcy52aXNpYmxlUGFydHMgPSBuZXcgU2V0KFtQYXJ0cy5BVVhJTElBUllCQVJfUEFSVF0pOyB9KSxcblxuXHRcdFx0Ly8gRGVmYXVsdCBmdWxsIGxheW91dCAoc2lkZSBiYXIgbGVmdCk6IGFjdGl2aXR5IGJhciBodWdzIHRoZSBsZWZ0IGVkZ2UgKG5vIG93bmVyKSxcblx0XHRcdC8vIHRoZSBzZWNvbmRhcnkgc2lkZSBiYXIgb3ducyB0aGUgcmlnaHQgZWRnZS5cblx0XHRcdGRlZmF1bHRGdWxsOiBvd25lcnMocyA9PiB7IHMudmlzaWJsZVBhcnRzID0gbmV3IFNldChbUGFydHMuQUNUSVZJVFlCQVJfUEFSVCwgUGFydHMuU0lERUJBUl9QQVJULCBQYXJ0cy5FRElUT1JfUEFSVCwgUGFydHMuQVVYSUxJQVJZQkFSX1BBUlRdKTsgfSksXG5cblx0XHRcdC8vIE1heGltaXplZCBhdXggYmFyIHdpdGggdGhlIGFjdGl2aXR5IGJhciBpbiBpdHMgZGVmYXVsdCAodmlzaWJsZSkgcG9zaXRpb246IHRoZVxuXHRcdFx0Ly8gYWN0aXZpdHkgYmFyIHN0aWxsIGh1Z3MgdGhlIGxlZnQgZWRnZSwgdGhlIGF1eCBiYXIgb3ducyB0aGUgcmlnaHQgZWRnZS5cblx0XHRcdG1heGltaXplZEF1eFdpdGhBY3Rpdml0eUJhcjogb3duZXJzKHMgPT4geyBzLnZpc2libGVQYXJ0cyA9IG5ldyBTZXQoW1BhcnRzLkFDVElWSVRZQkFSX1BBUlQsIFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUXSk7IH0pLFxuXG5cdFx0XHQvLyBNYXhpbWl6ZWQgYXV4IGJhciB3aXRoIHRoZSBhY3Rpdml0eSBiYXIgbm90IGluIGl0cyBkZWZhdWx0IHBvc2l0aW9uIChoaWRkZW4gZnJvbVxuXHRcdFx0Ly8gdGhlIHNpZGUgY29sdW1uKTogdGhlIGF1eCBiYXIgc3BhbnMgdGhlIGZ1bGwgd2lkdGggYW5kIG93bnMgYm90aCBlZGdlcy5cblx0XHRcdG1heGltaXplZEF1eE5vQWN0aXZpdHlCYXI6IG93bmVycyhzID0+IHsgcy52aXNpYmxlUGFydHMgPSBuZXcgU2V0KFtQYXJ0cy5BVVhJTElBUllCQVJfUEFSVF0pOyB9KSxcblxuXHRcdFx0Ly8gU2FtZSwgYnV0IHRoZSBzaWRlIGJhciBpcyBvbiB0aGUgcmlnaHQ6IHRoZSBhdXggYmFyIHN0aWxsIHNwYW5zIGFuZCBvd25zIGJvdGggZWRnZXMuXG5cdFx0XHRtYXhpbWl6ZWRBdXhOb0FjdGl2aXR5QmFyU2lkZUJhclJpZ2h0OiBvd25lcnMocyA9PiB7IHMuc2lkZUJhclBvc2l0aW9uID0gUG9zaXRpb24uUklHSFQ7IHMudmlzaWJsZVBhcnRzID0gbmV3IFNldChbUGFydHMuQVVYSUxJQVJZQkFSX1BBUlRdKTsgfSksXG5cblx0XHRcdC8vIE9ubHkgdGhlIGVkaXRvciB2aXNpYmxlIHdpdGggdGhlIGFjdGl2aXR5IGJhciBoaWRkZW46IHRoZSBlZGl0b3IgaXMgdGhlIHNvbGUgY2FyZFxuXHRcdFx0Ly8gYW5kIG93bnMgYm90aCBlZGdlcy5cblx0XHRcdGVkaXRvck9ubHk6IG93bmVycyhzID0+IHsgcy52aXNpYmxlUGFydHMgPSBuZXcgU2V0KFtQYXJ0cy5FRElUT1JfUEFSVF0pOyB9KSxcblxuXHRcdFx0Ly8gRnVsbCBsYXlvdXQgd2l0aCBhIHZpc2libGUgbGVmdCB2ZXJ0aWNhbCBwYW5lbDogdGhlIHBhbmVsIHNpdHMgYmV0d2VlbiB0aGUgZWRpdG9yXG5cdFx0XHQvLyBhbmQgdGhlIHNpZGUgYmFyLCBzbyBpdCBuZXZlciByZWFjaGVzIGFuIGVkZ2UuXG5cdFx0XHR2ZXJ0aWNhbFBhbmVsRnVsbDogb3duZXJzKHMgPT4geyBzLnBhbmVsUG9zaXRpb24gPSBQb3NpdGlvbi5MRUZUOyBzLnZpc2libGVQYXJ0cyA9IG5ldyBTZXQoW1BhcnRzLkFDVElWSVRZQkFSX1BBUlQsIFBhcnRzLlNJREVCQVJfUEFSVCwgUGFydHMuUEFORUxfUEFSVCwgUGFydHMuRURJVE9SX1BBUlQsIFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUXSk7IH0pLFxuXG5cdFx0XHQvLyBNYXhpbWl6ZWQgbGVmdCB2ZXJ0aWNhbCBwYW5lbCB3aXRoIHRoZSBhY3Rpdml0eSBiYXIgaGlkZGVuOiB0aGUgcGFuZWwgc3BhbnMgdGhlXG5cdFx0XHQvLyBmdWxsIHdpZHRoIGFuZCBvd25zIGJvdGggZWRnZXMuXG5cdFx0XHRtYXhpbWl6ZWRWZXJ0aWNhbFBhbmVsOiBvd25lcnMocyA9PiB7IHMucGFuZWxQb3NpdGlvbiA9IFBvc2l0aW9uLkxFRlQ7IHMudmlzaWJsZVBhcnRzID0gbmV3IFNldChbUGFydHMuUEFORUxfUEFSVF0pOyB9KSxcblxuXHRcdFx0Ly8gVmlzaWJsZSBob3Jpem9udGFsIChib3R0b20pIHBhbmVsOiBub3QgcGFydCBvZiB0aGUgdmVydGljYWwgb3JkZXIsIHNvIGl0IG93bnMgbm9cblx0XHRcdC8vIGVkZ2U7IHRoZSBzZWNvbmRhcnkgc2lkZSBiYXIgc3RpbGwgb3ducyB0aGUgcmlnaHQgZWRnZS5cblx0XHRcdGhvcml6b250YWxQYW5lbFZpc2libGU6IG93bmVycyhzID0+IHsgcy5wYW5lbFBvc2l0aW9uID0gUG9zaXRpb24uQk9UVE9NOyBzLnZpc2libGVQYXJ0cyA9IG5ldyBTZXQoW1BhcnRzLlNJREVCQVJfUEFSVCwgUGFydHMuRURJVE9SX1BBUlQsIFBhcnRzLlBBTkVMX1BBUlQsIFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUXSk7IH0pLFxuXHRcdH07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwge1xuXHRcdFx0ZGlzYWJsZWQ6IHsgbGVmdDogdW5kZWZpbmVkLCByaWdodDogdW5kZWZpbmVkIH0sXG5cdFx0XHRkZWZhdWx0RnVsbDogeyBsZWZ0OiB1bmRlZmluZWQsIHJpZ2h0OiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCB9LFxuXHRcdFx0bWF4aW1pemVkQXV4V2l0aEFjdGl2aXR5QmFyOiB7IGxlZnQ6IHVuZGVmaW5lZCwgcmlnaHQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUIH0sXG5cdFx0XHRtYXhpbWl6ZWRBdXhOb0FjdGl2aXR5QmFyOiB7IGxlZnQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCByaWdodDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQgfSxcblx0XHRcdG1heGltaXplZEF1eE5vQWN0aXZpdHlCYXJTaWRlQmFyUmlnaHQ6IHsgbGVmdDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHJpZ2h0OiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCB9LFxuXHRcdFx0ZWRpdG9yT25seTogeyBsZWZ0OiBQYXJ0cy5FRElUT1JfUEFSVCwgcmlnaHQ6IFBhcnRzLkVESVRPUl9QQVJUIH0sXG5cdFx0XHR2ZXJ0aWNhbFBhbmVsRnVsbDogeyBsZWZ0OiB1bmRlZmluZWQsIHJpZ2h0OiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCB9LFxuXHRcdFx0bWF4aW1pemVkVmVydGljYWxQYW5lbDogeyBsZWZ0OiBQYXJ0cy5QQU5FTF9QQVJULCByaWdodDogUGFydHMuUEFORUxfUEFSVCB9LFxuXHRcdFx0aG9yaXpvbnRhbFBhbmVsVmlzaWJsZTogeyBsZWZ0OiBQYXJ0cy5TSURFQkFSX1BBUlQsIHJpZ2h0OiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCB9LFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnTGF5b3V0U2VydmljZSAtIGdldEZsb2F0aW5nUGFuZUNvbXBvc2l0ZUhvcml6b250YWxNYXJnaW5zJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNsYXNzIEhvcml6b250YWxNYXJnaW5MYXlvdXRTZXJ2aWNlIGV4dGVuZHMgVGVzdExheW91dFNlcnZpY2Uge1xuXHRcdGZsb2F0aW5nUGFuZWxzRW5hYmxlZCA9IHRydWU7XG5cdFx0c2lkZUJhclBvc2l0aW9uID0gUG9zaXRpb24uTEVGVDtcblx0XHR2aXNpYmxlUGFydHMgPSBuZXcgU2V0PFBhcnRzPigpO1xuXG5cdFx0b3ZlcnJpZGUgaXNGbG9hdGluZ1BhbmVsc0VuYWJsZWQoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLmZsb2F0aW5nUGFuZWxzRW5hYmxlZDsgfVxuXHRcdG92ZXJyaWRlIGdldFNpZGVCYXJQb3NpdGlvbigpOiBQb3NpdGlvbiB7IHJldHVybiB0aGlzLnNpZGVCYXJQb3NpdGlvbjsgfVxuXHRcdG92ZXJyaWRlIGlzVmlzaWJsZShwYXJ0OiBQYXJ0cyk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy52aXNpYmxlUGFydHMuaGFzKHBhcnQpOyB9XG5cdH1cblxuXHRmdW5jdGlvbiBtYXJnaW5zKHBhcnRJZDogUGFydHMsIHZpc2libGVQYXJ0czogUGFydHNbXSwgc2lkZUJhclBvc2l0aW9uID0gUG9zaXRpb24uTEVGVCk6IHsgbGVmdDogbnVtYmVyOyByaWdodDogbnVtYmVyIH0ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgSG9yaXpvbnRhbE1hcmdpbkxheW91dFNlcnZpY2UoKTtcblx0XHRzZXJ2aWNlLnNpZGVCYXJQb3NpdGlvbiA9IHNpZGVCYXJQb3NpdGlvbjtcblx0XHRzZXJ2aWNlLnZpc2libGVQYXJ0cyA9IG5ldyBTZXQodmlzaWJsZVBhcnRzKTtcblx0XHRyZXR1cm4gZ2V0RmxvYXRpbmdQYW5lQ29tcG9zaXRlSG9yaXpvbnRhbE1hcmdpbnMoc2VydmljZSwgcGFydElkKTtcblx0fVxuXG5cdHRlc3QoJ3NlY29uZGFyeSBzaWRlIGJhciB1c2VzIGFuIDhweCBndXR0ZXIgb3Bwb3NpdGUgdGhlIGFjdGl2aXR5IGJhcicsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFjdGl2aXR5QmFyTGVmdDogbWFyZ2lucyhQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgW1BhcnRzLkFDVElWSVRZQkFSX1BBUlQsIFBhcnRzLlNJREVCQVJfUEFSVCwgUGFydHMuRURJVE9SX1BBUlQsIFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUXSksXG5cdFx0XHRhY3Rpdml0eUJhclJpZ2h0OiBtYXJnaW5zKFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCBbUGFydHMuQUNUSVZJVFlCQVJfUEFSVCwgUGFydHMuU0lERUJBUl9QQVJULCBQYXJ0cy5FRElUT1JfUEFSVCwgUGFydHMuQVVYSUxJQVJZQkFSX1BBUlRdLCBQb3NpdGlvbi5SSUdIVCksXG5cdFx0XHRzZWNvbmRhcnlTaWRlQmFyT25seTogbWFyZ2lucyhQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgW1BhcnRzLkFVWElMSUFSWUJBUl9QQVJUXSksXG5cdFx0fSwge1xuXHRcdFx0YWN0aXZpdHlCYXJMZWZ0OiB7IGxlZnQ6IDQsIHJpZ2h0OiA4IH0sXG5cdFx0XHRhY3Rpdml0eUJhclJpZ2h0OiB7IGxlZnQ6IDgsIHJpZ2h0OiAwIH0sXG5cdFx0XHRzZWNvbmRhcnlTaWRlQmFyT25seTogeyBsZWZ0OiA4LCByaWdodDogOCB9LFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnTGF5b3V0U2VydmljZSAtIGdldEZsb2F0aW5nU2lkZWJhclNpYmxpbmdUb0VkaXRvclN0YXR1cycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjbGFzcyBTaWJsaW5nU3RhdHVzTGF5b3V0U2VydmljZSBleHRlbmRzIFRlc3RMYXlvdXRTZXJ2aWNlIHtcblx0XHRzaWRlQmFyUG9zaXRpb24gPSBQb3NpdGlvbi5MRUZUO1xuXHRcdHBhbmVsQWxpZ25tZW50OiBQYW5lbEFsaWdubWVudCA9ICdjZW50ZXInO1xuXG5cdFx0b3ZlcnJpZGUgZ2V0U2lkZUJhclBvc2l0aW9uKCk6IFBvc2l0aW9uIHsgcmV0dXJuIHRoaXMuc2lkZUJhclBvc2l0aW9uOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0UGFuZWxBbGlnbm1lbnQoKTogUGFuZWxBbGlnbm1lbnQgeyByZXR1cm4gdGhpcy5wYW5lbEFsaWdubWVudDsgfVxuXHR9XG5cblx0ZnVuY3Rpb24gc2libGluZ1N0YXR1cyhjb25maWd1cmU6IChzOiBTaWJsaW5nU3RhdHVzTGF5b3V0U2VydmljZSkgPT4gdm9pZCk6IHsgc2lkZUJhcjogYm9vbGVhbjsgYXV4QmFyOiBib29sZWFuIH0ge1xuXHRcdGNvbnN0IHMgPSBuZXcgU2libGluZ1N0YXR1c0xheW91dFNlcnZpY2UoKTtcblx0XHRjb25maWd1cmUocyk7XG5cdFx0cmV0dXJuIGdldEZsb2F0aW5nU2lkZWJhclNpYmxpbmdUb0VkaXRvclN0YXR1cyhzKTtcblx0fVxuXG5cdHRlc3QoJ3NpYmxpbmctdG8tZWRpdG9yIHN0YXR1cyBhY3Jvc3MgYWxpZ25tZW50IGFuZCBzaWRlYmFyLXBvc2l0aW9uIGNvbWJpbmF0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBhY3R1YWwgPSB7XG5cdFx0XHQvLyBjZW50ZXI6IG5laXRoZXIgYmFyIGlzIGEgc2libGluZyAoYm90aCBzcGFuIGZ1bGwgaGVpZ2h0KVxuXHRcdFx0Y2VudGVyTGVmdDogc2libGluZ1N0YXR1cyhzID0+IHsgcy5zaWRlQmFyUG9zaXRpb24gPSBQb3NpdGlvbi5MRUZUOyBzLnBhbmVsQWxpZ25tZW50ID0gJ2NlbnRlcic7IH0pLFxuXHRcdFx0Y2VudGVyUmlnaHQ6IHNpYmxpbmdTdGF0dXMocyA9PiB7IHMuc2lkZUJhclBvc2l0aW9uID0gUG9zaXRpb24uUklHSFQ7IHMucGFuZWxBbGlnbm1lbnQgPSAnY2VudGVyJzsgfSksXG5cdFx0XHQvLyBqdXN0aWZ5OiBib3RoIGJhcnMgYXJlIHNpYmxpbmdzIChwYW5lbCBzcGFucyB0aGUgZnVsbCB3aWR0aClcblx0XHRcdGp1c3RpZnlMZWZ0OiBzaWJsaW5nU3RhdHVzKHMgPT4geyBzLnNpZGVCYXJQb3NpdGlvbiA9IFBvc2l0aW9uLkxFRlQ7IHMucGFuZWxBbGlnbm1lbnQgPSAnanVzdGlmeSc7IH0pLFxuXHRcdFx0anVzdGlmeVJpZ2h0OiBzaWJsaW5nU3RhdHVzKHMgPT4geyBzLnNpZGVCYXJQb3NpdGlvbiA9IFBvc2l0aW9uLlJJR0hUOyBzLnBhbmVsQWxpZ25tZW50ID0gJ2p1c3RpZnknOyB9KSxcblx0XHRcdC8vIGxlZnQgYWxpZ25tZW50LCBzaWRlYmFyIG9uIExFRlQ6IHNpZGViYXIgSVMgc2libGluZywgYXV4IGJhciBpcyBOT1Rcblx0XHRcdGxlZnRBbGlnblNpZGViYXJMZWZ0OiBzaWJsaW5nU3RhdHVzKHMgPT4geyBzLnNpZGVCYXJQb3NpdGlvbiA9IFBvc2l0aW9uLkxFRlQ7IHMucGFuZWxBbGlnbm1lbnQgPSAnbGVmdCc7IH0pLFxuXHRcdFx0Ly8gbGVmdCBhbGlnbm1lbnQsIHNpZGViYXIgb24gUklHSFQ6IHNpZGViYXIgaXMgTk9UIHNpYmxpbmcsIGF1eCBiYXIgSVNcblx0XHRcdGxlZnRBbGlnblNpZGViYXJSaWdodDogc2libGluZ1N0YXR1cyhzID0+IHsgcy5zaWRlQmFyUG9zaXRpb24gPSBQb3NpdGlvbi5SSUdIVDsgcy5wYW5lbEFsaWdubWVudCA9ICdsZWZ0JzsgfSksXG5cdFx0XHQvLyByaWdodCBhbGlnbm1lbnQsIHNpZGViYXIgb24gTEVGVDogc2lkZWJhciBpcyBOT1Qgc2libGluZywgYXV4IGJhciBJU1xuXHRcdFx0cmlnaHRBbGlnblNpZGViYXJMZWZ0OiBzaWJsaW5nU3RhdHVzKHMgPT4geyBzLnNpZGVCYXJQb3NpdGlvbiA9IFBvc2l0aW9uLkxFRlQ7IHMucGFuZWxBbGlnbm1lbnQgPSAncmlnaHQnOyB9KSxcblx0XHRcdC8vIHJpZ2h0IGFsaWdubWVudCwgc2lkZWJhciBvbiBSSUdIVDogc2lkZWJhciBJUyBzaWJsaW5nLCBhdXggYmFyIGlzIE5PVFxuXHRcdFx0cmlnaHRBbGlnblNpZGViYXJSaWdodDogc2libGluZ1N0YXR1cyhzID0+IHsgcy5zaWRlQmFyUG9zaXRpb24gPSBQb3NpdGlvbi5SSUdIVDsgcy5wYW5lbEFsaWdubWVudCA9ICdyaWdodCc7IH0pLFxuXHRcdH07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwge1xuXHRcdFx0Y2VudGVyTGVmdDogeyBzaWRlQmFyOiBmYWxzZSwgYXV4QmFyOiBmYWxzZSB9LFxuXHRcdFx0Y2VudGVyUmlnaHQ6IHsgc2lkZUJhcjogZmFsc2UsIGF1eEJhcjogZmFsc2UgfSxcblx0XHRcdGp1c3RpZnlMZWZ0OiB7IHNpZGVCYXI6IHRydWUsIGF1eEJhcjogdHJ1ZSB9LFxuXHRcdFx0anVzdGlmeVJpZ2h0OiB7IHNpZGVCYXI6IHRydWUsIGF1eEJhcjogdHJ1ZSB9LFxuXHRcdFx0bGVmdEFsaWduU2lkZWJhckxlZnQ6IHsgc2lkZUJhcjogdHJ1ZSwgYXV4QmFyOiBmYWxzZSB9LFxuXHRcdFx0bGVmdEFsaWduU2lkZWJhclJpZ2h0OiB7IHNpZGVCYXI6IGZhbHNlLCBhdXhCYXI6IHRydWUgfSxcblx0XHRcdHJpZ2h0QWxpZ25TaWRlYmFyTGVmdDogeyBzaWRlQmFyOiBmYWxzZSwgYXV4QmFyOiB0cnVlIH0sXG5cdFx0XHRyaWdodEFsaWduU2lkZWJhclJpZ2h0OiB7IHNpZGVCYXI6IHRydWUsIGF1eEJhcjogZmFsc2UgfSxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuLyoqXG4gKiBUaGUgbWFyZ2lucyBiZWxvdyBtdXN0IHN0YXkgaW4gc3RlcCB3aXRoIGBmbG9hdGluZ1BhbmVscy5jc3NgOyBhIG1pc21hdGNoIHNob3dzIHVwIGFzIGFcbiAqIGNhcmQgd2hvc2UgY29udGVudHMgb3ZlcmZsb3cgb3IgZmFsbCBzaG9ydCBvZiBpdHMgb3duIGdhcC5cbiAqL1xuY2xhc3MgVmVydGljYWxNYXJnaW5MYXlvdXRTZXJ2aWNlIGV4dGVuZHMgVGVzdExheW91dFNlcnZpY2Uge1xuXHRmbG9hdGluZ1BhbmVsc0VuYWJsZWQgPSB0cnVlO1xuXHRwYW5lbFBvc2l0aW9uID0gUG9zaXRpb24uQk9UVE9NO1xuXHRwYW5lbEFsaWdubWVudDogUGFuZWxBbGlnbm1lbnQgPSAnY2VudGVyJztcblx0dmlzaWJsZVBhcnRzID0gbmV3IFNldDxQYXJ0cz4oW1BhcnRzLlRJVExFQkFSX1BBUlQsIFBhcnRzLlNUQVRVU0JBUl9QQVJULCBQYXJ0cy5FRElUT1JfUEFSVF0pO1xuXG5cdG92ZXJyaWRlIGlzRmxvYXRpbmdQYW5lbHNFbmFibGVkKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5mbG9hdGluZ1BhbmVsc0VuYWJsZWQ7IH1cblx0b3ZlcnJpZGUgZ2V0UGFuZWxQb3NpdGlvbigpOiBQb3NpdGlvbiB7IHJldHVybiB0aGlzLnBhbmVsUG9zaXRpb247IH1cblx0b3ZlcnJpZGUgZ2V0UGFuZWxBbGlnbm1lbnQoKTogUGFuZWxBbGlnbm1lbnQgeyByZXR1cm4gdGhpcy5wYW5lbEFsaWdubWVudDsgfVxuXHRvdmVycmlkZSBpc1Zpc2libGUocGFydDogUGFydHMpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMudmlzaWJsZVBhcnRzLmhhcyhwYXJ0KTsgfVxufVxuXG5zdWl0ZSgnTGF5b3V0U2VydmljZSAtIGdldEZsb2F0aW5nUGFuZUNvbXBvc2l0ZVZlcnRpY2FsTWFyZ2lucycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBtYXJnaW5zKHBhcnRJZDogUGFydHMsIGNvbmZpZ3VyZTogKHNlcnZpY2U6IFZlcnRpY2FsTWFyZ2luTGF5b3V0U2VydmljZSkgPT4gdm9pZCk6IHsgdG9wOiBudW1iZXI7IGJvdHRvbTogbnVtYmVyIH0ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVmVydGljYWxNYXJnaW5MYXlvdXRTZXJ2aWNlKCk7XG5cdFx0Y29uZmlndXJlKHNlcnZpY2UpO1xuXHRcdHJldHVybiBnZXRGbG9hdGluZ1BhbmVDb21wb3NpdGVWZXJ0aWNhbE1hcmdpbnMoc2VydmljZSwgcGFydElkLCBtYWluV2luZG93KTtcblx0fVxuXG5cdGNvbnN0IGlubmVyID0gRkxPQVRJTkdfUEFORUxfSU5ORVJfTUFSR0lOO1xuXHRjb25zdCBtYXJnaW4gPSBGTE9BVElOR19QQU5FTF9NQVJHSU47XG5cdGNvbnN0IG91dGVyID0gRkxPQVRJTkdfUEFORUxfTUFSR0lOICogMjtcblxuXHR0ZXN0KCdib3R0b20gcGFuZWwgdG9wIG1hcmdpbiBhY3Jvc3MgZWRpdG9yIHZpc2liaWxpdHkgYW5kIHRvcCBlZGdlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGJvdHRvbVBhbmVsID0gKGNvbmZpZ3VyZTogKHM6IFZlcnRpY2FsTWFyZ2luTGF5b3V0U2VydmljZSkgPT4gdm9pZCkgPT4gbWFyZ2lucyhQYXJ0cy5QQU5FTF9QQVJULCBzID0+IHsgcy52aXNpYmxlUGFydHMuYWRkKFBhcnRzLlBBTkVMX1BBUlQpOyBjb25maWd1cmUocyk7IH0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHtcblx0XHRcdC8vIEVkaXRvciBhYm92ZSB0aGUgcGFuZWw6IHRoZSBnYXAgaXMgYmV0d2VlbiB0d28gY2FyZHMuXG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBib3R0b21QYW5lbCgoKSA9PiB7IH0pLFxuXG5cdFx0XHQvLyBNYXhpbWl6ZWQgcGFuZWwgKGVkaXRvciBoaWRkZW4pIGJlbG93IGEgdGl0bGUgYmFyOiBpdCB0YWtlcyBvdmVyIHRoYXQgcm93LlxuXHRcdFx0bWF4aW1pemVkVW5kZXJUaXRsZUJhcjogYm90dG9tUGFuZWwocyA9PiB7IHMudmlzaWJsZVBhcnRzLmRlbGV0ZShQYXJ0cy5FRElUT1JfUEFSVCk7IH0pLFxuXG5cdFx0XHQvLyBNYXhpbWl6ZWQgcGFuZWwgd2l0aCBub3RoaW5nIGFib3ZlIGl0OiB0aGUgdG9wIGlzIG5vdyBhIHdpbmRvdyBlZGdlLlxuXHRcdFx0bWF4aW1pemVkQXRUb3BFZGdlOiBib3R0b21QYW5lbChzID0+IHsgcy52aXNpYmxlUGFydHMuZGVsZXRlKFBhcnRzLkVESVRPUl9QQVJUKTsgcy52aXNpYmxlUGFydHMuZGVsZXRlKFBhcnRzLlRJVExFQkFSX1BBUlQpOyB9KSxcblxuXHRcdFx0Ly8gTWF4aW1pemVkIHBhbmVsIHdpdGggYSBiYW5uZXIgYWJvdmUgaXQ6IHN0aWxsIG5vdCBhIHdpbmRvdyBlZGdlLlxuXHRcdFx0bWF4aW1pemVkVW5kZXJCYW5uZXI6IGJvdHRvbVBhbmVsKHMgPT4geyBzLnZpc2libGVQYXJ0cy5kZWxldGUoUGFydHMuRURJVE9SX1BBUlQpOyBzLnZpc2libGVQYXJ0cy5kZWxldGUoUGFydHMuVElUTEVCQVJfUEFSVCk7IHMudmlzaWJsZVBhcnRzLmFkZChQYXJ0cy5CQU5ORVJfUEFSVCk7IH0pLFxuXHRcdH07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwge1xuXHRcdFx0ZWRpdG9yVmlzaWJsZTogeyB0b3A6IG1hcmdpbiwgYm90dG9tOiBtYXJnaW4gfSxcblx0XHRcdG1heGltaXplZFVuZGVyVGl0bGVCYXI6IHsgdG9wOiBpbm5lciwgYm90dG9tOiBtYXJnaW4gfSxcblx0XHRcdG1heGltaXplZEF0VG9wRWRnZTogeyB0b3A6IG91dGVyLCBib3R0b206IG1hcmdpbiB9LFxuXHRcdFx0bWF4aW1pemVkVW5kZXJCYW5uZXI6IHsgdG9wOiBpbm5lciwgYm90dG9tOiBtYXJnaW4gfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbWFyZ2lucyBhY3Jvc3MgcGFuZWwgcG9zaXRpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbCA9IHtcblx0XHRcdC8vIFRvcCBwYW5lbDogaXRzIGJvdHRvbSBmYWNlcyB0aGUgZWRpdG9yLCBzbyBpdCBuZXZlciByZWFjaGVzIHRoZSB3aW5kb3cgYm90dG9tLlxuXHRcdFx0dG9wUGFuZWxTdGF0dXNCYXJIaWRkZW46IG1hcmdpbnMoUGFydHMuUEFORUxfUEFSVCwgcyA9PiB7IHMucGFuZWxQb3NpdGlvbiA9IFBvc2l0aW9uLlRPUDsgcy52aXNpYmxlUGFydHMuYWRkKFBhcnRzLlBBTkVMX1BBUlQpOyBzLnZpc2libGVQYXJ0cy5kZWxldGUoUGFydHMuU1RBVFVTQkFSX1BBUlQpOyB9KSxcblxuXHRcdFx0Ly8gVmVydGljYWwgcGFuZWw6IGZ1bGwgaGVpZ2h0LCBzbyBib3RoIGVkZ2VzIGFyZSB3aW5kb3cgZWRnZXMuXG5cdFx0XHRsZWZ0UGFuZWxBdEJvdGhFZGdlczogbWFyZ2lucyhQYXJ0cy5QQU5FTF9QQVJULCBzID0+IHsgcy5wYW5lbFBvc2l0aW9uID0gUG9zaXRpb24uTEVGVDsgcy52aXNpYmxlUGFydHMuYWRkKFBhcnRzLlBBTkVMX1BBUlQpOyBzLnZpc2libGVQYXJ0cy5kZWxldGUoUGFydHMuVElUTEVCQVJfUEFSVCk7IHMudmlzaWJsZVBhcnRzLmRlbGV0ZShQYXJ0cy5TVEFUVVNCQVJfUEFSVCk7IH0pLFxuXG5cdFx0XHQvLyBTaWRlIGJhciBiZXNpZGUgYSB0b3AgcGFuZWwsIGNlbnRlciBhbGlnbm1lbnQ6IGZ1bGwgaGVpZ2h0LCBzbyBpdCBzdGFydHMgYXQgdGhlIHRvcCBlZGdlLlxuXHRcdFx0c2lkZUJhclRvcFBhbmVsQ2VudGVyZWQ6IG1hcmdpbnMoUGFydHMuU0lERUJBUl9QQVJULCBzID0+IHsgcy5wYW5lbFBvc2l0aW9uID0gUG9zaXRpb24uVE9QOyBzLnZpc2libGVQYXJ0cy5hZGQoUGFydHMuUEFORUxfUEFSVCk7IHMudmlzaWJsZVBhcnRzLmRlbGV0ZShQYXJ0cy5USVRMRUJBUl9QQVJUKTsgfSksXG5cblx0XHRcdC8vIFNhbWUgYnV0IGp1c3RpZmllZDogdGhlIGJhciBpcyBhIHNpYmxpbmcsIHNvIGl0cyB0b3AgZmFjZXMgdGhlIHBhbmVsIGNhcmQuXG5cdFx0XHRzaWRlQmFyVG9wUGFuZWxKdXN0aWZpZWQ6IG1hcmdpbnMoUGFydHMuU0lERUJBUl9QQVJULCBzID0+IHsgcy5wYW5lbFBvc2l0aW9uID0gUG9zaXRpb24uVE9QOyBzLnBhbmVsQWxpZ25tZW50ID0gJ2p1c3RpZnknOyBzLnZpc2libGVQYXJ0cy5hZGQoUGFydHMuUEFORUxfUEFSVCk7IHMudmlzaWJsZVBhcnRzLmRlbGV0ZShQYXJ0cy5USVRMRUJBUl9QQVJUKTsgfSksXG5cblx0XHRcdC8vIFNpYmxpbmcgYmFyIGFib3ZlIGEgYm90dG9tIHBhbmVsOiBpdHMgYm90dG9tIGZhY2VzIHRoZSBwYW5lbCwgbm90IHRoZSB3aW5kb3cuXG5cdFx0XHRzaWRlQmFyQm90dG9tUGFuZWxKdXN0aWZpZWQ6IG1hcmdpbnMoUGFydHMuU0lERUJBUl9QQVJULCBzID0+IHsgcy5wYW5lbEFsaWdubWVudCA9ICdqdXN0aWZ5Jzsgcy52aXNpYmxlUGFydHMuYWRkKFBhcnRzLlBBTkVMX1BBUlQpOyBzLnZpc2libGVQYXJ0cy5kZWxldGUoUGFydHMuU1RBVFVTQkFSX1BBUlQpOyB9KSxcblxuXHRcdFx0Ly8gRnVsbC1oZWlnaHQgYmFyIHdpdGggdGhlIHN0YXR1cyBiYXIgaGlkZGVuOiBpdCBkb2VzIHJlYWNoIHRoZSB3aW5kb3cgYm90dG9tLlxuXHRcdFx0c2lkZUJhckJvdHRvbVBhbmVsQ2VudGVyZWQ6IG1hcmdpbnMoUGFydHMuU0lERUJBUl9QQVJULCBzID0+IHsgcy52aXNpYmxlUGFydHMuYWRkKFBhcnRzLlBBTkVMX1BBUlQpOyBzLnZpc2libGVQYXJ0cy5kZWxldGUoUGFydHMuU1RBVFVTQkFSX1BBUlQpOyB9KSxcblxuXHRcdFx0Ly8gRXhwZXJpbWVudCBvZmY6IHRoZSBwYXJ0cyBhcmUgbm90IGNhcmRzIGF0IGFsbC5cblx0XHRcdGRpc2FibGVkOiBtYXJnaW5zKFBhcnRzLlNJREVCQVJfUEFSVCwgcyA9PiB7IHMuZmxvYXRpbmdQYW5lbHNFbmFibGVkID0gZmFsc2U7IHMudmlzaWJsZVBhcnRzLmNsZWFyKCk7IH0pLFxuXHRcdH07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwge1xuXHRcdFx0dG9wUGFuZWxTdGF0dXNCYXJIaWRkZW46IHsgdG9wOiBpbm5lciwgYm90dG9tOiBpbm5lciB9LFxuXHRcdFx0bGVmdFBhbmVsQXRCb3RoRWRnZXM6IHsgdG9wOiBvdXRlciwgYm90dG9tOiBvdXRlciB9LFxuXHRcdFx0c2lkZUJhclRvcFBhbmVsQ2VudGVyZWQ6IHsgdG9wOiBvdXRlciwgYm90dG9tOiBtYXJnaW4gfSxcblx0XHRcdHNpZGVCYXJUb3BQYW5lbEp1c3RpZmllZDogeyB0b3A6IG1hcmdpbiwgYm90dG9tOiBtYXJnaW4gfSxcblx0XHRcdHNpZGVCYXJCb3R0b21QYW5lbEp1c3RpZmllZDogeyB0b3A6IGlubmVyLCBib3R0b206IGlubmVyIH0sXG5cdFx0XHRzaWRlQmFyQm90dG9tUGFuZWxDZW50ZXJlZDogeyB0b3A6IGlubmVyLCBib3R0b206IG91dGVyIH0sXG5cdFx0XHRkaXNhYmxlZDogeyB0b3A6IDAsIGJvdHRvbTogMCB9LFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnTGF5b3V0U2VydmljZSAtIGdldEZsb2F0aW5nRWRpdG9yVmVydGljYWxNYXJnaW5zJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIG1hcmdpbnMoY29uZmlndXJlOiAoc2VydmljZTogVmVydGljYWxNYXJnaW5MYXlvdXRTZXJ2aWNlKSA9PiB2b2lkKTogeyB0b3A6IG51bWJlcjsgYm90dG9tOiBudW1iZXIgfSB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBWZXJ0aWNhbE1hcmdpbkxheW91dFNlcnZpY2UoKTtcblx0XHRjb25maWd1cmUoc2VydmljZSk7XG5cdFx0cmV0dXJuIGdldEZsb2F0aW5nRWRpdG9yVmVydGljYWxNYXJnaW5zKHNlcnZpY2UsIG1haW5XaW5kb3cpO1xuXHR9XG5cblx0Y29uc3QgaW5uZXIgPSBGTE9BVElOR19QQU5FTF9JTk5FUl9NQVJHSU47XG5cdGNvbnN0IG1hcmdpbiA9IEZMT0FUSU5HX1BBTkVMX01BUkdJTjtcblx0Y29uc3Qgb3V0ZXIgPSBGTE9BVElOR19QQU5FTF9NQVJHSU4gKiAyO1xuXG5cdHRlc3QoJ21hcmdpbnMgYWNyb3NzIHBhbmVsIHBvc2l0aW9ucywgdGl0bGUgYmFyLCBiYW5uZXIgYW5kIHN0YXR1cyBiYXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0dWFsID0ge1xuXHRcdFx0Ly8gV2luZG93ZWQgZGVmYXVsdDogYSB0aXRsZSBiYXIgYWJvdmUgYW5kIGEgc3RhdHVzIGJhciBiZWxvdy5cblx0XHRcdHRpdGxlQW5kU3RhdHVzQmFyVmlzaWJsZTogbWFyZ2lucygoKSA9PiB7IH0pLFxuXG5cdFx0XHQvLyBOYXRpdmUgZnVsbHNjcmVlbjogbm90aGluZyBhYm92ZSB0aGUgZWRpdG9yLlxuXHRcdFx0dGl0bGVCYXJIaWRkZW46IG1hcmdpbnMocyA9PiB7IHMudmlzaWJsZVBhcnRzLmRlbGV0ZShQYXJ0cy5USVRMRUJBUl9QQVJUKTsgfSksXG5cblx0XHRcdC8vIEEgYmFubmVyIGtlZXBzIHRoZSBlZGl0b3Igb2ZmIHRoZSB3aW5kb3cgZWRnZS5cblx0XHRcdGJhbm5lckluc3RlYWRPZlRpdGxlQmFyOiBtYXJnaW5zKHMgPT4geyBzLnZpc2libGVQYXJ0cy5kZWxldGUoUGFydHMuVElUTEVCQVJfUEFSVCk7IHMudmlzaWJsZVBhcnRzLmFkZChQYXJ0cy5CQU5ORVJfUEFSVCk7IH0pLFxuXG5cdFx0XHQvLyBBIHRvcCBwYW5lbCB0YWtlcyB0aGUgcGxhY2Ugb2YgdGhlIHRpdGxlIGJhciwgc28gdGhlIGdhcCBzdGF5cyBhbiBpbnRlci1jYXJkIG9uZS5cblx0XHRcdHRvcFBhbmVsQXRUb3BFZGdlOiBtYXJnaW5zKHMgPT4geyBzLnBhbmVsUG9zaXRpb24gPSBQb3NpdGlvbi5UT1A7IHMudmlzaWJsZVBhcnRzLmFkZChQYXJ0cy5QQU5FTF9QQVJUKTsgcy52aXNpYmxlUGFydHMuZGVsZXRlKFBhcnRzLlRJVExFQkFSX1BBUlQpOyB9KSxcblxuXHRcdFx0Ly8gU3RhdHVzIGJhciBoaWRkZW46IHRoZSBlZGl0b3IgcmVhY2hlcyB0aGUgd2luZG93IGJvdHRvbS5cblx0XHRcdHN0YXR1c0JhckhpZGRlbjogbWFyZ2lucyhzID0+IHsgcy52aXNpYmxlUGFydHMuZGVsZXRlKFBhcnRzLlNUQVRVU0JBUl9QQVJUKTsgfSksXG5cblx0XHRcdC8vIEEgYm90dG9tIHBhbmVsIHRha2VzIHRoZSBwbGFjZSBvZiB0aGUgc3RhdHVzIGJhci5cblx0XHRcdGJvdHRvbVBhbmVsU3RhdHVzQmFySGlkZGVuOiBtYXJnaW5zKHMgPT4geyBzLnZpc2libGVQYXJ0cy5hZGQoUGFydHMuUEFORUxfUEFSVCk7IHMudmlzaWJsZVBhcnRzLmRlbGV0ZShQYXJ0cy5TVEFUVVNCQVJfUEFSVCk7IH0pLFxuXG5cdFx0XHQvLyBFeHBlcmltZW50IG9mZi5cblx0XHRcdGRpc2FibGVkOiBtYXJnaW5zKHMgPT4geyBzLmZsb2F0aW5nUGFuZWxzRW5hYmxlZCA9IGZhbHNlOyBzLnZpc2libGVQYXJ0cy5jbGVhcigpOyB9KSxcblx0XHR9O1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIHtcblx0XHRcdHRpdGxlQW5kU3RhdHVzQmFyVmlzaWJsZTogeyB0b3A6IGlubmVyLCBib3R0b206IG1hcmdpbiB9LFxuXHRcdFx0dGl0bGVCYXJIaWRkZW46IHsgdG9wOiBvdXRlciwgYm90dG9tOiBtYXJnaW4gfSxcblx0XHRcdGJhbm5lckluc3RlYWRPZlRpdGxlQmFyOiB7IHRvcDogaW5uZXIsIGJvdHRvbTogbWFyZ2luIH0sXG5cdFx0XHR0b3BQYW5lbEF0VG9wRWRnZTogeyB0b3A6IG1hcmdpbiwgYm90dG9tOiBtYXJnaW4gfSxcblx0XHRcdHN0YXR1c0JhckhpZGRlbjogeyB0b3A6IGlubmVyLCBib3R0b206IG91dGVyIH0sXG5cdFx0XHRib3R0b21QYW5lbFN0YXR1c0JhckhpZGRlbjogeyB0b3A6IGlubmVyLCBib3R0b206IGlubmVyIH0sXG5cdFx0XHRkaXNhYmxlZDogeyB0b3A6IDAsIGJvdHRvbTogMCB9LFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMs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
