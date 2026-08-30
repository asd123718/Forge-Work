/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createConnection } from 'vscode-languageserver/node';
import { formatError } from '../utils/runner.js';
import { startServer } from '../htmlServer.js';
import { getNodeFileFS } from './nodeFs.js';
// Create a connection for the server.
const connection = createConnection();
console.log = connection.console.log.bind(connection.console);
console.error = connection.console.error.bind(connection.console);
process.on('unhandledRejection', (e) => {
    connection.console.error(formatError(`Unhandled exception`, e));
});
const runtime = {
    timer: {
        setImmediate(callback, ...args) {
            const handle = setImmediate(callback, ...args);
            return { dispose: () => clearImmediate(handle) };
        },
        setTimeout(callback, ms, ...args) {
            const handle = setTimeout(callback, ms, ...args);
            return { dispose: () => clearTimeout(handle) };
        }
    },
    fileFs: getNodeFileFS()
};
startServer(connection, runtime);
//# sourceMappingURL=htmlServerMain.js.map