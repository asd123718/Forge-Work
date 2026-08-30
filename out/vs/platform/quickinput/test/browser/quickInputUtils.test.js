import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { quickInputButtonToAction, quickInputButtonsToActionArrays } from "../../browser/quickInputUtils.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
suite("QuickInputUtils", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("quickInputButtonToAction", () => {
    test("should convert simple button to action", () => {
      const button = {
        iconPath: { dark: URI.file("/path/to/icon.svg") },
        tooltip: "Test Tooltip"
      };
      let runCalled = false;
      const action = quickInputButtonToAction(button, "test-id", () => {
        runCalled = true;
      });
      assert.strictEqual(action.id, "test-id");
      assert.strictEqual(action.tooltip, "Test Tooltip");
      assert.strictEqual(action.enabled, true);
      assert.ok(action.class);
      action.run();
      assert.strictEqual(runCalled, true);
    });
    test("should handle button with iconClass", () => {
      const button = {
        iconClass: "custom-icon-class",
        tooltip: "Test"
      };
      const action = quickInputButtonToAction(button, "test-id", () => {
      });
      assert.ok(action.class?.includes("custom-icon-class"));
    });
    test("should handle alwaysVisible button", () => {
      const button = {
        iconClass: "icon-class",
        tooltip: "Test",
        alwaysVisible: true
      };
      const action = quickInputButtonToAction(button, "test-id", () => {
      });
      assert.ok(action.class?.includes("always-visible"));
      assert.ok(action.class?.includes("icon-class"));
    });
    test("should handle alwaysVisible without iconClass", () => {
      const button = {
        tooltip: "Test",
        alwaysVisible: true
      };
      const action = quickInputButtonToAction(button, "test-id", () => {
      });
      assert.strictEqual(action.class, "always-visible");
    });
    test("should handle toggle button", () => {
      const toggle = {
        checked: false
      };
      const button = {
        iconClass: "toggle-icon",
        tooltip: "Toggle Test",
        toggle
      };
      let runCalled = false;
      const action = quickInputButtonToAction(button, "toggle-id", () => {
        runCalled = true;
      });
      assert.strictEqual(action.id, "toggle-id");
      assert.strictEqual(action.label, "Toggle Test");
      assert.strictEqual(action.tooltip, "");
      assert.notStrictEqual(action.checked, void 0);
      assert.strictEqual(action.checked, false);
      assert.strictEqual(toggle.checked, false);
      action.run();
      assert.strictEqual(runCalled, true);
      assert.strictEqual(action.checked, true);
      assert.strictEqual(toggle.checked, true);
    });
    test("should handle toggle button with initial checked state", () => {
      const toggle = {
        checked: true
      };
      const button = {
        iconClass: "toggle-icon",
        tooltip: "Toggle Test",
        toggle
      };
      const action = quickInputButtonToAction(button, "toggle-id", () => {
      });
      assert.strictEqual(action.checked, true);
      assert.strictEqual(toggle.checked, true);
      action.run();
      assert.strictEqual(action.checked, false);
      assert.strictEqual(toggle.checked, false);
    });
    test("should use empty string for tooltip when not provided", () => {
      const button = {
        iconClass: "icon"
      };
      const action = quickInputButtonToAction(button, "test-id", () => {
      });
      assert.strictEqual(action.tooltip, "");
    });
    test("should handle button with label", () => {
      const button = {
        iconClass: "icon",
        tooltip: "Test",
        label: "Button Label"
      };
      const action = quickInputButtonToAction(button, "test-id", () => {
      });
      assert.strictEqual(action.label, "");
    });
  });
  suite("quickInputButtonsToActionArrays", () => {
    test("should convert empty array", () => {
      const buttons = [];
      const result = quickInputButtonsToActionArrays(buttons, "prefix", () => {
      });
      assert.strictEqual(result.primary.length, 0);
      assert.strictEqual(result.secondary.length, 0);
    });
    test("should convert primary buttons", () => {
      const buttons = [
        { iconClass: "icon1", tooltip: "Button 1" },
        { iconClass: "icon2", tooltip: "Button 2" }
      ];
      const result = quickInputButtonsToActionArrays(buttons, "test", () => {
      });
      assert.strictEqual(result.primary.length, 2);
      assert.strictEqual(result.secondary.length, 0);
      assert.strictEqual(result.primary[0].id, "test-0");
      assert.strictEqual(result.primary[1].id, "test-1");
    });
    test("should convert secondary buttons", () => {
      const buttons = [
        { iconClass: "icon1", tooltip: "Button 1", secondary: true },
        { iconClass: "icon2", tooltip: "Button 2", secondary: true }
      ];
      const result = quickInputButtonsToActionArrays(buttons, "test", () => {
      });
      assert.strictEqual(result.primary.length, 0);
      assert.strictEqual(result.secondary.length, 2);
      assert.strictEqual(result.secondary[0].id, "test-0");
      assert.strictEqual(result.secondary[1].id, "test-1");
    });
    test("should convert mixed primary and secondary buttons", () => {
      const buttons = [
        { iconClass: "icon1", tooltip: "Primary 1" },
        { iconClass: "icon2", tooltip: "Secondary 1", secondary: true },
        { iconClass: "icon3", tooltip: "Primary 2" },
        { iconClass: "icon4", tooltip: "Secondary 2", secondary: true }
      ];
      const result = quickInputButtonsToActionArrays(buttons, "test", () => {
      });
      assert.strictEqual(result.primary.length, 2);
      assert.strictEqual(result.secondary.length, 2);
      assert.strictEqual(result.primary[0].id, "test-0");
      assert.strictEqual(result.primary[1].id, "test-2");
      assert.strictEqual(result.secondary[0].id, "test-1");
      assert.strictEqual(result.secondary[1].id, "test-3");
    });
    test("should apply label to actions", () => {
      const buttons = [
        { iconClass: "icon1", tooltip: "Button 1", label: "Label 1" },
        { iconClass: "icon2", tooltip: "Button 2" }
      ];
      const result = quickInputButtonsToActionArrays(buttons, "test", () => {
      });
      assert.strictEqual(result.primary[0].label, "Label 1");
      assert.strictEqual(result.primary[1].label, "");
    });
    test("should trigger callback with correct button", () => {
      const button1 = { iconClass: "icon1", tooltip: "Button 1" };
      const button2 = { iconClass: "icon2", tooltip: "Button 2" };
      const buttons = [button1, button2];
      const triggeredButtons = [];
      const result = quickInputButtonsToActionArrays(buttons, "test", (button) => {
        triggeredButtons.push(button);
      });
      result.primary[0].run();
      assert.strictEqual(triggeredButtons.length, 1);
      assert.strictEqual(triggeredButtons[0], button1);
      result.primary[1].run();
      assert.strictEqual(triggeredButtons.length, 2);
      assert.strictEqual(triggeredButtons[1], button2);
    });
    test("should handle toggle buttons in arrays", () => {
      const toggle = { checked: false };
      const buttons = [
        { iconClass: "icon1", tooltip: "Toggle", toggle },
        { iconClass: "icon2", tooltip: "Regular" }
      ];
      const result = quickInputButtonsToActionArrays(buttons, "test", () => {
      });
      const toggleAction = result.primary[0];
      assert.strictEqual(toggleAction.checked, false);
      toggleAction.run();
      assert.strictEqual(toggleAction.checked, true);
      assert.strictEqual(toggle.checked, true);
    });
    test("should use correct id prefix", () => {
      const buttons = [
        { iconClass: "icon1", tooltip: "Button 1" }
      ];
      const result1 = quickInputButtonsToActionArrays(buttons, "custom-prefix", () => {
      });
      assert.strictEqual(result1.primary[0].id, "custom-prefix-0");
      const result2 = quickInputButtonsToActionArrays(buttons, "another", () => {
      });
      assert.strictEqual(result2.primary[0].id, "another-0");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxccXVpY2tpbnB1dFxcdGVzdFxcYnJvd3NlclxccXVpY2tJbnB1dFV0aWxzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRCdXR0b24gfSBmcm9tICcuLi8uLi9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBxdWlja0lucHV0QnV0dG9uVG9BY3Rpb24sIHF1aWNrSW5wdXRCdXR0b25zVG9BY3Rpb25BcnJheXMgfSBmcm9tICcuLi8uLi9icm93c2VyL3F1aWNrSW5wdXRVdGlscy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuc3VpdGUoJ1F1aWNrSW5wdXRVdGlscycsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ3F1aWNrSW5wdXRCdXR0b25Ub0FjdGlvbicsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgY29udmVydCBzaW1wbGUgYnV0dG9uIHRvIGFjdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IGJ1dHRvbjogSVF1aWNrSW5wdXRCdXR0b24gPSB7XG5cdFx0XHRcdGljb25QYXRoOiB7IGRhcms6IFVSSS5maWxlKCcvcGF0aC90by9pY29uLnN2ZycpIH0sXG5cdFx0XHRcdHRvb2x0aXA6ICdUZXN0IFRvb2x0aXAnXG5cdFx0XHR9O1xuXG5cdFx0XHRsZXQgcnVuQ2FsbGVkID0gZmFsc2U7XG5cdFx0XHRjb25zdCBhY3Rpb24gPSBxdWlja0lucHV0QnV0dG9uVG9BY3Rpb24oYnV0dG9uLCAndGVzdC1pZCcsICgpID0+IHtcblx0XHRcdFx0cnVuQ2FsbGVkID0gdHJ1ZTtcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uLmlkLCAndGVzdC1pZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbi50b29sdGlwLCAnVGVzdCBUb29sdGlwJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uLmVuYWJsZWQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0Lm9rKGFjdGlvbi5jbGFzcyk7XG5cblx0XHRcdGFjdGlvbi5ydW4oKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW5DYWxsZWQsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBidXR0b24gd2l0aCBpY29uQ2xhc3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBidXR0b246IElRdWlja0lucHV0QnV0dG9uID0ge1xuXHRcdFx0XHRpY29uQ2xhc3M6ICdjdXN0b20taWNvbi1jbGFzcycsXG5cdFx0XHRcdHRvb2x0aXA6ICdUZXN0J1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgYWN0aW9uID0gcXVpY2tJbnB1dEJ1dHRvblRvQWN0aW9uKGJ1dHRvbiwgJ3Rlc3QtaWQnLCAoKSA9PiB7IH0pO1xuXG5cdFx0XHRhc3NlcnQub2soYWN0aW9uLmNsYXNzPy5pbmNsdWRlcygnY3VzdG9tLWljb24tY2xhc3MnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGFsd2F5c1Zpc2libGUgYnV0dG9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYnV0dG9uOiBJUXVpY2tJbnB1dEJ1dHRvbiA9IHtcblx0XHRcdFx0aWNvbkNsYXNzOiAnaWNvbi1jbGFzcycsXG5cdFx0XHRcdHRvb2x0aXA6ICdUZXN0Jyxcblx0XHRcdFx0YWx3YXlzVmlzaWJsZTogdHJ1ZVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgYWN0aW9uID0gcXVpY2tJbnB1dEJ1dHRvblRvQWN0aW9uKGJ1dHRvbiwgJ3Rlc3QtaWQnLCAoKSA9PiB7IH0pO1xuXG5cdFx0XHRhc3NlcnQub2soYWN0aW9uLmNsYXNzPy5pbmNsdWRlcygnYWx3YXlzLXZpc2libGUnKSk7XG5cdFx0XHRhc3NlcnQub2soYWN0aW9uLmNsYXNzPy5pbmNsdWRlcygnaWNvbi1jbGFzcycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgYWx3YXlzVmlzaWJsZSB3aXRob3V0IGljb25DbGFzcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGJ1dHRvbjogSVF1aWNrSW5wdXRCdXR0b24gPSB7XG5cdFx0XHRcdHRvb2x0aXA6ICdUZXN0Jyxcblx0XHRcdFx0YWx3YXlzVmlzaWJsZTogdHJ1ZVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgYWN0aW9uID0gcXVpY2tJbnB1dEJ1dHRvblRvQWN0aW9uKGJ1dHRvbiwgJ3Rlc3QtaWQnLCAoKSA9PiB7IH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uLmNsYXNzLCAnYWx3YXlzLXZpc2libGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgdG9nZ2xlIGJ1dHRvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvZ2dsZSA9IHtcblx0XHRcdFx0Y2hlY2tlZDogZmFsc2Vcblx0XHRcdH07XG5cdFx0XHRjb25zdCBidXR0b246IElRdWlja0lucHV0QnV0dG9uID0ge1xuXHRcdFx0XHRpY29uQ2xhc3M6ICd0b2dnbGUtaWNvbicsXG5cdFx0XHRcdHRvb2x0aXA6ICdUb2dnbGUgVGVzdCcsXG5cdFx0XHRcdHRvZ2dsZVxuXHRcdFx0fTtcblxuXHRcdFx0bGV0IHJ1bkNhbGxlZCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgYWN0aW9uID0gcXVpY2tJbnB1dEJ1dHRvblRvQWN0aW9uKGJ1dHRvbiwgJ3RvZ2dsZS1pZCcsICgpID0+IHtcblx0XHRcdFx0cnVuQ2FsbGVkID0gdHJ1ZTtcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uLmlkLCAndG9nZ2xlLWlkJyk7XG5cdFx0XHQvLyBGb3IgdG9nZ2xlIGJ1dHRvbnMsIHRvb2x0aXAgaXMgdXNlZCBhcyBsYWJlbFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbi5sYWJlbCwgJ1RvZ2dsZSBUZXN0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uLnRvb2x0aXAsICcnKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChhY3Rpb24uY2hlY2tlZCwgdW5kZWZpbmVkKTtcblxuXHRcdFx0Ly8gSW5pdGlhbCBzdGF0ZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbi5jaGVja2VkLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9nZ2xlLmNoZWNrZWQsIGZhbHNlKTtcblxuXHRcdFx0Ly8gUnVuIHRoZSBhY3Rpb25cblx0XHRcdGFjdGlvbi5ydW4oKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW5DYWxsZWQsIHRydWUpO1xuXG5cdFx0XHQvLyBUb2dnbGUgc3RhdGUgc2hvdWxkIGJlIGZsaXBwZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb24uY2hlY2tlZCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9nZ2xlLmNoZWNrZWQsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSB0b2dnbGUgYnV0dG9uIHdpdGggaW5pdGlhbCBjaGVja2VkIHN0YXRlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9nZ2xlID0ge1xuXHRcdFx0XHRjaGVja2VkOiB0cnVlXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgYnV0dG9uOiBJUXVpY2tJbnB1dEJ1dHRvbiA9IHtcblx0XHRcdFx0aWNvbkNsYXNzOiAndG9nZ2xlLWljb24nLFxuXHRcdFx0XHR0b29sdGlwOiAnVG9nZ2xlIFRlc3QnLFxuXHRcdFx0XHR0b2dnbGVcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGFjdGlvbiA9IHF1aWNrSW5wdXRCdXR0b25Ub0FjdGlvbihidXR0b24sICd0b2dnbGUtaWQnLCAoKSA9PiB7IH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uLmNoZWNrZWQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvZ2dsZS5jaGVja2VkLCB0cnVlKTtcblxuXHRcdFx0Ly8gUnVuIHNob3VsZCBmbGlwIHRoZSBzdGF0ZVxuXHRcdFx0YWN0aW9uLnJ1bigpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uLmNoZWNrZWQsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b2dnbGUuY2hlY2tlZCwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHVzZSBlbXB0eSBzdHJpbmcgZm9yIHRvb2x0aXAgd2hlbiBub3QgcHJvdmlkZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBidXR0b246IElRdWlja0lucHV0QnV0dG9uID0ge1xuXHRcdFx0XHRpY29uQ2xhc3M6ICdpY29uJ1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgYWN0aW9uID0gcXVpY2tJbnB1dEJ1dHRvblRvQWN0aW9uKGJ1dHRvbiwgJ3Rlc3QtaWQnLCAoKSA9PiB7IH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uLnRvb2x0aXAsICcnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgYnV0dG9uIHdpdGggbGFiZWwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBidXR0b246IElRdWlja0lucHV0QnV0dG9uID0ge1xuXHRcdFx0XHRpY29uQ2xhc3M6ICdpY29uJyxcblx0XHRcdFx0dG9vbHRpcDogJ1Rlc3QnLFxuXHRcdFx0XHRsYWJlbDogJ0J1dHRvbiBMYWJlbCdcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGFjdGlvbiA9IHF1aWNrSW5wdXRCdXR0b25Ub0FjdGlvbihidXR0b24sICd0ZXN0LWlkJywgKCkgPT4geyB9KTtcblxuXHRcdFx0Ly8gVGhlIGxhYmVsIHByb3BlcnR5IGV4aXN0cyBvbiB0aGUgYnV0dG9uIGJ1dCB0aGUgYWN0aW9uJ3MgbGFiZWwgaXMgaW5pdGlhbGx5IGVtcHR5XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uLmxhYmVsLCAnJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdxdWlja0lucHV0QnV0dG9uc1RvQWN0aW9uQXJyYXlzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBjb252ZXJ0IGVtcHR5IGFycmF5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYnV0dG9uczogSVF1aWNrSW5wdXRCdXR0b25bXSA9IFtdO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBxdWlja0lucHV0QnV0dG9uc1RvQWN0aW9uQXJyYXlzKGJ1dHRvbnMsICdwcmVmaXgnLCAoKSA9PiB7IH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnByaW1hcnkubGVuZ3RoLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc2Vjb25kYXJ5Lmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgY29udmVydCBwcmltYXJ5IGJ1dHRvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBidXR0b25zOiBJUXVpY2tJbnB1dEJ1dHRvbltdID0gW1xuXHRcdFx0XHR7IGljb25DbGFzczogJ2ljb24xJywgdG9vbHRpcDogJ0J1dHRvbiAxJyB9LFxuXHRcdFx0XHR7IGljb25DbGFzczogJ2ljb24yJywgdG9vbHRpcDogJ0J1dHRvbiAyJyB9XG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBxdWlja0lucHV0QnV0dG9uc1RvQWN0aW9uQXJyYXlzKGJ1dHRvbnMsICd0ZXN0JywgKCkgPT4geyB9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5wcmltYXJ5Lmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnNlY29uZGFyeS5sZW5ndGgsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5wcmltYXJ5WzBdLmlkLCAndGVzdC0wJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnByaW1hcnlbMV0uaWQsICd0ZXN0LTEnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBjb252ZXJ0IHNlY29uZGFyeSBidXR0b25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYnV0dG9uczogSVF1aWNrSW5wdXRCdXR0b25bXSA9IFtcblx0XHRcdFx0eyBpY29uQ2xhc3M6ICdpY29uMScsIHRvb2x0aXA6ICdCdXR0b24gMScsIHNlY29uZGFyeTogdHJ1ZSB9LFxuXHRcdFx0XHR7IGljb25DbGFzczogJ2ljb24yJywgdG9vbHRpcDogJ0J1dHRvbiAyJywgc2Vjb25kYXJ5OiB0cnVlIH1cblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHF1aWNrSW5wdXRCdXR0b25zVG9BY3Rpb25BcnJheXMoYnV0dG9ucywgJ3Rlc3QnLCAoKSA9PiB7IH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnByaW1hcnkubGVuZ3RoLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc2Vjb25kYXJ5Lmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnNlY29uZGFyeVswXS5pZCwgJ3Rlc3QtMCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zZWNvbmRhcnlbMV0uaWQsICd0ZXN0LTEnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBjb252ZXJ0IG1peGVkIHByaW1hcnkgYW5kIHNlY29uZGFyeSBidXR0b25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYnV0dG9uczogSVF1aWNrSW5wdXRCdXR0b25bXSA9IFtcblx0XHRcdFx0eyBpY29uQ2xhc3M6ICdpY29uMScsIHRvb2x0aXA6ICdQcmltYXJ5IDEnIH0sXG5cdFx0XHRcdHsgaWNvbkNsYXNzOiAnaWNvbjInLCB0b29sdGlwOiAnU2Vjb25kYXJ5IDEnLCBzZWNvbmRhcnk6IHRydWUgfSxcblx0XHRcdFx0eyBpY29uQ2xhc3M6ICdpY29uMycsIHRvb2x0aXA6ICdQcmltYXJ5IDInIH0sXG5cdFx0XHRcdHsgaWNvbkNsYXNzOiAnaWNvbjQnLCB0b29sdGlwOiAnU2Vjb25kYXJ5IDInLCBzZWNvbmRhcnk6IHRydWUgfVxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcXVpY2tJbnB1dEJ1dHRvbnNUb0FjdGlvbkFycmF5cyhidXR0b25zLCAndGVzdCcsICgpID0+IHsgfSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucHJpbWFyeS5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zZWNvbmRhcnkubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucHJpbWFyeVswXS5pZCwgJ3Rlc3QtMCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5wcmltYXJ5WzFdLmlkLCAndGVzdC0yJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnNlY29uZGFyeVswXS5pZCwgJ3Rlc3QtMScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zZWNvbmRhcnlbMV0uaWQsICd0ZXN0LTMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBhcHBseSBsYWJlbCB0byBhY3Rpb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYnV0dG9uczogSVF1aWNrSW5wdXRCdXR0b25bXSA9IFtcblx0XHRcdFx0eyBpY29uQ2xhc3M6ICdpY29uMScsIHRvb2x0aXA6ICdCdXR0b24gMScsIGxhYmVsOiAnTGFiZWwgMScgfSxcblx0XHRcdFx0eyBpY29uQ2xhc3M6ICdpY29uMicsIHRvb2x0aXA6ICdCdXR0b24gMicgfVxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcXVpY2tJbnB1dEJ1dHRvbnNUb0FjdGlvbkFycmF5cyhidXR0b25zLCAndGVzdCcsICgpID0+IHsgfSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucHJpbWFyeVswXS5sYWJlbCwgJ0xhYmVsIDEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucHJpbWFyeVsxXS5sYWJlbCwgJycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHRyaWdnZXIgY2FsbGJhY2sgd2l0aCBjb3JyZWN0IGJ1dHRvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IGJ1dHRvbjE6IElRdWlja0lucHV0QnV0dG9uID0geyBpY29uQ2xhc3M6ICdpY29uMScsIHRvb2x0aXA6ICdCdXR0b24gMScgfTtcblx0XHRcdGNvbnN0IGJ1dHRvbjI6IElRdWlja0lucHV0QnV0dG9uID0geyBpY29uQ2xhc3M6ICdpY29uMicsIHRvb2x0aXA6ICdCdXR0b24gMicgfTtcblx0XHRcdGNvbnN0IGJ1dHRvbnMgPSBbYnV0dG9uMSwgYnV0dG9uMl07XG5cblx0XHRcdGNvbnN0IHRyaWdnZXJlZEJ1dHRvbnM6IElRdWlja0lucHV0QnV0dG9uW10gPSBbXTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHF1aWNrSW5wdXRCdXR0b25zVG9BY3Rpb25BcnJheXMoYnV0dG9ucywgJ3Rlc3QnLCAoYnV0dG9uKSA9PiB7XG5cdFx0XHRcdHRyaWdnZXJlZEJ1dHRvbnMucHVzaChidXR0b24pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHJlc3VsdC5wcmltYXJ5WzBdLnJ1bigpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyaWdnZXJlZEJ1dHRvbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmlnZ2VyZWRCdXR0b25zWzBdLCBidXR0b24xKTtcblxuXHRcdFx0cmVzdWx0LnByaW1hcnlbMV0ucnVuKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJpZ2dlcmVkQnV0dG9ucy5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyaWdnZXJlZEJ1dHRvbnNbMV0sIGJ1dHRvbjIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSB0b2dnbGUgYnV0dG9ucyBpbiBhcnJheXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b2dnbGUgPSB7IGNoZWNrZWQ6IGZhbHNlIH07XG5cdFx0XHRjb25zdCBidXR0b25zOiBJUXVpY2tJbnB1dEJ1dHRvbltdID0gW1xuXHRcdFx0XHR7IGljb25DbGFzczogJ2ljb24xJywgdG9vbHRpcDogJ1RvZ2dsZScsIHRvZ2dsZSB9LFxuXHRcdFx0XHR7IGljb25DbGFzczogJ2ljb24yJywgdG9vbHRpcDogJ1JlZ3VsYXInIH1cblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHF1aWNrSW5wdXRCdXR0b25zVG9BY3Rpb25BcnJheXMoYnV0dG9ucywgJ3Rlc3QnLCAoKSA9PiB7IH0pO1xuXG5cdFx0XHRjb25zdCB0b2dnbGVBY3Rpb24gPSByZXN1bHQucHJpbWFyeVswXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b2dnbGVBY3Rpb24uY2hlY2tlZCwgZmFsc2UpO1xuXHRcdFx0dG9nZ2xlQWN0aW9uLnJ1bigpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvZ2dsZUFjdGlvbi5jaGVja2VkLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b2dnbGUuY2hlY2tlZCwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdXNlIGNvcnJlY3QgaWQgcHJlZml4JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYnV0dG9uczogSVF1aWNrSW5wdXRCdXR0b25bXSA9IFtcblx0XHRcdFx0eyBpY29uQ2xhc3M6ICdpY29uMScsIHRvb2x0aXA6ICdCdXR0b24gMScgfVxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0MSA9IHF1aWNrSW5wdXRCdXR0b25zVG9BY3Rpb25BcnJheXMoYnV0dG9ucywgJ2N1c3RvbS1wcmVmaXgnLCAoKSA9PiB7IH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdDEucHJpbWFyeVswXS5pZCwgJ2N1c3RvbS1wcmVmaXgtMCcpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQyID0gcXVpY2tJbnB1dEJ1dHRvbnNUb0FjdGlvbkFycmF5cyhidXR0b25zLCAnYW5vdGhlcicsICgpID0+IHsgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Mi5wcmltYXJ5WzBdLmlkLCAnYW5vdGhlci0wJyk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxXQUFXO0FBRXBCLFNBQVMsMEJBQTBCLHVDQUF1QztBQUMxRSxTQUFTLCtDQUErQztBQUV4RCxNQUFNLG1CQUFtQixNQUFNO0FBQzlCLDBDQUF3QztBQUV4QyxRQUFNLDRCQUE0QixNQUFNO0FBQ3ZDLFNBQUssMENBQTBDLE1BQU07QUFDcEQsWUFBTSxTQUE0QjtBQUFB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
