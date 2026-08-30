import { AccessibleViewType, AccessibleViewProviderId } from "../../../../platform/accessibility/browser/accessibleView.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { GettingStartedPage, inWelcomeContext } from "./gettingStarted.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { IWalkthroughsService } from "./gettingStartedService.js";
import { AccessibilityVerbositySettingId } from "../../accessibility/browser/accessibilityConfiguration.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { GettingStartedInput } from "./gettingStartedInput.js";
import { localize } from "../../../../nls.js";
import { Action } from "../../../../base/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { URI } from "../../../../base/common/uri.js";
import { parse } from "../../../../base/common/marshalling.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { Codicon } from "../../../../base/common/codicons.js";
class GettingStartedAccessibleView {
  constructor() {
    this.type = AccessibleViewType.View;
    this.priority = 110;
    this.name = "walkthroughs";
    this.when = inWelcomeContext;
    this.getProvider = (accessor) => {
      const editorService = accessor.get(IEditorService);
      const editorPane = editorService.activeEditorPane;
      if (!(editorPane instanceof GettingStartedPage)) {
        return;
      }
      const gettingStartedInput = editorPane.input;
      if (!(gettingStartedInput instanceof GettingStartedInput) || !gettingStartedInput.selectedCategory) {
        return;
      }
      const gettingStartedService = accessor.get(IWalkthroughsService);
      const currentWalkthrough = gettingStartedService.getWalkthrough(gettingStartedInput.selectedCategory);
      const currentStepIds = gettingStartedInput.selectedStep;
      if (currentWalkthrough) {
        return new GettingStartedAccessibleProvider(
          accessor.get(IContextKeyService),
          accessor.get(ICommandService),
          accessor.get(IOpenerService),
          editorPane,
          currentWalkthrough,
          currentStepIds
        );
      }
      return;
    };
  }
}
class GettingStartedAccessibleProvider extends Disposable {
  constructor(contextService, commandService, openerService, _gettingStartedPage, _walkthrough, _focusedStep) {
    super();
    this.contextService = contextService;
    this.commandService = commandService;
    this.openerService = openerService;
    this._gettingStartedPage = _gettingStartedPage;
    this._walkthrough = _walkthrough;
    this._focusedStep = _focusedStep;
    this._currentStepIndex = 0;
    this._activeWalkthroughSteps = [];
    this.id = AccessibleViewProviderId.Walkthrough;
    this.verbositySettingKey = AccessibilityVerbositySettingId.Walkthrough;
    this.options = { type: AccessibleViewType.View };
    this._activeWalkthroughSteps = _walkthrough.steps.filter((step) => !step.when || this.contextService.contextMatchesRules(step.when));
  }
  get actions() {
    const actions = [];
    const step = this._activeWalkthroughSteps[this._currentStepIndex];
    const nodes = step.description.map((lt) => lt.nodes.filter((node) => typeof node !== "string").map((node) => ({ href: node.href, label: node.label }))).flat();
    if (nodes.length === 1) {
      const node = nodes[0];
      actions.push(new Action("walthrough.step.action", node.label, ThemeIcon.asClassName(Codicon.run), true, () => {
        const isCommand = node.href.startsWith("command:");
        const command = node.href.replace(/command:(toSide:)?/, "command:");
        if (isCommand) {
          const commandURI = URI.parse(command);
          let args = [];
          try {
            args = parse(decodeURIComponent(commandURI.query));
          } catch {
            try {
              args = parse(commandURI.query);
            } catch {
            }
          }
          if (!Array.isArray(args)) {
            args = [args];
          }
          this.commandService.executeCommand(commandURI.path, ...args);
        } else {
          this.openerService.open(command, { allowCommands: true });
        }
      }));
    }
    return actions;
  }
  provideContent() {
    if (this._focusedStep) {
      const stepIndex = this._activeWalkthroughSteps.findIndex((step) => step.id === this._focusedStep);
      if (stepIndex !== -1) {
        this._currentStepIndex = stepIndex;
      }
    }
    return this._getContent(
      this._walkthrough,
      this._activeWalkthroughSteps[this._currentStepIndex],
      /* includeTitle */
      true
    );
  }
  _getContent(waltkrough, step, includeTitle) {
    const description = step.description.map((lt) => lt.nodes.filter((node) => typeof node === "string")).join("\n");
    const stepsContent = localize("gettingStarted.step", "{0}\n{1}", step.title, description);
    if (includeTitle) {
      return [
        localize("gettingStarted.title", "Title: {0}", waltkrough.title),
        localize("gettingStarted.description", "Description: {0}", waltkrough.description),
        stepsContent
      ].join("\n");
    } else {
      return stepsContent;
    }
  }
  provideNextContent() {
    if (++this._currentStepIndex >= this._activeWalkthroughSteps.length) {
      --this._currentStepIndex;
      return;
    }
    return this._getContent(this._walkthrough, this._activeWalkthroughSteps[this._currentStepIndex]);
  }
  providePreviousContent() {
    if (--this._currentStepIndex < 0) {
      ++this._currentStepIndex;
      return;
    }
    return this._getContent(this._walkthrough, this._activeWalkthroughSteps[this._currentStepIndex]);
  }
  onClose() {
    if (this._currentStepIndex > -1) {
      const currentStep = this._activeWalkthroughSteps[this._currentStepIndex];
      this._gettingStartedPage.makeCategoryVisibleWhenAvailable(this._walkthrough.id, currentStep.id);
    }
  }
}
export {
  GettingStartedAccessibleView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHdlbGNvbWVHZXR0aW5nU3RhcnRlZFxcYnJvd3NlclxcZ2V0dGluZ1N0YXJ0ZWRBY2Nlc3NpYmxlVmlldy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgeyBBY2Nlc3NpYmxlVmlld1R5cGUsIEFjY2Vzc2libGVDb250ZW50UHJvdmlkZXIsIEV4dGVuc2lvbkNvbnRlbnRQcm92aWRlciwgSUFjY2Vzc2libGVWaWV3Q29udGVudFByb3ZpZGVyLCBBY2Nlc3NpYmxlVmlld1Byb3ZpZGVySWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJsZVZpZXcuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2libGVWaWV3SW1wbGVtZW50YXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJsZVZpZXdSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEdldHRpbmdTdGFydGVkUGFnZSwgaW5XZWxjb21lQ29udGV4dCB9IGZyb20gJy4vZ2V0dGluZ1N0YXJ0ZWQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJUmVzb2x2ZWRXYWxrdGhyb3VnaCwgSVJlc29sdmVkV2Fsa3Rocm91Z2hTdGVwLCBJV2Fsa3Rocm91Z2hzU2VydmljZSB9IGZyb20gJy4vZ2V0dGluZ1N0YXJ0ZWRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJpbGl0eUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgR2V0dGluZ1N0YXJ0ZWRJbnB1dCB9IGZyb20gJy4vZ2V0dGluZ1N0YXJ0ZWRJbnB1dC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24sIElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElMaW5rIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlua2VkVGV4dC5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IHBhcnNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmcuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcblxuZXhwb3J0IGNsYXNzIEdldHRpbmdTdGFydGVkQWNjZXNzaWJsZVZpZXcgaW1wbGVtZW50cyBJQWNjZXNzaWJsZVZpZXdJbXBsZW1lbnRhdGlvbiB7XG5cdHJlYWRvbmx5IHR5cGUgPSBBY2Nlc3NpYmxlVmlld1R5cGUuVmlldztcblx0cmVhZG9ubHkgcHJpb3JpdHkgPSAxMTA7XG5cdHJlYWRvbmx5IG5hbWUgPSAnd2Fsa3Rocm91Z2hzJztcblx0cmVhZG9ubHkgd2hlbiA9IGluV2VsY29tZUNvbnRleHQ7XG5cblx0Z2V0UHJvdmlkZXIgPSAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBBY2Nlc3NpYmxlQ29udGVudFByb3ZpZGVyIHwgRXh0ZW5zaW9uQ29udGVudFByb3ZpZGVyIHwgdW5kZWZpbmVkID0+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JQYW5lID0gZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdGlmICghKGVkaXRvclBhbmUgaW5zdGFuY2VvZiBHZXR0aW5nU3RhcnRlZFBhZ2UpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGdldHRpbmdTdGFydGVkSW5wdXQgPSBlZGl0b3JQYW5lLmlucHV0O1xuXHRcdGlmICghKGdldHRpbmdTdGFydGVkSW5wdXQgaW5zdGFuY2VvZiBHZXR0aW5nU3RhcnRlZElucHV0KSB8fCAhZ2V0dGluZ1N0YXJ0ZWRJbnB1dC5zZWxlY3RlZENhdGVnb3J5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZ2V0dGluZ1N0YXJ0ZWRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXYWxrdGhyb3VnaHNTZXJ2aWNlKTtcblx0XHRjb25zdCBjdXJyZW50V2Fsa3Rocm91Z2ggPSBnZXR0aW5nU3RhcnRlZFNlcnZpY2UuZ2V0V2Fsa3Rocm91Z2goZ2V0dGluZ1N0YXJ0ZWRJbnB1dC5zZWxlY3RlZENhdGVnb3J5KTtcblx0XHRjb25zdCBjdXJyZW50U3RlcElkcyA9IGdldHRpbmdTdGFydGVkSW5wdXQuc2VsZWN0ZWRTdGVwO1xuXHRcdGlmIChjdXJyZW50V2Fsa3Rocm91Z2gpIHtcblxuXHRcdFx0cmV0dXJuIG5ldyBHZXR0aW5nU3RhcnRlZEFjY2Vzc2libGVQcm92aWRlcihcblx0XHRcdFx0YWNjZXNzb3IuZ2V0KElDb250ZXh0S2V5U2VydmljZSksXG5cdFx0XHRcdGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpLFxuXHRcdFx0XHRhY2Nlc3Nvci5nZXQoSU9wZW5lclNlcnZpY2UpLFxuXHRcdFx0XHRlZGl0b3JQYW5lLFxuXHRcdFx0XHRjdXJyZW50V2Fsa3Rocm91Z2gsXG5cdFx0XHRcdGN1cnJlbnRTdGVwSWRzKTtcblx0XHR9XG5cdFx0cmV0dXJuO1xuXHR9O1xufVxuXG5jbGFzcyBHZXR0aW5nU3RhcnRlZEFjY2Vzc2libGVQcm92aWRlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQWNjZXNzaWJsZVZpZXdDb250ZW50UHJvdmlkZXIge1xuXG5cdHByaXZhdGUgX2N1cnJlbnRTdGVwSW5kZXg6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgX2FjdGl2ZVdhbGt0aHJvdWdoU3RlcHM6IElSZXNvbHZlZFdhbGt0aHJvdWdoU3RlcFtdID0gW107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBjb250ZXh0U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdHByaXZhdGUgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRwcml2YXRlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2dldHRpbmdTdGFydGVkUGFnZTogR2V0dGluZ1N0YXJ0ZWRQYWdlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3dhbGt0aHJvdWdoOiBJUmVzb2x2ZWRXYWxrdGhyb3VnaCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9mb2N1c2VkU3RlcD86IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9hY3RpdmVXYWxrdGhyb3VnaFN0ZXBzID0gX3dhbGt0aHJvdWdoLnN0ZXBzLmZpbHRlcihzdGVwID0+ICFzdGVwLndoZW4gfHwgdGhpcy5jb250ZXh0U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKHN0ZXAud2hlbikpO1xuXHR9XG5cblx0cmVhZG9ubHkgaWQgPSBBY2Nlc3NpYmxlVmlld1Byb3ZpZGVySWQuV2Fsa3Rocm91Z2g7XG5cdHJlYWRvbmx5IHZlcmJvc2l0eVNldHRpbmdLZXkgPSBBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLldhbGt0aHJvdWdoO1xuXHRyZWFkb25seSBvcHRpb25zID0geyB0eXBlOiBBY2Nlc3NpYmxlVmlld1R5cGUuVmlldyB9O1xuXG5cdHB1YmxpYyBnZXQgYWN0aW9ucygpOiBJQWN0aW9uW10ge1xuXHRcdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRcdGNvbnN0IHN0ZXAgPSB0aGlzLl9hY3RpdmVXYWxrdGhyb3VnaFN0ZXBzW3RoaXMuX2N1cnJlbnRTdGVwSW5kZXhdO1xuXHRcdGNvbnN0IG5vZGVzID0gc3RlcC5kZXNjcmlwdGlvbi5tYXAobHQgPT4gbHQubm9kZXMuZmlsdGVyKChub2RlKTogbm9kZSBpcyBJTGluayA9PiB0eXBlb2Ygbm9kZSAhPT0gJ3N0cmluZycpLm1hcChub2RlID0+ICh7IGhyZWY6IG5vZGUuaHJlZiwgbGFiZWw6IG5vZGUubGFiZWwgfSkpKS5mbGF0KCk7XG5cdFx0aWYgKG5vZGVzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0Y29uc3Qgbm9kZSA9IG5vZGVzWzBdO1xuXG5cdFx0XHRhY3Rpb25zLnB1c2gobmV3IEFjdGlvbignd2FsdGhyb3VnaC5zdGVwLmFjdGlvbicsIG5vZGUubGFiZWwsIFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnJ1biksIHRydWUsICgpID0+IHtcblxuXHRcdFx0XHRjb25zdCBpc0NvbW1hbmQgPSBub2RlLmhyZWYuc3RhcnRzV2l0aCgnY29tbWFuZDonKTtcblx0XHRcdFx0Y29uc3QgY29tbWFuZCA9IG5vZGUuaHJlZi5yZXBsYWNlKC9jb21tYW5kOih0b1NpZGU6KT8vLCAnY29tbWFuZDonKTtcblxuXHRcdFx0XHRpZiAoaXNDb21tYW5kKSB7XG5cdFx0XHRcdFx0Y29uc3QgY29tbWFuZFVSSSA9IFVSSS5wYXJzZShjb21tYW5kKTtcblxuXHRcdFx0XHRcdGxldCBhcmdzOiB1bmtub3duW10gPSBbXTtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0YXJncyA9IHBhcnNlKGRlY29kZVVSSUNvbXBvbmVudChjb21tYW5kVVJJLnF1ZXJ5KSk7XG5cdFx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRhcmdzID0gcGFyc2UoY29tbWFuZFVSSS5xdWVyeSk7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRcdFx0Ly8gaWdub3JlIGVycm9yXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICghQXJyYXkuaXNBcnJheShhcmdzKSkge1xuXHRcdFx0XHRcdFx0YXJncyA9IFthcmdzXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChjb21tYW5kVVJJLnBhdGgsIC4uLmFyZ3MpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMub3BlbmVyU2VydmljZS5vcGVuKGNvbW1hbmQsIHsgYWxsb3dDb21tYW5kczogdHJ1ZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gYWN0aW9ucztcblx0fVxuXG5cdHByb3ZpZGVDb250ZW50KCk6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMuX2ZvY3VzZWRTdGVwKSB7XG5cdFx0XHRjb25zdCBzdGVwSW5kZXggPSB0aGlzLl9hY3RpdmVXYWxrdGhyb3VnaFN0ZXBzLmZpbmRJbmRleChzdGVwID0+IHN0ZXAuaWQgPT09IHRoaXMuX2ZvY3VzZWRTdGVwKTtcblx0XHRcdGlmIChzdGVwSW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRTdGVwSW5kZXggPSBzdGVwSW5kZXg7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9nZXRDb250ZW50KHRoaXMuX3dhbGt0aHJvdWdoLCB0aGlzLl9hY3RpdmVXYWxrdGhyb3VnaFN0ZXBzW3RoaXMuX2N1cnJlbnRTdGVwSW5kZXhdLCAvKiBpbmNsdWRlVGl0bGUgKi90cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldENvbnRlbnQod2FsdGtyb3VnaDogSVJlc29sdmVkV2Fsa3Rocm91Z2gsIHN0ZXA6IElSZXNvbHZlZFdhbGt0aHJvdWdoU3RlcCwgaW5jbHVkZVRpdGxlPzogYm9vbGVhbik6IHN0cmluZyB7XG5cblx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IHN0ZXAuZGVzY3JpcHRpb24ubWFwKGx0ID0+IGx0Lm5vZGVzLmZpbHRlcihub2RlID0+IHR5cGVvZiBub2RlID09PSAnc3RyaW5nJykpLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IHN0ZXBzQ29udGVudCA9XG5cdFx0XHRsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuc3RlcCcsICd7MH1cXG57MX0nLCBzdGVwLnRpdGxlLCBkZXNjcmlwdGlvbik7XG5cblx0XHRpZiAoaW5jbHVkZVRpdGxlKSB7XG5cdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQudGl0bGUnLCAnVGl0bGU6IHswfScsIHdhbHRrcm91Z2gudGl0bGUpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuZGVzY3JpcHRpb24nLCAnRGVzY3JpcHRpb246IHswfScsIHdhbHRrcm91Z2guZGVzY3JpcHRpb24pLFxuXHRcdFx0XHRzdGVwc0NvbnRlbnRcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0fVxuXHRcdGVsc2Uge1xuXHRcdFx0cmV0dXJuIHN0ZXBzQ29udGVudDtcblx0XHR9XG5cdH1cblxuXHRwcm92aWRlTmV4dENvbnRlbnQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoKyt0aGlzLl9jdXJyZW50U3RlcEluZGV4ID49IHRoaXMuX2FjdGl2ZVdhbGt0aHJvdWdoU3RlcHMubGVuZ3RoKSB7XG5cdFx0XHQtLXRoaXMuX2N1cnJlbnRTdGVwSW5kZXg7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9nZXRDb250ZW50KHRoaXMuX3dhbGt0aHJvdWdoLCB0aGlzLl9hY3RpdmVXYWxrdGhyb3VnaFN0ZXBzW3RoaXMuX2N1cnJlbnRTdGVwSW5kZXhdKTtcblx0fVxuXG5cdHByb3ZpZGVQcmV2aW91c0NvbnRlbnQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoLS10aGlzLl9jdXJyZW50U3RlcEluZGV4IDwgMCkge1xuXHRcdFx0Kyt0aGlzLl9jdXJyZW50U3RlcEluZGV4O1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZ2V0Q29udGVudCh0aGlzLl93YWxrdGhyb3VnaCwgdGhpcy5fYWN0aXZlV2Fsa3Rocm91Z2hTdGVwc1t0aGlzLl9jdXJyZW50U3RlcEluZGV4XSk7XG5cdH1cblxuXHRvbkNsb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jdXJyZW50U3RlcEluZGV4ID4gLTEpIHtcblx0XHRcdGNvbnN0IGN1cnJlbnRTdGVwID0gdGhpcy5fYWN0aXZlV2Fsa3Rocm91Z2hTdGVwc1t0aGlzLl9jdXJyZW50U3RlcEluZGV4XTtcblx0XHRcdHRoaXMuX2dldHRpbmdTdGFydGVkUGFnZS5tYWtlQ2F0ZWdvcnlWaXNpYmxlV2hlbkF2YWlsYWJsZSh0aGlzLl93YWxrdGhyb3VnaC5pZCwgY3VycmVudFN0ZXAuaWQpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBSUEsU0FBUyxvQkFBeUcsZ0NBQWdDO0FBRWxKLFNBQVMsMEJBQTBCO0FBRW5DLFNBQVMsb0JBQW9CLHdCQUF3QjtBQUNyRCxTQUFTLGtCQUFrQjtBQUMzQixTQUF5RCw0QkFBNEI7QUFDckYsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxjQUF1QjtBQUVoQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZUFBZTtBQUVqQixNQUFNLDZCQUFzRTtBQUFBLEVBQTVFO0FBQ04sU0FBUyxPQUFPLG1CQUFtQjtBQUNuQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxPQUFPO0FBQ2hCLFNBQVMsT0FBTztBQUVoQix1QkFBYyxDQUFDLGFBQWlHO0FBQy9HLFlBQU0sZ0JBQWdCLFNBQVMsSUFBSSxjQUFjO0FBQ2pELFlBQU0sYUFBYSxjQUFjO0FBQ2pDLFVBQUksRUFBRSxzQkFBc0IscUJBQXFCO0FBQ2hEO0FBQUEsTUFDRDtBQUNBLFlBQU0sc0JBQXNCLFdBQVc7QUFDdkMs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
