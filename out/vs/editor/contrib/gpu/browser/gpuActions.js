import { getActiveWindow } from "../../../../base/browser/dom.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { URI } from "../../../../base/common/uri.js";
import { localize, localize2 } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { EditorAction, registerEditorAction } from "../../../browser/editorExtensions.js";
import { ensureNonNullable } from "../../../browser/gpu/gpuUtils.js";
import { GlyphRasterizer } from "../../../browser/gpu/raster/glyphRasterizer.js";
import { ViewGpuContext } from "../../../browser/gpu/viewGpuContext.js";
class DebugEditorGpuRendererAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.debugEditorGpuRenderer",
      label: localize2("gpuDebug.label", "Developer: Debug Editor GPU Renderer"),
      // TODO: Why doesn't `ContextKeyExpr.equals('config:editor.experimentalGpuAcceleration', 'on')` work?
      precondition: ContextKeyExpr.true()
    });
  }
  async run(accessor, editor) {
    const instantiationService = accessor.get(IInstantiationService);
    const quickInputService = accessor.get(IQuickInputService);
    const choice = await quickInputService.pick([
      {
        label: localize("logTextureAtlasStats.label", "Log Texture Atlas Stats"),
        id: "logTextureAtlasStats"
      },
      {
        label: localize("saveTextureAtlas.label", "Save Texture Atlas"),
        id: "saveTextureAtlas"
      },
      {
        label: localize("drawGlyph.label", "Draw Glyph"),
        id: "drawGlyph"
      }
    ], { canPickMany: false });
    if (!choice) {
      return;
    }
    switch (choice.id) {
      case "logTextureAtlasStats":
        instantiationService.invokeFunction((accessor2) => {
          const logService = accessor2.get(ILogService);
          const atlas = ViewGpuContext.atlas;
          if (!ViewGpuContext.atlas) {
            logService.error("No texture atlas found");
            return;
          }
          const stats = atlas.getStats();
          logService.info(["Texture atlas stats", ...stats].join("\n\n"));
        });
        break;
      case "saveTextureAtlas":
        instantiationService.invokeFunction(async (accessor2) => {
          const workspaceContextService = accessor2.get(IWorkspaceContextService);
          const fileService = accessor2.get(IFileService);
          const folders = workspaceContextService.getWorkspace().folders;
          if (folders.length > 0) {
            const atlas = ViewGpuContext.atlas;
            const promises = [];
            for (const [layerIndex, page] of atlas.pages.entries()) {
              promises.push(...[
                fileService.writeFile(
                  URI.joinPath(folders[0].uri, `textureAtlasPage${layerIndex}_actual.png`),
                  VSBuffer.wrap(new Uint8Array(await (await page.source.convertToBlob()).arrayBuffer()))
                ),
                fileService.writeFile(
                  URI.joinPath(folders[0].uri, `textureAtlasPage${layerIndex}_usage.png`),
                  VSBuffer.wrap(new Uint8Array(await (await page.getUsagePreview()).arrayBuffer()))
                )
              ]);
            }
            await Promise.all(promises);
          }
        });
        break;
      case "drawGlyph":
        instantiationService.invokeFunction(async (accessor2) => {
          const configurationService = accessor2.get(IConfigurationService);
          const fileService = accessor2.get(IFileService);
          const quickInputService2 = accessor2.get(IQuickInputService);
          const workspaceContextService = accessor2.get(IWorkspaceContextService);
          const folders = workspaceContextService.getWorkspace().folders;
          if (folders.length === 0) {
            return;
          }
          const atlas = ViewGpuContext.atlas;
          const fontFamily = configurationService.getValue("editor.fontFamily");
          const fontSize = configurationService.getValue("editor.fontSize");
          const rasterizer = new GlyphRasterizer(fontSize, fontFamily, getActiveWindow().devicePixelRatio, ViewGpuContext.decorationStyleCache);
          let chars = await quickInputService2.input({
            prompt: "Enter a character to draw (prefix with 0x for code point))"
          });
          if (!chars) {
            return;
          }
          const codePoint = chars.match(/0x(?<codePoint>[0-9a-f]+)/i)?.groups?.codePoint;
          if (codePoint !== void 0) {
            chars = String.fromCodePoint(parseInt(codePoint, 16));
          }
          const tokenMetadata = 0;
          const charMetadata = 0;
          const rasterizedGlyph = atlas.getGlyph(rasterizer, chars, tokenMetadata, charMetadata, 0);
          if (!rasterizedGlyph) {
            return;
          }
          const imageData = atlas.pages[rasterizedGlyph.pageIndex].source.getContext("2d")?.getImageData(
            rasterizedGlyph.x,
            rasterizedGlyph.y,
            rasterizedGlyph.w,
            rasterizedGlyph.h
          );
          if (!imageData) {
            return;
          }
          const canvas = new OffscreenCanvas(imageData.width, imageData.height);
          const ctx = ensureNonNullable(canvas.getContext("2d"));
          ctx.putImageData(imageData, 0, 0);
          const blob = await canvas.convertToBlob({ type: "image/png" });
          const resource = URI.joinPath(folders[0].uri, `glyph_${chars}_${tokenMetadata}_${fontSize}px_${fontFamily.replaceAll(/[,\\\/\.'\s]/g, "_")}.png`);
          await fileService.writeFile(resource, VSBuffer.wrap(new Uint8Array(await blob.arrayBuffer())));
        });
        break;
    }
  }
}
registerEditorAction(DebugEditorGpuRendererAction);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGdwdVxcYnJvd3NlclxcZ3B1QWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGdldEFjdGl2ZVdpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB0eXBlIHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yQWN0aW9uLCByZWdpc3RlckVkaXRvckFjdGlvbiwgdHlwZSBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vbk51bGxhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9ncHUvZ3B1VXRpbHMuanMnO1xuaW1wb3J0IHsgR2x5cGhSYXN0ZXJpemVyIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9ncHUvcmFzdGVyL2dseXBoUmFzdGVyaXplci5qcyc7XG5pbXBvcnQgeyBWaWV3R3B1Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZ3B1L3ZpZXdHcHVDb250ZXh0LmpzJztcblxuY2xhc3MgRGVidWdFZGl0b3JHcHVSZW5kZXJlckFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLmRlYnVnRWRpdG9yR3B1UmVuZGVyZXInLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplMignZ3B1RGVidWcubGFiZWwnLCBcIkRldmVsb3BlcjogRGVidWcgRWRpdG9yIEdQVSBSZW5kZXJlclwiKSxcblx0XHRcdC8vIFRPRE86IFdoeSBkb2Vzbid0IGBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZzplZGl0b3IuZXhwZXJpbWVudGFsR3B1QWNjZWxlcmF0aW9uJywgJ29uJylgIHdvcms/XG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLnRydWUoKSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBjaG9pY2UgPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrKFtcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdsb2dUZXh0dXJlQXRsYXNTdGF0cy5sYWJlbCcsIFwiTG9nIFRleHR1cmUgQXRsYXMgU3RhdHNcIiksXG5cdFx0XHRcdGlkOiAnbG9nVGV4dHVyZUF0bGFzU3RhdHMnLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzYXZlVGV4dHVyZUF0bGFzLmxhYmVsJywgXCJTYXZlIFRleHR1cmUgQXRsYXNcIiksXG5cdFx0XHRcdGlkOiAnc2F2ZVRleHR1cmVBdGxhcycsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2RyYXdHbHlwaC5sYWJlbCcsIFwiRHJhdyBHbHlwaFwiKSxcblx0XHRcdFx0aWQ6ICdkcmF3R2x5cGgnLFxuXHRcdFx0fSxcblx0XHRdLCB7IGNhblBpY2tNYW55OiBmYWxzZSB9KTtcblx0XHRpZiAoIWNob2ljZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRzd2l0Y2ggKGNob2ljZS5pZCkge1xuXHRcdFx0Y2FzZSAnbG9nVGV4dHVyZUF0bGFzU3RhdHMnOlxuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJTG9nU2VydmljZSk7XG5cblx0XHRcdFx0XHRjb25zdCBhdGxhcyA9IFZpZXdHcHVDb250ZXh0LmF0bGFzO1xuXHRcdFx0XHRcdGlmICghVmlld0dwdUNvbnRleHQuYXRsYXMpIHtcblx0XHRcdFx0XHRcdGxvZ1NlcnZpY2UuZXJyb3IoJ05vIHRleHR1cmUgYXRsYXMgZm91bmQnKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBzdGF0cyA9IGF0bGFzLmdldFN0YXRzKCk7XG5cdFx0XHRcdFx0bG9nU2VydmljZS5pbmZvKFsnVGV4dHVyZSBhdGxhcyBzdGF0cycsIC4uLnN0YXRzXS5qb2luKCdcXG5cXG4nKSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ3NhdmVUZXh0dXJlQXRsYXMnOlxuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhc3luYyBhY2Nlc3NvciA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlQ29udGV4dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKTtcblx0XHRcdFx0XHRjb25zdCBmaWxlU2VydmljZSA9IGFjY2Vzc29yLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0XHRcdGNvbnN0IGZvbGRlcnMgPSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzO1xuXHRcdFx0XHRcdGlmIChmb2xkZXJzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdGNvbnN0IGF0bGFzID0gVmlld0dwdUNvbnRleHQuYXRsYXM7XG5cdFx0XHRcdFx0XHRjb25zdCBwcm9taXNlcyA9IFtdO1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBbbGF5ZXJJbmRleCwgcGFnZV0gb2YgYXRsYXMucGFnZXMuZW50cmllcygpKSB7XG5cdFx0XHRcdFx0XHRcdHByb21pc2VzLnB1c2goLi4uW1xuXHRcdFx0XHRcdFx0XHRcdGZpbGVTZXJ2aWNlLndyaXRlRmlsZShcblx0XHRcdFx0XHRcdFx0XHRcdFVSSS5qb2luUGF0aChmb2xkZXJzWzBdLnVyaSwgYHRleHR1cmVBdGxhc1BhZ2Uke2xheWVySW5kZXh9X2FjdHVhbC5wbmdgKSxcblx0XHRcdFx0XHRcdFx0XHRcdFZTQnVmZmVyLndyYXAobmV3IFVpbnQ4QXJyYXkoYXdhaXQgKGF3YWl0IHBhZ2Uuc291cmNlLmNvbnZlcnRUb0Jsb2IoKSkuYXJyYXlCdWZmZXIoKSkpXG5cdFx0XHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRcdFx0XHRmaWxlU2VydmljZS53cml0ZUZpbGUoXG5cdFx0XHRcdFx0XHRcdFx0XHRVUkkuam9pblBhdGgoZm9sZGVyc1swXS51cmksIGB0ZXh0dXJlQXRsYXNQYWdlJHtsYXllckluZGV4fV91c2FnZS5wbmdgKSxcblx0XHRcdFx0XHRcdFx0XHRcdFZTQnVmZmVyLndyYXAobmV3IFVpbnQ4QXJyYXkoYXdhaXQgKGF3YWl0IHBhZ2UuZ2V0VXNhZ2VQcmV2aWV3KCkpLmFycmF5QnVmZmVyKCkpKVxuXHRcdFx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnZHJhd0dseXBoJzpcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYXN5bmMgYWNjZXNzb3IgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRcdFx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdFx0XHRcdGNvbnN0IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSk7XG5cblx0XHRcdFx0XHRjb25zdCBmb2xkZXJzID0gd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycztcblx0XHRcdFx0XHRpZiAoZm9sZGVycy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBhdGxhcyA9IFZpZXdHcHVDb250ZXh0LmF0bGFzO1xuXHRcdFx0XHRcdGNvbnN0IGZvbnRGYW1pbHkgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KCdlZGl0b3IuZm9udEZhbWlseScpO1xuXHRcdFx0XHRcdGNvbnN0IGZvbnRTaXplID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPignZWRpdG9yLmZvbnRTaXplJyk7XG5cdFx0XHRcdFx0Y29uc3QgcmFzdGVyaXplciA9IG5ldyBHbHlwaFJhc3Rlcml6ZXIoZm9udFNpemUsIGZvbnRGYW1pbHksIGdldEFjdGl2ZVdpbmRvdygpLmRldmljZVBpeGVsUmF0aW8sIFZpZXdHcHVDb250ZXh0LmRlY29yYXRpb25TdHlsZUNhY2hlKTtcblx0XHRcdFx0XHRsZXQgY2hhcnMgPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5pbnB1dCh7XG5cdFx0XHRcdFx0XHRwcm9tcHQ6ICdFbnRlciBhIGNoYXJhY3RlciB0byBkcmF3IChwcmVmaXggd2l0aCAweCBmb3IgY29kZSBwb2ludCkpJ1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGlmICghY2hhcnMpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgY29kZVBvaW50ID0gY2hhcnMubWF0Y2goLzB4KD88Y29kZVBvaW50PlswLTlhLWZdKykvaSk/Lmdyb3Vwcz8uY29kZVBvaW50O1xuXHRcdFx0XHRcdGlmIChjb2RlUG9pbnQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0Y2hhcnMgPSBTdHJpbmcuZnJvbUNvZGVQb2ludChwYXJzZUludChjb2RlUG9pbnQsIDE2KSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHRva2VuTWV0YWRhdGEgPSAwO1xuXHRcdFx0XHRcdGNvbnN0IGNoYXJNZXRhZGF0YSA9IDA7XG5cdFx0XHRcdFx0Y29uc3QgcmFzdGVyaXplZEdseXBoID0gYXRsYXMuZ2V0R2x5cGgocmFzdGVyaXplciwgY2hhcnMsIHRva2VuTWV0YWRhdGEsIGNoYXJNZXRhZGF0YSwgMCk7XG5cdFx0XHRcdFx0aWYgKCFyYXN0ZXJpemVkR2x5cGgpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgaW1hZ2VEYXRhID0gYXRsYXMucGFnZXNbcmFzdGVyaXplZEdseXBoLnBhZ2VJbmRleF0uc291cmNlLmdldENvbnRleHQoJzJkJyk/LmdldEltYWdlRGF0YShcblx0XHRcdFx0XHRcdHJhc3Rlcml6ZWRHbHlwaC54LFxuXHRcdFx0XHRcdFx0cmFzdGVyaXplZEdseXBoLnksXG5cdFx0XHRcdFx0XHRyYXN0ZXJpemVkR2x5cGgudyxcblx0XHRcdFx0XHRcdHJhc3Rlcml6ZWRHbHlwaC5oXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRpZiAoIWltYWdlRGF0YSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBjYW52YXMgPSBuZXcgT2Zmc2NyZWVuQ2FudmFzKGltYWdlRGF0YS53aWR0aCwgaW1hZ2VEYXRhLmhlaWdodCk7XG5cdFx0XHRcdFx0Y29uc3QgY3R4ID0gZW5zdXJlTm9uTnVsbGFibGUoY2FudmFzLmdldENvbnRleHQoJzJkJykpO1xuXHRcdFx0XHRcdGN0eC5wdXRJbWFnZURhdGEoaW1hZ2VEYXRhLCAwLCAwKTtcblx0XHRcdFx0XHRjb25zdCBibG9iID0gYXdhaXQgY2FudmFzLmNvbnZlcnRUb0Jsb2IoeyB0eXBlOiAnaW1hZ2UvcG5nJyB9KTtcblx0XHRcdFx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5qb2luUGF0aChmb2xkZXJzWzBdLnVyaSwgYGdseXBoXyR7Y2hhcnN9XyR7dG9rZW5NZXRhZGF0YX1fJHtmb250U2l6ZX1weF8ke2ZvbnRGYW1pbHkucmVwbGFjZUFsbCgvWyxcXFxcXFwvXFwuJ1xcc10vZywgJ18nKX0ucG5nYCk7XG5cdFx0XHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci53cmFwKG5ldyBVaW50OEFycmF5KGF3YWl0IGJsb2IuYXJyYXlCdWZmZXIoKSkpKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxufVxuXG5yZWdpc3RlckVkaXRvckFjdGlvbihEZWJ1Z0VkaXRvckdwdVJlbmRlcmVyQWN0aW9uKTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsV0FBVztBQUNwQixTQUFTLFVBQVUsaUJBQWlCO0FB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QUNmO0FBQUEsVUFDRDtBQUNBLGdCQUFNLFNBQVMsSUFBSSxnQkFBZ0IsVUFBVSxPQUFPLFVBQVUsTUFBTTtBQUNwRSxnQkFBTSxNQUFNLGtCQUFrQixPQUFPLFdBQVcsSUFBSSxDQUFDO0FBQ3JELGNBQUksYUFBYSxXQUFXLEdBQUcsQ0FBQztBQUNoQyxnQkFBTSxPQUFPLE1BQU0sT0FBTyxjQUFjLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFDN0QsZ0JBQU0sV0FBVyxJQUFJLFNBQVMsUUFBUSxDQUFDLEVBQUUsS0FBSyxTQUFTLEtBQUssSUFBSSxhQUFhLElBQUksUUFBUSxNQUFNLFdBQVcsV0FBVyxpQkFBaUIsR0FBRyxDQUFDLE1BQU07QUFDaEosZ0JBQU0sWUFBWSxVQUFVLFVBQVUsU0FBUyxLQUFLLElBQUksV0FBVyxNQUFNLEtBQUssWUFBWSxDQUFDLENBQUMsQ0FBQztBQUFBLFFBQzlGLENBQUM7QUFDRDtBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxxQkFBcUIsNEJBQTRCOyIsCiAgIm5hbWVzIjogWyJhY2Nlc3NvciIsICJxdWlja0lucHV0U2VydmljZSJdCn0K
