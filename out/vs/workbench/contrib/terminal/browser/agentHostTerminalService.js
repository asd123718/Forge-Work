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
import { Disposable, DisposableMap, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { observableValue, transaction } from "../../../../base/common/observable.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { localize } from "../../../../nls.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { AgentHostPty } from "./agentHostPty.js";
import { AgentHostOutputChannel } from "./agentHostOutputChannel.js";
import { AhpTerminalCommandSource } from "./ahpTerminalCommandSource.js";
import { ITerminalChatService, ITerminalService } from "./terminal.js";
import { ITerminalProfileService } from "../common/terminal.js";
const AGENT_HOST_PROFILE_EXT_ID = "vscode.agent-host-terminal";
const IAgentHostTerminalService = createDecorator("agentHostTerminalService");
let AgentHostTerminalService = class extends Disposable {
  constructor(_terminalService, _terminalChatService, _terminalProfileService, _quickInputService) {
    super();
    this._terminalService = _terminalService;
    this._terminalChatService = _terminalChatService;
    this._terminalProfileService = _terminalProfileService;
    this._quickInputService = _quickInputService;
    this._entries = [];
    this._usedHosts = /* @__PURE__ */ new Set();
    this._profileRegistrations = this._register(new DisposableMap());
    this._profiles = observableValue("agentHostTerminalProfiles", []);
    this.profiles = this._profiles;
    /** Revived terminal instances, keyed by terminal URI string. */
    this._revivedInstances = /* @__PURE__ */ new Map();
    /**
     * Active AgentHostPty instances with their owning connection clientId,
     * keyed by terminal URI string. Used for reconnection scoping.
     */
    this._activePtys = /* @__PURE__ */ new Map();
    this._pendingRevives = /* @__PURE__ */ new Map();
  }
  // #region Profile management
  registerEntry(entry) {
    this._entries.push(entry);
    this._reconcile();
    return toDisposable(() => {
      const idx = this._entries.indexOf(entry);
      if (idx >= 0) {
        this._entries.splice(idx, 1);
        this._reconcile();
      }
    });
  }
  getProfileForConnection(address) {
    const entry = this._entries.find((e) => e.address === address);
    if (!entry) {
      return void 0;
    }
    if (!this._profileRegistrations.has(address)) {
      this._usedHosts.add(address);
      this._reconcile();
    }
    return this._profiles.get().find((p) => p.address === address);
  }
  setDefaultCwd(cwd) {
    this._defaultCwd = cwd;
  }
  _reconcile() {
    const entries = this._entries;
    const desiredProfiles = /* @__PURE__ */ new Map();
    if (entries.length === 0) {
    } else if (entries.length === 1) {
      desiredProfiles.set(entries[0].address, entries[0]);
    } else {
      let displaying = 0;
      for (const address of this._usedHosts) {
        const entry = entries.find((e) => e.address === address);
        if (entry) {
          displaying++;
          desiredProfiles.set(entry.address, entry);
        }
      }
      if (displaying === entries.length - 1) {
        const missing = entries.find((e) => !this._usedHosts.has(e.address));
        if (missing) {
          desiredProfiles.set(missing.address, missing);
        }
      } else if (displaying < entries.length) {
        desiredProfiles.set("__quickpick__", {
          name: localize("agentHostTerminal.pick", "Agent Host\u2026"),
          address: "__quickpick__",
          getConnection: () => void 0
        });
      }
    }
    for (const [key, entry] of desiredProfiles) {
      if (!this._profileRegistrations.has(key)) {
        this._registerProfile(key, entry, entries);
      }
    }
    for (const key of this._profileRegistrations.keys()) {
      if (!desiredProfiles.has(key)) {
        this._profileRegistrations.deleteAndDispose(key);
      }
    }
    const infos = [];
    for (const [key] of desiredProfiles) {
      infos.push({
        extensionIdentifier: AGENT_HOST_PROFILE_EXT_ID,
        profileId: key,
        title: key === "__quickpick__" ? localize("agentHostTerminal.pick", "Agent Host\u2026") : localize("agentHostTerminal.profileName", "Agent Host ({0})", desiredProfiles.get(key).name),
        address: key
      });
    }
    transaction((tx) => {
      this._profiles.set(infos, tx);
    });
  }
  _registerProfile(key, entry, allEntries) {
    const provider = {
      createContributedTerminalProfile: async (options) => {
        let connection;
        let displayName = entry.name;
        if (key === "__quickpick__") {
          const picks = allEntries.map((e) => ({
            label: localize("agentHostTerminal.profileName", "Agent Host ({0})", e.name),
            address: e.address,
            hostName: e.name
          }));
          const pick = await this._quickInputService.pick(picks, {
            placeHolder: localize("agentHostTerminal.pickHost", "Select an agent host to open a terminal on")
          });
          if (!pick) {
            return;
          }
          this._usedHosts.add(pick.address);
          this._reconcile();
          displayName = pick.hostName;
          connection = allEntries.find((e) => e.address === pick.address)?.getConnection();
        } else {
          connection = entry.getConnection();
        }
        if (!connection) {
          return;
        }
        await this.createTerminal(connection, {
          name: localize("agentHostTerminal.profileName", "Agent Host ({0})", displayName),
          cwd: options.cwd ? typeof options.cwd === "string" ? URI.file(options.cwd) : options.cwd : this._defaultCwd,
          location: options.location
        });
      }
    };
    const title = key === "__quickpick__" ? localize("agentHostTerminal.pick", "Agent Host\u2026") : localize("agentHostTerminal.profileName", "Agent Host ({0})", entry.name);
    const store = new DisposableStore();
    store.add(this._terminalProfileService.registerTerminalProfileProvider(
      AGENT_HOST_PROFILE_EXT_ID,
      key,
      provider
    ));
    store.add(this._terminalProfileService.registerInternalContributedProfile({
      extensionIdentifier: AGENT_HOST_PROFILE_EXT_ID,
      id: key,
      title,
      icon: "remote"
    }));
    this._profileRegistrations.set(key, store);
  }
  // #endregion
  async createTerminalForEntry(address, options) {
    const entry = this._entries.find((e) => e.address === address);
    if (!entry) {
      return void 0;
    }
    const connection = entry.getConnection();
    if (!connection) {
      return void 0;
    }
    return this.createTerminal(connection, options);
  }
  async createTerminal(connection, options) {
    const terminalUri = URI.from({ scheme: "agenthost-terminal", path: `/${generateUuid()}` });
    const name = options?.name ?? localize("agentHostTerminal.default", "Agent Host Terminal");
    const key = terminalUri.toString();
    const instance = await this._terminalService.createTerminal({
      config: {
        customPtyImplementation: (id, cols, rows) => {
          const pty = new AgentHostPty(id, connection, terminalUri, {
            name,
            cwd: options?.cwd
          });
          if (cols > 0 && rows > 0) {
            pty.resize(cols, rows);
          }
          this._activePtys.set(key, { pty, clientId: connection.clientId });
          return pty;
        },
        name,
        icon: { id: "remote" },
        isFeatureTerminal: false
      },
      location: options?.location
    });
    this._register(instance.onDisposed(() => {
      this._activePtys.delete(key);
    }));
    return instance;
  }
  async reviveTerminal(connection, terminalUri, terminalToolSessionId) {
    const key = terminalUri.toString();
    const pending = this._pendingRevives.get(key);
    if (pending) {
      return pending;
    }
    const revive = this._doReviveTerminal(connection, terminalUri, terminalToolSessionId, key).finally(() => {
      if (this._pendingRevives.get(key) === revive) {
        this._pendingRevives.delete(key);
      }
    });
    this._pendingRevives.set(key, revive);
    return revive;
  }
  attachOutputTerminal(connection, terminalUri, terminalToolSessionId) {
    const store = new DisposableStore();
    const source = store.add(new AgentHostOutputChannel(connection, terminalUri));
    store.add(this._terminalChatService.registerOutputSource(terminalToolSessionId, source));
    return store;
  }
  async _doReviveTerminal(connection, terminalUri, terminalToolSessionId, key) {
    const existing = this._revivedInstances.get(key);
    if (existing) {
      return existing;
    }
    const store = new DisposableStore();
    const commandSource = store.add(new AhpTerminalCommandSource());
    const instancePromise = Promise.resolve().then(() => this._terminalService.createTerminal({
      config: {
        customPtyImplementation: (id, cols, rows) => {
          const pty = new AgentHostPty(id, connection, terminalUri, {
            attachOnly: true
          });
          if (cols > 0 && rows > 0) {
            pty.resize(cols, rows);
          }
          if (!store.isDisposed) {
            commandSource.connect(instance, pty);
          }
          this._activePtys.set(key, { pty, clientId: connection.clientId });
          return pty;
        },
        name: localize("agentHostTerminal.tool", "Agent Host Terminal"),
        isFeatureTerminal: true,
        hideFromUser: true
      }
    }));
    store.add(this._terminalChatService.registerAhpCommandSource(terminalToolSessionId, commandSource, instancePromise));
    let instance;
    try {
      instance = await instancePromise;
    } catch (error) {
      store.dispose();
      throw error;
    }
    this._terminalChatService.registerTerminalInstanceWithToolSession(terminalToolSessionId, instance);
    this._revivedInstances.set(key, instance);
    instance.store.add(store);
    this._register(instance.onDisposed(() => {
      this._revivedInstances.delete(key);
      this._activePtys.delete(key);
    }));
    return instance;
  }
  async reconnectTerminals(newConnection, oldClientId) {
    const entries = [...this._activePtys.entries()].filter(
      ([, entry]) => entry.clientId === oldClientId
    );
    const total = entries.length;
    let recovered = 0;
    const promises = [];
    for (const [key, entry] of entries) {
      promises.push(
        entry.pty.reconnect(newConnection).then((success) => {
          if (success) {
            recovered++;
            entry.clientId = newConnection.clientId;
          } else {
            console.warn(`[AgentHostTerminalService] Failed to reconnect terminal: ${key}`);
          }
        })
      );
    }
    await Promise.all(promises);
    return { recovered, total };
  }
};
AgentHostTerminalService = __decorateClass([
  __decorateParam(0, ITerminalService),
  __decorateParam(1, ITerminalChatService),
  __decorateParam(2, ITerminalProfileService),
  __decorateParam(3, IQuickInputService)
], AgentHostTerminalService);
export {
  AgentHostTerminalService,
  IAgentHostTerminalService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFxicm93c2VyXFxhZ2VudEhvc3RUZXJtaW5hbFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSwgdHJhbnNhY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBZ2VudENvbm5lY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFB0eSB9IGZyb20gJy4vYWdlbnRIb3N0UHR5LmpzJztcbmltcG9ydCB7IEFnZW50SG9zdE91dHB1dENoYW5uZWwgfSBmcm9tICcuL2FnZW50SG9zdE91dHB1dENoYW5uZWwuanMnO1xuaW1wb3J0IHsgQWhwVGVybWluYWxDb21tYW5kU291cmNlIH0gZnJvbSAnLi9haHBUZXJtaW5hbENvbW1hbmRTb3VyY2UuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsQ2hhdFNlcnZpY2UsIElUZXJtaW5hbEluc3RhbmNlLCBJVGVybWluYWxMb2NhdGlvbk9wdGlvbnMsIElUZXJtaW5hbFNlcnZpY2UgfSBmcm9tICcuL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFByb2ZpbGVQcm92aWRlciwgSVRlcm1pbmFsUHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vdGVybWluYWwuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudEhvc3RUZXJtaW5hbENyZWF0ZU9wdGlvbnMge1xuXHQvKiogSHVtYW4tcmVhZGFibGUgdGVybWluYWwgbmFtZS4gKi9cblx0cmVhZG9ubHkgbmFtZT86IHN0cmluZztcblx0LyoqIEluaXRpYWwgd29ya2luZyBkaXJlY3RvcnkuICovXG5cdHJlYWRvbmx5IGN3ZD86IFVSSTtcblx0LyoqIFRlcm1pbmFsIGxvY2F0aW9uIChwYW5lbCwgZWRpdG9yLCBzcGxpdCwgZXRjLikuICovXG5cdHJlYWRvbmx5IGxvY2F0aW9uPzogSVRlcm1pbmFsTG9jYXRpb25PcHRpb25zO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudEhvc3RFbnRyeSB7XG5cdC8qKiBEaXNwbGF5IG5hbWUgZm9yIHRoZSBwcm9maWxlLiAqL1xuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdC8qKiBBZGRyZXNzIG9yIGlkZW50aWZpZXIgZm9yIHRoZSBob3N0LiAqL1xuXHRyZWFkb25seSBhZGRyZXNzOiBzdHJpbmc7XG5cdC8qKiBHZXR0ZXIgZm9yIHRoZSBjb25uZWN0aW9uIChtYXkgYmUgbGF6aWx5IHJlc29sdmVkKS4gKi9cblx0cmVhZG9ubHkgZ2V0Q29ubmVjdGlvbjogKCkgPT4gSUFnZW50Q29ubmVjdGlvbiB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRIb3N0VGVybWluYWxQcm9maWxlSW5mbyB7XG5cdHJlYWRvbmx5IGV4dGVuc2lvbklkZW50aWZpZXI6IHN0cmluZztcblx0cmVhZG9ubHkgcHJvZmlsZUlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRpdGxlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGFkZHJlc3M6IHN0cmluZztcbn1cblxuY29uc3QgQUdFTlRfSE9TVF9QUk9GSUxFX0VYVF9JRCA9ICd2c2NvZGUuYWdlbnQtaG9zdC10ZXJtaW5hbCc7XG5cbmV4cG9ydCBjb25zdCBJQWdlbnRIb3N0VGVybWluYWxTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElBZ2VudEhvc3RUZXJtaW5hbFNlcnZpY2U+KCdhZ2VudEhvc3RUZXJtaW5hbFNlcnZpY2UnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRIb3N0VGVybWluYWxTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdC8qKiBPYnNlcnZhYmxlIGxpc3Qgb2YgcmVnaXN0ZXJlZCBhZ2VudCBob3N0IHRlcm1pbmFsIHByb2ZpbGVzLiAqL1xuXHRyZWFkb25seSBwcm9maWxlczogSU9ic2VydmFibGU8cmVhZG9ubHkgSUFnZW50SG9zdFRlcm1pbmFsUHJvZmlsZUluZm9bXT47XG5cblx0LyoqXG5cdCAqIEVuc3VyZXMgYSBuYW1lZCBwcm9maWxlIGV4aXN0cyBmb3IgdGhlIGdpdmVuIGFkZHJlc3MsIGV4cGFuZGluZyBhbnlcblx0ICogY29sbGFwc2VkIHF1aWNrcGljayBwcm9maWxlIGlmIG5lZWRlZC4gUmV0dXJucyB0aGUgcHJvZmlsZSBpbmZvLCBvclxuXHQgKiBgdW5kZWZpbmVkYCBpZiBubyBlbnRyeSBpcyByZWdpc3RlcmVkIGZvciB0aGUgYWRkcmVzcy5cblx0ICovXG5cdGdldFByb2ZpbGVGb3JDb25uZWN0aW9uKGFkZHJlc3M6IHN0cmluZyk6IElBZ2VudEhvc3RUZXJtaW5hbFByb2ZpbGVJbmZvIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBSZWdpc3RlcnMgYW4gYWdlbnQgaG9zdCBlbnRyeS4gVGhlIHNlcnZpY2UgcmVjb25jaWxlcyBlbnRyaWVzIGludG9cblx0ICogdGVybWluYWwgcHJvZmlsZXMgYXV0b21hdGljYWxseS4gRGlzcG9zZSB0aGUgcmV0dXJuZWQgZGlzcG9zYWJsZSB0b1xuXHQgKiByZW1vdmUgdGhlIGVudHJ5LlxuXHQgKi9cblx0cmVnaXN0ZXJFbnRyeShlbnRyeTogSUFnZW50SG9zdEVudHJ5KTogSURpc3Bvc2FibGU7XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSBuZXcgaW50ZXJhY3RpdmUgdGVybWluYWwgb24gdGhlIGdpdmVuIGFnZW50IGhvc3QgY29ubmVjdGlvbi5cblx0ICovXG5cdGNyZWF0ZVRlcm1pbmFsKGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24sIG9wdGlvbnM/OiBJQWdlbnRIb3N0VGVybWluYWxDcmVhdGVPcHRpb25zKTogUHJvbWlzZTxJVGVybWluYWxJbnN0YW5jZT47XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSB0ZXJtaW5hbCBmb3IgdGhlIGFnZW50IGhvc3QgcmVnaXN0ZXJlZCBhdCB0aGUgZ2l2ZW4gYWRkcmVzcyxcblx0ICogcmVzb2x2aW5nIHRoZSBjb25uZWN0aW9uIGZyb20gdGhlIHJlZ2lzdGVyZWQgZW50cnkuIFJldHVybnMgYHVuZGVmaW5lZGBcblx0ICogaWYgbm8gZW50cnkgaXMgcmVnaXN0ZXJlZCBmb3IgdGhlIGFkZHJlc3MuXG5cdCAqL1xuXHRjcmVhdGVUZXJtaW5hbEZvckVudHJ5KGFkZHJlc3M6IHN0cmluZywgb3B0aW9ucz86IElBZ2VudEhvc3RUZXJtaW5hbENyZWF0ZU9wdGlvbnMpOiBQcm9taXNlPElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkPjtcblxuXHQvKipcblx0ICogUmVjb25uZWN0cyBhbGwgYWN0aXZlIHRlcm1pbmFscyB0aGF0IGJlbG9uZ2VkIHRvIHtAbGluayBvbGRDbGllbnRJZH1cblx0ICogdG8gYSBuZXcgYWdlbnQgaG9zdCBjb25uZWN0aW9uLiBPbmx5IHRlcm1pbmFscyBtYXRjaGluZyB0aGUgb2xkXG5cdCAqIGNsaWVudCBhcmUgdG91Y2hlZCBcdTIwMTQgdGVybWluYWxzIGZyb20gb3RoZXIgaG9zdHMgYXJlIGxlZnQgYWxvbmUuXG5cdCAqL1xuXHRyZWNvbm5lY3RUZXJtaW5hbHMobmV3Q29ubmVjdGlvbjogSUFnZW50Q29ubmVjdGlvbiwgb2xkQ2xpZW50SWQ6IHN0cmluZyk6IFByb21pc2U8eyByZWNvdmVyZWQ6IG51bWJlcjsgdG90YWw6IG51bWJlciB9PjtcblxuXHQvKipcblx0ICogQXR0YWNoZXMgdG8gYW4gZXhpc3Rpbmcgc2VydmVyLXNpZGUgdGVybWluYWwgYnkgc3Vic2NyaWJpbmcgdG8gaXRzXG5cdCAqIHN0YXRlIHdpdGhvdXQgY3JlYXRpbmcgYSBuZXcgcHJvY2Vzcy5cblx0ICovXG5cdHJldml2ZVRlcm1pbmFsKGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24sIHRlcm1pbmFsVXJpOiBVUkksIHRlcm1pbmFsVG9vbFNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTxJVGVybWluYWxJbnN0YW5jZT47XG5cblx0LyoqIEF0dGFjaCBhIG5vbi1wdHkgb3V0cHV0IGNoYW5uZWwgZGlyZWN0bHkgdG8gY2hhdCB3aXRob3V0IGNyZWF0aW5nIGEgdGVybWluYWwgaW5zdGFuY2UuICovXG5cdGF0dGFjaE91dHB1dFRlcm1pbmFsKGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24sIHRlcm1pbmFsVXJpOiBVUkksIHRlcm1pbmFsVG9vbFNlc3Npb25JZDogc3RyaW5nKTogSURpc3Bvc2FibGU7XG5cblx0LyoqXG5cdCAqIFNldHMgdGhlIGRlZmF1bHQgY3dkIHVzZWQgYnkgcHJvZmlsZSBwcm92aWRlcnMgd2hlbiBubyBleHBsaWNpdCBjd2Rcblx0ICogaXMgcHJvdmlkZWQuIENhbGwgd2l0aCBgdW5kZWZpbmVkYCB0byBjbGVhci5cblx0ICovXG5cdHNldERlZmF1bHRDd2QoY3dkOiBVUkkgfCB1bmRlZmluZWQpOiB2b2lkO1xufVxuXG5leHBvcnQgY2xhc3MgQWdlbnRIb3N0VGVybWluYWxTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBZ2VudEhvc3RUZXJtaW5hbFNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lbnRyaWVzOiBJQWdlbnRIb3N0RW50cnlbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF91c2VkSG9zdHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJvZmlsZVJlZ2lzdHJhdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmc+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm9maWxlcyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQWdlbnRIb3N0VGVybWluYWxQcm9maWxlSW5mb1tdPignYWdlbnRIb3N0VGVybWluYWxQcm9maWxlcycsIFtdKTtcblx0cmVhZG9ubHkgcHJvZmlsZXM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElBZ2VudEhvc3RUZXJtaW5hbFByb2ZpbGVJbmZvW10+ID0gdGhpcy5fcHJvZmlsZXM7XG5cblx0cHJpdmF0ZSBfZGVmYXVsdEN3ZDogVVJJIHwgdW5kZWZpbmVkO1xuXG5cdC8qKiBSZXZpdmVkIHRlcm1pbmFsIGluc3RhbmNlcywga2V5ZWQgYnkgdGVybWluYWwgVVJJIHN0cmluZy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcmV2aXZlZEluc3RhbmNlcyA9IG5ldyBNYXA8c3RyaW5nLCBJVGVybWluYWxJbnN0YW5jZT4oKTtcblx0LyoqXG5cdCAqIEFjdGl2ZSBBZ2VudEhvc3RQdHkgaW5zdGFuY2VzIHdpdGggdGhlaXIgb3duaW5nIGNvbm5lY3Rpb24gY2xpZW50SWQsXG5cdCAqIGtleWVkIGJ5IHRlcm1pbmFsIFVSSSBzdHJpbmcuIFVzZWQgZm9yIHJlY29ubmVjdGlvbiBzY29waW5nLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlUHR5cyA9IG5ldyBNYXA8c3RyaW5nLCB7IHB0eTogQWdlbnRIb3N0UHR5OyBjbGllbnRJZDogc3RyaW5nIH0+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdSZXZpdmVzID0gbmV3IE1hcDxzdHJpbmcsIFByb21pc2U8SVRlcm1pbmFsSW5zdGFuY2U+PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVGVybWluYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsU2VydmljZTogSVRlcm1pbmFsU2VydmljZSxcblx0XHRASVRlcm1pbmFsQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxDaGF0U2VydmljZTogSVRlcm1pbmFsQ2hhdFNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbFByb2ZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsUHJvZmlsZVNlcnZpY2U6IElUZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdC8vICNyZWdpb24gUHJvZmlsZSBtYW5hZ2VtZW50XG5cblx0cmVnaXN0ZXJFbnRyeShlbnRyeTogSUFnZW50SG9zdEVudHJ5KTogSURpc3Bvc2FibGUge1xuXHRcdHRoaXMuX2VudHJpZXMucHVzaChlbnRyeSk7XG5cdFx0dGhpcy5fcmVjb25jaWxlKCk7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRjb25zdCBpZHggPSB0aGlzLl9lbnRyaWVzLmluZGV4T2YoZW50cnkpO1xuXHRcdFx0aWYgKGlkeCA+PSAwKSB7XG5cdFx0XHRcdHRoaXMuX2VudHJpZXMuc3BsaWNlKGlkeCwgMSk7XG5cdFx0XHRcdHRoaXMuX3JlY29uY2lsZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0Z2V0UHJvZmlsZUZvckNvbm5lY3Rpb24oYWRkcmVzczogc3RyaW5nKTogSUFnZW50SG9zdFRlcm1pbmFsUHJvZmlsZUluZm8gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fZW50cmllcy5maW5kKGUgPT4gZS5hZGRyZXNzID09PSBhZGRyZXNzKTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHQvLyBFeHBhbmQgdGhlIGNvbGxhcHNlZCBxdWlja3BpY2sgcHJvZmlsZSBpbnRvIGEgbmFtZWQgb25lIGlmIG5lZWRlZFxuXHRcdGlmICghdGhpcy5fcHJvZmlsZVJlZ2lzdHJhdGlvbnMuaGFzKGFkZHJlc3MpKSB7XG5cdFx0XHR0aGlzLl91c2VkSG9zdHMuYWRkKGFkZHJlc3MpO1xuXHRcdFx0dGhpcy5fcmVjb25jaWxlKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9wcm9maWxlcy5nZXQoKS5maW5kKHAgPT4gcC5hZGRyZXNzID09PSBhZGRyZXNzKTtcblx0fVxuXG5cdHNldERlZmF1bHRDd2QoY3dkOiBVUkkgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9kZWZhdWx0Q3dkID0gY3dkO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVjb25jaWxlKCk6IHZvaWQge1xuXHRcdGNvbnN0IGVudHJpZXMgPSB0aGlzLl9lbnRyaWVzO1xuXHRcdGNvbnN0IGRlc2lyZWRQcm9maWxlcyA9IG5ldyBNYXA8c3RyaW5nLCBJQWdlbnRIb3N0RW50cnk+KCk7XG5cblx0XHRpZiAoZW50cmllcy5sZW5ndGggPT09IDApIHtcblx0XHRcdC8vIE5vIGhvc3RzIFx1MjAxNCBubyBwcm9maWxlc1xuXHRcdH0gZWxzZSBpZiAoZW50cmllcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdGRlc2lyZWRQcm9maWxlcy5zZXQoZW50cmllc1swXS5hZGRyZXNzLCBlbnRyaWVzWzBdKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gTXVsdGlwbGUgaG9zdHMgXHUyMDE0IHNob3cgbmFtZWQgcHJvZmlsZXMgZm9yIHVzZWQgb25lc1xuXHRcdFx0bGV0IGRpc3BsYXlpbmcgPSAwO1xuXHRcdFx0Zm9yIChjb25zdCBhZGRyZXNzIG9mIHRoaXMuX3VzZWRIb3N0cykge1xuXHRcdFx0XHRjb25zdCBlbnRyeSA9IGVudHJpZXMuZmluZChlID0+IGUuYWRkcmVzcyA9PT0gYWRkcmVzcyk7XG5cdFx0XHRcdGlmIChlbnRyeSkge1xuXHRcdFx0XHRcdGRpc3BsYXlpbmcrKztcblx0XHRcdFx0XHRkZXNpcmVkUHJvZmlsZXMuc2V0KGVudHJ5LmFkZHJlc3MsIGVudHJ5KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGRpc3BsYXlpbmcgPT09IGVudHJpZXMubGVuZ3RoIC0gMSkge1xuXHRcdFx0XHRjb25zdCBtaXNzaW5nID0gZW50cmllcy5maW5kKGUgPT4gIXRoaXMuX3VzZWRIb3N0cy5oYXMoZS5hZGRyZXNzKSk7XG5cdFx0XHRcdGlmIChtaXNzaW5nKSB7XG5cdFx0XHRcdFx0ZGVzaXJlZFByb2ZpbGVzLnNldChtaXNzaW5nLmFkZHJlc3MsIG1pc3NpbmcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGRpc3BsYXlpbmcgPCBlbnRyaWVzLmxlbmd0aCkge1xuXHRcdFx0XHRkZXNpcmVkUHJvZmlsZXMuc2V0KCdfX3F1aWNrcGlja19fJywge1xuXHRcdFx0XHRcdG5hbWU6IGxvY2FsaXplKCdhZ2VudEhvc3RUZXJtaW5hbC5waWNrJywgXCJBZ2VudCBIb3N0XFx1MjAyNlwiKSxcblx0XHRcdFx0XHRhZGRyZXNzOiAnX19xdWlja3BpY2tfXycsXG5cdFx0XHRcdFx0Z2V0Q29ubmVjdGlvbjogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBEaWZmIHJlZ2lzdHJhdGlvbnNcblx0XHRmb3IgKGNvbnN0IFtrZXksIGVudHJ5XSBvZiBkZXNpcmVkUHJvZmlsZXMpIHtcblx0XHRcdGlmICghdGhpcy5fcHJvZmlsZVJlZ2lzdHJhdGlvbnMuaGFzKGtleSkpIHtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXJQcm9maWxlKGtleSwgZW50cnksIGVudHJpZXMpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGtleSBvZiB0aGlzLl9wcm9maWxlUmVnaXN0cmF0aW9ucy5rZXlzKCkpIHtcblx0XHRcdGlmICghZGVzaXJlZFByb2ZpbGVzLmhhcyhrZXkpKSB7XG5cdFx0XHRcdHRoaXMuX3Byb2ZpbGVSZWdpc3RyYXRpb25zLmRlbGV0ZUFuZERpc3Bvc2Uoa2V5KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgb2JzZXJ2YWJsZVxuXHRcdGNvbnN0IGluZm9zOiBJQWdlbnRIb3N0VGVybWluYWxQcm9maWxlSW5mb1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBba2V5XSBvZiBkZXNpcmVkUHJvZmlsZXMpIHtcblx0XHRcdGluZm9zLnB1c2goe1xuXHRcdFx0XHRleHRlbnNpb25JZGVudGlmaWVyOiBBR0VOVF9IT1NUX1BST0ZJTEVfRVhUX0lELFxuXHRcdFx0XHRwcm9maWxlSWQ6IGtleSxcblx0XHRcdFx0dGl0bGU6IGtleSA9PT0gJ19fcXVpY2twaWNrX18nXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnYWdlbnRIb3N0VGVybWluYWwucGljaycsIFwiQWdlbnQgSG9zdFxcdTIwMjZcIilcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdhZ2VudEhvc3RUZXJtaW5hbC5wcm9maWxlTmFtZScsIFwiQWdlbnQgSG9zdCAoezB9KVwiLCBkZXNpcmVkUHJvZmlsZXMuZ2V0KGtleSkhLm5hbWUpLFxuXHRcdFx0XHRhZGRyZXNzOiBrZXksXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0dHJhbnNhY3Rpb24odHggPT4geyB0aGlzLl9wcm9maWxlcy5zZXQoaW5mb3MsIHR4KTsgfSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3RlclByb2ZpbGUoa2V5OiBzdHJpbmcsIGVudHJ5OiBJQWdlbnRIb3N0RW50cnksIGFsbEVudHJpZXM6IElBZ2VudEhvc3RFbnRyeVtdKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvdmlkZXI6IElUZXJtaW5hbFByb2ZpbGVQcm92aWRlciA9IHtcblx0XHRcdGNyZWF0ZUNvbnRyaWJ1dGVkVGVybWluYWxQcm9maWxlOiBhc3luYyAob3B0aW9ucykgPT4ge1xuXHRcdFx0XHRsZXQgY29ubmVjdGlvbjogSUFnZW50Q29ubmVjdGlvbiB8IHVuZGVmaW5lZDtcblx0XHRcdFx0bGV0IGRpc3BsYXlOYW1lID0gZW50cnkubmFtZTtcblxuXHRcdFx0XHRpZiAoa2V5ID09PSAnX19xdWlja3BpY2tfXycpIHtcblx0XHRcdFx0XHRjb25zdCBwaWNrczogKElRdWlja1BpY2tJdGVtICYgeyBhZGRyZXNzOiBzdHJpbmc7IGhvc3ROYW1lOiBzdHJpbmcgfSlbXSA9IGFsbEVudHJpZXMubWFwKGUgPT4gKHtcblx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWdlbnRIb3N0VGVybWluYWwucHJvZmlsZU5hbWUnLCBcIkFnZW50IEhvc3QgKHswfSlcIiwgZS5uYW1lKSxcblx0XHRcdFx0XHRcdGFkZHJlc3M6IGUuYWRkcmVzcyxcblx0XHRcdFx0XHRcdGhvc3ROYW1lOiBlLm5hbWUsXG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdGNvbnN0IHBpY2sgPSBhd2FpdCB0aGlzLl9xdWlja0lucHV0U2VydmljZS5waWNrKHBpY2tzLCB7XG5cdFx0XHRcdFx0XHRwbGFjZUhvbGRlcjogbG9jYWxpemUoJ2FnZW50SG9zdFRlcm1pbmFsLnBpY2tIb3N0JywgXCJTZWxlY3QgYW4gYWdlbnQgaG9zdCB0byBvcGVuIGEgdGVybWluYWwgb25cIiksXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0aWYgKCFwaWNrKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuX3VzZWRIb3N0cy5hZGQocGljay5hZGRyZXNzKTtcblx0XHRcdFx0XHR0aGlzLl9yZWNvbmNpbGUoKTtcblx0XHRcdFx0XHRkaXNwbGF5TmFtZSA9IHBpY2suaG9zdE5hbWU7XG5cdFx0XHRcdFx0Y29ubmVjdGlvbiA9IGFsbEVudHJpZXMuZmluZChlID0+IGUuYWRkcmVzcyA9PT0gcGljay5hZGRyZXNzKT8uZ2V0Q29ubmVjdGlvbigpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbm5lY3Rpb24gPSBlbnRyeS5nZXRDb25uZWN0aW9uKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIWNvbm5lY3Rpb24pIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRhd2FpdCB0aGlzLmNyZWF0ZVRlcm1pbmFsKGNvbm5lY3Rpb24sIHtcblx0XHRcdFx0XHRuYW1lOiBsb2NhbGl6ZSgnYWdlbnRIb3N0VGVybWluYWwucHJvZmlsZU5hbWUnLCBcIkFnZW50IEhvc3QgKHswfSlcIiwgZGlzcGxheU5hbWUpLFxuXHRcdFx0XHRcdGN3ZDogb3B0aW9ucy5jd2QgPyAodHlwZW9mIG9wdGlvbnMuY3dkID09PSAnc3RyaW5nJyA/IFVSSS5maWxlKG9wdGlvbnMuY3dkKSA6IG9wdGlvbnMuY3dkKSA6IHRoaXMuX2RlZmF1bHRDd2QsXG5cdFx0XHRcdFx0bG9jYXRpb246IG9wdGlvbnMubG9jYXRpb24sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgdGl0bGUgPSBrZXkgPT09ICdfX3F1aWNrcGlja19fJ1xuXHRcdFx0PyBsb2NhbGl6ZSgnYWdlbnRIb3N0VGVybWluYWwucGljaycsIFwiQWdlbnQgSG9zdFxcdTIwMjZcIilcblx0XHRcdDogbG9jYWxpemUoJ2FnZW50SG9zdFRlcm1pbmFsLnByb2ZpbGVOYW1lJywgXCJBZ2VudCBIb3N0ICh7MH0pXCIsIGVudHJ5Lm5hbWUpO1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0c3RvcmUuYWRkKHRoaXMuX3Rlcm1pbmFsUHJvZmlsZVNlcnZpY2UucmVnaXN0ZXJUZXJtaW5hbFByb2ZpbGVQcm92aWRlcihcblx0XHRcdEFHRU5UX0hPU1RfUFJPRklMRV9FWFRfSUQsXG5cdFx0XHRrZXksXG5cdFx0XHRwcm92aWRlcixcblx0XHQpKTtcblx0XHRzdG9yZS5hZGQodGhpcy5fdGVybWluYWxQcm9maWxlU2VydmljZS5yZWdpc3RlckludGVybmFsQ29udHJpYnV0ZWRQcm9maWxlKHtcblx0XHRcdGV4dGVuc2lvbklkZW50aWZpZXI6IEFHRU5UX0hPU1RfUFJPRklMRV9FWFRfSUQsXG5cdFx0XHRpZDoga2V5LFxuXHRcdFx0dGl0bGUsXG5cdFx0XHRpY29uOiAncmVtb3RlJyxcblx0XHR9KSk7XG5cdFx0dGhpcy5fcHJvZmlsZVJlZ2lzdHJhdGlvbnMuc2V0KGtleSwgc3RvcmUpO1xuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdGFzeW5jIGNyZWF0ZVRlcm1pbmFsRm9yRW50cnkoYWRkcmVzczogc3RyaW5nLCBvcHRpb25zPzogSUFnZW50SG9zdFRlcm1pbmFsQ3JlYXRlT3B0aW9ucyk6IFByb21pc2U8SVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2VudHJpZXMuZmluZChlID0+IGUuYWRkcmVzcyA9PT0gYWRkcmVzcyk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGVudHJ5LmdldENvbm5lY3Rpb24oKTtcblx0XHRpZiAoIWNvbm5lY3Rpb24pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmNyZWF0ZVRlcm1pbmFsKGNvbm5lY3Rpb24sIG9wdGlvbnMpO1xuXHR9XG5cblx0YXN5bmMgY3JlYXRlVGVybWluYWwoY29ubmVjdGlvbjogSUFnZW50Q29ubmVjdGlvbiwgb3B0aW9ucz86IElBZ2VudEhvc3RUZXJtaW5hbENyZWF0ZU9wdGlvbnMpOiBQcm9taXNlPElUZXJtaW5hbEluc3RhbmNlPiB7XG5cdFx0Y29uc3QgdGVybWluYWxVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2FnZW50aG9zdC10ZXJtaW5hbCcsIHBhdGg6IGAvJHtnZW5lcmF0ZVV1aWQoKX1gIH0pO1xuXHRcdGNvbnN0IG5hbWUgPSBvcHRpb25zPy5uYW1lID8/IGxvY2FsaXplKCdhZ2VudEhvc3RUZXJtaW5hbC5kZWZhdWx0JywgXCJBZ2VudCBIb3N0IFRlcm1pbmFsXCIpO1xuXHRcdGNvbnN0IGtleSA9IHRlcm1pbmFsVXJpLnRvU3RyaW5nKCk7XG5cblx0XHRjb25zdCBpbnN0YW5jZSA9IGF3YWl0IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5jcmVhdGVUZXJtaW5hbCh7XG5cdFx0XHRjb25maWc6IHtcblx0XHRcdFx0Y3VzdG9tUHR5SW1wbGVtZW50YXRpb246IChpZCwgY29scywgcm93cykgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHB0eSA9IG5ldyBBZ2VudEhvc3RQdHkoaWQsIGNvbm5lY3Rpb24sIHRlcm1pbmFsVXJpLCB7XG5cdFx0XHRcdFx0XHRuYW1lLFxuXHRcdFx0XHRcdFx0Y3dkOiBvcHRpb25zPy5jd2QsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0aWYgKGNvbHMgPiAwICYmIHJvd3MgPiAwKSB7XG5cdFx0XHRcdFx0XHRwdHkucmVzaXplKGNvbHMsIHJvd3MpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl9hY3RpdmVQdHlzLnNldChrZXksIHsgcHR5LCBjbGllbnRJZDogY29ubmVjdGlvbi5jbGllbnRJZCB9KTtcblx0XHRcdFx0XHRyZXR1cm4gcHR5O1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRuYW1lLFxuXHRcdFx0XHRpY29uOiB7IGlkOiAncmVtb3RlJyB9LFxuXHRcdFx0XHRpc0ZlYXR1cmVUZXJtaW5hbDogZmFsc2UsXG5cdFx0XHR9LFxuXHRcdFx0bG9jYXRpb246IG9wdGlvbnM/LmxvY2F0aW9uLFxuXHRcdH0pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoaW5zdGFuY2Uub25EaXNwb3NlZCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9hY3RpdmVQdHlzLmRlbGV0ZShrZXkpO1xuXHRcdH0pKTtcblxuXHRcdHJldHVybiBpbnN0YW5jZTtcblx0fVxuXG5cdGFzeW5jIHJldml2ZVRlcm1pbmFsKGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24sIHRlcm1pbmFsVXJpOiBVUkksIHRlcm1pbmFsVG9vbFNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTxJVGVybWluYWxJbnN0YW5jZT4ge1xuXHRcdGNvbnN0IGtleSA9IHRlcm1pbmFsVXJpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgcGVuZGluZyA9IHRoaXMuX3BlbmRpbmdSZXZpdmVzLmdldChrZXkpO1xuXHRcdGlmIChwZW5kaW5nKSB7XG5cdFx0XHRyZXR1cm4gcGVuZGluZztcblx0XHR9XG5cdFx0Y29uc3QgcmV2aXZlID0gdGhpcy5fZG9SZXZpdmVUZXJtaW5hbChjb25uZWN0aW9uLCB0ZXJtaW5hbFVyaSwgdGVybWluYWxUb29sU2Vzc2lvbklkLCBrZXkpLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3BlbmRpbmdSZXZpdmVzLmdldChrZXkpID09PSByZXZpdmUpIHtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ1Jldml2ZXMuZGVsZXRlKGtleSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5fcGVuZGluZ1Jldml2ZXMuc2V0KGtleSwgcmV2aXZlKTtcblx0XHRyZXR1cm4gcmV2aXZlO1xuXHR9XG5cblx0YXR0YWNoT3V0cHV0VGVybWluYWwoY29ubmVjdGlvbjogSUFnZW50Q29ubmVjdGlvbiwgdGVybWluYWxVcmk6IFVSSSwgdGVybWluYWxUb29sU2Vzc2lvbklkOiBzdHJpbmcpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3Qgc291cmNlID0gc3RvcmUuYWRkKG5ldyBBZ2VudEhvc3RPdXRwdXRDaGFubmVsKGNvbm5lY3Rpb24sIHRlcm1pbmFsVXJpKSk7XG5cdFx0c3RvcmUuYWRkKHRoaXMuX3Rlcm1pbmFsQ2hhdFNlcnZpY2UucmVnaXN0ZXJPdXRwdXRTb3VyY2UodGVybWluYWxUb29sU2Vzc2lvbklkLCBzb3VyY2UpKTtcblx0XHRyZXR1cm4gc3RvcmU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9kb1Jldml2ZVRlcm1pbmFsKGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24sIHRlcm1pbmFsVXJpOiBVUkksIHRlcm1pbmFsVG9vbFNlc3Npb25JZDogc3RyaW5nLCBrZXk6IHN0cmluZyk6IFByb21pc2U8SVRlcm1pbmFsSW5zdGFuY2U+IHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3Jldml2ZWRJbnN0YW5jZXMuZ2V0KGtleSk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRyZXR1cm4gZXhpc3Rpbmc7XG5cdFx0fVxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGNvbW1hbmRTb3VyY2UgPSBzdG9yZS5hZGQobmV3IEFocFRlcm1pbmFsQ29tbWFuZFNvdXJjZSgpKTtcblxuXHRcdGNvbnN0IGluc3RhbmNlUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpLnRoZW4oKCkgPT4gdGhpcy5fdGVybWluYWxTZXJ2aWNlLmNyZWF0ZVRlcm1pbmFsKHtcblx0XHRcdGNvbmZpZzoge1xuXHRcdFx0XHRjdXN0b21QdHlJbXBsZW1lbnRhdGlvbjogKGlkLCBjb2xzLCByb3dzKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcHR5ID0gbmV3IEFnZW50SG9zdFB0eShpZCwgY29ubmVjdGlvbiwgdGVybWluYWxVcmksIHtcblx0XHRcdFx0XHRcdGF0dGFjaE9ubHk6IHRydWUsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0aWYgKGNvbHMgPiAwICYmIHJvd3MgPiAwKSB7XG5cdFx0XHRcdFx0XHRwdHkucmVzaXplKGNvbHMsIHJvd3MpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICghc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdFx0Y29tbWFuZFNvdXJjZS5jb25uZWN0KGluc3RhbmNlLCBwdHkpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRoaXMuX2FjdGl2ZVB0eXMuc2V0KGtleSwgeyBwdHksIGNsaWVudElkOiBjb25uZWN0aW9uLmNsaWVudElkIH0pO1xuXHRcdFx0XHRcdHJldHVybiBwdHk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG5hbWU6IGxvY2FsaXplKCdhZ2VudEhvc3RUZXJtaW5hbC50b29sJywgXCJBZ2VudCBIb3N0IFRlcm1pbmFsXCIpLFxuXHRcdFx0XHRpc0ZlYXR1cmVUZXJtaW5hbDogdHJ1ZSxcblx0XHRcdFx0aGlkZUZyb21Vc2VyOiB0cnVlLFxuXHRcdFx0fSxcblx0XHR9KSk7XG5cdFx0c3RvcmUuYWRkKHRoaXMuX3Rlcm1pbmFsQ2hhdFNlcnZpY2UucmVnaXN0ZXJBaHBDb21tYW5kU291cmNlKHRlcm1pbmFsVG9vbFNlc3Npb25JZCwgY29tbWFuZFNvdXJjZSwgaW5zdGFuY2VQcm9taXNlKSk7XG5cdFx0bGV0IGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZTtcblx0XHR0cnkge1xuXHRcdFx0aW5zdGFuY2UgPSBhd2FpdCBpbnN0YW5jZVByb21pc2U7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0XHR0aGlzLl90ZXJtaW5hbENoYXRTZXJ2aWNlLnJlZ2lzdGVyVGVybWluYWxJbnN0YW5jZVdpdGhUb29sU2Vzc2lvbih0ZXJtaW5hbFRvb2xTZXNzaW9uSWQsIGluc3RhbmNlKTtcblxuXHRcdHRoaXMuX3Jldml2ZWRJbnN0YW5jZXMuc2V0KGtleSwgaW5zdGFuY2UpO1xuXHRcdGluc3RhbmNlLnN0b3JlLmFkZChzdG9yZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoaW5zdGFuY2Uub25EaXNwb3NlZCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9yZXZpdmVkSW5zdGFuY2VzLmRlbGV0ZShrZXkpO1xuXHRcdFx0dGhpcy5fYWN0aXZlUHR5cy5kZWxldGUoa2V5KTtcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gaW5zdGFuY2U7XG5cdH1cblxuXHRhc3luYyByZWNvbm5lY3RUZXJtaW5hbHMobmV3Q29ubmVjdGlvbjogSUFnZW50Q29ubmVjdGlvbiwgb2xkQ2xpZW50SWQ6IHN0cmluZyk6IFByb21pc2U8eyByZWNvdmVyZWQ6IG51bWJlcjsgdG90YWw6IG51bWJlciB9PiB7XG5cdFx0Ly8gT25seSByZWNvbm5lY3QgdGVybWluYWxzIHRoYXQgYmVsb25nZWQgdG8gdGhlIG9sZCBjb25uZWN0aW9uXG5cdFx0Ly8gaWRlbnRpZmllZCBieSBvbGRDbGllbnRJZC4gSW4gbXVsdGktaG9zdCBzZXR1cHMsIG90aGVyIGhvc3RzJ1xuXHRcdC8vIHRlcm1pbmFscyBhcmUgbGVmdCB1bnRvdWNoZWQuXG5cdFx0Y29uc3QgZW50cmllcyA9IFsuLi50aGlzLl9hY3RpdmVQdHlzLmVudHJpZXMoKV0uZmlsdGVyKFxuXHRcdFx0KFssIGVudHJ5XSkgPT4gZW50cnkuY2xpZW50SWQgPT09IG9sZENsaWVudElkXG5cdFx0KTtcblx0XHRjb25zdCB0b3RhbCA9IGVudHJpZXMubGVuZ3RoO1xuXHRcdGxldCByZWNvdmVyZWQgPSAwO1xuXHRcdGNvbnN0IHByb21pc2VzOiBQcm9taXNlPHZvaWQ+W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IFtrZXksIGVudHJ5XSBvZiBlbnRyaWVzKSB7XG5cdFx0XHRwcm9taXNlcy5wdXNoKFxuXHRcdFx0XHRlbnRyeS5wdHkucmVjb25uZWN0KG5ld0Nvbm5lY3Rpb24pLnRoZW4oc3VjY2VzcyA9PiB7XG5cdFx0XHRcdFx0aWYgKHN1Y2Nlc3MpIHtcblx0XHRcdFx0XHRcdHJlY292ZXJlZCsrO1xuXHRcdFx0XHRcdFx0Ly8gVXBkYXRlIHRoZSBjbGllbnRJZCB0byB0aGUgbmV3IGNvbm5lY3Rpb25cblx0XHRcdFx0XHRcdGVudHJ5LmNsaWVudElkID0gbmV3Q29ubmVjdGlvbi5jbGllbnRJZDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29uc29sZS53YXJuKGBbQWdlbnRIb3N0VGVybWluYWxTZXJ2aWNlXSBGYWlsZWQgdG8gcmVjb25uZWN0IHRlcm1pbmFsOiAke2tleX1gKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pXG5cdFx0XHQpO1xuXHRcdH1cblx0XHRhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG5cdFx0cmV0dXJuIHsgcmVjb3ZlcmVkLCB0b3RhbCB9O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsWUFBWSxlQUFlLGlCQUE4QixvQkFBb0I7QUFDdEYsU0FBc0IsaUJBQWlCLG1CQUFtQjtBQUMxRCxTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywwQkFBMEM7QUFDbkQsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxzQkFBbUUsd0JBQXdCO0FBQ3BHLFNBQW1DLCtCQUErQjtBQTJCbEUsTUFBTSw0QkFBNEI7QUFFM0IsTUFBTSw0QkFBNEIsZ0JBQTJDLDBCQUEwQjtBQXlEdkcsSUFBTSwyQkFBTixjQUF1QyxXQUFnRDtBQUFBLEVBb0I3RixZQUNvQyxrQkFDSSxzQkFDRyx5QkFDTCxvQkFDcEM7QUFDRCxVQUFNO0FBTDZCO0FBQ0k7QUFDRztBQUNMO0FBckJ0QyxTQUFpQixXQUE4QixDQUFDO0FBQ2hELFNBQWlCLGFBQWEsb0JBQUksSUFBWTtBQUM5QyxTQUFpQix3QkFBd0IsS0FBSyxVQUFVLElBQUksY0FBc0IsQ0FBQztBQUNuRixTQUFpQixZQUFZLGdCQUEwRCw2QkFBNkIsQ0FBQyxDQUFDO0FBQ3RILFNBQVMsV0FBa0UsS0FBSztBQUtoRjtBQUFBLFNBQWlCLG9CQUFvQixvQkFBSSxJQUErQjtBQUt4RTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQWlCLGNBQWMsb0JBQUksSUFBcUQ7QUFDeEYsU0FBaUIsa0JBQWtCLG9CQUFJLElBQXdDO0FBQUEsRUFTL0U7QUFBQTtBQUFBLEVBSUEsY0FBYyxPQUFxQztBQUNsRCxTQUFLLFNBQVMsS0FBSyxLQUFLO0FBQ3hCLFNBQUssV0FBVztBQUNoQixXQUFPLGFBQWEsTUFBTTtBQUN6QixZQUFNLE1BQU0sS0FBSyxTQUFTLFFBQVEsS0FBSztBQUN2QyxVQUFJLE9BQU8sR0FBRztBQUNiLGFBQUssU0FBUyxPQUFPLEtBQUssQ0FBQztBQUMzQixhQUFLLFdBQVc7QUFBQSxNQUNqQjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLHdCQUF3QixTQUE0RDtBQUNuRixVQUFNLFFBQVEsS0FBSyxTQUFTLEtBQUssT0FBSyxFQUFFLFlBQVksT0FBTztBQUMzRCxRQUFJLENBQUMsT0FBTztBQUNYLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxDQUFDLEtBQUssc0JBQXNCLElBQUksT0FBTyxHQUFHO0FBQzdDLFdBQUssV0FBVyxJQUFJLE9BQU87QUFDM0IsV0FBSyxXQUFXO0FBQUEsSUFDakI7QUFDQSxXQUFPLEtBQUssVUFBVSxJQUFJLEVBQUUsS0FBSyxPQUFLLEVBQUUsWUFBWSxPQUFPO0FBQUEsRUFDNUQ7QUFBQSxFQUVBLGNBQWMsS0FBNEI7QUFDekMsU0FBSyxjQUFjO0FBQUEsRUFDcEI7QUFBQSxFQUVRLGFBQW1CO0FBQzFCLFVBQU0sVUFBVSxLQUFLO0FBQ3JCLFVBQU0sa0JBQWtCLG9CQUFJLElBQTZCO0FBRXpELFFBQUksUUFBUSxXQUFXLEdBQUc7QUFBQSxJQUUxQixXQUFXLFFBQVEsV0FBVyxHQUFHO0FBQ2hDLHNCQUFnQixJQUFJLFFBQVEsQ0FBQyxFQUFFLFNBQVMsUUFBUSxDQUFDLENBQUM7QUFBQSxJQUNuRCxPQUFPO0FBRU4sVUFBSSxhQUFhO0FBQ2pCLGlCQUFXLFdBQVcsS0FBSyxZQUFZO0FBQ3RDLGNBQU0sUUFBUSxRQUFRLEtBQUssT0FBSyxFQUFFLFlBQVksT0FBTztBQUNyRCxZQUFJLE9BQU87QUFDVjtBQUNBLDBCQUFnQixJQUFJLE1BQU0sU0FBUyxLQUFLO0FBQUEsUUFDekM7QUFBQSxNQUNEO0FBQ0EsVUFBSSxlQUFlLFFBQVEsU0FBUyxHQUFHO0FBQ3RDLGNBQU0sVUFBVSxRQUFRLEtBQUssT0FBSyxDQUFDLEtBQUssV0FBVyxJQUFJLEVBQUUsT0FBTyxDQUFDO0FBQ2pFLFlBQUksU0FBUztBQUNaLDBCQUFnQixJQUFJLFFBQVEsU0FBUyxPQUFPO0FBQUEsUUFDN0M7QUFBQSxNQUNELFdBQVcsYUFBYSxRQUFRLFFBQVE7QUFDdkMsd0JBQWdCLElBQUksaUJBQWlCO0FBQUEsVUFDcEMsTUFBTSxTQUFTLDBCQUEwQixrQkFBa0I7QUFBQSxVQUMzRCxTQUFTO0FBQUEsVUFDVCxlQUFlLE1BQU07QUFBQSxRQUN0QixDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0Q7QUFHQSxlQUFXLENBQUMsS0FBSyxLQUFLLEtBQUssaUJBQWlCO0FBQzNDLFVBQUksQ0FBQyxLQUFLLHNCQUFzQixJQUFJLEdBQUcsR0FBRztBQUN6QyxhQUFLLGlCQUFpQixLQUFLLE9BQU8sT0FBTztBQUFBLE1BQzFDO0FBQUEsSUFDRDtBQUNBLGVBQVcsT0FBTyxLQUFLLHNCQUFzQixLQUFLLEdBQUc7QUFDcEQsVUFBSSxDQUFDLGdCQUFnQixJQUFJLEdBQUcsR0FBRztBQUM5QixhQUFLLHNCQUFzQixpQkFBaUIsR0FBRztBQUFBLE1BQ2hEO0FBQUEsSUFDRDtBQUdBLFVBQU0sUUFBeUMsQ0FBQztBQUNoRCxlQUFXLENBQUMsR0FBRyxLQUFLLGlCQUFpQjtBQUNwQyxZQUFNLEtBQUs7QUFBQSxRQUNWLHFCQUFxQjtBQUFBLFFBQ3JCLFdBQVc7QUFBQSxRQUNYLE9BQU8sUUFBUSxrQkFDWixTQUFTLDBCQUEwQixrQkFBa0IsSUFDckQsU0FBUyxpQ0FBaUMsb0JBQW9CLGdCQUFnQixJQUFJLEdBQUcsRUFBRyxJQUFJO0FBQUEsUUFDL0YsU0FBUztBQUFBLE1BQ1YsQ0FBQztBQUFBLElBQ0Y7QUFDQSxnQkFBWSxRQUFNO0FBQUUsV0FBSyxVQUFVLElBQUksT0FBTyxFQUFFO0FBQUEsSUFBRyxDQUFDO0FBQUEsRUFDckQ7QUFBQSxFQUVRLGlCQUFpQixLQUFhLE9BQXdCLFlBQXFDO0FBQ2xHLFVBQU0sV0FBcUM7QUFBQSxNQUMxQyxrQ0FBa0MsT0FBTyxZQUFZO0FBQ3BELFlBQUk7QUFDSixZQUFJLGNBQWMsTUFBTTtBQUV4QixZQUFJLFFBQVEsaUJBQWlCO0FBQzVCLGdCQUFNLFFBQW9FLFdBQVcsSUFBSSxRQUFNO0FBQUEsWUFDOUYsT0FBTyxTQUFTLGlDQUFpQyxvQkFBb0IsRUFBRSxJQUFJO0FBQUEsWUFDM0UsU0FBUyxFQUFFO0FBQUEsWUFDWCxVQUFVLEVBQUU7QUFBQSxVQUNiLEVBQUU7QUFDRixnQkFBTSxPQUFPLE1BQU0sS0FBSyxtQkFBbUIsS0FBSyxPQUFPO0FBQUEsWUFDdEQsYUFBYSxTQUFTLDhCQUE4Qiw0Q0FBNEM7QUFBQSxVQUNqRyxDQUFDO0FBQ0QsY0FBSSxDQUFDLE1BQU07QUFDVjtBQUFBLFVBQ0Q7QUFDQSxlQUFLLFdBQVcsSUFBSSxLQUFLLE9BQU87QUFDaEMsZUFBSyxXQUFXO0FBQ2hCLHdCQUFjLEtBQUs7QUFDbkIsdUJBQWEsV0FBVyxLQUFLLE9BQUssRUFBRSxZQUFZLEtBQUssT0FBTyxHQUFHLGNBQWM7QUFBQSxRQUM5RSxPQUFPO0FBQ04sdUJBQWEsTUFBTSxjQUFjO0FBQUEsUUFDbEM7QUFFQSxZQUFJLENBQUMsWUFBWTtBQUNoQjtBQUFBLFFBQ0Q7QUFFQSxjQUFNLEtBQUssZUFBZSxZQUFZO0FBQUEsVUFDckMsTUFBTSxTQUFTLGlDQUFpQyxvQkFBb0IsV0FBVztBQUFBLFVBQy9FLEtBQUssUUFBUSxNQUFPLE9BQU8sUUFBUSxRQUFRLFdBQVcsSUFBSSxLQUFLLFFBQVEsR0FBRyxJQUFJLFFBQVEsTUFBTyxLQUFLO0FBQUEsVUFDbEcsVUFBVSxRQUFRO0FBQUEsUUFDbkIsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNEO0FBRUEsVUFBTSxRQUFRLFFBQVEsa0JBQ25CLFNBQVMsMEJBQTBCLGtCQUFrQixJQUNyRCxTQUFTLGlDQUFpQyxvQkFBb0IsTUFBTSxJQUFJO0FBRTNFLFVBQU0sUUFBUSxJQUFJLGdCQUFnQjtBQUNsQyxVQUFNLElBQUksS0FBSyx3QkFBd0I7QUFBQSxNQUN0QztBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxDQUFDO0FBQ0QsVUFBTSxJQUFJLEtBQUssd0JBQXdCLG1DQUFtQztBQUFBLE1BQ3pFLHFCQUFxQjtBQUFBLE1BQ3JCLElBQUk7QUFBQSxNQUNKO0FBQUEsTUFDQSxNQUFNO0FBQUEsSUFDUCxDQUFDLENBQUM7QUFDRixTQUFLLHNCQUFzQixJQUFJLEtBQUssS0FBSztBQUFBLEVBQzFDO0FBQUE7QUFBQSxFQUlBLE1BQU0sdUJBQXVCLFNBQWlCLFNBQW1GO0FBQ2hJLFVBQU0sUUFBUSxLQUFLLFNBQVMsS0FBSyxPQUFLLEVBQUUsWUFBWSxPQUFPO0FBQzNELFFBQUksQ0FBQyxPQUFPO0FBQ1gsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLGFBQWEsTUFBTSxjQUFjO0FBQ3ZDLFFBQUksQ0FBQyxZQUFZO0FBQ2hCLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxLQUFLLGVBQWUsWUFBWSxPQUFPO0FBQUEsRUFDL0M7QUFBQSxFQUVBLE1BQU0sZUFBZSxZQUE4QixTQUF1RTtBQUN6SCxVQUFNLGNBQWMsSUFBSSxLQUFLLEVBQUUsUUFBUSxzQkFBc0IsTUFBTSxJQUFJLGFBQWEsQ0FBQyxHQUFHLENBQUM7QUFDekYsVUFBTSxPQUFPLFNBQVMsUUFBUSxTQUFTLDZCQUE2QixxQkFBcUI7QUFDekYsVUFBTSxNQUFNLFlBQVksU0FBUztBQUVqQyxVQUFNLFdBQVcsTUFBTSxLQUFLLGlCQUFpQixlQUFlO0FBQUEsTUFDM0QsUUFBUTtBQUFBLFFBQ1AseUJBQXlCLENBQUMsSUFBSSxNQUFNLFNBQVM7QUFDNUMsZ0JBQU0sTUFBTSxJQUFJLGFBQWEsSUFBSSxZQUFZLGFBQWE7QUFBQSxZQUN6RDtBQUFBLFlBQ0EsS0FBSyxTQUFTO0FBQUEsVUFDZixDQUFDO0FBQ0QsY0FBSSxPQUFPLEtBQUssT0FBTyxHQUFHO0FBQ3pCLGdCQUFJLE9BQU8sTUFBTSxJQUFJO0FBQUEsVUFDdEI7QUFDQSxlQUFLLFlBQVksSUFBSSxLQUFLLEVBQUUsS0FBSyxVQUFVLFdBQVcsU0FBUyxDQUFDO0FBQ2hFLGlCQUFPO0FBQUEsUUFDUjtBQUFBLFFBQ0E7QUFBQSxRQUNBLE1BQU0sRUFBRSxJQUFJLFNBQVM7QUFBQSxRQUNyQixtQkFBbUI7QUFBQSxNQUNwQjtBQUFBLE1BQ0EsVUFBVSxTQUFTO0FBQUEsSUFDcEIsQ0FBQztBQUVELFNBQUssVUFBVSxTQUFTLFdBQVcsTUFBTTtBQUN4QyxXQUFLLFlBQVksT0FBTyxHQUFHO0FBQUEsSUFDNUIsQ0FBQyxDQUFDO0FBRUYsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQU0sZUFBZSxZQUE4QixhQUFrQix1QkFBMkQ7QUFDL0gsVUFBTSxNQUFNLFlBQVksU0FBUztBQUNqQyxVQUFNLFVBQVUsS0FBSyxnQkFBZ0IsSUFBSSxHQUFHO0FBQzVDLFFBQUksU0FBUztBQUNaLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxTQUFTLEtBQUssa0JBQWtCLFlBQVksYUFBYSx1QkFBdUIsR0FBRyxFQUFFLFFBQVEsTUFBTTtBQUN4RyxVQUFJLEtBQUssZ0JBQWdCLElBQUksR0FBRyxNQUFNLFFBQVE7QUFDN0MsYUFBSyxnQkFBZ0IsT0FBTyxHQUFHO0FBQUEsTUFDaEM7QUFBQSxJQUNELENBQUM7QUFDRCxTQUFLLGdCQUFnQixJQUFJLEtBQUssTUFBTTtBQUNwQyxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEscUJBQXFCLFlBQThCLGFBQWtCLHVCQUE0QztBQUNoSCxVQUFNLFFBQVEsSUFBSSxnQkFBZ0I7QUFDbEMsVUFBTSxTQUFTLE1BQU0sSUFBSSxJQUFJLHVCQUF1QixZQUFZLFdBQVcsQ0FBQztBQUM1RSxVQUFNLElBQUksS0FBSyxxQkFBcUIscUJBQXFCLHVCQUF1QixNQUFNLENBQUM7QUFDdkYsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQWMsa0JBQWtCLFlBQThCLGFBQWtCLHVCQUErQixLQUF5QztBQUN2SixVQUFNLFdBQVcsS0FBSyxrQkFBa0IsSUFBSSxHQUFHO0FBQy9DLFFBQUksVUFBVTtBQUNiLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxRQUFRLElBQUksZ0JBQWdCO0FBQ2xDLFVBQU0sZ0JBQWdCLE1BQU0sSUFBSSxJQUFJLHlCQUF5QixDQUFDO0FBRTlELFVBQU0sa0JBQWtCLFFBQVEsUUFBUSxFQUFFLEtBQUssTUFBTSxLQUFLLGlCQUFpQixlQUFlO0FBQUEsTUFDekYsUUFBUTtBQUFBLFFBQ1AseUJBQXlCLENBQUMsSUFBSSxNQUFNLFNBQVM7QUFDNUMsZ0JBQU0sTUFBTSxJQUFJLGFBQWEsSUFBSSxZQUFZLGFBQWE7QUFBQSxZQUN6RCxZQUFZO0FBQUEsVUFDYixDQUFDO0FBQ0QsY0FBSSxPQUFPLEtBQUssT0FBTyxHQUFHO0FBQ3pCLGdCQUFJLE9BQU8sTUFBTSxJQUFJO0FBQUEsVUFDdEI7QUFFQSxjQUFJLENBQUMsTUFBTSxZQUFZO0FBQ3RCLDBCQUFjLFFBQVEsVUFBVSxHQUFHO0FBQUEsVUFDcEM7QUFFQSxlQUFLLFlBQVksSUFBSSxLQUFLLEVBQUUsS0FBSyxVQUFVLFdBQVcsU0FBUyxDQUFDO0FBQ2hFLGlCQUFPO0FBQUEsUUFDUjtBQUFBLFFBQ0EsTUFBTSxTQUFTLDBCQUEwQixxQkFBcUI7QUFBQSxRQUM5RCxtQkFBbUI7QUFBQSxRQUNuQixjQUFjO0FBQUEsTUFDZjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsVUFBTSxJQUFJLEtBQUsscUJBQXFCLHlCQUF5Qix1QkFBdUIsZUFBZSxlQUFlLENBQUM7QUFDbkgsUUFBSTtBQUNKLFFBQUk7QUFDSCxpQkFBVyxNQUFNO0FBQUEsSUFDbEIsU0FBUyxPQUFPO0FBQ2YsWUFBTSxRQUFRO0FBQ2QsWUFBTTtBQUFBLElBQ1A7QUFDQSxTQUFLLHFCQUFxQix3Q0FBd0MsdUJBQXVCLFFBQVE7QUFFakcsU0FBSyxrQkFBa0IsSUFBSSxLQUFLLFFBQVE7QUFDeEMsYUFBUyxNQUFNLElBQUksS0FBSztBQUN4QixTQUFLLFVBQVUsU0FBUyxXQUFXLE1BQU07QUFDeEMsV0FBSyxrQkFBa0IsT0FBTyxHQUFHO0FBQ2pDLFdBQUssWUFBWSxPQUFPLEdBQUc7QUFBQSxJQUM1QixDQUFDLENBQUM7QUFFRixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBTSxtQkFBbUIsZUFBaUMsYUFBb0U7QUFJN0gsVUFBTSxVQUFVLENBQUMsR0FBRyxLQUFLLFlBQVksUUFBUSxDQUFDLEVBQUU7QUFBQSxNQUMvQyxDQUFDLENBQUMsRUFBRSxLQUFLLE1BQU0sTUFBTSxhQUFhO0FBQUEsSUFDbkM7QUFDQSxVQUFNLFFBQVEsUUFBUTtBQUN0QixRQUFJLFlBQVk7QUFDaEIsVUFBTSxXQUE0QixDQUFDO0FBQ25DLGVBQVcsQ0FBQyxLQUFLLEtBQUssS0FBSyxTQUFTO0FBQ25DLGVBQVM7QUFBQSxRQUNSLE1BQU0sSUFBSSxVQUFVLGFBQWEsRUFBRSxLQUFLLGFBQVc7QUFDbEQsY0FBSSxTQUFTO0FBQ1o7QUFFQSxrQkFBTSxXQUFXLGNBQWM7QUFBQSxVQUNoQyxPQUFPO0FBQ04sb0JBQVEsS0FBSyw0REFBNEQsR0FBRyxFQUFFO0FBQUEsVUFDL0U7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRDtBQUNBLFVBQU0sUUFBUSxJQUFJLFFBQVE7QUFDMUIsV0FBTyxFQUFFLFdBQVcsTUFBTTtBQUFBLEVBQzNCO0FBQ0Q7QUFoVWEsMkJBQU47QUFBQSxFQXFCSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBeEJVOyIsCiAgIm5hbWVzIjogW10KfQo=
