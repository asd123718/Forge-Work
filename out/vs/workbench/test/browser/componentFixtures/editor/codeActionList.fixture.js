import { Codicon } from "../../../../../base/common/codicons.js";
import { Event } from "../../../../../base/common/event.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from "../fixtureUtils.js";
import { ActionList, ActionListItemKind } from "../../../../../platform/actionWidget/browser/actionList.js";
import { ILayoutService } from "../../../../../platform/layout/browser/layoutService.js";
import "../../../../../platform/actionWidget/browser/actionWidget.css";
import "../../../../../base/browser/ui/codicons/codiconStyles.js";
import "../../../../../editor/contrib/symbolIcons/browser/symbolIcons.js";
function renderCodeActionList(options) {
  const { container, disposableStore, theme } = options;
  container.style.width = options.width ?? "300px";
  const instantiationService = createEditorServices(disposableStore, {
    colorTheme: theme,
    additionalServices: (reg) => {
      registerWorkbenchServices(reg);
      reg.defineInstance(ILayoutService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.mainContainerOffset = { top: 0, quickPickTop: 0 };
          this.onDidLayoutMainContainer = Event.None;
          this.onDidLayoutActiveContainer = Event.None;
          this.onDidLayoutContainer = Event.None;
          this.onDidChangeActiveContainer = Event.None;
          this.onDidAddContainer = Event.None;
        }
        get mainContainer() {
          return container;
        }
        get activeContainer() {
          return container;
        }
        get mainContainerDimension() {
          return { width: 300, height: 600 };
        }
        get activeContainerDimension() {
          return { width: 300, height: 600 };
        }
        get containers() {
          return [container];
        }
        getContainer() {
          return container;
        }
        whenContainerStylesLoaded() {
          return void 0;
        }
      }());
    }
  });
  const delegate = {
    onHide: () => {
    },
    onSelect: () => {
    }
  };
  const anchor = container;
  const list = disposableStore.add(instantiationService.createInstance(
    ActionList,
    "codeActionWidget",
    false,
    options.items,
    delegate,
    void 0,
    void 0,
    anchor
  ));
  const wrapper = document.createElement("div");
  wrapper.classList.add("action-widget");
  wrapper.appendChild(list.domNode);
  container.appendChild(wrapper);
  list.layout(0);
  list.focus();
}
const quickFixItems = [
  { kind: ActionListItemKind.Header, group: { title: "Quick Fix" } },
  { kind: ActionListItemKind.Action, item: "fix-import", label: "Add missing import for 'useState'", group: { title: "Quick Fix", icon: Codicon.lightBulb } },
  { kind: ActionListItemKind.Action, item: "fix-typo", label: "Change spelling to 'initialCount'", group: { title: "Quick Fix", icon: Codicon.lightBulb } },
  { kind: ActionListItemKind.Action, item: "fix-type", label: "Add explicit type annotation", group: { title: "Quick Fix", icon: Codicon.lightBulb } },
  { kind: ActionListItemKind.Header, group: { title: "Extract", icon: Codicon.wrench } },
  { kind: ActionListItemKind.Action, item: "extract-const", label: "Extract to constant in enclosing scope", group: { title: "Extract", icon: Codicon.wrench } },
  { kind: ActionListItemKind.Action, item: "extract-fn", label: "Extract to function in module scope", group: { title: "Extract", icon: Codicon.wrench } },
  { kind: ActionListItemKind.Header, group: { title: "Source Action", icon: Codicon.symbolFile } },
  { kind: ActionListItemKind.Action, item: "organize-imports", label: "Organize Imports", group: { title: "Source Action", icon: Codicon.symbolFile } }
];
const simpleFixes = [
  { kind: ActionListItemKind.Action, item: "fix-1", label: "Convert to arrow function", group: { title: "Quick Fix", icon: Codicon.lightBulb } },
  { kind: ActionListItemKind.Action, item: "fix-2", label: "Remove unused variable", group: { title: "Quick Fix", icon: Codicon.lightBulb } },
  { kind: ActionListItemKind.Action, item: "fix-3", label: "Add 'await' to async call", group: { title: "Quick Fix", icon: Codicon.lightBulb } }
];
var codeActionList_fixture_default = defineThemedFixtureGroup({ path: "editor/" }, {
  GroupedCodeActions: defineComponentFixture({
    labels: { kind: "animated" },
    render: (context) => renderCodeActionList({ ...context, items: quickFixItems })
  }),
  SimpleQuickFixes: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderCodeActionList({ ...context, items: simpleFixes })
  })
});
export {
  codeActionList_fixture_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHRlc3RcXGJyb3dzZXJcXGNvbXBvbmVudEZpeHR1cmVzXFxlZGl0b3JcXGNvZGVBY3Rpb25MaXN0LmZpeHR1cmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IENvbXBvbmVudEZpeHR1cmVDb250ZXh0LCBjcmVhdGVFZGl0b3JTZXJ2aWNlcywgZGVmaW5lQ29tcG9uZW50Rml4dHVyZSwgZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwLCByZWdpc3RlcldvcmtiZW5jaFNlcnZpY2VzIH0gZnJvbSAnLi4vZml4dHVyZVV0aWxzLmpzJztcbmltcG9ydCB7IEFjdGlvbkxpc3QsIEFjdGlvbkxpc3RJdGVtS2luZCwgSUFjdGlvbkxpc3REZWxlZ2F0ZSwgSUFjdGlvbkxpc3RJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uTGlzdC5qcyc7XG5pbXBvcnQgeyBJTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuXG5pbXBvcnQgJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldC5jc3MnO1xuaW1wb3J0ICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvY29kaWNvbnMvY29kaWNvblN0eWxlcy5qcyc7XG5pbXBvcnQgJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3N5bWJvbEljb25zL2Jyb3dzZXIvc3ltYm9sSWNvbnMuanMnO1xuXG5pbnRlcmZhY2UgQ29kZUFjdGlvbkZpeHR1cmVPcHRpb25zIGV4dGVuZHMgQ29tcG9uZW50Rml4dHVyZUNvbnRleHQge1xuXHRpdGVtczogSUFjdGlvbkxpc3RJdGVtPHN0cmluZz5bXTtcblx0d2lkdGg/OiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIHJlbmRlckNvZGVBY3Rpb25MaXN0KG9wdGlvbnM6IENvZGVBY3Rpb25GaXh0dXJlT3B0aW9ucyk6IHZvaWQge1xuXHRjb25zdCB7IGNvbnRhaW5lciwgZGlzcG9zYWJsZVN0b3JlLCB0aGVtZSB9ID0gb3B0aW9ucztcblx0Y29udGFpbmVyLnN0eWxlLndpZHRoID0gb3B0aW9ucy53aWR0aCA/PyAnMzAwcHgnO1xuXG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlRWRpdG9yU2VydmljZXMoZGlzcG9zYWJsZVN0b3JlLCB7XG5cdFx0Y29sb3JUaGVtZTogdGhlbWUsXG5cdFx0YWRkaXRpb25hbFNlcnZpY2VzOiAocmVnKSA9PiB7XG5cdFx0XHRyZWdpc3RlcldvcmtiZW5jaFNlcnZpY2VzKHJlZyk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUxheW91dFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUxheW91dFNlcnZpY2U+KCkge1xuXHRcdFx0XHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0IG1haW5Db250YWluZXIoKSB7IHJldHVybiBjb250YWluZXI7IH1cblx0XHRcdFx0b3ZlcnJpZGUgZ2V0IGFjdGl2ZUNvbnRhaW5lcigpIHsgcmV0dXJuIGNvbnRhaW5lcjsgfVxuXHRcdFx0XHRvdmVycmlkZSBnZXQgbWFpbkNvbnRhaW5lckRpbWVuc2lvbigpIHsgcmV0dXJuIHsgd2lkdGg6IDMwMCwgaGVpZ2h0OiA2MDAgfTsgfVxuXHRcdFx0XHRvdmVycmlkZSBnZXQgYWN0aXZlQ29udGFpbmVyRGltZW5zaW9uKCkgeyByZXR1cm4geyB3aWR0aDogMzAwLCBoZWlnaHQ6IDYwMCB9OyB9XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG1haW5Db250YWluZXJPZmZzZXQgPSB7IHRvcDogMCwgcXVpY2tQaWNrVG9wOiAwIH07XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkTGF5b3V0TWFpbkNvbnRhaW5lciA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkTGF5b3V0QWN0aXZlQ29udGFpbmVyID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRMYXlvdXRDb250YWluZXIgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUFjdGl2ZUNvbnRhaW5lciA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQWRkQ29udGFpbmVyID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0IGNvbnRhaW5lcnMoKSB7IHJldHVybiBbY29udGFpbmVyXTsgfVxuXHRcdFx0XHRvdmVycmlkZSBnZXRDb250YWluZXIoKSB7IHJldHVybiBjb250YWluZXI7IH1cblx0XHRcdFx0b3ZlcnJpZGUgd2hlbkNvbnRhaW5lclN0eWxlc0xvYWRlZCgpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0fSk7XG5cdFx0fSxcblx0fSk7XG5cblx0Y29uc3QgZGVsZWdhdGU6IElBY3Rpb25MaXN0RGVsZWdhdGU8c3RyaW5nPiA9IHtcblx0XHRvbkhpZGU6ICgpID0+IHsgfSxcblx0XHRvblNlbGVjdDogKCkgPT4geyB9LFxuXHR9O1xuXG5cdGNvbnN0IGFuY2hvciA9IGNvbnRhaW5lcjtcblxuXHRjb25zdCBsaXN0ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRBY3Rpb25MaXN0LFxuXHRcdCdjb2RlQWN0aW9uV2lkZ2V0Jyxcblx0XHRmYWxzZSxcblx0XHRvcHRpb25zLml0ZW1zLFxuXHRcdGRlbGVnYXRlLFxuXHRcdHVuZGVmaW5lZCxcblx0XHR1bmRlZmluZWQsXG5cdFx0YW5jaG9yLFxuXHQpKTtcblxuXHQvLyBSZW5kZXIgdGhlIGxpc3QgZGlyZWN0bHkgaW50byB0aGUgY29udGFpbmVyIGluc3RlYWQgb2YgdXNpbmcgY29udGV4dCB2aWV3XG5cdGNvbnN0IHdyYXBwZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0d3JhcHBlci5jbGFzc0xpc3QuYWRkKCdhY3Rpb24td2lkZ2V0Jyk7XG5cdHdyYXBwZXIuYXBwZW5kQ2hpbGQobGlzdC5kb21Ob2RlKTtcblx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHdyYXBwZXIpO1xuXG5cdGxpc3QubGF5b3V0KDApO1xuXHRsaXN0LmZvY3VzKCk7XG59XG5cbmNvbnN0IHF1aWNrRml4SXRlbXM6IElBY3Rpb25MaXN0SXRlbTxzdHJpbmc+W10gPSBbXG5cdHsga2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkhlYWRlciwgZ3JvdXA6IHsgdGl0bGU6ICdRdWljayBGaXgnIH0gfSxcblx0eyBraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuQWN0aW9uLCBpdGVtOiAnZml4LWltcG9ydCcsIGxhYmVsOiAnQWRkIG1pc3NpbmcgaW1wb3J0IGZvciBcXCd1c2VTdGF0ZVxcJycsIGdyb3VwOiB7IHRpdGxlOiAnUXVpY2sgRml4JywgaWNvbjogQ29kaWNvbi5saWdodEJ1bGIgfSB9LFxuXHR7IGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24sIGl0ZW06ICdmaXgtdHlwbycsIGxhYmVsOiAnQ2hhbmdlIHNwZWxsaW5nIHRvIFxcJ2luaXRpYWxDb3VudFxcJycsIGdyb3VwOiB7IHRpdGxlOiAnUXVpY2sgRml4JywgaWNvbjogQ29kaWNvbi5saWdodEJ1bGIgfSB9LFxuXHR7IGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24sIGl0ZW06ICdmaXgtdHlwZScsIGxhYmVsOiAnQWRkIGV4cGxpY2l0IHR5cGUgYW5ub3RhdGlvbicsIGdyb3VwOiB7IHRpdGxlOiAnUXVpY2sgRml4JywgaWNvbjogQ29kaWNvbi5saWdodEJ1bGIgfSB9LFxuXHR7IGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5IZWFkZXIsIGdyb3VwOiB7IHRpdGxlOiAnRXh0cmFjdCcsIGljb246IENvZGljb24ud3JlbmNoIH0gfSxcblx0eyBraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuQWN0aW9uLCBpdGVtOiAnZXh0cmFjdC1jb25zdCcsIGxhYmVsOiAnRXh0cmFjdCB0byBjb25zdGFudCBpbiBlbmNsb3Npbmcgc2NvcGUnLCBncm91cDogeyB0aXRsZTogJ0V4dHJhY3QnLCBpY29uOiBDb2RpY29uLndyZW5jaCB9IH0sXG5cdHsga2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbiwgaXRlbTogJ2V4dHJhY3QtZm4nLCBsYWJlbDogJ0V4dHJhY3QgdG8gZnVuY3Rpb24gaW4gbW9kdWxlIHNjb3BlJywgZ3JvdXA6IHsgdGl0bGU6ICdFeHRyYWN0JywgaWNvbjogQ29kaWNvbi53cmVuY2ggfSB9LFxuXHR7IGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5IZWFkZXIsIGdyb3VwOiB7IHRpdGxlOiAnU291cmNlIEFjdGlvbicsIGljb246IENvZGljb24uc3ltYm9sRmlsZSB9IH0sXG5cdHsga2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbiwgaXRlbTogJ29yZ2FuaXplLWltcG9ydHMnLCBsYWJlbDogJ09yZ2FuaXplIEltcG9ydHMnLCBncm91cDogeyB0aXRsZTogJ1NvdXJjZSBBY3Rpb24nLCBpY29uOiBDb2RpY29uLnN5bWJvbEZpbGUgfSB9LFxuXTtcblxuY29uc3Qgc2ltcGxlRml4ZXM6IElBY3Rpb25MaXN0SXRlbTxzdHJpbmc+W10gPSBbXG5cdHsga2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbiwgaXRlbTogJ2ZpeC0xJywgbGFiZWw6ICdDb252ZXJ0IHRvIGFycm93IGZ1bmN0aW9uJywgZ3JvdXA6IHsgdGl0bGU6ICdRdWljayBGaXgnLCBpY29uOiBDb2RpY29uLmxpZ2h0QnVsYiB9IH0sXG5cdHsga2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbiwgaXRlbTogJ2ZpeC0yJywgbGFiZWw6ICdSZW1vdmUgdW51c2VkIHZhcmlhYmxlJywgZ3JvdXA6IHsgdGl0bGU6ICdRdWljayBGaXgnLCBpY29uOiBDb2RpY29uLmxpZ2h0QnVsYiB9IH0sXG5cdHsga2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbiwgaXRlbTogJ2ZpeC0zJywgbGFiZWw6ICdBZGQgXFwnYXdhaXRcXCcgdG8gYXN5bmMgY2FsbCcsIGdyb3VwOiB7IHRpdGxlOiAnUXVpY2sgRml4JywgaWNvbjogQ29kaWNvbi5saWdodEJ1bGIgfSB9LFxuXTtcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwKHsgcGF0aDogJ2VkaXRvci8nIH0sIHtcblx0R3JvdXBlZENvZGVBY3Rpb25zOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ2FuaW1hdGVkJyB9LFxuXHRcdHJlbmRlcjogKGNvbnRleHQpID0+IHJlbmRlckNvZGVBY3Rpb25MaXN0KHsgLi4uY29udGV4dCwgaXRlbXM6IHF1aWNrRml4SXRlbXMgfSksXG5cdH0pLFxuXHRTaW1wbGVRdWlja0ZpeGVzOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiAoY29udGV4dCkgPT4gcmVuZGVyQ29kZUFjdGlvbkxpc3QoeyAuLi5jb250ZXh0LCBpdGVtczogc2ltcGxlRml4ZXMgfSksXG5cdH0pLFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsWUFBWTtBQUNyQixTQUFrQyxzQkFBc0Isd0JBQXdCLDBCQUEwQixpQ0FBaUM7QUFDM0ksU0FBUyxZQUFZLDBCQUFnRTtBQUNyRixTQUFTLHNCQUFzQjtBQUUvQixPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFPUCxTQUFTLHFCQUFxQixTQUF5QztBQUN0RSxRQUFNLEVBQUUsV0FBVyxpQkFBaUIsTUFBTSxJQUFJO0FBQzlDLFlBQVUsTUFBTSxRQUFRLFFBQVEsU0FBUztBQUV6QyxRQUFNLHVCQUF1QixxQkFBcUIsaUJBQWlCO0FBQUEsSUFDbEUsWUFBWTtBQUFBLElBQ1osb0JBQW9CLENBQUMsUUFBUTtBQUM1QixnQ0FBMEIsR0FBRztBQUM3QixVQUFJLGVBQWUsZ0JBQWdCLElBQUksY0FBYyxLQUFxQixFQUFFO0FBQUEsUUFBckM7QUFBQTtBQU10QyxlQUFrQixzQkFBc0IsRUFBRSxLQUFLLEdBQUcsY0FBYyxFQUFFO0FBQ2xFLGVBQWtCLDJCQUEyQixNQUFNO0FBQ25ELGVBQWtCLDZCQUE2QixNQUFNO0FBQ3JELGVBQWtCLHVCQUF1QixNQUFNO0FBQy9DLGVBQWtCLDZCQUE2QixNQUFNO0FBQ3JELGVB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
