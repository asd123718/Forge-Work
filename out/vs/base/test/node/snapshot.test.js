import * as fs from "fs";
import { tmpdir } from "os";
import { getRandomTestPath } from "./testUtils.js";
import { Promises } from "../../node/pfs.js";
import { SnapshotContext, assertSnapshot } from "../common/snapshot.js";
import { URI } from "../../common/uri.js";
import { join } from "../../common/path.js";
import { assertThrowsAsync, ensureNoDisposablesAreLeakedInTestSuite } from "../common/utils.js";
suite("snapshot", () => {
  let testDir;
  ensureNoDisposablesAreLeakedInTestSuite();
  setup(function() {
    testDir = getRandomTestPath(tmpdir(), "vsctests", "snapshot");
    return fs.promises.mkdir(testDir, { recursive: true });
  });
  teardown(function() {
    return Promises.rm(testDir);
  });
  const makeContext = (test2) => {
    return new class extends SnapshotContext {
      constructor() {
        super(test2);
        this.snapshotsDir = URI.file(testDir);
      }
    }();
  };
  const snapshotFileTree = async () => {
    let str = "";
    const printDir = async (dir, indent) => {
      const children = await Promises.readdir(dir);
      for (const child of children) {
        const p = join(dir, child);
        if ((await fs.promises.stat(p)).isFile()) {
          const content = await fs.promises.readFile(p, "utf-8");
          str += `${" ".repeat(indent)}${child}:
`;
          for (const line of content.split("\n")) {
            str += `${" ".repeat(indent + 2)}${line}
`;
          }
        } else {
          str += `${" ".repeat(indent)}${child}/
`;
          await printDir(p, indent + 2);
        }
      }
    };
    await printDir(testDir, 0);
    await assertSnapshot(str);
  };
  test("creates a snapshot", async () => {
    const ctx = makeContext({
      file: "foo/bar",
      fullTitle: () => "hello world!"
    });
    await ctx.assert({ cool: true });
    await snapshotFileTree();
  });
  test("validates a snapshot", async () => {
    const ctx1 = makeContext({
      file: "foo/bar",
      fullTitle: () => "hello world!"
    });
    await ctx1.assert({ cool: true });
    const ctx2 = makeContext({
      file: "foo/bar",
      fullTitle: () => "hello world!"
    });
    await ctx2.assert({ cool: true });
    const ctx3 = makeContext({
      file: "foo/bar",
      fullTitle: () => "hello world!"
    });
    await assertThrowsAsync(() => ctx3.assert({ cool: false }));
  });
  test("cleans up old snapshots", async () => {
    const ctx1 = makeContext({
      file: "foo/bar",
      fullTitle: () => "hello world!"
    });
    await ctx1.assert({ cool: true });
    await ctx1.assert({ nifty: true });
    await ctx1.assert({ customName: 1 }, { name: "thirdTest", extension: "txt" });
    await ctx1.assert({ customName: 2 }, { name: "fourthTest" });
    await snapshotFileTree();
    const ctx2 = makeContext({
      file: "foo/bar",
      fullTitle: () => "hello world!"
    });
    await ctx2.assert({ cool: true });
    await ctx2.assert({ customName: 1 }, { name: "thirdTest" });
    await ctx2.removeOldSnapshots();
    await snapshotFileTree();
  });
  test("formats object nicely", async () => {
    const circular = {};
    circular.a = circular;
    await assertSnapshot([
      1,
      true,
      void 0,
      null,
      123n,
      /* @__PURE__ */ Symbol("heyo"),
      "hello",
      { hello: "world" },
      circular,
      /* @__PURE__ */ new Map([["hello", 1], ["goodbye", 2]]),
      /* @__PURE__ */ new Set([1, 2, 3]),
      function helloWorld() {
      },
      /hello/g,
      new Array(10).fill("long string".repeat(10)),
      { [/* @__PURE__ */ Symbol.for("debug.description")]() {
        return `Range [1 -> 5]`;
      } }
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxub2RlXFxzbmFwc2hvdC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0IHsgdG1wZGlyIH0gZnJvbSAnb3MnO1xuaW1wb3J0IHsgZ2V0UmFuZG9tVGVzdFBhdGggfSBmcm9tICcuL3Rlc3RVdGlscy5qcyc7XG5pbXBvcnQgeyBQcm9taXNlcyB9IGZyb20gJy4uLy4uL25vZGUvcGZzLmpzJztcbmltcG9ydCB7IFNuYXBzaG90Q29udGV4dCwgYXNzZXJ0U25hcHNob3QgfSBmcm9tICcuLi9jb21tb24vc25hcHNob3QuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSAnLi4vLi4vY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgYXNzZXJ0VGhyb3dzQXN5bmMsIGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uL2NvbW1vbi91dGlscy5qcyc7XG5cbi8vIHRlc3RzIGZvciBzbmFwc2hvdCBhcmUgaW4gTm9kZSBzbyB0aGF0IHdlIGNhbiB1c2UgbmF0aXZlIEZTIG9wZXJhdGlvbnMgdG9cbi8vIHNldCB1cCBhbmQgdmFsaWRhdGUgdGhpbmdzLlxuLy9cbi8vIFVzZXMgc25hcHNob3RzIGZvciB0ZXN0aW5nIHNuYXBzaG90cy4gSXQncyBzbmFwY2VwdGlvbiFcblxuc3VpdGUoJ3NuYXBzaG90JywgKCkgPT4ge1xuXHRsZXQgdGVzdERpcjogc3RyaW5nO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHNldHVwKGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0RGlyID0gZ2V0UmFuZG9tVGVzdFBhdGgodG1wZGlyKCksICd2c2N0ZXN0cycsICdzbmFwc2hvdCcpO1xuXHRcdHJldHVybiBmcy5wcm9taXNlcy5ta2Rpcih0ZXN0RGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0fSk7XG5cblx0dGVhcmRvd24oZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiBQcm9taXNlcy5ybSh0ZXN0RGlyKTtcblx0fSk7XG5cblx0Y29uc3QgbWFrZUNvbnRleHQgPSAodGVzdDogUGFydGlhbDxNb2NoYS5UZXN0PiB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBTbmFwc2hvdENvbnRleHQge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHRlc3QgYXMgTW9jaGEuVGVzdCk7XG5cdFx0XHRcdHRoaXMuc25hcHNob3RzRGlyID0gVVJJLmZpbGUodGVzdERpcik7XG5cdFx0XHR9XG5cdFx0fTtcblx0fTtcblxuXHRjb25zdCBzbmFwc2hvdEZpbGVUcmVlID0gYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBzdHIgPSAnJztcblxuXHRcdGNvbnN0IHByaW50RGlyID0gYXN5bmMgKGRpcjogc3RyaW5nLCBpbmRlbnQ6IG51bWJlcikgPT4ge1xuXHRcdFx0Y29uc3QgY2hpbGRyZW4gPSBhd2FpdCBQcm9taXNlcy5yZWFkZGlyKGRpcik7XG5cdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIGNoaWxkcmVuKSB7XG5cdFx0XHRcdGNvbnN0IHAgPSBqb2luKGRpciwgY2hpbGQpO1xuXHRcdFx0XHRpZiAoKGF3YWl0IGZzLnByb21pc2VzLnN0YXQocCkpLmlzRmlsZSgpKSB7XG5cdFx0XHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGZzLnByb21pc2VzLnJlYWRGaWxlKHAsICd1dGYtOCcpO1xuXHRcdFx0XHRcdHN0ciArPSBgJHsnICcucmVwZWF0KGluZGVudCl9JHtjaGlsZH06XFxuYDtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGxpbmUgb2YgY29udGVudC5zcGxpdCgnXFxuJykpIHtcblx0XHRcdFx0XHRcdHN0ciArPSBgJHsnICcucmVwZWF0KGluZGVudCArIDIpfSR7bGluZX1cXG5gO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzdHIgKz0gYCR7JyAnLnJlcGVhdChpbmRlbnQpfSR7Y2hpbGR9L1xcbmA7XG5cdFx0XHRcdFx0YXdhaXQgcHJpbnREaXIocCwgaW5kZW50ICsgMik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0YXdhaXQgcHJpbnREaXIodGVzdERpciwgMCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3Qoc3RyKTtcblx0fTtcblxuXHR0ZXN0KCdjcmVhdGVzIGEgc25hcHNob3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY3R4ID0gbWFrZUNvbnRleHQoe1xuXHRcdFx0ZmlsZTogJ2Zvby9iYXInLFxuXHRcdFx0ZnVsbFRpdGxlOiAoKSA9PiAnaGVsbG8gd29ybGQhJ1xuXHRcdH0pO1xuXG5cdFx0YXdhaXQgY3R4LmFzc2VydCh7IGNvb2w6IHRydWUgfSk7XG5cdFx0YXdhaXQgc25hcHNob3RGaWxlVHJlZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd2YWxpZGF0ZXMgYSBzbmFwc2hvdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjdHgxID0gbWFrZUNvbnRleHQoe1xuXHRcdFx0ZmlsZTogJ2Zvby9iYXInLFxuXHRcdFx0ZnVsbFRpdGxlOiAoKSA9PiAnaGVsbG8gd29ybGQhJ1xuXHRcdH0pO1xuXG5cdFx0YXdhaXQgY3R4MS5hc3NlcnQoeyBjb29sOiB0cnVlIH0pO1xuXG5cdFx0Y29uc3QgY3R4MiA9IG1ha2VDb250ZXh0KHtcblx0XHRcdGZpbGU6ICdmb28vYmFyJyxcblx0XHRcdGZ1bGxUaXRsZTogKCkgPT4gJ2hlbGxvIHdvcmxkISdcblx0XHR9KTtcblxuXHRcdC8vIHNob3VsZCBwYXNzOlxuXHRcdGF3YWl0IGN0eDIuYXNzZXJ0KHsgY29vbDogdHJ1ZSB9KTtcblxuXHRcdGNvbnN0IGN0eDMgPSBtYWtlQ29udGV4dCh7XG5cdFx0XHRmaWxlOiAnZm9vL2JhcicsXG5cdFx0XHRmdWxsVGl0bGU6ICgpID0+ICdoZWxsbyB3b3JsZCEnXG5cdFx0fSk7XG5cblx0XHQvLyBzaG91bGQgZmFpbDpcblx0XHRhd2FpdCBhc3NlcnRUaHJvd3NBc3luYygoKSA9PiBjdHgzLmFzc2VydCh7IGNvb2w6IGZhbHNlIH0pKTtcblx0fSk7XG5cblx0dGVzdCgnY2xlYW5zIHVwIG9sZCBzbmFwc2hvdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY3R4MSA9IG1ha2VDb250ZXh0KHtcblx0XHRcdGZpbGU6ICdmb28vYmFyJyxcblx0XHRcdGZ1bGxUaXRsZTogKCkgPT4gJ2hlbGxvIHdvcmxkISdcblx0XHR9KTtcblxuXHRcdGF3YWl0IGN0eDEuYXNzZXJ0KHsgY29vbDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBjdHgxLmFzc2VydCh7IG5pZnR5OiB0cnVlIH0pO1xuXHRcdGF3YWl0IGN0eDEuYXNzZXJ0KHsgY3VzdG9tTmFtZTogMSB9LCB7IG5hbWU6ICd0aGlyZFRlc3QnLCBleHRlbnNpb246ICd0eHQnIH0pO1xuXHRcdGF3YWl0IGN0eDEuYXNzZXJ0KHsgY3VzdG9tTmFtZTogMiB9LCB7IG5hbWU6ICdmb3VydGhUZXN0JyB9KTtcblxuXHRcdGF3YWl0IHNuYXBzaG90RmlsZVRyZWUoKTtcblxuXHRcdGNvbnN0IGN0eDIgPSBtYWtlQ29udGV4dCh7XG5cdFx0XHRmaWxlOiAnZm9vL2JhcicsXG5cdFx0XHRmdWxsVGl0bGU6ICgpID0+ICdoZWxsbyB3b3JsZCEnXG5cdFx0fSk7XG5cblx0XHRhd2FpdCBjdHgyLmFzc2VydCh7IGNvb2w6IHRydWUgfSk7XG5cdFx0YXdhaXQgY3R4Mi5hc3NlcnQoeyBjdXN0b21OYW1lOiAxIH0sIHsgbmFtZTogJ3RoaXJkVGVzdCcgfSk7XG5cdFx0YXdhaXQgY3R4Mi5yZW1vdmVPbGRTbmFwc2hvdHMoKTtcblxuXHRcdGF3YWl0IHNuYXBzaG90RmlsZVRyZWUoKTtcblx0fSk7XG5cblx0dGVzdCgnZm9ybWF0cyBvYmplY3QgbmljZWx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNpcmN1bGFyOiBhbnkgPSB7fTtcblx0XHRjaXJjdWxhci5hID0gY2lyY3VsYXI7XG5cblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChbXG5cdFx0XHQxLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdG51bGwsXG5cdFx0XHQxMjNuLFxuXHRcdFx0U3ltYm9sKCdoZXlvJyksXG5cdFx0XHQnaGVsbG8nLFxuXHRcdFx0eyBoZWxsbzogJ3dvcmxkJyB9LFxuXHRcdFx0Y2lyY3VsYXIsXG5cdFx0XHRuZXcgTWFwKFtbJ2hlbGxvJywgMV0sIFsnZ29vZGJ5ZScsIDJdXSksXG5cdFx0XHRuZXcgU2V0KFsxLCAyLCAzXSksXG5cdFx0XHRmdW5jdGlvbiBoZWxsb1dvcmxkKCkgeyB9LFxuXHRcdFx0L2hlbGxvL2csXG5cdFx0XHRuZXcgQXJyYXkoMTApLmZpbGwoJ2xvbmcgc3RyaW5nJy5yZXBlYXQoMTApKSxcblx0XHRcdHsgW1N5bWJvbC5mb3IoJ2RlYnVnLmRlc2NyaXB0aW9uJyldKCkgeyByZXR1cm4gYFJhbmdlIFsxIC0+IDVdYDsgfSB9LFxuXHRc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
