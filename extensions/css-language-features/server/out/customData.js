/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { newCSSDataProvider } from 'vscode-css-languageservice';
export function fetchDataProviders(dataPaths, requestService) {
    const providers = dataPaths.map(async (p) => {
        try {
            const content = await requestService.getContent(p);
            return parseCSSData(content);
        }
        catch (e) {
            return newCSSDataProvider({ version: 1 });
        }
    });
    return Promise.all(providers);
}
function parseCSSData(source) {
    let rawData;
    try {
        rawData = JSON.parse(source);
    }
    catch (err) {
        return newCSSDataProvider({ version: 1 });
    }
    return newCSSDataProvider({
        version: rawData.version || 1,
        properties: rawData.properties || [],
        atDirectives: rawData.atDirectives || [],
        pseudoClasses: rawData.pseudoClasses || [],
        pseudoElements: rawData.pseudoElements || []
    });
}
//# sourceMappingURL=customData.js.map