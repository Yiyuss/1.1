// 主線模式圖層配置：為每個物件獨立分配圖層
// 圖層順序：數字越大，顯示越前面（z-index 越高）
// UI 的 z-index 是 10，所以所有遊戲物件的 z-index 必須 < 10

const MAIN_LAYER_CONFIG = {
  // 玩家圖層：在碰撞區前方（樹幹、建築物下方部分）
  // 玩家應該在樹葉後面，但在樹幹（碰撞區）和建築物碰撞區前面
  'player': 6, // 提高玩家 z-index，讓玩家顯示在碰撞區前方
  
  // 樹木圖層（每棵樹獨立）
  // 注意：樹的碰撞區在 y + 110 到 y + 130（樹幹部分）
  // 玩家應該在樹幹前方，所以樹的 z-index 應該 < 玩家
  'tree-A': 4,
  'tree-B': 4,
  'tree-C': 4,
  'tree-D': 4,
  'tree-E': 4,
  'tree-F': 4,
  'tree-G': 4,
  'tree-H': 4,
  'tree-I': 4,
  'tree-J': 4,
  'tree-K': 4,
  'tree-L': 4,
  'tree-M': 4,
  'tree-N': 4,
  'tree-O': 4,
  'tree-P': 4,
  'tree-Q': 4,
  'tree-R': 4,
  'tree-S': 4,
  'tree-T': 4,
  
  // 房子圖層（最高，顯示在最前面）
  // 注意：建築物的碰撞區在下方部分，玩家應該在碰撞區前方
  // 但建築物的非碰撞區（上方）應該在玩家前面
  // 由於建築物是單一圖片，我們讓建築物整體在玩家前面
  // 如果需要更精細的控制，需要將建築物分成兩部分渲染
  'home-main': 8,
  'house-A': 8,
  'house-B': 8,
  'house-C': 8,
  'house-D': 8,
  
  // 預設圖層（如果找不到對應的 layerId）
  'default': 3
};

// 獲取圖層的 z-index
function getLayerZIndex(layerId) {
  if (!layerId) return MAIN_LAYER_CONFIG['default'];
  return MAIN_LAYER_CONFIG[layerId] || MAIN_LAYER_CONFIG['default'];
}

// 導出（如果使用模組系統）
if (typeof window !== 'undefined') {
  window.MAIN_LAYER_CONFIG = MAIN_LAYER_CONFIG;
  window.getLayerZIndex = getLayerZIndex;
}

