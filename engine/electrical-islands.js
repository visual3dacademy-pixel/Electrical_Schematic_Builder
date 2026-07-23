// Version 1.0
// Classifies electrical islands without inventing a connection to ground.

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  function build(nodes, resistors, fixedVoltages) {
    const adjacency = new Map();
    const nodeList = Array.from(nodes || []);

    nodeList.forEach((node) => adjacency.set(node, new Set()));
    (resistors || []).forEach((edge) => {
      if (!adjacency.has(edge.a)) adjacency.set(edge.a, new Set());
      if (!adjacency.has(edge.b)) adjacency.set(edge.b, new Set());
      adjacency.get(edge.a).add(edge.b);
      adjacency.get(edge.b).add(edge.a);
    });

    const islandByNode = new Map();
    const islands = [];
    const visited = new Set();

    adjacency.forEach((_neighbors, start) => {
      if (visited.has(start)) return;

      const stack = [start];
      const islandNodes = [];
      const references = [];
      visited.add(start);

      while (stack.length) {
        const node = stack.pop();
        islandNodes.push(node);
        if (fixedVoltages.has(node)) {
          references.push({ node, voltage: fixedVoltages.get(node) });
        }

        adjacency.get(node).forEach((neighbor) => {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            stack.push(neighbor);
          }
        });
      }

      const island = {
        id: `island${islands.length}`,
        nodes: islandNodes,
        references,
        status: references.length ? "referenced" : "floating"
      };

      islands.push(island);
      islandNodes.forEach((node) => islandByNode.set(node, island));
    });

    return {
      islands,
      islandByNode,
      statusOfNode(node) {
        const island = islandByNode.get(node);
        return island ? island.status : "floating";
      },
      islandOfNode(node) {
        return islandByNode.get(node) || null;
      }
    };
  }

  window.ESB.ElectricalIslands = { build };
})();
