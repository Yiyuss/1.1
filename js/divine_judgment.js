// 神界裁決：5把常駐劍巡守玩家周遭；命中邏輯/傷害/特效與裁決相同，但不會消失
// 行為要點：
// - 有怪：優先分散鎖定不同目標；若只有一隻怪，僅派 1 把劍重複處理，其餘巡邏
// - 每把劍：移動到敵人頭上 → 落下造成傷害(含範圍) → 停留0.2s → 等速回到頭上 →（有新目標則移動換怪）→ 重複
class DivineJudgmentEffect extends Entity {
    constructor(player, opts = {}) {
        super(player.x, player.y, 2, 2);
        this.player = player;
        this.weaponType = 'DIVINE_JUDGMENT';
        // 為了「特效與裁決相同」，對敵人傷害的 weaponType 仍使用 JUDGMENT
        this._damageWeaponType = 'JUDGMENT';

        this.swordCount = 5;
        this.headOffsetY = 200; // 與裁決一致：敵人上方高度
        this._attackSeq = 0;
        this.visualScale = 1.5; // 劍圖大小：裁決的 1.5 倍（knife2.gif 不變）

        this.setStats(opts);

        // 建立 5 把劍：初始在玩家周圍分布，進入巡邏狀態
        this.swords = [];
        for (let i = 0; i < this.swordCount; i++) {
            const ang = (i / this.swordCount) * Math.PI * 2;
            const r = 80;
            const sx = this.player.x + Math.cos(ang) * r;
            const sy = this.player.y + Math.sin(ang) * r - 80;
            this.swords.push(this._createSwordState(sx, sy));
        }
    }

    setStats(opts = {}) {
        this.damage = Math.max(0, opts.damage || this.damage || 0);
        this.detectRadius = Math.max(1, opts.detectRadius || this.detectRadius || 400);
        this.aoeRadius = Math.max(1, opts.aoeRadius || this.aoeRadius || 100);
        this.fallDurationMs = Math.max(1, opts.fallDurationMs || this.fallDurationMs || 250);
        this.moveDurationMs = Math.max(1, opts.moveDurationMs || this.moveDurationMs || 2400);
        this.headWaitMs = Math.max(0, opts.headWaitMs || this.headWaitMs || 100);
        this.holdOnEnemyMs = Math.max(0, opts.holdOnEnemyMs || this.holdOnEnemyMs || 200);
        this.swordImageWidth = opts.swordImageWidth || this.swordImageWidth || 83;
        this.swordImageHeight = opts.swordImageHeight || this.swordImageHeight || 200;
        // 巡邏速度係數：越小越慢
        this.patrolSpeedFactor = (typeof opts.patrolSpeedFactor === 'number') ? opts.patrolSpeedFactor : (typeof this.patrolSpeedFactor === 'number' ? this.patrolSpeedFactor : 0.35);
    }

    _createSwordState(x, y) {
        return {
            state: 'patrol', // patrol | move_to_head | falling | hold | rising
            x,
            y,
            // 目標
            target: null, // Enemy
            // 通用計時
            t: 0,
            // 移動插值
            fromX: x,
            fromY: y,
            toX: x,
            toY: y,
            // 落下/上升專用
            appliedDamage: false,
            patrolWaypoint: null
        };
    }

    _getEnemiesInRange() {
        const enemies = (Game && Array.isArray(Game.enemies)) ? Game.enemies : [];
        const res = [];
        for (const e of enemies) {
            if (!e || e.markedForDeletion || e.health <= 0) continue;
            const d = Utils.distance(this.player.x, this.player.y, e.x, e.y);
            if (d <= this.detectRadius) res.push(e);
        }
        // 以距離排序（近到遠）
        res.sort((a, b) => Utils.distance(this.player.x, this.player.y, a.x, a.y) - Utils.distance(this.player.x, this.player.y, b.x, b.y));
        return res;
    }

    _headPosForEnemy(enemy) {
        return { x: enemy.x, y: enemy.y - this.headOffsetY };
    }

    _isValidEnemy(enemy, enemiesInRange) {
        if (!enemy || enemy.markedForDeletion || enemy.health <= 0) return false;
        // 只要仍在當前 inRange 名單內才視為有效
        return enemiesInRange.includes(enemy);
    }

