import assert from "assert";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { SYNCED_CUSTOMIZATION_SCHEME } from "../../common/agentHostFileSystemService.js";
import { CompletionItemKind } from "../../common/state/protocol/commands.js";
import { CustomizationEnablementKind, CustomizationLoadStatus, CustomizationType, McpServerStatus, MessageAttachmentKind } from "../../common/state/protocol/state.js";
import { CopilotSlashCommandCompletionProvider, parseLeadingSlashCommand } from "../../node/copilot/copilotSlashCommandCompletionProvider.js";
function runtimeOnly(items) {
  return items.filter((i) => i.attachment?._meta?.action === void 0);
}
suite("CopilotSlashCommandCompletionProvider", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("parseLeadingSlashCommand", () => {
    test("matches lone /plan", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/plan"), { command: "plan", rest: "", rawRest: "" });
    });
    test("matches lone /compact", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/compact"), { command: "compact", rest: "", rawRest: "" });
    });
    test("matches lone /research", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/research"), { command: "research", rest: "", rawRest: "" });
    });
    test("captures trailing text after a space for /research", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/research How does React work?"), { command: "research", rest: "How does React work?", rawRest: "How does React work?" });
    });
    test("matches lone /rubber-duck", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/rubber-duck"), { command: "rubber-duck", rest: "", rawRest: "" });
    });
    test("matches lone /env", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/env"), { command: "env", rest: "", rawRest: "" });
    });
    test("matches lone /review", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/review"), { command: "review", rest: "", rawRest: "" });
    });
    test("matches lone /security-review", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/security-review"), { command: "security-review", rest: "", rawRest: "" });
    });
    test("captures trailing text after a space for /rubber-duck", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/rubber-duck review my approach"), { command: "rubber-duck", rest: "review my approach", rawRest: "review my approach" });
    });
    test("captures trailing text after a space for /env", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/env ignored input"), { command: "env", rest: "ignored input", rawRest: "ignored input" });
    });
    test("captures trailing text after a space for /review", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/review focus on tests"), { command: "review", rest: "focus on tests", rawRest: "focus on tests" });
    });
    test("captures trailing text after a space for /security-review", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/security-review focus on auth"), { command: "security-review", rest: "focus on auth", rawRest: "focus on auth" });
    });
    test("parses arbitrary slash command tokens", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/rubber-duck-extra"), { command: "rubber-duck-extra", rest: "", rawRest: "" });
    });
    test("preserves multiline command input as rawRest", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/foo first line\nsecond line"), { command: "foo", rest: "first line\nsecond line", rawRest: "first line\nsecond line" });
    });
    test("trims rest while retaining rawRest", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/foo   padded  "), { command: "foo", rest: "padded", rawRest: "padded  " });
    });
    test("captures trailing text after a space", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/plan build a hello world"), { command: "plan", rest: "build a hello world", rawRest: "build a hello world" });
    });
    test("captures trailing text after a space for /compact", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/compact some text"), { command: "compact", rest: "some text", rawRest: "some text" });
    });
    test("rejects leading whitespace", () => {
      assert.strictEqual(parseLeadingSlashCommand(" /compact"), void 0);
    });
    test("accepts uppercase command tokens", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/PLAN"), { command: "PLAN", rest: "", rawRest: "" });
    });
  });
  suite("provideCompletionItems", () => {
    const runtimeCommands = [
      { name: "plan", description: "Runtime plan", kind: "builtin", allowDuringAgentExecution: true, input: { hint: "task" } },
      { name: "compact", description: "Runtime compact", kind: "builtin", allowDuringAgentExecution: true },
      { name: "research", description: "Runtime research", kind: "builtin", allowDuringAgentExecution: true, input: { hint: "query" } },
      { name: "rubber-duck", description: "Runtime rubber-duck", kind: "builtin", allowDuringAgentExecution: true, input: { hint: "review prompt" } },
      { name: "env", description: "Runtime env", kind: "builtin", allowDuringAgentExecution: true },
      { name: "review", description: "Runtime review", kind: "builtin", allowDuringAgentExecution: true, input: { hint: "scope" } },
      { name: "security-review", description: "Runtime security review", kind: "builtin", allowDuringAgentExecution: true, input: { hint: "scope" } }
    ];
    const provider = new CopilotSlashCommandCompletionProvider("copilotcli", {
      isRubberDuckEnabled: () => true,
      getRuntimeSlashCommands: async () => runtimeCommands,
      getSessionCustomizations: async () => []
    });
    const session = "copilotcli:/abc";
    async function run(text, offset = text.length) {
      return provider.provideCompletionItems({ kind: CompletionItemKind.UserMessage, channel: session, text, offset }, CancellationToken.None);
    }
    test("returns nothing for non-copilotcli scheme", async () => {
      const items = await provider.provideCompletionItems({
        kind: CompletionItemKind.UserMessage,
        channel: "claude:/abc",
        text: "/",
        offset: 1
      }, CancellationToken.None);
      assert.deepStrictEqual(items, []);
    });
    test('returns all runtime items for lone "/" (config-action items filtered)', async () => {
      const items = await run("/");
      assert.deepStrictEqual(runtimeOnly(items).map((i) => i.insertText), ["/compact ", "/research ", "/rubber-duck ", "/env ", "/review ", "/security-review "].sort());
    });
    test("injects config-action items (permission/mode toggles) for a leading slash", async () => {
      const items = await run("/");
      const byLabel = new Map(items.filter((i) => i.attachment?._meta?.action !== void 0).map((i) => [i.attachment?.label, i]));
      assert.ok(byLabel.has("/yolo on"));
      assert.ok(byLabel.has("/autopilot on"));
      assert.strictEqual(byLabel.get("/autopilot")?.insertText, "/autopilot ");
    });
    test('filters to /plan when "/p" typed', async () => {
      const items = await run("/p");
      assert.deepStrictEqual(items.map((i) => i.insertText), ["/plan "]);
    });
    test('filters to /compact when "/c" typed', async () => {
      const items = await run("/c");
      assert.deepStrictEqual(items.map((i) => i.insertText), ["/compact "]);
    });
    test('fuzzy matches /compact when "/cc" typed', async () => {
      const items = await run("/cc");
      assert.deepStrictEqual(items.map((i) => i.insertText), ["/compact "]);
    });
    test('filters to /env when "/e" typed and runtime command exists', async () => {
      const items = await run("/e");
      assert.deepStrictEqual(items.map((i) => i.insertText), ["/env "]);
    });
    test('filters to /research and /rubber-duck when "/r" typed', async () => {
      const items = await run("/r");
      assert.deepStrictEqual(items.map((i) => i.insertText), [
        "/research ",
        "/review ",
        "/rubber-duck "
      ].sort());
    });
    test('filters to /security-review when "/s" typed', async () => {
      const items = await run("/s");
      assert.deepStrictEqual(items.map((i) => i.insertText), ["/security-review "]);
    });
    test("returns nothing when /word does not match any command prefix", async () => {
      const items = await run("/zz");
      assert.deepStrictEqual(items, []);
    });
    test("returns nothing when input does not start with /", async () => {
      const items = await run("hello /pl", 9);
      assert.deepStrictEqual(items, []);
    });
    test("returns nothing when cursor is past the leading word", async () => {
      const items = await run("/plan ", 6);
      assert.deepStrictEqual(items, []);
    });
    test("range covers only the leading slash word", async () => {
      const items = await run("/p extra text", 2);
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0].rangeStart, 0);
      assert.strictEqual(items[0].rangeEnd, 2);
    });
    test("attachment is Simple with command + description meta", async () => {
      const items = await run("/");
      assert.deepStrictEqual(runtimeOnly(items).map((item) => ({ insertText: item.insertText, type: item.attachment?.type, meta: item.attachment?._meta })), [
        {
          insertText: "/compact ",
          type: MessageAttachmentKind.Simple,
          meta: {
            command: "compact",
            description: "Runtime compact"
          }
        },
        {
          insertText: "/env ",
          type: MessageAttachmentKind.Simple,
          meta: {
            command: "env",
            description: "Runtime env"
          }
        },
        {
          insertText: "/research ",
          type: MessageAttachmentKind.Simple,
          meta: {
            command: "research",
            description: "Runtime research",
            argumentHint: "query"
          }
        },
        {
          insertText: "/review ",
          type: MessageAttachmentKind.Simple,
          meta: {
            command: "review",
            description: "Runtime review",
            argumentHint: "scope"
          }
        },
        {
          insertText: "/rubber-duck ",
          type: MessageAttachmentKind.Simple,
          meta: {
            command: "rubber-duck",
            description: "Runtime rubber-duck",
            argumentHint: "review prompt"
          }
        },
        {
          insertText: "/security-review ",
          type: MessageAttachmentKind.Simple,
          meta: {
            command: "security-review",
            description: "Runtime security review",
            argumentHint: "scope"
          }
        }
      ]);
    });
    test("omits /rubber-duck when not enabled", async () => {
      const gated = new CopilotSlashCommandCompletionProvider("copilotcli", {
        isRubberDuckEnabled: () => false,
        getRuntimeSlashCommands: async () => runtimeCommands,
        getSessionCustomizations: async () => []
      });
      const items = await gated.provideCompletionItems({
        kind: CompletionItemKind.UserMessage,
        channel: session,
        text: "/",
        offset: 1
      }, CancellationToken.None);
      assert.deepStrictEqual(runtimeOnly(items).map((i) => i.insertText), [
        "/compact ",
        "/env ",
        "/research ",
        "/review ",
        "/security-review "
      ].sort());
    });
    test("returns no completion items when runtime command list is empty", async () => {
      const gated = new CopilotSlashCommandCompletionProvider("copilotcli", {
        isRubberDuckEnabled: () => true,
        getRuntimeSlashCommands: async () => [],
        getSessionCustomizations: async () => []
      });
      const items = await gated.provideCompletionItems({
        kind: CompletionItemKind.UserMessage,
        channel: session,
        text: "/",
        offset: 1
      }, CancellationToken.None);
      assert.deepStrictEqual(runtimeOnly(items), []);
    });
    test("filters out runtime commands omitted from the catalog", async () => {
      const gated = new CopilotSlashCommandCompletionProvider("copilotcli", {
        isRubberDuckEnabled: () => true,
        getRuntimeSlashCommands: async () => runtimeCommands.filter((command) => command.name !== "env"),
        getSessionCustomizations: async () => []
      });
      const items = await gated.provideCompletionItems({
        kind: CompletionItemKind.UserMessage,
        channel: session,
        text: "/",
        offset: 1
      }, CancellationToken.None);
      assert.deepStrictEqual(runtimeOnly(items).map((i) => i.insertText), [
        "/compact ",
        "/research ",
        "/review ",
        "/rubber-duck ",
        "/security-review "
      ].sort());
    });
    test("includes runtime SDK commands in completion results", async () => {
      const gated = new CopilotSlashCommandCompletionProvider("copilotcli", {
        isRubberDuckEnabled: () => true,
        getRuntimeSlashCommands: async () => [{
          name: "focus",
          description: "Focus on specific files",
          kind: "builtin",
          allowDuringAgentExecution: true,
          input: { hint: "scope" }
        }],
        getSessionCustomizations: async () => []
      });
      const items = await gated.provideCompletionItems({
        kind: CompletionItemKind.UserMessage,
        channel: session,
        text: "/f",
        offset: 2
      }, CancellationToken.None);
      assert.deepStrictEqual(items.map((i) => i.insertText), ["/focus "]);
    });
    test("config-action commands shadow runtime commands of the same name", async () => {
      const gated = new CopilotSlashCommandCompletionProvider("copilotcli", {
        isRubberDuckEnabled: () => true,
        getRuntimeSlashCommands: async () => [
          { name: "plan", description: "runtime plan", kind: "builtin", allowDuringAgentExecution: true, input: { hint: "task" } },
          { name: "compact", description: "runtime compact", kind: "builtin", allowDuringAgentExecution: true },
          { name: "runtime-only", description: "runtime only", kind: "client", allowDuringAgentExecution: true }
        ],
        getSessionCustomizations: async () => []
      });
      const items = await gated.provideCompletionItems({
        kind: CompletionItemKind.UserMessage,
        channel: session,
        text: "/",
        offset: 1
      }, CancellationToken.None);
      assert.deepStrictEqual(runtimeOnly(items).map((i) => i.insertText), ["/compact ", "/runtime-only "].sort());
      const planItem = items.find((i) => i.insertText === "/plan ");
      assert.ok(planItem?.attachment?._meta?.action !== void 0);
    });
    test("uses runtime input metadata to determine trailing space insertion", async () => {
      const gated = new CopilotSlashCommandCompletionProvider("copilotcli", {
        isRubberDuckEnabled: () => true,
        getRuntimeSlashCommands: async () => [
          { name: "no-input", description: "No input", kind: "builtin", allowDuringAgentExecution: true },
          { name: "needs-input", description: "Needs input", kind: "builtin", allowDuringAgentExecution: true, input: { hint: "value" } }
        ],
        getSessionCustomizations: async () => []
      });
      const withInput = await gated.provideCompletionItems({
        kind: CompletionItemKind.UserMessage,
        channel: session,
        text: "/n",
        offset: 2
      }, CancellationToken.None);
      assert.deepStrictEqual(withInput.map((i) => i.insertText), ["/no-input ", "/needs-input "].sort());
    });
    test("expands input choices into one item per choice", async () => {
      const gated = new CopilotSlashCommandCompletionProvider("copilotcli", {
        isRubberDuckEnabled: () => true,
        getRuntimeSlashCommands: async () => [
          { name: "toggle", description: "Toggle a feature on or off", kind: "builtin", allowDuringAgentExecution: true, input: { hint: "", choices: [{ name: "on", description: "Turn the feature on" }, { name: "off", description: "Turn the feature off" }] } }
        ],
        getSessionCustomizations: async () => []
      });
      const items = await gated.provideCompletionItems({
        kind: CompletionItemKind.UserMessage,
        channel: session,
        text: "/t",
        offset: 2
      }, CancellationToken.None);
      assert.deepStrictEqual(items.map((item) => ({ insertText: item.insertText, meta: item.attachment?._meta })), [
        { insertText: "/toggle off ", meta: { command: "toggle", description: "Turn the feature off" } },
        { insertText: "/toggle on ", meta: { command: "toggle", description: "Turn the feature on" } }
      ]);
    });
    test("includes a bare command item when a choice has an empty name", async () => {
      const gated = new CopilotSlashCommandCompletionProvider("copilotcli", {
        isRubberDuckEnabled: () => true,
        getRuntimeSlashCommands: async () => [
          { name: "toggle", description: "Toggle a feature on or off", kind: "builtin", allowDuringAgentExecution: true, input: { hint: "", choices: [{ name: "", description: "Show the current state" }, { name: "on", description: "Turn on" }, { name: "off", description: "Turn off" }] } }
        ],
        getSessionCustomizations: async () => []
      });
      const items = await gated.provideCompletionItems({
        kind: CompletionItemKind.UserMessage,
        channel: session,
        text: "/t",
        offset: 2
      }, CancellationToken.None);
      assert.deepStrictEqual(items.map((i) => i.insertText), ["/toggle ", "/toggle off ", "/toggle on "]);
    });
    test("surfaces the free-text hint as an argument hint when there are no choices", async () => {
      const gated = new CopilotSlashCommandCompletionProvider("copilotcli", {
        isRubberDuckEnabled: () => true,
        getRuntimeSlashCommands: async () => [
          { name: "toggle", description: "Toggle a feature on or off", kind: "builtin", allowDuringAgentExecution: true, input: { hint: "[on|off]" } }
        ],
        getSessionCustomizations: async () => []
      });
      const items = await gated.provideCompletionItems({
        kind: CompletionItemKind.UserMessage,
        channel: session,
        text: "/t",
        offset: 2
      }, CancellationToken.None);
      assert.deepStrictEqual(items.map((item) => ({ insertText: item.insertText, meta: item.attachment?._meta })), [
        { insertText: "/toggle ", meta: { command: "toggle", description: "Toggle a feature on or off", argumentHint: "[on|off]" } }
      ]);
    });
    test("passes raw session id to runtime command listing", async () => {
      let seen;
      const gated = new CopilotSlashCommandCompletionProvider("copilotcli", {
        isRubberDuckEnabled: () => true,
        getRuntimeSlashCommands: async (id) => {
          seen = id;
          return [{ name: "focus", kind: "builtin", description: "Focus", allowDuringAgentExecution: true }];
        },
        getSessionCustomizations: async () => []
      });
      await gated.provideCompletionItems({
        kind: CompletionItemKind.UserMessage,
        channel: "copilotcli:/abc",
        text: "/f",
        offset: 2
      }, CancellationToken.None);
      assert.strictEqual(seen, "abc");
    });
  });
  suite("runtime skill completions", () => {
    const session = "copilotcli:/abc";
    function skill(name, description) {
      return {
        type: CustomizationType.Skill,
        id: `file:///skills/${name}/SKILL.md`,
        uri: `file:///skills/${name}/SKILL.md`,
        name,
        ...description !== void 0 ? { description } : {}
      };
    }
    function plugin(name, children, enabled = true) {
      return {
        type: CustomizationType.Plugin,
        id: `file:///plugins/${name}`,
        uri: `file:///plugins/${name}`,
        name,
        ...enabled ? {} : {
          // TODO: Step 2 selects the persisted enablement scope.
          enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }]
        },
        load: { kind: CustomizationLoadStatus.Loaded },
        ...children ? { children: [...children] } : {}
      };
    }
    function syncedPlugin(name, children) {
      return {
        ...plugin(name, children),
        id: `${SYNCED_CUSTOMIZATION_SCHEME}:/plugins/${name}`,
        uri: `${SYNCED_CUSTOMIZATION_SCHEME}:/plugins/${name}`
      };
    }
    function createProvider(runtimeCommands, customizations = []) {
      return new CopilotSlashCommandCompletionProvider("copilotcli", {
        isRubberDuckEnabled: () => true,
        getRuntimeSlashCommands: async () => runtimeCommands,
        getSessionCustomizations: async () => customizations
      });
    }
    async function run(provider, text, offset = text.length) {
      return provider.provideCompletionItems({ kind: CompletionItemKind.UserMessage, channel: session, text, offset }, CancellationToken.None);
    }
    test("includes runtime skills that are not known local skills", async () => {
      const provider = createProvider([
        { name: "my-skill", description: "Runtime skill", kind: "skill", allowDuringAgentExecution: true }
      ]);
      const items = await run(provider, "/");
      assert.deepStrictEqual(runtimeOnly(items).map((i) => i.insertText), ["/my-skill "]);
    });
    test("excludes runtime skills that match a known plugin skill (with plugin prefix)", async () => {
      const provider = createProvider(
        [{ name: "my-plugin:my-skill", description: "Runtime skill", kind: "skill", allowDuringAgentExecution: true }],
        [plugin("my-plugin", [skill("my-skill")])]
      );
      const items = await run(provider, "/");
      assert.deepStrictEqual(runtimeOnly(items), []);
    });
    test("excludes runtime skills that match a known plugin skill with the same name (no prefix)", async () => {
      const provider = createProvider(
        [{ name: "monitor-pr", description: "Runtime skill", kind: "skill", allowDuringAgentExecution: true }],
        [plugin("monitor-pr", [skill("monitor-pr")])]
      );
      const items = await run(provider, "/");
      assert.deepStrictEqual(runtimeOnly(items), []);
    });
    test("excludes runtime skills that match a known synced plugin skill (no prefix)", async () => {
      const provider = createProvider(
        [{ name: "monitor-pr", description: "Runtime skill", kind: "skill", allowDuringAgentExecution: true }],
        [syncedPlugin("skills-bundle", [skill("monitor-pr")])]
      );
      const items = await run(provider, "/");
      assert.deepStrictEqual(runtimeOnly(items), []);
    });
    test("excludes prefixed synced-bundle runtime skills (real runtime shape)", async () => {
      const provider = createProvider(
        [{ name: "VS Code Synced Data:update-pr", description: "Runtime skill", kind: "skill", allowDuringAgentExecution: true }],
        [syncedPlugin("VS Code Synced Data", [skill("update-pr")])]
      );
      const items = await run(provider, "/");
      assert.deepStrictEqual(runtimeOnly(items), []);
    });
    test("keeps a prefixed synced-bundle skill whose bare name is a config action", async () => {
      const provider = createProvider(
        [{ name: "VS Code Synced Data:plan", description: "Runtime skill", kind: "skill", allowDuringAgentExecution: true }],
        [syncedPlugin("VS Code Synced Data", [skill("plan")])]
      );
      const items = await run(provider, "/");
      assert.deepStrictEqual(runtimeOnly(items).map((i) => i.insertText), ["/VS Code Synced Data:plan "]);
    });
    test("keeps a prefixed synced-bundle skill whose bare name collides with a non-skill runtime command", async () => {
      const provider = createProvider(
        [
          { name: "triage", description: "Built-in", kind: "builtin", allowDuringAgentExecution: true },
          { name: "VS Code Synced Data:triage", description: "Runtime skill", kind: "skill", allowDuringAgentExecution: true }
        ],
        [syncedPlugin("VS Code Synced Data", [skill("triage")])]
      );
      const items = await run(provider, "/");
      assert.ok(runtimeOnly(items).some((i) => i.insertText === "/VS Code Synced Data:triage "), "bundled triage skill should remain reachable");
    });
    test("does not strip real (non-synced) plugin prefixes when a synced bundle is present", async () => {
      const provider = createProvider(
        [{ name: "my-plugin:my-skill", description: "Runtime skill", kind: "skill", allowDuringAgentExecution: true }],
        [syncedPlugin("VS Code Synced Data", [skill("update-pr")]), plugin("my-plugin", [skill("my-skill")])]
      );
      const items = await run(provider, "/");
      assert.deepStrictEqual(runtimeOnly(items), []);
    });
    test("includes runtime skills whose name differs from the prefixed known skill candidate", async () => {
      const provider = createProvider(
        [{ name: "my-skill", description: "Runtime skill", kind: "skill", allowDuringAgentExecution: true }],
        [plugin("my-plugin", [skill("my-skill")])]
      );
      const items = await run(provider, "/");
      assert.deepStrictEqual(runtimeOnly(items).map((i) => i.insertText), ["/my-skill "]);
    });
    test("treats skills inside disabled containers as unknown", async () => {
      const provider = createProvider(
        [{ name: "my-plugin:my-skill", description: "Runtime skill", kind: "skill", allowDuringAgentExecution: true }],
        [plugin("my-plugin", [skill("my-skill")], false)]
      );
      const items = await run(provider, "/");
      assert.deepStrictEqual(runtimeOnly(items).map((i) => i.insertText), ["/my-plugin:my-skill "]);
    });
    test("ignores mcp server containers when computing known skills", async () => {
      const mcpServer = {
        type: CustomizationType.McpServer,
        id: "file:///mcp/my-skill",
        uri: "file:///mcp/my-skill",
        name: "my-skill",
        state: { kind: McpServerStatus.Ready }
      };
      const provider = createProvider(
        [{ name: "my-skill", description: "Runtime skill", kind: "skill", allowDuringAgentExecution: true }],
        [mcpServer]
      );
      const items = await run(provider, "/");
      assert.deepStrictEqual(runtimeOnly(items).map((i) => i.insertText), ["/my-skill "]);
    });
    test("surfaces the skill prompt hint as an argument hint", async () => {
      const provider = createProvider([
        { name: "my-skill", description: "Runtime skill", kind: "skill", allowDuringAgentExecution: true, input: { hint: "do stuff" } }
      ]);
      const items = await run(provider, "/");
      assert.deepStrictEqual(runtimeOnly(items).map((item) => ({ insertText: item.insertText, type: item.attachment?.type, meta: item.attachment?._meta })), [
        {
          insertText: "/my-skill ",
          type: MessageAttachmentKind.Simple,
          meta: {
            command: "my-skill",
            description: "Runtime skill",
            argumentHint: "do stuff"
          }
        }
      ]);
    });
    test("does not expand a skill hint into option items", async () => {
      const provider = createProvider([
        { name: "toggle-skill", description: "Toggle skill", kind: "skill", allowDuringAgentExecution: true, input: { hint: "[on|off]" } }
      ]);
      const items = await run(provider, "/");
      assert.deepStrictEqual(runtimeOnly(items).map((i) => i.insertText), ["/toggle-skill "]);
    });
    test("surfaces runtime skills alongside builtins for a leading slash", async () => {
      const provider = createProvider([
        { name: "compact", description: "Runtime compact", kind: "builtin", allowDuringAgentExecution: true },
        { name: "alpha-skill", description: "Alpha skill", kind: "skill", allowDuringAgentExecution: true }
      ]);
      const items = await run(provider, "/");
      assert.deepStrictEqual(runtimeOnly(items).map((i) => i.insertText), ["/compact ", "/alpha-skill "].sort());
    });
    test("returns only runtime skills for an in-message slash token", async () => {
      const provider = createProvider([
        { name: "plan", description: "Runtime plan", kind: "builtin", allowDuringAgentExecution: true, input: { hint: "task" } },
        { name: "runtime-only", description: "Client command", kind: "client", allowDuringAgentExecution: true },
        { name: "my-skill", description: "Runtime skill", kind: "skill", allowDuringAgentExecution: true }
      ]);
      const items = await run(provider, "use /");
      assert.deepStrictEqual(items.map((i) => i.insertText), ["/my-skill "]);
    });
    test("excludes known skills even for an in-message slash token", async () => {
      const provider = createProvider(
        [
          { name: "my-plugin:my-skill", description: "Known skill", kind: "skill", allowDuringAgentExecution: true },
          { name: "other-skill", description: "Runtime skill", kind: "skill", allowDuringAgentExecution: true }
        ],
        [plugin("my-plugin", [skill("my-skill")])]
      );
      const items = await run(provider, "use /");
      assert.deepStrictEqual(items.map((i) => i.insertText), ["/other-skill "]);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjb3BpbG90U2xhc2hDb21tYW5kQ29tcGxldGlvblByb3ZpZGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFNZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RGaWxlU3lzdGVtU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb21wbGV0aW9uSXRlbSwgQ29tcGxldGlvbkl0ZW1LaW5kIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEN1c3RvbWl6YXRpb24sIEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZCwgQ3VzdG9taXphdGlvbkxvYWRTdGF0dXMsIEN1c3RvbWl6YXRpb25UeXBlLCBNY3BTZXJ2ZXJTdGF0dXMsIE1lc3NhZ2VBdHRhY2htZW50S2luZCwgdHlwZSBQbHVnaW5DdXN0b21pemF0aW9uLCB0eXBlIFNraWxsQ3VzdG9taXphdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBDb3BpbG90U2xhc2hDb21tYW5kQ29tcGxldGlvblByb3ZpZGVyLCBJQ29waWxvdFJ1bnRpbWVTbGFzaENvbW1hbmRJbmZvLCBwYXJzZUxlYWRpbmdTbGFzaENvbW1hbmQgfSBmcm9tICcuLi8uLi9ub2RlL2NvcGlsb3QvY29waWxvdFNsYXNoQ29tbWFuZENvbXBsZXRpb25Qcm92aWRlci5qcyc7XG5cbi8qKlxuICogVGhlIHByb3ZpZGVyIG5vdyBhbHNvIGluamVjdHMgd29ya2JlbmNoLWRlZmluZWQgY29uZmlnLWFjdGlvbiBpdGVtc1xuICogKHBlcm1pc3Npb24vbW9kZSB0b2dnbGVzIGxpa2UgYC95b2xvYCwgYC9hdXRvcGlsb3RgKSBpbnRvIGV2ZXJ5IGxlYWRpbmctc2xhc2hcbiAqIGNvbXBsZXRpb24gcmVzdWx0OyB0aGVzZSBjYXJyeSBhbiBgYWN0aW9uYCBiYWcgb24gdGhlaXIgYXR0YWNobWVudCBgX21ldGFgLlxuICogVGhlIHJ1bnRpbWUtZm9jdXNlZCBhc3NlcnRpb25zIGJlbG93IGZpbHRlciB0aGVtIG91dCB3aXRoIHRoaXMgaGVscGVyIHNvIHRoZXlcbiAqIGtlZXAgYXNzZXJ0aW5nIG9uIHRoZSBydW50aW1lIFNESyBjb21tYW5kIHNldC4gUnVudGltZSBjb21tYW5kcyB3aG9zZSBuYW1lXG4gKiBjb2xsaWRlcyB3aXRoIGEgY29uZmlnLWFjdGlvbiBjb21tYW5kIChlLmcuIGBwbGFuYCkgYXJlIGludGVudGlvbmFsbHkgZHJvcHBlZFxuICogYnkgdGhlIHByb3ZpZGVyLCBzbyB0aGV5IG5vIGxvbmdlciBhcHBlYXIgZXZlbiBhZnRlciBmaWx0ZXJpbmcuXG4gKi9cbmZ1bmN0aW9uIHJ1bnRpbWVPbmx5KGl0ZW1zOiByZWFkb25seSBDb21wbGV0aW9uSXRlbVtdKTogQ29tcGxldGlvbkl0ZW1bXSB7XG5cdHJldHVybiBpdGVtcy5maWx0ZXIoaSA9PiBpLmF0dGFjaG1lbnQ/Ll9tZXRhPy5hY3Rpb24gPT09IHVuZGVmaW5lZCk7XG59XG5cbnN1aXRlKCdDb3BpbG90U2xhc2hDb21tYW5kQ29tcGxldGlvblByb3ZpZGVyJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdwYXJzZUxlYWRpbmdTbGFzaENvbW1hbmQnLCAoKSA9PiB7XG5cdFx0dGVzdCgnbWF0Y2hlcyBsb25lIC9wbGFuJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZUxlYWRpbmdTbGFzaENvbW1hbmQoJy9wbGFuJyksIHsgY29tbWFuZDogJ3BsYW4nLCByZXN0OiAnJywgcmF3UmVzdDogJycgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXRjaGVzIGxvbmUgL2NvbXBhY3QnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlTGVhZGluZ1NsYXNoQ29tbWFuZCgnL2NvbXBhY3QnKSwgeyBjb21tYW5kOiAnY29tcGFjdCcsIHJlc3Q6ICcnLCByYXdSZXN0OiAnJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hdGNoZXMgbG9uZSAvcmVzZWFyY2gnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlTGVhZGluZ1NsYXNoQ29tbWFuZCgnL3Jlc2VhcmNoJyksIHsgY29tbWFuZDogJ3Jlc2VhcmNoJywgcmVzdDogJycsIHJhd1Jlc3Q6ICcnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FwdHVyZXMgdHJhaWxpbmcgdGV4dCBhZnRlciBhIHNwYWNlIGZvciAvcmVzZWFyY2gnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlTGVhZGluZ1NsYXNoQ29tbWFuZCgnL3Jlc2VhcmNoIEhvdyBkb2VzIFJlYWN0IHdvcms/JyksIHsgY29tbWFuZDogJ3Jlc2VhcmNoJywgcmVzdDogJ0hvdyBkb2VzIFJlYWN0IHdvcms/JywgcmF3UmVzdDogJ0hvdyBkb2VzIFJlYWN0IHdvcms/JyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hdGNoZXMgbG9uZSAvcnViYmVyLWR1Y2snLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlTGVhZGluZ1NsYXNoQ29tbWFuZCgnL3J1YmJlci1kdWNrJyksIHsgY29tbWFuZDogJ3J1YmJlci1kdWNrJywgcmVzdDogJycsIHJhd1Jlc3Q6ICcnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWF0Y2hlcyBsb25lIC9lbnYnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlTGVhZGluZ1NsYXNoQ29tbWFuZCgnL2VudicpLCB7IGNvbW1hbmQ6ICdlbnYnLCByZXN0OiAnJywgcmF3UmVzdDogJycgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXRjaGVzIGxvbmUgL3JldmlldycsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VMZWFkaW5nU2xhc2hDb21tYW5kKCcvcmV2aWV3JyksIHsgY29tbWFuZDogJ3JldmlldycsIHJlc3Q6ICcnLCByYXdSZXN0OiAnJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hdGNoZXMgbG9uZSAvc2VjdXJpdHktcmV2aWV3JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZUxlYWRpbmdTbGFzaENvbW1hbmQoJy9zZWN1cml0eS1yZXZpZXcnKSwgeyBjb21tYW5kOiAnc2VjdXJpdHktcmV2aWV3JywgcmVzdDogJycsIHJhd1Jlc3Q6ICcnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FwdHVyZXMgdHJhaWxpbmcgdGV4dCBhZnRlciBhIHNwYWNlIGZvciAvcnViYmVyLWR1Y2snLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlTGVhZGluZ1NsYXNoQ29tbWFuZCgnL3J1YmJlci1kdWNrIHJldmlldyBteSBhcHByb2FjaCcpLCB7IGNvbW1hbmQ6ICdydWJiZXItZHVjaycsIHJlc3Q6ICdyZXZpZXcgbXkgYXBwcm9hY2gnLCByYXdSZXN0OiAncmV2aWV3IG15IGFwcHJvYWNoJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NhcHR1cmVzIHRyYWlsaW5nIHRleHQgYWZ0ZXIgYSBzcGFjZSBmb3IgL2VudicsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VMZWFkaW5nU2xhc2hDb21tYW5kKCcvZW52IGlnbm9yZWQgaW5wdXQnKSwgeyBjb21tYW5kOiAnZW52JywgcmVzdDogJ2lnbm9yZWQgaW5wdXQnLCByYXdSZXN0OiAnaWdub3JlZCBpbnB1dCcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYXB0dXJlcyB0cmFpbGluZyB0ZXh0IGFmdGVyIGEgc3BhY2UgZm9yIC9yZXZpZXcnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlTGVhZGluZ1NsYXNoQ29tbWFuZCgnL3JldmlldyBmb2N1cyBvbiB0ZXN0cycpLCB7IGNvbW1hbmQ6ICdyZXZpZXcnLCByZXN0OiAnZm9jdXMgb24gdGVzdHMnLCByYXdSZXN0OiAnZm9jdXMgb24gdGVzdHMnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FwdHVyZXMgdHJhaWxpbmcgdGV4dCBhZnRlciBhIHNwYWNlIGZvciAvc2VjdXJpdHktcmV2aWV3JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZUxlYWRpbmdTbGFzaENvbW1hbmQoJy9zZWN1cml0eS1yZXZpZXcgZm9jdXMgb24gYXV0aCcpLCB7IGNvbW1hbmQ6ICdzZWN1cml0eS1yZXZpZXcnLCByZXN0OiAnZm9jdXMgb24gYXV0aCcsIHJhd1Jlc3Q6ICdmb2N1cyBvbiBhdXRoJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhcnNlcyBhcmJpdHJhcnkgc2xhc2ggY29tbWFuZCB0b2tlbnMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlTGVhZGluZ1NsYXNoQ29tbWFuZCgnL3J1YmJlci1kdWNrLWV4dHJhJyksIHsgY29tbWFuZDogJ3J1YmJlci1kdWNrLWV4dHJhJywgcmVzdDogJycsIHJhd1Jlc3Q6ICcnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJlc2VydmVzIG11bHRpbGluZSBjb21tYW5kIGlucHV0IGFzIHJhd1Jlc3QnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlTGVhZGluZ1NsYXNoQ29tbWFuZCgnL2ZvbyBmaXJzdCBsaW5lXFxuc2Vjb25kIGxpbmUnKSwgeyBjb21tYW5kOiAnZm9vJywgcmVzdDogJ2ZpcnN0IGxpbmVcXG5zZWNvbmQgbGluZScsIHJhd1Jlc3Q6ICdmaXJzdCBsaW5lXFxuc2Vjb25kIGxpbmUnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndHJpbXMgcmVzdCB3aGlsZSByZXRhaW5pbmcgcmF3UmVzdCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VMZWFkaW5nU2xhc2hDb21tYW5kKCcvZm9vICAgcGFkZGVkICAnKSwgeyBjb21tYW5kOiAnZm9vJywgcmVzdDogJ3BhZGRlZCcsIHJhd1Jlc3Q6ICdwYWRkZWQgICcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYXB0dXJlcyB0cmFpbGluZyB0ZXh0IGFmdGVyIGEgc3BhY2UnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlTGVhZGluZ1NsYXNoQ29tbWFuZCgnL3BsYW4gYnVpbGQgYSBoZWxsbyB3b3JsZCcpLCB7IGNvbW1hbmQ6ICdwbGFuJywgcmVzdDogJ2J1aWxkIGEgaGVsbG8gd29ybGQnLCByYXdSZXN0OiAnYnVpbGQgYSBoZWxsbyB3b3JsZCcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYXB0dXJlcyB0cmFpbGluZyB0ZXh0IGFmdGVyIGEgc3BhY2UgZm9yIC9jb21wYWN0JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZUxlYWRpbmdTbGFzaENvbW1hbmQoJy9jb21wYWN0IHNvbWUgdGV4dCcpLCB7IGNvbW1hbmQ6ICdjb21wYWN0JywgcmVzdDogJ3NvbWUgdGV4dCcsIHJhd1Jlc3Q6ICdzb21lIHRleHQnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyBsZWFkaW5nIHdoaXRlc3BhY2UnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VMZWFkaW5nU2xhc2hDb21tYW5kKCcgL2NvbXBhY3QnKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FjY2VwdHMgdXBwZXJjYXNlIGNvbW1hbmQgdG9rZW5zJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZUxlYWRpbmdTbGFzaENvbW1hbmQoJy9QTEFOJyksIHsgY29tbWFuZDogJ1BMQU4nLCByZXN0OiAnJywgcmF3UmVzdDogJycgfSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdwcm92aWRlQ29tcGxldGlvbkl0ZW1zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJ1bnRpbWVDb21tYW5kcyA9IFtcblx0XHRcdHsgbmFtZTogJ3BsYW4nLCBkZXNjcmlwdGlvbjogJ1J1bnRpbWUgcGxhbicsIGtpbmQ6ICdidWlsdGluJyBhcyBjb25zdCwgYWxsb3dEdXJpbmdBZ2VudEV4ZWN1dGlvbjogdHJ1ZSwgaW5wdXQ6IHsgaGludDogJ3Rhc2snIH0gfSxcblx0XHRcdHsgbmFtZTogJ2NvbXBhY3QnLCBkZXNjcmlwdGlvbjogJ1J1bnRpbWUgY29tcGFjdCcsIGtpbmQ6ICdidWlsdGluJyBhcyBjb25zdCwgYWxsb3dEdXJpbmdBZ2VudEV4ZWN1dGlvbjogdHJ1ZSB9LFxuXHRcdFx0eyBuYW1lOiAncmVzZWFyY2gnLCBkZXNjcmlwdGlvbjogJ1J1bnRpbWUgcmVzZWFyY2gnLCBraW5kOiAnYnVpbHRpbicgYXMgY29uc3QsIGFsbG93RHVyaW5nQWdlbnRFeGVjdXRpb246IHRydWUsIGlucHV0OiB7IGhpbnQ6ICdxdWVyeScgfSB9LFxuXHRcdFx0eyBuYW1lOiAncnViYmVyLWR1Y2snLCBkZXNjcmlwdGlvbjogJ1J1bnRpbWUgcnViYmVyLWR1Y2snLCBraW5kOiAnYnVpbHRpbicgYXMgY29uc3QsIGFsbG93RHVyaW5nQWdlbnRFeGVjdXRpb246IHRydWUsIGlucHV0OiB7IGhpbnQ6ICdyZXZpZXcgcHJvbXB0JyB9IH0sXG5cdFx0XHR7IG5hbWU6ICdlbnYnLCBkZXNjcmlwdGlvbjogJ1J1bnRpbWUgZW52Jywga2luZDogJ2J1aWx0aW4nIGFzIGNvbnN0LCBhbGxvd0R1cmluZ0FnZW50RXhlY3V0aW9uOiB0cnVlIH0sXG5cdFx0XHR7IG5hbWU6ICdyZXZpZXcnLCBkZXNjcmlwdGlvbjogJ1J1bnRpbWUgcmV2aWV3Jywga2luZDogJ2J1aWx0aW4nIGFzIGNvbnN0LCBhbGxvd0R1cmluZ0FnZW50RXhlY3V0aW9uOiB0cnVlLCBpbnB1dDogeyBoaW50OiAnc2NvcGUnIH0gfSxcblx0XHRcdHsgbmFtZTogJ3NlY3VyaXR5LXJldmlldycsIGRlc2NyaXB0aW9uOiAnUnVudGltZSBzZWN1cml0eSByZXZpZXcnLCBraW5kOiAnYnVpbHRpbicgYXMgY29uc3QsIGFsbG93RHVyaW5nQWdlbnRFeGVjdXRpb246IHRydWUsIGlucHV0OiB7IGhpbnQ6ICdzY29wZScgfSB9LFxuXHRcdF07XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgQ29waWxvdFNsYXNoQ29tbWFuZENvbXBsZXRpb25Qcm92aWRlcignY29waWxvdGNsaScsIHtcblx0XHRcdGlzUnViYmVyRHVja0VuYWJsZWQ6ICgpID0+IHRydWUsXG5cdFx0XHRnZXRSdW50aW1lU2xhc2hDb21tYW5kczogYXN5bmMgKCkgPT4gcnVudGltZUNvbW1hbmRzLFxuXHRcdFx0Z2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zOiBhc3luYyAoKSA9PiBbXSxcblx0XHR9KTtcblx0XHRjb25zdCBzZXNzaW9uID0gJ2NvcGlsb3RjbGk6L2FiYyc7XG5cblx0XHRhc3luYyBmdW5jdGlvbiBydW4odGV4dDogc3RyaW5nLCBvZmZzZXQgPSB0ZXh0Lmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHByb3ZpZGVyLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMoeyBraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVXNlck1lc3NhZ2UsIGNoYW5uZWw6IHNlc3Npb24sIHRleHQsIG9mZnNldCB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHR9XG5cblx0XHR0ZXN0KCdyZXR1cm5zIG5vdGhpbmcgZm9yIG5vbi1jb3BpbG90Y2xpIHNjaGVtZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUNvbXBsZXRpb25JdGVtcyh7XG5cdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5Vc2VyTWVzc2FnZSxcblx0XHRcdFx0Y2hhbm5lbDogJ2NsYXVkZTovYWJjJyxcblx0XHRcdFx0dGV4dDogJy8nLFxuXHRcdFx0XHRvZmZzZXQ6IDEsXG5cdFx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaXRlbXMsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgYWxsIHJ1bnRpbWUgaXRlbXMgZm9yIGxvbmUgXCIvXCIgKGNvbmZpZy1hY3Rpb24gaXRlbXMgZmlsdGVyZWQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBydW4oJy8nKTtcblx0XHRcdC8vIGBwbGFuYCBjb2xsaWRlcyB3aXRoIGEgY29uZmlnLWFjdGlvbiBjb21tYW5kIGFuZCBpcyBkcm9wcGVkIGZyb20gdGhlIHJ1bnRpbWUgc2V0LlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChydW50aW1lT25seShpdGVtcykubWFwKGkgPT4gaS5pbnNlcnRUZXh0KSwgWycvY29tcGFjdCAnLCAnL3Jlc2VhcmNoICcsICcvcnViYmVyLWR1Y2sgJywgJy9lbnYgJywgJy9yZXZpZXcgJywgJy9zZWN1cml0eS1yZXZpZXcgJ10uc29ydCgpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luamVjdHMgY29uZmlnLWFjdGlvbiBpdGVtcyAocGVybWlzc2lvbi9tb2RlIHRvZ2dsZXMpIGZvciBhIGxlYWRpbmcgc2xhc2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHJ1bignLycpO1xuXHRcdFx0Y29uc3QgYnlMYWJlbCA9IG5ldyBNYXAoaXRlbXMuZmlsdGVyKGkgPT4gaS5hdHRhY2htZW50Py5fbWV0YT8uYWN0aW9uICE9PSB1bmRlZmluZWQpLm1hcChpID0+IFtpLmF0dGFjaG1lbnQ/LmxhYmVsLCBpXSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ5TGFiZWwuaGFzKCcveW9sbyBvbicpKTtcblx0XHRcdGFzc2VydC5vayhieUxhYmVsLmhhcygnL2F1dG9waWxvdCBvbicpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChieUxhYmVsLmdldCgnL2F1dG9waWxvdCcpPy5pbnNlcnRUZXh0LCAnL2F1dG9waWxvdCAnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpbHRlcnMgdG8gL3BsYW4gd2hlbiBcIi9wXCIgdHlwZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHJ1bignL3AnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaXRlbXMubWFwKGkgPT4gaS5pbnNlcnRUZXh0KSwgWycvcGxhbiAnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmaWx0ZXJzIHRvIC9jb21wYWN0IHdoZW4gXCIvY1wiIHR5cGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBydW4oJy9jJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGl0ZW1zLm1hcChpID0+IGkuaW5zZXJ0VGV4dCksIFsnL2NvbXBhY3QgJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZnV6enkgbWF0Y2hlcyAvY29tcGFjdCB3aGVuIFwiL2NjXCIgdHlwZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHJ1bignL2NjJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGl0ZW1zLm1hcChpID0+IGkuaW5zZXJ0VGV4dCksIFsnL2NvbXBhY3QgJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmlsdGVycyB0byAvZW52IHdoZW4gXCIvZVwiIHR5cGVkIGFuZCBydW50aW1lIGNvbW1hbmQgZXhpc3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBydW4oJy9lJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGl0ZW1zLm1hcChpID0+IGkuaW5zZXJ0VGV4dCksIFsnL2VudiAnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmaWx0ZXJzIHRvIC9yZXNlYXJjaCBhbmQgL3J1YmJlci1kdWNrIHdoZW4gXCIvclwiIHR5cGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBydW4oJy9yJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGl0ZW1zLm1hcChpID0+IGkuaW5zZXJ0VGV4dCksIFtcblx0XHRcdFx0Jy9yZXNlYXJjaCAnLFxuXHRcdFx0XHQnL3JldmlldyAnLFxuXHRcdFx0XHQnL3J1YmJlci1kdWNrICdcblx0XHRcdF0uc29ydCgpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpbHRlcnMgdG8gL3NlY3VyaXR5LXJldmlldyB3aGVuIFwiL3NcIiB0eXBlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgcnVuKCcvcycpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpdGVtcy5tYXAoaSA9PiBpLmluc2VydFRleHQpLCBbJy9zZWN1cml0eS1yZXZpZXcgJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBub3RoaW5nIHdoZW4gL3dvcmQgZG9lcyBub3QgbWF0Y2ggYW55IGNvbW1hbmQgcHJlZml4JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBydW4oJy96eicpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpdGVtcywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBub3RoaW5nIHdoZW4gaW5wdXQgZG9lcyBub3Qgc3RhcnQgd2l0aCAvJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBydW4oJ2hlbGxvIC9wbCcsIDkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpdGVtcywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBub3RoaW5nIHdoZW4gY3Vyc29yIGlzIHBhc3QgdGhlIGxlYWRpbmcgd29yZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIEN1cnNvciBzaXRzIGFmdGVyIHRoZSB0cmFpbGluZyBzcGFjZSwgbm8gbG9uZ2VyIGluIHRoZSBzbGFzaCB0b2tlbi5cblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgcnVuKCcvcGxhbiAnLCA2KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaXRlbXMsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JhbmdlIGNvdmVycyBvbmx5IHRoZSBsZWFkaW5nIHNsYXNoIHdvcmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHJ1bignL3AgZXh0cmEgdGV4dCcsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW1zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbXNbMF0ucmFuZ2VTdGFydCwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbXNbMF0ucmFuZ2VFbmQsIDIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXR0YWNobWVudCBpcyBTaW1wbGUgd2l0aCBjb21tYW5kICsgZGVzY3JpcHRpb24gbWV0YScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgcnVuKCcvJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJ1bnRpbWVPbmx5KGl0ZW1zKS5tYXAoaXRlbSA9PiAoeyBpbnNlcnRUZXh0OiBpdGVtLmluc2VydFRleHQsIHR5cGU6IGl0ZW0uYXR0YWNobWVudD8udHlwZSwgbWV0YTogaXRlbS5hdHRhY2htZW50Py5fbWV0YSB9KSksIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGluc2VydFRleHQ6ICcvY29tcGFjdCAnLFxuXHRcdFx0XHRcdHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5TaW1wbGUsXG5cdFx0XHRcdFx0bWV0YToge1xuXHRcdFx0XHRcdFx0Y29tbWFuZDogJ2NvbXBhY3QnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdSdW50aW1lIGNvbXBhY3QnLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpbnNlcnRUZXh0OiAnL2VudiAnLFxuXHRcdFx0XHRcdHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5TaW1wbGUsXG5cdFx0XHRcdFx0bWV0YToge1xuXHRcdFx0XHRcdFx0Y29tbWFuZDogJ2VudicsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1J1bnRpbWUgZW52Jyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aW5zZXJ0VGV4dDogJy9yZXNlYXJjaCAnLFxuXHRcdFx0XHRcdHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5TaW1wbGUsXG5cdFx0XHRcdFx0bWV0YToge1xuXHRcdFx0XHRcdFx0Y29tbWFuZDogJ3Jlc2VhcmNoJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnUnVudGltZSByZXNlYXJjaCcsXG5cdFx0XHRcdFx0XHRhcmd1bWVudEhpbnQ6ICdxdWVyeScsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGluc2VydFRleHQ6ICcvcmV2aWV3ICcsXG5cdFx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlNpbXBsZSxcblx0XHRcdFx0XHRtZXRhOiB7XG5cdFx0XHRcdFx0XHRjb21tYW5kOiAncmV2aWV3Jyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnUnVudGltZSByZXZpZXcnLFxuXHRcdFx0XHRcdFx0YXJndW1lbnRIaW50OiAnc2NvcGUnLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpbnNlcnRUZXh0OiAnL3J1YmJlci1kdWNrICcsXG5cdFx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlNpbXBsZSxcblx0XHRcdFx0XHRtZXRhOiB7XG5cdFx0XHRcdFx0XHRjb21tYW5kOiAncnViYmVyLWR1Y2snLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdSdW50aW1lIHJ1YmJlci1kdWNrJyxcblx0XHRcdFx0XHRcdGFyZ3VtZW50SGludDogJ3JldmlldyBwcm9tcHQnLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpbnNlcnRUZXh0OiAnL3NlY3VyaXR5LXJldmlldyAnLFxuXHRcdFx0XHRcdHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5TaW1wbGUsXG5cdFx0XHRcdFx0bWV0YToge1xuXHRcdFx0XHRcdFx0Y29tbWFuZDogJ3NlY3VyaXR5LXJldmlldycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1J1bnRpbWUgc2VjdXJpdHkgcmV2aWV3Jyxcblx0XHRcdFx0XHRcdGFyZ3VtZW50SGludDogJ3Njb3BlJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvbWl0cyAvcnViYmVyLWR1Y2sgd2hlbiBub3QgZW5hYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGdhdGVkID0gbmV3IENvcGlsb3RTbGFzaENvbW1hbmRDb21wbGV0aW9uUHJvdmlkZXIoJ2NvcGlsb3RjbGknLCB7XG5cdFx0XHRcdGlzUnViYmVyRHVja0VuYWJsZWQ6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRnZXRSdW50aW1lU2xhc2hDb21tYW5kczogYXN5bmMgKCkgPT4gcnVudGltZUNvbW1hbmRzLFxuXHRcdFx0XHRnZXRTZXNzaW9uQ3VzdG9taXphdGlvbnM6IGFzeW5jICgpID0+IFtdLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IGdhdGVkLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMoe1xuXHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVXNlck1lc3NhZ2UsIGNoYW5uZWw6IHNlc3Npb24sIHRleHQ6ICcvJywgb2Zmc2V0OiAxLFxuXHRcdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJ1bnRpbWVPbmx5KGl0ZW1zKS5tYXAoaSA9PiBpLmluc2VydFRleHQpLCBbXG5cdFx0XHRcdCcvY29tcGFjdCAnLFxuXHRcdFx0XHQnL2VudiAnLFxuXHRcdFx0XHQnL3Jlc2VhcmNoICcsXG5cdFx0XHRcdCcvcmV2aWV3ICcsXG5cdFx0XHRcdCcvc2VjdXJpdHktcmV2aWV3ICdcblx0XHRcdF0uc29ydCgpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgbm8gY29tcGxldGlvbiBpdGVtcyB3aGVuIHJ1bnRpbWUgY29tbWFuZCBsaXN0IGlzIGVtcHR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZ2F0ZWQgPSBuZXcgQ29waWxvdFNsYXNoQ29tbWFuZENvbXBsZXRpb25Qcm92aWRlcignY29waWxvdGNsaScsIHtcblx0XHRcdFx0aXNSdWJiZXJEdWNrRW5hYmxlZDogKCkgPT4gdHJ1ZSxcblx0XHRcdFx0Z2V0UnVudGltZVNsYXNoQ29tbWFuZHM6IGFzeW5jICgpID0+IFtdLFxuXHRcdFx0XHRnZXRTZXNzaW9uQ3VzdG9taXphdGlvbnM6IGFzeW5jICgpID0+IFtdLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IGdhdGVkLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMoe1xuXHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVXNlck1lc3NhZ2UsIGNoYW5uZWw6IHNlc3Npb24sIHRleHQ6ICcvJywgb2Zmc2V0OiAxLFxuXHRcdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJ1bnRpbWVPbmx5KGl0ZW1zKSwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmlsdGVycyBvdXQgcnVudGltZSBjb21tYW5kcyBvbWl0dGVkIGZyb20gdGhlIGNhdGFsb2cnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBnYXRlZCA9IG5ldyBDb3BpbG90U2xhc2hDb21tYW5kQ29tcGxldGlvblByb3ZpZGVyKCdjb3BpbG90Y2xpJywge1xuXHRcdFx0XHRpc1J1YmJlckR1Y2tFbmFibGVkOiAoKSA9PiB0cnVlLFxuXHRcdFx0XHRnZXRSdW50aW1lU2xhc2hDb21tYW5kczogYXN5bmMgKCkgPT4gcnVudGltZUNvbW1hbmRzLmZpbHRlcihjb21tYW5kID0+IGNvbW1hbmQubmFtZSAhPT0gJ2VudicpLFxuXHRcdFx0XHRnZXRTZXNzaW9uQ3VzdG9taXphdGlvbnM6IGFzeW5jICgpID0+IFtdLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IGdhdGVkLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMoe1xuXHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVXNlck1lc3NhZ2UsIGNoYW5uZWw6IHNlc3Npb24sIHRleHQ6ICcvJywgb2Zmc2V0OiAxLFxuXHRcdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHQvLyBgcGxhbmAgY29sbGlkZXMgd2l0aCBhIGNvbmZpZy1hY3Rpb24gY29tbWFuZCBhbmQgaXMgZHJvcHBlZCBmcm9tIHRoZSBydW50aW1lIHNldC5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocnVudGltZU9ubHkoaXRlbXMpLm1hcChpID0+IGkuaW5zZXJ0VGV4dCksIFtcblx0XHRcdFx0Jy9jb21wYWN0ICcsXG5cdFx0XHRcdCcvcmVzZWFyY2ggJyxcblx0XHRcdFx0Jy9yZXZpZXcgJyxcblx0XHRcdFx0Jy9ydWJiZXItZHVjayAnLFxuXHRcdFx0XHQnL3NlY3VyaXR5LXJldmlldyAnLFxuXHRcdFx0XS5zb3J0KCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5jbHVkZXMgcnVudGltZSBTREsgY29tbWFuZHMgaW4gY29tcGxldGlvbiByZXN1bHRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZ2F0ZWQgPSBuZXcgQ29waWxvdFNsYXNoQ29tbWFuZENvbXBsZXRpb25Qcm92aWRlcignY29waWxvdGNsaScsIHtcblx0XHRcdFx0aXNSdWJiZXJEdWNrRW5hYmxlZDogKCkgPT4gdHJ1ZSxcblx0XHRcdFx0Z2V0UnVudGltZVNsYXNoQ29tbWFuZHM6IGFzeW5jICgpID0+IFt7XG5cdFx0XHRcdFx0bmFtZTogJ2ZvY3VzJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0ZvY3VzIG9uIHNwZWNpZmljIGZpbGVzJyxcblx0XHRcdFx0XHRraW5kOiAnYnVpbHRpbicsXG5cdFx0XHRcdFx0YWxsb3dEdXJpbmdBZ2VudEV4ZWN1dGlvbjogdHJ1ZSxcblx0XHRcdFx0XHRpbnB1dDogeyBoaW50OiAnc2NvcGUnIH0sXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHRnZXRTZXNzaW9uQ3VzdG9taXphdGlvbnM6IGFzeW5jICgpID0+IFtdLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IGdhdGVkLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMoe1xuXHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVXNlck1lc3NhZ2UsIGNoYW5uZWw6IHNlc3Npb24sIHRleHQ6ICcvZicsIG9mZnNldDogMixcblx0XHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpdGVtcy5tYXAoaSA9PiBpLmluc2VydFRleHQpLCBbJy9mb2N1cyAnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb25maWctYWN0aW9uIGNvbW1hbmRzIHNoYWRvdyBydW50aW1lIGNvbW1hbmRzIG9mIHRoZSBzYW1lIG5hbWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBnYXRlZCA9IG5ldyBDb3BpbG90U2xhc2hDb21tYW5kQ29tcGxldGlvblByb3ZpZGVyKCdjb3BpbG90Y2xpJywge1xuXHRcdFx0XHRpc1J1YmJlckR1Y2tFbmFibGVkOiAoKSA9PiB0cnVlLFxuXHRcdFx0XHRnZXRSdW50aW1lU2xhc2hDb21tYW5kczogYXN5bmMgKCkgPT4gW1xuXHRcdFx0XHRcdHsgbmFtZTogJ3BsYW4nLCBkZXNjcmlwdGlvbjogJ3J1bnRpbWUgcGxhbicsIGtpbmQ6ICdidWlsdGluJywgYWxsb3dEdXJpbmdBZ2VudEV4ZWN1dGlvbjogdHJ1ZSwgaW5wdXQ6IHsgaGludDogJ3Rhc2snIH0gfSxcblx0XHRcdFx0XHR7IG5hbWU6ICdjb21wYWN0JywgZGVzY3JpcHRpb246ICdydW50aW1lIGNvbXBhY3QnLCBraW5kOiAnYnVpbHRpbicsIGFsbG93RHVyaW5nQWdlbnRFeGVjdXRpb246IHRydWUgfSxcblx0XHRcdFx0XHR7IG5hbWU6ICdydW50aW1lLW9ubHknLCBkZXNjcmlwdGlvbjogJ3J1bnRpbWUgb25seScsIGtpbmQ6ICdjbGllbnQnLCBhbGxvd0R1cmluZ0FnZW50RXhlY3V0aW9uOiB0cnVlIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGdldFNlc3Npb25DdXN0b21pemF0aW9uczogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgZ2F0ZWQucHJvdmlkZUNvbXBsZXRpb25JdGVtcyh7XG5cdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5Vc2VyTWVzc2FnZSwgY2hhbm5lbDogc2Vzc2lvbiwgdGV4dDogJy8nLCBvZmZzZXQ6IDEsXG5cdFx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdC8vIGBwbGFuYCBjb2xsaWRlcyB3aXRoIGEgY29uZmlnLWFjdGlvbiBjb21tYW5kLCBzbyB0aGUgcnVudGltZSBgcGxhbmAgaXNcblx0XHRcdC8vIGRyb3BwZWQ7IG5vbi1jb2xsaWRpbmcgcnVudGltZSBjb21tYW5kcyBhcmUga2VwdC5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocnVudGltZU9ubHkoaXRlbXMpLm1hcChpID0+IGkuaW5zZXJ0VGV4dCksIFsnL2NvbXBhY3QgJywgJy9ydW50aW1lLW9ubHkgJ10uc29ydCgpKTtcblx0XHRcdC8vIFRoZSBjb25maWctYWN0aW9uIGAvcGxhbiBgIGl0ZW0gaXMgc3RpbGwgc3VyZmFjZWQgKGNhcnJ5aW5nIGFuIGFjdGlvbiBiYWcpLlxuXHRcdFx0Y29uc3QgcGxhbkl0ZW0gPSBpdGVtcy5maW5kKGkgPT4gaS5pbnNlcnRUZXh0ID09PSAnL3BsYW4gJyk7XG5cdFx0XHRhc3NlcnQub2socGxhbkl0ZW0/LmF0dGFjaG1lbnQ/Ll9tZXRhPy5hY3Rpb24gIT09IHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VzIHJ1bnRpbWUgaW5wdXQgbWV0YWRhdGEgdG8gZGV0ZXJtaW5lIHRyYWlsaW5nIHNwYWNlIGluc2VydGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGdhdGVkID0gbmV3IENvcGlsb3RTbGFzaENvbW1hbmRDb21wbGV0aW9uUHJvdmlkZXIoJ2NvcGlsb3RjbGknLCB7XG5cdFx0XHRcdGlzUnViYmVyRHVja0VuYWJsZWQ6ICgpID0+IHRydWUsXG5cdFx0XHRcdGdldFJ1bnRpbWVTbGFzaENvbW1hbmRzOiBhc3luYyAoKSA9PiBbXG5cdFx0XHRcdFx0eyBuYW1lOiAnbm8taW5wdXQnLCBkZXNjcmlwdGlvbjogJ05vIGlucHV0Jywga2luZDogJ2J1aWx0aW4nLCBhbGxvd0R1cmluZ0FnZW50RXhlY3V0aW9uOiB0cnVlIH0sXG5cdFx0XHRcdFx0eyBuYW1lOiAnbmVlZHMtaW5wdXQnLCBkZXNjcmlwdGlvbjogJ05lZWRzIGlucHV0Jywga2luZDogJ2J1aWx0aW4nLCBhbGxvd0R1cmluZ0FnZW50RXhlY3V0aW9uOiB0cnVlLCBpbnB1dDogeyBoaW50OiAndmFsdWUnIH0gfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0Z2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zOiBhc3luYyAoKSA9PiBbXSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3Qgd2l0aElucHV0ID0gYXdhaXQgZ2F0ZWQucHJvdmlkZUNvbXBsZXRpb25JdGVtcyh7XG5cdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5Vc2VyTWVzc2FnZSwgY2hhbm5lbDogc2Vzc2lvbiwgdGV4dDogJy9uJywgb2Zmc2V0OiAyLFxuXHRcdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHdpdGhJbnB1dC5tYXAoaSA9PiBpLmluc2VydFRleHQpLCBbJy9uby1pbnB1dCAnLCAnL25lZWRzLWlucHV0ICddLnNvcnQoKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleHBhbmRzIGlucHV0IGNob2ljZXMgaW50byBvbmUgaXRlbSBwZXIgY2hvaWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZ2F0ZWQgPSBuZXcgQ29waWxvdFNsYXNoQ29tbWFuZENvbXBsZXRpb25Qcm92aWRlcignY29waWxvdGNsaScsIHtcblx0XHRcdFx0aXNSdWJiZXJEdWNrRW5hYmxlZDogKCkgPT4gdHJ1ZSxcblx0XHRcdFx0Z2V0UnVudGltZVNsYXNoQ29tbWFuZHM6IGFzeW5jICgpID0+IFtcblx0XHRcdFx0XHR7IG5hbWU6ICd0b2dnbGUnLCBkZXNjcmlwdGlvbjogJ1RvZ2dsZSBhIGZlYXR1cmUgb24gb3Igb2ZmJywga2luZDogJ2J1aWx0aW4nLCBhbGxvd0R1cmluZ0FnZW50RXhlY3V0aW9uOiB0cnVlLCBpbnB1dDogeyBoaW50OiAnJywgY2hvaWNlczogW3sgbmFtZTogJ29uJywgZGVzY3JpcHRpb246ICdUdXJuIHRoZSBmZWF0dXJlIG9uJyB9LCB7IG5hbWU6ICdvZmYnLCBkZXNjcmlwdGlvbjogJ1R1cm4gdGhlIGZlYXR1cmUgb2ZmJyB9XSB9IH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGdldFNlc3Npb25DdXN0b21pemF0aW9uczogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgZ2F0ZWQucHJvdmlkZUNvbXBsZXRpb25JdGVtcyh7XG5cdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5Vc2VyTWVzc2FnZSwgY2hhbm5lbDogc2Vzc2lvbiwgdGV4dDogJy90Jywgb2Zmc2V0OiAyLFxuXHRcdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHQvLyBTdHJ1Y3R1cmVkIGNob2ljZXMgZXhwYW5kIGludG8gb25lIGl0ZW0gcGVyIGNob2ljZSwgZWFjaCBjYXJyeWluZyBpdHMgb3duIGRlc2NyaXB0aW9uLlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpdGVtcy5tYXAoaXRlbSA9PiAoeyBpbnNlcnRUZXh0OiBpdGVtLmluc2VydFRleHQsIG1ldGE6IGl0ZW0uYXR0YWNobWVudD8uX21ldGEgfSkpLCBbXG5cdFx0XHRcdHsgaW5zZXJ0VGV4dDogJy90b2dnbGUgb2ZmICcsIG1ldGE6IHsgY29tbWFuZDogJ3RvZ2dsZScsIGRlc2NyaXB0aW9uOiAnVHVybiB0aGUgZmVhdHVyZSBvZmYnIH0gfSxcblx0XHRcdFx0eyBpbnNlcnRUZXh0OiAnL3RvZ2dsZSBvbiAnLCBtZXRhOiB7IGNvbW1hbmQ6ICd0b2dnbGUnLCBkZXNjcmlwdGlvbjogJ1R1cm4gdGhlIGZlYXR1cmUgb24nIH0gfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5jbHVkZXMgYSBiYXJlIGNvbW1hbmQgaXRlbSB3aGVuIGEgY2hvaWNlIGhhcyBhbiBlbXB0eSBuYW1lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZ2F0ZWQgPSBuZXcgQ29waWxvdFNsYXNoQ29tbWFuZENvbXBsZXRpb25Qcm92aWRlcignY29waWxvdGNsaScsIHtcblx0XHRcdFx0aXNSdWJiZXJEdWNrRW5hYmxlZDogKCkgPT4gdHJ1ZSxcblx0XHRcdFx0Z2V0UnVudGltZVNsYXNoQ29tbWFuZHM6IGFzeW5jICgpID0+IFtcblx0XHRcdFx0XHR7IG5hbWU6ICd0b2dnbGUnLCBkZXNjcmlwdGlvbjogJ1RvZ2dsZSBhIGZlYXR1cmUgb24gb3Igb2ZmJywga2luZDogJ2J1aWx0aW4nLCBhbGxvd0R1cmluZ0FnZW50RXhlY3V0aW9uOiB0cnVlLCBpbnB1dDogeyBoaW50OiAnJywgY2hvaWNlczogW3sgbmFtZTogJycsIGRlc2NyaXB0aW9uOiAnU2hvdyB0aGUgY3VycmVudCBzdGF0ZScgfSwgeyBuYW1lOiAnb24nLCBkZXNjcmlwdGlvbjogJ1R1cm4gb24nIH0sIHsgbmFtZTogJ29mZicsIGRlc2NyaXB0aW9uOiAnVHVybiBvZmYnIH1dIH0gfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0Z2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zOiBhc3luYyAoKSA9PiBbXSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBnYXRlZC5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKHtcblx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlVzZXJNZXNzYWdlLCBjaGFubmVsOiBzZXNzaW9uLCB0ZXh0OiAnL3QnLCBvZmZzZXQ6IDIsXG5cdFx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdC8vIEEgY2hvaWNlIHdpdGggYW4gZW1wdHkgbmFtZSBwcm9kdWNlcyB0aGUgYmFyZSBjb21tYW5kIGFsb25nc2lkZSB0aGUgb3RoZXIgb3B0aW9ucy5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaXRlbXMubWFwKGkgPT4gaS5pbnNlcnRUZXh0KSwgWycvdG9nZ2xlICcsICcvdG9nZ2xlIG9mZiAnLCAnL3RvZ2dsZSBvbiAnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdXJmYWNlcyB0aGUgZnJlZS10ZXh0IGhpbnQgYXMgYW4gYXJndW1lbnQgaGludCB3aGVuIHRoZXJlIGFyZSBubyBjaG9pY2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZ2F0ZWQgPSBuZXcgQ29waWxvdFNsYXNoQ29tbWFuZENvbXBsZXRpb25Qcm92aWRlcignY29waWxvdGNsaScsIHtcblx0XHRcdFx0aXNSdWJiZXJEdWNrRW5hYmxlZDogKCkgPT4gdHJ1ZSxcblx0XHRcdFx0Z2V0UnVudGltZVNsYXNoQ29tbWFuZHM6IGFzeW5jICgpID0+IFtcblx0XHRcdFx0XHR7IG5hbWU6ICd0b2dnbGUnLCBkZXNjcmlwdGlvbjogJ1RvZ2dsZSBhIGZlYXR1cmUgb24gb3Igb2ZmJywga2luZDogJ2J1aWx0aW4nLCBhbGxvd0R1cmluZ0FnZW50RXhlY3V0aW9uOiB0cnVlLCBpbnB1dDogeyBoaW50OiAnW29ufG9mZl0nIH0gfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0Z2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zOiBhc3luYyAoKSA9PiBbXSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBnYXRlZC5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKHtcblx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlVzZXJNZXNzYWdlLCBjaGFubmVsOiBzZXNzaW9uLCB0ZXh0OiAnL3QnLCBvZmZzZXQ6IDIsXG5cdFx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdC8vIFdpdGhvdXQgc3RydWN0dXJlZCBjaG9pY2VzLCB0aGUgZnJlZS10ZXh0IGhpbnQgaXMgbm90IGV4cGFuZGVkIGludG8gb3B0aW9uczsgaXQgaXMgc3VyZmFjZWQgYXMgYW4gYXJndW1lbnQgaGludCBvbiBhIHNpbmdsZSBpdGVtLlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpdGVtcy5tYXAoaXRlbSA9PiAoeyBpbnNlcnRUZXh0OiBpdGVtLmluc2VydFRleHQsIG1ldGE6IGl0ZW0uYXR0YWNobWVudD8uX21ldGEgfSkpLCBbXG5cdFx0XHRcdHsgaW5zZXJ0VGV4dDogJy90b2dnbGUgJywgbWV0YTogeyBjb21tYW5kOiAndG9nZ2xlJywgZGVzY3JpcHRpb246ICdUb2dnbGUgYSBmZWF0dXJlIG9uIG9yIG9mZicsIGFyZ3VtZW50SGludDogJ1tvbnxvZmZdJyB9IH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Bhc3NlcyByYXcgc2Vzc2lvbiBpZCB0byBydW50aW1lIGNvbW1hbmQgbGlzdGluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBzZWVuOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBnYXRlZCA9IG5ldyBDb3BpbG90U2xhc2hDb21tYW5kQ29tcGxldGlvblByb3ZpZGVyKCdjb3BpbG90Y2xpJywge1xuXHRcdFx0XHRpc1J1YmJlckR1Y2tFbmFibGVkOiAoKSA9PiB0cnVlLFxuXHRcdFx0XHRnZXRSdW50aW1lU2xhc2hDb21tYW5kczogYXN5bmMgKGlkOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0XHRzZWVuID0gaWQ7XG5cdFx0XHRcdFx0cmV0dXJuIFt7IG5hbWU6ICdmb2N1cycsIGtpbmQ6ICdidWlsdGluJywgZGVzY3JpcHRpb246ICdGb2N1cycsIGFsbG93RHVyaW5nQWdlbnRFeGVjdXRpb246IHRydWUgfV07XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldFNlc3Npb25DdXN0b21pemF0aW9uczogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IGdhdGVkLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMoe1xuXHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVXNlck1lc3NhZ2UsIGNoYW5uZWw6ICdjb3BpbG90Y2xpOi9hYmMnLCB0ZXh0OiAnL2YnLCBvZmZzZXQ6IDIsXG5cdFx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWVuLCAnYWJjJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdydW50aW1lIHNraWxsIGNvbXBsZXRpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSAnY29waWxvdGNsaTovYWJjJztcblxuXHRcdGZ1bmN0aW9uIHNraWxsKG5hbWU6IHN0cmluZywgZGVzY3JpcHRpb24/OiBzdHJpbmcpOiBTa2lsbEN1c3RvbWl6YXRpb24ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuU2tpbGwsXG5cdFx0XHRcdGlkOiBgZmlsZTovLy9za2lsbHMvJHtuYW1lfS9TS0lMTC5tZGAsXG5cdFx0XHRcdHVyaTogYGZpbGU6Ly8vc2tpbGxzLyR7bmFtZX0vU0tJTEwubWRgLFxuXHRcdFx0XHRuYW1lLFxuXHRcdFx0XHQuLi4oZGVzY3JpcHRpb24gIT09IHVuZGVmaW5lZCA/IHsgZGVzY3JpcHRpb24gfSA6IHt9KSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gcGx1Z2luKG5hbWU6IHN0cmluZywgY2hpbGRyZW4/OiByZWFkb25seSBTa2lsbEN1c3RvbWl6YXRpb25bXSwgZW5hYmxlZCA9IHRydWUpOiBQbHVnaW5DdXN0b21pemF0aW9uIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbixcblx0XHRcdFx0aWQ6IGBmaWxlOi8vL3BsdWdpbnMvJHtuYW1lfWAsXG5cdFx0XHRcdHVyaTogYGZpbGU6Ly8vcGx1Z2lucy8ke25hbWV9YCxcblx0XHRcdFx0bmFtZSxcblx0XHRcdFx0Li4uKGVuYWJsZWQgPyB7fSA6IHtcblx0XHRcdFx0XHQvLyBUT0RPOiBTdGVwIDIgc2VsZWN0cyB0aGUgcGVyc2lzdGVkIGVuYWJsZW1lbnQgc2NvcGUuXG5cdFx0XHRcdFx0ZW5hYmxlbWVudDogW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogZmFsc2UgfV0sXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRsb2FkOiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLkxvYWRlZCB9LFxuXHRcdFx0XHQuLi4oY2hpbGRyZW4gPyB7IGNoaWxkcmVuOiBbLi4uY2hpbGRyZW5dIH0gOiB7fSksXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHN5bmNlZFBsdWdpbihuYW1lOiBzdHJpbmcsIGNoaWxkcmVuPzogcmVhZG9ubHkgU2tpbGxDdXN0b21pemF0aW9uW10pOiBQbHVnaW5DdXN0b21pemF0aW9uIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLnBsdWdpbihuYW1lLCBjaGlsZHJlbiksXG5cdFx0XHRcdGlkOiBgJHtTWU5DRURfQ1VTVE9NSVpBVElPTl9TQ0hFTUV9Oi9wbHVnaW5zLyR7bmFtZX1gLFxuXHRcdFx0XHR1cmk6IGAke1NZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRX06L3BsdWdpbnMvJHtuYW1lfWAsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGNyZWF0ZVByb3ZpZGVyKHJ1bnRpbWVDb21tYW5kczogcmVhZG9ubHkgSUNvcGlsb3RSdW50aW1lU2xhc2hDb21tYW5kSW5mb1tdLCBjdXN0b21pemF0aW9uczogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdID0gW10pOiBDb3BpbG90U2xhc2hDb21tYW5kQ29tcGxldGlvblByb3ZpZGVyIHtcblx0XHRcdHJldHVybiBuZXcgQ29waWxvdFNsYXNoQ29tbWFuZENvbXBsZXRpb25Qcm92aWRlcignY29waWxvdGNsaScsIHtcblx0XHRcdFx0aXNSdWJiZXJEdWNrRW5hYmxlZDogKCkgPT4gdHJ1ZSxcblx0XHRcdFx0Z2V0UnVudGltZVNsYXNoQ29tbWFuZHM6IGFzeW5jICgpID0+IHJ1bnRpbWVDb21tYW5kcyxcblx0XHRcdFx0Z2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zOiBhc3luYyAoKSA9PiBjdXN0b21pemF0aW9ucyxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGFzeW5jIGZ1bmN0aW9uIHJ1bihwcm92aWRlcjogQ29waWxvdFNsYXNoQ29tbWFuZENvbXBsZXRpb25Qcm92aWRlciwgdGV4dDogc3RyaW5nLCBvZmZzZXQgPSB0ZXh0Lmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHByb3ZpZGVyLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMoeyBraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVXNlck1lc3NhZ2UsIGNoYW5uZWw6IHNlc3Npb24sIHRleHQsIG9mZnNldCB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHR9XG5cblx0XHR0ZXN0KCdpbmNsdWRlcyBydW50aW1lIHNraWxscyB0aGF0IGFyZSBub3Qga25vd24gbG9jYWwgc2tpbGxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihbXG5cdFx0XHRcdHsgbmFtZTogJ215LXNraWxsJywgZGVzY3JpcHRpb246ICdSdW50aW1lIHNraWxsJywga2luZDogJ3NraWxsJywgYWxsb3dEdXJpbmdBZ2VudEV4ZWN1dGlvbjogdHJ1ZSB9LFxuXHRcdFx0XSk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHJ1bihwcm92aWRlciwgJy8nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocnVudGltZU9ubHkoaXRlbXMpLm1hcChpID0+IGkuaW5zZXJ0VGV4dCksIFsnL215LXNraWxsICddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4Y2x1ZGVzIHJ1bnRpbWUgc2tpbGxzIHRoYXQgbWF0Y2ggYSBrbm93biBwbHVnaW4gc2tpbGwgKHdpdGggcGx1Z2luIHByZWZpeCknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKFxuXHRcdFx0XHRbeyBuYW1lOiAnbXktcGx1Z2luOm15LXNraWxsJywgZGVzY3JpcHRpb246ICdSdW50aW1lIHNraWxsJywga2luZDogJ3NraWxsJywgYWxsb3dEdXJpbmdBZ2VudEV4ZWN1dGlvbjogdHJ1ZSB9XSxcblx0XHRcdFx0W3BsdWdpbignbXktcGx1Z2luJywgW3NraWxsKCdteS1za2lsbCcpXSldLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgcnVuKHByb3ZpZGVyLCAnLycpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChydW50aW1lT25seShpdGVtcyksIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4Y2x1ZGVzIHJ1bnRpbWUgc2tpbGxzIHRoYXQgbWF0Y2ggYSBrbm93biBwbHVnaW4gc2tpbGwgd2l0aCB0aGUgc2FtZSBuYW1lIChubyBwcmVmaXgpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihcblx0XHRcdFx0W3sgbmFtZTogJ21vbml0b3ItcHInLCBkZXNjcmlwdGlvbjogJ1J1bnRpbWUgc2tpbGwnLCBraW5kOiAnc2tpbGwnLCBhbGxvd0R1cmluZ0FnZW50RXhlY3V0aW9uOiB0cnVlIH1dLFxuXHRcdFx0XHRbcGx1Z2luKCdtb25pdG9yLXByJywgW3NraWxsKCdtb25pdG9yLXByJyldKV0sXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBydW4ocHJvdmlkZXIsICcvJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJ1bnRpbWVPbmx5KGl0ZW1zKSwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXhjbHVkZXMgcnVudGltZSBza2lsbHMgdGhhdCBtYXRjaCBhIGtub3duIHN5bmNlZCBwbHVnaW4gc2tpbGwgKG5vIHByZWZpeCknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKFxuXHRcdFx0XHRbeyBuYW1lOiAnbW9uaXRvci1wcicsIGRlc2NyaXB0aW9uOiAnUnVudGltZSBza2lsbCcsIGtpbmQ6ICdza2lsbCcsIGFsbG93RHVyaW5nQWdlbnRFeGVjdXRpb246IHRydWUgfV0sXG5cdFx0XHRcdFtzeW5jZWRQbHVnaW4oJ3NraWxscy1idW5kbGUnLCBbc2tpbGwoJ21vbml0b3ItcHInKV0pXSxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHJ1bihwcm92aWRlciwgJy8nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocnVudGltZU9ubHkoaXRlbXMpLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleGNsdWRlcyBwcmVmaXhlZCBzeW5jZWQtYnVuZGxlIHJ1bnRpbWUgc2tpbGxzIChyZWFsIHJ1bnRpbWUgc2hhcGUpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gVGhlIENMSSBuYW1lc3BhY2VzIGEgYnVuZGxlZCBza2lsbCBhcyBgPGJ1bmRsZU5hbWU+Ojxza2lsbD5gLCB3aGlsZSB0aGVcblx0XHRcdC8vIGdlbmVyaWMgcHJvdmlkZXIgbGlzdHMgaXQgYmFyZSBcdTIwMTQgc28gdGhlIHByZWZpeGVkIHJ1bnRpbWUgaXRlbSBpcyBhXG5cdFx0XHQvLyBkdXBsaWNhdGUgYW5kIG11c3QgYmUgZHJvcHBlZC5cblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoXG5cdFx0XHRcdFt7IG5hbWU6ICdWUyBDb2RlIFN5bmNlZCBEYXRhOnVwZGF0ZS1wcicsIGRlc2NyaXB0aW9uOiAnUnVudGltZSBza2lsbCcsIGtpbmQ6ICdza2lsbCcsIGFsbG93RHVyaW5nQWdlbnRFeGVjdXRpb246IHRydWUgfV0sXG5cdFx0XHRcdFtzeW5jZWRQbHVnaW4oJ1ZTIENvZGUgU3luY2VkIERhdGEnLCBbc2tpbGwoJ3VwZGF0ZS1wcicpXSldLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgcnVuKHByb3ZpZGVyLCAnLycpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChydW50aW1lT25seShpdGVtcyksIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2tlZXBzIGEgcHJlZml4ZWQgc3luY2VkLWJ1bmRsZSBza2lsbCB3aG9zZSBiYXJlIG5hbWUgaXMgYSBjb25maWcgYWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gQmFyZSBgL3BsYW5gIGlzIGEgY29uZmlnIGFjdGlvbiwgc28gaXQgd291bGQgbm90IHJlYWNoIHRoZSBidW5kbGVkXG5cdFx0XHQvLyBgcGxhbmAgc2tpbGw7IHRoZSBwcmVmaXhlZCBpdGVtIGlzIGtlcHQgc28gdGhlIHNraWxsIHN0YXlzIHJlYWNoYWJsZS5cblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoXG5cdFx0XHRcdFt7IG5hbWU6ICdWUyBDb2RlIFN5bmNlZCBEYXRhOnBsYW4nLCBkZXNjcmlwdGlvbjogJ1J1bnRpbWUgc2tpbGwnLCBraW5kOiAnc2tpbGwnLCBhbGxvd0R1cmluZ0FnZW50RXhlY3V0aW9uOiB0cnVlIH1dLFxuXHRcdFx0XHRbc3luY2VkUGx1Z2luKCdWUyBDb2RlIFN5bmNlZCBEYXRhJywgW3NraWxsKCdwbGFuJyldKV0sXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBydW4ocHJvdmlkZXIsICcvJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJ1bnRpbWVPbmx5KGl0ZW1zKS5tYXAoaSA9PiBpLmluc2VydFRleHQpLCBbJy9WUyBDb2RlIFN5bmNlZCBEYXRhOnBsYW4gJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgna2VlcHMgYSBwcmVmaXhlZCBzeW5jZWQtYnVuZGxlIHNraWxsIHdob3NlIGJhcmUgbmFtZSBjb2xsaWRlcyB3aXRoIGEgbm9uLXNraWxsIHJ1bnRpbWUgY29tbWFuZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIEJhcmUgYC90cmlhZ2VgIHdvdWxkIGhpdCB0aGUgYnVpbHQtaW4gY29tbWFuZCwgc28gdGhlIGJ1bmRsZWQgc2tpbGwgaXNcblx0XHRcdC8vIG9ubHkgcmVhY2hhYmxlIHZpYSB0aGUgcXVhbGlmaWVkIG5hbWUgXHUyMDE0IGtlZXAgaXQuXG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0eyBuYW1lOiAndHJpYWdlJywgZGVzY3JpcHRpb246ICdCdWlsdC1pbicsIGtpbmQ6ICdidWlsdGluJywgYWxsb3dEdXJpbmdBZ2VudEV4ZWN1dGlvbjogdHJ1ZSB9LFxuXHRcdFx0XHRcdHsgbmFtZTogJ1ZTIENvZGUgU3luY2VkIERhdGE6dHJpYWdlJywgZGVzY3JpcHRpb246ICdSdW50aW1lIHNraWxsJywga2luZDogJ3NraWxsJywgYWxsb3dEdXJpbmdBZ2VudEV4ZWN1dGlvbjogdHJ1ZSB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRbc3luY2VkUGx1Z2luKCdWUyBDb2RlIFN5bmNlZCBEYXRhJywgW3NraWxsKCd0cmlhZ2UnKV0pXSxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHJ1bihwcm92aWRlciwgJy8nKTtcblx0XHRcdGFzc2VydC5vayhydW50aW1lT25seShpdGVtcykuc29tZShpID0+IGkuaW5zZXJ0VGV4dCA9PT0gJy9WUyBDb2RlIFN5bmNlZCBEYXRhOnRyaWFnZSAnKSwgJ2J1bmRsZWQgdHJpYWdlIHNraWxsIHNob3VsZCByZW1haW4gcmVhY2hhYmxlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBzdHJpcCByZWFsIChub24tc3luY2VkKSBwbHVnaW4gcHJlZml4ZXMgd2hlbiBhIHN5bmNlZCBidW5kbGUgaXMgcHJlc2VudCcsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIEEgcmVhbCBwbHVnaW4gc2tpbGwgaXMga25vd24gYXMgYG15LXBsdWdpbjpteS1za2lsbGA7IHRoZSBzeW5jZWQtcHJlZml4XG5cdFx0XHQvLyBzdHJpcCBtdXN0IG5vdCBhcHBseSB0byBpdC4gSXQgaXMgZHJvcHBlZCBvbmx5IHZpYSB0aGUgZXhhY3QgbWF0Y2guXG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKFxuXHRcdFx0XHRbeyBuYW1lOiAnbXktcGx1Z2luOm15LXNraWxsJywgZGVzY3JpcHRpb246ICdSdW50aW1lIHNraWxsJywga2luZDogJ3NraWxsJywgYWxsb3dEdXJpbmdBZ2VudEV4ZWN1dGlvbjogdHJ1ZSB9XSxcblx0XHRcdFx0W3N5bmNlZFBsdWdpbignVlMgQ29kZSBTeW5jZWQgRGF0YScsIFtza2lsbCgndXBkYXRlLXByJyldKSwgcGx1Z2luKCdteS1wbHVnaW4nLCBbc2tpbGwoJ215LXNraWxsJyldKV0sXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBydW4ocHJvdmlkZXIsICcvJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJ1bnRpbWVPbmx5KGl0ZW1zKSwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5jbHVkZXMgcnVudGltZSBza2lsbHMgd2hvc2UgbmFtZSBkaWZmZXJzIGZyb20gdGhlIHByZWZpeGVkIGtub3duIHNraWxsIGNhbmRpZGF0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIEEgbm9uLXN5bmNlZCBwbHVnaW4gc2tpbGwgaXMga25vd24gYXMgYG15LXBsdWdpbjpteS1za2lsbGAsIHNvIGEgYmFyZSBgbXktc2tpbGxgIHJ1bnRpbWUgc2tpbGwgaXMgc3RpbGwgc3VyZmFjZWQuXG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKFxuXHRcdFx0XHRbeyBuYW1lOiAnbXktc2tpbGwnLCBkZXNjcmlwdGlvbjogJ1J1bnRpbWUgc2tpbGwnLCBraW5kOiAnc2tpbGwnLCBhbGxvd0R1cmluZ0FnZW50RXhlY3V0aW9uOiB0cnVlIH1dLFxuXHRcdFx0XHRbcGx1Z2luKCdteS1wbHVnaW4nLCBbc2tpbGwoJ215LXNraWxsJyldKV0sXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBydW4ocHJvdmlkZXIsICcvJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJ1bnRpbWVPbmx5KGl0ZW1zKS5tYXAoaSA9PiBpLmluc2VydFRleHQpLCBbJy9teS1za2lsbCAnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0cmVhdHMgc2tpbGxzIGluc2lkZSBkaXNhYmxlZCBjb250YWluZXJzIGFzIHVua25vd24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKFxuXHRcdFx0XHRbeyBuYW1lOiAnbXktcGx1Z2luOm15LXNraWxsJywgZGVzY3JpcHRpb246ICdSdW50aW1lIHNraWxsJywga2luZDogJ3NraWxsJywgYWxsb3dEdXJpbmdBZ2VudEV4ZWN1dGlvbjogdHJ1ZSB9XSxcblx0XHRcdFx0W3BsdWdpbignbXktcGx1Z2luJywgW3NraWxsKCdteS1za2lsbCcpXSwgZmFsc2UpXSxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHJ1bihwcm92aWRlciwgJy8nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocnVudGltZU9ubHkoaXRlbXMpLm1hcChpID0+IGkuaW5zZXJ0VGV4dCksIFsnL215LXBsdWdpbjpteS1za2lsbCAnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpZ25vcmVzIG1jcCBzZXJ2ZXIgY29udGFpbmVycyB3aGVuIGNvbXB1dGluZyBrbm93biBza2lsbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtY3BTZXJ2ZXI6IEN1c3RvbWl6YXRpb24gPSB7XG5cdFx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlcixcblx0XHRcdFx0aWQ6ICdmaWxlOi8vL21jcC9teS1za2lsbCcsXG5cdFx0XHRcdHVyaTogJ2ZpbGU6Ly8vbWNwL215LXNraWxsJyxcblx0XHRcdFx0bmFtZTogJ215LXNraWxsJyxcblx0XHRcdFx0c3RhdGU6IHsga2luZDogTWNwU2VydmVyU3RhdHVzLlJlYWR5IH0sXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihcblx0XHRcdFx0W3sgbmFtZTogJ215LXNraWxsJywgZGVzY3JpcHRpb246ICdSdW50aW1lIHNraWxsJywga2luZDogJ3NraWxsJywgYWxsb3dEdXJpbmdBZ2VudEV4ZWN1dGlvbjogdHJ1ZSB9XSxcblx0XHRcdFx0W21jcFNlcnZlcl0sXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBydW4ocHJvdmlkZXIsICcvJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJ1bnRpbWVPbmx5KGl0ZW1zKS5tYXAoaSA9PiBpLmluc2VydFRleHQpLCBbJy9teS1za2lsbCAnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdXJmYWNlcyB0aGUgc2tpbGwgcHJvbXB0IGhpbnQgYXMgYW4gYXJndW1lbnQgaGludCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoW1xuXHRcdFx0XHR7IG5hbWU6ICdteS1za2lsbCcsIGRlc2NyaXB0aW9uOiAnUnVudGltZSBza2lsbCcsIGtpbmQ6ICdza2lsbCcsIGFsbG93RHVyaW5nQWdlbnRFeGVjdXRpb246IHRydWUsIGlucHV0OiB7IGhpbnQ6ICdkbyBzdHVmZicgfSB9LFxuXHRcdFx0XSk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHJ1bihwcm92aWRlciwgJy8nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocnVudGltZU9ubHkoaXRlbXMpLm1hcChpdGVtID0+ICh7IGluc2VydFRleHQ6IGl0ZW0uaW5zZXJ0VGV4dCwgdHlwZTogaXRlbS5hdHRhY2htZW50Py50eXBlLCBtZXRhOiBpdGVtLmF0dGFjaG1lbnQ/Ll9tZXRhIH0pKSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aW5zZXJ0VGV4dDogJy9teS1za2lsbCAnLFxuXHRcdFx0XHRcdHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5TaW1wbGUsXG5cdFx0XHRcdFx0bWV0YToge1xuXHRcdFx0XHRcdFx0Y29tbWFuZDogJ215LXNraWxsJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnUnVudGltZSBza2lsbCcsXG5cdFx0XHRcdFx0XHRhcmd1bWVudEhpbnQ6ICdkbyBzdHVmZicsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgZXhwYW5kIGEgc2tpbGwgaGludCBpbnRvIG9wdGlvbiBpdGVtcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoW1xuXHRcdFx0XHR7IG5hbWU6ICd0b2dnbGUtc2tpbGwnLCBkZXNjcmlwdGlvbjogJ1RvZ2dsZSBza2lsbCcsIGtpbmQ6ICdza2lsbCcsIGFsbG93RHVyaW5nQWdlbnRFeGVjdXRpb246IHRydWUsIGlucHV0OiB7IGhpbnQ6ICdbb258b2ZmXScgfSB9LFxuXHRcdFx0XSk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHJ1bihwcm92aWRlciwgJy8nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocnVudGltZU9ubHkoaXRlbXMpLm1hcChpID0+IGkuaW5zZXJ0VGV4dCksIFsnL3RvZ2dsZS1za2lsbCAnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdXJmYWNlcyBydW50aW1lIHNraWxscyBhbG9uZ3NpZGUgYnVpbHRpbnMgZm9yIGEgbGVhZGluZyBzbGFzaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoW1xuXHRcdFx0XHR7IG5hbWU6ICdjb21wYWN0JywgZGVzY3JpcHRpb246ICdSdW50aW1lIGNvbXBhY3QnLCBraW5kOiAnYnVpbHRpbicsIGFsbG93RHVyaW5nQWdlbnRFeGVjdXRpb246IHRydWUgfSxcblx0XHRcdFx0eyBuYW1lOiAnYWxwaGEtc2tpbGwnLCBkZXNjcmlwdGlvbjogJ0FscGhhIHNraWxsJywga2luZDogJ3NraWxsJywgYWxsb3dEdXJpbmdBZ2VudEV4ZWN1dGlvbjogdHJ1ZSB9LFxuXHRcdFx0XSk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHJ1bihwcm92aWRlciwgJy8nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocnVudGltZU9ubHkoaXRlbXMpLm1hcChpID0+IGkuaW5zZXJ0VGV4dCksIFsnL2NvbXBhY3QgJywgJy9hbHBoYS1za2lsbCAnXS5zb3J0KCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBvbmx5IHJ1bnRpbWUgc2tpbGxzIGZvciBhbiBpbi1tZXNzYWdlIHNsYXNoIHRva2VuJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihbXG5cdFx0XHRcdHsgbmFtZTogJ3BsYW4nLCBkZXNjcmlwdGlvbjogJ1J1bnRpbWUgcGxhbicsIGtpbmQ6ICdidWlsdGluJywgYWxsb3dEdXJpbmdBZ2VudEV4ZWN1dGlvbjogdHJ1ZSwgaW5wdXQ6IHsgaGludDogJ3Rhc2snIH0gfSxcblx0XHRcdFx0eyBuYW1lOiAncnVudGltZS1vbmx5JywgZGVzY3JpcHRpb246ICdDbGllbnQgY29tbWFuZCcsIGtpbmQ6ICdjbGllbnQnLCBhbGxvd0R1cmluZ0FnZW50RXhlY3V0aW9uOiB0cnVlIH0sXG5cdFx0XHRcdHsgbmFtZTogJ215LXNraWxsJywgZGVzY3JpcHRpb246ICdSdW50aW1lIHNraWxsJywga2luZDogJ3NraWxsJywgYWxsb3dEdXJpbmdBZ2VudEV4ZWN1dGlvbjogdHJ1ZSB9LFxuXHRcdFx0XSk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHJ1bihwcm92aWRlciwgJ3VzZSAvJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGl0ZW1zLm1hcChpID0+IGkuaW5zZXJ0VGV4dCksIFsnL215LXNraWxsICddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4Y2x1ZGVzIGtub3duIHNraWxscyBldmVuIGZvciBhbiBpbi1tZXNzYWdlIHNsYXNoIHRva2VuJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgbmFtZTogJ215LXBsdWdpbjpteS1za2lsbCcsIGRlc2NyaXB0aW9uOiAnS25vd24gc2tpbGwnLCBraW5kOiAnc2tpbGwnLCBhbGxvd0R1cmluZ0FnZW50RXhlY3V0aW9uOiB0cnVlIH0sXG5cdFx0XHRcdFx0eyBuYW1lOiAnb3RoZXItc2tpbGwnLCBkZXNjcmlwdGlvbjogJ1J1bnRpbWUgc2tpbGwnLCBraW5kOiAnc2tpbGwnLCBhbGxvd0R1cmluZ0FnZW50RXhlY3V0aW9uOiB0cnVlIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdFtwbHVnaW4oJ215LXBsdWdpbicsIFtza2lsbCgnbXktc2tpbGwnKV0pXSxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHJ1bihwcm92aWRlciwgJ3VzZSAvJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGl0ZW1zLm1hcChpID0+IGkuaW5zZXJ0VGV4dCksIFsnL290aGVyLXNraWxsICddKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHlCQUF5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
