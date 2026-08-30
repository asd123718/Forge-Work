import { Emitter } from "../../../../../base/common/event.js";
import { toDisposable } from "../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../nls.js";
import { isProposedApiEnabled } from "../../../../services/extensions/common/extensions.js";
import { ExtensionsRegistry } from "../../../../services/extensions/common/extensionsRegistry.js";
class TerminalQuickFixService {
  constructor() {
    this._selectors = /* @__PURE__ */ new Map();
    this._providers = /* @__PURE__ */ new Map();
    this._pendingProviders = /* @__PURE__ */ new Map();
    this._onDidRegisterProvider = new Emitter();
    this.onDidRegisterProvider = this._onDidRegisterProvider.event;
    this._onDidRegisterCommandSelector = new Emitter();
    this.onDidRegisterCommandSelector = this._onDidRegisterCommandSelector.event;
    this._onDidUnregisterProvider = new Emitter();
    this.onDidUnregisterProvider = this._onDidUnregisterProvider.event;
    this.extensionQuickFixes = new Promise((r) => quickFixExtensionPoint.setHandler((fixes) => {
      r(fixes.filter((c) => isProposedApiEnabled(c.description, "terminalQuickFixProvider")).map((c) => {
        if (!c.value) {
          return [];
        }
        return c.value.map((fix) => {
          return { ...fix, extensionIdentifier: c.description.identifier.value };
        });
      }).flat());
    }));
    this.extensionQuickFixes.then((selectors) => {
      for (const selector of selectors) {
        this.registerCommandSelector(selector);
      }
    });
  }
  get providers() {
    return this._providers;
  }
  registerCommandSelector(selector) {
    this._selectors.set(selector.id, selector);
    this._onDidRegisterCommandSelector.fire(selector);
    const pendingProvider = this._pendingProviders.get(selector.id);
    if (pendingProvider) {
      this._pendingProviders.delete(selector.id);
      this._providers.set(selector.id, pendingProvider);
      this._onDidRegisterProvider.fire({ selector, provider: pendingProvider });
    }
  }
  registerQuickFixProvider(id, provider) {
    let disposed = false;
    this.extensionQuickFixes.then(() => {
      if (disposed) {
        return;
      }
      const selector = this._selectors.get(id);
      if (selector) {
        this._providers.set(id, provider);
        this._onDidRegisterProvider.fire({ selector, provider });
      } else {
        this._pendingProviders.set(id, provider);
      }
    });
    return toDisposable(() => {
      disposed = true;
      this._providers.delete(id);
      this._pendingProviders.delete(id);
      const selector = this._selectors.get(id);
      if (selector) {
        this._selectors.delete(id);
        this._onDidUnregisterProvider.fire(selector.id);
      }
    });
  }
}
const quickFixExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "terminalQuickFixes",
  defaultExtensionKind: ["workspace"],
  activationEventsGenerator: function* (terminalQuickFixes) {
    for (const quickFixContrib of terminalQuickFixes ?? []) {
      yield `onTerminalQuickFixRequest:${quickFixContrib.id}`;
    }
  },
  jsonSchema: {
    description: localize("vscode.extension.contributes.terminalQuickFixes", "Contributes terminal quick fixes."),
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      required: ["id", "commandLineMatcher", "outputMatcher", "commandExitResult"],
      defaultSnippets: [{
        body: {
          id: "$1",
          commandLineMatcher: "$2",
          outputMatcher: "$3",
          exitStatus: "$4"
        }
      }],
      properties: {
        id: {
          description: localize("vscode.extension.contributes.terminalQuickFixes.id", "The ID of the quick fix provider"),
          type: "string"
        },
        commandLineMatcher: {
          description: localize("vscode.extension.contributes.terminalQuickFixes.commandLineMatcher", "A regular expression or string to test the command line against"),
          type: "string"
        },
        outputMatcher: {
          markdownDescription: localize("vscode.extension.contributes.terminalQuickFixes.outputMatcher", "A regular expression or string to match a single line of the output against, which provides groups to be referenced in terminalCommand and uri.\n\nFor example:\n\n `lineMatcher: /git push --set-upstream origin (?<branchName>[^s]+)/;`\n\n`terminalCommand: 'git push --set-upstream origin ${group:branchName}';`\n"),
          type: "object",
          required: ["lineMatcher", "anchor", "offset", "length"],
          properties: {
            lineMatcher: {
              description: "A regular expression or string to test the command line against",
              type: "string"
            },
            anchor: {
              description: "Where the search should begin in the buffer",
              enum: ["top", "bottom"]
            },
            offset: {
              description: "The number of lines vertically from the anchor in the buffer to start matching against",
              type: "number"
            },
            length: {
              description: "The number of rows to match against, this should be as small as possible for performance reasons",
              type: "number"
            }
          }
        },
        commandExitResult: {
          description: localize("vscode.extension.contributes.terminalQuickFixes.commandExitResult", "The command exit result to match on"),
          enum: ["success", "error"],
          enumDescriptions: [
            "The command exited with an exit code of zero.",
            "The command exited with a non-zero exit code."
          ]
        },
        kind: {
          description: localize("vscode.extension.contributes.terminalQuickFixes.kind", "The kind of the resulting quick fix. This changes how the quick fix is presented. Defaults to {0}.", '`"fix"`'),
          enum: ["default", "explain"],
          enumDescriptions: [
            "A high confidence quick fix.",
            "An explanation of the problem."
          ]
        }
      }
    }
  }
});
export {
  TerminalQuickFixService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxccXVpY2tGaXhcXGJyb3dzZXJcXHRlcm1pbmFsUXVpY2tGaXhTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsQ29tbWFuZFNlbGVjdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFF1aWNrRml4U2VydmljZSwgSVRlcm1pbmFsUXVpY2tGaXhQcm92aWRlciwgSVRlcm1pbmFsUXVpY2tGaXhQcm92aWRlclNlbGVjdG9yIH0gZnJvbSAnLi9xdWlja0ZpeC5qcyc7XG5pbXBvcnQgeyBpc1Byb3Bvc2VkQXBpRW5hYmxlZCB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uc1JlZ2lzdHJ5LmpzJztcblxuZXhwb3J0IGNsYXNzIFRlcm1pbmFsUXVpY2tGaXhTZXJ2aWNlIGltcGxlbWVudHMgSVRlcm1pbmFsUXVpY2tGaXhTZXJ2aWNlIHtcblx0ZGVjbGFyZSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfc2VsZWN0b3JzOiBNYXA8c3RyaW5nLCBJVGVybWluYWxDb21tYW5kU2VsZWN0b3I+ID0gbmV3IE1hcCgpO1xuXG5cdHByaXZhdGUgX3Byb3ZpZGVyczogTWFwPHN0cmluZywgSVRlcm1pbmFsUXVpY2tGaXhQcm92aWRlcj4gPSBuZXcgTWFwKCk7XG5cdGdldCBwcm92aWRlcnMoKTogTWFwPHN0cmluZywgSVRlcm1pbmFsUXVpY2tGaXhQcm92aWRlcj4geyByZXR1cm4gdGhpcy5fcHJvdmlkZXJzOyB9XG5cblx0cHJpdmF0ZSBfcGVuZGluZ1Byb3ZpZGVyczogTWFwPHN0cmluZywgSVRlcm1pbmFsUXVpY2tGaXhQcm92aWRlcj4gPSBuZXcgTWFwKCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZWdpc3RlclByb3ZpZGVyID0gbmV3IEVtaXR0ZXI8SVRlcm1pbmFsUXVpY2tGaXhQcm92aWRlclNlbGVjdG9yPigpO1xuXHRyZWFkb25seSBvbkRpZFJlZ2lzdGVyUHJvdmlkZXIgPSB0aGlzLl9vbkRpZFJlZ2lzdGVyUHJvdmlkZXIuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVnaXN0ZXJDb21tYW5kU2VsZWN0b3IgPSBuZXcgRW1pdHRlcjxJVGVybWluYWxDb21tYW5kU2VsZWN0b3I+KCk7XG5cdHJlYWRvbmx5IG9uRGlkUmVnaXN0ZXJDb21tYW5kU2VsZWN0b3IgPSB0aGlzLl9vbkRpZFJlZ2lzdGVyQ29tbWFuZFNlbGVjdG9yLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFVucmVnaXN0ZXJQcm92aWRlciA9IG5ldyBFbWl0dGVyPHN0cmluZz4oKTtcblx0cmVhZG9ubHkgb25EaWRVbnJlZ2lzdGVyUHJvdmlkZXIgPSB0aGlzLl9vbkRpZFVucmVnaXN0ZXJQcm92aWRlci5ldmVudDtcblxuXHRyZWFkb25seSBleHRlbnNpb25RdWlja0ZpeGVzOiBQcm9taXNlPEFycmF5PElUZXJtaW5hbENvbW1hbmRTZWxlY3Rvcj4+O1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHRoaXMuZXh0ZW5zaW9uUXVpY2tGaXhlcyA9IG5ldyBQcm9taXNlKChyKSA9PiBxdWlja0ZpeEV4dGVuc2lvblBvaW50LnNldEhhbmRsZXIoZml4ZXMgPT4ge1xuXHRcdFx0cihmaXhlcy5maWx0ZXIoYyA9PiBpc1Byb3Bvc2VkQXBpRW5hYmxlZChjLmRlc2NyaXB0aW9uLCAndGVybWluYWxRdWlja0ZpeFByb3ZpZGVyJykpLm1hcChjID0+IHtcblx0XHRcdFx0aWYgKCFjLnZhbHVlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBjLnZhbHVlLm1hcChmaXggPT4geyByZXR1cm4geyAuLi5maXgsIGV4dGVuc2lvbklkZW50aWZpZXI6IGMuZGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZSB9OyB9KTtcblx0XHRcdH0pLmZsYXQoKSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuZXh0ZW5zaW9uUXVpY2tGaXhlcy50aGVuKHNlbGVjdG9ycyA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIHNlbGVjdG9ycykge1xuXHRcdFx0XHR0aGlzLnJlZ2lzdGVyQ29tbWFuZFNlbGVjdG9yKHNlbGVjdG9yKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJlZ2lzdGVyQ29tbWFuZFNlbGVjdG9yKHNlbGVjdG9yOiBJVGVybWluYWxDb21tYW5kU2VsZWN0b3IpOiB2b2lkIHtcblx0XHR0aGlzLl9zZWxlY3RvcnMuc2V0KHNlbGVjdG9yLmlkLCBzZWxlY3Rvcik7XG5cdFx0dGhpcy5fb25EaWRSZWdpc3RlckNvbW1hbmRTZWxlY3Rvci5maXJlKHNlbGVjdG9yKTtcblxuXHRcdC8vIENoZWNrIGlmIHRoZXJlJ3MgYSBwZW5kaW5nIHByb3ZpZGVyIGZvciB0aGlzIHNlbGVjdG9yXG5cdFx0Y29uc3QgcGVuZGluZ1Byb3ZpZGVyID0gdGhpcy5fcGVuZGluZ1Byb3ZpZGVycy5nZXQoc2VsZWN0b3IuaWQpO1xuXHRcdGlmIChwZW5kaW5nUHJvdmlkZXIpIHtcblx0XHRcdHRoaXMuX3BlbmRpbmdQcm92aWRlcnMuZGVsZXRlKHNlbGVjdG9yLmlkKTtcblx0XHRcdHRoaXMuX3Byb3ZpZGVycy5zZXQoc2VsZWN0b3IuaWQsIHBlbmRpbmdQcm92aWRlcik7XG5cdFx0XHR0aGlzLl9vbkRpZFJlZ2lzdGVyUHJvdmlkZXIuZmlyZSh7IHNlbGVjdG9yLCBwcm92aWRlcjogcGVuZGluZ1Byb3ZpZGVyIH0pO1xuXHRcdH1cblx0fVxuXG5cdHJlZ2lzdGVyUXVpY2tGaXhQcm92aWRlcihpZDogc3RyaW5nLCBwcm92aWRlcjogSVRlcm1pbmFsUXVpY2tGaXhQcm92aWRlcik6IElEaXNwb3NhYmxlIHtcblx0XHQvLyBUaGlzIGlzIG1vcmUgY29tcGxpY2F0ZWQgdGhhbiBpdCBsb29rcyBsaWtlIGl0IHNob3VsZCBiZSBiZWNhdXNlIHdlIG5lZWQgdG8gcmV0dXJuIGFuXG5cdFx0Ly8gSURpc3Bvc2FibGUgc3luY2hyb25vdXNseSBidXQgd2UgbXVzdCBhd2FpdCBJVGVybWluYWxDb250cmlidXRpb25TZXJ2aWNlLnF1aWNrRml4ZXNcblx0XHQvLyBhc3luY2hyb25vdXNseSBiZWZvcmUgYWN0dWFsbHkgcmVnaXN0ZXJpbmcgdGhlIHByb3ZpZGVyLlxuXHRcdGxldCBkaXNwb3NlZCA9IGZhbHNlO1xuXHRcdHRoaXMuZXh0ZW5zaW9uUXVpY2tGaXhlcy50aGVuKCgpID0+IHtcblx0XHRcdGlmIChkaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzZWxlY3RvciA9IHRoaXMuX3NlbGVjdG9ycy5nZXQoaWQpO1xuXHRcdFx0aWYgKHNlbGVjdG9yKSB7XG5cdFx0XHRcdC8vIFNlbGVjdG9yIGlzIGFscmVhZHkgYXZhaWxhYmxlLCByZWdpc3RlciBpbW1lZGlhdGVseVxuXHRcdFx0XHR0aGlzLl9wcm92aWRlcnMuc2V0KGlkLCBwcm92aWRlcik7XG5cdFx0XHRcdHRoaXMuX29uRGlkUmVnaXN0ZXJQcm92aWRlci5maXJlKHsgc2VsZWN0b3IsIHByb3ZpZGVyIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gU2VsZWN0b3Igbm90IHlldCBhdmFpbGFibGUsIHN0b3JlIHByb3ZpZGVyIGFzIHBlbmRpbmdcblx0XHRcdFx0dGhpcy5fcGVuZGluZ1Byb3ZpZGVycy5zZXQoaWQsIHByb3ZpZGVyKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGRpc3Bvc2VkID0gdHJ1ZTtcblx0XHRcdHRoaXMuX3Byb3ZpZGVycy5kZWxldGUoaWQpO1xuXHRcdFx0dGhpcy5fcGVuZGluZ1Byb3ZpZGVycy5kZWxldGUoaWQpO1xuXHRcdFx0Y29uc3Qgc2VsZWN0b3IgPSB0aGlzLl9zZWxlY3RvcnMuZ2V0KGlkKTtcblx0XHRcdGlmIChzZWxlY3Rvcikge1xuXHRcdFx0XHR0aGlzLl9zZWxlY3RvcnMuZGVsZXRlKGlkKTtcblx0XHRcdFx0dGhpcy5fb25EaWRVbnJlZ2lzdGVyUHJvdmlkZXIuZmlyZShzZWxlY3Rvci5pZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cblxuY29uc3QgcXVpY2tGaXhFeHRlbnNpb25Qb2ludCA9IEV4dGVuc2lvbnNSZWdpc3RyeS5yZWdpc3RlckV4dGVuc2lvblBvaW50PElUZXJtaW5hbENvbW1hbmRTZWxlY3RvcltdPih7XG5cdGV4dGVuc2lvblBvaW50OiAndGVybWluYWxRdWlja0ZpeGVzJyxcblx0ZGVmYXVsdEV4dGVuc2lvbktpbmQ6IFsnd29ya3NwYWNlJ10sXG5cdGFjdGl2YXRpb25FdmVudHNHZW5lcmF0b3I6IGZ1bmN0aW9uKiAodGVybWluYWxRdWlja0ZpeGVzOiByZWFkb25seSBJVGVybWluYWxDb21tYW5kU2VsZWN0b3JbXSkge1xuXHRcdGZvciAoY29uc3QgcXVpY2tGaXhDb250cmliIG9mIHRlcm1pbmFsUXVpY2tGaXhlcyA/PyBbXSkge1xuXHRcdFx0eWllbGQgYG9uVGVybWluYWxRdWlja0ZpeFJlcXVlc3Q6JHtxdWlja0ZpeENvbnRyaWIuaWR9YDtcblx0XHR9XG5cdH0sXG5cdGpzb25TY2hlbWE6IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMudGVybWluYWxRdWlja0ZpeGVzJywgJ0NvbnRyaWJ1dGVzIHRlcm1pbmFsIHF1aWNrIGZpeGVzLicpLFxuXHRcdHR5cGU6ICdhcnJheScsXG5cdFx0aXRlbXM6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0cmVxdWlyZWQ6IFsnaWQnLCAnY29tbWFuZExpbmVNYXRjaGVyJywgJ291dHB1dE1hdGNoZXInLCAnY29tbWFuZEV4aXRSZXN1bHQnXSxcblx0XHRcdGRlZmF1bHRTbmlwcGV0czogW3tcblx0XHRcdFx0Ym9keToge1xuXHRcdFx0XHRcdGlkOiAnJDEnLFxuXHRcdFx0XHRcdGNvbW1hbmRMaW5lTWF0Y2hlcjogJyQyJyxcblx0XHRcdFx0XHRvdXRwdXRNYXRjaGVyOiAnJDMnLFxuXHRcdFx0XHRcdGV4aXRTdGF0dXM6ICckNCdcblx0XHRcdFx0fVxuXHRcdFx0fV0sXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdGlkOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnRlcm1pbmFsUXVpY2tGaXhlcy5pZCcsIFwiVGhlIElEIG9mIHRoZSBxdWljayBmaXggcHJvdmlkZXJcIiksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNvbW1hbmRMaW5lTWF0Y2hlcjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy50ZXJtaW5hbFF1aWNrRml4ZXMuY29tbWFuZExpbmVNYXRjaGVyJywgXCJBIHJlZ3VsYXIgZXhwcmVzc2lvbiBvciBzdHJpbmcgdG8gdGVzdCB0aGUgY29tbWFuZCBsaW5lIGFnYWluc3RcIiksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG91dHB1dE1hdGNoZXI6IHtcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy50ZXJtaW5hbFF1aWNrRml4ZXMub3V0cHV0TWF0Y2hlcicsIFwiQSByZWd1bGFyIGV4cHJlc3Npb24gb3Igc3RyaW5nIHRvIG1hdGNoIGEgc2luZ2xlIGxpbmUgb2YgdGhlIG91dHB1dCBhZ2FpbnN0LCB3aGljaCBwcm92aWRlcyBncm91cHMgdG8gYmUgcmVmZXJlbmNlZCBpbiB0ZXJtaW5hbENvbW1hbmQgYW5kIHVyaS5cXG5cXG5Gb3IgZXhhbXBsZTpcXG5cXG4gYGxpbmVNYXRjaGVyOiAvZ2l0IHB1c2ggLS1zZXQtdXBzdHJlYW0gb3JpZ2luICg/PGJyYW5jaE5hbWU+W15cXHNdKykvO2BcXG5cXG5gdGVybWluYWxDb21tYW5kOiAnZ2l0IHB1c2ggLS1zZXQtdXBzdHJlYW0gb3JpZ2luICR7Z3JvdXA6YnJhbmNoTmFtZX0nO2BcXG5cIiksXG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cmVxdWlyZWQ6IFsnbGluZU1hdGNoZXInLCAnYW5jaG9yJywgJ29mZnNldCcsICdsZW5ndGgnXSxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRsaW5lTWF0Y2hlcjoge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0EgcmVndWxhciBleHByZXNzaW9uIG9yIHN0cmluZyB0byB0ZXN0IHRoZSBjb21tYW5kIGxpbmUgYWdhaW5zdCcsXG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0YW5jaG9yOiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnV2hlcmUgdGhlIHNlYXJjaCBzaG91bGQgYmVnaW4gaW4gdGhlIGJ1ZmZlcicsXG5cdFx0XHRcdFx0XHRcdGVudW06IFsndG9wJywgJ2JvdHRvbSddXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0b2Zmc2V0OiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnVGhlIG51bWJlciBvZiBsaW5lcyB2ZXJ0aWNhbGx5IGZyb20gdGhlIGFuY2hvciBpbiB0aGUgYnVmZmVyIHRvIHN0YXJ0IG1hdGNoaW5nIGFnYWluc3QnLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiAnbnVtYmVyJ1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGxlbmd0aDoge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1RoZSBudW1iZXIgb2Ygcm93cyB0byBtYXRjaCBhZ2FpbnN0LCB0aGlzIHNob3VsZCBiZSBhcyBzbWFsbCBhcyBwb3NzaWJsZSBmb3IgcGVyZm9ybWFuY2UgcmVhc29ucycsXG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdudW1iZXInXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRjb21tYW5kRXhpdFJlc3VsdDoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy50ZXJtaW5hbFF1aWNrRml4ZXMuY29tbWFuZEV4aXRSZXN1bHQnLCBcIlRoZSBjb21tYW5kIGV4aXQgcmVzdWx0IHRvIG1hdGNoIG9uXCIpLFxuXHRcdFx0XHRcdGVudW06IFsnc3VjY2VzcycsICdlcnJvciddLFxuXHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdCdUaGUgY29tbWFuZCBleGl0ZWQgd2l0aCBhbiBleGl0IGNvZGUgb2YgemVyby4nLFxuXHRcdFx0XHRcdFx0J1RoZSBjb21tYW5kIGV4aXRlZCB3aXRoIGEgbm9uLXplcm8gZXhpdCBjb2RlLidcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGtpbmQ6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMudGVybWluYWxRdWlja0ZpeGVzLmtpbmQnLCBcIlRoZSBraW5kIG9mIHRoZSByZXN1bHRpbmcgcXVpY2sgZml4LiBUaGlzIGNoYW5nZXMgaG93IHRoZSBxdWljayBmaXggaXMgcHJlc2VudGVkLiBEZWZhdWx0cyB0byB7MH0uXCIsICdgXCJmaXhcImAnKSxcblx0XHRcdFx0XHRlbnVtOiBbJ2RlZmF1bHQnLCAnZXhwbGFpbiddLFxuXHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdCdBIGhpZ2ggY29uZmlkZW5jZSBxdWljayBmaXguJyxcblx0XHRcdFx0XHRcdCdBbiBleHBsYW5hdGlvbiBvZiB0aGUgcHJvYmxlbS4nXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH1cblx0fSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQXNCLG9CQUFvQjtBQUMxQyxTQUFTLGdCQUFnQjtBQUd6QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDBCQUEwQjtBQUU1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
