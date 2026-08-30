import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { formatOptions, parseArgs } from "../../node/argv.js";
import { addArg } from "../../node/argvHelper.js";
function o(description, type = "string") {
  return {
    description,
    type
  };
}
function c(description, options) {
  return {
    description,
    type: "subcommand",
    options
  };
}
suite("formatOptions", () => {
  test("Text should display small columns correctly", () => {
    assert.deepStrictEqual(
      formatOptions({
        "add": o("bar")
      }, 80),
      ["  --add        bar"]
    );
    assert.deepStrictEqual(
      formatOptions({
        "add": o("bar"),
        "wait": o("ba"),
        "trace": o("b")
      }, 80),
      [
        "  --add        bar",
        "  --wait       ba",
        "  --trace      b"
      ]
    );
  });
  test("Text should wrap", () => {
    assert.deepStrictEqual(
      formatOptions({
        // eslint-disable-next-line local/code-no-any-casts
        "add": o("bar ".repeat(9))
      }, 40),
      [
        "  --add        bar bar bar bar bar bar",
        "               bar bar bar"
      ]
    );
  });
  test("Text should revert to the condensed view when the terminal is too narrow", () => {
    assert.deepStrictEqual(
      formatOptions({
        // eslint-disable-next-line local/code-no-any-casts
        "add": o("bar ".repeat(9))
      }, 30),
      [
        "  --add",
        "      bar bar bar bar bar bar bar bar bar "
      ]
    );
  });
  test("addArg", () => {
    assert.deepStrictEqual(addArg([], "foo"), ["foo"]);
    assert.deepStrictEqual(addArg([], "foo", "bar"), ["foo", "bar"]);
    assert.deepStrictEqual(addArg(["foo"], "bar"), ["foo", "bar"]);
    assert.deepStrictEqual(addArg(["--wait"], "bar"), ["--wait", "bar"]);
    assert.deepStrictEqual(addArg(["--wait", "--", "--foo"], "bar"), ["--wait", "bar", "--", "--foo"]);
    assert.deepStrictEqual(addArg(["--", "--foo"], "bar"), ["bar", "--", "--foo"]);
  });
  test("subcommands", () => {
    assert.deepStrictEqual(
      formatOptions({
        "testcmd": c("A test command", { add: o("A test command option") })
      }, 30),
      [
        "  --testcmd",
        "      A test command"
      ]
    );
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
suite("parseArgs", () => {
  function newErrorReporter(result = [], command = "") {
    const commandPrefix = command ? command + "-" : "";
    return {
      onDeprecatedOption: (deprecatedId) => result.push(`${commandPrefix}onDeprecatedOption ${deprecatedId}`),
      onUnknownOption: (id) => result.push(`${commandPrefix}onUnknownOption ${id}`),
      onEmptyValue: (id) => result.push(`${commandPrefix}onEmptyValue ${id}`),
      onMultipleValues: (id, usedValue) => result.push(`${commandPrefix}onMultipleValues ${id} ${usedValue}`),
      getSubcommandReporter: (c2) => newErrorReporter(result, commandPrefix + c2),
      result
    };
  }
  function assertParse(options, input, expected, expectedErrors) {
    const errorReporter = newErrorReporter();
    assert.deepStrictEqual(parseArgs(input, options, errorReporter), expected);
    assert.deepStrictEqual(errorReporter.result, expectedErrors);
  }
  test("subcommands", () => {
    const options1 = {
      "testcmd": c("A test command", {
        testArg: o("A test command option"),
        _: { type: "string[]" }
      }),
      _: { type: "string[]" }
    };
    assertParse(
      options1,
      ["testcmd", "--testArg=foo"],
      { testcmd: { testArg: "foo", "_": [] }, "_": [] },
      []
    );
    assertParse(
      options1,
      ["testcmd", "--testArg=foo", "--testX"],
      { testcmd: { testArg: "foo", "_": [] }, "_": [] },
      ["testcmd-onUnknownOption testX"]
    );
    assertParse(
      options1,
      ["--testArg=foo", "testcmd", "--testX"],
      { testcmd: { testArg: "foo", "_": [] }, "_": [] },
      ["testcmd-onUnknownOption testX"]
    );
    assertParse(
      options1,
      ["--testArg=foo", "testcmd"],
      { testcmd: { testArg: "foo", "_": [] }, "_": [] },
      []
    );
    assertParse(
      options1,
      ["--testArg", "foo", "testcmd"],
      { testcmd: { testArg: "foo", "_": [] }, "_": [] },
      []
    );
    const options2 = {
      "testcmd": c("A test command", {
        testArg: o("A test command option")
      }),
      testX: { type: "boolean", global: true, description: "" },
      _: { type: "string[]" }
    };
    assertParse(
      options2,
      ["testcmd", "--testArg=foo", "--testX"],
      { testcmd: { testArg: "foo", testX: true, "_": [] }, "_": [] },
      []
    );
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZW52aXJvbm1lbnRcXHRlc3RcXG5vZGVcXGFyZ3YudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgZm9ybWF0T3B0aW9ucywgT3B0aW9uLCBPcHRpb25EZXNjcmlwdGlvbnMsIFN1YmNvbW1hbmQsIHBhcnNlQXJncywgRXJyb3JSZXBvcnRlciB9IGZyb20gJy4uLy4uL25vZGUvYXJndi5qcyc7XG5pbXBvcnQgeyBhZGRBcmcgfSBmcm9tICcuLi8uLi9ub2RlL2FyZ3ZIZWxwZXIuanMnO1xuXG5mdW5jdGlvbiBvKGRlc2NyaXB0aW9uOiBzdHJpbmcsIHR5cGU6ICdib29sZWFuJyB8ICdzdHJpbmcnIHwgJ3N0cmluZ1tdJyA9ICdzdHJpbmcnKTogT3B0aW9uPGFueT4ge1xuXHRyZXR1cm4ge1xuXHRcdGRlc2NyaXB0aW9uLCB0eXBlXG5cdH07XG59XG5mdW5jdGlvbiBjKGRlc2NyaXB0aW9uOiBzdHJpbmcsIG9wdGlvbnM6IE9wdGlvbkRlc2NyaXB0aW9uczxhbnk+KTogU3ViY29tbWFuZDxhbnk+IHtcblx0cmV0dXJuIHtcblx0XHRkZXNjcmlwdGlvbiwgdHlwZTogJ3N1YmNvbW1hbmQnLCBvcHRpb25zXG5cdH07XG59XG5cbnN1aXRlKCdmb3JtYXRPcHRpb25zJywgKCkgPT4ge1xuXG5cdHRlc3QoJ1RleHQgc2hvdWxkIGRpc3BsYXkgc21hbGwgY29sdW1ucyBjb3JyZWN0bHknLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGZvcm1hdE9wdGlvbnMoe1xuXHRcdFx0XHQnYWRkJzogbygnYmFyJylcblx0XHRcdH0sIDgwKSxcblx0XHRcdFsnICAtLWFkZCAgICAgICAgYmFyJ11cblx0XHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRmb3JtYXRPcHRpb25zKHtcblx0XHRcdFx0J2FkZCc6IG8oJ2JhcicpLFxuXHRcdFx0XHQnd2FpdCc6IG8oJ2JhJyksXG5cdFx0XHRcdCd0cmFjZSc6IG8oJ2InKVxuXHRcdFx0fSwgODApLFxuXHRcdFx0W1xuXHRcdFx0XHQnICAtLWFkZCAgICAgICAgYmFyJyxcblx0XHRcdFx0JyAgLS13YWl0ICAgICAgIGJhJyxcblx0XHRcdFx0JyAgLS10cmFjZSAgICAgIGInXG5cdFx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnVGV4dCBzaG91bGQgd3JhcCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0Zm9ybWF0T3B0aW9ucyh7XG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHQnYWRkJzogbygoPGFueT4nYmFyICcpLnJlcGVhdCg5KSlcblx0XHRcdH0sIDQwKSxcblx0XHRcdFtcblx0XHRcdFx0JyAgLS1hZGQgICAgICAgIGJhciBiYXIgYmFyIGJhciBiYXIgYmFyJyxcblx0XHRcdFx0JyAgICAgICAgICAgICAgIGJhciBiYXIgYmFyJ1xuXHRcdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1RleHQgc2hvdWxkIHJldmVydCB0byB0aGUgY29uZGVuc2VkIHZpZXcgd2hlbiB0aGUgdGVybWluYWwgaXMgdG9vIG5hcnJvdycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0Zm9ybWF0T3B0aW9ucyh7XG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHQnYWRkJzogbygoPGFueT4nYmFyICcpLnJlcGVhdCg5KSlcblx0XHRcdH0sIDMwKSxcblx0XHRcdFtcblx0XHRcdFx0JyAgLS1hZGQnLFxuXHRcdFx0XHQnICAgICAgYmFyIGJhciBiYXIgYmFyIGJhciBiYXIgYmFyIGJhciBiYXIgJ1xuXHRcdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkZEFyZycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFkZEFyZyhbXSwgJ2ZvbycpLCBbJ2ZvbyddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFkZEFyZyhbXSwgJ2ZvbycsICdiYXInKSwgWydmb28nLCAnYmFyJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWRkQXJnKFsnZm9vJ10sICdiYXInKSwgWydmb28nLCAnYmFyJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWRkQXJnKFsnLS13YWl0J10sICdiYXInKSwgWyctLXdhaXQnLCAnYmFyJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWRkQXJnKFsnLS13YWl0JywgJy0tJywgJy0tZm9vJ10sICdiYXInKSwgWyctLXdhaXQnLCAnYmFyJywgJy0tJywgJy0tZm9vJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWRkQXJnKFsnLS0nLCAnLS1mb28nXSwgJ2JhcicpLCBbJ2JhcicsICctLScsICctLWZvbyddKTtcblx0fSk7XG5cblx0dGVzdCgnc3ViY29tbWFuZHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGZvcm1hdE9wdGlvbnMoe1xuXHRcdFx0XHQndGVzdGNtZCc6IGMoJ0EgdGVzdCBjb21tYW5kJywgeyBhZGQ6IG8oJ0EgdGVzdCBjb21tYW5kIG9wdGlvbicpIH0pXG5cdFx0XHR9LCAzMCksXG5cdFx0XHRbXG5cdFx0XHRcdCcgIC0tdGVzdGNtZCcsXG5cdFx0XHRcdCcgICAgICBBIHRlc3QgY29tbWFuZCdcblx0XHRcdF0pO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcbn0pO1xuXG5zdWl0ZSgncGFyc2VBcmdzJywgKCkgPT4ge1xuXHRmdW5jdGlvbiBuZXdFcnJvclJlcG9ydGVyKHJlc3VsdDogc3RyaW5nW10gPSBbXSwgY29tbWFuZCA9ICcnKTogRXJyb3JSZXBvcnRlciAmIHsgcmVzdWx0OiBzdHJpbmdbXSB9IHtcblx0XHRjb25zdCBjb21tYW5kUHJlZml4ID0gY29tbWFuZCA/IGNvbW1hbmQgKyAnLScgOiAnJztcblx0XHRyZXR1cm4ge1xuXHRcdFx0b25EZXByZWNhdGVkT3B0aW9uOiAoZGVwcmVjYXRlZElkKSA9PiByZXN1bHQucHVzaChgJHtjb21tYW5kUHJlZml4fW9uRGVwcmVjYXRlZE9wdGlvbiAke2RlcHJlY2F0ZWRJZH1gKSxcblx0XHRcdG9uVW5rbm93bk9wdGlvbjogKGlkKSA9PiByZXN1bHQucHVzaChgJHtjb21tYW5kUHJlZml4fW9uVW5rbm93bk9wdGlvbiAke2lkfWApLFxuXHRcdFx0b25FbXB0eVZhbHVlOiAoaWQpID0+IHJlc3VsdC5wdXNoKGAke2NvbW1hbmRQcmVmaXh9b25FbXB0eVZhbHVlICR7aWR9YCksXG5cdFx0XHRvbk11bHRpcGxlVmFsdWVzOiAoaWQsIHVzZWRWYWx1ZSkgPT4gcmVzdWx0LnB1c2goYCR7Y29tbWFuZFByZWZpeH1vbk11bHRpcGxlVmFsdWVzICR7aWR9ICR7dXNlZFZhbHVlfWApLFxuXHRcdFx0Z2V0U3ViY29tbWFuZFJlcG9ydGVyOiAoYykgPT4gbmV3RXJyb3JSZXBvcnRlcihyZXN1bHQsIGNvbW1hbmRQcmVmaXggKyBjKSxcblx0XHRcdHJlc3VsdFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBhc3NlcnRQYXJzZTxUPihvcHRpb25zOiBPcHRpb25EZXNjcmlwdGlvbnM8VD4sIGlucHV0OiBzdHJpbmdbXSwgZXhwZWN0ZWQ6IFQsIGV4cGVjdGVkRXJyb3JzOiBzdHJpbmdbXSkge1xuXHRcdGNvbnN0IGVycm9yUmVwb3J0ZXIgPSBuZXdFcnJvclJlcG9ydGVyKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZUFyZ3MoaW5wdXQsIG9wdGlvbnMsIGVycm9yUmVwb3J0ZXIpLCBleHBlY3RlZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlcnJvclJlcG9ydGVyLnJlc3VsdCwgZXhwZWN0ZWRFcnJvcnMpO1xuXHR9XG5cblx0dGVzdCgnc3ViY29tbWFuZHMnLCAoKSA9PiB7XG5cblx0XHRpbnRlcmZhY2UgVGVzdEFyZ3MxIHtcblx0XHRcdHRlc3RjbWQ/OiB7XG5cdFx0XHRcdHRlc3RBcmc/OiBzdHJpbmc7XG5cdFx0XHRcdF86IHN0cmluZ1tdO1xuXHRcdFx0fTtcblx0XHRcdF86IHN0cmluZ1tdO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9wdGlvbnMxID0ge1xuXHRcdFx0J3Rlc3RjbWQnOiBjKCdBIHRlc3QgY29tbWFuZCcsIHtcblx0XHRcdFx0dGVzdEFyZzogbygnQSB0ZXN0IGNvbW1hbmQgb3B0aW9uJyksXG5cdFx0XHRcdF86IHsgdHlwZTogJ3N0cmluZ1tdJyB9XG5cdFx0XHR9KSxcblx0XHRcdF86IHsgdHlwZTogJ3N0cmluZ1tdJyB9XG5cdFx0fSBhcyBPcHRpb25EZXNjcmlwdGlvbnM8VGVzdEFyZ3MxPjtcblx0XHRhc3NlcnRQYXJzZShcblx0XHRcdG9wdGlvbnMxLFxuXHRcdFx0Wyd0ZXN0Y21kJywgJy0tdGVzdEFyZz1mb28nXSxcblx0XHRcdHsgdGVzdGNtZDogeyB0ZXN0QXJnOiAnZm9vJywgJ18nOiBbXSB9LCAnXyc6IFtdIH0sXG5cdFx0XHRbXVxuXHRcdCk7XG5cdFx0YXNzZXJ0UGFyc2UoXG5cdFx0XHRvcHRpb25zMSxcblx0XHRcdFsndGVzdGNtZCcsICctLXRlc3RBcmc9Zm9vJywgJy0tdGVzdFgnXSxcblx0XHRcdHsgdGVzdGNtZDogeyB0ZXN0QXJnOiAnZm9vJywgJ18nOiBbXSB9LCAnXyc6IFtdIH0sXG5cdFx0XHRbJ3Rlc3RjbWQtb25Vbmtub3duT3B0aW9uIHRlc3RYJ11cblx0XHQpO1xuXG5cdFx0YXNzZXJ0UGFyc2UoXG5cdFx0XHRvcHRpb25zMSxcblx0XHRcdFsnLS10ZXN0QXJnPWZvbycsICd0ZXN0Y21kJywgJy0tdGVzdFgnXSxcblx0XHRcdHsgdGVzdGNtZDogeyB0ZXN0QXJnOiAnZm9vJywgJ18nOiBbXSB9LCAnXyc6IFtdIH0sXG5cdFx0XHRbJ3Rlc3RjbWQtb25Vbmtub3duT3B0aW9uIHRlc3RYJ11cblx0XHQpO1xuXG5cdFx0YXNzZXJ0UGFyc2UoXG5cdFx0XHRvcHRpb25zMSxcblx0XHRcdFsnLS10ZXN0QXJnPWZvbycsICd0ZXN0Y21kJ10sXG5cdFx0XHR7IHRlc3RjbWQ6IHsgdGVzdEFyZzogJ2ZvbycsICdfJzogW10gfSwgJ18nOiBbXSB9LFxuXHRcdFx0W11cblx0XHQpO1xuXG5cdFx0YXNzZXJ0UGFyc2UoXG5cdFx0XHRvcHRpb25zMSxcblx0XHRcdFsnLS10ZXN0QXJnJywgJ2ZvbycsICd0ZXN0Y21kJ10sXG5cdFx0XHR7IHRlc3RjbWQ6IHsgdGVzdEFyZzogJ2ZvbycsICdfJzogW10gfSwgJ18nOiBbXSB9LFxuXHRcdFx0W11cblx0XHQpO1xuXG5cdFx0aW50ZXJmYWNlIFRlc3RBcmdzMiB7XG5cdFx0XHR0ZXN0Y21kPzoge1xuXHRcdFx0XHR0ZXN0QXJnPzogc3RyaW5nO1xuXHRcdFx0XHR0ZXN0WD86IGJvb2xlYW47XG5cdFx0XHRcdF86IHN0cmluZ1tdO1xuXHRcdFx0fTtcblx0XHRcdHRlc3RYPzogYm9vbGVhbjtcblx0XHRcdF86IHN0cmluZ1tdO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9wdGlvbnMyID0ge1xuXHRcdFx0J3Rlc3RjbWQnOiBjKCdBIHRlc3QgY29tbWFuZCcsIHtcblx0XHRcdFx0dGVzdEFyZzogbygnQSB0ZXN0IGNvbW1hbmQgb3B0aW9uJylcblx0XHRcdH0pLFxuXHRcdFx0dGVzdFg6IHsgdHlwZTogJ2Jvb2xlYW4nLCBnbG9iYWw6IHRydWUsIGRlc2NyaXB0aW9uOiAnJyB9LFxuXHRcdFx0XzogeyB0eXBlOiAnc3RyaW5nW10nIH1cblx0XHR9IGFzIE9wdGlvbkRlc2NyaXB0aW9uczxUZXN0QXJnczI+O1xuXHRcdGFzc2VydFBhcnNlKFxuXHRcdFx0b3B0aW9uczIsXG5cdFx0XHRbJ3Rlc3RjbWQnLCAnLS10ZXN0QXJnPWZvbycsICctLXRlc3RYJ10sXG5cdFx0XHR7IHRlc3RjbWQ6IHsgdGVzdEFyZzogJ2ZvbycsIHRlc3RYOiB0cnVlLCAnXyc6IFtdIH0sICdfJzogW10gfSxcblx0XHRcdFtdXG5cdFx0KTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGVBQXVELGlCQUFnQztBQUNoRyxTQUFTLGNBQWM7QUFFdkIsU0FBUyxFQUFFLGFBQXFCLE9BQTBDLFVBQXVCO0FBQ2hHLFNBQU87QUFBQSxJQUNOO0FBQUEsSUFBYTtBQUFBLEVBQ2Q7QUFDRDtBQUNBLFNBQVMsRUFBRSxhQUFxQixTQUFtRDtBQUNsRixTQUFPO0FBQUEsSUFDTjtBQUFBLElBQWEsTUFBTTtBQUFBLElBQWM7QUFBQSxFQUNsQztBQUNEO0FBRUEsTUFBTSxp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
