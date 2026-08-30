import assert from "assert";
import { findPorts, getRootProcesses, getSockets, loadConnectionTable, loadListeningPorts, parseIpAddress, tryFindRootPorts } from "../../node/extHostTunnelService.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
const tcp = `  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
	0: 00000000:0BBA 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 2335214 1 0000000010173312 100 0 0 10 0
	1: 00000000:1AF3 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 2334514 1 000000008815920b 100 0 0 10 0
	2: 0100007F:A9EA 0100007F:1AF3 01 00000000:00000000 00:00000000 00000000  1000        0 2334521 1 00000000a37d44c6 21 4 0 10 -1
	3: 0100007F:E8B4 0100007F:98EF 01 00000000:00000000 00:00000000 00000000  1000        0 2334532 1 0000000031b88f06 21 4 0 10 -1
	4: 0100007F:866C 0100007F:8783 01 00000000:00000000 00:00000000 00000000  1000        0 2334510 1 00000000cbf670bb 21 4 30 10 -1
	5: 0100007F:1AF3 0100007F:A9EA 01 00000000:00000000 00:00000000 00000000  1000        0 2338989 1 0000000000bace62 21 4 1 10 -1
`;
const tcp6 = `  sl  local_address                         remote_address                        st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
	0: 00000000000000000000000000000000:815B 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 2321070 1 00000000c44f3f02 100 0 0 10 0
	1: 00000000000000000000000000000000:8783 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 2334509 1 000000003915e812 100 0 0 10 0
	2: 00000000000000000000000000000000:9907 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 2284465 1 00000000f13b9374 100 0 0 10 0
	3: 00000000000000000000000000000000:98EF 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 2334531 1 00000000184cae9c 100 0 0 10 0
	4: 00000000000000000000000000000000:8BCF 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 2329890 1 00000000c05a3466 100 0 0 10 0
	5: 0000000000000000FFFF00000100007F:8783 0000000000000000FFFF00000100007F:866C 01 00000000:00000000 00:00000000 00000000  1000        0 2334511 1 00000000bf547132 21 4 1 10 -1
	6: 0000000000000000FFFF00000100007F:98EF 0000000000000000FFFF00000100007F:E8B4 01 00000000:00000000 00:00000000 00000000  1000        0 2334533 1 0000000039d0bcd2 21 4 1 10 -1
	7: 0000000000000000FFFF0000DFD317AC:9907 0000000000000000FFFF000001D017AC:C123 01 0000005A:00000000 01:00000017 00000000  1000        0 2311039 3 0000000067b6c8db 23 5 25 10 52
	8: 0000000000000000FFFF0000DFD317AC:9907 0000000000000000FFFF000001D017AC:C124 01 00000000:00000000 00:00000000 00000000  1000        0 2311040 1 00000000230bb017 25 4 30 10 28
	9: 0000000000000000FFFF0000DFD317AC:9907 0000000000000000FFFF000001D017AC:C213 01 00000000:00000000 00:00000000 00000000  1000        0 2331501 1 00000000957fcb4a 26 4 30 10 57
	10: 0000000000000000FFFF0000DFD317AC:9907 0000000000000000FFFF000001D017AC:C214 01 00000000:00000000 00:00000000 00000000  1000        0 2331500 1 00000000d7f87ceb 25 4 28 10 -1
`;
const procSockets = `ls: cannot access '/proc/8289/fd/255': No such file or directory
			ls: cannot access '/proc/8289/fd/3': No such file or directory
			lrwx------ 1 alex alex 64 Dec  8 14:59 /proc/230/fd/3 -> socket:[21862]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/0 -> socket:[2311043]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/1 -> socket:[2311045]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/19 -> socket:[2311040]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/2 -> socket:[2311047]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/20 -> socket:[2314928]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/22 -> socket:[2307042]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/24 -> socket:[2307051]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/25 -> socket:[2307044]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/27 -> socket:[2307046]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/29 -> socket:[2307053]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/3 -> socket:[2311049]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/30 -> socket:[2307048]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/32 -> socket:[2307055]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/33 -> socket:[2307067]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/34 -> socket:[2307057]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/35 -> socket:[2321483]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/37 -> socket:[2321070]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/41 -> socket:[2321485]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/42 -> socket:[2321074]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/43 -> socket:[2321487]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/44 -> socket:[2329890]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/45 -> socket:[2321489]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/46 -> socket:[2334509]
			lrwx------ 1 alex alex 64 Dec  8 15:17 /proc/2504/fd/47 -> socket:[2334510]
			lrwx------ 1 alex alex 64 Dec  8 15:17 /proc/2504/fd/48 -> socket:[2329894]
			lrwx------ 1 alex alex 64 Dec  8 15:17 /proc/2504/fd/49 -> socket:[2334511]
			lrwx------ 1 alex alex 64 Dec  8 15:17 /proc/2504/fd/50 -> socket:[2334515]
			lrwx------ 1 alex alex 64 Dec  8 15:17 /proc/2504/fd/51 -> socket:[2334519]
			lrwx------ 1 alex alex 64 Dec  8 15:17 /proc/2504/fd/52 -> socket:[2334518]
			lrwx------ 1 alex alex 64 Dec  8 15:17 /proc/2504/fd/53 -> socket:[2334521]
			lrwx------ 1 alex alex 64 Dec  8 15:17 /proc/2504/fd/54 -> socket:[2334531]
			lrwx------ 1 alex alex 64 Dec  8 15:17 /proc/2504/fd/55 -> socket:[2334532]
			lrwx------ 1 alex alex 64 Dec  8 15:17 /proc/2504/fd/56 -> socket:[2334533]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2515/fd/3 -> socket:[2311053]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2719/fd/0 -> socket:[2307043]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2719/fd/1 -> socket:[2307045]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2719/fd/2 -> socket:[2307047]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2719/fd/3 -> socket:[2307049]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2725/fd/0 -> socket:[2307052]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2725/fd/1 -> socket:[2307054]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2725/fd/2 -> socket:[2307056]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2725/fd/20 -> socket:[2290617]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2725/fd/3 -> socket:[2307058]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2739/fd/0 -> socket:[2307052]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2739/fd/1 -> socket:[2307054]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2739/fd/2 -> socket:[2307056]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2739/fd/3 -> socket:[2290618]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2795/fd/0 -> socket:[2321484]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2795/fd/1 -> socket:[2321486]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2795/fd/2 -> socket:[2321488]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2795/fd/3 -> socket:[2321490]
			lrwx------ 1 alex alex 64 Dec  8 14:59 /proc/314/fd/18 -> socket:[2284465]
			lrwx------ 1 alex alex 64 Dec  8 14:59 /proc/314/fd/19 -> socket:[2311039]
			lrwx------ 1 alex alex 64 Dec  8 14:59 /proc/314/fd/23 -> socket:[2331501]
			lrwx------ 1 alex alex 64 Dec  8 14:59 /proc/314/fd/24 -> socket:[2311052]
			lrwx------ 1 alex alex 64 Dec  8 14:59 /proc/314/fd/25 -> socket:[2311042]
			lrwx------ 1 alex alex 64 Dec  8 14:59 /proc/314/fd/26 -> socket:[2331504]
			lrwx------ 1 alex alex 64 Dec  8 14:59 /proc/314/fd/27 -> socket:[2311051]
			lrwx------ 1 alex alex 64 Dec  8 14:59 /proc/314/fd/29 -> socket:[2311044]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/314/fd/30 -> socket:[2321909]
			lrwx------ 1 alex alex 64 Dec  8 14:59 /proc/314/fd/31 -> socket:[2311046]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/314/fd/33 -> socket:[2311048]
			lrwx------ 1 alex alex 64 Dec  8 15:17 /proc/314/fd/35 -> socket:[2329692]
			lrwx------ 1 alex alex 64 Dec  8 15:17 /proc/314/fd/37 -> socket:[2331506]
			lrwx------ 1 alex alex 64 Dec  8 15:20 /proc/314/fd/40 -> socket:[2331508]
			lrwx------ 1 alex alex 64 Dec  8 15:20 /proc/314/fd/42 -> socket:[2331510]
			lrwx------ 1 alex alex 64 Dec  8 15:17 /proc/314/fd/68 -> socket:[2322083]
			lrwx------ 1 alex alex 64 Dec  8 15:22 /proc/4412/fd/20 -> socket:[2335214]
			lrwx------ 1 alex alex 64 Dec  8 15:22 /proc/4496/fd/0 -> socket:[2331505]
			lrwx------ 1 alex alex 64 Dec  8 15:22 /proc/4496/fd/1 -> socket:[2331507]
			lrwx------ 1 alex alex 64 Dec  8 15:22 /proc/4496/fd/2 -> socket:[2331509]
			lrwx------ 1 alex alex 64 Dec  8 15:22 /proc/4496/fd/23 -> socket:[2334514]
			lrwx------ 1 alex alex 64 Dec  8 15:22 /proc/4496/fd/24 -> socket:[2338989]
			lrwx------ 1 alex alex 64 Dec  8 15:22 /proc/4496/fd/26 -> socket:[2338276]
			lrwx------ 1 alex alex 64 Dec  8 15:22 /proc/4496/fd/27 -> socket:[2331500]
			lrwx------ 1 alex alex 64 Dec  8 15:22 /proc/4496/fd/3 -> socket:[2331511]
			lrwx------ 1 alex alex 64 Dec  8 15:22 /proc/4496/fd/31 -> socket:[2338285]`;
