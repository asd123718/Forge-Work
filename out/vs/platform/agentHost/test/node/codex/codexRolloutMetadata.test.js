import assert from "assert";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { FileService } from "../../../../files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../../files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../../log/common/log.js";
import { SessionServerToolName } from "../../../common/serverToolNames.js";
import { readCodexRolloutMetadata } from "../../../node/codex/codexRolloutMetadata.js";
suite("codexRolloutMetadata", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function createFileService(testDisposables) {
    const fileService = testDisposables.add(new FileService(new NullLogService()));
    testDisposables.add(fileService.registerProvider(Schemas.file, testDisposables.add(new InMemoryFileSystemProvider())));
    return fileService;
  }
  test("restores create-thread and send-message targets from completed rollout tool calls", async () => {
    const testDisposables = disposables.add(new DisposableStore());
    const fileService = createFileService(testDisposables);
    const resource = URI.file("/rollout.jsonl");
    const targetThreadId = "target-thread";
    const clientThreadId = "pending-worktree";
    const records = [
      {
        type: "response_item",
        payload: {
          type: "custom_tool_call",
          call_id: "create-call",
          name: "exec",
          input: 'const result = await tools.codex_app__create_thread({\\n  prompt: "Remember this word: capybara",\\n  title: "Remember capybara"\\n});',
          internal_chat_message_metadata_passthrough: { turn_id: "turn-create" }
        }
      },
      {
        type: "response_item",
        payload: {
          type: "custom_tool_call_output",
          call_id: "create-call",
          output: [
            { type: "input_text", text: "Script completed" },
            { type: "input_text", text: JSON.stringify({ threadId: targetThreadId, hostId: "local" }) }
          ]
        }
      },
      {
        type: "response_item",
        payload: {
          type: "custom_tool_call",
          call_id: "send-call",
          name: "exec",
          input: `const result = await tools.codex_app__send_message_to_thread({\\n  threadId: "${targetThreadId}",\\n  hostId: "local",\\n  prompt: "foo"\\n});`,
          internal_chat_message_metadata_passthrough: { turn_id: "turn-send" }
        }
      },
      {
        type: "response_item",
        payload: {
          type: "custom_tool_call_output",
          call_id: "send-call",
          output: JSON.stringify({ threadId: targetThreadId })
        }
      },
      {
        type: "response_item",
        payload: {
          type: "custom_tool_call",
          call_id: "worktree-call",
          name: "exec",
          input: 'const result = await tools.codex_app__create_thread({ prompt: "Set up the worktree", title: "Worktree setup" });',
          internal_chat_message_metadata_passthrough: { turn_id: "turn-worktree" }
        }
      },
      {
        type: "response_item",
        payload: {
          type: "custom_tool_call_output",
          call_id: "worktree-call",
          output: JSON.stringify({ clientThreadId, hostId: "local" })
        }
      }
    ];
    await fileService.writeFile(resource, VSBuffer.fromString(records.map((record) => JSON.stringify(record)).join("\n")));
    const metadata = await readCodexRolloutMetadata(fileService, resource.fsPath);
    assert.deepStrictEqual([...metadata.threadCoordinationByTurnId].map(([turnId, calls]) => ({
      turnId,
      calls: calls.map((call) => ({
        toolName: call.toolName,
        targetThreadId: call.targetThreadId,
        openLink: call.openLink,
        toolInput: call.toolInput
      }))
    })), [{
      turnId: "turn-create",
      calls: [{
        toolName: SessionServerToolName.CreateSession,
        targetThreadId,
        openLink: `agent-host-session://codex/${targetThreadId}`,
        toolInput: { prompt: "Remember capybara" }
      }]
    }, {
      turnId: "turn-send",
      calls: [{
        toolName: SessionServerToolName.SendMessage,
        targetThreadId,
        openLink: `agent-host-session://codex/${targetThreadId}`,
        toolInput: { prompt: "foo" }
      }]
    }, {
      turnId: "turn-worktree",
      calls: [{
        toolName: SessionServerToolName.CreateSession,
        targetThreadId: clientThreadId,
        openLink: `agent-host-session://codex/${clientThreadId}`,
        toolInput: { prompt: "Worktree setup" }
      }]
    }]);
  });
  test("ignores incomplete and non-local thread-management calls", async () => {
    const testDisposables = disposables.add(new DisposableStore());
    const fileService = createFileService(testDisposables);
    const resource = URI.file("/rollout.jsonl");
    const records = [
      {
        type: "response_item",
        payload: {
          type: "custom_tool_call",
          call_id: "remote-call",
          name: "exec",
          input: 'const result = await tools.codex_app__send_message_to_thread({ threadId: "remote-thread", hostId: "ssh", prompt: "foo" });',
          internal_chat_message_metadata_passthrough: { turn_id: "turn-remote" }
        }
      },
      {
        type: "response_item",
        payload: {
          type: "custom_tool_call_output",
          call_id: "remote-call",
          output: [{ type: "input_text", text: JSON.stringify({ threadId: "remote-thread" }) }]
        }
      },
      {
        type: "response_item",
        payload: {
          type: "custom_tool_call",
          call_id: "unfinished-call",
          name: "exec",
          input: 'const result = await tools.codex_app__create_thread({ prompt: "unfinished" });',
          internal_chat_message_metadata_passthrough: { turn_id: "turn-unfinished" }
        }
      }
    ];
    await fileService.writeFile(resource, VSBuffer.fromString(records.map((record) => JSON.stringify(record)).join("\n")));
    const metadata = await readCodexRolloutMetadata(fileService, resource.fsPath);
    assert.deepStrictEqual([...metadata.threadCoordinationByTurnId], []);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjb2RleFxcY29kZXhSb2xsb3V0TWV0YWRhdGEudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9pbk1lbW9yeUZpbGVzeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFNlc3Npb25TZXJ2ZXJUb29sTmFtZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2ZXJUb29sTmFtZXMuanMnO1xuaW1wb3J0IHsgcmVhZENvZGV4Um9sbG91dE1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9jb2RleC9jb2RleFJvbGxvdXRNZXRhZGF0YS5qcyc7XG5cbnN1aXRlKCdjb2RleFJvbGxvdXRNZXRhZGF0YScsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVGaWxlU2VydmljZSh0ZXN0RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IEZpbGVTZXJ2aWNlIHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0dGVzdERpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKFNjaGVtYXMuZmlsZSwgdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSkpKTtcblx0XHRyZXR1cm4gZmlsZVNlcnZpY2U7XG5cdH1cblxuXHR0ZXN0KCdyZXN0b3JlcyBjcmVhdGUtdGhyZWFkIGFuZCBzZW5kLW1lc3NhZ2UgdGFyZ2V0cyBmcm9tIGNvbXBsZXRlZCByb2xsb3V0IHRvb2wgY2FsbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdERpc3Bvc2FibGVzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjcmVhdGVGaWxlU2VydmljZSh0ZXN0RGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy9yb2xsb3V0Lmpzb25sJyk7XG5cdFx0Y29uc3QgdGFyZ2V0VGhyZWFkSWQgPSAndGFyZ2V0LXRocmVhZCc7XG5cdFx0Y29uc3QgY2xpZW50VGhyZWFkSWQgPSAncGVuZGluZy13b3JrdHJlZSc7XG5cdFx0Y29uc3QgcmVjb3JkcyA9IFtcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ3Jlc3BvbnNlX2l0ZW0nLFxuXHRcdFx0XHRwYXlsb2FkOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2N1c3RvbV90b29sX2NhbGwnLFxuXHRcdFx0XHRcdGNhbGxfaWQ6ICdjcmVhdGUtY2FsbCcsXG5cdFx0XHRcdFx0bmFtZTogJ2V4ZWMnLFxuXHRcdFx0XHRcdGlucHV0OiAnY29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbHMuY29kZXhfYXBwX19jcmVhdGVfdGhyZWFkKHtcXFxcbiAgcHJvbXB0OiBcXFwiUmVtZW1iZXIgdGhpcyB3b3JkOiBjYXB5YmFyYVxcXCIsXFxcXG4gIHRpdGxlOiBcXFwiUmVtZW1iZXIgY2FweWJhcmFcXFwiXFxcXG59KTsnLFxuXHRcdFx0XHRcdGludGVybmFsX2NoYXRfbWVzc2FnZV9tZXRhZGF0YV9wYXNzdGhyb3VnaDogeyB0dXJuX2lkOiAndHVybi1jcmVhdGUnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAncmVzcG9uc2VfaXRlbScsXG5cdFx0XHRcdHBheWxvYWQ6IHtcblx0XHRcdFx0XHR0eXBlOiAnY3VzdG9tX3Rvb2xfY2FsbF9vdXRwdXQnLFxuXHRcdFx0XHRcdGNhbGxfaWQ6ICdjcmVhdGUtY2FsbCcsXG5cdFx0XHRcdFx0b3V0cHV0OiBbXG5cdFx0XHRcdFx0XHR7IHR5cGU6ICdpbnB1dF90ZXh0JywgdGV4dDogJ1NjcmlwdCBjb21wbGV0ZWQnIH0sXG5cdFx0XHRcdFx0XHR7IHR5cGU6ICdpbnB1dF90ZXh0JywgdGV4dDogSlNPTi5zdHJpbmdpZnkoeyB0aHJlYWRJZDogdGFyZ2V0VGhyZWFkSWQsIGhvc3RJZDogJ2xvY2FsJyB9KSB9LFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAncmVzcG9uc2VfaXRlbScsXG5cdFx0XHRcdHBheWxvYWQ6IHtcblx0XHRcdFx0XHR0eXBlOiAnY3VzdG9tX3Rvb2xfY2FsbCcsXG5cdFx0XHRcdFx0Y2FsbF9pZDogJ3NlbmQtY2FsbCcsXG5cdFx0XHRcdFx0bmFtZTogJ2V4ZWMnLFxuXHRcdFx0XHRcdGlucHV0OiBgY29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbHMuY29kZXhfYXBwX19zZW5kX21lc3NhZ2VfdG9fdGhyZWFkKHtcXFxcbiAgdGhyZWFkSWQ6IFxcXCIke3RhcmdldFRocmVhZElkfVxcXCIsXFxcXG4gIGhvc3RJZDogXFxcImxvY2FsXFxcIixcXFxcbiAgcHJvbXB0OiBcXFwiZm9vXFxcIlxcXFxufSk7YCxcblx0XHRcdFx0XHRpbnRlcm5hbF9jaGF0X21lc3NhZ2VfbWV0YWRhdGFfcGFzc3Rocm91Z2g6IHsgdHVybl9pZDogJ3R1cm4tc2VuZCcgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdyZXNwb25zZV9pdGVtJyxcblx0XHRcdFx0cGF5bG9hZDoge1xuXHRcdFx0XHRcdHR5cGU6ICdjdXN0b21fdG9vbF9jYWxsX291dHB1dCcsXG5cdFx0XHRcdFx0Y2FsbF9pZDogJ3NlbmQtY2FsbCcsXG5cdFx0XHRcdFx0b3V0cHV0OiBKU09OLnN0cmluZ2lmeSh7IHRocmVhZElkOiB0YXJnZXRUaHJlYWRJZCB9KSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdyZXNwb25zZV9pdGVtJyxcblx0XHRcdFx0cGF5bG9hZDoge1xuXHRcdFx0XHRcdHR5cGU6ICdjdXN0b21fdG9vbF9jYWxsJyxcblx0XHRcdFx0XHRjYWxsX2lkOiAnd29ya3RyZWUtY2FsbCcsXG5cdFx0XHRcdFx0bmFtZTogJ2V4ZWMnLFxuXHRcdFx0XHRcdGlucHV0OiAnY29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbHMuY29kZXhfYXBwX19jcmVhdGVfdGhyZWFkKHsgcHJvbXB0OiBcXFwiU2V0IHVwIHRoZSB3b3JrdHJlZVxcXCIsIHRpdGxlOiBcXFwiV29ya3RyZWUgc2V0dXBcXFwiIH0pOycsXG5cdFx0XHRcdFx0aW50ZXJuYWxfY2hhdF9tZXNzYWdlX21ldGFkYXRhX3Bhc3N0aHJvdWdoOiB7IHR1cm5faWQ6ICd0dXJuLXdvcmt0cmVlJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ3Jlc3BvbnNlX2l0ZW0nLFxuXHRcdFx0XHRwYXlsb2FkOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2N1c3RvbV90b29sX2NhbGxfb3V0cHV0Jyxcblx0XHRcdFx0XHRjYWxsX2lkOiAnd29ya3RyZWUtY2FsbCcsXG5cdFx0XHRcdFx0b3V0cHV0OiBKU09OLnN0cmluZ2lmeSh7IGNsaWVudFRocmVhZElkLCBob3N0SWQ6ICdsb2NhbCcgfSksXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdF07XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKHJlY29yZHMubWFwKHJlY29yZCA9PiBKU09OLnN0cmluZ2lmeShyZWNvcmQpKS5qb2luKCdcXG4nKSkpO1xuXG5cdFx0Y29uc3QgbWV0YWRhdGEgPSBhd2FpdCByZWFkQ29kZXhSb2xsb3V0TWV0YWRhdGEoZmlsZVNlcnZpY2UsIHJlc291cmNlLmZzUGF0aCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5tZXRhZGF0YS50aHJlYWRDb29yZGluYXRpb25CeVR1cm5JZF0ubWFwKChbdHVybklkLCBjYWxsc10pID0+ICh7XG5cdFx0XHR0dXJuSWQsXG5cdFx0XHRjYWxsczogY2FsbHMubWFwKGNhbGwgPT4gKHtcblx0XHRcdFx0dG9vbE5hbWU6IGNhbGwudG9vbE5hbWUsXG5cdFx0XHRcdHRhcmdldFRocmVhZElkOiBjYWxsLnRhcmdldFRocmVhZElkLFxuXHRcdFx0XHRvcGVuTGluazogY2FsbC5vcGVuTGluayxcblx0XHRcdFx0dG9vbElucHV0OiBjYWxsLnRvb2xJbnB1dCxcblx0XHRcdH0pKSxcblx0XHR9KSksIFt7XG5cdFx0XHR0dXJuSWQ6ICd0dXJuLWNyZWF0ZScsXG5cdFx0XHRjYWxsczogW3tcblx0XHRcdFx0dG9vbE5hbWU6IFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5DcmVhdGVTZXNzaW9uLFxuXHRcdFx0XHR0YXJnZXRUaHJlYWRJZCxcblx0XHRcdFx0b3Blbkxpbms6IGBhZ2VudC1ob3N0LXNlc3Npb246Ly9jb2RleC8ke3RhcmdldFRocmVhZElkfWAsXG5cdFx0XHRcdHRvb2xJbnB1dDogeyBwcm9tcHQ6ICdSZW1lbWJlciBjYXB5YmFyYScgfSxcblx0XHRcdH1dLFxuXHRcdH0sIHtcblx0XHRcdHR1cm5JZDogJ3R1cm4tc2VuZCcsXG5cdFx0XHRjYWxsczogW3tcblx0XHRcdFx0dG9vbE5hbWU6IFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5TZW5kTWVzc2FnZSxcblx0XHRcdFx0dGFyZ2V0VGhyZWFkSWQsXG5cdFx0XHRcdG9wZW5MaW5rOiBgYWdlbnQtaG9zdC1zZXNzaW9uOi8vY29kZXgvJHt0YXJnZXRUaHJlYWRJZH1gLFxuXHRcdFx0XHR0b29sSW5wdXQ6IHsgcHJvbXB0OiAnZm9vJyB9LFxuXHRcdFx0fV0sXG5cdFx0fSwge1xuXHRcdFx0dHVybklkOiAndHVybi13b3JrdHJlZScsXG5cdFx0XHRjYWxsczogW3tcblx0XHRcdFx0dG9vbE5hbWU6IFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5DcmVhdGVTZXNzaW9uLFxuXHRcdFx0XHR0YXJnZXRUaHJlYWRJZDogY2xpZW50VGhyZWFkSWQsXG5cdFx0XHRcdG9wZW5MaW5rOiBgYWdlbnQtaG9zdC1zZXNzaW9uOi8vY29kZXgvJHtjbGllbnRUaHJlYWRJZH1gLFxuXHRcdFx0XHR0b29sSW5wdXQ6IHsgcHJvbXB0OiAnV29ya3RyZWUgc2V0dXAnIH0sXG5cdFx0XHR9XSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZXMgaW5jb21wbGV0ZSBhbmQgbm9uLWxvY2FsIHRocmVhZC1tYW5hZ2VtZW50IGNhbGxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3REaXNwb3NhYmxlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY3JlYXRlRmlsZVNlcnZpY2UodGVzdERpc3Bvc2FibGVzKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvcm9sbG91dC5qc29ubCcpO1xuXHRcdGNvbnN0IHJlY29yZHMgPSBbXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdyZXNwb25zZV9pdGVtJyxcblx0XHRcdFx0cGF5bG9hZDoge1xuXHRcdFx0XHRcdHR5cGU6ICdjdXN0b21fdG9vbF9jYWxsJyxcblx0XHRcdFx0XHRjYWxsX2lkOiAncmVtb3RlLWNhbGwnLFxuXHRcdFx0XHRcdG5hbWU6ICdleGVjJyxcblx0XHRcdFx0XHRpbnB1dDogJ2NvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2xzLmNvZGV4X2FwcF9fc2VuZF9tZXNzYWdlX3RvX3RocmVhZCh7IHRocmVhZElkOiBcXFwicmVtb3RlLXRocmVhZFxcXCIsIGhvc3RJZDogXFxcInNzaFxcXCIsIHByb21wdDogXFxcImZvb1xcXCIgfSk7Jyxcblx0XHRcdFx0XHRpbnRlcm5hbF9jaGF0X21lc3NhZ2VfbWV0YWRhdGFfcGFzc3Rocm91Z2g6IHsgdHVybl9pZDogJ3R1cm4tcmVtb3RlJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ3Jlc3BvbnNlX2l0ZW0nLFxuXHRcdFx0XHRwYXlsb2FkOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2N1c3RvbV90b29sX2NhbGxfb3V0cHV0Jyxcblx0XHRcdFx0XHRjYWxsX2lkOiAncmVtb3RlLWNhbGwnLFxuXHRcdFx0XHRcdG91dHB1dDogW3sgdHlwZTogJ2lucHV0X3RleHQnLCB0ZXh0OiBKU09OLnN0cmluZ2lmeSh7IHRocmVhZElkOiAncmVtb3RlLXRocmVhZCcgfSkgfV0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAncmVzcG9uc2VfaXRlbScsXG5cdFx0XHRcdHBheWxvYWQ6IHtcblx0XHRcdFx0XHR0eXBlOiAnY3VzdG9tX3Rvb2xfY2FsbCcsXG5cdFx0XHRcdFx0Y2FsbF9pZDogJ3VuZmluaXNoZWQtY2FsbCcsXG5cdFx0XHRcdFx0bmFtZTogJ2V4ZWMnLFxuXHRcdFx0XHRcdGlucHV0OiAnY29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbHMuY29kZXhfYXBwX19jcmVhdGVfdGhyZWFkKHsgcHJvbXB0OiBcXFwidW5maW5pc2hlZFxcXCIgfSk7Jyxcblx0XHRcdFx0XHRpbnRlcm5hbF9jaGF0X21lc3NhZ2VfbWV0YWRhdGFfcGFzc3Rocm91Z2g6IHsgdHVybl9pZDogJ3R1cm4tdW5maW5pc2hlZCcgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcocmVjb3Jkcy5tYXAocmVjb3JkID0+IEpTT04uc3RyaW5naWZ5KHJlY29yZCkpLmpvaW4oJ1xcbicpKSk7XG5cblx0XHRjb25zdCBtZXRhZGF0YSA9IGF3YWl0IHJlYWRDb2RleFJvbGxvdXRNZXRhZGF0YShmaWxlU2VydmljZSwgcmVzb3VyY2UuZnNQYXRoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLm1ldGFkYXRhLnRocmVhZENvb3JkaW5hdGlvbkJ5VHVybklkXSwgW10pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQ0FBZ0M7QUFFekMsTUFBTSx3QkFBd0IsTUFBTTtBQUNuQyxRQUFNLGNBQWMsd0NBQXdDO0FBRTVELFdBQVMsa0JBQWtCLGlCQUErQztBQUN6RSxVQUFNLGNBQWMsZ0JBQWdCLElBQUksSUFBSSxZQUFZLElBQUksZUFBZSxDQUFDLENBQUM7QUFDN0Usb0JBQWdCLElBQUksWUFBWSxpQkFBaUIsUUFBUSxNQUFNLGdCQUFnQixJQUFJLElBQUksMkJBQTJCLENBQUMsQ0FBQyxDQUFDO0FBQ3JILFdBQU87QUFBQSxFQUNSO0FBRUEsT0FBSyxxRkFBcUYsWUFBWTtBQUNyRyxVQUFNLGtCQUFrQixZQUFZLElBQUksSUFBSSxnQkFBZ0IsQ0FBQztBQUM3RCxVQUFNLGNBQWMsa0JBQWtCLGVBQWU7QUFDckQsVUFBTSxXQUFXLElBQUksS0FBSyxnQkFBZ0I7QUFDMUMsVUFBTSxpQkFBaUI7QUFDdkIsVUFBTSxpQkFBaUI7QUFDdkIsVUFBTSxVQUFVO0FBQUEsTUFDZjtBQUFBLFFBQ0MsTUFBTTtBQUFBLFFBQ04sU0FBUztBQUFBLFVBQ1IsTUFBTTtBQUFBLFVBQ04sU0FBUztBQUFBLFVBQ1QsTUFBTTtBQUFBLFVBQ04sT0FBTztBQUFBLFVBQ1AsNENBQTRDLEVBQUUsU0FBUyxjQUFjO0FBQUEsUUFDdEU7QUFBQSxNQUNEO0FBQUEsTUFDQTtBQUFBLFFBQ0MsTUFBTTtB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
