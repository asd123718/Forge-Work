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
import { localize } from "../../../../../nls.js";
import { $, addDisposableListener, EventType } from "../../../../../base/browser/dom.js";
import { ButtonBar } from "../../../../../base/browser/ui/button/button.js";
import { HoverPosition } from "../../../../../base/browser/ui/hover/hoverWidget.js";
import { renderIcon } from "../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { isLinux, isMacintosh } from "../../../../../base/common/platform.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { defaultButtonStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import {
  BrowserEditor,
  BrowserEditorContribution,
  BrowserWidgetLocation
} from "../browserEditor.js";
let BrowserEditorErrorFeatures = class extends BrowserEditorContribution {
  constructor(editor, instantiationService) {
    super(editor);
    this._element = $(".browser-error-container");
    this._certActionButton = this._register(new MutableDisposable());
    this._siteInfoSlot = $(".browser-site-info-slot-wrapper");
    this._urlRenderer = this._register(new CertUrlRenderer());
    this._element.style.display = "none";
    this._content = { location: BrowserWidgetLocation.ContentArea, element: this._element, order: 300 };
    this._siteInfoWidget = this._register(instantiationService.createInstance(SiteInfoWidget, this._siteInfoSlot, editor));
    this._preUrlWidget = { location: BrowserWidgetLocation.PreUrl, element: this._siteInfoSlot, order: 10 };
  }
  get widgets() {
    return [this._content, this._preUrlWidget];
  }
  get urlRenderers() {
    return [this._urlRenderer];
  }
  onModelAttached(model, store) {
    store.add(model.onDidChangeLoadingState(() => this._updateError()));
    store.add(model.onDidNavigate(() => this._updateCertState()));
    this._updateError();
  }
  onModelDetached() {
    this._clearContent();
    this._element.style.display = "none";
    this._siteInfoWidget.setCertificateError(void 0);
    this._urlRenderer.setCertificateError(void 0);
  }
  _updateError() {
    const model = this.editor.model;
    if (!model) {
      return;
    }
    const error = model.error;
    this._updateCertState();
    if (!error) {
      this._element.style.display = "none";
      return;
    }
    this._clearContent();
    this._element.appendChild(this._renderError(error));
    this._element.style.display = "";
  }
  _updateCertState() {
    const model = this.editor.model;
    const cert = model?.certificateError ?? model?.error?.certificateError;
    this._siteInfoWidget.setCertificateError(cert);
    this._urlRenderer.setCertificateError(cert);
  }
  _clearContent() {
    this._certActionButton.clear();
    while (this._element.firstChild) {
      this._element.removeChild(this._element.firstChild);
    }
  }
  _renderError(error) {
    const isCertError = !!error.certificateError;
    const errorContent = $(".browser-error-content");
    const errorIcon = $(".browser-error-icon");
    errorIcon.classList.toggle("cert-error", isCertError);
    errorIcon.appendChild(renderIcon(isCertError ? Codicon.workspaceUntrusted : Codicon.globe));
    const errorTitle = $(".browser-error-title");
    errorTitle.textContent = isCertError ? localize("browser.certErrorLabel", "Certificate Error") : localize("browser.loadErrorLabel", "Failed to Load Page");
    const errorMessage = $(".browser-error-detail");
    const errorText = $("span");
    errorText.textContent = isCertError ? localize("browser.certErrorDescription", "This site's security certificate could not be verified.") : `${error.errorDescription} (${error.errorCode})`;
    errorMessage.appendChild(errorText);
    if (error.certificateError) {
      const extraWarning = $("b.browser-error-detail");
      extraWarning.textContent = localize("browser.certErrorExtraWarning", " Your connection is not private.");
      errorMessage.appendChild(extraWarning);
    }
    if (this.editor.model?.isRemoteSession) {
      const remoteWarning = error.errorCode === -111 || error.errorCode === -324 ? localize("browser.remoteErrorExtraWarning", "This usually means the host could not be found.\nEnsure the URL is correct and the server is accessible from the remote machine.") : "";
      if (remoteWarning) {
        const remoteWarningEl = $(".browser-error-detail.hint");
        remoteWarningEl.textContent = remoteWarning;
        errorMessage.appendChild(remoteWarningEl);
      }
    }
    const errorUrl = $(".browser-error-detail");
    const urlLabel = $("strong");
    urlLabel.textContent = localize("browser.errorUrlLabel", "URL:");
    const urlValue = $("code");
    urlValue.textContent = error.url;
    errorUrl.appendChild(urlLabel);
    errorUrl.appendChild(document.createTextNode(" "));
    errorUrl.appendChild(urlValue);
    errorContent.appendChild(errorIcon);
    errorContent.appendChild(errorTitle);
    errorContent.appendChild(errorMessage);
    errorContent.appendChild(errorUrl);
    if (error.certificateError) {
      errorContent.appendChild(this._renderCertDetails(error.certificateError));
      errorContent.appendChild(this._renderCertActions(error.certificateError));
    }
    return errorContent;
  }
  _renderCertDetails(certError) {
    const certDetailsTable = $(".browser-cert-details-table");
    const heading = $(".browser-cert-details-heading");
    heading.textContent = localize("browser.certDetailsHeading", "Certificate Details");
    certDetailsTable.appendChild(heading);
    const addRow = (label, value) => {
      const row = $(".browser-cert-details-row");
      const labelEl = $(".browser-cert-details-label");
      labelEl.textContent = label;
      const valueEl = $(".browser-cert-details-value");
      valueEl.textContent = value;
      row.appendChild(labelEl);
      row.appendChild(valueEl);
      certDetailsTable.appendChild(row);
    };
    addRow(localize("browser.certError", "Error"), certError.error);
    addRow(localize("browser.certIssuer", "Issuer"), certError.issuerName);
    addRow(localize("browser.certSubject", "Subject"), certError.subjectName);
    const formatDate = (epoch) => new Date(epoch * 1e3).toLocaleDateString();
    addRow(
      localize("browser.certValid", "Valid"),
      `${formatDate(certError.validStart)} - ${formatDate(certError.validExpiry)}`
    );
    addRow(localize("browser.certFingerprint", "Fingerprint"), certError.fingerprint);
    return certDetailsTable;
  }
  _renderCertActions(certError) {
    const actionContainer = $(".browser-cert-action");
    actionContainer.classList.toggle("reverse", isMacintosh || isLinux);
    const canGoBack = this.editor.model?.canGoBack ?? false;
    const buttonBar = new ButtonBar(actionContainer);
    this._certActionButton.value = buttonBar;
    const primaryButton = buttonBar.addButton({ ...defaultButtonStyles });
    primaryButton.label = canGoBack ? localize("browser.certGoBack", "Go Back") : localize("browser.certCloseTab", "Close Tab");
    primaryButton.onDidClick(() => {
      if (canGoBack) {
        this.editor.model?.goBack();
      } else {
        this.editor.closeTab();
      }
    });
    const secondaryButton = buttonBar.addButton({ ...defaultButtonStyles, secondary: true });
    secondaryButton.label = localize("browser.certProceed", "Proceed anyway (unsafe)");
    secondaryButton.onDidClick(() => {
      this.editor.model?.trustCertificate(certError.host, certError.fingerprint);
    });
    return actionContainer;
  }
};
BrowserEditorErrorFeatures = __decorateClass([
  __decorateParam(1, IInstantiationService)
], BrowserEditorErrorFeatures);
const _CertUrlRenderer = class _CertUrlRenderer {
  constructor() {
    this._onDidChange = new Emitter();
    this.onDidChange = this._onDidChange.event;
    this._hasCertError = false;
  }
  setCertificateError(certError) {
    const next = !!certError;
    if (this._hasCertError === next) {
      return;
    }
    this._hasCertError = next;
    this._onDidChange.fire();
  }
  render(url, container) {
    if (!this._hasCertError || !url.startsWith(_CertUrlRenderer.HTTPS_PREFIX)) {
      return false;
    }
    const protocol = document.createElement("span");
    protocol.className = "browser-url-display-protocol-bad";
    protocol.textContent = _CertUrlRenderer.HTTPS_PREFIX;
    container.appendChild(protocol);
    const rest = document.createElement("span");
    rest.textContent = url.slice(_CertUrlRenderer.HTTPS_PREFIX.length);
    container.appendChild(rest);
    return true;
  }
  dispose() {
    this._onDidChange.dispose();
  }
};
_CertUrlRenderer.HTTPS_PREFIX = "https:";
let CertUrlRenderer = _CertUrlRenderer;
let SiteInfoWidget = class extends Disposable {
  constructor(parent, _editor, _hoverService) {
    super();
    this._editor = _editor;
    this._hoverService = _hoverService;
    this._container = $(".browser-site-info-container");
    this._container.style.display = "none";
    this._indicator = $(".browser-site-info-indicator");
    this._indicator.tabIndex = 0;
    this._indicator.role = "button";
    this._indicator.ariaLabel = localize("browser.notSecure", "Not Secure");
    this._indicator.appendChild(renderIcon(Codicon.workspaceUntrusted));
    this._container.appendChild(this._indicator);
    parent.appendChild(this._container);
    this._register(addDisposableListener(this._indicator, EventType.CLICK, () => this._showHover()));
    this._register(addDisposableListener(this._indicator, EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this._showHover();
      }
    }));
  }
  /** Update visibility and state from a certificate error (or lack thereof). */
  setCertificateError(certError) {
    this._certError = certError;
    this._container.style.display = certError ? "" : "none";
  }
  _showHover() {
    const certError = this._certError;
    if (!certError) {
      return;
    }
    const content = document.createElement("div");
    content.classList.add("browser-site-info-hover-content");
    const heading = document.createElement("div");
    heading.classList.add("browser-site-info-hover-heading");
    heading.textContent = localize("browser.certHoverHeading", "Certificate Not Trusted");
    content.appendChild(heading);
    const detail1 = document.createElement("div");
    detail1.classList.add("browser-site-info-hover-detail");
    detail1.textContent = localize("browser.certHoverDetail1", "Your connection to this site is not secure.");
    content.appendChild(detail1);
    if (certError.hasTrustedException) {
      const detail2 = document.createElement("div");
      detail2.classList.add("browser-site-info-hover-detail");
      detail2.textContent = localize(
        "browser.certHoverDetail2",
        "You previously chose to proceed to '{0}' despite a certificate error ({1}).",
        certError.host,
        certError.error
      );
      content.appendChild(detail2);
      const revokeLink = document.createElement("a");
      revokeLink.classList.add("browser-site-info-hover-revoke");
      revokeLink.textContent = localize("browser.certRevoke", "Revoke and Close");
      revokeLink.role = "button";
      revokeLink.tabIndex = 0;
      revokeLink.addEventListener("click", () => {
        hover?.dispose();
        this._editor.model?.untrustCertificate(certError.host, certError.fingerprint);
      });
      revokeLink.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          hover?.dispose();
          this._editor.model?.untrustCertificate(certError.host, certError.fingerprint);
        }
      });
      content.appendChild(revokeLink);
    }
    const hover = this._hoverService.showInstantHover({
      content,
      target: this._indicator,
      container: this._container,
      position: { hoverPosition: HoverPosition.BELOW },
      persistence: { sticky: true }
    }, true);
  }
};
SiteInfoWidget = __decorateClass([
  __decorateParam(2, IHoverService)
], SiteInfoWidget);
BrowserEditor.registerContribution(BrowserEditorErrorFeatures);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJyb3dzZXJWaWV3XFxlbGVjdHJvbi1icm93c2VyXFxmZWF0dXJlc1xcYnJvd3NlckVkaXRvckVycm9yRmVhdHVyZXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyAkLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIEV2ZW50VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQnV0dG9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgSG92ZXJQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlcldpZGdldC5qcyc7XG5pbXBvcnQgeyByZW5kZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNMaW51eCwgaXNNYWNpbnRvc2ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IGRlZmF1bHRCdXR0b25TdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgSUJyb3dzZXJWaWV3Q2VydGlmaWNhdGVFcnJvciwgSUJyb3dzZXJWaWV3TG9hZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYnJvd3NlclZpZXcvY29tbW9uL2Jyb3dzZXJWaWV3LmpzJztcbmltcG9ydCB7IElCcm93c2VyVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL2Jyb3dzZXJWaWV3LmpzJztcbmltcG9ydCB7XG5cdEJyb3dzZXJFZGl0b3IsXG5cdEJyb3dzZXJFZGl0b3JDb250cmlidXRpb24sXG5cdEJyb3dzZXJXaWRnZXRMb2NhdGlvbixcblx0SUJyb3dzZXJFZGl0b3JXaWRnZXQsXG5cdElCcm93c2VyVXJsUmVuZGVyZXIsXG59IGZyb20gJy4uL2Jyb3dzZXJFZGl0b3IuanMnO1xuXG4vKipcbiAqIFJlbmRlcnMgdGhlIGZ1bGwtcGFuZSBlcnJvciBvdmVybGF5IChsb2FkIGZhaWx1cmVzIGFuZCBjZXJ0aWZpY2F0ZSBlcnJvcnMpXG4gKiBpbnNpZGUgdGhlIGJyb3dzZXIgY29udGFpbmVyLCBwbHVzIGRyaXZlcyB0aGUgbmF2YmFyJ3MgY2VydCBpbmRpY2F0b3IgYW5kXG4gKiB0aGUgY2VydC1hd2FyZSBVUkwgZGlzcGxheSByZW5kZXJpbmcuXG4gKlxuICogU3Vic2NyaWJlcyB0byBtb2RlbCBsb2FkaW5nLXN0YXRlIGFuZCBuYXZpZ2F0aW9uIGV2ZW50cyBhbmQgcmVidWlsZHMgdGhlXG4gKiBET00gb24gZWFjaCB0cmFuc2l0aW9uLiBXaGVuIHRoZSB1bmRlcmx5aW5nIGxvYWQgZXJyb3IgY2FycmllcyBjZXJ0aWZpY2F0ZVxuICogaW5mbywgYW4gYWRkaXRpb25hbCBkZXRhaWxzIHRhYmxlIGFuZCB0cnVzdC9iYWNrIGFjdGlvbiBidXR0b25zIGFyZVxuICogcmVuZGVyZWQgaW5saW5lLiBUaGUgc2l0ZS1pbmZvIHdpZGdldCAoXCJOb3QgU2VjdXJlXCIgaW5kaWNhdG9yKSBpc1xuICogY29udHJpYnV0ZWQgYXMgYSBwcmUtVVJMIHdpZGdldCBhbmQgdGhlIGNlcnQgVVJMIHJlbmRlcmVyIG1hcmtzIHRoZVxuICogYGh0dHBzOmAgcHJlZml4IHdoZW4gYSBjZXJ0IGVycm9yIGlzIGFjdGl2ZS5cbiAqL1xuY2xhc3MgQnJvd3NlckVkaXRvckVycm9yRmVhdHVyZXMgZXh0ZW5kcyBCcm93c2VyRWRpdG9yQ29udHJpYnV0aW9uIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lbGVtZW50ID0gJCgnLmJyb3dzZXItZXJyb3ItY29udGFpbmVyJyk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NlcnRBY3Rpb25CdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8QnV0dG9uQmFyPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29udGVudDogSUJyb3dzZXJFZGl0b3JXaWRnZXQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2l0ZUluZm9TbG90ID0gJCgnLmJyb3dzZXItc2l0ZS1pbmZvLXNsb3Qtd3JhcHBlcicpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zaXRlSW5mb1dpZGdldDogU2l0ZUluZm9XaWRnZXQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3ByZVVybFdpZGdldDogSUJyb3dzZXJFZGl0b3JXaWRnZXQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3VybFJlbmRlcmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IENlcnRVcmxSZW5kZXJlcigpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IEJyb3dzZXJFZGl0b3IsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihlZGl0b3IpO1xuXHRcdHRoaXMuX2VsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHQvLyBTaXQgYWJvdmUgdGhlIHBsYWNlaG9sZGVyIHNjcmVlbnNob3QgYW5kIG92ZXJsYXktcGF1c2UgKG9yZGVycyAxMDAvMjAwKS5cblx0XHR0aGlzLl9jb250ZW50ID0geyBsb2NhdGlvbjogQnJvd3NlcldpZGdldExvY2F0aW9uLkNvbnRlbnRBcmVhLCBlbGVtZW50OiB0aGlzLl9lbGVtZW50LCBvcmRlcjogMzAwIH07XG5cblx0XHR0aGlzLl9zaXRlSW5mb1dpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNpdGVJbmZvV2lkZ2V0LCB0aGlzLl9zaXRlSW5mb1Nsb3QsIGVkaXRvcikpO1xuXHRcdHRoaXMuX3ByZVVybFdpZGdldCA9IHsgbG9jYXRpb246IEJyb3dzZXJXaWRnZXRMb2NhdGlvbi5QcmVVcmwsIGVsZW1lbnQ6IHRoaXMuX3NpdGVJbmZvU2xvdCwgb3JkZXI6IDEwIH07XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgd2lkZ2V0cygpOiByZWFkb25seSBJQnJvd3NlckVkaXRvcldpZGdldFtdIHtcblx0XHRyZXR1cm4gW3RoaXMuX2NvbnRlbnQsIHRoaXMuX3ByZVVybFdpZGdldF07XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgdXJsUmVuZGVyZXJzKCk6IHJlYWRvbmx5IElCcm93c2VyVXJsUmVuZGVyZXJbXSB7XG5cdFx0cmV0dXJuIFt0aGlzLl91cmxSZW5kZXJlcl07XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgb25Nb2RlbEF0dGFjaGVkKG1vZGVsOiBJQnJvd3NlclZpZXdNb2RlbCwgc3RvcmU6IERpc3Bvc2FibGVTdG9yZSk6IHZvaWQge1xuXHRcdHN0b3JlLmFkZChtb2RlbC5vbkRpZENoYW5nZUxvYWRpbmdTdGF0ZSgoKSA9PiB0aGlzLl91cGRhdGVFcnJvcigpKSk7XG5cdFx0c3RvcmUuYWRkKG1vZGVsLm9uRGlkTmF2aWdhdGUoKCkgPT4gdGhpcy5fdXBkYXRlQ2VydFN0YXRlKCkpKTtcblx0XHR0aGlzLl91cGRhdGVFcnJvcigpO1xuXHR9XG5cblx0b3ZlcnJpZGUgb25Nb2RlbERldGFjaGVkKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NsZWFyQ29udGVudCgpO1xuXHRcdHRoaXMuX2VsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR0aGlzLl9zaXRlSW5mb1dpZGdldC5zZXRDZXJ0aWZpY2F0ZUVycm9yKHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fdXJsUmVuZGVyZXIuc2V0Q2VydGlmaWNhdGVFcnJvcih1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlRXJyb3IoKTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmVkaXRvci5tb2RlbDtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGVycm9yID0gbW9kZWwuZXJyb3I7XG5cdFx0dGhpcy5fdXBkYXRlQ2VydFN0YXRlKCk7XG5cblx0XHRpZiAoIWVycm9yKSB7XG5cdFx0XHR0aGlzLl9lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fY2xlYXJDb250ZW50KCk7XG5cdFx0dGhpcy5fZWxlbWVudC5hcHBlbmRDaGlsZCh0aGlzLl9yZW5kZXJFcnJvcihlcnJvcikpO1xuXHRcdHRoaXMuX2VsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQ2VydFN0YXRlKCk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5lZGl0b3IubW9kZWw7XG5cdFx0Ly8gQ292ZXIgYm90aCBwYXRoczogdGhlIGNlcnQgZnJvbSB0aGUgbW9zdCByZWNlbnQgc3VjY2Vzc2Z1bCBuYXZpZ2F0aW9uXG5cdFx0Ly8gKG1vZGVsLmNlcnRpZmljYXRlRXJyb3IsIHNldCB3aGVuIHRoZSB1c2VyIHRydXN0ZWQgYSBjZXJ0IHRoaXMgc2Vzc2lvbilcblx0XHQvLyBhbmQgdGhlIGNlcnQgdGhhdCBjYXVzZWQgdGhlIGN1cnJlbnQgbG9hZCBlcnJvci5cblx0XHRjb25zdCBjZXJ0ID0gbW9kZWw/LmNlcnRpZmljYXRlRXJyb3IgPz8gbW9kZWw/LmVycm9yPy5jZXJ0aWZpY2F0ZUVycm9yO1xuXHRcdHRoaXMuX3NpdGVJbmZvV2lkZ2V0LnNldENlcnRpZmljYXRlRXJyb3IoY2VydCk7XG5cdFx0dGhpcy5fdXJsUmVuZGVyZXIuc2V0Q2VydGlmaWNhdGVFcnJvcihjZXJ0KTtcblx0fVxuXG5cdHByaXZhdGUgX2NsZWFyQ29udGVudCgpOiB2b2lkIHtcblx0XHR0aGlzLl9jZXJ0QWN0aW9uQnV0dG9uLmNsZWFyKCk7XG5cdFx0d2hpbGUgKHRoaXMuX2VsZW1lbnQuZmlyc3RDaGlsZCkge1xuXHRcdFx0dGhpcy5fZWxlbWVudC5yZW1vdmVDaGlsZCh0aGlzLl9lbGVtZW50LmZpcnN0Q2hpbGQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlckVycm9yKGVycm9yOiBJQnJvd3NlclZpZXdMb2FkRXJyb3IpOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3QgaXNDZXJ0RXJyb3IgPSAhIWVycm9yLmNlcnRpZmljYXRlRXJyb3I7XG5cdFx0Y29uc3QgZXJyb3JDb250ZW50ID0gJCgnLmJyb3dzZXItZXJyb3ItY29udGVudCcpO1xuXG5cdFx0Y29uc3QgZXJyb3JJY29uID0gJCgnLmJyb3dzZXItZXJyb3ItaWNvbicpO1xuXHRcdGVycm9ySWNvbi5jbGFzc0xpc3QudG9nZ2xlKCdjZXJ0LWVycm9yJywgaXNDZXJ0RXJyb3IpO1xuXHRcdGVycm9ySWNvbi5hcHBlbmRDaGlsZChyZW5kZXJJY29uKGlzQ2VydEVycm9yID8gQ29kaWNvbi53b3Jrc3BhY2VVbnRydXN0ZWQgOiBDb2RpY29uLmdsb2JlKSk7XG5cblx0XHRjb25zdCBlcnJvclRpdGxlID0gJCgnLmJyb3dzZXItZXJyb3ItdGl0bGUnKTtcblx0XHRlcnJvclRpdGxlLnRleHRDb250ZW50ID0gaXNDZXJ0RXJyb3Jcblx0XHRcdD8gbG9jYWxpemUoJ2Jyb3dzZXIuY2VydEVycm9yTGFiZWwnLCBcIkNlcnRpZmljYXRlIEVycm9yXCIpXG5cdFx0XHQ6IGxvY2FsaXplKCdicm93c2VyLmxvYWRFcnJvckxhYmVsJywgXCJGYWlsZWQgdG8gTG9hZCBQYWdlXCIpO1xuXG5cdFx0Y29uc3QgZXJyb3JNZXNzYWdlID0gJCgnLmJyb3dzZXItZXJyb3ItZGV0YWlsJyk7XG5cdFx0Y29uc3QgZXJyb3JUZXh0ID0gJCgnc3BhbicpO1xuXHRcdGVycm9yVGV4dC50ZXh0Q29udGVudCA9IGlzQ2VydEVycm9yXG5cdFx0XHQ/IGxvY2FsaXplKCdicm93c2VyLmNlcnRFcnJvckRlc2NyaXB0aW9uJywgXCJUaGlzIHNpdGUncyBzZWN1cml0eSBjZXJ0aWZpY2F0ZSBjb3VsZCBub3QgYmUgdmVyaWZpZWQuXCIpXG5cdFx0XHQ6IGAke2Vycm9yLmVycm9yRGVzY3JpcHRpb259ICgke2Vycm9yLmVycm9yQ29kZX0pYDtcblx0XHRlcnJvck1lc3NhZ2UuYXBwZW5kQ2hpbGQoZXJyb3JUZXh0KTtcblxuXHRcdC8vIFNob3cgY2VydCBlcnJvciBuYW1lIGJlbG93IGRlc2NyaXB0aW9uLCBhYm92ZSBVUkxcblx0XHRpZiAoZXJyb3IuY2VydGlmaWNhdGVFcnJvcikge1xuXHRcdFx0Y29uc3QgZXh0cmFXYXJuaW5nID0gJCgnYi5icm93c2VyLWVycm9yLWRldGFpbCcpO1xuXHRcdFx0ZXh0cmFXYXJuaW5nLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2Jyb3dzZXIuY2VydEVycm9yRXh0cmFXYXJuaW5nJywgXCIgWW91ciBjb25uZWN0aW9uIGlzIG5vdCBwcml2YXRlLlwiKTtcblx0XHRcdGVycm9yTWVzc2FnZS5hcHBlbmRDaGlsZChleHRyYVdhcm5pbmcpO1xuXHRcdH1cblxuXHRcdC8vIEZhaWx1cmVzIHRvIGNvbm5lY3QgdmlhIHJlbW90ZSBwcm94eSBjYW4gc3VyZmFjZSBhcyB1bnVzdWFsIGVycm9ycy5cblx0XHQvLyBXZSBhZGQgYSByZWFkYWJsZSBsYWJlbCBpbiB0aGVzZSBjYXNlcyBhcyBhIGhpbnQgdG8gdGhlIHVzZXIuXG5cdFx0aWYgKHRoaXMuZWRpdG9yLm1vZGVsPy5pc1JlbW90ZVNlc3Npb24pIHtcblx0XHRcdGNvbnN0IHJlbW90ZVdhcm5pbmcgPSBlcnJvci5lcnJvckNvZGUgPT09IC0xMTEgfHwgZXJyb3IuZXJyb3JDb2RlID09PSAtMzI0XG5cdFx0XHRcdD8gbG9jYWxpemUoJ2Jyb3dzZXIucmVtb3RlRXJyb3JFeHRyYVdhcm5pbmcnLCBcIlRoaXMgdXN1YWxseSBtZWFucyB0aGUgaG9zdCBjb3VsZCBub3QgYmUgZm91bmQuXFxuRW5zdXJlIHRoZSBVUkwgaXMgY29ycmVjdCBhbmQgdGhlIHNlcnZlciBpcyBhY2Nlc3NpYmxlIGZyb20gdGhlIHJlbW90ZSBtYWNoaW5lLlwiKVxuXHRcdFx0XHQ6ICcnO1xuXHRcdFx0aWYgKHJlbW90ZVdhcm5pbmcpIHtcblx0XHRcdFx0Y29uc3QgcmVtb3RlV2FybmluZ0VsID0gJCgnLmJyb3dzZXItZXJyb3ItZGV0YWlsLmhpbnQnKTtcblx0XHRcdFx0cmVtb3RlV2FybmluZ0VsLnRleHRDb250ZW50ID0gcmVtb3RlV2FybmluZztcblx0XHRcdFx0ZXJyb3JNZXNzYWdlLmFwcGVuZENoaWxkKHJlbW90ZVdhcm5pbmdFbCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXJyb3JVcmwgPSAkKCcuYnJvd3Nlci1lcnJvci1kZXRhaWwnKTtcblx0XHRjb25zdCB1cmxMYWJlbCA9ICQoJ3N0cm9uZycpO1xuXHRcdHVybExhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2Jyb3dzZXIuZXJyb3JVcmxMYWJlbCcsIFwiVVJMOlwiKTtcblx0XHRjb25zdCB1cmxWYWx1ZSA9ICQoJ2NvZGUnKTtcblx0XHR1cmxWYWx1ZS50ZXh0Q29udGVudCA9IGVycm9yLnVybDtcblx0XHRlcnJvclVybC5hcHBlbmRDaGlsZCh1cmxMYWJlbCk7XG5cdFx0ZXJyb3JVcmwuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoJyAnKSk7XG5cdFx0ZXJyb3JVcmwuYXBwZW5kQ2hpbGQodXJsVmFsdWUpO1xuXG5cdFx0ZXJyb3JDb250ZW50LmFwcGVuZENoaWxkKGVycm9ySWNvbik7XG5cdFx0ZXJyb3JDb250ZW50LmFwcGVuZENoaWxkKGVycm9yVGl0bGUpO1xuXHRcdGVycm9yQ29udGVudC5hcHBlbmRDaGlsZChlcnJvck1lc3NhZ2UpO1xuXHRcdGVycm9yQ29udGVudC5hcHBlbmRDaGlsZChlcnJvclVybCk7XG5cblx0XHRpZiAoZXJyb3IuY2VydGlmaWNhdGVFcnJvcikge1xuXHRcdFx0ZXJyb3JDb250ZW50LmFwcGVuZENoaWxkKHRoaXMuX3JlbmRlckNlcnREZXRhaWxzKGVycm9yLmNlcnRpZmljYXRlRXJyb3IpKTtcblx0XHRcdGVycm9yQ29udGVudC5hcHBlbmRDaGlsZCh0aGlzLl9yZW5kZXJDZXJ0QWN0aW9ucyhlcnJvci5jZXJ0aWZpY2F0ZUVycm9yKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVycm9yQ29udGVudDtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlckNlcnREZXRhaWxzKGNlcnRFcnJvcjogSUJyb3dzZXJWaWV3Q2VydGlmaWNhdGVFcnJvcik6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCBjZXJ0RGV0YWlsc1RhYmxlID0gJCgnLmJyb3dzZXItY2VydC1kZXRhaWxzLXRhYmxlJyk7XG5cblx0XHRjb25zdCBoZWFkaW5nID0gJCgnLmJyb3dzZXItY2VydC1kZXRhaWxzLWhlYWRpbmcnKTtcblx0XHRoZWFkaW5nLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2Jyb3dzZXIuY2VydERldGFpbHNIZWFkaW5nJywgXCJDZXJ0aWZpY2F0ZSBEZXRhaWxzXCIpO1xuXHRcdGNlcnREZXRhaWxzVGFibGUuYXBwZW5kQ2hpbGQoaGVhZGluZyk7XG5cblx0XHRjb25zdCBhZGRSb3cgPSAobGFiZWw6IHN0cmluZywgdmFsdWU6IHN0cmluZykgPT4ge1xuXHRcdFx0Y29uc3Qgcm93ID0gJCgnLmJyb3dzZXItY2VydC1kZXRhaWxzLXJvdycpO1xuXHRcdFx0Y29uc3QgbGFiZWxFbCA9ICQoJy5icm93c2VyLWNlcnQtZGV0YWlscy1sYWJlbCcpO1xuXHRcdFx0bGFiZWxFbC50ZXh0Q29udGVudCA9IGxhYmVsO1xuXHRcdFx0Y29uc3QgdmFsdWVFbCA9ICQoJy5icm93c2VyLWNlcnQtZGV0YWlscy12YWx1ZScpO1xuXHRcdFx0dmFsdWVFbC50ZXh0Q29udGVudCA9IHZhbHVlO1xuXHRcdFx0cm93LmFwcGVuZENoaWxkKGxhYmVsRWwpO1xuXHRcdFx0cm93LmFwcGVuZENoaWxkKHZhbHVlRWwpO1xuXHRcdFx0Y2VydERldGFpbHNUYWJsZS5hcHBlbmRDaGlsZChyb3cpO1xuXHRcdH07XG5cblx0XHRhZGRSb3cobG9jYWxpemUoJ2Jyb3dzZXIuY2VydEVycm9yJywgXCJFcnJvclwiKSwgY2VydEVycm9yLmVycm9yKTtcblx0XHRhZGRSb3cobG9jYWxpemUoJ2Jyb3dzZXIuY2VydElzc3VlcicsIFwiSXNzdWVyXCIpLCBjZXJ0RXJyb3IuaXNzdWVyTmFtZSk7XG5cdFx0YWRkUm93KGxvY2FsaXplKCdicm93c2VyLmNlcnRTdWJqZWN0JywgXCJTdWJqZWN0XCIpLCBjZXJ0RXJyb3Iuc3ViamVjdE5hbWUpO1xuXG5cdFx0Y29uc3QgZm9ybWF0RGF0ZSA9IChlcG9jaDogbnVtYmVyKSA9PiBuZXcgRGF0ZShlcG9jaCAqIDEwMDApLnRvTG9jYWxlRGF0ZVN0cmluZygpO1xuXHRcdGFkZFJvdyhcblx0XHRcdGxvY2FsaXplKCdicm93c2VyLmNlcnRWYWxpZCcsIFwiVmFsaWRcIiksXG5cdFx0XHRgJHtmb3JtYXREYXRlKGNlcnRFcnJvci52YWxpZFN0YXJ0KX0gLSAke2Zvcm1hdERhdGUoY2VydEVycm9yLnZhbGlkRXhwaXJ5KX1gXG5cdFx0KTtcblxuXHRcdGFkZFJvdyhsb2NhbGl6ZSgnYnJvd3Nlci5jZXJ0RmluZ2VycHJpbnQnLCBcIkZpbmdlcnByaW50XCIpLCBjZXJ0RXJyb3IuZmluZ2VycHJpbnQpO1xuXG5cdFx0cmV0dXJuIGNlcnREZXRhaWxzVGFibGU7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJDZXJ0QWN0aW9ucyhjZXJ0RXJyb3I6IElCcm93c2VyVmlld0NlcnRpZmljYXRlRXJyb3IpOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3QgYWN0aW9uQ29udGFpbmVyID0gJCgnLmJyb3dzZXItY2VydC1hY3Rpb24nKTtcblx0XHRhY3Rpb25Db250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgncmV2ZXJzZScsIGlzTWFjaW50b3NoIHx8IGlzTGludXgpO1xuXG5cdFx0Y29uc3QgY2FuR29CYWNrID0gdGhpcy5lZGl0b3IubW9kZWw/LmNhbkdvQmFjayA/PyBmYWxzZTtcblx0XHRjb25zdCBidXR0b25CYXIgPSBuZXcgQnV0dG9uQmFyKGFjdGlvbkNvbnRhaW5lcik7XG5cdFx0dGhpcy5fY2VydEFjdGlvbkJ1dHRvbi52YWx1ZSA9IGJ1dHRvbkJhcjtcblxuXHRcdGNvbnN0IHByaW1hcnlCdXR0b24gPSBidXR0b25CYXIuYWRkQnV0dG9uKHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcyB9KTtcblx0XHRwcmltYXJ5QnV0dG9uLmxhYmVsID0gY2FuR29CYWNrXG5cdFx0XHQ/IGxvY2FsaXplKCdicm93c2VyLmNlcnRHb0JhY2snLCBcIkdvIEJhY2tcIilcblx0XHRcdDogbG9jYWxpemUoJ2Jyb3dzZXIuY2VydENsb3NlVGFiJywgXCJDbG9zZSBUYWJcIik7XG5cdFx0cHJpbWFyeUJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdGlmIChjYW5Hb0JhY2spIHtcblx0XHRcdFx0dGhpcy5lZGl0b3IubW9kZWw/LmdvQmFjaygpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5lZGl0b3IuY2xvc2VUYWIoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHNlY29uZGFyeUJ1dHRvbiA9IGJ1dHRvbkJhci5hZGRCdXR0b24oeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBzZWNvbmRhcnk6IHRydWUgfSk7XG5cdFx0c2Vjb25kYXJ5QnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ2Jyb3dzZXIuY2VydFByb2NlZWQnLCBcIlByb2NlZWQgYW55d2F5ICh1bnNhZmUpXCIpO1xuXHRcdHNlY29uZGFyeUJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdHRoaXMuZWRpdG9yLm1vZGVsPy50cnVzdENlcnRpZmljYXRlKGNlcnRFcnJvci5ob3N0LCBjZXJ0RXJyb3IuZmluZ2VycHJpbnQpO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGFjdGlvbkNvbnRhaW5lcjtcblx0fVxufVxuXG4vKipcbiAqIFVSTCByZW5kZXJlciB0aGF0LCB3aGVuIGEgY2VydGlmaWNhdGUgZXJyb3IgaXMgYWN0aXZlLCBzcGxpdHMgYW4gYGh0dHBzOmBcbiAqIHByZWZpeCBpbnRvIGl0cyBvd24gc3BhbiAoc3R5bGVkIHdpdGggYSByZWQgc3RyaWtldGhyb3VnaCB2aWEgQ1NTKS4gT3RoZXJcbiAqIFVSTHMgKGFuZCBub24tY2VydC1lcnJvciBzdGF0ZXMpIGZhbGwgdGhyb3VnaCB0byBwbGFpbiB0ZXh0LlxuICovXG5jbGFzcyBDZXJ0VXJsUmVuZGVyZXIgaW1wbGVtZW50cyBJQnJvd3NlclVybFJlbmRlcmVyIHtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgSFRUUFNfUFJFRklYID0gJ2h0dHBzOic7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIF9oYXNDZXJ0RXJyb3IgPSBmYWxzZTtcblxuXHRzZXRDZXJ0aWZpY2F0ZUVycm9yKGNlcnRFcnJvcjogSUJyb3dzZXJWaWV3Q2VydGlmaWNhdGVFcnJvciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IG5leHQgPSAhIWNlcnRFcnJvcjtcblx0XHRpZiAodGhpcy5faGFzQ2VydEVycm9yID09PSBuZXh0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2hhc0NlcnRFcnJvciA9IG5leHQ7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpO1xuXHR9XG5cblx0cmVuZGVyKHVybDogc3RyaW5nLCBjb250YWluZXI6IEhUTUxFbGVtZW50KTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl9oYXNDZXJ0RXJyb3IgfHwgIXVybC5zdGFydHNXaXRoKENlcnRVcmxSZW5kZXJlci5IVFRQU19QUkVGSVgpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvdG9jb2wgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cdFx0cHJvdG9jb2wuY2xhc3NOYW1lID0gJ2Jyb3dzZXItdXJsLWRpc3BsYXktcHJvdG9jb2wtYmFkJztcblx0XHRwcm90b2NvbC50ZXh0Q29udGVudCA9IENlcnRVcmxSZW5kZXJlci5IVFRQU19QUkVGSVg7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHByb3RvY29sKTtcblxuXHRcdGNvbnN0IHJlc3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cdFx0cmVzdC50ZXh0Q29udGVudCA9IHVybC5zbGljZShDZXJ0VXJsUmVuZGVyZXIuSFRUUFNfUFJFRklYLmxlbmd0aCk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHJlc3QpO1xuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vKipcbiAqIEluZGljYXRvciBidXR0b24gaW5zaWRlIHRoZSBVUkwgYmFyIHRoYXQgc3VyZmFjZXMgc2l0ZSBzZWN1cml0eSBpbmZvcm1hdGlvblxuICogKGUuZy4gY2VydGlmaWNhdGUgZXJyb3JzKS4gQ2xpY2svRW50ZXIgc2hvd3MgYSBob3ZlciBwb3BvdmVyIHdpdGggZGV0YWlsc1xuICogYW5kIChpZiB0aGUgdXNlciBoYXMgcHJldmlvdXNseSB0cnVzdGVkIHRoZSBjZXJ0KSBhIHJldm9rZSBhY3Rpb24uXG4gKi9cbmNsYXNzIFNpdGVJbmZvV2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5kaWNhdG9yOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfY2VydEVycm9yOiBJQnJvd3NlclZpZXdDZXJ0aWZpY2F0ZUVycm9yIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHBhcmVudDogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBCcm93c2VyRWRpdG9yLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2NvbnRhaW5lciA9ICQoJy5icm93c2VyLXNpdGUtaW5mby1jb250YWluZXInKTtcblx0XHR0aGlzLl9jb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblxuXHRcdHRoaXMuX2luZGljYXRvciA9ICQoJy5icm93c2VyLXNpdGUtaW5mby1pbmRpY2F0b3InKTtcblx0XHR0aGlzLl9pbmRpY2F0b3IudGFiSW5kZXggPSAwO1xuXHRcdHRoaXMuX2luZGljYXRvci5yb2xlID0gJ2J1dHRvbic7XG5cdFx0dGhpcy5faW5kaWNhdG9yLmFyaWFMYWJlbCA9IGxvY2FsaXplKCdicm93c2VyLm5vdFNlY3VyZScsIFwiTm90IFNlY3VyZVwiKTtcblx0XHR0aGlzLl9pbmRpY2F0b3IuYXBwZW5kQ2hpbGQocmVuZGVySWNvbihDb2RpY29uLndvcmtzcGFjZVVudHJ1c3RlZCkpO1xuXHRcdHRoaXMuX2NvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLl9pbmRpY2F0b3IpO1xuXG5cdFx0cGFyZW50LmFwcGVuZENoaWxkKHRoaXMuX2NvbnRhaW5lcik7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5faW5kaWNhdG9yLCBFdmVudFR5cGUuQ0xJQ0ssICgpID0+IHRoaXMuX3Nob3dIb3ZlcigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2luZGljYXRvciwgRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0aWYgKGUua2V5ID09PSAnRW50ZXInIHx8IGUua2V5ID09PSAnICcpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHR0aGlzLl9zaG93SG92ZXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvKiogVXBkYXRlIHZpc2liaWxpdHkgYW5kIHN0YXRlIGZyb20gYSBjZXJ0aWZpY2F0ZSBlcnJvciAob3IgbGFjayB0aGVyZW9mKS4gKi9cblx0c2V0Q2VydGlmaWNhdGVFcnJvcihjZXJ0RXJyb3I6IElCcm93c2VyVmlld0NlcnRpZmljYXRlRXJyb3IgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9jZXJ0RXJyb3IgPSBjZXJ0RXJyb3I7XG5cdFx0dGhpcy5fY29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSBjZXJ0RXJyb3IgPyAnJyA6ICdub25lJztcblx0fVxuXG5cdHByaXZhdGUgX3Nob3dIb3ZlcigpOiB2b2lkIHtcblx0XHRjb25zdCBjZXJ0RXJyb3IgPSB0aGlzLl9jZXJ0RXJyb3I7XG5cdFx0aWYgKCFjZXJ0RXJyb3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb250ZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0Y29udGVudC5jbGFzc0xpc3QuYWRkKCdicm93c2VyLXNpdGUtaW5mby1ob3Zlci1jb250ZW50Jyk7XG5cblx0XHRjb25zdCBoZWFkaW5nID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0aGVhZGluZy5jbGFzc0xpc3QuYWRkKCdicm93c2VyLXNpdGUtaW5mby1ob3Zlci1oZWFkaW5nJyk7XG5cdFx0aGVhZGluZy50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdicm93c2VyLmNlcnRIb3ZlckhlYWRpbmcnLCBcIkNlcnRpZmljYXRlIE5vdCBUcnVzdGVkXCIpO1xuXHRcdGNvbnRlbnQuYXBwZW5kQ2hpbGQoaGVhZGluZyk7XG5cblx0XHRjb25zdCBkZXRhaWwxID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0ZGV0YWlsMS5jbGFzc0xpc3QuYWRkKCdicm93c2VyLXNpdGUtaW5mby1ob3Zlci1kZXRhaWwnKTtcblx0XHRkZXRhaWwxLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2Jyb3dzZXIuY2VydEhvdmVyRGV0YWlsMScsIFwiWW91ciBjb25uZWN0aW9uIHRvIHRoaXMgc2l0ZSBpcyBub3Qgc2VjdXJlLlwiKTtcblx0XHRjb250ZW50LmFwcGVuZENoaWxkKGRldGFpbDEpO1xuXG5cdFx0aWYgKGNlcnRFcnJvci5oYXNUcnVzdGVkRXhjZXB0aW9uKSB7XG5cdFx0XHRjb25zdCBkZXRhaWwyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRkZXRhaWwyLmNsYXNzTGlzdC5hZGQoJ2Jyb3dzZXItc2l0ZS1pbmZvLWhvdmVyLWRldGFpbCcpO1xuXHRcdFx0ZGV0YWlsMi50ZXh0Q29udGVudCA9IGxvY2FsaXplKFxuXHRcdFx0XHQnYnJvd3Nlci5jZXJ0SG92ZXJEZXRhaWwyJyxcblx0XHRcdFx0XCJZb3UgcHJldmlvdXNseSBjaG9zZSB0byBwcm9jZWVkIHRvICd7MH0nIGRlc3BpdGUgYSBjZXJ0aWZpY2F0ZSBlcnJvciAoezF9KS5cIixcblx0XHRcdFx0Y2VydEVycm9yLmhvc3QsXG5cdFx0XHRcdGNlcnRFcnJvci5lcnJvclxuXHRcdFx0KTtcblx0XHRcdGNvbnRlbnQuYXBwZW5kQ2hpbGQoZGV0YWlsMik7XG5cblx0XHRcdGNvbnN0IHJldm9rZUxpbmsgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG5cdFx0XHRyZXZva2VMaW5rLmNsYXNzTGlzdC5hZGQoJ2Jyb3dzZXItc2l0ZS1pbmZvLWhvdmVyLXJldm9rZScpO1xuXHRcdFx0cmV2b2tlTGluay50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdicm93c2VyLmNlcnRSZXZva2UnLCBcIlJldm9rZSBhbmQgQ2xvc2VcIik7XG5cdFx0XHRyZXZva2VMaW5rLnJvbGUgPSAnYnV0dG9uJztcblx0XHRcdHJldm9rZUxpbmsudGFiSW5kZXggPSAwO1xuXHRcdFx0cmV2b2tlTGluay5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcblx0XHRcdFx0aG92ZXI/LmRpc3Bvc2UoKTtcblx0XHRcdFx0Ly8gVGhpcyBhdXRvbWF0aWNhbGx5IGNsb3NlcyB0aGUgYnJvd3NlciB2aWV3LlxuXHRcdFx0XHR0aGlzLl9lZGl0b3IubW9kZWw/LnVudHJ1c3RDZXJ0aWZpY2F0ZShjZXJ0RXJyb3IuaG9zdCwgY2VydEVycm9yLmZpbmdlcnByaW50KTtcblx0XHRcdH0pO1xuXHRcdFx0cmV2b2tlTGluay5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgKGUpID0+IHtcblx0XHRcdFx0aWYgKGUua2V5ID09PSAnRW50ZXInIHx8IGUua2V5ID09PSAnICcpIHtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0aG92ZXI/LmRpc3Bvc2UoKTtcblx0XHRcdFx0XHQvLyBUaGlzIGF1dG9tYXRpY2FsbHkgY2xvc2VzIHRoZSBicm93c2VyIHZpZXcuXG5cdFx0XHRcdFx0dGhpcy5fZWRpdG9yLm1vZGVsPy51bnRydXN0Q2VydGlmaWNhdGUoY2VydEVycm9yLmhvc3QsIGNlcnRFcnJvci5maW5nZXJwcmludCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0Y29udGVudC5hcHBlbmRDaGlsZChyZXZva2VMaW5rKTtcblx0XHR9XG5cblx0XHRjb25zdCBob3ZlciA9IHRoaXMuX2hvdmVyU2VydmljZS5zaG93SW5zdGFudEhvdmVyKHtcblx0XHRcdGNvbnRlbnQsXG5cdFx0XHR0YXJnZXQ6IHRoaXMuX2luZGljYXRvcixcblx0XHRcdGNvbnRhaW5lcjogdGhpcy5fY29udGFpbmVyLFxuXHRcdFx0cG9zaXRpb246IHsgaG92ZXJQb3NpdGlvbjogSG92ZXJQb3NpdGlvbi5CRUxPVyB9LFxuXHRcdFx0cGVyc2lzdGVuY2U6IHsgc3RpY2t5OiB0cnVlIH1cblx0XHR9LCB0cnVlKTtcblx0fVxufVxuXG5Ccm93c2VyRWRpdG9yLnJlZ2lzdGVyQ29udHJpYnV0aW9uKEJyb3dz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
