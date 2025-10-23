// 基本實體類
class Entity {
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.id = Utils.generateId();
        this.markedForDeletion = false;
        this.collisionRadius = Math.max(width, height) / 2;
        // 新增：可選多邊形碰撞路徑（相對中心座標），預設為 null
        this.collisionPolygon = null;
    }
    
    // 更新實體狀態
    update(deltaTime) {
        // 由子類實現
    }
    
    // 繪製實體
    draw(ctx) {
        // 由子類實現
    }
    
    // 既有：圓形近似碰撞（保持行為一致） -> 更新為多邊形優先
    isColliding(entity) {
        // 若雙方都有多邊形，使用 SAT 多邊形重疊
        if (this.hasCollisionPolygon && entity.hasCollisionPolygon && this.hasCollisionPolygon() && entity.hasCollisionPolygon()) {
            const polyA = this.getWorldPolygon();
            const polyB = entity.getWorldPolygon();
            if (polyA && polyB && typeof Utils.SATPolygonOverlap === 'function') {
                return Utils.SATPolygonOverlap(polyA, polyB);
            }
        }
        // 若其中一方有多邊形，使用圓-多邊形碰撞（另一方以圓表示）
        if (this.hasCollisionPolygon && this.hasCollisionPolygon() && typeof Utils.circlePolygonCollision === 'function') {
            const poly = this.getWorldPolygon();
            if (poly) {
                return Utils.circlePolygonCollision(entity.x, entity.y, entity.collisionRadius, poly);
            }
        }
        if (entity.hasCollisionPolygon && entity.hasCollisionPolygon() && typeof Utils.circlePolygonCollision === 'function') {
            const poly = entity.getWorldPolygon();
            if (poly) {
                return Utils.circlePolygonCollision(this.x, this.y, this.collisionRadius, poly);
            }
        }
        // 回退：圓形碰撞（維持結果一致）
        return Utils.circleCollision(
            this.x, this.y, this.collisionRadius,
            entity.x, entity.y, entity.collisionRadius
        );
    }

    // 新增：是否已設定多邊形碰撞路徑（3點以上）
    hasCollisionPolygon() {
        return Array.isArray(this.collisionPolygon) && this.collisionPolygon.length >= 3;
    }

    // 新增：設定多邊形路徑（相對中心座標點陣列 [[x,y],...]）
    setCollisionPolygon(points) {
        if (!Array.isArray(points) || points.length < 3) {
            this.collisionPolygon = null;
            return;
        }
        this.collisionPolygon = points.map(p => [Number(p[0]) || 0, Number(p[1]) || 0]);
    }

    // 新增：取得世界座標多邊形（不考慮旋轉，與現有邏輯一致）
    getWorldPolygon() {
        if (!this.hasCollisionPolygon()) return null;
        const ox = this.x, oy = this.y;
        return this.collisionPolygon.map(p => [ox + p[0], oy + p[1]]);
    }
    
    // 標記為刪除
    destroy() {
        this.markedForDeletion = true;
    }
}
