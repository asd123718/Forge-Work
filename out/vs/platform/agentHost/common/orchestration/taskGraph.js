const PLAN_FENCE = /```(?:json)?\s*([\s\S]*?)```/i;
function readyTaskIds(tasks, completed, blocked = /* @__PURE__ */ new Set()) {
  const ids = new Set(tasks.map((task) => task.id));
  return tasks.filter((task) => {
    if (completed.has(task.id) || blocked.has(task.id)) {
      return false;
    }
    return task.dependsOn.every((dep) => !ids.has(dep) || completed.has(dep));
  }).map((task) => task.id);
}
function parseOrchestrationPlan(raw, depth = 0) {
  if (depth > 3) {
    return void 0;
  }
  const fenced = PLAN_FENCE.exec(raw)?.[1]?.trim();
  const candidates = [fenced, extractJsonObject(raw), raw.trim()].filter((value) => !!value);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed.text === "string" && parsed.text !== candidate) {
        const nested = parseOrchestrationPlan(parsed.text, depth + 1);
        if (nested) {
          return nested;
        }
      }
      const plan = normalizePlan(parsed);
      if (plan.tasks.length > 0) {
        return plan;
      }
    } catch {
      continue;
    }
  }
  return void 0;
}
function fallbackOrchestrationPlan(goal, workerIds) {
  const first = workerIds[0] ?? "deepseek-harness";
  const second = workerIds[1] ?? workerIds[0] ?? "grok-build";
  return {
    summary: "Split the request into two parallel worker tasks.",
    contract: [
      "Stay inside the workspace.",
      "Do not rewrite unrelated files.",
      "Prefer small, reviewable patches.",
      "Run the cheapest relevant test if one exists.",
      "Return a short summary, changed files, test result, and risks. No transcript."
    ].join("\n"),
    tasks: [
      {
        id: "discover",
        title: "Map the change and shared interfaces",
        prompt: `Inspect the repository and prepare the shared contract for this request. Do not implement the full feature. Request:
${goal}`,
        files: [],
        dependsOn: [],
        workerHint: first
      },
      {
        id: "implement",
        title: "Implement the requested change",
        prompt: `Implement the user request with the smallest correct patch. Request:
${goal}`,
        files: [],
        dependsOn: [],
        workerHint: second
      }
    ]
  };
}
function normalizePlan(value) {
  const tasksRaw = Array.isArray(value.tasks) ? value.tasks : [];
  const tasks = [];
  const seen = /* @__PURE__ */ new Set();
  for (let index = 0; index < tasksRaw.length; index++) {
    const entry = tasksRaw[index];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const raw = entry;
    const id = typeof raw.id === "string" && raw.id.trim() !== "" ? raw.id.trim() : `task-${index + 1}`;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const files = Array.isArray(raw.files) ? raw.files.filter((file) => typeof file === "string" && file.trim() !== "").map((file) => file.trim()) : [];
    const dependsOn = Array.isArray(raw.dependsOn) ? raw.dependsOn.filter((dep) => typeof dep === "string" && dep.trim() !== "").map((dep) => dep.trim()) : [];
    tasks.push({
      id,
      title: typeof raw.title === "string" && raw.title.trim() !== "" ? raw.title.trim() : id,
      prompt: typeof raw.prompt === "string" && raw.prompt.trim() !== "" ? raw.prompt.trim() : typeof raw.title === "string" ? raw.title : id,
      files,
      dependsOn: dependsOn.filter((dep) => dep !== id),
      workerHint: typeof raw.workerHint === "string" ? raw.workerHint.trim() : typeof raw.worker === "string" ? raw.worker.trim() : void 0,
      acceptance: typeof raw.acceptance === "string" ? raw.acceptance.trim() : void 0,
      testCommand: typeof raw.testCommand === "string" ? raw.testCommand.trim() : void 0
    });
  }
  return {
    summary: typeof value.summary === "string" ? value.summary.trim() : "",
    contract: typeof value.contract === "string" ? value.contract.trim() : "",
    tasks
  };
}
function extractJsonObject(raw) {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return void 0;
  }
  return raw.slice(start, end + 1);
}
export {
  fallbackOrchestrationPlan,
  normalizePlan,
  parseOrchestrationPlan,
  readyTaskIds
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxjb21tb25cXG9yY2hlc3RyYXRpb25cXHRhc2tHcmFwaC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxyXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cclxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXHJcblxyXG5pbXBvcnQgdHlwZSB7IElPcmNoZXN0cmF0aW9uUGxhbiwgSU9yY2hlc3RyYXRpb25UYXNrU3BlYyB9IGZyb20gJy4vb3JjaGVzdHJhdGlvblR5cGVzLmpzJztcclxuXHJcbmNvbnN0IFBMQU5fRkVOQ0UgPSAvYGBgKD86anNvbik/XFxzKihbXFxzXFxTXSo/KWBgYC9pO1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHJlYWR5VGFza0lkcyh0YXNrczogcmVhZG9ubHkgSU9yY2hlc3RyYXRpb25UYXNrU3BlY1tdLCBjb21wbGV0ZWQ6IFJlYWRvbmx5U2V0PHN0cmluZz4sIGJsb2NrZWQ6IFJlYWRvbmx5U2V0PHN0cmluZz4gPSBuZXcgU2V0KCkpOiBzdHJpbmdbXSB7XHJcblx0Y29uc3QgaWRzID0gbmV3IFNldCh0YXNrcy5tYXAodGFzayA9PiB0YXNrLmlkKSk7XHJcblx0cmV0dXJuIHRhc2tzXHJcblx0XHQuZmlsdGVyKHRhc2sgPT4ge1xyXG5cdFx0XHRpZiAoY29tcGxldGVkLmhhcyh0YXNrLmlkKSB8fCBibG9ja2VkLmhhcyh0YXNrLmlkKSkge1xyXG5cdFx0XHRcdHJldHVybiBmYWxzZTtcclxuXHRcdFx0fVxyXG5cdFx0XHRyZXR1cm4gdGFzay5kZXBlbmRzT24uZXZlcnkoZGVwID0+ICFpZHMuaGFzKGRlcCkgfHwgY29tcGxldGVkLmhhcyhkZXApKTtcclxuXHRcdH0pXHJcblx0XHQubWFwKHRhc2sgPT4gdGFzay5pZCk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBwYXJzZU9yY2hlc3RyYXRpb25QbGFuKHJhdzogc3RyaW5nLCBkZXB0aCA9IDApOiBJT3JjaGVzdHJhdGlvblBsYW4gfCB1bmRlZmluZWQge1xyXG5cdGlmIChkZXB0aCA+IDMpIHtcclxuXHRcdHJldHVybiB1bmRlZmluZWQ7XHJcblx0fVxyXG5cdGNvbnN0IGZlbmNlZCA9IFBMQU5fRkVOQ0UuZXhlYyhyYXcpPy5bMV0/LnRyaW0oKTtcclxuXHRjb25zdCBjYW5kaWRhdGVzID0gW2ZlbmNlZCwgZXh0cmFjdEpzb25PYmplY3QocmF3KSwgcmF3LnRyaW0oKV0uZmlsdGVyKCh2YWx1ZSk6IHZhbHVlIGlzIHN0cmluZyA9PiAhIXZhbHVlKTtcclxuXHRmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBjYW5kaWRhdGVzKSB7XHJcblx0XHR0cnkge1xyXG5cdFx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKGNhbmRpZGF0ZSkgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XHJcblx0XHRcdGlmICh0eXBlb2YgcGFyc2VkLnRleHQgPT09ICdzdHJpbmcnICYmIHBhcnNlZC50ZXh0ICE9PSBjYW5kaWRhdGUpIHtcclxuXHRcdFx0XHRjb25zdCBuZXN0ZWQgPSBwYXJzZU9yY2hlc3RyYXRpb25QbGFuKHBhcnNlZC50ZXh0LCBkZXB0aCArIDEpO1xyXG5cdFx0XHRcdGlmIChuZXN0ZWQpIHtcclxuXHRcdFx0XHRcdHJldHVybiBuZXN0ZWQ7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9XHJcblx0XHRcdGNvbnN0IHBsYW4gPSBub3JtYWxpemVQbGFuKHBhcnNlZCk7XHJcblx0XHRcdGlmIChwbGFuLnRhc2tzLmxlbmd0aCA+IDApIHtcclxuXHRcdFx0XHRyZXR1cm4gcGxhbjtcclxuXHRcdFx0fVxyXG5cdFx0fSBjYXRjaCB7XHJcblx0XHRcdGNvbnRpbnVlO1xyXG5cdFx0fVxyXG5cdH1cclxuXHRyZXR1cm4gdW5kZWZpbmVkO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZmFsbGJhY2tPcmNoZXN0cmF0aW9uUGxhbihnb2FsOiBzdHJpbmcsIHdvcmtlcklkczogcmVhZG9ubHkgc3RyaW5nW10pOiBJT3JjaGVzdHJhdGlvblBsYW4ge1xyXG5cdGNvbnN0IGZpcnN0ID0gd29ya2VySWRzWzBdID8/ICdkZWVwc2Vlay1oYXJuZXNzJztcclxuXHRjb25zdCBzZWNvbmQgPSB3b3JrZXJJZHNbMV0gPz8gd29ya2VySWRzWzBdID8/ICdncm9rLWJ1aWxkJztcclxuXHRyZXR1cm4ge1xyXG5cdFx0c3VtbWFyeTogJ1NwbGl0IHRoZSByZXF1ZXN0IGludG8gdHdvIHBhcmFsbGVsIHdvcmtlciB0YXNrcy4nLFxyXG5cdFx0Y29udHJhY3Q6IFtcclxuXHRcdFx0J1N0YXkgaW5zaWRlIHRoZSB3b3Jrc3BhY2UuJyxcclxuXHRcdFx0J0RvIG5vdCByZXdyaXRlIHVucmVsYXRlZCBmaWxlcy4nLFxyXG5cdFx0XHQnUHJlZmVyIHNtYWxsLCByZXZpZXdhYmxlIHBhdGNoZXMuJyxcclxuXHRcdFx0J1J1biB0aGUgY2hlYXBlc3QgcmVsZXZhbnQgdGVzdCBpZiBvbmUgZXhpc3RzLicsXHJcblx0XHRcdCdSZXR1cm4gYSBzaG9ydCBzdW1tYXJ5LCBjaGFuZ2VkIGZpbGVzLCB0ZXN0IHJlc3VsdCwgYW5kIHJpc2tzLiBObyB0cmFuc2NyaXB0LicsXHJcblx0XHRdLmpvaW4oJ1xcbicpLFxyXG5cdFx0dGFza3M6IFtcclxuXHRcdFx0e1xyXG5cdFx0XHRcdGlkOiAnZGlzY292ZXInLFxyXG5cdFx0XHRcdHRpdGxlOiAnTWFwIHRoZSBjaGFuZ2UgYW5kIHNoYXJlZCBpbnRlcmZhY2VzJyxcclxuXHRcdFx0XHRwcm9tcHQ6IGBJbnNwZWN0IHRoZSByZXBvc2l0b3J5IGFuZCBwcmVwYXJlIHRoZSBzaGFyZWQgY29udHJhY3QgZm9yIHRoaXMgcmVxdWVzdC4gRG8gbm90IGltcGxlbWVudCB0aGUgZnVsbCBmZWF0dXJlLiBSZXF1ZXN0OlxcbiR7Z29hbH1gLFxyXG5cdFx0XHRcdGZpbGVzOiBbXSxcclxuXHRcdFx0XHRkZXBlbmRzT246IFtdLFxyXG5cdFx0XHRcdHdvcmtlckhpbnQ6IGZpcnN0LFxyXG5cdFx0XHR9LFxyXG5cdFx0XHR7XHJcblx0XHRcdFx0aWQ6ICdpbXBsZW1lbnQnLFxyXG5cdFx0XHRcdHRpdGxlOiAnSW1wbGVtZW50IHRoZSByZXF1ZXN0ZWQgY2hhbmdlJyxcclxuXHRcdFx0XHRwcm9tcHQ6IGBJbXBsZW1lbnQgdGhlIHVzZXIgcmVxdWVzdCB3aXRoIHRoZSBzbWFsbGVzdCBjb3JyZWN0IHBhdGNoLiBSZXF1ZXN0OlxcbiR7Z29hbH1gLFxyXG5cdFx0XHRcdGZpbGVzOiBbXSxcclxuXHRcdFx0XHRkZXBlbmRzT246IFtdLFxyXG5cdFx0XHRcdHdvcmtlckhpbnQ6IHNlY29uZCxcclxuXHRcdFx0fSxcclxuXHRcdF0sXHJcblx0fTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZVBsYW4odmFsdWU6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KTogSU9yY2hlc3RyYXRpb25QbGFuIHtcclxuXHRjb25zdCB0YXNrc1JhdyA9IEFycmF5LmlzQXJyYXkodmFsdWUudGFza3MpID8gdmFsdWUudGFza3MgOiBbXTtcclxuXHRjb25zdCB0YXNrczogSU9yY2hlc3RyYXRpb25UYXNrU3BlY1tdID0gW107XHJcblx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xyXG5cdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCB0YXNrc1Jhdy5sZW5ndGg7IGluZGV4KyspIHtcclxuXHRcdGNvbnN0IGVudHJ5ID0gdGFza3NSYXdbaW5kZXhdO1xyXG5cdFx0aWYgKCFlbnRyeSB8fCB0eXBlb2YgZW50cnkgIT09ICdvYmplY3QnIHx8IEFycmF5LmlzQXJyYXkoZW50cnkpKSB7XHJcblx0XHRcdGNvbnRpbnVlO1xyXG5cdFx0fVxyXG5cdFx0Y29uc3QgcmF3ID0gZW50cnkgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XHJcblx0XHRjb25zdCBpZCA9IHR5cGVvZiByYXcuaWQgPT09ICdzdHJpbmcnICYmIHJhdy5pZC50cmltKCkgIT09ICcnID8gcmF3LmlkLnRyaW0oKSA6IGB0YXNrLSR7aW5kZXggKyAxfWA7XHJcblx0XHRpZiAoc2Vlbi5oYXMoaWQpKSB7XHJcblx0XHRcdGNvbnRpbnVlO1xyXG5cdFx0fVxyXG5cdFx0c2Vlbi5hZGQoaWQpO1xyXG5cdFx0Y29uc3QgZmlsZXMgPSBBcnJheS5pc0FycmF5KHJhdy5maWxlcykgPyByYXcuZmlsZXMuZmlsdGVyKChmaWxlKTogZmlsZSBpcyBzdHJpbmcgPT4gdHlwZW9mIGZpbGUgPT09ICdzdHJpbmcnICYmIGZpbGUudHJpbSgpICE9PSAnJykubWFwKGZpbGUgPT4gZmlsZS50cmltKCkpIDogW107XHJcblx0XHRjb25zdCBkZXBlbmRzT24gPSBBcnJheS5pc0FycmF5KHJhdy5kZXBlbmRzT24pXHJcblx0XHRcdD8gcmF3LmRlcGVuZHNPbi5maWx0ZXIoKGRlcCk6IGRlcCBpcyBzdHJpbmcgPT4gdHlwZW9mIGRlcCA9PT0gJ3N0cmluZycgJiYgZGVwLnRyaW0oKSAhPT0gJycpLm1hcChkZXAgPT4gZGVwLnRyaW0oKSlcclxuXHRcdFx0OiBbXTtcclxuXHRcdHRhc2tzLnB1c2goe1xyXG5cdFx0XHRpZCxcclxuXHRcdFx0dGl0bGU6IHR5cGVvZiByYXcudGl0bGUgPT09ICdzdHJpbmcnICYmIHJhdy50aXRsZS50cmltKCkgIT09ICcnID8gcmF3LnRpdGxlLnRyaW0oKSA6IGlkLFxyXG5cdFx0XHRwcm9tcHQ6IHR5cGVvZiByYXcucHJvbXB0ID09PSAnc3RyaW5nJyAmJiByYXcucHJvbXB0LnRyaW0oKSAhPT0gJycgPyByYXcucHJvbXB0LnRyaW0oKSA6IHR5cGVvZiByYXcudGl0bGUgPT09ICdzdHJpbmcnID8gcmF3LnRpdGxlIDogaWQsXHJcblx0XHRcdGZpbGVzLFxyXG5cdFx0XHRkZXBlbmRzT246IGRlcGVuZHNPbi5maWx0ZXIoZGVwID0+IGRlcCAhPT0gaWQpLFxyXG5cdFx0XHR3b3JrZXJIaW50OiB0eXBlb2YgcmF3LndvcmtlckhpbnQgPT09ICdzdHJpbmcnID8gcmF3LndvcmtlckhpbnQudHJpbSgpIDogdHlwZW9mIHJhdy53b3JrZXIgPT09ICdzdHJpbmcnID8gcmF3Lndvcmtlci50cmltKCkgOiB1bmRlZmluZWQsXHJcblx0XHRcdGFjY2VwdGFuY2U6IHR5cGVvZiByYXcuYWNjZXB0YW5jZSA9PT0gJ3N0cmluZycgPyByYXcuYWNjZXB0YW5jZS50cmltKCkgOiB1bmRlZmluZWQsXHJcblx0XHRcdHRlc3RDb21tYW5kOiB0eXBlb2YgcmF3LnRlc3RDb21tYW5kID09PSAnc3RyaW5nJyA/IHJhdy50ZXN0Q29tbWFuZC50cmltKCkgOiB1bmRlZmluZWQsXHJcblx0XHR9KTtcclxuXHR9XHJcblx0cmV0dXJuIHtcclxuXHRcdHN1bW1hcnk6IHR5cGVvZiB2YWx1ZS5zdW1tYXJ5ID09PSAnc3RyaW5nJyA/IHZhbHVlLnN1bW1hcnkudHJpbSgpIDogJycsXHJcblx0XHRjb250cmFjdDogdHlwZW9mIHZhbHVlLmNvbnRyYWN0ID09PSAnc3RyaW5nJyA/IHZhbHVlLmNvbnRyYWN0LnRyaW0oKSA6ICcnLFxyXG5cdFx0dGFza3MsXHJcblx0fTtcclxufVxyXG5cclxuZnVuY3Rpb24gZXh0cmFjdEpzb25PYmplY3QocmF3OiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xyXG5cdGNvbnN0IHN0YXJ0ID0gcmF3LmluZGV4T2YoJ3snKTtcclxuXHRjb25zdCBlbmQgPSByYXcubGFzdEluZGV4T2YoJ30nKTtcclxuXHRpZiAoc3RhcnQgPCAwIHx8IGVuZCA8PSBzdGFydCkge1xyXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcclxuXHR9XHJcblx0cmV0dXJuIHJhdy5zbGljZShzdGFydCwgZW5kICsgMSk7XHJcbn1cclxuIl0sCiAgIm1hcHBpbmdzIjogIkFBT0EsTUFBTSxhQUFhO0FBRVosU0FBUyxhQUFhLE9BQTBDLFdBQWdDLFVBQStCLG9CQUFJLElBQUksR0FBYTtBQUMxSixRQUFNLE1BQU0sSUFBSSxJQUFJLE1BQU0sSUFBSSxVQUFRLEtBQUssRUFBRSxDQUFDO0FBQzlDLFNBQU8sTUFDTCxPQUFPLFVBQVE7QUFDZixRQUFJLFVBQVUsSUFBSSxLQUFLLEVBQUUsS0FBSyxRQUFRLElBQUksS0FBSyxFQUFFLEdBQUc7QUFDbkQsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPLEtBQUssVUFBVSxNQUFNLFNBQU8sQ0FBQyxJQUFJLElBQUksR0FBRyxLQUFLLFVBQVUsSUFBSSxHQUFHLENBQUM7QUFBQSxFQUN2RSxDQUFDLEVBQ0EsSUFBSSxVQUFRLEtBQUssRUFBRTtBQUN0QjtBQUVPLFNBQVMsdUJBQXVCLEtBQWEsUUFBUSxHQUFtQztBQUM5RixNQUFJLFFBQVEsR0FBRztBQUNkLFdBQU87QUFBQSxFQUNSO0FBQ0EsUUFBTSxTQUFTLFdBQVcsS0FBSyxHQUFHLElBQUksQ0FBQyxHQUFHLEtBQUs7QUFDL0MsUUFBTSxhQUFhLENBQUMsUUFBUSxrQkFBa0IsR0FBRyxHQUFHLElBQUksS0FBSyxDQUFDLEVBQUUsT0FBTyxDQUFDLFVBQTJCLENBQUMsQ0FBQyxLQUFLO0FBQzFHLGFBQVcsYUFBYSxZQUFZO0FBQ25DLFFBQUk7QUFDSCxZQUFNLFNBQVMsS0FBSyxNQUFNLFNBQVM7QUFDbkMsVUFBSSxPQUFPLE9BQU8sU0FBUyxZQUFZLE9BQU8sU0FBUyxXQUFXO0FBQ2pFLGNBQU0sU0FBUyx1QkFBdUIsT0FBTyxNQUFNLFFBQVEsQ0FBQztB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
