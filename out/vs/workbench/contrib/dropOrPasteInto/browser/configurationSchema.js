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
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { editorConfigurationBaseNode } from "../../../../editor/common/config/editorConfigurationSchema.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { pasteAsCommandId } from "../../../../editor/contrib/dropOrPasteInto/browser/copyPasteContribution.js";
import { pasteAsPreferenceConfig } from "../../../../editor/contrib/dropOrPasteInto/browser/copyPasteController.js";
import { dropAsPreferenceConfig } from "../../../../editor/contrib/dropOrPasteInto/browser/dropIntoEditorController.js";
import * as nls from "../../../../nls.js";
import { ConfigurationScope, Extensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
const dropEnumValues = [];
const dropAsPreferenceSchema = {
  type: "array",
  scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
  description: nls.localize("dropPreferredDescription", "Configures the preferred type of edit to use when dropping content.\n\nThis is an ordered list of edit kinds. The first available edit of a preferred kind will be used."),
  default: [],
  items: {
    description: nls.localize("dropKind", "The kind identifier of the drop edit."),
    anyOf: [
      { type: "string" },
      { enum: dropEnumValues }
    ]
  }
};
const pasteEnumValues = [];
const pasteAsPreferenceSchema = {
  type: "array",
  scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
  description: nls.localize("pastePreferredDescription", "Configures the preferred type of edit to use when pasting content.\n\nThis is an ordered list of edit kinds. The first available edit of a preferred kind will be used."),
  default: [],
  items: {
    description: nls.localize("pasteKind", "The kind identifier of the paste edit."),
    anyOf: [
      { type: "string" },
      { enum: pasteEnumValues }
    ]
  }
};
const editorConfiguration = Object.freeze({
  ...editorConfigurationBaseNode,
  properties: {
    [pasteAsPreferenceConfig]: pasteAsPreferenceSchema,
    [dropAsPreferenceConfig]: dropAsPreferenceSchema
  }
});
let DropOrPasteSchemaContribution = class extends Disposable {
  constructor(keybindingService, languageFeatures) {
    super();
    this.languageFeatures = languageFeatures;
    this._onDidChangeSchemaContributions = this._register(new Emitter());
    this._allProvidedDropKinds = [];
    this._allProvidedPasteKinds = [];
    this._register(
      Event.runAndSubscribe(
        Event.debounce(
          Event.any(languageFeatures.documentPasteEditProvider.onDidChange, languageFeatures.documentPasteEditProvider.onDidChange),
          () => {
          },
          1e3
        ),
        () => {
          this.updateProvidedKinds();
          this.updateConfigurationSchema();
          this._onDidChangeSchemaContributions.fire();
        }
      )
    );
    this._register(keybindingService.registerSchemaContribution({
      getSchemaAdditions: () => this.getKeybindingSchemaAdditions(),
      onDidChange: this._onDidChangeSchemaContributions.event
    }));
  }
  updateProvidedKinds() {
    const dropKinds = /* @__PURE__ */ new Map();
    for (const provider of this.languageFeatures.documentDropEditProvider.allNoModel()) {
      for (const kind of provider.providedDropEditKinds ?? []) {
        dropKinds.set(kind.value, kind);
      }
    }
    this._allProvidedDropKinds = Array.from(dropKinds.values());
    const pasteKinds = /* @__PURE__ */ new Map();
    for (const provider of this.languageFeatures.documentPasteEditProvider.allNoModel()) {
      for (const kind of provider.providedPasteEditKinds ?? []) {
        pasteKinds.set(kind.value, kind);
      }
    }
    this._allProvidedPasteKinds = Array.from(pasteKinds.values());
  }
  updateConfigurationSchema() {
    pasteEnumValues.length = 0;
    for (const codeActionKind of this._allProvidedPasteKinds) {
      pasteEnumValues.push(codeActionKind.value);
    }
    dropEnumValues.length = 0;
    for (const codeActionKind of this._allProvidedDropKinds) {
      dropEnumValues.push(codeActionKind.value);
    }
    Registry.as(Extensions.Configuration).notifyConfigurationSchemaUpdated(editorConfiguration);
  }
  getKeybindingSchemaAdditions() {
    return [
      {
        if: {
          required: ["command"],
          properties: {
            "command": { const: pasteAsCommandId }
          }
        },
        then: {
          properties: {
            "args": {
              oneOf: [
                {
                  required: ["kind"],
                  properties: {
                    "kind": {
                      anyOf: [
                        { enum: Array.from(this._allProvidedPasteKinds.map((x) => x.value)) },
                        { type: "string" }
                      ]
                    }
                  }
                },
                {
                  required: ["preferences"],
                  properties: {
                    "preferences": {
                      type: "array",
                      items: {
                        anyOf: [
                          { enum: Array.from(this._allProvidedPasteKinds.map((x) => x.value)) },
                          { type: "string" }
                        ]
                      }
                    }
                  }
                }
              ]
            }
          }
        }
      }
    ];
  }
};
DropOrPasteSchemaContribution.ID = "workbench.contrib.dropOrPasteIntoSchema";
DropOrPasteSchemaContribution = __decorateClass([
  __decorateParam(0, IKeybindingService),
  __decorateParam(1, ILanguageFeaturesService)
], DropOrPasteSchemaContribution);
export {
  DropOrPasteSchemaContribution,
  editorConfiguration
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRyb3BPclBhc3RlSW50b1xcYnJvd3NlclxcY29uZmlndXJhdGlvblNjaGVtYS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSGllcmFyY2hpY2FsS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hpZXJhcmNoaWNhbEtpbmQuanMnO1xuaW1wb3J0IHsgSUpTT05TY2hlbWEgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZWRpdG9yQ29uZmlndXJhdGlvbkJhc2VOb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yQ29uZmlndXJhdGlvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgcGFzdGVBc0NvbW1hbmRJZCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2Ryb3BPclBhc3RlSW50by9icm93c2VyL2NvcHlQYXN0ZUNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBwYXN0ZUFzUHJlZmVyZW5jZUNvbmZpZyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2Ryb3BPclBhc3RlSW50by9icm93c2VyL2NvcHlQYXN0ZUNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgZHJvcEFzUHJlZmVyZW5jZUNvbmZpZyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2Ryb3BPclBhc3RlSW50by9icm93c2VyL2Ryb3BJbnRvRWRpdG9yQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25TY29wZSwgRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25Ob2RlLCBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcblxuY29uc3QgZHJvcEVudW1WYWx1ZXM6IHN0cmluZ1tdID0gW107XG5cbmNvbnN0IGRyb3BBc1ByZWZlcmVuY2VTY2hlbWE6IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEgPSB7XG5cdHR5cGU6ICdhcnJheScsXG5cdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2Ryb3BQcmVmZXJyZWREZXNjcmlwdGlvbicsIFwiQ29uZmlndXJlcyB0aGUgcHJlZmVycmVkIHR5cGUgb2YgZWRpdCB0byB1c2Ugd2hlbiBkcm9wcGluZyBjb250ZW50LlxcblxcblRoaXMgaXMgYW4gb3JkZXJlZCBsaXN0IG9mIGVkaXQga2luZHMuIFRoZSBmaXJzdCBhdmFpbGFibGUgZWRpdCBvZiBhIHByZWZlcnJlZCBraW5kIHdpbGwgYmUgdXNlZC5cIiksXG5cdGRlZmF1bHQ6IFtdLFxuXHRpdGVtczoge1xuXHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2Ryb3BLaW5kJywgXCJUaGUga2luZCBpZGVudGlmaWVyIG9mIHRoZSBkcm9wIGVkaXQuXCIpLFxuXHRcdGFueU9mOiBbXG5cdFx0XHR7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHR7IGVudW06IGRyb3BFbnVtVmFsdWVzIH1cblx0XHRdLFxuXHR9XG59O1xuXG5jb25zdCBwYXN0ZUVudW1WYWx1ZXM6IHN0cmluZ1tdID0gW107XG5cbmNvbnN0IHBhc3RlQXNQcmVmZXJlbmNlU2NoZW1hOiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hID0ge1xuXHR0eXBlOiAnYXJyYXknLFxuXHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdwYXN0ZVByZWZlcnJlZERlc2NyaXB0aW9uJywgXCJDb25maWd1cmVzIHRoZSBwcmVmZXJyZWQgdHlwZSBvZiBlZGl0IHRvIHVzZSB3aGVuIHBhc3RpbmcgY29udGVudC5cXG5cXG5UaGlzIGlzIGFuIG9yZGVyZWQgbGlzdCBvZiBlZGl0IGtpbmRzLiBUaGUgZmlyc3QgYXZhaWxhYmxlIGVkaXQgb2YgYSBwcmVmZXJyZWQga2luZCB3aWxsIGJlIHVzZWQuXCIpLFxuXHRkZWZhdWx0OiBbXSxcblx0aXRlbXM6IHtcblx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdwYXN0ZUtpbmQnLCBcIlRoZSBraW5kIGlkZW50aWZpZXIgb2YgdGhlIHBhc3RlIGVkaXQuXCIpLFxuXHRcdGFueU9mOiBbXG5cdFx0XHR7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHR7IGVudW06IHBhc3RlRW51bVZhbHVlcyB9XG5cdFx0XVxuXHR9XG59O1xuXG5leHBvcnQgY29uc3QgZWRpdG9yQ29uZmlndXJhdGlvbiA9IE9iamVjdC5mcmVlemU8SUNvbmZpZ3VyYXRpb25Ob2RlPih7XG5cdC4uLmVkaXRvckNvbmZpZ3VyYXRpb25CYXNlTm9kZSxcblx0cHJvcGVydGllczoge1xuXHRcdFtwYXN0ZUFzUHJlZmVyZW5jZUNvbmZpZ106IHBhc3RlQXNQcmVmZXJlbmNlU2NoZW1hLFxuXHRcdFtkcm9wQXNQcmVmZXJlbmNlQ29uZmlnXTogZHJvcEFzUHJlZmVyZW5jZVNjaGVtYSxcblx0fVxufSk7XG5cbmV4cG9ydCBjbGFzcyBEcm9wT3JQYXN0ZVNjaGVtYUNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIElEID0gJ3dvcmtiZW5jaC5jb250cmliLmRyb3BPclBhc3RlSW50b1NjaGVtYSc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTY2hlbWFDb250cmlidXRpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cblx0cHJpdmF0ZSBfYWxsUHJvdmlkZWREcm9wS2luZHM6IEhpZXJhcmNoaWNhbEtpbmRbXSA9IFtdO1xuXHRwcml2YXRlIF9hbGxQcm92aWRlZFBhc3RlS2luZHM6IEhpZXJhcmNoaWNhbEtpbmRbXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VGZWF0dXJlczogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihcblx0XHRcdEV2ZW50LnJ1bkFuZFN1YnNjcmliZShcblx0XHRcdFx0RXZlbnQuZGVib3VuY2UoXG5cdFx0XHRcdFx0RXZlbnQuYW55KGxhbmd1YWdlRmVhdHVyZXMuZG9jdW1lbnRQYXN0ZUVkaXRQcm92aWRlci5vbkRpZENoYW5nZSwgbGFuZ3VhZ2VGZWF0dXJlcy5kb2N1bWVudFBhc3RlRWRpdFByb3ZpZGVyLm9uRGlkQ2hhbmdlKSxcblx0XHRcdFx0XHQoKSA9PiB7IH0sXG5cdFx0XHRcdFx0MTAwMCxcblx0XHRcdFx0KSwgKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlUHJvdmlkZWRLaW5kcygpO1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlQ29uZmlndXJhdGlvblNjaGVtYSgpO1xuXG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTY2hlbWFDb250cmlidXRpb25zLmZpcmUoKTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoa2V5YmluZGluZ1NlcnZpY2UucmVnaXN0ZXJTY2hlbWFDb250cmlidXRpb24oe1xuXHRcdFx0Z2V0U2NoZW1hQWRkaXRpb25zOiAoKSA9PiB0aGlzLmdldEtleWJpbmRpbmdTY2hlbWFBZGRpdGlvbnMoKSxcblx0XHRcdG9uRGlkQ2hhbmdlOiB0aGlzLl9vbkRpZENoYW5nZVNjaGVtYUNvbnRyaWJ1dGlvbnMuZXZlbnQsXG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVQcm92aWRlZEtpbmRzKCk6IHZvaWQge1xuXHRcdC8vIERyb3Bcblx0XHRjb25zdCBkcm9wS2luZHMgPSBuZXcgTWFwPHN0cmluZywgSGllcmFyY2hpY2FsS2luZD4oKTtcblx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIHRoaXMubGFuZ3VhZ2VGZWF0dXJlcy5kb2N1bWVudERyb3BFZGl0UHJvdmlkZXIuYWxsTm9Nb2RlbCgpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGtpbmQgb2YgcHJvdmlkZXIucHJvdmlkZWREcm9wRWRpdEtpbmRzID8/IFtdKSB7XG5cdFx0XHRcdGRyb3BLaW5kcy5zZXQoa2luZC52YWx1ZSwga2luZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2FsbFByb3ZpZGVkRHJvcEtpbmRzID0gQXJyYXkuZnJvbShkcm9wS2luZHMudmFsdWVzKCkpO1xuXG5cdFx0Ly8gUGFzdGVcblx0XHRjb25zdCBwYXN0ZUtpbmRzID0gbmV3IE1hcDxzdHJpbmcsIEhpZXJhcmNoaWNhbEtpbmQ+KCk7XG5cdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiB0aGlzLmxhbmd1YWdlRmVhdHVyZXMuZG9jdW1lbnRQYXN0ZUVkaXRQcm92aWRlci5hbGxOb01vZGVsKCkpIHtcblx0XHRcdGZvciAoY29uc3Qga2luZCBvZiBwcm92aWRlci5wcm92aWRlZFBhc3RlRWRpdEtpbmRzID8/IFtdKSB7XG5cdFx0XHRcdHBhc3RlS2luZHMuc2V0KGtpbmQudmFsdWUsIGtpbmQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9hbGxQcm92aWRlZFBhc3RlS2luZHMgPSBBcnJheS5mcm9tKHBhc3RlS2luZHMudmFsdWVzKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDb25maWd1cmF0aW9uU2NoZW1hKCk6IHZvaWQge1xuXHRcdHBhc3RlRW51bVZhbHVlcy5sZW5ndGggPSAwO1xuXHRcdGZvciAoY29uc3QgY29kZUFjdGlvbktpbmQgb2YgdGhpcy5fYWxsUHJvdmlkZWRQYXN0ZUtpbmRzKSB7XG5cdFx0XHRwYXN0ZUVudW1WYWx1ZXMucHVzaChjb2RlQWN0aW9uS2luZC52YWx1ZSk7XG5cdFx0fVxuXG5cdFx0ZHJvcEVudW1WYWx1ZXMubGVuZ3RoID0gMDtcblx0XHRmb3IgKGNvbnN0IGNvZGVBY3Rpb25LaW5kIG9mIHRoaXMuX2FsbFByb3ZpZGVkRHJvcEtpbmRzKSB7XG5cdFx0XHRkcm9wRW51bVZhbHVlcy5wdXNoKGNvZGVBY3Rpb25LaW5kLnZhbHVlKTtcblx0XHR9XG5cblx0XHRSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pXG5cdFx0XHQubm90aWZ5Q29uZmlndXJhdGlvblNjaGVtYVVwZGF0ZWQoZWRpdG9yQ29uZmlndXJhdGlvbik7XG5cdH1cblxuXHRwcml2YXRlIGdldEtleWJpbmRpbmdTY2hlbWFBZGRpdGlvbnMoKTogSUpTT05TY2hlbWFbXSB7XG5cdFx0cmV0dXJuIFtcblx0XHRcdHtcblx0XHRcdFx0aWY6IHtcblx0XHRcdFx0XHRyZXF1aXJlZDogWydjb21tYW5kJ10sXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0J2NvbW1hbmQnOiB7IGNvbnN0OiBwYXN0ZUFzQ29tbWFuZElkIH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHRoZW46IHtcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHQnYXJncyc6IHtcblx0XHRcdFx0XHRcdFx0b25lT2Y6IFtcblx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRyZXF1aXJlZDogWydraW5kJ10sXG5cdFx0XHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdCdraW5kJzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGFueU9mOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR7IGVudW06IEFycmF5LmZyb20odGhpcy5fYWxsUHJvdmlkZWRQYXN0ZUtpbmRzLm1hcCh4ID0+IHgudmFsdWUpKSB9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0cmVxdWlyZWQ6IFsncHJlZmVyZW5jZXMnXSxcblx0XHRcdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0J3ByZWZlcmVuY2VzJzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGFueU9mOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdHsgZW51bTogQXJyYXkuZnJvbSh0aGlzLl9hbGxQcm92aWRlZFBhc3RlS2luZHMubWFwKHggPT4geC52YWx1ZSkpIH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFNBQVMsYUFBYTtBQUcvQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG1DQUFtQztB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
