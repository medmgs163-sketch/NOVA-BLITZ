/* ================================================================
   NOVA BLITZ v3 — script.js
   MODE INFINI OPTIMISÉ
   • Suppression du mode aventure / sélection de niveaux
   • Progression par 10 paliers (toutes les 20s) avec annonce visuelle
   • Événements spéciaux : Ruée, Pluie de power-ups, Débarquement Boss
   • Spawn dynamique : vagues scriptées par palier + formation intelligente
   • Score : +2 pts/s de survie, bonus combo jusqu'à ×8
   • Power-up garanti toutes les 8 vagues
   ================================================================ */

"use strict";

/* ────────────────────────────────────────────────────────────────
   UTILITAIRES
──────────────────────────────────────────────────────────────── */
const Utils = {
    rand: (a, b) => Math.random() * (b - a) + a,
    randInt: (a, b) => Math.floor(Math.random() * (b - a + 1)) + a,
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    circleRect(cx, cy, cr, rx, ry, rw, rh) {
        const nx = Utils.clamp(cx, rx, rx + rw);
        const ny = Utils.clamp(cy, ry, ry + rh);
        return Math.hypot(cx - nx, cy - ny) <= cr;
    }
};

/* ────────────────────────────────────────────────────────────────
   PARTICULES
──────────────────────────────────────────────────────────────── */
class ParticleSystem {
    constructor() { this.list = []; }

    emit(x, y, o = {}) {
        const n = o.count || 10;
        for (let i = 0; i < n; i++) {
            const a = o.angle !== undefined
                ? o.angle + Utils.rand(-(o.spread || Math.PI), o.spread || Math.PI)
                : Utils.rand(0, Math.PI * 2);
            const s = Utils.rand(o.speedMin || 1, o.speedMax || 4);
            this.list.push({
                x, y,
                vx: Math.cos(a) * s, vy: Math.sin(a) * s,
                life: 1,
                decay: Utils.rand(o.decayMin || 0.02, o.decayMax || 0.05),
                size: Utils.rand(o.sizeMin || 1, o.sizeMax || 4),
                color: o.colors ? o.colors[Utils.randInt(0, o.colors.length - 1)] : '#fff',
                glow: !!o.glow,
                gravity: o.gravity || 0,
            });
        }
    }

    explosion(x, y, col = '#ff6600', big = false) {
        this.emit(x, y, {
            count: big ? 44 : 22,
            speedMin: big ? 2 : 1, speedMax: big ? 10 : 5,
            sizeMin: 2, sizeMax: big ? 7 : 4,
            decayMin: 0.013, decayMax: 0.038,
            colors: [col, '#ffcc00', '#ff3300', '#ffffff', '#ff9900'], glow: true,
        });
        this.emit(x, y, {
            count: big ? 24 : 9,
            speedMin: big ? 6 : 3, speedMax: big ? 18 : 9,
            sizeMin: 1, sizeMax: 2,
            decayMin: 0.04, decayMax: 0.08,
            colors: ['#ffffff', '#ffffaa'],
        });
    }

    hit(x, y) {
        this.emit(x, y, {
            count: 6, speedMin: 1, speedMax: 3, sizeMin: 1, sizeMax: 3,
            decayMin: 0.05, decayMax: 0.1,
            colors: ['#ff4444', '#ff8888', '#ffaa00'],
        });
    }

    pickup(x, y, color) {
        this.emit(x, y, {
            count: 16, speedMin: 2, speedMax: 5, sizeMin: 2, sizeMax: 5,
            decayMin: 0.02, decayMax: 0.04,
            colors: [color, '#ffffff'], glow: true,
        });
    }

    update() {
        for (let i = this.list.length - 1; i >= 0; i--) {
            const p = this.list[i];
            p.x += p.vx; p.y += p.vy + p.gravity;
            p.vx *= 0.98; p.vy *= 0.98;
            p.life -= p.decay;
            if (p.life <= 0) this.list.splice(i, 1);
        }
    }

    draw(ctx) {
        this.list.forEach(p => {
            ctx.save();
            ctx.globalAlpha = p.life;
            if (p.glow) { ctx.shadowBlur = 10; ctx.shadowColor = p.color; }
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        });
    }
}

/* ────────────────────────────────────────────────────────────────
   FOND ÉTOILÉ
──────────────────────────────────────────────────────────────── */
class StarField {
    constructor(canvas) { this.canvas = canvas; this.init(); }

    init() {
        this.layers = [];
        for (let li = 0; li < 3; li++) {
            const stars = [];
            const n = li === 0 ? 160 : li === 1 ? 85 : 32;
            for (let i = 0; i < n; i++) {
                stars.push({
                    x: Utils.rand(0, this.canvas.width), y: Utils.rand(0, this.canvas.height),
                    r: Utils.rand(0.3, li === 2 ? 2.2 : 1.3),
                    speed: (li + 1) * 0.55,
                    bright: Utils.rand(0.3, 1), twOff: Utils.rand(0, Math.PI * 2),
                });
            }
            this.layers.push(stars);
        }
        this.nebula = {
            x: Utils.rand(120, this.canvas.width - 120), y: Utils.rand(80, this.canvas.height - 80),
            r: Utils.rand(160, 260),
            color: `hsla(${Utils.rand(200, 280)},80%,55%,0.045)`,
        };
    }

    update(mult = 1) {
        const t = performance.now() / 1000;
        this.layers.forEach((stars, li) => {
            stars.forEach(s => {
                s.y += s.speed * mult * (li === 0 ? 0.5 : 1);
                if (s.y > this.canvas.height + 4) { s.y = -4; s.x = Utils.rand(0, this.canvas.width); }
                s.bright = 0.5 + 0.5 * Math.sin(t * 2 + s.twOff);
            });
        });
    }

    draw(ctx) {
        const { width: W, height: H } = this.canvas;
        ctx.fillStyle = '#030310'; ctx.fillRect(0, 0, W, H);
        const g = ctx.createRadialGradient(this.nebula.x, this.nebula.y, 0, this.nebula.x, this.nebula.y, this.nebula.r);
        g.addColorStop(0, this.nebula.color); g.addColorStop(1, 'transparent');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        this.layers.forEach((stars, li) => {
            stars.forEach(s => {
                ctx.save(); ctx.globalAlpha = s.bright * (0.4 + li * 0.3);
                if (li === 2) { ctx.shadowBlur = 4; ctx.shadowColor = '#aab8ff'; }
                ctx.fillStyle = li === 2 ? '#c4ccff' : '#ffffff';
                ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
            });
        });
    }
}

/* ────────────────────────────────────────────────────────────────
   JOUEUR
──────────────────────────────────────────────────────────────── */
class Player {
    constructor(canvas, skin = null) {
        this.canvas = canvas;
        this.skin = skin || getActiveSkin();
        this.w = 44; this.h = 54;
        this.x = canvas.width / 2 - 22;
        this.y = canvas.height - 110;
        this.speed = 7;
        this.maxHp = 100; this.hp = 100;
        this.shield = 0; this.maxShield = 100;
        this.invincible = 0;
        this.fireRate = 8; this.fireCooldown = 0;
        this.fireMode = 'single'; this.fireModeTimer = 0;
        this.slowActive = false; this.slowTimer = 0;
        this.engineAnim = 0; this.hits = 0;
        this.minX = 0; this.maxX = canvas.width - this.w;
        this.minY = Math.floor(canvas.height * 0.38);
        this.maxY = canvas.height - this.h - 10;
    }

    applyPowerup(type) {
        switch (type) {
            case 'double': this.fireMode = 'double'; this.fireModeTimer = 600; break;
            case 'triple': this.fireMode = 'triple'; this.fireModeTimer = 600; break;
            case 'laser': this.fireMode = 'laser'; this.fireModeTimer = 360; break;
            case 'shield': this.shield = this.maxShield; break;
            case 'slow': this.slowActive = true; this.slowTimer = 480; break;
        }
    }

    takeDamage(dmg) {
        if (this.invincible > 0) return false;
        if (this.shield > 0) { this.shield = Math.max(0, this.shield - dmg); this.hits = 5; return false; }
        this.hp = Math.max(0, this.hp - dmg);
        this.invincible = 40; this.hits = 8;
        return this.hp <= 0;
    }

    update(keys) {
        if (keys['ArrowLeft'] || keys['a'] || keys['A']) this.x = Math.max(this.minX, this.x - this.speed);
        if (keys['ArrowRight'] || keys['d'] || keys['D']) this.x = Math.min(this.maxX, this.x + this.speed);
        if (keys['ArrowUp'] || keys['w'] || keys['W']) this.y = Math.max(this.minY, this.y - this.speed);
        if (keys['ArrowDown'] || keys['s'] || keys['S']) this.y = Math.min(this.maxY, this.y + this.speed);
        if (this.fireCooldown > 0) this.fireCooldown--;
        if (this.invincible > 0) this.invincible--;
        if (this.hits > 0) this.hits--;
        if (this.fireModeTimer > 0) { this.fireModeTimer--; if (!this.fireModeTimer) this.fireMode = 'single'; }
        if (this.slowTimer > 0) { this.slowTimer--; if (!this.slowTimer) this.slowActive = false; }
        this.engineAnim = (this.engineAnim + 0.3) % (Math.PI * 2);
    }

    tryFire() {
        if (this.fireCooldown > 0) return [];
        this.fireCooldown = this.fireMode === 'laser' ? 6 : this.fireRate;
        const cx = this.x + this.w / 2, top = this.y;
        const B = [];
        switch (this.fireMode) {
            case 'single':
                B.push(new Bullet(cx - 2, top, 0, -14, 'player', 'single')); break;
            case 'double':
                B.push(new Bullet(cx - 10, top + 10, 0, -14, 'player', 'double'));
                B.push(new Bullet(cx + 6, top + 10, 0, -14, 'player', 'double')); break;
            case 'triple':
                B.push(new Bullet(cx - 2, top, 0, -14, 'player', 'triple'));
                B.push(new Bullet(cx - 10, top + 10, -1.8, -13, 'player', 'triple'));
                B.push(new Bullet(cx + 6, top + 10, 1.8, -13, 'player', 'triple')); break;
            case 'laser':
                B.push(new Bullet(cx - 3, top, 0, -20, 'player', 'laser')); break;
        }
        if (B.length && typeof Audio !== 'undefined') Audio.sfxShoot(this.fireMode);
        return B;
    }

