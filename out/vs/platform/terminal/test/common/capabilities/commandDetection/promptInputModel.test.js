import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../../log/common/log.js";
import { PromptInputModel } from "../../../../common/capabilities/commandDetection/promptInputModel.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { ok, notDeepStrictEqual, strictEqual } from "assert";
import { timeout } from "../../../../../../base/common/async.js";
import { importAMDNodeModule } from "../../../../../../amdX.js";
import { GeneralShellType, PosixShellType } from "../../../../common/terminal.js";
import { runWithFakedTimers } from "../../../../../../base/test/common/timeTravelScheduler.js";
import { TestXtermLogger } from "../../terminalTestHelpers.js";
suite("PromptInputModel", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let promptInputModel;
  let xterm;
  let onCommandStart;
  let onCommandStartChanged;
  let onCommandExecuted;
  let onCommandFinished;
  async function writePromise(data) {
    await new Promise((r) => xterm.write(data, r));
  }
  function fireCommandStart() {
    onCommandStart.fire({ marker: xterm.registerMarker() });
  }
  function fireCommandExecuted() {
    onCommandExecuted.fire(null);
  }
  function fireCommandFinished() {
    onCommandFinished.fire(null);
  }
  function setContinuationPrompt(prompt) {
    promptInputModel.setContinuationPrompt(prompt);
  }
  async function assertPromptInput(valueWithCursor) {
    await timeout(0);
    if (promptInputModel.cursorIndex !== -1 && !valueWithCursor.includes("|")) {
      throw new Error("assertPromptInput must contain | character");
    }
    const actualValueWithCursor = promptInputModel.getCombinedString();
    strictEqual(
      actualValueWithCursor,
      valueWithCursor.replaceAll("\n", "\u23CE")
    );
    const value = valueWithCursor.replace(/[\|\[\]]/g, "");
    const cursorIndex = valueWithCursor.indexOf("|");
    strictEqual(promptInputModel.value, value);
    strictEqual(promptInputModel.cursorIndex, cursorIndex, `value=${promptInputModel.value}`);
    ok(promptInputModel.ghostTextIndex === -1 || cursorIndex <= promptInputModel.ghostTextIndex, `cursorIndex (${cursorIndex}) must be before ghostTextIndex (${promptInputModel.ghostTextIndex})`);
  }
  setup(async () => {
    const TerminalCtor = (await importAMDNodeModule("@xterm/xterm", "lib/xterm.js")).Terminal;
    xterm = store.add(new TerminalCtor({ allowProposedApi: true, logger: TestXtermLogger }));
    onCommandStart = store.add(new Emitter());
    onCommandStartChanged = store.add(new Emitter());
    onCommandExecuted = store.add(new Emitter());
    onCommandFinished = store.add(new Emitter());
    promptInputModel = store.add(new PromptInputModel(xterm, onCommandStart.event, onCommandStartChanged.event, onCommandExecuted.event, onCommandFinished.event, new NullLogService()));
  });
  test("basic input and execute", async () => {
    await writePromise("$ ");
    fireCommandStart();
    await assertPromptInput("|");
    await writePromise("foo bar");
    await assertPromptInput("foo bar|");
    await writePromise("\r\n");
    fireCommandExecuted();
    await assertPromptInput("foo bar");
    await writePromise("(command output)\r\n$ ");
    fireCommandStart();
    await assertPromptInput("|");
  });
  test("should not fire onDidChangeInput events when nothing changes", async () => {
    const events = [];
    store.add(promptInputModel.onDidChangeInput((e) => events.push(e)));
    await writePromise("$ ");
    fireCommandStart();
    await assertPromptInput("|");
    await writePromise("foo");
    await assertPromptInput("foo|");
    await writePromise(" bar");
    await assertPromptInput("foo bar|");
    await writePromise("\r\n");
    fireCommandExecuted();
    await assertPromptInput("foo bar");
    await writePromise("$ ");
    fireCommandStart();
    await assertPromptInput("|");
    await writePromise("foo bar");
    await assertPromptInput("foo bar|");
    for (let i = 0; i < events.length - 1; i++) {
      notDeepStrictEqual(events[i], events[i + 1], "not adjacent events should fire with the same value");
    }
  });
  test("should fire onDidInterrupt followed by onDidFinish when ctrl+c is pressed", async () => {
    await writePromise("$ ");
    fireCommandStart();
    await assertPromptInput("|");
    await writePromise("foo");
    await assertPromptInput("foo|");
    await new Promise((r) => {
      store.add(promptInputModel.onDidInterrupt(() => {
        store.add(promptInputModel.onDidFinishInput(() => {
          r();
        }));
      }));
      xterm.input("");
      writePromise("^C").then(() => fireCommandExecuted());
    });
  });
  test("should clear value when command finishes", async () => {
    await writePromise("$ ");
    fireCommandStart();
    await assertPromptInput("|");
    await writePromise("echo hello");
    await assertPromptInput("echo hello|");
    fireCommandExecuted();
    strictEqual(promptInputModel.value, "echo hello");
    fireCommandFinished();
    strictEqual(promptInputModel.value, "");
  });
  test("cursor navigation", async () => {
    await writePromise("$ ");
    fireCommandStart();
    await assertPromptInput("|");
    await writePromise("foo bar");
    await assertPromptInput("foo bar|");
    await writePromise("\x1B[3D");
    await assertPromptInput("foo |bar");
    await writePromise("\x1B[4D");
    await assertPromptInput("|foo bar");
    await writePromise("\x1B[3C");
    await assertPromptInput("foo| bar");
    await writePromise("\x1B[4C");
    await assertPromptInput("foo bar|");
    await writePromise("\x1B[D");
    await assertPromptInput("foo ba|r");
    await writePromise("\x1B[C");
    await assertPromptInput("foo bar|");
  });
  suite("ghost text", () => {
    test("basic ghost text", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise("foo\x1B[2m bar\x1B[0m\x1B[4D");
      await assertPromptInput("foo|[ bar]");
      await writePromise("\x1B[2D");
      await assertPromptInput("f|oo[ bar]");
    });
    test("trailing whitespace", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise("foo    ");
      await writePromise("\x1B[4D");
      await assertPromptInput("foo|    ");
    });
    test("basic ghost text one word", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise("pw\x1B[2md\x1B[1D");
      await assertPromptInput("pw|[d]");
    });
    test("ghost text with cursor navigation", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise("foo\x1B[2m bar\x1B[0m\x1B[4D");
      await assertPromptInput("foo|[ bar]");
      await writePromise("\x1B[2D");
      await assertPromptInput("f|oo[ bar]");
      await writePromise("\x1B[C");
      await assertPromptInput("fo|o[ bar]");
      await writePromise("\x1B[C");
      await assertPromptInput("foo|[ bar]");
    });
    test("ghost text with different foreground colors only", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise("foo\x1B[38;2;255;0;0m bar\x1B[0m\x1B[4D");
      await assertPromptInput("foo|[ bar]");
      await writePromise("\x1B[2D");
      await assertPromptInput("f|oo[ bar]");
    });
    test("no ghost text when foreground color matches earlier text", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise(
        "\x1B[38;2;255;0;0mred1\x1B[0m \x1B[38;2;0;255;0mgreen\x1B[0m \x1B[38;2;255;0;0mred2\x1B[0m"
        // Red "red2" (same as red1)
      );
      await assertPromptInput("red1 green red2|");
    });
    test("ghost text detected when foreground color is unique at the end", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise(
        "\x1B[38;2;255;0;0mcmd\x1B[0m \x1B[38;2;0;255;0marg\x1B[0m \x1B[38;2;0;0;255mfinal\x1B[5D"
        // Blue "final" (ghost text)
      );
      await assertPromptInput("cmd arg |[final]");
    });
    test("no ghost text when background color matches earlier text", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise(
        "\x1B[48;2;255;0;0mred_bg1\x1B[0m \x1B[48;2;0;255;0mgreen_bg\x1B[0m \x1B[48;2;255;0;0mred_bg2\x1B[0m"
        // Red background again
      );
      await assertPromptInput("red_bg1 green_bg red_bg2|");
    });
    test("ghost text detected when background color is unique at the end", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise(
        "\x1B[48;2;255;0;0mred_bg\x1B[0m \x1B[48;2;0;255;0mgreen_bg\x1B[0m \x1B[48;2;0;0;255mblue_bg\x1B[7D"
        // Blue background (ghost text)
      );
      await assertPromptInput("red_bg green_bg |[blue_bg]");
    });
    test("ghost text detected when bold style is unique at the end", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise(
        "text \x1B[1mBOLD\x1B[4D"
        // Bold "BOLD" (ghost text)
      );
      await assertPromptInput("text |[BOLD]");
    });
    test("no ghost text when earlier text has the same bold style", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise(
        "\x1B[1mBOLD1\x1B[0m normal \x1B[1mBOLD2\x1B[0m"
        // Bold "BOLD2" (same style as "BOLD1")
      );
      await assertPromptInput("BOLD1 normal BOLD2|");
    });
    test("ghost text detected when italic style is unique at the end", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise(
        "text \x1B[3mITALIC\x1B[6D"
        // Italic "ITALIC" (ghost text)
      );
      await assertPromptInput("text |[ITALIC]");
    });
    test("no ghost text when earlier text has the same italic style", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise(
        "\x1B[3mITALIC1\x1B[0m normal \x1B[3mITALIC2\x1B[0m"
        // Italic "ITALIC2" (same style as "ITALIC1")
      );
      await assertPromptInput("ITALIC1 normal ITALIC2|");
    });
    test("ghost text detected when underline style is unique at the end", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise(
        "text \x1B[4mUNDERLINE\x1B[9D"
        // Underlined "UNDERLINE" (ghost text)
      );
      await assertPromptInput("text |[UNDERLINE]");
    });
    test("no ghost text when earlier text has the same underline style", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise(
        "\x1B[4mUNDERLINE1\x1B[0m normal \x1B[4mUNDERLINE2\x1B[0m"
        // Underlined "UNDERLINE2" (same style as "UNDERLINE1")
      );
      await assertPromptInput("UNDERLINE1 normal UNDERLINE2|");
    });
    test("ghost text detected when strikethrough style is unique at the end", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise(
        "text \x1B[9mSTRIKE\x1B[6D"
        // Strikethrough "STRIKE" (ghost text)
      );
      await assertPromptInput("text |[STRIKE]");
    });
    test("no ghost text when earlier text has the same strikethrough style", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise(
        "\x1B[9mSTRIKE1\x1B[0m normal \x1B[9mSTRIKE2\x1B[0m"
        // Strikethrough "STRIKE2" (same style as "STRIKE1")
      );
      await assertPromptInput("STRIKE1 normal STRIKE2|");
    });
    suite("With wrapping", () => {
      test("Fish ghost text in long line with wrapped content", async () => {
        promptInputModel.setShellType(PosixShellType.Fish);
        await writePromise("$ ");
        fireCommandStart();
        await assertPromptInput("|");
        await writePromise("find . -name");
        await assertPromptInput(`find . -name|`);
        await writePromise("\x1B[2m test\x1B[0m\x1B[4D");
        await assertPromptInput(`find . -name |[test]`);
        await writePromise("\x1B[C");
        await assertPromptInput(`find . -name t|[est]`);
        await writePromise("\x1B[C\x1B[C\x1B[C\x1B[C\x1B[C");
        await assertPromptInput(`find . -name test|`);
      });
      test("Pwsh ghost text in long line with wrapped content", async () => {
        promptInputModel.setShellType(GeneralShellType.PowerShell);
        await writePromise("$ ");
        fireCommandStart();
        await assertPromptInput("|");
        await writePromise("find . -name");
        await assertPromptInput(`find . -name|`);
        await writePromise("\x1B[2m test\x1B[0m\x1B[4D");
        await assertPromptInput(`find . -name |[test]`);
        await writePromise("\x1B[C");
        await assertPromptInput(`find . -name t|[est]`);
        await writePromise("\x1B[C\x1B[C\x1B[C\x1B[C\x1B[C");
        await assertPromptInput(`find . -name test|`);
      });
    });
    test("Does not detect right prompt as ghost text", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise("cmd" + " ".repeat(6) + "\x1B[38;2;255;0;0mRP\x1B[0m\x1B[8D");
      await assertPromptInput("cmd|" + " ".repeat(6) + "RP");
    });
  });
  test("wide input (Korean)", async () => {
    await writePromise("$ ");
    fireCommandStart();
    await assertPromptInput("|");
    await writePromise("\uC548\uC601");
    await assertPromptInput("\uC548\uC601|");
    await writePromise("\r\n\uCEF4\uD4E8\uD130");
    await assertPromptInput("\uC548\uC601\n\uCEF4\uD4E8\uD130|");
    await writePromise("\r\n\uC0AC\uB78C");
    await assertPromptInput("\uC548\uC601\n\uCEF4\uD4E8\uD130\n\uC0AC\uB78C|");
    await writePromise("\x1B[G");
    await assertPromptInput("\uC548\uC601\n\uCEF4\uD4E8\uD130\n|\uC0AC\uB78C");
    await writePromise("\x1B[A");
    await assertPromptInput("\uC548\uC601\n|\uCEF4\uD4E8\uD130\n\uC0AC\uB78C");
    await writePromise("\x1B[4C");
    await assertPromptInput("\uC548\uC601\n\uCEF4\uD4E8|\uD130\n\uC0AC\uB78C");
    await writePromise("\x1B[1;4H");
    await assertPromptInput("\uC548|\uC601\n\uCEF4\uD4E8\uD130\n\uC0AC\uB78C");
    await writePromise("\x1B[D");
    await assertPromptInput("|\uC548\uC601\n\uCEF4\uD4E8\uD130\n\uC0AC\uB78C");
  });
  test("emoji input", async () => {
    await writePromise("$ ");
    fireCommandStart();
    await assertPromptInput("|");
    await writePromise("\u270C\uFE0F\u{1F44D}");
    await assertPromptInput("\u270C\uFE0F\u{1F44D}|");
    await writePromise("\r\n\u{1F60E}\u{1F615}\u{1F605}");
    await assertPromptInput("\u270C\uFE0F\u{1F44D}\n\u{1F60E}\u{1F615}\u{1F605}|");
    await writePromise("\r\n\u{1F914}\u{1F937}\u{1F629}");
    await assertPromptInput("\u270C\uFE0F\u{1F44D}\n\u{1F60E}\u{1F615}\u{1F605}\n\u{1F914}\u{1F937}\u{1F629}|");
    await writePromise("\x1B[G");
    await assertPromptInput("\u270C\uFE0F\u{1F44D}\n\u{1F60E}\u{1F615}\u{1F605}\n|\u{1F914}\u{1F937}\u{1F629}");
    await writePromise("\x1B[A");
    await assertPromptInput("\u270C\uFE0F\u{1F44D}\n|\u{1F60E}\u{1F615}\u{1F605}\n\u{1F914}\u{1F937}\u{1F629}");
    await writePromise("\x1B[2C");
    await assertPromptInput("\u270C\uFE0F\u{1F44D}\n\u{1F60E}\u{1F615}|\u{1F605}\n\u{1F914}\u{1F937}\u{1F629}");
    await writePromise("\x1B[1;4H");
    await assertPromptInput("\u270C\uFE0F|\u{1F44D}\n\u{1F60E}\u{1F615}\u{1F605}\n\u{1F914}\u{1F937}\u{1F629}");
    await writePromise("\x1B[D");
    await assertPromptInput("|\u270C\uFE0F\u{1F44D}\n\u{1F60E}\u{1F615}\u{1F605}\n\u{1F914}\u{1F937}\u{1F629}");
  });
  suite("trailing whitespace", () => {
    test("cursor index calculation with whitespace", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise("echo   ");
      await assertPromptInput("echo   |");
      await writePromise("\x1B[3D");
      await assertPromptInput("echo|   ");
      await writePromise("\x1B[C");
      await assertPromptInput("echo |  ");
      await writePromise("\x1B[C");
      await assertPromptInput("echo  | ");
      await writePromise("\x1B[C");
      await assertPromptInput("echo   |");
    });
    test("cursor index should not exceed command line length", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise("cmd");
      await assertPromptInput("cmd|");
      await writePromise("\x1B[10C");
      await assertPromptInput("cmd|");
    });
    test("whitespace preservation in cursor calculation", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise("ls   -la");
      await assertPromptInput("ls   -la|");
      await writePromise("\x1B[3D");
      await assertPromptInput("ls   |-la");
      await writePromise("\x1B[3D");
      await assertPromptInput("ls|   -la");
      await writePromise("\x1B[2C");
      await assertPromptInput("ls  | -la");
    });
    test("delete whitespace with backspace", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise(" ");
      await assertPromptInput(` |`);
      xterm.input("\x7F", true);
      await writePromise("\x1B[D");
      await assertPromptInput("|");
      xterm.input(" ".repeat(4), true);
      await writePromise(" ".repeat(4));
      await assertPromptInput(`    |`);
      xterm.input("\x1B[D".repeat(2), true);
      await writePromise("\x1B[2D");
      await assertPromptInput(`  |  `);
      xterm.input("\x7F", true);
      await writePromise("\x1B[D");
      await assertPromptInput(` |  `);
      xterm.input("\x7F", true);
      await writePromise("\x1B[D");
      await assertPromptInput(`|  `);
      xterm.input(" ", true);
      await writePromise(" ");
      await assertPromptInput(` |  `);
      xterm.input(" ", true);
      await writePromise(" ");
      await assertPromptInput(`  |  `);
      xterm.input("\x1B[C", true);
      await writePromise("\x1B[C");
      await assertPromptInput(`   | `);
      xterm.input("a", true);
      await writePromise("a");
      await assertPromptInput(`   a| `);
      xterm.input("\x7F", true);
      await writePromise("\x1B[D\x1B[K");
      await assertPromptInput(`   | `);
      xterm.input("\x1B[D".repeat(2), true);
      await writePromise("\x1B[2D");
      await assertPromptInput(` |   `);
      xterm.input("\x1B[3~", true);
      await writePromise("");
      await assertPromptInput(` |  `);
    });
    test.skip("track whitespace when ConPTY deletes whitespace unexpectedly", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      xterm.input("ls", true);
      await writePromise("ls");
      await assertPromptInput(`ls|`);
      xterm.input(" ".repeat(4), true);
      await writePromise(" ".repeat(4));
      await assertPromptInput(`ls    |`);
      xterm.input(" ", true);
      await writePromise("\x1B[4D\x1B[5X\x1B[5C");
      await assertPromptInput(`ls     |`);
    });
    test("track whitespace beyond cursor", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise(" ".repeat(8));
      await assertPromptInput(`${" ".repeat(8)}|`);
      await writePromise("\x1B[4D");
      await assertPromptInput(`${" ".repeat(4)}|${" ".repeat(4)}`);
    });
  });
  suite("multi-line", () => {
    test("basic 2 line", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise('echo "a');
      await assertPromptInput(`echo "a|`);
      await writePromise("\n\r\u2219 ");
      setContinuationPrompt("\u2219 ");
      await assertPromptInput(`echo "a
|`);
      await writePromise("b");
      await assertPromptInput(`echo "a
b|`);
    });
    test("basic 3 line", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise('echo "a');
      await assertPromptInput(`echo "a|`);
      await writePromise("\n\r\u2219 ");
      setContinuationPrompt("\u2219 ");
      await assertPromptInput(`echo "a
|`);
      await writePromise("b");
      await assertPromptInput(`echo "a
b|`);
      await writePromise("\n\r\u2219 ");
      setContinuationPrompt("\u2219 ");
      await assertPromptInput(`echo "a
b
|`);
      await writePromise("c");
      await assertPromptInput(`echo "a
b
c|`);
    });
    test("navigate left in multi-line", async () => {
      return runWithFakedTimers({}, async () => {
        await writePromise("$ ");
        fireCommandStart();
        await assertPromptInput("|");
        await writePromise('echo "a');
        await assertPromptInput(`echo "a|`);
        await writePromise("\n\r\u2219 ");
        setContinuationPrompt("\u2219 ");
        await assertPromptInput(`echo "a
|`);
        await writePromise("b");
        await assertPromptInput(`echo "a
b|`);
        await writePromise("\x1B[D");
        await assertPromptInput(`echo "a
|b`);
        await writePromise("\x1B[@c");
        await assertPromptInput(`echo "a
c|b`);
        await writePromise("\x1B[K\n\r\u2219 ");
        await assertPromptInput(`echo "a
c
|`);
        await writePromise("b");
        await assertPromptInput(`echo "a
c
b|`);
        await writePromise(" foo");
        await assertPromptInput(`echo "a
c
b foo|`);
        await writePromise("\x1B[3D");
        await assertPromptInput(`echo "a
c
b |foo`);
      });
    });
    test("navigate up in multi-line", async () => {
      return runWithFakedTimers({}, async () => {
        await writePromise("$ ");
        fireCommandStart();
        await assertPromptInput("|");
        await writePromise('echo "foo');
        await assertPromptInput(`echo "foo|`);
        await writePromise("\n\r\u2219 ");
        setContinuationPrompt("\u2219 ");
        await assertPromptInput(`echo "foo
|`);
        await writePromise("bar");
        await assertPromptInput(`echo "foo
bar|`);
        await writePromise("\n\r\u2219 ");
        setContinuationPrompt("\u2219 ");
        await assertPromptInput(`echo "foo
bar
|`);
        await writePromise("baz");
        await assertPromptInput(`echo "foo
bar
baz|`);
        await writePromise("\x1B[A");
        await assertPromptInput(`echo "foo
bar|
baz`);
        await writePromise("\x1B[D");
        await assertPromptInput(`echo "foo
ba|r
baz`);
        await writePromise("\x1B[D");
        await assertPromptInput(`echo "foo
b|ar
baz`);
        await writePromise("\x1B[D");
        await assertPromptInput(`echo "foo
|bar
baz`);
        await writePromise("\x1B[1;9H");
        await assertPromptInput(`echo "|foo
bar
baz`);
        await writePromise("\x1B[C");
        await assertPromptInput(`echo "f|oo
bar
baz`);
        await writePromise("\x1B[C");
        await assertPromptInput(`echo "fo|o
bar
baz`);
        await writePromise("\x1B[C");
        await assertPromptInput(`echo "foo|
bar
baz`);
      });
    });
    test("navigating up when first line contains invalid/stale trailing whitespace", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise('echo "foo      \x1B[6D');
      await assertPromptInput(`echo "foo|`);
      await writePromise("\n\r\u2219 ");
      setContinuationPrompt("\u2219 ");
      await assertPromptInput(`echo "foo
|`);
      await writePromise("bar");
      await assertPromptInput(`echo "foo
bar|`);
      await writePromise("\x1B[D");
      await assertPromptInput(`echo "foo
ba|r`);
      await writePromise("\x1B[D");
      await assertPromptInput(`echo "foo
b|ar`);
      await writePromise("\x1B[D");
      await assertPromptInput(`echo "foo
|bar`);
    });
  });
  suite("multi-line wrapped (no continuation prompt)", () => {
    test("basic wrapped line", async () => {
      return runWithFakedTimers({}, async () => {
        xterm.resize(5, 10);
        await writePromise("$ ");
        fireCommandStart();
        await assertPromptInput("|");
        await writePromise("ech");
        await assertPromptInput(`ech|`);
        await writePromise("o ");
        await assertPromptInput(`echo |`);
        await writePromise('"a"');
        await assertPromptInput(`echo "a"| `);
        await writePromise("\n\r b");
        await assertPromptInput(`echo "a"
 b|`);
        await writePromise("\n\r c");
        await assertPromptInput(`echo "a"
 b
 c|`);
      });
    });
  });
  suite("multi-line wrapped (continuation prompt)", () => {
    test("basic wrapped line", async () => {
      xterm.resize(5, 10);
      promptInputModel.setContinuationPrompt("\u2219 ");
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise("ech");
      await assertPromptInput(`ech|`);
      await writePromise("o ");
      await assertPromptInput(`echo |`);
      await writePromise('"a"');
      await assertPromptInput(`echo "a"| `);
      await writePromise("\n\r\u2219 ");
      await assertPromptInput(`echo "a"
|`);
      await writePromise("b");
      await assertPromptInput(`echo "a"
b|`);
      await writePromise("\n\r\u2219 ");
      await assertPromptInput(`echo "a"
b
|`);
      await writePromise("c");
      await assertPromptInput(`echo "a"
b
c|`);
      await writePromise("\n\r\u2219 ");
      await assertPromptInput(`echo "a"
b
c
|`);
    });
  });
  suite("multi-line wrapped fish", () => {
    test("forward slash continuation", async () => {
      promptInputModel.setShellType(PosixShellType.Fish);
      await writePromise("$ ");
      await assertPromptInput("|");
      await writePromise("[I] meganrogge@Megans-MacBook-Pro ~ (main|BISECTING)>");
      fireCommandStart();
      await writePromise("ech\\");
      await assertPromptInput(`ech\\|`);
      await writePromise("\no bye");
      await assertPromptInput(`echo bye|`);
    });
    test("newline with no continuation", async () => {
      promptInputModel.setShellType(PosixShellType.Fish);
      await writePromise("$ ");
      await assertPromptInput("|");
      await writePromise("[I] meganrogge@Megans-MacBook-Pro ~ (main|BISECTING)>");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise('echo "hi');
      await assertPromptInput(`echo "hi|`);
      await writePromise('\nand bye\nwhy"');
      await assertPromptInput(`echo "hi
and bye
why"|`);
    });
  });
  suite("recorded sessions", () => {
    async function replayEvents(events) {
      for (const data of events) {
        await writePromise(data);
      }
    }
    suite("Windows 11 (10.0.22621.3447), pwsh 7.4.2, starship prompt 1.10.2", () => {
      test("input with ignored ghost text", async () => {
        return runWithFakedTimers({}, async () => {
          await replayEvents([
            "\x1B[?25l\x1B[2J\x1B[m\x1B[H\x1B]0;C:\\Program Files\\WindowsApps\\Microsoft.PowerShell_7.4.2.0_x64__8wekyb3d8bbwe\\pwsh.exe\x07\x1B[?25h",
            "\x1B[?25l\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\x1B[H\x1B[?25h",
            "\x1B]633;P;IsWindows=True\x07",
            "\x1B]633;P;ContinuationPrompt=\x1B[38;5;8m\u2219\x1B[0m \x07",
            "\x1B]633;A\x07\x1B]633;P;Cwd=C:\\Github\\microsoft\\vscode\x07\x1B]633;B\x07",
            "\x1B[34m\r\n\uE0B6\x1B[38;2;17;17;17m\x1B[44m03:13:47 \x1B[34m\x1B[41m\uE0B0 \x1B[38;2;17;17;17mvscode \x1B[31m\x1B[43m\uE0B0 \x1B[38;2;17;17;17m\uE0A0 tyriar/prompt_input_model \x1B[33m\x1B[46m\uE0B0 \x1B[38;2;17;17;17m$\u21E1 \x1B[36m\x1B[49m\uE0B0 \x1B[mvia \x1B[32m\x1B[1m\uE718 v18.18.2 \r\n\u276F\x1B[m "
          ]);
          fireCommandStart();
          await assertPromptInput("|");
          await replayEvents([
            "\x1B[?25l\x1B[93mf\x1B[97m\x1B[2m\x1B[3makecommand\x1B[3;4H\x1B[?25h",
            "\x1B[m",
            "\x1B[93m\bfo\x1B[9X",
            "\x1B[m",
            "\x1B[?25l\x1B[93m\x1B[3;3Hfoo\x1B[?25h",
            "\x1B[m"
          ]);
          await assertPromptInput("foo|");
        });
      });
      test("input with accepted and run ghost text", async () => {
        return runWithFakedTimers({}, async () => {
          await replayEvents([
            "\x1B[?25l\x1B[2J\x1B[m\x1B[H\x1B]0;C:\\Program Files\\WindowsApps\\Microsoft.PowerShell_7.4.2.0_x64__8wekyb3d8bbwe\\pwsh.exe\x07\x1B[?25h",
            "\x1B[?25l\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\x1B[H\x1B[?25h",
            "\x1B]633;P;IsWindows=True\x07",
            "\x1B]633;P;ContinuationPrompt=\x1B[38;5;8m\u2219\x1B[0m \x07",
            "\x1B]633;A\x07\x1B]633;P;Cwd=C:\\Github\\microsoft\\vscode\x07\x1B]633;B\x07",
            "\x1B[34m\r\n\uE0B6\x1B[38;2;17;17;17m\x1B[44m03:41:36 \x1B[34m\x1B[41m\uE0B0 \x1B[38;2;17;17;17mvscode \x1B[31m\x1B[43m\uE0B0 \x1B[38;2;17;17;17m\uE0A0 tyriar/prompt_input_model \x1B[33m\x1B[46m\uE0B0 \x1B[38;2;17;17;17m$ \x1B[36m\x1B[49m\uE0B0 \x1B[mvia \x1B[32m\x1B[1m\uE718 v18.18.2 \r\n\u276F\x1B[m "
          ]);
          promptInputModel.setContinuationPrompt("\u2219 ");
          fireCommandStart();
          await assertPromptInput("|");
          await replayEvents([
            '\x1B[?25l\x1B[93me\x1B[97m\x1B[2m\x1B[3mcho "hello world"\x1B[3;4H\x1B[?25h',
            "\x1B[m"
          ]);
          await assertPromptInput('e|[cho "hello world"]');
          await replayEvents([
            '\x1B[?25l\x1B[93m\bec\x1B[97m\x1B[2m\x1B[3mho "hello world"\x1B[3;5H\x1B[?25h',
            "\x1B[m"
          ]);
          await assertPromptInput('ec|[ho "hello world"]');
          await replayEvents([
            '\x1B[?25l\x1B[93m\x1B[3;3Hech\x1B[97m\x1B[2m\x1B[3mo "hello world"\x1B[3;6H\x1B[?25h',
            "\x1B[m"
          ]);
          await assertPromptInput('ech|[o "hello world"]');
          await replayEvents([
            '\x1B[?25l\x1B[93m\x1B[3;3Hecho\x1B[97m\x1B[2m\x1B[3m "hello world"\x1B[3;7H\x1B[?25h',
            "\x1B[m"
          ]);
          await assertPromptInput('echo|[ "hello world"]');
          await replayEvents([
            '\x1B[?25l\x1B[93m\x1B[3;3Hecho \x1B[97m\x1B[2m\x1B[3m"hello world"\x1B[3;8H\x1B[?25h',
            "\x1B[m"
          ]);
          await assertPromptInput('echo |["hello world"]');
          await replayEvents([
            '\x1B[?25l\x1B[93m\x1B[3;3Hecho \x1B[36m"hello world"\x1B[?25h',
            "\x1B[m"
          ]);
          await assertPromptInput('echo "hello world"|');
          await replayEvents([
            '\x1B]633;E;echo "hello world";ff464d39-bc80-4bae-9ead-b1cafc4adf6f\x07\x1B]633;C\x07'
          ]);
          fireCommandExecuted();
          await assertPromptInput('echo "hello world"');
          await replayEvents([
            "\r\n",
            "hello world\r\n"
          ]);
          await assertPromptInput('echo "hello world"');
          await replayEvents([
            "\x1B]633;D;0\x07\x1B]633;A\x07\x1B]633;P;Cwd=C:\\Github\\microsoft\\vscode\x07\x1B]633;B\x07",
            "\x1B[34m\r\n\uE0B6\x1B[38;2;17;17;17m\x1B[44m03:41:42 \x1B[34m\x1B[41m\uE0B0 \x1B[38;2;17;17;17mvscode \x1B[31m\x1B[43m\uE0B0 \x1B[38;2;17;17;17m\uE0A0 tyriar/prompt_input_model \x1B[33m\x1B[46m\uE0B0 \x1B[38;2;17;17;17m$ \x1B[36m\x1B[49m\uE0B0 \x1B[mvia \x1B[32m\x1B[1m\uE718 v18.18.2 \r\n\u276F\x1B[m "
          ]);
          fireCommandStart();
          await assertPromptInput("|");
        });
      });
      test("input, go to start (ctrl+home), delete word in front (ctrl+delete)", async () => {
        return runWithFakedTimers({}, async () => {
          await replayEvents([
            "\x1B[?25l\x1B[2J\x1B[m\x1B[H\x1B]0;C:Program FilesWindowsAppsMicrosoft.PowerShell_7.4.2.0_x64__8wekyb3d8bbwepwsh.exe\x07\x1B[?25h",
            "\x1B[?25l\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\x1B[H\x1B[?25h",
            "\x1B]633;P;IsWindows=True\x07",
            "\x1B]633;P;ContinuationPrompt=\x1B[38;5;8m\u2219\x1B[0m \x07",
            "\x1B]633;A\x07\x1B]633;P;Cwd=C:\\Github\\microsoft\\vscode\x07\x1B]633;B\x07",
            "\x1B[34m\r\n\uE0B6\x1B[38;2;17;17;17m\x1B[44m16:07:06 \x1B[34m\x1B[41m\uE0B0 \x1B[38;2;17;17;17mvscode \x1B[31m\x1B[43m\uE0B0 \x1B[38;2;17;17;17m\uE0A0 tyriar/210662 \x1B[33m\x1B[46m\uE0B0 \x1B[38;2;17;17;17m$! \x1B[36m\x1B[49m\uE0B0 \x1B[mvia \x1B[32m\x1B[1m\uE718 v18.18.2 \r\n\u276F\x1B[m "
          ]);
          fireCommandStart();
          await assertPromptInput("|");
          await replayEvents([
            "\x1B[?25l\x1B[93mG\x1B[97m\x1B[2m\x1B[3mit push\x1B[3;4H\x1B[?25h",
            "\x1B[m",
            "\x1B[?25l\x1B[93m\bGe\x1B[97m\x1B[2m\x1B[3mt-ChildItem -Path a\x1B[3;5H\x1B[?25h",
            "\x1B[m",
            "\x1B[?25l\x1B[93m\x1B[3;3HGet\x1B[97m\x1B[2m\x1B[3m-ChildItem -Path a\x1B[3;6H\x1B[?25h"
          ]);
          await assertPromptInput("Get|[-ChildItem -Path a]");
          await replayEvents([
            "\x1B[m",
            "\x1B[?25l\x1B[3;3H\x1B[?25h",
            "\x1B[21X"
          ]);
          await timeout(0);
          const actualValueWithCursor = promptInputModel.getCombinedString();
          strictEqual(
            actualValueWithCursor,
            "|".replaceAll("\n", "\u23CE")
          );
        });
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdGVybWluYWxcXHRlc3RcXGNvbW1vblxcY2FwYWJpbGl0aWVzXFxjb21tYW5kRGV0ZWN0aW9uXFxwcm9tcHRJbnB1dE1vZGVsLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSB7IFRlcm1pbmFsIH0gZnJvbSAnQHh0ZXJtL2hlYWRsZXNzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBQcm9tcHRJbnB1dE1vZGVsLCB0eXBlIElQcm9tcHRJbnB1dE1vZGVsU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY2FwYWJpbGl0aWVzL2NvbW1hbmREZXRlY3Rpb24vcHJvbXB0SW5wdXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHR5cGUgeyBJVGVybWluYWxDb21tYW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NhcGFiaWxpdGllcy9jYXBhYmlsaXRpZXMuanMnO1xuaW1wb3J0IHsgb2ssIG5vdERlZXBTdHJpY3RFcXVhbCwgc3RyaWN0RXF1YWwgfSBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGltcG9ydEFNRE5vZGVNb2R1bGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9hbWRYLmpzJztcbmltcG9ydCB7IEdlbmVyYWxTaGVsbFR5cGUsIFBvc2l4U2hlbGxUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBUZXN0WHRlcm1Mb2dnZXIgfSBmcm9tICcuLi8uLi90ZXJtaW5hbFRlc3RIZWxwZXJzLmpzJztcblxuc3VpdGUoJ1Byb21wdElucHV0TW9kZWwnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IHByb21wdElucHV0TW9kZWw6IFByb21wdElucHV0TW9kZWw7XG5cdGxldCB4dGVybTogVGVybWluYWw7XG5cdGxldCBvbkNvbW1hbmRTdGFydDogRW1pdHRlcjxJVGVybWluYWxDb21tYW5kPjtcblx0bGV0IG9uQ29tbWFuZFN0YXJ0Q2hhbmdlZDogRW1pdHRlcjx2b2lkPjtcblx0bGV0IG9uQ29tbWFuZEV4ZWN1dGVkOiBFbWl0dGVyPElUZXJtaW5hbENvbW1hbmQ+O1xuXHRsZXQgb25Db21tYW5kRmluaXNoZWQ6IEVtaXR0ZXI8SVRlcm1pbmFsQ29tbWFuZD47XG5cblx0YXN5bmMgZnVuY3Rpb24gd3JpdGVQcm9taXNlKGRhdGE6IHN0cmluZykge1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHIgPT4geHRlcm0ud3JpdGUoZGF0YSwgcikpO1xuXHR9XG5cblx0ZnVuY3Rpb24gZmlyZUNvbW1hbmRTdGFydCgpIHtcblx0XHRvbkNvbW1hbmRTdGFydC5maXJlKHsgbWFya2VyOiB4dGVybS5yZWdpc3Rlck1hcmtlcigpIH0gYXMgSVRlcm1pbmFsQ29tbWFuZCk7XG5cdH1cblxuXHRmdW5jdGlvbiBmaXJlQ29tbWFuZEV4ZWN1dGVkKCkge1xuXHRcdG9uQ29tbWFuZEV4ZWN1dGVkLmZpcmUobnVsbCEpO1xuXHR9XG5cblx0ZnVuY3Rpb24gZmlyZUNvbW1hbmRGaW5pc2hlZCgpIHtcblx0XHRvbkNvbW1hbmRGaW5pc2hlZC5maXJlKG51bGwhKTtcblx0fVxuXG5cdGZ1bmN0aW9uIHNldENvbnRpbnVhdGlvblByb21wdChwcm9tcHQ6IHN0cmluZykge1xuXHRcdHByb21wdElucHV0TW9kZWwuc2V0Q29udGludWF0aW9uUHJvbXB0KHByb21wdCk7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBhc3NlcnRQcm9tcHRJbnB1dCh2YWx1ZVdpdGhDdXJzb3I6IHN0cmluZykge1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRpZiAocHJvbXB0SW5wdXRNb2RlbC5jdXJzb3JJbmRleCAhPT0gLTEgJiYgIXZhbHVlV2l0aEN1cnNvci5pbmNsdWRlcygnfCcpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2Fzc2VydFByb21wdElucHV0IG11c3QgY29udGFpbiB8IGNoYXJhY3RlcicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdHVhbFZhbHVlV2l0aEN1cnNvciA9IHByb21wdElucHV0TW9kZWwuZ2V0Q29tYmluZWRTdHJpbmcoKTtcblx0XHRzdHJpY3RFcXVhbChcblx0XHRcdGFjdHVhbFZhbHVlV2l0aEN1cnNvcixcblx0XHRcdHZhbHVlV2l0aEN1cnNvci5yZXBsYWNlQWxsKCdcXG4nLCAnXFx1MjNDRScpXG5cdFx0KTtcblxuXHRcdC8vIFRoaXMgaXMgcmVxdWlyZWQgdG8gZW5zdXJlIHRoZSBjdXJzb3IgaW5kZXggaXMgY29ycmVjdGx5IHJlc29sdmVkIGZvciBub24tYXNjaWkgY2hhcmFjdGVyc1xuXHRcdGNvbnN0IHZhbHVlID0gdmFsdWVXaXRoQ3Vyc29yLnJlcGxhY2UoL1tcXHxcXFtcXF1dL2csICcnKTtcblx0XHRjb25zdCBjdXJzb3JJbmRleCA9IHZhbHVlV2l0aEN1cnNvci5pbmRleE9mKCd8Jyk7XG5cdFx0c3RyaWN0RXF1YWwocHJvbXB0SW5wdXRNb2RlbC52YWx1ZSwgdmFsdWUpO1xuXHRcdHN0cmljdEVxdWFsKHByb21wdElucHV0TW9kZWwuY3Vyc29ySW5kZXgsIGN1cnNvckluZGV4LCBgdmFsdWU9JHtwcm9tcHRJbnB1dE1vZGVsLnZhbHVlfWApO1xuXHRcdG9rKHByb21wdElucHV0TW9kZWwuZ2hvc3RUZXh0SW5kZXggPT09IC0xIHx8IGN1cnNvckluZGV4IDw9IHByb21wdElucHV0TW9kZWwuZ2hvc3RUZXh0SW5kZXgsIGBjdXJzb3JJbmRleCAoJHtjdXJzb3JJbmRleH0pIG11c3QgYmUgYmVmb3JlIGdob3N0VGV4dEluZGV4ICgke3Byb21wdElucHV0TW9kZWwuZ2hvc3RUZXh0SW5kZXh9KWApO1xuXHR9XG5cblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFRlcm1pbmFsQ3RvciA9IChhd2FpdCBpbXBvcnRBTUROb2RlTW9kdWxlPHR5cGVvZiBpbXBvcnQoJ0B4dGVybS94dGVybScpPignQHh0ZXJtL3h0ZXJtJywgJ2xpYi94dGVybS5qcycpKS5UZXJtaW5hbDtcblx0XHR4dGVybSA9IHN0b3JlLmFkZChuZXcgVGVybWluYWxDdG9yKHsgYWxsb3dQcm9wb3NlZEFwaTogdHJ1ZSwgbG9nZ2VyOiBUZXN0WHRlcm1Mb2dnZXIgfSkpO1xuXHRcdG9uQ29tbWFuZFN0YXJ0ID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyKCkpO1xuXHRcdG9uQ29tbWFuZFN0YXJ0Q2hhbmdlZCA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcigpKTtcblx0XHRvbkNvbW1hbmRFeGVjdXRlZCA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcigpKTtcblx0XHRvbkNvbW1hbmRGaW5pc2hlZCA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcigpKTtcblx0XHRwcm9tcHRJbnB1dE1vZGVsID0gc3RvcmUuYWRkKG5ldyBQcm9tcHRJbnB1dE1vZGVsKHh0ZXJtLCBvbkNvbW1hbmRTdGFydC5ldmVudCwgb25Db21tYW5kU3RhcnRDaGFuZ2VkLmV2ZW50LCBvbkNvbW1hbmRFeGVjdXRlZC5ldmVudCwgb25Db21tYW5kRmluaXNoZWQuZXZlbnQsIG5ldyBOdWxsTG9nU2VydmljZSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdiYXNpYyBpbnB1dCBhbmQgZXhlY3V0ZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3cml0ZVByb21pc2UoJyQgJyk7XG5cdFx0ZmlyZUNvbW1hbmRTdGFydCgpO1xuXHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd8Jyk7XG5cblx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ2ZvbyBiYXInKTtcblx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnZm9vIGJhcnwnKTtcblxuXHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFxyXFxuJyk7XG5cdFx0ZmlyZUNvbW1hbmRFeGVjdXRlZCgpO1xuXHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdmb28gYmFyJyk7XG5cblx0XHRhd2FpdCB3cml0ZVByb21pc2UoJyhjb21tYW5kIG91dHB1dClcXHJcXG4kICcpO1xuXHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnfCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgbm90IGZpcmUgb25EaWRDaGFuZ2VJbnB1dCBldmVudHMgd2hlbiBub3RoaW5nIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXZlbnRzOiBJUHJvbXB0SW5wdXRNb2RlbFN0YXRlW10gPSBbXTtcblx0XHRzdG9yZS5hZGQocHJvbXB0SW5wdXRNb2RlbC5vbkRpZENoYW5nZUlucHV0KGUgPT4gZXZlbnRzLnB1c2goZSkpKTtcblxuXHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnJCAnKTtcblx0XHRmaXJlQ29tbWFuZFN0YXJ0KCk7XG5cdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblxuXHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnZm9vJyk7XG5cdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2Zvb3wnKTtcblxuXHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnIGJhcicpO1xuXHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdmb28gYmFyfCcpO1xuXG5cdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHJcXG4nKTtcblx0XHRmaXJlQ29tbWFuZEV4ZWN1dGVkKCk7XG5cdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2ZvbyBiYXInKTtcblxuXHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnJCAnKTtcblx0XHRmaXJlQ29tbWFuZFN0YXJ0KCk7XG5cdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblxuXHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnZm9vIGJhcicpO1xuXHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdmb28gYmFyfCcpO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBldmVudHMubGVuZ3RoIC0gMTsgaSsrKSB7XG5cdFx0XHRub3REZWVwU3RyaWN0RXF1YWwoZXZlbnRzW2ldLCBldmVudHNbaSArIDFdLCAnbm90IGFkamFjZW50IGV2ZW50cyBzaG91bGQgZmlyZSB3aXRoIHRoZSBzYW1lIHZhbHVlJyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgZmlyZSBvbkRpZEludGVycnVwdCBmb2xsb3dlZCBieSBvbkRpZEZpbmlzaCB3aGVuIGN0cmwrYyBpcyBwcmVzc2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnJCAnKTtcblx0XHRmaXJlQ29tbWFuZFN0YXJ0KCk7XG5cdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblxuXHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnZm9vJyk7XG5cdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2Zvb3wnKTtcblxuXHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHIgPT4ge1xuXHRcdFx0c3RvcmUuYWRkKHByb21wdElucHV0TW9kZWwub25EaWRJbnRlcnJ1cHQoKCkgPT4ge1xuXHRcdFx0XHQvLyBGaXJlIG9uRGlkRmluaXNoSW5wdXQgaW1tZWRpYXRlbHkgYWZ0ZXIgb25EaWRJbnRlcnJ1cHRcblx0XHRcdFx0c3RvcmUuYWRkKHByb21wdElucHV0TW9kZWwub25EaWRGaW5pc2hJbnB1dCgoKSA9PiB7XG5cdFx0XHRcdFx0cigpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9KSk7XG5cdFx0XHR4dGVybS5pbnB1dCgnXFx4MDMnKTtcblx0XHRcdHdyaXRlUHJvbWlzZSgnXkMnKS50aGVuKCgpID0+IGZpcmVDb21tYW5kRXhlY3V0ZWQoKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBjbGVhciB2YWx1ZSB3aGVuIGNvbW1hbmQgZmluaXNoZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd3JpdGVQcm9taXNlKCckICcpO1xuXHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnfCcpO1xuXG5cdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdlY2hvIGhlbGxvJyk7XG5cdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2VjaG8gaGVsbG98Jyk7XG5cblx0XHRmaXJlQ29tbWFuZEV4ZWN1dGVkKCk7XG5cdFx0c3RyaWN0RXF1YWwocHJvbXB0SW5wdXRNb2RlbC52YWx1ZSwgJ2VjaG8gaGVsbG8nKTtcblxuXHRcdGZpcmVDb21tYW5kRmluaXNoZWQoKTtcblx0XHRzdHJpY3RFcXVhbChwcm9tcHRJbnB1dE1vZGVsLnZhbHVlLCAnJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2N1cnNvciBuYXZpZ2F0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnJCAnKTtcblx0XHRmaXJlQ29tbWFuZFN0YXJ0KCk7XG5cdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblxuXHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnZm9vIGJhcicpO1xuXHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdmb28gYmFyfCcpO1xuXG5cdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYlszRCcpO1xuXHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdmb28gfGJhcicpO1xuXG5cdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYls0RCcpO1xuXHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd8Zm9vIGJhcicpO1xuXG5cdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYlszQycpO1xuXHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdmb298IGJhcicpO1xuXG5cdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYls0QycpO1xuXHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdmb28gYmFyfCcpO1xuXG5cdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYltEJyk7XG5cdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2ZvbyBiYXxyJyk7XG5cblx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiW0MnKTtcblx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnZm9vIGJhcnwnKTtcblx0fSk7XG5cblx0c3VpdGUoJ2dob3N0IHRleHQnLCAoKSA9PiB7XG5cdFx0dGVzdCgnYmFzaWMgZ2hvc3QgdGV4dCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnJCAnKTtcblx0XHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd8Jyk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnZm9vXFx4MWJbMm0gYmFyXFx4MWJbMG1cXHgxYls0RCcpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2Zvb3xbIGJhcl0nKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYlsyRCcpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2Z8b29bIGJhcl0nKTtcblx0XHR9KTtcblx0XHR0ZXN0KCd0cmFpbGluZyB3aGl0ZXNwYWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCckICcpO1xuXHRcdFx0ZmlyZUNvbW1hbmRTdGFydCgpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnZm9vICAgICcpO1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYls0RCcpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2Zvb3wgICAgJyk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnYmFzaWMgZ2hvc3QgdGV4dCBvbmUgd29yZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnJCAnKTtcblx0XHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd8Jyk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgncHdcXHgxYlsybWRcXHgxYlsxRCcpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3B3fFtkXScpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ2dob3N0IHRleHQgd2l0aCBjdXJzb3IgbmF2aWdhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnJCAnKTtcblx0XHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd8Jyk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnZm9vXFx4MWJbMm0gYmFyXFx4MWJbMG1cXHgxYls0RCcpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2Zvb3xbIGJhcl0nKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYlsyRCcpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2Z8b29bIGJhcl0nKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYltDJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnZm98b1sgYmFyXScpO1xuXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiW0MnKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdmb298WyBiYXJdJyk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnZ2hvc3QgdGV4dCB3aXRoIGRpZmZlcmVudCBmb3JlZ3JvdW5kIGNvbG9ycyBvbmx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCckICcpO1xuXHRcdFx0ZmlyZUNvbW1hbmRTdGFydCgpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdmb29cXHgxYlszODsyOzI1NTswOzBtIGJhclxceDFiWzBtXFx4MWJbNEQnKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdmb298WyBiYXJdJyk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbMkQnKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdmfG9vWyBiYXJdJyk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnbm8gZ2hvc3QgdGV4dCB3aGVuIGZvcmVncm91bmQgY29sb3IgbWF0Y2hlcyBlYXJsaWVyIHRleHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJyQgJyk7XG5cdFx0XHRmaXJlQ29tbWFuZFN0YXJ0KCk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnfCcpO1xuXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoXG5cdFx0XHRcdCdcXHgxYlszODsyOzI1NTswOzBtcmVkMVxceDFiWzBtICcgKyAgLy8gUmVkIFwicmVkMVwiXG5cdFx0XHRcdCdcXHgxYlszODsyOzA7MjU1OzBtZ3JlZW5cXHgxYlswbSAnICsgLy8gR3JlZW4gXCJncmVlblwiXG5cdFx0XHRcdCdcXHgxYlszODsyOzI1NTswOzBtcmVkMlxceDFiWzBtJyAgICAgLy8gUmVkIFwicmVkMlwiIChzYW1lIGFzIHJlZDEpXG5cdFx0XHQpO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgncmVkMSBncmVlbiByZWQyfCcpOyAvLyBObyBnaG9zdCB0ZXh0IGV4cGVjdGVkXG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnaG9zdCB0ZXh0IGRldGVjdGVkIHdoZW4gZm9yZWdyb3VuZCBjb2xvciBpcyB1bmlxdWUgYXQgdGhlIGVuZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnJCAnKTtcblx0XHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd8Jyk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZShcblx0XHRcdFx0J1xceDFiWzM4OzI7MjU1OzA7MG1jbWRcXHgxYlswbSAnICsgICAvLyBSZWQgXCJjbWRcIlxuXHRcdFx0XHQnXFx4MWJbMzg7MjswOzI1NTswbWFyZ1xceDFiWzBtICcgKyAgIC8vIEdyZWVuIFwiYXJnXCJcblx0XHRcdFx0J1xceDFiWzM4OzI7MDswOzI1NW1maW5hbFxceDFiWzVEJyAgICAvLyBCbHVlIFwiZmluYWxcIiAoZ2hvc3QgdGV4dClcblx0XHRcdCk7XG5cblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdjbWQgYXJnIHxbZmluYWxdJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdubyBnaG9zdCB0ZXh0IHdoZW4gYmFja2dyb3VuZCBjb2xvciBtYXRjaGVzIGVhcmxpZXIgdGV4dCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnJCAnKTtcblx0XHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd8Jyk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZShcblx0XHRcdFx0J1xceDFiWzQ4OzI7MjU1OzA7MG1yZWRfYmcxXFx4MWJbMG0gJyArICAvLyBSZWQgYmFja2dyb3VuZFxuXHRcdFx0XHQnXFx4MWJbNDg7MjswOzI1NTswbWdyZWVuX2JnXFx4MWJbMG0gJyArIC8vIEdyZWVuIGJhY2tncm91bmRcblx0XHRcdFx0J1xceDFiWzQ4OzI7MjU1OzA7MG1yZWRfYmcyXFx4MWJbMG0nICAgICAvLyBSZWQgYmFja2dyb3VuZCBhZ2FpblxuXHRcdFx0KTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3JlZF9iZzEgZ3JlZW5fYmcgcmVkX2JnMnwnKTsgLy8gTm8gZ2hvc3QgdGV4dCBleHBlY3RlZFxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2hvc3QgdGV4dCBkZXRlY3RlZCB3aGVuIGJhY2tncm91bmQgY29sb3IgaXMgdW5pcXVlIGF0IHRoZSBlbmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJyQgJyk7XG5cdFx0XHRmaXJlQ29tbWFuZFN0YXJ0KCk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnfCcpO1xuXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoXG5cdFx0XHRcdCdcXHgxYls0ODsyOzI1NTswOzBtcmVkX2JnXFx4MWJbMG0gJyArICAvLyBSZWQgYmFja2dyb3VuZFxuXHRcdFx0XHQnXFx4MWJbNDg7MjswOzI1NTswbWdyZWVuX2JnXFx4MWJbMG0gJyArIC8vIEdyZWVuIGJhY2tncm91bmRcblx0XHRcdFx0J1xceDFiWzQ4OzI7MDswOzI1NW1ibHVlX2JnXFx4MWJbN0QnICAgICAvLyBCbHVlIGJhY2tncm91bmQgKGdob3N0IHRleHQpXG5cdFx0XHQpO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgncmVkX2JnIGdyZWVuX2JnIHxbYmx1ZV9iZ10nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dob3N0IHRleHQgZGV0ZWN0ZWQgd2hlbiBib2xkIHN0eWxlIGlzIHVuaXF1ZSBhdCB0aGUgZW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCckICcpO1xuXHRcdFx0ZmlyZUNvbW1hbmRTdGFydCgpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKFxuXHRcdFx0XHQndGV4dCAnICtcblx0XHRcdFx0J1xceDFiWzFtQk9MRFxceDFiWzREJyAvLyBCb2xkIFwiQk9MRFwiIChnaG9zdCB0ZXh0KVxuXHRcdFx0KTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3RleHQgfFtCT0xEXScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm8gZ2hvc3QgdGV4dCB3aGVuIGVhcmxpZXIgdGV4dCBoYXMgdGhlIHNhbWUgYm9sZCBzdHlsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnJCAnKTtcblx0XHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd8Jyk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZShcblx0XHRcdFx0J1xceDFiWzFtQk9MRDFcXHgxYlswbSAnICsgLy8gQm9sZCBcIkJPTEQxXCJcblx0XHRcdFx0J25vcm1hbCAnICtcblx0XHRcdFx0J1xceDFiWzFtQk9MRDJcXHgxYlswbScgICAgLy8gQm9sZCBcIkJPTEQyXCIgKHNhbWUgc3R5bGUgYXMgXCJCT0xEMVwiKVxuXHRcdFx0KTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ0JPTEQxIG5vcm1hbCBCT0xEMnwnKTsgLy8gTm8gZ2hvc3QgdGV4dCBleHBlY3RlZFxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2hvc3QgdGV4dCBkZXRlY3RlZCB3aGVuIGl0YWxpYyBzdHlsZSBpcyB1bmlxdWUgYXQgdGhlIGVuZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnJCAnKTtcblx0XHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd8Jyk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZShcblx0XHRcdFx0J3RleHQgJyArXG5cdFx0XHRcdCdcXHgxYlszbUlUQUxJQ1xceDFiWzZEJyAvLyBJdGFsaWMgXCJJVEFMSUNcIiAoZ2hvc3QgdGV4dClcblx0XHRcdCk7XG5cblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd0ZXh0IHxbSVRBTElDXScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm8gZ2hvc3QgdGV4dCB3aGVuIGVhcmxpZXIgdGV4dCBoYXMgdGhlIHNhbWUgaXRhbGljIHN0eWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCckICcpO1xuXHRcdFx0ZmlyZUNvbW1hbmRTdGFydCgpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKFxuXHRcdFx0XHQnXFx4MWJbM21JVEFMSUMxXFx4MWJbMG0gJyArIC8vIEl0YWxpYyBcIklUQUxJQzFcIlxuXHRcdFx0XHQnbm9ybWFsICcgK1xuXHRcdFx0XHQnXFx4MWJbM21JVEFMSUMyXFx4MWJbMG0nICAgIC8vIEl0YWxpYyBcIklUQUxJQzJcIiAoc2FtZSBzdHlsZSBhcyBcIklUQUxJQzFcIilcblx0XHRcdCk7XG5cblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdJVEFMSUMxIG5vcm1hbCBJVEFMSUMyfCcpOyAvLyBObyBnaG9zdCB0ZXh0IGV4cGVjdGVkXG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnaG9zdCB0ZXh0IGRldGVjdGVkIHdoZW4gdW5kZXJsaW5lIHN0eWxlIGlzIHVuaXF1ZSBhdCB0aGUgZW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCckICcpO1xuXHRcdFx0ZmlyZUNvbW1hbmRTdGFydCgpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKFxuXHRcdFx0XHQndGV4dCAnICtcblx0XHRcdFx0J1xceDFiWzRtVU5ERVJMSU5FXFx4MWJbOUQnIC8vIFVuZGVybGluZWQgXCJVTkRFUkxJTkVcIiAoZ2hvc3QgdGV4dClcblx0XHRcdCk7XG5cblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd0ZXh0IHxbVU5ERVJMSU5FXScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm8gZ2hvc3QgdGV4dCB3aGVuIGVhcmxpZXIgdGV4dCBoYXMgdGhlIHNhbWUgdW5kZXJsaW5lIHN0eWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCckICcpO1xuXHRcdFx0ZmlyZUNvbW1hbmRTdGFydCgpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKFxuXHRcdFx0XHQnXFx4MWJbNG1VTkRFUkxJTkUxXFx4MWJbMG0gJyArIC8vIFVuZGVybGluZWQgXCJVTkRFUkxJTkUxXCJcblx0XHRcdFx0J25vcm1hbCAnICtcblx0XHRcdFx0J1xceDFiWzRtVU5ERVJMSU5FMlxceDFiWzBtJyAgICAvLyBVbmRlcmxpbmVkIFwiVU5ERVJMSU5FMlwiIChzYW1lIHN0eWxlIGFzIFwiVU5ERVJMSU5FMVwiKVxuXHRcdFx0KTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ1VOREVSTElORTEgbm9ybWFsIFVOREVSTElORTJ8Jyk7IC8vIE5vIGdob3N0IHRleHQgZXhwZWN0ZWRcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dob3N0IHRleHQgZGV0ZWN0ZWQgd2hlbiBzdHJpa2V0aHJvdWdoIHN0eWxlIGlzIHVuaXF1ZSBhdCB0aGUgZW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCckICcpO1xuXHRcdFx0ZmlyZUNvbW1hbmRTdGFydCgpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKFxuXHRcdFx0XHQndGV4dCAnICtcblx0XHRcdFx0J1xceDFiWzltU1RSSUtFXFx4MWJbNkQnIC8vIFN0cmlrZXRocm91Z2ggXCJTVFJJS0VcIiAoZ2hvc3QgdGV4dClcblx0XHRcdCk7XG5cblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd0ZXh0IHxbU1RSSUtFXScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm8gZ2hvc3QgdGV4dCB3aGVuIGVhcmxpZXIgdGV4dCBoYXMgdGhlIHNhbWUgc3RyaWtldGhyb3VnaCBzdHlsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnJCAnKTtcblx0XHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd8Jyk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZShcblx0XHRcdFx0J1xceDFiWzltU1RSSUtFMVxceDFiWzBtICcgKyAvLyBTdHJpa2V0aHJvdWdoIFwiU1RSSUtFMVwiXG5cdFx0XHRcdCdub3JtYWwgJyArXG5cdFx0XHRcdCdcXHgxYls5bVNUUklLRTJcXHgxYlswbScgICAgLy8gU3RyaWtldGhyb3VnaCBcIlNUUklLRTJcIiAoc2FtZSBzdHlsZSBhcyBcIlNUUklLRTFcIilcblx0XHRcdCk7XG5cblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdTVFJJS0UxIG5vcm1hbCBTVFJJS0UyfCcpOyAvLyBObyBnaG9zdCB0ZXh0IGV4cGVjdGVkXG5cdFx0fSk7XG5cdFx0c3VpdGUoJ1dpdGggd3JhcHBpbmcnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdGaXNoIGdob3N0IHRleHQgaW4gbG9uZyBsaW5lIHdpdGggd3JhcHBlZCBjb250ZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRwcm9tcHRJbnB1dE1vZGVsLnNldFNoZWxsVHlwZShQb3NpeFNoZWxsVHlwZS5GaXNoKTtcblx0XHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCckICcpO1xuXHRcdFx0XHRmaXJlQ29tbWFuZFN0YXJ0KCk7XG5cdFx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd8Jyk7XG5cblx0XHRcdFx0Ly8gV3JpdGUgYSBjb21tYW5kIHdpdGggZ2hvc3QgdGV4dCB0aGF0IHdpbGwgd3JhcFxuXHRcdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ2ZpbmQgLiAtbmFtZScpO1xuXHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZmluZCAuIC1uYW1lfGApO1xuXG5cdFx0XHRcdC8vIEFkZCBnaG9zdCB0ZXh0IHdpdGggZGltIHN0eWxlXG5cdFx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbMm0gdGVzdFxceDFiWzBtXFx4MWJbNEQnKTtcblx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGZpbmQgLiAtbmFtZSB8W3Rlc3RdYCk7XG5cblx0XHRcdFx0Ly8gTW92ZSBjdXJzb3Igd2l0aGluIHRoZSBnaG9zdCB0ZXh0XG5cdFx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbQycpO1xuXHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZmluZCAuIC1uYW1lIHR8W2VzdF1gKTtcblxuXHRcdFx0XHQvLyBBY2NlcHQgZ2hvc3QgdGV4dFxuXHRcdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiW0NcXHgxYltDXFx4MWJbQ1xceDFiW0NcXHgxYltDJyk7XG5cdFx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBmaW5kIC4gLW5hbWUgdGVzdHxgKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnUHdzaCBnaG9zdCB0ZXh0IGluIGxvbmcgbGluZSB3aXRoIHdyYXBwZWQgY29udGVudCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0cHJvbXB0SW5wdXRNb2RlbC5zZXRTaGVsbFR5cGUoR2VuZXJhbFNoZWxsVHlwZS5Qb3dlclNoZWxsKTtcblx0XHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCckICcpO1xuXHRcdFx0XHRmaXJlQ29tbWFuZFN0YXJ0KCk7XG5cdFx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd8Jyk7XG5cblx0XHRcdFx0Ly8gV3JpdGUgYSBjb21tYW5kIHdpdGggZ2hvc3QgdGV4dCB0aGF0IHdpbGwgd3JhcFxuXHRcdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ2ZpbmQgLiAtbmFtZScpO1xuXHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZmluZCAuIC1uYW1lfGApO1xuXG5cdFx0XHRcdC8vIEFkZCBnaG9zdCB0ZXh0IHdpdGggZGltIHN0eWxlXG5cdFx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbMm0gdGVzdFxceDFiWzBtXFx4MWJbNEQnKTtcblx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGZpbmQgLiAtbmFtZSB8W3Rlc3RdYCk7XG5cblx0XHRcdFx0Ly8gTW92ZSBjdXJzb3Igd2l0aGluIHRoZSBnaG9zdCB0ZXh0XG5cdFx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbQycpO1xuXHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZmluZCAuIC1uYW1lIHR8W2VzdF1gKTtcblxuXHRcdFx0XHQvLyBBY2NlcHQgZ2hvc3QgdGV4dFxuXHRcdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiW0NcXHgxYltDXFx4MWJbQ1xceDFiW0NcXHgxYltDJyk7XG5cdFx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBmaW5kIC4gLW5hbWUgdGVzdHxgKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ0RvZXMgbm90IGRldGVjdCByaWdodCBwcm9tcHQgYXMgZ2hvc3QgdGV4dCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnJCAnKTtcblx0XHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd8Jyk7XG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ2NtZCcgKyAnICcucmVwZWF0KDYpICsgJ1xceDFiWzM4OzI7MjU1OzA7MG1SUFxceDFiWzBtXFx4MWJbOEQnKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdjbWR8JyArICcgJy5yZXBlYXQoNikgKyAnUlAnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnd2lkZSBpbnB1dCAoS29yZWFuKScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3cml0ZVByb21pc2UoJyQgJyk7XG5cdFx0ZmlyZUNvbW1hbmRTdGFydCgpO1xuXHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd8Jyk7XG5cblx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1x1QzU0OFx1QzYwMScpO1xuXHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdcdUM1NDhcdUM2MDF8Jyk7XG5cblx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xcclxcblx1Q0VGNFx1RDRFOFx1RDEzMCcpO1xuXHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdcdUM1NDhcdUM2MDFcXG5cdUNFRjRcdUQ0RThcdUQxMzB8Jyk7XG5cblx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xcclxcblx1QzBBQ1x1Qjc4QycpO1xuXHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdcdUM1NDhcdUM2MDFcXG5cdUNFRjRcdUQ0RThcdUQxMzBcXG5cdUMwQUNcdUI3OEN8Jyk7XG5cblx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiW0cnKTtcblx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnXHVDNTQ4XHVDNjAxXFxuXHVDRUY0XHVENEU4XHVEMTMwXFxufFx1QzBBQ1x1Qjc4QycpO1xuXG5cdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYltBJyk7XG5cdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ1x1QzU0OFx1QzYwMVxcbnxcdUNFRjRcdUQ0RThcdUQxMzBcXG5cdUMwQUNcdUI3OEMnKTtcblxuXHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbNEMnKTtcblx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnXHVDNTQ4XHVDNjAxXFxuXHVDRUY0XHVENEU4fFx1RDEzMFxcblx1QzBBQ1x1Qjc4QycpO1xuXG5cdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYlsxOzRIJyk7XG5cdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ1x1QzU0OHxcdUM2MDFcXG5cdUNFRjRcdUQ0RThcdUQxMzBcXG5cdUMwQUNcdUI3OEMnKTtcblxuXHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbRCcpO1xuXHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd8XHVDNTQ4XHVDNjAxXFxuXHVDRUY0XHVENEU4XHVEMTMwXFxuXHVDMEFDXHVCNzhDJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Vtb2ppIGlucHV0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnJCAnKTtcblx0XHRmaXJlQ29tbWFuZFN0YXJ0KCk7XG5cdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblxuXHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXHUyNzBDXHVGRTBGXHVEODNEXHVEQzREJyk7XG5cdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ1x1MjcwQ1x1RkUwRlx1RDgzRFx1REM0RHwnKTtcblxuXHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFxyXFxuXHVEODNEXHVERTBFXHVEODNEXHVERTE1XHVEODNEXHVERTA1Jyk7XG5cdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ1x1MjcwQ1x1RkUwRlx1RDgzRFx1REM0RFxcblx1RDgzRFx1REUwRVx1RDgzRFx1REUxNVx1RDgzRFx1REUwNXwnKTtcblxuXHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFxyXFxuXHVEODNFXHVERDE0XHVEODNFXHVERDM3XHVEODNEXHVERTI5Jyk7XG5cdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ1x1MjcwQ1x1RkUwRlx1RDgzRFx1REM0RFxcblx1RDgzRFx1REUwRVx1RDgzRFx1REUxNVx1RDgzRFx1REUwNVxcblx1RDgzRVx1REQxNFx1RDgzRVx1REQzN1x1RDgzRFx1REUyOXwnKTtcblxuXHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbRycpO1xuXHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdcdTI3MENcdUZFMEZcdUQ4M0RcdURDNERcXG5cdUQ4M0RcdURFMEVcdUQ4M0RcdURFMTVcdUQ4M0RcdURFMDVcXG58XHVEODNFXHVERDE0XHVEODNFXHVERDM3XHVEODNEXHVERTI5Jyk7XG5cblx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiW0EnKTtcblx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnXHUyNzBDXHVGRTBGXHVEODNEXHVEQzREXFxufFx1RDgzRFx1REUwRVx1RDgzRFx1REUxNVx1RDgzRFx1REUwNVxcblx1RDgzRVx1REQxNFx1RDgzRVx1REQzN1x1RDgzRFx1REUyOScpO1xuXG5cdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYlsyQycpO1xuXHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdcdTI3MENcdUZFMEZcdUQ4M0RcdURDNERcXG5cdUQ4M0RcdURFMEVcdUQ4M0RcdURFMTV8XHVEODNEXHVERTA1XFxuXHVEODNFXHVERDE0XHVEODNFXHVERDM3XHVEODNEXHVERTI5Jyk7XG5cblx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiWzE7NEgnKTtcblx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnXHUyNzBDXHVGRTBGfFx1RDgzRFx1REM0RFxcblx1RDgzRFx1REUwRVx1RDgzRFx1REUxNVx1RDgzRFx1REUwNVxcblx1RDgzRVx1REQxNFx1RDgzRVx1REQzN1x1RDgzRFx1REUyOScpO1xuXG5cdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYltEJyk7XG5cdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3xcdTI3MENcdUZFMEZcdUQ4M0RcdURDNERcXG5cdUQ4M0RcdURFMEVcdUQ4M0RcdURFMTVcdUQ4M0RcdURFMDVcXG5cdUQ4M0VcdUREMTRcdUQ4M0VcdUREMzdcdUQ4M0RcdURFMjknKTtcblx0fSk7XG5cblx0c3VpdGUoJ3RyYWlsaW5nIHdoaXRlc3BhY2UnLCAoKSA9PiB7XG5cdFx0dGVzdCgnY3Vyc29yIGluZGV4IGNhbGN1bGF0aW9uIHdpdGggd2hpdGVzcGFjZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnJCAnKTtcblx0XHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd8Jyk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnZWNobyAgICcpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2VjaG8gICB8Jyk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbM0QnKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdlY2hvfCAgICcpO1xuXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiW0MnKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdlY2hvIHwgICcpO1xuXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiW0MnKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdlY2hvICB8ICcpO1xuXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiW0MnKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdlY2hvICAgfCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY3Vyc29yIGluZGV4IHNob3VsZCBub3QgZXhjZWVkIGNvbW1hbmQgbGluZSBsZW5ndGgnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJyQgJyk7XG5cdFx0XHRmaXJlQ29tbWFuZFN0YXJ0KCk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnfCcpO1xuXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ2NtZCcpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2NtZHwnKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYlsxMEMnKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdjbWR8Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3aGl0ZXNwYWNlIHByZXNlcnZhdGlvbiBpbiBjdXJzb3IgY2FsY3VsYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJyQgJyk7XG5cdFx0XHRmaXJlQ29tbWFuZFN0YXJ0KCk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnfCcpO1xuXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ2xzICAgLWxhJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnbHMgICAtbGF8Jyk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbM0QnKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdscyAgIHwtbGEnKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYlszRCcpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2xzfCAgIC1sYScpO1xuXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiWzJDJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnbHMgIHwgLWxhJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWxldGUgd2hpdGVzcGFjZSB3aXRoIGJhY2tzcGFjZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnJCAnKTtcblx0XHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd8Jyk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnICcpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYCB8YCk7XG5cblx0XHRcdHh0ZXJtLmlucHV0KCdcXHg3RicsIHRydWUpOyAvLyBCYWNrc3BhY2Vcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbRCcpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblxuXHRcdFx0eHRlcm0uaW5wdXQoJyAnLnJlcGVhdCg0KSwgdHJ1ZSk7XG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJyAnLnJlcGVhdCg0KSk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgICAgIHxgKTtcblxuXHRcdFx0eHRlcm0uaW5wdXQoJ1xceDFiW0QnLnJlcGVhdCgyKSwgdHJ1ZSk7IC8vIExlZnRcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbMkQnKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGAgIHwgIGApO1xuXG5cdFx0XHR4dGVybS5pbnB1dCgnXFx4N0YnLCB0cnVlKTsgLy8gQmFja3NwYWNlXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiW0QnKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGAgfCAgYCk7XG5cblx0XHRcdHh0ZXJtLmlucHV0KCdcXHg3RicsIHRydWUpOyAvLyBCYWNrc3BhY2Vcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbRCcpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYHwgIGApO1xuXG5cdFx0XHR4dGVybS5pbnB1dCgnICcsIHRydWUpO1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCcgJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgIHwgIGApO1xuXG5cdFx0XHR4dGVybS5pbnB1dCgnICcsIHRydWUpO1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCcgJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgICB8ICBgKTtcblxuXHRcdFx0eHRlcm0uaW5wdXQoJ1xceDFiW0MnLCB0cnVlKTsgLy8gUmlnaHRcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbQycpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYCAgIHwgYCk7XG5cblx0XHRcdHh0ZXJtLmlucHV0KCdhJywgdHJ1ZSk7XG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ2EnKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGAgICBhfCBgKTtcblxuXHRcdFx0eHRlcm0uaW5wdXQoJ1xceDdGJywgdHJ1ZSk7IC8vIEJhY2tzcGFjZVxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYltEXFx4MWJbSycpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYCAgIHwgYCk7XG5cblx0XHRcdHh0ZXJtLmlucHV0KCdcXHgxYltEJy5yZXBlYXQoMiksIHRydWUpOyAvLyBMZWZ0XG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiWzJEJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgIHwgICBgKTtcblxuXHRcdFx0eHRlcm0uaW5wdXQoJ1xceDFiWzN+JywgdHJ1ZSk7IC8vIERlbGV0ZVxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCcnKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGAgfCAgYCk7XG5cdFx0fSk7XG5cblx0XHQvLyBUT0RPOiBUaGlzIGRvZXNuJ3Qgd29yayBjb3JyZWN0bHkgYnV0IGl0IGRvZXNuJ3QgbWF0dGVyIHRvbyBtdWNoIGFzIGl0IG9ubHkgaGFwcGVucyB3aGVuXG5cdFx0Ly8gdGhlcmUgaXMgYSBsb3Qgb2Ygd2hpdGVzcGFjZSBhdCB0aGUgZW5kIG9mIGEgcHJvbXB0IGlucHV0XG5cdFx0dGVzdC5za2lwKCd0cmFjayB3aGl0ZXNwYWNlIHdoZW4gQ29uUFRZIGRlbGV0ZXMgd2hpdGVzcGFjZSB1bmV4cGVjdGVkbHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJyQgJyk7XG5cdFx0XHRmaXJlQ29tbWFuZFN0YXJ0KCk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnfCcpO1xuXG5cdFx0XHR4dGVybS5pbnB1dCgnbHMnLCB0cnVlKTtcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnbHMnKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBsc3xgKTtcblxuXHRcdFx0eHRlcm0uaW5wdXQoJyAnLnJlcGVhdCg0KSwgdHJ1ZSk7XG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJyAnLnJlcGVhdCg0KSk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgbHMgICAgfGApO1xuXG5cdFx0XHR4dGVybS5pbnB1dCgnICcsIHRydWUpO1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYls0RFxceDFiWzVYXFx4MWJbNUMnKTsgLy8gQ3Vyc29yIGxlZnQgeChOLTEpLCBkZWxldGUgeE4sIGN1cnNvciByaWdodCB4TlxuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGxzICAgICB8YCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0cmFjayB3aGl0ZXNwYWNlIGJleW9uZCBjdXJzb3InLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJyQgJyk7XG5cdFx0XHRmaXJlQ29tbWFuZFN0YXJ0KCk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnfCcpO1xuXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJyAnLnJlcGVhdCg4KSk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgJHsnICcucmVwZWF0KDgpfXxgKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYls0RCcpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYCR7JyAnLnJlcGVhdCg0KX18JHsnICcucmVwZWF0KDQpfWApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnbXVsdGktbGluZScsICgpID0+IHtcblx0XHR0ZXN0KCdiYXNpYyAyIGxpbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJyQgJyk7XG5cdFx0XHRmaXJlQ29tbWFuZFN0YXJ0KCk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnfCcpO1xuXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ2VjaG8gXCJhJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImF8YCk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFxuXFxyXFxcdTIyMTkgJyk7XG5cdFx0XHRzZXRDb250aW51YXRpb25Qcm9tcHQoJ1x1MjIxOSAnKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBlY2hvIFwiYVxcbnxgKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdiJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImFcXG5ifGApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYmFzaWMgMyBsaW5lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCckICcpO1xuXHRcdFx0ZmlyZUNvbW1hbmRTdGFydCgpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdlY2hvIFwiYScpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGVjaG8gXCJhfGApO1xuXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xcblxcclxcXHUyMjE5ICcpO1xuXHRcdFx0c2V0Q29udGludWF0aW9uUHJvbXB0KCdcdTIyMTkgJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImFcXG58YCk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnYicpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGVjaG8gXCJhXFxuYnxgKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXG5cXHJcXFx1MjIxOSAnKTtcblx0XHRcdHNldENvbnRpbnVhdGlvblByb21wdCgnXHUyMjE5ICcpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGVjaG8gXCJhXFxuYlxcbnxgKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdjJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImFcXG5iXFxuY3xgKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25hdmlnYXRlIGxlZnQgaW4gbXVsdGktbGluZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCckICcpO1xuXHRcdFx0XHRmaXJlQ29tbWFuZFN0YXJ0KCk7XG5cdFx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd8Jyk7XG5cblx0XHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdlY2hvIFwiYScpO1xuXHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImF8YCk7XG5cblx0XHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXG5cXHJcXFx1MjIxOSAnKTtcblx0XHRcdFx0c2V0Q29udGludWF0aW9uUHJvbXB0KCdcdTIyMTkgJyk7XG5cdFx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBlY2hvIFwiYVxcbnxgKTtcblxuXHRcdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ2InKTtcblx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGVjaG8gXCJhXFxuYnxgKTtcblxuXHRcdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiW0QnKTtcblx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGVjaG8gXCJhXFxufGJgKTtcblxuXHRcdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiW0BjJyk7XG5cdFx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBlY2hvIFwiYVxcbmN8YmApO1xuXG5cdFx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbS1xcblxcclxcXHUyMjE5ICcpO1xuXHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImFcXG5jXFxufGApO1xuXG5cdFx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnYicpO1xuXHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImFcXG5jXFxuYnxgKTtcblxuXHRcdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJyBmb28nKTtcblx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGVjaG8gXCJhXFxuY1xcbmIgZm9vfGApO1xuXG5cdFx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbM0QnKTtcblx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGVjaG8gXCJhXFxuY1xcbmIgfGZvb2ApO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCduYXZpZ2F0ZSB1cCBpbiBtdWx0aS1saW5lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJyQgJyk7XG5cdFx0XHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblxuXHRcdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ2VjaG8gXCJmb28nKTtcblx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGVjaG8gXCJmb298YCk7XG5cblx0XHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXG5cXHJcXFx1MjIxOSAnKTtcblx0XHRcdFx0c2V0Q29udGludWF0aW9uUHJvbXB0KCdcdTIyMTkgJyk7XG5cdFx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBlY2hvIFwiZm9vXFxufGApO1xuXG5cdFx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnYmFyJyk7XG5cdFx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBlY2hvIFwiZm9vXFxuYmFyfGApO1xuXG5cdFx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFxuXFxyXFxcdTIyMTkgJyk7XG5cdFx0XHRcdHNldENvbnRpbnVhdGlvblByb21wdCgnXHUyMjE5ICcpO1xuXHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImZvb1xcbmJhclxcbnxgKTtcblxuXHRcdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ2JheicpO1xuXHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImZvb1xcbmJhclxcbmJhenxgKTtcblxuXHRcdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiW0EnKTtcblx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGVjaG8gXCJmb29cXG5iYXJ8XFxuYmF6YCk7XG5cblx0XHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYltEJyk7XG5cdFx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBlY2hvIFwiZm9vXFxuYmF8clxcbmJhemApO1xuXG5cdFx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbRCcpO1xuXHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImZvb1xcbmJ8YXJcXG5iYXpgKTtcblxuXHRcdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiW0QnKTtcblx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGVjaG8gXCJmb29cXG58YmFyXFxuYmF6YCk7XG5cblx0XHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYlsxOzlIJyk7XG5cdFx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBlY2hvIFwifGZvb1xcbmJhclxcbmJhemApO1xuXG5cdFx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbQycpO1xuXHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImZ8b29cXG5iYXJcXG5iYXpgKTtcblxuXHRcdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiW0MnKTtcblx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGVjaG8gXCJmb3xvXFxuYmFyXFxuYmF6YCk7XG5cblx0XHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYltDJyk7XG5cdFx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBlY2hvIFwiZm9vfFxcbmJhclxcbmJhemApO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCduYXZpZ2F0aW5nIHVwIHdoZW4gZmlyc3QgbGluZSBjb250YWlucyBpbnZhbGlkL3N0YWxlIHRyYWlsaW5nIHdoaXRlc3BhY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJyQgJyk7XG5cdFx0XHRmaXJlQ29tbWFuZFN0YXJ0KCk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnfCcpO1xuXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ2VjaG8gXCJmb28gICAgICBcXHgxYls2RCcpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGVjaG8gXCJmb298YCk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFxuXFxyXFxcdTIyMTkgJyk7XG5cdFx0XHRzZXRDb250aW51YXRpb25Qcm9tcHQoJ1x1MjIxOSAnKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBlY2hvIFwiZm9vXFxufGApO1xuXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ2JhcicpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGVjaG8gXCJmb29cXG5iYXJ8YCk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbRCcpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGVjaG8gXCJmb29cXG5iYXxyYCk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbRCcpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGVjaG8gXCJmb29cXG5ifGFyYCk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbRCcpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGVjaG8gXCJmb29cXG58YmFyYCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdtdWx0aS1saW5lIHdyYXBwZWQgKG5vIGNvbnRpbnVhdGlvbiBwcm9tcHQpJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2Jhc2ljIHdyYXBwZWQgbGluZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0eHRlcm0ucmVzaXplKDUsIDEwKTtcblxuXHRcdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJyQgJyk7XG5cdFx0XHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblxuXHRcdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ2VjaCcpO1xuXHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNofGApO1xuXG5cdFx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnbyAnKTtcblx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGVjaG8gfGApO1xuXG5cdFx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXCJhXCInKTtcblx0XHRcdFx0Ly8gSEFDSzogVHJhaWxpbmcgd2hpdGVzcGFjZSBpcyBkdWUgdG8gZmxha3kgZGV0ZWN0aW9uIGluIHdyYXBwZWQgbGluZXMgKGJ1dCBpdCBkb2Vzbid0IG1hdHRlciBtdWNoKVxuXHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImFcInwgYCk7XG5cdFx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFxuXFxyXFwgYicpO1xuXHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImFcIlxcbiBifGApO1xuXHRcdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xcblxcclxcIGMnKTtcblx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGVjaG8gXCJhXCJcXG4gYlxcbiBjfGApO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXHRzdWl0ZSgnbXVsdGktbGluZSB3cmFwcGVkIChjb250aW51YXRpb24gcHJvbXB0KScsICgpID0+IHtcblx0XHR0ZXN0KCdiYXNpYyB3cmFwcGVkIGxpbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR4dGVybS5yZXNpemUoNSwgMTApO1xuXHRcdFx0cHJvbXB0SW5wdXRNb2RlbC5zZXRDb250aW51YXRpb25Qcm9tcHQoJ1x1MjIxOSAnKTtcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnJCAnKTtcblx0XHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd8Jyk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnZWNoJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNofGApO1xuXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ28gJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyB8YCk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXCJhXCInKTtcblx0XHRcdC8vIEhBQ0s6IFRyYWlsaW5nIHdoaXRlc3BhY2UgaXMgZHVlIHRvIGZsYWt5IGRldGVjdGlvbiBpbiB3cmFwcGVkIGxpbmVzIChidXQgaXQgZG9lc24ndCBtYXR0ZXIgbXVjaClcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBlY2hvIFwiYVwifCBgKTtcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFxuXFxyXFxcdTIyMTkgJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImFcIlxcbnxgKTtcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnYicpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGVjaG8gXCJhXCJcXG5ifGApO1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXG5cXHJcXFx1MjIxOSAnKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBlY2hvIFwiYVwiXFxuYlxcbnxgKTtcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnYycpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGVjaG8gXCJhXCJcXG5iXFxuY3xgKTtcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFxuXFxyXFxcdTIyMTkgJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImFcIlxcbmJcXG5jXFxufGApO1xuXHRcdH0pO1xuXHR9KTtcblx0c3VpdGUoJ211bHRpLWxpbmUgd3JhcHBlZCBmaXNoJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2ZvcndhcmQgc2xhc2ggY29udGludWF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cHJvbXB0SW5wdXRNb2RlbC5zZXRTaGVsbFR5cGUoUG9zaXhTaGVsbFR5cGUuRmlzaCk7XG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJyQgJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnfCcpO1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdbSV0gbWVnYW5yb2dnZUBNZWdhbnMtTWFjQm9vay1Qcm8gfiAobWFpbnxCSVNFQ1RJTkcpPicpO1xuXHRcdFx0ZmlyZUNvbW1hbmRTdGFydCgpO1xuXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ2VjaFxcXFwnKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBlY2hcXFxcfGApO1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXG5vIGJ5ZScpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGVjaG8gYnllfGApO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ25ld2xpbmUgd2l0aCBubyBjb250aW51YXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRwcm9tcHRJbnB1dE1vZGVsLnNldFNoZWxsVHlwZShQb3NpeFNoZWxsVHlwZS5GaXNoKTtcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnJCAnKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd8Jyk7XG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1tJXSBtZWdhbnJvZ2dlQE1lZ2Fucy1NYWNCb29rLVBybyB+IChtYWlufEJJU0VDVElORyk+Jyk7XG5cdFx0XHRmaXJlQ29tbWFuZFN0YXJ0KCk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnfCcpO1xuXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ2VjaG8gXCJoaScpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGVjaG8gXCJoaXxgKTtcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFxuYW5kIGJ5ZVxcbndoeVwiJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImhpXFxuYW5kIGJ5ZVxcbndoeVwifGApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyBUbyBcInJlY29yZCBhIHNlc3Npb25cIiBmb3IgdGhlc2UgdGVzdHM6XG5cdC8vIC0gRW5hYmxlIGRlYnVnIGxvZ2dpbmdcblx0Ly8gLSBPcGVuIGFuZCBjbGVhciBUZXJtaW5hbCBvdXRwdXQgY2hhbm5lbFxuXHQvLyAtIE9wZW4gdGVybWluYWwgYW5kIHBlcmZvcm0gdGhlIHRlc3Rcblx0Ly8gLSBFeHRyYWN0IGFsbCBcInBhcnNpbmcgZGF0YVwiIGxpbmVzIGZyb20gdGhlIHRlcm1pbmFsXG5cdHN1aXRlKCdyZWNvcmRlZCBzZXNzaW9ucycsICgpID0+IHtcblx0XHRhc3luYyBmdW5jdGlvbiByZXBsYXlFdmVudHMoZXZlbnRzOiBzdHJpbmdbXSkge1xuXHRcdFx0Zm9yIChjb25zdCBkYXRhIG9mIGV2ZW50cykge1xuXHRcdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoZGF0YSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0c3VpdGUoJ1dpbmRvd3MgMTEgKDEwLjAuMjI2MjEuMzQ0NyksIHB3c2ggNy40LjIsIHN0YXJzaGlwIHByb21wdCAxLjEwLjInLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdpbnB1dCB3aXRoIGlnbm9yZWQgZ2hvc3QgdGV4dCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGF3YWl0IHJlcGxheUV2ZW50cyhbXG5cdFx0XHRcdFx0XHQnXHUwMDFCWz8yNWxcdTAwMUJbMkpcdTAwMUJbbVx1MDAxQltIXHUwMDFCXTA7QzpcXFxcUHJvZ3JhbSBGaWxlc1xcXFxXaW5kb3dzQXBwc1xcXFxNaWNyb3NvZnQuUG93ZXJTaGVsbF83LjQuMi4wX3g2NF9fOHdla3liM2Q4YmJ3ZVxcXFxwd3NoLmV4ZVx1MDAwN1x1MDAxQls/MjVoJyxcblx0XHRcdFx0XHRcdCdcdTAwMUJbPzI1bFx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcdTAwMUJbSFx1MDAxQls/MjVoJyxcblx0XHRcdFx0XHRcdCdcdTAwMUJdNjMzO1A7SXNXaW5kb3dzPVRydWVcdTAwMDcnLFxuXHRcdFx0XHRcdFx0J1x1MDAxQl02MzM7UDtDb250aW51YXRpb25Qcm9tcHQ9XFx4MWJbMzhcXHgzYjVcXHgzYjhtXHUyMjE5XFx4MWJbMG0gXHUwMDA3Jyxcblx0XHRcdFx0XHRcdCdcdTAwMUJdNjMzO0FcdTAwMDdcdTAwMUJdNjMzO1A7Q3dkPUM6XFx4NWNHaXRodWJcXHg1Y21pY3Jvc29mdFxceDVjdnNjb2RlXHUwMDA3XHUwMDFCXTYzMztCXHUwMDA3Jyxcblx0XHRcdFx0XHRcdCdcdTAwMUJbMzRtXFxyXFxuXHVFMEI2XHUwMDFCWzM4OzI7MTc7MTc7MTdtXHUwMDFCWzQ0bTAzOjEzOjQ3IFx1MDAxQlszNG1cdTAwMUJbNDFtXHVFMEIwIFx1MDAxQlszODsyOzE3OzE3OzE3bXZzY29kZSBcdTAwMUJbMzFtXHUwMDFCWzQzbVx1RTBCMCBcdTAwMUJbMzg7MjsxNzsxNzsxN21cdUUwQTAgdHlyaWFyL3Byb21wdF9pbnB1dF9tb2RlbCBcdTAwMUJbMzNtXHUwMDFCWzQ2bVx1RTBCMCBcdTAwMUJbMzg7MjsxNzsxNzsxN20kXHUyMUUxIFx1MDAxQlszNm1cdTAwMUJbNDltXHVFMEIwIFx1MDAxQlttdmlhIFx1MDAxQlszMm1cdTAwMUJbMW1cdUU3MTggdjE4LjE4LjIgXFxyXFxuXHUyNzZGXHUwMDFCW20gJyxcblx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRmaXJlQ29tbWFuZFN0YXJ0KCk7XG5cdFx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblxuXHRcdFx0XHRcdGF3YWl0IHJlcGxheUV2ZW50cyhbXG5cdFx0XHRcdFx0XHQnXHUwMDFCWz8yNWxcdTAwMUJbOTNtZlx1MDAxQls5N21cdTAwMUJbMm1cdTAwMUJbM21ha2Vjb21tYW5kXHUwMDFCWzM7NEhcdTAwMUJbPzI1aCcsXG5cdFx0XHRcdFx0XHQnXHUwMDFCW20nLFxuXHRcdFx0XHRcdFx0J1x1MDAxQls5M21cYmZvXHUwMDFCWzlYJyxcblx0XHRcdFx0XHRcdCdcdTAwMUJbbScsXG5cdFx0XHRcdFx0XHQnXHUwMDFCWz8yNWxcdTAwMUJbOTNtXHUwMDFCWzM7M0hmb29cdTAwMUJbPzI1aCcsXG5cdFx0XHRcdFx0XHQnXHUwMDFCW20nLFxuXHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdmb298Jyk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdpbnB1dCB3aXRoIGFjY2VwdGVkIGFuZCBydW4gZ2hvc3QgdGV4dCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGF3YWl0IHJlcGxheUV2ZW50cyhbXG5cdFx0XHRcdFx0XHQnXHUwMDFCWz8yNWxcdTAwMUJbMkpcdTAwMUJbbVx1MDAxQltIXHUwMDFCXTA7QzpcXFxcUHJvZ3JhbSBGaWxlc1xcXFxXaW5kb3dzQXBwc1xcXFxNaWNyb3NvZnQuUG93ZXJTaGVsbF83LjQuMi4wX3g2NF9fOHdla3liM2Q4YmJ3ZVxcXFxwd3NoLmV4ZVx1MDAwN1x1MDAxQls/MjVoJyxcblx0XHRcdFx0XHRcdCdcdTAwMUJbPzI1bFx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcdTAwMUJbSFx1MDAxQls/MjVoJyxcblx0XHRcdFx0XHRcdCdcdTAwMUJdNjMzO1A7SXNXaW5kb3dzPVRydWVcdTAwMDcnLFxuXHRcdFx0XHRcdFx0J1x1MDAxQl02MzM7UDtDb250aW51YXRpb25Qcm9tcHQ9XFx4MWJbMzhcXHgzYjVcXHgzYjhtXHUyMjE5XFx4MWJbMG0gXHUwMDA3Jyxcblx0XHRcdFx0XHRcdCdcdTAwMUJdNjMzO0FcdTAwMDdcdTAwMUJdNjMzO1A7Q3dkPUM6XFx4NWNHaXRodWJcXHg1Y21pY3Jvc29mdFxceDVjdnNjb2RlXHUwMDA3XHUwMDFCXTYzMztCXHUwMDA3Jyxcblx0XHRcdFx0XHRcdCdcdTAwMUJbMzRtXFxyXFxuXHVFMEI2XHUwMDFCWzM4OzI7MTc7MTc7MTdtXHUwMDFCWzQ0bTAzOjQxOjM2IFx1MDAxQlszNG1cdTAwMUJbNDFtXHVFMEIwIFx1MDAxQlszODsyOzE3OzE3OzE3bXZzY29kZSBcdTAwMUJbMzFtXHUwMDFCWzQzbVx1RTBCMCBcdTAwMUJbMzg7MjsxNzsxNzsxN21cdUUwQTAgdHlyaWFyL3Byb21wdF9pbnB1dF9tb2RlbCBcdTAwMUJbMzNtXHUwMDFCWzQ2bVx1RTBCMCBcdTAwMUJbMzg7MjsxNzsxNzsxN20kIFx1MDAxQlszNm1cdTAwMUJbNDltXHVFMEIwIFx1MDAxQlttdmlhIFx1MDAxQlszMm1cdTAwMUJbMW1cdUU3MTggdjE4LjE4LjIgXFxyXFxuXHUyNzZGXHUwMDFCW20gJyxcblx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRwcm9tcHRJbnB1dE1vZGVsLnNldENvbnRpbnVhdGlvblByb21wdCgnXHUyMjE5ICcpO1xuXHRcdFx0XHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnfCcpO1xuXG5cdFx0XHRcdFx0YXdhaXQgcmVwbGF5RXZlbnRzKFtcblx0XHRcdFx0XHRcdCdcdTAwMUJbPzI1bFx1MDAxQls5M21lXHUwMDFCWzk3bVx1MDAxQlsybVx1MDAxQlszbWNobyBcImhlbGxvIHdvcmxkXCJcdTAwMUJbMzs0SFx1MDAxQls/MjVoJyxcblx0XHRcdFx0XHRcdCdcdTAwMUJbbScsXG5cdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2V8W2NobyBcImhlbGxvIHdvcmxkXCJdJyk7XG5cblx0XHRcdFx0XHRhd2FpdCByZXBsYXlFdmVudHMoW1xuXHRcdFx0XHRcdFx0J1x1MDAxQls/MjVsXHUwMDFCWzkzbVxiZWNcdTAwMUJbOTdtXHUwMDFCWzJtXHUwMDFCWzNtaG8gXCJoZWxsbyB3b3JsZFwiXHUwMDFCWzM7NUhcdTAwMUJbPzI1aCcsXG5cdFx0XHRcdFx0XHQnXHUwMDFCW20nLFxuXHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdlY3xbaG8gXCJoZWxsbyB3b3JsZFwiXScpO1xuXG5cdFx0XHRcdFx0YXdhaXQgcmVwbGF5RXZlbnRzKFtcblx0XHRcdFx0XHRcdCdcdTAwMUJbPzI1bFx1MDAxQls5M21cdTAwMUJbMzszSGVjaFx1MDAxQls5N21cdTAwMUJbMm1cdTAwMUJbM21vIFwiaGVsbG8gd29ybGRcIlx1MDAxQlszOzZIXHUwMDFCWz8yNWgnLFxuXHRcdFx0XHRcdFx0J1x1MDAxQlttJyxcblx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnZWNofFtvIFwiaGVsbG8gd29ybGRcIl0nKTtcblxuXHRcdFx0XHRcdGF3YWl0IHJlcGxheUV2ZW50cyhbXG5cdFx0XHRcdFx0XHQnXHUwMDFCWz8yNWxcdTAwMUJbOTNtXHUwMDFCWzM7M0hlY2hvXHUwMDFCWzk3bVx1MDAxQlsybVx1MDAxQlszbSBcImhlbGxvIHdvcmxkXCJcdTAwMUJbMzs3SFx1MDAxQls/MjVoJyxcblx0XHRcdFx0XHRcdCdcdTAwMUJbbScsXG5cdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2VjaG98WyBcImhlbGxvIHdvcmxkXCJdJyk7XG5cblx0XHRcdFx0XHRhd2FpdCByZXBsYXlFdmVudHMoW1xuXHRcdFx0XHRcdFx0J1x1MDAxQls/MjVsXHUwMDFCWzkzbVx1MDAxQlszOzNIZWNobyBcdTAwMUJbOTdtXHUwMDFCWzJtXHUwMDFCWzNtXCJoZWxsbyB3b3JsZFwiXHUwMDFCWzM7OEhcdTAwMUJbPzI1aCcsXG5cdFx0XHRcdFx0XHQnXHUwMDFCW20nLFxuXHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdlY2hvIHxbXCJoZWxsbyB3b3JsZFwiXScpO1xuXG5cdFx0XHRcdFx0YXdhaXQgcmVwbGF5RXZlbnRzKFtcblx0XHRcdFx0XHRcdCdcdTAwMUJbPzI1bFx1MDAxQls5M21cdTAwMUJbMzszSGVjaG8gXHUwMDFCWzM2bVwiaGVsbG8gd29ybGRcIlx1MDAxQls/MjVoJyxcblx0XHRcdFx0XHRcdCdcdTAwMUJbbScsXG5cdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2VjaG8gXCJoZWxsbyB3b3JsZFwifCcpO1xuXG5cdFx0XHRcdFx0YXdhaXQgcmVwbGF5RXZlbnRzKFtcblx0XHRcdFx0XHRcdCdcdTAwMUJdNjMzO0U7ZWNobyBcImhlbGxvIHdvcmxkXCI7ZmY0NjRkMzktYmM4MC00YmFlLTllYWQtYjFjYWZjNGFkZjZmXHUwMDA3XHUwMDFCXTYzMztDXHUwMDA3Jyxcblx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRmaXJlQ29tbWFuZEV4ZWN1dGVkKCk7XG5cdFx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2VjaG8gXCJoZWxsbyB3b3JsZFwiJyk7XG5cblx0XHRcdFx0XHRhd2FpdCByZXBsYXlFdmVudHMoW1xuXHRcdFx0XHRcdFx0J1xcclxcbicsXG5cdFx0XHRcdFx0XHQnaGVsbG8gd29ybGRcXHJcXG4nLFxuXHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdlY2hvIFwiaGVsbG8gd29ybGRcIicpO1xuXG5cdFx0XHRcdFx0YXdhaXQgcmVwbGF5RXZlbnRzKFtcblx0XHRcdFx0XHRcdCdcdTAwMUJdNjMzO0Q7MFx1MDAwN1x1MDAxQl02MzM7QVx1MDAwN1x1MDAxQl02MzM7UDtDd2Q9QzpcXHg1Y0dpdGh1YlxceDVjbWljcm9zb2Z0XFx4NWN2c2NvZGVcdTAwMDdcdTAwMUJdNjMzO0JcdTAwMDcnLFxuXHRcdFx0XHRcdFx0J1x1MDAxQlszNG1cXHJcXG5cdUUwQjZcdTAwMUJbMzg7MjsxNzsxNzsxN21cdTAwMUJbNDRtMDM6NDE6NDIgXHUwMDFCWzM0bVx1MDAxQls0MW1cdUUwQjAgXHUwMDFCWzM4OzI7MTc7MTc7MTdtdnNjb2RlIFx1MDAxQlszMW1cdTAwMUJbNDNtXHVFMEIwIFx1MDAxQlszODsyOzE3OzE3OzE3bVx1RTBBMCB0eXJpYXIvcHJvbXB0X2lucHV0X21vZGVsIFx1MDAxQlszM21cdTAwMUJbNDZtXHVFMEIwIFx1MDAxQlszODsyOzE3OzE3OzE3bSQgXHUwMDFCWzM2bVx1MDAxQls0OW1cdUUwQjAgXHUwMDFCW212aWEgXHUwMDFCWzMybVx1MDAxQlsxbVx1RTcxOCB2MTguMTguMiBcXHJcXG5cdTI3NkZcdTAwMUJbbSAnLFxuXHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnfCcpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdpbnB1dCwgZ28gdG8gc3RhcnQgKGN0cmwraG9tZSksIGRlbGV0ZSB3b3JkIGluIGZyb250IChjdHJsK2RlbGV0ZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhd2FpdCByZXBsYXlFdmVudHMoW1xuXHRcdFx0XHRcdFx0J1x1MDAxQls/MjVsXHUwMDFCWzJKXHUwMDFCW21cdTAwMUJbSFx1MDAxQl0wO0M6XFxQcm9ncmFtIEZpbGVzXFxXaW5kb3dzQXBwc1xcTWljcm9zb2Z0LlBvd2VyU2hlbGxfNy40LjIuMF94NjRfXzh3ZWt5YjNkOGJid2VcXHB3c2guZXhlXHUwMDA3XHUwMDFCWz8yNWgnLFxuXHRcdFx0XHRcdFx0J1x1MDAxQls/MjVsXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1x1MDAxQltIXHUwMDFCWz8yNWgnLFxuXHRcdFx0XHRcdFx0J1x1MDAxQl02MzM7UDtJc1dpbmRvd3M9VHJ1ZVx1MDAwNycsXG5cdFx0XHRcdFx0XHQnXHUwMDFCXTYzMztQO0NvbnRpbnVhdGlvblByb21wdD1cXHgxYlszOFxceDNiNVxceDNiOG1cdTIyMTlcXHgxYlswbSBcdTAwMDcnLFxuXHRcdFx0XHRcdFx0J1x1MDAxQl02MzM7QVx1MDAwN1x1MDAxQl02MzM7UDtDd2Q9QzpcXHg1Y0dpdGh1YlxceDVjbWljcm9zb2Z0XFx4NWN2c2NvZGVcdTAwMDdcdTAwMUJdNjMzO0JcdTAwMDcnLFxuXHRcdFx0XHRcdFx0J1x1MDAxQlszNG1cXHJcXG5cdUUwQjZcdTAwMUJbMzg7MjsxNzsxNzsxN21cdTAwMUJbNDRtMTY6MDc6MDYgXHUwMDFCWzM0bVx1MDAxQls0MW1cdUUwQjAgXHUwMDFCWzM4OzI7MTc7MTc7MTdtdnNjb2RlIFx1MDAxQlszMW1cdTAwMUJbNDNtXHVFMEIwIFx1MDAxQlszODsyOzE3OzE3OzE3bVx1RTBBMCB0eXJpYXIvMjEwNjYyIFx1MDAxQlszM21cdTAwMUJbNDZtXHVFMEIwIFx1MDAxQlszODsyOzE3OzE3OzE3bSQhIFx1MDAxQlszNm1cdTAwMUJbNDltXHVFMEIwIFx1MDAxQlttdmlhIFx1MDAxQlszMm1cdTAwMUJbMW1cdUU3MTggdjE4LjE4LjIgXFxyXFxuXHUyNzZGXHUwMDFCW20gJyxcblx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRmaXJlQ29tbWFuZFN0YXJ0KCk7XG5cdFx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblxuXHRcdFx0XHRcdGF3YWl0IHJlcGxheUV2ZW50cyhbXG5cdFx0XHRcdFx0XHQnXHUwMDFCWz8yNWxcdTAwMUJbOTNtR1x1MDAxQls5N21cdTAwMUJbMm1cdTAwMUJbM21pdCBwdXNoXHUwMDFCWzM7NEhcdTAwMUJbPzI1aCcsXG5cdFx0XHRcdFx0XHQnXHUwMDFCW20nLFxuXHRcdFx0XHRcdFx0J1x1MDAxQls/MjVsXHUwMDFCWzkzbVxiR2VcdTAwMUJbOTdtXHUwMDFCWzJtXHUwMDFCWzNtdC1DaGlsZEl0ZW0gLVBhdGggYVx1MDAxQlszOzVIXHUwMDFCWz8yNWgnLFxuXHRcdFx0XHRcdFx0J1x1MDAxQlttJyxcblx0XHRcdFx0XHRcdCdcdTAwMUJbPzI1bFx1MDAxQls5M21cdTAwMUJbMzszSEdldFx1MDAxQls5N21cdTAwMUJbMm1cdTAwMUJbM20tQ2hpbGRJdGVtIC1QYXRoIGFcdTAwMUJbMzs2SFx1MDAxQls/MjVoJyxcblx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnR2V0fFstQ2hpbGRJdGVtIC1QYXRoIGFdJyk7XG5cblx0XHRcdFx0XHRhd2FpdCByZXBsYXlFdmVudHMoW1xuXHRcdFx0XHRcdFx0J1x1MDAxQlttJyxcblx0XHRcdFx0XHRcdCdcdTAwMUJbPzI1bFx1MDAxQlszOzNIXHUwMDFCWz8yNWgnLFxuXHRcdFx0XHRcdFx0J1x1MDAxQlsyMVgnLFxuXHRcdFx0XHRcdF0pO1xuXG5cdFx0XHRcdFx0Ly8gRG9uJ3QgZm9yY2UgYSBzeW5jLCB0aGUgcHJvbXB0IGlucHV0IG1vZGVsIHNob3VsZCB1cGRhdGUgYnkgaXRzZWxmXG5cdFx0XHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdFx0XHRjb25zdCBhY3R1YWxWYWx1ZVdpdGhDdXJzb3IgPSBwcm9tcHRJbnB1dE1vZGVsLmdldENvbWJpbmVkU3RyaW5nKCk7XG5cdFx0XHRcdFx0c3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0XHRhY3R1YWxWYWx1ZVdpdGhDdXJzb3IsXG5cdFx0XHRcdFx0XHQnfCcucmVwbGFjZUFsbCgnXFxuJywgJ1xcdTIzQ0UnKVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHdCQUFxRDtBQUM5RCxTQUFTLGVBQWU7QUFFeEIsU0FBUyxJQUFJLG9CQUFvQixtQkFBbUI7QUFDcEQsU0FBUyxlQUFlO0FB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
