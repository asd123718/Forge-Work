import assert from "assert";
import { Emitter } from "../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { AgentHostClientByokLmChannel, createAgentHostClientByokLmConnection } from "../../common/agentHostClientByokLmChannel.js";
suite("agentHostClientByokLmChannel", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function handlerOf(chat, listModels = async () => [], onDidChangeModels) {
    return { _serviceBrand: void 0, chat: (request) => chat(request), listModels: () => listModels(), onDidChangeModels };
  }
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  function bridge(handler) {
    const server = new AgentHostClientByokLmChannel(handler, new NullLogService());
    const channel = {
      call(command, arg) {
        return server.call(null, command, arg);
      },
      listen(event) {
        return (listener, thisArgs, disposables) => server.listen(null, event)(listener, thisArgs, disposables);
      }
    };
    return createAgentHostClientByokLmConnection(channel);
  }
  test("round-trips a Responses request to the handler and back", async () => {
    let seen;
    const connection = bridge(handlerOf(async (request2) => {
      seen = request2;
      return {
        responseId: "resp_1",
        output: [
          { type: "reasoning", id: "rs_1", summary: ["thinking"], encryptedContent: "opaque" },
          { type: "message", content: [{ type: "text", text: "pong" }] },
          { type: "function_call", callId: "c1", name: "noop", argumentsJson: "{}" }
        ]
      };
    }));
    const request = {
      vendor: "acme",
      modelId: "m",
      previousResponseId: "resp_0",
      input: [
        { type: "reasoning", id: "rs_0", summary: ["previous"], encryptedContent: "previous-opaque" },
        { type: "message", role: "user", content: [{ type: "text", text: "ping" }] }
      ]
    };
    const result = await connection.chat(request);
    assert.deepStrictEqual(seen, request);
    assert.deepStrictEqual(result, {
      responseId: "resp_1",
      output: [
        { type: "reasoning", id: "rs_1", summary: ["thinking"], encryptedContent: "opaque" },
        { type: "message", content: [{ type: "text", text: "pong" }] },
        { type: "function_call", callId: "c1", name: "noop", argumentsJson: "{}" }
      ]
    });
  });
  test("forwards a bridge error result unchanged", async () => {
    const connection = bridge(handlerOf(async () => ({ output: [], error: "no model" })));
    const result = await connection.chat({ vendor: "v", modelId: "m", input: [] });
    assert.strictEqual(result.error, "no model");
  });
  test("pushes the current model snapshot on subscribe and re-pushes on change", async () => {
    const onDidChange = store.add(new Emitter());
    let models = [{ vendor: "acme", id: "claude", name: "Acme Claude", maxContextWindowTokens: 128e3 }];
    const connection = bridge(handlerOf(async () => ({ output: [] }), async () => models, onDidChange.event));
    const pushed = [];
    const sub = connection.onDidChangeModels((snapshot) => pushed.push(snapshot));
    await flush();
    models = [{ vendor: "acme", id: "gpt" }];
    onDidChange.fire();
    await flush();
    sub.dispose();
    assert.deepStrictEqual(pushed, [
      [{ vendor: "acme", id: "claude", name: "Acme Claude", maxContextWindowTokens: 128e3 }],
      [{ vendor: "acme", id: "gpt" }]
    ]);
  });
  test("coalesces a burst of changes so the final snapshot reflects the latest models", async () => {
    const onDidChange = store.add(new Emitter());
    let models = [{ vendor: "acme", id: "v1" }];
    const connection = bridge(handlerOf(async () => ({ output: [] }), async () => models, onDidChange.event));
    const pushed = [];
    const sub = connection.onDidChangeModels((snapshot) => pushed.push(snapshot));
    await flush();
    models = [{ vendor: "acme", id: "v2" }];
    onDidChange.fire();
    models = [{ vendor: "acme", id: "v3" }];
    onDidChange.fire();
    await flush();
    sub.dispose();
    assert.deepStrictEqual(pushed.at(-1), [{ vendor: "acme", id: "v3" }]);
  });
  test("rejects unknown channel commands", async () => {
    const server = new AgentHostClientByokLmChannel(handlerOf(async () => ({ output: [] })), new NullLogService());
    await assert.rejects(() => server.call(null, "frobnicate"), /Unknown command/);
  });
  test("exposes only the models event", () => {
    const server = new AgentHostClientByokLmChannel(handlerOf(async () => ({ output: [] })), new NullLogService());
    assert.throws(() => server.listen(null, "anything"), /No event/);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEhvc3RDbGllbnRCeW9rTG1DaGFubmVsLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB0eXBlIHsgSUNoYW5uZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9jb21tb24vaXBjLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgdHlwZSB7IElBZ2VudEhvc3RCeW9rTG1IYW5kbGVyLCBJQnlva0xtQ2hhdFJlcXVlc3QsIElCeW9rTG1DaGF0UmVzdWx0LCBJQnlva0xtTW9kZWxJbmZvIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdEJ5b2tMbS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDbGllbnRCeW9rTG1DaGFubmVsLCBjcmVhdGVBZ2VudEhvc3RDbGllbnRCeW9rTG1Db25uZWN0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdENsaWVudEJ5b2tMbUNoYW5uZWwuanMnO1xuXG5zdWl0ZSgnYWdlbnRIb3N0Q2xpZW50Qnlva0xtQ2hhbm5lbCcsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGhhbmRsZXJPZihcblx0XHRjaGF0OiAocmVxdWVzdDogSUJ5b2tMbUNoYXRSZXF1ZXN0KSA9PiBQcm9taXNlPElCeW9rTG1DaGF0UmVzdWx0Pixcblx0XHRsaXN0TW9kZWxzOiAoKSA9PiBQcm9taXNlPElCeW9rTG1Nb2RlbEluZm9bXT4gPSBhc3luYyAoKSA9PiBbXSxcblx0XHRvbkRpZENoYW5nZU1vZGVscz86IEV2ZW50PHZvaWQ+LFxuXHQpOiBJQWdlbnRIb3N0Qnlva0xtSGFuZGxlciB7XG5cdFx0cmV0dXJuIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCBjaGF0OiAocmVxdWVzdCkgPT4gY2hhdChyZXF1ZXN0KSwgbGlzdE1vZGVsczogKCkgPT4gbGlzdE1vZGVscygpLCBvbkRpZENoYW5nZU1vZGVscyB9O1xuXHR9XG5cblx0LyoqIFJlc29sdmVzIG9uY2UgdGhlIGNoYW5uZWwncyBhc3luYyBzbmFwc2hvdCBwdWJsaXNoIGhhcyBzZXR0bGVkLiAqL1xuXHRjb25zdCBmbHVzaCA9ICgpID0+IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAwKSk7XG5cblx0LyoqXG5cdCAqIFdpcmUgdGhlIG5vZGUtc2lkZSBjb25uZWN0aW9uIHN0cmFpZ2h0IHRvIHRoZSByZW5kZXJlciBzZXJ2ZXIgY2hhbm5lbCxcblx0ICogc3RhbmRpbmcgaW4gZm9yIHRoZSBNZXNzYWdlUG9ydCB0cmFuc3BvcnQgc28gdGhlIGZ1bGwgcmVxdWVzdCBcdTIxOTIgaGFuZGxlciBcdTIxOTJcblx0ICogcmVzcG9uc2Ugcm91bmQtdHJpcCBjYW4gYmUgZXhlcmNpc2VkIHdpdGhvdXQgdGhlIHJlbmRlcmVyIG9yIHRoZSBTREsuXG5cdCAqL1xuXHRmdW5jdGlvbiBicmlkZ2UoaGFuZGxlcjogSUFnZW50SG9zdEJ5b2tMbUhhbmRsZXIpIHtcblx0XHRjb25zdCBzZXJ2ZXIgPSBuZXcgQWdlbnRIb3N0Q2xpZW50Qnlva0xtQ2hhbm5lbChoYW5kbGVyLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0Y29uc3QgY2hhbm5lbDogSUNoYW5uZWwgPSB7XG5cdFx0XHRjYWxsPFQ+KGNvbW1hbmQ6IHN0cmluZywgYXJnPzogdW5rbm93bik6IFByb21pc2U8VD4ge1xuXHRcdFx0XHRyZXR1cm4gc2VydmVyLmNhbGw8VD4obnVsbCwgY29tbWFuZCwgYXJnKTtcblx0XHRcdH0sXG5cdFx0XHRsaXN0ZW48VD4oZXZlbnQ6IHN0cmluZyk6IEV2ZW50PFQ+IHtcblx0XHRcdFx0Ly8gTWlycm9yIENoYW5uZWxDbGllbnQubGlzdGVuOiBkZWZlciB0byB0aGUgc2VydmVyIGNoYW5uZWwgb25seSB3aGVuXG5cdFx0XHRcdC8vIHRoZSByZXR1cm5lZCBldmVudCBpcyBhY3R1YWxseSBzdWJzY3JpYmVkIChsYXp5KSwgc28gYSBjb25uZWN0aW9uXG5cdFx0XHRcdC8vIHRoYXQgbmV2ZXIgbGlzdGVucyBhbGxvY2F0ZXMgbm90aGluZy5cblx0XHRcdFx0cmV0dXJuIChsaXN0ZW5lciwgdGhpc0FyZ3M/LCBkaXNwb3NhYmxlcz8pID0+IHNlcnZlci5saXN0ZW48VD4obnVsbCwgZXZlbnQpKGxpc3RlbmVyLCB0aGlzQXJncywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fSxcblx0XHR9O1xuXHRcdHJldHVybiBjcmVhdGVBZ2VudEhvc3RDbGllbnRCeW9rTG1Db25uZWN0aW9uKGNoYW5uZWwpO1xuXHR9XG5cblx0dGVzdCgncm91bmQtdHJpcHMgYSBSZXNwb25zZXMgcmVxdWVzdCB0byB0aGUgaGFuZGxlciBhbmQgYmFjaycsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgc2VlbjogSUJ5b2tMbUNoYXRSZXF1ZXN0IHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBicmlkZ2UoaGFuZGxlck9mKGFzeW5jIChyZXF1ZXN0KSA9PiB7XG5cdFx0XHRzZWVuID0gcmVxdWVzdDtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHJlc3BvbnNlSWQ6ICdyZXNwXzEnLFxuXHRcdFx0XHRvdXRwdXQ6IFtcblx0XHRcdFx0XHR7IHR5cGU6ICdyZWFzb25pbmcnLCBpZDogJ3JzXzEnLCBzdW1tYXJ5OiBbJ3RoaW5raW5nJ10sIGVuY3J5cHRlZENvbnRlbnQ6ICdvcGFxdWUnIH0sXG5cdFx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ3BvbmcnIH1dIH0sXG5cdFx0XHRcdFx0eyB0eXBlOiAnZnVuY3Rpb25fY2FsbCcsIGNhbGxJZDogJ2MxJywgbmFtZTogJ25vb3AnLCBhcmd1bWVudHNKc29uOiAne30nIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9O1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHJlcXVlc3Q6IElCeW9rTG1DaGF0UmVxdWVzdCA9IHtcblx0XHRcdHZlbmRvcjogJ2FjbWUnLFxuXHRcdFx0bW9kZWxJZDogJ20nLFxuXHRcdFx0cHJldmlvdXNSZXNwb25zZUlkOiAncmVzcF8wJyxcblx0XHRcdGlucHV0OiBbXG5cdFx0XHRcdHsgdHlwZTogJ3JlYXNvbmluZycsIGlkOiAncnNfMCcsIHN1bW1hcnk6IFsncHJldmlvdXMnXSwgZW5jcnlwdGVkQ29udGVudDogJ3ByZXZpb3VzLW9wYXF1ZScgfSxcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIHJvbGU6ICd1c2VyJywgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAncGluZycgfV0gfSxcblx0XHRcdF0sXG5cdFx0fTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNoYXQocmVxdWVzdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlZW4sIHJlcXVlc3QpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRyZXNwb25zZUlkOiAncmVzcF8xJyxcblx0XHRcdG91dHB1dDogW1xuXHRcdFx0XHR7IHR5cGU6ICdyZWFzb25pbmcnLCBpZDogJ3JzXzEnLCBzdW1tYXJ5OiBbJ3RoaW5raW5nJ10sIGVuY3J5cHRlZENvbnRlbnQ6ICdvcGFxdWUnIH0sXG5cdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdwb25nJyB9XSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdmdW5jdGlvbl9jYWxsJywgY2FsbElkOiAnYzEnLCBuYW1lOiAnbm9vcCcsIGFyZ3VtZW50c0pzb246ICd7fScgfSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvcndhcmRzIGEgYnJpZGdlIGVycm9yIHJlc3VsdCB1bmNoYW5nZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGJyaWRnZShoYW5kbGVyT2YoYXN5bmMgKCkgPT4gKHsgb3V0cHV0OiBbXSwgZXJyb3I6ICdubyBtb2RlbCcgfSkpKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNoYXQoeyB2ZW5kb3I6ICd2JywgbW9kZWxJZDogJ20nLCBpbnB1dDogW10gfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lcnJvciwgJ25vIG1vZGVsJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3B1c2hlcyB0aGUgY3VycmVudCBtb2RlbCBzbmFwc2hvdCBvbiBzdWJzY3JpYmUgYW5kIHJlLXB1c2hlcyBvbiBjaGFuZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2UgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0bGV0IG1vZGVsczogSUJ5b2tMbU1vZGVsSW5mb1tdID0gW3sgdmVuZG9yOiAnYWNtZScsIGlkOiAnY2xhdWRlJywgbmFtZTogJ0FjbWUgQ2xhdWRlJywgbWF4Q29udGV4dFdpbmRvd1Rva2VuczogMTI4MDAwIH1dO1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBicmlkZ2UoaGFuZGxlck9mKGFzeW5jICgpID0+ICh7IG91dHB1dDogW10gfSksIGFzeW5jICgpID0+IG1vZGVscywgb25EaWRDaGFuZ2UuZXZlbnQpKTtcblxuXHRcdGNvbnN0IHB1c2hlZDogSUJ5b2tMbU1vZGVsSW5mb1tdW10gPSBbXTtcblx0XHRjb25zdCBzdWIgPSBjb25uZWN0aW9uLm9uRGlkQ2hhbmdlTW9kZWxzKHNuYXBzaG90ID0+IHB1c2hlZC5wdXNoKHNuYXBzaG90KSk7XG5cdFx0YXdhaXQgZmx1c2goKTtcblxuXHRcdC8vIEEgY2hhbmdlIG9uIHRoZSBoYW5kbGVyIHRyaWdnZXJzIGEgZnJlc2ggc25hcHNob3QgcHVzaC5cblx0XHRtb2RlbHMgPSBbeyB2ZW5kb3I6ICdhY21lJywgaWQ6ICdncHQnIH1dO1xuXHRcdG9uRGlkQ2hhbmdlLmZpcmUoKTtcblx0XHRhd2FpdCBmbHVzaCgpO1xuXG5cdFx0c3ViLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHB1c2hlZCwgW1xuXHRcdFx0W3sgdmVuZG9yOiAnYWNtZScsIGlkOiAnY2xhdWRlJywgbmFtZTogJ0FjbWUgQ2xhdWRlJywgbWF4Q29udGV4dFdpbmRvd1Rva2VuczogMTI4MDAwIH1dLFxuXHRcdFx0W3sgdmVuZG9yOiAnYWNtZScsIGlkOiAnZ3B0JyB9XSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnY29hbGVzY2VzIGEgYnVyc3Qgb2YgY2hhbmdlcyBzbyB0aGUgZmluYWwgc25hcHNob3QgcmVmbGVjdHMgdGhlIGxhdGVzdCBtb2RlbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2UgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0bGV0IG1vZGVsczogSUJ5b2tMbU1vZGVsSW5mb1tdID0gW3sgdmVuZG9yOiAnYWNtZScsIGlkOiAndjEnIH1dO1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBicmlkZ2UoaGFuZGxlck9mKGFzeW5jICgpID0+ICh7IG91dHB1dDogW10gfSksIGFzeW5jICgpID0+IG1vZGVscywgb25EaWRDaGFuZ2UuZXZlbnQpKTtcblxuXHRcdGNvbnN0IHB1c2hlZDogSUJ5b2tMbU1vZGVsSW5mb1tdW10gPSBbXTtcblx0XHRjb25zdCBzdWIgPSBjb25uZWN0aW9uLm9uRGlkQ2hhbmdlTW9kZWxzKHNuYXBzaG90ID0+IHB1c2hlZC5wdXNoKHNuYXBzaG90KSk7XG5cdFx0YXdhaXQgZmx1c2goKTtcblxuXHRcdC8vIEEgcmFwaWQgYnVyc3Q6IHNldmVyYWwgY2hhbmdlcyBmaXJlIGJlZm9yZSBhbnkgZW51bWVyYXRpb24gc2V0dGxlcy4gVGhlXG5cdFx0Ly8gdGhyb3R0bGVyIHNlcmlhbGl6ZXMgdGhlbSwgc28gdGhlIGxhc3Qgc25hcHNob3QgbXVzdCByZWZsZWN0IHRoZSBsYXRlc3Rcblx0XHQvLyBtb2RlbHMgcmF0aGVyIHRoYW4gYSBzdGFsZSBlbnVtZXJhdGlvbiBmaW5pc2hpbmcgb3V0IG9mIG9yZGVyLlxuXHRcdG1vZGVscyA9IFt7IHZlbmRvcjogJ2FjbWUnLCBpZDogJ3YyJyB9XTtcblx0XHRvbkRpZENoYW5nZS5maXJlKCk7XG5cdFx0bW9kZWxzID0gW3sgdmVuZG9yOiAnYWNtZScsIGlkOiAndjMnIH1dO1xuXHRcdG9uRGlkQ2hhbmdlLmZpcmUoKTtcblx0XHRhd2FpdCBmbHVzaCgpO1xuXG5cdFx0c3ViLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHB1c2hlZC5hdCgtMSksIFt7IHZlbmRvcjogJ2FjbWUnLCBpZDogJ3YzJyB9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgdW5rbm93biBjaGFubmVsIGNvbW1hbmRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZlciA9IG5ldyBBZ2VudEhvc3RDbGllbnRCeW9rTG1DaGFubmVsKGhhbmRsZXJPZihhc3luYyAoKSA9PiAoeyBvdXRwdXQ6IFtdIH0pKSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHNlcnZlci5jYWxsKG51bGwsICdmcm9ibmljYXRlJyksIC9Vbmtub3duIGNvbW1hbmQvKTtcblx0fSk7XG5cblx0dGVzdCgnZXhwb3NlcyBvbmx5IHRoZSBtb2RlbHMgZXZlbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmVyID0gbmV3IEFnZW50SG9zdENsaWVudEJ5b2tMbUNoYW5uZWwoaGFuZGxlck9mKGFzeW5jICgpID0+ICh7IG91dHB1dDogW10gfSkpLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBzZXJ2ZXIubGlzdGVuKG51bGwsICdhbnl0aGluZycpLCAvTm8gZXZlbnQvKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGVBQXNCO0FBRS9CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsOEJBQThCLDZDQUE2QztBQUVwRixNQUFNLGdDQUFnQyxNQUFNO0FBRTNDLFFBQU0sUUFBUSx3Q0FBd0M7QUFFdEQsV0FBUyxVQUNSLE1BQ0EsYUFBZ0QsWUFBWSxDQUFDLEdBQzdELG1CQUMwQjtBQUMxQixXQUFPLEVBQUUsZUFBZSxRQUFXLE1BQU0sQ0FBQyxZQUFZLEtBQUssT0FBTyxHQUFHLFlBQVksTUFBTSxXQUFXLEdBQUcsa0JBQWtCO0FBQUEsRUFDeEg7QUFHQSxR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QkFBa0IsY0FBWSxPQUFPLEtBQUssUUFBUSxDQUFDO0FBQzFFLFVBQU0sTUFBTTtBQUdaLGFBQVMsQ0FBQyxFQUFFLFFBQVEsUUFBUSxJQUFJLE1BQU0sQ0FBQztBQUN2QyxnQkFBWSxLQUFLO0FBQ2pCLFVBQU0sTUFBTTtBQUVaLFFBQUksUUFBUTtBQUNaLFdBQU8sZ0JBQWdCLFFBQVE7QUFBQSxNQUM5QixDQUFDLEVBQUUsUUFBUSxRQUFRLElBQUksVUFBVSxNQUFNLGVBQWUsd0JBQXdCLE1BQU8sQ0FBQztBQUFBLE1BQ3RGLENBQUMsRUFBRSxRQUFRLFFBQVEsSUFBSSxNQUFNLENBQUM7QUFBQSxJQUMvQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxpRkFBaUYsWUFBWTtBQUNqRyxVQUFNLGNBQWMsTUFBTSxJQUFJLElBQUksUUFBYyxDQUFDO0FBQ2pELFFBQUksU0FBNkIsQ0FBQyxFQUFFLFFBQVEsUUFBUSxJQUFJLEtBQUssQ0FBQztBQUM5RCxVQUFNLGFBQWEsT0FBTyxVQUFVLGFBQWEsRUFBRSxRQUFRLENBQUMsRUFBRSxJQUFJLFlBQVksUUFBUSxZQUFZLEtBQUssQ0FBQztBQUV4RyxVQUFNLFNBQStCLENBQUM7QUFDdEMsVUFBTSxNQUFNLFdBQVcsa0JBQWtCLGNBQVksT0FBTyxLQUFLLFFBQVEsQ0FBQztBQUMxRSxVQUFNLE1BQU07QUFLWixhQUFTLENBQUMsRUFBRSxRQUFRLFFBQVEsSUFBSSxLQUFLLENBQUM7QUFDdEMsZ0JBQVksS0FBSztBQUNqQixhQUFTLENBQUMsRUFBRSxRQUFRLFFBQVEsSUFBSSxLQUFLLENBQUM7QUFDdEMsZ0JBQVksS0FBSztBQUNqQixVQUFNLE1BQU07QUFFWixRQUFJLFFBQVE7QUFDWixXQUFPLGdCQUFnQixPQUFPLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxRQUFRLFFBQVEsSUFBSSxLQUFLLENBQUMsQ0FBQztBQUFBLEVBQ3JFLENBQUM7QUFFRCxPQUFLLG9DQUFvQyxZQUFZO0FBQ3BELFVBQU0sU0FBUyxJQUFJLDZCQUE2QixVQUFVLGFBQWEsRUFBRSxRQUFRLENBQUMsRUFBRSxFQUFFLEdBQUcsSUFBSSxlQUFlLENBQUM7QUFDN0csVUFBTSxPQUFPLFFBQVEsTUFBTSxPQUFPLEtBQUssTUFBTSxZQUFZLEdBQUcsaUJBQWlCO0FBQUEsRUFDOUUsQ0FBQztBQUVELE9BQUssaUNBQWlDLE1BQU07QUFDM0MsVUFBTSxTQUFTLElBQUksNkJBQTZCLFVBQVUsYUFBYSxFQUFFLFFBQVEsQ0FBQyxFQUFFLEVBQUUsR0FBRyxJQUFJLGVBQWUsQ0FBQztBQUM3RyxXQUFPLE9BQU8sTUFBTSxPQUFPLE9BQU8sTUFBTSxVQUFVLEdBQUcsVUFBVTtBQUFBLEVBQ2hFLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogWyJyZXF1ZXN0Il0KfQo=
