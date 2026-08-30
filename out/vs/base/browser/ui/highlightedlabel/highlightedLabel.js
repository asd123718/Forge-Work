import * as dom from "../../dom.js";
import { getBaseLayerHoverDelegate } from "../hover/hoverDelegate2.js";
import { getDefaultHoverDelegate } from "../hover/hoverDelegateFactory.js";
import { renderLabelWithIcons } from "../iconLabel/iconLabels.js";
import { Disposable } from "../../../common/lifecycle.js";
import * as objects from "../../../common/objects.js";
class HighlightedLabel extends Disposable {
  /**
   * Create a new {@link HighlightedLabel}.
   *
   * @param container The parent container to append to.
   */
  constructor(container, options) {
    super();
    this.options = options;
    this.text = "";
    this.title = "";
    this.highlights = [];
    this.didEverRender = false;
    this.domNode = dom.append(container, dom.$("span.monaco-highlighted-label"));
  }
  /**
   * The label's DOM node.
   */
  get element() {
    return this.domNode;
  }
  /**
   * Set the label and highlights.
   *
   * @param text The label to display.
   * @param highlights The ranges to highlight.
   * @param title An optional title for the hover tooltip.
   * @param escapeNewLines Whether to escape new lines.
   * @returns
   */
  set(text, highlights = [], title = "", escapeNewLines, supportIcons) {
    if (!text) {
      text = "";
    }
    if (escapeNewLines) {
      text = HighlightedLabel.escapeNewLines(text, highlights);
    }
    if (this.didEverRender && this.text === text && this.title === title && objects.equals(this.highlights, highlights)) {
      return;
    }
    this.text = text;
    this.title = title;
    this.highlights = highlights;
    this.render(supportIcons);
  }
  render(supportIcons) {
    const children = [];
    let pos = 0;
    for (const highlight of this.highlights) {
      if (highlight.end === highlight.start) {
        continue;
      }
      if (pos < highlight.start) {
        const substring2 = this.text.substring(pos, highlight.start);
        if (supportIcons) {
          children.push(...renderLabelWithIcons(substring2, true));
        } else {
          children.push(substring2);
        }
        pos = highlight.start;
      }
      const substring = this.text.substring(pos, highlight.end);
      const element = dom.$("span.highlight", void 0, ...supportIcons ? renderLabelWithIcons(substring, true) : [substring]);
      if (highlight.extraClasses) {
        element.classList.add(...highlight.extraClasses);
      }
      children.push(element);
      pos = highlight.end;
    }
    if (pos < this.text.length) {
      const substring = this.text.substring(pos);
      if (supportIcons) {
        children.push(...renderLabelWithIcons(substring, true));
      } else {
        children.push(substring);
      }
    }
    dom.reset(this.domNode, ...children);
    if (!this.customHover && this.title !== "") {
      const hoverDelegate = this.options?.hoverDelegate ?? getDefaultHoverDelegate("mouse");
      this.customHover = this._register(getBaseLayerHoverDelegate().setupManagedHover(hoverDelegate, this.domNode, this.title));
    } else if (this.customHover) {
      this.customHover.update(this.title);
    }
    this.didEverRender = true;
  }
  static escapeNewLines(text, highlights) {
    let total = 0;
    let extra = 0;
    return text.replace(/\r\n|\r|\n/g, (match, offset) => {
      extra = match === "\r\n" ? -1 : 0;
      offset += total;
      for (const highlight of highlights) {
        if (highlight.end <= offset) {
          continue;
        }
        if (highlight.start >= offset) {
          highlight.start += extra;
        }
        if (highlight.end >= offset) {
          highlight.end += extra;
        }
      }
      total += extra;
      return "\u23CE";
    });
  }
}
export {
  HighlightedLabel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxicm93c2VyXFx1aVxcaGlnaGxpZ2h0ZWRsYWJlbFxcaGlnaGxpZ2h0ZWRMYWJlbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi9kb20uanMnO1xuaW1wb3J0IHR5cGUgeyBJTWFuYWdlZEhvdmVyIH0gZnJvbSAnLi4vaG92ZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi9ob3Zlci9ob3ZlckRlbGVnYXRlLmpzJztcbmltcG9ydCB7IGdldEJhc2VMYXllckhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi9ob3Zlci9ob3ZlckRlbGVnYXRlMi5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IHJlbmRlckxhYmVsV2l0aEljb25zIH0gZnJvbSAnLi4vaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgb2JqZWN0cyBmcm9tICcuLi8uLi8uLi9jb21tb24vb2JqZWN0cy5qcyc7XG5cbi8qKlxuICogQSByYW5nZSB0byBiZSBoaWdobGlnaHRlZC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJSGlnaGxpZ2h0IHtcblx0c3RhcnQ6IG51bWJlcjtcblx0ZW5kOiBudW1iZXI7XG5cdHJlYWRvbmx5IGV4dHJhQ2xhc3Nlcz86IHJlYWRvbmx5IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElIaWdobGlnaHRlZExhYmVsT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGhvdmVyRGVsZWdhdGU/OiBJSG92ZXJEZWxlZ2F0ZTtcbn1cblxuLyoqXG4gKiBBIHdpZGdldCB3aGljaCBjYW4gcmVuZGVyIGEgbGFiZWwgd2l0aCBzdWJzdHJpbmcgaGlnaGxpZ2h0cywgb2Z0ZW5cbiAqIG9yaWdpbmF0aW5nIGZyb20gYSBmaWx0ZXIgZnVuY3Rpb24gbGlrZSB0aGUgZnV6enkgbWF0Y2hlci5cbiAqL1xuZXhwb3J0IGNsYXNzIEhpZ2hsaWdodGVkTGFiZWwgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHRleHQ6IHN0cmluZyA9ICcnO1xuXHRwcml2YXRlIHRpdGxlOiBzdHJpbmcgPSAnJztcblx0cHJpdmF0ZSBoaWdobGlnaHRzOiByZWFkb25seSBJSGlnaGxpZ2h0W10gPSBbXTtcblx0cHJpdmF0ZSBkaWRFdmVyUmVuZGVyOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgY3VzdG9tSG92ZXI6IElNYW5hZ2VkSG92ZXIgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIENyZWF0ZSBhIG5ldyB7QGxpbmsgSGlnaGxpZ2h0ZWRMYWJlbH0uXG5cdCAqXG5cdCAqIEBwYXJhbSBjb250YWluZXIgVGhlIHBhcmVudCBjb250YWluZXIgdG8gYXBwZW5kIHRvLlxuXHQgKi9cblx0Y29uc3RydWN0b3IoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgcHJpdmF0ZSByZWFkb25seSBvcHRpb25zPzogSUhpZ2hsaWdodGVkTGFiZWxPcHRpb25zKSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuZG9tTm9kZSA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnc3Bhbi5tb25hY28taGlnaGxpZ2h0ZWQtbGFiZWwnKSk7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIGxhYmVsJ3MgRE9NIG5vZGUuXG5cdCAqL1xuXHRnZXQgZWxlbWVudCgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuZG9tTm9kZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZXQgdGhlIGxhYmVsIGFuZCBoaWdobGlnaHRzLlxuXHQgKlxuXHQgKiBAcGFyYW0gdGV4dCBUaGUgbGFiZWwgdG8gZGlzcGxheS5cblx0ICogQHBhcmFtIGhpZ2hsaWdodHMgVGhlIHJhbmdlcyB0byBoaWdobGlnaHQuXG5cdCAqIEBwYXJhbSB0aXRsZSBBbiBvcHRpb25hbCB0aXRsZSBmb3IgdGhlIGhvdmVyIHRvb2x0aXAuXG5cdCAqIEBwYXJhbSBlc2NhcGVOZXdMaW5lcyBXaGV0aGVyIHRvIGVzY2FwZSBuZXcgbGluZXMuXG5cdCAqIEByZXR1cm5zXG5cdCAqL1xuXHRzZXQodGV4dDogc3RyaW5nIHwgdW5kZWZpbmVkLCBoaWdobGlnaHRzOiByZWFkb25seSBJSGlnaGxpZ2h0W10gPSBbXSwgdGl0bGU6IHN0cmluZyA9ICcnLCBlc2NhcGVOZXdMaW5lcz86IGJvb2xlYW4sIHN1cHBvcnRJY29ucz86IGJvb2xlYW4pIHtcblx0XHRpZiAoIXRleHQpIHtcblx0XHRcdHRleHQgPSAnJztcblx0XHR9XG5cblx0XHRpZiAoZXNjYXBlTmV3TGluZXMpIHtcblx0XHRcdC8vIGFkanVzdHMgaGlnaGxpZ2h0cyBpbnBsYWNlXG5cdFx0XHR0ZXh0ID0gSGlnaGxpZ2h0ZWRMYWJlbC5lc2NhcGVOZXdMaW5lcyh0ZXh0LCBoaWdobGlnaHRzKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5kaWRFdmVyUmVuZGVyICYmIHRoaXMudGV4dCA9PT0gdGV4dCAmJiB0aGlzLnRpdGxlID09PSB0aXRsZSAmJiBvYmplY3RzLmVxdWFscyh0aGlzLmhpZ2hsaWdodHMsIGhpZ2hsaWdodHMpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy50ZXh0ID0gdGV4dDtcblx0XHR0aGlzLnRpdGxlID0gdGl0bGU7XG5cdFx0dGhpcy5oaWdobGlnaHRzID0gaGlnaGxpZ2h0cztcblx0XHR0aGlzLnJlbmRlcihzdXBwb3J0SWNvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXIoc3VwcG9ydEljb25zPzogYm9vbGVhbik6IHZvaWQge1xuXG5cdFx0Y29uc3QgY2hpbGRyZW46IEFycmF5PEhUTUxTcGFuRWxlbWVudCB8IHN0cmluZz4gPSBbXTtcblx0XHRsZXQgcG9zID0gMDtcblxuXHRcdGZvciAoY29uc3QgaGlnaGxpZ2h0IG9mIHRoaXMuaGlnaGxpZ2h0cykge1xuXHRcdFx0aWYgKGhpZ2hsaWdodC5lbmQgPT09IGhpZ2hsaWdodC5zdGFydCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHBvcyA8IGhpZ2hsaWdodC5zdGFydCkge1xuXHRcdFx0XHRjb25zdCBzdWJzdHJpbmcgPSB0aGlzLnRleHQuc3Vic3RyaW5nKHBvcywgaGlnaGxpZ2h0LnN0YXJ0KTtcblx0XHRcdFx0aWYgKHN1cHBvcnRJY29ucykge1xuXHRcdFx0XHRcdGNoaWxkcmVuLnB1c2goLi4ucmVuZGVyTGFiZWxXaXRoSWNvbnMoc3Vic3RyaW5nLCB0cnVlKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y2hpbGRyZW4ucHVzaChzdWJzdHJpbmcpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHBvcyA9IGhpZ2hsaWdodC5zdGFydDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc3Vic3RyaW5nID0gdGhpcy50ZXh0LnN1YnN0cmluZyhwb3MsIGhpZ2hsaWdodC5lbmQpO1xuXHRcdFx0Y29uc3QgZWxlbWVudCA9IGRvbS4kKCdzcGFuLmhpZ2hsaWdodCcsIHVuZGVmaW5lZCwgLi4uc3VwcG9ydEljb25zID8gcmVuZGVyTGFiZWxXaXRoSWNvbnMoc3Vic3RyaW5nLCB0cnVlKSA6IFtzdWJzdHJpbmddKTtcblxuXHRcdFx0aWYgKGhpZ2hsaWdodC5leHRyYUNsYXNzZXMpIHtcblx0XHRcdFx0ZWxlbWVudC5jbGFzc0xpc3QuYWRkKC4uLmhpZ2hsaWdodC5leHRyYUNsYXNzZXMpO1xuXHRcdFx0fVxuXG5cdFx0XHRjaGlsZHJlbi5wdXNoKGVsZW1lbnQpO1xuXHRcdFx0cG9zID0gaGlnaGxpZ2h0LmVuZDtcblx0XHR9XG5cblx0XHRpZiAocG9zIDwgdGhpcy50ZXh0Lmxlbmd0aCkge1xuXHRcdFx0Y29uc3Qgc3Vic3RyaW5nID0gdGhpcy50ZXh0LnN1YnN0cmluZyhwb3MsKTtcblx0XHRcdGlmIChzdXBwb3J0SWNvbnMpIHtcblx0XHRcdFx0Y2hpbGRyZW4ucHVzaCguLi5yZW5kZXJMYWJlbFdpdGhJY29ucyhzdWJzdHJpbmcsIHRydWUpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNoaWxkcmVuLnB1c2goc3Vic3RyaW5nKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRkb20ucmVzZXQodGhpcy5kb21Ob2RlLCAuLi5jaGlsZHJlbik7XG5cblx0XHRpZiAoIXRoaXMuY3VzdG9tSG92ZXIgJiYgdGhpcy50aXRsZSAhPT0gJycpIHtcblx0XHRcdGNvbnN0IGhvdmVyRGVsZWdhdGUgPSB0aGlzLm9wdGlvbnM/LmhvdmVyRGVsZWdhdGUgPz8gZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyk7XG5cdFx0XHR0aGlzLmN1c3RvbUhvdmVyID0gdGhpcy5fcmVnaXN0ZXIoZ2V0QmFzZUxheWVySG92ZXJEZWxlZ2F0ZSgpLnNldHVwTWFuYWdlZEhvdmVyKGhvdmVyRGVsZWdhdGUsIHRoaXMuZG9tTm9kZSwgdGhpcy50aXRsZSkpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5jdXN0b21Ib3Zlcikge1xuXHRcdFx0dGhpcy5jdXN0b21Ib3Zlci51cGRhdGUodGhpcy50aXRsZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5kaWRFdmVyUmVuZGVyID0gdHJ1ZTtcblx0fVxuXG5cdHN0YXRpYyBlc2NhcGVOZXdMaW5lcyh0ZXh0OiBzdHJpbmcsIGhpZ2hsaWdodHM6IHJlYWRvbmx5IElIaWdobGlnaHRbXSk6IHN0cmluZyB7XG5cdFx0bGV0IHRvdGFsID0gMDtcblx0XHRsZXQgZXh0cmEgPSAwO1xuXG5cdFx0cmV0dXJuIHRleHQucmVwbGFjZSgvXFxyXFxufFxccnxcXG4vZywgKG1hdGNoLCBvZmZzZXQpID0+IHtcblx0XHRcdGV4dHJhID0gbWF0Y2ggPT09ICdcXHJcXG4nID8gLTEgOiAwO1xuXHRcdFx0b2Zmc2V0ICs9IHRvdGFsO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGhpZ2hsaWdodCBvZiBoaWdobGlnaHRzKSB7XG5cdFx0XHRcdGlmIChoaWdobGlnaHQuZW5kIDw9IG9mZnNldCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChoaWdobGlnaHQuc3RhcnQgPj0gb2Zmc2V0KSB7XG5cdFx0XHRcdFx0aGlnaGxpZ2h0LnN0YXJ0ICs9IGV4dHJhO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChoaWdobGlnaHQuZW5kID49IG9mZnNldCkge1xuXHRcdFx0XHRcdGhpZ2hsaWdodC5lbmQgKz0gZXh0cmE7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dG90YWwgKz0gZXh0cmE7XG5cdFx0XHRyZXR1cm4gJ1xcdTIzQ0UnO1xuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFNBQVM7QUFHckIsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxrQkFBa0I7QUFDM0IsWUFBWSxhQUFhO0FBbUJsQixNQUFNLHlCQUF5QixXQUFXO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBY2hELFlBQVksV0FBeUMsU0FBb0M7QUFDeEYsVUFBTTtBQUQ4QztBQVhyRCxTQUFRLE9BQWU7QUFDdkIsU0FBUSxRQUFnQjtBQUN4QixTQUFRLGFBQW9DLENBQUM7QUFDN0MsU0FBUSxnQkFBeUI7QUFXaEMsU0FBSyxVQUFVLElBQUksT0FBTyxXQUFXLElBQUksRUFBRSwrQkFBK0IsQ0FBQztBQUFBLEVBQzVFO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxJQUFJLFVBQXVCO0FBQzFCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVdBLElBQUksTUFBMEIsYUFBb0MsQ0FBQyxHQUFHLFFBQWdCLElBQUksZ0JBQTBCLGNBQXdCO0FBQzNJLFFBQUksQ0FBQyxNQUFNO0FBQ1YsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLGdCQUFnQjtBQUVuQixhQUFPLGlCQUFpQixlQUFlLE1BQU0sVUFBVTtBQUFBLElBQ3hEO0FBRUEsUUFBSSxLQUFLLGlCQUFpQixLQUFLLFNBQVMsUUFBUSxLQUFLLFVBQVUsU0FBUyxRQUFRLE9BQU8sS0FBSyxZQUFZLFVBQVUsR0FBRztBQUNwSDtBQUFBLElBQ0Q7QUFFQSxTQUFLLE9BQU87QUFDWixTQUFLLFFBQVE7QUFDYixTQUFLLGFBQWE7QUFDbEIsU0FBSyxPQUFPLFlBQVk7QUFBQSxFQUN6QjtBQUFBLEVBRVEsT0FBTyxjQUE4QjtBQUU1QyxVQUFNLFdBQTRDLENBQUM7QUFDbkQsUUFBSSxNQUFNO0FBRVYsZUFBVyxhQUFhLEtBQUssWUFBWTtBQUN4QyxVQUFJLFVBQVUsUUFBUSxVQUFVLE9BQU87QUFDdEM7QUFBQSxNQUNEO0FBRUEsVUFBSSxNQUFNLFVBQVUsT0FBTztBQUMxQixjQUFNQSxhQUFZLEtBQUssS0FBSyxVQUFVLEtBQUssVUFBVSxLQUFLO0FBQzFELFlBQUksY0FBYztBQUNqQixtQkFBUyxLQUFLLEdBQUcscUJBQXFCQSxZQUFXLElBQUksQ0FBQztBQUFBLFFBQ3ZELE9BQU87QUFDTixtQkFBUyxLQUFLQSxVQUFTO0FBQUEsUUFDeEI7QUFDQSxjQUFNLFVBQVU7QUFBQSxNQUNqQjtBQUVBLFlBQU0sWUFBWSxLQUFLLEtBQUssVUFBVSxLQUFLLFVBQVUsR0FBRztBQUN4RCxZQUFNLFVBQVUsSUFBSSxFQUFFLGtCQUFrQixRQUFXLEdBQUcsZUFBZSxxQkFBcUIsV0FBVyxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUM7QUFFeEgsVUFBSSxVQUFVLGNBQWM7QUFDM0IsZ0JBQVEsVUFBVSxJQUFJLEdBQUcsVUFBVSxZQUFZO0FBQUEsTUFDaEQ7QUFFQSxlQUFTLEtBQUssT0FBTztBQUNyQixZQUFNLFVBQVU7QUFBQSxJQUNqQjtBQUVBLFFBQUksTUFBTSxLQUFLLEtBQUssUUFBUTtBQUMzQixZQUFNLFlBQVksS0FBSyxLQUFLLFVBQVUsR0FBSTtBQUMxQyxVQUFJLGNBQWM7QUFDakIsaUJBQVMsS0FBSyxHQUFHLHFCQUFxQixXQUFXLElBQUksQ0FBQztBQUFBLE1BQ3ZELE9BQU87QUFDTixpQkFBUyxLQUFLLFNBQVM7QUFBQSxNQUN4QjtBQUFBLElBQ0Q7QUFFQSxRQUFJLE1BQU0sS0FBSyxTQUFTLEdBQUcsUUFBUTtBQUVuQyxRQUFJLENBQUMsS0FBSyxlQUFlLEtBQUssVUFBVSxJQUFJO0FBQzNDLFlBQU0sZ0JBQWdCLEtBQUssU0FBUyxpQkFBaUIsd0JBQXdCLE9BQU87QUFDcEYsV0FBSyxjQUFjLEtBQUssVUFBVSwwQkFBMEIsRUFBRSxrQkFBa0IsZUFBZSxLQUFLLFNBQVMsS0FBSyxLQUFLLENBQUM7QUFBQSxJQUN6SCxXQUFXLEtBQUssYUFBYTtBQUM1QixXQUFLLFlBQVksT0FBTyxLQUFLLEtBQUs7QUFBQSxJQUNuQztBQUVBLFNBQUssZ0JBQWdCO0FBQUEsRUFDdEI7QUFBQSxFQUVBLE9BQU8sZUFBZSxNQUFjLFlBQTJDO0FBQzlFLFFBQUksUUFBUTtBQUNaLFFBQUksUUFBUTtBQUVaLFdBQU8sS0FBSyxRQUFRLGVBQWUsQ0FBQyxPQUFPLFdBQVc7QUFDckQsY0FBUSxVQUFVLFNBQVMsS0FBSztBQUNoQyxnQkFBVTtBQUVWLGlCQUFXLGFBQWEsWUFBWTtBQUNuQyxZQUFJLFVBQVUsT0FBTyxRQUFRO0FBQzVCO0FBQUEsUUFDRDtBQUNBLFlBQUksVUFBVSxTQUFTLFFBQVE7QUFDOUIsb0JBQVUsU0FBUztBQUFBLFFBQ3BCO0FBQ0EsWUFBSSxVQUFVLE9BQU8sUUFBUTtBQUM1QixvQkFBVSxPQUFPO0FBQUEsUUFDbEI7QUFBQSxNQUNEO0FBRUEsZUFBUztBQUNULGFBQU87QUFBQSxJQUNSLENBQUM7QUFBQSxFQUNGO0FBQ0Q7IiwKICAibmFtZXMiOiBbInN1YnN0cmluZyJdCn0K
