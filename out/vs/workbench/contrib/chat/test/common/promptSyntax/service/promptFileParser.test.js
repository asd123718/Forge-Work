import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { Range } from "../../../../../../../editor/common/core/range.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { parseCommaSeparatedList, PromptFileParser } from "../../../../common/promptSyntax/promptFileParser.js";
suite("PromptFileParser", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("agent", async () => {
    const uri = URI.parse("file:///test/test.agent.md");
    const content = [
      /* 01 */
      "---",
      /* 02 */
      `description: "Agent test"`,
      /* 03 */
      "model: GPT 4.1",
      /* 04 */
      `tools: ['tool1', 'tool2']`,
      /* 05 */
      "---",
      /* 06 */
      "This is an agent test.",
      /* 07 */
      "Here is a #tool:tool1 variable (and one with closing parenthesis after: #tool:tool-2) and a #file:./reference1.md as well as a [reference](./reference2.md) and an image ![image](./image.png)."
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.deepEqual(result.uri, uri);
    assert.ok(result.header);
    assert.ok(result.body);
    assert.deepEqual(result.header.range, { startLineNumber: 2, startColumn: 1, endLineNumber: 5, endColumn: 1 });
    assert.deepEqual(result.header.attributes, [
      { key: "description", range: new Range(2, 1, 2, 26), value: { type: "scalar", value: "Agent test", range: new Range(2, 14, 2, 26), format: "double" } },
      { key: "model", range: new Range(3, 1, 3, 15), value: { type: "scalar", value: "GPT 4.1", range: new Range(3, 8, 3, 15), format: "none" } },
      {
        key: "tools",
        range: new Range(4, 1, 4, 26),
        value: {
          type: "sequence",
          items: [{ type: "scalar", value: "tool1", range: new Range(4, 9, 4, 16), format: "single" }, { type: "scalar", value: "tool2", range: new Range(4, 18, 4, 25), format: "single" }],
          range: new Range(4, 8, 4, 26)
        }
      }
    ]);
    assert.deepEqual(result.body.range, { startLineNumber: 6, startColumn: 1, endLineNumber: 8, endColumn: 1 });
    assert.equal(result.body.offset, 75);
    assert.equal(result.body.getContent(), "This is an agent test.\nHere is a #tool:tool1 variable (and one with closing parenthesis after: #tool:tool-2) and a #file:./reference1.md as well as a [reference](./reference2.md) and an image ![image](./image.png).");
    assert.deepEqual(result.body.fileReferences, [
      { range: new Range(7, 99, 7, 114), content: "./reference1.md", isMarkdownLink: false },
      { range: new Range(7, 140, 7, 155), content: "./reference2.md", isMarkdownLink: true }
    ]);
    assert.deepEqual(result.body.variableReferences, [
      { range: new Range(7, 17, 7, 22), name: "tool1", offset: 108, fullLength: 11 },
      { range: new Range(7, 79, 7, 85), name: "tool-2", offset: 170, fullLength: 12 }
    ]);
    const [ref1, ref2] = result.body.variableReferences;
    assert.equal(content.substring(ref1.offset, ref1.offset + ref1.fullLength), "#tool:tool1");
    assert.equal(content.substring(ref2.offset, ref2.offset + ref2.fullLength), "#tool:tool-2");
    assert.deepEqual(result.header.description, "Agent test");
    assert.deepEqual(result.header.model, ["GPT 4.1"]);
    assert.ok(result.header.tools);
    assert.deepEqual(result.header.tools, ["tool1", "tool2"]);
  });
  test("mode with handoff", async () => {
    const uri = URI.parse("file:///test/test.agent.md");
    const content = [
      /* 01 */
      "---",
      /* 02 */
      `description: "Agent test"`,
      /* 03 */
      "model: GPT 4.1",
      /* 04 */
      "handoffs:",
      /* 05 */
      '  - label: "Implement"',
      /* 06 */
      "    agent: Default",
      /* 07 */
      '    prompt: "Implement the plan"',
      /* 08 */
      "    send: false",
      /* 09 */
      '  - label: "Save"',
      /* 10 */
      "    agent: Default",
      /* 11 */
      '    prompt: "Save the plan to a file"',
      /* 12 */
      "    send: true",
      /* 13 */
      "---"
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.deepEqual(result.uri, uri);
    assert.ok(result.header);
    assert.deepEqual(result.header.range, { startLineNumber: 2, startColumn: 1, endLineNumber: 13, endColumn: 1 });
    assert.deepEqual(result.header.attributes, [
      { key: "description", range: new Range(2, 1, 2, 26), value: { type: "scalar", value: "Agent test", range: new Range(2, 14, 2, 26), format: "double" } },
      { key: "model", range: new Range(3, 1, 3, 15), value: { type: "scalar", value: "GPT 4.1", range: new Range(3, 8, 3, 15), format: "none" } },
      {
        key: "handoffs",
        range: new Range(4, 1, 12, 15),
        value: {
          type: "sequence",
          range: new Range(5, 1, 12, 15),
          items: [
            {
              type: "map",
              range: new Range(5, 5, 8, 16),
              properties: [
                { key: { type: "scalar", value: "label", range: new Range(5, 5, 5, 10), format: "none" }, value: { type: "scalar", value: "Implement", range: new Range(5, 12, 5, 23), format: "double" } },
                { key: { type: "scalar", value: "agent", range: new Range(6, 5, 6, 10), format: "none" }, value: { type: "scalar", value: "Default", range: new Range(6, 12, 6, 19), format: "none" } },
                { key: { type: "scalar", value: "prompt", range: new Range(7, 5, 7, 11), format: "none" }, value: { type: "scalar", value: "Implement the plan", range: new Range(7, 13, 7, 33), format: "double" } },
                { key: { type: "scalar", value: "send", range: new Range(8, 5, 8, 9), format: "none" }, value: { type: "scalar", value: "false", range: new Range(8, 11, 8, 16), format: "none" } }
              ]
            },
            {
              type: "map",
              range: new Range(9, 5, 12, 15),
              properties: [
                { key: { type: "scalar", value: "label", range: new Range(9, 5, 9, 10), format: "none" }, value: { type: "scalar", value: "Save", range: new Range(9, 12, 9, 18), format: "double" } },
                { key: { type: "scalar", value: "agent", range: new Range(10, 5, 10, 10), format: "none" }, value: { type: "scalar", value: "Default", range: new Range(10, 12, 10, 19), format: "none" } },
                { key: { type: "scalar", value: "prompt", range: new Range(11, 5, 11, 11), format: "none" }, value: { type: "scalar", value: "Save the plan to a file", range: new Range(11, 13, 11, 38), format: "double" } },
                { key: { type: "scalar", value: "send", range: new Range(12, 5, 12, 9), format: "none" }, value: { type: "scalar", value: "true", range: new Range(12, 11, 12, 15), format: "none" } }
              ]
            }
          ]
        }
      }
    ]);
    assert.deepEqual(result.header.description, "Agent test");
    assert.deepEqual(result.header.model, ["GPT 4.1"]);
    assert.ok(result.header.handOffs);
    assert.deepEqual(result.header.handOffs, [
      { label: "Implement", agent: "Default", prompt: "Implement the plan", send: false },
      { label: "Save", agent: "Default", prompt: "Save the plan to a file", send: true }
    ]);
  });
  test("mode with handoff and showContinueOn per handoff", async () => {
    const uri = URI.parse("file:///test/test.agent.md");
    const content = [
      /* 01 */
      "---",
      /* 02 */
      `description: "Agent test"`,
      /* 03 */
      "model: GPT 4.1",
      /* 04 */
      "handoffs:",
      /* 05 */
      '  - label: "Implement"',
      /* 06 */
      "    agent: Default",
      /* 07 */
      '    prompt: "Implement the plan"',
      /* 08 */
      "    send: false",
      /* 09 */
      "    showContinueOn: false",
      /* 10 */
      '  - label: "Save"',
      /* 11 */
      "    agent: Default",
      /* 12 */
      '    prompt: "Save the plan"',
      /* 13 */
      "    send: true",
      /* 14 */
      "    showContinueOn: true",
      /* 15 */
      "---"
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.deepEqual(result.uri, uri);
    assert.ok(result.header);
    assert.ok(result.header.handOffs);
    assert.deepEqual(result.header.handOffs, [
      { label: "Implement", agent: "Default", prompt: "Implement the plan", send: false, showContinueOn: false },
      { label: "Save", agent: "Default", prompt: "Save the plan", send: true, showContinueOn: true }
    ]);
  });
  test("showContinueOn defaults to undefined when not specified per handoff", async () => {
    const uri = URI.parse("file:///test/test.agent.md");
    const content = [
      /* 01 */
      "---",
      /* 02 */
      `description: "Agent test"`,
      /* 03 */
      "handoffs:",
      /* 04 */
      '  - label: "Save"',
      /* 05 */
      "    agent: Default",
      /* 06 */
      '    prompt: "Save the plan"',
      /* 07 */
      "---"
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.deepEqual(result.uri, uri);
    assert.ok(result.header);
    assert.ok(result.header.handOffs);
    assert.deepEqual(result.header.handOffs[0].showContinueOn, void 0);
  });
  test("handoff with whitespace-only label is skipped", async () => {
    const uri = URI.parse("file:///test/test.agent.md");
    const content = [
      /* 01 */
      "---",
      /* 02 */
      `description: "Agent test"`,
      /* 03 */
      "handoffs:",
      /* 04 */
      '  - label: "   "',
      /* 05 */
      "    agent: Default",
      /* 06 */
      '    prompt: "Do something"',
      /* 07 */
      '  - label: "Valid"',
      /* 08 */
      "    agent: Default",
      /* 09 */
      '    prompt: "Also do something"',
      /* 10 */
      "---"
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.ok(result.header);
    assert.deepStrictEqual(result.header.handOffs, [
      { agent: "Default", label: "Valid", prompt: "Also do something" }
    ]);
  });
  test("instructions", async () => {
    const uri = URI.parse("file:///test/prompt1.md");
    const content = [
      /* 01 */
      "---",
      /* 02 */
      `description: "Code style instructions for TypeScript"`,
      /* 03 */
      "applyTo: *.ts",
      /* 04 */
      "---",
      /* 05 */
      "Follow my companies coding guidlines at [mycomp-ts-guidelines](https://mycomp/guidelines#typescript.md)"
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.deepEqual(result.uri, uri);
    assert.ok(result.header);
    assert.ok(result.body);
    assert.deepEqual(result.header.range, { startLineNumber: 2, startColumn: 1, endLineNumber: 4, endColumn: 1 });
    assert.deepEqual(result.header.attributes, [
      { key: "description", range: new Range(2, 1, 2, 54), value: { type: "scalar", value: "Code style instructions for TypeScript", range: new Range(2, 14, 2, 54), format: "double" } },
      { key: "applyTo", range: new Range(3, 1, 3, 14), value: { type: "scalar", value: "*.ts", range: new Range(3, 10, 3, 14), format: "none" } }
    ]);
    assert.deepEqual(result.body.range, { startLineNumber: 5, startColumn: 1, endLineNumber: 6, endColumn: 1 });
    assert.equal(result.body.offset, 76);
    assert.equal(result.body.getContent(), "Follow my companies coding guidlines at [mycomp-ts-guidelines](https://mycomp/guidelines#typescript.md)");
    assert.deepEqual(result.body.fileReferences, [
      { range: new Range(5, 64, 5, 103), content: "https://mycomp/guidelines#typescript.md", isMarkdownLink: true }
    ]);
    assert.deepEqual(result.body.variableReferences, []);
    assert.deepEqual(result.header.description, "Code style instructions for TypeScript");
    assert.deepEqual(result.header.applyTo, "*.ts");
  });
  test("prompt file", async () => {
    const uri = URI.parse("file:///test/prompt2.md");
    const content = [
      /* 01 */
      "---",
      /* 02 */
      `description: "General purpose coding assistant"`,
      /* 03 */
      "agent: agent",
      /* 04 */
      "model: GPT 4.1",
      /* 05 */
      `tools: ['search', 'terminal']`,
      /* 06 */
      "---",
      /* 07 */
      "This is a prompt file body referencing #tool:search and [docs](https://example.com/docs)."
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.deepEqual(result.uri, uri);
    assert.ok(result.header);
    assert.ok(result.body);
    assert.deepEqual(result.header.range, { startLineNumber: 2, startColumn: 1, endLineNumber: 6, endColumn: 1 });
    assert.deepEqual(result.header.attributes, [
      { key: "description", range: new Range(2, 1, 2, 48), value: { type: "scalar", value: "General purpose coding assistant", range: new Range(2, 14, 2, 48), format: "double" } },
      { key: "agent", range: new Range(3, 1, 3, 13), value: { type: "scalar", value: "agent", range: new Range(3, 8, 3, 13), format: "none" } },
      { key: "model", range: new Range(4, 1, 4, 15), value: { type: "scalar", value: "GPT 4.1", range: new Range(4, 8, 4, 15), format: "none" } },
      {
        key: "tools",
        range: new Range(5, 1, 5, 30),
        value: {
          type: "sequence",
          items: [{ type: "scalar", value: "search", range: new Range(5, 9, 5, 17), format: "single" }, { type: "scalar", value: "terminal", range: new Range(5, 19, 5, 29), format: "single" }],
          range: new Range(5, 8, 5, 30)
        }
      }
    ]);
    assert.deepEqual(result.body.range, { startLineNumber: 7, startColumn: 1, endLineNumber: 8, endColumn: 1 });
    assert.equal(result.body.offset, 114);
    assert.equal(result.body.getContent(), "This is a prompt file body referencing #tool:search and [docs](https://example.com/docs).");
    assert.deepEqual(result.body.fileReferences, [
      { range: new Range(7, 64, 7, 88), content: "https://example.com/docs", isMarkdownLink: true }
    ]);
    assert.deepEqual(result.body.variableReferences, [
      { range: new Range(7, 46, 7, 52), name: "search", offset: 153, fullLength: 12 }
    ]);
    assert.deepEqual(result.header.description, "General purpose coding assistant");
    assert.deepEqual(result.header.agent, "agent");
    assert.deepEqual(result.header.model, ["GPT 4.1"]);
    assert.ok(result.header.tools);
    assert.deepEqual(result.header.tools, ["search", "terminal"]);
  });
  test("ignores links and variables inside inline code and fenced code blocks", async () => {
    const uri = URI.parse("file:///test/prompt3.md");
    const content = [
      "---",
      `description: "Prompt with markdown code"`,
      "---",
      "Outside #tool:outside and [outside](./outside.md).",
      "Inline code: `#tool:inline and [inline](./inline.md)` should be ignored.",
      "```ts",
      "#tool:block and #file:./inside-block.md and [block](./block.md)",
      "```",
      "After block #file:./after.md and [after](./after-link.md)."
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.ok(result.body);
    assert.deepEqual(result.body.fileReferences.map((reference) => ({ content: reference.content, isMarkdownLink: reference.isMarkdownLink })), [
      { content: "./outside.md", isMarkdownLink: true },
      { content: "./after.md", isMarkdownLink: false },
      { content: "./after-link.md", isMarkdownLink: true }
    ]);
    assert.deepEqual(result.body.variableReferences.map((reference) => reference.name), ["outside"]);
  });
  test("ignores references in multiple inline code spans on the same line", async () => {
    const uri = URI.parse("file:///test/prompt-inline.md");
    const content = [
      "---",
      'description: "test"',
      "---",
      "Before `#tool:ignored1` middle #tool:visible `[link](./ignored.md)` after [real](./real.md)."
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.ok(result.body);
    assert.deepEqual(result.body.fileReferences.map((r) => ({ content: r.content, isMarkdownLink: r.isMarkdownLink })), [
      { content: "./real.md", isMarkdownLink: true }
    ]);
    assert.deepEqual(result.body.variableReferences.map((r) => r.name), ["visible"]);
  });
  test("handles fenced code block without language specifier", async () => {
    const uri = URI.parse("file:///test/prompt-fence.md");
    const content = [
      "---",
      'description: "test"',
      "---",
      "```",
      "#file:./ignored.md",
      "[link](./ignored-link.md)",
      "```",
      "#file:./visible.md"
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.ok(result.body);
    assert.deepEqual(result.body.fileReferences.map((r) => ({ content: r.content, isMarkdownLink: r.isMarkdownLink })), [
      { content: "./visible.md", isMarkdownLink: false }
    ]);
    assert.deepEqual(result.body.variableReferences, []);
  });
  test("handles multiple fenced code blocks", async () => {
    const uri = URI.parse("file:///test/prompt-multi-fence.md");
    const content = [
      "---",
      'description: "test"',
      "---",
      "#tool:before",
      "```js",
      "#tool:ignored1",
      "```",
      "#tool:between",
      "```python",
      "#tool:ignored2",
      "```",
      "#tool:after"
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.ok(result.body);
    assert.deepEqual(result.body.variableReferences.map((r) => r.name), ["before", "between", "after"]);
  });
  test("unclosed fenced code block ignores all remaining lines", async () => {
    const uri = URI.parse("file:///test/prompt-unclosed.md");
    const content = [
      "---",
      'description: "test"',
      "---",
      "#tool:visible",
      "```",
      "#tool:ignored",
      "#file:./ignored.md"
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.ok(result.body);
    assert.deepEqual(result.body.variableReferences.map((r) => r.name), ["visible"]);
    assert.deepEqual(result.body.fileReferences, []);
  });
  test("adjacent inline code does not suppress outside references", async () => {
    const uri = URI.parse("file:///test/prompt-adjacent.md");
    const content = [
      "---",
      'description: "test"',
      "---",
      "`code`#tool:attached `more`[link](./file.md)"
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.ok(result.body);
    assert.deepEqual(result.body.variableReferences.map((r) => r.name), ["attached"]);
    assert.deepEqual(result.body.fileReferences.map((r) => ({ content: r.content, isMarkdownLink: r.isMarkdownLink })), [
      { content: "./file.md", isMarkdownLink: true }
    ]);
  });
  test("indented fenced code block is still detected", async () => {
    const uri = URI.parse("file:///test/prompt-indent.md");
    const content = [
      "---",
      'description: "test"',
      "---",
      "  ```ts",
      "  #tool:ignored",
      "  ```",
      "#tool:visible"
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.ok(result.body);
    assert.deepEqual(result.body.variableReferences.map((r) => r.name), ["visible"]);
  });
  test("fenced code block with 4 backticks", async () => {
    const uri = URI.parse("file:///test/prompt-4tick.md");
    const content = [
      "---",
      'description: "test"',
      "---",
      "````",
      "#tool:ignored and [link](./ignored.md)",
      "````",
      "#tool:visible"
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.ok(result.body);
    assert.deepEqual(result.body.variableReferences.map((r) => r.name), ["visible"]);
    assert.deepEqual(result.body.fileReferences, []);
  });
  test("fenced code block with tilde fence (~~~)", async () => {
    const uri = URI.parse("file:///test/prompt-tilde.md");
    const content = [
      "---",
      'description: "test"',
      "---",
      "~~~",
      "#file:./ignored.md and [link](./ignored-link.md)",
      "#tool:ignored",
      "~~~",
      "[real](./real.md)"
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.ok(result.body);
    assert.deepEqual(result.body.fileReferences.map((r) => ({ content: r.content, isMarkdownLink: r.isMarkdownLink })), [
      { content: "./real.md", isMarkdownLink: true }
    ]);
    assert.deepEqual(result.body.variableReferences, []);
  });
  test("agent with agents", async () => {
    const uri = URI.parse("file:///test/test.agent.md");
    const content = [
      "---",
      `description: "Agent with restrictions"`,
      'agents: ["subagent1", "subagent2"]',
      "---",
      "This is an agent with restricted subagents."
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.deepEqual(result.uri, uri);
    assert.ok(result.header);
    assert.ok(result.body);
    assert.deepEqual(result.header.description, "Agent with restrictions");
    assert.deepEqual(result.header.agents, ["subagent1", "subagent2"]);
  });
  test("agent with empty agents array", async () => {
    const uri = URI.parse("file:///test/test.agent.md");
    const content = [
      "---",
      `description: "Agent with no access"`,
      "agents: []",
      "---",
      "This agent has no access to subagents."
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.deepEqual(result.uri, uri);
    assert.ok(result.header);
    assert.deepEqual(result.header.description, "Agent with no access");
    assert.deepEqual(result.header.agents, []);
  });
  test("agent with wildcard agents", async () => {
    const uri = URI.parse("file:///test/test.agent.md");
    const content = [
      "---",
      `description: "Agent with full access"`,
      'agents: ["*"]',
      "---",
      "This agent has access to all subagents."
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.deepEqual(result.uri, uri);
    assert.ok(result.header);
    assert.deepEqual(result.header.description, "Agent with full access");
    assert.deepEqual(result.header.agents, ["*"]);
  });
  test("agent without agents (undefined)", async () => {
    const uri = URI.parse("file:///test/test.agent.md");
    const content = [
      "---",
      `description: "Agent without restrictions"`,
      "---",
      "This agent has default access to all."
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.deepEqual(result.uri, uri);
    assert.ok(result.header);
    assert.deepEqual(result.header.description, "Agent without restrictions");
    assert.deepEqual(result.header.agents, void 0);
  });
  suite("parseCommaSeparatedList", () => {
    function assertCommaSeparatedList(input, expected) {
      const actual = parseCommaSeparatedList({ type: "scalar", value: input, range: new Range(1, 1, 1, input.length + 1), format: "none" });
      assert.deepStrictEqual(actual.items, expected);
    }
    test("simple unquoted values", () => {
      assertCommaSeparatedList("a, b, c", [
        { type: "scalar", value: "a", range: new Range(1, 1, 1, 2), format: "none" },
        { type: "scalar", value: "b", range: new Range(1, 4, 1, 5), format: "none" },
        { type: "scalar", value: "c", range: new Range(1, 7, 1, 8), format: "none" }
      ]);
    });
    test("unquoted values without spaces", () => {
      assertCommaSeparatedList("foo,bar,baz", [
        { type: "scalar", value: "foo", range: new Range(1, 1, 1, 4), format: "none" },
        { type: "scalar", value: "bar", range: new Range(1, 5, 1, 8), format: "none" },
        { type: "scalar", value: "baz", range: new Range(1, 9, 1, 12), format: "none" }
      ]);
    });
    test("double quoted values", () => {
      assertCommaSeparatedList('"hello", "world"', [
        { type: "scalar", value: "hello", range: new Range(1, 1, 1, 8), format: "double" },
        { type: "scalar", value: "world", range: new Range(1, 10, 1, 17), format: "double" }
      ]);
    });
    test("single quoted values", () => {
      assertCommaSeparatedList(`'one', 'two'`, [
        { type: "scalar", value: "one", range: new Range(1, 1, 1, 6), format: "single" },
        { type: "scalar", value: "two", range: new Range(1, 8, 1, 13), format: "single" }
      ]);
    });
    test("mixed quoted and unquoted values", () => {
      assertCommaSeparatedList(`unquoted, "double", 'single'`, [
        { type: "scalar", value: "unquoted", range: new Range(1, 1, 1, 9), format: "none" },
        { type: "scalar", value: "double", range: new Range(1, 11, 1, 19), format: "double" },
        { type: "scalar", value: "single", range: new Range(1, 21, 1, 29), format: "single" }
      ]);
    });
    test("quoted values with commas inside", () => {
      assertCommaSeparatedList('"a,b", "c,d"', [
        { type: "scalar", value: "a,b", range: new Range(1, 1, 1, 6), format: "double" },
        { type: "scalar", value: "c,d", range: new Range(1, 8, 1, 13), format: "double" }
      ]);
    });
    test("empty string", () => {
      assertCommaSeparatedList("", []);
    });
    test("single value", () => {
      assertCommaSeparatedList("single", [
        { type: "scalar", value: "single", range: new Range(1, 1, 1, 7), format: "none" }
      ]);
    });
    test("values with extra whitespace", () => {
      assertCommaSeparatedList("  a  ,  b  ,  c  ", [
        { type: "scalar", value: "a", range: new Range(1, 3, 1, 4), format: "none" },
        { type: "scalar", value: "b", range: new Range(1, 9, 1, 10), format: "none" },
        { type: "scalar", value: "c", range: new Range(1, 15, 1, 16), format: "none" }
      ]);
    });
    test("quoted value with spaces", () => {
      assertCommaSeparatedList('"hello world", "foo bar"', [
        { type: "scalar", value: "hello world", range: new Range(1, 1, 1, 14), format: "double" },
        { type: "scalar", value: "foo bar", range: new Range(1, 16, 1, 25), format: "double" }
      ]);
    });
    test("with position offset", () => {
      const result = parseCommaSeparatedList({ type: "scalar", value: "a, b, c", range: new Range(6, 11, 6, 18), format: "none" });
      assert.deepStrictEqual(result.items, [
        { type: "scalar", value: "a", range: new Range(6, 11, 6, 12), format: "none" },
        { type: "scalar", value: "b", range: new Range(6, 14, 6, 15), format: "none" },
        { type: "scalar", value: "c", range: new Range(6, 17, 6, 18), format: "none" }
      ]);
    });
    test("entire input wrapped in double quotes", () => {
      assertCommaSeparatedList('"a, b, c"', [
        { type: "scalar", value: "a, b, c", range: new Range(1, 1, 1, 10), format: "double" }
      ]);
    });
    test("entire input wrapped in single quotes", () => {
      assertCommaSeparatedList(`'a, b, c'`, [
        { type: "scalar", value: "a, b, c", range: new Range(1, 1, 1, 10), format: "single" }
      ]);
    });
  });
  test("userInvocable getter reads user-invocable attribute", async () => {
    const uri = URI.parse("file:///test/test.agent.md");
    const content1 = [
      "---",
      'description: "Test"',
      "user-invocable: true",
      "---"
    ].join("\n");
    const result1 = new PromptFileParser().parse(uri, content1);
    assert.strictEqual(result1.header?.userInvocable, true);
    const content2 = [
      "---",
      'description: "Test"',
      "user-invocable: false",
      "---"
    ].join("\n");
    const result2 = new PromptFileParser().parse(uri, content2);
    assert.strictEqual(result2.header?.userInvocable, false);
    const content4 = [
      "---",
      'description: "Test"',
      "---"
    ].join("\n");
    const result4 = new PromptFileParser().parse(uri, content4);
    assert.strictEqual(result4.header?.userInvocable, void 0);
  });
  test("agent with all header fields including colons in description", async () => {
    const uri = URI.parse("file:///test/test.agent.md");
    const content = [
      "---",
      "name: Explore",
      "description: Fast read-only codebase exploration and Q&A subagent. Prefer over manually chaining multiple search and file-reading operations to avoid cluttering the main conversation. Safe to call in parallel. Specify thoroughness: quick, medium, or thorough.",
      `argument-hint: Describe WHAT you're looking for and desired thoroughness (quick/medium/thorough)`,
      `model: ['Claude Haiku 4.5 (copilot)', 'Gemini 3 Flash (Preview) (copilot)', 'Auto (copilot)']`,
      "target: vscode",
      "user-invocable: false",
      `tools: ['search', 'read', 'web', 'vscode/memory', 'github/issue_read', 'github.vscode-pull-request-github/issue_fetch', 'github.vscode-pull-request-github/activePullRequest', 'execute/getTerminalOutput', 'execute/testFailure']`,
      "agents: []",
      "---",
      "You are an exploration agent specialized in rapid codebase analysis and answering questions efficiently.",
      "",
      "## Search Strategy",
      "",
      "- Go **broad to narrow**:",
      "	1. Start with glob patterns or semantic codesearch to discover relevant areas",
      "	2. Narrow with text search (regex) or usages (LSP) for specific symbols or patterns",
      "	3. Read files only when you know the path or need full context",
      "- Pay attention to provided agent instructions/rules/skills as they apply to areas of the codebase to better understand architecture and best practices.",
      "- Use the github repo tool to search references in external dependencies.",
      "",
      "## Speed Principles",
      "",
      "Adapt search strategy based on the requested thoroughness level.",
      "",
      "**Bias for speed** \u2014 return findings as quickly as possible:",
      "- Parallelize independent tool calls (multiple greps, multiple reads)",
      "- Stop searching once you have sufficient context",
      "- Make targeted searches, not exhaustive sweeps",
      "",
      "## Output",
      "",
      "Report findings directly as a message. Include:",
      "- Files with absolute links",
      "- Specific functions, types, or patterns that can be reused",
      "- Analogous existing features that serve as implementation templates",
      "- Clear answers to what was asked, not comprehensive overviews",
      "",
      "Remember: Your goal is searching efficiently through MAXIMUM PARALLELISM to report concise and clear answers."
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.deepEqual(result.uri, uri);
    assert.ok(result.header);
    assert.ok(result.body);
    assert.deepEqual(result.header.name, "Explore");
    assert.deepEqual(result.header.description, "Fast read-only codebase exploration and Q&A subagent. Prefer over manually chaining multiple search and file-reading operations to avoid cluttering the main conversation. Safe to call in parallel. Specify thoroughness: quick, medium, or thorough.");
    assert.deepEqual(result.header.argumentHint, `Describe WHAT you're looking for and desired thoroughness (quick/medium/thorough)`);
    assert.deepEqual(result.header.model, ["Claude Haiku 4.5 (copilot)", "Gemini 3 Flash (Preview) (copilot)", "Auto (copilot)"]);
    assert.deepEqual(result.header.target, "vscode");
    assert.deepEqual(result.header.userInvocable, false);
    assert.deepEqual(result.header.tools, ["search", "read", "web", "vscode/memory", "github/issue_read", "github.vscode-pull-request-github/issue_fetch", "github.vscode-pull-request-github/activePullRequest", "execute/getTerminalOutput", "execute/testFailure"]);
    assert.deepEqual(result.header.agents, []);
    assert.deepEqual(result.header.attributes.length, 8);
    assert.deepEqual(result.header.attributes.map((a) => a.key), [
      "name",
      "description",
      "argument-hint",
      "model",
      "target",
      "user-invocable",
      "tools",
      "agents"
    ]);
  });
  test("agent with unquoted description containing colon-space", async () => {
    const uri = URI.parse("file:///test/test.agent.md");
    const content = [
      "---",
      "name: Test",
      "description: This has a colon: in the middle",
      "target: vscode",
      "---"
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.ok(result.header);
    assert.deepEqual(result.header.name, "Test");
    assert.deepEqual(result.header.description, "This has a colon: in the middle");
    assert.deepEqual(result.header.target, "vscode");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxccHJvbXB0U3ludGF4XFxzZXJ2aWNlXFxwcm9tcHRGaWxlUGFyc2VyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5cbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElTY2FsYXJWYWx1ZSwgcGFyc2VDb21tYVNlcGFyYXRlZExpc3QsIFByb21wdEZpbGVQYXJzZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdEZpbGVQYXJzZXIuanMnO1xuXG5zdWl0ZSgnUHJvbXB0RmlsZVBhcnNlcicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnYWdlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvdGVzdC5hZ2VudC5tZCcpO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQvKiAwMSAqLyctLS0nLFxuXHRcdFx0LyogMDIgKi9gZGVzY3JpcHRpb246IFwiQWdlbnQgdGVzdFwiYCxcblx0XHRcdC8qIDAzICovJ21vZGVsOiBHUFQgNC4xJyxcblx0XHRcdC8qIDA0ICovYHRvb2xzOiBbJ3Rvb2wxJywgJ3Rvb2wyJ11gLFxuXHRcdFx0LyogMDUgKi8nLS0tJyxcblx0XHRcdC8qIDA2ICovJ1RoaXMgaXMgYW4gYWdlbnQgdGVzdC4nLFxuXHRcdFx0LyogMDcgKi8nSGVyZSBpcyBhICN0b29sOnRvb2wxIHZhcmlhYmxlIChhbmQgb25lIHdpdGggY2xvc2luZyBwYXJlbnRoZXNpcyBhZnRlcjogI3Rvb2w6dG9vbC0yKSBhbmQgYSAjZmlsZTouL3JlZmVyZW5jZTEubWQgYXMgd2VsbCBhcyBhIFtyZWZlcmVuY2VdKC4vcmVmZXJlbmNlMi5tZCkgYW5kIGFuIGltYWdlICFbaW1hZ2VdKC4vaW1hZ2UucG5nKS4nLFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IFByb21wdEZpbGVQYXJzZXIoKS5wYXJzZSh1cmksIGNvbnRlbnQpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LnVyaSwgdXJpKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmhlYWRlcik7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5ib2R5KTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5oZWFkZXIucmFuZ2UsIHsgc3RhcnRMaW5lTnVtYmVyOiAyLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogNSwgZW5kQ29sdW1uOiAxIH0pO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmhlYWRlci5hdHRyaWJ1dGVzLCBbXG5cdFx0XHR7IGtleTogJ2Rlc2NyaXB0aW9uJywgcmFuZ2U6IG5ldyBSYW5nZSgyLCAxLCAyLCAyNiksIHZhbHVlOiB7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ0FnZW50IHRlc3QnLCByYW5nZTogbmV3IFJhbmdlKDIsIDE0LCAyLCAyNiksIGZvcm1hdDogJ2RvdWJsZScgfSB9LFxuXHRcdFx0eyBrZXk6ICdtb2RlbCcsIHJhbmdlOiBuZXcgUmFuZ2UoMywgMSwgMywgMTUpLCB2YWx1ZTogeyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICdHUFQgNC4xJywgcmFuZ2U6IG5ldyBSYW5nZSgzLCA4LCAzLCAxNSksIGZvcm1hdDogJ25vbmUnIH0gfSxcblx0XHRcdHtcblx0XHRcdFx0a2V5OiAndG9vbHMnLCByYW5nZTogbmV3IFJhbmdlKDQsIDEsIDQsIDI2KSwgdmFsdWU6IHtcblx0XHRcdFx0XHR0eXBlOiAnc2VxdWVuY2UnLFxuXHRcdFx0XHRcdGl0ZW1zOiBbeyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICd0b29sMScsIHJhbmdlOiBuZXcgUmFuZ2UoNCwgOSwgNCwgMTYpLCBmb3JtYXQ6ICdzaW5nbGUnIH0sIHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAndG9vbDInLCByYW5nZTogbmV3IFJhbmdlKDQsIDE4LCA0LCAyNSksIGZvcm1hdDogJ3NpbmdsZScgfV0sXG5cdFx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSg0LCA4LCA0LCAyNilcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5ib2R5LnJhbmdlLCB7IHN0YXJ0TGluZU51bWJlcjogNiwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDgsIGVuZENvbHVtbjogMSB9KTtcblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0LmJvZHkub2Zmc2V0LCA3NSk7XG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdC5ib2R5LmdldENvbnRlbnQoKSwgJ1RoaXMgaXMgYW4gYWdlbnQgdGVzdC5cXG5IZXJlIGlzIGEgI3Rvb2w6dG9vbDEgdmFyaWFibGUgKGFuZCBvbmUgd2l0aCBjbG9zaW5nIHBhcmVudGhlc2lzIGFmdGVyOiAjdG9vbDp0b29sLTIpIGFuZCBhICNmaWxlOi4vcmVmZXJlbmNlMS5tZCBhcyB3ZWxsIGFzIGEgW3JlZmVyZW5jZV0oLi9yZWZlcmVuY2UyLm1kKSBhbmQgYW4gaW1hZ2UgIVtpbWFnZV0oLi9pbWFnZS5wbmcpLicpO1xuXG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuYm9keS5maWxlUmVmZXJlbmNlcywgW1xuXHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDcsIDk5LCA3LCAxMTQpLCBjb250ZW50OiAnLi9yZWZlcmVuY2UxLm1kJywgaXNNYXJrZG93bkxpbms6IGZhbHNlIH0sXG5cdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoNywgMTQwLCA3LCAxNTUpLCBjb250ZW50OiAnLi9yZWZlcmVuY2UyLm1kJywgaXNNYXJrZG93bkxpbms6IHRydWUgfVxuXHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmJvZHkudmFyaWFibGVSZWZlcmVuY2VzLCBbXG5cdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoNywgMTcsIDcsIDIyKSwgbmFtZTogJ3Rvb2wxJywgb2Zmc2V0OiAxMDgsIGZ1bGxMZW5ndGg6IDExIH0sXG5cdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoNywgNzksIDcsIDg1KSwgbmFtZTogJ3Rvb2wtMicsIG9mZnNldDogMTcwLCBmdWxsTGVuZ3RoOiAxMiB9XG5cdFx0XSk7XG5cdFx0Y29uc3QgW3JlZjEsIHJlZjJdID0gcmVzdWx0LmJvZHkudmFyaWFibGVSZWZlcmVuY2VzO1xuXHRcdGFzc2VydC5lcXVhbChjb250ZW50LnN1YnN0cmluZyhyZWYxLm9mZnNldCwgcmVmMS5vZmZzZXQgKyByZWYxLmZ1bGxMZW5ndGgpLCAnI3Rvb2w6dG9vbDEnKTtcblx0XHRhc3NlcnQuZXF1YWwoY29udGVudC5zdWJzdHJpbmcocmVmMi5vZmZzZXQsIHJlZjIub2Zmc2V0ICsgcmVmMi5mdWxsTGVuZ3RoKSwgJyN0b29sOnRvb2wtMicpO1xuXG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuaGVhZGVyLmRlc2NyaXB0aW9uLCAnQWdlbnQgdGVzdCcpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmhlYWRlci5tb2RlbCwgWydHUFQgNC4xJ10pO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaGVhZGVyLnRvb2xzKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5oZWFkZXIudG9vbHMsIFsndG9vbDEnLCAndG9vbDInXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vZGUgd2l0aCBoYW5kb2ZmJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L3Rlc3QuYWdlbnQubWQnKTtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0LyogMDEgKi8nLS0tJyxcblx0XHRcdC8qIDAyICovYGRlc2NyaXB0aW9uOiBcIkFnZW50IHRlc3RcImAsXG5cdFx0XHQvKiAwMyAqLydtb2RlbDogR1BUIDQuMScsXG5cdFx0XHQvKiAwNCAqLydoYW5kb2ZmczonLFxuXHRcdFx0LyogMDUgKi8nICAtIGxhYmVsOiBcIkltcGxlbWVudFwiJyxcblx0XHRcdC8qIDA2ICovJyAgICBhZ2VudDogRGVmYXVsdCcsXG5cdFx0XHQvKiAwNyAqLycgICAgcHJvbXB0OiBcIkltcGxlbWVudCB0aGUgcGxhblwiJyxcblx0XHRcdC8qIDA4ICovJyAgICBzZW5kOiBmYWxzZScsXG5cdFx0XHQvKiAwOSAqLycgIC0gbGFiZWw6IFwiU2F2ZVwiJyxcblx0XHRcdC8qIDEwICovJyAgICBhZ2VudDogRGVmYXVsdCcsXG5cdFx0XHQvKiAxMSAqLycgICAgcHJvbXB0OiBcIlNhdmUgdGhlIHBsYW4gdG8gYSBmaWxlXCInLFxuXHRcdFx0LyogMTIgKi8nICAgIHNlbmQ6IHRydWUnLFxuXHRcdFx0LyogMTMgKi8nLS0tJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBQcm9tcHRGaWxlUGFyc2VyKCkucGFyc2UodXJpLCBjb250ZW50KTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC51cmksIHVyaSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5oZWFkZXIpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmhlYWRlci5yYW5nZSwgeyBzdGFydExpbmVOdW1iZXI6IDIsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiAxMywgZW5kQ29sdW1uOiAxIH0pO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmhlYWRlci5hdHRyaWJ1dGVzLCBbXG5cdFx0XHR7IGtleTogJ2Rlc2NyaXB0aW9uJywgcmFuZ2U6IG5ldyBSYW5nZSgyLCAxLCAyLCAyNiksIHZhbHVlOiB7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ0FnZW50IHRlc3QnLCByYW5nZTogbmV3IFJhbmdlKDIsIDE0LCAyLCAyNiksIGZvcm1hdDogJ2RvdWJsZScgfSB9LFxuXHRcdFx0eyBrZXk6ICdtb2RlbCcsIHJhbmdlOiBuZXcgUmFuZ2UoMywgMSwgMywgMTUpLCB2YWx1ZTogeyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICdHUFQgNC4xJywgcmFuZ2U6IG5ldyBSYW5nZSgzLCA4LCAzLCAxNSksIGZvcm1hdDogJ25vbmUnIH0gfSxcblx0XHRcdHtcblx0XHRcdFx0a2V5OiAnaGFuZG9mZnMnLCByYW5nZTogbmV3IFJhbmdlKDQsIDEsIDEyLCAxNSksIHZhbHVlOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3NlcXVlbmNlJyxcblx0XHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDUsIDEsIDEyLCAxNSksXG5cdFx0XHRcdFx0aXRlbXM6IFtcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ21hcCcsIHJhbmdlOiBuZXcgUmFuZ2UoNSwgNSwgOCwgMTYpLFxuXHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiBbXG5cdFx0XHRcdFx0XHRcdFx0eyBrZXk6IHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAnbGFiZWwnLCByYW5nZTogbmV3IFJhbmdlKDUsIDUsIDUsIDEwKSwgZm9ybWF0OiAnbm9uZScgfSwgdmFsdWU6IHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAnSW1wbGVtZW50JywgcmFuZ2U6IG5ldyBSYW5nZSg1LCAxMiwgNSwgMjMpLCBmb3JtYXQ6ICdkb3VibGUnIH0gfSxcblx0XHRcdFx0XHRcdFx0XHR7IGtleTogeyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICdhZ2VudCcsIHJhbmdlOiBuZXcgUmFuZ2UoNiwgNSwgNiwgMTApLCBmb3JtYXQ6ICdub25lJyB9LCB2YWx1ZTogeyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICdEZWZhdWx0JywgcmFuZ2U6IG5ldyBSYW5nZSg2LCAxMiwgNiwgMTkpLCBmb3JtYXQ6ICdub25lJyB9IH0sXG5cdFx0XHRcdFx0XHRcdFx0eyBrZXk6IHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAncHJvbXB0JywgcmFuZ2U6IG5ldyBSYW5nZSg3LCA1LCA3LCAxMSksIGZvcm1hdDogJ25vbmUnIH0sIHZhbHVlOiB7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ0ltcGxlbWVudCB0aGUgcGxhbicsIHJhbmdlOiBuZXcgUmFuZ2UoNywgMTMsIDcsIDMzKSwgZm9ybWF0OiAnZG91YmxlJyB9IH0sXG5cdFx0XHRcdFx0XHRcdFx0eyBrZXk6IHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAnc2VuZCcsIHJhbmdlOiBuZXcgUmFuZ2UoOCwgNSwgOCwgOSksIGZvcm1hdDogJ25vbmUnIH0sIHZhbHVlOiB7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ2ZhbHNlJywgcmFuZ2U6IG5ldyBSYW5nZSg4LCAxMSwgOCwgMTYpLCBmb3JtYXQ6ICdub25lJyB9IH0sXG5cdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdtYXAnLCByYW5nZTogbmV3IFJhbmdlKDksIDUsIDEyLCAxNSksXG5cdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IFtcblx0XHRcdFx0XHRcdFx0XHR7IGtleTogeyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICdsYWJlbCcsIHJhbmdlOiBuZXcgUmFuZ2UoOSwgNSwgOSwgMTApLCBmb3JtYXQ6ICdub25lJyB9LCB2YWx1ZTogeyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICdTYXZlJywgcmFuZ2U6IG5ldyBSYW5nZSg5LCAxMiwgOSwgMTgpLCBmb3JtYXQ6ICdkb3VibGUnIH0gfSxcblx0XHRcdFx0XHRcdFx0XHR7IGtleTogeyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICdhZ2VudCcsIHJhbmdlOiBuZXcgUmFuZ2UoMTAsIDUsIDEwLCAxMCksIGZvcm1hdDogJ25vbmUnIH0sIHZhbHVlOiB7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ0RlZmF1bHQnLCByYW5nZTogbmV3IFJhbmdlKDEwLCAxMiwgMTAsIDE5KSwgZm9ybWF0OiAnbm9uZScgfSB9LFxuXHRcdFx0XHRcdFx0XHRcdHsga2V5OiB7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ3Byb21wdCcsIHJhbmdlOiBuZXcgUmFuZ2UoMTEsIDUsIDExLCAxMSksIGZvcm1hdDogJ25vbmUnIH0sIHZhbHVlOiB7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ1NhdmUgdGhlIHBsYW4gdG8gYSBmaWxlJywgcmFuZ2U6IG5ldyBSYW5nZSgxMSwgMTMsIDExLCAzOCksIGZvcm1hdDogJ2RvdWJsZScgfSB9LFxuXHRcdFx0XHRcdFx0XHRcdHsga2V5OiB7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ3NlbmQnLCByYW5nZTogbmV3IFJhbmdlKDEyLCA1LCAxMiwgOSksIGZvcm1hdDogJ25vbmUnIH0sIHZhbHVlOiB7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ3RydWUnLCByYW5nZTogbmV3IFJhbmdlKDEyLCAxMSwgMTIsIDE1KSwgZm9ybWF0OiAnbm9uZScgfSB9LFxuXHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5oZWFkZXIuZGVzY3JpcHRpb24sICdBZ2VudCB0ZXN0Jyk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuaGVhZGVyLm1vZGVsLCBbJ0dQVCA0LjEnXSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5oZWFkZXIuaGFuZE9mZnMpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmhlYWRlci5oYW5kT2ZmcywgW1xuXHRcdFx0eyBsYWJlbDogJ0ltcGxlbWVudCcsIGFnZW50OiAnRGVmYXVsdCcsIHByb21wdDogJ0ltcGxlbWVudCB0aGUgcGxhbicsIHNlbmQ6IGZhbHNlIH0sXG5cdFx0XHR7IGxhYmVsOiAnU2F2ZScsIGFnZW50OiAnRGVmYXVsdCcsIHByb21wdDogJ1NhdmUgdGhlIHBsYW4gdG8gYSBmaWxlJywgc2VuZDogdHJ1ZSB9XG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vZGUgd2l0aCBoYW5kb2ZmIGFuZCBzaG93Q29udGludWVPbiBwZXIgaGFuZG9mZicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC90ZXN0LmFnZW50Lm1kJyk7XG5cdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdC8qIDAxICovJy0tLScsXG5cdFx0XHQvKiAwMiAqL2BkZXNjcmlwdGlvbjogXCJBZ2VudCB0ZXN0XCJgLFxuXHRcdFx0LyogMDMgKi8nbW9kZWw6IEdQVCA0LjEnLFxuXHRcdFx0LyogMDQgKi8naGFuZG9mZnM6Jyxcblx0XHRcdC8qIDA1ICovJyAgLSBsYWJlbDogXCJJbXBsZW1lbnRcIicsXG5cdFx0XHQvKiAwNiAqLycgICAgYWdlbnQ6IERlZmF1bHQnLFxuXHRcdFx0LyogMDcgKi8nICAgIHByb21wdDogXCJJbXBsZW1lbnQgdGhlIHBsYW5cIicsXG5cdFx0XHQvKiAwOCAqLycgICAgc2VuZDogZmFsc2UnLFxuXHRcdFx0LyogMDkgKi8nICAgIHNob3dDb250aW51ZU9uOiBmYWxzZScsXG5cdFx0XHQvKiAxMCAqLycgIC0gbGFiZWw6IFwiU2F2ZVwiJyxcblx0XHRcdC8qIDExICovJyAgICBhZ2VudDogRGVmYXVsdCcsXG5cdFx0XHQvKiAxMiAqLycgICAgcHJvbXB0OiBcIlNhdmUgdGhlIHBsYW5cIicsXG5cdFx0XHQvKiAxMyAqLycgICAgc2VuZDogdHJ1ZScsXG5cdFx0XHQvKiAxNCAqLycgICAgc2hvd0NvbnRpbnVlT246IHRydWUnLFxuXHRcdFx0LyogMTUgKi8nLS0tJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBQcm9tcHRGaWxlUGFyc2VyKCkucGFyc2UodXJpLCBjb250ZW50KTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC51cmksIHVyaSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5oZWFkZXIpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaGVhZGVyLmhhbmRPZmZzKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5oZWFkZXIuaGFuZE9mZnMsIFtcblx0XHRcdHsgbGFiZWw6ICdJbXBsZW1lbnQnLCBhZ2VudDogJ0RlZmF1bHQnLCBwcm9tcHQ6ICdJbXBsZW1lbnQgdGhlIHBsYW4nLCBzZW5kOiBmYWxzZSwgc2hvd0NvbnRpbnVlT246IGZhbHNlIH0sXG5cdFx0XHR7IGxhYmVsOiAnU2F2ZScsIGFnZW50OiAnRGVmYXVsdCcsIHByb21wdDogJ1NhdmUgdGhlIHBsYW4nLCBzZW5kOiB0cnVlLCBzaG93Q29udGludWVPbjogdHJ1ZSB9XG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3dDb250aW51ZU9uIGRlZmF1bHRzIHRvIHVuZGVmaW5lZCB3aGVuIG5vdCBzcGVjaWZpZWQgcGVyIGhhbmRvZmYnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvdGVzdC5hZ2VudC5tZCcpO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQvKiAwMSAqLyctLS0nLFxuXHRcdFx0LyogMDIgKi9gZGVzY3JpcHRpb246IFwiQWdlbnQgdGVzdFwiYCxcblx0XHRcdC8qIDAzICovJ2hhbmRvZmZzOicsXG5cdFx0XHQvKiAwNCAqLycgIC0gbGFiZWw6IFwiU2F2ZVwiJyxcblx0XHRcdC8qIDA1ICovJyAgICBhZ2VudDogRGVmYXVsdCcsXG5cdFx0XHQvKiAwNiAqLycgICAgcHJvbXB0OiBcIlNhdmUgdGhlIHBsYW5cIicsXG5cdFx0XHQvKiAwNyAqLyctLS0nLFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IFByb21wdEZpbGVQYXJzZXIoKS5wYXJzZSh1cmksIGNvbnRlbnQpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LnVyaSwgdXJpKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmhlYWRlcik7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5oZWFkZXIuaGFuZE9mZnMpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmhlYWRlci5oYW5kT2Zmc1swXS5zaG93Q29udGludWVPbiwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZG9mZiB3aXRoIHdoaXRlc3BhY2Utb25seSBsYWJlbCBpcyBza2lwcGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L3Rlc3QuYWdlbnQubWQnKTtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0LyogMDEgKi8nLS0tJyxcblx0XHRcdC8qIDAyICovYGRlc2NyaXB0aW9uOiBcIkFnZW50IHRlc3RcImAsXG5cdFx0XHQvKiAwMyAqLydoYW5kb2ZmczonLFxuXHRcdFx0LyogMDQgKi8nICAtIGxhYmVsOiBcIiAgIFwiJyxcblx0XHRcdC8qIDA1ICovJyAgICBhZ2VudDogRGVmYXVsdCcsXG5cdFx0XHQvKiAwNiAqLycgICAgcHJvbXB0OiBcIkRvIHNvbWV0aGluZ1wiJyxcblx0XHRcdC8qIDA3ICovJyAgLSBsYWJlbDogXCJWYWxpZFwiJyxcblx0XHRcdC8qIDA4ICovJyAgICBhZ2VudDogRGVmYXVsdCcsXG5cdFx0XHQvKiAwOSAqLycgICAgcHJvbXB0OiBcIkFsc28gZG8gc29tZXRoaW5nXCInLFxuXHRcdFx0LyogMTAgKi8nLS0tJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBQcm9tcHRGaWxlUGFyc2VyKCkucGFyc2UodXJpLCBjb250ZW50KTtcblx0XHRhc3NlcnQub2socmVzdWx0LmhlYWRlcik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuaGVhZGVyLmhhbmRPZmZzLCBbXG5cdFx0XHR7IGFnZW50OiAnRGVmYXVsdCcsIGxhYmVsOiAnVmFsaWQnLCBwcm9tcHQ6ICdBbHNvIGRvIHNvbWV0aGluZycgfVxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnN0cnVjdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvcHJvbXB0MS5tZCcpO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQvKiAwMSAqLyctLS0nLFxuXHRcdFx0LyogMDIgKi9gZGVzY3JpcHRpb246IFwiQ29kZSBzdHlsZSBpbnN0cnVjdGlvbnMgZm9yIFR5cGVTY3JpcHRcImAsXG5cdFx0XHQvKiAwMyAqLydhcHBseVRvOiAqLnRzJyxcblx0XHRcdC8qIDA0ICovJy0tLScsXG5cdFx0XHQvKiAwNSAqLydGb2xsb3cgbXkgY29tcGFuaWVzIGNvZGluZyBndWlkbGluZXMgYXQgW215Y29tcC10cy1ndWlkZWxpbmVzXShodHRwczovL215Y29tcC9ndWlkZWxpbmVzI3R5cGVzY3JpcHQubWQpJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBQcm9tcHRGaWxlUGFyc2VyKCkucGFyc2UodXJpLCBjb250ZW50KTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC51cmksIHVyaSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5oZWFkZXIpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuYm9keSk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuaGVhZGVyLnJhbmdlLCB7IHN0YXJ0TGluZU51bWJlcjogMiwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDQsIGVuZENvbHVtbjogMSB9KTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5oZWFkZXIuYXR0cmlidXRlcywgW1xuXHRcdFx0eyBrZXk6ICdkZXNjcmlwdGlvbicsIHJhbmdlOiBuZXcgUmFuZ2UoMiwgMSwgMiwgNTQpLCB2YWx1ZTogeyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICdDb2RlIHN0eWxlIGluc3RydWN0aW9ucyBmb3IgVHlwZVNjcmlwdCcsIHJhbmdlOiBuZXcgUmFuZ2UoMiwgMTQsIDIsIDU0KSwgZm9ybWF0OiAnZG91YmxlJyB9IH0sXG5cdFx0XHR7IGtleTogJ2FwcGx5VG8nLCByYW5nZTogbmV3IFJhbmdlKDMsIDEsIDMsIDE0KSwgdmFsdWU6IHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAnKi50cycsIHJhbmdlOiBuZXcgUmFuZ2UoMywgMTAsIDMsIDE0KSwgZm9ybWF0OiAnbm9uZScgfSB9LFxuXHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmJvZHkucmFuZ2UsIHsgc3RhcnRMaW5lTnVtYmVyOiA1LCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogNiwgZW5kQ29sdW1uOiAxIH0pO1xuXHRcdGFzc2VydC5lcXVhbChyZXN1bHQuYm9keS5vZmZzZXQsIDc2KTtcblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0LmJvZHkuZ2V0Q29udGVudCgpLCAnRm9sbG93IG15IGNvbXBhbmllcyBjb2RpbmcgZ3VpZGxpbmVzIGF0IFtteWNvbXAtdHMtZ3VpZGVsaW5lc10oaHR0cHM6Ly9teWNvbXAvZ3VpZGVsaW5lcyN0eXBlc2NyaXB0Lm1kKScpO1xuXG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuYm9keS5maWxlUmVmZXJlbmNlcywgW1xuXHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDUsIDY0LCA1LCAxMDMpLCBjb250ZW50OiAnaHR0cHM6Ly9teWNvbXAvZ3VpZGVsaW5lcyN0eXBlc2NyaXB0Lm1kJywgaXNNYXJrZG93bkxpbms6IHRydWUgfSxcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5ib2R5LnZhcmlhYmxlUmVmZXJlbmNlcywgW10pO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmhlYWRlci5kZXNjcmlwdGlvbiwgJ0NvZGUgc3R5bGUgaW5zdHJ1Y3Rpb25zIGZvciBUeXBlU2NyaXB0Jyk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuaGVhZGVyLmFwcGx5VG8sICcqLnRzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb21wdCBmaWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L3Byb21wdDIubWQnKTtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0LyogMDEgKi8nLS0tJyxcblx0XHRcdC8qIDAyICovYGRlc2NyaXB0aW9uOiBcIkdlbmVyYWwgcHVycG9zZSBjb2RpbmcgYXNzaXN0YW50XCJgLFxuXHRcdFx0LyogMDMgKi8nYWdlbnQ6IGFnZW50Jyxcblx0XHRcdC8qIDA0ICovJ21vZGVsOiBHUFQgNC4xJyxcblx0XHRcdC8qIDA1ICovYHRvb2xzOiBbJ3NlYXJjaCcsICd0ZXJtaW5hbCddYCxcblx0XHRcdC8qIDA2ICovJy0tLScsXG5cdFx0XHQvKiAwNyAqLydUaGlzIGlzIGEgcHJvbXB0IGZpbGUgYm9keSByZWZlcmVuY2luZyAjdG9vbDpzZWFyY2ggYW5kIFtkb2NzXShodHRwczovL2V4YW1wbGUuY29tL2RvY3MpLicsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgUHJvbXB0RmlsZVBhcnNlcigpLnBhcnNlKHVyaSwgY29udGVudCk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQudXJpLCB1cmkpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaGVhZGVyKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmJvZHkpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmhlYWRlci5yYW5nZSwgeyBzdGFydExpbmVOdW1iZXI6IDIsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiA2LCBlbmRDb2x1bW46IDEgfSk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuaGVhZGVyLmF0dHJpYnV0ZXMsIFtcblx0XHRcdHsga2V5OiAnZGVzY3JpcHRpb24nLCByYW5nZTogbmV3IFJhbmdlKDIsIDEsIDIsIDQ4KSwgdmFsdWU6IHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAnR2VuZXJhbCBwdXJwb3NlIGNvZGluZyBhc3Npc3RhbnQnLCByYW5nZTogbmV3IFJhbmdlKDIsIDE0LCAyLCA0OCksIGZvcm1hdDogJ2RvdWJsZScgfSB9LFxuXHRcdFx0eyBrZXk6ICdhZ2VudCcsIHJhbmdlOiBuZXcgUmFuZ2UoMywgMSwgMywgMTMpLCB2YWx1ZTogeyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICdhZ2VudCcsIHJhbmdlOiBuZXcgUmFuZ2UoMywgOCwgMywgMTMpLCBmb3JtYXQ6ICdub25lJyB9IH0sXG5cdFx0XHR7IGtleTogJ21vZGVsJywgcmFuZ2U6IG5ldyBSYW5nZSg0LCAxLCA0LCAxNSksIHZhbHVlOiB7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ0dQVCA0LjEnLCByYW5nZTogbmV3IFJhbmdlKDQsIDgsIDQsIDE1KSwgZm9ybWF0OiAnbm9uZScgfSB9LFxuXHRcdFx0e1xuXHRcdFx0XHRrZXk6ICd0b29scycsIHJhbmdlOiBuZXcgUmFuZ2UoNSwgMSwgNSwgMzApLCB2YWx1ZToge1xuXHRcdFx0XHRcdHR5cGU6ICdzZXF1ZW5jZScsXG5cdFx0XHRcdFx0aXRlbXM6IFt7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ3NlYXJjaCcsIHJhbmdlOiBuZXcgUmFuZ2UoNSwgOSwgNSwgMTcpLCBmb3JtYXQ6ICdzaW5nbGUnIH0sIHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAndGVybWluYWwnLCByYW5nZTogbmV3IFJhbmdlKDUsIDE5LCA1LCAyOSksIGZvcm1hdDogJ3NpbmdsZScgfV0sXG5cdFx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSg1LCA4LCA1LCAzMClcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5ib2R5LnJhbmdlLCB7IHN0YXJ0TGluZU51bWJlcjogNywgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDgsIGVuZENvbHVtbjogMSB9KTtcblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0LmJvZHkub2Zmc2V0LCAxMTQpO1xuXHRcdGFzc2VydC5lcXVhbChyZXN1bHQuYm9keS5nZXRDb250ZW50KCksICdUaGlzIGlzIGEgcHJvbXB0IGZpbGUgYm9keSByZWZlcmVuY2luZyAjdG9vbDpzZWFyY2ggYW5kIFtkb2NzXShodHRwczovL2V4YW1wbGUuY29tL2RvY3MpLicpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmJvZHkuZmlsZVJlZmVyZW5jZXMsIFtcblx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSg3LCA2NCwgNywgODgpLCBjb250ZW50OiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9kb2NzJywgaXNNYXJrZG93bkxpbms6IHRydWUgfSxcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5ib2R5LnZhcmlhYmxlUmVmZXJlbmNlcywgW1xuXHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDcsIDQ2LCA3LCA1MiksIG5hbWU6ICdzZWFyY2gnLCBvZmZzZXQ6IDE1MywgZnVsbExlbmd0aDogMTIgfVxuXHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmhlYWRlci5kZXNjcmlwdGlvbiwgJ0dlbmVyYWwgcHVycG9zZSBjb2RpbmcgYXNzaXN0YW50Jyk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuaGVhZGVyLmFnZW50LCAnYWdlbnQnKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5oZWFkZXIubW9kZWwsIFsnR1BUIDQuMSddKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmhlYWRlci50b29scyk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuaGVhZGVyLnRvb2xzLCBbJ3NlYXJjaCcsICd0ZXJtaW5hbCddKTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlcyBsaW5rcyBhbmQgdmFyaWFibGVzIGluc2lkZSBpbmxpbmUgY29kZSBhbmQgZmVuY2VkIGNvZGUgYmxvY2tzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L3Byb21wdDMubWQnKTtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0Jy0tLScsXG5cdFx0XHRgZGVzY3JpcHRpb246IFwiUHJvbXB0IHdpdGggbWFya2Rvd24gY29kZVwiYCxcblx0XHRcdCctLS0nLFxuXHRcdFx0J091dHNpZGUgI3Rvb2w6b3V0c2lkZSBhbmQgW291dHNpZGVdKC4vb3V0c2lkZS5tZCkuJyxcblx0XHRcdCdJbmxpbmUgY29kZTogYCN0b29sOmlubGluZSBhbmQgW2lubGluZV0oLi9pbmxpbmUubWQpYCBzaG91bGQgYmUgaWdub3JlZC4nLFxuXHRcdFx0J2BgYHRzJyxcblx0XHRcdCcjdG9vbDpibG9jayBhbmQgI2ZpbGU6Li9pbnNpZGUtYmxvY2subWQgYW5kIFtibG9ja10oLi9ibG9jay5tZCknLFxuXHRcdFx0J2BgYCcsXG5cdFx0XHQnQWZ0ZXIgYmxvY2sgI2ZpbGU6Li9hZnRlci5tZCBhbmQgW2FmdGVyXSguL2FmdGVyLWxpbmsubWQpLicsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBQcm9tcHRGaWxlUGFyc2VyKCkucGFyc2UodXJpLCBjb250ZW50KTtcblx0XHRhc3NlcnQub2socmVzdWx0LmJvZHkpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmJvZHkuZmlsZVJlZmVyZW5jZXMubWFwKHJlZmVyZW5jZSA9PiAoeyBjb250ZW50OiByZWZlcmVuY2UuY29udGVudCwgaXNNYXJrZG93bkxpbms6IHJlZmVyZW5jZS5pc01hcmtkb3duTGluayB9KSksIFtcblx0XHRcdHsgY29udGVudDogJy4vb3V0c2lkZS5tZCcsIGlzTWFya2Rvd25MaW5rOiB0cnVlIH0sXG5cdFx0XHR7IGNvbnRlbnQ6ICcuL2FmdGVyLm1kJywgaXNNYXJrZG93bkxpbms6IGZhbHNlIH0sXG5cdFx0XHR7IGNvbnRlbnQ6ICcuL2FmdGVyLWxpbmsubWQnLCBpc01hcmtkb3duTGluazogdHJ1ZSB9XG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuYm9keS52YXJpYWJsZVJlZmVyZW5jZXMubWFwKHJlZmVyZW5jZSA9PiByZWZlcmVuY2UubmFtZSksIFsnb3V0c2lkZSddKTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlcyByZWZlcmVuY2VzIGluIG11bHRpcGxlIGlubGluZSBjb2RlIHNwYW5zIG9uIHRoZSBzYW1lIGxpbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvcHJvbXB0LWlubGluZS5tZCcpO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQnLS0tJyxcblx0XHRcdCdkZXNjcmlwdGlvbjogXCJ0ZXN0XCInLFxuXHRcdFx0Jy0tLScsXG5cdFx0XHQnQmVmb3JlIGAjdG9vbDppZ25vcmVkMWAgbWlkZGxlICN0b29sOnZpc2libGUgYFtsaW5rXSguL2lnbm9yZWQubWQpYCBhZnRlciBbcmVhbF0oLi9yZWFsLm1kKS4nLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBuZXcgUHJvbXB0RmlsZVBhcnNlcigpLnBhcnNlKHVyaSwgY29udGVudCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5ib2R5KTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5ib2R5LmZpbGVSZWZlcmVuY2VzLm1hcChyID0+ICh7IGNvbnRlbnQ6IHIuY29udGVudCwgaXNNYXJrZG93bkxpbms6IHIuaXNNYXJrZG93bkxpbmsgfSkpLCBbXG5cdFx0XHR7IGNvbnRlbnQ6ICcuL3JlYWwubWQnLCBpc01hcmtkb3duTGluazogdHJ1ZSB9LFxuXHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmJvZHkudmFyaWFibGVSZWZlcmVuY2VzLm1hcChyID0+IHIubmFtZSksIFsndmlzaWJsZSddKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyBmZW5jZWQgY29kZSBibG9jayB3aXRob3V0IGxhbmd1YWdlIHNwZWNpZmllcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC9wcm9tcHQtZmVuY2UubWQnKTtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0Jy0tLScsXG5cdFx0XHQnZGVzY3JpcHRpb246IFwidGVzdFwiJyxcblx0XHRcdCctLS0nLFxuXHRcdFx0J2BgYCcsXG5cdFx0XHQnI2ZpbGU6Li9pZ25vcmVkLm1kJyxcblx0XHRcdCdbbGlua10oLi9pZ25vcmVkLWxpbmsubWQpJyxcblx0XHRcdCdgYGAnLFxuXHRcdFx0JyNmaWxlOi4vdmlzaWJsZS5tZCcsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBQcm9tcHRGaWxlUGFyc2VyKCkucGFyc2UodXJpLCBjb250ZW50KTtcblx0XHRhc3NlcnQub2socmVzdWx0LmJvZHkpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmJvZHkuZmlsZVJlZmVyZW5jZXMubWFwKHIgPT4gKHsgY29udGVudDogci5jb250ZW50LCBpc01hcmtkb3duTGluazogci5pc01hcmtkb3duTGluayB9KSksIFtcblx0XHRcdHsgY29udGVudDogJy4vdmlzaWJsZS5tZCcsIGlzTWFya2Rvd25MaW5rOiBmYWxzZSB9LFxuXHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmJvZHkudmFyaWFibGVSZWZlcmVuY2VzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgbXVsdGlwbGUgZmVuY2VkIGNvZGUgYmxvY2tzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L3Byb21wdC1tdWx0aS1mZW5jZS5tZCcpO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQnLS0tJyxcblx0XHRcdCdkZXNjcmlwdGlvbjogXCJ0ZXN0XCInLFxuXHRcdFx0Jy0tLScsXG5cdFx0XHQnI3Rvb2w6YmVmb3JlJyxcblx0XHRcdCdgYGBqcycsXG5cdFx0XHQnI3Rvb2w6aWdub3JlZDEnLFxuXHRcdFx0J2BgYCcsXG5cdFx0XHQnI3Rvb2w6YmV0d2VlbicsXG5cdFx0XHQnYGBgcHl0aG9uJyxcblx0XHRcdCcjdG9vbDppZ25vcmVkMicsXG5cdFx0XHQnYGBgJyxcblx0XHRcdCcjdG9vbDphZnRlcicsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBQcm9tcHRGaWxlUGFyc2VyKCkucGFyc2UodXJpLCBjb250ZW50KTtcblx0XHRhc3NlcnQub2socmVzdWx0LmJvZHkpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmJvZHkudmFyaWFibGVSZWZlcmVuY2VzLm1hcChyID0+IHIubmFtZSksIFsnYmVmb3JlJywgJ2JldHdlZW4nLCAnYWZ0ZXInXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VuY2xvc2VkIGZlbmNlZCBjb2RlIGJsb2NrIGlnbm9yZXMgYWxsIHJlbWFpbmluZyBsaW5lcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC9wcm9tcHQtdW5jbG9zZWQubWQnKTtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0Jy0tLScsXG5cdFx0XHQnZGVzY3JpcHRpb246IFwidGVzdFwiJyxcblx0XHRcdCctLS0nLFxuXHRcdFx0JyN0b29sOnZpc2libGUnLFxuXHRcdFx0J2BgYCcsXG5cdFx0XHQnI3Rvb2w6aWdub3JlZCcsXG5cdFx0XHQnI2ZpbGU6Li9pZ25vcmVkLm1kJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IFByb21wdEZpbGVQYXJzZXIoKS5wYXJzZSh1cmksIGNvbnRlbnQpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuYm9keSk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuYm9keS52YXJpYWJsZVJlZmVyZW5jZXMubWFwKHIgPT4gci5uYW1lKSwgWyd2aXNpYmxlJ10pO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmJvZHkuZmlsZVJlZmVyZW5jZXMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnYWRqYWNlbnQgaW5saW5lIGNvZGUgZG9lcyBub3Qgc3VwcHJlc3Mgb3V0c2lkZSByZWZlcmVuY2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L3Byb21wdC1hZGphY2VudC5tZCcpO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQnLS0tJyxcblx0XHRcdCdkZXNjcmlwdGlvbjogXCJ0ZXN0XCInLFxuXHRcdFx0Jy0tLScsXG5cdFx0XHQnYGNvZGVgI3Rvb2w6YXR0YWNoZWQgYG1vcmVgW2xpbmtdKC4vZmlsZS5tZCknLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBuZXcgUHJvbXB0RmlsZVBhcnNlcigpLnBhcnNlKHVyaSwgY29udGVudCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5ib2R5KTtcblx0XHQvLyAjdG9vbDphdHRhY2hlZCBzdGFydHMgcmlnaHQgYWZ0ZXIgdGhlIGNsb3NpbmcgYmFja3RpY2ssIHNvIGl0J3Mgb3V0c2lkZSBpbmxpbmUgY29kZVxuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmJvZHkudmFyaWFibGVSZWZlcmVuY2VzLm1hcChyID0+IHIubmFtZSksIFsnYXR0YWNoZWQnXSk7XG5cdFx0Ly8gW2xpbmtdKC4vZmlsZS5tZCkgc3RhcnRzIGFmdGVyIHRoZSBzZWNvbmQgaW5saW5lIGNvZGUgc3BhblxuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmJvZHkuZmlsZVJlZmVyZW5jZXMubWFwKHIgPT4gKHsgY29udGVudDogci5jb250ZW50LCBpc01hcmtkb3duTGluazogci5pc01hcmtkb3duTGluayB9KSksIFtcblx0XHRcdHsgY29udGVudDogJy4vZmlsZS5tZCcsIGlzTWFya2Rvd25MaW5rOiB0cnVlIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luZGVudGVkIGZlbmNlZCBjb2RlIGJsb2NrIGlzIHN0aWxsIGRldGVjdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L3Byb21wdC1pbmRlbnQubWQnKTtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0Jy0tLScsXG5cdFx0XHQnZGVzY3JpcHRpb246IFwidGVzdFwiJyxcblx0XHRcdCctLS0nLFxuXHRcdFx0JyAgYGBgdHMnLFxuXHRcdFx0JyAgI3Rvb2w6aWdub3JlZCcsXG5cdFx0XHQnICBgYGAnLFxuXHRcdFx0JyN0b29sOnZpc2libGUnLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBuZXcgUHJvbXB0RmlsZVBhcnNlcigpLnBhcnNlKHVyaSwgY29udGVudCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5ib2R5KTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5ib2R5LnZhcmlhYmxlUmVmZXJlbmNlcy5tYXAociA9PiByLm5hbWUpLCBbJ3Zpc2libGUnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZlbmNlZCBjb2RlIGJsb2NrIHdpdGggNCBiYWNrdGlja3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvcHJvbXB0LTR0aWNrLm1kJyk7XG5cdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdCctLS0nLFxuXHRcdFx0J2Rlc2NyaXB0aW9uOiBcInRlc3RcIicsXG5cdFx0XHQnLS0tJyxcblx0XHRcdCdgYGBgJyxcblx0XHRcdCcjdG9vbDppZ25vcmVkIGFuZCBbbGlua10oLi9pZ25vcmVkLm1kKScsXG5cdFx0XHQnYGBgYCcsXG5cdFx0XHQnI3Rvb2w6dmlzaWJsZScsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBQcm9tcHRGaWxlUGFyc2VyKCkucGFyc2UodXJpLCBjb250ZW50KTtcblx0XHRhc3NlcnQub2socmVzdWx0LmJvZHkpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmJvZHkudmFyaWFibGVSZWZlcmVuY2VzLm1hcChyID0+IHIubmFtZSksIFsndmlzaWJsZSddKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5ib2R5LmZpbGVSZWZlcmVuY2VzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZlbmNlZCBjb2RlIGJsb2NrIHdpdGggdGlsZGUgZmVuY2UgKH5+fiknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvcHJvbXB0LXRpbGRlLm1kJyk7XG5cdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdCctLS0nLFxuXHRcdFx0J2Rlc2NyaXB0aW9uOiBcInRlc3RcIicsXG5cdFx0XHQnLS0tJyxcblx0XHRcdCd+fn4nLFxuXHRcdFx0JyNmaWxlOi4vaWdub3JlZC5tZCBhbmQgW2xpbmtdKC4vaWdub3JlZC1saW5rLm1kKScsXG5cdFx0XHQnI3Rvb2w6aWdub3JlZCcsXG5cdFx0XHQnfn5+Jyxcblx0XHRcdCdbcmVhbF0oLi9yZWFsLm1kKScsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBQcm9tcHRGaWxlUGFyc2VyKCkucGFyc2UodXJpLCBjb250ZW50KTtcblx0XHRhc3NlcnQub2socmVzdWx0LmJvZHkpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmJvZHkuZmlsZVJlZmVyZW5jZXMubWFwKHIgPT4gKHsgY29udGVudDogci5jb250ZW50LCBpc01hcmtkb3duTGluazogci5pc01hcmtkb3duTGluayB9KSksIFtcblx0XHRcdHsgY29udGVudDogJy4vcmVhbC5tZCcsIGlzTWFya2Rvd25MaW5rOiB0cnVlIH0sXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuYm9keS52YXJpYWJsZVJlZmVyZW5jZXMsIFtdKTtcblx0fSk7XG5cblxuXHR0ZXN0KCdhZ2VudCB3aXRoIGFnZW50cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC90ZXN0LmFnZW50Lm1kJyk7XG5cdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdCctLS0nLFxuXHRcdFx0YGRlc2NyaXB0aW9uOiBcIkFnZW50IHdpdGggcmVzdHJpY3Rpb25zXCJgLFxuXHRcdFx0J2FnZW50czogW1wic3ViYWdlbnQxXCIsIFwic3ViYWdlbnQyXCJdJyxcblx0XHRcdCctLS0nLFxuXHRcdFx0J1RoaXMgaXMgYW4gYWdlbnQgd2l0aCByZXN0cmljdGVkIHN1YmFnZW50cy4nLFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IFByb21wdEZpbGVQYXJzZXIoKS5wYXJzZSh1cmksIGNvbnRlbnQpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LnVyaSwgdXJpKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmhlYWRlcik7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5ib2R5KTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5oZWFkZXIuZGVzY3JpcHRpb24sICdBZ2VudCB3aXRoIHJlc3RyaWN0aW9ucycpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmhlYWRlci5hZ2VudHMsIFsnc3ViYWdlbnQxJywgJ3N1YmFnZW50MiddKTtcblx0fSk7XG5cblx0dGVzdCgnYWdlbnQgd2l0aCBlbXB0eSBhZ2VudHMgYXJyYXknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvdGVzdC5hZ2VudC5tZCcpO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQnLS0tJyxcblx0XHRcdGBkZXNjcmlwdGlvbjogXCJBZ2VudCB3aXRoIG5vIGFjY2Vzc1wiYCxcblx0XHRcdCdhZ2VudHM6IFtdJyxcblx0XHRcdCctLS0nLFxuXHRcdFx0J1RoaXMgYWdlbnQgaGFzIG5vIGFjY2VzcyB0byBzdWJhZ2VudHMuJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBQcm9tcHRGaWxlUGFyc2VyKCkucGFyc2UodXJpLCBjb250ZW50KTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC51cmksIHVyaSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5oZWFkZXIpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmhlYWRlci5kZXNjcmlwdGlvbiwgJ0FnZW50IHdpdGggbm8gYWNjZXNzJyk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuaGVhZGVyLmFnZW50cywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdhZ2VudCB3aXRoIHdpbGRjYXJkIGFnZW50cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC90ZXN0LmFnZW50Lm1kJyk7XG5cdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdCctLS0nLFxuXHRcdFx0YGRlc2NyaXB0aW9uOiBcIkFnZW50IHdpdGggZnVsbCBhY2Nlc3NcImAsXG5cdFx0XHQnYWdlbnRzOiBbXCIqXCJdJyxcblx0XHRcdCctLS0nLFxuXHRcdFx0J1RoaXMgYWdlbnQgaGFzIGFjY2VzcyB0byBhbGwgc3ViYWdlbnRzLicsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgUHJvbXB0RmlsZVBhcnNlcigpLnBhcnNlKHVyaSwgY29udGVudCk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQudXJpLCB1cmkpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaGVhZGVyKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5oZWFkZXIuZGVzY3JpcHRpb24sICdBZ2VudCB3aXRoIGZ1bGwgYWNjZXNzJyk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuaGVhZGVyLmFnZW50cywgWycqJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdhZ2VudCB3aXRob3V0IGFnZW50cyAodW5kZWZpbmVkKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC90ZXN0LmFnZW50Lm1kJyk7XG5cdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdCctLS0nLFxuXHRcdFx0YGRlc2NyaXB0aW9uOiBcIkFnZW50IHdpdGhvdXQgcmVzdHJpY3Rpb25zXCJgLFxuXHRcdFx0Jy0tLScsXG5cdFx0XHQnVGhpcyBhZ2VudCBoYXMgZGVmYXVsdCBhY2Nlc3MgdG8gYWxsLicsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgUHJvbXB0RmlsZVBhcnNlcigpLnBhcnNlKHVyaSwgY29udGVudCk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQudXJpLCB1cmkpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaGVhZGVyKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5oZWFkZXIuZGVzY3JpcHRpb24sICdBZ2VudCB3aXRob3V0IHJlc3RyaWN0aW9ucycpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmhlYWRlci5hZ2VudHMsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHN1aXRlKCdwYXJzZUNvbW1hU2VwYXJhdGVkTGlzdCcsICgpID0+IHtcblxuXHRcdGZ1bmN0aW9uIGFzc2VydENvbW1hU2VwYXJhdGVkTGlzdChpbnB1dDogc3RyaW5nLCBleHBlY3RlZDogSVNjYWxhclZhbHVlW10pOiB2b2lkIHtcblx0XHRcdGNvbnN0IGFjdHVhbCA9IHBhcnNlQ29tbWFTZXBhcmF0ZWRMaXN0KHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiBpbnB1dCwgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCBpbnB1dC5sZW5ndGggKyAxKSwgZm9ybWF0OiAnbm9uZScgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5pdGVtcywgZXhwZWN0ZWQpO1xuXHRcdH1cblxuXHRcdHRlc3QoJ3NpbXBsZSB1bnF1b3RlZCB2YWx1ZXMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnRDb21tYVNlcGFyYXRlZExpc3QoJ2EsIGIsIGMnLCBbXG5cdFx0XHRcdHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAnYScsIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMiksIGZvcm1hdDogJ25vbmUnIH0sXG5cdFx0XHRcdHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAnYicsIHJhbmdlOiBuZXcgUmFuZ2UoMSwgNCwgMSwgNSksIGZvcm1hdDogJ25vbmUnIH0sXG5cdFx0XHRcdHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAnYycsIHJhbmdlOiBuZXcgUmFuZ2UoMSwgNywgMSwgOCksIGZvcm1hdDogJ25vbmUnIH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndW5xdW90ZWQgdmFsdWVzIHdpdGhvdXQgc3BhY2VzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0Q29tbWFTZXBhcmF0ZWRMaXN0KCdmb28sYmFyLGJheicsIFtcblx0XHRcdFx0eyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICdmb28nLCByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDQpLCBmb3JtYXQ6ICdub25lJyB9LFxuXHRcdFx0XHR7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ2JhcicsIHJhbmdlOiBuZXcgUmFuZ2UoMSwgNSwgMSwgOCksIGZvcm1hdDogJ25vbmUnIH0sXG5cdFx0XHRcdHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAnYmF6JywgcmFuZ2U6IG5ldyBSYW5nZSgxLCA5LCAxLCAxMiksIGZvcm1hdDogJ25vbmUnIH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG91YmxlIHF1b3RlZCB2YWx1ZXMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnRDb21tYVNlcGFyYXRlZExpc3QoJ1wiaGVsbG9cIiwgXCJ3b3JsZFwiJywgW1xuXHRcdFx0XHR7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ2hlbGxvJywgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCA4KSwgZm9ybWF0OiAnZG91YmxlJyB9LFxuXHRcdFx0XHR7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ3dvcmxkJywgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxMCwgMSwgMTcpLCBmb3JtYXQ6ICdkb3VibGUnIH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2luZ2xlIHF1b3RlZCB2YWx1ZXMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnRDb21tYVNlcGFyYXRlZExpc3QoYCdvbmUnLCAndHdvJ2AsIFtcblx0XHRcdFx0eyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICdvbmUnLCByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDYpLCBmb3JtYXQ6ICdzaW5nbGUnIH0sXG5cdFx0XHRcdHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAndHdvJywgcmFuZ2U6IG5ldyBSYW5nZSgxLCA4LCAxLCAxMyksIGZvcm1hdDogJ3NpbmdsZScgfVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtaXhlZCBxdW90ZWQgYW5kIHVucXVvdGVkIHZhbHVlcycsICgpID0+IHtcblx0XHRcdGFzc2VydENvbW1hU2VwYXJhdGVkTGlzdCgndW5xdW90ZWQsIFwiZG91YmxlXCIsIFxcJ3NpbmdsZVxcJycsIFtcblx0XHRcdFx0eyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICd1bnF1b3RlZCcsIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgOSksIGZvcm1hdDogJ25vbmUnIH0sXG5cdFx0XHRcdHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAnZG91YmxlJywgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxMSwgMSwgMTkpLCBmb3JtYXQ6ICdkb3VibGUnIH0sXG5cdFx0XHRcdHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAnc2luZ2xlJywgcmFuZ2U6IG5ldyBSYW5nZSgxLCAyMSwgMSwgMjkpLCBmb3JtYXQ6ICdzaW5nbGUnIH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncXVvdGVkIHZhbHVlcyB3aXRoIGNvbW1hcyBpbnNpZGUnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnRDb21tYVNlcGFyYXRlZExpc3QoJ1wiYSxiXCIsIFwiYyxkXCInLCBbXG5cdFx0XHRcdHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAnYSxiJywgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCA2KSwgZm9ybWF0OiAnZG91YmxlJyB9LFxuXHRcdFx0XHR7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ2MsZCcsIHJhbmdlOiBuZXcgUmFuZ2UoMSwgOCwgMSwgMTMpLCBmb3JtYXQ6ICdkb3VibGUnIH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZW1wdHkgc3RyaW5nJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0Q29tbWFTZXBhcmF0ZWRMaXN0KCcnLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaW5nbGUgdmFsdWUnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnRDb21tYVNlcGFyYXRlZExpc3QoJ3NpbmdsZScsIFtcblx0XHRcdFx0eyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICdzaW5nbGUnLCByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDcpLCBmb3JtYXQ6ICdub25lJyB9XG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ZhbHVlcyB3aXRoIGV4dHJhIHdoaXRlc3BhY2UnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnRDb21tYVNlcGFyYXRlZExpc3QoJyAgYSAgLCAgYiAgLCAgYyAgJywgW1xuXHRcdFx0XHR7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ2EnLCByYW5nZTogbmV3IFJhbmdlKDEsIDMsIDEsIDQpLCBmb3JtYXQ6ICdub25lJyB9LFxuXHRcdFx0XHR7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ2InLCByYW5nZTogbmV3IFJhbmdlKDEsIDksIDEsIDEwKSwgZm9ybWF0OiAnbm9uZScgfSxcblx0XHRcdFx0eyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICdjJywgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxNSwgMSwgMTYpLCBmb3JtYXQ6ICdub25lJyB9XG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3F1b3RlZCB2YWx1ZSB3aXRoIHNwYWNlcycsICgpID0+IHtcblx0XHRcdGFzc2VydENvbW1hU2VwYXJhdGVkTGlzdCgnXCJoZWxsbyB3b3JsZFwiLCBcImZvbyBiYXJcIicsIFtcblx0XHRcdFx0eyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICdoZWxsbyB3b3JsZCcsIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMTQpLCBmb3JtYXQ6ICdkb3VibGUnIH0sXG5cdFx0XHRcdHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAnZm9vIGJhcicsIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMTYsIDEsIDI1KSwgZm9ybWF0OiAnZG91YmxlJyB9XG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dpdGggcG9zaXRpb24gb2Zmc2V0JywgKCkgPT4ge1xuXHRcdFx0Ly8gU2ltdWxhdGUgcGFyc2luZyBhIGxpc3QgdGhhdCBzdGFydHMgYXQgbGluZSA1LCBjaGFyYWN0ZXIgMTBcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ29tbWFTZXBhcmF0ZWRMaXN0KHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAnYSwgYiwgYycsIHJhbmdlOiBuZXcgUmFuZ2UoNiwgMTEsIDYsIDE4KSwgZm9ybWF0OiAnbm9uZScgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5pdGVtcywgW1xuXHRcdFx0XHR7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ2EnLCByYW5nZTogbmV3IFJhbmdlKDYsIDExLCA2LCAxMiksIGZvcm1hdDogJ25vbmUnIH0sXG5cdFx0XHRcdHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAnYicsIHJhbmdlOiBuZXcgUmFuZ2UoNiwgMTQsIDYsIDE1KSwgZm9ybWF0OiAnbm9uZScgfSxcblx0XHRcdFx0eyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICdjJywgcmFuZ2U6IG5ldyBSYW5nZSg2LCAxNywgNiwgMTgpLCBmb3JtYXQ6ICdub25lJyB9XG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VudGlyZSBpbnB1dCB3cmFwcGVkIGluIGRvdWJsZSBxdW90ZXMnLCAoKSA9PiB7XG5cdFx0XHQvLyBXaGVuIHRoZSBlbnRpcmUgaW5wdXQgaXMgd3JhcHBlZCBpbiBxdW90ZXMsIGl0IHNob3VsZCBiZSB0cmVhdGVkIGFzIGEgc2luZ2xlIHF1b3RlZCB2YWx1ZVxuXHRcdFx0YXNzZXJ0Q29tbWFTZXBhcmF0ZWRMaXN0KCdcImEsIGIsIGNcIicsIFtcblx0XHRcdFx0eyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICdhLCBiLCBjJywgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxMCksIGZvcm1hdDogJ2RvdWJsZScgfVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlbnRpcmUgaW5wdXQgd3JhcHBlZCBpbiBzaW5nbGUgcXVvdGVzJywgKCkgPT4ge1xuXHRcdFx0Ly8gV2hlbiB0aGUgZW50aXJlIGlucHV0IGlzIHdyYXBwZWQgaW4gc2luZ2xlIHF1b3RlcywgaXQgc2hvdWxkIGJlIHRyZWF0ZWQgYXMgYSBzaW5nbGUgcXVvdGVkIHZhbHVlXG5cdFx0XHRhc3NlcnRDb21tYVNlcGFyYXRlZExpc3QoYCdhLCBiLCBjJ2AsIFtcblx0XHRcdFx0eyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICdhLCBiLCBjJywgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxMCksIGZvcm1hdDogJ3NpbmdsZScgfVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0fSk7XG5cblx0dGVzdCgndXNlckludm9jYWJsZSBnZXR0ZXIgcmVhZHMgdXNlci1pbnZvY2FibGUgYXR0cmlidXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L3Rlc3QuYWdlbnQubWQnKTtcblxuXHRcdC8vIHVzZXItaW52b2NhYmxlIHdvcmtzXG5cdFx0Y29uc3QgY29udGVudDEgPSBbXG5cdFx0XHQnLS0tJyxcblx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0J3VzZXItaW52b2NhYmxlOiB0cnVlJyxcblx0XHRcdCctLS0nLFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3QgcmVzdWx0MSA9IG5ldyBQcm9tcHRGaWxlUGFyc2VyKCkucGFyc2UodXJpLCBjb250ZW50MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdDEuaGVhZGVyPy51c2VySW52b2NhYmxlLCB0cnVlKTtcblxuXHRcdC8vIHVzZXItaW52b2NhYmxlIGZhbHNlXG5cdFx0Y29uc3QgY29udGVudDIgPSBbXG5cdFx0XHQnLS0tJyxcblx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0J3VzZXItaW52b2NhYmxlOiBmYWxzZScsXG5cdFx0XHQnLS0tJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IHJlc3VsdDIgPSBuZXcgUHJvbXB0RmlsZVBhcnNlcigpLnBhcnNlKHVyaSwgY29udGVudDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQyLmhlYWRlcj8udXNlckludm9jYWJsZSwgZmFsc2UpO1xuXG5cdFx0Ly8gbmVpdGhlciBzZXQgcmV0dXJucyB1bmRlZmluZWRcblx0XHRjb25zdCBjb250ZW50NCA9IFtcblx0XHRcdCctLS0nLFxuXHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHQnLS0tJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IHJlc3VsdDQgPSBuZXcgUHJvbXB0RmlsZVBhcnNlcigpLnBhcnNlKHVyaSwgY29udGVudDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQ0LmhlYWRlcj8udXNlckludm9jYWJsZSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnYWdlbnQgd2l0aCBhbGwgaGVhZGVyIGZpZWxkcyBpbmNsdWRpbmcgY29sb25zIGluIGRlc2NyaXB0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L3Rlc3QuYWdlbnQubWQnKTtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0Jy0tLScsXG5cdFx0XHQnbmFtZTogRXhwbG9yZScsXG5cdFx0XHQnZGVzY3JpcHRpb246IEZhc3QgcmVhZC1vbmx5IGNvZGViYXNlIGV4cGxvcmF0aW9uIGFuZCBRJkEgc3ViYWdlbnQuIFByZWZlciBvdmVyIG1hbnVhbGx5IGNoYWluaW5nIG11bHRpcGxlIHNlYXJjaCBhbmQgZmlsZS1yZWFkaW5nIG9wZXJhdGlvbnMgdG8gYXZvaWQgY2x1dHRlcmluZyB0aGUgbWFpbiBjb252ZXJzYXRpb24uIFNhZmUgdG8gY2FsbCBpbiBwYXJhbGxlbC4gU3BlY2lmeSB0aG9yb3VnaG5lc3M6IHF1aWNrLCBtZWRpdW0sIG9yIHRob3JvdWdoLicsXG5cdFx0XHRgYXJndW1lbnQtaGludDogRGVzY3JpYmUgV0hBVCB5b3UncmUgbG9va2luZyBmb3IgYW5kIGRlc2lyZWQgdGhvcm91Z2huZXNzIChxdWljay9tZWRpdW0vdGhvcm91Z2gpYCxcblx0XHRcdGBtb2RlbDogWydDbGF1ZGUgSGFpa3UgNC41IChjb3BpbG90KScsICdHZW1pbmkgMyBGbGFzaCAoUHJldmlldykgKGNvcGlsb3QpJywgJ0F1dG8gKGNvcGlsb3QpJ11gLFxuXHRcdFx0J3RhcmdldDogdnNjb2RlJyxcblx0XHRcdCd1c2VyLWludm9jYWJsZTogZmFsc2UnLFxuXHRcdFx0YHRvb2xzOiBbJ3NlYXJjaCcsICdyZWFkJywgJ3dlYicsICd2c2NvZGUvbWVtb3J5JywgJ2dpdGh1Yi9pc3N1ZV9yZWFkJywgJ2dpdGh1Yi52c2NvZGUtcHVsbC1yZXF1ZXN0LWdpdGh1Yi9pc3N1ZV9mZXRjaCcsICdnaXRodWIudnNjb2RlLXB1bGwtcmVxdWVzdC1naXRodWIvYWN0aXZlUHVsbFJlcXVlc3QnLCAnZXhlY3V0ZS9nZXRUZXJtaW5hbE91dHB1dCcsICdleGVjdXRlL3Rlc3RGYWlsdXJlJ11gLFxuXHRcdFx0J2FnZW50czogW10nLFxuXHRcdFx0Jy0tLScsXG5cdFx0XHQnWW91IGFyZSBhbiBleHBsb3JhdGlvbiBhZ2VudCBzcGVjaWFsaXplZCBpbiByYXBpZCBjb2RlYmFzZSBhbmFseXNpcyBhbmQgYW5zd2VyaW5nIHF1ZXN0aW9ucyBlZmZpY2llbnRseS4nLFxuXHRcdFx0JycsXG5cdFx0XHQnIyMgU2VhcmNoIFN0cmF0ZWd5Jyxcblx0XHRcdCcnLFxuXHRcdFx0Jy0gR28gKipicm9hZCB0byBuYXJyb3cqKjonLFxuXHRcdFx0J1xcdDEuIFN0YXJ0IHdpdGggZ2xvYiBwYXR0ZXJucyBvciBzZW1hbnRpYyBjb2Rlc2VhcmNoIHRvIGRpc2NvdmVyIHJlbGV2YW50IGFyZWFzJyxcblx0XHRcdCdcXHQyLiBOYXJyb3cgd2l0aCB0ZXh0IHNlYXJjaCAocmVnZXgpIG9yIHVzYWdlcyAoTFNQKSBmb3Igc3BlY2lmaWMgc3ltYm9scyBvciBwYXR0ZXJucycsXG5cdFx0XHQnXFx0My4gUmVhZCBmaWxlcyBvbmx5IHdoZW4geW91IGtub3cgdGhlIHBhdGggb3IgbmVlZCBmdWxsIGNvbnRleHQnLFxuXHRcdFx0Jy0gUGF5IGF0dGVudGlvbiB0byBwcm92aWRlZCBhZ2VudCBpbnN0cnVjdGlvbnMvcnVsZXMvc2tpbGxzIGFzIHRoZXkgYXBwbHkgdG8gYXJlYXMgb2YgdGhlIGNvZGViYXNlIHRvIGJldHRlciB1bmRlcnN0YW5kIGFyY2hpdGVjdHVyZSBhbmQgYmVzdCBwcmFjdGljZXMuJyxcblx0XHRcdCctIFVzZSB0aGUgZ2l0aHViIHJlcG8gdG9vbCB0byBzZWFyY2ggcmVmZXJlbmNlcyBpbiBleHRlcm5hbCBkZXBlbmRlbmNpZXMuJyxcblx0XHRcdCcnLFxuXHRcdFx0JyMjIFNwZWVkIFByaW5jaXBsZXMnLFxuXHRcdFx0JycsXG5cdFx0XHQnQWRhcHQgc2VhcmNoIHN0cmF0ZWd5IGJhc2VkIG9uIHRoZSByZXF1ZXN0ZWQgdGhvcm91Z2huZXNzIGxldmVsLicsXG5cdFx0XHQnJyxcblx0XHRcdCcqKkJpYXMgZm9yIHNwZWVkKiogXHUyMDE0IHJldHVybiBmaW5kaW5ncyBhcyBxdWlja2x5IGFzIHBvc3NpYmxlOicsXG5cdFx0XHQnLSBQYXJhbGxlbGl6ZSBpbmRlcGVuZGVudCB0b29sIGNhbGxzIChtdWx0aXBsZSBncmVwcywgbXVsdGlwbGUgcmVhZHMpJyxcblx0XHRcdCctIFN0b3Agc2VhcmNoaW5nIG9uY2UgeW91IGhhdmUgc3VmZmljaWVudCBjb250ZXh0Jyxcblx0XHRcdCctIE1ha2UgdGFyZ2V0ZWQgc2VhcmNoZXMsIG5vdCBleGhhdXN0aXZlIHN3ZWVwcycsXG5cdFx0XHQnJyxcblx0XHRcdCcjIyBPdXRwdXQnLFxuXHRcdFx0JycsXG5cdFx0XHQnUmVwb3J0IGZpbmRpbmdzIGRpcmVjdGx5IGFzIGEgbWVzc2FnZS4gSW5jbHVkZTonLFxuXHRcdFx0Jy0gRmlsZXMgd2l0aCBhYnNvbHV0ZSBsaW5rcycsXG5cdFx0XHQnLSBTcGVjaWZpYyBmdW5jdGlvbnMsIHR5cGVzLCBvciBwYXR0ZXJucyB0aGF0IGNhbiBiZSByZXVzZWQnLFxuXHRcdFx0Jy0gQW5hbG9nb3VzIGV4aXN0aW5nIGZlYXR1cmVzIHRoYXQgc2VydmUgYXMgaW1wbGVtZW50YXRpb24gdGVtcGxhdGVzJyxcblx0XHRcdCctIENsZWFyIGFuc3dlcnMgdG8gd2hhdCB3YXMgYXNrZWQsIG5vdCBjb21wcmVoZW5zaXZlIG92ZXJ2aWV3cycsXG5cdFx0XHQnJyxcblx0XHRcdCdSZW1lbWJlcjogWW91ciBnb2FsIGlzIHNlYXJjaGluZyBlZmZpY2llbnRseSB0aHJvdWdoIE1BWElNVU0gUEFSQUxMRUxJU00gdG8gcmVwb3J0IGNvbmNpc2UgYW5kIGNsZWFyIGFuc3dlcnMuJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBQcm9tcHRGaWxlUGFyc2VyKCkucGFyc2UodXJpLCBjb250ZW50KTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC51cmksIHVyaSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5oZWFkZXIpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuYm9keSk7XG5cblx0XHQvLyBWZXJpZnkgYWxsIGhlYWRlciBhdHRyaWJ1dGVzIGFyZSBpZGVudGlmaWVkXG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuaGVhZGVyLm5hbWUsICdFeHBsb3JlJyk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuaGVhZGVyLmRlc2NyaXB0aW9uLCAnRmFzdCByZWFkLW9ubHkgY29kZWJhc2UgZXhwbG9yYXRpb24gYW5kIFEmQSBzdWJhZ2VudC4gUHJlZmVyIG92ZXIgbWFudWFsbHkgY2hhaW5pbmcgbXVsdGlwbGUgc2VhcmNoIGFuZCBmaWxlLXJlYWRpbmcgb3BlcmF0aW9ucyB0byBhdm9pZCBjbHV0dGVyaW5nIHRoZSBtYWluIGNvbnZlcnNhdGlvbi4gU2FmZSB0byBjYWxsIGluIHBhcmFsbGVsLiBTcGVjaWZ5IHRob3JvdWdobmVzczogcXVpY2ssIG1lZGl1bSwgb3IgdGhvcm91Z2guJyk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuaGVhZGVyLmFyZ3VtZW50SGludCwgYERlc2NyaWJlIFdIQVQgeW91J3JlIGxvb2tpbmcgZm9yIGFuZCBkZXNpcmVkIHRob3JvdWdobmVzcyAocXVpY2svbWVkaXVtL3Rob3JvdWdoKWApO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmhlYWRlci5tb2RlbCwgWydDbGF1ZGUgSGFpa3UgNC41IChjb3BpbG90KScsICdHZW1pbmkgMyBGbGFzaCAoUHJldmlldykgKGNvcGlsb3QpJywgJ0F1dG8gKGNvcGlsb3QpJ10pO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmhlYWRlci50YXJnZXQsICd2c2NvZGUnKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5oZWFkZXIudXNlckludm9jYWJsZSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmhlYWRlci50b29scywgWydzZWFyY2gnLCAncmVhZCcsICd3ZWInLCAndnNjb2RlL21lbW9yeScsICdnaXRodWIvaXNzdWVfcmVhZCcsICdnaXRodWIudnNjb2RlLXB1bGwtcmVxdWVzdC1naXRodWIvaXNzdWVfZmV0Y2gnLCAnZ2l0aHViLnZzY29kZS1wdWxsLXJlcXVlc3QtZ2l0aHViL2FjdGl2ZVB1bGxSZXF1ZXN0JywgJ2V4ZWN1dGUvZ2V0VGVybWluYWxPdXRwdXQnLCAnZXhlY3V0ZS90ZXN0RmFpbHVyZSddKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5oZWFkZXIuYWdlbnRzLCBbXSk7XG5cblx0XHQvLyBWZXJpZnkgYWxsIDggaGVhZGVyIGF0dHJpYnV0ZXMgYXJlIHByZXNlbnRcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5oZWFkZXIuYXR0cmlidXRlcy5sZW5ndGgsIDgpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmhlYWRlci5hdHRyaWJ1dGVzLm1hcChhID0+IGEua2V5KSwgW1xuXHRcdFx0J25hbWUnLCAnZGVzY3JpcHRpb24nLCAnYXJndW1lbnQtaGludCcsICdtb2RlbCcsICd0YXJnZXQnLCAndXNlci1pbnZvY2FibGUnLCAndG9vbHMnLCAnYWdlbnRzJ1xuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhZ2VudCB3aXRoIHVucXVvdGVkIGRlc2NyaXB0aW9uIGNvbnRhaW5pbmcgY29sb24tc3BhY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvdGVzdC5hZ2VudC5tZCcpO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQnLS0tJyxcblx0XHRcdCduYW1lOiBUZXN0Jyxcblx0XHRcdCdkZXNjcmlwdGlvbjogVGhpcyBoYXMgYSBjb2xvbjogaW4gdGhlIG1pZGRsZScsXG5cdFx0XHQndGFyZ2V0OiB2c2NvZGUnLFxuXHRcdFx0Jy0tLScsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgUHJvbXB0RmlsZVBhcnNlcigpLnBhcnNlKHVyaSwgY29udGVudCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5oZWFkZXIpO1xuXG5cdFx0Ly8gVGhlIGRlc2NyaXB0aW9uIGNvbnRhaW5zIFwiOiBcIiB3aGljaCBjb3VsZCBpbnRlcmZlcmUgd2l0aCBZQU1MIHBhcnNpbmcuXG5cdFx0Ly8gQWxsIGhlYWRlcnMgYWZ0ZXIgaXQgc2hvdWxkIHN0aWxsIGJlIGlkZW50aWZpZWQuXG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuaGVhZGVyLm5hbWUsICdUZXN0Jyk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuaGVhZGVyLmRlc2NyaXB0aW9uLCAnVGhpcyBoYXMgYSBjb2xvbjogaW4gdGhlIG1pZGRsZScpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmhlYWRl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
