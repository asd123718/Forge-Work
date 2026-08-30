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
import { EventType } from "../../../../../base/browser/dom.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { localize } from "../../../../../nls.js";
import { IQuickInputService, QuickInputHideReason } from "../../../../../platform/quickinput/common/quickInput.js";
import { TerminalLinkQuickPickEvent } from "../../../terminal/browser/terminal.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { Sequencer, timeout } from "../../../../../base/common/async.js";
import { PickerEditorState } from "../../../../browser/quickaccess.js";
import { getLinkSuffix } from "./terminalLinkParsing.js";
import { TerminalBuiltinLinkType } from "./links.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { basenameOrAuthority, dirname } from "../../../../../base/common/resources.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { AccessibleViewProviderId, IAccessibleViewService } from "../../../../../platform/accessibility/browser/accessibleView.js";
import { hasKey } from "../../../../../base/common/types.js";
let TerminalLinkQuickpick = class extends DisposableStore {
  constructor(_accessibleViewService, instantiationService, _labelService, _quickInputService) {
    super();
    this._accessibleViewService = _accessibleViewService;
    this._labelService = _labelService;
    this._quickInputService = _quickInputService;
    this._editorSequencer = new Sequencer();
    this._onDidRequestMoreLinks = this.add(new Emitter());
    this.onDidRequestMoreLinks = this._onDidRequestMoreLinks.event;
    this._terminalScrollStateSaved = false;
    this._editorViewState = this.add(instantiationService.createInstance(PickerEditorState));
  }
  async show(instance, links) {
    this._instance = instance;
    const result = await Promise.race([links.all, timeout(500)]);
    const usingAllLinks = typeof result === "object";
    const resolvedLinks = usingAllLinks ? result : links.viewport;
    const wordPicks = resolvedLinks.wordLinks ? await this._generatePicks(resolvedLinks.wordLinks) : void 0;
    const filePicks = resolvedLinks.fileLinks ? await this._generatePicks(resolvedLinks.fileLinks) : void 0;
    const folderPicks = resolvedLinks.folderLinks ? await this._generatePicks(resolvedLinks.folderLinks) : void 0;
    const webPicks = resolvedLinks.webLinks ? await this._generatePicks(resolvedLinks.webLinks) : void 0;
    const picks = [];
    if (webPicks) {
      picks.push({ type: "separator", label: localize("terminal.integrated.urlLinks", "Url") });
      picks.push(...webPicks);
    }
    if (filePicks) {
      picks.push({ type: "separator", label: localize("terminal.integrated.localFileLinks", "File") });
      picks.push(...filePicks);
    }
    if (folderPicks) {
      picks.push({ type: "separator", label: localize("terminal.integrated.localFolderLinks", "Folder") });
      picks.push(...folderPicks);
    }
    if (wordPicks) {
      picks.push({ type: "separator", label: localize("terminal.integrated.searchLinks", "Workspace Search") });
      picks.push(...wordPicks);
    }
    const pick = this._quickInputService.createQuickPick({ useSeparators: true });
    const disposables = new DisposableStore();
    disposables.add(pick);
    pick.items = picks;
    pick.placeholder = localize("terminal.integrated.openDetectedLink", "Select the link to open, type to filter all links");
    pick.sortByLabel = false;
    pick.show();
    if (pick.activeItems.length > 0) {
      this._previewItem(pick.activeItems[0]);
    }
    let accepted = false;
    if (!usingAllLinks) {
      disposables.add(Event.once(pick.onDidChangeValue)(async () => {
        const allLinks = await links.all;
        if (accepted) {
          return;
        }
        const wordIgnoreLinks = [...allLinks.fileLinks ?? [], ...allLinks.folderLinks ?? [], ...allLinks.webLinks ?? []];
        const wordPicks2 = allLinks.wordLinks ? await this._generatePicks(allLinks.wordLinks, wordIgnoreLinks) : void 0;
        const filePicks2 = allLinks.fileLinks ? await this._generatePicks(allLinks.fileLinks) : void 0;
        const folderPicks2 = allLinks.folderLinks ? await this._generatePicks(allLinks.folderLinks) : void 0;
        const webPicks2 = allLinks.webLinks ? await this._generatePicks(allLinks.webLinks) : void 0;
        const picks2 = [];
        if (webPicks2) {
          picks2.push({ type: "separator", label: localize("terminal.integrated.urlLinks", "Url") });
          picks2.push(...webPicks2);
        }
        if (filePicks2) {
          picks2.push({ type: "separator", label: localize("terminal.integrated.localFileLinks", "File") });
          picks2.push(...filePicks2);
        }
        if (folderPicks2) {
          picks2.push({ type: "separator", label: localize("terminal.integrated.localFolderLinks", "Folder") });
          picks2.push(...folderPicks2);
        }
        if (wordPicks2) {
          picks2.push({ type: "separator", label: localize("terminal.integrated.searchLinks", "Workspace Search") });
          picks2.push(...wordPicks2);
        }
        pick.items = picks2;
      }));
    }
    disposables.add(pick.onDidChangeActive(async () => {
      const [item] = pick.activeItems;
      this._previewItem(item);
    }));
    return new Promise((r) => {
      disposables.add(pick.onDidHide(({ reason }) => {
        if (this._terminalScrollStateSaved) {
          const markTracker = this._instance?.xterm?.markTracker;
          if (markTracker) {
            markTracker.restoreScrollState();
            markTracker.clear();
            this._terminalScrollStateSaved = false;
          }
        }
        if (reason === QuickInputHideReason.Gesture) {
          this._editorViewState.restore();
        }
        disposables.dispose();
        if (pick.selectedItems.length === 0) {
          this._accessibleViewService.showLastProvider(AccessibleViewProviderId.Terminal);
        }
        r();
      }));
      disposables.add(Event.once(pick.onDidAccept)(() => {
        if (this._terminalScrollStateSaved) {
          const markTracker = this._instance?.xterm?.markTracker;
          if (markTracker) {
            markTracker.restoreScrollState();
            markTracker.clear();
            this._terminalScrollStateSaved = false;
          }
        }
        accepted = true;
        const event = new TerminalLinkQuickPickEvent(EventType.CLICK);
        const activeItem = pick.activeItems?.[0];
        if (activeItem && hasKey(activeItem, { link: true })) {
          activeItem.link.activate(event, activeItem.label);
        }
        disposables.dispose();
        r();
      }));
    });
  }
  /**
   * @param ignoreLinks Links with labels to not include in the picks.
   */
  async _generatePicks(links, ignoreLinks) {
    if (!links) {
      return;
    }
    const linkTextKeys = /* @__PURE__ */ new Set();
    const linkUriKeys = /* @__PURE__ */ new Set();
    const picks = [];
    for (const link of links) {
      let label = link.text;
      if (!linkTextKeys.has(label) && (!ignoreLinks || !ignoreLinks.some((e) => e.text === label))) {
        linkTextKeys.add(label);
        let description;
        if (hasKey(link, { uri: true }) && link.uri) {
          if (link.type === TerminalBuiltinLinkType.LocalFile || link.type === TerminalBuiltinLinkType.LocalFolderInWorkspace || link.type === TerminalBuiltinLinkType.LocalFolderOutsideWorkspace) {
            label = basenameOrAuthority(link.uri);
            description = this._labelService.getUriLabel(dirname(link.uri), { relative: true });
          }
          if (link.type === TerminalBuiltinLinkType.LocalFile) {
            if (link.parsedLink?.suffix?.row !== void 0) {
              label += `:${link.parsedLink.suffix.row}`;
              if (link.parsedLink?.suffix?.rowEnd !== void 0) {
                label += `-${link.parsedLink.suffix.rowEnd}`;
              }
              if (link.parsedLink?.suffix?.col !== void 0) {
                label += `:${link.parsedLink.suffix.col}`;
                if (link.parsedLink?.suffix?.colEnd !== void 0) {
                  label += `-${link.parsedLink.suffix.colEnd}`;
                }
              }
            }
          }
          if (linkUriKeys.has(label + "|" + (description ?? ""))) {
            continue;
          }
          linkUriKeys.add(label + "|" + (description ?? ""));
        }
        picks.push({ label, link, description });
      }
    }
    return picks.length > 0 ? picks : void 0;
  }
  _previewItem(item) {
    if (!item || !hasKey(item, { link: true }) || !item.link) {
      return;
    }
    const link = item.link;
    this._previewItemInTerminal(link);
    if (!hasKey(link, { uri: true }) || !link.uri) {
      return;
    }
    if (link.type !== TerminalBuiltinLinkType.LocalFile) {
      return;
    }
    this._previewItemInEditor(link);
  }
  _previewItemInEditor(link) {
    const linkSuffix = link.parsedLink ? link.parsedLink.suffix : getLinkSuffix(link.text);
    const selection = linkSuffix?.row === void 0 ? void 0 : {
      startLineNumber: linkSuffix.row ?? 1,
      startColumn: linkSuffix.col ?? 1,
      endLineNumber: linkSuffix.rowEnd,
      endColumn: linkSuffix.colEnd
    };
    this._editorViewState.set();
    this._editorSequencer.queue(async () => {
      await this._editorViewState.openTransientEditor({
        resource: link.uri,
        options: { preserveFocus: true, revealIfOpened: true, ignoreError: true, selection }
      });
    });
  }
  _previewItemInTerminal(link) {
    const xterm = this._instance?.xterm;
    if (!xterm) {
      return;
    }
    if (!this._terminalScrollStateSaved) {
      xterm.markTracker.saveScrollState();
      this._terminalScrollStateSaved = true;
    }
    xterm.markTracker.revealRange(link.range);
  }
};
TerminalLinkQuickpick = __decorateClass([
  __decorateParam(0, IAccessibleViewService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ILabelService),
  __decorateParam(3, IQuickInputService)
], TerminalLinkQuickpick);
export {
  TerminalLinkQuickpick
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcbGlua3NcXGJyb3dzZXJcXHRlcm1pbmFsTGlua1F1aWNrcGljay50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEV2ZW50VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBRdWlja1BpY2tJdGVtLCBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtLCBRdWlja0lucHV0SGlkZVJlYXNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSURldGVjdGVkTGlua3MgfSBmcm9tICcuL3Rlcm1pbmFsTGlua01hbmFnZXIuanMnO1xuaW1wb3J0IHsgVGVybWluYWxMaW5rUXVpY2tQaWNrRXZlbnQsIHR5cGUgSURldGFjaGVkVGVybWluYWxJbnN0YW5jZSwgdHlwZSBJVGVybWluYWxJbnN0YW5jZSB9IGZyb20gJy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0IHR5cGUgeyBJTGluayB9IGZyb20gJ0B4dGVybS94dGVybSc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHR5cGUgeyBUZXJtaW5hbExpbmsgfSBmcm9tICcuL3Rlcm1pbmFsTGluay5qcyc7XG5pbXBvcnQgeyBTZXF1ZW5jZXIsIHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBQaWNrZXJFZGl0b3JTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvcXVpY2thY2Nlc3MuanMnO1xuaW1wb3J0IHsgZ2V0TGlua1N1ZmZpeCB9IGZyb20gJy4vdGVybWluYWxMaW5rUGFyc2luZy5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZSB9IGZyb20gJy4vbGlua3MuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZU9yQXV0aG9yaXR5LCBkaXJuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJsZVZpZXdQcm92aWRlcklkLCBJQWNjZXNzaWJsZVZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2libGVWaWV3LmpzJztcbmltcG9ydCB7IGhhc0tleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcblxuZXhwb3J0IGNsYXNzIFRlcm1pbmFsTGlua1F1aWNrcGljayBleHRlbmRzIERpc3Bvc2FibGVTdG9yZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VxdWVuY2VyID0gbmV3IFNlcXVlbmNlcigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JWaWV3U3RhdGU6IFBpY2tlckVkaXRvclN0YXRlO1xuXG5cdHByaXZhdGUgX2luc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSB8IElEZXRhY2hlZFRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXF1ZXN0TW9yZUxpbmtzID0gdGhpcy5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVxdWVzdE1vcmVMaW5rcyA9IHRoaXMuX29uRGlkUmVxdWVzdE1vcmVMaW5rcy5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUFjY2Vzc2libGVWaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hY2Nlc3NpYmxlVmlld1NlcnZpY2U6IElBY2Nlc3NpYmxlVmlld1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3F1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fZWRpdG9yVmlld1N0YXRlID0gdGhpcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUGlja2VyRWRpdG9yU3RhdGUpKTtcblx0fVxuXG5cdGFzeW5jIHNob3coaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlIHwgSURldGFjaGVkVGVybWluYWxJbnN0YW5jZSwgbGlua3M6IHsgdmlld3BvcnQ6IElEZXRlY3RlZExpbmtzOyBhbGw6IFByb21pc2U8SURldGVjdGVkTGlua3M+IH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9pbnN0YW5jZSA9IGluc3RhbmNlO1xuXG5cdFx0Ly8gQWxsb3cgYWxsIGxpbmtzIGEgc21hbGwgYW1vdW50IG9mIHRpbWUgdG8gZWxhcHNlIHRvIGZpbmlzaCwgaWYgdGhpcyBpcyBub3QgZG9uZSBpbiB0aGlzXG5cdFx0Ly8gdGltZSB0aGV5IHdpbGwgYmUgbG9hZGVkIHVwb24gdGhlIGZpcnN0IGZpbHRlci5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBQcm9taXNlLnJhY2UoW2xpbmtzLmFsbCwgdGltZW91dCg1MDApXSk7XG5cdFx0Y29uc3QgdXNpbmdBbGxMaW5rcyA9IHR5cGVvZiByZXN1bHQgPT09ICdvYmplY3QnO1xuXHRcdGNvbnN0IHJlc29sdmVkTGlua3MgPSB1c2luZ0FsbExpbmtzID8gcmVzdWx0IDogbGlua3Mudmlld3BvcnQ7XG5cblx0XHQvLyBHZXQgcmF3IGxpbmsgcGlja3Ncblx0XHRjb25zdCB3b3JkUGlja3MgPSByZXNvbHZlZExpbmtzLndvcmRMaW5rcyA/IGF3YWl0IHRoaXMuX2dlbmVyYXRlUGlja3MocmVzb2x2ZWRMaW5rcy53b3JkTGlua3MpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGZpbGVQaWNrcyA9IHJlc29sdmVkTGlua3MuZmlsZUxpbmtzID8gYXdhaXQgdGhpcy5fZ2VuZXJhdGVQaWNrcyhyZXNvbHZlZExpbmtzLmZpbGVMaW5rcykgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZm9sZGVyUGlja3MgPSByZXNvbHZlZExpbmtzLmZvbGRlckxpbmtzID8gYXdhaXQgdGhpcy5fZ2VuZXJhdGVQaWNrcyhyZXNvbHZlZExpbmtzLmZvbGRlckxpbmtzKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCB3ZWJQaWNrcyA9IHJlc29sdmVkTGlua3Mud2ViTGlua3MgPyBhd2FpdCB0aGlzLl9nZW5lcmF0ZVBpY2tzKHJlc29sdmVkTGlua3Mud2ViTGlua3MpIDogdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgcGlja3M6IExpbmtRdWlja1BpY2tJdGVtW10gPSBbXTtcblx0XHRpZiAod2ViUGlja3MpIHtcblx0XHRcdHBpY2tzLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnVybExpbmtzJywgXCJVcmxcIikgfSk7XG5cdFx0XHRwaWNrcy5wdXNoKC4uLndlYlBpY2tzKTtcblx0XHR9XG5cdFx0aWYgKGZpbGVQaWNrcykge1xuXHRcdFx0cGlja3MucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQubG9jYWxGaWxlTGlua3MnLCBcIkZpbGVcIikgfSk7XG5cdFx0XHRwaWNrcy5wdXNoKC4uLmZpbGVQaWNrcyk7XG5cdFx0fVxuXHRcdGlmIChmb2xkZXJQaWNrcykge1xuXHRcdFx0cGlja3MucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQubG9jYWxGb2xkZXJMaW5rcycsIFwiRm9sZGVyXCIpIH0pO1xuXHRcdFx0cGlja3MucHVzaCguLi5mb2xkZXJQaWNrcyk7XG5cdFx0fVxuXHRcdGlmICh3b3JkUGlja3MpIHtcblx0XHRcdHBpY2tzLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnNlYXJjaExpbmtzJywgXCJXb3Jrc3BhY2UgU2VhcmNoXCIpIH0pO1xuXHRcdFx0cGlja3MucHVzaCguLi53b3JkUGlja3MpO1xuXHRcdH1cblxuXHRcdC8vIENyZWF0ZSBhbmQgc2hvdyBxdWljayBwaWNrXG5cdFx0Y29uc3QgcGljayA9IHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljazxJUXVpY2tQaWNrSXRlbSB8IElUZXJtaW5hbExpbmtRdWlja1BpY2tJdGVtPih7IHVzZVNlcGFyYXRvcnM6IHRydWUgfSk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBpY2spO1xuXHRcdHBpY2suaXRlbXMgPSBwaWNrcztcblx0XHRwaWNrLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQub3BlbkRldGVjdGVkTGluaycsIFwiU2VsZWN0IHRoZSBsaW5rIHRvIG9wZW4sIHR5cGUgdG8gZmlsdGVyIGFsbCBsaW5rc1wiKTtcblx0XHRwaWNrLnNvcnRCeUxhYmVsID0gZmFsc2U7XG5cdFx0cGljay5zaG93KCk7XG5cdFx0aWYgKHBpY2suYWN0aXZlSXRlbXMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fcHJldmlld0l0ZW0ocGljay5hY3RpdmVJdGVtc1swXSk7XG5cdFx0fVxuXG5cdFx0Ly8gU2hvdyBhbGwgcmVzdWx0cyBvbmx5IHdoZW4gZmlsdGVyaW5nIGJlZ2lucywgdGhpcyBpcyBkb25lIHNvIHRoZSBxdWljayBwaWNrIHdpbGwgc2hvdyB1cFxuXHRcdC8vIEFTQVAgd2l0aCBvbmx5IHRoZSB2aWV3cG9ydCBlbnRyaWVzLlxuXHRcdGxldCBhY2NlcHRlZCA9IGZhbHNlO1xuXHRcdGlmICghdXNpbmdBbGxMaW5rcykge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKEV2ZW50Lm9uY2UocGljay5vbkRpZENoYW5nZVZhbHVlKShhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGFsbExpbmtzID0gYXdhaXQgbGlua3MuYWxsO1xuXHRcdFx0XHRpZiAoYWNjZXB0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgd29yZElnbm9yZUxpbmtzID0gWy4uLihhbGxMaW5rcy5maWxlTGlua3MgPz8gW10pLCAuLi4oYWxsTGlua3MuZm9sZGVyTGlua3MgPz8gW10pLCAuLi4oYWxsTGlua3Mud2ViTGlua3MgPz8gW10pXTtcblxuXHRcdFx0XHRjb25zdCB3b3JkUGlja3MgPSBhbGxMaW5rcy53b3JkTGlua3MgPyBhd2FpdCB0aGlzLl9nZW5lcmF0ZVBpY2tzKGFsbExpbmtzLndvcmRMaW5rcywgd29yZElnbm9yZUxpbmtzKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgZmlsZVBpY2tzID0gYWxsTGlua3MuZmlsZUxpbmtzID8gYXdhaXQgdGhpcy5fZ2VuZXJhdGVQaWNrcyhhbGxMaW5rcy5maWxlTGlua3MpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBmb2xkZXJQaWNrcyA9IGFsbExpbmtzLmZvbGRlckxpbmtzID8gYXdhaXQgdGhpcy5fZ2VuZXJhdGVQaWNrcyhhbGxMaW5rcy5mb2xkZXJMaW5rcykgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IHdlYlBpY2tzID0gYWxsTGlua3Mud2ViTGlua3MgPyBhd2FpdCB0aGlzLl9nZW5lcmF0ZVBpY2tzKGFsbExpbmtzLndlYkxpbmtzKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgcGlja3M6IExpbmtRdWlja1BpY2tJdGVtW10gPSBbXTtcblx0XHRcdFx0aWYgKHdlYlBpY2tzKSB7XG5cdFx0XHRcdFx0cGlja3MucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQudXJsTGlua3MnLCBcIlVybFwiKSB9KTtcblx0XHRcdFx0XHRwaWNrcy5wdXNoKC4uLndlYlBpY2tzKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZmlsZVBpY2tzKSB7XG5cdFx0XHRcdFx0cGlja3MucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQubG9jYWxGaWxlTGlua3MnLCBcIkZpbGVcIikgfSk7XG5cdFx0XHRcdFx0cGlja3MucHVzaCguLi5maWxlUGlja3MpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChmb2xkZXJQaWNrcykge1xuXHRcdFx0XHRcdHBpY2tzLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmxvY2FsRm9sZGVyTGlua3MnLCBcIkZvbGRlclwiKSB9KTtcblx0XHRcdFx0XHRwaWNrcy5wdXNoKC4uLmZvbGRlclBpY2tzKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAod29yZFBpY2tzKSB7XG5cdFx0XHRcdFx0cGlja3MucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuc2VhcmNoTGlua3MnLCBcIldvcmtzcGFjZSBTZWFyY2hcIikgfSk7XG5cdFx0XHRcdFx0cGlja3MucHVzaCguLi53b3JkUGlja3MpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHBpY2suaXRlbXMgPSBwaWNrcztcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocGljay5vbkRpZENoYW5nZUFjdGl2ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBbaXRlbV0gPSBwaWNrLmFjdGl2ZUl0ZW1zO1xuXHRcdFx0dGhpcy5fcHJldmlld0l0ZW0oaXRlbSk7XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKHIgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHBpY2sub25EaWRIaWRlKCh7IHJlYXNvbiB9KSA9PiB7XG5cblx0XHRcdFx0Ly8gUmVzdG9yZSB0ZXJtaW5hbCBzY3JvbGwgc3RhdGVcblx0XHRcdFx0aWYgKHRoaXMuX3Rlcm1pbmFsU2Nyb2xsU3RhdGVTYXZlZCkge1xuXHRcdFx0XHRcdGNvbnN0IG1hcmtUcmFja2VyID0gdGhpcy5faW5zdGFuY2U/Lnh0ZXJtPy5tYXJrVHJhY2tlcjtcblx0XHRcdFx0XHRpZiAobWFya1RyYWNrZXIpIHtcblx0XHRcdFx0XHRcdG1hcmtUcmFja2VyLnJlc3RvcmVTY3JvbGxTdGF0ZSgpO1xuXHRcdFx0XHRcdFx0bWFya1RyYWNrZXIuY2xlYXIoKTtcblx0XHRcdFx0XHRcdHRoaXMuX3Rlcm1pbmFsU2Nyb2xsU3RhdGVTYXZlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFJlc3RvcmUgdmlldyBzdGF0ZSB1cG9uIGNhbmNlbGxhdGlvbiBpZiB3ZSBjaGFuZ2VkIGl0XG5cdFx0XHRcdC8vIGJ1dCBvbmx5IHdoZW4gdGhlIHBpY2tlciB3YXMgY2xvc2VkIHZpYSBleHBsaWNpdCB1c2VyXG5cdFx0XHRcdC8vIGdlc3R1cmUgYW5kIG5vdCBlLmcuIHdoZW4gZm9jdXMgd2FzIGxvc3QgYmVjYXVzZSB0aGF0XG5cdFx0XHRcdC8vIGNvdWxkIG1lYW4gdGhlIHVzZXIgY2xpY2tlZCBpbnRvIHRoZSBlZGl0b3IgZGlyZWN0bHkuXG5cdFx0XHRcdGlmIChyZWFzb24gPT09IFF1aWNrSW5wdXRIaWRlUmVhc29uLkdlc3R1cmUpIHtcblx0XHRcdFx0XHR0aGlzLl9lZGl0b3JWaWV3U3RhdGUucmVzdG9yZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0aWYgKHBpY2suc2VsZWN0ZWRJdGVtcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHR0aGlzLl9hY2Nlc3NpYmxlVmlld1NlcnZpY2Uuc2hvd0xhc3RQcm92aWRlcihBY2Nlc3NpYmxlVmlld1Byb3ZpZGVySWQuVGVybWluYWwpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHIoKTtcblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChFdmVudC5vbmNlKHBpY2sub25EaWRBY2NlcHQpKCgpID0+IHtcblx0XHRcdFx0Ly8gUmVzdG9yZSB0ZXJtaW5hbCBzY3JvbGwgc3RhdGVcblx0XHRcdFx0aWYgKHRoaXMuX3Rlcm1pbmFsU2Nyb2xsU3RhdGVTYXZlZCkge1xuXHRcdFx0XHRcdGNvbnN0IG1hcmtUcmFja2VyID0gdGhpcy5faW5zdGFuY2U/Lnh0ZXJtPy5tYXJrVHJhY2tlcjtcblx0XHRcdFx0XHRpZiAobWFya1RyYWNrZXIpIHtcblx0XHRcdFx0XHRcdG1hcmtUcmFja2VyLnJlc3RvcmVTY3JvbGxTdGF0ZSgpO1xuXHRcdFx0XHRcdFx0bWFya1RyYWNrZXIuY2xlYXIoKTtcblx0XHRcdFx0XHRcdHRoaXMuX3Rlcm1pbmFsU2Nyb2xsU3RhdGVTYXZlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGFjY2VwdGVkID0gdHJ1ZTtcblx0XHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgVGVybWluYWxMaW5rUXVpY2tQaWNrRXZlbnQoRXZlbnRUeXBlLkNMSUNLKTtcblx0XHRcdFx0Y29uc3QgYWN0aXZlSXRlbSA9IHBpY2suYWN0aXZlSXRlbXM/LlswXTtcblx0XHRcdFx0aWYgKGFjdGl2ZUl0ZW0gJiYgaGFzS2V5KGFjdGl2ZUl0ZW0sIHsgbGluazogdHJ1ZSB9KSkge1xuXHRcdFx0XHRcdGFjdGl2ZUl0ZW0ubGluay5hY3RpdmF0ZShldmVudCwgYWN0aXZlSXRlbS5sYWJlbCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRyKCk7XG5cdFx0XHR9KSk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQHBhcmFtIGlnbm9yZUxpbmtzIExpbmtzIHdpdGggbGFiZWxzIHRvIG5vdCBpbmNsdWRlIGluIHRoZSBwaWNrcy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2dlbmVyYXRlUGlja3MobGlua3M6IChJTGluayB8IFRlcm1pbmFsTGluaylbXSwgaWdub3JlTGlua3M/OiBJTGlua1tdKTogUHJvbWlzZTxJVGVybWluYWxMaW5rUXVpY2tQaWNrSXRlbVtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCFsaW5rcykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBsaW5rVGV4dEtleXM6IFNldDxzdHJpbmc+ID0gbmV3IFNldCgpO1xuXHRcdGNvbnN0IGxpbmtVcmlLZXlzOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoKTtcblx0XHRjb25zdCBwaWNrczogSVRlcm1pbmFsTGlua1F1aWNrUGlja0l0ZW1bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgbGluayBvZiBsaW5rcykge1xuXHRcdFx0bGV0IGxhYmVsID0gbGluay50ZXh0O1xuXHRcdFx0aWYgKCFsaW5rVGV4dEtleXMuaGFzKGxhYmVsKSAmJiAoIWlnbm9yZUxpbmtzIHx8ICFpZ25vcmVMaW5rcy5zb21lKGUgPT4gZS50ZXh0ID09PSBsYWJlbCkpKSB7XG5cdFx0XHRcdGxpbmtUZXh0S2V5cy5hZGQobGFiZWwpO1xuXG5cdFx0XHRcdC8vIEFkZCBhIGNvbnNpc3RlbnRseSBmb3JtYXR0ZWQgcmVzb2x2ZWQgVVJJIGxhYmVsIHRvIHRoZSBkZXNjcmlwdGlvbiBpZiBhcHBsaWNhYmxlXG5cdFx0XHRcdGxldCBkZXNjcmlwdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoaGFzS2V5KGxpbmssIHsgdXJpOiB0cnVlIH0pICYmIGxpbmsudXJpKSB7XG5cdFx0XHRcdFx0Ly8gRm9yIGxvY2FsIGZpbGVzIGFuZCBmb2xkZXJzLCBtaW1pYyB0aGUgcHJlc2VudGF0aW9uIG9mIGdvIHRvIGZpbGVcblx0XHRcdFx0XHRpZiAoXG5cdFx0XHRcdFx0XHRsaW5rLnR5cGUgPT09IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLkxvY2FsRmlsZSB8fFxuXHRcdFx0XHRcdFx0bGluay50eXBlID09PSBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5Mb2NhbEZvbGRlckluV29ya3NwYWNlIHx8XG5cdFx0XHRcdFx0XHRsaW5rLnR5cGUgPT09IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLkxvY2FsRm9sZGVyT3V0c2lkZVdvcmtzcGFjZVxuXHRcdFx0XHRcdCkge1xuXHRcdFx0XHRcdFx0bGFiZWwgPSBiYXNlbmFtZU9yQXV0aG9yaXR5KGxpbmsudXJpKTtcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uID0gdGhpcy5fbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGRpcm5hbWUobGluay51cmkpLCB7IHJlbGF0aXZlOiB0cnVlIH0pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIEFkZCBsaW5lIGFuZCBjb2x1bW4gbnVtYmVycyB0byB0aGUgbGFiZWwgaWYgYXBwbGljYWJsZVxuXHRcdFx0XHRcdGlmIChsaW5rLnR5cGUgPT09IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLkxvY2FsRmlsZSkge1xuXHRcdFx0XHRcdFx0aWYgKGxpbmsucGFyc2VkTGluaz8uc3VmZml4Py5yb3cgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0XHRsYWJlbCArPSBgOiR7bGluay5wYXJzZWRMaW5rLnN1ZmZpeC5yb3d9YDtcblx0XHRcdFx0XHRcdFx0aWYgKGxpbmsucGFyc2VkTGluaz8uc3VmZml4Py5yb3dFbmQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0XHRcdGxhYmVsICs9IGAtJHtsaW5rLnBhcnNlZExpbmsuc3VmZml4LnJvd0VuZH1gO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGlmIChsaW5rLnBhcnNlZExpbms/LnN1ZmZpeD8uY29sICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdFx0XHRsYWJlbCArPSBgOiR7bGluay5wYXJzZWRMaW5rLnN1ZmZpeC5jb2x9YDtcblx0XHRcdFx0XHRcdFx0XHRpZiAobGluay5wYXJzZWRMaW5rPy5zdWZmaXg/LmNvbEVuZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRsYWJlbCArPSBgLSR7bGluay5wYXJzZWRMaW5rLnN1ZmZpeC5jb2xFbmR9YDtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBTa2lwIHRoZSBsaW5rIGlmIGl0J3MgYSBkdXBsaWNhdGUgVVJJICsgbGluZS9jb2xcblx0XHRcdFx0XHRpZiAobGlua1VyaUtleXMuaGFzKGxhYmVsICsgJ3wnICsgKGRlc2NyaXB0aW9uID8/ICcnKSkpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRsaW5rVXJpS2V5cy5hZGQobGFiZWwgKyAnfCcgKyAoZGVzY3JpcHRpb24gPz8gJycpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHBpY2tzLnB1c2goeyBsYWJlbCwgbGluaywgZGVzY3JpcHRpb24gfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBwaWNrcy5sZW5ndGggPiAwID8gcGlja3MgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9wcmV2aWV3SXRlbShpdGVtOiBJVGVybWluYWxMaW5rUXVpY2tQaWNrSXRlbSB8IElRdWlja1BpY2tJdGVtKSB7XG5cdFx0aWYgKCFpdGVtIHx8ICFoYXNLZXkoaXRlbSwgeyBsaW5rOiB0cnVlIH0pIHx8ICFpdGVtLmxpbmspIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBBbnkgbGluayBjYW4gYmUgcHJldmlld2VkIGluIHRoZSB0ZXJtbmluYWxcblx0XHRjb25zdCBsaW5rID0gaXRlbS5saW5rO1xuXHRcdHRoaXMuX3ByZXZpZXdJdGVtSW5UZXJtaW5hbChsaW5rKTtcblxuXHRcdGlmICghaGFzS2V5KGxpbmssIHsgdXJpOiB0cnVlIH0pIHx8ICFsaW5rLnVyaSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChsaW5rLnR5cGUgIT09IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLkxvY2FsRmlsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3ByZXZpZXdJdGVtSW5FZGl0b3IobGluayk7XG5cdH1cblxuXHRwcml2YXRlIF9wcmV2aWV3SXRlbUluRWRpdG9yKGxpbms6IFRlcm1pbmFsTGluaykge1xuXHRcdGNvbnN0IGxpbmtTdWZmaXggPSBsaW5rLnBhcnNlZExpbmsgPyBsaW5rLnBhcnNlZExpbmsuc3VmZml4IDogZ2V0TGlua1N1ZmZpeChsaW5rLnRleHQpO1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IGxpbmtTdWZmaXg/LnJvdyA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkIDoge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBsaW5rU3VmZml4LnJvdyA/PyAxLFxuXHRcdFx0c3RhcnRDb2x1bW46IGxpbmtTdWZmaXguY29sID8/IDEsXG5cdFx0XHRlbmRMaW5lTnVtYmVyOiBsaW5rU3VmZml4LnJvd0VuZCxcblx0XHRcdGVuZENvbHVtbjogbGlua1N1ZmZpeC5jb2xFbmRcblx0XHR9O1xuXG5cdFx0dGhpcy5fZWRpdG9yVmlld1N0YXRlLnNldCgpO1xuXHRcdHRoaXMuX2VkaXRvclNlcXVlbmNlci5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLl9lZGl0b3JWaWV3U3RhdGUub3BlblRyYW5zaWVudEVkaXRvcih7XG5cdFx0XHRcdHJlc291cmNlOiBsaW5rLnVyaSxcblx0XHRcdFx0b3B0aW9uczogeyBwcmVzZXJ2ZUZvY3VzOiB0cnVlLCByZXZlYWxJZk9wZW5lZDogdHJ1ZSwgaWdub3JlRXJyb3I6IHRydWUsIHNlbGVjdGlvbiB9XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3Rlcm1pbmFsU2Nyb2xsU3RhdGVTYXZlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9wcmV2aWV3SXRlbUluVGVybWluYWwobGluazogSUxpbmspIHtcblx0XHRjb25zdCB4dGVybSA9IHRoaXMuX2luc3RhbmNlPy54dGVybTtcblx0XHRpZiAoIXh0ZXJtKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fdGVybWluYWxTY3JvbGxTdGF0ZVNhdmVkKSB7XG5cdFx0XHR4dGVybS5tYXJrVHJhY2tlci5zYXZlU2Nyb2xsU3RhdGUoKTtcblx0XHRcdHRoaXMuX3Rlcm1pbmFsU2Nyb2xsU3RhdGVTYXZlZCA9IHRydWU7XG5cdFx0fVxuXHRcdHh0ZXJtLm1hcmtUcmFja2VyLnJldmVhbFJhbmdlKGxpbmsucmFuZ2UpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRlcm1pbmFsTGlua1F1aWNrUGlja0l0ZW0gZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdGxpbms6IElMaW5rIHwgVGVybWluYWxMaW5rO1xufVxuXG50eXBlIExpbmtRdWlja1BpY2tJdGVtID0gSVRlcm1pbmFsTGlua1F1aWNrUGlja0l0ZW0gfCBRdWlja1BpY2tJdGVtO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLGdCQUFnQjtBQUN6QixTQUF3QixvQkFBb0MsNEJBQTRCO0FBRXhGLFNBQVMsa0NBQTBGO0FBRW5HLFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsV0FBVyxlQUFlO0FBQ25DLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMscUJBQXFCLGVBQWU7QUFDN0MsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEIsOEJBQThCO0FBQ2pFLFNBQVMsY0FBYztBQUVoQixJQUFNLHdCQUFOLGNBQW9DLGdCQUFnQjtBQUFBLEVBVTFELFlBQzBDLHdCQUNsQixzQkFDUyxlQUNLLG9CQUNwQztBQUNELFVBQU07QUFMbUM7QUFFVDtBQUNLO0FBWnRDLFNBQWlCLG1CQUFtQixJQUFJLFVBQVU7QUFLbEQsU0FBaUIseUJBQXlCLEtBQUssSUFBSSxJQUFJLFFBQWMsQ0FBQztBQUN0RSxT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
