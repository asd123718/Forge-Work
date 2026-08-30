import assert from "assert";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { HierarchicalKind } from "../../../../../base/common/hierarchicalKind.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Range } from "../../../../common/core/range.js";
import { LanguageFeatureRegistry } from "../../../../common/languageFeatureRegistry.js";
import * as languages from "../../../../common/languages.js";
import { getCodeActions } from "../../browser/codeAction.js";
import { CodeActionItem, CodeActionKind, CodeActionTriggerSource } from "../../common/types.js";
import { createTextModel } from "../../../../test/common/testTextModel.js";
import { MarkerSeverity } from "../../../../../platform/markers/common/markers.js";
import { Progress } from "../../../../../platform/progress/common/progress.js";
function staticCodeActionProvider(...actions) {
  return new class {
    provideCodeActions() {
      return {
        actions,
        dispose: () => {
        }
      };
    }
  }();
}
suite("CodeAction", () => {
  const langId = "fooLang";
  const uri = URI.parse("untitled:path");
  let model;
  let registry;
  const disposables = new DisposableStore();
  const testData = {
    diagnostics: {
      abc: {
        title: "bTitle",
        diagnostics: [{
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 2,
          endColumn: 1,
          severity: MarkerSeverity.Error,
          message: "abc"
        }]
      },
      bcd: {
        title: "aTitle",
        diagnostics: [{
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 2,
          endColumn: 1,
          severity: MarkerSeverity.Error,
          message: "bcd"
        }]
      }
    },
    command: {
      abc: {
        command: new class {
        }(),
        title: 'Extract to inner function in function "test"'
      }
    },
    spelling: {
      bcd: {
        diagnostics: [],
        edit: new class {
        }(),
        title: "abc"
      }
    },
    tsLint: {
      abc: {
        $ident: "funny57",
        arguments: [],
        id: "_internal_command_delegation",
        title: "abc"
      },
      bcd: {
        $ident: "funny47",
        arguments: [],
        id: "_internal_command_delegation",
        title: "bcd"
      }
    }
  };
  setup(() => {
    registry = new LanguageFeatureRegistry();
    disposables.clear();
    model = createTextModel("test1\ntest2\ntest3", langId, void 0, uri);
    disposables.add(model);
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("CodeActions are sorted by type, #38623", async () => {
    const provider = staticCodeActionProvider(
      testData.command.abc,
      testData.diagnostics.bcd,
      testData.spelling.bcd,
      testData.tsLint.bcd,
      testData.tsLint.abc,
      testData.diagnostics.abc
    );
    disposables.add(registry.register("fooLang", provider));
    const expected = [
      // CodeActions with a diagnostics array are shown first without further sorting
      new CodeActionItem(testData.diagnostics.bcd, provider),
      new CodeActionItem(testData.diagnostics.abc, provider),
      // CodeActions without diagnostics are shown in the given order without any further sorting
      new CodeActionItem(testData.command.abc, provider),
      new CodeActionItem(testData.spelling.bcd, provider),
      new CodeActionItem(testData.tsLint.bcd, provider),
      new CodeActionItem(testData.tsLint.abc, provider)
    ];
    const { validActions: actions } = disposables.add(await getCodeActions(registry, model, new Range(1, 1, 2, 1), { type: languages.CodeActionTriggerType.Invoke, triggerAction: CodeActionTriggerSource.Default }, Progress.None, CancellationToken.None));
    assert.strictEqual(actions.length, 6);
    assert.deepStrictEqual(actions, expected);
  });
  test("getCodeActions should filter by scope", async () => {
    const provider = staticCodeActionProvider(
      { title: "a", kind: "a" },
      { title: "b", kind: "b" },
      { title: "a.b", kind: "a.b" }
    );
    disposables.add(registry.register("fooLang", provider));
    {
      const { validActions: actions } = disposables.add(await getCodeActions(registry, model, new Range(1, 1, 2, 1), { type: languages.CodeActionTriggerType.Auto, triggerAction: CodeActionTriggerSource.Default, filter: { include: new HierarchicalKind("a") } }, Progress.None, CancellationToken.None));
      assert.strictEqual(actions.length, 2);
      assert.strictEqual(actions[0].action.title, "a");
      assert.strictEqual(actions[1].action.title, "a.b");
    }
    {
      const { validActions: actions } = disposables.add(await getCodeActions(registry, model, new Range(1, 1, 2, 1), { type: languages.CodeActionTriggerType.Auto, triggerAction: CodeActionTriggerSource.Default, filter: { include: new HierarchicalKind("a.b") } }, Progress.None, CancellationToken.None));
      assert.strictEqual(actions.length, 1);
      assert.strictEqual(actions[0].action.title, "a.b");
    }
    {
      const { validActions: actions } = disposables.add(await getCodeActions(registry, model, new Range(1, 1, 2, 1), { type: languages.CodeActionTriggerType.Auto, triggerAction: CodeActionTriggerSource.Default, filter: { include: new HierarchicalKind("a.b.c") } }, Progress.None, CancellationToken.None));
      assert.strictEqual(actions.length, 0);
    }
  });
  test("getCodeActions should forward requested scope to providers", async () => {
    const provider = new class {
      provideCodeActions(_model, _range, context, _token) {
        return {
          actions: [
            { title: context.only || "", kind: context.only }
          ],
          dispose: () => {
          }
        };
      }
    }();
    disposables.add(registry.register("fooLang", provider));
    const { validActions: actions } = disposables.add(await getCodeActions(registry, model, new Range(1, 1, 2, 1), { type: languages.CodeActionTriggerType.Auto, triggerAction: CodeActionTriggerSource.Default, filter: { include: new HierarchicalKind("a") } }, Progress.None, CancellationToken.None));
    assert.strictEqual(actions.length, 1);
    assert.strictEqual(actions[0].action.title, "a");
  });
  test("getCodeActions should not return source code action by default", async () => {
    const provider = staticCodeActionProvider(
      { title: "a", kind: CodeActionKind.Source.value },
      { title: "b", kind: "b" }
    );
    disposables.add(registry.register("fooLang", provider));
    {
      const { validActions: actions } = disposables.add(await getCodeActions(registry, model, new Range(1, 1, 2, 1), { type: languages.CodeActionTriggerType.Auto, triggerAction: CodeActionTriggerSource.SourceAction }, Progress.None, CancellationToken.None));
      assert.strictEqual(actions.length, 1);
      assert.strictEqual(actions[0].action.title, "b");
    }
    {
      const { validActions: actions } = disposables.add(await getCodeActions(registry, model, new Range(1, 1, 2, 1), { type: languages.CodeActionTriggerType.Auto, triggerAction: CodeActionTriggerSource.Default, filter: { include: CodeActionKind.Source, includeSourceActions: true } }, Progress.None, CancellationToken.None));
      assert.strictEqual(actions.length, 1);
      assert.strictEqual(actions[0].action.title, "a");
    }
  });
  test("getCodeActions should support filtering out some requested source code actions #84602", async () => {
    const provider = staticCodeActionProvider(
      { title: "a", kind: CodeActionKind.Source.value },
      { title: "b", kind: CodeActionKind.Source.append("test").value },
      { title: "c", kind: "c" }
    );
    disposables.add(registry.register("fooLang", provider));
    {
      const { validActions: actions } = disposables.add(await getCodeActions(registry, model, new Range(1, 1, 2, 1), {
        type: languages.CodeActionTriggerType.Auto,
        triggerAction: CodeActionTriggerSource.SourceAction,
        filter: {
          include: CodeActionKind.Source.append("test"),
          excludes: [CodeActionKind.Source],
          includeSourceActions: true
        }
      }, Progress.None, CancellationToken.None));
      assert.strictEqual(actions.length, 1);
      assert.strictEqual(actions[0].action.title, "b");
    }
  });
  test("getCodeActions no invoke a provider that has been excluded #84602", async () => {
    const baseType = CodeActionKind.Refactor;
    const subType = CodeActionKind.Refactor.append("sub");
    disposables.add(registry.register("fooLang", staticCodeActionProvider(
      { title: "a", kind: baseType.value }
    )));
    let didInvoke = false;
    disposables.add(registry.register("fooLang", new class {
      constructor() {
        this.providedCodeActionKinds = [subType.value];
      }
      provideCodeActions() {
        didInvoke = true;
        return {
          actions: [
            { title: "x", kind: subType.value }
          ],
          dispose: () => {
          }
        };
      }
    }()));
    {
      const { validActions: actions } = disposables.add(await getCodeActions(registry, model, new Range(1, 1, 2, 1), {
        type: languages.CodeActionTriggerType.Auto,
        triggerAction: CodeActionTriggerSource.Refactor,
        filter: {
          include: baseType,
          excludes: [subType]
        }
      }, Progress.None, CancellationToken.None));
      assert.strictEqual(didInvoke, false);
      assert.strictEqual(actions.length, 1);
      assert.strictEqual(actions[0].action.title, "a");
    }
  });
  test("getCodeActions should not invoke code action providers filtered out by providedCodeActionKinds", async () => {
    let wasInvoked = false;
    const provider = new class {
      constructor() {
        this.providedCodeActionKinds = [CodeActionKind.Refactor.value];
      }
      provideCodeActions() {
        wasInvoked = true;
        return { actions: [], dispose: () => {
        } };
      }
    }();
    disposables.add(registry.register("fooLang", provider));
    const { validActions: actions } = disposables.add(await getCodeActions(registry, model, new Range(1, 1, 2, 1), {
      type: languages.CodeActionTriggerType.Auto,
      triggerAction: CodeActionTriggerSource.Refactor,
      filter: {
        include: CodeActionKind.QuickFix
      }
    }, Progress.None, CancellationToken.None));
    assert.strictEqual(actions.length, 0);
    assert.strictEqual(wasInvoked, false);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGNvZGVBY3Rpb25cXHRlc3RcXGJyb3dzZXJcXGNvZGVBY3Rpb24udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBIaWVyYXJjaGljYWxLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaGllcmFyY2hpY2FsS2luZC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZUZlYXR1cmVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZUZlYXR1cmVSZWdpc3RyeS5qcyc7XG5pbXBvcnQgKiBhcyBsYW5ndWFnZXMgZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwvdGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IGdldENvZGVBY3Rpb25zIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9jb2RlQWN0aW9uLmpzJztcbmltcG9ydCB7IENvZGVBY3Rpb25JdGVtLCBDb2RlQWN0aW9uS2luZCwgQ29kZUFjdGlvblRyaWdnZXJTb3VyY2UgfSBmcm9tICcuLi8uLi9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vdGVzdFRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJTWFya2VyRGF0YSwgTWFya2VyU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IFByb2dyZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcblxuZnVuY3Rpb24gc3RhdGljQ29kZUFjdGlvblByb3ZpZGVyKC4uLmFjdGlvbnM6IGxhbmd1YWdlcy5Db2RlQWN0aW9uW10pOiBsYW5ndWFnZXMuQ29kZUFjdGlvblByb3ZpZGVyIHtcblx0cmV0dXJuIG5ldyBjbGFzcyBpbXBsZW1lbnRzIGxhbmd1YWdlcy5Db2RlQWN0aW9uUHJvdmlkZXIge1xuXHRcdHByb3ZpZGVDb2RlQWN0aW9ucygpOiBsYW5ndWFnZXMuQ29kZUFjdGlvbkxpc3Qge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0YWN0aW9uczogYWN0aW9ucyxcblx0XHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9XG5cdFx0XHR9O1xuXHRcdH1cblx0fTtcbn1cblxuXG5zdWl0ZSgnQ29kZUFjdGlvbicsICgpID0+IHtcblxuXHRjb25zdCBsYW5nSWQgPSAnZm9vTGFuZyc7XG5cdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgndW50aXRsZWQ6cGF0aCcpO1xuXHRsZXQgbW9kZWw6IFRleHRNb2RlbDtcblx0bGV0IHJlZ2lzdHJ5OiBMYW5ndWFnZUZlYXR1cmVSZWdpc3RyeTxsYW5ndWFnZXMuQ29kZUFjdGlvblByb3ZpZGVyPjtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGNvbnN0IHRlc3REYXRhID0ge1xuXHRcdGRpYWdub3N0aWNzOiB7XG5cdFx0XHRhYmM6IHtcblx0XHRcdFx0dGl0bGU6ICdiVGl0bGUnLFxuXHRcdFx0XHRkaWFnbm9zdGljczogW3tcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDEsXG5cdFx0XHRcdFx0c3RhcnRDb2x1bW46IDEsXG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogMixcblx0XHRcdFx0XHRlbmRDb2x1bW46IDEsXG5cdFx0XHRcdFx0c2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5LkVycm9yLFxuXHRcdFx0XHRcdG1lc3NhZ2U6ICdhYmMnXG5cdFx0XHRcdH1dXG5cdFx0XHR9LFxuXHRcdFx0YmNkOiB7XG5cdFx0XHRcdHRpdGxlOiAnYVRpdGxlJyxcblx0XHRcdFx0ZGlhZ25vc3RpY3M6IFt7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxLFxuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAxLFxuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IDIsXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiAxLFxuXHRcdFx0XHRcdHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5FcnJvcixcblx0XHRcdFx0XHRtZXNzYWdlOiAnYmNkJ1xuXHRcdFx0XHR9XVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0Y29tbWFuZDoge1xuXHRcdFx0YWJjOiB7XG5cdFx0XHRcdGNvbW1hbmQ6IG5ldyBjbGFzcyBpbXBsZW1lbnRzIGxhbmd1YWdlcy5Db21tYW5kIHtcblx0XHRcdFx0XHRpZCE6ICcxJztcblx0XHRcdFx0XHR0aXRsZSE6ICdhYmMnO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR0aXRsZTogJ0V4dHJhY3QgdG8gaW5uZXIgZnVuY3Rpb24gaW4gZnVuY3Rpb24gXCJ0ZXN0XCInXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRzcGVsbGluZzoge1xuXHRcdFx0YmNkOiB7XG5cdFx0XHRcdGRpYWdub3N0aWNzOiA8SU1hcmtlckRhdGFbXT5bXSxcblx0XHRcdFx0ZWRpdDogbmV3IGNsYXNzIGltcGxlbWVudHMgbGFuZ3VhZ2VzLldvcmtzcGFjZUVkaXQge1xuXHRcdFx0XHRcdGVkaXRzITogbGFuZ3VhZ2VzLklXb3Jrc3BhY2VUZXh0RWRpdFtdO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR0aXRsZTogJ2FiYydcblx0XHRcdH1cblx0XHR9LFxuXHRcdHRzTGludDoge1xuXHRcdFx0YWJjOiB7XG5cdFx0XHRcdCRpZGVudDogJ2Z1bm55JyArIDU3LFxuXHRcdFx0XHRhcmd1bWVudHM6IDxJTWFya2VyRGF0YVtdPltdLFxuXHRcdFx0XHRpZDogJ19pbnRlcm5hbF9jb21tYW5kX2RlbGVnYXRpb24nLFxuXHRcdFx0XHR0aXRsZTogJ2FiYydcblx0XHRcdH0sXG5cdFx0XHRiY2Q6IHtcblx0XHRcdFx0JGlkZW50OiAnZnVubnknICsgNDcsXG5cdFx0XHRcdGFyZ3VtZW50czogPElNYXJrZXJEYXRhW10+W10sXG5cdFx0XHRcdGlkOiAnX2ludGVybmFsX2NvbW1hbmRfZGVsZWdhdGlvbicsXG5cdFx0XHRcdHRpdGxlOiAnYmNkJ1xuXHRcdFx0fVxuXHRcdH1cblx0fTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0cmVnaXN0cnkgPSBuZXcgTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnkoKTtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCd0ZXN0MVxcbnRlc3QyXFxudGVzdDMnLCBsYW5nSWQsIHVuZGVmaW5lZCwgdXJpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnQ29kZUFjdGlvbnMgYXJlIHNvcnRlZCBieSB0eXBlLCAjMzg2MjMnLCBhc3luYyAoKSA9PiB7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IHN0YXRpY0NvZGVBY3Rpb25Qcm92aWRlcihcblx0XHRcdHRlc3REYXRhLmNvbW1hbmQuYWJjLFxuXHRcdFx0dGVzdERhdGEuZGlhZ25vc3RpY3MuYmNkLFxuXHRcdFx0dGVzdERhdGEuc3BlbGxpbmcuYmNkLFxuXHRcdFx0dGVzdERhdGEudHNMaW50LmJjZCxcblx0XHRcdHRlc3REYXRhLnRzTGludC5hYmMsXG5cdFx0XHR0ZXN0RGF0YS5kaWFnbm9zdGljcy5hYmNcblx0XHQpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyKCdmb29MYW5nJywgcHJvdmlkZXIpKTtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0Ly8gQ29kZUFjdGlvbnMgd2l0aCBhIGRpYWdub3N0aWNzIGFycmF5IGFyZSBzaG93biBmaXJzdCB3aXRob3V0IGZ1cnRoZXIgc29ydGluZ1xuXHRcdFx0bmV3IENvZGVBY3Rpb25JdGVtKHRlc3REYXRhLmRpYWdub3N0aWNzLmJjZCwgcHJvdmlkZXIpLFxuXHRcdFx0bmV3IENvZGVBY3Rpb25JdGVtKHRlc3REYXRhLmRpYWdub3N0aWNzLmFiYywgcHJvdmlkZXIpLFxuXG5cdFx0XHQvLyBDb2RlQWN0aW9ucyB3aXRob3V0IGRpYWdub3N0aWNzIGFyZSBzaG93biBpbiB0aGUgZ2l2ZW4gb3JkZXIgd2l0aG91dCBhbnkgZnVydGhlciBzb3J0aW5nXG5cdFx0XHRuZXcgQ29kZUFjdGlvbkl0ZW0odGVzdERhdGEuY29tbWFuZC5hYmMsIHByb3ZpZGVyKSxcblx0XHRcdG5ldyBDb2RlQWN0aW9uSXRlbSh0ZXN0RGF0YS5zcGVsbGluZy5iY2QsIHByb3ZpZGVyKSxcblx0XHRcdG5ldyBDb2RlQWN0aW9uSXRlbSh0ZXN0RGF0YS50c0xpbnQuYmNkLCBwcm92aWRlciksXG5cdFx0XHRuZXcgQ29kZUFjdGlvbkl0ZW0odGVzdERhdGEudHNMaW50LmFiYywgcHJvdmlkZXIpXG5cdFx0XTtcblxuXHRcdGNvbnN0IHsgdmFsaWRBY3Rpb25zOiBhY3Rpb25zIH0gPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgZ2V0Q29kZUFjdGlvbnMocmVnaXN0cnksIG1vZGVsLCBuZXcgUmFuZ2UoMSwgMSwgMiwgMSksIHsgdHlwZTogbGFuZ3VhZ2VzLkNvZGVBY3Rpb25UcmlnZ2VyVHlwZS5JbnZva2UsIHRyaWdnZXJBY3Rpb246IENvZGVBY3Rpb25UcmlnZ2VyU291cmNlLkRlZmF1bHQgfSwgUHJvZ3Jlc3MuTm9uZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zLmxlbmd0aCwgNik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpb25zLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldENvZGVBY3Rpb25zIHNob3VsZCBmaWx0ZXIgYnkgc2NvcGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBzdGF0aWNDb2RlQWN0aW9uUHJvdmlkZXIoXG5cdFx0XHR7IHRpdGxlOiAnYScsIGtpbmQ6ICdhJyB9LFxuXHRcdFx0eyB0aXRsZTogJ2InLCBraW5kOiAnYicgfSxcblx0XHRcdHsgdGl0bGU6ICdhLmInLCBraW5kOiAnYS5iJyB9XG5cdFx0KTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RyeS5yZWdpc3RlcignZm9vTGFuZycsIHByb3ZpZGVyKSk7XG5cblx0XHR7XG5cdFx0XHRjb25zdCB7IHZhbGlkQWN0aW9uczogYWN0aW9ucyB9ID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IGdldENvZGVBY3Rpb25zKHJlZ2lzdHJ5LCBtb2RlbCwgbmV3IFJhbmdlKDEsIDEsIDIsIDEpLCB7IHR5cGU6IGxhbmd1YWdlcy5Db2RlQWN0aW9uVHJpZ2dlclR5cGUuQXV0bywgdHJpZ2dlckFjdGlvbjogQ29kZUFjdGlvblRyaWdnZXJTb3VyY2UuRGVmYXVsdCwgZmlsdGVyOiB7IGluY2x1ZGU6IG5ldyBIaWVyYXJjaGljYWxLaW5kKCdhJykgfSB9LCBQcm9ncmVzcy5Ob25lLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9ucy5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNbMF0uYWN0aW9uLnRpdGxlLCAnYScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNbMV0uYWN0aW9uLnRpdGxlLCAnYS5iJyk7XG5cdFx0fVxuXG5cdFx0e1xuXHRcdFx0Y29uc3QgeyB2YWxpZEFjdGlvbnM6IGFjdGlvbnMgfSA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBnZXRDb2RlQWN0aW9ucyhyZWdpc3RyeSwgbW9kZWwsIG5ldyBSYW5nZSgxLCAxLCAyLCAxKSwgeyB0eXBlOiBsYW5ndWFnZXMuQ29kZUFjdGlvblRyaWdnZXJUeXBlLkF1dG8sIHRyaWdnZXJBY3Rpb246IENvZGVBY3Rpb25UcmlnZ2VyU291cmNlLkRlZmF1bHQsIGZpbHRlcjogeyBpbmNsdWRlOiBuZXcgSGllcmFyY2hpY2FsS2luZCgnYS5iJykgfSB9LCBQcm9ncmVzcy5Ob25lLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNbMF0uYWN0aW9uLnRpdGxlLCAnYS5iJyk7XG5cdFx0fVxuXG5cdFx0e1xuXHRcdFx0Y29uc3QgeyB2YWxpZEFjdGlvbnM6IGFjdGlvbnMgfSA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBnZXRDb2RlQWN0aW9ucyhyZWdpc3RyeSwgbW9kZWwsIG5ldyBSYW5nZSgxLCAxLCAyLCAxKSwgeyB0eXBlOiBsYW5ndWFnZXMuQ29kZUFjdGlvblRyaWdnZXJUeXBlLkF1dG8sIHRyaWdnZXJBY3Rpb246IENvZGVBY3Rpb25UcmlnZ2VyU291cmNlLkRlZmF1bHQsIGZpbHRlcjogeyBpbmNsdWRlOiBuZXcgSGllcmFyY2hpY2FsS2luZCgnYS5iLmMnKSB9IH0sIFByb2dyZXNzLk5vbmUsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zLmxlbmd0aCwgMCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdnZXRDb2RlQWN0aW9ucyBzaG91bGQgZm9yd2FyZCByZXF1ZXN0ZWQgc2NvcGUgdG8gcHJvdmlkZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGltcGxlbWVudHMgbGFuZ3VhZ2VzLkNvZGVBY3Rpb25Qcm92aWRlciB7XG5cdFx0XHRwcm92aWRlQ29kZUFjdGlvbnMoX21vZGVsOiBhbnksIF9yYW5nZTogUmFuZ2UsIGNvbnRleHQ6IGxhbmd1YWdlcy5Db2RlQWN0aW9uQ29udGV4dCwgX3Rva2VuOiBhbnkpOiBsYW5ndWFnZXMuQ29kZUFjdGlvbkxpc3Qge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGFjdGlvbnM6IFtcblx0XHRcdFx0XHRcdHsgdGl0bGU6IGNvbnRleHQub25seSB8fCAnJywga2luZDogY29udGV4dC5vbmx5IH1cblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0cnkucmVnaXN0ZXIoJ2Zvb0xhbmcnLCBwcm92aWRlcikpO1xuXG5cdFx0Y29uc3QgeyB2YWxpZEFjdGlvbnM6IGFjdGlvbnMgfSA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBnZXRDb2RlQWN0aW9ucyhyZWdpc3RyeSwgbW9kZWwsIG5ldyBSYW5nZSgxLCAxLCAyLCAxKSwgeyB0eXBlOiBsYW5ndWFnZXMuQ29kZUFjdGlvblRyaWdnZXJUeXBlLkF1dG8sIHRyaWdnZXJBY3Rpb246IENvZGVBY3Rpb25UcmlnZ2VyU291cmNlLkRlZmF1bHQsIGZpbHRlcjogeyBpbmNsdWRlOiBuZXcgSGllcmFyY2hpY2FsS2luZCgnYScpIH0gfSwgUHJvZ3Jlc3MuTm9uZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNbMF0uYWN0aW9uLnRpdGxlLCAnYScpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRDb2RlQWN0aW9ucyBzaG91bGQgbm90IHJldHVybiBzb3VyY2UgY29kZSBhY3Rpb24gYnkgZGVmYXVsdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IHN0YXRpY0NvZGVBY3Rpb25Qcm92aWRlcihcblx0XHRcdHsgdGl0bGU6ICdhJywga2luZDogQ29kZUFjdGlvbktpbmQuU291cmNlLnZhbHVlIH0sXG5cdFx0XHR7IHRpdGxlOiAnYicsIGtpbmQ6ICdiJyB9XG5cdFx0KTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RyeS5yZWdpc3RlcignZm9vTGFuZycsIHByb3ZpZGVyKSk7XG5cblx0XHR7XG5cdFx0XHRjb25zdCB7IHZhbGlkQWN0aW9uczogYWN0aW9ucyB9ID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IGdldENvZGVBY3Rpb25zKHJlZ2lzdHJ5LCBtb2RlbCwgbmV3IFJhbmdlKDEsIDEsIDIsIDEpLCB7IHR5cGU6IGxhbmd1YWdlcy5Db2RlQWN0aW9uVHJpZ2dlclR5cGUuQXV0bywgdHJpZ2dlckFjdGlvbjogQ29kZUFjdGlvblRyaWdnZXJTb3VyY2UuU291cmNlQWN0aW9uIH0sIFByb2dyZXNzLk5vbmUsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1swXS5hY3Rpb24udGl0bGUsICdiJyk7XG5cdFx0fVxuXG5cdFx0e1xuXHRcdFx0Y29uc3QgeyB2YWxpZEFjdGlvbnM6IGFjdGlvbnMgfSA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBnZXRDb2RlQWN0aW9ucyhyZWdpc3RyeSwgbW9kZWwsIG5ldyBSYW5nZSgxLCAxLCAyLCAxKSwgeyB0eXBlOiBsYW5ndWFnZXMuQ29kZUFjdGlvblRyaWdnZXJUeXBlLkF1dG8sIHRyaWdnZXJBY3Rpb246IENvZGVBY3Rpb25UcmlnZ2VyU291cmNlLkRlZmF1bHQsIGZpbHRlcjogeyBpbmNsdWRlOiBDb2RlQWN0aW9uS2luZC5Tb3VyY2UsIGluY2x1ZGVTb3VyY2VBY3Rpb25zOiB0cnVlIH0gfSwgUHJvZ3Jlc3MuTm9uZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zWzBdLmFjdGlvbi50aXRsZSwgJ2EnKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2dldENvZGVBY3Rpb25zIHNob3VsZCBzdXBwb3J0IGZpbHRlcmluZyBvdXQgc29tZSByZXF1ZXN0ZWQgc291cmNlIGNvZGUgYWN0aW9ucyAjODQ2MDInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBzdGF0aWNDb2RlQWN0aW9uUHJvdmlkZXIoXG5cdFx0XHR7IHRpdGxlOiAnYScsIGtpbmQ6IENvZGVBY3Rpb25LaW5kLlNvdXJjZS52YWx1ZSB9LFxuXHRcdFx0eyB0aXRsZTogJ2InLCBraW5kOiBDb2RlQWN0aW9uS2luZC5Tb3VyY2UuYXBwZW5kKCd0ZXN0JykudmFsdWUgfSxcblx0XHRcdHsgdGl0bGU6ICdjJywga2luZDogJ2MnIH1cblx0XHQpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyKCdmb29MYW5nJywgcHJvdmlkZXIpKTtcblxuXHRcdHtcblx0XHRcdGNvbnN0IHsgdmFsaWRBY3Rpb25zOiBhY3Rpb25zIH0gPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgZ2V0Q29kZUFjdGlvbnMocmVnaXN0cnksIG1vZGVsLCBuZXcgUmFuZ2UoMSwgMSwgMiwgMSksIHtcblx0XHRcdFx0dHlwZTogbGFuZ3VhZ2VzLkNvZGVBY3Rpb25UcmlnZ2VyVHlwZS5BdXRvLCB0cmlnZ2VyQWN0aW9uOiBDb2RlQWN0aW9uVHJpZ2dlclNvdXJjZS5Tb3VyY2VBY3Rpb24sIGZpbHRlcjoge1xuXHRcdFx0XHRcdGluY2x1ZGU6IENvZGVBY3Rpb25LaW5kLlNvdXJjZS5hcHBlbmQoJ3Rlc3QnKSxcblx0XHRcdFx0XHRleGNsdWRlczogW0NvZGVBY3Rpb25LaW5kLlNvdXJjZV0sXG5cdFx0XHRcdFx0aW5jbHVkZVNvdXJjZUFjdGlvbnM6IHRydWUsXG5cdFx0XHRcdH1cblx0XHRcdH0sIFByb2dyZXNzLk5vbmUsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1swXS5hY3Rpb24udGl0bGUsICdiJyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdnZXRDb2RlQWN0aW9ucyBubyBpbnZva2UgYSBwcm92aWRlciB0aGF0IGhhcyBiZWVuIGV4Y2x1ZGVkICM4NDYwMicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBiYXNlVHlwZSA9IENvZGVBY3Rpb25LaW5kLlJlZmFjdG9yO1xuXHRcdGNvbnN0IHN1YlR5cGUgPSBDb2RlQWN0aW9uS2luZC5SZWZhY3Rvci5hcHBlbmQoJ3N1YicpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyKCdmb29MYW5nJywgc3RhdGljQ29kZUFjdGlvblByb3ZpZGVyKFxuXHRcdFx0eyB0aXRsZTogJ2EnLCBraW5kOiBiYXNlVHlwZS52YWx1ZSB9XG5cdFx0KSkpO1xuXG5cdFx0bGV0IGRpZEludm9rZSA9IGZhbHNlO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RyeS5yZWdpc3RlcignZm9vTGFuZycsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIGxhbmd1YWdlcy5Db2RlQWN0aW9uUHJvdmlkZXIge1xuXG5cdFx0XHRwcm92aWRlZENvZGVBY3Rpb25LaW5kcyA9IFtzdWJUeXBlLnZhbHVlXTtcblxuXHRcdFx0cHJvdmlkZUNvZGVBY3Rpb25zKCk6IGxhbmd1YWdlcy5Qcm92aWRlclJlc3VsdDxsYW5ndWFnZXMuQ29kZUFjdGlvbkxpc3Q+IHtcblx0XHRcdFx0ZGlkSW52b2tlID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRhY3Rpb25zOiBbXG5cdFx0XHRcdFx0XHR7IHRpdGxlOiAneCcsIGtpbmQ6IHN1YlR5cGUudmFsdWUgfVxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0e1xuXHRcdFx0Y29uc3QgeyB2YWxpZEFjdGlvbnM6IGFjdGlvbnMgfSA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBnZXRDb2RlQWN0aW9ucyhyZWdpc3RyeSwgbW9kZWwsIG5ldyBSYW5nZSgxLCAxLCAyLCAxKSwge1xuXHRcdFx0XHR0eXBlOiBsYW5ndWFnZXMuQ29kZUFjdGlvblRyaWdnZXJUeXBlLkF1dG8sIHRyaWdnZXJBY3Rpb246IENvZGVBY3Rpb25UcmlnZ2VyU291cmNlLlJlZmFjdG9yLCBmaWx0ZXI6IHtcblx0XHRcdFx0XHRpbmNsdWRlOiBiYXNlVHlwZSxcblx0XHRcdFx0XHRleGNsdWRlczogW3N1YlR5cGVdLFxuXHRcdFx0XHR9XG5cdFx0XHR9LCBQcm9ncmVzcy5Ob25lLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlkSW52b2tlLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNbMF0uYWN0aW9uLnRpdGxlLCAnYScpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnZ2V0Q29kZUFjdGlvbnMgc2hvdWxkIG5vdCBpbnZva2UgY29kZSBhY3Rpb24gcHJvdmlkZXJzIGZpbHRlcmVkIG91dCBieSBwcm92aWRlZENvZGVBY3Rpb25LaW5kcycsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgd2FzSW52b2tlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGltcGxlbWVudHMgbGFuZ3VhZ2VzLkNvZGVBY3Rpb25Qcm92aWRlciB7XG5cdFx0XHRwcm92aWRlQ29kZUFjdGlvbnMoKTogbGFuZ3VhZ2VzLkNvZGVBY3Rpb25MaXN0IHtcblx0XHRcdFx0d2FzSW52b2tlZCA9IHRydWU7XG5cdFx0XHRcdHJldHVybiB7IGFjdGlvbnM6IFtdLCBkaXNwb3NlOiAoKSA9PiB7IH0gfTtcblx0XHRcdH1cblxuXHRcdFx0cHJvdmlkZWRDb2RlQWN0aW9uS2luZHMgPSBbQ29kZUFjdGlvbktpbmQuUmVmYWN0b3IudmFsdWVdO1xuXHRcdH07XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0cnkucmVnaXN0ZXIoJ2Zvb0xhbmcnLCBwcm92aWRlcikpO1xuXG5cdFx0Y29uc3QgeyB2YWxpZEFjdGlvbnM6IGFjdGlvbnMgfSA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBnZXRDb2RlQWN0aW9ucyhyZWdpc3RyeSwgbW9kZWwsIG5ldyBSYW5nZSgxLCAxLCAyLCAxKSwge1xuXHRcdFx0dHlwZTogbGFuZ3VhZ2VzLkNvZGVBY3Rpb25UcmlnZ2VyVHlwZS5BdXRvLCB0cmlnZ2VyQWN0aW9uOiBDb2RlQWN0aW9uVHJpZ2dlclNvdXJjZS5SZWZhY3Rvcixcblx0XHRcdGZpbHRlcjoge1xuXHRcdFx0XHRpbmNsdWRlOiBDb2RlQWN0aW9uS2luZC5RdWlja0ZpeFxuXHRcdFx0fVxuXHRcdH0sIFByb2dyZXNzLk5vbmUsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9ucy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3YXNJbnZva2VkLCBmYWxzZSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFJQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsYUFBYTtBQUN0QixTQUFTLCtCQUErQjtBQUN4QyxZQUFZLGVBQWU7QUFFM0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQkFBZ0IsZ0JBQWdCLCtCQUErQjtBQUN4RSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFzQixzQkFBc0I7QUFDNUMsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyw0QkFBNEIsU0FBK0Q7QUFDbkcsU0FBTyxJQUFJLE1BQThDO0FBQUEsSUFDeEQscUJBQStDO0FBQzlDLGFBQU87QUFBQSxRQUNOO0FBQUEsUUFDQSxTQUFTLE1BQU07QUFBQSxRQUFFO0FBQUEsTUFDbEI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNEO0FBR0EsTUFBTSxjQUFjLE1BQU07QUFFekIsUUFBTSxTQUFTO0FBQ2YsUUFBTSxNQUFNLElBQUksTUFBTSxlQUFlO0FBQ3JDLE1BQUk7QUFDSixNQUFJO0FBQ0osUUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBQ3hDLFFBQU0sV0FBVztBQUFBLElBQ2hCLGFBQWE7QUFBQSxNQUNaLEtBQUs7QUFBQSxRQUNKLE9BQU87QUFBQSxRQUNQLGFBQWEsQ0FBQztBQUFBLFVBQ2IsaUJBQWlCO0FBQUEsVUFDakIsYUFBYTtBQUFBLFVBQ2IsZUFBZTtBQUFBLFVBQ2YsV0FBVztBQUFBLFVBQ1gsVUFBVSxlQUFlO0FBQUEsVUFDekIsU0FBUztBQUFBLFFBQ1YsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxNQUNBLEtBQUs7QUFBQSxRQUNKLE9BQU87QUFBQSxRQUNQLGFBQWEsQ0FBQztBQUFBLFVBQ2IsaUJBQWlCO0FBQUEsVUFDakIsYUFBYTtBQUFBLFVBQ2IsZUFBZTtBQUFBLFVBQ2YsV0FBVztBQUFBLFVBQ1gsVUFBVSxlQUFlO0FBQUEsVUFDekIsU0FBUztBQUFBLFFBQ1YsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNEO0FBQUEsSUFDQSxTQUFTO0FBQUEsTUFDUixLQUFLO0FBQUEsUUFDSixTQUFTLElBQUksTUFBbUM7QUFBQSxRQUdoRDtBQUFBLFFBQ0EsT0FBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBQUEsSUFDQSxVQUFVO0FBQUEsTUFDVCxLQUFLO0FBQUEsUUFDSixhQUE0QixDQUFDO0FBQUEsUUFDN0IsTUFBTSxJQUFJLE1BQXlDO0FBQUEsUUFFbkQ7QUFBQSxRQUNBLE9BQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUFBLElBQ0EsUUFBUTtBQUFBLE1BQ1AsS0FBSztBQUFBLFFBQ0osUUFBUTtBQUFBLFFBQ1IsV0FBMEIsQ0FBQztBQUFBLFFBQzNCLElBQUk7QUFBQSxRQUNKLE9BQU87QUFBQSxNQUNSO0FBQUEsTUFDQSxLQUFLO0FBQUEsUUFDSixRQUFRO0FBQUEsUUFDUixXQUEwQixDQUFDO0FBQUEsUUFDM0IsSUFBSTtBQUFBLFFBQ0osT0FBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUVBLFFBQU0sTUFBTTtBQUNYLGVBQVcsSUFBSSx3QkFBd0I7QUFDdkMsZ0JBQVksTUFBTTtBQUNsQixZQUFRLGdCQUFnQix1QkFBdUIsUUFBUSxRQUFXLEdBQUc7QUFDckUsZ0JBQVksSUFBSSxLQUFLO0FBQUEsRUFDdEIsQ0FBQztBQUVELFdBQVMsTUFBTTtBQUNkLGdCQUFZLE1BQU07QUFBQSxFQUNuQixDQUFDO0FBRUQsMENBQXdDO0FBRXhDLE9BQUssMENBQTBDLFlBQVk7QUFFMUQsVUFBTSxXQUFXO0FBQUEsTUFDaEIsU0FBUyxRQUFRO0FBQUEsTUFDakIsU0FBUyxZQUFZO0FBQUEsTUFDckIsU0FBUyxTQUFTO0FBQUEsTUFDbEIsU0FBUyxPQUFPO0FBQUEsTUFDaEIsU0FBUyxPQUFPO0FBQUEsTUFDaEIsU0FBUyxZQUFZO0FBQUEsSUFDdEI7QUFFQSxnQkFBWSxJQUFJLFNBQVMsU0FBUyxXQUFXLFFBQVEsQ0FBQztBQUV0RCxVQUFNLFdBQVc7QUFBQTtBQUFBLE1BRWhCLElBQUksZUFBZSxTQUFTLFlBQVksS0FBSyxRQUFRO0FBQUEsTUFDckQsSUFBSSxlQUFlLFNBQVMsWUFBWSxLQUFLLFFBQVE7QUFBQTtBQUFBLE1BR3JELElBQUksZUFBZSxTQUFTLFFBQVEsS0FBSyxRQUFRO0FBQUEsTUFDakQsSUFBSSxlQUFlLFNBQVMsU0FBUyxLQUFLLFFBQVE7QUFBQSxNQUNsRCxJQUFJLGVBQWUsU0FBUyxPQUFPLEtBQUssUUFBUTtBQUFBLE1BQ2hELElBQUksZUFBZSxTQUFTLE9BQU8sS0FBSyxRQUFRO0FBQUEsSUFDakQ7QUFFQSxVQUFNLEVBQUUsY0FBYyxRQUFRLElBQUksWUFBWSxJQUFJLE1BQU0sZUFBZSxVQUFVLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxFQUFFLE1BQU0sVUFBVSxzQkFBc0IsUUFBUSxlQUFlLHdCQUF3QixRQUFRLEdBQUcsU0FBUyxNQUFNLGtCQUFrQixJQUFJLENBQUM7QUFDdlAsV0FBTyxZQUFZLFFBQVEsUUFBUSxDQUFDO0FBQ3BDLFdBQU8sZ0JBQWdCLFNBQVMsUUFBUTtBQUFBLEVBQ3pDLENBQUM7QUFFRCxPQUFLLHlDQUF5QyxZQUFZO0FBQ3pELFVBQU0sV0FBVztBQUFBLE1BQ2hCLEVBQUUsT0FBTyxLQUFLLE1BQU0sSUFBSTtBQUFBLE1BQ3hCLEVBQUUsT0FBTyxLQUFLLE1BQU0sSUFBSTtBQUFBLE1BQ3hCLEVBQUUsT0FBTyxPQUFPLE1BQU0sTUFBTTtBQUFBLElBQzdCO0FBRUEsZ0JBQVksSUFBSSxTQUFTLFNBQVMsV0FBVyxRQUFRLENBQUM7QUFFdEQ7QUFDQyxZQUFNLEVBQUUsY0FBYyxRQUFRLElBQUksWUFBWSxJQUFJLE1BQU0sZUFBZSxVQUFVLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxFQUFFLE1BQU0sVUFBVSxzQkFBc0IsTUFBTSxlQUFlLHdCQUF3QixTQUFTLFFBQVEsRUFBRSxTQUFTLElBQUksaUJBQWlCLEdBQUcsRUFBRSxFQUFFLEdBQUcsU0FBUyxNQUFNLGtCQUFrQixJQUFJLENBQUM7QUFDclMsYUFBTyxZQUFZLFFBQVEsUUFBUSxDQUFDO0FBQ3BDLGFBQU8sWUFBWSxRQUFRLENBQUMsRUFBRSxPQUFPLE9BQU8sR0FBRztBQUMvQyxhQUFPLFlBQVksUUFBUSxDQUFDLEVBQUUsT0FBTyxPQUFPLEtBQUs7QUFBQSxJQUNsRDtBQUVBO0FBQ0MsWUFBTSxFQUFFLGNBQWMsUUFBUSxJQUFJLFlBQVksSUFBSSxNQUFNLGVBQWUsVUFBVSxPQUFPLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsRUFBRSxNQUFNLFVBQVUsc0JBQXNCLE1BQU0sZUFBZSx3QkFBd0IsU0FBUyxRQUFRLEVBQUUsU0FBUyxJQUFJLGlCQUFpQixLQUFLLEVBQUUsRUFBRSxHQUFHLFNBQVMsTUFBTSxrQkFBa0IsSUFBSSxDQUFDO0FBQ3ZTLGFBQU8sWUFBWSxRQUFRLFFBQVEsQ0FBQztBQUNwQyxhQUFPLFlBQVksUUFBUSxDQUFDLEVBQUUsT0FBTyxPQUFPLEtBQUs7QUFBQSxJQUNsRDtBQUVBO0FBQ0MsWUFBTSxFQUFFLGNBQWMsUUFBUSxJQUFJLFlBQVksSUFBSSxNQUFNLGVBQWUsVUFBVSxPQUFPLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsRUFBRSxNQUFNLFVBQVUsc0JBQXNCLE1BQU0sZUFBZSx3QkFBd0IsU0FBUyxRQUFRLEVBQUUsU0FBUyxJQUFJLGlCQUFpQixPQUFPLEVBQUUsRUFBRSxHQUFHLFNBQVMsTUFBTSxrQkFBa0IsSUFBSSxDQUFDO0FBQ3pTLGFBQU8sWUFBWSxRQUFRLFFBQVEsQ0FBQztBQUFBLElBQ3JDO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyw4REFBOEQsWUFBWTtBQUM5RSxVQUFNLFdBQVcsSUFBSSxNQUE4QztBQUFBLE1BQ2xFLG1CQUFtQixRQUFhLFFBQWUsU0FBc0MsUUFBdUM7QUFDM0gsZUFBTztBQUFBLFVBQ04sU0FBUztBQUFBLFlBQ1IsRUFBRSxPQUFPLFFBQVEsUUFBUSxJQUFJLE1BQU0sUUFBUSxLQUFLO0FBQUEsVUFDakQ7QUFBQSxVQUNBLFNBQVMsTUFBTTtBQUFBLFVBQUU7QUFBQSxRQUNsQjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsZ0JBQVksSUFBSSxTQUFTLFNBQVMsV0FBVyxRQUFRLENBQUM7QUFFdEQsVUFBTSxFQUFFLGNBQWMsUUFBUSxJQUFJLFlBQVksSUFBSSxNQUFNLGVBQWUsVUFBVSxPQUFPLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsRUFBRSxNQUFNLFVBQVUsc0JBQXNCLE1BQU0sZUFBZSx3QkFBd0IsU0FBUyxRQUFRLEVBQUUsU0FBUyxJQUFJLGlCQUFpQixHQUFHLEVBQUUsRUFBRSxHQUFHLFNBQVMsTUFBTSxrQkFBa0IsSUFBSSxDQUFDO0FBQ3JTLFdBQU8sWUFBWSxRQUFRLFFBQVEsQ0FBQztBQUNwQyxXQUFPLFlBQVksUUFBUSxDQUFDLEVBQUUsT0FBTyxPQUFPLEdBQUc7QUFBQSxFQUNoRCxDQUFDO0FBRUQsT0FBSyxrRUFBa0UsWUFBWTtBQUNsRixVQUFNLFdBQVc7QUFBQSxNQUNoQixFQUFFLE9BQU8sS0FBSyxNQUFNLGVBQWUsT0FBTyxNQUFNO0FBQUEsTUFDaEQsRUFBRSxPQUFPLEtBQUssTUFBTSxJQUFJO0FBQUEsSUFDekI7QUFFQSxnQkFBWSxJQUFJLFNBQVMsU0FBUyxXQUFXLFFBQVEsQ0FBQztBQUV0RDtBQUNDLFlBQU0sRUFBRSxjQUFjLFFBQVEsSUFBSSxZQUFZLElBQUksTUFBTSxlQUFlLFVBQVUsT0FBTyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLEVBQUUsTUFBTSxVQUFVLHNCQUFzQixNQUFNLGVBQWUsd0JBQXdCLGFBQWEsR0FBRyxTQUFTLE1BQU0sa0JBQWtCLElBQUksQ0FBQztBQUMxUCxhQUFPLFlBQVksUUFBUSxRQUFRLENBQUM7QUFDcEMsYUFBTyxZQUFZLFFBQVEsQ0FBQyxFQUFFLE9BQU8sT0FBTyxHQUFHO0FBQUEsSUFDaEQ7QUFFQTtBQUNDLFlBQU0sRUFBRSxjQUFjLFFBQVEsSUFBSSxZQUFZLElBQUksTUFBTSxlQUFlLFVBQVUsT0FBTyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLEVBQUUsTUFBTSxVQUFVLHNCQUFzQixNQUFNLGVBQWUsd0JBQXdCLFNBQVMsUUFBUSxFQUFFLFNBQVMsZUFBZSxRQUFRLHNCQUFzQixLQUFLLEVBQUUsR0FBRyxTQUFTLE1BQU0sa0JBQWtCLElBQUksQ0FBQztBQUM3VCxhQUFPLFlBQVksUUFBUSxRQUFRLENBQUM7QUFDcEMsYUFBTyxZQUFZLFFBQVEsQ0FBQyxFQUFFLE9BQU8sT0FBTyxHQUFHO0FBQUEsSUFDaEQ7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHlGQUF5RixZQUFZO0FBQ3pHLFVBQU0sV0FBVztBQUFBLE1BQ2hCLEVBQUUsT0FBTyxLQUFLLE1BQU0sZUFBZSxPQUFPLE1BQU07QUFBQSxNQUNoRCxFQUFFLE9BQU8sS0FBSyxNQUFNLGVBQWUsT0FBTyxPQUFPLE1BQU0sRUFBRSxNQUFNO0FBQUEsTUFDL0QsRUFBRSxPQUFPLEtBQUssTUFBTSxJQUFJO0FBQUEsSUFDekI7QUFFQSxnQkFBWSxJQUFJLFNBQVMsU0FBUyxXQUFXLFFBQVEsQ0FBQztBQUV0RDtBQUNDLFlBQU0sRUFBRSxjQUFjLFFBQVEsSUFBSSxZQUFZLElBQUksTUFBTSxlQUFlLFVBQVUsT0FBTyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHO0FBQUEsUUFDOUcsTUFBTSxVQUFVLHNCQUFzQjtBQUFBLFFBQU0sZUFBZSx3QkFBd0I7QUFBQSxRQUFjLFFBQVE7QUFBQSxVQUN4RyxTQUFTLGVBQWUsT0FBTyxPQUFPLE1BQU07QUFBQSxVQUM1QyxVQUFVLENBQUMsZUFBZSxNQUFNO0FBQUEsVUFDaEMsc0JBQXNCO0FBQUEsUUFDdkI7QUFBQSxNQUNELEdBQUcsU0FBUyxNQUFNLGtCQUFrQixJQUFJLENBQUM7QUFDekMsYUFBTyxZQUFZLFFBQVEsUUFBUSxDQUFDO0FBQ3BDLGFBQU8sWUFBWSxRQUFRLENBQUMsRUFBRSxPQUFPLE9BQU8sR0FBRztBQUFBLElBQ2hEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxxRUFBcUUsWUFBWTtBQUNyRixVQUFNLFdBQVcsZUFBZTtBQUNoQyxVQUFNLFVBQVUsZUFBZSxTQUFTLE9BQU8sS0FBSztBQUVwRCxnQkFBWSxJQUFJLFNBQVMsU0FBUyxXQUFXO0FBQUEsTUFDNUMsRUFBRSxPQUFPLEtBQUssTUFBTSxTQUFTLE1BQU07QUFBQSxJQUNwQyxDQUFDLENBQUM7QUFFRixRQUFJLFlBQVk7QUFDaEIsZ0JBQVksSUFBSSxTQUFTLFNBQVMsV0FBVyxJQUFJLE1BQThDO0FBQUEsTUFBOUM7QUFFaEQsdUNBQTBCLENBQUMsUUFBUSxLQUFLO0FBQUE7QUFBQSxNQUV4QyxxQkFBeUU7QUFDeEUsb0JBQVk7QUFDWixlQUFPO0FBQUEsVUFDTixTQUFTO0FBQUEsWUFDUixFQUFFLE9BQU8sS0FBSyxNQUFNLFFBQVEsTUFBTTtBQUFBLFVBQ25DO0FBQUEsVUFDQSxTQUFTLE1BQU07QUFBQSxVQUFFO0FBQUEsUUFDbEI7QUFBQSxNQUNEO0FBQUEsSUFDRCxHQUFDLENBQUM7QUFFRjtBQUNDLFlBQU0sRUFBRSxjQUFjLFFBQVEsSUFBSSxZQUFZLElBQUksTUFBTSxlQUFlLFVBQVUsT0FBTyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHO0FBQUEsUUFDOUcsTUFBTSxVQUFVLHNCQUFzQjtBQUFBLFFBQU0sZUFBZSx3QkFBd0I7QUFBQSxRQUFVLFFBQVE7QUFBQSxVQUNwRyxTQUFTO0FBQUEsVUFDVCxVQUFVLENBQUMsT0FBTztBQUFBLFFBQ25CO0FBQUEsTUFDRCxHQUFHLFNBQVMsTUFBTSxrQkFBa0IsSUFBSSxDQUFDO0FBQ3pDLGFBQU8sWUFBWSxXQUFXLEtBQUs7QUFDbkMsYUFBTyxZQUFZLFFBQVEsUUFBUSxDQUFDO0FBQ3BDLGFBQU8sWUFBWSxRQUFRLENBQUMsRUFBRSxPQUFPLE9BQU8sR0FBRztBQUFBLElBQ2hEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxrR0FBa0csWUFBWTtBQUNsSCxRQUFJLGFBQWE7QUFDakIsVUFBTSxXQUFXLElBQUksTUFBOEM7QUFBQSxNQUE5QztBQU1wQix1Q0FBMEIsQ0FBQyxlQUFlLFNBQVMsS0FBSztBQUFBO0FBQUEsTUFMeEQscUJBQStDO0FBQzlDLHFCQUFhO0FBQ2IsZUFBTyxFQUFFLFNBQVMsQ0FBQyxHQUFHLFNBQVMsTUFBTTtBQUFBLFFBQUUsRUFBRTtBQUFBLE1BQzFDO0FBQUEsSUFHRDtBQUVBLGdCQUFZLElBQUksU0FBUyxTQUFTLFdBQVcsUUFBUSxDQUFDO0FBRXRELFVBQU0sRUFBRSxjQUFjLFFBQVEsSUFBSSxZQUFZLElBQUksTUFBTSxlQUFlLFVBQVUsT0FBTyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHO0FBQUEsTUFDOUcsTUFBTSxVQUFVLHNCQUFzQjtBQUFBLE1BQU0sZUFBZSx3QkFBd0I7QUFBQSxNQUNuRixRQUFRO0FBQUEsUUFDUCxTQUFTLGVBQWU7QUFBQSxNQUN6QjtBQUFBLElBQ0QsR0FBRyxTQUFTLE1BQU0sa0JBQWtCLElBQUksQ0FBQztBQUN6QyxXQUFPLFlBQVksUUFBUSxRQUFRLENBQUM7QUFDcEMsV0FBTyxZQUFZLFlBQVksS0FBSztBQUFBLEVBQ3JDLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
