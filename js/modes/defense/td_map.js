// 防禦塔TD地圖系統
// 管理遊戲地圖、路徑、可建造區域

console.log('TD_MAP.JS 正在加載...');

class TDMap {
    constructor(config) {
        console.log('TDMap構造函數開始...');
        this.config = config;
        this.grid = [];
        this.path = [];
        this.buildableCells = [];
        this.basePosition = { x: config.BASE.X, y: config.BASE.Y };
        
        console.log('基地位置:', this.basePosition);
        console.log('地圖配置:', config.MAP);
        
        this.initializeGrid();
        console.log('網格初始化完成，網格尺寸:', this.grid.length, 'x', this.grid[0]?.length);
        
        this.generatePath();
        console.log('路徑生成完成，路徑長度:', this.path.length);
        
        this.markBuildableAreas();
        console.log('可建造區域標記完成，可建造格子數:', this.buildableCells.length);
    }
    
    // 初始化網格
    initializeGrid() {
        const { GRID_COLS, GRID_ROWS } = this.config.MAP;
        
        for (let row = 0; row < GRID_ROWS; row++) {
            this.grid[row] = [];
            for (let col = 0; col < GRID_COLS; col++) {
                this.grid[row][col] = {
                    x: col * this.config.MAP.GRID_SIZE,
                    y: row * this.config.MAP.GRID_SIZE,
                    row: row,
                    col: col,
                    centerX: col * this.config.MAP.GRID_SIZE + this.config.MAP.GRID_SIZE / 2,
                    centerY: row * this.config.MAP.GRID_SIZE + this.config.MAP.GRID_SIZE / 2,
                    isPath: false,
                    isBuildable: false,
                    hasTower: false,
                    tower: null
                };
            }
        }
    }
    
    /**
     * 生成四向單格迷宮路線
     * 
     * 維護說明：
     * - 生成四個象限（上下左右）的獨立迷宮路線
     * - 每條路線只在對應象限內蛇行，禁止互相接觸
     * - 路線對稱但不使用鏡像（手動定義對稱點）
     * - 透明格子的"1格"不等於地圖實際"1格"，透明格子是更大的阻擋區塊
     * - 每條路線都是單一路線，無岔路
     * 
     * 結果：
     * - this.paths: 四條獨立路線陣列，每條包含 {name, start, end, path}
     * - this.path: 合併所有路徑用於視覺顯示（去重）
     * - this.spawnPoints: 四個出生點
     * 
     * 注意：this.path 只用於渲染，實際敵人移動使用 this.paths 中對應的路徑
     */
    generatePath() {
        const targetCol = Math.floor(this.basePosition.x / this.config.MAP.GRID_SIZE);
        const targetRow = Math.floor(this.basePosition.y / this.config.MAP.GRID_SIZE);
        const totalRows = this.config.MAP.GRID_ROWS;
        const totalCols = this.config.MAP.GRID_COLS;
        const center = { row: targetRow, col: targetCol };
        
        this.resetPathFlags();
        const templates = this.getDirectionalTemplates(targetRow, targetCol);
        const paths = [];
        
        templates.forEach(template => {
            // 直接使用手動定義的座標點，無需複雜轉換
            const carvedPath = this.buildPathFromPoints(template.points);
            if (carvedPath.length > 1) {
                paths.push({
                    name: template.name,
                    start: { ...carvedPath[0] },
                    end: { ...carvedPath[carvedPath.length - 1] },
                    path: carvedPath
                });
            }
        });
        
        if (!paths.length) {
            console.warn('路徑模板失敗，使用備援直線路徑');
            const fallbackStarts = [
                { row: targetRow, col: 0, name: '左側備援' },
                { row: targetRow, col: this.config.MAP.GRID_COLS - 1, name: '右側備援' },
                { row: 0, col: targetCol, name: '上方備援' },
                { row: this.config.MAP.GRID_ROWS - 1, col: targetCol, name: '下方備援' }
            ];
            fallbackStarts.forEach(start => {
            paths.push({
                    name: start.name,
                    start,
                    end: { row: targetRow, col: targetCol },
                    path: this.createDirectPath(start, { row: targetRow, col: targetCol })
            });
        });
        }
        
        this.paths = paths;
        // 注意：this.path 只用於渲染整體路徑視覺效果
        // 實際敵人移動使用 this.paths 中對應的路徑（每條路徑獨立，敵人隨機選擇一條）
        // 合併所有路徑用於視覺顯示（去重，避免重複標記）
        const allPathCells = new Set();
        paths.forEach(segment => {
            segment.path.forEach(cell => {
                const key = `${cell.row},${cell.col}`;
                allPathCells.add(key);
            });
        });
        this.path = Array.from(allPathCells).map(key => {
            const [row, col] = key.split(',').map(Number);
            return { row, col };
        });
        this.spawnPoints = paths.map(p => p.start);
        
        console.log(`路徑生成完成：${paths.length} 條獨立路線`);
        paths.forEach(p => {
            console.log(`  ${p.name}: ${p.path.length} 個格子，起點(${p.start.row},${p.start.col})，終點(${p.end.row},${p.end.col})`);
        });
    }
    
