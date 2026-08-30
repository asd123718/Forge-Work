import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { parseUpdateInfoInput } from "../../common/updateInfoParser.js";
suite("updateInfoParser", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("parseUpdateInfoInput", () => {
    test("plain markdown returns as-is with no buttons", () => {
      assert.deepStrictEqual(parseUpdateInfoInput("Hello **world**"), {
        markdown: "Hello **world**"
      });
    });
    test("strips BOM prefix", () => {
      assert.deepStrictEqual(parseUpdateInfoInput("\uFEFFHello"), {
        markdown: "Hello"
      });
    });
    test("JSON envelope with markdown and buttons", () => {
      const input = JSON.stringify({
        markdown: "$(info) New feature",
        buttons: [
          { label: "Release Notes", commandId: "cmd.releaseNotes", style: "secondary" },
          { label: "Try It", commandId: "cmd.tryIt", style: "primary", args: ["arg1"] }
        ]
      });
      assert.deepStrictEqual(parseUpdateInfoInput(input), {
        markdown: "$(info) New feature",
        buttons: [
          { label: "Release Notes", commandId: "cmd.releaseNotes", style: "secondary", args: void 0 },
          { label: "Try It", commandId: "cmd.tryIt", style: "primary", args: ["arg1"] }
        ]
      });
    });
    test("JSON envelope without buttons", () => {
      const input = JSON.stringify({ markdown: "Just text" });
      assert.deepStrictEqual(parseUpdateInfoInput(input), {
        markdown: "Just text",
        buttons: void 0
      });
    });
    test("JSON envelope with invalid JSON falls back to plain markdown", () => {
      const input = "{ broken json";
      assert.deepStrictEqual(parseUpdateInfoInput(input), {
        markdown: "{ broken json"
      });
    });
    test("JSON envelope without markdown property falls back to plain markdown", () => {
      const input = JSON.stringify({ buttons: [{ label: "X", commandId: "y" }] });
      assert.deepStrictEqual(parseUpdateInfoInput(input), {
        markdown: input
      });
    });
    test("block frontmatter with buttons", () => {
      const buttons = [{ label: "Open", commandId: "cmd.open" }];
      const input = `---
${JSON.stringify({ buttons })}
---
Body text`;
      assert.deepStrictEqual(parseUpdateInfoInput(input), {
        markdown: "Body text",
        buttons: [{ label: "Open", commandId: "cmd.open", style: void 0, args: void 0 }]
      });
    });
    test("block frontmatter with no body", () => {
      const buttons = [{ label: "Open", commandId: "cmd.open" }];
      const input = `---
${JSON.stringify({ buttons })}
---`;
      assert.deepStrictEqual(parseUpdateInfoInput(input), {
        markdown: "",
        buttons: [{ label: "Open", commandId: "cmd.open", style: void 0, args: void 0 }]
      });
    });
    test("inline frontmatter with buttons", () => {
      const buttons = [{ label: "Go", commandId: "cmd.go", style: "primary" }];
      const input = `--- ${JSON.stringify({ buttons })} ---
Markdown here`;
      assert.deepStrictEqual(parseUpdateInfoInput(input), {
        markdown: "\nMarkdown here",
        buttons: [{ label: "Go", commandId: "cmd.go", style: "primary", args: void 0 }]
      });
    });
    test("inline frontmatter handles nested JSON with braces", () => {
      const buttons = [{ label: "Open", commandId: "cmd.open" }, { label: "Try", commandId: "cmd.try" }];
      const input = `--- ${JSON.stringify({ buttons })} ---
Body`;
      assert.deepStrictEqual(parseUpdateInfoInput(input), {
        markdown: "\nBody",
        buttons: [
          { label: "Open", commandId: "cmd.open", style: void 0, args: void 0 },
          { label: "Try", commandId: "cmd.try", style: void 0, args: void 0 }
        ]
      });
    });
    test("frontmatter with invalid JSON falls back to full text", () => {
      const input = "---\nnot json\n---\nBody";
      assert.deepStrictEqual(parseUpdateInfoInput(input), {
        markdown: input
      });
    });
    test("skips buttons with missing required properties", () => {
      const input = JSON.stringify({
        markdown: "text",
        buttons: [
          { label: "Valid", commandId: "cmd.valid" },
          { label: "MissingCmd" },
          { commandId: "cmd.missingLabel" },
          "not an object",
          null
        ]
      });
      assert.deepStrictEqual(parseUpdateInfoInput(input), {
        markdown: "text",
        buttons: [{ label: "Valid", commandId: "cmd.valid", style: void 0, args: void 0 }]
      });
    });
    test("returns undefined buttons when all buttons are invalid", () => {
      const input = JSON.stringify({
        markdown: "text",
        buttons: [{ noLabel: true }]
      });
      assert.deepStrictEqual(parseUpdateInfoInput(input), {
        markdown: "text",
        buttons: void 0
      });
    });
    test("ignores invalid style values", () => {
      const input = JSON.stringify({
        markdown: "text",
        buttons: [{ label: "X", commandId: "cmd", style: "danger" }]
      });
      assert.deepStrictEqual(parseUpdateInfoInput(input), {
        markdown: "text",
        buttons: [{ label: "X", commandId: "cmd", style: void 0, args: void 0 }]
      });
    });
    test("JSON envelope with bannerImageUrl, badge, title, and features", () => {
      const input = JSON.stringify({
        markdown: "Body",
        bannerImageUrl: "https://example.com/banner.png",
        badge: "New",
        title: "What's New",
        features: [
          { icon: "$(sparkle)", title: "Feature A", description: "Does A" },
          { title: "Feature B", description: "Does B" }
        ]
      });
      assert.deepStrictEqual(parseUpdateInfoInput(input), {
        markdown: "Body",
        buttons: void 0,
        bannerImageUrl: "https://example.com/banner.png",
        badge: "New",
        title: "What's New",
        features: [
          { icon: "$(sparkle)", title: "Feature A", description: "Does A" },
          { icon: void 0, title: "Feature B", description: "Does B" }
        ]
      });
    });
    test("block frontmatter with bannerImageUrl, badge, title, and features", () => {
      const meta = {
        bannerImageUrl: "https://example.com/banner.png",
        badge: "Preview",
        title: "Highlights",
        features: [{ title: "Feature", description: "Desc" }]
      };
      const input = `---
${JSON.stringify(meta)}
---
Body text`;
      assert.deepStrictEqual(parseUpdateInfoInput(input), {
        markdown: "Body text",
        buttons: void 0,
        bannerImageUrl: "https://example.com/banner.png",
        badge: "Preview",
        title: "Highlights",
        features: [{ icon: void 0, title: "Feature", description: "Desc" }]
      });
    });
    test("ignores non-string bannerImageUrl, badge, and title", () => {
      const input = JSON.stringify({
        markdown: "text",
        bannerImageUrl: 123,
        badge: { not: "a string" },
        title: ["nope"]
      });
      assert.deepStrictEqual(parseUpdateInfoInput(input), {
        markdown: "text",
        buttons: void 0
      });
    });
    test("caps features at 5 entries and skips invalid ones", () => {
      const input = JSON.stringify({
        markdown: "text",
        features: [
          { title: "F1", description: "D1" },
          { title: "F2" },
          // missing description
          "not an object",
          null,
          { title: "F3", description: "D3", icon: "$(star)" },
          { title: "F4", description: "D4" },
          { title: "F5", description: "D5" },
          { title: "F6", description: "D6" },
          { title: "F7", description: "D7" }
          // dropped (over cap)
        ]
      });
      assert.deepStrictEqual(parseUpdateInfoInput(input), {
        markdown: "text",
        buttons: void 0,
        features: [
          { icon: void 0, title: "F1", description: "D1" },
          { icon: "$(star)", title: "F3", description: "D3" },
          { icon: void 0, title: "F4", description: "D4" },
          { icon: void 0, title: "F5", description: "D5" },
          { icon: void 0, title: "F6", description: "D6" }
        ]
      });
    });
    test("returns undefined features when all features are invalid", () => {
      const input = JSON.stringify({
        markdown: "text",
        features: [{ title: "OnlyTitle" }, "string", null]
      });
      assert.deepStrictEqual(parseUpdateInfoInput(input), {
        markdown: "text",
        buttons: void 0
      });
    });
    test("ignores non-string feature icon", () => {
      const input = JSON.stringify({
        markdown: "text",
        features: [{ icon: 42, title: "F", description: "D" }]
      });
      assert.deepStrictEqual(parseUpdateInfoInput(input), {
        markdown: "text",
        buttons: void 0,
        features: [{ icon: void 0, title: "F", description: "D" }]
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHVwZGF0ZVxcdGVzdFxcY29tbW9uXFx1cGRhdGVJbmZvUGFyc2VyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IHBhcnNlVXBkYXRlSW5mb0lucHV0IH0gZnJvbSAnLi4vLi4vY29tbW9uL3VwZGF0ZUluZm9QYXJzZXIuanMnO1xuXG5zdWl0ZSgndXBkYXRlSW5mb1BhcnNlcicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ3BhcnNlVXBkYXRlSW5mb0lucHV0JywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncGxhaW4gbWFya2Rvd24gcmV0dXJucyBhcy1pcyB3aXRoIG5vIGJ1dHRvbnMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlVXBkYXRlSW5mb0lucHV0KCdIZWxsbyAqKndvcmxkKionKSwge1xuXHRcdFx0XHRtYXJrZG93bjogJ0hlbGxvICoqd29ybGQqKicsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0cmlwcyBCT00gcHJlZml4JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVVwZGF0ZUluZm9JbnB1dCgnXFx1RkVGRkhlbGxvJyksIHtcblx0XHRcdFx0bWFya2Rvd246ICdIZWxsbycsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0pTT04gZW52ZWxvcGUgd2l0aCBtYXJrZG93biBhbmQgYnV0dG9ucycsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRtYXJrZG93bjogJyQoaW5mbykgTmV3IGZlYXR1cmUnLFxuXHRcdFx0XHRidXR0b25zOiBbXG5cdFx0XHRcdFx0eyBsYWJlbDogJ1JlbGVhc2UgTm90ZXMnLCBjb21tYW5kSWQ6ICdjbWQucmVsZWFzZU5vdGVzJywgc3R5bGU6ICdzZWNvbmRhcnknIH0sXG5cdFx0XHRcdFx0eyBsYWJlbDogJ1RyeSBJdCcsIGNvbW1hbmRJZDogJ2NtZC50cnlJdCcsIHN0eWxlOiAncHJpbWFyeScsIGFyZ3M6IFsnYXJnMSddIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVVwZGF0ZUluZm9JbnB1dChpbnB1dCksIHtcblx0XHRcdFx0bWFya2Rvd246ICckKGluZm8pIE5ldyBmZWF0dXJlJyxcblx0XHRcdFx0YnV0dG9uczogW1xuXHRcdFx0XHRcdHsgbGFiZWw6ICdSZWxlYXNlIE5vdGVzJywgY29tbWFuZElkOiAnY21kLnJlbGVhc2VOb3RlcycsIHN0eWxlOiAnc2Vjb25kYXJ5JywgYXJnczogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdFx0eyBsYWJlbDogJ1RyeSBJdCcsIGNvbW1hbmRJZDogJ2NtZC50cnlJdCcsIHN0eWxlOiAncHJpbWFyeScsIGFyZ3M6IFsnYXJnMSddIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0pTT04gZW52ZWxvcGUgd2l0aG91dCBidXR0b25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBKU09OLnN0cmluZ2lmeSh7IG1hcmtkb3duOiAnSnVzdCB0ZXh0JyB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VVcGRhdGVJbmZvSW5wdXQoaW5wdXQpLCB7XG5cdFx0XHRcdG1hcmtkb3duOiAnSnVzdCB0ZXh0Jyxcblx0XHRcdFx0YnV0dG9uczogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdKU09OIGVudmVsb3BlIHdpdGggaW52YWxpZCBKU09OIGZhbGxzIGJhY2sgdG8gcGxhaW4gbWFya2Rvd24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9ICd7IGJyb2tlbiBqc29uJztcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VVcGRhdGVJbmZvSW5wdXQoaW5wdXQpLCB7XG5cdFx0XHRcdG1hcmtkb3duOiAneyBicm9rZW4ganNvbicsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0pTT04gZW52ZWxvcGUgd2l0aG91dCBtYXJrZG93biBwcm9wZXJ0eSBmYWxscyBiYWNrIHRvIHBsYWluIG1hcmtkb3duJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBKU09OLnN0cmluZ2lmeSh7IGJ1dHRvbnM6IFt7IGxhYmVsOiAnWCcsIGNvbW1hbmRJZDogJ3knIH1dIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVVwZGF0ZUluZm9JbnB1dChpbnB1dCksIHtcblx0XHRcdFx0bWFya2Rvd246IGlucHV0LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdibG9jayBmcm9udG1hdHRlciB3aXRoIGJ1dHRvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBidXR0b25zID0gW3sgbGFiZWw6ICdPcGVuJywgY29tbWFuZElkOiAnY21kLm9wZW4nIH1dO1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBgLS0tXFxuJHtKU09OLnN0cmluZ2lmeSh7IGJ1dHRvbnMgfSl9XFxuLS0tXFxuQm9keSB0ZXh0YDtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVVwZGF0ZUluZm9JbnB1dChpbnB1dCksIHtcblx0XHRcdFx0bWFya2Rvd246ICdCb2R5IHRleHQnLFxuXHRcdFx0XHRidXR0b25zOiBbeyBsYWJlbDogJ09wZW4nLCBjb21tYW5kSWQ6ICdjbWQub3BlbicsIHN0eWxlOiB1bmRlZmluZWQsIGFyZ3M6IHVuZGVmaW5lZCB9XSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYmxvY2sgZnJvbnRtYXR0ZXIgd2l0aCBubyBib2R5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYnV0dG9ucyA9IFt7IGxhYmVsOiAnT3BlbicsIGNvbW1hbmRJZDogJ2NtZC5vcGVuJyB9XTtcblx0XHRcdGNvbnN0IGlucHV0ID0gYC0tLVxcbiR7SlNPTi5zdHJpbmdpZnkoeyBidXR0b25zIH0pfVxcbi0tLWA7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VVcGRhdGVJbmZvSW5wdXQoaW5wdXQpLCB7XG5cdFx0XHRcdG1hcmtkb3duOiAnJyxcblx0XHRcdFx0YnV0dG9uczogW3sgbGFiZWw6ICdPcGVuJywgY29tbWFuZElkOiAnY21kLm9wZW4nLCBzdHlsZTogdW5kZWZpbmVkLCBhcmdzOiB1bmRlZmluZWQgfV0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lubGluZSBmcm9udG1hdHRlciB3aXRoIGJ1dHRvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBidXR0b25zID0gW3sgbGFiZWw6ICdHbycsIGNvbW1hbmRJZDogJ2NtZC5nbycsIHN0eWxlOiAncHJpbWFyeScgfV07XG5cdFx0XHRjb25zdCBpbnB1dCA9IGAtLS0gJHtKU09OLnN0cmluZ2lmeSh7IGJ1dHRvbnMgfSl9IC0tLVxcbk1hcmtkb3duIGhlcmVgO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlVXBkYXRlSW5mb0lucHV0KGlucHV0KSwge1xuXHRcdFx0XHRtYXJrZG93bjogJ1xcbk1hcmtkb3duIGhlcmUnLFxuXHRcdFx0XHRidXR0b25zOiBbeyBsYWJlbDogJ0dvJywgY29tbWFuZElkOiAnY21kLmdvJywgc3R5bGU6ICdwcmltYXJ5JywgYXJnczogdW5kZWZpbmVkIH1dLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmxpbmUgZnJvbnRtYXR0ZXIgaGFuZGxlcyBuZXN0ZWQgSlNPTiB3aXRoIGJyYWNlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGJ1dHRvbnMgPSBbeyBsYWJlbDogJ09wZW4nLCBjb21tYW5kSWQ6ICdjbWQub3BlbicgfSwgeyBsYWJlbDogJ1RyeScsIGNvbW1hbmRJZDogJ2NtZC50cnknIH1dO1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBgLS0tICR7SlNPTi5zdHJpbmdpZnkoeyBidXR0b25zIH0pfSAtLS1cXG5Cb2R5YDtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVVwZGF0ZUluZm9JbnB1dChpbnB1dCksIHtcblx0XHRcdFx0bWFya2Rvd246ICdcXG5Cb2R5Jyxcblx0XHRcdFx0YnV0dG9uczogW1xuXHRcdFx0XHRcdHsgbGFiZWw6ICdPcGVuJywgY29tbWFuZElkOiAnY21kLm9wZW4nLCBzdHlsZTogdW5kZWZpbmVkLCBhcmdzOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0XHR7IGxhYmVsOiAnVHJ5JywgY29tbWFuZElkOiAnY21kLnRyeScsIHN0eWxlOiB1bmRlZmluZWQsIGFyZ3M6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmcm9udG1hdHRlciB3aXRoIGludmFsaWQgSlNPTiBmYWxscyBiYWNrIHRvIGZ1bGwgdGV4dCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gJy0tLVxcbm5vdCBqc29uXFxuLS0tXFxuQm9keSc7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlVXBkYXRlSW5mb0lucHV0KGlucHV0KSwge1xuXHRcdFx0XHRtYXJrZG93bjogaW5wdXQsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraXBzIGJ1dHRvbnMgd2l0aCBtaXNzaW5nIHJlcXVpcmVkIHByb3BlcnRpZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0bWFya2Rvd246ICd0ZXh0Jyxcblx0XHRcdFx0YnV0dG9uczogW1xuXHRcdFx0XHRcdHsgbGFiZWw6ICdWYWxpZCcsIGNvbW1hbmRJZDogJ2NtZC52YWxpZCcgfSxcblx0XHRcdFx0XHR7IGxhYmVsOiAnTWlzc2luZ0NtZCcgfSxcblx0XHRcdFx0XHR7IGNvbW1hbmRJZDogJ2NtZC5taXNzaW5nTGFiZWwnIH0sXG5cdFx0XHRcdFx0J25vdCBhbiBvYmplY3QnLFxuXHRcdFx0XHRcdG51bGwsXG5cdFx0XHRcdF0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVVwZGF0ZUluZm9JbnB1dChpbnB1dCksIHtcblx0XHRcdFx0bWFya2Rvd246ICd0ZXh0Jyxcblx0XHRcdFx0YnV0dG9uczogW3sgbGFiZWw6ICdWYWxpZCcsIGNvbW1hbmRJZDogJ2NtZC52YWxpZCcsIHN0eWxlOiB1bmRlZmluZWQsIGFyZ3M6IHVuZGVmaW5lZCB9XSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgYnV0dG9ucyB3aGVuIGFsbCBidXR0b25zIGFyZSBpbnZhbGlkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdG1hcmtkb3duOiAndGV4dCcsXG5cdFx0XHRcdGJ1dHRvbnM6IFt7IG5vTGFiZWw6IHRydWUgfV0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVVwZGF0ZUluZm9JbnB1dChpbnB1dCksIHtcblx0XHRcdFx0bWFya2Rvd246ICd0ZXh0Jyxcblx0XHRcdFx0YnV0dG9uczogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpZ25vcmVzIGludmFsaWQgc3R5bGUgdmFsdWVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdG1hcmtkb3duOiAndGV4dCcsXG5cdFx0XHRcdGJ1dHRvbnM6IFt7IGxhYmVsOiAnWCcsIGNvbW1hbmRJZDogJ2NtZCcsIHN0eWxlOiAnZGFuZ2VyJyB9XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlVXBkYXRlSW5mb0lucHV0KGlucHV0KSwge1xuXHRcdFx0XHRtYXJrZG93bjogJ3RleHQnLFxuXHRcdFx0XHRidXR0b25zOiBbeyBsYWJlbDogJ1gnLCBjb21tYW5kSWQ6ICdjbWQnLCBzdHlsZTogdW5kZWZpbmVkLCBhcmdzOiB1bmRlZmluZWQgfV0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0pTT04gZW52ZWxvcGUgd2l0aCBiYW5uZXJJbWFnZVVybCwgYmFkZ2UsIHRpdGxlLCBhbmQgZmVhdHVyZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0bWFya2Rvd246ICdCb2R5Jyxcblx0XHRcdFx0YmFubmVySW1hZ2VVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL2Jhbm5lci5wbmcnLFxuXHRcdFx0XHRiYWRnZTogJ05ldycsXG5cdFx0XHRcdHRpdGxlOiAnV2hhdFxcJ3MgTmV3Jyxcblx0XHRcdFx0ZmVhdHVyZXM6IFtcblx0XHRcdFx0XHR7IGljb246ICckKHNwYXJrbGUpJywgdGl0bGU6ICdGZWF0dXJlIEEnLCBkZXNjcmlwdGlvbjogJ0RvZXMgQScgfSxcblx0XHRcdFx0XHR7IHRpdGxlOiAnRmVhdHVyZSBCJywgZGVzY3JpcHRpb246ICdEb2VzIEInIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVVwZGF0ZUluZm9JbnB1dChpbnB1dCksIHtcblx0XHRcdFx0bWFya2Rvd246ICdCb2R5Jyxcblx0XHRcdFx0YnV0dG9uczogdW5kZWZpbmVkLFxuXHRcdFx0XHRiYW5uZXJJbWFnZVVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vYmFubmVyLnBuZycsXG5cdFx0XHRcdGJhZGdlOiAnTmV3Jyxcblx0XHRcdFx0dGl0bGU6ICdXaGF0XFwncyBOZXcnLFxuXHRcdFx0XHRmZWF0dXJlczogW1xuXHRcdFx0XHRcdHsgaWNvbjogJyQoc3BhcmtsZSknLCB0aXRsZTogJ0ZlYXR1cmUgQScsIGRlc2NyaXB0aW9uOiAnRG9lcyBBJyB9LFxuXHRcdFx0XHRcdHsgaWNvbjogdW5kZWZpbmVkLCB0aXRsZTogJ0ZlYXR1cmUgQicsIGRlc2NyaXB0aW9uOiAnRG9lcyBCJyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdibG9jayBmcm9udG1hdHRlciB3aXRoIGJhbm5lckltYWdlVXJsLCBiYWRnZSwgdGl0bGUsIGFuZCBmZWF0dXJlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IG1ldGEgPSB7XG5cdFx0XHRcdGJhbm5lckltYWdlVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9iYW5uZXIucG5nJyxcblx0XHRcdFx0YmFkZ2U6ICdQcmV2aWV3Jyxcblx0XHRcdFx0dGl0bGU6ICdIaWdobGlnaHRzJyxcblx0XHRcdFx0ZmVhdHVyZXM6IFt7IHRpdGxlOiAnRmVhdHVyZScsIGRlc2NyaXB0aW9uOiAnRGVzYycgfV0sXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBgLS0tXFxuJHtKU09OLnN0cmluZ2lmeShtZXRhKX1cXG4tLS1cXG5Cb2R5IHRleHRgO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlVXBkYXRlSW5mb0lucHV0KGlucHV0KSwge1xuXHRcdFx0XHRtYXJrZG93bjogJ0JvZHkgdGV4dCcsXG5cdFx0XHRcdGJ1dHRvbnM6IHVuZGVmaW5lZCxcblx0XHRcdFx0YmFubmVySW1hZ2VVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL2Jhbm5lci5wbmcnLFxuXHRcdFx0XHRiYWRnZTogJ1ByZXZpZXcnLFxuXHRcdFx0XHR0aXRsZTogJ0hpZ2hsaWdodHMnLFxuXHRcdFx0XHRmZWF0dXJlczogW3sgaWNvbjogdW5kZWZpbmVkLCB0aXRsZTogJ0ZlYXR1cmUnLCBkZXNjcmlwdGlvbjogJ0Rlc2MnIH1dLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpZ25vcmVzIG5vbi1zdHJpbmcgYmFubmVySW1hZ2VVcmwsIGJhZGdlLCBhbmQgdGl0bGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0bWFya2Rvd246ICd0ZXh0Jyxcblx0XHRcdFx0YmFubmVySW1hZ2VVcmw6IDEyMyxcblx0XHRcdFx0YmFkZ2U6IHsgbm90OiAnYSBzdHJpbmcnIH0sXG5cdFx0XHRcdHRpdGxlOiBbJ25vcGUnXSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlVXBkYXRlSW5mb0lucHV0KGlucHV0KSwge1xuXHRcdFx0XHRtYXJrZG93bjogJ3RleHQnLFxuXHRcdFx0XHRidXR0b25zOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NhcHMgZmVhdHVyZXMgYXQgNSBlbnRyaWVzIGFuZCBza2lwcyBpbnZhbGlkIG9uZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0bWFya2Rvd246ICd0ZXh0Jyxcblx0XHRcdFx0ZmVhdHVyZXM6IFtcblx0XHRcdFx0XHR7IHRpdGxlOiAnRjEnLCBkZXNjcmlwdGlvbjogJ0QxJyB9LFxuXHRcdFx0XHRcdHsgdGl0bGU6ICdGMicgfSwgLy8gbWlzc2luZyBkZXNjcmlwdGlvblxuXHRcdFx0XHRcdCdub3QgYW4gb2JqZWN0Jyxcblx0XHRcdFx0XHRudWxsLFxuXHRcdFx0XHRcdHsgdGl0bGU6ICdGMycsIGRlc2NyaXB0aW9uOiAnRDMnLCBpY29uOiAnJChzdGFyKScgfSxcblx0XHRcdFx0XHR7IHRpdGxlOiAnRjQnLCBkZXNjcmlwdGlvbjogJ0Q0JyB9LFxuXHRcdFx0XHRcdHsgdGl0bGU6ICdGNScsIGRlc2NyaXB0aW9uOiAnRDUnIH0sXG5cdFx0XHRcdFx0eyB0aXRsZTogJ0Y2JywgZGVzY3JpcHRpb246ICdENicgfSxcblx0XHRcdFx0XHR7IHRpdGxlOiAnRjcnLCBkZXNjcmlwdGlvbjogJ0Q3JyB9LCAvLyBkcm9wcGVkIChvdmVyIGNhcClcblx0XHRcdFx0XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlVXBkYXRlSW5mb0lucHV0KGlucHV0KSwge1xuXHRcdFx0XHRtYXJrZG93bjogJ3RleHQnLFxuXHRcdFx0XHRidXR0b25zOiB1bmRlZmluZWQsXG5cdFx0XHRcdGZlYXR1cmVzOiBbXG5cdFx0XHRcdFx0eyBpY29uOiB1bmRlZmluZWQsIHRpdGxlOiAnRjEnLCBkZXNjcmlwdGlvbjogJ0QxJyB9LFxuXHRcdFx0XHRcdHsgaWNvbjogJyQoc3RhciknLCB0aXRsZTogJ0YzJywgZGVzY3JpcHRpb246ICdEMycgfSxcblx0XHRcdFx0XHR7IGljb246IHVuZGVmaW5lZCwgdGl0bGU6ICdGNCcsIGRlc2NyaXB0aW9uOiAnRDQnIH0sXG5cdFx0XHRcdFx0eyBpY29uOiB1bmRlZmluZWQsIHRpdGxlOiAnRjUnLCBkZXNjcmlwdGlvbjogJ0Q1JyB9LFxuXHRcdFx0XHRcdHsgaWNvbjogdW5kZWZpbmVkLCB0aXRsZTogJ0Y2JywgZGVzY3JpcHRpb246ICdENicgfSxcblx0XHRcdFx0XSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZmVhdHVyZXMgd2hlbiBhbGwgZmVhdHVyZXMgYXJlIGludmFsaWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0bWFya2Rvd246ICd0ZXh0Jyxcblx0XHRcdFx0ZmVhdHVyZXM6IFt7IHRpdGxlOiAnT25seVRpdGxlJyB9LCAnc3RyaW5nJywgbnVsbF0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVVwZGF0ZUluZm9JbnB1dChpbnB1dCksIHtcblx0XHRcdFx0bWFya2Rvd246ICd0ZXh0Jyxcblx0XHRcdFx0YnV0dG9uczogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpZ25vcmVzIG5vbi1zdHJpbmcgZmVhdHVyZSBpY29uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdG1hcmtkb3duOiAndGV4dCcsXG5cdFx0XHRcdGZlYXR1cmVzOiBbeyBpY29uOiA0MiwgdGl0bGU6ICdGJywgZGVzY3JpcHRpb246ICdEJyB9XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlVXBkYXRlSW5mb0lucHV0KGlucHV0KSwge1xuXHRcdFx0XHRtYXJrZG93bjogJ3RleHQnLFxuXHRcdFx0XHRidXR0b25zOiB1bmRlZmluZWQsXG5cdFx0XHRcdGZlYXR1cmVzOiBbeyBpY29uOiB1bmRlZmluZWQsIHRpdGxlOiAnRicsIGRlc2NyaXB0aW9uOiAnRCcgfV0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG59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