    _pickPatrolPoint() {
        // 在玩家周遭的「攻擊範圍」內巡邏（回傳相對玩家偏移，確保玩家移動時可快速跟隨）
        const ang = Math.random() * Math.PI * 2;
        const r = Math.random() * this.detectRadius;
        // y 軸稍微偏上，符合「在玩家周遭漂浮」
        const dx = Math.cos(ang) * r;
        const dy = (-80) + Math.sin(ang) * r * 0.35 + (Math.random() - 0.5) * 80;
        return { dx, dy };
    }

    _getAssignedEnemyIds(singleEnemy, singleSwordIndex) {
        const set = new Set();
        for (let i = 0; i < this.swords.length; i++) {
            if (singleEnemy && i !== singleSwordIndex) continue;
            const s = this.swords[i];
            if (s && s.target && s.state !== 'patrol') set.add(s.target.id);
        }
        return set;
    }

    _pickTargetForSword(i, enemiesInRange, singleEnemy, singleSwordIndex) {
        if (!enemiesInRange.length) return null;
        if (singleEnemy) return (i === singleSwordIndex) ? enemiesInRange[0] : null;

        // 優先選擇「未被其他劍鎖定」的敵人；若都被鎖定則不出手（保持巡邏）
        const assigned = this._getAssignedEnemyIds(false, -1);
        // 排除自己目前的 target（避免一直重選同一個）
        const self = this.swords[i];
        if (self && self.target) assigned.delete(self.target.id);

        for (const e of enemiesInRange) {
            if (!e || e.health <= 0 || e.markedForDeletion) continue;
            if (!assigned.has(e.id)) return e;
        }
        return null;
    }

    _startMoveTo(s, toX, toY, durationMs) {
        s.state = 'move_to_head';
        s.t = 0;
        s.fromX = s.x;
        s.fromY = s.y;
        s.toX = toX;
        s.toY = toY;
        s.moveMs = Math.max(1, durationMs || this.moveDurationMs);
        s.appliedDamage = false;
    }

    _startHeadWait(s) {
        s.state = 'head_wait';
        s.t = 0;
    }

    _startFalling(s, enemy) {
        const head = this._headPosForEnemy(enemy);
        s.state = 'falling';
        s.t = 0;
        s.fromX = head.x;
        s.fromY = head.y;
        s.toX = enemy.x;
        s.toY = enemy.y;
        s.appliedDamage = false;
    }

    _startHold(s) {
        s.state = 'hold';
        s.t = 0;
    }

    _startRising(s, enemy) {
        const head = this._headPosForEnemy(enemy);
        s.state = 'rising';
        s.t = 0;
        s.fromX = s.x;
        s.fromY = s.y;
        s.toX = head.x;
        s.toY = head.y;
    }

    _startPatrol(s) {
        s.state = 'patrol';
        s.target = null;
        s.t = 0;
        if (!s.patrolWaypoint) s.patrolWaypoint = this._pickPatrolPoint();
    }

    _applyDamageAt(x, y) {
        const enemies = (Game && Array.isArray(Game.enemies)) ? Game.enemies : [];
        const processed = new Set();
        for (const enemy of enemies) {
            if (!enemy || enemy.markedForDeletion || enemy.health <= 0) continue;
            if (processed.has(enemy)) continue;
            const dist = Utils.distance(x, y, enemy.x, enemy.y);
            if (dist > this.aoeRadius) continue;
            processed.add(enemy);
            if (typeof DamageSystem !== 'undefined') {
                const result = DamageSystem.computeHit(this.damage, enemy, {
                    weaponType: this._damageWeaponType,
                    critChanceBonusPct: ((this.player && this.player.critChanceBonusPct) || 0)
                });
                enemy.takeDamage(result.amount, { weaponType: this._damageWeaponType, attackId: 'DIVINE_' + (this._attackSeq++) });
                if (typeof DamageNumbers !== 'undefined') {
                    const dirX = (enemy.x - x) || 1;
                    const dirY = (enemy.y - y) || 0;
                    const mag = Math.hypot(dirX, dirY) || 1;
                    DamageNumbers.show(
                        result.amount,
                        enemy.x,
                        enemy.y - (enemy.height || 0) / 2,
                        result.isCrit,
                        { dirX: dirX / mag, dirY: dirY / mag, enemyId: enemy.id }
                    );
                }
            } else {
                enemy.takeDamage(this.damage, { weaponType: this._damageWeaponType, attackId: 'DIVINE_' + (this._attackSeq++) });
            }
        }
        // 音效（與裁決一致）
        if (typeof AudioManager !== 'undefined') {
            AudioManager.playSound('knife');
        }
    }

