import { disposableTimeout } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { McpError } from "./mcpTypes.js";
import { MCP } from "./modelContextProtocol.js";
class McpTaskManager extends Disposable {
  constructor() {
    super(...arguments);
    this._serverTasks = this._register(new DisposableMap());
    this._clientTasks = this._register(new DisposableMap());
    this._onDidUpdateTask = this._register(new Emitter());
    this.onDidUpdateTask = this._onDidUpdateTask.event;
  }
  /**
   * Attach a new handler to this task manager.
   * Updates all client tasks to use the new handler.
   */
  setHandler(handler) {
    for (const task of this._clientTasks.values()) {
      task.setHandler(handler);
    }
  }
  /**
   * Get a client task by ID for status notification handling.
   */
  getClientTask(taskId) {
    return this._clientTasks.get(taskId);
  }
  /**
   * Track a new client task.
   */
  adoptClientTask(task) {
    this._clientTasks.set(task.id, task);
  }
  /**
   * Untracks a client task.
   */
  abandonClientTask(taskId) {
    this._clientTasks.deleteAndDispose(taskId);
  }
  /**
   * Create a new task and execute it asynchronously.
   * Returns the task immediately while execution continues in the background.
   */
  createTask(ttl, executor) {
    const taskId = generateUuid();
    const createdAt = (/* @__PURE__ */ new Date()).toISOString();
    const createdAtTime = Date.now();
    const task = {
      taskId,
      status: "working",
      createdAt,
      ttl,
      lastUpdatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      pollInterval: 1e3
      // Suggest 1 second polling interval
    };
    const store = new DisposableStore();
    const cts = new CancellationTokenSource();
    store.add(toDisposable(() => cts.dispose(true)));
    const executionPromise = this._executeTask(taskId, executor, cts.token);
    if (ttl) {
      store.add(disposableTimeout(() => this._serverTasks.deleteAndDispose(taskId), ttl));
    } else {
      executionPromise.finally(() => {
        const timeout = this._register(disposableTimeout(() => {
          this._serverTasks.deleteAndDispose(taskId);
          this._store.delete(timeout);
        }, 6e4));
      });
    }
    this._serverTasks.set(taskId, {
      task,
      cts,
      dispose: () => store.dispose(),
      createdAtTime,
      executionPromise
    });
    return { task };
  }
  /**
   * Execute a task asynchronously and update its state.
   */
  async _executeTask(taskId, executor, token) {
    try {
      const result = await executor(token);
      this._updateTaskStatus(taskId, "completed", void 0, result);
    } catch (error) {
      if (error instanceof CancellationError) {
        this._updateTaskStatus(taskId, "cancelled", "Task was cancelled by the client");
      } else if (error instanceof McpError) {
        this._updateTaskStatus(taskId, "failed", error.message, void 0, {
          code: error.code,
          message: error.message,
          data: error.data
        });
      } else if (error instanceof Error) {
        this._updateTaskStatus(taskId, "failed", error.message, void 0, {
          code: MCP.INTERNAL_ERROR,
          message: error.message
        });
      } else {
        this._updateTaskStatus(taskId, "failed", "Unknown error", void 0, {
          code: MCP.INTERNAL_ERROR,
          message: "Unknown error"
        });
      }
    }
  }
  /**
   * Update task status and optionally store result or error.
   */
  _updateTaskStatus(taskId, status, statusMessage, result, error) {
    const entry = this._serverTasks.get(taskId);
    if (!entry) {
      return;
    }
    entry.task.status = status;
    entry.task.lastUpdatedAt = (/* @__PURE__ */ new Date()).toISOString();
    if (statusMessage !== void 0) {
      entry.task.statusMessage = statusMessage;
    }
    if (result !== void 0) {
      entry.result = result;
    }
    if (error !== void 0) {
      entry.error = error;
    }
    this._onDidUpdateTask.fire({ ...entry.task });
  }
  /**
   * Get the current state of a task.
   * Returns an error if the task doesn't exist or has expired.
   */
  getTask(taskId) {
    const entry = this._serverTasks.get(taskId);
    if (!entry) {
      throw new McpError(MCP.INVALID_PARAMS, `Task not found: ${taskId}`);
    }
    return { ...entry.task };
  }
  /**
   * Get the result of a completed task.
   * Blocks until the task completes if it's still in progress.
   */
  async getTaskResult(taskId) {
    const entry = this._serverTasks.get(taskId);
    if (!entry) {
      throw new McpError(MCP.INVALID_PARAMS, `Task not found: ${taskId}`);
    }
    if (entry.task.status === "working" || entry.task.status === "input_required") {
      await entry.executionPromise;
    }
    const updatedEntry = this._serverTasks.get(taskId);
    if (!updatedEntry) {
      throw new McpError(MCP.INVALID_PARAMS, `Task not found: ${taskId}`);
    }
    if (updatedEntry.error) {
      throw new McpError(updatedEntry.error.code, updatedEntry.error.message, updatedEntry.error.data);
    }
    if (!updatedEntry.result) {
      throw new McpError(MCP.INTERNAL_ERROR, "Task completed but no result available");
    }
    return updatedEntry.result;
  }
  /**
   * Cancel a task.
   */
  cancelTask(taskId) {
    const entry = this._serverTasks.get(taskId);
    if (!entry) {
      throw new McpError(MCP.INVALID_PARAMS, `Task not found: ${taskId}`);
    }
    if (entry.task.status === "completed" || entry.task.status === "failed" || entry.task.status === "cancelled") {
      throw new McpError(MCP.INVALID_PARAMS, `Cannot cancel task in ${entry.task.status} status`);
    }
    entry.task.status = "cancelled";
    entry.task.statusMessage = "Task was cancelled by the client";
    entry.cts.cancel();
    return { ...entry.task };
  }
  /**
   * List all tasks.
   */
  listTasks() {
    const tasks = [];
    for (const entry of this._serverTasks.values()) {
      tasks.push({ ...entry.task });
    }
    return { tasks };
  }
}
export {
  McpTaskManager
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcY29tbW9uXFxtY3BUYXNrTWFuYWdlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRpc3Bvc2FibGVUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgdHlwZSB7IE1jcFNlcnZlclJlcXVlc3RIYW5kbGVyIH0gZnJvbSAnLi9tY3BTZXJ2ZXJSZXF1ZXN0SGFuZGxlci5qcyc7XG5pbXBvcnQgeyBNY3BFcnJvciB9IGZyb20gJy4vbWNwVHlwZXMuanMnO1xuaW1wb3J0IHsgTUNQIH0gZnJvbSAnLi9tb2RlbENvbnRleHRQcm90b2NvbC5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1jcFRhc2tJbnRlcm5hbCBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0b25EaWRVcGRhdGVTdGF0ZSh0YXNrOiBNQ1AuVGFzayk6IHZvaWQ7XG5cdHNldEhhbmRsZXIoaGFuZGxlcjogTWNwU2VydmVyUmVxdWVzdEhhbmRsZXIgfCB1bmRlZmluZWQpOiB2b2lkO1xufVxuXG5pbnRlcmZhY2UgVGFza0VudHJ5IGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXHR0YXNrOiBNQ1AuVGFzaztcblx0cmVzdWx0PzogTUNQLlJlc3VsdDtcblx0ZXJyb3I/OiBNQ1AuRXJyb3I7XG5cdGN0czogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U7XG5cdC8qKiBUaW1lIHdoZW4gdGhlIHRhc2sgd2FzIGNyZWF0ZWQgKGNsaWVudCB0aW1lKSwgdXNlZCB0byBjYWxjdWxhdGUgVFRMIGV4cGlyYXRpb24gKi9cblx0Y3JlYXRlZEF0VGltZTogbnVtYmVyO1xuXHQvKiogUHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gdGhlIHRhc2sgZXhlY3V0aW9uIGNvbXBsZXRlcyAqL1xuXHRleGVjdXRpb25Qcm9taXNlOiBQcm9taXNlPHZvaWQ+O1xufVxuXG4vKipcbiAqIE1hbmFnZXMgaW4tbWVtb3J5IHRhc2sgc3RhdGUgZm9yIHNlcnZlci1zaWRlIE1DUCB0YXNrcyAoc2FtcGxpbmcgYW5kIGVsaWNpdGF0aW9uKS5cbiAqIEFsc28gdHJhY2tzIGNsaWVudC1zaWRlIHRhc2tzIHRvIHN1cnZpdmUgaGFuZGxlciByZWNvbm5lY3Rpb25zLlxuICogTGlmZWN5Y2xlIGlzIHRpZWQgdG8gdGhlIE1jcFNlcnZlciBpbnN0YW5jZS5cbiAqL1xuZXhwb3J0IGNsYXNzIE1jcFRhc2tNYW5hZ2VyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NlcnZlclRhc2tzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nLCBUYXNrRW50cnk+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jbGllbnRUYXNrcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgSU1jcFRhc2tJbnRlcm5hbD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkVXBkYXRlVGFzayA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPE1DUC5UYXNrPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkVXBkYXRlVGFzayA9IHRoaXMuX29uRGlkVXBkYXRlVGFzay5ldmVudDtcblxuXHQvKipcblx0ICogQXR0YWNoIGEgbmV3IGhhbmRsZXIgdG8gdGhpcyB0YXNrIG1hbmFnZXIuXG5cdCAqIFVwZGF0ZXMgYWxsIGNsaWVudCB0YXNrcyB0byB1c2UgdGhlIG5ldyBoYW5kbGVyLlxuXHQgKi9cblx0c2V0SGFuZGxlcihoYW5kbGVyOiBNY3BTZXJ2ZXJSZXF1ZXN0SGFuZGxlciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgdGFzayBvZiB0aGlzLl9jbGllbnRUYXNrcy52YWx1ZXMoKSkge1xuXHRcdFx0dGFzay5zZXRIYW5kbGVyKGhhbmRsZXIpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgYSBjbGllbnQgdGFzayBieSBJRCBmb3Igc3RhdHVzIG5vdGlmaWNhdGlvbiBoYW5kbGluZy5cblx0ICovXG5cdGdldENsaWVudFRhc2sodGFza0lkOiBzdHJpbmcpOiBJTWNwVGFza0ludGVybmFsIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY2xpZW50VGFza3MuZ2V0KHRhc2tJZCk7XG5cdH1cblxuXHQvKipcblx0ICogVHJhY2sgYSBuZXcgY2xpZW50IHRhc2suXG5cdCAqL1xuXHRhZG9wdENsaWVudFRhc2sodGFzazogSU1jcFRhc2tJbnRlcm5hbCk6IHZvaWQge1xuXHRcdHRoaXMuX2NsaWVudFRhc2tzLnNldCh0YXNrLmlkLCB0YXNrKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVbnRyYWNrcyBhIGNsaWVudCB0YXNrLlxuXHQgKi9cblx0YWJhbmRvbkNsaWVudFRhc2sodGFza0lkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9jbGllbnRUYXNrcy5kZWxldGVBbmREaXNwb3NlKHRhc2tJZCk7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlIGEgbmV3IHRhc2sgYW5kIGV4ZWN1dGUgaXQgYXN5bmNocm9ub3VzbHkuXG5cdCAqIFJldHVybnMgdGhlIHRhc2sgaW1tZWRpYXRlbHkgd2hpbGUgZXhlY3V0aW9uIGNvbnRpbnVlcyBpbiB0aGUgYmFja2dyb3VuZC5cblx0ICovXG5cdHB1YmxpYyBjcmVhdGVUYXNrPFRSZXN1bHQgZXh0ZW5kcyBNQ1AuUmVzdWx0Pihcblx0XHR0dGw6IG51bWJlciB8IG51bGwsXG5cdFx0ZXhlY3V0b3I6ICh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFByb21pc2U8VFJlc3VsdD5cblx0KTogTUNQLkNyZWF0ZVRhc2tSZXN1bHQge1xuXHRcdGNvbnN0IHRhc2tJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IGNyZWF0ZWRBdCA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcblx0XHRjb25zdCBjcmVhdGVkQXRUaW1lID0gRGF0ZS5ub3coKTtcblxuXHRcdGNvbnN0IHRhc2s6IE1DUC5UYXNrID0ge1xuXHRcdFx0dGFza0lkLFxuXHRcdFx0c3RhdHVzOiAnd29ya2luZycsXG5cdFx0XHRjcmVhdGVkQXQsXG5cdFx0XHR0dGwsXG5cdFx0XHRsYXN0VXBkYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRwb2xsSW50ZXJ2YWw6IDEwMDAsIC8vIFN1Z2dlc3QgMSBzZWNvbmQgcG9sbGluZyBpbnRlcnZhbFxuXHRcdH07XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGN0cy5kaXNwb3NlKHRydWUpKSk7XG5cblx0XHRjb25zdCBleGVjdXRpb25Qcm9taXNlID0gdGhpcy5fZXhlY3V0ZVRhc2sodGFza0lkLCBleGVjdXRvciwgY3RzLnRva2VuKTtcblxuXHRcdC8vIERlbGV0ZSB0aGUgdGFzayBhZnRlciBpdHMgVFRMLiBPciwgaWYgbm8gVFRMIGlzIGdpdmVuLCBkZWxldGUgaXQgc2hvcnRseSBhZnRlciB0aGUgdGFzayBjb21wbGV0ZXMuXG5cdFx0aWYgKHR0bCkge1xuXHRcdFx0c3RvcmUuYWRkKGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHRoaXMuX3NlcnZlclRhc2tzLmRlbGV0ZUFuZERpc3Bvc2UodGFza0lkKSwgdHRsKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGV4ZWN1dGlvblByb21pc2UuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRpbWVvdXQgPSB0aGlzLl9yZWdpc3RlcihkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fc2VydmVyVGFza3MuZGVsZXRlQW5kRGlzcG9zZSh0YXNrSWQpO1xuXHRcdFx0XHRcdHRoaXMuX3N0b3JlLmRlbGV0ZSh0aW1lb3V0KTtcblx0XHRcdFx0fSwgNjBfMDAwKSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR0aGlzLl9zZXJ2ZXJUYXNrcy5zZXQodGFza0lkLCB7XG5cdFx0XHR0YXNrLFxuXHRcdFx0Y3RzLFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4gc3RvcmUuZGlzcG9zZSgpLFxuXHRcdFx0Y3JlYXRlZEF0VGltZSxcblx0XHRcdGV4ZWN1dGlvblByb21pc2UsXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4geyB0YXNrIH07XG5cdH1cblxuXHQvKipcblx0ICogRXhlY3V0ZSBhIHRhc2sgYXN5bmNocm9ub3VzbHkgYW5kIHVwZGF0ZSBpdHMgc3RhdGUuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9leGVjdXRlVGFzazxUUmVzdWx0IGV4dGVuZHMgTUNQLlJlc3VsdD4oXG5cdFx0dGFza0lkOiBzdHJpbmcsXG5cdFx0ZXhlY3V0b3I6ICh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFByb21pc2U8VFJlc3VsdD4sXG5cdFx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuXG5cdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRvcih0b2tlbik7XG5cdFx0XHR0aGlzLl91cGRhdGVUYXNrU3RhdHVzKHRhc2tJZCwgJ2NvbXBsZXRlZCcsIHVuZGVmaW5lZCwgcmVzdWx0KTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgQ2FuY2VsbGF0aW9uRXJyb3IpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlVGFza1N0YXR1cyh0YXNrSWQsICdjYW5jZWxsZWQnLCAnVGFzayB3YXMgY2FuY2VsbGVkIGJ5IHRoZSBjbGllbnQnKTtcblx0XHRcdH0gZWxzZSBpZiAoZXJyb3IgaW5zdGFuY2VvZiBNY3BFcnJvcikge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVUYXNrU3RhdHVzKHRhc2tJZCwgJ2ZhaWxlZCcsIGVycm9yLm1lc3NhZ2UsIHVuZGVmaW5lZCwge1xuXHRcdFx0XHRcdGNvZGU6IGVycm9yLmNvZGUsXG5cdFx0XHRcdFx0bWVzc2FnZTogZXJyb3IubWVzc2FnZSxcblx0XHRcdFx0XHRkYXRhOiBlcnJvci5kYXRhLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSBpZiAoZXJyb3IgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVUYXNrU3RhdHVzKHRhc2tJZCwgJ2ZhaWxlZCcsIGVycm9yLm1lc3NhZ2UsIHVuZGVmaW5lZCwge1xuXHRcdFx0XHRcdGNvZGU6IE1DUC5JTlRFUk5BTF9FUlJPUixcblx0XHRcdFx0XHRtZXNzYWdlOiBlcnJvci5tZXNzYWdlLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZVRhc2tTdGF0dXModGFza0lkLCAnZmFpbGVkJywgJ1Vua25vd24gZXJyb3InLCB1bmRlZmluZWQsIHtcblx0XHRcdFx0XHRjb2RlOiBNQ1AuSU5URVJOQUxfRVJST1IsXG5cdFx0XHRcdFx0bWVzc2FnZTogJ1Vua25vd24gZXJyb3InLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlIHRhc2sgc3RhdHVzIGFuZCBvcHRpb25hbGx5IHN0b3JlIHJlc3VsdCBvciBlcnJvci5cblx0ICovXG5cdHByaXZhdGUgX3VwZGF0ZVRhc2tTdGF0dXMoXG5cdFx0dGFza0lkOiBzdHJpbmcsXG5cdFx0c3RhdHVzOiBNQ1AuVGFza1N0YXR1cyxcblx0XHRzdGF0dXNNZXNzYWdlPzogc3RyaW5nLFxuXHRcdHJlc3VsdD86IE1DUC5SZXN1bHQsXG5cdFx0ZXJyb3I/OiBNQ1AuRXJyb3Jcblx0KTogdm9pZCB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9zZXJ2ZXJUYXNrcy5nZXQodGFza0lkKTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0ZW50cnkudGFzay5zdGF0dXMgPSBzdGF0dXM7XG5cdFx0ZW50cnkudGFzay5sYXN0VXBkYXRlZEF0ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuXG5cdFx0aWYgKHN0YXR1c01lc3NhZ2UgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0ZW50cnkudGFzay5zdGF0dXNNZXNzYWdlID0gc3RhdHVzTWVzc2FnZTtcblx0XHR9XG5cdFx0aWYgKHJlc3VsdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRlbnRyeS5yZXN1bHQgPSByZXN1bHQ7XG5cdFx0fVxuXHRcdGlmIChlcnJvciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRlbnRyeS5lcnJvciA9IGVycm9yO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkVXBkYXRlVGFzay5maXJlKHsgLi4uZW50cnkudGFzayB9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIGN1cnJlbnQgc3RhdGUgb2YgYSB0YXNrLlxuXHQgKiBSZXR1cm5zIGFuIGVycm9yIGlmIHRoZSB0YXNrIGRvZXNuJ3QgZXhpc3Qgb3IgaGFzIGV4cGlyZWQuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0VGFzayh0YXNrSWQ6IHN0cmluZyk6IE1DUC5HZXRUYXNrUmVzdWx0IHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX3NlcnZlclRhc2tzLmdldCh0YXNrSWQpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHRocm93IG5ldyBNY3BFcnJvcihNQ1AuSU5WQUxJRF9QQVJBTVMsIGBUYXNrIG5vdCBmb3VuZDogJHt0YXNrSWR9YCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgLi4uZW50cnkudGFzayB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldCB0aGUgcmVzdWx0IG9mIGEgY29tcGxldGVkIHRhc2suXG5cdCAqIEJsb2NrcyB1bnRpbCB0aGUgdGFzayBjb21wbGV0ZXMgaWYgaXQncyBzdGlsbCBpbiBwcm9ncmVzcy5cblx0ICovXG5cdHB1YmxpYyBhc3luYyBnZXRUYXNrUmVzdWx0KHRhc2tJZDogc3RyaW5nKTogUHJvbWlzZTxNQ1AuR2V0VGFza1BheWxvYWRSZXN1bHQ+IHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX3NlcnZlclRhc2tzLmdldCh0YXNrSWQpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHRocm93IG5ldyBNY3BFcnJvcihNQ1AuSU5WQUxJRF9QQVJBTVMsIGBUYXNrIG5vdCBmb3VuZDogJHt0YXNrSWR9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKGVudHJ5LnRhc2suc3RhdHVzID09PSAnd29ya2luZycgfHwgZW50cnkudGFzay5zdGF0dXMgPT09ICdpbnB1dF9yZXF1aXJlZCcpIHtcblx0XHRcdGF3YWl0IGVudHJ5LmV4ZWN1dGlvblByb21pc2U7XG5cdFx0fVxuXG5cdFx0Ly8gUmVmcmVzaCBlbnRyeSBhZnRlciB3YWl0aW5nXG5cdFx0Y29uc3QgdXBkYXRlZEVudHJ5ID0gdGhpcy5fc2VydmVyVGFza3MuZ2V0KHRhc2tJZCk7XG5cdFx0aWYgKCF1cGRhdGVkRW50cnkpIHtcblx0XHRcdHRocm93IG5ldyBNY3BFcnJvcihNQ1AuSU5WQUxJRF9QQVJBTVMsIGBUYXNrIG5vdCBmb3VuZDogJHt0YXNrSWR9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKHVwZGF0ZWRFbnRyeS5lcnJvcikge1xuXHRcdFx0dGhyb3cgbmV3IE1jcEVycm9yKHVwZGF0ZWRFbnRyeS5lcnJvci5jb2RlLCB1cGRhdGVkRW50cnkuZXJyb3IubWVzc2FnZSwgdXBkYXRlZEVudHJ5LmVycm9yLmRhdGEpO1xuXHRcdH1cblxuXHRcdGlmICghdXBkYXRlZEVudHJ5LnJlc3VsdCkge1xuXHRcdFx0dGhyb3cgbmV3IE1jcEVycm9yKE1DUC5JTlRFUk5BTF9FUlJPUiwgJ1Rhc2sgY29tcGxldGVkIGJ1dCBubyByZXN1bHQgYXZhaWxhYmxlJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVwZGF0ZWRFbnRyeS5yZXN1bHQ7XG5cdH1cblxuXHQvKipcblx0ICogQ2FuY2VsIGEgdGFzay5cblx0ICovXG5cdHB1YmxpYyBjYW5jZWxUYXNrKHRhc2tJZDogc3RyaW5nKTogTUNQLkNhbmNlbFRhc2tSZXN1bHQge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fc2VydmVyVGFza3MuZ2V0KHRhc2tJZCk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0dGhyb3cgbmV3IE1jcEVycm9yKE1DUC5JTlZBTElEX1BBUkFNUywgYFRhc2sgbm90IGZvdW5kOiAke3Rhc2tJZH1gKTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBpZiBhbHJlYWR5IGluIHRlcm1pbmFsIHN0YXR1c1xuXHRcdGlmIChlbnRyeS50YXNrLnN0YXR1cyA9PT0gJ2NvbXBsZXRlZCcgfHwgZW50cnkudGFzay5zdGF0dXMgPT09ICdmYWlsZWQnIHx8IGVudHJ5LnRhc2suc3RhdHVzID09PSAnY2FuY2VsbGVkJykge1xuXHRcdFx0dGhyb3cgbmV3IE1jcEVycm9yKE1DUC5JTlZBTElEX1BBUkFNUywgYENhbm5vdCBjYW5jZWwgdGFzayBpbiAke2VudHJ5LnRhc2suc3RhdHVzfSBzdGF0dXNgKTtcblx0XHR9XG5cblx0XHRlbnRyeS50YXNrLnN0YXR1cyA9ICdjYW5jZWxsZWQnO1xuXHRcdGVudHJ5LnRhc2suc3RhdHVzTWVzc2FnZSA9ICdUYXNrIHdhcyBjYW5jZWxsZWQgYnkgdGhlIGNsaWVudCc7XG5cdFx0ZW50cnkuY3RzLmNhbmNlbCgpO1xuXG5cdFx0cmV0dXJuIHsgLi4uZW50cnkudGFzayB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIExpc3QgYWxsIHRhc2tzLlxuXHQgKi9cblx0cHVibGljIGxpc3RUYXNrcygpOiBNQ1AuTGlzdFRhc2tzUmVzdWx0IHtcblx0XHRjb25zdCB0YXNrczogTUNQLlRhc2tbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB0aGlzLl9zZXJ2ZXJUYXNrcy52YWx1ZXMoKSkge1xuXHRcdFx0dGFza3MucHVzaCh7IC4uLmVudHJ5LnRhc2sgfSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgdGFza3MgfTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyx5QkFBeUI7QUFDbEMsU0FBNEIsK0JBQStCO0FBQzNELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFB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
