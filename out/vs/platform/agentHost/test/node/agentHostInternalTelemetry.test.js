import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { AgentHostInternalTelemetrySender } from "../../node/agentHostMicrosoftTelemetry.js";
class TestAppender {
  constructor() {
    this.events = [];
    this.flushCount = 0;
  }
  log(eventName, data) {
    this.events.push({ eventName, data });
  }
  async flush() {
    this.flushCount++;
  }
}
suite("AgentHostInternalTelemetrySender", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("creates and sends only for internal users with identity enrichment", () => {
    const appenders = [];
    const requestService = { _serviceBrand: void 0 };
    const commonProperties = { version: "1.130.0", "common.machineId": "machine-id" };
    const sender = disposables.add(new AgentHostInternalTelemetrySender({
      requestService,
      commonProperties,
      extensionVersion: "0.58.0",
      createAppender: (actualRequestService, actualCommonProperties, eventPrefix) => {
        assert.deepStrictEqual({
          actualRequestService,
          eventPrefix,
          commonProperties: {
            version: actualCommonProperties?.["version"],
            extensionName: actualCommonProperties?.["common.extname"],
            extensionVersion: actualCommonProperties?.["common.extversion"],
            vscodeMachineId: actualCommonProperties?.["common.vscodemachineid"],
            vscodeVersion: actualCommonProperties?.["common.vscodeversion"]
          }
        }, {
          actualRequestService: requestService,
          eventPrefix: "GitHub.copilot-chat",
          commonProperties: {
            version: "1.130.0",
            extensionName: "GitHub.copilot-chat",
            extensionVersion: "0.58.0",
            vscodeMachineId: "machine-id",
            vscodeVersion: "1.130.0"
          }
        });
        const appender = new TestAppender();
        appenders.push(appender);
        return appender;
      }
    }));
    sender.send("ignored");
    sender.setContext({ isInternal: false, trackingId: "external-tid", userName: "external", isVscodeTeamMember: false });
    sender.send("ignoredExternal");
    sender.setContext({ isInternal: true, trackingId: "internal-tid", userName: "octocat", isVscodeTeamMember: true });
    sender.send("engine.messages.length", { value: "property" }, { count: 3 });
    assert.deepStrictEqual(appenders.map((appender) => appender.events), [[{
      eventName: "engine.messages.length",
      data: {
        value: "property",
        "common.tid": "internal-tid",
        "common.userName": "octocat",
        count: 3,
        "common.isVscodeTeamMember": 1
      }
    }]]);
  });
  test("flushes and disables the appender when internal identity is cleared or changed", () => {
    const appenders = [];
    const sender = disposables.add(new AgentHostInternalTelemetrySender({
      createAppender: () => {
        const appender = new TestAppender();
        appenders.push(appender);
        return appender;
      }
    }));
    sender.setContext({ isInternal: true, trackingId: "tid-1", userName: "first", isVscodeTeamMember: false });
    sender.setContext(void 0);
    sender.send("ignoredAfterClear");
    sender.setContext({ isInternal: true, trackingId: "tid-2", userName: "second", isVscodeTeamMember: false });
    assert.deepStrictEqual({
      appenderCount: appenders.length,
      firstFlushCount: appenders[0].flushCount,
      firstEvents: appenders[0].events
    }, {
      appenderCount: 2,
      firstFlushCount: 1,
      firstEvents: []
    });
  });
  test("context-scoped events use the supplied identity without mutable sender state", () => {
    const appenders = [];
    const sender = disposables.add(new AgentHostInternalTelemetrySender({
      createAppender: () => {
        const appender = new TestAppender();
        appenders.push(appender);
        return appender;
      }
    }));
    sender.sendForContext({ isInternal: false, trackingId: "external", userName: "external", isVscodeTeamMember: false }, "ignored");
    sender.sendForContext(
      { isInternal: true, trackingId: "session-tid", userName: "session-user", isVscodeTeamMember: true },
      "model.message.added",
      { "common.tid": "payload-tid", "common.userName": "payload-user" },
      { "common.isVscodeTeamMember": 0 }
    );
    assert.deepStrictEqual(appenders.map((appender) => appender.events), [[{
      eventName: "model.message.added",
      data: {
        "common.tid": "session-tid",
        "common.userName": "session-user",
        "common.isVscodeTeamMember": 1
      }
    }]]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEhvc3RJbnRlcm5hbFRlbGVtZXRyeS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgdHlwZSB7IElSZXF1ZXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QuanMnO1xuaW1wb3J0IHR5cGUgeyBJQ29tbW9uUHJvcGVydGllcyB9IGZyb20gJy4uLy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEludGVybmFsVGVsZW1ldHJ5U2VuZGVyIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RNaWNyb3NvZnRUZWxlbWV0cnkuanMnO1xuXG5jbGFzcyBUZXN0QXBwZW5kZXIge1xuXHRyZWFkb25seSBldmVudHM6IHsgZXZlbnROYW1lOiBzdHJpbmc7IGRhdGE6IG9iamVjdCB8IHVuZGVmaW5lZCB9W10gPSBbXTtcblx0Zmx1c2hDb3VudCA9IDA7XG5cblx0bG9nKGV2ZW50TmFtZTogc3RyaW5nLCBkYXRhPzogb2JqZWN0KTogdm9pZCB7XG5cdFx0dGhpcy5ldmVudHMucHVzaCh7IGV2ZW50TmFtZSwgZGF0YSB9KTtcblx0fVxuXHRhc3luYyBmbHVzaCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmZsdXNoQ291bnQrKztcblx0fVxufVxuXG5zdWl0ZSgnQWdlbnRIb3N0SW50ZXJuYWxUZWxlbWV0cnlTZW5kZXInLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnY3JlYXRlcyBhbmQgc2VuZHMgb25seSBmb3IgaW50ZXJuYWwgdXNlcnMgd2l0aCBpZGVudGl0eSBlbnJpY2htZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IGFwcGVuZGVyczogVGVzdEFwcGVuZGVyW10gPSBbXTtcblx0XHRjb25zdCByZXF1ZXN0U2VydmljZSA9IHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0gYXMgSVJlcXVlc3RTZXJ2aWNlO1xuXHRcdGNvbnN0IGNvbW1vblByb3BlcnRpZXMgPSB7IHZlcnNpb246ICcxLjEzMC4wJywgJ2NvbW1vbi5tYWNoaW5lSWQnOiAnbWFjaGluZS1pZCcgfSBhcyBJQ29tbW9uUHJvcGVydGllcztcblx0XHRjb25zdCBzZW5kZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdEludGVybmFsVGVsZW1ldHJ5U2VuZGVyKHtcblx0XHRcdHJlcXVlc3RTZXJ2aWNlLCBjb21tb25Qcm9wZXJ0aWVzLCBleHRlbnNpb25WZXJzaW9uOiAnMC41OC4wJywgY3JlYXRlQXBwZW5kZXI6IChhY3R1YWxSZXF1ZXN0U2VydmljZSwgYWN0dWFsQ29tbW9uUHJvcGVydGllcywgZXZlbnRQcmVmaXgpID0+IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdFx0YWN0dWFsUmVxdWVzdFNlcnZpY2UsXG5cdFx0XHRcdFx0ZXZlbnRQcmVmaXgsXG5cdFx0XHRcdFx0Y29tbW9uUHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0dmVyc2lvbjogYWN0dWFsQ29tbW9uUHJvcGVydGllcz8uWyd2ZXJzaW9uJ10sXG5cdFx0XHRcdFx0XHRleHRlbnNpb25OYW1lOiBhY3R1YWxDb21tb25Qcm9wZXJ0aWVzPy5bJ2NvbW1vbi5leHRuYW1lJ10sXG5cdFx0XHRcdFx0XHRleHRlbnNpb25WZXJzaW9uOiBhY3R1YWxDb21tb25Qcm9wZXJ0aWVzPy5bJ2NvbW1vbi5leHR2ZXJzaW9uJ10sXG5cdFx0XHRcdFx0XHR2c2NvZGVNYWNoaW5lSWQ6IGFjdHVhbENvbW1vblByb3BlcnRpZXM/LlsnY29tbW9uLnZzY29kZW1hY2hpbmVpZCddLFxuXHRcdFx0XHRcdFx0dnNjb2RlVmVyc2lvbjogYWN0dWFsQ29tbW9uUHJvcGVydGllcz8uWydjb21tb24udnNjb2RldmVyc2lvbiddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRhY3R1YWxSZXF1ZXN0U2VydmljZTogcmVxdWVzdFNlcnZpY2UsXG5cdFx0XHRcdFx0ZXZlbnRQcmVmaXg6ICdHaXRIdWIuY29waWxvdC1jaGF0Jyxcblx0XHRcdFx0XHRjb21tb25Qcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHR2ZXJzaW9uOiAnMS4xMzAuMCcsXG5cdFx0XHRcdFx0XHRleHRlbnNpb25OYW1lOiAnR2l0SHViLmNvcGlsb3QtY2hhdCcsXG5cdFx0XHRcdFx0XHRleHRlbnNpb25WZXJzaW9uOiAnMC41OC4wJyxcblx0XHRcdFx0XHRcdHZzY29kZU1hY2hpbmVJZDogJ21hY2hpbmUtaWQnLFxuXHRcdFx0XHRcdFx0dnNjb2RlVmVyc2lvbjogJzEuMTMwLjAnLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjb25zdCBhcHBlbmRlciA9IG5ldyBUZXN0QXBwZW5kZXIoKTtcblx0XHRcdFx0YXBwZW5kZXJzLnB1c2goYXBwZW5kZXIpO1xuXHRcdFx0XHRyZXR1cm4gYXBwZW5kZXI7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0c2VuZGVyLnNlbmQoJ2lnbm9yZWQnKTtcblx0XHRzZW5kZXIuc2V0Q29udGV4dCh7IGlzSW50ZXJuYWw6IGZhbHNlLCB0cmFja2luZ0lkOiAnZXh0ZXJuYWwtdGlkJywgdXNlck5hbWU6ICdleHRlcm5hbCcsIGlzVnNjb2RlVGVhbU1lbWJlcjogZmFsc2UgfSk7XG5cdFx0c2VuZGVyLnNlbmQoJ2lnbm9yZWRFeHRlcm5hbCcpO1xuXHRcdHNlbmRlci5zZXRDb250ZXh0KHsgaXNJbnRlcm5hbDogdHJ1ZSwgdHJhY2tpbmdJZDogJ2ludGVybmFsLXRpZCcsIHVzZXJOYW1lOiAnb2N0b2NhdCcsIGlzVnNjb2RlVGVhbU1lbWJlcjogdHJ1ZSB9KTtcblx0XHRzZW5kZXIuc2VuZCgnZW5naW5lLm1lc3NhZ2VzLmxlbmd0aCcsIHsgdmFsdWU6ICdwcm9wZXJ0eScgfSwgeyBjb3VudDogMyB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXBwZW5kZXJzLm1hcChhcHBlbmRlciA9PiBhcHBlbmRlci5ldmVudHMpLCBbW3tcblx0XHRcdGV2ZW50TmFtZTogJ2VuZ2luZS5tZXNzYWdlcy5sZW5ndGgnLFxuXHRcdFx0ZGF0YToge1xuXHRcdFx0XHR2YWx1ZTogJ3Byb3BlcnR5Jyxcblx0XHRcdFx0J2NvbW1vbi50aWQnOiAnaW50ZXJuYWwtdGlkJyxcblx0XHRcdFx0J2NvbW1vbi51c2VyTmFtZSc6ICdvY3RvY2F0Jyxcblx0XHRcdFx0Y291bnQ6IDMsXG5cdFx0XHRcdCdjb21tb24uaXNWc2NvZGVUZWFtTWVtYmVyJzogMSxcblx0XHRcdH0sXG5cdFx0fV1dKTtcblx0fSk7XG5cblx0dGVzdCgnZmx1c2hlcyBhbmQgZGlzYWJsZXMgdGhlIGFwcGVuZGVyIHdoZW4gaW50ZXJuYWwgaWRlbnRpdHkgaXMgY2xlYXJlZCBvciBjaGFuZ2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFwcGVuZGVyczogVGVzdEFwcGVuZGVyW10gPSBbXTtcblx0XHRjb25zdCBzZW5kZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdEludGVybmFsVGVsZW1ldHJ5U2VuZGVyKHtcblx0XHRcdGNyZWF0ZUFwcGVuZGVyOiAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGFwcGVuZGVyID0gbmV3IFRlc3RBcHBlbmRlcigpO1xuXHRcdFx0XHRhcHBlbmRlcnMucHVzaChhcHBlbmRlcik7XG5cdFx0XHRcdHJldHVybiBhcHBlbmRlcjtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRzZW5kZXIuc2V0Q29udGV4dCh7IGlzSW50ZXJuYWw6IHRydWUsIHRyYWNraW5nSWQ6ICd0aWQtMScsIHVzZXJOYW1lOiAnZmlyc3QnLCBpc1ZzY29kZVRlYW1NZW1iZXI6IGZhbHNlIH0pO1xuXHRcdHNlbmRlci5zZXRDb250ZXh0KHVuZGVmaW5lZCk7XG5cdFx0c2VuZGVyLnNlbmQoJ2lnbm9yZWRBZnRlckNsZWFyJyk7XG5cdFx0c2VuZGVyLnNldENvbnRleHQoeyBpc0ludGVybmFsOiB0cnVlLCB0cmFja2luZ0lkOiAndGlkLTInLCB1c2VyTmFtZTogJ3NlY29uZCcsIGlzVnNjb2RlVGVhbU1lbWJlcjogZmFsc2UgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFwcGVuZGVyQ291bnQ6IGFwcGVuZGVycy5sZW5ndGgsXG5cdFx0XHRmaXJzdEZsdXNoQ291bnQ6IGFwcGVuZGVyc1swXS5mbHVzaENvdW50LFxuXHRcdFx0Zmlyc3RFdmVudHM6IGFwcGVuZGVyc1swXS5ldmVudHMsXG5cdFx0fSwge1xuXHRcdFx0YXBwZW5kZXJDb3VudDogMixcblx0XHRcdGZpcnN0Rmx1c2hDb3VudDogMSxcblx0XHRcdGZpcnN0RXZlbnRzOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29udGV4dC1zY29wZWQgZXZlbnRzIHVzZSB0aGUgc3VwcGxpZWQgaWRlbnRpdHkgd2l0aG91dCBtdXRhYmxlIHNlbmRlciBzdGF0ZScsICgpID0+IHtcblx0XHRjb25zdCBhcHBlbmRlcnM6IFRlc3RBcHBlbmRlcltdID0gW107XG5cdFx0Y29uc3Qgc2VuZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RJbnRlcm5hbFRlbGVtZXRyeVNlbmRlcih7XG5cdFx0XHRjcmVhdGVBcHBlbmRlcjogKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBhcHBlbmRlciA9IG5ldyBUZXN0QXBwZW5kZXIoKTtcblx0XHRcdFx0YXBwZW5kZXJzLnB1c2goYXBwZW5kZXIpO1xuXHRcdFx0XHRyZXR1cm4gYXBwZW5kZXI7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0c2VuZGVyLnNlbmRGb3JDb250ZXh0KHsgaXNJbnRlcm5hbDogZmFsc2UsIHRyYWNraW5nSWQ6ICdleHRlcm5hbCcsIHVzZXJOYW1lOiAnZXh0ZXJuYWwnLCBpc1ZzY29kZVRlYW1NZW1iZXI6IGZhbHNlIH0sICdpZ25vcmVkJyk7XG5cdFx0c2VuZGVyLnNlbmRGb3JDb250ZXh0KFxuXHRcdFx0eyBpc0ludGVybmFsOiB0cnVlLCB0cmFja2luZ0lkOiAnc2Vzc2lvbi10aWQnLCB1c2VyTmFtZTogJ3Nlc3Npb24tdXNlcicsIGlzVnNjb2RlVGVhbU1lbWJlcjogdHJ1ZSB9LFxuXHRcdFx0J21vZGVsLm1lc3NhZ2UuYWRkZWQnLFxuXHRcdFx0eyAnY29tbW9uLnRpZCc6ICdwYXlsb2FkLXRpZCcsICdjb21tb24udXNlck5hbWUnOiAncGF5bG9hZC11c2VyJyB9LFxuXHRcdFx0eyAnY29tbW9uLmlzVnNjb2RlVGVhbU1lbWJlcic6IDAgfSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcHBlbmRlcnMubWFwKGFwcGVuZGVyID0+IGFwcGVuZGVyLmV2ZW50cyksIFtbe1xuXHRcdFx0ZXZlbnROYW1lOiAnbW9kZWwubWVzc2FnZS5hZGRlZCcsXG5cdFx0XHRkYXRhOiB7XG5cdFx0XHRcdCdjb21tb24udGlkJzogJ3Nlc3Npb24tdGlkJyxcblx0XHRcdFx0J2NvbW1vbi51c2VyTmFtZSc6ICdzZXNzaW9uLXVzZXInLFxuXHRcdFx0XHQnY29tbW9uLmlzVnNjb2RlVGVhbU1lbWJlcic6IDEsXG5cdFx0XHR9LFxuXHRcdH1dXSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFHeEQsU0FBUyx3Q0FBd0M7QUFFakQsTUFBTSxhQUFhO0FBQUEsRUFBbkI7QUFDQyxTQUFTLFNBQTRELENBQUM7QUFDdEUsc0JBQWE7QUFBQTtBQUFBLEVBRWIsSUFBSSxXQUFtQixNQUFxQjtBQUMzQyxTQUFLLE9BQU8sS0FBSyxFQUFFLFdBQVcsS0FBSyxDQUFDO0FBQUEsRUFDckM7QUFBQSxFQUNBLE1BQU0sUUFBdUI7QUFDNUIsU0FBSztBQUFBLEVBQ047QUFDRDtBQUVBLE1BQU0sb0NBQW9DLE1BQU07QUFDL0MsUUFBTSxjQUFjLHdDQUF3QztBQUU1RCxPQUFLLHNFQUFzRSxNQUFNO0FBQ2hGLFVBQU0sWUFBNEIsQ0FBQztBQUNuQyxVQUFNLGlCQUFpQixFQUFFLGVBQWUsT0FBVTtBQUNsRCxVQUFNLG1CQUFtQixFQUFFLFNBQVMsV0FBVyxvQkFBb0IsYUFBYTtBQUNoRixVQUFNLFNBQVMsWUFBWSxJQUFJLElBQUksaUNBQWlDO0FBQUEsTUFDbkU7QUFBQSxNQUFnQjtBQUFBLE1BQWtCLGtCQUFrQjtBQUFBLE1BQVUsZ0JBQWdCLENBQUMsc0JBQXNCLHdCQUF3QixnQkFBZ0I7QUFDNUksZUFBTyxnQkFBZ0I7QUFBQSxVQUN0QjtBQUFBLFVBQ0E7QUFBQSxVQUNBLGtCQUFrQjtBQUFBLFlBQ2pCLFNBQVMseUJBQXlCLFNBQVM7QUFBQSxZQUMzQyxlQUFlLHlCQUF5QixnQkFBZ0I7QUFBQSxZQUN4RCxr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