    update(deltaTime) {
        // 跟隨玩家（保險：本體不繪製，但保持座標合理）
        this.x = this.player.x;
        this.y = this.player.y;

        const enemiesInRange = this._getEnemiesInRange();

        // 計算玩家速度（供「跟隨玩家比追蹤敵人更快」的補正）
        if (this._prevPlayerX == null) this._prevPlayerX = this.player.x;
        if (this._prevPlayerY == null) this._prevPlayerY = this.player.y;
        const pvx = (this.player.x - this._prevPlayerX) / Math.max(0.001, (deltaTime / 1000));
        const pvy = (this.player.y - this._prevPlayerY) / Math.max(0.001, (deltaTime / 1000));
        this._playerSpeed = Math.hypot(pvx, pvy) || 0;
        this._prevPlayerX = this.player.x;
        this._prevPlayerY = this.player.y;
        const singleEnemy = (enemiesInRange.length === 1);
        let singleSwordIndex = -1;
        if (singleEnemy) {
            const only = enemiesInRange[0];
            // 若已有劍在處理該怪，沿用；否則固定用第0把
            singleSwordIndex = 0;
            for (let i = 0; i < this.swords.length; i++) {
                const s = this.swords[i];
                if (s && s.target && s.target === only && s.state !== 'patrol') { singleSwordIndex = i; break; }
            }
        }

        // 每把劍更新
        for (let i = 0; i < this.swords.length; i++) {
            const s = this.swords[i];
            if (!s) continue;

            // 單怪規則：除指定那把外，其餘強制巡邏
            if (singleEnemy && i !== singleSwordIndex) {
                if (s.state !== 'patrol') this._startPatrol(s);
                this._updatePatrolSword(s, deltaTime);
                continue;
            }

            // 目標有效性檢查
            if (s.target && !this._isValidEnemy(s.target, enemiesInRange)) {
                this._startPatrol(s);
            }

            // 狀態機
            if (s.state === 'patrol') {
                // 有怪：嘗試取得目標（分散目標）
                const target = this._pickTargetForSword(i, enemiesInRange, singleEnemy, singleSwordIndex);
                if (target) {
                    s.target = target;
                    const head = this._headPosForEnemy(target);
                    this._startMoveTo(s, head.x, head.y, this.moveDurationMs);
                } else {
                    this._updatePatrolSword(s, deltaTime);
                }
                continue;
            }

            // combat 狀態需要目標
            const enemy = s.target;
            if (!enemy) {
                this._startPatrol(s);
                this._updatePatrolSword(s, deltaTime);
                continue;
            }

            if (s.state === 'move_to_head') {
                // 目標可能移動，終點跟著更新
                const head = this._headPosForEnemy(enemy);
                s.toX = head.x;
                s.toY = head.y;
                s.t += deltaTime;
                const p = Math.min(1, s.t / (s.moveMs || this.moveDurationMs));
                s.x = s.fromX + (s.toX - s.fromX) * p;
                s.y = s.fromY + (s.toY - s.fromY) * p;
                if (p >= 1) {
                    // 有移動就視為冷卻表現的一部分：到位立刻落下
                    this._startFalling(s, enemy);
                }
                continue;
            }

            if (s.state === 'falling') {
                // 目標位置跟隨敵人（裁決同邏輯）
                s.toX = enemy.x;
                s.toY = enemy.y;
                s.t += deltaTime;
                const p = Math.min(1, s.t / this.fallDurationMs);
                s.x = s.fromX + (s.toX - s.fromX) * p;
                s.y = s.fromY + (s.toY - s.fromY) * p;
                if (p >= 1 && !s.appliedDamage) {
                    s.appliedDamage = true;
                    this._applyDamageAt(s.toX, s.toY);
                    this._startHold(s);
                }
                continue;
            }

            if (s.state === 'hold') {
                // 停在敵人身上 0.2 秒（跟隨敵人位置，避免怪移動造成穿模）
                s.x = enemy.x;
                s.y = enemy.y;
                s.t += deltaTime;
                if (s.t >= this.holdOnEnemyMs) {
                    this._startRising(s, enemy);
                }
                continue;
            }

            if (s.state === 'rising') {
                // 回到頭上的速度與落下相同（使用 fallDurationMs）
                const head = this._headPosForEnemy(enemy);
                s.toX = head.x;
                s.toY = head.y;
                s.t += deltaTime;
                const p = Math.min(1, s.t / this.fallDurationMs);
                s.x = s.fromX + (s.toX - s.fromX) * p;
                s.y = s.fromY + (s.toY - s.fromY) * p;
                if (p >= 1) {
                    // 選下一個目標（優先不同目標）；若只有一隻怪，仍對同一隻重複落下
                    let next = null;
                    if (enemiesInRange.length > 0) {
                        if (singleEnemy) {
                            next = enemiesInRange[0];
                        } else {
                            // 優先不同目標，且不與其他劍重複
                            const assigned = this._getAssignedEnemyIds(false, -1);
                            // 自己當前目標先不算占用，方便換怪
                            assigned.delete(enemy.id);
                            for (const cand of enemiesInRange) {
                                if (!cand || cand.health <= 0 || cand.markedForDeletion) continue;
                                if (cand === enemy) continue;
                                if (!assigned.has(cand.id)) { next = cand; break; }
                            }
                            // 若找不到不同的，就保持原目標（但此時代表其它怪都被佔用）
                            if (!next) next = enemy;
                        }
                    }
                    if (!next) {
                        this._startPatrol(s);
                    } else if (next === enemy) {
                        // 單一目標不移動時：頭上等待 0.1 秒再落下（形成 0.1 + 0.25 + 0.2 + 0.25 ≈ 0.8 秒循環）
                        this._startHeadWait(s);
                    } else {
                        s.target = next;
                        const head2 = this._headPosForEnemy(next);
                        this._startMoveTo(s, head2.x, head2.y, this.moveDurationMs);
                    }
                }
                continue;
            }

            if (s.state === 'head_wait') {
                // 停在頭上等待 headWaitMs，之後再落下（僅用於「同一目標重複落下」）
                const head = this._headPosForEnemy(enemy);
                s.x = head.x;
                s.y = head.y;
                s.t += deltaTime;
                if (s.t >= this.headWaitMs) {
                    this._startFalling(s, enemy);
                }
                continue;
            }
        }
    }

