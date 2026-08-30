import { clearNode } from "../../../base/browser/dom.js";
import { createCSSRule, createStyleSheet } from "../../../base/browser/domStylesheets.js";
import { RunOnceScheduler } from "../../../base/common/async.js";
var ZIndex = /* @__PURE__ */ ((ZIndex2) => {
  ZIndex2[ZIndex2["Base"] = 0] = "Base";
  ZIndex2[ZIndex2["Sash"] = 35] = "Sash";
  ZIndex2[ZIndex2["SuggestWidget"] = 40] = "SuggestWidget";
  ZIndex2[ZIndex2["Hover"] = 50] = "Hover";
  ZIndex2[ZIndex2["DragImage"] = 1e3] = "DragImage";
  ZIndex2[ZIndex2["MenubarMenuItemsHolder"] = 2e3] = "MenubarMenuItemsHolder";
  ZIndex2[ZIndex2["ContextView"] = 2500] = "ContextView";
  ZIndex2[ZIndex2["ModalDialog"] = 2600] = "ModalDialog";
  ZIndex2[ZIndex2["PaneDropOverlay"] = 1e4] = "PaneDropOverlay";
  return ZIndex2;
})(ZIndex || {});
const ZIndexValues = Object.keys(ZIndex).filter((key) => !isNaN(Number(key))).map((key) => Number(key)).sort((a, b) => b - a);
function findBase(z) {
  for (const zi of ZIndexValues) {
    if (z >= zi) {
      return zi;
    }
  }
  return -1;
}
class ZIndexRegistry {
  constructor() {
    this.styleSheet = createStyleSheet();
    this.zIndexMap = /* @__PURE__ */ new Map();
    this.scheduler = new RunOnceScheduler(() => this.updateStyleElement(), 200);
  }
  registerZIndex(relativeLayer, z, name) {
    if (this.zIndexMap.get(name)) {
      throw new Error(`z-index with name ${name} has already been registered.`);
    }
    const proposedZValue = relativeLayer + z;
    if (findBase(proposedZValue) !== relativeLayer) {
      throw new Error(`Relative layer: ${relativeLayer} + z-index: ${z} exceeds next layer ${proposedZValue}.`);
    }
    this.zIndexMap.set(name, proposedZValue);
    this.scheduler.schedule();
    return this.getVarName(name);
  }
  getVarName(name) {
    return `--z-index-${name}`;
  }
  updateStyleElement() {
    clearNode(this.styleSheet);
    let ruleBuilder = "";
    this.zIndexMap.forEach((zIndex, name) => {
      ruleBuilder += `${this.getVarName(name)}: ${zIndex};
`;
    });
    createCSSRule(":root", ruleBuilder, this.styleSheet);
  }
}
const zIndexRegistry = new ZIndexRegistry();
function registerZIndex(relativeLayer, z, name) {
  return zIndexRegistry.registerZIndex(relativeLayer, z, name);
}
export {
  ZIndex,
  registerZIndex
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcbGF5b3V0XFxicm93c2VyXFx6SW5kZXhSZWdpc3RyeS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGNsZWFyTm9kZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgY3JlYXRlQ1NTUnVsZSwgY3JlYXRlU3R5bGVTaGVldCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb21TdHlsZXNoZWV0cy5qcyc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuXG5leHBvcnQgZW51bSBaSW5kZXgge1xuXHRCYXNlID0gMCxcblx0U2FzaCA9IDM1LFxuXHRTdWdnZXN0V2lkZ2V0ID0gNDAsXG5cdEhvdmVyID0gNTAsXG5cdERyYWdJbWFnZSA9IDEwMDAsXG5cdE1lbnViYXJNZW51SXRlbXNIb2xkZXIgPSAyMDAwLCAvLyBxdWljay1pbnB1dC13aWRnZXRcblx0Q29udGV4dFZpZXcgPSAyNTAwLFxuXHRNb2RhbERpYWxvZyA9IDI2MDAsXG5cdFBhbmVEcm9wT3ZlcmxheSA9IDEwMDAwXG59XG5cbmNvbnN0IFpJbmRleFZhbHVlcyA9IE9iamVjdC5rZXlzKFpJbmRleCkuZmlsdGVyKGtleSA9PiAhaXNOYU4oTnVtYmVyKGtleSkpKS5tYXAoa2V5ID0+IE51bWJlcihrZXkpKS5zb3J0KChhLCBiKSA9PiBiIC0gYSk7XG5mdW5jdGlvbiBmaW5kQmFzZSh6OiBudW1iZXIpIHtcblx0Zm9yIChjb25zdCB6aSBvZiBaSW5kZXhWYWx1ZXMpIHtcblx0XHRpZiAoeiA+PSB6aSkge1xuXHRcdFx0cmV0dXJuIHppO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiAtMTtcbn1cblxuY2xhc3MgWkluZGV4UmVnaXN0cnkge1xuXHRwcml2YXRlIHN0eWxlU2hlZXQ6IEhUTUxTdHlsZUVsZW1lbnQ7XG5cdHByaXZhdGUgekluZGV4TWFwOiBNYXA8c3RyaW5nLCBudW1iZXI+O1xuXHRwcml2YXRlIHNjaGVkdWxlcjogUnVuT25jZVNjaGVkdWxlcjtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dGhpcy5zdHlsZVNoZWV0ID0gY3JlYXRlU3R5bGVTaGVldCgpO1xuXHRcdHRoaXMuekluZGV4TWFwID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0XHR0aGlzLnNjaGVkdWxlciA9IG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMudXBkYXRlU3R5bGVFbGVtZW50KCksIDIwMCk7XG5cdH1cblxuXHRyZWdpc3RlclpJbmRleChyZWxhdGl2ZUxheWVyOiBaSW5kZXgsIHo6IG51bWJlciwgbmFtZTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRpZiAodGhpcy56SW5kZXhNYXAuZ2V0KG5hbWUpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYHotaW5kZXggd2l0aCBuYW1lICR7bmFtZX0gaGFzIGFscmVhZHkgYmVlbiByZWdpc3RlcmVkLmApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb3Bvc2VkWlZhbHVlID0gcmVsYXRpdmVMYXllciArIHo7XG5cdFx0aWYgKGZpbmRCYXNlKHByb3Bvc2VkWlZhbHVlKSAhPT0gcmVsYXRpdmVMYXllcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBSZWxhdGl2ZSBsYXllcjogJHtyZWxhdGl2ZUxheWVyfSArIHotaW5kZXg6ICR7en0gZXhjZWVkcyBuZXh0IGxheWVyICR7cHJvcG9zZWRaVmFsdWV9LmApO1xuXHRcdH1cblxuXHRcdHRoaXMuekluZGV4TWFwLnNldChuYW1lLCBwcm9wb3NlZFpWYWx1ZSk7XG5cdFx0dGhpcy5zY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRyZXR1cm4gdGhpcy5nZXRWYXJOYW1lKG5hbWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRWYXJOYW1lKG5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAtLXotaW5kZXgtJHtuYW1lfWA7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVN0eWxlRWxlbWVudCgpOiB2b2lkIHtcblx0XHRjbGVhck5vZGUodGhpcy5zdHlsZVNoZWV0KTtcblx0XHRsZXQgcnVsZUJ1aWxkZXIgPSAnJztcblx0XHR0aGlzLnpJbmRleE1hcC5mb3JFYWNoKCh6SW5kZXgsIG5hbWUpID0+IHtcblx0XHRcdHJ1bGVCdWlsZGVyICs9IGAke3RoaXMuZ2V0VmFyTmFtZShuYW1lKX06ICR7ekluZGV4fTtcXG5gO1xuXHRcdH0pO1xuXHRcdGNyZWF0ZUNTU1J1bGUoJzpyb290JywgcnVsZUJ1aWxkZXIsIHRoaXMuc3R5bGVTaGVldCk7XG5cdH1cbn1cblxuY29uc3QgekluZGV4UmVnaXN0cnkgPSBuZXcgWkluZGV4UmVnaXN0cnkoKTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyWkluZGV4KHJlbGF0aXZlTGF5ZXI6IFpJbmRleCwgejogbnVtYmVyLCBuYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gekluZGV4UmVnaXN0cnkucmVnaXN0ZXJaSW5kZXgocmVsYXRpdmVMYXllciwgeiwgbmFtZSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGVBQWUsd0JBQXdCO0FBQ2hELFNBQVMsd0JBQXdCO0FBRTFCLElBQUssU0FBTCxrQkFBS0EsWUFBTDtBQUNOLEVBQUFBLGdCQUFBLFVBQU8sS0FBUDtBQUNBLEVBQUFBLGdCQUFBLFVBQU8sTUFBUDtBQUNBLEVBQUFBLGdCQUFBLG1CQUFnQixNQUFoQjtBQUNBLEVBQUFBLGdCQUFBLFdBQVEsTUFBUjtBQUNBLEVBQUFBLGdCQUFBLGVBQVksT0FBWjtBQUNBLEVBQUFBLGdCQUFBLDRCQUF5QixPQUF6QjtBQUNBLEVBQUFBLGdCQUFBLGlCQUFjLFFBQWQ7QUFDQSxFQUFBQSxnQkFBQSxpQkFBYyxRQUFkO0FBQ0EsRUFBQUEsZ0JBQUEscUJBQWtCLE9BQWxCO0FBVFcsU0FBQUE7QUFBQSxHQUFBO0FBWVosTUFBTSxlQUFlLE9BQU8sS0FBSyxNQUFNLEVBQUUsT0FBTyxTQUFPLENBQUMsTUFBTSxPQUFPLEdBQUcsQ0FBQyxDQUFDLEVBQUUsSUFBSSxTQUFPLE9BQU8sR0FBRyxDQUFDLEVBQUUsS0FBSyxDQUFDLEdBQUcsTUFBTSxJQUFJLENBQUM7QUFDeEgsU0FBUyxTQUFTLEdBQVc7QUFDNUIsYUFBVyxNQUFNLGNBQWM7QUFDOUIsUUFBSSxLQUFLLElBQUk7QUFDWixhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFFQSxTQUFPO0FBQ1I7QUFFQSxNQUFNLGVBQWU7QUFBQSxFQUlwQixjQUFjO0FBQ2IsU0FBSyxhQUFhLGlCQUFpQjtBQUNuQyxTQUFLLFlBQVksb0JBQUksSUFBb0I7QUFDekMsU0FBSyxZQUFZLElBQUksaUJBQWlCLE1BQU0sS0FBSyxtQkFBbUIsR0FBRyxHQUFHO0FBQUEsRUFDM0U7QUFBQSxFQUVBLGVBQWUsZUFBdUIsR0FBVyxNQUFzQjtBQUN0RSxRQUFJLEtBQUssVUFBVSxJQUFJLElBQUksR0FBRztBQUM3QixZQUFNLElBQUksTUFBTSxxQkFBcUIsSUFBSSwrQkFBK0I7QUFBQSxJQUN6RTtBQUVBLFVBQU0saUJBQWlCLGdCQUFnQjtBQUN2QyxRQUFJLFNBQVMsY0FBYyxNQUFNLGVBQWU7QUFDL0MsWUFBTSxJQUFJLE1BQU0sbUJBQW1CLGFBQWEsZUFBZSxDQUFDLHVCQUF1QixjQUFjLEdBQUc7QUFBQSxJQUN6RztBQUVBLFNBQUssVUFBVSxJQUFJLE1BQU0sY0FBYztBQUN2QyxTQUFLLFVBQVUsU0FBUztBQUN4QixXQUFPLEtBQUssV0FBVyxJQUFJO0FBQUEsRUFDNUI7QUFBQSxFQUVRLFdBQVcsTUFBc0I7QUFDeEMsV0FBTyxhQUFhLElBQUk7QUFBQSxFQUN6QjtBQUFBLEVBRVEscUJBQTJCO0FBQ2xDLGNBQVUsS0FBSyxVQUFVO0FBQ3pCLFFBQUksY0FBYztBQUNsQixTQUFLLFVBQVUsUUFBUSxDQUFDLFFBQVEsU0FBUztBQUN4QyxxQkFBZSxHQUFHLEtBQUssV0FBVyxJQUFJLENBQUMsS0FBSyxNQUFNO0FBQUE7QUFBQSxJQUNuRCxDQUFDO0FBQ0Qsa0JBQWMsU0FBUyxhQUFhLEtBQUssVUFBVTtBQUFBLEVBQ3BEO0FBQ0Q7QUFFQSxNQUFNLGlCQUFpQixJQUFJLGVBQWU7QUFFbkMsU0FBUyxlQUFlLGVBQXVCLEdBQVcsTUFBc0I7QUFDdEYsU0FBTyxlQUFlLGVBQWUsZUFBZSxHQUFHLElBQUk7QUFDNUQ7IiwKICAibmFtZXMiOiBbIlpJbmRleCJdCn0K
