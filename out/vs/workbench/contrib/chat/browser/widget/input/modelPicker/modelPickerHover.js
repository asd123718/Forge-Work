import "./media/modelPicker.css";
import * as dom from "../../../../../../../base/browser/dom.js";
import { renderMarkdown } from "../../../../../../../base/browser/markdownRenderer.js";
import { Button } from "../../../../../../../base/browser/ui/button/button.js";
import { renderIcon } from "../../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { DisposableStore } from "../../../../../../../base/common/lifecycle.js";
import { formatTokenCount } from "../../../../../../../base/common/numbers.js";
import { localize } from "../../../../../../../nls.js";
import { defaultButtonStyles } from "../../../../../../../platform/theme/browser/defaultStyles.js";
import { ILanguageModelChatMetadata } from "../../../../common/languageModels.js";
import { getPriceCategoryLabel, isAutoModel, isMultiplierPricing } from "./modelPickerPresentation.js";
const SUPPORTED_CONFIG_GROUPS = ["navigation", "tokens"];
function getModelHoverContent(model, isUBB, onConfigure, openerService) {
  const isAuto = isAutoModel(model);
  const promo = !isAuto && ILanguageModelChatMetadata.hasPromoDiscount(model.metadata) ? model.metadata.promo : void 0;
  const container = dom.$(".chat-model-hover");
  const disposables = new DisposableStore();
  const titleRow = dom.$(".chat-model-hover-title-row");
  titleRow.appendChild(dom.$(".chat-model-hover-name", void 0, model.metadata.name));
  const tags = dom.$(".chat-model-hover-title-tags");
  const categoryLabel = !isAuto && !promo ? getCategoryLabel(model.metadata.category) : void 0;
  if (categoryLabel) {
    tags.appendChild(dom.$("span.chat-model-hover-category", void 0, categoryLabel));
  }
  const priceCategoryLabel = !isAuto ? getPriceCategoryLabel(model.metadata.priceCategory) : void 0;
  const badgeLabel = isAuto ? model.metadata.detail : priceCategoryLabel;
  if (badgeLabel) {
    const badge = dom.$("span.chat-model-hover-price-badge", void 0, badgeLabel);
    if (!isAuto && isHighCostCategory(model.metadata.priceCategory)) {
      badge.classList.add("high-cost");
    }
    tags.appendChild(badge);
  }
  if (promo) {
    const discountLabel = localize("chat.promo.discountBadge", "{0}% discount", promo.discountPercent);
    tags.appendChild(dom.$("span.chat-model-hover-price-badge", void 0, discountLabel));
  }
  if (tags.childElementCount > 0) {
    titleRow.appendChild(tags);
  }
  container.appendChild(titleRow);
  if (!isAuto && model.metadata.warningText) {
    for (const message of Object.values(model.metadata.warningText)) {
      const warningContainer = dom.$(".chat-model-hover-warning-text");
      warningContainer.appendChild(renderIcon(Codicon.warning));
      const warningMd = new MarkdownString(message, { isTrusted: false, supportThemeIcons: true });
      const rendered = disposables.add(renderMarkdown(warningMd, {
        actionHandler: (link) => {
          void openerService.open(link, { allowCommands: false, fromUserGesture: true });
        }
      }));
      warningContainer.appendChild(rendered.element);
      container.appendChild(warningContainer);
    }
  }
  if (promo) {
    const promoContainer = dom.$(".chat-model-hover-promo-text");
    promoContainer.appendChild(renderIcon(Codicon.info));
    const endsAtLabel = ILanguageModelChatMetadata.getPromoEndsAtLabel(promo.endsAt);
    const promoMessage = endsAtLabel ? promo.message + " " + endsAtLabel : promo.message;
    const promoMd = new MarkdownString(promoMessage, { isTrusted: false, supportThemeIcons: true });
    const rendered = disposables.add(renderMarkdown(promoMd, {
      actionHandler: (link) => {
        void openerService.open(link, { allowCommands: false, fromUserGesture: true });
      }
    }));
    promoContainer.appendChild(rendered.element);
    container.appendChild(promoContainer);
  }
  let costInfoRendered = false;
  let costTableRendered = false;
  if (!isAuto && isUBB) {
    const metrics = [
      { label: localize("models.inputCostLabel", "Input"), def: model.metadata.inputCost, long: model.metadata.longContextInputCost },
      { label: localize("models.outputCostLabel", "Output"), def: model.metadata.outputCost, long: model.metadata.longContextOutputCost },
      { label: localize("models.cacheCostLabel", "Cache Read"), def: model.metadata.cacheCost, long: model.metadata.longContextCacheCost },
      { label: localize("models.cacheWriteCostLabel", "Cache Write"), def: model.metadata.cacheWriteCost, long: model.metadata.longContextCacheWriteCost }
    ].filter((metric) => metric.def !== void 0 || metric.long !== void 0);
    if (metrics.length > 0) {
      const hasLongContext = metrics.some((metric) => metric.long !== void 0);
      const table = dom.$(".chat-model-hover-cost-table");
      if (hasLongContext) {
        container.classList.add("has-long-context");
        table.classList.add("has-long-context");
      }
      const appendValueCell = (row, cost) => {
        if (cost === void 0) {
          row.appendChild(dom.$("span.chat-model-hover-cost-value.empty"));
          return;
        }
        row.appendChild(dom.$(
          "span.chat-model-hover-cost-value",
          void 0,
          dom.$(
            "span.chat-model-hover-cost-number",
            void 0,
            typeof cost === "number" ? String(cost) : localize("models.cost.unknown", "Unknown")
          )
        ));
      };
      const headerRow = dom.$(".chat-model-hover-cost-row.header");
      headerRow.appendChild(dom.$("span.chat-model-hover-cost-heading", void 0, localize("models.creditsPerMillionTokens", "Credits Per 1M Tokens")));
      if (hasLongContext) {
        headerRow.appendChild(dom.$("span.chat-model-hover-cost-value.subheader", void 0, localize("models.defaultContext", "Default")));
        headerRow.appendChild(dom.$("span.chat-model-hover-cost-value.subheader", void 0, localize("models.longContext", "Long Context")));
      } else {
        headerRow.appendChild(dom.$("span.chat-model-hover-cost-value.subheader"));
      }
      table.appendChild(headerRow);
      for (const metric of metrics) {
        const row = dom.$(".chat-model-hover-cost-row");
        const labelCell = dom.$(".chat-model-hover-cost-label");
        labelCell.appendChild(dom.$("span.chat-model-hover-cost-label-text", void 0, metric.label));
        row.appendChild(labelCell);
        appendValueCell(row, metric.def);
        if (hasLongContext) {
          appendValueCell(row, metric.long);
        }
        table.appendChild(row);
      }
      container.appendChild(table);
      costTableRendered = true;
      costInfoRendered = true;
    } else if (model.metadata.pricing && (isMultiplierPricing(model) || !priceCategoryLabel)) {
      appendCostSection(container, model.metadata.pricing);
      costInfoRendered = true;
    }
  } else if (!isAuto && model.metadata.pricing) {
    appendCostSection(container, model.metadata.pricing);
    costInfoRendered = true;
  }
  if (!costInfoRendered && model.metadata.tooltip) {
    const descriptionMd = new MarkdownString(model.metadata.tooltip, { supportThemeIcons: true });
    const rendered = disposables.add(renderMarkdown(descriptionMd, {
      actionHandler: (link) => {
        void openerService.open(link, { allowCommands: false, fromUserGesture: true });
      }
    }));
    rendered.element.classList.add("chat-model-hover-description");
    container.appendChild(rendered.element);
  }
  if (!isAuto && !costTableRendered && (model.metadata.maxInputTokens || model.metadata.maxOutputTokens)) {
    const totalTokens = (model.metadata.maxInputTokens ?? 0) + (model.metadata.maxOutputTokens ?? 0);
    const contextSection = dom.$(".chat-model-hover-context");
    contextSection.appendChild(dom.$(".chat-model-hover-context-label", void 0, localize("models.contextSize", "Max context")));
    contextSection.appendChild(dom.$(".chat-model-hover-context-value", void 0, formatTokenCount(totalTokens)));
    container.appendChild(contextSection);
  }
  if (model.metadata.configurationSchema?.properties) {
    const configButtons = [];
    const seenGroups = /* @__PURE__ */ new Set();
    for (const propSchema of Object.values(model.metadata.configurationSchema.properties)) {
      if (propSchema.enum && propSchema.enum.length >= 2 && propSchema.group && SUPPORTED_CONFIG_GROUPS.includes(propSchema.group) && !seenGroups.has(propSchema.group)) {
        const label = propSchema.title ?? propSchema.description;
        if (label) {
          seenGroups.add(propSchema.group);
          configButtons.push({ group: propSchema.group, label });
        }
      }
    }
    if (configButtons.length > 0) {
      const configRow = dom.$(".chat-model-hover-configurable");
      configRow.appendChild(dom.$("span.chat-model-hover-configurable-label", void 0, localize("models.configurable", "Configurable")));
      const buttonsContainer = dom.$(".chat-model-hover-configurable-buttons");
      for (const { group, label } of configButtons) {
        const button = disposables.add(new Button(buttonsContainer, {
          ...defaultButtonStyles,
          secondary: true,
          title: label
        }));
        button.label = label;
        disposables.add(button.onDidClick(() => onConfigure?.(group)));
      }
      configRow.appendChild(buttonsContainer);
      container.appendChild(configRow);
    }
  }
  return container.children.length > 0 ? { element: container, disposable: disposables } : void 0;
}
function appendCostSection(container, pricing) {
  const costSection = dom.$(".chat-model-hover-cost");
  costSection.appendChild(dom.$("span", void 0, localize("models.cost", "Cost: {0}", pricing)));
  container.appendChild(costSection);
}
function isHighCostCategory(priceCategory) {
  return priceCategory === "high" || priceCategory === "very_high";
}
function getCategoryLabel(category) {
  switch (category) {
    case void 0:
    case "":
      return void 0;
    case "lightweight":
      return localize("chat.category.lightweight", "Lightweight");
    case "versatile":
      return localize("chat.category.versatile", "Versatile");
    case "powerful":
      return localize("chat.category.powerful", "Powerful");
    default:
      return typeof category === "string" ? category.charAt(0).toUpperCase() + category.slice(1) : void 0;
  }
}
export {
  getModelHoverContent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcaW5wdXRcXG1vZGVsUGlja2VyXFxtb2RlbFBpY2tlckhvdmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL21vZGVsUGlja2VyLmNzcyc7XG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IHJlbmRlck1hcmtkb3duIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgcmVuZGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZm9ybWF0VG9rZW5Db3VudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL251bWJlcnMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0QnV0dG9uU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLCBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgZ2V0UHJpY2VDYXRlZ29yeUxhYmVsLCBpc0F1dG9Nb2RlbCwgaXNNdWx0aXBsaWVyUHJpY2luZyB9IGZyb20gJy4vbW9kZWxQaWNrZXJQcmVzZW50YXRpb24uanMnO1xuXG5jb25zdCBTVVBQT1JURURfQ09ORklHX0dST1VQUzogcmVhZG9ubHkgc3RyaW5nW10gPSBbJ25hdmlnYXRpb24nLCAndG9rZW5zJ107XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1vZGVsUGlja2VySG92ZXJDb250ZW50IHtcblx0cmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGRpc3Bvc2FibGU6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldE1vZGVsSG92ZXJDb250ZW50KFxuXHRtb2RlbDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyLFxuXHRpc1VCQjogYm9vbGVhbiB8IHVuZGVmaW5lZCxcblx0b25Db25maWd1cmU6ICgoZ3JvdXA6IHN0cmluZykgPT4gdm9pZCkgfCB1bmRlZmluZWQsXG5cdG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuKTogSU1vZGVsUGlja2VySG92ZXJDb250ZW50IHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgaXNBdXRvID0gaXNBdXRvTW9kZWwobW9kZWwpO1xuXHRjb25zdCBwcm9tbyA9ICFpc0F1dG8gJiYgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEuaGFzUHJvbW9EaXNjb3VudChtb2RlbC5tZXRhZGF0YSkgPyBtb2RlbC5tZXRhZGF0YS5wcm9tbyA6IHVuZGVmaW5lZDtcblx0Y29uc3QgY29udGFpbmVyID0gZG9tLiQoJy5jaGF0LW1vZGVsLWhvdmVyJyk7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdGNvbnN0IHRpdGxlUm93ID0gZG9tLiQoJy5jaGF0LW1vZGVsLWhvdmVyLXRpdGxlLXJvdycpO1xuXHR0aXRsZVJvdy5hcHBlbmRDaGlsZChkb20uJCgnLmNoYXQtbW9kZWwtaG92ZXItbmFtZScsIHVuZGVmaW5lZCwgbW9kZWwubWV0YWRhdGEubmFtZSkpO1xuXHRjb25zdCB0YWdzID0gZG9tLiQoJy5jaGF0LW1vZGVsLWhvdmVyLXRpdGxlLXRhZ3MnKTtcblx0Y29uc3QgY2F0ZWdvcnlMYWJlbCA9ICFpc0F1dG8gJiYgIXByb21vID8gZ2V0Q2F0ZWdvcnlMYWJlbChtb2RlbC5tZXRhZGF0YS5jYXRlZ29yeSkgOiB1bmRlZmluZWQ7XG5cdGlmIChjYXRlZ29yeUxhYmVsKSB7XG5cdFx0dGFncy5hcHBlbmRDaGlsZChkb20uJCgnc3Bhbi5jaGF0LW1vZGVsLWhvdmVyLWNhdGVnb3J5JywgdW5kZWZpbmVkLCBjYXRlZ29yeUxhYmVsKSk7XG5cdH1cblx0Y29uc3QgcHJpY2VDYXRlZ29yeUxhYmVsID0gIWlzQXV0byA/IGdldFByaWNlQ2F0ZWdvcnlMYWJlbChtb2RlbC5tZXRhZGF0YS5wcmljZUNhdGVnb3J5KSA6IHVuZGVmaW5lZDtcblx0Y29uc3QgYmFkZ2VMYWJlbCA9IGlzQXV0byA/IG1vZGVsLm1ldGFkYXRhLmRldGFpbCA6IHByaWNlQ2F0ZWdvcnlMYWJlbDtcblx0aWYgKGJhZGdlTGFiZWwpIHtcblx0XHRjb25zdCBiYWRnZSA9IGRvbS4kKCdzcGFuLmNoYXQtbW9kZWwtaG92ZXItcHJpY2UtYmFkZ2UnLCB1bmRlZmluZWQsIGJhZGdlTGFiZWwpO1xuXHRcdGlmICghaXNBdXRvICYmIGlzSGlnaENvc3RDYXRlZ29yeShtb2RlbC5tZXRhZGF0YS5wcmljZUNhdGVnb3J5KSkge1xuXHRcdFx0YmFkZ2UuY2xhc3NMaXN0LmFkZCgnaGlnaC1jb3N0Jyk7XG5cdFx0fVxuXHRcdHRhZ3MuYXBwZW5kQ2hpbGQoYmFkZ2UpO1xuXHR9XG5cdGlmIChwcm9tbykge1xuXHRcdGNvbnN0IGRpc2NvdW50TGFiZWwgPSBsb2NhbGl6ZSgnY2hhdC5wcm9tby5kaXNjb3VudEJhZGdlJywgXCJ7MH0lIGRpc2NvdW50XCIsIHByb21vLmRpc2NvdW50UGVyY2VudCk7XG5cdFx0dGFncy5hcHBlbmRDaGlsZChkb20uJCgnc3Bhbi5jaGF0LW1vZGVsLWhvdmVyLXByaWNlLWJhZGdlJywgdW5kZWZpbmVkLCBkaXNjb3VudExhYmVsKSk7XG5cdH1cblx0aWYgKHRhZ3MuY2hpbGRFbGVtZW50Q291bnQgPiAwKSB7XG5cdFx0dGl0bGVSb3cuYXBwZW5kQ2hpbGQodGFncyk7XG5cdH1cblx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHRpdGxlUm93KTtcblxuXHRpZiAoIWlzQXV0byAmJiBtb2RlbC5tZXRhZGF0YS53YXJuaW5nVGV4dCkge1xuXHRcdGZvciAoY29uc3QgbWVzc2FnZSBvZiBPYmplY3QudmFsdWVzKG1vZGVsLm1ldGFkYXRhLndhcm5pbmdUZXh0KSkge1xuXHRcdFx0Y29uc3Qgd2FybmluZ0NvbnRhaW5lciA9IGRvbS4kKCcuY2hhdC1tb2RlbC1ob3Zlci13YXJuaW5nLXRleHQnKTtcblx0XHRcdHdhcm5pbmdDb250YWluZXIuYXBwZW5kQ2hpbGQocmVuZGVySWNvbihDb2RpY29uLndhcm5pbmcpKTtcblx0XHRcdGNvbnN0IHdhcm5pbmdNZCA9IG5ldyBNYXJrZG93blN0cmluZyhtZXNzYWdlLCB7IGlzVHJ1c3RlZDogZmFsc2UsIHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pO1xuXHRcdFx0Y29uc3QgcmVuZGVyZWQgPSBkaXNwb3NhYmxlcy5hZGQocmVuZGVyTWFya2Rvd24od2FybmluZ01kLCB7XG5cdFx0XHRcdGFjdGlvbkhhbmRsZXI6IGxpbmsgPT4geyB2b2lkIG9wZW5lclNlcnZpY2Uub3BlbihsaW5rLCB7IGFsbG93Q29tbWFuZHM6IGZhbHNlLCBmcm9tVXNlckdlc3R1cmU6IHRydWUgfSk7IH0sXG5cdFx0XHR9KSk7XG5cdFx0XHR3YXJuaW5nQ29udGFpbmVyLmFwcGVuZENoaWxkKHJlbmRlcmVkLmVsZW1lbnQpO1xuXHRcdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHdhcm5pbmdDb250YWluZXIpO1xuXHRcdH1cblx0fVxuXG5cdGlmIChwcm9tbykge1xuXHRcdGNvbnN0IHByb21vQ29udGFpbmVyID0gZG9tLiQoJy5jaGF0LW1vZGVsLWhvdmVyLXByb21vLXRleHQnKTtcblx0XHRwcm9tb0NvbnRhaW5lci5hcHBlbmRDaGlsZChyZW5kZXJJY29uKENvZGljb24uaW5mbykpO1xuXHRcdGNvbnN0IGVuZHNBdExhYmVsID0gSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEuZ2V0UHJvbW9FbmRzQXRMYWJlbChwcm9tby5lbmRzQXQpO1xuXHRcdGNvbnN0IHByb21vTWVzc2FnZSA9IGVuZHNBdExhYmVsID8gcHJvbW8ubWVzc2FnZSArICcgJyArIGVuZHNBdExhYmVsIDogcHJvbW8ubWVzc2FnZTtcblx0XHRjb25zdCBwcm9tb01kID0gbmV3IE1hcmtkb3duU3RyaW5nKHByb21vTWVzc2FnZSwgeyBpc1RydXN0ZWQ6IGZhbHNlLCBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSB9KTtcblx0XHRjb25zdCByZW5kZXJlZCA9IGRpc3Bvc2FibGVzLmFkZChyZW5kZXJNYXJrZG93bihwcm9tb01kLCB7XG5cdFx0XHRhY3Rpb25IYW5kbGVyOiBsaW5rID0+IHsgdm9pZCBvcGVuZXJTZXJ2aWNlLm9wZW4obGluaywgeyBhbGxvd0NvbW1hbmRzOiBmYWxzZSwgZnJvbVVzZXJHZXN0dXJlOiB0cnVlIH0pOyB9LFxuXHRcdH0pKTtcblx0XHRwcm9tb0NvbnRhaW5lci5hcHBlbmRDaGlsZChyZW5kZXJlZC5lbGVtZW50KTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQocHJvbW9Db250YWluZXIpO1xuXHR9XG5cblx0bGV0IGNvc3RJbmZvUmVuZGVyZWQgPSBmYWxzZTtcblx0bGV0IGNvc3RUYWJsZVJlbmRlcmVkID0gZmFsc2U7XG5cdGlmICghaXNBdXRvICYmIGlzVUJCKSB7XG5cdFx0Y29uc3QgbWV0cmljczogeyBsYWJlbDogc3RyaW5nOyBkZWY6IG51bWJlciB8IG51bGwgfCB1bmRlZmluZWQ7IGxvbmc6IG51bWJlciB8IG51bGwgfCB1bmRlZmluZWQgfVtdID0gW1xuXHRcdFx0eyBsYWJlbDogbG9jYWxpemUoJ21vZGVscy5pbnB1dENvc3RMYWJlbCcsIFwiSW5wdXRcIiksIGRlZjogbW9kZWwubWV0YWRhdGEuaW5wdXRDb3N0LCBsb25nOiBtb2RlbC5tZXRhZGF0YS5sb25nQ29udGV4dElucHV0Q29zdCB9LFxuXHRcdFx0eyBsYWJlbDogbG9jYWxpemUoJ21vZGVscy5vdXRwdXRDb3N0TGFiZWwnLCBcIk91dHB1dFwiKSwgZGVmOiBtb2RlbC5tZXRhZGF0YS5vdXRwdXRDb3N0LCBsb25nOiBtb2RlbC5tZXRhZGF0YS5sb25nQ29udGV4dE91dHB1dENvc3QgfSxcblx0XHRcdHsgbGFiZWw6IGxvY2FsaXplKCdtb2RlbHMuY2FjaGVDb3N0TGFiZWwnLCBcIkNhY2hlIFJlYWRcIiksIGRlZjogbW9kZWwubWV0YWRhdGEuY2FjaGVDb3N0LCBsb25nOiBtb2RlbC5tZXRhZGF0YS5sb25nQ29udGV4dENhY2hlQ29zdCB9LFxuXHRcdFx0eyBsYWJlbDogbG9jYWxpemUoJ21vZGVscy5jYWNoZVdyaXRlQ29zdExhYmVsJywgXCJDYWNoZSBXcml0ZVwiKSwgZGVmOiBtb2RlbC5tZXRhZGF0YS5jYWNoZVdyaXRlQ29zdCwgbG9uZzogbW9kZWwubWV0YWRhdGEubG9uZ0NvbnRleHRDYWNoZVdyaXRlQ29zdCB9LFxuXHRcdF0uZmlsdGVyKG1ldHJpYyA9PiBtZXRyaWMuZGVmICE9PSB1bmRlZmluZWQgfHwgbWV0cmljLmxvbmcgIT09IHVuZGVmaW5lZCk7XG5cblx0XHRpZiAobWV0cmljcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBoYXNMb25nQ29udGV4dCA9IG1ldHJpY3Muc29tZShtZXRyaWMgPT4gbWV0cmljLmxvbmcgIT09IHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCB0YWJsZSA9IGRvbS4kKCcuY2hhdC1tb2RlbC1ob3Zlci1jb3N0LXRhYmxlJyk7XG5cdFx0XHRpZiAoaGFzTG9uZ0NvbnRleHQpIHtcblx0XHRcdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2hhcy1sb25nLWNvbnRleHQnKTtcblx0XHRcdFx0dGFibGUuY2xhc3NMaXN0LmFkZCgnaGFzLWxvbmctY29udGV4dCcpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhcHBlbmRWYWx1ZUNlbGwgPSAocm93OiBIVE1MRWxlbWVudCwgY29zdDogbnVtYmVyIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHZvaWQgPT4ge1xuXHRcdFx0XHRpZiAoY29zdCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0cm93LmFwcGVuZENoaWxkKGRvbS4kKCdzcGFuLmNoYXQtbW9kZWwtaG92ZXItY29zdC12YWx1ZS5lbXB0eScpKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0cm93LmFwcGVuZENoaWxkKGRvbS4kKCdzcGFuLmNoYXQtbW9kZWwtaG92ZXItY29zdC12YWx1ZScsIHVuZGVmaW5lZCxcblx0XHRcdFx0XHRkb20uJCgnc3Bhbi5jaGF0LW1vZGVsLWhvdmVyLWNvc3QtbnVtYmVyJywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0dHlwZW9mIGNvc3QgPT09ICdudW1iZXInID8gU3RyaW5nKGNvc3QpIDogbG9jYWxpemUoJ21vZGVscy5jb3N0LnVua25vd24nLCBcIlVua25vd25cIikpLFxuXHRcdFx0XHQpKTtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGhlYWRlclJvdyA9IGRvbS4kKCcuY2hhdC1tb2RlbC1ob3Zlci1jb3N0LXJvdy5oZWFkZXInKTtcblx0XHRcdGhlYWRlclJvdy5hcHBlbmRDaGlsZChkb20uJCgnc3Bhbi5jaGF0LW1vZGVsLWhvdmVyLWNvc3QtaGVhZGluZycsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ21vZGVscy5jcmVkaXRzUGVyTWlsbGlvblRva2VucycsIFwiQ3JlZGl0cyBQZXIgMU0gVG9rZW5zXCIpKSk7XG5cdFx0XHRpZiAoaGFzTG9uZ0NvbnRleHQpIHtcblx0XHRcdFx0aGVhZGVyUm93LmFwcGVuZENoaWxkKGRvbS4kKCdzcGFuLmNoYXQtbW9kZWwtaG92ZXItY29zdC12YWx1ZS5zdWJoZWFkZXInLCB1bmRlZmluZWQsIGxvY2FsaXplKCdtb2RlbHMuZGVmYXVsdENvbnRleHQnLCBcIkRlZmF1bHRcIikpKTtcblx0XHRcdFx0aGVhZGVyUm93LmFwcGVuZENoaWxkKGRvbS4kKCdzcGFuLmNoYXQtbW9kZWwtaG92ZXItY29zdC12YWx1ZS5zdWJoZWFkZXInLCB1bmRlZmluZWQsIGxvY2FsaXplKCdtb2RlbHMubG9uZ0NvbnRleHQnLCBcIkxvbmcgQ29udGV4dFwiKSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aGVhZGVyUm93LmFwcGVuZENoaWxkKGRvbS4kKCdzcGFuLmNoYXQtbW9kZWwtaG92ZXItY29zdC12YWx1ZS5zdWJoZWFkZXInKSk7XG5cdFx0XHR9XG5cdFx0XHR0YWJsZS5hcHBlbmRDaGlsZChoZWFkZXJSb3cpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IG1ldHJpYyBvZiBtZXRyaWNzKSB7XG5cdFx0XHRcdGNvbnN0IHJvdyA9IGRvbS4kKCcuY2hhdC1tb2RlbC1ob3Zlci1jb3N0LXJvdycpO1xuXHRcdFx0XHRjb25zdCBsYWJlbENlbGwgPSBkb20uJCgnLmNoYXQtbW9kZWwtaG92ZXItY29zdC1sYWJlbCcpO1xuXHRcdFx0XHRsYWJlbENlbGwuYXBwZW5kQ2hpbGQoZG9tLiQoJ3NwYW4uY2hhdC1tb2RlbC1ob3Zlci1jb3N0LWxhYmVsLXRleHQnLCB1bmRlZmluZWQsIG1ldHJpYy5sYWJlbCkpO1xuXHRcdFx0XHRyb3cuYXBwZW5kQ2hpbGQobGFiZWxDZWxsKTtcblx0XHRcdFx0YXBwZW5kVmFsdWVDZWxsKHJvdywgbWV0cmljLmRlZik7XG5cdFx0XHRcdGlmIChoYXNMb25nQ29udGV4dCkge1xuXHRcdFx0XHRcdGFwcGVuZFZhbHVlQ2VsbChyb3csIG1ldHJpYy5sb25nKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0YWJsZS5hcHBlbmRDaGlsZChyb3cpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodGFibGUpO1xuXHRcdFx0Y29zdFRhYmxlUmVuZGVyZWQgPSB0cnVlO1xuXHRcdFx0Y29zdEluZm9SZW5kZXJlZCA9IHRydWU7XG5cdFx0fSBlbHNlIGlmIChtb2RlbC5tZXRhZGF0YS5wcmljaW5nICYmIChpc011bHRpcGxpZXJQcmljaW5nKG1vZGVsKSB8fCAhcHJpY2VDYXRlZ29yeUxhYmVsKSkge1xuXHRcdFx0YXBwZW5kQ29zdFNlY3Rpb24oY29udGFpbmVyLCBtb2RlbC5tZXRhZGF0YS5wcmljaW5nKTtcblx0XHRcdGNvc3RJbmZvUmVuZGVyZWQgPSB0cnVlO1xuXHRcdH1cblx0fSBlbHNlIGlmICghaXNBdXRvICYmIG1vZGVsLm1ldGFkYXRhLnByaWNpbmcpIHtcblx0XHRhcHBlbmRDb3N0U2VjdGlvbihjb250YWluZXIsIG1vZGVsLm1ldGFkYXRhLnByaWNpbmcpO1xuXHRcdGNvc3RJbmZvUmVuZGVyZWQgPSB0cnVlO1xuXHR9XG5cblx0aWYgKCFjb3N0SW5mb1JlbmRlcmVkICYmIG1vZGVsLm1ldGFkYXRhLnRvb2x0aXApIHtcblx0XHRjb25zdCBkZXNjcmlwdGlvbk1kID0gbmV3IE1hcmtkb3duU3RyaW5nKG1vZGVsLm1ldGFkYXRhLnRvb2x0aXAsIHsgc3VwcG9ydFRoZW1lSWNvbnM6IHRydWUgfSk7XG5cdFx0Y29uc3QgcmVuZGVyZWQgPSBkaXNwb3NhYmxlcy5hZGQocmVuZGVyTWFya2Rvd24oZGVzY3JpcHRpb25NZCwge1xuXHRcdFx0YWN0aW9uSGFuZGxlcjogbGluayA9PiB7IHZvaWQgb3BlbmVyU2VydmljZS5vcGVuKGxpbmssIHsgYWxsb3dDb21tYW5kczogZmFsc2UsIGZyb21Vc2VyR2VzdHVyZTogdHJ1ZSB9KTsgfSxcblx0XHR9KSk7XG5cdFx0cmVuZGVyZWQuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjaGF0LW1vZGVsLWhvdmVyLWRlc2NyaXB0aW9uJyk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHJlbmRlcmVkLmVsZW1lbnQpO1xuXHR9XG5cblx0aWYgKCFpc0F1dG8gJiYgIWNvc3RUYWJsZVJlbmRlcmVkICYmIChtb2RlbC5tZXRhZGF0YS5tYXhJbnB1dFRva2VucyB8fCBtb2RlbC5tZXRhZGF0YS5tYXhPdXRwdXRUb2tlbnMpKSB7XG5cdFx0Y29uc3QgdG90YWxUb2tlbnMgPSAobW9kZWwubWV0YWRhdGEubWF4SW5wdXRUb2tlbnMgPz8gMCkgKyAobW9kZWwubWV0YWRhdGEubWF4T3V0cHV0VG9rZW5zID8/IDApO1xuXHRcdGNvbnN0IGNvbnRleHRTZWN0aW9uID0gZG9tLiQoJy5jaGF0LW1vZGVsLWhvdmVyLWNvbnRleHQnKTtcblx0XHRjb250ZXh0U2VjdGlvbi5hcHBlbmRDaGlsZChkb20uJCgnLmNoYXQtbW9kZWwtaG92ZXItY29udGV4dC1sYWJlbCcsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ21vZGVscy5jb250ZXh0U2l6ZScsIFwiTWF4IGNvbnRleHRcIikpKTtcblx0XHRjb250ZXh0U2VjdGlvbi5hcHBlbmRDaGlsZChkb20uJCgnLmNoYXQtbW9kZWwtaG92ZXItY29udGV4dC12YWx1ZScsIHVuZGVmaW5lZCwgZm9ybWF0VG9rZW5Db3VudCh0b3RhbFRva2VucykpKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoY29udGV4dFNlY3Rpb24pO1xuXHR9XG5cblx0Ly8gQXV0byBoYXMgbm8gcGVyLW1vZGVsIHByaWNpbmcgdG8gc2hvdywgYnV0IGl0IGRvZXMgZXhwb3NlIGEgcm91dGluZyB0aWVyLFxuXHQvLyBzbyB0aGUgY29uZmlndXJhYmxlIHNlY3Rpb24gaXMgbm90IGdhdGVkIG9uIGBpc0F1dG9gLlxuXHRpZiAobW9kZWwubWV0YWRhdGEuY29uZmlndXJhdGlvblNjaGVtYT8ucHJvcGVydGllcykge1xuXHRcdGNvbnN0IGNvbmZpZ0J1dHRvbnM6IHsgZ3JvdXA6IHN0cmluZzsgbGFiZWw6IHN0cmluZyB9W10gPSBbXTtcblx0XHRjb25zdCBzZWVuR3JvdXBzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCBwcm9wU2NoZW1hIG9mIE9iamVjdC52YWx1ZXMobW9kZWwubWV0YWRhdGEuY29uZmlndXJhdGlvblNjaGVtYS5wcm9wZXJ0aWVzKSkge1xuXHRcdFx0aWYgKHByb3BTY2hlbWEuZW51bSAmJiBwcm9wU2NoZW1hLmVudW0ubGVuZ3RoID49IDIgJiYgcHJvcFNjaGVtYS5ncm91cCAmJiBTVVBQT1JURURfQ09ORklHX0dST1VQUy5pbmNsdWRlcyhwcm9wU2NoZW1hLmdyb3VwKSAmJiAhc2Vlbkdyb3Vwcy5oYXMocHJvcFNjaGVtYS5ncm91cCkpIHtcblx0XHRcdFx0Y29uc3QgbGFiZWwgPSBwcm9wU2NoZW1hLnRpdGxlID8/IHByb3BTY2hlbWEuZGVzY3JpcHRpb247XG5cdFx0XHRcdGlmIChsYWJlbCkge1xuXHRcdFx0XHRcdHNlZW5Hcm91cHMuYWRkKHByb3BTY2hlbWEuZ3JvdXApO1xuXHRcdFx0XHRcdGNvbmZpZ0J1dHRvbnMucHVzaCh7IGdyb3VwOiBwcm9wU2NoZW1hLmdyb3VwLCBsYWJlbCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoY29uZmlnQnV0dG9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBjb25maWdSb3cgPSBkb20uJCgnLmNoYXQtbW9kZWwtaG92ZXItY29uZmlndXJhYmxlJyk7XG5cdFx0XHRjb25maWdSb3cuYXBwZW5kQ2hpbGQoZG9tLiQoJ3NwYW4uY2hhdC1tb2RlbC1ob3Zlci1jb25maWd1cmFibGUtbGFiZWwnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdtb2RlbHMuY29uZmlndXJhYmxlJywgXCJDb25maWd1cmFibGVcIikpKTtcblx0XHRcdGNvbnN0IGJ1dHRvbnNDb250YWluZXIgPSBkb20uJCgnLmNoYXQtbW9kZWwtaG92ZXItY29uZmlndXJhYmxlLWJ1dHRvbnMnKTtcblx0XHRcdGZvciAoY29uc3QgeyBncm91cCwgbGFiZWwgfSBvZiBjb25maWdCdXR0b25zKSB7XG5cdFx0XHRcdGNvbnN0IGJ1dHRvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQnV0dG9uKGJ1dHRvbnNDb250YWluZXIsIHtcblx0XHRcdFx0XHQuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLFxuXHRcdFx0XHRcdHNlY29uZGFyeTogdHJ1ZSxcblx0XHRcdFx0XHR0aXRsZTogbGFiZWwsXG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0YnV0dG9uLmxhYmVsID0gbGFiZWw7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChidXR0b24ub25EaWRDbGljaygoKSA9PiBvbkNvbmZpZ3VyZT8uKGdyb3VwKSkpO1xuXHRcdFx0fVxuXHRcdFx0Y29uZmlnUm93LmFwcGVuZENoaWxkKGJ1dHRvbnNDb250YWluZXIpO1xuXHRcdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGNvbmZpZ1Jvdyk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGNvbnRhaW5lci5jaGlsZHJlbi5sZW5ndGggPiAwID8geyBlbGVtZW50OiBjb250YWluZXIsIGRpc3Bvc2FibGU6IGRpc3Bvc2FibGVzIH0gOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGFwcGVuZENvc3RTZWN0aW9uKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHByaWNpbmc6IHN0cmluZyk6IHZvaWQge1xuXHRjb25zdCBjb3N0U2VjdGlvbiA9IGRvbS4kKCcuY2hhdC1tb2RlbC1ob3Zlci1jb3N0Jyk7XG5cdGNvc3RTZWN0aW9uLmFwcGVuZENoaWxkKGRvbS4kKCdzcGFuJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnbW9kZWxzLmNvc3QnLCBcIkNvc3Q6IHswfVwiLCBwcmljaW5nKSkpO1xuXHRjb250YWluZXIuYXBwZW5kQ2hpbGQoY29zdFNlY3Rpb24pO1xufVxuXG5mdW5jdGlvbiBpc0hpZ2hDb3N0Q2F0ZWdvcnkocHJpY2VDYXRlZ29yeTogc3RyaW5nIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdHJldHVybiBwcmljZUNhdGVnb3J5ID09PSAnaGlnaCcgfHwgcHJpY2VDYXRlZ29yeSA9PT0gJ3ZlcnlfaGlnaCc7XG59XG5cbmZ1bmN0aW9uIGdldENhdGVnb3J5TGFiZWwoY2F0ZWdvcnk6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHN3aXRjaCAoY2F0ZWdvcnkpIHtcblx0XHRjYXNlIHVuZGVmaW5lZDpcblx0XHRjYXNlICcnOlxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRjYXNlICdsaWdodHdlaWdodCc6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NoYXQuY2F0ZWdvcnkubGlnaHR3ZWlnaHQnLCBcIkxpZ2h0d2VpZ2h0XCIpO1xuXHRcdGNhc2UgJ3ZlcnNhdGlsZSc6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NoYXQuY2F0ZWdvcnkudmVyc2F0aWxlJywgXCJWZXJzYXRpbGVcIik7XG5cdFx0Y2FzZSAncG93ZXJmdWwnOlxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjaGF0LmNhdGVnb3J5LnBvd2VyZnVsJywgXCJQb3dlcmZ1bFwiKTtcblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuIHR5cGVvZiBjYXRlZ29yeSA9PT0gJ3N0cmluZydcblx0XHRcdFx0PyBjYXRlZ29yeS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGNhdGVnb3J5LnNsaWNlKDEpXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPO0FBRVAsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsY0FBYztBQUN2QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxrQ0FBMkU7QUFDcEYsU0FBUyx1QkFBdUIsYUFBYSwyQkFBMkI7QUFFeEUsTUFBTSwwQkFBNkMsQ0FBQyxjQUFjLFFBQVE7QUFPbkUsU0FBUyxxQkFDZixPQUNBLE9BQ0EsYUFDQSxlQUN1QztBQUN2QyxRQUFNLFNBQVMsWUFBWSxLQUFLO0FBQ2hDLFFBQU0sUUFBUSxDQUFDLFVBQVUsMkJBQTJCLGlCQUFpQixNQUFNLFFBQVEsSUFBSSxNQUFNLFNBQVMsUUFBUTtBQUM5RyxRQUFNLFlBQVksSUFBSSxFQUFFLG1CQUFtQjtBQUMzQyxRQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFFeEMsUUFBTSxXQUFXLElBQUksRUFBRSw2QkFBNkI7QUFDcEQsV0FBUyxZQUFZLElBQUksRUFBRSww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