    _updatePatrolSword(s, deltaTime) {
        if (!s.patrolWaypoint) s.patrolWaypoint = this._pickPatrolPoint();
        const wp = s.patrolWaypoint;
        // 目標點跟隨玩家：以相對偏移表示
        const tx = this.player.x + (wp.dx || 0);
        const ty = this.player.y + (wp.dy || 0);
        const dx = tx - s.x;
        const dy = ty - s.y;
        const dist = Math.hypot(dx, dy) || 0;
        // 若偏移跑太遠（玩家移動或外力），重新取點
        const distToPlayer = Utils.distance(this.player.x, this.player.y, s.x, s.y);
        if (dist < 10 || distToPlayer > this.detectRadius * 1.2) {
            s.patrolWaypoint = this._pickPatrolPoint();
            return;
        }
        // 以 moveDurationMs 推導攻擊移動速度，再乘係數變慢
        const baseSpeed = (this.detectRadius / Math.max(0.5, (this.moveDurationMs / 1000))); // px/s（追蹤敵人移動的參考速度）
        const patrolSpeed = Math.max(40, baseSpeed * this.patrolSpeedFactor); // 巡邏慢
        // 跟隨玩家補正：玩家移動時，允許更快把劍拉回玩家周遭（要比追蹤敵人更快）
        const followBoost = Math.max(0, distToPlayer - this.detectRadius * 0.75);
        const followSpeed = Math.max(patrolSpeed, baseSpeed * 1.25 + (this._playerSpeed || 0) * 1.8 + followBoost * 0.6);
        const step = followSpeed * (deltaTime / 1000);
        const k = Math.min(1, step / dist);
        s.x += dx * k;
        s.y += dy * k;
    }

    draw(ctx) {
        const img = (Game && Game.images) ? Game.images['A39'] : null;
        if (!img || !img.complete) return;

        const aspectRatio = this.swordImageWidth / this.swordImageHeight;
        const baseHeight = 80;
        const drawHeight = baseHeight * (this.visualScale || 1.0);
        const drawWidth = drawHeight * aspectRatio;

        for (const s of this.swords) {
            if (!s) continue;
            ctx.save();
            ctx.drawImage(
                img,
                s.x - drawWidth / 2,
                s.y - drawHeight / 2,
                drawWidth,
                drawHeight
            );
            ctx.restore();
        }
    }

    destroy() {
        this.markedForDeletion = true;
    }
}


