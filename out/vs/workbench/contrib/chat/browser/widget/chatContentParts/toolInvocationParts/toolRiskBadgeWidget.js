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
import * as dom from "../../../../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../../../../base/browser/keyboardEvent.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { KeyCode } from "../../../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../../../../base/common/themables.js";
import { localize } from "../../../../../../../nls.js";
import { IHoverService } from "../../../../../../../platform/hover/browser/hover.js";
import { getDefaultHoverDelegate } from "../../../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { ToolRiskLevel } from "../../../tools/chatToolRiskAssessmentService.js";
import "./media/toolRiskBadge.css";
const RISK_BADGE_CLASS = "tool-risk-badge";
let ToolRiskBadgeWidget = class extends Disposable {
  constructor(_hoverService) {
    super();
    this._hoverService = _hoverService;
    this._hoverStore = this._register(new DisposableStore());
    this._detailsHoverStore = this._register(new DisposableStore());
    this._onDidHide = this._register(new Emitter());
    this.onDidHide = this._onDidHide.event;
    this.domNode = dom.$(`span.${RISK_BADGE_CLASS}`);
    this._iconEl = dom.$("span.tool-risk-icon");
    this._iconEl.setAttribute("aria-hidden", "true");
    this._textEl = dom.$("span.tool-risk-text");
    this._detailsIconEl = dom.$("span.tool-risk-details-icon");
    this._detailsIconEl.classList.add(...ThemeIcon.asClassNameArray(Codicon.info));
    this._detailsIconEl.tabIndex = 0;
    this._detailsIconEl.setAttribute("role", "button");
    this._detailsIconEl.setAttribute("aria-label", localize("toolRisk.detailsIconLabel", "Risk assessment details"));
    this.domNode.append(this._iconEl, this._textEl, this._detailsIconEl);
    this._refreshDetailsHover();
    this.setLoading();
    this._register(dom.addDisposableListener(this._detailsIconEl, dom.EventType.CLICK, (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._hoverService.showManagedHover(this._detailsIconEl);
    }));
    this._register(dom.addDisposableListener(this._detailsIconEl, dom.EventType.KEY_DOWN, (e) => {
      const ev = new StandardKeyboardEvent(e);
      if (ev.keyCode === KeyCode.Enter || ev.keyCode === KeyCode.Space) {
        ev.preventDefault();
        ev.stopPropagation();
        this._hoverService.showManagedHover(this._detailsIconEl);
      }
    }));
  }
  get isDisposed() {
    return this._store.isDisposed;
  }
  setLoading() {
    this._setVariant("loading");
    this._setIcon(ThemeIcon.modify(Codicon.loadingCompact, "spin"));
    const text = localize("toolRisk.assessing", "Assessing risk\u2026");
    this._textEl.textContent = text;
    this._setHover(localize("toolRisk.assessingHover", "Generating a risk assessment for this tool call."));
  }
  setHidden() {
    this.domNode.style.display = "none";
    this._onDidHide.fire();
  }
  setAssessment(assessment) {
    switch (assessment.risk) {
      case ToolRiskLevel.Green:
        this._setVariant("green");
        this._setIcon(Codicon.passCompact);
        break;
      case ToolRiskLevel.Orange:
        this._setVariant("orange");
        this._setIcon(Codicon.warningCompact);
        break;
      case ToolRiskLevel.Red:
        this._setVariant("red");
        this._setIcon(Codicon.errorCompact);
        break;
    }
    this.domNode.style.display = "";
    this._textEl.textContent = assessment.explanation;
    this._setHover(assessment.explanation);
  }
  /**
   * Provide additional context to surface in the trailing info icon's hover.
   * The hover always notes that the assessment is AI-generated; any details
   * passed here are appended below that note.
   */
  setDetails(details) {
    this._details = details;
    this._refreshDetailsHover();
  }
  /**
   * The markdown content currently shown in the trailing info icon's hover.
   * Exposed so component fixtures can render a preview of the hover content.
   */
  getDetailsMarkdown() {
    return this._buildDetailsMarkdown();
  }
  _setVariant(variant) {
    this.domNode.classList.remove("green", "orange", "red", "loading");
    this.domNode.classList.add(variant);
  }
  _setIcon(icon) {
    this._iconEl.textContent = "";
    this._iconEl.className = "tool-risk-icon " + ThemeIcon.asClassName(icon);
  }
  _setHover(content) {
    this._hoverStore.clear();
    this._hoverStore.add(this._hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.domNode, content));
  }
  _refreshDetailsHover() {
    this._detailsHoverStore.clear();
    const md = this._buildDetailsMarkdown();
    const fallback = md.value.replace(/\$\([^)]+\)\s?/g, "");
    this._detailsHoverStore.add(this._hoverService.setupManagedHover(
      getDefaultHoverDelegate("element"),
      this._detailsIconEl,
      { markdown: md, markdownNotSupportedFallback: fallback }
    ));
  }
  _buildDetailsMarkdown() {
    const aiNote = localize("toolRisk.aiGenerated", "Risk assessments are AI-generated and may be inaccurate.");
    const details = this._details;
    const md = new MarkdownString(void 0, {
      supportThemeIcons: true,
      isTrusted: typeof details === "object" && details ? details.isTrusted : void 0
    });
    md.appendText(aiNote);
    if (details) {
      md.appendMarkdown("\n\n");
      if (typeof details === "string") {
        md.appendText(details);
      } else {
        md.appendMarkdown(details.value);
      }
    }
    return md;
  }
};
ToolRiskBadgeWidget = __decorateClass([
  __decorateParam(0, IHoverService)
], ToolRiskBadgeWidget);
export {
  ToolRiskBadgeWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcdG9vbEludm9jYXRpb25QYXJ0c1xcdG9vbFJpc2tCYWRnZVdpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZywgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBJVG9vbFJpc2tBc3Nlc3NtZW50LCBUb29sUmlza0xldmVsIH0gZnJvbSAnLi4vLi4vLi4vdG9vbHMvY2hhdFRvb2xSaXNrQXNzZXNzbWVudFNlcnZpY2UuanMnO1xuXG5pbXBvcnQgJy4vbWVkaWEvdG9vbFJpc2tCYWRnZS5jc3MnO1xuXG5jb25zdCBSSVNLX0JBREdFX0NMQVNTID0gJ3Rvb2wtcmlzay1iYWRnZSc7XG5cbmV4cG9ydCBjbGFzcyBUb29sUmlza0JhZGdlV2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHVibGljIHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdHB1YmxpYyBnZXQgaXNEaXNwb3NlZCgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pY29uRWw6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF90ZXh0RWw6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZXRhaWxzSWNvbkVsOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfaG92ZXJTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RldGFpbHNIb3ZlclN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSBfZGV0YWlsczogSU1hcmtkb3duU3RyaW5nIHwgc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkSGlkZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRIaWRlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkSGlkZS5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmRvbU5vZGUgPSBkb20uJChgc3Bhbi4ke1JJU0tfQkFER0VfQ0xBU1N9YCk7XG5cdFx0dGhpcy5faWNvbkVsID0gZG9tLiQoJ3NwYW4udG9vbC1yaXNrLWljb24nKTtcblx0XHR0aGlzLl9pY29uRWwuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0dGhpcy5fdGV4dEVsID0gZG9tLiQoJ3NwYW4udG9vbC1yaXNrLXRleHQnKTtcblx0XHR0aGlzLl9kZXRhaWxzSWNvbkVsID0gZG9tLiQoJ3NwYW4udG9vbC1yaXNrLWRldGFpbHMtaWNvbicpO1xuXHRcdHRoaXMuX2RldGFpbHNJY29uRWwuY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmluZm8pKTtcblx0XHR0aGlzLl9kZXRhaWxzSWNvbkVsLnRhYkluZGV4ID0gMDtcblx0XHR0aGlzLl9kZXRhaWxzSWNvbkVsLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHR0aGlzLl9kZXRhaWxzSWNvbkVsLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCd0b29sUmlzay5kZXRhaWxzSWNvbkxhYmVsJywgXCJSaXNrIGFzc2Vzc21lbnQgZGV0YWlsc1wiKSk7XG5cdFx0dGhpcy5kb21Ob2RlLmFwcGVuZCh0aGlzLl9pY29uRWwsIHRoaXMuX3RleHRFbCwgdGhpcy5fZGV0YWlsc0ljb25FbCk7XG5cdFx0dGhpcy5fcmVmcmVzaERldGFpbHNIb3ZlcigpO1xuXHRcdHRoaXMuc2V0TG9hZGluZygpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9kZXRhaWxzSWNvbkVsLCBkb20uRXZlbnRUeXBlLkNMSUNLLCBlID0+IHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR0aGlzLl9ob3ZlclNlcnZpY2Uuc2hvd01hbmFnZWRIb3Zlcih0aGlzLl9kZXRhaWxzSWNvbkVsKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9kZXRhaWxzSWNvbkVsLCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCBlID0+IHtcblx0XHRcdGNvbnN0IGV2ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGlmIChldi5rZXlDb2RlID09PSBLZXlDb2RlLkVudGVyIHx8IGV2LmtleUNvZGUgPT09IEtleUNvZGUuU3BhY2UpIHtcblx0XHRcdFx0ZXYucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZXYuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHRoaXMuX2hvdmVyU2VydmljZS5zaG93TWFuYWdlZEhvdmVyKHRoaXMuX2RldGFpbHNJY29uRWwpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHNldExvYWRpbmcoKTogdm9pZCB7XG5cdFx0dGhpcy5fc2V0VmFyaWFudCgnbG9hZGluZycpO1xuXHRcdHRoaXMuX3NldEljb24oVGhlbWVJY29uLm1vZGlmeShDb2RpY29uLmxvYWRpbmdDb21wYWN0LCAnc3BpbicpKTtcblx0XHRjb25zdCB0ZXh0ID0gbG9jYWxpemUoJ3Rvb2xSaXNrLmFzc2Vzc2luZycsIFwiQXNzZXNzaW5nIHJpc2tcXHUyMDI2XCIpO1xuXHRcdHRoaXMuX3RleHRFbC50ZXh0Q29udGVudCA9IHRleHQ7XG5cdFx0dGhpcy5fc2V0SG92ZXIobG9jYWxpemUoJ3Rvb2xSaXNrLmFzc2Vzc2luZ0hvdmVyJywgXCJHZW5lcmF0aW5nIGEgcmlzayBhc3Nlc3NtZW50IGZvciB0aGlzIHRvb2wgY2FsbC5cIikpO1xuXHR9XG5cblx0c2V0SGlkZGVuKCk6IHZvaWQge1xuXHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRoaXMuX29uRGlkSGlkZS5maXJlKCk7XG5cdH1cblxuXHRzZXRBc3Nlc3NtZW50KGFzc2Vzc21lbnQ6IElUb29sUmlza0Fzc2Vzc21lbnQpOiB2b2lkIHtcblx0XHRzd2l0Y2ggKGFzc2Vzc21lbnQucmlzaykge1xuXHRcdFx0Y2FzZSBUb29sUmlza0xldmVsLkdyZWVuOlxuXHRcdFx0XHR0aGlzLl9zZXRWYXJpYW50KCdncmVlbicpO1xuXHRcdFx0XHR0aGlzLl9zZXRJY29uKENvZGljb24ucGFzc0NvbXBhY3QpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgVG9vbFJpc2tMZXZlbC5PcmFuZ2U6XG5cdFx0XHRcdHRoaXMuX3NldFZhcmlhbnQoJ29yYW5nZScpO1xuXHRcdFx0XHR0aGlzLl9zZXRJY29uKENvZGljb24ud2FybmluZ0NvbXBhY3QpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgVG9vbFJpc2tMZXZlbC5SZWQ6XG5cdFx0XHRcdHRoaXMuX3NldFZhcmlhbnQoJ3JlZCcpO1xuXHRcdFx0XHR0aGlzLl9zZXRJY29uKENvZGljb24uZXJyb3JDb21wYWN0KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0dGhpcy5fdGV4dEVsLnRleHRDb250ZW50ID0gYXNzZXNzbWVudC5leHBsYW5hdGlvbjtcblx0XHR0aGlzLl9zZXRIb3Zlcihhc3Nlc3NtZW50LmV4cGxhbmF0aW9uKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQcm92aWRlIGFkZGl0aW9uYWwgY29udGV4dCB0byBzdXJmYWNlIGluIHRoZSB0cmFpbGluZyBpbmZvIGljb24ncyBob3Zlci5cblx0ICogVGhlIGhvdmVyIGFsd2F5cyBub3RlcyB0aGF0IHRoZSBhc3Nlc3NtZW50IGlzIEFJLWdlbmVyYXRlZDsgYW55IGRldGFpbHNcblx0ICogcGFzc2VkIGhlcmUgYXJlIGFwcGVuZGVkIGJlbG93IHRoYXQgbm90ZS5cblx0ICovXG5cdHNldERldGFpbHMoZGV0YWlsczogSU1hcmtkb3duU3RyaW5nIHwgc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fZGV0YWlscyA9IGRldGFpbHM7XG5cdFx0dGhpcy5fcmVmcmVzaERldGFpbHNIb3ZlcigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBtYXJrZG93biBjb250ZW50IGN1cnJlbnRseSBzaG93biBpbiB0aGUgdHJhaWxpbmcgaW5mbyBpY29uJ3MgaG92ZXIuXG5cdCAqIEV4cG9zZWQgc28gY29tcG9uZW50IGZpeHR1cmVzIGNhbiByZW5kZXIgYSBwcmV2aWV3IG9mIHRoZSBob3ZlciBjb250ZW50LlxuXHQgKi9cblx0Z2V0RGV0YWlsc01hcmtkb3duKCk6IElNYXJrZG93blN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2J1aWxkRGV0YWlsc01hcmtkb3duKCk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRWYXJpYW50KHZhcmlhbnQ6ICdsb2FkaW5nJyB8ICdncmVlbicgfCAnb3JhbmdlJyB8ICdyZWQnKTogdm9pZCB7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoJ2dyZWVuJywgJ29yYW5nZScsICdyZWQnLCAnbG9hZGluZycpO1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKHZhcmlhbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0SWNvbihpY29uOiBUaGVtZUljb24pOiB2b2lkIHtcblx0XHR0aGlzLl9pY29uRWwudGV4dENvbnRlbnQgPSAnJztcblx0XHR0aGlzLl9pY29uRWwuY2xhc3NOYW1lID0gJ3Rvb2wtcmlzay1pY29uICcgKyBUaGVtZUljb24uYXNDbGFzc05hbWUoaWNvbik7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRIb3Zlcihjb250ZW50OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9ob3ZlclN0b3JlLmNsZWFyKCk7XG5cdFx0dGhpcy5faG92ZXJTdG9yZS5hZGQodGhpcy5faG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCB0aGlzLmRvbU5vZGUsIGNvbnRlbnQpKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZnJlc2hEZXRhaWxzSG92ZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGV0YWlsc0hvdmVyU3RvcmUuY2xlYXIoKTtcblx0XHRjb25zdCBtZCA9IHRoaXMuX2J1aWxkRGV0YWlsc01hcmtkb3duKCk7XG5cdFx0Y29uc3QgZmFsbGJhY2sgPSBtZC52YWx1ZS5yZXBsYWNlKC9cXCRcXChbXildK1xcKVxccz8vZywgJycpO1xuXHRcdHRoaXMuX2RldGFpbHNIb3ZlclN0b3JlLmFkZCh0aGlzLl9ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoXG5cdFx0XHRnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnZWxlbWVudCcpLFxuXHRcdFx0dGhpcy5fZGV0YWlsc0ljb25FbCxcblx0XHRcdHsgbWFya2Rvd246IG1kLCBtYXJrZG93bk5vdFN1cHBvcnRlZEZhbGxiYWNrOiBmYWxsYmFjayB9LFxuXHRcdCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYnVpbGREZXRhaWxzTWFya2Rvd24oKTogSU1hcmtkb3duU3RyaW5nIHtcblx0XHRjb25zdCBhaU5vdGUgPSBsb2NhbGl6ZSgndG9vbFJpc2suYWlHZW5lcmF0ZWQnLCBcIlJpc2sgYXNzZXNzbWVudHMgYXJlIEFJLWdlbmVyYXRlZCBhbmQgbWF5IGJlIGluYWNjdXJhdGUuXCIpO1xuXHRcdGNvbnN0IGRldGFpbHMgPSB0aGlzLl9kZXRhaWxzO1xuXHRcdGNvbnN0IG1kID0gbmV3IE1hcmtkb3duU3RyaW5nKHVuZGVmaW5lZCwge1xuXHRcdFx0c3VwcG9ydFRoZW1lSWNvbnM6IHRydWUsXG5cdFx0XHRpc1RydXN0ZWQ6IHR5cGVvZiBkZXRhaWxzID09PSAnb2JqZWN0JyAmJiBkZXRhaWxzID8gZGV0YWlscy5pc1RydXN0ZWQgOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdFx0bWQuYXBwZW5kVGV4dChhaU5vdGUpO1xuXHRcdGlmIChkZXRhaWxzKSB7XG5cdFx0XHRtZC5hcHBlbmRNYXJrZG93bignXFxuXFxuJyk7XG5cdFx0XHRpZiAodHlwZW9mIGRldGFpbHMgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdG1kLmFwcGVuZFRleHQoZGV0YWlscyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRtZC5hcHBlbmRNYXJrZG93bihkZXRhaWxzLnZhbHVlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG1kO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFzQjtBQUMvQixT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