    resetPathFlags() {
        for (let row = 0; row < this.config.MAP.GRID_ROWS; row++) {
            for (let col = 0; col < this.config.MAP.GRID_COLS; col++) {
                this.grid[row][col].isPath = false;
            }
        }
    }
    
    /**
     * 生成四個象限獨立且對稱的路線模板
     * 
     * 維護說明：
     * - 按照圖片（紅色圓圈）設計，將地圖分為四個象限：左上、右上、左下、右下
     * - 每個象限有獨立的迷宮路線，禁止互相接觸
     * - 路線對稱但不使用鏡像（手動定義對稱點）
     * - 透明格子的"1格"不等於地圖實際"1格"，透明格子是更大的阻擋區塊
     * - 每條路線都是單一路線，無岔路
     * 
     * 象限劃分：
     * - 左側：col < centerCol，從左邊界開始
     * - 右側：col > centerCol，從右邊界開始
     * - 上方：row < centerRow，從上邊界開始
     * - 下方：row > centerRow，從下邊界開始
     * 
     * 路線設計原則：
     * 1. 每個象限的路線只在該象限內蛇行
     * 2. 路線最後一段才接近中心主堡
     * 3. 確保路線不跨越象限邊界
     */
    /**
     * 生成四個象限獨立且對稱的路線模板（標準塔防邏輯）
     * 
     * 設計原則（參考業界標準塔防遊戲）：
     * 1. 每條路徑從邊界開始（出生點），到達中心（主堡）
     * 2. 路徑是嚴格單線，無岔路
     * 3. 路徑寬度 = 1格（GRID_SIZE）
     * 4. 四條路徑完全獨立，不交叉
     * 
     * 地圖尺寸：48列 x 27行，中心位置 (24, 13)
     */
    getDirectionalTemplates(targetRow, targetCol) {
        const centerRow = this.clampRow(targetRow); // 13
        const centerCol = this.clampCol(targetCol); // 24
        
        // 上路徑：從頂部邊界開始，蛇行向下，到達中心
        const topPoints = [
            { row: 0, col: centerCol },           // 起點：頂部邊界中心
            { row: 2, col: centerCol },          // 向下
            { row: 2, col: centerCol - 8 },      // 向左
            { row: 4, col: centerCol - 8 },      // 向下
            { row: 4, col: centerCol + 8 },      // 向右
            { row: 6, col: centerCol + 8 },      // 向下
            { row: 6, col: centerCol - 12 },    // 向左
            { row: 8, col: centerCol - 12 },     // 向下
            { row: 8, col: centerCol + 12 },     // 向右
            { row: 10, col: centerCol + 12 },    // 向下
            { row: 10, col: centerCol },        // 回到中心列
            { row: centerRow, col: centerCol }  // 到達中心
        ];
        
        // 右路徑：從右邊界開始，蛇行向左，到達中心
        const rightPoints = [
            { row: centerRow, col: 47 },         // 起點：右邊界中心
            { row: centerRow, col: 45 },         // 向左
            { row: centerRow - 8, col: 45 },    // 向上
            { row: centerRow - 8, col: 43 },    // 向左
            { row: centerRow + 8, col: 43 },    // 向下
            { row: centerRow + 8, col: 41 },    // 向左
            { row: centerRow - 12, col: 41 },   // 向上
            { row: centerRow - 12, col: 39 },   // 向左
            { row: centerRow + 12, col: 39 },   // 向下
            { row: centerRow + 12, col: 37 },   // 向左
            { row: centerRow, col: 37 },        // 回到中心行
            { row: centerRow, col: centerCol }  // 到達中心
        ];
        
        // 下路徑：從底部邊界開始，蛇行向上，到達中心
        const bottomPoints = [
            { row: 26, col: centerCol },         // 起點：底部邊界中心
            { row: 24, col: centerCol },         // 向上
            { row: 24, col: centerCol + 8 },     // 向右
            { row: 22, col: centerCol + 8 },     // 向上
            { row: 22, col: centerCol - 8 },    // 向左
            { row: 20, col: centerCol - 8 },     // 向上
            { row: 20, col: centerCol + 12 },    // 向右
            { row: 18, col: centerCol + 12 },     // 向上
            { row: 18, col: centerCol - 12 },    // 向左
            { row: 16, col: centerCol - 12 },     // 向上
            { row: 16, col: centerCol },        // 回到中心列
            { row: centerRow, col: centerCol }   // 到達中心
        ];
        
        // 左路徑：從左邊界開始，蛇行向右，到達中心
        const leftPoints = [
            { row: centerRow, col: 0 },          // 起點：左邊界中心
            { row: centerRow, col: 2 },         // 向右
            { row: centerRow + 8, col: 2 },     // 向下
            { row: centerRow + 8, col: 4 },     // 向右
            { row: centerRow - 8, col: 4 },     // 向上
            { row: centerRow - 8, col: 6 },     // 向右
            { row: centerRow + 12, col: 6 },    // 向下
            { row: centerRow + 12, col: 8 },    // 向右
            { row: centerRow - 12, col: 8 },    // 向上
            { row: centerRow - 12, col: 10 },    // 向右
            { row: centerRow, col: 10 },        // 回到中心行
            { row: centerRow, col: centerCol }  // 到達中心
        ];
        
        // 確保所有點都在有效範圍內
        const clampPoints = (points) => points.map(pt => ({
            row: Math.max(0, Math.min(this.config.MAP.GRID_ROWS - 1, pt.row)),
            col: Math.max(0, Math.min(this.config.MAP.GRID_COLS - 1, pt.col))
        }));
        
        return [
            { name: '上方路線', points: clampPoints(topPoints) },
            { name: '右側路線', points: clampPoints(rightPoints) },
            { name: '下方路線', points: clampPoints(bottomPoints) },
            { name: '左側路線', points: clampPoints(leftPoints) }
        ];
    }
    
