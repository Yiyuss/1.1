// 挑戰模式專屬：經驗球系統（不使用 Game.experienceOrbs）
(function(global){
  class ChallengeExperienceOrb extends Entity {
    constructor(x, y, value) {
      super(x, y, CONFIG.EXPERIENCE.SIZE, CONFIG.EXPERIENCE.SIZE);
      this.value = value || CONFIG.EXPERIENCE.VALUE;
      this.collisionRadius = CONFIG.EXPERIENCE.SIZE / 2;
      this.attractionSpeed = 0;
      this.maxAttractionSpeed = 10;
      this.attractionRange = 100;
      this.attractionAcceleration = 0.2;
      // 發射動畫（可選）
      this.launchVelX = 0;
      this.launchVelY = 0;
      this.launchDurationMs = 0;
      this.launchElapsed = 0;
      this.launchFriction = 0.98;
    }

    update(deltaTime) {
      // 初段飛行
      if (this.launchDurationMs > 0 && this.launchElapsed < this.launchDurationMs) {
        const step = deltaTime / 16.67;
        this.launchElapsed = Math.min(this.launchDurationMs, this.launchElapsed + deltaTime);
        this.x += this.launchVelX * step;
        this.y += this.launchVelY * step;
        this.launchVelX *= this.launchFriction;
        this.launchVelY *= this.launchFriction;
      }
      // 只使用挑戰模式玩家
      const player = global.CHALLENGE_PLAYER;
      if (!player) return; // 若不存在，暫不更新吸附與拾取
      const distanceToPlayer = Utils.distance(this.x, this.y, player.x, player.y);

      // 吸引（支援拾取範圍乘算）
      const prMul = (player && player.pickupRangeMultiplier) ? player.pickupRangeMultiplier : 1;
      const effectiveRange = this.attractionRange * prMul;
      if (distanceToPlayer < effectiveRange) {
        const deltaMul = deltaTime / 16.67;
        this.attractionSpeed = Math.min(this.attractionSpeed + this.attractionAcceleration * deltaMul, this.maxAttractionSpeed);
        const angle = Utils.angle(this.x, this.y, player.x, player.y);
        this.x += Math.cos(angle) * this.attractionSpeed * deltaMul;
        this.y += Math.sin(angle) * this.attractionSpeed * deltaMul;
      }

      // 撿取
      if (this.isColliding(player)) {
        try { if (typeof AudioManager !== 'undefined' && AudioManager.expSoundEnabled !== false) { AudioManager.playSound('collect_exp'); } } catch(_){}
        try { if (global.ChallengeUI && typeof global.ChallengeUI.gainExperience === 'function') { global.ChallengeUI.gainExperience(this.value); } } catch(_){}
        this.destroy();
      }
    }

    setLaunch(vx, vy, durationMs = 450, friction = 0.98) {
      this.launchVelX = vx || 0;
      this.launchVelY = vy || 0;
      this.launchDurationMs = Math.max(0, durationMs|0);
      this.launchElapsed = 0;
      this.launchFriction = (typeof friction === 'number') ? Math.max(0, Math.min(1, friction)) : 0.98;
    }

    draw(ctx) {
      ctx.save();
      if (Game.images && Game.images.exp_orb) {
        const size = Math.max(this.width, this.height);
        ctx.drawImage(Game.images.exp_orb, this.x - size / 2, this.y - size / 2, size, size);
      } else {
        ctx.fillStyle = '#0f0';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.width / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      // 閃爍效果（數量少於閾值時顯示）
      const orbCount = (global.ChallengeExperience && Array.isArray(global.ChallengeExperience.orbs)) ? global.ChallengeExperience.orbs.length : 0;
      const threshold = (CONFIG.OPTIMIZATION && CONFIG.OPTIMIZATION.ORB_PULSE_DISABLE_THRESHOLD) || 100;
      if (orbCount < threshold) {
        const pulseSize = Math.sin(Date.now() / 200) * 2;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.width / 2 + pulseSize, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  const ChallengeExperience = {
    orbs: [],
    spawnOrb(x, y, value) {
      const max = CONFIG.OPTIMIZATION.MAX_EXPERIENCE_ORBS;
      if (this.orbs.length >= max) return null;
      const o = new ChallengeExperienceOrb(x, y, value);
      this.orbs.push(o);
      return o;
    },
    update(dt) {
      for (let i = this.orbs.length - 1; i >= 0; i--) {
        const o = this.orbs[i];
        try { o.update(dt); } catch(_){}
        if (o && o.markedForDeletion) this.orbs.splice(i, 1);
      }
    },
    draw(ctx) {
      for (const o of this.orbs) { try { o.draw(ctx); } catch(_){} }
    },
    reset() { this.orbs.length = 0; }
  };

  global.ChallengeExperience = ChallengeExperience;
})(this);