    draw(ctx) {
        if (this.invincible > 0 && Math.floor(this.invincible / 5) % 2 === 0) return;
        const sk = this.skin;
        const cx = this.x + this.w / 2;
        ctx.save();
        if (this.hits > 0) ctx.filter = 'hue-rotate(300deg) brightness(2.2)';

        // ── Flammes moteur (couleurs du skin)
        const fH = 14 + 8 * Math.sin(this.engineAnim);
        const fg = ctx.createLinearGradient(cx, this.y + this.h, cx, this.y + this.h + fH);
        fg.addColorStop(0, sk.flame0); fg.addColorStop(1, sk.flame1);
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.moveTo(cx - 8, this.y + this.h - 2); ctx.lineTo(cx + 8, this.y + this.h - 2);
        ctx.lineTo(cx + 4, this.y + this.h + fH); ctx.lineTo(cx - 4, this.y + this.h + fH);
        ctx.closePath(); ctx.fill();

        // ── Flammes latérales
        const sf = 10 + 4 * Math.sin(this.engineAnim + 1);
        ctx.fillStyle = sk.flame0.replace('.9', '.35');
        for (const dx of [0, this.w - 16]) {
            ctx.beginPath();
            ctx.moveTo(this.x + dx + 4, this.y + this.h - 4); ctx.lineTo(this.x + dx + 12, this.y + this.h - 4);
            ctx.lineTo(this.x + dx + 8, this.y + this.h + sf); ctx.closePath(); ctx.fill();
        }

        ctx.shadowBlur = 16; ctx.shadowColor = sk.glow;

        // ── Fuselage principal
        ctx.fillStyle = sk.hull;
        ctx.beginPath();
        ctx.moveTo(cx, this.y); ctx.lineTo(cx + 12, this.y + 20); ctx.lineTo(cx + 22, this.y + this.h - 4);
        ctx.lineTo(cx - 22, this.y + this.h - 4); ctx.lineTo(cx - 12, this.y + 20); ctx.closePath(); ctx.fill();

        // ── Cockpit fuselage
        ctx.fillStyle = sk.hull2;
        ctx.beginPath(); ctx.moveTo(cx, this.y + 4); ctx.lineTo(cx + 7, this.y + 22); ctx.lineTo(cx - 7, this.y + 22); ctx.closePath(); ctx.fill();

        // ── Ailes
        ctx.fillStyle = sk.wing;
        ctx.beginPath(); ctx.moveTo(cx - 10, this.y + 20); ctx.lineTo(this.x, this.y + this.h); ctx.lineTo(cx - 8, this.y + this.h - 6); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx + 10, this.y + 20); ctx.lineTo(this.x + this.w, this.y + this.h); ctx.lineTo(cx + 8, this.y + this.h - 6); ctx.closePath(); ctx.fill();

        // ── Canons
        ctx.fillStyle = sk.cannon;
        ctx.fillRect(cx - 2, this.y - 2, 4, 14);
        if (this.fireMode === 'double' || this.fireMode === 'triple') {
            ctx.fillRect(cx - 12, this.y + 8, 3, 10); ctx.fillRect(cx + 9, this.y + 8, 3, 10);
        }

        // ── Cockpit canopy (vitré)
        const cg = ctx.createRadialGradient(cx, this.y + 14, 1, cx, this.y + 14, 8);
        cg.addColorStop(0, sk.cockpit0); cg.addColorStop(1, sk.cockpit1);
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.ellipse(cx, this.y + 14, 6, 9, 0, 0, Math.PI * 2); ctx.fill();

        // ── Skin Nova : effet arc-en-ciel sur les ailes
        if (sk.id === 'nova') {
            const t = this.engineAnim * 0.5;
            ctx.globalAlpha = 0.18 + 0.1 * Math.sin(this.engineAnim);
            const rg = ctx.createLinearGradient(this.x, this.y, this.x + this.w, this.y + this.h);
            rg.addColorStop(0, `hsl(${(t * 60) % 360},100%,60%)`);
            rg.addColorStop(0.5, `hsl(${(t * 60 + 120) % 360},100%,60%)`);
            rg.addColorStop(1, `hsl(${(t * 60 + 240) % 360},100%,60%)`);
            ctx.fillStyle = rg;
            ctx.fillRect(this.x, this.y, this.w, this.h);
            ctx.globalAlpha = 1;
        }

        // ── Bouclier
        if (this.shield > 0) {
            ctx.globalAlpha = 0.2 + 0.15 * Math.sin(this.engineAnim * 2);
            ctx.strokeStyle = sk.glow; ctx.lineWidth = 2; ctx.shadowBlur = 22; ctx.shadowColor = sk.glow;
            ctx.beginPath(); ctx.ellipse(cx, this.y + this.h / 2, this.w / 2 + 11, this.h / 2 + 11, 0, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
    }
}

/* ────────────────────────────────────────────────────────────────
   BALLES
──────────────────────────────────────────────────────────────── */
class Bullet {
    constructor(x, y, vx, vy, owner, type = 'single') {
        this.x = x; this.y = y; this.vx = vx; this.vy = vy;
        this.owner = owner; this.type = type;
        if (owner === 'player') {
            switch (type) {
                case 'laser': this.w = 4; this.h = 26; this.dmg = 28; this.color = '#ff4444'; this.gc = '#ff0000'; break;
                case 'double': this.w = 3; this.h = 13; this.dmg = 13; this.color = '#00ccff'; this.gc = '#00aaff'; break;
                case 'triple': this.w = 3; this.h = 11; this.dmg = 11; this.color = '#cc44ff'; this.gc = '#aa00ff'; break;
                default: this.w = 3; this.h = 15; this.dmg = 16; this.color = '#00e5ff'; this.gc = '#00aaff';
            }
        } else {
            switch (type) {
                case 'big': this.w = 8; this.h = 18; this.dmg = 20; this.color = '#ff6600'; this.gc = '#ff4400'; break;
                default: this.w = 4; this.h = 12; this.dmg = 10; this.color = '#ff4444'; this.gc = '#ff0000';
            }
        }
    }
    isOffscreen(c) { return this.y < -this.h - 10 || this.y > c.height + 10 || this.x < -20 || this.x > c.width + 20; }
    draw(ctx) {
        ctx.save(); ctx.shadowBlur = 12; ctx.shadowColor = this.gc;
        if (this.owner === 'player') {
            const g = ctx.createLinearGradient(this.x, this.y, this.x, this.y + this.h);
            g.addColorStop(0, this.color); g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
        } else { ctx.fillStyle = this.color; }
        ctx.fillRect(this.x - this.w / 2, this.y, this.w, this.h);
        ctx.restore();
    }
}

/* ────────────────────────────────────────────────────────────────
   ENNEMIS
──────────────────────────────────────────────────────────────── */
class Enemy {
    constructor(x, y, type, tier = 1) {
        this.x = x; this.y = y; this.type = type; this.tier = tier;
        this._setup(type, tier);
        this.fireTimer = Utils.randInt(50, 150);
        this.animTimer = 0; this.hitFlash = 0;
    }

    _setup(type, tier) {
        // Multiplicateur croissant avec le palier
        const m = 1.0 + (tier - 1) * 0.22;
        switch (type) {
            case 'grunt':
                this.w = 34; this.h = 28; this.hp = this.maxHp = Math.round(20 * m);
                this.speed = Utils.rand(1.2, 2.2) * m; this.score = 10; this.color = '#ff4444';
                this.shoots = tier >= 3; this.fireRate = 160; this.pattern = 'straight'; break;
            case 'zigzag':
                this.w = 30; this.h = 26; this.hp = this.maxHp = Math.round(25 * m);
                this.speed = Utils.rand(1.6, 2.8) * m; this.score = 20; this.color = '#ffaa00';
                this.shoots = tier >= 4; this.fireRate = 130; this.pattern = 'zigzag';
                this.zigDir = 1; this.zigTimer = Utils.randInt(26, 52); break;
            case 'tank':
                this.w = 50; this.h = 42; this.hp = this.maxHp = Math.round(80 * m);
                this.speed = Utils.rand(0.6, 1.2) * m; this.score = 40; this.color = '#8855ff';
                this.shoots = true; this.fireRate = 100; this.pattern = 'straight'; break;
            case 'speeder':
                this.w = 24; this.h = 20; this.hp = this.maxHp = Math.round(15 * m);
                this.speed = Utils.rand(4.5, 7.5) * m; this.score = 30; this.color = '#00ffcc';
                this.shoots = false; this.pattern = 'straight'; break;
            case 'shooter':
                this.w = 38; this.h = 32; this.hp = this.maxHp = Math.round(35 * m);
                this.speed = Utils.rand(0.7, 1.4); this.score = 35; this.color = '#ff0055';
                this.shoots = true; this.fireRate = 65; this.pattern = 'sway';
                this.swAmp = Utils.rand(55, 115); this.swFreq = Utils.rand(0.013, 0.024); this.swOrig = this.x; break;
            case 'miniboss':
                this.w = 70; this.h = 60; this.hp = this.maxHp = Math.round(300 * m);
                this.speed = Utils.rand(0.6, 1.2); this.score = 100; this.color = '#ff8800';
                this.shoots = true; this.fireRate = 52; this.pattern = 'sway';
                this.swAmp = 90; this.swFreq = 0.013; this.swOrig = this.x; break;
            case 'boss':
                this.w = 110; this.h = 90; this.hp = this.maxHp = Math.round(700 * m);
                this.speed = Utils.rand(0.4, 0.8); this.score = 300; this.color = '#ff0000';
                this.shoots = true; this.fireRate = 36; this.pattern = 'boss'; this.phase = 1; break;
        }
    }

    takeDamage(dmg) {
        this.hp = Math.max(0, this.hp - dmg); this.hitFlash = 8;
        if (this.type === 'boss' && this.hp < this.maxHp / 2) this.phase = 2;
        return this.hp <= 0;
    }

    update(canvas, time) {
        this.animTimer++; if (this.hitFlash > 0) this.hitFlash--; if (this.fireTimer > 0) this.fireTimer--;
        switch (this.pattern) {
            case 'straight': this.y += this.speed; break;
            case 'zigzag':
                this.y += this.speed * 0.8; this.x += this.speed * this.zigDir * 2;
                if (--this.zigTimer <= 0) { this.zigDir *= -1; this.zigTimer = Utils.randInt(26, 62); }
                if (this.x < 0) { this.x = 0; this.zigDir = 1; }
                if (this.x > canvas.width - this.w) { this.x = canvas.width - this.w; this.zigDir = -1; }
                break;
            case 'sway':
                this.y += this.speed;
                this.x = Utils.clamp(this.swOrig + Math.sin(time * this.swFreq) * this.swAmp, 0, canvas.width - this.w); break;
            case 'boss':
                if (this.y < 60) { this.y += 1.8; }
                else {
                    this.x += this.speed * (this.phase === 2 ? 2.4 : 1);
                    if (this.x <= 0 || this.x >= canvas.width - this.w) this.speed *= -1;
                    if (this.phase === 2) this.y = 60 + Math.sin(this.animTimer * 0.022) * 32;
                }
                break;
        }
    }

    tryFire() {
        if (!this.shoots || this.fireTimer > 0) return [];
        this.fireTimer = this.fireRate;
        const cx = this.x + this.w / 2, by = this.y + this.h, B = [];
        if (this.type === 'boss') {
            const spread = this.phase === 2 ? [-2, -1, 0, 1, 2] : [-1, 0, 1];
            spread.forEach(i => B.push(new Bullet(cx + i * 20, by, i * 2, 5 + Math.abs(i) * .4, 'enemy', 'big')));
            if (this.phase === 2) B.push(new Bullet(cx, by, 0, 7, 'enemy', 'big'));
        } else if (this.type === 'miniboss') {
            [-20, 0, 20].forEach(dx => B.push(new Bullet(cx + dx, by, dx / 20, 5.5, 'enemy', 'big')));
        } else if (this.type === 'tank') {
            B.push(new Bullet(cx, by, 0, 4.5, 'enemy', 'big'));
        } else {
            B.push(new Bullet(cx, by, 0, 4.5, 'enemy'));
        }
        return B;
    }

    isOffscreen(canvas) { return this.y > canvas.height + this.h + 20; }

