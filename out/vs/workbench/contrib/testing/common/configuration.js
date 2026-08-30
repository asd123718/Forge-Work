import { observableFromEvent } from "../../../../base/common/observable.js";
import { localize } from "../../../../nls.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions } from "../../../common/configuration.js";
var TestingConfigKeys = /* @__PURE__ */ ((TestingConfigKeys2) => {
  TestingConfigKeys2["AutoOpenPeekView"] = "testing.automaticallyOpenPeekView";
  TestingConfigKeys2["AutoOpenPeekViewDuringContinuousRun"] = "testing.automaticallyOpenPeekViewDuringAutoRun";
  TestingConfigKeys2["OpenResults"] = "testing.automaticallyOpenTestResults";
  TestingConfigKeys2["FollowRunningTest"] = "testing.followRunningTest";
  TestingConfigKeys2["DefaultGutterClickAction"] = "testing.defaultGutterClickAction";
  TestingConfigKeys2["GutterEnabled"] = "testing.gutterEnabled";
  TestingConfigKeys2["SaveBeforeTest"] = "testing.saveBeforeTest";
  TestingConfigKeys2["AlwaysRevealTestOnStateChange"] = "testing.alwaysRevealTestOnStateChange";
  TestingConfigKeys2["CountBadge"] = "testing.countBadge";
  TestingConfigKeys2["ShowAllMessages"] = "testing.showAllMessages";
  TestingConfigKeys2["CoveragePercent"] = "testing.displayedCoveragePercent";
  TestingConfigKeys2["ShowCoverageInExplorer"] = "testing.showCoverageInExplorer";
  TestingConfigKeys2["CoverageBarThresholds"] = "testing.coverageBarThresholds";
  TestingConfigKeys2["CoverageToolbarEnabled"] = "testing.coverageToolbarEnabled";
  TestingConfigKeys2["CoverageMinimapEnabled"] = "testing.coverageMinimapEnabled";
  TestingConfigKeys2["ResultsViewLayout"] = "testing.resultsView.layout";
  return TestingConfigKeys2;
})(TestingConfigKeys || {});
var AutoOpenTesting = /* @__PURE__ */ ((AutoOpenTesting2) => {
  AutoOpenTesting2["NeverOpen"] = "neverOpen";
  AutoOpenTesting2["OpenOnTestStart"] = "openOnTestStart";
  AutoOpenTesting2["OpenOnTestFailure"] = "openOnTestFailure";
  AutoOpenTesting2["OpenExplorerOnTestStart"] = "openExplorerOnTestStart";
  return AutoOpenTesting2;
})(AutoOpenTesting || {});
var AutoOpenPeekViewWhen = /* @__PURE__ */ ((AutoOpenPeekViewWhen2) => {
  AutoOpenPeekViewWhen2["FailureVisible"] = "failureInVisibleDocument";
  AutoOpenPeekViewWhen2["FailureAnywhere"] = "failureAnywhere";
  AutoOpenPeekViewWhen2["Never"] = "never";
  return AutoOpenPeekViewWhen2;
})(AutoOpenPeekViewWhen || {});
var DefaultGutterClickAction = /* @__PURE__ */ ((DefaultGutterClickAction2) => {
  DefaultGutterClickAction2["Run"] = "run";
  DefaultGutterClickAction2["Debug"] = "debug";
  DefaultGutterClickAction2["Coverage"] = "runWithCoverage";
  DefaultGutterClickAction2["ContextMenu"] = "contextMenu";
  return DefaultGutterClickAction2;
})(DefaultGutterClickAction || {});
var TestingCountBadge = /* @__PURE__ */ ((TestingCountBadge2) => {
  TestingCountBadge2["Failed"] = "failed";
  TestingCountBadge2["Off"] = "off";
  TestingCountBadge2["Passed"] = "passed";
  TestingCountBadge2["Skipped"] = "skipped";
  return TestingCountBadge2;
})(TestingCountBadge || {});
var TestingDisplayedCoveragePercent = /* @__PURE__ */ ((TestingDisplayedCoveragePercent2) => {
  TestingDisplayedCoveragePercent2["TotalCoverage"] = "totalCoverage";
  TestingDisplayedCoveragePercent2["Statement"] = "statement";
  TestingDisplayedCoveragePercent2["Minimum"] = "minimum";
  return TestingDisplayedCoveragePercent2;
})(TestingDisplayedCoveragePercent || {});
var TestingResultsViewLayout = /* @__PURE__ */ ((TestingResultsViewLayout2) => {
  TestingResultsViewLayout2["TreeLeft"] = "treeLeft";
  TestingResultsViewLayout2["TreeRight"] = "treeRight";
  return TestingResultsViewLayout2;
})(TestingResultsViewLayout || {});
const testingConfiguration = {
  id: "testing",
  order: 21,
  title: localize("testConfigurationTitle", "Testing"),
  type: "object",
  properties: {
    ["testing.automaticallyOpenPeekView" /* AutoOpenPeekView */]: {
      description: localize("testing.automaticallyOpenPeekView", "Configures when the error Peek view is automatically opened."),
      enum: [
        "failureAnywhere" /* FailureAnywhere */,
        "failureInVisibleDocument" /* FailureVisible */,
        "never" /* Never */
      ],
      default: "never" /* Never */,
      enumDescriptions: [
        localize("testing.automaticallyOpenPeekView.failureAnywhere", "Open automatically no matter where the failure is."),
        localize("testing.automaticallyOpenPeekView.failureInVisibleDocument", "Open automatically when a test fails in a visible document."),
        localize("testing.automaticallyOpenPeekView.never", "Never automatically open.")
      ]
    },
    ["testing.showAllMessages" /* ShowAllMessages */]: {
      description: localize("testing.showAllMessages", "Controls whether to show messages from all test runs."),
      type: "boolean",
      default: false
    },
    ["testing.automaticallyOpenPeekViewDuringAutoRun" /* AutoOpenPeekViewDuringContinuousRun */]: {
      description: localize("testing.automaticallyOpenPeekViewDuringContinuousRun", "Controls whether to automatically open the Peek view during continuous run mode."),
      type: "boolean",
      default: false
    },
    ["testing.countBadge" /* CountBadge */]: {
      description: localize("testing.countBadge", "Controls the count badge on the Testing icon on the Activity Bar."),
      enum: [
        "failed" /* Failed */,
        "off" /* Off */,
        "passed" /* Passed */,
        "skipped" /* Skipped */
      ],
      enumDescriptions: [
        localize("testing.countBadge.failed", "Show the number of failed tests"),
        localize("testing.countBadge.off", "Disable the testing count badge"),
        localize("testing.countBadge.passed", "Show the number of passed tests"),
        localize("testing.countBadge.skipped", "Show the number of skipped tests")
      ],
      default: "failed" /* Failed */
    },
    ["testing.followRunningTest" /* FollowRunningTest */]: {
      description: localize("testing.followRunningTest", "Controls whether the running test should be followed in the Test Explorer view."),
      type: "boolean",
      default: false
    },
    ["testing.defaultGutterClickAction" /* DefaultGutterClickAction */]: {
      description: localize("testing.defaultGutterClickAction", "Controls the action to take when left-clicking on a test decoration in the gutter."),
      enum: [
        "run" /* Run */,
        "debug" /* Debug */,
        "runWithCoverage" /* Coverage */,
        "contextMenu" /* ContextMenu */
      ],
      enumDescriptions: [
        localize("testing.defaultGutterClickAction.run", "Run the test."),
        localize("testing.defaultGutterClickAction.debug", "Debug the test."),
        localize("testing.defaultGutterClickAction.coverage", "Run the test with coverage."),
        localize("testing.defaultGutterClickAction.contextMenu", "Open the context menu for more options.")
      ],
      default: "run" /* Run */
    },
    ["testing.gutterEnabled" /* GutterEnabled */]: {
      description: localize("testing.gutterEnabled", "Controls whether test decorations are shown in the editor gutter."),
      type: "boolean",
      default: true
    },
    ["testing.saveBeforeTest" /* SaveBeforeTest */]: {
      description: localize("testing.saveBeforeTest", "Control whether save all dirty editors before running a test."),
      type: "boolean",
      default: true
    },
    ["testing.automaticallyOpenTestResults" /* OpenResults */]: {
      enum: [
        "neverOpen" /* NeverOpen */,
        "openOnTestStart" /* OpenOnTestStart */,
        "openOnTestFailure" /* OpenOnTestFailure */,
        "openExplorerOnTestStart" /* OpenExplorerOnTestStart */
      ],
      enumDescriptions: [
        localize("testing.openTesting.neverOpen", "Never automatically open the testing views"),
        localize("testing.openTesting.openOnTestStart", "Open the test results view when tests start"),
        localize("testing.openTesting.openOnTestFailure", "Open the test result view on any test failure"),
        localize("testing.openTesting.openExplorerOnTestStart", "Open the test explorer when tests start")
      ],
      default: "openOnTestStart",
      description: localize("testing.openTesting", "Controls when the testing view should open.")
    },
    ["testing.alwaysRevealTestOnStateChange" /* AlwaysRevealTestOnStateChange */]: {
      markdownDescription: localize("testing.alwaysRevealTestOnStateChange", "Always reveal the executed test when {0} is on. If this setting is turned off, only failed tests will be revealed.", "`#testing.followRunningTest#`"),
      type: "boolean",
      default: false
    },
    ["testing.showCoverageInExplorer" /* ShowCoverageInExplorer */]: {
      description: localize("testing.ShowCoverageInExplorer", "Whether test coverage should be down in the File Explorer view."),
      type: "boolean",
      default: true
    },
    ["testing.displayedCoveragePercent" /* CoveragePercent */]: {
      markdownDescription: localize("testing.displayedCoveragePercent", "Configures what percentage is displayed by default for test coverage."),
      default: "totalCoverage" /* TotalCoverage */,
      enum: [
        "totalCoverage" /* TotalCoverage */,
        "statement" /* Statement */,
        "minimum" /* Minimum */
      ],
      enumDescriptions: [
        localize("testing.displayedCoveragePercent.totalCoverage", "A calculation of the combined statement, function, and branch coverage."),
        localize("testing.displayedCoveragePercent.statement", "The statement coverage."),
        localize("testing.displayedCoveragePercent.minimum", "The minimum of statement, function, and branch coverage.")
      ]
    },
    ["testing.coverageBarThresholds" /* CoverageBarThresholds */]: {
      markdownDescription: localize("testing.coverageBarThresholds", "Configures the colors used for percentages in test coverage bars."),
      default: { red: 0, yellow: 60, green: 90 },
      properties: {
        red: { type: "number", minimum: 0, maximum: 100, default: 0 },
        yellow: { type: "number", minimum: 0, maximum: 100, default: 60 },
        green: { type: "number", minimum: 0, maximum: 100, default: 90 }
      }
    },
    ["testing.coverageToolbarEnabled" /* CoverageToolbarEnabled */]: {
      description: localize("testing.coverageToolbarEnabled", "Controls whether the coverage toolbar is shown in the editor."),
      type: "boolean",
      default: false
      // todo@connor4312: disabled by default until UI sync
    },
    ["testing.coverageMinimapEnabled" /* CoverageMinimapEnabled */]: {
      description: localize("testing.coverageMinimapEnabled", "Controls whether coverage indicators are shown in the minimap."),
      type: "boolean",
      default: true
    },
    ["testing.resultsView.layout" /* ResultsViewLayout */]: {
      description: localize("testing.resultsView.layout", "Controls the layout of the Test Results view."),
      enum: [
        "treeRight" /* TreeRight */,
        "treeLeft" /* TreeLeft */
      ],
      enumDescriptions: [
        localize("testing.resultsView.layout.treeRight", "Show the test run tree on the right side with details on the left."),
        localize("testing.resultsView.layout.treeLeft", "Show the test run tree on the left side with details on the right.")
      ],
      default: "treeRight" /* TreeRight */
    }
  }
};
Registry.as(Extensions.ConfigurationMigration).registerConfigurationMigrations([{
  key: "testing.openTesting",
  migrateFn: (value) => {
    return [["testing.automaticallyOpenTestResults" /* OpenResults */, { value }]];
  }
}]);
const getTestingConfiguration = (config, key) => config.getValue(key);
const observeTestingConfiguration = (config, key) => observableFromEvent(config.onDidChangeConfiguration, () => getTestingConfiguration(config, key));
export {
  AutoOpenPeekViewWhen,
  AutoOpenTesting,
  DefaultGutterClickAction,
  TestingConfigKeys,
  TestingCountBadge,
  TestingDisplayedCoveragePercent,
  TestingResultsViewLayout,
  getTestingConfiguration,
  observeTestingConfiguration,
  testingConfiguration
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlc3RpbmdcXGNvbW1vblxcY29uZmlndXJhdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IG9ic2VydmFibGVGcm9tRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25Ob2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25LZXlWYWx1ZVBhaXJzLCBFeHRlbnNpb25zLCBJQ29uZmlndXJhdGlvbk1pZ3JhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuXG5leHBvcnQgY29uc3QgZW51bSBUZXN0aW5nQ29uZmlnS2V5cyB7XG5cdEF1dG9PcGVuUGVla1ZpZXcgPSAndGVzdGluZy5hdXRvbWF0aWNhbGx5T3BlblBlZWtWaWV3Jyxcblx0QXV0b09wZW5QZWVrVmlld0R1cmluZ0NvbnRpbnVvdXNSdW4gPSAndGVzdGluZy5hdXRvbWF0aWNhbGx5T3BlblBlZWtWaWV3RHVyaW5nQXV0b1J1bicsXG5cdE9wZW5SZXN1bHRzID0gJ3Rlc3RpbmcuYXV0b21hdGljYWxseU9wZW5UZXN0UmVzdWx0cycsXG5cdEZvbGxvd1J1bm5pbmdUZXN0ID0gJ3Rlc3RpbmcuZm9sbG93UnVubmluZ1Rlc3QnLFxuXHREZWZhdWx0R3V0dGVyQ2xpY2tBY3Rpb24gPSAndGVzdGluZy5kZWZhdWx0R3V0dGVyQ2xpY2tBY3Rpb24nLFxuXHRHdXR0ZXJFbmFibGVkID0gJ3Rlc3RpbmcuZ3V0dGVyRW5hYmxlZCcsXG5cdFNhdmVCZWZvcmVUZXN0ID0gJ3Rlc3Rpbmcuc2F2ZUJlZm9yZVRlc3QnLFxuXHRBbHdheXNSZXZlYWxUZXN0T25TdGF0ZUNoYW5nZSA9ICd0ZXN0aW5nLmFsd2F5c1JldmVhbFRlc3RPblN0YXRlQ2hhbmdlJyxcblx0Q291bnRCYWRnZSA9ICd0ZXN0aW5nLmNvdW50QmFkZ2UnLFxuXHRTaG93QWxsTWVzc2FnZXMgPSAndGVzdGluZy5zaG93QWxsTWVzc2FnZXMnLFxuXHRDb3ZlcmFnZVBlcmNlbnQgPSAndGVzdGluZy5kaXNwbGF5ZWRDb3ZlcmFnZVBlcmNlbnQnLFxuXHRTaG93Q292ZXJhZ2VJbkV4cGxvcmVyID0gJ3Rlc3Rpbmcuc2hvd0NvdmVyYWdlSW5FeHBsb3JlcicsXG5cdENvdmVyYWdlQmFyVGhyZXNob2xkcyA9ICd0ZXN0aW5nLmNvdmVyYWdlQmFyVGhyZXNob2xkcycsXG5cdENvdmVyYWdlVG9vbGJhckVuYWJsZWQgPSAndGVzdGluZy5jb3ZlcmFnZVRvb2xiYXJFbmFibGVkJyxcblx0Q292ZXJhZ2VNaW5pbWFwRW5hYmxlZCA9ICd0ZXN0aW5nLmNvdmVyYWdlTWluaW1hcEVuYWJsZWQnLFxuXHRSZXN1bHRzVmlld0xheW91dCA9ICd0ZXN0aW5nLnJlc3VsdHNWaWV3LmxheW91dCcsXG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIEF1dG9PcGVuVGVzdGluZyB7XG5cdE5ldmVyT3BlbiA9ICduZXZlck9wZW4nLFxuXHRPcGVuT25UZXN0U3RhcnQgPSAnb3Blbk9uVGVzdFN0YXJ0Jyxcblx0T3Blbk9uVGVzdEZhaWx1cmUgPSAnb3Blbk9uVGVzdEZhaWx1cmUnLFxuXHRPcGVuRXhwbG9yZXJPblRlc3RTdGFydCA9ICdvcGVuRXhwbG9yZXJPblRlc3RTdGFydCcsXG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIEF1dG9PcGVuUGVla1ZpZXdXaGVuIHtcblx0RmFpbHVyZVZpc2libGUgPSAnZmFpbHVyZUluVmlzaWJsZURvY3VtZW50Jyxcblx0RmFpbHVyZUFueXdoZXJlID0gJ2ZhaWx1cmVBbnl3aGVyZScsXG5cdE5ldmVyID0gJ25ldmVyJyxcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gRGVmYXVsdEd1dHRlckNsaWNrQWN0aW9uIHtcblx0UnVuID0gJ3J1bicsXG5cdERlYnVnID0gJ2RlYnVnJyxcblx0Q292ZXJhZ2UgPSAncnVuV2l0aENvdmVyYWdlJyxcblx0Q29udGV4dE1lbnUgPSAnY29udGV4dE1lbnUnLFxufVxuXG5leHBvcnQgY29uc3QgZW51bSBUZXN0aW5nQ291bnRCYWRnZSB7XG5cdEZhaWxlZCA9ICdmYWlsZWQnLFxuXHRPZmYgPSAnb2ZmJyxcblx0UGFzc2VkID0gJ3Bhc3NlZCcsXG5cdFNraXBwZWQgPSAnc2tpcHBlZCcsXG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIFRlc3RpbmdEaXNwbGF5ZWRDb3ZlcmFnZVBlcmNlbnQge1xuXHRUb3RhbENvdmVyYWdlID0gJ3RvdGFsQ292ZXJhZ2UnLFxuXHRTdGF0ZW1lbnQgPSAnc3RhdGVtZW50Jyxcblx0TWluaW11bSA9ICdtaW5pbXVtJyxcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gVGVzdGluZ1Jlc3VsdHNWaWV3TGF5b3V0IHtcblx0VHJlZUxlZnQgPSAndHJlZUxlZnQnLFxuXHRUcmVlUmlnaHQgPSAndHJlZVJpZ2h0Jyxcbn1cblxuZXhwb3J0IGNvbnN0IHRlc3RpbmdDb25maWd1cmF0aW9uOiBJQ29uZmlndXJhdGlvbk5vZGUgPSB7XG5cdGlkOiAndGVzdGluZycsXG5cdG9yZGVyOiAyMSxcblx0dGl0bGU6IGxvY2FsaXplKCd0ZXN0Q29uZmlndXJhdGlvblRpdGxlJywgXCJUZXN0aW5nXCIpLFxuXHR0eXBlOiAnb2JqZWN0Jyxcblx0cHJvcGVydGllczoge1xuXHRcdFtUZXN0aW5nQ29uZmlnS2V5cy5BdXRvT3BlblBlZWtWaWV3XToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXN0aW5nLmF1dG9tYXRpY2FsbHlPcGVuUGVla1ZpZXcnLCBcIkNvbmZpZ3VyZXMgd2hlbiB0aGUgZXJyb3IgUGVlayB2aWV3IGlzIGF1dG9tYXRpY2FsbHkgb3BlbmVkLlwiKSxcblx0XHRcdGVudW06IFtcblx0XHRcdFx0QXV0b09wZW5QZWVrVmlld1doZW4uRmFpbHVyZUFueXdoZXJlLFxuXHRcdFx0XHRBdXRvT3BlblBlZWtWaWV3V2hlbi5GYWlsdXJlVmlzaWJsZSxcblx0XHRcdFx0QXV0b09wZW5QZWVrVmlld1doZW4uTmV2ZXIsXG5cdFx0XHRdLFxuXHRcdFx0ZGVmYXVsdDogQXV0b09wZW5QZWVrVmlld1doZW4uTmV2ZXIsXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdGxvY2FsaXplKCd0ZXN0aW5nLmF1dG9tYXRpY2FsbHlPcGVuUGVla1ZpZXcuZmFpbHVyZUFueXdoZXJlJywgXCJPcGVuIGF1dG9tYXRpY2FsbHkgbm8gbWF0dGVyIHdoZXJlIHRoZSBmYWlsdXJlIGlzLlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ3Rlc3RpbmcuYXV0b21hdGljYWxseU9wZW5QZWVrVmlldy5mYWlsdXJlSW5WaXNpYmxlRG9jdW1lbnQnLCBcIk9wZW4gYXV0b21hdGljYWxseSB3aGVuIGEgdGVzdCBmYWlscyBpbiBhIHZpc2libGUgZG9jdW1lbnQuXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgndGVzdGluZy5hdXRvbWF0aWNhbGx5T3BlblBlZWtWaWV3Lm5ldmVyJywgXCJOZXZlciBhdXRvbWF0aWNhbGx5IG9wZW4uXCIpLFxuXHRcdFx0XSxcblx0XHR9LFxuXHRcdFtUZXN0aW5nQ29uZmlnS2V5cy5TaG93QWxsTWVzc2FnZXNdOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlc3Rpbmcuc2hvd0FsbE1lc3NhZ2VzJywgXCJDb250cm9scyB3aGV0aGVyIHRvIHNob3cgbWVzc2FnZXMgZnJvbSBhbGwgdGVzdCBydW5zLlwiKSxcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdH0sXG5cdFx0W1Rlc3RpbmdDb25maWdLZXlzLkF1dG9PcGVuUGVla1ZpZXdEdXJpbmdDb250aW51b3VzUnVuXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXN0aW5nLmF1dG9tYXRpY2FsbHlPcGVuUGVla1ZpZXdEdXJpbmdDb250aW51b3VzUnVuJywgXCJDb250cm9scyB3aGV0aGVyIHRvIGF1dG9tYXRpY2FsbHkgb3BlbiB0aGUgUGVlayB2aWV3IGR1cmluZyBjb250aW51b3VzIHJ1biBtb2RlLlwiKSxcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdH0sXG5cdFx0W1Rlc3RpbmdDb25maWdLZXlzLkNvdW50QmFkZ2VdOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlc3RpbmcuY291bnRCYWRnZScsICdDb250cm9scyB0aGUgY291bnQgYmFkZ2Ugb24gdGhlIFRlc3RpbmcgaWNvbiBvbiB0aGUgQWN0aXZpdHkgQmFyLicpLFxuXHRcdFx0ZW51bTogW1xuXHRcdFx0XHRUZXN0aW5nQ291bnRCYWRnZS5GYWlsZWQsXG5cdFx0XHRcdFRlc3RpbmdDb3VudEJhZGdlLk9mZixcblx0XHRcdFx0VGVzdGluZ0NvdW50QmFkZ2UuUGFzc2VkLFxuXHRcdFx0XHRUZXN0aW5nQ291bnRCYWRnZS5Ta2lwcGVkLFxuXHRcdFx0XSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bG9jYWxpemUoJ3Rlc3RpbmcuY291bnRCYWRnZS5mYWlsZWQnLCAnU2hvdyB0aGUgbnVtYmVyIG9mIGZhaWxlZCB0ZXN0cycpLFxuXHRcdFx0XHRsb2NhbGl6ZSgndGVzdGluZy5jb3VudEJhZGdlLm9mZicsICdEaXNhYmxlIHRoZSB0ZXN0aW5nIGNvdW50IGJhZGdlJyksXG5cdFx0XHRcdGxvY2FsaXplKCd0ZXN0aW5nLmNvdW50QmFkZ2UucGFzc2VkJywgJ1Nob3cgdGhlIG51bWJlciBvZiBwYXNzZWQgdGVzdHMnKSxcblx0XHRcdFx0bG9jYWxpemUoJ3Rlc3RpbmcuY291bnRCYWRnZS5za2lwcGVkJywgJ1Nob3cgdGhlIG51bWJlciBvZiBza2lwcGVkIHRlc3RzJyksXG5cdFx0XHRdLFxuXHRcdFx0ZGVmYXVsdDogVGVzdGluZ0NvdW50QmFkZ2UuRmFpbGVkLFxuXHRcdH0sXG5cdFx0W1Rlc3RpbmdDb25maWdLZXlzLkZvbGxvd1J1bm5pbmdUZXN0XToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXN0aW5nLmZvbGxvd1J1bm5pbmdUZXN0JywgJ0NvbnRyb2xzIHdoZXRoZXIgdGhlIHJ1bm5pbmcgdGVzdCBzaG91bGQgYmUgZm9sbG93ZWQgaW4gdGhlIFRlc3QgRXhwbG9yZXIgdmlldy4nKSxcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdH0sXG5cdFx0W1Rlc3RpbmdDb25maWdLZXlzLkRlZmF1bHRHdXR0ZXJDbGlja0FjdGlvbl06IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVzdGluZy5kZWZhdWx0R3V0dGVyQ2xpY2tBY3Rpb24nLCAnQ29udHJvbHMgdGhlIGFjdGlvbiB0byB0YWtlIHdoZW4gbGVmdC1jbGlja2luZyBvbiBhIHRlc3QgZGVjb3JhdGlvbiBpbiB0aGUgZ3V0dGVyLicpLFxuXHRcdFx0ZW51bTogW1xuXHRcdFx0XHREZWZhdWx0R3V0dGVyQ2xpY2tBY3Rpb24uUnVuLFxuXHRcdFx0XHREZWZhdWx0R3V0dGVyQ2xpY2tBY3Rpb24uRGVidWcsXG5cdFx0XHRcdERlZmF1bHRHdXR0ZXJDbGlja0FjdGlvbi5Db3ZlcmFnZSxcblx0XHRcdFx0RGVmYXVsdEd1dHRlckNsaWNrQWN0aW9uLkNvbnRleHRNZW51LFxuXHRcdFx0XSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bG9jYWxpemUoJ3Rlc3RpbmcuZGVmYXVsdEd1dHRlckNsaWNrQWN0aW9uLnJ1bicsICdSdW4gdGhlIHRlc3QuJyksXG5cdFx0XHRcdGxvY2FsaXplKCd0ZXN0aW5nLmRlZmF1bHRHdXR0ZXJDbGlja0FjdGlvbi5kZWJ1ZycsICdEZWJ1ZyB0aGUgdGVzdC4nKSxcblx0XHRcdFx0bG9jYWxpemUoJ3Rlc3RpbmcuZGVmYXVsdEd1dHRlckNsaWNrQWN0aW9uLmNvdmVyYWdlJywgJ1J1biB0aGUgdGVzdCB3aXRoIGNvdmVyYWdlLicpLFxuXHRcdFx0XHRsb2NhbGl6ZSgndGVzdGluZy5kZWZhdWx0R3V0dGVyQ2xpY2tBY3Rpb24uY29udGV4dE1lbnUnLCAnT3BlbiB0aGUgY29udGV4dCBtZW51IGZvciBtb3JlIG9wdGlvbnMuJyksXG5cdFx0XHRdLFxuXHRcdFx0ZGVmYXVsdDogRGVmYXVsdEd1dHRlckNsaWNrQWN0aW9uLlJ1bixcblx0XHR9LFxuXHRcdFtUZXN0aW5nQ29uZmlnS2V5cy5HdXR0ZXJFbmFibGVkXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXN0aW5nLmd1dHRlckVuYWJsZWQnLCAnQ29udHJvbHMgd2hldGhlciB0ZXN0IGRlY29yYXRpb25zIGFyZSBzaG93biBpbiB0aGUgZWRpdG9yIGd1dHRlci4nKSxcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0fSxcblx0XHRbVGVzdGluZ0NvbmZpZ0tleXMuU2F2ZUJlZm9yZVRlc3RdOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlc3Rpbmcuc2F2ZUJlZm9yZVRlc3QnLCAnQ29udHJvbCB3aGV0aGVyIHNhdmUgYWxsIGRpcnR5IGVkaXRvcnMgYmVmb3JlIHJ1bm5pbmcgYSB0ZXN0LicpLFxuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHR9LFxuXHRcdFtUZXN0aW5nQ29uZmlnS2V5cy5PcGVuUmVzdWx0c106IHtcblx0XHRcdGVudW06IFtcblx0XHRcdFx0QXV0b09wZW5UZXN0aW5nLk5ldmVyT3Blbixcblx0XHRcdFx0QXV0b09wZW5UZXN0aW5nLk9wZW5PblRlc3RTdGFydCxcblx0XHRcdFx0QXV0b09wZW5UZXN0aW5nLk9wZW5PblRlc3RGYWlsdXJlLFxuXHRcdFx0XHRBdXRvT3BlblRlc3RpbmcuT3BlbkV4cGxvcmVyT25UZXN0U3RhcnQsXG5cdFx0XHRdLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRsb2NhbGl6ZSgndGVzdGluZy5vcGVuVGVzdGluZy5uZXZlck9wZW4nLCAnTmV2ZXIgYXV0b21hdGljYWxseSBvcGVuIHRoZSB0ZXN0aW5nIHZpZXdzJyksXG5cdFx0XHRcdGxvY2FsaXplKCd0ZXN0aW5nLm9wZW5UZXN0aW5nLm9wZW5PblRlc3RTdGFydCcsICdPcGVuIHRoZSB0ZXN0IHJlc3VsdHMgdmlldyB3aGVuIHRlc3RzIHN0YXJ0JyksXG5cdFx0XHRcdGxvY2FsaXplKCd0ZXN0aW5nLm9wZW5UZXN0aW5nLm9wZW5PblRlc3RGYWlsdXJlJywgJ09wZW4gdGhlIHRlc3QgcmVzdWx0IHZpZXcgb24gYW55IHRlc3QgZmFpbHVyZScpLFxuXHRcdFx0XHRsb2NhbGl6ZSgndGVzdGluZy5vcGVuVGVzdGluZy5vcGVuRXhwbG9yZXJPblRlc3RTdGFydCcsICdPcGVuIHRoZSB0ZXN0IGV4cGxvcmVyIHdoZW4gdGVzdHMgc3RhcnQnKSxcblx0XHRcdF0sXG5cdFx0XHRkZWZhdWx0OiAnb3Blbk9uVGVzdFN0YXJ0Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVzdGluZy5vcGVuVGVzdGluZycsIFwiQ29udHJvbHMgd2hlbiB0aGUgdGVzdGluZyB2aWV3IHNob3VsZCBvcGVuLlwiKVxuXHRcdH0sXG5cdFx0W1Rlc3RpbmdDb25maWdLZXlzLkFsd2F5c1JldmVhbFRlc3RPblN0YXRlQ2hhbmdlXToge1xuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlc3RpbmcuYWx3YXlzUmV2ZWFsVGVzdE9uU3RhdGVDaGFuZ2UnLCBcIkFsd2F5cyByZXZlYWwgdGhlIGV4ZWN1dGVkIHRlc3Qgd2hlbiB7MH0gaXMgb24uIElmIHRoaXMgc2V0dGluZyBpcyB0dXJuZWQgb2ZmLCBvbmx5IGZhaWxlZCB0ZXN0cyB3aWxsIGJlIHJldmVhbGVkLlwiLCAnYCN0ZXN0aW5nLmZvbGxvd1J1bm5pbmdUZXN0I2AnKSxcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdH0sXG5cdFx0W1Rlc3RpbmdDb25maWdLZXlzLlNob3dDb3ZlcmFnZUluRXhwbG9yZXJdOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlc3RpbmcuU2hvd0NvdmVyYWdlSW5FeHBsb3JlcicsIFwiV2hldGhlciB0ZXN0IGNvdmVyYWdlIHNob3VsZCBiZSBkb3duIGluIHRoZSBGaWxlIEV4cGxvcmVyIHZpZXcuXCIpLFxuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHR9LFxuXHRcdFtUZXN0aW5nQ29uZmlnS2V5cy5Db3ZlcmFnZVBlcmNlbnRdOiB7XG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVzdGluZy5kaXNwbGF5ZWRDb3ZlcmFnZVBlcmNlbnQnLCBcIkNvbmZpZ3VyZXMgd2hhdCBwZXJjZW50YWdlIGlzIGRpc3BsYXllZCBieSBkZWZhdWx0IGZvciB0ZXN0IGNvdmVyYWdlLlwiKSxcblx0XHRcdGRlZmF1bHQ6IFRlc3RpbmdEaXNwbGF5ZWRDb3ZlcmFnZVBlcmNlbnQuVG90YWxDb3ZlcmFnZSxcblx0XHRcdGVudW06IFtcblx0XHRcdFx0VGVzdGluZ0Rpc3BsYXllZENvdmVyYWdlUGVyY2VudC5Ub3RhbENvdmVyYWdlLFxuXHRcdFx0XHRUZXN0aW5nRGlzcGxheWVkQ292ZXJhZ2VQZXJjZW50LlN0YXRlbWVudCxcblx0XHRcdFx0VGVzdGluZ0Rpc3BsYXllZENvdmVyYWdlUGVyY2VudC5NaW5pbXVtLFxuXHRcdFx0XSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bG9jYWxpemUoJ3Rlc3RpbmcuZGlzcGxheWVkQ292ZXJhZ2VQZXJjZW50LnRvdGFsQ292ZXJhZ2UnLCAnQSBjYWxjdWxhdGlvbiBvZiB0aGUgY29tYmluZWQgc3RhdGVtZW50LCBmdW5jdGlvbiwgYW5kIGJyYW5jaCBjb3ZlcmFnZS4nKSxcblx0XHRcdFx0bG9jYWxpemUoJ3Rlc3RpbmcuZGlzcGxheWVkQ292ZXJhZ2VQZXJjZW50LnN0YXRlbWVudCcsICdUaGUgc3RhdGVtZW50IGNvdmVyYWdlLicpLFxuXHRcdFx0XHRsb2NhbGl6ZSgndGVzdGluZy5kaXNwbGF5ZWRDb3ZlcmFnZVBlcmNlbnQubWluaW11bScsICdUaGUgbWluaW11bSBvZiBzdGF0ZW1lbnQsIGZ1bmN0aW9uLCBhbmQgYnJhbmNoIGNvdmVyYWdlLicpLFxuXHRcdFx0XSxcblx0XHR9LFxuXHRcdFtUZXN0aW5nQ29uZmlnS2V5cy5Db3ZlcmFnZUJhclRocmVzaG9sZHNdOiB7XG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVzdGluZy5jb3ZlcmFnZUJhclRocmVzaG9sZHMnLCBcIkNvbmZpZ3VyZXMgdGhlIGNvbG9ycyB1c2VkIGZvciBwZXJjZW50YWdlcyBpbiB0ZXN0IGNvdmVyYWdlIGJhcnMuXCIpLFxuXHRcdFx0ZGVmYXVsdDogeyByZWQ6IDAsIHllbGxvdzogNjAsIGdyZWVuOiA5MCB9LFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRyZWQ6IHsgdHlwZTogJ251bWJlcicsIG1pbmltdW06IDAsIG1heGltdW06IDEwMCwgZGVmYXVsdDogMCB9LFxuXHRcdFx0XHR5ZWxsb3c6IHsgdHlwZTogJ251bWJlcicsIG1pbmltdW06IDAsIG1heGltdW06IDEwMCwgZGVmYXVsdDogNjAgfSxcblx0XHRcdFx0Z3JlZW46IHsgdHlwZTogJ251bWJlcicsIG1pbmltdW06IDAsIG1heGltdW06IDEwMCwgZGVmYXVsdDogOTAgfSxcblx0XHRcdH0sXG5cdFx0fSxcblx0XHRbVGVzdGluZ0NvbmZpZ0tleXMuQ292ZXJhZ2VUb29sYmFyRW5hYmxlZF06IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVzdGluZy5jb3ZlcmFnZVRvb2xiYXJFbmFibGVkJywgJ0NvbnRyb2xzIHdoZXRoZXIgdGhlIGNvdmVyYWdlIHRvb2xiYXIgaXMgc2hvd24gaW4gdGhlIGVkaXRvci4nKSxcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLCAvLyB0b2RvQGNvbm5vcjQzMTI6IGRpc2FibGVkIGJ5IGRlZmF1bHQgdW50aWwgVUkgc3luY1xuXHRcdH0sXG5cdFx0W1Rlc3RpbmdDb25maWdLZXlzLkNvdmVyYWdlTWluaW1hcEVuYWJsZWRdOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlc3RpbmcuY292ZXJhZ2VNaW5pbWFwRW5hYmxlZCcsICdDb250cm9scyB3aGV0aGVyIGNvdmVyYWdlIGluZGljYXRvcnMgYXJlIHNob3duIGluIHRoZSBtaW5pbWFwLicpLFxuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHR9LFxuXHRcdFtUZXN0aW5nQ29uZmlnS2V5cy5SZXN1bHRzVmlld0xheW91dF06IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVzdGluZy5yZXN1bHRzVmlldy5sYXlvdXQnLCAnQ29udHJvbHMgdGhlIGxheW91dCBvZiB0aGUgVGVzdCBSZXN1bHRzIHZpZXcuJyksXG5cdFx0XHRlbnVtOiBbXG5cdFx0XHRcdFRlc3RpbmdSZXN1bHRzVmlld0xheW91dC5UcmVlUmlnaHQsXG5cdFx0XHRcdFRlc3RpbmdSZXN1bHRzVmlld0xheW91dC5UcmVlTGVmdCxcblx0XHRcdF0sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdGxvY2FsaXplKCd0ZXN0aW5nLnJlc3VsdHNWaWV3LmxheW91dC50cmVlUmlnaHQnLCAnU2hvdyB0aGUgdGVzdCBydW4gdHJlZSBvbiB0aGUgcmlnaHQgc2lkZSB3aXRoIGRldGFpbHMgb24gdGhlIGxlZnQuJyksXG5cdFx0XHRcdGxvY2FsaXplKCd0ZXN0aW5nLnJlc3VsdHNWaWV3LmxheW91dC50cmVlTGVmdCcsICdTaG93IHRoZSB0ZXN0IHJ1biB0cmVlIG9uIHRoZSBsZWZ0IHNpZGUgd2l0aCBkZXRhaWxzIG9uIHRoZSByaWdodC4nKSxcblx0XHRcdF0sXG5cdFx0XHRkZWZhdWx0OiBUZXN0aW5nUmVzdWx0c1ZpZXdMYXlvdXQuVHJlZVJpZ2h0LFxuXHRcdH0sXG5cdH1cbn07XG5cblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uTWlncmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbk1pZ3JhdGlvbilcblx0LnJlZ2lzdGVyQ29uZmlndXJhdGlvbk1pZ3JhdGlvbnMoW3tcblx0XHRrZXk6ICd0ZXN0aW5nLm9wZW5UZXN0aW5nJyxcblx0XHRtaWdyYXRlRm46ICh2YWx1ZTogQXV0b09wZW5UZXN0aW5nKTogQ29uZmlndXJhdGlvbktleVZhbHVlUGFpcnMgPT4ge1xuXHRcdFx0cmV0dXJuIFtbVGVzdGluZ0NvbmZpZ0tleXMuT3BlblJlc3VsdHMsIHsgdmFsdWUgfV1dO1xuXHRcdH1cblx0fV0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIElUZXN0aW5nQ292ZXJhZ2VCYXJUaHJlc2hvbGRzIHtcblx0cmVkOiBudW1iZXI7XG5cdGdyZWVuOiBudW1iZXI7XG5cdHllbGxvdzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUZXN0aW5nQ29uZmlndXJhdGlvbiB7XG5cdFtUZXN0aW5nQ29uZmlnS2V5cy5BdXRvT3BlblBlZWtWaWV3XTogQXV0b09wZW5QZWVrVmlld1doZW47XG5cdFtUZXN0aW5nQ29uZmlnS2V5cy5BdXRvT3BlblBlZWtWaWV3RHVyaW5nQ29udGludW91c1J1bl06IGJvb2xlYW47XG5cdFtUZXN0aW5nQ29uZmlnS2V5cy5Db3VudEJhZGdlXTogVGVzdGluZ0NvdW50QmFkZ2U7XG5cdFtUZXN0aW5nQ29uZmlnS2V5cy5Gb2xsb3dSdW5uaW5nVGVzdF06IGJvb2xlYW47XG5cdFtUZXN0aW5nQ29uZmlnS2V5cy5EZWZhdWx0R3V0dGVyQ2xpY2tBY3Rpb25dOiBEZWZhdWx0R3V0dGVyQ2xpY2tBY3Rpb247XG5cdFtUZXN0aW5nQ29uZmlnS2V5cy5HdXR0ZXJFbmFibGVkXTogYm9vbGVhbjtcblx0W1Rlc3RpbmdDb25maWdLZXlzLlNhdmVCZWZvcmVUZXN0XTogYm9vbGVhbjtcblx0W1Rlc3RpbmdDb25maWdLZXlzLk9wZW5SZXN1bHRzXTogQXV0b09wZW5UZXN0aW5nO1xuXHRbVGVzdGluZ0NvbmZpZ0tleXMuQWx3YXlzUmV2ZWFsVGVzdE9uU3RhdGVDaGFuZ2VdOiBib29sZWFuO1xuXHRbVGVzdGluZ0NvbmZpZ0tleXMuU2hvd0FsbE1lc3NhZ2VzXTogYm9vbGVhbjtcblx0W1Rlc3RpbmdDb25maWdLZXlzLkNvdmVyYWdlUGVyY2VudF06IFRlc3RpbmdEaXNwbGF5ZWRDb3ZlcmFnZVBlcmNlbnQ7XG5cdFtUZXN0aW5nQ29uZmlnS2V5cy5TaG93Q292ZXJhZ2VJbkV4cGxvcmVyXTogYm9vbGVhbjtcblx0W1Rlc3RpbmdDb25maWdLZXlzLkNvdmVyYWdlQmFyVGhyZXNob2xkc106IElUZXN0aW5nQ292ZXJhZ2VCYXJUaHJlc2hvbGRzO1xuXHRbVGVzdGluZ0NvbmZpZ0tleXMuQ292ZXJhZ2VUb29sYmFyRW5hYmxlZF06IGJvb2xlYW47XG5cdFtUZXN0aW5nQ29uZmlnS2V5cy5Db3ZlcmFnZU1pbmltYXBFbmFibGVkXTogYm9vbGVhbjtcblx0W1Rlc3RpbmdDb25maWdLZXlzLlJlc3VsdHNWaWV3TGF5b3V0XTogVGVzdGluZ1Jlc3VsdHNWaWV3TGF5b3V0O1xufVxuXG5leHBvcnQgY29uc3QgZ2V0VGVzdGluZ0NvbmZpZ3VyYXRpb24gPSA8SyBleHRlbmRzIFRlc3RpbmdDb25maWdLZXlzPihjb25maWc6IElDb25maWd1cmF0aW9uU2VydmljZSwga2V5OiBLKSA9PiBjb25maWcuZ2V0VmFsdWU8SVRlc3RpbmdDb25maWd1cmF0aW9uW0tdPihrZXkpO1xuXG5leHBvcnQgY29uc3Qgb2JzZXJ2ZVRlc3RpbmdDb25maWd1cmF0aW9uID0gPEsgZXh0ZW5kcyBUZXN0aW5nQ29uZmlnS2V5cz4oY29uZmlnOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsIGtleTogSykgPT4gb2JzZXJ2YWJsZUZyb21FdmVudChjb25maWcub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLCAoKSA9PlxuXHRnZXRUZXN0aW5nQ29uZmlndXJhdGlvbihjb25maWcsIGtleSkpO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxnQkFBZ0I7QUFHekIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBcUMsa0JBQW1EO0FBRWpGLElBQVcsb0JBQVgsa0JBQVdBLHVCQUFYO0FBQ04sRUFBQUEsbUJBQUEsc0JBQW1CO0FBQ25CLEVBQUFBLG1CQUFBLHlDQUFzQztBQUN0QyxFQUFBQSxtQkFBQSxpQkFB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
