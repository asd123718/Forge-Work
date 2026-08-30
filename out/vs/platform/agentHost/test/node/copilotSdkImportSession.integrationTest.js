import assert from "assert";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { CopilotClient, approveAll } from "@github/copilot-sdk";
import { join } from "../../../../base/common/path.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { MessageKind, ResponsePartKind, TurnState } from "../../common/state/sessionState.js";
import { buildSessionEventLogFromTurns } from "../../node/copilot/buildSessionEvents.js";
import { createCopilotCliEnvironment } from "../../node/copilot/copilotCliEnvironment.js";
suite("Copilot SDK - imported sessions", function() {
  this.timeout(12e4);
  let client;
  let root;
  let workDirectory;
  suiteSetup(async function() {
    root = await mkdtemp(join(tmpdir(), "ahp-import-"));
    workDirectory = join(root, "work");
    await mkdir(workDirectory);
    client = new CopilotClient({
      mode: "empty",
      baseDirectory: root,
      useLoggedInUser: false,
      logLevel: "error",
      env: createCopilotCliEnvironment()
    });
    await client.start();
  });
  suiteTeardown(async function() {
    try {
      await client?.stop();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  test("bundled SDK resumes synthesized events as editable turns", async function() {
    const sessionId = generateUuid();
    const turns = [
      userTurn(generateUuid(), "What is 2+2?", "It is 4."),
      userTurn(generateUuid(), "And 3+3?", "It is 6.")
    ];
    const sessionDirectory = join(root, "session-state", sessionId);
    await mkdir(sessionDirectory, { recursive: true });
    await writeFile(
      join(sessionDirectory, "events.jsonl"),
      buildSessionEventLogFromTurns(turns, { sessionId, workingDirectory: workDirectory }),
      "utf8"
    );
    let session;
    try {
      session = await client.resumeSession(sessionId, {
        availableTools: [],
        onPermissionRequest: approveAll,
        workingDirectory: workDirectory
      });
      const events = await session.getEvents();
      const firstUser = events.find((event) => event.type === "user.message");
      assert.ok(firstUser);
      const truncate = await session.rpc.history.truncate({ eventId: firstUser.id });
      assert.deepStrictEqual({
        userMessages: events.filter((event) => event.type === "user.message").map((event) => event.data.content),
        eventsRemoved: truncate.eventsRemoved > 0
      }, {
        userMessages: ["What is 2+2?", "And 3+3?"],
        eventsRemoved: true
      });
    } finally {
      await session?.disconnect();
    }
  });
});
function userTurn(id, text, response) {
  const responseParts = response ? [{ kind: ResponsePartKind.Markdown, id: generateUuid(), content: response }] : [];
  return {
    id,
    message: { text, origin: { kind: MessageKind.User } },
    responseParts,
    usage: void 0,
    state: TurnState.Complete
  };
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjb3BpbG90U2RrSW1wb3J0U2Vzc2lvbi5pbnRlZ3JhdGlvblRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBta2RpciwgbWtkdGVtcCwgcm0sIHdyaXRlRmlsZSB9IGZyb20gJ2ZzL3Byb21pc2VzJztcbmltcG9ydCB7IHRtcGRpciB9IGZyb20gJ29zJztcbmltcG9ydCB7IENvcGlsb3RDbGllbnQsIGFwcHJvdmVBbGwsIHR5cGUgQ29waWxvdFNlc3Npb24sIHR5cGUgU2Vzc2lvbkV2ZW50IH0gZnJvbSAnQGdpdGh1Yi9jb3BpbG90LXNkayc7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IE1lc3NhZ2VLaW5kLCBSZXNwb25zZVBhcnRLaW5kLCBUdXJuU3RhdGUsIHR5cGUgUmVzcG9uc2VQYXJ0LCB0eXBlIFR1cm4gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IGJ1aWxkU2Vzc2lvbkV2ZW50TG9nRnJvbVR1cm5zIH0gZnJvbSAnLi4vLi4vbm9kZS9jb3BpbG90L2J1aWxkU2Vzc2lvbkV2ZW50cy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVDb3BpbG90Q2xpRW52aXJvbm1lbnQgfSBmcm9tICcuLi8uLi9ub2RlL2NvcGlsb3QvY29waWxvdENsaUVudmlyb25tZW50LmpzJztcblxuc3VpdGUoJ0NvcGlsb3QgU0RLIC0gaW1wb3J0ZWQgc2Vzc2lvbnMnLCBmdW5jdGlvbiAoKSB7XG5cblx0dGhpcy50aW1lb3V0KDEyMF8wMDApO1xuXG5cdGxldCBjbGllbnQ6IENvcGlsb3RDbGllbnQ7XG5cdGxldCByb290OiBzdHJpbmc7XG5cdGxldCB3b3JrRGlyZWN0b3J5OiBzdHJpbmc7XG5cblx0c3VpdGVTZXR1cChhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0cm9vdCA9IGF3YWl0IG1rZHRlbXAoam9pbih0bXBkaXIoKSwgJ2FocC1pbXBvcnQtJykpO1xuXHRcdHdvcmtEaXJlY3RvcnkgPSBqb2luKHJvb3QsICd3b3JrJyk7XG5cdFx0YXdhaXQgbWtkaXIod29ya0RpcmVjdG9yeSk7XG5cdFx0Y2xpZW50ID0gbmV3IENvcGlsb3RDbGllbnQoe1xuXHRcdFx0bW9kZTogJ2VtcHR5Jyxcblx0XHRcdGJhc2VEaXJlY3Rvcnk6IHJvb3QsXG5cdFx0XHR1c2VMb2dnZWRJblVzZXI6IGZhbHNlLFxuXHRcdFx0bG9nTGV2ZWw6ICdlcnJvcicsXG5cdFx0XHRlbnY6IGNyZWF0ZUNvcGlsb3RDbGlFbnZpcm9ubWVudCgpLFxuXHRcdH0pO1xuXHRcdGF3YWl0IGNsaWVudC5zdGFydCgpO1xuXHR9KTtcblxuXHRzdWl0ZVRlYXJkb3duKGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgY2xpZW50Py5zdG9wKCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IHJtKHJvb3QsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2J1bmRsZWQgU0RLIHJlc3VtZXMgc3ludGhlc2l6ZWQgZXZlbnRzIGFzIGVkaXRhYmxlIHR1cm5zJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IHR1cm5zOiBUdXJuW10gPSBbXG5cdFx0XHR1c2VyVHVybihnZW5lcmF0ZVV1aWQoKSwgJ1doYXQgaXMgMisyPycsICdJdCBpcyA0LicpLFxuXHRcdFx0dXNlclR1cm4oZ2VuZXJhdGVVdWlkKCksICdBbmQgMyszPycsICdJdCBpcyA2LicpLFxuXHRcdF07XG5cdFx0Y29uc3Qgc2Vzc2lvbkRpcmVjdG9yeSA9IGpvaW4ocm9vdCwgJ3Nlc3Npb24tc3RhdGUnLCBzZXNzaW9uSWQpO1xuXHRcdGF3YWl0IG1rZGlyKHNlc3Npb25EaXJlY3RvcnksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdGF3YWl0IHdyaXRlRmlsZShcblx0XHRcdGpvaW4oc2Vzc2lvbkRpcmVjdG9yeSwgJ2V2ZW50cy5qc29ubCcpLFxuXHRcdFx0YnVpbGRTZXNzaW9uRXZlbnRMb2dGcm9tVHVybnModHVybnMsIHsgc2Vzc2lvbklkLCB3b3JraW5nRGlyZWN0b3J5OiB3b3JrRGlyZWN0b3J5IH0pLFxuXHRcdFx0J3V0ZjgnLFxuXHRcdCk7XG5cblx0XHRsZXQgc2Vzc2lvbjogQ29waWxvdFNlc3Npb24gfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdHNlc3Npb24gPSBhd2FpdCBjbGllbnQucmVzdW1lU2Vzc2lvbihzZXNzaW9uSWQsIHtcblx0XHRcdFx0YXZhaWxhYmxlVG9vbHM6IFtdLFxuXHRcdFx0XHRvblBlcm1pc3Npb25SZXF1ZXN0OiBhcHByb3ZlQWxsLFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiB3b3JrRGlyZWN0b3J5LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBldmVudHM6IFNlc3Npb25FdmVudFtdID0gYXdhaXQgc2Vzc2lvbi5nZXRFdmVudHMoKTtcblx0XHRcdGNvbnN0IGZpcnN0VXNlciA9IGV2ZW50cy5maW5kKGV2ZW50ID0+IGV2ZW50LnR5cGUgPT09ICd1c2VyLm1lc3NhZ2UnKTtcblx0XHRcdGFzc2VydC5vayhmaXJzdFVzZXIpO1xuXHRcdFx0Y29uc3QgdHJ1bmNhdGUgPSBhd2FpdCBzZXNzaW9uLnJwYy5oaXN0b3J5LnRydW5jYXRlKHsgZXZlbnRJZDogZmlyc3RVc2VyLmlkIH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0dXNlck1lc3NhZ2VzOiBldmVudHMuZmlsdGVyKGV2ZW50ID0+IGV2ZW50LnR5cGUgPT09ICd1c2VyLm1lc3NhZ2UnKS5tYXAoZXZlbnQgPT4gZXZlbnQuZGF0YS5jb250ZW50KSxcblx0XHRcdFx0ZXZlbnRzUmVtb3ZlZDogdHJ1bmNhdGUuZXZlbnRzUmVtb3ZlZCA+IDAsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHVzZXJNZXNzYWdlczogWydXaGF0IGlzIDIrMj8nLCAnQW5kIDMrMz8nXSxcblx0XHRcdFx0ZXZlbnRzUmVtb3ZlZDogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBzZXNzaW9uPy5kaXNjb25uZWN0KCk7XG5cdFx0fVxuXHR9KTtcbn0pO1xuXG5mdW5jdGlvbiB1c2VyVHVybihpZDogc3RyaW5nLCB0ZXh0OiBzdHJpbmcsIHJlc3BvbnNlOiBzdHJpbmcpOiBUdXJuIHtcblx0Y29uc3QgcmVzcG9uc2VQYXJ0czogUmVzcG9uc2VQYXJ0W10gPSByZXNwb25zZVxuXHRcdD8gW3sga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgaWQ6IGdlbmVyYXRlVXVpZCgpLCBjb250ZW50OiByZXNwb25zZSB9XVxuXHRcdDogW107XG5cdHJldHVybiB7XG5cdFx0aWQsXG5cdFx0bWVzc2FnZTogeyB0ZXh0LCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0cmVzcG9uc2VQYXJ0cyxcblx0XHR1c2FnZTogdW5kZWZpbmVkLFxuXHRcdHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsXG5cdH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxPQUFPLFNBQVMsSUFBSSxpQkFBaUI7QUFDOUMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsZUFBZSxrQkFBMEQ7QUFDbEYsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsYUFBYSxrQkFBa0IsaUJBQStDO0FBQ3ZGLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsbUNBQW1DO0FBRTVDLE1BQU0sbUNBQW1DLFdBQVk7QUFFcEQsT0FBSyxRQUFRLElBQU87QUFFcEIsTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBRUosYUFBVyxpQkFBa0I7QUFDNUIsV0FBTyxNQUFNLFFBQVEsS0FBSyxPQUFPLEdBQUcsYUFBYSxDQUFDO0FBQ2xELG9CQUFnQixLQUFLLE1BQU0sTUFBTTtBQUNqQyxVQUFNLE1BQU0sYUFBYTtBQUN6QixhQUFTLElBQUksY0FBYztBQUFBLE1BQzFCLE1BQU07QUFBQSxNQUNOLGVBQWU7QUFBQSxNQUNmLGlCQUFpQjtBQUFBLE1BQ2pCLFVBQVU7QUFBQSxNQUNWLEtBQUssNEJBQTRCO0FBQUEsSUFDbEMsQ0FBQztBQUNELFVBQU0sT0FBTyxNQUFNO0FBQUEsRUFDcEIsQ0FBQztBQUVELGdCQUFjLGlCQUFrQjtBQUMvQixRQUFJO0FBQ0gsWUFBTSxRQUFRLEtBQUs7QUFBQSxJQUNwQixVQUFFO0FBQ0QsWUFBTSxHQUFHLE1BQU0sRUFBRSxXQUFXLE1BQU0sT0FBTyxLQUFLLENBQUM7QUFBQSxJQUNoRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssNERBQTRELGlCQUFrQjtBQUNsRixVQUFNLFlBQVksYUFBYTtBQUMvQixVQUFNLFFBQWdCO0FBQUEsTUFDckIsU0FBUyxhQUFhLEdBQUcsZ0JBQWdCLFVBQVU7QUFBQSxNQUNuRCxTQUFTLGFBQWEsR0FBRyxZQUFZLFVBQVU7QUFBQSxJQUNoRDtBQUNBLFVBQU0sbUJBQW1CLEtBQUssTUFBTSxpQkFBaUIsU0FBUztBQUM5RCxVQUFNLE1BQU0sa0JBQWtCLEVBQUUsV0FBVyxLQUFLLENBQUM7QUFDakQsVUFBTTtBQUFBLE1BQ0wsS0FBSyxrQkFBa0IsY0FBYztBQUFBLE1BQ3JDLDhCQUE4QixPQUFPLEVBQUUsV0FBVyxrQkFBa0IsY0FBYyxDQUFDO0FBQUEsTUFDbkY7QUFBQSxJQUNEO0FBRUEsUUFBSTtBQUNKLFFBQUk7QUFDSCxnQkFBVSxNQUFNLE9BQU8sY0FBYyxXQUFXO0FBQUEsUUFDL0MsZ0JBQWdCLENBQUM7QUFBQSxRQUNqQixxQkFBcUI7QUFBQSxRQUNyQixrQkFBa0I7QUFBQSxNQUNuQixDQUFDO0FBQ0QsWUFBTSxTQUF5QixNQUFNLFFBQVEsVUFBVTtBQUN2RCxZQUFNLFlBQVksT0FBTyxLQUFLLFdBQVMsTUFBTSxTQUFTLGNBQWM7QUFDcEUsYUFBTyxHQUFHLFNBQVM7QUFDbkIsWUFBTSxXQUFXLE1BQU0sUUFBUSxJQUFJLFFBQVEsU0FBUyxFQUFFLFNBQVMsVUFBVSxHQUFHLENBQUM7QUFFN0UsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QixjQUFjLE9BQU8sT0FBTyxXQUFTLE1BQU0sU0FBUyxjQUFjLEVBQUUsSUFBSSxXQUFTLE1BQU0sS0FBSyxPQUFPO0FBQUEsUUFDbkcsZUFBZSxTQUFTLGdCQUFnQjtBQUFBLE1BQ3pDLEdBQUc7QUFBQSxRQUNGLGNBQWMsQ0FBQyxnQkFBZ0IsVUFBVTtBQUFBLFFBQ3pDLGVBQWU7QUFBQSxNQUNoQixDQUFDO0FBQUEsSUFDRixVQUFFO0FBQ0QsWUFBTSxTQUFTLFdBQVc7QUFBQSxJQUMzQjtBQUFBLEVBQ0QsQ0FBQztBQUNGLENBQUM7QUFFRCxTQUFTLFNBQVMsSUFBWSxNQUFjLFVBQXdCO0FBQ25FLFFBQU0sZ0JBQWdDLFdBQ25DLENBQUMsRUFBRSxNQUFNLGlCQUFpQixVQUFVLElBQUksYUFBYSxHQUFHLFNBQVMsU0FBUyxDQUFDLElBQzNFLENBQUM7QUFDSixTQUFPO0FBQUEsSUFDTjtBQUFBLElBQ0EsU0FBUyxFQUFFLE1BQU0sUUFBUSxFQUFFLE1BQU0sWUFBWSxLQUFLLEVBQUU7QUFBQSxJQUNwRDtBQUFBLElBQ0EsT0FBTztBQUFBLElBQ1AsT0FBTyxVQUFVO0FBQUEsRUFDbEI7QUFDRDsiLAogICJuYW1lcyI6IFtdCn0K
