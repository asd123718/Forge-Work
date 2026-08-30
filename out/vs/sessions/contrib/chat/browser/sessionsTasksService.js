var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { observableValue, transaction } from "../../../../base/common/observable.js";
import { joinPath, dirname, isEqual } from "../../../../base/common/resources.js";
import { parse } from "../../../../base/common/jsonc.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IJSONEditingService } from "../../../../workbench/services/configuration/common/jsonEditing.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IPreferencesService } from "../../../../workbench/services/preferences/common/preferences.js";
import { ISessionTaskRunnerRegistry } from "./sessionTaskRunner.js";
const ISessionsTasksService = createDecorator("sessionsTasksService");
let SessionsTasksService = class extends Disposable {
  constructor(_fileService, _jsonEditingService, _preferencesService, _taskRunnerRegistry, _storageService) {
    super();
    this._fileService = _fileService;
    this._jsonEditingService = _jsonEditingService;
    this._preferencesService = _preferencesService;
    this._taskRunnerRegistry = _taskRunnerRegistry;
    this._storageService = _storageService;
    this._onDidRunTask = this._register(new Emitter());
    this.onDidRunTask = this._onDidRunTask.event;
    this._sessionTasks = observableValue(this, []);
    this._fileWatcher = this._register(new MutableDisposable());
    this._pinnedTaskObservables = /* @__PURE__ */ new Map();
    this._browserUrlObservables = /* @__PURE__ */ new Map();
    this._pinnedBrowserObservables = /* @__PURE__ */ new Map();
    this._pinnedTaskLabels = this._loadPinnedTaskLabels();
    this._browserUrls = this._loadBrowserUrls();
    this._pinnedBrowsers = this._loadPinnedBrowsers();
  }
  getSessionTasks(session) {
    const folder = this._getSessionFolder(session);
    this._ensureFileWatch(folder);
    if (!isEqual(this._lastRefreshedFolder, folder)) {
      this._lastRefreshedFolder = folder;
      this._refreshSessionTasks(folder);
    }
    return this._sessionTasks;
  }
  async getSessionTasksOnce(session) {
    return this._readTasksFromBothTargets(session, (t) => !!t.inAgents);
  }
  async getAllTasks(session) {
    return this._readTasksFromBothTargets(session, () => true);
  }
  async getNonSessionTasks(session) {
    return this._readTasksFromBothTargets(session, (t) => !t.inAgents);
  }
  /**
   * Reads tasks from both workspace and user `tasks.json` for a session,
   * filtering each entry through `predicate` (in addition to the supported-type
   * check) and tagging it with its storage target.
   */
  async _readTasksFromBothTargets(session, predicate) {
    const result = [];
    const targets = ["workspace", "user"];
    for (const target of targets) {
      const uri = this._getTasksJsonUri(session, target);
      if (!uri) {
        continue;
      }
      const json = await this._readTasksJson(uri);
      for (const task of json.tasks ?? []) {
        if (predicate(task) && this._isSupportedTask(task)) {
          result.push({ task, target });
        }
      }
    }
    return result;
  }
  async addTaskToSessions(task, session, target, options) {
    const tasksJsonUri = this._getTasksJsonUri(session, target);
    if (!tasksJsonUri) {
      return;
    }
    const tasksJson = await this._readTasksJson(tasksJsonUri);
    const tasks = tasksJson.tasks ?? [];
    const index = tasks.findIndex((t) => t.label === task.label);
    if (index === -1) {
      return;
    }
    const edits = [
      { path: ["tasks", index, "inAgents"], value: true }
    ];
    if (options) {
      edits.push({
        path: ["tasks", index, "runOptions"],
        value: options.runOn && options.runOn !== "default" ? { runOn: options.runOn } : void 0
      });
    }
    await this._jsonEditingService.write(tasksJsonUri, edits, true);
  }
  async createAndAddTask(label, command, session, target, options) {
    const tasksJsonUri = this._getTasksJsonUri(session, target);
    if (!tasksJsonUri) {
      return void 0;
    }
    const tasksJson = await this._readTasksJson(tasksJsonUri);
    const tasks = tasksJson.tasks ?? [];
    const resolvedLabel = label?.trim() || command;
    const newTask = {
      label: resolvedLabel,
      type: "shell",
      command,
      inAgents: true,
      ...options?.runOn && options.runOn !== "default" ? { runOptions: { runOn: options.runOn } } : {}
    };
    await this._jsonEditingService.write(tasksJsonUri, [
      { path: ["version"], value: tasksJson.version ?? "2.0.0" },
      { path: ["tasks"], value: [...tasks, newTask] }
    ], true);
    return newTask;
  }
  async updateTask(originalTaskLabel, updatedTask, session, currentTarget, newTarget) {
    const currentTasksJsonUri = this._getTasksJsonUri(session, currentTarget);
    const newTasksJsonUri = this._getTasksJsonUri(session, newTarget);
    if (!currentTasksJsonUri || !newTasksJsonUri) {
      return;
    }
    const currentTasksJson = await this._readTasksJson(currentTasksJsonUri);
    const currentTasks = currentTasksJson.tasks ?? [];
    const currentIndex = currentTasks.findIndex((task) => task.label === originalTaskLabel);
    if (currentIndex === -1) {
      return;
    }
    if (currentTasksJsonUri.toString() === newTasksJsonUri.toString()) {
      const updatedTasks = currentTasks.map((task, i) => i === currentIndex ? updatedTask : task);
      await this._jsonEditingService.write(currentTasksJsonUri, [
        { path: ["tasks"], value: updatedTasks }
      ], true);
    } else {
      const newTasksJson = await this._readTasksJson(newTasksJsonUri);
      const newTasks = newTasksJson.tasks ?? [];
      await this._jsonEditingService.write(currentTasksJsonUri, [
        { path: ["tasks"], value: currentTasks.filter((_, taskIndex) => taskIndex !== currentIndex) }
      ], true);
      await this._jsonEditingService.write(newTasksJsonUri, [
        { path: ["version"], value: newTasksJson.version ?? "2.0.0" },
        { path: ["tasks"], value: [...newTasks, updatedTask] }
      ], true);
    }
    const repoUri = this._getSessionRepo(session)?.root;
    if (repoUri) {
      const key = repoUri.toString();
      if (this._pinnedTaskLabels.get(key) === originalTaskLabel) {
        this._setPinnedTaskLabelForKey(key, updatedTask.label);
      }
    }
  }
  async removeTask(taskLabel, session, target) {
    const tasksJsonUri = this._getTasksJsonUri(session, target);
    if (!tasksJsonUri) {
      return;
    }
    const tasksJson = await this._readTasksJson(tasksJsonUri);
    const tasks = tasksJson.tasks ?? [];
    const index = tasks.findIndex((t) => t.label === taskLabel);
    if (index === -1) {
      return;
    }
    await this._jsonEditingService.write(tasksJsonUri, [
      { path: ["tasks"], value: tasks.filter((_, taskIndex) => taskIndex !== index) }
    ], true);
    const repoUri = this._getSessionRepo(session)?.root;
    if (repoUri) {
      const key = repoUri.toString();
      if (this._pinnedTaskLabels.get(key) === taskLabel) {
        this._setPinnedTaskLabelForKey(key, void 0);
      }
    }
  }
  async runTask(task, session) {
    const runner = this._taskRunnerRegistry.getRunner(session);
    if (!runner) {
      return void 0;
    }
    const handle = await runner.runTask(task, session);
    this._onDidRunTask.fire({ task, session });
    return handle;
  }
  getPinnedTaskLabel(repository) {
    if (!repository) {
      return observableValue("pinnedTaskLabel", void 0);
    }
    const key = repository.toString();
    let obs = this._pinnedTaskObservables.get(key);
    if (!obs) {
      obs = observableValue("pinnedTaskLabel", this._pinnedTaskLabels.get(key));
      this._pinnedTaskObservables.set(key, obs);
    }
    return obs;
  }
  setPinnedTaskLabel(repository, taskLabel) {
    if (!repository) {
      return;
    }
    const key = repository.toString();
    this._setPinnedTaskLabelForKey(key, taskLabel);
    if (taskLabel !== void 0) {
      this._setPinnedBrowserForKey(key, false);
    }
  }
  getBrowserUrl(repository) {
    if (!repository) {
      return observableValue("browserUrl", void 0);
    }
    const key = repository.toString();
    let obs = this._browserUrlObservables.get(key);
    if (!obs) {
      obs = observableValue("browserUrl", this._browserUrls.get(key));
      this._browserUrlObservables.set(key, obs);
    }
    return obs;
  }
  setBrowserUrl(repository, url) {
    if (!repository) {
      return;
    }
    const key = repository.toString();
    const trimmed = url?.trim();
    if (!trimmed) {
      this._browserUrls.delete(key);
    } else {
      this._browserUrls.set(key, trimmed);
    }
    this._saveBrowserUrls();
    const obs = this._browserUrlObservables.get(key);
    if (obs) {
      transaction((tx) => obs.set(trimmed || void 0, tx));
    }
  }
  getPinnedBrowser(repository) {
    if (!repository) {
      return observableValue("pinnedBrowser", false);
    }
    const key = repository.toString();
    let obs = this._pinnedBrowserObservables.get(key);
    if (!obs) {
      obs = observableValue("pinnedBrowser", this._pinnedBrowsers.has(key));
      this._pinnedBrowserObservables.set(key, obs);
    }
    return obs;
  }
  setPinnedBrowser(repository, pinned) {
    if (!repository) {
      return;
    }
    const key = repository.toString();
    this._setPinnedBrowserForKey(key, pinned);
    if (pinned) {
      this._setPinnedTaskLabelForKey(key, void 0);
    }
  }
  // --- private helpers ---
  _getSessionRepo(session) {
    return session.workspace.get()?.folders[0];
  }
  _getSessionFolder(session) {
    const repo = this._getSessionRepo(session);
    return repo?.workingDirectory ?? repo?.root;
  }
  _getTasksJsonUri(session, target) {
    if (target === "workspace") {
      return this._getWorkspaceTasksJsonUri(this._getSessionFolder(session));
    }
    return this._getUserTasksJsonUri();
  }
  _getWorkspaceTasksJsonUri(folder) {
    return folder?.path ? joinPath(folder, ".vscode", "tasks.json") : void 0;
  }
  _getUserTasksJsonUri() {
    const userSettingsResource = this._preferencesService.userSettingsResource;
    if (!userSettingsResource.path) {
      return void 0;
    }
    const userSettingsFolder = dirname(userSettingsResource);
    return userSettingsFolder.path ? joinPath(userSettingsFolder, "tasks.json") : void 0;
  }
  async _readTasksJson(uri) {
    try {
      const content = await this._fileService.readFile(uri);
      return parse(content.value.toString());
    } catch {
      return {};
    }
  }
  _isSupportedTask(task) {
    return !!task.label;
  }
  _ensureFileWatch(folder) {
    const tasksUri = this._getWorkspaceTasksJsonUri(folder);
    if (!tasksUri) {
      this._watchedResource = void 0;
      this._fileWatcher.clear();
      return;
    }
    if (this._watchedResource && this._watchedResource.toString() === tasksUri.toString()) {
      return;
    }
    this._watchedResource = tasksUri;
    const disposables = new DisposableStore();
    disposables.add(this._fileService.watch(tasksUri));
    const userUri = this._getUserTasksJsonUri();
    if (userUri) {
      disposables.add(this._fileService.watch(userUri));
    }
    disposables.add(this._fileService.onDidFilesChange((e) => {
      if (e.affects(tasksUri) || userUri && e.affects(userUri)) {
        this._refreshSessionTasks(folder);
      }
    }));
    this._fileWatcher.value = disposables;
  }
  async _refreshSessionTasks(folder) {
    if (!folder) {
      transaction((tx) => this._sessionTasks.set([], tx));
      return;
    }
    const tasksUri = this._getWorkspaceTasksJsonUri(folder);
    const tasksJson = tasksUri ? await this._readTasksJson(tasksUri) : {};
    const sessionTasks = (tasksJson.tasks ?? []).filter((t) => t.inAgents && this._isSupportedTask(t)).map((t) => ({ task: t, target: "workspace" }));
    const userUri = this._getUserTasksJsonUri();
    const userJson = userUri ? await this._readTasksJson(userUri) : {};
    const userSessionTasks = (userJson.tasks ?? []).filter((t) => t.inAgents && this._isSupportedTask(t)).map((t) => ({ task: t, target: "user" }));
    transaction((tx) => this._sessionTasks.set([...sessionTasks, ...userSessionTasks], tx));
  }
  _loadPinnedTaskLabels() {
    const raw = this._storageService.get(SessionsTasksService._PINNED_TASK_LABELS_KEY, StorageScope.APPLICATION);
    if (raw) {
      try {
        return new Map(Object.entries(JSON.parse(raw)));
      } catch {
      }
    }
    return /* @__PURE__ */ new Map();
  }
  _savePinnedTaskLabels() {
    this._storageService.store(
      SessionsTasksService._PINNED_TASK_LABELS_KEY,
      JSON.stringify(Object.fromEntries(this._pinnedTaskLabels)),
      StorageScope.APPLICATION,
      StorageTarget.USER
    );
  }
  _setPinnedTaskLabelForKey(key, taskLabel) {
    if (taskLabel === void 0) {
      this._pinnedTaskLabels.delete(key);
    } else {
      this._pinnedTaskLabels.set(key, taskLabel);
    }
    this._savePinnedTaskLabels();
    const obs = this._pinnedTaskObservables.get(key);
    if (obs) {
      transaction((tx) => obs.set(taskLabel, tx));
    }
  }
  _loadBrowserUrls() {
    const raw = this._storageService.get(SessionsTasksService._BROWSER_URLS_KEY, StorageScope.APPLICATION);
    if (raw) {
      try {
        return new Map(Object.entries(JSON.parse(raw)));
      } catch {
      }
    }
    return /* @__PURE__ */ new Map();
  }
  _saveBrowserUrls() {
    this._storageService.store(
      SessionsTasksService._BROWSER_URLS_KEY,
      JSON.stringify(Object.fromEntries(this._browserUrls)),
      StorageScope.APPLICATION,
      StorageTarget.USER
    );
  }
  _loadPinnedBrowsers() {
    const raw = this._storageService.get(SessionsTasksService._PINNED_BROWSERS_KEY, StorageScope.APPLICATION);
    if (raw) {
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          return new Set(arr);
        }
      } catch {
      }
    }
    return /* @__PURE__ */ new Set();
  }
  _savePinnedBrowsers() {
    this._storageService.store(
      SessionsTasksService._PINNED_BROWSERS_KEY,
      JSON.stringify([...this._pinnedBrowsers]),
      StorageScope.APPLICATION,
      StorageTarget.USER
    );
  }
  _setPinnedBrowserForKey(key, pinned) {
    if (pinned) {
      this._pinnedBrowsers.add(key);
    } else {
      this._pinnedBrowsers.delete(key);
    }
    this._savePinnedBrowsers();
    const obs = this._pinnedBrowserObservables.get(key);
    if (obs) {
      transaction((tx) => obs.set(pinned, tx));
    }
  }
};
SessionsTasksService._PINNED_TASK_LABELS_KEY = "agentSessions.pinnedTaskLabels";
SessionsTasksService._BROWSER_URLS_KEY = "agentSessions.browserUrls";
SessionsTasksService._PINNED_BROWSERS_KEY = "agentSessions.pinnedBrowsers";
SessionsTasksService = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IJSONEditingService),
  __decorateParam(2, IPreferencesService),
  __decorateParam(3, ISessionTaskRunnerRegistry),
  __decorateParam(4, IStorageService)
], SessionsTasksService);
export {
  ISessionsTasksService,
  SessionsTasksService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcYnJvd3Nlclxcc2Vzc2lvbnNUYXNrc1NlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUsIHRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCwgZGlybmFtZSwgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBwYXJzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25jLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbiB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IElKU09ORWRpdGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvY29uZmlndXJhdGlvbi9jb21tb24vanNvbkVkaXRpbmcuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElQcmVmZXJlbmNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcbmltcG9ydCB7IENvbW1hbmRTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi90YXNrcy9jb21tb24vdGFza0NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVNlc3Npb25UYXNrUnVubmVyUmVnaXN0cnkgfSBmcm9tICcuL3Nlc3Npb25UYXNrUnVubmVyLmpzJztcblxuZXhwb3J0IHR5cGUgVGFza1N0b3JhZ2VUYXJnZXQgPSAndXNlcicgfCAnd29ya3NwYWNlJztcbnR5cGUgVGFza1J1bk9uT3B0aW9uID0gJ2RlZmF1bHQnIHwgJ2ZvbGRlck9wZW4nIHwgJ3dvcmt0cmVlQ3JlYXRlZCc7XG5cbmludGVyZmFjZSBJVGFza1J1bk9wdGlvbnMge1xuXHRyZWFkb25seSBydW5Pbj86IFRhc2tSdW5Pbk9wdGlvbjtcbn1cblxuLyoqXG4gKiBTaGFwZSBvZiBhIHNpbmdsZSB0YXNrIGVudHJ5IGluc2lkZSB0YXNrcy5qc29uLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElUYXNrRW50cnkge1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSB0YXNrPzogQ29tbWFuZFN0cmluZztcblx0cmVhZG9ubHkgc2NyaXB0Pzogc3RyaW5nO1xuXHRyZWFkb25seSB0eXBlPzogc3RyaW5nO1xuXHRyZWFkb25seSBjb21tYW5kPzogc3RyaW5nO1xuXHRyZWFkb25seSBhcmdzPzogQ29tbWFuZFN0cmluZ1tdO1xuXHRyZWFkb25seSBpbkFnZW50cz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHJ1bk9wdGlvbnM/OiBJVGFza1J1bk9wdGlvbnM7XG5cdHJlYWRvbmx5IHdpbmRvd3M/OiB7IGNvbW1hbmQ/OiBzdHJpbmc7IGFyZ3M/OiBDb21tYW5kU3RyaW5nW10gfTtcblx0cmVhZG9ubHkgb3N4PzogeyBjb21tYW5kPzogc3RyaW5nOyBhcmdzPzogQ29tbWFuZFN0cmluZ1tdIH07XG5cdHJlYWRvbmx5IGxpbnV4PzogeyBjb21tYW5kPzogc3RyaW5nOyBhcmdzPzogQ29tbWFuZFN0cmluZ1tdIH07XG5cdHJlYWRvbmx5IGRlcGVuZHNPbj86IHN0cmluZyB8IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRyZWFkb25seSBkZXBlbmRzT3JkZXI/OiAnc2VxdWVuY2UnIHwgJ3BhcmFsbGVsJztcblx0cmVhZG9ubHkgW2tleTogc3RyaW5nXTogdW5rbm93bjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTm9uU2Vzc2lvblRhc2tFbnRyeSB7XG5cdHJlYWRvbmx5IHRhc2s6IElUYXNrRW50cnk7XG5cdHJlYWRvbmx5IHRhcmdldDogVGFza1N0b3JhZ2VUYXJnZXQ7XG59XG5cbi8qKlxuICogQSBzZXNzaW9uIHRhc2sgdG9nZXRoZXIgd2l0aCB0aGUgc3RvcmFnZSB0YXJnZXQgaXQgd2FzIGxvYWRlZCBmcm9tLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElTZXNzaW9uVGFza1dpdGhUYXJnZXQge1xuXHRyZWFkb25seSB0YXNrOiBJVGFza0VudHJ5O1xuXHRyZWFkb25seSB0YXJnZXQ6IFRhc2tTdG9yYWdlVGFyZ2V0O1xufVxuXG4vKipcbiAqIFBheWxvYWQgZmlyZWQgYnkge0BsaW5rIElTZXNzaW9uc1Rhc2tzU2VydmljZS5vbkRpZFJ1blRhc2t9IGFmdGVyIGFcbiAqIHNlc3Npb24gdGFzayBoYXMgYmVlbiBzdWNjZXNzZnVsbHkgZGlzcGF0Y2hlZCB0byBpdHMgcnVubmVyLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElTZXNzaW9uVGFza1J1bkV2ZW50IHtcblx0cmVhZG9ubHkgdGFzazogSVRhc2tFbnRyeTtcblx0cmVhZG9ubHkgc2Vzc2lvbjogSVNlc3Npb247XG59XG5cbmludGVyZmFjZSBJVGFza3NKc29uIHtcblx0dmVyc2lvbj86IHN0cmluZztcblx0dGFza3M/OiBJVGFza0VudHJ5W107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlc3Npb25zVGFza3NTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBGaXJlcyBhZnRlciBhIHNlc3Npb24gdGFzayBoYXMgYmVlbiBzdWNjZXNzZnVsbHkgZGlzcGF0Y2hlZCB0byBpdHNcblx0ICogcnVubmVyIHZpYSB7QGxpbmsgcnVuVGFza30uIERvZXMgbm90IGZpcmUgd2hlbiB0aGUgdGFzayB0aHJvd3Mgb3Igd2hlblxuXHQgKiBubyBydW5uZXIgaXMgcmVnaXN0ZXJlZCBmb3IgdGhlIHNlc3Npb24uXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZFJ1blRhc2s6IEV2ZW50PElTZXNzaW9uVGFza1J1bkV2ZW50PjtcblxuXHQvKipcblx0ICogT2JzZXJ2YWJsZSBsaXN0IG9mIHRhc2tzIHdpdGggYGluQWdlbnRzOiB0cnVlYCwgYXV0b21hdGljYWxseVxuXHQgKiB1cGRhdGVkIHdoZW4gdGhlIHRhc2tzLmpzb24gZmlsZSBjaGFuZ2VzLiBFYWNoIGVudHJ5IGluY2x1ZGVzIHRoZVxuXHQgKiBzdG9yYWdlIHRhcmdldCB0aGUgdGFzayB3YXMgbG9hZGVkIGZyb20uXG5cdCAqXG5cdCAqICoqTm90ZToqKiBUaGlzIG9ic2VydmFibGUgaXMgc2hhcmVkIGFjcm9zcyBhbGwgc2Vzc2lvbnMgXHUyMDE0IHJlcGVhdGVkXG5cdCAqIGNhbGxzIHdpdGggZGlmZmVyZW50IHNlc3Npb25zIG92ZXJ3cml0ZSBpdCB3aXRoIHRoZSBtb3N0IHJlY2VudGx5XG5cdCAqIHJlcXVlc3RlZCBzZXNzaW9uJ3MgdGFza3MuIEl0IGlzIGludGVuZGVkIGZvciBhIHNpbmdsZSBmb2xsb3dlclxuXHQgKiAoZS5nLiB0aGUgdG9vbGJhciB0cmFja2luZyB0aGUgYWN0aXZlIHNlc3Npb24pLiBDb25zdW1lcnMgdGhhdCBuZWVkXG5cdCAqIGEgb25lLXRpbWUgc25hcHNob3QgZm9yIGEgc3BlY2lmaWMgc2Vzc2lvbiBzaG91bGQgdXNlXG5cdCAqIHtAbGluayBnZXRTZXNzaW9uVGFza3NPbmNlfSBpbnN0ZWFkLlxuXHQgKi9cblx0Z2V0U2Vzc2lvblRhc2tzKHNlc3Npb246IElTZXNzaW9uKTogSU9ic2VydmFibGU8cmVhZG9ubHkgSVNlc3Npb25UYXNrV2l0aFRhcmdldFtdPjtcblxuXHQvKipcblx0ICogUmV0dXJucyBhIG9uZS1zaG90IHNuYXBzaG90IG9mIHRoZSBzZXNzaW9uIHRhc2tzICh3aXRoIGBpbkFnZW50czogdHJ1ZWApXG5cdCAqIGZvciB0aGUgZ2l2ZW4gc2Vzc2lvbiwgcmVhZGluZyBmcm9tIGJvdGggd29ya3NwYWNlIGFuZCB1c2VyIGB0YXNrcy5qc29uYC5cblx0ICpcblx0ICogVW5saWtlIHtAbGluayBnZXRTZXNzaW9uVGFza3N9LCB0aGlzIG1ldGhvZCBkb2VzIE5PVCB0b3VjaCB0aGUgc2hhcmVkXG5cdCAqIGBfc2Vzc2lvblRhc2tzYCBvYnNlcnZhYmxlLCBzbyBpdCBpcyBzYWZlIHRvIGNhbGwgY29uY3VycmVudGx5IGZvclxuXHQgKiBtdWx0aXBsZSBzZXNzaW9ucy5cblx0ICovXG5cdGdldFNlc3Npb25UYXNrc09uY2Uoc2Vzc2lvbjogSVNlc3Npb24pOiBQcm9taXNlPHJlYWRvbmx5IElTZXNzaW9uVGFza1dpdGhUYXJnZXRbXT47XG5cblx0LyoqXG5cdCAqIFJldHVybnMgYSBvbmUtc2hvdCBzbmFwc2hvdCBvZiAqKmFsbCoqIHRhc2tzICh3aXRoIG9yIHdpdGhvdXRcblx0ICogYGluQWdlbnRzYCkgZGVjbGFyZWQgZm9yIHRoZSBnaXZlbiBzZXNzaW9uLCByZWFkaW5nIGZyb20gYm90aCB3b3Jrc3BhY2Vcblx0ICogYW5kIHVzZXIgYHRhc2tzLmpzb25gLiBVc2VkIGJ5IHRoZSBhZ2VudC1ob3N0IHJ1bm5lciB0byBsb29rIHVwXG5cdCAqIGRlcGVuZGVuY3kgdGFza3MgcmVmZXJlbmNlZCB2aWEgYGRlcGVuZHNPbmAuXG5cdCAqL1xuXHRnZXRBbGxUYXNrcyhzZXNzaW9uOiBJU2Vzc2lvbik6IFByb21pc2U8cmVhZG9ubHkgSVNlc3Npb25UYXNrV2l0aFRhcmdldFtdPjtcblxuXHQvKipcblx0ICogUmV0dXJucyB0YXNrcyB0aGF0IGRvIE5PVCBoYXZlIGBpbkFnZW50czogdHJ1ZWAgXHUyMDE0IHVzZWQgYXNcblx0ICogc3VnZ2VzdGlvbnMgaW4gdGhlIFwiQWRkIFJ1biBBY3Rpb25cIiBwaWNrZXIuXG5cdCAqL1xuXHRnZXROb25TZXNzaW9uVGFza3Moc2Vzc2lvbjogSVNlc3Npb24pOiBQcm9taXNlPHJlYWRvbmx5IElOb25TZXNzaW9uVGFza0VudHJ5W10+O1xuXG5cdC8qKlxuXHQgKiBTZXRzIGBpbkFnZW50czogdHJ1ZWAgb24gYW4gZXhpc3RpbmcgdGFzayAoaWRlbnRpZmllZCBieSBsYWJlbCksXG5cdCAqIHVwZGF0aW5nIGl0IGluIHBsYWNlIGluIGl0cyB0YXNrcy5qc29uLlxuXHQgKi9cblx0YWRkVGFza1RvU2Vzc2lvbnModGFzazogSVRhc2tFbnRyeSwgc2Vzc2lvbjogSVNlc3Npb24sIHRhcmdldDogVGFza1N0b3JhZ2VUYXJnZXQsIG9wdGlvbnM/OiBJVGFza1J1bk9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+O1xuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgbmV3IHNoZWxsIHRhc2sgd2l0aCBgaW5BZ2VudHM6IHRydWVgIGFuZCB3cml0ZXMgaXQgdG9cblx0ICogdGhlIGFwcHJvcHJpYXRlIHRhc2tzLmpzb24gKHVzZXIgb3Igd29ya3NwYWNlKS5cblx0ICovXG5cdGNyZWF0ZUFuZEFkZFRhc2sobGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCwgY29tbWFuZDogc3RyaW5nLCBzZXNzaW9uOiBJU2Vzc2lvbiwgdGFyZ2V0OiBUYXNrU3RvcmFnZVRhcmdldCwgb3B0aW9ucz86IElUYXNrUnVuT3B0aW9ucyk6IFByb21pc2U8SVRhc2tFbnRyeSB8IHVuZGVmaW5lZD47XG5cblx0LyoqXG5cdCAqIFVwZGF0ZXMgYW4gZXhpc3RpbmcgdGFzayBlbnRyeSwgb3B0aW9uYWxseSBtb3ZpbmcgaXQgYmV0d2VlbiB1c2VyIGFuZFxuXHQgKiB3b3Jrc3BhY2Ugc3RvcmFnZS5cblx0ICovXG5cdHVwZGF0ZVRhc2sob3JpZ2luYWxUYXNrTGFiZWw6IHN0cmluZywgdXBkYXRlZFRhc2s6IElUYXNrRW50cnksIHNlc3Npb246IElTZXNzaW9uLCBjdXJyZW50VGFyZ2V0OiBUYXNrU3RvcmFnZVRhcmdldCwgbmV3VGFyZ2V0OiBUYXNrU3RvcmFnZVRhcmdldCk6IFByb21pc2U8dm9pZD47XG5cblx0LyoqXG5cdCAqIFJlbW92ZXMgYW4gZXhpc3RpbmcgdGFzayBlbnRyeSBmcm9tIGl0cyB0YXNrcy5qc29uLlxuXHQgKi9cblx0cmVtb3ZlVGFzayh0YXNrTGFiZWw6IHN0cmluZywgc2Vzc2lvbjogSVNlc3Npb24sIHRhcmdldDogVGFza1N0b3JhZ2VUYXJnZXQpOiBQcm9taXNlPHZvaWQ+O1xuXG5cdC8qKlxuXHQgKiBSdW5zIGEgdGFzayB2aWEgdGhlIHRhc2sgc2VydmljZSwgbG9va2luZyBpdCB1cCBieSBsYWJlbCBpbiB0aGVcblx0ICogd29ya3NwYWNlIGZvbGRlciBjb3JyZXNwb25kaW5nIHRvIHRoZSBzZXNzaW9uIHdvcmt0cmVlLlxuXHQgKlxuXHQgKiBNYXkgcmVzb2x2ZSB0byBhbiB7QGxpbmsgSURpc3Bvc2FibGV9IHRoYXQgc3RvcHMgdGhlIGxhdW5jaGVkIHRhc2s7IHNlZVxuXHQgKiB7QGxpbmsgSVNlc3Npb25UYXNrUnVubmVyLnJ1blRhc2t9LlxuXHQgKi9cblx0cnVuVGFzayh0YXNrOiBJVGFza0VudHJ5LCBzZXNzaW9uOiBJU2Vzc2lvbik6IFByb21pc2U8SURpc3Bvc2FibGUgfCB1bmRlZmluZWQ+O1xuXG5cdC8qKlxuXHQgKiBPYnNlcnZhYmxlIGxhYmVsIG9mIHRoZSBwaW5uZWQgdGFzayBmb3IgdGhlIGdpdmVuIHJlcG9zaXRvcnkuXG5cdCAqL1xuXHRnZXRQaW5uZWRUYXNrTGFiZWwocmVwb3NpdG9yeTogVVJJIHwgdW5kZWZpbmVkKTogSU9ic2VydmFibGU8c3RyaW5nIHwgdW5kZWZpbmVkPjtcblxuXHQvKipcblx0ICogU2V0cyBvciBjbGVhcnMgdGhlIHBpbm5lZCB0YXNrIGZvciB0aGUgZ2l2ZW4gcmVwb3NpdG9yeS5cblx0ICovXG5cdHNldFBpbm5lZFRhc2tMYWJlbChyZXBvc2l0b3J5OiBVUkkgfCB1bmRlZmluZWQsIHRhc2tMYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZDtcblxuXHQvKipcblx0ICogT2JzZXJ2YWJsZSBVUkwgY29uZmlndXJlZCBmb3IgdGhlIGludGVncmF0ZWQgYnJvd3NlciBhY3Rpb24gZm9yIHRoZSBnaXZlbiByZXBvc2l0b3J5LlxuXHQgKi9cblx0Z2V0QnJvd3NlclVybChyZXBvc2l0b3J5OiBVUkkgfCB1bmRlZmluZWQpOiBJT2JzZXJ2YWJsZTxzdHJpbmcgfCB1bmRlZmluZWQ+O1xuXG5cdC8qKlxuXHQgKiBTZXRzIG9yIGNsZWFycyB0aGUgY29uZmlndXJlZCBicm93c2VyIFVSTCBmb3IgdGhlIGdpdmVuIHJlcG9zaXRvcnkuXG5cdCAqL1xuXHRzZXRCcm93c2VyVXJsKHJlcG9zaXRvcnk6IFVSSSB8IHVuZGVmaW5lZCwgdXJsOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBPYnNlcnZhYmxlIGluZGljYXRpbmcgd2hldGhlciB0aGUgaW50ZWdyYXRlZCBicm93c2VyIGFjdGlvbiBpcyBwaW5uZWQgYXMgdGhlIHByaW1hcnkgYWN0aW9uIGZvciB0aGUgZ2l2ZW4gcmVwb3NpdG9yeS5cblx0ICovXG5cdGdldFBpbm5lZEJyb3dzZXIocmVwb3NpdG9yeTogVVJJIHwgdW5kZWZpbmVkKTogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cblx0LyoqXG5cdCAqIFNldHMgb3IgY2xlYXJzIHdoZXRoZXIgdGhlIGludGVncmF0ZWQgYnJvd3NlciBhY3Rpb24gaXMgcGlubmVkIGFzIHRoZSBwcmltYXJ5IGFjdGlvbiBmb3IgdGhlIGdpdmVuIHJlcG9zaXRvcnkuXG5cdCAqIFBpbm5pbmcgdGhlIGJyb3dzZXIgY2xlYXJzIGFueSBwaW5uZWQgdGFzazsgcGlubmluZyBhIHRhc2sgY2xlYXJzIHRoZSBwaW5uZWQgYnJvd3Nlci5cblx0ICovXG5cdHNldFBpbm5lZEJyb3dzZXIocmVwb3NpdG9yeTogVVJJIHwgdW5kZWZpbmVkLCBwaW5uZWQ6IGJvb2xlYW4pOiB2b2lkO1xufVxuXG5leHBvcnQgY29uc3QgSVNlc3Npb25zVGFza3NTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElTZXNzaW9uc1Rhc2tzU2VydmljZT4oJ3Nlc3Npb25zVGFza3NTZXJ2aWNlJyk7XG5cbmV4cG9ydCBjbGFzcyBTZXNzaW9uc1Rhc2tzU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJU2Vzc2lvbnNUYXNrc1NlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9QSU5ORURfVEFTS19MQUJFTFNfS0VZID0gJ2FnZW50U2Vzc2lvbnMucGlubmVkVGFza0xhYmVscyc7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9CUk9XU0VSX1VSTFNfS0VZID0gJ2FnZW50U2Vzc2lvbnMuYnJvd3NlclVybHMnO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfUElOTkVEX0JST1dTRVJTX0tFWSA9ICdhZ2VudFNlc3Npb25zLnBpbm5lZEJyb3dzZXJzJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJ1blRhc2sgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJU2Vzc2lvblRhc2tSdW5FdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUnVuVGFzayA9IHRoaXMuX29uRGlkUnVuVGFzay5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uVGFza3MgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSVNlc3Npb25UYXNrV2l0aFRhcmdldFtdPih0aGlzLCBbXSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVXYXRjaGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9waW5uZWRUYXNrTGFiZWxzOiBNYXA8c3RyaW5nLCBzdHJpbmc+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9waW5uZWRUYXNrT2JzZXJ2YWJsZXMgPSBuZXcgTWFwPHN0cmluZywgUmV0dXJuVHlwZTx0eXBlb2Ygb2JzZXJ2YWJsZVZhbHVlPHN0cmluZyB8IHVuZGVmaW5lZD4+PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9icm93c2VyVXJsczogTWFwPHN0cmluZywgc3RyaW5nPjtcblx0cHJpdmF0ZSByZWFkb25seSBfYnJvd3NlclVybE9ic2VydmFibGVzID0gbmV3IE1hcDxzdHJpbmcsIFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxzdHJpbmcgfCB1bmRlZmluZWQ+Pj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcGlubmVkQnJvd3NlcnM6IFNldDxzdHJpbmc+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9waW5uZWRCcm93c2VyT2JzZXJ2YWJsZXMgPSBuZXcgTWFwPHN0cmluZywgUmV0dXJuVHlwZTx0eXBlb2Ygb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+Pj4oKTtcblxuXHRwcml2YXRlIF93YXRjaGVkUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbGFzdFJlZnJlc2hlZEZvbGRlcjogVVJJIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUpTT05FZGl0aW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9qc29uRWRpdGluZ1NlcnZpY2U6IElKU09ORWRpdGluZ1NlcnZpY2UsXG5cdFx0QElQcmVmZXJlbmNlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJlZmVyZW5jZXNTZXJ2aWNlOiBJUHJlZmVyZW5jZXNTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvblRhc2tSdW5uZXJSZWdpc3RyeSBwcml2YXRlIHJlYWRvbmx5IF90YXNrUnVubmVyUmVnaXN0cnk6IElTZXNzaW9uVGFza1J1bm5lclJlZ2lzdHJ5LFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9waW5uZWRUYXNrTGFiZWxzID0gdGhpcy5fbG9hZFBpbm5lZFRhc2tMYWJlbHMoKTtcblx0XHR0aGlzLl9icm93c2VyVXJscyA9IHRoaXMuX2xvYWRCcm93c2VyVXJscygpO1xuXHRcdHRoaXMuX3Bpbm5lZEJyb3dzZXJzID0gdGhpcy5fbG9hZFBpbm5lZEJyb3dzZXJzKCk7XG5cdH1cblxuXHRnZXRTZXNzaW9uVGFza3Moc2Vzc2lvbjogSVNlc3Npb24pOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJU2Vzc2lvblRhc2tXaXRoVGFyZ2V0W10+IHtcblx0XHRjb25zdCBmb2xkZXIgPSB0aGlzLl9nZXRTZXNzaW9uRm9sZGVyKHNlc3Npb24pO1xuXHRcdHRoaXMuX2Vuc3VyZUZpbGVXYXRjaChmb2xkZXIpO1xuXHRcdC8vIFRyaWdnZXIgaW5pdGlhbCByZWFkIG9ubHkgd2hlbiB0aGUgZm9sZGVyIGNoYW5nZXM7IHRoZSBmaWxlIHdhdGNoZXIgaGFuZGxlcyBzdWJzZXF1ZW50IHVwZGF0ZXNcblx0XHRpZiAoIWlzRXF1YWwodGhpcy5fbGFzdFJlZnJlc2hlZEZvbGRlciwgZm9sZGVyKSkge1xuXHRcdFx0dGhpcy5fbGFzdFJlZnJlc2hlZEZvbGRlciA9IGZvbGRlcjtcblx0XHRcdHRoaXMuX3JlZnJlc2hTZXNzaW9uVGFza3MoZm9sZGVyKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Nlc3Npb25UYXNrcztcblx0fVxuXG5cdGFzeW5jIGdldFNlc3Npb25UYXNrc09uY2Uoc2Vzc2lvbjogSVNlc3Npb24pOiBQcm9taXNlPHJlYWRvbmx5IElTZXNzaW9uVGFza1dpdGhUYXJnZXRbXT4ge1xuXHRcdHJldHVybiB0aGlzLl9yZWFkVGFza3NGcm9tQm90aFRhcmdldHMoc2Vzc2lvbiwgdCA9PiAhIXQuaW5BZ2VudHMpO1xuXHR9XG5cblx0YXN5bmMgZ2V0QWxsVGFza3Moc2Vzc2lvbjogSVNlc3Npb24pOiBQcm9taXNlPHJlYWRvbmx5IElTZXNzaW9uVGFza1dpdGhUYXJnZXRbXT4ge1xuXHRcdHJldHVybiB0aGlzLl9yZWFkVGFza3NGcm9tQm90aFRhcmdldHMoc2Vzc2lvbiwgKCkgPT4gdHJ1ZSk7XG5cdH1cblxuXHRhc3luYyBnZXROb25TZXNzaW9uVGFza3Moc2Vzc2lvbjogSVNlc3Npb24pOiBQcm9taXNlPHJlYWRvbmx5IElOb25TZXNzaW9uVGFza0VudHJ5W10+IHtcblx0XHRyZXR1cm4gdGhpcy5fcmVhZFRhc2tzRnJvbUJvdGhUYXJnZXRzKHNlc3Npb24sIHQgPT4gIXQuaW5BZ2VudHMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlYWRzIHRhc2tzIGZyb20gYm90aCB3b3Jrc3BhY2UgYW5kIHVzZXIgYHRhc2tzLmpzb25gIGZvciBhIHNlc3Npb24sXG5cdCAqIGZpbHRlcmluZyBlYWNoIGVudHJ5IHRocm91Z2ggYHByZWRpY2F0ZWAgKGluIGFkZGl0aW9uIHRvIHRoZSBzdXBwb3J0ZWQtdHlwZVxuXHQgKiBjaGVjaykgYW5kIHRhZ2dpbmcgaXQgd2l0aCBpdHMgc3RvcmFnZSB0YXJnZXQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZWFkVGFza3NGcm9tQm90aFRhcmdldHMoc2Vzc2lvbjogSVNlc3Npb24sIHByZWRpY2F0ZTogKHRhc2s6IElUYXNrRW50cnkpID0+IGJvb2xlYW4pOiBQcm9taXNlPElTZXNzaW9uVGFza1dpdGhUYXJnZXRbXT4ge1xuXHRcdGNvbnN0IHJlc3VsdDogSVNlc3Npb25UYXNrV2l0aFRhcmdldFtdID0gW107XG5cdFx0Y29uc3QgdGFyZ2V0czogVGFza1N0b3JhZ2VUYXJnZXRbXSA9IFsnd29ya3NwYWNlJywgJ3VzZXInXTtcblx0XHRmb3IgKGNvbnN0IHRhcmdldCBvZiB0YXJnZXRzKSB7XG5cdFx0XHRjb25zdCB1cmkgPSB0aGlzLl9nZXRUYXNrc0pzb25Vcmkoc2Vzc2lvbiwgdGFyZ2V0KTtcblx0XHRcdGlmICghdXJpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QganNvbiA9IGF3YWl0IHRoaXMuX3JlYWRUYXNrc0pzb24odXJpKTtcblx0XHRcdGZvciAoY29uc3QgdGFzayBvZiBqc29uLnRhc2tzID8/IFtdKSB7XG5cdFx0XHRcdGlmIChwcmVkaWNhdGUodGFzaykgJiYgdGhpcy5faXNTdXBwb3J0ZWRUYXNrKHRhc2spKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goeyB0YXNrLCB0YXJnZXQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGFzeW5jIGFkZFRhc2tUb1Nlc3Npb25zKHRhc2s6IElUYXNrRW50cnksIHNlc3Npb246IElTZXNzaW9uLCB0YXJnZXQ6IFRhc2tTdG9yYWdlVGFyZ2V0LCBvcHRpb25zPzogSVRhc2tSdW5PcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdGFza3NKc29uVXJpID0gdGhpcy5fZ2V0VGFza3NKc29uVXJpKHNlc3Npb24sIHRhcmdldCk7XG5cdFx0aWYgKCF0YXNrc0pzb25VcmkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0YXNrc0pzb24gPSBhd2FpdCB0aGlzLl9yZWFkVGFza3NKc29uKHRhc2tzSnNvblVyaSk7XG5cdFx0Y29uc3QgdGFza3MgPSB0YXNrc0pzb24udGFza3MgPz8gW107XG5cdFx0Y29uc3QgaW5kZXggPSB0YXNrcy5maW5kSW5kZXgodCA9PiB0LmxhYmVsID09PSB0YXNrLmxhYmVsKTtcblx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdHM6IHsgcGF0aDogKHN0cmluZyB8IG51bWJlcilbXTsgdmFsdWU6IHVua25vd24gfVtdID0gW1xuXHRcdFx0eyBwYXRoOiBbJ3Rhc2tzJywgaW5kZXgsICdpbkFnZW50cyddLCB2YWx1ZTogdHJ1ZSB9LFxuXHRcdF07XG5cblx0XHRpZiAob3B0aW9ucykge1xuXHRcdFx0ZWRpdHMucHVzaCh7XG5cdFx0XHRcdHBhdGg6IFsndGFza3MnLCBpbmRleCwgJ3J1bk9wdGlvbnMnXSxcblx0XHRcdFx0dmFsdWU6IG9wdGlvbnMucnVuT24gJiYgb3B0aW9ucy5ydW5PbiAhPT0gJ2RlZmF1bHQnID8geyBydW5Pbjogb3B0aW9ucy5ydW5PbiB9IDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5fanNvbkVkaXRpbmdTZXJ2aWNlLndyaXRlKHRhc2tzSnNvblVyaSwgZWRpdHMsIHRydWUpO1xuXHR9XG5cblx0YXN5bmMgY3JlYXRlQW5kQWRkVGFzayhsYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkLCBjb21tYW5kOiBzdHJpbmcsIHNlc3Npb246IElTZXNzaW9uLCB0YXJnZXQ6IFRhc2tTdG9yYWdlVGFyZ2V0LCBvcHRpb25zPzogSVRhc2tSdW5PcHRpb25zKTogUHJvbWlzZTxJVGFza0VudHJ5IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgdGFza3NKc29uVXJpID0gdGhpcy5fZ2V0VGFza3NKc29uVXJpKHNlc3Npb24sIHRhcmdldCk7XG5cdFx0aWYgKCF0YXNrc0pzb25VcmkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFza3NKc29uID0gYXdhaXQgdGhpcy5fcmVhZFRhc2tzSnNvbih0YXNrc0pzb25VcmkpO1xuXHRcdGNvbnN0IHRhc2tzID0gdGFza3NKc29uLnRhc2tzID8/IFtdO1xuXHRcdGNvbnN0IHJlc29sdmVkTGFiZWwgPSBsYWJlbD8udHJpbSgpIHx8IGNvbW1hbmQ7XG5cdFx0Y29uc3QgbmV3VGFzazogSVRhc2tFbnRyeSA9IHtcblx0XHRcdGxhYmVsOiByZXNvbHZlZExhYmVsLFxuXHRcdFx0dHlwZTogJ3NoZWxsJyxcblx0XHRcdGNvbW1hbmQsXG5cdFx0XHRpbkFnZW50czogdHJ1ZSxcblx0XHRcdC4uLihvcHRpb25zPy5ydW5PbiAmJiBvcHRpb25zLnJ1bk9uICE9PSAnZGVmYXVsdCcgPyB7IHJ1bk9wdGlvbnM6IHsgcnVuT246IG9wdGlvbnMucnVuT24gfSB9IDoge30pLFxuXHRcdH07XG5cblx0XHRhd2FpdCB0aGlzLl9qc29uRWRpdGluZ1NlcnZpY2Uud3JpdGUodGFza3NKc29uVXJpLCBbXG5cdFx0XHR7IHBhdGg6IFsndmVyc2lvbiddLCB2YWx1ZTogdGFza3NKc29uLnZlcnNpb24gPz8gJzIuMC4wJyB9LFxuXHRcdFx0eyBwYXRoOiBbJ3Rhc2tzJ10sIHZhbHVlOiBbLi4udGFza3MsIG5ld1Rhc2tdIH1cblx0XHRdLCB0cnVlKTtcblxuXHRcdHJldHVybiBuZXdUYXNrO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlVGFzayhvcmlnaW5hbFRhc2tMYWJlbDogc3RyaW5nLCB1cGRhdGVkVGFzazogSVRhc2tFbnRyeSwgc2Vzc2lvbjogSVNlc3Npb24sIGN1cnJlbnRUYXJnZXQ6IFRhc2tTdG9yYWdlVGFyZ2V0LCBuZXdUYXJnZXQ6IFRhc2tTdG9yYWdlVGFyZ2V0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY3VycmVudFRhc2tzSnNvblVyaSA9IHRoaXMuX2dldFRhc2tzSnNvblVyaShzZXNzaW9uLCBjdXJyZW50VGFyZ2V0KTtcblx0XHRjb25zdCBuZXdUYXNrc0pzb25VcmkgPSB0aGlzLl9nZXRUYXNrc0pzb25Vcmkoc2Vzc2lvbiwgbmV3VGFyZ2V0KTtcblx0XHRpZiAoIWN1cnJlbnRUYXNrc0pzb25VcmkgfHwgIW5ld1Rhc2tzSnNvblVyaSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGN1cnJlbnRUYXNrc0pzb24gPSBhd2FpdCB0aGlzLl9yZWFkVGFza3NKc29uKGN1cnJlbnRUYXNrc0pzb25VcmkpO1xuXHRcdGNvbnN0IGN1cnJlbnRUYXNrcyA9IGN1cnJlbnRUYXNrc0pzb24udGFza3MgPz8gW107XG5cdFx0Y29uc3QgY3VycmVudEluZGV4ID0gY3VycmVudFRhc2tzLmZpbmRJbmRleCh0YXNrID0+IHRhc2subGFiZWwgPT09IG9yaWdpbmFsVGFza0xhYmVsKTtcblx0XHRpZiAoY3VycmVudEluZGV4ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChjdXJyZW50VGFza3NKc29uVXJpLnRvU3RyaW5nKCkgPT09IG5ld1Rhc2tzSnNvblVyaS50b1N0cmluZygpKSB7XG5cdFx0XHRjb25zdCB1cGRhdGVkVGFza3MgPSBjdXJyZW50VGFza3MubWFwKCh0YXNrLCBpKSA9PiBpID09PSBjdXJyZW50SW5kZXggPyB1cGRhdGVkVGFzayA6IHRhc2spO1xuXHRcdFx0YXdhaXQgdGhpcy5fanNvbkVkaXRpbmdTZXJ2aWNlLndyaXRlKGN1cnJlbnRUYXNrc0pzb25VcmksIFtcblx0XHRcdFx0eyBwYXRoOiBbJ3Rhc2tzJ10sIHZhbHVlOiB1cGRhdGVkVGFza3MgfSxcblx0XHRcdF0sIHRydWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBuZXdUYXNrc0pzb24gPSBhd2FpdCB0aGlzLl9yZWFkVGFza3NKc29uKG5ld1Rhc2tzSnNvblVyaSk7XG5cdFx0XHRjb25zdCBuZXdUYXNrcyA9IG5ld1Rhc2tzSnNvbi50YXNrcyA/PyBbXTtcblxuXHRcdFx0YXdhaXQgdGhpcy5fanNvbkVkaXRpbmdTZXJ2aWNlLndyaXRlKGN1cnJlbnRUYXNrc0pzb25VcmksIFtcblx0XHRcdFx0eyBwYXRoOiBbJ3Rhc2tzJ10sIHZhbHVlOiBjdXJyZW50VGFza3MuZmlsdGVyKChfLCB0YXNrSW5kZXgpID0+IHRhc2tJbmRleCAhPT0gY3VycmVudEluZGV4KSB9LFxuXHRcdFx0XSwgdHJ1ZSk7XG5cblx0XHRcdGF3YWl0IHRoaXMuX2pzb25FZGl0aW5nU2VydmljZS53cml0ZShuZXdUYXNrc0pzb25VcmksIFtcblx0XHRcdFx0eyBwYXRoOiBbJ3ZlcnNpb24nXSwgdmFsdWU6IG5ld1Rhc2tzSnNvbi52ZXJzaW9uID8/ICcyLjAuMCcgfSxcblx0XHRcdFx0eyBwYXRoOiBbJ3Rhc2tzJ10sIHZhbHVlOiBbLi4ubmV3VGFza3MsIHVwZGF0ZWRUYXNrXSB9LFxuXHRcdFx0XSwgdHJ1ZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVwb1VyaSA9IHRoaXMuX2dldFNlc3Npb25SZXBvKHNlc3Npb24pPy5yb290O1xuXHRcdGlmIChyZXBvVXJpKSB7XG5cdFx0XHRjb25zdCBrZXkgPSByZXBvVXJpLnRvU3RyaW5nKCk7XG5cdFx0XHRpZiAodGhpcy5fcGlubmVkVGFza0xhYmVscy5nZXQoa2V5KSA9PT0gb3JpZ2luYWxUYXNrTGFiZWwpIHtcblx0XHRcdFx0dGhpcy5fc2V0UGlubmVkVGFza0xhYmVsRm9yS2V5KGtleSwgdXBkYXRlZFRhc2subGFiZWwpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlbW92ZVRhc2sodGFza0xhYmVsOiBzdHJpbmcsIHNlc3Npb246IElTZXNzaW9uLCB0YXJnZXQ6IFRhc2tTdG9yYWdlVGFyZ2V0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdGFza3NKc29uVXJpID0gdGhpcy5fZ2V0VGFza3NKc29uVXJpKHNlc3Npb24sIHRhcmdldCk7XG5cdFx0aWYgKCF0YXNrc0pzb25VcmkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0YXNrc0pzb24gPSBhd2FpdCB0aGlzLl9yZWFkVGFza3NKc29uKHRhc2tzSnNvblVyaSk7XG5cdFx0Y29uc3QgdGFza3MgPSB0YXNrc0pzb24udGFza3MgPz8gW107XG5cdFx0Y29uc3QgaW5kZXggPSB0YXNrcy5maW5kSW5kZXgodCA9PiB0LmxhYmVsID09PSB0YXNrTGFiZWwpO1xuXHRcdGlmIChpbmRleCA9PT0gLTEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLl9qc29uRWRpdGluZ1NlcnZpY2Uud3JpdGUodGFza3NKc29uVXJpLCBbXG5cdFx0XHR7IHBhdGg6IFsndGFza3MnXSwgdmFsdWU6IHRhc2tzLmZpbHRlcigoXywgdGFza0luZGV4KSA9PiB0YXNrSW5kZXggIT09IGluZGV4KSB9LFxuXHRcdF0sIHRydWUpO1xuXG5cdFx0Y29uc3QgcmVwb1VyaSA9IHRoaXMuX2dldFNlc3Npb25SZXBvKHNlc3Npb24pPy5yb290O1xuXHRcdGlmIChyZXBvVXJpKSB7XG5cdFx0XHRjb25zdCBrZXkgPSByZXBvVXJpLnRvU3RyaW5nKCk7XG5cdFx0XHRpZiAodGhpcy5fcGlubmVkVGFza0xhYmVscy5nZXQoa2V5KSA9PT0gdGFza0xhYmVsKSB7XG5cdFx0XHRcdHRoaXMuX3NldFBpbm5lZFRhc2tMYWJlbEZvcktleShrZXksIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcnVuVGFzayh0YXNrOiBJVGFza0VudHJ5LCBzZXNzaW9uOiBJU2Vzc2lvbik6IFByb21pc2U8SURpc3Bvc2FibGUgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBydW5uZXIgPSB0aGlzLl90YXNrUnVubmVyUmVnaXN0cnkuZ2V0UnVubmVyKHNlc3Npb24pO1xuXHRcdGlmICghcnVubmVyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCBydW5uZXIucnVuVGFzayh0YXNrLCBzZXNzaW9uKTtcblx0XHR0aGlzLl9vbkRpZFJ1blRhc2suZmlyZSh7IHRhc2ssIHNlc3Npb24gfSk7XG5cdFx0cmV0dXJuIGhhbmRsZTtcblx0fVxuXG5cdGdldFBpbm5lZFRhc2tMYWJlbChyZXBvc2l0b3J5OiBVUkkgfCB1bmRlZmluZWQpOiBJT2JzZXJ2YWJsZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXJlcG9zaXRvcnkpIHtcblx0XHRcdHJldHVybiBvYnNlcnZhYmxlVmFsdWUoJ3Bpbm5lZFRhc2tMYWJlbCcsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qga2V5ID0gcmVwb3NpdG9yeS50b1N0cmluZygpO1xuXHRcdGxldCBvYnMgPSB0aGlzLl9waW5uZWRUYXNrT2JzZXJ2YWJsZXMuZ2V0KGtleSk7XG5cdFx0aWYgKCFvYnMpIHtcblx0XHRcdG9icyA9IG9ic2VydmFibGVWYWx1ZSgncGlubmVkVGFza0xhYmVsJywgdGhpcy5fcGlubmVkVGFza0xhYmVscy5nZXQoa2V5KSk7XG5cdFx0XHR0aGlzLl9waW5uZWRUYXNrT2JzZXJ2YWJsZXMuc2V0KGtleSwgb2JzKTtcblx0XHR9XG5cdFx0cmV0dXJuIG9icztcblx0fVxuXG5cdHNldFBpbm5lZFRhc2tMYWJlbChyZXBvc2l0b3J5OiBVUkkgfCB1bmRlZmluZWQsIHRhc2tMYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCFyZXBvc2l0b3J5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qga2V5ID0gcmVwb3NpdG9yeS50b1N0cmluZygpO1xuXHRcdHRoaXMuX3NldFBpbm5lZFRhc2tMYWJlbEZvcktleShrZXksIHRhc2tMYWJlbCk7XG5cdFx0aWYgKHRhc2tMYWJlbCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9zZXRQaW5uZWRCcm93c2VyRm9yS2V5KGtleSwgZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdGdldEJyb3dzZXJVcmwocmVwb3NpdG9yeTogVVJJIHwgdW5kZWZpbmVkKTogSU9ic2VydmFibGU8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCFyZXBvc2l0b3J5KSB7XG5cdFx0XHRyZXR1cm4gb2JzZXJ2YWJsZVZhbHVlKCdicm93c2VyVXJsJywgdW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHRjb25zdCBrZXkgPSByZXBvc2l0b3J5LnRvU3RyaW5nKCk7XG5cdFx0bGV0IG9icyA9IHRoaXMuX2Jyb3dzZXJVcmxPYnNlcnZhYmxlcy5nZXQoa2V5KTtcblx0XHRpZiAoIW9icykge1xuXHRcdFx0b2JzID0gb2JzZXJ2YWJsZVZhbHVlKCdicm93c2VyVXJsJywgdGhpcy5fYnJvd3NlclVybHMuZ2V0KGtleSkpO1xuXHRcdFx0dGhpcy5fYnJvd3NlclVybE9ic2VydmFibGVzLnNldChrZXksIG9icyk7XG5cdFx0fVxuXHRcdHJldHVybiBvYnM7XG5cdH1cblxuXHRzZXRCcm93c2VyVXJsKHJlcG9zaXRvcnk6IFVSSSB8IHVuZGVmaW5lZCwgdXJsOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoIXJlcG9zaXRvcnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBrZXkgPSByZXBvc2l0b3J5LnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgdHJpbW1lZCA9IHVybD8udHJpbSgpO1xuXHRcdGlmICghdHJpbW1lZCkge1xuXHRcdFx0dGhpcy5fYnJvd3NlclVybHMuZGVsZXRlKGtleSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2Jyb3dzZXJVcmxzLnNldChrZXksIHRyaW1tZWQpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3NhdmVCcm93c2VyVXJscygpO1xuXG5cdFx0Y29uc3Qgb2JzID0gdGhpcy5fYnJvd3NlclVybE9ic2VydmFibGVzLmdldChrZXkpO1xuXHRcdGlmIChvYnMpIHtcblx0XHRcdHRyYW5zYWN0aW9uKHR4ID0+IG9icy5zZXQodHJpbW1lZCB8fCB1bmRlZmluZWQsIHR4KSk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0UGlubmVkQnJvd3NlcihyZXBvc2l0b3J5OiBVUkkgfCB1bmRlZmluZWQpOiBJT2JzZXJ2YWJsZTxib29sZWFuPiB7XG5cdFx0aWYgKCFyZXBvc2l0b3J5KSB7XG5cdFx0XHRyZXR1cm4gb2JzZXJ2YWJsZVZhbHVlKCdwaW5uZWRCcm93c2VyJywgZmFsc2UpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGtleSA9IHJlcG9zaXRvcnkudG9TdHJpbmcoKTtcblx0XHRsZXQgb2JzID0gdGhpcy5fcGlubmVkQnJvd3Nlck9ic2VydmFibGVzLmdldChrZXkpO1xuXHRcdGlmICghb2JzKSB7XG5cdFx0XHRvYnMgPSBvYnNlcnZhYmxlVmFsdWUoJ3Bpbm5lZEJyb3dzZXInLCB0aGlzLl9waW5uZWRCcm93c2Vycy5oYXMoa2V5KSk7XG5cdFx0XHR0aGlzLl9waW5uZWRCcm93c2VyT2JzZXJ2YWJsZXMuc2V0KGtleSwgb2JzKTtcblx0XHR9XG5cdFx0cmV0dXJuIG9icztcblx0fVxuXG5cdHNldFBpbm5lZEJyb3dzZXIocmVwb3NpdG9yeTogVVJJIHwgdW5kZWZpbmVkLCBwaW5uZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoIXJlcG9zaXRvcnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBrZXkgPSByZXBvc2l0b3J5LnRvU3RyaW5nKCk7XG5cdFx0dGhpcy5fc2V0UGlubmVkQnJvd3NlckZvcktleShrZXksIHBpbm5lZCk7XG5cdFx0aWYgKHBpbm5lZCkge1xuXHRcdFx0dGhpcy5fc2V0UGlubmVkVGFza0xhYmVsRm9yS2V5KGtleSwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0gcHJpdmF0ZSBoZWxwZXJzIC0tLVxuXG5cdHByaXZhdGUgX2dldFNlc3Npb25SZXBvKHNlc3Npb246IElTZXNzaW9uKSB7XG5cdFx0cmV0dXJuIHNlc3Npb24ud29ya3NwYWNlLmdldCgpPy5mb2xkZXJzWzBdO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0U2Vzc2lvbkZvbGRlcihzZXNzaW9uOiBJU2Vzc2lvbik6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVwbyA9IHRoaXMuX2dldFNlc3Npb25SZXBvKHNlc3Npb24pO1xuXHRcdHJldHVybiByZXBvPy53b3JraW5nRGlyZWN0b3J5ID8/IHJlcG8/LnJvb3Q7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRUYXNrc0pzb25Vcmkoc2Vzc2lvbjogSVNlc3Npb24sIHRhcmdldDogVGFza1N0b3JhZ2VUYXJnZXQpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0YXJnZXQgPT09ICd3b3Jrc3BhY2UnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZ2V0V29ya3NwYWNlVGFza3NKc29uVXJpKHRoaXMuX2dldFNlc3Npb25Gb2xkZXIoc2Vzc2lvbikpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZ2V0VXNlclRhc2tzSnNvblVyaSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0V29ya3NwYWNlVGFza3NKc29uVXJpKGZvbGRlcjogVVJJIHwgdW5kZWZpbmVkKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gZm9sZGVyPy5wYXRoID8gam9pblBhdGgoZm9sZGVyLCAnLnZzY29kZScsICd0YXNrcy5qc29uJykgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRVc2VyVGFza3NKc29uVXJpKCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdXNlclNldHRpbmdzUmVzb3VyY2UgPSB0aGlzLl9wcmVmZXJlbmNlc1NlcnZpY2UudXNlclNldHRpbmdzUmVzb3VyY2U7XG5cdFx0aWYgKCF1c2VyU2V0dGluZ3NSZXNvdXJjZS5wYXRoKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVzZXJTZXR0aW5nc0ZvbGRlciA9IGRpcm5hbWUodXNlclNldHRpbmdzUmVzb3VyY2UpO1xuXHRcdHJldHVybiB1c2VyU2V0dGluZ3NGb2xkZXIucGF0aCA/IGpvaW5QYXRoKHVzZXJTZXR0aW5nc0ZvbGRlciwgJ3Rhc2tzLmpzb24nKSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlYWRUYXNrc0pzb24odXJpOiBVUkkpOiBQcm9taXNlPElUYXNrc0pzb24+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlYWRGaWxlKHVyaSk7XG5cdFx0XHRyZXR1cm4gcGFyc2U8SVRhc2tzSnNvbj4oY29udGVudC52YWx1ZS50b1N0cmluZygpKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB7fTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9pc1N1cHBvcnRlZFRhc2sodGFzazogSVRhc2tFbnRyeSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRhc2subGFiZWw7XG5cdH1cblxuXHRwcml2YXRlIF9lbnN1cmVGaWxlV2F0Y2goZm9sZGVyOiBVUkkgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCB0YXNrc1VyaSA9IHRoaXMuX2dldFdvcmtzcGFjZVRhc2tzSnNvblVyaShmb2xkZXIpO1xuXHRcdGlmICghdGFza3NVcmkpIHtcblx0XHRcdHRoaXMuX3dhdGNoZWRSZXNvdXJjZSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2ZpbGVXYXRjaGVyLmNsZWFyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3dhdGNoZWRSZXNvdXJjZSAmJiB0aGlzLl93YXRjaGVkUmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gdGFza3NVcmkudG9TdHJpbmcoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl93YXRjaGVkUmVzb3VyY2UgPSB0YXNrc1VyaTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Ly8gV2F0Y2ggd29ya3NwYWNlIHRhc2tzLmpzb25cblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5fZmlsZVNlcnZpY2Uud2F0Y2godGFza3NVcmkpKTtcblxuXHRcdC8vIEFsc28gd2F0Y2ggdXNlci1sZXZlbCB0YXNrcy5qc29uIHNvIHRoYXQgdXNlciBzZXNzaW9uIHRhc2tzIGNoYW5nZXMgcmVmcmVzaCB0aGUgb2JzZXJ2YWJsZVxuXHRcdGNvbnN0IHVzZXJVcmkgPSB0aGlzLl9nZXRVc2VyVGFza3NKc29uVXJpKCk7XG5cdFx0aWYgKHVzZXJVcmkpIHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLl9maWxlU2VydmljZS53YXRjaCh1c2VyVXJpKSk7XG5cdFx0fVxuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2ZpbGVTZXJ2aWNlLm9uRGlkRmlsZXNDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzKHRhc2tzVXJpKSB8fCAodXNlclVyaSAmJiBlLmFmZmVjdHModXNlclVyaSkpKSB7XG5cdFx0XHRcdHRoaXMuX3JlZnJlc2hTZXNzaW9uVGFza3MoZm9sZGVyKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9maWxlV2F0Y2hlci52YWx1ZSA9IGRpc3Bvc2FibGVzO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVmcmVzaFNlc3Npb25UYXNrcyhmb2xkZXI6IFVSSSB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghZm9sZGVyKSB7XG5cdFx0XHR0cmFuc2FjdGlvbih0eCA9PiB0aGlzLl9zZXNzaW9uVGFza3Muc2V0KFtdLCB0eCkpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhc2tzVXJpID0gdGhpcy5fZ2V0V29ya3NwYWNlVGFza3NKc29uVXJpKGZvbGRlcik7XG5cdFx0Y29uc3QgdGFza3NKc29uID0gdGFza3NVcmkgPyBhd2FpdCB0aGlzLl9yZWFkVGFza3NKc29uKHRhc2tzVXJpKSA6IHt9O1xuXHRcdGNvbnN0IHNlc3Npb25UYXNrczogSVNlc3Npb25UYXNrV2l0aFRhcmdldFtdID0gKHRhc2tzSnNvbi50YXNrcyA/PyBbXSlcblx0XHRcdC5maWx0ZXIodCA9PiB0LmluQWdlbnRzICYmIHRoaXMuX2lzU3VwcG9ydGVkVGFzayh0KSlcblx0XHRcdC5tYXAodCA9PiAoeyB0YXNrOiB0LCB0YXJnZXQ6ICd3b3Jrc3BhY2UnIGFzIFRhc2tTdG9yYWdlVGFyZ2V0IH0pKTtcblxuXHRcdC8vIEFsc28gaW5jbHVkZSB1c2VyLWxldmVsIHNlc3Npb24gdGFza3Ncblx0XHRjb25zdCB1c2VyVXJpID0gdGhpcy5fZ2V0VXNlclRhc2tzSnNvblVyaSgpO1xuXHRcdGNvbnN0IHVzZXJKc29uID0gdXNlclVyaSA/IGF3YWl0IHRoaXMuX3JlYWRUYXNrc0pzb24odXNlclVyaSkgOiB7fTtcblx0XHRjb25zdCB1c2VyU2Vzc2lvblRhc2tzOiBJU2Vzc2lvblRhc2tXaXRoVGFyZ2V0W10gPSAodXNlckpzb24udGFza3MgPz8gW10pXG5cdFx0XHQuZmlsdGVyKHQgPT4gdC5pbkFnZW50cyAmJiB0aGlzLl9pc1N1cHBvcnRlZFRhc2sodCkpXG5cdFx0XHQubWFwKHQgPT4gKHsgdGFzazogdCwgdGFyZ2V0OiAndXNlcicgYXMgVGFza1N0b3JhZ2VUYXJnZXQgfSkpO1xuXG5cdFx0dHJhbnNhY3Rpb24odHggPT4gdGhpcy5fc2Vzc2lvblRhc2tzLnNldChbLi4uc2Vzc2lvblRhc2tzLCAuLi51c2VyU2Vzc2lvblRhc2tzXSwgdHgpKTtcblx0fVxuXG5cdHByaXZhdGUgX2xvYWRQaW5uZWRUYXNrTGFiZWxzKCk6IE1hcDxzdHJpbmcsIHN0cmluZz4ge1xuXHRcdGNvbnN0IHJhdyA9IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldChTZXNzaW9uc1Rhc2tzU2VydmljZS5fUElOTkVEX1RBU0tfTEFCRUxTX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRpZiAocmF3KSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IE1hcChPYmplY3QuZW50cmllcyhKU09OLnBhcnNlKHJhdykpKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBpZ25vcmUgY29ycnVwdCBkYXRhXG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgTWFwKCk7XG5cdH1cblxuXHRwcml2YXRlIF9zYXZlUGlubmVkVGFza0xhYmVscygpOiB2b2lkIHtcblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShcblx0XHRcdFNlc3Npb25zVGFza3NTZXJ2aWNlLl9QSU5ORURfVEFTS19MQUJFTFNfS0VZLFxuXHRcdFx0SlNPTi5zdHJpbmdpZnkoT2JqZWN0LmZyb21FbnRyaWVzKHRoaXMuX3Bpbm5lZFRhc2tMYWJlbHMpKSxcblx0XHRcdFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTixcblx0XHRcdFN0b3JhZ2VUYXJnZXQuVVNFUlxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRQaW5uZWRUYXNrTGFiZWxGb3JLZXkoa2V5OiBzdHJpbmcsIHRhc2tMYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHRhc2tMYWJlbCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9waW5uZWRUYXNrTGFiZWxzLmRlbGV0ZShrZXkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9waW5uZWRUYXNrTGFiZWxzLnNldChrZXksIHRhc2tMYWJlbCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2F2ZVBpbm5lZFRhc2tMYWJlbHMoKTtcblxuXHRcdGNvbnN0IG9icyA9IHRoaXMuX3Bpbm5lZFRhc2tPYnNlcnZhYmxlcy5nZXQoa2V5KTtcblx0XHRpZiAob2JzKSB7XG5cdFx0XHR0cmFuc2FjdGlvbih0eCA9PiBvYnMuc2V0KHRhc2tMYWJlbCwgdHgpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9sb2FkQnJvd3NlclVybHMoKTogTWFwPHN0cmluZywgc3RyaW5nPiB7XG5cdFx0Y29uc3QgcmF3ID0gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0KFNlc3Npb25zVGFza3NTZXJ2aWNlLl9CUk9XU0VSX1VSTFNfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdGlmIChyYXcpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiBuZXcgTWFwKE9iamVjdC5lbnRyaWVzKEpTT04ucGFyc2UocmF3KSkpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIGlnbm9yZSBjb3JydXB0IGRhdGFcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBNYXAoKTtcblx0fVxuXG5cdHByaXZhdGUgX3NhdmVCcm93c2VyVXJscygpOiB2b2lkIHtcblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShcblx0XHRcdFNlc3Npb25zVGFza3NTZXJ2aWNlLl9CUk9XU0VSX1VSTFNfS0VZLFxuXHRcdFx0SlNPTi5zdHJpbmdpZnkoT2JqZWN0LmZyb21FbnRyaWVzKHRoaXMuX2Jyb3dzZXJVcmxzKSksXG5cdFx0XHRTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHRTdG9yYWdlVGFyZ2V0LlVTRVJcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbG9hZFBpbm5lZEJyb3dzZXJzKCk6IFNldDxzdHJpbmc+IHtcblx0XHRjb25zdCByYXcgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXQoU2Vzc2lvbnNUYXNrc1NlcnZpY2UuX1BJTk5FRF9CUk9XU0VSU19LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0aWYgKHJhdykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgYXJyID0gSlNPTi5wYXJzZShyYXcpO1xuXHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheShhcnIpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBTZXQoYXJyKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIGlnbm9yZSBjb3JydXB0IGRhdGFcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBTZXQoKTtcblx0fVxuXG5cdHByaXZhdGUgX3NhdmVQaW5uZWRCcm93c2VycygpOiB2b2lkIHtcblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShcblx0XHRcdFNlc3Npb25zVGFza3NTZXJ2aWNlLl9QSU5ORURfQlJPV1NFUlNfS0VZLFxuXHRcdFx0SlNPTi5zdHJpbmdpZnkoWy4uLnRoaXMuX3Bpbm5lZEJyb3dzZXJzXSksXG5cdFx0XHRTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHRTdG9yYWdlVGFyZ2V0LlVTRVJcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0UGlubmVkQnJvd3NlckZvcktleShrZXk6IHN0cmluZywgcGlubmVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHBpbm5lZCkge1xuXHRcdFx0dGhpcy5fcGlubmVkQnJvd3NlcnMuYWRkKGtleSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3Bpbm5lZEJyb3dzZXJzLmRlbGV0ZShrZXkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3NhdmVQaW5uZWRCcm93c2VycygpO1xuXG5cdFx0Y29uc3Qgb2JzID0gdGhpcy5fcGlubmVkQnJvd3Nlck9ic2VydmFibGVzLmdldChrZXkpO1xuXHRcdGlmIChvYnMpIHtcblx0XHRcdHRy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
