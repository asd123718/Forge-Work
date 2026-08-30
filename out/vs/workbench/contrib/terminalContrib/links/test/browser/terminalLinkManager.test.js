import { deepStrictEqual, strictEqual } from "assert";
import { equals } from "../../../../../../base/common/arrays.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ContextMenuService } from "../../../../../../platform/contextview/browser/contextMenuService.js";
import { IContextMenuService } from "../../../../../../platform/contextview/browser/contextView.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { IStorageService } from "../../../../../../platform/storage/common/storage.js";
import { IThemeService } from "../../../../../../platform/theme/common/themeService.js";
import { TestThemeService } from "../../../../../../platform/theme/test/common/testThemeService.js";
import { IViewDescriptorService } from "../../../../../common/views.js";
import { TerminalLinkManager } from "../../browser/terminalLinkManager.js";
import { TestViewDescriptorService } from "../../../../terminal/test/browser/xterm/xtermTerminal.test.js";
import { TestStorageService } from "../../../../../test/common/workbenchTestServices.js";
import { TerminalLinkResolver } from "../../browser/terminalLinkResolver.js";
import { importAMDNodeModule } from "../../../../../../amdX.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestXtermLogger } from "../../../../../../platform/terminal/test/common/terminalTestHelpers.js";
import { runWithFakedTimers } from "../../../../../../base/test/common/timeTravelScheduler.js";
import { timeout } from "../../../../../../base/common/async.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
const defaultTerminalConfig = {
  fontFamily: "monospace",
  fontWeight: "normal",
  fontWeightBold: "normal",
  gpuAcceleration: "off",
  scrollback: 1e3,
  fastScrollSensitivity: 2,
  mouseWheelScrollSensitivity: 1,
  unicodeVersion: "11",
  wordSeparators: " ()[]{}',\"`\u2500\u2018\u2019\u201C\u201D"
};
class TestLinkManager extends TerminalLinkManager {
  async _getLinksForType(y, type) {
    switch (type) {
      case "word":
        return this._links?.wordLinks?.[y] ? [this._links?.wordLinks?.[y]] : void 0;
      case "url":
        return this._links?.webLinks?.[y] ? [this._links?.webLinks?.[y]] : void 0;
      case "localFile":
        return this._links?.fileLinks?.[y] ? [this._links?.fileLinks?.[y]] : void 0;
    }
  }
  setLinks(links) {
    this._links = links;
  }
}
suite("TerminalLinkManager", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let configurationService;
  let themeService;
  let viewDescriptorService;
  let xterm;
  let linkManager;
  setup(async () => {
    configurationService = new TestConfigurationService({
      editor: {
        fastScrollSensitivity: 2,
        mouseWheelScrollSensitivity: 1
      },
      terminal: {
        integrated: defaultTerminalConfig
      }
    });
    themeService = new TestThemeService();
    viewDescriptorService = new TestViewDescriptorService();
    instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IContextMenuService, store.add(instantiationService.createInstance(ContextMenuService)));
    instantiationService.stub(IConfigurationService, configurationService);
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IStorageService, store.add(new TestStorageService()));
    instantiationService.stub(IThemeService, themeService);
    instantiationService.stub(IViewDescriptorService, viewDescriptorService);
    const TerminalCtor = (await importAMDNodeModule("@xterm/xterm", "lib/xterm.js")).Terminal;
    xterm = store.add(new TerminalCtor({ allowProposedApi: true, cols: 80, rows: 30, logger: TestXtermLogger }));
    linkManager = store.add(instantiationService.createInstance(TestLinkManager, xterm, upcastPartial({
      get initialCwd() {
        return "";
      }
      // eslint-disable-next-line local/code-no-any-casts
    }), {
      get(capability) {
        return void 0;
      }
    }, instantiationService.createInstance(TerminalLinkResolver)));
  });
  suite("registerExternalLinkProvider", () => {
    test("should not leak disposables if the link manager is already disposed", () => {
      linkManager.externalProvideLinksCb = async () => void 0;
      linkManager.dispose();
      linkManager.externalProvideLinksCb = async () => void 0;
    });
  });
  function overrideXtermEvent(terminal, eventName, handler) {
    const originalDescriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(terminal), eventName);
    Object.defineProperty(terminal, eventName, { value: handler, configurable: true });
    return {
      dispose: () => {
        if (originalDescriptor) {
          Object.defineProperty(terminal, eventName, originalDescriptor);
        } else {
          delete terminal[eventName];
        }
      }
    };
  }
  function mockXtermCoreRenderService() {
    const xtermWithCore = xterm;
    const origRenderService = xtermWithCore._core?._renderService;
    if (!xtermWithCore._core) {
      xtermWithCore._core = {};
    }
    xtermWithCore._core._renderService = { dimensions: { css: { cell: { width: 8, height: 16 } } }, _renderer: {} };
    return {
      dispose: () => {
        xtermWithCore._core._renderService = origRenderService;
      }
    };
  }
  suite("OSC 8 hover", () => {
    test("should cancel delayed tooltip when leave happens before hover delay", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      await configurationService.setUserConfiguration("workbench.hover.delay", 10);
      const linkHandler = xterm.options.linkHandler;
      if (!linkHandler?.hover || !linkHandler.leave) {
        throw new Error("Expected linkHandler with hover/leave callbacks");
      }
      let hoverShownCount = 0;
      const testableLinkManager = linkManager;
      const originalShowHover = testableLinkManager._showHover;
      testableLinkManager._showHover = () => {
        hoverShownCount++;
        return void 0;
      };
      const range = { start: { x: 1, y: 1 }, end: { x: 10, y: 1 } };
      const event = new MouseEvent("mousemove");
      try {
        linkHandler.hover(event, "http://example.com", range);
        linkHandler.leave(event, "http://example.com", range);
        await timeout(0);
        strictEqual(hoverShownCount, 0);
      } finally {
        testableLinkManager._showHover = originalShowHover;
      }
    }));
    async function assertHoverDismissedOnEvent(overrideEvent) {
      await configurationService.setUserConfiguration("workbench.hover.delay", 0);
      const linkHandler = xterm.options.linkHandler;
      if (!linkHandler?.hover) {
        throw new Error("Expected linkHandler with hover callback");
      }
      let hoverDisposed = false;
      const testableLinkManager = linkManager;
      const originalShowHover = testableLinkManager._showHover;
      testableLinkManager._showHover = () => ({
        dispose: () => {
          hoverDisposed = true;
        }
      });
      const renderServiceRestore = mockXtermCoreRenderService();
      const range = { start: { x: 1, y: 1 }, end: { x: 10, y: 1 } };
      let fireEvent;
      const eventRestore = overrideEvent((fn) => {
        fireEvent = fn;
      });
      try {
        linkHandler.hover(new MouseEvent("mousemove"), "http://example.com", range);
        await timeout(0);
        strictEqual(hoverDisposed, false);
        fireEvent?.();
        strictEqual(hoverDisposed, true);
      } finally {
        eventRestore.dispose();
        renderServiceRestore.dispose();
        testableLinkManager._showHover = originalShowHover;
      }
    }
    test("should dismiss shown tooltip on scroll", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      await assertHoverDismissedOnEvent((setFire) => {
        return overrideXtermEvent(xterm, "onScroll", (listener) => {
          setFire(() => listener(1));
          return { dispose: () => {
          } };
        });
      });
    }));
    test("should dismiss shown tooltip on render", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      await assertHoverDismissedOnEvent((setFire) => {
        return overrideXtermEvent(xterm, "onRender", (listener) => {
          setFire(() => listener({ start: 0, end: 5 }));
          return { dispose: () => {
          } };
        });
      });
    }));
  });
  suite("link hover invalidation", () => {
    test("replacing or invalidating a link hover disposes the previous hover and its invalidation listener", () => {
      instantiationService.stub(IHoverService, upcastPartial({}));
      const disposedAttached = [];
      linkManager.setWidgetManager(upcastPartial({
        attachWidget: (widget) => {
          const index = disposedAttached.push(false) - 1;
          return { dispose: () => {
            disposedAttached[index] = true;
            widget.dispose();
          } };
        }
      }));
      const showHover = linkManager._showHover.bind(linkManager);
      const onInvalidated1 = store.add(new Emitter());
      const onInvalidated2 = store.add(new Emitter());
      const link1 = upcastPartial({ onInvalidated: onInvalidated1.event });
      const link2 = upcastPartial({ onInvalidated: onInvalidated2.event });
      const targetOptions = upcastPartial({});
      showHover(targetOptions, new MarkdownString("hover"), void 0, () => {
      }, link1);
      showHover(targetOptions, new MarkdownString("hover"), void 0, () => {
      }, link2);
      onInvalidated2.fire();
      deepStrictEqual(disposedAttached, [true, true]);
    });
  });
  suite("getLinks and open recent link", () => {
    test("should return no links", async () => {
      const links = await linkManager.getLinks();
      equals(links.viewport.webLinks, []);
      equals(links.viewport.wordLinks, []);
      equals(links.viewport.fileLinks, []);
      const webLink = await linkManager.openRecentLink("url");
      strictEqual(webLink, void 0);
      const fileLink = await linkManager.openRecentLink("localFile");
      strictEqual(fileLink, void 0);
    });
    test("should return word links in order", async () => {
      const link1 = {
        range: {
          start: { x: 1, y: 1 },
          end: { x: 14, y: 1 }
        },
        text: "1_\u6211\u662F\u5B66\u751F.txt",
        activate: () => Promise.resolve("")
      };
      const link2 = {
        range: {
          start: { x: 1, y: 1 },
          end: { x: 14, y: 1 }
        },
        text: "2_\u6211\u662F\u5B66\u751F.txt",
        activate: () => Promise.resolve("")
      };
      linkManager.setLinks({ wordLinks: [link1, link2] });
      const links = await linkManager.getLinks();
      deepStrictEqual(links.viewport.wordLinks?.[0].text, link2.text);
      deepStrictEqual(links.viewport.wordLinks?.[1].text, link1.text);
      const webLink = await linkManager.openRecentLink("url");
      strictEqual(webLink, void 0);
      const fileLink = await linkManager.openRecentLink("localFile");
      strictEqual(fileLink, void 0);
    });
    test("should return web links in order", async () => {
      const link1 = {
        range: { start: { x: 5, y: 1 }, end: { x: 40, y: 1 } },
        text: "https://foo.bar/[this is foo site 1]",
        activate: () => Promise.resolve("")
      };
      const link2 = {
        range: { start: { x: 5, y: 2 }, end: { x: 40, y: 2 } },
        text: "https://foo.bar/[this is foo site 2]",
        activate: () => Promise.resolve("")
      };
      linkManager.setLinks({ webLinks: [link1, link2] });
      const links = await linkManager.getLinks();
      deepStrictEqual(links.viewport.webLinks?.[0].text, link2.text);
      deepStrictEqual(links.viewport.webLinks?.[1].text, link1.text);
      const webLink = await linkManager.openRecentLink("url");
      strictEqual(webLink, link2);
      const fileLink = await linkManager.openRecentLink("localFile");
      strictEqual(fileLink, void 0);
    });
    test("should return file links in order", async () => {
      const link1 = {
        range: { start: { x: 1, y: 1 }, end: { x: 32, y: 1 } },
        text: "file:///C:/users/test/file_1.txt",
        activate: () => Promise.resolve("")
      };
      const link2 = {
        range: { start: { x: 1, y: 2 }, end: { x: 32, y: 2 } },
        text: "file:///C:/users/test/file_2.txt",
        activate: () => Promise.resolve("")
      };
      linkManager.setLinks({ fileLinks: [link1, link2] });
      const links = await linkManager.getLinks();
      deepStrictEqual(links.viewport.fileLinks?.[0].text, link2.text);
      deepStrictEqual(links.viewport.fileLinks?.[1].text, link1.text);
      const webLink = await linkManager.openRecentLink("url");
      strictEqual(webLink, void 0);
      linkManager.setLinks({ fileLinks: [link2] });
      const fileLink = await linkManager.openRecentLink("localFile");
      strictEqual(fileLink, link2);
    });
  });
});
function upcastPartial(v) {
  return v;
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcbGlua3NcXHRlc3RcXGJyb3dzZXJcXHRlcm1pbmFsTGlua01hbmFnZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRlZXBTdHJpY3RFcXVhbCwgc3RyaWN0RXF1YWwgfSBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IElFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dE1lbnVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdFRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL3Rlc3QvY29tbW9uL3Rlc3RUaGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZpZXdEZXNjcmlwdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJRGV0ZWN0ZWRMaW5rcywgVGVybWluYWxMaW5rTWFuYWdlciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdGVybWluYWxMaW5rTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxDYXBhYmlsaXR5SW1wbE1hcCwgSVRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlLCBUZXJtaW5hbENhcGFiaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL2NhcGFiaWxpdGllcy5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxDb25maWd1cmF0aW9uLCBJVGVybWluYWxQcm9jZXNzTWFuYWdlciB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBUZXN0Vmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVybWluYWwvdGVzdC9icm93c2VyL3h0ZXJtL3h0ZXJtVGVybWluYWwudGVzdC5qcyc7XG5pbXBvcnQgeyBUZXN0U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHR5cGUgeyBJTGluaywgVGVybWluYWwgfSBmcm9tICdAeHRlcm0veHRlcm0nO1xuaW1wb3J0IHsgSVh0ZXJtQ29yZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIveHRlcm0tcHJpdmF0ZS5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbExpbmtSZXNvbHZlciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdGVybWluYWxMaW5rUmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgaW1wb3J0QU1ETm9kZU1vZHVsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2FtZFguanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBUZXN0WHRlcm1Mb2dnZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC90ZXN0L2NvbW1vbi90ZXJtaW5hbFRlc3RIZWxwZXJzLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUxpbmtIb3ZlclRhcmdldE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3dpZGdldHMvdGVybWluYWxIb3ZlcldpZGdldC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFdpZGdldE1hbmFnZXIgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3dpZGdldHMvd2lkZ2V0TWFuYWdlci5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbExpbmsgfSBmcm9tICcuLi8uLi9icm93c2VyL3Rlcm1pbmFsTGluay5qcyc7XG5cbmNvbnN0IGRlZmF1bHRUZXJtaW5hbENvbmZpZzogUGFydGlhbDxJVGVybWluYWxDb25maWd1cmF0aW9uPiA9IHtcblx0Zm9udEZhbWlseTogJ21vbm9zcGFjZScsXG5cdGZvbnRXZWlnaHQ6ICdub3JtYWwnLFxuXHRmb250V2VpZ2h0Qm9sZDogJ25vcm1hbCcsXG5cdGdwdUFjY2VsZXJhdGlvbjogJ29mZicsXG5cdHNjcm9sbGJhY2s6IDEwMDAsXG5cdGZhc3RTY3JvbGxTZW5zaXRpdml0eTogMixcblx0bW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5OiAxLFxuXHR1bmljb2RlVmVyc2lvbjogJzExJyxcblx0d29yZFNlcGFyYXRvcnM6ICcgKClbXXt9XFwnLFwiYFx1MjUwMFx1MjAxOFx1MjAxOVx1MjAxQ1x1MjAxRCdcbn07XG5cbmNsYXNzIFRlc3RMaW5rTWFuYWdlciBleHRlbmRzIFRlcm1pbmFsTGlua01hbmFnZXIge1xuXHRwcml2YXRlIF9saW5rczogSURldGVjdGVkTGlua3MgfCB1bmRlZmluZWQ7XG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBfZ2V0TGlua3NGb3JUeXBlKHk6IG51bWJlciwgdHlwZTogJ3dvcmQnIHwgJ3VybCcgfCAnbG9jYWxGaWxlJyk6IFByb21pc2U8SUxpbmtbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHN3aXRjaCAodHlwZSkge1xuXHRcdFx0Y2FzZSAnd29yZCc6XG5cdFx0XHRcdHJldHVybiB0aGlzLl9saW5rcz8ud29yZExpbmtzPy5beV0gPyBbdGhpcy5fbGlua3M/LndvcmRMaW5rcz8uW3ldXSA6IHVuZGVmaW5lZDtcblx0XHRcdGNhc2UgJ3VybCc6XG5cdFx0XHRcdHJldHVybiB0aGlzLl9saW5rcz8ud2ViTGlua3M/Llt5XSA/IFt0aGlzLl9saW5rcz8ud2ViTGlua3M/Llt5XV0gOiB1bmRlZmluZWQ7XG5cdFx0XHRjYXNlICdsb2NhbEZpbGUnOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fbGlua3M/LmZpbGVMaW5rcz8uW3ldID8gW3RoaXMuX2xpbmtzPy5maWxlTGlua3M/Llt5XV0gOiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cdHNldExpbmtzKGxpbmtzOiBJRGV0ZWN0ZWRMaW5rcyk6IHZvaWQge1xuXHRcdHRoaXMuX2xpbmtzID0gbGlua3M7XG5cdH1cbn1cblxuc3VpdGUoJ1Rlcm1pbmFsTGlua01hbmFnZXInLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGxldCBjb25maWd1cmF0aW9uU2VydmljZTogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRsZXQgdGhlbWVTZXJ2aWNlOiBUZXN0VGhlbWVTZXJ2aWNlO1xuXHRsZXQgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBUZXN0Vmlld0Rlc2NyaXB0b3JTZXJ2aWNlO1xuXHRsZXQgeHRlcm06IFRlcm1pbmFsO1xuXHRsZXQgbGlua01hbmFnZXI6IFRlc3RMaW5rTWFuYWdlcjtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdGVkaXRvcjoge1xuXHRcdFx0XHRmYXN0U2Nyb2xsU2Vuc2l0aXZpdHk6IDIsXG5cdFx0XHRcdG1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eTogMVxuXHRcdFx0fSBhcyBQYXJ0aWFsPElFZGl0b3JPcHRpb25zPixcblx0XHRcdHRlcm1pbmFsOiB7XG5cdFx0XHRcdGludGVncmF0ZWQ6IGRlZmF1bHRUZXJtaW5hbENvbmZpZ1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoZW1lU2VydmljZSA9IG5ldyBUZXN0VGhlbWVTZXJ2aWNlKCk7XG5cdFx0dmlld0Rlc2NyaXB0b3JTZXJ2aWNlID0gbmV3IFRlc3RWaWV3RGVzY3JpcHRvclNlcnZpY2UoKTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dE1lbnVTZXJ2aWNlLCBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29udGV4dE1lbnVTZXJ2aWNlKSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yZS5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGhlbWVTZXJ2aWNlLCB0aGVtZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVZpZXdEZXNjcmlwdG9yU2VydmljZSwgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IFRlcm1pbmFsQ3RvciA9IChhd2FpdCBpbXBvcnRBTUROb2RlTW9kdWxlPHR5cGVvZiBpbXBvcnQoJ0B4dGVybS94dGVybScpPignQHh0ZXJtL3h0ZXJtJywgJ2xpYi94dGVybS5qcycpKS5UZXJtaW5hbDtcblx0XHR4dGVybSA9IHN0b3JlLmFkZChuZXcgVGVybWluYWxDdG9yKHsgYWxsb3dQcm9wb3NlZEFwaTogdHJ1ZSwgY29sczogODAsIHJvd3M6IDMwLCBsb2dnZXI6IFRlc3RYdGVybUxvZ2dlciB9KSk7XG5cdFx0bGlua01hbmFnZXIgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdExpbmtNYW5hZ2VyLCB4dGVybSwgdXBjYXN0UGFydGlhbDxJVGVybWluYWxQcm9jZXNzTWFuYWdlcj4oe1xuXHRcdFx0Z2V0IGluaXRpYWxDd2QoKSB7XG5cdFx0XHRcdHJldHVybiAnJztcblx0XHRcdH1cblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdH0pLCB7XG5cdFx0XHRnZXQ8VCBleHRlbmRzIFRlcm1pbmFsQ2FwYWJpbGl0eT4oY2FwYWJpbGl0eTogVCk6IElUZXJtaW5hbENhcGFiaWxpdHlJbXBsTWFwW1RdIHwgdW5kZWZpbmVkIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9IGFzIFBhcnRpYWw8SVRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlPiBhcyBhbnksIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTGlua1Jlc29sdmVyKSkpO1xuXHR9KTtcblxuXHRzdWl0ZSgncmVnaXN0ZXJFeHRlcm5hbExpbmtQcm92aWRlcicsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgbm90IGxlYWsgZGlzcG9zYWJsZXMgaWYgdGhlIGxpbmsgbWFuYWdlciBpcyBhbHJlYWR5IGRpc3Bvc2VkJywgKCkgPT4ge1xuXHRcdFx0bGlua01hbmFnZXIuZXh0ZXJuYWxQcm92aWRlTGlua3NDYiA9IGFzeW5jICgpID0+IHVuZGVmaW5lZDtcblx0XHRcdGxpbmtNYW5hZ2VyLmRpc3Bvc2UoKTtcblx0XHRcdGxpbmtNYW5hZ2VyLmV4dGVybmFsUHJvdmlkZUxpbmtzQ2IgPSBhc3luYyAoKSA9PiB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbmFtaW5nLWNvbnZlbnRpb25cblx0dHlwZSBUZXN0YWJsZUxpbmtNYW5hZ2VyID0geyBfc2hvd0hvdmVyOiAoLi4uYXJnczogdW5rbm93bltdKSA9PiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZCB9O1xuXG5cdGZ1bmN0aW9uIG92ZXJyaWRlWHRlcm1FdmVudDxUPih0ZXJtaW5hbDogVGVybWluYWwsIGV2ZW50TmFtZTogc3RyaW5nLCBoYW5kbGVyOiAobGlzdGVuZXI6IChlOiBUKSA9PiB2b2lkKSA9PiBJRGlzcG9zYWJsZSk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBvcmlnaW5hbERlc2NyaXB0b3IgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKE9iamVjdC5nZXRQcm90b3R5cGVPZih0ZXJtaW5hbCksIGV2ZW50TmFtZSk7XG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KHRlcm1pbmFsLCBldmVudE5hbWUsIHsgdmFsdWU6IGhhbmRsZXIsIGNvbmZpZ3VyYWJsZTogdHJ1ZSB9KTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRpZiAob3JpZ2luYWxEZXNjcmlwdG9yKSB7XG5cdFx0XHRcdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KHRlcm1pbmFsLCBldmVudE5hbWUsIG9yaWdpbmFsRGVzY3JpcHRvcik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZGVsZXRlICh0ZXJtaW5hbCBhcyB1bmtub3duIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtldmVudE5hbWVdO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIG1vY2tYdGVybUNvcmVSZW5kZXJTZXJ2aWNlKCk6IElEaXNwb3NhYmxlIHtcblx0XHRpbnRlcmZhY2UgWHRlcm1XaXRoQ29yZSBleHRlbmRzIFRlcm1pbmFsIHsgX2NvcmU6IElYdGVybUNvcmUgfVxuXHRcdGNvbnN0IHh0ZXJtV2l0aENvcmUgPSB4dGVybSBhcyB1bmtub3duIGFzIFh0ZXJtV2l0aENvcmU7XG5cdFx0Y29uc3Qgb3JpZ1JlbmRlclNlcnZpY2UgPSB4dGVybVdpdGhDb3JlLl9jb3JlPy5fcmVuZGVyU2VydmljZTtcblx0XHRpZiAoIXh0ZXJtV2l0aENvcmUuX2NvcmUpIHsgKHh0ZXJtV2l0aENvcmUgYXMgWHRlcm1XaXRoQ29yZSkuX2NvcmUgPSB7fSBhcyBJWHRlcm1Db3JlOyB9XG5cdFx0eHRlcm1XaXRoQ29yZS5fY29yZS5fcmVuZGVyU2VydmljZSA9IHsgZGltZW5zaW9uczogeyBjc3M6IHsgY2VsbDogeyB3aWR0aDogOCwgaGVpZ2h0OiAxNiB9IH0gfSwgX3JlbmRlcmVyOiB7fSB9O1xuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IHh0ZXJtV2l0aENvcmUuX2NvcmUuX3JlbmRlclNlcnZpY2UgPSBvcmlnUmVuZGVyU2VydmljZSE7IH1cblx0XHR9O1xuXHR9XG5cblx0c3VpdGUoJ09TQyA4IGhvdmVyJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBjYW5jZWwgZGVsYXllZCB0b29sdGlwIHdoZW4gbGVhdmUgaGFwcGVucyBiZWZvcmUgaG92ZXIgZGVsYXknLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCd3b3JrYmVuY2guaG92ZXIuZGVsYXknLCAxMCk7XG5cdFx0XHRjb25zdCBsaW5rSGFuZGxlciA9IHh0ZXJtLm9wdGlvbnMubGlua0hhbmRsZXI7XG5cdFx0XHRpZiAoIWxpbmtIYW5kbGVyPy5ob3ZlciB8fCAhbGlua0hhbmRsZXIubGVhdmUpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdFeHBlY3RlZCBsaW5rSGFuZGxlciB3aXRoIGhvdmVyL2xlYXZlIGNhbGxiYWNrcycpO1xuXHRcdFx0fVxuXHRcdFx0bGV0IGhvdmVyU2hvd25Db3VudCA9IDA7XG5cdFx0XHRjb25zdCB0ZXN0YWJsZUxpbmtNYW5hZ2VyID0gbGlua01hbmFnZXIgYXMgdW5rbm93biBhcyBUZXN0YWJsZUxpbmtNYW5hZ2VyO1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxTaG93SG92ZXIgPSB0ZXN0YWJsZUxpbmtNYW5hZ2VyLl9zaG93SG92ZXI7XG5cdFx0XHR0ZXN0YWJsZUxpbmtNYW5hZ2VyLl9zaG93SG92ZXIgPSAoKSA9PiB7XG5cdFx0XHRcdGhvdmVyU2hvd25Db3VudCsrO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJhbmdlOiBQYXJhbWV0ZXJzPHR5cGVvZiBsaW5rSGFuZGxlci5ob3Zlcj5bMl0gPSB7IHN0YXJ0OiB7IHg6IDEsIHk6IDEgfSwgZW5kOiB7IHg6IDEwLCB5OiAxIH0gfTtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IE1vdXNlRXZlbnQoJ21vdXNlbW92ZScpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0bGlua0hhbmRsZXIuaG92ZXIoZXZlbnQsICdodHRwOi8vZXhhbXBsZS5jb20nLCByYW5nZSk7XG5cdFx0XHRcdGxpbmtIYW5kbGVyLmxlYXZlKGV2ZW50LCAnaHR0cDovL2V4YW1wbGUuY29tJywgcmFuZ2UpO1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0XHRzdHJpY3RFcXVhbChob3ZlclNob3duQ291bnQsIDApO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0dGVzdGFibGVMaW5rTWFuYWdlci5fc2hvd0hvdmVyID0gb3JpZ2luYWxTaG93SG92ZXI7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0LyoqXG5cdFx0ICogVHJpZ2dlcnMgdGhlIGhvdmVyIGNhbGxiYWNrLCBmbHVzaGVzIHRoZSAwbXMgc2NoZWR1bGVyLCB0aGVuXG5cdFx0ICogZmlyZXMgdGhlIGdpdmVuIHh0ZXJtIGV2ZW50IGFuZCBhc3NlcnRzIHRoZSBob3ZlciB3YXMgZGlzcG9zZWQuXG5cdFx0ICovXG5cdFx0YXN5bmMgZnVuY3Rpb24gYXNzZXJ0SG92ZXJEaXNtaXNzZWRPbkV2ZW50KFxuXHRcdFx0b3ZlcnJpZGVFdmVudDogKHNldEZpcmVFdmVudDogKGZuOiAoKSA9PiB2b2lkKSA9PiB2b2lkKSA9PiBJRGlzcG9zYWJsZSxcblx0XHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGF3YWl0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCd3b3JrYmVuY2guaG92ZXIuZGVsYXknLCAwKTtcblx0XHRcdGNvbnN0IGxpbmtIYW5kbGVyID0geHRlcm0ub3B0aW9ucy5saW5rSGFuZGxlcjtcblx0XHRcdGlmICghbGlua0hhbmRsZXI/LmhvdmVyKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignRXhwZWN0ZWQgbGlua0hhbmRsZXIgd2l0aCBob3ZlciBjYWxsYmFjaycpO1xuXHRcdFx0fVxuXHRcdFx0bGV0IGhvdmVyRGlzcG9zZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IHRlc3RhYmxlTGlua01hbmFnZXIgPSBsaW5rTWFuYWdlciBhcyB1bmtub3duIGFzIFRlc3RhYmxlTGlua01hbmFnZXI7XG5cdFx0XHRjb25zdCBvcmlnaW5hbFNob3dIb3ZlciA9IHRlc3RhYmxlTGlua01hbmFnZXIuX3Nob3dIb3Zlcjtcblx0XHRcdHRlc3RhYmxlTGlua01hbmFnZXIuX3Nob3dIb3ZlciA9ICgpID0+ICh7XG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgaG92ZXJEaXNwb3NlZCA9IHRydWU7IH1cblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcmVuZGVyU2VydmljZVJlc3RvcmUgPSBtb2NrWHRlcm1Db3JlUmVuZGVyU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgcmFuZ2U6IFBhcmFtZXRlcnM8dHlwZW9mIGxpbmtIYW5kbGVyLmhvdmVyPlsyXSA9IHsgc3RhcnQ6IHsgeDogMSwgeTogMSB9LCBlbmQ6IHsgeDogMTAsIHk6IDEgfSB9O1xuXHRcdFx0bGV0IGZpcmVFdmVudDogKCgpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgZXZlbnRSZXN0b3JlID0gb3ZlcnJpZGVFdmVudChmbiA9PiB7IGZpcmVFdmVudCA9IGZuOyB9KTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGxpbmtIYW5kbGVyLmhvdmVyKG5ldyBNb3VzZUV2ZW50KCdtb3VzZW1vdmUnKSwgJ2h0dHA6Ly9leGFtcGxlLmNvbScsIHJhbmdlKTtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdFx0c3RyaWN0RXF1YWwoaG92ZXJEaXNwb3NlZCwgZmFsc2UpO1xuXHRcdFx0XHRmaXJlRXZlbnQ/LigpO1xuXHRcdFx0XHRzdHJpY3RFcXVhbChob3ZlckRpc3Bvc2VkLCB0cnVlKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGV2ZW50UmVzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHJlbmRlclNlcnZpY2VSZXN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGVzdGFibGVMaW5rTWFuYWdlci5fc2hvd0hvdmVyID0gb3JpZ2luYWxTaG93SG92ZXI7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGVzdCgnc2hvdWxkIGRpc21pc3Mgc2hvd24gdG9vbHRpcCBvbiBzY3JvbGwnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IGFzc2VydEhvdmVyRGlzbWlzc2VkT25FdmVudChzZXRGaXJlID0+IHtcblx0XHRcdFx0cmV0dXJuIG92ZXJyaWRlWHRlcm1FdmVudDxudW1iZXI+KHh0ZXJtLCAnb25TY3JvbGwnLCBsaXN0ZW5lciA9PiB7XG5cdFx0XHRcdFx0c2V0RmlyZSgoKSA9PiBsaXN0ZW5lcigxKSk7XG5cdFx0XHRcdFx0cmV0dXJuIHsgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGRpc21pc3Mgc2hvd24gdG9vbHRpcCBvbiByZW5kZXInLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IGFzc2VydEhvdmVyRGlzbWlzc2VkT25FdmVudChzZXRGaXJlID0+IHtcblx0XHRcdFx0cmV0dXJuIG92ZXJyaWRlWHRlcm1FdmVudDx7IHN0YXJ0OiBudW1iZXI7IGVuZDogbnVtYmVyIH0+KHh0ZXJtLCAnb25SZW5kZXInLCBsaXN0ZW5lciA9PiB7XG5cdFx0XHRcdFx0c2V0RmlyZSgoKSA9PiBsaXN0ZW5lcih7IHN0YXJ0OiAwLCBlbmQ6IDUgfSkpO1xuXHRcdFx0XHRcdHJldHVybiB7IGRpc3Bvc2U6ICgpID0+IHsgfSB9O1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0fSk7XG5cblx0c3VpdGUoJ2xpbmsgaG92ZXIgaW52YWxpZGF0aW9uJywgKCkgPT4ge1xuXHRcdHR5cGUgU2hvd0hvdmVyID0gKFxuXHRcdFx0dGFyZ2V0T3B0aW9uczogSUxpbmtIb3ZlclRhcmdldE9wdGlvbnMsXG5cdFx0XHR0ZXh0OiBNYXJrZG93blN0cmluZyxcblx0XHRcdGFjdGlvbnM6IHVuZGVmaW5lZCxcblx0XHRcdGxpbmtIYW5kbGVyOiAodXJsOiBzdHJpbmcpID0+IHZvaWQsXG5cdFx0XHRsaW5rPzogVGVybWluYWxMaW5rXG5cdFx0KSA9PiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblxuXHRcdHRlc3QoJ3JlcGxhY2luZyBvciBpbnZhbGlkYXRpbmcgYSBsaW5rIGhvdmVyIGRpc3Bvc2VzIHRoZSBwcmV2aW91cyBob3ZlciBhbmQgaXRzIGludmFsaWRhdGlvbiBsaXN0ZW5lcicsICgpID0+IHtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUhvdmVyU2VydmljZSwgdXBjYXN0UGFydGlhbDxJSG92ZXJTZXJ2aWNlPih7fSkpO1xuXG5cdFx0XHQvLyBGYWtlIHdpZGdldCBtYW5hZ2VyIHRoYXQgcmVjb3JkcyBkaXNwb3NhbCBvZiBlYWNoIGF0dGFjaGVkIGhvdmVyIGFuZCBkaXNwb3NlcyB0aGUgd2lkZ2V0XG5cdFx0XHRjb25zdCBkaXNwb3NlZEF0dGFjaGVkOiBib29sZWFuW10gPSBbXTtcblx0XHRcdGxpbmtNYW5hZ2VyLnNldFdpZGdldE1hbmFnZXIodXBjYXN0UGFydGlhbDxUZXJtaW5hbFdpZGdldE1hbmFnZXI+KHtcblx0XHRcdFx0YXR0YWNoV2lkZ2V0OiB3aWRnZXQgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGluZGV4ID0gZGlzcG9zZWRBdHRhY2hlZC5wdXNoKGZhbHNlKSAtIDE7XG5cdFx0XHRcdFx0cmV0dXJuIHsgZGlzcG9zZTogKCkgPT4geyBkaXNwb3NlZEF0dGFjaGVkW2luZGV4XSA9IHRydWU7IHdpZGdldC5kaXNwb3NlKCk7IH0gfTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRjb25zdCBzaG93SG92ZXIgPSAobGlua01hbmFnZXIgYXMgdW5rbm93biBhcyB7IF9zaG93SG92ZXI6IFNob3dIb3ZlciB9KS5fc2hvd0hvdmVyLmJpbmQobGlua01hbmFnZXIpO1xuXHRcdFx0Y29uc3Qgb25JbnZhbGlkYXRlZDEgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0XHRjb25zdCBvbkludmFsaWRhdGVkMiA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHRcdGNvbnN0IGxpbmsxID0gdXBjYXN0UGFydGlhbDxUZXJtaW5hbExpbms+KHsgb25JbnZhbGlkYXRlZDogb25JbnZhbGlkYXRlZDEuZXZlbnQgfSk7XG5cdFx0XHRjb25zdCBsaW5rMiA9IHVwY2FzdFBhcnRpYWw8VGVybWluYWxMaW5rPih7IG9uSW52YWxpZGF0ZWQ6IG9uSW52YWxpZGF0ZWQyLmV2ZW50IH0pO1xuXHRcdFx0Y29uc3QgdGFyZ2V0T3B0aW9ucyA9IHVwY2FzdFBhcnRpYWw8SUxpbmtIb3ZlclRhcmdldE9wdGlvbnM+KHt9KTtcblxuXHRcdFx0Ly8gU2hvd2luZyBhIHNlY29uZCBsaW5rIGhvdmVyIHNob3VsZCBkaXNwb3NlIHRoZSBmaXJzdCwgdGhlbiBpbnZhbGlkYXRpbmcgdGhlIHNlY29uZCBkaXNwb3NlcyBpdFxuXHRcdFx0c2hvd0hvdmVyKHRhcmdldE9wdGlvbnMsIG5ldyBNYXJrZG93blN0cmluZygnaG92ZXInKSwgdW5kZWZpbmVkLCAoKSA9PiB7IH0sIGxpbmsxKTtcblx0XHRcdHNob3dIb3Zlcih0YXJnZXRPcHRpb25zLCBuZXcgTWFya2Rvd25TdHJpbmcoJ2hvdmVyJyksIHVuZGVmaW5lZCwgKCkgPT4geyB9LCBsaW5rMik7XG5cdFx0XHRvbkludmFsaWRhdGVkMi5maXJlKCk7XG5cblx0XHRcdGRlZXBTdHJpY3RFcXVhbChkaXNwb3NlZEF0dGFjaGVkLCBbdHJ1ZSwgdHJ1ZV0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0TGlua3MgYW5kIG9wZW4gcmVjZW50IGxpbmsnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBubyBsaW5rcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGxpbmtzID0gYXdhaXQgbGlua01hbmFnZXIuZ2V0TGlua3MoKTtcblx0XHRcdGVxdWFscyhsaW5rcy52aWV3cG9ydC53ZWJMaW5rcywgW10pO1xuXHRcdFx0ZXF1YWxzKGxpbmtzLnZpZXdwb3J0LndvcmRMaW5rcywgW10pO1xuXHRcdFx0ZXF1YWxzKGxpbmtzLnZpZXdwb3J0LmZpbGVMaW5rcywgW10pO1xuXHRcdFx0Y29uc3Qgd2ViTGluayA9IGF3YWl0IGxpbmtNYW5hZ2VyLm9wZW5SZWNlbnRMaW5rKCd1cmwnKTtcblx0XHRcdHN0cmljdEVxdWFsKHdlYkxpbmssIHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCBmaWxlTGluayA9IGF3YWl0IGxpbmtNYW5hZ2VyLm9wZW5SZWNlbnRMaW5rKCdsb2NhbEZpbGUnKTtcblx0XHRcdHN0cmljdEVxdWFsKGZpbGVMaW5rLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gd29yZCBsaW5rcyBpbiBvcmRlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGxpbmsxID0ge1xuXHRcdFx0XHRyYW5nZToge1xuXHRcdFx0XHRcdHN0YXJ0OiB7IHg6IDEsIHk6IDEgfSwgZW5kOiB7IHg6IDE0LCB5OiAxIH1cblx0XHRcdFx0fSxcblx0XHRcdFx0dGV4dDogJzFfXHU2MjExXHU2NjJGXHU1QjY2XHU3NTFGLnR4dCcsXG5cdFx0XHRcdGFjdGl2YXRlOiAoKSA9PiBQcm9taXNlLnJlc29sdmUoJycpXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgbGluazIgPSB7XG5cdFx0XHRcdHJhbmdlOiB7XG5cdFx0XHRcdFx0c3RhcnQ6IHsgeDogMSwgeTogMSB9LCBlbmQ6IHsgeDogMTQsIHk6IDEgfVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR0ZXh0OiAnMl9cdTYyMTFcdTY2MkZcdTVCNjZcdTc1MUYudHh0Jyxcblx0XHRcdFx0YWN0aXZhdGU6ICgpID0+IFByb21pc2UucmVzb2x2ZSgnJylcblx0XHRcdH07XG5cdFx0XHRsaW5rTWFuYWdlci5zZXRMaW5rcyh7IHdvcmRMaW5rczogW2xpbmsxLCBsaW5rMl0gfSk7XG5cdFx0XHRjb25zdCBsaW5rcyA9IGF3YWl0IGxpbmtNYW5hZ2VyLmdldExpbmtzKCk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwobGlua3Mudmlld3BvcnQud29yZExpbmtzPy5bMF0udGV4dCwgbGluazIudGV4dCk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwobGlua3Mudmlld3BvcnQud29yZExpbmtzPy5bMV0udGV4dCwgbGluazEudGV4dCk7XG5cdFx0XHRjb25zdCB3ZWJMaW5rID0gYXdhaXQgbGlua01hbmFnZXIub3BlblJlY2VudExpbmsoJ3VybCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwod2ViTGluaywgdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IGZpbGVMaW5rID0gYXdhaXQgbGlua01hbmFnZXIub3BlblJlY2VudExpbmsoJ2xvY2FsRmlsZScpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZmlsZUxpbmssIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiB3ZWIgbGlua3MgaW4gb3JkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBsaW5rMSA9IHtcblx0XHRcdFx0cmFuZ2U6IHsgc3RhcnQ6IHsgeDogNSwgeTogMSB9LCBlbmQ6IHsgeDogNDAsIHk6IDEgfSB9LFxuXHRcdFx0XHR0ZXh0OiAnaHR0cHM6Ly9mb28uYmFyL1t0aGlzIGlzIGZvbyBzaXRlIDFdJyxcblx0XHRcdFx0YWN0aXZhdGU6ICgpID0+IFByb21pc2UucmVzb2x2ZSgnJylcblx0XHRcdH07XG5cdFx0XHRjb25zdCBsaW5rMiA9IHtcblx0XHRcdFx0cmFuZ2U6IHsgc3RhcnQ6IHsgeDogNSwgeTogMiB9LCBlbmQ6IHsgeDogNDAsIHk6IDIgfSB9LFxuXHRcdFx0XHR0ZXh0OiAnaHR0cHM6Ly9mb28uYmFyL1t0aGlzIGlzIGZvbyBzaXRlIDJdJyxcblx0XHRcdFx0YWN0aXZhdGU6ICgpID0+IFByb21pc2UucmVzb2x2ZSgnJylcblx0XHRcdH07XG5cdFx0XHRsaW5rTWFuYWdlci5zZXRMaW5rcyh7IHdlYkxpbmtzOiBbbGluazEsIGxpbmsyXSB9KTtcblx0XHRcdGNvbnN0IGxpbmtzID0gYXdhaXQgbGlua01hbmFnZXIuZ2V0TGlua3MoKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChsaW5rcy52aWV3cG9ydC53ZWJMaW5rcz8uWzBdLnRleHQsIGxpbmsyLnRleHQpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKGxpbmtzLnZpZXdwb3J0LndlYkxpbmtzPy5bMV0udGV4dCwgbGluazEudGV4dCk7XG5cdFx0XHRjb25zdCB3ZWJMaW5rID0gYXdhaXQgbGlua01hbmFnZXIub3BlblJlY2VudExpbmsoJ3VybCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwod2ViTGluaywgbGluazIpO1xuXHRcdFx0Y29uc3QgZmlsZUxpbmsgPSBhd2FpdCBsaW5rTWFuYWdlci5vcGVuUmVjZW50TGluaygnbG9jYWxGaWxlJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChmaWxlTGluaywgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGZpbGUgbGlua3MgaW4gb3JkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBsaW5rMSA9IHtcblx0XHRcdFx0cmFuZ2U6IHsgc3RhcnQ6IHsgeDogMSwgeTogMSB9LCBlbmQ6IHsgeDogMzIsIHk6IDEgfSB9LFxuXHRcdFx0XHR0ZXh0OiAnZmlsZTovLy9DOi91c2Vycy90ZXN0L2ZpbGVfMS50eHQnLFxuXHRcdFx0XHRhY3RpdmF0ZTogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKCcnKVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGxpbmsyID0ge1xuXHRcdFx0XHRyYW5nZTogeyBzdGFydDogeyB4OiAxLCB5OiAyIH0sIGVuZDogeyB4OiAzMiwgeTogMiB9IH0sXG5cdFx0XHRcdHRleHQ6ICdmaWxlOi8vL0M6L3VzZXJzL3Rlc3QvZmlsZV8yLnR4dCcsXG5cdFx0XHRcdGFjdGl2YXRlOiAoKSA9PiBQcm9taXNlLnJlc29sdmUoJycpXG5cdFx0XHR9O1xuXHRcdFx0bGlua01hbmFnZXIuc2V0TGlua3MoeyBmaWxlTGlua3M6IFtsaW5rMSwgbGluazJdIH0pO1xuXHRcdFx0Y29uc3QgbGlua3MgPSBhd2FpdCBsaW5rTWFuYWdlci5nZXRMaW5rcygpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKGxpbmtzLnZpZXdwb3J0LmZpbGVMaW5rcz8uWzBdLnRleHQsIGxpbmsyLnRleHQpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKGxpbmtzLnZpZXdwb3J0LmZpbGVMaW5rcz8uWzFdLnRleHQsIGxpbmsxLnRleHQpO1xuXHRcdFx0Y29uc3Qgd2ViTGluayA9IGF3YWl0IGxpbmtNYW5hZ2VyLm9wZW5SZWNlbnRMaW5rKCd1cmwnKTtcblx0XHRcdHN0cmljdEVxdWFsKHdlYkxpbmssIHVuZGVmaW5lZCk7XG5cdFx0XHRsaW5rTWFuYWdlci5zZXRMaW5rcyh7IGZpbGVMaW5rczogW2xpbmsyXSB9KTtcblx0XHRcdGNvbnN0IGZpbGVMaW5rID0gYXdhaXQgbGlua01hbmFnZXIub3BlblJlY2VudExpbmsoJ2xvY2FsRmlsZScpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZmlsZUxpbmssIGxpbmsyKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbmZ1bmN0aW9uIHVwY2FzdFBhcnRpYWw8VD4odjogUGFydGlhbDxUPik6IFQge1xuXHRyZXR1cm4gdiBhcyBUO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxpQkFBaUIsbUJBQW1CO0FBQzdDLFNBQVMsY0FBYztBQUV2QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGFBQWEsc0JBQXNCO0FBQzVDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQXlCLDJCQUEyQjtBQUdwRCxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLDBCQUEwQjtBQUduQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGVBQWU7QUFFeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMscUJBQXFCO0FBSzlCLE1BQU0sd0JBQXlEO0FBQUEsRUFDOUQsWUFBWTtBQUFBLEVBQ1osWUFBWTtBQUFBLEVBQ1osZ0JBQWdCO0FBQUEsRUFDaEIsaUJBQWlCO0FBQUEsRUFDakIsWUFBWTtBQUFBLEVBQ1osdUJBQXVCO0FBQUEsRUFDdkIsNkJBQTZCO0FBQUEsRUFDN0IsZ0JBQWdCO0FBQUEsRUFDaEIsZ0JBQWdCO0FBQ2pCO0FBRUEsTUFBTSx3QkFBd0Isb0JBQW9CO0FBQUEsRUFFakQsTUFBeUIsaUJBQWlCLEdBQVcsTUFBa0U7QUFDdEgsWUFBUSxNQUFNO0FBQUEsTUFDYixLQUFLO0FBQ0osZUFBTyxLQUFLLFFBQVEsWUFBWSxDQUFDLElBQUksQ0FBQyxLQUFLLFFBQVEsWUFBWSxDQUFDLENBQUMsSUFBSTtBQUFBLE1BQ3RFLEtBQUs7QUFDSixlQUFPLEtBQUssUUFB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