    draw(ctx, slowActive) {
        const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
        ctx.save();
        if (this.hitFlash > 0) ctx.filter = 'brightness(3.5) saturate(0)';
        const col = slowActive ? '#4499ff' : this.color;
        ctx.shadowBlur = 20; ctx.shadowColor = col;
        switch (this.type) {
            case 'grunt': this._dGrunt(ctx, cx, col); break;
            case 'zigzag': this._dZigzag(ctx, cx, cy, col); break;
            case 'tank': this._dTank(ctx, cx, cy, col); break;
            case 'speeder': this._dSpeeder(ctx, cx, cy, col); break;
            case 'shooter': this._dShooter(ctx, cx, cy, col); break;
            case 'miniboss': this._dMiniboss(ctx, cx, cy, col); break;
            case 'boss': this._dBoss(ctx, cx, cy, col); break;
        }
        if (['boss', 'miniboss', 'tank'].includes(this.type)) {
            const r = this.hp / this.maxHp;
            ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(this.x, this.y - 12, this.w, 6);
            ctx.fillStyle = r > .5 ? '#00ff88' : r > .25 ? '#ffaa00' : '#ff2200';
            ctx.fillRect(this.x, this.y - 12, this.w * r, 6);
            ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1; ctx.strokeRect(this.x, this.y - 12, this.w, 6);
        }
        ctx.restore();
    }

