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
import { Action } from "../../../../base/common/actions.js";
import { assertNever, softAssertNever } from "../../../../base/common/assert.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { isDefined } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { localize } from "../../../../nls.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { ChatElicitationRequestPart } from "../../chat/common/model/chatProgressTypes/chatElicitationRequestPart.js";
import { ChatQuestionCarouselData } from "../../chat/common/model/chatProgressTypes/chatQuestionCarouselData.js";
import { ChatModel } from "../../chat/common/model/chatModel.js";
import { ElicitationState, IChatService } from "../../chat/common/chatService/chatService.js";
import { ElicitationKind, McpConnectionState, MpcResponseError } from "../common/mcpTypes.js";
import { mcpServerToSourceData } from "../common/mcpTypesUtils.js";
import { MCP } from "../common/modelContextProtocol.js";
const noneItem = { id: void 0, label: localize("mcp.elicit.enum.none", "None"), description: localize("mcp.elicit.enum.none.description", "No selection"), alwaysShow: true };
function isFormElicitation(params) {
  return params.mode === "form" || params.mode === void 0 && !!params.requestedSchema;
}
function isUrlElicitation(params) {
  return params.mode === "url";
}
function isLegacyTitledEnumSchema(schema) {
  const cast = schema;
  return cast.type === "string" && Array.isArray(cast.enum) && Array.isArray(cast.enumNames);
}
function isUntitledEnumSchema(schema) {
  const cast = schema;
  return cast.type === "string" && Array.isArray(cast.enum);
}
function isTitledSingleEnumSchema(schema) {
  const cast = schema;
  return cast.type === "string" && Array.isArray(cast.oneOf);
}
function isUntitledMultiEnumSchema(schema) {
  const cast = schema;
  return cast.type === "array" && !!cast.items?.enum;
}
function isTitledMultiEnumSchema(schema) {
  const cast = schema;
  return cast.type === "array" && !!cast.items?.anyOf;
}
let McpElicitationService = class {
  constructor(_notificationService, _quickInputService, _chatService, _openerService) {
    this._notificationService = _notificationService;
    this._quickInputService = _quickInputService;
    this._chatService = _chatService;
    this._openerService = _openerService;
  }
  elicit(server, context, elicitation, token) {
    if (isFormElicitation(elicitation)) {
      return this._elicitForm(server, context, elicitation, token);
    } else if (isUrlElicitation(elicitation)) {
      return this._elicitUrl(server, context, elicitation, token);
    } else {
      softAssertNever(elicitation);
      return Promise.reject(new MpcResponseError("Unsupported elicitation type", MCP.INVALID_PARAMS, void 0));
    }
  }
  async _elicitForm(server, context, elicitation, token) {
    const store = new DisposableStore();
    const value = await new Promise((resolve) => {
      const chatModel = context?.chatSessionResource && this._chatService.getSession(context.chatSessionResource);
      if (chatModel instanceof ChatModel) {
        const request = chatModel.getRequests().at(-1);
        if (request) {
          const { questions, idToPropertyMap } = this._convertSchemaToQuestions(elicitation);
          const carousel = new ChatQuestionCarouselData(
            questions,
            /* allowSkip */
            true,
            /* resolveId */
            void 0,
            /* data */
            void 0,
            /* isUsed */
            void 0,
            /* message */
            new MarkdownString(elicitation.message),
            /* source */
            mcpServerToSourceData(server)
          );
          chatModel.acceptResponseProgress(request, carousel);
          store.add(token.onCancellationRequested(() => {
            carousel.completion.complete({ answers: void 0 });
          }));
          carousel.completion.p.then((result) => {
            if (!result.answers) {
              resolve({ action: "cancel" });
            } else {
              const content = this._convertCarouselAnswersToElicitResult(
                result.answers,
                idToPropertyMap,
                elicitation.requestedSchema.properties
              );
              resolve({ action: "accept", content });
            }
          });
          return;
        }
      }
      const handle = this._notificationService.notify({
        message: elicitation.message,
        source: localize("mcp.elicit.source", "MCP Server ({0})", server.definition.label),
        severity: Severity.Info,
        actions: {
          primary: [store.add(new Action("mcp.elicit.give", localize("mcp.elicit.give", "Respond"), void 0, true, () => resolve(this._doElicitForm(elicitation, token))))],
          secondary: [store.add(new Action("mcp.elicit.cancel", localize("mcp.elicit.cancel", "Cancel"), void 0, true, () => resolve({ action: "decline" })))]
        }
      });
      store.add(handle.onDidClose(() => resolve({ action: "cancel" })));
      store.add(token.onCancellationRequested(() => resolve({ action: "cancel" })));
    }).finally(() => store.dispose());
    return { kind: ElicitationKind.Form, value, dispose: () => {
    } };
  }
  async _elicitUrl(server, context, elicitation, token) {
    const promiseStore = new DisposableStore();
    const completePromise = new Promise((resolve, reject) => {
      promiseStore.add(token.onCancellationRequested(() => reject(new CancellationError())));
      promiseStore.add(autorun((reader) => {
        const cnx = server.connection.read(reader);
        const handler = cnx?.handler.read(reader);
        if (handler) {
          reader.store.add(handler.onDidReceiveElicitationCompleteNotification((e) => {
            if (e.params.elicitationId === elicitation.elicitationId) {
              resolve();
            }
          }));
        } else if (!McpConnectionState.isRunning(server.connectionState.read(reader))) {
          reject(new CancellationError());
        }
      }));
    }).finally(() => promiseStore.dispose());
    const store = new DisposableStore();
    const value = await new Promise((resolve) => {
      const chatModel = context?.chatSessionResource && this._chatService.getSession(context.chatSessionResource);
      if (chatModel instanceof ChatModel) {
        const request = chatModel.getRequests().at(-1);
        if (request) {
          const part = new ChatElicitationRequestPart(
            localize("mcp.elicit.url.title", "Authorization Required"),
            new MarkdownString().appendText(elicitation.message).appendMarkdown("\n\n" + localize("mcp.elicit.url.instruction", "Open this URL?")).appendCodeblock("", elicitation.url),
            localize("msg.subtitle", "{0} (MCP Server)", server.definition.label),
            localize("mcp.elicit.url.open", "Open {0}", URI.parse(elicitation.url).authority),
            localize("mcp.elicit.reject", "Cancel"),
            async () => {
              const result = await this._doElicitUrl(elicitation, token);
              resolve(result);
              completePromise.then(() => part.hide());
              return result.action === "accept" ? ElicitationState.Accepted : ElicitationState.Rejected;
            },
            () => {
              resolve({ action: "decline" });
              return Promise.resolve(ElicitationState.Rejected);
            },
            mcpServerToSourceData(server)
          );
          chatModel.acceptResponseProgress(request, part);
        }
      } else {
        const handle = this._notificationService.notify({
          message: elicitation.message + " " + localize("mcp.elicit.url.instruction2", "This will open {0}", elicitation.url),
          source: localize("mcp.elicit.source", "MCP Server ({0})", server.definition.label),
          severity: Severity.Info,
          actions: {
            primary: [store.add(new Action("mcp.elicit.url.open2", localize("mcp.elicit.url.open2", "Open URL"), void 0, true, () => resolve(this._doElicitUrl(elicitation, token))))],
            secondary: [store.add(new Action("mcp.elicit.cancel", localize("mcp.elicit.cancel", "Cancel"), void 0, true, () => resolve({ action: "decline" })))]
          }
        });
        store.add(handle.onDidClose(() => resolve({ action: "cancel" })));
        store.add(token.onCancellationRequested(() => resolve({ action: "cancel" })));
      }
    }).finally(() => store.dispose());
    return {
      kind: ElicitationKind.URL,
      value,
      wait: completePromise,
      dispose: () => promiseStore.dispose()
    };
  }
  async _doElicitUrl(elicitation, token) {
    if (token.isCancellationRequested) {
      return { action: "cancel" };
    }
    try {
      if (await this._openerService.open(elicitation.url, { allowCommands: false })) {
        return { action: "accept" };
      }
    } catch {
    }
    return { action: "decline" };
  }
  async _doElicitForm(elicitation, token) {
    const quickPick = this._quickInputService.createQuickPick();
    const store = new DisposableStore();
    try {
      const properties = Object.entries(elicitation.requestedSchema.properties);
      const requiredFields = new Set(elicitation.requestedSchema.required || []);
      const results = {};
      const backSnapshots = [];
      quickPick.title = elicitation.message;
      quickPick.totalSteps = properties.length;
      quickPick.ignoreFocusOut = true;
      for (let i = 0; i < properties.length; i++) {
        const [propertyName, schema] = properties[i];
        const isRequired = requiredFields.has(propertyName);
        const restore = backSnapshots.at(i);
        store.clear();
        quickPick.step = i + 1;
        quickPick.title = schema.title || propertyName;
        quickPick.placeholder = this._getFieldPlaceholder(schema, isRequired);
        quickPick.value = restore?.value ?? "";
        quickPick.validationMessage = "";
        quickPick.buttons = i > 0 ? [this._quickInputService.backButton] : [];
        let result;
        if (schema.type === "boolean") {
          result = await this._handleEnumField(quickPick, { enum: [{ const: "true" }, { const: "false" }], default: schema.default ? String(schema.default) : void 0 }, isRequired, store, token);
          if (result.type === "value") {
            result.value = result.value === "true" ? true : false;
          }
        } else if (isLegacyTitledEnumSchema(schema)) {
          result = await this._handleEnumField(quickPick, { enum: schema.enum.map((v, i2) => ({ const: v, title: schema.enumNames[i2] })), default: schema.default }, isRequired, store, token);
        } else if (isUntitledEnumSchema(schema)) {
          result = await this._handleEnumField(quickPick, { enum: schema.enum.map((v) => ({ const: v })), default: schema.default }, isRequired, store, token);
        } else if (isTitledSingleEnumSchema(schema)) {
          result = await this._handleEnumField(quickPick, { enum: schema.oneOf, default: schema.default }, isRequired, store, token);
        } else if (isTitledMultiEnumSchema(schema)) {
          result = await this._handleMultiEnumField(quickPick, { enum: schema.items.anyOf, default: schema.default }, isRequired, store, token);
        } else if (isUntitledMultiEnumSchema(schema)) {
          result = await this._handleMultiEnumField(quickPick, { enum: schema.items.enum.map((v) => ({ const: v })), default: schema.default }, isRequired, store, token);
        } else {
          result = await this._handleInputField(quickPick, schema, isRequired, store, token);
          if (result.type === "value" && (schema.type === "number" || schema.type === "integer")) {
            result.value = Number(result.value);
          }
        }
        if (result.type === "back") {
          i -= 2;
          continue;
        }
        if (result.type === "cancel") {
          return { action: "cancel" };
        }
        backSnapshots[i] = { value: quickPick.value };
        if (result.value === void 0) {
          delete results[propertyName];
        } else {
          results[propertyName] = result.value;
        }
      }
      return {
        action: "accept",
        content: results
      };
    } finally {
      store.dispose();
      quickPick.dispose();
    }
  }
  _getFieldPlaceholder(schema, required) {
    let placeholder = schema.description || "";
    if (!required) {
      placeholder = placeholder ? `${placeholder} (${localize("optional", "Optional")})` : localize("optional", "Optional");
    }
    return placeholder;
  }
  async _handleEnumField(quickPick, schema, required, store, token) {
    const items = schema.enum.map(({ const: value, title }) => ({
      id: value,
      label: value,
      description: title
    }));
    if (!required) {
      items.push(noneItem);
    }
    quickPick.canSelectMany = false;
    quickPick.items = items;
    if (schema.default !== void 0) {
      quickPick.activeItems = items.filter((item) => item.id === schema.default);
    }
    return new Promise((resolve) => {
      store.add(token.onCancellationRequested(() => resolve({ type: "cancel" })));
      store.add(quickPick.onDidAccept(() => {
        const selected = quickPick.selectedItems[0];
        if (selected) {
          resolve({ type: "value", value: selected.id });
        }
      }));
      store.add(quickPick.onDidTriggerButton(() => resolve({ type: "back" })));
      store.add(quickPick.onDidHide(() => resolve({ type: "cancel" })));
      quickPick.show();
    });
  }
  async _handleMultiEnumField(quickPick, schema, required, store, token) {
    const items = schema.enum.map(({ const: value, title }) => ({
      id: value,
      label: value,
      description: title,
      picked: !!schema.default?.includes(value),
      pickable: true
    }));
    if (!required) {
      items.push(noneItem);
    }
    quickPick.canSelectMany = true;
    quickPick.items = items;
    return new Promise((resolve) => {
      store.add(token.onCancellationRequested(() => resolve({ type: "cancel" })));
      store.add(quickPick.onDidAccept(() => {
        const selected = quickPick.selectedItems[0];
        if (selected.id === void 0) {
          resolve({ type: "value", value: void 0 });
        } else {
          resolve({ type: "value", value: quickPick.selectedItems.map((i) => i.id).filter(isDefined) });
        }
      }));
      store.add(quickPick.onDidTriggerButton(() => resolve({ type: "back" })));
      store.add(quickPick.onDidHide(() => resolve({ type: "cancel" })));
      quickPick.show();
    });
  }
  async _handleInputField(quickPick, schema, required, store, token) {
    quickPick.canSelectMany = false;
    const updateItems = () => {
      const items = [];
      if (quickPick.value) {
        const validation = this._validateInput(quickPick.value, schema);
        quickPick.validationMessage = validation.message;
        if (validation.isValid) {
          items.push({ id: "$current", label: `\u27A4 ${quickPick.value}` });
        }
      } else {
        quickPick.validationMessage = "";
        if (schema.default) {
          items.push({ id: "$default", label: `${schema.default}`, description: localize("mcp.elicit.useDefault", "Default value") });
        }
      }
      if (quickPick.validationMessage) {
        quickPick.severity = Severity.Warning;
      } else {
        quickPick.severity = Severity.Ignore;
        if (!required) {
          items.push(noneItem);
        }
      }
      quickPick.items = items;
    };
    updateItems();
    return new Promise((resolve) => {
      if (token.isCancellationRequested) {
        resolve({ type: "cancel" });
        return;
      }
      store.add(token.onCancellationRequested(() => resolve({ type: "cancel" })));
      store.add(quickPick.onDidChangeValue(updateItems));
      store.add(quickPick.onDidAccept(() => {
        const id = quickPick.selectedItems[0].id;
        if (!id) {
          resolve({ type: "value", value: void 0 });
        } else if (id === "$default") {
          resolve({ type: "value", value: String(schema.default) });
        } else if (!quickPick.validationMessage) {
          resolve({ type: "value", value: quickPick.value });
        }
      }));
      store.add(quickPick.onDidTriggerButton(() => resolve({ type: "back" })));
      store.add(quickPick.onDidHide(() => resolve({ type: "cancel" })));
      quickPick.show();
    });
  }
  _validateInput(value, schema) {
    switch (schema.type) {
      case "string":
        return this._validateString(value, schema);
      case "number":
      case "integer":
        return this._validateNumber(value, schema);
      default:
        assertNever(schema);
    }
  }
  _validateString(value, schema) {
    if (schema.minLength && value.length < schema.minLength) {
      return { isValid: false, message: localize("mcp.elicit.validation.minLength", "Minimum length is {0}", schema.minLength) };
    }
    if (schema.maxLength && value.length > schema.maxLength) {
      return { isValid: false, message: localize("mcp.elicit.validation.maxLength", "Maximum length is {0}", schema.maxLength) };
    }
    if (schema.format) {
      const formatValid = this._validateStringFormat(value, schema.format);
      if (!formatValid.isValid) {
        return formatValid;
      }
    }
    return { isValid: true, parsedValue: value };
  }
  _validateStringFormat(value, format) {
    switch (format) {
      case "email":
        return value.includes("@") ? { isValid: true } : { isValid: false, message: localize("mcp.elicit.validation.email", "Please enter a valid email address") };
      case "uri":
        if (URL.canParse(value)) {
          return { isValid: true };
        } else {
          return { isValid: false, message: localize("mcp.elicit.validation.uri", "Please enter a valid URI") };
        }
      case "date": {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(value)) {
          return { isValid: false, message: localize("mcp.elicit.validation.date", "Please enter a valid date (YYYY-MM-DD)") };
        }
        const date = new Date(value);
        return !isNaN(date.getTime()) ? { isValid: true } : { isValid: false, message: localize("mcp.elicit.validation.date", "Please enter a valid date (YYYY-MM-DD)") };
      }
      case "date-time": {
        const dateTime = new Date(value);
        return !isNaN(dateTime.getTime()) ? { isValid: true } : { isValid: false, message: localize("mcp.elicit.validation.dateTime", "Please enter a valid date-time") };
      }
      default:
        return { isValid: true };
    }
  }
  _validateNumber(value, schema) {
    const parsed = Number(value);
    if (isNaN(parsed)) {
      return { isValid: false, message: localize("mcp.elicit.validation.number", "Please enter a valid number") };
    }
    if (schema.type === "integer" && !Number.isInteger(parsed)) {
      return { isValid: false, message: localize("mcp.elicit.validation.integer", "Please enter a valid integer") };
    }
    if (schema.minimum !== void 0 && parsed < schema.minimum) {
      return { isValid: false, message: localize("mcp.elicit.validation.minimum", "Minimum value is {0}", schema.minimum) };
    }
    if (schema.maximum !== void 0 && parsed > schema.maximum) {
      return { isValid: false, message: localize("mcp.elicit.validation.maximum", "Maximum value is {0}", schema.maximum) };
    }
    return { isValid: true, parsedValue: parsed };
  }
  /**
   * Converts an MCP elicitation schema into IChatQuestion[] for the carousel UI.
   * Returns the questions and a map from question ID to schema property name.
   */
  _convertSchemaToQuestions(elicitation) {
    const properties = Object.entries(elicitation.requestedSchema.properties);
    const requiredFields = new Set(elicitation.requestedSchema.required || []);
    const questions = [];
    const idToPropertyMap = /* @__PURE__ */ new Map();
    for (const [propertyName, schema] of properties) {
      const id = generateUuid();
      idToPropertyMap.set(id, propertyName);
      const title = schema.title || propertyName;
      const description = schema.description;
      const isRequired = requiredFields.has(propertyName);
      if (schema.type === "boolean") {
        questions.push({
          id,
          type: "singleSelect",
          title,
          description,
          required: isRequired,
          allowFreeformInput: false,
          options: [
            { id: "true", label: localize("mcp.elicit.true", "True"), value: "true" },
            { id: "false", label: localize("mcp.elicit.false", "False"), value: "false" }
          ],
          defaultValue: schema.default !== void 0 ? String(schema.default) : void 0
        });
      } else if (isLegacyTitledEnumSchema(schema)) {
        questions.push({
          id,
          type: "singleSelect",
          title,
          description,
          required: isRequired,
          allowFreeformInput: false,
          options: schema.enum.map((v, i) => ({
            id: v,
            label: schema.enumNames[i] ? `${v} - ${schema.enumNames[i]}` : v,
            value: v
          })),
          defaultValue: schema.default
        });
      } else if (isTitledSingleEnumSchema(schema)) {
        questions.push({
          id,
          type: "singleSelect",
          title,
          description,
          required: isRequired,
          allowFreeformInput: false,
          options: schema.oneOf.map(({ const: value, title: optTitle }) => ({
            id: value,
            label: optTitle ? `${value} - ${optTitle}` : value,
            value
          })),
          defaultValue: schema.default
        });
      } else if (isUntitledEnumSchema(schema)) {
        questions.push({
          id,
          type: "singleSelect",
          title,
          description,
          required: isRequired,
          allowFreeformInput: false,
          options: schema.enum.map((v) => ({ id: v, label: v, value: v })),
          defaultValue: schema.default
        });
      } else if (isTitledMultiEnumSchema(schema)) {
        questions.push({
          id,
          type: "multiSelect",
          title,
          description,
          required: isRequired,
          allowFreeformInput: false,
          options: schema.items.anyOf.map(({ const: value, title: optTitle }) => ({
            id: value,
            label: optTitle ? `${value} - ${optTitle}` : value,
            value
          })),
          defaultValue: schema.default
        });
      } else if (isUntitledMultiEnumSchema(schema)) {
        questions.push({
          id,
          type: "multiSelect",
          title,
          description,
          required: isRequired,
          allowFreeformInput: false,
          options: schema.items.enum.map((v) => ({ id: v, label: v, value: v })),
          defaultValue: schema.default
        });
      } else {
        const validation = {};
        if (schema.type === "string") {
          if (schema.minLength !== void 0) {
            validation.minLength = schema.minLength;
          }
          if (schema.maxLength !== void 0) {
            validation.maxLength = schema.maxLength;
          }
          if (schema.format) {
            validation.format = schema.format;
          }
        } else if (schema.type === "number" || schema.type === "integer") {
          if (schema.minimum !== void 0) {
            validation.minimum = schema.minimum;
          }
          if (schema.maximum !== void 0) {
            validation.maximum = schema.maximum;
          }
          if (schema.type === "integer") {
            validation.isInteger = true;
          }
        }
        questions.push({
          id,
          type: "text",
          title,
          description,
          required: isRequired,
          defaultValue: schema.default !== void 0 ? String(schema.default) : void 0,
          validation: Object.keys(validation).length > 0 ? validation : void 0
        });
      }
    }
    return { questions, idToPropertyMap };
  }
  /**
   * Converts carousel answers (keyed by question ID) back into the
   * MCP ElicitResult content format (keyed by schema property names),
   * coercing types as needed.
   */
  _convertCarouselAnswersToElicitResult(answers, idToPropertyMap, schemaProperties) {
    const content = {};
    for (const [questionId, answer] of Object.entries(answers)) {
      const propertyName = idToPropertyMap.get(questionId);
      if (!propertyName) {
        continue;
      }
      const schema = schemaProperties[propertyName];
      if (!schema) {
        continue;
      }
      let rawValue = answer;
      if (typeof answer === "object" && answer !== null) {
        const obj = answer;
        if ("selectedValue" in obj) {
          rawValue = obj.selectedValue;
        } else if ("selectedValues" in obj) {
          rawValue = obj.selectedValues;
        } else if ("freeformValue" in obj && obj.freeformValue) {
          rawValue = obj.freeformValue;
        }
      }
      if (rawValue === void 0 || rawValue === null) {
        continue;
      }
      if (schema.type === "boolean") {
        content[propertyName] = rawValue === "true" || rawValue === true;
      } else if (schema.type === "number" || schema.type === "integer") {
        const num = Number(rawValue);
        if (!isNaN(num)) {
          content[propertyName] = num;
        }
      } else if (schema.type === "array") {
        if (Array.isArray(rawValue)) {
          content[propertyName] = rawValue.map((v) => String(v));
        }
      } else {
        content[propertyName] = String(rawValue);
      }
    }
    return content;
  }
};
McpElicitationService = __decorateClass([
  __decorateParam(0, INotificationService),
  __decorateParam(1, IQuickInputService),
  __decorateParam(2, IChatService),
  __decorateParam(3, IOpenerService)
], McpElicitationService);
export {
  McpElicitationService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcYnJvd3NlclxcbWNwRWxpY2l0YXRpb25TZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBhc3NlcnROZXZlciwgc29mdEFzc2VydE5ldmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXNzZXJ0LmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGlzRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrLCBJUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgQ2hhdEVsaWNpdGF0aW9uUmVxdWVzdFBhcnQgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0UHJvZ3Jlc3NUeXBlcy9jaGF0RWxpY2l0YXRpb25SZXF1ZXN0UGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0UHJvZ3Jlc3NUeXBlcy9jaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEuanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGVsIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IEVsaWNpdGF0aW9uU3RhdGUsIElDaGF0UXVlc3Rpb24sIElDaGF0UXVlc3Rpb25BbnN3ZXJzLCBJQ2hhdFF1ZXN0aW9uVmFsaWRhdGlvbiwgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWxpY2l0YXRpb25LaW5kLCBFbGljaXRSZXN1bHQsIElGb3JtTW9kZUVsaWNpdFJlc3VsdCwgSU1jcEVsaWNpdGF0aW9uU2VydmljZSwgSU1jcFNlcnZlciwgSU1jcFRvb2xDYWxsQ29udGV4dCwgSVVybE1vZGVFbGljaXRSZXN1bHQsIE1jcENvbm5lY3Rpb25TdGF0ZSwgTXBjUmVzcG9uc2VFcnJvciB9IGZyb20gJy4uL2NvbW1vbi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQgeyBtY3BTZXJ2ZXJUb1NvdXJjZURhdGEgfSBmcm9tICcuLi9jb21tb24vbWNwVHlwZXNVdGlscy5qcyc7XG5pbXBvcnQgeyBNQ1AgfSBmcm9tICcuLi9jb21tb24vbW9kZWxDb250ZXh0UHJvdG9jb2wuanMnO1xuXG5jb25zdCBub25lSXRlbTogSVF1aWNrUGlja0l0ZW0gPSB7IGlkOiB1bmRlZmluZWQsIGxhYmVsOiBsb2NhbGl6ZSgnbWNwLmVsaWNpdC5lbnVtLm5vbmUnLCAnTm9uZScpLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21jcC5lbGljaXQuZW51bS5ub25lLmRlc2NyaXB0aW9uJywgJ05vIHNlbGVjdGlvbicpLCBhbHdheXNTaG93OiB0cnVlIH07XG5cbnR5cGUgUHJlMjAyNTExMjVFbGljaXRhdGlvblBhcmFtcyA9IE9taXQ8TUNQLkVsaWNpdFJlcXVlc3RGb3JtUGFyYW1zLCAnbW9kZSc+ICYgeyBtb2RlPzogdW5kZWZpbmVkIH07XG5cbmZ1bmN0aW9uIGlzRm9ybUVsaWNpdGF0aW9uKHBhcmFtczogTUNQLkVsaWNpdFJlcXVlc3RbJ3BhcmFtcyddIHwgUHJlMjAyNTExMjVFbGljaXRhdGlvblBhcmFtcyk6IHBhcmFtcyBpcyAoTUNQLkVsaWNpdFJlcXVlc3RGb3JtUGFyYW1zIHwgUHJlMjAyNTExMjVFbGljaXRhdGlvblBhcmFtcykge1xuXHRyZXR1cm4gcGFyYW1zLm1vZGUgPT09ICdmb3JtJyB8fCAocGFyYW1zLm1vZGUgPT09IHVuZGVmaW5lZCAmJiAhIShwYXJhbXMgYXMgUHJlMjAyNTExMjVFbGljaXRhdGlvblBhcmFtcykucmVxdWVzdGVkU2NoZW1hKTtcbn1cblxuZnVuY3Rpb24gaXNVcmxFbGljaXRhdGlvbihwYXJhbXM6IE1DUC5FbGljaXRSZXF1ZXN0WydwYXJhbXMnXSk6IHBhcmFtcyBpcyBNQ1AuRWxpY2l0UmVxdWVzdFVSTFBhcmFtcyB7XG5cdHJldHVybiBwYXJhbXMubW9kZSA9PT0gJ3VybCc7XG59XG5cbmZ1bmN0aW9uIGlzTGVnYWN5VGl0bGVkRW51bVNjaGVtYShzY2hlbWE6IE1DUC5QcmltaXRpdmVTY2hlbWFEZWZpbml0aW9uKTogc2NoZW1hIGlzIE1DUC5MZWdhY3lUaXRsZWRFbnVtU2NoZW1hICYgeyBlbnVtTmFtZXM6IHN0cmluZ1tdIH0ge1xuXHRjb25zdCBjYXN0ID0gc2NoZW1hIGFzIE1DUC5MZWdhY3lUaXRsZWRFbnVtU2NoZW1hO1xuXHRyZXR1cm4gY2FzdC50eXBlID09PSAnc3RyaW5nJyAmJiBBcnJheS5pc0FycmF5KGNhc3QuZW51bSkgJiYgQXJyYXkuaXNBcnJheShjYXN0LmVudW1OYW1lcyk7XG59XG5cbmZ1bmN0aW9uIGlzVW50aXRsZWRFbnVtU2NoZW1hKHNjaGVtYTogTUNQLlByaW1pdGl2ZVNjaGVtYURlZmluaXRpb24pOiBzY2hlbWEgaXMgTUNQLkxlZ2FjeVRpdGxlZEVudW1TY2hlbWEgfCBNQ1AuVW50aXRsZWRTaW5nbGVTZWxlY3RFbnVtU2NoZW1hIHtcblx0Y29uc3QgY2FzdCA9IHNjaGVtYSBhcyBNQ1AuTGVnYWN5VGl0bGVkRW51bVNjaGVtYSB8IE1DUC5VbnRpdGxlZFNpbmdsZVNlbGVjdEVudW1TY2hlbWE7XG5cdHJldHVybiBjYXN0LnR5cGUgPT09ICdzdHJpbmcnICYmIEFycmF5LmlzQXJyYXkoY2FzdC5lbnVtKTtcbn1cblxuZnVuY3Rpb24gaXNUaXRsZWRTaW5nbGVFbnVtU2NoZW1hKHNjaGVtYTogTUNQLlByaW1pdGl2ZVNjaGVtYURlZmluaXRpb24pOiBzY2hlbWEgaXMgTUNQLlRpdGxlZFNpbmdsZVNlbGVjdEVudW1TY2hlbWEge1xuXHRjb25zdCBjYXN0ID0gc2NoZW1hIGFzIE1DUC5UaXRsZWRTaW5nbGVTZWxlY3RFbnVtU2NoZW1hO1xuXHRyZXR1cm4gY2FzdC50eXBlID09PSAnc3RyaW5nJyAmJiBBcnJheS5pc0FycmF5KGNhc3Qub25lT2YpO1xufVxuXG5mdW5jdGlvbiBpc1VudGl0bGVkTXVsdGlFbnVtU2NoZW1hKHNjaGVtYTogTUNQLlByaW1pdGl2ZVNjaGVtYURlZmluaXRpb24pOiBzY2hlbWEgaXMgTUNQLlVudGl0bGVkTXVsdGlTZWxlY3RFbnVtU2NoZW1hIHtcblx0Y29uc3QgY2FzdCA9IHNjaGVtYSBhcyBNQ1AuVW50aXRsZWRNdWx0aVNlbGVjdEVudW1TY2hlbWE7XG5cdHJldHVybiBjYXN0LnR5cGUgPT09ICdhcnJheScgJiYgISFjYXN0Lml0ZW1zPy5lbnVtO1xufVxuXG5mdW5jdGlvbiBpc1RpdGxlZE11bHRpRW51bVNjaGVtYShzY2hlbWE6IE1DUC5QcmltaXRpdmVTY2hlbWFEZWZpbml0aW9uKTogc2NoZW1hIGlzIE1DUC5UaXRsZWRNdWx0aVNlbGVjdEVudW1TY2hlbWEge1xuXHRjb25zdCBjYXN0ID0gc2NoZW1hIGFzIE1DUC5UaXRsZWRNdWx0aVNlbGVjdEVudW1TY2hlbWE7XG5cdHJldHVybiBjYXN0LnR5cGUgPT09ICdhcnJheScgJiYgISFjYXN0Lml0ZW1zPy5hbnlPZjtcbn1cblxuZXhwb3J0IGNsYXNzIE1jcEVsaWNpdGF0aW9uU2VydmljZSBpbXBsZW1lbnRzIElNY3BFbGljaXRhdGlvblNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9xdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdCkgeyB9XG5cblx0cHVibGljIGVsaWNpdChzZXJ2ZXI6IElNY3BTZXJ2ZXIsIGNvbnRleHQ6IElNY3BUb29sQ2FsbENvbnRleHQgfCB1bmRlZmluZWQsIGVsaWNpdGF0aW9uOiBNQ1AuRWxpY2l0UmVxdWVzdFsncGFyYW1zJ10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8RWxpY2l0UmVzdWx0PiB7XG5cdFx0aWYgKGlzRm9ybUVsaWNpdGF0aW9uKGVsaWNpdGF0aW9uKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2VsaWNpdEZvcm0oc2VydmVyLCBjb250ZXh0LCBlbGljaXRhdGlvbiwgdG9rZW4pO1xuXHRcdH0gZWxzZSBpZiAoaXNVcmxFbGljaXRhdGlvbihlbGljaXRhdGlvbikpIHtcblx0XHRcdHJldHVybiB0aGlzLl9lbGljaXRVcmwoc2VydmVyLCBjb250ZXh0LCBlbGljaXRhdGlvbiwgdG9rZW4pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzb2Z0QXNzZXJ0TmV2ZXIoZWxpY2l0YXRpb24pO1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBNcGNSZXNwb25zZUVycm9yKCdVbnN1cHBvcnRlZCBlbGljaXRhdGlvbiB0eXBlJywgTUNQLklOVkFMSURfUEFSQU1TLCB1bmRlZmluZWQpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9lbGljaXRGb3JtKHNlcnZlcjogSU1jcFNlcnZlciwgY29udGV4dDogSU1jcFRvb2xDYWxsQ29udGV4dCB8IHVuZGVmaW5lZCwgZWxpY2l0YXRpb246IE1DUC5FbGljaXRSZXF1ZXN0Rm9ybVBhcmFtcyB8IFByZTIwMjUxMTI1RWxpY2l0YXRpb25QYXJhbXMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUZvcm1Nb2RlRWxpY2l0UmVzdWx0PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCBuZXcgUHJvbWlzZTxNQ1AuRWxpY2l0UmVzdWx0PihyZXNvbHZlID0+IHtcblx0XHRcdGNvbnN0IGNoYXRNb2RlbCA9IGNvbnRleHQ/LmNoYXRTZXNzaW9uUmVzb3VyY2UgJiYgdGhpcy5fY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihjb250ZXh0LmNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKGNoYXRNb2RlbCBpbnN0YW5jZW9mIENoYXRNb2RlbCkge1xuXHRcdFx0XHRjb25zdCByZXF1ZXN0ID0gY2hhdE1vZGVsLmdldFJlcXVlc3RzKCkuYXQoLTEpO1xuXHRcdFx0XHRpZiAocmVxdWVzdCkge1xuXHRcdFx0XHRcdGNvbnN0IHsgcXVlc3Rpb25zLCBpZFRvUHJvcGVydHlNYXAgfSA9IHRoaXMuX2NvbnZlcnRTY2hlbWFUb1F1ZXN0aW9ucyhlbGljaXRhdGlvbik7XG5cdFx0XHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBuZXcgQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhKFxuXHRcdFx0XHRcdFx0cXVlc3Rpb25zLFxuXHRcdFx0XHRcdFx0LyogYWxsb3dTa2lwICovIHRydWUsXG5cdFx0XHRcdFx0XHQvKiByZXNvbHZlSWQgKi8gdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0LyogZGF0YSAqLyB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHQvKiBpc1VzZWQgKi8gdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0LyogbWVzc2FnZSAqLyBuZXcgTWFya2Rvd25TdHJpbmcoZWxpY2l0YXRpb24ubWVzc2FnZSksXG5cdFx0XHRcdFx0XHQvKiBzb3VyY2UgKi8gbWNwU2VydmVyVG9Tb3VyY2VEYXRhKHNlcnZlciksXG5cdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdGNoYXRNb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKHJlcXVlc3QsIGNhcm91c2VsKTtcblxuXHRcdFx0XHRcdHN0b3JlLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB7XG5cdFx0XHRcdFx0XHRjYXJvdXNlbC5jb21wbGV0aW9uLmNvbXBsZXRlKHsgYW5zd2VyczogdW5kZWZpbmVkIH0pO1xuXHRcdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRcdGNhcm91c2VsLmNvbXBsZXRpb24ucC50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoIXJlc3VsdC5hbnN3ZXJzKSB7XG5cdFx0XHRcdFx0XHRcdHJlc29sdmUoeyBhY3Rpb246ICdjYW5jZWwnIH0pO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgY29udGVudCA9IHRoaXMuX2NvbnZlcnRDYXJvdXNlbEFuc3dlcnNUb0VsaWNpdFJlc3VsdChcblx0XHRcdFx0XHRcdFx0XHRyZXN1bHQuYW5zd2Vycyxcblx0XHRcdFx0XHRcdFx0XHRpZFRvUHJvcGVydHlNYXAsXG5cdFx0XHRcdFx0XHRcdFx0ZWxpY2l0YXRpb24ucmVxdWVzdGVkU2NoZW1hLnByb3BlcnRpZXMsXG5cdFx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0XHRcdHJlc29sdmUoeyBhY3Rpb246ICdhY2NlcHQnLCBjb250ZW50IH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBGYWxsYmFjazogbm8gY2hhdCBzZXNzaW9uIFx1MjE5MiBub3RpZmljYXRpb24gKyBxdWlja3BpY2tcblx0XHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0bWVzc2FnZTogZWxpY2l0YXRpb24ubWVzc2FnZSxcblx0XHRcdFx0c291cmNlOiBsb2NhbGl6ZSgnbWNwLmVsaWNpdC5zb3VyY2UnLCAnTUNQIFNlcnZlciAoezB9KScsIHNlcnZlci5kZWZpbml0aW9uLmxhYmVsKSxcblx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdGFjdGlvbnM6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBbc3RvcmUuYWRkKG5ldyBBY3Rpb24oJ21jcC5lbGljaXQuZ2l2ZScsIGxvY2FsaXplKCdtY3AuZWxpY2l0LmdpdmUnLCAnUmVzcG9uZCcpLCB1bmRlZmluZWQsIHRydWUsICgpID0+IHJlc29sdmUodGhpcy5fZG9FbGljaXRGb3JtKGVsaWNpdGF0aW9uLCB0b2tlbikpKSldLFxuXHRcdFx0XHRcdHNlY29uZGFyeTogW3N0b3JlLmFkZChuZXcgQWN0aW9uKCdtY3AuZWxpY2l0LmNhbmNlbCcsIGxvY2FsaXplKCdtY3AuZWxpY2l0LmNhbmNlbCcsICdDYW5jZWwnKSwgdW5kZWZpbmVkLCB0cnVlLCAoKSA9PiByZXNvbHZlKHsgYWN0aW9uOiAnZGVjbGluZScgfSkpKV0sXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0c3RvcmUuYWRkKGhhbmRsZS5vbkRpZENsb3NlKCgpID0+IHJlc29sdmUoeyBhY3Rpb246ICdjYW5jZWwnIH0pKSk7XG5cdFx0XHRzdG9yZS5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gcmVzb2x2ZSh7IGFjdGlvbjogJ2NhbmNlbCcgfSkpKTtcblxuXHRcdH0pLmZpbmFsbHkoKCkgPT4gc3RvcmUuZGlzcG9zZSgpKTtcblxuXHRcdHJldHVybiB7IGtpbmQ6IEVsaWNpdGF0aW9uS2luZC5Gb3JtLCB2YWx1ZSwgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9lbGljaXRVcmwoc2VydmVyOiBJTWNwU2VydmVyLCBjb250ZXh0OiBJTWNwVG9vbENhbGxDb250ZXh0IHwgdW5kZWZpbmVkLCBlbGljaXRhdGlvbjogTUNQLkVsaWNpdFJlcXVlc3RVUkxQYXJhbXMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVVybE1vZGVFbGljaXRSZXN1bHQ+IHtcblx0XHRjb25zdCBwcm9taXNlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHQvLyBXZSBjcmVhdGUgdGhpcyBhaGVhZCBvZiB0aW1lIGluIGNhc2UgZS5nLiBhIHVzZXIgbWFudWFsbHkgb3BlbnMgdGhlIFVSTCBiZWZvcmVoYW5kXG5cdFx0Y29uc3QgY29tcGxldGVQcm9taXNlID0gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0cHJvbWlzZVN0b3JlLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiByZWplY3QobmV3IENhbmNlbGxhdGlvbkVycm9yKCkpKSk7XG5cdFx0XHRwcm9taXNlU3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgY254ID0gc2VydmVyLmNvbm5lY3Rpb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCBoYW5kbGVyID0gY254Py5oYW5kbGVyLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0aWYgKGhhbmRsZXIpIHtcblx0XHRcdFx0XHRyZWFkZXIuc3RvcmUuYWRkKGhhbmRsZXIub25EaWRSZWNlaXZlRWxpY2l0YXRpb25Db21wbGV0ZU5vdGlmaWNhdGlvbihlID0+IHtcblx0XHRcdFx0XHRcdGlmIChlLnBhcmFtcy5lbGljaXRhdGlvbklkID09PSBlbGljaXRhdGlvbi5lbGljaXRhdGlvbklkKSB7XG5cdFx0XHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoIU1jcENvbm5lY3Rpb25TdGF0ZS5pc1J1bm5pbmcoc2VydmVyLmNvbm5lY3Rpb25TdGF0ZS5yZWFkKHJlYWRlcikpKSB7XG5cdFx0XHRcdFx0cmVqZWN0KG5ldyBDYW5jZWxsYXRpb25FcnJvcigpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0pLmZpbmFsbHkoKCkgPT4gcHJvbWlzZVN0b3JlLmRpc3Bvc2UoKSk7XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IG5ldyBQcm9taXNlPE1DUC5FbGljaXRSZXN1bHQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0Y29uc3QgY2hhdE1vZGVsID0gY29udGV4dD8uY2hhdFNlc3Npb25SZXNvdXJjZSAmJiB0aGlzLl9jaGF0U2VydmljZS5nZXRTZXNzaW9uKGNvbnRleHQuY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRpZiAoY2hhdE1vZGVsIGluc3RhbmNlb2YgQ2hhdE1vZGVsKSB7XG5cdFx0XHRcdGNvbnN0IHJlcXVlc3QgPSBjaGF0TW9kZWwuZ2V0UmVxdWVzdHMoKS5hdCgtMSk7XG5cdFx0XHRcdGlmIChyZXF1ZXN0KSB7XG5cdFx0XHRcdFx0Y29uc3QgcGFydCA9IG5ldyBDaGF0RWxpY2l0YXRpb25SZXF1ZXN0UGFydChcblx0XHRcdFx0XHRcdGxvY2FsaXplKCdtY3AuZWxpY2l0LnVybC50aXRsZScsICdBdXRob3JpemF0aW9uIFJlcXVpcmVkJyksXG5cdFx0XHRcdFx0XHRuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRUZXh0KGVsaWNpdGF0aW9uLm1lc3NhZ2UpXG5cdFx0XHRcdFx0XHRcdC5hcHBlbmRNYXJrZG93bignXFxuXFxuJyArIGxvY2FsaXplKCdtY3AuZWxpY2l0LnVybC5pbnN0cnVjdGlvbicsICdPcGVuIHRoaXMgVVJMPycpKVxuXHRcdFx0XHRcdFx0XHQuYXBwZW5kQ29kZWJsb2NrKCcnLCBlbGljaXRhdGlvbi51cmwpLFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ21zZy5zdWJ0aXRsZScsIFwiezB9IChNQ1AgU2VydmVyKVwiLCBzZXJ2ZXIuZGVmaW5pdGlvbi5sYWJlbCksXG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSgnbWNwLmVsaWNpdC51cmwub3BlbicsICdPcGVuIHswfScsIFVSSS5wYXJzZShlbGljaXRhdGlvbi51cmwpLmF1dGhvcml0eSksXG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSgnbWNwLmVsaWNpdC5yZWplY3QnLCAnQ2FuY2VsJyksXG5cdFx0XHRcdFx0XHRhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX2RvRWxpY2l0VXJsKGVsaWNpdGF0aW9uLCB0b2tlbik7XG5cdFx0XHRcdFx0XHRcdHJlc29sdmUocmVzdWx0KTtcblx0XHRcdFx0XHRcdFx0Y29tcGxldGVQcm9taXNlLnRoZW4oKCkgPT4gcGFydC5oaWRlKCkpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0LmFjdGlvbiA9PT0gJ2FjY2VwdCcgPyBFbGljaXRhdGlvblN0YXRlLkFjY2VwdGVkIDogRWxpY2l0YXRpb25TdGF0ZS5SZWplY3RlZDtcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHQoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHJlc29sdmUoeyBhY3Rpb246ICdkZWNsaW5lJyB9KTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShFbGljaXRhdGlvblN0YXRlLlJlamVjdGVkKTtcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRtY3BTZXJ2ZXJUb1NvdXJjZURhdGEoc2VydmVyKSxcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdGNoYXRNb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKHJlcXVlc3QsIHBhcnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdFx0bWVzc2FnZTogZWxpY2l0YXRpb24ubWVzc2FnZSArICcgJyArIGxvY2FsaXplKCdtY3AuZWxpY2l0LnVybC5pbnN0cnVjdGlvbjInLCAnVGhpcyB3aWxsIG9wZW4gezB9JywgZWxpY2l0YXRpb24udXJsKSxcblx0XHRcdFx0XHRzb3VyY2U6IGxvY2FsaXplKCdtY3AuZWxpY2l0LnNvdXJjZScsICdNQ1AgU2VydmVyICh7MH0pJywgc2VydmVyLmRlZmluaXRpb24ubGFiZWwpLFxuXHRcdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRcdGFjdGlvbnM6IHtcblx0XHRcdFx0XHRcdHByaW1hcnk6IFtzdG9yZS5hZGQobmV3IEFjdGlvbignbWNwLmVsaWNpdC51cmwub3BlbjInLCBsb2NhbGl6ZSgnbWNwLmVsaWNpdC51cmwub3BlbjInLCAnT3BlbiBVUkwnKSwgdW5kZWZpbmVkLCB0cnVlLCAoKSA9PiByZXNvbHZlKHRoaXMuX2RvRWxpY2l0VXJsKGVsaWNpdGF0aW9uLCB0b2tlbikpKSldLFxuXHRcdFx0XHRcdFx0c2Vjb25kYXJ5OiBbc3RvcmUuYWRkKG5ldyBBY3Rpb24oJ21jcC5lbGljaXQuY2FuY2VsJywgbG9jYWxpemUoJ21jcC5lbGljaXQuY2FuY2VsJywgJ0NhbmNlbCcpLCB1bmRlZmluZWQsIHRydWUsICgpID0+IHJlc29sdmUoeyBhY3Rpb246ICdkZWNsaW5lJyB9KSkpXSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRzdG9yZS5hZGQoaGFuZGxlLm9uRGlkQ2xvc2UoKCkgPT4gcmVzb2x2ZSh7IGFjdGlvbjogJ2NhbmNlbCcgfSkpKTtcblx0XHRcdFx0c3RvcmUuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHJlc29sdmUoeyBhY3Rpb246ICdjYW5jZWwnIH0pKSk7XG5cdFx0XHR9XG5cdFx0fSkuZmluYWxseSgoKSA9PiBzdG9yZS5kaXNwb3NlKCkpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6IEVsaWNpdGF0aW9uS2luZC5VUkwsXG5cdFx0XHR2YWx1ZSxcblx0XHRcdHdhaXQ6IGNvbXBsZXRlUHJvbWlzZSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHByb21pc2VTdG9yZS5kaXNwb3NlKCksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2RvRWxpY2l0VXJsKGVsaWNpdGF0aW9uOiBNQ1AuRWxpY2l0UmVxdWVzdFVSTFBhcmFtcywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxNQ1AuRWxpY2l0UmVzdWx0PiB7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4geyBhY3Rpb246ICdjYW5jZWwnIH07XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGlmIChhd2FpdCB0aGlzLl9vcGVuZXJTZXJ2aWNlLm9wZW4oZWxpY2l0YXRpb24udXJsLCB7IGFsbG93Q29tbWFuZHM6IGZhbHNlIH0pKSB7XG5cdFx0XHRcdHJldHVybiB7IGFjdGlvbjogJ2FjY2VwdCcgfTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIGlnbm9yZWRcblx0XHR9XG5cblx0XHRyZXR1cm4geyBhY3Rpb246ICdkZWNsaW5lJyB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZG9FbGljaXRGb3JtKGVsaWNpdGF0aW9uOiBNQ1AuRWxpY2l0UmVxdWVzdEZvcm1QYXJhbXMgfCBQcmUyMDI1MTEyNUVsaWNpdGF0aW9uUGFyYW1zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPE1DUC5FbGljaXRSZXN1bHQ+IHtcblx0XHRjb25zdCBxdWlja1BpY2sgPSB0aGlzLl9xdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2s8SVF1aWNrUGlja0l0ZW0+KCk7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcHJvcGVydGllcyA9IE9iamVjdC5lbnRyaWVzKGVsaWNpdGF0aW9uLnJlcXVlc3RlZFNjaGVtYS5wcm9wZXJ0aWVzKTtcblx0XHRcdGNvbnN0IHJlcXVpcmVkRmllbGRzID0gbmV3IFNldChlbGljaXRhdGlvbi5yZXF1ZXN0ZWRTY2hlbWEucmVxdWlyZWQgfHwgW10pO1xuXHRcdFx0Y29uc3QgcmVzdWx0czogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgbnVtYmVyIHwgYm9vbGVhbiB8IHN0cmluZ1tdPiA9IHt9O1xuXHRcdFx0Y29uc3QgYmFja1NuYXBzaG90czogeyB2YWx1ZTogc3RyaW5nOyB2YWxpZGF0aW9uTWVzc2FnZT86IHN0cmluZyB9W10gPSBbXTtcblxuXHRcdFx0cXVpY2tQaWNrLnRpdGxlID0gZWxpY2l0YXRpb24ubWVzc2FnZTtcblx0XHRcdHF1aWNrUGljay50b3RhbFN0ZXBzID0gcHJvcGVydGllcy5sZW5ndGg7XG5cdFx0XHRxdWlja1BpY2suaWdub3JlRm9jdXNPdXQgPSB0cnVlO1xuXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHByb3BlcnRpZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgW3Byb3BlcnR5TmFtZSwgc2NoZW1hXSA9IHByb3BlcnRpZXNbaV07XG5cdFx0XHRcdGNvbnN0IGlzUmVxdWlyZWQgPSByZXF1aXJlZEZpZWxkcy5oYXMocHJvcGVydHlOYW1lKTtcblx0XHRcdFx0Y29uc3QgcmVzdG9yZSA9IGJhY2tTbmFwc2hvdHMuYXQoaSk7XG5cblx0XHRcdFx0c3RvcmUuY2xlYXIoKTtcblx0XHRcdFx0cXVpY2tQaWNrLnN0ZXAgPSBpICsgMTtcblx0XHRcdFx0cXVpY2tQaWNrLnRpdGxlID0gc2NoZW1hLnRpdGxlIHx8IHByb3BlcnR5TmFtZTtcblx0XHRcdFx0cXVpY2tQaWNrLnBsYWNlaG9sZGVyID0gdGhpcy5fZ2V0RmllbGRQbGFjZWhvbGRlcihzY2hlbWEsIGlzUmVxdWlyZWQpO1xuXHRcdFx0XHRxdWlja1BpY2sudmFsdWUgPSByZXN0b3JlPy52YWx1ZSA/PyAnJztcblx0XHRcdFx0cXVpY2tQaWNrLnZhbGlkYXRpb25NZXNzYWdlID0gJyc7XG5cdFx0XHRcdHF1aWNrUGljay5idXR0b25zID0gaSA+IDAgPyBbdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuYmFja0J1dHRvbl0gOiBbXTtcblxuXHRcdFx0XHRsZXQgcmVzdWx0OiB7IHR5cGU6ICd2YWx1ZSc7IHZhbHVlOiBzdHJpbmcgfCBudW1iZXIgfCBib29sZWFuIHwgdW5kZWZpbmVkIHwgc3RyaW5nW10gfSB8IHsgdHlwZTogJ2JhY2snIH0gfCB7IHR5cGU6ICdjYW5jZWwnIH07XG5cdFx0XHRcdGlmIChzY2hlbWEudHlwZSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRcdFx0cmVzdWx0ID0gYXdhaXQgdGhpcy5faGFuZGxlRW51bUZpZWxkKHF1aWNrUGljaywgeyBlbnVtOiBbeyBjb25zdDogJ3RydWUnIH0sIHsgY29uc3Q6ICdmYWxzZScgfV0sIGRlZmF1bHQ6IHNjaGVtYS5kZWZhdWx0ID8gU3RyaW5nKHNjaGVtYS5kZWZhdWx0KSA6IHVuZGVmaW5lZCB9LCBpc1JlcXVpcmVkLCBzdG9yZSwgdG9rZW4pO1xuXHRcdFx0XHRcdGlmIChyZXN1bHQudHlwZSA9PT0gJ3ZhbHVlJykgeyByZXN1bHQudmFsdWUgPSByZXN1bHQudmFsdWUgPT09ICd0cnVlJyA/IHRydWUgOiBmYWxzZTsgfVxuXHRcdFx0XHR9IGVsc2UgaWYgKGlzTGVnYWN5VGl0bGVkRW51bVNjaGVtYShzY2hlbWEpKSB7XG5cdFx0XHRcdFx0cmVzdWx0ID0gYXdhaXQgdGhpcy5faGFuZGxlRW51bUZpZWxkKHF1aWNrUGljaywgeyBlbnVtOiBzY2hlbWEuZW51bS5tYXAoKHYsIGkpID0+ICh7IGNvbnN0OiB2LCB0aXRsZTogc2NoZW1hLmVudW1OYW1lc1tpXSB9KSksIGRlZmF1bHQ6IHNjaGVtYS5kZWZhdWx0IH0sIGlzUmVxdWlyZWQsIHN0b3JlLCB0b2tlbik7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaXNVbnRpdGxlZEVudW1TY2hlbWEoc2NoZW1hKSkge1xuXHRcdFx0XHRcdHJlc3VsdCA9IGF3YWl0IHRoaXMuX2hhbmRsZUVudW1GaWVsZChxdWlja1BpY2ssIHsgZW51bTogc2NoZW1hLmVudW0ubWFwKHYgPT4gKHsgY29uc3Q6IHYgfSkpLCBkZWZhdWx0OiBzY2hlbWEuZGVmYXVsdCB9LCBpc1JlcXVpcmVkLCBzdG9yZSwgdG9rZW4pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGlzVGl0bGVkU2luZ2xlRW51bVNjaGVtYShzY2hlbWEpKSB7XG5cdFx0XHRcdFx0cmVzdWx0ID0gYXdhaXQgdGhpcy5faGFuZGxlRW51bUZpZWxkKHF1aWNrUGljaywgeyBlbnVtOiBzY2hlbWEub25lT2YsIGRlZmF1bHQ6IHNjaGVtYS5kZWZhdWx0IH0sIGlzUmVxdWlyZWQsIHN0b3JlLCB0b2tlbik7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaXNUaXRsZWRNdWx0aUVudW1TY2hlbWEoc2NoZW1hKSkge1xuXHRcdFx0XHRcdHJlc3VsdCA9IGF3YWl0IHRoaXMuX2hhbmRsZU11bHRpRW51bUZpZWxkKHF1aWNrUGljaywgeyBlbnVtOiBzY2hlbWEuaXRlbXMuYW55T2YsIGRlZmF1bHQ6IHNjaGVtYS5kZWZhdWx0IH0sIGlzUmVxdWlyZWQsIHN0b3JlLCB0b2tlbik7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaXNVbnRpdGxlZE11bHRpRW51bVNjaGVtYShzY2hlbWEpKSB7XG5cdFx0XHRcdFx0cmVzdWx0ID0gYXdhaXQgdGhpcy5faGFuZGxlTXVsdGlFbnVtRmllbGQocXVpY2tQaWNrLCB7IGVudW06IHNjaGVtYS5pdGVtcy5lbnVtLm1hcCh2ID0+ICh7IGNvbnN0OiB2IH0pKSwgZGVmYXVsdDogc2NoZW1hLmRlZmF1bHQgfSwgaXNSZXF1aXJlZCwgc3RvcmUsIHRva2VuKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXN1bHQgPSBhd2FpdCB0aGlzLl9oYW5kbGVJbnB1dEZpZWxkKHF1aWNrUGljaywgc2NoZW1hLCBpc1JlcXVpcmVkLCBzdG9yZSwgdG9rZW4pO1xuXHRcdFx0XHRcdGlmIChyZXN1bHQudHlwZSA9PT0gJ3ZhbHVlJyAmJiAoc2NoZW1hLnR5cGUgPT09ICdudW1iZXInIHx8IHNjaGVtYS50eXBlID09PSAnaW50ZWdlcicpKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQudmFsdWUgPSBOdW1iZXIocmVzdWx0LnZhbHVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAocmVzdWx0LnR5cGUgPT09ICdiYWNrJykge1xuXHRcdFx0XHRcdGkgLT0gMjtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocmVzdWx0LnR5cGUgPT09ICdjYW5jZWwnKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgYWN0aW9uOiAnY2FuY2VsJyB9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YmFja1NuYXBzaG90c1tpXSA9IHsgdmFsdWU6IHF1aWNrUGljay52YWx1ZSB9O1xuXG5cdFx0XHRcdGlmIChyZXN1bHQudmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGRlbGV0ZSByZXN1bHRzW3Byb3BlcnR5TmFtZV07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzdWx0c1twcm9wZXJ0eU5hbWVdID0gcmVzdWx0LnZhbHVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGFjdGlvbjogJ2FjY2VwdCcsXG5cdFx0XHRcdGNvbnRlbnQ6IHJlc3VsdHMsXG5cdFx0XHR9O1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHRxdWlja1BpY2suZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldEZpZWxkUGxhY2Vob2xkZXIoc2NoZW1hOiBNQ1AuUHJpbWl0aXZlU2NoZW1hRGVmaW5pdGlvbiwgcmVxdWlyZWQ6IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRcdGxldCBwbGFjZWhvbGRlciA9IHNjaGVtYS5kZXNjcmlwdGlvbiB8fCAnJztcblx0XHRpZiAoIXJlcXVpcmVkKSB7XG5cdFx0XHRwbGFjZWhvbGRlciA9IHBsYWNlaG9sZGVyID8gYCR7cGxhY2Vob2xkZXJ9ICgke2xvY2FsaXplKCdvcHRpb25hbCcsICdPcHRpb25hbCcpfSlgIDogbG9jYWxpemUoJ29wdGlvbmFsJywgJ09wdGlvbmFsJyk7XG5cdFx0fVxuXHRcdHJldHVybiBwbGFjZWhvbGRlcjtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZUVudW1GaWVsZChcblx0XHRxdWlja1BpY2s6IElRdWlja1BpY2s8SVF1aWNrUGlja0l0ZW0+LFxuXHRcdHNjaGVtYTogeyBkZWZhdWx0Pzogc3RyaW5nOyBlbnVtOiB7IGNvbnN0OiBzdHJpbmc7IHRpdGxlPzogc3RyaW5nIH1bXSB9LFxuXHRcdHJlcXVpcmVkOiBib29sZWFuLFxuXHRcdHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUsXG5cdFx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuXG5cdCkge1xuXHRcdGNvbnN0IGl0ZW1zOiBJUXVpY2tQaWNrSXRlbVtdID0gc2NoZW1hLmVudW0ubWFwKCh7IGNvbnN0OiB2YWx1ZSwgdGl0bGUgfSkgPT4gKHtcblx0XHRcdGlkOiB2YWx1ZSxcblx0XHRcdGxhYmVsOiB2YWx1ZSxcblx0XHRcdGRlc2NyaXB0aW9uOiB0aXRsZSxcblx0XHR9KSk7XG5cblx0XHRpZiAoIXJlcXVpcmVkKSB7XG5cdFx0XHRpdGVtcy5wdXNoKG5vbmVJdGVtKTtcblx0XHR9XG5cblx0XHRxdWlja1BpY2suY2FuU2VsZWN0TWFueSA9IGZhbHNlO1xuXHRcdHF1aWNrUGljay5pdGVtcyA9IGl0ZW1zO1xuXHRcdGlmIChzY2hlbWEuZGVmYXVsdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRxdWlja1BpY2suYWN0aXZlSXRlbXMgPSBpdGVtcy5maWx0ZXIoaXRlbSA9PiBpdGVtLmlkID09PSBzY2hlbWEuZGVmYXVsdCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHsgdHlwZTogJ3ZhbHVlJzsgdmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCB9IHwgeyB0eXBlOiAnYmFjaycgfSB8IHsgdHlwZTogJ2NhbmNlbCcgfT4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRzdG9yZS5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gcmVzb2x2ZSh7IHR5cGU6ICdjYW5jZWwnIH0pKSk7XG5cdFx0XHRzdG9yZS5hZGQocXVpY2tQaWNrLm9uRGlkQWNjZXB0KCgpID0+IHtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWQgPSBxdWlja1BpY2suc2VsZWN0ZWRJdGVtc1swXTtcblx0XHRcdFx0aWYgKHNlbGVjdGVkKSB7XG5cdFx0XHRcdFx0cmVzb2x2ZSh7IHR5cGU6ICd2YWx1ZScsIHZhbHVlOiBzZWxlY3RlZC5pZCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0c3RvcmUuYWRkKHF1aWNrUGljay5vbkRpZFRyaWdnZXJCdXR0b24oKCkgPT4gcmVzb2x2ZSh7IHR5cGU6ICdiYWNrJyB9KSkpO1xuXHRcdFx0c3RvcmUuYWRkKHF1aWNrUGljay5vbkRpZEhpZGUoKCkgPT4gcmVzb2x2ZSh7IHR5cGU6ICdjYW5jZWwnIH0pKSk7XG5cblx0XHRcdHF1aWNrUGljay5zaG93KCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVNdWx0aUVudW1GaWVsZChcblx0XHRxdWlja1BpY2s6IElRdWlja1BpY2s8SVF1aWNrUGlja0l0ZW0+LFxuXHRcdHNjaGVtYTogeyBkZWZhdWx0Pzogc3RyaW5nW107IGVudW06IHsgY29uc3Q6IHN0cmluZzsgdGl0bGU/OiBzdHJpbmcgfVtdIH0sXG5cdFx0cmVxdWlyZWQ6IGJvb2xlYW4sXG5cdFx0c3RvcmU6IERpc3Bvc2FibGVTdG9yZSxcblx0XHR0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW5cblx0KSB7XG5cdFx0Y29uc3QgaXRlbXM6IElRdWlja1BpY2tJdGVtW10gPSBzY2hlbWEuZW51bS5tYXAoKHsgY29uc3Q6IHZhbHVlLCB0aXRsZSB9KSA9PiAoe1xuXHRcdFx0aWQ6IHZhbHVlLFxuXHRcdFx0bGFiZWw6IHZhbHVlLFxuXHRcdFx0ZGVzY3JpcHRpb246IHRpdGxlLFxuXHRcdFx0cGlja2VkOiAhIXNjaGVtYS5kZWZhdWx0Py5pbmNsdWRlcyh2YWx1ZSksXG5cdFx0XHRwaWNrYWJsZTogdHJ1ZSxcblx0XHR9KSk7XG5cblx0XHRpZiAoIXJlcXVpcmVkKSB7XG5cdFx0XHRpdGVtcy5wdXNoKG5vbmVJdGVtKTtcblx0XHR9XG5cblx0XHRxdWlja1BpY2suY2FuU2VsZWN0TWFueSA9IHRydWU7XG5cdFx0cXVpY2tQaWNrLml0ZW1zID0gaXRlbXM7XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2U8eyB0eXBlOiAndmFsdWUnOyB2YWx1ZTogc3RyaW5nW10gfCB1bmRlZmluZWQgfSB8IHsgdHlwZTogJ2JhY2snIH0gfCB7IHR5cGU6ICdjYW5jZWwnIH0+KHJlc29sdmUgPT4ge1xuXHRcdFx0c3RvcmUuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHJlc29sdmUoeyB0eXBlOiAnY2FuY2VsJyB9KSkpO1xuXHRcdFx0c3RvcmUuYWRkKHF1aWNrUGljay5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNlbGVjdGVkID0gcXVpY2tQaWNrLnNlbGVjdGVkSXRlbXNbMF07XG5cdFx0XHRcdGlmIChzZWxlY3RlZC5pZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0cmVzb2x2ZSh7IHR5cGU6ICd2YWx1ZScsIHZhbHVlOiB1bmRlZmluZWQgfSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzb2x2ZSh7IHR5cGU6ICd2YWx1ZScsIHZhbHVlOiBxdWlja1BpY2suc2VsZWN0ZWRJdGVtcy5tYXAoaSA9PiBpLmlkKS5maWx0ZXIoaXNEZWZpbmVkKSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0c3RvcmUuYWRkKHF1aWNrUGljay5vbkRpZFRyaWdnZXJCdXR0b24oKCkgPT4gcmVzb2x2ZSh7IHR5cGU6ICdiYWNrJyB9KSkpO1xuXHRcdFx0c3RvcmUuYWRkKHF1aWNrUGljay5vbkRpZEhpZGUoKCkgPT4gcmVzb2x2ZSh7IHR5cGU6ICdjYW5jZWwnIH0pKSk7XG5cblx0XHRcdHF1aWNrUGljay5zaG93KCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVJbnB1dEZpZWxkKFxuXHRcdHF1aWNrUGljazogSVF1aWNrUGljazxJUXVpY2tQaWNrSXRlbT4sXG5cdFx0c2NoZW1hOiBNQ1AuTnVtYmVyU2NoZW1hIHwgTUNQLlN0cmluZ1NjaGVtYSxcblx0XHRyZXF1aXJlZDogYm9vbGVhbixcblx0XHRzdG9yZTogRGlzcG9zYWJsZVN0b3JlLFxuXHRcdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlblxuXHQpIHtcblx0XHRxdWlja1BpY2suY2FuU2VsZWN0TWFueSA9IGZhbHNlO1xuXG5cdFx0Y29uc3QgdXBkYXRlSXRlbXMgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtczogSVF1aWNrUGlja0l0ZW1bXSA9IFtdO1xuXHRcdFx0aWYgKHF1aWNrUGljay52YWx1ZSkge1xuXHRcdFx0XHRjb25zdCB2YWxpZGF0aW9uID0gdGhpcy5fdmFsaWRhdGVJbnB1dChxdWlja1BpY2sudmFsdWUsIHNjaGVtYSk7XG5cdFx0XHRcdHF1aWNrUGljay52YWxpZGF0aW9uTWVzc2FnZSA9IHZhbGlkYXRpb24ubWVzc2FnZTtcblx0XHRcdFx0aWYgKHZhbGlkYXRpb24uaXNWYWxpZCkge1xuXHRcdFx0XHRcdGl0ZW1zLnB1c2goeyBpZDogJyRjdXJyZW50JywgbGFiZWw6IGBcXHUyN0E0ICR7cXVpY2tQaWNrLnZhbHVlfWAgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHF1aWNrUGljay52YWxpZGF0aW9uTWVzc2FnZSA9ICcnO1xuXG5cdFx0XHRcdGlmIChzY2hlbWEuZGVmYXVsdCkge1xuXHRcdFx0XHRcdGl0ZW1zLnB1c2goeyBpZDogJyRkZWZhdWx0JywgbGFiZWw6IGAke3NjaGVtYS5kZWZhdWx0fWAsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWNwLmVsaWNpdC51c2VEZWZhdWx0JywgJ0RlZmF1bHQgdmFsdWUnKSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cblx0XHRcdGlmIChxdWlja1BpY2sudmFsaWRhdGlvbk1lc3NhZ2UpIHtcblx0XHRcdFx0cXVpY2tQaWNrLnNldmVyaXR5ID0gU2V2ZXJpdHkuV2FybmluZztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHF1aWNrUGljay5zZXZlcml0eSA9IFNldmVyaXR5Lklnbm9yZTtcblx0XHRcdFx0aWYgKCFyZXF1aXJlZCkge1xuXHRcdFx0XHRcdGl0ZW1zLnB1c2gobm9uZUl0ZW0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHF1aWNrUGljay5pdGVtcyA9IGl0ZW1zO1xuXHRcdH07XG5cblx0XHR1cGRhdGVJdGVtcygpO1xuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHsgdHlwZTogJ3ZhbHVlJzsgdmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCB9IHwgeyB0eXBlOiAnYmFjaycgfSB8IHsgdHlwZTogJ2NhbmNlbCcgfT4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmVzb2x2ZSh7IHR5cGU6ICdjYW5jZWwnIH0pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHN0b3JlLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiByZXNvbHZlKHsgdHlwZTogJ2NhbmNlbCcgfSkpKTtcblx0XHRcdHN0b3JlLmFkZChxdWlja1BpY2sub25EaWRDaGFuZ2VWYWx1ZSh1cGRhdGVJdGVtcykpO1xuXHRcdFx0c3RvcmUuYWRkKHF1aWNrUGljay5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGlkID0gcXVpY2tQaWNrLnNlbGVjdGVkSXRlbXNbMF0uaWQ7XG5cdFx0XHRcdGlmICghaWQpIHtcblx0XHRcdFx0XHRyZXNvbHZlKHsgdHlwZTogJ3ZhbHVlJywgdmFsdWU6IHVuZGVmaW5lZCB9KTtcblx0XHRcdFx0fSBlbHNlIGlmIChpZCA9PT0gJyRkZWZhdWx0Jykge1xuXHRcdFx0XHRcdHJlc29sdmUoeyB0eXBlOiAndmFsdWUnLCB2YWx1ZTogU3RyaW5nKHNjaGVtYS5kZWZhdWx0KSB9KTtcblx0XHRcdFx0fSBlbHNlIGlmICghcXVpY2tQaWNrLnZhbGlkYXRpb25NZXNzYWdlKSB7XG5cdFx0XHRcdFx0cmVzb2x2ZSh7IHR5cGU6ICd2YWx1ZScsIHZhbHVlOiBxdWlja1BpY2sudmFsdWUgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdHN0b3JlLmFkZChxdWlja1BpY2sub25EaWRUcmlnZ2VyQnV0dG9uKCgpID0+IHJlc29sdmUoeyB0eXBlOiAnYmFjaycgfSkpKTtcblx0XHRcdHN0b3JlLmFkZChxdWlja1BpY2sub25EaWRIaWRlKCgpID0+IHJlc29sdmUoeyB0eXBlOiAnY2FuY2VsJyB9KSkpO1xuXG5cdFx0XHRxdWlja1BpY2suc2hvdygpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfdmFsaWRhdGVJbnB1dCh2YWx1ZTogc3RyaW5nLCBzY2hlbWE6IE1DUC5OdW1iZXJTY2hlbWEgfCBNQ1AuU3RyaW5nU2NoZW1hKTogeyBpc1ZhbGlkOiBib29sZWFuOyBtZXNzYWdlPzogc3RyaW5nIH0ge1xuXHRcdHN3aXRjaCAoc2NoZW1hLnR5cGUpIHtcblx0XHRcdGNhc2UgJ3N0cmluZyc6XG5cdFx0XHRcdHJldHVybiB0aGlzLl92YWxpZGF0ZVN0cmluZyh2YWx1ZSwgc2NoZW1hKTtcblx0XHRcdGNhc2UgJ251bWJlcic6XG5cdFx0XHRjYXNlICdpbnRlZ2VyJzpcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3ZhbGlkYXRlTnVtYmVyKHZhbHVlLCBzY2hlbWEpO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0YXNzZXJ0TmV2ZXIoc2NoZW1hKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF92YWxpZGF0ZVN0cmluZyh2YWx1ZTogc3RyaW5nLCBzY2hlbWE6IE1DUC5TdHJpbmdTY2hlbWEpOiB7IGlzVmFsaWQ6IGJvb2xlYW47IHBhcnNlZFZhbHVlPzogc3RyaW5nOyBtZXNzYWdlPzogc3RyaW5nIH0ge1xuXHRcdGlmIChzY2hlbWEubWluTGVuZ3RoICYmIHZhbHVlLmxlbmd0aCA8IHNjaGVtYS5taW5MZW5ndGgpIHtcblx0XHRcdHJldHVybiB7IGlzVmFsaWQ6IGZhbHNlLCBtZXNzYWdlOiBsb2NhbGl6ZSgnbWNwLmVsaWNpdC52YWxpZGF0aW9uLm1pbkxlbmd0aCcsICdNaW5pbXVtIGxlbmd0aCBpcyB7MH0nLCBzY2hlbWEubWluTGVuZ3RoKSB9O1xuXHRcdH1cblx0XHRpZiAoc2NoZW1hLm1heExlbmd0aCAmJiB2YWx1ZS5sZW5ndGggPiBzY2hlbWEubWF4TGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4geyBpc1ZhbGlkOiBmYWxzZSwgbWVzc2FnZTogbG9jYWxpemUoJ21jcC5lbGljaXQudmFsaWRhdGlvbi5tYXhMZW5ndGgnLCAnTWF4aW11bSBsZW5ndGggaXMgezB9Jywgc2NoZW1hLm1heExlbmd0aCkgfTtcblx0XHR9XG5cdFx0aWYgKHNjaGVtYS5mb3JtYXQpIHtcblx0XHRcdGNvbnN0IGZvcm1hdFZhbGlkID0gdGhpcy5fdmFsaWRhdGVTdHJpbmdGb3JtYXQodmFsdWUsIHNjaGVtYS5mb3JtYXQpO1xuXHRcdFx0aWYgKCFmb3JtYXRWYWxpZC5pc1ZhbGlkKSB7XG5cdFx0XHRcdHJldHVybiBmb3JtYXRWYWxpZDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHsgaXNWYWxpZDogdHJ1ZSwgcGFyc2VkVmFsdWU6IHZhbHVlIH07XG5cdH1cblxuXHRwcml2YXRlIF92YWxpZGF0ZVN0cmluZ0Zvcm1hdCh2YWx1ZTogc3RyaW5nLCBmb3JtYXQ6IHN0cmluZyk6IHsgaXNWYWxpZDogYm9vbGVhbjsgbWVzc2FnZT86IHN0cmluZyB9IHtcblx0XHRzd2l0Y2ggKGZvcm1hdCkge1xuXHRcdFx0Y2FzZSAnZW1haWwnOlxuXHRcdFx0XHRyZXR1cm4gdmFsdWUuaW5jbHVkZXMoJ0AnKVxuXHRcdFx0XHRcdD8geyBpc1ZhbGlkOiB0cnVlIH1cblx0XHRcdFx0XHQ6IHsgaXNWYWxpZDogZmFsc2UsIG1lc3NhZ2U6IGxvY2FsaXplKCdtY3AuZWxpY2l0LnZhbGlkYXRpb24uZW1haWwnLCAnUGxlYXNlIGVudGVyIGEgdmFsaWQgZW1haWwgYWRkcmVzcycpIH07XG5cdFx0XHRjYXNlICd1cmknOlxuXHRcdFx0XHRpZiAoVVJMLmNhblBhcnNlKHZhbHVlKSkge1xuXHRcdFx0XHRcdHJldHVybiB7IGlzVmFsaWQ6IHRydWUgfTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4geyBpc1ZhbGlkOiBmYWxzZSwgbWVzc2FnZTogbG9jYWxpemUoJ21jcC5lbGljaXQudmFsaWRhdGlvbi51cmknLCAnUGxlYXNlIGVudGVyIGEgdmFsaWQgVVJJJykgfTtcblx0XHRcdFx0fVxuXHRcdFx0Y2FzZSAnZGF0ZSc6IHtcblx0XHRcdFx0Y29uc3QgZGF0ZVJlZ2V4ID0gL15cXGR7NH0tXFxkezJ9LVxcZHsyfSQvO1xuXHRcdFx0XHRpZiAoIWRhdGVSZWdleC50ZXN0KHZhbHVlKSkge1xuXHRcdFx0XHRcdHJldHVybiB7IGlzVmFsaWQ6IGZhbHNlLCBtZXNzYWdlOiBsb2NhbGl6ZSgnbWNwLmVsaWNpdC52YWxpZGF0aW9uLmRhdGUnLCAnUGxlYXNlIGVudGVyIGEgdmFsaWQgZGF0ZSAoWVlZWS1NTS1ERCknKSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGRhdGUgPSBuZXcgRGF0ZSh2YWx1ZSk7XG5cdFx0XHRcdHJldHVybiAhaXNOYU4oZGF0ZS5nZXRUaW1lKCkpXG5cdFx0XHRcdFx0PyB7IGlzVmFsaWQ6IHRydWUgfVxuXHRcdFx0XHRcdDogeyBpc1ZhbGlkOiBmYWxzZSwgbWVzc2FnZTogbG9jYWxpemUoJ21jcC5lbGljaXQudmFsaWRhdGlvbi5kYXRlJywgJ1BsZWFzZSBlbnRlciBhIHZhbGlkIGRhdGUgKFlZWVktTU0tREQpJykgfTtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2RhdGUtdGltZSc6IHtcblx0XHRcdFx0Y29uc3QgZGF0ZVRpbWUgPSBuZXcgRGF0ZSh2YWx1ZSk7XG5cdFx0XHRcdHJldHVybiAhaXNOYU4oZGF0ZVRpbWUuZ2V0VGltZSgpKVxuXHRcdFx0XHRcdD8geyBpc1ZhbGlkOiB0cnVlIH1cblx0XHRcdFx0XHQ6IHsgaXNWYWxpZDogZmFsc2UsIG1lc3NhZ2U6IGxvY2FsaXplKCdtY3AuZWxpY2l0LnZhbGlkYXRpb24uZGF0ZVRpbWUnLCAnUGxlYXNlIGVudGVyIGEgdmFsaWQgZGF0ZS10aW1lJykgfTtcblx0XHRcdH1cblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiB7IGlzVmFsaWQ6IHRydWUgfTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF92YWxpZGF0ZU51bWJlcih2YWx1ZTogc3RyaW5nLCBzY2hlbWE6IE1DUC5OdW1iZXJTY2hlbWEpOiB7IGlzVmFsaWQ6IGJvb2xlYW47IHBhcnNlZFZhbHVlPzogbnVtYmVyOyBtZXNzYWdlPzogc3RyaW5nIH0ge1xuXHRcdGNvbnN0IHBhcnNlZCA9IE51bWJlcih2YWx1ZSk7XG5cdFx0aWYgKGlzTmFOKHBhcnNlZCkpIHtcblx0XHRcdHJldHVybiB7IGlzVmFsaWQ6IGZhbHNlLCBtZXNzYWdlOiBsb2NhbGl6ZSgnbWNwLmVsaWNpdC52YWxpZGF0aW9uLm51bWJlcicsICdQbGVhc2UgZW50ZXIgYSB2YWxpZCBudW1iZXInKSB9O1xuXHRcdH1cblx0XHRpZiAoc2NoZW1hLnR5cGUgPT09ICdpbnRlZ2VyJyAmJiAhTnVtYmVyLmlzSW50ZWdlcihwYXJzZWQpKSB7XG5cdFx0XHRyZXR1cm4geyBpc1ZhbGlkOiBmYWxzZSwgbWVzc2FnZTogbG9jYWxpemUoJ21jcC5lbGljaXQudmFsaWRhdGlvbi5pbnRlZ2VyJywgJ1BsZWFzZSBlbnRlciBhIHZhbGlkIGludGVnZXInKSB9O1xuXHRcdH1cblx0XHRpZiAoc2NoZW1hLm1pbmltdW0gIT09IHVuZGVmaW5lZCAmJiBwYXJzZWQgPCBzY2hlbWEubWluaW11bSkge1xuXHRcdFx0cmV0dXJuIHsgaXNWYWxpZDogZmFsc2UsIG1lc3NhZ2U6IGxvY2FsaXplKCdtY3AuZWxpY2l0LnZhbGlkYXRpb24ubWluaW11bScsICdNaW5pbXVtIHZhbHVlIGlzIHswfScsIHNjaGVtYS5taW5pbXVtKSB9O1xuXHRcdH1cblx0XHRpZiAoc2NoZW1hLm1heGltdW0gIT09IHVuZGVmaW5lZCAmJiBwYXJzZWQgPiBzY2hlbWEubWF4aW11bSkge1xuXHRcdFx0cmV0dXJuIHsgaXNWYWxpZDogZmFsc2UsIG1lc3NhZ2U6IGxvY2FsaXplKCdtY3AuZWxpY2l0LnZhbGlkYXRpb24ubWF4aW11bScsICdNYXhpbXVtIHZhbHVlIGlzIHswfScsIHNjaGVtYS5tYXhpbXVtKSB9O1xuXHRcdH1cblx0XHRyZXR1cm4geyBpc1ZhbGlkOiB0cnVlLCBwYXJzZWRWYWx1ZTogcGFyc2VkIH07XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYW4gTUNQIGVsaWNpdGF0aW9uIHNjaGVtYSBpbnRvIElDaGF0UXVlc3Rpb25bXSBmb3IgdGhlIGNhcm91c2VsIFVJLlxuXHQgKiBSZXR1cm5zIHRoZSBxdWVzdGlvbnMgYW5kIGEgbWFwIGZyb20gcXVlc3Rpb24gSUQgdG8gc2NoZW1hIHByb3BlcnR5IG5hbWUuXG5cdCAqL1xuXHRwcml2YXRlIF9jb252ZXJ0U2NoZW1hVG9RdWVzdGlvbnMoZWxpY2l0YXRpb246IE1DUC5FbGljaXRSZXF1ZXN0Rm9ybVBhcmFtcyB8IFByZTIwMjUxMTI1RWxpY2l0YXRpb25QYXJhbXMpOiB7IHF1ZXN0aW9uczogSUNoYXRRdWVzdGlvbltdOyBpZFRvUHJvcGVydHlNYXA6IE1hcDxzdHJpbmcsIHN0cmluZz4gfSB7XG5cdFx0Y29uc3QgcHJvcGVydGllcyA9IE9iamVjdC5lbnRyaWVzKGVsaWNpdGF0aW9uLnJlcXVlc3RlZFNjaGVtYS5wcm9wZXJ0aWVzKTtcblx0XHRjb25zdCByZXF1aXJlZEZpZWxkcyA9IG5ldyBTZXQoZWxpY2l0YXRpb24ucmVxdWVzdGVkU2NoZW1hLnJlcXVpcmVkIHx8IFtdKTtcblx0XHRjb25zdCBxdWVzdGlvbnM6IElDaGF0UXVlc3Rpb25bXSA9IFtdO1xuXHRcdGNvbnN0IGlkVG9Qcm9wZXJ0eU1hcCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cblx0XHRmb3IgKGNvbnN0IFtwcm9wZXJ0eU5hbWUsIHNjaGVtYV0gb2YgcHJvcGVydGllcykge1xuXHRcdFx0Y29uc3QgaWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRcdGlkVG9Qcm9wZXJ0eU1hcC5zZXQoaWQsIHByb3BlcnR5TmFtZSk7XG5cblx0XHRcdGNvbnN0IHRpdGxlID0gc2NoZW1hLnRpdGxlIHx8IHByb3BlcnR5TmFtZTtcblx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gc2NoZW1hLmRlc2NyaXB0aW9uO1xuXHRcdFx0Y29uc3QgaXNSZXF1aXJlZCA9IHJlcXVpcmVkRmllbGRzLmhhcyhwcm9wZXJ0eU5hbWUpO1xuXG5cdFx0XHRpZiAoc2NoZW1hLnR5cGUgPT09ICdib29sZWFuJykge1xuXHRcdFx0XHRxdWVzdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0aWQsXG5cdFx0XHRcdFx0dHlwZTogJ3NpbmdsZVNlbGVjdCcsXG5cdFx0XHRcdFx0dGl0bGUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0cmVxdWlyZWQ6IGlzUmVxdWlyZWQsXG5cdFx0XHRcdFx0YWxsb3dGcmVlZm9ybUlucHV0OiBmYWxzZSxcblx0XHRcdFx0XHRvcHRpb25zOiBbXG5cdFx0XHRcdFx0XHR7IGlkOiAndHJ1ZScsIGxhYmVsOiBsb2NhbGl6ZSgnbWNwLmVsaWNpdC50cnVlJywgJ1RydWUnKSwgdmFsdWU6ICd0cnVlJyB9LFxuXHRcdFx0XHRcdFx0eyBpZDogJ2ZhbHNlJywgbGFiZWw6IGxvY2FsaXplKCdtY3AuZWxpY2l0LmZhbHNlJywgJ0ZhbHNlJyksIHZhbHVlOiAnZmFsc2UnIH0sXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRkZWZhdWx0VmFsdWU6IHNjaGVtYS5kZWZhdWx0ICE9PSB1bmRlZmluZWQgPyBTdHJpbmcoc2NoZW1hLmRlZmF1bHQpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSBpZiAoaXNMZWdhY3lUaXRsZWRFbnVtU2NoZW1hKHNjaGVtYSkpIHtcblx0XHRcdFx0cXVlc3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdHR5cGU6ICdzaW5nbGVTZWxlY3QnLFxuXHRcdFx0XHRcdHRpdGxlLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdHJlcXVpcmVkOiBpc1JlcXVpcmVkLFxuXHRcdFx0XHRcdGFsbG93RnJlZWZvcm1JbnB1dDogZmFsc2UsXG5cdFx0XHRcdFx0b3B0aW9uczogc2NoZW1hLmVudW0ubWFwKCh2LCBpKSA9PiAoe1xuXHRcdFx0XHRcdFx0aWQ6IHYsXG5cdFx0XHRcdFx0XHRsYWJlbDogc2NoZW1hLmVudW1OYW1lc1tpXSA/IGAke3Z9IC0gJHtzY2hlbWEuZW51bU5hbWVzW2ldfWAgOiB2LFxuXHRcdFx0XHRcdFx0dmFsdWU6IHYsXG5cdFx0XHRcdFx0fSkpLFxuXHRcdFx0XHRcdGRlZmF1bHRWYWx1ZTogc2NoZW1hLmRlZmF1bHQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIGlmIChpc1RpdGxlZFNpbmdsZUVudW1TY2hlbWEoc2NoZW1hKSkge1xuXHRcdFx0XHRxdWVzdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0aWQsXG5cdFx0XHRcdFx0dHlwZTogJ3NpbmdsZVNlbGVjdCcsXG5cdFx0XHRcdFx0dGl0bGUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0cmVxdWlyZWQ6IGlzUmVxdWlyZWQsXG5cdFx0XHRcdFx0YWxsb3dGcmVlZm9ybUlucHV0OiBmYWxzZSxcblx0XHRcdFx0XHRvcHRpb25zOiBzY2hlbWEub25lT2YubWFwKCh7IGNvbnN0OiB2YWx1ZSwgdGl0bGU6IG9wdFRpdGxlIH0pID0+ICh7XG5cdFx0XHRcdFx0XHRpZDogdmFsdWUsXG5cdFx0XHRcdFx0XHRsYWJlbDogb3B0VGl0bGUgPyBgJHt2YWx1ZX0gLSAke29wdFRpdGxlfWAgOiB2YWx1ZSxcblx0XHRcdFx0XHRcdHZhbHVlLFxuXHRcdFx0XHRcdH0pKSxcblx0XHRcdFx0XHRkZWZhdWx0VmFsdWU6IHNjaGVtYS5kZWZhdWx0LFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSBpZiAoaXNVbnRpdGxlZEVudW1TY2hlbWEoc2NoZW1hKSkge1xuXHRcdFx0XHRxdWVzdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0aWQsXG5cdFx0XHRcdFx0dHlwZTogJ3NpbmdsZVNlbGVjdCcsXG5cdFx0XHRcdFx0dGl0bGUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0cmVxdWlyZWQ6IGlzUmVxdWlyZWQsXG5cdFx0XHRcdFx0YWxsb3dGcmVlZm9ybUlucHV0OiBmYWxzZSxcblx0XHRcdFx0XHRvcHRpb25zOiBzY2hlbWEuZW51bS5tYXAodiA9PiAoeyBpZDogdiwgbGFiZWw6IHYsIHZhbHVlOiB2IH0pKSxcblx0XHRcdFx0XHRkZWZhdWx0VmFsdWU6IHNjaGVtYS5kZWZhdWx0LFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSBpZiAoaXNUaXRsZWRNdWx0aUVudW1TY2hlbWEoc2NoZW1hKSkge1xuXHRcdFx0XHRxdWVzdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0aWQsXG5cdFx0XHRcdFx0dHlwZTogJ211bHRpU2VsZWN0Jyxcblx0XHRcdFx0XHR0aXRsZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbixcblx0XHRcdFx0XHRyZXF1aXJlZDogaXNSZXF1aXJlZCxcblx0XHRcdFx0XHRhbGxvd0ZyZWVmb3JtSW5wdXQ6IGZhbHNlLFxuXHRcdFx0XHRcdG9wdGlvbnM6IHNjaGVtYS5pdGVtcy5hbnlPZi5tYXAoKHsgY29uc3Q6IHZhbHVlLCB0aXRsZTogb3B0VGl0bGUgfSkgPT4gKHtcblx0XHRcdFx0XHRcdGlkOiB2YWx1ZSxcblx0XHRcdFx0XHRcdGxhYmVsOiBvcHRUaXRsZSA/IGAke3ZhbHVlfSAtICR7b3B0VGl0bGV9YCA6IHZhbHVlLFxuXHRcdFx0XHRcdFx0dmFsdWUsXG5cdFx0XHRcdFx0fSkpLFxuXHRcdFx0XHRcdGRlZmF1bHRWYWx1ZTogc2NoZW1hLmRlZmF1bHQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIGlmIChpc1VudGl0bGVkTXVsdGlFbnVtU2NoZW1hKHNjaGVtYSkpIHtcblx0XHRcdFx0cXVlc3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdHR5cGU6ICdtdWx0aVNlbGVjdCcsXG5cdFx0XHRcdFx0dGl0bGUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0cmVxdWlyZWQ6IGlzUmVxdWlyZWQsXG5cdFx0XHRcdFx0YWxsb3dGcmVlZm9ybUlucHV0OiBmYWxzZSxcblx0XHRcdFx0XHRvcHRpb25zOiBzY2hlbWEuaXRlbXMuZW51bS5tYXAodiA9PiAoeyBpZDogdiwgbGFiZWw6IHYsIHZhbHVlOiB2IH0pKSxcblx0XHRcdFx0XHRkZWZhdWx0VmFsdWU6IHNjaGVtYS5kZWZhdWx0LFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIFN0cmluZywgbnVtYmVyLCBpbnRlZ2VyIFx1MjE5MiB0ZXh0IGlucHV0IHdpdGggdmFsaWRhdGlvblxuXHRcdFx0XHRjb25zdCB2YWxpZGF0aW9uOiBJQ2hhdFF1ZXN0aW9uVmFsaWRhdGlvbiA9IHt9O1xuXHRcdFx0XHRpZiAoc2NoZW1hLnR5cGUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0aWYgKHNjaGVtYS5taW5MZW5ndGggIT09IHVuZGVmaW5lZCkgeyB2YWxpZGF0aW9uLm1pbkxlbmd0aCA9IHNjaGVtYS5taW5MZW5ndGg7IH1cblx0XHRcdFx0XHRpZiAoc2NoZW1hLm1heExlbmd0aCAhPT0gdW5kZWZpbmVkKSB7IHZhbGlkYXRpb24ubWF4TGVuZ3RoID0gc2NoZW1hLm1heExlbmd0aDsgfVxuXHRcdFx0XHRcdGlmIChzY2hlbWEuZm9ybWF0KSB7IHZhbGlkYXRpb24uZm9ybWF0ID0gc2NoZW1hLmZvcm1hdDsgfVxuXHRcdFx0XHR9IGVsc2UgaWYgKHNjaGVtYS50eXBlID09PSAnbnVtYmVyJyB8fCBzY2hlbWEudHlwZSA9PT0gJ2ludGVnZXInKSB7XG5cdFx0XHRcdFx0aWYgKHNjaGVtYS5taW5pbXVtICE9PSB1bmRlZmluZWQpIHsgdmFsaWRhdGlvbi5taW5pbXVtID0gc2NoZW1hLm1pbmltdW07IH1cblx0XHRcdFx0XHRpZiAoc2NoZW1hLm1heGltdW0gIT09IHVuZGVmaW5lZCkgeyB2YWxpZGF0aW9uLm1heGltdW0gPSBzY2hlbWEubWF4aW11bTsgfVxuXHRcdFx0XHRcdGlmIChzY2hlbWEudHlwZSA9PT0gJ2ludGVnZXInKSB7IHZhbGlkYXRpb24uaXNJbnRlZ2VyID0gdHJ1ZTsgfVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0cXVlc3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdHR5cGU6ICd0ZXh0Jyxcblx0XHRcdFx0XHR0aXRsZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbixcblx0XHRcdFx0XHRyZXF1aXJlZDogaXNSZXF1aXJlZCxcblx0XHRcdFx0XHRkZWZhdWx0VmFsdWU6IHNjaGVtYS5kZWZhdWx0ICE9PSB1bmRlZmluZWQgPyBTdHJpbmcoc2NoZW1hLmRlZmF1bHQpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHZhbGlkYXRpb246IE9iamVjdC5rZXlzKHZhbGlkYXRpb24pLmxlbmd0aCA+IDAgPyB2YWxpZGF0aW9uIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4geyBxdWVzdGlvbnMsIGlkVG9Qcm9wZXJ0eU1hcCB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGNhcm91c2VsIGFuc3dlcnMgKGtleWVkIGJ5IHF1ZXN0aW9uIElEKSBiYWNrIGludG8gdGhlXG5cdCAqIE1DUCBFbGljaXRSZXN1bHQgY29udGVudCBmb3JtYXQgKGtleWVkIGJ5IHNjaGVtYSBwcm9wZXJ0eSBuYW1lcyksXG5cdCAqIGNvZXJjaW5nIHR5cGVzIGFzIG5lZWRlZC5cblx0ICovXG5cdHByaXZhdGUgX2NvbnZlcnRDYXJvdXNlbEFuc3dlcnNUb0VsaWNpdFJlc3VsdChcblx0XHRhbnN3ZXJzOiBJQ2hhdFF1ZXN0aW9uQW5zd2Vycyxcblx0XHRpZFRvUHJvcGVydHlNYXA6IE1hcDxzdHJpbmcsIHN0cmluZz4sXG5cdFx0c2NoZW1hUHJvcGVydGllczogUmVjb3JkPHN0cmluZywgTUNQLlByaW1pdGl2ZVNjaGVtYURlZmluaXRpb24+LFxuXHQpOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBudW1iZXIgfCBib29sZWFuIHwgc3RyaW5nW10+IHtcblx0XHRjb25zdCBjb250ZW50OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBudW1iZXIgfCBib29sZWFuIHwgc3RyaW5nW10+ID0ge307XG5cblx0XHRmb3IgKGNvbnN0IFtxdWVzdGlvbklkLCBhbnN3ZXJdIG9mIE9iamVjdC5lbnRyaWVzKGFuc3dlcnMpKSB7XG5cdFx0XHRjb25zdCBwcm9wZXJ0eU5hbWUgPSBpZFRvUHJvcGVydHlNYXAuZ2V0KHF1ZXN0aW9uSWQpO1xuXHRcdFx0aWYgKCFwcm9wZXJ0eU5hbWUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHNjaGVtYSA9IHNjaGVtYVByb3BlcnRpZXNbcHJvcGVydHlOYW1lXTtcblx0XHRcdGlmICghc2NoZW1hKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBFeHRyYWN0IHRoZSByYXcgdmFsdWUgZnJvbSBzdHJ1Y3R1cmVkIGFuc3dlcnNcblx0XHRcdGxldCByYXdWYWx1ZTogdW5rbm93biA9IGFuc3dlcjtcblx0XHRcdGlmICh0eXBlb2YgYW5zd2VyID09PSAnb2JqZWN0JyAmJiBhbnN3ZXIgIT09IG51bGwpIHtcblx0XHRcdFx0Y29uc3Qgb2JqID0gYW5zd2VyIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdFx0XHRpZiAoJ3NlbGVjdGVkVmFsdWUnIGluIG9iaikge1xuXHRcdFx0XHRcdHJhd1ZhbHVlID0gb2JqLnNlbGVjdGVkVmFsdWU7XG5cdFx0XHRcdH0gZWxzZSBpZiAoJ3NlbGVjdGVkVmFsdWVzJyBpbiBvYmopIHtcblx0XHRcdFx0XHRyYXdWYWx1ZSA9IG9iai5zZWxlY3RlZFZhbHVlcztcblx0XHRcdFx0fSBlbHNlIGlmICgnZnJlZWZvcm1WYWx1ZScgaW4gb2JqICYmIG9iai5mcmVlZm9ybVZhbHVlKSB7XG5cdFx0XHRcdFx0cmF3VmFsdWUgPSBvYmouZnJlZWZvcm1WYWx1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAocmF3VmFsdWUgPT09IHVuZGVmaW5lZCB8fCByYXdWYWx1ZSA9PT0gbnVsbCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVHlwZSBjb2VyY2lvbiBiYXNlZCBvbiBzY2hlbWFcblx0XHRcdGlmIChzY2hlbWEudHlwZSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRcdGNvbnRlbnRbcHJvcGVydHlOYW1lXSA9IHJhd1ZhbHVlID09PSAndHJ1ZScgfHwgcmF3VmFsdWUgPT09IHRydWU7XG5cdFx0XHR9IGVsc2UgaWYgKHNjaGVtYS50eXBlID09PSAnbnVtYmVyJyB8fCBzY2hlbWEudHlwZSA9PT0gJ2ludGVnZXInKSB7XG5cdFx0XHRcdGNvbnN0IG51bSA9IE51bWJlcihyYXdWYWx1ZSk7XG5cdFx0XHRcdGlmICghaXNOYU4obnVtKSkge1xuXHRcdFx0XHRcdGNvbnRlbnRbcHJvcGVydHlOYW1lXSA9IG51bTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChzY2hlbWEudHlwZSA9PT0gJ2FycmF5Jykge1xuXHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheShyYXdWYWx1ZSkpIHtcblx0XHRcdFx0XHRjb250ZW50W3Byb3BlcnR5TmFtZV0gPSByYXdWYWx1ZS5tYXAodiA9PiBTdHJpbmcodikpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb250ZW50W3Byb3BlcnR5TmFtZV0gPSBTdHJpbmcocmF3VmFsdWUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBjb250ZW50O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsY0FBYztBQUN2QixTQUFTLGFBQWEsdUJBQXVCO0FBRTdDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxzQkFBc0IsZ0JBQWdCO0FBQy9DLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMEJBQXNEO0FBQy9ELFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsa0JBQWdGLG9CQUFvQjtBQUM3RyxTQUFTLGlCQUFxSSxvQkFBb0Isd0JBQXdCO0FBQzFMLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsV0FBVztBQUVwQixNQUFNLFdBQTJCLEVBQUUsSUFBSSxRQUFXLE9BQU8sU0FBUyx3QkFBd0IsTUFBTSxHQUFHLGFBQWEsU0FBUyxvQ0FBb0MsY0FBYyxHQUFHLFlBQVksS0FBSztBQUkvTCxTQUFTLGtCQUFrQixRQUE0STtBQUN0SyxTQUFPLE9BQU8sU0FBUyxVQUFXLE9BQU8sU0FBUyxVQUFhLENBQUMsQ0FBRSxPQUF3QztBQUMzRztBQUVBLFNBQVMsaUJBQWlCLFFBQTJFO0FBQ3BHLFNBQU8sT0FBTyxTQUFTO0FBQ3hCO0FBRUEsU0FBUyx5QkFBeUIsUUFBdUc7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
