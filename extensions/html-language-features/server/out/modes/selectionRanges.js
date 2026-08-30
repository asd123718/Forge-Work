/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Range, SelectionRange } from './languageModes.js';
import { insideRangeButNotSame } from '../utils/positions.js';
export async function getSelectionRanges(languageModes, document, positions) {
    const htmlMode = languageModes.getMode('html');
    return Promise.all(positions.map(async (position) => {
        const htmlRange = await htmlMode.getSelectionRange(document, position);
        const mode = languageModes.getModeAtPosition(document, position);
        if (mode && mode.getSelectionRange) {
            const range = await mode.getSelectionRange(document, position);
            let top = range;
            while (top.parent && insideRangeButNotSame(htmlRange.range, top.parent.range)) {
                top = top.parent;
            }
            top.parent = htmlRange;
            return range;
        }
        return htmlRange || SelectionRange.create(Range.create(position, position));
    }));
}
//# sourceMappingURL=selectionRanges.js.map