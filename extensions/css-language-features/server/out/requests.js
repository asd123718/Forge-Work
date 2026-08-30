/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { RequestType } from 'vscode-languageserver';
export var FsContentRequest;
(function (FsContentRequest) {
    FsContentRequest.type = new RequestType('fs/content');
})(FsContentRequest || (FsContentRequest = {}));
export var FsStatRequest;
(function (FsStatRequest) {
    FsStatRequest.type = new RequestType('fs/stat');
})(FsStatRequest || (FsStatRequest = {}));
export var FsReadDirRequest;
(function (FsReadDirRequest) {
    FsReadDirRequest.type = new RequestType('fs/readDir');
})(FsReadDirRequest || (FsReadDirRequest = {}));
export var FileType;
(function (FileType) {
    /**
     * The file type is unknown.
     */
    FileType[FileType["Unknown"] = 0] = "Unknown";
    /**
     * A regular file.
     */
    FileType[FileType["File"] = 1] = "File";
    /**
     * A directory.
     */
    FileType[FileType["Directory"] = 2] = "Directory";
    /**
     * A symbolic link to a file.
     */
    FileType[FileType["SymbolicLink"] = 64] = "SymbolicLink";
})(FileType || (FileType = {}));
export function getRequestService(handledSchemas, connection, runtime) {
    const builtInHandlers = {};
    for (const protocol of handledSchemas) {
        if (protocol === 'file') {
            builtInHandlers[protocol] = runtime.file;
        }
        else if (protocol === 'http' || protocol === 'https') {
            builtInHandlers[protocol] = runtime.http;
        }
    }
    return {
        async stat(uri) {
            const handler = builtInHandlers[getScheme(uri)];
            if (handler) {
                return handler.stat(uri);
            }
            const res = await connection.sendRequest(FsStatRequest.type, uri.toString());
            return res;
        },
        readDirectory(uri) {
            const handler = builtInHandlers[getScheme(uri)];
            if (handler) {
                return handler.readDirectory(uri);
            }
            return connection.sendRequest(FsReadDirRequest.type, uri.toString());
        },
        getContent(uri, encoding) {
            const handler = builtInHandlers[getScheme(uri)];
            if (handler) {
                return handler.getContent(uri, encoding);
            }
            return connection.sendRequest(FsContentRequest.type, { uri: uri.toString(), encoding });
        }
    };
}
function getScheme(uri) {
    return uri.substr(0, uri.indexOf(':'));
}
//# sourceMappingURL=requests.js.map