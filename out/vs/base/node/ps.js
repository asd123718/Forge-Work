import { exec } from "child_process";
import { totalmem } from "os";
import { FileAccess } from "../common/network.js";
import { isWindows } from "../common/platform.js";
const JS_FILENAME_PATTERN = /[a-zA-Z-]+\.js\b/g;
function listProcesses(rootPid) {
  return new Promise((resolve, reject) => {
    let rootItem;
    const map = /* @__PURE__ */ new Map();
    const totalMemory = totalmem();
    function addToTree(pid, ppid, cmd, load, mem) {
      const parent = map.get(ppid);
      if (pid === rootPid || parent) {
        const item = {
          name: findName(cmd),
          cmd,
          pid,
          ppid,
          load,
          mem: isWindows ? mem : totalMemory * (mem / 100)
        };
        map.set(pid, item);
        if (pid === rootPid) {
          rootItem = item;
        }
        if (parent) {
          if (!parent.children) {
            parent.children = [];
          }
          parent.children.push(item);
          if (parent.children.length > 1) {
            parent.children = parent.children.sort((a, b) => a.pid - b.pid);
          }
        }
      }
    }
    function findName(cmd) {
      const UTILITY_NETWORK_HINT = /--utility-sub-type=network/i;
      const WINDOWS_CRASH_REPORTER = /--crashes-directory/i;
      const CONPTY = /conhost\.exe.+--headless/i;
      const TYPE = /--type=([a-zA-Z-]+)/;
      if (WINDOWS_CRASH_REPORTER.exec(cmd)) {
        return "electron-crash-reporter";
      }
      if (CONPTY.exec(cmd)) {
        return "conpty-agent";
      }
      let matches = TYPE.exec(cmd);
      if (matches && matches.length === 2) {
        if (matches[1] === "renderer") {
          return `window`;
        } else if (matches[1] === "utility") {
          if (UTILITY_NETWORK_HINT.exec(cmd)) {
            return "utility-network-service";
          }
          return "utility-process";
        } else if (matches[1] === "extensionHost") {
          return "extension-host";
        }
        return matches[1];
      }
      if (cmd.indexOf("node ") < 0 && cmd.indexOf("node.exe") < 0) {
        let result = "";
        do {
          matches = JS_FILENAME_PATTERN.exec(cmd);
          if (matches) {
            result += matches + " ";
          }
        } while (matches);
        if (result) {
          return `electron-nodejs (${result.trim()})`;
        }
      }
      return cmd;
    }
    if (process.platform === "win32") {
      const cleanUNCPrefix = (value) => {
        if (value.indexOf("\\\\?\\") === 0) {
          return value.substring(4);
        } else if (value.indexOf("\\??\\") === 0) {
          return value.substring(4);
        } else if (value.indexOf('"\\\\?\\') === 0) {
          return '"' + value.substring(5);
        } else if (value.indexOf('"\\??\\') === 0) {
          return '"' + value.substring(5);
        } else {
          return value;
        }
      };
      import("@vscode/windows-process-tree").then((windowsProcessTree) => {
        windowsProcessTree.getProcessList(rootPid, (processList) => {
          if (!processList) {
            reject(new Error(`Root process ${rootPid} not found`));
            return;
          }
          windowsProcessTree.getProcessCpuUsage(processList, (completeProcessList) => {
            const processItems = /* @__PURE__ */ new Map();
            completeProcessList.forEach((process2) => {
              const commandLine = cleanUNCPrefix(process2.commandLine || "");
              processItems.set(process2.pid, {
                name: findName(commandLine),
                cmd: commandLine,
                pid: process2.pid,
                ppid: process2.ppid,
                load: process2.cpu || 0,
                mem: process2.memory || 0
              });
            });
            rootItem = processItems.get(rootPid);
            if (rootItem) {
              processItems.forEach((item) => {
                const parent = processItems.get(item.ppid);
                if (parent) {
                  if (!parent.children) {
                    parent.children = [];
                  }
                  parent.children.push(item);
                }
              });
              processItems.forEach((item) => {
                if (item.children) {
                  item.children = item.children.sort((a, b) => a.pid - b.pid);
                }
              });
              resolve(rootItem);
            } else {
              reject(new Error(`Root process ${rootPid} not found`));
            }
          });
        }, windowsProcessTree.ProcessDataFlag.CommandLine | windowsProcessTree.ProcessDataFlag.Memory);
      });
    } else {
      let calculateLinuxCpuUsage2 = function() {
        let processes = [rootItem];
        const pids = [];
        while (processes.length) {
          const process2 = processes.shift();
          if (process2) {
            pids.push(process2.pid);
            if (process2.children) {
              processes = processes.concat(process2.children);
            }
          }
        }
        let cmd = JSON.stringify(FileAccess.asFileUri("vs/base/node/cpuUsage.sh").fsPath);
        cmd += " " + pids.join(" ");
        exec(cmd, {}, (err, stdout, stderr) => {
          if (err || stderr) {
            reject(err || new Error(stderr.toString()));
          } else {
            const cpuUsage = stdout.toString().split("\n");
            for (let i = 0; i < pids.length; i++) {
              const processInfo = map.get(pids[i]);
              processInfo.load = parseFloat(cpuUsage[i]);
            }
            if (!rootItem) {
              reject(new Error(`Root process ${rootPid} not found`));
              return;
            }
            resolve(rootItem);
          }
        });
      };
      var calculateLinuxCpuUsage = calculateLinuxCpuUsage2;
      exec("which ps", {}, (err, stdout, stderr) => {
        if (err || stderr) {
          if (process.platform !== "linux") {
            reject(err || new Error(stderr.toString()));
          } else {
            const cmd = JSON.stringify(FileAccess.asFileUri("vs/base/node/ps.sh").fsPath);
            exec(cmd, {}, (err2, stdout2, stderr2) => {
              if (err2 || stderr2) {
                reject(err2 || new Error(stderr2.toString()));
              } else {
                parsePsOutput(stdout2, addToTree);
                calculateLinuxCpuUsage2();
              }
            });
          }
        } else {
          const ps = stdout.toString().trim();
          const args = "-ax -o pid=,ppid=,pcpu=,pmem=,command=";
          exec(`${ps} ${args}`, { maxBuffer: 1e3 * 1024, env: { LC_NUMERIC: "en_US.UTF-8" } }, (err2, stdout2, stderr2) => {
            if (err2 || stderr2 && !stderr2.includes("screen size is bogus")) {
              reject(err2 || new Error(stderr2.toString()));
            } else {
              parsePsOutput(stdout2, addToTree);
              if (process.platform === "linux") {
                calculateLinuxCpuUsage2();
              } else {
                if (!rootItem) {
                  reject(new Error(`Root process ${rootPid} not found`));
                } else {
                  resolve(rootItem);
                }
              }
            }
          });
        }
      });
    }
  });
}
function parsePsOutput(stdout, addToTree) {
  const PID_CMD = /^\s*([0-9]+)\s+([0-9]+)\s+([0-9]+\.[0-9]+)\s+([0-9]+\.[0-9]+)\s+(.+)$/;
  const lines = stdout.toString().split("\n");
  for (const line of lines) {
    const matches = PID_CMD.exec(line.trim());
    if (matches && matches.length === 6) {
      addToTree(parseInt(matches[1]), parseInt(matches[2]), matches[5], parseFloat(matches[3]), parseFloat(matches[4]));
    }
  }
}
export {
  JS_FILENAME_PATTERN,
  listProcesses
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxub2RlXFxwcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGV4ZWMgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IHRvdGFsbWVtIH0gZnJvbSAnb3MnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcyB9IGZyb20gJy4uL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFByb2Nlc3NJdGVtIH0gZnJvbSAnLi4vY29tbW9uL3Byb2Nlc3Nlcy5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MgfSBmcm9tICcuLi9jb21tb24vcGxhdGZvcm0uanMnO1xuXG5leHBvcnQgY29uc3QgSlNfRklMRU5BTUVfUEFUVEVSTiA9IC9bYS16QS1aLV0rXFwuanNcXGIvZztcblxuZXhwb3J0IGZ1bmN0aW9uIGxpc3RQcm9jZXNzZXMocm9vdFBpZDogbnVtYmVyKTogUHJvbWlzZTxQcm9jZXNzSXRlbT4ge1xuXHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdGxldCByb290SXRlbTogUHJvY2Vzc0l0ZW0gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgbWFwID0gbmV3IE1hcDxudW1iZXIsIFByb2Nlc3NJdGVtPigpO1xuXHRcdGNvbnN0IHRvdGFsTWVtb3J5ID0gdG90YWxtZW0oKTtcblxuXHRcdGZ1bmN0aW9uIGFkZFRvVHJlZShwaWQ6IG51bWJlciwgcHBpZDogbnVtYmVyLCBjbWQ6IHN0cmluZywgbG9hZDogbnVtYmVyLCBtZW06IG51bWJlcikge1xuXHRcdFx0Y29uc3QgcGFyZW50ID0gbWFwLmdldChwcGlkKTtcblx0XHRcdGlmIChwaWQgPT09IHJvb3RQaWQgfHwgcGFyZW50KSB7XG5cdFx0XHRcdGNvbnN0IGl0ZW06IFByb2Nlc3NJdGVtID0ge1xuXHRcdFx0XHRcdG5hbWU6IGZpbmROYW1lKGNtZCksXG5cdFx0XHRcdFx0Y21kLFxuXHRcdFx0XHRcdHBpZCxcblx0XHRcdFx0XHRwcGlkLFxuXHRcdFx0XHRcdGxvYWQsXG5cdFx0XHRcdFx0bWVtOiBpc1dpbmRvd3MgPyBtZW0gOiAodG90YWxNZW1vcnkgKiAobWVtIC8gMTAwKSlcblx0XHRcdFx0fTtcblx0XHRcdFx0bWFwLnNldChwaWQsIGl0ZW0pO1xuXG5cdFx0XHRcdGlmIChwaWQgPT09IHJvb3RQaWQpIHtcblx0XHRcdFx0XHRyb290SXRlbSA9IGl0ZW07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAocGFyZW50KSB7XG5cdFx0XHRcdFx0aWYgKCFwYXJlbnQuY2hpbGRyZW4pIHtcblx0XHRcdFx0XHRcdHBhcmVudC5jaGlsZHJlbiA9IFtdO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRwYXJlbnQuY2hpbGRyZW4ucHVzaChpdGVtKTtcblx0XHRcdFx0XHRpZiAocGFyZW50LmNoaWxkcmVuLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0XHRcdHBhcmVudC5jaGlsZHJlbiA9IHBhcmVudC5jaGlsZHJlbi5zb3J0KChhLCBiKSA9PiBhLnBpZCAtIGIucGlkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRmdW5jdGlvbiBmaW5kTmFtZShjbWQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0XHRjb25zdCBVVElMSVRZX05FVFdPUktfSElOVCA9IC8tLXV0aWxpdHktc3ViLXR5cGU9bmV0d29yay9pO1xuXHRcdFx0Y29uc3QgV0lORE9XU19DUkFTSF9SRVBPUlRFUiA9IC8tLWNyYXNoZXMtZGlyZWN0b3J5L2k7XG5cdFx0XHRjb25zdCBDT05QVFkgPSAvY29uaG9zdFxcLmV4ZS4rLS1oZWFkbGVzcy9pO1xuXHRcdFx0Y29uc3QgVFlQRSA9IC8tLXR5cGU9KFthLXpBLVotXSspLztcblxuXHRcdFx0Ly8gZmluZCB3aW5kb3dzIGNyYXNoIHJlcG9ydGVyXG5cdFx0XHRpZiAoV0lORE9XU19DUkFTSF9SRVBPUlRFUi5leGVjKGNtZCkpIHtcblx0XHRcdFx0cmV0dXJuICdlbGVjdHJvbi1jcmFzaC1yZXBvcnRlcic7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGZpbmQgY29ucHR5IHByb2Nlc3Ncblx0XHRcdGlmIChDT05QVFkuZXhlYyhjbWQpKSB7XG5cdFx0XHRcdHJldHVybiAnY29ucHR5LWFnZW50Jztcblx0XHRcdH1cblxuXHRcdFx0Ly8gZmluZCBcIi0tdHlwZT14eHh4XCJcblx0XHRcdGxldCBtYXRjaGVzID0gVFlQRS5leGVjKGNtZCk7XG5cdFx0XHRpZiAobWF0Y2hlcyAmJiBtYXRjaGVzLmxlbmd0aCA9PT0gMikge1xuXHRcdFx0XHRpZiAobWF0Y2hlc1sxXSA9PT0gJ3JlbmRlcmVyJykge1xuXHRcdFx0XHRcdHJldHVybiBgd2luZG93YDtcblx0XHRcdFx0fSBlbHNlIGlmIChtYXRjaGVzWzFdID09PSAndXRpbGl0eScpIHtcblx0XHRcdFx0XHRpZiAoVVRJTElUWV9ORVRXT1JLX0hJTlQuZXhlYyhjbWQpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gJ3V0aWxpdHktbmV0d29yay1zZXJ2aWNlJztcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gJ3V0aWxpdHktcHJvY2Vzcyc7XG5cdFx0XHRcdH0gZWxzZSBpZiAobWF0Y2hlc1sxXSA9PT0gJ2V4dGVuc2lvbkhvc3QnKSB7XG5cdFx0XHRcdFx0cmV0dXJuICdleHRlbnNpb24taG9zdCc7IC8vIG5vcm1hbGl6ZSByZW1vdGUgZXh0ZW5zaW9uIGhvc3QgdHlwZVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBtYXRjaGVzWzFdO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY21kLmluZGV4T2YoJ25vZGUgJykgPCAwICYmIGNtZC5pbmRleE9mKCdub2RlLmV4ZScpIDwgMCkge1xuXHRcdFx0XHRsZXQgcmVzdWx0ID0gJyc7IC8vIGZpbmQgYWxsIHh5ei5qc1xuXHRcdFx0XHRkbyB7XG5cdFx0XHRcdFx0bWF0Y2hlcyA9IEpTX0ZJTEVOQU1FX1BBVFRFUk4uZXhlYyhjbWQpO1xuXHRcdFx0XHRcdGlmIChtYXRjaGVzKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQgKz0gbWF0Y2hlcyArICcgJztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gd2hpbGUgKG1hdGNoZXMpO1xuXG5cdFx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0XHRyZXR1cm4gYGVsZWN0cm9uLW5vZGVqcyAoJHtyZXN1bHQudHJpbSgpfSlgO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBjbWQ7XG5cdFx0fVxuXG5cdFx0aWYgKHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMicpIHtcblx0XHRcdGNvbnN0IGNsZWFuVU5DUHJlZml4ID0gKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuXHRcdFx0XHRpZiAodmFsdWUuaW5kZXhPZignXFxcXFxcXFw/XFxcXCcpID09PSAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHZhbHVlLnN1YnN0cmluZyg0KTtcblx0XHRcdFx0fSBlbHNlIGlmICh2YWx1ZS5pbmRleE9mKCdcXFxcPz9cXFxcJykgPT09IDApIHtcblx0XHRcdFx0XHRyZXR1cm4gdmFsdWUuc3Vic3RyaW5nKDQpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHZhbHVlLmluZGV4T2YoJ1wiXFxcXFxcXFw/XFxcXCcpID09PSAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuICdcIicgKyB2YWx1ZS5zdWJzdHJpbmcoNSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodmFsdWUuaW5kZXhPZignXCJcXFxcPz9cXFxcJykgPT09IDApIHtcblx0XHRcdFx0XHRyZXR1cm4gJ1wiJyArIHZhbHVlLnN1YnN0cmluZyg1KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdChpbXBvcnQoJ0B2c2NvZGUvd2luZG93cy1wcm9jZXNzLXRyZWUnKSkudGhlbih3aW5kb3dzUHJvY2Vzc1RyZWUgPT4ge1xuXHRcdFx0XHR3aW5kb3dzUHJvY2Vzc1RyZWUuZ2V0UHJvY2Vzc0xpc3Qocm9vdFBpZCwgKHByb2Nlc3NMaXN0KSA9PiB7XG5cdFx0XHRcdFx0aWYgKCFwcm9jZXNzTGlzdCkge1xuXHRcdFx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcihgUm9vdCBwcm9jZXNzICR7cm9vdFBpZH0gbm90IGZvdW5kYCkpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR3aW5kb3dzUHJvY2Vzc1RyZWUuZ2V0UHJvY2Vzc0NwdVVzYWdlKHByb2Nlc3NMaXN0LCAoY29tcGxldGVQcm9jZXNzTGlzdCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgcHJvY2Vzc0l0ZW1zOiBNYXA8bnVtYmVyLCBQcm9jZXNzSXRlbT4gPSBuZXcgTWFwKCk7XG5cdFx0XHRcdFx0XHRjb21wbGV0ZVByb2Nlc3NMaXN0LmZvckVhY2gocHJvY2VzcyA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNvbW1hbmRMaW5lID0gY2xlYW5VTkNQcmVmaXgocHJvY2Vzcy5jb21tYW5kTGluZSB8fCAnJyk7XG5cdFx0XHRcdFx0XHRcdHByb2Nlc3NJdGVtcy5zZXQocHJvY2Vzcy5waWQsIHtcblx0XHRcdFx0XHRcdFx0XHRuYW1lOiBmaW5kTmFtZShjb21tYW5kTGluZSksXG5cdFx0XHRcdFx0XHRcdFx0Y21kOiBjb21tYW5kTGluZSxcblx0XHRcdFx0XHRcdFx0XHRwaWQ6IHByb2Nlc3MucGlkLFxuXHRcdFx0XHRcdFx0XHRcdHBwaWQ6IHByb2Nlc3MucHBpZCxcblx0XHRcdFx0XHRcdFx0XHRsb2FkOiBwcm9jZXNzLmNwdSB8fCAwLFxuXHRcdFx0XHRcdFx0XHRcdG1lbTogcHJvY2Vzcy5tZW1vcnkgfHwgMFxuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0XHRyb290SXRlbSA9IHByb2Nlc3NJdGVtcy5nZXQocm9vdFBpZCk7XG5cdFx0XHRcdFx0XHRpZiAocm9vdEl0ZW0pIHtcblx0XHRcdFx0XHRcdFx0cHJvY2Vzc0l0ZW1zLmZvckVhY2goaXRlbSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgcGFyZW50ID0gcHJvY2Vzc0l0ZW1zLmdldChpdGVtLnBwaWQpO1xuXHRcdFx0XHRcdFx0XHRcdGlmIChwYXJlbnQpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGlmICghcGFyZW50LmNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHBhcmVudC5jaGlsZHJlbiA9IFtdO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0cGFyZW50LmNoaWxkcmVuLnB1c2goaXRlbSk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdFx0XHRwcm9jZXNzSXRlbXMuZm9yRWFjaChpdGVtID0+IHtcblx0XHRcdFx0XHRcdFx0XHRpZiAoaXRlbS5jaGlsZHJlbikge1xuXHRcdFx0XHRcdFx0XHRcdFx0aXRlbS5jaGlsZHJlbiA9IGl0ZW0uY2hpbGRyZW4uc29ydCgoYSwgYikgPT4gYS5waWQgLSBiLnBpZCk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0cmVzb2x2ZShyb290SXRlbSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRyZWplY3QobmV3IEVycm9yKGBSb290IHByb2Nlc3MgJHtyb290UGlkfSBub3QgZm91bmRgKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0sIHdpbmRvd3NQcm9jZXNzVHJlZS5Qcm9jZXNzRGF0YUZsYWcuQ29tbWFuZExpbmUgfCB3aW5kb3dzUHJvY2Vzc1RyZWUuUHJvY2Vzc0RhdGFGbGFnLk1lbW9yeSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBPUyBYICYgTGludXhcblx0XHRlbHNlIHtcblx0XHRcdGZ1bmN0aW9uIGNhbGN1bGF0ZUxpbnV4Q3B1VXNhZ2UoKSB7XG5cblx0XHRcdFx0Ly8gRmxhdHRlbiByb290SXRlbSB0byBnZXQgYSBsaXN0IG9mIGFsbCBWU0NvZGUgcHJvY2Vzc2VzXG5cdFx0XHRcdGxldCBwcm9jZXNzZXMgPSBbcm9vdEl0ZW1dO1xuXHRcdFx0XHRjb25zdCBwaWRzOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0XHR3aGlsZSAocHJvY2Vzc2VzLmxlbmd0aCkge1xuXHRcdFx0XHRcdGNvbnN0IHByb2Nlc3MgPSBwcm9jZXNzZXMuc2hpZnQoKTtcblx0XHRcdFx0XHRpZiAocHJvY2Vzcykge1xuXHRcdFx0XHRcdFx0cGlkcy5wdXNoKHByb2Nlc3MucGlkKTtcblx0XHRcdFx0XHRcdGlmIChwcm9jZXNzLmNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0XHRcdHByb2Nlc3NlcyA9IHByb2Nlc3Nlcy5jb25jYXQocHJvY2Vzcy5jaGlsZHJlbik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gVGhlIGNwdSB1c2FnZSB2YWx1ZSByZXBvcnRlZCBvbiBMaW51eCBpcyB0aGUgYXZlcmFnZSBvdmVyIHRoZSBwcm9jZXNzIGxpZmV0aW1lLFxuXHRcdFx0XHQvLyByZWNhbGN1bGF0ZSB0aGUgdXNhZ2Ugb3ZlciBhIG9uZSBzZWNvbmQgaW50ZXJ2YWxcblx0XHRcdFx0Ly8gSlNPTi5zdHJpbmdpZnkgaXMgbmVlZGVkIHRvIGVzY2FwZSBzcGFjZXMsIGh0dHBzOi8vZ2l0aHViLmNvbS9ub2RlanMvbm9kZS9pc3N1ZXMvNjgwM1xuXHRcdFx0XHRsZXQgY21kID0gSlNPTi5zdHJpbmdpZnkoRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL2Jhc2Uvbm9kZS9jcHVVc2FnZS5zaCcpLmZzUGF0aCk7XG5cdFx0XHRcdGNtZCArPSAnICcgKyBwaWRzLmpvaW4oJyAnKTtcblxuXHRcdFx0XHRleGVjKGNtZCwge30sIChlcnIsIHN0ZG91dCwgc3RkZXJyKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGVyciB8fCBzdGRlcnIpIHtcblx0XHRcdFx0XHRcdHJlamVjdChlcnIgfHwgbmV3IEVycm9yKHN0ZGVyci50b1N0cmluZygpKSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbnN0IGNwdVVzYWdlID0gc3Rkb3V0LnRvU3RyaW5nKCkuc3BsaXQoJ1xcbicpO1xuXHRcdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBwaWRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHByb2Nlc3NJbmZvID0gbWFwLmdldChwaWRzW2ldKSE7XG5cdFx0XHRcdFx0XHRcdHByb2Nlc3NJbmZvLmxvYWQgPSBwYXJzZUZsb2F0KGNwdVVzYWdlW2ldKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aWYgKCFyb290SXRlbSkge1xuXHRcdFx0XHRcdFx0XHRyZWplY3QobmV3IEVycm9yKGBSb290IHByb2Nlc3MgJHtyb290UGlkfSBub3QgZm91bmRgKSk7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0cmVzb2x2ZShyb290SXRlbSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0ZXhlYygnd2hpY2ggcHMnLCB7fSwgKGVyciwgc3Rkb3V0LCBzdGRlcnIpID0+IHtcblx0XHRcdFx0aWYgKGVyciB8fCBzdGRlcnIpIHtcblx0XHRcdFx0XHRpZiAocHJvY2Vzcy5wbGF0Zm9ybSAhPT0gJ2xpbnV4Jykge1xuXHRcdFx0XHRcdFx0cmVqZWN0KGVyciB8fCBuZXcgRXJyb3Ioc3RkZXJyLnRvU3RyaW5nKCkpKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29uc3QgY21kID0gSlNPTi5zdHJpbmdpZnkoRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL2Jhc2Uvbm9kZS9wcy5zaCcpLmZzUGF0aCk7XG5cdFx0XHRcdFx0XHRleGVjKGNtZCwge30sIChlcnIsIHN0ZG91dCwgc3RkZXJyKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGlmIChlcnIgfHwgc3RkZXJyKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmVqZWN0KGVyciB8fCBuZXcgRXJyb3Ioc3RkZXJyLnRvU3RyaW5nKCkpKTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRwYXJzZVBzT3V0cHV0KHN0ZG91dCwgYWRkVG9UcmVlKTtcblx0XHRcdFx0XHRcdFx0XHRjYWxjdWxhdGVMaW51eENwdVVzYWdlKCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBwcyA9IHN0ZG91dC50b1N0cmluZygpLnRyaW0oKTtcblx0XHRcdFx0XHRjb25zdCBhcmdzID0gJy1heCAtbyBwaWQ9LHBwaWQ9LHBjcHU9LHBtZW09LGNvbW1hbmQ9JztcblxuXHRcdFx0XHRcdC8vIFNldCBudW1lcmljIGxvY2FsZSB0byBlbnN1cmUgJy4nIGlzIHVzZWQgYXMgdGhlIGRlY2ltYWwgc2VwYXJhdG9yXG5cdFx0XHRcdFx0ZXhlYyhgJHtwc30gJHthcmdzfWAsIHsgbWF4QnVmZmVyOiAxMDAwICogMTAyNCwgZW52OiB7IExDX05VTUVSSUM6ICdlbl9VUy5VVEYtOCcgfSB9LCAoZXJyLCBzdGRvdXQsIHN0ZGVycikgPT4ge1xuXHRcdFx0XHRcdFx0Ly8gU2lsZW50bHkgaWdub3JpbmcgdGhlIHNjcmVlbiBzaXplIGlzIGJvZ3VzIGVycm9yLiBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzk4NTkwXG5cdFx0XHRcdFx0XHRpZiAoZXJyIHx8IChzdGRlcnIgJiYgIXN0ZGVyci5pbmNsdWRlcygnc2NyZWVuIHNpemUgaXMgYm9ndXMnKSkpIHtcblx0XHRcdFx0XHRcdFx0cmVqZWN0KGVyciB8fCBuZXcgRXJyb3Ioc3RkZXJyLnRvU3RyaW5nKCkpKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHBhcnNlUHNPdXRwdXQoc3Rkb3V0LCBhZGRUb1RyZWUpO1xuXG5cdFx0XHRcdFx0XHRcdGlmIChwcm9jZXNzLnBsYXRmb3JtID09PSAnbGludXgnKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y2FsY3VsYXRlTGludXhDcHVVc2FnZSgpO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdGlmICghcm9vdEl0ZW0pIHtcblx0XHRcdFx0XHRcdFx0XHRcdHJlamVjdChuZXcgRXJyb3IoYFJvb3QgcHJvY2VzcyAke3Jvb3RQaWR9IG5vdCBmb3VuZGApKTtcblx0XHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdFx0cmVzb2x2ZShyb290SXRlbSk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblx0fSk7XG59XG5cbmZ1bmN0aW9uIHBhcnNlUHNPdXRwdXQoc3Rkb3V0OiBzdHJpbmcsIGFkZFRvVHJlZTogKHBpZDogbnVtYmVyLCBwcGlkOiBudW1iZXIsIGNtZDogc3RyaW5nLCBsb2FkOiBudW1iZXIsIG1lbTogbnVtYmVyKSA9PiB2b2lkKTogdm9pZCB7XG5cdGNvbnN0IFBJRF9DTUQgPSAvXlxccyooWzAtOV0rKVxccysoWzAtOV0rKVxccysoWzAtOV0rXFwuWzAtOV0rKVxccysoWzAtOV0rXFwuWzAtOV0rKVxccysoLispJC87XG5cdGNvbnN0IGxpbmVzID0gc3Rkb3V0LnRvU3RyaW5nKCkuc3BsaXQoJ1xcbicpO1xuXHRmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcblx0XHRjb25zdCBtYXRjaGVzID0gUElEX0NNRC5leGVjKGxpbmUudHJpbSgpKTtcblx0XHRpZiAobWF0Y2hlcyAmJiBtYXRjaGVzLmxlbmd0aCA9PT0gNikge1xuXHRcdFx0YWRkVG9UcmVlKHBhcnNlSW50KG1hdGNoZXNbMV0pLCBwYXJzZUludChtYXRjaGVzWzJdKSwgbWF0Y2hlc1s1XSwgcGFyc2VGbG9hdChtYXRjaGVzWzNdKSwgcGFyc2VGbG9hdChtYXRjaGVzWzRdKSk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFlBQVk7QUFDckIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyxpQkFBaUI7QUFFbkIsTUFBTSxzQkFBc0I7QUFFNUIsU0FBUyxjQUFjLFNBQXVDO0FBQ3BFLFNBQU8sSUFBSSxRQUFRLENBQUMsU0FBUyxXQUFXO0FBQ3ZDLFFBQUk7QUFDSixVQUFNLE1BQU0sb0JBQUksSUFBeUI7QUFDekMsVUFBTSxjQUFjLFNBQVM7QUFFN0IsYUFBUyxVQUFVLEtBQWEsTUFBYyxLQUFhLE1BQWMsS0FBYTtBQUNyRixZQUFNLFNBQVMsSUFBSSxJQUFJLElBQUk7QUFDM0IsVUFBSSxRQUFRLFdBQVcsUUFBUTtBQUM5QixjQUFNLE9BQW9CO0FBQUEsVUFDekIsTUFBTSxTQUFTLEdBQUc7QUFBQSxVQUNsQjtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0EsS0FBSyxZQUFZLE1BQU8sZUFBZSxNQUFNO0FBQUEsUUFDOUM7QUFDQSxZQUFJLElBQUksS0FBSyxJQUFJO0FBRWpCLFlBQUksUUFBUSxTQUFTO0FBQ3BCLHFC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