    normalizeToCell(point, rows, cols) {
        const row = Math.max(0, Math.min(rows - 1, Math.round(point.nr * (rows - 1))));
        const col = Math.max(0, Math.min(cols - 1, Math.round(point.nc * (cols - 1))));
        return { row, col };
    }
    
    /**
     * 從控制點構建嚴格單線路徑（簡化邏輯，無複雜算法）
     * 
     * 設計原則：
     * 1. 逐格連接控制點，確保路徑連續
     * 2. 先水平移動，再垂直移動（或相反），確保單線
     * 3. 每個格子只添加一次，使用 Set 防止重複
     * 
     * @param {Array} points - 控制點陣列（手動定義的座標點）
     * @returns {Array} 路徑格子陣列（嚴格單線）
     */
    buildPathFromPoints(points) {
        if (!points.length) return [];
        const path = [];
        const visitedCells = new Set(); // 防止重複
        
        const addCell = (row, col) => {
            // 邊界檢查
            if (row < 0 || row >= this.config.MAP.GRID_ROWS || 
                col < 0 || col >= this.config.MAP.GRID_COLS) {
                return false;
            }
            
            const key = `${row},${col}`;
            if (visitedCells.has(key)) return false; // 已訪問過，跳過
            
            visitedCells.add(key);
            path.push({ row, col });
            const gridCell = this.grid[row]?.[col];
            if (gridCell) {
                gridCell.isPath = true; // 標記為紅色透明格（敵人路徑）
            }
            return true;
        };
        
        // 添加起點
        addCell(points[0].row, points[0].col);
        
        // 逐段連接控制點
        for (let i = 0; i < points.length - 1; i++) {
            const start = points[i];
            const end = points[i + 1];
            
            let currentRow = start.row;
            let currentCol = start.col;
            
            // 先移動列（水平）
            while (currentCol !== end.col) {
                currentCol += currentCol < end.col ? 1 : -1;
                addCell(currentRow, currentCol);
            }
            
            // 再移動行（垂直）
            while (currentRow !== end.row) {
                currentRow += currentRow < end.row ? 1 : -1;
                addCell(currentRow, currentCol);
            }
        }
        
        return path;
    }
    
