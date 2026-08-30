import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { collapseToShorthands, formatMatchedStyles } from "../../common/cssHelpers.js";
function collapse(props) {
  return collapseToShorthands(new Map(Object.entries(props)));
}
suite("collapseToShorthands", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("margin: all sides equal \u2192 1-value", () => {
    assert.deepStrictEqual(collapse({
      "margin-top": "10px",
      "margin-right": "10px",
      "margin-bottom": "10px",
      "margin-left": "10px"
    }), ["margin: 10px;"]);
  });
  test("padding: vertical/horizontal \u2192 2-value", () => {
    assert.deepStrictEqual(collapse({
      "padding-top": "4px",
      "padding-right": "12px",
      "padding-bottom": "4px",
      "padding-left": "12px"
    }), ["padding: 4px 12px;"]);
  });
  test("margin: 3-value when left === right", () => {
    assert.deepStrictEqual(collapse({
      "margin-top": "10px",
      "margin-right": "5px",
      "margin-bottom": "20px",
      "margin-left": "5px"
    }), ["margin: 10px 5px 20px;"]);
  });
  test("margin: 4-value when all differ", () => {
    assert.deepStrictEqual(collapse({
      "margin-top": "1px",
      "margin-right": "2px",
      "margin-bottom": "3px",
      "margin-left": "4px"
    }), ["margin: 1px 2px 3px 4px;"]);
  });
  test("border-radius: uniform", () => {
    assert.deepStrictEqual(collapse({
      "border-top-left-radius": "6px",
      "border-top-right-radius": "6px",
      "border-bottom-right-radius": "6px",
      "border-bottom-left-radius": "6px"
    }), ["border-radius: 6px;"]);
  });
  test("border: uniform sides \u2192 single shorthand", () => {
    assert.deepStrictEqual(collapse({
      "border-top-width": "1px",
      "border-right-width": "1px",
      "border-bottom-width": "1px",
      "border-left-width": "1px",
      "border-top-style": "solid",
      "border-right-style": "solid",
      "border-bottom-style": "solid",
      "border-left-style": "solid",
      "border-top-color": "red",
      "border-right-color": "red",
      "border-bottom-color": "red",
      "border-left-color": "red"
    }), ["border: 1px solid red;"]);
  });
  test("border: non-uniform \u2192 per-group shorthands", () => {
    const result = collapse({
      "border-top-width": "1px",
      "border-right-width": "2px",
      "border-bottom-width": "1px",
      "border-left-width": "2px",
      "border-top-style": "solid",
      "border-right-style": "solid",
      "border-bottom-style": "solid",
      "border-left-style": "solid",
      "border-top-color": "red",
      "border-right-color": "red",
      "border-bottom-color": "red",
      "border-left-color": "red"
    });
    assert.deepStrictEqual(result, [
      "border-width: 1px 2px;",
      "border-style: solid;",
      "border-color: red;"
    ]);
  });
  test("border-image at defaults \u2192 dropped entirely", () => {
    assert.deepStrictEqual(collapse({
      "border-image-source": "none",
      "border-image-slice": "100%",
      "border-image-width": "1",
      "border-image-outset": "0",
      "border-image-repeat": "stretch",
      "color": "red"
    }), ["color: red;"]);
  });
  test("animation-range at defaults \u2192 dropped", () => {
    assert.deepStrictEqual(collapse({
      "animation-range-start": "normal",
      "animation-range-end": "normal",
      "display": "block"
    }), ["display: block;"]);
  });
  test("background: color-only when others at default", () => {
    assert.deepStrictEqual(collapse({
      "background-color": "rgb(255, 0, 0)",
      "background-image": "none",
      "background-position-x": "0px",
      "background-position-y": "0px",
      "background-size": "auto",
      "background-repeat": "repeat",
      "background-attachment": "scroll",
      "background-origin": "padding-box",
      "background-clip": "border-box"
    }), ["background: rgb(255, 0, 0);"]);
  });
  test("text-decoration: none", () => {
    assert.deepStrictEqual(collapse({
      "text-decoration-line": "none",
      "text-decoration-style": "solid",
      "text-decoration-color": "currentcolor",
      "text-decoration-thickness": "auto"
    }), ["text-decoration: none;"]);
  });
  test("text-decoration: underline with non-default style", () => {
    assert.deepStrictEqual(collapse({
      "text-decoration-line": "underline",
      "text-decoration-style": "wavy",
      "text-decoration-color": "currentcolor",
      "text-decoration-thickness": "auto"
    }), ["text-decoration: underline wavy;"]);
  });
  test("white-space: nowrap", () => {
    assert.deepStrictEqual(collapse({
      "white-space-collapse": "collapse",
      "text-wrap-mode": "nowrap"
    }), ["white-space: nowrap;"]);
  });
  test("white-space: pre-wrap", () => {
    assert.deepStrictEqual(collapse({
      "white-space-collapse": "preserve",
      "text-wrap-mode": "wrap"
    }), ["white-space: pre-wrap;"]);
  });
  test("transition: single property with cubic-bezier", () => {
    assert.deepStrictEqual(collapse({
      "transition-property": "opacity",
      "transition-duration": "0.5s",
      "transition-timing-function": "cubic-bezier(0.16, 1, 0.3, 1)",
      "transition-delay": "0s",
      "transition-behavior": "normal"
    }), ["transition: opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1);"]);
  });
  test("transition: multi-property comma-separated", () => {
    assert.deepStrictEqual(collapse({
      "transition-property": "opacity, transform",
      "transition-duration": "0.5s, 0.3s",
      "transition-timing-function": "ease, ease",
      "transition-delay": "0s, 0s",
      "transition-behavior": "normal, normal"
    }), ["transition: opacity 0.5s, transform 0.3s;"]);
  });
  test("animation: name and duration only", () => {
    assert.deepStrictEqual(collapse({
      "animation-name": "fadeIn",
      "animation-duration": "0.3s",
      "animation-timing-function": "ease",
      "animation-delay": "0s",
      "animation-iteration-count": "1",
      "animation-direction": "normal",
      "animation-fill-mode": "none",
      "animation-play-state": "running",
      "animation-timeline": "auto"
    }), ["animation: fadeIn 0.3s;"]);
  });
  test("animation: with fill-mode and custom easing", () => {
    assert.deepStrictEqual(collapse({
      "animation-name": "slideIn",
      "animation-duration": "0.5s",
      "animation-timing-function": "ease-in-out",
      "animation-delay": "0s",
      "animation-iteration-count": "1",
      "animation-direction": "normal",
      "animation-fill-mode": "forwards",
      "animation-play-state": "running",
      "animation-timeline": "auto"
    }), ["animation: slideIn 0.5s ease-in-out forwards;"]);
  });
  test("unknown properties pass through alphabetically", () => {
    assert.deepStrictEqual(collapse({
      "z-index": "1",
      "color": "red",
      "display": "flex"
    }), ["color: red;", "display: flex;", "z-index: 1;"]);
  });
  test("realistic element with multiple shorthand groups", () => {
    const result = collapse({
      "padding-top": "4px",
      "padding-right": "12px",
      "padding-bottom": "4px",
      "padding-left": "12px",
      "border-top-left-radius": "6px",
      "border-top-right-radius": "6px",
      "border-bottom-right-radius": "6px",
      "border-bottom-left-radius": "6px",
      "border-top-width": "1px",
      "border-right-width": "1px",
      "border-bottom-width": "1px",
      "border-left-width": "1px",
      "border-top-style": "solid",
      "border-right-style": "solid",
      "border-bottom-style": "solid",
      "border-left-style": "solid",
      "border-top-color": "rgb(209, 217, 224)",
      "border-right-color": "rgb(209, 217, 224)",
      "border-bottom-color": "rgb(209, 217, 224)",
      "border-left-color": "rgb(209, 217, 224)",
      "border-image-source": "none",
      "border-image-slice": "100%",
      "border-image-width": "1",
      "border-image-outset": "0",
      "border-image-repeat": "stretch",
      "background-color": "rgba(0, 0, 0, 0)",
      "background-image": "none",
      "background-position-x": "0px",
      "background-position-y": "0px",
      "background-size": "auto",
      "background-repeat": "repeat",
      "background-attachment": "scroll",
      "background-origin": "padding-box",
      "background-clip": "border-box",
      "text-decoration-line": "none",
      "text-decoration-style": "solid",
      "text-decoration-color": "currentcolor",
      "text-decoration-thickness": "auto",
      "white-space-collapse": "collapse",
      "text-wrap-mode": "nowrap",
      "transition-property": "opacity, transform",
      "transition-duration": "0.5s, 0.5s",
      "transition-timing-function": "cubic-bezier(0.16, 1, 0.3, 1), cubic-bezier(0.16, 1, 0.3, 1)",
      "transition-delay": "0s, 0s",
      "transition-behavior": "normal, normal",
      "color": "rgb(255, 255, 255)",
      "display": "inline-flex",
      "font-size": "14px"
    });
    assert.deepStrictEqual(result, [
      "padding: 4px 12px;",
      "border-radius: 6px;",
      "border: 1px solid rgb(209, 217, 224);",
      "background: rgba(0, 0, 0, 0);",
      "text-decoration: none;",
      "white-space: nowrap;",
      "transition: opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1), transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);",
      "color: rgb(255, 255, 255);",
      "display: inline-flex;",
      "font-size: 14px;"
    ]);
  });
});
function rule(selector, cssText, origin = "regular") {
  const props = cssText.split(";").map((d) => d.trim()).filter(Boolean).map((d) => {
    const [name, ...rest] = d.split(":");
    return { name: name.trim(), value: rest.join(":").trim() };
  });
  return { rule: { selectorList: { selectors: [{ text: selector }] }, origin, style: { cssText, cssProperties: props } } };
}
suite("formatAuthorStyles", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("includes direct author rules and skips user-agent", () => {
    const matched = {
      matchedCSSRules: [
        rule(".btn", "padding: 8px; color: white;"),
        rule("button", "display: inline-block;", "user-agent")
      ]
    };
    const { rulesText } = formatMatchedStyles(matched);
    assert.ok(rulesText.includes(".btn"));
    assert.ok(rulesText.includes("padding: 8px"));
    assert.ok(!rulesText.includes("display: inline-block"));
  });
  test("includes pseudo-element styles", () => {
    const matched = {
      matchedCSSRules: [rule(".btn", "color: white;")],
      pseudoElements: [
        {
          pseudoType: "before",
          matches: [rule(".btn::before", 'content: "\u2192"; color: red;')]
        },
        {
          pseudoType: "after",
          matches: [rule(".btn::after", 'content: "\u2713"; color: green;')]
        }
      ]
    };
    const { rulesText } = formatMatchedStyles(matched);
    assert.ok(rulesText.includes("/* Pseudo-elements */"));
    assert.ok(rulesText.includes(".btn::before"));
    assert.ok(rulesText.includes(".btn::after"));
    assert.ok(rulesText.includes('content: "\u2192"'));
  });
  test("skips user-agent pseudo-element rules", () => {
    const matched = {
      matchedCSSRules: [rule(".x", "color: red;")],
      pseudoElements: [
        {
          pseudoType: "before",
          matches: [rule("input::before", 'content: "";', "user-agent")]
        }
      ]
    };
    const { rulesText } = formatMatchedStyles(matched);
    assert.ok(!rulesText.includes("Pseudo-elements"));
  });
  test("filters inherited rules to inheritable properties only", () => {
    const matched = {
      matchedCSSRules: [rule(".child", "display: flex;")],
      inherited: [{
        matchedCSSRules: [rule("body", "font-family: sans-serif; background: red; margin: 0;")]
      }]
    };
    const { rulesText } = formatMatchedStyles(matched);
    assert.ok(rulesText.includes("font-family: sans-serif"));
    assert.ok(!rulesText.includes("background"));
    assert.ok(!rulesText.includes("margin"));
  });
  test("collects var references from rules", () => {
    const matched = {
      matchedCSSRules: [rule(".x", "color: var(--fg-color); border: var(--border-width) solid;")]
    };
    const { referencedVars } = formatMatchedStyles(matched);
    assert.ok(referencedVars.has("--fg-color"));
    assert.ok(referencedVars.has("--border-width"));
  });
  test("tracks author property names from cssProperties longhands", () => {
    const matched = {
      matchedCSSRules: [{
        rule: {
          selectorList: { selectors: [{ text: ".x" }] },
          origin: "regular",
          style: {
            cssText: "border: 1px solid red;",
            cssProperties: [
              { name: "border-top-width", value: "1px" },
              { name: "border-top-style", value: "solid" },
              { name: "border-top-color", value: "red" }
            ]
          }
        }
      }]
    };
    const { authorPropertyNames } = formatMatchedStyles(matched);
    assert.ok(authorPropertyNames.has("border-top-width"));
    assert.ok(authorPropertyNames.has("border-top-style"));
    assert.ok(authorPropertyNames.has("display"));
    assert.ok(authorPropertyNames.has("width"));
  });
  test("tracks user-agent property names from direct rules", () => {
    const matched = {
      matchedCSSRules: [
        rule(".btn", "color: white;"),
        rule("button", "display: inline-block; padding: 2px;", "user-agent")
      ]
    };
    const { userAgentPropertyNames } = formatMatchedStyles(matched);
    assert.ok(userAgentPropertyNames.has("display"));
    assert.ok(userAgentPropertyNames.has("padding"));
    assert.ok(!userAgentPropertyNames.has("color"));
  });
  test("tracks user-agent property names from pseudo-element rules", () => {
    const matched = {
      matchedCSSRules: [rule(".x", "color: red;")],
      pseudoElements: [
        {
          pseudoType: "before",
          matches: [rule("input::before", 'content: ""; display: block;', "user-agent")]
        }
      ]
    };
    const { userAgentPropertyNames } = formatMatchedStyles(matched);
    assert.ok(userAgentPropertyNames.has("content"));
    assert.ok(userAgentPropertyNames.has("display"));
  });
  test("tracks user-agent property names from inherited rules (inheritable only)", () => {
    const matched = {
      matchedCSSRules: [rule(".child", "display: flex;")],
      inherited: [{
        matchedCSSRules: [rule("body", "font-family: sans-serif; margin: 0;", "user-agent")]
      }]
    };
    const { userAgentPropertyNames } = formatMatchedStyles(matched);
    assert.ok(userAgentPropertyNames.has("font-family"));
    assert.ok(!userAgentPropertyNames.has("margin"));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYnJvd3NlclZpZXdcXHRlc3RcXGNvbW1vblxcY3NzSGVscGVycy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBjb2xsYXBzZVRvU2hvcnRoYW5kcywgZm9ybWF0TWF0Y2hlZFN0eWxlcywgdHlwZSBJTWF0Y2hlZFN0eWxlcyB9IGZyb20gJy4uLy4uL2NvbW1vbi9jc3NIZWxwZXJzLmpzJztcblxuLyoqIEhlbHBlcjogYnVpbGQgYSBNYXAgZnJvbSBhbiBvYmplY3QgbGl0ZXJhbCBhbmQgcnVuIGNvbGxhcHNlVG9TaG9ydGhhbmRzLiAqL1xuZnVuY3Rpb24gY29sbGFwc2UocHJvcHM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pOiBzdHJpbmdbXSB7XG5cdHJldHVybiBjb2xsYXBzZVRvU2hvcnRoYW5kcyhuZXcgTWFwKE9iamVjdC5lbnRyaWVzKHByb3BzKSkpO1xufVxuXG5zdWl0ZSgnY29sbGFwc2VUb1Nob3J0aGFuZHMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Ly8gXHUyNTAwXHUyNTAwIEJveCBzaG9ydGhhbmRzIFx1MjUwMFx1MjUwMFxuXG5cdHRlc3QoJ21hcmdpbjogYWxsIHNpZGVzIGVxdWFsIFx1MjE5MiAxLXZhbHVlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29sbGFwc2Uoe1xuXHRcdFx0J21hcmdpbi10b3AnOiAnMTBweCcsICdtYXJnaW4tcmlnaHQnOiAnMTBweCcsICdtYXJnaW4tYm90dG9tJzogJzEwcHgnLCAnbWFyZ2luLWxlZnQnOiAnMTBweCcsXG5cdFx0fSksIFsnbWFyZ2luOiAxMHB4OyddKTtcblx0fSk7XG5cblx0dGVzdCgncGFkZGluZzogdmVydGljYWwvaG9yaXpvbnRhbCBcdTIxOTIgMi12YWx1ZScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbGxhcHNlKHtcblx0XHRcdCdwYWRkaW5nLXRvcCc6ICc0cHgnLCAncGFkZGluZy1yaWdodCc6ICcxMnB4JywgJ3BhZGRpbmctYm90dG9tJzogJzRweCcsICdwYWRkaW5nLWxlZnQnOiAnMTJweCcsXG5cdFx0fSksIFsncGFkZGluZzogNHB4IDEycHg7J10pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXJnaW46IDMtdmFsdWUgd2hlbiBsZWZ0ID09PSByaWdodCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbGxhcHNlKHtcblx0XHRcdCdtYXJnaW4tdG9wJzogJzEwcHgnLCAnbWFyZ2luLXJpZ2h0JzogJzVweCcsICdtYXJnaW4tYm90dG9tJzogJzIwcHgnLCAnbWFyZ2luLWxlZnQnOiAnNXB4Jyxcblx0XHR9KSwgWydtYXJnaW46IDEwcHggNXB4IDIwcHg7J10pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXJnaW46IDQtdmFsdWUgd2hlbiBhbGwgZGlmZmVyJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29sbGFwc2Uoe1xuXHRcdFx0J21hcmdpbi10b3AnOiAnMXB4JywgJ21hcmdpbi1yaWdodCc6ICcycHgnLCAnbWFyZ2luLWJvdHRvbSc6ICczcHgnLCAnbWFyZ2luLWxlZnQnOiAnNHB4Jyxcblx0XHR9KSwgWydtYXJnaW46IDFweCAycHggM3B4IDRweDsnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2JvcmRlci1yYWRpdXM6IHVuaWZvcm0nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb2xsYXBzZSh7XG5cdFx0XHQnYm9yZGVyLXRvcC1sZWZ0LXJhZGl1cyc6ICc2cHgnLCAnYm9yZGVyLXRvcC1yaWdodC1yYWRpdXMnOiAnNnB4Jyxcblx0XHRcdCdib3JkZXItYm90dG9tLXJpZ2h0LXJhZGl1cyc6ICc2cHgnLCAnYm9yZGVyLWJvdHRvbS1sZWZ0LXJhZGl1cyc6ICc2cHgnLFxuXHRcdH0pLCBbJ2JvcmRlci1yYWRpdXM6IDZweDsnXSk7XG5cdH0pO1xuXG5cdC8vIFx1MjUwMFx1MjUwMCBCb3JkZXIgXHUyNTAwXHUyNTAwXG5cblx0dGVzdCgnYm9yZGVyOiB1bmlmb3JtIHNpZGVzIFx1MjE5MiBzaW5nbGUgc2hvcnRoYW5kJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29sbGFwc2Uoe1xuXHRcdFx0J2JvcmRlci10b3Atd2lkdGgnOiAnMXB4JywgJ2JvcmRlci1yaWdodC13aWR0aCc6ICcxcHgnLCAnYm9yZGVyLWJvdHRvbS13aWR0aCc6ICcxcHgnLCAnYm9yZGVyLWxlZnQtd2lkdGgnOiAnMXB4Jyxcblx0XHRcdCdib3JkZXItdG9wLXN0eWxlJzogJ3NvbGlkJywgJ2JvcmRlci1yaWdodC1zdHlsZSc6ICdzb2xpZCcsICdib3JkZXItYm90dG9tLXN0eWxlJzogJ3NvbGlkJywgJ2JvcmRlci1sZWZ0LXN0eWxlJzogJ3NvbGlkJyxcblx0XHRcdCdib3JkZXItdG9wLWNvbG9yJzogJ3JlZCcsICdib3JkZXItcmlnaHQtY29sb3InOiAncmVkJywgJ2JvcmRlci1ib3R0b20tY29sb3InOiAncmVkJywgJ2JvcmRlci1sZWZ0LWNvbG9yJzogJ3JlZCcsXG5cdFx0fSksIFsnYm9yZGVyOiAxcHggc29saWQgcmVkOyddKTtcblx0fSk7XG5cblx0dGVzdCgnYm9yZGVyOiBub24tdW5pZm9ybSBcdTIxOTIgcGVyLWdyb3VwIHNob3J0aGFuZHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gY29sbGFwc2Uoe1xuXHRcdFx0J2JvcmRlci10b3Atd2lkdGgnOiAnMXB4JywgJ2JvcmRlci1yaWdodC13aWR0aCc6ICcycHgnLCAnYm9yZGVyLWJvdHRvbS13aWR0aCc6ICcxcHgnLCAnYm9yZGVyLWxlZnQtd2lkdGgnOiAnMnB4Jyxcblx0XHRcdCdib3JkZXItdG9wLXN0eWxlJzogJ3NvbGlkJywgJ2JvcmRlci1yaWdodC1zdHlsZSc6ICdzb2xpZCcsICdib3JkZXItYm90dG9tLXN0eWxlJzogJ3NvbGlkJywgJ2JvcmRlci1sZWZ0LXN0eWxlJzogJ3NvbGlkJyxcblx0XHRcdCdib3JkZXItdG9wLWNvbG9yJzogJ3JlZCcsICdib3JkZXItcmlnaHQtY29sb3InOiAncmVkJywgJ2JvcmRlci1ib3R0b20tY29sb3InOiAncmVkJywgJ2JvcmRlci1sZWZ0LWNvbG9yJzogJ3JlZCcsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtcblx0XHRcdCdib3JkZXItd2lkdGg6IDFweCAycHg7Jyxcblx0XHRcdCdib3JkZXItc3R5bGU6IHNvbGlkOycsXG5cdFx0XHQnYm9yZGVyLWNvbG9yOiByZWQ7Jyxcblx0XHRdKTtcblx0fSk7XG5cblx0Ly8gXHUyNTAwXHUyNTAwIERyb3Atd2hlbi1hbGwtZGVmYXVsdCBcdTI1MDBcdTI1MDBcblxuXHR0ZXN0KCdib3JkZXItaW1hZ2UgYXQgZGVmYXVsdHMgXHUyMTkyIGRyb3BwZWQgZW50aXJlbHknLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb2xsYXBzZSh7XG5cdFx0XHQnYm9yZGVyLWltYWdlLXNvdXJjZSc6ICdub25lJywgJ2JvcmRlci1pbWFnZS1zbGljZSc6ICcxMDAlJyxcblx0XHRcdCdib3JkZXItaW1hZ2Utd2lkdGgnOiAnMScsICdib3JkZXItaW1hZ2Utb3V0c2V0JzogJzAnLCAnYm9yZGVyLWltYWdlLXJlcGVhdCc6ICdzdHJldGNoJyxcblx0XHRcdCdjb2xvcic6ICdyZWQnLFxuXHRcdH0pLCBbJ2NvbG9yOiByZWQ7J10pO1xuXHR9KTtcblxuXHR0ZXN0KCdhbmltYXRpb24tcmFuZ2UgYXQgZGVmYXVsdHMgXHUyMTkyIGRyb3BwZWQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb2xsYXBzZSh7XG5cdFx0XHQnYW5pbWF0aW9uLXJhbmdlLXN0YXJ0JzogJ25vcm1hbCcsICdhbmltYXRpb24tcmFuZ2UtZW5kJzogJ25vcm1hbCcsXG5cdFx0XHQnZGlzcGxheSc6ICdibG9jaycsXG5cdFx0fSksIFsnZGlzcGxheTogYmxvY2s7J10pO1xuXHR9KTtcblxuXHQvLyBcdTI1MDBcdTI1MDAgQmFja2dyb3VuZCBcdTI1MDBcdTI1MDBcblxuXHR0ZXN0KCdiYWNrZ3JvdW5kOiBjb2xvci1vbmx5IHdoZW4gb3RoZXJzIGF0IGRlZmF1bHQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb2xsYXBzZSh7XG5cdFx0XHQnYmFja2dyb3VuZC1jb2xvcic6ICdyZ2IoMjU1LCAwLCAwKScsXG5cdFx0XHQnYmFja2dyb3VuZC1pbWFnZSc6ICdub25lJywgJ2JhY2tncm91bmQtcG9zaXRpb24teCc6ICcwcHgnLCAnYmFja2dyb3VuZC1wb3NpdGlvbi15JzogJzBweCcsXG5cdFx0XHQnYmFja2dyb3VuZC1zaXplJzogJ2F1dG8nLCAnYmFja2dyb3VuZC1yZXBlYXQnOiAncmVwZWF0JywgJ2JhY2tncm91bmQtYXR0YWNobWVudCc6ICdzY3JvbGwnLFxuXHRcdFx0J2JhY2tncm91bmQtb3JpZ2luJzogJ3BhZGRpbmctYm94JywgJ2JhY2tncm91bmQtY2xpcCc6ICdib3JkZXItYm94Jyxcblx0XHR9KSwgWydiYWNrZ3JvdW5kOiByZ2IoMjU1LCAwLCAwKTsnXSk7XG5cdH0pO1xuXG5cdC8vIFx1MjUwMFx1MjUwMCBUZXh0LWRlY29yYXRpb24gXHUyNTAwXHUyNTAwXG5cblx0dGVzdCgndGV4dC1kZWNvcmF0aW9uOiBub25lJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29sbGFwc2Uoe1xuXHRcdFx0J3RleHQtZGVjb3JhdGlvbi1saW5lJzogJ25vbmUnLCAndGV4dC1kZWNvcmF0aW9uLXN0eWxlJzogJ3NvbGlkJyxcblx0XHRcdCd0ZXh0LWRlY29yYXRpb24tY29sb3InOiAnY3VycmVudGNvbG9yJywgJ3RleHQtZGVjb3JhdGlvbi10aGlja25lc3MnOiAnYXV0bycsXG5cdFx0fSksIFsndGV4dC1kZWNvcmF0aW9uOiBub25lOyddKTtcblx0fSk7XG5cblx0dGVzdCgndGV4dC1kZWNvcmF0aW9uOiB1bmRlcmxpbmUgd2l0aCBub24tZGVmYXVsdCBzdHlsZScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbGxhcHNlKHtcblx0XHRcdCd0ZXh0LWRlY29yYXRpb24tbGluZSc6ICd1bmRlcmxpbmUnLCAndGV4dC1kZWNvcmF0aW9uLXN0eWxlJzogJ3dhdnknLFxuXHRcdFx0J3RleHQtZGVjb3JhdGlvbi1jb2xvcic6ICdjdXJyZW50Y29sb3InLCAndGV4dC1kZWNvcmF0aW9uLXRoaWNrbmVzcyc6ICdhdXRvJyxcblx0XHR9KSwgWyd0ZXh0LWRlY29yYXRpb246IHVuZGVybGluZSB3YXZ5OyddKTtcblx0fSk7XG5cblx0Ly8gXHUyNTAwXHUyNTAwIFdoaXRlLXNwYWNlIFx1MjUwMFx1MjUwMFxuXG5cdHRlc3QoJ3doaXRlLXNwYWNlOiBub3dyYXAnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb2xsYXBzZSh7XG5cdFx0XHQnd2hpdGUtc3BhY2UtY29sbGFwc2UnOiAnY29sbGFwc2UnLCAndGV4dC13cmFwLW1vZGUnOiAnbm93cmFwJyxcblx0XHR9KSwgWyd3aGl0ZS1zcGFjZTogbm93cmFwOyddKTtcblx0fSk7XG5cblx0dGVzdCgnd2hpdGUtc3BhY2U6IHByZS13cmFwJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29sbGFwc2Uoe1xuXHRcdFx0J3doaXRlLXNwYWNlLWNvbGxhcHNlJzogJ3ByZXNlcnZlJywgJ3RleHQtd3JhcC1tb2RlJzogJ3dyYXAnLFxuXHRcdH0pLCBbJ3doaXRlLXNwYWNlOiBwcmUtd3JhcDsnXSk7XG5cdH0pO1xuXG5cdC8vIFx1MjUwMFx1MjUwMCBUcmFuc2l0aW9uIFx1MjUwMFx1MjUwMFxuXG5cdHRlc3QoJ3RyYW5zaXRpb246IHNpbmdsZSBwcm9wZXJ0eSB3aXRoIGN1YmljLWJlemllcicsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbGxhcHNlKHtcblx0XHRcdCd0cmFuc2l0aW9uLXByb3BlcnR5JzogJ29wYWNpdHknLFxuXHRcdFx0J3RyYW5zaXRpb24tZHVyYXRpb24nOiAnMC41cycsXG5cdFx0XHQndHJhbnNpdGlvbi10aW1pbmctZnVuY3Rpb24nOiAnY3ViaWMtYmV6aWVyKDAuMTYsIDEsIDAuMywgMSknLFxuXHRcdFx0J3RyYW5zaXRpb24tZGVsYXknOiAnMHMnLFxuXHRcdFx0J3RyYW5zaXRpb24tYmVoYXZpb3InOiAnbm9ybWFsJyxcblx0XHR9KSwgWyd0cmFuc2l0aW9uOiBvcGFjaXR5IDAuNXMgY3ViaWMtYmV6aWVyKDAuMTYsIDEsIDAuMywgMSk7J10pO1xuXHR9KTtcblxuXHR0ZXN0KCd0cmFuc2l0aW9uOiBtdWx0aS1wcm9wZXJ0eSBjb21tYS1zZXBhcmF0ZWQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb2xsYXBzZSh7XG5cdFx0XHQndHJhbnNpdGlvbi1wcm9wZXJ0eSc6ICdvcGFjaXR5LCB0cmFuc2Zvcm0nLFxuXHRcdFx0J3RyYW5zaXRpb24tZHVyYXRpb24nOiAnMC41cywgMC4zcycsXG5cdFx0XHQndHJhbnNpdGlvbi10aW1pbmctZnVuY3Rpb24nOiAnZWFzZSwgZWFzZScsXG5cdFx0XHQndHJhbnNpdGlvbi1kZWxheSc6ICcwcywgMHMnLFxuXHRcdFx0J3RyYW5zaXRpb24tYmVoYXZpb3InOiAnbm9ybWFsLCBub3JtYWwnLFxuXHRcdH0pLCBbJ3RyYW5zaXRpb246IG9wYWNpdHkgMC41cywgdHJhbnNmb3JtIDAuM3M7J10pO1xuXHR9KTtcblxuXHQvLyBcdTI1MDBcdTI1MDAgQW5pbWF0aW9uIFx1MjUwMFx1MjUwMFxuXG5cdHRlc3QoJ2FuaW1hdGlvbjogbmFtZSBhbmQgZHVyYXRpb24gb25seScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbGxhcHNlKHtcblx0XHRcdCdhbmltYXRpb24tbmFtZSc6ICdmYWRlSW4nLCAnYW5pbWF0aW9uLWR1cmF0aW9uJzogJzAuM3MnLFxuXHRcdFx0J2FuaW1hdGlvbi10aW1pbmctZnVuY3Rpb24nOiAnZWFzZScsICdhbmltYXRpb24tZGVsYXknOiAnMHMnLFxuXHRcdFx0J2FuaW1hdGlvbi1pdGVyYXRpb24tY291bnQnOiAnMScsICdhbmltYXRpb24tZGlyZWN0aW9uJzogJ25vcm1hbCcsXG5cdFx0XHQnYW5pbWF0aW9uLWZpbGwtbW9kZSc6ICdub25lJywgJ2FuaW1hdGlvbi1wbGF5LXN0YXRlJzogJ3J1bm5pbmcnLFxuXHRcdFx0J2FuaW1hdGlvbi10aW1lbGluZSc6ICdhdXRvJyxcblx0XHR9KSwgWydhbmltYXRpb246IGZhZGVJbiAwLjNzOyddKTtcblx0fSk7XG5cblx0dGVzdCgnYW5pbWF0aW9uOiB3aXRoIGZpbGwtbW9kZSBhbmQgY3VzdG9tIGVhc2luZycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbGxhcHNlKHtcblx0XHRcdCdhbmltYXRpb24tbmFtZSc6ICdzbGlkZUluJywgJ2FuaW1hdGlvbi1kdXJhdGlvbic6ICcwLjVzJyxcblx0XHRcdCdhbmltYXRpb24tdGltaW5nLWZ1bmN0aW9uJzogJ2Vhc2UtaW4tb3V0JywgJ2FuaW1hdGlvbi1kZWxheSc6ICcwcycsXG5cdFx0XHQnYW5pbWF0aW9uLWl0ZXJhdGlvbi1jb3VudCc6ICcxJywgJ2FuaW1hdGlvbi1kaXJlY3Rpb24nOiAnbm9ybWFsJyxcblx0XHRcdCdhbmltYXRpb24tZmlsbC1tb2RlJzogJ2ZvcndhcmRzJywgJ2FuaW1hdGlvbi1wbGF5LXN0YXRlJzogJ3J1bm5pbmcnLFxuXHRcdFx0J2FuaW1hdGlvbi10aW1lbGluZSc6ICdhdXRvJyxcblx0XHR9KSwgWydhbmltYXRpb246IHNsaWRlSW4gMC41cyBlYXNlLWluLW91dCBmb3J3YXJkczsnXSk7XG5cdH0pO1xuXG5cdC8vIFx1MjUwMFx1MjUwMCBSZW1haW5pbmcgcHJvcGVydGllcyBwYXNzIHRocm91Z2ggc29ydGVkIFx1MjUwMFx1MjUwMFxuXG5cdHRlc3QoJ3Vua25vd24gcHJvcGVydGllcyBwYXNzIHRocm91Z2ggYWxwaGFiZXRpY2FsbHknLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb2xsYXBzZSh7XG5cdFx0XHQnei1pbmRleCc6ICcxJywgJ2NvbG9yJzogJ3JlZCcsICdkaXNwbGF5JzogJ2ZsZXgnLFxuXHRcdH0pLCBbJ2NvbG9yOiByZWQ7JywgJ2Rpc3BsYXk6IGZsZXg7JywgJ3otaW5kZXg6IDE7J10pO1xuXHR9KTtcblxuXHQvLyBcdTI1MDBcdTI1MDAgTWl4ZWQ6IHJlYWxpc3RpYyBHaXRIdWItbGlrZSBlbGVtZW50IFx1MjUwMFx1MjUwMFxuXG5cdHRlc3QoJ3JlYWxpc3RpYyBlbGVtZW50IHdpdGggbXVsdGlwbGUgc2hvcnRoYW5kIGdyb3VwcycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBjb2xsYXBzZSh7XG5cdFx0XHQncGFkZGluZy10b3AnOiAnNHB4JywgJ3BhZGRpbmctcmlnaHQnOiAnMTJweCcsICdwYWRkaW5nLWJvdHRvbSc6ICc0cHgnLCAncGFkZGluZy1sZWZ0JzogJzEycHgnLFxuXHRcdFx0J2JvcmRlci10b3AtbGVmdC1yYWRpdXMnOiAnNnB4JywgJ2JvcmRlci10b3AtcmlnaHQtcmFkaXVzJzogJzZweCcsXG5cdFx0XHQnYm9yZGVyLWJvdHRvbS1yaWdodC1yYWRpdXMnOiAnNnB4JywgJ2JvcmRlci1ib3R0b20tbGVmdC1yYWRpdXMnOiAnNnB4Jyxcblx0XHRcdCdib3JkZXItdG9wLXdpZHRoJzogJzFweCcsICdib3JkZXItcmlnaHQtd2lkdGgnOiAnMXB4JywgJ2JvcmRlci1ib3R0b20td2lkdGgnOiAnMXB4JywgJ2JvcmRlci1sZWZ0LXdpZHRoJzogJzFweCcsXG5cdFx0XHQnYm9yZGVyLXRvcC1zdHlsZSc6ICdzb2xpZCcsICdib3JkZXItcmlnaHQtc3R5bGUnOiAnc29saWQnLCAnYm9yZGVyLWJvdHRvbS1zdHlsZSc6ICdzb2xpZCcsICdib3JkZXItbGVmdC1zdHlsZSc6ICdzb2xpZCcsXG5cdFx0XHQnYm9yZGVyLXRvcC1jb2xvcic6ICdyZ2IoMjA5LCAyMTcsIDIyNCknLCAnYm9yZGVyLXJpZ2h0LWNvbG9yJzogJ3JnYigyMDksIDIxNywgMjI0KScsXG5cdFx0XHQnYm9yZGVyLWJvdHRvbS1jb2xvcic6ICdyZ2IoMjA5LCAyMTcsIDIyNCknLCAnYm9yZGVyLWxlZnQtY29sb3InOiAncmdiKDIwOSwgMjE3LCAyMjQpJyxcblx0XHRcdCdib3JkZXItaW1hZ2Utc291cmNlJzogJ25vbmUnLCAnYm9yZGVyLWltYWdlLXNsaWNlJzogJzEwMCUnLFxuXHRcdFx0J2JvcmRlci1pbWFnZS13aWR0aCc6ICcxJywgJ2JvcmRlci1pbWFnZS1vdXRzZXQnOiAnMCcsICdib3JkZXItaW1hZ2UtcmVwZWF0JzogJ3N0cmV0Y2gnLFxuXHRcdFx0J2JhY2tncm91bmQtY29sb3InOiAncmdiYSgwLCAwLCAwLCAwKScsXG5cdFx0XHQnYmFja2dyb3VuZC1pbWFnZSc6ICdub25lJywgJ2JhY2tncm91bmQtcG9zaXRpb24teCc6ICcwcHgnLCAnYmFja2dyb3VuZC1wb3NpdGlvbi15JzogJzBweCcsXG5cdFx0XHQnYmFja2dyb3VuZC1zaXplJzogJ2F1dG8nLCAnYmFja2dyb3VuZC1yZXBlYXQnOiAncmVwZWF0JywgJ2JhY2tncm91bmQtYXR0YWNobWVudCc6ICdzY3JvbGwnLFxuXHRcdFx0J2JhY2tncm91bmQtb3JpZ2luJzogJ3BhZGRpbmctYm94JywgJ2JhY2tncm91bmQtY2xpcCc6ICdib3JkZXItYm94Jyxcblx0XHRcdCd0ZXh0LWRlY29yYXRpb24tbGluZSc6ICdub25lJywgJ3RleHQtZGVjb3JhdGlvbi1zdHlsZSc6ICdzb2xpZCcsXG5cdFx0XHQndGV4dC1kZWNvcmF0aW9uLWNvbG9yJzogJ2N1cnJlbnRjb2xvcicsICd0ZXh0LWRlY29yYXRpb24tdGhpY2tuZXNzJzogJ2F1dG8nLFxuXHRcdFx0J3doaXRlLXNwYWNlLWNvbGxhcHNlJzogJ2NvbGxhcHNlJywgJ3RleHQtd3JhcC1tb2RlJzogJ25vd3JhcCcsXG5cdFx0XHQndHJhbnNpdGlvbi1wcm9wZXJ0eSc6ICdvcGFjaXR5LCB0cmFuc2Zvcm0nLFxuXHRcdFx0J3RyYW5zaXRpb24tZHVyYXRpb24nOiAnMC41cywgMC41cycsXG5cdFx0XHQndHJhbnNpdGlvbi10aW1pbmctZnVuY3Rpb24nOiAnY3ViaWMtYmV6aWVyKDAuMTYsIDEsIDAuMywgMSksIGN1YmljLWJlemllcigwLjE2LCAxLCAwLjMsIDEpJyxcblx0XHRcdCd0cmFuc2l0aW9uLWRlbGF5JzogJzBzLCAwcycsXG5cdFx0XHQndHJhbnNpdGlvbi1iZWhhdmlvcic6ICdub3JtYWwsIG5vcm1hbCcsXG5cdFx0XHQnY29sb3InOiAncmdiKDI1NSwgMjU1LCAyNTUpJyxcblx0XHRcdCdkaXNwbGF5JzogJ2lubGluZS1mbGV4Jyxcblx0XHRcdCdmb250LXNpemUnOiAnMTRweCcsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtcblx0XHRcdCdwYWRkaW5nOiA0cHggMTJweDsnLFxuXHRcdFx0J2JvcmRlci1yYWRpdXM6IDZweDsnLFxuXHRcdFx0J2JvcmRlcjogMXB4IHNvbGlkIHJnYigyMDksIDIxNywgMjI0KTsnLFxuXHRcdFx0J2JhY2tncm91bmQ6IHJnYmEoMCwgMCwgMCwgMCk7Jyxcblx0XHRcdCd0ZXh0LWRlY29yYXRpb246IG5vbmU7Jyxcblx0XHRcdCd3aGl0ZS1zcGFjZTogbm93cmFwOycsXG5cdFx0XHQndHJhbnNpdGlvbjogb3BhY2l0eSAwLjVzIGN1YmljLWJlemllcigwLjE2LCAxLCAwLjMsIDEpLCB0cmFuc2Zvcm0gMC41cyBjdWJpYy1iZXppZXIoMC4xNiwgMSwgMC4zLCAxKTsnLFxuXHRcdFx0J2NvbG9yOiByZ2IoMjU1LCAyNTUsIDI1NSk7Jyxcblx0XHRcdCdkaXNwbGF5OiBpbmxpbmUtZmxleDsnLFxuXHRcdFx0J2ZvbnQtc2l6ZTogMTRweDsnLFxuXHRcdF0pO1xuXHR9KTtcbn0pO1xuXG4vLyBcdTI1MDBcdTI1MDAgSGVscGVyIHRvIGJ1aWxkIENEUC1saWtlIHJ1bGUgbWF0Y2hlcyBcdTI1MDBcdTI1MDBcblxuZnVuY3Rpb24gcnVsZShzZWxlY3Rvcjogc3RyaW5nLCBjc3NUZXh0OiBzdHJpbmcsIG9yaWdpbiA9ICdyZWd1bGFyJyk6IHsgcnVsZTogeyBzZWxlY3Rvckxpc3Q6IHsgc2VsZWN0b3JzOiB7IHRleHQ6IHN0cmluZyB9W10gfTsgb3JpZ2luOiBzdHJpbmc7IHN0eWxlOiB7IGNzc1RleHQ6IHN0cmluZzsgY3NzUHJvcGVydGllczogeyBuYW1lOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfVtdIH0gfSB9IHtcblx0Y29uc3QgcHJvcHMgPSBjc3NUZXh0LnNwbGl0KCc7JykubWFwKGQgPT4gZC50cmltKCkpLmZpbHRlcihCb29sZWFuKS5tYXAoZCA9PiB7XG5cdFx0Y29uc3QgW25hbWUsIC4uLnJlc3RdID0gZC5zcGxpdCgnOicpO1xuXHRcdHJldHVybiB7IG5hbWU6IG5hbWUudHJpbSgpLCB2YWx1ZTogcmVzdC5qb2luKCc6JykudHJpbSgpIH07XG5cdH0pO1xuXHRyZXR1cm4geyBydWxlOiB7IHNlbGVjdG9yTGlzdDogeyBzZWxlY3RvcnM6IFt7IHRleHQ6IHNlbGVjdG9yIH1dIH0sIG9yaWdpbiwgc3R5bGU6IHsgY3NzVGV4dCwgY3NzUHJvcGVydGllczogcHJvcHMgfSB9IH07XG59XG5cbnN1aXRlKCdmb3JtYXRBdXRob3JTdHlsZXMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnaW5jbHVkZXMgZGlyZWN0IGF1dGhvciBydWxlcyBhbmQgc2tpcHMgdXNlci1hZ2VudCcsICgpID0+IHtcblx0XHRjb25zdCBtYXRjaGVkOiBJTWF0Y2hlZFN0eWxlcyA9IHtcblx0XHRcdG1hdGNoZWRDU1NSdWxlczogW1xuXHRcdFx0XHRydWxlKCcuYnRuJywgJ3BhZGRpbmc6IDhweDsgY29sb3I6IHdoaXRlOycpLFxuXHRcdFx0XHRydWxlKCdidXR0b24nLCAnZGlzcGxheTogaW5saW5lLWJsb2NrOycsICd1c2VyLWFnZW50JyksXG5cdFx0XHRdLFxuXHRcdH07XG5cdFx0Y29uc3QgeyBydWxlc1RleHQgfSA9IGZvcm1hdE1hdGNoZWRTdHlsZXMobWF0Y2hlZCk7XG5cdFx0YXNzZXJ0Lm9rKHJ1bGVzVGV4dC5pbmNsdWRlcygnLmJ0bicpKTtcblx0XHRhc3NlcnQub2socnVsZXNUZXh0LmluY2x1ZGVzKCdwYWRkaW5nOiA4cHgnKSk7XG5cdFx0YXNzZXJ0Lm9rKCFydWxlc1RleHQuaW5jbHVkZXMoJ2Rpc3BsYXk6IGlubGluZS1ibG9jaycpKTtcblx0fSk7XG5cblx0dGVzdCgnaW5jbHVkZXMgcHNldWRvLWVsZW1lbnQgc3R5bGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hdGNoZWQ6IElNYXRjaGVkU3R5bGVzID0ge1xuXHRcdFx0bWF0Y2hlZENTU1J1bGVzOiBbcnVsZSgnLmJ0bicsICdjb2xvcjogd2hpdGU7JyldLFxuXHRcdFx0cHNldWRvRWxlbWVudHM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBzZXVkb1R5cGU6ICdiZWZvcmUnLFxuXHRcdFx0XHRcdG1hdGNoZXM6IFtydWxlKCcuYnRuOjpiZWZvcmUnLCAnY29udGVudDogXCJcdTIxOTJcIjsgY29sb3I6IHJlZDsnKV0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwc2V1ZG9UeXBlOiAnYWZ0ZXInLFxuXHRcdFx0XHRcdG1hdGNoZXM6IFtydWxlKCcuYnRuOjphZnRlcicsICdjb250ZW50OiBcIlx1MjcxM1wiOyBjb2xvcjogZ3JlZW47JyldLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHR9O1xuXHRcdGNvbnN0IHsgcnVsZXNUZXh0IH0gPSBmb3JtYXRNYXRjaGVkU3R5bGVzKG1hdGNoZWQpO1xuXHRcdGFzc2VydC5vayhydWxlc1RleHQuaW5jbHVkZXMoJy8qIFBzZXVkby1lbGVtZW50cyAqLycpKTtcblx0XHRhc3NlcnQub2socnVsZXNUZXh0LmluY2x1ZGVzKCcuYnRuOjpiZWZvcmUnKSk7XG5cdFx0YXNzZXJ0Lm9rKHJ1bGVzVGV4dC5pbmNsdWRlcygnLmJ0bjo6YWZ0ZXInKSk7XG5cdFx0YXNzZXJ0Lm9rKHJ1bGVzVGV4dC5pbmNsdWRlcygnY29udGVudDogXCJcdTIxOTJcIicpKTtcblx0fSk7XG5cblx0dGVzdCgnc2tpcHMgdXNlci1hZ2VudCBwc2V1ZG8tZWxlbWVudCBydWxlcycsICgpID0+IHtcblx0XHRjb25zdCBtYXRjaGVkOiBJTWF0Y2hlZFN0eWxlcyA9IHtcblx0XHRcdG1hdGNoZWRDU1NSdWxlczogW3J1bGUoJy54JywgJ2NvbG9yOiByZWQ7JyldLFxuXHRcdFx0cHNldWRvRWxlbWVudHM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBzZXVkb1R5cGU6ICdiZWZvcmUnLFxuXHRcdFx0XHRcdG1hdGNoZXM6IFtydWxlKCdpbnB1dDo6YmVmb3JlJywgJ2NvbnRlbnQ6IFwiXCI7JywgJ3VzZXItYWdlbnQnKV0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdH07XG5cdFx0Y29uc3QgeyBydWxlc1RleHQgfSA9IGZvcm1hdE1hdGNoZWRTdHlsZXMobWF0Y2hlZCk7XG5cdFx0YXNzZXJ0Lm9rKCFydWxlc1RleHQuaW5jbHVkZXMoJ1BzZXVkby1lbGVtZW50cycpKTtcblx0fSk7XG5cblx0dGVzdCgnZmlsdGVycyBpbmhlcml0ZWQgcnVsZXMgdG8gaW5oZXJpdGFibGUgcHJvcGVydGllcyBvbmx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hdGNoZWQ6IElNYXRjaGVkU3R5bGVzID0ge1xuXHRcdFx0bWF0Y2hlZENTU1J1bGVzOiBbcnVsZSgnLmNoaWxkJywgJ2Rpc3BsYXk6IGZsZXg7JyldLFxuXHRcdFx0aW5oZXJpdGVkOiBbe1xuXHRcdFx0XHRtYXRjaGVkQ1NTUnVsZXM6IFtydWxlKCdib2R5JywgJ2ZvbnQtZmFtaWx5OiBzYW5zLXNlcmlmOyBiYWNrZ3JvdW5kOiByZWQ7IG1hcmdpbjogMDsnKV0sXG5cdFx0XHR9XSxcblx0XHR9O1xuXHRcdGNvbnN0IHsgcnVsZXNUZXh0IH0gPSBmb3JtYXRNYXRjaGVkU3R5bGVzKG1hdGNoZWQpO1xuXHRcdGFzc2VydC5vayhydWxlc1RleHQuaW5jbHVkZXMoJ2ZvbnQtZmFtaWx5OiBzYW5zLXNlcmlmJykpO1xuXHRcdGFzc2VydC5vayghcnVsZXNUZXh0LmluY2x1ZGVzKCdiYWNrZ3JvdW5kJykpO1xuXHRcdGFzc2VydC5vayghcnVsZXNUZXh0LmluY2x1ZGVzKCdtYXJnaW4nKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbGxlY3RzIHZhciByZWZlcmVuY2VzIGZyb20gcnVsZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWF0Y2hlZDogSU1hdGNoZWRTdHlsZXMgPSB7XG5cdFx0XHRtYXRjaGVkQ1NTUnVsZXM6IFtydWxlKCcueCcsICdjb2xvcjogdmFyKC0tZmctY29sb3IpOyBib3JkZXI6IHZhcigtLWJvcmRlci13aWR0aCkgc29saWQ7JyldLFxuXHRcdH07XG5cdFx0Y29uc3QgeyByZWZlcmVuY2VkVmFycyB9ID0gZm9ybWF0TWF0Y2hlZFN0eWxlcyhtYXRjaGVkKTtcblx0XHRhc3NlcnQub2socmVmZXJlbmNlZFZhcnMuaGFzKCctLWZnLWNvbG9yJykpO1xuXHRcdGFzc2VydC5vayhyZWZlcmVuY2VkVmFycy5oYXMoJy0tYm9yZGVyLXdpZHRoJykpO1xuXHR9KTtcblxuXHR0ZXN0KCd0cmFja3MgYXV0aG9yIHByb3BlcnR5IG5hbWVzIGZyb20gY3NzUHJvcGVydGllcyBsb25naGFuZHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWF0Y2hlZDogSU1hdGNoZWRTdHlsZXMgPSB7XG5cdFx0XHRtYXRjaGVkQ1NTUnVsZXM6IFt7XG5cdFx0XHRcdHJ1bGU6IHtcblx0XHRcdFx0XHRzZWxlY3Rvckxpc3Q6IHsgc2VsZWN0b3JzOiBbeyB0ZXh0OiAnLngnIH1dIH0sXG5cdFx0XHRcdFx0b3JpZ2luOiAncmVndWxhcicsXG5cdFx0XHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0XHRcdGNzc1RleHQ6ICdib3JkZXI6IDFweCBzb2xpZCByZWQ7Jyxcblx0XHRcdFx0XHRcdGNzc1Byb3BlcnRpZXM6IFtcblx0XHRcdFx0XHRcdFx0eyBuYW1lOiAnYm9yZGVyLXRvcC13aWR0aCcsIHZhbHVlOiAnMXB4JyB9LFxuXHRcdFx0XHRcdFx0XHR7IG5hbWU6ICdib3JkZXItdG9wLXN0eWxlJywgdmFsdWU6ICdzb2xpZCcgfSxcblx0XHRcdFx0XHRcdFx0eyBuYW1lOiAnYm9yZGVyLXRvcC1jb2xvcicsIHZhbHVlOiAncmVkJyB9LFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fV0sXG5cdFx0fTtcblx0XHRjb25zdCB7IGF1dGhvclByb3BlcnR5TmFtZXMgfSA9IGZvcm1hdE1hdGNoZWRTdHlsZXMobWF0Y2hlZCk7XG5cdFx0YXNzZXJ0Lm9rKGF1dGhvclByb3BlcnR5TmFtZXMuaGFzKCdib3JkZXItdG9wLXdpZHRoJykpO1xuXHRcdGFzc2VydC5vayhhdXRob3JQcm9wZXJ0eU5hbWVzLmhhcygnYm9yZGVyLXRvcC1zdHlsZScpKTtcblx0XHQvLyBBbHdheXMtc2hvd24gcHJvcGVydGllc1xuXHRcdGFzc2VydC5vayhhdXRob3JQcm9wZXJ0eU5hbWVzLmhhcygnZGlzcGxheScpKTtcblx0XHRhc3NlcnQub2soYXV0aG9yUHJvcGVydHlOYW1lcy5oYXMoJ3dpZHRoJykpO1xuXHR9KTtcblxuXHR0ZXN0KCd0cmFja3MgdXNlci1hZ2VudCBwcm9wZXJ0eSBuYW1lcyBmcm9tIGRpcmVjdCBydWxlcycsICgpID0+IHtcblx0XHRjb25zdCBtYXRjaGVkOiBJTWF0Y2hlZFN0eWxlcyA9IHtcblx0XHRcdG1hdGNoZWRDU1NSdWxlczogW1xuXHRcdFx0XHRydWxlKCcuYnRuJywgJ2NvbG9yOiB3aGl0ZTsnKSxcblx0XHRcdFx0cnVsZSgnYnV0dG9uJywgJ2Rpc3BsYXk6IGlubGluZS1ibG9jazsgcGFkZGluZzogMnB4OycsICd1c2VyLWFnZW50JyksXG5cdFx0XHRdLFxuXHRcdH07XG5cdFx0Y29uc3QgeyB1c2VyQWdlbnRQcm9wZXJ0eU5hbWVzIH0gPSBmb3JtYXRNYXRjaGVkU3R5bGVzKG1hdGNoZWQpO1xuXHRcdGFzc2VydC5vayh1c2VyQWdlbnRQcm9wZXJ0eU5hbWVzLmhhcygnZGlzcGxheScpKTtcblx0XHRhc3NlcnQub2sodXNlckFnZW50UHJvcGVydHlOYW1lcy5oYXMoJ3BhZGRpbmcnKSk7XG5cdFx0YXNzZXJ0Lm9rKCF1c2VyQWdlbnRQcm9wZXJ0eU5hbWVzLmhhcygnY29sb3InKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyYWNrcyB1c2VyLWFnZW50IHByb3BlcnR5IG5hbWVzIGZyb20gcHNldWRvLWVsZW1lbnQgcnVsZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWF0Y2hlZDogSU1hdGNoZWRTdHlsZXMgPSB7XG5cdFx0XHRtYXRjaGVkQ1NTUnVsZXM6IFtydWxlKCcueCcsICdjb2xvcjogcmVkOycpXSxcblx0XHRcdHBzZXVkb0VsZW1lbnRzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwc2V1ZG9UeXBlOiAnYmVmb3JlJyxcblx0XHRcdFx0XHRtYXRjaGVzOiBbcnVsZSgnaW5wdXQ6OmJlZm9yZScsICdjb250ZW50OiBcIlwiOyBkaXNwbGF5OiBibG9jazsnLCAndXNlci1hZ2VudCcpXSxcblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0fTtcblx0XHRjb25zdCB7IHVzZXJBZ2VudFByb3BlcnR5TmFtZXMgfSA9IGZvcm1hdE1hdGNoZWRTdHlsZXMobWF0Y2hlZCk7XG5cdFx0YXNzZXJ0Lm9rKHVzZXJBZ2VudFByb3BlcnR5TmFtZXMuaGFzKCdjb250ZW50JykpO1xuXHRcdGFzc2VydC5vayh1c2VyQWdlbnRQcm9wZXJ0eU5hbWVzLmhhcygnZGlzcGxheScpKTtcblx0fSk7XG5cblx0dGVzdCgndHJhY2tzIHVzZXItYWdlbnQgcHJvcGVydHkgbmFtZXMgZnJvbSBpbmhlcml0ZWQgcnVsZXMgKGluaGVyaXRhYmxlIG9ubHkpJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hdGNoZWQ6IElNYXRjaGVkU3R5bGVzID0ge1xuXHRcdFx0bWF0Y2hlZENTU1J1bGVzOiBbcnVsZSgnLmNoaWxkJywgJ2Rpc3BsYXk6IGZsZXg7JyldLFxuXHRcdFx0aW5oZXJpdGVkOiBbe1xuXHRcdFx0XHRtYXRjaGVkQ1NTUnVsZXM6IFtydWxlKCdib2R5JywgJ2ZvbnQtZmFtaWx5OiBzYW5zLXNlcmlmOyBtYXJnaW46IDA7JywgJ3VzZXItYWdlbnQnKV0sXG5cdFx0XHR9XSxcblx0XHR9O1xuXHRcdGNvbnN0IHsgdXNlckFnZW50UHJvcGVydHlOYW1lcyB9ID0gZm9ybWF0TWF0Y2hlZFN0eWxlcyhtYXRjaGVkKTtcblx0XHRhc3NlcnQub2sodXNlckFnZW50UHJvcGVydHlOYW1lcy5oYXMoJ2ZvbnQtZmFtaWx5JykpO1xuXHRcdGFzc2VydC5vayghdXNlckFnZW50UHJvcGVydHlOYW1lcy5oYXMoJ21h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
