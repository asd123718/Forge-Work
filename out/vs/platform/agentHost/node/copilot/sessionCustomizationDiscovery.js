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
import { appendFile, mkdir } from "fs/promises";
import { CancellationError } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ResourceMap, ResourceSet } from "../../../../base/common/map.js";
import { joinPath, dirname as uriDirname, extUriBiasedIgnorePathCase } from "../../../../base/common/resources.js";
import { compare as compareStrings } from "../../../../base/common/strings.js";
import { URI } from "../../../../base/common/uri.js";
import { basename, isAbsolute, dirname as nodeDirname } from "../../../../base/common/path.js";
import { IFileService } from "../../../files/common/files.js";
import { ILogService } from "../../../log/common/log.js";
import { CustomizationLoadStatus, CustomizationType, customizationId } from "../../common/state/sessionState.js";
import { toAgentCustomizationMeta } from "../../common/meta/agentCustomizationMeta.js";
import { raceCancellationError } from "../../../../base/common/async.js";
var DiscoveredType = /* @__PURE__ */ ((DiscoveredType2) => {
  DiscoveredType2["Agent"] = "agent";
  DiscoveredType2["Skill"] = "skill";
  DiscoveredType2["Instruction"] = "instruction";
  DiscoveredType2["Hook"] = "hook";
  DiscoveredType2["AgentInstruction"] = "agentInstruction";
  return DiscoveredType2;
})(DiscoveredType || {});
function areDiscoveredDirectoriesEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    const left = a[i];
    const right = b[i];
    if (left.type !== right.type || left.uri.toString() !== right.uri.toString() || !areDiscoveredFilesEqual(left.files, right.files)) {
      return false;
    }
  }
  return true;
}
function compareDiscoveredDirectory(a, b) {
  const byType = compareStrings(a.type, b.type);
  if (byType !== 0) {
    return byType;
  }
  return compareStrings(a.uri.toString(), b.uri.toString());
}
function areDiscoveredFilesEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    const left = a[i];
    const right = b[i];
    if (left.uri.toString() !== right.uri.toString() || left.etag !== right.etag) {
      return false;
    }
  }
  return true;
}
function compareDiscoveredFile(a, b) {
  return compareStrings(a.uri.toString(), b.uri.toString());
}
function compareDirectoryCustomization(a, b) {
  const byUri = compareStrings(a.uri, b.uri);
  if (byUri !== 0) {
    return byUri;
  }
  return compareStrings(a.contents, b.contents);
}
const MAX_INSTRUCTIONS_RECURSION_DEPTH = 5;
const MAX_HOOKS_RECURSION_DEPTH = 8;
const AGENT_FILE_SUFFIX = ".agent.md";
const MARKDOWN_SUFFIX = ".md";
const INSTRUCTION_FILE_SUFFIX = ".instructions.md";
const HOOK_FILE_SUFFIX = ".json";
const SKILL_FILENAME = "SKILL.md";
const README_FILENAME = "README.md";
const CUSTOMIZATION_DISCOVERY_DEBUG_LOG_PATH = void 0;
const AGENT_INSTRUCTION_FILENAMES = /* @__PURE__ */ new Set(["agents.md", "claude.md", "gemini.md", "copilot-instructions.md"]);
const searchRoots = {
  workspace: [
    { path: [".github", "agents"], type: "agent" /* Agent */, name: ".github" },
    { path: [".claude", "agents"], type: "agent" /* Agent */, name: ".claude" },
    { path: [".github", "skills"], recursive: true, type: "skill" /* Skill */, name: ".github" },
    { path: [".agents", "skills"], recursive: true, type: "skill" /* Skill */, name: ".agents" },
    { path: [".claude", "skills"], recursive: true, type: "skill" /* Skill */, name: ".claude" },
    { path: [".github", "instructions"], recursive: true, type: "instruction" /* Instruction */, name: ".github" },
    { path: [".github", "hooks"], recursive: true, type: "hook" /* Hook */, name: ".github" }
  ],
  user: [
    { path: [".copilot", "agents"], type: "agent" /* Agent */, name: "~/.copilot" },
    { path: [".agents", "skills"], recursive: true, type: "skill" /* Skill */, name: "~/.agents" },
    { path: [".copilot", "skills"], recursive: true, type: "skill" /* Skill */, name: "~/.copilot" },
    { path: [".copilot", "instructions"], recursive: true, type: "instruction" /* Instruction */, name: "~/.copilot" },
    { path: [".copilot", "hooks"], recursive: true, type: "hook" /* Hook */, name: "~/.copilot" }
  ]
};
const fixedDiscoveryFiles = {
  workspace: [
    { path: [".github"], filenames: ["copilot-instructions.md"], type: "agentInstruction" /* AgentInstruction */ },
    { path: [], filenames: ["AGENTS.md", "CLAUDE.md", "GEMINI.md"], type: "agentInstruction" /* AgentInstruction */ },
    { path: [".claude"], filenames: ["CLAUDE.md"], type: "agentInstruction" /* AgentInstruction */ },
    { path: [".github", "copilot"], filenames: ["settings.json", "settings.local.json"], type: "hook" /* Hook */ },
    { path: [".claude"], filenames: ["settings.json", "settings.local.json"], type: "hook" /* Hook */ }
  ],
  user: [
    { path: [".copilot"], filenames: ["copilot-instructions.md"], type: "agentInstruction" /* AgentInstruction */ }
  ]
};
const agentInstructions = fixedDiscoveryFiles;
function throwIfCancelled(token) {
  if (token.isCancellationRequested) {
    throw new CancellationError();
  }
}
function addWatch(map, watchUri, recursive, resourceToWatch) {
  let entry = map.get(watchUri);
  if (!entry) {
    entry = { recursive, resourcesToWatch: new ResourceSet() };
    map.set(watchUri, entry);
  } else if (recursive && !entry.recursive) {
    entry = { recursive: true, resourcesToWatch: entry.resourcesToWatch };
    map.set(watchUri, entry);
  }
  entry.resourcesToWatch.add(resourceToWatch);
}
let SessionCustomizationDiscovery = class extends Disposable {
  constructor(_workingDirectories, _userHome, _pathToUri = URI.file, _fileService, _logService) {
    super();
    this._workingDirectories = _workingDirectories;
    this._userHome = _userHome;
    this._pathToUri = _pathToUri;
    this._fileService = _fileService;
    this._logService = _logService;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._discoveredDirectories = void 0;
    this._watchers = new ResourceMap();
    if (_workingDirectories.length === 0) {
      this.dispose();
      throw new Error("SessionCustomizationDiscovery requires at least one working directory (index 0 = primary root).");
    }
    this._register({ dispose: () => this._disposeAllWatchers() });
    this._register(this._fileService.onDidFilesChange((e) => {
      for (const watcher of this._watchers.values()) {
        for (const uri of watcher.resourcesToWatch) {
          if (e.affects(uri)) {
            this._scheduleRefresh();
            return;
          }
        }
      }
    }));
  }
  _scheduleRefresh() {
    this._onDidChange.fire();
  }
  /**
   * True when `uri` is one of the workspace roots or the user home — i.e. an
   * ancestor-walk boundary. With a single root this is exactly the previous
   * `isEqual(uri, workingDirectory) || isEqual(uri, userHome)` check.
   */
  _isDiscoveryBoundary(uri) {
    if (extUriBiasedIgnorePathCase.isEqual(uri, this._userHome)) {
      return true;
    }
    return this._workingDirectories.some((root) => extUriBiasedIgnorePathCase.isEqual(uri, root));
  }
  /**
   * The workspace root that contains (or equals) `uri`, or `undefined` when it
   * lives under none of them. Prefers the most specific root when roots nest.
   */
  _containingWorkspaceRoot(uri) {
    let best;
    for (const root of this._workingDirectories) {
      if (extUriBiasedIgnorePathCase.isEqualOrParent(uri, root) && (!best || root.path.length > best.path.length)) {
        best = root;
      }
    }
    return best;
  }
  /**
   * Maps an SDK-supplied `projectPath` (an fs path string) back to the original
   * workspace-root {@link URI}, preserving its scheme/authority. Returns
   * `undefined` when the path matches none of the roots.
   */
  _rootForProjectPath(projectPath) {
    if (!projectPath) {
      return void 0;
    }
    const target = this._pathToUri(projectPath);
    return this._workingDirectories.find((root) => extUriBiasedIgnorePathCase.isEqual(root, target));
  }
  /**
   * The working-directory roots that hooks are discovered from.
   *
   * **Hooks are discovered from the PRIMARY working directory only** (index 0 of
   * {@link _workingDirectories}, which callers MUST order primary-first). Hooks
   * from non-primary roots are intentionally NOT discovered because the Copilot
   * agent currently applies hooks from a single primary directory only. Every
   * other customization types (agents, skills, and instructions) are discovered
   * across all roots.
   *
   * Example: for roots `[B, A, C]` (with `B` selected as primary), hooks are
   * discovered from `B` only; hooks under `A`/`C` are ignored.
   *
   * This may expand to all roots in the future — see `MULTI_ROOT_CHANGES.md`.
   */
  get _hookWorkingDirectories() {
    return this._workingDirectories.slice(0, 1);
  }
  async writeCustomizationDiscoveryDebugLog(payload) {
    if (!CUSTOMIZATION_DISCOVERY_DEBUG_LOG_PATH) {
      return;
    }
    try {
      await mkdir(nodeDirname(CUSTOMIZATION_DISCOVERY_DEBUG_LOG_PATH), { recursive: true });
      await appendFile(CUSTOMIZATION_DISCOVERY_DEBUG_LOG_PATH, `${JSON.stringify({
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        ...payload
      }, void 0, 2)}
`, "utf8");
    } catch (err) {
      this._logService.error(`[SessionCustomizationDiscovery] Failed to write discovery debug log: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  async getDiscoveredDirectories(client, token) {
    throwIfCancelled(token);
    const p = { projectPaths: this._workingDirectories.map((uri) => uri.fsPath) };
    const result = this.getHooksDiscoveryPaths();
    const workspaceAgentInstructionFilesByRoot = new ResourceMap();
    const userAgentInstructionFiles = [];
    try {
      const [agentDiscovery, instructionDiscovery, skillDiscovery] = await Promise.all([
        raceCancellationError(client.rpc.agents.getDiscoveryPaths(p), token),
        raceCancellationError(client.rpc.instructions.getDiscoveryPaths(p), token),
        raceCancellationError(client.rpc.skills.getDiscoveryPaths(p), token)
      ]);
      for (const agentPath of agentDiscovery?.paths ?? []) {
        throwIfCancelled(token);
        result.push({
          uri: this._pathToUri(agentPath.path),
          type: "agent" /* Agent */,
          files: [],
          name: basename(agentPath.path),
          writable: true
        });
      }
      for (const instructionPath of instructionDiscovery?.paths ?? []) {
        throwIfCancelled(token);
        if (instructionPath.kind === "file") {
          const fileUri = this._pathToUri(instructionPath.path);
          const discoveredFile = { uri: fileUri, etag: "" };
          const containingRoot = this._containingWorkspaceRoot(fileUri);
          if (containingRoot) {
            const files = workspaceAgentInstructionFilesByRoot.get(containingRoot) ?? [];
            files.push(discoveredFile);
            workspaceAgentInstructionFilesByRoot.set(containingRoot, files);
          } else if (extUriBiasedIgnorePathCase.isEqualOrParent(fileUri, this._userHome)) {
            userAgentInstructionFiles.push(discoveredFile);
          }
          continue;
        } else if (instructionPath.kind === "directory") {
          result.push({
            uri: this._pathToUri(instructionPath.path),
            type: "instruction" /* Instruction */,
            files: [],
            name: basename(instructionPath.path),
            writable: true
          });
        }
      }
      for (const [root, files] of workspaceAgentInstructionFilesByRoot) {
        if (files.length > 0) {
          result.push({
            uri: root,
            type: "agentInstruction" /* AgentInstruction */,
            files,
            name: "",
            writable: false
          });
        }
      }
      if (userAgentInstructionFiles.length > 0) {
        result.push({
          uri: this._userHome,
          type: "agentInstruction" /* AgentInstruction */,
          files: userAgentInstructionFiles,
          name: "",
          writable: false
        });
      }
      for (const skillPath of skillDiscovery?.paths ?? []) {
        throwIfCancelled(token);
        result.push({
          uri: this._pathToUri(skillPath.path),
          type: "skill" /* Skill */,
          files: [],
          name: basename(skillPath.path),
          writable: true
        });
      }
    } catch (err) {
      if (err instanceof CancellationError) {
        throw err;
      }
      this._logService.debug(`[SessionCustomizationDiscovery] Error getting discovery paths: ${err instanceof Error ? err.message : String(err)}`);
    }
    return result.sort(compareDiscoveredDirectory);
  }
  getHooksDiscoveryPaths() {
    const byUri = new ResourceMap();
    const add = (uri, name) => {
      if (!byUri.has(uri)) {
        byUri.set(uri, { uri, type: "hook" /* Hook */, files: [], name, writable: true });
      }
    };
    for (const root of searchRoots.workspace) {
      if (root.type === "hook" /* Hook */) {
        for (const workingDirectory of this._hookWorkingDirectories) {
          add(joinPath(workingDirectory, ...root.path), root.name);
        }
      }
    }
    for (const root of searchRoots.user) {
      if (root.type === "hook" /* Hook */) {
        add(joinPath(this._userHome, ...root.path), root.name);
      }
    }
    for (const root of fixedDiscoveryFiles.workspace) {
      if (root.type === "hook" /* Hook */) {
        for (const workingDirectory of this._hookWorkingDirectories) {
          add(joinPath(workingDirectory, ...root.path), basename(joinPath(workingDirectory, ...root.path).path));
        }
      }
    }
    for (const root of fixedDiscoveryFiles.user) {
      if (root.type === "hook" /* Hook */) {
        add(joinPath(this._userHome, ...root.path), basename(joinPath(this._userHome, ...root.path).path));
      }
    }
    return [...byUri.values()];
  }
  async _updateWatchers(discoveredDirectories, token) {
    const nextWatchRootUris = new ResourceMap();
    const toResolve = new ResourceSet();
    const recursiveByDirectory = new ResourceMap();
    for (const discoveredDir of discoveredDirectories) {
      throwIfCancelled(token);
      const dirUri = discoveredDir.uri;
      const recursive = discoveredDir.type === "skill" /* Skill */ || discoveredDir.type === "instruction" /* Instruction */ || discoveredDir.type === "hook" /* Hook */;
      recursiveByDirectory.set(dirUri, recursive);
      toResolve.add(dirUri);
      let current = dirUri;
      while (!this._isDiscoveryBoundary(current)) {
        const parent = uriDirname(current);
        if (extUriBiasedIgnorePathCase.isEqual(parent, current)) {
          break;
        }
        toResolve.add(parent);
        current = parent;
      }
      for (const file of discoveredDir.files) {
        throwIfCancelled(token);
        let currentFilePath = file.uri;
        while (!this._isDiscoveryBoundary(currentFilePath)) {
          const parent = uriDirname(currentFilePath);
          if (extUriBiasedIgnorePathCase.isEqual(parent, currentFilePath)) {
            break;
          }
          toResolve.add(parent);
          currentFilePath = parent;
        }
      }
    }
    throwIfCancelled(token);
    const toResolveArray = [...toResolve];
    const statResults = await this._fileService.resolveAll(toResolveArray.map((resource) => ({ resource })));
    const existingDirectories = new ResourceSet();
    for (let i = 0; i < statResults.length; i++) {
      const result = statResults[i];
      if (result.success && result.stat?.isDirectory) {
        existingDirectories.add(toResolveArray[i]);
      }
    }
    for (const discoveredDir of discoveredDirectories) {
      throwIfCancelled(token);
      const dirUri = discoveredDir.uri;
      const recursive = recursiveByDirectory.get(dirUri) ?? false;
      if (existingDirectories.has(dirUri)) {
        addWatch(nextWatchRootUris, dirUri, recursive, dirUri);
      }
      let current = dirUri;
      while (!this._isDiscoveryBoundary(current)) {
        const parent = uriDirname(current);
        if (extUriBiasedIgnorePathCase.isEqual(parent, current)) {
          break;
        }
        if (existingDirectories.has(parent)) {
          addWatch(nextWatchRootUris, parent, false, current);
        }
        current = parent;
      }
      for (const file of discoveredDir.files) {
        throwIfCancelled(token);
        let currentFilePath = file.uri;
        while (!this._isDiscoveryBoundary(currentFilePath)) {
          const parent = uriDirname(currentFilePath);
          if (extUriBiasedIgnorePathCase.isEqual(parent, currentFilePath)) {
            break;
          }
          if (existingDirectories.has(parent)) {
            addWatch(nextWatchRootUris, parent, false, currentFilePath);
          }
          currentFilePath = parent;
        }
      }
    }
    this._reconcileWatchers(nextWatchRootUris);
  }
  async discover(client, token) {
    await this.writeCustomizationDiscoveryDebugLog({
      method: "discover",
      workingDirectories: this._workingDirectories.map((d) => d.toString()),
      userHome: this._userHome.toString()
    });
    if (!this._discoveredDirectories) {
      this._discoveredDirectories = await this.getDiscoveredDirectories(client, token);
    }
    throwIfCancelled(token);
    const p = { projectPaths: this._workingDirectories.map((uri) => uri.fsPath) };
    try {
      const [agents, rules, skills, hooks] = await Promise.all([
        this.discoverAgents(p, client, token),
        this.discoverRules(p, client, token),
        this.discoverSkills(p, client, token),
        this.discoverHooks(token),
        this._updateWatchers(this._discoveredDirectories, token)
      ]);
      throwIfCancelled(token);
      const result = [];
      await this.toDirectoryCustomizations(CustomizationType.Agent, agents, this._discoveredDirectories, result);
      await this.toDirectoryCustomizations(CustomizationType.Rule, rules, this._discoveredDirectories, result);
      await this.toDirectoryCustomizations(CustomizationType.Skill, skills, this._discoveredDirectories, result);
      await this.toDirectoryCustomizations(CustomizationType.Hook, hooks, this._discoveredDirectories, result);
      const sortedResult = result.sort(compareDirectoryCustomization);
      await this.writeCustomizationDiscoveryDebugLog({
        method: "discover",
        result: sortedResult.map((customization) => ({
          contents: customization.contents,
          uri: customization.uri,
          children: (customization.children ?? []).map((child) => ({ type: child.type, uri: child.uri, name: child.name }))
        }))
      });
      return sortedResult;
    } catch (err) {
      this._logService.error(`[SessionCustomizationDiscovery] Error during discovery: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }
  async discoverAgents(discoveryRequest, client, token) {
    const agents = [];
    const agentDiscovery = await raceCancellationError(client.rpc.agents.discover(discoveryRequest), token);
    for (const agent of agentDiscovery.agents) {
      if (agent.path) {
        const uri = this._pathToUri(agent.path);
        agents.push({ type: CustomizationType.Agent, uri: uri.toString(), id: agent.id, name: agent.name, description: agent.description, _meta: toAgentCustomizationMeta({ userInvocable: agent.userInvocable }) });
      }
    }
    return agents;
  }
  async discoverRules(discoveryRequest, client, token) {
    const rules = [];
    const seenRuleUris = /* @__PURE__ */ new Set();
    const instructionDiscovery = await raceCancellationError(client.rpc.instructions.discover(discoveryRequest), token);
    await this.writeCustomizationDiscoveryDebugLog({
      method: "discoverRules.instructions.discover",
      sources: instructionDiscovery.sources.map((source) => ({
        id: source.id,
        label: source.label,
        sourcePath: source.sourcePath,
        applyTo: source.applyTo,
        type: source.type
      }))
    });
    for (const instruction of instructionDiscovery.sources) {
      let uri;
      if (isAbsolute(instruction.sourcePath)) {
        uri = this._pathToUri(instruction.sourcePath);
      } else {
        const anchor = this._rootForProjectPath(instruction.projectPath) ?? this._workingDirectories[0];
        uri = joinPath(anchor, instruction.sourcePath);
      }
      const uriString = uri.toString();
      rules.push({
        type: CustomizationType.Rule,
        uri: uriString,
        id: instruction.id,
        name: instruction.label,
        description: instruction.description,
        globs: instruction.applyTo ? [...instruction.applyTo] : void 0,
        alwaysApply: this._isAgentInstructionSource(instruction)
      });
      seenRuleUris.add(uriString);
    }
    for (const directory of this._discoveredDirectories ?? []) {
      if (directory.type !== "agentInstruction" /* AgentInstruction */) {
        continue;
      }
      for (const file of directory.files) {
        const uri = file.uri.toString();
        if (seenRuleUris.has(uri)) {
          continue;
        }
        rules.push({
          type: CustomizationType.Rule,
          uri,
          id: customizationId(uri),
          name: basename(file.uri.path),
          alwaysApply: true
        });
        seenRuleUris.add(uri);
      }
    }
    return rules;
  }
  _isAgentInstructionSource(instruction) {
    if (instruction.type === "home" || instruction.type === "repo" || instruction.type === "model") {
      return true;
    }
    const filename = basename(instruction.sourcePath).toLowerCase();
    return AGENT_INSTRUCTION_FILENAMES.has(filename);
  }
  async discoverSkills(discoveryRequest, client, token) {
    const skills = [];
    const skillDiscovery = await raceCancellationError(client.rpc.skills.discover(discoveryRequest), token);
    for (const skill of skillDiscovery.skills) {
      if (skill.path) {
        const uri = this._pathToUri(skill.path);
        skills.push({ type: CustomizationType.Skill, uri: uri.toString(), id: skill.path, name: skill.name, description: skill.description });
      }
    }
    return skills;
  }
  async discoverHooks(token) {
    const seen = new ResourceSet();
    const discoveredDirectories = [];
    const hookRootsWorkspace = searchRoots.workspace.filter((root) => root.type === "hook" /* Hook */);
    const hookRootsUser = searchRoots.user.filter((root) => root.type === "hook" /* Hook */);
    const fixedHookFilesWorkspace = fixedDiscoveryFiles.workspace.filter((root) => root.type === "hook" /* Hook */);
    const fixedHookFilesUser = fixedDiscoveryFiles.user.filter((root) => root.type === "hook" /* Hook */);
    await Promise.all([
      // Hooks: primary working directory only (Copilot limitation — see _hookWorkingDirectories).
      ...this._hookWorkingDirectories.flatMap((workingDirectory) => hookRootsWorkspace.map((root) => this._discoverHookRoot(workingDirectory, root, seen, discoveredDirectories, token))),
      ...hookRootsUser.map((root) => this._discoverHookRoot(this._userHome, root, seen, discoveredDirectories, token)),
      ...this._hookWorkingDirectories.map((workingDirectory) => this._discoverFixedHookFiles(workingDirectory, fixedHookFilesWorkspace, seen, discoveredDirectories, token)),
      this._discoverFixedHookFiles(this._userHome, fixedHookFilesUser, seen, discoveredDirectories, token)
    ]);
    const hooks = [];
    for (const directory of discoveredDirectories) {
      for (const file of directory.files) {
        const uri = file.uri.toString();
        hooks.push({
          type: CustomizationType.Hook,
          id: customizationId(uri),
          uri,
          name: basename(file.uri.path)
        });
      }
    }
    hooks.sort((a, b) => compareStrings(a.uri, b.uri));
    return hooks;
  }
  async _discoverHookRoot(base, root, seen, result, token) {
    const rootUri = joinPath(base, ...root.path);
    let stat = void 0;
    try {
      stat = await this._fileService.resolve(rootUri, { resolveMetadata: true });
    } catch {
    }
    await this._scanForHooks(root, rootUri, stat, seen, result, token);
  }
  async _discoverFixedHookFiles(base, roots, seen, result, token) {
    for (const root of roots) {
      throwIfCancelled(token);
      const rootUri = joinPath(base, ...root.path);
      const files = [];
      let stat = void 0;
      try {
        stat = await this._fileService.resolve(rootUri, { resolveMetadata: true });
      } catch {
      }
      for (const child of stat?.children ?? []) {
        throwIfCancelled(token);
        if (child.isFile && root.filenames.includes(child.name)) {
          if (!seen.has(child.resource)) {
            seen.add(child.resource);
            files.push({ uri: child.resource, etag: child.etag });
          }
        }
      }
      if (files.length > 0) {
        result.push({ uri: rootUri, type: "hook" /* Hook */, files: files.sort(compareDiscoveredFile), name: basename(rootUri.path), writable: true });
      }
    }
  }
  async toDirectoryCustomizations(type, customizations, allDiscoveredDirectories, result) {
    const discoveredDirectories = allDiscoveredDirectories.filter((d) => {
      if (type === CustomizationType.Agent) {
        return d.type === "agent" /* Agent */;
      }
      if (type === CustomizationType.Rule) {
        return d.type === "instruction" /* Instruction */ || d.type === "agentInstruction" /* AgentInstruction */;
      }
      if (type === CustomizationType.Hook) {
        return d.type === "hook" /* Hook */;
      }
      return d.type === "skill" /* Skill */;
    });
    const candidateOutputDirectories = type === CustomizationType.Rule ? discoveredDirectories.filter((d) => d.type !== "agentInstruction" /* AgentInstruction */ || this._isDiscoveryBoundary(d.uri)) : discoveredDirectories;
    const outputDirectories = type === CustomizationType.Skill ? candidateOutputDirectories.filter((directory) => !candidateOutputDirectories.some(
      (candidate) => !extUriBiasedIgnorePathCase.isEqual(directory.uri, candidate.uri) && extUriBiasedIgnorePathCase.isEqualOrParent(directory.uri, candidate.uri)
    )) : candidateOutputDirectories;
    const byParent = new ResourceMap();
    for (const discoveredDirectory of outputDirectories) {
      byParent.set(discoveredDirectory.uri, {
        uri: discoveredDirectory.uri,
        name: discoveredDirectory.name || basename(discoveredDirectory.uri.path),
        writable: discoveredDirectory.writable,
        children: []
      });
    }
    const fixedHookDirectoryUris = type === CustomizationType.Hook ? new ResourceSet([
      // Hooks: primary working directory only (Copilot limitation).
      ...this._hookWorkingDirectories.flatMap((workingDirectory) => fixedDiscoveryFiles.workspace.filter((root) => root.type === "hook" /* Hook */).map((root) => joinPath(workingDirectory, ...root.path))),
      ...fixedDiscoveryFiles.user.filter((root) => root.type === "hook" /* Hook */).map((root) => joinPath(this._userHome, ...root.path))
    ]) : void 0;
    const agentInstructionDirectoryUris = new ResourceSet(
      outputDirectories.filter((directory) => directory.type === "agentInstruction" /* AgentInstruction */).map((directory) => directory.uri)
    );
    for (const customization of customizations) {
      if (customization.type !== type) {
        continue;
      }
      const childUri = URI.parse(customization.uri);
      let bestParent = outputDirectories.find((d) => extUriBiasedIgnorePathCase.isEqualOrParent(childUri, d.uri));
      if (!bestParent && customization.type === CustomizationType.Rule && customization.alwaysApply && customization.name.match(/\.md$/i)) {
        bestParent = outputDirectories.find(
          (d) => d.type === "agentInstruction" /* AgentInstruction */ && extUriBiasedIgnorePathCase.isEqualOrParent(childUri, d.uri)
        ) ?? outputDirectories.find((d) => d.type === "agentInstruction" /* AgentInstruction */);
      }
      if (bestParent) {
        for (const candidate of outputDirectories) {
          if (extUriBiasedIgnorePathCase.isEqualOrParent(childUri, candidate.uri) && candidate.uri.path.length > bestParent.uri.path.length) {
            bestParent = candidate;
          }
        }
      }
      const parentUri = bestParent?.uri ?? uriDirname(childUri);
      let entry = byParent.get(parentUri);
      if (!entry) {
        this._logService.error(`[SessionCustomizationDiscovery] BUG: customization '${customization.uri}' of type '${customization.type}' is outside discovered directories; creating fallback directory '${parentUri.toString()}'.`);
        entry = {
          uri: parentUri,
          name: basename(parentUri.path),
          writable: true,
          children: []
        };
        byParent.set(parentUri, entry);
      }
      entry.children.push(customization);
    }
    for (const { uri, name, writable, children } of byParent.values()) {
      if (type === CustomizationType.Hook && fixedHookDirectoryUris?.has(uri) && children.length === 0) {
        continue;
      }
      if (type === CustomizationType.Rule && agentInstructionDirectoryUris.has(uri)) {
        const existingChildren = [];
        for (const child of children) {
          const childUri = URI.parse(child.uri);
          try {
            const stat = await this._fileService.resolve(childUri, { resolveMetadata: true });
            if (stat.isFile) {
              existingChildren.push(child);
            }
          } catch {
          }
        }
        if (existingChildren.length === 0) {
          continue;
        }
        children.length = 0;
        children.push(...existingChildren);
      }
      children.sort((a, b) => compareStrings(a.uri, b.uri));
      result.push({
        type: CustomizationType.Directory,
        id: customizationId(uri.toString()),
        uri: uri.toString(),
        name,
        enabled: true,
        contents: type,
        writable,
        load: { kind: CustomizationLoadStatus.Loaded },
        children
      });
    }
  }
  /**
   * Returns the list of discovered customization directories and files in a sorted way.
   * Also sets up watchers for all discovered root directories (recursively if specified by the root or if already watching recursively).
   * Each call performs a fresh scan scoped to the provided cancellation token.
   */
  async scan(token) {
    await this.writeCustomizationDiscoveryDebugLog({
      method: "scan",
      workingDirectories: this._workingDirectories.map((d) => d.toString()),
      userHome: this._userHome.toString()
    });
    throwIfCancelled(token);
    const nextWatchRootUris = new ResourceMap();
    const seen = new ResourceSet();
    const result = [];
    const workspaceFixedHook = fixedDiscoveryFiles.workspace.filter((root) => root.type === "hook" /* Hook */);
    const workspaceFixedNonHook = fixedDiscoveryFiles.workspace.filter((root) => root.type !== "hook" /* Hook */);
    await Promise.all([
      ...searchRoots.workspace.flatMap((root) => (root.type === "hook" /* Hook */ ? this._hookWorkingDirectories : this._workingDirectories).map((workingDirectory) => this._scanRoot(workingDirectory, root, seen, result, nextWatchRootUris, token))),
      ...searchRoots.user.map((root) => this._scanRoot(this._userHome, root, seen, result, nextWatchRootUris, token)),
      ...this._workingDirectories.map((workingDirectory) => this._scanFixedDiscoveryFiles(workingDirectory, workspaceFixedNonHook, seen, result, nextWatchRootUris, token)),
      ...this._hookWorkingDirectories.map((workingDirectory) => this._scanFixedDiscoveryFiles(workingDirectory, workspaceFixedHook, seen, result, nextWatchRootUris, token)),
      this._scanFixedDiscoveryFiles(this._userHome, fixedDiscoveryFiles.user, seen, result, nextWatchRootUris, token)
    ]);
    throwIfCancelled(token);
    this._reconcileWatchers(nextWatchRootUris);
    const sortedResult = result.sort(compareDiscoveredDirectory);
    await this.writeCustomizationDiscoveryDebugLog({
      method: "scan",
      result: sortedResult.map((directory) => ({
        type: directory.type,
        uri: directory.uri.toString(),
        files: directory.files.map((file) => file.uri.toString())
      }))
    });
    return sortedResult;
  }
  /**
   * Walk the ancestor chain of `path` from `base`. For every ancestor
   * directory that exists, register a non-recursive watcher whose trigger
   * URI is the next path segment, so the handler fires when an intermediate
   * directory (e.g. `.github`, `.github/agents`, `.copilot`) is created and
   * a re-scan is needed to pick up newly-discoverable content.
   *
   * Returns true when every ancestor exists as a directory (i.e. the leaf
   * may exist). Returns false when an ancestor is missing or not a directory,
   * in which case the caller can short-circuit.
   */
  async _watchAncestors(base, path, watchRootUris, token) {
    let current = base;
    for (const segment of path) {
      const parent = current;
      const child = joinPath(parent, segment);
      if (!watchRootUris.has(parent)) {
        throwIfCancelled(token);
        try {
          const stat = await this._fileService.resolve(parent);
          if (!stat.isDirectory) {
            return false;
          }
        } catch {
          return false;
        }
      }
      addWatch(watchRootUris, parent, false, child);
      current = child;
    }
    return true;
  }
  _reconcileWatchers(nextWatchRootUris) {
    for (const [rootUri, watcher] of this._watchers.entries()) {
      const next = nextWatchRootUris.get(rootUri);
      if (!next || next.recursive !== watcher.recursive) {
        watcher.disposable.dispose();
        this._watchers.delete(rootUri);
      }
    }
    for (const [rootUri, next] of nextWatchRootUris.entries()) {
      const existing = this._watchers.get(rootUri);
      if (existing) {
        existing.resourcesToWatch.clear();
        for (const uri of next.resourcesToWatch) {
          existing.resourcesToWatch.add(uri);
        }
        continue;
      }
      try {
        const disposable = this._fileService.watch(rootUri, { recursive: next.recursive, excludes: [] });
        this._watchers.set(rootUri, { recursive: next.recursive, resourcesToWatch: next.resourcesToWatch, disposable });
      } catch (err) {
        this._logService.warn(`[SessionCustomizationDiscovery] Failed to watch '${rootUri.toString()}': ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  _disposeAllWatchers() {
    for (const watcher of this._watchers.values()) {
      watcher.disposable.dispose();
    }
    this._watchers.clear();
  }
  /**
   * For fixed discovery files (e.g. AGENTS.md, copilot-instructions.md,
   * settings.json), create one discovered directory per type at the base.
   */
  async _scanFixedDiscoveryFiles(base, roots, seen, result, watchRootUris, token) {
    const filesByType = /* @__PURE__ */ new Map();
    await Promise.all(roots.map(async (root) => {
      throwIfCancelled(token);
      if (!await this._watchAncestors(base, root.path, watchRootUris, token)) {
        return;
      }
      const rootUri = joinPath(base, ...root.path);
      let stat;
      try {
        stat = await this._fileService.resolve(rootUri, { resolveMetadata: true });
      } catch {
        return;
      }
      if (!stat.isDirectory || !stat.children) {
        return;
      }
      for (const filename of root.filenames) {
        addWatch(watchRootUris, rootUri, false, joinPath(rootUri, filename));
      }
      for (const entry of stat.children) {
        throwIfCancelled(token);
        if (entry.isFile && root.filenames.includes(entry.name)) {
          const uri = joinPath(rootUri, entry.name);
          if (!seen.has(uri)) {
            seen.add(uri);
            const files = filesByType.get(root.type) ?? [];
            files.push({ uri, etag: entry.etag });
            filesByType.set(root.type, files);
          }
        }
      }
    }));
    for (const [type, files] of filesByType.entries()) {
      if (files.length > 0) {
        result.push({ uri: base, type, files: files.sort(compareDiscoveredFile), name: "", writable: false });
      }
    }
  }
  async _scanRoot(base, root, seen, result, watchRootUris, token) {
    throwIfCancelled(token);
    const rootUri = joinPath(base, ...root.path);
    let stat = void 0;
    let children = [];
    try {
      stat = await this._fileService.resolve(rootUri, { resolveMetadata: true });
      children = stat.children ?? [];
    } catch {
    }
    await this._watchAncestors(base, root.path, watchRootUris, token);
    addWatch(watchRootUris, rootUri, root.recursive ?? false, rootUri);
    if (root.type === "skill" /* Skill */) {
      const files = [];
      await Promise.all(children.map(async (child) => {
        throwIfCancelled(token);
        if (child.isDirectory) {
          const skillFile = joinPath(child.resource, SKILL_FILENAME);
          try {
            const skillStat = await this._fileService.resolve(skillFile, { resolveMetadata: true });
            if (skillStat.isFile && !seen.has(skillFile)) {
              seen.add(skillFile);
              files.push({ uri: skillFile, etag: skillStat.etag });
            }
          } catch {
          }
        }
      }));
      result.push({ uri: rootUri, type: root.type, files: files.sort(compareDiscoveredFile), name: root.name, writable: true });
    } else if (root.type === "agent" /* Agent */) {
      const files = [];
      for (const child of children) {
        throwIfCancelled(token);
        if (child.isFile) {
          const filename = child.name;
          if (filename.endsWith(MARKDOWN_SUFFIX) && filename !== README_FILENAME && !seen.has(child.resource)) {
            seen.add(child.resource);
            files.push({ uri: child.resource, etag: child.etag });
          }
        }
      }
      result.push({ uri: rootUri, type: root.type, files: files.sort(compareDiscoveredFile), name: root.name, writable: true });
    } else if (root.type === "instruction" /* Instruction */) {
      const files = [];
      const findInstructions = async (stat2, recursionLevel) => {
        throwIfCancelled(token);
        for (const child of stat2.children ?? []) {
          throwIfCancelled(token);
          if (child.isFile) {
            const name = child.name.toLowerCase();
            if (name.endsWith(INSTRUCTION_FILE_SUFFIX) && !seen.has(child.resource)) {
              seen.add(child.resource);
              files.push({ uri: child.resource, etag: child.etag });
            }
          } else if (child.isDirectory && recursionLevel < MAX_INSTRUCTIONS_RECURSION_DEPTH) {
            let childStat = void 0;
            try {
              childStat = await this._fileService.resolve(child.resource, { resolveMetadata: true });
            } catch {
            }
            if (childStat) {
              await findInstructions(childStat, recursionLevel + 1);
            }
          }
        }
      };
      if (stat) {
        await findInstructions(stat, 0);
      }
      result.push({ uri: rootUri, type: root.type, files: files.sort(compareDiscoveredFile), name: root.name, writable: true });
    } else if (root.type === "hook" /* Hook */) {
      await this._scanForHooks(root, rootUri, stat, seen, result, token);
    } else {
      this._logService.warn(`[SessionCustomizationDiscovery] Unrecognized root type '${root.type}' for root '${rootUri.toString()}'`);
    }
  }
  async _scanForHooks(root, rootUri, stat, seen, result, token) {
    const files = [];
    const findHooks = async (directoryStat, recursionLevel) => {
      throwIfCancelled(token);
      for (const child of directoryStat.children ?? []) {
        throwIfCancelled(token);
        if (child.isFile) {
          const name = child.name.toLowerCase();
          if (name.endsWith(HOOK_FILE_SUFFIX) && !seen.has(child.resource)) {
            seen.add(child.resource);
            files.push({ uri: child.resource, etag: child.etag });
          }
        } else if (child.isDirectory && recursionLevel < MAX_HOOKS_RECURSION_DEPTH) {
          let childStat = void 0;
          try {
            childStat = await this._fileService.resolve(child.resource, { resolveMetadata: true });
          } catch {
          }
          if (childStat) {
            await findHooks(childStat, recursionLevel + 1);
          }
        }
      }
    };
    if (stat) {
      await findHooks(stat, 0);
    }
    result.push({ uri: rootUri, type: root.type, files: files.sort(compareDiscoveredFile), name: root.name, writable: true });
  }
};
SessionCustomizationDiscovery = __decorateClass([
  __decorateParam(3, IFileService),
  __decorateParam(4, ILogService)
], SessionCustomizationDiscovery);
const _internal = {
  AGENT_FILE_SUFFIX,
  INSTRUCTION_FILE_SUFFIX,
  SKILL_FILENAME,
  searchRoots,
  fixedDiscoveryFiles,
  agentInstructions
};
export {
  DiscoveredType,
  SessionCustomizationDiscovery,
  _internal,
  areDiscoveredDirectoriesEqual
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxjb3BpbG90XFxzZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIHsgQ29waWxvdENsaWVudCB9IGZyb20gJ0BnaXRodWIvY29waWxvdC1zZGsnO1xuaW1wb3J0IHsgYXBwZW5kRmlsZSwgbWtkaXIgfSBmcm9tICdmcy9wcm9taXNlcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIHR5cGUgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAsIFJlc291cmNlU2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IGpvaW5QYXRoLCBkaXJuYW1lIGFzIHVyaURpcm5hbWUsIGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGNvbXBhcmUgYXMgY29tcGFyZVN0cmluZ3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgaXNBYnNvbHV0ZSwgZGlybmFtZSBhcyBub2RlRGlybmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlLCBJRmlsZVN0YXRXaXRoTWV0YWRhdGEgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBBZ2VudEN1c3RvbWl6YXRpb24sIENoaWxkQ3VzdG9taXphdGlvbiwgQ3VzdG9taXphdGlvbkxvYWRTdGF0dXMsIEN1c3RvbWl6YXRpb25UeXBlLCBEaXJlY3RvcnlDdXN0b21pemF0aW9uLCBIb29rQ3VzdG9taXphdGlvbiwgUnVsZUN1c3RvbWl6YXRpb24sIFNraWxsQ3VzdG9taXphdGlvbiwgY3VzdG9taXphdGlvbklkIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBDaGlsZEN1c3RvbWl6YXRpb25UeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IHRvQWdlbnRDdXN0b21pemF0aW9uTWV0YSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tZXRhL2FnZW50Q3VzdG9taXphdGlvbk1ldGEuanMnO1xuaW1wb3J0IHsgcmFjZUNhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuXG50eXBlIEFnZW50c0Rpc2NvdmVyUmVxdWVzdCA9IFBhcmFtZXRlcnM8Q29waWxvdENsaWVudFsncnBjJ11bJ2FnZW50cyddWydkaXNjb3ZlciddPlswXTtcbnR5cGUgSW5zdHJ1Y3Rpb25Tb3VyY2UgPSBBd2FpdGVkPFJldHVyblR5cGU8Q29waWxvdENsaWVudFsncnBjJ11bJ2luc3RydWN0aW9ucyddWydkaXNjb3ZlciddPj5bJ3NvdXJjZXMnXVtudW1iZXJdO1xuXG4vKipcbiAqIFRoZSBraW5kcyBvZiBjdXN0b21pemF0aW9ucyB0aGUgYWdlbnQgaG9zdCBkaXNjb3ZlcnMgZnJvbSBkaXNrLlxuICpcbiAqIFJlLWRlY2xhcmVkIG9uIHRoZSBwbGF0Zm9ybSBzaWRlIHNvIHRoaXMgbW9kdWxlIGhhcyBubyBkZXBlbmRlbmN5IG9uIHRoZVxuICogd29ya2JlbmNoLXNpZGUgYFByb21wdHNUeXBlYCBlbnVtLlxuICovXG5leHBvcnQgY29uc3QgZW51bSBEaXNjb3ZlcmVkVHlwZSB7XG5cdEFnZW50ID0gJ2FnZW50Jyxcblx0U2tpbGwgPSAnc2tpbGwnLFxuXHRJbnN0cnVjdGlvbiA9ICdpbnN0cnVjdGlvbicsXG5cdEhvb2sgPSAnaG9vaycsXG5cdEFnZW50SW5zdHJ1Y3Rpb24gPSAnYWdlbnRJbnN0cnVjdGlvbicsXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSURpc2NvdmVyZWREaXJlY3Rvcnkge1xuXHRyZWFkb25seSB1cmk6IFVSSTtcblx0cmVhZG9ubHkgdHlwZTogRGlzY292ZXJlZFR5cGU7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgd3JpdGFibGU6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGZpbGVzOiByZWFkb25seSBJRGlzY292ZXJlZEZpbGVbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRGlzY292ZXJlZEZpbGUge1xuXHRyZWFkb25seSB1cmk6IFVSSTtcblx0cmVhZG9ubHkgZXRhZzogc3RyaW5nO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXJlRGlzY292ZXJlZERpcmVjdG9yaWVzRXF1YWwoYTogcmVhZG9ubHkgSURpc2NvdmVyZWREaXJlY3RvcnlbXSwgYjogcmVhZG9ubHkgSURpc2NvdmVyZWREaXJlY3RvcnlbXSk6IGJvb2xlYW4ge1xuXHRpZiAoYS5sZW5ndGggIT09IGIubGVuZ3RoKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBhLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3QgbGVmdCA9IGFbaV07XG5cdFx0Y29uc3QgcmlnaHQgPSBiW2ldO1xuXHRcdGlmIChsZWZ0LnR5cGUgIT09IHJpZ2h0LnR5cGUgfHwgbGVmdC51cmkudG9TdHJpbmcoKSAhPT0gcmlnaHQudXJpLnRvU3RyaW5nKCkgfHwgIWFyZURpc2NvdmVyZWRGaWxlc0VxdWFsKGxlZnQuZmlsZXMsIHJpZ2h0LmZpbGVzKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBjb21wYXJlRGlzY292ZXJlZERpcmVjdG9yeShhOiBJRGlzY292ZXJlZERpcmVjdG9yeSwgYjogSURpc2NvdmVyZWREaXJlY3RvcnkpOiBudW1iZXIge1xuXHRjb25zdCBieVR5cGUgPSBjb21wYXJlU3RyaW5ncyhhLnR5cGUsIGIudHlwZSk7XG5cdGlmIChieVR5cGUgIT09IDApIHtcblx0XHRyZXR1cm4gYnlUeXBlO1xuXHR9XG5cdHJldHVybiBjb21wYXJlU3RyaW5ncyhhLnVyaS50b1N0cmluZygpLCBiLnVyaS50b1N0cmluZygpKTtcbn1cblxuZnVuY3Rpb24gYXJlRGlzY292ZXJlZEZpbGVzRXF1YWwoYTogcmVhZG9ubHkgSURpc2NvdmVyZWRGaWxlW10sIGI6IHJlYWRvbmx5IElEaXNjb3ZlcmVkRmlsZVtdKTogYm9vbGVhbiB7XG5cdGlmIChhLmxlbmd0aCAhPT0gYi5sZW5ndGgpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRmb3IgKGxldCBpID0gMDsgaSA8IGEubGVuZ3RoOyBpKyspIHtcblx0XHRjb25zdCBsZWZ0ID0gYVtpXTtcblx0XHRjb25zdCByaWdodCA9IGJbaV07XG5cdFx0aWYgKGxlZnQudXJpLnRvU3RyaW5nKCkgIT09IHJpZ2h0LnVyaS50b1N0cmluZygpIHx8IGxlZnQuZXRhZyAhPT0gcmlnaHQuZXRhZykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBjb21wYXJlRGlzY292ZXJlZEZpbGUoYTogSURpc2NvdmVyZWRGaWxlLCBiOiBJRGlzY292ZXJlZEZpbGUpOiBudW1iZXIge1xuXHRyZXR1cm4gY29tcGFyZVN0cmluZ3MoYS51cmkudG9TdHJpbmcoKSwgYi51cmkudG9TdHJpbmcoKSk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhcmVEaXJlY3RvcnlDdXN0b21pemF0aW9uKGE6IERpcmVjdG9yeUN1c3RvbWl6YXRpb24sIGI6IERpcmVjdG9yeUN1c3RvbWl6YXRpb24pOiBudW1iZXIge1xuXHRjb25zdCBieVVyaSA9IGNvbXBhcmVTdHJpbmdzKGEudXJpLCBiLnVyaSk7XG5cdGlmIChieVVyaSAhPT0gMCkge1xuXHRcdHJldHVybiBieVVyaTtcblx0fVxuXHRyZXR1cm4gY29tcGFyZVN0cmluZ3MoYS5jb250ZW50cywgYi5jb250ZW50cyk7XG59XG5cbi8qKlxuICogTWF4aW11bSByZWN1cnNpb24gZGVwdGggd2hlbiB0cmF2ZXJzaW5nIHN1YmRpcmVjdG9yaWVzIGZvciBpbnN0cnVjdGlvbiBmaWxlcy5cbiAqL1xuY29uc3QgTUFYX0lOU1RSVUNUSU9OU19SRUNVUlNJT05fREVQVEggPSA1O1xuY29uc3QgTUFYX0hPT0tTX1JFQ1VSU0lPTl9ERVBUSCA9IDg7XG5cbmNvbnN0IEFHRU5UX0ZJTEVfU1VGRklYID0gJy5hZ2VudC5tZCc7XG5jb25zdCBNQVJLRE9XTl9TVUZGSVggPSAnLm1kJztcbmNvbnN0IElOU1RSVUNUSU9OX0ZJTEVfU1VGRklYID0gJy5pbnN0cnVjdGlvbnMubWQnO1xuY29uc3QgSE9PS19GSUxFX1NVRkZJWCA9ICcuanNvbic7XG5jb25zdCBTS0lMTF9GSUxFTkFNRSA9ICdTS0lMTC5tZCc7XG5jb25zdCBSRUFETUVfRklMRU5BTUUgPSAnUkVBRE1FLm1kJztcbmNvbnN0IENVU1RPTUlaQVRJT05fRElTQ09WRVJZX0RFQlVHX0xPR19QQVRIID0gdW5kZWZpbmVkOyAvLycvdG1wL2NvcGlsb3QtY3VzdG9taXphdGlvbi1kaXNjb3ZlcnktZGVidWcubG9nJztcbmNvbnN0IEFHRU5UX0lOU1RSVUNUSU9OX0ZJTEVOQU1FUyA9IG5ldyBTZXQoWydhZ2VudHMubWQnLCAnY2xhdWRlLm1kJywgJ2dlbWluaS5tZCcsICdjb3BpbG90LWluc3RydWN0aW9ucy5tZCddKTtcblxuaW50ZXJmYWNlIElTZWFyY2hSb290IHtcblx0cmVhZG9ubHkgcGF0aDogcmVhZG9ubHkgc3RyaW5nW107XG5cdHJlYWRvbmx5IHR5cGU6IERpc2NvdmVyZWRUeXBlO1xuXHRyZWFkb25seSByZWN1cnNpdmU/OiBib29sZWFuOyAvLyB3aGV0aGVyIHRvIHdhdGNoIHJlY3Vyc2l2ZWx5IGZvciBjaGFuZ2VzIChkZWZhdWx0cyB0byBmYWxzZSlcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSUZpeGVkRGlzY292ZXJ5RmlsZSB7XG5cdHJlYWRvbmx5IHBhdGg6IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRyZWFkb25seSBmaWxlbmFtZXM6IHN0cmluZ1tdO1xuXHRyZWFkb25seSB0eXBlOiBEaXNjb3ZlcmVkVHlwZTtcbn1cblxudHlwZSBQYXRoVG9VcmkgPSAocGF0aDogc3RyaW5nKSA9PiBVUkk7XG5cbi8qKlxuICogQnVpbGRzIHRoZSBsaXN0IG9mIHNlYXJjaCByb290cyBmb3IgYSBnaXZlbiB3b3JraW5nIGRpcmVjdG9yeSBhbmQgdXNlciBob21lLlxuICogU2tpbGxzIHJlcXVpcmUgYSBkZXB0aC0yIHNjYW4gKGA8c2tpbGxEaXI+L1NLSUxMLm1kYCksIGFnZW50cyBhcmUgc2Nhbm5lZCBhdFxuICogYSBzaW5nbGUgZGlyZWN0b3J5IGRlcHRoLCBhbmQgaW5zdHJ1Y3Rpb25zL2hvb2tzIGFyZSByZWN1cnNpdmVseSBzY2FubmVkLlxuICovXG5jb25zdCBzZWFyY2hSb290czogeyB3b3Jrc3BhY2U6IElTZWFyY2hSb290W107IHVzZXI6IElTZWFyY2hSb290W10gfSA9IHtcblx0d29ya3NwYWNlOiBbXG5cdFx0eyBwYXRoOiBbJy5naXRodWInLCAnYWdlbnRzJ10sIHR5cGU6IERpc2NvdmVyZWRUeXBlLkFnZW50LCBuYW1lOiAnLmdpdGh1YicgfSxcblx0XHR7IHBhdGg6IFsnLmNsYXVkZScsICdhZ2VudHMnXSwgdHlwZTogRGlzY292ZXJlZFR5cGUuQWdlbnQsIG5hbWU6ICcuY2xhdWRlJyB9LFxuXHRcdHsgcGF0aDogWycuZ2l0aHViJywgJ3NraWxscyddLCByZWN1cnNpdmU6IHRydWUsIHR5cGU6IERpc2NvdmVyZWRUeXBlLlNraWxsLCBuYW1lOiAnLmdpdGh1YicgfSxcblx0XHR7IHBhdGg6IFsnLmFnZW50cycsICdza2lsbHMnXSwgcmVjdXJzaXZlOiB0cnVlLCB0eXBlOiBEaXNjb3ZlcmVkVHlwZS5Ta2lsbCwgbmFtZTogJy5hZ2VudHMnIH0sXG5cdFx0eyBwYXRoOiBbJy5jbGF1ZGUnLCAnc2tpbGxzJ10sIHJlY3Vyc2l2ZTogdHJ1ZSwgdHlwZTogRGlzY292ZXJlZFR5cGUuU2tpbGwsIG5hbWU6ICcuY2xhdWRlJyB9LFxuXHRcdHsgcGF0aDogWycuZ2l0aHViJywgJ2luc3RydWN0aW9ucyddLCByZWN1cnNpdmU6IHRydWUsIHR5cGU6IERpc2NvdmVyZWRUeXBlLkluc3RydWN0aW9uLCBuYW1lOiAnLmdpdGh1YicgfSxcblx0XHR7IHBhdGg6IFsnLmdpdGh1YicsICdob29rcyddLCByZWN1cnNpdmU6IHRydWUsIHR5cGU6IERpc2NvdmVyZWRUeXBlLkhvb2ssIG5hbWU6ICcuZ2l0aHViJyB9LFxuXG5cdF0sXG5cdHVzZXI6IFtcblx0XHR7IHBhdGg6IFsnLmNvcGlsb3QnLCAnYWdlbnRzJ10sIHR5cGU6IERpc2NvdmVyZWRUeXBlLkFnZW50LCBuYW1lOiAnfi8uY29waWxvdCcgfSxcblx0XHR7IHBhdGg6IFsnLmFnZW50cycsICdza2lsbHMnXSwgcmVjdXJzaXZlOiB0cnVlLCB0eXBlOiBEaXNjb3ZlcmVkVHlwZS5Ta2lsbCwgbmFtZTogJ34vLmFnZW50cycgfSxcblx0XHR7IHBhdGg6IFsnLmNvcGlsb3QnLCAnc2tpbGxzJ10sIHJlY3Vyc2l2ZTogdHJ1ZSwgdHlwZTogRGlzY292ZXJlZFR5cGUuU2tpbGwsIG5hbWU6ICd+Ly5jb3BpbG90JyB9LFxuXHRcdHsgcGF0aDogWycuY29waWxvdCcsICdpbnN0cnVjdGlvbnMnXSwgcmVjdXJzaXZlOiB0cnVlLCB0eXBlOiBEaXNjb3ZlcmVkVHlwZS5JbnN0cnVjdGlvbiwgbmFtZTogJ34vLmNvcGlsb3QnIH0sXG5cdFx0eyBwYXRoOiBbJy5jb3BpbG90JywgJ2hvb2tzJ10sIHJlY3Vyc2l2ZTogdHJ1ZSwgdHlwZTogRGlzY292ZXJlZFR5cGUuSG9vaywgbmFtZTogJ34vLmNvcGlsb3QnIH0sXG5cdF0sXG59O1xuXG5cbi8qKlxuICogQnVpbGRzIHRoZSBsaXN0IG9mIGluc3RydWN0aW9uIGZpbGUgY2FuZGlkYXRlcyB1c2VkIGJ5IHRoZSBDb3BpbG90IENMSS5cbiAqXG4gKiBSZXR1cm5zIHBhdGhzIHdpdGggZmlsZW5hbWVzIGZvciB3b3Jrc3BhY2UgYW5kIHVzZXItaG9tZVxuICogbG9jYXRpb25zXG4gKi9cbmNvbnN0IGZpeGVkRGlzY292ZXJ5RmlsZXM6IHsgd29ya3NwYWNlOiBJRml4ZWREaXNjb3ZlcnlGaWxlW107IHVzZXI6IElGaXhlZERpc2NvdmVyeUZpbGVbXSB9ID0ge1xuXHR3b3Jrc3BhY2U6IFtcblx0XHR7IHBhdGg6IFsnLmdpdGh1YiddLCBmaWxlbmFtZXM6IFsnY29waWxvdC1pbnN0cnVjdGlvbnMubWQnXSwgdHlwZTogRGlzY292ZXJlZFR5cGUuQWdlbnRJbnN0cnVjdGlvbiB9LFxuXHRcdHsgcGF0aDogW10sIGZpbGVuYW1lczogWydBR0VOVFMubWQnLCAnQ0xBVURFLm1kJywgJ0dFTUlOSS5tZCddLCB0eXBlOiBEaXNjb3ZlcmVkVHlwZS5BZ2VudEluc3RydWN0aW9uIH0sXG5cdFx0eyBwYXRoOiBbJy5jbGF1ZGUnXSwgZmlsZW5hbWVzOiBbJ0NMQVVERS5tZCddLCB0eXBlOiBEaXNjb3ZlcmVkVHlwZS5BZ2VudEluc3RydWN0aW9uIH0sXG5cdFx0eyBwYXRoOiBbJy5naXRodWInLCAnY29waWxvdCddLCBmaWxlbmFtZXM6IFsnc2V0dGluZ3MuanNvbicsICdzZXR0aW5ncy5sb2NhbC5qc29uJ10sIHR5cGU6IERpc2NvdmVyZWRUeXBlLkhvb2sgfSxcblx0XHR7IHBhdGg6IFsnLmNsYXVkZSddLCBmaWxlbmFtZXM6IFsnc2V0dGluZ3MuanNvbicsICdzZXR0aW5ncy5sb2NhbC5qc29uJ10sIHR5cGU6IERpc2NvdmVyZWRUeXBlLkhvb2sgfSxcblx0XSxcblx0dXNlcjogW1xuXHRcdHsgcGF0aDogWycuY29waWxvdCddLCBmaWxlbmFtZXM6IFsnY29waWxvdC1pbnN0cnVjdGlvbnMubWQnXSwgdHlwZTogRGlzY292ZXJlZFR5cGUuQWdlbnRJbnN0cnVjdGlvbiB9LFxuXHRdLFxufTtcblxuLy8gQmFjay1jb21wYXQgYWxpYXMgZm9yIHRlc3RzIGFuZCBjYWxsZXJzIHRoYXQgcmVmZXJlbmNlZCB0aGUgb2xkIHN5bWJvbCBuYW1lLlxuY29uc3QgYWdlbnRJbnN0cnVjdGlvbnMgPSBmaXhlZERpc2NvdmVyeUZpbGVzO1xuXG5mdW5jdGlvbiB0aHJvd0lmQ2FuY2VsbGVkKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IHZvaWQge1xuXHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSVdhdGNoU3BlYyB7XG5cdHJlYWRvbmx5IHJlY3Vyc2l2ZTogYm9vbGVhbjtcblx0cmVhZG9ubHkgcmVzb3VyY2VzVG9XYXRjaDogUmVzb3VyY2VTZXQ7XG59XG5cbi8qKlxuICogUmVnaXN0ZXIgYSB3YXRjaGVyIGZvciBgd2F0Y2hVcmlgIGFuZCBhZGQgYHJlc291cmNlVG9XYXRjaGAgdG8gaXRzIHNldCBvZlxuICogdHJpZ2dlciBVUklzLiBJZiBhIG5vbi1yZWN1cnNpdmUgZW50cnkgYWxyZWFkeSBleGlzdHMgYW5kIGByZWN1cnNpdmVgIGlzXG4gKiB0cnVlLCB1cGdyYWRlIGl0IHRvIHJlY3Vyc2l2ZSB3aGlsZSBwcmVzZXJ2aW5nIHRoZSBhY2N1bXVsYXRlZCB0cmlnZ2VyIFVSSXMuXG4gKi9cbmZ1bmN0aW9uIGFkZFdhdGNoKG1hcDogUmVzb3VyY2VNYXA8SVdhdGNoU3BlYz4sIHdhdGNoVXJpOiBVUkksIHJlY3Vyc2l2ZTogYm9vbGVhbiwgcmVzb3VyY2VUb1dhdGNoOiBVUkkpOiB2b2lkIHtcblx0bGV0IGVudHJ5ID0gbWFwLmdldCh3YXRjaFVyaSk7XG5cdGlmICghZW50cnkpIHtcblx0XHRlbnRyeSA9IHsgcmVjdXJzaXZlLCByZXNvdXJjZXNUb1dhdGNoOiBuZXcgUmVzb3VyY2VTZXQoKSB9O1xuXHRcdG1hcC5zZXQod2F0Y2hVcmksIGVudHJ5KTtcblx0fSBlbHNlIGlmIChyZWN1cnNpdmUgJiYgIWVudHJ5LnJlY3Vyc2l2ZSkge1xuXHRcdGVudHJ5ID0geyByZWN1cnNpdmU6IHRydWUsIHJlc291cmNlc1RvV2F0Y2g6IGVudHJ5LnJlc291cmNlc1RvV2F0Y2ggfTtcblx0XHRtYXAuc2V0KHdhdGNoVXJpLCBlbnRyeSk7XG5cdH1cblx0ZW50cnkucmVzb3VyY2VzVG9XYXRjaC5hZGQocmVzb3VyY2VUb1dhdGNoKTtcbn1cblxuLyoqXG4gKiBEaXNjb3ZlcnMgY3VzdG9taXphdGlvbiBmaWxlcyAoYWdlbnRzLCBza2lsbHMsIGluc3RydWN0aW9ucywgYW5kIGhvb2tzKVxuICogdW5kZXIgd2VsbC1rbm93biBkaXJlY3RvcmllcyBvZiB0aGUgc2Vzc2lvbidzIHdvcmtpbmcgZGlyZWN0b3JpZXMgYW5kIHRoZVxuICogdXNlcidzIGhvbWUsIGFuZCBlbWl0cyB7QGxpbmsgb25EaWRDaGFuZ2V9IHdoZW4gYW55IG9mIHRob3NlIGRpcmVjdG9yaWVzXG4gKiBjaGFuZ2Ugb24gZGlzay5cbiAqXG4gKlxuICogV29ya3NwYWNlIHJvb3RzIHRha2UgcHJlY2VkZW5jZSBvdmVyIHVzZXItaG9tZSByb290cyB3aGVuIHRoZSBzYW1lIFVSSSBpc1xuICogZGlzY292ZXJlZCB0aHJvdWdoIG11bHRpcGxlIHBhdGhzIChkZS1kdXBlZCBieSBVUkkpLlxuICpcbiAqIGBfd29ya2luZ0RpcmVjdG9yaWVzYCBNVVNUIGJlICoqbm9uLWVtcHR5KiogYW5kICoqcHJpbWFyeS1maXJzdCoqOiBpbmRleCAwIGlzXG4gKiB0aGUgcHJpbWFyeSByb290ICh0aGUgcHJvY2VzcyBjd2QgLyB3b3JrdHJlZSkgYW5kIGlzIHVzZWQgYXMgdGhlIGFuY2hvciBmb3JcbiAqIHNvdXJjZXMgdGhlIFNESyBkb2VzIG5vdCBhdHRyaWJ1dGUgdG8gYSBzcGVjaWZpYyByb290IChzZWUge0BsaW5rIGRpc2NvdmVyUnVsZXN9KVxuICogYW5kIGFzIHRoZSBzb2xlIHJvb3QgZm9yIGhvb2tzIChzZWUge0BsaW5rIF9ob29rV29ya2luZ0RpcmVjdG9yaWVzfSk7IGluZGljZXNcbiAqIDEuLk4gYXJlIHRoZSBhZGRpdGlvbmFsIG11bHRpLXJvb3QgZm9sZGVycy4gVGhlIGNvbnN0cnVjdG9yIGFzc2VydHMgdGhpcyBzbyBhXG4gKiBjYWxsZXIgdGhhdCBwYXNzZXMgYW4gZW1wdHkgc2V0IGZhaWxzIGZhc3Qgd2l0aCBhIGNsZWFyIGVycm9yIGluc3RlYWQgb2YgYVxuICogY29uZnVzaW5nIGB1bmRlZmluZWRgLXJvb3QgY3Jhc2ggZGVlcCBpbnNpZGUgZGlzY292ZXJ5LlxuICovXG5leHBvcnQgY2xhc3MgU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnkgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIF9kaXNjb3ZlcmVkRGlyZWN0b3JpZXM6IHJlYWRvbmx5IElEaXNjb3ZlcmVkRGlyZWN0b3J5W10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfd2F0Y2hlcnMgPSBuZXcgUmVzb3VyY2VNYXA8SVdhdGNoU3BlYyAmIHsgcmVhZG9ubHkgZGlzcG9zYWJsZTogSURpc3Bvc2FibGUgfT4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF93b3JraW5nRGlyZWN0b3JpZXM6IHJlYWRvbmx5IFVSSVtdLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3VzZXJIb21lOiBVUkksXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcGF0aFRvVXJpOiBQYXRoVG9VcmkgPSBVUkkuZmlsZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdGlmIChfd29ya2luZ0RpcmVjdG9yaWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Ly8gRGlzcG9zZSB0aGUgYmFzZSBzdG9yZSBiZWZvcmUgdGhyb3dpbmcgc28gYSByZWplY3RlZCBjb25zdHJ1Y3Rpb25cblx0XHRcdC8vIGRvZXMgbm90IGxlYWsgYSB0cmFja2VkIChuZXZlci1kaXNwb3NlZCkgZGlzcG9zYWJsZS5cblx0XHRcdHRoaXMuZGlzcG9zZSgpO1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeSByZXF1aXJlcyBhdCBsZWFzdCBvbmUgd29ya2luZyBkaXJlY3RvcnkgKGluZGV4IDAgPSBwcmltYXJ5IHJvb3QpLicpO1xuXHRcdH1cblx0XHR0aGlzLl9yZWdpc3Rlcih7IGRpc3Bvc2U6ICgpID0+IHRoaXMuX2Rpc3Bvc2VBbGxXYXRjaGVycygpIH0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2ZpbGVTZXJ2aWNlLm9uRGlkRmlsZXNDaGFuZ2UoZSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IHdhdGNoZXIgb2YgdGhpcy5fd2F0Y2hlcnMudmFsdWVzKCkpIHtcblx0XHRcdFx0Zm9yIChjb25zdCB1cmkgb2Ygd2F0Y2hlci5yZXNvdXJjZXNUb1dhdGNoKSB7XG5cdFx0XHRcdFx0aWYgKGUuYWZmZWN0cyh1cmkpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9zY2hlZHVsZVJlZnJlc2goKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9zY2hlZHVsZVJlZnJlc2goKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRydWUgd2hlbiBgdXJpYCBpcyBvbmUgb2YgdGhlIHdvcmtzcGFjZSByb290cyBvciB0aGUgdXNlciBob21lIFx1MjAxNCBpLmUuIGFuXG5cdCAqIGFuY2VzdG9yLXdhbGsgYm91bmRhcnkuIFdpdGggYSBzaW5nbGUgcm9vdCB0aGlzIGlzIGV4YWN0bHkgdGhlIHByZXZpb3VzXG5cdCAqIGBpc0VxdWFsKHVyaSwgd29ya2luZ0RpcmVjdG9yeSkgfHwgaXNFcXVhbCh1cmksIHVzZXJIb21lKWAgY2hlY2suXG5cdCAqL1xuXHRwcml2YXRlIF9pc0Rpc2NvdmVyeUJvdW5kYXJ5KHVyaTogVVJJKTogYm9vbGVhbiB7XG5cdFx0aWYgKGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWwodXJpLCB0aGlzLl91c2VySG9tZSkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fd29ya2luZ0RpcmVjdG9yaWVzLnNvbWUocm9vdCA9PiBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5pc0VxdWFsKHVyaSwgcm9vdCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSB3b3Jrc3BhY2Ugcm9vdCB0aGF0IGNvbnRhaW5zIChvciBlcXVhbHMpIGB1cmlgLCBvciBgdW5kZWZpbmVkYCB3aGVuIGl0XG5cdCAqIGxpdmVzIHVuZGVyIG5vbmUgb2YgdGhlbS4gUHJlZmVycyB0aGUgbW9zdCBzcGVjaWZpYyByb290IHdoZW4gcm9vdHMgbmVzdC5cblx0ICovXG5cdHByaXZhdGUgX2NvbnRhaW5pbmdXb3Jrc3BhY2VSb290KHVyaTogVVJJKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgYmVzdDogVVJJIHwgdW5kZWZpbmVkO1xuXHRcdGZvciAoY29uc3Qgcm9vdCBvZiB0aGlzLl93b3JraW5nRGlyZWN0b3JpZXMpIHtcblx0XHRcdGlmIChleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5pc0VxdWFsT3JQYXJlbnQodXJpLCByb290KSAmJiAoIWJlc3QgfHwgcm9vdC5wYXRoLmxlbmd0aCA+IGJlc3QucGF0aC5sZW5ndGgpKSB7XG5cdFx0XHRcdGJlc3QgPSByb290O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gYmVzdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBNYXBzIGFuIFNESy1zdXBwbGllZCBgcHJvamVjdFBhdGhgIChhbiBmcyBwYXRoIHN0cmluZykgYmFjayB0byB0aGUgb3JpZ2luYWxcblx0ICogd29ya3NwYWNlLXJvb3Qge0BsaW5rIFVSSX0sIHByZXNlcnZpbmcgaXRzIHNjaGVtZS9hdXRob3JpdHkuIFJldHVybnNcblx0ICogYHVuZGVmaW5lZGAgd2hlbiB0aGUgcGF0aCBtYXRjaGVzIG5vbmUgb2YgdGhlIHJvb3RzLlxuXHQgKi9cblx0cHJpdmF0ZSBfcm9vdEZvclByb2plY3RQYXRoKHByb2plY3RQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdGlmICghcHJvamVjdFBhdGgpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuX3BhdGhUb1VyaShwcm9qZWN0UGF0aCk7XG5cdFx0cmV0dXJuIHRoaXMuX3dvcmtpbmdEaXJlY3Rvcmllcy5maW5kKHJvb3QgPT4gZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuaXNFcXVhbChyb290LCB0YXJnZXQpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgd29ya2luZy1kaXJlY3Rvcnkgcm9vdHMgdGhhdCBob29rcyBhcmUgZGlzY292ZXJlZCBmcm9tLlxuXHQgKlxuXHQgKiAqKkhvb2tzIGFyZSBkaXNjb3ZlcmVkIGZyb20gdGhlIFBSSU1BUlkgd29ya2luZyBkaXJlY3Rvcnkgb25seSoqIChpbmRleCAwIG9mXG5cdCAqIHtAbGluayBfd29ya2luZ0RpcmVjdG9yaWVzfSwgd2hpY2ggY2FsbGVycyBNVVNUIG9yZGVyIHByaW1hcnktZmlyc3QpLiBIb29rc1xuXHQgKiBmcm9tIG5vbi1wcmltYXJ5IHJvb3RzIGFyZSBpbnRlbnRpb25hbGx5IE5PVCBkaXNjb3ZlcmVkIGJlY2F1c2UgdGhlIENvcGlsb3Rcblx0ICogYWdlbnQgY3VycmVudGx5IGFwcGxpZXMgaG9va3MgZnJvbSBhIHNpbmdsZSBwcmltYXJ5IGRpcmVjdG9yeSBvbmx5LiBFdmVyeVxuXHQgKiBvdGhlciBjdXN0b21pemF0aW9uIHR5cGVzIChhZ2VudHMsIHNraWxscywgYW5kIGluc3RydWN0aW9ucykgYXJlIGRpc2NvdmVyZWRcblx0ICogYWNyb3NzIGFsbCByb290cy5cblx0ICpcblx0ICogRXhhbXBsZTogZm9yIHJvb3RzIGBbQiwgQSwgQ11gICh3aXRoIGBCYCBzZWxlY3RlZCBhcyBwcmltYXJ5KSwgaG9va3MgYXJlXG5cdCAqIGRpc2NvdmVyZWQgZnJvbSBgQmAgb25seTsgaG9va3MgdW5kZXIgYEFgL2BDYCBhcmUgaWdub3JlZC5cblx0ICpcblx0ICogVGhpcyBtYXkgZXhwYW5kIHRvIGFsbCByb290cyBpbiB0aGUgZnV0dXJlIFx1MjAxNCBzZWUgYE1VTFRJX1JPT1RfQ0hBTkdFUy5tZGAuXG5cdCAqL1xuXHRwcml2YXRlIGdldCBfaG9va1dvcmtpbmdEaXJlY3RvcmllcygpOiByZWFkb25seSBVUklbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3dvcmtpbmdEaXJlY3Rvcmllcy5zbGljZSgwLCAxKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgd3JpdGVDdXN0b21pemF0aW9uRGlzY292ZXJ5RGVidWdMb2cocGF5bG9hZDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIUNVU1RPTUlaQVRJT05fRElTQ09WRVJZX0RFQlVHX0xPR19QQVRIKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IG1rZGlyKG5vZGVEaXJuYW1lKENVU1RPTUlaQVRJT05fRElTQ09WRVJZX0RFQlVHX0xPR19QQVRIKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHRhd2FpdCBhcHBlbmRGaWxlKENVU1RPTUlaQVRJT05fRElTQ09WRVJZX0RFQlVHX0xPR19QQVRILCBgJHtKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHQuLi5wYXlsb2FkLFxuXHRcdFx0fSwgdW5kZWZpbmVkLCAyKX1cXG5gLCAndXRmOCcpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW1Nlc3Npb25DdXN0b21pemF0aW9uRGlzY292ZXJ5XSBGYWlsZWQgdG8gd3JpdGUgZGlzY292ZXJ5IGRlYnVnIGxvZzogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXREaXNjb3ZlcmVkRGlyZWN0b3JpZXMoY2xpZW50OiBDb3BpbG90Q2xpZW50LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHJlYWRvbmx5IElEaXNjb3ZlcmVkRGlyZWN0b3J5W10+IHtcblx0XHR0aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblxuXHRcdGNvbnN0IHA6IEFnZW50c0Rpc2NvdmVyUmVxdWVzdCA9IHsgcHJvamVjdFBhdGhzOiB0aGlzLl93b3JraW5nRGlyZWN0b3JpZXMubWFwKHVyaSA9PiB1cmkuZnNQYXRoKSB9O1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuZ2V0SG9va3NEaXNjb3ZlcnlQYXRocygpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUFnZW50SW5zdHJ1Y3Rpb25GaWxlc0J5Um9vdCA9IG5ldyBSZXNvdXJjZU1hcDxJRGlzY292ZXJlZEZpbGVbXT4oKTtcblx0XHRjb25zdCB1c2VyQWdlbnRJbnN0cnVjdGlvbkZpbGVzOiBJRGlzY292ZXJlZEZpbGVbXSA9IFtdO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IFthZ2VudERpc2NvdmVyeSwgaW5zdHJ1Y3Rpb25EaXNjb3ZlcnksIHNraWxsRGlzY292ZXJ5XSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0cmFjZUNhbmNlbGxhdGlvbkVycm9yKGNsaWVudC5ycGMuYWdlbnRzLmdldERpc2NvdmVyeVBhdGhzKHApLCB0b2tlbiksXG5cdFx0XHRcdHJhY2VDYW5jZWxsYXRpb25FcnJvcihjbGllbnQucnBjLmluc3RydWN0aW9ucy5nZXREaXNjb3ZlcnlQYXRocyhwKSwgdG9rZW4pLFxuXHRcdFx0XHRyYWNlQ2FuY2VsbGF0aW9uRXJyb3IoY2xpZW50LnJwYy5za2lsbHMuZ2V0RGlzY292ZXJ5UGF0aHMocCksIHRva2VuKVxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIFByb2Nlc3MgYWdlbnQgZGlzY292ZXJ5IHBhdGhzXG5cdFx0XHRmb3IgKGNvbnN0IGFnZW50UGF0aCBvZiBhZ2VudERpc2NvdmVyeT8ucGF0aHMgPz8gW10pIHtcblx0XHRcdFx0dGhyb3dJZkNhbmNlbGxlZCh0b2tlbik7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0XHR1cmk6IHRoaXMuX3BhdGhUb1VyaShhZ2VudFBhdGgucGF0aCksXG5cdFx0XHRcdFx0dHlwZTogRGlzY292ZXJlZFR5cGUuQWdlbnQsXG5cdFx0XHRcdFx0ZmlsZXM6IFtdLFxuXHRcdFx0XHRcdG5hbWU6IGJhc2VuYW1lKGFnZW50UGF0aC5wYXRoKSxcblx0XHRcdFx0XHR3cml0YWJsZTogdHJ1ZVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUHJvY2VzcyBpbnN0cnVjdGlvbiBkaXNjb3ZlcnkgcGF0aHNcblx0XHRcdGZvciAoY29uc3QgaW5zdHJ1Y3Rpb25QYXRoIG9mIGluc3RydWN0aW9uRGlzY292ZXJ5Py5wYXRocyA/PyBbXSkge1xuXHRcdFx0XHR0aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblx0XHRcdFx0aWYgKGluc3RydWN0aW9uUGF0aC5raW5kID09PSAnZmlsZScpIHtcblx0XHRcdFx0XHRjb25zdCBmaWxlVXJpID0gdGhpcy5fcGF0aFRvVXJpKGluc3RydWN0aW9uUGF0aC5wYXRoKTtcblx0XHRcdFx0XHRjb25zdCBkaXNjb3ZlcmVkRmlsZTogSURpc2NvdmVyZWRGaWxlID0geyB1cmk6IGZpbGVVcmksIGV0YWc6ICcnIH07XG5cdFx0XHRcdFx0Y29uc3QgY29udGFpbmluZ1Jvb3QgPSB0aGlzLl9jb250YWluaW5nV29ya3NwYWNlUm9vdChmaWxlVXJpKTtcblx0XHRcdFx0XHRpZiAoY29udGFpbmluZ1Jvb3QpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGZpbGVzID0gd29ya3NwYWNlQWdlbnRJbnN0cnVjdGlvbkZpbGVzQnlSb290LmdldChjb250YWluaW5nUm9vdCkgPz8gW107XG5cdFx0XHRcdFx0XHRmaWxlcy5wdXNoKGRpc2NvdmVyZWRGaWxlKTtcblx0XHRcdFx0XHRcdHdvcmtzcGFjZUFnZW50SW5zdHJ1Y3Rpb25GaWxlc0J5Um9vdC5zZXQoY29udGFpbmluZ1Jvb3QsIGZpbGVzKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWxPclBhcmVudChmaWxlVXJpLCB0aGlzLl91c2VySG9tZSkpIHtcblx0XHRcdFx0XHRcdHVzZXJBZ2VudEluc3RydWN0aW9uRmlsZXMucHVzaChkaXNjb3ZlcmVkRmlsZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGluc3RydWN0aW9uUGF0aC5raW5kID09PSAnZGlyZWN0b3J5Jykge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0XHRcdHVyaTogdGhpcy5fcGF0aFRvVXJpKGluc3RydWN0aW9uUGF0aC5wYXRoKSxcblx0XHRcdFx0XHRcdHR5cGU6IERpc2NvdmVyZWRUeXBlLkluc3RydWN0aW9uLFxuXHRcdFx0XHRcdFx0ZmlsZXM6IFtdLFxuXHRcdFx0XHRcdFx0bmFtZTogYmFzZW5hbWUoaW5zdHJ1Y3Rpb25QYXRoLnBhdGgpLFxuXHRcdFx0XHRcdFx0d3JpdGFibGU6IHRydWVcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBbcm9vdCwgZmlsZXNdIG9mIHdvcmtzcGFjZUFnZW50SW5zdHJ1Y3Rpb25GaWxlc0J5Um9vdCkge1xuXHRcdFx0XHRpZiAoZmlsZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0XHRcdHVyaTogcm9vdCxcblx0XHRcdFx0XHRcdHR5cGU6IERpc2NvdmVyZWRUeXBlLkFnZW50SW5zdHJ1Y3Rpb24sXG5cdFx0XHRcdFx0XHRmaWxlcyxcblx0XHRcdFx0XHRcdG5hbWU6ICcnLFxuXHRcdFx0XHRcdFx0d3JpdGFibGU6IGZhbHNlXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICh1c2VyQWdlbnRJbnN0cnVjdGlvbkZpbGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRcdHVyaTogdGhpcy5fdXNlckhvbWUsXG5cdFx0XHRcdFx0dHlwZTogRGlzY292ZXJlZFR5cGUuQWdlbnRJbnN0cnVjdGlvbixcblx0XHRcdFx0XHRmaWxlczogdXNlckFnZW50SW5zdHJ1Y3Rpb25GaWxlcyxcblx0XHRcdFx0XHRuYW1lOiAnJyxcblx0XHRcdFx0XHR3cml0YWJsZTogZmFsc2Vcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFByb2Nlc3Mgc2tpbGwgZGlzY292ZXJ5IHBhdGhzXG5cdFx0XHRmb3IgKGNvbnN0IHNraWxsUGF0aCBvZiBza2lsbERpc2NvdmVyeT8ucGF0aHMgPz8gW10pIHtcblx0XHRcdFx0dGhyb3dJZkNhbmNlbGxlZCh0b2tlbik7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0XHR1cmk6IHRoaXMuX3BhdGhUb1VyaShza2lsbFBhdGgucGF0aCksXG5cdFx0XHRcdFx0dHlwZTogRGlzY292ZXJlZFR5cGUuU2tpbGwsXG5cdFx0XHRcdFx0ZmlsZXM6IFtdLFxuXHRcdFx0XHRcdG5hbWU6IGJhc2VuYW1lKHNraWxsUGF0aC5wYXRoKSxcblx0XHRcdFx0XHR3cml0YWJsZTogdHJ1ZVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0aWYgKGVyciBpbnN0YW5jZW9mIENhbmNlbGxhdGlvbkVycm9yKSB7XG5cdFx0XHRcdHRocm93IGVycjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFtTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeV0gRXJyb3IgZ2V0dGluZyBkaXNjb3ZlcnkgcGF0aHM6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQuc29ydChjb21wYXJlRGlzY292ZXJlZERpcmVjdG9yeSk7XG5cdH1cblxuXHRwcml2YXRlIGdldEhvb2tzRGlzY292ZXJ5UGF0aHMoKTogSURpc2NvdmVyZWREaXJlY3RvcnlbXSB7XG5cdFx0Y29uc3QgYnlVcmkgPSBuZXcgUmVzb3VyY2VNYXA8SURpc2NvdmVyZWREaXJlY3Rvcnk+KCk7XG5cdFx0Y29uc3QgYWRkID0gKHVyaTogVVJJLCBuYW1lOiBzdHJpbmcpOiB2b2lkID0+IHtcblx0XHRcdGlmICghYnlVcmkuaGFzKHVyaSkpIHtcblx0XHRcdFx0YnlVcmkuc2V0KHVyaSwgeyB1cmksIHR5cGU6IERpc2NvdmVyZWRUeXBlLkhvb2ssIGZpbGVzOiBbXSwgbmFtZSwgd3JpdGFibGU6IHRydWUgfSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGZvciAoY29uc3Qgcm9vdCBvZiBzZWFyY2hSb290cy53b3Jrc3BhY2UpIHtcblx0XHRcdGlmIChyb290LnR5cGUgPT09IERpc2NvdmVyZWRUeXBlLkhvb2spIHtcblx0XHRcdFx0Ly8gSG9va3M6IHByaW1hcnkgd29ya2luZyBkaXJlY3Rvcnkgb25seSAoQ29waWxvdCBsaW1pdGF0aW9uKS5cblx0XHRcdFx0Zm9yIChjb25zdCB3b3JraW5nRGlyZWN0b3J5IG9mIHRoaXMuX2hvb2tXb3JraW5nRGlyZWN0b3JpZXMpIHtcblx0XHRcdFx0XHRhZGQoam9pblBhdGgod29ya2luZ0RpcmVjdG9yeSwgLi4ucm9vdC5wYXRoKSwgcm9vdC5uYW1lKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHJvb3Qgb2Ygc2VhcmNoUm9vdHMudXNlcikge1xuXHRcdFx0aWYgKHJvb3QudHlwZSA9PT0gRGlzY292ZXJlZFR5cGUuSG9vaykge1xuXHRcdFx0XHRhZGQoam9pblBhdGgodGhpcy5fdXNlckhvbWUsIC4uLnJvb3QucGF0aCksIHJvb3QubmFtZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qgcm9vdCBvZiBmaXhlZERpc2NvdmVyeUZpbGVzLndvcmtzcGFjZSkge1xuXHRcdFx0aWYgKHJvb3QudHlwZSA9PT0gRGlzY292ZXJlZFR5cGUuSG9vaykge1xuXHRcdFx0XHQvLyBIb29rczogcHJpbWFyeSB3b3JraW5nIGRpcmVjdG9yeSBvbmx5IChDb3BpbG90IGxpbWl0YXRpb24pLlxuXHRcdFx0XHRmb3IgKGNvbnN0IHdvcmtpbmdEaXJlY3Rvcnkgb2YgdGhpcy5faG9va1dvcmtpbmdEaXJlY3Rvcmllcykge1xuXHRcdFx0XHRcdGFkZChqb2luUGF0aCh3b3JraW5nRGlyZWN0b3J5LCAuLi5yb290LnBhdGgpLCBiYXNlbmFtZShqb2luUGF0aCh3b3JraW5nRGlyZWN0b3J5LCAuLi5yb290LnBhdGgpLnBhdGgpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHJvb3Qgb2YgZml4ZWREaXNjb3ZlcnlGaWxlcy51c2VyKSB7XG5cdFx0XHRpZiAocm9vdC50eXBlID09PSBEaXNjb3ZlcmVkVHlwZS5Ib29rKSB7XG5cdFx0XHRcdGFkZChqb2luUGF0aCh0aGlzLl91c2VySG9tZSwgLi4ucm9vdC5wYXRoKSwgYmFzZW5hbWUoam9pblBhdGgodGhpcy5fdXNlckhvbWUsIC4uLnJvb3QucGF0aCkucGF0aCkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gWy4uLmJ5VXJpLnZhbHVlcygpXTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3VwZGF0ZVdhdGNoZXJzKGRpc2NvdmVyZWREaXJlY3RvcmllczogcmVhZG9ubHkgSURpc2NvdmVyZWREaXJlY3RvcnlbXSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbmV4dFdhdGNoUm9vdFVyaXMgPSBuZXcgUmVzb3VyY2VNYXA8SVdhdGNoU3BlYz4oKTtcblx0XHRjb25zdCB0b1Jlc29sdmUgPSBuZXcgUmVzb3VyY2VTZXQoKTtcblx0XHRjb25zdCByZWN1cnNpdmVCeURpcmVjdG9yeSA9IG5ldyBSZXNvdXJjZU1hcDxib29sZWFuPigpO1xuXG5cdFx0Zm9yIChjb25zdCBkaXNjb3ZlcmVkRGlyIG9mIGRpc2NvdmVyZWREaXJlY3Rvcmllcykge1xuXHRcdFx0dGhyb3dJZkNhbmNlbGxlZCh0b2tlbik7XG5cblx0XHRcdGNvbnN0IGRpclVyaSA9IGRpc2NvdmVyZWREaXIudXJpO1xuXHRcdFx0Y29uc3QgcmVjdXJzaXZlID0gZGlzY292ZXJlZERpci50eXBlID09PSBEaXNjb3ZlcmVkVHlwZS5Ta2lsbCB8fFxuXHRcdFx0XHRkaXNjb3ZlcmVkRGlyLnR5cGUgPT09IERpc2NvdmVyZWRUeXBlLkluc3RydWN0aW9uIHx8XG5cdFx0XHRcdGRpc2NvdmVyZWREaXIudHlwZSA9PT0gRGlzY292ZXJlZFR5cGUuSG9vaztcblx0XHRcdHJlY3Vyc2l2ZUJ5RGlyZWN0b3J5LnNldChkaXJVcmksIHJlY3Vyc2l2ZSk7XG5cdFx0XHR0b1Jlc29sdmUuYWRkKGRpclVyaSk7XG5cblx0XHRcdGxldCBjdXJyZW50ID0gZGlyVXJpO1xuXHRcdFx0d2hpbGUgKCF0aGlzLl9pc0Rpc2NvdmVyeUJvdW5kYXJ5KGN1cnJlbnQpKSB7XG5cdFx0XHRcdGNvbnN0IHBhcmVudCA9IHVyaURpcm5hbWUoY3VycmVudCk7XG5cdFx0XHRcdGlmIChleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5pc0VxdWFsKHBhcmVudCwgY3VycmVudCkpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHR0b1Jlc29sdmUuYWRkKHBhcmVudCk7XG5cdFx0XHRcdGN1cnJlbnQgPSBwYXJlbnQ7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgZmlsZSBvZiBkaXNjb3ZlcmVkRGlyLmZpbGVzKSB7XG5cdFx0XHRcdHRocm93SWZDYW5jZWxsZWQodG9rZW4pO1xuXG5cdFx0XHRcdGxldCBjdXJyZW50RmlsZVBhdGggPSBmaWxlLnVyaTtcblx0XHRcdFx0d2hpbGUgKCF0aGlzLl9pc0Rpc2NvdmVyeUJvdW5kYXJ5KGN1cnJlbnRGaWxlUGF0aCkpIHtcblx0XHRcdFx0XHRjb25zdCBwYXJlbnQgPSB1cmlEaXJuYW1lKGN1cnJlbnRGaWxlUGF0aCk7XG5cdFx0XHRcdFx0aWYgKGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWwocGFyZW50LCBjdXJyZW50RmlsZVBhdGgpKSB7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dG9SZXNvbHZlLmFkZChwYXJlbnQpO1xuXHRcdFx0XHRcdGN1cnJlbnRGaWxlUGF0aCA9IHBhcmVudDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRocm93SWZDYW5jZWxsZWQodG9rZW4pO1xuXG5cdFx0Y29uc3QgdG9SZXNvbHZlQXJyYXkgPSBbLi4udG9SZXNvbHZlXTtcblx0XHRjb25zdCBzdGF0UmVzdWx0cyA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlc29sdmVBbGwodG9SZXNvbHZlQXJyYXkubWFwKHJlc291cmNlID0+ICh7IHJlc291cmNlIH0pKSk7XG5cdFx0Y29uc3QgZXhpc3RpbmdEaXJlY3RvcmllcyA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgc3RhdFJlc3VsdHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHN0YXRSZXN1bHRzW2ldO1xuXHRcdFx0aWYgKHJlc3VsdC5zdWNjZXNzICYmIHJlc3VsdC5zdGF0Py5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHRleGlzdGluZ0RpcmVjdG9yaWVzLmFkZCh0b1Jlc29sdmVBcnJheVtpXSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBkaXNjb3ZlcmVkRGlyIG9mIGRpc2NvdmVyZWREaXJlY3Rvcmllcykge1xuXHRcdFx0dGhyb3dJZkNhbmNlbGxlZCh0b2tlbik7XG5cblx0XHRcdGNvbnN0IGRpclVyaSA9IGRpc2NvdmVyZWREaXIudXJpO1xuXHRcdFx0Y29uc3QgcmVjdXJzaXZlID0gcmVjdXJzaXZlQnlEaXJlY3RvcnkuZ2V0KGRpclVyaSkgPz8gZmFsc2U7XG5cdFx0XHRpZiAoZXhpc3RpbmdEaXJlY3Rvcmllcy5oYXMoZGlyVXJpKSkge1xuXHRcdFx0XHRhZGRXYXRjaChuZXh0V2F0Y2hSb290VXJpcywgZGlyVXJpLCByZWN1cnNpdmUsIGRpclVyaSk7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBjdXJyZW50ID0gZGlyVXJpO1xuXHRcdFx0d2hpbGUgKCF0aGlzLl9pc0Rpc2NvdmVyeUJvdW5kYXJ5KGN1cnJlbnQpKSB7XG5cdFx0XHRcdGNvbnN0IHBhcmVudCA9IHVyaURpcm5hbWUoY3VycmVudCk7XG5cdFx0XHRcdGlmIChleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5pc0VxdWFsKHBhcmVudCwgY3VycmVudCkpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZXhpc3RpbmdEaXJlY3Rvcmllcy5oYXMocGFyZW50KSkge1xuXHRcdFx0XHRcdGFkZFdhdGNoKG5leHRXYXRjaFJvb3RVcmlzLCBwYXJlbnQsIGZhbHNlLCBjdXJyZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjdXJyZW50ID0gcGFyZW50O1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IGZpbGUgb2YgZGlzY292ZXJlZERpci5maWxlcykge1xuXHRcdFx0XHR0aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblxuXHRcdFx0XHRsZXQgY3VycmVudEZpbGVQYXRoID0gZmlsZS51cmk7XG5cdFx0XHRcdHdoaWxlICghdGhpcy5faXNEaXNjb3ZlcnlCb3VuZGFyeShjdXJyZW50RmlsZVBhdGgpKSB7XG5cdFx0XHRcdFx0Y29uc3QgcGFyZW50ID0gdXJpRGlybmFtZShjdXJyZW50RmlsZVBhdGgpO1xuXHRcdFx0XHRcdGlmIChleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5pc0VxdWFsKHBhcmVudCwgY3VycmVudEZpbGVQYXRoKSkge1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChleGlzdGluZ0RpcmVjdG9yaWVzLmhhcyhwYXJlbnQpKSB7XG5cdFx0XHRcdFx0XHRhZGRXYXRjaChuZXh0V2F0Y2hSb290VXJpcywgcGFyZW50LCBmYWxzZSwgY3VycmVudEZpbGVQYXRoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y3VycmVudEZpbGVQYXRoID0gcGFyZW50O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVjb25jaWxlV2F0Y2hlcnMobmV4dFdhdGNoUm9vdFVyaXMpO1xuXHR9XG5cblxuXHRwdWJsaWMgYXN5bmMgZGlzY292ZXIoY2xpZW50OiBDb3BpbG90Q2xpZW50LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHJlYWRvbmx5IERpcmVjdG9yeUN1c3RvbWl6YXRpb25bXT4ge1xuXHRcdGF3YWl0IHRoaXMud3JpdGVDdXN0b21pemF0aW9uRGlzY292ZXJ5RGVidWdMb2coe1xuXHRcdFx0bWV0aG9kOiAnZGlzY292ZXInLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiB0aGlzLl93b3JraW5nRGlyZWN0b3JpZXMubWFwKGQgPT4gZC50b1N0cmluZygpKSxcblx0XHRcdHVzZXJIb21lOiB0aGlzLl91c2VySG9tZS50b1N0cmluZygpLFxuXHRcdH0pO1xuXHRcdGlmICghdGhpcy5fZGlzY292ZXJlZERpcmVjdG9yaWVzKSB7XG5cdFx0XHR0aGlzLl9kaXNjb3ZlcmVkRGlyZWN0b3JpZXMgPSBhd2FpdCB0aGlzLmdldERpc2NvdmVyZWREaXJlY3RvcmllcyhjbGllbnQsIHRva2VuKTtcblx0XHR9XG5cblx0XHR0aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblxuXHRcdGNvbnN0IHA6IEFnZW50c0Rpc2NvdmVyUmVxdWVzdCA9IHsgcHJvamVjdFBhdGhzOiB0aGlzLl93b3JraW5nRGlyZWN0b3JpZXMubWFwKHVyaSA9PiB1cmkuZnNQYXRoKSB9O1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IFthZ2VudHMsIHJ1bGVzLCBza2lsbHMsIGhvb2tzXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0dGhpcy5kaXNjb3ZlckFnZW50cyhwLCBjbGllbnQsIHRva2VuKSxcblx0XHRcdFx0dGhpcy5kaXNjb3ZlclJ1bGVzKHAsIGNsaWVudCwgdG9rZW4pLFxuXHRcdFx0XHR0aGlzLmRpc2NvdmVyU2tpbGxzKHAsIGNsaWVudCwgdG9rZW4pLFxuXHRcdFx0XHR0aGlzLmRpc2NvdmVySG9va3ModG9rZW4pLFxuXHRcdFx0XHR0aGlzLl91cGRhdGVXYXRjaGVycyh0aGlzLl9kaXNjb3ZlcmVkRGlyZWN0b3JpZXMsIHRva2VuKVxuXHRcdFx0XSk7XG5cdFx0XHR0aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblx0XHRcdGNvbnN0IHJlc3VsdDogRGlyZWN0b3J5Q3VzdG9taXphdGlvbltdID0gW107XG5cdFx0XHRhd2FpdCB0aGlzLnRvRGlyZWN0b3J5Q3VzdG9taXphdGlvbnMoQ3VzdG9taXphdGlvblR5cGUuQWdlbnQsIGFnZW50cywgdGhpcy5fZGlzY292ZXJlZERpcmVjdG9yaWVzLCByZXN1bHQpO1xuXHRcdFx0YXdhaXQgdGhpcy50b0RpcmVjdG9yeUN1c3RvbWl6YXRpb25zKEN1c3RvbWl6YXRpb25UeXBlLlJ1bGUsIHJ1bGVzLCB0aGlzLl9kaXNjb3ZlcmVkRGlyZWN0b3JpZXMsIHJlc3VsdCk7XG5cdFx0XHRhd2FpdCB0aGlzLnRvRGlyZWN0b3J5Q3VzdG9taXphdGlvbnMoQ3VzdG9taXphdGlvblR5cGUuU2tpbGwsIHNraWxscywgdGhpcy5fZGlzY292ZXJlZERpcmVjdG9yaWVzLCByZXN1bHQpO1xuXHRcdFx0YXdhaXQgdGhpcy50b0RpcmVjdG9yeUN1c3RvbWl6YXRpb25zKEN1c3RvbWl6YXRpb25UeXBlLkhvb2ssIGhvb2tzLCB0aGlzLl9kaXNjb3ZlcmVkRGlyZWN0b3JpZXMsIHJlc3VsdCk7XG5cdFx0XHRjb25zdCBzb3J0ZWRSZXN1bHQgPSByZXN1bHQuc29ydChjb21wYXJlRGlyZWN0b3J5Q3VzdG9taXphdGlvbik7XG5cdFx0XHRhd2FpdCB0aGlzLndyaXRlQ3VzdG9taXphdGlvbkRpc2NvdmVyeURlYnVnTG9nKHtcblx0XHRcdFx0bWV0aG9kOiAnZGlzY292ZXInLFxuXHRcdFx0XHRyZXN1bHQ6IHNvcnRlZFJlc3VsdC5tYXAoY3VzdG9taXphdGlvbiA9PiAoe1xuXHRcdFx0XHRcdGNvbnRlbnRzOiBjdXN0b21pemF0aW9uLmNvbnRlbnRzLFxuXHRcdFx0XHRcdHVyaTogY3VzdG9taXphdGlvbi51cmksXG5cdFx0XHRcdFx0Y2hpbGRyZW46IChjdXN0b21pemF0aW9uLmNoaWxkcmVuID8/IFtdKS5tYXAoY2hpbGQgPT4gKHsgdHlwZTogY2hpbGQudHlwZSwgdXJpOiBjaGlsZC51cmksIG5hbWU6IGNoaWxkLm5hbWUgfSkpLFxuXHRcdFx0XHR9KSksXG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiBzb3J0ZWRSZXN1bHQ7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnldIEVycm9yIGR1cmluZyBkaXNjb3Zlcnk6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZGlzY292ZXJBZ2VudHMoZGlzY292ZXJ5UmVxdWVzdDogQWdlbnRzRGlzY292ZXJSZXF1ZXN0LCBjbGllbnQ6IENvcGlsb3RDbGllbnQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8QWdlbnRDdXN0b21pemF0aW9uW10+IHtcblx0XHRjb25zdCBhZ2VudHM6IEFnZW50Q3VzdG9taXphdGlvbltdID0gW107XG5cblx0XHRjb25zdCBhZ2VudERpc2NvdmVyeSA9IGF3YWl0IHJhY2VDYW5jZWxsYXRpb25FcnJvcihjbGllbnQucnBjLmFnZW50cy5kaXNjb3ZlcihkaXNjb3ZlcnlSZXF1ZXN0KSwgdG9rZW4pO1xuXHRcdGZvciAoY29uc3QgYWdlbnQgb2YgYWdlbnREaXNjb3ZlcnkuYWdlbnRzKSB7XG5cdFx0XHRpZiAoYWdlbnQucGF0aCkge1xuXHRcdFx0XHRjb25zdCB1cmkgPSB0aGlzLl9wYXRoVG9VcmkoYWdlbnQucGF0aCk7XG5cdFx0XHRcdGFnZW50cy5wdXNoKHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuQWdlbnQsIHVyaTogdXJpLnRvU3RyaW5nKCksIGlkOiBhZ2VudC5pZCwgbmFtZTogYWdlbnQubmFtZSwgZGVzY3JpcHRpb246IGFnZW50LmRlc2NyaXB0aW9uLCBfbWV0YTogdG9BZ2VudEN1c3RvbWl6YXRpb25NZXRhKHsgdXNlckludm9jYWJsZTogYWdlbnQudXNlckludm9jYWJsZSB9KSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGFnZW50cztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZGlzY292ZXJSdWxlcyhkaXNjb3ZlcnlSZXF1ZXN0OiBBZ2VudHNEaXNjb3ZlclJlcXVlc3QsIGNsaWVudDogQ29waWxvdENsaWVudCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxSdWxlQ3VzdG9taXphdGlvbltdPiB7XG5cdFx0Y29uc3QgcnVsZXM6IFJ1bGVDdXN0b21pemF0aW9uW10gPSBbXTtcblx0XHRjb25zdCBzZWVuUnVsZVVyaXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRcdGNvbnN0IGluc3RydWN0aW9uRGlzY292ZXJ5ID0gYXdhaXQgcmFjZUNhbmNlbGxhdGlvbkVycm9yKGNsaWVudC5ycGMuaW5zdHJ1Y3Rpb25zLmRpc2NvdmVyKGRpc2NvdmVyeVJlcXVlc3QpLCB0b2tlbik7XG5cdFx0YXdhaXQgdGhpcy53cml0ZUN1c3RvbWl6YXRpb25EaXNjb3ZlcnlEZWJ1Z0xvZyh7XG5cdFx0XHRtZXRob2Q6ICdkaXNjb3ZlclJ1bGVzLmluc3RydWN0aW9ucy5kaXNjb3ZlcicsXG5cdFx0XHRzb3VyY2VzOiBpbnN0cnVjdGlvbkRpc2NvdmVyeS5zb3VyY2VzLm1hcChzb3VyY2UgPT4gKHtcblx0XHRcdFx0aWQ6IHNvdXJjZS5pZCxcblx0XHRcdFx0bGFiZWw6IHNvdXJjZS5sYWJlbCxcblx0XHRcdFx0c291cmNlUGF0aDogc291cmNlLnNvdXJjZVBhdGgsXG5cdFx0XHRcdGFwcGx5VG86IHNvdXJjZS5hcHBseVRvLFxuXHRcdFx0XHR0eXBlOiBzb3VyY2UudHlwZSxcblx0XHRcdH0pKSxcblx0XHR9KTtcblxuXHRcdGZvciAoY29uc3QgaW5zdHJ1Y3Rpb24gb2YgaW5zdHJ1Y3Rpb25EaXNjb3Zlcnkuc291cmNlcykge1xuXHRcdFx0bGV0IHVyaTogVVJJO1xuXHRcdFx0aWYgKGlzQWJzb2x1dGUoaW5zdHJ1Y3Rpb24uc291cmNlUGF0aCkpIHtcblx0XHRcdFx0dXJpID0gdGhpcy5fcGF0aFRvVXJpKGluc3RydWN0aW9uLnNvdXJjZVBhdGgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gUmVzb2x2ZSB0aGUgcmVsYXRpdmUgc291cmNlIGFnYWluc3QgdGhlIHdvcmtzcGFjZSByb290IHRoZSBTREsgYXR0cmlidXRlZFxuXHRcdFx0XHQvLyBpdCB0byAoYHByb2plY3RQYXRoYCBkaXNhbWJpZ3VhdGVzIHNhbWUtbmFtZWQgZmlsZXMgYWNyb3NzIG11bHRpcGxlIHJvb3RzKS5cblx0XHRcdFx0Ly8gRmFsbCBiYWNrIHRvIHRoZSBwcmltYXJ5IHJvb3QgZm9yIHNvdXJjZXMgd2l0aG91dCBhbiBhdHRyaWJ1dGVkIHByb2plY3QuXG5cdFx0XHRcdGNvbnN0IGFuY2hvciA9IHRoaXMuX3Jvb3RGb3JQcm9qZWN0UGF0aChpbnN0cnVjdGlvbi5wcm9qZWN0UGF0aCkgPz8gdGhpcy5fd29ya2luZ0RpcmVjdG9yaWVzWzBdO1xuXHRcdFx0XHR1cmkgPSBqb2luUGF0aChhbmNob3IsIGluc3RydWN0aW9uLnNvdXJjZVBhdGgpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdXJpU3RyaW5nID0gdXJpLnRvU3RyaW5nKCk7XG5cdFx0XHRydWxlcy5wdXNoKHtcblx0XHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuUnVsZSxcblx0XHRcdFx0dXJpOiB1cmlTdHJpbmcsXG5cdFx0XHRcdGlkOiBpbnN0cnVjdGlvbi5pZCxcblx0XHRcdFx0bmFtZTogaW5zdHJ1Y3Rpb24ubGFiZWwsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBpbnN0cnVjdGlvbi5kZXNjcmlwdGlvbixcblx0XHRcdFx0Z2xvYnM6IGluc3RydWN0aW9uLmFwcGx5VG8gPyBbLi4uaW5zdHJ1Y3Rpb24uYXBwbHlUb10gOiB1bmRlZmluZWQsXG5cdFx0XHRcdGFsd2F5c0FwcGx5OiB0aGlzLl9pc0FnZW50SW5zdHJ1Y3Rpb25Tb3VyY2UoaW5zdHJ1Y3Rpb24pLFxuXHRcdFx0fSk7XG5cdFx0XHRzZWVuUnVsZVVyaXMuYWRkKHVyaVN0cmluZyk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBkaXJlY3Rvcnkgb2YgdGhpcy5fZGlzY292ZXJlZERpcmVjdG9yaWVzID8/IFtdKSB7XG5cdFx0XHRpZiAoZGlyZWN0b3J5LnR5cGUgIT09IERpc2NvdmVyZWRUeXBlLkFnZW50SW5zdHJ1Y3Rpb24pIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgZmlsZSBvZiBkaXJlY3RvcnkuZmlsZXMpIHtcblx0XHRcdFx0Y29uc3QgdXJpID0gZmlsZS51cmkudG9TdHJpbmcoKTtcblx0XHRcdFx0aWYgKHNlZW5SdWxlVXJpcy5oYXModXJpKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cnVsZXMucHVzaCh7XG5cdFx0XHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuUnVsZSxcblx0XHRcdFx0XHR1cmksXG5cdFx0XHRcdFx0aWQ6IGN1c3RvbWl6YXRpb25JZCh1cmkpLFxuXHRcdFx0XHRcdG5hbWU6IGJhc2VuYW1lKGZpbGUudXJpLnBhdGgpLFxuXHRcdFx0XHRcdGFsd2F5c0FwcGx5OiB0cnVlLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0c2VlblJ1bGVVcmlzLmFkZCh1cmkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBydWxlcztcblx0fVxuXG5cdHByaXZhdGUgX2lzQWdlbnRJbnN0cnVjdGlvblNvdXJjZShpbnN0cnVjdGlvbjogSW5zdHJ1Y3Rpb25Tb3VyY2UpOiBib29sZWFuIHtcblx0XHRpZiAoaW5zdHJ1Y3Rpb24udHlwZSA9PT0gJ2hvbWUnIHx8IGluc3RydWN0aW9uLnR5cGUgPT09ICdyZXBvJyB8fCBpbnN0cnVjdGlvbi50eXBlID09PSAnbW9kZWwnKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBmaWxlbmFtZSA9IGJhc2VuYW1lKGluc3RydWN0aW9uLnNvdXJjZVBhdGgpLnRvTG93ZXJDYXNlKCk7XG5cdFx0cmV0dXJuIEFHRU5UX0lOU1RSVUNUSU9OX0ZJTEVOQU1FUy5oYXMoZmlsZW5hbWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkaXNjb3ZlclNraWxscyhkaXNjb3ZlcnlSZXF1ZXN0OiBBZ2VudHNEaXNjb3ZlclJlcXVlc3QsIGNsaWVudDogQ29waWxvdENsaWVudCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxTa2lsbEN1c3RvbWl6YXRpb25bXT4ge1xuXHRcdGNvbnN0IHNraWxsczogU2tpbGxDdXN0b21pemF0aW9uW10gPSBbXTtcblxuXHRcdGNvbnN0IHNraWxsRGlzY292ZXJ5ID0gYXdhaXQgcmFjZUNhbmNlbGxhdGlvbkVycm9yKGNsaWVudC5ycGMuc2tpbGxzLmRpc2NvdmVyKGRpc2NvdmVyeVJlcXVlc3QpLCB0b2tlbik7XG5cdFx0Zm9yIChjb25zdCBza2lsbCBvZiBza2lsbERpc2NvdmVyeS5za2lsbHMpIHtcblx0XHRcdGlmIChza2lsbC5wYXRoKSB7XG5cdFx0XHRcdGNvbnN0IHVyaSA9IHRoaXMuX3BhdGhUb1VyaShza2lsbC5wYXRoKTtcblx0XHRcdFx0c2tpbGxzLnB1c2goeyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5Ta2lsbCwgdXJpOiB1cmkudG9TdHJpbmcoKSwgaWQ6IHNraWxsLnBhdGgsIG5hbWU6IHNraWxsLm5hbWUsIGRlc2NyaXB0aW9uOiBza2lsbC5kZXNjcmlwdGlvbiB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHNraWxscztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZGlzY292ZXJIb29rcyh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPEhvb2tDdXN0b21pemF0aW9uW10+IHtcblx0XHRjb25zdCBzZWVuID0gbmV3IFJlc291cmNlU2V0KCk7XG5cdFx0Y29uc3QgZGlzY292ZXJlZERpcmVjdG9yaWVzOiBJRGlzY292ZXJlZERpcmVjdG9yeVtdID0gW107XG5cblx0XHRjb25zdCBob29rUm9vdHNXb3Jrc3BhY2UgPSBzZWFyY2hSb290cy53b3Jrc3BhY2UuZmlsdGVyKHJvb3QgPT4gcm9vdC50eXBlID09PSBEaXNjb3ZlcmVkVHlwZS5Ib29rKTtcblx0XHRjb25zdCBob29rUm9vdHNVc2VyID0gc2VhcmNoUm9vdHMudXNlci5maWx0ZXIocm9vdCA9PiByb290LnR5cGUgPT09IERpc2NvdmVyZWRUeXBlLkhvb2spO1xuXHRcdGNvbnN0IGZpeGVkSG9va0ZpbGVzV29ya3NwYWNlID0gZml4ZWREaXNjb3ZlcnlGaWxlcy53b3Jrc3BhY2UuZmlsdGVyKHJvb3QgPT4gcm9vdC50eXBlID09PSBEaXNjb3ZlcmVkVHlwZS5Ib29rKTtcblx0XHRjb25zdCBmaXhlZEhvb2tGaWxlc1VzZXIgPSBmaXhlZERpc2NvdmVyeUZpbGVzLnVzZXIuZmlsdGVyKHJvb3QgPT4gcm9vdC50eXBlID09PSBEaXNjb3ZlcmVkVHlwZS5Ib29rKTtcblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdC8vIEhvb2tzOiBwcmltYXJ5IHdvcmtpbmcgZGlyZWN0b3J5IG9ubHkgKENvcGlsb3QgbGltaXRhdGlvbiBcdTIwMTQgc2VlIF9ob29rV29ya2luZ0RpcmVjdG9yaWVzKS5cblx0XHRcdC4uLnRoaXMuX2hvb2tXb3JraW5nRGlyZWN0b3JpZXMuZmxhdE1hcCh3b3JraW5nRGlyZWN0b3J5ID0+XG5cdFx0XHRcdGhvb2tSb290c1dvcmtzcGFjZS5tYXAocm9vdCA9PiB0aGlzLl9kaXNjb3Zlckhvb2tSb290KHdvcmtpbmdEaXJlY3RvcnksIHJvb3QsIHNlZW4sIGRpc2NvdmVyZWREaXJlY3RvcmllcywgdG9rZW4pKSksXG5cdFx0XHQuLi5ob29rUm9vdHNVc2VyLm1hcChyb290ID0+IHRoaXMuX2Rpc2NvdmVySG9va1Jvb3QodGhpcy5fdXNlckhvbWUsIHJvb3QsIHNlZW4sIGRpc2NvdmVyZWREaXJlY3RvcmllcywgdG9rZW4pKSxcblx0XHRcdC4uLnRoaXMuX2hvb2tXb3JraW5nRGlyZWN0b3JpZXMubWFwKHdvcmtpbmdEaXJlY3RvcnkgPT5cblx0XHRcdFx0dGhpcy5fZGlzY292ZXJGaXhlZEhvb2tGaWxlcyh3b3JraW5nRGlyZWN0b3J5LCBmaXhlZEhvb2tGaWxlc1dvcmtzcGFjZSwgc2VlbiwgZGlzY292ZXJlZERpcmVjdG9yaWVzLCB0b2tlbikpLFxuXHRcdFx0dGhpcy5fZGlzY292ZXJGaXhlZEhvb2tGaWxlcyh0aGlzLl91c2VySG9tZSwgZml4ZWRIb29rRmlsZXNVc2VyLCBzZWVuLCBkaXNjb3ZlcmVkRGlyZWN0b3JpZXMsIHRva2VuKSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IGhvb2tzOiBIb29rQ3VzdG9taXphdGlvbltdID0gW107XG5cdFx0Zm9yIChjb25zdCBkaXJlY3Rvcnkgb2YgZGlzY292ZXJlZERpcmVjdG9yaWVzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGZpbGUgb2YgZGlyZWN0b3J5LmZpbGVzKSB7XG5cdFx0XHRcdGNvbnN0IHVyaSA9IGZpbGUudXJpLnRvU3RyaW5nKCk7XG5cdFx0XHRcdGhvb2tzLnB1c2goe1xuXHRcdFx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLkhvb2ssXG5cdFx0XHRcdFx0aWQ6IGN1c3RvbWl6YXRpb25JZCh1cmkpLFxuXHRcdFx0XHRcdHVyaSxcblx0XHRcdFx0XHRuYW1lOiBiYXNlbmFtZShmaWxlLnVyaS5wYXRoKSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGhvb2tzLnNvcnQoKGEsIGIpID0+IGNvbXBhcmVTdHJpbmdzKGEudXJpLCBiLnVyaSkpO1xuXHRcdHJldHVybiBob29rcztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Rpc2NvdmVySG9va1Jvb3QoYmFzZTogVVJJLCByb290OiBJU2VhcmNoUm9vdCwgc2VlbjogUmVzb3VyY2VTZXQsIHJlc3VsdDogSURpc2NvdmVyZWREaXJlY3RvcnlbXSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgcm9vdFVyaSA9IGpvaW5QYXRoKGJhc2UsIC4uLnJvb3QucGF0aCk7XG5cdFx0bGV0IHN0YXQ6IElGaWxlU3RhdFdpdGhNZXRhZGF0YSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0c3RhdCA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlc29sdmUocm9vdFVyaSwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBSb290IGRvZXMgbm90IGV4aXN0IChvciBpcyB1bnJlYWRhYmxlKSBcdTIwMTQgc3RpbGwgZGlzY292ZXIgYXMgYW4gZW1wdHkgc291cmNlIGZvbGRlci5cblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fc2NhbkZvckhvb2tzKHJvb3QsIHJvb3RVcmksIHN0YXQsIHNlZW4sIHJlc3VsdCwgdG9rZW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZGlzY292ZXJGaXhlZEhvb2tGaWxlcyhiYXNlOiBVUkksIHJvb3RzOiByZWFkb25seSBJRml4ZWREaXNjb3ZlcnlGaWxlW10sIHNlZW46IFJlc291cmNlU2V0LCByZXN1bHQ6IElEaXNjb3ZlcmVkRGlyZWN0b3J5W10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGZvciAoY29uc3Qgcm9vdCBvZiByb290cykge1xuXHRcdFx0dGhyb3dJZkNhbmNlbGxlZCh0b2tlbik7XG5cblx0XHRcdGNvbnN0IHJvb3RVcmkgPSBqb2luUGF0aChiYXNlLCAuLi5yb290LnBhdGgpO1xuXHRcdFx0Y29uc3QgZmlsZXM6IElEaXNjb3ZlcmVkRmlsZVtdID0gW107XG5cdFx0XHRsZXQgc3RhdDogSUZpbGVTdGF0V2l0aE1ldGFkYXRhIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0c3RhdCA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlc29sdmUocm9vdFVyaSwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gUm9vdCBkb2VzIG5vdCBleGlzdCAob3IgaXMgdW5yZWFkYWJsZSkgXHUyMDE0IHN0aWxsIGRpc2NvdmVyIGFzIGFuIGVtcHR5IHNvdXJjZSBmb2xkZXIuXG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2Ygc3RhdD8uY2hpbGRyZW4gPz8gW10pIHtcblx0XHRcdFx0dGhyb3dJZkNhbmNlbGxlZCh0b2tlbik7XG5cblx0XHRcdFx0aWYgKGNoaWxkLmlzRmlsZSAmJiByb290LmZpbGVuYW1lcy5pbmNsdWRlcyhjaGlsZC5uYW1lKSkge1xuXHRcdFx0XHRcdGlmICghc2Vlbi5oYXMoY2hpbGQucmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRzZWVuLmFkZChjaGlsZC5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0XHRmaWxlcy5wdXNoKHsgdXJpOiBjaGlsZC5yZXNvdXJjZSwgZXRhZzogY2hpbGQuZXRhZyB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChmaWxlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHsgdXJpOiByb290VXJpLCB0eXBlOiBEaXNjb3ZlcmVkVHlwZS5Ib29rLCBmaWxlczogZmlsZXMuc29ydChjb21wYXJlRGlzY292ZXJlZEZpbGUpLCBuYW1lOiBiYXNlbmFtZShyb290VXJpLnBhdGgpLCB3cml0YWJsZTogdHJ1ZSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHRvRGlyZWN0b3J5Q3VzdG9taXphdGlvbnModHlwZTogQ2hpbGRDdXN0b21pemF0aW9uVHlwZSwgY3VzdG9taXphdGlvbnM6IHJlYWRvbmx5IENoaWxkQ3VzdG9taXphdGlvbltdLCBhbGxEaXNjb3ZlcmVkRGlyZWN0b3JpZXM6IHJlYWRvbmx5IElEaXNjb3ZlcmVkRGlyZWN0b3J5W10sIHJlc3VsdDogRGlyZWN0b3J5Q3VzdG9taXphdGlvbltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGlzY292ZXJlZERpcmVjdG9yaWVzID0gYWxsRGlzY292ZXJlZERpcmVjdG9yaWVzLmZpbHRlcihkID0+IHtcblx0XHRcdGlmICh0eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5BZ2VudCkge1xuXHRcdFx0XHRyZXR1cm4gZC50eXBlID09PSBEaXNjb3ZlcmVkVHlwZS5BZ2VudDtcblx0XHRcdH1cblx0XHRcdGlmICh0eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5SdWxlKSB7XG5cdFx0XHRcdHJldHVybiBkLnR5cGUgPT09IERpc2NvdmVyZWRUeXBlLkluc3RydWN0aW9uIHx8IGQudHlwZSA9PT0gRGlzY292ZXJlZFR5cGUuQWdlbnRJbnN0cnVjdGlvbjtcblx0XHRcdH1cblx0XHRcdGlmICh0eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5Ib29rKSB7XG5cdFx0XHRcdHJldHVybiBkLnR5cGUgPT09IERpc2NvdmVyZWRUeXBlLkhvb2s7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZC50eXBlID09PSBEaXNjb3ZlcmVkVHlwZS5Ta2lsbDtcblx0XHR9KTtcblx0XHRjb25zdCBjYW5kaWRhdGVPdXRwdXREaXJlY3RvcmllcyA9IHR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLlJ1bGVcblx0XHRcdD8gZGlzY292ZXJlZERpcmVjdG9yaWVzLmZpbHRlcihkID0+IGQudHlwZSAhPT0gRGlzY292ZXJlZFR5cGUuQWdlbnRJbnN0cnVjdGlvbiB8fCB0aGlzLl9pc0Rpc2NvdmVyeUJvdW5kYXJ5KGQudXJpKSlcblx0XHRcdDogZGlzY292ZXJlZERpcmVjdG9yaWVzO1xuXHRcdGNvbnN0IG91dHB1dERpcmVjdG9yaWVzID0gdHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuU2tpbGxcblx0XHRcdD8gY2FuZGlkYXRlT3V0cHV0RGlyZWN0b3JpZXMuZmlsdGVyKGRpcmVjdG9yeSA9PiAhY2FuZGlkYXRlT3V0cHV0RGlyZWN0b3JpZXMuc29tZShjYW5kaWRhdGUgPT5cblx0XHRcdFx0IWV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWwoZGlyZWN0b3J5LnVyaSwgY2FuZGlkYXRlLnVyaSlcblx0XHRcdFx0JiYgZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuaXNFcXVhbE9yUGFyZW50KGRpcmVjdG9yeS51cmksIGNhbmRpZGF0ZS51cmkpXG5cdFx0XHQpKVxuXHRcdFx0OiBjYW5kaWRhdGVPdXRwdXREaXJlY3Rvcmllcztcblx0XHRjb25zdCBieVBhcmVudCA9IG5ldyBSZXNvdXJjZU1hcDx7IHJlYWRvbmx5IHVyaTogVVJJOyByZWFkb25seSBuYW1lOiBzdHJpbmc7IHJlYWRvbmx5IHdyaXRhYmxlOiBib29sZWFuOyByZWFkb25seSBjaGlsZHJlbjogQ2hpbGRDdXN0b21pemF0aW9uW10gfT4oKTtcblx0XHRmb3IgKGNvbnN0IGRpc2NvdmVyZWREaXJlY3Rvcnkgb2Ygb3V0cHV0RGlyZWN0b3JpZXMpIHtcblx0XHRcdGJ5UGFyZW50LnNldChkaXNjb3ZlcmVkRGlyZWN0b3J5LnVyaSwge1xuXHRcdFx0XHR1cmk6IGRpc2NvdmVyZWREaXJlY3RvcnkudXJpLFxuXHRcdFx0XHRuYW1lOiBkaXNjb3ZlcmVkRGlyZWN0b3J5Lm5hbWUgfHwgYmFzZW5hbWUoZGlzY292ZXJlZERpcmVjdG9yeS51cmkucGF0aCksXG5cdFx0XHRcdHdyaXRhYmxlOiBkaXNjb3ZlcmVkRGlyZWN0b3J5LndyaXRhYmxlLFxuXHRcdFx0XHRjaGlsZHJlbjogW11cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZpeGVkSG9va0RpcmVjdG9yeVVyaXMgPSB0eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5Ib29rXG5cdFx0XHQ/IG5ldyBSZXNvdXJjZVNldChbXG5cdFx0XHRcdC8vIEhvb2tzOiBwcmltYXJ5IHdvcmtpbmcgZGlyZWN0b3J5IG9ubHkgKENvcGlsb3QgbGltaXRhdGlvbikuXG5cdFx0XHRcdC4uLnRoaXMuX2hvb2tXb3JraW5nRGlyZWN0b3JpZXMuZmxhdE1hcCh3b3JraW5nRGlyZWN0b3J5ID0+IGZpeGVkRGlzY292ZXJ5RmlsZXMud29ya3NwYWNlXG5cdFx0XHRcdFx0LmZpbHRlcihyb290ID0+IHJvb3QudHlwZSA9PT0gRGlzY292ZXJlZFR5cGUuSG9vaylcblx0XHRcdFx0XHQubWFwKHJvb3QgPT4gam9pblBhdGgod29ya2luZ0RpcmVjdG9yeSwgLi4ucm9vdC5wYXRoKSkpLFxuXHRcdFx0XHQuLi5maXhlZERpc2NvdmVyeUZpbGVzLnVzZXJcblx0XHRcdFx0XHQuZmlsdGVyKHJvb3QgPT4gcm9vdC50eXBlID09PSBEaXNjb3ZlcmVkVHlwZS5Ib29rKVxuXHRcdFx0XHRcdC5tYXAocm9vdCA9PiBqb2luUGF0aCh0aGlzLl91c2VySG9tZSwgLi4ucm9vdC5wYXRoKSksXG5cdFx0XHRdKVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBhZ2VudEluc3RydWN0aW9uRGlyZWN0b3J5VXJpcyA9IG5ldyBSZXNvdXJjZVNldChcblx0XHRcdG91dHB1dERpcmVjdG9yaWVzXG5cdFx0XHRcdC5maWx0ZXIoZGlyZWN0b3J5ID0+IGRpcmVjdG9yeS50eXBlID09PSBEaXNjb3ZlcmVkVHlwZS5BZ2VudEluc3RydWN0aW9uKVxuXHRcdFx0XHQubWFwKGRpcmVjdG9yeSA9PiBkaXJlY3RvcnkudXJpKVxuXHRcdCk7XG5cblx0XHRmb3IgKGNvbnN0IGN1c3RvbWl6YXRpb24gb2YgY3VzdG9taXphdGlvbnMpIHtcblx0XHRcdGlmIChjdXN0b21pemF0aW9uLnR5cGUgIT09IHR5cGUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNoaWxkVXJpID0gVVJJLnBhcnNlKGN1c3RvbWl6YXRpb24udXJpKTtcblx0XHRcdGxldCBiZXN0UGFyZW50ID0gb3V0cHV0RGlyZWN0b3JpZXMuZmluZChkID0+IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWxPclBhcmVudChjaGlsZFVyaSwgZC51cmkpKTtcblx0XHRcdGlmICghYmVzdFBhcmVudCAmJiBjdXN0b21pemF0aW9uLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLlJ1bGUgJiYgY3VzdG9taXphdGlvbi5hbHdheXNBcHBseSAmJiBjdXN0b21pemF0aW9uLm5hbWUubWF0Y2goL1xcLm1kJC9pKSkge1xuXHRcdFx0XHRiZXN0UGFyZW50ID0gb3V0cHV0RGlyZWN0b3JpZXMuZmluZChkID0+XG5cdFx0XHRcdFx0ZC50eXBlID09PSBEaXNjb3ZlcmVkVHlwZS5BZ2VudEluc3RydWN0aW9uICYmIGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWxPclBhcmVudChjaGlsZFVyaSwgZC51cmkpXG5cdFx0XHRcdCkgPz8gb3V0cHV0RGlyZWN0b3JpZXMuZmluZChkID0+IGQudHlwZSA9PT0gRGlzY292ZXJlZFR5cGUuQWdlbnRJbnN0cnVjdGlvbik7XG5cdFx0XHR9XG5cdFx0XHRpZiAoYmVzdFBhcmVudCkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBvdXRwdXREaXJlY3Rvcmllcykge1xuXHRcdFx0XHRcdGlmIChleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5pc0VxdWFsT3JQYXJlbnQoY2hpbGRVcmksIGNhbmRpZGF0ZS51cmkpICYmIGNhbmRpZGF0ZS51cmkucGF0aC5sZW5ndGggPiBiZXN0UGFyZW50LnVyaS5wYXRoLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0YmVzdFBhcmVudCA9IGNhbmRpZGF0ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcGFyZW50VXJpID0gYmVzdFBhcmVudD8udXJpID8/IHVyaURpcm5hbWUoY2hpbGRVcmkpO1xuXHRcdFx0bGV0IGVudHJ5ID0gYnlQYXJlbnQuZ2V0KHBhcmVudFVyaSk7XG5cdFx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeV0gQlVHOiBjdXN0b21pemF0aW9uICcke2N1c3RvbWl6YXRpb24udXJpfScgb2YgdHlwZSAnJHtjdXN0b21pemF0aW9uLnR5cGV9JyBpcyBvdXRzaWRlIGRpc2NvdmVyZWQgZGlyZWN0b3JpZXM7IGNyZWF0aW5nIGZhbGxiYWNrIGRpcmVjdG9yeSAnJHtwYXJlbnRVcmkudG9TdHJpbmcoKX0nLmApO1xuXHRcdFx0XHRlbnRyeSA9IHtcblx0XHRcdFx0XHR1cmk6IHBhcmVudFVyaSxcblx0XHRcdFx0XHRuYW1lOiBiYXNlbmFtZShwYXJlbnRVcmkucGF0aCksXG5cdFx0XHRcdFx0d3JpdGFibGU6IHRydWUsXG5cdFx0XHRcdFx0Y2hpbGRyZW46IFtdXG5cdFx0XHRcdH07XG5cdFx0XHRcdGJ5UGFyZW50LnNldChwYXJlbnRVcmksIGVudHJ5KTtcblx0XHRcdH1cblx0XHRcdGVudHJ5LmNoaWxkcmVuLnB1c2goY3VzdG9taXphdGlvbik7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCB7IHVyaSwgbmFtZSwgd3JpdGFibGUsIGNoaWxkcmVuIH0gb2YgYnlQYXJlbnQudmFsdWVzKCkpIHtcblx0XHRcdGlmICh0eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5Ib29rICYmIGZpeGVkSG9va0RpcmVjdG9yeVVyaXM/Lmhhcyh1cmkpICYmIGNoaWxkcmVuLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLlJ1bGUgJiYgYWdlbnRJbnN0cnVjdGlvbkRpcmVjdG9yeVVyaXMuaGFzKHVyaSkpIHtcblx0XHRcdFx0Y29uc3QgZXhpc3RpbmdDaGlsZHJlbjogQ2hpbGRDdXN0b21pemF0aW9uW10gPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlbikge1xuXHRcdFx0XHRcdGNvbnN0IGNoaWxkVXJpID0gVVJJLnBhcnNlKGNoaWxkLnVyaSk7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZXNvbHZlKGNoaWxkVXJpLCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KTtcblx0XHRcdFx0XHRcdGlmIChzdGF0LmlzRmlsZSkge1xuXHRcdFx0XHRcdFx0XHRleGlzdGluZ0NoaWxkcmVuLnB1c2goY2hpbGQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdFx0Ly8gSWdub3JlIG1pc3NpbmcgYWdlbnQtaW5zdHJ1Y3Rpb24gZmlsZXM7IHRoZXkgc2hvdWxkIG5vdCBzdXJmYWNlLlxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZXhpc3RpbmdDaGlsZHJlbi5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjaGlsZHJlbi5sZW5ndGggPSAwO1xuXHRcdFx0XHRjaGlsZHJlbi5wdXNoKC4uLmV4aXN0aW5nQ2hpbGRyZW4pO1xuXHRcdFx0fVxuXG5cdFx0XHRjaGlsZHJlbi5zb3J0KChhLCBiKSA9PiBjb21wYXJlU3RyaW5ncyhhLnVyaSwgYi51cmkpKTtcblx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuRGlyZWN0b3J5LFxuXHRcdFx0XHRpZDogY3VzdG9taXphdGlvbklkKHVyaS50b1N0cmluZygpKSxcblx0XHRcdFx0dXJpOiB1cmkudG9TdHJpbmcoKSxcblx0XHRcdFx0bmFtZSxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0Y29udGVudHM6IHR5cGUsXG5cdFx0XHRcdHdyaXRhYmxlLFxuXHRcdFx0XHRsb2FkOiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLkxvYWRlZCB9LFxuXHRcdFx0XHRjaGlsZHJlbixcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGxpc3Qgb2YgZGlzY292ZXJlZCBjdXN0b21pemF0aW9uIGRpcmVjdG9yaWVzIGFuZCBmaWxlcyBpbiBhIHNvcnRlZCB3YXkuXG5cdCAqIEFsc28gc2V0cyB1cCB3YXRjaGVycyBmb3IgYWxsIGRpc2NvdmVyZWQgcm9vdCBkaXJlY3RvcmllcyAocmVjdXJzaXZlbHkgaWYgc3BlY2lmaWVkIGJ5IHRoZSByb290IG9yIGlmIGFscmVhZHkgd2F0Y2hpbmcgcmVjdXJzaXZlbHkpLlxuXHQgKiBFYWNoIGNhbGwgcGVyZm9ybXMgYSBmcmVzaCBzY2FuIHNjb3BlZCB0byB0aGUgcHJvdmlkZWQgY2FuY2VsbGF0aW9uIHRva2VuLlxuXHQgKi9cblx0cHVibGljIGFzeW5jIHNjYW4odG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxyZWFkb25seSBJRGlzY292ZXJlZERpcmVjdG9yeVtdPiB7XG5cdFx0YXdhaXQgdGhpcy53cml0ZUN1c3RvbWl6YXRpb25EaXNjb3ZlcnlEZWJ1Z0xvZyh7XG5cdFx0XHRtZXRob2Q6ICdzY2FuJyxcblx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogdGhpcy5fd29ya2luZ0RpcmVjdG9yaWVzLm1hcChkID0+IGQudG9TdHJpbmcoKSksXG5cdFx0XHR1c2VySG9tZTogdGhpcy5fdXNlckhvbWUudG9TdHJpbmcoKSxcblx0XHR9KTtcblx0XHR0aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblxuXHRcdGNvbnN0IG5leHRXYXRjaFJvb3RVcmlzID0gbmV3IFJlc291cmNlTWFwPElXYXRjaFNwZWM+KCk7XG5cdFx0Y29uc3Qgc2VlbiA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXHRcdGNvbnN0IHJlc3VsdDogSURpc2NvdmVyZWREaXJlY3RvcnlbXSA9IFtdO1xuXG5cdFx0Ly8gV29ya3NwYWNlIGZpcnN0IHNvIGl0IHdpbnMgb24gVVJJIGNvbmZsaWN0cy4gSG9va3MgYXJlIGRpc2NvdmVyZWQgZnJvbSB0aGVcblx0XHQvLyBQUklNQVJZIHdvcmtpbmcgZGlyZWN0b3J5IG9ubHkgKENvcGlsb3QgbGltaXRhdGlvbiBcdTIwMTQgc2VlIF9ob29rV29ya2luZ0RpcmVjdG9yaWVzKTtcblx0XHQvLyBldmVyeSBvdGhlciB0eXBlIGlzIGRpc2NvdmVyZWQgYWNyb3NzIGFsbCByb290cy5cblx0XHRjb25zdCB3b3Jrc3BhY2VGaXhlZEhvb2sgPSBmaXhlZERpc2NvdmVyeUZpbGVzLndvcmtzcGFjZS5maWx0ZXIocm9vdCA9PiByb290LnR5cGUgPT09IERpc2NvdmVyZWRUeXBlLkhvb2spO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUZpeGVkTm9uSG9vayA9IGZpeGVkRGlzY292ZXJ5RmlsZXMud29ya3NwYWNlLmZpbHRlcihyb290ID0+IHJvb3QudHlwZSAhPT0gRGlzY292ZXJlZFR5cGUuSG9vayk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0Li4uc2VhcmNoUm9vdHMud29ya3NwYWNlLmZsYXRNYXAocm9vdCA9PlxuXHRcdFx0XHQocm9vdC50eXBlID09PSBEaXNjb3ZlcmVkVHlwZS5Ib29rID8gdGhpcy5faG9va1dvcmtpbmdEaXJlY3RvcmllcyA6IHRoaXMuX3dvcmtpbmdEaXJlY3Rvcmllcylcblx0XHRcdFx0XHQubWFwKHdvcmtpbmdEaXJlY3RvcnkgPT4gdGhpcy5fc2NhblJvb3Qod29ya2luZ0RpcmVjdG9yeSwgcm9vdCwgc2VlbiwgcmVzdWx0LCBuZXh0V2F0Y2hSb290VXJpcywgdG9rZW4pKSksXG5cdFx0XHQuLi5zZWFyY2hSb290cy51c2VyLm1hcChyb290ID0+IHRoaXMuX3NjYW5Sb290KHRoaXMuX3VzZXJIb21lLCByb290LCBzZWVuLCByZXN1bHQsIG5leHRXYXRjaFJvb3RVcmlzLCB0b2tlbikpLFxuXHRcdFx0Li4udGhpcy5fd29ya2luZ0RpcmVjdG9yaWVzLm1hcCh3b3JraW5nRGlyZWN0b3J5ID0+XG5cdFx0XHRcdHRoaXMuX3NjYW5GaXhlZERpc2NvdmVyeUZpbGVzKHdvcmtpbmdEaXJlY3RvcnksIHdvcmtzcGFjZUZpeGVkTm9uSG9vaywgc2VlbiwgcmVzdWx0LCBuZXh0V2F0Y2hSb290VXJpcywgdG9rZW4pKSxcblx0XHRcdC4uLnRoaXMuX2hvb2tXb3JraW5nRGlyZWN0b3JpZXMubWFwKHdvcmtpbmdEaXJlY3RvcnkgPT5cblx0XHRcdFx0dGhpcy5fc2NhbkZpeGVkRGlzY292ZXJ5RmlsZXMod29ya2luZ0RpcmVjdG9yeSwgd29ya3NwYWNlRml4ZWRIb29rLCBzZWVuLCByZXN1bHQsIG5leHRXYXRjaFJvb3RVcmlzLCB0b2tlbikpLFxuXHRcdFx0dGhpcy5fc2NhbkZpeGVkRGlzY292ZXJ5RmlsZXModGhpcy5fdXNlckhvbWUsIGZpeGVkRGlzY292ZXJ5RmlsZXMudXNlciwgc2VlbiwgcmVzdWx0LCBuZXh0V2F0Y2hSb290VXJpcywgdG9rZW4pXG5cdFx0XSk7XG5cblx0XHR0aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblxuXHRcdHRoaXMuX3JlY29uY2lsZVdhdGNoZXJzKG5leHRXYXRjaFJvb3RVcmlzKTtcblx0XHRjb25zdCBzb3J0ZWRSZXN1bHQgPSByZXN1bHQuc29ydChjb21wYXJlRGlzY292ZXJlZERpcmVjdG9yeSk7XG5cdFx0YXdhaXQgdGhpcy53cml0ZUN1c3RvbWl6YXRpb25EaXNjb3ZlcnlEZWJ1Z0xvZyh7XG5cdFx0XHRtZXRob2Q6ICdzY2FuJyxcblx0XHRcdHJlc3VsdDogc29ydGVkUmVzdWx0Lm1hcChkaXJlY3RvcnkgPT4gKHtcblx0XHRcdFx0dHlwZTogZGlyZWN0b3J5LnR5cGUsXG5cdFx0XHRcdHVyaTogZGlyZWN0b3J5LnVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRmaWxlczogZGlyZWN0b3J5LmZpbGVzLm1hcChmaWxlID0+IGZpbGUudXJpLnRvU3RyaW5nKCkpLFxuXHRcdFx0fSkpLFxuXHRcdH0pO1xuXHRcdHJldHVybiBzb3J0ZWRSZXN1bHQ7XG5cdH1cblxuXHQvKipcblx0ICogV2FsayB0aGUgYW5jZXN0b3IgY2hhaW4gb2YgYHBhdGhgIGZyb20gYGJhc2VgLiBGb3IgZXZlcnkgYW5jZXN0b3Jcblx0ICogZGlyZWN0b3J5IHRoYXQgZXhpc3RzLCByZWdpc3RlciBhIG5vbi1yZWN1cnNpdmUgd2F0Y2hlciB3aG9zZSB0cmlnZ2VyXG5cdCAqIFVSSSBpcyB0aGUgbmV4dCBwYXRoIHNlZ21lbnQsIHNvIHRoZSBoYW5kbGVyIGZpcmVzIHdoZW4gYW4gaW50ZXJtZWRpYXRlXG5cdCAqIGRpcmVjdG9yeSAoZS5nLiBgLmdpdGh1YmAsIGAuZ2l0aHViL2FnZW50c2AsIGAuY29waWxvdGApIGlzIGNyZWF0ZWQgYW5kXG5cdCAqIGEgcmUtc2NhbiBpcyBuZWVkZWQgdG8gcGljayB1cCBuZXdseS1kaXNjb3ZlcmFibGUgY29udGVudC5cblx0ICpcblx0ICogUmV0dXJucyB0cnVlIHdoZW4gZXZlcnkgYW5jZXN0b3IgZXhpc3RzIGFzIGEgZGlyZWN0b3J5IChpLmUuIHRoZSBsZWFmXG5cdCAqIG1heSBleGlzdCkuIFJldHVybnMgZmFsc2Ugd2hlbiBhbiBhbmNlc3RvciBpcyBtaXNzaW5nIG9yIG5vdCBhIGRpcmVjdG9yeSxcblx0ICogaW4gd2hpY2ggY2FzZSB0aGUgY2FsbGVyIGNhbiBzaG9ydC1jaXJjdWl0LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfd2F0Y2hBbmNlc3RvcnMoYmFzZTogVVJJLCBwYXRoOiByZWFkb25seSBzdHJpbmdbXSwgd2F0Y2hSb290VXJpczogUmVzb3VyY2VNYXA8SVdhdGNoU3BlYz4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGxldCBjdXJyZW50ID0gYmFzZTtcblx0XHRmb3IgKGNvbnN0IHNlZ21lbnQgb2YgcGF0aCkge1xuXHRcdFx0Y29uc3QgcGFyZW50ID0gY3VycmVudDtcblx0XHRcdGNvbnN0IGNoaWxkID0gam9pblBhdGgocGFyZW50LCBzZWdtZW50KTtcblx0XHRcdGlmICghd2F0Y2hSb290VXJpcy5oYXMocGFyZW50KSkge1xuXHRcdFx0XHR0aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVzb2x2ZShwYXJlbnQpO1xuXHRcdFx0XHRcdGlmICghc3RhdC5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRhZGRXYXRjaCh3YXRjaFJvb3RVcmlzLCBwYXJlbnQsIGZhbHNlLCBjaGlsZCk7XG5cdFx0XHRjdXJyZW50ID0gY2hpbGQ7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVjb25jaWxlV2F0Y2hlcnMobmV4dFdhdGNoUm9vdFVyaXM6IFJlc291cmNlTWFwPElXYXRjaFNwZWM+KTogdm9pZCB7XG5cdFx0Ly8gRGlzcG9zZSB3YXRjaGVycyB0aGF0IGFyZSBnb25lIG9yIHdob3NlIHJlY3Vyc2l2ZSBmbGFnIGNoYW5nZWQuXG5cdFx0Zm9yIChjb25zdCBbcm9vdFVyaSwgd2F0Y2hlcl0gb2YgdGhpcy5fd2F0Y2hlcnMuZW50cmllcygpKSB7XG5cdFx0XHRjb25zdCBuZXh0ID0gbmV4dFdhdGNoUm9vdFVyaXMuZ2V0KHJvb3RVcmkpO1xuXHRcdFx0aWYgKCFuZXh0IHx8IG5leHQucmVjdXJzaXZlICE9PSB3YXRjaGVyLnJlY3Vyc2l2ZSkge1xuXHRcdFx0XHR3YXRjaGVyLmRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLl93YXRjaGVycy5kZWxldGUocm9vdFVyaSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBbcm9vdFVyaSwgbmV4dF0gb2YgbmV4dFdhdGNoUm9vdFVyaXMuZW50cmllcygpKSB7XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3dhdGNoZXJzLmdldChyb290VXJpKTtcblx0XHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0XHQvLyBSZWZyZXNoIHRyaWdnZXIgVVJJcyBpbiBwbGFjZTsgdGhlIHVuZGVybHlpbmcgd2F0Y2hlciBpcyB1bmNoYW5nZWQuXG5cdFx0XHRcdGV4aXN0aW5nLnJlc291cmNlc1RvV2F0Y2guY2xlYXIoKTtcblx0XHRcdFx0Zm9yIChjb25zdCB1cmkgb2YgbmV4dC5yZXNvdXJjZXNUb1dhdGNoKSB7XG5cdFx0XHRcdFx0ZXhpc3RpbmcucmVzb3VyY2VzVG9XYXRjaC5hZGQodXJpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB0aGlzLl9maWxlU2VydmljZS53YXRjaChyb290VXJpLCB7IHJlY3Vyc2l2ZTogbmV4dC5yZWN1cnNpdmUsIGV4Y2x1ZGVzOiBbXSB9KTtcblx0XHRcdFx0dGhpcy5fd2F0Y2hlcnMuc2V0KHJvb3RVcmksIHsgcmVjdXJzaXZlOiBuZXh0LnJlY3Vyc2l2ZSwgcmVzb3VyY2VzVG9XYXRjaDogbmV4dC5yZXNvdXJjZXNUb1dhdGNoLCBkaXNwb3NhYmxlIH0pO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW1Nlc3Npb25DdXN0b21pemF0aW9uRGlzY292ZXJ5XSBGYWlsZWQgdG8gd2F0Y2ggJyR7cm9vdFVyaS50b1N0cmluZygpfSc6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2Rpc3Bvc2VBbGxXYXRjaGVycygpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHdhdGNoZXIgb2YgdGhpcy5fd2F0Y2hlcnMudmFsdWVzKCkpIHtcblx0XHRcdHdhdGNoZXIuZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX3dhdGNoZXJzLmNsZWFyKCk7XG5cdH1cblxuXHQvKipcblx0ICogRm9yIGZpeGVkIGRpc2NvdmVyeSBmaWxlcyAoZS5nLiBBR0VOVFMubWQsIGNvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kLFxuXHQgKiBzZXR0aW5ncy5qc29uKSwgY3JlYXRlIG9uZSBkaXNjb3ZlcmVkIGRpcmVjdG9yeSBwZXIgdHlwZSBhdCB0aGUgYmFzZS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3NjYW5GaXhlZERpc2NvdmVyeUZpbGVzKGJhc2U6IFVSSSwgcm9vdHM6IElGaXhlZERpc2NvdmVyeUZpbGVbXSwgc2VlbjogUmVzb3VyY2VTZXQsIHJlc3VsdDogSURpc2NvdmVyZWREaXJlY3RvcnlbXSwgd2F0Y2hSb290VXJpczogUmVzb3VyY2VNYXA8SVdhdGNoU3BlYz4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGZpbGVzQnlUeXBlID0gbmV3IE1hcDxEaXNjb3ZlcmVkVHlwZSwgSURpc2NvdmVyZWRGaWxlW10+KCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwocm9vdHMubWFwKGFzeW5jIHJvb3QgPT4ge1xuXHRcdFx0dGhyb3dJZkNhbmNlbGxlZCh0b2tlbik7XG5cblx0XHRcdGlmICghYXdhaXQgdGhpcy5fd2F0Y2hBbmNlc3RvcnMoYmFzZSwgcm9vdC5wYXRoLCB3YXRjaFJvb3RVcmlzLCB0b2tlbikpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByb290VXJpID0gam9pblBhdGgoYmFzZSwgLi4ucm9vdC5wYXRoKTtcblx0XHRcdGxldCBzdGF0OiBJRmlsZVN0YXRXaXRoTWV0YWRhdGE7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRzdGF0ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVzb2x2ZShyb290VXJpLCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBSb290IGRvZXMgbm90IGV4aXN0IChvciBpcyB1bnJlYWRhYmxlKSBcdTIwMTQgbm90aGluZyB0byBkaXNjb3ZlciBvciB3YXRjaC5cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFzdGF0LmlzRGlyZWN0b3J5IHx8ICFzdGF0LmNoaWxkcmVuKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVHJpZ2dlciByZWZyZXNoIG9ubHkgZm9yIHRoZSBzcGVjaWZpYyBmaWxlbmFtZXMgdGhpcyByb290IGNhcmVzIGFib3V0XG5cdFx0XHQvLyAoZS5nLiBBR0VOVFMubWQgYXQgdGhlIHdvcmtzcGFjZSByb290KSBcdTIwMTQgbm90IGZvciBldmVyeSBkaXJlY3QgY2hpbGQuXG5cdFx0XHRmb3IgKGNvbnN0IGZpbGVuYW1lIG9mIHJvb3QuZmlsZW5hbWVzKSB7XG5cdFx0XHRcdGFkZFdhdGNoKHdhdGNoUm9vdFVyaXMsIHJvb3RVcmksIGZhbHNlLCBqb2luUGF0aChyb290VXJpLCBmaWxlbmFtZSkpO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBzdGF0LmNoaWxkcmVuKSB7XG5cdFx0XHRcdHRocm93SWZDYW5jZWxsZWQodG9rZW4pO1xuXG5cdFx0XHRcdGlmIChlbnRyeS5pc0ZpbGUgJiYgcm9vdC5maWxlbmFtZXMuaW5jbHVkZXMoZW50cnkubmFtZSkpIHtcblx0XHRcdFx0XHRjb25zdCB1cmkgPSBqb2luUGF0aChyb290VXJpLCBlbnRyeS5uYW1lKTtcblx0XHRcdFx0XHRpZiAoIXNlZW4uaGFzKHVyaSkpIHtcblx0XHRcdFx0XHRcdHNlZW4uYWRkKHVyaSk7XG5cdFx0XHRcdFx0XHRjb25zdCBmaWxlcyA9IGZpbGVzQnlUeXBlLmdldChyb290LnR5cGUpID8/IFtdO1xuXHRcdFx0XHRcdFx0ZmlsZXMucHVzaCh7IHVyaSwgZXRhZzogZW50cnkuZXRhZyB9KTtcblx0XHRcdFx0XHRcdGZpbGVzQnlUeXBlLnNldChyb290LnR5cGUsIGZpbGVzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRmb3IgKGNvbnN0IFt0eXBlLCBmaWxlc10gb2YgZmlsZXNCeVR5cGUuZW50cmllcygpKSB7XG5cdFx0XHRpZiAoZmlsZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRyZXN1bHQucHVzaCh7IHVyaTogYmFzZSwgdHlwZSwgZmlsZXM6IGZpbGVzLnNvcnQoY29tcGFyZURpc2NvdmVyZWRGaWxlKSwgbmFtZTogJycsIHdyaXRhYmxlOiBmYWxzZSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zY2FuUm9vdChiYXNlOiBVUkksIHJvb3Q6IElTZWFyY2hSb290LCBzZWVuOiBSZXNvdXJjZVNldCwgcmVzdWx0OiBJRGlzY292ZXJlZERpcmVjdG9yeVtdLCB3YXRjaFJvb3RVcmlzOiBSZXNvdXJjZU1hcDxJV2F0Y2hTcGVjPiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhyb3dJZkNhbmNlbGxlZCh0b2tlbik7XG5cblx0XHRjb25zdCByb290VXJpID0gam9pblBhdGgoYmFzZSwgLi4ucm9vdC5wYXRoKTtcblx0XHRsZXQgc3RhdDogSUZpbGVTdGF0V2l0aE1ldGFkYXRhIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGxldCBjaGlsZHJlbjogSUZpbGVTdGF0V2l0aE1ldGFkYXRhW10gPSBbXTtcblx0XHR0cnkge1xuXHRcdFx0c3RhdCA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlc29sdmUocm9vdFVyaSwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSk7XG5cdFx0XHRjaGlsZHJlbiA9IHN0YXQuY2hpbGRyZW4gPz8gW107XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBSb290IGRvZXMgbm90IGV4aXN0IChvciBpcyB1bnJlYWRhYmxlKSBcdTIwMTQgc3RpbGwgZGlzY292ZXIgaXQgYXMgYSBwb3NzaWJsZSBzb3VyY2UgZm9sZGVyLlxuXHRcdH1cblxuXHRcdC8vIEZpbGVuYW1lcyBhcmUgZHluYW1pYyBmb3IgdGhlc2Ugcm9vdHMsIHNvIHdlIHdhdGNoIHRoZSB3aG9sZSBkaXJlY3RvcnkuXG5cdFx0Ly8gYGFkZFdhdGNoYCB1cGdyYWRlcyB0byByZWN1cnNpdmUgaWYgYW55IHJvb3QgcmVxdWVzdHMgaXQuXG5cdFx0YXdhaXQgdGhpcy5fd2F0Y2hBbmNlc3RvcnMoYmFzZSwgcm9vdC5wYXRoLCB3YXRjaFJvb3RVcmlzLCB0b2tlbik7XG5cdFx0YWRkV2F0Y2god2F0Y2hSb290VXJpcywgcm9vdFVyaSwgcm9vdC5yZWN1cnNpdmUgPz8gZmFsc2UsIHJvb3RVcmkpO1xuXG5cdFx0aWYgKHJvb3QudHlwZSA9PT0gRGlzY292ZXJlZFR5cGUuU2tpbGwpIHtcblx0XHRcdGNvbnN0IGZpbGVzOiBJRGlzY292ZXJlZEZpbGVbXSA9IFtdO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoY2hpbGRyZW4ubWFwKGFzeW5jIGNoaWxkID0+IHtcblx0XHRcdFx0dGhyb3dJZkNhbmNlbGxlZCh0b2tlbik7XG5cblx0XHRcdFx0aWYgKGNoaWxkLmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRcdFx0Y29uc3Qgc2tpbGxGaWxlID0gam9pblBhdGgoY2hpbGQucmVzb3VyY2UsIFNLSUxMX0ZJTEVOQU1FKTtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Y29uc3Qgc2tpbGxTdGF0ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVzb2x2ZShza2lsbEZpbGUsIHsgcmVzb2x2ZU1ldGFkYXRhOiB0cnVlIH0pO1xuXHRcdFx0XHRcdFx0aWYgKHNraWxsU3RhdC5pc0ZpbGUgJiYgIXNlZW4uaGFzKHNraWxsRmlsZSkpIHtcblx0XHRcdFx0XHRcdFx0c2Vlbi5hZGQoc2tpbGxGaWxlKTtcblx0XHRcdFx0XHRcdFx0ZmlsZXMucHVzaCh7IHVyaTogc2tpbGxGaWxlLCBldGFnOiBza2lsbFN0YXQuZXRhZyB9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRcdC8vIFNLSUxMLm1kIG1pc3NpbmcgXHUyMDE0IHNraXAgdGhpcyBza2lsbCBkaXJlY3RvcnkuXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHRyZXN1bHQucHVzaCh7IHVyaTogcm9vdFVyaSwgdHlwZTogcm9vdC50eXBlLCBmaWxlczogZmlsZXMuc29ydChjb21wYXJlRGlzY292ZXJlZEZpbGUpLCBuYW1lOiByb290Lm5hbWUsIHdyaXRhYmxlOiB0cnVlIH0pO1xuXHRcdH0gZWxzZSBpZiAocm9vdC50eXBlID09PSBEaXNjb3ZlcmVkVHlwZS5BZ2VudCkge1xuXHRcdFx0Y29uc3QgZmlsZXM6IElEaXNjb3ZlcmVkRmlsZVtdID0gW107XG5cdFx0XHQvLyBhZ2VudHMgYXJlIG1hcmtkb3duIGZpbGVzIGRpcmVjdGx5IHVuZGVyIHRoZSByb290IChubyBzdWJkaXJlY3Rvcnkgc2Nhbm5pbmcpLFxuXHRcdFx0Ly8gZXhjbHVkaW5nIG9ubHkgZXhhY3QtY2FzZSBSRUFETUUubWQuXG5cdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIGNoaWxkcmVuKSB7XG5cdFx0XHRcdHRocm93SWZDYW5jZWxsZWQodG9rZW4pO1xuXG5cdFx0XHRcdGlmIChjaGlsZC5pc0ZpbGUpIHtcblx0XHRcdFx0XHRjb25zdCBmaWxlbmFtZSA9IGNoaWxkLm5hbWU7XG5cdFx0XHRcdFx0aWYgKGZpbGVuYW1lLmVuZHNXaXRoKE1BUktET1dOX1NVRkZJWCkgJiYgZmlsZW5hbWUgIT09IFJFQURNRV9GSUxFTkFNRSAmJiAhc2Vlbi5oYXMoY2hpbGQucmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRzZWVuLmFkZChjaGlsZC5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0XHRmaWxlcy5wdXNoKHsgdXJpOiBjaGlsZC5yZXNvdXJjZSwgZXRhZzogY2hpbGQuZXRhZyB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJlc3VsdC5wdXNoKHsgdXJpOiByb290VXJpLCB0eXBlOiByb290LnR5cGUsIGZpbGVzOiBmaWxlcy5zb3J0KGNvbXBhcmVEaXNjb3ZlcmVkRmlsZSksIG5hbWU6IHJvb3QubmFtZSwgd3JpdGFibGU6IHRydWUgfSk7XG5cblx0XHR9IGVsc2UgaWYgKHJvb3QudHlwZSA9PT0gRGlzY292ZXJlZFR5cGUuSW5zdHJ1Y3Rpb24pIHtcblx0XHRcdGNvbnN0IGZpbGVzOiBJRGlzY292ZXJlZEZpbGVbXSA9IFtdO1xuXHRcdFx0Ly8gaW5zdHJ1Y3Rpb25zIGFyZSBhbGwgLmluc3RydWN0aW9ucy5tZCBmaWxlcyBkaXJlY3RseSB1bmRlciB0aGUgcm9vdCBvciBpbiBhIHN1YmRpcmVjdG9yeVxuXHRcdFx0Y29uc3QgZmluZEluc3RydWN0aW9ucyA9IGFzeW5jIChzdGF0OiBJRmlsZVN0YXRXaXRoTWV0YWRhdGEsIHJlY3Vyc2lvbkxldmVsOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+ID0+IHtcblx0XHRcdFx0dGhyb3dJZkNhbmNlbGxlZCh0b2tlbik7XG5cblx0XHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBzdGF0LmNoaWxkcmVuID8/IFtdKSB7XG5cdFx0XHRcdFx0dGhyb3dJZkNhbmNlbGxlZCh0b2tlbik7XG5cblx0XHRcdFx0XHRpZiAoY2hpbGQuaXNGaWxlKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBuYW1lID0gY2hpbGQubmFtZS50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHRcdFx0aWYgKG5hbWUuZW5kc1dpdGgoSU5TVFJVQ1RJT05fRklMRV9TVUZGSVgpICYmICFzZWVuLmhhcyhjaGlsZC5yZXNvdXJjZSkpIHtcblx0XHRcdFx0XHRcdFx0c2Vlbi5hZGQoY2hpbGQucmVzb3VyY2UpO1xuXHRcdFx0XHRcdFx0XHRmaWxlcy5wdXNoKHsgdXJpOiBjaGlsZC5yZXNvdXJjZSwgZXRhZzogY2hpbGQuZXRhZyB9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2UgaWYgKGNoaWxkLmlzRGlyZWN0b3J5ICYmIHJlY3Vyc2lvbkxldmVsIDwgTUFYX0lOU1RSVUNUSU9OU19SRUNVUlNJT05fREVQVEgpIHtcblx0XHRcdFx0XHRcdGxldCBjaGlsZFN0YXQ6IElGaWxlU3RhdFdpdGhNZXRhZGF0YSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdGNoaWxkU3RhdCA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlc29sdmUoY2hpbGQucmVzb3VyY2UsIHsgcmVzb2x2ZU1ldGFkYXRhOiB0cnVlIH0pO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0XHRcdC8vIElnbm9yZSB1bnJlYWRhYmxlIHN1YmRpcmVjdG9yaWVzLlxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGNoaWxkU3RhdCkge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCBmaW5kSW5zdHJ1Y3Rpb25zKGNoaWxkU3RhdCwgcmVjdXJzaW9uTGV2ZWwgKyAxKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHRpZiAoc3RhdCkge1xuXHRcdFx0XHRhd2FpdCBmaW5kSW5zdHJ1Y3Rpb25zKHN0YXQsIDApO1xuXHRcdFx0fVxuXHRcdFx0cmVzdWx0LnB1c2goeyB1cmk6IHJvb3RVcmksIHR5cGU6IHJvb3QudHlwZSwgZmlsZXM6IGZpbGVzLnNvcnQoY29tcGFyZURpc2NvdmVyZWRGaWxlKSwgbmFtZTogcm9vdC5uYW1lLCB3cml0YWJsZTogdHJ1ZSB9KTtcblx0XHR9IGVsc2UgaWYgKHJvb3QudHlwZSA9PT0gRGlzY292ZXJlZFR5cGUuSG9vaykge1xuXHRcdFx0YXdhaXQgdGhpcy5fc2NhbkZvckhvb2tzKHJvb3QsIHJvb3RVcmksIHN0YXQsIHNlZW4sIHJlc3VsdCwgdG9rZW4pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeV0gVW5yZWNvZ25pemVkIHJvb3QgdHlwZSAnJHtyb290LnR5cGV9JyBmb3Igcm9vdCAnJHtyb290VXJpLnRvU3RyaW5nKCl9J2ApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3NjYW5Gb3JIb29rcyhyb290OiBJU2VhcmNoUm9vdCwgcm9vdFVyaTogVVJJLCBzdGF0OiBJRmlsZVN0YXRXaXRoTWV0YWRhdGEgfCB1bmRlZmluZWQsIHNlZW46IFJlc291cmNlU2V0LCByZXN1bHQ6IElEaXNjb3ZlcmVkRGlyZWN0b3J5W10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGZpbGVzOiBJRGlzY292ZXJlZEZpbGVbXSA9IFtdO1xuXHRcdC8vIGhvb2tzIGFyZSByZWN1cnNpdmVseSBkaXNjb3ZlcmVkIGFzIGAqLmpzb25gIHVuZGVyIHRoZSByb290LlxuXHRcdGNvbnN0IGZpbmRIb29rcyA9IGFzeW5jIChkaXJlY3RvcnlTdGF0OiBJRmlsZVN0YXRXaXRoTWV0YWRhdGEsIHJlY3Vyc2lvbkxldmVsOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+ID0+IHtcblx0XHRcdHRocm93SWZDYW5jZWxsZWQodG9rZW4pO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIGRpcmVjdG9yeVN0YXQuY2hpbGRyZW4gPz8gW10pIHtcblx0XHRcdFx0dGhyb3dJZkNhbmNlbGxlZCh0b2tlbik7XG5cblx0XHRcdFx0aWYgKGNoaWxkLmlzRmlsZSkge1xuXHRcdFx0XHRcdGNvbnN0IG5hbWUgPSBjaGlsZC5uYW1lLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdFx0aWYgKG5hbWUuZW5kc1dpdGgoSE9PS19GSUxFX1NVRkZJWCkgJiYgIXNlZW4uaGFzKGNoaWxkLnJlc291cmNlKSkge1xuXHRcdFx0XHRcdFx0c2Vlbi5hZGQoY2hpbGQucmVzb3VyY2UpO1xuXHRcdFx0XHRcdFx0ZmlsZXMucHVzaCh7IHVyaTogY2hpbGQucmVzb3VyY2UsIGV0YWc6IGNoaWxkLmV0YWcgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKGNoaWxkLmlzRGlyZWN0b3J5ICYmIHJlY3Vyc2lvbkxldmVsIDwgTUFYX0hPT0tTX1JFQ1VSU0lPTl9ERVBUSCkge1xuXHRcdFx0XHRcdGxldCBjaGlsZFN0YXQ6IElGaWxlU3RhdFdpdGhNZXRhZGF0YSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Y2hpbGRTdGF0ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVzb2x2ZShjaGlsZC5yZXNvdXJjZSwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSk7XG5cdFx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0XHQvLyBJZ25vcmUgdW5yZWFkYWJsZSBzdWJkaXJlY3Rvcmllcy5cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGNoaWxkU3RhdCkge1xuXHRcdFx0XHRcdFx0YXdhaXQgZmluZEhvb2tzKGNoaWxkU3RhdCwgcmVjdXJzaW9uTGV2ZWwgKyAxKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHRcdGlmIChzdGF0KSB7XG5cdFx0XHRhd2FpdCBmaW5kSG9va3Moc3RhdCwgMCk7XG5cdFx0fVxuXHRcdHJlc3VsdC5wdXNoKHsgdXJpOiByb290VXJpLCB0eXBlOiByb290LnR5cGUsIGZpbGVzOiBmaWxlcy5zb3J0KGNvbXBhcmVEaXNjb3ZlcmVkRmlsZSksIG5hbWU6IHJvb3QubmFtZSwgd3JpdGFibGU6IHRydWUgfSk7XG5cblx0fVxufVxuXG5cblxuLy8gVGVzdC1vbmx5IGhlbHBlcnMgXHUyMDE0IGV4cG9ydGVkIGFzIGBfaW50ZXJuYWxgIHRvIGRpc2NvdXJhZ2UgcHJvZHVjdGlvbiB1c2UuXG5leHBvcnQgY29uc3QgX2ludGVybmFsID0ge1xuXHRBR0VOVF9GSUxFX1NVRkZJWCxcblx0SU5TVFJVQ1RJT05fRklMRV9TVUZGSVgsXG5cdFNLSUxMX0ZJTEVOQU1FLFxuXHRzZWFyY2hSb290cyxcblx0Zml4ZWREaXNjb3ZlcnlGaWxlcyxcblx0YWdlbnRJbnN0cnVjdGlvbnMsXG59O1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLFlBQVksYUFBYTtBQUVsQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsa0JBQW9DO0FBQzdDLFNBQVMsYUFBYSxtQkFBbUI7QUFDekMsU0FBUyxVQUFVLFdBQVcsWUFBWSxrQ0FBa0M7QUFDNUUsU0FBUyxXQUFXLHNCQUFzQjtBQUMxQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxVQUFVLFlBQVksV0FBVyxtQkFBbUI7QUFDN0QsU0FBUyxvQkFBMkM7QUFDcEQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBaUQseUJBQXlCLG1CQUFxRyx1QkFBdUI7QUFFdE0sU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw2QkFBNkI7QUFXL0IsSUFBVyxpQkFBWCxrQkFBV0Esb0JBQVg7QUFDTixFQUFBQSxnQkFBQSxXQUFRO0FBQ1IsRUFBQUEsZ0JBQUEsV0FBUTtBQUNSLEVBQUFBLGdC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
