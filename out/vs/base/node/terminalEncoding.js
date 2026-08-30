import { exec } from "child_process";
import { isWindows } from "../common/platform.js";
const windowsTerminalEncodings = {
  "437": "cp437",
  // United States
  "850": "cp850",
  // Multilingual(Latin I)
  "852": "cp852",
  // Slavic(Latin II)
  "855": "cp855",
  // Cyrillic(Russian)
  "857": "cp857",
  // Turkish
  "860": "cp860",
  // Portuguese
  "861": "cp861",
  // Icelandic
  "863": "cp863",
  // Canadian - French
  "865": "cp865",
  // Nordic
  "866": "cp866",
  // Russian
  "869": "cp869",
  // Modern Greek
  "936": "cp936",
  // Simplified Chinese
  "1252": "cp1252"
  // West European Latin
};
function toIconvLiteEncoding(encodingName) {
  const normalizedEncodingName = encodingName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const mapped = JSCHARDET_TO_ICONV_ENCODINGS[normalizedEncodingName];
  return mapped || normalizedEncodingName;
}
const JSCHARDET_TO_ICONV_ENCODINGS = {
  "ibm866": "cp866",
  "big5": "cp950"
};
const UTF8 = "utf8";
async function resolveTerminalEncoding(verbose) {
  let rawEncodingPromise;
  const cliEncodingEnv = process.env["VSCODE_CLI_ENCODING"];
  if (cliEncodingEnv) {
    if (verbose) {
      console.log(`Found VSCODE_CLI_ENCODING variable: ${cliEncodingEnv}`);
    }
    rawEncodingPromise = Promise.resolve(cliEncodingEnv);
  } else if (isWindows) {
    rawEncodingPromise = new Promise((resolve) => {
      if (verbose) {
        console.log('Running "chcp" to detect terminal encoding...');
      }
      exec("chcp", (err, stdout, stderr) => {
        if (stdout) {
          if (verbose) {
            console.log(`Output from "chcp" command is: ${stdout}`);
          }
          const windowsTerminalEncodingKeys = Object.keys(windowsTerminalEncodings);
          for (const key of windowsTerminalEncodingKeys) {
            if (stdout.indexOf(key) >= 0) {
              return resolve(windowsTerminalEncodings[key]);
            }
          }
        }
        return resolve(void 0);
      });
    });
  } else {
    rawEncodingPromise = new Promise((resolve) => {
      if (verbose) {
        console.log('Running "locale charmap" to detect terminal encoding...');
      }
      exec("locale charmap", (err, stdout, stderr) => resolve(stdout));
    });
  }
  const rawEncoding = await rawEncodingPromise;
  if (verbose) {
    console.log(`Detected raw terminal encoding: ${rawEncoding}`);
  }
  if (!rawEncoding || rawEncoding.toLowerCase() === "utf-8" || rawEncoding.toLowerCase() === UTF8) {
    return UTF8;
  }
  return toIconvLiteEncoding(rawEncoding);
}
export {
  resolveTerminalEncoding
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxub2RlXFx0ZXJtaW5hbEVuY29kaW5nLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuLyoqXG4gKiBUaGlzIGNvZGUgaXMgYWxzbyB1c2VkIGJ5IHN0YW5kYWxvbmUgY2xpJ3MuIEF2b2lkIGFkZGluZyBkZXBlbmRlbmNpZXMgdG8ga2VlcCB0aGUgc2l6ZSBvZiB0aGUgY2xpIHNtYWxsLlxuICovXG5pbXBvcnQgeyBleGVjIH0gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MgfSBmcm9tICcuLi9jb21tb24vcGxhdGZvcm0uanMnO1xuXG5jb25zdCB3aW5kb3dzVGVybWluYWxFbmNvZGluZ3MgPSB7XG5cdCc0MzcnOiAnY3A0MzcnLCAvLyBVbml0ZWQgU3RhdGVzXG5cdCc4NTAnOiAnY3A4NTAnLCAvLyBNdWx0aWxpbmd1YWwoTGF0aW4gSSlcblx0Jzg1Mic6ICdjcDg1MicsIC8vIFNsYXZpYyhMYXRpbiBJSSlcblx0Jzg1NSc6ICdjcDg1NScsIC8vIEN5cmlsbGljKFJ1c3NpYW4pXG5cdCc4NTcnOiAnY3A4NTcnLCAvLyBUdXJraXNoXG5cdCc4NjAnOiAnY3A4NjAnLCAvLyBQb3J0dWd1ZXNlXG5cdCc4NjEnOiAnY3A4NjEnLCAvLyBJY2VsYW5kaWNcblx0Jzg2Myc6ICdjcDg2MycsIC8vIENhbmFkaWFuIC0gRnJlbmNoXG5cdCc4NjUnOiAnY3A4NjUnLCAvLyBOb3JkaWNcblx0Jzg2Nic6ICdjcDg2NicsIC8vIFJ1c3NpYW5cblx0Jzg2OSc6ICdjcDg2OScsIC8vIE1vZGVybiBHcmVla1xuXHQnOTM2JzogJ2NwOTM2JywgLy8gU2ltcGxpZmllZCBDaGluZXNlXG5cdCcxMjUyJzogJ2NwMTI1MicgLy8gV2VzdCBFdXJvcGVhbiBMYXRpblxufTtcblxuZnVuY3Rpb24gdG9JY29udkxpdGVFbmNvZGluZyhlbmNvZGluZ05hbWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IG5vcm1hbGl6ZWRFbmNvZGluZ05hbWUgPSBlbmNvZGluZ05hbWUucmVwbGFjZSgvW15hLXpBLVowLTldL2csICcnKS50b0xvd2VyQ2FzZSgpO1xuXHRjb25zdCBtYXBwZWQgPSBKU0NIQVJERVRfVE9fSUNPTlZfRU5DT0RJTkdTW25vcm1hbGl6ZWRFbmNvZGluZ05hbWVdO1xuXG5cdHJldHVybiBtYXBwZWQgfHwgbm9ybWFsaXplZEVuY29kaW5nTmFtZTtcbn1cblxuY29uc3QgSlNDSEFSREVUX1RPX0lDT05WX0VOQ09ESU5HUzogeyBbbmFtZTogc3RyaW5nXTogc3RyaW5nIH0gPSB7XG5cdCdpYm04NjYnOiAnY3A4NjYnLFxuXHQnYmlnNSc6ICdjcDk1MCdcbn07XG5cbmNvbnN0IFVURjggPSAndXRmOCc7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZXNvbHZlVGVybWluYWxFbmNvZGluZyh2ZXJib3NlPzogYm9vbGVhbik6IFByb21pc2U8c3RyaW5nPiB7XG5cdGxldCByYXdFbmNvZGluZ1Byb21pc2U6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPjtcblxuXHQvLyBTdXBwb3J0IGEgZ2xvYmFsIGVudmlyb25tZW50IHZhcmlhYmxlIHRvIHdpbiBvdmVyIG90aGVyIG1lY2hhbmljc1xuXHRjb25zdCBjbGlFbmNvZGluZ0VudiA9IHByb2Nlc3MuZW52WydWU0NPREVfQ0xJX0VOQ09ESU5HJ107XG5cdGlmIChjbGlFbmNvZGluZ0Vudikge1xuXHRcdGlmICh2ZXJib3NlKSB7XG5cdFx0XHRjb25zb2xlLmxvZyhgRm91bmQgVlNDT0RFX0NMSV9FTkNPRElORyB2YXJpYWJsZTogJHtjbGlFbmNvZGluZ0Vudn1gKTtcblx0XHR9XG5cblx0XHRyYXdFbmNvZGluZ1Byb21pc2UgPSBQcm9taXNlLnJlc29sdmUoY2xpRW5jb2RpbmdFbnYpO1xuXHR9XG5cblx0Ly8gV2luZG93czogZWR1Y2F0ZWQgZ3Vlc3Ncblx0ZWxzZSBpZiAoaXNXaW5kb3dzKSB7XG5cdFx0cmF3RW5jb2RpbmdQcm9taXNlID0gbmV3IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPihyZXNvbHZlID0+IHtcblx0XHRcdGlmICh2ZXJib3NlKSB7XG5cdFx0XHRcdGNvbnNvbGUubG9nKCdSdW5uaW5nIFwiY2hjcFwiIHRvIGRldGVjdCB0ZXJtaW5hbCBlbmNvZGluZy4uLicpO1xuXHRcdFx0fVxuXG5cdFx0XHRleGVjKCdjaGNwJywgKGVyciwgc3Rkb3V0LCBzdGRlcnIpID0+IHtcblx0XHRcdFx0aWYgKHN0ZG91dCkge1xuXHRcdFx0XHRcdGlmICh2ZXJib3NlKSB7XG5cdFx0XHRcdFx0XHRjb25zb2xlLmxvZyhgT3V0cHV0IGZyb20gXCJjaGNwXCIgY29tbWFuZCBpczogJHtzdGRvdXR9YCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3Qgd2luZG93c1Rlcm1pbmFsRW5jb2RpbmdLZXlzID0gT2JqZWN0LmtleXMod2luZG93c1Rlcm1pbmFsRW5jb2RpbmdzKSBhcyBBcnJheTxrZXlvZiB0eXBlb2Ygd2luZG93c1Rlcm1pbmFsRW5jb2RpbmdzPjtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGtleSBvZiB3aW5kb3dzVGVybWluYWxFbmNvZGluZ0tleXMpIHtcblx0XHRcdFx0XHRcdGlmIChzdGRvdXQuaW5kZXhPZihrZXkpID49IDApIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHJlc29sdmUod2luZG93c1Rlcm1pbmFsRW5jb2RpbmdzW2tleV0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiByZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXHQvLyBMaW51eC9NYWM6IHVzZSBcImxvY2FsZSBjaGFybWFwXCIgY29tbWFuZFxuXHRlbHNlIHtcblx0XHRyYXdFbmNvZGluZ1Byb21pc2UgPSBuZXcgUHJvbWlzZTxzdHJpbmc+KHJlc29sdmUgPT4ge1xuXHRcdFx0aWYgKHZlcmJvc2UpIHtcblx0XHRcdFx0Y29uc29sZS5sb2coJ1J1bm5pbmcgXCJsb2NhbGUgY2hhcm1hcFwiIHRvIGRldGVjdCB0ZXJtaW5hbCBlbmNvZGluZy4uLicpO1xuXHRcdFx0fVxuXG5cdFx0XHRleGVjKCdsb2NhbGUgY2hhcm1hcCcsIChlcnIsIHN0ZG91dCwgc3RkZXJyKSA9PiByZXNvbHZlKHN0ZG91dCkpO1xuXHRcdH0pO1xuXHR9XG5cblx0Y29uc3QgcmF3RW5jb2RpbmcgPSBhd2FpdCByYXdFbmNvZGluZ1Byb21pc2U7XG5cdGlmICh2ZXJib3NlKSB7XG5cdFx0Y29uc29sZS5sb2coYERldGVjdGVkIHJhdyB0ZXJtaW5hbCBlbmNvZGluZzogJHtyYXdFbmNvZGluZ31gKTtcblx0fVxuXG5cdGlmICghcmF3RW5jb2RpbmcgfHwgcmF3RW5jb2RpbmcudG9Mb3dlckNhc2UoKSA9PT0gJ3V0Zi04JyB8fCByYXdFbmNvZGluZy50b0xvd2VyQ2FzZSgpID09PSBVVEY4KSB7XG5cdFx0cmV0dXJuIFVURjg7XG5cdH1cblxuXHRyZXR1cm4gdG9JY29udkxpdGVFbmNvZGluZyhyYXdFbmNvZGluZyk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFRQSxTQUFTLFlBQVk7QUFDckIsU0FBUyxpQkFBaUI7QUFFMUIsTUFBTSwyQkFBMkI7QUFBQSxFQUNoQyxPQUFPO0FBQUE7QUFBQSxFQUNQLE9BQU87QUFBQTtBQUFBLEVBQ1AsT0FBTztBQUFBO0FBQUEsRUFDUCxPQUFPO0FBQUE7QUFBQSxFQUNQLE9BQU87QUFBQTtBQUFBLEVBQ1AsT0FBTztBQUFBO0FBQUEsRUFDUCxPQUFPO0FBQUE7QUFBQSxFQUNQLE9BQU87QUFBQTtBQUFBLEVBQ1AsT0FBTztBQUFBO0FBQUEsRUFDUCxPQUFPO0FBQUE7QUFBQSxFQUNQLE9BQU87QUFBQTtBQUFBLEVBQ1AsT0FBTztBQUFBO0FBQUEsRUFDUCxRQUFRO0FBQUE7QUFDVDtBQUVBLFNBQVMsb0JBQW9CLGNBQThCO0FBQzFELFFBQU0seUJBQXlCLGFBQWEsUUFBUSxpQkFBaUIsRUFBRSxFQUFFLFlBQVk7QUFDckYsUUFBTSxTQUFTLDZCQUE2QixzQkFBc0I7QUFFbEUsU0FBTyxVQUFVO0FBQ2xCO0FBRUEsTUFBTSwrQkFBMkQ7QUFBQSxFQUNoRSxVQUFVO0FBQUEsRUFDVixRQUFRO0FBQ1Q7QUFFQSxNQUFNLE9BQU87QUFFYixlQUFzQix3QkFBd0IsU0FBb0M7QUFDakYsTUFBSTtBQUdKLFFBQU0saUJBQWlCLFFBQVEsSUFBSSxxQkFBcUI7QUFDeEQsTUFBSSxnQkFBZ0I7QUFDbkIsUUFBSSxTQUFTO0FBQ1osY0FBUSxJQUFJLHVDQUF1QyxjQUFjLEVBQUU7QUFBQSxJQUNwRTtBQUVBLHlCQUFxQixRQUFRLFFBQVEsY0FBYztBQUFBLEVBQ3BELFdBR1MsV0FBVztBQUNuQix5QkFBcUIsSUFBSSxRQUE0QixhQUFXO0FBQy9ELFVBQUksU0FBUztBQUNaLGdCQUFRLElBQUksK0NBQStDO0FBQUEsTUFDNUQ7QUFFQSxXQUFLLFFBQVEsQ0FBQyxLQUFLLFFBQVEsV0FBVztBQUNyQyxZQUFJLFFBQVE7QUFDWCxjQUFJLFNBQVM7QUFDWixvQkFBUSxJQUFJLGtDQUFrQyxNQUFNLEVBQUU7QUFBQSxVQUN2RDtBQUVBLGdCQUFNLDhCQUE4QixPQUFPLEtBQUssd0JBQXdCO0FBQ3hFLHFCQUFXLE9BQU8sNkJBQTZCO0FBQzlDLGdCQUFJLE9BQU8sUUFBUSxHQUFHLEtBQUssR0FBRztBQUM3QixxQkFBTyxRQUFRLHlCQUF5QixHQUFHLENBQUM7QUFBQSxZQUM3QztBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBRUEsZUFBTyxRQUFRLE1BQVM7QUFBQSxNQUN6QixDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRixPQUVLO0FBQ0oseUJBQXFCLElBQUksUUFBZ0IsYUFBVztBQUNuRCxVQUFJLFNBQVM7QUFDWixnQkFBUSxJQUFJLHlEQUF5RDtBQUFBLE1BQ3RFO0FBRUEsV0FBSyxrQkFBa0IsQ0FBQyxLQUFLLFFBQVEsV0FBVyxRQUFRLE1BQU0sQ0FBQztBQUFBLElBQ2hFLENBQUM7QUFBQSxFQUNGO0FBRUEsUUFBTSxjQUFjLE1BQU07QUFDMUIsTUFBSSxTQUFTO0FBQ1osWUFBUSxJQUFJLG1DQUFtQyxXQUFXLEVBQUU7QUFBQSxFQUM3RDtBQUVBLE1BQUksQ0FBQyxlQUFlLFlBQVksWUFBWSxNQUFNLFdBQVcsWUFBWSxZQUFZLE1BQU0sTUFBTTtBQUNoRyxXQUFPO0FBQUEsRUFDUjtBQUVBLFNBQU8sb0JBQW9CLFdBQVc7QUFDdkM7IiwKICAibmFtZXMiOiBbXQp9Cg==