    _dGrunt(ctx, cx, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(cx, this.y + this.h); ctx.lineTo(cx - this.w / 2, this.y); ctx.lineTo(cx + this.w / 2, this.y); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#220000'; ctx.beginPath(); ctx.ellipse(cx, this.y + this.h / 2 - 2, 6, 5, 0, 0, Math.PI * 2); ctx.fill(); }
    _dZigzag(ctx, cx, cy, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(cx, this.y); ctx.lineTo(cx + this.w / 2, cy); ctx.lineTo(cx, this.y + this.h); ctx.lineTo(cx - this.w / 2, cy); ctx.closePath(); ctx.fill(); ctx.save(); ctx.translate(cx, cy); ctx.rotate(this.animTimer * 0.05); ctx.strokeStyle = 'rgba(255,200,0,.45)'; ctx.lineWidth = 1; ctx.strokeRect(-10, -10, 20, 20); ctx.restore(); }
    _dTank(ctx, cx, cy, col) { ctx.fillStyle = '#221133'; ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 - Math.PI / 6; i ? ctx.lineTo(cx + Math.cos(a) * this.w / 2, cy + Math.sin(a) * this.h / 2) : ctx.moveTo(cx + Math.cos(a) * this.w / 2, cy + Math.sin(a) * this.h / 2); } ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = col; ctx.fillRect(cx - 5, cy, 10, this.h / 2 + 6); ctx.fillRect(cx - 3, cy + this.h / 2, 6, 12); }
    _dSpeeder(ctx, cx, cy, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(cx, this.y + this.h); ctx.lineTo(cx - 5, this.y + 4); ctx.lineTo(cx, this.y); ctx.lineTo(cx + 5, this.y + 4); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 0.3 + 0.2 * Math.sin(this.animTimer * 0.3); for (let i = 1; i <= 3; i++) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy + i * 8, 3 - i * .5, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1; }
    _dShooter(ctx, cx, cy, col) { ctx.fillStyle = '#111'; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, this.y); ctx.lineTo(cx + this.w / 2, this.y + this.h * .6); ctx.lineTo(cx + this.w * .3, this.y + this.h); ctx.lineTo(cx - this.w * .3, this.y + this.h); ctx.lineTo(cx - this.w / 2, this.y + this.h * .6); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = col; ctx.fillRect(cx - this.w * .3 - 3, this.y + this.h * .5, 6, this.h * .4); ctx.fillRect(cx + this.w * .3 - 3, this.y + this.h * .5, 6, this.h * .4); const p = 0.4 + 0.3 * Math.sin(this.animTimer * 0.1); ctx.globalAlpha = p; const cg = ctx.createRadialGradient(cx, cy, 1, cx, cy, 14); cg.addColorStop(0, col); cg.addColorStop(1, 'transparent'); ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    _dMiniboss(ctx, cx, cy, col) { ctx.fillStyle = '#221100'; ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, this.y); ctx.lineTo(cx + this.w / 2, this.y + 20); ctx.lineTo(cx + this.w / 2, this.y + this.h - 10); ctx.lineTo(cx, this.y + this.h); ctx.lineTo(cx - this.w / 2, this.y + this.h - 10); ctx.lineTo(cx - this.w / 2, this.y + 20); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = col; ctx.fillRect(cx - this.w / 2 - 10, this.y + 20, 14, 30); ctx.fillRect(cx + this.w / 2 - 4, this.y + 20, 14, 30); const p = 0.5 + 0.5 * Math.sin(this.animTimer * 0.15); ctx.globalAlpha = p; ctx.shadowBlur = 30; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy, 14 + p * 4, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    _dBoss(ctx, cx, cy, col) { const p = 0.5 + 0.5 * Math.sin(this.animTimer * 0.1); ctx.fillStyle = '#1a0000'; ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx, this.y); ctx.lineTo(cx + this.w * .4, this.y + 20); ctx.lineTo(cx + this.w / 2, this.y + 36); ctx.lineTo(cx + this.w / 2, this.y + this.h - 15); ctx.lineTo(cx + this.w * .3, this.y + this.h); ctx.lineTo(cx - this.w * .3, this.y + this.h); ctx.lineTo(cx - this.w / 2, this.y + this.h - 15); ctx.lineTo(cx - this.w / 2, this.y + 36); ctx.lineTo(cx - this.w * .4, this.y + 20); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#330000'; ctx.beginPath(); ctx.moveTo(cx - this.w * .4, this.y + 32); ctx.lineTo(cx - this.w * .82, this.y + 10); ctx.lineTo(cx - this.w * .92, this.y + 52); ctx.lineTo(cx - this.w * .5, this.y + this.h - 20); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(cx + this.w * .4, this.y + 32); ctx.lineTo(cx + this.w * .82, this.y + 10); ctx.lineTo(cx + this.w * .92, this.y + 52); ctx.lineTo(cx + this.w * .5, this.y + this.h - 20); ctx.closePath(); ctx.fill(); ctx.fillStyle = col;[-30, 0, 30].forEach(dx => ctx.fillRect(cx + dx - 4, this.y + this.h - 5, 8, 20)); ctx.fillRect(cx - 6, this.y + this.h - 5, 12, 22); ctx.globalAlpha = 0.6 + 0.4 * p; ctx.shadowBlur = 44; ctx.shadowColor = col; const cg = ctx.createRadialGradient(cx, cy - 10, 2, cx, cy - 10, 22 + p * 8); cg.addColorStop(0, '#fff'); cg.addColorStop(.3, col); cg.addColorStop(1, 'transparent'); ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy - 10, 22 + p * 8, 0, Math.PI * 2); ctx.fill(); if (this.phase === 2) { ctx.globalAlpha = 0.14 + 0.1 * p; ctx.fillStyle = '#ff0000'; ctx.beginPath(); ctx.arc(cx, cy, this.w * .72, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1; }
}

/* ────────────────────────────────────────────────────────────────
   POWER-UPS
──────────────────────────────────────────────────────────────── */
const PU_CFG = {
    double: { color: '#00aaff', glow: '#0055ff', label: '2X', bg: '#0033aa', name: 'Double Laser' },
    triple: { color: '#cc44ff', glow: '#8800ff', label: '3X', bg: '#440088', name: 'Triple Shot' },
    shield: { color: '#00ffcc', glow: '#00ff88', label: '🛡', bg: '#004433', name: 'Bouclier' },
    laser: { color: '#ff4400', glow: '#ff2200', label: '⚡', bg: '#660000', name: 'Laser Puissant' },
    slow: { color: '#4488ff', glow: '#0044ff', label: '⏱', bg: '#001166', name: 'Ralenti Ennemis' },
};

class Powerup {
    constructor(x, y, type) {
        this.x = x; this.y = y; this.type = type;
        this.w = 28; this.h = 28; this.speed = 1.9;
        this.animTimer = 0; this.bob = Utils.rand(0, Math.PI * 2);
        const c = PU_CFG[type];
        this.color = c.color; this.glow = c.glow; this.label = c.label; this.bg = c.bg;
    }
    update() { this.y += this.speed; this.animTimer++; }
    isOffscreen(canvas) { return this.y > canvas.height + 40; }
    draw(ctx) {
        const bY = Math.sin(this.animTimer * 0.05 + this.bob) * 4, cx = this.x + 14, cy = this.y + 14 + bY;
        ctx.save(); ctx.shadowBlur = 20; ctx.shadowColor = this.glow;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(this.animTimer * 0.03);
        ctx.strokeStyle = this.color; ctx.lineWidth = 1; ctx.globalAlpha = .45;
        ctx.strokeRect(-16, -16, 32, 32); ctx.rotate(this.animTimer * 0.02); ctx.globalAlpha = .28;
        ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        ctx.fillStyle = this.bg; ctx.strokeStyle = this.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(cx - 14, cy - 14, 28, 28, 5); ctx.fill(); ctx.stroke();
        ctx.fillStyle = this.color;
        ctx.font = `bold ${this.label.length > 1 ? '11' : '14'}px Orbitron,monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(this.label, cx, cy);
        ctx.restore();
    }
}



/* ════════════════════════════════════════════════════════════════
   NOVA BLITZ — NovaAudio
   Moteur musical 100% Web Audio API (zéro fichier externe)

   Architecture :
   ┌─ MenuMusic  : drone ambient + arpège pad lent
   ├─ GameMusic  : boucle electro rythmique (basse + lead + perc)
   │              tempo adaptatif selon le palier (tier)
   ├─ GameOverFx : accord descendant dramatique
   └─ SFX pool   : shoot, explosion, coin, powerup, boss_alert
════════════════════════════════════════════════════════════════ */
class NovaAudio {
    constructor() {
        this._ctx = null;   // AudioContext (créé au premier geste)
        this._master = null;   // GainNode master
        this._muted = localStorage.getItem('nb3_muted') === '1';
        this._mode = null;   // 'menu' | 'game' | null
        this._nodes = [];     // noeuds actifs (pour cleanup)
        this._tier = 1;
        this._loopBars = 0;      // compteur de mesures pour la boucle jeu
        this._beatMs = 500;    // durée d'un temps (ms) à tier 1
        this._nextBeat = 0;      // timestamp du prochain beat Web Audio
        this._scheduleAhead = 0.12; // secondes d'avance pour le scheduler

        // Notes (fréquences en Hz) — gamme pentatonique mineure
        this._SCALE = [
            130.81, 155.56, 174.61, 196.00, 233.08,  // C3 Eb3 F3 G3 Bb3
            261.63, 311.13, 349.23, 392.00, 466.16,  // C4 Eb4 F4 G4 Bb4
            523.25, 622.25, 698.46,                   // C5 Eb5 F5
        ];
        // Patterns mélodiques (index dans _SCALE)
        this._LEAD_PATTERNS = [
            [0, 4, 2, 5, 3, 7, 5, 9],
            [2, 0, 4, 2, 7, 5, 9, 7],
            [5, 4, 2, 0, 7, 5, 4, 2],
            [9, 7, 5, 4, 2, 0, 2, 4],
        ];
        this._BASS_PATTERNS = [
            [0, 0, 5, 0, 3, 0, 5, 3],
            [0, 5, 0, 3, 5, 0, 3, 0],
            [3, 0, 5, 3, 0, 5, 7, 5],
        ];
        this._patternIdx = 0;
        this._bassPatIdx = 0;
        this._beatIdx = 0;

        // Bind du bouton mute
        const btn = document.getElementById('audio-toggle');
        if (btn) {
            this._updateBtn(btn);
            btn.addEventListener('click', () => this.toggleMute());
        }
    }

    /* ── Init AudioContext (doit être dans un geste utilisateur) ── */
    _init() {
        if (this._ctx) return;
        this._ctx = new (window.AudioContext || window.webkitAudioContext)();
        this._master = this._ctx.createGain();
        this._master.gain.value = this._muted ? 0 : 0.7;
        this._master.connect(this._ctx.destination);
    }

    /* ── Mute / Unmute ─────────────────────────────────────────── */
    toggleMute() {
        this._muted = !this._muted;
        localStorage.setItem('nb3_muted', this._muted ? '1' : '0');
        if (this._master) {
            this._master.gain.setTargetAtTime(this._muted ? 0 : 0.7, this._ctx.currentTime, 0.05);
        }
        const btn = document.getElementById('audio-toggle');
        if (btn) this._updateBtn(btn);
    }

    _updateBtn(btn) {
        btn.textContent = this._muted ? '🔇' : '🔊';
        btn.classList.toggle('muted', this._muted);
    }

    /* ── Stop tout ─────────────────────────────────────────────── */
    _stopAll() {
        this._nodes.forEach(n => { try { n.stop(); } catch { } });
        this._nodes = [];
        this._mode = null;
        if (this._schedTimer) { clearInterval(this._schedTimer); this._schedTimer = null; }
    }

    /* ─────────────────────────────────────────────────────────────
       MUSIQUE MENU — drone + arpège ambiant
    ───────────────────────────────────────────────────────────── */
    playMenu() {
        this._init();
        if (this._mode === 'menu') return;
        this._stopAll();
        this._mode = 'menu';

        const ac = this._ctx;

        // Drone de fond (oscillateur + LFO sur le volume)
        const drone = this._makeDrone(65.41, 0.14);   // C2
        const drone2 = this._makeDrone(98.00, 0.07);  // G2
        const drone3 = this._makeDrone(130.81, 0.05); // C3 légèrement désaccordé
        this._nodes.push(drone, drone2, drone3);

        // Pad doux (filtre passe-bas + réverb simulée)
        this._scheduleArp();
    }

    _makeDrone(freq, vol) {
        const ac = this._ctx;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        const lfo = ac.createOscillator();
        const lfog = ac.createGain();

        osc.type = 'sawtooth'; osc.frequency.value = freq + Math.random() * 0.5;
        lfo.type = 'sine'; lfo.frequency.value = 0.18 + Math.random() * 0.08;
        lfog.gain.value = 0.04;

        const filt = ac.createBiquadFilter();
        filt.type = 'lowpass'; filt.frequency.value = 800; filt.Q.value = 2;

        lfo.connect(lfog); lfog.connect(gain.gain);
        osc.connect(filt); filt.connect(gain); gain.connect(this._master);
        gain.gain.value = vol;
        osc.start(); lfo.start();
        return { stop() { try { osc.stop(); lfo.stop(); } catch { } } };
    }

    _scheduleArp() {
        // Arpège pentatonique lent en boucle (note toutes les 1.2s)
        const ARP_NOTES = [130.81, 155.56, 196.00, 233.08, 261.63, 233.08, 196.00, 155.56];
        let idx = 0;
        const play = () => {
            if (this._mode !== 'menu') return;
            const ac = this._ctx;
            const t = ac.currentTime;
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            const rev = this._makeReverb(1.8);

            osc.type = 'triangle'; osc.frequency.value = ARP_NOTES[idx % ARP_NOTES.length];
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.09, t + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);

            osc.connect(gain); gain.connect(rev); gain.connect(this._master);
            osc.start(t); osc.stop(t + 1.15);
            idx++;
            setTimeout(play, 1200);
        };
        play();
    }

    /* ─────────────────────────────────────────────────────────────
       MUSIQUE JEU — boucle electro rythmique schedulée
    ───────────────────────────────────────────────────────────── */
    playGame(tier = 1) {
        this._init();
        this._stopAll();
        this._mode = 'game';
        this._tier = tier;
        this._beatIdx = 0;
        this._patternIdx = 0;
        this._bassPatIdx = 0;
        this._loopBars = 0;
        this._updateTempo(tier);
        this._nextBeat = this._ctx.currentTime + 0.05;

        // Drone de fond continu (plus sombre que le menu)
        const dg = this._makeDrone(65.41, 0.06);
        this._nodes.push(dg);

        // Scheduler : toutes les 50ms on programme les prochaines notes
        this._schedTimer = setInterval(() => this._gameSched(), 50);
    }

    _updateTempo(tier) {
        // BPM : 90 au tier 1 → 140 au tier 10
        const bpm = 90 + (tier - 1) * 5.5;
        this._beatMs = (60 / bpm) * 1000;
    }

    setTier(tier) {
        if (tier === this._tier) return;
        this._tier = tier;
        this._updateTempo(tier);
        // Flash sonore de transition de palier
        this._sfxTierUp();
    }

    _gameSched() {
        if (this._mode !== 'game') return;
        const ac = this._ctx;
        const lookAhead = this._scheduleAhead; // secondes d'avance
        const beatSec = this._beatMs / 1000;

        while (this._nextBeat < ac.currentTime + lookAhead) {
            const t = this._nextBeat;
            const b = this._beatIdx % 8;  // 8 temps par mesure (8ème de note)

            this._schedBeat(t, b);
            this._nextBeat += beatSec / 2; // 8ème = demi-temps
            this._beatIdx++;

            // Toutes les 16 8èmes (= 2 mesures), on change de pattern
            if (this._beatIdx % 16 === 0) {
                this._loopBars++;
                if (this._loopBars % 4 === 0) {
                    this._patternIdx = (this._patternIdx + 1) % this._LEAD_PATTERNS.length;
                    this._bassPatIdx = (this._bassPatIdx + 1) % this._BASS_PATTERNS.length;
                }
            }
        }
    }

    _schedBeat(t, b) {
        const tier = this._tier;
        const beatS = this._beatMs / 1000 / 2; // durée d'un 8ème

        // ── KICK (temps forts 0 et 4) ─────────────────────────────
        if (b === 0 || b === 4) this._schedKick(t);

        // ── SNARE (temps 2 et 6) ──────────────────────────────────
        if (b === 2 || b === 6) this._schedSnare(t);

        // ── HI-HAT (tous les temps, plus présents avec tier) ──────
        const hhVol = 0.03 + tier * 0.008;
        this._schedHihat(t, hhVol, b % 2 === 0);

        // ── BASSE (pattern) ───────────────────────────────────────
        if (b % 2 === 0) {
            const pat = this._BASS_PATTERNS[this._bassPatIdx];
            const noteI = pat[Math.floor(b / 2) % pat.length];
            const freq = this._SCALE[noteI] / 4; // une octave plus bas que la gamme
            this._schedBass(t, freq, beatS * 1.8);
        }

        // ── LEAD mélodique (toutes les 8èmes) ─────────────────────
        const pat = this._LEAD_PATTERNS[this._patternIdx];
        const leadI = pat[this._beatIdx % pat.length];
        const leadF = this._SCALE[leadI];
        const leadV = 0.04 + tier * 0.003;
        this._schedLead(t, leadF, beatS * 0.85, leadV);

        // ── PAD d'accord (toutes les 8 8èmes) ────────────────────
        if (b === 0) {
            const rootF = this._SCALE[this._LEAD_PATTERNS[this._patternIdx][0]];
            this._schedPad(t, rootF, beatS * 8, 0.04 + tier * 0.002);
        }
    }

    /* ── Synthèse des instruments ─────────────────────────────── */

    _schedKick(t) {
        const ac = this._ctx;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.frequency.setValueAtTime(160, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.08);
        gain.gain.setValueAtTime(0.9, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        osc.connect(gain); gain.connect(this._master);
        osc.start(t); osc.stop(t + 0.25);
    }

    _schedSnare(t) {
        const ac = this._ctx;
        const noise = this._makeNoise(t, t + 0.14, 0.22);
        const filt = ac.createBiquadFilter();
        const gain = ac.createGain();
        filt.type = 'bandpass'; filt.frequency.value = 2200; filt.Q.value = 0.8;
        gain.gain.setValueAtTime(0.35, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
        noise.connect(filt); filt.connect(gain); gain.connect(this._master);
        // Ton du snare
        const osc = ac.createOscillator();
        const og = ac.createGain();
        osc.frequency.value = 200; og.gain.setValueAtTime(0.18, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
        osc.connect(og); og.connect(this._master); osc.start(t); osc.stop(t + 0.07);
    }

    _schedHihat(t, vol, open) {
        const ac = this._ctx;
        const noise = this._makeNoise(t, t + (open ? 0.08 : 0.025), 0.0);
        const filt = ac.createBiquadFilter();
        const gain = ac.createGain();
        filt.type = 'highpass'; filt.frequency.value = 7000;
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + (open ? 0.08 : 0.025));
        noise.connect(filt); filt.connect(gain); gain.connect(this._master);
    }

    _schedBass(t, freq, dur) {
        const ac = this._ctx;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        const filt = ac.createBiquadFilter();
        osc.type = 'sawtooth'; osc.frequency.value = freq;
        filt.type = 'lowpass'; filt.frequency.value = 600; filt.Q.value = 3;
        gain.gain.setValueAtTime(0.38, t);
        gain.gain.setValueAtTime(0.22, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(filt); filt.connect(gain); gain.connect(this._master);
        osc.start(t); osc.stop(t + dur + 0.01);
    }

    _schedLead(t, freq, dur, vol) {
        const ac = this._ctx;
        const osc = ac.createOscillator();
        const osc2 = ac.createOscillator(); // légère dissonance
        const gain = ac.createGain();
        const filt = ac.createBiquadFilter();
        osc.type = 'square'; osc.frequency.value = freq;
        osc2.type = 'square'; osc2.frequency.value = freq * 1.005;
        filt.type = 'lowpass'; filt.frequency.value = 2200 + (this._tier - 1) * 180; filt.Q.value = 1.5;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(vol, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gain); osc2.connect(gain); gain.connect(filt); filt.connect(this._master);
        osc.start(t); osc.stop(t + dur + 0.02);
        osc2.start(t); osc2.stop(t + dur + 0.02);
    }

    _schedPad(t, freq, dur, vol) {
        // Accord (root + tierce mineure + quinte)
        [[1, vol], [1.2, vol * 0.6], [1.5, vol * 0.5]].forEach(([ratio, v]) => {
            const ac = this._ctx;
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            const filt = ac.createBiquadFilter();
            osc.type = 'triangle'; osc.frequency.value = freq * ratio;
            filt.type = 'lowpass'; filt.frequency.value = 1200; filt.Q.value = 0.5;
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(v, t + 0.3);
            gain.gain.setValueAtTime(v, t + dur - 0.4);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            osc.connect(filt); filt.connect(gain); gain.connect(this._master);
            osc.start(t); osc.stop(t + dur + 0.01);
        });
    }

    /* ── Bruit blanc ─────────────────────────────────────────── */
    _makeNoise(tStart, tStop, vol) {
        const ac = this._ctx;
        const bufLen = Math.ceil((tStop - tStart) * ac.sampleRate) + 4096;
        const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const src = ac.createBufferSource();
        src.buffer = buf;
        src.start(tStart); src.stop(tStop + 0.01);
        return src;
    }

    /* ── Réverb simple (convolution approchée) ───────────────── */
    _makeReverb(dur) {
        const ac = this._ctx;
        const len = Math.ceil(dur * ac.sampleRate);
        const buf = ac.createBuffer(2, len, ac.sampleRate);
        for (let c = 0; c < 2; c++) {
            const d = buf.getChannelData(c);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
        }
        const conv = ac.createConvolver();
        conv.buffer = buf;
        conv.connect(this._master);
        return conv;
    }

    /* ─────────────────────────────────────────────────────────────
       GAME OVER — accord descendant dramatique
    ───────────────────────────────────────────────────────────── */
    playGameOver() {
        this._init();
        this._stopAll();
        this._mode = null;
        const ac = this._ctx;
        const t = ac.currentTime;

        // Crash de cymbale
        const noise = this._makeNoise(t, t + 1.2, 0);
        const nf = ac.createBiquadFilter(); nf.type = 'highpass'; nf.frequency.value = 3000;
        const ng = ac.createGain(); ng.gain.setValueAtTime(0.5, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
        noise.connect(nf); nf.connect(ng); ng.connect(this._master);

        // Accord descendant (3 oscillateurs)
        [[130.81, 0.25], [155.56, 0.18], [98.00, 0.22]].forEach(([freq, v], i) => {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, t + i * 0.05);
            osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + 2.5);
            gain.gain.setValueAtTime(v, t + i * 0.05);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
            const filt = ac.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 1200;
            osc.connect(filt); filt.connect(gain); gain.connect(this._master);
            osc.start(t + i * 0.05); osc.stop(t + 2.8);
        });
    }

    /* ─────────────────────────────────────────────────────────────
       SFX
    ───────────────────────────────────────────────────────────── */

    sfxShoot(fireMode = 'single') {
        if (!this._ctx || this._muted) return;
        const ac = this._ctx, t = ac.currentTime;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        const freqs = { single: [1200, 600], double: [900, 500], triple: [1400, 700], laser: [2000, 2200] };
        const [f1, f2] = freqs[fireMode] || freqs.single;
        osc.type = fireMode === 'laser' ? 'sawtooth' : 'square';
        osc.frequency.setValueAtTime(f1, t);
        osc.frequency.exponentialRampToValueAtTime(f2, t + 0.06);
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
        const filt = ac.createBiquadFilter(); filt.type = 'highpass'; filt.frequency.value = 800;
        osc.connect(filt); filt.connect(gain); gain.connect(this._master);
        osc.start(t); osc.stop(t + 0.08);
    }

    sfxExplosion(big = false) {
        if (!this._ctx) return;
        const ac = this._ctx, t = ac.currentTime;
        const dur = big ? 0.8 : 0.35;
        const noise = this._makeNoise(t, t + dur, 0);
        const filt = ac.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = big ? 800 : 1400;
        const gain = ac.createGain();
        gain.gain.setValueAtTime(big ? 0.7 : 0.4, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        noise.connect(filt); filt.connect(gain); gain.connect(this._master);
        // Boom basse
        const boom = ac.createOscillator(); const bg = ac.createGain();
        boom.frequency.setValueAtTime(big ? 80 : 120, t);
        boom.frequency.exponentialRampToValueAtTime(20, t + dur * 0.7);
        bg.gain.setValueAtTime(big ? 0.55 : 0.3, t); bg.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.7);
        boom.connect(bg); bg.connect(this._master); boom.start(t); boom.stop(t + dur);
    }

    sfxCoin() {
        if (!this._ctx) return;
        const ac = this._ctx, t = ac.currentTime;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, t);
        osc.frequency.exponentialRampToValueAtTime(1760, t + 0.07);
        gain.gain.setValueAtTime(0.14, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        osc.connect(gain); gain.connect(this._master);
        osc.start(t); osc.stop(t + 0.13);
    }

    sfxPowerup() {
        if (!this._ctx) return;
        const ac = this._ctx, t = ac.currentTime;
        [0, 0.08, 0.16].forEach((dt, i) => {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.type = 'sine';
            osc.frequency.value = 440 * Math.pow(1.26, i);
            gain.gain.setValueAtTime(0.18, t + dt);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.18);
            osc.connect(gain); gain.connect(this._master);
            osc.start(t + dt); osc.stop(t + dt + 0.2);
        });
    }

    sfxBossAlert() {
        if (!this._ctx) return;
        const ac = this._ctx, t = ac.currentTime;
        [0, 0.18, 0.36].forEach(dt => {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.type = 'sawtooth'; osc.frequency.value = 220;
            const lfo = ac.createOscillator(); const lfog = ac.createGain();
            lfo.frequency.value = 14; lfog.gain.value = 60;
            lfo.connect(lfog); lfog.connect(osc.frequency);
            gain.gain.setValueAtTime(0.28, t + dt);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.15);
            osc.connect(gain); gain.connect(this._master);
            osc.start(t + dt); osc.stop(t + dt + 0.16); lfo.start(t + dt); lfo.stop(t + dt + 0.16);
        });
    }

    sfxTierUp() { this._sfxTierUp(); }

    _sfxTierUp() {
        if (!this._ctx) return;
        const ac = this._ctx, t = ac.currentTime;
        [523.25, 659.25, 783.99].forEach((f, i) => {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.type = 'triangle'; osc.frequency.value = f;
            gain.gain.setValueAtTime(0.2, t + i * 0.1);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.1 + 0.3);
            osc.connect(gain); gain.connect(this._master);
            osc.start(t + i * 0.1); osc.stop(t + i * 0.1 + 0.32);
        });
    }
}

/* Global audio instance */
let Audio;

/* ────────────────────────────────────────────────────────────────
   SKINS — 5 vaisseaux débloquables avec des pièces
──────────────────────────────────────────────────────────────── */
const SKINS = [
    {
        id: 'classic', name: 'CLASSIC', cost: 0, locked: false,
        desc: 'Chasseur de base. Fiable et éprouvé.',
        hull: '#1a2a4a', hull2: '#2a3a6a', wing: '#0d1a3a',
        cockpit0: 'rgba(0,220,255,.9)', cockpit1: 'rgba(0,40,100,.3)',
        cannon: '#00aaff', flame0: 'rgba(0,200,255,.9)', flame1: 'rgba(0,0,200,0)',
        glow: '#00aaff', badge: '⬡',
    },
    {
        id: 'phoenix', name: 'PHOENIX', cost: 30, locked: true,
        desc: 'Né des flammes. Brûle tout sur son passage.',
        hull: '#3a1a0a', hull2: '#5a2a0a', wing: '#2a0a00',
        cockpit0: 'rgba(255,140,0,.9)', cockpit1: 'rgba(120,20,0,.3)',
        cannon: '#ff6600', flame0: 'rgba(255,180,0,.9)', flame1: 'rgba(200,0,0,0)',
        glow: '#ff4400', badge: '🔥',
    },
    {
        id: 'viper', name: 'VIPER', cost: 60, locked: true,
        desc: 'Rapide et silencieux. Frappe avant que l\'ennemi réagisse.',
        hull: '#0a2a1a', hull2: '#0a3a1a', wing: '#001a0a',
        cockpit0: 'rgba(0,255,120,.9)', cockpit1: 'rgba(0,80,20,.3)',
        cannon: '#00ff88', flame0: 'rgba(0,255,80,.9)', flame1: 'rgba(0,100,0,0)',
        glow: '#00ff44', badge: '🐍',
    },
    {
        id: 'ghost', name: 'GHOST', cost: 100, locked: true,
        desc: 'Invisible jusqu\'à ce qu\'il soit trop tard.',
        hull: '#1a0a2a', hull2: '#2a1a4a', wing: '#0a0014',
        cockpit0: 'rgba(200,100,255,.9)', cockpit1: 'rgba(60,0,120,.3)',
        cannon: '#cc44ff', flame0: 'rgba(180,80,255,.9)', flame1: 'rgba(80,0,180,0)',
        glow: '#aa00ff', badge: '👻',
    },
    {
        id: 'nova', name: 'NOVA', cost: 200, locked: true,
        desc: 'Forgé d\'énergie pure. La limite ultime.',
        hull: '#2a2a0a', hull2: '#3a3a0a', wing: '#1a1a00',
        cockpit0: 'rgba(255,220,0,.9)', cockpit1: 'rgba(120,80,0,.3)',
        cannon: '#ffd700', flame0: 'rgba(255,200,0,.9)', flame1: 'rgba(200,100,0,0)',
        glow: '#ffd700', badge: '✦',
    },
];

// Retourne le skin actif depuis le store
function getActiveSkin() {
    const id = localStorage.getItem('nb3_skin') || 'classic';
    return SKINS.find(s => s.id === id) || SKINS[0];
}

/* ────────────────────────────────────────────────────────────────
   PIÈCES (Coins) — larguées par les ennemis
──────────────────────────────────────────────────────────────── */
class Coin {
    constructor(x, y, value = 1) {
        this.x = x; this.y = y; this.value = value;
        this.vx = Utils.rand(-1.2, 1.2);
        this.vy = Utils.rand(-2, -0.5);   // jaillissement vers le haut
        this.gravity = 0.12;
        this.speed = 1.6;
        this.animTimer = Utils.rand(0, Math.PI * 2);
        this.w = 16; this.h = 16;
        // Couleur selon valeur
        if (value >= 50) { this.color = '#ffd700'; this.glow = '#ffaa00'; }
        else if (value >= 15) { this.color = '#e0e0e0'; this.glow = '#aaaaff'; }
        else if (value >= 5) { this.color = '#cd7f32'; this.glow = '#ff8800'; }
        else { this.color = '#f0c040'; this.glow = '#ffdd00'; }
        this.phase = 'fall';  // 'fall' puis 'float'
        this.fallTimer = 28;
    }

    update() {
        this.animTimer += 0.08;
        if (this.phase === 'fall') {
            this.vx *= 0.92;
            this.vy += this.gravity;
            this.x += this.vx;
            this.y += this.vy;
            if (--this.fallTimer <= 0) { this.phase = 'float'; this.vy = 0; }
        } else {
            this.y += this.speed;
        }
    }

    isOffscreen(canvas) { return this.y > canvas.height + 30; }

    draw(ctx) {
        const bob = Math.sin(this.animTimer) * 2;
        const cx = this.x, cy = this.y + bob;
        const scaleX = 0.4 + 0.6 * Math.abs(Math.cos(this.animTimer * 1.4)); // rotation simulée
        ctx.save();
        ctx.shadowBlur = 14; ctx.shadowColor = this.glow;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.ellipse(cx, cy, this.w / 2 * scaleX, this.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        // Reflet
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.beginPath();
        ctx.ellipse(cx - 1, cy - 2, (this.w / 2 * scaleX) * 0.55, this.h / 4, -0.3, 0, Math.PI);
        ctx.fill();
        // Valeur si > 1
        if (this.value > 1 && scaleX > 0.5) {
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.font = `bold ${this.value >= 10 ? 7 : 8}px monospace`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(this.value, cx, cy + 0.5);
        }
        ctx.restore();
    }
}

/* ────────────────────────────────────────────────────────────────
   PALIERS — configuration du mode infini
  
  Chaque palier définit :
    • pool    : types d'ennemis disponibles avec poids (plus le poids est élevé, plus l'ennemi apparaît)
    • minPack : taille minimale de chaque vague
    • maxPack : taille maximale de chaque vague
    • spawnRate : intervalle en frames entre vagues (60 = 1s)
    • events  : liste d'événements spéciaux possibles à ce palier
──────────────────────────────────────────────────────────────── */
const TIER_CONFIG = [
  /* 1 */ { pool: [['grunt', 6]], minPack: 1, maxPack: 2, spawnRate: 80, events: [] },
  /* 2 */ { pool: [['grunt', 5], ['zigzag', 3]], minPack: 1, maxPack: 3, spawnRate: 72, events: ['rush'] },
  /* 3 */ { pool: [['grunt', 4], ['zigzag', 3], ['speeder', 2]], minPack: 2, maxPack: 3, spawnRate: 65, events: ['rush'] },
  /* 4 */ { pool: [['grunt', 3], ['zigzag', 3], ['speeder', 2], ['shooter', 2]], minPack: 2, maxPack: 4, spawnRate: 58, events: ['rush', 'powerup_rain'] },
  /* 5 */ { pool: [['grunt', 3], ['zigzag', 2], ['speeder', 2], ['shooter', 3], ['tank', 1]], minPack: 2, maxPack: 4, spawnRate: 52, events: ['rush', 'boss_drop'] },
  /* 6 */ { pool: [['grunt', 2], ['zigzag', 2], ['speeder', 3], ['shooter', 3], ['tank', 2]], minPack: 2, maxPack: 5, spawnRate: 45, events: ['rush', 'powerup_rain', 'boss_drop'] },
  /* 7 */ { pool: [['zigzag', 2], ['speeder', 3], ['shooter', 3], ['tank', 2], ['miniboss', 1]], minPack: 3, maxPack: 5, spawnRate: 40, events: ['rush', 'boss_drop'] },
  /* 8 */ { pool: [['speeder', 3], ['shooter', 3], ['tank', 2], ['miniboss', 2]], minPack: 3, maxPack: 6, spawnRate: 35, events: ['rush', 'powerup_rain', 'boss_drop'] },
  /* 9 */ { pool: [['shooter', 3], ['tank', 3], ['miniboss', 2], ['boss', 1]], minPack: 3, maxPack: 6, spawnRate: 28, events: ['rush', 'boss_drop'] },
  /*10 */ { pool: [['tank', 2], ['miniboss', 3], ['boss', 2]], minPack: 4, maxPack: 6, spawnRate: 22, events: ['rush', 'powerup_rain', 'boss_drop'] },
];

/* ────────────────────────────────────────────────────────────────
   MOTEUR DE JEU
──────────────────────────────────────────────────────────────── */
class GameEngine {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this._resize();

        this.state = 'menu';
        this.gameTime = 0;
        this.score = 0; this.kills = 0; this.combo = 1; this.comboTimer = 0;

        // Mode infini
        this.tier = 1;   // palier actuel (1-10)
        this.waveCount = 0;   // nombre de vagues lancées
        this.spawnTimer = 0;   // compteur entre vagues
        this.puSpawnTimer = 200; // compteur power-up passif
        this.nextEventIn = Utils.randInt(600, 1200); // frames avant prochain événement

        // Entités
        this.player = null;
        this.bullets = [];
        this.enemies = [];
        this.powerups = [];
        this.particles = new ParticleSystem();
        this.starField = new StarField(this.canvas);

        // Pièces
        this.coins = [];   // Coin objects en jeu
        this.coinTotal = parseInt(localStorage.getItem('nb3_coins') || '0');
        this.activeSkin = getActiveSkin();

        this.keys = {};
        this._setupInput();

        // Scores : chargés depuis l'API Python, avec fallback localStorage
        this.highScores = [];
        this._apiBase = `${location.protocol}//${location.hostname}:${location.port || 8080}`;
        this._serverOnline = false;
        this._checkServer();   // ping initial silencieux

        this.raf = null;
        this.loop = this.loop.bind(this);
        window.addEventListener('resize', () => this._resize());
    }

