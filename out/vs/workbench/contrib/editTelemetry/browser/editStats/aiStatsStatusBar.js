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
import { n } from "../../../../../base/browser/dom.js";
import { ActionBar } from "../../../../../base/browser/ui/actionbar/actionbar.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { createHotClass } from "../../../../../base/common/hotReloadHelpers.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { autorun, derived, observableValue } from "../../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { localize } from "../../../../../nls.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { nativeHoverDelegate } from "../../../../../platform/hover/browser/hover.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IStatusbarService, StatusbarAlignment } from "../../../../services/statusbar/browser/statusbar.js";
import { AI_STATS_SETTING_ID } from "../settingIds.js";
import { createAiStatsChart } from "./aiStatsChart.js";
import "./media.css";
let AiStatsStatusBar = class extends Disposable {
  constructor(_aiStatsFeature, _statusbarService, _commandService, _telemetryService) {
    super();
    this._aiStatsFeature = _aiStatsFeature;
    this._statusbarService = _statusbarService;
    this._commandService = _commandService;
    this._telemetryService = _telemetryService;
    this._register(autorun((reader) => {
      const statusBarItem = this._createStatusBar().keepUpdated(reader.store);
      const store = this._register(new DisposableStore());
      reader.store.add(this._statusbarService.addEntry({
        name: localize("inlineSuggestions", "Inline Suggestions"),
        ariaLabel: localize("inlineSuggestionsStatusBar", "Inline suggestions status bar"),
        text: "",
        tooltip: {
          element: async (_token) => {
            this._sendHoverTelemetry();
            store.clear();
            const elem = createAiStatsHover({
              data: this._aiStatsFeature,
              onOpenSettings: () => openSettingsCommand({ ids: [AI_STATS_SETTING_ID] }).run(this._commandService)
            });
            return elem.keepUpdated(store).element;
          },
          markdownNotSupportedFallback: void 0
        },
        content: statusBarItem.element
      }, "aiStatsStatusBar", StatusbarAlignment.RIGHT, 100));
    }));
  }
  _sendHoverTelemetry() {
    this._telemetryService.publicLog2(
      "aiStatsStatusBar.hover",
      {
        aiRate: this._aiStatsFeature.aiRate.get()
      }
    );
  }
  _createStatusBar() {
    return n.div({
      style: {
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginLeft: "3px",
        marginRight: "3px"
      }
    }, [
      n.div(
        {
          class: "ai-stats-status-bar",
          style: {
            display: "flex",
            flexDirection: "column",
            width: 50,
            height: 6,
            borderRadius: 6,
            borderWidth: "1px",
            borderStyle: "solid"
          }
        },
        [
          n.div({
            style: {
              flex: 1,
              display: "flex",
              overflow: "hidden",
              borderRadius: 6,
              border: "1px solid transparent"
            }
          }, [
            n.div({
              style: {
                width: this._aiStatsFeature.aiRate.map((v) => `${v * 100}%`),
                backgroundColor: "currentColor"
              }
            })
          ])
        ]
      )
    ]);
  }
};
AiStatsStatusBar.hot = createHotClass(AiStatsStatusBar);
AiStatsStatusBar = __decorateClass([
  __decorateParam(1, IStatusbarService),
  __decorateParam(2, ICommandService),
  __decorateParam(3, ITelemetryService)
], AiStatsStatusBar);
function createAiStatsHover(options) {
  const chartViewMode = observableValue("chartViewMode", "days");
  const aiRatePercent = options.data.aiRate.map((r) => `${Math.round(r * 100)}%`);
  const createToggleButton = (mode, tooltip, icon) => {
    return derived((reader) => {
      const currentMode = chartViewMode.read(reader);
      const isActive = currentMode === mode;
      return n.div({
        class: ["chart-toggle-button", isActive ? "active" : ""],
        style: {
          padding: "2px 4px",
          borderRadius: "3px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        },
        onclick: () => {
          chartViewMode.set(mode, void 0);
        },
        title: tooltip
      }, [
        n.div({
          class: ThemeIcon.asClassName(icon),
          style: { fontSize: "14px" }
        })
      ]);
    });
  };
  return n.div({
    class: "ai-stats-status-bar"
  }, [
    n.div(
      {
        class: "header",
        style: {
          minWidth: "280px"
        }
      },
      [
        n.div({ style: { flex: 1 } }, [localize("aiStatsStatusBarHeader", "AI Usage Statistics")]),
        n.div({ style: { marginLeft: "auto" } }, options.onOpenSettings ? actionBar([
          {
            action: {
              id: "aiStats.statusBar.settings",
              label: "",
              enabled: true,
              run: options.onOpenSettings,
              class: ThemeIcon.asClassName(Codicon.gear),
              tooltip: localize("aiStats.statusBar.configure", "Configure")
            },
            options: { icon: true, label: false, hoverDelegate: nativeHoverDelegate }
          }
        ]) : [])
      ]
    ),
    n.div({ style: { display: "flex" } }, [
      n.div({ style: { flex: 1, paddingRight: "4px" } }, [
        localize("text1", "AI vs Typing Average: {0}", aiRatePercent.get())
      ])
    ]),
    n.div({ style: { flex: 1, paddingRight: "4px" } }, [
      localize("text2", "Accepted inline suggestions today: {0}", options.data.acceptedInlineSuggestionsToday.get())
    ]),
    // Chart section
    n.div({
      style: {
        marginTop: "8px",
        borderTop: "1px solid var(--vscode-widget-border)",
        paddingTop: "8px"
      }
    }, [
      // Chart header with toggle
      n.div({
        class: "header",
        style: {
          display: "flex",
          alignItems: "center",
          marginBottom: "4px"
        }
      }, [
        n.div({ style: { flex: 1 } }, [
          chartViewMode.map(
            (mode) => mode === "days" ? localize("chartHeaderDays", "AI Rate by Day") : localize("chartHeaderSessions", "AI Rate by Session")
          )
        ]),
        n.div({
          class: "chart-view-toggle",
          style: { marginLeft: "auto", display: "flex", gap: "2px" }
        }, [
          createToggleButton("days", localize("viewByDays", "Days"), Codicon.calendar),
          createToggleButton("sessions", localize("viewBySessions", "Sessions"), Codicon.listFlat)
        ])
      ]),
      // Chart container
      derived((reader) => {
        const sessions = options.data.sessions.read(reader);
        const viewMode = chartViewMode.read(reader);
        return n.div({
          ref: (container) => {
            const chart = createAiStatsChart({
              sessions,
              viewMode
            });
            container.appendChild(chart);
          }
        });
      })
    ])
  ]);
}
function actionBar(actions, options) {
  return derived((_reader) => n.div({
    class: [],
    style: {},
    ref: (elem) => {
      const actionBar2 = _reader.store.add(new ActionBar(elem, options));
      for (const { action, options: options2 } of actions) {
        actionBar2.push(action, options2);
      }
    }
  }));
}
class CommandWithArgs {
  constructor(commandId, args = []) {
    this.commandId = commandId;
    this.args = args;
  }
  run(commandService) {
    commandService.executeCommand(this.commandId, ...this.args);
  }
}
function openSettingsCommand(options = {}) {
  return new CommandWithArgs("workbench.action.openSettings", [{
    query: options.ids ? options.ids.map((id) => `@id:${id}`).join(" ") : void 0
  }]);
}
export {
  AiStatsStatusBar,
  createAiStatsHover
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGVkaXRUZWxlbWV0cnlcXGJyb3dzZXJcXGVkaXRTdGF0c1xcYWlTdGF0c1N0YXR1c0Jhci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IG4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciwgSUFjdGlvbkJhck9wdGlvbnMsIElBY3Rpb25PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGNyZWF0ZUhvdENsYXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaG90UmVsb2FkSGVscGVycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgZGVyaXZlZCwgSU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBuYXRpdmVIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElTdGF0dXNiYXJTZXJ2aWNlLCBTdGF0dXNiYXJBbGlnbm1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zdGF0dXNiYXIvYnJvd3Nlci9zdGF0dXNiYXIuanMnO1xuaW1wb3J0IHsgQUlfU1RBVFNfU0VUVElOR19JRCB9IGZyb20gJy4uL3NldHRpbmdJZHMuanMnO1xuaW1wb3J0IHR5cGUgeyBBaVN0YXRzRmVhdHVyZSB9IGZyb20gJy4vYWlTdGF0c0ZlYXR1cmUuanMnO1xuaW1wb3J0IHsgQ2hhcnRWaWV3TW9kZSwgY3JlYXRlQWlTdGF0c0NoYXJ0LCBJU2Vzc2lvbkRhdGEgfSBmcm9tICcuL2FpU3RhdHNDaGFydC5qcyc7XG5pbXBvcnQgJy4vbWVkaWEuY3NzJztcblxuZXhwb3J0IGNsYXNzIEFpU3RhdHNTdGF0dXNCYXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBob3QgPSBjcmVhdGVIb3RDbGFzcyh0aGlzKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9haVN0YXRzRmVhdHVyZTogQWlTdGF0c0ZlYXR1cmUsXG5cdFx0QElTdGF0dXNiYXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3N0YXR1c2JhclNlcnZpY2U6IElTdGF0dXNiYXJTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKChyZWFkZXIpID0+IHtcblx0XHRcdGNvbnN0IHN0YXR1c0Jhckl0ZW0gPSB0aGlzLl9jcmVhdGVTdGF0dXNCYXIoKS5rZWVwVXBkYXRlZChyZWFkZXIuc3RvcmUpO1xuXG5cdFx0XHRjb25zdCBzdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0XHRcdHJlYWRlci5zdG9yZS5hZGQodGhpcy5fc3RhdHVzYmFyU2VydmljZS5hZGRFbnRyeSh7XG5cdFx0XHRcdG5hbWU6IGxvY2FsaXplKCdpbmxpbmVTdWdnZXN0aW9ucycsIFwiSW5saW5lIFN1Z2dlc3Rpb25zXCIpLFxuXHRcdFx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKCdpbmxpbmVTdWdnZXN0aW9uc1N0YXR1c0JhcicsIFwiSW5saW5lIHN1Z2dlc3Rpb25zIHN0YXR1cyBiYXJcIiksXG5cdFx0XHRcdHRleHQ6ICcnLFxuXHRcdFx0XHR0b29sdGlwOiB7XG5cdFx0XHRcdFx0ZWxlbWVudDogYXN5bmMgKF90b2tlbikgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5fc2VuZEhvdmVyVGVsZW1ldHJ5KCk7XG5cdFx0XHRcdFx0XHRzdG9yZS5jbGVhcigpO1xuXHRcdFx0XHRcdFx0Y29uc3QgZWxlbSA9IGNyZWF0ZUFpU3RhdHNIb3Zlcih7XG5cdFx0XHRcdFx0XHRcdGRhdGE6IHRoaXMuX2FpU3RhdHNGZWF0dXJlLFxuXHRcdFx0XHRcdFx0XHRvbk9wZW5TZXR0aW5nczogKCkgPT4gb3BlblNldHRpbmdzQ29tbWFuZCh7IGlkczogW0FJX1NUQVRTX1NFVFRJTkdfSURdIH0pLnJ1bih0aGlzLl9jb21tYW5kU2VydmljZSksXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdHJldHVybiBlbGVtLmtlZXBVcGRhdGVkKHN0b3JlKS5lbGVtZW50O1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0bWFya2Rvd25Ob3RTdXBwb3J0ZWRGYWxsYmFjazogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRjb250ZW50OiBzdGF0dXNCYXJJdGVtLmVsZW1lbnQsXG5cdFx0XHR9LCAnYWlTdGF0c1N0YXR1c0JhcicsIFN0YXR1c2JhckFsaWdubWVudC5SSUdIVCwgMTAwKSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2VuZEhvdmVyVGVsZW1ldHJ5KCk6IHZvaWQge1xuXHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjx7XG5cdFx0XHRhaVJhdGU6IG51bWJlcjtcblx0XHR9LCB7XG5cdFx0XHRvd25lcjogJ2hlZGlldCc7XG5cdFx0XHRjb21tZW50OiAnRmlyZWQgd2hlbiB0aGUgQUkgc3RhdHMgc3RhdHVzIGJhciBob3ZlciB0b29sdGlwIGlzIHNob3duJztcblx0XHRcdGFpUmF0ZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBjdXJyZW50IEFJIHJhdGUgcGVyY2VudGFnZScgfTtcblx0XHR9Pihcblx0XHRcdCdhaVN0YXRzU3RhdHVzQmFyLmhvdmVyJyxcblx0XHRcdHtcblx0XHRcdFx0YWlSYXRlOiB0aGlzLl9haVN0YXRzRmVhdHVyZS5haVJhdGUuZ2V0KCksXG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cblx0cHJpdmF0ZSBfY3JlYXRlU3RhdHVzQmFyKCkge1xuXHRcdHJldHVybiBuLmRpdih7XG5cdFx0XHRzdHlsZToge1xuXHRcdFx0XHRoZWlnaHQ6ICcxMDAlJyxcblx0XHRcdFx0ZGlzcGxheTogJ2ZsZXgnLFxuXHRcdFx0XHRhbGlnbkl0ZW1zOiAnY2VudGVyJyxcblx0XHRcdFx0anVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInLFxuXHRcdFx0XHRtYXJnaW5MZWZ0OiAnM3B4Jyxcblx0XHRcdFx0bWFyZ2luUmlnaHQ6ICczcHgnLFxuXHRcdFx0fVxuXHRcdH0sIFtcblx0XHRcdG4uZGl2KFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y2xhc3M6ICdhaS1zdGF0cy1zdGF0dXMtYmFyJyxcblx0XHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdFx0ZGlzcGxheTogJ2ZsZXgnLFxuXHRcdFx0XHRcdFx0ZmxleERpcmVjdGlvbjogJ2NvbHVtbicsXG5cblx0XHRcdFx0XHRcdHdpZHRoOiA1MCxcblx0XHRcdFx0XHRcdGhlaWdodDogNixcblxuXHRcdFx0XHRcdFx0Ym9yZGVyUmFkaXVzOiA2LFxuXHRcdFx0XHRcdFx0Ym9yZGVyV2lkdGg6ICcxcHgnLFxuXHRcdFx0XHRcdFx0Ym9yZGVyU3R5bGU6ICdzb2xpZCcsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0bi5kaXYoe1xuXHRcdFx0XHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0XHRcdFx0ZmxleDogMSxcblxuXHRcdFx0XHRcdFx0XHRkaXNwbGF5OiAnZmxleCcsXG5cdFx0XHRcdFx0XHRcdG92ZXJmbG93OiAnaGlkZGVuJyxcblxuXHRcdFx0XHRcdFx0XHRib3JkZXJSYWRpdXM6IDYsXG5cdFx0XHRcdFx0XHRcdGJvcmRlcjogJzFweCBzb2xpZCB0cmFuc3BhcmVudCcsXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSwgW1xuXHRcdFx0XHRcdFx0bi5kaXYoe1xuXHRcdFx0XHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdFx0XHRcdHdpZHRoOiB0aGlzLl9haVN0YXRzRmVhdHVyZS5haVJhdGUubWFwKHYgPT4gYCR7diAqIDEwMH0lYCksXG5cdFx0XHRcdFx0XHRcdFx0YmFja2dyb3VuZENvbG9yOiAnY3VycmVudENvbG9yJyxcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSlcblx0XHRcdFx0XHRdKVxuXHRcdFx0XHRdXG5cdFx0XHQpXG5cdFx0XSk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQWlTdGF0c0hvdmVyRGF0YSB7XG5cdHJlYWRvbmx5IGFpUmF0ZTogSU9ic2VydmFibGU8bnVtYmVyPjtcblx0cmVhZG9ubHkgYWNjZXB0ZWRJbmxpbmVTdWdnZXN0aW9uc1RvZGF5OiBJT2JzZXJ2YWJsZTxudW1iZXI+O1xuXHRyZWFkb25seSBzZXNzaW9uczogSU9ic2VydmFibGU8cmVhZG9ubHkgSVNlc3Npb25EYXRhW10+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBaVN0YXRzSG92ZXJPcHRpb25zIHtcblx0cmVhZG9ubHkgZGF0YTogSUFpU3RhdHNIb3ZlckRhdGE7XG5cdHJlYWRvbmx5IG9uT3BlblNldHRpbmdzPzogKCkgPT4gdm9pZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUFpU3RhdHNIb3ZlcihvcHRpb25zOiBJQWlTdGF0c0hvdmVyT3B0aW9ucykge1xuXHRjb25zdCBjaGFydFZpZXdNb2RlID0gb2JzZXJ2YWJsZVZhbHVlPENoYXJ0Vmlld01vZGU+KCdjaGFydFZpZXdNb2RlJywgJ2RheXMnKTtcblx0Y29uc3QgYWlSYXRlUGVyY2VudCA9IG9wdGlvbnMuZGF0YS5haVJhdGUubWFwKHIgPT4gYCR7TWF0aC5yb3VuZChyICogMTAwKX0lYCk7XG5cblx0Y29uc3QgY3JlYXRlVG9nZ2xlQnV0dG9uID0gKG1vZGU6IENoYXJ0Vmlld01vZGUsIHRvb2x0aXA6IHN0cmluZywgaWNvbjogVGhlbWVJY29uKSA9PiB7XG5cdFx0cmV0dXJuIGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnRNb2RlID0gY2hhcnRWaWV3TW9kZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBpc0FjdGl2ZSA9IGN1cnJlbnRNb2RlID09PSBtb2RlO1xuXG5cdFx0XHRyZXR1cm4gbi5kaXYoe1xuXHRcdFx0XHRjbGFzczogWydjaGFydC10b2dnbGUtYnV0dG9uJywgaXNBY3RpdmUgPyAnYWN0aXZlJyA6ICcnXSxcblx0XHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0XHRwYWRkaW5nOiAnMnB4IDRweCcsXG5cdFx0XHRcdFx0Ym9yZGVyUmFkaXVzOiAnM3B4Jyxcblx0XHRcdFx0XHRjdXJzb3I6ICdwb2ludGVyJyxcblx0XHRcdFx0XHRkaXNwbGF5OiAnZmxleCcsXG5cdFx0XHRcdFx0YWxpZ25JdGVtczogJ2NlbnRlcicsXG5cdFx0XHRcdFx0anVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRvbmNsaWNrOiAoKSA9PiB7XG5cdFx0XHRcdFx0Y2hhcnRWaWV3TW9kZS5zZXQobW9kZSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0dGl0bGU6IHRvb2x0aXAsXG5cdFx0XHR9LCBbXG5cdFx0XHRcdG4uZGl2KHtcblx0XHRcdFx0XHRjbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGljb24pLFxuXHRcdFx0XHRcdHN0eWxlOiB7IGZvbnRTaXplOiAnMTRweCcgfVxuXHRcdFx0XHR9KVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH07XG5cblx0cmV0dXJuIG4uZGl2KHtcblx0XHRjbGFzczogJ2FpLXN0YXRzLXN0YXR1cy1iYXInLFxuXHR9LCBbXG5cdFx0bi5kaXYoe1xuXHRcdFx0Y2xhc3M6ICdoZWFkZXInLFxuXHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0bWluV2lkdGg6ICcyODBweCcsXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRcdFtcblx0XHRcdFx0bi5kaXYoeyBzdHlsZTogeyBmbGV4OiAxIH0gfSwgW2xvY2FsaXplKCdhaVN0YXRzU3RhdHVzQmFySGVhZGVyJywgXCJBSSBVc2FnZSBTdGF0aXN0aWNzXCIpXSksXG5cdFx0XHRcdG4uZGl2KHsgc3R5bGU6IHsgbWFyZ2luTGVmdDogJ2F1dG8nIH0gfSwgb3B0aW9ucy5vbk9wZW5TZXR0aW5nc1xuXHRcdFx0XHRcdD8gYWN0aW9uQmFyKFtcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdFx0aWQ6ICdhaVN0YXRzLnN0YXR1c0Jhci5zZXR0aW5ncycsXG5cdFx0XHRcdFx0XHRcdFx0bGFiZWw6ICcnLFxuXHRcdFx0XHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRcdFx0cnVuOiBvcHRpb25zLm9uT3BlblNldHRpbmdzLFxuXHRcdFx0XHRcdFx0XHRcdGNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5nZWFyKSxcblx0XHRcdFx0XHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnYWlTdGF0cy5zdGF0dXNCYXIuY29uZmlndXJlJywgXCJDb25maWd1cmVcIilcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0b3B0aW9uczogeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UsIGhvdmVyRGVsZWdhdGU6IG5hdGl2ZUhvdmVyRGVsZWdhdGUgfVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdF0pXG5cdFx0XHRcdFx0OiBbXSlcblx0XHRcdF1cblx0XHQpLFxuXG5cdFx0bi5kaXYoeyBzdHlsZTogeyBkaXNwbGF5OiAnZmxleCcgfSB9LCBbXG5cdFx0XHRuLmRpdih7IHN0eWxlOiB7IGZsZXg6IDEsIHBhZGRpbmdSaWdodDogJzRweCcgfSB9LCBbXG5cdFx0XHRcdGxvY2FsaXplKCd0ZXh0MScsIFwiQUkgdnMgVHlwaW5nIEF2ZXJhZ2U6IHswfVwiLCBhaVJhdGVQZXJjZW50LmdldCgpKSxcblx0XHRcdF0pLFxuXHRcdF0pLFxuXHRcdG4uZGl2KHsgc3R5bGU6IHsgZmxleDogMSwgcGFkZGluZ1JpZ2h0OiAnNHB4JyB9IH0sIFtcblx0XHRcdGxvY2FsaXplKCd0ZXh0MicsIFwiQWNjZXB0ZWQgaW5saW5lIHN1Z2dlc3Rpb25zIHRvZGF5OiB7MH1cIiwgb3B0aW9ucy5kYXRhLmFjY2VwdGVkSW5saW5lU3VnZ2VzdGlvbnNUb2RheS5nZXQoKSksXG5cdFx0XSksXG5cblx0XHQvLyBDaGFydCBzZWN0aW9uXG5cdFx0bi5kaXYoe1xuXHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0bWFyZ2luVG9wOiAnOHB4Jyxcblx0XHRcdFx0Ym9yZGVyVG9wOiAnMXB4IHNvbGlkIHZhcigtLXZzY29kZS13aWRnZXQtYm9yZGVyKScsXG5cdFx0XHRcdHBhZGRpbmdUb3A6ICc4cHgnLFxuXHRcdFx0fVxuXHRcdH0sIFtcblx0XHRcdC8vIENoYXJ0IGhlYWRlciB3aXRoIHRvZ2dsZVxuXHRcdFx0bi5kaXYoe1xuXHRcdFx0XHRjbGFzczogJ2hlYWRlcicsXG5cdFx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdFx0ZGlzcGxheTogJ2ZsZXgnLFxuXHRcdFx0XHRcdGFsaWduSXRlbXM6ICdjZW50ZXInLFxuXHRcdFx0XHRcdG1hcmdpbkJvdHRvbTogJzRweCcsXG5cdFx0XHRcdH1cblx0XHRcdH0sIFtcblx0XHRcdFx0bi5kaXYoeyBzdHlsZTogeyBmbGV4OiAxIH0gfSwgW1xuXHRcdFx0XHRcdGNoYXJ0Vmlld01vZGUubWFwKG1vZGUgPT5cblx0XHRcdFx0XHRcdG1vZGUgPT09ICdkYXlzJ1xuXHRcdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdjaGFydEhlYWRlckRheXMnLCBcIkFJIFJhdGUgYnkgRGF5XCIpXG5cdFx0XHRcdFx0XHRcdDogbG9jYWxpemUoJ2NoYXJ0SGVhZGVyU2Vzc2lvbnMnLCBcIkFJIFJhdGUgYnkgU2Vzc2lvblwiKVxuXHRcdFx0XHRcdClcblx0XHRcdFx0XSksXG5cdFx0XHRcdG4uZGl2KHtcblx0XHRcdFx0XHRjbGFzczogJ2NoYXJ0LXZpZXctdG9nZ2xlJyxcblx0XHRcdFx0XHRzdHlsZTogeyBtYXJnaW5MZWZ0OiAnYXV0bycsIGRpc3BsYXk6ICdmbGV4JywgZ2FwOiAnMnB4JyB9XG5cdFx0XHRcdH0sIFtcblx0XHRcdFx0XHRjcmVhdGVUb2dnbGVCdXR0b24oJ2RheXMnLCBsb2NhbGl6ZSgndmlld0J5RGF5cycsIFwiRGF5c1wiKSwgQ29kaWNvbi5jYWxlbmRhciksXG5cdFx0XHRcdFx0Y3JlYXRlVG9nZ2xlQnV0dG9uKCdzZXNzaW9ucycsIGxvY2FsaXplKCd2aWV3QnlTZXNzaW9ucycsIFwiU2Vzc2lvbnNcIiksIENvZGljb24ubGlzdEZsYXQpLFxuXHRcdFx0XHRdKVxuXHRcdFx0XSksXG5cblx0XHRcdC8vIENoYXJ0IGNvbnRhaW5lclxuXHRcdFx0ZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9ucyA9IG9wdGlvbnMuZGF0YS5zZXNzaW9ucy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IHZpZXdNb2RlID0gY2hhcnRWaWV3TW9kZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdHJldHVybiBuLmRpdih7XG5cdFx0XHRcdFx0cmVmOiAoY29udGFpbmVyKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBjaGFydCA9IGNyZWF0ZUFpU3RhdHNDaGFydCh7XG5cdFx0XHRcdFx0XHRcdHNlc3Npb25zLFxuXHRcdFx0XHRcdFx0XHR2aWV3TW9kZSxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGNoYXJ0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSksXG5cdFx0XSksXG5cdF0pO1xufVxuXG5mdW5jdGlvbiBhY3Rpb25CYXIoYWN0aW9uczogeyBhY3Rpb246IElBY3Rpb247IG9wdGlvbnM6IElBY3Rpb25PcHRpb25zIH1bXSwgb3B0aW9ucz86IElBY3Rpb25CYXJPcHRpb25zKSB7XG5cdHJldHVybiBkZXJpdmVkKChfcmVhZGVyKSA9PiBuLmRpdih7XG5cdFx0Y2xhc3M6IFtdLFxuXHRcdHN0eWxlOiB7XG5cdFx0fSxcblx0XHRyZWY6IGVsZW0gPT4ge1xuXHRcdFx0Y29uc3QgYWN0aW9uQmFyID0gX3JlYWRlci5zdG9yZS5hZGQobmV3IEFjdGlvbkJhcihlbGVtLCBvcHRpb25zKSk7XG5cdFx0XHRmb3IgKGNvbnN0IHsgYWN0aW9uLCBvcHRpb25zIH0gb2YgYWN0aW9ucykge1xuXHRcdFx0XHRhY3Rpb25CYXIucHVzaChhY3Rpb24sIG9wdGlvbnMpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSkpO1xufVxuXG5jbGFzcyBDb21tYW5kV2l0aEFyZ3Mge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgY29tbWFuZElkOiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IGFyZ3M6IHVua25vd25bXSA9IFtdLFxuXHQpIHsgfVxuXG5cdHB1YmxpYyBydW4oY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSk6IHZvaWQge1xuXHRcdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKHRoaXMuY29tbWFuZElkLCAuLi50aGlzLmFyZ3MpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIG9wZW5TZXR0aW5nc0NvbW1hbmQob3B0aW9uczogeyBpZHM/OiBzdHJpbmdbXSB9ID0ge30pIHtcblx0cmV0dXJuIG5ldyBDb21tYW5kV2l0aEFyZ3MoJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzJywgW3tcblx0XHRxdWVyeTogb3B0aW9ucy5pZHMgPyBvcHRpb25zLmlkcy5tYXAoaWQgPT4gYEBpZDoke2lkfWApLmpvaW4oJyAnKSA6IHVuZGVmaW5lZCxcblx0fV0pO1xufVxuIl0s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
