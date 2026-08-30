class DirectedGraph {
  constructor() {
    this._nodes = /* @__PURE__ */ new Set();
    this._outgoingEdges = /* @__PURE__ */ new Map();
  }
  static from(nodes, getOutgoing) {
    const graph = new DirectedGraph();
    for (const node of nodes) {
      graph._nodes.add(node);
    }
    for (const node of nodes) {
      const outgoing = getOutgoing(node);
      if (outgoing.length > 0) {
        const outgoingSet = /* @__PURE__ */ new Set();
        for (const target of outgoing) {
          outgoingSet.add(target);
        }
        graph._outgoingEdges.set(node, outgoingSet);
      }
    }
    return graph;
  }
  /**
   * After this, the graph is guaranteed to have no cycles.
   */
  removeCycles() {
    const foundCycles = [];
    const visited = /* @__PURE__ */ new Set();
    const recursionStack = /* @__PURE__ */ new Set();
    const toRemove = [];
    const dfs = (node) => {
      visited.add(node);
      recursionStack.add(node);
      const outgoing = this._outgoingEdges.get(node);
      if (outgoing) {
        for (const neighbor of outgoing) {
          if (!visited.has(neighbor)) {
            dfs(neighbor);
          } else if (recursionStack.has(neighbor)) {
            foundCycles.push(neighbor);
            toRemove.push({ from: node, to: neighbor });
          }
        }
      }
      recursionStack.delete(node);
    };
    for (const node of this._nodes) {
      if (!visited.has(node)) {
        dfs(node);
      }
    }
    for (const { from, to } of toRemove) {
      const outgoingSet = this._outgoingEdges.get(from);
      if (outgoingSet) {
        outgoingSet.delete(to);
      }
    }
    return { foundCycles };
  }
  getOutgoing(node) {
    const outgoing = this._outgoingEdges.get(node);
    return outgoing ? Array.from(outgoing) : [];
  }
}
export {
  DirectedGraph
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFxicm93c2VyXFxtb2RlbFxcZ3JhcGgudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5leHBvcnQgY2xhc3MgRGlyZWN0ZWRHcmFwaDxUPiB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX25vZGVzID0gbmV3IFNldDxUPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vdXRnb2luZ0VkZ2VzID0gbmV3IE1hcDxULCBTZXQ8VD4+KCk7XG5cblx0cHVibGljIHN0YXRpYyBmcm9tPFQ+KG5vZGVzOiByZWFkb25seSBUW10sIGdldE91dGdvaW5nOiAobm9kZTogVCkgPT4gcmVhZG9ubHkgVFtdKTogRGlyZWN0ZWRHcmFwaDxUPiB7XG5cdFx0Y29uc3QgZ3JhcGggPSBuZXcgRGlyZWN0ZWRHcmFwaDxUPigpO1xuXG5cdFx0Zm9yIChjb25zdCBub2RlIG9mIG5vZGVzKSB7XG5cdFx0XHRncmFwaC5fbm9kZXMuYWRkKG5vZGUpO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3Qgbm9kZSBvZiBub2Rlcykge1xuXHRcdFx0Y29uc3Qgb3V0Z29pbmcgPSBnZXRPdXRnb2luZyhub2RlKTtcblx0XHRcdGlmIChvdXRnb2luZy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IG91dGdvaW5nU2V0ID0gbmV3IFNldDxUPigpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHRhcmdldCBvZiBvdXRnb2luZykge1xuXHRcdFx0XHRcdG91dGdvaW5nU2V0LmFkZCh0YXJnZXQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGdyYXBoLl9vdXRnb2luZ0VkZ2VzLnNldChub2RlLCBvdXRnb2luZ1NldCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGdyYXBoO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFmdGVyIHRoaXMsIHRoZSBncmFwaCBpcyBndWFyYW50ZWVkIHRvIGhhdmUgbm8gY3ljbGVzLlxuXHQgKi9cblx0cmVtb3ZlQ3ljbGVzKCk6IHsgZm91bmRDeWNsZXM6IFRbXSB9IHtcblx0XHRjb25zdCBmb3VuZEN5Y2xlczogVFtdID0gW107XG5cdFx0Y29uc3QgdmlzaXRlZCA9IG5ldyBTZXQ8VD4oKTtcblx0XHRjb25zdCByZWN1cnNpb25TdGFjayA9IG5ldyBTZXQ8VD4oKTtcblx0XHRjb25zdCB0b1JlbW92ZTogQXJyYXk8eyBmcm9tOiBUOyB0bzogVCB9PiA9IFtdO1xuXG5cdFx0Y29uc3QgZGZzID0gKG5vZGU6IFQpOiB2b2lkID0+IHtcblx0XHRcdHZpc2l0ZWQuYWRkKG5vZGUpO1xuXHRcdFx0cmVjdXJzaW9uU3RhY2suYWRkKG5vZGUpO1xuXG5cdFx0XHRjb25zdCBvdXRnb2luZyA9IHRoaXMuX291dGdvaW5nRWRnZXMuZ2V0KG5vZGUpO1xuXHRcdFx0aWYgKG91dGdvaW5nKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgbmVpZ2hib3Igb2Ygb3V0Z29pbmcpIHtcblx0XHRcdFx0XHRpZiAoIXZpc2l0ZWQuaGFzKG5laWdoYm9yKSkge1xuXHRcdFx0XHRcdFx0ZGZzKG5laWdoYm9yKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHJlY3Vyc2lvblN0YWNrLmhhcyhuZWlnaGJvcikpIHtcblx0XHRcdFx0XHRcdC8vIEZvdW5kIGEgY3ljbGVcblx0XHRcdFx0XHRcdGZvdW5kQ3ljbGVzLnB1c2gobmVpZ2hib3IpO1xuXHRcdFx0XHRcdFx0dG9SZW1vdmUucHVzaCh7IGZyb206IG5vZGUsIHRvOiBuZWlnaGJvciB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmVjdXJzaW9uU3RhY2suZGVsZXRlKG5vZGUpO1xuXHRcdH07XG5cblx0XHQvLyBSdW4gREZTIGZyb20gYWxsIHVudmlzaXRlZCBub2Rlc1xuXHRcdGZvciAoY29uc3Qgbm9kZSBvZiB0aGlzLl9ub2Rlcykge1xuXHRcdFx0aWYgKCF2aXNpdGVkLmhhcyhub2RlKSkge1xuXHRcdFx0XHRkZnMobm9kZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gUmVtb3ZlIGVkZ2VzIHRoYXQgY2F1c2UgY3ljbGVzXG5cdFx0Zm9yIChjb25zdCB7IGZyb20sIHRvIH0gb2YgdG9SZW1vdmUpIHtcblx0XHRcdGNvbnN0IG91dGdvaW5nU2V0ID0gdGhpcy5fb3V0Z29pbmdFZGdlcy5nZXQoZnJvbSk7XG5cdFx0XHRpZiAob3V0Z29pbmdTZXQpIHtcblx0XHRcdFx0b3V0Z29pbmdTZXQuZGVsZXRlKHRvKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4geyBmb3VuZEN5Y2xlcyB9O1xuXHR9XG5cblx0Z2V0T3V0Z29pbmcobm9kZTogVCk6IHJlYWRvbmx5IFRbXSB7XG5cdFx0Y29uc3Qgb3V0Z29pbmcgPSB0aGlzLl9vdXRnb2luZ0VkZ2VzLmdldChub2RlKTtcblx0XHRyZXR1cm4gb3V0Z29pbmcgPyBBcnJheS5mcm9tKG91dGdvaW5nKSA6IFtdO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLTyxNQUFNLGNBQWlCO0FBQUEsRUFBdkI7QUFDTixTQUFpQixTQUFTLG9CQUFJLElBQU87QUFDckMsU0FBaUIsaUJBQWlCLG9CQUFJLElBQWU7QUFBQTtBQUFBLEVBRXJELE9BQWMsS0FBUSxPQUFxQixhQUEwRDtBQUNwRyxVQUFNLFFBQVEsSUFBSSxjQUFpQjtBQUVuQyxlQUFXLFFBQVEsT0FBTztBQUN6QixZQUFNLE9BQU8sSUFBSSxJQUFJO0FBQUEsSUFDdEI7QUFFQSxlQUFXLFFBQVEsT0FBTztBQUN6QixZQUFNLFdBQVcsWUFBWSxJQUFJO0FBQ2pDLFVBQUksU0FBUyxTQUFTLEdBQUc7QUFDeEIsY0FBTSxjQUFjLG9CQUFJLElBQU87QUFDL0IsbUJBQVcsVUFBVSxVQUFVO0FBQzlCLHNCQUFZLElBQUksTUFBTTtBQUFBLFFBQ3ZCO0FBQ0EsY0FBTSxlQUFlLElBQUksTUFBTSxXQUFXO0FBQUEsTUFDM0M7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLGVBQXFDO0FBQ3BDLFVBQU0sY0FBbUIsQ0FBQztBQUMxQixVQUFNLFVBQVUsb0JBQUksSUFBTztBQUMzQixVQUFNLGlCQUFpQixvQkFBSSxJQUFPO0FBQ2xDLFVBQU0sV0FBc0MsQ0FBQztBQUU3QyxVQUFNLE1BQU0sQ0FBQyxTQUFrQjtBQUM5QixjQUFRLElBQUksSUFBSTtBQUNoQixxQkFBZSxJQUFJLElBQUk7QUFFdkIsWUFBTSxXQUFXLEtBQUssZUFBZSxJQUFJLElBQUk7QUFDN0MsVUFBSSxVQUFVO0FBQ2IsbUJBQVcsWUFBWSxVQUFVO0FBQ2hDLGNBQUksQ0FBQyxRQUFRLElBQUksUUFBUSxHQUFHO0FBQzNCLGdCQUFJLFFBQVE7QUFBQSxVQUNiLFdBQVcsZUFBZSxJQUFJLFFBQVEsR0FBRztBQUV4Qyx3QkFBWSxLQUFLLFFBQVE7QUFDekIscUJBQVMsS0FBSyxFQUFFLE1BQU0sTUFBTSxJQUFJLFNBQVMsQ0FBQztBQUFBLFVBQzNDO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFFQSxxQkFBZSxPQUFPLElBQUk7QUFBQSxJQUMzQjtBQUdBLGVBQVcsUUFBUSxLQUFLLFFBQVE7QUFDL0IsVUFBSSxDQUFDLFFBQVEsSUFBSSxJQUFJLEdBQUc7QUFDdkIsWUFBSSxJQUFJO0FBQUEsTUFDVDtBQUFBLElBQ0Q7QUFHQSxlQUFXLEVBQUUsTUFBTSxHQUFHLEtBQUssVUFBVTtBQUNwQyxZQUFNLGNBQWMsS0FBSyxlQUFlLElBQUksSUFBSTtBQUNoRCxVQUFJLGFBQWE7QUFDaEIsb0JBQVksT0FBTyxFQUFFO0FBQUEsTUFDdEI7QUFBQSxJQUNEO0FBRUEsV0FBTyxFQUFFLFlBQVk7QUFBQSxFQUN0QjtBQUFBLEVBRUEsWUFBWSxNQUF1QjtBQUNsQyxVQUFNLFdBQVcsS0FBSyxlQUFlLElBQUksSUFBSTtBQUM3QyxXQUFPLFdBQVcsTUFBTSxLQUFLLFFBQVEsSUFBSSxDQUFDO0FBQUEsRUFDM0M7QUFDRDsiLAogICJuYW1lcyI6IFtdCn0K
