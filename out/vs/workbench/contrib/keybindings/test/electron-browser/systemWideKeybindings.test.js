import assert from "assert";
import { KeyChord, KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { OperatingSystem } from "../../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { ResolvedKeybindingItem } from "../../../../../platform/keybinding/common/resolvedKeybindingItem.js";
import { createUSLayoutResolvedKeybinding } from "../../../../../platform/keybinding/test/common/keybindingsTestUtils.js";
import { selectSystemWideKeybindings } from "../../electron-browser/systemWideKeybindings.contribution.js";
suite("SystemWideKeybindings selection", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function resolve(encoded) {
    const resolved = createUSLayoutResolvedKeybinding(encoded, OperatingSystem.Macintosh);
    assert.ok(resolved, "expected a resolvable keybinding");
    return resolved;
  }
  function item(resolvedKeybinding, command, options) {
    return new ResolvedKeybindingItem(
      resolvedKeybinding,
      command,
      options?.commandArgs,
      options?.when ? ContextKeyExpr.deserialize(options.when) : void 0,
      options?.isDefault ?? false,
      null,
      false,
      options?.systemWide ?? false
    );
  }
  test("selects only user system-wide single-combo bindings and preserves args/when", () => {
    const acceleratorBinding = resolve(KeyMod.WinCtrl | KeyMod.CtrlCmd | KeyCode.KeyA);
    const selection = selectSystemWideKeybindings([
      // eligible: user, system-wide, single combo, with args + when
      item(acceleratorBinding, "workbench.action.openAgentsWindow", { commandArgs: { foo: 1 }, when: "editorFocus", systemWide: true }),
      // ignored: not system-wide
      item(resolve(KeyMod.CtrlCmd | KeyCode.KeyB), "noop.notSystemWide"),
      // ignored: default keybinding even if flagged
      item(resolve(KeyMod.CtrlCmd | KeyCode.KeyC), "noop.default", { isDefault: true, systemWide: true }),
      // ignored: removal / no command
      item(resolve(KeyMod.CtrlCmd | KeyCode.KeyD), null, { systemWide: true })
    ]);
    assert.deepStrictEqual(selection, {
      candidates: [{
        accelerator: "Ctrl+Cmd+A",
        commandId: "workbench.action.openAgentsWindow",
        args: { foo: 1 },
        userSettingsLabel: "ctrl+cmd+a",
        hasWhen: true
      }],
      unsupported: [],
      duplicates: []
    });
  });
  test("reports chords / single-modifier bindings as unsupported", () => {
    const chord = resolve(KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyC));
    const selection = selectSystemWideKeybindings([
      item(chord, "noop.chord", { systemWide: true })
    ]);
    assert.deepStrictEqual(selection, {
      candidates: [],
      unsupported: ["cmd+k cmd+c"],
      duplicates: []
    });
  });
  test("keeps the first binding on accelerator conflicts", () => {
    const selection = selectSystemWideKeybindings([
      item(resolve(KeyMod.CtrlCmd | KeyCode.KeyA), "first.wins", { systemWide: true }),
      item(resolve(KeyMod.CtrlCmd | KeyCode.KeyA), "second.loses", { systemWide: true })
    ]);
    assert.deepStrictEqual(selection, {
      candidates: [{
        accelerator: "Cmd+A",
        commandId: "first.wins",
        args: void 0,
        userSettingsLabel: "cmd+a",
        hasWhen: false
      }],
      unsupported: [],
      duplicates: ["cmd+a"]
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGtleWJpbmRpbmdzXFx0ZXN0XFxlbGVjdHJvbi1icm93c2VyXFxzeXN0ZW1XaWRlS2V5YmluZGluZ3MudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEtleUNob3JkLCBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBSZXNvbHZlZEtleWJpbmRpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXliaW5kaW5ncy5qcyc7XG5pbXBvcnQgeyBPcGVyYXRpbmdTeXN0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBSZXNvbHZlZEtleWJpbmRpbmdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24vcmVzb2x2ZWRLZXliaW5kaW5nSXRlbS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVVU0xheW91dFJlc29sdmVkS2V5YmluZGluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvdGVzdC9jb21tb24va2V5YmluZGluZ3NUZXN0VXRpbHMuanMnO1xuaW1wb3J0IHsgc2VsZWN0U3lzdGVtV2lkZUtleWJpbmRpbmdzIH0gZnJvbSAnLi4vLi4vZWxlY3Ryb24tYnJvd3Nlci9zeXN0ZW1XaWRlS2V5YmluZGluZ3MuY29udHJpYnV0aW9uLmpzJztcblxuc3VpdGUoJ1N5c3RlbVdpZGVLZXliaW5kaW5ncyBzZWxlY3Rpb24nLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gcmVzb2x2ZShlbmNvZGVkOiBudW1iZXIpOiBSZXNvbHZlZEtleWJpbmRpbmcge1xuXHRcdGNvbnN0IHJlc29sdmVkID0gY3JlYXRlVVNMYXlvdXRSZXNvbHZlZEtleWJpbmRpbmcoZW5jb2RlZCwgT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc29sdmVkLCAnZXhwZWN0ZWQgYSByZXNvbHZhYmxlIGtleWJpbmRpbmcnKTtcblx0XHRyZXR1cm4gcmVzb2x2ZWQ7XG5cdH1cblxuXHRmdW5jdGlvbiBpdGVtKHJlc29sdmVkS2V5YmluZGluZzogUmVzb2x2ZWRLZXliaW5kaW5nIHwgdW5kZWZpbmVkLCBjb21tYW5kOiBzdHJpbmcgfCBudWxsLCBvcHRpb25zPzogeyBjb21tYW5kQXJncz86IHVua25vd247IHdoZW4/OiBzdHJpbmc7IGlzRGVmYXVsdD86IGJvb2xlYW47IHN5c3RlbVdpZGU/OiBib29sZWFuIH0pOiBSZXNvbHZlZEtleWJpbmRpbmdJdGVtIHtcblx0XHRyZXR1cm4gbmV3IFJlc29sdmVkS2V5YmluZGluZ0l0ZW0oXG5cdFx0XHRyZXNvbHZlZEtleWJpbmRpbmcsXG5cdFx0XHRjb21tYW5kLFxuXHRcdFx0b3B0aW9ucz8uY29tbWFuZEFyZ3MsXG5cdFx0XHRvcHRpb25zPy53aGVuID8gQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUob3B0aW9ucy53aGVuKSA6IHVuZGVmaW5lZCxcblx0XHRcdG9wdGlvbnM/LmlzRGVmYXVsdCA/PyBmYWxzZSxcblx0XHRcdG51bGwsXG5cdFx0XHRmYWxzZSxcblx0XHRcdG9wdGlvbnM/LnN5c3RlbVdpZGUgPz8gZmFsc2UsXG5cdFx0KTtcblx0fVxuXG5cdHRlc3QoJ3NlbGVjdHMgb25seSB1c2VyIHN5c3RlbS13aWRlIHNpbmdsZS1jb21ibyBiaW5kaW5ncyBhbmQgcHJlc2VydmVzIGFyZ3Mvd2hlbicsICgpID0+IHtcblx0XHRjb25zdCBhY2NlbGVyYXRvckJpbmRpbmcgPSByZXNvbHZlKEtleU1vZC5XaW5DdHJsIHwgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUEpO1xuXG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gc2VsZWN0U3lzdGVtV2lkZUtleWJpbmRpbmdzKFtcblx0XHRcdC8vIGVsaWdpYmxlOiB1c2VyLCBzeXN0ZW0td2lkZSwgc2luZ2xlIGNvbWJvLCB3aXRoIGFyZ3MgKyB3aGVuXG5cdFx0XHRpdGVtKGFjY2VsZXJhdG9yQmluZGluZywgJ3dvcmtiZW5jaC5hY3Rpb24ub3BlbkFnZW50c1dpbmRvdycsIHsgY29tbWFuZEFyZ3M6IHsgZm9vOiAxIH0sIHdoZW46ICdlZGl0b3JGb2N1cycsIHN5c3RlbVdpZGU6IHRydWUgfSksXG5cdFx0XHQvLyBpZ25vcmVkOiBub3Qgc3lzdGVtLXdpZGVcblx0XHRcdGl0ZW0ocmVzb2x2ZShLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5QiksICdub29wLm5vdFN5c3RlbVdpZGUnKSxcblx0XHRcdC8vIGlnbm9yZWQ6IGRlZmF1bHQga2V5YmluZGluZyBldmVuIGlmIGZsYWdnZWRcblx0XHRcdGl0ZW0ocmVzb2x2ZShLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5QyksICdub29wLmRlZmF1bHQnLCB7IGlzRGVmYXVsdDogdHJ1ZSwgc3lzdGVtV2lkZTogdHJ1ZSB9KSxcblx0XHRcdC8vIGlnbm9yZWQ6IHJlbW92YWwgLyBubyBjb21tYW5kXG5cdFx0XHRpdGVtKHJlc29sdmUoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUQpLCBudWxsLCB7IHN5c3RlbVdpZGU6IHRydWUgfSksXG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlbGVjdGlvbiwge1xuXHRcdFx0Y2FuZGlkYXRlczogW3tcblx0XHRcdFx0YWNjZWxlcmF0b3I6ICdDdHJsK0NtZCtBJyxcblx0XHRcdFx0Y29tbWFuZElkOiAnd29ya2JlbmNoLmFjdGlvbi5vcGVuQWdlbnRzV2luZG93Jyxcblx0XHRcdFx0YXJnczogeyBmb286IDEgfSxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdjdHJsK2NtZCthJyxcblx0XHRcdFx0aGFzV2hlbjogdHJ1ZSxcblx0XHRcdH1dLFxuXHRcdFx0dW5zdXBwb3J0ZWQ6IFtdLFxuXHRcdFx0ZHVwbGljYXRlczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcG9ydHMgY2hvcmRzIC8gc2luZ2xlLW1vZGlmaWVyIGJpbmRpbmdzIGFzIHVuc3VwcG9ydGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNob3JkID0gcmVzb2x2ZShLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUMpKTtcblxuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IHNlbGVjdFN5c3RlbVdpZGVLZXliaW5kaW5ncyhbXG5cdFx0XHRpdGVtKGNob3JkLCAnbm9vcC5jaG9yZCcsIHsgc3lzdGVtV2lkZTogdHJ1ZSB9KSxcblx0XHRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VsZWN0aW9uLCB7XG5cdFx0XHRjYW5kaWRhdGVzOiBbXSxcblx0XHRcdHVuc3VwcG9ydGVkOiBbJ2NtZCtrIGNtZCtjJ10sXG5cdFx0XHRkdXBsaWNhdGVzOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgdGhlIGZpcnN0IGJpbmRpbmcgb24gYWNjZWxlcmF0b3IgY29uZmxpY3RzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IHNlbGVjdFN5c3RlbVdpZGVLZXliaW5kaW5ncyhbXG5cdFx0XHRpdGVtKHJlc29sdmUoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUEpLCAnZmlyc3Qud2lucycsIHsgc3lzdGVtV2lkZTogdHJ1ZSB9KSxcblx0XHRcdGl0ZW0ocmVzb2x2ZShLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5QSksICdzZWNvbmQubG9zZXMnLCB7IHN5c3RlbVdpZGU6IHRydWUgfSksXG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlbGVjdGlvbiwge1xuXHRcdFx0Y2FuZGlkYXRlczogW3tcblx0XHRcdFx0YWNjZWxlcmF0b3I6ICdDbWQrQScsXG5cdFx0XHRcdGNvbW1hbmRJZDogJ2ZpcnN0LndpbnMnLFxuXHRcdFx0XHRhcmdzOiB1bmRlZmluZWQsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY21kK2EnLFxuXHRcdFx0XHRoYXNXaGVuOiBmYWxzZSxcblx0XHRcdH1dLFxuXHRcdFx0dW5zdXBwb3J0ZWQ6IFtdLFxuXHRcdFx0ZHVwbGljYXRlczogWydjbWQrYSddLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsVUFBVSxT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
