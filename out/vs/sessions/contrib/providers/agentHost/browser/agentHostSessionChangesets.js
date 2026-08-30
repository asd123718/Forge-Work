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
import { arrayEqualsC, structuralEquals } from "../../../../../base/common/equals.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { constObservable, derived, derivedObservableWithCache, derivedOpts, mapObservableArrayCached, observableFromEvent, observableValue } from "../../../../../base/common/observable.js";
import { basename, extUriBiasedIgnorePathCase, isEqual } from "../../../../../base/common/resources.js";
import { format } from "../../../../../base/common/strings.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { isDefined } from "../../../../../base/common/types.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize } from "../../../../../nls.js";
import { isMultiRootSession } from "../../../../../platform/agentHost/common/agentHostWorkingDirectories.js";
import { ChangesetOperationTargetKind } from "../../../../../platform/agentHost/common/state/protocol/channels-changeset/commands.js";
import { ChangesetOperationScope, ChangesetOperationStatus } from "../../../../../platform/agentHost/common/state/protocol/state.js";
import { ActionType } from "../../../../../platform/agentHost/common/state/sessionActions.js";
import { buildDefaultChatUri, ChangesetStatus, StateComponents } from "../../../../../platform/agentHost/common/state/sessionState.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { SessionChangesetOperationScope, SessionChangesetOperationStatus, sessionFileChangesEqual } from "../../../../services/sessions/common/session.js";
import { isIChatSessionFileChange2 } from "../../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { changesetFileToChange } from "./agentHostDiffs.js";
var ChangesetKind = /* @__PURE__ */ ((ChangesetKind2) => {
  ChangesetKind2["Branch"] = "branch";
  ChangesetKind2["Uncommitted"] = "uncommitted";
  ChangesetKind2["Session"] = "session";
  ChangesetKind2["Turn"] = "turn";
  ChangesetKind2["Compare"] = "compare-turns";
  return ChangesetKind2;
})(ChangesetKind || {});
function sessionFileChangeUri(change) {
  return isIChatSessionFileChange2(change) ? change.uri : change.modifiedUri;
}
function filterChangesToPrimaryWorkingDirectory(changes, workingDirectories) {
  if (!isMultiRootSession(workingDirectories)) {
    return changes;
  }
  const primary = workingDirectories?.[0];
  if (!primary) {
    return changes;
  }
  const primaryWorkingDirectory = URI.parse(primary);
  return changes.filter((change) => extUriBiasedIgnorePathCase.isEqualOrParent(
    primaryWorkingDirectory.with({ path: sessionFileChangeUri(change).path }),
    primaryWorkingDirectory
  ));
}
function createChangesets(sessionUri, options, isActiveSessionObs, changesets) {
  if (!changesets) {
    return [];
  }
  const sessionChangesets = [];
  const defaultChangeset = changesets.find((c) => c.changeKind === "branch" /* Branch */) ?? changesets[0];
  for (const changeset of changesets) {
    const isDefault = changeset === defaultChangeset;
    if (changeset.changeKind === "branch" /* Branch */ || changeset.changeKind === "uncommitted" /* Uncommitted */ || changeset.changeKind === "session" /* Session */) {
      sessionChangesets.push(options.instantiationService.createInstance(AgentHostChangeset, options, isActiveSessionObs, {
        ...changeset,
        isDefault
      }));
    } else if (changeset.changeKind === "turn" /* Turn */) {
      sessionChangesets.push(options.instantiationService.createInstance(AgentHostLastTurnChangeset, sessionUri, options, isActiveSessionObs, {
        ...changeset,
        isDefault
      }));
    }
  }
  return sessionChangesets;
}
function createActiveSessionSubscriptionObs(options, isActiveSessionObs, component, resourceObs) {
  return derived((reader) => {
    const connection = options.getConnection();
    if (!connection) {
      return constObservable(null);
    }
    const resource = resourceObs.read(reader);
    if (!resource) {
      return constObservable(null);
    }
    const isActiveSession = isActiveSessionObs.read(reader);
    if (!isActiveSession) {
      return constObservable(null);
    }
    const subscriptionRef = connection.getSubscription(component, resource, "AgentHostSessionChangesets");
    reader.store.add(subscriptionRef);
    return observableFromEvent(
      subscriptionRef.object.onDidChange,
      () => subscriptionRef.object.value
    );
  });
}
function selectMostRecentChatUri(sessionState, sessionUri) {
  if (!sessionState || sessionState instanceof Error) {
    return URI.parse(buildDefaultChatUri(sessionUri));
  }
  const mostRecentChat = sessionState.chats.reduce(
    (best, c) => !best || c.modifiedAt > best.modifiedAt ? c : best,
    void 0
  );
  return URI.parse(mostRecentChat?.resource ?? sessionState.defaultChat ?? buildDefaultChatUri(sessionUri));
}
function toSessionChangesetOperationScope(scope) {
  switch (scope) {
    case ChangesetOperationScope.Changeset:
      return SessionChangesetOperationScope.Changeset;
    case ChangesetOperationScope.Resource:
      return SessionChangesetOperationScope.Resource;
    case ChangesetOperationScope.Range:
      return SessionChangesetOperationScope.Range;
    default:
      throw new Error(`Unknown ChangesetOperationScope: ${scope}`);
  }
}
function toSessionChangesetOperationStatus(status) {
  switch (status) {
    case ChangesetOperationStatus.Idle:
      return SessionChangesetOperationStatus.Idle;
    case ChangesetOperationStatus.Running:
      return SessionChangesetOperationStatus.Running;
    case ChangesetOperationStatus.Error:
      return SessionChangesetOperationStatus.Error;
    case ChangesetOperationStatus.Disabled:
      return SessionChangesetOperationStatus.Disabled;
    default:
      throw new Error(`Unknown ChangesetOperationStatus: ${status}`);
  }
}
function toSessionChangesetOperation(operation) {
  return {
    id: operation.id,
    label: operation.label,
    description: operation.description,
    icon: operation.icon ? ThemeIcon.fromId(operation.icon) : void 0,
    group: operation.group,
    confirmation: operation.confirmation ? typeof operation.confirmation === "string" ? operation.confirmation : new MarkdownString(operation.confirmation.markdown, {
      isTrusted: false,
      supportThemeIcons: true
    }) : void 0,
    scopes: operation.scopes.map(toSessionChangesetOperationScope),
    status: toSessionChangesetOperationStatus(operation.status)
  };
}
class AbstractAgentHostChangeset {
  constructor(changeset, _options, _dialogService) {
    this._options = _options;
    this._dialogService = _dialogService;
    this.originalCheckpointRef = observableValue(this, void 0);
    this.modifiedCheckpointRef = observableValue(this, void 0);
    this.capabilities = {
      review: changeset.capabilities?.review !== void 0
    };
    this.isLoadingChanges = derived((reader) => {
      const changesetState = this.changesetStateObs.read(reader).read(reader);
      if (changesetState === void 0) {
        return true;
      }
      if (changesetState === null || changesetState instanceof Error) {
        return false;
      }
      return changesetState.status === ChangesetStatus.Computing;
    });
    const mapDiffUri = this._options.mapDiffUri;
    this._changesetFilesObs = derivedObservableWithCache(this, (reader, lastValue) => {
      const changesetState = this.changesetStateObs.read(reader).read(reader);
      if (changesetState === null || changesetState instanceof Error) {
        return [];
      }
      if (changesetState === void 0) {
        return lastValue;
      }
      if (changesetState.status !== ChangesetStatus.Ready && lastValue !== void 0) {
        return lastValue;
      }
      return changesetState.files;
    });
    const mappedChangesObs = mapObservableArrayCached(
      this,
      this._changesetFilesObs.map((files) => files ?? []),
      (file) => changesetFileToChange(file, mapDiffUri)
    );
    const changesObs = derived(this, (reader) => {
      return mappedChangesObs.read(reader).filter(isDefined);
    });
    this.changes = derivedOpts({ equalsFn: sessionFileChangesEqual }, (reader) => {
      return this._filterChanges(changesObs.read(reader) ?? [], reader);
    });
    const operationsObs = derivedObservableWithCache(this, (reader, lastValue) => {
      const changesetState = this.changesetStateObs.read(reader).read(reader);
      if (changesetState === null || changesetState instanceof Error) {
        return [];
      }
      if (changesetState === void 0) {
        return lastValue ?? [];
      }
      return changesetState.operations?.map(toSessionChangesetOperation) ?? [];
    });
    this.operations = derivedOpts({ equalsFn: arrayEqualsC(structuralEquals) }, (reader) => {
      return operationsObs.read(reader) ?? [];
    });
  }
  /**
   * Hook applied to the computed changes before they are published on
   * {@link changes}. The base implementation performs no filtering; subclasses
   * may override to restrict the set (e.g. the "Last Turn Changes" changeset
   * limits multi-root sessions to their primary working directory). Runs inside
   * the {@link changes} derived, so overrides may read observables via `reader`.
   */
  _filterChanges(changes, reader) {
    return changes;
  }
  async invokeOperation(operationId, target) {
    const connection = this._options.getConnection();
    if (!connection) {
      return;
    }
    const channel = this.channelUriObs.get();
    if (!channel) {
      return;
    }
    const operation = this.operations.get().find((o) => o.id === operationId);
    if (operation?.confirmation) {
      const message = typeof operation.confirmation === "string" ? operation.confirmation : operation.confirmation.value;
      const { confirmed } = await this._dialogService.confirm({
        type: "warning",
        message: target?.kind === "resource" ? format(message, basename(target.resource)) : message,
        primaryButton: operation.label
      });
      if (!confirmed) {
        return;
      }
    }
    await connection.invokeChangesetOperation({
      operationId,
      channel: channel.toString(),
      target: target?.kind === "resource" ? {
        kind: ChangesetOperationTargetKind.Resource,
        resource: target.resource.toString()
      } : void 0
    });
  }
  setReviewState(resources, reviewed) {
    if (!this.capabilities.review) {
      return;
    }
    const connection = this._options.getConnection();
    const channel = this.channelUriObs.get();
    if (!connection || !channel) {
      return;
    }
    const files = resources.map((resource) => {
      const file = this._changesetFilesObs.get()?.find((candidate) => {
        const change = changesetFileToChange(candidate, this._options.mapDiffUri);
        return isEqual(change?.modifiedUri, resource) || isEqual(change?.originalUri, resource);
      });
      if (!file) {
        throw new Error(`Resource '${resource.toString()}' is not part of changeset '${this.id}'`);
      }
      return file.id;
    });
    if (files.length === 0) {
      return;
    }
    connection.dispatch(channel.toString(), {
      type: ActionType.ChangesetFilesReviewChanged,
      files,
      reviewed
    });
  }
}
let AgentHostChangeset = class extends AbstractAgentHostChangeset {
  constructor(options, isActiveSessionObs, changesetSummary, dialogService) {
    super(changesetSummary, options, dialogService);
    this.isEnabled = constObservable(true);
    this.channelUriObs = constObservable(URI.parse(changesetSummary.uriTemplate));
    this.changesetStateObs = createActiveSessionSubscriptionObs(
      options,
      isActiveSessionObs,
      StateComponents.Changeset,
      this.channelUriObs
    );
    this.id = changesetSummary.changeKind;
    this._label = changesetSummary.label;
    this._description = changesetSummary.description;
    this.isDefault = constObservable(changesetSummary.isDefault);
  }
  get label() {
    return this._label;
  }
  get description() {
    return this._description;
  }
};
AgentHostChangeset = __decorateClass([
  __decorateParam(3, IDialogService)
], AgentHostChangeset);
let AgentHostLastTurnChangeset = class extends AbstractAgentHostChangeset {
  constructor(sessionUri, options, isActiveSessionObs, changesetSummary, dialogService) {
    super(changesetSummary, options, dialogService);
    this.label = localize("lastTurnChanges", "Last Turn Changes");
    this.description = localize("lastTurnChangesDescription", "Show only changes made in the last turn");
    this.isDefault = observableValue(this, false);
    this.id = changesetSummary.changeKind;
    const sessionStateObs = createActiveSessionSubscriptionObs(
      options,
      isActiveSessionObs,
      StateComponents.Session,
      constObservable(sessionUri)
    );
    this._workingDirectoriesObs = derived((reader) => {
      const sessionState = sessionStateObs.read(reader).read(reader);
      if (!sessionState || sessionState instanceof Error) {
        return void 0;
      }
      return sessionState.workingDirectories;
    });
    const mostRecentChatUriObs = derivedOpts({ equalsFn: isEqual }, (reader) => {
      const sessionState = sessionStateObs.read(reader).read(reader);
      return selectMostRecentChatUri(sessionState, sessionUri);
    });
    const chatStateObs = createActiveSessionSubscriptionObs(
      options,
      isActiveSessionObs,
      StateComponents.Chat,
      mostRecentChatUriObs
    );
    const lastTurnIdObs = derived((reader) => {
      const chatState = chatStateObs.read(reader).read(reader);
      if (!chatState || chatState instanceof Error) {
        return void 0;
      }
      return chatState.activeTurn?.id ?? chatState.turns?.at(-1)?.id;
    });
    this.channelUriObs = derivedOpts({ equalsFn: isEqual }, (reader) => {
      const lastTurnId = lastTurnIdObs.read(reader);
      if (!lastTurnId) {
        return void 0;
      }
      const uri = changesetSummary.uriTemplate.replace("{turnId}", lastTurnId);
      return uri ? URI.parse(uri) : void 0;
    });
    this.changesetStateObs = createActiveSessionSubscriptionObs(
      options,
      isActiveSessionObs,
      StateComponents.Changeset,
      this.channelUriObs
    );
    this.isEnabled = derived((reader) => this.channelUriObs.read(reader) !== void 0);
  }
  /**
   * For multi-root sessions, restrict the last-turn changes to files under the
   * session's primary working directory so the single-root Changes tree in the
   * Agents Window stays renderable. Single-root sessions are unaffected —
   * {@link filterChangesToPrimaryWorkingDirectory} returns the input unchanged.
   */
  _filterChanges(changes, reader) {
    return filterChangesToPrimaryWorkingDirectory(changes, this._workingDirectoriesObs.read(reader));
  }
};
AgentHostLastTurnChangeset = __decorateClass([
  __decorateParam(4, IDialogService)
], AgentHostLastTurnChangeset);
export {
  createActiveSessionSubscriptionObs,
  createChangesets,
  filterChangesToPrimaryWorkingDirectory,
  selectMostRecentChatUri
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxhZ2VudEhvc3RcXGJyb3dzZXJcXGFnZW50SG9zdFNlc3Npb25DaGFuZ2VzZXRzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgYXJyYXlFcXVhbHNDLCBzdHJ1Y3R1cmFsRXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXF1YWxzLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlLCBkZXJpdmVkLCBkZXJpdmVkT2JzZXJ2YWJsZVdpdGhDYWNoZSwgZGVyaXZlZE9wdHMsIElPYnNlcnZhYmxlLCBJUmVhZGVyLCBtYXBPYnNlcnZhYmxlQXJyYXlDYWNoZWQsIG9ic2VydmFibGVGcm9tRXZlbnQsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLCBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGZvcm1hdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGlzRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBpc011bHRpUm9vdFNlc3Npb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdFdvcmtpbmdEaXJlY3Rvcmllcy5qcyc7XG5pbXBvcnQgeyBDaGFuZ2VzZXRPcGVyYXRpb25UYXJnZXRLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jaGFubmVscy1jaGFuZ2VzZXQvY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ2hhbmdlc2V0T3BlcmF0aW9uLCBDaGFuZ2VzZXRPcGVyYXRpb25TY29wZSwgdHlwZSBDaGFuZ2VzZXRGaWxlLCBDaGFuZ2VzZXRPcGVyYXRpb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IGJ1aWxkRGVmYXVsdENoYXRVcmksIENoYW5nZXNldFN0YXR1cywgQ2hhbmdlc2V0LCBTdGF0ZUNvbXBvbmVudHMsIHR5cGUgQ2hhbmdlc2V0U3RhdGUsIHR5cGUgQ2hhdFN0YXRlLCB0eXBlIENoYXRTdW1tYXJ5LCB0eXBlIFNlc3Npb25TdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkNoYW5nZXNldCwgSVNlc3Npb25DaGFuZ2VzZXRDYXBhYmlsaXRpZXMsIElTZXNzaW9uQ2hhbmdlc2V0T3BlcmF0aW9uLCBJU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvblRhcmdldCwgSVNlc3Npb25GaWxlQ2hhbmdlLCBTZXNzaW9uQ2hhbmdlc2V0T3BlcmF0aW9uU2NvcGUsIFNlc3Npb25DaGFuZ2VzZXRPcGVyYXRpb25TdGF0dXMsIHNlc3Npb25GaWxlQ2hhbmdlc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgaXNJQ2hhdFNlc3Npb25GaWxlQ2hhbmdlMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgY2hhbmdlc2V0RmlsZVRvQ2hhbmdlIH0gZnJvbSAnLi9hZ2VudEhvc3REaWZmcy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0QWRhcHRlck9wdGlvbnMgfSBmcm9tICcuL2Jhc2VBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLmpzJztcblxuY29uc3QgZW51bSBDaGFuZ2VzZXRLaW5kIHtcblx0QnJhbmNoID0gJ2JyYW5jaCcsXG5cdFVuY29tbWl0dGVkID0gJ3VuY29tbWl0dGVkJyxcblx0U2Vzc2lvbiA9ICdzZXNzaW9uJyxcblx0VHVybiA9ICd0dXJuJyxcblx0Q29tcGFyZSA9ICdjb21wYXJlLXR1cm5zJyxcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSB3b3Jrc3BhY2UgZmlsZSBVUkkgdGhhdCBpZGVudGlmaWVzIGEgY2hhbmdlLCBtYXRjaGluZyB0aGVcbiAqIGNvbnZlbnRpb24gdXNlZCBieSB7QGxpbmsgc2Vzc2lvbkZpbGVDaGFuZ2VzRXF1YWx9OiB0aGUgYHVyaWAgb2YgYVxuICoge0BsaW5rIElDaGF0U2Vzc2lvbkZpbGVDaGFuZ2UyfSAoYWx3YXlzIHByZXNlbnQsIGluY2x1ZGluZyBmb3IgZGVsZXRpb25zKSBvclxuICogdGhlIGBtb2RpZmllZFVyaWAgb2YgYSBsZWdhY3kgYElDaGF0U2Vzc2lvbkZpbGVDaGFuZ2VgLiBVc2luZyBgdXJpYCBcdTIwMTQgcmF0aGVyXG4gKiB0aGFuIGBtb2RpZmllZFVyaSA/PyBvcmlnaW5hbFVyaWAgXHUyMDE0IGlzIGltcG9ydGFudCBmb3IgZGVsZXRpb25zLCB3aG9zZVxuICogYG1vZGlmaWVkVXJpYCBpcyBhYnNlbnQgYW5kIHdob3NlIGBvcmlnaW5hbFVyaWAgcG9pbnRzIGF0IGEgcHJlLWVkaXQgY29udGVudFxuICogc25hcHNob3QgcmF0aGVyIHRoYW4gdGhlIHdvcmtzcGFjZSBwYXRoLlxuICovXG5mdW5jdGlvbiBzZXNzaW9uRmlsZUNoYW5nZVVyaShjaGFuZ2U6IElTZXNzaW9uRmlsZUNoYW5nZSk6IFVSSSB7XG5cdHJldHVybiBpc0lDaGF0U2Vzc2lvbkZpbGVDaGFuZ2UyKGNoYW5nZSkgPyBjaGFuZ2UudXJpIDogY2hhbmdlLm1vZGlmaWVkVXJpO1xufVxuXG4vKipcbiAqIEZvciBtdWx0aS1yb290IHNlc3Npb25zLCBrZWVwcyBvbmx5IGNoYW5nZXMgdW5kZXIgdGhlIHByaW1hcnkgd29ya2luZ1xuICogZGlyZWN0b3J5IChgd29ya2luZ0RpcmVjdG9yaWVzWzBdYCk7IHNpbmdsZS1yb290L2VtcHR5L2B1bmRlZmluZWRgIGlucHV0cyBhcmVcbiAqIHJldHVybmVkIHVuY2hhbmdlZC4gUGF0aHMgYXJlIGNvbXBhcmVkIG9uIHRoZSBwcmltYXJ5J3MgYGZpbGU6YCBzY2hlbWUgc29cbiAqIGBhZ2VudC1ob3N0OmAtd3JhcHBlZCBjaGFuZ2VzIHN0aWxsIG1hdGNoIGFuZCBPUyBwYXRoLWNhc2luZyBpcyByZXNwZWN0ZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaWx0ZXJDaGFuZ2VzVG9QcmltYXJ5V29ya2luZ0RpcmVjdG9yeShcblx0Y2hhbmdlczogcmVhZG9ubHkgSVNlc3Npb25GaWxlQ2hhbmdlW10sXG5cdHdvcmtpbmdEaXJlY3RvcmllczogcmVhZG9ubHkgc3RyaW5nW10gfCB1bmRlZmluZWRcbik6IHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdIHtcblx0aWYgKCFpc011bHRpUm9vdFNlc3Npb24od29ya2luZ0RpcmVjdG9yaWVzKSkge1xuXHRcdHJldHVybiBjaGFuZ2VzO1xuXHR9XG5cblx0Y29uc3QgcHJpbWFyeSA9IHdvcmtpbmdEaXJlY3Rvcmllcz8uWzBdO1xuXHRpZiAoIXByaW1hcnkpIHtcblx0XHRyZXR1cm4gY2hhbmdlcztcblx0fVxuXG5cdGNvbnN0IHByaW1hcnlXb3JraW5nRGlyZWN0b3J5ID0gVVJJLnBhcnNlKHByaW1hcnkpO1xuXHRyZXR1cm4gY2hhbmdlcy5maWx0ZXIoY2hhbmdlID0+XG5cdFx0ZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuaXNFcXVhbE9yUGFyZW50KFxuXHRcdFx0cHJpbWFyeVdvcmtpbmdEaXJlY3Rvcnkud2l0aCh7IHBhdGg6IHNlc3Npb25GaWxlQ2hhbmdlVXJpKGNoYW5nZSkucGF0aCB9KSxcblx0XHRcdHByaW1hcnlXb3JraW5nRGlyZWN0b3J5KSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVDaGFuZ2VzZXRzKFxuXHRzZXNzaW9uVXJpOiBVUkksXG5cdG9wdGlvbnM6IElBZ2VudEhvc3RBZGFwdGVyT3B0aW9ucyxcblx0aXNBY3RpdmVTZXNzaW9uT2JzOiBJT2JzZXJ2YWJsZTxib29sZWFuPixcblx0Y2hhbmdlc2V0czogcmVhZG9ubHkgQ2hhbmdlc2V0W10gfCB1bmRlZmluZWRcbik6IHJlYWRvbmx5IElTZXNzaW9uQ2hhbmdlc2V0W10ge1xuXHRpZiAoIWNoYW5nZXNldHMpIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRjb25zdCBzZXNzaW9uQ2hhbmdlc2V0czogSVNlc3Npb25DaGFuZ2VzZXRbXSA9IFtdO1xuXG5cdC8vIFNlbGVjdCB0aGUgXCJCcmFuY2ggQ2hhbmdlc1wiIGNoYW5nZXNldCBhcyB0aGUgZGVmYXVsdCwgaWYgaXQgZXhpc3RzOyBvdGhlcndpc2UganVzdCB0aGUgZmlyc3Qgb25lLlxuXHRjb25zdCBkZWZhdWx0Q2hhbmdlc2V0ID0gY2hhbmdlc2V0cy5maW5kKGMgPT4gYy5jaGFuZ2VLaW5kID09PSBDaGFuZ2VzZXRLaW5kLkJyYW5jaCkgPz8gY2hhbmdlc2V0c1swXTtcblxuXHRmb3IgKGNvbnN0IGNoYW5nZXNldCBvZiBjaGFuZ2VzZXRzKSB7XG5cdFx0Y29uc3QgaXNEZWZhdWx0ID0gY2hhbmdlc2V0ID09PSBkZWZhdWx0Q2hhbmdlc2V0O1xuXG5cdFx0aWYgKFxuXHRcdFx0Y2hhbmdlc2V0LmNoYW5nZUtpbmQgPT09IENoYW5nZXNldEtpbmQuQnJhbmNoIHx8XG5cdFx0XHRjaGFuZ2VzZXQuY2hhbmdlS2luZCA9PT0gQ2hhbmdlc2V0S2luZC5VbmNvbW1pdHRlZCB8fFxuXHRcdFx0Y2hhbmdlc2V0LmNoYW5nZUtpbmQgPT09IENoYW5nZXNldEtpbmQuU2Vzc2lvblxuXHRcdCkge1xuXHRcdFx0Ly8gQnJhbmNoIENoYW5nZXMsIFVuY29tbWl0dGVkIENoYW5nZXMsIGFuZCBTZXNzaW9uIENoYW5nZXNcblx0XHRcdHNlc3Npb25DaGFuZ2VzZXRzLnB1c2gob3B0aW9ucy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RDaGFuZ2VzZXQsIG9wdGlvbnMsIGlzQWN0aXZlU2Vzc2lvbk9icywge1xuXHRcdFx0XHQuLi5jaGFuZ2VzZXQsIGlzRGVmYXVsdFxuXHRcdFx0fSkpO1xuXHRcdH0gZWxzZSBpZiAoY2hhbmdlc2V0LmNoYW5nZUtpbmQgPT09IENoYW5nZXNldEtpbmQuVHVybikge1xuXHRcdFx0Ly8gTGFzdCBUdXJuIENoYW5nZXNcblx0XHRcdHNlc3Npb25DaGFuZ2VzZXRzLnB1c2gob3B0aW9ucy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RMYXN0VHVybkNoYW5nZXNldCwgc2Vzc2lvblVyaSwgb3B0aW9ucywgaXNBY3RpdmVTZXNzaW9uT2JzLCB7XG5cdFx0XHRcdC4uLmNoYW5nZXNldCwgaXNEZWZhdWx0XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHNlc3Npb25DaGFuZ2VzZXRzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQWN0aXZlU2Vzc2lvblN1YnNjcmlwdGlvbk9iczxUPihcblx0b3B0aW9uczogSUFnZW50SG9zdEFkYXB0ZXJPcHRpb25zLFxuXHRpc0FjdGl2ZVNlc3Npb25PYnM6IElPYnNlcnZhYmxlPGJvb2xlYW4+LFxuXHRjb21wb25lbnQ6IFN0YXRlQ29tcG9uZW50cyxcblx0cmVzb3VyY2VPYnM6IElPYnNlcnZhYmxlPFVSSSB8IHVuZGVmaW5lZD4sXG4pOiBJT2JzZXJ2YWJsZTxJT2JzZXJ2YWJsZTxUIHwgRXJyb3IgfCB1bmRlZmluZWQgfCBudWxsPj4ge1xuXHRyZXR1cm4gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBvcHRpb25zLmdldENvbm5lY3Rpb24oKTtcblx0XHRpZiAoIWNvbm5lY3Rpb24pIHtcblx0XHRcdHJldHVybiBjb25zdE9ic2VydmFibGUobnVsbCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSByZXNvdXJjZU9icy5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCFyZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIGNvbnN0T2JzZXJ2YWJsZShudWxsKTtcblx0XHR9XG5cblx0XHRjb25zdCBpc0FjdGl2ZVNlc3Npb24gPSBpc0FjdGl2ZVNlc3Npb25PYnMucmVhZChyZWFkZXIpO1xuXHRcdGlmICghaXNBY3RpdmVTZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm4gY29uc3RPYnNlcnZhYmxlKG51bGwpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN1YnNjcmlwdGlvblJlZiA9IGNvbm5lY3Rpb24uZ2V0U3Vic2NyaXB0aW9uKGNvbXBvbmVudCwgcmVzb3VyY2UsICdBZ2VudEhvc3RTZXNzaW9uQ2hhbmdlc2V0cycpO1xuXHRcdHJlYWRlci5zdG9yZS5hZGQoc3Vic2NyaXB0aW9uUmVmKTtcblxuXHRcdHJldHVybiBvYnNlcnZhYmxlRnJvbUV2ZW50KHN1YnNjcmlwdGlvblJlZi5vYmplY3Qub25EaWRDaGFuZ2UsXG5cdFx0XHQoKSA9PiBzdWJzY3JpcHRpb25SZWYub2JqZWN0LnZhbHVlIGFzIFQgfCBFcnJvciB8IHVuZGVmaW5lZCk7XG5cdH0pO1xufVxuXG4vKipcbiAqIFNlbGVjdHMgdGhlIFVSSSBvZiB0aGUgc2Vzc2lvbidzIG1vc3QgcmVjZW50bHkgbW9kaWZpZWQgY2hhdCBcdTIwMTQgdGhlIG9uZSB0aGF0XG4gKiBob2xkcyB0aGUgc2Vzc2lvbidzIFwibGFzdCB0dXJuXCIuIEZhbGxzIGJhY2sgdG8gdGhlIHNlc3Npb24ncyBkZWZhdWx0IGNoYXQgKG9yXG4gKiB0aGUgc3ludGhlc2l6ZWQgZGVmYXVsdCBjaGF0IFVSSSkgd2hlbiB0aGUgc3RhdGUgaXMgYWJzZW50L2Vycm9yZWQgb3Igbm8gY2hhdFxuICogaXMgbW9yZSByZWNlbnQuXG4gKlxuICogU2hhcmVkIGJ5IHtAbGluayBBZ2VudEhvc3RMYXN0VHVybkNoYW5nZXNldH0gYW5kIHRoZSBvdXRwdXQtc3RyZWFtLWRlcml2ZWRcbiAqIGxhc3QtdHVybiBjaGFuZ2VzIHNvIHRoZSBcIkxhc3QgVHVybiBDaGFuZ2VzXCIgY2hhbmdlc2V0IGFuZCB0aGUgY2hhdCBpbnB1dFxuICogc3RhdHVzIHBpbGxzIGFsd2F5cyByZXNvbHZlIHRoZSBzYW1lIGNoYXQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZWxlY3RNb3N0UmVjZW50Q2hhdFVyaShzZXNzaW9uU3RhdGU6IFNlc3Npb25TdGF0ZSB8IEVycm9yIHwgdW5kZWZpbmVkIHwgbnVsbCwgc2Vzc2lvblVyaTogVVJJKTogVVJJIHtcblx0aWYgKCFzZXNzaW9uU3RhdGUgfHwgc2Vzc2lvblN0YXRlIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRyZXR1cm4gVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSkpO1xuXHR9XG5cblx0Ly8gYG1vZGlmaWVkQXRgIGlzIElTTyA4NjAxLCBzbyBsZXhpY29ncmFwaGljIGNvbXBhcmUgaXMgY2hyb25vbG9naWNhbC5cblx0Y29uc3QgbW9zdFJlY2VudENoYXQgPSBzZXNzaW9uU3RhdGUuY2hhdHMucmVkdWNlPENoYXRTdW1tYXJ5IHwgdW5kZWZpbmVkPihcblx0XHQoYmVzdCwgYykgPT4gIWJlc3QgfHwgYy5tb2RpZmllZEF0ID4gYmVzdC5tb2RpZmllZEF0ID8gYyA6IGJlc3QsXG5cdFx0dW5kZWZpbmVkXG5cdCk7XG5cdHJldHVybiBVUkkucGFyc2UobW9zdFJlY2VudENoYXQ/LnJlc291cmNlID8/IHNlc3Npb25TdGF0ZS5kZWZhdWx0Q2hhdCA/PyBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpKTtcbn1cblxuZnVuY3Rpb24gdG9TZXNzaW9uQ2hhbmdlc2V0T3BlcmF0aW9uU2NvcGUoc2NvcGU6IENoYW5nZXNldE9wZXJhdGlvblNjb3BlKTogU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvblNjb3BlIHtcblx0c3dpdGNoIChzY29wZSkge1xuXHRcdGNhc2UgQ2hhbmdlc2V0T3BlcmF0aW9uU2NvcGUuQ2hhbmdlc2V0OiByZXR1cm4gU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvblNjb3BlLkNoYW5nZXNldDtcblx0XHRjYXNlIENoYW5nZXNldE9wZXJhdGlvblNjb3BlLlJlc291cmNlOiByZXR1cm4gU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvblNjb3BlLlJlc291cmNlO1xuXHRcdGNhc2UgQ2hhbmdlc2V0T3BlcmF0aW9uU2NvcGUuUmFuZ2U6IHJldHVybiBTZXNzaW9uQ2hhbmdlc2V0T3BlcmF0aW9uU2NvcGUuUmFuZ2U7XG5cdFx0ZGVmYXVsdDogdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIENoYW5nZXNldE9wZXJhdGlvblNjb3BlOiAke3Njb3BlfWApO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHRvU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvblN0YXR1cyhzdGF0dXM6IENoYW5nZXNldE9wZXJhdGlvblN0YXR1cyk6IFNlc3Npb25DaGFuZ2VzZXRPcGVyYXRpb25TdGF0dXMge1xuXHRzd2l0Y2ggKHN0YXR1cykge1xuXHRcdGNhc2UgQ2hhbmdlc2V0T3BlcmF0aW9uU3RhdHVzLklkbGU6IHJldHVybiBTZXNzaW9uQ2hhbmdlc2V0T3BlcmF0aW9uU3RhdHVzLklkbGU7XG5cdFx0Y2FzZSBDaGFuZ2VzZXRPcGVyYXRpb25TdGF0dXMuUnVubmluZzogcmV0dXJuIFNlc3Npb25DaGFuZ2VzZXRPcGVyYXRpb25TdGF0dXMuUnVubmluZztcblx0XHRjYXNlIENoYW5nZXNldE9wZXJhdGlvblN0YXR1cy5FcnJvcjogcmV0dXJuIFNlc3Npb25DaGFuZ2VzZXRPcGVyYXRpb25TdGF0dXMuRXJyb3I7XG5cdFx0Y2FzZSBDaGFuZ2VzZXRPcGVyYXRpb25TdGF0dXMuRGlzYWJsZWQ6IHJldHVybiBTZXNzaW9uQ2hhbmdlc2V0T3BlcmF0aW9uU3RhdHVzLkRpc2FibGVkO1xuXHRcdGRlZmF1bHQ6IHRocm93IG5ldyBFcnJvcihgVW5rbm93biBDaGFuZ2VzZXRPcGVyYXRpb25TdGF0dXM6ICR7c3RhdHVzfWApO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHRvU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvbihvcGVyYXRpb246IENoYW5nZXNldE9wZXJhdGlvbik6IElTZXNzaW9uQ2hhbmdlc2V0T3BlcmF0aW9uIHtcblx0cmV0dXJuIHtcblx0XHRpZDogb3BlcmF0aW9uLmlkLFxuXHRcdGxhYmVsOiBvcGVyYXRpb24ubGFiZWwsXG5cdFx0ZGVzY3JpcHRpb246IG9wZXJhdGlvbi5kZXNjcmlwdGlvbixcblx0XHRpY29uOiBvcGVyYXRpb24uaWNvblxuXHRcdFx0PyBUaGVtZUljb24uZnJvbUlkKG9wZXJhdGlvbi5pY29uKVxuXHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0Z3JvdXA6IG9wZXJhdGlvbi5ncm91cCxcblx0XHRjb25maXJtYXRpb246IG9wZXJhdGlvbi5jb25maXJtYXRpb25cblx0XHRcdD8gdHlwZW9mIG9wZXJhdGlvbi5jb25maXJtYXRpb24gPT09ICdzdHJpbmcnXG5cdFx0XHRcdD8gb3BlcmF0aW9uLmNvbmZpcm1hdGlvblxuXHRcdFx0XHQ6IG5ldyBNYXJrZG93blN0cmluZyhvcGVyYXRpb24uY29uZmlybWF0aW9uLm1hcmtkb3duLCB7XG5cdFx0XHRcdFx0aXNUcnVzdGVkOiBmYWxzZSwgc3VwcG9ydFRoZW1lSWNvbnM6IHRydWVcblx0XHRcdFx0fSlcblx0XHRcdDogdW5kZWZpbmVkLFxuXHRcdHNjb3Blczogb3BlcmF0aW9uLnNjb3Blcy5tYXAodG9TZXNzaW9uQ2hhbmdlc2V0T3BlcmF0aW9uU2NvcGUpLFxuXHRcdHN0YXR1czogdG9TZXNzaW9uQ2hhbmdlc2V0T3BlcmF0aW9uU3RhdHVzKG9wZXJhdGlvbi5zdGF0dXMpLFxuXHR9O1xufVxuXG5hYnN0cmFjdCBjbGFzcyBBYnN0cmFjdEFnZW50SG9zdENoYW5nZXNldCBpbXBsZW1lbnRzIElTZXNzaW9uQ2hhbmdlc2V0IHtcblx0YWJzdHJhY3QgcmVhZG9ubHkgaWQ6IHN0cmluZztcblx0YWJzdHJhY3QgcmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0YWJzdHJhY3QgcmVhZG9ubHkgZGVzY3JpcHRpb246IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRhYnN0cmFjdCByZWFkb25seSBpc0VuYWJsZWQ6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXHRhYnN0cmFjdCByZWFkb25seSBpc0RlZmF1bHQ6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXG5cdHJlYWRvbmx5IG9yaWdpbmFsQ2hlY2twb2ludFJlZiA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB1bmRlZmluZWQpO1xuXHRyZWFkb25seSBtb2RpZmllZENoZWNrcG9pbnRSZWYgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgdW5kZWZpbmVkKTtcblxuXHRyZWFkb25seSBpc0xvYWRpbmdDaGFuZ2VzOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0cmVhZG9ubHkgY2hhbmdlczogSU9ic2VydmFibGU8cmVhZG9ubHkgSVNlc3Npb25GaWxlQ2hhbmdlW10+O1xuXHRyZWFkb25seSBvcGVyYXRpb25zOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvbltdPjtcblxuXHRyZWFkb25seSBjYXBhYmlsaXRpZXM6IElTZXNzaW9uQ2hhbmdlc2V0Q2FwYWJpbGl0aWVzO1xuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCByZWFkb25seSBjaGFubmVsVXJpT2JzOiBJT2JzZXJ2YWJsZTxVUkkgfCB1bmRlZmluZWQ+O1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgcmVhZG9ubHkgY2hhbmdlc2V0U3RhdGVPYnM6IElPYnNlcnZhYmxlPElPYnNlcnZhYmxlPENoYW5nZXNldFN0YXRlIHwgRXJyb3IgfCB1bmRlZmluZWQgfCBudWxsPj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYW5nZXNldEZpbGVzT2JzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBDaGFuZ2VzZXRGaWxlW10gfCB1bmRlZmluZWQ+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNoYW5nZXNldDogQ2hhbmdlc2V0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29wdGlvbnM6IElBZ2VudEhvc3RBZGFwdGVyT3B0aW9ucyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5jYXBhYmlsaXRpZXMgPSB7XG5cdFx0XHRyZXZpZXc6IGNoYW5nZXNldC5jYXBhYmlsaXRpZXM/LnJldmlldyAhPT0gdW5kZWZpbmVkXG5cdFx0fSBzYXRpc2ZpZXMgSVNlc3Npb25DaGFuZ2VzZXRDYXBhYmlsaXRpZXM7XG5cblx0XHR0aGlzLmlzTG9hZGluZ0NoYW5nZXMgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBjaGFuZ2VzZXRTdGF0ZSA9IHRoaXMuY2hhbmdlc2V0U3RhdGVPYnMucmVhZChyZWFkZXIpLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0Ly8gSWYgdGhlIGNoYW5nZXNldCBzdGF0ZSBpcyBgdW5kZWZpbmVkYCwgaXQgbWVhbnMgdGhhdCB0aGUgZmlyc3Qgc25hcHNob3Rcblx0XHRcdC8vIGhhcyBub3QgeWV0IGFycml2ZWQsIHNvIGluIG9yZGVyIHRvIGF2b2lkIGFueSBmbGlja2VyaW5nIGluIHRoZSBDaGFuZ2VzXG5cdFx0XHQvLyB2aWV3LCB3ZSBjb25zaWRlciB0aGlzIHRlbXBvcmFyeSBzdGF0ZSBhcyBpZiB0aGUgY2hhbmdlcyBhcmUgc3RpbGwgYmVpbmdcblx0XHRcdC8vIGNvbXB1dGVkLlxuXHRcdFx0aWYgKGNoYW5nZXNldFN0YXRlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjaGFuZ2VzZXRTdGF0ZSA9PT0gbnVsbCB8fCBjaGFuZ2VzZXRTdGF0ZSBpbnN0YW5jZW9mIEVycm9yKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRm9yIHN0YXRpYyBjaGFuZ2VzZXRzLCB0aGF0IGFyZSBwZXJzaXN0ZWQgdG8gdGhlIGRhdGFiYXNlLCB0aGVcblx0XHRcdC8vIGNhY2hlZCBzdGF0ZSB3aWxsIGJlIHNlbnQgb3ZlciB0aGUgd2lyZSB3aGlsZSB0aGUgY2hhbmdlc2V0IGlzXG5cdFx0XHQvLyBiZWluZyBjb21wdXRlZC5cblx0XHRcdHJldHVybiBjaGFuZ2VzZXRTdGF0ZS5zdGF0dXMgPT09IENoYW5nZXNldFN0YXR1cy5Db21wdXRpbmc7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBtYXBEaWZmVXJpID0gdGhpcy5fb3B0aW9ucy5tYXBEaWZmVXJpO1xuXG5cdFx0Ly8gSG9sZCB0aGUgcmF3IGBDaGFuZ2VzZXRGaWxlW11gICh3aXRoIGxhc3QtdmFsdWUgc2VtYW50aWNzKSBzbyB1bmNoYW5nZWRcblx0XHQvLyBmaWxlcyBrZWVwIHRoZWlyIHJlZmVyZW5jZSBhY3Jvc3MgcmVkdWNlciB1cGRhdGVzLCBlbmFibGluZyB0aGVcblx0XHQvLyBwZXItZmlsZSBjYWNoZSBiZWxvdyB0byBza2lwIHJlYnVpbGRpbmcgdGhlbS5cblx0XHR0aGlzLl9jaGFuZ2VzZXRGaWxlc09icyA9IGRlcml2ZWRPYnNlcnZhYmxlV2l0aENhY2hlPHJlYWRvbmx5IENoYW5nZXNldEZpbGVbXSB8IHVuZGVmaW5lZD4odGhpcywgKHJlYWRlciwgbGFzdFZhbHVlKSA9PiB7XG5cdFx0XHRjb25zdCBjaGFuZ2VzZXRTdGF0ZSA9IHRoaXMuY2hhbmdlc2V0U3RhdGVPYnMucmVhZChyZWFkZXIpLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChjaGFuZ2VzZXRTdGF0ZSA9PT0gbnVsbCB8fCBjaGFuZ2VzZXRTdGF0ZSBpbnN0YW5jZW9mIEVycm9yKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNoYW5nZXNldFN0YXRlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIGxhc3RWYWx1ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVuZGVyIGBzdGF0ZS5maWxlc2Agd2hlbiB0aGUgY2hhbmdlc2V0IGlzIGBSZWFkeWAsIG9yIG9uIHRoZSB2ZXJ5XG5cdFx0XHQvLyBmaXJzdCBhcnJpdmFsICh0aGUgaW5pdGlhbCBzbmFwc2hvdCBjb250YWlucyB0aGUgZmlsZSBsaXN0IHBlcnNpc3RlZFxuXHRcdFx0Ly8gZnJvbSB0aGUgcHJldmlvdXMgc2Vzc2lvbikuXG5cdFx0XHRpZiAoY2hhbmdlc2V0U3RhdGUuc3RhdHVzICE9PSBDaGFuZ2VzZXRTdGF0dXMuUmVhZHkgJiYgbGFzdFZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIGxhc3RWYWx1ZTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGNoYW5nZXNldFN0YXRlLmZpbGVzO1xuXHRcdH0pO1xuXG5cdFx0Ly8gQnVpbGQgb25lIGNoYW5nZSBwZXIgZmlsZSwgcmV1c2luZyB0aGUgY2FjaGVkIHJlc3VsdCBmb3IgZmlsZXMgd2hvc2Vcblx0XHQvLyBgQ2hhbmdlc2V0RmlsZWAgcmVmZXJlbmNlIGlzIHVuY2hhbmdlZCBzbyBvbmx5IGNoYW5nZWQgZmlsZXMgYXJlXG5cdFx0Ly8gcmUtcGFyc2VkIGFuZCByZS1tYXBwZWQuXG5cdFx0Y29uc3QgbWFwcGVkQ2hhbmdlc09icyA9IG1hcE9ic2VydmFibGVBcnJheUNhY2hlZCh0aGlzLFxuXHRcdFx0dGhpcy5fY2hhbmdlc2V0RmlsZXNPYnMubWFwKGZpbGVzID0+IGZpbGVzID8/IFtdKSxcblx0XHRcdGZpbGUgPT4gY2hhbmdlc2V0RmlsZVRvQ2hhbmdlKGZpbGUsIG1hcERpZmZVcmkpKTtcblxuXHRcdGNvbnN0IGNoYW5nZXNPYnMgPSBkZXJpdmVkPHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdIHwgdW5kZWZpbmVkPih0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0cmV0dXJuIG1hcHBlZENoYW5nZXNPYnMucmVhZChyZWFkZXIpLmZpbHRlcihpc0RlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5jaGFuZ2VzID0gZGVyaXZlZE9wdHMoeyBlcXVhbHNGbjogc2Vzc2lvbkZpbGVDaGFuZ2VzRXF1YWwgfSwgcmVhZGVyID0+IHtcblx0XHRcdHJldHVybiB0aGlzLl9maWx0ZXJDaGFuZ2VzKGNoYW5nZXNPYnMucmVhZChyZWFkZXIpID8/IFtdLCByZWFkZXIpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgb3BlcmF0aW9uc09icyA9IGRlcml2ZWRPYnNlcnZhYmxlV2l0aENhY2hlPHJlYWRvbmx5IElTZXNzaW9uQ2hhbmdlc2V0T3BlcmF0aW9uW10+KHRoaXMsIChyZWFkZXIsIGxhc3RWYWx1ZSkgPT4ge1xuXHRcdFx0Y29uc3QgY2hhbmdlc2V0U3RhdGUgPSB0aGlzLmNoYW5nZXNldFN0YXRlT2JzLnJlYWQocmVhZGVyKS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoY2hhbmdlc2V0U3RhdGUgPT09IG51bGwgfHwgY2hhbmdlc2V0U3RhdGUgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjaGFuZ2VzZXRTdGF0ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiBsYXN0VmFsdWUgPz8gW107XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBjaGFuZ2VzZXRTdGF0ZS5vcGVyYXRpb25zPy5tYXAodG9TZXNzaW9uQ2hhbmdlc2V0T3BlcmF0aW9uKSA/PyBbXTtcblx0XHR9KTtcblxuXHRcdHRoaXMub3BlcmF0aW9ucyA9IGRlcml2ZWRPcHRzKHsgZXF1YWxzRm46IGFycmF5RXF1YWxzQyhzdHJ1Y3R1cmFsRXF1YWxzKSB9LCByZWFkZXIgPT4ge1xuXHRcdFx0cmV0dXJuIG9wZXJhdGlvbnNPYnMucmVhZChyZWFkZXIpID8/IFtdO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhvb2sgYXBwbGllZCB0byB0aGUgY29tcHV0ZWQgY2hhbmdlcyBiZWZvcmUgdGhleSBhcmUgcHVibGlzaGVkIG9uXG5cdCAqIHtAbGluayBjaGFuZ2VzfS4gVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gcGVyZm9ybXMgbm8gZmlsdGVyaW5nOyBzdWJjbGFzc2VzXG5cdCAqIG1heSBvdmVycmlkZSB0byByZXN0cmljdCB0aGUgc2V0IChlLmcuIHRoZSBcIkxhc3QgVHVybiBDaGFuZ2VzXCIgY2hhbmdlc2V0XG5cdCAqIGxpbWl0cyBtdWx0aS1yb290IHNlc3Npb25zIHRvIHRoZWlyIHByaW1hcnkgd29ya2luZyBkaXJlY3RvcnkpLiBSdW5zIGluc2lkZVxuXHQgKiB0aGUge0BsaW5rIGNoYW5nZXN9IGRlcml2ZWQsIHNvIG92ZXJyaWRlcyBtYXkgcmVhZCBvYnNlcnZhYmxlcyB2aWEgYHJlYWRlcmAuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX2ZpbHRlckNoYW5nZXMoY2hhbmdlczogcmVhZG9ubHkgSVNlc3Npb25GaWxlQ2hhbmdlW10sIHJlYWRlcjogSVJlYWRlcik6IHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdIHtcblx0XHRyZXR1cm4gY2hhbmdlcztcblx0fVxuXG5cdGFzeW5jIGludm9rZU9wZXJhdGlvbihvcGVyYXRpb25JZDogc3RyaW5nLCB0YXJnZXQ/OiBJU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvblRhcmdldCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLl9vcHRpb25zLmdldENvbm5lY3Rpb24oKTtcblx0XHRpZiAoIWNvbm5lY3Rpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjaGFubmVsID0gdGhpcy5jaGFubmVsVXJpT2JzLmdldCgpO1xuXHRcdGlmICghY2hhbm5lbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9wZXJhdGlvbiA9IHRoaXMub3BlcmF0aW9ucy5nZXQoKS5maW5kKG8gPT4gby5pZCA9PT0gb3BlcmF0aW9uSWQpO1xuXHRcdGlmIChvcGVyYXRpb24/LmNvbmZpcm1hdGlvbikge1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IHR5cGVvZiBvcGVyYXRpb24uY29uZmlybWF0aW9uID09PSAnc3RyaW5nJ1xuXHRcdFx0XHQ/IG9wZXJhdGlvbi5jb25maXJtYXRpb25cblx0XHRcdFx0OiBvcGVyYXRpb24uY29uZmlybWF0aW9uLnZhbHVlO1xuXHRcdFx0Y29uc3QgeyBjb25maXJtZWQgfSA9IGF3YWl0IHRoaXMuX2RpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRcdHR5cGU6ICd3YXJuaW5nJyxcblx0XHRcdFx0bWVzc2FnZTogdGFyZ2V0Py5raW5kID09PSAncmVzb3VyY2UnXG5cdFx0XHRcdFx0PyBmb3JtYXQobWVzc2FnZSwgYmFzZW5hbWUodGFyZ2V0LnJlc291cmNlKSlcblx0XHRcdFx0XHQ6IG1lc3NhZ2UsXG5cdFx0XHRcdHByaW1hcnlCdXR0b246IG9wZXJhdGlvbi5sYWJlbCxcblx0XHRcdH0pO1xuXHRcdFx0aWYgKCFjb25maXJtZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGF3YWl0IGNvbm5lY3Rpb24uaW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uKHtcblx0XHRcdG9wZXJhdGlvbklkLFxuXHRcdFx0Y2hhbm5lbDogY2hhbm5lbC50b1N0cmluZygpLFxuXHRcdFx0dGFyZ2V0OiB0YXJnZXQ/LmtpbmQgPT09ICdyZXNvdXJjZSdcblx0XHRcdFx0PyB7XG5cdFx0XHRcdFx0a2luZDogQ2hhbmdlc2V0T3BlcmF0aW9uVGFyZ2V0S2luZC5SZXNvdXJjZSxcblx0XHRcdFx0XHRyZXNvdXJjZTogdGFyZ2V0LnJlc291cmNlLnRvU3RyaW5nKClcblx0XHRcdFx0fVxuXHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fVxuXG5cdHNldFJldmlld1N0YXRlKHJlc291cmNlczogcmVhZG9ubHkgVVJJW10sIHJldmlld2VkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmNhcGFiaWxpdGllcy5yZXZpZXcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5fb3B0aW9ucy5nZXRDb25uZWN0aW9uKCk7XG5cdFx0Y29uc3QgY2hhbm5lbCA9IHRoaXMuY2hhbm5lbFVyaU9icy5nZXQoKTtcblx0XHRpZiAoIWNvbm5lY3Rpb24gfHwgIWNoYW5uZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmaWxlcyA9IHJlc291cmNlcy5tYXAocmVzb3VyY2UgPT4ge1xuXHRcdFx0Y29uc3QgZmlsZSA9IHRoaXMuX2NoYW5nZXNldEZpbGVzT2JzLmdldCgpPy5maW5kKGNhbmRpZGF0ZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNoYW5nZSA9IGNoYW5nZXNldEZpbGVUb0NoYW5nZShjYW5kaWRhdGUsIHRoaXMuX29wdGlvbnMubWFwRGlmZlVyaSk7XG5cdFx0XHRcdHJldHVybiBpc0VxdWFsKGNoYW5nZT8ubW9kaWZpZWRVcmksIHJlc291cmNlKSB8fCBpc0VxdWFsKGNoYW5nZT8ub3JpZ2luYWxVcmksIHJlc291cmNlKTtcblx0XHRcdH0pO1xuXHRcdFx0aWYgKCFmaWxlKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgUmVzb3VyY2UgJyR7cmVzb3VyY2UudG9TdHJpbmcoKX0nIGlzIG5vdCBwYXJ0IG9mIGNoYW5nZXNldCAnJHt0aGlzLmlkfSdgKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmaWxlLmlkO1xuXHRcdH0pO1xuXG5cdFx0aWYgKGZpbGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbm5lY3Rpb24uZGlzcGF0Y2goY2hhbm5lbC50b1N0cmluZygpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldEZpbGVzUmV2aWV3Q2hhbmdlZCxcblx0XHRcdGZpbGVzLFxuXHRcdFx0cmV2aWV3ZWQsXG5cdFx0fSk7XG5cdH1cbn1cblxuY2xhc3MgQWdlbnRIb3N0Q2hhbmdlc2V0IGV4dGVuZHMgQWJzdHJhY3RBZ2VudEhvc3RDaGFuZ2VzZXQge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXG5cdHByaXZhdGUgX2xhYmVsOiBzdHJpbmc7XG5cdGdldCBsYWJlbCgpOiBzdHJpbmcgeyByZXR1cm4gdGhpcy5fbGFiZWw7IH1cblxuXHRwcml2YXRlIF9kZXNjcmlwdGlvbj86IHN0cmluZztcblx0Z2V0IGRlc2NyaXB0aW9uKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9kZXNjcmlwdGlvbjsgfVxuXG5cdHJlYWRvbmx5IGlzRW5hYmxlZCA9IGNvbnN0T2JzZXJ2YWJsZSh0cnVlKTtcblx0cmVhZG9ubHkgaXNEZWZhdWx0OiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVhZG9ubHkgY2hhbm5lbFVyaU9iczogSU9ic2VydmFibGU8VVJJIHwgdW5kZWZpbmVkPjtcblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlYWRvbmx5IGNoYW5nZXNldFN0YXRlT2JzOiBJT2JzZXJ2YWJsZTxJT2JzZXJ2YWJsZTxDaGFuZ2VzZXRTdGF0ZSB8IEVycm9yIHwgdW5kZWZpbmVkIHwgbnVsbD4+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG9wdGlvbnM6IElBZ2VudEhvc3RBZGFwdGVyT3B0aW9ucyxcblx0XHRpc0FjdGl2ZVNlc3Npb25PYnM6IElPYnNlcnZhYmxlPGJvb2xlYW4+LFxuXHRcdGNoYW5nZXNldFN1bW1hcnk6IENoYW5nZXNldCAmIHsgaXNEZWZhdWx0OiBib29sZWFuIH0sXG5cdFx0QElEaWFsb2dTZXJ2aWNlIGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihjaGFuZ2VzZXRTdW1tYXJ5LCBvcHRpb25zLCBkaWFsb2dTZXJ2aWNlKTtcblxuXHRcdHRoaXMuY2hhbm5lbFVyaU9icyA9IGNvbnN0T2JzZXJ2YWJsZShVUkkucGFyc2UoY2hhbmdlc2V0U3VtbWFyeS51cmlUZW1wbGF0ZSkpO1xuXG5cdFx0dGhpcy5jaGFuZ2VzZXRTdGF0ZU9icyA9IGNyZWF0ZUFjdGl2ZVNlc3Npb25TdWJzY3JpcHRpb25PYnM8Q2hhbmdlc2V0U3RhdGU+KFxuXHRcdFx0b3B0aW9ucyxcblx0XHRcdGlzQWN0aXZlU2Vzc2lvbk9icyxcblx0XHRcdFN0YXRlQ29tcG9uZW50cy5DaGFuZ2VzZXQsXG5cdFx0XHR0aGlzLmNoYW5uZWxVcmlPYnMsXG5cdFx0KTtcblxuXHRcdHRoaXMuaWQgPSBjaGFuZ2VzZXRTdW1tYXJ5LmNoYW5nZUtpbmQ7XG5cdFx0dGhpcy5fbGFiZWwgPSBjaGFuZ2VzZXRTdW1tYXJ5LmxhYmVsO1xuXHRcdHRoaXMuX2Rlc2NyaXB0aW9uID0gY2hhbmdlc2V0U3VtbWFyeS5kZXNjcmlwdGlvbjtcblxuXHRcdHRoaXMuaXNEZWZhdWx0ID0gY29uc3RPYnNlcnZhYmxlKGNoYW5nZXNldFN1bW1hcnkuaXNEZWZhdWx0KTtcblx0fVxufVxuXG5jbGFzcyBBZ2VudEhvc3RMYXN0VHVybkNoYW5nZXNldCBleHRlbmRzIEFic3RyYWN0QWdlbnRIb3N0Q2hhbmdlc2V0IHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgbGFiZWwgPSBsb2NhbGl6ZSgnbGFzdFR1cm5DaGFuZ2VzJywgXCJMYXN0IFR1cm4gQ2hhbmdlc1wiKTtcblx0cmVhZG9ubHkgZGVzY3JpcHRpb24gPSBsb2NhbGl6ZSgnbGFzdFR1cm5DaGFuZ2VzRGVzY3JpcHRpb24nLCBcIlNob3cgb25seSBjaGFuZ2VzIG1hZGUgaW4gdGhlIGxhc3QgdHVyblwiKTtcblxuXHRyZWFkb25seSBpc0RlZmF1bHQgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgZmFsc2UpO1xuXHRyZWFkb25seSBpc0VuYWJsZWQ6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZWFkb25seSBjaGFubmVsVXJpT2JzOiBJT2JzZXJ2YWJsZTxVUkkgfCB1bmRlZmluZWQ+O1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgY2hhbmdlc2V0U3RhdGVPYnM6IElPYnNlcnZhYmxlPElPYnNlcnZhYmxlPENoYW5nZXNldFN0YXRlIHwgRXJyb3IgfCB1bmRlZmluZWQgfCBudWxsPj47XG5cblx0LyoqXG5cdCAqIFRoZSBzZXNzaW9uJ3Mgb3JkZXJlZCB3b3JraW5nIGRpcmVjdG9yaWVzIChpbmRleCAwIGlzIHRoZSBwcmltYXJ5KSwgcmVhZFxuXHQgKiBmcm9tIHRoZSBleGlzdGluZyBzZXNzaW9uLXN0YXRlIHN1YnNjcmlwdGlvbi4gVXNlZCB0byBmaWx0ZXIgdGhlIGxhc3QtdHVyblxuXHQgKiBjaGFuZ2VzIHRvIHRoZSBwcmltYXJ5IHdvcmtpbmcgZGlyZWN0b3J5IGZvciBtdWx0aS1yb290IHNlc3Npb25zLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfd29ya2luZ0RpcmVjdG9yaWVzT2JzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZD47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0c2Vzc2lvblVyaTogVVJJLFxuXHRcdG9wdGlvbnM6IElBZ2VudEhvc3RBZGFwdGVyT3B0aW9ucyxcblx0XHRpc0FjdGl2ZVNlc3Npb25PYnM6IElPYnNlcnZhYmxlPGJvb2xlYW4+LFxuXHRcdGNoYW5nZXNldFN1bW1hcnk6IENoYW5nZXNldCAmIHsgaXNEZWZhdWx0OiBib29sZWFuIH0sXG5cdFx0QElEaWFsb2dTZXJ2aWNlIGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihjaGFuZ2VzZXRTdW1tYXJ5LCBvcHRpb25zLCBkaWFsb2dTZXJ2aWNlKTtcblxuXHRcdHRoaXMuaWQgPSBjaGFuZ2VzZXRTdW1tYXJ5LmNoYW5nZUtpbmQ7XG5cblx0XHQvLyBUdXJucyBtb3ZlZCBvZmYgdGhlIHNlc3Npb24gYW5kIG9udG8gYSBwZXItY2hhdCBjaGFubmVsIHdpdGggdGhlXG5cdFx0Ly8gbXVsdGktY2hhdCBwcm90b2NvbC4gU3Vic2NyaWJlIHRvIHRoZSBzZXNzaW9uIHRvIGRpc2NvdmVyIGl0c1xuXHRcdC8vIGNoYXRzLCB0aGVuIHRyYWNrIHRoZSBjaGF0IHRoYXQgd2FzIG1vZGlmaWVkIG1vc3QgcmVjZW50bHkgXHUyMDE0IGl0c1xuXHRcdC8vIGluLXByb2dyZXNzIHR1cm4gKG9yLCB3aGVuIGlkbGUsIGl0cyBsYXN0IGNvbXBsZXRlZCB0dXJuKSBpcyB0aGVcblx0XHQvLyBzZXNzaW9uJ3MgXCJsYXN0IHR1cm5cIi5cblx0XHRjb25zdCBzZXNzaW9uU3RhdGVPYnMgPSBjcmVhdGVBY3RpdmVTZXNzaW9uU3Vic2NyaXB0aW9uT2JzPFNlc3Npb25TdGF0ZT4oXG5cdFx0XHRvcHRpb25zLFxuXHRcdFx0aXNBY3RpdmVTZXNzaW9uT2JzLFxuXHRcdFx0U3RhdGVDb21wb25lbnRzLlNlc3Npb24sXG5cdFx0XHRjb25zdE9ic2VydmFibGUoc2Vzc2lvblVyaSksXG5cdFx0KTtcblxuXHRcdC8vIFJldXNlIHRoZSBzZXNzaW9uLXN0YXRlIHN1YnNjcmlwdGlvbiBhYm92ZSB0byBleHBvc2UgdGhlIHNlc3Npb24nc1xuXHRcdC8vIHdvcmtpbmcgZGlyZWN0b3JpZXMgZm9yIHRoZSBwcmltYXJ5LWRpcmVjdG9yeSBmaWx0ZXIuXG5cdFx0dGhpcy5fd29ya2luZ0RpcmVjdG9yaWVzT2JzID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblN0YXRlID0gc2Vzc2lvblN0YXRlT2JzLnJlYWQocmVhZGVyKS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIXNlc3Npb25TdGF0ZSB8fCBzZXNzaW9uU3RhdGUgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHNlc3Npb25TdGF0ZS53b3JraW5nRGlyZWN0b3JpZXM7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBtb3N0UmVjZW50Q2hhdFVyaU9icyA9IGRlcml2ZWRPcHRzKHsgZXF1YWxzRm46IGlzRXF1YWwgfSwgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25TdGF0ZSA9IHNlc3Npb25TdGF0ZU9icy5yZWFkKHJlYWRlcikucmVhZChyZWFkZXIpO1xuXHRcdFx0cmV0dXJuIHNlbGVjdE1vc3RSZWNlbnRDaGF0VXJpKHNlc3Npb25TdGF0ZSwgc2Vzc2lvblVyaSk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBjaGF0U3RhdGVPYnMgPSBjcmVhdGVBY3RpdmVTZXNzaW9uU3Vic2NyaXB0aW9uT2JzPENoYXRTdGF0ZT4oXG5cdFx0XHRvcHRpb25zLFxuXHRcdFx0aXNBY3RpdmVTZXNzaW9uT2JzLFxuXHRcdFx0U3RhdGVDb21wb25lbnRzLkNoYXQsXG5cdFx0XHRtb3N0UmVjZW50Q2hhdFVyaU9icyxcblx0XHQpO1xuXG5cdFx0Y29uc3QgbGFzdFR1cm5JZE9icyA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGNoYXRTdGF0ZSA9IGNoYXRTdGF0ZU9icy5yZWFkKHJlYWRlcikucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFjaGF0U3RhdGUgfHwgY2hhdFN0YXRlIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdC8vIFByZWZlciB0aGUgaW4tcHJvZ3Jlc3MgdHVybiBzbyB0aGUgXCJsYXN0IHR1cm5cIiByZWZsZWN0cyBzdHJlYW1pbmdcblx0XHRcdC8vIGVkaXRzIGxpdmU7IG9uY2UgaXQgY29tcGxldGVzIGl0IG1vdmVzIGludG8gYHR1cm5zYCB1bmRlciB0aGUgc2FtZVxuXHRcdFx0Ly8gaWQsIHNvIHRoZSB0cmFja2VkIGNoYW5nZXNldCB0cmFuc2l0aW9ucyBzZWFtbGVzc2x5LlxuXHRcdFx0cmV0dXJuIGNoYXRTdGF0ZS5hY3RpdmVUdXJuPy5pZCA/PyBjaGF0U3RhdGUudHVybnM/LmF0KC0xKT8uaWQ7XG5cdFx0fSk7XG5cblx0XHQvLyBMYXN0IHR1cm4gY2hhbmdlc1xuXHRcdHRoaXMuY2hhbm5lbFVyaU9icyA9IGRlcml2ZWRPcHRzKHsgZXF1YWxzRm46IGlzRXF1YWwgfSwgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGxhc3RUdXJuSWQgPSBsYXN0VHVybklkT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghbGFzdFR1cm5JZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB1cmkgPSBjaGFuZ2VzZXRTdW1tYXJ5LnVyaVRlbXBsYXRlLnJlcGxhY2UoJ3t0dXJuSWR9JywgbGFzdFR1cm5JZCk7XG5cdFx0XHRyZXR1cm4gdXJpID8gVVJJLnBhcnNlKHVyaSkgOiB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cblx0XHQvLyBTdWJzY3JpYmUgdG8gbGFzdCB0dXJuIGNoYW5nZXNcblx0XHR0aGlzLmNoYW5nZXNldFN0YXRlT2JzID0gY3JlYXRlQWN0aXZlU2Vzc2lvblN1YnNjcmlwdGlvbk9iczxDaGFuZ2VzZXRTdGF0ZT4oXG5cdFx0XHRvcHRpb25zLFxuXHRcdFx0aXNBY3RpdmVTZXNzaW9uT2JzLFxuXHRcdFx0U3RhdGVDb21wb25lbnRzLkNoYW5nZXNldCxcblx0XHRcdHRoaXMuY2hhbm5lbFVyaU9icyxcblx0XHQpO1xuXG5cdFx0dGhpcy5pc0VuYWJsZWQgPSBkZXJpdmVkKHJlYWRlciA9PiB0aGlzLmNoYW5uZWxVcmlPYnMucmVhZChyZWFkZXIpICE9PSB1bmRlZmluZWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZvciBtdWx0aS1yb290IHNlc3Npb25zLCByZXN0cmljdCB0aGUgbGFzdC10dXJuIGNoYW5nZXMgdG8gZmlsZXMgdW5kZXIgdGhlXG5cdCAqIHNlc3Npb24ncyBwcmltYXJ5IHdvcmtpbmcgZGlyZWN0b3J5IHNvIHRoZSBzaW5nbGUtcm9vdCBDaGFuZ2VzIHRyZWUgaW4gdGhlXG5cdCAqIEFnZW50cyBXaW5kb3cgc3RheXMgcmVuZGVyYWJsZS4gU2luZ2xlLXJvb3Qgc2Vzc2lvbnMgYXJlIHVuYWZmZWN0ZWQgXHUyMDE0XG5cdCAqIHtAbGluayBmaWx0ZXJDaGFuZ2VzVG9QcmltYXJ5V29ya2luZ0RpcmVjdG9yeX0gcmV0dXJucyB0aGUgaW5wdXQgdW5jaGFuZ2VkLlxuXHQgKi9cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9maWx0ZXJDaGFuZ2VzKGNoYW5nZXM6IHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdLCByZWFkZXI6IElSZWFkZXIpOiByZWFkb25seSBJU2Vzc2lvbkZpbGVDaGFuZ2VbXSB7XG5cdFx0cmV0dXJuIGZpbHRlckNoYW5nZXNUb1ByaW1hcnlXb3JraW5nRGlyZWN0b3J5KGNoYW5nZXMsIHRoaXMuX3dvcmtpbmdEaXJlY3Rvcmllc09icy5yZWFkKHJlYWRlcikpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsY0FBYyx3QkFBd0I7QUFDL0MsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxpQkFBaUIsU0FBUyw0QkFBNEIsYUFBbUMsMEJBQTBCLHFCQUFxQix1QkFBdUI7QUFDeEssU0FBUyxVQUFVLDRCQUE0QixlQUFlO0FBQzlELFNBQVMsY0FBYztBQUN2QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBNkIseUJBQTZDLGdDQUFnQztBQUMxRyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHFCQUFxQixpQkFBNEIsdUJBQWlHO0FBQzNKLFNBQVMsc0JBQXNCO0FBQy9CLFNBQTZJLGdDQUFnQyxpQ0FBaUMsK0JBQStCO0FBQzdPLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsNkJBQTZCO0FBR3RDLElBQVcsZ0JBQVgsa0JBQVdBLG1CQUFYO0FBQ0MsRUFBQUEsZUFBQSxZQUFTO0FBQ1QsRUFBQUEsZUFBQSxpQkFBYztBQUNkLEVBQUFBLGVBQUEsYUFBVTtBQUNWLEVBQUFBLGVBQUEsVUFBTztBQUNQLEVBQUFBLGVBQUEsYUFBVTtBQUxBLFNBQUFBO0FBQUEsR0FBQTtBQWlCWCxTQUFTLHFCQUFxQixRQUFpQztBQUM5RCxTQUFPLDBCQUEwQixNQUFNLElBQUksT0FBTyxNQUFNLE9BQU87QUFDaEU7QUFRTyxTQUFTLHVDQUNmLFNBQ0Esb0JBQ2dDO0FBQ2hDLE1BQUksQ0FB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
