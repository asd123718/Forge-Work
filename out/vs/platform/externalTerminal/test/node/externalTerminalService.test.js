import { deepStrictEqual, strictEqual } from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { DEFAULT_TERMINAL_OSX } from "../../common/externalTerminal.js";
import { LinuxExternalTerminalService, MacExternalTerminalService, WindowsExternalTerminalService } from "../../node/externalTerminalService.js";
const mockConfig = Object.freeze({
  terminal: {
    explorerKind: "external",
    external: {
      windowsExec: "testWindowsShell",
      osxExec: "testOSXShell",
      linuxExec: "testLinuxShell"
    }
  }
});
suite("ExternalTerminalService", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test(`WinTerminalService - uses terminal from configuration`, (done) => {
    const testShell = "cmd";
    const testCwd = "path/to/workspace";
    const mockSpawner = {
      spawn: (command, args, opts) => {
        strictEqual(command, testShell, "shell should equal expected");
        strictEqual(args[args.length - 1], mockConfig.terminal.external.windowsExec);
        strictEqual(opts.cwd, testCwd);
        done();
        return {
          on: (evt) => evt
        };
      }
    };
    const testService = new WindowsExternalTerminalService();
    testService.spawnTerminal(
      mockSpawner,
      mockConfig.terminal.external,
      testShell,
      testCwd
    );
  });
  test(`WinTerminalService - uses default terminal when configuration.terminal.external.windowsExec is undefined`, (done) => {
    const testShell = "cmd";
    const testCwd = "path/to/workspace";
    const mockSpawner = {
      spawn: (command, args, opts) => {
        strictEqual(args[args.length - 1], WindowsExternalTerminalService.getDefaultTerminalWindows());
        done();
        return {
          on: (evt) => evt
        };
      }
    };
    mockConfig.terminal.external.windowsExec = void 0;
    const testService = new WindowsExternalTerminalService();
    testService.spawnTerminal(
      mockSpawner,
      mockConfig.terminal.external,
      testShell,
      testCwd
    );
  });
  test(`WinTerminalService - cwd is correct regardless of case`, (done) => {
    const testShell = "cmd";
    const testCwd = "c:/foo";
    const mockSpawner = {
      spawn: (command, args, opts) => {
        strictEqual(opts.cwd, "C:/foo", "cwd should be uppercase regardless of the case that's passed in");
        done();
        return {
          on: (evt) => evt
        };
      }
    };
    const testService = new WindowsExternalTerminalService();
    testService.spawnTerminal(
      mockSpawner,
      mockConfig.terminal.external,
      testShell,
      testCwd
    );
  });
  test(`WinTerminalService - cmder should be spawned differently`, (done) => {
    const testShell = "cmd";
    const testCwd = "c:/foo";
    const mockSpawner = {
      spawn: (command, args, opts) => {
        deepStrictEqual(args, ["C:/foo"]);
        strictEqual(opts, void 0);
        done();
        return { on: (evt) => evt };
      }
    };
    const testService = new WindowsExternalTerminalService();
    testService.spawnTerminal(
      mockSpawner,
      { windowsExec: "cmder" },
      testShell,
      testCwd
    );
  });
  test(`WinTerminalService - windows terminal should open workspace directory`, (done) => {
    const testShell = "wt";
    const testCwd = "c:/foo";
    const mockSpawner = {
      spawn: (command, args, opts) => {
        strictEqual(opts.cwd, "C:/foo");
        done();
        return { on: (evt) => evt };
      }
    };
    const testService = new WindowsExternalTerminalService();
    testService.spawnTerminal(
      mockSpawner,
      mockConfig.terminal.external,
      testShell,
      testCwd
    );
  });
  test(`MacTerminalService - uses terminal from configuration`, (done) => {
    const testCwd = "path/to/workspace";
    const mockSpawner = {
      spawn: (command, args, opts) => {
        strictEqual(args[1], mockConfig.terminal.external.osxExec);
        done();
        return {
          on: (evt) => evt
        };
      }
    };
    const testService = new MacExternalTerminalService();
    testService.spawnTerminal(
      mockSpawner,
      mockConfig.terminal.external,
      testCwd
    );
  });
  test(`MacTerminalService - uses default terminal when configuration.terminal.external.osxExec is undefined`, (done) => {
    const testCwd = "path/to/workspace";
    const mockSpawner = {
      spawn: (command, args, opts) => {
        strictEqual(args[1], DEFAULT_TERMINAL_OSX);
        done();
        return {
          on: (evt) => evt
        };
      }
    };
    const testService = new MacExternalTerminalService();
    testService.spawnTerminal(
      mockSpawner,
      { osxExec: void 0 },
      testCwd
    );
  });
  test(`MacTerminalService - Ghostty.app should be spawned correctly`, (done) => {
    const testCwd = "path/to/workspace";
    const mockSpawner = {
      spawn: (command, args, opts) => {
        strictEqual(command, "/usr/bin/open");
        strictEqual(args[0], "-a");
        strictEqual(args[1], "Ghostty.app");
        strictEqual(args[2], testCwd);
        strictEqual(opts.cwd, testCwd);
        done();
        return {
          on: (evt) => evt
        };
      }
    };
    const testService = new MacExternalTerminalService();
    testService.spawnTerminal(
      mockSpawner,
      { osxExec: "Ghostty.app" },
      testCwd
    );
  });
  test(`LinuxTerminalService - uses terminal from configuration`, (done) => {
    const testCwd = "path/to/workspace";
    const mockSpawner = {
      spawn: (command, args, opts) => {
        strictEqual(command, mockConfig.terminal.external.linuxExec);
        strictEqual(opts.cwd, testCwd);
        done();
        return {
          on: (evt) => evt
        };
      }
    };
    const testService = new LinuxExternalTerminalService();
    testService.spawnTerminal(
      mockSpawner,
      mockConfig.terminal.external,
      testCwd
    );
  });
  test(`LinuxTerminalService - Ghostty should be spawned with working directory`, (done) => {
    const testCwd = "path/to/workspace";
    const mockSpawner = {
      spawn: (command, args, opts) => {
        strictEqual(command, "ghostty");
        deepStrictEqual(args, [`--working-directory=${testCwd}`]);
        strictEqual(opts.cwd, testCwd);
        done();
        return {
          on: (evt) => evt
        };
      }
    };
    const testService = new LinuxExternalTerminalService();
    testService.spawnTerminal(
      mockSpawner,
      { linuxExec: "ghostty" },
      testCwd
    );
  });
  test(`LinuxTerminalService - uses default terminal when configuration.terminal.external.linuxExec is undefined`, (done) => {
    LinuxExternalTerminalService.getDefaultTerminalLinuxReady().then((defaultTerminalLinux) => {
      const testCwd = "path/to/workspace";
      const mockSpawner = {
        spawn: (command, args, opts) => {
          strictEqual(command, defaultTerminalLinux);
          done();
          return {
            on: (evt) => evt
          };
        }
      };
      mockConfig.terminal.external.linuxExec = void 0;
      const testService = new LinuxExternalTerminalService();
      testService.spawnTerminal(
        mockSpawner,
        mockConfig.terminal.external,
        testCwd
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZXh0ZXJuYWxUZXJtaW5hbFxcdGVzdFxcbm9kZVxcZXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRlZXBTdHJpY3RFcXVhbCwgc3RyaWN0RXF1YWwgfSBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX1RFUk1JTkFMX09TWCwgSUV4dGVybmFsVGVybWluYWxDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dGVybmFsVGVybWluYWwuanMnO1xuaW1wb3J0IHsgTGludXhFeHRlcm5hbFRlcm1pbmFsU2VydmljZSwgTWFjRXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UsIFdpbmRvd3NFeHRlcm5hbFRlcm1pbmFsU2VydmljZSB9IGZyb20gJy4uLy4uL25vZGUvZXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UuanMnO1xuXG5jb25zdCBtb2NrQ29uZmlnID0gT2JqZWN0LmZyZWV6ZTxJRXh0ZXJuYWxUZXJtaW5hbENvbmZpZ3VyYXRpb24+KHtcblx0dGVybWluYWw6IHtcblx0XHRleHBsb3JlcktpbmQ6ICdleHRlcm5hbCcsXG5cdFx0ZXh0ZXJuYWw6IHtcblx0XHRcdHdpbmRvd3NFeGVjOiAndGVzdFdpbmRvd3NTaGVsbCcsXG5cdFx0XHRvc3hFeGVjOiAndGVzdE9TWFNoZWxsJyxcblx0XHRcdGxpbnV4RXhlYzogJ3Rlc3RMaW51eFNoZWxsJ1xuXHRcdH1cblx0fVxufSk7XG5cbnN1aXRlKCdFeHRlcm5hbFRlcm1pbmFsU2VydmljZScsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdChgV2luVGVybWluYWxTZXJ2aWNlIC0gdXNlcyB0ZXJtaW5hbCBmcm9tIGNvbmZpZ3VyYXRpb25gLCBkb25lID0+IHtcblx0XHRjb25zdCB0ZXN0U2hlbGwgPSAnY21kJztcblx0XHRjb25zdCB0ZXN0Q3dkID0gJ3BhdGgvdG8vd29ya3NwYWNlJztcblx0XHRjb25zdCBtb2NrU3Bhd25lcjogYW55ID0ge1xuXHRcdFx0c3Bhd246IChjb21tYW5kOiBhbnksIGFyZ3M6IGFueSwgb3B0czogYW55KSA9PiB7XG5cdFx0XHRcdHN0cmljdEVxdWFsKGNvbW1hbmQsIHRlc3RTaGVsbCwgJ3NoZWxsIHNob3VsZCBlcXVhbCBleHBlY3RlZCcpO1xuXHRcdFx0XHRzdHJpY3RFcXVhbChhcmdzW2FyZ3MubGVuZ3RoIC0gMV0sIG1vY2tDb25maWcudGVybWluYWwuZXh0ZXJuYWwud2luZG93c0V4ZWMpO1xuXHRcdFx0XHRzdHJpY3RFcXVhbChvcHRzLmN3ZCwgdGVzdEN3ZCk7XG5cdFx0XHRcdGRvbmUoKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRvbjogKGV2dDogYW55KSA9PiBldnRcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gbmV3IFdpbmRvd3NFeHRlcm5hbFRlcm1pbmFsU2VydmljZSgpO1xuXHRcdHRlc3RTZXJ2aWNlLnNwYXduVGVybWluYWwoXG5cdFx0XHRtb2NrU3Bhd25lcixcblx0XHRcdG1vY2tDb25maWcudGVybWluYWwuZXh0ZXJuYWwsXG5cdFx0XHR0ZXN0U2hlbGwsXG5cdFx0XHR0ZXN0Q3dkXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdChgV2luVGVybWluYWxTZXJ2aWNlIC0gdXNlcyBkZWZhdWx0IHRlcm1pbmFsIHdoZW4gY29uZmlndXJhdGlvbi50ZXJtaW5hbC5leHRlcm5hbC53aW5kb3dzRXhlYyBpcyB1bmRlZmluZWRgLCBkb25lID0+IHtcblx0XHRjb25zdCB0ZXN0U2hlbGwgPSAnY21kJztcblx0XHRjb25zdCB0ZXN0Q3dkID0gJ3BhdGgvdG8vd29ya3NwYWNlJztcblx0XHRjb25zdCBtb2NrU3Bhd25lcjogYW55ID0ge1xuXHRcdFx0c3Bhd246IChjb21tYW5kOiBhbnksIGFyZ3M6IGFueSwgb3B0czogYW55KSA9PiB7XG5cdFx0XHRcdHN0cmljdEVxdWFsKGFyZ3NbYXJncy5sZW5ndGggLSAxXSwgV2luZG93c0V4dGVybmFsVGVybWluYWxTZXJ2aWNlLmdldERlZmF1bHRUZXJtaW5hbFdpbmRvd3MoKSk7XG5cdFx0XHRcdGRvbmUoKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRvbjogKGV2dDogYW55KSA9PiBldnRcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdG1vY2tDb25maWcudGVybWluYWwuZXh0ZXJuYWwud2luZG93c0V4ZWMgPSB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBuZXcgV2luZG93c0V4dGVybmFsVGVybWluYWxTZXJ2aWNlKCk7XG5cdFx0dGVzdFNlcnZpY2Uuc3Bhd25UZXJtaW5hbChcblx0XHRcdG1vY2tTcGF3bmVyLFxuXHRcdFx0bW9ja0NvbmZpZy50ZXJtaW5hbC5leHRlcm5hbCxcblx0XHRcdHRlc3RTaGVsbCxcblx0XHRcdHRlc3RDd2Rcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KGBXaW5UZXJtaW5hbFNlcnZpY2UgLSBjd2QgaXMgY29ycmVjdCByZWdhcmRsZXNzIG9mIGNhc2VgLCBkb25lID0+IHtcblx0XHRjb25zdCB0ZXN0U2hlbGwgPSAnY21kJztcblx0XHRjb25zdCB0ZXN0Q3dkID0gJ2M6L2Zvbyc7XG5cdFx0Y29uc3QgbW9ja1NwYXduZXI6IGFueSA9IHtcblx0XHRcdHNwYXduOiAoY29tbWFuZDogYW55LCBhcmdzOiBhbnksIG9wdHM6IGFueSkgPT4ge1xuXHRcdFx0XHRzdHJpY3RFcXVhbChvcHRzLmN3ZCwgJ0M6L2ZvbycsICdjd2Qgc2hvdWxkIGJlIHVwcGVyY2FzZSByZWdhcmRsZXNzIG9mIHRoZSBjYXNlIHRoYXRcXCdzIHBhc3NlZCBpbicpO1xuXHRcdFx0XHRkb25lKCk7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0b246IChldnQ6IGFueSkgPT4gZXZ0XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCB0ZXN0U2VydmljZSA9IG5ldyBXaW5kb3dzRXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UoKTtcblx0XHR0ZXN0U2VydmljZS5zcGF3blRlcm1pbmFsKFxuXHRcdFx0bW9ja1NwYXduZXIsXG5cdFx0XHRtb2NrQ29uZmlnLnRlcm1pbmFsLmV4dGVybmFsLFxuXHRcdFx0dGVzdFNoZWxsLFxuXHRcdFx0dGVzdEN3ZFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoYFdpblRlcm1pbmFsU2VydmljZSAtIGNtZGVyIHNob3VsZCBiZSBzcGF3bmVkIGRpZmZlcmVudGx5YCwgZG9uZSA9PiB7XG5cdFx0Y29uc3QgdGVzdFNoZWxsID0gJ2NtZCc7XG5cdFx0Y29uc3QgdGVzdEN3ZCA9ICdjOi9mb28nO1xuXHRcdGNvbnN0IG1vY2tTcGF3bmVyOiBhbnkgPSB7XG5cdFx0XHRzcGF3bjogKGNvbW1hbmQ6IGFueSwgYXJnczogYW55LCBvcHRzOiBhbnkpID0+IHtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKGFyZ3MsIFsnQzovZm9vJ10pO1xuXHRcdFx0XHRzdHJpY3RFcXVhbChvcHRzLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRkb25lKCk7XG5cdFx0XHRcdHJldHVybiB7IG9uOiAoZXZ0OiBhbnkpID0+IGV2dCB9O1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBuZXcgV2luZG93c0V4dGVybmFsVGVybWluYWxTZXJ2aWNlKCk7XG5cdFx0dGVzdFNlcnZpY2Uuc3Bhd25UZXJtaW5hbChcblx0XHRcdG1vY2tTcGF3bmVyLFxuXHRcdFx0eyB3aW5kb3dzRXhlYzogJ2NtZGVyJyB9LFxuXHRcdFx0dGVzdFNoZWxsLFxuXHRcdFx0dGVzdEN3ZFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoYFdpblRlcm1pbmFsU2VydmljZSAtIHdpbmRvd3MgdGVybWluYWwgc2hvdWxkIG9wZW4gd29ya3NwYWNlIGRpcmVjdG9yeWAsIGRvbmUgPT4ge1xuXHRcdGNvbnN0IHRlc3RTaGVsbCA9ICd3dCc7XG5cdFx0Y29uc3QgdGVzdEN3ZCA9ICdjOi9mb28nO1xuXHRcdGNvbnN0IG1vY2tTcGF3bmVyOiBhbnkgPSB7XG5cdFx0XHRzcGF3bjogKGNvbW1hbmQ6IGFueSwgYXJnczogYW55LCBvcHRzOiBhbnkpID0+IHtcblx0XHRcdFx0c3RyaWN0RXF1YWwob3B0cy5jd2QsICdDOi9mb28nKTtcblx0XHRcdFx0ZG9uZSgpO1xuXHRcdFx0XHRyZXR1cm4geyBvbjogKGV2dDogYW55KSA9PiBldnQgfTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gbmV3IFdpbmRvd3NFeHRlcm5hbFRlcm1pbmFsU2VydmljZSgpO1xuXHRcdHRlc3RTZXJ2aWNlLnNwYXduVGVybWluYWwoXG5cdFx0XHRtb2NrU3Bhd25lcixcblx0XHRcdG1vY2tDb25maWcudGVybWluYWwuZXh0ZXJuYWwsXG5cdFx0XHR0ZXN0U2hlbGwsXG5cdFx0XHR0ZXN0Q3dkXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdChgTWFjVGVybWluYWxTZXJ2aWNlIC0gdXNlcyB0ZXJtaW5hbCBmcm9tIGNvbmZpZ3VyYXRpb25gLCBkb25lID0+IHtcblx0XHRjb25zdCB0ZXN0Q3dkID0gJ3BhdGgvdG8vd29ya3NwYWNlJztcblx0XHRjb25zdCBtb2NrU3Bhd25lcjogYW55ID0ge1xuXHRcdFx0c3Bhd246IChjb21tYW5kOiBhbnksIGFyZ3M6IGFueSwgb3B0czogYW55KSA9PiB7XG5cdFx0XHRcdHN0cmljdEVxdWFsKGFyZ3NbMV0sIG1vY2tDb25maWcudGVybWluYWwuZXh0ZXJuYWwub3N4RXhlYyk7XG5cdFx0XHRcdGRvbmUoKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRvbjogKGV2dDogYW55KSA9PiBldnRcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gbmV3IE1hY0V4dGVybmFsVGVybWluYWxTZXJ2aWNlKCk7XG5cdFx0dGVzdFNlcnZpY2Uuc3Bhd25UZXJtaW5hbChcblx0XHRcdG1vY2tTcGF3bmVyLFxuXHRcdFx0bW9ja0NvbmZpZy50ZXJtaW5hbC5leHRlcm5hbCxcblx0XHRcdHRlc3RDd2Rcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KGBNYWNUZXJtaW5hbFNlcnZpY2UgLSB1c2VzIGRlZmF1bHQgdGVybWluYWwgd2hlbiBjb25maWd1cmF0aW9uLnRlcm1pbmFsLmV4dGVybmFsLm9zeEV4ZWMgaXMgdW5kZWZpbmVkYCwgZG9uZSA9PiB7XG5cdFx0Y29uc3QgdGVzdEN3ZCA9ICdwYXRoL3RvL3dvcmtzcGFjZSc7XG5cdFx0Y29uc3QgbW9ja1NwYXduZXI6IGFueSA9IHtcblx0XHRcdHNwYXduOiAoY29tbWFuZDogYW55LCBhcmdzOiBhbnksIG9wdHM6IGFueSkgPT4ge1xuXHRcdFx0XHRzdHJpY3RFcXVhbChhcmdzWzFdLCBERUZBVUxUX1RFUk1JTkFMX09TWCk7XG5cdFx0XHRcdGRvbmUoKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRvbjogKGV2dDogYW55KSA9PiBldnRcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gbmV3IE1hY0V4dGVybmFsVGVybWluYWxTZXJ2aWNlKCk7XG5cdFx0dGVzdFNlcnZpY2Uuc3Bhd25UZXJtaW5hbChcblx0XHRcdG1vY2tTcGF3bmVyLFxuXHRcdFx0eyBvc3hFeGVjOiB1bmRlZmluZWQgfSxcblx0XHRcdHRlc3RDd2Rcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KGBNYWNUZXJtaW5hbFNlcnZpY2UgLSBHaG9zdHR5LmFwcCBzaG91bGQgYmUgc3Bhd25lZCBjb3JyZWN0bHlgLCBkb25lID0+IHtcblx0XHRjb25zdCB0ZXN0Q3dkID0gJ3BhdGgvdG8vd29ya3NwYWNlJztcblx0XHRjb25zdCBtb2NrU3Bhd25lcjogYW55ID0ge1xuXHRcdFx0c3Bhd246IChjb21tYW5kOiBhbnksIGFyZ3M6IGFueSwgb3B0czogYW55KSA9PiB7XG5cdFx0XHRcdHN0cmljdEVxdWFsKGNvbW1hbmQsICcvdXNyL2Jpbi9vcGVuJyk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKGFyZ3NbMF0sICctYScpO1xuXHRcdFx0XHRzdHJpY3RFcXVhbChhcmdzWzFdLCAnR2hvc3R0eS5hcHAnKTtcblx0XHRcdFx0c3RyaWN0RXF1YWwoYXJnc1syXSwgdGVzdEN3ZCk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKG9wdHMuY3dkLCB0ZXN0Q3dkKTtcblx0XHRcdFx0ZG9uZSgpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdG9uOiAoZXZ0OiBhbnkpID0+IGV2dFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBuZXcgTWFjRXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UoKTtcblx0XHR0ZXN0U2VydmljZS5zcGF3blRlcm1pbmFsKFxuXHRcdFx0bW9ja1NwYXduZXIsXG5cdFx0XHR7IG9zeEV4ZWM6ICdHaG9zdHR5LmFwcCcgfSxcblx0XHRcdHRlc3RDd2Rcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KGBMaW51eFRlcm1pbmFsU2VydmljZSAtIHVzZXMgdGVybWluYWwgZnJvbSBjb25maWd1cmF0aW9uYCwgZG9uZSA9PiB7XG5cdFx0Y29uc3QgdGVzdEN3ZCA9ICdwYXRoL3RvL3dvcmtzcGFjZSc7XG5cdFx0Y29uc3QgbW9ja1NwYXduZXI6IGFueSA9IHtcblx0XHRcdHNwYXduOiAoY29tbWFuZDogYW55LCBhcmdzOiBhbnksIG9wdHM6IGFueSkgPT4ge1xuXHRcdFx0XHRzdHJpY3RFcXVhbChjb21tYW5kLCBtb2NrQ29uZmlnLnRlcm1pbmFsLmV4dGVybmFsLmxpbnV4RXhlYyk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKG9wdHMuY3dkLCB0ZXN0Q3dkKTtcblx0XHRcdFx0ZG9uZSgpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdG9uOiAoZXZ0OiBhbnkpID0+IGV2dFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBuZXcgTGludXhFeHRlcm5hbFRlcm1pbmFsU2VydmljZSgpO1xuXHRcdHRlc3RTZXJ2aWNlLnNwYXduVGVybWluYWwoXG5cdFx0XHRtb2NrU3Bhd25lcixcblx0XHRcdG1vY2tDb25maWcudGVybWluYWwuZXh0ZXJuYWwsXG5cdFx0XHR0ZXN0Q3dkXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdChgTGludXhUZXJtaW5hbFNlcnZpY2UgLSBHaG9zdHR5IHNob3VsZCBiZSBzcGF3bmVkIHdpdGggd29ya2luZyBkaXJlY3RvcnlgLCBkb25lID0+IHtcblx0XHRjb25zdCB0ZXN0Q3dkID0gJ3BhdGgvdG8vd29ya3NwYWNlJztcblx0XHRjb25zdCBtb2NrU3Bhd25lcjogYW55ID0ge1xuXHRcdFx0c3Bhd246IChjb21tYW5kOiBhbnksIGFyZ3M6IGFueSwgb3B0czogYW55KSA9PiB7XG5cdFx0XHRcdHN0cmljdEVxdWFsKGNvbW1hbmQsICdnaG9zdHR5Jyk7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChhcmdzLCBbYC0td29ya2luZy1kaXJlY3Rvcnk9JHt0ZXN0Q3dkfWBdKTtcblx0XHRcdFx0c3RyaWN0RXF1YWwob3B0cy5jd2QsIHRlc3RDd2QpO1xuXHRcdFx0XHRkb25lKCk7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0b246IChldnQ6IGFueSkgPT4gZXZ0XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCB0ZXN0U2VydmljZSA9IG5ldyBMaW51eEV4dGVybmFsVGVybWluYWxTZXJ2aWNlKCk7XG5cdFx0dGVzdFNlcnZpY2Uuc3Bhd25UZXJtaW5hbChcblx0XHRcdG1vY2tTcGF3bmVyLFxuXHRcdFx0eyBsaW51eEV4ZWM6ICdnaG9zdHR5JyB9LFxuXHRcdFx0dGVzdEN3ZFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoYExpbnV4VGVybWluYWxTZXJ2aWNlIC0gdXNlcyBkZWZhdWx0IHRlcm1pbmFsIHdoZW4gY29uZmlndXJhdGlvbi50ZXJtaW5hbC5leHRlcm5hbC5saW51eEV4ZWMgaXMgdW5kZWZpbmVkYCwgZG9uZSA9PiB7XG5cdFx0TGludXhFeHRlcm5hbFRlcm1pbmFsU2VydmljZS5nZXREZWZhdWx0VGVybWluYWxMaW51eFJlYWR5KCkudGhlbihkZWZhdWx0VGVybWluYWxMaW51eCA9PiB7XG5cdFx0XHRjb25zdCB0ZXN0Q3dkID0gJ3BhdGgvdG8vd29ya3NwYWNlJztcblx0XHRcdGNvbnN0IG1vY2tTcGF3bmVyOiBhbnkgPSB7XG5cdFx0XHRcdHNwYXduOiAoY29tbWFuZDogYW55LCBhcmdzOiBhbnksIG9wdHM6IGFueSkgPT4ge1xuXHRcdFx0XHRcdHN0cmljdEVxdWFsKGNvbW1hbmQsIGRlZmF1bHRUZXJtaW5hbExpbnV4KTtcblx0XHRcdFx0XHRkb25lKCk7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdG9uOiAoZXZ0OiBhbnkpID0+IGV2dFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHRtb2NrQ29uZmlnLnRlcm1pbmFsLmV4dGVybmFsLmxpbnV4RXhlYyA9IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gbmV3IExpbnV4RXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UoKTtcblx0XHRcdHRlc3RTZXJ2aWNlLnNwYXduVGVybWluYWwoXG5cdFx0XHRcdG1vY2tTcGF3bmVyLFxuXHRcdFx0XHRtb2NrQ29uZmlnLnRlcm1pbmFsLmV4dGVybmFsLFxuXHRcdFx0XHR0ZXN0Q3dkXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxpQkFBaUIsbUJBQW1CO0FBQzdDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsNEJBQTREO0FBQ3JFLFNBQVMsOEJBQThCLDRCQUE0QixzQ0FBc0M7QUFFekcsTUFBTSxhQUFhLE9BQU8sT0FBdUM7QUFBQSxFQUNoRSxVQUFVO0FBQUEsSUFDVCxjQUFjO0FBQUEsSUFDZCxVQUFVO0FBQUEsTUFDVCxhQUFhO0FBQUEsTUFDYixTQUFTO0FBQUEsTUFDVCxXQUFXO0FBQUEsSUFDWjtBQUFBLEVBQ0Q7QUFDRCxDQUFDO0FBRUQsTUFBTSwyQkFBMkIsTUFBTTtBQUN0QywwQ0FBd0M7QUFFeEMsT0FBSyx5REFBeUQsVUFBUTtBQUNyRSxVQUFNLFlBQVk7QUFDbEIsVUFBTSxVQUFVO0FBQ2hCLFVBQU0sY0FBbUI7QUFBQSxNQUN4QixPQUFPLENBQUMsU0FBYyxNQUFXLFNBQWM7QUFDOUMsb0JBQVksU0FBUyxXQUFXLDZCQUE2QjtBQUM3RCxvQkFBWSxLQUFLLEtBQUssU0FBUyxDQUFDLEdBQUcsV0FBVyxTQUFTLFNBQVMsV0FBVztBQUMzRSxvQkFBWSxLQUFLLEtBQUssT0FBTztBQUM3QixhQUFLO0FBQ0wsZUFBTztBQUFBLFVBQ04sSUFBSSxDQUFDLFFBQWE7QUFBQSxRQUNuQjtBQUFBLE1BQ0Q7QUFB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