    /* ── Détection serveur ────────────────────────────────────────── */
    async _checkServer() {
        try {
            const r = await fetch(`${this._apiBase}/api/info`, { signal: AbortSignal.timeout(1200) });
            if (r.ok) {
                this._serverOnline = true;
                const data = await r.json();
                console.info(`[Nova Blitz] Serveur Python v${data.version} en ligne ✓`);
                await this._loadScoresFromServer();
            }
        } catch {
            this._serverOnline = false;
            // Fallback silencieux sur localStorage
            const local = localStorage.getItem('nb3_scores');
            if (local) {
                try { this.highScores = JSON.parse(local); } catch { this.highScores = []; }
            }
        }
    }

    async _loadScoresFromServer() {
        try {
            const r = await fetch(`${this._apiBase}/api/scores`);
            const data = await r.json();
            this.highScores = data.scores || [];
            // Mise à jour du cache local
            localStorage.setItem('nb3_scores', JSON.stringify(this.highScores));
        } catch {
            // Garder les scores déjà en mémoire
        }
    }

    /* ── Helpers ──────────────────────────────────────────────────── */
    _resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        if (this.starField) { this.starField.canvas = this.canvas; this.starField.init(); }
        if (this.player) {
            this.player.maxX = this.canvas.width - this.player.w;
            this.player.minY = Math.floor(this.canvas.height * 0.38);
            this.player.maxY = this.canvas.height - this.player.h - 10;
            this.player.x = Utils.clamp(this.player.x, 0, this.player.maxX);
            this.player.y = Utils.clamp(this.player.y, this.player.minY, this.player.maxY);
        }
    }

