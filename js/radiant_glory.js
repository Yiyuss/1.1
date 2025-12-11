// 光芒萬丈：向四面八方射出10條雷射，以玩家為中心進行旋轉
// 職責：
// - 從玩家位置向10個方向射出雷射
// - 所有雷射以玩家為中心旋轉
// - 使用與LV1雷射相同的傷害、範圍、持續時間、傷害間隔
// 依賴：Entity、Game、DamageSystem、DamageNumbers、CONFIG、Utils、LaserBeam
// 維護備註：
// - SaveCode 不涉及武器狀態與臨時武器的存檔，無需變更 SCHEMA_VERSION 或 localStorage 鍵名
class RadiantGloryEffect extends Entity {
    constructor(player, damage, widthPx, durationMs, tickIntervalMs, beamCount, rotationSpeed) {
        super(player.x, player.y, 1, 1);
        this.player = player;
        this.damage = damage;
        this.width = widthPx;
        this.duration = durationMs;
        this.tickIntervalMs = tickIntervalMs;
        this.beamCount = beamCount || 10;
        this.rotationSpeed = rotationSpeed || 1.0; // 弧度/秒
        this.startTime = Date.now();
        this.baseAngle = 0; // 基礎旋轉角度
        this.beams = []; // 存儲所有雷射光束
        this.weaponType = 'RADIANT_GLORY';
        
        // 初始化所有雷射光束
        this._createBeams();
    }
    
    _createBeams() {
        // 清除舊的雷射
        for (const beam of this.beams) {
            if (beam && !beam.markedForDeletion) {
                beam.markedForDeletion = true;
            }
        }
        this.beams = [];
        
        // 創建10條雷射，均勻分布在360度
        // 使用共享的敵人雷射分配表，確保每個敵人最多只能被3條雷射持續傷害
        // enemyId -> Set<beamIndex>，記錄哪些雷射可以傷害該敵人
        if (!this.enemyBeamAssignment) {
            this.enemyBeamAssignment = new Map(); // enemyId -> Set<beamIndex>
        }
        this.enemyBeamAssignment.clear(); // 每次重新創建時清除分配
        
        const angleStep = (Math.PI * 2) / this.beamCount;
        for (let i = 0; i < this.beamCount; i++) {
            const angle = i * angleStep;
            const beam = new LaserBeam(
                this.player,
                angle,
                this.damage,
                this.width,
                this.duration,
                this.tickIntervalMs
            );
            beam.weaponType = 'RADIANT_GLORY';
            beam.baseAngle = angle; // 保存初始角度
            beam.beamIndex = i; // 記錄雷射索引，用於分配
            // 將共享的敵人雷射分配表傳遞給每條雷射
            beam._radiantGloryAssignment = this.enemyBeamAssignment;
            beam._radiantGloryMaxHits = 3; // 每個敵人最多3條雷射
            this.beams.push(beam);
            Game.addProjectile(beam);
        }
    }
    
    update(deltaTime) {
        // 更新旋轉角度
        this.baseAngle += this.rotationSpeed * (deltaTime / 1000);
        
        // 更新所有雷射的角度和位置
        for (let i = 0; i < this.beams.length; i++) {
            const beam = this.beams[i];
            if (beam && !beam.markedForDeletion) {
                // 計算新的角度（基礎角度 + 旋轉角度）
                const newAngle = beam.baseAngle + this.baseAngle;
                beam.angle = newAngle;
                // 更新玩家位置（因為LaserBeam會追隨玩家）
                this.x = this.player.x;
                this.y = this.player.y;
                // 重新計算端點
                const pts = beam.computeEndpoints();
                beam.startX = pts.startX;
                beam.startY = pts.startY;
                beam.endX = pts.endX;
                beam.endY = pts.endY;
                // 調用LaserBeam的update方法來更新傷害檢測
                if (typeof beam.update === 'function') {
                    beam.update(deltaTime);
                }
            } else {
                // 如果雷射被刪除，從陣列中移除
                this.beams.splice(i, 1);
                i--;
            }
        }
        
        // 檢查所有已分配的敵人是否還在任何雷射範圍內
        // 如果敵人離開了所有雷射範圍，清除分配，以便重新靠近時重新分配
        // 這個檢查在每個update週期進行，確保敵人離開後能及時清除分配
        if (this.enemyBeamAssignment && this.enemyBeamAssignment.size > 0) {
            const half = this.width / 2;
            
            // 檢查所有已分配的敵人
            for (const [enemyId, assignedBeams] of this.enemyBeamAssignment.entries()) {
                // 找到對應的敵人
                const enemy = (Game.enemies || []).find(e => (e.id || e) === enemyId);
                if (!enemy) {
                    // 敵人已死亡，清除分配
                    this.enemyBeamAssignment.delete(enemyId);
                    continue;
                }
                
                // 檢查敵人是否還在任何雷射範圍內
                let isInAnyBeam = false;
                for (const beam of this.beams) {
                    if (beam && !beam.markedForDeletion) {
                        const d = beam.pointSegmentDistance(enemy.x, enemy.y, beam.startX, beam.startY, beam.endX, beam.endY);
                        if (d <= half + enemy.collisionRadius) {
                            isInAnyBeam = true;
                            break;
                        }
                    }
                }
                
                // 如果敵人不在任何雷射範圍內，清除分配
                if (!isInAnyBeam) {
                    this.enemyBeamAssignment.delete(enemyId);
                }
            }
        }
        
        // 檢查是否到期
        if (Date.now() - this.startTime >= this.duration) {
            // 標記所有雷射為刪除
            for (const beam of this.beams) {
                if (beam && !beam.markedForDeletion) {
                    beam.markedForDeletion = true;
                }
            }
            this.markedForDeletion = true;
        }
    }
    
    draw(ctx) {
        // 雷射的繪製由 LaserBeam 自己處理，這裡不需要額外繪製
        return;
    }
    
    destroy() {
        this.markedForDeletion = true;
        // 確保所有雷射都被標記為刪除
        for (const beam of this.beams) {
            if (beam && !beam.markedForDeletion) {
                beam.markedForDeletion = true;
            }
        }
    }
}

// 導出至全域
window.RadiantGloryEffect = RadiantGloryEffect;

