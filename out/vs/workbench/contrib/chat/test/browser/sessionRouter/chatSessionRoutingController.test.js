import assert from "assert";
import sinon from "sinon";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { AnchorPosition } from "../../../../../../base/common/layout.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { AgentSessionProviders } from "../../../browser/agentSessions/agentSessions.js";
import { ChatSessionRoutingController } from "../../../browser/sessionRouter/chatSessionRoutingController.js";
import { ChatRequestQueueKind } from "../../../common/chatService/chatService.js";
import { ChatModeKind } from "../../../common/constants.js";
suite("ChatSessionRoutingController", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  teardown(() => sinon.restore());
  test("shows the selected folder and folder picker for multi-root new sessions", async () => {
    const clock = sinon.useFakeTimers();
    const vscode = folder("vscode", "/work/vscode", 0);
    const docs = folder("docs", "/work/docs", 1);
    const container = document.createElement("div");
    document.body.appendChild(container);
    let submitted = false;
    let pickerItems;
    let pickerDelegate;
    let pickerAnchor;
    let pickerContainer;
    let pickerOptions;
    const pickerVisibility = [];
    let folderDialogDefault;
    const actionWidgetService = {
      show: (_user, _supportsPreview, items, delegate, anchor, actionWidgetContainer, _actionBarActions, _accessibilityProvider, listOptions) => {
        pickerItems = items;
        pickerDelegate = delegate;
        pickerAnchor = anchor;
        pickerContainer = actionWidgetContainer;
        pickerOptions = listOptions;
      },
      hide: () => pickerDelegate?.onHide()
    };
    const host = {
      widget: {
        inputEditor: {
          onDidChangeModelContent: Event.None,
          getValue: () => "create a new session to update docs"
        },
        attachmentModel: {
          onDidChange: Event.None,
          attachments: []
        },
        input: { setSubmitPending: () => {
        } },
        getSelectedModelRequestOptions: () => ({ userSelectedModelId: "copilot/claude-opus-4.6" }),
        getModeRequestOptions: () => ({})
      },
      getOwnSessionResource: () => void 0,
      getNewSessionTarget: () => AgentSessionProviders.AgentHostCopilot,
      getSelectedModelLabel: () => "Claude Opus 4.6",
      onDidChangeActionWidgetVisibility: (visible) => pickerVisibility.push(visible),
      getActionWidgetContainer: () => container,
      getActionWidgetAnchor: (anchor) => anchor,
      getActionWidgetAnchorPosition: () => AnchorPosition.BELOW,
      pickFolder: async (defaultUri) => {
        folderDialogDefault = defaultUri;
        return URI.file("/outside/external-project");
      },
      placeBadge: (badge) => container.appendChild(badge)
    };
    const workspaceContextService = {
      getWorkspace: () => ({ folders: [vscode, docs] }),
      getWorkspaceFolder: (resource) => [vscode, docs].find((candidate) => candidate.uri.toString() === resource.toString())
    };
    const controller = new ChatSessionRoutingController(
      host,
      "test",
      { sendRequest: async () => {
        submitted = true;
        return { kind: "rejected" };
      } },
      void 0,
      void 0,
      void 0,
      void 0,
      { info: () => {
      }, warn: () => {
      } },
      workspaceContextService,
      { getDefaultFolder: () => void 0, setFolder: () => {
      } },
      actionWidgetService,
      { createInstance: () => ({ dispose: () => {
      } }) }
    );
    await controller.handleSubmit("create a new session to update docs", void 0);
    const label = container.querySelector(".chat-routing-badge-name");
    const model = container.querySelector(".chat-routing-badge-score");
    const changeFolder = container.querySelector(".chat-routing-badge-folder-action");
    const countdown = container.querySelector(".chat-routing-badge-countdown");
    assert.deepStrictEqual({
      submitted,
      label: label?.textContent,
      model: model?.textContent,
      changeFolder: changeFolder?.textContent,
      countdown: countdown?.textContent,
      hasPopup: changeFolder?.getAttribute("aria-haspopup")
    }, {
      submitted: false,
      label: "New session in docs",
      model: "Claude Opus 4.6",
      changeFolder: "docs",
      countdown: "sending in 5s",
      hasPopup: "menu"
    });
    try {
      clock.tick(3e3);
      assert.strictEqual(countdown?.textContent, "sending in 2s");
      changeFolder?.click();
      await Promise.resolve();
      await Promise.resolve();
      assert.strictEqual(countdown?.textContent, "waiting for you");
      assert.strictEqual(changeFolder?.getAttribute("aria-expanded"), "true");
      assert.strictEqual(pickerAnchor, changeFolder);
      assert.strictEqual(pickerContainer, container);
      assert.strictEqual(pickerOptions?.showFilter, true);
      assert.strictEqual(pickerOptions?.filterPlaceholder, "Search folders");
      assert.strictEqual(pickerOptions?.focusFilterOnOpen, true);
      assert.strictEqual(pickerOptions?.anchorPosition, AnchorPosition.BELOW);
      assert.deepStrictEqual(pickerItems?.map((item) => item.label), ["vscode", "docs", "Choose Folder\u2026"]);
      clock.tick(5e3);
      assert.strictEqual(countdown?.textContent, "waiting for you");
      pickerDelegate?.onSelect(pickerItems[0].item);
      await clock.tickAsync(0);
      assert.deepStrictEqual({
        label: label?.textContent,
        changeFolder: changeFolder?.textContent,
        expanded: changeFolder?.getAttribute("aria-expanded"),
        countdown: countdown?.textContent,
        pickerVisibility
      }, {
        label: "New session in vscode",
        changeFolder: "vscode",
        expanded: "false",
        countdown: "sending in 2s",
        pickerVisibility: [true, false]
      });
      changeFolder?.click();
      await Promise.resolve();
      await Promise.resolve();
      const chooseFolder = pickerItems?.find((item) => item.item?.kind === "choose")?.item;
      assert.ok(chooseFolder);
      pickerDelegate?.onSelect(chooseFolder);
      await clock.tickAsync(0);
      assert.deepStrictEqual({
        label: label?.textContent,
        changeFolder: changeFolder?.textContent,
        folderDialogDefault: folderDialogDefault?.toString(),
        countdown: countdown?.textContent,
        pickerVisibility
      }, {
        label: "New session in external-project",
        changeFolder: "external-project",
        folderDialogDefault: vscode.uri.toString(),
        countdown: "sending in 2s",
        pickerVisibility: [true, false, true, false]
      });
      clock.tick(1e3);
      assert.strictEqual(countdown?.textContent, "sending in 1s");
    } finally {
      controller.dispose();
      container.remove();
      clock.restore();
    }
  });
  test("shows the provider workspace picker with an empty workbench and dispatches the selected provider", async () => {
    const clock = sinon.useFakeTimers();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const localWorkspace = {
      uri: URI.file("/work/local"),
      providerId: "local",
      group: "Local",
      label: "local",
      description: "~/work",
      icon: { id: "folder" }
    };
    const githubWorkspace = {
      uri: URI.parse("github-remote-file://github/microsoft/vscode"),
      providerId: "github",
      group: "GitHub",
      label: "microsoft/vscode",
      description: "GitHub",
      icon: { id: "github" }
    };
    const browseAction = {
      id: "provider:github:0",
      providerId: "github",
      group: "GitHub",
      label: "Select...",
      icon: { id: "folder-opened" }
    };
    let tabbedOptions;
    let tabbedVisible = false;
    const tabbedWidget = {
      get isVisible() {
        return tabbedVisible;
      },
      show: (options) => {
        tabbedOptions = options;
        tabbedVisible = true;
      },
      hide: () => {
        if (!tabbedVisible) {
          return;
        }
        tabbedVisible = false;
        tabbedOptions?.delegate.onHide();
      },
      dispose: () => {
      }
    };
    let input = "create a new session to update docs";
    const pickerVisibility = [];
    const pickerErrors = [];
    const selectedProviders = [];
    let dispatchedTarget;
    const routingProvider = {
      getCandidateSessions: () => [],
      getNewSessionWorkspaceCatalog: () => ({
        groups: [{ id: "Local" }, { id: "GitHub" }, { id: "Remote" }],
        workspaces: [localWorkspace, githubWorkspace],
        browseActions: [browseAction, {
          id: "provider:remote:0",
          providerId: "remote",
          group: "Remote",
          label: "Select...",
          icon: { id: "remote" }
        }],
        defaultWorkspace: localWorkspace
      }),
      selectNewSessionWorkspace: (workspace) => {
        selectedProviders.push(workspace.providerId);
      },
      browseNewSessionWorkspace: async () => void 0,
      resolveSessionResource: () => void 0,
      dispatchToSession: async () => ({ status: "rejected" }),
      dispatchToNewSession: async (target) => {
        dispatchedTarget = target;
        return { status: "sent", resource: URI.parse("session:/created") };
      },
      revealSession: async () => {
      }
    };
    const host = {
      widget: {
        inputEditor: {
          onDidChangeModelContent: Event.None,
          getValue: () => input,
          setValue: (value) => input = value
        },
        attachmentModel: {
          onDidChange: Event.None,
          attachments: [],
          clear: () => {
          }
        },
        input: { setSubmitPending: () => {
        } },
        getSelectedModelRequestOptions: () => ({}),
        getModeRequestOptions: () => ({})
      },
      getOwnSessionResource: () => void 0,
      getRoutingProvider: () => routingProvider,
      onDidChangeActionWidgetVisibility: (visible) => pickerVisibility.push(visible),
      getActionWidgetContainer: () => container,
      getActionWidgetAnchor: (anchor) => anchor,
      getActionWidgetAnchorPosition: () => AnchorPosition.BELOW,
      placeBadge: (badge) => container.appendChild(badge)
    };
    const controller = new ChatSessionRoutingController(
      host,
      "test",
      { getSession: () => void 0 },
      void 0,
      void 0,
      void 0,
      void 0,
      { info: () => {
      }, warn: () => {
      }, error: (message, error) => pickerErrors.push(`${message}: ${error.message}`) },
      {
        getWorkspace: () => ({ folders: [] }),
        getWorkspaceFolder: () => void 0
      },
      { getDefaultFolder: () => void 0, setFolder: () => {
      } },
      { hide: () => {
      } },
      { createInstance: () => tabbedWidget }
    );
    try {
      await controller.handleSubmit(input, ChatModeKind.Agent);
      const label = container.querySelector(".chat-routing-badge-name");
      const changeFolder = container.querySelector(".chat-routing-badge-folder-action");
      assert.deepStrictEqual({
        label: label?.textContent,
        changeFolder: changeFolder?.textContent
      }, {
        label: "New session in local",
        changeFolder: "local"
      });
      changeFolder?.click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      assert.deepStrictEqual({
        tabs: tabbedOptions?.tabs.map((tab) => tab.id),
        githubItems: tabbedOptions?.createActionList("GitHub").items.map((item) => item.label),
        pickerVisibility,
        pickerErrors
      }, {
        tabs: ["Local", "GitHub", "Remote"],
        githubItems: ["microsoft/vscode", "", "Select..."],
        pickerVisibility: [true],
        pickerErrors: []
      });
      const githubItem = tabbedOptions?.createActionList("GitHub").items.find((item) => item.item?.kind === "providerWorkspace")?.item;
      assert.ok(githubItem);
      tabbedOptions?.delegate.onSelect(githubItem);
      await clock.tickAsync(0);
      assert.deepStrictEqual({
        label: label?.textContent,
        changeFolder: changeFolder?.textContent,
        selectedProviders,
        pickerVisibility,
        focused: document.activeElement === changeFolder
      }, {
        label: "New session in microsoft/vscode",
        changeFolder: "microsoft/vscode",
        selectedProviders: ["github"],
        pickerVisibility: [true, false],
        focused: true
      });
      container.querySelector(".chat-routing-badge-row")?.click();
      await Promise.resolve();
      await Promise.resolve();
      assert.deepStrictEqual({
        folder: dispatchedTarget?.folder?.toString(),
        providerId: dispatchedTarget?.providerId
      }, {
        folder: githubWorkspace.uri.toString(),
        providerId: "github"
      });
    } finally {
      controller.dispose();
      container.remove();
      clock.restore();
    }
  });
  test("uses provider workspace labels for mentions and the provider default", () => {
    const localWorkspace = {
      uri: URI.file("/work/local"),
      providerId: "local",
      group: "Local",
      label: "local"
    };
    const githubWorkspace = {
      uri: URI.parse("github-remote-file://github/microsoft/vscode"),
      providerId: "github",
      group: "GitHub",
      label: "microsoft/vscode"
    };
    const controller = new ChatSessionRoutingController(
      {},
      "test",
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      { info: () => {
      } },
      {
        getWorkspace: () => ({ folders: [] }),
        getWorkspaceFolder: () => void 0
      },
      { getDefaultFolder: () => void 0 },
      void 0,
      void 0
    );
    Reflect.set(controller, "_workspaceCatalog", {
      groups: [{ id: "Local" }, { id: "GitHub" }],
      workspaces: [localWorkspace, githubWorkspace],
      browseActions: [],
      defaultWorkspace: localWorkspace
    });
    const resolveTarget = Reflect.get(controller, "_resolveNewSessionTarget");
    assert.deepStrictEqual([
      resolveTarget.call(controller, "update microsoft/vscode", void 0, [], []),
      resolveTarget.call(controller, "start something new", void 0, [], [])
    ].map((target) => ({
      folder: target.folder?.toString(),
      providerId: target.providerId,
      label: target.label
    })), [
      {
        folder: githubWorkspace.uri.toString(),
        providerId: "github",
        label: "New session in microsoft/vscode"
      },
      {
        folder: localWorkspace.uri.toString(),
        providerId: "local",
        label: "New session in local"
      }
    ]);
    controller.dispose();
  });
  test("returns the stable request id for an immediately sent route", async () => {
    const resource = URI.parse("agent-host-copilotcli:/untitled-route");
    const chatService = {
      sendRequest: async () => ({
        kind: "sent",
        newSessionResource: URI.parse("agent-host-copilotcli:/durable-route"),
        data: {
          agent: void 0,
          responseCreatedPromise: Promise.resolve({ requestId: "stable-request-id" }),
          responseCompletePromise: Promise.resolve()
        }
      })
    };
    const controller = new ChatSessionRoutingController(
      {},
      "test",
      chatService,
      void 0,
      void 0,
      void 0,
      void 0,
      { info: () => {
      }, warn: () => {
      } },
      void 0,
      { setFolder: () => {
      } },
      void 0,
      void 0
    );
    const sendRequest = Reflect.get(controller, "_sendRequest");
    const result = await sendRequest.call(controller, resource, "Run the build", {});
    assert.deepStrictEqual({
      status: result.status,
      resource: result.resource?.toString(),
      requestId: result.requestId
    }, {
      status: "sent",
      resource: "agent-host-copilotcli:/durable-route",
      requestId: "stable-request-id"
    });
    controller.dispose();
  });
  test("dismisses routed pending input with the delivery badge", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const resource = URI.parse("agent-host-copilotcli:/dismissed-route");
    let dismissed;
    const controller = new ChatSessionRoutingController(
      {
        placeBadge: (badge) => container.appendChild(badge),
        onDidDismissRoute: (dismissedResource, requestId) => {
          dismissed = { resource: dismissedResource.toString(), requestId };
        }
      },
      "test",
      { getSession: () => void 0 },
      { model: { getSession: () => void 0, onDidChangeSessions: Event.None } },
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      void 0
    );
    const showDeliveryConfirmation = Reflect.get(controller, "_showDeliveryConfirmation");
    showDeliveryConfirmation.call(controller, "Session", { status: "sent", resource, requestId: "request-1" });
    container.querySelectorAll(".chat-routing-badge-action")[1]?.click();
    assert.deepStrictEqual({
      dismissed,
      badgeConnected: !!container.querySelector(".chat-routing-badge")
    }, {
      dismissed: { resource: resource.toString(), requestId: "request-1" },
      badgeConnected: false
    });
    controller.dispose();
    container.remove();
  });
  test("uses the provider reveal operation for delivery Open", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    let localOpenCount = 0;
    let providerOpenCount = 0;
    const controller = new ChatSessionRoutingController(
      {
        placeBadge: (badge) => container.appendChild(badge)
      },
      "test",
      { getSession: () => void 0 },
      void 0,
      void 0,
      void 0,
      { openSession: () => localOpenCount++ },
      void 0,
      void 0,
      void 0,
      void 0,
      void 0
    );
    const showDeliveryConfirmation = Reflect.get(controller, "_showDeliveryConfirmation");
    showDeliveryConfirmation.call(controller, "Provider session", {
      status: "sent",
      resource: URI.parse("agent-host-copilotcli:/provider-delivery"),
      reveal: async () => {
        providerOpenCount++;
      }
    });
    const actions = [...container.querySelectorAll(".chat-routing-badge-action")];
    actions[0]?.click();
    await Promise.resolve();
    assert.deepStrictEqual({
      actions: actions.map((action) => action.textContent),
      localOpenCount,
      providerOpenCount,
      badgeConnected: !!container.querySelector(".chat-routing-badge")
    }, {
      actions: ["Open", "Dismiss"],
      localOpenCount: 0,
      providerOpenCount: 1,
      badgeConnected: true
    });
    controller.dispose();
    container.remove();
  });
  test("updates a provider delivery with its title and completed response", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const resource = URI.parse("session:/provider-delivery");
    const sessionsChanged = new Emitter();
    let snapshot = {
      sessionId: "provider:session",
      label: "New session",
      status: "working",
      lastActivity: 1
    };
    const provider = {
      watchSession: (_resource, listener) => sessionsChanged.event(listener),
      getSessionSnapshot: async () => snapshot
    };
    const controller = new ChatSessionRoutingController(
      {
        placeBadge: (badge) => container.appendChild(badge),
        getRoutingProvider: () => provider
      },
      "test",
      { getSession: () => void 0 },
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      void 0
    );
    const showDeliveryConfirmation = Reflect.get(controller, "_showDeliveryConfirmation");
    showDeliveryConfirmation.call(controller, "New session", {
      status: "sent",
      resource,
      reveal: async () => {
      }
    });
    await Promise.resolve();
    assert.strictEqual(container.querySelector(".chat-routing-badge-label")?.textContent, "In progress: New session");
    snapshot = {
      sessionId: "provider:session",
      label: "Update routing badge",
      status: "idle",
      lastActivity: 2,
      lastResponse: "Done. I created [megan.md](file:///megan.md)."
    };
    sessionsChanged.fire();
    await Promise.resolve();
    assert.deepStrictEqual({
      label: container.querySelector(".chat-routing-badge-label")?.textContent,
      link: container.querySelector(".chat-routing-badge-response-preview a")?.textContent
    }, {
      label: "Completed update routing badge:Done. I created megan.md.",
      link: "megan.md"
    });
    const clearCompletedDeliveries = Reflect.get(controller, "_clearCompletedDeliveryConfirmations");
    clearCompletedDeliveries.call(controller);
    assert.strictEqual(container.querySelector(".chat-routing-badge"), null);
    controller.dispose();
    sessionsChanged.dispose();
    container.remove();
  });
  test("keeps unresolved delivery rows when another request starts", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const controller = new ChatSessionRoutingController(
      {
        placeBadge: (badge) => container.appendChild(badge)
      },
      "test",
      { getSession: () => void 0 },
      { model: { getSession: () => void 0, onDidChangeSessions: Event.None } },
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      void 0
    );
    const showDeliveryConfirmation = Reflect.get(controller, "_showDeliveryConfirmation");
    showDeliveryConfirmation.call(controller, "First session", { status: "sent", resource: URI.parse("test:/first") });
    showDeliveryConfirmation.call(controller, "Second session", { status: "sent", resource: URI.parse("test:/second") });
    assert.deepStrictEqual(
      [...container.querySelectorAll(".chat-routing-badge-label")].map((element) => element.textContent),
      ["Sent to First session", "Sent to Second session"]
    );
    controller.dispose();
    container.remove();
  });
  test("keeps an existing session reference until a queued route completes", async () => {
    const resource = URI.parse("agent-host-copilotcli:/existing-route");
    let resolveQueued;
    const queued = new Promise((resolve) => resolveQueued = resolve);
    let disposed = false;
    let sentOptions;
    const chatService = {
      acquireOrLoadSession: async () => ({
        object: { sessionResource: resource },
        dispose: () => disposed = true
      }),
      sendRequest: async (_resource, _message, options) => {
        sentOptions = options;
        return { kind: "queued", requestId: "queued-request", deferred: queued };
      }
    };
    const host = {
      widget: {
        inputEditor: { getValue: () => "different draft", setValue: () => {
        } },
        attachmentModel: { attachments: [], clear: () => {
        } }
      }
    };
    const controller = new ChatSessionRoutingController(
      host,
      "test",
      chatService,
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      void 0
    );
    const dispatch = Reflect.get(controller, "_dispatchToSession");
    const result = await dispatch.call(controller, resource.toString(), "run", [], "run", { userSelectedModelId: "picked-model" }, CancellationToken.None, false);
    assert.strictEqual(disposed, false);
    assert.strictEqual(sentOptions?.userSelectedModelId, void 0);
    assert.strictEqual(sentOptions?.agentIdSilent, AgentSessionProviders.AgentHostCopilot);
    assert.strictEqual(sentOptions?.queue, ChatRequestQueueKind.Queued);
    resolveQueued({
      kind: "sent",
      data: {
        agent: void 0,
        responseCreatedPromise: Promise.resolve({ requestId: "queued-request" }),
        responseCompletePromise: Promise.resolve()
      }
    });
    await result.completion;
    assert.strictEqual(disposed, true);
    controller.dispose();
  });
  test("dispatches new sessions through the routing provider hook", async () => {
    const resource = URI.parse("agent-host-copilotcli:/new-route");
    const folder2 = URI.file("/workspace");
    let dispatched;
    let resolvedRequestId;
    let localCreateCount = 0;
    const routingProvider = {
      getCandidateSessions: () => [],
      resolveSessionResource: () => void 0,
      dispatchToSession: async () => ({ status: "rejected" }),
      dispatchToNewSession: async (target, message, options) => {
        dispatched = { folder: target.folder, providerId: target.providerId, message, modelId: options.userSelectedModelId };
        return { status: "sent", resource };
      },
      revealSession: async () => {
      }
    };
    const controller = new ChatSessionRoutingController(
      {
        widget: {
          inputEditor: { getValue: () => "different draft", setValue: () => {
          } },
          attachmentModel: { attachments: [], clear: () => {
          } }
        },
        getRoutingProvider: () => routingProvider,
        onDidResolveRoute: (_resource, _kind, _voice, requestId) => {
          resolvedRequestId = requestId;
        }
      },
      "test",
      {
        startNewLocalSession: () => {
          localCreateCount++;
          return void 0;
        },
        getSession: () => ({ lastRequest: { id: "durable-provider-request" } })
      },
      void 0,
      void 0,
      void 0,
      void 0,
      { info: () => {
      }, warn: () => {
      } },
      void 0,
      { setFolder: () => {
      } },
      void 0,
      void 0
    );
    const dispatch = Reflect.get(controller, "_dispatchToNewSession");
    const result = await dispatch.call(controller, "run", [], "run", { userSelectedModelId: "model" }, CancellationToken.None, true, { folder: folder2, providerId: "provider" });
    assert.deepStrictEqual({
      dispatched,
      localCreateCount,
      resolvedRequestId,
      result: { status: result.status, resource: result.resource?.toString(), hasReveal: !!result.reveal }
    }, {
      dispatched: { folder: folder2, providerId: "provider", message: "run", modelId: "model" },
      localCreateCount: 0,
      resolvedRequestId: "durable-provider-request",
      result: { status: "sent", resource: resource.toString(), hasReveal: true }
    });
    controller.dispose();
  });
  test("uses provider candidates instead of the renderer-local catalog", async () => {
    let localResolveCount = 0;
    const routingProvider = {
      getCandidateSessions: () => [
        { sessionId: "provider:b", label: "B" },
        { sessionId: "provider:a", label: "A" },
        { sessionId: "provider:a", label: "Duplicate A" }
      ],
      resolveSessionResource: () => void 0,
      dispatchToSession: async () => ({ status: "rejected" }),
      dispatchToNewSession: async () => ({ status: "rejected" }),
      revealSession: async () => {
      }
    };
    const controller = new ChatSessionRoutingController(
      {
        getOwnSessionResource: () => void 0,
        getRoutingProvider: () => routingProvider
      },
      "test",
      void 0,
      {
        model: {
          resolve: async () => {
            localResolveCount++;
          },
          sessions: []
        }
      },
      { getChatSessionContribution: () => ({ isReadOnly: false }) },
      void 0,
      void 0,
      { warn: () => {
      } },
      void 0,
      void 0,
      void 0,
      void 0
    );
    const collect = Reflect.get(controller, "_collectCandidateSessions");
    const candidates = await collect.call(controller, CancellationToken.None);
    assert.deepStrictEqual(candidates.map((candidate) => candidate.sessionId), [
      "provider:a",
      "provider:b"
    ]);
    assert.strictEqual(localResolveCount, 0);
    controller.dispose();
  });
  test("dispatches provider candidates without using renderer-local chat services", async () => {
    const providerResource = URI.parse("agent-host-copilotcli:/provider");
    const providerCandidate = { sessionId: "provider:session", label: "Provider" };
    let input = "Run tests";
    let clearedAttachments = false;
    let localAcquireCount = 0;
    let providerRevealCount = 0;
    let dispatched;
    const callbacks = [];
    const routingProvider = {
      getCandidateSessions: () => [providerCandidate],
      resolveSessionResource: (candidateId) => candidateId === providerCandidate.sessionId ? providerResource : void 0,
      dispatchToSession: async (candidateId, message, options) => {
        dispatched = { candidateId, message, modelId: options.userSelectedModelId };
        return { status: "sent", resource: providerResource, requestId: "request-1" };
      },
      dispatchToNewSession: async () => ({ status: "rejected" }),
      revealSession: async () => {
        providerRevealCount++;
      }
    };
    const host = {
      widget: {
        inputEditor: {
          getValue: () => input,
          setValue: (value) => input = value
        },
        attachmentModel: {
          attachments: [],
          clear: () => clearedAttachments = true
        }
      },
      getOwnSessionResource: () => void 0,
      getRoutingProvider: () => routingProvider,
      onWillDispatchRoute: () => callbacks.push("will"),
      onDidResolveRoute: () => callbacks.push("resolved")
    };
    const controller = new ChatSessionRoutingController(
      host,
      "test",
      {
        acquireOrLoadSession: async () => {
          localAcquireCount++;
          return void 0;
        }
      },
      { model: { resolve: async () => {
      }, sessions: [] } },
      void 0,
      void 0,
      void 0,
      { warn: () => {
      } },
      void 0,
      void 0,
      void 0,
      void 0
    );
    const collect = Reflect.get(controller, "_collectCandidateSessions");
    await collect.call(controller, CancellationToken.None);
    const dispatch = Reflect.get(controller, "_dispatchToSession");
    const result = await dispatch.call(controller, providerCandidate.sessionId, input, [], "Run tests", { userSelectedModelId: "model" }, CancellationToken.None, true);
    await result.reveal?.();
    assert.deepStrictEqual({
      dispatched,
      localAcquireCount,
      providerRevealCount,
      callbacks,
      input,
      clearedAttachments,
      result: { status: result.status, resource: result.resource?.toString() }
    }, {
      dispatched: {
        candidateId: providerCandidate.sessionId,
        message: "Run tests",
        modelId: "model"
      },
      localAcquireCount: 0,
      providerRevealCount: 1,
      callbacks: ["will", "resolved"],
      input: "",
      clearedAttachments: true,
      result: { status: "sent", resource: providerResource.toString() }
    });
    controller.dispose();
  });
  test("does not send another provider session metadata to the Copilot router", async () => {
    const session = (providerType, path) => ({
      resource: URI.from({ scheme: providerType, path }),
      providerType,
      label: path,
      status: void 0,
      isArchived: () => false
    });
    const agentSessionsService = {
      model: {
        resolve: async () => {
        },
        sessions: [
          session(AgentSessionProviders.AgentHostCopilot, "/copilot"),
          session(AgentSessionProviders.AgentHostClaude, "/claude")
        ]
      }
    };
    const controller = new ChatSessionRoutingController(
      { getOwnSessionResource: () => void 0 },
      "test",
      void 0,
      agentSessionsService,
      { getChatSessionContribution: () => ({ isReadOnly: false }) },
      void 0,
      void 0,
      { info: () => {
      }, warn: () => {
      } },
      void 0,
      void 0,
      void 0,
      void 0
    );
    const collect = Reflect.get(controller, "_collectCandidateSessions");
    const candidates = await collect.call(controller, CancellationToken.None);
    assert.deepStrictEqual(candidates.map((candidate) => candidate.sessionId), ["agent-host-copilotcli:/copilot"]);
    controller.dispose();
  });
});
function folder(name, path, index) {
  const uri = URI.file(path);
  return { uri, name, index, toResource: (relativePath) => URI.joinPath(uri, relativePath) };
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHNlc3Npb25Sb3V0ZXJcXGNoYXRTZXNzaW9uUm91dGluZ0NvbnRyb2xsZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCBzaW5vbiBmcm9tICdzaW5vbic7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBBbmNob3JQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xheW91dC5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElBY3Rpb25MaXN0RGVsZWdhdGUsIElBY3Rpb25MaXN0SXRlbSwgSUFjdGlvbkxpc3RPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uTGlzdC5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uV2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBJVGFiYmVkQWN0aW9uTGlzdFNob3dPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvdGFiYmVkQWN0aW9uTGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIElXb3Jrc3BhY2VGb2xkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25Qcm92aWRlcnMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0U2Vzc2lvblJvdXRpbmdDb250cm9sbGVyLCBJQ2hhdFNlc3Npb25Sb3V0aW5nSG9zdCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvc2Vzc2lvblJvdXRlci9jaGF0U2Vzc2lvblJvdXRpbmdDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IENoYXRSZXF1ZXN0UXVldWVLaW5kLCBDaGF0U2VuZFJlc3VsdCwgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRNb2RlS2luZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXNzaW9uUm91dGluZ1Byb3ZpZGVyLCBJQ2hhdFNlc3Npb25Sb3V0aW5nV29ya3NwYWNlLCBJQ2hhdFNlc3Npb25Sb3V0aW5nV29ya3NwYWNlQnJvd3NlQWN0aW9uLCBJUm91dGFibGVTZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Nlc3Npb25Sb3V0ZXIuanMnO1xuXG5zdWl0ZSgnQ2hhdFNlc3Npb25Sb3V0aW5nQ29udHJvbGxlcicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0dGVhcmRvd24oKCkgPT4gc2lub24ucmVzdG9yZSgpKTtcblxuXHR0ZXN0KCdzaG93cyB0aGUgc2VsZWN0ZWQgZm9sZGVyIGFuZCBmb2xkZXIgcGlja2VyIGZvciBtdWx0aS1yb290IG5ldyBzZXNzaW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjbG9jayA9IHNpbm9uLnVzZUZha2VUaW1lcnMoKTtcblx0XHRjb25zdCB2c2NvZGUgPSBmb2xkZXIoJ3ZzY29kZScsICcvd29yay92c2NvZGUnLCAwKTtcblx0XHRjb25zdCBkb2NzID0gZm9sZGVyKCdkb2NzJywgJy93b3JrL2RvY3MnLCAxKTtcblx0XHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XG5cdFx0bGV0IHN1Ym1pdHRlZCA9IGZhbHNlO1xuXHRcdHR5cGUgRm9sZGVyUGlja2VySXRlbSA9XG5cdFx0XHR8IHsgcmVhZG9ubHkgaWQ6IHN0cmluZzsgcmVhZG9ubHkga2luZDogJ3dvcmtzcGFjZSc7IHJlYWRvbmx5IGZvbGRlcjogSVdvcmtzcGFjZUZvbGRlciB9XG5cdFx0XHR8IHsgcmVhZG9ubHkgaWQ6ICdjaG9vc2UtZm9sZGVyJzsgcmVhZG9ubHkga2luZDogJ2Nob29zZScgfTtcblx0XHRsZXQgcGlja2VySXRlbXM6IHJlYWRvbmx5IElBY3Rpb25MaXN0SXRlbTxGb2xkZXJQaWNrZXJJdGVtPltdIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBwaWNrZXJEZWxlZ2F0ZTogSUFjdGlvbkxpc3REZWxlZ2F0ZTxGb2xkZXJQaWNrZXJJdGVtPiB8IHVuZGVmaW5lZDtcblx0XHRsZXQgcGlja2VyQW5jaG9yOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0XHRsZXQgcGlja2VyQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0XHRsZXQgcGlja2VyT3B0aW9uczogSUFjdGlvbkxpc3RPcHRpb25zIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHBpY2tlclZpc2liaWxpdHk6IGJvb2xlYW5bXSA9IFtdO1xuXHRcdGxldCBmb2xkZXJEaWFsb2dEZWZhdWx0OiBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYWN0aW9uV2lkZ2V0U2VydmljZSA9IHtcblx0XHRcdHNob3c6IDxULD4oXG5cdFx0XHRcdF91c2VyOiBzdHJpbmcsXG5cdFx0XHRcdF9zdXBwb3J0c1ByZXZpZXc6IGJvb2xlYW4sXG5cdFx0XHRcdGl0ZW1zOiByZWFkb25seSBJQWN0aW9uTGlzdEl0ZW08VD5bXSxcblx0XHRcdFx0ZGVsZWdhdGU6IElBY3Rpb25MaXN0RGVsZWdhdGU8VD4sXG5cdFx0XHRcdGFuY2hvcjogSFRNTEVsZW1lbnQsXG5cdFx0XHRcdGFjdGlvbldpZGdldENvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQsXG5cdFx0XHRcdF9hY3Rpb25CYXJBY3Rpb25zOiB1bmRlZmluZWQsXG5cdFx0XHRcdF9hY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IHVua25vd24sXG5cdFx0XHRcdGxpc3RPcHRpb25zOiBJQWN0aW9uTGlzdE9wdGlvbnMsXG5cdFx0XHQpID0+IHtcblx0XHRcdFx0cGlja2VySXRlbXMgPSBpdGVtcyBhcyByZWFkb25seSBJQWN0aW9uTGlzdEl0ZW08Rm9sZGVyUGlja2VySXRlbT5bXTtcblx0XHRcdFx0cGlja2VyRGVsZWdhdGUgPSBkZWxlZ2F0ZSBhcyB1bmtub3duIGFzIElBY3Rpb25MaXN0RGVsZWdhdGU8Rm9sZGVyUGlja2VySXRlbT47XG5cdFx0XHRcdHBpY2tlckFuY2hvciA9IGFuY2hvcjtcblx0XHRcdFx0cGlja2VyQ29udGFpbmVyID0gYWN0aW9uV2lkZ2V0Q29udGFpbmVyO1xuXHRcdFx0XHRwaWNrZXJPcHRpb25zID0gbGlzdE9wdGlvbnM7XG5cdFx0XHR9LFxuXHRcdFx0aGlkZTogKCkgPT4gcGlja2VyRGVsZWdhdGU/Lm9uSGlkZSgpLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQWN0aW9uV2lkZ2V0U2VydmljZTtcblx0XHRjb25zdCBob3N0ID0ge1xuXHRcdFx0d2lkZ2V0OiB7XG5cdFx0XHRcdGlucHV0RWRpdG9yOiB7XG5cdFx0XHRcdFx0b25EaWRDaGFuZ2VNb2RlbENvbnRlbnQ6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdFx0Z2V0VmFsdWU6ICgpID0+ICdjcmVhdGUgYSBuZXcgc2Vzc2lvbiB0byB1cGRhdGUgZG9jcycsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGF0dGFjaG1lbnRNb2RlbDoge1xuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRcdGF0dGFjaG1lbnRzOiBbXSxcblx0XHRcdFx0fSxcblx0XHRcdFx0aW5wdXQ6IHsgc2V0U3VibWl0UGVuZGluZzogKCkgPT4geyB9IH0sXG5cdFx0XHRcdGdldFNlbGVjdGVkTW9kZWxSZXF1ZXN0T3B0aW9uczogKCkgPT4gKHsgdXNlclNlbGVjdGVkTW9kZWxJZDogJ2NvcGlsb3QvY2xhdWRlLW9wdXMtNC42JyB9KSxcblx0XHRcdFx0Z2V0TW9kZVJlcXVlc3RPcHRpb25zOiAoKSA9PiAoe30pLFxuXHRcdFx0fSxcblx0XHRcdGdldE93blNlc3Npb25SZXNvdXJjZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0Z2V0TmV3U2Vzc2lvblRhcmdldDogKCkgPT4gQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkFnZW50SG9zdENvcGlsb3QsXG5cdFx0XHRnZXRTZWxlY3RlZE1vZGVsTGFiZWw6ICgpID0+ICdDbGF1ZGUgT3B1cyA0LjYnLFxuXHRcdFx0b25EaWRDaGFuZ2VBY3Rpb25XaWRnZXRWaXNpYmlsaXR5OiAodmlzaWJsZTogYm9vbGVhbikgPT4gcGlja2VyVmlzaWJpbGl0eS5wdXNoKHZpc2libGUpLFxuXHRcdFx0Z2V0QWN0aW9uV2lkZ2V0Q29udGFpbmVyOiAoKSA9PiBjb250YWluZXIsXG5cdFx0XHRnZXRBY3Rpb25XaWRnZXRBbmNob3I6IChhbmNob3I6IEhUTUxFbGVtZW50KSA9PiBhbmNob3IsXG5cdFx0XHRnZXRBY3Rpb25XaWRnZXRBbmNob3JQb3NpdGlvbjogKCkgPT4gQW5jaG9yUG9zaXRpb24uQkVMT1csXG5cdFx0XHRwaWNrRm9sZGVyOiBhc3luYyAoZGVmYXVsdFVyaTogVVJJIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRcdGZvbGRlckRpYWxvZ0RlZmF1bHQgPSBkZWZhdWx0VXJpO1xuXHRcdFx0XHRyZXR1cm4gVVJJLmZpbGUoJy9vdXRzaWRlL2V4dGVybmFsLXByb2plY3QnKTtcblx0XHRcdH0sXG5cdFx0XHRwbGFjZUJhZGdlOiAoYmFkZ2U6IEhUTUxFbGVtZW50KSA9PiBjb250YWluZXIuYXBwZW5kQ2hpbGQoYmFkZ2UpLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQ2hhdFNlc3Npb25Sb3V0aW5nSG9zdDtcblx0XHRjb25zdCB3b3Jrc3BhY2VDb250ZXh0U2VydmljZSA9IHtcblx0XHRcdGdldFdvcmtzcGFjZTogKCkgPT4gKHsgZm9sZGVyczogW3ZzY29kZSwgZG9jc10gfSksXG5cdFx0XHRnZXRXb3Jrc3BhY2VGb2xkZXI6IChyZXNvdXJjZTogVVJJKSA9PiBbdnNjb2RlLCBkb2NzXS5maW5kKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUudXJpLnRvU3RyaW5nKCkgPT09IHJlc291cmNlLnRvU3RyaW5nKCkpLFxuXHRcdH0gYXMgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgQ2hhdFNlc3Npb25Sb3V0aW5nQ29udHJvbGxlcihcblx0XHRcdGhvc3QsXG5cdFx0XHQndGVzdCcsXG5cdFx0XHR7IHNlbmRSZXF1ZXN0OiBhc3luYyAoKSA9PiB7IHN1Ym1pdHRlZCA9IHRydWU7IHJldHVybiB7IGtpbmQ6ICdyZWplY3RlZCcgfTsgfSB9IGFzIHVua25vd24gYXMgSUNoYXRTZXJ2aWNlLFxuXHRcdFx0dW5kZWZpbmVkISxcblx0XHRcdHVuZGVmaW5lZCEsXG5cdFx0XHR1bmRlZmluZWQhLFxuXHRcdFx0dW5kZWZpbmVkISxcblx0XHRcdHsgaW5mbzogKCkgPT4geyB9LCB3YXJuOiAoKSA9PiB7IH0gfSBhcyBuZXZlcixcblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdFx0eyBnZXREZWZhdWx0Rm9sZGVyOiAoKSA9PiB1bmRlZmluZWQsIHNldEZvbGRlcjogKCkgPT4geyB9IH0gYXMgbmV2ZXIsXG5cdFx0XHRhY3Rpb25XaWRnZXRTZXJ2aWNlLFxuXHRcdFx0eyBjcmVhdGVJbnN0YW5jZTogKCkgPT4gKHsgZGlzcG9zZTogKCkgPT4geyB9IH0pIH0gYXMgbmV2ZXIsXG5cdFx0KTtcblxuXHRcdGF3YWl0IGNvbnRyb2xsZXIuaGFuZGxlU3VibWl0KCdjcmVhdGUgYSBuZXcgc2Vzc2lvbiB0byB1cGRhdGUgZG9jcycsIHVuZGVmaW5lZCEpO1xuXHRcdGNvbnN0IGxhYmVsID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuY2hhdC1yb3V0aW5nLWJhZGdlLW5hbWUnKTtcblx0XHRjb25zdCBtb2RlbCA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmNoYXQtcm91dGluZy1iYWRnZS1zY29yZScpO1xuXHRcdGNvbnN0IGNoYW5nZUZvbGRlciA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yPEhUTUxCdXR0b25FbGVtZW50PignLmNoYXQtcm91dGluZy1iYWRnZS1mb2xkZXItYWN0aW9uJyk7XG5cdFx0Y29uc3QgY291bnRkb3duID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuY2hhdC1yb3V0aW5nLWJhZGdlLWNvdW50ZG93bicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3VibWl0dGVkLFxuXHRcdFx0bGFiZWw6IGxhYmVsPy50ZXh0Q29udGVudCxcblx0XHRcdG1vZGVsOiBtb2RlbD8udGV4dENvbnRlbnQsXG5cdFx0XHRjaGFuZ2VGb2xkZXI6IGNoYW5nZUZvbGRlcj8udGV4dENvbnRlbnQsXG5cdFx0XHRjb3VudGRvd246IGNvdW50ZG93bj8udGV4dENvbnRlbnQsXG5cdFx0XHRoYXNQb3B1cDogY2hhbmdlRm9sZGVyPy5nZXRBdHRyaWJ1dGUoJ2FyaWEtaGFzcG9wdXAnKSxcblx0XHR9LCB7XG5cdFx0XHRzdWJtaXR0ZWQ6IGZhbHNlLFxuXHRcdFx0bGFiZWw6ICdOZXcgc2Vzc2lvbiBpbiBkb2NzJyxcblx0XHRcdG1vZGVsOiAnQ2xhdWRlIE9wdXMgNC42Jyxcblx0XHRcdGNoYW5nZUZvbGRlcjogJ2RvY3MnLFxuXHRcdFx0Y291bnRkb3duOiAnc2VuZGluZyBpbiA1cycsXG5cdFx0XHRoYXNQb3B1cDogJ21lbnUnLFxuXHRcdH0pO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNsb2NrLnRpY2soM18wMDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50ZG93bj8udGV4dENvbnRlbnQsICdzZW5kaW5nIGluIDJzJyk7XG5cdFx0XHRjaGFuZ2VGb2xkZXI/LmNsaWNrKCk7XG5cdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50ZG93bj8udGV4dENvbnRlbnQsICd3YWl0aW5nIGZvciB5b3UnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VGb2xkZXI/LmdldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpLCAndHJ1ZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpY2tlckFuY2hvciwgY2hhbmdlRm9sZGVyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWNrZXJDb250YWluZXIsIGNvbnRhaW5lcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGlja2VyT3B0aW9ucz8uc2hvd0ZpbHRlciwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGlja2VyT3B0aW9ucz8uZmlsdGVyUGxhY2Vob2xkZXIsICdTZWFyY2ggZm9sZGVycycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpY2tlck9wdGlvbnM/LmZvY3VzRmlsdGVyT25PcGVuLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWNrZXJPcHRpb25zPy5hbmNob3JQb3NpdGlvbiwgQW5jaG9yUG9zaXRpb24uQkVMT1cpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwaWNrZXJJdGVtcz8ubWFwKGl0ZW0gPT4gaXRlbS5sYWJlbCksIFsndnNjb2RlJywgJ2RvY3MnLCAnQ2hvb3NlIEZvbGRlclx1MjAyNiddKTtcblx0XHRcdGNsb2NrLnRpY2soNV8wMDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50ZG93bj8udGV4dENvbnRlbnQsICd3YWl0aW5nIGZvciB5b3UnKTtcblx0XHRcdHBpY2tlckRlbGVnYXRlPy5vblNlbGVjdChwaWNrZXJJdGVtcyFbMF0uaXRlbSEpO1xuXHRcdFx0YXdhaXQgY2xvY2sudGlja0FzeW5jKDApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGxhYmVsOiBsYWJlbD8udGV4dENvbnRlbnQsXG5cdFx0XHRcdGNoYW5nZUZvbGRlcjogY2hhbmdlRm9sZGVyPy50ZXh0Q29udGVudCxcblx0XHRcdFx0ZXhwYW5kZWQ6IGNoYW5nZUZvbGRlcj8uZ2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJyksXG5cdFx0XHRcdGNvdW50ZG93bjogY291bnRkb3duPy50ZXh0Q29udGVudCxcblx0XHRcdFx0cGlja2VyVmlzaWJpbGl0eSxcblx0XHRcdH0sIHtcblx0XHRcdFx0bGFiZWw6ICdOZXcgc2Vzc2lvbiBpbiB2c2NvZGUnLFxuXHRcdFx0XHRjaGFuZ2VGb2xkZXI6ICd2c2NvZGUnLFxuXHRcdFx0XHRleHBhbmRlZDogJ2ZhbHNlJyxcblx0XHRcdFx0Y291bnRkb3duOiAnc2VuZGluZyBpbiAycycsXG5cdFx0XHRcdHBpY2tlclZpc2liaWxpdHk6IFt0cnVlLCBmYWxzZV0sXG5cdFx0XHR9KTtcblx0XHRcdGNoYW5nZUZvbGRlcj8uY2xpY2soKTtcblx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHRjb25zdCBjaG9vc2VGb2xkZXIgPSBwaWNrZXJJdGVtcz8uZmluZChpdGVtID0+IGl0ZW0uaXRlbT8ua2luZCA9PT0gJ2Nob29zZScpPy5pdGVtO1xuXHRcdFx0YXNzZXJ0Lm9rKGNob29zZUZvbGRlcik7XG5cdFx0XHRwaWNrZXJEZWxlZ2F0ZT8ub25TZWxlY3QoY2hvb3NlRm9sZGVyKTtcblx0XHRcdGF3YWl0IGNsb2NrLnRpY2tBc3luYygwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRsYWJlbDogbGFiZWw/LnRleHRDb250ZW50LFxuXHRcdFx0XHRjaGFuZ2VGb2xkZXI6IGNoYW5nZUZvbGRlcj8udGV4dENvbnRlbnQsXG5cdFx0XHRcdGZvbGRlckRpYWxvZ0RlZmF1bHQ6IGZvbGRlckRpYWxvZ0RlZmF1bHQ/LnRvU3RyaW5nKCksXG5cdFx0XHRcdGNvdW50ZG93bjogY291bnRkb3duPy50ZXh0Q29udGVudCxcblx0XHRcdFx0cGlja2VyVmlzaWJpbGl0eSxcblx0XHRcdH0sIHtcblx0XHRcdFx0bGFiZWw6ICdOZXcgc2Vzc2lvbiBpbiBleHRlcm5hbC1wcm9qZWN0Jyxcblx0XHRcdFx0Y2hhbmdlRm9sZGVyOiAnZXh0ZXJuYWwtcHJvamVjdCcsXG5cdFx0XHRcdGZvbGRlckRpYWxvZ0RlZmF1bHQ6IHZzY29kZS51cmkudG9TdHJpbmcoKSxcblx0XHRcdFx0Y291bnRkb3duOiAnc2VuZGluZyBpbiAycycsXG5cdFx0XHRcdHBpY2tlclZpc2liaWxpdHk6IFt0cnVlLCBmYWxzZSwgdHJ1ZSwgZmFsc2VdLFxuXHRcdFx0fSk7XG5cdFx0XHRjbG9jay50aWNrKDFfMDAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudGRvd24/LnRleHRDb250ZW50LCAnc2VuZGluZyBpbiAxcycpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjb250cm9sbGVyLmRpc3Bvc2UoKTtcblx0XHRcdGNvbnRhaW5lci5yZW1vdmUoKTtcblx0XHRcdGNsb2NrLnJlc3RvcmUoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3dzIHRoZSBwcm92aWRlciB3b3Jrc3BhY2UgcGlja2VyIHdpdGggYW4gZW1wdHkgd29ya2JlbmNoIGFuZCBkaXNwYXRjaGVzIHRoZSBzZWxlY3RlZCBwcm92aWRlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjbG9jayA9IHNpbm9uLnVzZUZha2VUaW1lcnMoKTtcblx0XHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XG5cdFx0Y29uc3QgbG9jYWxXb3Jrc3BhY2U6IElDaGF0U2Vzc2lvblJvdXRpbmdXb3Jrc3BhY2UgPSB7XG5cdFx0XHR1cmk6IFVSSS5maWxlKCcvd29yay9sb2NhbCcpLFxuXHRcdFx0cHJvdmlkZXJJZDogJ2xvY2FsJyxcblx0XHRcdGdyb3VwOiAnTG9jYWwnLFxuXHRcdFx0bGFiZWw6ICdsb2NhbCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogJ34vd29yaycsXG5cdFx0XHRpY29uOiB7IGlkOiAnZm9sZGVyJyB9LFxuXHRcdH07XG5cdFx0Y29uc3QgZ2l0aHViV29ya3NwYWNlOiBJQ2hhdFNlc3Npb25Sb3V0aW5nV29ya3NwYWNlID0ge1xuXHRcdFx0dXJpOiBVUkkucGFyc2UoJ2dpdGh1Yi1yZW1vdGUtZmlsZTovL2dpdGh1Yi9taWNyb3NvZnQvdnNjb2RlJyksXG5cdFx0XHRwcm92aWRlcklkOiAnZ2l0aHViJyxcblx0XHRcdGdyb3VwOiAnR2l0SHViJyxcblx0XHRcdGxhYmVsOiAnbWljcm9zb2Z0L3ZzY29kZScsXG5cdFx0XHRkZXNjcmlwdGlvbjogJ0dpdEh1YicsXG5cdFx0XHRpY29uOiB7IGlkOiAnZ2l0aHViJyB9LFxuXHRcdH07XG5cdFx0Y29uc3QgYnJvd3NlQWN0aW9uOiBJQ2hhdFNlc3Npb25Sb3V0aW5nV29ya3NwYWNlQnJvd3NlQWN0aW9uID0ge1xuXHRcdFx0aWQ6ICdwcm92aWRlcjpnaXRodWI6MCcsXG5cdFx0XHRwcm92aWRlcklkOiAnZ2l0aHViJyxcblx0XHRcdGdyb3VwOiAnR2l0SHViJyxcblx0XHRcdGxhYmVsOiAnU2VsZWN0Li4uJyxcblx0XHRcdGljb246IHsgaWQ6ICdmb2xkZXItb3BlbmVkJyB9LFxuXHRcdH07XG5cdFx0dHlwZSBUZXN0Rm9sZGVyUGlja2VySXRlbSA9XG5cdFx0XHR8IHsgcmVhZG9ubHkga2luZDogJ3Byb3ZpZGVyV29ya3NwYWNlJzsgcmVhZG9ubHkgd29ya3NwYWNlOiBJQ2hhdFNlc3Npb25Sb3V0aW5nV29ya3NwYWNlIH1cblx0XHRcdHwgeyByZWFkb25seSBraW5kOiAncHJvdmlkZXJCcm93c2UnOyByZWFkb25seSBhY3Rpb246IElDaGF0U2Vzc2lvblJvdXRpbmdXb3Jrc3BhY2VCcm93c2VBY3Rpb24gfTtcblx0XHRsZXQgdGFiYmVkT3B0aW9uczogSVRhYmJlZEFjdGlvbkxpc3RTaG93T3B0aW9uczxUZXN0Rm9sZGVyUGlja2VySXRlbT4gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHRhYmJlZFZpc2libGUgPSBmYWxzZTtcblx0XHRjb25zdCB0YWJiZWRXaWRnZXQgPSB7XG5cdFx0XHRnZXQgaXNWaXNpYmxlKCkgeyByZXR1cm4gdGFiYmVkVmlzaWJsZTsgfSxcblx0XHRcdHNob3c6IChvcHRpb25zOiBJVGFiYmVkQWN0aW9uTGlzdFNob3dPcHRpb25zPFRlc3RGb2xkZXJQaWNrZXJJdGVtPikgPT4ge1xuXHRcdFx0XHR0YWJiZWRPcHRpb25zID0gb3B0aW9ucztcblx0XHRcdFx0dGFiYmVkVmlzaWJsZSA9IHRydWU7XG5cdFx0XHR9LFxuXHRcdFx0aGlkZTogKCkgPT4ge1xuXHRcdFx0XHRpZiAoIXRhYmJlZFZpc2libGUpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGFiYmVkVmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0XHR0YWJiZWRPcHRpb25zPy5kZWxlZ2F0ZS5vbkhpZGUoKTtcblx0XHRcdH0sXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0fTtcblx0XHRsZXQgaW5wdXQgPSAnY3JlYXRlIGEgbmV3IHNlc3Npb24gdG8gdXBkYXRlIGRvY3MnO1xuXHRcdGNvbnN0IHBpY2tlclZpc2liaWxpdHk6IGJvb2xlYW5bXSA9IFtdO1xuXHRcdGNvbnN0IHBpY2tlckVycm9yczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBzZWxlY3RlZFByb3ZpZGVyczogc3RyaW5nW10gPSBbXTtcblx0XHRsZXQgZGlzcGF0Y2hlZFRhcmdldDogeyByZWFkb25seSBmb2xkZXI/OiBVUkk7IHJlYWRvbmx5IHByb3ZpZGVySWQ/OiBzdHJpbmcgfSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCByb3V0aW5nUHJvdmlkZXI6IElDaGF0U2Vzc2lvblJvdXRpbmdQcm92aWRlciA9IHtcblx0XHRcdGdldENhbmRpZGF0ZVNlc3Npb25zOiAoKSA9PiBbXSxcblx0XHRcdGdldE5ld1Nlc3Npb25Xb3Jrc3BhY2VDYXRhbG9nOiAoKSA9PiAoe1xuXHRcdFx0XHRncm91cHM6IFt7IGlkOiAnTG9jYWwnIH0sIHsgaWQ6ICdHaXRIdWInIH0sIHsgaWQ6ICdSZW1vdGUnIH1dLFxuXHRcdFx0XHR3b3Jrc3BhY2VzOiBbbG9jYWxXb3Jrc3BhY2UsIGdpdGh1YldvcmtzcGFjZV0sXG5cdFx0XHRcdGJyb3dzZUFjdGlvbnM6IFticm93c2VBY3Rpb24sIHtcblx0XHRcdFx0XHRpZDogJ3Byb3ZpZGVyOnJlbW90ZTowJyxcblx0XHRcdFx0XHRwcm92aWRlcklkOiAncmVtb3RlJyxcblx0XHRcdFx0XHRncm91cDogJ1JlbW90ZScsXG5cdFx0XHRcdFx0bGFiZWw6ICdTZWxlY3QuLi4nLFxuXHRcdFx0XHRcdGljb246IHsgaWQ6ICdyZW1vdGUnIH0sXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHRkZWZhdWx0V29ya3NwYWNlOiBsb2NhbFdvcmtzcGFjZSxcblx0XHRcdH0pLFxuXHRcdFx0c2VsZWN0TmV3U2Vzc2lvbldvcmtzcGFjZTogd29ya3NwYWNlID0+IHtcblx0XHRcdFx0c2VsZWN0ZWRQcm92aWRlcnMucHVzaCh3b3Jrc3BhY2UucHJvdmlkZXJJZCk7XG5cdFx0XHR9LFxuXHRcdFx0YnJvd3NlTmV3U2Vzc2lvbldvcmtzcGFjZTogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0cmVzb2x2ZVNlc3Npb25SZXNvdXJjZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0ZGlzcGF0Y2hUb1Nlc3Npb246IGFzeW5jICgpID0+ICh7IHN0YXR1czogJ3JlamVjdGVkJyB9KSxcblx0XHRcdGRpc3BhdGNoVG9OZXdTZXNzaW9uOiBhc3luYyB0YXJnZXQgPT4ge1xuXHRcdFx0XHRkaXNwYXRjaGVkVGFyZ2V0ID0gdGFyZ2V0O1xuXHRcdFx0XHRyZXR1cm4geyBzdGF0dXM6ICdzZW50JywgcmVzb3VyY2U6IFVSSS5wYXJzZSgnc2Vzc2lvbjovY3JlYXRlZCcpIH07XG5cdFx0XHR9LFxuXHRcdFx0cmV2ZWFsU2Vzc2lvbjogYXN5bmMgKCkgPT4geyB9LFxuXHRcdH07XG5cdFx0Y29uc3QgaG9zdCA9IHtcblx0XHRcdHdpZGdldDoge1xuXHRcdFx0XHRpbnB1dEVkaXRvcjoge1xuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlTW9kZWxDb250ZW50OiBFdmVudC5Ob25lLFxuXHRcdFx0XHRcdGdldFZhbHVlOiAoKSA9PiBpbnB1dCxcblx0XHRcdFx0XHRzZXRWYWx1ZTogKHZhbHVlOiBzdHJpbmcpID0+IGlucHV0ID0gdmFsdWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGF0dGFjaG1lbnRNb2RlbDoge1xuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRcdGF0dGFjaG1lbnRzOiBbXSxcblx0XHRcdFx0XHRjbGVhcjogKCkgPT4geyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRpbnB1dDogeyBzZXRTdWJtaXRQZW5kaW5nOiAoKSA9PiB7IH0gfSxcblx0XHRcdFx0Z2V0U2VsZWN0ZWRNb2RlbFJlcXVlc3RPcHRpb25zOiAoKSA9PiAoe30pLFxuXHRcdFx0XHRnZXRNb2RlUmVxdWVzdE9wdGlvbnM6ICgpID0+ICh7fSksXG5cdFx0XHR9LFxuXHRcdFx0Z2V0T3duU2Vzc2lvblJlc291cmNlOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRnZXRSb3V0aW5nUHJvdmlkZXI6ICgpID0+IHJvdXRpbmdQcm92aWRlcixcblx0XHRcdG9uRGlkQ2hhbmdlQWN0aW9uV2lkZ2V0VmlzaWJpbGl0eTogKHZpc2libGU6IGJvb2xlYW4pID0+IHBpY2tlclZpc2liaWxpdHkucHVzaCh2aXNpYmxlKSxcblx0XHRcdGdldEFjdGlvbldpZGdldENvbnRhaW5lcjogKCkgPT4gY29udGFpbmVyLFxuXHRcdFx0Z2V0QWN0aW9uV2lkZ2V0QW5jaG9yOiAoYW5jaG9yOiBIVE1MRWxlbWVudCkgPT4gYW5jaG9yLFxuXHRcdFx0Z2V0QWN0aW9uV2lkZ2V0QW5jaG9yUG9zaXRpb246ICgpID0+IEFuY2hvclBvc2l0aW9uLkJFTE9XLFxuXHRcdFx0cGxhY2VCYWRnZTogKGJhZGdlOiBIVE1MRWxlbWVudCkgPT4gY29udGFpbmVyLmFwcGVuZENoaWxkKGJhZGdlKSxcblx0XHR9IGFzIHVua25vd24gYXMgSUNoYXRTZXNzaW9uUm91dGluZ0hvc3Q7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBDaGF0U2Vzc2lvblJvdXRpbmdDb250cm9sbGVyKFxuXHRcdFx0aG9zdCxcblx0XHRcdCd0ZXN0Jyxcblx0XHRcdHsgZ2V0U2Vzc2lvbjogKCkgPT4gdW5kZWZpbmVkIH0gYXMgdW5rbm93biBhcyBJQ2hhdFNlcnZpY2UsXG5cdFx0XHR1bmRlZmluZWQhLFxuXHRcdFx0dW5kZWZpbmVkISxcblx0XHRcdHVuZGVmaW5lZCEsXG5cdFx0XHR1bmRlZmluZWQhLFxuXHRcdFx0eyBpbmZvOiAoKSA9PiB7IH0sIHdhcm46ICgpID0+IHsgfSwgZXJyb3I6IChtZXNzYWdlOiBzdHJpbmcsIGVycm9yOiBFcnJvcikgPT4gcGlja2VyRXJyb3JzLnB1c2goYCR7bWVzc2FnZX06ICR7ZXJyb3IubWVzc2FnZX1gKSB9IGFzIG5ldmVyLFxuXHRcdFx0e1xuXHRcdFx0XHRnZXRXb3Jrc3BhY2U6ICgpID0+ICh7IGZvbGRlcnM6IFtdIH0pLFxuXHRcdFx0XHRnZXRXb3Jrc3BhY2VGb2xkZXI6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdH0gYXMgdW5rbm93biBhcyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0XHR7IGdldERlZmF1bHRGb2xkZXI6ICgpID0+IHVuZGVmaW5lZCwgc2V0Rm9sZGVyOiAoKSA9PiB7IH0gfSBhcyBuZXZlcixcblx0XHRcdHsgaGlkZTogKCkgPT4geyB9IH0gYXMgdW5rbm93biBhcyBJQWN0aW9uV2lkZ2V0U2VydmljZSxcblx0XHRcdHsgY3JlYXRlSW5zdGFuY2U6ICgpID0+IHRhYmJlZFdpZGdldCB9IGFzIG5ldmVyLFxuXHRcdCk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgY29udHJvbGxlci5oYW5kbGVTdWJtaXQoaW5wdXQsIENoYXRNb2RlS2luZC5BZ2VudCk7XG5cdFx0XHRjb25zdCBsYWJlbCA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmNoYXQtcm91dGluZy1iYWRnZS1uYW1lJyk7XG5cdFx0XHRjb25zdCBjaGFuZ2VGb2xkZXIgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oJy5jaGF0LXJvdXRpbmctYmFkZ2UtZm9sZGVyLWFjdGlvbicpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGxhYmVsOiBsYWJlbD8udGV4dENvbnRlbnQsXG5cdFx0XHRcdGNoYW5nZUZvbGRlcjogY2hhbmdlRm9sZGVyPy50ZXh0Q29udGVudCxcblx0XHRcdH0sIHtcblx0XHRcdFx0bGFiZWw6ICdOZXcgc2Vzc2lvbiBpbiBsb2NhbCcsXG5cdFx0XHRcdGNoYW5nZUZvbGRlcjogJ2xvY2FsJyxcblx0XHRcdH0pO1xuXG5cdFx0XHRjaGFuZ2VGb2xkZXI/LmNsaWNrKCk7XG5cdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHR0YWJzOiB0YWJiZWRPcHRpb25zPy50YWJzLm1hcCh0YWIgPT4gdGFiLmlkKSxcblx0XHRcdFx0Z2l0aHViSXRlbXM6IHRhYmJlZE9wdGlvbnM/LmNyZWF0ZUFjdGlvbkxpc3QoJ0dpdEh1YicpLml0ZW1zLm1hcChpdGVtID0+IGl0ZW0ubGFiZWwpLFxuXHRcdFx0XHRwaWNrZXJWaXNpYmlsaXR5LFxuXHRcdFx0XHRwaWNrZXJFcnJvcnMsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHRhYnM6IFsnTG9jYWwnLCAnR2l0SHViJywgJ1JlbW90ZSddLFxuXHRcdFx0XHRnaXRodWJJdGVtczogWydtaWNyb3NvZnQvdnNjb2RlJywgJycsICdTZWxlY3QuLi4nXSxcblx0XHRcdFx0cGlja2VyVmlzaWJpbGl0eTogW3RydWVdLFxuXHRcdFx0XHRwaWNrZXJFcnJvcnM6IFtdLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGdpdGh1Ykl0ZW0gPSB0YWJiZWRPcHRpb25zPy5jcmVhdGVBY3Rpb25MaXN0KCdHaXRIdWInKS5pdGVtc1xuXHRcdFx0XHQuZmluZChpdGVtID0+IGl0ZW0uaXRlbT8ua2luZCA9PT0gJ3Byb3ZpZGVyV29ya3NwYWNlJyk/Lml0ZW07XG5cdFx0XHRhc3NlcnQub2soZ2l0aHViSXRlbSk7XG5cdFx0XHR0YWJiZWRPcHRpb25zPy5kZWxlZ2F0ZS5vblNlbGVjdChnaXRodWJJdGVtISk7XG5cdFx0XHRhd2FpdCBjbG9jay50aWNrQXN5bmMoMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0bGFiZWw6IGxhYmVsPy50ZXh0Q29udGVudCxcblx0XHRcdFx0Y2hhbmdlRm9sZGVyOiBjaGFuZ2VGb2xkZXI/LnRleHRDb250ZW50LFxuXHRcdFx0XHRzZWxlY3RlZFByb3ZpZGVycyxcblx0XHRcdFx0cGlja2VyVmlzaWJpbGl0eSxcblx0XHRcdFx0Zm9jdXNlZDogZG9jdW1lbnQuYWN0aXZlRWxlbWVudCA9PT0gY2hhbmdlRm9sZGVyLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRsYWJlbDogJ05ldyBzZXNzaW9uIGluIG1pY3Jvc29mdC92c2NvZGUnLFxuXHRcdFx0XHRjaGFuZ2VGb2xkZXI6ICdtaWNyb3NvZnQvdnNjb2RlJyxcblx0XHRcdFx0c2VsZWN0ZWRQcm92aWRlcnM6IFsnZ2l0aHViJ10sXG5cdFx0XHRcdHBpY2tlclZpc2liaWxpdHk6IFt0cnVlLCBmYWxzZV0sXG5cdFx0XHRcdGZvY3VzZWQ6IHRydWUsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29udGFpbmVyLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuY2hhdC1yb3V0aW5nLWJhZGdlLXJvdycpPy5jbGljaygpO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRmb2xkZXI6IGRpc3BhdGNoZWRUYXJnZXQ/LmZvbGRlcj8udG9TdHJpbmcoKSxcblx0XHRcdFx0cHJvdmlkZXJJZDogZGlzcGF0Y2hlZFRhcmdldD8ucHJvdmlkZXJJZCxcblx0XHRcdH0sIHtcblx0XHRcdFx0Zm9sZGVyOiBnaXRodWJXb3Jrc3BhY2UudXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdHByb3ZpZGVySWQ6ICdnaXRodWInLFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGNvbnRyb2xsZXIuZGlzcG9zZSgpO1xuXHRcdFx0Y29udGFpbmVyLnJlbW92ZSgpO1xuXHRcdFx0Y2xvY2sucmVzdG9yZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgndXNlcyBwcm92aWRlciB3b3Jrc3BhY2UgbGFiZWxzIGZvciBtZW50aW9ucyBhbmQgdGhlIHByb3ZpZGVyIGRlZmF1bHQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxXb3Jrc3BhY2U6IElDaGF0U2Vzc2lvblJvdXRpbmdXb3Jrc3BhY2UgPSB7XG5cdFx0XHR1cmk6IFVSSS5maWxlKCcvd29yay9sb2NhbCcpLFxuXHRcdFx0cHJvdmlkZXJJZDogJ2xvY2FsJyxcblx0XHRcdGdyb3VwOiAnTG9jYWwnLFxuXHRcdFx0bGFiZWw6ICdsb2NhbCcsXG5cdFx0fTtcblx0XHRjb25zdCBnaXRodWJXb3Jrc3BhY2U6IElDaGF0U2Vzc2lvblJvdXRpbmdXb3Jrc3BhY2UgPSB7XG5cdFx0XHR1cmk6IFVSSS5wYXJzZSgnZ2l0aHViLXJlbW90ZS1maWxlOi8vZ2l0aHViL21pY3Jvc29mdC92c2NvZGUnKSxcblx0XHRcdHByb3ZpZGVySWQ6ICdnaXRodWInLFxuXHRcdFx0Z3JvdXA6ICdHaXRIdWInLFxuXHRcdFx0bGFiZWw6ICdtaWNyb3NvZnQvdnNjb2RlJyxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgQ2hhdFNlc3Npb25Sb3V0aW5nQ29udHJvbGxlcihcblx0XHRcdHt9IGFzIElDaGF0U2Vzc2lvblJvdXRpbmdIb3N0LFxuXHRcdFx0J3Rlc3QnLFxuXHRcdFx0dW5kZWZpbmVkISxcblx0XHRcdHVuZGVmaW5lZCEsXG5cdFx0XHR1bmRlZmluZWQhLFxuXHRcdFx0dW5kZWZpbmVkISxcblx0XHRcdHVuZGVmaW5lZCEsXG5cdFx0XHR7IGluZm86ICgpID0+IHsgfSB9IGFzIG5ldmVyLFxuXHRcdFx0e1xuXHRcdFx0XHRnZXRXb3Jrc3BhY2U6ICgpID0+ICh7IGZvbGRlcnM6IFtdIH0pLFxuXHRcdFx0XHRnZXRXb3Jrc3BhY2VGb2xkZXI6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdH0gYXMgdW5rbm93biBhcyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0XHR7IGdldERlZmF1bHRGb2xkZXI6ICgpID0+IHVuZGVmaW5lZCB9IGFzIG5ldmVyLFxuXHRcdFx0dW5kZWZpbmVkISxcblx0XHRcdHVuZGVmaW5lZCEsXG5cdFx0KTtcblx0XHRSZWZsZWN0LnNldChjb250cm9sbGVyLCAnX3dvcmtzcGFjZUNhdGFsb2cnLCB7XG5cdFx0XHRncm91cHM6IFt7IGlkOiAnTG9jYWwnIH0sIHsgaWQ6ICdHaXRIdWInIH1dLFxuXHRcdFx0d29ya3NwYWNlczogW2xvY2FsV29ya3NwYWNlLCBnaXRodWJXb3Jrc3BhY2VdLFxuXHRcdFx0YnJvd3NlQWN0aW9uczogW10sXG5cdFx0XHRkZWZhdWx0V29ya3NwYWNlOiBsb2NhbFdvcmtzcGFjZSxcblx0XHR9KTtcblx0XHRjb25zdCByZXNvbHZlVGFyZ2V0ID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19yZXNvbHZlTmV3U2Vzc2lvblRhcmdldCcpIGFzIChcblx0XHRcdHV0dGVyYW5jZTogc3RyaW5nLFxuXHRcdFx0YXR0YWNobWVudHM6IHVuZGVmaW5lZCxcblx0XHRcdHJlc3VsdHM6IHJlYWRvbmx5IFtdLFxuXHRcdFx0Y2FuZGlkYXRlczogcmVhZG9ubHkgW10sXG5cdFx0KSA9PiB7IGZvbGRlcj86IFVSSTsgcHJvdmlkZXJJZD86IHN0cmluZzsgbGFiZWw6IHN0cmluZyB9O1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRyZXNvbHZlVGFyZ2V0LmNhbGwoY29udHJvbGxlciwgJ3VwZGF0ZSBtaWNyb3NvZnQvdnNjb2RlJywgdW5kZWZpbmVkLCBbXSwgW10pLFxuXHRcdFx0cmVzb2x2ZVRhcmdldC5jYWxsKGNvbnRyb2xsZXIsICdzdGFydCBzb21ldGhpbmcgbmV3JywgdW5kZWZpbmVkLCBbXSwgW10pLFxuXHRcdF0ubWFwKHRhcmdldCA9PiAoe1xuXHRcdFx0Zm9sZGVyOiB0YXJnZXQuZm9sZGVyPy50b1N0cmluZygpLFxuXHRcdFx0cHJvdmlkZXJJZDogdGFyZ2V0LnByb3ZpZGVySWQsXG5cdFx0XHRsYWJlbDogdGFyZ2V0LmxhYmVsLFxuXHRcdH0pKSwgW1xuXHRcdFx0e1xuXHRcdFx0XHRmb2xkZXI6IGdpdGh1YldvcmtzcGFjZS51cmkudG9TdHJpbmcoKSxcblx0XHRcdFx0cHJvdmlkZXJJZDogJ2dpdGh1YicsXG5cdFx0XHRcdGxhYmVsOiAnTmV3IHNlc3Npb24gaW4gbWljcm9zb2Z0L3ZzY29kZScsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRmb2xkZXI6IGxvY2FsV29ya3NwYWNlLnVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRwcm92aWRlcklkOiAnbG9jYWwnLFxuXHRcdFx0XHRsYWJlbDogJ05ldyBzZXNzaW9uIGluIGxvY2FsJyxcblx0XHRcdH0sXG5cdFx0XSk7XG5cdFx0Y29udHJvbGxlci5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdGhlIHN0YWJsZSByZXF1ZXN0IGlkIGZvciBhbiBpbW1lZGlhdGVseSBzZW50IHJvdXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKCdhZ2VudC1ob3N0LWNvcGlsb3RjbGk6L3VudGl0bGVkLXJvdXRlJyk7XG5cdFx0Y29uc3QgY2hhdFNlcnZpY2UgPSB7XG5cdFx0XHRzZW5kUmVxdWVzdDogYXN5bmMgKCk6IFByb21pc2U8Q2hhdFNlbmRSZXN1bHQ+ID0+ICh7XG5cdFx0XHRcdGtpbmQ6ICdzZW50Jyxcblx0XHRcdFx0bmV3U2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdGNsaTovZHVyYWJsZS1yb3V0ZScpLFxuXHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0YWdlbnQ6IHVuZGVmaW5lZCEsXG5cdFx0XHRcdFx0cmVzcG9uc2VDcmVhdGVkUHJvbWlzZTogUHJvbWlzZS5yZXNvbHZlKHsgcmVxdWVzdElkOiAnc3RhYmxlLXJlcXVlc3QtaWQnIH0gYXMgbmV2ZXIpLFxuXHRcdFx0XHRcdHJlc3BvbnNlQ29tcGxldGVQcm9taXNlOiBQcm9taXNlLnJlc29sdmUoKSxcblx0XHRcdFx0fSxcblx0XHRcdH0pLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQ2hhdFNlcnZpY2U7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBDaGF0U2Vzc2lvblJvdXRpbmdDb250cm9sbGVyKFxuXHRcdFx0e30gYXMgSUNoYXRTZXNzaW9uUm91dGluZ0hvc3QsXG5cdFx0XHQndGVzdCcsXG5cdFx0XHRjaGF0U2VydmljZSxcblx0XHRcdHVuZGVmaW5lZCEsXG5cdFx0XHR1bmRlZmluZWQhLFxuXHRcdFx0dW5kZWZpbmVkISxcblx0XHRcdHVuZGVmaW5lZCEsXG5cdFx0XHR7IGluZm86ICgpID0+IHsgfSwgd2FybjogKCkgPT4geyB9IH0gYXMgbmV2ZXIsXG5cdFx0XHR1bmRlZmluZWQhLFxuXHRcdFx0eyBzZXRGb2xkZXI6ICgpID0+IHsgfSB9IGFzIG5ldmVyLFxuXHRcdFx0dW5kZWZpbmVkISxcblx0XHRcdHVuZGVmaW5lZCEsXG5cdFx0KTtcblx0XHRjb25zdCBzZW5kUmVxdWVzdCA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfc2VuZFJlcXVlc3QnKSBhcyAocmVzb3VyY2U6IFVSSSwgdXR0ZXJhbmNlOiBzdHJpbmcsIG9wdGlvbnM6IG9iamVjdCkgPT4gUHJvbWlzZTx7IHN0YXR1czogc3RyaW5nOyByZXNvdXJjZT86IFVSSTsgcmVxdWVzdElkPzogc3RyaW5nIH0+O1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VuZFJlcXVlc3QuY2FsbChjb250cm9sbGVyLCByZXNvdXJjZSwgJ1J1biB0aGUgYnVpbGQnLCB7fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YXR1czogcmVzdWx0LnN0YXR1cyxcblx0XHRcdHJlc291cmNlOiByZXN1bHQucmVzb3VyY2U/LnRvU3RyaW5nKCksXG5cdFx0XHRyZXF1ZXN0SWQ6IHJlc3VsdC5yZXF1ZXN0SWQsXG5cdFx0fSwge1xuXHRcdFx0c3RhdHVzOiAnc2VudCcsXG5cdFx0XHRyZXNvdXJjZTogJ2FnZW50LWhvc3QtY29waWxvdGNsaTovZHVyYWJsZS1yb3V0ZScsXG5cdFx0XHRyZXF1ZXN0SWQ6ICdzdGFibGUtcmVxdWVzdC1pZCcsXG5cdFx0fSk7XG5cdFx0Y29udHJvbGxlci5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc21pc3NlcyByb3V0ZWQgcGVuZGluZyBpbnB1dCB3aXRoIHRoZSBkZWxpdmVyeSBiYWRnZScsICgpID0+IHtcblx0XHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdGNsaTovZGlzbWlzc2VkLXJvdXRlJyk7XG5cdFx0bGV0IGRpc21pc3NlZDogeyByZXNvdXJjZTogc3RyaW5nOyByZXF1ZXN0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCB9IHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgQ2hhdFNlc3Npb25Sb3V0aW5nQ29udHJvbGxlcihcblx0XHRcdHtcblx0XHRcdFx0cGxhY2VCYWRnZTogKGJhZGdlOiBIVE1MRWxlbWVudCkgPT4gY29udGFpbmVyLmFwcGVuZENoaWxkKGJhZGdlKSxcblx0XHRcdFx0b25EaWREaXNtaXNzUm91dGU6IChkaXNtaXNzZWRSZXNvdXJjZTogVVJJLCByZXF1ZXN0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0XHRcdGRpc21pc3NlZCA9IHsgcmVzb3VyY2U6IGRpc21pc3NlZFJlc291cmNlLnRvU3RyaW5nKCksIHJlcXVlc3RJZCB9O1xuXHRcdFx0XHR9LFxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElDaGF0U2Vzc2lvblJvdXRpbmdIb3N0LFxuXHRcdFx0J3Rlc3QnLFxuXHRcdFx0eyBnZXRTZXNzaW9uOiAoKSA9PiB1bmRlZmluZWQgfSBhcyB1bmtub3duIGFzIElDaGF0U2VydmljZSxcblx0XHRcdHsgbW9kZWw6IHsgZ2V0U2Vzc2lvbjogKCkgPT4gdW5kZWZpbmVkLCBvbkRpZENoYW5nZVNlc3Npb25zOiBFdmVudC5Ob25lIH0gfSBhcyBuZXZlcixcblx0XHRcdHVuZGVmaW5lZCEsXG5cdFx0XHR1bmRlZmluZWQhLFxuXHRcdFx0dW5kZWZpbmVkISxcblx0XHRcdHVuZGVmaW5lZCEsXG5cdFx0XHR1bmRlZmluZWQhLFxuXHRcdFx0dW5kZWZpbmVkISxcblx0XHRcdHVuZGVmaW5lZCEsXG5cdFx0XHR1bmRlZmluZWQhLFxuXHRcdCk7XG5cdFx0Y29uc3Qgc2hvd0RlbGl2ZXJ5Q29uZmlybWF0aW9uID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19zaG93RGVsaXZlcnlDb25maXJtYXRpb24nKSBhcyAoXG5cdFx0XHRsYWJlbDogc3RyaW5nLFxuXHRcdFx0cmVzdWx0OiB7IHN0YXR1czogJ3NlbnQnOyByZXNvdXJjZTogVVJJOyByZXF1ZXN0SWQ6IHN0cmluZyB9LFxuXHRcdCkgPT4gdm9pZDtcblxuXHRcdHNob3dEZWxpdmVyeUNvbmZpcm1hdGlvbi5jYWxsKGNvbnRyb2xsZXIsICdTZXNzaW9uJywgeyBzdGF0dXM6ICdzZW50JywgcmVzb3VyY2UsIHJlcXVlc3RJZDogJ3JlcXVlc3QtMScgfSk7XG5cdFx0Y29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KCcuY2hhdC1yb3V0aW5nLWJhZGdlLWFjdGlvbicpWzFdPy5jbGljaygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkaXNtaXNzZWQsXG5cdFx0XHRiYWRnZUNvbm5lY3RlZDogISFjb250YWluZXIucXVlcnlTZWxlY3RvcignLmNoYXQtcm91dGluZy1iYWRnZScpLFxuXHRcdH0sIHtcblx0XHRcdGRpc21pc3NlZDogeyByZXNvdXJjZTogcmVzb3VyY2UudG9TdHJpbmcoKSwgcmVxdWVzdElkOiAncmVxdWVzdC0xJyB9LFxuXHRcdFx0YmFkZ2VDb25uZWN0ZWQ6IGZhbHNlLFxuXHRcdH0pO1xuXG5cdFx0Y29udHJvbGxlci5kaXNwb3NlKCk7XG5cdFx0Y29udGFpbmVyLnJlbW92ZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIHRoZSBwcm92aWRlciByZXZlYWwgb3BlcmF0aW9uIGZvciBkZWxpdmVyeSBPcGVuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoY29udGFpbmVyKTtcblx0XHRsZXQgbG9jYWxPcGVuQ291bnQgPSAwO1xuXHRcdGxldCBwcm92aWRlck9wZW5Db3VudCA9IDA7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBDaGF0U2Vzc2lvblJvdXRpbmdDb250cm9sbGVyKFxuXHRcdFx0e1xuXHRcdFx0XHRwbGFjZUJhZGdlOiAoYmFkZ2U6IEhUTUxFbGVtZW50KSA9PiBjb250YWluZXIuYXBwZW5kQ2hpbGQoYmFkZ2UpLFxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElDaGF0U2Vzc2lvblJvdXRpbmdIb3N0LFxuXHRcdFx0J3Rlc3QnLFxuXHRcdFx0eyBnZXRTZXNzaW9uOiAoKSA9PiB1bmRlZmluZWQgfSBhcyB1bmtub3duIGFzIElDaGF0U2VydmljZSxcblx0XHRcdHVuZGVmaW5lZCEsXG5cdFx0XHR1bmRlZmluZWQhLFxuXHRcdFx0dW5kZWZpbmVkISxcblx0XHRcdHsgb3BlblNlc3Npb246ICgpID0+IGxvY2FsT3BlbkNvdW50KysgfSBhcyBuZXZlcixcblx0XHRcdHVuZGVmaW5lZCEsXG5cdFx0XHR1bmRlZmluZWQhLFxuXHRcdFx0dW5kZWZpbmVkISxcblx0XHRcdHVuZGVmaW5lZCEsXG5cdFx0XHR1bmRlZmluZWQhLFxuXHRcdCk7XG5cdFx0Y29uc3Qgc2hvd0RlbGl2ZXJ5Q29uZmlybWF0aW9uID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19zaG93RGVsaXZlcnlDb25maXJtYXRpb24nKSBhcyAoXG5cdFx0XHRsYWJlbDogc3RyaW5nLFxuXHRcdFx0cmVzdWx0OiB7IHN0YXR1czogJ3NlbnQnOyByZXNvdXJjZTogVVJJOyByZXZlYWw6ICgpID0+IFByb21pc2U8dm9pZD4gfSxcblx0XHQpID0+IHZvaWQ7XG5cblx0XHRzaG93RGVsaXZlcnlDb25maXJtYXRpb24uY2FsbChjb250cm9sbGVyLCAnUHJvdmlkZXIgc2Vzc2lvbicsIHtcblx0XHRcdHN0YXR1czogJ3NlbnQnLFxuXHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOi9wcm92aWRlci1kZWxpdmVyeScpLFxuXHRcdFx0cmV2ZWFsOiBhc3luYyAoKSA9PiB7IHByb3ZpZGVyT3BlbkNvdW50Kys7IH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IFsuLi5jb250YWluZXIucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oJy5jaGF0LXJvdXRpbmctYmFkZ2UtYWN0aW9uJyldO1xuXHRcdGFjdGlvbnNbMF0/LmNsaWNrKCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFjdGlvbnM6IGFjdGlvbnMubWFwKGFjdGlvbiA9PiBhY3Rpb24udGV4dENvbnRlbnQpLFxuXHRcdFx0bG9jYWxPcGVuQ291bnQsXG5cdFx0XHRwcm92aWRlck9wZW5Db3VudCxcblx0XHRcdGJhZGdlQ29ubmVjdGVkOiAhIWNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcuY2hhdC1yb3V0aW5nLWJhZGdlJyksXG5cdFx0fSwge1xuXHRcdFx0YWN0aW9uczogWydPcGVuJywgJ0Rpc21pc3MnXSxcblx0XHRcdGxvY2FsT3BlbkNvdW50OiAwLFxuXHRcdFx0cHJvdmlkZXJPcGVuQ291bnQ6IDEsXG5cdFx0XHRiYWRnZUNvbm5lY3RlZDogdHJ1ZSxcblx0XHR9KTtcblxuXHRcdGNvbnRyb2xsZXIuZGlzcG9zZSgpO1xuXHRcdGNvbnRhaW5lci5yZW1vdmUoKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlcyBhIHByb3ZpZGVyIGRlbGl2ZXJ5IHdpdGggaXRzIHRpdGxlIGFuZCBjb21wbGV0ZWQgcmVzcG9uc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChjb250YWluZXIpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKCdzZXNzaW9uOi9wcm92aWRlci1kZWxpdmVyeScpO1xuXHRcdGNvbnN0IHNlc3Npb25zQ2hhbmdlZCA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0bGV0IHNuYXBzaG90OiBJUm91dGFibGVTZXNzaW9uID0ge1xuXHRcdFx0c2Vzc2lvbklkOiAncHJvdmlkZXI6c2Vzc2lvbicsXG5cdFx0XHRsYWJlbDogJ05ldyBzZXNzaW9uJyxcblx0XHRcdHN0YXR1czogJ3dvcmtpbmcnLFxuXHRcdFx0bGFzdEFjdGl2aXR5OiAxLFxuXHRcdH07XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB7XG5cdFx0XHR3YXRjaFNlc3Npb246IChfcmVzb3VyY2U6IFVSSSwgbGlzdGVuZXI6ICgpID0+IHZvaWQpID0+IHNlc3Npb25zQ2hhbmdlZC5ldmVudChsaXN0ZW5lciksXG5cdFx0XHRnZXRTZXNzaW9uU25hcHNob3Q6IGFzeW5jICgpID0+IHNuYXBzaG90LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQ2hhdFNlc3Npb25Sb3V0aW5nUHJvdmlkZXI7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBDaGF0U2Vzc2lvblJvdXRpbmdDb250cm9sbGVyKFxuXHRcdFx0e1xuXHRcdFx0XHRwbGFjZUJhZGdlOiAoYmFkZ2U6IEhUTUxFbGVtZW50KSA9PiBjb250YWluZXIuYXBwZW5kQ2hpbGQoYmFkZ2UpLFxuXHRcdFx0XHRnZXRSb3V0aW5nUHJvdmlkZXI6ICgpID0+IHByb3ZpZGVyLFxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElDaGF0U2Vzc2lvblJvdXRpbmdIb3N0LFxuXHRcdFx0J3Rlc3QnLFxuXHRcdFx0eyBnZXRTZXNzaW9uOiAoKSA9PiB1bmRlZmluZWQgfSBhcyB1bmtub3duIGFzIElDaGF0U2VydmljZSxcblx0XHRcdHVuZGVmaW5lZCEsXG5cdFx0XHR1bmRlZmluZWQhLFxuXHRcdFx0dW5kZWZpbmVkISxcblx0XHRcdHVuZGVmaW5lZCEsXG5cdFx0XHR1bmRlZmluZWQhLFxuXHRcdFx0dW5kZWZpbmVkISxcblx0XHRcdHVuZGVmaW5lZCEsXG5cdFx0XHR1bmRlZmluZWQhLFxuXHRcdFx0dW5kZWZpbmVkISxcblx0XHQpO1xuXHRcdGNvbnN0IHNob3dEZWxpdmVyeUNvbmZpcm1hdGlvbiA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfc2hvd0RlbGl2ZXJ5Q29uZmlybWF0aW9uJykgYXMgKFxuXHRcdFx0bGFiZWw6IHN0cmluZyxcblx0XHRcdHJlc3VsdDogeyBzdGF0dXM6ICdzZW50JzsgcmVzb3VyY2U6IFVSSTsgcmV2ZWFsOiAoKSA9PiBQcm9taXNlPHZvaWQ+IH0sXG5cdFx0KSA9PiB2b2lkO1xuXG5cdFx0c2hvd0RlbGl2ZXJ5Q29uZmlybWF0aW9uLmNhbGwoY29udHJvbGxlciwgJ05ldyBzZXNzaW9uJywge1xuXHRcdFx0c3RhdHVzOiAnc2VudCcsXG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdHJldmVhbDogYXN5bmMgKCkgPT4geyB9LFxuXHRcdH0pO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250YWluZXIucXVlcnlTZWxlY3RvcignLmNoYXQtcm91dGluZy1iYWRnZS1sYWJlbCcpPy50ZXh0Q29udGVudCwgJ0luIHByb2dyZXNzOiBOZXcgc2Vzc2lvbicpO1xuXHRcdHNuYXBzaG90ID0ge1xuXHRcdFx0c2Vzc2lvbklkOiAncHJvdmlkZXI6c2Vzc2lvbicsXG5cdFx0XHRsYWJlbDogJ1VwZGF0ZSByb3V0aW5nIGJhZGdlJyxcblx0XHRcdHN0YXR1czogJ2lkbGUnLFxuXHRcdFx0bGFzdEFjdGl2aXR5OiAyLFxuXHRcdFx0bGFzdFJlc3BvbnNlOiAnRG9uZS4gSSBjcmVhdGVkIFttZWdhbi5tZF0oZmlsZTovLy9tZWdhbi5tZCkuJyxcblx0XHR9O1xuXHRcdHNlc3Npb25zQ2hhbmdlZC5maXJlKCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGxhYmVsOiBjb250YWluZXIucXVlcnlTZWxlY3RvcignLmNoYXQtcm91dGluZy1iYWRnZS1sYWJlbCcpPy50ZXh0Q29udGVudCxcblx0XHRcdGxpbms6IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcuY2hhdC1yb3V0aW5nLWJhZGdlLXJlc3BvbnNlLXByZXZpZXcgYScpPy50ZXh0Q29udGVudCxcblx0XHR9LCB7XG5cdFx0XHRsYWJlbDogJ0NvbXBsZXRlZCB1cGRhdGUgcm91dGluZyBiYWRnZTpEb25lLiBJIGNyZWF0ZWQgbWVnYW4ubWQuJyxcblx0XHRcdGxpbms6ICdtZWdhbi5tZCcsXG5cdFx0fSk7XG5cdFx0Y29uc3QgY2xlYXJDb21wbGV0ZWREZWxpdmVyaWVzID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19jbGVhckNvbXBsZXRlZERlbGl2ZXJ5Q29uZmlybWF0aW9ucycpIGFzICgpID0+IHZvaWQ7XG5cdFx0Y2xlYXJDb21wbGV0ZWREZWxpdmVyaWVzLmNhbGwoY29udHJvbGxlcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcuY2hhdC1yb3V0aW5nLWJhZGdlJyksIG51bGwpO1xuXG5cdFx0Y29udHJvbGxlci5kaXNwb3NlKCk7XG5cdFx0c2Vzc2lvbnNDaGFuZ2VkLmRpc3Bvc2UoKTtcblx0XHRjb250YWluZXIucmVtb3ZlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2tlZXBzIHVucmVzb2x2ZWQgZGVsaXZlcnkgcm93cyB3aGVuIGFub3RoZXIgcmVxdWVzdCBzdGFydHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChjb250YWluZXIpO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgQ2hhdFNlc3Npb25Sb3V0aW5nQ29udHJvbGxlcihcblx0XHRcdHtcblx0XHRcdFx0cGxhY2VCYWRnZTogKGJhZGdlOiBIVE1MRWxlbWVudCkgPT4gY29udGFpbmVyLmFwcGVuZENoaWxkKGJhZGdlKSxcblx0XHRcdH0gYXMgdW5rbm93biBhcyBJQ2hhdFNlc3Npb25Sb3V0aW5nSG9zdCxcblx0XHRcdCd0ZXN0Jyxcblx0XHRcdHsgZ2V0U2Vzc2lvbjogKCkgPT4gdW5kZWZpbmVkIH0gYXMgdW5rbm93biBhcyBJQ2hhdFNlcnZpY2UsXG5cdFx0XHR7IG1vZGVsOiB7IGdldFNlc3Npb246ICgpID0+IHVuZGVmaW5lZCwgb25EaWRDaGFuZ2VTZXNzaW9uczogRXZlbnQuTm9uZSB9IH0gYXMgbmV2ZXIsXG5cdFx0XHR1bmRlZmluZWQhLFxuXHRcdFx0dW5kZWZpbmVkISxcblx0XHRcdHVuZGVmaW5lZCEsXG5cdFx0XHR1bmRlZmluZWQhLFxuXHRcdFx0dW5kZWZpbmVkISxcblx0XHRcdHVuZGVmaW5lZCEsXG5cdFx0XHR1bmRlZmluZWQhLFxuXHRcdFx0dW5kZWZpbmVkISxcblx0XHQpO1xuXHRcdGNvbnN0IHNob3dEZWxpdmVyeUNvbmZpcm1hdGlvbiA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfc2hvd0RlbGl2ZXJ5Q29uZmlybWF0aW9uJykgYXMgKFxuXHRcdFx0bGFiZWw6IHN0cmluZyxcblx0XHRcdHJlc3VsdDogeyBzdGF0dXM6ICdzZW50JzsgcmVzb3VyY2U6IFVSSSB9LFxuXHRcdCkgPT4gdm9pZDtcblxuXHRcdHNob3dEZWxpdmVyeUNvbmZpcm1hdGlvbi5jYWxsKGNvbnRyb2xsZXIsICdGaXJzdCBzZXNzaW9uJywgeyBzdGF0dXM6ICdzZW50JywgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovZmlyc3QnKSB9KTtcblx0XHRzaG93RGVsaXZlcnlDb25maXJtYXRpb24uY2FsbChjb250cm9sbGVyLCAnU2Vjb25kIHNlc3Npb24nLCB7IHN0YXR1czogJ3NlbnQnLCByZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi9zZWNvbmQnKSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRbLi4uY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LXJvdXRpbmctYmFkZ2UtbGFiZWwnKV0ubWFwKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCksXG5cdFx0XHRbJ1NlbnQgdG8gRmlyc3Qgc2Vzc2lvbicsICdTZW50IHRvIFNlY29uZCBzZXNzaW9uJ11cblx0XHQpO1xuXG5cdFx0Y29udHJvbGxlci5kaXNwb3NlKCk7XG5cdFx0Y29udGFpbmVyLnJlbW92ZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyBhbiBleGlzdGluZyBzZXNzaW9uIHJlZmVyZW5jZSB1bnRpbCBhIHF1ZXVlZCByb3V0ZSBjb21wbGV0ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdGNsaTovZXhpc3Rpbmctcm91dGUnKTtcblx0XHRsZXQgcmVzb2x2ZVF1ZXVlZCE6IChyZXN1bHQ6IENoYXRTZW5kUmVzdWx0KSA9PiB2b2lkO1xuXHRcdGNvbnN0IHF1ZXVlZCA9IG5ldyBQcm9taXNlPENoYXRTZW5kUmVzdWx0PihyZXNvbHZlID0+IHJlc29sdmVRdWV1ZWQgPSByZXNvbHZlKTtcblx0XHRsZXQgZGlzcG9zZWQgPSBmYWxzZTtcblx0XHRsZXQgc2VudE9wdGlvbnM6IHsgdXNlclNlbGVjdGVkTW9kZWxJZD86IHN0cmluZzsgYWdlbnRJZFNpbGVudD86IHN0cmluZzsgcXVldWU/OiBDaGF0UmVxdWVzdFF1ZXVlS2luZCB9IHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGNoYXRTZXJ2aWNlID0ge1xuXHRcdFx0YWNxdWlyZU9yTG9hZFNlc3Npb246IGFzeW5jICgpID0+ICh7XG5cdFx0XHRcdG9iamVjdDogeyBzZXNzaW9uUmVzb3VyY2U6IHJlc291cmNlIH0sXG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IGRpc3Bvc2VkID0gdHJ1ZSxcblx0XHRcdH0pLFxuXHRcdFx0c2VuZFJlcXVlc3Q6IGFzeW5jIChfcmVzb3VyY2U6IFVSSSwgX21lc3NhZ2U6IHN0cmluZywgb3B0aW9uczogdHlwZW9mIHNlbnRPcHRpb25zKTogUHJvbWlzZTxDaGF0U2VuZFJlc3VsdD4gPT4ge1xuXHRcdFx0XHRzZW50T3B0aW9ucyA9IG9wdGlvbnM7XG5cdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdxdWV1ZWQnLCByZXF1ZXN0SWQ6ICdxdWV1ZWQtcmVxdWVzdCcsIGRlZmVycmVkOiBxdWV1ZWQgfTtcblx0XHRcdH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIElDaGF0U2VydmljZTtcblx0XHRjb25zdCBob3N0ID0ge1xuXHRcdFx0d2lkZ2V0OiB7XG5cdFx0XHRcdGlucHV0RWRpdG9yOiB7IGdldFZhbHVlOiAoKSA9PiAnZGlmZmVyZW50IGRyYWZ0Jywgc2V0VmFsdWU6ICgpID0+IHsgfSB9LFxuXHRcdFx0XHRhdHRhY2htZW50TW9kZWw6IHsgYXR0YWNobWVudHM6IFtdLCBjbGVhcjogKCkgPT4geyB9IH0sXG5cdFx0XHR9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQ2hhdFNlc3Npb25Sb3V0aW5nSG9zdDtcblx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IENoYXRTZXNzaW9uUm91dGluZ0NvbnRyb2xsZXIoXG5cdFx0XHRob3N0LFxuXHRcdFx0J3Rlc3QnLFxuXHRcdFx0Y2hhdFNlcnZpY2UsXG5cdFx0XHR1bmRlZmluZWQhLFxuXHRcdFx0dW5kZWZpbmVkISxcblx0XHRcdHVuZGVmaW5lZCEsXG5cdFx0XHR1bmRlZmluZWQhLFxuXHRcdFx0dW5kZWZpbmVkISxcblx0XHRcdHVuZGVmaW5lZCEsXG5cdFx0XHR1bmRlZmluZWQhLFxuXHRcdFx0dW5kZWZpbmVkISxcblx0XHRcdHVuZGVmaW5lZCEsXG5cdFx0KTtcblx0XHRjb25zdCBkaXNwYXRjaCA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfZGlzcGF0Y2hUb1Nlc3Npb24nKSBhcyAoXG5cdFx0XHRzZXNzaW9uSWQ6IHN0cmluZyxcblx0XHRcdGlucHV0OiBzdHJpbmcsXG5cdFx0XHRhdHRhY2htZW50SWRzOiByZWFkb25seSBzdHJpbmdbXSxcblx0XHRcdHV0dGVyYW5jZTogc3RyaW5nLFxuXHRcdFx0b3B0aW9uczogb2JqZWN0LFxuXHRcdFx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuLFxuXHRcdFx0bm90aWZ5Um91dGU6IGJvb2xlYW4sXG5cdFx0KSA9PiBQcm9taXNlPHsgY29tcGxldGlvbj86IFByb21pc2U8dW5rbm93bj4gfT47XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBkaXNwYXRjaC5jYWxsKGNvbnRyb2xsZXIsIHJlc291cmNlLnRvU3RyaW5nKCksICdydW4nLCBbXSwgJ3J1bicsIHsgdXNlclNlbGVjdGVkTW9kZWxJZDogJ3BpY2tlZC1tb2RlbCcgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3Bvc2VkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlbnRPcHRpb25zPy51c2VyU2VsZWN0ZWRNb2RlbElkLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZW50T3B0aW9ucz8uYWdlbnRJZFNpbGVudCwgQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkFnZW50SG9zdENvcGlsb3QpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZW50T3B0aW9ucz8ucXVldWUsIENoYXRSZXF1ZXN0UXVldWVLaW5kLlF1ZXVlZCk7XG5cdFx0cmVzb2x2ZVF1ZXVlZCh7XG5cdFx0XHRraW5kOiAnc2VudCcsXG5cdFx0XHRkYXRhOiB7XG5cdFx0XHRcdGFnZW50OiB1bmRlZmluZWQhLFxuXHRcdFx0XHRyZXNwb25zZUNyZWF0ZWRQcm9taXNlOiBQcm9taXNlLnJlc29sdmUoeyByZXF1ZXN0SWQ6ICdxdWV1ZWQtcmVxdWVzdCcgfSBhcyBuZXZlciksXG5cdFx0XHRcdHJlc3BvbnNlQ29tcGxldGVQcm9taXNlOiBQcm9taXNlLnJlc29sdmUoKSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0YXdhaXQgcmVzdWx0LmNvbXBsZXRpb247XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3Bvc2VkLCB0cnVlKTtcblx0XHRjb250cm9sbGVyLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcGF0Y2hlcyBuZXcgc2Vzc2lvbnMgdGhyb3VnaCB0aGUgcm91dGluZyBwcm92aWRlciBob29rJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKCdhZ2VudC1ob3N0LWNvcGlsb3RjbGk6L25ldy1yb3V0ZScpO1xuXHRcdGNvbnN0IGZvbGRlciA9IFVSSS5maWxlKCcvd29ya3NwYWNlJyk7XG5cdFx0bGV0IGRpc3BhdGNoZWQ6IHsgZm9sZGVyOiBVUkkgfCB1bmRlZmluZWQ7IHByb3ZpZGVySWQ6IHN0cmluZyB8IHVuZGVmaW5lZDsgbWVzc2FnZTogc3RyaW5nOyBtb2RlbElkOiBzdHJpbmcgfCB1bmRlZmluZWQgfSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgcmVzb2x2ZWRSZXF1ZXN0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgbG9jYWxDcmVhdGVDb3VudCA9IDA7XG5cdFx0Y29uc3Qgcm91dGluZ1Byb3ZpZGVyOiBJQ2hhdFNlc3Npb25Sb3V0aW5nUHJvdmlkZXIgPSB7XG5cdFx0XHRnZXRDYW5kaWRhdGVTZXNzaW9uczogKCkgPT4gW10sXG5cdFx0XHRyZXNvbHZlU2Vzc2lvblJlc291cmNlOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRkaXNwYXRjaFRvU2Vzc2lvbjogYXN5bmMgKCkgPT4gKHsgc3RhdHVzOiAncmVqZWN0ZWQnIH0pLFxuXHRcdFx0ZGlzcGF0Y2hUb05ld1Nlc3Npb246IGFzeW5jICh0YXJnZXQsIG1lc3NhZ2UsIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0ZGlzcGF0Y2hlZCA9IHsgZm9sZGVyOiB0YXJnZXQuZm9sZGVyLCBwcm92aWRlcklkOiB0YXJnZXQucHJvdmlkZXJJZCwgbWVzc2FnZSwgbW9kZWxJZDogb3B0aW9ucy51c2VyU2VsZWN0ZWRNb2RlbElkIH07XG5cdFx0XHRcdHJldHVybiB7IHN0YXR1czogJ3NlbnQnLCByZXNvdXJjZSB9O1xuXHRcdFx0fSxcblx0XHRcdHJldmVhbFNlc3Npb246IGFzeW5jICgpID0+IHsgfSxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgQ2hhdFNlc3Npb25Sb3V0aW5nQ29udHJvbGxlcihcblx0XHRcdHtcblx0XHRcdFx0d2lkZ2V0OiB7XG5cdFx0XHRcdFx0aW5wdXRFZGl0b3I6IHsgZ2V0VmFsdWU6ICgpID0+ICdkaWZmZXJlbnQgZHJhZnQnLCBzZXRWYWx1ZTogKCkgPT4geyB9IH0sXG5cdFx0XHRcdFx0YXR0YWNobWVudE1vZGVsOiB7IGF0dGFjaG1lbnRzOiBbXSwgY2xlYXI6ICgpID0+IHsgfSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXRSb3V0aW5nUHJvdmlkZXI6ICgpID0+IHJvdXRpbmdQcm92aWRlcixcblx0XHRcdFx0b25EaWRSZXNvbHZlUm91dGU6IChfcmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCwgX2tpbmQ6ICdleGlzdGluZ19zZXNzaW9uJyB8ICduZXdfc2Vzc2lvbicgfCB1bmRlZmluZWQsIF92b2ljZTogYm9vbGVhbiB8IHVuZGVmaW5lZCwgcmVxdWVzdElkOiBzdHJpbmcgfCB1bmRlZmluZWQpID0+IHtcblx0XHRcdFx0XHRyZXNvbHZlZFJlcXVlc3RJZCA9IHJlcXVlc3RJZDtcblx0XHRcdFx0fSxcblx0XHRcdH0gYXMgdW5rbm93biBhcyBJQ2hhdFNlc3Npb25Sb3V0aW5nSG9zdCxcblx0XHRcdCd0ZXN0Jyxcblx0XHRcdHtcblx0XHRcdFx0c3RhcnROZXdMb2NhbFNlc3Npb246ICgpID0+IHsgbG9jYWxDcmVhdGVDb3VudCsrOyByZXR1cm4gdW5kZWZpbmVkOyB9LFxuXHRcdFx0XHRnZXRTZXNzaW9uOiAoKSA9PiAoeyBsYXN0UmVxdWVzdDogeyBpZDogJ2R1cmFibGUtcHJvdmlkZXItcmVxdWVzdCcgfSB9KSxcblx0XHRcdH0gYXMgdW5rbm93biBhcyBJQ2hhdFNlcnZpY2UsXG5cdFx0XHR1bmRlZmluZWQhLFxuXHRcdFx0dW5kZWZpbmVkISxcblx0XHRcdHVuZGVmaW5lZCEsXG5cdFx0XHR1bmRlZmluZWQhLFxuXHRcdFx0eyBpbmZvOiAoKSA9PiB7IH0sIHdhcm46ICgpID0+IHsgfSB9IGFzIG5ldmVyLFxuXHRcdFx0dW5kZWZpbmVkISxcblx0XHRcdHsgc2V0Rm9sZGVyOiAoKSA9PiB7IH0gfSBhcyBuZXZlcixcblx0XHRcdHVuZGVmaW5lZCEsXG5cdFx0XHR1bmRlZmluZWQhLFxuXHRcdCk7XG5cdFx0Y29uc3QgZGlzcGF0Y2ggPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2Rpc3BhdGNoVG9OZXdTZXNzaW9uJykgYXMgKFxuXHRcdFx0aW5wdXQ6IHN0cmluZyxcblx0XHRcdGF0dGFjaG1lbnRJZHM6IHJlYWRvbmx5IHN0cmluZ1tdLFxuXHRcdFx0dXR0ZXJhbmNlOiBzdHJpbmcsXG5cdFx0XHRvcHRpb25zOiBvYmplY3QsXG5cdFx0XHR0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sXG5cdFx0XHRub3RpZnlSb3V0ZTogYm9vbGVhbixcblx0XHRcdHRhcmdldDogeyBmb2xkZXI6IFVSSTsgcHJvdmlkZXJJZDogc3RyaW5nIH0sXG5cdFx0KSA9PiBQcm9taXNlPHsgc3RhdHVzOiBzdHJpbmc7IHJlc291cmNlPzogVVJJOyByZXZlYWw/OiAoKSA9PiBQcm9taXNlPHZvaWQ+IH0+O1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZGlzcGF0Y2guY2FsbChjb250cm9sbGVyLCAncnVuJywgW10sICdydW4nLCB7IHVzZXJTZWxlY3RlZE1vZGVsSWQ6ICdtb2RlbCcgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgdHJ1ZSwgeyBmb2xkZXIsIHByb3ZpZGVySWQ6ICdwcm92aWRlcicgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRpc3BhdGNoZWQsXG5cdFx0XHRsb2NhbENyZWF0ZUNvdW50LFxuXHRcdFx0cmVzb2x2ZWRSZXF1ZXN0SWQsXG5cdFx0XHRyZXN1bHQ6IHsgc3RhdHVzOiByZXN1bHQuc3RhdHVzLCByZXNvdXJjZTogcmVzdWx0LnJlc291cmNlPy50b1N0cmluZygpLCBoYXNSZXZlYWw6ICEhcmVzdWx0LnJldmVhbCB9LFxuXHRcdH0sIHtcblx0XHRcdGRpc3BhdGNoZWQ6IHsgZm9sZGVyLCBwcm92aWRlcklkOiAncHJvdmlkZXInLCBtZXNzYWdlOiAncnVuJywgbW9kZWxJZDogJ21vZGVsJyB9LFxuXHRcdFx0bG9jYWxDcmVhdGVDb3VudDogMCxcblx0XHRcdHJlc29sdmVkUmVxdWVzdElkOiAnZHVyYWJsZS1wcm92aWRlci1yZXF1ZXN0Jyxcblx0XHRcdHJlc3VsdDogeyBzdGF0dXM6ICdzZW50JywgcmVzb3VyY2U6IHJlc291cmNlLnRvU3RyaW5nKCksIGhhc1JldmVhbDogdHJ1ZSB9LFxuXHRcdH0pO1xuXHRcdGNvbnRyb2xsZXIuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIHByb3ZpZGVyIGNhbmRpZGF0ZXMgaW5zdGVhZCBvZiB0aGUgcmVuZGVyZXItbG9jYWwgY2F0YWxvZycsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgbG9jYWxSZXNvbHZlQ291bnQgPSAwO1xuXHRcdGNvbnN0IHJvdXRpbmdQcm92aWRlcjogSUNoYXRTZXNzaW9uUm91dGluZ1Byb3ZpZGVyID0ge1xuXHRcdFx0Z2V0Q2FuZGlkYXRlU2Vzc2lvbnM6ICgpID0+IFtcblx0XHRcdFx0eyBzZXNzaW9uSWQ6ICdwcm92aWRlcjpiJywgbGFiZWw6ICdCJyB9LFxuXHRcdFx0XHR7IHNlc3Npb25JZDogJ3Byb3ZpZGVyOmEnLCBsYWJlbDogJ0EnIH0sXG5cdFx0XHRcdHsgc2Vzc2lvbklkOiAncHJvdmlkZXI6YScsIGxhYmVsOiAnRHVwbGljYXRlIEEnIH0sXG5cdFx0XHRdLFxuXHRcdFx0cmVzb2x2ZVNlc3Npb25SZXNvdXJjZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0ZGlzcGF0Y2hUb1Nlc3Npb246IGFzeW5jICgpID0+ICh7IHN0YXR1czogJ3JlamVjdGVkJyB9KSxcblx0XHRcdGRpc3BhdGNoVG9OZXdTZXNzaW9uOiBhc3luYyAoKSA9PiAoeyBzdGF0dXM6ICdyZWplY3RlZCcgfSksXG5cdFx0XHRyZXZlYWxTZXNzaW9uOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0fTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IENoYXRTZXNzaW9uUm91dGluZ0NvbnRyb2xsZXIoXG5cdFx0XHR7XG5cdFx0XHRcdGdldE93blNlc3Npb25SZXNvdXJjZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRnZXRSb3V0aW5nUHJvdmlkZXI6ICgpID0+IHJvdXRpbmdQcm92aWRlcixcblx0XHRcdH0gYXMgdW5rbm93biBhcyBJQ2hhdFNlc3Npb25Sb3V0aW5nSG9zdCxcblx0XHRcdCd0ZXN0Jyxcblx0XHRcdHVuZGVmaW5lZCEsXG5cdFx0XHR7XG5cdFx0XHRcdG1vZGVsOiB7XG5cdFx0XHRcdFx0cmVzb2x2ZTogYXN5bmMgKCkgPT4geyBsb2NhbFJlc29sdmVDb3VudCsrOyB9LFxuXHRcdFx0XHRcdHNlc3Npb25zOiBbXSxcblx0XHRcdFx0fSxcblx0XHRcdH0gYXMgbmV2ZXIsXG5cdFx0XHR7IGdldENoYXRTZXNzaW9uQ29udHJpYnV0aW9uOiAoKSA9PiAoeyBpc1JlYWRPbmx5OiBmYWxzZSB9KSB9IGFzIG5ldmVyLFxuXHRcdFx0dW5kZWZpbmVkISxcblx0XHRcdHVuZGVmaW5lZCEsXG5cdFx0XHR7IHdhcm46ICgpID0+IHsgfSB9IGFzIG5ldmVyLFxuXHRcdFx0dW5kZWZpbmVkISxcblx0XHRcdHVuZGVmaW5lZCEsXG5cdFx0XHR1bmRlZmluZWQhLFxuXHRcdFx0dW5kZWZpbmVkISxcblx0XHQpO1xuXHRcdGNvbnN0IGNvbGxlY3QgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2NvbGxlY3RDYW5kaWRhdGVTZXNzaW9ucycpIGFzICh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFByb21pc2U8cmVhZG9ubHkgeyBzZXNzaW9uSWQ6IHN0cmluZyB9W10+O1xuXG5cdFx0Y29uc3QgY2FuZGlkYXRlcyA9IGF3YWl0IGNvbGxlY3QuY2FsbChjb250cm9sbGVyLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FuZGlkYXRlcy5tYXAoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5zZXNzaW9uSWQpLCBbXG5cdFx0XHQncHJvdmlkZXI6YScsXG5cdFx0XHQncHJvdmlkZXI6YicsXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxvY2FsUmVzb2x2ZUNvdW50LCAwKTtcblx0XHRjb250cm9sbGVyLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcGF0Y2hlcyBwcm92aWRlciBjYW5kaWRhdGVzIHdpdGhvdXQgdXNpbmcgcmVuZGVyZXItbG9jYWwgY2hhdCBzZXJ2aWNlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlclJlc291cmNlID0gVVJJLnBhcnNlKCdhZ2VudC1ob3N0LWNvcGlsb3RjbGk6L3Byb3ZpZGVyJyk7XG5cdFx0Y29uc3QgcHJvdmlkZXJDYW5kaWRhdGUgPSB7IHNlc3Npb25JZDogJ3Byb3ZpZGVyOnNlc3Npb24nLCBsYWJlbDogJ1Byb3ZpZGVyJyB9O1xuXHRcdGxldCBpbnB1dCA9ICdSdW4gdGVzdHMnO1xuXHRcdGxldCBjbGVhcmVkQXR0YWNobWVudHMgPSBmYWxzZTtcblx0XHRsZXQgbG9jYWxBY3F1aXJlQ291bnQgPSAwO1xuXHRcdGxldCBwcm92aWRlclJldmVhbENvdW50ID0gMDtcblx0XHRsZXQgZGlzcGF0Y2hlZDogeyBjYW5kaWRhdGVJZDogc3RyaW5nOyBtZXNzYWdlOiBzdHJpbmc7IG1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCB9IHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGNhbGxiYWNrczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCByb3V0aW5nUHJvdmlkZXI6IElDaGF0U2Vzc2lvblJvdXRpbmdQcm92aWRlciA9IHtcblx0XHRcdGdldENhbmRpZGF0ZVNlc3Npb25zOiAoKSA9PiBbcHJvdmlkZXJDYW5kaWRhdGVdLFxuXHRcdFx0cmVzb2x2ZVNlc3Npb25SZXNvdXJjZTogY2FuZGlkYXRlSWQgPT4gY2FuZGlkYXRlSWQgPT09IHByb3ZpZGVyQ2FuZGlkYXRlLnNlc3Npb25JZCA/IHByb3ZpZGVyUmVzb3VyY2UgOiB1bmRlZmluZWQsXG5cdFx0XHRkaXNwYXRjaFRvU2Vzc2lvbjogYXN5bmMgKGNhbmRpZGF0ZUlkLCBtZXNzYWdlLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRcdGRpc3BhdGNoZWQgPSB7IGNhbmRpZGF0ZUlkLCBtZXNzYWdlLCBtb2RlbElkOiBvcHRpb25zLnVzZXJTZWxlY3RlZE1vZGVsSWQgfTtcblx0XHRcdFx0cmV0dXJuIHsgc3RhdHVzOiAnc2VudCcsIHJlc291cmNlOiBwcm92aWRlclJlc291cmNlLCByZXF1ZXN0SWQ6ICdyZXF1ZXN0LTEnIH07XG5cdFx0XHR9LFxuXHRcdFx0ZGlzcGF0Y2hUb05ld1Nlc3Npb246IGFzeW5jICgpID0+ICh7IHN0YXR1czogJ3JlamVjdGVkJyB9KSxcblx0XHRcdHJldmVhbFNlc3Npb246IGFzeW5jICgpID0+IHsgcHJvdmlkZXJSZXZlYWxDb3VudCsrOyB9LFxuXHRcdH07XG5cdFx0Y29uc3QgaG9zdCA9IHtcblx0XHRcdHdpZGdldDoge1xuXHRcdFx0XHRpbnB1dEVkaXRvcjoge1xuXHRcdFx0XHRcdGdldFZhbHVlOiAoKSA9PiBpbnB1dCxcblx0XHRcdFx0XHRzZXRWYWx1ZTogKHZhbHVlOiBzdHJpbmcpID0+IGlucHV0ID0gdmFsdWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGF0dGFjaG1lbnRNb2RlbDoge1xuXHRcdFx0XHRcdGF0dGFjaG1lbnRzOiBbXSxcblx0XHRcdFx0XHRjbGVhcjogKCkgPT4gY2xlYXJlZEF0dGFjaG1lbnRzID0gdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHRnZXRPd25TZXNzaW9uUmVzb3VyY2U6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdGdldFJvdXRpbmdQcm92aWRlcjogKCkgPT4gcm91dGluZ1Byb3ZpZGVyLFxuXHRcdFx0b25XaWxsRGlzcGF0Y2hSb3V0ZTogKCkgPT4gY2FsbGJhY2tzLnB1c2goJ3dpbGwnKSxcblx0XHRcdG9uRGlkUmVzb2x2ZVJvdXRlOiAoKSA9PiBjYWxsYmFja3MucHVzaCgncmVzb2x2ZWQnKSxcblx0XHR9IGFzIHVua25vd24gYXMgSUNoYXRTZXNzaW9uUm91dGluZ0hvc3Q7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBDaGF0U2Vzc2lvblJvdXRpbmdDb250cm9sbGVyKFxuXHRcdFx0aG9zdCxcblx0XHRcdCd0ZXN0Jyxcblx0XHRcdHtcblx0XHRcdFx0YWNxdWlyZU9yTG9hZFNlc3Npb246IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRsb2NhbEFjcXVpcmVDb3VudCsrO1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH0sXG5cdFx0XHR9IGFzIHVua25vd24gYXMgSUNoYXRTZXJ2aWNlLFxuXHRcdFx0eyBtb2RlbDogeyByZXNvbHZlOiBhc3luYyAoKSA9PiB7IH0sIHNlc3Npb25zOiBbXSB9IH0gYXMgbmV2ZXIsXG5cdFx0XHR1bmRlZmluZWQhLFxuXHRcdFx0dW5kZWZpbmVkISxcblx0XHRcdHVuZGVmaW5lZCEsXG5cdFx0XHR7IHdhcm46ICgpID0+IHsgfSB9IGFzIG5ldmVyLFxuXHRcdFx0dW5kZWZpbmVkISxcblx0XHRcdHVuZGVmaW5lZCEsXG5cdFx0XHR1bmRlZmluZWQhLFxuXHRcdFx0dW5kZWZpbmVkISxcblx0XHQpO1xuXHRcdGNvbnN0IGNvbGxlY3QgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2NvbGxlY3RDYW5kaWRhdGVTZXNzaW9ucycpIGFzICh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFByb21pc2U8dW5rbm93bj47XG5cdFx0YXdhaXQgY29sbGVjdC5jYWxsKGNvbnRyb2xsZXIsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGNvbnN0IGRpc3BhdGNoID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19kaXNwYXRjaFRvU2Vzc2lvbicpIGFzIChcblx0XHRcdHNlc3Npb25JZDogc3RyaW5nLFxuXHRcdFx0aW5wdXQ6IHN0cmluZyxcblx0XHRcdGF0dGFjaG1lbnRJZHM6IHJlYWRvbmx5IHN0cmluZ1tdLFxuXHRcdFx0dXR0ZXJhbmNlOiBzdHJpbmcsXG5cdFx0XHRvcHRpb25zOiBvYmplY3QsXG5cdFx0XHR0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sXG5cdFx0XHRub3RpZnlSb3V0ZTogYm9vbGVhbixcblx0XHQpID0+IFByb21pc2U8eyBzdGF0dXM6IHN0cmluZzsgcmVzb3VyY2U/OiBVUkk7IHJldmVhbD86ICgpID0+IFByb21pc2U8dm9pZD4gfT47XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBkaXNwYXRjaC5jYWxsKGNvbnRyb2xsZXIsIHByb3ZpZGVyQ2FuZGlkYXRlLnNlc3Npb25JZCwgaW5wdXQsIFtdLCAnUnVuIHRlc3RzJywgeyB1c2VyU2VsZWN0ZWRNb2RlbElkOiAnbW9kZWwnIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUsIHRydWUpO1xuXHRcdGF3YWl0IHJlc3VsdC5yZXZlYWw/LigpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkaXNwYXRjaGVkLFxuXHRcdFx0bG9jYWxBY3F1aXJlQ291bnQsXG5cdFx0XHRwcm92aWRlclJldmVhbENvdW50LFxuXHRcdFx0Y2FsbGJhY2tzLFxuXHRcdFx0aW5wdXQsXG5cdFx0XHRjbGVhcmVkQXR0YWNobWVudHMsXG5cdFx0XHRyZXN1bHQ6IHsgc3RhdHVzOiByZXN1bHQuc3RhdHVzLCByZXNvdXJjZTogcmVzdWx0LnJlc291cmNlPy50b1N0cmluZygpIH0sXG5cdFx0fSwge1xuXHRcdFx0ZGlzcGF0Y2hlZDoge1xuXHRcdFx0XHRjYW5kaWRhdGVJZDogcHJvdmlkZXJDYW5kaWRhdGUuc2Vzc2lvbklkLFxuXHRcdFx0XHRtZXNzYWdlOiAnUnVuIHRlc3RzJyxcblx0XHRcdFx0bW9kZWxJZDogJ21vZGVsJyxcblx0XHRcdH0sXG5cdFx0XHRsb2NhbEFjcXVpcmVDb3VudDogMCxcblx0XHRcdHByb3ZpZGVyUmV2ZWFsQ291bnQ6IDEsXG5cdFx0XHRjYWxsYmFja3M6IFsnd2lsbCcsICdyZXNvbHZlZCddLFxuXHRcdFx0aW5wdXQ6ICcnLFxuXHRcdFx0Y2xlYXJlZEF0dGFjaG1lbnRzOiB0cnVlLFxuXHRcdFx0cmVzdWx0OiB7IHN0YXR1czogJ3NlbnQnLCByZXNvdXJjZTogcHJvdmlkZXJSZXNvdXJjZS50b1N0cmluZygpIH0sXG5cdFx0fSk7XG5cdFx0Y29udHJvbGxlci5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHNlbmQgYW5vdGhlciBwcm92aWRlciBzZXNzaW9uIG1ldGFkYXRhIHRvIHRoZSBDb3BpbG90IHJvdXRlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gKHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLCBwYXRoOiBzdHJpbmcpID0+ICh7XG5cdFx0XHRyZXNvdXJjZTogVVJJLmZyb20oeyBzY2hlbWU6IHByb3ZpZGVyVHlwZSwgcGF0aCB9KSxcblx0XHRcdHByb3ZpZGVyVHlwZSxcblx0XHRcdGxhYmVsOiBwYXRoLFxuXHRcdFx0c3RhdHVzOiB1bmRlZmluZWQsXG5cdFx0XHRpc0FyY2hpdmVkOiAoKSA9PiBmYWxzZSxcblx0XHR9KTtcblx0XHRjb25zdCBhZ2VudFNlc3Npb25zU2VydmljZSA9IHtcblx0XHRcdG1vZGVsOiB7XG5cdFx0XHRcdHJlc29sdmU6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdFx0c2Vzc2lvbnM6IFtcblx0XHRcdFx0XHRzZXNzaW9uKEFnZW50U2Vzc2lvblByb3ZpZGVycy5BZ2VudEhvc3RDb3BpbG90LCAnL2NvcGlsb3QnKSxcblx0XHRcdFx0XHRzZXNzaW9uKEFnZW50U2Vzc2lvblByb3ZpZGVycy5BZ2VudEhvc3RDbGF1ZGUsICcvY2xhdWRlJyksXG5cdFx0XHRcdF0sXG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBDaGF0U2Vzc2lvblJvdXRpbmdDb250cm9sbGVyKFxuXHRcdFx0eyBnZXRPd25TZXNzaW9uUmVzb3VyY2U6ICgpID0+IHVuZGVmaW5lZCB9IGFzIElDaGF0U2Vzc2lvblJvdXRpbmdIb3N0LFxuXHRcdFx0J3Rlc3QnLFxuXHRcdFx0dW5kZWZpbmVkISxcblx0XHRcdGFnZW50U2Vzc2lvbnNTZXJ2aWNlIGFzIG5ldmVyLFxuXHRcdFx0eyBnZXRDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbjogKCkgPT4gKHsgaXNSZWFkT25seTogZmFsc2UgfSkgfSBhcyBuZXZlcixcblx0XHRcdHVuZGVmaW5lZCEsXG5cdFx0XHR1bmRlZmluZWQhLFxuXHRcdFx0eyBpbmZvOiAoKSA9PiB7IH0sIHdhcm46ICgpID0+IHsgfSB9IGFzIG5ldmVyLFxuXHRcdFx0dW5kZWZpbmVkISxcblx0XHRcdHVuZGVmaW5lZCEsXG5cdFx0XHR1bmRlZmluZWQhLFxuXHRcdFx0dW5kZWZpbmVkISxcblx0XHQpO1xuXHRcdGNvbnN0IGNvbGxlY3QgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2NvbGxlY3RDYW5kaWRhdGVTZXNzaW9ucycpIGFzICh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFByb21pc2U8cmVhZG9ubHkgeyBzZXNzaW9uSWQ6IHN0cmluZyB9W10+O1xuXG5cdFx0Y29uc3QgY2FuZGlkYXRlcyA9IGF3YWl0IGNvbGxlY3QuY2FsbChjb250cm9sbGVyLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FuZGlkYXRlcy5tYXAoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5zZXNzaW9uSWQpLCBbJ2FnZW50LWhvc3QtY29waWxvdGNsaTovY29waWxvdCddKTtcblx0XHRjb250cm9sbGVyLmRpc3Bvc2UoKTtcblx0fSk7XG59KTtcblxuZnVuY3Rpb24gZm9sZGVyKG5hbWU6IHN0cmluZywgcGF0aDogc3RyaW5nLCBpbmRleDogbnVtYmVyKTogSVdvcmtzcGFjZUZvbGRlciB7XG5cdGNvbnN0IHVyaSA9IFVSSS5maWxlKHBhdGgpO1xuXHRyZXR1cm4geyB1cmksIG5hbWUsIGluZGV4LCB0b1Jlc291cmNlOiByZWxhdGl2ZVBhdGggPT4gVVJJLmpvaW5QYXRoKHVyaSwgcmVsYXRpdmVQYXRoKSB9O1xufVxuIl0sCiAgIm1hcHBp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
