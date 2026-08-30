import { Event } from "../../../../../base/common/event.js";
import { observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IListService, ListService } from "../../../../../platform/list/browser/listService.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { IDecorationsService } from "../../../../../workbench/services/decorations/common/decorations.js";
import { IEditorService } from "../../../../../workbench/services/editor/common/editorService.js";
import { INotebookDocumentService } from "../../../../../workbench/services/notebook/common/notebookDocumentService.js";
import { ITextFileService } from "../../../../../workbench/services/textfile/common/textfiles.js";
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from "../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js";
import { SessionFileOperation } from "../../../../services/sessions/common/session.js";
import { SessionFilesWidget } from "../../browser/sessionFilesWidget.js";
import "../../../../common/theme.js";
const SAMPLE_FILES = [
  { uri: URI.file("/home/user/.bashrc"), operation: SessionFileOperation.Modified, originalUri: URI.file("/home/user/.bashrc.orig") },
  { uri: URI.file("/home/user/.config/app/settings.json"), operation: SessionFileOperation.Created },
  { uri: URI.file("/home/user/.cache/tmp/scratch.log"), operation: SessionFileOperation.Deleted },
  { uri: URI.file("/tmp/agent-notes.md"), operation: SessionFileOperation.Created }
];
function renderWidget(ctx, options) {
  ctx.container.style.width = "360px";
  ctx.container.style.height = `${options?.height ?? 160}px`;
  ctx.container.style.backgroundColor = "var(--vscode-sideBar-background)";
  const instantiationService = createEditorServices(ctx.disposableStore, {
    colorTheme: ctx.theme,
    additionalServices: (reg) => {
      reg.defineInstance(IDecorationsService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeDecorations = Event.None;
        }
      }());
      reg.defineInstance(ITextFileService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.untitled = new class extends mock() {
            constructor() {
              super(...arguments);
              this.onDidChangeLabel = Event.None;
            }
          }();
        }
      }());
      reg.defineInstance(IWorkspaceContextService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeWorkspaceFolders = Event.None;
        }
        getWorkspace() {
          return { id: "", folders: [], configuration: void 0 };
        }
      }());
      reg.definePartialInstance(INotebookDocumentService, { getNotebook: () => void 0 });
      reg.defineInstance(IFileService, new class extends mock() {
        async readFile(resource) {
          return new class extends mock() {
            constructor() {
              super(...arguments);
              this.resource = resource;
              this.value = VSBuffer.fromString("original content");
            }
          }();
        }
      }());
      reg.define(IListService, ListService);
      registerWorkbenchServices(reg);
      reg.defineInstance(IEditorService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidActiveEditorChange = Event.None;
          this.onDidVisibleEditorsChange = Event.None;
          this.onDidEditorsChange = Event.None;
        }
        async openEditor() {
          return void 0;
        }
      }());
    }
  });
  const files = options?.files ?? SAMPLE_FILES;
  const input = {
    sessionFilesObs: observableValue("fixtureSessionFiles", files)
  };
  const widget = ctx.disposableStore.add(instantiationService.createInstance(SessionFilesWidget, ctx.container));
  ctx.disposableStore.add(widget.setInput(input));
  const totalHeight = options?.height ?? 160;
  widget.element.style.height = `${totalHeight}px`;
  widget.layout(Math.max(0, totalHeight - SessionFilesWidget.HEADER_HEIGHT));
}
var sessionFilesWidget_fixture_default = defineThemedFixtureGroup({ path: "changes/" }, {
  WithFiles: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderWidget(ctx)
  }),
  SingleCreatedFile: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderWidget(ctx, {
      files: [{ uri: URI.file("/home/user/.gitconfig"), operation: SessionFileOperation.Created }],
      height: 96
    })
  }),
  Empty: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderWidget(ctx, { files: [], height: 96 })
  })
});
export {
  sessionFilesWidget_fixture_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhbmdlc1xcdGVzdFxcYnJvd3Nlclxcc2Vzc2lvbkZpbGVzV2lkZ2V0LmZpeHR1cmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgSUZpbGVDb250ZW50LCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxpc3RTZXJ2aWNlLCBMaXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlLCBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJRGVjb3JhdGlvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2RlY29yYXRpb25zL2NvbW1vbi9kZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRG9jdW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0RvY3VtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGV4dEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL3RleHRmaWxlL2NvbW1vbi90ZXh0ZmlsZXMuanMnO1xuaW1wb3J0IHsgQ29tcG9uZW50Rml4dHVyZUNvbnRleHQsIGNyZWF0ZUVkaXRvclNlcnZpY2VzLCBkZWZpbmVDb21wb25lbnRGaXh0dXJlLCBkZWZpbmVUaGVtZWRGaXh0dXJlR3JvdXAsIHJlZ2lzdGVyV29ya2JlbmNoU2VydmljZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvdGVzdC9icm93c2VyL2NvbXBvbmVudEZpeHR1cmVzL2ZpeHR1cmVVdGlscy5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkZpbGUsIFNlc3Npb25GaWxlT3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgSVNlc3Npb25GaWxlc0lucHV0LCBTZXNzaW9uRmlsZXNXaWRnZXQgfSBmcm9tICcuLi8uLi9icm93c2VyL3Nlc3Npb25GaWxlc1dpZGdldC5qcyc7XG5cbi8vIEVuc3VyZSBjb2xvciByZWdpc3RyYXRpb25zIGFyZSBsb2FkZWRcbmltcG9ydCAnLi4vLi4vLi4vLi4vY29tbW9uL3RoZW1lLmpzJztcblxuY29uc3QgU0FNUExFX0ZJTEVTOiByZWFkb25seSBJU2Vzc2lvbkZpbGVbXSA9IFtcblx0eyB1cmk6IFVSSS5maWxlKCcvaG9tZS91c2VyLy5iYXNocmMnKSwgb3BlcmF0aW9uOiBTZXNzaW9uRmlsZU9wZXJhdGlvbi5Nb2RpZmllZCwgb3JpZ2luYWxVcmk6IFVSSS5maWxlKCcvaG9tZS91c2VyLy5iYXNocmMub3JpZycpIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL2hvbWUvdXNlci8uY29uZmlnL2FwcC9zZXR0aW5ncy5qc29uJyksIG9wZXJhdGlvbjogU2Vzc2lvbkZpbGVPcGVyYXRpb24uQ3JlYXRlZCB9LFxuXHR7IHVyaTogVVJJLmZpbGUoJy9ob21lL3VzZXIvLmNhY2hlL3RtcC9zY3JhdGNoLmxvZycpLCBvcGVyYXRpb246IFNlc3Npb25GaWxlT3BlcmF0aW9uLkRlbGV0ZWQgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvdG1wL2FnZW50LW5vdGVzLm1kJyksIG9wZXJhdGlvbjogU2Vzc2lvbkZpbGVPcGVyYXRpb24uQ3JlYXRlZCB9LFxuXTtcblxuZnVuY3Rpb24gcmVuZGVyV2lkZ2V0KGN0eDogQ29tcG9uZW50Rml4dHVyZUNvbnRleHQsIG9wdGlvbnM/OiB7IGZpbGVzPzogcmVhZG9ubHkgSVNlc3Npb25GaWxlW107IGhlaWdodD86IG51bWJlciB9KTogdm9pZCB7XG5cdGN0eC5jb250YWluZXIuc3R5bGUud2lkdGggPSAnMzYwcHgnO1xuXHRjdHguY29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke29wdGlvbnM/LmhlaWdodCA/PyAxNjB9cHhgO1xuXHRjdHguY29udGFpbmVyLnN0eWxlLmJhY2tncm91bmRDb2xvciA9ICd2YXIoLS12c2NvZGUtc2lkZUJhci1iYWNrZ3JvdW5kKSc7XG5cblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVFZGl0b3JTZXJ2aWNlcyhjdHguZGlzcG9zYWJsZVN0b3JlLCB7XG5cdFx0Y29sb3JUaGVtZTogY3R4LnRoZW1lLFxuXHRcdGFkZGl0aW9uYWxTZXJ2aWNlczogKHJlZykgPT4ge1xuXHRcdFx0Ly8gU2VydmljZXMgcmVxdWlyZWQgYnkgUmVzb3VyY2VMYWJlbHMgKGZpbGUgbGFiZWxzIGluIHRoZSBsaXN0KS5cblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJRGVjb3JhdGlvbnNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElEZWNvcmF0aW9uc1NlcnZpY2U+KCkgeyBvdmVycmlkZSBvbkRpZENoYW5nZURlY29yYXRpb25zID0gRXZlbnQuTm9uZTsgfSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJVGV4dEZpbGVTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElUZXh0RmlsZVNlcnZpY2U+KCkgeyBvdmVycmlkZSByZWFkb25seSB1bnRpdGxlZCA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVRleHRGaWxlU2VydmljZVsndW50aXRsZWQnXT4oKSB7IG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlTGFiZWwgPSBFdmVudC5Ob25lOyB9KCk7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElXb3Jrc3BhY2VDb250ZXh0U2VydmljZT4oKSB7IG92ZXJyaWRlIG9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycyA9IEV2ZW50Lk5vbmU7IG92ZXJyaWRlIGdldFdvcmtzcGFjZSgpOiBJV29ya3NwYWNlIHsgcmV0dXJuIHsgaWQ6ICcnLCBmb2xkZXJzOiBbXSwgY29uZmlndXJhdGlvbjogdW5kZWZpbmVkIH07IH0gfSgpKTtcblx0XHRcdHJlZy5kZWZpbmVQYXJ0aWFsSW5zdGFuY2UoSU5vdGVib29rRG9jdW1lbnRTZXJ2aWNlLCB7IGdldE5vdGVib29rOiAoKSA9PiB1bmRlZmluZWQgfSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUZpbGVTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElGaWxlU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIHJlYWRGaWxlKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElGaWxlQ29udGVudD4ge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElGaWxlQ29udGVudD4oKSB7XG5cdFx0XHRcdFx0XHRvdmVycmlkZSByZWFkb25seSByZXNvdXJjZSA9IHJlc291cmNlO1xuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgdmFsdWUgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKCdvcmlnaW5hbCBjb250ZW50Jyk7XG5cdFx0XHRcdFx0fSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KCkpO1xuXHRcdFx0Ly8gUmVxdWlyZWQgYnkgV29ya2JlbmNoTGlzdCAodGhlIGZpbGVzIGxpc3QpLlxuXHRcdFx0cmVnLmRlZmluZShJTGlzdFNlcnZpY2UsIExpc3RTZXJ2aWNlKTtcblx0XHRcdHJlZ2lzdGVyV29ya2JlbmNoU2VydmljZXMocmVnKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJRWRpdG9yU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRWRpdG9yU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRWaXNpYmxlRWRpdG9yc0NoYW5nZSA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkRWRpdG9yc0NoYW5nZSA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIG9wZW5FZGl0b3IoKTogUHJvbWlzZTx1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0fSgpKTtcblx0XHR9LFxuXHR9KTtcblxuXHRjb25zdCBmaWxlcyA9IG9wdGlvbnM/LmZpbGVzID8/IFNBTVBMRV9GSUxFUztcblx0Y29uc3QgaW5wdXQ6IElTZXNzaW9uRmlsZXNJbnB1dCA9IHtcblx0XHRzZXNzaW9uRmlsZXNPYnM6IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJU2Vzc2lvbkZpbGVbXT4oJ2ZpeHR1cmVTZXNzaW9uRmlsZXMnLCBmaWxlcyksXG5cdH07XG5cblx0Y29uc3Qgd2lkZ2V0ID0gY3R4LmRpc3Bvc2FibGVTdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkZpbGVzV2lkZ2V0LCBjdHguY29udGFpbmVyKSk7XG5cdGN0eC5kaXNwb3NhYmxlU3RvcmUuYWRkKHdpZGdldC5zZXRJbnB1dChpbnB1dCkpO1xuXG5cdC8vIFRoZSB3aWRnZXQgbm9ybWFsbHkgbGl2ZXMgaW5zaWRlIGEgU3BsaXRWaWV3IHBhbmUgdGhhdCBkcml2ZXMgaXRzIGxheW91dDtcblx0Ly8gdGhlIGZpeHR1cmUgc2l6ZXMgaXQgZGlyZWN0bHkgc28gdGhlIGxpc3QgcmVuZGVycy5cblx0Y29uc3QgdG90YWxIZWlnaHQgPSBvcHRpb25zPy5oZWlnaHQgPz8gMTYwO1xuXHR3aWRnZXQuZWxlbWVudC5zdHlsZS5oZWlnaHQgPSBgJHt0b3RhbEhlaWdodH1weGA7XG5cdHdpZGdldC5sYXlvdXQoTWF0aC5tYXgoMCwgdG90YWxIZWlnaHQgLSBTZXNzaW9uRmlsZXNXaWRnZXQuSEVBREVSX0hFSUdIVCkpO1xufVxuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVUaGVtZWRGaXh0dXJlR3JvdXAoeyBwYXRoOiAnY2hhbmdlcy8nIH0sIHtcblxuXHRXaXRoRmlsZXM6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IChjdHgpID0+IHJlbmRlcldpZGdldChjdHgpLFxuXHR9KSxcblxuXHRTaW5nbGVDcmVhdGVkRmlsZTogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogKGN0eCkgPT4gcmVuZGVyV2lkZ2V0KGN0eCwge1xuXHRcdFx0ZmlsZXM6IFt7IHVyaTogVVJJLmZpbGUoJy9ob21lL3VzZXIvLmdpdGNvbmZpZycpLCBvcGVyYXRpb246IFNlc3Npb25GaWxlT3BlcmF0aW9uLkNyZWF0ZWQgfV0sXG5cdFx0XHRoZWlnaHQ6IDk2LFxuXHRcdH0pLFxuXHR9KSxcblxuXHRFbXB0eTogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogKGN0eCkgPT4gcmVuZGVyV2lkZ2V0KGN0eCwgeyBmaWxlczogW10sIGhlaWdodDogOTYgfSksXG5cdH0pLFxuXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsYUFBYTtBQUN0QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxZQUFZO0FBQ3JCLFNBQXVCLG9CQUFvQjtBQUMzQyxTQUFTLGNBQWMsbUJBQW1CO0FBQzFDLFNBQXFCLGdDQUFnQztBQUNyRCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFrQyxzQkFBc0Isd0JBQXdCLDBCQUEwQixp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
