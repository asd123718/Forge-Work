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
import { addDisposableListener, clearNode, EventType, h } from "../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { clamp } from "../../../../base/common/numbers.js";
import { isMacintosh } from "../../../../base/common/platform.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { localize } from "../../../../nls.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { IWebviewService } from "../../webview/browser/webview.js";
import { ImageCarouselEditorInput } from "./imageCarouselEditorInput.js";
import { isVideoMimeType } from "./imageCarouselTypes.js";
const SCALE_PINCH_FACTOR = 0.075;
const MAX_SCALE = 20;
const MIN_SCALE = 0.1;
const PIXELATION_THRESHOLD = 3;
const ZOOM_LEVELS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.5, 2, 3, 5, 7, 10, 15, 20];
let ImageCarouselEditor = class extends EditorPane {
  constructor(group, telemetryService, themeService, storageService, _fileService, _webviewService) {
    super(ImageCarouselEditor.ID, group, telemetryService, themeService, storageService);
    this._fileService = _fileService;
    this._webviewService = _webviewService;
    this._currentIndex = 0;
    this._zoomScale = "fit";
    this._sections = [];
    this._flatImages = [];
    this._contentDisposables = this._register(new DisposableStore());
    this._imageDisposables = this._register(new DisposableStore());
    this._blobUrlCache = /* @__PURE__ */ new Map();
    this._thumbnailElements = [];
  }
  createEditor(parent) {
    this._container = h("div.image-carousel-editor").root;
    parent.appendChild(this._container);
  }
  async setInput(input, options, context, token) {
    await super.setInput(input, options, context, token);
    this._sections = input.collection.sections;
    this._flatImages = [];
    for (let s = 0; s < this._sections.length; s++) {
      for (let i = 0; i < this._sections[s].images.length; i++) {
        this._flatImages.push({ sectionIndex: s, imageIndexInSection: i, image: this._sections[s].images[i] });
      }
    }
    this._currentIndex = Math.min(input.startIndex, Math.max(0, this._flatImages.length - 1));
    this.buildSlideshow();
  }
  clearInput() {
    this._videoWebview?.dispose();
    this._videoWebview = void 0;
    this._contentDisposables.clear();
    this._imageDisposables.clear();
    this._revokeCachedBlobUrls();
    this._zoomScale = "fit";
    if (this._container) {
      clearNode(this._container);
    }
    this._elements = void 0;
    this._thumbnailElements = [];
    super.clearInput();
  }
  _isCurrentVideo() {
    const entry = this._flatImages[this._currentIndex];
    return !!entry && isVideoMimeType(entry.image.mimeType);
  }
  /**
   * Build the full DOM skeleton. Called once per setInput.
   */
  buildSlideshow() {
    if (!this._container) {
      return;
    }
    this._contentDisposables.clear();
    this._imageDisposables.clear();
    this._revokeCachedBlobUrls();
    clearNode(this._container);
    if (this._flatImages.length === 0) {
      const empty = h("div.empty-message");
      empty.root.textContent = localize("imageCarousel.noImages", "No images to display");
      this._container.appendChild(empty.root);
      return;
    }
    const elements = h("div.slideshow-container", [
      h("div.image-area@imageArea", [
        h("div.main-image-container@mainImageContainer", [
          h("img.main-image@mainImage"),
          h("div.video-container@videoContainer")
        ]),
        h("button.nav-arrow.prev-arrow@prevBtn", { ariaLabel: localize("imageCarousel.previousImage", "Previous image") }, [
          h("span.codicon.codicon-chevron-left", { ariaHidden: "true" })
        ]),
        h("button.nav-arrow.next-arrow@nextBtn", { ariaLabel: localize("imageCarousel.nextImage", "Next image") }, [
          h("span.codicon.codicon-chevron-right", { ariaHidden: "true" })
        ])
      ]),
      h("div.bottom-bar@bottomBar", [
        h("div.image-info-bar", [
          h("span.caption-text@captionText"),
          h("span.caption-separator@captionSeparator"),
          h("span.image-counter@counter")
        ]),
        h("div.sections-container@sectionsContainer"),
        h("span.sr-only@ariaStatus")
      ])
    ]);
    elements.root.setAttribute("role", "group");
    elements.root.setAttribute("aria-label", localize("imageCarousel.ariaLabel", "Images Preview"));
    elements.captionSeparator.setAttribute("aria-hidden", "true");
    elements.ariaStatus.setAttribute("aria-live", "polite");
    elements.ariaStatus.setAttribute("aria-atomic", "true");
    elements.sectionsContainer.setAttribute("role", "group");
    elements.sectionsContainer.setAttribute("aria-label", localize("imageCarousel.thumbnails", "Image thumbnails"));
    this._elements = {
      root: elements.root,
      imageArea: elements.imageArea,
      mainImageContainer: elements.mainImageContainer,
      mainImage: elements.mainImage,
      videoContainer: elements.videoContainer,
      captionText: elements.captionText,
      captionSeparator: elements.captionSeparator,
      counter: elements.counter,
      ariaStatus: elements.ariaStatus,
      prevBtn: elements.prevBtn,
      nextBtn: elements.nextBtn,
      sectionsContainer: elements.sectionsContainer
    };
    this._elements.mainImage.classList.add("scale-to-fit");
    this._elements.mainImage.alt = "";
    this._elements.videoContainer.style.display = "none";
    this._contentDisposables.add(addDisposableListener(this._elements.prevBtn, "click", () => {
      if (this._currentIndex > 0) {
        this._currentIndex--;
        this.updateCurrentImage();
      }
    }));
    this._contentDisposables.add(addDisposableListener(this._elements.nextBtn, "click", () => {
      if (this._currentIndex < this._flatImages.length - 1) {
        this._currentIndex++;
        this.updateCurrentImage();
      }
    }));
    this._contentDisposables.add(addDisposableListener(elements.root, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.keyCode === KeyCode.LeftArrow) {
        this.previous();
        event.stopPropagation();
        event.preventDefault();
      } else if (event.keyCode === KeyCode.RightArrow) {
        this.next();
        event.stopPropagation();
        event.preventDefault();
      }
    }));
    elements.root.tabIndex = 0;
    this._contentDisposables.add(addDisposableListener(this._elements.imageArea, EventType.MOUSE_WHEEL, (e) => {
      if (this._isCurrentVideo()) {
        return;
      }
      const isZoomModifier = isMacintosh ? e.altKey : e.ctrlKey;
      if (!isZoomModifier && !e.ctrlKey) {
        return;
      }
      e.preventDefault();
      if (e.deltaY === 0) {
        return;
      }
      if (this._zoomScale === "fit") {
        this._initZoomFromFit();
      }
      const delta = e.deltaY > 0 ? 1 : -1;
      this._applyZoom(this._zoomScale * (1 - delta * SCALE_PINCH_FACTOR));
    }, { passive: false }));
    let clickCtrlPressed = false;
    let clickAltPressed = false;
    this._contentDisposables.add(addDisposableListener(this._elements.mainImageContainer, EventType.MOUSE_DOWN, (e) => {
      if (e.button !== 0) {
        return;
      }
      clickCtrlPressed = e.ctrlKey;
      clickAltPressed = e.altKey;
    }));
    this._contentDisposables.add(addDisposableListener(this._elements.mainImageContainer, EventType.CLICK, (e) => {
      if (e.button !== 0 || this._isCurrentVideo()) {
        return;
      }
      const isZoomOut = isMacintosh ? clickAltPressed : clickCtrlPressed;
      if (isZoomOut) {
        this._zoomOut();
      } else {
        this._zoomIn();
      }
    }));
    const updateZoomCursor = (e) => {
      const isZoomOut = isMacintosh ? e.altKey : e.ctrlKey;
      this._elements.mainImageContainer.classList.toggle("zoom-out", isZoomOut);
    };
    this._contentDisposables.add(addDisposableListener(elements.root, EventType.KEY_DOWN, updateZoomCursor));
    this._contentDisposables.add(addDisposableListener(elements.root, EventType.KEY_UP, updateZoomCursor));
    this._thumbnailElements = [];
    let flatIndex = 0;
    for (let s = 0; s < this._sections.length; s++) {
      const section = this._sections[s];
      if (s > 0 && this._sections.length > 1) {
        const separator = h("div.thumbnail-separator").root;
        separator.setAttribute("aria-hidden", "true");
        this._elements.sectionsContainer.appendChild(separator);
      }
      for (let i = 0; i < section.images.length; i++) {
        const image = section.images[i];
        const currentFlatIndex = flatIndex;
        const isItemVideo = isVideoMimeType(image.mimeType);
        const btn = document.createElement("button");
        btn.className = isItemVideo ? "thumbnail video-thumbnail" : "thumbnail";
        btn.ariaLabel = isItemVideo ? localize("imageCarousel.thumbnailLabelVideo", "Video {0} of {1}", currentFlatIndex + 1, this._flatImages.length) : localize("imageCarousel.thumbnailLabelImage", "Image {0} of {1}", currentFlatIndex + 1, this._flatImages.length);
        if (isItemVideo) {
          const icon = h("span.codicon.codicon-play.thumbnail-play-icon");
          icon.root.setAttribute("aria-hidden", "true");
          btn.appendChild(icon.root);
        } else {
          const img = document.createElement("img");
          img.className = "thumbnail-image";
          img.alt = image.name;
          const thumbnailDisposables = this._contentDisposables.add(new DisposableStore());
          const markBroken = () => {
            if (thumbnailDisposables.isDisposed) {
              return;
            }
            if (!btn.classList.contains("broken")) {
              btn.classList.add("broken");
              img.removeAttribute("src");
              img.alt = "";
              img.remove();
              const fallback = h("span.codicon.codicon-warning.thumbnail-broken-icon");
              fallback.root.setAttribute("aria-hidden", "true");
              btn.appendChild(fallback.root);
            }
          };
          this._loadBlobUrl(image).then((url) => {
            if (thumbnailDisposables.isDisposed) {
              return;
            }
            if (url) {
              const preloader = new Image();
              thumbnailDisposables.add(addDisposableListener(preloader, "load", () => {
                if (btn.classList.contains("broken")) {
                  return;
                }
                img.src = url;
                if (!img.parentElement) {
                  btn.appendChild(img);
                }
              }));
              thumbnailDisposables.add(addDisposableListener(preloader, "error", () => {
                markBroken();
              }));
              preloader.src = url;
            } else {
              markBroken();
            }
          }, () => {
            markBroken();
          });
          thumbnailDisposables.add(addDisposableListener(img, "error", () => {
            markBroken();
          }));
        }
        this._contentDisposables.add(addDisposableListener(btn, "click", () => {
          this._currentIndex = currentFlatIndex;
          this.updateCurrentImage();
        }));
        this._elements.sectionsContainer.appendChild(btn);
        this._thumbnailElements.push(btn);
        flatIndex++;
      }
    }
    this._container.appendChild(elements.root);
    this.updateCurrentImage();
  }
  /**
   * Update only the changing parts: main image src, caption, button states, thumbnail selection.
   * No DOM teardown/rebuild — eliminates the blank flash.
   */
  async updateCurrentImage() {
    if (!this._elements) {
      return;
    }
    const navigationIndex = this._currentIndex;
    const entry = this._flatImages[navigationIndex];
    const currentImage = entry.image;
    const isVideo = isVideoMimeType(currentImage.mimeType);
    if (isVideo) {
      this._elements.mainImage.style.display = "none";
      this._elements.videoContainer.style.display = "";
      this._elements.mainImageContainer.classList.remove("zoomed");
      this._elements.mainImageContainer.style.cursor = "default";
      const rawData = await this._loadRawData(currentImage);
      if (this._currentIndex !== navigationIndex) {
        return;
      }
      const nonce = generateUuid();
      const videoHtml = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src blob: data:; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}';">
<style nonce="${nonce}">html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:transparent}
video{width:100%;height:100%;object-fit:contain;outline:none}</style>
</head><body>
<video id="v" controls></video>
<script nonce="${nonce}">
window.addEventListener("message",function(e){var m=e.data;if(m.type==="loadVideo"){var b=new Blob([m.data],{type:m.mimeType});document.getElementById("v").src=URL.createObjectURL(b);}});
<\/script>
</body></html>`;
      let webview;
      if (!this._videoWebview) {
        webview = this._contentDisposables.add(this._webviewService.createWebviewElement({
          title: currentImage.name,
          options: { disableServiceWorker: true },
          contentOptions: { allowScripts: true },
          extension: void 0
        }));
        webview.mountTo(this._elements.videoContainer, this.window);
        this._videoWebview = webview;
      } else {
        webview = this._videoWebview;
      }
      webview.setHtml(videoHtml);
      const buffer = rawData.buffer;
      webview.postMessage({ type: "loadVideo", data: buffer, mimeType: currentImage.mimeType }, [buffer]);
    } else {
      this._elements.videoContainer.style.display = "none";
      this._elements.mainImage.style.display = "";
      this._elements.mainImageContainer.style.cursor = "";
      const url = await this._loadBlobUrl(currentImage);
      if (this._currentIndex !== navigationIndex) {
        return;
      }
      const tmp = new Image();
      tmp.src = url;
      tmp.decode().then(() => {
        if (this._currentIndex === navigationIndex && this._elements) {
          this._elements.mainImage.src = url;
          this._elements.mainImage.alt = currentImage.name;
        }
      }, () => {
        if (this._currentIndex === navigationIndex && this._elements) {
          this._elements.mainImage.src = url;
          this._elements.mainImage.alt = currentImage.name;
        }
      });
    }
    this._applyZoom("fit");
    if (currentImage.caption) {
      this._elements.captionText.textContent = currentImage.caption;
      this._elements.captionText.style.display = "";
      this._elements.captionSeparator.style.display = "";
    } else {
      this._elements.captionText.textContent = "";
      this._elements.captionText.style.display = "none";
      this._elements.captionSeparator.style.display = "none";
    }
    this._elements.counter.textContent = localize("imageCarousel.counter", "{0} / {1}", navigationIndex + 1, this._flatImages.length);
    const itemKind = isVideo ? localize("imageCarousel.kindVideo", "Video") : localize("imageCarousel.kindImage", "Image");
    this._elements.ariaStatus.textContent = currentImage.caption ? localize("imageCarousel.statusWithCaption", "{0} {1} of {2}: {3}", itemKind, navigationIndex + 1, this._flatImages.length, currentImage.caption) : localize("imageCarousel.statusWithName", "{0} {1} of {2}: {3}", itemKind, navigationIndex + 1, this._flatImages.length, currentImage.name);
    this._elements.prevBtn.disabled = navigationIndex === 0;
    this._elements.nextBtn.disabled = navigationIndex === this._flatImages.length - 1;
    for (let i = 0; i < this._thumbnailElements.length; i++) {
      const isActive = i === navigationIndex;
      const thumbnail = this._thumbnailElements[i];
      thumbnail.classList.toggle("active", isActive);
      if (isActive) {
        thumbnail.setAttribute("aria-current", "page");
      } else {
        thumbnail.removeAttribute("aria-current");
      }
    }
    const activeThumbnail = this._thumbnailElements[navigationIndex];
    if (activeThumbnail) {
      activeThumbnail.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    if (this.input instanceof ImageCarouselEditorInput) {
      const currentSection = this._sections[entry.sectionIndex];
      this.input.setName(currentSection.title || this.input.collection.title);
    }
    this._preloadAdjacentImages();
  }
  async _loadBlobUrl(image) {
    const cached = this._blobUrlCache.get(image.id);
    if (cached) {
      return cached;
    }
    let buffer;
    if (image.data) {
      buffer = image.data instanceof Uint8Array ? image.data : image.data.buffer;
    } else if (image.uri) {
      const content = await this._fileService.readFile(image.uri);
      buffer = content.value.buffer;
    } else {
      return "";
    }
    const blob = new Blob([buffer], { type: image.mimeType });
    const url = URL.createObjectURL(blob);
    this._blobUrlCache.set(image.id, url);
    return url;
  }
  _revokeCachedBlobUrls() {
    for (const url of this._blobUrlCache.values()) {
      URL.revokeObjectURL(url);
    }
    this._blobUrlCache.clear();
  }
  async _loadRawData(image) {
    if (image.data) {
      return image.data instanceof Uint8Array ? image.data : image.data.buffer;
    } else if (image.uri) {
      const content = await this._fileService.readFile(image.uri);
      return content.value.buffer;
    }
    return new Uint8Array(0);
  }
  _preloadAdjacentImages() {
    for (const idx of [this._currentIndex - 1, this._currentIndex + 1]) {
      if (idx >= 0 && idx < this._flatImages.length) {
        const adjacentImage = this._flatImages[idx].image;
        if (isVideoMimeType(adjacentImage.mimeType)) {
          this._loadRawData(adjacentImage).catch(() => {
          });
        } else {
          this._loadBlobUrl(adjacentImage).then((url) => {
            const img = new Image();
            img.src = url;
            img.decode().catch(() => {
            });
          });
        }
      }
    }
  }
  previous() {
    if (this._currentIndex > 0) {
      this._currentIndex--;
      this.updateCurrentImage();
    }
  }
  next() {
    if (this._currentIndex < this._flatImages.length - 1) {
      this._currentIndex++;
      this.updateCurrentImage();
    }
  }
  /**
   * Compute the current display scale when transitioning from 'fit' to numeric zoom.
   */
  _initZoomFromFit() {
    if (!this._elements) {
      return;
    }
    const img = this._elements.mainImage;
    if (img.naturalWidth > 0) {
      this._zoomScale = img.clientWidth / img.naturalWidth;
    } else {
      this._zoomScale = 1;
    }
  }
  /**
   * Zoom in to the next predefined zoom level.
   */
  _zoomIn() {
    if (this._zoomScale === "fit") {
      this._initZoomFromFit();
    }
    const scale = this._zoomScale;
    let i = 0;
    for (; i < ZOOM_LEVELS.length; ++i) {
      if (ZOOM_LEVELS[i] > scale) {
        break;
      }
    }
    this._applyZoom(ZOOM_LEVELS[i] ?? MAX_SCALE);
  }
  /**
   * Zoom out to the previous predefined zoom level.
   */
  _zoomOut() {
    if (this._zoomScale === "fit") {
      this._initZoomFromFit();
    }
    const scale = this._zoomScale;
    let i = ZOOM_LEVELS.length - 1;
    for (; i >= 0; --i) {
      if (ZOOM_LEVELS[i] < scale) {
        break;
      }
    }
    this._applyZoom(ZOOM_LEVELS[i] ?? MIN_SCALE);
  }
  /**
   * Apply fit-to-container or numeric zoom with scroll-center preservation.
   */
  _applyZoom(newScale) {
    if (!this._elements) {
      return;
    }
    const container = this._elements.mainImageContainer;
    const img = this._elements.mainImage;
    if (newScale === "fit") {
      this._zoomScale = "fit";
      img.classList.add("scale-to-fit");
      img.classList.remove("pixelated");
      img.style.zoom = "";
      const wasZoomed = container.classList.contains("zoomed");
      container.classList.remove("zoomed");
      container.classList.remove("zoom-out");
      if (wasZoomed) {
        container.scrollTo(0, 0);
      }
    } else {
      const scale = clamp(newScale, MIN_SCALE, MAX_SCALE);
      this._zoomScale = scale;
      const dx = container.scrollWidth > 0 ? (container.scrollLeft + container.clientWidth / 2) / container.scrollWidth : 0.5;
      const dy = container.scrollHeight > 0 ? (container.scrollTop + container.clientHeight / 2) / container.scrollHeight : 0.5;
      img.classList.remove("scale-to-fit");
      img.classList.toggle("pixelated", scale >= PIXELATION_THRESHOLD);
      img.style.zoom = String(scale);
      container.classList.add("zoomed");
      const newScrollX = container.scrollWidth * dx - container.clientWidth / 2;
      const newScrollY = container.scrollHeight * dy - container.clientHeight / 2;
      container.scrollTo(newScrollX, newScrollY);
    }
  }
  focus() {
    super.focus();
    this._elements?.root.focus();
  }
  layout(dimension) {
    if (this._container) {
      this._container.style.width = `${dimension.width}px`;
      this._container.style.height = `${dimension.height}px`;
    }
  }
};
ImageCarouselEditor.ID = "workbench.editor.imageCarousel";
ImageCarouselEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IFileService),
  __decorateParam(5, IWebviewService)
], ImageCarouselEditor);
export {
  ImageCarouselEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGltYWdlQ2Fyb3VzZWxcXGJyb3dzZXJcXGltYWdlQ2Fyb3VzZWxFZGl0b3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIGNsZWFyTm9kZSwgRGltZW5zaW9uLCBFdmVudFR5cGUsIGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY2xhbXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9udW1iZXJzLmpzJztcbmltcG9ydCB7IGlzTWFjaW50b3NoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYW5lIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yUGFuZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3BlbkNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXAgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdlYnZpZXdFbGVtZW50LCBJV2Vidmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi93ZWJ2aWV3L2Jyb3dzZXIvd2Vidmlldy5qcyc7XG5pbXBvcnQgeyBJbWFnZUNhcm91c2VsRWRpdG9ySW5wdXQgfSBmcm9tICcuL2ltYWdlQ2Fyb3VzZWxFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJQ2Fyb3VzZWxJbWFnZSwgSUNhcm91c2VsU2VjdGlvbiwgaXNWaWRlb01pbWVUeXBlIH0gZnJvbSAnLi9pbWFnZUNhcm91c2VsVHlwZXMuanMnO1xuXG4vKipcbiAqIEEgZmxhdCBlbnRyeSByZWZlcmVuY2luZyBhIHNwZWNpZmljIGltYWdlIHdpdGhpbiBhIHNlY3Rpb24sIHVzZWRcbiAqIGZvciBnbG9iYWwgaW5kZXgtYmFzZWQgbmF2aWdhdGlvbiBhY3Jvc3MgYWxsIHNlY3Rpb25zLlxuICovXG5pbnRlcmZhY2UgSUZsYXRJbWFnZUVudHJ5IHtcblx0cmVhZG9ubHkgc2VjdGlvbkluZGV4OiBudW1iZXI7XG5cdHJlYWRvbmx5IGltYWdlSW5kZXhJblNlY3Rpb246IG51bWJlcjtcblx0cmVhZG9ubHkgaW1hZ2U6IElDYXJvdXNlbEltYWdlO1xufVxuXG50eXBlIFpvb21TY2FsZSA9IG51bWJlciB8ICdmaXQnO1xuXG5jb25zdCBTQ0FMRV9QSU5DSF9GQUNUT1IgPSAwLjA3NTtcbmNvbnN0IE1BWF9TQ0FMRSA9IDIwO1xuY29uc3QgTUlOX1NDQUxFID0gMC4xO1xuY29uc3QgUElYRUxBVElPTl9USFJFU0hPTEQgPSAzO1xuY29uc3QgWk9PTV9MRVZFTFMgPSBbMC4xLCAwLjIsIDAuMywgMC40LCAwLjUsIDAuNiwgMC43LCAwLjgsIDAuOSwgMSwgMS41LCAyLCAzLCA1LCA3LCAxMCwgMTUsIDIwXTtcblxuZXhwb3J0IGNsYXNzIEltYWdlQ2Fyb3VzZWxFZGl0b3IgZXh0ZW5kcyBFZGl0b3JQYW5lIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5lZGl0b3IuaW1hZ2VDYXJvdXNlbCc7XG5cblx0cHJpdmF0ZSBfY29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY3VycmVudEluZGV4OiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIF96b29tU2NhbGU6IFpvb21TY2FsZSA9ICdmaXQnO1xuXHRwcml2YXRlIF9zZWN0aW9uczogUmVhZG9ubHlBcnJheTxJQ2Fyb3VzZWxTZWN0aW9uPiA9IFtdO1xuXHRwcml2YXRlIF9mbGF0SW1hZ2VzOiBJRmxhdEltYWdlRW50cnlbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250ZW50RGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbWFnZURpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfYmxvYlVybENhY2hlID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblxuXHRwcml2YXRlIF92aWRlb1dlYnZpZXc6IElXZWJ2aWV3RWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZWxlbWVudHM6IHtcblx0XHRyb290OiBIVE1MRWxlbWVudDtcblx0XHRpbWFnZUFyZWE6IEhUTUxFbGVtZW50O1xuXHRcdG1haW5JbWFnZUNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdFx0bWFpbkltYWdlOiBIVE1MSW1hZ2VFbGVtZW50O1xuXHRcdHZpZGVvQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0XHRjYXB0aW9uVGV4dDogSFRNTEVsZW1lbnQ7XG5cdFx0Y2FwdGlvblNlcGFyYXRvcjogSFRNTEVsZW1lbnQ7XG5cdFx0Y291bnRlcjogSFRNTEVsZW1lbnQ7XG5cdFx0YXJpYVN0YXR1czogSFRNTEVsZW1lbnQ7XG5cdFx0cHJldkJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQ7XG5cdFx0bmV4dEJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQ7XG5cdFx0c2VjdGlvbnNDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHR9IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF90aHVtYm5haWxFbGVtZW50czogSFRNTEVsZW1lbnRbXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGdyb3VwOiBJRWRpdG9yR3JvdXAsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJV2Vidmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd2Vidmlld1NlcnZpY2U6IElXZWJ2aWV3U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihJbWFnZUNhcm91c2VsRWRpdG9yLklELCBncm91cCwgdGVsZW1ldHJ5U2VydmljZSwgdGhlbWVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY3JlYXRlRWRpdG9yKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9jb250YWluZXIgPSBoKCdkaXYuaW1hZ2UtY2Fyb3VzZWwtZWRpdG9yJykucm9vdDtcblx0XHRwYXJlbnQuYXBwZW5kQ2hpbGQodGhpcy5fY29udGFpbmVyKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHNldElucHV0KGlucHV0OiBJbWFnZUNhcm91c2VsRWRpdG9ySW5wdXQsIG9wdGlvbnM6IElFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkLCBjb250ZXh0OiBJRWRpdG9yT3BlbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHN1cGVyLnNldElucHV0KGlucHV0LCBvcHRpb25zLCBjb250ZXh0LCB0b2tlbik7XG5cblx0XHR0aGlzLl9zZWN0aW9ucyA9IGlucHV0LmNvbGxlY3Rpb24uc2VjdGlvbnM7XG5cdFx0dGhpcy5fZmxhdEltYWdlcyA9IFtdO1xuXHRcdGZvciAobGV0IHMgPSAwOyBzIDwgdGhpcy5fc2VjdGlvbnMubGVuZ3RoOyBzKyspIHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fc2VjdGlvbnNbc10uaW1hZ2VzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdHRoaXMuX2ZsYXRJbWFnZXMucHVzaCh7IHNlY3Rpb25JbmRleDogcywgaW1hZ2VJbmRleEluU2VjdGlvbjogaSwgaW1hZ2U6IHRoaXMuX3NlY3Rpb25zW3NdLmltYWdlc1tpXSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fY3VycmVudEluZGV4ID0gTWF0aC5taW4oaW5wdXQuc3RhcnRJbmRleCwgTWF0aC5tYXgoMCwgdGhpcy5fZmxhdEltYWdlcy5sZW5ndGggLSAxKSk7XG5cdFx0dGhpcy5idWlsZFNsaWRlc2hvdygpO1xuXHR9XG5cblx0b3ZlcnJpZGUgY2xlYXJJbnB1dCgpOiB2b2lkIHtcblx0XHR0aGlzLl92aWRlb1dlYnZpZXc/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl92aWRlb1dlYnZpZXcgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fY29udGVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5faW1hZ2VEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuX3Jldm9rZUNhY2hlZEJsb2JVcmxzKCk7XG5cdFx0dGhpcy5fem9vbVNjYWxlID0gJ2ZpdCc7XG5cdFx0aWYgKHRoaXMuX2NvbnRhaW5lcikge1xuXHRcdFx0Y2xlYXJOb2RlKHRoaXMuX2NvbnRhaW5lcik7XG5cdFx0fVxuXHRcdHRoaXMuX2VsZW1lbnRzID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3RodW1ibmFpbEVsZW1lbnRzID0gW107XG5cdFx0c3VwZXIuY2xlYXJJbnB1dCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNDdXJyZW50VmlkZW8oKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9mbGF0SW1hZ2VzW3RoaXMuX2N1cnJlbnRJbmRleF07XG5cdFx0cmV0dXJuICEhZW50cnkgJiYgaXNWaWRlb01pbWVUeXBlKGVudHJ5LmltYWdlLm1pbWVUeXBlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCdWlsZCB0aGUgZnVsbCBET00gc2tlbGV0b24uIENhbGxlZCBvbmNlIHBlciBzZXRJbnB1dC5cblx0ICovXG5cdHByaXZhdGUgYnVpbGRTbGlkZXNob3coKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9jb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9jb250ZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9pbWFnZURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fcmV2b2tlQ2FjaGVkQmxvYlVybHMoKTtcblx0XHRjbGVhck5vZGUodGhpcy5fY29udGFpbmVyKTtcblxuXHRcdGlmICh0aGlzLl9mbGF0SW1hZ2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Y29uc3QgZW1wdHkgPSBoKCdkaXYuZW1wdHktbWVzc2FnZScpO1xuXHRcdFx0ZW1wdHkucm9vdC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdpbWFnZUNhcm91c2VsLm5vSW1hZ2VzJywgXCJObyBpbWFnZXMgdG8gZGlzcGxheVwiKTtcblx0XHRcdHRoaXMuX2NvbnRhaW5lci5hcHBlbmRDaGlsZChlbXB0eS5yb290KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlbGVtZW50cyA9IGgoJ2Rpdi5zbGlkZXNob3ctY29udGFpbmVyJywgW1xuXHRcdFx0aCgnZGl2LmltYWdlLWFyZWFAaW1hZ2VBcmVhJywgW1xuXHRcdFx0XHRoKCdkaXYubWFpbi1pbWFnZS1jb250YWluZXJAbWFpbkltYWdlQ29udGFpbmVyJywgW1xuXHRcdFx0XHRcdGgoJ2ltZy5tYWluLWltYWdlQG1haW5JbWFnZScpLFxuXHRcdFx0XHRcdGgoJ2Rpdi52aWRlby1jb250YWluZXJAdmlkZW9Db250YWluZXInKSxcblx0XHRcdFx0XSksXG5cdFx0XHRcdGgoJ2J1dHRvbi5uYXYtYXJyb3cucHJldi1hcnJvd0BwcmV2QnRuJywgeyBhcmlhTGFiZWw6IGxvY2FsaXplKCdpbWFnZUNhcm91c2VsLnByZXZpb3VzSW1hZ2UnLCBcIlByZXZpb3VzIGltYWdlXCIpIH0sIFtcblx0XHRcdFx0XHRoKCdzcGFuLmNvZGljb24uY29kaWNvbi1jaGV2cm9uLWxlZnQnLCB7IGFyaWFIaWRkZW46ICd0cnVlJyB9KSxcblx0XHRcdFx0XSksXG5cdFx0XHRcdGgoJ2J1dHRvbi5uYXYtYXJyb3cubmV4dC1hcnJvd0BuZXh0QnRuJywgeyBhcmlhTGFiZWw6IGxvY2FsaXplKCdpbWFnZUNhcm91c2VsLm5leHRJbWFnZScsIFwiTmV4dCBpbWFnZVwiKSB9LCBbXG5cdFx0XHRcdFx0aCgnc3Bhbi5jb2RpY29uLmNvZGljb24tY2hldnJvbi1yaWdodCcsIHsgYXJpYUhpZGRlbjogJ3RydWUnIH0pLFxuXHRcdFx0XHRdKSxcblx0XHRcdF0pLFxuXHRcdFx0aCgnZGl2LmJvdHRvbS1iYXJAYm90dG9tQmFyJywgW1xuXHRcdFx0XHRoKCdkaXYuaW1hZ2UtaW5mby1iYXInLCBbXG5cdFx0XHRcdFx0aCgnc3Bhbi5jYXB0aW9uLXRleHRAY2FwdGlvblRleHQnKSxcblx0XHRcdFx0XHRoKCdzcGFuLmNhcHRpb24tc2VwYXJhdG9yQGNhcHRpb25TZXBhcmF0b3InKSxcblx0XHRcdFx0XHRoKCdzcGFuLmltYWdlLWNvdW50ZXJAY291bnRlcicpLFxuXHRcdFx0XHRdKSxcblx0XHRcdFx0aCgnZGl2LnNlY3Rpb25zLWNvbnRhaW5lckBzZWN0aW9uc0NvbnRhaW5lcicpLFxuXHRcdFx0XHRoKCdzcGFuLnNyLW9ubHlAYXJpYVN0YXR1cycpLFxuXHRcdFx0XSksXG5cdFx0XSk7XG5cblx0XHQvLyBBUklBOiBzZXQgdXAgc2xpZGVzaG93IGNvbnRhaW5lciBmb3Igc2NyZWVuIHJlYWRlcnNcblx0XHRlbGVtZW50cy5yb290LnNldEF0dHJpYnV0ZSgncm9sZScsICdncm91cCcpO1xuXHRcdGVsZW1lbnRzLnJvb3Quc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2ltYWdlQ2Fyb3VzZWwuYXJpYUxhYmVsJywgXCJJbWFnZXMgUHJldmlld1wiKSk7XG5cdFx0ZWxlbWVudHMuY2FwdGlvblNlcGFyYXRvci5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRlbGVtZW50cy5hcmlhU3RhdHVzLnNldEF0dHJpYnV0ZSgnYXJpYS1saXZlJywgJ3BvbGl0ZScpO1xuXHRcdGVsZW1lbnRzLmFyaWFTdGF0dXMuc2V0QXR0cmlidXRlKCdhcmlhLWF0b21pYycsICd0cnVlJyk7XG5cdFx0ZWxlbWVudHMuc2VjdGlvbnNDb250YWluZXIuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2dyb3VwJyk7XG5cdFx0ZWxlbWVudHMuc2VjdGlvbnNDb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2ltYWdlQ2Fyb3VzZWwudGh1bWJuYWlscycsIFwiSW1hZ2UgdGh1bWJuYWlsc1wiKSk7XG5cblx0XHR0aGlzLl9lbGVtZW50cyA9IHtcblx0XHRcdHJvb3Q6IGVsZW1lbnRzLnJvb3QsXG5cdFx0XHRpbWFnZUFyZWE6IGVsZW1lbnRzLmltYWdlQXJlYSxcblx0XHRcdG1haW5JbWFnZUNvbnRhaW5lcjogZWxlbWVudHMubWFpbkltYWdlQ29udGFpbmVyLFxuXHRcdFx0bWFpbkltYWdlOiBlbGVtZW50cy5tYWluSW1hZ2UgYXMgSFRNTEltYWdlRWxlbWVudCxcblx0XHRcdHZpZGVvQ29udGFpbmVyOiBlbGVtZW50cy52aWRlb0NvbnRhaW5lcixcblx0XHRcdGNhcHRpb25UZXh0OiBlbGVtZW50cy5jYXB0aW9uVGV4dCxcblx0XHRcdGNhcHRpb25TZXBhcmF0b3I6IGVsZW1lbnRzLmNhcHRpb25TZXBhcmF0b3IsXG5cdFx0XHRjb3VudGVyOiBlbGVtZW50cy5jb3VudGVyLFxuXHRcdFx0YXJpYVN0YXR1czogZWxlbWVudHMuYXJpYVN0YXR1cyxcblx0XHRcdHByZXZCdG46IGVsZW1lbnRzLnByZXZCdG4gYXMgSFRNTEJ1dHRvbkVsZW1lbnQsXG5cdFx0XHRuZXh0QnRuOiBlbGVtZW50cy5uZXh0QnRuIGFzIEhUTUxCdXR0b25FbGVtZW50LFxuXHRcdFx0c2VjdGlvbnNDb250YWluZXI6IGVsZW1lbnRzLnNlY3Rpb25zQ29udGFpbmVyLFxuXHRcdH07XG5cblx0XHQvLyBJbml0aWFsaXplIGltYWdlIGluIGZpdCBtb2RlXG5cdFx0dGhpcy5fZWxlbWVudHMubWFpbkltYWdlLmNsYXNzTGlzdC5hZGQoJ3NjYWxlLXRvLWZpdCcpO1xuXHRcdHRoaXMuX2VsZW1lbnRzLm1haW5JbWFnZS5hbHQgPSAnJztcblxuXHRcdC8vIEhpZGUgdmlkZW8gY29udGFpbmVyIGluaXRpYWxseVxuXHRcdHRoaXMuX2VsZW1lbnRzLnZpZGVvQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cblx0XHQvLyBOYXZpZ2F0aW9uIGxpc3RlbmVyc1xuXHRcdHRoaXMuX2NvbnRlbnREaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2VsZW1lbnRzLnByZXZCdG4sICdjbGljaycsICgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9jdXJyZW50SW5kZXggPiAwKSB7XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRJbmRleC0tO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUN1cnJlbnRJbWFnZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9jb250ZW50RGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9lbGVtZW50cy5uZXh0QnRuLCAnY2xpY2snLCAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fY3VycmVudEluZGV4IDwgdGhpcy5fZmxhdEltYWdlcy5sZW5ndGggLSAxKSB7XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRJbmRleCsrO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUN1cnJlbnRJbWFnZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEtleWJvYXJkIG5hdmlnYXRpb25cblx0XHR0aGlzLl9jb250ZW50RGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihlbGVtZW50cy5yb290LCBFdmVudFR5cGUuS0VZX0RPV04sIGUgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0aWYgKGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuTGVmdEFycm93KSB7XG5cdFx0XHRcdHRoaXMucHJldmlvdXMoKTtcblx0XHRcdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHR9IGVsc2UgaWYgKGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuUmlnaHRBcnJvdykge1xuXHRcdFx0XHR0aGlzLm5leHQoKTtcblx0XHRcdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGVsZW1lbnRzLnJvb3QudGFiSW5kZXggPSAwO1xuXG5cdFx0Ly8gWm9vbTogc2Nyb2xsIHdoZWVsICsgbW9kaWZpZXIga2V5IChDdHJsIG9uIFdpbi9MaW51eCwgQWx0IG9uIE1hYykgb3IgcGluY2hcblx0XHR0aGlzLl9jb250ZW50RGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9lbGVtZW50cy5pbWFnZUFyZWEsIEV2ZW50VHlwZS5NT1VTRV9XSEVFTCwgKGU6IFdoZWVsRXZlbnQpID0+IHtcblx0XHRcdGlmICh0aGlzLl9pc0N1cnJlbnRWaWRlbygpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGlzWm9vbU1vZGlmaWVyID0gaXNNYWNpbnRvc2ggPyBlLmFsdEtleSA6IGUuY3RybEtleTtcblx0XHRcdGlmICghaXNab29tTW9kaWZpZXIgJiYgIWUuY3RybEtleSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cblx0XHRcdGlmIChlLmRlbHRhWSA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl96b29tU2NhbGUgPT09ICdmaXQnKSB7XG5cdFx0XHRcdHRoaXMuX2luaXRab29tRnJvbUZpdCgpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkZWx0YSA9IGUuZGVsdGFZID4gMCA/IDEgOiAtMTtcblx0XHRcdHRoaXMuX2FwcGx5Wm9vbSgodGhpcy5fem9vbVNjYWxlIGFzIG51bWJlcikgKiAoMSAtIGRlbHRhICogU0NBTEVfUElOQ0hfRkFDVE9SKSk7XG5cdFx0fSwgeyBwYXNzaXZlOiBmYWxzZSB9KSk7XG5cblx0XHQvLyBab29tOiBzaW5nbGUgY2xpY2sgdG8gem9vbSBpbi9vdXQgKGxpa2UgaW1hZ2UgcHJldmlldylcblx0XHQvLyBUcmFjayBtb2RpZmllciBrZXlzIGF0IG1vdXNlZG93biB0aW1lXG5cdFx0bGV0IGNsaWNrQ3RybFByZXNzZWQgPSBmYWxzZTtcblx0XHRsZXQgY2xpY2tBbHRQcmVzc2VkID0gZmFsc2U7XG5cdFx0dGhpcy5fY29udGVudERpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fZWxlbWVudHMubWFpbkltYWdlQ29udGFpbmVyLCBFdmVudFR5cGUuTU9VU0VfRE9XTiwgKGU6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdGlmIChlLmJ1dHRvbiAhPT0gMCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjbGlja0N0cmxQcmVzc2VkID0gZS5jdHJsS2V5O1xuXHRcdFx0Y2xpY2tBbHRQcmVzc2VkID0gZS5hbHRLZXk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX2NvbnRlbnREaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2VsZW1lbnRzLm1haW5JbWFnZUNvbnRhaW5lciwgRXZlbnRUeXBlLkNMSUNLLCAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0aWYgKGUuYnV0dG9uICE9PSAwIHx8IHRoaXMuX2lzQ3VycmVudFZpZGVvKCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaXNab29tT3V0ID0gaXNNYWNpbnRvc2ggPyBjbGlja0FsdFByZXNzZWQgOiBjbGlja0N0cmxQcmVzc2VkO1xuXHRcdFx0aWYgKGlzWm9vbU91dCkge1xuXHRcdFx0XHR0aGlzLl96b29tT3V0KCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl96b29tSW4oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBVcGRhdGUgem9vbS1vdXQgY3Vyc29yIGNsYXNzIHdoZW4gbW9kaWZpZXIga2V5IGlzIGhlbGRcblx0XHRjb25zdCB1cGRhdGVab29tQ3Vyc29yID0gKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IGlzWm9vbU91dCA9IGlzTWFjaW50b3NoID8gZS5hbHRLZXkgOiBlLmN0cmxLZXk7XG5cdFx0XHR0aGlzLl9lbGVtZW50cyEubWFpbkltYWdlQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ3pvb20tb3V0JywgaXNab29tT3V0KTtcblx0XHR9O1xuXHRcdHRoaXMuX2NvbnRlbnREaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVsZW1lbnRzLnJvb3QsIEV2ZW50VHlwZS5LRVlfRE9XTiwgdXBkYXRlWm9vbUN1cnNvcikpO1xuXHRcdHRoaXMuX2NvbnRlbnREaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVsZW1lbnRzLnJvb3QsIEV2ZW50VHlwZS5LRVlfVVAsIHVwZGF0ZVpvb21DdXJzb3IpKTtcblxuXHRcdC8vIEJ1aWxkIHNlY3Rpb24gdGh1bWJuYWlsc1xuXHRcdHRoaXMuX3RodW1ibmFpbEVsZW1lbnRzID0gW107XG5cdFx0bGV0IGZsYXRJbmRleCA9IDA7XG5cdFx0Zm9yIChsZXQgcyA9IDA7IHMgPCB0aGlzLl9zZWN0aW9ucy5sZW5ndGg7IHMrKykge1xuXHRcdFx0Y29uc3Qgc2VjdGlvbiA9IHRoaXMuX3NlY3Rpb25zW3NdO1xuXG5cdFx0XHQvLyBBZGQgc2VwYXJhdG9yIGJldHdlZW4gc2VjdGlvbnMgKG5vdCBiZWZvcmUgdGhlIGZpcnN0KVxuXHRcdFx0aWYgKHMgPiAwICYmIHRoaXMuX3NlY3Rpb25zLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0Y29uc3Qgc2VwYXJhdG9yID0gaCgnZGl2LnRodW1ibmFpbC1zZXBhcmF0b3InKS5yb290O1xuXHRcdFx0XHRzZXBhcmF0b3Iuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0XHRcdHRoaXMuX2VsZW1lbnRzLnNlY3Rpb25zQ29udGFpbmVyLmFwcGVuZENoaWxkKHNlcGFyYXRvcik7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgc2VjdGlvbi5pbWFnZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgaW1hZ2UgPSBzZWN0aW9uLmltYWdlc1tpXTtcblx0XHRcdFx0Y29uc3QgY3VycmVudEZsYXRJbmRleCA9IGZsYXRJbmRleDtcblx0XHRcdFx0Y29uc3QgaXNJdGVtVmlkZW8gPSBpc1ZpZGVvTWltZVR5cGUoaW1hZ2UubWltZVR5cGUpO1xuXG5cdFx0XHRcdGNvbnN0IGJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xuXHRcdFx0XHRidG4uY2xhc3NOYW1lID0gaXNJdGVtVmlkZW8gPyAndGh1bWJuYWlsIHZpZGVvLXRodW1ibmFpbCcgOiAndGh1bWJuYWlsJztcblx0XHRcdFx0YnRuLmFyaWFMYWJlbCA9IGlzSXRlbVZpZGVvXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnaW1hZ2VDYXJvdXNlbC50aHVtYm5haWxMYWJlbFZpZGVvJywgXCJWaWRlbyB7MH0gb2YgezF9XCIsIGN1cnJlbnRGbGF0SW5kZXggKyAxLCB0aGlzLl9mbGF0SW1hZ2VzLmxlbmd0aClcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdpbWFnZUNhcm91c2VsLnRodW1ibmFpbExhYmVsSW1hZ2UnLCBcIkltYWdlIHswfSBvZiB7MX1cIiwgY3VycmVudEZsYXRJbmRleCArIDEsIHRoaXMuX2ZsYXRJbWFnZXMubGVuZ3RoKTtcblxuXHRcdFx0XHRpZiAoaXNJdGVtVmlkZW8pIHtcblx0XHRcdFx0XHRjb25zdCBpY29uID0gaCgnc3Bhbi5jb2RpY29uLmNvZGljb24tcGxheS50aHVtYm5haWwtcGxheS1pY29uJyk7XG5cdFx0XHRcdFx0aWNvbi5yb290LnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdFx0XHRcdGJ0bi5hcHBlbmRDaGlsZChpY29uLnJvb3QpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGltZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2ltZycpO1xuXHRcdFx0XHRcdGltZy5jbGFzc05hbWUgPSAndGh1bWJuYWlsLWltYWdlJztcblx0XHRcdFx0XHRpbWcuYWx0ID0gaW1hZ2UubmFtZTtcblx0XHRcdFx0XHRjb25zdCB0aHVtYm5haWxEaXNwb3NhYmxlcyA9IHRoaXMuX2NvbnRlbnREaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRcdFx0XHRcdGNvbnN0IG1hcmtCcm9rZW4gPSAoKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAodGh1bWJuYWlsRGlzcG9zYWJsZXMuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlmICghYnRuLmNsYXNzTGlzdC5jb250YWlucygnYnJva2VuJykpIHtcblx0XHRcdFx0XHRcdFx0YnRuLmNsYXNzTGlzdC5hZGQoJ2Jyb2tlbicpO1xuXHRcdFx0XHRcdFx0XHRpbWcucmVtb3ZlQXR0cmlidXRlKCdzcmMnKTtcblx0XHRcdFx0XHRcdFx0aW1nLmFsdCA9ICcnO1xuXHRcdFx0XHRcdFx0XHRpbWcucmVtb3ZlKCk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGZhbGxiYWNrID0gaCgnc3Bhbi5jb2RpY29uLmNvZGljb24td2FybmluZy50aHVtYm5haWwtYnJva2VuLWljb24nKTtcblx0XHRcdFx0XHRcdFx0ZmFsbGJhY2sucm9vdC5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRcdFx0XHRcdFx0YnRuLmFwcGVuZENoaWxkKGZhbGxiYWNrLnJvb3QpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHR0aGlzLl9sb2FkQmxvYlVybChpbWFnZSkudGhlbih1cmwgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHRodW1ibmFpbERpc3Bvc2FibGVzLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRpZiAodXJsKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHByZWxvYWRlciA9IG5ldyBJbWFnZSgpO1xuXHRcdFx0XHRcdFx0XHR0aHVtYm5haWxEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHByZWxvYWRlciwgJ2xvYWQnLCAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKGJ0bi5jbGFzc0xpc3QuY29udGFpbnMoJ2Jyb2tlbicpKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdGltZy5zcmMgPSB1cmw7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKCFpbWcucGFyZW50RWxlbWVudCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0YnRuLmFwcGVuZENoaWxkKGltZyk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0XHRcdHRodW1ibmFpbERpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIocHJlbG9hZGVyLCAnZXJyb3InLCAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0bWFya0Jyb2tlbigpO1xuXHRcdFx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0XHRcdHByZWxvYWRlci5zcmMgPSB1cmw7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRtYXJrQnJva2VuKCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSwgKCkgPT4ge1xuXHRcdFx0XHRcdFx0bWFya0Jyb2tlbigpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHRodW1ibmFpbERpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoaW1nLCAnZXJyb3InLCAoKSA9PiB7XG5cdFx0XHRcdFx0XHRtYXJrQnJva2VuKCk7XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5fY29udGVudERpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoYnRuLCAnY2xpY2snLCAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fY3VycmVudEluZGV4ID0gY3VycmVudEZsYXRJbmRleDtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZUN1cnJlbnRJbWFnZSgpO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0dGhpcy5fZWxlbWVudHMuc2VjdGlvbnNDb250YWluZXIuYXBwZW5kQ2hpbGQoYnRuKTtcblx0XHRcdFx0dGhpcy5fdGh1bWJuYWlsRWxlbWVudHMucHVzaChidG4pO1xuXHRcdFx0XHRmbGF0SW5kZXgrKztcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9jb250YWluZXIuYXBwZW5kQ2hpbGQoZWxlbWVudHMucm9vdCk7XG5cblx0XHQvLyBTZXQgaW5pdGlhbCBpbWFnZVxuXHRcdHRoaXMudXBkYXRlQ3VycmVudEltYWdlKCk7XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlIG9ubHkgdGhlIGNoYW5naW5nIHBhcnRzOiBtYWluIGltYWdlIHNyYywgY2FwdGlvbiwgYnV0dG9uIHN0YXRlcywgdGh1bWJuYWlsIHNlbGVjdGlvbi5cblx0ICogTm8gRE9NIHRlYXJkb3duL3JlYnVpbGQgXHUyMDE0IGVsaW1pbmF0ZXMgdGhlIGJsYW5rIGZsYXNoLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVDdXJyZW50SW1hZ2UoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9lbGVtZW50cykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENhcHR1cmUgdGhlIG5hdmlnYXRpb24gaW5kZXggYmVmb3JlIHN0YXJ0aW5nIGFzeW5jIHdvcmsgc28gdGhhdFxuXHRcdC8vIHdlIGNhbiBkaXNjYXJkIHN0YWxlIHJlc3VsdHMgaWYgdGhlIHVzZXIgbmF2aWdhdGVzIHdoaWxlIGxvYWRpbmcvZGVjb2RpbmcuXG5cdFx0Y29uc3QgbmF2aWdhdGlvbkluZGV4ID0gdGhpcy5fY3VycmVudEluZGV4O1xuXG5cdFx0Ly8gU3dhcCBtYWluIGltYWdlIHVzaW5nIGNhY2hlZC9sYXp5LWxvYWRlZCBibG9iIFVSTC5cblx0XHQvLyBQcmUtZGVjb2RlIHZpYSBkZWNvZGUoKSBiZWZvcmUgYXNzaWduaW5nIHRvIDxpbWc+IHNvIHRoZSBicm93c2VyXG5cdFx0Ly8gZGVjb2RlcyBvbiBhIHdvcmtlciB0aHJlYWQsIGF2b2lkaW5nIG1haW4tdGhyZWFkIHN0YWxscyBkdXJpbmcgY29tbWl0LlxuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fZmxhdEltYWdlc1tuYXZpZ2F0aW9uSW5kZXhdO1xuXHRcdGNvbnN0IGN1cnJlbnRJbWFnZSA9IGVudHJ5LmltYWdlO1xuXHRcdGNvbnN0IGlzVmlkZW8gPSBpc1ZpZGVvTWltZVR5cGUoY3VycmVudEltYWdlLm1pbWVUeXBlKTtcblxuXHRcdGlmIChpc1ZpZGVvKSB7XG5cdFx0XHQvLyBTaG93IHZpZGVvIGNvbnRhaW5lciwgaGlkZSBpbWFnZVxuXHRcdFx0dGhpcy5fZWxlbWVudHMubWFpbkltYWdlLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR0aGlzLl9lbGVtZW50cy52aWRlb0NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHR0aGlzLl9lbGVtZW50cy5tYWluSW1hZ2VDb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnem9vbWVkJyk7XG5cdFx0XHR0aGlzLl9lbGVtZW50cy5tYWluSW1hZ2VDb250YWluZXIuc3R5bGUuY3Vyc29yID0gJ2RlZmF1bHQnO1xuXG5cdFx0XHQvLyBMb2FkIHJhdyBkYXRhIHRvIHNlbmQgdmlhIHBvc3RNZXNzYWdlXG5cdFx0XHRjb25zdCByYXdEYXRhID0gYXdhaXQgdGhpcy5fbG9hZFJhd0RhdGEoY3VycmVudEltYWdlKTtcblx0XHRcdGlmICh0aGlzLl9jdXJyZW50SW5kZXggIT09IG5hdmlnYXRpb25JbmRleCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG5vbmNlID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0XHRjb25zdCB2aWRlb0h0bWwgPSBgPCFET0NUWVBFIGh0bWw+XG48aHRtbD48aGVhZD5cbjxtZXRhIGNoYXJzZXQ9XCJ1dGYtOFwiPlxuPG1ldGEgaHR0cC1lcXVpdj1cIkNvbnRlbnQtU2VjdXJpdHktUG9saWN5XCIgY29udGVudD1cImRlZmF1bHQtc3JjICdub25lJzsgbWVkaWEtc3JjIGJsb2I6IGRhdGE6OyBzY3JpcHQtc3JjICdub25jZS0ke25vbmNlfSc7IHN0eWxlLXNyYyAnbm9uY2UtJHtub25jZX0nO1wiPlxuPHN0eWxlIG5vbmNlPVwiJHtub25jZX1cIj5odG1sLGJvZHl7bWFyZ2luOjA7cGFkZGluZzowO3dpZHRoOjEwMCU7aGVpZ2h0OjEwMCU7b3ZlcmZsb3c6aGlkZGVuO2JhY2tncm91bmQ6dHJhbnNwYXJlbnR9XG52aWRlb3t3aWR0aDoxMDAlO2hlaWdodDoxMDAlO29iamVjdC1maXQ6Y29udGFpbjtvdXRsaW5lOm5vbmV9PC9zdHlsZT5cbjwvaGVhZD48Ym9keT5cbjx2aWRlbyBpZD1cInZcIiBjb250cm9scz48L3ZpZGVvPlxuPHNjcmlwdCBub25jZT1cIiR7bm9uY2V9XCI+XG53aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIixmdW5jdGlvbihlKXt2YXIgbT1lLmRhdGE7aWYobS50eXBlPT09XCJsb2FkVmlkZW9cIil7dmFyIGI9bmV3IEJsb2IoW20uZGF0YV0se3R5cGU6bS5taW1lVHlwZX0pO2RvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwidlwiKS5zcmM9VVJMLmNyZWF0ZU9iamVjdFVSTChiKTt9fSk7XG48L3NjcmlwdD5cbjwvYm9keT48L2h0bWw+YDtcblxuXHRcdFx0Ly8gUmV1c2UgZXhpc3Rpbmcgd2VidmlldyBvciBjcmVhdGUgb25lIG9uIGZpcnN0IHZpZGVvIG5hdmlnYXRpb25cblx0XHRcdGxldCB3ZWJ2aWV3OiBJV2Vidmlld0VsZW1lbnQ7XG5cdFx0XHRpZiAoIXRoaXMuX3ZpZGVvV2Vidmlldykge1xuXHRcdFx0XHR3ZWJ2aWV3ID0gdGhpcy5fY29udGVudERpc3Bvc2FibGVzLmFkZCh0aGlzLl93ZWJ2aWV3U2VydmljZS5jcmVhdGVXZWJ2aWV3RWxlbWVudCh7XG5cdFx0XHRcdFx0dGl0bGU6IGN1cnJlbnRJbWFnZS5uYW1lLFxuXHRcdFx0XHRcdG9wdGlvbnM6IHsgZGlzYWJsZVNlcnZpY2VXb3JrZXI6IHRydWUgfSxcblx0XHRcdFx0XHRjb250ZW50T3B0aW9uczogeyBhbGxvd1NjcmlwdHM6IHRydWUgfSxcblx0XHRcdFx0XHRleHRlbnNpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHR3ZWJ2aWV3Lm1vdW50VG8odGhpcy5fZWxlbWVudHMudmlkZW9Db250YWluZXIsIHRoaXMud2luZG93KTtcblx0XHRcdFx0dGhpcy5fdmlkZW9XZWJ2aWV3ID0gd2Vidmlldztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHdlYnZpZXcgPSB0aGlzLl92aWRlb1dlYnZpZXc7XG5cdFx0XHR9XG5cblx0XHRcdHdlYnZpZXcuc2V0SHRtbCh2aWRlb0h0bWwpO1xuXG5cdFx0XHQvLyBTZW5kIHRoZSB2aWRlbyBkYXRhIHRvIHRoZSB3ZWJ2aWV3IHZpYSBwb3N0TWVzc2FnZVxuXHRcdFx0Y29uc3QgYnVmZmVyID0gKHJhd0RhdGEgYXMgVWludDhBcnJheTxBcnJheUJ1ZmZlcj4pLmJ1ZmZlcjtcblx0XHRcdHdlYnZpZXcucG9zdE1lc3NhZ2UoeyB0eXBlOiAnbG9hZFZpZGVvJywgZGF0YTogYnVmZmVyLCBtaW1lVHlwZTogY3VycmVudEltYWdlLm1pbWVUeXBlIH0sIFtidWZmZXJdKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gU2hvdyBpbWFnZSwgaGlkZSB2aWRlbyBjb250YWluZXJcblx0XHRcdHRoaXMuX2VsZW1lbnRzLnZpZGVvQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR0aGlzLl9lbGVtZW50cy5tYWluSW1hZ2Uuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0dGhpcy5fZWxlbWVudHMubWFpbkltYWdlQ29udGFpbmVyLnN0eWxlLmN1cnNvciA9ICcnO1xuXG5cdFx0XHRjb25zdCB1cmwgPSBhd2FpdCB0aGlzLl9sb2FkQmxvYlVybChjdXJyZW50SW1hZ2UpO1xuXG5cdFx0XHQvLyBJZiB0aGUgdXNlciBuYXZpZ2F0ZWQgd2hpbGUgbG9hZGluZyB0aGUgYmxvYiBVUkwsIGRpc2NhcmQgdGhpcyByZXN1bHQuXG5cdFx0XHRpZiAodGhpcy5fY3VycmVudEluZGV4ICE9PSBuYXZpZ2F0aW9uSW5kZXgpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB0bXAgPSBuZXcgSW1hZ2UoKTtcblx0XHRcdHRtcC5zcmMgPSB1cmw7XG5cdFx0XHR0bXAuZGVjb2RlKCkudGhlbigoKSA9PiB7XG5cdFx0XHRcdC8vIE9ubHkgYXBwbHkgaWYgdXNlciBoYXNuJ3QgbmF2aWdhdGVkIGF3YXkgZHVyaW5nIGRlY29kZVxuXHRcdFx0XHRpZiAodGhpcy5fY3VycmVudEluZGV4ID09PSBuYXZpZ2F0aW9uSW5kZXggJiYgdGhpcy5fZWxlbWVudHMpIHtcblx0XHRcdFx0XHR0aGlzLl9lbGVtZW50cy5tYWluSW1hZ2Uuc3JjID0gdXJsO1xuXHRcdFx0XHRcdHRoaXMuX2VsZW1lbnRzLm1haW5JbWFnZS5hbHQgPSBjdXJyZW50SW1hZ2UubmFtZTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgKCkgPT4ge1xuXHRcdFx0XHQvLyBEZWNvZGUgZmFpbGVkIChpbnZhbGlkIGltYWdlKSBcdTIwMTQgc3RpbGwgc2hvdyBzcmMgZm9yIGJyb3dzZXIgZmFsbGJhY2tcblx0XHRcdFx0aWYgKHRoaXMuX2N1cnJlbnRJbmRleCA9PT0gbmF2aWdhdGlvbkluZGV4ICYmIHRoaXMuX2VsZW1lbnRzKSB7XG5cdFx0XHRcdFx0dGhpcy5fZWxlbWVudHMubWFpbkltYWdlLnNyYyA9IHVybDtcblx0XHRcdFx0XHR0aGlzLl9lbGVtZW50cy5tYWluSW1hZ2UuYWx0ID0gY3VycmVudEltYWdlLm5hbWU7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIFJlc2V0IHpvb20gd2hlbiBzd2l0Y2hpbmcgaW1hZ2VzXG5cdFx0dGhpcy5fYXBwbHlab29tKCdmaXQnKTtcblxuXHRcdC8vIFVwZGF0ZSBpbmZvIGJhcjogY2FwdGlvbiArIHNlcGFyYXRvciArIGNvdW50ZXJcblx0XHRpZiAoY3VycmVudEltYWdlLmNhcHRpb24pIHtcblx0XHRcdHRoaXMuX2VsZW1lbnRzLmNhcHRpb25UZXh0LnRleHRDb250ZW50ID0gY3VycmVudEltYWdlLmNhcHRpb247XG5cdFx0XHR0aGlzLl9lbGVtZW50cy5jYXB0aW9uVGV4dC5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHR0aGlzLl9lbGVtZW50cy5jYXB0aW9uU2VwYXJhdG9yLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fZWxlbWVudHMuY2FwdGlvblRleHQudGV4dENvbnRlbnQgPSAnJztcblx0XHRcdHRoaXMuX2VsZW1lbnRzLmNhcHRpb25UZXh0LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR0aGlzLl9lbGVtZW50cy5jYXB0aW9uU2VwYXJhdG9yLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0fVxuXHRcdHRoaXMuX2VsZW1lbnRzLmNvdW50ZXIudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnaW1hZ2VDYXJvdXNlbC5jb3VudGVyJywgXCJ7MH0gLyB7MX1cIiwgbmF2aWdhdGlvbkluZGV4ICsgMSwgdGhpcy5fZmxhdEltYWdlcy5sZW5ndGgpO1xuXG5cdFx0Ly8gQW5ub3VuY2UgdG8gc2NyZWVuIHJlYWRlcnMgd2l0aCBmdWxsIGNvbnRleHQgKHBvc2l0aW9uICsgY2FwdGlvbi9uYW1lKVxuXHRcdGNvbnN0IGl0ZW1LaW5kID0gaXNWaWRlb1xuXHRcdFx0PyBsb2NhbGl6ZSgnaW1hZ2VDYXJvdXNlbC5raW5kVmlkZW8nLCBcIlZpZGVvXCIpXG5cdFx0XHQ6IGxvY2FsaXplKCdpbWFnZUNhcm91c2VsLmtpbmRJbWFnZScsIFwiSW1hZ2VcIik7XG5cdFx0dGhpcy5fZWxlbWVudHMuYXJpYVN0YXR1cy50ZXh0Q29udGVudCA9IGN1cnJlbnRJbWFnZS5jYXB0aW9uXG5cdFx0XHQ/IGxvY2FsaXplKCdpbWFnZUNhcm91c2VsLnN0YXR1c1dpdGhDYXB0aW9uJywgXCJ7MH0gezF9IG9mIHsyfTogezN9XCIsIGl0ZW1LaW5kLCBuYXZpZ2F0aW9uSW5kZXggKyAxLCB0aGlzLl9mbGF0SW1hZ2VzLmxlbmd0aCwgY3VycmVudEltYWdlLmNhcHRpb24pXG5cdFx0XHQ6IGxvY2FsaXplKCdpbWFnZUNhcm91c2VsLnN0YXR1c1dpdGhOYW1lJywgXCJ7MH0gezF9IG9mIHsyfTogezN9XCIsIGl0ZW1LaW5kLCBuYXZpZ2F0aW9uSW5kZXggKyAxLCB0aGlzLl9mbGF0SW1hZ2VzLmxlbmd0aCwgY3VycmVudEltYWdlLm5hbWUpO1xuXG5cdFx0Ly8gVXBkYXRlIGJ1dHRvbiBzdGF0ZXNcblx0XHR0aGlzLl9lbGVtZW50cy5wcmV2QnRuLmRpc2FibGVkID0gbmF2aWdhdGlvbkluZGV4ID09PSAwO1xuXHRcdHRoaXMuX2VsZW1lbnRzLm5leHRCdG4uZGlzYWJsZWQgPSBuYXZpZ2F0aW9uSW5kZXggPT09IHRoaXMuX2ZsYXRJbWFnZXMubGVuZ3RoIC0gMTtcblxuXHRcdC8vIFVwZGF0ZSB0aHVtYm5haWwgc2VsZWN0aW9uIFx1MjAxNCBvbmx5IHRvZ2dsZSBhY3RpdmUgY2xhc3MgYW5kXG5cdFx0Ly8gY2FsbCBnZXRCb3VuZGluZ0NsaWVudFJlY3Qgb24gdGhlIGFjdGl2ZSB0aHVtYm5haWwgdG8gYXZvaWRcblx0XHQvLyBsYXlvdXQgdGhyYXNoaW5nIGFjcm9zcyBhbGwgdGh1bWJuYWlscyBvbiBldmVyeSBuYXZpZ2F0aW9uLlxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fdGh1bWJuYWlsRWxlbWVudHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGlzQWN0aXZlID0gaSA9PT0gbmF2aWdhdGlvbkluZGV4O1xuXHRcdFx0Y29uc3QgdGh1bWJuYWlsID0gdGhpcy5fdGh1bWJuYWlsRWxlbWVudHNbaV07XG5cdFx0XHR0aHVtYm5haWwuY2xhc3NMaXN0LnRvZ2dsZSgnYWN0aXZlJywgaXNBY3RpdmUpO1xuXHRcdFx0aWYgKGlzQWN0aXZlKSB7XG5cdFx0XHRcdHRodW1ibmFpbC5zZXRBdHRyaWJ1dGUoJ2FyaWEtY3VycmVudCcsICdwYWdlJyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aHVtYm5haWwucmVtb3ZlQXR0cmlidXRlKCdhcmlhLWN1cnJlbnQnKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTY3JvbGwgdGhlIGFjdGl2ZSB0aHVtYm5haWwgaW50byB2aWV3IHdpdGhvdXQgYmxvY2tpbmcgdGhlIG1haW4gdGhyZWFkLlxuXHRcdC8vIFVzaW5nIHNjcm9sbEludG9WaWV3IHdpdGggJ25lYXJlc3QnIGF2b2lkcyBmb3JjZWQgbGF5b3V0IGZyb21cblx0XHQvLyBnZXRCb3VuZGluZ0NsaWVudFJlY3QgKyBzY3JvbGxMZWZ0IGFuZCBpcyBoYW5kbGVkIGVmZmljaWVudGx5IGJ5XG5cdFx0Ly8gdGhlIGJyb3dzZXIncyBzY3JvbGwgbWFjaGluZXJ5LlxuXHRcdGNvbnN0IGFjdGl2ZVRodW1ibmFpbCA9IHRoaXMuX3RodW1ibmFpbEVsZW1lbnRzW25hdmlnYXRpb25JbmRleF07XG5cdFx0aWYgKGFjdGl2ZVRodW1ibmFpbCkge1xuXHRcdFx0YWN0aXZlVGh1bWJuYWlsLnNjcm9sbEludG9WaWV3KHsgYmxvY2s6ICduZWFyZXN0JywgaW5saW5lOiAnbmVhcmVzdCcgfSk7XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIGVkaXRvciB0aXRsZSB0byByZWZsZWN0IGN1cnJlbnQgc2VjdGlvblxuXHRcdGlmICh0aGlzLmlucHV0IGluc3RhbmNlb2YgSW1hZ2VDYXJvdXNlbEVkaXRvcklucHV0KSB7XG5cdFx0XHRjb25zdCBjdXJyZW50U2VjdGlvbiA9IHRoaXMuX3NlY3Rpb25zW2VudHJ5LnNlY3Rpb25JbmRleF07XG5cdFx0XHR0aGlzLmlucHV0LnNldE5hbWUoY3VycmVudFNlY3Rpb24udGl0bGUgfHwgdGhpcy5pbnB1dC5jb2xsZWN0aW9uLnRpdGxlKTtcblx0XHR9XG5cblx0XHQvLyBQcmVsb2FkIGFkamFjZW50IGltYWdlcyBmb3Igc21vb3RoZXIgbmF2aWdhdGlvblxuXHRcdHRoaXMuX3ByZWxvYWRBZGphY2VudEltYWdlcygpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfbG9hZEJsb2JVcmwoaW1hZ2U6IElDYXJvdXNlbEltYWdlKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLl9ibG9iVXJsQ2FjaGUuZ2V0KGltYWdlLmlkKTtcblx0XHRpZiAoY2FjaGVkKSB7XG5cdFx0XHRyZXR1cm4gY2FjaGVkO1xuXHRcdH1cblxuXHRcdGxldCBidWZmZXI6IFVpbnQ4QXJyYXk7XG5cdFx0aWYgKGltYWdlLmRhdGEpIHtcblx0XHRcdC8vIEhhbmRsZSBib3RoIFZTQnVmZmVyIChoYXMgLmJ1ZmZlciBwcm9wZXJ0eSkgYW5kIHJhdyBVaW50OEFycmF5IGZyb20gY2hhdCBhdHRhY2htZW50c1xuXHRcdFx0YnVmZmVyID0gaW1hZ2UuZGF0YSBpbnN0YW5jZW9mIFVpbnQ4QXJyYXkgPyBpbWFnZS5kYXRhIDogaW1hZ2UuZGF0YS5idWZmZXI7XG5cdFx0fSBlbHNlIGlmIChpbWFnZS51cmkpIHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFkRmlsZShpbWFnZS51cmkpO1xuXHRcdFx0YnVmZmVyID0gY29udGVudC52YWx1ZS5idWZmZXI7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cblx0XHRjb25zdCBibG9iID0gbmV3IEJsb2IoW2J1ZmZlciBhcyBVaW50OEFycmF5PEFycmF5QnVmZmVyPl0sIHsgdHlwZTogaW1hZ2UubWltZVR5cGUgfSk7XG5cdFx0Y29uc3QgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcblx0XHR0aGlzLl9ibG9iVXJsQ2FjaGUuc2V0KGltYWdlLmlkLCB1cmwpO1xuXHRcdHJldHVybiB1cmw7XG5cdH1cblxuXHRwcml2YXRlIF9yZXZva2VDYWNoZWRCbG9iVXJscygpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHVybCBvZiB0aGlzLl9ibG9iVXJsQ2FjaGUudmFsdWVzKCkpIHtcblx0XHRcdFVSTC5yZXZva2VPYmplY3RVUkwodXJsKTtcblx0XHR9XG5cdFx0dGhpcy5fYmxvYlVybENhY2hlLmNsZWFyKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9sb2FkUmF3RGF0YShpbWFnZTogSUNhcm91c2VsSW1hZ2UpOiBQcm9taXNlPFVpbnQ4QXJyYXk+IHtcblx0XHRpZiAoaW1hZ2UuZGF0YSkge1xuXHRcdFx0cmV0dXJuIGltYWdlLmRhdGEgaW5zdGFuY2VvZiBVaW50OEFycmF5ID8gaW1hZ2UuZGF0YSA6IGltYWdlLmRhdGEuYnVmZmVyO1xuXHRcdH0gZWxzZSBpZiAoaW1hZ2UudXJpKSB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUoaW1hZ2UudXJpKTtcblx0XHRcdHJldHVybiBjb250ZW50LnZhbHVlLmJ1ZmZlcjtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBVaW50OEFycmF5KDApO1xuXHR9XG5cblx0cHJpdmF0ZSBfcHJlbG9hZEFkamFjZW50SW1hZ2VzKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgaWR4IG9mIFt0aGlzLl9jdXJyZW50SW5kZXggLSAxLCB0aGlzLl9jdXJyZW50SW5kZXggKyAxXSkge1xuXHRcdFx0aWYgKGlkeCA+PSAwICYmIGlkeCA8IHRoaXMuX2ZsYXRJbWFnZXMubGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnN0IGFkamFjZW50SW1hZ2UgPSB0aGlzLl9mbGF0SW1hZ2VzW2lkeF0uaW1hZ2U7XG5cdFx0XHRcdGlmIChpc1ZpZGVvTWltZVR5cGUoYWRqYWNlbnRJbWFnZS5taW1lVHlwZSkpIHtcblx0XHRcdFx0XHQvLyBGb3IgdmlkZW8sIHByZWxvYWQgcmF3IGRhdGEgaW50byB0aGUgZmlsZSBzZXJ2aWNlIGNhY2hlXG5cdFx0XHRcdFx0dGhpcy5fbG9hZFJhd0RhdGEoYWRqYWNlbnRJbWFnZSkuY2F0Y2goKCkgPT4geyAvKiBpZ25vcmUgKi8gfSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9hZEJsb2JVcmwoYWRqYWNlbnRJbWFnZSkudGhlbih1cmwgPT4ge1xuXHRcdFx0XHRcdFx0Ly8gUHJlLWRlY29kZSB2aWEgZGVjb2RlKCkgc28gdGhlIGNvbXBvc2l0b3IgZG9lc24ndCBibG9ja1xuXHRcdFx0XHRcdFx0Ly8gdGhlIG1haW4gdGhyZWFkIGRlY29kaW5nIHRoaXMgaW1hZ2UgZHVyaW5nIGNvbW1pdC5cblx0XHRcdFx0XHRcdGNvbnN0IGltZyA9IG5ldyBJbWFnZSgpO1xuXHRcdFx0XHRcdFx0aW1nLnNyYyA9IHVybDtcblx0XHRcdFx0XHRcdGltZy5kZWNvZGUoKS5jYXRjaCgoKSA9PiB7IC8qIGludmFsaWQgaW1hZ2UgKi8gfSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcmV2aW91cygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY3VycmVudEluZGV4ID4gMCkge1xuXHRcdFx0dGhpcy5fY3VycmVudEluZGV4LS07XG5cdFx0XHR0aGlzLnVwZGF0ZUN1cnJlbnRJbWFnZSgpO1xuXHRcdH1cblx0fVxuXG5cdG5leHQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRJbmRleCA8IHRoaXMuX2ZsYXRJbWFnZXMubGVuZ3RoIC0gMSkge1xuXHRcdFx0dGhpcy5fY3VycmVudEluZGV4Kys7XG5cdFx0XHR0aGlzLnVwZGF0ZUN1cnJlbnRJbWFnZSgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBDb21wdXRlIHRoZSBjdXJyZW50IGRpc3BsYXkgc2NhbGUgd2hlbiB0cmFuc2l0aW9uaW5nIGZyb20gJ2ZpdCcgdG8gbnVtZXJpYyB6b29tLlxuXHQgKi9cblx0cHJpdmF0ZSBfaW5pdFpvb21Gcm9tRml0KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZWxlbWVudHMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaW1nID0gdGhpcy5fZWxlbWVudHMubWFpbkltYWdlO1xuXHRcdGlmIChpbWcubmF0dXJhbFdpZHRoID4gMCkge1xuXHRcdFx0dGhpcy5fem9vbVNjYWxlID0gaW1nLmNsaWVudFdpZHRoIC8gaW1nLm5hdHVyYWxXaWR0aDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fem9vbVNjYWxlID0gMTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogWm9vbSBpbiB0byB0aGUgbmV4dCBwcmVkZWZpbmVkIHpvb20gbGV2ZWwuXG5cdCAqL1xuXHRwcml2YXRlIF96b29tSW4oKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3pvb21TY2FsZSA9PT0gJ2ZpdCcpIHtcblx0XHRcdHRoaXMuX2luaXRab29tRnJvbUZpdCgpO1xuXHRcdH1cblx0XHRjb25zdCBzY2FsZSA9IHRoaXMuX3pvb21TY2FsZSBhcyBudW1iZXI7XG5cdFx0bGV0IGkgPSAwO1xuXHRcdGZvciAoOyBpIDwgWk9PTV9MRVZFTFMubGVuZ3RoOyArK2kpIHtcblx0XHRcdGlmIChaT09NX0xFVkVMU1tpXSA+IHNjYWxlKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9hcHBseVpvb20oWk9PTV9MRVZFTFNbaV0gPz8gTUFYX1NDQUxFKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBab29tIG91dCB0byB0aGUgcHJldmlvdXMgcHJlZGVmaW5lZCB6b29tIGxldmVsLlxuXHQgKi9cblx0cHJpdmF0ZSBfem9vbU91dCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fem9vbVNjYWxlID09PSAnZml0Jykge1xuXHRcdFx0dGhpcy5faW5pdFpvb21Gcm9tRml0KCk7XG5cdFx0fVxuXHRcdGNvbnN0IHNjYWxlID0gdGhpcy5fem9vbVNjYWxlIGFzIG51bWJlcjtcblx0XHRsZXQgaSA9IFpPT01fTEVWRUxTLmxlbmd0aCAtIDE7XG5cdFx0Zm9yICg7IGkgPj0gMDsgLS1pKSB7XG5cdFx0XHRpZiAoWk9PTV9MRVZFTFNbaV0gPCBzY2FsZSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fYXBwbHlab29tKFpPT01fTEVWRUxTW2ldID8/IE1JTl9TQ0FMRSk7XG5cdH1cblxuXHQvKipcblx0ICogQXBwbHkgZml0LXRvLWNvbnRhaW5lciBvciBudW1lcmljIHpvb20gd2l0aCBzY3JvbGwtY2VudGVyIHByZXNlcnZhdGlvbi5cblx0ICovXG5cdHByaXZhdGUgX2FwcGx5Wm9vbShuZXdTY2FsZTogWm9vbVNjYWxlKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9lbGVtZW50cykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRhaW5lciA9IHRoaXMuX2VsZW1lbnRzLm1haW5JbWFnZUNvbnRhaW5lcjtcblx0XHRjb25zdCBpbWcgPSB0aGlzLl9lbGVtZW50cy5tYWluSW1hZ2U7XG5cblx0XHRpZiAobmV3U2NhbGUgPT09ICdmaXQnKSB7XG5cdFx0XHR0aGlzLl96b29tU2NhbGUgPSAnZml0Jztcblx0XHRcdGltZy5jbGFzc0xpc3QuYWRkKCdzY2FsZS10by1maXQnKTtcblx0XHRcdGltZy5jbGFzc0xpc3QucmVtb3ZlKCdwaXhlbGF0ZWQnKTtcblx0XHRcdGltZy5zdHlsZS56b29tID0gJyc7XG5cdFx0XHQvLyBSZW1vdmUgem9vbWVkL292ZXJmbG93IGJlZm9yZSBzY3JvbGxUbyB0byBhdm9pZCBhbiBleHBlbnNpdmVcblx0XHRcdC8vIHN5bmNocm9ub3VzIFNjcm9sbExheWVyIHRoYXQgYmxvY2tzIHRoZSBtYWluIHRocmVhZC5cblx0XHRcdGNvbnN0IHdhc1pvb21lZCA9IGNvbnRhaW5lci5jbGFzc0xpc3QuY29udGFpbnMoJ3pvb21lZCcpO1xuXHRcdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ3pvb21lZCcpO1xuXHRcdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ3pvb20tb3V0Jyk7XG5cdFx0XHRpZiAod2FzWm9vbWVkKSB7XG5cdFx0XHRcdGNvbnRhaW5lci5zY3JvbGxUbygwLCAwKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3Qgc2NhbGUgPSBjbGFtcChuZXdTY2FsZSwgTUlOX1NDQUxFLCBNQVhfU0NBTEUpO1xuXHRcdFx0dGhpcy5fem9vbVNjYWxlID0gc2NhbGU7XG5cblx0XHRcdC8vIENhcHR1cmUgc2Nyb2xsIGNlbnRlciByYXRpbyBiZWZvcmUgY2hhbmdpbmcgem9vbS5cblx0XHRcdGNvbnN0IGR4ID0gY29udGFpbmVyLnNjcm9sbFdpZHRoID4gMFxuXHRcdFx0XHQ/IChjb250YWluZXIuc2Nyb2xsTGVmdCArIGNvbnRhaW5lci5jbGllbnRXaWR0aCAvIDIpIC8gY29udGFpbmVyLnNjcm9sbFdpZHRoXG5cdFx0XHRcdDogMC41O1xuXHRcdFx0Y29uc3QgZHkgPSBjb250YWluZXIuc2Nyb2xsSGVpZ2h0ID4gMFxuXHRcdFx0XHQ/IChjb250YWluZXIuc2Nyb2xsVG9wICsgY29udGFpbmVyLmNsaWVudEhlaWdodCAvIDIpIC8gY29udGFpbmVyLnNjcm9sbEhlaWdodFxuXHRcdFx0XHQ6IDAuNTtcblxuXHRcdFx0aW1nLmNsYXNzTGlzdC5yZW1vdmUoJ3NjYWxlLXRvLWZpdCcpO1xuXHRcdFx0aW1nLmNsYXNzTGlzdC50b2dnbGUoJ3BpeGVsYXRlZCcsIHNjYWxlID49IFBJWEVMQVRJT05fVEhSRVNIT0xEKTtcblx0XHRcdGltZy5zdHlsZS56b29tID0gU3RyaW5nKHNjYWxlKTtcblx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCd6b29tZWQnKTtcblxuXHRcdFx0Ly8gUmVzdG9yZSBzY3JvbGwgY2VudGVyIFx1MjAxNCB3b3JrcyBiZWNhdXNlIHNldHRpbmcgaW1nLnN0eWxlLnpvb20gdHJpZ2dlcnNcblx0XHRcdC8vIHN5bmNocm9ub3VzIGxheW91dCwgc28gc2Nyb2xsV2lkdGgvc2Nyb2xsSGVpZ2h0IHJlZmxlY3QgdGhlIG5ldyBzaXplLlxuXHRcdFx0Y29uc3QgbmV3U2Nyb2xsWCA9IGNvbnRhaW5lci5zY3JvbGxXaWR0aCAqIGR4IC0gY29udGFpbmVyLmNsaWVudFdpZHRoIC8gMjtcblx0XHRcdGNvbnN0IG5ld1Njcm9sbFkgPSBjb250YWluZXIuc2Nyb2xsSGVpZ2h0ICogZHkgLSBjb250YWluZXIuY2xpZW50SGVpZ2h0IC8gMjtcblx0XHRcdGNvbnRhaW5lci5zY3JvbGxUbyhuZXdTY3JvbGxYLCBuZXdTY3JvbGxZKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBmb2N1cygpOiB2b2lkIHtcblx0XHRzdXBlci5mb2N1cygpO1xuXHRcdHRoaXMuX2VsZW1lbnRzPy5yb290LmZvY3VzKCk7XG5cdH1cblxuXHRvdmVycmlkZSBsYXlvdXQoZGltZW5zaW9uOiBEaW1lbnNpb24pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLl9jb250YWluZXIuc3R5bGUud2lkdGggPSBgJHtkaW1lbnNpb24ud2lkdGh9cHhgO1xuXHRcdFx0dGhpcy5fY29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke2RpbWVuc2lvbi5oZWlnaHR9cHhgO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHVCQUF1QixXQUFzQixXQUFXLFNBQVM7QUFDMUUsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxlQUFlO0FBRXhCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsYUFBYTtBQUN0QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGtCQUFrQjtBQUUzQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHVCQUF1QjtBQUVoQyxTQUEwQix1QkFBdUI7QUFDakQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBMkMsdUJBQXVCO0FBY2xFLE1BQU0scUJBQXFCO0FBQzNCLE1BQU0sWUFBWTtBQUNsQixNQUFNLFlBQVk7QUFDbEIsTUFBTSx1QkFBdUI7QUFDN0IsTUFBTSxjQUFjLENBQUMsS0FBSyxLQUFLLEtBQUssS0FBSyxLQUFLLEtBQUssS0FBSyxLQUFLLEtBQUssR0FBRyxLQUFLLEdBQUcsR0FBRyxHQUFHLEdBQUcsSUFBSSxJQUFJLEVBQUU7QUFFekYsSUFBTSxzQkFBTixjQUFrQyxXQUFXO0FBQUEsRUE2Qm5ELFlBQ0MsT0FDbUIsa0JBQ0osY0FDRSxnQkFDYyxjQUNHLGlCQUNqQztBQUNELFVBQU0sb0JBQW9CLElBQUksT0FBTyxrQkFBa0IsY0FBYyxj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
