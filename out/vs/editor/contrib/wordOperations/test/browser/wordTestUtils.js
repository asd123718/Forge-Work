import { Position } from "../../../../common/core/position.js";
import { withTestCodeEditor } from "../../../../test/browser/testCodeEditor.js";
function deserializePipePositions(text) {
  let resultText = "";
  let lineNumber = 1;
  let charIndex = 0;
  const positions = [];
  for (let i = 0, len = text.length; i < len; i++) {
    const chr = text.charAt(i);
    if (chr === "\n") {
      resultText += chr;
      lineNumber++;
      charIndex = 0;
      continue;
    }
    if (chr === "|") {
      positions.push(new Position(lineNumber, charIndex + 1));
    } else {
      resultText += chr;
      charIndex++;
    }
  }
  return [resultText, positions];
}
function serializePipePositions(text, positions) {
  positions.sort(Position.compare);
  let resultText = "";
  let lineNumber = 1;
  let charIndex = 0;
  for (let i = 0, len = text.length; i < len; i++) {
    const chr = text.charAt(i);
    if (positions.length > 0 && positions[0].lineNumber === lineNumber && positions[0].column === charIndex + 1) {
      resultText += "|";
      positions.shift();
    }
    resultText += chr;
    if (chr === "\n") {
      lineNumber++;
      charIndex = 0;
    } else {
      charIndex++;
    }
  }
  if (positions.length > 0 && positions[0].lineNumber === lineNumber && positions[0].column === charIndex + 1) {
    resultText += "|";
    positions.shift();
  }
  if (positions.length > 0) {
    throw new Error(`Unexpected left over positions!!!`);
  }
  return resultText;
}
function testRepeatedActionAndExtractPositions(text, initialPosition, action, record, stopCondition, options = {}) {
  const actualStops = [];
  withTestCodeEditor(text, options, (editor) => {
    editor.setPosition(initialPosition);
    while (true) {
      action(editor);
      actualStops.push(record(editor));
      if (stopCondition(editor)) {
        break;
      }
      if (actualStops.length > 1e3) {
        throw new Error(`Endless loop detected involving position ${editor.getPosition()}!`);
      }
    }
  });
  return actualStops;
}
export {
  deserializePipePositions,
  serializePipePositions,
  testRepeatedActionAndExtractPositions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHdvcmRPcGVyYXRpb25zXFx0ZXN0XFxicm93c2VyXFx3b3JkVGVzdFV0aWxzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGVzdENvZGVFZGl0b3IsIFRlc3RDb2RlRWRpdG9ySW5zdGFudGlhdGlvbk9wdGlvbnMsIHdpdGhUZXN0Q29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci90ZXN0Q29kZUVkaXRvci5qcyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBkZXNlcmlhbGl6ZVBpcGVQb3NpdGlvbnModGV4dDogc3RyaW5nKTogW3N0cmluZywgUG9zaXRpb25bXV0ge1xuXHRsZXQgcmVzdWx0VGV4dCA9ICcnO1xuXHRsZXQgbGluZU51bWJlciA9IDE7XG5cdGxldCBjaGFySW5kZXggPSAwO1xuXHRjb25zdCBwb3NpdGlvbnM6IFBvc2l0aW9uW10gPSBbXTtcblx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHRleHQubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRjb25zdCBjaHIgPSB0ZXh0LmNoYXJBdChpKTtcblx0XHRpZiAoY2hyID09PSAnXFxuJykge1xuXHRcdFx0cmVzdWx0VGV4dCArPSBjaHI7XG5cdFx0XHRsaW5lTnVtYmVyKys7XG5cdFx0XHRjaGFySW5kZXggPSAwO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGlmIChjaHIgPT09ICd8Jykge1xuXHRcdFx0cG9zaXRpb25zLnB1c2gobmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIGNoYXJJbmRleCArIDEpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzdWx0VGV4dCArPSBjaHI7XG5cdFx0XHRjaGFySW5kZXgrKztcblx0XHR9XG5cdH1cblx0cmV0dXJuIFtyZXN1bHRUZXh0LCBwb3NpdGlvbnNdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2VyaWFsaXplUGlwZVBvc2l0aW9ucyh0ZXh0OiBzdHJpbmcsIHBvc2l0aW9uczogUG9zaXRpb25bXSk6IHN0cmluZyB7XG5cdHBvc2l0aW9ucy5zb3J0KFBvc2l0aW9uLmNvbXBhcmUpO1xuXHRsZXQgcmVzdWx0VGV4dCA9ICcnO1xuXHRsZXQgbGluZU51bWJlciA9IDE7XG5cdGxldCBjaGFySW5kZXggPSAwO1xuXHRmb3IgKGxldCBpID0gMCwgbGVuID0gdGV4dC5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdGNvbnN0IGNociA9IHRleHQuY2hhckF0KGkpO1xuXHRcdGlmIChwb3NpdGlvbnMubGVuZ3RoID4gMCAmJiBwb3NpdGlvbnNbMF0ubGluZU51bWJlciA9PT0gbGluZU51bWJlciAmJiBwb3NpdGlvbnNbMF0uY29sdW1uID09PSBjaGFySW5kZXggKyAxKSB7XG5cdFx0XHRyZXN1bHRUZXh0ICs9ICd8Jztcblx0XHRcdHBvc2l0aW9ucy5zaGlmdCgpO1xuXHRcdH1cblx0XHRyZXN1bHRUZXh0ICs9IGNocjtcblx0XHRpZiAoY2hyID09PSAnXFxuJykge1xuXHRcdFx0bGluZU51bWJlcisrO1xuXHRcdFx0Y2hhckluZGV4ID0gMDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y2hhckluZGV4Kys7XG5cdFx0fVxuXHR9XG5cdGlmIChwb3NpdGlvbnMubGVuZ3RoID4gMCAmJiBwb3NpdGlvbnNbMF0ubGluZU51bWJlciA9PT0gbGluZU51bWJlciAmJiBwb3NpdGlvbnNbMF0uY29sdW1uID09PSBjaGFySW5kZXggKyAxKSB7XG5cdFx0cmVzdWx0VGV4dCArPSAnfCc7XG5cdFx0cG9zaXRpb25zLnNoaWZ0KCk7XG5cdH1cblx0aWYgKHBvc2l0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBVbmV4cGVjdGVkIGxlZnQgb3ZlciBwb3NpdGlvbnMhISFgKTtcblx0fVxuXHRyZXR1cm4gcmVzdWx0VGV4dDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRlc3RSZXBlYXRlZEFjdGlvbkFuZEV4dHJhY3RQb3NpdGlvbnModGV4dDogc3RyaW5nLCBpbml0aWFsUG9zaXRpb246IFBvc2l0aW9uLCBhY3Rpb246IChlZGl0b3I6IElUZXN0Q29kZUVkaXRvcikgPT4gdm9pZCwgcmVjb3JkOiAoZWRpdG9yOiBJVGVzdENvZGVFZGl0b3IpID0+IFBvc2l0aW9uLCBzdG9wQ29uZGl0aW9uOiAoZWRpdG9yOiBJVGVzdENvZGVFZGl0b3IpID0+IGJvb2xlYW4sIG9wdGlvbnM6IFRlc3RDb2RlRWRpdG9ySW5zdGFudGlhdGlvbk9wdGlvbnMgPSB7fSk6IFBvc2l0aW9uW10ge1xuXHRjb25zdCBhY3R1YWxTdG9wczogUG9zaXRpb25bXSA9IFtdO1xuXHR3aXRoVGVzdENvZGVFZGl0b3IodGV4dCwgb3B0aW9ucywgKGVkaXRvcikgPT4ge1xuXHRcdGVkaXRvci5zZXRQb3NpdGlvbihpbml0aWFsUG9zaXRpb24pO1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRhY3Rpb24oZWRpdG9yKTtcblx0XHRcdGFjdHVhbFN0b3BzLnB1c2gocmVjb3JkKGVkaXRvcikpO1xuXHRcdFx0aWYgKHN0b3BDb25kaXRpb24oZWRpdG9yKSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0aWYgKGFjdHVhbFN0b3BzLmxlbmd0aCA+IDEwMDApIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBFbmRsZXNzIGxvb3AgZGV0ZWN0ZWQgaW52b2x2aW5nIHBvc2l0aW9uICR7ZWRpdG9yLmdldFBvc2l0aW9uKCl9IWApO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cdHJldHVybiBhY3R1YWxTdG9wcztcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQThELDBCQUEwQjtBQUVqRixTQUFTLHlCQUF5QixNQUFvQztBQUM1RSxNQUFJLGFBQWE7QUFDakIsTUFBSSxhQUFhO0FBQ2pCLE1BQUksWUFBWTtBQUNoQixRQUFNLFlBQXdCLENBQUM7QUFDL0IsV0FBUyxJQUFJLEdBQUcsTUFBTSxLQUFLLFFBQVEsSUFBSSxLQUFLLEtBQUs7QUFDaEQsVUFBTSxNQUFNLEtBQUssT0FBTyxDQUFDO0FBQ3pCLFFBQUksUUFBUSxNQUFNO0FBQ2pCLG9CQUFjO0FBQ2Q7QUFDQSxrQkFBWTtBQUNaO0FBQUEsSUFDRDtBQUNBLFFBQUksUUFBUSxLQUFLO0FBQ2hCLGdCQUFVLEtBQUssSUFBSSxTQUFTLFlBQVksWUFBWSxDQUFDLENBQUM7QUFBQSxJQUN2RCxPQUFPO0FBQ04sb0JBQWM7QUFDZDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0EsU0FBTyxDQUFDLFlBQVksU0FBUztBQUM5QjtBQUVPLFNBQVMsdUJBQXVCLE1BQWMsV0FBK0I7QUFDbkYsWUFBVSxLQUFLLFNBQVMsT0FBTztBQUMvQixNQUFJLGFBQWE7QUFDakIsTUFBSSxhQUFhO0FBQ2pCLE1BQUksWUFBWTtBQUNoQixXQUFTLElBQUksR0FBRyxNQUFNLEtBQUssUUFBUSxJQUFJLEtBQUssS0FBSztBQUNoRCxVQUFNLE1BQU0sS0FBSyxPQUFPLENBQUM7QUFDekIsUUFBSSxVQUFVLFNBQVMsS0FBSyxVQUFVLENBQUMsRUFBRSxlQUFlLGNBQWMsVUFBVSxDQUFDLEVBQUUsV0FBVyxZQUFZLEdBQUc7QUFDNUcsb0JBQWM7QUFDZCxnQkFBVSxNQUFNO0FBQUEsSUFDakI7QUFDQSxrQkFBYztBQUNkLFFBQUksUUFBUSxNQUFNO0FBQ2pCO0FBQ0Esa0JBQVk7QUFBQSxJQUNiLE9BQU87QUFDTjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0EsTUFBSSxVQUFVLFNBQVMsS0FBSyxVQUFVLENBQUMsRUFBRSxlQUFlLGNBQWMsVUFBVSxDQUFDLEVBQUUsV0FBVyxZQUFZLEdBQUc7QUFDNUcsa0JBQWM7QUFDZCxjQUFVLE1BQU07QUFBQSxFQUNqQjtBQUNBLE1BQUksVUFBVSxTQUFTLEdBQUc7QUFDekIsVUFBTSxJQUFJLE1BQU0sbUNBQW1DO0FBQUEsRUFDcEQ7QUFDQSxTQUFPO0FBQ1I7QUFFTyxTQUFTLHNDQUFzQyxNQUFjLGlCQUEyQixRQUEyQyxRQUErQyxlQUFxRCxVQUE4QyxDQUFDLEdBQWU7QUFDM1MsUUFBTSxjQUEwQixDQUFDO0FBQ2pDLHFCQUFtQixNQUFNLFNBQVMsQ0FBQyxXQUFXO0FBQzdDLFdBQU8sWUFBWSxlQUFlO0FBQ2xDLFdBQU8sTUFBTTtBQUNaLGFBQU8sTUFBTTtBQUNiLGtCQUFZLEtBQUssT0FBTyxNQUFNLENBQUM7QUFDL0IsVUFBSSxjQUFjLE1BQU0sR0FBRztBQUMxQjtBQUFBLE1BQ0Q7QUFFQSxVQUFJLFlBQVksU0FBUyxLQUFNO0FBQzlCLGNBQU0sSUFBSSxNQUFNLDRDQUE0QyxPQUFPLFlBQVksQ0FBQyxHQUFHO0FBQUEsTUFDcEY7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBQ0QsU0FBTztBQUNSOyIsCiAgIm5hbWVzIjogW10KfQo=
