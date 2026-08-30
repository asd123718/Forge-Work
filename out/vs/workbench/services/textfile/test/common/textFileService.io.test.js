import assert from "assert";
import { snapshotToString, TextFileOperationResult, stringToSnapshot } from "../../common/textfiles.js";
import { URI } from "../../../../../base/common/uri.js";
import { join, basename } from "../../../../../base/common/path.js";
import { UTF16le, UTF8_with_bom, UTF16be, UTF8, UTF16le_BOM, UTF16be_BOM, UTF8_BOM } from "../../common/encoding.js";
import { bufferToStream, VSBuffer } from "../../../../../base/common/buffer.js";
import { createTextModel } from "../../../../../editor/test/common/testTextModel.js";
import { DefaultEndOfLine } from "../../../../../editor/common/model.js";
import { isWindows } from "../../../../../base/common/platform.js";
import { createTextBufferFactoryFromStream } from "../../../../../editor/common/model/textModel.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
function createSuite(params) {
  let service;
  let testDir = "";
  const { exists, stat, readFile, detectEncodingByBOM } = params;
  const disposables = new DisposableStore();
  setup(async () => {
    const result = await params.setup();
    service = result.service;
    testDir = result.testDir;
  });
  teardown(async () => {
    await params.teardown();
    disposables.clear();
  });
  test("create - no encoding - content empty", async () => {
    const resource = URI.file(join(testDir, "small_new.txt"));
    await service.create([{ resource }]);
    const res = await readFile(resource.fsPath);
    assert.strictEqual(
      res.byteLength,
      0
      /* no BOM */
    );
  });
  test("create - no encoding - content provided (string)", async () => {
    const resource = URI.file(join(testDir, "small_new.txt"));
    await service.create([{ resource, value: "Hello World" }]);
    const res = await readFile(resource.fsPath);
    assert.strictEqual(res.toString(), "Hello World");
    assert.strictEqual(res.byteLength, "Hello World".length);
  });
  test("create - no encoding - content provided (snapshot)", async () => {
    const resource = URI.file(join(testDir, "small_new.txt"));
    await service.create([{ resource, value: stringToSnapshot("Hello World") }]);
    const res = await readFile(resource.fsPath);
    assert.strictEqual(res.toString(), "Hello World");
    assert.strictEqual(res.byteLength, "Hello World".length);
  });
  test("create - UTF 16 LE - no content", async () => {
    const resource = URI.file(join(testDir, "small_new.utf16le"));
    await service.create([{ resource }]);
    assert.strictEqual(await exists(resource.fsPath), true);
    const detectedEncoding = await detectEncodingByBOM(resource.fsPath);
    assert.strictEqual(detectedEncoding, UTF16le);
    const res = await readFile(resource.fsPath);
    assert.strictEqual(res.byteLength, UTF16le_BOM.length);
  });
  test("create - UTF 16 LE - content provided", async () => {
    const resource = URI.file(join(testDir, "small_new.utf16le"));
    await service.create([{ resource, value: "Hello World" }]);
    assert.strictEqual(await exists(resource.fsPath), true);
    const detectedEncoding = await detectEncodingByBOM(resource.fsPath);
    assert.strictEqual(detectedEncoding, UTF16le);
    const res = await readFile(resource.fsPath);
    assert.strictEqual(res.byteLength, "Hello World".length * 2 + UTF16le_BOM.length);
  });
  test("create - UTF 16 BE - no content", async () => {
    const resource = URI.file(join(testDir, "small_new.utf16be"));
    await service.create([{ resource }]);
    assert.strictEqual(await exists(resource.fsPath), true);
    const detectedEncoding = await detectEncodingByBOM(resource.fsPath);
    assert.strictEqual(detectedEncoding, UTF16be);
    const res = await readFile(resource.fsPath);
    assert.strictEqual(res.byteLength, UTF16le_BOM.length);
  });
  test("create - UTF 16 BE - content provided", async () => {
    const resource = URI.file(join(testDir, "small_new.utf16be"));
    await service.create([{ resource, value: "Hello World" }]);
    assert.strictEqual(await exists(resource.fsPath), true);
    const detectedEncoding = await detectEncodingByBOM(resource.fsPath);
    assert.strictEqual(detectedEncoding, UTF16be);
    const res = await readFile(resource.fsPath);
    assert.strictEqual(res.byteLength, "Hello World".length * 2 + UTF16be_BOM.length);
  });
  test("create - UTF 8 BOM - no content", async () => {
    const resource = URI.file(join(testDir, "small_new.utf8bom"));
    await service.create([{ resource }]);
    assert.strictEqual(await exists(resource.fsPath), true);
    const detectedEncoding = await detectEncodingByBOM(resource.fsPath);
    assert.strictEqual(detectedEncoding, UTF8_with_bom);
    const res = await readFile(resource.fsPath);
    assert.strictEqual(res.byteLength, UTF8_BOM.length);
  });
  test("create - UTF 8 BOM - content provided", async () => {
    const resource = URI.file(join(testDir, "small_new.utf8bom"));
    await service.create([{ resource, value: "Hello World" }]);
    assert.strictEqual(await exists(resource.fsPath), true);
    const detectedEncoding = await detectEncodingByBOM(resource.fsPath);
    assert.strictEqual(detectedEncoding, UTF8_with_bom);
    const res = await readFile(resource.fsPath);
    assert.strictEqual(res.byteLength, "Hello World".length + UTF8_BOM.length);
  });
  function createTextModelSnapshot(text, preserveBOM) {
    const textModel = disposables.add(createTextModel(text));
    const snapshot = textModel.createSnapshot(preserveBOM);
    return snapshot;
  }
  test("create - UTF 8 BOM - empty content - snapshot", async () => {
    const resource = URI.file(join(testDir, "small_new.utf8bom"));
    await service.create([{ resource, value: createTextModelSnapshot("") }]);
    assert.strictEqual(await exists(resource.fsPath), true);
    const detectedEncoding = await detectEncodingByBOM(resource.fsPath);
    assert.strictEqual(detectedEncoding, UTF8_with_bom);
    const res = await readFile(resource.fsPath);
    assert.strictEqual(res.byteLength, UTF8_BOM.length);
  });
  test("create - UTF 8 BOM - content provided - snapshot", async () => {
    const resource = URI.file(join(testDir, "small_new.utf8bom"));
    await service.create([{ resource, value: createTextModelSnapshot("Hello World") }]);
    assert.strictEqual(await exists(resource.fsPath), true);
    const detectedEncoding = await detectEncodingByBOM(resource.fsPath);
    assert.strictEqual(detectedEncoding, UTF8_with_bom);
    const res = await readFile(resource.fsPath);
    assert.strictEqual(res.byteLength, "Hello World".length + UTF8_BOM.length);
  });
  test("write - use encoding (UTF 16 BE) - small content as string", async () => {
    await testEncoding(URI.file(join(testDir, "small.txt")), UTF16be, "Hello\nWorld", "Hello\nWorld");
  });
  test("write - use encoding (UTF 16 BE) - small content as snapshot", async () => {
    await testEncoding(URI.file(join(testDir, "small.txt")), UTF16be, createTextModelSnapshot("Hello\nWorld"), "Hello\nWorld");
  });
  test("write - use encoding (UTF 16 BE) - large content as string", async () => {
    await testEncoding(URI.file(join(testDir, "lorem.txt")), UTF16be, "Hello\nWorld", "Hello\nWorld");
  });
  test("write - use encoding (UTF 16 BE) - large content as snapshot", async () => {
    await testEncoding(URI.file(join(testDir, "lorem.txt")), UTF16be, createTextModelSnapshot("Hello\nWorld"), "Hello\nWorld");
  });
  async function testEncoding(resource, encoding, content, expectedContent) {
    await service.write(resource, content, { encoding });
    const detectedEncoding = await detectEncodingByBOM(resource.fsPath);
    assert.strictEqual(detectedEncoding, encoding);
    const resolved = await service.readStream(resource);
    assert.strictEqual(resolved.encoding, encoding);
    const textBuffer = disposables.add(resolved.value.create(isWindows ? DefaultEndOfLine.CRLF : DefaultEndOfLine.LF).textBuffer);
    assert.strictEqual(snapshotToString(textBuffer.createSnapshot(false)), expectedContent);
  }
  test("write - use encoding (cp1252)", async () => {
    const filePath = join(testDir, "some_cp1252.txt");
    const contents = await readFile(filePath, "utf8");
    const eol = /\r\n/.test(contents) ? "\r\n" : "\n";
    await testEncodingKeepsData(URI.file(filePath), "cp1252", ['ObjectCount = LoadObjects("\xD6ffentlicher Ordner");', "", 'Private = "Pers\xF6nliche Information"', ""].join(eol));
  });
  test("write - use encoding (shiftjis)", async () => {
    await testEncodingKeepsData(URI.file(join(testDir, "some_shiftjis.txt")), "shiftjis", "\u4E2D\u6587abc");
  });
  test("write - use encoding (gbk)", async () => {
    await testEncodingKeepsData(URI.file(join(testDir, "some_gbk.txt")), "gbk", "\u4E2D\u56FDabc");
  });
  test("write - use encoding (cyrillic)", async () => {
    await testEncodingKeepsData(URI.file(join(testDir, "some_cyrillic.txt")), "cp866", "\u0410\u0411\u0412\u0413\u0414\u0415\u0416\u0417\u0418\u0419\u041A\u041B\u041C\u041D\u041E\u041F\u0420\u0421\u0422\u0423\u0424\u0425\u0426\u0427\u0428\u0429\u042A\u042B\u042C\u042D\u042E\u042F\u0430\u0431\u0432\u0433\u0434\u0435\u0436\u0437\u0438\u0439\u043A\u043B\u043C\u043D\u043E\u043F\u0440\u0441\u0442\u0443\u0444\u0445\u0446\u0447\u0448\u0449\u044A\u044B\u044C\u044D\u044E\u044F");
  });
  test("write - use encoding (big5)", async () => {
    await testEncodingKeepsData(URI.file(join(testDir, "some_big5.txt")), "cp950", "\u4E2D\u6587abc");
  });
  async function testEncodingKeepsData(resource, encoding, expected) {
    let resolved = await service.readStream(resource, { encoding });
    const textBuffer = disposables.add(resolved.value.create(isWindows ? DefaultEndOfLine.CRLF : DefaultEndOfLine.LF).textBuffer);
    const content = snapshotToString(textBuffer.createSnapshot(false));
    assert.strictEqual(content, expected);
    await service.write(resource, content, { encoding });
    resolved = await service.readStream(resource, { encoding });
    const textBuffer2 = disposables.add(resolved.value.create(DefaultEndOfLine.CRLF).textBuffer);
    assert.strictEqual(snapshotToString(textBuffer2.createSnapshot(false)), content);
    await service.write(resource, createTextModelSnapshot(content), { encoding });
    resolved = await service.readStream(resource, { encoding });
    const textBuffer3 = disposables.add(resolved.value.create(DefaultEndOfLine.CRLF).textBuffer);
    assert.strictEqual(snapshotToString(textBuffer3.createSnapshot(false)), content);
  }
  test("write - no encoding - content as string", async () => {
    const resource = URI.file(join(testDir, "small.txt"));
    const content = (await readFile(resource.fsPath)).toString();
    await service.write(resource, content);
    const resolved = await service.readStream(resource);
    assert.strictEqual(resolved.value.getFirstLineText(999999), content);
  });
  test("write - no encoding - content as snapshot", async () => {
    const resource = URI.file(join(testDir, "small.txt"));
    const content = (await readFile(resource.fsPath)).toString();
    await service.write(resource, createTextModelSnapshot(content));
    const resolved = await service.readStream(resource);
    assert.strictEqual(resolved.value.getFirstLineText(999999), content);
  });
  test("write - encoding preserved (UTF 16 LE) - content as string", async () => {
    const resource = URI.file(join(testDir, "some_utf16le.css"));
    const resolved = await service.readStream(resource);
    assert.strictEqual(resolved.encoding, UTF16le);
    await testEncoding(URI.file(join(testDir, "some_utf16le.css")), UTF16le, "Hello\nWorld", "Hello\nWorld");
  });
  test("write - encoding preserved (UTF 16 LE) - content as snapshot", async () => {
    const resource = URI.file(join(testDir, "some_utf16le.css"));
    const resolved = await service.readStream(resource);
    assert.strictEqual(resolved.encoding, UTF16le);
    await testEncoding(URI.file(join(testDir, "some_utf16le.css")), UTF16le, createTextModelSnapshot("Hello\nWorld"), "Hello\nWorld");
  });
  test("write - UTF8 variations - content as string", async () => {
    const resource = URI.file(join(testDir, "index.html"));
    let detectedEncoding = await detectEncodingByBOM(resource.fsPath);
    assert.strictEqual(detectedEncoding, null);
    const content = (await readFile(resource.fsPath)).toString() + "updates";
    await service.write(resource, content, { encoding: UTF8_with_bom });
    detectedEncoding = await detectEncodingByBOM(resource.fsPath);
    assert.strictEqual(detectedEncoding, UTF8_with_bom);
    await service.write(resource, content, { encoding: UTF8_with_bom });
    detectedEncoding = await detectEncodingByBOM(resource.fsPath);
    assert.strictEqual(detectedEncoding, UTF8_with_bom);
    await service.write(resource, content, { encoding: UTF8 });
    detectedEncoding = await detectEncodingByBOM(resource.fsPath);
    assert.strictEqual(detectedEncoding, null);
    await service.write(resource, content, { encoding: UTF8 });
    detectedEncoding = await detectEncodingByBOM(resource.fsPath);
    assert.strictEqual(detectedEncoding, null);
  });
  test("write - UTF8 variations - content as snapshot", async () => {
    const resource = URI.file(join(testDir, "index.html"));
    let detectedEncoding = await detectEncodingByBOM(resource.fsPath);
    assert.strictEqual(detectedEncoding, null);
    const model = disposables.add(createTextModel((await readFile(resource.fsPath)).toString() + "updates"));
    await service.write(resource, model.createSnapshot(), { encoding: UTF8_with_bom });
    detectedEncoding = await detectEncodingByBOM(resource.fsPath);
    assert.strictEqual(detectedEncoding, UTF8_with_bom);
    await service.write(resource, model.createSnapshot(), { encoding: UTF8_with_bom });
    detectedEncoding = await detectEncodingByBOM(resource.fsPath);
    assert.strictEqual(detectedEncoding, UTF8_with_bom);
    await service.write(resource, model.createSnapshot(), { encoding: UTF8 });
    detectedEncoding = await detectEncodingByBOM(resource.fsPath);
    assert.strictEqual(detectedEncoding, null);
    await service.write(resource, model.createSnapshot(), { encoding: UTF8 });
    detectedEncoding = await detectEncodingByBOM(resource.fsPath);
    assert.strictEqual(detectedEncoding, null);
  });
  test("write - preserve UTF8 BOM - content as string", async () => {
    const resource = URI.file(join(testDir, "some_utf8_bom.txt"));
    let detectedEncoding = await detectEncodingByBOM(resource.fsPath);
    assert.strictEqual(detectedEncoding, UTF8_with_bom);
    await service.write(resource, "Hello World", { encoding: detectedEncoding });
    detectedEncoding = await detectEncodingByBOM(resource.fsPath);
    assert.strictEqual(detectedEncoding, UTF8_with_bom);
  });
  test("write - ensure BOM in empty file - content as string", async () => {
    const resource = URI.file(join(testDir, "small.txt"));
    await service.write(resource, "", { encoding: UTF8_with_bom });
    const detectedEncoding = await detectEncodingByBOM(resource.fsPath);
    assert.strictEqual(detectedEncoding, UTF8_with_bom);
  });
  test("write - ensure BOM in empty file - content as snapshot", async () => {
    const resource = URI.file(join(testDir, "small.txt"));
    await service.write(resource, createTextModelSnapshot(""), { encoding: UTF8_with_bom });
    const detectedEncoding = await detectEncodingByBOM(resource.fsPath);
    assert.strictEqual(detectedEncoding, UTF8_with_bom);
  });
  test("readStream - small text", async () => {
    const resource = URI.file(join(testDir, "small.txt"));
    await testReadStream(resource);
  });
  test("readStream - large text", async () => {
    const resource = URI.file(join(testDir, "lorem.txt"));
    await testReadStream(resource);
  });
  async function testReadStream(resource) {
    const result = await service.readStream(resource);
    assert.strictEqual(result.name, basename(resource.fsPath));
    assert.strictEqual(result.size, (await stat(resource.fsPath)).size);
    const content = (await readFile(resource.fsPath)).toString();
    const textBuffer = disposables.add(result.value.create(DefaultEndOfLine.LF).textBuffer);
    assert.strictEqual(
      snapshotToString(textBuffer.createSnapshot(false)),
      snapshotToString(createTextModelSnapshot(content, false))
    );
  }
  test("read - small text", async () => {
    const resource = URI.file(join(testDir, "small.txt"));
    await testRead(resource);
  });
  test("read - large text", async () => {
    const resource = URI.file(join(testDir, "lorem.txt"));
    await testRead(resource);
  });
  async function testRead(resource) {
    const result = await service.read(resource);
    assert.strictEqual(result.name, basename(resource.fsPath));
    assert.strictEqual(result.size, (await stat(resource.fsPath)).size);
    assert.strictEqual(result.value, (await readFile(resource.fsPath)).toString());
  }
  test("readStream - encoding picked up (CP1252)", async () => {
    const resource = URI.file(join(testDir, "some_small_cp1252.txt"));
    const encoding = "windows1252";
    const result = await service.readStream(resource, { encoding });
    assert.strictEqual(result.encoding, encoding);
    assert.strictEqual(result.value.getFirstLineText(999999), 'Private = "Pers\xF6nliche\xDF Information"');
  });
  test("read - encoding picked up (CP1252)", async () => {
    const resource = URI.file(join(testDir, "some_small_cp1252.txt"));
    const encoding = "windows1252";
    const result = await service.read(resource, { encoding });
    assert.strictEqual(result.encoding, encoding);
    assert.strictEqual(result.value, 'Private = "Pers\xF6nliche\xDF Information"');
  });
  test("read - encoding picked up (binary)", async () => {
    const resource = URI.file(join(testDir, "some_small_cp1252.txt"));
    const encoding = "binary";
    const result = await service.read(resource, { encoding });
    assert.strictEqual(result.encoding, encoding);
    assert.strictEqual(result.value, 'Private = "Pers\xF6nliche\xDF Information"');
  });
  test("read - encoding picked up (base64)", async () => {
    const resource = URI.file(join(testDir, "some_small_cp1252.txt"));
    const encoding = "base64";
    const result = await service.read(resource, { encoding });
    assert.strictEqual(result.encoding, encoding);
    assert.strictEqual(result.value, btoa('Private = "Pers\xF6nliche\xDF Information"'));
  });
  test("readStream - user overrides BOM", async () => {
    const resource = URI.file(join(testDir, "some_utf16le.css"));
    const result = await service.readStream(resource, { encoding: "windows1252" });
    assert.strictEqual(result.encoding, "windows1252");
  });
  test("readStream - BOM removed", async () => {
    const resource = URI.file(join(testDir, "some_utf8_bom.txt"));
    const result = await service.readStream(resource);
    assert.strictEqual(result.value.getFirstLineText(999999), "This is some UTF 8 with BOM file.");
  });
  test("readStream - invalid encoding", async () => {
    const resource = URI.file(join(testDir, "index.html"));
    const result = await service.readStream(resource, { encoding: "superduper" });
    assert.strictEqual(result.encoding, "utf8");
  });
  test("readStream - encoding override", async () => {
    const resource = URI.file(join(testDir, "some.utf16le"));
    const result = await service.readStream(resource, { encoding: "windows1252" });
    assert.strictEqual(result.encoding, "utf16le");
    assert.strictEqual(result.value.getFirstLineText(999999), "This is some UTF 16 with BOM file.");
  });
  test("readStream - large Big5", async () => {
    await testLargeEncoding("big5", "\u4E2D\u6587abc");
  });
  test("readStream - large CP1252", async () => {
    await testLargeEncoding("cp1252", "\xF6\xE4\xFC\xDF");
  });
  test("readStream - large Cyrillic", async () => {
    await testLargeEncoding("cp866", "\u0410\u0411\u0412\u0413\u0414\u0415\u0416\u0417\u0418\u0419\u041A\u041B\u041C\u041D\u041E\u041F\u0420\u0421\u0422\u0423\u0424\u0425\u0426\u0427\u0428\u0429\u042A\u042B\u042C\u042D\u042E\u042F\u0430\u0431\u0432\u0433\u0434\u0435\u0436\u0437\u0438\u0439\u043A\u043B\u043C\u043D\u043E\u043F\u0440\u0441\u0442\u0443\u0444\u0445\u0446\u0447\u0448\u0449\u044A\u044B\u044C\u044D\u044E\u044F");
  });
  test("readStream - large GBK", async () => {
    await testLargeEncoding("gbk", "\u4E2D\u56FDabc");
  });
  test("readStream - large ShiftJIS", async () => {
    await testLargeEncoding("shiftjis", "\u4E2D\u6587abc");
  });
  test("readStream - large UTF8 BOM", async () => {
    await testLargeEncoding("utf8bom", "\xF6\xE4\xFC\xDF");
  });
  test("readStream - large UTF16 LE", async () => {
    await testLargeEncoding("utf16le", "\xF6\xE4\xFC\xDF");
  });
  test("readStream - large UTF16 BE", async () => {
    await testLargeEncoding("utf16be", "\xF6\xE4\xFC\xDF");
  });
  async function testLargeEncoding(encoding, needle) {
    const resource = URI.file(join(testDir, `lorem_${encoding}.txt`));
    const result = await service.readStream(resource, { encoding });
    assert.strictEqual(result.encoding, encoding);
    const textBuffer = disposables.add(result.value.create(DefaultEndOfLine.LF).textBuffer);
    let contents = snapshotToString(textBuffer.createSnapshot(false));
    assert.strictEqual(contents.indexOf(needle), 0);
    assert.ok(contents.indexOf(needle, 10) > 0);
    const rawFile = await params.readFile(resource.fsPath);
    let rawFileVSBuffer;
    if (rawFile instanceof VSBuffer) {
      rawFileVSBuffer = rawFile;
    } else {
      rawFileVSBuffer = VSBuffer.wrap(rawFile);
    }
    const factory = await createTextBufferFactoryFromStream(await service.getDecodedStream(resource, bufferToStream(rawFileVSBuffer), { encoding }));
    const textBuffer2 = disposables.add(factory.create(DefaultEndOfLine.LF).textBuffer);
    contents = snapshotToString(textBuffer2.createSnapshot(false));
    assert.strictEqual(contents.indexOf(needle), 0);
    assert.ok(contents.indexOf(needle, 10) > 0);
  }
  test("readStream - UTF16 LE (no BOM)", async () => {
    const resource = URI.file(join(testDir, "utf16_le_nobom.txt"));
    const result = await service.readStream(resource);
    assert.strictEqual(result.encoding, "utf16le");
  });
  test("readStream - UTF16 BE (no BOM)", async () => {
    const resource = URI.file(join(testDir, "utf16_be_nobom.txt"));
    const result = await service.readStream(resource);
    assert.strictEqual(result.encoding, "utf16be");
  });
  test("readStream - autoguessEncoding", async () => {
    const resource = URI.file(join(testDir, "some_cp1252.txt"));
    const result = await service.readStream(resource, { autoGuessEncoding: true });
    assert.strictEqual(result.encoding, "windows1252");
  });
  test("readStream - autoguessEncoding (candidateGuessEncodings)", async () => {
    const resource = URI.file(join(testDir, "some.shiftjis.1.txt"));
    const result = await service.readStream(resource, { autoGuessEncoding: true, candidateGuessEncodings: ["utf-8", "shiftjis", "euc-jp"] });
    assert.strictEqual(result.encoding, "shiftjis");
  });
  test("readStream - autoguessEncoding (candidateGuessEncodings is Empty)", async () => {
    const resource = URI.file(join(testDir, "some_cp1252.txt"));
    const result = await service.readStream(resource, { autoGuessEncoding: true, candidateGuessEncodings: [] });
    assert.strictEqual(result.encoding, "windows1252");
  });
  test("readStream - FILE_IS_BINARY", async () => {
    const resource = URI.file(join(testDir, "binary.txt"));
    let error = void 0;
    try {
      await service.readStream(resource, { acceptTextOnly: true });
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.strictEqual(error.textFileOperationResult, TextFileOperationResult.FILE_IS_BINARY);
    const result = await service.readStream(URI.file(join(testDir, "small.txt")), { acceptTextOnly: true });
    assert.strictEqual(result.name, "small.txt");
  });
  test("read - FILE_IS_BINARY", async () => {
    const resource = URI.file(join(testDir, "binary.txt"));
    let error = void 0;
    try {
      await service.read(resource, { acceptTextOnly: true });
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.strictEqual(error.textFileOperationResult, TextFileOperationResult.FILE_IS_BINARY);
    const result = await service.read(URI.file(join(testDir, "small.txt")), { acceptTextOnly: true });
    assert.strictEqual(result.name, "small.txt");
  });
}
export {
  createSuite as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx0ZXh0ZmlsZVxcdGVzdFxcY29tbW9uXFx0ZXh0RmlsZVNlcnZpY2UuaW8udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IElUZXh0RmlsZVNlcnZpY2UsIHNuYXBzaG90VG9TdHJpbmcsIFRleHRGaWxlT3BlcmF0aW9uRXJyb3IsIFRleHRGaWxlT3BlcmF0aW9uUmVzdWx0LCBzdHJpbmdUb1NuYXBzaG90IH0gZnJvbSAnLi4vLi4vY29tbW9uL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgam9pbiwgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IFVURjE2bGUsIFVURjhfd2l0aF9ib20sIFVURjE2YmUsIFVURjgsIFVURjE2bGVfQk9NLCBVVEYxNmJlX0JPTSwgVVRGOF9CT00gfSBmcm9tICcuLi8uLi9jb21tb24vZW5jb2RpbmcuanMnO1xuaW1wb3J0IHsgYnVmZmVyVG9TdHJlYW0sIFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci90ZXN0L2NvbW1vbi90ZXN0VGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IElUZXh0U25hcHNob3QsIERlZmF1bHRFbmRPZkxpbmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRCdWZmZXJGYWN0b3J5RnJvbVN0cmVhbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwvdGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUGFyYW1zIHtcblx0c2V0dXAoKTogUHJvbWlzZTx7XG5cdFx0c2VydmljZTogSVRleHRGaWxlU2VydmljZTtcblx0XHR0ZXN0RGlyOiBzdHJpbmc7XG5cdH0+O1xuXHR0ZWFyZG93bigpOiBQcm9taXNlPHZvaWQ+O1xuXG5cdGV4aXN0cyhmc1BhdGg6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj47XG5cdHN0YXQoZnNQYXRoOiBzdHJpbmcpOiBQcm9taXNlPHsgc2l6ZTogbnVtYmVyIH0+O1xuXHRyZWFkRmlsZShmc1BhdGg6IHN0cmluZyk6IFByb21pc2U8VlNCdWZmZXIgfCBCdWZmZXI+O1xuXHRyZWFkRmlsZShmc1BhdGg6IHN0cmluZywgZW5jb2Rpbmc6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPjtcblx0cmVhZEZpbGUoZnNQYXRoOiBzdHJpbmcsIGVuY29kaW5nPzogc3RyaW5nKTogUHJvbWlzZTxWU0J1ZmZlciB8IEJ1ZmZlciB8IHN0cmluZz47XG5cdGRldGVjdEVuY29kaW5nQnlCT00oZnNQYXRoOiBzdHJpbmcpOiBQcm9taXNlPHR5cGVvZiBVVEYxNmJlIHwgdHlwZW9mIFVURjE2bGUgfCB0eXBlb2YgVVRGOF93aXRoX2JvbSB8IG51bGw+O1xufVxuXG4vKipcbiAqIEFsbG93cyB1cyB0byByZXVzZSB0ZXN0IHN1aXRlIGFjcm9zcyBkaWZmZXJlbnQgZW52aXJvbm1lbnRzLlxuICpcbiAqIEl0IGludHJvZHVjZXMgYSBiaXQgb2YgY29tcGxleGl0eSB3aXRoIHNldHVwIGFuZCB0ZWFyZG93biwgaG93ZXZlclxuICogaXQgaGVscHMgdXMgdG8gZW5zdXJlIHRoYXQgdGVzdHMgYXJlIGFkZGVkIGZvciBhbGwgZW52aXJvbm1lbnRzIGF0IG9uY2UsXG4gKiBoZW5jZSBoZWxwcyB1cyBjYXRjaCBidWdzIGJldHRlci5cbiAqL1xuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gY3JlYXRlU3VpdGUocGFyYW1zOiBQYXJhbXMpIHtcblx0bGV0IHNlcnZpY2U6IElUZXh0RmlsZVNlcnZpY2U7XG5cdGxldCB0ZXN0RGlyID0gJyc7XG5cdGNvbnN0IHsgZXhpc3RzLCBzdGF0LCByZWFkRmlsZSwgZGV0ZWN0RW5jb2RpbmdCeUJPTSB9ID0gcGFyYW1zO1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcGFyYW1zLnNldHVwKCk7XG5cdFx0c2VydmljZSA9IHJlc3VsdC5zZXJ2aWNlO1xuXHRcdHRlc3REaXIgPSByZXN1bHQudGVzdERpcjtcblx0fSk7XG5cblx0dGVhcmRvd24oYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHBhcmFtcy50ZWFyZG93bigpO1xuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZSAtIG5vIGVuY29kaW5nIC0gY29udGVudCBlbXB0eScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NtYWxsX25ldy50eHQnKSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZShbeyByZXNvdXJjZSB9XSk7XG5cblx0XHRjb25zdCByZXMgPSBhd2FpdCByZWFkRmlsZShyZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuYnl0ZUxlbmd0aCwgMCAvKiBubyBCT00gKi8pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGUgLSBubyBlbmNvZGluZyAtIGNvbnRlbnQgcHJvdmlkZWQgKHN0cmluZyknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdzbWFsbF9uZXcudHh0JykpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5jcmVhdGUoW3sgcmVzb3VyY2UsIHZhbHVlOiAnSGVsbG8gV29ybGQnIH1dKTtcblxuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IHJlYWRGaWxlKHJlc291cmNlLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy50b1N0cmluZygpLCAnSGVsbG8gV29ybGQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmJ5dGVMZW5ndGgsICdIZWxsbyBXb3JsZCcubGVuZ3RoKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlIC0gbm8gZW5jb2RpbmcgLSBjb250ZW50IHByb3ZpZGVkIChzbmFwc2hvdCknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdzbWFsbF9uZXcudHh0JykpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5jcmVhdGUoW3sgcmVzb3VyY2UsIHZhbHVlOiBzdHJpbmdUb1NuYXBzaG90KCdIZWxsbyBXb3JsZCcpIH1dKTtcblxuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IHJlYWRGaWxlKHJlc291cmNlLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy50b1N0cmluZygpLCAnSGVsbG8gV29ybGQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmJ5dGVMZW5ndGgsICdIZWxsbyBXb3JsZCcubGVuZ3RoKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlIC0gVVRGIDE2IExFIC0gbm8gY29udGVudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NtYWxsX25ldy51dGYxNmxlJykpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5jcmVhdGUoW3sgcmVzb3VyY2UgfV0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGV4aXN0cyhyZXNvdXJjZS5mc1BhdGgpLCB0cnVlKTtcblxuXHRcdGNvbnN0IGRldGVjdGVkRW5jb2RpbmcgPSBhd2FpdCBkZXRlY3RFbmNvZGluZ0J5Qk9NKHJlc291cmNlLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRldGVjdGVkRW5jb2RpbmcsIFVURjE2bGUpO1xuXG5cdFx0Y29uc3QgcmVzID0gYXdhaXQgcmVhZEZpbGUocmVzb3VyY2UuZnNQYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmJ5dGVMZW5ndGgsIFVURjE2bGVfQk9NLmxlbmd0aCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZSAtIFVURiAxNiBMRSAtIGNvbnRlbnQgcHJvdmlkZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdzbWFsbF9uZXcudXRmMTZsZScpKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY3JlYXRlKFt7IHJlc291cmNlLCB2YWx1ZTogJ0hlbGxvIFdvcmxkJyB9XSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgZXhpc3RzKHJlc291cmNlLmZzUGF0aCksIHRydWUpO1xuXG5cdFx0Y29uc3QgZGV0ZWN0ZWRFbmNvZGluZyA9IGF3YWl0IGRldGVjdEVuY29kaW5nQnlCT00ocmVzb3VyY2UuZnNQYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGV0ZWN0ZWRFbmNvZGluZywgVVRGMTZsZSk7XG5cblx0XHRjb25zdCByZXMgPSBhd2FpdCByZWFkRmlsZShyZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuYnl0ZUxlbmd0aCwgJ0hlbGxvIFdvcmxkJy5sZW5ndGggKiAyIC8qIFVURjE2IDJieXRlcyBwZXIgY2hhciAqLyArIFVURjE2bGVfQk9NLmxlbmd0aCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZSAtIFVURiAxNiBCRSAtIG5vIGNvbnRlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdzbWFsbF9uZXcudXRmMTZiZScpKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY3JlYXRlKFt7IHJlc291cmNlIH1dKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBleGlzdHMocmVzb3VyY2UuZnNQYXRoKSwgdHJ1ZSk7XG5cblx0XHRjb25zdCBkZXRlY3RlZEVuY29kaW5nID0gYXdhaXQgZGV0ZWN0RW5jb2RpbmdCeUJPTShyZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXRlY3RlZEVuY29kaW5nLCBVVEYxNmJlKTtcblxuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IHJlYWRGaWxlKHJlc291cmNlLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5ieXRlTGVuZ3RoLCBVVEYxNmxlX0JPTS5sZW5ndGgpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGUgLSBVVEYgMTYgQkUgLSBjb250ZW50IHByb3ZpZGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnc21hbGxfbmV3LnV0ZjE2YmUnKSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZShbeyByZXNvdXJjZSwgdmFsdWU6ICdIZWxsbyBXb3JsZCcgfV0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGV4aXN0cyhyZXNvdXJjZS5mc1BhdGgpLCB0cnVlKTtcblxuXHRcdGNvbnN0IGRldGVjdGVkRW5jb2RpbmcgPSBhd2FpdCBkZXRlY3RFbmNvZGluZ0J5Qk9NKHJlc291cmNlLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRldGVjdGVkRW5jb2RpbmcsIFVURjE2YmUpO1xuXG5cdFx0Y29uc3QgcmVzID0gYXdhaXQgcmVhZEZpbGUocmVzb3VyY2UuZnNQYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmJ5dGVMZW5ndGgsICdIZWxsbyBXb3JsZCcubGVuZ3RoICogMiAvKiBVVEYxNiAyYnl0ZXMgcGVyIGNoYXIgKi8gKyBVVEYxNmJlX0JPTS5sZW5ndGgpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGUgLSBVVEYgOCBCT00gLSBubyBjb250ZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnc21hbGxfbmV3LnV0Zjhib20nKSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZShbeyByZXNvdXJjZSB9XSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgZXhpc3RzKHJlc291cmNlLmZzUGF0aCksIHRydWUpO1xuXG5cdFx0Y29uc3QgZGV0ZWN0ZWRFbmNvZGluZyA9IGF3YWl0IGRldGVjdEVuY29kaW5nQnlCT00ocmVzb3VyY2UuZnNQYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGV0ZWN0ZWRFbmNvZGluZywgVVRGOF93aXRoX2JvbSk7XG5cblx0XHRjb25zdCByZXMgPSBhd2FpdCByZWFkRmlsZShyZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuYnl0ZUxlbmd0aCwgVVRGOF9CT00ubGVuZ3RoKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlIC0gVVRGIDggQk9NIC0gY29udGVudCBwcm92aWRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NtYWxsX25ldy51dGY4Ym9tJykpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5jcmVhdGUoW3sgcmVzb3VyY2UsIHZhbHVlOiAnSGVsbG8gV29ybGQnIH1dKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBleGlzdHMocmVzb3VyY2UuZnNQYXRoKSwgdHJ1ZSk7XG5cblx0XHRjb25zdCBkZXRlY3RlZEVuY29kaW5nID0gYXdhaXQgZGV0ZWN0RW5jb2RpbmdCeUJPTShyZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXRlY3RlZEVuY29kaW5nLCBVVEY4X3dpdGhfYm9tKTtcblxuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IHJlYWRGaWxlKHJlc291cmNlLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5ieXRlTGVuZ3RoLCAnSGVsbG8gV29ybGQnLmxlbmd0aCArIFVURjhfQk9NLmxlbmd0aCk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVRleHRNb2RlbFNuYXBzaG90KHRleHQ6IHN0cmluZywgcHJlc2VydmVCT00/OiBib29sZWFuKTogSVRleHRTbmFwc2hvdCB7XG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbCh0ZXh0KSk7XG5cdFx0Y29uc3Qgc25hcHNob3QgPSB0ZXh0TW9kZWwuY3JlYXRlU25hcHNob3QocHJlc2VydmVCT00pO1xuXG5cdFx0cmV0dXJuIHNuYXBzaG90O1xuXHR9XG5cblx0dGVzdCgnY3JlYXRlIC0gVVRGIDggQk9NIC0gZW1wdHkgY29udGVudCAtIHNuYXBzaG90JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnc21hbGxfbmV3LnV0Zjhib20nKSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZShbeyByZXNvdXJjZSwgdmFsdWU6IGNyZWF0ZVRleHRNb2RlbFNuYXBzaG90KCcnKSB9XSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgZXhpc3RzKHJlc291cmNlLmZzUGF0aCksIHRydWUpO1xuXG5cdFx0Y29uc3QgZGV0ZWN0ZWRFbmNvZGluZyA9IGF3YWl0IGRldGVjdEVuY29kaW5nQnlCT00ocmVzb3VyY2UuZnNQYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGV0ZWN0ZWRFbmNvZGluZywgVVRGOF93aXRoX2JvbSk7XG5cblx0XHRjb25zdCByZXMgPSBhd2FpdCByZWFkRmlsZShyZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuYnl0ZUxlbmd0aCwgVVRGOF9CT00ubGVuZ3RoKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlIC0gVVRGIDggQk9NIC0gY29udGVudCBwcm92aWRlZCAtIHNuYXBzaG90JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnc21hbGxfbmV3LnV0Zjhib20nKSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZShbeyByZXNvdXJjZSwgdmFsdWU6IGNyZWF0ZVRleHRNb2RlbFNuYXBzaG90KCdIZWxsbyBXb3JsZCcpIH1dKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBleGlzdHMocmVzb3VyY2UuZnNQYXRoKSwgdHJ1ZSk7XG5cblx0XHRjb25zdCBkZXRlY3RlZEVuY29kaW5nID0gYXdhaXQgZGV0ZWN0RW5jb2RpbmdCeUJPTShyZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXRlY3RlZEVuY29kaW5nLCBVVEY4X3dpdGhfYm9tKTtcblxuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IHJlYWRGaWxlKHJlc291cmNlLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5ieXRlTGVuZ3RoLCAnSGVsbG8gV29ybGQnLmxlbmd0aCArIFVURjhfQk9NLmxlbmd0aCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlIC0gdXNlIGVuY29kaW5nIChVVEYgMTYgQkUpIC0gc21hbGwgY29udGVudCBhcyBzdHJpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdGVzdEVuY29kaW5nKFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NtYWxsLnR4dCcpKSwgVVRGMTZiZSwgJ0hlbGxvXFxuV29ybGQnLCAnSGVsbG9cXG5Xb3JsZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZSAtIHVzZSBlbmNvZGluZyAoVVRGIDE2IEJFKSAtIHNtYWxsIGNvbnRlbnQgYXMgc25hcHNob3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdGVzdEVuY29kaW5nKFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NtYWxsLnR4dCcpKSwgVVRGMTZiZSwgY3JlYXRlVGV4dE1vZGVsU25hcHNob3QoJ0hlbGxvXFxuV29ybGQnKSwgJ0hlbGxvXFxuV29ybGQnKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGUgLSB1c2UgZW5jb2RpbmcgKFVURiAxNiBCRSkgLSBsYXJnZSBjb250ZW50IGFzIHN0cmluZycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB0ZXN0RW5jb2RpbmcoVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnbG9yZW0udHh0JykpLCBVVEYxNmJlLCAnSGVsbG9cXG5Xb3JsZCcsICdIZWxsb1xcbldvcmxkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlIC0gdXNlIGVuY29kaW5nIChVVEYgMTYgQkUpIC0gbGFyZ2UgY29udGVudCBhcyBzbmFwc2hvdCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB0ZXN0RW5jb2RpbmcoVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnbG9yZW0udHh0JykpLCBVVEYxNmJlLCBjcmVhdGVUZXh0TW9kZWxTbmFwc2hvdCgnSGVsbG9cXG5Xb3JsZCcpLCAnSGVsbG9cXG5Xb3JsZCcpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiB0ZXN0RW5jb2RpbmcocmVzb3VyY2U6IFVSSSwgZW5jb2Rpbmc6IHN0cmluZywgY29udGVudDogc3RyaW5nIHwgSVRleHRTbmFwc2hvdCwgZXhwZWN0ZWRDb250ZW50OiBzdHJpbmcpIHtcblx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlKHJlc291cmNlLCBjb250ZW50LCB7IGVuY29kaW5nIH0pO1xuXG5cdFx0Y29uc3QgZGV0ZWN0ZWRFbmNvZGluZyA9IGF3YWl0IGRldGVjdEVuY29kaW5nQnlCT00ocmVzb3VyY2UuZnNQYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGV0ZWN0ZWRFbmNvZGluZywgZW5jb2RpbmcpO1xuXG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCBzZXJ2aWNlLnJlYWRTdHJlYW0ocmVzb3VyY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlZC5lbmNvZGluZywgZW5jb2RpbmcpO1xuXG5cdFx0Y29uc3QgdGV4dEJ1ZmZlciA9IGRpc3Bvc2FibGVzLmFkZChyZXNvbHZlZC52YWx1ZS5jcmVhdGUoaXNXaW5kb3dzID8gRGVmYXVsdEVuZE9mTGluZS5DUkxGIDogRGVmYXVsdEVuZE9mTGluZS5MRikudGV4dEJ1ZmZlcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuYXBzaG90VG9TdHJpbmcodGV4dEJ1ZmZlci5jcmVhdGVTbmFwc2hvdChmYWxzZSkpLCBleHBlY3RlZENvbnRlbnQpO1xuXHR9XG5cblx0dGVzdCgnd3JpdGUgLSB1c2UgZW5jb2RpbmcgKGNwMTI1MiknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZVBhdGggPSBqb2luKHRlc3REaXIsICdzb21lX2NwMTI1Mi50eHQnKTtcblx0XHRjb25zdCBjb250ZW50cyA9IGF3YWl0IHJlYWRGaWxlKGZpbGVQYXRoLCAndXRmOCcpO1xuXHRcdGNvbnN0IGVvbCA9IC9cXHJcXG4vLnRlc3QoY29udGVudHMpID8gJ1xcclxcbicgOiAnXFxuJztcblx0XHRhd2FpdCB0ZXN0RW5jb2RpbmdLZWVwc0RhdGEoVVJJLmZpbGUoZmlsZVBhdGgpLCAnY3AxMjUyJywgWydPYmplY3RDb3VudCA9IExvYWRPYmplY3RzKFwiXHUwMEQ2ZmZlbnRsaWNoZXIgT3JkbmVyXCIpOycsICcnLCAnUHJpdmF0ZSA9IFwiUGVyc1x1MDBGNm5saWNoZSBJbmZvcm1hdGlvblwiJywgJyddLmpvaW4oZW9sKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlIC0gdXNlIGVuY29kaW5nIChzaGlmdGppcyknLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdGVzdEVuY29kaW5nS2VlcHNEYXRhKFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NvbWVfc2hpZnRqaXMudHh0JykpLCAnc2hpZnRqaXMnLCAnXHU0RTJEXHU2NTg3YWJjJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlIC0gdXNlIGVuY29kaW5nIChnYmspJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHRlc3RFbmNvZGluZ0tlZXBzRGF0YShVUkkuZmlsZShqb2luKHRlc3REaXIsICdzb21lX2diay50eHQnKSksICdnYmsnLCAnXHU0RTJEXHU1NkZEYWJjJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlIC0gdXNlIGVuY29kaW5nIChjeXJpbGxpYyknLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdGVzdEVuY29kaW5nS2VlcHNEYXRhKFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NvbWVfY3lyaWxsaWMudHh0JykpLCAnY3A4NjYnLCAnXHUwNDEwXHUwNDExXHUwNDEyXHUwNDEzXHUwNDE0XHUwNDE1XHUwNDE2XHUwNDE3XHUwNDE4XHUwNDE5XHUwNDFBXHUwNDFCXHUwNDFDXHUwNDFEXHUwNDFFXHUwNDFGXHUwNDIwXHUwNDIxXHUwNDIyXHUwNDIzXHUwNDI0XHUwNDI1XHUwNDI2XHUwNDI3XHUwNDI4XHUwNDI5XHUwNDJBXHUwNDJCXHUwNDJDXHUwNDJEXHUwNDJFXHUwNDJGXHUwNDMwXHUwNDMxXHUwNDMyXHUwNDMzXHUwNDM0XHUwNDM1XHUwNDM2XHUwNDM3XHUwNDM4XHUwNDM5XHUwNDNBXHUwNDNCXHUwNDNDXHUwNDNEXHUwNDNFXHUwNDNGXHUwNDQwXHUwNDQxXHUwNDQyXHUwNDQzXHUwNDQ0XHUwNDQ1XHUwNDQ2XHUwNDQ3XHUwNDQ4XHUwNDQ5XHUwNDRBXHUwNDRCXHUwNDRDXHUwNDREXHUwNDRFXHUwNDRGJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlIC0gdXNlIGVuY29kaW5nIChiaWc1KScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB0ZXN0RW5jb2RpbmdLZWVwc0RhdGEoVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnc29tZV9iaWc1LnR4dCcpKSwgJ2NwOTUwJywgJ1x1NEUyRFx1NjU4N2FiYycpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiB0ZXN0RW5jb2RpbmdLZWVwc0RhdGEocmVzb3VyY2U6IFVSSSwgZW5jb2Rpbmc6IHN0cmluZywgZXhwZWN0ZWQ6IHN0cmluZykge1xuXHRcdGxldCByZXNvbHZlZCA9IGF3YWl0IHNlcnZpY2UucmVhZFN0cmVhbShyZXNvdXJjZSwgeyBlbmNvZGluZyB9KTtcblx0XHRjb25zdCB0ZXh0QnVmZmVyID0gZGlzcG9zYWJsZXMuYWRkKHJlc29sdmVkLnZhbHVlLmNyZWF0ZShpc1dpbmRvd3MgPyBEZWZhdWx0RW5kT2ZMaW5lLkNSTEYgOiBEZWZhdWx0RW5kT2ZMaW5lLkxGKS50ZXh0QnVmZmVyKTtcblx0XHRjb25zdCBjb250ZW50ID0gc25hcHNob3RUb1N0cmluZyh0ZXh0QnVmZmVyLmNyZWF0ZVNuYXBzaG90KGZhbHNlKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQsIGV4cGVjdGVkKTtcblxuXHRcdGF3YWl0IHNlcnZpY2Uud3JpdGUocmVzb3VyY2UsIGNvbnRlbnQsIHsgZW5jb2RpbmcgfSk7XG5cblx0XHRyZXNvbHZlZCA9IGF3YWl0IHNlcnZpY2UucmVhZFN0cmVhbShyZXNvdXJjZSwgeyBlbmNvZGluZyB9KTtcblx0XHRjb25zdCB0ZXh0QnVmZmVyMiA9IGRpc3Bvc2FibGVzLmFkZChyZXNvbHZlZC52YWx1ZS5jcmVhdGUoRGVmYXVsdEVuZE9mTGluZS5DUkxGKS50ZXh0QnVmZmVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc25hcHNob3RUb1N0cmluZyh0ZXh0QnVmZmVyMi5jcmVhdGVTbmFwc2hvdChmYWxzZSkpLCBjb250ZW50KTtcblxuXHRcdGF3YWl0IHNlcnZpY2Uud3JpdGUocmVzb3VyY2UsIGNyZWF0ZVRleHRNb2RlbFNuYXBzaG90KGNvbnRlbnQpLCB7IGVuY29kaW5nIH0pO1xuXG5cdFx0cmVzb2x2ZWQgPSBhd2FpdCBzZXJ2aWNlLnJlYWRTdHJlYW0ocmVzb3VyY2UsIHsgZW5jb2RpbmcgfSk7XG5cdFx0Y29uc3QgdGV4dEJ1ZmZlcjMgPSBkaXNwb3NhYmxlcy5hZGQocmVzb2x2ZWQudmFsdWUuY3JlYXRlKERlZmF1bHRFbmRPZkxpbmUuQ1JMRikudGV4dEJ1ZmZlcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuYXBzaG90VG9TdHJpbmcodGV4dEJ1ZmZlcjMuY3JlYXRlU25hcHNob3QoZmFsc2UpKSwgY29udGVudCk7XG5cdH1cblxuXHR0ZXN0KCd3cml0ZSAtIG5vIGVuY29kaW5nIC0gY29udGVudCBhcyBzdHJpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdzbWFsbC50eHQnKSk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gKGF3YWl0IHJlYWRGaWxlKHJlc291cmNlLmZzUGF0aCkpLnRvU3RyaW5nKCk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlKHJlc291cmNlLCBjb250ZW50KTtcblxuXHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgc2VydmljZS5yZWFkU3RyZWFtKHJlc291cmNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZWQudmFsdWUuZ2V0Rmlyc3RMaW5lVGV4dCg5OTk5OTkpLCBjb250ZW50KTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGUgLSBubyBlbmNvZGluZyAtIGNvbnRlbnQgYXMgc25hcHNob3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdzbWFsbC50eHQnKSk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gKGF3YWl0IHJlYWRGaWxlKHJlc291cmNlLmZzUGF0aCkpLnRvU3RyaW5nKCk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlKHJlc291cmNlLCBjcmVhdGVUZXh0TW9kZWxTbmFwc2hvdChjb250ZW50KSk7XG5cblx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IHNlcnZpY2UucmVhZFN0cmVhbShyZXNvdXJjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkLnZhbHVlLmdldEZpcnN0TGluZVRleHQoOTk5OTk5KSwgY29udGVudCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlIC0gZW5jb2RpbmcgcHJlc2VydmVkIChVVEYgMTYgTEUpIC0gY29udGVudCBhcyBzdHJpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdzb21lX3V0ZjE2bGUuY3NzJykpO1xuXG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCBzZXJ2aWNlLnJlYWRTdHJlYW0ocmVzb3VyY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlZC5lbmNvZGluZywgVVRGMTZsZSk7XG5cblx0XHRhd2FpdCB0ZXN0RW5jb2RpbmcoVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnc29tZV91dGYxNmxlLmNzcycpKSwgVVRGMTZsZSwgJ0hlbGxvXFxuV29ybGQnLCAnSGVsbG9cXG5Xb3JsZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZSAtIGVuY29kaW5nIHByZXNlcnZlZCAoVVRGIDE2IExFKSAtIGNvbnRlbnQgYXMgc25hcHNob3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdzb21lX3V0ZjE2bGUuY3NzJykpO1xuXG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCBzZXJ2aWNlLnJlYWRTdHJlYW0ocmVzb3VyY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlZC5lbmNvZGluZywgVVRGMTZsZSk7XG5cblx0XHRhd2FpdCB0ZXN0RW5jb2RpbmcoVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnc29tZV91dGYxNmxlLmNzcycpKSwgVVRGMTZsZSwgY3JlYXRlVGV4dE1vZGVsU25hcHNob3QoJ0hlbGxvXFxuV29ybGQnKSwgJ0hlbGxvXFxuV29ybGQnKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGUgLSBVVEY4IHZhcmlhdGlvbnMgLSBjb250ZW50IGFzIHN0cmluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2luZGV4Lmh0bWwnKSk7XG5cblx0XHRsZXQgZGV0ZWN0ZWRFbmNvZGluZyA9IGF3YWl0IGRldGVjdEVuY29kaW5nQnlCT00ocmVzb3VyY2UuZnNQYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGV0ZWN0ZWRFbmNvZGluZywgbnVsbCk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gKGF3YWl0IHJlYWRGaWxlKHJlc291cmNlLmZzUGF0aCkpLnRvU3RyaW5nKCkgKyAndXBkYXRlcyc7XG5cdFx0YXdhaXQgc2VydmljZS53cml0ZShyZXNvdXJjZSwgY29udGVudCwgeyBlbmNvZGluZzogVVRGOF93aXRoX2JvbSB9KTtcblxuXHRcdGRldGVjdGVkRW5jb2RpbmcgPSBhd2FpdCBkZXRlY3RFbmNvZGluZ0J5Qk9NKHJlc291cmNlLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRldGVjdGVkRW5jb2RpbmcsIFVURjhfd2l0aF9ib20pO1xuXG5cdFx0Ly8gZW5zdXJlIEJPTSBwcmVzZXJ2ZWQgaWYgZW5mb3JjZWRcblx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlKHJlc291cmNlLCBjb250ZW50LCB7IGVuY29kaW5nOiBVVEY4X3dpdGhfYm9tIH0pO1xuXHRcdGRldGVjdGVkRW5jb2RpbmcgPSBhd2FpdCBkZXRlY3RFbmNvZGluZ0J5Qk9NKHJlc291cmNlLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRldGVjdGVkRW5jb2RpbmcsIFVURjhfd2l0aF9ib20pO1xuXG5cdFx0Ly8gYWxsb3cgdG8gcmVtb3ZlIEJPTVxuXHRcdGF3YWl0IHNlcnZpY2Uud3JpdGUocmVzb3VyY2UsIGNvbnRlbnQsIHsgZW5jb2Rpbmc6IFVURjggfSk7XG5cdFx0ZGV0ZWN0ZWRFbmNvZGluZyA9IGF3YWl0IGRldGVjdEVuY29kaW5nQnlCT00ocmVzb3VyY2UuZnNQYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGV0ZWN0ZWRFbmNvZGluZywgbnVsbCk7XG5cblx0XHQvLyBCT00gZG9lcyBub3QgY29tZSBiYWNrXG5cdFx0YXdhaXQgc2VydmljZS53cml0ZShyZXNvdXJjZSwgY29udGVudCwgeyBlbmNvZGluZzogVVRGOCB9KTtcblx0XHRkZXRlY3RlZEVuY29kaW5nID0gYXdhaXQgZGV0ZWN0RW5jb2RpbmdCeUJPTShyZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXRlY3RlZEVuY29kaW5nLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGUgLSBVVEY4IHZhcmlhdGlvbnMgLSBjb250ZW50IGFzIHNuYXBzaG90JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnaW5kZXguaHRtbCcpKTtcblxuXHRcdGxldCBkZXRlY3RlZEVuY29kaW5nID0gYXdhaXQgZGV0ZWN0RW5jb2RpbmdCeUJPTShyZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXRlY3RlZEVuY29kaW5nLCBudWxsKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbCgoYXdhaXQgcmVhZEZpbGUocmVzb3VyY2UuZnNQYXRoKSkudG9TdHJpbmcoKSArICd1cGRhdGVzJykpO1xuXHRcdGF3YWl0IHNlcnZpY2Uud3JpdGUocmVzb3VyY2UsIG1vZGVsLmNyZWF0ZVNuYXBzaG90KCksIHsgZW5jb2Rpbmc6IFVURjhfd2l0aF9ib20gfSk7XG5cblx0XHRkZXRlY3RlZEVuY29kaW5nID0gYXdhaXQgZGV0ZWN0RW5jb2RpbmdCeUJPTShyZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXRlY3RlZEVuY29kaW5nLCBVVEY4X3dpdGhfYm9tKTtcblxuXHRcdC8vIGVuc3VyZSBCT00gcHJlc2VydmVkIGlmIGVuZm9yY2VkXG5cdFx0YXdhaXQgc2VydmljZS53cml0ZShyZXNvdXJjZSwgbW9kZWwuY3JlYXRlU25hcHNob3QoKSwgeyBlbmNvZGluZzogVVRGOF93aXRoX2JvbSB9KTtcblx0XHRkZXRlY3RlZEVuY29kaW5nID0gYXdhaXQgZGV0ZWN0RW5jb2RpbmdCeUJPTShyZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXRlY3RlZEVuY29kaW5nLCBVVEY4X3dpdGhfYm9tKTtcblxuXHRcdC8vIGFsbG93IHRvIHJlbW92ZSBCT01cblx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlKHJlc291cmNlLCBtb2RlbC5jcmVhdGVTbmFwc2hvdCgpLCB7IGVuY29kaW5nOiBVVEY4IH0pO1xuXHRcdGRldGVjdGVkRW5jb2RpbmcgPSBhd2FpdCBkZXRlY3RFbmNvZGluZ0J5Qk9NKHJlc291cmNlLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRldGVjdGVkRW5jb2RpbmcsIG51bGwpO1xuXG5cdFx0Ly8gQk9NIGRvZXMgbm90IGNvbWUgYmFja1xuXHRcdGF3YWl0IHNlcnZpY2Uud3JpdGUocmVzb3VyY2UsIG1vZGVsLmNyZWF0ZVNuYXBzaG90KCksIHsgZW5jb2Rpbmc6IFVURjggfSk7XG5cdFx0ZGV0ZWN0ZWRFbmNvZGluZyA9IGF3YWl0IGRldGVjdEVuY29kaW5nQnlCT00ocmVzb3VyY2UuZnNQYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGV0ZWN0ZWRFbmNvZGluZywgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlIC0gcHJlc2VydmUgVVRGOCBCT00gLSBjb250ZW50IGFzIHN0cmluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NvbWVfdXRmOF9ib20udHh0JykpO1xuXG5cdFx0bGV0IGRldGVjdGVkRW5jb2RpbmcgPSBhd2FpdCBkZXRlY3RFbmNvZGluZ0J5Qk9NKHJlc291cmNlLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRldGVjdGVkRW5jb2RpbmcsIFVURjhfd2l0aF9ib20pO1xuXG5cdFx0YXdhaXQgc2VydmljZS53cml0ZShyZXNvdXJjZSwgJ0hlbGxvIFdvcmxkJywgeyBlbmNvZGluZzogZGV0ZWN0ZWRFbmNvZGluZyB9KTtcblx0XHRkZXRlY3RlZEVuY29kaW5nID0gYXdhaXQgZGV0ZWN0RW5jb2RpbmdCeUJPTShyZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXRlY3RlZEVuY29kaW5nLCBVVEY4X3dpdGhfYm9tKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGUgLSBlbnN1cmUgQk9NIGluIGVtcHR5IGZpbGUgLSBjb250ZW50IGFzIHN0cmluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NtYWxsLnR4dCcpKTtcblxuXHRcdGF3YWl0IHNlcnZpY2Uud3JpdGUocmVzb3VyY2UsICcnLCB7IGVuY29kaW5nOiBVVEY4X3dpdGhfYm9tIH0pO1xuXG5cdFx0Y29uc3QgZGV0ZWN0ZWRFbmNvZGluZyA9IGF3YWl0IGRldGVjdEVuY29kaW5nQnlCT00ocmVzb3VyY2UuZnNQYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGV0ZWN0ZWRFbmNvZGluZywgVVRGOF93aXRoX2JvbSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlIC0gZW5zdXJlIEJPTSBpbiBlbXB0eSBmaWxlIC0gY29udGVudCBhcyBzbmFwc2hvdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NtYWxsLnR4dCcpKTtcblxuXHRcdGF3YWl0IHNlcnZpY2Uud3JpdGUocmVzb3VyY2UsIGNyZWF0ZVRleHRNb2RlbFNuYXBzaG90KCcnKSwgeyBlbmNvZGluZzogVVRGOF93aXRoX2JvbSB9KTtcblxuXHRcdGNvbnN0IGRldGVjdGVkRW5jb2RpbmcgPSBhd2FpdCBkZXRlY3RFbmNvZGluZ0J5Qk9NKHJlc291cmNlLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRldGVjdGVkRW5jb2RpbmcsIFVURjhfd2l0aF9ib20pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkU3RyZWFtIC0gc21hbGwgdGV4dCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NtYWxsLnR4dCcpKTtcblxuXHRcdGF3YWl0IHRlc3RSZWFkU3RyZWFtKHJlc291cmNlKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZFN0cmVhbSAtIGxhcmdlIHRleHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdsb3JlbS50eHQnKSk7XG5cblx0XHRhd2FpdCB0ZXN0UmVhZFN0cmVhbShyZXNvdXJjZSk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHRlc3RSZWFkU3RyZWFtKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLnJlYWRTdHJlYW0ocmVzb3VyY2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5uYW1lLCBiYXNlbmFtZShyZXNvdXJjZS5mc1BhdGgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnNpemUsIChhd2FpdCBzdGF0KHJlc291cmNlLmZzUGF0aCkpLnNpemUpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IChhd2FpdCByZWFkRmlsZShyZXNvdXJjZS5mc1BhdGgpKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IHRleHRCdWZmZXIgPSBkaXNwb3NhYmxlcy5hZGQocmVzdWx0LnZhbHVlLmNyZWF0ZShEZWZhdWx0RW5kT2ZMaW5lLkxGKS50ZXh0QnVmZmVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzbmFwc2hvdFRvU3RyaW5nKHRleHRCdWZmZXIuY3JlYXRlU25hcHNob3QoZmFsc2UpKSxcblx0XHRcdHNuYXBzaG90VG9TdHJpbmcoY3JlYXRlVGV4dE1vZGVsU25hcHNob3QoY29udGVudCwgZmFsc2UpKSk7XG5cdH1cblxuXHR0ZXN0KCdyZWFkIC0gc21hbGwgdGV4dCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NtYWxsLnR4dCcpKTtcblxuXHRcdGF3YWl0IHRlc3RSZWFkKHJlc291cmNlKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZCAtIGxhcmdlIHRleHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdsb3JlbS50eHQnKSk7XG5cblx0XHRhd2FpdCB0ZXN0UmVhZChyZXNvdXJjZSk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHRlc3RSZWFkKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLnJlYWQocmVzb3VyY2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5uYW1lLCBiYXNlbmFtZShyZXNvdXJjZS5mc1BhdGgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnNpemUsIChhd2FpdCBzdGF0KHJlc291cmNlLmZzUGF0aCkpLnNpemUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudmFsdWUsIChhd2FpdCByZWFkRmlsZShyZXNvdXJjZS5mc1BhdGgpKS50b1N0cmluZygpKTtcblx0fVxuXG5cdHRlc3QoJ3JlYWRTdHJlYW0gLSBlbmNvZGluZyBwaWNrZWQgdXAgKENQMTI1MiknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdzb21lX3NtYWxsX2NwMTI1Mi50eHQnKSk7XG5cdFx0Y29uc3QgZW5jb2RpbmcgPSAnd2luZG93czEyNTInO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5yZWFkU3RyZWFtKHJlc291cmNlLCB7IGVuY29kaW5nIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZW5jb2RpbmcsIGVuY29kaW5nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnZhbHVlLmdldEZpcnN0TGluZVRleHQoOTk5OTk5KSwgJ1ByaXZhdGUgPSBcIlBlcnNcdTAwRjZubGljaGVcdTAwREYgSW5mb3JtYXRpb25cIicpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkIC0gZW5jb2RpbmcgcGlja2VkIHVwIChDUDEyNTIpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnc29tZV9zbWFsbF9jcDEyNTIudHh0JykpO1xuXHRcdGNvbnN0IGVuY29kaW5nID0gJ3dpbmRvd3MxMjUyJztcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UucmVhZChyZXNvdXJjZSwgeyBlbmNvZGluZyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVuY29kaW5nLCBlbmNvZGluZyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC52YWx1ZSwgJ1ByaXZhdGUgPSBcIlBlcnNcdTAwRjZubGljaGVcdTAwREYgSW5mb3JtYXRpb25cIicpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkIC0gZW5jb2RpbmcgcGlja2VkIHVwIChiaW5hcnkpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnc29tZV9zbWFsbF9jcDEyNTIudHh0JykpO1xuXHRcdGNvbnN0IGVuY29kaW5nID0gJ2JpbmFyeSc7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLnJlYWQocmVzb3VyY2UsIHsgZW5jb2RpbmcgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lbmNvZGluZywgZW5jb2RpbmcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudmFsdWUsICdQcml2YXRlID0gXCJQZXJzXHUwMEY2bmxpY2hlXHUwMERGIEluZm9ybWF0aW9uXCInKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZCAtIGVuY29kaW5nIHBpY2tlZCB1cCAoYmFzZTY0KScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NvbWVfc21hbGxfY3AxMjUyLnR4dCcpKTtcblx0XHRjb25zdCBlbmNvZGluZyA9ICdiYXNlNjQnO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5yZWFkKHJlc291cmNlLCB7IGVuY29kaW5nIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZW5jb2RpbmcsIGVuY29kaW5nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnZhbHVlLCBidG9hKCdQcml2YXRlID0gXCJQZXJzXHUwMEY2bmxpY2hlXHUwMERGIEluZm9ybWF0aW9uXCInKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRTdHJlYW0gLSB1c2VyIG92ZXJyaWRlcyBCT00nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdzb21lX3V0ZjE2bGUuY3NzJykpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5yZWFkU3RyZWFtKHJlc291cmNlLCB7IGVuY29kaW5nOiAnd2luZG93czEyNTInIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZW5jb2RpbmcsICd3aW5kb3dzMTI1MicpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkU3RyZWFtIC0gQk9NIHJlbW92ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdzb21lX3V0ZjhfYm9tLnR4dCcpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UucmVhZFN0cmVhbShyZXNvdXJjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC52YWx1ZS5nZXRGaXJzdExpbmVUZXh0KDk5OTk5OSksICdUaGlzIGlzIHNvbWUgVVRGIDggd2l0aCBCT00gZmlsZS4nKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZFN0cmVhbSAtIGludmFsaWQgZW5jb2RpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdpbmRleC5odG1sJykpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5yZWFkU3RyZWFtKHJlc291cmNlLCB7IGVuY29kaW5nOiAnc3VwZXJkdXBlcicgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lbmNvZGluZywgJ3V0ZjgnKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZFN0cmVhbSAtIGVuY29kaW5nIG92ZXJyaWRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnc29tZS51dGYxNmxlJykpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5yZWFkU3RyZWFtKHJlc291cmNlLCB7IGVuY29kaW5nOiAnd2luZG93czEyNTInIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZW5jb2RpbmcsICd1dGYxNmxlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC52YWx1ZS5nZXRGaXJzdExpbmVUZXh0KDk5OTk5OSksICdUaGlzIGlzIHNvbWUgVVRGIDE2IHdpdGggQk9NIGZpbGUuJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRTdHJlYW0gLSBsYXJnZSBCaWc1JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHRlc3RMYXJnZUVuY29kaW5nKCdiaWc1JywgJ1x1NEUyRFx1NjU4N2FiYycpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkU3RyZWFtIC0gbGFyZ2UgQ1AxMjUyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHRlc3RMYXJnZUVuY29kaW5nKCdjcDEyNTInLCAnXHUwMEY2XHUwMEU0XHUwMEZDXHUwMERGJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRTdHJlYW0gLSBsYXJnZSBDeXJpbGxpYycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB0ZXN0TGFyZ2VFbmNvZGluZygnY3A4NjYnLCAnXHUwNDEwXHUwNDExXHUwNDEyXHUwNDEzXHUwNDE0XHUwNDE1XHUwNDE2XHUwNDE3XHUwNDE4XHUwNDE5XHUwNDFBXHUwNDFCXHUwNDFDXHUwNDFEXHUwNDFFXHUwNDFGXHUwNDIwXHUwNDIxXHUwNDIyXHUwNDIzXHUwNDI0XHUwNDI1XHUwNDI2XHUwNDI3XHUwNDI4XHUwNDI5XHUwNDJBXHUwNDJCXHUwNDJDXHUwNDJEXHUwNDJFXHUwNDJGXHUwNDMwXHUwNDMxXHUwNDMyXHUwNDMzXHUwNDM0XHUwNDM1XHUwNDM2XHUwNDM3XHUwNDM4XHUwNDM5XHUwNDNBXHUwNDNCXHUwNDNDXHUwNDNEXHUwNDNFXHUwNDNGXHUwNDQwXHUwNDQxXHUwNDQyXHUwNDQzXHUwNDQ0XHUwNDQ1XHUwNDQ2XHUwNDQ3XHUwNDQ4XHUwNDQ5XHUwNDRBXHUwNDRCXHUwNDRDXHUwNDREXHUwNDRFXHUwNDRGJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRTdHJlYW0gLSBsYXJnZSBHQksnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdGVzdExhcmdlRW5jb2RpbmcoJ2diaycsICdcdTRFMkRcdTU2RkRhYmMnKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZFN0cmVhbSAtIGxhcmdlIFNoaWZ0SklTJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHRlc3RMYXJnZUVuY29kaW5nKCdzaGlmdGppcycsICdcdTRFMkRcdTY1ODdhYmMnKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZFN0cmVhbSAtIGxhcmdlIFVURjggQk9NJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHRlc3RMYXJnZUVuY29kaW5nKCd1dGY4Ym9tJywgJ1x1MDBGNlx1MDBFNFx1MDBGQ1x1MDBERicpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkU3RyZWFtIC0gbGFyZ2UgVVRGMTYgTEUnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdGVzdExhcmdlRW5jb2RpbmcoJ3V0ZjE2bGUnLCAnXHUwMEY2XHUwMEU0XHUwMEZDXHUwMERGJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRTdHJlYW0gLSBsYXJnZSBVVEYxNiBCRScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB0ZXN0TGFyZ2VFbmNvZGluZygndXRmMTZiZScsICdcdTAwRjZcdTAwRTRcdTAwRkNcdTAwREYnKTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gdGVzdExhcmdlRW5jb2RpbmcoZW5jb2Rpbmc6IHN0cmluZywgbmVlZGxlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgYGxvcmVtXyR7ZW5jb2Rpbmd9LnR4dGApKTtcblxuXHRcdC8vIFZlcmlmeSB2aWEgYElUZXh0RmlsZVNlcnZpY2UucmVhZFN0cmVhbWBcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLnJlYWRTdHJlYW0ocmVzb3VyY2UsIHsgZW5jb2RpbmcgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lbmNvZGluZywgZW5jb2RpbmcpO1xuXG5cdFx0Y29uc3QgdGV4dEJ1ZmZlciA9IGRpc3Bvc2FibGVzLmFkZChyZXN1bHQudmFsdWUuY3JlYXRlKERlZmF1bHRFbmRPZkxpbmUuTEYpLnRleHRCdWZmZXIpO1xuXHRcdGxldCBjb250ZW50cyA9IHNuYXBzaG90VG9TdHJpbmcodGV4dEJ1ZmZlci5jcmVhdGVTbmFwc2hvdChmYWxzZSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnRzLmluZGV4T2YobmVlZGxlKSwgMCk7XG5cdFx0YXNzZXJ0Lm9rKGNvbnRlbnRzLmluZGV4T2YobmVlZGxlLCAxMCkgPiAwKTtcblxuXHRcdC8vIFZlcmlmeSB2aWEgYElUZXh0RmlsZVNlcnZpY2UuZ2V0RGVjb2RlZFRleHRGYWN0b3J5YFxuXHRcdGNvbnN0IHJhd0ZpbGUgPSBhd2FpdCBwYXJhbXMucmVhZEZpbGUocmVzb3VyY2UuZnNQYXRoKTtcblx0XHRsZXQgcmF3RmlsZVZTQnVmZmVyOiBWU0J1ZmZlcjtcblx0XHRpZiAocmF3RmlsZSBpbnN0YW5jZW9mIFZTQnVmZmVyKSB7XG5cdFx0XHRyYXdGaWxlVlNCdWZmZXIgPSByYXdGaWxlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyYXdGaWxlVlNCdWZmZXIgPSBWU0J1ZmZlci53cmFwKHJhd0ZpbGUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZhY3RvcnkgPSBhd2FpdCBjcmVhdGVUZXh0QnVmZmVyRmFjdG9yeUZyb21TdHJlYW0oYXdhaXQgc2VydmljZS5nZXREZWNvZGVkU3RyZWFtKHJlc291cmNlLCBidWZmZXJUb1N0cmVhbShyYXdGaWxlVlNCdWZmZXIpLCB7IGVuY29kaW5nIH0pKTtcblxuXHRcdGNvbnN0IHRleHRCdWZmZXIyID0gZGlzcG9zYWJsZXMuYWRkKGZhY3RvcnkuY3JlYXRlKERlZmF1bHRFbmRPZkxpbmUuTEYpLnRleHRCdWZmZXIpO1xuXHRcdGNvbnRlbnRzID0gc25hcHNob3RUb1N0cmluZyh0ZXh0QnVmZmVyMi5jcmVhdGVTbmFwc2hvdChmYWxzZSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnRzLmluZGV4T2YobmVlZGxlKSwgMCk7XG5cdFx0YXNzZXJ0Lm9rKGNvbnRlbnRzLmluZGV4T2YobmVlZGxlLCAxMCkgPiAwKTtcblx0fVxuXG5cdHRlc3QoJ3JlYWRTdHJlYW0gLSBVVEYxNiBMRSAobm8gQk9NKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3V0ZjE2X2xlX25vYm9tLnR4dCcpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UucmVhZFN0cmVhbShyZXNvdXJjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lbmNvZGluZywgJ3V0ZjE2bGUnKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZFN0cmVhbSAtIFVURjE2IEJFIChubyBCT00pJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAndXRmMTZfYmVfbm9ib20udHh0JykpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5yZWFkU3RyZWFtKHJlc291cmNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVuY29kaW5nLCAndXRmMTZiZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkU3RyZWFtIC0gYXV0b2d1ZXNzRW5jb2RpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdzb21lX2NwMTI1Mi50eHQnKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLnJlYWRTdHJlYW0ocmVzb3VyY2UsIHsgYXV0b0d1ZXNzRW5jb2Rpbmc6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lbmNvZGluZywgJ3dpbmRvd3MxMjUyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRTdHJlYW0gLSBhdXRvZ3Vlc3NFbmNvZGluZyAoY2FuZGlkYXRlR3Vlc3NFbmNvZGluZ3MpJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFRoaXMgZmlsZSBpcyBkZXRlcm1pbmVkIHRvIGJlIFdpbmRvd3MtMTI1MiB1bmxlc3MgY2FuZGlkYXRlRGV0ZWN0RW5jb2RpbmcgaXMgc2V0LlxuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnc29tZS5zaGlmdGppcy4xLnR4dCcpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UucmVhZFN0cmVhbShyZXNvdXJjZSwgeyBhdXRvR3Vlc3NFbmNvZGluZzogdHJ1ZSwgY2FuZGlkYXRlR3Vlc3NFbmNvZGluZ3M6IFsndXRmLTgnLCAnc2hpZnRqaXMnLCAnZXVjLWpwJ10gfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lbmNvZGluZywgJ3NoaWZ0amlzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRTdHJlYW0gLSBhdXRvZ3Vlc3NFbmNvZGluZyAoY2FuZGlkYXRlR3Vlc3NFbmNvZGluZ3MgaXMgRW1wdHkpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnc29tZV9jcDEyNTIudHh0JykpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5yZWFkU3RyZWFtKHJlc291cmNlLCB7IGF1dG9HdWVzc0VuY29kaW5nOiB0cnVlLCBjYW5kaWRhdGVHdWVzc0VuY29kaW5nczogW10gfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lbmNvZGluZywgJ3dpbmRvd3MxMjUyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRTdHJlYW0gLSBGSUxFX0lTX0JJTkFSWScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2JpbmFyeS50eHQnKSk7XG5cblx0XHRsZXQgZXJyb3I6IFRleHRGaWxlT3BlcmF0aW9uRXJyb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHNlcnZpY2UucmVhZFN0cmVhbShyZXNvdXJjZSwgeyBhY2NlcHRUZXh0T25seTogdHJ1ZSB9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGVycm9yID0gZXJyO1xuXHRcdH1cblxuXHRcdGFzc2VydC5vayhlcnJvcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yLnRleHRGaWxlT3BlcmF0aW9uUmVzdWx0LCBUZXh0RmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX0lTX0JJTkFSWSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLnJlYWRTdHJlYW0oVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnc21hbGwudHh0JykpLCB7IGFjY2VwdFRleHRPbmx5OiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubmFtZSwgJ3NtYWxsLnR4dCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkIC0gRklMRV9JU19CSU5BUlknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdiaW5hcnkudHh0JykpO1xuXG5cdFx0bGV0IGVycm9yOiBUZXh0RmlsZU9wZXJhdGlvbkVycm9yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnJlYWQocmVzb3VyY2UsIHsgYWNjZXB0VGV4dE9ubHk6IHRydWUgfSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRlcnJvciA9IGVycjtcblx0XHR9XG5cblx0XHRhc3NlcnQub2soZXJyb3IpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvci50ZXh0RmlsZU9wZXJhdGlvblJlc3VsdCwgVGV4dEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9JU19CSU5BUlkpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5yZWFkKFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NtYWxsLnR4dCcpKSwgeyBhY2NlcHRUZXh0T25seTogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm5hbWUsICdzbWFsbC50eHQnKTtcblx0fSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBMkIsa0JBQTBDLHlCQUF5Qix3QkFBd0I7QUFDdEgsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsTUFBTSxnQkFBZ0I7QUFDL0IsU0FBUyxTQUFTLGVBQWUsU0FBUyxNQUFNLGFBQWEsYUFBYSxnQkFBZ0I7QUFDMUYsU0FBUyxnQkFBZ0IsZ0JBQWdCO0FBQ3pDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQXdCLHdCQUF3QjtBQUNoRCxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLHlDQUF5QztBQUNsRCxTQUFTLHVCQUF1QjtBQXdCakIsU0FBUixZQUE2QixRQUFnQjtBQUNuRCxNQUFJO0FBQ0osTUFBSSxVQUFVO0FBQ2QsUUFBTSxFQUFFLFFBQVEsTUFBTSxVQUFVLG9CQUFvQixJQUFJO0FBQ3hELFFBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUV4QyxRQUFNLFlBQVk7QUFDakIsVUFBTSxTQUFTLE1BQU0sT0FBTyxNQUFNO0FBQ2xDLGNB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