    addPathCell(row, col, collector) {
        const cell = this.grid[row] && this.grid[row][col];
        if (!cell) return;
        cell.isPath = true;
        const last = collector[collector.length - 1];
        if (!last || last.row !== row || last.col !== col) {
            collector.push({ row, col });
        }
    }
    
    clampRow(value) {
        return Math.max(0, Math.min(this.config.MAP.GRID_ROWS - 1, value));
    }
    
    clampCol(value) {
        return Math.max(0, Math.min(this.config.MAP.GRID_COLS - 1, value));
    }
    
    getDirectionVector(dir) {
        const map = {
            up: { dr: -1, dc: 0 },
            down: { dr: 1, dc: 0 },
            left: { dr: 0, dc: -1 },
            right: { dr: 0, dc: 1 }
        };
        return map[dir] || null;
    }
    
    createDirectPath(start, end) {
        const path = [];
        let current = { ...start };
        const visited = new Set();
        while (current.col !== end.col || current.row !== end.row) {
            const key = `${current.row},${current.col}`;
            if (!visited.has(key)) {
                path.push({ row: current.row, col: current.col });
                visited.add(key);
            }
            const deltaCol = end.col - current.col;
            const deltaRow = end.row - current.row;
            if (Math.abs(deltaCol) > Math.abs(deltaRow)) {
                current.col += deltaCol > 0 ? 1 : -1;
            } else {
                current.row += deltaRow > 0 ? 1 : -1;
            }
            current.col = Math.max(0, Math.min(this.config.MAP.GRID_COLS - 1, current.col));
            current.row = Math.max(0, Math.min(this.config.MAP.GRID_ROWS - 1, current.row));
            if (path.length > 2000) break;
        }
        path.push({ row: end.row, col: end.col });
        return path;
    }
    
    /**
     * 標記可建造區域（透明格）
     * 
     * 維護說明：
     * - 敵人路線以外的所有地方全部塞滿透明格
     * - 敵人路線寬度是1格，這些格子不能建造
     * - 主堡附近也不能建造（保留空間）
     * - 透明格子的"1格" = 地圖實際的"1格"（GRID_SIZE）
     * 
     * 設計原則：
     * 1. 先畫出敵人的固定路線在四個象限繞
     * 2. 完全隔離後，路線外的所有地方全部標記為可建造
     */
    markBuildableAreas() {
        this.buildableCells = [];
        
        for (let row = 0; row < this.config.MAP.GRID_ROWS; row++) {
            for (let col = 0; col < this.config.MAP.GRID_COLS; col++) {
                const cell = this.grid[row][col];
                
                // 不能在路徑上建造（敵人路線寬度1格）
                if (cell.isPath) {
                    cell.isBuildable = false;
                    continue;
                }
                
                // 不能在主堡附近建造（保留一些空間）
                const distanceToBase = Math.sqrt(
                    Math.pow(cell.centerX - this.basePosition.x, 2) + 
                    Math.pow(cell.centerY - this.basePosition.y, 2)
                );
                
                if (distanceToBase < this.config.BASE.SIZE) {
                    cell.isBuildable = false;
                    continue;
                }
                
                // 路線外的所有地方全部標記為可建造（透明格）
                cell.isBuildable = true;
                this.buildableCells.push(cell);
            }
        }
        
        console.log(`可建造區域標記完成：${this.buildableCells.length} 個透明格，${this.path.length} 個路徑格`);
    }
    
    // 獲取指定位置的格子
    getCellAt(x, y) {
        const col = Math.floor(x / this.config.MAP.GRID_SIZE);
        const row = Math.floor(y / this.config.MAP.GRID_SIZE);
        
        if (row >= 0 && row < this.config.MAP.GRID_ROWS && 
            col >= 0 && col < this.config.MAP.GRID_COLS) {
            return this.grid[row][col];
        }
        return null;
    }
    
