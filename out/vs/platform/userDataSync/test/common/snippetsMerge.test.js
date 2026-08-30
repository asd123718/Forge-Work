import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { merge } from "../../common/snippetsMerge.js";
const tsSnippet1 = `{

	// Place your snippets for TypeScript here. Each snippet is defined under a snippet name and has a prefix, body and
	// description. The prefix is what is used to trigger the snippet and the body will be expanded and inserted. Possible variables are:
	// $1, $2 for tab stops, $0 for the final cursor position, Placeholders with the
	// same ids are connected.
	"Print to console": {
	// Example:
	"prefix": "log",
		"body": [
			"console.log('$1');",
			"$2"
		],
			"description": "Log output to console",
	}

}`;
const tsSnippet2 = `{

	// Place your snippets for TypeScript here. Each snippet is defined under a snippet name and has a prefix, body and
	// description. The prefix is what is used to trigger the snippet and the body will be expanded and inserted. Possible variables are:
	// $1, $2 for tab stops, $0 for the final cursor position, Placeholders with the
	// same ids are connected.
	"Print to console": {
	// Example:
	"prefix": "log",
		"body": [
			"console.log('$1');",
			"$2"
		],
			"description": "Log output to console always",
	}

}`;
const htmlSnippet1 = `{
/*
	// Place your snippets for HTML here. Each snippet is defined under a snippet name and has a prefix, body and
	// description. The prefix is what is used to trigger the snippet and the body will be expanded and inserted.
	// Example:
	"Print to console": {
	"prefix": "log",
		"body": [
			"console.log('$1');",
			"$2"
		],
			"description": "Log output to console"
	}
*/
"Div": {
	"prefix": "div",
		"body": [
			"<div>",
			"",
			"</div>"
		],
			"description": "New div"
	}
}`;
const htmlSnippet2 = `{
/*
	// Place your snippets for HTML here. Each snippet is defined under a snippet name and has a prefix, body and
	// description. The prefix is what is used to trigger the snippet and the body will be expanded and inserted.
	// Example:
	"Print to console": {
	"prefix": "log",
		"body": [
			"console.log('$1');",
			"$2"
		],
			"description": "Log output to console"
	}
*/
"Div": {
	"prefix": "div",
		"body": [
			"<div>",
			"",
			"</div>"
		],
			"description": "New div changed"
	}
}`;
const cSnippet = `{
	// Place your snippets for c here. Each snippet is defined under a snippet name and has a prefix, body and
	// description. The prefix is what is used to trigger the snippet and the body will be expanded and inserted. Possible variables are:
	// $1, $2 for tab stops, $0 for the final cursor position.Placeholders with the
	// same ids are connected.
	// Example:
	"Print to console": {
	"prefix": "log",
		"body": [
			"console.log('$1');",
			"$2"
		],
			"description": "Log output to console"
	}
}`;
suite("SnippetsMerge", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("merge when local and remote are same with one snippet", async () => {
    const local = { "html.json": htmlSnippet1 };
    const remote = { "html.json": htmlSnippet1 };
    const actual = merge(local, remote, null);
    assert.deepStrictEqual(actual.local.added, {});
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, []);
    assert.deepStrictEqual(actual.remote.added, {});
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge when local and remote are same with multiple entries", async () => {
    const local = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 };
    const remote = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 };
    const actual = merge(local, remote, null);
    assert.deepStrictEqual(actual.local.added, {});
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, []);
    assert.deepStrictEqual(actual.remote.added, {});
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge when local and remote are same with multiple entries in different order", async () => {
    const local = { "typescript.json": tsSnippet1, "html.json": htmlSnippet1 };
    const remote = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 };
    const actual = merge(local, remote, null);
    assert.deepStrictEqual(actual.local.added, {});
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, []);
    assert.deepStrictEqual(actual.remote.added, {});
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge when local and remote are same with different base content", async () => {
    const local = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 };
    const remote = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 };
    const base = { "html.json": htmlSnippet2, "typescript.json": tsSnippet2 };
    const actual = merge(local, remote, base);
    assert.deepStrictEqual(actual.local.added, {});
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, []);
    assert.deepStrictEqual(actual.remote.added, {});
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge when a new entry is added to remote", async () => {
    const local = { "html.json": htmlSnippet1 };
    const remote = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 };
    const actual = merge(local, remote, null);
    assert.deepStrictEqual(actual.local.added, { "typescript.json": tsSnippet1 });
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, []);
    assert.deepStrictEqual(actual.remote.added, {});
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge when multiple new entries are added to remote", async () => {
    const local = {};
    const remote = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 };
    const actual = merge(local, remote, null);
    assert.deepStrictEqual(actual.local.added, remote);
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, []);
    assert.deepStrictEqual(actual.remote.added, {});
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge when new entry is added to remote from base and local has not changed", async () => {
    const local = { "html.json": htmlSnippet1 };
    const remote = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 };
    const actual = merge(local, remote, local);
    assert.deepStrictEqual(actual.local.added, { "typescript.json": tsSnippet1 });
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, []);
    assert.deepStrictEqual(actual.remote.added, {});
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge when an entry is removed from remote from base and local has not changed", async () => {
    const local = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 };
    const remote = { "html.json": htmlSnippet1 };
    const actual = merge(local, remote, local);
    assert.deepStrictEqual(actual.local.added, {});
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, ["typescript.json"]);
    assert.deepStrictEqual(actual.conflicts, []);
    assert.deepStrictEqual(actual.remote.added, {});
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge when all entries are removed from base and local has not changed", async () => {
    const local = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 };
    const remote = {};
    const actual = merge(local, remote, local);
    assert.deepStrictEqual(actual.local.added, {});
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, ["html.json", "typescript.json"]);
    assert.deepStrictEqual(actual.conflicts, []);
    assert.deepStrictEqual(actual.remote.added, {});
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge when an entry is updated in remote from base and local has not changed", async () => {
    const local = { "html.json": htmlSnippet1 };
    const remote = { "html.json": htmlSnippet2 };
    const actual = merge(local, remote, local);
    assert.deepStrictEqual(actual.local.added, {});
    assert.deepStrictEqual(actual.local.updated, { "html.json": htmlSnippet2 });
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, []);
    assert.deepStrictEqual(actual.remote.added, {});
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge when remote has moved forwarded with multiple changes and local stays with base", async () => {
    const local = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 };
    const remote = { "html.json": htmlSnippet2, "c.json": cSnippet };
    const actual = merge(local, remote, local);
    assert.deepStrictEqual(actual.local.added, { "c.json": cSnippet });
    assert.deepStrictEqual(actual.local.updated, { "html.json": htmlSnippet2 });
    assert.deepStrictEqual(actual.local.removed, ["typescript.json"]);
    assert.deepStrictEqual(actual.conflicts, []);
    assert.deepStrictEqual(actual.remote.added, {});
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge when a new entries are added to local", async () => {
    const local = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1, "c.json": cSnippet };
    const remote = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 };
    const actual = merge(local, remote, null);
    assert.deepStrictEqual(actual.local.added, {});
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, []);
    assert.deepStrictEqual(actual.remote.added, { "c.json": cSnippet });
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge when multiple new entries are added to local from base and remote is not changed", async () => {
    const local = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1, "c.json": cSnippet };
    const remote = { "typescript.json": tsSnippet1 };
    const actual = merge(local, remote, remote);
    assert.deepStrictEqual(actual.local.added, {});
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, []);
    assert.deepStrictEqual(actual.remote.added, { "html.json": htmlSnippet1, "c.json": cSnippet });
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge when an entry is removed from local from base and remote has not changed", async () => {
    const local = { "html.json": htmlSnippet1 };
    const remote = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 };
    const actual = merge(local, remote, remote);
    assert.deepStrictEqual(actual.local.added, {});
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, []);
    assert.deepStrictEqual(actual.remote.added, {});
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, ["typescript.json"]);
  });
  test("merge when an entry is updated in local from base and remote has not changed", async () => {
    const local = { "html.json": htmlSnippet2, "typescript.json": tsSnippet1 };
    const remote = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 };
    const actual = merge(local, remote, remote);
    assert.deepStrictEqual(actual.local.added, {});
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, []);
    assert.deepStrictEqual(actual.remote.added, {});
    assert.deepStrictEqual(actual.remote.updated, { "html.json": htmlSnippet2 });
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge when local has moved forwarded with multiple changes and remote stays with base", async () => {
    const local = { "html.json": htmlSnippet2, "c.json": cSnippet };
    const remote = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 };
    const actual = merge(local, remote, remote);
    assert.deepStrictEqual(actual.local.added, {});
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, []);
    assert.deepStrictEqual(actual.remote.added, { "c.json": cSnippet });
    assert.deepStrictEqual(actual.remote.updated, { "html.json": htmlSnippet2 });
    assert.deepStrictEqual(actual.remote.removed, ["typescript.json"]);
  });
  test("merge when local and remote with one entry but different value", async () => {
    const local = { "html.json": htmlSnippet1 };
    const remote = { "html.json": htmlSnippet2 };
    const actual = merge(local, remote, null);
    assert.deepStrictEqual(actual.local.added, {});
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, ["html.json"]);
    assert.deepStrictEqual(actual.remote.added, {});
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge when the entry is removed in remote but updated in local and a new entry is added in remote", async () => {
    const base = { "html.json": htmlSnippet1 };
    const local = { "html.json": htmlSnippet2 };
    const remote = { "typescript.json": tsSnippet1 };
    const actual = merge(local, remote, base);
    assert.deepStrictEqual(actual.local.added, { "typescript.json": tsSnippet1 });
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, ["html.json"]);
    assert.deepStrictEqual(actual.remote.added, {});
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge with single entry and local is empty", async () => {
    const base = { "html.json": htmlSnippet1 };
    const local = {};
    const remote = { "html.json": htmlSnippet2 };
    const actual = merge(local, remote, base);
    assert.deepStrictEqual(actual.local.added, { "html.json": htmlSnippet2 });
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, []);
    assert.deepStrictEqual(actual.remote.added, {});
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge when local and remote has moved forwareded with conflicts", async () => {
    const base = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 };
    const local = { "html.json": htmlSnippet2, "c.json": cSnippet };
    const remote = { "typescript.json": tsSnippet2 };
    const actual = merge(local, remote, base);
    assert.deepStrictEqual(actual.local.added, { "typescript.json": tsSnippet2 });
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, ["html.json"]);
    assert.deepStrictEqual(actual.remote.added, { "c.json": cSnippet });
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge when local and remote has moved forwareded with multiple conflicts", async () => {
    const base = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 };
    const local = { "html.json": htmlSnippet2, "typescript.json": tsSnippet2, "c.json": cSnippet };
    const remote = { "c.json": cSnippet };
    const actual = merge(local, remote, base);
    assert.deepStrictEqual(actual.local.added, {});
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, ["html.json", "typescript.json"]);
    assert.deepStrictEqual(actual.remote.added, {});
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXNlckRhdGFTeW5jXFx0ZXN0XFxjb21tb25cXHNuaXBwZXRzTWVyZ2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgbWVyZ2UgfSBmcm9tICcuLi8uLi9jb21tb24vc25pcHBldHNNZXJnZS5qcyc7XG5cbmNvbnN0IHRzU25pcHBldDEgPSBge1xuXG5cdC8vIFBsYWNlIHlvdXIgc25pcHBldHMgZm9yIFR5cGVTY3JpcHQgaGVyZS4gRWFjaCBzbmlwcGV0IGlzIGRlZmluZWQgdW5kZXIgYSBzbmlwcGV0IG5hbWUgYW5kIGhhcyBhIHByZWZpeCwgYm9keSBhbmRcblx0Ly8gZGVzY3JpcHRpb24uIFRoZSBwcmVmaXggaXMgd2hhdCBpcyB1c2VkIHRvIHRyaWdnZXIgdGhlIHNuaXBwZXQgYW5kIHRoZSBib2R5IHdpbGwgYmUgZXhwYW5kZWQgYW5kIGluc2VydGVkLiBQb3NzaWJsZSB2YXJpYWJsZXMgYXJlOlxuXHQvLyAkMSwgJDIgZm9yIHRhYiBzdG9wcywgJDAgZm9yIHRoZSBmaW5hbCBjdXJzb3IgcG9zaXRpb24sIFBsYWNlaG9sZGVycyB3aXRoIHRoZVxuXHQvLyBzYW1lIGlkcyBhcmUgY29ubmVjdGVkLlxuXHRcIlByaW50IHRvIGNvbnNvbGVcIjoge1xuXHQvLyBFeGFtcGxlOlxuXHRcInByZWZpeFwiOiBcImxvZ1wiLFxuXHRcdFwiYm9keVwiOiBbXG5cdFx0XHRcImNvbnNvbGUubG9nKCckMScpO1wiLFxuXHRcdFx0XCIkMlwiXG5cdFx0XSxcblx0XHRcdFwiZGVzY3JpcHRpb25cIjogXCJMb2cgb3V0cHV0IHRvIGNvbnNvbGVcIixcblx0fVxuXG59YDtcblxuY29uc3QgdHNTbmlwcGV0MiA9IGB7XG5cblx0Ly8gUGxhY2UgeW91ciBzbmlwcGV0cyBmb3IgVHlwZVNjcmlwdCBoZXJlLiBFYWNoIHNuaXBwZXQgaXMgZGVmaW5lZCB1bmRlciBhIHNuaXBwZXQgbmFtZSBhbmQgaGFzIGEgcHJlZml4LCBib2R5IGFuZFxuXHQvLyBkZXNjcmlwdGlvbi4gVGhlIHByZWZpeCBpcyB3aGF0IGlzIHVzZWQgdG8gdHJpZ2dlciB0aGUgc25pcHBldCBhbmQgdGhlIGJvZHkgd2lsbCBiZSBleHBhbmRlZCBhbmQgaW5zZXJ0ZWQuIFBvc3NpYmxlIHZhcmlhYmxlcyBhcmU6XG5cdC8vICQxLCAkMiBmb3IgdGFiIHN0b3BzLCAkMCBmb3IgdGhlIGZpbmFsIGN1cnNvciBwb3NpdGlvbiwgUGxhY2Vob2xkZXJzIHdpdGggdGhlXG5cdC8vIHNhbWUgaWRzIGFyZSBjb25uZWN0ZWQuXG5cdFwiUHJpbnQgdG8gY29uc29sZVwiOiB7XG5cdC8vIEV4YW1wbGU6XG5cdFwicHJlZml4XCI6IFwibG9nXCIsXG5cdFx0XCJib2R5XCI6IFtcblx0XHRcdFwiY29uc29sZS5sb2coJyQxJyk7XCIsXG5cdFx0XHRcIiQyXCJcblx0XHRdLFxuXHRcdFx0XCJkZXNjcmlwdGlvblwiOiBcIkxvZyBvdXRwdXQgdG8gY29uc29sZSBhbHdheXNcIixcblx0fVxuXG59YDtcblxuY29uc3QgaHRtbFNuaXBwZXQxID0gYHtcbi8qXG5cdC8vIFBsYWNlIHlvdXIgc25pcHBldHMgZm9yIEhUTUwgaGVyZS4gRWFjaCBzbmlwcGV0IGlzIGRlZmluZWQgdW5kZXIgYSBzbmlwcGV0IG5hbWUgYW5kIGhhcyBhIHByZWZpeCwgYm9keSBhbmRcblx0Ly8gZGVzY3JpcHRpb24uIFRoZSBwcmVmaXggaXMgd2hhdCBpcyB1c2VkIHRvIHRyaWdnZXIgdGhlIHNuaXBwZXQgYW5kIHRoZSBib2R5IHdpbGwgYmUgZXhwYW5kZWQgYW5kIGluc2VydGVkLlxuXHQvLyBFeGFtcGxlOlxuXHRcIlByaW50IHRvIGNvbnNvbGVcIjoge1xuXHRcInByZWZpeFwiOiBcImxvZ1wiLFxuXHRcdFwiYm9keVwiOiBbXG5cdFx0XHRcImNvbnNvbGUubG9nKCckMScpO1wiLFxuXHRcdFx0XCIkMlwiXG5cdFx0XSxcblx0XHRcdFwiZGVzY3JpcHRpb25cIjogXCJMb2cgb3V0cHV0IHRvIGNvbnNvbGVcIlxuXHR9XG4qL1xuXCJEaXZcIjoge1xuXHRcInByZWZpeFwiOiBcImRpdlwiLFxuXHRcdFwiYm9keVwiOiBbXG5cdFx0XHRcIjxkaXY+XCIsXG5cdFx0XHRcIlwiLFxuXHRcdFx0XCI8L2Rpdj5cIlxuXHRcdF0sXG5cdFx0XHRcImRlc2NyaXB0aW9uXCI6IFwiTmV3IGRpdlwiXG5cdH1cbn1gO1xuXG5jb25zdCBodG1sU25pcHBldDIgPSBge1xuLypcblx0Ly8gUGxhY2UgeW91ciBzbmlwcGV0cyBmb3IgSFRNTCBoZXJlLiBFYWNoIHNuaXBwZXQgaXMgZGVmaW5lZCB1bmRlciBhIHNuaXBwZXQgbmFtZSBhbmQgaGFzIGEgcHJlZml4LCBib2R5IGFuZFxuXHQvLyBkZXNjcmlwdGlvbi4gVGhlIHByZWZpeCBpcyB3aGF0IGlzIHVzZWQgdG8gdHJpZ2dlciB0aGUgc25pcHBldCBhbmQgdGhlIGJvZHkgd2lsbCBiZSBleHBhbmRlZCBhbmQgaW5zZXJ0ZWQuXG5cdC8vIEV4YW1wbGU6XG5cdFwiUHJpbnQgdG8gY29uc29sZVwiOiB7XG5cdFwicHJlZml4XCI6IFwibG9nXCIsXG5cdFx0XCJib2R5XCI6IFtcblx0XHRcdFwiY29uc29sZS5sb2coJyQxJyk7XCIsXG5cdFx0XHRcIiQyXCJcblx0XHRdLFxuXHRcdFx0XCJkZXNjcmlwdGlvblwiOiBcIkxvZyBvdXRwdXQgdG8gY29uc29sZVwiXG5cdH1cbiovXG5cIkRpdlwiOiB7XG5cdFwicHJlZml4XCI6IFwiZGl2XCIsXG5cdFx0XCJib2R5XCI6IFtcblx0XHRcdFwiPGRpdj5cIixcblx0XHRcdFwiXCIsXG5cdFx0XHRcIjwvZGl2PlwiXG5cdFx0XSxcblx0XHRcdFwiZGVzY3JpcHRpb25cIjogXCJOZXcgZGl2IGNoYW5nZWRcIlxuXHR9XG59YDtcblxuY29uc3QgY1NuaXBwZXQgPSBge1xuXHQvLyBQbGFjZSB5b3VyIHNuaXBwZXRzIGZvciBjIGhlcmUuIEVhY2ggc25pcHBldCBpcyBkZWZpbmVkIHVuZGVyIGEgc25pcHBldCBuYW1lIGFuZCBoYXMgYSBwcmVmaXgsIGJvZHkgYW5kXG5cdC8vIGRlc2NyaXB0aW9uLiBUaGUgcHJlZml4IGlzIHdoYXQgaXMgdXNlZCB0byB0cmlnZ2VyIHRoZSBzbmlwcGV0IGFuZCB0aGUgYm9keSB3aWxsIGJlIGV4cGFuZGVkIGFuZCBpbnNlcnRlZC4gUG9zc2libGUgdmFyaWFibGVzIGFyZTpcblx0Ly8gJDEsICQyIGZvciB0YWIgc3RvcHMsICQwIGZvciB0aGUgZmluYWwgY3Vyc29yIHBvc2l0aW9uLlBsYWNlaG9sZGVycyB3aXRoIHRoZVxuXHQvLyBzYW1lIGlkcyBhcmUgY29ubmVjdGVkLlxuXHQvLyBFeGFtcGxlOlxuXHRcIlByaW50IHRvIGNvbnNvbGVcIjoge1xuXHRcInByZWZpeFwiOiBcImxvZ1wiLFxuXHRcdFwiYm9keVwiOiBbXG5cdFx0XHRcImNvbnNvbGUubG9nKCckMScpO1wiLFxuXHRcdFx0XCIkMlwiXG5cdFx0XSxcblx0XHRcdFwiZGVzY3JpcHRpb25cIjogXCJMb2cgb3V0cHV0IHRvIGNvbnNvbGVcIlxuXHR9XG59YDtcblxuc3VpdGUoJ1NuaXBwZXRzTWVyZ2UnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gbG9jYWwgYW5kIHJlbW90ZSBhcmUgc2FtZSB3aXRoIG9uZSBzbmlwcGV0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsID0geyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQxIH07XG5cdFx0Y29uc3QgcmVtb3RlID0geyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQxIH07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbCwgcmVtb3RlLCBudWxsKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUuYWRkZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUudXBkYXRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS5yZW1vdmVkLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gbG9jYWwgYW5kIHJlbW90ZSBhcmUgc2FtZSB3aXRoIG11bHRpcGxlIGVudHJpZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWwgPSB7ICdodG1sLmpzb24nOiBodG1sU25pcHBldDEsICd0eXBlc2NyaXB0Lmpzb24nOiB0c1NuaXBwZXQxIH07XG5cdFx0Y29uc3QgcmVtb3RlID0geyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQxLCAndHlwZXNjcmlwdC5qc29uJzogdHNTbmlwcGV0MSB9O1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWwsIHJlbW90ZSwgbnVsbCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuY29uZmxpY3RzLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLmFkZGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLnVwZGF0ZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUucmVtb3ZlZCwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGxvY2FsIGFuZCByZW1vdGUgYXJlIHNhbWUgd2l0aCBtdWx0aXBsZSBlbnRyaWVzIGluIGRpZmZlcmVudCBvcmRlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbCA9IHsgJ3R5cGVzY3JpcHQuanNvbic6IHRzU25pcHBldDEsICdodG1sLmpzb24nOiBodG1sU25pcHBldDEgfTtcblx0XHRjb25zdCByZW1vdGUgPSB7ICdodG1sLmpzb24nOiBodG1sU25pcHBldDEsICd0eXBlc2NyaXB0Lmpzb24nOiB0c1NuaXBwZXQxIH07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbCwgcmVtb3RlLCBudWxsKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUuYWRkZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUudXBkYXRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS5yZW1vdmVkLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gbG9jYWwgYW5kIHJlbW90ZSBhcmUgc2FtZSB3aXRoIGRpZmZlcmVudCBiYXNlIGNvbnRlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWwgPSB7ICdodG1sLmpzb24nOiBodG1sU25pcHBldDEsICd0eXBlc2NyaXB0Lmpzb24nOiB0c1NuaXBwZXQxIH07XG5cdFx0Y29uc3QgcmVtb3RlID0geyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQxLCAndHlwZXNjcmlwdC5qc29uJzogdHNTbmlwcGV0MSB9O1xuXHRcdGNvbnN0IGJhc2UgPSB7ICdodG1sLmpzb24nOiBodG1sU25pcHBldDIsICd0eXBlc2NyaXB0Lmpzb24nOiB0c1NuaXBwZXQyIH07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbCwgcmVtb3RlLCBiYXNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUuYWRkZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUudXBkYXRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS5yZW1vdmVkLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gYSBuZXcgZW50cnkgaXMgYWRkZWQgdG8gcmVtb3RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsID0geyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQxIH07XG5cdFx0Y29uc3QgcmVtb3RlID0geyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQxLCAndHlwZXNjcmlwdC5qc29uJzogdHNTbmlwcGV0MSB9O1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWwsIHJlbW90ZSwgbnVsbCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgeyAndHlwZXNjcmlwdC5qc29uJzogdHNTbmlwcGV0MSB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0cywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS5hZGRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS51cGRhdGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLnJlbW92ZWQsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBtdWx0aXBsZSBuZXcgZW50cmllcyBhcmUgYWRkZWQgdG8gcmVtb3RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsID0ge307XG5cdFx0Y29uc3QgcmVtb3RlID0geyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQxLCAndHlwZXNjcmlwdC5qc29uJzogdHNTbmlwcGV0MSB9O1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWwsIHJlbW90ZSwgbnVsbCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgcmVtb3RlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0cywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS5hZGRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS51cGRhdGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLnJlbW92ZWQsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBuZXcgZW50cnkgaXMgYWRkZWQgdG8gcmVtb3RlIGZyb20gYmFzZSBhbmQgbG9jYWwgaGFzIG5vdCBjaGFuZ2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsID0geyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQxIH07XG5cdFx0Y29uc3QgcmVtb3RlID0geyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQxLCAndHlwZXNjcmlwdC5qc29uJzogdHNTbmlwcGV0MSB9O1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWwsIHJlbW90ZSwgbG9jYWwpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIHsgJ3R5cGVzY3JpcHQuanNvbic6IHRzU25pcHBldDEgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUuYWRkZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUudXBkYXRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS5yZW1vdmVkLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gYW4gZW50cnkgaXMgcmVtb3ZlZCBmcm9tIHJlbW90ZSBmcm9tIGJhc2UgYW5kIGxvY2FsIGhhcyBub3QgY2hhbmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbCA9IHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MSwgJ3R5cGVzY3JpcHQuanNvbic6IHRzU25pcHBldDEgfTtcblx0XHRjb25zdCByZW1vdGUgPSB7ICdodG1sLmpzb24nOiBodG1sU25pcHBldDEgfTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsLCByZW1vdGUsIGxvY2FsKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFsndHlwZXNjcmlwdC5qc29uJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0cywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS5hZGRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS51cGRhdGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLnJlbW92ZWQsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBhbGwgZW50cmllcyBhcmUgcmVtb3ZlZCBmcm9tIGJhc2UgYW5kIGxvY2FsIGhhcyBub3QgY2hhbmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbCA9IHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MSwgJ3R5cGVzY3JpcHQuanNvbic6IHRzU25pcHBldDEgfTtcblx0XHRjb25zdCByZW1vdGUgPSB7fTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsLCByZW1vdGUsIGxvY2FsKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFsnaHRtbC5qc29uJywgJ3R5cGVzY3JpcHQuanNvbiddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUuYWRkZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUudXBkYXRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS5yZW1vdmVkLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gYW4gZW50cnkgaXMgdXBkYXRlZCBpbiByZW1vdGUgZnJvbSBiYXNlIGFuZCBsb2NhbCBoYXMgbm90IGNoYW5nZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWwgPSB7ICdodG1sLmpzb24nOiBodG1sU25pcHBldDEgfTtcblx0XHRjb25zdCByZW1vdGUgPSB7ICdodG1sLmpzb24nOiBodG1sU25pcHBldDIgfTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsLCByZW1vdGUsIGxvY2FsKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgeyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQyIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUuYWRkZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUudXBkYXRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS5yZW1vdmVkLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gcmVtb3RlIGhhcyBtb3ZlZCBmb3J3YXJkZWQgd2l0aCBtdWx0aXBsZSBjaGFuZ2VzIGFuZCBsb2NhbCBzdGF5cyB3aXRoIGJhc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWwgPSB7ICdodG1sLmpzb24nOiBodG1sU25pcHBldDEsICd0eXBlc2NyaXB0Lmpzb24nOiB0c1NuaXBwZXQxIH07XG5cdFx0Y29uc3QgcmVtb3RlID0geyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQyLCAnYy5qc29uJzogY1NuaXBwZXQgfTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsLCByZW1vdGUsIGxvY2FsKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCB7ICdjLmpzb24nOiBjU25pcHBldCB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCB7ICdodG1sLmpzb24nOiBodG1sU25pcHBldDIgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgWyd0eXBlc2NyaXB0Lmpzb24nXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuY29uZmxpY3RzLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLmFkZGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLnVwZGF0ZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUucmVtb3ZlZCwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGEgbmV3IGVudHJpZXMgYXJlIGFkZGVkIHRvIGxvY2FsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsID0geyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQxLCAndHlwZXNjcmlwdC5qc29uJzogdHNTbmlwcGV0MSwgJ2MuanNvbic6IGNTbmlwcGV0IH07XG5cdFx0Y29uc3QgcmVtb3RlID0geyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQxLCAndHlwZXNjcmlwdC5qc29uJzogdHNTbmlwcGV0MSB9O1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWwsIHJlbW90ZSwgbnVsbCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuY29uZmxpY3RzLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLmFkZGVkLCB7ICdjLmpzb24nOiBjU25pcHBldCB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUudXBkYXRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS5yZW1vdmVkLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gbXVsdGlwbGUgbmV3IGVudHJpZXMgYXJlIGFkZGVkIHRvIGxvY2FsIGZyb20gYmFzZSBhbmQgcmVtb3RlIGlzIG5vdCBjaGFuZ2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsID0geyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQxLCAndHlwZXNjcmlwdC5qc29uJzogdHNTbmlwcGV0MSwgJ2MuanNvbic6IGNTbmlwcGV0IH07XG5cdFx0Y29uc3QgcmVtb3RlID0geyAndHlwZXNjcmlwdC5qc29uJzogdHNTbmlwcGV0MSB9O1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWwsIHJlbW90ZSwgcmVtb3RlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUuYWRkZWQsIHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MSwgJ2MuanNvbic6IGNTbmlwcGV0IH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS51cGRhdGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLnJlbW92ZWQsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBhbiBlbnRyeSBpcyByZW1vdmVkIGZyb20gbG9jYWwgZnJvbSBiYXNlIGFuZCByZW1vdGUgaGFzIG5vdCBjaGFuZ2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsID0geyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQxIH07XG5cdFx0Y29uc3QgcmVtb3RlID0geyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQxLCAndHlwZXNjcmlwdC5qc29uJzogdHNTbmlwcGV0MSB9O1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWwsIHJlbW90ZSwgcmVtb3RlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUuYWRkZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUudXBkYXRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS5yZW1vdmVkLCBbJ3R5cGVzY3JpcHQuanNvbiddKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBhbiBlbnRyeSBpcyB1cGRhdGVkIGluIGxvY2FsIGZyb20gYmFzZSBhbmQgcmVtb3RlIGhhcyBub3QgY2hhbmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbCA9IHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MiwgJ3R5cGVzY3JpcHQuanNvbic6IHRzU25pcHBldDEgfTtcblx0XHRjb25zdCByZW1vdGUgPSB7ICdodG1sLmpzb24nOiBodG1sU25pcHBldDEsICd0eXBlc2NyaXB0Lmpzb24nOiB0c1NuaXBwZXQxIH07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbCwgcmVtb3RlLCByZW1vdGUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0cywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS5hZGRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS51cGRhdGVkLCB7ICdodG1sLmpzb24nOiBodG1sU25pcHBldDIgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLnJlbW92ZWQsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBsb2NhbCBoYXMgbW92ZWQgZm9yd2FyZGVkIHdpdGggbXVsdGlwbGUgY2hhbmdlcyBhbmQgcmVtb3RlIHN0YXlzIHdpdGggYmFzZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbCA9IHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MiwgJ2MuanNvbic6IGNTbmlwcGV0IH07XG5cdFx0Y29uc3QgcmVtb3RlID0geyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQxLCAndHlwZXNjcmlwdC5qc29uJzogdHNTbmlwcGV0MSB9O1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWwsIHJlbW90ZSwgcmVtb3RlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUuYWRkZWQsIHsgJ2MuanNvbic6IGNTbmlwcGV0IH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS51cGRhdGVkLCB7ICdodG1sLmpzb24nOiBodG1sU25pcHBldDIgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLnJlbW92ZWQsIFsndHlwZXNjcmlwdC5qc29uJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGxvY2FsIGFuZCByZW1vdGUgd2l0aCBvbmUgZW50cnkgYnV0IGRpZmZlcmVudCB2YWx1ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbCA9IHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MSB9O1xuXHRcdGNvbnN0IHJlbW90ZSA9IHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MiB9O1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWwsIHJlbW90ZSwgbnVsbCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuY29uZmxpY3RzLCBbJ2h0bWwuanNvbiddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUuYWRkZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUudXBkYXRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS5yZW1vdmVkLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gdGhlIGVudHJ5IGlzIHJlbW92ZWQgaW4gcmVtb3RlIGJ1dCB1cGRhdGVkIGluIGxvY2FsIGFuZCBhIG5ldyBlbnRyeSBpcyBhZGRlZCBpbiByZW1vdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYmFzZSA9IHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MSB9O1xuXHRcdGNvbnN0IGxvY2FsID0geyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQyIH07XG5cdFx0Y29uc3QgcmVtb3RlID0geyAndHlwZXNjcmlwdC5qc29uJzogdHNTbmlwcGV0MSB9O1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWwsIHJlbW90ZSwgYmFzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgeyAndHlwZXNjcmlwdC5qc29uJzogdHNTbmlwcGV0MSB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0cywgWydodG1sLmpzb24nXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLmFkZGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLnVwZGF0ZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUucmVtb3ZlZCwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aXRoIHNpbmdsZSBlbnRyeSBhbmQgbG9jYWwgaXMgZW1wdHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYmFzZSA9IHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MSB9O1xuXHRcdGNvbnN0IGxvY2FsID0ge307XG5cdFx0Y29uc3QgcmVtb3RlID0geyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQyIH07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbCwgcmVtb3RlLCBiYXNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCB7ICdodG1sLmpzb24nOiBodG1sU25pcHBldDIgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUuYWRkZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUudXBkYXRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS5yZW1vdmVkLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gbG9jYWwgYW5kIHJlbW90ZSBoYXMgbW92ZWQgZm9yd2FyZWRlZCB3aXRoIGNvbmZsaWN0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBiYXNlID0geyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQxLCAndHlwZXNjcmlwdC5qc29uJzogdHNTbmlwcGV0MSB9O1xuXHRcdGNvbnN0IGxvY2FsID0geyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQyLCAnYy5qc29uJzogY1NuaXBwZXQgfTtcblx0XHRjb25zdCByZW1vdGUgPSB7ICd0eXBlc2NyaXB0Lmpzb24nOiB0c1NuaXBwZXQyIH07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbCwgcmVtb3RlLCBiYXNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCB7ICd0eXBlc2NyaXB0Lmpzb24nOiB0c1NuaXBwZXQyIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuY29uZmxpY3RzLCBbJ2h0bWwuanNvbiddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUuYWRkZWQsIHsgJ2MuanNvbic6IGNTbmlwcGV0IH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS51cGRhdGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLnJlbW92ZWQsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBsb2NhbCBhbmQgcmVtb3RlIGhhcyBtb3ZlZCBmb3J3YXJlZGVkIHdpdGggbXVsdGlwbGUgY29uZmxpY3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJhc2UgPSB7ICdodG1sLmpzb24nOiBodG1sU25pcHBldDEsICd0eXBlc2NyaXB0Lmpzb24nOiB0c1NuaXBwZXQxIH07XG5cdFx0Y29uc3QgbG9jYWwgPSB7ICdodG1sLmpzb24nOiBodG1sU25pcHBldDIsICd0eXBlc2NyaXB0Lmpzb24nOiB0c1NuaXBwZXQyLCAnYy5qc29uJzogY1NuaXBwZXQgfTtcblx0XHRjb25zdCByZW1vdGUgPSB7ICdjLmpzb24nOiBjU25pcHBldCB9O1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWwsIHJlbW90ZSwgYmFzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuY29uZmxpY3RzLCBbJ2h0bWwuanNvbicsICd0eXBlc2NyaXB0Lmpzb24nXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLmFkZGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLnVwZGF0ZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUucmVtb3ZlZCwgW10pO1xuXHR9KTtcblxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxhQUFhO0FBRXRCLE1BQU0sYUFBYTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBa0JuQixNQUFNLGFB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
