import assert from "assert";
import * as path from "../../../../../base/common/path.js";
import * as platform from "../../../../../base/common/platform.js";
import { joinPath } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { QueryType } from "../../common/search.js";
import { Engine as FileSearchEngine, FileWalker } from "../../node/fileSearch.js";
import { flakySuite } from "../../../../../base/test/node/testUtils.js";
import { FileAccess } from "../../../../../base/common/network.js";
const TEST_FIXTURES = path.normalize(FileAccess.asFileUri("vs/workbench/services/search/test/node/fixtures").fsPath);
const EXAMPLES_FIXTURES = URI.file(path.join(TEST_FIXTURES, "examples"));
const MORE_FIXTURES = URI.file(path.join(TEST_FIXTURES, "more"));
const TEST_ROOT_FOLDER = { folder: URI.file(TEST_FIXTURES) };
const ROOT_FOLDER_QUERY = [
  TEST_ROOT_FOLDER
];
const ROOT_FOLDER_QUERY_36438 = [
  { folder: URI.file(path.normalize(FileAccess.asFileUri("vs/workbench/services/search/test/node/fixtures2/36438").fsPath)) }
];
const MULTIROOT_QUERIES = [
  { folder: EXAMPLES_FIXTURES },
  { folder: MORE_FIXTURES }
];
flakySuite("FileSearchEngine", () => {
  test("Files: *.js", function(done) {
    const engine = new FileSearchEngine({
      type: QueryType.File,
      folderQueries: ROOT_FOLDER_QUERY,
      filePattern: "*.js"
    });
    let count = 0;
    engine.search((result) => {
      if (result) {
        count++;
      }
    }, () => {
    }, (error) => {
      assert.ok(!error);
      assert.strictEqual(count, 4);
      done();
    });
  });
  test("Files: maxResults", function(done) {
    const engine = new FileSearchEngine({
      type: QueryType.File,
      folderQueries: ROOT_FOLDER_QUERY,
      maxResults: 1
    });
    let count = 0;
    engine.search((result) => {
      if (result) {
        count++;
      }
    }, () => {
    }, (error) => {
      assert.ok(!error);
      assert.strictEqual(count, 1);
      done();
    });
  });
  test("Files: maxResults without Ripgrep", function(done) {
    const engine = new FileSearchEngine({
      type: QueryType.File,
      folderQueries: ROOT_FOLDER_QUERY,
      maxResults: 1
    });
    let count = 0;
    engine.search((result) => {
      if (result) {
        count++;
      }
    }, () => {
    }, (error) => {
      assert.ok(!error);
      assert.strictEqual(count, 1);
      done();
    });
  });
  test("Files: exists", function(done) {
    const engine = new FileSearchEngine({
      type: QueryType.File,
      folderQueries: ROOT_FOLDER_QUERY,
      includePattern: { "**/file.txt": true },
      exists: true
    });
    let count = 0;
    engine.search((result) => {
      if (result) {
        count++;
      }
    }, () => {
    }, (error, complete) => {
      assert.ok(!error);
      assert.strictEqual(count, 0);
      assert.ok(complete.limitHit);
      done();
    });
  });
  test("Files: not exists", function(done) {
    const engine = new FileSearchEngine({
      type: QueryType.File,
      folderQueries: ROOT_FOLDER_QUERY,
      includePattern: { "**/nofile.txt": true },
      exists: true
    });
    let count = 0;
    engine.search((result) => {
      if (result) {
        count++;
      }
    }, () => {
    }, (error, complete) => {
      assert.ok(!error);
      assert.strictEqual(count, 0);
      assert.ok(!complete.limitHit);
      done();
    });
  });
  test("Files: exists without Ripgrep", function(done) {
    const engine = new FileSearchEngine({
      type: QueryType.File,
      folderQueries: ROOT_FOLDER_QUERY,
      includePattern: { "**/file.txt": true },
      exists: true
    });
    let count = 0;
    engine.search((result) => {
      if (result) {
        count++;
      }
    }, () => {
    }, (error, complete) => {
      assert.ok(!error);
      assert.strictEqual(count, 0);
      assert.ok(complete.limitHit);
      done();
    });
  });
  test("Files: not exists without Ripgrep", function(done) {
    const engine = new FileSearchEngine({
      type: QueryType.File,
      folderQueries: ROOT_FOLDER_QUERY,
      includePattern: { "**/nofile.txt": true },
      exists: true
    });
    let count = 0;
    engine.search((result) => {
      if (result) {
        count++;
      }
    }, () => {
    }, (error, complete) => {
      assert.ok(!error);
      assert.strictEqual(count, 0);
      assert.ok(!complete.limitHit);
      done();
    });
  });
  test("Files: examples/com*", function(done) {
    const engine = new FileSearchEngine({
      type: QueryType.File,
      folderQueries: ROOT_FOLDER_QUERY,
      filePattern: path.join("examples", "com*")
    });
    let count = 0;
    engine.search((result) => {
      if (result) {
        count++;
      }
    }, () => {
    }, (error) => {
      assert.ok(!error);
      assert.strictEqual(count, 1);
      done();
    });
  });
  test("Files: examples (fuzzy)", function(done) {
    const engine = new FileSearchEngine({
      type: QueryType.File,
      folderQueries: ROOT_FOLDER_QUERY,
      filePattern: "xl"
    });
    let count = 0;
    engine.search((result) => {
      if (result) {
        count++;
      }
    }, () => {
    }, (error) => {
      assert.ok(!error);
      assert.strictEqual(count, 7);
      done();
    });
  });
  test("Files: multiroot", function(done) {
    const engine = new FileSearchEngine({
      type: QueryType.File,
      folderQueries: MULTIROOT_QUERIES,
      filePattern: "file"
    });
    let count = 0;
    engine.search((result) => {
      if (result) {
        count++;
      }
    }, () => {
    }, (error) => {
      assert.ok(!error);
      assert.strictEqual(count, 3);
      done();
    });
  });
  test("Files: multiroot with includePattern and maxResults", function(done) {
    const engine = new FileSearchEngine({
      type: QueryType.File,
      folderQueries: MULTIROOT_QUERIES,
      maxResults: 1,
      includePattern: {
        "*.txt": true,
        "*.js": true
      }
    });
    let count = 0;
    engine.search((result) => {
      if (result) {
        count++;
      }
    }, () => {
    }, (error, complete) => {
      assert.ok(!error);
      assert.strictEqual(count, 1);
      done();
    });
  });
  test("Files: multiroot with includePattern and exists", function(done) {
    const engine = new FileSearchEngine({
      type: QueryType.File,
      folderQueries: MULTIROOT_QUERIES,
      exists: true,
      includePattern: {
        "*.txt": true,
        "*.js": true
      }
    });
    let count = 0;
    engine.search((result) => {
      if (result) {
        count++;
      }
    }, () => {
    }, (error, complete) => {
      assert.ok(!error);
      assert.strictEqual(count, 0);
      assert.ok(complete.limitHit);
      done();
    });
  });
  test("Files: NPE (CamelCase)", function(done) {
    const engine = new FileSearchEngine({
      type: QueryType.File,
      folderQueries: ROOT_FOLDER_QUERY,
      filePattern: "NullPE"
    });
    let count = 0;
    engine.search((result) => {
      if (result) {
        count++;
      }
    }, () => {
    }, (error) => {
      assert.ok(!error);
      assert.strictEqual(count, 1);
      done();
    });
  });
  test("Files: *.*", function(done) {
    const engine = new FileSearchEngine({
      type: QueryType.File,
      folderQueries: ROOT_FOLDER_QUERY,
      filePattern: "*.*"
    });
    let count = 0;
    engine.search((result) => {
      if (result) {
        count++;
      }
    }, () => {
    }, (error) => {
      assert.ok(!error);
      assert.strictEqual(count, 14);
      done();
    });
  });
  test("Files: *.as", function(done) {
    const engine = new FileSearchEngine({
      type: QueryType.File,
      folderQueries: ROOT_FOLDER_QUERY,
      filePattern: "*.as"
    });
    let count = 0;
    engine.search((result) => {
      if (result) {
        count++;
      }
    }, () => {
    }, (error) => {
      assert.ok(!error);
      assert.strictEqual(count, 0);
      done();
    });
  });
  test("Files: *.* without derived", function(done) {
    const engine = new FileSearchEngine({
      type: QueryType.File,
      folderQueries: ROOT_FOLDER_QUERY,
      filePattern: "site.*",
      excludePattern: { "**/*.css": { "when": "$(basename).less" } }
    });
    let count = 0;
    let res;
    engine.search((result) => {
      if (result) {
        count++;
      }
      res = result;
    }, () => {
    }, (error) => {
      assert.ok(!error);
      assert.strictEqual(count, 1);
      assert.strictEqual(path.basename(res.relativePath), "site.less");
      done();
    });
  });
  test("Files: *.* exclude folder without wildcard", function(done) {
    const engine = new FileSearchEngine({
      type: QueryType.File,
      folderQueries: ROOT_FOLDER_QUERY,
      filePattern: "*.*",
      excludePattern: { "examples": true }
    });
    let count = 0;
    engine.search((result) => {
      if (result) {
        count++;
      }
    }, () => {
    }, (error) => {
      assert.ok(!error);
      assert.strictEqual(count, 8);
      done();
    });
  });
  test("Files: exclude folder without wildcard #36438", function(done) {
    const engine = new FileSearchEngine({
      type: QueryType.File,
      folderQueries: ROOT_FOLDER_QUERY_36438,
      excludePattern: { "modules": true }
    });
    let count = 0;
    engine.search((result) => {
      if (result) {
        count++;
      }
    }, () => {
    }, (error) => {
      assert.ok(!error);
      assert.strictEqual(count, 1);
      done();
    });
  });
  test("Files: include folder without wildcard #36438", function(done) {
    const engine = new FileSearchEngine({
      type: QueryType.File,
      folderQueries: ROOT_FOLDER_QUERY_36438,
      includePattern: { "modules/**": true }
    });
    let count = 0;
    engine.search((result) => {
      if (result) {
        count++;
      }
    }, () => {
    }, (error) => {
      assert.ok(!error);
      assert.strictEqual(count, 1);
      done();
    });
  });
  test("Files: *.* exclude folder with leading wildcard", function(done) {
    const engine = new FileSearchEngine({
      type: QueryType.File,
      folderQueries: ROOT_FOLDER_QUERY,
      filePattern: "*.*",
      excludePattern: { "**/examples": true }
    });
    let count = 0;
    engine.search((result) => {
      if (result) {
        count++;
      }
    }, () => {
    }, (error) => {
      assert.ok(!error);
      assert.strictEqual(count, 8);
      done();
    });
  });
  test("Files: *.* exclude folder with trailing wildcard", function(done) {
    const engine = new FileSearchEngine({
      type: QueryType.File,
      folderQueries: ROOT_FOLDER_QUERY,
      filePattern: "*.*",
      excludePattern: { "examples/**": true }
    });
    let count = 0;
    engine.search((result) => {
      if (result) {
        count++;
      }
    }, () => {
    }, (error) => {
      assert.ok(!error);
      assert.strictEqual(count, 8);
      done();
    });
  });
  test("Files: *.* exclude with unicode", function(done) {
    const engine = new FileSearchEngine({
      type: QueryType.File,
      folderQueries: ROOT_FOLDER_QUERY,
      filePattern: "*.*",
      excludePattern: { "**/\xFCm laut\u6C49\u8BED": true }
    });
    let count = 0;
    engine.search((result) => {
      if (result) {
        count++;
      }
    }, () => {
    }, (error) => {
      assert.ok(!error);
      assert.strictEqual(count, 13);
      done();
    });
  });
  test("Files: *.* include with unicode", function(done) {
    const engine = new FileSearchEngine({
      type: QueryType.File,
      folderQueries: ROOT_FOLDER_QUERY,
      filePattern: "*.*",
      includePattern: { "**/\xFCm laut\u6C49\u8BED/*": true }
    });
    let count = 0;
    engine.search((result) => {
      if (result) {
        count++;
      }
    }, () => {
    }, (error) => {
      assert.ok(!error);
      assert.strictEqual(count, 1);
      done();
    });
  });
  test("Files: multiroot with exclude", function(done) {
    const folderQueries = [
      {
        folder: EXAMPLES_FIXTURES,
        excludePattern: [{
          pattern: { "**/anotherfile.txt": true }
        }]
      },
      {
        folder: MORE_FIXTURES,
        excludePattern: [{
          pattern: {
            "**/file.txt": true
          }
        }]
      }
    ];
    const engine = new FileSearchEngine({
      type: QueryType.File,
      folderQueries,
      filePattern: "*"
    });
    let count = 0;
    engine.search((result) => {
      if (result) {
        count++;
      }
    }, () => {
    }, (error) => {
      assert.ok(!error);
      assert.strictEqual(count, 5);
      done();
    });
  });
  test("Files: Unicode and Spaces", function(done) {
    const engine = new FileSearchEngine({
      type: QueryType.File,
      folderQueries: ROOT_FOLDER_QUERY,
      filePattern: "\u6C49\u8BED"
    });
    let count = 0;
    let res;
    engine.search((result) => {
      if (result) {
        count++;
      }
      res = result;
    }, () => {
    }, (error) => {
      assert.ok(!error);
      assert.strictEqual(count, 1);
      assert.strictEqual(path.basename(res.relativePath), "\u6C49\u8BED.txt");
      done();
    });
  });
  test("Files: no results", function(done) {
    const engine = new FileSearchEngine({
      type: QueryType.File,
      folderQueries: ROOT_FOLDER_QUERY,
      filePattern: "nofilematch"
    });
    let count = 0;
    engine.search((result) => {
      if (result) {
        count++;
      }
    }, () => {
    }, (error) => {
      assert.ok(!error);
      assert.strictEqual(count, 0);
      done();
    });
  });
  test("Files: relative path matched once", function(done) {
    const engine = new FileSearchEngine({
      type: QueryType.File,
      folderQueries: ROOT_FOLDER_QUERY,
      filePattern: path.normalize(path.join("examples", "company.js"))
    });
    let count = 0;
    let res;
    engine.search((result) => {
      if (result) {
        count++;
      }
      res = result;
    }, () => {
    }, (error) => {
      assert.ok(!error);
      assert.strictEqual(count, 1);
      assert.strictEqual(path.basename(res.relativePath), "company.js");
      done();
    });
  });
  test("Files: Include pattern, single files", function(done) {
    const engine = new FileSearchEngine({
      type: QueryType.File,
      folderQueries: ROOT_FOLDER_QUERY,
      includePattern: {
        "site.css": true,
        "examples/company.js": true,
        "examples/subfolder/subfile.txt": true
      }
    });
    const res = [];
    engine.search((result) => {
      res.push(result);
    }, () => {
    }, (error) => {
      assert.ok(!error);
      const basenames = res.map((r) => path.basename(r.relativePath));
      assert.ok(basenames.indexOf("site.css") !== -1, `site.css missing in ${JSON.stringify(basenames)}`);
      assert.ok(basenames.indexOf("company.js") !== -1, `company.js missing in ${JSON.stringify(basenames)}`);
      assert.ok(basenames.indexOf("subfile.txt") !== -1, `subfile.txt missing in ${JSON.stringify(basenames)}`);
      done();
    });
  });
  test("Files: extraFiles only", function(done) {
    const engine = new FileSearchEngine({
      type: QueryType.File,
      folderQueries: [],
      extraFileResources: [
        URI.file(path.normalize(path.join(FileAccess.asFileUri("vs/workbench/services/search/test/node/fixtures").fsPath, "site.css"))),
        URI.file(path.normalize(path.join(FileAccess.asFileUri("vs/workbench/services/search/test/node/fixtures").fsPath, "examples", "company.js"))),
        URI.file(path.normalize(path.join(FileAccess.asFileUri("vs/workbench/services/search/test/node/fixtures").fsPath, "index.html")))
      ],
      filePattern: "*.js"
    });
    let count = 0;
    let res;
    engine.search((result) => {
      if (result) {
        count++;
      }
      res = result;
    }, () => {
    }, (error) => {
      assert.ok(!error);
      assert.strictEqual(count, 1);
      assert.strictEqual(path.basename(res.relativePath), "company.js");
      done();
    });
  });
  test("Files: extraFiles only (with include)", function(done) {
    const engine = new FileSearchEngine({
      type: QueryType.File,
      folderQueries: [],
      extraFileResources: [
        URI.file(path.normalize(path.join(FileAccess.asFileUri("vs/workbench/services/search/test/node/fixtures").fsPath, "site.css"))),
        URI.file(path.normalize(path.join(FileAccess.asFileUri("vs/workbench/services/search/test/node/fixtures").fsPath, "examples", "company.js"))),
        URI.file(path.normalize(path.join(FileAccess.asFileUri("vs/workbench/services/search/test/node/fixtures").fsPath, "index.html")))
      ],
      filePattern: "*.*",
      includePattern: { "**/*.css": true }
    });
    let count = 0;
    let res;
    engine.search((result) => {
      if (result) {
        count++;
      }
      res = result;
    }, () => {
    }, (error) => {
      assert.ok(!error);
      assert.strictEqual(count, 1);
      assert.strictEqual(path.basename(res.relativePath), "site.css");
      done();
    });
  });
  test("Files: extraFiles only (with exclude)", function(done) {
    const engine = new FileSearchEngine({
      type: QueryType.File,
      folderQueries: [],
      extraFileResources: [
        URI.file(path.normalize(path.join(FileAccess.asFileUri("vs/workbench/services/search/test/node/fixtures").fsPath, "site.css"))),
        URI.file(path.normalize(path.join(FileAccess.asFileUri("vs/workbench/services/search/test/node/fixtures").fsPath, "examples", "company.js"))),
        URI.file(path.normalize(path.join(FileAccess.asFileUri("vs/workbench/services/search/test/node/fixtures").fsPath, "index.html")))
      ],
      filePattern: "*.*",
      excludePattern: { "**/*.css": true }
    });
    let count = 0;
    engine.search((result) => {
      if (result) {
        count++;
      }
    }, () => {
    }, (error) => {
      assert.ok(!error);
      assert.strictEqual(count, 2);
      done();
    });
  });
  test("Files: no dupes in nested folders", function(done) {
    const engine = new FileSearchEngine({
      type: QueryType.File,
      folderQueries: [
        { folder: EXAMPLES_FIXTURES },
        { folder: joinPath(EXAMPLES_FIXTURES, "subfolder") }
      ],
      filePattern: "subfile.txt"
    });
    let count = 0;
    engine.search((result) => {
      if (result) {
        count++;
      }
    }, () => {
    }, (error) => {
      assert.ok(!error);
      assert.strictEqual(count, 1);
      done();
    });
  });
});
flakySuite("FileWalker", () => {
  (platform.isWindows ? test.skip : test)("Find: exclude subfolder", function(done) {
    const file0 = "./more/file.txt";
    const file1 = "./examples/subfolder/subfile.txt";
    const walker = new FileWalker({
      type: QueryType.File,
      folderQueries: ROOT_FOLDER_QUERY,
      excludePattern: { "**/something": true }
    });
    const cmd1 = walker.spawnFindCmd(TEST_ROOT_FOLDER);
    walker.readStdout(cmd1, "utf8", (err1, stdout1) => {
      assert.strictEqual(err1, null);
      assert.notStrictEqual(stdout1.split("\n").indexOf(file0), -1, stdout1);
      assert.notStrictEqual(stdout1.split("\n").indexOf(file1), -1, stdout1);
      const walker2 = new FileWalker({
        type: QueryType.File,
        folderQueries: ROOT_FOLDER_QUERY,
        excludePattern: { "**/subfolder": true }
      });
      const cmd2 = walker2.spawnFindCmd(TEST_ROOT_FOLDER);
      walker2.readStdout(cmd2, "utf8", (err2, stdout2) => {
        assert.strictEqual(err2, null);
        assert.notStrictEqual(stdout1.split("\n").indexOf(file0), -1, stdout1);
        assert.strictEqual(stdout2.split("\n").indexOf(file1), -1, stdout2);
        done();
      });
    });
  });
  (platform.isWindows ? test.skip : test)("Find: folder excludes", function(done) {
    const folderQueries = [
      {
        folder: URI.file(TEST_FIXTURES),
        excludePattern: [{
          pattern: { "**/subfolder": true }
        }]
      }
    ];
    const file0 = "./more/file.txt";
    const file1 = "./examples/subfolder/subfile.txt";
    const walker = new FileWalker({ type: QueryType.File, folderQueries });
    const cmd1 = walker.spawnFindCmd(folderQueries[0]);
    walker.readStdout(cmd1, "utf8", (err1, stdout1) => {
      assert.strictEqual(err1, null);
      assert(outputContains(stdout1, file0), stdout1);
      assert(!outputContains(stdout1, file1), stdout1);
      done();
    });
  });
  (platform.isWindows ? test.skip : test)("Find: exclude multiple folders", function(done) {
    const file0 = "./index.html";
    const file1 = "./examples/small.js";
    const file2 = "./more/file.txt";
    const walker = new FileWalker({ type: QueryType.File, folderQueries: ROOT_FOLDER_QUERY, excludePattern: { "**/something": true } });
    const cmd1 = walker.spawnFindCmd(TEST_ROOT_FOLDER);
    walker.readStdout(cmd1, "utf8", (err1, stdout1) => {
      assert.strictEqual(err1, null);
      assert.notStrictEqual(stdout1.split("\n").indexOf(file0), -1, stdout1);
      assert.notStrictEqual(stdout1.split("\n").indexOf(file1), -1, stdout1);
      assert.notStrictEqual(stdout1.split("\n").indexOf(file2), -1, stdout1);
      const walker2 = new FileWalker({ type: QueryType.File, folderQueries: ROOT_FOLDER_QUERY, excludePattern: { "{**/examples,**/more}": true } });
      const cmd2 = walker2.spawnFindCmd(TEST_ROOT_FOLDER);
      walker2.readStdout(cmd2, "utf8", (err2, stdout2) => {
        assert.strictEqual(err2, null);
        assert.notStrictEqual(stdout1.split("\n").indexOf(file0), -1, stdout1);
        assert.strictEqual(stdout2.split("\n").indexOf(file1), -1, stdout2);
        assert.strictEqual(stdout2.split("\n").indexOf(file2), -1, stdout2);
        done();
      });
    });
  });
  (platform.isWindows ? test.skip : test)("Find: exclude folder path suffix", function(done) {
    const file0 = "./examples/company.js";
    const file1 = "./examples/subfolder/subfile.txt";
    const walker = new FileWalker({ type: QueryType.File, folderQueries: ROOT_FOLDER_QUERY, excludePattern: { "**/examples/something": true } });
    const cmd1 = walker.spawnFindCmd(TEST_ROOT_FOLDER);
    walker.readStdout(cmd1, "utf8", (err1, stdout1) => {
      assert.strictEqual(err1, null);
      assert.notStrictEqual(stdout1.split("\n").indexOf(file0), -1, stdout1);
      assert.notStrictEqual(stdout1.split("\n").indexOf(file1), -1, stdout1);
      const walker2 = new FileWalker({ type: QueryType.File, folderQueries: ROOT_FOLDER_QUERY, excludePattern: { "**/examples/subfolder": true } });
      const cmd2 = walker2.spawnFindCmd(TEST_ROOT_FOLDER);
      walker2.readStdout(cmd2, "utf8", (err2, stdout2) => {
        assert.strictEqual(err2, null);
        assert.notStrictEqual(stdout1.split("\n").indexOf(file0), -1, stdout1);
        assert.strictEqual(stdout2.split("\n").indexOf(file1), -1, stdout2);
        done();
      });
    });
  });
  (platform.isWindows ? test.skip : test)("Find: exclude subfolder path suffix", function(done) {
    const file0 = "./examples/subfolder/subfile.txt";
    const file1 = "./examples/subfolder/anotherfolder/anotherfile.txt";
    const walker = new FileWalker({ type: QueryType.File, folderQueries: ROOT_FOLDER_QUERY, excludePattern: { "**/subfolder/something": true } });
    const cmd1 = walker.spawnFindCmd(TEST_ROOT_FOLDER);
    walker.readStdout(cmd1, "utf8", (err1, stdout1) => {
      assert.strictEqual(err1, null);
      assert.notStrictEqual(stdout1.split("\n").indexOf(file0), -1, stdout1);
      assert.notStrictEqual(stdout1.split("\n").indexOf(file1), -1, stdout1);
      const walker2 = new FileWalker({ type: QueryType.File, folderQueries: ROOT_FOLDER_QUERY, excludePattern: { "**/subfolder/anotherfolder": true } });
      const cmd2 = walker2.spawnFindCmd(TEST_ROOT_FOLDER);
      walker2.readStdout(cmd2, "utf8", (err2, stdout2) => {
        assert.strictEqual(err2, null);
        assert.notStrictEqual(stdout1.split("\n").indexOf(file0), -1, stdout1);
        assert.strictEqual(stdout2.split("\n").indexOf(file1), -1, stdout2);
        done();
      });
    });
  });
  (platform.isWindows ? test.skip : test)("Find: exclude folder path", function(done) {
    const file0 = "./examples/company.js";
    const file1 = "./examples/subfolder/subfile.txt";
    const walker = new FileWalker({ type: QueryType.File, folderQueries: ROOT_FOLDER_QUERY, excludePattern: { "examples/something": true } });
    const cmd1 = walker.spawnFindCmd(TEST_ROOT_FOLDER);
    walker.readStdout(cmd1, "utf8", (err1, stdout1) => {
      assert.strictEqual(err1, null);
      assert.notStrictEqual(stdout1.split("\n").indexOf(file0), -1, stdout1);
      assert.notStrictEqual(stdout1.split("\n").indexOf(file1), -1, stdout1);
      const walker2 = new FileWalker({ type: QueryType.File, folderQueries: ROOT_FOLDER_QUERY, excludePattern: { "examples/subfolder": true } });
      const cmd2 = walker2.spawnFindCmd(TEST_ROOT_FOLDER);
      walker2.readStdout(cmd2, "utf8", (err2, stdout2) => {
        assert.strictEqual(err2, null);
        assert.notStrictEqual(stdout1.split("\n").indexOf(file0), -1, stdout1);
        assert.strictEqual(stdout2.split("\n").indexOf(file1), -1, stdout2);
        done();
      });
    });
  });
  (platform.isWindows ? test.skip : test)("Find: exclude combination of paths", function(done) {
    const filesIn = [
      "./examples/subfolder/subfile.txt",
      "./examples/company.js",
      "./index.html"
    ];
    const filesOut = [
      "./examples/subfolder/anotherfolder/anotherfile.txt",
      "./more/file.txt"
    ];
    const walker = new FileWalker({
      type: QueryType.File,
      folderQueries: ROOT_FOLDER_QUERY,
      excludePattern: {
        "**/subfolder/anotherfolder": true,
        "**/something/else": true,
        "**/more": true,
        "**/andmore": true
      }
    });
    const cmd1 = walker.spawnFindCmd(TEST_ROOT_FOLDER);
    walker.readStdout(cmd1, "utf8", (err1, stdout1) => {
      assert.strictEqual(err1, null);
      for (const fileIn of filesIn) {
        assert.notStrictEqual(stdout1.split("\n").indexOf(fileIn), -1, stdout1);
      }
      for (const fileOut of filesOut) {
        assert.strictEqual(stdout1.split("\n").indexOf(fileOut), -1, stdout1);
      }
      done();
    });
  });
  function outputContains(stdout, ...files) {
    const lines = stdout.split("\n");
    return files.every((file) => lines.indexOf(file) >= 0);
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxzZWFyY2hcXHRlc3RcXG5vZGVcXHNlYXJjaC5pbnRlZ3JhdGlvblRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0ICogYXMgcGxhdGZvcm0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElGb2xkZXJRdWVyeSwgUXVlcnlUeXBlLCBJUmF3RmlsZU1hdGNoIH0gZnJvbSAnLi4vLi4vY29tbW9uL3NlYXJjaC5qcyc7XG5pbXBvcnQgeyBFbmdpbmUgYXMgRmlsZVNlYXJjaEVuZ2luZSwgRmlsZVdhbGtlciB9IGZyb20gJy4uLy4uL25vZGUvZmlsZVNlYXJjaC5qcyc7XG5pbXBvcnQgeyBmbGFreVN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L25vZGUvdGVzdFV0aWxzLmpzJztcbmltcG9ydCB7IEZpbGVBY2Nlc3MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcblxuY29uc3QgVEVTVF9GSVhUVVJFUyA9IHBhdGgubm9ybWFsaXplKEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy93b3JrYmVuY2gvc2VydmljZXMvc2VhcmNoL3Rlc3Qvbm9kZS9maXh0dXJlcycpLmZzUGF0aCk7XG5jb25zdCBFWEFNUExFU19GSVhUVVJFUyA9IFVSSS5maWxlKHBhdGguam9pbihURVNUX0ZJWFRVUkVTLCAnZXhhbXBsZXMnKSk7XG5jb25zdCBNT1JFX0ZJWFRVUkVTID0gVVJJLmZpbGUocGF0aC5qb2luKFRFU1RfRklYVFVSRVMsICdtb3JlJykpO1xuY29uc3QgVEVTVF9ST09UX0ZPTERFUjogSUZvbGRlclF1ZXJ5ID0geyBmb2xkZXI6IFVSSS5maWxlKFRFU1RfRklYVFVSRVMpIH07XG5jb25zdCBST09UX0ZPTERFUl9RVUVSWTogSUZvbGRlclF1ZXJ5W10gPSBbXG5cdFRFU1RfUk9PVF9GT0xERVJcbl07XG5cbmNvbnN0IFJPT1RfRk9MREVSX1FVRVJZXzM2NDM4OiBJRm9sZGVyUXVlcnlbXSA9IFtcblx0eyBmb2xkZXI6IFVSSS5maWxlKHBhdGgubm9ybWFsaXplKEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy93b3JrYmVuY2gvc2VydmljZXMvc2VhcmNoL3Rlc3Qvbm9kZS9maXh0dXJlczIvMzY0MzgnKS5mc1BhdGgpKSB9XG5dO1xuXG5jb25zdCBNVUxUSVJPT1RfUVVFUklFUzogSUZvbGRlclF1ZXJ5W10gPSBbXG5cdHsgZm9sZGVyOiBFWEFNUExFU19GSVhUVVJFUyB9LFxuXHR7IGZvbGRlcjogTU9SRV9GSVhUVVJFUyB9XG5dO1xuXG5mbGFreVN1aXRlKCdGaWxlU2VhcmNoRW5naW5lJywgKCkgPT4ge1xuXG5cdHRlc3QoJ0ZpbGVzOiAqLmpzJywgZnVuY3Rpb24gKGRvbmU6ICgpID0+IHZvaWQpIHtcblx0XHRjb25zdCBlbmdpbmUgPSBuZXcgRmlsZVNlYXJjaEVuZ2luZSh7XG5cdFx0XHR0eXBlOiBRdWVyeVR5cGUuRmlsZSxcblx0XHRcdGZvbGRlclF1ZXJpZXM6IFJPT1RfRk9MREVSX1FVRVJZLFxuXHRcdFx0ZmlsZVBhdHRlcm46ICcqLmpzJ1xuXHRcdH0pO1xuXG5cdFx0bGV0IGNvdW50ID0gMDtcblx0XHRlbmdpbmUuc2VhcmNoKChyZXN1bHQpID0+IHtcblx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0Y291bnQrKztcblx0XHRcdH1cblx0XHR9LCAoKSA9PiB7IH0sIChlcnJvcikgPT4ge1xuXHRcdFx0YXNzZXJ0Lm9rKCFlcnJvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQsIDQpO1xuXHRcdFx0ZG9uZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdGaWxlczogbWF4UmVzdWx0cycsIGZ1bmN0aW9uIChkb25lOiAoKSA9PiB2b2lkKSB7XG5cdFx0Y29uc3QgZW5naW5lID0gbmV3IEZpbGVTZWFyY2hFbmdpbmUoe1xuXHRcdFx0dHlwZTogUXVlcnlUeXBlLkZpbGUsXG5cdFx0XHRmb2xkZXJRdWVyaWVzOiBST09UX0ZPTERFUl9RVUVSWSxcblx0XHRcdG1heFJlc3VsdHM6IDFcblx0XHR9KTtcblxuXHRcdGxldCBjb3VudCA9IDA7XG5cdFx0ZW5naW5lLnNlYXJjaCgocmVzdWx0KSA9PiB7XG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdGNvdW50Kys7XG5cdFx0XHR9XG5cdFx0fSwgKCkgPT4geyB9LCAoZXJyb3IpID0+IHtcblx0XHRcdGFzc2VydC5vayghZXJyb3IpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50LCAxKTtcblx0XHRcdGRvbmUoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRmlsZXM6IG1heFJlc3VsdHMgd2l0aG91dCBSaXBncmVwJywgZnVuY3Rpb24gKGRvbmU6ICgpID0+IHZvaWQpIHtcblx0XHRjb25zdCBlbmdpbmUgPSBuZXcgRmlsZVNlYXJjaEVuZ2luZSh7XG5cdFx0XHR0eXBlOiBRdWVyeVR5cGUuRmlsZSxcblx0XHRcdGZvbGRlclF1ZXJpZXM6IFJPT1RfRk9MREVSX1FVRVJZLFxuXHRcdFx0bWF4UmVzdWx0czogMSxcblx0XHR9KTtcblxuXHRcdGxldCBjb3VudCA9IDA7XG5cdFx0ZW5naW5lLnNlYXJjaCgocmVzdWx0KSA9PiB7XG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdGNvdW50Kys7XG5cdFx0XHR9XG5cdFx0fSwgKCkgPT4geyB9LCAoZXJyb3IpID0+IHtcblx0XHRcdGFzc2VydC5vayghZXJyb3IpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50LCAxKTtcblx0XHRcdGRvbmUoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRmlsZXM6IGV4aXN0cycsIGZ1bmN0aW9uIChkb25lOiAoKSA9PiB2b2lkKSB7XG5cdFx0Y29uc3QgZW5naW5lID0gbmV3IEZpbGVTZWFyY2hFbmdpbmUoe1xuXHRcdFx0dHlwZTogUXVlcnlUeXBlLkZpbGUsXG5cdFx0XHRmb2xkZXJRdWVyaWVzOiBST09UX0ZPTERFUl9RVUVSWSxcblx0XHRcdGluY2x1ZGVQYXR0ZXJuOiB7ICcqKi9maWxlLnR4dCc6IHRydWUgfSxcblx0XHRcdGV4aXN0czogdHJ1ZVxuXHRcdH0pO1xuXG5cdFx0bGV0IGNvdW50ID0gMDtcblx0XHRlbmdpbmUuc2VhcmNoKChyZXN1bHQpID0+IHtcblx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0Y291bnQrKztcblx0XHRcdH1cblx0XHR9LCAoKSA9PiB7IH0sIChlcnJvciwgY29tcGxldGUpID0+IHtcblx0XHRcdGFzc2VydC5vayghZXJyb3IpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50LCAwKTtcblx0XHRcdGFzc2VydC5vayhjb21wbGV0ZS5saW1pdEhpdCk7XG5cdFx0XHRkb25lKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZpbGVzOiBub3QgZXhpc3RzJywgZnVuY3Rpb24gKGRvbmU6ICgpID0+IHZvaWQpIHtcblx0XHRjb25zdCBlbmdpbmUgPSBuZXcgRmlsZVNlYXJjaEVuZ2luZSh7XG5cdFx0XHR0eXBlOiBRdWVyeVR5cGUuRmlsZSxcblx0XHRcdGZvbGRlclF1ZXJpZXM6IFJPT1RfRk9MREVSX1FVRVJZLFxuXHRcdFx0aW5jbHVkZVBhdHRlcm46IHsgJyoqL25vZmlsZS50eHQnOiB0cnVlIH0sXG5cdFx0XHRleGlzdHM6IHRydWVcblx0XHR9KTtcblxuXHRcdGxldCBjb3VudCA9IDA7XG5cdFx0ZW5naW5lLnNlYXJjaCgocmVzdWx0KSA9PiB7XG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdGNvdW50Kys7XG5cdFx0XHR9XG5cdFx0fSwgKCkgPT4geyB9LCAoZXJyb3IsIGNvbXBsZXRlKSA9PiB7XG5cdFx0XHRhc3NlcnQub2soIWVycm9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudCwgMCk7XG5cdFx0XHRhc3NlcnQub2soIWNvbXBsZXRlLmxpbWl0SGl0KTtcblx0XHRcdGRvbmUoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRmlsZXM6IGV4aXN0cyB3aXRob3V0IFJpcGdyZXAnLCBmdW5jdGlvbiAoZG9uZTogKCkgPT4gdm9pZCkge1xuXHRcdGNvbnN0IGVuZ2luZSA9IG5ldyBGaWxlU2VhcmNoRW5naW5lKHtcblx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5GaWxlLFxuXHRcdFx0Zm9sZGVyUXVlcmllczogUk9PVF9GT0xERVJfUVVFUlksXG5cdFx0XHRpbmNsdWRlUGF0dGVybjogeyAnKiovZmlsZS50eHQnOiB0cnVlIH0sXG5cdFx0XHRleGlzdHM6IHRydWUsXG5cdFx0fSk7XG5cblx0XHRsZXQgY291bnQgPSAwO1xuXHRcdGVuZ2luZS5zZWFyY2goKHJlc3VsdCkgPT4ge1xuXHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRjb3VudCsrO1xuXHRcdFx0fVxuXHRcdH0sICgpID0+IHsgfSwgKGVycm9yLCBjb21wbGV0ZSkgPT4ge1xuXHRcdFx0YXNzZXJ0Lm9rKCFlcnJvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQsIDApO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbXBsZXRlLmxpbWl0SGl0KTtcblx0XHRcdGRvbmUoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRmlsZXM6IG5vdCBleGlzdHMgd2l0aG91dCBSaXBncmVwJywgZnVuY3Rpb24gKGRvbmU6ICgpID0+IHZvaWQpIHtcblx0XHRjb25zdCBlbmdpbmUgPSBuZXcgRmlsZVNlYXJjaEVuZ2luZSh7XG5cdFx0XHR0eXBlOiBRdWVyeVR5cGUuRmlsZSxcblx0XHRcdGZvbGRlclF1ZXJpZXM6IFJPT1RfRk9MREVSX1FVRVJZLFxuXHRcdFx0aW5jbHVkZVBhdHRlcm46IHsgJyoqL25vZmlsZS50eHQnOiB0cnVlIH0sXG5cdFx0XHRleGlzdHM6IHRydWUsXG5cdFx0fSk7XG5cblx0XHRsZXQgY291bnQgPSAwO1xuXHRcdGVuZ2luZS5zZWFyY2goKHJlc3VsdCkgPT4ge1xuXHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRjb3VudCsrO1xuXHRcdFx0fVxuXHRcdH0sICgpID0+IHsgfSwgKGVycm9yLCBjb21wbGV0ZSkgPT4ge1xuXHRcdFx0YXNzZXJ0Lm9rKCFlcnJvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQsIDApO1xuXHRcdFx0YXNzZXJ0Lm9rKCFjb21wbGV0ZS5saW1pdEhpdCk7XG5cdFx0XHRkb25lKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZpbGVzOiBleGFtcGxlcy9jb20qJywgZnVuY3Rpb24gKGRvbmU6ICgpID0+IHZvaWQpIHtcblx0XHRjb25zdCBlbmdpbmUgPSBuZXcgRmlsZVNlYXJjaEVuZ2luZSh7XG5cdFx0XHR0eXBlOiBRdWVyeVR5cGUuRmlsZSxcblx0XHRcdGZvbGRlclF1ZXJpZXM6IFJPT1RfRk9MREVSX1FVRVJZLFxuXHRcdFx0ZmlsZVBhdHRlcm46IHBhdGguam9pbignZXhhbXBsZXMnLCAnY29tKicpXG5cdFx0fSk7XG5cblx0XHRsZXQgY291bnQgPSAwO1xuXHRcdGVuZ2luZS5zZWFyY2goKHJlc3VsdCkgPT4ge1xuXHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRjb3VudCsrO1xuXHRcdFx0fVxuXHRcdH0sICgpID0+IHsgfSwgKGVycm9yKSA9PiB7XG5cdFx0XHRhc3NlcnQub2soIWVycm9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudCwgMSk7XG5cdFx0XHRkb25lKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZpbGVzOiBleGFtcGxlcyAoZnV6enkpJywgZnVuY3Rpb24gKGRvbmU6ICgpID0+IHZvaWQpIHtcblx0XHRjb25zdCBlbmdpbmUgPSBuZXcgRmlsZVNlYXJjaEVuZ2luZSh7XG5cdFx0XHR0eXBlOiBRdWVyeVR5cGUuRmlsZSxcblx0XHRcdGZvbGRlclF1ZXJpZXM6IFJPT1RfRk9MREVSX1FVRVJZLFxuXHRcdFx0ZmlsZVBhdHRlcm46ICd4bCdcblx0XHR9KTtcblxuXHRcdGxldCBjb3VudCA9IDA7XG5cdFx0ZW5naW5lLnNlYXJjaCgocmVzdWx0KSA9PiB7XG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdGNvdW50Kys7XG5cdFx0XHR9XG5cdFx0fSwgKCkgPT4geyB9LCAoZXJyb3IpID0+IHtcblx0XHRcdGFzc2VydC5vayghZXJyb3IpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50LCA3KTtcblx0XHRcdGRvbmUoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRmlsZXM6IG11bHRpcm9vdCcsIGZ1bmN0aW9uIChkb25lOiAoKSA9PiB2b2lkKSB7XG5cdFx0Y29uc3QgZW5naW5lID0gbmV3IEZpbGVTZWFyY2hFbmdpbmUoe1xuXHRcdFx0dHlwZTogUXVlcnlUeXBlLkZpbGUsXG5cdFx0XHRmb2xkZXJRdWVyaWVzOiBNVUxUSVJPT1RfUVVFUklFUyxcblx0XHRcdGZpbGVQYXR0ZXJuOiAnZmlsZSdcblx0XHR9KTtcblxuXHRcdGxldCBjb3VudCA9IDA7XG5cdFx0ZW5naW5lLnNlYXJjaCgocmVzdWx0KSA9PiB7XG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdGNvdW50Kys7XG5cdFx0XHR9XG5cdFx0fSwgKCkgPT4geyB9LCAoZXJyb3IpID0+IHtcblx0XHRcdGFzc2VydC5vayghZXJyb3IpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50LCAzKTtcblx0XHRcdGRvbmUoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRmlsZXM6IG11bHRpcm9vdCB3aXRoIGluY2x1ZGVQYXR0ZXJuIGFuZCBtYXhSZXN1bHRzJywgZnVuY3Rpb24gKGRvbmU6ICgpID0+IHZvaWQpIHtcblx0XHRjb25zdCBlbmdpbmUgPSBuZXcgRmlsZVNlYXJjaEVuZ2luZSh7XG5cdFx0XHR0eXBlOiBRdWVyeVR5cGUuRmlsZSxcblx0XHRcdGZvbGRlclF1ZXJpZXM6IE1VTFRJUk9PVF9RVUVSSUVTLFxuXHRcdFx0bWF4UmVzdWx0czogMSxcblx0XHRcdGluY2x1ZGVQYXR0ZXJuOiB7XG5cdFx0XHRcdCcqLnR4dCc6IHRydWUsXG5cdFx0XHRcdCcqLmpzJzogdHJ1ZVxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGxldCBjb3VudCA9IDA7XG5cdFx0ZW5naW5lLnNlYXJjaCgocmVzdWx0KSA9PiB7XG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdGNvdW50Kys7XG5cdFx0XHR9XG5cdFx0fSwgKCkgPT4geyB9LCAoZXJyb3IsIGNvbXBsZXRlKSA9PiB7XG5cdFx0XHRhc3NlcnQub2soIWVycm9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudCwgMSk7XG5cdFx0XHRkb25lKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZpbGVzOiBtdWx0aXJvb3Qgd2l0aCBpbmNsdWRlUGF0dGVybiBhbmQgZXhpc3RzJywgZnVuY3Rpb24gKGRvbmU6ICgpID0+IHZvaWQpIHtcblx0XHRjb25zdCBlbmdpbmUgPSBuZXcgRmlsZVNlYXJjaEVuZ2luZSh7XG5cdFx0XHR0eXBlOiBRdWVyeVR5cGUuRmlsZSxcblx0XHRcdGZvbGRlclF1ZXJpZXM6IE1VTFRJUk9PVF9RVUVSSUVTLFxuXHRcdFx0ZXhpc3RzOiB0cnVlLFxuXHRcdFx0aW5jbHVkZVBhdHRlcm46IHtcblx0XHRcdFx0JyoudHh0JzogdHJ1ZSxcblx0XHRcdFx0JyouanMnOiB0cnVlXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0bGV0IGNvdW50ID0gMDtcblx0XHRlbmdpbmUuc2VhcmNoKChyZXN1bHQpID0+IHtcblx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0Y291bnQrKztcblx0XHRcdH1cblx0XHR9LCAoKSA9PiB7IH0sIChlcnJvciwgY29tcGxldGUpID0+IHtcblx0XHRcdGFzc2VydC5vayghZXJyb3IpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50LCAwKTtcblx0XHRcdGFzc2VydC5vayhjb21wbGV0ZS5saW1pdEhpdCk7XG5cdFx0XHRkb25lKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZpbGVzOiBOUEUgKENhbWVsQ2FzZSknLCBmdW5jdGlvbiAoZG9uZTogKCkgPT4gdm9pZCkge1xuXHRcdGNvbnN0IGVuZ2luZSA9IG5ldyBGaWxlU2VhcmNoRW5naW5lKHtcblx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5GaWxlLFxuXHRcdFx0Zm9sZGVyUXVlcmllczogUk9PVF9GT0xERVJfUVVFUlksXG5cdFx0XHRmaWxlUGF0dGVybjogJ051bGxQRSdcblx0XHR9KTtcblxuXHRcdGxldCBjb3VudCA9IDA7XG5cdFx0ZW5naW5lLnNlYXJjaCgocmVzdWx0KSA9PiB7XG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdGNvdW50Kys7XG5cdFx0XHR9XG5cdFx0fSwgKCkgPT4geyB9LCAoZXJyb3IpID0+IHtcblx0XHRcdGFzc2VydC5vayghZXJyb3IpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50LCAxKTtcblx0XHRcdGRvbmUoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRmlsZXM6ICouKicsIGZ1bmN0aW9uIChkb25lOiAoKSA9PiB2b2lkKSB7XG5cdFx0Y29uc3QgZW5naW5lID0gbmV3IEZpbGVTZWFyY2hFbmdpbmUoe1xuXHRcdFx0dHlwZTogUXVlcnlUeXBlLkZpbGUsXG5cdFx0XHRmb2xkZXJRdWVyaWVzOiBST09UX0ZPTERFUl9RVUVSWSxcblx0XHRcdGZpbGVQYXR0ZXJuOiAnKi4qJ1xuXHRcdH0pO1xuXG5cdFx0bGV0IGNvdW50ID0gMDtcblx0XHRlbmdpbmUuc2VhcmNoKChyZXN1bHQpID0+IHtcblx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0Y291bnQrKztcblx0XHRcdH1cblx0XHR9LCAoKSA9PiB7IH0sIChlcnJvcikgPT4ge1xuXHRcdFx0YXNzZXJ0Lm9rKCFlcnJvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQsIDE0KTtcblx0XHRcdGRvbmUoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRmlsZXM6ICouYXMnLCBmdW5jdGlvbiAoZG9uZTogKCkgPT4gdm9pZCkge1xuXHRcdGNvbnN0IGVuZ2luZSA9IG5ldyBGaWxlU2VhcmNoRW5naW5lKHtcblx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5GaWxlLFxuXHRcdFx0Zm9sZGVyUXVlcmllczogUk9PVF9GT0xERVJfUVVFUlksXG5cdFx0XHRmaWxlUGF0dGVybjogJyouYXMnXG5cdFx0fSk7XG5cblx0XHRsZXQgY291bnQgPSAwO1xuXHRcdGVuZ2luZS5zZWFyY2goKHJlc3VsdCkgPT4ge1xuXHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRjb3VudCsrO1xuXHRcdFx0fVxuXHRcdH0sICgpID0+IHsgfSwgKGVycm9yKSA9PiB7XG5cdFx0XHRhc3NlcnQub2soIWVycm9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudCwgMCk7XG5cdFx0XHRkb25lKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZpbGVzOiAqLiogd2l0aG91dCBkZXJpdmVkJywgZnVuY3Rpb24gKGRvbmU6ICgpID0+IHZvaWQpIHtcblx0XHRjb25zdCBlbmdpbmUgPSBuZXcgRmlsZVNlYXJjaEVuZ2luZSh7XG5cdFx0XHR0eXBlOiBRdWVyeVR5cGUuRmlsZSxcblx0XHRcdGZvbGRlclF1ZXJpZXM6IFJPT1RfRk9MREVSX1FVRVJZLFxuXHRcdFx0ZmlsZVBhdHRlcm46ICdzaXRlLionLFxuXHRcdFx0ZXhjbHVkZVBhdHRlcm46IHsgJyoqLyouY3NzJzogeyAnd2hlbic6ICckKGJhc2VuYW1lKS5sZXNzJyB9IH1cblx0XHR9KTtcblxuXHRcdGxldCBjb3VudCA9IDA7XG5cdFx0bGV0IHJlczogSVJhd0ZpbGVNYXRjaDtcblx0XHRlbmdpbmUuc2VhcmNoKChyZXN1bHQpID0+IHtcblx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0Y291bnQrKztcblx0XHRcdH1cblx0XHRcdHJlcyA9IHJlc3VsdDtcblx0XHR9LCAoKSA9PiB7IH0sIChlcnJvcikgPT4ge1xuXHRcdFx0YXNzZXJ0Lm9rKCFlcnJvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGguYmFzZW5hbWUocmVzLnJlbGF0aXZlUGF0aCksICdzaXRlLmxlc3MnKTtcblx0XHRcdGRvbmUoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRmlsZXM6ICouKiBleGNsdWRlIGZvbGRlciB3aXRob3V0IHdpbGRjYXJkJywgZnVuY3Rpb24gKGRvbmU6ICgpID0+IHZvaWQpIHtcblx0XHRjb25zdCBlbmdpbmUgPSBuZXcgRmlsZVNlYXJjaEVuZ2luZSh7XG5cdFx0XHR0eXBlOiBRdWVyeVR5cGUuRmlsZSxcblx0XHRcdGZvbGRlclF1ZXJpZXM6IFJPT1RfRk9MREVSX1FVRVJZLFxuXHRcdFx0ZmlsZVBhdHRlcm46ICcqLionLFxuXHRcdFx0ZXhjbHVkZVBhdHRlcm46IHsgJ2V4YW1wbGVzJzogdHJ1ZSB9XG5cdFx0fSk7XG5cblx0XHRsZXQgY291bnQgPSAwO1xuXHRcdGVuZ2luZS5zZWFyY2goKHJlc3VsdCkgPT4ge1xuXHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRjb3VudCsrO1xuXHRcdFx0fVxuXHRcdH0sICgpID0+IHsgfSwgKGVycm9yKSA9PiB7XG5cdFx0XHRhc3NlcnQub2soIWVycm9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudCwgOCk7XG5cdFx0XHRkb25lKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZpbGVzOiBleGNsdWRlIGZvbGRlciB3aXRob3V0IHdpbGRjYXJkICMzNjQzOCcsIGZ1bmN0aW9uIChkb25lOiAoKSA9PiB2b2lkKSB7XG5cdFx0Y29uc3QgZW5naW5lID0gbmV3IEZpbGVTZWFyY2hFbmdpbmUoe1xuXHRcdFx0dHlwZTogUXVlcnlUeXBlLkZpbGUsXG5cdFx0XHRmb2xkZXJRdWVyaWVzOiBST09UX0ZPTERFUl9RVUVSWV8zNjQzOCxcblx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiB7ICdtb2R1bGVzJzogdHJ1ZSB9XG5cdFx0fSk7XG5cblx0XHRsZXQgY291bnQgPSAwO1xuXHRcdGVuZ2luZS5zZWFyY2goKHJlc3VsdCkgPT4ge1xuXHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRjb3VudCsrO1xuXHRcdFx0fVxuXHRcdH0sICgpID0+IHsgfSwgKGVycm9yKSA9PiB7XG5cdFx0XHRhc3NlcnQub2soIWVycm9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudCwgMSk7XG5cdFx0XHRkb25lKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZpbGVzOiBpbmNsdWRlIGZvbGRlciB3aXRob3V0IHdpbGRjYXJkICMzNjQzOCcsIGZ1bmN0aW9uIChkb25lOiAoKSA9PiB2b2lkKSB7XG5cdFx0Y29uc3QgZW5naW5lID0gbmV3IEZpbGVTZWFyY2hFbmdpbmUoe1xuXHRcdFx0dHlwZTogUXVlcnlUeXBlLkZpbGUsXG5cdFx0XHRmb2xkZXJRdWVyaWVzOiBST09UX0ZPTERFUl9RVUVSWV8zNjQzOCxcblx0XHRcdGluY2x1ZGVQYXR0ZXJuOiB7ICdtb2R1bGVzLyoqJzogdHJ1ZSB9XG5cdFx0fSk7XG5cblx0XHRsZXQgY291bnQgPSAwO1xuXHRcdGVuZ2luZS5zZWFyY2goKHJlc3VsdCkgPT4ge1xuXHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRjb3VudCsrO1xuXHRcdFx0fVxuXHRcdH0sICgpID0+IHsgfSwgKGVycm9yKSA9PiB7XG5cdFx0XHRhc3NlcnQub2soIWVycm9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudCwgMSk7XG5cdFx0XHRkb25lKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZpbGVzOiAqLiogZXhjbHVkZSBmb2xkZXIgd2l0aCBsZWFkaW5nIHdpbGRjYXJkJywgZnVuY3Rpb24gKGRvbmU6ICgpID0+IHZvaWQpIHtcblx0XHRjb25zdCBlbmdpbmUgPSBuZXcgRmlsZVNlYXJjaEVuZ2luZSh7XG5cdFx0XHR0eXBlOiBRdWVyeVR5cGUuRmlsZSxcblx0XHRcdGZvbGRlclF1ZXJpZXM6IFJPT1RfRk9MREVSX1FVRVJZLFxuXHRcdFx0ZmlsZVBhdHRlcm46ICcqLionLFxuXHRcdFx0ZXhjbHVkZVBhdHRlcm46IHsgJyoqL2V4YW1wbGVzJzogdHJ1ZSB9XG5cdFx0fSk7XG5cblx0XHRsZXQgY291bnQgPSAwO1xuXHRcdGVuZ2luZS5zZWFyY2goKHJlc3VsdCkgPT4ge1xuXHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRjb3VudCsrO1xuXHRcdFx0fVxuXHRcdH0sICgpID0+IHsgfSwgKGVycm9yKSA9PiB7XG5cdFx0XHRhc3NlcnQub2soIWVycm9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudCwgOCk7XG5cdFx0XHRkb25lKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZpbGVzOiAqLiogZXhjbHVkZSBmb2xkZXIgd2l0aCB0cmFpbGluZyB3aWxkY2FyZCcsIGZ1bmN0aW9uIChkb25lOiAoKSA9PiB2b2lkKSB7XG5cdFx0Y29uc3QgZW5naW5lID0gbmV3IEZpbGVTZWFyY2hFbmdpbmUoe1xuXHRcdFx0dHlwZTogUXVlcnlUeXBlLkZpbGUsXG5cdFx0XHRmb2xkZXJRdWVyaWVzOiBST09UX0ZPTERFUl9RVUVSWSxcblx0XHRcdGZpbGVQYXR0ZXJuOiAnKi4qJyxcblx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiB7ICdleGFtcGxlcy8qKic6IHRydWUgfVxuXHRcdH0pO1xuXG5cdFx0bGV0IGNvdW50ID0gMDtcblx0XHRlbmdpbmUuc2VhcmNoKChyZXN1bHQpID0+IHtcblx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0Y291bnQrKztcblx0XHRcdH1cblx0XHR9LCAoKSA9PiB7IH0sIChlcnJvcikgPT4ge1xuXHRcdFx0YXNzZXJ0Lm9rKCFlcnJvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQsIDgpO1xuXHRcdFx0ZG9uZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdGaWxlczogKi4qIGV4Y2x1ZGUgd2l0aCB1bmljb2RlJywgZnVuY3Rpb24gKGRvbmU6ICgpID0+IHZvaWQpIHtcblx0XHRjb25zdCBlbmdpbmUgPSBuZXcgRmlsZVNlYXJjaEVuZ2luZSh7XG5cdFx0XHR0eXBlOiBRdWVyeVR5cGUuRmlsZSxcblx0XHRcdGZvbGRlclF1ZXJpZXM6IFJPT1RfRk9MREVSX1FVRVJZLFxuXHRcdFx0ZmlsZVBhdHRlcm46ICcqLionLFxuXHRcdFx0ZXhjbHVkZVBhdHRlcm46IHsgJyoqL1x1MDBGQ20gbGF1dFx1NkM0OVx1OEJFRCc6IHRydWUgfVxuXHRcdH0pO1xuXG5cdFx0bGV0IGNvdW50ID0gMDtcblx0XHRlbmdpbmUuc2VhcmNoKChyZXN1bHQpID0+IHtcblx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0Y291bnQrKztcblx0XHRcdH1cblx0XHR9LCAoKSA9PiB7IH0sIChlcnJvcikgPT4ge1xuXHRcdFx0YXNzZXJ0Lm9rKCFlcnJvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQsIDEzKTtcblx0XHRcdGRvbmUoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRmlsZXM6ICouKiBpbmNsdWRlIHdpdGggdW5pY29kZScsIGZ1bmN0aW9uIChkb25lOiAoKSA9PiB2b2lkKSB7XG5cdFx0Y29uc3QgZW5naW5lID0gbmV3IEZpbGVTZWFyY2hFbmdpbmUoe1xuXHRcdFx0dHlwZTogUXVlcnlUeXBlLkZpbGUsXG5cdFx0XHRmb2xkZXJRdWVyaWVzOiBST09UX0ZPTERFUl9RVUVSWSxcblx0XHRcdGZpbGVQYXR0ZXJuOiAnKi4qJyxcblx0XHRcdGluY2x1ZGVQYXR0ZXJuOiB7ICcqKi9cdTAwRkNtIGxhdXRcdTZDNDlcdThCRUQvKic6IHRydWUgfVxuXHRcdH0pO1xuXG5cdFx0bGV0IGNvdW50ID0gMDtcblx0XHRlbmdpbmUuc2VhcmNoKChyZXN1bHQpID0+IHtcblx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0Y291bnQrKztcblx0XHRcdH1cblx0XHR9LCAoKSA9PiB7IH0sIChlcnJvcikgPT4ge1xuXHRcdFx0YXNzZXJ0Lm9rKCFlcnJvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQsIDEpO1xuXHRcdFx0ZG9uZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdGaWxlczogbXVsdGlyb290IHdpdGggZXhjbHVkZScsIGZ1bmN0aW9uIChkb25lOiAoKSA9PiB2b2lkKSB7XG5cdFx0Y29uc3QgZm9sZGVyUXVlcmllczogSUZvbGRlclF1ZXJ5W10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdGZvbGRlcjogRVhBTVBMRVNfRklYVFVSRVMsXG5cdFx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiBbe1xuXHRcdFx0XHRcdHBhdHRlcm46IHsgJyoqL2Fub3RoZXJmaWxlLnR4dCc6IHRydWUgfVxuXHRcdFx0XHR9XVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0Zm9sZGVyOiBNT1JFX0ZJWFRVUkVTLFxuXHRcdFx0XHRleGNsdWRlUGF0dGVybjogW3tcblx0XHRcdFx0XHRwYXR0ZXJuOiB7XG5cdFx0XHRcdFx0XHQnKiovZmlsZS50eHQnOiB0cnVlXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XVxuXHRcdFx0fVxuXHRcdF07XG5cblx0XHRjb25zdCBlbmdpbmUgPSBuZXcgRmlsZVNlYXJjaEVuZ2luZSh7XG5cdFx0XHR0eXBlOiBRdWVyeVR5cGUuRmlsZSxcblx0XHRcdGZvbGRlclF1ZXJpZXMsXG5cdFx0XHRmaWxlUGF0dGVybjogJyonXG5cdFx0fSk7XG5cblx0XHRsZXQgY291bnQgPSAwO1xuXHRcdGVuZ2luZS5zZWFyY2goKHJlc3VsdCkgPT4ge1xuXHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRjb3VudCsrO1xuXHRcdFx0fVxuXHRcdH0sICgpID0+IHsgfSwgKGVycm9yKSA9PiB7XG5cdFx0XHRhc3NlcnQub2soIWVycm9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudCwgNSk7XG5cdFx0XHRkb25lKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZpbGVzOiBVbmljb2RlIGFuZCBTcGFjZXMnLCBmdW5jdGlvbiAoZG9uZTogKCkgPT4gdm9pZCkge1xuXHRcdGNvbnN0IGVuZ2luZSA9IG5ldyBGaWxlU2VhcmNoRW5naW5lKHtcblx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5GaWxlLFxuXHRcdFx0Zm9sZGVyUXVlcmllczogUk9PVF9GT0xERVJfUVVFUlksXG5cdFx0XHRmaWxlUGF0dGVybjogJ1x1NkM0OVx1OEJFRCdcblx0XHR9KTtcblxuXHRcdGxldCBjb3VudCA9IDA7XG5cdFx0bGV0IHJlczogSVJhd0ZpbGVNYXRjaDtcblx0XHRlbmdpbmUuc2VhcmNoKChyZXN1bHQpID0+IHtcblx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0Y291bnQrKztcblx0XHRcdH1cblx0XHRcdHJlcyA9IHJlc3VsdDtcblx0XHR9LCAoKSA9PiB7IH0sIChlcnJvcikgPT4ge1xuXHRcdFx0YXNzZXJ0Lm9rKCFlcnJvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGguYmFzZW5hbWUocmVzLnJlbGF0aXZlUGF0aCksICdcdTZDNDlcdThCRUQudHh0Jyk7XG5cdFx0XHRkb25lKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZpbGVzOiBubyByZXN1bHRzJywgZnVuY3Rpb24gKGRvbmU6ICgpID0+IHZvaWQpIHtcblx0XHRjb25zdCBlbmdpbmUgPSBuZXcgRmlsZVNlYXJjaEVuZ2luZSh7XG5cdFx0XHR0eXBlOiBRdWVyeVR5cGUuRmlsZSxcblx0XHRcdGZvbGRlclF1ZXJpZXM6IFJPT1RfRk9MREVSX1FVRVJZLFxuXHRcdFx0ZmlsZVBhdHRlcm46ICdub2ZpbGVtYXRjaCdcblx0XHR9KTtcblxuXHRcdGxldCBjb3VudCA9IDA7XG5cdFx0ZW5naW5lLnNlYXJjaCgocmVzdWx0KSA9PiB7XG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdGNvdW50Kys7XG5cdFx0XHR9XG5cdFx0fSwgKCkgPT4geyB9LCAoZXJyb3IpID0+IHtcblx0XHRcdGFzc2VydC5vayghZXJyb3IpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50LCAwKTtcblx0XHRcdGRvbmUoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRmlsZXM6IHJlbGF0aXZlIHBhdGggbWF0Y2hlZCBvbmNlJywgZnVuY3Rpb24gKGRvbmU6ICgpID0+IHZvaWQpIHtcblx0XHRjb25zdCBlbmdpbmUgPSBuZXcgRmlsZVNlYXJjaEVuZ2luZSh7XG5cdFx0XHR0eXBlOiBRdWVyeVR5cGUuRmlsZSxcblx0XHRcdGZvbGRlclF1ZXJpZXM6IFJPT1RfRk9MREVSX1FVRVJZLFxuXHRcdFx0ZmlsZVBhdHRlcm46IHBhdGgubm9ybWFsaXplKHBhdGguam9pbignZXhhbXBsZXMnLCAnY29tcGFueS5qcycpKVxuXHRcdH0pO1xuXG5cdFx0bGV0IGNvdW50ID0gMDtcblx0XHRsZXQgcmVzOiBJUmF3RmlsZU1hdGNoO1xuXHRcdGVuZ2luZS5zZWFyY2goKHJlc3VsdCkgPT4ge1xuXHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRjb3VudCsrO1xuXHRcdFx0fVxuXHRcdFx0cmVzID0gcmVzdWx0O1xuXHRcdH0sICgpID0+IHsgfSwgKGVycm9yKSA9PiB7XG5cdFx0XHRhc3NlcnQub2soIWVycm9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5iYXNlbmFtZShyZXMucmVsYXRpdmVQYXRoKSwgJ2NvbXBhbnkuanMnKTtcblx0XHRcdGRvbmUoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRmlsZXM6IEluY2x1ZGUgcGF0dGVybiwgc2luZ2xlIGZpbGVzJywgZnVuY3Rpb24gKGRvbmU6ICgpID0+IHZvaWQpIHtcblx0XHRjb25zdCBlbmdpbmUgPSBuZXcgRmlsZVNlYXJjaEVuZ2luZSh7XG5cdFx0XHR0eXBlOiBRdWVyeVR5cGUuRmlsZSxcblx0XHRcdGZvbGRlclF1ZXJpZXM6IFJPT1RfRk9MREVSX1FVRVJZLFxuXHRcdFx0aW5jbHVkZVBhdHRlcm46IHtcblx0XHRcdFx0J3NpdGUuY3NzJzogdHJ1ZSxcblx0XHRcdFx0J2V4YW1wbGVzL2NvbXBhbnkuanMnOiB0cnVlLFxuXHRcdFx0XHQnZXhhbXBsZXMvc3ViZm9sZGVyL3N1YmZpbGUudHh0JzogdHJ1ZVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzOiBJUmF3RmlsZU1hdGNoW10gPSBbXTtcblx0XHRlbmdpbmUuc2VhcmNoKChyZXN1bHQpID0+IHtcblx0XHRcdHJlcy5wdXNoKHJlc3VsdCk7XG5cdFx0fSwgKCkgPT4geyB9LCAoZXJyb3IpID0+IHtcblx0XHRcdGFzc2VydC5vayghZXJyb3IpO1xuXHRcdFx0Y29uc3QgYmFzZW5hbWVzID0gcmVzLm1hcChyID0+IHBhdGguYmFzZW5hbWUoci5yZWxhdGl2ZVBhdGgpKTtcblx0XHRcdGFzc2VydC5vayhiYXNlbmFtZXMuaW5kZXhPZignc2l0ZS5jc3MnKSAhPT0gLTEsIGBzaXRlLmNzcyBtaXNzaW5nIGluICR7SlNPTi5zdHJpbmdpZnkoYmFzZW5hbWVzKX1gKTtcblx0XHRcdGFzc2VydC5vayhiYXNlbmFtZXMuaW5kZXhPZignY29tcGFueS5qcycpICE9PSAtMSwgYGNvbXBhbnkuanMgbWlzc2luZyBpbiAke0pTT04uc3RyaW5naWZ5KGJhc2VuYW1lcyl9YCk7XG5cdFx0XHRhc3NlcnQub2soYmFzZW5hbWVzLmluZGV4T2YoJ3N1YmZpbGUudHh0JykgIT09IC0xLCBgc3ViZmlsZS50eHQgbWlzc2luZyBpbiAke0pTT04uc3RyaW5naWZ5KGJhc2VuYW1lcyl9YCk7XG5cdFx0XHRkb25lKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZpbGVzOiBleHRyYUZpbGVzIG9ubHknLCBmdW5jdGlvbiAoZG9uZTogKCkgPT4gdm9pZCkge1xuXHRcdGNvbnN0IGVuZ2luZSA9IG5ldyBGaWxlU2VhcmNoRW5naW5lKHtcblx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5GaWxlLFxuXHRcdFx0Zm9sZGVyUXVlcmllczogW10sXG5cdFx0XHRleHRyYUZpbGVSZXNvdXJjZXM6IFtcblx0XHRcdFx0VVJJLmZpbGUocGF0aC5ub3JtYWxpemUocGF0aC5qb2luKEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy93b3JrYmVuY2gvc2VydmljZXMvc2VhcmNoL3Rlc3Qvbm9kZS9maXh0dXJlcycpLmZzUGF0aCwgJ3NpdGUuY3NzJykpKSxcblx0XHRcdFx0VVJJLmZpbGUocGF0aC5ub3JtYWxpemUocGF0aC5qb2luKEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy93b3JrYmVuY2gvc2VydmljZXMvc2VhcmNoL3Rlc3Qvbm9kZS9maXh0dXJlcycpLmZzUGF0aCwgJ2V4YW1wbGVzJywgJ2NvbXBhbnkuanMnKSkpLFxuXHRcdFx0XHRVUkkuZmlsZShwYXRoLm5vcm1hbGl6ZShwYXRoLmpvaW4oRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9zZWFyY2gvdGVzdC9ub2RlL2ZpeHR1cmVzJykuZnNQYXRoLCAnaW5kZXguaHRtbCcpKSlcblx0XHRcdF0sXG5cdFx0XHRmaWxlUGF0dGVybjogJyouanMnXG5cdFx0fSk7XG5cblx0XHRsZXQgY291bnQgPSAwO1xuXHRcdGxldCByZXM6IElSYXdGaWxlTWF0Y2g7XG5cdFx0ZW5naW5lLnNlYXJjaCgocmVzdWx0KSA9PiB7XG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdGNvdW50Kys7XG5cdFx0XHR9XG5cdFx0XHRyZXMgPSByZXN1bHQ7XG5cdFx0fSwgKCkgPT4geyB9LCAoZXJyb3IpID0+IHtcblx0XHRcdGFzc2VydC5vayghZXJyb3IpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50LCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLmJhc2VuYW1lKHJlcy5yZWxhdGl2ZVBhdGgpLCAnY29tcGFueS5qcycpO1xuXHRcdFx0ZG9uZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdGaWxlczogZXh0cmFGaWxlcyBvbmx5ICh3aXRoIGluY2x1ZGUpJywgZnVuY3Rpb24gKGRvbmU6ICgpID0+IHZvaWQpIHtcblx0XHRjb25zdCBlbmdpbmUgPSBuZXcgRmlsZVNlYXJjaEVuZ2luZSh7XG5cdFx0XHR0eXBlOiBRdWVyeVR5cGUuRmlsZSxcblx0XHRcdGZvbGRlclF1ZXJpZXM6IFtdLFxuXHRcdFx0ZXh0cmFGaWxlUmVzb3VyY2VzOiBbXG5cdFx0XHRcdFVSSS5maWxlKHBhdGgubm9ybWFsaXplKHBhdGguam9pbihGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvd29ya2JlbmNoL3NlcnZpY2VzL3NlYXJjaC90ZXN0L25vZGUvZml4dHVyZXMnKS5mc1BhdGgsICdzaXRlLmNzcycpKSksXG5cdFx0XHRcdFVSSS5maWxlKHBhdGgubm9ybWFsaXplKHBhdGguam9pbihGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvd29ya2JlbmNoL3NlcnZpY2VzL3NlYXJjaC90ZXN0L25vZGUvZml4dHVyZXMnKS5mc1BhdGgsICdleGFtcGxlcycsICdjb21wYW55LmpzJykpKSxcblx0XHRcdFx0VVJJLmZpbGUocGF0aC5ub3JtYWxpemUocGF0aC5qb2luKEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy93b3JrYmVuY2gvc2VydmljZXMvc2VhcmNoL3Rlc3Qvbm9kZS9maXh0dXJlcycpLmZzUGF0aCwgJ2luZGV4Lmh0bWwnKSkpXG5cdFx0XHRdLFxuXHRcdFx0ZmlsZVBhdHRlcm46ICcqLionLFxuXHRcdFx0aW5jbHVkZVBhdHRlcm46IHsgJyoqLyouY3NzJzogdHJ1ZSB9XG5cdFx0fSk7XG5cblx0XHRsZXQgY291bnQgPSAwO1xuXHRcdGxldCByZXM6IElSYXdGaWxlTWF0Y2g7XG5cdFx0ZW5naW5lLnNlYXJjaCgocmVzdWx0KSA9PiB7XG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdGNvdW50Kys7XG5cdFx0XHR9XG5cdFx0XHRyZXMgPSByZXN1bHQ7XG5cdFx0fSwgKCkgPT4geyB9LCAoZXJyb3IpID0+IHtcblx0XHRcdGFzc2VydC5vayghZXJyb3IpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50LCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLmJhc2VuYW1lKHJlcy5yZWxhdGl2ZVBhdGgpLCAnc2l0ZS5jc3MnKTtcblx0XHRcdGRvbmUoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRmlsZXM6IGV4dHJhRmlsZXMgb25seSAod2l0aCBleGNsdWRlKScsIGZ1bmN0aW9uIChkb25lOiAoKSA9PiB2b2lkKSB7XG5cdFx0Y29uc3QgZW5naW5lID0gbmV3IEZpbGVTZWFyY2hFbmdpbmUoe1xuXHRcdFx0dHlwZTogUXVlcnlUeXBlLkZpbGUsXG5cdFx0XHRmb2xkZXJRdWVyaWVzOiBbXSxcblx0XHRcdGV4dHJhRmlsZVJlc291cmNlczogW1xuXHRcdFx0XHRVUkkuZmlsZShwYXRoLm5vcm1hbGl6ZShwYXRoLmpvaW4oRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9zZWFyY2gvdGVzdC9ub2RlL2ZpeHR1cmVzJykuZnNQYXRoLCAnc2l0ZS5jc3MnKSkpLFxuXHRcdFx0XHRVUkkuZmlsZShwYXRoLm5vcm1hbGl6ZShwYXRoLmpvaW4oRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9zZWFyY2gvdGVzdC9ub2RlL2ZpeHR1cmVzJykuZnNQYXRoLCAnZXhhbXBsZXMnLCAnY29tcGFueS5qcycpKSksXG5cdFx0XHRcdFVSSS5maWxlKHBhdGgubm9ybWFsaXplKHBhdGguam9pbihGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvd29ya2JlbmNoL3NlcnZpY2VzL3NlYXJjaC90ZXN0L25vZGUvZml4dHVyZXMnKS5mc1BhdGgsICdpbmRleC5odG1sJykpKVxuXHRcdFx0XSxcblx0XHRcdGZpbGVQYXR0ZXJuOiAnKi4qJyxcblx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiB7ICcqKi8qLmNzcyc6IHRydWUgfVxuXHRcdH0pO1xuXG5cdFx0bGV0IGNvdW50ID0gMDtcblx0XHRlbmdpbmUuc2VhcmNoKChyZXN1bHQpID0+IHtcblx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0Y291bnQrKztcblx0XHRcdH1cblx0XHR9LCAoKSA9PiB7IH0sIChlcnJvcikgPT4ge1xuXHRcdFx0YXNzZXJ0Lm9rKCFlcnJvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQsIDIpO1xuXHRcdFx0ZG9uZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdGaWxlczogbm8gZHVwZXMgaW4gbmVzdGVkIGZvbGRlcnMnLCBmdW5jdGlvbiAoZG9uZTogKCkgPT4gdm9pZCkge1xuXHRcdGNvbnN0IGVuZ2luZSA9IG5ldyBGaWxlU2VhcmNoRW5naW5lKHtcblx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5GaWxlLFxuXHRcdFx0Zm9sZGVyUXVlcmllczogW1xuXHRcdFx0XHR7IGZvbGRlcjogRVhBTVBMRVNfRklYVFVSRVMgfSxcblx0XHRcdFx0eyBmb2xkZXI6IGpvaW5QYXRoKEVYQU1QTEVTX0ZJWFRVUkVTLCAnc3ViZm9sZGVyJykgfVxuXHRcdFx0XSxcblx0XHRcdGZpbGVQYXR0ZXJuOiAnc3ViZmlsZS50eHQnXG5cdFx0fSk7XG5cblx0XHRsZXQgY291bnQgPSAwO1xuXHRcdGVuZ2luZS5zZWFyY2goKHJlc3VsdCkgPT4ge1xuXHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRjb3VudCsrO1xuXHRcdFx0fVxuXHRcdH0sICgpID0+IHsgfSwgKGVycm9yKSA9PiB7XG5cdFx0XHRhc3NlcnQub2soIWVycm9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudCwgMSk7XG5cdFx0XHRkb25lKCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbmZsYWt5U3VpdGUoJ0ZpbGVXYWxrZXInLCAoKSA9PiB7XG5cblx0KHBsYXRmb3JtLmlzV2luZG93cyA/IHRlc3Quc2tpcCA6IHRlc3QpKCdGaW5kOiBleGNsdWRlIHN1YmZvbGRlcicsIGZ1bmN0aW9uIChkb25lOiAoKSA9PiB2b2lkKSB7XG5cdFx0Y29uc3QgZmlsZTAgPSAnLi9tb3JlL2ZpbGUudHh0Jztcblx0XHRjb25zdCBmaWxlMSA9ICcuL2V4YW1wbGVzL3N1YmZvbGRlci9zdWJmaWxlLnR4dCc7XG5cblx0XHRjb25zdCB3YWxrZXIgPSBuZXcgRmlsZVdhbGtlcih7XG5cdFx0XHR0eXBlOiBRdWVyeVR5cGUuRmlsZSxcblx0XHRcdGZvbGRlclF1ZXJpZXM6IFJPT1RfRk9MREVSX1FVRVJZLFxuXHRcdFx0ZXhjbHVkZVBhdHRlcm46IHsgJyoqL3NvbWV0aGluZyc6IHRydWUgfVxuXHRcdH0pO1xuXHRcdGNvbnN0IGNtZDEgPSB3YWxrZXIuc3Bhd25GaW5kQ21kKFRFU1RfUk9PVF9GT0xERVIpO1xuXHRcdHdhbGtlci5yZWFkU3Rkb3V0KGNtZDEsICd1dGY4JywgKGVycjEsIHN0ZG91dDEpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnIxLCBudWxsKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChzdGRvdXQxIS5zcGxpdCgnXFxuJykuaW5kZXhPZihmaWxlMCksIC0xLCBzdGRvdXQxKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChzdGRvdXQxIS5zcGxpdCgnXFxuJykuaW5kZXhPZihmaWxlMSksIC0xLCBzdGRvdXQxKTtcblxuXHRcdFx0Y29uc3Qgd2Fsa2VyID0gbmV3IEZpbGVXYWxrZXIoe1xuXHRcdFx0XHR0eXBlOiBRdWVyeVR5cGUuRmlsZSxcblx0XHRcdFx0Zm9sZGVyUXVlcmllczogUk9PVF9GT0xERVJfUVVFUlksXG5cdFx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiB7ICcqKi9zdWJmb2xkZXInOiB0cnVlIH1cblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgY21kMiA9IHdhbGtlci5zcGF3bkZpbmRDbWQoVEVTVF9ST09UX0ZPTERFUik7XG5cdFx0XHR3YWxrZXIucmVhZFN0ZG91dChjbWQyLCAndXRmOCcsIChlcnIyLCBzdGRvdXQyKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnIyLCBudWxsKTtcblx0XHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHN0ZG91dDEhLnNwbGl0KCdcXG4nKS5pbmRleE9mKGZpbGUwKSwgLTEsIHN0ZG91dDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3Rkb3V0MiEuc3BsaXQoJ1xcbicpLmluZGV4T2YoZmlsZTEpLCAtMSwgc3Rkb3V0Mik7XG5cdFx0XHRcdGRvbmUoKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQocGxhdGZvcm0uaXNXaW5kb3dzID8gdGVzdC5za2lwIDogdGVzdCkoJ0ZpbmQ6IGZvbGRlciBleGNsdWRlcycsIGZ1bmN0aW9uIChkb25lOiAoKSA9PiB2b2lkKSB7XG5cdFx0Y29uc3QgZm9sZGVyUXVlcmllczogSUZvbGRlclF1ZXJ5W10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdGZvbGRlcjogVVJJLmZpbGUoVEVTVF9GSVhUVVJFUyksXG5cdFx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiBbe1xuXHRcdFx0XHRcdHBhdHRlcm46IHsgJyoqL3N1YmZvbGRlcic6IHRydWUgfVxuXHRcdFx0XHR9XVxuXHRcdFx0fVxuXHRcdF07XG5cblx0XHRjb25zdCBmaWxlMCA9ICcuL21vcmUvZmlsZS50eHQnO1xuXHRcdGNvbnN0IGZpbGUxID0gJy4vZXhhbXBsZXMvc3ViZm9sZGVyL3N1YmZpbGUudHh0JztcblxuXHRcdGNvbnN0IHdhbGtlciA9IG5ldyBGaWxlV2Fsa2VyKHsgdHlwZTogUXVlcnlUeXBlLkZpbGUsIGZvbGRlclF1ZXJpZXMgfSk7XG5cdFx0Y29uc3QgY21kMSA9IHdhbGtlci5zcGF3bkZpbmRDbWQoZm9sZGVyUXVlcmllc1swXSk7XG5cdFx0d2Fsa2VyLnJlYWRTdGRvdXQoY21kMSwgJ3V0ZjgnLCAoZXJyMSwgc3Rkb3V0MSkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycjEsIG51bGwpO1xuXHRcdFx0YXNzZXJ0KG91dHB1dENvbnRhaW5zKHN0ZG91dDEhLCBmaWxlMCksIHN0ZG91dDEpO1xuXHRcdFx0YXNzZXJ0KCFvdXRwdXRDb250YWlucyhzdGRvdXQxISwgZmlsZTEpLCBzdGRvdXQxKTtcblx0XHRcdGRvbmUoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0KHBsYXRmb3JtLmlzV2luZG93cyA/IHRlc3Quc2tpcCA6IHRlc3QpKCdGaW5kOiBleGNsdWRlIG11bHRpcGxlIGZvbGRlcnMnLCBmdW5jdGlvbiAoZG9uZTogKCkgPT4gdm9pZCkge1xuXHRcdGNvbnN0IGZpbGUwID0gJy4vaW5kZXguaHRtbCc7XG5cdFx0Y29uc3QgZmlsZTEgPSAnLi9leGFtcGxlcy9zbWFsbC5qcyc7XG5cdFx0Y29uc3QgZmlsZTIgPSAnLi9tb3JlL2ZpbGUudHh0JztcblxuXHRcdGNvbnN0IHdhbGtlciA9IG5ldyBGaWxlV2Fsa2VyKHsgdHlwZTogUXVlcnlUeXBlLkZpbGUsIGZvbGRlclF1ZXJpZXM6IFJPT1RfRk9MREVSX1FVRVJZLCBleGNsdWRlUGF0dGVybjogeyAnKiovc29tZXRoaW5nJzogdHJ1ZSB9IH0pO1xuXHRcdGNvbnN0IGNtZDEgPSB3YWxrZXIuc3Bhd25GaW5kQ21kKFRFU1RfUk9PVF9GT0xERVIpO1xuXHRcdHdhbGtlci5yZWFkU3Rkb3V0KGNtZDEsICd1dGY4JywgKGVycjEsIHN0ZG91dDEpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnIxLCBudWxsKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChzdGRvdXQxIS5zcGxpdCgnXFxuJykuaW5kZXhPZihmaWxlMCksIC0xLCBzdGRvdXQxKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChzdGRvdXQxIS5zcGxpdCgnXFxuJykuaW5kZXhPZihmaWxlMSksIC0xLCBzdGRvdXQxKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChzdGRvdXQxIS5zcGxpdCgnXFxuJykuaW5kZXhPZihmaWxlMiksIC0xLCBzdGRvdXQxKTtcblxuXHRcdFx0Y29uc3Qgd2Fsa2VyID0gbmV3IEZpbGVXYWxrZXIoeyB0eXBlOiBRdWVyeVR5cGUuRmlsZSwgZm9sZGVyUXVlcmllczogUk9PVF9GT0xERVJfUVVFUlksIGV4Y2x1ZGVQYXR0ZXJuOiB7ICd7KiovZXhhbXBsZXMsKiovbW9yZX0nOiB0cnVlIH0gfSk7XG5cdFx0XHRjb25zdCBjbWQyID0gd2Fsa2VyLnNwYXduRmluZENtZChURVNUX1JPT1RfRk9MREVSKTtcblx0XHRcdHdhbGtlci5yZWFkU3Rkb3V0KGNtZDIsICd1dGY4JywgKGVycjIsIHN0ZG91dDIpID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycjIsIG51bGwpO1xuXHRcdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoc3Rkb3V0MSEuc3BsaXQoJ1xcbicpLmluZGV4T2YoZmlsZTApLCAtMSwgc3Rkb3V0MSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGRvdXQyIS5zcGxpdCgnXFxuJykuaW5kZXhPZihmaWxlMSksIC0xLCBzdGRvdXQyKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0ZG91dDIhLnNwbGl0KCdcXG4nKS5pbmRleE9mKGZpbGUyKSwgLTEsIHN0ZG91dDIpO1xuXHRcdFx0XHRkb25lKCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0KHBsYXRmb3JtLmlzV2luZG93cyA/IHRlc3Quc2tpcCA6IHRlc3QpKCdGaW5kOiBleGNsdWRlIGZvbGRlciBwYXRoIHN1ZmZpeCcsIGZ1bmN0aW9uIChkb25lOiAoKSA9PiB2b2lkKSB7XG5cdFx0Y29uc3QgZmlsZTAgPSAnLi9leGFtcGxlcy9jb21wYW55LmpzJztcblx0XHRjb25zdCBmaWxlMSA9ICcuL2V4YW1wbGVzL3N1YmZvbGRlci9zdWJmaWxlLnR4dCc7XG5cblx0XHRjb25zdCB3YWxrZXIgPSBuZXcgRmlsZVdhbGtlcih7IHR5cGU6IFF1ZXJ5VHlwZS5GaWxlLCBmb2xkZXJRdWVyaWVzOiBST09UX0ZPTERFUl9RVUVSWSwgZXhjbHVkZVBhdHRlcm46IHsgJyoqL2V4YW1wbGVzL3NvbWV0aGluZyc6IHRydWUgfSB9KTtcblx0XHRjb25zdCBjbWQxID0gd2Fsa2VyLnNwYXduRmluZENtZChURVNUX1JPT1RfRk9MREVSKTtcblx0XHR3YWxrZXIucmVhZFN0ZG91dChjbWQxLCAndXRmOCcsIChlcnIxLCBzdGRvdXQxKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyMSwgbnVsbCk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoc3Rkb3V0MSEuc3BsaXQoJ1xcbicpLmluZGV4T2YoZmlsZTApLCAtMSwgc3Rkb3V0MSk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoc3Rkb3V0MSEuc3BsaXQoJ1xcbicpLmluZGV4T2YoZmlsZTEpLCAtMSwgc3Rkb3V0MSk7XG5cblx0XHRcdGNvbnN0IHdhbGtlciA9IG5ldyBGaWxlV2Fsa2VyKHsgdHlwZTogUXVlcnlUeXBlLkZpbGUsIGZvbGRlclF1ZXJpZXM6IFJPT1RfRk9MREVSX1FVRVJZLCBleGNsdWRlUGF0dGVybjogeyAnKiovZXhhbXBsZXMvc3ViZm9sZGVyJzogdHJ1ZSB9IH0pO1xuXHRcdFx0Y29uc3QgY21kMiA9IHdhbGtlci5zcGF3bkZpbmRDbWQoVEVTVF9ST09UX0ZPTERFUik7XG5cdFx0XHR3YWxrZXIucmVhZFN0ZG91dChjbWQyLCAndXRmOCcsIChlcnIyLCBzdGRvdXQyKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnIyLCBudWxsKTtcblx0XHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHN0ZG91dDEhLnNwbGl0KCdcXG4nKS5pbmRleE9mKGZpbGUwKSwgLTEsIHN0ZG91dDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3Rkb3V0MiEuc3BsaXQoJ1xcbicpLmluZGV4T2YoZmlsZTEpLCAtMSwgc3Rkb3V0Mik7XG5cdFx0XHRcdGRvbmUoKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQocGxhdGZvcm0uaXNXaW5kb3dzID8gdGVzdC5za2lwIDogdGVzdCkoJ0ZpbmQ6IGV4Y2x1ZGUgc3ViZm9sZGVyIHBhdGggc3VmZml4JywgZnVuY3Rpb24gKGRvbmU6ICgpID0+IHZvaWQpIHtcblx0XHRjb25zdCBmaWxlMCA9ICcuL2V4YW1wbGVzL3N1YmZvbGRlci9zdWJmaWxlLnR4dCc7XG5cdFx0Y29uc3QgZmlsZTEgPSAnLi9leGFtcGxlcy9zdWJmb2xkZXIvYW5vdGhlcmZvbGRlci9hbm90aGVyZmlsZS50eHQnO1xuXG5cdFx0Y29uc3Qgd2Fsa2VyID0gbmV3IEZpbGVXYWxrZXIoeyB0eXBlOiBRdWVyeVR5cGUuRmlsZSwgZm9sZGVyUXVlcmllczogUk9PVF9GT0xERVJfUVVFUlksIGV4Y2x1ZGVQYXR0ZXJuOiB7ICcqKi9zdWJmb2xkZXIvc29tZXRoaW5nJzogdHJ1ZSB9IH0pO1xuXHRcdGNvbnN0IGNtZDEgPSB3YWxrZXIuc3Bhd25GaW5kQ21kKFRFU1RfUk9PVF9GT0xERVIpO1xuXHRcdHdhbGtlci5yZWFkU3Rkb3V0KGNtZDEsICd1dGY4JywgKGVycjEsIHN0ZG91dDEpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnIxLCBudWxsKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChzdGRvdXQxIS5zcGxpdCgnXFxuJykuaW5kZXhPZihmaWxlMCksIC0xLCBzdGRvdXQxKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChzdGRvdXQxIS5zcGxpdCgnXFxuJykuaW5kZXhPZihmaWxlMSksIC0xLCBzdGRvdXQxKTtcblxuXHRcdFx0Y29uc3Qgd2Fsa2VyID0gbmV3IEZpbGVXYWxrZXIoeyB0eXBlOiBRdWVyeVR5cGUuRmlsZSwgZm9sZGVyUXVlcmllczogUk9PVF9GT0xERVJfUVVFUlksIGV4Y2x1ZGVQYXR0ZXJuOiB7ICcqKi9zdWJmb2xkZXIvYW5vdGhlcmZvbGRlcic6IHRydWUgfSB9KTtcblx0XHRcdGNvbnN0IGNtZDIgPSB3YWxrZXIuc3Bhd25GaW5kQ21kKFRFU1RfUk9PVF9GT0xERVIpO1xuXHRcdFx0d2Fsa2VyLnJlYWRTdGRvdXQoY21kMiwgJ3V0ZjgnLCAoZXJyMiwgc3Rkb3V0MikgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyMiwgbnVsbCk7XG5cdFx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChzdGRvdXQxIS5zcGxpdCgnXFxuJykuaW5kZXhPZihmaWxlMCksIC0xLCBzdGRvdXQxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0ZG91dDIhLnNwbGl0KCdcXG4nKS5pbmRleE9mKGZpbGUxKSwgLTEsIHN0ZG91dDIpO1xuXHRcdFx0XHRkb25lKCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0KHBsYXRmb3JtLmlzV2luZG93cyA/IHRlc3Quc2tpcCA6IHRlc3QpKCdGaW5kOiBleGNsdWRlIGZvbGRlciBwYXRoJywgZnVuY3Rpb24gKGRvbmU6ICgpID0+IHZvaWQpIHtcblx0XHRjb25zdCBmaWxlMCA9ICcuL2V4YW1wbGVzL2NvbXBhbnkuanMnO1xuXHRcdGNvbnN0IGZpbGUxID0gJy4vZXhhbXBsZXMvc3ViZm9sZGVyL3N1YmZpbGUudHh0JztcblxuXHRcdGNvbnN0IHdhbGtlciA9IG5ldyBGaWxlV2Fsa2VyKHsgdHlwZTogUXVlcnlUeXBlLkZpbGUsIGZvbGRlclF1ZXJpZXM6IFJPT1RfRk9MREVSX1FVRVJZLCBleGNsdWRlUGF0dGVybjogeyAnZXhhbXBsZXMvc29tZXRoaW5nJzogdHJ1ZSB9IH0pO1xuXHRcdGNvbnN0IGNtZDEgPSB3YWxrZXIuc3Bhd25GaW5kQ21kKFRFU1RfUk9PVF9GT0xERVIpO1xuXHRcdHdhbGtlci5yZWFkU3Rkb3V0KGNtZDEsICd1dGY4JywgKGVycjEsIHN0ZG91dDEpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnIxLCBudWxsKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChzdGRvdXQxIS5zcGxpdCgnXFxuJykuaW5kZXhPZihmaWxlMCksIC0xLCBzdGRvdXQxKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChzdGRvdXQxIS5zcGxpdCgnXFxuJykuaW5kZXhPZihmaWxlMSksIC0xLCBzdGRvdXQxKTtcblxuXHRcdFx0Y29uc3Qgd2Fsa2VyID0gbmV3IEZpbGVXYWxrZXIoeyB0eXBlOiBRdWVyeVR5cGUuRmlsZSwgZm9sZGVyUXVlcmllczogUk9PVF9GT0xERVJfUVVFUlksIGV4Y2x1ZGVQYXR0ZXJuOiB7ICdleGFtcGxlcy9zdWJmb2xkZXInOiB0cnVlIH0gfSk7XG5cdFx0XHRjb25zdCBjbWQyID0gd2Fsa2VyLnNwYXduRmluZENtZChURVNUX1JPT1RfRk9MREVSKTtcblx0XHRcdHdhbGtlci5yZWFkU3Rkb3V0KGNtZDIsICd1dGY4JywgKGVycjIsIHN0ZG91dDIpID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycjIsIG51bGwpO1xuXHRcdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoc3Rkb3V0MSEuc3BsaXQoJ1xcbicpLmluZGV4T2YoZmlsZTApLCAtMSwgc3Rkb3V0MSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGRvdXQyIS5zcGxpdCgnXFxuJykuaW5kZXhPZihmaWxlMSksIC0xLCBzdGRvdXQyKTtcblx0XHRcdFx0ZG9uZSgpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdChwbGF0Zm9ybS5pc1dpbmRvd3MgPyB0ZXN0LnNraXAgOiB0ZXN0KSgnRmluZDogZXhjbHVkZSBjb21iaW5hdGlvbiBvZiBwYXRocycsIGZ1bmN0aW9uIChkb25lOiAoKSA9PiB2b2lkKSB7XG5cdFx0Y29uc3QgZmlsZXNJbiA9IFtcblx0XHRcdCcuL2V4YW1wbGVzL3N1YmZvbGRlci9zdWJmaWxlLnR4dCcsXG5cdFx0XHQnLi9leGFtcGxlcy9jb21wYW55LmpzJyxcblx0XHRcdCcuL2luZGV4Lmh0bWwnXG5cdFx0XTtcblx0XHRjb25zdCBmaWxlc091dCA9IFtcblx0XHRcdCcuL2V4YW1wbGVzL3N1YmZvbGRlci9hbm90aGVyZm9sZGVyL2Fub3RoZXJmaWxlLnR4dCcsXG5cdFx0XHQnLi9tb3JlL2ZpbGUudHh0J1xuXHRcdF07XG5cblx0XHRjb25zdCB3YWxrZXIgPSBuZXcgRmlsZVdhbGtlcih7XG5cdFx0XHR0eXBlOiBRdWVyeVR5cGUuRmlsZSxcblx0XHRcdGZvbGRlclF1ZXJpZXM6IFJPT1RfRk9MREVSX1FVRVJZLFxuXHRcdFx0ZXhjbHVkZVBhdHRlcm46IHtcblx0XHRcdFx0JyoqL3N1YmZvbGRlci9hbm90aGVyZm9sZGVyJzogdHJ1ZSxcblx0XHRcdFx0JyoqL3NvbWV0aGluZy9lbHNlJzogdHJ1ZSxcblx0XHRcdFx0JyoqL21vcmUnOiB0cnVlLFxuXHRcdFx0XHQnKiovYW5kbW9yZSc6IHRydWVcblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25zdCBjbWQxID0gd2Fsa2VyLnNwYXduRmluZENtZChURVNUX1JPT1RfRk9MREVSKTtcblx0XHR3YWxrZXIucmVhZFN0ZG91dChjbWQxLCAndXRmOCcsIChlcnIxLCBzdGRvdXQxKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyMSwgbnVsbCk7XG5cdFx0XHRmb3IgKGNvbnN0IGZpbGVJbiBvZiBmaWxlc0luKSB7XG5cdFx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChzdGRvdXQxIS5zcGxpdCgnXFxuJykuaW5kZXhPZihmaWxlSW4pLCAtMSwgc3Rkb3V0MSk7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IGZpbGVPdXQgb2YgZmlsZXNPdXQpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0ZG91dDEhLnNwbGl0KCdcXG4nKS5pbmRleE9mKGZpbGVPdXQpLCAtMSwgc3Rkb3V0MSk7XG5cdFx0XHR9XG5cdFx0XHRkb25lKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIG91dHB1dENvbnRhaW5zKHN0ZG91dDogc3RyaW5nLCAuLi5maWxlczogc3RyaW5nW10pOiBib29sZWFuIHtcblx0XHRjb25zdCBsaW5lcyA9IHN0ZG91dC5zcGxpdCgnXFxuJyk7XG5cdFx0cmV0dXJuIGZpbGVzLmV2ZXJ5KGZpbGUgPT4gbGluZXMuaW5kZXhPZihmaWxlKSA+PSAwKTtcblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsWUFBWSxVQUFVO0FBQ3RCLFlBQVksY0FBYztBQUMxQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQVc7QUFDcEIsU0FBdUIsaUJBQWdDO0FBQ3ZELFNBQVMsVUFBVSxrQkFBa0Isa0JBQWtCO0FBQ3ZELFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsa0JBQWtCO0FBRTNCLE1BQU0sZ0JBQWdCLEtBQUssVUFBVSxXQUFXLFVBQVUsaURBQWlELEVBQUUsTUFBTTtBQUNuSCxNQUFNLG9CQUFvQixJQUFJLEtBQUssS0FBSyxLQUFLLGVBQWUsVUFBVSxDQUFDO0FBQ3ZFLE1BQU0sZ0JBQWdCLElBQUksS0FBSyxLQUFLLEtBQUssZUFBZSxNQUFNLENBQUM7QUFDL0QsTUFBTSxtQkFBaUMsRUFBRSxRQUFRLElBQUksS0FBSyxhQUFhLEVBQUU7QUFDekUsTUFBTSxvQkFBb0M7QUFBQSxFQUN6QztBQUNEO0FBRUEsTUFBTSwwQkFBMEM7QUFBQSxFQUMvQyxFQUFFLFFBQVEsSUFBSSxLQUFLLEtBQUssVUFBVSxXQUFXLFVBQVUsd0RBQXdELEVBQUUsTUFBTSxDQUFDLEVBQUU7QUFDM0g7QUFFQSxNQUFNLG9CQUFvQztBQUFBLEVBQ3pDLEVBQUUsUUFBUSxrQkFBa0I7QUFBQSxFQUM1QixFQUFFLFFBQVEsY0FBYztBQUN6QjtBQUVBLFdBQVcsb0JBQW9CLE1BQU07QUFFcEMsT0FBSyxlQUFlLFNBQVUsTUFBa0I7QUFDL0MsVUFBTSxTQUFTLElBQUksaUJBQWlCO0FBQUEsTUFDbkMsTUFBTSxVQUFVO0FBQUEsTUFDaEIsZUFBZTtBQUFBLE1BQ2YsYUFBYTtBQUFBLElBQ2QsQ0FBQztBQUVELFFBQUksUUFBUTtBQUNaLFdBQU8sT0FBTyxDQUFDLFdBQVc7QUFDekIsVUFBSSxRQUFRO0FBQ1g7QUFBQSxNQUNEO0FBQUEsSUFDRCxHQUFHLE1BQU07QUFBQSxJQUFFLEdBQUcsQ0FBQyxVQUFVO0FBQ3hCLGFBQU8sR0FBRyxDQUFDLEtBQUs7QUFDaEIsYUFBTyxZQUFZLE9BQU8sQ0FBQztBQUMzQixXQUFLO0FBQUEsSUFDTixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxxQkFBcUIsU0FBVSxNQUFrQjtBQUNyRCxVQUFNLFNBQVMsSUFBSSxpQkFBaUI7QUFBQSxNQUNuQyxNQUFNLFVBQVU7QUFBQSxNQUNoQixlQUFlO0FBQUEsTUFDZixZQUFZO0FBQUEsSUFDYixDQUFDO0FBRUQsUUFBSSxRQUFRO0FBQ1osV0FBTyxPQUFPLENBQUMsV0FBVztBQUN6QixVQUFJLFFBQVE7QUFDWDtBQUFBLE1BQ0Q7QUFBQSxJQUNELEdBQUcsTUFBTTtBQUFBLElBQUUsR0FBRyxDQUFDLFVBQVU7QUFDeEIsYUFBTyxHQUFHLENBQUMsS0FBSztBQUNoQixhQUFPLFlBQVksT0FBTyxDQUFDO0FBQzNCLFdBQUs7QUFBQSxJQUNOLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHFDQUFxQyxTQUFVLE1BQWtCO0FBQ3JFLFVBQU0sU0FBUyxJQUFJLGlCQUFpQjtBQUFBLE1BQ25DLE1BQU0sVUFBVTtBQUFBLE1BQ2hCLGVBQWU7QUFBQSxNQUNmLFlBQVk7QUFBQSxJQUNiLENBQUM7QUFFRCxRQUFJLFFBQVE7QUFDWixXQUFPLE9BQU8sQ0FBQyxXQUFXO0FBQ3pCLFVBQUksUUFBUTtBQUNYO0FBQUEsTUFDRDtBQUFBLElBQ0QsR0FBRyxNQUFNO0FBQUEsSUFBRSxHQUFHLENBQUMsVUFBVTtBQUN4QixhQUFPLEdBQUcsQ0FBQyxLQUFLO0FBQ2hCLGFBQU8sWUFBWSxPQUFPLENBQUM7QUFDM0IsV0FBSztBQUFBLElBQ04sQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssaUJBQWlCLFNBQVUsTUFBa0I7QUFDakQsVUFBTSxTQUFTLElBQUksaUJBQWlCO0FBQUEsTUFDbkMsTUFBTSxVQUFVO0FBQUEsTUFDaEIsZUFBZTtBQUFBLE1BQ2YsZ0JBQWdCLEVBQUUsZUFBZSxLQUFLO0FBQUEsTUFDdEMsUUFBUTtBQUFBLElBQ1QsQ0FBQztBQUVELFFBQUksUUFBUTtBQUNaLFdBQU8sT0FBTyxDQUFDLFdBQVc7QUFDekIsVUFBSSxRQUFRO0FBQ1g7QUFBQSxNQUNEO0FBQUEsSUFDRCxHQUFHLE1BQU07QUFBQSxJQUFFLEdBQUcsQ0FBQyxPQUFPLGFBQWE7QUFDbEMsYUFBTyxHQUFHLENBQUMsS0FBSztBQUNoQixhQUFPLFlBQVksT0FBTyxDQUFDO0FBQzNCLGFBQU8sR0FBRyxTQUFTLFFBQVE7QUFDM0IsV0FBSztBQUFBLElBQ04sQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUsscUJBQXFCLFNBQVUsTUFBa0I7QUFDckQsVUFBTSxTQUFTLElBQUksaUJBQWlCO0FBQUEsTUFDbkMsTUFBTSxVQUFVO0FBQUEsTUFDaEIsZUFBZTtBQUFBLE1BQ2YsZ0JBQWdCLEVBQUUsaUJBQWlCLEtBQUs7QUFBQSxNQUN4QyxRQUFRO0FBQUEsSUFDVCxDQUFDO0FBRUQsUUFBSSxRQUFRO0FBQ1osV0FBTyxPQUFPLENBQUMsV0FBVztBQUN6QixVQUFJLFFBQVE7QUFDWDtBQUFBLE1BQ0Q7QUFBQSxJQUNELEdBQUcsTUFBTTtBQUFBLElBQUUsR0FBRyxDQUFDLE9BQU8sYUFBYTtBQUNsQyxhQUFPLEdBQUcsQ0FBQyxLQUFLO0FBQ2hCLGFBQU8sWUFBWSxPQUFPLENBQUM7QUFDM0IsYUFBTyxHQUFHLENBQUMsU0FBUyxRQUFRO0FBQzVCLFdBQUs7QUFBQSxJQUNOLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGlDQUFpQyxTQUFVLE1BQWtCO0FBQ2pFLFVBQU0sU0FBUyxJQUFJLGlCQUFpQjtBQUFBLE1BQ25DLE1BQU0sVUFBVTtBQUFBLE1BQ2hCLGVBQWU7QUFBQSxNQUNmLGdCQUFnQixFQUFFLGVBQWUsS0FBSztBQUFBLE1BQ3RDLFFBQVE7QUFBQSxJQUNULENBQUM7QUFFRCxRQUFJLFFBQVE7QUFDWixXQUFPLE9BQU8sQ0FBQyxXQUFXO0FBQ3pCLFVBQUksUUFBUTtBQUNYO0FBQUEsTUFDRDtBQUFBLElBQ0QsR0FBRyxNQUFNO0FBQUEsSUFBRSxHQUFHLENBQUMsT0FBTyxhQUFhO0FBQ2xDLGFBQU8sR0FBRyxDQUFDLEtBQUs7QUFDaEIsYUFBTyxZQUFZLE9BQU8sQ0FBQztBQUMzQixhQUFPLEdBQUcsU0FBUyxRQUFRO0FBQzNCLFdBQUs7QUFBQSxJQUNOLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHFDQUFxQyxTQUFVLE1BQWtCO0FBQ3JFLFVBQU0sU0FBUyxJQUFJLGlCQUFpQjtBQUFBLE1BQ25DLE1BQU0sVUFBVTtBQUFBLE1BQ2hCLGVBQWU7QUFBQSxNQUNmLGdCQUFnQixFQUFFLGlCQUFpQixLQUFLO0FBQUEsTUFDeEMsUUFBUTtBQUFBLElBQ1QsQ0FBQztBQUVELFFBQUksUUFBUTtBQUNaLFdBQU8sT0FBTyxDQUFDLFdBQVc7QUFDekIsVUFBSSxRQUFRO0FBQ1g7QUFBQSxNQUNEO0FBQUEsSUFDRCxHQUFHLE1BQU07QUFBQSxJQUFFLEdBQUcsQ0FBQyxPQUFPLGFBQWE7QUFDbEMsYUFBTyxHQUFHLENBQUMsS0FBSztBQUNoQixhQUFPLFlBQVksT0FBTyxDQUFDO0FBQzNCLGFBQU8sR0FBRyxDQUFDLFNBQVMsUUFBUTtBQUM1QixXQUFLO0FBQUEsSUFDTixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx3QkFBd0IsU0FBVSxNQUFrQjtBQUN4RCxVQUFNLFNBQVMsSUFBSSxpQkFBaUI7QUFBQSxNQUNuQyxNQUFNLFVBQVU7QUFBQSxNQUNoQixlQUFlO0FBQUEsTUFDZixhQUFhLEtBQUssS0FBSyxZQUFZLE1BQU07QUFBQSxJQUMxQyxDQUFDO0FBRUQsUUFBSSxRQUFRO0FBQ1osV0FBTyxPQUFPLENBQUMsV0FBVztBQUN6QixVQUFJLFFBQVE7QUFDWDtBQUFBLE1BQ0Q7QUFBQSxJQUNELEdBQUcsTUFBTTtBQUFBLElBQUUsR0FBRyxDQUFDLFVBQVU7QUFDeEIsYUFBTyxHQUFHLENBQUMsS0FBSztBQUNoQixhQUFPLFlBQVksT0FBTyxDQUFDO0FBQzNCLFdBQUs7QUFBQSxJQUNOLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDJCQUEyQixTQUFVLE1BQWtCO0FBQzNELFVBQU0sU0FBUyxJQUFJLGlCQUFpQjtBQUFBLE1BQ25DLE1BQU0sVUFBVTtBQUFBLE1BQ2hCLGVBQWU7QUFBQSxNQUNmLGFBQWE7QUFBQSxJQUNkLENBQUM7QUFFRCxRQUFJLFFBQVE7QUFDWixXQUFPLE9BQU8sQ0FBQyxXQUFXO0FBQ3pCLFVBQUksUUFBUTtBQUNYO0FBQUEsTUFDRDtBQUFBLElBQ0QsR0FBRyxNQUFNO0FBQUEsSUFBRSxHQUFHLENBQUMsVUFBVTtBQUN4QixhQUFPLEdBQUcsQ0FBQyxLQUFLO0FBQ2hCLGFBQU8sWUFBWSxPQUFPLENBQUM7QUFDM0IsV0FBSztBQUFBLElBQ04sQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssb0JBQW9CLFNBQVUsTUFBa0I7QUFDcEQsVUFBTSxTQUFTLElBQUksaUJBQWlCO0FBQUEsTUFDbkMsTUFBTSxVQUFVO0FBQUEsTUFDaEIsZUFBZTtBQUFBLE1BQ2YsYUFBYTtBQUFBLElBQ2QsQ0FBQztBQUVELFFBQUksUUFBUTtBQUNaLFdBQU8sT0FBTyxDQUFDLFdBQVc7QUFDekIsVUFBSSxRQUFRO0FBQ1g7QUFBQSxNQUNEO0FBQUEsSUFDRCxHQUFHLE1BQU07QUFBQSxJQUFFLEdBQUcsQ0FBQyxVQUFVO0FBQ3hCLGFBQU8sR0FBRyxDQUFDLEtBQUs7QUFDaEIsYUFBTyxZQUFZLE9BQU8sQ0FBQztBQUMzQixXQUFLO0FBQUEsSUFDTixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx1REFBdUQsU0FBVSxNQUFrQjtBQUN2RixVQUFNLFNBQVMsSUFBSSxpQkFBaUI7QUFBQSxNQUNuQyxNQUFNLFVBQVU7QUFBQSxNQUNoQixlQUFlO0FBQUEsTUFDZixZQUFZO0FBQUEsTUFDWixnQkFBZ0I7QUFBQSxRQUNmLFNBQVM7QUFBQSxRQUNULFFBQVE7QUFBQSxNQUNUO0FBQUEsSUFDRCxDQUFDO0FBRUQsUUFBSSxRQUFRO0FBQ1osV0FBTyxPQUFPLENBQUMsV0FBVztBQUN6QixVQUFJLFFBQVE7QUFDWDtBQUFBLE1BQ0Q7QUFBQSxJQUNELEdBQUcsTUFBTTtBQUFBLElBQUUsR0FBRyxDQUFDLE9BQU8sYUFBYTtBQUNsQyxhQUFPLEdBQUcsQ0FBQyxLQUFLO0FBQ2hCLGFBQU8sWUFBWSxPQUFPLENBQUM7QUFDM0IsV0FBSztBQUFBLElBQ04sQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssbURBQW1ELFNBQVUsTUFBa0I7QUFDbkYsVUFBTSxTQUFTLElBQUksaUJBQWlCO0FBQUEsTUFDbkMsTUFBTSxVQUFVO0FBQUEsTUFDaEIsZUFBZTtBQUFBLE1BQ2YsUUFBUTtBQUFBLE1BQ1IsZ0JBQWdCO0FBQUEsUUFDZixTQUFTO0FBQUEsUUFDVCxRQUFRO0FBQUEsTUFDVDtBQUFBLElBQ0QsQ0FBQztBQUVELFFBQUksUUFBUTtBQUNaLFdBQU8sT0FBTyxDQUFDLFdBQVc7QUFDekIsVUFBSSxRQUFRO0FBQ1g7QUFBQSxNQUNEO0FBQUEsSUFDRCxHQUFHLE1BQU07QUFBQSxJQUFFLEdBQUcsQ0FBQyxPQUFPLGFBQWE7QUFDbEMsYUFBTyxHQUFHLENBQUMsS0FBSztBQUNoQixhQUFPLFlBQVksT0FBTyxDQUFDO0FBQzNCLGFBQU8sR0FBRyxTQUFTLFFBQVE7QUFDM0IsV0FBSztBQUFBLElBQ04sQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssMEJBQTBCLFNBQVUsTUFBa0I7QUFDMUQsVUFBTSxTQUFTLElBQUksaUJBQWlCO0FBQUEsTUFDbkMsTUFBTSxVQUFVO0FBQUEsTUFDaEIsZUFBZTtBQUFBLE1BQ2YsYUFBYTtBQUFBLElBQ2QsQ0FBQztBQUVELFFBQUksUUFBUTtBQUNaLFdBQU8sT0FBTyxDQUFDLFdBQVc7QUFDekIsVUFBSSxRQUFRO0FBQ1g7QUFBQSxNQUNEO0FBQUEsSUFDRCxHQUFHLE1BQU07QUFBQSxJQUFFLEdBQUcsQ0FBQyxVQUFVO0FBQ3hCLGFBQU8sR0FBRyxDQUFDLEtBQUs7QUFDaEIsYUFBTyxZQUFZLE9BQU8sQ0FBQztBQUMzQixXQUFLO0FBQUEsSUFDTixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxjQUFjLFNBQVUsTUFBa0I7QUFDOUMsVUFBTSxTQUFTLElBQUksaUJBQWlCO0FBQUEsTUFDbkMsTUFBTSxVQUFVO0FBQUEsTUFDaEIsZUFBZTtBQUFBLE1BQ2YsYUFBYTtBQUFBLElBQ2QsQ0FBQztBQUVELFFBQUksUUFBUTtBQUNaLFdBQU8sT0FBTyxDQUFDLFdBQVc7QUFDekIsVUFBSSxRQUFRO0FBQ1g7QUFBQSxNQUNEO0FBQUEsSUFDRCxHQUFHLE1BQU07QUFBQSxJQUFFLEdBQUcsQ0FBQyxVQUFVO0FBQ3hCLGFBQU8sR0FBRyxDQUFDLEtBQUs7QUFDaEIsYUFBTyxZQUFZLE9BQU8sRUFBRTtBQUM1QixXQUFLO0FBQUEsSUFDTixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxlQUFlLFNBQVUsTUFBa0I7QUFDL0MsVUFBTSxTQUFTLElBQUksaUJBQWlCO0FBQUEsTUFDbkMsTUFBTSxVQUFVO0FBQUEsTUFDaEIsZUFBZTtBQUFBLE1BQ2YsYUFBYTtBQUFBLElBQ2QsQ0FBQztBQUVELFFBQUksUUFBUTtBQUNaLFdBQU8sT0FBTyxDQUFDLFdBQVc7QUFDekIsVUFBSSxRQUFRO0FBQ1g7QUFBQSxNQUNEO0FBQUEsSUFDRCxHQUFHLE1BQU07QUFBQSxJQUFFLEdBQUcsQ0FBQyxVQUFVO0FBQ3hCLGFBQU8sR0FBRyxDQUFDLEtBQUs7QUFDaEIsYUFBTyxZQUFZLE9BQU8sQ0FBQztBQUMzQixXQUFLO0FBQUEsSUFDTixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw4QkFBOEIsU0FBVSxNQUFrQjtBQUM5RCxVQUFNLFNBQVMsSUFBSSxpQkFBaUI7QUFBQSxNQUNuQyxNQUFNLFVBQVU7QUFBQSxNQUNoQixlQUFlO0FBQUEsTUFDZixhQUFhO0FBQUEsTUFDYixnQkFBZ0IsRUFBRSxZQUFZLEVBQUUsUUFBUSxtQkFBbUIsRUFBRTtBQUFBLElBQzlELENBQUM7QUFFRCxRQUFJLFFBQVE7QUFDWixRQUFJO0FBQ0osV0FBTyxPQUFPLENBQUMsV0FBVztBQUN6QixVQUFJLFFBQVE7QUFDWDtBQUFBLE1BQ0Q7QUFDQSxZQUFNO0FBQUEsSUFDUCxHQUFHLE1BQU07QUFBQSxJQUFFLEdBQUcsQ0FBQyxVQUFVO0FBQ3hCLGFBQU8sR0FBRyxDQUFDLEtBQUs7QUFDaEIsYUFBTyxZQUFZLE9BQU8sQ0FBQztBQUMzQixhQUFPLFlBQVksS0FBSyxTQUFTLElBQUksWUFBWSxHQUFHLFdBQVc7QUFDL0QsV0FBSztBQUFBLElBQ04sQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssOENBQThDLFNBQVUsTUFBa0I7QUFDOUUsVUFBTSxTQUFTLElBQUksaUJBQWlCO0FBQUEsTUFDbkMsTUFBTSxVQUFVO0FBQUEsTUFDaEIsZUFBZTtBQUFBLE1BQ2YsYUFBYTtBQUFBLE1BQ2IsZ0JBQWdCLEVBQUUsWUFBWSxLQUFLO0FBQUEsSUFDcEMsQ0FBQztBQUVELFFBQUksUUFBUTtBQUNaLFdBQU8sT0FBTyxDQUFDLFdBQVc7QUFDekIsVUFBSSxRQUFRO0FBQ1g7QUFBQSxNQUNEO0FBQUEsSUFDRCxHQUFHLE1BQU07QUFBQSxJQUFFLEdBQUcsQ0FBQyxVQUFVO0FBQ3hCLGFBQU8sR0FBRyxDQUFDLEtBQUs7QUFDaEIsYUFBTyxZQUFZLE9BQU8sQ0FBQztBQUMzQixXQUFLO0FBQUEsSUFDTixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxpREFBaUQsU0FBVSxNQUFrQjtBQUNqRixVQUFNLFNBQVMsSUFBSSxpQkFBaUI7QUFBQSxNQUNuQyxNQUFNLFVBQVU7QUFBQSxNQUNoQixlQUFlO0FBQUEsTUFDZixnQkFBZ0IsRUFBRSxXQUFXLEtBQUs7QUFBQSxJQUNuQyxDQUFDO0FBRUQsUUFBSSxRQUFRO0FBQ1osV0FBTyxPQUFPLENBQUMsV0FBVztBQUN6QixVQUFJLFFBQVE7QUFDWDtBQUFBLE1BQ0Q7QUFBQSxJQUNELEdBQUcsTUFBTTtBQUFBLElBQUUsR0FBRyxDQUFDLFVBQVU7QUFDeEIsYUFBTyxHQUFHLENBQUMsS0FBSztBQUNoQixhQUFPLFlBQVksT0FBTyxDQUFDO0FBQzNCLFdBQUs7QUFBQSxJQUNOLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGlEQUFpRCxTQUFVLE1BQWtCO0FBQ2pGLFVBQU0sU0FBUyxJQUFJLGlCQUFpQjtBQUFBLE1BQ25DLE1BQU0sVUFBVTtBQUFBLE1BQ2hCLGVBQWU7QUFBQSxNQUNmLGdCQUFnQixFQUFFLGNBQWMsS0FBSztBQUFBLElBQ3RDLENBQUM7QUFFRCxRQUFJLFFBQVE7QUFDWixXQUFPLE9BQU8sQ0FBQyxXQUFXO0FBQ3pCLFVBQUksUUFBUTtBQUNYO0FBQUEsTUFDRDtBQUFBLElBQ0QsR0FBRyxNQUFNO0FBQUEsSUFBRSxHQUFHLENBQUMsVUFBVTtBQUN4QixhQUFPLEdBQUcsQ0FBQyxLQUFLO0FBQ2hCLGFBQU8sWUFBWSxPQUFPLENBQUM7QUFDM0IsV0FBSztBQUFBLElBQ04sQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssbURBQW1ELFNBQVUsTUFBa0I7QUFDbkYsVUFBTSxTQUFTLElBQUksaUJBQWlCO0FBQUEsTUFDbkMsTUFBTSxVQUFVO0FBQUEsTUFDaEIsZUFBZTtBQUFBLE1BQ2YsYUFBYTtBQUFBLE1BQ2IsZ0JBQWdCLEVBQUUsZUFBZSxLQUFLO0FBQUEsSUFDdkMsQ0FBQztBQUVELFFBQUksUUFBUTtBQUNaLFdBQU8sT0FBTyxDQUFDLFdBQVc7QUFDekIsVUFBSSxRQUFRO0FBQ1g7QUFBQSxNQUNEO0FBQUEsSUFDRCxHQUFHLE1BQU07QUFBQSxJQUFFLEdBQUcsQ0FBQyxVQUFVO0FBQ3hCLGFBQU8sR0FBRyxDQUFDLEtBQUs7QUFDaEIsYUFBTyxZQUFZLE9BQU8sQ0FBQztBQUMzQixXQUFLO0FBQUEsSUFDTixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxvREFBb0QsU0FBVSxNQUFrQjtBQUNwRixVQUFNLFNBQVMsSUFBSSxpQkFBaUI7QUFBQSxNQUNuQyxNQUFNLFVBQVU7QUFBQSxNQUNoQixlQUFlO0FBQUEsTUFDZixhQUFhO0FBQUEsTUFDYixnQkFBZ0IsRUFBRSxlQUFlLEtBQUs7QUFBQSxJQUN2QyxDQUFDO0FBRUQsUUFBSSxRQUFRO0FBQ1osV0FBTyxPQUFPLENBQUMsV0FBVztBQUN6QixVQUFJLFFBQVE7QUFDWDtBQUFBLE1BQ0Q7QUFBQSxJQUNELEdBQUcsTUFBTTtBQUFBLElBQUUsR0FBRyxDQUFDLFVBQVU7QUFDeEIsYUFBTyxHQUFHLENBQUMsS0FBSztBQUNoQixhQUFPLFlBQVksT0FBTyxDQUFDO0FBQzNCLFdBQUs7QUFBQSxJQUNOLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLG1DQUFtQyxTQUFVLE1BQWtCO0FBQ25FLFVBQU0sU0FBUyxJQUFJLGlCQUFpQjtBQUFBLE1BQ25DLE1BQU0sVUFBVTtBQUFBLE1BQ2hCLGVBQWU7QUFBQSxNQUNmLGFBQWE7QUFBQSxNQUNiLGdCQUFnQixFQUFFLDZCQUFnQixLQUFLO0FBQUEsSUFDeEMsQ0FBQztBQUVELFFBQUksUUFBUTtBQUNaLFdBQU8sT0FBTyxDQUFDLFdBQVc7QUFDekIsVUFBSSxRQUFRO0FBQ1g7QUFBQSxNQUNEO0FBQUEsSUFDRCxHQUFHLE1BQU07QUFBQSxJQUFFLEdBQUcsQ0FBQyxVQUFVO0FBQ3hCLGFBQU8sR0FBRyxDQUFDLEtBQUs7QUFDaEIsYUFBTyxZQUFZLE9BQU8sRUFBRTtBQUM1QixXQUFLO0FBQUEsSUFDTixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxtQ0FBbUMsU0FBVSxNQUFrQjtBQUNuRSxVQUFNLFNBQVMsSUFBSSxpQkFBaUI7QUFBQSxNQUNuQyxNQUFNLFVBQVU7QUFBQSxNQUNoQixlQUFlO0FBQUEsTUFDZixhQUFhO0FBQUEsTUFDYixnQkFBZ0IsRUFBRSwrQkFBa0IsS0FBSztBQUFBLElBQzFDLENBQUM7QUFFRCxRQUFJLFFBQVE7QUFDWixXQUFPLE9BQU8sQ0FBQyxXQUFXO0FBQ3pCLFVBQUksUUFBUTtBQUNYO0FBQUEsTUFDRDtBQUFBLElBQ0QsR0FBRyxNQUFNO0FBQUEsSUFBRSxHQUFHLENBQUMsVUFBVTtBQUN4QixhQUFPLEdBQUcsQ0FBQyxLQUFLO0FBQ2hCLGFBQU8sWUFBWSxPQUFPLENBQUM7QUFDM0IsV0FBSztBQUFBLElBQ04sQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssaUNBQWlDLFNBQVUsTUFBa0I7QUFDakUsVUFBTSxnQkFBZ0M7QUFBQSxNQUNyQztBQUFBLFFBQ0MsUUFBUTtBQUFBLFFBQ1IsZ0JBQWdCLENBQUM7QUFBQSxVQUNoQixTQUFTLEVBQUUsc0JBQXNCLEtBQUs7QUFBQSxRQUN2QyxDQUFDO0FBQUEsTUFDRjtBQUFBLE1BQ0E7QUFBQSxRQUNDLFFBQVE7QUFBQSxRQUNSLGdCQUFnQixDQUFDO0FBQUEsVUFDaEIsU0FBUztBQUFBLFlBQ1IsZUFBZTtBQUFBLFVBQ2hCO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFNBQVMsSUFBSSxpQkFBaUI7QUFBQSxNQUNuQyxNQUFNLFVBQVU7QUFBQSxNQUNoQjtBQUFBLE1BQ0EsYUFBYTtBQUFBLElBQ2QsQ0FBQztBQUVELFFBQUksUUFBUTtBQUNaLFdBQU8sT0FBTyxDQUFDLFdBQVc7QUFDekIsVUFBSSxRQUFRO0FBQ1g7QUFBQSxNQUNEO0FBQUEsSUFDRCxHQUFHLE1BQU07QUFBQSxJQUFFLEdBQUcsQ0FBQyxVQUFVO0FBQ3hCLGFBQU8sR0FBRyxDQUFDLEtBQUs7QUFDaEIsYUFBTyxZQUFZLE9BQU8sQ0FBQztBQUMzQixXQUFLO0FBQUEsSUFDTixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw2QkFBNkIsU0FBVSxNQUFrQjtBQUM3RCxVQUFNLFNBQVMsSUFBSSxpQkFBaUI7QUFBQSxNQUNuQyxNQUFNLFVBQVU7QUFBQSxNQUNoQixlQUFlO0FBQUEsTUFDZixhQUFhO0FBQUEsSUFDZCxDQUFDO0FBRUQsUUFBSSxRQUFRO0FBQ1osUUFBSTtBQUNKLFdBQU8sT0FBTyxDQUFDLFdBQVc7QUFDekIsVUFBSSxRQUFRO0FBQ1g7QUFBQSxNQUNEO0FBQ0EsWUFBTTtBQUFBLElBQ1AsR0FBRyxNQUFNO0FBQUEsSUFBRSxHQUFHLENBQUMsVUFBVTtBQUN4QixhQUFPLEdBQUcsQ0FBQyxLQUFLO0FBQ2hCLGFBQU8sWUFBWSxPQUFPLENBQUM7QUFDM0IsYUFBTyxZQUFZLEtBQUssU0FBUyxJQUFJLFlBQVksR0FBRyxrQkFBUTtBQUM1RCxXQUFLO0FBQUEsSUFDTixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxxQkFBcUIsU0FBVSxNQUFrQjtBQUNyRCxVQUFNLFNBQVMsSUFBSSxpQkFBaUI7QUFBQSxNQUNuQyxNQUFNLFVBQVU7QUFBQSxNQUNoQixlQUFlO0FBQUEsTUFDZixhQUFhO0FBQUEsSUFDZCxDQUFDO0FBRUQsUUFBSSxRQUFRO0FBQ1osV0FBTyxPQUFPLENBQUMsV0FBVztBQUN6QixVQUFJLFFBQVE7QUFDWDtBQUFBLE1BQ0Q7QUFBQSxJQUNELEdBQUcsTUFBTTtBQUFBLElBQUUsR0FBRyxDQUFDLFVBQVU7QUFDeEIsYUFBTyxHQUFHLENBQUMsS0FBSztBQUNoQixhQUFPLFlBQVksT0FBTyxDQUFDO0FBQzNCLFdBQUs7QUFBQSxJQUNOLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHFDQUFxQyxTQUFVLE1BQWtCO0FBQ3JFLFVBQU0sU0FBUyxJQUFJLGlCQUFpQjtBQUFBLE1BQ25DLE1BQU0sVUFBVTtBQUFBLE1BQ2hCLGVBQWU7QUFBQSxNQUNmLGFBQWEsS0FBSyxVQUFVLEtBQUssS0FBSyxZQUFZLFlBQVksQ0FBQztBQUFBLElBQ2hFLENBQUM7QUFFRCxRQUFJLFFBQVE7QUFDWixRQUFJO0FBQ0osV0FBTyxPQUFPLENBQUMsV0FBVztBQUN6QixVQUFJLFFBQVE7QUFDWDtBQUFBLE1BQ0Q7QUFDQSxZQUFNO0FBQUEsSUFDUCxHQUFHLE1BQU07QUFBQSxJQUFFLEdBQUcsQ0FBQyxVQUFVO0FBQ3hCLGFBQU8sR0FBRyxDQUFDLEtBQUs7QUFDaEIsYUFBTyxZQUFZLE9BQU8sQ0FBQztBQUMzQixhQUFPLFlBQVksS0FBSyxTQUFTLElBQUksWUFBWSxHQUFHLFlBQVk7QUFDaEUsV0FBSztBQUFBLElBQ04sQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssd0NBQXdDLFNBQVUsTUFBa0I7QUFDeEUsVUFBTSxTQUFTLElBQUksaUJBQWlCO0FBQUEsTUFDbkMsTUFBTSxVQUFVO0FBQUEsTUFDaEIsZUFBZTtBQUFBLE1BQ2YsZ0JBQWdCO0FBQUEsUUFDZixZQUFZO0FBQUEsUUFDWix1QkFBdUI7QUFBQSxRQUN2QixrQ0FBa0M7QUFBQSxNQUNuQztBQUFBLElBQ0QsQ0FBQztBQUVELFVBQU0sTUFBdUIsQ0FBQztBQUM5QixXQUFPLE9BQU8sQ0FBQyxXQUFXO0FBQ3pCLFVBQUksS0FBSyxNQUFNO0FBQUEsSUFDaEIsR0FBRyxNQUFNO0FBQUEsSUFBRSxHQUFHLENBQUMsVUFBVTtBQUN4QixhQUFPLEdBQUcsQ0FBQyxLQUFLO0FBQ2hCLFlBQU0sWUFBWSxJQUFJLElBQUksT0FBSyxLQUFLLFNBQVMsRUFBRSxZQUFZLENBQUM7QUFDNUQsYUFBTyxHQUFHLFVBQVUsUUFBUSxVQUFVLE1BQU0sSUFBSSx1QkFBdUIsS0FBSyxVQUFVLFNBQVMsQ0FBQyxFQUFFO0FBQ2xHLGFBQU8sR0FBRyxVQUFVLFFBQVEsWUFBWSxNQUFNLElBQUkseUJBQXlCLEtBQUssVUFBVSxTQUFTLENBQUMsRUFBRTtBQUN0RyxhQUFPLEdBQUcsVUFBVSxRQUFRLGFBQWEsTUFBTSxJQUFJLDBCQUEwQixLQUFLLFVBQVUsU0FBUyxDQUFDLEVBQUU7QUFDeEcsV0FBSztBQUFBLElBQ04sQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssMEJBQTBCLFNBQVUsTUFBa0I7QUFDMUQsVUFBTSxTQUFTLElBQUksaUJBQWlCO0FBQUEsTUFDbkMsTUFBTSxVQUFVO0FBQUEsTUFDaEIsZUFBZSxDQUFDO0FBQUEsTUFDaEIsb0JBQW9CO0FBQUEsUUFDbkIsSUFBSSxLQUFLLEtBQUssVUFBVSxLQUFLLEtBQUssV0FBVyxVQUFVLGlEQUFpRCxFQUFFLFFBQVEsVUFBVSxDQUFDLENBQUM7QUFBQSxRQUM5SCxJQUFJLEtBQUssS0FBSyxVQUFVLEtBQUssS0FBSyxXQUFXLFVBQVUsaURBQWlELEVBQUUsUUFBUSxZQUFZLFlBQVksQ0FBQyxDQUFDO0FBQUEsUUFDNUksSUFBSSxLQUFLLEtBQUssVUFBVSxLQUFLLEtBQUssV0FBVyxVQUFVLGlEQUFpRCxFQUFFLFFBQVEsWUFBWSxDQUFDLENBQUM7QUFBQSxNQUNqSTtBQUFBLE1BQ0EsYUFBYTtBQUFBLElBQ2QsQ0FBQztBQUVELFFBQUksUUFBUTtBQUNaLFFBQUk7QUFDSixXQUFPLE9BQU8sQ0FBQyxXQUFXO0FBQ3pCLFVBQUksUUFBUTtBQUNYO0FBQUEsTUFDRDtBQUNBLFlBQU07QUFBQSxJQUNQLEdBQUcsTUFBTTtBQUFBLElBQUUsR0FBRyxDQUFDLFVBQVU7QUFDeEIsYUFBTyxHQUFHLENBQUMsS0FBSztBQUNoQixhQUFPLFlBQVksT0FBTyxDQUFDO0FBQzNCLGFBQU8sWUFBWSxLQUFLLFNBQVMsSUFBSSxZQUFZLEdBQUcsWUFBWTtBQUNoRSxXQUFLO0FBQUEsSUFDTixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx5Q0FBeUMsU0FBVSxNQUFrQjtBQUN6RSxVQUFNLFNBQVMsSUFBSSxpQkFBaUI7QUFBQSxNQUNuQyxNQUFNLFVBQVU7QUFBQSxNQUNoQixlQUFlLENBQUM7QUFBQSxNQUNoQixvQkFBb0I7QUFBQSxRQUNuQixJQUFJLEtBQUssS0FBSyxVQUFVLEtBQUssS0FBSyxXQUFXLFVBQVUsaURBQWlELEVBQUUsUUFBUSxVQUFVLENBQUMsQ0FBQztBQUFBLFFBQzlILElBQUksS0FBSyxLQUFLLFVBQVUsS0FBSyxLQUFLLFdBQVcsVUFBVSxpREFBaUQsRUFBRSxRQUFRLFlBQVksWUFBWSxDQUFDLENBQUM7QUFBQSxRQUM1SSxJQUFJLEtBQUssS0FBSyxVQUFVLEtBQUssS0FBSyxXQUFXLFVBQVUsaURBQWlELEVBQUUsUUFBUSxZQUFZLENBQUMsQ0FBQztBQUFBLE1BQ2pJO0FBQUEsTUFDQSxhQUFhO0FBQUEsTUFDYixnQkFBZ0IsRUFBRSxZQUFZLEtBQUs7QUFBQSxJQUNwQyxDQUFDO0FBRUQsUUFBSSxRQUFRO0FBQ1osUUFBSTtBQUNKLFdBQU8sT0FBTyxDQUFDLFdBQVc7QUFDekIsVUFBSSxRQUFRO0FBQ1g7QUFBQSxNQUNEO0FBQ0EsWUFBTTtBQUFBLElBQ1AsR0FBRyxNQUFNO0FBQUEsSUFBRSxHQUFHLENBQUMsVUFBVTtBQUN4QixhQUFPLEdBQUcsQ0FBQyxLQUFLO0FBQ2hCLGFBQU8sWUFBWSxPQUFPLENBQUM7QUFDM0IsYUFBTyxZQUFZLEtBQUssU0FBUyxJQUFJLFlBQVksR0FBRyxVQUFVO0FBQzlELFdBQUs7QUFBQSxJQUNOLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHlDQUF5QyxTQUFVLE1BQWtCO0FBQ3pFLFVBQU0sU0FBUyxJQUFJLGlCQUFpQjtBQUFBLE1BQ25DLE1BQU0sVUFBVTtBQUFBLE1BQ2hCLGVBQWUsQ0FBQztBQUFBLE1BQ2hCLG9CQUFvQjtBQUFBLFFBQ25CLElBQUksS0FBSyxLQUFLLFVBQVUsS0FBSyxLQUFLLFdBQVcsVUFBVSxpREFBaUQsRUFBRSxRQUFRLFVBQVUsQ0FBQyxDQUFDO0FBQUEsUUFDOUgsSUFBSSxLQUFLLEtBQUssVUFBVSxLQUFLLEtBQUssV0FBVyxVQUFVLGlEQUFpRCxFQUFFLFFBQVEsWUFBWSxZQUFZLENBQUMsQ0FBQztBQUFBLFFBQzVJLElBQUksS0FBSyxLQUFLLFVBQVUsS0FBSyxLQUFLLFdBQVcsVUFBVSxpREFBaUQsRUFBRSxRQUFRLFlBQVksQ0FBQyxDQUFDO0FBQUEsTUFDakk7QUFBQSxNQUNBLGFBQWE7QUFBQSxNQUNiLGdCQUFnQixFQUFFLFlBQVksS0FBSztBQUFBLElBQ3BDLENBQUM7QUFFRCxRQUFJLFFBQVE7QUFDWixXQUFPLE9BQU8sQ0FBQyxXQUFXO0FBQ3pCLFVBQUksUUFBUTtBQUNYO0FBQUEsTUFDRDtBQUFBLElBQ0QsR0FBRyxNQUFNO0FBQUEsSUFBRSxHQUFHLENBQUMsVUFBVTtBQUN4QixhQUFPLEdBQUcsQ0FBQyxLQUFLO0FBQ2hCLGFBQU8sWUFBWSxPQUFPLENBQUM7QUFDM0IsV0FBSztBQUFBLElBQ04sQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUsscUNBQXFDLFNBQVUsTUFBa0I7QUFDckUsVUFBTSxTQUFTLElBQUksaUJBQWlCO0FBQUEsTUFDbkMsTUFBTSxVQUFVO0FBQUEsTUFDaEIsZUFBZTtBQUFBLFFBQ2QsRUFBRSxRQUFRLGtCQUFrQjtBQUFBLFFBQzVCLEVBQUUsUUFBUSxTQUFTLG1CQUFtQixXQUFXLEVBQUU7QUFBQSxNQUNwRDtBQUFBLE1BQ0EsYUFBYTtBQUFBLElBQ2QsQ0FBQztBQUVELFFBQUksUUFBUTtBQUNaLFdBQU8sT0FBTyxDQUFDLFdBQVc7QUFDekIsVUFBSSxRQUFRO0FBQ1g7QUFBQSxNQUNEO0FBQUEsSUFDRCxHQUFHLE1BQU07QUFBQSxJQUFFLEdBQUcsQ0FBQyxVQUFVO0FBQ3hCLGFBQU8sR0FBRyxDQUFDLEtBQUs7QUFDaEIsYUFBTyxZQUFZLE9BQU8sQ0FBQztBQUMzQixXQUFLO0FBQUEsSUFDTixDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQztBQUVELFdBQVcsY0FBYyxNQUFNO0FBRTlCLEdBQUMsU0FBUyxZQUFZLEtBQUssT0FBTyxNQUFNLDJCQUEyQixTQUFVLE1BQWtCO0FBQzlGLFVBQU0sUUFBUTtBQUNkLFVBQU0sUUFBUTtBQUVkLFVBQU0sU0FBUyxJQUFJLFdBQVc7QUFBQSxNQUM3QixNQUFNLFVBQVU7QUFBQSxNQUNoQixlQUFlO0FBQUEsTUFDZixnQkFBZ0IsRUFBRSxnQkFBZ0IsS0FBSztBQUFBLElBQ3hDLENBQUM7QUFDRCxVQUFNLE9BQU8sT0FBTyxhQUFhLGdCQUFnQjtBQUNqRCxXQUFPLFdBQVcsTUFBTSxRQUFRLENBQUMsTUFBTSxZQUFZO0FBQ2xELGFBQU8sWUFBWSxNQUFNLElBQUk7QUFDN0IsYUFBTyxlQUFlLFFBQVMsTUFBTSxJQUFJLEVBQUUsUUFBUSxLQUFLLEdBQUcsSUFBSSxPQUFPO0FBQ3RFLGFBQU8sZUFBZSxRQUFTLE1BQU0sSUFBSSxFQUFFLFFBQVEsS0FBSyxHQUFHLElBQUksT0FBTztBQUV0RSxZQUFNQSxVQUFTLElBQUksV0FBVztBQUFBLFFBQzdCLE1BQU0sVUFBVTtBQUFBLFFBQ2hCLGVBQWU7QUFBQSxRQUNmLGdCQUFnQixFQUFFLGdCQUFnQixLQUFLO0FBQUEsTUFDeEMsQ0FBQztBQUNELFlBQU0sT0FBT0EsUUFBTyxhQUFhLGdCQUFnQjtBQUNqRCxNQUFBQSxRQUFPLFdBQVcsTUFBTSxRQUFRLENBQUMsTUFBTSxZQUFZO0FBQ2xELGVBQU8sWUFBWSxNQUFNLElBQUk7QUFDN0IsZUFBTyxlQUFlLFFBQVMsTUFBTSxJQUFJLEVBQUUsUUFBUSxLQUFLLEdBQUcsSUFBSSxPQUFPO0FBQ3RFLGVBQU8sWUFBWSxRQUFTLE1BQU0sSUFBSSxFQUFFLFFBQVEsS0FBSyxHQUFHLElBQUksT0FBTztBQUNuRSxhQUFLO0FBQUEsTUFDTixDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsR0FBQyxTQUFTLFlBQVksS0FBSyxPQUFPLE1BQU0seUJBQXlCLFNBQVUsTUFBa0I7QUFDNUYsVUFBTSxnQkFBZ0M7QUFBQSxNQUNyQztBQUFBLFFBQ0MsUUFBUSxJQUFJLEtBQUssYUFBYTtBQUFBLFFBQzlCLGdCQUFnQixDQUFDO0FBQUEsVUFDaEIsU0FBUyxFQUFFLGdCQUFnQixLQUFLO0FBQUEsUUFDakMsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNEO0FBRUEsVUFBTSxRQUFRO0FBQ2QsVUFBTSxRQUFRO0FBRWQsVUFBTSxTQUFTLElBQUksV0FBVyxFQUFFLE1BQU0sVUFBVSxNQUFNLGNBQWMsQ0FBQztBQUNyRSxVQUFNLE9BQU8sT0FBTyxhQUFhLGNBQWMsQ0FBQyxDQUFDO0FBQ2pELFdBQU8sV0FBVyxNQUFNLFFBQVEsQ0FBQyxNQUFNLFlBQVk7QUFDbEQsYUFBTyxZQUFZLE1BQU0sSUFBSTtBQUM3QixhQUFPLGVBQWUsU0FBVSxLQUFLLEdBQUcsT0FBTztBQUMvQyxhQUFPLENBQUMsZUFBZSxTQUFVLEtBQUssR0FBRyxPQUFPO0FBQ2hELFdBQUs7QUFBQSxJQUNOLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxHQUFDLFNBQVMsWUFBWSxLQUFLLE9BQU8sTUFBTSxrQ0FBa0MsU0FBVSxNQUFrQjtBQUNyRyxVQUFNLFFBQVE7QUFDZCxVQUFNLFFBQVE7QUFDZCxVQUFNLFFBQVE7QUFFZCxVQUFNLFNBQVMsSUFBSSxXQUFXLEVBQUUsTUFBTSxVQUFVLE1BQU0sZUFBZSxtQkFBbUIsZ0JBQWdCLEVBQUUsZ0JBQWdCLEtBQUssRUFBRSxDQUFDO0FBQ2xJLFVBQU0sT0FBTyxPQUFPLGFBQWEsZ0JBQWdCO0FBQ2pELFdBQU8sV0FBVyxNQUFNLFFBQVEsQ0FBQyxNQUFNLFlBQVk7QUFDbEQsYUFBTyxZQUFZLE1BQU0sSUFBSTtBQUM3QixhQUFPLGVBQWUsUUFBUyxNQUFNLElBQUksRUFBRSxRQUFRLEtBQUssR0FBRyxJQUFJLE9BQU87QUFDdEUsYUFBTyxlQUFlLFFBQVMsTUFBTSxJQUFJLEVBQUUsUUFBUSxLQUFLLEdBQUcsSUFBSSxPQUFPO0FBQ3RFLGFBQU8sZUFBZSxRQUFTLE1BQU0sSUFBSSxFQUFFLFFBQVEsS0FBSyxHQUFHLElBQUksT0FBTztBQUV0RSxZQUFNQSxVQUFTLElBQUksV0FBVyxFQUFFLE1BQU0sVUFBVSxNQUFNLGVBQWUsbUJBQW1CLGdCQUFnQixFQUFFLHlCQUF5QixLQUFLLEVBQUUsQ0FBQztBQUMzSSxZQUFNLE9BQU9BLFFBQU8sYUFBYSxnQkFBZ0I7QUFDakQsTUFBQUEsUUFBTyxXQUFXLE1BQU0sUUFBUSxDQUFDLE1BQU0sWUFBWTtBQUNsRCxlQUFPLFlBQVksTUFBTSxJQUFJO0FBQzdCLGVBQU8sZUFBZSxRQUFTLE1BQU0sSUFBSSxFQUFFLFFBQVEsS0FBSyxHQUFHLElBQUksT0FBTztBQUN0RSxlQUFPLFlBQVksUUFBUyxNQUFNLElBQUksRUFBRSxRQUFRLEtBQUssR0FBRyxJQUFJLE9BQU87QUFDbkUsZUFBTyxZQUFZLFFBQVMsTUFBTSxJQUFJLEVBQUUsUUFBUSxLQUFLLEdBQUcsSUFBSSxPQUFPO0FBQ25FLGFBQUs7QUFBQSxNQUNOLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxHQUFDLFNBQVMsWUFBWSxLQUFLLE9BQU8sTUFBTSxvQ0FBb0MsU0FBVSxNQUFrQjtBQUN2RyxVQUFNLFFBQVE7QUFDZCxVQUFNLFFBQVE7QUFFZCxVQUFNLFNBQVMsSUFBSSxXQUFXLEVBQUUsTUFBTSxVQUFVLE1BQU0sZUFBZSxtQkFBbUIsZ0JBQWdCLEVBQUUseUJBQXlCLEtBQUssRUFBRSxDQUFDO0FBQzNJLFVBQU0sT0FBTyxPQUFPLGFBQWEsZ0JBQWdCO0FBQ2pELFdBQU8sV0FBVyxNQUFNLFFBQVEsQ0FBQyxNQUFNLFlBQVk7QUFDbEQsYUFBTyxZQUFZLE1BQU0sSUFBSTtBQUM3QixhQUFPLGVBQWUsUUFBUyxNQUFNLElBQUksRUFBRSxRQUFRLEtBQUssR0FBRyxJQUFJLE9BQU87QUFDdEUsYUFBTyxlQUFlLFFBQVMsTUFBTSxJQUFJLEVBQUUsUUFBUSxLQUFLLEdBQUcsSUFBSSxPQUFPO0FBRXRFLFlBQU1BLFVBQVMsSUFBSSxXQUFXLEVBQUUsTUFBTSxVQUFVLE1BQU0sZUFBZSxtQkFBbUIsZ0JBQWdCLEVBQUUseUJBQXlCLEtBQUssRUFBRSxDQUFDO0FBQzNJLFlBQU0sT0FBT0EsUUFBTyxhQUFhLGdCQUFnQjtBQUNqRCxNQUFBQSxRQUFPLFdBQVcsTUFBTSxRQUFRLENBQUMsTUFBTSxZQUFZO0FBQ2xELGVBQU8sWUFBWSxNQUFNLElBQUk7QUFDN0IsZUFBTyxlQUFlLFFBQVMsTUFBTSxJQUFJLEVBQUUsUUFBUSxLQUFLLEdBQUcsSUFBSSxPQUFPO0FBQ3RFLGVBQU8sWUFBWSxRQUFTLE1BQU0sSUFBSSxFQUFFLFFBQVEsS0FBSyxHQUFHLElBQUksT0FBTztBQUNuRSxhQUFLO0FBQUEsTUFDTixDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsR0FBQyxTQUFTLFlBQVksS0FBSyxPQUFPLE1BQU0sdUNBQXVDLFNBQVUsTUFBa0I7QUFDMUcsVUFBTSxRQUFRO0FBQ2QsVUFBTSxRQUFRO0FBRWQsVUFBTSxTQUFTLElBQUksV0FBVyxFQUFFLE1BQU0sVUFBVSxNQUFNLGVBQWUsbUJBQW1CLGdCQUFnQixFQUFFLDBCQUEwQixLQUFLLEVBQUUsQ0FBQztBQUM1SSxVQUFNLE9BQU8sT0FBTyxhQUFhLGdCQUFnQjtBQUNqRCxXQUFPLFdBQVcsTUFBTSxRQUFRLENBQUMsTUFBTSxZQUFZO0FBQ2xELGFBQU8sWUFBWSxNQUFNLElBQUk7QUFDN0IsYUFBTyxlQUFlLFFBQVMsTUFBTSxJQUFJLEVBQUUsUUFBUSxLQUFLLEdBQUcsSUFBSSxPQUFPO0FBQ3RFLGFBQU8sZUFBZSxRQUFTLE1BQU0sSUFBSSxFQUFFLFFBQVEsS0FBSyxHQUFHLElBQUksT0FBTztBQUV0RSxZQUFNQSxVQUFTLElBQUksV0FBVyxFQUFFLE1BQU0sVUFBVSxNQUFNLGVBQWUsbUJBQW1CLGdCQUFnQixFQUFFLDhCQUE4QixLQUFLLEVBQUUsQ0FBQztBQUNoSixZQUFNLE9BQU9BLFFBQU8sYUFBYSxnQkFBZ0I7QUFDakQsTUFBQUEsUUFBTyxXQUFXLE1BQU0sUUFBUSxDQUFDLE1BQU0sWUFBWTtBQUNsRCxlQUFPLFlBQVksTUFBTSxJQUFJO0FBQzdCLGVBQU8sZUFBZSxRQUFTLE1BQU0sSUFBSSxFQUFFLFFBQVEsS0FBSyxHQUFHLElBQUksT0FBTztBQUN0RSxlQUFPLFlBQVksUUFBUyxNQUFNLElBQUksRUFBRSxRQUFRLEtBQUssR0FBRyxJQUFJLE9BQU87QUFDbkUsYUFBSztBQUFBLE1BQ04sQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELEdBQUMsU0FBUyxZQUFZLEtBQUssT0FBTyxNQUFNLDZCQUE2QixTQUFVLE1BQWtCO0FBQ2hHLFVBQU0sUUFBUTtBQUNkLFVBQU0sUUFBUTtBQUVkLFVBQU0sU0FBUyxJQUFJLFdBQVcsRUFBRSxNQUFNLFVBQVUsTUFBTSxlQUFlLG1CQUFtQixnQkFBZ0IsRUFBRSxzQkFBc0IsS0FBSyxFQUFFLENBQUM7QUFDeEksVUFBTSxPQUFPLE9BQU8sYUFBYSxnQkFBZ0I7QUFDakQsV0FBTyxXQUFXLE1BQU0sUUFBUSxDQUFDLE1BQU0sWUFBWTtBQUNsRCxhQUFPLFlBQVksTUFBTSxJQUFJO0FBQzdCLGFBQU8sZUFBZSxRQUFTLE1BQU0sSUFBSSxFQUFFLFFBQVEsS0FBSyxHQUFHLElBQUksT0FBTztBQUN0RSxhQUFPLGVBQWUsUUFBUyxNQUFNLElBQUksRUFBRSxRQUFRLEtBQUssR0FBRyxJQUFJLE9BQU87QUFFdEUsWUFBTUEsVUFBUyxJQUFJLFdBQVcsRUFBRSxNQUFNLFVBQVUsTUFBTSxlQUFlLG1CQUFtQixnQkFBZ0IsRUFBRSxzQkFBc0IsS0FBSyxFQUFFLENBQUM7QUFDeEksWUFBTSxPQUFPQSxRQUFPLGFBQWEsZ0JBQWdCO0FBQ2pELE1BQUFBLFFBQU8sV0FBVyxNQUFNLFFBQVEsQ0FBQyxNQUFNLFlBQVk7QUFDbEQsZUFBTyxZQUFZLE1BQU0sSUFBSTtBQUM3QixlQUFPLGVBQWUsUUFBUyxNQUFNLElBQUksRUFBRSxRQUFRLEtBQUssR0FBRyxJQUFJLE9BQU87QUFDdEUsZUFBTyxZQUFZLFFBQVMsTUFBTSxJQUFJLEVBQUUsUUFBUSxLQUFLLEdBQUcsSUFBSSxPQUFPO0FBQ25FLGFBQUs7QUFBQSxNQUNOLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxHQUFDLFNBQVMsWUFBWSxLQUFLLE9BQU8sTUFBTSxzQ0FBc0MsU0FBVSxNQUFrQjtBQUN6RyxVQUFNLFVBQVU7QUFBQSxNQUNmO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQ0EsVUFBTSxXQUFXO0FBQUEsTUFDaEI7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUVBLFVBQU0sU0FBUyxJQUFJLFdBQVc7QUFBQSxNQUM3QixNQUFNLFVBQVU7QUFBQSxNQUNoQixlQUFlO0FBQUEsTUFDZixnQkFBZ0I7QUFBQSxRQUNmLDhCQUE4QjtBQUFBLFFBQzlCLHFCQUFxQjtBQUFBLFFBQ3JCLFdBQVc7QUFBQSxRQUNYLGNBQWM7QUFBQSxNQUNmO0FBQUEsSUFDRCxDQUFDO0FBQ0QsVUFBTSxPQUFPLE9BQU8sYUFBYSxnQkFBZ0I7QUFDakQsV0FBTyxXQUFXLE1BQU0sUUFBUSxDQUFDLE1BQU0sWUFBWTtBQUNsRCxhQUFPLFlBQVksTUFBTSxJQUFJO0FBQzdCLGlCQUFXLFVBQVUsU0FBUztBQUM3QixlQUFPLGVBQWUsUUFBUyxNQUFNLElBQUksRUFBRSxRQUFRLE1BQU0sR0FBRyxJQUFJLE9BQU87QUFBQSxNQUN4RTtBQUNBLGlCQUFXLFdBQVcsVUFBVTtBQUMvQixlQUFPLFlBQVksUUFBUyxNQUFNLElBQUksRUFBRSxRQUFRLE9BQU8sR0FBRyxJQUFJLE9BQU87QUFBQSxNQUN0RTtBQUNBLFdBQUs7QUFBQSxJQUNOLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxXQUFTLGVBQWUsV0FBbUIsT0FBMEI7QUFDcEUsVUFBTSxRQUFRLE9BQU8sTUFBTSxJQUFJO0FBQy9CLFdBQU8sTUFBTSxNQUFNLFVBQVEsTUFBTSxRQUFRLElBQUksS0FBSyxDQUFDO0FBQUEsRUFDcEQ7QUFDRCxDQUFDOyIsCiAgIm5hbWVzIjogWyJ3YWxrZXIiXQp9Cg==
