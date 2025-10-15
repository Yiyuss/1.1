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
    }
    
    // 更新實體狀態
    update(deltaTime) {
        // 由子類實現
    }
    
    // 繪製實體
    draw(ctx) {
        // 由子類實現
    }
    
    // 檢查與另一個實體的碰撞
    isColliding(entity) {
        return Utils.circleCollision(
            this.x, this.y, this.collisionRadius,
            entity.x, entity.y, entity.collisionRadius
        );
    }
    
    // 標記為刪除
    destroy() {
        this.markedForDeletion = true;
    }
}