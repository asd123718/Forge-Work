var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
import assert from "assert";
import { TreeFindMatchType, TreeFindMode } from "../../../../../base/browser/ui/tree/abstractTree.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { basename } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { WorkbenchCompressibleAsyncDataTree } from "../../../../../platform/list/browser/listService.js";
import { ISearchService } from "../../../../services/search/common/search.js";
import { workbenchInstantiationService } from "../../../../test/browser/workbenchTestServices.js";
import { NullFilesConfigurationService, TestFileService } from "../../../../test/common/workbenchTestServices.js";
import { IExplorerService } from "../../browser/files.js";
import { ExplorerFindProvider } from "../../browser/views/explorerViewer.js";
import { ExplorerItem } from "../../common/explorerModel.js";
var require_explorerFindProvider_test = __commonJS({
  "C:\\Project\\Forge_Duplicate2\\forge\\src\\vs\\workbench\\contrib\\files\\test\\browser\\explorerFindProvider.test.ts"(exports) {
    function find(element, id) {
      if (element.name === id) {
        return element;
      }
      if (!element.children) {
        return void 0;
      }
      for (const child of element.children.values()) {
        const result = find(child, id);
        if (result) {
          return result;
        }
      }
      return void 0;
    }
    class Renderer {
      constructor() {
        this.templateId = "default";
      }
      renderTemplate(container) {
        return container;
      }
      renderElement(element, index, templateData) {
        templateData.textContent = element.element.name;
      }
      disposeTemplate(templateData) {
      }
      renderCompressedElements(node, index, templateData) {
        const result = [];
        for (const element of node.element.elements) {
          result.push(element.name);
        }
        templateData.textContent = result.join("/");
      }
    }
    class IdentityProvider {
      getId(element) {
        return {
          toString: () => {
            return element.name;
          }
        };
      }
    }
    class VirtualDelegate {
      getHeight() {
        return 20;
      }
      getTemplateId(element) {
        return "default";
      }
    }
    class DataSource {
      hasChildren(element) {
        return !!element.children && element.children.size > 0;
      }
      getChildren(element) {
        return Promise.resolve(Array.from(element.children.values()) || []);
      }
      getParent(element) {
        return element.parent;
      }
    }
    class AccessibilityProvider {
      getWidgetAriaLabel() {
        return "";
      }
      getAriaLabel(stat) {
        return stat.name;
      }
    }
    class KeyboardNavigationLabelProvider {
      getKeyboardNavigationLabel(stat) {
        return stat.name;
      }
      getCompressedNodeKeyboardNavigationLabel(stats) {
        return stats.map((stat) => stat.name).join("/");
      }
    }
    class CompressionDelegate {
      constructor(dataSource) {
        this.dataSource = dataSource;
      }
      isIncompressible(element) {
        return !this.dataSource.hasChildren(element);
      }
    }
    class TestFilesFilter {
      filter() {
        return true;
      }
      isIgnored() {
        return false;
      }
      dispose() {
      }
    }
    suite("Find Provider - ExplorerView", () => {
      const disposables = ensureNoDisposablesAreLeakedInTestSuite();
      const fileService = new TestFileService();
      const configService = new TestConfigurationService();
      function createStat(path, isFolder) {
        return new ExplorerItem(URI.from({ scheme: "file", path }), fileService, configService, NullFilesConfigurationService, void 0, isFolder);
      }
      let root;
      let instantiationService;
      const searchMappings = /* @__PURE__ */ new Map([
        ["bb", [URI.file("/root/b/bb/bbb.txt"), URI.file("/root/a/ab/abb.txt"), URI.file("/root/b/bb/bba.txt")]]
      ]);
      setup(() => {
        root = createStat.call(exports, "/root", true);
        const a = createStat.call(exports, "/root/a", true);
        const aa = createStat.call(exports, "/root/a/aa", true);
        const ab = createStat.call(exports, "/root/a/ab", true);
        const aba = createStat.call(exports, "/root/a/ab/aba.txt", false);
        const abb = createStat.call(exports, "/root/a/ab/abb.txt", false);
        const b = createStat.call(exports, "/root/b", true);
        const ba = createStat.call(exports, "/root/b/ba", true);
        const baa = createStat.call(exports, "/root/b/ba/baa.txt", false);
        const bab = createStat.call(exports, "/root/b/ba/bab.txt", false);
        const bb = createStat.call(exports, "/root/b/bb", true);
        root.addChild(a);
        a.addChild(aa);
        a.addChild(ab);
        ab.addChild(aba);
        ab.addChild(abb);
        root.addChild(b);
        b.addChild(ba);
        ba.addChild(baa);
        ba.addChild(bab);
        b.addChild(bb);
        instantiationService = workbenchInstantiationService(void 0, disposables);
        instantiationService.stub(IExplorerService, {
          roots: [root],
          refresh: () => Promise.resolve(),
          findClosest: (resource) => {
            return find(root, basename(resource)) ?? null;
          }
        });
        instantiationService.stub(ISearchService, {
          fileSearch(query, token) {
            const filePattern = query.filePattern?.replace(/\//g, "").replace(/\*/g, "").replace(/\[/g, "").replace(/\]/g, "").replace(/[A-Z]/g, "") ?? "";
            const fileMatches = (searchMappings.get(filePattern) ?? []).map((u) => ({ resource: u }));
            return Promise.resolve({ results: fileMatches, messages: [] });
          },
          schemeHasFileSearchProvider() {
            return true;
          }
        });
      });
      test("find provider", async function() {
        const disposables2 = new DisposableStore();
        const container = document.createElement("div");
        const dataSource = new DataSource();
        const compressionDelegate = new CompressionDelegate(dataSource);
        const keyboardNavigationLabelProvider = new KeyboardNavigationLabelProvider();
        const accessibilityProvider = new AccessibilityProvider();
        const filter = instantiationService.createInstance(TestFilesFilter);
        const options = { identityProvider: new IdentityProvider(), keyboardNavigationLabelProvider, accessibilityProvider };
        const tree = disposables2.add(instantiationService.createInstance(WorkbenchCompressibleAsyncDataTree, "test", container, new VirtualDelegate(), compressionDelegate, [new Renderer()], dataSource, options));
        tree.layout(200);
        await tree.setInput(root);
        const findProvider = instantiationService.createInstance(ExplorerFindProvider, filter, () => tree);
        findProvider.startSession();
        assert.strictEqual(find(root, "abb.txt") !== void 0, true);
        assert.strictEqual(find(root, "bba.txt") !== void 0, false);
        assert.strictEqual(find(root, "bbb.txt") !== void 0, false);
        assert.strictEqual(find(root, "abb.txt")?.isMarkedAsFiltered(), false);
        assert.strictEqual(find(root, "a")?.isMarkedAsFiltered(), false);
        assert.strictEqual(find(root, "ab")?.isMarkedAsFiltered(), false);
        await findProvider.find("bb", { matchType: TreeFindMatchType.Contiguous, findMode: TreeFindMode.Filter }, new CancellationTokenSource().token);
        assert.strictEqual(find(root, "abb.txt") !== void 0, true);
        assert.strictEqual(find(root, "bba.txt") !== void 0, true);
        assert.strictEqual(find(root, "bbb.txt") !== void 0, true);
        assert.strictEqual(find(root, "abb.txt")?.isMarkedAsFiltered(), true);
        assert.strictEqual(find(root, "bba.txt")?.isMarkedAsFiltered(), true);
        assert.strictEqual(find(root, "bbb.txt")?.isMarkedAsFiltered(), true);
        assert.strictEqual(find(root, "a")?.isMarkedAsFiltered(), true);
        assert.strictEqual(find(root, "ab")?.isMarkedAsFiltered(), true);
        assert.strictEqual(find(root, "b")?.isMarkedAsFiltered(), true);
        assert.strictEqual(find(root, "bb")?.isMarkedAsFiltered(), true);
        assert.strictEqual(find(root, "aa")?.isMarkedAsFiltered(), false);
        assert.strictEqual(find(root, "ba")?.isMarkedAsFiltered(), false);
        assert.strictEqual(find(root, "aba.txt")?.isMarkedAsFiltered(), false);
        await findProvider.endSession();
        assert.strictEqual(find(root, "abb.txt") !== void 0, true);
        assert.strictEqual(find(root, "baa.txt") !== void 0, true);
        assert.strictEqual(find(root, "baa.txt") !== void 0, true);
        assert.strictEqual(find(root, "bba.txt") !== void 0, false);
        assert.strictEqual(find(root, "bbb.txt") !== void 0, false);
        assert.strictEqual(find(root, "a")?.isMarkedAsFiltered(), false);
        assert.strictEqual(find(root, "ab")?.isMarkedAsFiltered(), false);
        assert.strictEqual(find(root, "b")?.isMarkedAsFiltered(), false);
        assert.strictEqual(find(root, "bb")?.isMarkedAsFiltered(), false);
        disposables2.dispose();
      });
    });
  }
});
export default require_explorerFindProvider_test();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGZpbGVzXFx0ZXN0XFxicm93c2VyXFxleHBsb3JlckZpbmRQcm92aWRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgSUlkZW50aXR5UHJvdmlkZXIsIElLZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyLCBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IFRyZWVGaW5kTWF0Y2hUeXBlLCBUcmVlRmluZE1vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9hYnN0cmFjdFRyZWUuanMnO1xuaW1wb3J0IHsgSVRyZWVDb21wcmVzc2lvbkRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvYXN5bmNEYXRhVHJlZS5qcyc7XG5pbXBvcnQgeyBJQ29tcHJlc3NlZFRyZWVOb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvY29tcHJlc3NlZE9iamVjdFRyZWVNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvb2JqZWN0VHJlZS5qcyc7XG5pbXBvcnQgeyBJQXN5bmNEYXRhU291cmNlLCBJVHJlZUZpbHRlciwgSVRyZWVOb2RlLCBUcmVlRmlsdGVyUmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRnV6enlTY29yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb21wcmVzc2libGVBc3luY0RhdGFUcmVlT3B0aW9ucywgV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRmlsZU1hdGNoLCBJRmlsZVF1ZXJ5LCBJU2VhcmNoQ29tcGxldGUsIElTZWFyY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IE51bGxGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLCBUZXN0RmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgSUV4cGxvcmVyU2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvZmlsZXMuanMnO1xuaW1wb3J0IHsgRXhwbG9yZXJGaW5kUHJvdmlkZXIsIEZpbGVzRmlsdGVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci92aWV3cy9leHBsb3JlclZpZXdlci5qcyc7XG5pbXBvcnQgeyBFeHBsb3Jlckl0ZW0gfSBmcm9tICcuLi8uLi9jb21tb24vZXhwbG9yZXJNb2RlbC5qcyc7XG5cbmZ1bmN0aW9uIGZpbmQoZWxlbWVudDogRXhwbG9yZXJJdGVtLCBpZDogc3RyaW5nKTogRXhwbG9yZXJJdGVtIHwgdW5kZWZpbmVkIHtcblx0aWYgKGVsZW1lbnQubmFtZSA9PT0gaWQpIHtcblx0XHRyZXR1cm4gZWxlbWVudDtcblx0fVxuXG5cdGlmICghZWxlbWVudC5jaGlsZHJlbikge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRmb3IgKGNvbnN0IGNoaWxkIG9mIGVsZW1lbnQuY2hpbGRyZW4udmFsdWVzKCkpIHtcblx0XHRjb25zdCByZXN1bHQgPSBmaW5kKGNoaWxkLCBpZCk7XG5cblx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmNsYXNzIFJlbmRlcmVyIGltcGxlbWVudHMgSUNvbXByZXNzaWJsZVRyZWVSZW5kZXJlcjxFeHBsb3Jlckl0ZW0sIEZ1enp5U2NvcmUsIEhUTUxFbGVtZW50PiB7XG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQgPSAnZGVmYXVsdCc7XG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIGNvbnRhaW5lcjtcblx0fVxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxFeHBsb3Jlckl0ZW0sIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLnRleHRDb250ZW50ID0gZWxlbWVudC5lbGVtZW50Lm5hbWU7XG5cdH1cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHQvLyBub29wXG5cdH1cblx0cmVuZGVyQ29tcHJlc3NlZEVsZW1lbnRzKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPEV4cGxvcmVySXRlbT4sIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIG5vZGUuZWxlbWVudC5lbGVtZW50cykge1xuXHRcdFx0cmVzdWx0LnB1c2goZWxlbWVudC5uYW1lKTtcblx0XHR9XG5cblx0XHR0ZW1wbGF0ZURhdGEudGV4dENvbnRlbnQgPSByZXN1bHQuam9pbignLycpO1xuXHR9XG59XG5cbmNsYXNzIElkZW50aXR5UHJvdmlkZXIgaW1wbGVtZW50cyBJSWRlbnRpdHlQcm92aWRlcjxFeHBsb3Jlckl0ZW0+IHtcblx0Z2V0SWQoZWxlbWVudDogRXhwbG9yZXJJdGVtKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHRvU3RyaW5nOiAoKSA9PiB7IHJldHVybiBlbGVtZW50Lm5hbWU7IH1cblx0XHR9O1xuXHR9XG59XG5cbmNsYXNzIFZpcnR1YWxEZWxlZ2F0ZSBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPEV4cGxvcmVySXRlbT4ge1xuXHRnZXRIZWlnaHQoKSB7IHJldHVybiAyMDsgfVxuXHRnZXRUZW1wbGF0ZUlkKGVsZW1lbnQ6IEV4cGxvcmVySXRlbSk6IHN0cmluZyB7IHJldHVybiAnZGVmYXVsdCc7IH1cbn1cblxuY2xhc3MgRGF0YVNvdXJjZSBpbXBsZW1lbnRzIElBc3luY0RhdGFTb3VyY2U8RXhwbG9yZXJJdGVtLCBFeHBsb3Jlckl0ZW0+IHtcblx0aGFzQ2hpbGRyZW4oZWxlbWVudDogRXhwbG9yZXJJdGVtKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhZWxlbWVudC5jaGlsZHJlbiAmJiBlbGVtZW50LmNoaWxkcmVuLnNpemUgPiAwO1xuXHR9XG5cdGdldENoaWxkcmVuKGVsZW1lbnQ6IEV4cGxvcmVySXRlbSk6IFByb21pc2U8RXhwbG9yZXJJdGVtW10+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKEFycmF5LmZyb20oZWxlbWVudC5jaGlsZHJlbi52YWx1ZXMoKSkgfHwgW10pO1xuXHR9XG5cdGdldFBhcmVudChlbGVtZW50OiBFeHBsb3Jlckl0ZW0pOiBFeHBsb3Jlckl0ZW0ge1xuXHRcdHJldHVybiBlbGVtZW50LnBhcmVudCE7XG5cdH1cblxufVxuXG5jbGFzcyBBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgaW1wbGVtZW50cyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlcjxFeHBsb3Jlckl0ZW0+IHtcblx0Z2V0V2lkZ2V0QXJpYUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cdGdldEFyaWFMYWJlbChzdGF0OiBFeHBsb3Jlckl0ZW0pOiBzdHJpbmcge1xuXHRcdHJldHVybiBzdGF0Lm5hbWU7XG5cdH1cbn1cblxuY2xhc3MgS2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlciBpbXBsZW1lbnRzIElLZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyPEV4cGxvcmVySXRlbT4ge1xuXHRnZXRLZXlib2FyZE5hdmlnYXRpb25MYWJlbChzdGF0OiBFeHBsb3Jlckl0ZW0pOiBzdHJpbmcge1xuXHRcdHJldHVybiBzdGF0Lm5hbWU7XG5cdH1cblx0Z2V0Q29tcHJlc3NlZE5vZGVLZXlib2FyZE5hdmlnYXRpb25MYWJlbChzdGF0czogRXhwbG9yZXJJdGVtW10pOiBzdHJpbmcge1xuXHRcdHJldHVybiBzdGF0cy5tYXAoc3RhdCA9PiBzdGF0Lm5hbWUpLmpvaW4oJy8nKTtcblx0fVxufVxuXG5jbGFzcyBDb21wcmVzc2lvbkRlbGVnYXRlIGltcGxlbWVudHMgSVRyZWVDb21wcmVzc2lvbkRlbGVnYXRlPEV4cGxvcmVySXRlbT4ge1xuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIGRhdGFTb3VyY2U6IERhdGFTb3VyY2UpIHsgfVxuXHRpc0luY29tcHJlc3NpYmxlKGVsZW1lbnQ6IEV4cGxvcmVySXRlbSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhdGhpcy5kYXRhU291cmNlLmhhc0NoaWxkcmVuKGVsZW1lbnQpO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RGaWxlc0ZpbHRlciBpbXBsZW1lbnRzIElUcmVlRmlsdGVyPEV4cGxvcmVySXRlbT4ge1xuXHRmaWx0ZXIoKTogVHJlZUZpbHRlclJlc3VsdDx2b2lkPiB7IHJldHVybiB0cnVlOyB9XG5cdGlzSWdub3JlZCgpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cdGRpc3Bvc2UoKSB7IH1cbn1cblxuc3VpdGUoJ0ZpbmQgUHJvdmlkZXIgLSBFeHBsb3JlclZpZXcnLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgZmlsZVNlcnZpY2UgPSBuZXcgVGVzdEZpbGVTZXJ2aWNlKCk7XG5cdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlU3RhdCh0aGlzOiBhbnksIHBhdGg6IHN0cmluZywgaXNGb2xkZXI6IGJvb2xlYW4pOiBFeHBsb3Jlckl0ZW0ge1xuXHRcdHJldHVybiBuZXcgRXhwbG9yZXJJdGVtKFVSSS5mcm9tKHsgc2NoZW1lOiAnZmlsZScsIHBhdGggfSksIGZpbGVTZXJ2aWNlLCBjb25maWdTZXJ2aWNlLCBOdWxsRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSwgdW5kZWZpbmVkLCBpc0ZvbGRlcik7XG5cdH1cblxuXHRsZXQgcm9vdDogRXhwbG9yZXJJdGVtO1xuXG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXG5cdGNvbnN0IHNlYXJjaE1hcHBpbmdzID0gbmV3IE1hcDxzdHJpbmcsIFVSSVtdPihbXG5cdFx0WydiYicsIFtVUkkuZmlsZSgnL3Jvb3QvYi9iYi9iYmIudHh0JyksIFVSSS5maWxlKCcvcm9vdC9hL2FiL2FiYi50eHQnKSwgVVJJLmZpbGUoJy9yb290L2IvYmIvYmJhLnR4dCcpXV0sXG5cdF0pO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRyb290ID0gY3JlYXRlU3RhdC5jYWxsKHRoaXMsICcvcm9vdCcsIHRydWUpO1xuXHRcdGNvbnN0IGEgPSBjcmVhdGVTdGF0LmNhbGwodGhpcywgJy9yb290L2EnLCB0cnVlKTtcblx0XHRjb25zdCBhYSA9IGNyZWF0ZVN0YXQuY2FsbCh0aGlzLCAnL3Jvb3QvYS9hYScsIHRydWUpO1xuXHRcdGNvbnN0IGFiID0gY3JlYXRlU3RhdC5jYWxsKHRoaXMsICcvcm9vdC9hL2FiJywgdHJ1ZSk7XG5cdFx0Y29uc3QgYWJhID0gY3JlYXRlU3RhdC5jYWxsKHRoaXMsICcvcm9vdC9hL2FiL2FiYS50eHQnLCBmYWxzZSk7XG5cdFx0Y29uc3QgYWJiID0gY3JlYXRlU3RhdC5jYWxsKHRoaXMsICcvcm9vdC9hL2FiL2FiYi50eHQnLCBmYWxzZSk7XG5cdFx0Y29uc3QgYiA9IGNyZWF0ZVN0YXQuY2FsbCh0aGlzLCAnL3Jvb3QvYicsIHRydWUpO1xuXHRcdGNvbnN0IGJhID0gY3JlYXRlU3RhdC5jYWxsKHRoaXMsICcvcm9vdC9iL2JhJywgdHJ1ZSk7XG5cdFx0Y29uc3QgYmFhID0gY3JlYXRlU3RhdC5jYWxsKHRoaXMsICcvcm9vdC9iL2JhL2JhYS50eHQnLCBmYWxzZSk7XG5cdFx0Y29uc3QgYmFiID0gY3JlYXRlU3RhdC5jYWxsKHRoaXMsICcvcm9vdC9iL2JhL2JhYi50eHQnLCBmYWxzZSk7XG5cdFx0Y29uc3QgYmIgPSBjcmVhdGVTdGF0LmNhbGwodGhpcywgJy9yb290L2IvYmInLCB0cnVlKTtcblxuXHRcdHJvb3QuYWRkQ2hpbGQoYSk7XG5cdFx0YS5hZGRDaGlsZChhYSk7XG5cdFx0YS5hZGRDaGlsZChhYik7XG5cdFx0YWIuYWRkQ2hpbGQoYWJhKTtcblx0XHRhYi5hZGRDaGlsZChhYmIpO1xuXHRcdHJvb3QuYWRkQ2hpbGQoYik7XG5cdFx0Yi5hZGRDaGlsZChiYSk7XG5cdFx0YmEuYWRkQ2hpbGQoYmFhKTtcblx0XHRiYS5hZGRDaGlsZChiYWIpO1xuXHRcdGIuYWRkQ2hpbGQoYmIpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFeHBsb3JlclNlcnZpY2UsIHtcblx0XHRcdHJvb3RzOiBbcm9vdF0sXG5cdFx0XHRyZWZyZXNoOiAoKSA9PiBQcm9taXNlLnJlc29sdmUoKSxcblx0XHRcdGZpbmRDbG9zZXN0OiAocmVzb3VyY2U6IFVSSSkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gZmluZChyb290LCBiYXNlbmFtZShyZXNvdXJjZSkpID8/IG51bGw7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlYXJjaFNlcnZpY2UsIHtcblx0XHRcdGZpbGVTZWFyY2gocXVlcnk6IElGaWxlUXVlcnksIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElTZWFyY2hDb21wbGV0ZT4ge1xuXHRcdFx0XHRjb25zdCBmaWxlUGF0dGVybiA9IHF1ZXJ5LmZpbGVQYXR0ZXJuPy5yZXBsYWNlKC9cXC8vZywgJycpXG5cdFx0XHRcdFx0LnJlcGxhY2UoL1xcKi9nLCAnJylcblx0XHRcdFx0XHQucmVwbGFjZSgvXFxbL2csICcnKVxuXHRcdFx0XHRcdC5yZXBsYWNlKC9cXF0vZywgJycpXG5cdFx0XHRcdFx0LnJlcGxhY2UoL1tBLVpdL2csICcnKSA/PyAnJztcblx0XHRcdFx0Y29uc3QgZmlsZU1hdGNoZXM6IElGaWxlTWF0Y2hbXSA9IChzZWFyY2hNYXBwaW5ncy5nZXQoZmlsZVBhdHRlcm4pID8/IFtdKS5tYXAodSA9PiAoeyByZXNvdXJjZTogdSB9KSk7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoeyByZXN1bHRzOiBmaWxlTWF0Y2hlcywgbWVzc2FnZXM6IFtdIH0pO1xuXHRcdFx0fSxcblx0XHRcdHNjaGVtZUhhc0ZpbGVTZWFyY2hQcm92aWRlcigpOiBib29sZWFuIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbmQgcHJvdmlkZXInLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHQvLyBUcmVlIFN0dWZmXG5cdFx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cblx0XHRjb25zdCBkYXRhU291cmNlID0gbmV3IERhdGFTb3VyY2UoKTtcblx0XHRjb25zdCBjb21wcmVzc2lvbkRlbGVnYXRlID0gbmV3IENvbXByZXNzaW9uRGVsZWdhdGUoZGF0YVNvdXJjZSk7XG5cdFx0Y29uc3Qga2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlciA9IG5ldyBLZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyKCk7XG5cdFx0Y29uc3QgYWNjZXNzaWJpbGl0eVByb3ZpZGVyID0gbmV3IEFjY2Vzc2liaWxpdHlQcm92aWRlcigpO1xuXHRcdGNvbnN0IGZpbHRlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RGaWxlc0ZpbHRlcikgYXMgdW5rbm93biBhcyBGaWxlc0ZpbHRlcjtcblxuXHRcdGNvbnN0IG9wdGlvbnM6IElXb3JrYmVuY2hDb21wcmVzc2libGVBc3luY0RhdGFUcmVlT3B0aW9uczxFeHBsb3Jlckl0ZW0sIEZ1enp5U2NvcmU+ID0geyBpZGVudGl0eVByb3ZpZGVyOiBuZXcgSWRlbnRpdHlQcm92aWRlcigpLCBrZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyLCBhY2Nlc3NpYmlsaXR5UHJvdmlkZXIgfTtcblx0XHRjb25zdCB0cmVlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWU8RXhwbG9yZXJJdGVtIHwgRXhwbG9yZXJJdGVtW10sIEV4cGxvcmVySXRlbSwgRnV6enlTY29yZT4sICd0ZXN0JywgY29udGFpbmVyLCBuZXcgVmlydHVhbERlbGVnYXRlKCksIGNvbXByZXNzaW9uRGVsZWdhdGUsIFtuZXcgUmVuZGVyZXIoKV0sIGRhdGFTb3VyY2UsIG9wdGlvbnMpKTtcblx0XHR0cmVlLmxheW91dCgyMDApO1xuXG5cdFx0YXdhaXQgdHJlZS5zZXRJbnB1dChyb290KTtcblxuXHRcdGNvbnN0IGZpbmRQcm92aWRlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4cGxvcmVyRmluZFByb3ZpZGVyLCBmaWx0ZXIsICgpID0+IHRyZWUpO1xuXG5cdFx0ZmluZFByb3ZpZGVyLnN0YXJ0U2Vzc2lvbigpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmQocm9vdCwgJ2FiYi50eHQnKSAhPT0gdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZChyb290LCAnYmJhLnR4dCcpICE9PSB1bmRlZmluZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZChyb290LCAnYmJiLnR4dCcpICE9PSB1bmRlZmluZWQsIGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kKHJvb3QsICdhYmIudHh0Jyk/LmlzTWFya2VkQXNGaWx0ZXJlZCgpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmQocm9vdCwgJ2EnKT8uaXNNYXJrZWRBc0ZpbHRlcmVkKCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZChyb290LCAnYWInKT8uaXNNYXJrZWRBc0ZpbHRlcmVkKCksIGZhbHNlKTtcblxuXHRcdGF3YWl0IGZpbmRQcm92aWRlci5maW5kKCdiYicsIHsgbWF0Y2hUeXBlOiBUcmVlRmluZE1hdGNoVHlwZS5Db250aWd1b3VzLCBmaW5kTW9kZTogVHJlZUZpbmRNb2RlLkZpbHRlciB9LCBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKS50b2tlbik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZChyb290LCAnYWJiLnR4dCcpICE9PSB1bmRlZmluZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kKHJvb3QsICdiYmEudHh0JykgIT09IHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmQocm9vdCwgJ2JiYi50eHQnKSAhPT0gdW5kZWZpbmVkLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kKHJvb3QsICdhYmIudHh0Jyk/LmlzTWFya2VkQXNGaWx0ZXJlZCgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZChyb290LCAnYmJhLnR4dCcpPy5pc01hcmtlZEFzRmlsdGVyZWQoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmQocm9vdCwgJ2JiYi50eHQnKT8uaXNNYXJrZWRBc0ZpbHRlcmVkKCksIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmQocm9vdCwgJ2EnKT8uaXNNYXJrZWRBc0ZpbHRlcmVkKCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kKHJvb3QsICdhYicpPy5pc01hcmtlZEFzRmlsdGVyZWQoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmQocm9vdCwgJ2InKT8uaXNNYXJrZWRBc0ZpbHRlcmVkKCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kKHJvb3QsICdiYicpPy5pc01hcmtlZEFzRmlsdGVyZWQoKSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZChyb290LCAnYWEnKT8uaXNNYXJrZWRBc0ZpbHRlcmVkKCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZChyb290LCAnYmEnKT8uaXNNYXJrZWRBc0ZpbHRlcmVkKCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZChyb290LCAnYWJhLnR4dCcpPy5pc01hcmtlZEFzRmlsdGVyZWQoKSwgZmFsc2UpO1xuXG5cdFx0YXdhaXQgZmluZFByb3ZpZGVyLmVuZFNlc3Npb24oKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kKHJvb3QsICdhYmIudHh0JykgIT09IHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmQocm9vdCwgJ2JhYS50eHQnKSAhPT0gdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZChyb290LCAnYmFhLnR4dCcpICE9PSB1bmRlZmluZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kKHJvb3QsICdiYmEudHh0JykgIT09IHVuZGVmaW5lZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kKHJvb3QsICdiYmIudHh0JykgIT09IHVuZGVmaW5lZCwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmQocm9vdCwgJ2EnKT8uaXNNYXJrZWRBc0ZpbHRlcmVkKCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZChyb290LCAnYWInKT8uaXNNYXJrZWRBc0ZpbHRlcmVkKCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZChyb290LCAnYicpPy5pc01hcmtlZEFzRmlsdGVyZWQoKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kKHJvb3QsICdiYicpPy5pc01hcmtlZEFzRmlsdGVyZWQoKSwgZmFsc2UpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7OztBQUtBLE9BQU8sWUFBWTtBQUduQixTQUFTLG1CQUFtQixvQkFBb0I7QUFLaEQsU0FBNEIsK0JBQStCO0FBRTNELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGdDQUFnQztBQUV6QyxTQUFxRCwwQ0FBMEM7QUFDL0YsU0FBa0Qsc0JBQXNCO0FBQ3hFLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsK0JBQStCLHVCQUF1QjtBQUMvRCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDRCQUF5QztBQUNsRCxTQUFTLG9CQUFvQjtBQTNCN0I7QUFBQTtBQTZCQSxhQUFTLEtBQUssU0FBdUIsSUFBc0M7QUFDMUUsVUFBSSxRQUFRLFNBQVMsSUFBSTtBQUN4QixlQUFPO0FBQUEsTUFDUjtBQUVBLFVBQUksQ0FBQyxRQUFRLFVBQVU7QUFDdEIsZUFBTztBQUFBLE1BQ1I7QUFFQSxpQkFBVyxTQUFTLFFBQVEsU0FBUyxPQUFPLEdBQUc7QUFDOUMsY0FBTSxTQUFTLEtBQUssT0FBTyxFQUFFO0FBRTdCLFlBQUksUUFBUTtBQUNYLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFFQSxhQUFPO0FBQUEsSUFDUjtBQUFBLElBRUEsTUFBTSxTQUFxRjtBQUFBLE1BQTNGO0FBQ0MsYUFBUyxhQUFhO0FBQUE7QUFBQSxNQUN0QixlQUFlLFdBQXFDO0FBQ25ELGVBQU87QUFBQSxNQUNSO0FBQUEsTUFDQSxjQUFjLFNBQThDLE9BQWUsY0FBaUM7QUFDM0cscUJBQWEsY0FBYyxRQUFRLFFBQVE7QUFBQSxNQUM1QztBQUFBLE1BQ0EsZ0JBQWdCLGNBQWlDO0FBQUEsTUFFakQ7QUFBQSxNQUNBLHlCQUF5QixNQUFnRSxPQUFlLGNBQWlDO0FBQ3hJLGNBQU0sU0FBbUIsQ0FBQztBQUUxQixtQkFBVyxXQUFXLEtBQUssUUFBUSxVQUFVO0FBQzVDLGlCQUFPLEtBQUssUUFBUSxJQUFJO0FBQUEsUUFDekI7QUFFQSxxQkFBYSxjQUFjLE9BQU8sS0FBSyxHQUFHO0FBQUEsTUFDM0M7QUFBQSxJQUNEO0FBQUEsSUFFQSxNQUFNLGlCQUE0RDtBQUFBLE1BQ2pFLE1BQU0sU0FBdUI7QUFDNUIsZUFBTztBQUFBLFVBQ04sVUFBVSxNQUFNO0FBQUUsbUJBQU8sUUFBUTtBQUFBLFVBQU07QUFBQSxRQUN4QztBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsSUFFQSxNQUFNLGdCQUE4RDtBQUFBLE1BQ25FLFlBQVk7QUFBRSxlQUFPO0FBQUEsTUFBSTtBQUFBLE1BQ3pCLGNBQWMsU0FBK0I7QUFBRSxlQUFPO0FBQUEsTUFBVztBQUFBLElBQ2xFO0FBQUEsSUFFQSxNQUFNLFdBQW1FO0FBQUEsTUFDeEUsWUFBWSxTQUFnQztBQUMzQyxlQUFPLENBQUMsQ0FBQyxRQUFRLFlBQVksUUFBUSxTQUFTLE9BQU87QUFBQSxNQUN0RDtBQUFBLE1BQ0EsWUFBWSxTQUFnRDtBQUMzRCxlQUFPLFFBQVEsUUFBUSxNQUFNLEtBQUssUUFBUSxTQUFTLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUFBLE1BQ25FO0FBQUEsTUFDQSxVQUFVLFNBQXFDO0FBQzlDLGVBQU8sUUFBUTtBQUFBLE1BQ2hCO0FBQUEsSUFFRDtBQUFBLElBRUEsTUFBTSxzQkFBMEU7QUFBQSxNQUMvRSxxQkFBNkI7QUFDNUIsZUFBTztBQUFBLE1BQ1I7QUFBQSxNQUNBLGFBQWEsTUFBNEI7QUFDeEMsZUFBTyxLQUFLO0FBQUEsTUFDYjtBQUFBLElBQ0Q7QUFBQSxJQUVBLE1BQU0sZ0NBQTBGO0FBQUEsTUFDL0YsMkJBQTJCLE1BQTRCO0FBQ3RELGVBQU8sS0FBSztBQUFBLE1BQ2I7QUFBQSxNQUNBLHlDQUF5QyxPQUErQjtBQUN2RSxlQUFPLE1BQU0sSUFBSSxVQUFRLEtBQUssSUFBSSxFQUFFLEtBQUssR0FBRztBQUFBLE1BQzdDO0FBQUEsSUFDRDtBQUFBLElBRUEsTUFBTSxvQkFBc0U7QUFBQSxNQUMzRSxZQUFvQixZQUF3QjtBQUF4QjtBQUFBLE1BQTBCO0FBQUEsTUFDOUMsaUJBQWlCLFNBQWdDO0FBQ2hELGVBQU8sQ0FBQyxLQUFLLFdBQVcsWUFBWSxPQUFPO0FBQUEsTUFDNUM7QUFBQSxJQUNEO0FBQUEsSUFFQSxNQUFNLGdCQUFxRDtBQUFBLE1BQzFELFNBQWlDO0FBQUUsZUFBTztBQUFBLE1BQU07QUFBQSxNQUNoRCxZQUFxQjtBQUFFLGVBQU87QUFBQSxNQUFPO0FBQUEsTUFDckMsVUFBVTtBQUFBLE1BQUU7QUFBQSxJQUNiO0FBRUEsVUFBTSxnQ0FBZ0MsTUFBTTtBQUMzQyxZQUFNLGNBQWMsd0NBQXdDO0FBRTVELFlBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUN4QyxZQUFNLGdCQUFnQixJQUFJLHlCQUF5QjtBQUVuRCxlQUFTLFdBQXNCLE1BQWMsVUFBaUM7QUFDN0UsZUFBTyxJQUFJLGFBQWEsSUFBSSxLQUFLLEVBQUUsUUFBUSxRQUFRLEtBQUssQ0FBQyxHQUFHLGFBQWEsZUFBZSwrQkFBK0IsUUFBVyxRQUFRO0FBQUEsTUFDM0k7QUFFQSxVQUFJO0FBRUosVUFBSTtBQUVKLFlBQU0saUJBQWlCLG9CQUFJLElBQW1CO0FBQUEsUUFDN0MsQ0FBQyxNQUFNLENBQUMsSUFBSSxLQUFLLG9CQUFvQixHQUFHLElBQUksS0FBSyxvQkFBb0IsR0FBRyxJQUFJLEtBQUssb0JBQW9CLENBQUMsQ0FBQztBQUFBLE1BQ3hHLENBQUM7QUFFRCxZQUFNLE1BQU07QUFDWCxlQUFPLFdBQVcsS0FBSyxTQUFNLFNBQVMsSUFBSTtBQUMxQyxjQUFNLElBQUksV0FBVyxLQUFLLFNBQU0sV0FBVyxJQUFJO0FBQy9DLGNBQU0sS0FBSyxXQUFXLEtBQUssU0FBTSxjQUFjLElBQUk7QUFDbkQsY0FBTSxLQUFLLFdBQVcsS0FBSyxTQUFNLGNBQWMsSUFBSTtBQUNuRCxjQUFNLE1BQU0sV0FBVyxLQUFLLFNBQU0sc0JBQXNCLEtBQUs7QUFDN0QsY0FBTSxNQUFNLFdBQVcsS0FBSyxTQUFNLHNCQUFzQixLQUFLO0FBQzdELGNBQU0sSUFBSSxXQUFXLEtBQUssU0FBTSxXQUFXLElBQUk7QUFDL0MsY0FBTSxLQUFLLFdBQVcsS0FBSyxTQUFNLGNBQWMsSUFBSTtBQUNuRCxjQUFNLE1BQU0sV0FBVyxLQUFLLFNBQU0sc0JBQXNCLEtBQUs7QUFDN0QsY0FBTSxNQUFNLFdBQVcsS0FBSyxTQUFNLHNCQUFzQixLQUFLO0FBQzdELGNBQU0sS0FBSyxXQUFXLEtBQUssU0FBTSxjQUFjLElBQUk7QUFFbkQsYUFBSyxTQUFTLENBQUM7QUFDZixVQUFFLFNBQVMsRUFBRTtBQUNiLFVBQUUsU0FBUyxFQUFFO0FBQ2IsV0FBRyxTQUFTLEdBQUc7QUFDZixXQUFHLFNBQVMsR0FBRztBQUNmLGFBQUssU0FBUyxDQUFDO0FBQ2YsVUFBRSxTQUFTLEVBQUU7QUFDYixXQUFHLFNBQVMsR0FBRztBQUNmLFdBQUcsU0FBUyxHQUFHO0FBQ2YsVUFBRSxTQUFTLEVBQUU7QUFFYiwrQkFBdUIsOEJBQThCLFFBQVcsV0FBVztBQUMzRSw2QkFBcUIsS0FBSyxrQkFBa0I7QUFBQSxVQUMzQyxPQUFPLENBQUMsSUFBSTtBQUFBLFVBQ1osU0FBUyxNQUFNLFFBQVEsUUFBUTtBQUFBLFVBQy9CLGFBQWEsQ0FBQyxhQUFrQjtBQUMvQixtQkFBTyxLQUFLLE1BQU0sU0FBUyxRQUFRLENBQUMsS0FBSztBQUFBLFVBQzFDO0FBQUEsUUFDRCxDQUFDO0FBQ0QsNkJBQXFCLEtBQUssZ0JBQWdCO0FBQUEsVUFDekMsV0FBVyxPQUFtQixPQUFxRDtBQUNsRixrQkFBTSxjQUFjLE1BQU0sYUFBYSxRQUFRLE9BQU8sRUFBRSxFQUN0RCxRQUFRLE9BQU8sRUFBRSxFQUNqQixRQUFRLE9BQU8sRUFBRSxFQUNqQixRQUFRLE9BQU8sRUFBRSxFQUNqQixRQUFRLFVBQVUsRUFBRSxLQUFLO0FBQzNCLGtCQUFNLGVBQTZCLGVBQWUsSUFBSSxXQUFXLEtBQUssQ0FBQyxHQUFHLElBQUksUUFBTSxFQUFFLFVBQVUsRUFBRSxFQUFFO0FBQ3BHLG1CQUFPLFFBQVEsUUFBUSxFQUFFLFNBQVMsYUFBYSxVQUFVLENBQUMsRUFBRSxDQUFDO0FBQUEsVUFDOUQ7QUFBQSxVQUNBLDhCQUF1QztBQUN0QyxtQkFBTztBQUFBLFVBQ1I7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGLENBQUM7QUFFRCxXQUFLLGlCQUFpQixpQkFBa0I7QUFDdkMsY0FBTUEsZUFBYyxJQUFJLGdCQUFnQjtBQUd4QyxjQUFNLFlBQVksU0FBUyxjQUFjLEtBQUs7QUFFOUMsY0FBTSxhQUFhLElBQUksV0FBVztBQUNsQyxjQUFNLHNCQUFzQixJQUFJLG9CQUFvQixVQUFVO0FBQzlELGNBQU0sa0NBQWtDLElBQUksZ0NBQWdDO0FBQzVFLGNBQU0sd0JBQXdCLElBQUksc0JBQXNCO0FBQ3hELGNBQU0sU0FBUyxxQkFBcUIsZUFBZSxlQUFlO0FBRWxFLGNBQU0sVUFBZ0YsRUFBRSxrQkFBa0IsSUFBSSxpQkFBaUIsR0FBRyxpQ0FBaUMsc0JBQXNCO0FBQ3pMLGNBQU0sT0FBT0EsYUFBWSxJQUFJLHFCQUFxQixlQUFlLG9DQUE2RixRQUFRLFdBQVcsSUFBSSxnQkFBZ0IsR0FBRyxxQkFBcUIsQ0FBQyxJQUFJLFNBQVMsQ0FBQyxHQUFHLFlBQVksT0FBTyxDQUFDO0FBQ25RLGFBQUssT0FBTyxHQUFHO0FBRWYsY0FBTSxLQUFLLFNBQVMsSUFBSTtBQUV4QixjQUFNLGVBQWUscUJBQXFCLGVBQWUsc0JBQXNCLFFBQVEsTUFBTSxJQUFJO0FBRWpHLHFCQUFhLGFBQWE7QUFFMUIsZUFBTyxZQUFZLEtBQUssTUFBTSxTQUFTLE1BQU0sUUFBVyxJQUFJO0FBQzVELGVBQU8sWUFBWSxLQUFLLE1BQU0sU0FBUyxNQUFNLFFBQVcsS0FBSztBQUM3RCxlQUFPLFlBQVksS0FBSyxNQUFNLFNBQVMsTUFBTSxRQUFXLEtBQUs7QUFFN0QsZUFBTyxZQUFZLEtBQUssTUFBTSxTQUFTLEdBQUcsbUJBQW1CLEdBQUcsS0FBSztBQUNyRSxlQUFPLFlBQVksS0FBSyxNQUFNLEdBQUcsR0FBRyxtQkFBbUIsR0FBRyxLQUFLO0FBQy9ELGVBQU8sWUFBWSxLQUFLLE1BQU0sSUFBSSxHQUFHLG1CQUFtQixHQUFHLEtBQUs7QUFFaEUsY0FBTSxhQUFhLEtBQUssTUFBTSxFQUFFLFdBQVcsa0JBQWtCLFlBQVksVUFBVSxhQUFhLE9BQU8sR0FBRyxJQUFJLHdCQUF3QixFQUFFLEtBQUs7QUFFN0ksZUFBTyxZQUFZLEtBQUssTUFBTSxTQUFTLE1BQU0sUUFBVyxJQUFJO0FBQzVELGVBQU8sWUFBWSxLQUFLLE1BQU0sU0FBUyxNQUFNLFFBQVcsSUFBSTtBQUM1RCxlQUFPLFlBQVksS0FBSyxNQUFNLFNBQVMsTUFBTSxRQUFXLElBQUk7QUFFNUQsZUFBTyxZQUFZLEtBQUssTUFBTSxTQUFTLEdBQUcsbUJBQW1CLEdBQUcsSUFBSTtBQUNwRSxlQUFPLFlBQVksS0FBSyxNQUFNLFNBQVMsR0FBRyxtQkFBbUIsR0FBRyxJQUFJO0FBQ3BFLGVBQU8sWUFBWSxLQUFLLE1BQU0sU0FBUyxHQUFHLG1CQUFtQixHQUFHLElBQUk7QUFFcEUsZUFBTyxZQUFZLEtBQUssTUFBTSxHQUFHLEdBQUcsbUJBQW1CLEdBQUcsSUFBSTtBQUM5RCxlQUFPLFlBQVksS0FBSyxNQUFNLElBQUksR0FBRyxtQkFBbUIsR0FBRyxJQUFJO0FBQy9ELGVBQU8sWUFBWSxLQUFLLE1BQU0sR0FBRyxHQUFHLG1CQUFtQixHQUFHLElBQUk7QUFDOUQsZUFBTyxZQUFZLEtBQUssTUFBTSxJQUFJLEdBQUcsbUJBQW1CLEdBQUcsSUFBSTtBQUUvRCxlQUFPLFlBQVksS0FBSyxNQUFNLElBQUksR0FBRyxtQkFBbUIsR0FBRyxLQUFLO0FBQ2hFLGVBQU8sWUFBWSxLQUFLLE1BQU0sSUFBSSxHQUFHLG1CQUFtQixHQUFHLEtBQUs7QUFDaEUsZUFBTyxZQUFZLEtBQUssTUFBTSxTQUFTLEdBQUcsbUJBQW1CLEdBQUcsS0FBSztBQUVyRSxjQUFNLGFBQWEsV0FBVztBQUU5QixlQUFPLFlBQVksS0FBSyxNQUFNLFNBQVMsTUFBTSxRQUFXLElBQUk7QUFDNUQsZUFBTyxZQUFZLEtBQUssTUFBTSxTQUFTLE1BQU0sUUFBVyxJQUFJO0FBQzVELGVBQU8sWUFBWSxLQUFLLE1BQU0sU0FBUyxNQUFNLFFBQVcsSUFBSTtBQUM1RCxlQUFPLFlBQVksS0FBSyxNQUFNLFNBQVMsTUFBTSxRQUFXLEtBQUs7QUFDN0QsZUFBTyxZQUFZLEtBQUssTUFBTSxTQUFTLE1BQU0sUUFBVyxLQUFLO0FBRTdELGVBQU8sWUFBWSxLQUFLLE1BQU0sR0FBRyxHQUFHLG1CQUFtQixHQUFHLEtBQUs7QUFDL0QsZUFBTyxZQUFZLEtBQUssTUFBTSxJQUFJLEdBQUcsbUJBQW1CLEdBQUcsS0FBSztBQUNoRSxlQUFPLFlBQVksS0FBSyxNQUFNLEdBQUcsR0FBRyxtQkFBbUIsR0FBRyxLQUFLO0FBQy9ELGVBQU8sWUFBWSxLQUFLLE1BQU0sSUFBSSxHQUFHLG1CQUFtQixHQUFHLEtBQUs7QUFFaEUsUUFBQUEsYUFBWSxRQUFRO0FBQUEsTUFDckIsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBO0FBQUE7IiwKICAibmFtZXMiOiBbImRpc3Bvc2FibGVzIl0KfQo=