const processes = [
  {
    pid: 230,
    cwd: "/mnt/c/WINDOWS/system32",
    cmd: "dockerserve--addressunix:///home/alex/.docker/run/docker-cli-api.sock"
  },
  {
    pid: 2504,
    cwd: "/mnt/c/Users/alros/AppData/Local/Programs/Microsoft VS Code Insiders",
    cmd: "/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/node/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/out/bootstrap-fork--type=extensionHost--transformURIs--useHostProxy="
  },
  {
    pid: 2515,
    cwd: "/mnt/c/Users/alros/AppData/Local/Programs/Microsoft VS Code Insiders",
    cmd: "/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/node/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/out/bootstrap-fork--type=watcherService"
  },
  {
    pid: 2526,
    cwd: "/home/alex/repos/Microsoft/vscode-extension-samples/helloworld-sample",
    cmd: "/bin/bash"
  },
  {
    pid: 2719,
    cwd: "/mnt/c/Users/alros/AppData/Local/Programs/Microsoft VS Code Insiders",
    cmd: "/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/node--max-old-space-size=3072/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/extensions/node_modules/typescript/lib/tsserver.js--serverModepartialSemantic--useInferredProjectPerProjectRoot--disableAutomaticTypingAcquisition--cancellationPipeName/tmp/vscode-typescript1000/7cfa7171c0c00aacf1ee/tscancellation-602cd80b954818b6a2f7.tmp*--logVerbosityverbose--logFile/home/alex/.vscode-server-insiders/data/logs/20201208T145954/exthost2/vscode.typescript-language-features/tsserver-log-nxBt2m/tsserver.log--globalPluginstypescript-vscode-sh-plugin--pluginProbeLocations/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/extensions/typescript-language-features--localeen--noGetErrOnBackgroundUpdate--validateDefaultNpmLocation"
  },
  {
    pid: 2725,
    cwd: "/mnt/c/Users/alros/AppData/Local/Programs/Microsoft VS Code Insiders",
    cmd: "/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/node--max-old-space-size=3072/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/extensions/node_modules/typescript/lib/tsserver.js--useInferredProjectPerProjectRoot--enableTelemetry--cancellationPipeName/tmp/vscode-typescript1000/7cfa7171c0c00aacf1ee/tscancellation-04a0b92f880c2fd535ae.tmp*--logVerbosityverbose--logFile/home/alex/.vscode-server-insiders/data/logs/20201208T145954/exthost2/vscode.typescript-language-features/tsserver-log-fqyBrs/tsserver.log--globalPluginstypescript-vscode-sh-plugin--pluginProbeLocations/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/extensions/typescript-language-features--localeen--noGetErrOnBackgroundUpdate--validateDefaultNpmLocation"
  },
  {
    pid: 2739,
    cwd: "/mnt/c/Users/alros/AppData/Local/Programs/Microsoft VS Code Insiders",
    cmd: "/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/node/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/extensions/node_modules/typescript/lib/typingsInstaller.js--globalTypingsCacheLocation/home/alex/.cache/typescript/4.1--enableTelemetry--logFile/home/alex/.vscode-server-insiders/data/logs/20201208T145954/exthost2/vscode.typescript-language-features/tsserver-log-fqyBrs/ti-2725.log--typesMapLocation/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/extensions/node_modules/typescript/lib/typesMap.json--validateDefaultNpmLocation"
  },
  {
    pid: 2795,
    cwd: "/home/alex/repos/Microsoft/vscode-extension-samples/helloworld-sample",
    cmd: "/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/node/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/extensions/json-language-features/server/dist/node/jsonServerMain--node-ipc--clientProcessId=2504"
  },
  {
    pid: 286,
    cwd: "/mnt/c/Users/alros/AppData/Local/Programs/Microsoft VS Code Insiders",
    cmd: 'sh-c"$VSCODE_WSL_EXT_LOCATION/ scripts / wslServer.sh" bc13785d3dd99b4b0e9da9aed17bb79809a50804 insider .vscode-server-insiders 0  '
  },
  {
    pid: 287,
    cwd: "/mnt/c/Users/alros/AppData/Local/Programs/Microsoft VS Code Insiders",
    cmd: "sh/mnt/c/Users/alros/.vscode-insiders/extensions/ms-vscode-remote.remote-wsl-0.52.0/scripts/wslServer.shbc13785d3dd99b4b0e9da9aed17bb79809a50804insider.vscode-server-insiders0"
  },
  {
    pid: 3058,
    cwd: "/home/alex/repos/Microsoft/vscode-extension-samples/helloworld-sample",
    cmd: "npm"
  },
  {
    pid: 3070,
    cwd: "/home/alex/repos/Microsoft/vscode-extension-samples/helloworld-sample",
    cmd: "sh-ctsc -watch -p ./"
  },
  {
    pid: 3071,
    cwd: "/home/alex/repos/Microsoft/vscode-extension-samples/helloworld-sample",
    cmd: "node/home/alex/repos/Microsoft/vscode-extension-samples/helloworld-sample/node_modules/.bin/tsc-watch-p./"
  },
  {
    pid: 312,
    cwd: "/mnt/c/Users/alros/AppData/Local/Programs/Microsoft VS Code Insiders",
    cmd: "sh/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/server.sh--port=0--use-host-proxy--enable-remote-auto-shutdown--print-ip-address"
  },
  {
    pid: 314,
    cwd: "/mnt/c/Users/alros/AppData/Local/Programs/Microsoft VS Code Insiders",
    cmd: "/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/node/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/out/server-main.js--port=0--use-host-proxy--enable-remote-auto-shutdown--print-ip-address"
  },
  {
    pid: 3172,
    cwd: "/home/alex",
    cmd: "/bin/bash"
  },
  {
    pid: 3610,
    cwd: "/home/alex/repos/Microsoft/vscode-extension-samples/helloworld-sample",
    cmd: "/bin/bash"
  },
  {
    pid: 4412,
    cwd: "/home/alex/repos/Microsoft/vscode-extension-samples/helloworld-sample",
    cmd: "http-server"
  },
  {
    pid: 4496,
    cwd: "/mnt/c/Users/alros/AppData/Local/Programs/Microsoft VS Code Insiders",
    cmd: "/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/node--inspect-brk=0.0.0.0:6899/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/out/bootstrap-fork--type=extensionHost--transformURIs--useHostProxy="
  },
  {
    pid: 4507,
    cwd: "/mnt/c/Users/alros/AppData/Local/Programs/Microsoft VS Code Insiders",
    cmd: "/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/node/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/extensions/ms-vscode.js-debug/src/hash.bundle.js"
  }
];
const psStdOut = `4 S root         1     0  0  80   0 -   596 -       1440   2 14:41 ?        00:00:00 /bin/sh -c echo Container started ; trap "exit 0" 15; while sleep 1 & wait $!; do :; done
4 S root        14     0  0  80   0 -   596 -        764   4 14:41 ?        00:00:00 /bin/sh
4 S root        40     0  0  80   0 -   596 -        700   4 14:41 ?        00:00:00 /bin/sh
4 S root       513   380  0  80   0 -  2476 -       3404   1 14:41 pts/1    00:00:00 sudo npx http-server -p 5000
4 S root       514   513  0  80   0 - 165439 -     41380   5 14:41 pts/1    00:00:00 http-server
0 S root      1052     1  0  80   0 -   573 -        752   5 14:43 ?        00:00:00 sleep 1
0 S node      1056   329  0  80   0 -   596 do_wai   764  10 14:43 ?        00:00:00 /bin/sh -c ps -F -A -l | grep root
0 S node      1058  1056  0  80   0 -   770 pipe_w   888   9 14:43 ?        00:00:00 grep root`;
suite("ExtHostTunnelService", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("getSockets", function() {
    const result = getSockets(procSockets);
    assert.strictEqual(Object.keys(result).length, 75);
    assert.notStrictEqual(Object.keys(result).find((key) => result[key].pid === 4412), void 0);
  });
  test("loadConnectionTable", function() {
    const result = loadConnectionTable(tcp);
    assert.strictEqual(result.length, 6);
    assert.deepStrictEqual(result[0], {
      10: "1",
      11: "0000000010173312",
      12: "100",
      13: "0",
      14: "0",
      15: "10",
      16: "0",
      inode: "2335214",
      local_address: "00000000:0BBA",
      rem_address: "00000000:0000",
      retrnsmt: "00000000",
      sl: "0:",
      st: "0A",
      timeout: "0",
      tr: "00:00000000",
      tx_queue: "00000000:00000000",
      uid: "1000"
    });
  });
  test("loadListeningPorts", function() {
    const result = loadListeningPorts(tcp, tcp6);
    assert.strictEqual(result.length, 7);
    assert.notStrictEqual(result.find((value) => value.port === 3002), void 0);
  });
  test("tryFindRootPorts", function() {
    const rootProcesses = getRootProcesses(psStdOut);
    assert.strictEqual(rootProcesses.length, 6);
    const result = tryFindRootPorts([{ socket: 1e3, ip: "127.0.0.1", port: 5e3 }], psStdOut, /* @__PURE__ */ new Map());
    assert.strictEqual(result.size, 1);
    assert.strictEqual(result.get(5e3)?.pid, 514);
  });
  test("findPorts", async function() {
    const result = await findPorts(loadListeningPorts(tcp, tcp6), getSockets(procSockets), processes);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].host, "0.0.0.0");
    assert.strictEqual(result[0].port, 3002);
    assert.strictEqual(result[0].detail, "http-server");
  });
  test("parseIpAddress", function() {
    assert.strictEqual(parseIpAddress("00000000000000000000000001000000"), "0:0:0:0:0:0:0:1");
    assert.strictEqual(parseIpAddress("0000000000000000FFFF0000040510AC"), "0:0:0:0:0:ffff:ac10:504");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcdGVzdFxcbm9kZVxcZXh0SG9zdFR1bm5lbFNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGZpbmRQb3J0cywgZ2V0Um9vdFByb2Nlc3NlcywgZ2V0U29ja2V0cywgbG9hZENvbm5lY3Rpb25UYWJsZSwgbG9hZExpc3RlbmluZ1BvcnRzLCBwYXJzZUlwQWRkcmVzcywgdHJ5RmluZFJvb3RQb3J0cyB9IGZyb20gJy4uLy4uL25vZGUvZXh0SG9zdFR1bm5lbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5cbmNvbnN0IHRjcCA9XG5cdGAgIHNsICBsb2NhbF9hZGRyZXNzIHJlbV9hZGRyZXNzICAgc3QgdHhfcXVldWUgcnhfcXVldWUgdHIgdG0tPndoZW4gcmV0cm5zbXQgICB1aWQgIHRpbWVvdXQgaW5vZGVcblx0MDogMDAwMDAwMDA6MEJCQSAwMDAwMDAwMDowMDAwIDBBIDAwMDAwMDAwOjAwMDAwMDAwIDAwOjAwMDAwMDAwIDAwMDAwMDAwICAxMDAwICAgICAgICAwIDIzMzUyMTQgMSAwMDAwMDAwMDEwMTczMzEyIDEwMCAwIDAgMTAgMFxuXHQxOiAwMDAwMDAwMDoxQUYzIDAwMDAwMDAwOjAwMDAgMEEgMDAwMDAwMDA6MDAwMDAwMDAgMDA6MDAwMDAwMDAgMDAwMDAwMDAgIDEwMDAgICAgICAgIDAgMjMzNDUxNCAxIDAwMDAwMDAwODgxNTkyMGIgMTAwIDAgMCAxMCAwXG5cdDI6IDAxMDAwMDdGOkE5RUEgMDEwMDAwN0Y6MUFGMyAwMSAwMDAwMDAwMDowMDAwMDAwMCAwMDowMDAwMDAwMCAwMDAwMDAwMCAgMTAwMCAgICAgICAgMCAyMzM0NTIxIDEgMDAwMDAwMDBhMzdkNDRjNiAyMSA0IDAgMTAgLTFcblx0MzogMDEwMDAwN0Y6RThCNCAwMTAwMDA3Rjo5OEVGIDAxIDAwMDAwMDAwOjAwMDAwMDAwIDAwOjAwMDAwMDAwIDAwMDAwMDAwICAxMDAwICAgICAgICAwIDIzMzQ1MzIgMSAwMDAwMDAwMDMxYjg4ZjA2IDIxIDQgMCAxMCAtMVxuXHQ0OiAwMTAwMDA3Rjo4NjZDIDAxMDAwMDdGOjg3ODMgMDEgMDAwMDAwMDA6MDAwMDAwMDAgMDA6MDAwMDAwMDAgMDAwMDAwMDAgIDEwMDAgICAgICAgIDAgMjMzNDUxMCAxIDAwMDAwMDAwY2JmNjcwYmIgMjEgNCAzMCAxMCAtMVxuXHQ1OiAwMTAwMDA3RjoxQUYzIDAxMDAwMDdGOkE5RUEgMDEgMDAwMDAwMDA6MDAwMDAwMDAgMDA6MDAwMDAwMDAgMDAwMDAwMDAgIDEwMDAgICAgICAgIDAgMjMzODk4OSAxIDAwMDAwMDAwMDBiYWNlNjIgMjEgNCAxIDEwIC0xXG5gO1xuY29uc3QgdGNwNiA9XG5cdGAgIHNsICBsb2NhbF9hZGRyZXNzICAgICAgICAgICAgICAgICAgICAgICAgIHJlbW90ZV9hZGRyZXNzICAgICAgICAgICAgICAgICAgICAgICAgc3QgdHhfcXVldWUgcnhfcXVldWUgdHIgdG0tPndoZW4gcmV0cm5zbXQgICB1aWQgIHRpbWVvdXQgaW5vZGVcblx0MDogMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA6ODE1QiAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDowMDAwIDBBIDAwMDAwMDAwOjAwMDAwMDAwIDAwOjAwMDAwMDAwIDAwMDAwMDAwICAxMDAwICAgICAgICAwIDIzMjEwNzAgMSAwMDAwMDAwMGM0NGYzZjAyIDEwMCAwIDAgMTAgMFxuXHQxOiAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDo4NzgzIDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwOjAwMDAgMEEgMDAwMDAwMDA6MDAwMDAwMDAgMDA6MDAwMDAwMDAgMDAwMDAwMDAgIDEwMDAgICAgICAgIDAgMjMzNDUwOSAxIDAwMDAwMDAwMzkxNWU4MTIgMTAwIDAgMCAxMCAwXG5cdDI6IDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwOjk5MDcgMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA6MDAwMCAwQSAwMDAwMDAwMDowMDAwMDAwMCAwMDowMDAwMDAwMCAwMDAwMDAwMCAgMTAwMCAgICAgICAgMCAyMjg0NDY1IDEgMDAwMDAwMDBmMTNiOTM3NCAxMDAgMCAwIDEwIDBcblx0MzogMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA6OThFRiAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDowMDAwIDBBIDAwMDAwMDAwOjAwMDAwMDAwIDAwOjAwMDAwMDAwIDAwMDAwMDAwICAxMDAwICAgICAgICAwIDIzMzQ1MzEgMSAwMDAwMDAwMDE4NGNhZTljIDEwMCAwIDAgMTAgMFxuXHQ0OiAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDo4QkNGIDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwOjAwMDAgMEEgMDAwMDAwMDA6MDAwMDAwMDAgMDA6MDAwMDAwMDAgMDAwMDAwMDAgIDEwMDAgICAgICAgIDAgMjMyOTg5MCAxIDAwMDAwMDAwYzA1YTM0NjYgMTAwIDAgMCAxMCAwXG5cdDU6IDAwMDAwMDAwMDAwMDAwMDBGRkZGMDAwMDAxMDAwMDdGOjg3ODMgMDAwMDAwMDAwMDAwMDAwMEZGRkYwMDAwMDEwMDAwN0Y6ODY2QyAwMSAwMDAwMDAwMDowMDAwMDAwMCAwMDowMDAwMDAwMCAwMDAwMDAwMCAgMTAwMCAgICAgICAgMCAyMzM0NTExIDEgMDAwMDAwMDBiZjU0NzEzMiAyMSA0IDEgMTAgLTFcblx0NjogMDAwMDAwMDAwMDAwMDAwMEZGRkYwMDAwMDEwMDAwN0Y6OThFRiAwMDAwMDAwMDAwMDAwMDAwRkZGRjAwMDAwMTAwMDA3RjpFOEI0IDAxIDAwMDAwMDAwOjAwMDAwMDAwIDAwOjAwMDAwMDAwIDAwMDAwMDAwICAxMDAwICAgICAgICAwIDIzMzQ1MzMgMSAwMDAwMDAwMDM5ZDBiY2QyIDIxIDQgMSAxMCAtMVxuXHQ3OiAwMDAwMDAwMDAwMDAwMDAwRkZGRjAwMDBERkQzMTdBQzo5OTA3IDAwMDAwMDAwMDAwMDAwMDBGRkZGMDAwMDAxRDAxN0FDOkMxMjMgMDEgMDAwMDAwNUE6MDAwMDAwMDAgMDE6MDAwMDAwMTcgMDAwMDAwMDAgIDEwMDAgICAgICAgIDAgMjMxMTAzOSAzIDAwMDAwMDAwNjdiNmM4ZGIgMjMgNSAyNSAxMCA1MlxuXHQ4OiAwMDAwMDAwMDAwMDAwMDAwRkZGRjAwMDBERkQzMTdBQzo5OTA3IDAwMDAwMDAwMDAwMDAwMDBGRkZGMDAwMDAxRDAxN0FDOkMxMjQgMDEgMDAwMDAwMDA6MDAwMDAwMDAgMDA6MDAwMDAwMDAgMDAwMDAwMDAgIDEwMDAgICAgICAgIDAgMjMxMTA0MCAxIDAwMDAwMDAwMjMwYmIwMTcgMjUgNCAzMCAxMCAyOFxuXHQ5OiAwMDAwMDAwMDAwMDAwMDAwRkZGRjAwMDBERkQzMTdBQzo5OTA3IDAwMDAwMDAwMDAwMDAwMDBGRkZGMDAwMDAxRDAxN0FDOkMyMTMgMDEgMDAwMDAwMDA6MDAwMDAwMDAgMDA6MDAwMDAwMDAgMDAwMDAwMDAgIDEwMDAgICAgICAgIDAgMjMzMTUwMSAxIDAwMDAwMDAwOTU3ZmNiNGEgMjYgNCAzMCAxMCA1N1xuXHQxMDogMDAwMDAwMDAwMDAwMDAwMEZGRkYwMDAwREZEMzE3QUM6OTkwNyAwMDAwMDAwMDAwMDAwMDAwRkZGRjAwMDAwMUQwMTdBQzpDMjE0IDAxIDAwMDAwMDAwOjAwMDAwMDAwIDAwOjAwMDAwMDAwIDAwMDAwMDAwICAxMDAwICAgICAgICAwIDIzMzE1MDAgMSAwMDAwMDAwMGQ3Zjg3Y2ViIDI1IDQgMjggMTAgLTFcbmA7XG5cbmNvbnN0IHByb2NTb2NrZXRzID1cblx0YGxzOiBjYW5ub3QgYWNjZXNzICcvcHJvYy84Mjg5L2ZkLzI1NSc6IE5vIHN1Y2ggZmlsZSBvciBkaXJlY3Rvcnlcblx0XHRcdGxzOiBjYW5ub3QgYWNjZXNzICcvcHJvYy84Mjg5L2ZkLzMnOiBObyBzdWNoIGZpbGUgb3IgZGlyZWN0b3J5XG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNDo1OSAvcHJvYy8yMzAvZmQvMyAtPiBzb2NrZXQ6WzIxODYyXVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTQgL3Byb2MvMjUwNC9mZC8wIC0+IHNvY2tldDpbMjMxMTA0M11cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE0IC9wcm9jLzI1MDQvZmQvMSAtPiBzb2NrZXQ6WzIzMTEwNDVdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNCAvcHJvYy8yNTA0L2ZkLzE5IC0+IHNvY2tldDpbMjMxMTA0MF1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE0IC9wcm9jLzI1MDQvZmQvMiAtPiBzb2NrZXQ6WzIzMTEwNDddXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNCAvcHJvYy8yNTA0L2ZkLzIwIC0+IHNvY2tldDpbMjMxNDkyOF1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE0IC9wcm9jLzI1MDQvZmQvMjIgLT4gc29ja2V0OlsyMzA3MDQyXVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTQgL3Byb2MvMjUwNC9mZC8yNCAtPiBzb2NrZXQ6WzIzMDcwNTFdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNCAvcHJvYy8yNTA0L2ZkLzI1IC0+IHNvY2tldDpbMjMwNzA0NF1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE0IC9wcm9jLzI1MDQvZmQvMjcgLT4gc29ja2V0OlsyMzA3MDQ2XVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTQgL3Byb2MvMjUwNC9mZC8yOSAtPiBzb2NrZXQ6WzIzMDcwNTNdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNCAvcHJvYy8yNTA0L2ZkLzMgLT4gc29ja2V0OlsyMzExMDQ5XVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTQgL3Byb2MvMjUwNC9mZC8zMCAtPiBzb2NrZXQ6WzIzMDcwNDhdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNCAvcHJvYy8yNTA0L2ZkLzMyIC0+IHNvY2tldDpbMjMwNzA1NV1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE0IC9wcm9jLzI1MDQvZmQvMzMgLT4gc29ja2V0OlsyMzA3MDY3XVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTQgL3Byb2MvMjUwNC9mZC8zNCAtPiBzb2NrZXQ6WzIzMDcwNTddXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNCAvcHJvYy8yNTA0L2ZkLzM1IC0+IHNvY2tldDpbMjMyMTQ4M11cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE0IC9wcm9jLzI1MDQvZmQvMzcgLT4gc29ja2V0OlsyMzIxMDcwXVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTQgL3Byb2MvMjUwNC9mZC80MSAtPiBzb2NrZXQ6WzIzMjE0ODVdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNCAvcHJvYy8yNTA0L2ZkLzQyIC0+IHNvY2tldDpbMjMyMTA3NF1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE0IC9wcm9jLzI1MDQvZmQvNDMgLT4gc29ja2V0OlsyMzIxNDg3XVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTQgL3Byb2MvMjUwNC9mZC80NCAtPiBzb2NrZXQ6WzIzMjk4OTBdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNCAvcHJvYy8yNTA0L2ZkLzQ1IC0+IHNvY2tldDpbMjMyMTQ4OV1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE0IC9wcm9jLzI1MDQvZmQvNDYgLT4gc29ja2V0OlsyMzM0NTA5XVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTcgL3Byb2MvMjUwNC9mZC80NyAtPiBzb2NrZXQ6WzIzMzQ1MTBdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNyAvcHJvYy8yNTA0L2ZkLzQ4IC0+IHNvY2tldDpbMjMyOTg5NF1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE3IC9wcm9jLzI1MDQvZmQvNDkgLT4gc29ja2V0OlsyMzM0NTExXVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTcgL3Byb2MvMjUwNC9mZC81MCAtPiBzb2NrZXQ6WzIzMzQ1MTVdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNyAvcHJvYy8yNTA0L2ZkLzUxIC0+IHNvY2tldDpbMjMzNDUxOV1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE3IC9wcm9jLzI1MDQvZmQvNTIgLT4gc29ja2V0OlsyMzM0NTE4XVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTcgL3Byb2MvMjUwNC9mZC81MyAtPiBzb2NrZXQ6WzIzMzQ1MjFdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNyAvcHJvYy8yNTA0L2ZkLzU0IC0+IHNvY2tldDpbMjMzNDUzMV1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE3IC9wcm9jLzI1MDQvZmQvNTUgLT4gc29ja2V0OlsyMzM0NTMyXVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTcgL3Byb2MvMjUwNC9mZC81NiAtPiBzb2NrZXQ6WzIzMzQ1MzNdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNCAvcHJvYy8yNTE1L2ZkLzMgLT4gc29ja2V0OlsyMzExMDUzXVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTQgL3Byb2MvMjcxOS9mZC8wIC0+IHNvY2tldDpbMjMwNzA0M11cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE0IC9wcm9jLzI3MTkvZmQvMSAtPiBzb2NrZXQ6WzIzMDcwNDVdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNCAvcHJvYy8yNzE5L2ZkLzIgLT4gc29ja2V0OlsyMzA3MDQ3XVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTQgL3Byb2MvMjcxOS9mZC8zIC0+IHNvY2tldDpbMjMwNzA0OV1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE0IC9wcm9jLzI3MjUvZmQvMCAtPiBzb2NrZXQ6WzIzMDcwNTJdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNCAvcHJvYy8yNzI1L2ZkLzEgLT4gc29ja2V0OlsyMzA3MDU0XVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTQgL3Byb2MvMjcyNS9mZC8yIC0+IHNvY2tldDpbMjMwNzA1Nl1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE0IC9wcm9jLzI3MjUvZmQvMjAgLT4gc29ja2V0OlsyMjkwNjE3XVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTQgL3Byb2MvMjcyNS9mZC8zIC0+IHNvY2tldDpbMjMwNzA1OF1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE0IC9wcm9jLzI3MzkvZmQvMCAtPiBzb2NrZXQ6WzIzMDcwNTJdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNCAvcHJvYy8yNzM5L2ZkLzEgLT4gc29ja2V0OlsyMzA3MDU0XVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTQgL3Byb2MvMjczOS9mZC8yIC0+IHNvY2tldDpbMjMwNzA1Nl1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE0IC9wcm9jLzI3MzkvZmQvMyAtPiBzb2NrZXQ6WzIyOTA2MThdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNCAvcHJvYy8yNzk1L2ZkLzAgLT4gc29ja2V0OlsyMzIxNDg0XVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTQgL3Byb2MvMjc5NS9mZC8xIC0+IHNvY2tldDpbMjMyMTQ4Nl1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE0IC9wcm9jLzI3OTUvZmQvMiAtPiBzb2NrZXQ6WzIzMjE0ODhdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNCAvcHJvYy8yNzk1L2ZkLzMgLT4gc29ja2V0OlsyMzIxNDkwXVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTQ6NTkgL3Byb2MvMzE0L2ZkLzE4IC0+IHNvY2tldDpbMjI4NDQ2NV1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE0OjU5IC9wcm9jLzMxNC9mZC8xOSAtPiBzb2NrZXQ6WzIzMTEwMzldXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNDo1OSAvcHJvYy8zMTQvZmQvMjMgLT4gc29ja2V0OlsyMzMxNTAxXVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTQ6NTkgL3Byb2MvMzE0L2ZkLzI0IC0+IHNvY2tldDpbMjMxMTA1Ml1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE0OjU5IC9wcm9jLzMxNC9mZC8yNSAtPiBzb2NrZXQ6WzIzMTEwNDJdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNDo1OSAvcHJvYy8zMTQvZmQvMjYgLT4gc29ja2V0OlsyMzMxNTA0XVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTQ6NTkgL3Byb2MvMzE0L2ZkLzI3IC0+IHNvY2tldDpbMjMxMTA1MV1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE0OjU5IC9wcm9jLzMxNC9mZC8yOSAtPiBzb2NrZXQ6WzIzMTEwNDRdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNCAvcHJvYy8zMTQvZmQvMzAgLT4gc29ja2V0OlsyMzIxOTA5XVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTQ6NTkgL3Byb2MvMzE0L2ZkLzMxIC0+IHNvY2tldDpbMjMxMTA0Nl1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE0IC9wcm9jLzMxNC9mZC8zMyAtPiBzb2NrZXQ6WzIzMTEwNDhdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNyAvcHJvYy8zMTQvZmQvMzUgLT4gc29ja2V0OlsyMzI5NjkyXVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTcgL3Byb2MvMzE0L2ZkLzM3IC0+IHNvY2tldDpbMjMzMTUwNl1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjIwIC9wcm9jLzMxNC9mZC80MCAtPiBzb2NrZXQ6WzIzMzE1MDhdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToyMCAvcHJvYy8zMTQvZmQvNDIgLT4gc29ja2V0OlsyMzMxNTEwXVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTcgL3Byb2MvMzE0L2ZkLzY4IC0+IHNvY2tldDpbMjMyMjA4M11cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjIyIC9wcm9jLzQ0MTIvZmQvMjAgLT4gc29ja2V0OlsyMzM1MjE0XVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MjIgL3Byb2MvNDQ5Ni9mZC8wIC0+IHNvY2tldDpbMjMzMTUwNV1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjIyIC9wcm9jLzQ0OTYvZmQvMSAtPiBzb2NrZXQ6WzIzMzE1MDddXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToyMiAvcHJvYy80NDk2L2ZkLzIgLT4gc29ja2V0OlsyMzMxNTA5XVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MjIgL3Byb2MvNDQ5Ni9mZC8yMyAtPiBzb2NrZXQ6WzIzMzQ1MTRdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToyMiAvcHJvYy80NDk2L2ZkLzI0IC0+IHNvY2tldDpbMjMzODk4OV1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjIyIC9wcm9jLzQ0OTYvZmQvMjYgLT4gc29ja2V0OlsyMzM4Mjc2XVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MjIgL3Byb2MvNDQ5Ni9mZC8yNyAtPiBzb2NrZXQ6WzIzMzE1MDBdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToyMiAvcHJvYy80NDk2L2ZkLzMgLT4gc29ja2V0OlsyMzMxNTExXVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MjIgL3Byb2MvNDQ5Ni9mZC8zMSAtPiBzb2NrZXQ6WzIzMzgyODVdYDtcblxuY29uc3QgcHJvY2Vzc2VzOiB7IHBpZDogbnVtYmVyOyBjd2Q6IHN0cmluZzsgY21kOiBzdHJpbmcgfVtdID0gW1xuXHR7XG5cdFx0cGlkOiAyMzAsXG5cdFx0Y3dkOiAnL21udC9jL1dJTkRPV1Mvc3lzdGVtMzInLFxuXHRcdGNtZDogJ2RvY2tlcnNlcnZlLS1hZGRyZXNzdW5peDovLy9ob21lL2FsZXgvLmRvY2tlci9ydW4vZG9ja2VyLWNsaS1hcGkuc29jaycsXG5cdH0sXG5cdHtcblx0XHRwaWQ6IDI1MDQsXG5cdFx0Y3dkOiAnL21udC9jL1VzZXJzL2Fscm9zL0FwcERhdGEvTG9jYWwvUHJvZ3JhbXMvTWljcm9zb2Z0IFZTIENvZGUgSW5zaWRlcnMnLFxuXHRcdGNtZDogJy9ob21lL2FsZXgvLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMvYmluL2JjMTM3ODVkM2RkOTliNGIwZTlkYTlhZWQxN2JiNzk4MDlhNTA4MDQvbm9kZS9ob21lL2FsZXgvLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMvYmluL2JjMTM3ODVkM2RkOTliNGIwZTlkYTlhZWQxN2JiNzk4MDlhNTA4MDQvb3V0L2Jvb3RzdHJhcC1mb3JrLS10eXBlPWV4dGVuc2lvbkhvc3QtLXRyYW5zZm9ybVVSSXMtLXVzZUhvc3RQcm94eT0nLFxuXHR9LFxuXHR7XG5cdFx0cGlkOiAyNTE1LFxuXHRcdGN3ZDogJy9tbnQvYy9Vc2Vycy9hbHJvcy9BcHBEYXRhL0xvY2FsL1Byb2dyYW1zL01pY3Jvc29mdCBWUyBDb2RlIEluc2lkZXJzJyxcblx0XHRjbWQ6ICcvaG9tZS9hbGV4Ly52c2NvZGUtc2VydmVyLWluc2lkZXJzL2Jpbi9iYzEzNzg1ZDNkZDk5YjRiMGU5ZGE5YWVkMTdiYjc5ODA5YTUwODA0L25vZGUvaG9tZS9hbGV4Ly52c2NvZGUtc2VydmVyLWluc2lkZXJzL2Jpbi9iYzEzNzg1ZDNkZDk5YjRiMGU5ZGE5YWVkMTdiYjc5ODA5YTUwODA0L291dC9ib290c3RyYXAtZm9yay0tdHlwZT13YXRjaGVyU2VydmljZSdcblx0fSxcblx0e1xuXHRcdHBpZDogMjUyNixcblx0XHRjd2Q6ICcvaG9tZS9hbGV4L3JlcG9zL01pY3Jvc29mdC92c2NvZGUtZXh0ZW5zaW9uLXNhbXBsZXMvaGVsbG93b3JsZC1zYW1wbGUnLFxuXHRcdGNtZDogJy9iaW4vYmFzaCdcblx0fSwge1xuXHRcdHBpZDogMjcxOSxcblx0XHRjd2Q6ICcvbW50L2MvVXNlcnMvYWxyb3MvQXBwRGF0YS9Mb2NhbC9Qcm9ncmFtcy9NaWNyb3NvZnQgVlMgQ29kZSBJbnNpZGVycycsXG5cdFx0Y21kOiAnL2hvbWUvYWxleC8udnNjb2RlLXNlcnZlci1pbnNpZGVycy9iaW4vYmMxMzc4NWQzZGQ5OWI0YjBlOWRhOWFlZDE3YmI3OTgwOWE1MDgwNC9ub2RlLS1tYXgtb2xkLXNwYWNlLXNpemU9MzA3Mi9ob21lL2FsZXgvLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMvYmluL2JjMTM3ODVkM2RkOTliNGIwZTlkYTlhZWQxN2JiNzk4MDlhNTA4MDQvZXh0ZW5zaW9ucy9ub2RlX21vZHVsZXMvdHlwZXNjcmlwdC9saWIvdHNzZXJ2ZXIuanMtLXNlcnZlck1vZGVwYXJ0aWFsU2VtYW50aWMtLXVzZUluZmVycmVkUHJvamVjdFBlclByb2plY3RSb290LS1kaXNhYmxlQXV0b21hdGljVHlwaW5nQWNxdWlzaXRpb24tLWNhbmNlbGxhdGlvblBpcGVOYW1lL3RtcC92c2NvZGUtdHlwZXNjcmlwdDEwMDAvN2NmYTcxNzFjMGMwMGFhY2YxZWUvdHNjYW5jZWxsYXRpb24tNjAyY2Q4MGI5NTQ4MThiNmEyZjcudG1wKi0tbG9nVmVyYm9zaXR5dmVyYm9zZS0tbG9nRmlsZS9ob21lL2FsZXgvLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMvZGF0YS9sb2dzLzIwMjAxMjA4VDE0NTk1NC9leHRob3N0Mi92c2NvZGUudHlwZXNjcmlwdC1sYW5ndWFnZS1mZWF0dXJlcy90c3NlcnZlci1sb2ctbnhCdDJtL3Rzc2VydmVyLmxvZy0tZ2xvYmFsUGx1Z2luc3R5cGVzY3JpcHQtdnNjb2RlLXNoLXBsdWdpbi0tcGx1Z2luUHJvYmVMb2NhdGlvbnMvaG9tZS9hbGV4Ly52c2NvZGUtc2VydmVyLWluc2lkZXJzL2Jpbi9iYzEzNzg1ZDNkZDk5YjRiMGU5ZGE5YWVkMTdiYjc5ODA5YTUwODA0L2V4dGVuc2lvbnMvdHlwZXNjcmlwdC1sYW5ndWFnZS1mZWF0dXJlcy0tbG9jYWxlZW4tLW5vR2V0RXJyT25CYWNrZ3JvdW5kVXBkYXRlLS12YWxpZGF0ZURlZmF1bHROcG1Mb2NhdGlvbidcblx0fSxcblx0e1xuXHRcdHBpZDogMjcyNSxcblx0XHRjd2Q6ICcvbW50L2MvVXNlcnMvYWxyb3MvQXBwRGF0YS9Mb2NhbC9Qcm9ncmFtcy9NaWNyb3NvZnQgVlMgQ29kZSBJbnNpZGVycycsXG5cdFx0Y21kOiAnL2hvbWUvYWxleC8udnNjb2RlLXNlcnZlci1pbnNpZGVycy9iaW4vYmMxMzc4NWQzZGQ5OWI0YjBlOWRhOWFlZDE3YmI3OTgwOWE1MDgwNC9ub2RlLS1tYXgtb2xkLXNwYWNlLXNpemU9MzA3Mi9ob21lL2FsZXgvLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMvYmluL2JjMTM3ODVkM2RkOTliNGIwZTlkYTlhZWQxN2JiNzk4MDlhNTA4MDQvZXh0ZW5zaW9ucy9ub2RlX21vZHVsZXMvdHlwZXNjcmlwdC9saWIvdHNzZXJ2ZXIuanMtLXVzZUluZmVycmVkUHJvamVjdFBlclByb2plY3RSb290LS1lbmFibGVUZWxlbWV0cnktLWNhbmNlbGxhdGlvblBpcGVOYW1lL3RtcC92c2NvZGUtdHlwZXNjcmlwdDEwMDAvN2NmYTcxNzFjMGMwMGFhY2YxZWUvdHNjYW5jZWxsYXRpb24tMDRhMGI5MmY4ODBjMmZkNTM1YWUudG1wKi0tbG9nVmVyYm9zaXR5dmVyYm9zZS0tbG9nRmlsZS9ob21lL2FsZXgvLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMvZGF0YS9sb2dzLzIwMjAxMjA4VDE0NTk1NC9leHRob3N0Mi92c2NvZGUudHlwZXNjcmlwdC1sYW5ndWFnZS1mZWF0dXJlcy90c3NlcnZlci1sb2ctZnF5QnJzL3Rzc2VydmVyLmxvZy0tZ2xvYmFsUGx1Z2luc3R5cGVzY3JpcHQtdnNjb2RlLXNoLXBsdWdpbi0tcGx1Z2luUHJvYmVMb2NhdGlvbnMvaG9tZS9hbGV4Ly52c2NvZGUtc2VydmVyLWluc2lkZXJzL2Jpbi9iYzEzNzg1ZDNkZDk5YjRiMGU5ZGE5YWVkMTdiYjc5ODA5YTUwODA0L2V4dGVuc2lvbnMvdHlwZXNjcmlwdC1sYW5ndWFnZS1mZWF0dXJlcy0tbG9jYWxlZW4tLW5vR2V0RXJyT25CYWNrZ3JvdW5kVXBkYXRlLS12YWxpZGF0ZURlZmF1bHROcG1Mb2NhdGlvbidcblx0fSxcblx0e1xuXHRcdHBpZDogMjczOSxcblx0XHRjd2Q6ICcvbW50L2MvVXNlcnMvYWxyb3MvQXBwRGF0YS9Mb2NhbC9Qcm9ncmFtcy9NaWNyb3NvZnQgVlMgQ29kZSBJbnNpZGVycycsXG5cdFx0Y21kOiAnL2hvbWUvYWxleC8udnNjb2RlLXNlcnZlci1pbnNpZGVycy9iaW4vYmMxMzc4NWQzZGQ5OWI0YjBlOWRhOWFlZDE3YmI3OTgwOWE1MDgwNC9ub2RlL2hvbWUvYWxleC8udnNjb2RlLXNlcnZlci1pbnNpZGVycy9iaW4vYmMxMzc4NWQzZGQ5OWI0YjBlOWRhOWFlZDE3YmI3OTgwOWE1MDgwNC9leHRlbnNpb25zL25vZGVfbW9kdWxlcy90eXBlc2NyaXB0L2xpYi90eXBpbmdzSW5zdGFsbGVyLmpzLS1nbG9iYWxUeXBpbmdzQ2FjaGVMb2NhdGlvbi9ob21lL2FsZXgvLmNhY2hlL3R5cGVzY3JpcHQvNC4xLS1lbmFibGVUZWxlbWV0cnktLWxvZ0ZpbGUvaG9tZS9hbGV4Ly52c2NvZGUtc2VydmVyLWluc2lkZXJzL2RhdGEvbG9ncy8yMDIwMTIwOFQxNDU5NTQvZXh0aG9zdDIvdnNjb2RlLnR5cGVzY3JpcHQtbGFuZ3VhZ2UtZmVhdHVyZXMvdHNzZXJ2ZXItbG9nLWZxeUJycy90aS0yNzI1LmxvZy0tdHlwZXNNYXBMb2NhdGlvbi9ob21lL2FsZXgvLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMvYmluL2JjMTM3ODVkM2RkOTliNGIwZTlkYTlhZWQxN2JiNzk4MDlhNTA4MDQvZXh0ZW5zaW9ucy9ub2RlX21vZHVsZXMvdHlwZXNjcmlwdC9saWIvdHlwZXNNYXAuanNvbi0tdmFsaWRhdGVEZWZhdWx0TnBtTG9jYXRpb24nXG5cdH0sXG5cdHtcblx0XHRwaWQ6IDI3OTUsXG5cdFx0Y3dkOiAnL2hvbWUvYWxleC9yZXBvcy9NaWNyb3NvZnQvdnNjb2RlLWV4dGVuc2lvbi1zYW1wbGVzL2hlbGxvd29ybGQtc2FtcGxlJyxcblx0XHRjbWQ6ICcvaG9tZS9hbGV4Ly52c2NvZGUtc2VydmVyLWluc2lkZXJzL2Jpbi9iYzEzNzg1ZDNkZDk5YjRiMGU5ZGE5YWVkMTdiYjc5ODA5YTUwODA0L25vZGUvaG9tZS9hbGV4Ly52c2NvZGUtc2VydmVyLWluc2lkZXJzL2Jpbi9iYzEzNzg1ZDNkZDk5YjRiMGU5ZGE5YWVkMTdiYjc5ODA5YTUwODA0L2V4dGVuc2lvbnMvanNvbi1sYW5ndWFnZS1mZWF0dXJlcy9zZXJ2ZXIvZGlzdC9ub2RlL2pzb25TZXJ2ZXJNYWluLS1ub2RlLWlwYy0tY2xpZW50UHJvY2Vzc0lkPTI1MDQnXG5cdH0sXG5cdHtcblx0XHRwaWQ6IDI4Nixcblx0XHRjd2Q6ICcvbW50L2MvVXNlcnMvYWxyb3MvQXBwRGF0YS9Mb2NhbC9Qcm9ncmFtcy9NaWNyb3NvZnQgVlMgQ29kZSBJbnNpZGVycycsXG5cdFx0Y21kOiAnc2gtY1xcXCIkVlNDT0RFX1dTTF9FWFRfTE9DQVRJT04vIHNjcmlwdHMgLyB3c2xTZXJ2ZXIuc2hcXFwiIGJjMTM3ODVkM2RkOTliNGIwZTlkYTlhZWQxN2JiNzk4MDlhNTA4MDQgaW5zaWRlciAudnNjb2RlLXNlcnZlci1pbnNpZGVycyAwICAnXG5cdH0sXG5cdHtcblx0XHRwaWQ6IDI4Nyxcblx0XHRjd2Q6ICcvbW50L2MvVXNlcnMvYWxyb3MvQXBwRGF0YS9Mb2NhbC9Qcm9ncmFtcy9NaWNyb3NvZnQgVlMgQ29kZSBJbnNpZGVycycsXG5cdFx0Y21kOiAnc2gvbW50L2MvVXNlcnMvYWxyb3MvLnZzY29kZS1pbnNpZGVycy9leHRlbnNpb25zL21zLXZzY29kZS1yZW1vdGUucmVtb3RlLXdzbC0wLjUyLjAvc2NyaXB0cy93c2xTZXJ2ZXIuc2hiYzEzNzg1ZDNkZDk5YjRiMGU5ZGE5YWVkMTdiYjc5ODA5YTUwODA0aW5zaWRlci52c2NvZGUtc2VydmVyLWluc2lkZXJzMCdcblx0fSxcblx0e1xuXHRcdHBpZDogMzA1OCxcblx0XHRjd2Q6ICcvaG9tZS9hbGV4L3JlcG9zL01pY3Jvc29mdC92c2NvZGUtZXh0ZW5zaW9uLXNhbXBsZXMvaGVsbG93b3JsZC1zYW1wbGUnLFxuXHRcdGNtZDogJ25wbSdcblx0fSxcblx0e1xuXHRcdHBpZDogMzA3MCxcblx0XHRjd2Q6ICcvaG9tZS9hbGV4L3JlcG9zL01pY3Jvc29mdC92c2NvZGUtZXh0ZW5zaW9uLXNhbXBsZXMvaGVsbG93b3JsZC1zYW1wbGUnLFxuXHRcdGNtZDogJ3NoLWN0c2MgLXdhdGNoIC1wIC4vJ1xuXHR9LFxuXHR7XG5cdFx0cGlkOiAzMDcxLFxuXHRcdGN3ZDogJy9ob21lL2FsZXgvcmVwb3MvTWljcm9zb2Z0L3ZzY29kZS1leHRlbnNpb24tc2FtcGxlcy9oZWxsb3dvcmxkLXNhbXBsZScsXG5cdFx0Y21kOiAnbm9kZS9ob21lL2FsZXgvcmVwb3MvTWljcm9zb2Z0L3ZzY29kZS1leHRlbnNpb24tc2FtcGxlcy9oZWxsb3dvcmxkLXNhbXBsZS9ub2RlX21vZHVsZXMvLmJpbi90c2Mtd2F0Y2gtcC4vJ1xuXHR9LFxuXHR7XG5cdFx0cGlkOiAzMTIsXG5cdFx0Y3dkOiAnL21udC9jL1VzZXJzL2Fscm9zL0FwcERhdGEvTG9jYWwvUHJvZ3JhbXMvTWljcm9zb2Z0IFZTIENvZGUgSW5zaWRlcnMnLFxuXHRcdGNtZDogJ3NoL2hvbWUvYWxleC8udnNjb2RlLXNlcnZlci1pbnNpZGVycy9iaW4vYmMxMzc4NWQzZGQ5OWI0YjBlOWRhOWFlZDE3YmI3OTgwOWE1MDgwNC9zZXJ2ZXIuc2gtLXBvcnQ9MC0tdXNlLWhvc3QtcHJveHktLWVuYWJsZS1yZW1vdGUtYXV0by1zaHV0ZG93bi0tcHJpbnQtaXAtYWRkcmVzcydcblx0fSxcblx0e1xuXHRcdHBpZDogMzE0LFxuXHRcdGN3ZDogJy9tbnQvYy9Vc2Vycy9hbHJvcy9BcHBEYXRhL0xvY2FsL1Byb2dyYW1zL01pY3Jvc29mdCBWUyBDb2RlIEluc2lkZXJzJyxcblx0XHRjbWQ6ICcvaG9tZS9hbGV4Ly52c2NvZGUtc2VydmVyLWluc2lkZXJzL2Jpbi9iYzEzNzg1ZDNkZDk5YjRiMGU5ZGE5YWVkMTdiYjc5ODA5YTUwODA0L25vZGUvaG9tZS9hbGV4Ly52c2NvZGUtc2VydmVyLWluc2lkZXJzL2Jpbi9iYzEzNzg1ZDNkZDk5YjRiMGU5ZGE5YWVkMTdiYjc5ODA5YTUwODA0L291dC9zZXJ2ZXItbWFpbi5qcy0tcG9ydD0wLS11c2UtaG9zdC1wcm94eS0tZW5hYmxlLXJlbW90ZS1hdXRvLXNodXRkb3duLS1wcmludC1pcC1hZGRyZXNzJ1xuXHR9LFxuXHR7XG5cdFx0cGlkOiAzMTcyLFxuXHRcdGN3ZDogJy9ob21lL2FsZXgnLFxuXHRcdGNtZDogJy9iaW4vYmFzaCdcblx0fSxcblx0e1xuXHRcdHBpZDogMzYxMCxcblx0XHRjd2Q6ICcvaG9tZS9hbGV4L3JlcG9zL01pY3Jvc29mdC92c2NvZGUtZXh0ZW5zaW9uLXNhbXBsZXMvaGVsbG93b3JsZC1zYW1wbGUnLFxuXHRcdGNtZDogJy9iaW4vYmFzaCdcblx0fSxcblx0e1xuXHRcdHBpZDogNDQxMixcblx0XHRjd2Q6ICcvaG9tZS9hbGV4L3JlcG9zL01pY3Jvc29mdC92c2NvZGUtZXh0ZW5zaW9uLXNhbXBsZXMvaGVsbG93b3JsZC1zYW1wbGUnLFxuXHRcdGNtZDogJ2h0dHAtc2VydmVyJ1xuXHR9LFxuXHR7XG5cdFx0cGlkOiA0NDk2LFxuXHRcdGN3ZDogJy9tbnQvYy9Vc2Vycy9hbHJvcy9BcHBEYXRhL0xvY2FsL1Byb2dyYW1zL01pY3Jvc29mdCBWUyBDb2RlIEluc2lkZXJzJyxcblx0XHRjbWQ6ICcvaG9tZS9hbGV4Ly52c2NvZGUtc2VydmVyLWluc2lkZXJzL2Jpbi9iYzEzNzg1ZDNkZDk5YjRiMGU5ZGE5YWVkMTdiYjc5ODA5YTUwODA0L25vZGUtLWluc3BlY3QtYnJrPTAuMC4wLjA6Njg5OS9ob21lL2FsZXgvLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMvYmluL2JjMTM3ODVkM2RkOTliNGIwZTlkYTlhZWQxN2JiNzk4MDlhNTA4MDQvb3V0L2Jvb3RzdHJhcC1mb3JrLS10eXBlPWV4dGVuc2lvbkhvc3QtLXRyYW5zZm9ybVVSSXMtLXVzZUhvc3RQcm94eT0nXG5cdH0sXG5cdHtcblx0XHRwaWQ6IDQ1MDcsXG5cdFx0Y3dkOiAnL21udC9jL1VzZXJzL2Fscm9zL0FwcERhdGEvTG9jYWwvUHJvZ3JhbXMvTWljcm9zb2Z0IFZTIENvZGUgSW5zaWRlcnMnLFxuXHRcdGNtZDogJy9ob21lL2FsZXgvLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMvYmluL2JjMTM3ODVkM2RkOTliNGIwZTlkYTlhZWQxN2JiNzk4MDlhNTA4MDQvbm9kZS9ob21lL2FsZXgvLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMvYmluL2JjMTM3ODVkM2RkOTliNGIwZTlkYTlhZWQxN2JiNzk4MDlhNTA4MDQvZXh0ZW5zaW9ucy9tcy12c2NvZGUuanMtZGVidWcvc3JjL2hhc2guYnVuZGxlLmpzJ1xuXHR9XG5dO1xuXG5jb25zdCBwc1N0ZE91dCA9XG5cdGA0IFMgcm9vdCAgICAgICAgIDEgICAgIDAgIDAgIDgwICAgMCAtICAgNTk2IC0gICAgICAgMTQ0MCAgIDIgMTQ6NDEgPyAgICAgICAgMDA6MDA6MDAgL2Jpbi9zaCAtYyBlY2hvIENvbnRhaW5lciBzdGFydGVkIDsgdHJhcCBcImV4aXQgMFwiIDE1OyB3aGlsZSBzbGVlcCAxICYgd2FpdCAkITsgZG8gOjsgZG9uZVxuNCBTIHJvb3QgICAgICAgIDE0ICAgICAwICAwICA4MCAgIDAgLSAgIDU5NiAtICAgICAgICA3NjQgICA0IDE0OjQxID8gICAgICAgIDAwOjAwOjAwIC9iaW4vc2hcbjQgUyByb290ICAgICAgICA0MCAgICAgMCAgMCAgODAgICAwIC0gICA1OTYgLSAgICAgICAgNzAwICAgNCAxNDo0MSA/ICAgICAgICAwMDowMDowMCAvYmluL3NoXG40IFMgcm9vdCAgICAgICA1MTMgICAzODAgIDAgIDgwICAgMCAtICAyNDc2IC0gICAgICAgMzQwNCAgIDEgMTQ6NDEgcHRzLzEgICAgMDA6MDA6MDAgc3VkbyBucHggaHR0cC1zZXJ2ZXIgLXAgNTAwMFxuNCBTIHJvb3QgICAgICAgNTE0ICAgNTEzICAwICA4MCAgIDAgLSAxNjU0MzkgLSAgICAgNDEzODAgICA1IDE0OjQxIHB0cy8xICAgIDAwOjAwOjAwIGh0dHAtc2VydmVyXG4wIFMgcm9vdCAgICAgIDEwNTIgICAgIDEgIDAgIDgwICAgMCAtICAgNTczIC0gICAgICAgIDc1MiAgIDUgMTQ6NDMgPyAgICAgICAgMDA6MDA6MDAgc2xlZXAgMVxuMCBTIG5vZGUgICAgICAxMDU2ICAgMzI5ICAwICA4MCAgIDAgLSAgIDU5NiBkb193YWkgICA3NjQgIDEwIDE0OjQzID8gICAgICAgIDAwOjAwOjAwIC9iaW4vc2ggLWMgcHMgLUYgLUEgLWwgfCBncmVwIHJvb3RcbjAgUyBub2RlICAgICAgMTA1OCAgMTA1NiAgMCAgODAgICAwIC0gICA3NzAgcGlwZV93ICAgODg4ICAgOSAxNDo0MyA/ICAgICAgICAwMDowMDowMCBncmVwIHJvb3RgO1xuXG5zdWl0ZSgnRXh0SG9zdFR1bm5lbFNlcnZpY2UnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHR0ZXN0KCdnZXRTb2NrZXRzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGdldFNvY2tldHMocHJvY1NvY2tldHMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChPYmplY3Qua2V5cyhyZXN1bHQpLmxlbmd0aCwgNzUpO1xuXHRcdC8vIDQ0MTIgaXMgdGhlIHBpZCBvZiB0aGUgaHR0cC1zZXJ2ZXIgaW4gdGhlIHRlc3QgZGF0YVxuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChPYmplY3Qua2V5cyhyZXN1bHQpLmZpbmQoa2V5ID0+IHJlc3VsdFtrZXldLnBpZCA9PT0gNDQxMiksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xvYWRDb25uZWN0aW9uVGFibGUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbG9hZENvbm5lY3Rpb25UYWJsZSh0Y3ApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCA2KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdFswXSwge1xuXHRcdFx0MTA6ICcxJyxcblx0XHRcdDExOiAnMDAwMDAwMDAxMDE3MzMxMicsXG5cdFx0XHQxMjogJzEwMCcsXG5cdFx0XHQxMzogJzAnLFxuXHRcdFx0MTQ6ICcwJyxcblx0XHRcdDE1OiAnMTAnLFxuXHRcdFx0MTY6ICcwJyxcblx0XHRcdGlub2RlOiAnMjMzNTIxNCcsXG5cdFx0XHRsb2NhbF9hZGRyZXNzOiAnMDAwMDAwMDA6MEJCQScsXG5cdFx0XHRyZW1fYWRkcmVzczogJzAwMDAwMDAwOjAwMDAnLFxuXHRcdFx0cmV0cm5zbXQ6ICcwMDAwMDAwMCcsXG5cdFx0XHRzbDogJzA6Jyxcblx0XHRcdHN0OiAnMEEnLFxuXHRcdFx0dGltZW91dDogJzAnLFxuXHRcdFx0dHI6ICcwMDowMDAwMDAwMCcsXG5cdFx0XHR0eF9xdWV1ZTogJzAwMDAwMDAwOjAwMDAwMDAwJyxcblx0XHRcdHVpZDogJzEwMDAnXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xvYWRMaXN0ZW5pbmdQb3J0cycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXN1bHQgPSBsb2FkTGlzdGVuaW5nUG9ydHModGNwLCB0Y3A2KTtcblx0XHQvLyBUaGVyZSBzaG91bGQgYmUgNyBiYXNlZCBvbiB0aGUgaW5wdXQgZGF0YS4gT25lIG9mIHRoZW0gc2hvdWxkIGJlIDMwMDIuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDcpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChyZXN1bHQuZmluZCh2YWx1ZSA9PiB2YWx1ZS5wb3J0ID09PSAzMDAyKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgndHJ5RmluZFJvb3RQb3J0cycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByb290UHJvY2Vzc2VzID0gZ2V0Um9vdFByb2Nlc3Nlcyhwc1N0ZE91dCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvb3RQcm9jZXNzZXMubGVuZ3RoLCA2KTtcblx0XHRjb25zdCByZXN1bHQgPSB0cnlGaW5kUm9vdFBvcnRzKFt7IHNvY2tldDogMTAwMCwgaXA6ICcxMjcuMC4wLjEnLCBwb3J0OiA1MDAwIH1dLCBwc1N0ZE91dCwgbmV3IE1hcCgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnNpemUsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0KDUwMDApPy5waWQsIDUxNCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbmRQb3J0cycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmaW5kUG9ydHMobG9hZExpc3RlbmluZ1BvcnRzKHRjcCwgdGNwNiksIGdldFNvY2tldHMocHJvY1NvY2tldHMpLCBwcm9jZXNzZXMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLmhvc3QsICcwLjAuMC4wJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5wb3J0LCAzMDAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLmRldGFpbCwgJ2h0dHAtc2VydmVyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlSXBBZGRyZXNzJywgZnVuY3Rpb24gKCkge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZUlwQWRkcmVzcygnMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDEwMDAwMDAnKSwgJzA6MDowOjA6MDowOjA6MScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZUlwQWRkcmVzcygnMDAwMDAwMDAwMDAwMDAwMEZGRkYwMDAwMDQwNTEwQUMnKSwgJzA6MDowOjA6MDpmZmZmOmFjMTA6NTA0Jyk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxXQUFXLGtCQUFrQixZQUFZLHFCQUFxQixvQkFBb0IsZ0JBQWdCLHdCQUF3QjtBQUNuSSxTQUFTLCtDQUErQztBQUV4RCxNQUFNLE1BQ0w7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQVFELE1BQU0sT0FDTDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQWNELE1BQU0sY0FDTDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBaUZELE1BQU0sWUFBeUQ7QUFBQSxFQUM5RDtBQUFBLElBQ0MsS0FBSztBQUFBLElBQ0wsS0FBSztBQUFBLElBQ0wsS0FBSztBQUFBLEVBQ047QUFBQSxFQUNBO0FBQUEsSUFDQyxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsRUFDTjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxFQUNOO0FBQUEsRUFDQTtBQUFBLElBQ0MsS0FBSztBQUFBLElBQ0wsS0FBSztBQUFBLElBQ0wsS0FBSztBQUFBLEVBQ047QUFBQSxFQUFHO0FBQUEsSUFDRixLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsRUFDTjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxFQUNOO0FBQUEsRUFDQTtBQUFBLElBQ0MsS0FBSztBQUFBLElBQ0wsS0FBSztBQUFBLElBQ0wsS0FBSztBQUFBLEVBQ047QUFBQSxFQUNBO0FBQUEsSUFDQyxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsRUFDTjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxFQUNOO0FBQUEsRUFDQTtBQUFBLElBQ0MsS0FBSztBQUFBLElBQ0wsS0FBSztBQUFBLElBQ0wsS0FBSztBQUFBLEVBQ047QUFBQSxFQUNBO0FBQUEsSUFDQyxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsRUFDTjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxFQUNOO0FBQUEsRUFDQTtBQUFBLElBQ0MsS0FBSztBQUFBLElBQ0wsS0FBSztBQUFBLElBQ0wsS0FBSztBQUFBLEVBQ047QUFBQSxFQUNBO0FBQUEsSUFDQyxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsRUFDTjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxFQUNOO0FBQUEsRUFDQTtBQUFBLElBQ0MsS0FBSztBQUFBLElBQ0wsS0FBSztBQUFBLElBQ0wsS0FBSztBQUFBLEVBQ047QUFBQSxFQUNBO0FBQUEsSUFDQyxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsRUFDTjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxFQUNOO0FBQUEsRUFDQTtBQUFBLElBQ0MsS0FBSztBQUFBLElBQ0wsS0FBSztBQUFBLElBQ0wsS0FBSztBQUFBLEVBQ047QUFBQSxFQUNBO0FBQUEsSUFDQyxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsRUFDTjtBQUNEO0FBRUEsTUFBTSxXQUNMO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFTRCxNQUFNLHdCQUF3QixNQUFNO0FBQ25DLDBDQUF3QztBQUN4QyxPQUFLLGNBQWMsV0FBWTtBQUM5QixVQUFNLFNBQVMsV0FBVyxXQUFXO0FBQ3JDLFdBQU8sWUFBWSxPQUFPLEtBQUssTUFBTSxFQUFFLFFBQVEsRUFBRTtBQUVqRCxXQUFPLGVBQWUsT0FBTyxLQUFLLE1BQU0sRUFBRSxLQUFLLFNBQU8sT0FBTyxHQUFHLEVBQUUsUUFBUSxJQUFJLEdBQUcsTUFBUztBQUFBLEVBQzNGLENBQUM7QUFFRCxPQUFLLHVCQUF1QixXQUFZO0FBQ3ZDLFVBQU0sU0FBUyxvQkFBb0IsR0FBRztBQUN0QyxXQUFPLFlBQVksT0FBTyxRQUFRLENBQUM7QUFDbkMsV0FBTyxnQkFBZ0IsT0FBTyxDQUFDLEdBQUc7QUFBQSxNQUNqQyxJQUFJO0FBQUEsTUFDSixJQUFJO0FBQUEsTUFDSixJQUFJO0FBQUEsTUFDSixJQUFJO0FBQUEsTUFDSixJQUFJO0FBQUEsTUFDSixJQUFJO0FBQUEsTUFDSixJQUFJO0FBQUEsTUFDSixPQUFPO0FBQUEsTUFDUCxlQUFlO0FBQUEsTUFDZixhQUFhO0FBQUEsTUFDYixVQUFVO0FBQUEsTUFDVixJQUFJO0FBQUEsTUFDSixJQUFJO0FBQUEsTUFDSixTQUFTO0FBQUEsTUFDVCxJQUFJO0FBQUEsTUFDSixVQUFVO0FBQUEsTUFDVixLQUFLO0FBQUEsSUFDTixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxzQkFBc0IsV0FBWTtBQUN0QyxVQUFNLFNBQVMsbUJBQW1CLEtBQUssSUFBSTtBQUUzQyxXQUFPLFlBQVksT0FBTyxRQUFRLENBQUM7QUFDbkMsV0FBTyxlQUFlLE9BQU8sS0FBSyxXQUFTLE1BQU0sU0FBUyxJQUFJLEdBQUcsTUFBUztBQUFBLEVBQzNFLENBQUM7QUFFRCxPQUFLLG9CQUFvQixXQUFZO0FBQ3BDLFVBQU0sZ0JBQWdCLGlCQUFpQixRQUFRO0FBQy9DLFdBQU8sWUFBWSxjQUFjLFFBQVEsQ0FBQztBQUMxQyxVQUFNLFNBQVMsaUJBQWlCLENBQUMsRUFBRSxRQUFRLEtBQU0sSUFBSSxhQUFhLE1BQU0sSUFBSyxDQUFDLEdBQUcsVUFBVSxvQkFBSSxJQUFJLENBQUM7QUFDcEcsV0FBTyxZQUFZLE9BQU8sTUFBTSxDQUFDO0FBQ2pDLFdBQU8sWUFBWSxPQUFPLElBQUksR0FBSSxHQUFHLEtBQUssR0FBRztBQUFBLEVBQzlDLENBQUM7QUFFRCxPQUFLLGFBQWEsaUJBQWtCO0FBQ25DLFVBQU0sU0FBUyxNQUFNLFVBQVUsbUJBQW1CLEtBQUssSUFBSSxHQUFHLFdBQVcsV0FBVyxHQUFHLFNBQVM7QUFDaEcsV0FBTyxZQUFZLE9BQU8sUUFBUSxDQUFDO0FBQ25DLFdBQU8sWUFBWSxPQUFPLENBQUMsRUFBRSxNQUFNLFNBQVM7QUFDNUMsV0FBTyxZQUFZLE9BQU8sQ0FBQyxFQUFFLE1BQU0sSUFBSTtBQUN2QyxXQUFPLFlBQVksT0FBTyxDQUFDLEVBQUUsUUFBUSxhQUFhO0FBQUEsRUFDbkQsQ0FBQztBQUVELE9BQUssa0JBQWtCLFdBQVk7QUFDbEMsV0FBTyxZQUFZLGVBQWUsa0NBQWtDLEdBQUcsaUJBQWlCO0FBQ3hGLFdBQU8sWUFBWSxlQUFlLGtDQUFrQyxHQUFHLHlCQUF5QjtBQUFBLEVBQ2pHLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
