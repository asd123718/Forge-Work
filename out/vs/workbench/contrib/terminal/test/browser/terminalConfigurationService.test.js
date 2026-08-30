import { notStrictEqual, ok, strictEqual } from "assert";
import { getActiveWindow } from "../../../../../base/browser/dom.js";
import { mainWindow } from "../../../../../base/browser/window.js";
import { isLinux } from "../../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { EDITOR_FONT_DEFAULTS } from "../../../../../editor/common/config/fontInfo.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ITerminalConfigurationService, LinuxDistro } from "../../browser/terminal.js";
import { DEFAULT_COMMANDS_TO_SKIP_SHELL } from "../../common/terminal.js";
import { TestTerminalConfigurationService, workbenchInstantiationService } from "../../../../test/browser/workbenchTestServices.js";
suite("Workbench - TerminalConfigurationService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let configurationService;
  let terminalConfigurationService;
  setup(() => {
    const instantiationService = workbenchInstantiationService(void 0, store);
    configurationService = instantiationService.get(IConfigurationService);
    terminalConfigurationService = instantiationService.get(ITerminalConfigurationService);
  });
  suite("config", () => {
    test("should update on any change to terminal.integrated", () => {
      const originalConfig = terminalConfigurationService.config;
      configurationService.onDidChangeConfigurationEmitter.fire({
        affectsConfiguration: (configuration) => configuration.startsWith("terminal.integrated"),
        affectedKeys: /* @__PURE__ */ new Set(["terminal.integrated.fontWeight"]),
        change: null,
        source: ConfigurationTarget.USER
      });
      notStrictEqual(terminalConfigurationService.config, originalConfig, "Object reference must change");
    });
    suite("onConfigChanged", () => {
      test("should fire on any change to terminal.integrated", async () => {
        await new Promise((r) => {
          store.add(terminalConfigurationService.onConfigChanged(() => r()));
          configurationService.onDidChangeConfigurationEmitter.fire({
            affectsConfiguration: (configuration) => configuration.startsWith("terminal.integrated"),
            affectedKeys: /* @__PURE__ */ new Set(["terminal.integrated.fontWeight"]),
            change: null,
            source: ConfigurationTarget.USER
          });
        });
      });
    });
  });
  suite("shouldCommandSkipShell", () => {
    test("should include defaults and added commands", () => {
      const command = "test.command";
      const terminalConfigurationService2 = createTerminalConfigationService({
        terminal: {
          integrated: {
            commandsToSkipShell: [command]
          }
        }
      });
      strictEqual(terminalConfigurationService2.shouldCommandSkipShell(command), true);
      strictEqual(terminalConfigurationService2.shouldCommandSkipShell(DEFAULT_COMMANDS_TO_SKIP_SHELL[0]), true);
    });
    test("should remove excluded defaults", () => {
      const defaultCommand = DEFAULT_COMMANDS_TO_SKIP_SHELL[0];
      const terminalConfigurationService2 = createTerminalConfigationService({
        terminal: {
          integrated: {
            commandsToSkipShell: [`-${defaultCommand}`]
          }
        }
      });
      strictEqual(terminalConfigurationService2.shouldCommandSkipShell(defaultCommand), false);
    });
  });
  function createTerminalConfigationService(config, linuxDistro) {
    const instantiationService = new TestInstantiationService();
    instantiationService.set(IConfigurationService, new TestConfigurationService(config));
    const terminalConfigurationService2 = store.add(instantiationService.createInstance(TestTerminalConfigurationService));
    instantiationService.set(ITerminalConfigurationService, terminalConfigurationService2);
    terminalConfigurationService2.setPanelContainer(mainWindow.document.body);
    if (linuxDistro) {
      terminalConfigurationService2.fontMetrics.linuxDistro = linuxDistro;
    }
    return terminalConfigurationService2;
  }
  suite("getFont", () => {
    test("fontFamily", () => {
      const terminalConfigurationService2 = createTerminalConfigationService({
        editor: { fontFamily: "foo" },
        terminal: { integrated: { fontFamily: "bar" } }
      });
      ok(terminalConfigurationService2.getFont(getActiveWindow()).fontFamily.startsWith("bar"), "terminal.integrated.fontFamily should be selected over editor.fontFamily");
    });
    test("fontFamily (Linux Fedora)", () => {
      const terminalConfigurationService2 = createTerminalConfigationService({
        editor: { fontFamily: "foo" },
        terminal: { integrated: { fontFamily: null } }
      }, LinuxDistro.Fedora);
      ok(terminalConfigurationService2.getFont(getActiveWindow()).fontFamily.startsWith("'DejaVu Sans Mono'"), "Fedora should have its font overridden when terminal.integrated.fontFamily not set");
    });
    test("fontFamily (Linux Ubuntu)", () => {
      const terminalConfigurationService2 = createTerminalConfigationService({
        editor: { fontFamily: "foo" },
        terminal: { integrated: { fontFamily: null } }
      }, LinuxDistro.Ubuntu);
      ok(terminalConfigurationService2.getFont(getActiveWindow()).fontFamily.startsWith("'Ubuntu Mono'"), "Ubuntu should have its font overridden when terminal.integrated.fontFamily not set");
    });
    test("fontFamily (Linux Unknown)", () => {
      const terminalConfigurationService2 = createTerminalConfigationService({
        editor: { fontFamily: "foo" },
        terminal: { integrated: { fontFamily: null } }
      });
      ok(terminalConfigurationService2.getFont(getActiveWindow()).fontFamily.startsWith("foo"), "editor.fontFamily should be the fallback when terminal.integrated.fontFamily not set");
    });
    test("fontSize 10", () => {
      const terminalConfigurationService2 = createTerminalConfigationService({
        editor: {
          fontFamily: "foo",
          fontSize: 9
        },
        terminal: {
          integrated: {
            fontFamily: "bar",
            fontSize: 10
          }
        }
      });
      strictEqual(terminalConfigurationService2.getFont(getActiveWindow()).fontSize, 10, "terminal.integrated.fontSize should be selected over editor.fontSize");
    });
    test("fontSize 0", () => {
      let terminalConfigurationService2 = createTerminalConfigationService({
        editor: {
          fontFamily: "foo"
        },
        terminal: {
          integrated: {
            fontFamily: null,
            fontSize: 0
          }
        }
      }, LinuxDistro.Ubuntu);
      strictEqual(terminalConfigurationService2.getFont(getActiveWindow()).fontSize, 8, "The minimum terminal font size (with adjustment) should be used when terminal.integrated.fontSize less than it");
      terminalConfigurationService2 = createTerminalConfigationService({
        editor: {
          fontFamily: "foo"
        },
        terminal: {
          integrated: {
            fontFamily: null,
            fontSize: 0
          }
        }
      });
      strictEqual(terminalConfigurationService2.getFont(getActiveWindow()).fontSize, 6, "The minimum terminal font size should be used when terminal.integrated.fontSize less than it");
    });
    test("fontSize 1500", () => {
      const terminalConfigurationService2 = createTerminalConfigationService({
        editor: {
          fontFamily: "foo"
        },
        terminal: {
          integrated: {
            fontFamily: 0,
            fontSize: 1500
          }
        }
      });
      strictEqual(terminalConfigurationService2.getFont(getActiveWindow()).fontSize, 100, "The maximum terminal font size should be used when terminal.integrated.fontSize more than it");
    });
    test("fontSize null", () => {
      let terminalConfigurationService2 = createTerminalConfigationService({
        editor: {
          fontFamily: "foo"
        },
        terminal: {
          integrated: {
            fontFamily: 0,
            fontSize: null
          }
        }
      }, LinuxDistro.Ubuntu);
      strictEqual(terminalConfigurationService2.getFont(getActiveWindow()).fontSize, EDITOR_FONT_DEFAULTS.fontSize + 2, "The default editor font size (with adjustment) should be used when terminal.integrated.fontSize is not set");
      terminalConfigurationService2 = createTerminalConfigationService({
        editor: {
          fontFamily: "foo"
        },
        terminal: {
          integrated: {
            fontFamily: 0,
            fontSize: null
          }
        }
      });
      strictEqual(terminalConfigurationService2.getFont(getActiveWindow()).fontSize, EDITOR_FONT_DEFAULTS.fontSize, "The default editor font size should be used when terminal.integrated.fontSize is not set");
    });
    test("lineHeight 2", () => {
      const terminalConfigurationService2 = createTerminalConfigationService({
        editor: {
          fontFamily: "foo",
          lineHeight: 1
        },
        terminal: {
          integrated: {
            fontFamily: 0,
            lineHeight: 2
          }
        }
      });
      strictEqual(terminalConfigurationService2.getFont(getActiveWindow()).lineHeight, 2, "terminal.integrated.lineHeight should be selected over editor.lineHeight");
    });
    test("lineHeight 0", () => {
      const terminalConfigurationService2 = createTerminalConfigationService({
        editor: {
          fontFamily: "foo",
          lineHeight: 1
        },
        terminal: {
          integrated: {
            fontFamily: 0,
            lineHeight: 0
          }
        }
      });
      strictEqual(terminalConfigurationService2.getFont(getActiveWindow()).lineHeight, isLinux ? 1.1 : 1, "editor.lineHeight should be the default when terminal.integrated.lineHeight not set");
    });
  });
  suite("configFontIsMonospace", () => {
    test("isMonospace monospace", () => {
      const terminalConfigurationService2 = createTerminalConfigationService({
        terminal: {
          integrated: {
            fontFamily: "monospace"
          }
        }
      });
      strictEqual(terminalConfigurationService2.configFontIsMonospace(), true, "monospace is monospaced");
    });
    test("isMonospace sans-serif", () => {
      const terminalConfigurationService2 = createTerminalConfigationService({
        terminal: {
          integrated: {
            fontFamily: "sans-serif"
          }
        }
      });
      strictEqual(terminalConfigurationService2.configFontIsMonospace(), false, "sans-serif is not monospaced");
    });
    test("isMonospace serif", () => {
      const terminalConfigurationService2 = createTerminalConfigationService({
        terminal: {
          integrated: {
            fontFamily: "serif"
          }
        }
      });
      strictEqual(terminalConfigurationService2.configFontIsMonospace(), false, "serif is not monospaced");
    });
    test("isMonospace monospace falls back to editor.fontFamily", () => {
      const terminalConfigurationService2 = createTerminalConfigationService({
        editor: {
          fontFamily: "monospace"
        },
        terminal: {
          integrated: {
            fontFamily: null
          }
        }
      });
      strictEqual(terminalConfigurationService2.configFontIsMonospace(), true, "monospace is monospaced");
    });
    test("isMonospace sans-serif falls back to editor.fontFamily", () => {
      const terminalConfigurationService2 = createTerminalConfigationService({
        editor: {
          fontFamily: "sans-serif"
        },
        terminal: {
          integrated: {
            fontFamily: null
          }
        }
      });
      strictEqual(terminalConfigurationService2.configFontIsMonospace(), false, "sans-serif is not monospaced");
    });
    test("isMonospace serif falls back to editor.fontFamily", () => {
      const terminalConfigurationService2 = createTerminalConfigationService({
        editor: {
          fontFamily: "serif"
        },
        terminal: {
          integrated: {
            fontFamily: null
          }
        }
      });
      strictEqual(terminalConfigurationService2.configFontIsMonospace(), false, "serif is not monospaced");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFx0ZXN0XFxicm93c2VyXFx0ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBub3RTdHJpY3RFcXVhbCwgb2ssIHN0cmljdEVxdWFsIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGdldEFjdGl2ZVdpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgaXNMaW51eCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRURJVE9SX0ZPTlRfREVGQVVMVFMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9mb250SW5mby5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBMaW51eERpc3RybyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9DT01NQU5EU19UT19TS0lQX1NIRUxMIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IFRlc3RUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLCB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuXG5zdWl0ZSgnV29ya2JlbmNoIC0gVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZScsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgY29uZmlndXJhdGlvblNlcnZpY2U6IFRlc3RDb25maWd1cmF0aW9uU2VydmljZTtcblx0bGV0IHRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2U6IElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgc3RvcmUpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSkgYXMgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRcdHRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHR9KTtcblxuXHRzdWl0ZSgnY29uZmlnJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCB1cGRhdGUgb24gYW55IGNoYW5nZSB0byB0ZXJtaW5hbC5pbnRlZ3JhdGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxDb25maWcgPSB0ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZztcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbkVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRcdGFmZmVjdHNDb25maWd1cmF0aW9uOiBjb25maWd1cmF0aW9uID0+IGNvbmZpZ3VyYXRpb24uc3RhcnRzV2l0aCgndGVybWluYWwuaW50ZWdyYXRlZCcpLFxuXHRcdFx0XHRhZmZlY3RlZEtleXM6IG5ldyBTZXQoWyd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmZvbnRXZWlnaHQnXSksXG5cdFx0XHRcdGNoYW5nZTogbnVsbCEsXG5cdFx0XHRcdHNvdXJjZTogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSXG5cdFx0XHR9KTtcblx0XHRcdG5vdFN0cmljdEVxdWFsKHRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLCBvcmlnaW5hbENvbmZpZywgJ09iamVjdCByZWZlcmVuY2UgbXVzdCBjaGFuZ2UnKTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCdvbkNvbmZpZ0NoYW5nZWQnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdzaG91bGQgZmlyZSBvbiBhbnkgY2hhbmdlIHRvIHRlcm1pbmFsLmludGVncmF0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHIgPT4ge1xuXHRcdFx0XHRcdHN0b3JlLmFkZCh0ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uQ29uZmlnQ2hhbmdlZCgoKSA9PiByKCkpKTtcblx0XHRcdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb25FbWl0dGVyLmZpcmUoe1xuXHRcdFx0XHRcdFx0YWZmZWN0c0NvbmZpZ3VyYXRpb246IGNvbmZpZ3VyYXRpb24gPT4gY29uZmlndXJhdGlvbi5zdGFydHNXaXRoKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkJyksXG5cdFx0XHRcdFx0XHRhZmZlY3RlZEtleXM6IG5ldyBTZXQoWyd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmZvbnRXZWlnaHQnXSksXG5cdFx0XHRcdFx0XHRjaGFuZ2U6IG51bGwhLFxuXHRcdFx0XHRcdFx0c291cmNlOiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3Nob3VsZENvbW1hbmRTa2lwU2hlbGwnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGluY2x1ZGUgZGVmYXVsdHMgYW5kIGFkZGVkIGNvbW1hbmRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29tbWFuZCA9ICd0ZXN0LmNvbW1hbmQnO1xuXHRcdFx0Y29uc3QgdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSA9IGNyZWF0ZVRlcm1pbmFsQ29uZmlnYXRpb25TZXJ2aWNlKHtcblx0XHRcdFx0dGVybWluYWw6IHtcblx0XHRcdFx0XHRpbnRlZ3JhdGVkOiB7XG5cdFx0XHRcdFx0XHRjb21tYW5kc1RvU2tpcFNoZWxsOiBbY29tbWFuZF1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5zaG91bGRDb21tYW5kU2tpcFNoZWxsKGNvbW1hbmQpLCB0cnVlKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2Uuc2hvdWxkQ29tbWFuZFNraXBTaGVsbChERUZBVUxUX0NPTU1BTkRTX1RPX1NLSVBfU0hFTExbMF0pLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZW1vdmUgZXhjbHVkZWQgZGVmYXVsdHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZWZhdWx0Q29tbWFuZCA9IERFRkFVTFRfQ09NTUFORFNfVE9fU0tJUF9TSEVMTFswXTtcblx0XHRcdGNvbnN0IHRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UgPSBjcmVhdGVUZXJtaW5hbENvbmZpZ2F0aW9uU2VydmljZSh7XG5cdFx0XHRcdHRlcm1pbmFsOiB7XG5cdFx0XHRcdFx0aW50ZWdyYXRlZDoge1xuXHRcdFx0XHRcdFx0Y29tbWFuZHNUb1NraXBTaGVsbDogW2AtJHtkZWZhdWx0Q29tbWFuZH1gXVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLnNob3VsZENvbW1hbmRTa2lwU2hlbGwoZGVmYXVsdENvbW1hbmQpLCBmYWxzZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVRlcm1pbmFsQ29uZmlnYXRpb25TZXJ2aWNlKGNvbmZpZzogYW55LCBsaW51eERpc3Rybz86IExpbnV4RGlzdHJvKTogSVRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2Uge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJQ29uZmlndXJhdGlvblNlcnZpY2UsIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoY29uZmlnKSk7XG5cdFx0Y29uc3QgdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSwgdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0dGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5zZXRQYW5lbENvbnRhaW5lcihtYWluV2luZG93LmRvY3VtZW50LmJvZHkpO1xuXHRcdGlmIChsaW51eERpc3Rybykge1xuXHRcdFx0dGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5mb250TWV0cmljcy5saW51eERpc3RybyA9IGxpbnV4RGlzdHJvO1xuXHRcdH1cblx0XHRyZXR1cm4gdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZTtcblx0fVxuXG5cdHN1aXRlKCdnZXRGb250JywgKCkgPT4ge1xuXHRcdHRlc3QoJ2ZvbnRGYW1pbHknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlID0gY3JlYXRlVGVybWluYWxDb25maWdhdGlvblNlcnZpY2Uoe1xuXHRcdFx0XHRlZGl0b3I6IHsgZm9udEZhbWlseTogJ2ZvbycgfSxcblx0XHRcdFx0dGVybWluYWw6IHsgaW50ZWdyYXRlZDogeyBmb250RmFtaWx5OiAnYmFyJyB9IH1cblx0XHRcdH0pO1xuXHRcdFx0b2sodGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5nZXRGb250KGdldEFjdGl2ZVdpbmRvdygpKS5mb250RmFtaWx5LnN0YXJ0c1dpdGgoJ2JhcicpLCAndGVybWluYWwuaW50ZWdyYXRlZC5mb250RmFtaWx5IHNob3VsZCBiZSBzZWxlY3RlZCBvdmVyIGVkaXRvci5mb250RmFtaWx5Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmb250RmFtaWx5IChMaW51eCBGZWRvcmEpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSA9IGNyZWF0ZVRlcm1pbmFsQ29uZmlnYXRpb25TZXJ2aWNlKHtcblx0XHRcdFx0ZWRpdG9yOiB7IGZvbnRGYW1pbHk6ICdmb28nIH0sXG5cdFx0XHRcdHRlcm1pbmFsOiB7IGludGVncmF0ZWQ6IHsgZm9udEZhbWlseTogbnVsbCB9IH1cblx0XHRcdH0sIExpbnV4RGlzdHJvLkZlZG9yYSk7XG5cdFx0XHRvayh0ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldEZvbnQoZ2V0QWN0aXZlV2luZG93KCkpLmZvbnRGYW1pbHkuc3RhcnRzV2l0aCgnXFwnRGVqYVZ1IFNhbnMgTW9ub1xcJycpLCAnRmVkb3JhIHNob3VsZCBoYXZlIGl0cyBmb250IG92ZXJyaWRkZW4gd2hlbiB0ZXJtaW5hbC5pbnRlZ3JhdGVkLmZvbnRGYW1pbHkgbm90IHNldCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZm9udEZhbWlseSAoTGludXggVWJ1bnR1KScsICgpID0+IHtcblx0XHRcdGNvbnN0IHRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UgPSBjcmVhdGVUZXJtaW5hbENvbmZpZ2F0aW9uU2VydmljZSh7XG5cdFx0XHRcdGVkaXRvcjogeyBmb250RmFtaWx5OiAnZm9vJyB9LFxuXHRcdFx0XHR0ZXJtaW5hbDogeyBpbnRlZ3JhdGVkOiB7IGZvbnRGYW1pbHk6IG51bGwgfSB9XG5cdFx0XHR9LCBMaW51eERpc3Ryby5VYnVudHUpO1xuXHRcdFx0b2sodGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5nZXRGb250KGdldEFjdGl2ZVdpbmRvdygpKS5mb250RmFtaWx5LnN0YXJ0c1dpdGgoJ1xcJ1VidW50dSBNb25vXFwnJyksICdVYnVudHUgc2hvdWxkIGhhdmUgaXRzIGZvbnQgb3ZlcnJpZGRlbiB3aGVuIHRlcm1pbmFsLmludGVncmF0ZWQuZm9udEZhbWlseSBub3Qgc2V0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmb250RmFtaWx5IChMaW51eCBVbmtub3duKScsICgpID0+IHtcblx0XHRcdGNvbnN0IHRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UgPSBjcmVhdGVUZXJtaW5hbENvbmZpZ2F0aW9uU2VydmljZSh7XG5cdFx0XHRcdGVkaXRvcjogeyBmb250RmFtaWx5OiAnZm9vJyB9LFxuXHRcdFx0XHR0ZXJtaW5hbDogeyBpbnRlZ3JhdGVkOiB7IGZvbnRGYW1pbHk6IG51bGwgfSB9XG5cdFx0XHR9KTtcblx0XHRcdG9rKHRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Rm9udChnZXRBY3RpdmVXaW5kb3coKSkuZm9udEZhbWlseS5zdGFydHNXaXRoKCdmb28nKSwgJ2VkaXRvci5mb250RmFtaWx5IHNob3VsZCBiZSB0aGUgZmFsbGJhY2sgd2hlbiB0ZXJtaW5hbC5pbnRlZ3JhdGVkLmZvbnRGYW1pbHkgbm90IHNldCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZm9udFNpemUgMTAnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlID0gY3JlYXRlVGVybWluYWxDb25maWdhdGlvblNlcnZpY2Uoe1xuXHRcdFx0XHRlZGl0b3I6IHtcblx0XHRcdFx0XHRmb250RmFtaWx5OiAnZm9vJyxcblx0XHRcdFx0XHRmb250U2l6ZTogOVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR0ZXJtaW5hbDoge1xuXHRcdFx0XHRcdGludGVncmF0ZWQ6IHtcblx0XHRcdFx0XHRcdGZvbnRGYW1pbHk6ICdiYXInLFxuXHRcdFx0XHRcdFx0Zm9udFNpemU6IDEwXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Rm9udChnZXRBY3RpdmVXaW5kb3coKSkuZm9udFNpemUsIDEwLCAndGVybWluYWwuaW50ZWdyYXRlZC5mb250U2l6ZSBzaG91bGQgYmUgc2VsZWN0ZWQgb3ZlciBlZGl0b3IuZm9udFNpemUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZvbnRTaXplIDAnLCAoKSA9PiB7XG5cdFx0XHRsZXQgdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSA9IGNyZWF0ZVRlcm1pbmFsQ29uZmlnYXRpb25TZXJ2aWNlKHtcblx0XHRcdFx0ZWRpdG9yOiB7XG5cdFx0XHRcdFx0Zm9udEZhbWlseTogJ2Zvbydcblx0XHRcdFx0fSxcblx0XHRcdFx0dGVybWluYWw6IHtcblx0XHRcdFx0XHRpbnRlZ3JhdGVkOiB7XG5cdFx0XHRcdFx0XHRmb250RmFtaWx5OiBudWxsLFxuXHRcdFx0XHRcdFx0Zm9udFNpemU6IDBcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0sIExpbnV4RGlzdHJvLlVidW50dSk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldEZvbnQoZ2V0QWN0aXZlV2luZG93KCkpLmZvbnRTaXplLCA4LCAnVGhlIG1pbmltdW0gdGVybWluYWwgZm9udCBzaXplICh3aXRoIGFkanVzdG1lbnQpIHNob3VsZCBiZSB1c2VkIHdoZW4gdGVybWluYWwuaW50ZWdyYXRlZC5mb250U2l6ZSBsZXNzIHRoYW4gaXQnKTtcblxuXHRcdFx0dGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSA9IGNyZWF0ZVRlcm1pbmFsQ29uZmlnYXRpb25TZXJ2aWNlKHtcblx0XHRcdFx0ZWRpdG9yOiB7XG5cdFx0XHRcdFx0Zm9udEZhbWlseTogJ2Zvbydcblx0XHRcdFx0fSxcblx0XHRcdFx0dGVybWluYWw6IHtcblx0XHRcdFx0XHRpbnRlZ3JhdGVkOiB7XG5cdFx0XHRcdFx0XHRmb250RmFtaWx5OiBudWxsLFxuXHRcdFx0XHRcdFx0Zm9udFNpemU6IDBcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5nZXRGb250KGdldEFjdGl2ZVdpbmRvdygpKS5mb250U2l6ZSwgNiwgJ1RoZSBtaW5pbXVtIHRlcm1pbmFsIGZvbnQgc2l6ZSBzaG91bGQgYmUgdXNlZCB3aGVuIHRlcm1pbmFsLmludGVncmF0ZWQuZm9udFNpemUgbGVzcyB0aGFuIGl0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmb250U2l6ZSAxNTAwJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSA9IGNyZWF0ZVRlcm1pbmFsQ29uZmlnYXRpb25TZXJ2aWNlKHtcblx0XHRcdFx0ZWRpdG9yOiB7XG5cdFx0XHRcdFx0Zm9udEZhbWlseTogJ2Zvbydcblx0XHRcdFx0fSxcblx0XHRcdFx0dGVybWluYWw6IHtcblx0XHRcdFx0XHRpbnRlZ3JhdGVkOiB7XG5cdFx0XHRcdFx0XHRmb250RmFtaWx5OiAwLFxuXHRcdFx0XHRcdFx0Zm9udFNpemU6IDE1MDBcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5nZXRGb250KGdldEFjdGl2ZVdpbmRvdygpKS5mb250U2l6ZSwgMTAwLCAnVGhlIG1heGltdW0gdGVybWluYWwgZm9udCBzaXplIHNob3VsZCBiZSB1c2VkIHdoZW4gdGVybWluYWwuaW50ZWdyYXRlZC5mb250U2l6ZSBtb3JlIHRoYW4gaXQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZvbnRTaXplIG51bGwnLCAoKSA9PiB7XG5cdFx0XHRsZXQgdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSA9IGNyZWF0ZVRlcm1pbmFsQ29uZmlnYXRpb25TZXJ2aWNlKHtcblx0XHRcdFx0ZWRpdG9yOiB7XG5cdFx0XHRcdFx0Zm9udEZhbWlseTogJ2Zvbydcblx0XHRcdFx0fSxcblx0XHRcdFx0dGVybWluYWw6IHtcblx0XHRcdFx0XHRpbnRlZ3JhdGVkOiB7XG5cdFx0XHRcdFx0XHRmb250RmFtaWx5OiAwLFxuXHRcdFx0XHRcdFx0Zm9udFNpemU6IG51bGxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0sIExpbnV4RGlzdHJvLlVidW50dSk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldEZvbnQoZ2V0QWN0aXZlV2luZG93KCkpLmZvbnRTaXplLCBFRElUT1JfRk9OVF9ERUZBVUxUUy5mb250U2l6ZSArIDIsICdUaGUgZGVmYXVsdCBlZGl0b3IgZm9udCBzaXplICh3aXRoIGFkanVzdG1lbnQpIHNob3VsZCBiZSB1c2VkIHdoZW4gdGVybWluYWwuaW50ZWdyYXRlZC5mb250U2l6ZSBpcyBub3Qgc2V0Jyk7XG5cblx0XHRcdHRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UgPSBjcmVhdGVUZXJtaW5hbENvbmZpZ2F0aW9uU2VydmljZSh7XG5cdFx0XHRcdGVkaXRvcjoge1xuXHRcdFx0XHRcdGZvbnRGYW1pbHk6ICdmb28nXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHRlcm1pbmFsOiB7XG5cdFx0XHRcdFx0aW50ZWdyYXRlZDoge1xuXHRcdFx0XHRcdFx0Zm9udEZhbWlseTogMCxcblx0XHRcdFx0XHRcdGZvbnRTaXplOiBudWxsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Rm9udChnZXRBY3RpdmVXaW5kb3coKSkuZm9udFNpemUsIEVESVRPUl9GT05UX0RFRkFVTFRTLmZvbnRTaXplLCAnVGhlIGRlZmF1bHQgZWRpdG9yIGZvbnQgc2l6ZSBzaG91bGQgYmUgdXNlZCB3aGVuIHRlcm1pbmFsLmludGVncmF0ZWQuZm9udFNpemUgaXMgbm90IHNldCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbGluZUhlaWdodCAyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSA9IGNyZWF0ZVRlcm1pbmFsQ29uZmlnYXRpb25TZXJ2aWNlKHtcblx0XHRcdFx0ZWRpdG9yOiB7XG5cdFx0XHRcdFx0Zm9udEZhbWlseTogJ2ZvbycsXG5cdFx0XHRcdFx0bGluZUhlaWdodDogMVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR0ZXJtaW5hbDoge1xuXHRcdFx0XHRcdGludGVncmF0ZWQ6IHtcblx0XHRcdFx0XHRcdGZvbnRGYW1pbHk6IDAsXG5cdFx0XHRcdFx0XHRsaW5lSGVpZ2h0OiAyXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Rm9udChnZXRBY3RpdmVXaW5kb3coKSkubGluZUhlaWdodCwgMiwgJ3Rlcm1pbmFsLmludGVncmF0ZWQubGluZUhlaWdodCBzaG91bGQgYmUgc2VsZWN0ZWQgb3ZlciBlZGl0b3IubGluZUhlaWdodCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbGluZUhlaWdodCAwJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSA9IGNyZWF0ZVRlcm1pbmFsQ29uZmlnYXRpb25TZXJ2aWNlKHtcblx0XHRcdFx0ZWRpdG9yOiB7XG5cdFx0XHRcdFx0Zm9udEZhbWlseTogJ2ZvbycsXG5cdFx0XHRcdFx0bGluZUhlaWdodDogMVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR0ZXJtaW5hbDoge1xuXHRcdFx0XHRcdGludGVncmF0ZWQ6IHtcblx0XHRcdFx0XHRcdGZvbnRGYW1pbHk6IDAsXG5cdFx0XHRcdFx0XHRsaW5lSGVpZ2h0OiAwXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Rm9udChnZXRBY3RpdmVXaW5kb3coKSkubGluZUhlaWdodCwgaXNMaW51eCA/IDEuMSA6IDEsICdlZGl0b3IubGluZUhlaWdodCBzaG91bGQgYmUgdGhlIGRlZmF1bHQgd2hlbiB0ZXJtaW5hbC5pbnRlZ3JhdGVkLmxpbmVIZWlnaHQgbm90IHNldCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnY29uZmlnRm9udElzTW9ub3NwYWNlJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2lzTW9ub3NwYWNlIG1vbm9zcGFjZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UgPSBjcmVhdGVUZXJtaW5hbENvbmZpZ2F0aW9uU2VydmljZSh7XG5cdFx0XHRcdHRlcm1pbmFsOiB7XG5cdFx0XHRcdFx0aW50ZWdyYXRlZDoge1xuXHRcdFx0XHRcdFx0Zm9udEZhbWlseTogJ21vbm9zcGFjZSdcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZ0ZvbnRJc01vbm9zcGFjZSgpLCB0cnVlLCAnbW9ub3NwYWNlIGlzIG1vbm9zcGFjZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lzTW9ub3NwYWNlIHNhbnMtc2VyaWYnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlID0gY3JlYXRlVGVybWluYWxDb25maWdhdGlvblNlcnZpY2Uoe1xuXHRcdFx0XHR0ZXJtaW5hbDoge1xuXHRcdFx0XHRcdGludGVncmF0ZWQ6IHtcblx0XHRcdFx0XHRcdGZvbnRGYW1pbHk6ICdzYW5zLXNlcmlmJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZ0ZvbnRJc01vbm9zcGFjZSgpLCBmYWxzZSwgJ3NhbnMtc2VyaWYgaXMgbm90IG1vbm9zcGFjZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lzTW9ub3NwYWNlIHNlcmlmJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSA9IGNyZWF0ZVRlcm1pbmFsQ29uZmlnYXRpb25TZXJ2aWNlKHtcblx0XHRcdFx0dGVybWluYWw6IHtcblx0XHRcdFx0XHRpbnRlZ3JhdGVkOiB7XG5cdFx0XHRcdFx0XHRmb250RmFtaWx5OiAnc2VyaWYnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnRm9udElzTW9ub3NwYWNlKCksIGZhbHNlLCAnc2VyaWYgaXMgbm90IG1vbm9zcGFjZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lzTW9ub3NwYWNlIG1vbm9zcGFjZSBmYWxscyBiYWNrIHRvIGVkaXRvci5mb250RmFtaWx5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSA9IGNyZWF0ZVRlcm1pbmFsQ29uZmlnYXRpb25TZXJ2aWNlKHtcblx0XHRcdFx0ZWRpdG9yOiB7XG5cdFx0XHRcdFx0Zm9udEZhbWlseTogJ21vbm9zcGFjZSdcblx0XHRcdFx0fSxcblx0XHRcdFx0dGVybWluYWw6IHtcblx0XHRcdFx0XHRpbnRlZ3JhdGVkOiB7XG5cdFx0XHRcdFx0XHRmb250RmFtaWx5OiBudWxsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnRm9udElzTW9ub3NwYWNlKCksIHRydWUsICdtb25vc3BhY2UgaXMgbW9ub3NwYWNlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaXNNb25vc3BhY2Ugc2Fucy1zZXJpZiBmYWxscyBiYWNrIHRvIGVkaXRvci5mb250RmFtaWx5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSA9IGNyZWF0ZVRlcm1pbmFsQ29uZmlnYXRpb25TZXJ2aWNlKHtcblx0XHRcdFx0ZWRpdG9yOiB7XG5cdFx0XHRcdFx0Zm9udEZhbWlseTogJ3NhbnMtc2VyaWYnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHRlcm1pbmFsOiB7XG5cdFx0XHRcdFx0aW50ZWdyYXRlZDoge1xuXHRcdFx0XHRcdFx0Zm9udEZhbWlseTogbnVsbFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZ0ZvbnRJc01vbm9zcGFjZSgpLCBmYWxzZSwgJ3NhbnMtc2VyaWYgaXMgbm90IG1vbm9zcGFjZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lzTW9ub3NwYWNlIHNlcmlmIGZhbGxzIGJhY2sgdG8gZWRpdG9yLmZvbnRGYW1pbHknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlID0gY3JlYXRlVGVybWluYWxDb25maWdhdGlvblNlcnZpY2Uoe1xuXHRcdFx0XHRlZGl0b3I6IHtcblx0XHRcdFx0XHRmb250RmFtaWx5OiAnc2VyaWYnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHRlcm1pbmFsOiB7XG5cdFx0XHRcdFx0aW50ZWdyYXRlZDoge1xuXHRcdFx0XHRcdFx0Zm9udEZhbWlseTogbnVsbFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZ0ZvbnRJc01vbm9zcGFjZSgp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
