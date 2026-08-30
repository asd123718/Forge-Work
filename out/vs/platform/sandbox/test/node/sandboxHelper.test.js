import { deepStrictEqual, strictEqual } from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { SandboxHelperService } from "../../node/sandboxHelper.js";
suite("SandboxHelperService", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("does not inspect sandbox dependencies on non-Linux platforms", async () => {
    let findCalled = false;
    const result = await SandboxHelperService.checkSandboxDependenciesWith(async () => {
      findCalled = true;
      return void 0;
    }, false);
    strictEqual(result, void 0);
    strictEqual(findCalled, false);
  });
  test("reports missing bubblewrap without running its capability probe", async () => {
    let probeCalled = false;
    const result = await SandboxHelperService.checkSandboxDependenciesWith(
      async (command) => command === "socat" ? "/usr/bin/socat" : void 0,
      true,
      async () => {
        probeCalled = true;
        return { usable: true };
      }
    );
    strictEqual(probeCalled, false);
    strictEqual(result?.bubblewrapInstalled, false);
    strictEqual(result?.bubblewrapUsable, false);
    strictEqual(result?.socatInstalled, true);
  });
  test("reports bubblewrap usable when its capability probe succeeds", async () => {
    let probedCommand;
    const result = await SandboxHelperService.checkSandboxDependenciesWith(
      async (command) => `/usr/bin/${command}`,
      true,
      async (command) => {
        probedCommand = command;
        return { usable: true };
      }
    );
    strictEqual(probedCommand, "/usr/bin/bwrap");
    deepStrictEqual(result, {
      bubblewrapInstalled: true,
      bubblewrapUsable: true,
      bubblewrapError: void 0,
      socatInstalled: true,
      dependencyInstallCommand: void 0
    });
  });
  test("reports the probe error when bubblewrap is unusable", async () => {
    const result = await SandboxHelperService.checkSandboxDependenciesWith(
      async (command) => `/usr/bin/${command}`,
      true,
      async () => ({ usable: false, error: "No permissions to create namespace" }),
      void 0,
      async () => true
    );
    deepStrictEqual(result, {
      bubblewrapInstalled: true,
      bubblewrapUsable: false,
      bubblewrapError: "No permissions to create namespace",
      socatInstalled: true,
      dependencyInstallCommand: void 0,
      apparmorRestrictsUnprivilegedUserNamespaces: true
    });
  });
  for (const [distributionId, packageManager, expectedCommand] of [
    ["debian", "apt-get", "sudo apt-get update && sudo apt-get install -y"],
    ["ubuntu", "apt", "sudo apt update && sudo apt install -y"],
    ["fedora", "dnf", "sudo dnf install -y"],
    ["centos", "yum", "sudo yum install -y"],
    ["arch", "pacman", "sudo pacman -S --needed --noconfirm"],
    ["opensuse", "zypper", "sudo zypper --non-interactive install"],
    ["alpine", "apk", "sudo apk add"]
  ]) {
    test(`detects ${packageManager} for dependency installation`, async () => {
      const result = await SandboxHelperService.checkSandboxDependenciesWith(
        async (command) => command === "socat" || command === "sudo" || command === packageManager ? `/usr/bin/${command}` : void 0,
        true,
        void 0,
        async () => ({ distributionIds: [distributionId], isRoot: false })
      );
      strictEqual(result?.dependencyInstallCommand, expectedCommand);
    });
  }
  test("uses ID_LIKE to detect a derivative distribution", async () => {
    const result = await SandboxHelperService.checkSandboxDependenciesWith(
      async (command) => ["socat", "sudo", "dnf"].includes(command) ? `/usr/bin/${command}` : void 0,
      true,
      void 0,
      async () => ({ distributionIds: ["custom-linux", "fedora"], isRoot: false })
    );
    strictEqual(result?.dependencyInstallCommand, "sudo dnf install -y");
  });
  test("uses the native package manager when multiple managers are available", async () => {
    const result = await SandboxHelperService.checkSandboxDependenciesWith(
      async (command) => ["socat", "sudo", "apt-get", "pacman"].includes(command) ? `/usr/bin/${command}` : void 0,
      true,
      void 0,
      async () => ({ distributionIds: ["arch"], isRoot: false })
    );
    strictEqual(result?.dependencyInstallCommand, "sudo pacman -S --needed --noconfirm");
  });
  test("does not use sudo when running as root", async () => {
    const result = await SandboxHelperService.checkSandboxDependenciesWith(
      async (command) => ["socat", "apk"].includes(command) ? `/usr/bin/${command}` : void 0,
      true,
      void 0,
      async () => ({ distributionIds: ["alpine"], isRoot: true })
    );
    strictEqual(result?.dependencyInstallCommand, "apk add");
  });
  test("does not use sudo for chained apt-get commands when running as root", async () => {
    const result = await SandboxHelperService.checkSandboxDependenciesWith(
      async (command) => ["socat", "apt-get"].includes(command) ? `/usr/bin/${command}` : void 0,
      true,
      void 0,
      async () => ({ distributionIds: ["debian"], isRoot: true })
    );
    strictEqual(result?.dependencyInstallCommand, "apt-get update && apt-get install -y");
  });
  test("does not offer dependency installation to a non-root user without sudo", async () => {
    const result = await SandboxHelperService.checkSandboxDependenciesWith(
      async (command) => ["socat", "pacman"].includes(command) ? `/usr/bin/${command}` : void 0,
      true,
      void 0,
      async () => ({ distributionIds: ["arch"], isRoot: false })
    );
    strictEqual(result?.dependencyInstallCommand, void 0);
  });
  test("does not offer dependency installation without a supported package manager", async () => {
    const result = await SandboxHelperService.checkSandboxDependenciesWith(
      async (command) => command === "socat" ? "/usr/bin/socat" : void 0,
      true,
      void 0,
      async () => ({ distributionIds: ["unknown"], isRoot: false })
    );
    strictEqual(result?.dependencyInstallCommand, void 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcc2FuZGJveFxcdGVzdFxcbm9kZVxcc2FuZGJveEhlbHBlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGVlcFN0cmljdEVxdWFsLCBzdHJpY3RFcXVhbCB9IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFNhbmRib3hIZWxwZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9zYW5kYm94SGVscGVyLmpzJztcblxuc3VpdGUoJ1NhbmRib3hIZWxwZXJTZXJ2aWNlJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBpbnNwZWN0IHNhbmRib3ggZGVwZW5kZW5jaWVzIG9uIG5vbi1MaW51eCBwbGF0Zm9ybXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGZpbmRDYWxsZWQgPSBmYWxzZTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBTYW5kYm94SGVscGVyU2VydmljZS5jaGVja1NhbmRib3hEZXBlbmRlbmNpZXNXaXRoKGFzeW5jICgpID0+IHtcblx0XHRcdGZpbmRDYWxsZWQgPSB0cnVlO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9LCBmYWxzZSk7XG5cblx0XHRzdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0c3RyaWN0RXF1YWwoZmluZENhbGxlZCwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBvcnRzIG1pc3NpbmcgYnViYmxld3JhcCB3aXRob3V0IHJ1bm5pbmcgaXRzIGNhcGFiaWxpdHkgcHJvYmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHByb2JlQ2FsbGVkID0gZmFsc2U7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgU2FuZGJveEhlbHBlclNlcnZpY2UuY2hlY2tTYW5kYm94RGVwZW5kZW5jaWVzV2l0aChcblx0XHRcdGFzeW5jIGNvbW1hbmQgPT4gY29tbWFuZCA9PT0gJ3NvY2F0JyA/ICcvdXNyL2Jpbi9zb2NhdCcgOiB1bmRlZmluZWQsXG5cdFx0XHR0cnVlLFxuXHRcdFx0YXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRwcm9iZUNhbGxlZCA9IHRydWU7XG5cdFx0XHRcdHJldHVybiB7IHVzYWJsZTogdHJ1ZSB9O1xuXHRcdFx0fSxcblx0XHQpO1xuXG5cdFx0c3RyaWN0RXF1YWwocHJvYmVDYWxsZWQsIGZhbHNlKTtcblx0XHRzdHJpY3RFcXVhbChyZXN1bHQ/LmJ1YmJsZXdyYXBJbnN0YWxsZWQsIGZhbHNlKTtcblx0XHRzdHJpY3RFcXVhbChyZXN1bHQ/LmJ1YmJsZXdyYXBVc2FibGUsIGZhbHNlKTtcblx0XHRzdHJpY3RFcXVhbChyZXN1bHQ/LnNvY2F0SW5zdGFsbGVkLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgncmVwb3J0cyBidWJibGV3cmFwIHVzYWJsZSB3aGVuIGl0cyBjYXBhYmlsaXR5IHByb2JlIHN1Y2NlZWRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBwcm9iZWRDb21tYW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgU2FuZGJveEhlbHBlclNlcnZpY2UuY2hlY2tTYW5kYm94RGVwZW5kZW5jaWVzV2l0aChcblx0XHRcdGFzeW5jIGNvbW1hbmQgPT4gYC91c3IvYmluLyR7Y29tbWFuZH1gLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdGFzeW5jIGNvbW1hbmQgPT4ge1xuXHRcdFx0XHRwcm9iZWRDb21tYW5kID0gY29tbWFuZDtcblx0XHRcdFx0cmV0dXJuIHsgdXNhYmxlOiB0cnVlIH07XG5cdFx0XHR9LFxuXHRcdCk7XG5cblx0XHRzdHJpY3RFcXVhbChwcm9iZWRDb21tYW5kLCAnL3Vzci9iaW4vYndyYXAnKTtcblx0XHRkZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRidWJibGV3cmFwSW5zdGFsbGVkOiB0cnVlLFxuXHRcdFx0YnViYmxld3JhcFVzYWJsZTogdHJ1ZSxcblx0XHRcdGJ1YmJsZXdyYXBFcnJvcjogdW5kZWZpbmVkLFxuXHRcdFx0c29jYXRJbnN0YWxsZWQ6IHRydWUsXG5cdFx0XHRkZXBlbmRlbmN5SW5zdGFsbENvbW1hbmQ6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVwb3J0cyB0aGUgcHJvYmUgZXJyb3Igd2hlbiBidWJibGV3cmFwIGlzIHVudXNhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IFNhbmRib3hIZWxwZXJTZXJ2aWNlLmNoZWNrU2FuZGJveERlcGVuZGVuY2llc1dpdGgoXG5cdFx0XHRhc3luYyBjb21tYW5kID0+IGAvdXNyL2Jpbi8ke2NvbW1hbmR9YCxcblx0XHRcdHRydWUsXG5cdFx0XHRhc3luYyAoKSA9PiAoeyB1c2FibGU6IGZhbHNlLCBlcnJvcjogJ05vIHBlcm1pc3Npb25zIHRvIGNyZWF0ZSBuYW1lc3BhY2UnIH0pLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0YXN5bmMgKCkgPT4gdHJ1ZSxcblx0XHQpO1xuXG5cdFx0ZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0YnViYmxld3JhcEluc3RhbGxlZDogdHJ1ZSxcblx0XHRcdGJ1YmJsZXdyYXBVc2FibGU6IGZhbHNlLFxuXHRcdFx0YnViYmxld3JhcEVycm9yOiAnTm8gcGVybWlzc2lvbnMgdG8gY3JlYXRlIG5hbWVzcGFjZScsXG5cdFx0XHRzb2NhdEluc3RhbGxlZDogdHJ1ZSxcblx0XHRcdGRlcGVuZGVuY3lJbnN0YWxsQ29tbWFuZDogdW5kZWZpbmVkLFxuXHRcdFx0YXBwYXJtb3JSZXN0cmljdHNVbnByaXZpbGVnZWRVc2VyTmFtZXNwYWNlczogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0Zm9yIChjb25zdCBbZGlzdHJpYnV0aW9uSWQsIHBhY2thZ2VNYW5hZ2VyLCBleHBlY3RlZENvbW1hbmRdIG9mIFtcblx0XHRbJ2RlYmlhbicsICdhcHQtZ2V0JywgJ3N1ZG8gYXB0LWdldCB1cGRhdGUgJiYgc3VkbyBhcHQtZ2V0IGluc3RhbGwgLXknXSxcblx0XHRbJ3VidW50dScsICdhcHQnLCAnc3VkbyBhcHQgdXBkYXRlICYmIHN1ZG8gYXB0IGluc3RhbGwgLXknXSxcblx0XHRbJ2ZlZG9yYScsICdkbmYnLCAnc3VkbyBkbmYgaW5zdGFsbCAteSddLFxuXHRcdFsnY2VudG9zJywgJ3l1bScsICdzdWRvIHl1bSBpbnN0YWxsIC15J10sXG5cdFx0WydhcmNoJywgJ3BhY21hbicsICdzdWRvIHBhY21hbiAtUyAtLW5lZWRlZCAtLW5vY29uZmlybSddLFxuXHRcdFsnb3BlbnN1c2UnLCAnenlwcGVyJywgJ3N1ZG8genlwcGVyIC0tbm9uLWludGVyYWN0aXZlIGluc3RhbGwnXSxcblx0XHRbJ2FscGluZScsICdhcGsnLCAnc3VkbyBhcGsgYWRkJ10sXG5cdF0gYXMgY29uc3QpIHtcblx0XHR0ZXN0KGBkZXRlY3RzICR7cGFja2FnZU1hbmFnZXJ9IGZvciBkZXBlbmRlbmN5IGluc3RhbGxhdGlvbmAsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IFNhbmRib3hIZWxwZXJTZXJ2aWNlLmNoZWNrU2FuZGJveERlcGVuZGVuY2llc1dpdGgoXG5cdFx0XHRcdGFzeW5jIGNvbW1hbmQgPT4gY29tbWFuZCA9PT0gJ3NvY2F0JyB8fCBjb21tYW5kID09PSAnc3VkbycgfHwgY29tbWFuZCA9PT0gcGFja2FnZU1hbmFnZXIgPyBgL3Vzci9iaW4vJHtjb21tYW5kfWAgOiB1bmRlZmluZWQsXG5cdFx0XHRcdHRydWUsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0YXN5bmMgKCkgPT4gKHsgZGlzdHJpYnV0aW9uSWRzOiBbZGlzdHJpYnV0aW9uSWRdLCBpc1Jvb3Q6IGZhbHNlIH0pLFxuXHRcdFx0KTtcblxuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0Py5kZXBlbmRlbmN5SW5zdGFsbENvbW1hbmQsIGV4cGVjdGVkQ29tbWFuZCk7XG5cdFx0fSk7XG5cdH1cblxuXHR0ZXN0KCd1c2VzIElEX0xJS0UgdG8gZGV0ZWN0IGEgZGVyaXZhdGl2ZSBkaXN0cmlidXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgU2FuZGJveEhlbHBlclNlcnZpY2UuY2hlY2tTYW5kYm94RGVwZW5kZW5jaWVzV2l0aChcblx0XHRcdGFzeW5jIGNvbW1hbmQgPT4gWydzb2NhdCcsICdzdWRvJywgJ2RuZiddLmluY2x1ZGVzKGNvbW1hbmQpID8gYC91c3IvYmluLyR7Y29tbWFuZH1gIDogdW5kZWZpbmVkLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdGFzeW5jICgpID0+ICh7IGRpc3RyaWJ1dGlvbklkczogWydjdXN0b20tbGludXgnLCAnZmVkb3JhJ10sIGlzUm9vdDogZmFsc2UgfSksXG5cdFx0KTtcblxuXHRcdHN0cmljdEVxdWFsKHJlc3VsdD8uZGVwZW5kZW5jeUluc3RhbGxDb21tYW5kLCAnc3VkbyBkbmYgaW5zdGFsbCAteScpO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIHRoZSBuYXRpdmUgcGFja2FnZSBtYW5hZ2VyIHdoZW4gbXVsdGlwbGUgbWFuYWdlcnMgYXJlIGF2YWlsYWJsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBTYW5kYm94SGVscGVyU2VydmljZS5jaGVja1NhbmRib3hEZXBlbmRlbmNpZXNXaXRoKFxuXHRcdFx0YXN5bmMgY29tbWFuZCA9PiBbJ3NvY2F0JywgJ3N1ZG8nLCAnYXB0LWdldCcsICdwYWNtYW4nXS5pbmNsdWRlcyhjb21tYW5kKSA/IGAvdXNyL2Jpbi8ke2NvbW1hbmR9YCA6IHVuZGVmaW5lZCxcblx0XHRcdHRydWUsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRhc3luYyAoKSA9PiAoeyBkaXN0cmlidXRpb25JZHM6IFsnYXJjaCddLCBpc1Jvb3Q6IGZhbHNlIH0pLFxuXHRcdCk7XG5cblx0XHRzdHJpY3RFcXVhbChyZXN1bHQ/LmRlcGVuZGVuY3lJbnN0YWxsQ29tbWFuZCwgJ3N1ZG8gcGFjbWFuIC1TIC0tbmVlZGVkIC0tbm9jb25maXJtJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHVzZSBzdWRvIHdoZW4gcnVubmluZyBhcyByb290JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IFNhbmRib3hIZWxwZXJTZXJ2aWNlLmNoZWNrU2FuZGJveERlcGVuZGVuY2llc1dpdGgoXG5cdFx0XHRhc3luYyBjb21tYW5kID0+IFsnc29jYXQnLCAnYXBrJ10uaW5jbHVkZXMoY29tbWFuZCkgPyBgL3Vzci9iaW4vJHtjb21tYW5kfWAgOiB1bmRlZmluZWQsXG5cdFx0XHR0cnVlLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0YXN5bmMgKCkgPT4gKHsgZGlzdHJpYnV0aW9uSWRzOiBbJ2FscGluZSddLCBpc1Jvb3Q6IHRydWUgfSksXG5cdFx0KTtcblxuXHRcdHN0cmljdEVxdWFsKHJlc3VsdD8uZGVwZW5kZW5jeUluc3RhbGxDb21tYW5kLCAnYXBrIGFkZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCB1c2Ugc3VkbyBmb3IgY2hhaW5lZCBhcHQtZ2V0IGNvbW1hbmRzIHdoZW4gcnVubmluZyBhcyByb290JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IFNhbmRib3hIZWxwZXJTZXJ2aWNlLmNoZWNrU2FuZGJveERlcGVuZGVuY2llc1dpdGgoXG5cdFx0XHRhc3luYyBjb21tYW5kID0+IFsnc29jYXQnLCAnYXB0LWdldCddLmluY2x1ZGVzKGNvbW1hbmQpID8gYC91c3IvYmluLyR7Y29tbWFuZH1gIDogdW5kZWZpbmVkLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdGFzeW5jICgpID0+ICh7IGRpc3RyaWJ1dGlvbklkczogWydkZWJpYW4nXSwgaXNSb290OiB0cnVlIH0pLFxuXHRcdCk7XG5cblx0XHRzdHJpY3RFcXVhbChyZXN1bHQ/LmRlcGVuZGVuY3lJbnN0YWxsQ29tbWFuZCwgJ2FwdC1nZXQgdXBkYXRlICYmIGFwdC1nZXQgaW5zdGFsbCAteScpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBvZmZlciBkZXBlbmRlbmN5IGluc3RhbGxhdGlvbiB0byBhIG5vbi1yb290IHVzZXIgd2l0aG91dCBzdWRvJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IFNhbmRib3hIZWxwZXJTZXJ2aWNlLmNoZWNrU2FuZGJveERlcGVuZGVuY2llc1dpdGgoXG5cdFx0XHRhc3luYyBjb21tYW5kID0+IFsnc29jYXQnLCAncGFjbWFuJ10uaW5jbHVkZXMoY29tbWFuZCkgPyBgL3Vzci9iaW4vJHtjb21tYW5kfWAgOiB1bmRlZmluZWQsXG5cdFx0XHR0cnVlLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0YXN5bmMgKCkgPT4gKHsgZGlzdHJpYnV0aW9uSWRzOiBbJ2FyY2gnXSwgaXNSb290OiBmYWxzZSB9KSxcblx0XHQpO1xuXG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0Py5kZXBlbmRlbmN5SW5zdGFsbENvbW1hbmQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IG9mZmVyIGRlcGVuZGVuY3kgaW5zdGFsbGF0aW9uIHdpdGhvdXQgYSBzdXBwb3J0ZWQgcGFja2FnZSBtYW5hZ2VyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IFNhbmRib3hIZWxwZXJTZXJ2aWNlLmNoZWNrU2FuZGJveERlcGVuZGVuY2llc1dpdGgoXG5cdFx0XHRhc3luYyBjb21tYW5kID0+IGNvbW1hbmQgPT09ICdzb2NhdCcgPyAnL3Vzci9iaW4vc29jYXQnIDogdW5kZWZpbmVkLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdGFzeW5jICgpID0+ICh7IGRpc3RyaWJ1dGlvbklkczogWyd1bmtub3duJ10sIGlzUm9vdDogZmFsc2UgfSksXG5cdFx0KTtcblxuXHRcdHN0cmljdEVxdWFsKHJlc3VsdD8uZGVwZW5kZW5jeUluc3RhbGxDb21tYW5kLCB1bmRlZmluZWQpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxpQkFBaUIsbUJBQW1CO0FBQzdDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsNEJBQTRCO0FBRXJDLE1BQU0sd0JBQXdCLE1BQU07QUFDbkMsMENBQXdDO0FBRXhDLE9BQUssZ0VBQWdFLFlBQVk7QUFDaEYsUUFBSSxhQUFhO0FBQ2pCLFVBQU0sU0FBUyxNQUFNLHFCQUFxQiw2QkFBNkIsWUFBWTtBQUNsRixtQkFBYTtBQUNiLGFBQU87QUFBQSxJQUNSLEdBQUcsS0FBSztBQUVSLGdCQUFZLFFBQVEsTUFBUztBQUM3QixnQkFBWSxZQUFZLEtBQUs7QUFBQSxFQUM5QixDQUFDO0FBRUQsT0FBSyxtRUFBbUUsWUFBWTtBQUNuRixRQUFJLGNBQWM7QUFDbEIsVUFBTSxTQUFTLE1BQU0scUJB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