    _setupInput() {
        window.addEventListener('keydown', e => {
            this.keys[e.key] = true;
            if ((e.key === 'p' || e.key === 'P') && this.state === 'playing') this.pause();
            else if ((e.key === 'p' || e.key === 'P') && this.state === 'paused') this.resume();
            if (e.key === 'Escape' && (this.state === 'playing' || this.state === 'paused')) this.showMenu();
            if (e.key === ' ') e.preventDefault();
        });
        window.addEventListener('keyup', e => { this.keys[e.key] = false; });
    }

    _screen(name) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(`screen-${name}`).classList.add('active');
    }


    /* ── Écran Skins ──────────────────────────────────────────────── */
    showSkins() {
        this._screen('skins');
        this._renderSkinsScreen();
    }

    _renderSkinsScreen() {
        const grid = document.getElementById('skin-grid');
        if (!grid) return;
        const currentId = localStorage.getItem('nb3_skin') || 'classic';
        const ownedRaw = localStorage.getItem('nb3_owned_skins') || '["classic"]';
        const owned = JSON.parse(ownedRaw);

        grid.innerHTML = '';
        SKINS.forEach(skin => {
            const isOwned = owned.includes(skin.id);
            const isActive = skin.id === currentId;
            const canAfford = this.coinTotal >= skin.cost;

            const card = document.createElement('div');
            card.className = `skin-card${isActive ? ' skin-card--active' : ''}${!isOwned ? ' skin-card--locked' : ''}`;

            // Canvas preview
            const cv = document.createElement('canvas');
            cv.width = 80; cv.height = 100; cv.className = 'skin-preview-canvas';
            this._drawSkinPreview(cv.getContext('2d'), skin, cv.width, cv.height);

            const nameEl = document.createElement('div');
            nameEl.className = 'skin-name';
            nameEl.textContent = skin.badge + ' ' + skin.name;

            const descEl = document.createElement('div');
            descEl.className = 'skin-desc';
            descEl.textContent = skin.desc;

            const btnEl = document.createElement('button');
            btnEl.className = 'skin-btn';

            if (isOwned) {
                if (isActive) {
                    btnEl.textContent = '✓ ÉQUIPÉ';
                    btnEl.disabled = true;
                    btnEl.classList.add('skin-btn--equipped');
                } else {
                    btnEl.textContent = 'ÉQUIPER';
                    btnEl.onclick = () => {
                        localStorage.setItem('nb3_skin', skin.id);
                        this.activeSkin = skin;
                        this._renderSkinsScreen();
                    };
                }
            } else {
                btnEl.textContent = `⬡ ${skin.cost} pièces`;
                btnEl.classList.add(canAfford ? 'skin-btn--buy' : 'skin-btn--locked');
                if (canAfford) {
                    btnEl.onclick = () => {
                        if (this.coinTotal < skin.cost) return;
                        this.coinTotal -= skin.cost;
                        localStorage.setItem('nb3_coins', this.coinTotal);
                        owned.push(skin.id);
                        localStorage.setItem('nb3_owned_skins', JSON.stringify(owned));
                        localStorage.setItem('nb3_skin', skin.id);
                        this.activeSkin = skin;
                        this._renderSkinsScreen();
                    };
                } else {
                    btnEl.disabled = true;
                    btnEl.title = `Manque ${skin.cost - this.coinTotal} pièces`;
                }
            }

            card.append(cv, nameEl, descEl, btnEl);
            grid.appendChild(card);
        });

        // Compteur de pièces dans l'écran skins
        const cEl = document.getElementById('skin-coin-count');
        if (cEl) cEl.textContent = this.coinTotal;
    }

    _drawSkinPreview(ctx, skin, W, H) {
        // Fond
        ctx.fillStyle = 'rgba(2,6,28,0.0)';
        ctx.clearRect(0, 0, W, H);

        const cx = W / 2, top = 10;
        const w = 36, h = 46;
        const anim = performance.now() / 600;

        // Flamme
        ctx.save();
        ctx.shadowBlur = 12; ctx.shadowColor = skin.glow;
        const fH = 10 + 5 * Math.sin(anim);
        const fg = ctx.createLinearGradient(cx, top + h, cx, top + h + fH);
        fg.addColorStop(0, skin.flame0); fg.addColorStop(1, skin.flame1);
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.moveTo(cx - 6, top + h - 2); ctx.lineTo(cx + 6, top + h - 2);
        ctx.lineTo(cx + 3, top + h + fH); ctx.lineTo(cx - 3, top + h + fH);
        ctx.closePath(); ctx.fill();
        ctx.restore();

        // Fuselage
        ctx.save();
        ctx.shadowBlur = 12; ctx.shadowColor = skin.glow;
        ctx.fillStyle = skin.hull;
        ctx.beginPath();
        ctx.moveTo(cx, top); ctx.lineTo(cx + 9, top + 16); ctx.lineTo(cx + 18, top + h - 3);
        ctx.lineTo(cx - 18, top + h - 3); ctx.lineTo(cx - 9, top + 16); ctx.closePath(); ctx.fill();

        ctx.fillStyle = skin.hull2;
        ctx.beginPath(); ctx.moveTo(cx, top + 3); ctx.lineTo(cx + 5, top + 17); ctx.lineTo(cx - 5, top + 17); ctx.closePath(); ctx.fill();

        // Ailes
        ctx.fillStyle = skin.wing;
        ctx.beginPath(); ctx.moveTo(cx - 8, top + 16); ctx.lineTo(cx - 18, top + h); ctx.lineTo(cx - 6, top + h - 5); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx + 8, top + 16); ctx.lineTo(cx + 18, top + h); ctx.lineTo(cx + 6, top + h - 5); ctx.closePath(); ctx.fill();

        // Canon
        ctx.fillStyle = skin.cannon;
        ctx.fillRect(cx - 2, top - 1, 4, 11);

        // Cockpit
        const cg = ctx.createRadialGradient(cx, top + 11, 1, cx, top + 11, 6);
        cg.addColorStop(0, skin.cockpit0); cg.addColorStop(1, skin.cockpit1);
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.ellipse(cx, top + 11, 5, 7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        // Nom du skin en dessous
        ctx.fillStyle = skin.cannon;
        ctx.font = 'bold 7px Orbitron,monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(skin.name, cx, top + h + fH + 6);
    }

    /* ── Navigation ───────────────────────────────────────────────── */
    showMenu() {
        this.state = 'menu';
        if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
        this._screen('menu');
        if (typeof Audio !== 'undefined') Audio.playMenu();
    }
    showInstructions() { this._screen('instructions'); }
    showHighScores() {
        this._screen('scores');
        const list = document.getElementById('scores-list');
        list.innerHTML = '<div class="scores-empty">Chargement…</div>';

        const render = (scores) => {
            if (!scores.length) {
                list.innerHTML = '<div class="scores-empty">Aucun score enregistré</div>'; return;
            }
            const rc = i => i === 0 ? 'g' : i === 1 ? 's' : i === 2 ? 'b' : '';
            const medals = ['🥇', '🥈', '🥉'];
            list.innerHTML = scores.slice(0, 10).map((s, i) => `
        <div class="score-entry">
          <span class="sc-rank ${rc(i)}">${medals[i] || '#' + (i + 1)}</span>
          <span class="sc-label">${(s.player_name || '')} · Palier ${s.tier || 1} · Vague ${s.waves || 0}</span>
          <span class="sc-pts">${s.score}</span>
          <span class="sc-date">${s.date || ''}</span>
        </div>`).join('');
        };
        if (this._serverOnline) {
            fetch(this._apiBase + '/api/scores')
                .then(r => r.json())
                .then(d => { this.highScores = d.scores || []; render(this.highScores); })
                .catch(() => render(this.highScores));
        } else {
            render(this.highScores);
        }
    }

    startGame() { this._startGame(); }
    restart() { this._startGame(); }

    /* ── Démarrage ────────────────────────────────────────────────── */
    _startGame() {
        this.score = 0; this.kills = 0; this.combo = 1; this.comboTimer = 0;
        this.gameTime = 0;
        this.tier = 1; this.waveCount = 0;
        this.spawnTimer = 30;  // première vague dès 0.5s
        this.puSpawnTimer = 200;
        this.nextEventIn = Utils.randInt(700, 1400);
        this.bullets = []; this.enemies = []; this.powerups = [];
        this.particles = new ParticleSystem();
        this.coins = [];
        this.activeSkin = getActiveSkin();
        this.player = new Player(this.canvas, this.activeSkin);

        this.state = 'playing';
        this._screen('game');
        document.getElementById('overlay-pause').style.display = 'none';
        this._updateHUD();
        if (typeof Audio !== 'undefined') Audio.playGame(1);
        if (this.raf) cancelAnimationFrame(this.raf);
        this.raf = requestAnimationFrame(this.loop);
    }

    /* ── Boucle ───────────────────────────────────────────────────── */
    loop() {
        if (this.state !== 'playing') return;
        this._update();
        this._draw();
        this.raf = requestAnimationFrame(this.loop);
    }

    _update() {
        this.gameTime++;

        // Score de survie : +2 pts / seconde
        if (this.gameTime % 30 === 0) this.score++;

        // Palier : change toutes les 1200 frames (20s)
        const newTier = Math.min(10, 1 + Math.floor(this.gameTime / 1200));
        if (newTier > this.tier) {
            this.tier = newTier;
            this._announceTier(this.tier);
            if (typeof Audio !== 'undefined') Audio.setTier(this.tier);
        }

        if (this.comboTimer > 0 && --this.comboTimer <= 0) this.combo = 1;

        const slowM = this.player?.slowActive ? 0.3 : 1;
        this.starField.update(slowM);
        this.player.update(this.keys);

        if (this.keys[' '] || this.keys['Space']) this.bullets.push(...this.player.tryFire());

        this._spawnWave(slowM);
        this._spawnPowerups(slowM);
        this._tickEvents(slowM);

        // ── Balles
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            const sm = b.owner === 'enemy' && this.player.slowActive ? 0.3 : 1;
            b.x += b.vx * sm; b.y += b.vy * sm;
            if (b.isOffscreen(this.canvas)) { this.bullets.splice(i, 1); continue; }
            if (b.owner === 'enemy') {
                if (Utils.circleRect(b.x, b.y + b.h / 2, b.w, this.player.x + 4, this.player.y + 4, this.player.w - 8, this.player.h - 8)) {
                    const dead = this.player.takeDamage(b.dmg);
                    this.particles.hit(b.x, b.y); this.bullets.splice(i, 1);
                    if (dead) { this._gameOver(); return; } continue;
                }
            } else {
                let hit = false;
                for (let j = this.enemies.length - 1; j >= 0; j--) {
                    const e = this.enemies[j];
                    if (Utils.circleRect(b.x, b.y, b.h / 2, e.x, e.y, e.w, e.h)) {
                        this.particles.hit(b.x, b.y); hit = true;
                        if (e.takeDamage(b.dmg)) this._killEnemy(e, j);
                        break;
                    }
                }
                if (hit) this.bullets.splice(i, 1);
            }
        }

        // ── Ennemis
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            const origSpeed = e.speed;
            if (this.player.slowActive) e.speed *= 0.3;
            e.update(this.canvas, this.gameTime);
            e.speed = origSpeed;
            this.bullets.push(...e.tryFire());
            if (Utils.circleRect(e.x + e.w / 2, e.y + e.h / 2, Math.min(e.w, e.h) / 2 * .7, this.player.x + 4, this.player.y + 4, this.player.w - 8, this.player.h - 8)) {
                const dead = this.player.takeDamage(22);
                this.particles.explosion(e.x + e.w / 2, e.y + e.h / 2, e.color);
                this.enemies.splice(i, 1);
                if (dead) { this._gameOver(); return; } continue;
            }
            if (e.isOffscreen(this.canvas)) this.enemies.splice(i, 1);
        }

        // ── Power-ups
        for (let i = this.powerups.length - 1; i >= 0; i--) {
            const pu = this.powerups[i];
            pu.update();
            if (pu.isOffscreen(this.canvas)) { this.powerups.splice(i, 1); continue; }
            if (Utils.circleRect(pu.x + 14, pu.y + 14, 14, this.player.x, this.player.y, this.player.w, this.player.h)) {
                this.player.applyPowerup(pu.type);
                this.particles.pickup(pu.x + 14, pu.y + 14, pu.color);
                this.score += 10;
                if (typeof Audio !== 'undefined') Audio.sfxPowerup();
                this.powerups.splice(i, 1);
            }
        }

        // ── Pièces
        for (let i = this.coins.length - 1; i >= 0; i--) {
            const c = this.coins[i];
            c.update();
            if (c.isOffscreen(this.canvas)) { this.coins.splice(i, 1); continue; }
            // Pickup (rayon 20px)
            if (Math.hypot(c.x - (this.player.x + this.player.w / 2), c.y - (this.player.y + this.player.h / 2)) < 22) {
                this.coinTotal += c.value;
                localStorage.setItem('nb3_coins', this.coinTotal);
                this.particles.pickup(c.x, c.y, c.color);
                if (typeof Audio !== 'undefined') Audio.sfxCoin();
                this.coins.splice(i, 1);
            }
        }

        this.particles.update();
        this._updateHUD();
    }

    /* ── Spawn de vague ───────────────────────────────────────────── */
    _spawnWave(slowM) {
        this.spawnTimer -= slowM;
        if (this.spawnTimer > 0) return;

        const cfg = TIER_CONFIG[this.tier - 1];
        this.spawnTimer = cfg.spawnRate;
        this.waveCount++;

        // Tirage pondéré du type d'ennemi
        const pick = () => {
            const total = cfg.pool.reduce((s, [, w]) => s + w, 0);
            let r = Math.random() * total;
            for (const [t, w] of cfg.pool) { r -= w; if (r <= 0) return t; }
            return cfg.pool[0][0];
        };

        const count = Utils.randInt(cfg.minPack, cfg.maxPack);
        const W = this.canvas.width;

        // Formations selon le nombre d'ennemis
        const positions = this._formation(count, W);
        positions.forEach((px, i) => {
            const type = pick();
            // Délai d'entrée échelonné
            setTimeout(() => {
                if (this.state === 'playing')
                    this.enemies.push(new Enemy(px, -60 - i * 18, type, this.tier));
            }, i * 120);
        });

        // Power-up garanti toutes les 8 vagues
        if (this.waveCount % 8 === 0) this._dropPowerup();
    }

    /* ── Formations d'entrée ──────────────────────────────────────── */
    _formation(count, W) {
        const margin = 60;
        const usable = W - margin * 2;
        const patterns = ['spread', 'cluster', 'sides', 'center'];
        const pat = patterns[Utils.randInt(0, patterns.length - 1)];

        if (count === 1) return [W / 2 + Utils.rand(-80, 80)];

        switch (pat) {
            case 'spread': {
                const step = usable / (count - 1);
                return Array.from({ length: count }, (_, i) => margin + step * i + Utils.rand(-12, 12));
            }
            case 'cluster': {
                const cx = Utils.rand(W * 0.25, W * 0.75);
                return Array.from({ length: count }, () => Utils.clamp(cx + Utils.rand(-55, 55), margin, W - margin));
            }
            case 'sides': {
                const half = Math.ceil(count / 2);
                const left = Array.from({ length: half }, (_, i) => margin + i * 30 + Utils.rand(-8, 8));
                const right = Array.from({ length: count - half }, (_, i) => W - margin - i * 30 + Utils.rand(-8, 8));
                return [...left, ...right];
            }
            default: {
                const cx = W / 2;
                return Array.from({ length: count }, (_, i) => cx + (i - (count - 1) / 2) * 50 + Utils.rand(-10, 10));
            }
        }
    }

    /* ── Événements spéciaux ──────────────────────────────────────── */
    _tickEvents(slowM) {
        this.nextEventIn -= slowM;
        if (this.nextEventIn > 0) return;
        this.nextEventIn = Utils.randInt(800, 1800);

        const cfg = TIER_CONFIG[this.tier - 1];
        if (!cfg.events.length) return;

        const evt = cfg.events[Utils.randInt(0, cfg.events.length - 1)];
        this._triggerEvent(evt);
    }

    _triggerEvent(evt) {
        const W = this.canvas.width;
        switch (evt) {
            // RUÉE : vague soudaine de 6-10 grognards rapides
            case 'rush': {
                this._showEvent('⚡ RUÉE !', '#ff4400');
                const n = Utils.randInt(6, 10);
                for (let i = 0; i < n; i++) {
                    setTimeout(() => {
                        if (this.state === 'playing')
                            this.enemies.push(new Enemy(Utils.rand(40, W - 60), -50, 'speeder', this.tier));
                    }, i * 80);
                }
                break;
            }
            // PLUIE DE POWER-UPS : 3 power-ups tombent en même temps
            case 'powerup_rain': {
                this._showEvent('✦ PLUIE DE BONUS !', '#00e5ff');
                const types = ['double', 'triple', 'shield', 'laser', 'slow'];
                for (let i = 0; i < 3; i++) {
                    setTimeout(() => {
                        if (this.state === 'playing')
                            this.powerups.push(new Powerup(Utils.rand(40, W - 60), -30, types[Utils.randInt(0, 4)]));
                    }, i * 300);
                }
                break;
            }
            // DÉBARQUEMENT BOSS : un boss / miniboss surgit immédiatement
            case 'boss_drop': {
                const isBoss = this.tier >= 8 && Math.random() < 0.35;
                const type = isBoss ? 'boss' : 'miniboss';
                this._showEvent(isBoss ? '💀 BOSS SURGIT !' : '⚠ MINIBOSS !', '#ff0000');
                this.enemies.push(new Enemy(W / 2 - (isBoss ? 55 : 35), -100, type, this.tier));
                if (typeof Audio !== 'undefined') Audio.sfxBossAlert();
                break;
            }
        }
    }

    /* ── Drop de power-up passif ──────────────────────────────────── */
    _spawnPowerups(slowM) {
        this.puSpawnTimer -= slowM;
        if (this.puSpawnTimer > 0) return;
        this.puSpawnTimer = Utils.randInt(480, 780);
        this._dropPowerup();
    }

    _dropPowerup() {
        const types = ['double', 'triple', 'shield', 'laser', 'slow'];
        this.powerups.push(new Powerup(Utils.rand(30, this.canvas.width - 60), -30, types[Utils.randInt(0, 4)]));
    }

    /* ── Kill ennemi ──────────────────────────────────────────────── */
    _killEnemy(enemy, idx) {
        const big = ['boss', 'miniboss', 'tank'].includes(enemy.type);
        this.particles.explosion(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, enemy.color, big);
        if (typeof Audio !== 'undefined') Audio.sfxExplosion(big);
        this.enemies.splice(idx, 1);
        this.kills++;
        const pts = Math.round(enemy.score * this.combo);
        this.score += pts;
        this.combo = Math.min(8, this.combo + 0.5);
        this.comboTimer = 200;
        // Drop power-up sur boss/miniboss (garanti)
        const dc = enemy.type === 'boss' ? 1 : enemy.type === 'miniboss' ? .7 : 0.12;
        if (Math.random() < dc) this._dropPowerup();
        // Drop pièces
        const coinVal = { grunt: 1, zigzag: 2, speeder: 2, tank: 5, shooter: 3, miniboss: 15, boss: 50 }[enemy.type] || 1;
        const dropChance = ['boss', 'miniboss'].includes(enemy.type) ? 1 : 0.82;
        if (Math.random() < dropChance) {
            const cx = enemy.x + enemy.w / 2, cy = enemy.y + enemy.h / 2;
            if (coinVal >= 10) {
                // Boss/miniboss : explosion de pièces
                const n = enemy.type === 'boss' ? 8 : 4;
                for (let i = 0; i < n; i++) this.coins.push(new Coin(cx + Utils.rand(-30, 30), cy + Utils.rand(-20, 20), Math.ceil(coinVal / n)));
            } else {
                this.coins.push(new Coin(cx, cy, coinVal));
            }
        }
    }

    /* ── Annonces ─────────────────────────────────────────────────── */
    _announceTier(tier) {
        const names = ['', 'DÉBUTANT', 'APPRENTI', 'COMBATTANT', 'CHASSEUR', 'ÉLITE', 'VÉTÉRAN', 'COMMANDO', 'LÉGENDE', 'HÉROS', 'DIEU DE LA GUERRE'];
        const descs = ['', 'Survivez coûte que coûte.', 'Les ennemis s\'échauffent.', 'Le danger s\'intensifie.', 'Les rangs se resserrent.', 'Terrain hostile.', 'Aucune pitié.', 'Les boss arrivent.', 'Chaos total.', 'Limite du possible.', 'Vous n\'auriez pas dû être encore en vie.'];
        const el = document.getElementById('tier-announce');
        el.innerHTML = `
      <div class="tier-announce-sub">PALIER ${tier} ATTEINT</div>
      <div class="tier-announce-main">${names[tier] || '???'}</div>
      <div class="tier-announce-desc">${descs[tier] || ''}</div>`;
        el.style.display = 'block'; el.style.animation = 'none';
        void el.offsetWidth;
        el.style.animation = 'tierAnim 3s ease-out forwards';
        setTimeout(() => { el.style.display = 'none'; }, 3100);
    }

    _showEvent(text, color) {
        const el = document.getElementById('event-announce');
        el.textContent = text; el.style.color = color;
        el.style.textShadow = `0 0 30px ${color}, 0 0 60px ${color}44`;
        el.style.display = 'block'; el.style.animation = 'none';
        void el.offsetWidth;
        el.style.animation = 'evtAnim 2.5s ease-out forwards';
        setTimeout(() => { el.style.display = 'none'; }, 2600);
    }

    /* ── Game Over ────────────────────────────────────────────────── */
    _gameOver() {
        this.state = 'gameover'; cancelAnimationFrame(this.raf); this.raf = null;
        if (typeof Audio !== 'undefined') Audio.playGameOver();
        // Affichage immédiat avec les données locales
        document.getElementById('go-score').textContent = this.score;
        document.getElementById('go-kills').textContent = this.kills;
        document.getElementById('go-time').textContent = Math.floor(this.gameTime / 60) + 's';
        document.getElementById('go-tier').textContent = this.tier;
        document.getElementById('go-waves').textContent = this.waveCount;
        document.getElementById('go-best').textContent = '…';
        document.getElementById('go-record').style.display = 'none';
        this._screen('gameover');
        // Envoi async au serveur Python (ou fallback local)
        this._saveScore().then(({ best, is_record }) => {
            document.getElementById('go-best').textContent = best;
            document.getElementById('go-record').style.display = (is_record && this.score > 0) ? 'block' : 'none';
        });
    }

    async _saveScore() {
        const entry = {
            score: this.score,
            tier: this.tier,
            waves: this.waveCount,
            kills: this.kills,
            time_sec: Math.floor(this.gameTime / 60),
            player_name: 'Joueur',
        };

        // ── Envoi API Python
        if (this._serverOnline) {
            try {
                const r = await fetch(this._apiBase + '/api/scores', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(entry),
                    signal: AbortSignal.timeout(3000),
                });
                const data = await r.json();
                if (data.success) {
                    this.highScores = data.top10 || [];
                    localStorage.setItem('nb3_scores', JSON.stringify(this.highScores));
                    return { best: data.top10[0]?.score ?? this.score, is_record: data.is_record };
                }
            } catch {
                this._serverOnline = false;
            }
        }

        // ── Fallback localStorage
        this.highScores.push({ ...entry, date: new Date().toLocaleDateString('fr-FR') });
        this.highScores.sort((a, b) => b.score - a.score);
        this.highScores = this.highScores.slice(0, 10);
        localStorage.setItem('nb3_scores', JSON.stringify(this.highScores));
        const best = this.highScores[0].score;
        return { best, is_record: this.score === best };
    }

    /* ── HUD ──────────────────────────────────────────────────────── */
    _updateHUD() {
        const p = this.player;
        document.getElementById('health-bar').style.width = (p.hp / p.maxHp * 100) + '%';
        document.getElementById('health-val').textContent = Math.ceil(p.hp);
        const sr = document.getElementById('shield-row');
        if (p.shield > 0) {
            sr.style.display = 'flex';
            document.getElementById('shield-bar').style.width = (p.shield / p.maxShield * 100) + '%';
        } else { sr.style.display = 'none'; }

        document.getElementById('score-val').textContent = this.score;
        document.getElementById('combo-val').textContent = `×${this.combo.toFixed(1)}`;
        document.getElementById('hud-tier').textContent = `PALIER ${this.tier}`;
        document.getElementById('hud-wave').textContent = `VAGUE ${this.waveCount}`;
        const cc = document.getElementById('hud-coins');
        if (cc) cc.textContent = this.coinTotal;

        // Icônes power-up bas
        const puC = document.getElementById('active-powerups');
        puC.innerHTML = '';
        const addIcon = (label, color, pct) => {
            const el = document.createElement('div'); el.className = 'pu-icon';
            el.style.background = color + '22'; el.style.borderColor = color; el.style.color = color;
            el.textContent = label;
            const t = document.createElement('div'); t.className = 'pu-icon-timer';
            t.style.width = pct + '%'; t.style.background = color; el.appendChild(t); puC.appendChild(el);
        };
        if (p.fireMode !== 'single' && p.fireModeTimer > 0) {
            const lbl = { double: '2X', triple: '3X', laser: '⚡' }[p.fireMode];
            const col = { double: '#00aaff', triple: '#cc44ff', laser: '#ff4400' }[p.fireMode];
            const maxT = p.fireMode === 'laser' ? 360 : 600;
            addIcon(lbl, col, p.fireModeTimer / maxT * 100);
        }
        if (p.slowActive && p.slowTimer > 0) addIcon('⏱', '#4488ff', p.slowTimer / 480 * 100);

        // Barre texte power-up
        const bar = document.getElementById('pu-info-bar');
        if (!bar) return;
        const entries = [];
        const puNames = { double: 'Double Laser', triple: 'Triple Shot', laser: 'Laser Puissant', slow: 'Ralenti Ennemis' };
        const puCols = { double: '#00aaff', triple: '#cc44ff', laser: '#ff4400', slow: '#4488ff', shield: '#00ffcc' };
        if (p.fireMode !== 'single' && p.fireModeTimer > 0) {
            const maxT = p.fireMode === 'laser' ? 360 : 600;
            entries.push({ name: 'Power-up : ' + puNames[p.fireMode], secs: Math.ceil(p.fireModeTimer / 60), pct: p.fireModeTimer / maxT * 100, col: puCols[p.fireMode] });
        }
        if (p.slowActive && p.slowTimer > 0) entries.push({ name: 'Power-up : Ralenti Ennemis', secs: Math.ceil(p.slowTimer / 60), pct: p.slowTimer / 480 * 100, col: puCols.slow });
        if (p.shield > 0) entries.push({ name: 'Power-up : Bouclier', secs: null, pct: p.shield / p.maxShield * 100, col: puCols.shield });
        bar.innerHTML = entries.map(e => `
      <div class="pu-info-entry" style="border-left-color:${e.col}">
        <div class="pu-info-text">
          <span class="pu-info-name">${e.name}</span>
          ${e.secs !== null ? `<span class="pu-info-timer">${e.secs}s</span>` : ''}
          <div class="pu-info-prog" style="width:${e.pct}%;background:${e.col}"></div>
        </div>
      </div>`).join('');
    }

    /* ── Rendu ────────────────────────────────────────────────────── */
    _draw() {
        const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
        this.starField.draw(ctx);

        // Barre vie Boss (si présent)
        const boss = this.enemies.find(e => e.type === 'boss');
        if (boss) {
            const bw = Math.min(600, W * .6), bx = (W - bw) / 2, by = 54;
            ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(bx - 4, by - 4, bw + 8, 20);
            ctx.fillStyle = '#ff0000'; ctx.fillRect(bx, by, bw * (boss.hp / boss.maxHp), 12);
            ctx.strokeStyle = 'rgba(255,0,0,.35)'; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, 12);
            ctx.fillStyle = '#ff6666'; ctx.font = 'bold 8px Orbitron,monospace';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('BOSS', W / 2, by + 6);
        }

        this.enemies.forEach(e => e.draw(ctx, this.player?.slowActive));
        this.coins.forEach(c => c.draw(ctx));
        this.powerups.forEach(pu => pu.draw(ctx));
        this.bullets.forEach(b => b.draw(ctx));
        if (this.player) this.player.draw(ctx);
        this.particles.draw(ctx);

        // Vignette
        const vg = ctx.createRadialGradient(W / 2, H / 2, H * .4, W / 2, H / 2, H * .9);
        vg.addColorStop(0, 'transparent'); vg.addColorStop(1, 'rgba(0,0,12,.42)');
        ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    }

    /* ── Pause ────────────────────────────────────────────────────── */
    pause() {
        this.state = 'paused'; cancelAnimationFrame(this.raf); this.raf = null;
        document.getElementById('overlay-pause').style.display = 'flex';
        if (typeof Audio !== 'undefined' && Audio._master) Audio._master.gain.setTargetAtTime(0.15, Audio._ctx.currentTime, 0.1);
    }
    resume() {
        this.state = 'playing';
        document.getElementById('overlay-pause').style.display = 'none';
        if (typeof Audio !== 'undefined' && Audio._master && !Audio._muted) Audio._master.gain.setTargetAtTime(0.7, Audio._ctx.currentTime, 0.1);
        this.raf = requestAnimationFrame(this.loop);
    }
}

/* ────────────────────────────────────────────────────────────────
   INIT
──────────────────────────────────────────────────────────────── */
let Game;
window.addEventListener('DOMContentLoaded', () => {
    Audio = new NovaAudio();
    Game = new GameEngine();
    Game.showMenu();
});