    // 獲取最近的格子
    getNearestCell(x, y) {
        const col = Math.floor(x / this.config.MAP.GRID_SIZE);
        const row = Math.floor(y / this.config.MAP.GRID_SIZE);
        
        if (row >= 0 && row < this.config.MAP.GRID_ROWS && 
            col >= 0 && col < this.config.MAP.GRID_COLS) {
            return this.grid[row][col];
        }
        return null;
    }
    
    // 檢查是否可以在指定位置建造
    canBuildAt(x, y) {
        const cell = this.getNearestCell(x, y);
        return cell && cell.isBuildable && !cell.hasTower;
    }
    
    // 放置防禦塔
    placeTower(x, y, tower) {
        const cell = this.getNearestCell(x, y);
        if (cell && cell.isBuildable && !cell.hasTower) {
            cell.hasTower = true;
            cell.tower = tower;
            return cell;
        }
        return null;
    }
    
    // 移除防禦塔
    removeTower(x, y) {
        const cell = this.getNearestCell(x, y);
        if (cell && cell.hasTower) {
            cell.hasTower = false;
            const tower = cell.tower;
            cell.tower = null;
            return tower;
        }
        return null;
    }
    
    // 獲取路徑起點（敵人出生點）
    getSpawnPoint() {
        if (this.path.length > 0) {
            const firstCell = this.path[0];
            return this.grid[firstCell.row][firstCell.col];
        }
        return null;
    }
    
    // 獲取路徑終點（主堡位置）
    getEndPoint() {
        if (this.path.length > 0) {
            const lastCell = this.path[this.path.length - 1];
            return this.grid[lastCell.row][lastCell.col];
        }
        return null;
    }
    
    // 獲取路徑上的位置（用於敵人移動）
    getPathPosition(pathIndex) {
        if (pathIndex < this.path.length) {
            const cell = this.path[pathIndex];
            return this.grid[cell.row][cell.col];
        }
        return null;
    }
    
    // 獲取路徑長度
    getPathLength() {
        return this.path.length;
    }
    
    // 渲染地圖網格（調試用）
    render(ctx, showGrid = false, showPath = true) {
        if (showGrid) {
            // 繪製網格線
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 1;
            
            for (let row = 0; row <= this.config.MAP.GRID_ROWS; row++) {
                ctx.beginPath();
                ctx.moveTo(0, row * this.config.MAP.GRID_SIZE);
                ctx.lineTo(this.config.MAP.GRID_COLS * this.config.MAP.GRID_SIZE, row * this.config.MAP.GRID_SIZE);
                ctx.stroke();
            }
            
            for (let col = 0; col <= this.config.MAP.GRID_COLS; col++) {
                ctx.beginPath();
                ctx.moveTo(col * this.config.MAP.GRID_SIZE, 0);
                ctx.lineTo(col * this.config.MAP.GRID_SIZE, this.config.MAP.GRID_ROWS * this.config.MAP.GRID_SIZE);
                ctx.stroke();
            }
        }
        
        if (showPath) {
            // 繪製路徑（降低透明度以免遮蔽背景）
            ctx.fillStyle = 'rgba(255, 0, 0, 0.15)';
            this.path.forEach(cell => {
                const gridCell = this.grid[cell.row][cell.col];
                ctx.fillRect(
                    gridCell.x, 
                    gridCell.y, 
                    this.config.MAP.GRID_SIZE, 
                    this.config.MAP.GRID_SIZE
                );
            });
        }
        
        // 繪製可建造區域
        ctx.fillStyle = 'rgba(0, 255, 0, 0.12)';
        this.buildableCells.forEach(cell => {
            if (!cell.hasTower && !cell.isPath) {
                ctx.fillRect(
                    cell.x + 2, 
                    cell.y + 2, 
                    this.config.MAP.GRID_SIZE - 4, 
                    this.config.MAP.GRID_SIZE - 4
                );
            }
        });
        
        // 已建造的塔底部不再額外繪製黃色區塊，避免影響美術表現
        // 主堡區域由 TDGame 使用 Nexus.png 負責繪製，這裡不再額外畫方塊
    }
}

// 導出類別
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TDMap;
} else {
    window.TDMap = TDMap;
}

console.log('TD_MAP.JS 加載完成，TDMap:', typeof TDMap);
console.log('TD_MAP.JS 加載完成，TDMap:', typeof TDMap);