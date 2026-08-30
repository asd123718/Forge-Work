import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ShellIntegrationAddon } from "../../../../../../platform/terminal/common/xterm/shellIntegrationAddon.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { getActiveDocument } from "../../../../../../base/browser/dom.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { strictEqual } from "assert";
import { ExtensionIdentifier } from "../../../../../../platform/extensions/common/extensions.js";
import { importAMDNodeModule } from "../../../../../../amdX.js";
import { ChatAgentLocation, ChatModeKind } from "../../../../chat/common/constants.js";
import { InitialHintAddon } from "../../browser/terminal.initialHint.contribution.js";
import { TestXtermLogger } from "../../../../../../platform/terminal/test/common/terminalTestHelpers.js";
suite("Terminal Initial Hint Addon", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let eventCount = 0;
  let xterm;
  let initialHintAddon;
  const onDidChangeAgentsEmitter = new Emitter();
  const onDidChangeAgents = onDidChangeAgentsEmitter.event;
  const agent = {
    id: "termminal",
    name: "terminal",
    extensionId: new ExtensionIdentifier("test"),
    extensionVersion: void 0,
    extensionPublisherId: "test",
    extensionDisplayName: "test",
    metadata: {},
    slashCommands: [{ name: "test", description: "test" }],
    disambiguation: [],
    locations: [ChatAgentLocation.fromRaw("terminal")],
    modes: [ChatModeKind.Ask],
    invoke: async () => {
      return {};
    }
  };
  const editorAgent = {
    id: "editor",
    name: "editor",
    extensionId: new ExtensionIdentifier("test-editor"),
    extensionVersion: void 0,
    extensionPublisherId: "test-editor",
    extensionDisplayName: "test-editor",
    metadata: {},
    slashCommands: [{ name: "test", description: "test" }],
    locations: [ChatAgentLocation.fromRaw("editor")],
    modes: [ChatModeKind.Ask],
    disambiguation: [],
    invoke: async () => {
      return {};
    }
  };
  setup(async () => {
    const instantiationService = workbenchInstantiationService({}, store);
    const TerminalCtor = (await importAMDNodeModule("@xterm/xterm", "lib/xterm.js")).Terminal;
    xterm = store.add(new TerminalCtor({ logger: TestXtermLogger }));
    const shellIntegrationAddon = store.add(new ShellIntegrationAddon("", true, void 0, void 0, new NullLogService()));
    initialHintAddon = store.add(instantiationService.createInstance(InitialHintAddon, shellIntegrationAddon.capabilities, onDidChangeAgents));
    store.add(initialHintAddon.onDidRequestCreateHint(() => eventCount++));
    const testContainer = document.createElement("div");
    getActiveDocument().body.append(testContainer);
    xterm.open(testContainer);
    xterm.loadAddon(shellIntegrationAddon);
    xterm.loadAddon(initialHintAddon);
  });
  suite("Chat providers", () => {
    test("hint is not shown when there are no chat providers", () => {
      eventCount = 0;
      xterm.focus();
      strictEqual(eventCount, 0);
    });
    test("hint is not shown when there is just an editor agent", () => {
      eventCount = 0;
      onDidChangeAgentsEmitter.fire(editorAgent);
      xterm.focus();
      strictEqual(eventCount, 0);
    });
    test("hint is shown when there is a terminal chat agent", () => {
      eventCount = 0;
      onDidChangeAgentsEmitter.fire(editorAgent);
      xterm.focus();
      strictEqual(eventCount, 0);
      onDidChangeAgentsEmitter.fire(agent);
      strictEqual(eventCount, 1);
    });
    test("hint is not shown again when another terminal chat agent is added if it has already shown", () => {
      eventCount = 0;
      onDidChangeAgentsEmitter.fire(agent);
      xterm.focus();
      strictEqual(eventCount, 1);
      onDidChangeAgentsEmitter.fire(agent);
      strictEqual(eventCount, 1);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcaW5saW5lSGludFxcdGVzdFxcYnJvd3NlclxcdGVybWluYWxJbml0aWFsSGludC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgeyBUZXJtaW5hbCB9IGZyb20gJ0B4dGVybS94dGVybSc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFNoZWxsSW50ZWdyYXRpb25BZGRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi94dGVybS9zaGVsbEludGVncmF0aW9uQWRkb24uanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgZ2V0QWN0aXZlRG9jdW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBzdHJpY3RFcXVhbCB9IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFnZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9jb21tb24vcGFydGljaXBhbnRzL2NoYXRBZ2VudHMuanMnO1xuaW1wb3J0IHsgaW1wb3J0QU1ETm9kZU1vZHVsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2FtZFguanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24sIENoYXRNb2RlS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJbml0aWFsSGludEFkZG9uIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90ZXJtaW5hbC5pbml0aWFsSGludC5jb250cmlidXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdFh0ZXJtTG9nZ2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvdGVzdC9jb21tb24vdGVybWluYWxUZXN0SGVscGVycy5qcyc7XG5cbnN1aXRlKCdUZXJtaW5hbCBJbml0aWFsIEhpbnQgQWRkb24nLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdGxldCBldmVudENvdW50ID0gMDtcblx0bGV0IHh0ZXJtOiBUZXJtaW5hbDtcblx0bGV0IGluaXRpYWxIaW50QWRkb246IEluaXRpYWxIaW50QWRkb247XG5cdGNvbnN0IG9uRGlkQ2hhbmdlQWdlbnRzRW1pdHRlcjogRW1pdHRlcjxJQ2hhdEFnZW50IHwgdW5kZWZpbmVkPiA9IG5ldyBFbWl0dGVyKCk7XG5cdGNvbnN0IG9uRGlkQ2hhbmdlQWdlbnRzID0gb25EaWRDaGFuZ2VBZ2VudHNFbWl0dGVyLmV2ZW50O1xuXHRjb25zdCBhZ2VudDogSUNoYXRBZ2VudCA9IHtcblx0XHRpZDogJ3Rlcm1taW5hbCcsXG5cdFx0bmFtZTogJ3Rlcm1pbmFsJyxcblx0XHRleHRlbnNpb25JZDogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ3Rlc3QnKSxcblx0XHRleHRlbnNpb25WZXJzaW9uOiB1bmRlZmluZWQsXG5cdFx0ZXh0ZW5zaW9uUHVibGlzaGVySWQ6ICd0ZXN0Jyxcblx0XHRleHRlbnNpb25EaXNwbGF5TmFtZTogJ3Rlc3QnLFxuXHRcdG1ldGFkYXRhOiB7fSxcblx0XHRzbGFzaENvbW1hbmRzOiBbeyBuYW1lOiAndGVzdCcsIGRlc2NyaXB0aW9uOiAndGVzdCcgfV0sXG5cdFx0ZGlzYW1iaWd1YXRpb246IFtdLFxuXHRcdGxvY2F0aW9uczogW0NoYXRBZ2VudExvY2F0aW9uLmZyb21SYXcoJ3Rlcm1pbmFsJyldLFxuXHRcdG1vZGVzOiBbQ2hhdE1vZGVLaW5kLkFza10sXG5cdFx0aW52b2tlOiBhc3luYyAoKSA9PiB7IHJldHVybiB7fTsgfVxuXHR9O1xuXHRjb25zdCBlZGl0b3JBZ2VudDogSUNoYXRBZ2VudCA9IHtcblx0XHRpZDogJ2VkaXRvcicsXG5cdFx0bmFtZTogJ2VkaXRvcicsXG5cdFx0ZXh0ZW5zaW9uSWQ6IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCd0ZXN0LWVkaXRvcicpLFxuXHRcdGV4dGVuc2lvblZlcnNpb246IHVuZGVmaW5lZCxcblx0XHRleHRlbnNpb25QdWJsaXNoZXJJZDogJ3Rlc3QtZWRpdG9yJyxcblx0XHRleHRlbnNpb25EaXNwbGF5TmFtZTogJ3Rlc3QtZWRpdG9yJyxcblx0XHRtZXRhZGF0YToge30sXG5cdFx0c2xhc2hDb21tYW5kczogW3sgbmFtZTogJ3Rlc3QnLCBkZXNjcmlwdGlvbjogJ3Rlc3QnIH1dLFxuXHRcdGxvY2F0aW9uczogW0NoYXRBZ2VudExvY2F0aW9uLmZyb21SYXcoJ2VkaXRvcicpXSxcblx0XHRtb2RlczogW0NoYXRNb2RlS2luZC5Bc2tdLFxuXHRcdGRpc2FtYmlndWF0aW9uOiBbXSxcblx0XHRpbnZva2U6IGFzeW5jICgpID0+IHsgcmV0dXJuIHt9OyB9XG5cdH07XG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHt9LCBzdG9yZSk7XG5cdFx0Y29uc3QgVGVybWluYWxDdG9yID0gKGF3YWl0IGltcG9ydEFNRE5vZGVNb2R1bGU8dHlwZW9mIGltcG9ydCgnQHh0ZXJtL3h0ZXJtJyk+KCdAeHRlcm0veHRlcm0nLCAnbGliL3h0ZXJtLmpzJykpLlRlcm1pbmFsO1xuXHRcdHh0ZXJtID0gc3RvcmUuYWRkKG5ldyBUZXJtaW5hbEN0b3IoeyBsb2dnZXI6IFRlc3RYdGVybUxvZ2dlciB9KSk7XG5cdFx0Y29uc3Qgc2hlbGxJbnRlZ3JhdGlvbkFkZG9uID0gc3RvcmUuYWRkKG5ldyBTaGVsbEludGVncmF0aW9uQWRkb24oJycsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBuZXcgTnVsbExvZ1NlcnZpY2UpKTtcblx0XHRpbml0aWFsSGludEFkZG9uID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEluaXRpYWxIaW50QWRkb24sIHNoZWxsSW50ZWdyYXRpb25BZGRvbi5jYXBhYmlsaXRpZXMsIG9uRGlkQ2hhbmdlQWdlbnRzKSk7XG5cdFx0c3RvcmUuYWRkKGluaXRpYWxIaW50QWRkb24ub25EaWRSZXF1ZXN0Q3JlYXRlSGludCgoKSA9PiBldmVudENvdW50KyspKTtcblx0XHRjb25zdCB0ZXN0Q29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0Z2V0QWN0aXZlRG9jdW1lbnQoKS5ib2R5LmFwcGVuZCh0ZXN0Q29udGFpbmVyKTtcblx0XHR4dGVybS5vcGVuKHRlc3RDb250YWluZXIpO1xuXG5cdFx0eHRlcm0ubG9hZEFkZG9uKHNoZWxsSW50ZWdyYXRpb25BZGRvbik7XG5cdFx0eHRlcm0ubG9hZEFkZG9uKGluaXRpYWxIaW50QWRkb24pO1xuXHR9KTtcblxuXHRzdWl0ZSgnQ2hhdCBwcm92aWRlcnMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnaGludCBpcyBub3Qgc2hvd24gd2hlbiB0aGVyZSBhcmUgbm8gY2hhdCBwcm92aWRlcnMnLCAoKSA9PiB7XG5cdFx0XHRldmVudENvdW50ID0gMDtcblx0XHRcdHh0ZXJtLmZvY3VzKCk7XG5cdFx0XHRzdHJpY3RFcXVhbChldmVudENvdW50LCAwKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdoaW50IGlzIG5vdCBzaG93biB3aGVuIHRoZXJlIGlzIGp1c3QgYW4gZWRpdG9yIGFnZW50JywgKCkgPT4ge1xuXHRcdFx0ZXZlbnRDb3VudCA9IDA7XG5cdFx0XHRvbkRpZENoYW5nZUFnZW50c0VtaXR0ZXIuZmlyZShlZGl0b3JBZ2VudCk7XG5cdFx0XHR4dGVybS5mb2N1cygpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZXZlbnRDb3VudCwgMCk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnaGludCBpcyBzaG93biB3aGVuIHRoZXJlIGlzIGEgdGVybWluYWwgY2hhdCBhZ2VudCcsICgpID0+IHtcblx0XHRcdGV2ZW50Q291bnQgPSAwO1xuXHRcdFx0b25EaWRDaGFuZ2VBZ2VudHNFbWl0dGVyLmZpcmUoZWRpdG9yQWdlbnQpO1xuXHRcdFx0eHRlcm0uZm9jdXMoKTtcblx0XHRcdHN0cmljdEVxdWFsKGV2ZW50Q291bnQsIDApO1xuXHRcdFx0b25EaWRDaGFuZ2VBZ2VudHNFbWl0dGVyLmZpcmUoYWdlbnQpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZXZlbnRDb3VudCwgMSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnaGludCBpcyBub3Qgc2hvd24gYWdhaW4gd2hlbiBhbm90aGVyIHRlcm1pbmFsIGNoYXQgYWdlbnQgaXMgYWRkZWQgaWYgaXQgaGFzIGFscmVhZHkgc2hvd24nLCAoKSA9PiB7XG5cdFx0XHRldmVudENvdW50ID0gMDtcblx0XHRcdG9uRGlkQ2hhbmdlQWdlbnRzRW1pdHRlci5maXJlKGFnZW50KTtcblx0XHRcdHh0ZXJtLmZvY3VzKCk7XG5cdFx0XHRzdHJpY3RFcXVhbChldmVudENvdW50LCAxKTtcblx0XHRcdG9uRGlkQ2hhbmdlQWdlbnRzRW1pdHRlci5maXJlKGFnZW50KTtcblx0XHRcdHN0cmljdEVxdWFsKGV2ZW50Q291bnQsIDEpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsMkJBQTJCO0FBRXBDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsbUJBQW1CLG9CQUFvQjtBQUNoRCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHVCQUF1QjtBQUVoQyxNQUFNLCtCQUErQixNQUFNO0FBQzFDLFFBQU0sUUFBUSx3Q0FBd0M7QUFDdEQsTUFBSSxhQUFhO0FBQ2pCLE1BQUk7QUFDSixNQUFJO0FBQ0osUUFBTSwyQkFBNEQsSUFBSSxRQUFRO0FBQzlFLFFBQU0sb0JBQW9CLHlCQUF5QjtBQUNuRCxRQUFNLFFBQW9CO0FBQUEsSUFDekIsSUFBSTtBQUFBLElBQ0osTUFBTTtBQUFBLElBQ04sYUFBYSxJQUFJLG9CQUFvQixNQUFNO0FB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
