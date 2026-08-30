import { isValidBasename } from "../../../../../base/common/extpath.js";
import { extname } from "../../../../../base/common/path.js";
import { basename, joinPath } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
import { getIconClassesForLanguageId } from "../../../../../editor/common/services/getIconClasses.js";
import * as nls from "../../../../../nls.js";
import { MenuId } from "../../../../../platform/actions/common/actions.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { SnippetsAction } from "./abstractSnippetsActions.js";
import { ISnippetsService } from "../snippets.js";
import { SnippetSource } from "../snippetsFile.js";
import { ITextFileService } from "../../../../services/textfile/common/textfiles.js";
import { IUserDataProfileService } from "../../../../services/userDataProfile/common/userDataProfile.js";
var ISnippetPick;
((ISnippetPick2) => {
  function is(thing) {
    return !!thing && URI.isUri(thing.filepath);
  }
  ISnippetPick2.is = is;
})(ISnippetPick || (ISnippetPick = {}));
async function computePicks(snippetService, userDataProfileService, languageService, labelService) {
  const existing = [];
  const future = [];
  const seen = /* @__PURE__ */ new Set();
  const added = /* @__PURE__ */ new Map();
  for (const file of await snippetService.getSnippetFiles()) {
    if (file.source === SnippetSource.Extension) {
      continue;
    }
    if (file.isGlobalSnippets) {
      await file.load();
      const names = /* @__PURE__ */ new Set();
      let source;
      outer: for (const snippet2 of file.data) {
        if (!source) {
          source = snippet2.source;
        }
        for (const scope of snippet2.scopes) {
          const name = languageService.getLanguageName(scope);
          if (name) {
            if (names.size >= 4) {
              names.add(`${name}...`);
              break outer;
            } else {
              names.add(name);
            }
          }
        }
      }
      const snippet = {
        label: basename(file.location),
        filepath: file.location,
        description: names.size === 0 ? nls.localize("global.scope", "(global)") : nls.localize("global.1", "({0})", [...names].join(", "))
      };
      existing.push(snippet);
      if (!source) {
        continue;
      }
      const detail = nls.localize("detail.label", "({0}) {1}", source, labelService.getUriLabel(file.location, { relative: true }));
      const lastItem = added.get(basename(file.location));
      if (lastItem) {
        snippet.detail = detail;
        lastItem.snippet.detail = lastItem.detail;
      }
      added.set(basename(file.location), { snippet, detail });
    } else {
      const mode = basename(file.location).replace(/\.json$/, "");
      existing.push({
        label: basename(file.location),
        description: `(${languageService.getLanguageName(mode) ?? mode})`,
        filepath: file.location
      });
      seen.add(mode);
    }
  }
  const dir = userDataProfileService.currentProfile.snippetsHome;
  for (const languageId of languageService.getRegisteredLanguageIds()) {
    const label = languageService.getLanguageName(languageId);
    if (label && !seen.has(languageId)) {
      future.push({
        label: languageId,
        description: `(${label})`,
        filepath: joinPath(dir, `${languageId}.json`),
        hint: true,
        iconClasses: getIconClassesForLanguageId(languageId)
      });
    }
  }
  existing.sort((a, b) => {
    const a_ext = extname(a.filepath.path);
    const b_ext = extname(b.filepath.path);
    if (a_ext === b_ext) {
      return a.label.localeCompare(b.label);
    } else if (a_ext === ".code-snippets") {
      return -1;
    } else {
      return 1;
    }
  });
  future.sort((a, b) => {
    return a.label.localeCompare(b.label);
  });
  return { existing, future };
}
async function createSnippetFile(scope, defaultPath, quickInputService, fileService, textFileService, opener) {
  function createSnippetUri(input2) {
    const filename = extname(input2) !== ".code-snippets" ? `${input2}.code-snippets` : input2;
    return joinPath(defaultPath, filename);
  }
  await fileService.createFolder(defaultPath);
  const input = await quickInputService.input({
    placeHolder: nls.localize("name", "Type snippet file name"),
    async validateInput(input2) {
      if (!input2) {
        return nls.localize("bad_name1", "Invalid file name");
      }
      if (!isValidBasename(input2)) {
        return nls.localize("bad_name2", "'{0}' is not a valid file name", input2);
      }
      if (await fileService.exists(createSnippetUri(input2))) {
        return nls.localize("bad_name3", "'{0}' already exists", input2);
      }
      return void 0;
    }
  });
  if (!input) {
    return void 0;
  }
  const resource = createSnippetUri(input);
  await textFileService.write(resource, [
    "{",
    "	// Place your " + scope + " snippets here. Each snippet is defined under a snippet name and has a scope, prefix, body and ",
    "	// description. Add comma separated ids of the languages where the snippet is applicable in the scope field. If scope ",
    "	// is left empty or omitted, the snippet gets applied to all languages. The prefix is what is ",
    "	// used to trigger the snippet and the body will be expanded and inserted. Possible variables are: ",
    "	// $1, $2 for tab stops, $0 for the final cursor position, and ${1:label}, ${2:another} for placeholders. ",
    "	// Placeholders with the same ids are connected.",
    "	// Example:",
    '	// "Print to console": {',
    '	// 	"scope": "javascript,typescript",',
    '	// 	"prefix": "log",',
    '	// 	"body": [',
    `	// 		"console.log('$1');",`,
    '	// 		"$2"',
    "	// 	],",
    '	// 	"description": "Log output to console"',
    "	// }",
    "	//",
    "	// You can also restrict snippets to specific files using include/exclude patterns:",
    '	// "Test snippet": {',
    '	// 	"scope": "javascript,typescript",',
    '	// 	"prefix": "test",',
    `	// 	"body": "test('$1', () => {\\n\\t$0\\n});",`,
    '	// 	"include": ["**/*.test.ts", "*.spec.ts"],',
    '	// 	"exclude": ["**/temp/*.ts"],',
    '	// 	"description": "Insert test block"',
    "	// }",
    "}"
  ].join("\n"));
  await opener.open(resource);
  return void 0;
}
async function createLanguageSnippetFile(pick, fileService, textFileService) {
  if (await fileService.exists(pick.filepath)) {
    return;
  }
  const contents = [
    "{",
    "	// Place your snippets for " + pick.label + " here. Each snippet is defined under a snippet name and has a prefix, body and ",
    "	// description. The prefix is what is used to trigger the snippet and the body will be expanded and inserted. Possible variables are:",
    "	// $1, $2 for tab stops, $0 for the final cursor position, and ${1:label}, ${2:another} for placeholders. Placeholders with the ",
    "	// same ids are connected.",
    "	// Example:",
    '	// "Print to console": {',
    '	// 	"prefix": "log",',
    '	// 	"body": [',
    `	// 		"console.log('$1');",`,
    '	// 		"$2"',
    "	// 	],",
    '	// 	"description": "Log output to console"',
    "	// }",
    "	//",
    "	// You can also restrict snippets to specific files using include/exclude patterns:",
    '	// "Test snippet": {',
    '	// 	"prefix": "test",',
    `	// 	"body": "test('$1', () => {\\n\\t$0\\n});",`,
    '	// 	"include": ["**/*.test.ts", "*.spec.ts"],',
    '	// 	"exclude": ["**/temp/*.ts"],',
    '	// 	"description": "Insert test block"',
    "	// }",
    "}"
  ].join("\n");
  await textFileService.write(pick.filepath, contents);
}
class ConfigureSnippetsAction extends SnippetsAction {
  constructor() {
    super({
      id: "workbench.action.openSnippets",
      title: nls.localize2("openSnippet.label", "Configure Snippets"),
      shortTitle: {
        ...nls.localize2("userSnippets", "Snippets"),
        mnemonicTitle: nls.localize({ key: "miOpenSnippets", comment: ["&& denotes a mnemonic"] }, "&&Snippets")
      },
      f1: true,
      menu: [
        { id: MenuId.MenubarPreferencesMenu, group: "2_configuration", order: 5 },
        { id: MenuId.GlobalActivity, group: "2_configuration", order: 5 }
      ]
    });
  }
  async run(accessor) {
    const snippetService = accessor.get(ISnippetsService);
    const quickInputService = accessor.get(IQuickInputService);
    const opener = accessor.get(IOpenerService);
    const languageService = accessor.get(ILanguageService);
    const userDataProfileService = accessor.get(IUserDataProfileService);
    const workspaceService = accessor.get(IWorkspaceContextService);
    const fileService = accessor.get(IFileService);
    const textFileService = accessor.get(ITextFileService);
    const labelService = accessor.get(ILabelService);
    const picks = await computePicks(snippetService, userDataProfileService, languageService, labelService);
    const existing = picks.existing;
    const globalSnippetPicks = [{
      scope: nls.localize("new.global_scope", "global"),
      label: nls.localize("new.global", "New Global Snippets file..."),
      uri: userDataProfileService.currentProfile.snippetsHome
    }];
    const workspaceSnippetPicks = [];
    for (const folder of workspaceService.getWorkspace().folders) {
      workspaceSnippetPicks.push({
        scope: nls.localize("new.workspace_scope", "{0} workspace", folder.name),
        label: nls.localize("new.folder", "New Snippets file for '{0}'...", folder.name),
        uri: folder.toResource(".vscode")
      });
    }
    if (existing.length > 0) {
      existing.unshift({ type: "separator", label: nls.localize("group.global", "Existing Snippets") });
      existing.push({ type: "separator", label: nls.localize("new.global.sep", "New Snippets") });
    } else {
      existing.push({ type: "separator", label: nls.localize("new.global.sep", "New Snippets") });
    }
    const pick = await quickInputService.pick([].concat(existing, globalSnippetPicks, workspaceSnippetPicks, picks.future), {
      placeHolder: nls.localize("openSnippet.pickLanguage", "Select Snippets File or Create Snippets"),
      matchOnDescription: true
    });
    if (globalSnippetPicks.indexOf(pick) >= 0) {
      return createSnippetFile(pick.scope, pick.uri, quickInputService, fileService, textFileService, opener);
    } else if (workspaceSnippetPicks.indexOf(pick) >= 0) {
      return createSnippetFile(pick.scope, pick.uri, quickInputService, fileService, textFileService, opener);
    } else if (ISnippetPick.is(pick)) {
      if (pick.hint) {
        await createLanguageSnippetFile(pick, fileService, textFileService);
      }
      return opener.open(pick.filepath);
    }
  }
}
export {
  ConfigureSnippetsAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNuaXBwZXRzXFxicm93c2VyXFxjb21tYW5kc1xcY29uZmlndXJlU25pcHBldHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBpc1ZhbGlkQmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9leHRwYXRoLmpzJztcbmltcG9ydCB7IGV4dG5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IGdldEljb25DbGFzc2VzRm9yTGFuZ3VhZ2VJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvZ2V0SWNvbkNsYXNzZXMuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSwgUXVpY2tQaWNrSW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IFNuaXBwZXRzQWN0aW9uIH0gZnJvbSAnLi9hYnN0cmFjdFNuaXBwZXRzQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJU25pcHBldHNTZXJ2aWNlIH0gZnJvbSAnLi4vc25pcHBldHMuanMnO1xuaW1wb3J0IHsgU25pcHBldFNvdXJjZSB9IGZyb20gJy4uL3NuaXBwZXRzRmlsZS5qcyc7XG5pbXBvcnQgeyBJVGV4dEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcblxubmFtZXNwYWNlIElTbmlwcGV0UGljayB7XG5cdGV4cG9ydCBmdW5jdGlvbiBpcyh0aGluZzogb2JqZWN0IHwgdW5kZWZpbmVkKTogdGhpbmcgaXMgSVNuaXBwZXRQaWNrIHtcblx0XHRyZXR1cm4gISF0aGluZyAmJiBVUkkuaXNVcmkoKDxJU25pcHBldFBpY2s+dGhpbmcpLmZpbGVwYXRoKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSVNuaXBwZXRQaWNrIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0ge1xuXHRmaWxlcGF0aDogVVJJO1xuXHRoaW50PzogdHJ1ZTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gY29tcHV0ZVBpY2tzKHNuaXBwZXRTZXJ2aWNlOiBJU25pcHBldHNTZXJ2aWNlLCB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU2VydmljZSwgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLCBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UpIHtcblxuXHRjb25zdCBleGlzdGluZzogSVNuaXBwZXRQaWNrW10gPSBbXTtcblx0Y29uc3QgZnV0dXJlOiBJU25pcHBldFBpY2tbXSA9IFtdO1xuXG5cdGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0Y29uc3QgYWRkZWQgPSBuZXcgTWFwPHN0cmluZywgeyBzbmlwcGV0OiBJU25pcHBldFBpY2s7IGRldGFpbDogc3RyaW5nIH0+KCk7XG5cblx0Zm9yIChjb25zdCBmaWxlIG9mIGF3YWl0IHNuaXBwZXRTZXJ2aWNlLmdldFNuaXBwZXRGaWxlcygpKSB7XG5cblx0XHRpZiAoZmlsZS5zb3VyY2UgPT09IFNuaXBwZXRTb3VyY2UuRXh0ZW5zaW9uKSB7XG5cdFx0XHQvLyBza2lwIGV4dGVuc2lvbiBzbmlwcGV0c1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0aWYgKGZpbGUuaXNHbG9iYWxTbmlwcGV0cykge1xuXG5cdFx0XHRhd2FpdCBmaWxlLmxvYWQoKTtcblxuXHRcdFx0Ly8gbGlzdCBzY29wZXMgZm9yIGdsb2JhbCBzbmlwcGV0c1xuXHRcdFx0Y29uc3QgbmFtZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdGxldCBzb3VyY2U6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRcdFx0b3V0ZXI6IGZvciAoY29uc3Qgc25pcHBldCBvZiBmaWxlLmRhdGEpIHtcblx0XHRcdFx0aWYgKCFzb3VyY2UpIHtcblx0XHRcdFx0XHRzb3VyY2UgPSBzbmlwcGV0LnNvdXJjZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZvciAoY29uc3Qgc2NvcGUgb2Ygc25pcHBldC5zY29wZXMpIHtcblx0XHRcdFx0XHRjb25zdCBuYW1lID0gbGFuZ3VhZ2VTZXJ2aWNlLmdldExhbmd1YWdlTmFtZShzY29wZSk7XG5cdFx0XHRcdFx0aWYgKG5hbWUpIHtcblx0XHRcdFx0XHRcdGlmIChuYW1lcy5zaXplID49IDQpIHtcblx0XHRcdFx0XHRcdFx0bmFtZXMuYWRkKGAke25hbWV9Li4uYCk7XG5cdFx0XHRcdFx0XHRcdGJyZWFrIG91dGVyO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0bmFtZXMuYWRkKG5hbWUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzbmlwcGV0OiBJU25pcHBldFBpY2sgPSB7XG5cdFx0XHRcdGxhYmVsOiBiYXNlbmFtZShmaWxlLmxvY2F0aW9uKSxcblx0XHRcdFx0ZmlsZXBhdGg6IGZpbGUubG9jYXRpb24sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBuYW1lcy5zaXplID09PSAwXG5cdFx0XHRcdFx0PyBubHMubG9jYWxpemUoJ2dsb2JhbC5zY29wZScsIFwiKGdsb2JhbClcIilcblx0XHRcdFx0XHQ6IG5scy5sb2NhbGl6ZSgnZ2xvYmFsLjEnLCBcIih7MH0pXCIsIFsuLi5uYW1lc10uam9pbignLCAnKSlcblx0XHRcdH07XG5cdFx0XHRleGlzdGluZy5wdXNoKHNuaXBwZXQpO1xuXG5cdFx0XHRpZiAoIXNvdXJjZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZGV0YWlsID0gbmxzLmxvY2FsaXplKCdkZXRhaWwubGFiZWwnLCBcIih7MH0pIHsxfVwiLCBzb3VyY2UsIGxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChmaWxlLmxvY2F0aW9uLCB7IHJlbGF0aXZlOiB0cnVlIH0pKTtcblx0XHRcdGNvbnN0IGxhc3RJdGVtID0gYWRkZWQuZ2V0KGJhc2VuYW1lKGZpbGUubG9jYXRpb24pKTtcblx0XHRcdGlmIChsYXN0SXRlbSkge1xuXHRcdFx0XHRzbmlwcGV0LmRldGFpbCA9IGRldGFpbDtcblx0XHRcdFx0bGFzdEl0ZW0uc25pcHBldC5kZXRhaWwgPSBsYXN0SXRlbS5kZXRhaWw7XG5cdFx0XHR9XG5cdFx0XHRhZGRlZC5zZXQoYmFzZW5hbWUoZmlsZS5sb2NhdGlvbiksIHsgc25pcHBldCwgZGV0YWlsIH0pO1xuXG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGxhbmd1YWdlIHNuaXBwZXRcblx0XHRcdGNvbnN0IG1vZGUgPSBiYXNlbmFtZShmaWxlLmxvY2F0aW9uKS5yZXBsYWNlKC9cXC5qc29uJC8sICcnKTtcblx0XHRcdGV4aXN0aW5nLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogYmFzZW5hbWUoZmlsZS5sb2NhdGlvbiksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBgKCR7bGFuZ3VhZ2VTZXJ2aWNlLmdldExhbmd1YWdlTmFtZShtb2RlKSA/PyBtb2RlfSlgLFxuXHRcdFx0XHRmaWxlcGF0aDogZmlsZS5sb2NhdGlvblxuXHRcdFx0fSk7XG5cdFx0XHRzZWVuLmFkZChtb2RlKTtcblx0XHR9XG5cdH1cblxuXHRjb25zdCBkaXIgPSB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLnNuaXBwZXRzSG9tZTtcblx0Zm9yIChjb25zdCBsYW5ndWFnZUlkIG9mIGxhbmd1YWdlU2VydmljZS5nZXRSZWdpc3RlcmVkTGFuZ3VhZ2VJZHMoKSkge1xuXHRcdGNvbnN0IGxhYmVsID0gbGFuZ3VhZ2VTZXJ2aWNlLmdldExhbmd1YWdlTmFtZShsYW5ndWFnZUlkKTtcblx0XHRpZiAobGFiZWwgJiYgIXNlZW4uaGFzKGxhbmd1YWdlSWQpKSB7XG5cdFx0XHRmdXR1cmUucHVzaCh7XG5cdFx0XHRcdGxhYmVsOiBsYW5ndWFnZUlkLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogYCgke2xhYmVsfSlgLFxuXHRcdFx0XHRmaWxlcGF0aDogam9pblBhdGgoZGlyLCBgJHtsYW5ndWFnZUlkfS5qc29uYCksXG5cdFx0XHRcdGhpbnQ6IHRydWUsXG5cdFx0XHRcdGljb25DbGFzc2VzOiBnZXRJY29uQ2xhc3Nlc0Zvckxhbmd1YWdlSWQobGFuZ3VhZ2VJZClcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdGV4aXN0aW5nLnNvcnQoKGEsIGIpID0+IHtcblx0XHRjb25zdCBhX2V4dCA9IGV4dG5hbWUoYS5maWxlcGF0aC5wYXRoKTtcblx0XHRjb25zdCBiX2V4dCA9IGV4dG5hbWUoYi5maWxlcGF0aC5wYXRoKTtcblx0XHRpZiAoYV9leHQgPT09IGJfZXh0KSB7XG5cdFx0XHRyZXR1cm4gYS5sYWJlbC5sb2NhbGVDb21wYXJlKGIubGFiZWwpO1xuXHRcdH0gZWxzZSBpZiAoYV9leHQgPT09ICcuY29kZS1zbmlwcGV0cycpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIDE7XG5cdFx0fVxuXHR9KTtcblxuXHRmdXR1cmUuc29ydCgoYSwgYikgPT4ge1xuXHRcdHJldHVybiBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCk7XG5cdH0pO1xuXG5cdHJldHVybiB7IGV4aXN0aW5nLCBmdXR1cmUgfTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gY3JlYXRlU25pcHBldEZpbGUoc2NvcGU6IHN0cmluZywgZGVmYXVsdFBhdGg6IFVSSSwgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSwgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSwgdGV4dEZpbGVTZXJ2aWNlOiBJVGV4dEZpbGVTZXJ2aWNlLCBvcGVuZXI6IElPcGVuZXJTZXJ2aWNlKSB7XG5cblx0ZnVuY3Rpb24gY3JlYXRlU25pcHBldFVyaShpbnB1dDogc3RyaW5nKSB7XG5cdFx0Y29uc3QgZmlsZW5hbWUgPSBleHRuYW1lKGlucHV0KSAhPT0gJy5jb2RlLXNuaXBwZXRzJ1xuXHRcdFx0PyBgJHtpbnB1dH0uY29kZS1zbmlwcGV0c2Bcblx0XHRcdDogaW5wdXQ7XG5cdFx0cmV0dXJuIGpvaW5QYXRoKGRlZmF1bHRQYXRoLCBmaWxlbmFtZSk7XG5cdH1cblxuXHRhd2FpdCBmaWxlU2VydmljZS5jcmVhdGVGb2xkZXIoZGVmYXVsdFBhdGgpO1xuXG5cdGNvbnN0IGlucHV0ID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UuaW5wdXQoe1xuXHRcdHBsYWNlSG9sZGVyOiBubHMubG9jYWxpemUoJ25hbWUnLCBcIlR5cGUgc25pcHBldCBmaWxlIG5hbWVcIiksXG5cdFx0YXN5bmMgdmFsaWRhdGVJbnB1dChpbnB1dCkge1xuXHRcdFx0aWYgKCFpbnB1dCkge1xuXHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdiYWRfbmFtZTEnLCBcIkludmFsaWQgZmlsZSBuYW1lXCIpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFpc1ZhbGlkQmFzZW5hbWUoaW5wdXQpKSB7XG5cdFx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ2JhZF9uYW1lMicsIFwiJ3swfScgaXMgbm90IGEgdmFsaWQgZmlsZSBuYW1lXCIsIGlucHV0KTtcblx0XHRcdH1cblx0XHRcdGlmIChhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoY3JlYXRlU25pcHBldFVyaShpbnB1dCkpKSB7XG5cdFx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ2JhZF9uYW1lMycsIFwiJ3swfScgYWxyZWFkeSBleGlzdHNcIiwgaW5wdXQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH0pO1xuXG5cdGlmICghaW5wdXQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3QgcmVzb3VyY2UgPSBjcmVhdGVTbmlwcGV0VXJpKGlucHV0KTtcblxuXHRhd2FpdCB0ZXh0RmlsZVNlcnZpY2Uud3JpdGUocmVzb3VyY2UsIFtcblx0XHQneycsXG5cdFx0J1xcdC8vIFBsYWNlIHlvdXIgJyArIHNjb3BlICsgJyBzbmlwcGV0cyBoZXJlLiBFYWNoIHNuaXBwZXQgaXMgZGVmaW5lZCB1bmRlciBhIHNuaXBwZXQgbmFtZSBhbmQgaGFzIGEgc2NvcGUsIHByZWZpeCwgYm9keSBhbmQgJyxcblx0XHQnXFx0Ly8gZGVzY3JpcHRpb24uIEFkZCBjb21tYSBzZXBhcmF0ZWQgaWRzIG9mIHRoZSBsYW5ndWFnZXMgd2hlcmUgdGhlIHNuaXBwZXQgaXMgYXBwbGljYWJsZSBpbiB0aGUgc2NvcGUgZmllbGQuIElmIHNjb3BlICcsXG5cdFx0J1xcdC8vIGlzIGxlZnQgZW1wdHkgb3Igb21pdHRlZCwgdGhlIHNuaXBwZXQgZ2V0cyBhcHBsaWVkIHRvIGFsbCBsYW5ndWFnZXMuIFRoZSBwcmVmaXggaXMgd2hhdCBpcyAnLFxuXHRcdCdcXHQvLyB1c2VkIHRvIHRyaWdnZXIgdGhlIHNuaXBwZXQgYW5kIHRoZSBib2R5IHdpbGwgYmUgZXhwYW5kZWQgYW5kIGluc2VydGVkLiBQb3NzaWJsZSB2YXJpYWJsZXMgYXJlOiAnLFxuXHRcdCdcXHQvLyAkMSwgJDIgZm9yIHRhYiBzdG9wcywgJDAgZm9yIHRoZSBmaW5hbCBjdXJzb3IgcG9zaXRpb24sIGFuZCAkezE6bGFiZWx9LCAkezI6YW5vdGhlcn0gZm9yIHBsYWNlaG9sZGVycy4gJyxcblx0XHQnXFx0Ly8gUGxhY2Vob2xkZXJzIHdpdGggdGhlIHNhbWUgaWRzIGFyZSBjb25uZWN0ZWQuJyxcblx0XHQnXFx0Ly8gRXhhbXBsZTonLFxuXHRcdCdcXHQvLyBcIlByaW50IHRvIGNvbnNvbGVcIjogeycsXG5cdFx0J1xcdC8vIFxcdFwic2NvcGVcIjogXCJqYXZhc2NyaXB0LHR5cGVzY3JpcHRcIiwnLFxuXHRcdCdcXHQvLyBcXHRcInByZWZpeFwiOiBcImxvZ1wiLCcsXG5cdFx0J1xcdC8vIFxcdFwiYm9keVwiOiBbJyxcblx0XHQnXFx0Ly8gXFx0XFx0XCJjb25zb2xlLmxvZyhcXCckMVxcJyk7XCIsJyxcblx0XHQnXFx0Ly8gXFx0XFx0XCIkMlwiJyxcblx0XHQnXFx0Ly8gXFx0XSwnLFxuXHRcdCdcXHQvLyBcXHRcImRlc2NyaXB0aW9uXCI6IFwiTG9nIG91dHB1dCB0byBjb25zb2xlXCInLFxuXHRcdCdcXHQvLyB9Jyxcblx0XHQnXFx0Ly8nLFxuXHRcdCdcXHQvLyBZb3UgY2FuIGFsc28gcmVzdHJpY3Qgc25pcHBldHMgdG8gc3BlY2lmaWMgZmlsZXMgdXNpbmcgaW5jbHVkZS9leGNsdWRlIHBhdHRlcm5zOicsXG5cdFx0J1xcdC8vIFwiVGVzdCBzbmlwcGV0XCI6IHsnLFxuXHRcdCdcXHQvLyBcXHRcInNjb3BlXCI6IFwiamF2YXNjcmlwdCx0eXBlc2NyaXB0XCIsJyxcblx0XHQnXFx0Ly8gXFx0XCJwcmVmaXhcIjogXCJ0ZXN0XCIsJyxcblx0XHQnXFx0Ly8gXFx0XCJib2R5XCI6IFwidGVzdChcXCckMVxcJywgKCkgPT4ge1xcXFxuXFxcXHQkMFxcXFxufSk7XCIsJyxcblx0XHQnXFx0Ly8gXFx0XCJpbmNsdWRlXCI6IFtcIioqLyoudGVzdC50c1wiLCBcIiouc3BlYy50c1wiXSwnLFxuXHRcdCdcXHQvLyBcXHRcImV4Y2x1ZGVcIjogW1wiKiovdGVtcC8qLnRzXCJdLCcsXG5cdFx0J1xcdC8vIFxcdFwiZGVzY3JpcHRpb25cIjogXCJJbnNlcnQgdGVzdCBibG9ja1wiJyxcblx0XHQnXFx0Ly8gfScsXG5cdFx0J30nXG5cdF0uam9pbignXFxuJykpO1xuXG5cdGF3YWl0IG9wZW5lci5vcGVuKHJlc291cmNlKTtcblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuYXN5bmMgZnVuY3Rpb24gY3JlYXRlTGFuZ3VhZ2VTbmlwcGV0RmlsZShwaWNrOiBJU25pcHBldFBpY2ssIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsIHRleHRGaWxlU2VydmljZTogSVRleHRGaWxlU2VydmljZSkge1xuXHRpZiAoYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKHBpY2suZmlsZXBhdGgpKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGNvbnN0IGNvbnRlbnRzID0gW1xuXHRcdCd7Jyxcblx0XHQnXFx0Ly8gUGxhY2UgeW91ciBzbmlwcGV0cyBmb3IgJyArIHBpY2subGFiZWwgKyAnIGhlcmUuIEVhY2ggc25pcHBldCBpcyBkZWZpbmVkIHVuZGVyIGEgc25pcHBldCBuYW1lIGFuZCBoYXMgYSBwcmVmaXgsIGJvZHkgYW5kICcsXG5cdFx0J1xcdC8vIGRlc2NyaXB0aW9uLiBUaGUgcHJlZml4IGlzIHdoYXQgaXMgdXNlZCB0byB0cmlnZ2VyIHRoZSBzbmlwcGV0IGFuZCB0aGUgYm9keSB3aWxsIGJlIGV4cGFuZGVkIGFuZCBpbnNlcnRlZC4gUG9zc2libGUgdmFyaWFibGVzIGFyZTonLFxuXHRcdCdcXHQvLyAkMSwgJDIgZm9yIHRhYiBzdG9wcywgJDAgZm9yIHRoZSBmaW5hbCBjdXJzb3IgcG9zaXRpb24sIGFuZCAkezE6bGFiZWx9LCAkezI6YW5vdGhlcn0gZm9yIHBsYWNlaG9sZGVycy4gUGxhY2Vob2xkZXJzIHdpdGggdGhlICcsXG5cdFx0J1xcdC8vIHNhbWUgaWRzIGFyZSBjb25uZWN0ZWQuJyxcblx0XHQnXFx0Ly8gRXhhbXBsZTonLFxuXHRcdCdcXHQvLyBcIlByaW50IHRvIGNvbnNvbGVcIjogeycsXG5cdFx0J1xcdC8vIFxcdFwicHJlZml4XCI6IFwibG9nXCIsJyxcblx0XHQnXFx0Ly8gXFx0XCJib2R5XCI6IFsnLFxuXHRcdCdcXHQvLyBcXHRcXHRcImNvbnNvbGUubG9nKFxcJyQxXFwnKTtcIiwnLFxuXHRcdCdcXHQvLyBcXHRcXHRcIiQyXCInLFxuXHRcdCdcXHQvLyBcXHRdLCcsXG5cdFx0J1xcdC8vIFxcdFwiZGVzY3JpcHRpb25cIjogXCJMb2cgb3V0cHV0IHRvIGNvbnNvbGVcIicsXG5cdFx0J1xcdC8vIH0nLFxuXHRcdCdcXHQvLycsXG5cdFx0J1xcdC8vIFlvdSBjYW4gYWxzbyByZXN0cmljdCBzbmlwcGV0cyB0byBzcGVjaWZpYyBmaWxlcyB1c2luZyBpbmNsdWRlL2V4Y2x1ZGUgcGF0dGVybnM6Jyxcblx0XHQnXFx0Ly8gXCJUZXN0IHNuaXBwZXRcIjogeycsXG5cdFx0J1xcdC8vIFxcdFwicHJlZml4XCI6IFwidGVzdFwiLCcsXG5cdFx0J1xcdC8vIFxcdFwiYm9keVwiOiBcInRlc3QoXFwnJDFcXCcsICgpID0+IHtcXFxcblxcXFx0JDBcXFxcbn0pO1wiLCcsXG5cdFx0J1xcdC8vIFxcdFwiaW5jbHVkZVwiOiBbXCIqKi8qLnRlc3QudHNcIiwgXCIqLnNwZWMudHNcIl0sJyxcblx0XHQnXFx0Ly8gXFx0XCJleGNsdWRlXCI6IFtcIioqL3RlbXAvKi50c1wiXSwnLFxuXHRcdCdcXHQvLyBcXHRcImRlc2NyaXB0aW9uXCI6IFwiSW5zZXJ0IHRlc3QgYmxvY2tcIicsXG5cdFx0J1xcdC8vIH0nLFxuXHRcdCd9J1xuXHRdLmpvaW4oJ1xcbicpO1xuXHRhd2FpdCB0ZXh0RmlsZVNlcnZpY2Uud3JpdGUocGljay5maWxlcGF0aCwgY29udGVudHMpO1xufVxuXG5leHBvcnQgY2xhc3MgQ29uZmlndXJlU25pcHBldHNBY3Rpb24gZXh0ZW5kcyBTbmlwcGV0c0FjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5vcGVuU25pcHBldHMnLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ29wZW5TbmlwcGV0LmxhYmVsJywgXCJDb25maWd1cmUgU25pcHBldHNcIiksXG5cdFx0XHRzaG9ydFRpdGxlOiB7XG5cdFx0XHRcdC4uLm5scy5sb2NhbGl6ZTIoJ3VzZXJTbmlwcGV0cycsIFwiU25pcHBldHNcIiksXG5cdFx0XHRcdG1uZW1vbmljVGl0bGU6IG5scy5sb2NhbGl6ZSh7IGtleTogJ21pT3BlblNuaXBwZXRzJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmU25pcHBldHNcIiksXG5cdFx0XHR9LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHsgaWQ6IE1lbnVJZC5NZW51YmFyUHJlZmVyZW5jZXNNZW51LCBncm91cDogJzJfY29uZmlndXJhdGlvbicsIG9yZGVyOiA1IH0sXG5cdFx0XHRcdHsgaWQ6IE1lbnVJZC5HbG9iYWxBY3Rpdml0eSwgZ3JvdXA6ICcyX2NvbmZpZ3VyYXRpb24nLCBvcmRlcjogNSB9LFxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTxhbnk+IHtcblxuXHRcdGNvbnN0IHNuaXBwZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTbmlwcGV0c1NlcnZpY2UpO1xuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0Y29uc3Qgb3BlbmVyID0gYWNjZXNzb3IuZ2V0KElPcGVuZXJTZXJ2aWNlKTtcblx0XHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlU2VydmljZSk7XG5cdFx0Y29uc3QgdXNlckRhdGFQcm9maWxlU2VydmljZSA9IGFjY2Vzc29yLmdldChJVXNlckRhdGFQcm9maWxlU2VydmljZSk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlU2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UpO1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0Y29uc3QgdGV4dEZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXh0RmlsZVNlcnZpY2UpO1xuXHRcdGNvbnN0IGxhYmVsU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFiZWxTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHBpY2tzID0gYXdhaXQgY29tcHV0ZVBpY2tzKHNuaXBwZXRTZXJ2aWNlLCB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLCBsYW5ndWFnZVNlcnZpY2UsIGxhYmVsU2VydmljZSk7XG5cdFx0Y29uc3QgZXhpc3Rpbmc6IFF1aWNrUGlja0lucHV0W10gPSBwaWNrcy5leGlzdGluZztcblxuXHRcdHR5cGUgU25pcHBldFBpY2sgPSBJUXVpY2tQaWNrSXRlbSAmIHsgdXJpOiBVUkkgfSAmIHsgc2NvcGU6IHN0cmluZyB9O1xuXHRcdGNvbnN0IGdsb2JhbFNuaXBwZXRQaWNrczogU25pcHBldFBpY2tbXSA9IFt7XG5cdFx0XHRzY29wZTogbmxzLmxvY2FsaXplKCduZXcuZ2xvYmFsX3Njb3BlJywgJ2dsb2JhbCcpLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnbmV3Lmdsb2JhbCcsIFwiTmV3IEdsb2JhbCBTbmlwcGV0cyBmaWxlLi4uXCIpLFxuXHRcdFx0dXJpOiB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLnNuaXBwZXRzSG9tZVxuXHRcdH1dO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlU25pcHBldFBpY2tzOiBTbmlwcGV0UGlja1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBmb2xkZXIgb2Ygd29ya3NwYWNlU2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzKSB7XG5cdFx0XHR3b3Jrc3BhY2VTbmlwcGV0UGlja3MucHVzaCh7XG5cdFx0XHRcdHNjb3BlOiBubHMubG9jYWxpemUoJ25ldy53b3Jrc3BhY2Vfc2NvcGUnLCBcInswfSB3b3Jrc3BhY2VcIiwgZm9sZGVyLm5hbWUpLFxuXHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCduZXcuZm9sZGVyJywgXCJOZXcgU25pcHBldHMgZmlsZSBmb3IgJ3swfScuLi5cIiwgZm9sZGVyLm5hbWUpLFxuXHRcdFx0XHR1cmk6IGZvbGRlci50b1Jlc291cmNlKCcudnNjb2RlJylcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmIChleGlzdGluZy5sZW5ndGggPiAwKSB7XG5cdFx0XHRleGlzdGluZy51bnNoaWZ0KHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBubHMubG9jYWxpemUoJ2dyb3VwLmdsb2JhbCcsIFwiRXhpc3RpbmcgU25pcHBldHNcIikgfSk7XG5cdFx0XHRleGlzdGluZy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBubHMubG9jYWxpemUoJ25ldy5nbG9iYWwuc2VwJywgXCJOZXcgU25pcHBldHNcIikgfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGV4aXN0aW5nLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IG5scy5sb2NhbGl6ZSgnbmV3Lmdsb2JhbC5zZXAnLCBcIk5ldyBTbmlwcGV0c1wiKSB9KTtcblx0XHR9XG5cblx0XHRjb25zdCBwaWNrID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UucGljaygoW10gYXMgUXVpY2tQaWNrSW5wdXRbXSkuY29uY2F0KGV4aXN0aW5nLCBnbG9iYWxTbmlwcGV0UGlja3MsIHdvcmtzcGFjZVNuaXBwZXRQaWNrcywgcGlja3MuZnV0dXJlKSwge1xuXHRcdFx0cGxhY2VIb2xkZXI6IG5scy5sb2NhbGl6ZSgnb3BlblNuaXBwZXQucGlja0xhbmd1YWdlJywgXCJTZWxlY3QgU25pcHBldHMgRmlsZSBvciBDcmVhdGUgU25pcHBldHNcIiksXG5cdFx0XHRtYXRjaE9uRGVzY3JpcHRpb246IHRydWVcblx0XHR9KTtcblxuXHRcdGlmIChnbG9iYWxTbmlwcGV0UGlja3MuaW5kZXhPZihwaWNrIGFzIFNuaXBwZXRQaWNrKSA+PSAwKSB7XG5cdFx0XHRyZXR1cm4gY3JlYXRlU25pcHBldEZpbGUoKHBpY2sgYXMgU25pcHBldFBpY2spLnNjb3BlLCAocGljayBhcyBTbmlwcGV0UGljaykudXJpLCBxdWlja0lucHV0U2VydmljZSwgZmlsZVNlcnZpY2UsIHRleHRGaWxlU2VydmljZSwgb3BlbmVyKTtcblx0XHR9IGVsc2UgaWYgKHdvcmtzcGFjZVNuaXBwZXRQaWNrcy5pbmRleE9mKHBpY2sgYXMgU25pcHBldFBpY2spID49IDApIHtcblx0XHRcdHJldHVybiBjcmVhdGVTbmlwcGV0RmlsZSgocGljayBhcyBTbmlwcGV0UGljaykuc2NvcGUsIChwaWNrIGFzIFNuaXBwZXRQaWNrKS51cmksIHF1aWNrSW5wdXRTZXJ2aWNlLCBmaWxlU2VydmljZSwgdGV4dEZpbGVTZXJ2aWNlLCBvcGVuZXIpO1xuXHRcdH0gZWxzZSBpZiAoSVNuaXBwZXRQaWNrLmlzKHBpY2spKSB7XG5cdFx0XHRpZiAocGljay5oaW50KSB7XG5cdFx0XHRcdGF3YWl0IGNyZWF0ZUxhbmd1YWdlU25pcHBldEZpbGUocGljaywgZmlsZVNlcnZpY2UsIHRleHRGaWxlU2VydmljZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gb3BlbmVyLm9wZW4ocGljay5maWxlcGF0aCk7XG5cdFx0fVxuXG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFVBQVUsZ0JBQWdCO0FBQ25DLFNBQVMsV0FBVztBQUNwQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLG1DQUFtQztBQUM1QyxZQUFZLFNBQVM7QUFDckIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMEJBQTBE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LFVBQU0sUUFBUSxNQUFNLGFBQWEsZ0JBQWdCLHdCQUF3QixpQkFBaUIsWUFBWTtBQUN0RyxVQUFNLFdBQTZCLE1BQU07QUFHekMsVUFBTSxxQkFBb0MsQ0FBQztBQUFBLE1BQzFDLE9BQU8sSUFBSSxTQUFTLG9CQUFvQixRQUFRO0FBQUEsTUFDaEQsT0FBTyxJQUFJLFNBQVMsY0FBYyw2QkFBNkI7QUFBQSxNQUMvRCxLQUFLLHVCQUF1QixlQUFlO0FBQUEsSUFDNUMsQ0FBQztBQUVELFVBQU0sd0JBQXVDLENBQUM7QUFDOUMsZUFBVyxVQUFVLGlCQUFpQixhQUFhLEVBQUUsU0FBUztBQUM3RCw0QkFBc0IsS0FBSztBQUFBLFFBQzFCLE9BQU8sSUFBSSxTQUFTLHVCQUF1QixpQkFBaUIsT0FBTyxJQUFJO0FBQUEsUUFDdkUsT0FBTyxJQUFJLFNBQVMsY0FBYyxrQ0FBa0MsT0FBTyxJQUFJO0FBQUEsUUFDL0UsS0FBSyxPQUFPLFdBQVcsU0FBUztBQUFBLE1BQ2pDLENBQUM7QUFBQSxJQUNGO0FBRUEsUUFBSSxTQUFTLFNBQVMsR0FBRztBQUN4QixlQUFTLFFBQVEsRUFBRSxNQUFNLGFBQWEsT0FBTyxJQUFJLFNBQVMsZ0JBQWdCLG1CQUFtQixFQUFFLENBQUM7QUFDaEcsZUFBUyxLQUFLLEVBQUUsTUFBTSxhQUFhLE9BQU8sSUFBSSxTQUFTLGtCQUFrQixjQUFjLEVBQUUsQ0FBQztBQUFBLElBQzNGLE9BQU87QUFDTixlQUFTLEtBQUssRUFBRSxNQUFNLGFBQWEsT0FBTyxJQUFJLFNBQVMsa0JBQWtCLGNBQWMsRUFBRSxDQUFDO0FBQUEsSUFDM0Y7QUFFQSxVQUFNLE9BQU8sTUFBTSxrQkFBa0IsS0FBTSxDQUFDLEVBQXVCLE9BQU8sVUFBVSxvQkFBb0IsdUJBQXVCLE1BQU0sTUFBTSxHQUFHO0FBQUEsTUFDN0ksYUFBYSxJQUFJLFNBQVMsNEJBQTRCLHlDQUF5QztBQUFBLE1BQy9GLG9CQUFvQjtBQUFBLElBQ3JCLENBQUM7QUFFRCxRQUFJLG1CQUFtQixRQUFRLElBQW1CLEtBQUssR0FBRztBQUN6RCxhQUFPLGtCQUFtQixLQUFxQixPQUFRLEtBQXFCLEtBQUssbUJBQW1CLGFBQWEsaUJBQWlCLE1BQU07QUFBQSxJQUN6SSxXQUFXLHNCQUFzQixRQUFRLElBQW1CLEtBQUssR0FBRztBQUNuRSxhQUFPLGtCQUFtQixLQUFxQixPQUFRLEtBQXFCLEtBQUssbUJBQW1CLGFBQWEsaUJBQWlCLE1BQU07QUFBQSxJQUN6SSxXQUFXLGFBQWEsR0FBRyxJQUFJLEdBQUc7QUFDakMsVUFBSSxLQUFLLE1BQU07QUFDZCxjQUFNLDBCQUEwQixNQUFNLGFBQWEsZUFBZTtBQUFBLE1BQ25FO0FBQ0EsYUFBTyxPQUFPLEtBQUssS0FBSyxRQUFRO0FBQUEsSUFDakM7QUFBQSxFQUVEO0FBQ0Q7IiwKICAibmFtZXMiOiBbIklTbmlwcGV0UGljayIsICJzbmlwcGV0IiwgImlucHV0Il0KfQo=
