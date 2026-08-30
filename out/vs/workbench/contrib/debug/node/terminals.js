import * as cp from "child_process";
import { getDriveLetter } from "../../../../base/common/extpath.js";
import * as platform from "../../../../base/common/platform.js";
function spawnAsPromised(command, args) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    const child = cp.spawn(command, args);
    if (child.pid) {
      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });
    }
    child.on("error", (err) => {
      reject(err);
    });
    child.on("close", (code) => {
      resolve(stdout);
    });
  });
}
async function hasChildProcesses(processId) {
  if (processId) {
    if (platform.isWindows) {
      const windowsProcessTree = await import("@vscode/windows-process-tree");
      return new Promise((resolve) => {
        windowsProcessTree.getProcessTree(processId, (processTree) => {
          resolve(!!processTree && processTree.children.length > 0);
        });
      });
    } else {
      return spawnAsPromised("/usr/bin/pgrep", ["-lP", String(processId)]).then((stdout) => {
        const r = stdout.trim();
        if (r.length === 0 || r.indexOf(" tmux") >= 0) {
          return false;
        } else {
          return true;
        }
      }, (error) => {
        return true;
      });
    }
  }
  return Promise.resolve(true);
}
var ShellType = /* @__PURE__ */ ((ShellType2) => {
  ShellType2[ShellType2["cmd"] = 0] = "cmd";
  ShellType2[ShellType2["powershell"] = 1] = "powershell";
  ShellType2[ShellType2["bash"] = 2] = "bash";
  return ShellType2;
})(ShellType || {});
function prepareCommand(shell, args, argsCanBeInterpretedByShell, cwd, env) {
  shell = shell.trim().toLowerCase();
  let shellType;
  if (shell.indexOf("powershell") >= 0 || shell.indexOf("pwsh") >= 0) {
    shellType = 1 /* powershell */;
  } else if (shell.indexOf("cmd.exe") >= 0) {
    shellType = 0 /* cmd */;
  } else if (shell.indexOf("bash") >= 0) {
    shellType = 2 /* bash */;
  } else if (platform.isWindows) {
    shellType = 0 /* cmd */;
  } else {
    shellType = 2 /* bash */;
  }
  let quote;
  let command = " ";
  switch (shellType) {
    case 1 /* powershell */:
      quote = (s) => {
        s = s.replace(/\'/g, "''");
        if (s.length > 0 && s.charAt(s.length - 1) === "\\") {
          return `'${s}\\'`;
        }
        return `'${s}'`;
      };
      if (cwd) {
        const driveLetter = getDriveLetter(cwd);
        if (driveLetter) {
          command += `${driveLetter}:; `;
        }
        command += `cd ${quote(cwd)}; `;
      }
      if (env) {
        for (const key in env) {
          const value = env[key];
          if (value === null) {
            command += `Remove-Item env:${key}; `;
          } else {
            command += `\${env:${key}}='${value}'; `;
          }
        }
      }
      if (args.length > 0) {
        const arg = args.shift();
        const cmd = argsCanBeInterpretedByShell ? arg : quote(arg);
        command += cmd[0] === "'" ? `& ${cmd} ` : `${cmd} `;
        for (const a of args) {
          command += a === "<" || a === ">" || argsCanBeInterpretedByShell ? a : quote(a);
          command += " ";
        }
      }
      break;
    case 0 /* cmd */:
      quote = (s) => {
        s = s.replace(/\"/g, '""');
        s = s.replace(/([><!^&|])/g, "^$1");
        return ' "'.split("").some((char) => s.includes(char)) || s.length === 0 ? `"${s}"` : s;
      };
      if (cwd) {
        const driveLetter = getDriveLetter(cwd);
        if (driveLetter) {
          command += `${driveLetter}: && `;
        }
        command += `cd ${quote(cwd)} && `;
      }
      if (env) {
        command += 'cmd /C "';
        for (const key in env) {
          let value = env[key];
          if (value === null) {
            command += `set "${key}=" && `;
          } else {
            value = value.replace(/[&^|<>]/g, (s) => `^${s}`);
            command += `set "${key}=${value}" && `;
          }
        }
      }
      for (const a of args) {
        command += a === "<" || a === ">" || argsCanBeInterpretedByShell ? a : quote(a);
        command += " ";
      }
      if (env) {
        command += '"';
      }
      break;
    case 2 /* bash */: {
      quote = (s) => {
        s = s.replace(/(["'\\\$!><#()\[\]*&^| ;{}?`])/g, "\\$1");
        return s.length === 0 ? `""` : s;
      };
      const hardQuote = (s) => {
        return /[^\w@%\/+=,.:^-]/.test(s) ? `'${s.replace(/'/g, "'\\''")}'` : s;
      };
      if (cwd) {
        command += `cd ${quote(cwd)} ; `;
      }
      if (env) {
        command += "/usr/bin/env";
        for (const key in env) {
          const value = env[key];
          if (value === null) {
            command += ` -u ${hardQuote(key)}`;
          } else {
            command += ` ${hardQuote(`${key}=${value}`)}`;
          }
        }
        command += " ";
      }
      for (const a of args) {
        command += a === "<" || a === ">" || argsCanBeInterpretedByShell ? a : quote(a);
        command += " ";
      }
      break;
    }
  }
  return command;
}
export {
  hasChildProcesses,
  prepareCommand
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxub2RlXFx0ZXJtaW5hbHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBjcCBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IGdldERyaXZlTGV0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXh0cGF0aC5qcyc7XG5pbXBvcnQgKiBhcyBwbGF0Zm9ybSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5cbmZ1bmN0aW9uIHNwYXduQXNQcm9taXNlZChjb21tYW5kOiBzdHJpbmcsIGFyZ3M6IHN0cmluZ1tdKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRsZXQgc3Rkb3V0ID0gJyc7XG5cdFx0Y29uc3QgY2hpbGQgPSBjcC5zcGF3bihjb21tYW5kLCBhcmdzKTtcblx0XHRpZiAoY2hpbGQucGlkKSB7XG5cdFx0XHRjaGlsZC5zdGRvdXQub24oJ2RhdGEnLCAoZGF0YTogQnVmZmVyKSA9PiB7XG5cdFx0XHRcdHN0ZG91dCArPSBkYXRhLnRvU3RyaW5nKCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0Y2hpbGQub24oJ2Vycm9yJywgZXJyID0+IHtcblx0XHRcdHJlamVjdChlcnIpO1xuXHRcdH0pO1xuXHRcdGNoaWxkLm9uKCdjbG9zZScsIGNvZGUgPT4ge1xuXHRcdFx0cmVzb2x2ZShzdGRvdXQpO1xuXHRcdH0pO1xuXHR9KTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGhhc0NoaWxkUHJvY2Vzc2VzKHByb2Nlc3NJZDogbnVtYmVyIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdGlmIChwcm9jZXNzSWQpIHtcblxuXHRcdC8vIGlmIHNoZWxsIGhhcyBhdCBsZWFzdCBvbmUgY2hpbGQgcHJvY2VzcywgYXNzdW1lIHRoYXQgc2hlbGwgaXMgYnVzeVxuXHRcdGlmIChwbGF0Zm9ybS5pc1dpbmRvd3MpIHtcblx0XHRcdGNvbnN0IHdpbmRvd3NQcm9jZXNzVHJlZSA9IGF3YWl0IGltcG9ydCgnQHZzY29kZS93aW5kb3dzLXByb2Nlc3MtdHJlZScpO1xuXHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlPGJvb2xlYW4+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHR3aW5kb3dzUHJvY2Vzc1RyZWUuZ2V0UHJvY2Vzc1RyZWUocHJvY2Vzc0lkLCBwcm9jZXNzVHJlZSA9PiB7XG5cdFx0XHRcdFx0cmVzb2x2ZSghIXByb2Nlc3NUcmVlICYmIHByb2Nlc3NUcmVlLmNoaWxkcmVuLmxlbmd0aCA+IDApO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gc3Bhd25Bc1Byb21pc2VkKCcvdXNyL2Jpbi9wZ3JlcCcsIFsnLWxQJywgU3RyaW5nKHByb2Nlc3NJZCldKS50aGVuKHN0ZG91dCA9PiB7XG5cdFx0XHRcdGNvbnN0IHIgPSBzdGRvdXQudHJpbSgpO1xuXHRcdFx0XHRpZiAoci5sZW5ndGggPT09IDAgfHwgci5pbmRleE9mKCcgdG11eCcpID49IDApIHsgLy8gaWdub3JlICd0bXV4Jzsgc2VlICM0MzY4M1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgZXJyb3IgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXHQvLyBmYWxsIGJhY2sgdG8gc2FmZSBzaWRlXG5cdHJldHVybiBQcm9taXNlLnJlc29sdmUodHJ1ZSk7XG59XG5cbmNvbnN0IGVudW0gU2hlbGxUeXBlIHsgY21kLCBwb3dlcnNoZWxsLCBiYXNoIH1cblxuXG5leHBvcnQgZnVuY3Rpb24gcHJlcGFyZUNvbW1hbmQoc2hlbGw6IHN0cmluZywgYXJnczogc3RyaW5nW10sIGFyZ3NDYW5CZUludGVycHJldGVkQnlTaGVsbDogYm9vbGVhbiwgY3dkPzogc3RyaW5nLCBlbnY/OiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB8IG51bGwgfSk6IHN0cmluZyB7XG5cblx0c2hlbGwgPSBzaGVsbC50cmltKCkudG9Mb3dlckNhc2UoKTtcblxuXHQvLyB0cnkgdG8gZGV0ZXJtaW5lIHRoZSBzaGVsbCB0eXBlXG5cdGxldCBzaGVsbFR5cGU7XG5cdGlmIChzaGVsbC5pbmRleE9mKCdwb3dlcnNoZWxsJykgPj0gMCB8fCBzaGVsbC5pbmRleE9mKCdwd3NoJykgPj0gMCkge1xuXHRcdHNoZWxsVHlwZSA9IFNoZWxsVHlwZS5wb3dlcnNoZWxsO1xuXHR9IGVsc2UgaWYgKHNoZWxsLmluZGV4T2YoJ2NtZC5leGUnKSA+PSAwKSB7XG5cdFx0c2hlbGxUeXBlID0gU2hlbGxUeXBlLmNtZDtcblx0fSBlbHNlIGlmIChzaGVsbC5pbmRleE9mKCdiYXNoJykgPj0gMCkge1xuXHRcdHNoZWxsVHlwZSA9IFNoZWxsVHlwZS5iYXNoO1xuXHR9IGVsc2UgaWYgKHBsYXRmb3JtLmlzV2luZG93cykge1xuXHRcdHNoZWxsVHlwZSA9IFNoZWxsVHlwZS5jbWQ7IC8vIHBpY2sgYSBnb29kIGRlZmF1bHQgZm9yIFdpbmRvd3Ncblx0fSBlbHNlIHtcblx0XHRzaGVsbFR5cGUgPSBTaGVsbFR5cGUuYmFzaDtcdC8vIHBpY2sgYSBnb29kIGRlZmF1bHQgZm9yIGFueXRoaW5nIGVsc2Vcblx0fVxuXG5cdGxldCBxdW90ZTogKHM6IHN0cmluZykgPT4gc3RyaW5nO1xuXHQvLyBiZWdpbiBjb21tYW5kIHdpdGggYSBzcGFjZSB0byBhdm9pZCBwb2xsdXRpbmcgc2hlbGwgaGlzdG9yeVxuXHRsZXQgY29tbWFuZCA9ICcgJztcblxuXHRzd2l0Y2ggKHNoZWxsVHlwZSkge1xuXG5cdFx0Y2FzZSBTaGVsbFR5cGUucG93ZXJzaGVsbDpcblxuXHRcdFx0cXVvdGUgPSAoczogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdHMgPSBzLnJlcGxhY2UoL1xcJy9nLCAnXFwnXFwnJyk7XG5cdFx0XHRcdGlmIChzLmxlbmd0aCA+IDAgJiYgcy5jaGFyQXQocy5sZW5ndGggLSAxKSA9PT0gJ1xcXFwnKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGAnJHtzfVxcXFwnYDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gYCcke3N9J2A7XG5cdFx0XHR9O1xuXG5cdFx0XHRpZiAoY3dkKSB7XG5cdFx0XHRcdGNvbnN0IGRyaXZlTGV0dGVyID0gZ2V0RHJpdmVMZXR0ZXIoY3dkKTtcblx0XHRcdFx0aWYgKGRyaXZlTGV0dGVyKSB7XG5cdFx0XHRcdFx0Y29tbWFuZCArPSBgJHtkcml2ZUxldHRlcn06OyBgO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbW1hbmQgKz0gYGNkICR7cXVvdGUoY3dkKX07IGA7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZW52KSB7XG5cdFx0XHRcdGZvciAoY29uc3Qga2V5IGluIGVudikge1xuXHRcdFx0XHRcdGNvbnN0IHZhbHVlID0gZW52W2tleV07XG5cdFx0XHRcdFx0aWYgKHZhbHVlID09PSBudWxsKSB7XG5cdFx0XHRcdFx0XHRjb21tYW5kICs9IGBSZW1vdmUtSXRlbSBlbnY6JHtrZXl9OyBgO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjb21tYW5kICs9IGBcXCR7ZW52OiR7a2V5fX09JyR7dmFsdWV9JzsgYDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChhcmdzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgYXJnID0gYXJncy5zaGlmdCgpITtcblx0XHRcdFx0Y29uc3QgY21kID0gYXJnc0NhbkJlSW50ZXJwcmV0ZWRCeVNoZWxsID8gYXJnIDogcXVvdGUoYXJnKTtcblx0XHRcdFx0Y29tbWFuZCArPSAoY21kWzBdID09PSAnXFwnJykgPyBgJiAke2NtZH0gYCA6IGAke2NtZH0gYDtcblx0XHRcdFx0Zm9yIChjb25zdCBhIG9mIGFyZ3MpIHtcblx0XHRcdFx0XHRjb21tYW5kICs9IChhID09PSAnPCcgfHwgYSA9PT0gJz4nIHx8IGFyZ3NDYW5CZUludGVycHJldGVkQnlTaGVsbCkgPyBhIDogcXVvdGUoYSk7XG5cdFx0XHRcdFx0Y29tbWFuZCArPSAnICc7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGJyZWFrO1xuXG5cdFx0Y2FzZSBTaGVsbFR5cGUuY21kOlxuXG5cdFx0XHRxdW90ZSA9IChzOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Ly8gTm90ZTogV3JhcHBpbmcgaW4gY21kIC9DIFwiLi4uXCIgY29tcGxpY2F0ZXMgdGhlIGVzY2FwaW5nLlxuXHRcdFx0XHQvLyBjbWQgL0MgXCJub2RlIC1lIFwiY29uc29sZS5sb2cocHJvY2Vzcy5hcmd2KVwiIFwiXCJcIkFePjBcIlwiXCJcIiAjIHByaW50cyBcIkE+MFwiXG5cdFx0XHRcdC8vIGNtZCAvQyBcIm5vZGUgLWUgXCJjb25zb2xlLmxvZyhwcm9jZXNzLmFyZ3YpXCIgXCJmb29ePiBiYXJcIlwiICMgcHJpbnRzIGZvbz4gYmFyXG5cdFx0XHRcdC8vIE91dHNpZGUgb2YgdGhlIGNtZCAvQywgaXQgY291bGQgYmUgYSBzaW1wbGUgcXVvdGluZywgYnV0IGhlcmUsIHRoZSBeIGlzIG5lZWRlZCB0b29cblx0XHRcdFx0cyA9IHMucmVwbGFjZSgvXFxcIi9nLCAnXCJcIicpO1xuXHRcdFx0XHRzID0gcy5yZXBsYWNlKC8oWz48IV4mfF0pL2csICdeJDEnKTtcblx0XHRcdFx0cmV0dXJuICgnIFwiJy5zcGxpdCgnJykuc29tZShjaGFyID0+IHMuaW5jbHVkZXMoY2hhcikpIHx8IHMubGVuZ3RoID09PSAwKSA/IGBcIiR7c31cImAgOiBzO1xuXHRcdFx0fTtcblxuXHRcdFx0aWYgKGN3ZCkge1xuXHRcdFx0XHRjb25zdCBkcml2ZUxldHRlciA9IGdldERyaXZlTGV0dGVyKGN3ZCk7XG5cdFx0XHRcdGlmIChkcml2ZUxldHRlcikge1xuXHRcdFx0XHRcdGNvbW1hbmQgKz0gYCR7ZHJpdmVMZXR0ZXJ9OiAmJiBgO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbW1hbmQgKz0gYGNkICR7cXVvdGUoY3dkKX0gJiYgYDtcblx0XHRcdH1cblx0XHRcdGlmIChlbnYpIHtcblx0XHRcdFx0Y29tbWFuZCArPSAnY21kIC9DIFwiJztcblx0XHRcdFx0Zm9yIChjb25zdCBrZXkgaW4gZW52KSB7XG5cdFx0XHRcdFx0bGV0IHZhbHVlID0gZW52W2tleV07XG5cdFx0XHRcdFx0aWYgKHZhbHVlID09PSBudWxsKSB7XG5cdFx0XHRcdFx0XHRjb21tYW5kICs9IGBzZXQgXCIke2tleX09XCIgJiYgYDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dmFsdWUgPSB2YWx1ZS5yZXBsYWNlKC9bJl58PD5dL2csIHMgPT4gYF4ke3N9YCk7XG5cdFx0XHRcdFx0XHRjb21tYW5kICs9IGBzZXQgXCIke2tleX09JHt2YWx1ZX1cIiAmJiBgO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBhIG9mIGFyZ3MpIHtcblx0XHRcdFx0Y29tbWFuZCArPSAoYSA9PT0gJzwnIHx8IGEgPT09ICc+JyB8fCBhcmdzQ2FuQmVJbnRlcnByZXRlZEJ5U2hlbGwpID8gYSA6IHF1b3RlKGEpO1xuXHRcdFx0XHRjb21tYW5kICs9ICcgJztcblx0XHRcdH1cblx0XHRcdGlmIChlbnYpIHtcblx0XHRcdFx0Y29tbWFuZCArPSAnXCInO1xuXHRcdFx0fVxuXHRcdFx0YnJlYWs7XG5cblx0XHRjYXNlIFNoZWxsVHlwZS5iYXNoOiB7XG5cblx0XHRcdHF1b3RlID0gKHM6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRzID0gcy5yZXBsYWNlKC8oW1wiJ1xcXFxcXCQhPjwjKClcXFtcXF0qJl58IDt7fT9gXSkvZywgJ1xcXFwkMScpO1xuXHRcdFx0XHRyZXR1cm4gcy5sZW5ndGggPT09IDAgPyBgXCJcImAgOiBzO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgaGFyZFF1b3RlID0gKHM6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRyZXR1cm4gL1teXFx3QCVcXC8rPSwuOl4tXS8udGVzdChzKSA/IGAnJHtzLnJlcGxhY2UoLycvZywgJ1xcJ1xcXFxcXCdcXCcnKX0nYCA6IHM7XG5cdFx0XHR9O1xuXG5cdFx0XHRpZiAoY3dkKSB7XG5cdFx0XHRcdGNvbW1hbmQgKz0gYGNkICR7cXVvdGUoY3dkKX0gOyBgO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGVudikge1xuXHRcdFx0XHRjb21tYW5kICs9ICcvdXNyL2Jpbi9lbnYnO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGtleSBpbiBlbnYpIHtcblx0XHRcdFx0XHRjb25zdCB2YWx1ZSA9IGVudltrZXldO1xuXHRcdFx0XHRcdGlmICh2YWx1ZSA9PT0gbnVsbCkge1xuXHRcdFx0XHRcdFx0Y29tbWFuZCArPSBgIC11ICR7aGFyZFF1b3RlKGtleSl9YDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29tbWFuZCArPSBgICR7aGFyZFF1b3RlKGAke2tleX09JHt2YWx1ZX1gKX1gO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRjb21tYW5kICs9ICcgJztcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgYSBvZiBhcmdzKSB7XG5cdFx0XHRcdGNvbW1hbmQgKz0gKGEgPT09ICc8JyB8fCBhID09PSAnPicgfHwgYXJnc0NhbkJlSW50ZXJwcmV0ZWRCeVNoZWxsKSA/IGEgOiBxdW90ZShhKTtcblx0XHRcdFx0Y29tbWFuZCArPSAnICc7XG5cdFx0XHR9XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gY29tbWFuZDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksUUFBUTtBQUNwQixTQUFTLHNCQUFzQjtBQUMvQixZQUFZLGNBQWM7QUFFMUIsU0FBUyxnQkFBZ0IsU0FBaUIsTUFBaUM7QUFDMUUsU0FBTyxJQUFJLFFBQVEsQ0FBQyxTQUFTLFdBQVc7QUFDdkMsUUFBSSxTQUFTO0FBQ2IsVUFBTSxRQUFRLEdBQUcsTUFBTSxTQUFTLElBQUk7QUFDcEMsUUFBSSxNQUFNLEtBQUs7QUFDZCxZQUFNLE9BQU8sR0FBRyxRQUFRLENBQUMsU0FBaUI7QUFDekMsa0JBQVUsS0FBSyxTQUFTO0FBQUEsTUFDekIsQ0FBQztBQUFBLElBQ0Y7QUFDQSxVQUFNLEdBQUcsU0FBUyxTQUFPO0FBQ3hCLGFBQU8sR0FBRztBQUFBLElBQ1gsQ0FBQztBQUNELFVBQU0sR0FBRyxTQUFTLFVBQVE7QUFDekIsY0FBUSxNQUFNO0FBQUEsSUFDZixDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0Y7QUFFQSxlQUFzQixrQkFBa0IsV0FBaUQ7QUFDeEYsTUFBSSxXQUFXO0FBR2QsUUFBSSxTQUFTLFdBQVc7QUFDdkIsWUFBTSxxQkFBcUIsTUFBTSxPQUFPLDhCQUE4QjtBQUN0RSxhQUFPLElBQUksUUFBaUIsYUFBVztBQUN0QywyQkFBbUIsZUFBZSxXQUFXLGlCQUFlO0FBQzNELGtCQUFRLENBQUMsQ0FBQyxlQUFlLFlBQVksU0FBUyxTQUFTLENBQUM7QUFBQSxRQUN6RCxDQUFDO0FBQUEsTUFDRixDQUFDO0FBQUEsSUFDRixPQUFPO0FBQ04sYUFB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LFdBQVc7QUFBQSxRQUMxQjtBQUNBLG1CQUFXLE1BQU0sTUFBTSxHQUFHLENBQUM7QUFBQSxNQUM1QjtBQUNBLFVBQUksS0FBSztBQUNSLG1CQUFXO0FBQ1gsbUJBQVcsT0FBTyxLQUFLO0FBQ3RCLGNBQUksUUFBUSxJQUFJLEdBQUc7QUFDbkIsY0FBSSxVQUFVLE1BQU07QUFDbkIsdUJBQVcsUUFBUSxHQUFHO0FBQUEsVUFDdkIsT0FBTztBQUNOLG9CQUFRLE1BQU0sUUFBUSxZQUFZLE9BQUssSUFBSSxDQUFDLEVBQUU7QUFDOUMsdUJBQVcsUUFBUSxHQUFHLElBQUksS0FBSztBQUFBLFVBQ2hDO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFDQSxpQkFBVyxLQUFLLE1BQU07QUFDckIsbUJBQVksTUFBTSxPQUFPLE1BQU0sT0FBTyw4QkFBK0IsSUFBSSxNQUFNLENBQUM7QUFDaEYsbUJBQVc7QUFBQSxNQUNaO0FBQ0EsVUFBSSxLQUFLO0FBQ1IsbUJBQVc7QUFBQSxNQUNaO0FBQ0E7QUFBQSxJQUVELEtBQUssY0FBZ0I7QUFFcEIsY0FBUSxDQUFDLE1BQWM7QUFDdEIsWUFBSSxFQUFFLFFBQVEsbUNBQW1DLE1BQU07QUFDdkQsZUFBTyxFQUFFLFdBQVcsSUFBSSxPQUFPO0FBQUEsTUFDaEM7QUFFQSxZQUFNLFlBQVksQ0FBQyxNQUFjO0FBQ2hDLGVBQU8sbUJBQW1CLEtBQUssQ0FBQyxJQUFJLElBQUksRUFBRSxRQUFRLE1BQU0sT0FBVSxDQUFDLE1BQU07QUFBQSxNQUMxRTtBQUVBLFVBQUksS0FBSztBQUNSLG1CQUFXLE1BQU0sTUFBTSxHQUFHLENBQUM7QUFBQSxNQUM1QjtBQUNBLFVBQUksS0FBSztBQUNSLG1CQUFXO0FBQ1gsbUJBQVcsT0FBTyxLQUFLO0FBQ3RCLGdCQUFNLFFBQVEsSUFBSSxHQUFHO0FBQ3JCLGNBQUksVUFBVSxNQUFNO0FBQ25CLHVCQUFXLE9BQU8sVUFBVSxHQUFHLENBQUM7QUFBQSxVQUNqQyxPQUFPO0FBQ04sdUJBQVcsSUFBSSxVQUFVLEdBQUcsR0FBRyxJQUFJLEtBQUssRUFBRSxDQUFDO0FBQUEsVUFDNUM7QUFBQSxRQUNEO0FBQ0EsbUJBQVc7QUFBQSxNQUNaO0FBQ0EsaUJBQVcsS0FBSyxNQUFNO0FBQ3JCLG1CQUFZLE1BQU0sT0FBTyxNQUFNLE9BQU8sOEJBQStCLElBQUksTUFBTSxDQUFDO0FBQ2hGLG1CQUFXO0FBQUEsTUFDWjtBQUNBO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFFQSxTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbIlNoZWxsVHlwZSJdCn0K
