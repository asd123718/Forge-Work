import assert from "assert";
import { mockService } from "../utils/mock.js";
import { PromptsConfig } from "../../../../common/promptSyntax/config/config.js";
import { PromptsType } from "../../../../common/promptSyntax/promptTypes.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
function getPaths(folders) {
  return folders.map((f) => f.path);
}
function createMock(value) {
  return mockService({
    getValue(key) {
      assert(
        typeof key === "string",
        `Expected string configuration key, got '${typeof key}'.`
      );
      assert(
        [PromptsConfig.PROMPT_LOCATIONS_KEY, PromptsConfig.INSTRUCTIONS_LOCATION_KEY, PromptsConfig.MODE_LOCATION_KEY, PromptsConfig.SKILLS_LOCATION_KEY].includes(key),
        `Unsupported configuration key '${key}'.`
      );
      return value;
    }
  });
}
suite("PromptsConfig", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("getLocationsValue", () => {
    test("undefined", () => {
      const configService = createMock(void 0);
      assert.strictEqual(
        PromptsConfig.getLocationsValue(configService, PromptsType.prompt),
        void 0,
        "Must read correct value."
      );
    });
    test("null", () => {
      const configService = createMock(null);
      assert.strictEqual(
        PromptsConfig.getLocationsValue(configService, PromptsType.prompt),
        void 0,
        "Must read correct value."
      );
    });
    test("undefined for skill", () => {
      const configService = createMock(void 0);
      assert.strictEqual(
        PromptsConfig.getLocationsValue(configService, PromptsType.skill),
        void 0,
        "Must read correct value for skills."
      );
    });
    test("null for skill", () => {
      const configService = createMock(null);
      assert.strictEqual(
        PromptsConfig.getLocationsValue(configService, PromptsType.skill),
        void 0,
        "Must read correct value for skills."
      );
    });
    suite("object", () => {
      test("empty", () => {
        assert.deepStrictEqual(
          PromptsConfig.getLocationsValue(createMock({}), PromptsType.prompt),
          {},
          "Must read correct value."
        );
      });
      test("only valid strings", () => {
        assert.deepStrictEqual(
          PromptsConfig.getLocationsValue(createMock({
            "/root/.bashrc": true,
            "../../folder/.hidden-folder/config.xml": true,
            "/srv/www/Public_html/.htaccess": true,
            "../../another.folder/.WEIRD_FILE.log": true,
            "./folder.name/file.name": true,
            "/media/external/backup.tar.gz": true,
            "/Media/external/.secret.backup": true,
            "../relative/path.to.file": true,
            "./folderName.with.dots/more.dots.extension": true,
            "some/folder.with.dots/another.file": true,
            "/var/logs/app.01.05.error": true,
            "./.tempfile": true
          }), PromptsType.prompt),
          {
            "/root/.bashrc": true,
            "../../folder/.hidden-folder/config.xml": true,
            "/srv/www/Public_html/.htaccess": true,
            "../../another.folder/.WEIRD_FILE.log": true,
            "./folder.name/file.name": true,
            "/media/external/backup.tar.gz": true,
            "/Media/external/.secret.backup": true,
            "../relative/path.to.file": true,
            "./folderName.with.dots/more.dots.extension": true,
            "some/folder.with.dots/another.file": true,
            "/var/logs/app.01.05.error": true,
            "./.tempfile": true
          },
          "Must read correct value."
        );
      });
      test("filters out non valid entries", () => {
        assert.deepStrictEqual(
          PromptsConfig.getLocationsValue(createMock({
            "/etc/hosts.backup": "	\n	",
            "./run.tests.sh": "\v",
            "../assets/img/logo.v2.png": true,
            "/mnt/storage/video.archive/episode.01.mkv": false,
            "../.local/bin/script.sh": true,
            "/usr/local/share/.fonts/CustomFont.otf": "",
            "../../development/branch.name/some.test": true,
            "/Home/user/.ssh/config": true,
            "./hidden.dir/.subhidden": "\f",
            "/tmp/.temp.folder/cache.db": true,
            "/opt/software/v3.2.1/build.log": "  ",
            "": true,
            "./scripts/.old.build.sh": true,
            "/var/data/datafile.2025-02-05.json": "\n",
            "\n\n": true,
            "	": true,
            "\v": true,
            "\f": true,
            "\r\n": true,
            "\f\f": true,
            "../lib/some_library.v1.0.1.so": "\r\n",
            "/dev/shm/.shared_resource": 1234
          }), PromptsType.prompt),
          {
            "../assets/img/logo.v2.png": true,
            "/mnt/storage/video.archive/episode.01.mkv": false,
            "../.local/bin/script.sh": true,
            "../../development/branch.name/some.test": true,
            "/Home/user/.ssh/config": true,
            "/tmp/.temp.folder/cache.db": true,
            "./scripts/.old.build.sh": true
          },
          "Must read correct value."
        );
      });
      test("only invalid or false values", () => {
        assert.deepStrictEqual(
          PromptsConfig.getLocationsValue(createMock({
            "/etc/hosts.backup": "	\n	",
            "./run.tests.sh": "\v",
            "../assets/IMG/logo.v2.png": "",
            "/mnt/storage/video.archive/episode.01.mkv": false,
            "/usr/local/share/.fonts/CustomFont.otf": "",
            "./hidden.dir/.subhidden": "\f",
            "/opt/Software/v3.2.1/build.log": "  ",
            "/var/data/datafile.2025-02-05.json": "\n",
            "../lib/some_library.v1.0.1.so": "\r\n",
            "/dev/shm/.shared_resource": 2345
          }), PromptsType.prompt),
          {
            "/mnt/storage/video.archive/episode.01.mkv": false
          },
          "Must read correct value."
        );
      });
      test("skill locations - empty", () => {
        assert.deepStrictEqual(
          PromptsConfig.getLocationsValue(createMock({}), PromptsType.skill),
          {},
          "Must read correct value for skills."
        );
      });
      test("skill locations - valid paths", () => {
        assert.deepStrictEqual(
          PromptsConfig.getLocationsValue(createMock({
            ".github/skills": true,
            ".claude/skills": true,
            "/custom/skills/folder": true,
            "./relative/skills": true
          }), PromptsType.skill),
          {
            ".github/skills": true,
            ".claude/skills": true,
            "/custom/skills/folder": true,
            "./relative/skills": true
          },
          "Must read correct skill locations."
        );
      });
      test("skill locations - filters invalid entries", () => {
        assert.deepStrictEqual(
          PromptsConfig.getLocationsValue(createMock({
            ".github/skills": true,
            ".claude/skills": "	\n",
            "/invalid/path": "",
            "": true,
            "./valid/skills": true,
            "\n": true
          }), PromptsType.skill),
          {
            ".github/skills": true,
            "./valid/skills": true
          },
          "Must filter invalid skill locations."
        );
      });
    });
  });
  suite("sourceLocations", () => {
    test("undefined", () => {
      const configService = createMock(void 0);
      assert.deepStrictEqual(
        getPaths(PromptsConfig.promptSourceFolders(configService, PromptsType.prompt)),
        [],
        "Must read correct value."
      );
    });
    test("null", () => {
      const configService = createMock(null);
      assert.deepStrictEqual(
        getPaths(PromptsConfig.promptSourceFolders(configService, PromptsType.prompt)),
        [],
        "Must read correct value."
      );
    });
    suite("object", () => {
      test("empty", () => {
        assert.deepStrictEqual(
          getPaths(PromptsConfig.promptSourceFolders(createMock({}), PromptsType.prompt)),
          [".github/prompts"],
          "Must read correct value."
        );
      });
      test("only valid strings", () => {
        assert.deepStrictEqual(
          getPaths(PromptsConfig.promptSourceFolders(createMock({
            "/root/.bashrc": true,
            "../../folder/.hidden-folder/config.xml": true,
            "/srv/www/Public_html/.htaccess": true,
            "../../another.folder/.WEIRD_FILE.log": true,
            "./folder.name/file.name": true,
            "/media/external/backup.tar.gz": true,
            "/Media/external/.secret.backup": true,
            "../relative/path.to.file": true,
            "./folderName.with.dots/more.dots.extension": true,
            "some/folder.with.dots/another.file": true,
            "/var/logs/app.01.05.error": true,
            ".GitHub/prompts": true,
            "./.tempfile": true
          }), PromptsType.prompt)),
          [
            ".github/prompts",
            "/root/.bashrc",
            "../../folder/.hidden-folder/config.xml",
            "/srv/www/Public_html/.htaccess",
            "../../another.folder/.WEIRD_FILE.log",
            "./folder.name/file.name",
            "/media/external/backup.tar.gz",
            "/Media/external/.secret.backup",
            "../relative/path.to.file",
            "./folderName.with.dots/more.dots.extension",
            "some/folder.with.dots/another.file",
            "/var/logs/app.01.05.error",
            ".GitHub/prompts",
            "./.tempfile"
          ],
          "Must read correct value."
        );
      });
      test("filters out non valid entries", () => {
        assert.deepStrictEqual(
          getPaths(PromptsConfig.promptSourceFolders(createMock({
            "/etc/hosts.backup": "	\n	",
            "./run.tests.sh": "\v",
            "../assets/img/logo.v2.png": true,
            "/mnt/storage/video.archive/episode.01.mkv": false,
            "../.local/bin/script.sh": true,
            "/usr/local/share/.fonts/CustomFont.otf": "",
            "../../development/branch.name/some.test": true,
            ".giThub/prompts": true,
            "/Home/user/.ssh/config": true,
            "./hidden.dir/.subhidden": "\f",
            "/tmp/.temp.folder/cache.db": true,
            ".github/prompts": true,
            "/opt/software/v3.2.1/build.log": "  ",
            "": true,
            "./scripts/.old.build.sh": true,
            "/var/data/datafile.2025-02-05.json": "\n",
            "\n\n": true,
            "	": true,
            "\v": true,
            "\f": true,
            "\r\n": true,
            "\f\f": true,
            "../lib/some_library.v1.0.1.so": "\r\n",
            "/dev/shm/.shared_resource": 2345
          }), PromptsType.prompt)),
          [
            ".github/prompts",
            "../assets/img/logo.v2.png",
            "../.local/bin/script.sh",
            "../../development/branch.name/some.test",
            ".giThub/prompts",
            "/Home/user/.ssh/config",
            "/tmp/.temp.folder/cache.db",
            "./scripts/.old.build.sh"
          ],
          "Must read correct value."
        );
      });
      test("only invalid or false values", () => {
        assert.deepStrictEqual(
          getPaths(PromptsConfig.promptSourceFolders(createMock({
            "/etc/hosts.backup": "	\n	",
            "./run.tests.sh": "\v",
            "../assets/IMG/logo.v2.png": "",
            "/mnt/storage/video.archive/episode.01.mkv": false,
            "/usr/local/share/.fonts/CustomFont.otf": "",
            "./hidden.dir/.subhidden": "\f",
            "/opt/Software/v3.2.1/build.log": "  ",
            "/var/data/datafile.2025-02-05.json": "\n",
            "../lib/some_library.v1.0.1.so": "\r\n",
            "/dev/shm/.shared_resource": 7654
          }), PromptsType.prompt)),
          [
            ".github/prompts"
          ],
          "Must read correct value."
        );
      });
      test("filters out disabled default location", () => {
        assert.deepStrictEqual(
          getPaths(PromptsConfig.promptSourceFolders(createMock({
            "/etc/hosts.backup": "	\n	",
            "./run.tests.sh": "\v",
            ".github/prompts": false,
            "../assets/img/logo.v2.png": true,
            "/mnt/storage/video.archive/episode.01.mkv": false,
            "../.local/bin/script.sh": true,
            "/usr/local/share/.fonts/CustomFont.otf": "",
            "../../development/branch.name/some.test": true,
            ".giThub/prompts": true,
            "/Home/user/.ssh/config": true,
            "./hidden.dir/.subhidden": "\f",
            "/tmp/.temp.folder/cache.db": true,
            "/opt/software/v3.2.1/build.log": "  ",
            "": true,
            "./scripts/.old.build.sh": true,
            "/var/data/datafile.2025-02-05.json": "\n",
            "\n\n": true,
            "	": true,
            "\v": true,
            "\f": true,
            "\r\n": true,
            "\f\f": true,
            "../lib/some_library.v1.0.1.so": "\r\n",
            "/dev/shm/.shared_resource": 853
          }), PromptsType.prompt)),
          [
            "../assets/img/logo.v2.png",
            "../.local/bin/script.sh",
            "../../development/branch.name/some.test",
            ".giThub/prompts",
            "/Home/user/.ssh/config",
            "/tmp/.temp.folder/cache.db",
            "./scripts/.old.build.sh"
          ],
          "Must read correct value."
        );
      });
    });
    suite("skills", () => {
      test("undefined returns empty array", () => {
        const configService = createMock(void 0);
        assert.deepStrictEqual(
          getPaths(PromptsConfig.promptSourceFolders(configService, PromptsType.skill)),
          [],
          "Must return empty array for undefined config."
        );
      });
      test("null returns empty array", () => {
        const configService = createMock(null);
        assert.deepStrictEqual(
          getPaths(PromptsConfig.promptSourceFolders(configService, PromptsType.skill)),
          [],
          "Must return empty array for null config."
        );
      });
      test("empty object returns default skill folders", () => {
        assert.deepStrictEqual(
          getPaths(PromptsConfig.promptSourceFolders(createMock({}), PromptsType.skill)),
          [".agents/skills", ".github/skills", ".claude/skills", "~/.agents/skills", "~/.copilot/skills", "~/.claude/skills"],
          "Must return default skill folders."
        );
      });
      test("includes custom skill folders", () => {
        assert.deepStrictEqual(
          getPaths(PromptsConfig.promptSourceFolders(createMock({
            "/custom/skills": true,
            "./local/skills": true
          }), PromptsType.skill)),
          [
            ".agents/skills",
            ".github/skills",
            ".claude/skills",
            "~/.agents/skills",
            "~/.copilot/skills",
            "~/.claude/skills",
            "/custom/skills",
            "./local/skills"
          ],
          "Must include custom skill folders."
        );
      });
      test("filters out disabled default skill folders", () => {
        assert.deepStrictEqual(
          getPaths(PromptsConfig.promptSourceFolders(createMock({
            ".github/skills": false,
            "/custom/skills": true
          }), PromptsType.skill)),
          [
            ".agents/skills",
            ".claude/skills",
            "~/.agents/skills",
            "~/.copilot/skills",
            "~/.claude/skills",
            "/custom/skills"
          ],
          "Must filter out disabled .github/skills folder."
        );
      });
      test("filters out all disabled default skill folders", () => {
        assert.deepStrictEqual(
          getPaths(PromptsConfig.promptSourceFolders(createMock({
            ".github/skills": false,
            ".agents/skills": false,
            ".claude/skills": false,
            "~/.copilot/skills": false,
            "~/.agents/skills": false,
            "~/.claude/skills": false,
            "/only/custom/skills": true
          }), PromptsType.skill)),
          [
            "/only/custom/skills"
          ],
          "Must filter out all disabled default folders."
        );
      });
      test("filters out invalid entries", () => {
        assert.deepStrictEqual(
          getPaths(PromptsConfig.promptSourceFolders(createMock({
            "/valid/skills": true,
            "/invalid/path": "	\n",
            "": true,
            "./another/valid": true,
            "\n": true
          }), PromptsType.skill)),
          [
            ".agents/skills",
            ".github/skills",
            ".claude/skills",
            "~/.agents/skills",
            "~/.copilot/skills",
            "~/.claude/skills",
            "/valid/skills",
            "./another/valid"
          ],
          "Must filter out invalid entries."
        );
      });
      test("includes all default folders when explicitly enabled", () => {
        assert.deepStrictEqual(
          getPaths(PromptsConfig.promptSourceFolders(createMock({
            ".github/skills": true,
            ".agents/skills": true,
            ".claude/skills": true,
            "~/.copilot/skills": true,
            "~/.agents/skills": true,
            "~/.claude/skills": true,
            "/extra/skills": true
          }), PromptsType.skill)),
          [
            ".agents/skills",
            ".github/skills",
            ".claude/skills",
            "~/.agents/skills",
            "~/.copilot/skills",
            "~/.claude/skills",
            "/extra/skills"
          ],
          "Must include all default folders."
        );
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxccHJvbXB0U3ludGF4XFxjb25maWdcXGNvbmZpZy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgbW9ja1NlcnZpY2UgfSBmcm9tICcuLi91dGlscy9tb2NrLmpzJztcbmltcG9ydCB7IFByb21wdHNDb25maWcgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L2NvbmZpZy9jb25maWcuanMnO1xuaW1wb3J0IHsgUHJvbXB0c1R5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVByb21wdFNvdXJjZUZvbGRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvY29uZmlnL3Byb21wdEZpbGVMb2NhdGlvbnMuanMnO1xuXG4vKipcbiAqIEhlbHBlciB0byBleHRyYWN0IGp1c3QgdGhlIHBhdGhzIGZyb20gSVByb21wdFNvdXJjZUZvbGRlciBhcnJheSBmb3IgdGVzdGluZy5cbiAqL1xuZnVuY3Rpb24gZ2V0UGF0aHMoZm9sZGVyczogSVByb21wdFNvdXJjZUZvbGRlcltdKTogc3RyaW5nW10ge1xuXHRyZXR1cm4gZm9sZGVycy5tYXAoZiA9PiBmLnBhdGgpO1xufVxuXG4vKipcbiAqIE1vY2tlZCBpbnN0YW5jZSBvZiB7QGxpbmsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlfS5cbiAqL1xuZnVuY3Rpb24gY3JlYXRlTW9jazxUPih2YWx1ZTogVCk6IElDb25maWd1cmF0aW9uU2VydmljZSB7XG5cdHJldHVybiBtb2NrU2VydmljZTxJQ29uZmlndXJhdGlvblNlcnZpY2U+KHtcblx0XHRnZXRWYWx1ZShrZXk/OiBzdHJpbmcgfCBJQ29uZmlndXJhdGlvbk92ZXJyaWRlcykge1xuXHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHR0eXBlb2Yga2V5ID09PSAnc3RyaW5nJyxcblx0XHRcdFx0YEV4cGVjdGVkIHN0cmluZyBjb25maWd1cmF0aW9uIGtleSwgZ290ICcke3R5cGVvZiBrZXl9Jy5gLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHRbUHJvbXB0c0NvbmZpZy5QUk9NUFRfTE9DQVRJT05TX0tFWSwgUHJvbXB0c0NvbmZpZy5JTlNUUlVDVElPTlNfTE9DQVRJT05fS0VZLCBQcm9tcHRzQ29uZmlnLk1PREVfTE9DQVRJT05fS0VZLCBQcm9tcHRzQ29uZmlnLlNLSUxMU19MT0NBVElPTl9LRVldLmluY2x1ZGVzKGtleSksXG5cdFx0XHRcdGBVbnN1cHBvcnRlZCBjb25maWd1cmF0aW9uIGtleSAnJHtrZXl9Jy5gLFxuXHRcdFx0KTtcblxuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH0sXG5cdH0pO1xufVxuXG5zdWl0ZSgnUHJvbXB0c0NvbmZpZycsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ2dldExvY2F0aW9uc1ZhbHVlJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3VuZGVmaW5lZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBjcmVhdGVNb2NrKHVuZGVmaW5lZCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0UHJvbXB0c0NvbmZpZy5nZXRMb2NhdGlvbnNWYWx1ZShjb25maWdTZXJ2aWNlLCBQcm9tcHRzVHlwZS5wcm9tcHQpLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdCdNdXN0IHJlYWQgY29ycmVjdCB2YWx1ZS4nLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ251bGwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb25maWdTZXJ2aWNlID0gY3JlYXRlTW9jayhudWxsKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRQcm9tcHRzQ29uZmlnLmdldExvY2F0aW9uc1ZhbHVlKGNvbmZpZ1NlcnZpY2UsIFByb21wdHNUeXBlLnByb21wdCksXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0J011c3QgcmVhZCBjb3JyZWN0IHZhbHVlLicsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndW5kZWZpbmVkIGZvciBza2lsbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBjcmVhdGVNb2NrKHVuZGVmaW5lZCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0UHJvbXB0c0NvbmZpZy5nZXRMb2NhdGlvbnNWYWx1ZShjb25maWdTZXJ2aWNlLCBQcm9tcHRzVHlwZS5za2lsbCksXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0J011c3QgcmVhZCBjb3JyZWN0IHZhbHVlIGZvciBza2lsbHMuJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdudWxsIGZvciBza2lsbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBjcmVhdGVNb2NrKG51bGwpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdFByb21wdHNDb25maWcuZ2V0TG9jYXRpb25zVmFsdWUoY29uZmlnU2VydmljZSwgUHJvbXB0c1R5cGUuc2tpbGwpLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdCdNdXN0IHJlYWQgY29ycmVjdCB2YWx1ZSBmb3Igc2tpbGxzLicsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ29iamVjdCcsICgpID0+IHtcblx0XHRcdHRlc3QoJ2VtcHR5JywgKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdFByb21wdHNDb25maWcuZ2V0TG9jYXRpb25zVmFsdWUoY3JlYXRlTW9jayh7fSksIFByb21wdHNUeXBlLnByb21wdCksXG5cdFx0XHRcdFx0e30sXG5cdFx0XHRcdFx0J011c3QgcmVhZCBjb3JyZWN0IHZhbHVlLicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnb25seSB2YWxpZCBzdHJpbmdzJywgKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdFByb21wdHNDb25maWcuZ2V0TG9jYXRpb25zVmFsdWUoY3JlYXRlTW9jayh7XG5cdFx0XHRcdFx0XHQnL3Jvb3QvLmJhc2hyYyc6IHRydWUsXG5cdFx0XHRcdFx0XHQnLi4vLi4vZm9sZGVyLy5oaWRkZW4tZm9sZGVyL2NvbmZpZy54bWwnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy9zcnYvd3d3L1B1YmxpY19odG1sLy5odGFjY2Vzcyc6IHRydWUsXG5cdFx0XHRcdFx0XHQnLi4vLi4vYW5vdGhlci5mb2xkZXIvLldFSVJEX0ZJTEUubG9nJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcuL2ZvbGRlci5uYW1lL2ZpbGUubmFtZSc6IHRydWUsXG5cdFx0XHRcdFx0XHQnL21lZGlhL2V4dGVybmFsL2JhY2t1cC50YXIuZ3onOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy9NZWRpYS9leHRlcm5hbC8uc2VjcmV0LmJhY2t1cCc6IHRydWUsXG5cdFx0XHRcdFx0XHQnLi4vcmVsYXRpdmUvcGF0aC50by5maWxlJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcuL2ZvbGRlck5hbWUud2l0aC5kb3RzL21vcmUuZG90cy5leHRlbnNpb24nOiB0cnVlLFxuXHRcdFx0XHRcdFx0J3NvbWUvZm9sZGVyLndpdGguZG90cy9hbm90aGVyLmZpbGUnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy92YXIvbG9ncy9hcHAuMDEuMDUuZXJyb3InOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy4vLnRlbXBmaWxlJzogdHJ1ZSxcblx0XHRcdFx0XHR9KSwgUHJvbXB0c1R5cGUucHJvbXB0KSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHQnL3Jvb3QvLmJhc2hyYyc6IHRydWUsXG5cdFx0XHRcdFx0XHQnLi4vLi4vZm9sZGVyLy5oaWRkZW4tZm9sZGVyL2NvbmZpZy54bWwnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy9zcnYvd3d3L1B1YmxpY19odG1sLy5odGFjY2Vzcyc6IHRydWUsXG5cdFx0XHRcdFx0XHQnLi4vLi4vYW5vdGhlci5mb2xkZXIvLldFSVJEX0ZJTEUubG9nJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcuL2ZvbGRlci5uYW1lL2ZpbGUubmFtZSc6IHRydWUsXG5cdFx0XHRcdFx0XHQnL21lZGlhL2V4dGVybmFsL2JhY2t1cC50YXIuZ3onOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy9NZWRpYS9leHRlcm5hbC8uc2VjcmV0LmJhY2t1cCc6IHRydWUsXG5cdFx0XHRcdFx0XHQnLi4vcmVsYXRpdmUvcGF0aC50by5maWxlJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcuL2ZvbGRlck5hbWUud2l0aC5kb3RzL21vcmUuZG90cy5leHRlbnNpb24nOiB0cnVlLFxuXHRcdFx0XHRcdFx0J3NvbWUvZm9sZGVyLndpdGguZG90cy9hbm90aGVyLmZpbGUnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy92YXIvbG9ncy9hcHAuMDEuMDUuZXJyb3InOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy4vLnRlbXBmaWxlJzogdHJ1ZSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdCdNdXN0IHJlYWQgY29ycmVjdCB2YWx1ZS4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2ZpbHRlcnMgb3V0IG5vbiB2YWxpZCBlbnRyaWVzJywgKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdFByb21wdHNDb25maWcuZ2V0TG9jYXRpb25zVmFsdWUoY3JlYXRlTW9jayh7XG5cdFx0XHRcdFx0XHQnL2V0Yy9ob3N0cy5iYWNrdXAnOiAnXFx0XFxuXFx0Jyxcblx0XHRcdFx0XHRcdCcuL3J1bi50ZXN0cy5zaCc6ICdcXHYnLFxuXHRcdFx0XHRcdFx0Jy4uL2Fzc2V0cy9pbWcvbG9nby52Mi5wbmcnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy9tbnQvc3RvcmFnZS92aWRlby5hcmNoaXZlL2VwaXNvZGUuMDEubWt2JzogZmFsc2UsXG5cdFx0XHRcdFx0XHQnLi4vLmxvY2FsL2Jpbi9zY3JpcHQuc2gnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy91c3IvbG9jYWwvc2hhcmUvLmZvbnRzL0N1c3RvbUZvbnQub3RmJzogJycsXG5cdFx0XHRcdFx0XHQnLi4vLi4vZGV2ZWxvcG1lbnQvYnJhbmNoLm5hbWUvc29tZS50ZXN0JzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcvSG9tZS91c2VyLy5zc2gvY29uZmlnJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcuL2hpZGRlbi5kaXIvLnN1YmhpZGRlbic6ICdcXGYnLFxuXHRcdFx0XHRcdFx0Jy90bXAvLnRlbXAuZm9sZGVyL2NhY2hlLmRiJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcvb3B0L3NvZnR3YXJlL3YzLjIuMS9idWlsZC5sb2cnOiAnICAnLFxuXHRcdFx0XHRcdFx0Jyc6IHRydWUsXG5cdFx0XHRcdFx0XHQnLi9zY3JpcHRzLy5vbGQuYnVpbGQuc2gnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy92YXIvZGF0YS9kYXRhZmlsZS4yMDI1LTAyLTA1Lmpzb24nOiAnXFxuJyxcblx0XHRcdFx0XHRcdCdcXG5cXG4nOiB0cnVlLFxuXHRcdFx0XHRcdFx0J1xcdCc6IHRydWUsXG5cdFx0XHRcdFx0XHQnXFx2JzogdHJ1ZSxcblx0XHRcdFx0XHRcdCdcXGYnOiB0cnVlLFxuXHRcdFx0XHRcdFx0J1xcclxcbic6IHRydWUsXG5cdFx0XHRcdFx0XHQnXFxmXFxmJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcuLi9saWIvc29tZV9saWJyYXJ5LnYxLjAuMS5zbyc6ICdcXHJcXG4nLFxuXHRcdFx0XHRcdFx0Jy9kZXYvc2htLy5zaGFyZWRfcmVzb3VyY2UnOiAxMjM0LFxuXHRcdFx0XHRcdH0pLCBQcm9tcHRzVHlwZS5wcm9tcHQpLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdCcuLi9hc3NldHMvaW1nL2xvZ28udjIucG5nJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcvbW50L3N0b3JhZ2UvdmlkZW8uYXJjaGl2ZS9lcGlzb2RlLjAxLm1rdic6IGZhbHNlLFxuXHRcdFx0XHRcdFx0Jy4uLy5sb2NhbC9iaW4vc2NyaXB0LnNoJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcuLi8uLi9kZXZlbG9wbWVudC9icmFuY2gubmFtZS9zb21lLnRlc3QnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy9Ib21lL3VzZXIvLnNzaC9jb25maWcnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy90bXAvLnRlbXAuZm9sZGVyL2NhY2hlLmRiJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcuL3NjcmlwdHMvLm9sZC5idWlsZC5zaCc6IHRydWUsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHQnTXVzdCByZWFkIGNvcnJlY3QgdmFsdWUuJyxcblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdvbmx5IGludmFsaWQgb3IgZmFsc2UgdmFsdWVzJywgKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdFByb21wdHNDb25maWcuZ2V0TG9jYXRpb25zVmFsdWUoY3JlYXRlTW9jayh7XG5cdFx0XHRcdFx0XHQnL2V0Yy9ob3N0cy5iYWNrdXAnOiAnXFx0XFxuXFx0Jyxcblx0XHRcdFx0XHRcdCcuL3J1bi50ZXN0cy5zaCc6ICdcXHYnLFxuXHRcdFx0XHRcdFx0Jy4uL2Fzc2V0cy9JTUcvbG9nby52Mi5wbmcnOiAnJyxcblx0XHRcdFx0XHRcdCcvbW50L3N0b3JhZ2UvdmlkZW8uYXJjaGl2ZS9lcGlzb2RlLjAxLm1rdic6IGZhbHNlLFxuXHRcdFx0XHRcdFx0Jy91c3IvbG9jYWwvc2hhcmUvLmZvbnRzL0N1c3RvbUZvbnQub3RmJzogJycsXG5cdFx0XHRcdFx0XHQnLi9oaWRkZW4uZGlyLy5zdWJoaWRkZW4nOiAnXFxmJyxcblx0XHRcdFx0XHRcdCcvb3B0L1NvZnR3YXJlL3YzLjIuMS9idWlsZC5sb2cnOiAnICAnLFxuXHRcdFx0XHRcdFx0Jy92YXIvZGF0YS9kYXRhZmlsZS4yMDI1LTAyLTA1Lmpzb24nOiAnXFxuJyxcblx0XHRcdFx0XHRcdCcuLi9saWIvc29tZV9saWJyYXJ5LnYxLjAuMS5zbyc6ICdcXHJcXG4nLFxuXHRcdFx0XHRcdFx0Jy9kZXYvc2htLy5zaGFyZWRfcmVzb3VyY2UnOiAyMzQ1LFxuXHRcdFx0XHRcdH0pLCBQcm9tcHRzVHlwZS5wcm9tcHQpLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdCcvbW50L3N0b3JhZ2UvdmlkZW8uYXJjaGl2ZS9lcGlzb2RlLjAxLm1rdic6IGZhbHNlLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0J011c3QgcmVhZCBjb3JyZWN0IHZhbHVlLicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnc2tpbGwgbG9jYXRpb25zIC0gZW1wdHknLCAoKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0UHJvbXB0c0NvbmZpZy5nZXRMb2NhdGlvbnNWYWx1ZShjcmVhdGVNb2NrKHt9KSwgUHJvbXB0c1R5cGUuc2tpbGwpLFxuXHRcdFx0XHRcdHt9LFxuXHRcdFx0XHRcdCdNdXN0IHJlYWQgY29ycmVjdCB2YWx1ZSBmb3Igc2tpbGxzLicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnc2tpbGwgbG9jYXRpb25zIC0gdmFsaWQgcGF0aHMnLCAoKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0UHJvbXB0c0NvbmZpZy5nZXRMb2NhdGlvbnNWYWx1ZShjcmVhdGVNb2NrKHtcblx0XHRcdFx0XHRcdCcuZ2l0aHViL3NraWxscyc6IHRydWUsXG5cdFx0XHRcdFx0XHQnLmNsYXVkZS9za2lsbHMnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy9jdXN0b20vc2tpbGxzL2ZvbGRlcic6IHRydWUsXG5cdFx0XHRcdFx0XHQnLi9yZWxhdGl2ZS9za2lsbHMnOiB0cnVlLFxuXHRcdFx0XHRcdH0pLCBQcm9tcHRzVHlwZS5za2lsbCksXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0Jy5naXRodWIvc2tpbGxzJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcuY2xhdWRlL3NraWxscyc6IHRydWUsXG5cdFx0XHRcdFx0XHQnL2N1c3RvbS9za2lsbHMvZm9sZGVyJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcuL3JlbGF0aXZlL3NraWxscyc6IHRydWUsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHQnTXVzdCByZWFkIGNvcnJlY3Qgc2tpbGwgbG9jYXRpb25zLicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnc2tpbGwgbG9jYXRpb25zIC0gZmlsdGVycyBpbnZhbGlkIGVudHJpZXMnLCAoKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0UHJvbXB0c0NvbmZpZy5nZXRMb2NhdGlvbnNWYWx1ZShjcmVhdGVNb2NrKHtcblx0XHRcdFx0XHRcdCcuZ2l0aHViL3NraWxscyc6IHRydWUsXG5cdFx0XHRcdFx0XHQnLmNsYXVkZS9za2lsbHMnOiAnXFx0XFxuJyxcblx0XHRcdFx0XHRcdCcvaW52YWxpZC9wYXRoJzogJycsXG5cdFx0XHRcdFx0XHQnJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcuL3ZhbGlkL3NraWxscyc6IHRydWUsXG5cdFx0XHRcdFx0XHQnXFxuJzogdHJ1ZSxcblx0XHRcdFx0XHR9KSwgUHJvbXB0c1R5cGUuc2tpbGwpLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdCcuZ2l0aHViL3NraWxscyc6IHRydWUsXG5cdFx0XHRcdFx0XHQnLi92YWxpZC9za2lsbHMnOiB0cnVlLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0J011c3QgZmlsdGVyIGludmFsaWQgc2tpbGwgbG9jYXRpb25zLicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3NvdXJjZUxvY2F0aW9ucycsICgpID0+IHtcblx0XHR0ZXN0KCd1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb25maWdTZXJ2aWNlID0gY3JlYXRlTW9jayh1bmRlZmluZWQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRnZXRQYXRocyhQcm9tcHRzQ29uZmlnLnByb21wdFNvdXJjZUZvbGRlcnMoY29uZmlnU2VydmljZSwgUHJvbXB0c1R5cGUucHJvbXB0KSksXG5cdFx0XHRcdFtdLFxuXHRcdFx0XHQnTXVzdCByZWFkIGNvcnJlY3QgdmFsdWUuJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdudWxsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29uZmlnU2VydmljZSA9IGNyZWF0ZU1vY2sobnVsbCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdGdldFBhdGhzKFByb21wdHNDb25maWcucHJvbXB0U291cmNlRm9sZGVycyhjb25maWdTZXJ2aWNlLCBQcm9tcHRzVHlwZS5wcm9tcHQpKSxcblx0XHRcdFx0W10sXG5cdFx0XHRcdCdNdXN0IHJlYWQgY29ycmVjdCB2YWx1ZS4nLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCdvYmplY3QnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdlbXB0eScsICgpID0+IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRnZXRQYXRocyhQcm9tcHRzQ29uZmlnLnByb21wdFNvdXJjZUZvbGRlcnMoY3JlYXRlTW9jayh7fSksIFByb21wdHNUeXBlLnByb21wdCkpLFxuXHRcdFx0XHRcdFsnLmdpdGh1Yi9wcm9tcHRzJ10sXG5cdFx0XHRcdFx0J011c3QgcmVhZCBjb3JyZWN0IHZhbHVlLicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnb25seSB2YWxpZCBzdHJpbmdzJywgKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdGdldFBhdGhzKFByb21wdHNDb25maWcucHJvbXB0U291cmNlRm9sZGVycyhjcmVhdGVNb2NrKHtcblx0XHRcdFx0XHRcdCcvcm9vdC8uYmFzaHJjJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcuLi8uLi9mb2xkZXIvLmhpZGRlbi1mb2xkZXIvY29uZmlnLnhtbCc6IHRydWUsXG5cdFx0XHRcdFx0XHQnL3Nydi93d3cvUHVibGljX2h0bWwvLmh0YWNjZXNzJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcuLi8uLi9hbm90aGVyLmZvbGRlci8uV0VJUkRfRklMRS5sb2cnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy4vZm9sZGVyLm5hbWUvZmlsZS5uYW1lJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcvbWVkaWEvZXh0ZXJuYWwvYmFja3VwLnRhci5neic6IHRydWUsXG5cdFx0XHRcdFx0XHQnL01lZGlhL2V4dGVybmFsLy5zZWNyZXQuYmFja3VwJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcuLi9yZWxhdGl2ZS9wYXRoLnRvLmZpbGUnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy4vZm9sZGVyTmFtZS53aXRoLmRvdHMvbW9yZS5kb3RzLmV4dGVuc2lvbic6IHRydWUsXG5cdFx0XHRcdFx0XHQnc29tZS9mb2xkZXIud2l0aC5kb3RzL2Fub3RoZXIuZmlsZSc6IHRydWUsXG5cdFx0XHRcdFx0XHQnL3Zhci9sb2dzL2FwcC4wMS4wNS5lcnJvcic6IHRydWUsXG5cdFx0XHRcdFx0XHQnLkdpdEh1Yi9wcm9tcHRzJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcuLy50ZW1wZmlsZSc6IHRydWUsXG5cdFx0XHRcdFx0fSksIFByb21wdHNUeXBlLnByb21wdCkpLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdCcuZ2l0aHViL3Byb21wdHMnLFxuXHRcdFx0XHRcdFx0Jy9yb290Ly5iYXNocmMnLFxuXHRcdFx0XHRcdFx0Jy4uLy4uL2ZvbGRlci8uaGlkZGVuLWZvbGRlci9jb25maWcueG1sJyxcblx0XHRcdFx0XHRcdCcvc3J2L3d3dy9QdWJsaWNfaHRtbC8uaHRhY2Nlc3MnLFxuXHRcdFx0XHRcdFx0Jy4uLy4uL2Fub3RoZXIuZm9sZGVyLy5XRUlSRF9GSUxFLmxvZycsXG5cdFx0XHRcdFx0XHQnLi9mb2xkZXIubmFtZS9maWxlLm5hbWUnLFxuXHRcdFx0XHRcdFx0Jy9tZWRpYS9leHRlcm5hbC9iYWNrdXAudGFyLmd6Jyxcblx0XHRcdFx0XHRcdCcvTWVkaWEvZXh0ZXJuYWwvLnNlY3JldC5iYWNrdXAnLFxuXHRcdFx0XHRcdFx0Jy4uL3JlbGF0aXZlL3BhdGgudG8uZmlsZScsXG5cdFx0XHRcdFx0XHQnLi9mb2xkZXJOYW1lLndpdGguZG90cy9tb3JlLmRvdHMuZXh0ZW5zaW9uJyxcblx0XHRcdFx0XHRcdCdzb21lL2ZvbGRlci53aXRoLmRvdHMvYW5vdGhlci5maWxlJyxcblx0XHRcdFx0XHRcdCcvdmFyL2xvZ3MvYXBwLjAxLjA1LmVycm9yJyxcblx0XHRcdFx0XHRcdCcuR2l0SHViL3Byb21wdHMnLFxuXHRcdFx0XHRcdFx0Jy4vLnRlbXBmaWxlJyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdCdNdXN0IHJlYWQgY29ycmVjdCB2YWx1ZS4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2ZpbHRlcnMgb3V0IG5vbiB2YWxpZCBlbnRyaWVzJywgKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdGdldFBhdGhzKFByb21wdHNDb25maWcucHJvbXB0U291cmNlRm9sZGVycyhjcmVhdGVNb2NrKHtcblx0XHRcdFx0XHRcdCcvZXRjL2hvc3RzLmJhY2t1cCc6ICdcXHRcXG5cXHQnLFxuXHRcdFx0XHRcdFx0Jy4vcnVuLnRlc3RzLnNoJzogJ1xcdicsXG5cdFx0XHRcdFx0XHQnLi4vYXNzZXRzL2ltZy9sb2dvLnYyLnBuZyc6IHRydWUsXG5cdFx0XHRcdFx0XHQnL21udC9zdG9yYWdlL3ZpZGVvLmFyY2hpdmUvZXBpc29kZS4wMS5ta3YnOiBmYWxzZSxcblx0XHRcdFx0XHRcdCcuLi8ubG9jYWwvYmluL3NjcmlwdC5zaCc6IHRydWUsXG5cdFx0XHRcdFx0XHQnL3Vzci9sb2NhbC9zaGFyZS8uZm9udHMvQ3VzdG9tRm9udC5vdGYnOiAnJyxcblx0XHRcdFx0XHRcdCcuLi8uLi9kZXZlbG9wbWVudC9icmFuY2gubmFtZS9zb21lLnRlc3QnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy5naVRodWIvcHJvbXB0cyc6IHRydWUsXG5cdFx0XHRcdFx0XHQnL0hvbWUvdXNlci8uc3NoL2NvbmZpZyc6IHRydWUsXG5cdFx0XHRcdFx0XHQnLi9oaWRkZW4uZGlyLy5zdWJoaWRkZW4nOiAnXFxmJyxcblx0XHRcdFx0XHRcdCcvdG1wLy50ZW1wLmZvbGRlci9jYWNoZS5kYic6IHRydWUsXG5cdFx0XHRcdFx0XHQnLmdpdGh1Yi9wcm9tcHRzJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcvb3B0L3NvZnR3YXJlL3YzLjIuMS9idWlsZC5sb2cnOiAnICAnLFxuXHRcdFx0XHRcdFx0Jyc6IHRydWUsXG5cdFx0XHRcdFx0XHQnLi9zY3JpcHRzLy5vbGQuYnVpbGQuc2gnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy92YXIvZGF0YS9kYXRhZmlsZS4yMDI1LTAyLTA1Lmpzb24nOiAnXFxuJyxcblx0XHRcdFx0XHRcdCdcXG5cXG4nOiB0cnVlLFxuXHRcdFx0XHRcdFx0J1xcdCc6IHRydWUsXG5cdFx0XHRcdFx0XHQnXFx2JzogdHJ1ZSxcblx0XHRcdFx0XHRcdCdcXGYnOiB0cnVlLFxuXHRcdFx0XHRcdFx0J1xcclxcbic6IHRydWUsXG5cdFx0XHRcdFx0XHQnXFxmXFxmJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcuLi9saWIvc29tZV9saWJyYXJ5LnYxLjAuMS5zbyc6ICdcXHJcXG4nLFxuXHRcdFx0XHRcdFx0Jy9kZXYvc2htLy5zaGFyZWRfcmVzb3VyY2UnOiAyMzQ1LFxuXHRcdFx0XHRcdH0pLCBQcm9tcHRzVHlwZS5wcm9tcHQpKSxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHQnLmdpdGh1Yi9wcm9tcHRzJyxcblx0XHRcdFx0XHRcdCcuLi9hc3NldHMvaW1nL2xvZ28udjIucG5nJyxcblx0XHRcdFx0XHRcdCcuLi8ubG9jYWwvYmluL3NjcmlwdC5zaCcsXG5cdFx0XHRcdFx0XHQnLi4vLi4vZGV2ZWxvcG1lbnQvYnJhbmNoLm5hbWUvc29tZS50ZXN0Jyxcblx0XHRcdFx0XHRcdCcuZ2lUaHViL3Byb21wdHMnLFxuXHRcdFx0XHRcdFx0Jy9Ib21lL3VzZXIvLnNzaC9jb25maWcnLFxuXHRcdFx0XHRcdFx0Jy90bXAvLnRlbXAuZm9sZGVyL2NhY2hlLmRiJyxcblx0XHRcdFx0XHRcdCcuL3NjcmlwdHMvLm9sZC5idWlsZC5zaCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHQnTXVzdCByZWFkIGNvcnJlY3QgdmFsdWUuJyxcblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdvbmx5IGludmFsaWQgb3IgZmFsc2UgdmFsdWVzJywgKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdGdldFBhdGhzKFByb21wdHNDb25maWcucHJvbXB0U291cmNlRm9sZGVycyhjcmVhdGVNb2NrKHtcblx0XHRcdFx0XHRcdCcvZXRjL2hvc3RzLmJhY2t1cCc6ICdcXHRcXG5cXHQnLFxuXHRcdFx0XHRcdFx0Jy4vcnVuLnRlc3RzLnNoJzogJ1xcdicsXG5cdFx0XHRcdFx0XHQnLi4vYXNzZXRzL0lNRy9sb2dvLnYyLnBuZyc6ICcnLFxuXHRcdFx0XHRcdFx0Jy9tbnQvc3RvcmFnZS92aWRlby5hcmNoaXZlL2VwaXNvZGUuMDEubWt2JzogZmFsc2UsXG5cdFx0XHRcdFx0XHQnL3Vzci9sb2NhbC9zaGFyZS8uZm9udHMvQ3VzdG9tRm9udC5vdGYnOiAnJyxcblx0XHRcdFx0XHRcdCcuL2hpZGRlbi5kaXIvLnN1YmhpZGRlbic6ICdcXGYnLFxuXHRcdFx0XHRcdFx0Jy9vcHQvU29mdHdhcmUvdjMuMi4xL2J1aWxkLmxvZyc6ICcgICcsXG5cdFx0XHRcdFx0XHQnL3Zhci9kYXRhL2RhdGFmaWxlLjIwMjUtMDItMDUuanNvbic6ICdcXG4nLFxuXHRcdFx0XHRcdFx0Jy4uL2xpYi9zb21lX2xpYnJhcnkudjEuMC4xLnNvJzogJ1xcclxcbicsXG5cdFx0XHRcdFx0XHQnL2Rldi9zaG0vLnNoYXJlZF9yZXNvdXJjZSc6IDc2NTQsXG5cdFx0XHRcdFx0fSksIFByb21wdHNUeXBlLnByb21wdCkpLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdCcuZ2l0aHViL3Byb21wdHMnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0J011c3QgcmVhZCBjb3JyZWN0IHZhbHVlLicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnZmlsdGVycyBvdXQgZGlzYWJsZWQgZGVmYXVsdCBsb2NhdGlvbicsICgpID0+IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRnZXRQYXRocyhQcm9tcHRzQ29uZmlnLnByb21wdFNvdXJjZUZvbGRlcnMoY3JlYXRlTW9jayh7XG5cdFx0XHRcdFx0XHQnL2V0Yy9ob3N0cy5iYWNrdXAnOiAnXFx0XFxuXFx0Jyxcblx0XHRcdFx0XHRcdCcuL3J1bi50ZXN0cy5zaCc6ICdcXHYnLFxuXHRcdFx0XHRcdFx0Jy5naXRodWIvcHJvbXB0cyc6IGZhbHNlLFxuXHRcdFx0XHRcdFx0Jy4uL2Fzc2V0cy9pbWcvbG9nby52Mi5wbmcnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy9tbnQvc3RvcmFnZS92aWRlby5hcmNoaXZlL2VwaXNvZGUuMDEubWt2JzogZmFsc2UsXG5cdFx0XHRcdFx0XHQnLi4vLmxvY2FsL2Jpbi9zY3JpcHQuc2gnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy91c3IvbG9jYWwvc2hhcmUvLmZvbnRzL0N1c3RvbUZvbnQub3RmJzogJycsXG5cdFx0XHRcdFx0XHQnLi4vLi4vZGV2ZWxvcG1lbnQvYnJhbmNoLm5hbWUvc29tZS50ZXN0JzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcuZ2lUaHViL3Byb21wdHMnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy9Ib21lL3VzZXIvLnNzaC9jb25maWcnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy4vaGlkZGVuLmRpci8uc3ViaGlkZGVuJzogJ1xcZicsXG5cdFx0XHRcdFx0XHQnL3RtcC8udGVtcC5mb2xkZXIvY2FjaGUuZGInOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy9vcHQvc29mdHdhcmUvdjMuMi4xL2J1aWxkLmxvZyc6ICcgICcsXG5cdFx0XHRcdFx0XHQnJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcuL3NjcmlwdHMvLm9sZC5idWlsZC5zaCc6IHRydWUsXG5cdFx0XHRcdFx0XHQnL3Zhci9kYXRhL2RhdGFmaWxlLjIwMjUtMDItMDUuanNvbic6ICdcXG4nLFxuXHRcdFx0XHRcdFx0J1xcblxcbic6IHRydWUsXG5cdFx0XHRcdFx0XHQnXFx0JzogdHJ1ZSxcblx0XHRcdFx0XHRcdCdcXHYnOiB0cnVlLFxuXHRcdFx0XHRcdFx0J1xcZic6IHRydWUsXG5cdFx0XHRcdFx0XHQnXFxyXFxuJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCdcXGZcXGYnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy4uL2xpYi9zb21lX2xpYnJhcnkudjEuMC4xLnNvJzogJ1xcclxcbicsXG5cdFx0XHRcdFx0XHQnL2Rldi9zaG0vLnNoYXJlZF9yZXNvdXJjZSc6IDg1Myxcblx0XHRcdFx0XHR9KSwgUHJvbXB0c1R5cGUucHJvbXB0KSksXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0Jy4uL2Fzc2V0cy9pbWcvbG9nby52Mi5wbmcnLFxuXHRcdFx0XHRcdFx0Jy4uLy5sb2NhbC9iaW4vc2NyaXB0LnNoJyxcblx0XHRcdFx0XHRcdCcuLi8uLi9kZXZlbG9wbWVudC9icmFuY2gubmFtZS9zb21lLnRlc3QnLFxuXHRcdFx0XHRcdFx0Jy5naVRodWIvcHJvbXB0cycsXG5cdFx0XHRcdFx0XHQnL0hvbWUvdXNlci8uc3NoL2NvbmZpZycsXG5cdFx0XHRcdFx0XHQnL3RtcC8udGVtcC5mb2xkZXIvY2FjaGUuZGInLFxuXHRcdFx0XHRcdFx0Jy4vc2NyaXB0cy8ub2xkLmJ1aWxkLnNoJyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdCdNdXN0IHJlYWQgY29ycmVjdCB2YWx1ZS4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnc2tpbGxzJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgndW5kZWZpbmVkIHJldHVybnMgZW1wdHkgYXJyYXknLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBjcmVhdGVNb2NrKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRnZXRQYXRocyhQcm9tcHRzQ29uZmlnLnByb21wdFNvdXJjZUZvbGRlcnMoY29uZmlnU2VydmljZSwgUHJvbXB0c1R5cGUuc2tpbGwpKSxcblx0XHRcdFx0XHRbXSxcblx0XHRcdFx0XHQnTXVzdCByZXR1cm4gZW1wdHkgYXJyYXkgZm9yIHVuZGVmaW5lZCBjb25maWcuJyxcblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdudWxsIHJldHVybnMgZW1wdHkgYXJyYXknLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBjcmVhdGVNb2NrKG51bGwpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0Z2V0UGF0aHMoUHJvbXB0c0NvbmZpZy5wcm9tcHRTb3VyY2VGb2xkZXJzKGNvbmZpZ1NlcnZpY2UsIFByb21wdHNUeXBlLnNraWxsKSksXG5cdFx0XHRcdFx0W10sXG5cdFx0XHRcdFx0J011c3QgcmV0dXJuIGVtcHR5IGFycmF5IGZvciBudWxsIGNvbmZpZy4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2VtcHR5IG9iamVjdCByZXR1cm5zIGRlZmF1bHQgc2tpbGwgZm9sZGVycycsICgpID0+IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRnZXRQYXRocyhQcm9tcHRzQ29uZmlnLnByb21wdFNvdXJjZUZvbGRlcnMoY3JlYXRlTW9jayh7fSksIFByb21wdHNUeXBlLnNraWxsKSksXG5cdFx0XHRcdFx0WycuYWdlbnRzL3NraWxscycsICcuZ2l0aHViL3NraWxscycsICcuY2xhdWRlL3NraWxscycsICd+Ly5hZ2VudHMvc2tpbGxzJywgJ34vLmNvcGlsb3Qvc2tpbGxzJywgJ34vLmNsYXVkZS9za2lsbHMnXSxcblx0XHRcdFx0XHQnTXVzdCByZXR1cm4gZGVmYXVsdCBza2lsbCBmb2xkZXJzLicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnaW5jbHVkZXMgY3VzdG9tIHNraWxsIGZvbGRlcnMnLCAoKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0Z2V0UGF0aHMoUHJvbXB0c0NvbmZpZy5wcm9tcHRTb3VyY2VGb2xkZXJzKGNyZWF0ZU1vY2soe1xuXHRcdFx0XHRcdFx0Jy9jdXN0b20vc2tpbGxzJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcuL2xvY2FsL3NraWxscyc6IHRydWUsXG5cdFx0XHRcdFx0fSksIFByb21wdHNUeXBlLnNraWxsKSksXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0Jy5hZ2VudHMvc2tpbGxzJyxcblx0XHRcdFx0XHRcdCcuZ2l0aHViL3NraWxscycsXG5cdFx0XHRcdFx0XHQnLmNsYXVkZS9za2lsbHMnLFxuXHRcdFx0XHRcdFx0J34vLmFnZW50cy9za2lsbHMnLFxuXHRcdFx0XHRcdFx0J34vLmNvcGlsb3Qvc2tpbGxzJyxcblx0XHRcdFx0XHRcdCd+Ly5jbGF1ZGUvc2tpbGxzJyxcblx0XHRcdFx0XHRcdCcvY3VzdG9tL3NraWxscycsXG5cdFx0XHRcdFx0XHQnLi9sb2NhbC9za2lsbHMnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0J011c3QgaW5jbHVkZSBjdXN0b20gc2tpbGwgZm9sZGVycy4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2ZpbHRlcnMgb3V0IGRpc2FibGVkIGRlZmF1bHQgc2tpbGwgZm9sZGVycycsICgpID0+IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRnZXRQYXRocyhQcm9tcHRzQ29uZmlnLnByb21wdFNvdXJjZUZvbGRlcnMoY3JlYXRlTW9jayh7XG5cdFx0XHRcdFx0XHQnLmdpdGh1Yi9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHRcdCcvY3VzdG9tL3NraWxscyc6IHRydWUsXG5cdFx0XHRcdFx0fSksIFByb21wdHNUeXBlLnNraWxsKSksXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0Jy5hZ2VudHMvc2tpbGxzJyxcblx0XHRcdFx0XHRcdCcuY2xhdWRlL3NraWxscycsXG5cdFx0XHRcdFx0XHQnfi8uYWdlbnRzL3NraWxscycsXG5cdFx0XHRcdFx0XHQnfi8uY29waWxvdC9za2lsbHMnLFxuXHRcdFx0XHRcdFx0J34vLmNsYXVkZS9za2lsbHMnLFxuXHRcdFx0XHRcdFx0Jy9jdXN0b20vc2tpbGxzJyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdCdNdXN0IGZpbHRlciBvdXQgZGlzYWJsZWQgLmdpdGh1Yi9za2lsbHMgZm9sZGVyLicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnZmlsdGVycyBvdXQgYWxsIGRpc2FibGVkIGRlZmF1bHQgc2tpbGwgZm9sZGVycycsICgpID0+IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRnZXRQYXRocyhQcm9tcHRzQ29uZmlnLnByb21wdFNvdXJjZUZvbGRlcnMoY3JlYXRlTW9jayh7XG5cdFx0XHRcdFx0XHQnLmdpdGh1Yi9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHRcdCcuYWdlbnRzL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHRcdFx0Jy5jbGF1ZGUvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdFx0XHQnfi8uY29waWxvdC9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHRcdCd+Ly5hZ2VudHMvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdFx0XHQnfi8uY2xhdWRlL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHRcdFx0Jy9vbmx5L2N1c3RvbS9za2lsbHMnOiB0cnVlLFxuXHRcdFx0XHRcdH0pLCBQcm9tcHRzVHlwZS5za2lsbCkpLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdCcvb25seS9jdXN0b20vc2tpbGxzJyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdCdNdXN0IGZpbHRlciBvdXQgYWxsIGRpc2FibGVkIGRlZmF1bHQgZm9sZGVycy4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2ZpbHRlcnMgb3V0IGludmFsaWQgZW50cmllcycsICgpID0+IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRnZXRQYXRocyhQcm9tcHRzQ29uZmlnLnByb21wdFNvdXJjZUZvbGRlcnMoY3JlYXRlTW9jayh7XG5cdFx0XHRcdFx0XHQnL3ZhbGlkL3NraWxscyc6IHRydWUsXG5cdFx0XHRcdFx0XHQnL2ludmFsaWQvcGF0aCc6ICdcXHRcXG4nLFxuXHRcdFx0XHRcdFx0Jyc6IHRydWUsXG5cdFx0XHRcdFx0XHQnLi9hbm90aGVyL3ZhbGlkJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCdcXG4nOiB0cnVlLFxuXHRcdFx0XHRcdH0pLCBQcm9tcHRzVHlwZS5za2lsbCkpLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdCcuYWdlbnRzL3NraWxscycsXG5cdFx0XHRcdFx0XHQnLmdpdGh1Yi9za2lsbHMnLFxuXHRcdFx0XHRcdFx0Jy5jbGF1ZGUvc2tpbGxzJyxcblx0XHRcdFx0XHRcdCd+Ly5hZ2VudHMvc2tpbGxzJyxcblx0XHRcdFx0XHRcdCd+Ly5jb3BpbG90L3NraWxscycsXG5cdFx0XHRcdFx0XHQnfi8uY2xhdWRlL3NraWxscycsXG5cdFx0XHRcdFx0XHQnL3ZhbGlkL3NraWxscycsXG5cdFx0XHRcdFx0XHQnLi9hbm90aGVyL3ZhbGlkJyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdCdNdXN0IGZpbHRlciBvdXQgaW52YWxpZCBlbnRyaWVzLicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnaW5jbHVkZXMgYWxsIGRlZmF1bHQgZm9sZGVycyB3aGVuIGV4cGxpY2l0bHkgZW5hYmxlZCcsICgpID0+IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRnZXRQYXRocyhQcm9tcHRzQ29uZmlnLnByb21wdFNvdXJjZUZvbGRlcnMoY3JlYXRlTW9jayh7XG5cdFx0XHRcdFx0XHQnLmdpdGh1Yi9za2lsbHMnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy5hZ2VudHMvc2tpbGxzJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcuY2xhdWRlL3NraWxscyc6IHRydWUsXG5cdFx0XHRcdFx0XHQnfi8uY29waWxvdC9za2lsbHMnOiB0cnVlLFxuXHRcdFx0XHRcdFx0J34vLmFnZW50cy9za2lsbHMnOiB0cnVlLFxuXHRcdFx0XHRcdFx0J34vLmNsYXVkZS9za2lsbHMnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy9leHRyYS9za2lsbHMnOiB0cnVlLFxuXHRcdFx0XHRcdH0pLCBQcm9tcHRzVHlwZS5za2lsbCkpLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdCcuYWdlbnRzL3NraWxscycsXG5cdFx0XHRcdFx0XHQnLmdpdGh1Yi9za2lsbHMnLFxuXHRcdFx0XHRcdFx0Jy5jbGF1ZGUvc2tpbGxzJyxcblx0XHRcdFx0XHRcdCd+Ly5hZ2VudHMvc2tpbGxzJyxcblx0XHRcdFx0XHRcdCd+Ly5jb3BpbG90L3NraWxscycsXG5cdFx0XHRcdFx0XHQnfi8uY2xhdWRlL3NraWxscycsXG5cdFx0XHRcdFx0XHQnL2V4dHJhL3NraWxscycsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHQnTXVzdCBpbmNsdWRlIGFsbCBkZWZhdWx0IGZvbGRlcnMuJyxcblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsK0NBQStDO0FBT3hELFNBQVMsU0FBUyxTQUEwQztBQUMzRCxTQUFPLFFBQVEsSUFB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
