

class RingLayout {
  run (graph, dimensions, layoutComplete) {
    const nodes = graph.nodes;
    const angleBetweenNodes = (Math.PI * 2) / (nodes.length - 1);
    const hw = dimensions.width * 0.5;
    const hh = dimensions.height * 0.5;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const metadataPosition = node.metadata && node.metadata.position;
      let fixedPos;
      if (metadataPosition) {
        const posX = metadataPosition.x;
        const posY = metadataPosition.y;
        if (typeof posX === 'number' && isFinite(posX) && typeof posY === 'number' && isFinite(posY)) {
          fixedPos = { x: posX, y: posY };
        }
      }
      let pos = fixedPos;
      if (!fixedPos) {
        if (i === 0) {
          pos = {
            x: 0,
            y: 0
          }
        } else {
          pos = {
            x: Math.cos((i - 1) * angleBetweenNodes) * hw,
            y: Math.sin((i - 1) * angleBetweenNodes) * hh
          };
        }
      }
      node.updatePosition(pos);
    }
    layoutComplete();
  }
}

export default RingLayout;
