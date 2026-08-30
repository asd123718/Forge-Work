/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { RequestType } from 'vscode-languageserver';
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
export function getFileSystemProvider(handledSchemas, connection, runtime) {
    const fileFs = runtime.fileFs && handledSchemas.indexOf('file') !== -1 ? runtime.fileFs : undefined;
    return {
        async stat(uri) {
            if (fileFs && uri.startsWith('file:')) {
                return fileFs.stat(uri);
            }
            const res = await connection.sendRequest(FsStatRequest.type, uri.toString());
            return res;
        },
        readDirectory(uri) {
            if (fileFs && uri.startsWith('file:')) {
                return fileFs.readDirectory(uri);
            }
            return connection.sendRequest(FsReadDirRequest.type, uri.toString());
        }
    };
}
//# sourceMappingURL=requests.js.map