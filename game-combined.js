// ========== PARTICLES ==========
class Particle {
    constructor(x, y, color, size, velocityX, velocityY) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = size;
        this.velocityX = velocityX;
        this.velocityY = velocityY;
        this.life = 1.0;
        this.decay = 0.02;
        this.gravity = 0.2; // per-frame @60fps; smoke/fire use ~0 or negative so they rise
        this.grow = 0;      // size change per frame @60fps (smoke billows outward)
    }

    update(deltaTime) {
        // All rates are tuned for 60fps; scale so effects look the same at any refresh rate
        const f = deltaTime * 60;
        this.x += this.velocityX * f;
        this.y += this.velocityY * f;
        this.velocityY += this.gravity * f;
        if (this.grow) this.size = Math.max(0.5, this.size + this.grow * f);
        this.life -= this.decay * f;
    }

    render(ctx, camera) {
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x - camera.x, this.y - camera.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

// ========== PROJECTILES ==========
class Projectile {
    constructor(x, y, target, damage, speed, size, color, type, owner = null, game = null) {
        this.x = x;
        this.y = y;
        this.target = target;
        this.damage = damage;
        this.speed = speed;
        this.size = size;
        this.color = color;
        this.type = type;
        this.dead = false;
        this.owner = owner;
        this.game = game;
        this.aoe = type === 'mortar_shell' ? 70 : type === 'rocket' ? 35 : 0;
        this.trailX = x;
        this.trailY = y;
    }

    update(deltaTime) {
        if (!this.target || this.target.hp <= 0 || this.target.garrisonedIn) {
            this.dead = true;
            return;
        }

        // Save trail position before moving
        this.trailX = this.x;
        this.trailY = this.y;

        // Rocket smoke trail
        if (this.type === 'rocket' && this.game) {
            const grey = Math.floor(140 + Math.random() * 60);
            const p = new Particle(this.x, this.y, `rgb(${grey},${grey},${grey})`,
                2 + Math.random() * 2, (Math.random()-0.5)*0.3, -0.4 - Math.random()*0.3);
            p.decay = 0.06;
            p.gravity = 0;
            p.grow = 0.06;
            this.game.particles.push(p);
        }

        // Move toward target
        const dx = this.target.x - this.x;
        const dy = this.target.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < this.speed * deltaTime) {
            // Hit the target
            this.target.hp -= this.damage;
            if (this.target.hp <= 0 && this.owner && typeof this.owner.addKill === 'function') {
                this.owner.addKill();
            }

            if (this.game) {
                // Suppress hit target
                if (this.target.suppressTimer !== undefined) this.target.suppressTimer = 0.5;

                // Impact sparks / dust at hit point
                const sparkColor = this.target.team === 'player' ? '#FF6B6B' : '#FFD700';
                for (let i = 0; i < 4; i++) {
                    const sp = new Particle(this.x, this.y, sparkColor,
                        1.5 + Math.random() * 2,
                        (Math.random()-0.5)*5, (Math.random()-0.5)*5 - 1);
                    sp.decay = 0.09;
                    this.game.particles.push(sp);
                }

                // Red flash when player takes hits
                if (this.target.team === 'player') {
                    this.game.damageFlash = Math.min(1, this.game.damageFlash + 0.25);
                    if (this.game.radioMessages.length === 0 ||
                        this.game.radioMessages[0].text !== '📡 Taking fire!') {
                        this.game.addRadioMessage('📡 Taking fire!', '#FF6B6B');
                    }
                }
            }

            // AoE splash damage for mortar shells
            if (this.aoe > 0 && this.game) {
                // Enemy shells also hurt nearby townsfolk (player fire avoids friendly civilians)
                const civ = this.owner && this.owner.team === this.game.enemyTeam && this.game.townsExposed() ? this.game.cityTargets() : [];
                [...this.game.units, ...this.game.buildings, ...civ].forEach(entity => {
                    if (entity === this.target || entity.garrisonedIn || entity.hp <= 0) return;
                    if (entity.team === (this.owner ? this.owner.team : null)) return;
                    const ex = entity.x - this.x, ey = entity.y - this.y;
                    const ed = Math.sqrt(ex*ex + ey*ey);
                    if (ed < this.aoe) {
                        entity.hp -= this.damage * (1 - ed / this.aoe);
                        if (entity.suppressTimer !== undefined) entity.suppressTimer = 0.8;
                        // Splash kills count toward veterancy too
                        if (entity.hp <= 0 && this.owner && typeof this.owner.addKill === 'function') {
                            this.owner.addKill();
                        }
                    }
                });
                this.game.createExplosion(this.x, this.y, 40, '#FF4500');
            }
            this.dead = true;
        } else {
            // Move toward target
            const angle = Math.atan2(dy, dx);
            this.x += Math.cos(angle) * this.speed * deltaTime;
            this.y += Math.sin(angle) * this.speed * deltaTime;
        }
    }

    render(ctx, camera) {
        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;

        if (this.type === 'bullet' || this.type === 'shell' || this.type === 'artillery_shell' || this.type === 'rocket') {
            ctx.save();
            ctx.globalAlpha = 0.5;
            ctx.strokeStyle = this.color;
            ctx.lineWidth = this.type === 'bullet' ? 1.5 : 2.5;
            ctx.beginPath();
            ctx.moveTo(this.trailX - camera.x, this.trailY - camera.y);
            ctx.lineTo(screenX, screenY);
            ctx.stroke();
            ctx.restore();
        }

        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(screenX, screenY, this.size, 0, Math.PI * 2);
        ctx.fill();

        // Add a glow effect for larger projectiles
        if (this.size > 4) {
            ctx.fillStyle = this.color + '80'; // Semi-transparent
            ctx.beginPath();
            ctx.arc(screenX, screenY, this.size + 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

// ========== NUKE PROJECTILE ==========
class NukeProjectile {
    constructor(x, y, targetX, targetY, game, team) {
        this.x = x;
        this.y = y;
        this.targetX = targetX;
        this.targetY = targetY;
        this.game = game;
        this.team = team;
        this.speed = 180;
        this.dead = false;
        this.explosionRadius = 250;
        this.trailTimer = 0;
        this.angle = Math.atan2(targetY - y, targetX - x);
    }

    update(deltaTime) {
        if (this.dead) return;

        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        this.trailTimer += deltaTime;
        if (this.trailTimer >= 0.04) {
            this.trailTimer = 0;
            const trail = new Particle(
                this.x, this.y,
                ['#888', '#aaa', '#bbb', '#999'][Math.floor(Math.random() * 4)],
                3 + Math.random() * 4,
                (Math.random() - 0.5) * 1.5,
                (Math.random() - 0.5) * 1.5
            );
            trail.gravity = 0;
            trail.grow = 0.08;
            trail.decay = 0.015;
            this.game.particles.push(trail);
        }

        if (dist < this.speed * deltaTime) {
            this.explode();
            this.dead = true;
        } else {
            this.x += Math.cos(this.angle) * this.speed * deltaTime;
            this.y += Math.sin(this.angle) * this.speed * deltaTime;
        }
    }

    explode() {
        const r = this.explosionRadius;

        // Instantly kill all units in radius (garrisoned units die with their building)
        this.game.units.forEach(unit => {
            if (unit.garrisonedIn) return;
            const dx = unit.x - this.targetX;
            const dy = unit.y - this.targetY;
            if (Math.sqrt(dx * dx + dy * dy) <= r) unit.hp = 0;
        });

        // Nukes don't discriminate — towns in the blast are devastated
        this.game.cityTargets().forEach(t => {
            const dx = t.x - this.targetX, dy = t.y - this.targetY;
            if (Math.sqrt(dx * dx + dy * dy) <= r) t.hp = 0;
        });

        // Heavily damage buildings, more at center
        this.game.buildings.forEach(building => {
            const dx = building.x - this.targetX;
            const dy = building.y - this.targetY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= r) {
                building.hp -= Math.round(building.maxHp * (1.1 - dist / r * 0.4));
            }
        });

        // Screen shake for nuke
        this.game.addShake(20, 0.6);
        this.game.sfx.play('bigboom');

        // Massive particle burst
        const colors = ['#FF4500', '#FF6347', '#FFA500', '#FFD700', '#FFFFFF', '#FF0000'];
        for (let i = 0; i < 120; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 10;
            this.game.particles.push(new Particle(
                this.targetX, this.targetY,
                colors[Math.floor(Math.random() * colors.length)],
                2 + Math.random() * 8,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed - 4
            ));
        }

        // Expanding shockwave ring
        this.game.shockwaves.push({
            x: this.targetX, y: this.targetY,
            radius: 5, maxRadius: r * 1.3, life: 1.0,
            update(dt) {
                this.radius += 500 * dt;
                this.life = Math.max(0, 1 - this.radius / this.maxRadius);
            },
            render(ctx, camera) {
                if (this.life <= 0) return;
                ctx.strokeStyle = `rgba(255, 200, 50, ${this.life})`;
                ctx.lineWidth = 6 * this.life;
                ctx.beginPath();
                ctx.arc(this.x - camera.x, this.y - camera.y, this.radius, 0, Math.PI * 2);
                ctx.stroke();
            }
        });
    }

    render(ctx, camera) {
        if (this.dead) return;
        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;

        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.rotate(this.angle);

        ctx.fillStyle = '#9E9E9E';
        ctx.fillRect(-15, -4, 22, 8);

        ctx.fillStyle = '#F44336';
        ctx.beginPath();
        ctx.moveTo(7, 0);
        ctx.lineTo(17, -5);
        ctx.lineTo(17, 5);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#757575';
        ctx.fillRect(-17, -8, 7, 5);
        ctx.fillRect(-17, 3, 7, 5);

        ctx.restore();

        ctx.fillStyle = '#FF4500';
        ctx.beginPath();
        ctx.arc(screenX - Math.cos(this.angle) * 16, screenY - Math.sin(this.angle) * 16, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(screenX - Math.cos(this.angle) * 15, screenY - Math.sin(this.angle) * 15, 3, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ========== UNITS ==========
class Unit {
    constructor(type, x, y, team) {
        this.type = type;
        this.x = x;
        this.y = y;
        this.team = team;
        this.targetX = x;
        this.targetY = y;
        this.selected = false;
        this.attackMove = false;
        this.target = null;

        // Order state
        this.destX = x;            // final destination of the current move / attack-move order
        this.destY = y;
        this.forcedMove = false;   // explicit move order: don't get distracted by enemies until arrival
        this.garrisonTarget = null; // friendly building this unit is walking to garrison in
        this.stuckTimer = 0;
        this.facing = 1;           // 1 = facing right, -1 = facing left (sprites are mirrored)

        this.setStats(type);
    }

    setStats(type) {
        const stats = {
            soldier: {
                maxHp: 50,
                speed: 60,
                damage: 5,
                range: 100,
                attackSpeed: 1.0,
                size: 12,
                color: '#4CAF50',
                weight: 1,
                canCrush: false,
                visionRadius: 220
            },
            tank: {
                maxHp: 150,
                speed: 40,
                damage: 25,
                range: 150,
                attackSpeed: 2.0,
                size: 20,
                color: '#795548',
                weight: 5,
                canCrush: true,
                visionRadius: 200
            },
            harvester: {
                maxHp: 100,
                speed: 50,
                damage: 0,
                range: 0,
                attackSpeed: 0,
                size: 18,
                color: '#FFC107',
                carrying: 0,
                maxCarry: 500,
                weight: 4,
                canCrush: true,
                visionRadius: 160
            },
            sniper: {
                maxHp: 60,
                speed: 70,
                damage: 50,
                range: 400,
                attackSpeed: 3.0,
                size: 13,
                color: '#2196F3',
                weight: 1,
                canCrush: false,
                visionRadius: 320
            },
            artillery: {
                maxHp: 120,
                speed: 30,
                damage: 100,
                range: 500,
                attackSpeed: 4.0,
                size: 25,
                color: '#FF5722',
                weight: 6,
                canCrush: true,
                visionRadius: 160
            },
            commando: {
                maxHp: 200,
                speed: 90,
                damage: 40,
                range: 120,
                attackSpeed: 0.5,
                size: 15,
                color: '#9C27B0',
                weight: 1,
                canCrush: false,
                visionRadius: 260
            },
            helicopter: {
                maxHp: 120,
                speed: 130,
                damage: 18,
                range: 200,
                attackSpeed: 1.0,
                size: 18,
                color: '#546E7A',
                weight: 1,
                canCrush: false,
                isAir: true,
                visionRadius: 300
            },
            apc: {
                maxHp: 230,
                speed: 55,
                damage: 12,
                range: 130,
                attackSpeed: 1.2,
                size: 22,
                color: '#78909C',
                weight: 6,
                canCrush: true,
                visionRadius: 200
            },
            mortar: {
                maxHp: 65,
                speed: 32,
                damage: 55,
                range: 370,
                attackSpeed: 5.0,
                size: 14,
                color: '#8D6E63',
                weight: 2,
                canCrush: false,
                visionRadius: 180
            },
            bazooka: {
                maxHp: 60,
                speed: 50,
                damage: 90,
                range: 190,
                attackSpeed: 4.5,
                size: 13,
                color: '#795548',
                weight: 1,
                canCrush: false,
                visionRadius: 200
            },
            general: {
                maxHp: 350,
                speed: 70,
                damage: 40,
                range: 160,
                attackSpeed: 1.2,
                size: 17,
                color: '#FFD700',
                weight: 2,
                canCrush: false,
                auraRadius: 160,
                visionRadius: 300
            },
            medic: {
                maxHp: 55,
                speed: 75,
                damage: 0,
                range: 0,
                attackSpeed: 0,
                size: 12,
                color: '#FFFFFF',
                weight: 1,
                canCrush: false,
                visionRadius: 200
            }
        };

        const unitStats = stats[type] || stats.soldier;
        Object.assign(this, unitStats);
        this.hp = this.maxHp;
        this.attackCooldown = 0;
        this.kills = 0;
        this.veterancy = 0; // 0=rookie 1=veteran(3kills) 2=elite(8kills) 3=hero(18kills)
        this.garrisonedIn = null;
        this.suppressTimer = 0;
        this.dustTimer = 0;

        // Harvester-specific properties
        if (type === 'harvester') {
            this.targetDeposit = null; // Specific deposit to mine
            this.isMining = false; // Track mining state for animation
            this.shovelAngle = 0; // Shovel animation angle
        }
    }

    addKill() {
        this.kills++;
        const thresholds = [3, 8, 18];
        const newVet = thresholds.filter(t => this.kills >= t).length;
        if (newVet > this.veterancy) {
            this.veterancy = newVet;
            const bonus = 0.15; // 15% per level
            this.maxHp   = Math.round(this.maxHp * (1 + bonus));
            this.damage  = Math.round(this.damage * (1 + bonus));
            this.hp = Math.min(this.hp + this.maxHp * 0.2, this.maxHp); // small heal on level up
        }
    }

    moveTo(x, y) {
        this.targetX = x;
        this.targetY = y;
        this.destX = x;
        this.destY = y;
        this.target = null;
        this.attackMove = false;
        this.forcedMove = true;
        this.garrisonTarget = null;
        this.stuckTimer = 0;
    }

    attackTarget(target) {
        this.target = target;
        this.attackMove = false;
        this.forcedMove = false;
        this.garrisonTarget = null;
    }

    orderGarrison(building) {
        this.moveTo(building.x, building.y);
        this.garrisonTarget = building;
    }

    stop() {
        this.targetX = this.x;
        this.targetY = this.y;
        this.destX = this.x;
        this.destY = this.y;
        this.target = null;
        this.attackMove = false;
        this.forcedMove = false;
        this.garrisonTarget = null;
    }

    // Shared movement step: walks toward (targetX, targetY), updates facing,
    // and releases a forced move once arrived (or hopelessly blocked).
    stepMovement(deltaTime, speedMult = 1, game = null) {
        const ground = !this.isAir && game && game.waterGrid;

        // Ground units can't stand in rivers: retarget clicks on water to the nearest bank
        if (ground && game.isWater(this.targetX, this.targetY)) {
            const land = game.nearestLand(this.targetX, this.targetY);
            if (Math.abs(this.destX - this.targetX) < 1 && Math.abs(this.destY - this.targetY) < 1) {
                this.destX = land.x; this.destY = land.y;
            }
            this.targetX = land.x; this.targetY = land.y;
        }

        const gx = this.targetX, gy = this.targetY;   // final goal
        let wx = gx, wy = gy;                          // where we're heading right now

        // Route across rivers via bridges (path is cached and refreshed when the goal moves)
        if (ground) {
            this.pathAge = (this.pathAge || 0) + deltaTime;
            if (!this.pathGoal || Math.abs(gx - this.pathGoal.x) + Math.abs(gy - this.pathGoal.y) > 30 || this.pathAge > 2) {
                this.path = game.findPath(this.x, this.y, gx, gy);
                this.pathGoal = { x: gx, y: gy };
                this.pathAge = 0;
            }
            while (this.path && this.path.length > 1 &&
                   Math.abs(this.path[0].x - this.x) + Math.abs(this.path[0].y - this.y) < 16) {
                this.path.shift();
            }
            if (this.path && this.path.length > 1) { wx = this.path[0].x; wy = this.path[0].y; }
        }

        const dx = wx - this.x;
        const dy = wy - this.y;
        const legDist = Math.sqrt(dx * dx + dy * dy);
        const gdx = gx - this.x, gdy = gy - this.y;
        const dist = Math.sqrt(gdx * gdx + gdy * gdy);   // distance to the final goal
        let moved = false;
        if (legDist > 2) {
            const step = Math.min(legDist, this.speed * speedMult * deltaTime);
            let nx = this.x + (dx / legDist) * step;
            let ny = this.y + (dy / legDist) * step;
            // Don't walk into water; slide along the bank instead
            if (ground && game.isWater(nx, ny) && !game.isWater(this.x, this.y)) {
                if (!game.isWater(nx, this.y)) ny = this.y;
                else if (!game.isWater(this.x, ny)) nx = this.x;
                else { nx = this.x; ny = this.y; }
            }
            const moveDist = Math.abs(nx - this.x) + Math.abs(ny - this.y);
            this.x = nx; this.y = ny;
            if (!this.target && Math.abs(dx) > 3) this.facing = dx > 0 ? 1 : -1;
            moved = moveDist > 0.01;

            // Stuck detection based on actual progress (detours are fine, standing still isn't)
            if (this.forcedMove) {
                this.stuckTimer = moveDist < step * 0.2 ? this.stuckTimer + deltaTime : 0;
            }
        }

        if (this.forcedMove) {
            if (dist < this.size + 6) {
                this.forcedMove = false;
            } else if (this.stuckTimer > 1.5) {
                // Something keeps blocking us — give up the forced move so the unit can defend itself
                this.forcedMove = false;
                this.stuckTimer = 0;
            }
        }
        return moved;
    }

    tryEnterGarrison(game) {
        const b = this.garrisonTarget;
        if (!b) return false;
        if (b.hp <= 0 || b.garrison.length >= b.maxGarrison) {
            this.garrisonTarget = null;
            this.stop();
            return false;
        }
        const dx = b.x - this.x, dy = b.y - this.y;
        if (Math.sqrt(dx * dx + dy * dy) <= Math.max(b.width, b.height) / 2 + this.size + 8) {
            this.garrisonTarget = null;
            this.garrisonedIn = b;
            this.target = null;
            this.forcedMove = false;
            this.selected = false;
            this.x = b.x; this.y = b.y;
            b.garrison.push(this);
            if (game.selectedUnits.includes(this)) {
                game.selectedUnits = game.selectedUnits.filter(u => u !== this);
                game.updateUI();
            }
            return true;
        }
        this.targetX = b.x; this.targetY = b.y;
        return false;
    }

    update(deltaTime, game) {
        if (this.garrisonedIn) return; // garrisoned units don't move or act
        if (this.type === 'harvester') {
            this.updateHarvester(deltaTime, game);
            return;
        }

        if (this.garrisonTarget && this.tryEnterGarrison(game)) return;

        if (this.type === 'medic') {
            // Seek damaged friendlies nearby — unless the player ordered us somewhere
            if (!this.forcedMove) {
                let healTarget = null;
                let minDist = 260; // only look around us, don't run across the map
                game.units.forEach(u => {
                    if (u === this || u.team !== this.team || u.hp >= u.maxHp || u.garrisonedIn) return;
                    const dx = u.x - this.x, dy = u.y - this.y;
                    const d = Math.sqrt(dx*dx+dy*dy);
                    if (d < minDist) { minDist = d; healTarget = u; }
                });
                if (healTarget && minDist < 80) {
                    healTarget.hp = Math.min(healTarget.hp + 10 * deltaTime, healTarget.maxHp);
                    this.targetX = this.x; this.targetY = this.y; // stop moving
                    if (Math.abs(healTarget.x - this.x) > 3) this.facing = healTarget.x > this.x ? 1 : -1;
                    // Little green "+" sparkles while healing
                    if (Math.random() < deltaTime * 6) {
                        const hp = new Particle(healTarget.x + (Math.random()-0.5)*healTarget.size,
                            healTarget.y - healTarget.size * 0.5, '#76FF03', 2, 0, -0.6);
                        hp.gravity = 0; hp.decay = 0.03;
                        game.particles.push(hp);
                    }
                } else if (healTarget) {
                    this.targetX = healTarget.x; this.targetY = healTarget.y;
                }
            }
            this.stepMovement(deltaTime, 1, game);
            this.handleCollisions(game);
            if (this.attackCooldown > 0) this.attackCooldown -= deltaTime;
            return;
        }

        // Drop targets that died or vanished into a building; attack-movers resume their march
        if (this.target && (this.target.hp <= 0 || this.target.garrisonedIn)) {
            this.target = null;
            if (this.attackMove) { this.targetX = this.destX; this.targetY = this.destY; }
        }

        // Auto-engage nearby enemies — but an explicit move order (e.g. a retreat) takes priority
        const holdFire = this.forcedMove && !this.attackMove;
        if (!this.target && !holdFire) {
            this.findNearbyEnemy(game);
        }

        if (this.attackMove && !this.target) {
            this.findTarget(game);
        }

        if (this.target) {
            const dx = this.target.x - this.x;
            const dy = this.target.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (Math.abs(dx) > 3) this.facing = dx > 0 ? 1 : -1;

            if (dist <= this.range) {
                this.attack(this.target, deltaTime, game);

                // Stop moving if we're comfortably within range
                if (dist <= this.range * 0.8) {
                    this.targetX = this.x;
                    this.targetY = this.y;
                } else {
                    // Keep moving toward target if we're at edge of range
                    this.targetX = this.target.x;
                    this.targetY = this.target.y;
                }
            } else {
                // Target is out of range, move toward it
                this.targetX = this.target.x;
                this.targetY = this.target.y;
            }
        }

        // Suppression slows movement (helicopters are immune)
        if (this.suppressTimer > 0) this.suppressTimer = Math.max(0, this.suppressTimer - deltaTime);
        const suppressMult = this.suppressTimer > 0 && !this.isAir ? 0.5 : 1;

        const moved = this.stepMovement(deltaTime, suppressMult, game);

        // Attack-move order complete: clear it so the unit goes idle (and the AI can re-task it)
        if (this.attackMove && !this.target) {
            const ddx = this.destX - this.x, ddy = this.destY - this.y;
            if (ddx * ddx + ddy * ddy < 30 * 30) this.attackMove = false;
        }

        // Vehicle dust trail
        if (moved && (this.type === 'tank' || this.type === 'apc' || this.type === 'artillery')) {
            this.dustTimer -= deltaTime;
            if (this.dustTimer <= 0) {
                this.dustTimer = 0.08;
                const dust = new Particle(this.x - this.facing * this.size * 0.8 + (Math.random()-0.5)*this.size * 0.5,
                                          this.y + this.size * 0.4,
                                          '#8D7355', 3 + Math.random()*3,
                                          (Math.random()-0.5)*0.6, -0.15 - Math.random()*0.2);
                dust.decay = 0.018;
                dust.gravity = 0;
                dust.grow = 0.06;
                game.particles.push(dust);
            }
        }

        // Apply collision physics and crushing
        this.handleCollisions(game);

        if (this.attackCooldown > 0) {
            this.attackCooldown -= deltaTime;
        }
    }

    handleCollisions(game) {
        // Never let units drift (or get shoved) off the edge of the map
        const m = this.size;
        this.x = Math.max(m, Math.min(game.worldWidth - m, this.x));
        this.y = Math.max(m, Math.min(game.worldHeight - m, this.y));
        if (this.isAir) return; // helicopters fly over everything
        // Check collisions with other units
        for (const other of game.units) {
            // Ignore self, aircraft overhead, units inside buildings, and corpses awaiting cleanup
            if (other === this || other.isAir || other.garrisonedIn || other.hp <= 0) continue;

            const dx = other.x - this.x;
            const dy = other.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const minDist = this.size + other.size;

            if (dist < minDist && dist > 0) {
                // Units are overlapping

                // Check for crushing (heavy units running over light units)
                if (this.canCrush && !other.canCrush && this.team !== other.team) {
                    // This is a heavy unit and other is a light enemy unit
                    if (dist < this.size) {
                        // Direct hit - crush the lighter unit
                        other.hp = 0;
                        continue;
                    }
                } else if (other.canCrush && !this.canCrush && this.team !== other.team) {
                    // Other is a heavy unit crushing this light unit
                    if (dist < other.size) {
                        this.hp = 0;
                        continue;
                    }
                }

                // Apply separation force (push units apart)
                const overlap = minDist - dist;
                const separationForce = overlap / minDist;

                // Push units apart based on their weight
                const totalWeight = this.weight + other.weight;
                const myPushRatio = other.weight / totalWeight;
                const otherPushRatio = this.weight / totalWeight;

                const separationX = (dx / dist) * separationForce * 10;
                const separationY = (dy / dist) * separationForce * 10;

                // Push both units apart — but never shove anyone into a river
                // (that's what used to let crowds leak across without a bridge)
                const pushTo = (u, nx, ny) => {
                    if (game.waterGrid && game.isWater(nx, ny) && !game.isWater(u.x, u.y)) return;
                    u.x = nx; u.y = ny;
                };
                pushTo(this, this.x - separationX * myPushRatio, this.y - separationY * myPushRatio);
                pushTo(other, other.x + separationX * otherPushRatio, other.y + separationY * otherPushRatio);
            }
        }
    }

    updateHarvester(deltaTime, game) {
        const refinery = game.buildings.find(b =>
            b.type === 'refinery' && b.team === this.team
        );

        if (!refinery) return;

        this.isMining = false;

        if (this.carrying >= this.maxCarry) {
            // Return to refinery
            this.targetX = refinery.x;
            this.targetY = refinery.y;

            const dx = refinery.x - this.x;
            const dy = refinery.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 50) {
                if (this.team === game.playerTeam) {
                    game.resources.credits += this.carrying;
                    game.refreshLiveUI();
                } else {
                    game.ai.credits += this.carrying;
                }
                this.carrying = 0;
            }
        } else {
            // Find nearest resource deposit
            const deposit = this.findNearestDeposit(game.resourceDeposits);
            if (deposit) {
                this.targetX = deposit.x;
                this.targetY = deposit.y;

                const dx = deposit.x - this.x;
                const dy = deposit.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 30 && deposit.amount > 0) {
                    this.isMining = true;
                    const harvestAmount = Math.min(100 * deltaTime, deposit.amount, this.maxCarry - this.carrying);
                    deposit.amount -= harvestAmount;
                    this.carrying += harvestAmount;
                    this.shovelAngle = Math.sin(Date.now() / 100) * 0.3;
                    // Gold glints kicked up while digging
                    if (Math.random() < deltaTime * 8) {
                        const g = new Particle(deposit.x + (Math.random()-0.5)*20, deposit.y + (Math.random()-0.5)*10,
                            Math.random() < 0.5 ? '#FFD700' : '#FFF59D', 1.5 + Math.random()*1.5,
                            (Math.random()-0.5)*1.5, -1.5 - Math.random());
                        g.decay = 0.05;
                        game.particles.push(g);
                    }
                }
            }
        }

        // Move (harvesters run their own logic, so player move orders never "stick")
        this.forcedMove = false;
        this.stepMovement(deltaTime, 1, game);

        // Apply collision physics for harvesters too
        this.handleCollisions(game);
    }

    findNearestDeposit(deposits) {
        let nearest = null;
        let nearestEmpty = null;
        let minDist = Infinity;
        let minEmptyDist = Infinity;

        deposits.forEach(deposit => {
            const dx = deposit.x - this.x;
            const dy = deposit.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (deposit.amount > 0) {
                if (dist < minDist) { minDist = dist; nearest = deposit; }
            } else {
                if (dist < minEmptyDist) { minEmptyDist = dist; nearestEmpty = deposit; }
            }
        });

        // If a manually assigned deposit exists, prefer it (even if empty — wait nearby)
        if (this.targetDeposit) {
            return this.targetDeposit.amount > 0 ? this.targetDeposit : (nearest || this.targetDeposit);
        }

        // Return nearest with ore, or nearest empty one so harvester waits there for regen
        return nearest || nearestEmpty;
    }

    findNearbyEnemy(game) {
        // Auto-detect nearby enemies within a shorter range
        // Only targets units, not buildings (to avoid units wandering off to attack buildings)
        let nearestEnemy = null;
        let minDist = Infinity;
        const detectionRange = 200;
        const fogGrid = this.team === game.playerTeam ? game.playerFog : game.enemyFog;

        game.units.forEach(unit => {
            if (unit.team !== this.team && unit.type !== 'harvester' && !unit.garrisonedIn && unit.hp > 0) {
                // Can only auto-aggro onto enemies the team can actually see
                if (game.fogStateAt(unit.x, unit.y, fogGrid) !== 2) return;
                const dx = unit.x - this.x;
                const dy = unit.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < detectionRange && dist < minDist) {
                    minDist = dist;
                    nearestEnemy = unit;
                }
            }
        });

        // Enemy troops also open fire on civilians they come across
        if (this.team === game.enemyTeam && game.townsExposed()) {
            game.cityTargets().forEach(t => {
                if (!t.isCivilian) return;
                const dx = t.x - this.x, dy = t.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < detectionRange && dist < minDist) { minDist = dist; nearestEnemy = t; }
            });
        }

        if (nearestEnemy) {
            // Note: attackMove is intentionally kept so attack-move orders resume after the fight
            this.target = nearestEnemy;
        }
    }

    findTarget(game) {
        let nearestTarget = null;
        let minDist = Infinity;

        game.units.forEach(unit => {
            if (unit.team !== this.team && !unit.garrisonedIn && unit.hp > 0) {
                const dx = unit.x - this.x;
                const dy = unit.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 300 && dist < minDist) {
                    minDist = dist;
                    nearestTarget = unit;
                }
            }
        });

        game.buildings.forEach(building => {
            if (building.team !== this.team) {
                const dx = building.x - this.x;
                const dy = building.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 300 && dist < minDist) {
                    minDist = dist;
                    nearestTarget = building;
                }
            }
        });

        // Enemy raiders attack town houses and civilians
        if (this.team === game.enemyTeam && game.townsExposed()) {
            game.cityTargets().forEach(t => {
                const dx = t.x - this.x, dy = t.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 300 && dist < minDist) { minDist = dist; nearestTarget = t; }
            });
        }

        this.target = nearestTarget;
    }

    attack(target, deltaTime, game) {
        if (this.attackCooldown <= 0 && this.damage > 0) {
            const projectile = this.createProjectile(target);
            projectile.game = game;
            // Command boost: +30% damage when near a friendly general
            if (this.commandBoost) projectile.damage = Math.round(projectile.damage * 1.3);
            // Muzzle flash
            for (let i = 0; i < 4; i++) {
                const a = Math.atan2(target.y - this.y, target.x - this.x) + (Math.random()-0.5) * 0.6;
                const spd = 1.5 + Math.random() * 2;
                const fp = new Particle(this.x, this.y, '#FFFDE7', 2 + Math.random()*2, Math.cos(a)*spd, Math.sin(a)*spd);
                fp.decay = 0.2;
                game.particles.push(fp);
            }
            game.projectiles.push(projectile);
            this.attackCooldown = this.attackSpeed;
            const fireSound = { tank: 'cannon', artillery: 'artillery', sniper: 'sniper', mortar: 'mortar', bazooka: 'rocket' }[this.type] || 'shot';
            game.sfx.play(fireSound, this.x, this.y);
        }
    }

    createProjectile(target) {
        let projectileType = 'bullet';
        let speed = 400;
        let size = 3;
        let color = '#FFD700';

        // Different projectile types based on unit
        if (this.type === 'tank') {
            projectileType = 'shell';
            speed = 300;
            size = 6;
            color = '#FF8800';
        } else if (this.type === 'artillery') {
            projectileType = 'artillery_shell';
            speed = 250;
            size = 8;
            color = '#FF4400';
        } else if (this.type === 'sniper') {
            projectileType = 'bullet';
            speed = 600;
            size = 2;
            color = '#00FFFF';
        } else if (this.type === 'mortar') {
            projectileType = 'mortar_shell';
            speed = 180;
            size = 7;
            color = '#FF6F00';
        } else if (this.type === 'bazooka') {
            projectileType = 'rocket';
            speed = 220;
            size = 5;
            color = '#FF6F00';
        }

        return new Projectile(
            this.x,
            this.y,
            target,
            this.damage,
            speed,
            size,
            color,
            projectileType,
            this
        );
    }

    render(ctx, camera) {
        if (this.garrisonedIn) return; // garrisoned units are not rendered on map
        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;

        // Soft ground shadow anchors units to the terrain (helicopters draw their own)
        if (!this.isAir) {
            const isVehicle = this.canCrush;
            ctx.fillStyle = 'rgba(0,0,0,0.28)';
            ctx.beginPath();
            ctx.ellipse(screenX + 2, screenY + this.size * (isVehicle ? 0.6 : 0.95),
                        this.size * (isVehicle ? 1.1 : 0.6), this.size * 0.28, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Mirror the sprite so units face the direction they're moving / shooting
        ctx.save();
        if (this.facing < 0) {
            ctx.translate(screenX * 2, 0);
            ctx.scale(-1, 1);
        }

        ctx.fillStyle = this.team === 'player' ? this.color : '#f44336';

        // Draw different shapes based on unit type
        if (this.type === 'soldier' || this.type === 'sniper' || this.type === 'commando') {
            // Draw person shape
            // Head
            ctx.beginPath();
            ctx.arc(screenX, screenY - this.size / 3, this.size / 3, 0, Math.PI * 2);
            ctx.fill();

            // Body
            ctx.fillRect(
                screenX - this.size / 3,
                screenY - this.size / 6,
                this.size * 2 / 3,
                this.size * 2 / 3
            );

            // Legs
            ctx.fillRect(
                screenX - this.size / 3,
                screenY + this.size / 2,
                this.size / 4,
                this.size / 2
            );
            ctx.fillRect(
                screenX + this.size / 12,
                screenY + this.size / 2,
                this.size / 4,
                this.size / 2
            );

        } else if (this.type === 'tank') {
            // Draw tank shape
            // Tank body (rectangle)
            ctx.fillRect(
                screenX - this.size,
                screenY - this.size / 2,
                this.size * 2,
                this.size
            );

            // Tank turret (smaller rectangle on top)
            ctx.fillRect(
                screenX - this.size / 2,
                screenY - this.size,
                this.size,
                this.size / 1.5
            );

            // Gun barrel
            ctx.fillRect(
                screenX + this.size / 2,
                screenY - this.size / 3,
                this.size,
                this.size / 4
            );

        } else if (this.type === 'artillery') {
            // Draw artillery cannon shape
            // Base platform
            ctx.fillRect(
                screenX - this.size,
                screenY + this.size / 3,
                this.size * 2,
                this.size / 2
            );

            // Cannon barrel (angled upward)
            ctx.save();
            ctx.translate(screenX, screenY);
            ctx.rotate(-Math.PI / 6); // 30 degree angle
            ctx.fillRect(0, -this.size / 4, this.size * 1.5, this.size / 2);
            ctx.restore();

        } else if (this.type === 'harvester') {
            // Draw truck/harvester shape
            // Truck body
            ctx.fillRect(
                screenX - this.size,
                screenY - this.size / 2,
                this.size * 1.8,
                this.size
            );

            // Cabin
            ctx.fillRect(
                screenX - this.size,
                screenY - this.size,
                this.size / 1.5,
                this.size / 2
            );

            // Draw animated shovel
            ctx.save();
            ctx.translate(screenX + this.size * 0.5, screenY);
            ctx.rotate(this.shovelAngle || 0);

            // Shovel handle
            ctx.fillStyle = '#8B4513'; // Brown
            ctx.fillRect(-2, 0, 4, this.size * 0.8);

            // Shovel blade
            ctx.fillStyle = '#C0C0C0'; // Silver
            ctx.beginPath();
            ctx.moveTo(-6, this.size * 0.8);
            ctx.lineTo(6, this.size * 0.8);
            ctx.lineTo(4, this.size * 1.1);
            ctx.lineTo(-4, this.size * 1.1);
            ctx.closePath();
            ctx.fill();

            ctx.restore();

        } else if (this.type === 'helicopter') {
            // Shadow on ground
            ctx.save();
            ctx.globalAlpha = 0.25;
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.ellipse(screenX, screenY + this.size * 1.6, this.size * 1.4, this.size * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            // Body
            ctx.fillStyle = this.team === 'player' ? this.color : '#ef5350';
            ctx.fillRect(screenX - this.size * 0.6, screenY - this.size * 0.3, this.size * 1.2, this.size * 0.6);
            // Tail boom
            ctx.fillRect(screenX - this.size * 1.4, screenY - this.size * 0.1, this.size * 0.8, this.size * 0.2);
            // Rotor (spinning line)
            ctx.save();
            ctx.translate(screenX, screenY - this.size * 0.2);
            ctx.rotate(Date.now() / 60);
            ctx.strokeStyle = '#CFD8DC';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-this.size * 1.4, 0);
            ctx.lineTo(this.size * 1.4, 0);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, -this.size * 1.4);
            ctx.lineTo(0, this.size * 1.4);
            ctx.stroke();
            ctx.restore();
        } else if (this.type === 'apc') {
            // APC body
            ctx.fillStyle = this.team === 'player' ? this.color : '#ef5350';
            ctx.fillRect(screenX - this.size, screenY - this.size * 0.55, this.size * 2, this.size * 1.1);
            // Hatches
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(screenX - this.size * 0.6, screenY - this.size * 0.35, this.size * 0.4, this.size * 0.4);
            ctx.fillRect(screenX + this.size * 0.2, screenY - this.size * 0.35, this.size * 0.4, this.size * 0.4);
            // MG on top
            ctx.fillStyle = '#263238';
            ctx.fillRect(screenX - this.size * 0.1, screenY - this.size * 0.7, this.size * 0.2, this.size * 0.4);
            ctx.fillRect(screenX, screenY - this.size * 0.6, this.size * 0.6, this.size * 0.12);
        } else if (this.type === 'mortar') {
            // Two-person crew base
            ctx.fillStyle = this.team === 'player' ? this.color : '#ef5350';
            ctx.fillRect(screenX - this.size * 0.7, screenY, this.size * 1.4, this.size * 0.5);
            // Mortar tube (angled)
            ctx.save();
            ctx.translate(screenX, screenY);
            ctx.rotate(-Math.PI / 3.5);
            ctx.fillStyle = '#5D4037';
            ctx.fillRect(-this.size * 0.1, -this.size * 1.2, this.size * 0.22, this.size * 1.2);
            ctx.restore();
            // Crew dots
            ctx.fillStyle = '#4CAF50';
            ctx.beginPath(); ctx.arc(screenX - this.size * 0.4, screenY - this.size * 0.2, this.size * 0.3, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(screenX + this.size * 0.4, screenY - this.size * 0.2, this.size * 0.3, 0, Math.PI*2); ctx.fill();
        } else if (this.type === 'bazooka') {
            const bColor = this.team === 'player' ? this.color : '#ef5350';
            ctx.fillStyle = bColor;
            // Head
            ctx.beginPath();
            ctx.arc(screenX, screenY - this.size / 3, this.size / 3, 0, Math.PI * 2);
            ctx.fill();
            // Body
            ctx.fillRect(screenX - this.size / 3, screenY - this.size / 6, this.size * 2 / 3, this.size * 2 / 3);
            // Rocket tube on shoulder (horizontal, extending right)
            ctx.fillStyle = '#37474F';
            ctx.fillRect(screenX - this.size * 0.2, screenY - this.size * 0.35, this.size * 1.5, this.size * 0.22);
            // Rocket tip (orange cone)
            ctx.fillStyle = '#FF6F00';
            ctx.beginPath();
            ctx.moveTo(screenX + this.size * 1.3, screenY - this.size * 0.35);
            ctx.lineTo(screenX + this.size * 1.3, screenY - this.size * 0.13);
            ctx.lineTo(screenX + this.size * 1.65, screenY - this.size * 0.24);
            ctx.closePath();
            ctx.fill();
        } else if (this.type === 'general') {
            const gColor = this.team === 'player' ? '#FFD700' : '#FF1744';
            // Aura ring (pulsing)
            const pulse = 0.55 + Math.sin(Date.now() / 400) * 0.2;
            ctx.save();
            ctx.globalAlpha = pulse * 0.25;
            ctx.strokeStyle = gColor;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(screenX, screenY, this.auraRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.restore();
            // Body
            ctx.fillStyle = gColor;
            // Peaked cap
            ctx.beginPath();
            ctx.moveTo(screenX - this.size * 0.55, screenY - this.size * 0.6);
            ctx.lineTo(screenX + this.size * 0.55, screenY - this.size * 0.6);
            ctx.lineTo(screenX + this.size * 0.35, screenY - this.size * 1.0);
            ctx.lineTo(screenX - this.size * 0.35, screenY - this.size * 1.0);
            ctx.closePath();
            ctx.fill();
            // Cap brim
            ctx.fillRect(screenX - this.size * 0.6, screenY - this.size * 0.65, this.size * 1.2, this.size * 0.18);
            // Head
            ctx.beginPath();
            ctx.arc(screenX, screenY - this.size * 0.3, this.size * 0.32, 0, Math.PI * 2);
            ctx.fill();
            // Body/coat
            ctx.fillRect(screenX - this.size * 0.38, screenY - this.size * 0.05, this.size * 0.76, this.size * 0.75);
            // Gold star on chest
            ctx.fillStyle = this.team === 'player' ? '#FFFFFF' : '#FFD700';
            ctx.font = `bold ${Math.round(this.size * 0.55)}px Arial`;
            ctx.textAlign = 'center';
            ctx.fillText('★', screenX, screenY + this.size * 0.4);
            ctx.textAlign = 'left';
        } else if (this.type === 'medic') {
            // White body
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(screenX, screenY - this.size / 3, this.size / 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillRect(screenX - this.size / 3, screenY - this.size / 6, this.size * 2 / 3, this.size * 2 / 3);
            // Red cross
            ctx.fillStyle = '#F44336';
            ctx.fillRect(screenX - this.size * 0.08, screenY - this.size * 0.35, this.size * 0.16, this.size * 0.5);
            ctx.fillRect(screenX - this.size * 0.22, screenY - this.size * 0.22, this.size * 0.44, this.size * 0.16);
        } else {
            // Default circle for other units
            ctx.beginPath();
            ctx.arc(screenX, screenY, this.size, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore(); // end facing mirror

        // Selection indicator
        if (this.selected) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.shadowColor = '#FFD700';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(screenX, screenY, this.size + 4, 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Health bar
        const barWidth = this.size * 2;
        const barHeight = 4;
        const barX = screenX - barWidth / 2;
        const barY = screenY - this.size - 8;

        // Only show health bars when they carry information (damaged or selected) to cut clutter
        const hpFrac = Math.max(0, this.hp / this.maxHp);
        if (hpFrac < 0.999 || this.selected) {
            const barColor = hpFrac > 0.6 ? '#4CAF50' : hpFrac > 0.3 ? '#FF9800' : '#f44336';
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);
            ctx.fillStyle = '#222';
            ctx.fillRect(barX, barY, barWidth, barHeight);
            ctx.fillStyle = barColor;
            ctx.fillRect(barX, barY, barWidth * hpFrac, barHeight);
        }

        // Command-aura indicator: small gold chevron on boosted units
        if (this.commandBoost && this.type !== 'general') {
            ctx.fillStyle = this.team === 'player' ? '#FFD700' : '#FF8A80';
            ctx.beginPath();
            ctx.moveTo(screenX + this.size + 2, barY - 1);
            ctx.lineTo(screenX + this.size + 6, barY + 3);
            ctx.lineTo(screenX + this.size + 10, barY - 1);
            ctx.lineTo(screenX + this.size + 10, barY + 2);
            ctx.lineTo(screenX + this.size + 6, barY + 6);
            ctx.lineTo(screenX + this.size + 2, barY + 2);
            ctx.closePath();
            ctx.fill();
        }

        if (this.veterancy > 0) {
            ctx.fillStyle = this.veterancy === 3 ? '#FF6B35' : this.veterancy === 2 ? '#E0E0E0' : '#FFD700';
            ctx.font = `${Math.round(this.size * 0.9)}px Arial`;
            ctx.textAlign = 'center';
            const stars = '★'.repeat(this.veterancy);
            ctx.fillText(stars, screenX, barY - 2);
        }

        // Harvester carrying indicator
        if (this.type === 'harvester' && this.carrying > 0) {
            ctx.fillStyle = '#FFD700';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(Math.floor(this.carrying), screenX, screenY + this.size + 12);
        }

        // Target line
        if (this.target && this.selected) {
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(screenX, screenY);
            ctx.lineTo(this.target.x - camera.x, this.target.y - camera.y);
            ctx.stroke();
            ctx.setLineDash([]);
        } else if (this.selected && (this.forcedMove || this.attackMove || this.garrisonTarget)) {
            // Waypoint line: green = move, orange = attack-move, cyan = garrison
            ctx.strokeStyle = this.garrisonTarget ? 'rgba(0,229,255,0.5)'
                : this.attackMove ? 'rgba(255,152,0,0.5)' : 'rgba(118,255,3,0.45)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 6]);
            ctx.beginPath();
            ctx.moveTo(screenX, screenY);
            ctx.lineTo(this.destX - camera.x, this.destY - camera.y);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }
}

function createUnit(type, x, y, team) {
    return new Unit(type, x, y, team);
}

// ========== BUILDINGS ==========
class Building {
    constructor(type, x, y, team) {
        this.type = type;
        this.x = x;
        this.y = y;
        this.team = team;
        this.selected = false;

        this.setStats(type);
    }

    setStats(type) {
        const stats = {
            hq: {
                maxHp: 500,
                width: 80,
                height: 80,
                color: '#1976D2',
                provides: 'command',
                visionRadius: 280
            },
            barracks: {
                maxHp: 300,
                width: 60,
                height: 60,
                color: '#388E3C',
                provides: 'infantry',
                visionRadius: 200
            },
            factory: {
                maxHp: 400,
                width: 70,
                height: 70,
                color: '#F57C00',
                provides: 'vehicles',
                visionRadius: 200
            },
            power: {
                maxHp: 200,
                width: 50,
                height: 50,
                color: '#FBC02D',
                provides: 'power',
                visionRadius: 160
            },
            refinery: {
                maxHp: 350,
                width: 65,
                height: 65,
                color: '#7B1FA2',
                provides: 'credits',
                visionRadius: 160
            },
            sandbag: {
                maxHp: 100,
                width: 50,
                height: 25,
                color: '#8B7355',
                provides: 'defense',
                visionRadius: 120
            },
            turret: {
                maxHp: 150,
                width: 35,
                height: 35,
                color: '#546E7A',
                provides: 'defense',
                damage: 15,
                range: 250,
                attackSpeed: 1.5,
                visionRadius: 280
            },
            missile_silo: {
                maxHp: 250,
                width: 70,
                height: 70,
                color: '#37474F',
                provides: 'offense',
                visionRadius: 200
            },
            aa_battery: {
                maxHp: 175,
                width: 42,
                height: 42,
                color: '#00695C',
                provides: 'defense',
                visionRadius: 400
            }
        };

        const buildingStats = stats[type] || stats.hq;
        Object.assign(this, buildingStats);
        this.hp = this.maxHp;

        // Turret-specific properties
        if (type === 'turret') {
            this.target = null;
            this.attackCooldown = 0;
        }

        // Missile silo-specific properties
        if (type === 'missile_silo') {
            this.nukeCooldown = 0;
            this.maxNukeCooldown = 90;
        }

        // AA battery-specific properties
        if (type === 'aa_battery') {
            this.interceptCooldown = 0;
            this.maxInterceptCooldown = 12;
            this.interceptRange = 480;
            this.radarAngle = 0;
            this.interceptsTotal = 0;
        }

        this.repairing = false;
        this.garrison = [];
        this.maxGarrison = this.type === 'sandbag' ? 2 : 4;
        this.garrisonAttackCooldown = 0;
    }

    update(deltaTime, game) {
        // Turret automatic targeting and shooting
        if (this.type === 'turret') {
            // Update attack cooldown
            if (this.attackCooldown > 0) {
                this.attackCooldown -= deltaTime;
            }

            // Find target if we don't have one
            if (!this.target || this.target.hp <= 0 || this.target.garrisonedIn) {
                this.findTarget(game);
            }

            // Attack target if in range
            if (this.target) {
                const dx = this.target.x - this.x;
                const dy = this.target.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist <= this.range && this.attackCooldown <= 0) {
                    // Create projectile
                    const projectile = new Projectile(
                        this.x,
                        this.y,
                        this.target,
                        this.damage,
                        500, // projectile speed
                        4, // projectile size
                        '#FFD700', // color
                        'turret_bullet',
                        null,
                        game
                    );
                    game.projectiles.push(projectile);
                    this.attackCooldown = this.attackSpeed;
                    game.sfx.play('shot', this.x, this.y);
                } else if (dist > this.range) {
                    // Target out of range
                    this.target = null;
                }
            }
        }

        // Missile silo cooldown tick
        if (this.type === 'missile_silo') {
            if (this.nukeCooldown > 0) {
                this.nukeCooldown = Math.max(0, this.nukeCooldown - deltaTime);
            }
        }

        // AA battery — intercept incoming nukes
        if (this.type === 'aa_battery') {
            this.radarAngle += deltaTime * 2.5; // rotate radar dish
            if (this.interceptCooldown > 0) this.interceptCooldown -= deltaTime;

            if (this.interceptCooldown <= 0) {
                const target = game.nukes.find(n => {
                    if (n.team === this.team) return false; // don't shoot own nukes
                    const dx = n.x - this.x, dy = n.y - this.y;
                    return Math.sqrt(dx * dx + dy * dy) <= this.interceptRange;
                });
                if (target) {
                    // Burst of cyan particles at intercept point
                    for (let i = 0; i < 18; i++) {
                        const angle = (i / 18) * Math.PI * 2;
                        // Particle velocities are px/frame @60fps — keep them small or they vanish instantly
                        const spd = 2 + Math.random() * 3;
                        const cp = new Particle(
                            target.x, target.y, '#00E5FF',
                            4 + Math.random() * 4,
                            Math.cos(angle) * spd, Math.sin(angle) * spd
                        );
                        cp.gravity = 0.05;
                        game.particles.push(cp);
                    }
                    game.createExplosion(target.x, target.y, 30, '#00E5FF', false);
                    // Orange flash at battery
                    for (let i = 0; i < 8; i++) {
                        const angle = Math.random() * Math.PI * 2;
                        const op = new Particle(
                            this.x, this.y, '#FF6F00',
                            3 + Math.random() * 3,
                            Math.cos(angle) * 2, Math.sin(angle) * 2 - 1
                        );
                        op.decay = 0.06;
                        game.particles.push(op);
                    }
                    if (this.team === game.playerTeam) game.addRadioMessage('🛰 Nuke intercepted!', '#00E5FF');
                    game.sfx.play('intercept', target.x, target.y);
                    target.dead = true;
                    this.interceptCooldown = this.maxInterceptCooldown;
                    this.interceptsTotal++;
                }
            }
        }

        // Repair over time: 15 HP/sec, costs 3 credits/sec
        if (this.repairing && this.team === game.playerTeam) {
            const repairRate = 15;   // HP per second
            const creditRate = 3;    // credits per second
            const cost = creditRate * deltaTime;
            if (this.hp >= this.maxHp) {
                this.repairing = false;
                game.updateUI();
            } else if (game.resources.credits >= cost) {
                game.resources.credits -= cost;
                this.hp = Math.min(this.maxHp, this.hp + repairRate * deltaTime);
            } else {
                this.repairing = false; // ran out of money
                game.updateUI();
            }
        }

        // Garrison combat
        if (this.garrison.length > 0) {
            if (this.garrisonAttackCooldown > 0) this.garrisonAttackCooldown -= deltaTime;
            if (this.garrisonAttackCooldown <= 0) {
                const garrisonRange = 280;
                const enemy = game.units.find(u => {
                    if (u.team === this.team || u.garrisonedIn || u.hp <= 0) return false;
                    const dx = u.x - this.x, dy = u.y - this.y;
                    return Math.sqrt(dx*dx+dy*dy) <= garrisonRange;
                });
                if (enemy) {
                    const shooter = this.garrison[Math.floor(Math.random() * this.garrison.length)];
                    const dmg = (shooter.damage || 5) * 1.5; // 50% bonus inside building
                    game.projectiles.push(new Projectile(this.x, this.y, enemy, dmg, 450, 3, shooter.color || '#4CAF50', 'garrison_bullet', shooter, game));
                    game.sfx.play('shot', this.x, this.y);
                    this.garrisonAttackCooldown = (shooter.attackSpeed || 1.0) / this.garrison.length;
                }
            }
        }
    }

    findTarget(game) {
        let nearestTarget = null;
        let minDist = Infinity;

        // Check units
        game.units.forEach(unit => {
            if (unit.team !== this.team && unit.type !== 'harvester' && !unit.garrisonedIn && unit.hp > 0) {
                const dx = unit.x - this.x;
                const dy = unit.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist <= this.range && dist < minDist) {
                    minDist = dist;
                    nearestTarget = unit;
                }
            }
        });

        // Check buildings if no units found
        if (!nearestTarget) {
            game.buildings.forEach(building => {
                if (building.team !== this.team) {
                    const dx = building.x - this.x;
                    const dy = building.y - this.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist <= this.range && dist < minDist) {
                        minDist = dist;
                        nearestTarget = building;
                    }
                }
            });
        }

        this.target = nearestTarget;
    }

    render(ctx, camera) {
        const screenX = this.x - camera.x - this.width / 2;
        const screenY = this.y - camera.y - this.height / 2;

        // Drop shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(screenX + 5, screenY + 5, this.width, this.height);

        // Custom rendering for sandbags
        if (this.type === 'sandbag') {
            // Draw stacked sandbags
            ctx.fillStyle = this.color;

            // Bottom row (3 bags)
            for (let i = 0; i < 3; i++) {
                ctx.fillRect(
                    screenX + (i * this.width / 3),
                    screenY + this.height / 2,
                    this.width / 3 - 2,
                    this.height / 2
                );
            }

            // Top row (2 bags, offset)
            for (let i = 0; i < 2; i++) {
                ctx.fillRect(
                    screenX + this.width / 6 + (i * this.width / 3),
                    screenY,
                    this.width / 3 - 2,
                    this.height / 2
                );
            }

            // Draw borders
            ctx.strokeStyle = this.selected ? '#fff' : '#000';
            ctx.lineWidth = this.selected ? 2 : 1;
            ctx.strokeRect(screenX, screenY, this.width, this.height);
        }
        // Custom rendering for turrets
        else if (this.type === 'turret') {
            ctx.fillStyle = this.team === 'player' ? this.color : '#B71C1C';

            // Draw base (wider platform)
            ctx.fillRect(
                screenX - 5,
                screenY + this.height * 0.6,
                this.width + 10,
                this.height * 0.4
            );

            // Draw turret body (cylinder-ish)
            ctx.beginPath();
            ctx.arc(
                this.x - camera.x,
                this.y - camera.y,
                this.width / 2.5,
                0,
                Math.PI * 2
            );
            ctx.fill();

            // Draw gun barrel pointing at target
            let barrelAngle = 0;
            if (this.target) {
                const dx = this.target.x - this.x;
                const dy = this.target.y - this.y;
                barrelAngle = Math.atan2(dy, dx);
            }

            ctx.save();
            ctx.translate(this.x - camera.x, this.y - camera.y);
            ctx.rotate(barrelAngle);
            ctx.fillStyle = '#37474F'; // Darker gray for barrel
            ctx.fillRect(0, -3, this.width / 1.5, 6);
            ctx.restore();

            // Draw border
            ctx.strokeStyle = this.selected ? '#fff' : '#000';
            ctx.lineWidth = this.selected ? 3 : 2;
            ctx.beginPath();
            ctx.arc(
                this.x - camera.x,
                this.y - camera.y,
                this.width / 2.5,
                0,
                Math.PI * 2
            );
            ctx.stroke();

            // Draw range indicator when selected
            if (this.selected) {
                ctx.strokeStyle = 'rgba(255, 255, 0, 0.3)';
                ctx.lineWidth = 1;
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.arc(
                    this.x - camera.x,
                    this.y - camera.y,
                    this.range,
                    0,
                    Math.PI * 2
                );
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
        // HQ - Command center with antenna
        else if (this.type === 'hq') {
            ctx.fillStyle = this.team === 'player' ? this.color : '#B71C1C';

            // Main building
            ctx.fillRect(screenX, screenY + 15, this.width, this.height - 15);

            // Roof
            ctx.fillStyle = this.team === 'player' ? '#0D47A1' : '#8B0000';
            ctx.beginPath();
            ctx.moveTo(screenX - 5, screenY + 15);
            ctx.lineTo(this.x - camera.x, screenY);
            ctx.lineTo(screenX + this.width + 5, screenY + 15);
            ctx.closePath();
            ctx.fill();

            // Antenna
            ctx.strokeStyle = '#666';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(this.x - camera.x, screenY);
            ctx.lineTo(this.x - camera.x, screenY - 15);
            ctx.stroke();

            // Flag
            ctx.fillStyle = this.team === 'player' ? '#00ff00' : '#ff0000';
            ctx.beginPath();
            ctx.moveTo(this.x - camera.x, screenY - 15);
            ctx.lineTo(this.x - camera.x + 10, screenY - 12);
            ctx.lineTo(this.x - camera.x, screenY - 9);
            ctx.fill();

            // Windows
            ctx.fillStyle = '#FFD700';
            for (let i = 0; i < 3; i++) {
                ctx.fillRect(screenX + 10 + i * 20, screenY + 25, 12, 12);
            }

            // Border
            ctx.strokeStyle = this.selected ? '#fff' : '#000';
            ctx.lineWidth = this.selected ? 3 : 2;
            ctx.strokeRect(screenX, screenY + 15, this.width, this.height - 15);
        }
        // Barracks - Military building with door
        else if (this.type === 'barracks') {
            ctx.fillStyle = this.team === 'player' ? this.color : '#B71C1C';
            ctx.fillRect(screenX, screenY, this.width, this.height);

            // Door
            ctx.fillStyle = '#4E342E';
            ctx.fillRect(screenX + this.width / 2 - 10, screenY + this.height - 20, 20, 20);

            // Windows (small rectangular)
            ctx.fillStyle = '#90CAF9';
            ctx.fillRect(screenX + 10, screenY + 10, 12, 10);
            ctx.fillRect(screenX + this.width - 22, screenY + 10, 12, 10);

            // Roof detail
            ctx.fillStyle = this.team === 'player' ? '#2E7D32' : '#8B0000';
            ctx.fillRect(screenX - 2, screenY, this.width + 4, 5);

            // Border
            ctx.strokeStyle = this.selected ? '#fff' : '#000';
            ctx.lineWidth = this.selected ? 3 : 2;
            ctx.strokeRect(screenX, screenY, this.width, this.height);
        }
        // Factory - Industrial building with large door
        else if (this.type === 'factory') {
            ctx.fillStyle = this.team === 'player' ? this.color : '#B71C1C';
            ctx.fillRect(screenX, screenY, this.width, this.height);

            // Large garage door
            ctx.fillStyle = '#424242';
            ctx.fillRect(screenX + 10, screenY + this.height - 35, this.width - 20, 30);

            // Door segments
            ctx.strokeStyle = '#212121';
            ctx.lineWidth = 2;
            for (let i = 1; i < 4; i++) {
                ctx.beginPath();
                ctx.moveTo(screenX + 10, screenY + this.height - 35 + i * 8);
                ctx.lineTo(screenX + this.width - 10, screenY + this.height - 35 + i * 8);
                ctx.stroke();
            }

            // Smokestack
            ctx.fillStyle = '#616161';
            ctx.fillRect(screenX + this.width - 15, screenY - 10, 8, 15);

            // Smoke
            ctx.fillStyle = 'rgba(150, 150, 150, 0.5)';
            ctx.beginPath();
            ctx.arc(screenX + this.width - 11, screenY - 12, 6, 0, Math.PI * 2);
            ctx.fill();

            // Border
            ctx.strokeStyle = this.selected ? '#fff' : '#000';
            ctx.lineWidth = this.selected ? 3 : 2;
            ctx.strokeRect(screenX, screenY, this.width, this.height);
        }
        // Power Plant - Building with cooling towers
        else if (this.type === 'power') {
            ctx.fillStyle = this.team === 'player' ? this.color : '#B71C1C';
            ctx.fillRect(screenX, screenY + 10, this.width, this.height - 10);

            // Cooling towers
            ctx.fillStyle = '#BDBDBD';
            ctx.beginPath();
            ctx.ellipse(screenX + 15, screenY + 15, 8, 15, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(screenX + this.width - 15, screenY + 15, 8, 15, 0, 0, Math.PI * 2);
            ctx.fill();

            // Steam from towers
            ctx.fillStyle = 'rgba(200, 200, 200, 0.6)';
            ctx.beginPath();
            ctx.arc(screenX + 15, screenY, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(screenX + this.width - 15, screenY, 6, 0, Math.PI * 2);
            ctx.fill();

            // Power symbol
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('⚡', this.x - camera.x, this.y - camera.y + 5);

            // Border
            ctx.strokeStyle = this.selected ? '#fff' : '#000';
            ctx.lineWidth = this.selected ? 3 : 2;
            ctx.strokeRect(screenX, screenY + 10, this.width, this.height - 10);
        }
        // Refinery - Processing facility with tanks
        else if (this.type === 'refinery') {
            ctx.fillStyle = this.team === 'player' ? this.color : '#B71C1C';
            ctx.fillRect(screenX, screenY + 15, this.width, this.height - 15);

            // Storage tanks on top
            ctx.fillStyle = '#9C27B0';
            ctx.beginPath();
            ctx.arc(screenX + 15, screenY + 15, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(screenX + 35, screenY + 15, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(screenX + this.width - 15, screenY + 15, 10, 0, Math.PI * 2);
            ctx.fill();

            // Pipes
            ctx.strokeStyle = '#757575';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(screenX + 15, screenY + 25);
            ctx.lineTo(screenX + 15, screenY + 30);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(screenX + 35, screenY + 25);
            ctx.lineTo(screenX + 35, screenY + 30);
            ctx.stroke();

            // Dollar sign (credits)
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('$', this.x - camera.x, this.y - camera.y + 5);

            // Border
            ctx.strokeStyle = this.selected ? '#fff' : '#000';
            ctx.lineWidth = this.selected ? 3 : 2;
            ctx.strokeRect(screenX, screenY + 15, this.width, this.height - 15);
        }
        else if (this.type === 'missile_silo') {
            const cx = this.x - camera.x;
            const cy = this.y - camera.y;
            const baseColor = this.team === 'player' ? '#37474F' : '#4a1a1a';

            // Concrete base pad
            ctx.fillStyle = baseColor;
            ctx.fillRect(screenX, screenY, this.width, this.height);
            ctx.strokeStyle = this.selected ? '#fff' : '#000';
            ctx.lineWidth = this.selected ? 3 : 2;
            ctx.strokeRect(screenX, screenY, this.width, this.height);

            // Launch rails
            ctx.fillStyle = '#607D8B';
            ctx.fillRect(cx - 14, cy - 18, 5, 30);
            ctx.fillRect(cx + 9, cy - 18, 5, 30);

            // Missile body
            const ready = this.nukeCooldown <= 0;
            ctx.fillStyle = ready ? '#9E9E9E' : '#616161';
            ctx.fillRect(cx - 6, cy - 24, 12, 30);

            // Nosecone
            ctx.fillStyle = ready ? '#F44336' : '#880000';
            ctx.beginPath();
            ctx.moveTo(cx - 6, cy - 24);
            ctx.lineTo(cx + 6, cy - 24);
            ctx.lineTo(cx, cy - 36);
            ctx.closePath();
            ctx.fill();

            // Fins
            ctx.fillStyle = '#546E7A';
            ctx.fillRect(cx - 10, cy + 3, 4, 6);
            ctx.fillRect(cx + 6, cy + 3, 4, 6);

            // Cooldown indicator
            if (!ready) {
                const frac = 1 - this.nukeCooldown / this.maxNukeCooldown;
                ctx.strokeStyle = '#FF5722';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(cx, cy + 20, 11, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
                ctx.stroke();
                ctx.fillStyle = '#ccc';
                ctx.font = '9px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(Math.ceil(this.nukeCooldown) + 's', cx, cy + 24);
            } else {
                // Ready indicator: green pulse dot
                ctx.fillStyle = '#4CAF50';
                ctx.beginPath();
                ctx.arc(cx, cy + 20, 9, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 8px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('RDY', cx, cy + 23);
            }
        }
        else if (this.type === 'aa_battery') {
            const cx = this.x - camera.x;
            const cy = this.y - camera.y;
            const teamColor = this.team === 'player' ? '#00695C' : '#6A1010';

            // Base pad
            ctx.fillStyle = teamColor;
            ctx.fillRect(screenX, screenY, this.width, this.height);
            ctx.strokeStyle = this.selected ? '#fff' : '#000';
            ctx.lineWidth = this.selected ? 3 : 2;
            ctx.strokeRect(screenX, screenY, this.width, this.height);

            // Rotating radar dish arm
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(this.radarAngle);
            ctx.strokeStyle = '#00E5FF';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(0, -16);
            ctx.stroke();
            ctx.fillStyle = '#00E5FF';
            ctx.fillRect(-6, -18, 12, 4);
            ctx.restore();

            // Ready / recharging indicator
            const ready = this.interceptCooldown <= 0;
            ctx.fillStyle = ready ? '#00E5FF' : '#FF6F00';
            ctx.beginPath();
            ctx.arc(cx, cy + 14, 5, 0, Math.PI * 2);
            ctx.fill();

            if (!ready) {
                const frac = 1 - this.interceptCooldown / this.maxInterceptCooldown;
                ctx.strokeStyle = '#00E5FF';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(cx, cy + 14, 8, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
                ctx.stroke();
            }

            // Range ring when selected
            if (this.selected) {
                ctx.strokeStyle = 'rgba(0,229,255,0.25)';
                ctx.lineWidth = 1;
                ctx.setLineDash([6, 4]);
                ctx.beginPath();
                ctx.arc(cx, cy, this.interceptRange, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        // Default fallback
        else {
            ctx.fillStyle = this.team === 'player' ? this.color : '#B71C1C';
            ctx.fillRect(screenX, screenY, this.width, this.height);

            ctx.strokeStyle = this.selected ? '#fff' : '#000';
            ctx.lineWidth = this.selected ? 3 : 2;
            ctx.strokeRect(screenX, screenY, this.width, this.height);

            ctx.fillStyle = '#fff';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(this.type.toUpperCase(), this.x - camera.x, this.y - camera.y + 4);
        }

        // Selection glow ring
        if (this.selected) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            ctx.shadowColor = '#FFD700';
            ctx.shadowBlur = 12;
            ctx.strokeRect(screenX - 2, screenY - 2, this.width + 4, this.height + 4);
            ctx.shadowBlur = 0;
        }

        // Health bar (for all buildings)
        const barWidth = this.width;
        const barHeight = 6;
        const barX = screenX;
        const barY = screenY - 10;

        const hpFrac = this.hp / this.maxHp;
        const barColor = hpFrac > 0.6 ? '#4CAF50' : hpFrac > 0.3 ? '#FF9800' : '#f44336';
        // Background + border
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);
        ctx.fillStyle = '#222';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        ctx.fillStyle = barColor;
        ctx.fillRect(barX, barY, barWidth * hpFrac, barHeight);

        if (this.garrison && this.garrison.length > 0) {
            const cx = this.x - camera.x;
            const cy = this.y - camera.y;
            ctx.fillStyle = '#00E5FF';
            ctx.font = `bold ${Math.round(this.width * 0.22)}px Arial`;
            ctx.textAlign = 'center';
            ctx.fillText(`G${this.garrison.length}`, cx, cy - this.height/2 - 14);
        }
    }
}

function createBuilding(type, x, y, team) {
    return new Building(type, x, y, team);
}

// ========== INPUT HANDLER ==========
class InputHandler {
    constructor(game) {
        this.game = game;
        this.canvas = game.canvas;

        this.mouseX = 0;
        this.mouseY = 0;
        this.mouseWorldPos = null;
        this.mouseDown = false;
        this.dragStart = null;
        this.dragEnd = null;

        this.cameraDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.mouseOnCanvas = false;

        this.hoveredEnemy = null; // Track which enemy is being hovered
        this.hoveredDeposit = null; // Track which ore deposit is being hovered

        this.keysDown = new Set();      // held keys, for smooth arrow-key scrolling
        this.lastGroupKey = null;       // for double-tap-to-center on control groups
        this.lastGroupTime = 0;

        this.setupListeners();
    }

    setupListeners() {
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('mouseenter', () => { this.mouseOnCanvas = true; });
        this.canvas.addEventListener('mouseleave', () => { this.mouseOnCanvas = false; });
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.onRightClick(e);
        });

        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.keysDown.delete(e.key));
        // Drop held keys when the window loses focus so the camera doesn't keep scrolling
        window.addEventListener('blur', () => this.keysDown.clear());

        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
        });

        // Keep canvas pixel buffer in sync with its CSS display size
        window.addEventListener('resize', () => this.game.resizeCanvas());
        this.game.resizeCanvas();
    }

    // Convert a mouse event to game-unit coordinates
    getCanvasPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (this.game.camera.width / rect.width),
            y: (e.clientY - rect.top) * (this.game.camera.height / rect.height)
        };
    }

    onMouseDown(e) {
        const pos = this.getCanvasPos(e);
        this.mouseX = pos.x;
        this.mouseY = pos.y;

        if (e.button === 1) {
            this.cameraDragging = true;
            this.lastMouseX = this.mouseX;
            this.lastMouseY = this.mouseY;
            return;
        }

        if (e.button === 0) {
            const worldX = this.mouseX + this.game.camera.x;
            const worldY = this.mouseY + this.game.camera.y;

            if (this.game.nukeTargeting) {
                this.game.launchNukeAt(worldX, worldY);
                return;
            }

            if (this.game.buildMode) {
                this.game.placeBuilding(worldX, worldY);
                return;
            }

            // Handle command modes (move/attack)
            if (this.game.commandMode === 'move') {
                this.executeMove(worldX, worldY);
                this.game.commandMode = null;
                this.canvas.style.cursor = 'crosshair';
                this.game.updateUI();
                return;
            }

            if (this.game.commandMode === 'attack') {
                this.executeAttack(worldX, worldY);
                this.game.commandMode = null;
                this.canvas.style.cursor = 'crosshair';
                this.game.updateUI();
                return;
            }

            this.mouseDown = true;
            this.dragStart = {
                x: this.mouseX + this.game.camera.x,
                y: this.mouseY + this.game.camera.y
            };
            this.dragEnd = { ...this.dragStart };
        }
    }

    onMouseMove(e) {
        const pos = this.getCanvasPos(e);
        this.mouseX = pos.x;
        this.mouseY = pos.y;

        this.mouseWorldPos = {
            x: this.mouseX + this.game.camera.x,
            y: this.mouseY + this.game.camera.y
        };

        if (this.cameraDragging) {
            const dx = this.mouseX - this.lastMouseX;
            const dy = this.mouseY - this.lastMouseY;

            this.game.camera.x -= dx;
            this.game.camera.y -= dy;

            this.game.camera.x = Math.max(0, Math.min(this.game.camera.x,
                this.game.worldWidth - this.game.camera.width));
            this.game.camera.y = Math.max(0, Math.min(this.game.camera.y,
                this.game.worldHeight - this.game.camera.height));

            this.lastMouseX = this.mouseX;
            this.lastMouseY = this.mouseY;
            return;
        }

        if (this.mouseDown && this.dragStart) {
            this.dragEnd = {
                x: this.mouseX + this.game.camera.x,
                y: this.mouseY + this.game.camera.y
            };
        }

        // Update cursor based on what we're hovering over
        this.hoveredEnemy = null; // Reset hovered enemy
        this.hoveredDeposit = null; // Reset hovered deposit

        if (this.game.selectedUnits.length > 0 && !this.game.buildMode && !this.game.commandMode) {
            const worldX = this.mouseX + this.game.camera.x;
            const worldY = this.mouseY + this.game.camera.y;

            // Check if any selected units are harvesters
            const hasHarvesterSelected = this.game.selectedUnits.some(u => u.type === 'harvester');

            // If harvesters are selected, check for ore deposits first
            if (hasHarvesterSelected) {
                for (const deposit of this.game.resourceDeposits) {
                    if (deposit.amount > 0) {
                        const dx = worldX - deposit.x;
                        const dy = worldY - deposit.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);

                        if (dist <= 25) { // Click radius for deposits
                            this.hoveredDeposit = deposit;
                            break;
                        }
                    }
                }
            }

            // If not hovering deposit, check enemies
            if (!this.hoveredDeposit) {
                // Check units
                for (const unit of this.game.units) {
                    if (unit.team !== this.game.playerTeam && !unit.garrisonedIn && this.game.isVisibleToPlayer(unit.x, unit.y)) {
                        const dx = worldX - unit.x;
                        const dy = worldY - unit.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);

                        if (dist <= unit.size * 2) {
                            this.hoveredEnemy = unit;
                            break;
                        }
                    }
                }

                // Check buildings
                if (!this.hoveredEnemy) {
                    for (const building of this.game.buildings) {
                        if (building.team !== this.game.playerTeam) {
                            if (worldX >= building.x - building.width / 2 &&
                                worldX <= building.x + building.width / 2 &&
                                worldY >= building.y - building.height / 2 &&
                                worldY <= building.y + building.height / 2) {
                                this.hoveredEnemy = building;
                                break;
                            }
                        }
                    }
                }
            }

            // Set cursor based on what we're hovering
            if (this.hoveredEnemy) {
                this.canvas.style.cursor = 'crosshair';
            } else if (this.hoveredDeposit) {
                this.canvas.style.cursor = 'cell';
            } else {
                this.canvas.style.cursor = 'default';
            }
        } else if (!this.game.buildMode && !this.game.commandMode && !this.game.nukeTargeting) {
            this.canvas.style.cursor = 'default';
        }

    }

    onMouseUp(e) {
        if (e.button === 1) {
            this.cameraDragging = false;
            return;
        }

        if (e.button === 0 && this.mouseDown) {
            this.mouseDown = false;

            if (this.dragStart && this.dragEnd) {
                const minX = Math.min(this.dragStart.x, this.dragEnd.x);
                const maxX = Math.max(this.dragStart.x, this.dragEnd.x);
                const minY = Math.min(this.dragStart.y, this.dragEnd.y);
                const maxY = Math.max(this.dragStart.y, this.dragEnd.y);

                const isDrag = Math.abs(maxX - minX) > 5 || Math.abs(maxY - minY) > 5;

                if (isDrag) {
                    this.selectUnitsInBox(minX, minY, maxX, maxY, e.shiftKey);
                } else {
                    // It's a click - first check if clicking on a friendly unit/building to select it
                    const clickedOnFriendly = this.checkClickOnFriendly(this.dragStart.x, this.dragStart.y);

                    if (clickedOnFriendly) {
                        // Clicking on friendly unit/building - select it (Shift toggles units in/out)
                        this.selectAtPoint(this.dragStart.x, this.dragStart.y, e.shiftKey);
                    } else if (this.game.selectedUnits.length > 0) {
                        // Units are selected and not clicking on friendly - perform move or attack action
                        this.executeLeftClickAction(this.dragStart.x, this.dragStart.y);
                    } else {
                        // No units selected and not clicking on anything - deselect
                        this.selectAtPoint(this.dragStart.x, this.dragStart.y);
                    }
                }

                this.dragStart = null;
                this.dragEnd = null;
                this.game.updateUI();
            }
        }
    }

    checkClickOnFriendly(worldX, worldY) {
        // Check if clicking on a friendly unit
        for (const unit of this.game.units) {
            if (unit.team === this.game.playerTeam && !unit.garrisonedIn) {
                const dx = worldX - unit.x;
                const dy = worldY - unit.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist <= unit.size) {
                    return true;
                }
            }
        }

        // Check if clicking on a friendly building
        for (const building of this.game.buildings) {
            if (building.team === this.game.playerTeam) {
                if (worldX >= building.x - building.width / 2 &&
                    worldX <= building.x + building.width / 2 &&
                    worldY >= building.y - building.height / 2 &&
                    worldY <= building.y + building.height / 2) {
                    return true;
                }
            }
        }

        return false;
    }

    executeLeftClickAction(worldX, worldY) {
        // Check if clicking on ore deposit (for harvesters)
        let clickedDeposit = null;
        const hasHarvesterSelected = this.game.selectedUnits.some(u => u.type === 'harvester');

        if (hasHarvesterSelected) {
            for (const deposit of this.game.resourceDeposits) {
                if (deposit.amount > 0) {
                    const dx = worldX - deposit.x;
                    const dy = worldY - deposit.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist <= 25) {
                        clickedDeposit = deposit;
                        break;
                    }
                }
            }
        }

        // Check if clicking on enemy
        let clickedEnemy = null;

        if (!clickedDeposit) {
            // Check units
            for (const unit of this.game.units) {
                if (unit.team !== this.game.playerTeam && !unit.garrisonedIn && this.game.isVisibleToPlayer(unit.x, unit.y)) {
                    const dx = worldX - unit.x;
                    const dy = worldY - unit.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist <= unit.size * 2) {
                        clickedEnemy = unit;
                        break;
                    }
                }
            }

            // Check buildings
            if (!clickedEnemy) {
                for (const building of this.game.buildings) {
                    if (building.team !== this.game.playerTeam) {
                        if (worldX >= building.x - building.width / 2 &&
                            worldX <= building.x + building.width / 2 &&
                            worldY >= building.y - building.height / 2 &&
                            worldY <= building.y + building.height / 2) {
                            clickedEnemy = building;
                            break;
                        }
                    }
                }
            }
        }

        // Command selected units
        const movers = [];
        this.game.selectedUnits.forEach(unit => {
            if (clickedDeposit && unit.type === 'harvester') {
                // Harvester - target the ore deposit
                unit.targetDeposit = clickedDeposit;
                // Don't reset carrying - let harvester deposit first if full, then come back
            } else if (clickedEnemy) {
                // Attack enemy
                unit.attackTarget(clickedEnemy);
            } else {
                movers.push(unit);
            }
        });
        // Move to location in a loose formation instead of piling onto one pixel
        this.game.issueGroupMove(movers, worldX, worldY);
        if (clickedEnemy) this.game.addOrderMarker(clickedEnemy.x, clickedEnemy.y, '#FF1744');
    }

    onRightClick(e) {
        const pos = this.getCanvasPos(e);
        const worldX = pos.x + this.game.camera.x;
        const worldY = pos.y + this.game.camera.y;

        // Right-click cancels any active mode
        if (this.game.buildMode || this.game.commandMode || this.game.nukeTargeting) {
            this.game.buildMode = null;
            this.game.commandMode = null;
            this.game.nukeTargeting = false;
            this.canvas.style.cursor = 'crosshair';
            this.game.updateUI();
            return;
        }

        // Right-click with a missile silo selected: fire at clicked location
        if (this.game.selectedBuilding && this.game.selectedBuilding.type === 'missile_silo') {
            this.game.launchNukeAt(worldX, worldY);
            return;
        }

        // Check if clicking on ore deposit (for harvesters)
        let clickedDeposit = null;
        const hasHarvesterSelected = this.game.selectedUnits.some(u => u.type === 'harvester');

        if (hasHarvesterSelected) {
            for (const deposit of this.game.resourceDeposits) {
                if (deposit.amount > 0) {
                    const dx = worldX - deposit.x;
                    const dy = worldY - deposit.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist <= 25) {
                        clickedDeposit = deposit;
                        break;
                    }
                }
            }
        }

        let clickedEnemy = null;

        if (!clickedDeposit) {
            for (const unit of this.game.units) {
                if (unit.team !== this.game.playerTeam && !unit.garrisonedIn && this.game.isVisibleToPlayer(unit.x, unit.y)) {
                    const dx = worldX - unit.x;
                    const dy = worldY - unit.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist <= unit.size) {
                        clickedEnemy = unit;
                        break;
                    }
                }
            }

            if (!clickedEnemy) {
                for (const building of this.game.buildings) {
                    if (building.team !== this.game.playerTeam) {
                        if (worldX >= building.x - building.width / 2 &&
                            worldX <= building.x + building.width / 2 &&
                            worldY >= building.y - building.height / 2 &&
                            worldY <= building.y + building.height / 2) {
                            clickedEnemy = building;
                            break;
                        }
                    }
                }
            }
        }

        if (this.game.selectedUnits.length > 0) {
            // Check if right-clicking a friendly building to garrison
            const hasSoldiersSelected = this.game.selectedUnits.some(u => ['soldier','sniper','commando'].includes(u.type));
            if (hasSoldiersSelected) {
                for (const building of this.game.buildings) {
                    if (building.team === this.game.playerTeam &&
                        worldX >= building.x - building.width/2 && worldX <= building.x + building.width/2 &&
                        worldY >= building.y - building.height/2 && worldY <= building.y + building.height/2) {
                        // Order soldiers to walk to this building and garrison it on arrival
                        // (previously they teleported in from anywhere on the map)
                        const toGarrison = this.game.selectedUnits.filter(u => ['soldier','sniper','commando'].includes(u.type));
                        const space = building.maxGarrison - building.garrison.length;
                        if (space <= 0) {
                            this.game.addRadioMessage('🚪 Building is full', '#FFB74D');
                            return;
                        }
                        toGarrison.slice(0, space).forEach(u => u.orderGarrison(building));
                        this.game.addOrderMarker(building.x, building.y, '#00E5FF');
                        this.game.updateUI();
                        return;
                    }
                }
            }
            if (!clickedDeposit && !clickedEnemy) {
                // Right-click on empty ground: issue move then deselect
                this.game.issueGroupMove(this.game.selectedUnits, worldX, worldY);
                this.game.selectedUnits.forEach(unit => unit.selected = false);
                this.game.selectedUnits = [];
                if (this.game.selectedBuilding) {
                    this.game.selectedBuilding.selected = false;
                    this.game.selectedBuilding = null;
                }
                this.canvas.style.cursor = 'default';
                this.game.updateUI();
            } else {
                const movers = [];
                this.game.selectedUnits.forEach(unit => {
                    if (clickedDeposit && unit.type === 'harvester') {
                        unit.targetDeposit = clickedDeposit;
                    } else if (clickedEnemy) {
                        unit.attackTarget(clickedEnemy);
                    } else {
                        movers.push(unit);
                    }
                });
                this.game.issueGroupMove(movers, worldX, worldY);
                if (clickedEnemy) this.game.addOrderMarker(clickedEnemy.x, clickedEnemy.y, '#FF1744');
            }
        } else if (this.game.selectedBuilding) {
            // Right-click with a building selected deselects it
            this.game.selectedBuilding.selected = false;
            this.game.selectedBuilding = null;
            this.game.updateUI();
        }
    }

    executeMove(worldX, worldY) {
        this.game.issueGroupMove(this.game.selectedUnits, worldX, worldY);
    }

    executeAttack(worldX, worldY) {
        if (this.game.selectedUnits.length > 0) {
            // Check if clicking on an enemy
            let clickedEnemy = null;

            // Check units
            for (const unit of this.game.units) {
                if (unit.team !== this.game.playerTeam && !unit.garrisonedIn && this.game.isVisibleToPlayer(unit.x, unit.y)) {
                    const dx = worldX - unit.x;
                    const dy = worldY - unit.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist <= unit.size * 2) {
                        clickedEnemy = unit;
                        break;
                    }
                }
            }

            // Check buildings
            if (!clickedEnemy) {
                for (const building of this.game.buildings) {
                    if (building.team !== this.game.playerTeam) {
                        if (worldX >= building.x - building.width / 2 &&
                            worldX <= building.x + building.width / 2 &&
                            worldY >= building.y - building.height / 2 &&
                            worldY <= building.y + building.height / 2) {
                            clickedEnemy = building;
                            break;
                        }
                    }
                }
            }

            // Command units
            if (clickedEnemy) {
                this.game.selectedUnits.forEach(unit => unit.attackTarget(clickedEnemy));
                this.game.addOrderMarker(clickedEnemy.x, clickedEnemy.y, '#FF1744');
            } else {
                // Attack-move to location (units engage anything they meet, then carry on)
                this.game.issueGroupMove(this.game.selectedUnits, worldX, worldY, true);
            }
        }
    }

    onKeyDown(e) {
        if (e.key === 'Escape' && this.game.pausedFromBattle && document.getElementById('campaign-overlay')) {
            this.game.resumeBattle();
            return;
        }

        if (e.key === 'Escape') {
            this.game.buildMode = null;
            this.game.commandMode = null;
            this.game.nukeTargeting = false;
            this.canvas.style.cursor = 'crosshair';
            this.game.updateUI();
        }

        if (e.key === 'p' || e.key === 'P') {
            this.game.togglePause();
            return;
        }

        if (e.key === 's' || e.key === 'S') {
            this.game.stopSelectedUnits();
        }

        if (e.key === 'm' || e.key === 'M') {
            this.game.enterMoveMode();
        }

        if (e.key === 'a' || e.key === 'A') {
            this.game.enterAttackMode();
        }

        // Arrow keys scroll smoothly while held (handled in Game.update)
        if (e.key.startsWith('Arrow')) {
            this.keysDown.add(e.key);
            e.preventDefault();
        }

        // Control groups: Ctrl/Shift + 1-9 assigns, 1-9 recalls, double-tap centers the camera
        const digit = /^Digit([0-9])$/.exec(e.code);
        if (digit && this.game.gameState === 'playing') {
            const g = digit[1];
            if (e.ctrlKey || e.shiftKey) {
                e.preventDefault();
                this.game.controlGroups[g] = this.game.selectedUnits.slice();
                this.game.addRadioMessage(`Group ${g} assigned (${this.game.selectedUnits.length})`, '#90CAF9');
                return;
            }
            const group = (this.game.controlGroups[g] || []).filter(u => u.hp > 0 && !u.garrisonedIn);
            this.game.controlGroups[g] = group;
            if (group.length === 0) return;
            this.game.selectedUnits.forEach(u => u.selected = false);
            if (this.game.selectedBuilding) {
                this.game.selectedBuilding.selected = false;
                this.game.selectedBuilding = null;
            }
            this.game.selectedUnits = group.slice();
            group.forEach(u => u.selected = true);
            const now = performance.now();
            if (this.lastGroupKey === g && now - this.lastGroupTime < 400) {
                const cx = group.reduce((s, u) => s + u.x, 0) / group.length;
                const cy = group.reduce((s, u) => s + u.y, 0) / group.length;
                this.game.centerCameraOn(cx, cy);
            }
            this.lastGroupKey = g;
            this.lastGroupTime = now;
            this.game.updateUI();
        }
    }

    selectUnitsInBox(minX, minY, maxX, maxY, additive = false) {
        if (!additive) {
            this.game.selectedUnits.forEach(unit => unit.selected = false);
            this.game.selectedUnits = [];
        }

        if (this.game.selectedBuilding) {
            this.game.selectedBuilding.selected = false;
            this.game.selectedBuilding = null;
        }

        this.game.units.forEach(unit => {
            if (unit.team === this.game.playerTeam && !unit.garrisonedIn && !unit.selected &&
                unit.x >= minX && unit.x <= maxX &&
                unit.y >= minY && unit.y <= maxY) {
                unit.selected = true;
                this.game.selectedUnits.push(unit);
            }
        });
    }

    selectAtPoint(worldX, worldY, additive = false) {
        // Shift-click toggles a unit in/out of the current selection
        if (additive && this.game.selectedUnits.length > 0) {
            for (const unit of this.game.units) {
                if (unit.team !== this.game.playerTeam || unit.garrisonedIn) continue;
                const dx = worldX - unit.x, dy = worldY - unit.y;
                if (Math.sqrt(dx * dx + dy * dy) <= unit.size) {
                    unit.selected = !unit.selected;
                    this.game.selectedUnits = unit.selected
                        ? [...this.game.selectedUnits, unit]
                        : this.game.selectedUnits.filter(u => u !== unit);
                    return;
                }
            }
        }

        this.game.selectedUnits.forEach(unit => unit.selected = false);
        this.game.selectedUnits = [];

        if (this.game.selectedBuilding) {
            this.game.selectedBuilding.selected = false;
            this.game.selectedBuilding = null;
        }

        for (const unit of this.game.units) {
            if (unit.team === this.game.playerTeam && !unit.garrisonedIn) {
                const dx = worldX - unit.x;
                const dy = worldY - unit.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist <= unit.size) {
                    unit.selected = true;
                    this.game.selectedUnits.push(unit);
                    return;
                }
            }
        }

        for (const building of this.game.buildings) {
            if (building.team === this.game.playerTeam) {
                if (worldX >= building.x - building.width / 2 &&
                    worldX <= building.x + building.width / 2 &&
                    worldY >= building.y - building.height / 2 &&
                    worldY <= building.y + building.height / 2) {
                    building.selected = true;
                    this.game.selectedBuilding = building;
                    return;
                }
            }
        }
    }

    renderSelection(ctx, camera) {
        if (this.mouseDown && this.dragStart && this.dragEnd) {
            const startX = this.dragStart.x - camera.x;
            const startY = this.dragStart.y - camera.y;
            const endX = this.dragEnd.x - camera.x;
            const endY = this.dragEnd.y - camera.y;

            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(
                startX,
                startY,
                endX - startX,
                endY - startY
            );
            ctx.setLineDash([]);

            ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
            ctx.fillRect(
                startX,
                startY,
                endX - startX,
                endY - startY
            );
        }

        // Draw bullseye over hovered enemy
        if (this.hoveredEnemy && this.hoveredEnemy.hp > 0 && this.game.selectedUnits.length > 0) {
            const enemy = this.hoveredEnemy;
            const screenX = enemy.x - camera.x;
            const screenY = enemy.y - camera.y;

            // Determine size based on enemy type
            let targetSize;
            if (enemy.size) {
                // It's a unit
                targetSize = enemy.size + 10;
            } else {
                // It's a building
                targetSize = Math.max(enemy.width, enemy.height) / 2 + 10;
            }

            // Pulsing effect using time
            const pulseSize = targetSize + Math.sin(Date.now() / 200) * 3;

            // Draw outer circle (red)
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(screenX, screenY, pulseSize, 0, Math.PI * 2);
            ctx.stroke();

            // Draw inner circle
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(screenX, screenY, pulseSize * 0.6, 0, Math.PI * 2);
            ctx.stroke();

            // Draw crosshair
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 2;
            const crossSize = pulseSize * 1.2;

            // Vertical line
            ctx.beginPath();
            ctx.moveTo(screenX, screenY - crossSize);
            ctx.lineTo(screenX, screenY - pulseSize);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(screenX, screenY + pulseSize);
            ctx.lineTo(screenX, screenY + crossSize);
            ctx.stroke();

            // Horizontal line
            ctx.beginPath();
            ctx.moveTo(screenX - crossSize, screenY);
            ctx.lineTo(screenX - pulseSize, screenY);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(screenX + pulseSize, screenY);
            ctx.lineTo(screenX + crossSize, screenY);
            ctx.stroke();

            // Draw center dot
            ctx.fillStyle = '#ff0000';
            ctx.beginPath();
            ctx.arc(screenX, screenY, 2, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw target indicator over hovered ore deposit (for harvesters)
        if (this.hoveredDeposit && this.game.selectedUnits.length > 0) {
            const hasHarvesterSelected = this.game.selectedUnits.some(u => u.type === 'harvester');

            if (hasHarvesterSelected) {
                const deposit = this.hoveredDeposit;
                const screenX = deposit.x - camera.x;
                const screenY = deposit.y - camera.y;

                const targetSize = 20;
                const pulseSize = targetSize + Math.sin(Date.now() / 200) * 3;

                // Draw outer circle (gold)
                ctx.strokeStyle = '#FFD700';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(screenX, screenY, pulseSize, 0, Math.PI * 2);
                ctx.stroke();

                // Draw inner circle
                ctx.strokeStyle = '#FFD700';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(screenX, screenY, pulseSize * 0.6, 0, Math.PI * 2);
                ctx.stroke();

                // Draw crosshair
                ctx.strokeStyle = '#FFD700';
                ctx.lineWidth = 2;
                const crossSize = pulseSize * 1.2;

                // Vertical line
                ctx.beginPath();
                ctx.moveTo(screenX, screenY - crossSize);
                ctx.lineTo(screenX, screenY - pulseSize);
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(screenX, screenY + pulseSize);
                ctx.lineTo(screenX, screenY + crossSize);
                ctx.stroke();

                // Horizontal line
                ctx.beginPath();
                ctx.moveTo(screenX - crossSize, screenY);
                ctx.lineTo(screenX - pulseSize, screenY);
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(screenX + pulseSize, screenY);
                ctx.lineTo(screenX + crossSize, screenY);
                ctx.stroke();

                // Draw center dot
                ctx.fillStyle = '#FFD700';
                ctx.beginPath();
                ctx.arc(screenX, screenY, 2, 0, Math.PI * 2);
                ctx.fill();

                // Draw shovel icon in the center
                ctx.fillStyle = '#FFD700';
                ctx.font = '16px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('⛏', screenX, screenY);
            }
        }
    }
}

// ========== AI ==========
class GameAI {
    constructor(game) {
        this.game = game;
        this.team = 'enemy';
        this.credits = 1000;
        this.updateTimer = 0;
        this.attackTimer = 0;
        this.buildTimer = 0;
        this.nukeTimer = 0;
        this.missionConfig = null;
    }

    get cfg() {
        return this.missionConfig || {
            attackIntervals: [14, 9, 6],
            maxUnits: 20,
            incomeRate: 10,
            canBuildSilo: false,
            nukeInterval: 120,
            unitTypes: ['soldier', 'tank', 'sniper']
        };
    }

    update(deltaTime) {
        this.updateTimer += deltaTime;
        this.attackTimer += deltaTime;
        this.buildTimer += deltaTime;
        this.nukeTimer += deltaTime;

        if (this.updateTimer >= 2) {
            this.updateTimer = 0;
            this.makeDecisions();
        }

        const combatUnits = this.game.units.filter(u => u.team === this.team && u.type !== 'harvester');
        const [lo, mid, hi] = this.cfg.attackIntervals;
        const attackInterval = (combatUnits.length >= 12 ? hi : combatUnits.length >= 6 ? mid : lo) * this.game.diff().aiAttack;
        if (this.attackTimer >= attackInterval) {
            this.attackTimer = 0;
            this.launchAttack();
        }

        if (this.buildTimer >= 5) {
            this.buildTimer = 0;
            this.tryBuild();
        }

        const nukeInt = this.cfg.nukeInterval || 120;
        if (this.cfg.canBuildSilo && this.nukeTimer >= nukeInt) {
            this.nukeTimer = 0;
            this.tryLaunchNuke();
        }

        this.credits += deltaTime * this.cfg.incomeRate * this.game.diff().aiIncome;
    }

    makeDecisions() {
        const myUnits = this.game.units.filter(u => u.team === this.team);
        const myBuildings = this.game.buildings.filter(b => b.team === this.team);

        const hasHQ = myBuildings.some(b => b.type === 'hq');
        if (!hasHQ) return;

        const barracks = myBuildings.find(b => b.type === 'barracks');
        const factory = myBuildings.find(b => b.type === 'factory');
        const combatUnits = myUnits.filter(u => u.type !== 'harvester');
        const maxU = this.cfg.maxUnits;

        const unitTypes = this.cfg.unitTypes || ['soldier'];
        const canFactory = unitTypes.some(t => ['tank', 'sniper', 'artillery', 'commando', 'helicopter'].includes(t));
        const factoryTypes = unitTypes.filter(t => ['tank', 'sniper', 'artillery', 'commando', 'helicopter', 'apc'].includes(t));
        const unitCosts = { soldier: 100, tank: 300, sniper: 250, artillery: 400, commando: 350, helicopter: 800, mortar: 350, apc: 400, medic: 150, bazooka: 300, general: 800 };

        if (barracks && unitTypes.includes('soldier') && this.credits >= 100 && combatUnits.length < maxU) {
            this.produceUnit('soldier', barracks, 100);
        }

        // Produce a general if allowed and none exists yet
        if (barracks && unitTypes.includes('general') && this.credits >= 800) {
            const hasGeneral = combatUnits.some(u => u.type === 'general');
            if (!hasGeneral) this.produceUnit('general', barracks, 800);
        }

        // Occasionally produce mortar or bazooka teams from barracks
        if (barracks && combatUnits.length < maxU && this.credits >= 350 && Math.random() < 0.3) {
            if (unitTypes.includes('bazooka') && Math.random() < 0.5) {
                this.produceUnit('bazooka', barracks, 300);
            } else if (unitTypes.includes('mortar')) {
                this.produceUnit('mortar', barracks, 350);
            }
        }

        if (factory && combatUnits.length < maxU && factoryTypes.length > 0) {
            // Pick the factory unit type with the fewest units, cycling through available types
            const counts = {};
            factoryTypes.forEach(t => { counts[t] = combatUnits.filter(u => u.type === t).length; });
            const pick = factoryTypes.reduce((a, b) => counts[a] <= counts[b] ? a : b);
            const cost = unitCosts[pick] || 300;
            if (this.credits >= cost) {
                this.produceUnit(pick, factory, cost);
            }
        }

        const patrolTargets = [
            { x: 1500, y: 1000 },
            { x: 1100, y: 950 },
            { x: 1850, y: 950 },
            { x: 1500, y: 600 },
            { x: 1000, y: 1700 },
        ];

        combatUnits.forEach(unit => {
            if (!unit.target && !unit.attackMove) {
                const dx = unit.x - unit.targetX;
                const dy = unit.y - unit.targetY;
                if (Math.sqrt(dx * dx + dy * dy) < 10) {
                    const pt = patrolTargets[Math.floor(Math.random() * patrolTargets.length)];
                    unit.moveTo(pt.x + (Math.random() - 0.5) * 150, pt.y + (Math.random() - 0.5) * 150);
                    unit.attackMove = true;
                }
            }
        });
    }

    produceUnit(type, building, cost) {
        if (this.credits >= cost) {
            const tempUnit = createUnit(type, 0, 0, this.team);
            const spawnPos = this.game.findSpawnPosition(building, tempUnit.size);
            const unit = createUnit(type, spawnPos.x, spawnPos.y, this.team);
            this.game.applyEnemyDifficulty(unit);
            this.game.units.push(unit);
            this.credits -= cost;
        }
    }

    tryBuild() {
        const myBuildings = this.game.buildings.filter(b => b.team === this.team);
        const myHQ = myBuildings.find(b => b.type === 'hq');
        if (!myHQ) return;

        const hasBarracks = myBuildings.some(b => b.type === 'barracks');
        const hasFactory = myBuildings.some(b => b.type === 'factory');
        const hasPower = myBuildings.some(b => b.type === 'power');
        const hasRefinery = myBuildings.some(b => b.type === 'refinery');
        const hasSilo = myBuildings.some(b => b.type === 'missile_silo');
        const hasAA = myBuildings.some(b => b.type === 'aa_battery');

        const buildSlots = [
            { dx: 120, dy: 0 },
            { dx: 0, dy: 120 },
            { dx: -120, dy: 0 },
            { dx: 0, dy: -120 },
            { dx: 120, dy: -120 },
            { dx: -120, dy: 120 },
            { dx: 200, dy: 0 },
            { dx: 0, dy: 200 },
        ];

        const tryPlace = (type, cost) => {
            if (this.credits < cost) return false;
            for (const slot of buildSlots) {
                const x = myHQ.x + slot.dx;
                const y = myHQ.y + slot.dy;
                // Must pass the AI's team: with no team the player's "near your own base"
                // rule was applied, so the AI could never build anything.
                if (this.game.isValidBuildLocation(x, y, this.team)) {
                    this.game.buildings.push(createBuilding(type, x, y, this.team));
                    this.credits -= cost;
                    return true;
                }
            }
            return false;
        };

        if (!hasRefinery) tryPlace('refinery', 400);
        else if (!hasPower) tryPlace('power', 200);
        else if (!hasBarracks) tryPlace('barracks', 300);
        else if (!hasFactory && hasBarracks) tryPlace('factory', 500);
        else if (!hasAA && hasFactory) tryPlace('aa_battery', 800);
        else if (this.cfg.canBuildSilo && !hasSilo) tryPlace('missile_silo', 1500);
    }

    launchAttack() {
        const myUnits = this.game.units.filter(u => u.team === this.team && u.type !== 'harvester');
        if (myUnits.length < 3) return;

        const buildingPriority = { refinery: 4, barracks: 3, factory: 3, turret: 2, power: 2, hq: 1 };
        // Only attack buildings the AI has actually scouted (explored by enemy fog)
        const playerBuildings = this.game.buildings.filter(b =>
            b.team === this.game.playerTeam &&
            this.game.isExploredByEnemy(b.x, b.y)
        );
        // Fall back to HQ if nothing explored yet (AI knows roughly where to go)
        let target = playerBuildings.length > 0
            ? [...playerBuildings].sort((a, b) => (buildingPriority[b.type] || 0) - (buildingPriority[a.type] || 0))[0]
            : this.game.buildings.find(b => b.team === this.game.playerTeam && b.type === 'hq');

        // Some waves raid a town instead, forcing the player to split their defences
        const liveCities = this.game.cities.filter(c => !c.fallen);
        if (liveCities.length > 0 && this.game.townsExposed() && Math.random() < 0.4) {
            target = liveCities[Math.floor(Math.random() * liveCities.length)];
        }

        if (!target) return;

        const attackForce = myUnits.slice(0, Math.floor(myUnits.length * 0.7));
        attackForce.forEach(unit => {
            unit.moveTo(
                target.x + (Math.random() - 0.5) * 100,
                target.y + (Math.random() - 0.5) * 100
            );
            unit.attackMove = true;
        });
    }

    tryLaunchNuke() {
        const silo = this.game.buildings.find(b => b.team === this.team && b.type === 'missile_silo' && b.nukeCooldown <= 0);
        if (!silo) return;

        const target = this.game.buildings.find(b => b.team === this.game.playerTeam && b.type === 'hq') ||
                       this.game.buildings.find(b => b.team === this.game.playerTeam);
        if (!target) return;

        const tx = target.x + (Math.random() - 0.5) * 80;
        const ty = target.y + (Math.random() - 0.5) * 80;
        this.game.nukes.push(new NukeProjectile(silo.x, silo.y, tx, ty, this.game, this.team));
        this.game.sfx.play('launch');
        this.game.addRadioMessage('☢ ENEMY NUKE LAUNCHED!', '#FF1744');
        silo.nukeCooldown = silo.maxNukeCooldown;
    }
}

// ========== MISSIONS ==========
const MISSIONS = [
    {
        id: 1,
        name: 'First Contact',
        difficulty: 'Recruit',
        difficultyColor: '#4CAF50',
        description: 'A small enemy scouting force has appeared on the frontier. Eliminate them before they dig in.',
        playerCredits: 3000,
        enemyCredits: 300,
        enemyExtraUnits: [],
        enemyExtraBuildings: [],
        ai: {
            attackIntervals: [25, 20, 15],
            maxUnits: 8,
            incomeRate: 4,
            canBuildSilo: false,
            unitTypes: ['soldier']
        }
    },
    {
        id: 2,
        name: 'Escalation',
        difficulty: 'Corporal',
        difficultyColor: '#8BC34A',
        description: 'The enemy is reinforcing with armored units. Destroy them before they overwhelm you.',
        playerCredits: 2500,
        enemyCredits: 700,
        enemyExtraUnits: [
            { type: 'tank', offsetX: 20, offsetY: -20 }
        ],
        enemyExtraBuildings: [],
        ai: {
            attackIntervals: [18, 13, 9],
            maxUnits: 13,
            incomeRate: 7,
            canBuildSilo: false,
            unitTypes: ['soldier', 'tank']
        }
    },
    {
        id: 3,
        name: "Sniper's Alley",
        difficulty: 'Sergeant',
        difficultyColor: '#FFC107',
        description: "Enemy sharpshooters are operating at extreme range. They can see you before you see them.",
        playerCredits: 2000,
        enemyCredits: 1200,
        enemyExtraUnits: [
            { type: 'tank', offsetX: 20, offsetY: -20 },
            { type: 'sniper', offsetX: -40, offsetY: -70 },
            { type: 'sniper', offsetX: 50, offsetY: -80 }
        ],
        enemyExtraBuildings: [
            { type: 'barracks', offsetX: -100, offsetY: -100 }
        ],
        ai: {
            attackIntervals: [14, 10, 7],
            maxUnits: 17,
            incomeRate: 12,
            canBuildSilo: false,
            unitTypes: ['soldier', 'tank', 'sniper']
        }
    },
    {
        id: 4,
        name: 'Total War',
        difficulty: 'Commander',
        difficultyColor: '#FF5722',
        description: 'Full-scale assault. The enemy brings every weapon at their disposal. Expect heavy casualties.',
        playerCredits: 1800,
        enemyCredits: 2000,
        enemyExtraUnits: [
            { type: 'tank', offsetX: 20, offsetY: -20 },
            { type: 'tank', offsetX: 40, offsetY: 10 },
            { type: 'sniper', offsetX: -40, offsetY: -70 },
            { type: 'artillery', offsetX: 80, offsetY: -40 }
        ],
        enemyExtraBuildings: [
            { type: 'barracks', offsetX: -100, offsetY: -100 },
            { type: 'factory', offsetX: 120, offsetY: -100 }
        ],
        ai: {
            attackIntervals: [10, 7, 5],
            maxUnits: 23,
            incomeRate: 17,
            canBuildSilo: false,
            unitTypes: ['soldier', 'tank', 'sniper', 'artillery']
        }
    },
    {
        id: 5,
        name: 'Nuclear Option',
        difficulty: 'General',
        difficultyColor: '#F44336',
        description: 'The enemy has a Missile Silo. Destroy it before they launch — or build your own and strike first.',
        playerCredits: 2200,
        enemyCredits: 3000,
        enemyExtraUnits: [
            { type: 'tank', offsetX: 20, offsetY: -20 },
            { type: 'tank', offsetX: 40, offsetY: 10 },
            { type: 'sniper', offsetX: -40, offsetY: -70 },
            { type: 'sniper', offsetX: 50, offsetY: -80 },
            { type: 'artillery', offsetX: 80, offsetY: -40 },
            { type: 'commando', offsetX: -30, offsetY: -30 }
        ],
        enemyExtraBuildings: [
            { type: 'barracks', offsetX: -100, offsetY: -100 },
            { type: 'factory', offsetX: 120, offsetY: -100 },
            { type: 'missile_silo', offsetX: 0, offsetY: -160 }
        ],
        ai: {
            attackIntervals: [8, 5, 4],
            maxUnits: 30,
            incomeRate: 22,
            canBuildSilo: true,
            nukeInterval: 80,
            unitTypes: ['soldier', 'tank', 'sniper', 'artillery', 'commando']
        }
    },
    {
        id: 6,
        name: 'Air Superiority',
        difficulty: 'Lieutenant Colonel',
        difficultyColor: '#FF9800',
        description: 'Enemy gunships are hunting your troops from the sky. Build AA Batteries or watch your army get shredded.',
        playerCredits: 2000,
        enemyCredits: 3500,
        enemyExtraUnits: [
            { type: 'helicopter', offsetX: 30, offsetY: -30 },
            { type: 'helicopter', offsetX: -30, offsetY: -50 },
            { type: 'tank', offsetX: 50, offsetY: 10 },
            { type: 'soldier', offsetX: -20, offsetY: -20 },
            { type: 'soldier', offsetX: 20, offsetY: -40 }
        ],
        enemyExtraBuildings: [
            { type: 'barracks', offsetX: -100, offsetY: -100 },
            { type: 'factory', offsetX: 120, offsetY: -100 },
            { type: 'aa_battery', offsetX: -60, offsetY: -170 }
        ],
        ai: {
            attackIntervals: [10, 7, 5],
            maxUnits: 28,
            incomeRate: 28,
            canBuildSilo: false,
            unitTypes: ['soldier', 'tank', 'sniper', 'helicopter']
        }
    },
    {
        id: 7,
        name: 'Shock & Awe',
        difficulty: 'Colonel',
        difficultyColor: '#F44336',
        description: 'Enemy APCs are rolling in with troops and mortar teams are raining shells from beyond your sight range.',
        playerCredits: 1800,
        enemyCredits: 4000,
        enemyExtraUnits: [
            { type: 'apc', offsetX: 30, offsetY: -20 },
            { type: 'apc', offsetX: -30, offsetY: -50 },
            { type: 'mortar', offsetX: 80, offsetY: -60 },
            { type: 'mortar', offsetX: -60, offsetY: -80 },
            { type: 'tank', offsetX: 50, offsetY: 10 },
            { type: 'helicopter', offsetX: -20, offsetY: -30 }
        ],
        enemyExtraBuildings: [
            { type: 'barracks', offsetX: -100, offsetY: -100 },
            { type: 'factory', offsetX: 120, offsetY: -100 },
            { type: 'turret', offsetX: -150, offsetY: -60 },
            { type: 'turret', offsetX: 80, offsetY: -170 },
            { type: 'aa_battery', offsetX: -60, offsetY: -170 }
        ],
        ai: {
            attackIntervals: [8, 6, 4],
            maxUnits: 33,
            incomeRate: 33,
            canBuildSilo: false,
            unitTypes: ['soldier', 'tank', 'sniper', 'helicopter', 'mortar', 'apc']
        }
    },
    {
        id: 8,
        name: 'Blitzkrieg',
        difficulty: 'Major General',
        difficultyColor: '#E91E63',
        description: 'Relentless waves, nuclear capability, and air cover. There is no rest. There is no mercy.',
        playerCredits: 2200,
        enemyCredits: 5000,
        enemyExtraUnits: [
            { type: 'helicopter', offsetX: 30, offsetY: -30 },
            { type: 'helicopter', offsetX: -50, offsetY: -50 },
            { type: 'tank', offsetX: 50, offsetY: 10 },
            { type: 'tank', offsetX: -30, offsetY: 20 },
            { type: 'mortar', offsetX: 90, offsetY: -70 },
            { type: 'commando', offsetX: -20, offsetY: -20 },
            { type: 'artillery', offsetX: 80, offsetY: -40 }
        ],
        enemyExtraBuildings: [
            { type: 'barracks', offsetX: -100, offsetY: -100 },
            { type: 'factory', offsetX: 120, offsetY: -100 },
            { type: 'missile_silo', offsetX: 0, offsetY: -160 },
            { type: 'aa_battery', offsetX: -60, offsetY: -170 },
            { type: 'turret', offsetX: 170, offsetY: -60 },
            { type: 'turret', offsetX: -160, offsetY: -60 }
        ],
        ai: {
            attackIntervals: [6, 4, 3],
            maxUnits: 38,
            incomeRate: 40,
            canBuildSilo: true,
            nukeInterval: 70,
            unitTypes: ['soldier', 'tank', 'sniper', 'artillery', 'commando', 'helicopter', 'mortar']
        }
    },
    {
        id: 9,
        name: 'Iron Fortress',
        difficulty: 'General',
        difficultyColor: '#9C27B0',
        description: 'A heavily fortified bunker complex bristling with turrets and AA. Crack it open with everything you have.',
        playerCredits: 2500,
        enemyCredits: 6000,
        enemyExtraUnits: [
            { type: 'helicopter', offsetX: 30, offsetY: -30 },
            { type: 'helicopter', offsetX: -50, offsetY: -50 },
            { type: 'helicopter', offsetX: 10, offsetY: -70 },
            { type: 'tank', offsetX: 50, offsetY: 10 },
            { type: 'tank', offsetX: -30, offsetY: 20 },
            { type: 'commando', offsetX: -20, offsetY: -20 },
            { type: 'commando', offsetX: 30, offsetY: -10 },
            { type: 'mortar', offsetX: 90, offsetY: -70 },
            { type: 'artillery', offsetX: 80, offsetY: -40 }
        ],
        enemyExtraBuildings: [
            { type: 'barracks', offsetX: -100, offsetY: -100 },
            { type: 'factory', offsetX: 120, offsetY: -100 },
            { type: 'missile_silo', offsetX: 0, offsetY: -160 },
            { type: 'turret', offsetX: -160, offsetY: -60 },
            { type: 'turret', offsetX: 170, offsetY: -60 },
            { type: 'turret', offsetX: 0, offsetY: -200 },
            { type: 'aa_battery', offsetX: -80, offsetY: -180 },
            { type: 'aa_battery', offsetX: 80, offsetY: -180 },
            { type: 'sandbag', offsetX: -130, offsetY: -30 },
            { type: 'sandbag', offsetX: 130, offsetY: -30 }
        ],
        ai: {
            attackIntervals: [5, 3, 2],
            maxUnits: 44,
            incomeRate: 48,
            canBuildSilo: true,
            nukeInterval: 60,
            unitTypes: ['soldier', 'tank', 'sniper', 'artillery', 'commando', 'helicopter', 'mortar', 'apc', 'general']
        }
    },
    {
        id: 10,
        name: "Titan's Fall",
        difficulty: 'Supreme Commander',
        difficultyColor: '#FF1744',
        description: 'The final battle. Two silos. Maximum forces. No reinforcements. Win this and the war is over.',
        playerCredits: 3000,
        enemyCredits: 8000,
        enemyExtraUnits: [
            { type: 'helicopter', offsetX: 30, offsetY: -30 },
            { type: 'helicopter', offsetX: -50, offsetY: -50 },
            { type: 'helicopter', offsetX: 10, offsetY: -70 },
            { type: 'tank', offsetX: 50, offsetY: 10 },
            { type: 'tank', offsetX: -30, offsetY: 20 },
            { type: 'tank', offsetX: 70, offsetY: -30 },
            { type: 'commando', offsetX: -20, offsetY: -20 },
            { type: 'commando', offsetX: 30, offsetY: -10 },
            { type: 'mortar', offsetX: 90, offsetY: -70 },
            { type: 'mortar', offsetX: -80, offsetY: -60 },
            { type: 'artillery', offsetX: 80, offsetY: -40 },
            { type: 'sniper', offsetX: -60, offsetY: -80 }
        ],
        enemyExtraBuildings: [
            { type: 'barracks', offsetX: -100, offsetY: -100 },
            { type: 'factory', offsetX: 120, offsetY: -100 },
            { type: 'missile_silo', offsetX: -60, offsetY: -160 },
            { type: 'missile_silo', offsetX: 60, offsetY: -160 },
            { type: 'turret', offsetX: -160, offsetY: -60 },
            { type: 'turret', offsetX: 170, offsetY: -60 },
            { type: 'turret', offsetX: 0, offsetY: -210 },
            { type: 'turret', offsetX: -200, offsetY: -150 },
            { type: 'aa_battery', offsetX: -80, offsetY: -180 },
            { type: 'aa_battery', offsetX: 80, offsetY: -180 },
            { type: 'sandbag', offsetX: -130, offsetY: -30 },
            { type: 'sandbag', offsetX: 130, offsetY: -30 }
        ],
        ai: {
            attackIntervals: [4, 3, 2],
            maxUnits: 50,
            incomeRate: 60,
            canBuildSilo: true,
            nukeInterval: 50,
            unitTypes: ['soldier', 'tank', 'sniper', 'artillery', 'commando', 'helicopter', 'mortar', 'apc', 'general']
        }
    },
    {
        id: 11,
        name: 'Tank Hunters',
        difficulty: 'Brigadier General',
        difficultyColor: '#D81B60',
        description: 'Enemy armor is pouring through every gap. Deploy your bazooka teams or watch your base get rolled over.',
        playerCredits: 2000,
        enemyCredits: 5500,
        enemyExtraUnits: [
            { type: 'tank', offsetX: 20, offsetY: -20 },
            { type: 'tank', offsetX: 50, offsetY: 10 },
            { type: 'tank', offsetX: -30, offsetY: 20 },
            { type: 'tank', offsetX: 70, offsetY: -30 },
            { type: 'apc', offsetX: 30, offsetY: -50 },
            { type: 'apc', offsetX: -50, offsetY: -60 },
            { type: 'bazooka', offsetX: -20, offsetY: -20 },
            { type: 'helicopter', offsetX: 10, offsetY: -40 }
        ],
        enemyExtraBuildings: [
            { type: 'barracks', offsetX: -100, offsetY: -100 },
            { type: 'factory', offsetX: 120, offsetY: -100 },
            { type: 'turret', offsetX: -160, offsetY: -60 },
            { type: 'turret', offsetX: 170, offsetY: -60 },
            { type: 'aa_battery', offsetX: 0, offsetY: -180 }
        ],
        ai: {
            attackIntervals: [7, 5, 3],
            maxUnits: 36,
            incomeRate: 38,
            canBuildSilo: false,
            unitTypes: ['soldier', 'tank', 'apc', 'helicopter', 'bazooka']
        }
    },
    {
        id: 12,
        name: 'Guerrilla War',
        difficulty: 'Field Marshal',
        difficultyColor: '#C2185B',
        description: 'Fast-moving commandos and bazooka squads are hitting your base from every direction. No front line, no safe zones.',
        playerCredits: 1800,
        enemyCredits: 6000,
        enemyExtraUnits: [
            { type: 'commando', offsetX: -20, offsetY: -20 },
            { type: 'commando', offsetX: 30, offsetY: -10 },
            { type: 'commando', offsetX: -40, offsetY: -50 },
            { type: 'bazooka', offsetX: 50, offsetY: -30 },
            { type: 'bazooka', offsetX: -60, offsetY: -60 },
            { type: 'bazooka', offsetX: 20, offsetY: -70 },
            { type: 'sniper', offsetX: -80, offsetY: -80 },
            { type: 'helicopter', offsetX: 40, offsetY: -40 },
            { type: 'helicopter', offsetX: -30, offsetY: -30 }
        ],
        enemyExtraBuildings: [
            { type: 'barracks', offsetX: -100, offsetY: -100 },
            { type: 'factory', offsetX: 120, offsetY: -100 },
            { type: 'turret', offsetX: -160, offsetY: -60 },
            { type: 'turret', offsetX: 170, offsetY: -60 },
            { type: 'aa_battery', offsetX: -60, offsetY: -170 },
            { type: 'missile_silo', offsetX: 0, offsetY: -160 }
        ],
        ai: {
            attackIntervals: [6, 4, 3],
            maxUnits: 40,
            incomeRate: 44,
            canBuildSilo: true,
            nukeInterval: 75,
            unitTypes: ['soldier', 'commando', 'sniper', 'bazooka', 'helicopter', 'mortar']
        }
    },
    {
        id: 13,
        name: 'Death Valley',
        difficulty: 'Grand Marshal',
        difficultyColor: '#AD1457',
        description: 'A killing field. Enemy has three lines of turrets, AA cover on all flanks, and constant air patrols.',
        playerCredits: 2500,
        enemyCredits: 7000,
        enemyExtraUnits: [
            { type: 'helicopter', offsetX: 30, offsetY: -30 },
            { type: 'helicopter', offsetX: -50, offsetY: -50 },
            { type: 'helicopter', offsetX: 10, offsetY: -70 },
            { type: 'tank', offsetX: 50, offsetY: 10 },
            { type: 'tank', offsetX: -30, offsetY: 20 },
            { type: 'bazooka', offsetX: -20, offsetY: -20 },
            { type: 'bazooka', offsetX: 40, offsetY: -50 },
            { type: 'mortar', offsetX: 90, offsetY: -70 },
            { type: 'commando', offsetX: -60, offsetY: -40 },
            { type: 'artillery', offsetX: 80, offsetY: -40 }
        ],
        enemyExtraBuildings: [
            { type: 'barracks', offsetX: -100, offsetY: -100 },
            { type: 'factory', offsetX: 120, offsetY: -100 },
            { type: 'missile_silo', offsetX: 0, offsetY: -160 },
            { type: 'turret', offsetX: -160, offsetY: -60 },
            { type: 'turret', offsetX: 170, offsetY: -60 },
            { type: 'turret', offsetX: -200, offsetY: -150 },
            { type: 'turret', offsetX: 200, offsetY: -150 },
            { type: 'turret', offsetX: 0, offsetY: -220 },
            { type: 'aa_battery', offsetX: -80, offsetY: -180 },
            { type: 'aa_battery', offsetX: 80, offsetY: -180 },
            { type: 'aa_battery', offsetX: 0, offsetY: -240 },
            { type: 'sandbag', offsetX: -130, offsetY: -30 },
            { type: 'sandbag', offsetX: 130, offsetY: -30 }
        ],
        ai: {
            attackIntervals: [5, 3, 2],
            maxUnits: 44,
            incomeRate: 52,
            canBuildSilo: true,
            nukeInterval: 60,
            unitTypes: ['soldier', 'tank', 'sniper', 'artillery', 'commando', 'helicopter', 'bazooka', 'mortar', 'apc', 'general']
        }
    },
    {
        id: 14,
        name: 'Last Stand',
        difficulty: 'Warlord',
        difficultyColor: '#880E4F',
        description: 'You start with almost nothing. They start with everything. Hold the line or die trying.',
        playerCredits: 1200,
        enemyCredits: 9000,
        enemyExtraUnits: [
            { type: 'helicopter', offsetX: 30, offsetY: -30 },
            { type: 'helicopter', offsetX: -50, offsetY: -50 },
            { type: 'helicopter', offsetX: 10, offsetY: -70 },
            { type: 'tank', offsetX: 50, offsetY: 10 },
            { type: 'tank', offsetX: -30, offsetY: 20 },
            { type: 'tank', offsetX: 70, offsetY: -30 },
            { type: 'bazooka', offsetX: -20, offsetY: -20 },
            { type: 'bazooka', offsetX: 30, offsetY: -10 },
            { type: 'commando', offsetX: -40, offsetY: -40 },
            { type: 'mortar', offsetX: 90, offsetY: -70 },
            { type: 'mortar', offsetX: -80, offsetY: -60 },
            { type: 'artillery', offsetX: 80, offsetY: -40 },
            { type: 'apc', offsetX: 60, offsetY: -50 }
        ],
        enemyExtraBuildings: [
            { type: 'barracks', offsetX: -100, offsetY: -100 },
            { type: 'factory', offsetX: 120, offsetY: -100 },
            { type: 'missile_silo', offsetX: -60, offsetY: -160 },
            { type: 'missile_silo', offsetX: 60, offsetY: -160 },
            { type: 'turret', offsetX: -160, offsetY: -60 },
            { type: 'turret', offsetX: 170, offsetY: -60 },
            { type: 'turret', offsetX: 0, offsetY: -220 },
            { type: 'turret', offsetX: -200, offsetY: -150 },
            { type: 'aa_battery', offsetX: -80, offsetY: -180 },
            { type: 'aa_battery', offsetX: 80, offsetY: -180 },
            { type: 'sandbag', offsetX: -130, offsetY: -30 },
            { type: 'sandbag', offsetX: 130, offsetY: -30 }
        ],
        ai: {
            attackIntervals: [4, 3, 2],
            maxUnits: 50,
            incomeRate: 65,
            canBuildSilo: true,
            nukeInterval: 50,
            unitTypes: ['soldier', 'tank', 'sniper', 'artillery', 'commando', 'helicopter', 'bazooka', 'mortar', 'apc', 'general']
        }
    },
    {
        id: 15,
        name: 'Armageddon',
        difficulty: 'Conqueror',
        difficultyColor: '#B71C1C',
        description: 'Three silos. No mercy. The enemy does not stop. Win this and your name will be legend.',
        playerCredits: 3500,
        enemyCredits: 12000,
        enemyExtraUnits: [
            { type: 'helicopter', offsetX: 30, offsetY: -30 },
            { type: 'helicopter', offsetX: -50, offsetY: -50 },
            { type: 'helicopter', offsetX: 10, offsetY: -70 },
            { type: 'helicopter', offsetX: -10, offsetY: -90 },
            { type: 'tank', offsetX: 50, offsetY: 10 },
            { type: 'tank', offsetX: -30, offsetY: 20 },
            { type: 'tank', offsetX: 70, offsetY: -30 },
            { type: 'tank', offsetX: -70, offsetY: -10 },
            { type: 'bazooka', offsetX: -20, offsetY: -20 },
            { type: 'bazooka', offsetX: 30, offsetY: -10 },
            { type: 'bazooka', offsetX: -50, offsetY: -50 },
            { type: 'commando', offsetX: -40, offsetY: -40 },
            { type: 'commando', offsetX: 60, offsetY: -60 },
            { type: 'mortar', offsetX: 90, offsetY: -70 },
            { type: 'mortar', offsetX: -80, offsetY: -60 },
            { type: 'artillery', offsetX: 80, offsetY: -40 },
            { type: 'artillery', offsetX: -90, offsetY: -40 },
            { type: 'apc', offsetX: 60, offsetY: -50 },
            { type: 'apc', offsetX: -60, offsetY: -30 }
        ],
        enemyExtraBuildings: [
            { type: 'barracks', offsetX: -100, offsetY: -100 },
            { type: 'factory', offsetX: 120, offsetY: -100 },
            { type: 'missile_silo', offsetX: -80, offsetY: -160 },
            { type: 'missile_silo', offsetX: 0, offsetY: -170 },
            { type: 'missile_silo', offsetX: 80, offsetY: -160 },
            { type: 'turret', offsetX: -160, offsetY: -60 },
            { type: 'turret', offsetX: 170, offsetY: -60 },
            { type: 'turret', offsetX: 0, offsetY: -220 },
            { type: 'turret', offsetX: -200, offsetY: -150 },
            { type: 'turret', offsetX: 200, offsetY: -150 },
            { type: 'aa_battery', offsetX: -80, offsetY: -180 },
            { type: 'aa_battery', offsetX: 80, offsetY: -180 },
            { type: 'aa_battery', offsetX: 0, offsetY: -250 },
            { type: 'sandbag', offsetX: -130, offsetY: -30 },
            { type: 'sandbag', offsetX: 130, offsetY: -30 }
        ],
        ai: {
            attackIntervals: [3, 2, 1],
            maxUnits: 55,
            incomeRate: 80,
            canBuildSilo: true,
            nukeInterval: 40,
            unitTypes: ['soldier', 'tank', 'sniper', 'artillery', 'commando', 'helicopter', 'bazooka', 'mortar', 'apc', 'general']
        }
    }
];

const BUILD_PREREQS = {
    factory:      { requires: 'barracks', label: 'Barracks' },
    turret:       { requires: 'barracks', label: 'Barracks' },
    aa_battery:   { requires: 'factory',  label: 'War Factory' },
    missile_silo: { requires: 'factory',  label: 'War Factory' }
};

// ========== RIVERS ==========
// Water blocks ground units (helicopters fly over); bridges are the only crossings,
// which turns them into chokepoints. Each river is a polyline (points run past the map
// edge so the water flows off-screen) with a half-width; bridges sit on the river.
const RIVERS = [
    {
        name: 'Great River',
        halfWidth: 34,
        // North → south, splitting the map between your side (west) and the enemy (east)
        points: [[1650, -40], [1640, 200], [1665, 450], [1690, 700], [1680, 950],
                 [1645, 1170], [1640, 1350], [1700, 1600], [1665, 1800], [1650, 2040]],
        bridges: [[1655, 350], [1685, 820], [1695, 1580]]
    },
    {
        name: 'Willow Creek',
        halfWidth: 24,
        // West → east tributary that joins the Great River
        points: [[-40, 1160], [300, 1080], [600, 1150], [850, 1250], [1100, 1200],
                 [1350, 1150], [1645, 1170]],
        bridges: [[450, 1115], [1225, 1175]]
    }
];

// ========== MOUNTAINS ==========
// A ring of impassable ridges around the player's base. Ground units must use the
// three passes (gaps between ridges); helicopters fly over. Each ridge is a polyline
// with a half-width; ends that run past the map edge seal the ring against the border.
const MOUNTAIN_RIDGES = [
    { halfWidth: 32, points: [[850, -40], [862, 140], [856, 310]] },                 // north-east wall
    { halfWidth: 32, points: [[848, 470], [838, 560], [790, 680], [720, 755]] },     // east → south-east
    { halfWidth: 32, points: [[595, 835], [470, 880], [300, 885], [215, 876]] },     // south wall
    { halfWidth: 32, points: [[75, 868], [-40, 860]] }                               // south-west stub
];
// Pass centres (the gaps between the ridges above)
const MOUNTAIN_PASSES = [
    { name: 'East Pass',       x: 852, y: 390 },
    { name: 'South-East Pass', x: 657, y: 795 },
    { name: 'South-West Pass', x: 145, y: 872 }
];

// ========== CITIES ==========
// Neutral towns full of civilians the player must protect. The enemy will raid them.
// Houses and civilians are NOT in game.units / game.buildings (so player units never
// target them); enemy targeting, splash and nukes include them via game.cityTargets().
const CITY_SITES = [
    { name: 'Millbrook', x: 1010, y: 470  },
    { name: 'Riverton',  x: 1450, y: 1350 },
    { name: 'Oakford',   x: 2050, y: 520  },
    { name: 'Ashdale',   x: 520,  y: 1480 }
];

class House {
    constructor(x, y, w, h, city, palette) {
        this.x = x; this.y = y;
        this.width = w; this.height = h;
        this.maxHp = 220; this.hp = this.maxHp; this.lastHp = this.hp;
        this.team = 'civilian';
        this.isHouse = true;
        this.city = city;
        this.wall = palette.wall;
        this.roof = palette.roof;
    }

    render(ctx, camera) {
        const sx = this.x - camera.x - this.width / 2;
        const sy = this.y - camera.y - this.height / 2;
        const fallen = this.city.fallen;
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(sx + 4, sy + 4, this.width, this.height);
        // Walls
        ctx.fillStyle = fallen ? '#6d6d6d' : this.wall;
        ctx.fillRect(sx, sy + this.height * 0.35, this.width, this.height * 0.65);
        // Pitched roof
        ctx.fillStyle = fallen ? '#4a4a4a' : this.roof;
        ctx.beginPath();
        ctx.moveTo(sx - 3, sy + this.height * 0.4);
        ctx.lineTo(sx + this.width / 2, sy);
        ctx.lineTo(sx + this.width + 3, sy + this.height * 0.4);
        ctx.closePath();
        ctx.fill();
        // Door + windows (lit at night-ish warm glow)
        ctx.fillStyle = '#4E342E';
        ctx.fillRect(sx + this.width / 2 - 3, sy + this.height - 9, 6, 9);
        ctx.fillStyle = fallen ? '#333' : '#FFE082';
        ctx.fillRect(sx + 4, sy + this.height * 0.5, 5, 5);
        ctx.fillRect(sx + this.width - 9, sy + this.height * 0.5, 5, 5);
        // Outline
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx, sy + this.height * 0.35, this.width, this.height * 0.65);
        // Health bar only when damaged
        if (this.hp < this.maxHp) {
            const frac = Math.max(0, this.hp / this.maxHp);
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(sx - 1, sy - 8, this.width + 2, 5);
            ctx.fillStyle = frac > 0.6 ? '#4CAF50' : frac > 0.3 ? '#FF9800' : '#f44336';
            ctx.fillRect(sx, sy - 7, this.width * frac, 3);
        }
    }
}

class Civilian {
    constructor(x, y, home, city, rng) {
        this.x = x; this.y = y;
        this.home = home; this.city = city;
        this.maxHp = 20; this.hp = this.maxHp; this.lastHp = this.hp;
        this.team = 'civilian';
        this.isCivilian = true;
        this.size = 7;
        this.tx = x; this.ty = y;
        this.wanderTimer = rng() * 3;
        this.panic = 0;
        this.facing = 1;
        const shirts = ['#E3F2FD', '#FFCC80', '#CE93D8', '#80DEEA', '#F48FB1', '#FFF59D', '#BCAAA4'];
        const skins = ['#FFE0BD', '#E0AC69', '#C68642', '#8D5524'];
        this.shirt = shirts[Math.floor(rng() * shirts.length)];
        this.skin = skins[Math.floor(rng() * skins.length)];
    }

    update(dt, game) {
        // Look for the nearest enemy soldier/vehicle nearby and run from it
        let threat = null, threatDist = 170;
        for (const u of game.units) {
            if (u.team !== game.enemyTeam || u.garrisonedIn || u.hp <= 0) continue;
            const dx = u.x - this.x, dy = u.y - this.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            // Enemy vehicles run people over
            if (u.canCrush && d < u.size) { this.hp = 0; return; }
            if (d < threatDist) { threatDist = d; threat = u; }
        }

        let speed = 22;
        if (threat) {
            this.panic = 1.5;
            const dx = this.x - threat.x, dy = this.y - threat.y;
            const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
            // Flee away from the threat, with a bit of jitter
            this.tx = this.x + (dx / d) * 90 + (Math.random() - 0.5) * 40;
            this.ty = this.y + (dy / d) * 90 + (Math.random() - 0.5) * 40;
        } else {
            this.wanderTimer -= dt;
            if (this.wanderTimer <= 0) {
                this.wanderTimer = 2 + Math.random() * 4;
                const anchor = this.home && this.home.hp > 0 ? this.home : this.city;
                const a = Math.random() * Math.PI * 2;
                const r = 15 + Math.random() * 45;
                this.tx = anchor.x + Math.cos(a) * r;
                this.ty = anchor.y + Math.sin(a) * r;
            }
        }
        if (this.panic > 0) { this.panic -= dt; speed = 55; }

        this.tx = Math.max(10, Math.min(game.worldWidth - 10, this.tx));
        this.ty = Math.max(10, Math.min(game.worldHeight - 10, this.ty));
        const dx = this.tx - this.x, dy = this.ty - this.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 2) {
            const step = Math.min(d, speed * dt);
            const nx = this.x + (dx / d) * step;
            const ny = this.y + (dy / d) * step;
            if (game.isWater(nx, ny)) {
                // Townsfolk don't swim: pick somewhere else to go
                this.wanderTimer = 0;
                this.tx = this.x; this.ty = this.y;
            } else {
                this.x = nx; this.y = ny;
                if (Math.abs(dx) > 2) this.facing = dx > 0 ? 1 : -1;
            }
        }
    }

    render(ctx, camera) {
        const sx = this.x - camera.x, sy = this.y - camera.y;
        const s = this.size;
        const bob = this.panic > 0 ? Math.sin(Date.now() / 60) * 1 : 0;
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(sx + 1, sy + s * 0.95, s * 0.5, s * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
        // Legs
        ctx.fillStyle = '#455A64';
        ctx.fillRect(sx - s * 0.3, sy + s * 0.35 + bob, s * 0.22, s * 0.55);
        ctx.fillRect(sx + s * 0.08, sy + s * 0.35 - bob, s * 0.22, s * 0.55);
        // Body
        ctx.fillStyle = this.shirt;
        ctx.fillRect(sx - s * 0.35, sy - s * 0.25, s * 0.7, s * 0.65);
        // Head
        ctx.fillStyle = this.skin;
        ctx.beginPath();
        ctx.arc(sx, sy - s * 0.5, s * 0.3, 0, Math.PI * 2);
        ctx.fill();
        if (this.panic > 0) {
            ctx.fillStyle = '#FF5252';
            ctx.font = 'bold 9px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('!', sx, sy - s * 1.0);
        }
        if (this.hp < this.maxHp) {
            const frac = Math.max(0, this.hp / this.maxHp);
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(sx - 6, sy - s - 6, 12, 3);
            ctx.fillStyle = frac > 0.5 ? '#8BC34A' : '#f44336';
            ctx.fillRect(sx - 6, sy - s - 6, 12 * frac, 3);
        }
    }
}

class City {
    constructor(site) {
        this.name = site.name;
        this.x = site.x; this.y = site.y;
        this.radius = 115;
        this.houses = [];
        this.civilians = [];
        this.fallen = false;
        this.underAttackTimer = 0; // > 0 while recently damaged (drives HUD/minimap warnings)
        this.alertCooldown = 0;
        this.smokeTimer = 0;

        // Deterministic layout per city name so towns look the same every time
        let seed = 0;
        for (const ch of site.name) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
        const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff; };

        const palettes = [
            { wall: '#D7CCC8', roof: '#8D3B2B' }, { wall: '#FFF3E0', roof: '#5D4037' },
            { wall: '#CFD8DC', roof: '#37474F' }, { wall: '#FFE0B2', roof: '#A1452E' },
            { wall: '#E8F5E9', roof: '#4E6E3A' }
        ];
        const houseCount = 7;
        for (let i = 0; i < houseCount; i++) {
            const a = (i / houseCount) * Math.PI * 2 + rng() * 0.4;
            const r = 55 + rng() * 30;
            const w = 30 + Math.floor(rng() * 10), h = 28 + Math.floor(rng() * 8);
            this.houses.push(new House(this.x + Math.cos(a) * r, this.y + Math.sin(a) * r * 0.75, w, h, this,
                palettes[Math.floor(rng() * palettes.length)]));
        }
        // Two residents per house
        this.houses.forEach(h => {
            for (let k = 0; k < 2; k++) {
                this.civilians.push(new Civilian(h.x + (rng() - 0.5) * 30, h.y + h.height * 0.6 + rng() * 10, h, this, rng));
            }
        });
        this.initialPop = this.civilians.length;
    }

    get population() { return this.civilians.length; }

    update(dt, game) {
        if (this.underAttackTimer > 0) this.underAttackTimer -= dt;
        if (this.alertCooldown > 0) this.alertCooldown -= dt;
        if (this.fallen) return;

        this.civilians.forEach(c => c.update(dt, game));

        // Detect incoming damage (projectiles just subtract hp) to raise the alarm
        let hit = false;
        [...this.houses, ...this.civilians].forEach(e => {
            if (e.hp < e.lastHp) hit = true;
            e.lastHp = e.hp;
        });
        if (hit) {
            this.underAttackTimer = 4;
            if (this.alertCooldown <= 0) {
                this.alertCooldown = 12;
                game.addRadioMessage(`🏘 ${this.name} is under attack!`, '#FF9800');
            }
        }

        // Destroyed houses collapse and take the people inside with them
        this.houses.forEach(h => {
            if (h.hp > 0) return;
            game.createExplosion(h.x, h.y, 34, '#8D6E63');
            game.addWreck(h.x, h.y, true);
            this.civilians.forEach(c => { if (c.home === h && Math.random() < 0.5) c.hp = 0; });
        });
        this.houses = this.houses.filter(h => h.hp > 0);

        this.civilians.forEach(c => {
            if (c.hp > 0) return;
            // Small red puff — no crater, these are people
            for (let i = 0; i < 6; i++) {
                const p = new Particle(c.x, c.y, '#C62828', 1.5 + Math.random() * 1.5,
                    (Math.random() - 0.5) * 2, -1 - Math.random());
                p.decay = 0.05;
                game.particles.push(p);
            }
        });
        const before = this.civilians.length;
        this.civilians = this.civilians.filter(c => c.hp > 0);
        if (this.civilians.length < before) this.underAttackTimer = 4;

        // Smoke from damaged houses
        this.smokeTimer -= dt;
        if (this.smokeTimer <= 0) {
            this.smokeTimer = 0.2;
            this.houses.forEach(h => {
                if (h.hp > h.maxHp * 0.5) return;
                const grey = Math.floor(50 + Math.random() * 40);
                const p = new Particle(h.x + (Math.random() - 0.5) * h.width * 0.6, h.y - h.height * 0.3,
                    `rgb(${grey},${grey},${grey})`, 3 + Math.random() * 3, (Math.random() - 0.5) * 0.4, -0.8);
                p.decay = 0.012; p.gravity = -0.005; p.grow = 0.05;
                game.particles.push(p);
            });
        }

        // Protected towns pay a small tax to the player
        game.resources.credits += this.civilians.length * 0.2 * dt;

        if (this.civilians.length === 0) {
            this.fallen = true;
            game.addRadioMessage(`☠ ${this.name} has fallen!`, '#FF1744');
        }
    }

    // Plaza and paths — drawn under everything
    renderGround(ctx, camera) {
        const sx = this.x - camera.x, sy = this.y - camera.y;
        ctx.save();
        ctx.fillStyle = 'rgba(176,148,104,0.35)';
        ctx.beginPath();
        ctx.ellipse(sx, sy, this.radius, this.radius * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(160,130,90,0.55)';
        ctx.lineWidth = 6;
        this.houses.forEach(h => {
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(h.x - camera.x, h.y - camera.y + h.height * 0.5);
            ctx.stroke();
        });
        // Well / fountain in the square
        ctx.fillStyle = '#90A4AE';
        ctx.beginPath(); ctx.arc(sx, sy, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4FC3F7';
        ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    renderLabel(ctx, camera) {
        const sx = this.x - camera.x, sy = this.y - camera.y - this.radius * 0.8 - 14;
        const attacked = this.underAttackTimer > 0 && !this.fallen;
        const text = this.fallen ? `${this.name} — FALLEN` : `🏘 ${this.name}  ${this.population}/${this.initialPop}`;
        ctx.save();
        ctx.font = 'bold 13px Arial';
        ctx.textAlign = 'center';
        const w = ctx.measureText(text).width + 14;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(sx - w / 2, sy - 13, w, 19);
        if (attacked) {
            ctx.strokeStyle = `rgba(255,82,82,${0.5 + 0.5 * Math.sin(Date.now() / 120)})`;
            ctx.lineWidth = 2;
            ctx.strokeRect(sx - w / 2, sy - 13, w, 19);
        }
        ctx.fillStyle = this.fallen ? '#9E9E9E' : attacked ? '#FF8A80' : '#E3F2FD';
        ctx.fillText(text, sx, sy + 1);
        ctx.restore();
    }
}

// ========== DIFFICULTY ==========
// base: what the player starts with. The multipliers tune the enemy and the raid timer.
const DIFFICULTIES = {
    easy: {
        label: 'Easy', color: '#4CAF50',
        desc: 'You start with every building and one of every unit. Enemy earns a little less.',
        base: 'full', playerCredits: 1.2, aiIncome: 0.85, aiAttack: 1.15, enemyHp: 1.0, raidDelay: 1.25
    },
    normal: {
        label: 'Normal', color: '#FFC107',
        desc: 'A small working base: barracks, war factory, power and a turret, plus a few units.',
        base: 'standard', playerCredits: 1.0, aiIncome: 1.0, aiAttack: 1.0, enemyHp: 1.0, raidDelay: 1.0
    },
    hard: {
        label: 'Hard', color: '#F44336',
        desc: 'Just an HQ, a refinery and two soldiers. The enemy is richer, tougher and attacks sooner.',
        base: 'minimal', playerCredits: 0.8, aiIncome: 1.35, aiAttack: 0.8, enemyHp: 1.2, raidDelay: 0.75
    }
};

// Small localStorage helpers that never throw (private mode / blocked storage)
function loadSetting(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
}
function saveSetting(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
}

// ========== SOUND ==========
// Every sound is synthesised with the Web Audio API, so there are no audio files.
// Battle sounds are positional: quieter when far from the camera, panned left/right.
class SoundFX {
    constructor(game) {
        this.game = game;
        this.ctx = null;
        this.enabled = loadSetting('titanwar_sound', true);
        this.musicOn = loadSetting('titanwar_music', true);
        this.lastPlayed = {};
        // Minimum seconds between repeats of the same sound, so big fights don't turn to noise
        this.throttle = { shot: 0.045, sniper: 0.08, cannon: 0.07, artillery: 0.1, rocket: 0.09, mortar: 0.1,
                          explosion: 0.05, radio: 0.8, ready: 0.15, built: 0.3, intercept: 0.3, launch: 1, bigboom: 1 };
        // Browsers only allow audio after the player interacts with the page
        const unlock = () => this.ensure();
        window.addEventListener('pointerdown', unlock);
        window.addEventListener('keydown', unlock);
    }

    ensure() {
        if (!this.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            const ctx = this.ctx = new AC();
            this.master = ctx.createGain();
            this.master.gain.value = 0.55;
            this.master.connect(ctx.destination);
            this.sfxBus = ctx.createGain();
            this.sfxBus.gain.value = this.enabled ? 1 : 0;
            this.sfxBus.connect(this.master);
            this.musicBus = ctx.createGain();
            this.musicBus.gain.value = this.musicOn ? 0.16 : 0;
            this.musicBus.connect(this.master);
            // One second of white noise, reused for every gunshot/explosion
            const len = ctx.sampleRate;
            this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
            const d = this.noiseBuf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
            this.startMusic();
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
    }

    setEnabled(on) {
        this.enabled = on;
        saveSetting('titanwar_sound', on);
        if (this.sfxBus) this.sfxBus.gain.value = on ? 1 : 0;
    }

    setMusic(on) {
        this.musicOn = on;
        saveSetting('titanwar_music', on);
        this.updateMusicVolume();
    }

    updateMusicVolume() {
        if (!this.musicBus) return;
        const target = !this.musicOn ? 0 : this.game.paused ? 0.06 : 0.16;
        this.musicBus.gain.setTargetAtTime(target, this.ctx.currentTime, 0.15);
    }

    // ---- building blocks ----
    noise(dest, t, dur, type, f0, f1, peak) {
        const ctx = this.ctx;
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuf;
        const filt = ctx.createBiquadFilter();
        filt.type = type;
        filt.frequency.setValueAtTime(f0, t);
        filt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(filt); filt.connect(g); g.connect(dest);
        src.start(t, Math.random() * 0.5);
        src.stop(t + dur + 0.05);
    }

    tone(dest, t, dur, type, f0, f1, peak, attack = 0.005) {
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(f0, t);
        if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g); g.connect(dest);
        osc.start(t);
        osc.stop(t + dur + 0.05);
    }

    // Play a named sound. (x, y) = world position for distance fade + stereo pan; omit for UI sounds.
    play(name, x, y, size = 20) {
        if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
        const now = this.ctx.currentTime;
        const gap = this.throttle[name] || 0.05;
        if (this.lastPlayed[name] && now - this.lastPlayed[name] < gap) return;

        let vol = 1, pan = 0;
        if (x !== undefined) {
            const cam = this.game.camera;
            const cx = cam.x + cam.width / 2, cy = cam.y + cam.height / 2;
            const dist = Math.hypot(x - cx, y - cy);
            vol = Math.pow(Math.max(0, 1 - dist / 1500), 1.6);
            if (vol < 0.04) return;
            pan = Math.max(-1, Math.min(1, (x - cx) / (cam.width / 2))) * 0.7;
        }
        this.lastPlayed[name] = now;

        const out = this.ctx.createGain();
        out.gain.value = vol;
        let dest = out;
        if (this.ctx.createStereoPanner) {
            const p = this.ctx.createStereoPanner();
            p.pan.value = pan;
            out.connect(p); p.connect(this.sfxBus);
        } else {
            out.connect(this.sfxBus);
        }
        setTimeout(() => { try { out.disconnect(); } catch (e) {} }, 4000);

        const t = now + 0.005;
        switch (name) {
            case 'shot':      this.noise(dest, t, 0.07, 'highpass', 2200, 1200, 0.22); break;
            case 'sniper':    this.noise(dest, t, 0.16, 'bandpass', 3000, 900, 0.5);
                              this.tone(dest, t, 0.06, 'square', 1200, 200, 0.06); break;
            case 'cannon':    this.noise(dest, t, 0.35, 'lowpass', 1400, 120, 0.55);
                              this.tone(dest, t, 0.3, 'sine', 140, 45, 0.45); break;
            case 'artillery': this.noise(dest, t, 0.6, 'lowpass', 900, 60, 0.7);
                              this.tone(dest, t, 0.5, 'sine', 100, 30, 0.6); break;
            case 'rocket':    this.noise(dest, t, 0.45, 'bandpass', 500, 2400, 0.3); break;
            case 'mortar':    this.tone(dest, t, 0.22, 'sine', 650, 260, 0.25);
                              this.noise(dest, t, 0.1, 'lowpass', 800, 300, 0.15); break;
            case 'explosion': {
                const big = Math.min(1, size / 70);
                this.noise(dest, t, 0.35 + big * 0.6, 'lowpass', 1600 - big * 600, 60, 0.45 + big * 0.4);
                this.tone(dest, t, 0.3 + big * 0.5, 'sine', 90, 28, 0.35 + big * 0.35);
                break;
            }
            case 'bigboom':   this.noise(dest, t, 2.8, 'lowpass', 700, 30, 0.95);
                              this.tone(dest, t, 2.2, 'sine', 70, 18, 0.9);
                              this.noise(dest, t + 0.05, 0.6, 'highpass', 3000, 800, 0.3); break;
            case 'launch':    this.noise(dest, t, 1.6, 'bandpass', 180, 1600, 0.45);
                              this.tone(dest, t, 1.4, 'sawtooth', 80, 220, 0.08, 0.3); break;
            case 'intercept': this.tone(dest, t, 0.35, 'sawtooth', 1800, 250, 0.12);
                              this.noise(dest, t + 0.05, 0.4, 'lowpass', 2000, 200, 0.4); break;
            case 'ready':     this.tone(dest, t, 0.09, 'square', 660, 660, 0.07);
                              this.tone(dest, t + 0.1, 0.12, 'square', 990, 990, 0.07); break;
            case 'built':     [523, 659, 784].forEach((f, i) => this.tone(dest, t + i * 0.09, 0.16, 'triangle', f, f, 0.16)); break;
            case 'radio':     this.tone(dest, t, 0.05, 'square', 1400, 1400, 0.04);
                              this.noise(dest, t + 0.05, 0.12, 'bandpass', 2000, 1500, 0.06); break;
        }
    }

    // ---- background music: a low, steady march loop (bass, kick, soft pad) ----
    startMusic() {
        const ctx = this.ctx;
        const bpm = 92, beat = 60 / bpm;
        // A minor: i - VI - III - VII  (A, F, C, G)
        const bassRoots = [55, 43.65, 65.41, 49];
        const pads = [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]];
        let step = 0;
        let nextTime = ctx.currentTime + 0.1;
        const schedule = () => {
            while (nextTime < ctx.currentTime + 0.4) {
                const bar = Math.floor(step / 8) % 4;
                const inBar = step % 8;            // eighth notes
                const t = nextTime;
                // Kick on beats 1 and 3, soft snare on 2 and 4
                if (inBar % 4 === 0) this.tone(this.musicBus, t, 0.25, 'sine', 120, 40, 0.9);
                if (inBar % 4 === 2) this.noise(this.musicBus, t, 0.12, 'bandpass', 1800, 900, 0.25);
                // Driving bass on eighths
                const root = bassRoots[bar];
                this.tone(this.musicBus, t, beat * 0.45, 'sawtooth', inBar === 7 ? root * 1.5 : root, inBar === 7 ? root * 1.5 : root, 0.22);
                // Pad chord at the top of each bar
                if (inBar === 0) {
                    pads[bar].forEach(f => this.tone(this.musicBus, t, beat * 4, 'triangle', f, f, 0.06, 0.4));
                }
                nextTime += beat / 2;
                step++;
            }
        };
        this.musicTimer = setInterval(schedule, 100);
        schedule();
    }
}

// ========== MAIN GAME ==========
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');

        this.minimapCanvas = document.getElementById('minimap');
        this.minimapCtx = this.minimapCanvas.getContext('2d');

        this.worldWidth = 3000;
        this.worldHeight = 2000;

        // Fixed game-world viewport — independent of canvas pixel size
        this.camera = {
            x: 0,
            y: 0,
            width: 1200,
            height: 700
        };

        this.units = [];
        this.buildings = [];
        this.projectiles = [];
        this.particles = [];
        this.nukes = [];
        this.shockwaves = [];
        this.screenShake = { x: 0, y: 0, intensity: 0, duration: 0 };
        this.smokeTimer = 0;
        this.craters = [];       // persistent ground marks
        this.wrecks = [];        // burning wreckage after deaths
        this.radioMessages = []; // war chatter HUD messages
        this.damageFlash = 0;    // red vignette when player takes hits
        this.orderMarkers = [];  // brief click-feedback rings for move/attack orders
        this.cities = [];        // neutral towns the player must protect
        this.revealWholeMap = true; // no fog of war for the player (set false to bring it back)
        this.paused = false;        // P key / Pause button
        this.difficulty = DIFFICULTIES[loadSetting('titanwar_difficulty', 'easy')] ? loadSetting('titanwar_difficulty', 'easy') : 'easy';
        this.sfx = new SoundFX(this);
        this.controlGroups = {}; // '1'..'9' -> array of units
        this.uiRefreshTimer = 0; // throttled live refresh of credits / queue / buttons
        this.resources = {
            credits: 2000,
            power: 0,
            maxPower: 0
        };

        this.selectedUnits = [];
        this.selectedBuilding = null;

        this.buildMode = null;
        this.buildCost = 0;

        // Command modes: null, 'move', 'attack'
        this.commandMode = null;
        this.nukeTargeting = false;
        this.nukeCost = 800;

        this.currentMission = null;

        this.playerTeam = 'player';
        this.enemyTeam = 'enemy';

        this.gameState = 'campaign'; // 'playing', 'won', 'lost', 'campaign'

        // Production queue system
        this.productionQueue = [];

        // Building placement restrictions
        this.buildRadius = 200; // Buildings must be within 200 pixels of existing buildings

        this.resourceDeposits = [];

        // Fog of war
        this.fogTileSize = 48; // world units per fog tile
        this.fogCols = Math.ceil(this.worldWidth / this.fogTileSize);
        this.fogRows = Math.ceil(this.worldHeight / this.fogTileSize);
        // 0 = unexplored (black), 1 = explored/shroud (dark), 2 = currently visible
        this.playerFog = new Uint8Array(this.fogCols * this.fogRows);
        this.enemyFog = new Uint8Array(this.fogCols * this.fogRows);
        this.initResourceDeposits();

        this.initRivers(); // before decorations so trees/rocks aren't placed in the water

        this.decorations = [];
        this.initDecorations();

        this.resizeCanvas();

        this.input = new InputHandler(this);
        this.ai = new GameAI(this);

        this.setupEventListeners();
        this.lastTime = 0;
        this.gameLoop(0);
    }

    init() {
        const mission = this.currentMission;
        const playerCredits = mission ? mission.playerCredits : 2000;
        const enemyCredits = mission ? mission.enemyCredits : 1000;

        const diff = this.diff();
        this.resources.credits = Math.round(playerCredits * diff.playerCredits);

        const hq = createBuilding('hq', 200, 200, this.playerTeam);
        this.buildings.push(hq);

        const refinery = createBuilding('refinery', 350, 250, this.playerTeam);
        this.buildings.push(refinery);

        // What the player starts with depends on the difficulty:
        //   Easy     -> every building type + one of every unit
        //   Normal   -> a small working base and a few units
        //   Hard     -> just the HQ, refinery, two soldiers and a harvester
        const startBases = {
            full: [
                ['power',        80,  90],
                ['missile_silo', 360, 110],
                ['aa_battery',   480, 160],
                ['barracks',     90,  330],
                ['factory',      230, 365],
                ['turret',       490, 330],
                ['turret',       340, 470],
                ['sandbag',      540, 290],
                ['sandbag',      390, 525]
            ],
            standard: [
                ['power',    80,  90],
                ['barracks', 90,  330],
                ['factory',  230, 365],
                ['turret',   490, 330]
            ],
            minimal: []
        };
        const startUnits = {
            full: ['tank', 'sniper', 'artillery', 'commando', 'bazooka', 'general',
                   'helicopter', 'medic', 'mortar', 'apc'],
            standard: ['tank', 'sniper', 'medic'],
            minimal: []
        };
        (startBases[diff.base] || []).forEach(([type, x, y]) => {
            const b = createBuilding(type, x, y, this.playerTeam);
            // The silo starts charging so missions can't be won with an instant nuke
            if (type === 'missile_silo') b.nukeCooldown = b.maxNukeCooldown;
            this.buildings.push(b);
        });

        this.units.push(createUnit('soldier', 250, 250, this.playerTeam));
        this.units.push(createUnit('soldier', 280, 250, this.playerTeam));
        this.units.push(createUnit('harvester', 300, 280, this.playerTeam));
        const rally = { x: 640, y: 200, width: 0, height: 0 }; // open rally ground east of the base
        (startUnits[diff.base] || []).forEach(type => {
            const size = createUnit(type, 0, 0, this.playerTeam).size;
            const pos = this.findSpawnPosition(rally, size);
            this.units.push(createUnit(type, pos.x, pos.y, this.playerTeam));
        });

        const enemyHQX = 2500, enemyHQY = 1500;
        const enemyHQ = createBuilding('hq', enemyHQX, enemyHQY, this.enemyTeam);
        this.buildings.push(enemyHQ);

        const enemyRefinery = createBuilding('refinery', 2350, 1550, this.enemyTeam);
        this.buildings.push(enemyRefinery);

        this.units.push(createUnit('soldier', 2450, 1450, this.enemyTeam));
        this.units.push(createUnit('soldier', 2480, 1450, this.enemyTeam));
        this.units.push(createUnit('tank', 2500, 1500, this.enemyTeam));
        this.units.push(createUnit('harvester', 2400, 1520, this.enemyTeam));

        // Spawn mission-specific extra units and buildings
        if (mission) {
            (mission.enemyExtraUnits || []).forEach(eu => {
                this.units.push(createUnit(eu.type, enemyHQX + eu.offsetX, enemyHQY + eu.offsetY, this.enemyTeam));
            });
            (mission.enemyExtraBuildings || []).forEach(eb => {
                // Some mission layouts stack buildings on top of each other; nudge to the nearest free spot
                const b = createBuilding(eb.type, enemyHQX + eb.offsetX, enemyHQY + eb.offsetY, this.enemyTeam);
                const spot = this.findFreeSpotFor(b);
                b.x = spot.x; b.y = spot.y;
                this.buildings.push(b);
            });
            this.ai.credits = enemyCredits;
            this.ai.missionConfig = mission.ai || null;
        }
        this.units.forEach(u => { if (u.team === this.enemyTeam) this.applyEnemyDifficulty(u); });

        this.initCities();

        this.resetFog();
        this.updateFog(); // Reveal starting area immediately
        this.updateUI();
    }

    // Nearest position (spiralling outward) where building `b` doesn't overlap another building
    // and stays inside the map.
    findFreeSpotFor(b) {
        const fits = (x, y) => {
            if (x - b.width / 2 < 10 || x + b.width / 2 > this.worldWidth - 10 ||
                y - b.height / 2 < 10 || y + b.height / 2 > this.worldHeight - 10) return false;
            if (this.areaHasWater(x, y, b.width, b.height) || this.nearBridge(x, y, 40)) return false;
            return !this.buildings.some(o =>
                Math.abs(o.x - x) < (o.width + b.width) / 2 + 6 &&
                Math.abs(o.y - y) < (o.height + b.height) / 2 + 6);
        };
        if (fits(b.x, b.y)) return { x: b.x, y: b.y };
        for (let r = 20; r <= 400; r += 20) {
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
                const x = b.x + Math.cos(a) * r, y = b.y + Math.sin(a) * r;
                if (fits(x, y)) return { x, y };
            }
        }
        return { x: b.x, y: b.y };
    }

    // More towns to defend as the campaign gets harder
    initCities() {
        const id = this.currentMission ? this.currentMission.id : 1;
        const count = id <= 3 ? 2 : id <= 8 ? 3 : 4;
        this.cities = CITY_SITES.slice(0, count).map(site => new City(site));
        // Grace period before the enemy starts raiding towns: time to get defences out
        this.missionTime = 0;
        this.raidDelay = Math.max(45, (150 - id * 6) * this.diff().raidDelay);
        this.raidWarned = false;
    }

    // Has the grace period ended? (Enemy ignores towns until then.)
    townsExposed() {
        return (this.missionTime || 0) >= (this.raidDelay || 0);
    }

    // Everything in the towns that the enemy can shoot at
    cityTargets() {
        const out = [];
        this.cities.forEach(c => {
            if (c.fallen) return;
            c.houses.forEach(h => { if (h.hp > 0) out.push(h); });
            c.civilians.forEach(p => { if (p.hp > 0) out.push(p); });
        });
        return out;
    }

    // True if a 60x60 building at (x, y) would overlap a town house
    overlapsCity(x, y) {
        return this.cities.some(c => c.houses.some(h =>
            Math.abs(x - h.x) < (60 + h.width) / 2 + 10 &&
            Math.abs(y - h.y) < (60 + h.height) / 2 + 10));
    }

    initResourceDeposits() {
        // Spread gold deposits throughout the map
        this.resourceDeposits = [
            // Near player base
            { x: 400, y: 300, amount: 6000, maxAmount: 6000 },
            { x: 500, y: 500, amount: 5000, maxAmount: 5000 },
            { x: 300, y: 600, amount: 4500, maxAmount: 4500 },

            // Near enemy base
            { x: 2300, y: 1300, amount: 6000, maxAmount: 6000 },
            { x: 2400, y: 1600, amount: 5000, maxAmount: 5000 },
            { x: 2700, y: 1400, amount: 4500, maxAmount: 4500 },

            // Center of map (contested) - around the lake
            { x: 1100, y: 950, amount: 8000, maxAmount: 8000 },  // West of lake
            { x: 1500, y: 600, amount: 7000, maxAmount: 7000 },  // North of lake
            { x: 1850, y: 950, amount: 7000, maxAmount: 7000 },  // East of lake

            // Left side
            { x: 600, y: 1000, amount: 5500, maxAmount: 5500 },
            { x: 800, y: 1500, amount: 5000, maxAmount: 5000 },
            { x: 400, y: 1200, amount: 4500, maxAmount: 4500 },

            // Right side
            { x: 2200, y: 800, amount: 5500, maxAmount: 5500 },
            { x: 2600, y: 600, amount: 5000, maxAmount: 5000 },
            { x: 2400, y: 400, amount: 4500, maxAmount: 4500 },

            // Top area
            { x: 1200, y: 400, amount: 5000, maxAmount: 5000 },
            { x: 1800, y: 300, amount: 5000, maxAmount: 5000 },

            // Bottom area
            { x: 1000, y: 1700, amount: 5000, maxAmount: 5000 },
            { x: 1800, y: 1800, amount: 5000, maxAmount: 5000 }
        ];
    }

    resizeCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            // Render at the screen's real pixel density so Retina displays aren't blurry.
            // (Input maths uses CSS-pixel rects, so it's unaffected.)
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            this.canvas.width = Math.floor(rect.width * dpr);
            this.canvas.height = Math.floor(rect.height * dpr);
            // Keep camera height fixed; adjust width to match canvas aspect ratio
            // so ctx.scale() uses the same factor on both axes (no stretching)
            const baseHeight = 700;
            this.camera.height = baseHeight;
            this.camera.width = Math.round(baseHeight * (rect.width / rect.height));
            // A resize can leave the camera past the edge of the world; pull it back
            this.camera.x = Math.max(0, Math.min(this.camera.x, this.worldWidth - this.camera.width));
            this.camera.y = Math.max(0, Math.min(this.camera.y, this.worldHeight - this.camera.height));
        }
        const mmRect = this.minimapCanvas.getBoundingClientRect();
        if (mmRect.width > 0 && mmRect.height > 0) {
            this.minimapCanvas.width = Math.floor(mmRect.width);
            this.minimapCanvas.height = Math.floor(mmRect.height);
        }
    }

    setupEventListeners() {
        document.querySelectorAll('.build-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.type;
                const cost = parseInt(btn.dataset.cost);
                this.enterBuildMode(type, cost);
            });
        });

        document.querySelectorAll('.unit-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.type;
                const cost = parseInt(btn.dataset.cost);
                this.produceUnit(type, cost);
            });
        });

        document.getElementById('move-mode-btn').addEventListener('click', () => {
            this.enterMoveMode();
        });

        document.getElementById('attack-mode-btn').addEventListener('click', () => {
            this.enterAttackMode();
        });

        document.getElementById('stop-btn').addEventListener('click', () => {
            this.stopSelectedUnits();
        });

        // Launch nuke button
        const nukeBtn = document.getElementById('launch-nuke-btn');
        if (nukeBtn) {
            nukeBtn.addEventListener('click', () => this.launchNuke());
        }

        // Repair button
        const repairBtn = document.getElementById('repair-btn');
        if (repairBtn) {
            repairBtn.addEventListener('click', () => {
                const b = this.selectedBuilding;
                if (!b || b.team !== this.playerTeam) return;
                if (b.hp >= b.maxHp) return;
                b.repairing = !b.repairing;
                this.updateUI();
            });
        }

        const evacuateBtn = document.getElementById('evacuate-btn');
        if (evacuateBtn) {
            evacuateBtn.addEventListener('click', () => {
                const b = this.selectedBuilding;
                if (!b || !b.garrison) return;
                // Place evacuated units near the building
                b.garrison.forEach((u, i) => {
                    const angle = (i / b.garrison.length) * Math.PI * 2;
                    u.x = b.x + Math.cos(angle) * (b.width/2 + 20);
                    u.y = b.y + Math.sin(angle) * (b.height/2 + 20);
                    u.targetX = u.x;
                    u.targetY = u.y;
                    u.garrisonedIn = null;
                });
                b.garrison = [];
                this.updateUI();
            });
        }

        // Campaign button
        // Fog of war on/off (side-panel button; the campaign menu has one too). Remembered between sessions.
        try {
            const saved = localStorage.getItem('titanwar_reveal_map');
            if (saved !== null) this.revealWholeMap = saved === '1';
        } catch (e) { /* storage blocked: keep the default */ }
        const fogBtn = document.getElementById('fog-toggle-btn');
        if (fogBtn) {
            fogBtn.addEventListener('click', () => {
                this.toggleFog();
                fogBtn.blur(); // so keyboard shortcuts keep controlling the game
            });
        }
        this.updateFogButtons();

        // Pause / sound / music buttons in the side panel
        const wire = (id, fn) => {
            const b = document.getElementById(id);
            if (b) b.addEventListener('click', () => { fn(); b.blur(); });
        };
        wire('pause-btn', () => this.togglePause());
        wire('sound-btn', () => this.toggleSound());
        wire('music-btn', () => this.toggleMusic());
        this.updateSoundButtons();
        this.updatePauseButton();

        const campaignBtn = document.getElementById('campaign-btn');
        if (campaignBtn) {
            campaignBtn.addEventListener('click', () => this.showCampaignScreen());
        }

        // Cheat buttons
        document.getElementById('add-money-btn').addEventListener('click', () => {
            this.addMoney();
        });

        document.getElementById('spawn-army-btn').addEventListener('click', () => {
            this.spawnArmy();
        });

        document.getElementById('nuke-enemy-btn').addEventListener('click', () => {
            this.nukeEnemyBase();
        });

        // Minimap navigation
        this.minimapCanvas.addEventListener('click', (e) => {
            this.onMinimapClick(e);
        });

        document.getElementById('goto-base-btn').addEventListener('click', () => {
            this.goToBase();
        });
    }

    enterBuildMode(type, cost) {
        const prereq = BUILD_PREREQS[type];
        if (prereq && !this.buildings.some(b => b.team === this.playerTeam && b.type === prereq.requires)) {
            const info = document.getElementById('selected-info');
            if (info) {
                info.textContent = `⚠️ Requires ${prereq.label} first`;
                info.style.color = '#f44336';
                setTimeout(() => { info.textContent = ''; info.style.color = '#aaa'; }, 2500);
            }
            return;
        }
        if (this.resources.credits >= cost) {
            this.buildMode = type;
            this.buildCost = cost;
            this.canvas.style.cursor = 'cell';
        } else {
            const info = document.getElementById('selected-info');
            if (info) {
                info.textContent = `⚠️ Need ${cost - Math.floor(this.resources.credits)} more credits`;
                info.style.color = '#f44336';
                setTimeout(() => { info.textContent = ''; info.style.color = '#aaa'; }, 2000);
            }
        }
    }

    placeBuilding(x, y) {
        if (this.buildMode && this.resources.credits >= this.buildCost) {
            // Check if position doesn't overlap with existing buildings
            const buildError = this.getBuildError(x, y);
            if (buildError) {
                const infoElement = document.getElementById('selected-info');
                infoElement.textContent = `⚠️ ${buildError}`;
                infoElement.style.color = '#f44336';
                setTimeout(() => {
                    infoElement.textContent = '';
                    infoElement.style.color = '#aaa';
                }, 2500);
                return;
            }

            // Calculate build time based on cost (cost / 50 = seconds)
            const buildTime = this.buildCost / 50;

            // Add to production queue instead of creating instantly
            this.productionQueue.push({
                itemType: 'building',
                buildingType: this.buildMode,
                x: x,
                y: y,
                timeRemaining: buildTime,
                totalTime: buildTime,
                cost: this.buildCost
            });

            this.resources.credits -= this.buildCost;
            this.buildMode = null;
            this.canvas.style.cursor = 'crosshair';
            this.updateUI();
        }
    }

    // Single source of truth for build placement. Returns an error message, or null if OK.
    // `team` defaults to the player; the AI passes its own team (no base-proximity rules).
    getBuildError(x, y, team = this.playerTeam) {
        const newBuildingSize = 60;
        const half = newBuildingSize / 2;
        if (x - half < 10 || x + half > this.worldWidth - 10 || y - half < 10 || y + half > this.worldHeight - 10) {
            return 'Too close to the edge of the map!';
        }
        for (const building of this.buildings) {
            const dx = Math.abs(x - building.x);
            const dy = Math.abs(y - building.y);
            const minDistance = (newBuildingSize + Math.max(building.width, building.height)) / 2 + 10;
            if (dx < minDistance && dy < minDistance) return 'Too close to an existing building!';
        }
        // Buildings still under construction occupy their spot too
        for (const item of this.productionQueue) {
            if (item.itemType !== 'building') continue;
            if (Math.abs(x - item.x) < newBuildingSize + 10 && Math.abs(y - item.y) < newBuildingSize + 10) {
                return 'Another building is already going up there!';
            }
        }
        if (this.overlapsCity(x, y)) return 'Cannot build on top of a town!';
        if (this.areaHasWater(x, y, newBuildingSize, newBuildingSize)) return 'Cannot build on water or mountains!';
        if (this.nearBridge(x, y, 40)) return 'Cannot block a bridge!';

        if (team === this.playerTeam) {
            const nearFriendly = this.buildings.some(b => {
                if (b.team !== this.playerTeam) return false;
                const dx = x - b.x, dy = y - b.y;
                return Math.sqrt(dx * dx + dy * dy) <= this.buildRadius;
            });
            if (!nearFriendly) return 'Must build within range of your base!';
            const tooCloseToEnemy = this.buildings.some(b => {
                if (b.team === this.playerTeam) return false;
                const dx = x - b.x, dy = y - b.y;
                return Math.sqrt(dx * dx + dy * dy) < 350;
            });
            if (tooCloseToEnemy) return 'Too close to enemy territory!';
        }
        return null;
    }

    isValidBuildLocation(x, y, team = this.playerTeam) {
        return this.getBuildError(x, y, team) === null;
    }

    // ---- RIVERS ----

    initRivers() {
        const segDist = (px, py, ax, ay, bx, by) => {
            const vx = bx - ax, vy = by - ay;
            const len2 = vx * vx + vy * vy || 1;
            const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2));
            const cx = ax + vx * t, cy = ay + vy * t;
            return Math.hypot(px - cx, py - cy);
        };

        this.rivers = RIVERS.map(r => {
            const segs = [];
            for (let i = 0; i < r.points.length - 1; i++) segs.push([r.points[i], r.points[i + 1]]);
            const bridges = r.bridges.map(([bx, by]) => {
                // Orient the bridge perpendicular to the nearest stretch of river
                let best = segs[0], bestD = Infinity;
                segs.forEach(s => {
                    const d = segDist(bx, by, s[0][0], s[0][1], s[1][0], s[1][1]);
                    if (d < bestD) { bestD = d; best = s; }
                });
                const tx = best[1][0] - best[0][0], ty = best[1][1] - best[0][1];
                const tl = Math.hypot(tx, ty) || 1;
                const t = { x: tx / tl, y: ty / tl };   // along the river
                const n = { x: -t.y, y: t.x };          // across the river (direction of travel)
                return { x: bx, y: by, t, n, halfLen: r.halfWidth + 14, halfWidth: 26 };
            });
            return { name: r.name, halfWidth: r.halfWidth, points: r.points, segs, bridges };
        });
        this.bridges = this.rivers.flatMap(r => r.bridges);

        // Mountain ridges: segments for the blocking grid, plus pre-placed peaks for drawing
        let mSeed = 7;
        const mRng = () => { mSeed = (mSeed * 1664525 + 1013904223) >>> 0; return mSeed / 0xffffffff; };
        this.mountains = MOUNTAIN_RIDGES.map(m => {
            const segs = [];
            for (let i = 0; i < m.points.length - 1; i++) segs.push([m.points[i], m.points[i + 1]]);
            return { halfWidth: m.halfWidth, points: m.points, segs };
        });
        this.mountainPeaks = [];
        this.mountains.forEach(m => m.segs.forEach(([a, b]) => {
            const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
            const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
            for (let d = 0; d < len; d += 22) {
                const t = d / len, side = (mRng() - 0.5) * m.halfWidth * 0.9;
                const size = 20 + mRng() * 20;
                this.mountainPeaks.push({
                    x: a[0] + (b[0] - a[0]) * t + nx * side,
                    y: a[1] + (b[1] - a[1]) * t + ny * side,
                    s: size, snow: size > 31
                });
            }
        }));
        this.mountainPeaks.sort((p, q) => p.y - q.y); // back-to-front

        // Rasterise water (and rock) into a coarse grid so lookups are O(1)
        const cs = this.waterCell = 8;
        this.waterCols = Math.ceil(this.worldWidth / cs);
        this.waterRows = Math.ceil(this.worldHeight / cs);
        this.waterGrid = new Uint8Array(this.waterCols * this.waterRows);
        for (let row = 0; row < this.waterRows; row++) {
            for (let col = 0; col < this.waterCols; col++) {
                const x = (col + 0.5) * cs, y = (row + 0.5) * cs;
                let water = false;
                for (const r of this.rivers) {
                    for (const s of r.segs) {
                        if (segDist(x, y, s[0][0], s[0][1], s[1][0], s[1][1]) < r.halfWidth) { water = true; break; }
                    }
                    if (water) break;
                }
                if (water) {
                    // Bridge decks are dry land
                    for (const b of this.bridges) {
                        const lx = x - b.x, ly = y - b.y;
                        if (Math.abs(lx * b.t.x + ly * b.t.y) < b.halfWidth &&
                            Math.abs(lx * b.n.x + ly * b.n.y) < b.halfLen + 4) { water = false; break; }
                    }
                }
                if (water) { this.waterGrid[row * this.waterCols + col] = 1; continue; }
                // Mountains are impassable rock (stored as 2; isWater() treats any non-zero as blocked)
                for (const m of this.mountains) {
                    let rock = false;
                    for (const sg of m.segs) {
                        if (segDist(x, y, sg[0][0], sg[0][1], sg[1][0], sg[1][1]) < m.halfWidth) { rock = true; break; }
                    }
                    if (rock) { this.waterGrid[row * this.waterCols + col] = 2; break; }
                }
            }
        }

        // Pathfinding graph: a node on each bank at both ends of every bridge
        this.bridgeNodes = [];
        this.bridges.forEach(b => {
            [-1, 1].forEach(side => {
                let off = b.halfLen + 16;
                let x = b.x + b.n.x * off * side, y = b.y + b.n.y * off * side;
                while (this.isWater(x, y) && off < b.halfLen + 80) {
                    off += 8;
                    x = b.x + b.n.x * off * side; y = b.y + b.n.y * off * side;
                }
                this.bridgeNodes.push({ x, y });
            });
        });
        MOUNTAIN_PASSES.forEach(p => {
            const dx = p.x - 200, dy = p.y - 200, d = Math.hypot(dx, dy) || 1; // direction away from the base
            [-70, 0, 70].forEach(off => {
                const x = p.x + dx / d * off, y = p.y + dy / d * off;
                if (!this.isWater(x, y)) this.bridgeNodes.push({ x, y });
            });
        });
        this.nodeEdges = this.bridgeNodes.map(() => []);
        for (let i = 0; i < this.bridgeNodes.length; i++) {
            for (let j = i + 1; j < this.bridgeNodes.length; j++) {
                const a = this.bridgeNodes[i], b = this.bridgeNodes[j];
                if (this.lineClear(a.x, a.y, b.x, b.y)) {
                    const w = Math.hypot(a.x - b.x, a.y - b.y);
                    this.nodeEdges[i].push({ j, w });
                    this.nodeEdges[j].push({ j: i, w });
                }
            }
        }
    }

    isWater(x, y) {
        if (!this.waterGrid) return false;
        const col = Math.floor(x / this.waterCell), row = Math.floor(y / this.waterCell);
        if (col < 0 || row < 0 || col >= this.waterCols || row >= this.waterRows) return false;
        return this.waterGrid[row * this.waterCols + col] !== 0; // water (1) or mountain rock (2)
    }

    // Any water inside a w×h box centred on (x, y)?
    areaHasWater(x, y, w, h) {
        for (let yy = y - h / 2; yy <= y + h / 2; yy += 6) {
            for (let xx = x - w / 2; xx <= x + w / 2; xx += 6) {
                if (this.isWater(xx, yy)) return true;
            }
        }
        return false;
    }

    nearBridge(x, y, margin) {
        return this.bridges.some(b => Math.hypot(x - b.x, y - b.y) < b.halfLen + margin);
    }

    nearestLand(x, y) {
        if (!this.isWater(x, y)) return { x, y };
        for (let r = 8; r <= 400; r += 8) {
            for (let a = 0; a < 16; a++) {
                const ang = (a / 16) * Math.PI * 2;
                const nx = x + Math.cos(ang) * r, ny = y + Math.sin(ang) * r;
                if (!this.isWater(nx, ny)) return { x: nx, y: ny };
            }
        }
        return { x, y };
    }

    // True if a ground unit could walk in a straight line between the two points
    lineClear(x0, y0, x1, y1) {
        const d = Math.hypot(x1 - x0, y1 - y0);
        const steps = Math.ceil(d / 6);
        for (let i = 1; i <= steps; i++) {
            if (i * 6 < 10) continue; // tolerate a start point that's been nudged onto the bank
            const t = i / steps;
            if (this.isWater(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
        }
        return true;
    }

    // Shortest route via bridges (Dijkstra over bridge-end nodes). Returns a list of
    // waypoints ending at the goal, or null when the straight line is already clear
    // (or no crossing exists).
    findPath(sx, sy, gx, gy) {
        if (!this.waterGrid || this.lineClear(sx, sy, gx, gy)) return null;
        const nodes = this.bridgeNodes;
        const n = nodes.length;
        const GOAL = n;
        const dist = new Array(n + 1).fill(Infinity);
        const prev = new Array(n + 1).fill(-1);
        const done = new Array(n + 1).fill(false);
        const goalVis = nodes.map(p => this.lineClear(p.x, p.y, gx, gy));
        nodes.forEach((p, i) => {
            if (this.lineClear(sx, sy, p.x, p.y)) dist[i] = Math.hypot(p.x - sx, p.y - sy);
        });
        for (;;) {
            let u = -1, best = Infinity;
            for (let i = 0; i <= n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
            if (u === -1 || u === GOAL) break;
            done[u] = true;
            for (const e of this.nodeEdges[u]) {
                if (dist[u] + e.w < dist[e.j]) { dist[e.j] = dist[u] + e.w; prev[e.j] = u; }
            }
            if (goalVis[u]) {
                const w = Math.hypot(nodes[u].x - gx, nodes[u].y - gy);
                if (dist[u] + w < dist[GOAL]) { dist[GOAL] = dist[u] + w; prev[GOAL] = u; }
            }
        }
        if (dist[GOAL] === Infinity) return null;
        const path = [{ x: gx, y: gy }];
        for (let k = prev[GOAL]; k !== -1; k = prev[k]) path.unshift({ x: nodes[k].x, y: nodes[k].y });
        return path;
    }

    renderRivers() {
        const ctx = this.ctx, cam = this.camera;
        const t = performance.now() / 1000;
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        const trace = r => {
            ctx.beginPath();
            r.points.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x - cam.x, y - cam.y) : ctx.lineTo(x - cam.x, y - cam.y));
        };
        this.rivers.forEach(r => {
            // Muddy banks, deep water, lighter channel, then flowing ripples
            trace(r); ctx.strokeStyle = '#7d6b45'; ctx.lineWidth = r.halfWidth * 2 + 14; ctx.stroke();
            trace(r); ctx.strokeStyle = '#a08a5a'; ctx.lineWidth = r.halfWidth * 2 + 6; ctx.stroke();
            trace(r); ctx.strokeStyle = '#1d5583'; ctx.lineWidth = r.halfWidth * 2; ctx.stroke();
            trace(r); ctx.strokeStyle = '#2b74ad'; ctx.lineWidth = r.halfWidth * 1.2; ctx.stroke();
            ctx.setLineDash([16, 26]);
            ctx.lineDashOffset = -t * 28;
            trace(r); ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 2; ctx.stroke();
            ctx.setLineDash([6, 34]);
            ctx.lineDashOffset = -t * 40 + 11;
            trace(r); ctx.strokeStyle = 'rgba(190,230,255,0.25)'; ctx.lineWidth = r.halfWidth * 0.9; ctx.stroke();
            ctx.setLineDash([]);
        });

        // Bridges: wooden decks with planks and rails
        this.bridges.forEach(b => {
            const sx = b.x - cam.x, sy = b.y - cam.y;
            if (sx < -100 || sy < -100 || sx > cam.width + 100 || sy > cam.height + 100) return;
            ctx.save();
            ctx.translate(sx, sy);
            ctx.rotate(Math.atan2(b.n.y, b.n.x)); // local x-axis runs across the river
            const L = b.halfLen + 6, W = b.halfWidth;
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(-L + 4, -W + 5, L * 2, W * 2);
            ctx.fillStyle = '#9C6B3C';
            ctx.fillRect(-L, -W, L * 2, W * 2);
            ctx.strokeStyle = '#6D4526';
            ctx.lineWidth = 1.5;
            for (let k = -L + 5; k < L; k += 7) {
                ctx.beginPath(); ctx.moveTo(k, -W); ctx.lineTo(k, W); ctx.stroke();
            }
            ctx.fillStyle = '#4E342E';
            ctx.fillRect(-L, -W - 3, L * 2, 5);
            ctx.fillRect(-L, W - 2, L * 2, 5);
            ctx.restore();
        });
        ctx.restore();
    }

    renderMountains() {
        const ctx = this.ctx, cam = this.camera;
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        // Rocky base band under the peaks
        this.mountains.forEach(m => {
            const trace = () => {
                ctx.beginPath();
                m.points.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x - cam.x, y - cam.y) : ctx.lineTo(x - cam.x, y - cam.y));
            };
            trace(); ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = m.halfWidth * 2 + 18; ctx.stroke();
            trace(); ctx.strokeStyle = '#5a5347'; ctx.lineWidth = m.halfWidth * 2 + 8; ctx.stroke();
            trace(); ctx.strokeStyle = '#6e6658'; ctx.lineWidth = m.halfWidth * 2 - 6; ctx.stroke();
        });
        // Peaks: lit west face, shadowed east face, snow on the tall ones
        this.mountainPeaks.forEach(p => {
            const sx = p.x - cam.x, sy = p.y - cam.y, s = p.s;
            if (sx < -s * 2 || sx > cam.width + s * 2 || sy < -s * 2 || sy > cam.height + s * 2) return;
            const apexY = sy - s * 0.85, baseY = sy + s * 0.4;
            ctx.fillStyle = '#9b9384';
            ctx.beginPath(); ctx.moveTo(sx - s * 0.9, baseY); ctx.lineTo(sx, apexY); ctx.lineTo(sx, baseY); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#6b6457';
            ctx.beginPath(); ctx.moveTo(sx, apexY); ctx.lineTo(sx + s * 0.9, baseY); ctx.lineTo(sx, baseY); ctx.closePath(); ctx.fill();
            if (p.snow) {
                ctx.fillStyle = '#F5F5F5';
                ctx.beginPath();
                ctx.moveTo(sx, apexY);
                ctx.lineTo(sx - s * 0.28, apexY + s * 0.34);
                ctx.lineTo(sx - s * 0.08, apexY + s * 0.26);
                ctx.lineTo(sx + s * 0.06, apexY + s * 0.36);
                ctx.lineTo(sx + s * 0.28, apexY + s * 0.34);
                ctx.closePath();
                ctx.fill();
            }
        });
        // Pass names so players know where the gaps are
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        MOUNTAIN_PASSES.forEach(p => {
            const sx = p.x - cam.x, sy = p.y - cam.y;
            if (sx < -100 || sx > cam.width + 100 || sy < -100 || sy > cam.height + 100) return;
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            const w = ctx.measureText(p.name).width + 10;
            ctx.fillRect(sx - w / 2, sy - 9, w, 16);
            ctx.fillStyle = '#E0D6C2';
            ctx.fillText(p.name, sx, sy + 3);
        });
        ctx.restore();
    }

    findSpawnPosition(building, unitSize) {
        const buildingRadius = Math.max(building.width, building.height) / 2;
        const startRadius = buildingRadius + unitSize + 10; // Start just outside building
        const maxRadius = startRadius + 100; // Search up to 100 pixels away
        const angleStep = Math.PI / 6; // 30 degrees

        // Try increasing radii
        for (let radius = startRadius; radius <= maxRadius; radius += unitSize * 2) {
            // Try different angles at this radius
            for (let angle = 0; angle < Math.PI * 2; angle += angleStep) {
                const x = building.x + Math.cos(angle) * radius;
                const y = building.y + Math.sin(angle) * radius;

                // Check if this position is clear (and on dry land)
                let isClear = !this.isWater(x, y);
                for (const unit of this.units) {
                    const dx = x - unit.x;
                    const dy = y - unit.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < (unitSize + unit.size + 5)) {
                        isClear = false;
                        break;
                    }
                }

                if (isClear) {
                    return { x, y };
                }
            }
        }

        // Fallback: return position with random offset
        const randomAngle = Math.random() * Math.PI * 2;
        return {
            x: building.x + Math.cos(randomAngle) * startRadius,
            y: building.y + Math.sin(randomAngle) * startRadius
        };
    }

    produceUnit(type, cost) {
        const infoEl = document.getElementById('selected-info');

        // Only one General allowed at a time
        if (type === 'general' && (this.units.some(u => u.type === 'general' && u.team === this.playerTeam) ||
                                   this.productionQueue.some(q => q.itemType === 'unit' && q.unitType === 'general'))) {
            infoEl.textContent = '⚠️ You already have a General in the field!';
            infoEl.style.color = '#f44336';
            setTimeout(() => { infoEl.textContent = ''; infoEl.style.color = '#aaa'; }, 2000);
            return;
        }

        const requirements = {
            'soldier': 'barracks',
            'tank': 'factory',
            'sniper': 'factory',
            'artillery': 'factory',
            'commando': 'factory',
            'harvester': 'hq',
            'helicopter': 'factory',
            'apc': 'factory',
            'mortar': 'barracks',
            'medic': 'barracks',
            'bazooka': 'barracks',
            'general': 'barracks'
        };
        const reqLabels = {
            'barracks': 'Barracks', 'factory': 'War Factory', 'hq': 'HQ'
        };

        if (this.resources.credits < cost) {
            infoEl.textContent = `⚠️ Need ${cost - Math.floor(this.resources.credits)} more credits`;
            infoEl.style.color = '#f44336';
            setTimeout(() => { infoEl.textContent = ''; infoEl.style.color = '#aaa'; }, 2000);
            return;
        }

        const requiredBuilding = requirements[type];
        const productionBuilding = this.buildings.find(b =>
            b.team === this.playerTeam && b.type === requiredBuilding
        );

        if (!productionBuilding) {
            infoEl.textContent = `⚠️ Need a ${reqLabels[requiredBuilding] || requiredBuilding} to produce ${type}`;
            infoEl.style.color = '#f44336';
            setTimeout(() => { infoEl.textContent = ''; infoEl.style.color = '#aaa'; }, 2000);
            return;
        }

        const buildTime = cost / 50;
        this.productionQueue.push({
            itemType: 'unit',
            unitType: type,
            building: productionBuilding,
            timeRemaining: buildTime,
            totalTime: buildTime,
            cost: cost
        });
        this.resources.credits -= cost;
        this.updateUI();
    }

    setAttackMoveMode() {
        this.selectedUnits.forEach(unit => {
            unit.attackMove = true;
        });
    }

    stopSelectedUnits() {
        this.selectedUnits.forEach(unit => {
            unit.stop();
        });
    }

    enterMoveMode() {
        if (this.selectedUnits.length > 0) {
            this.commandMode = 'move';
            this.canvas.style.cursor = 'move';
            document.getElementById('selected-info').textContent =
                `${this.selectedUnits.length} unit(s) - Click where to MOVE`;
        }
    }

    enterAttackMode() {
        if (this.selectedUnits.length > 0) {
            this.commandMode = 'attack';
            this.canvas.style.cursor = 'crosshair';
            document.getElementById('selected-info').textContent =
                `${this.selectedUnits.length} unit(s) - Click where to ATTACK`;
        }
    }

    addMoney() {
        this.resources.credits += 5000;
        this.updateUI();
    }

    spawnArmy() {
        const hq = this.buildings.find(b => b.team === this.playerTeam && b.type === 'hq');
        if (!hq) return;

        const armyTypes = ['commando', 'commando', 'sniper', 'sniper', 'artillery', 'tank', 'tank'];

        armyTypes.forEach((type, index) => {
            // Create temporary unit to get its size
            const tempUnit = createUnit(type, 0, 0, this.playerTeam);
            const spawnPos = this.findSpawnPosition(hq, tempUnit.size);

            const unit = createUnit(type, spawnPos.x, spawnPos.y, this.playerTeam);
            this.units.push(unit);
        });

        this.updateUI();
    }

    nukeEnemyBase() {
        // Find all enemy units and buildings
        const enemyUnits = this.units.filter(u => u.team === this.enemyTeam);
        const enemyBuildings = this.buildings.filter(b => b.team === this.enemyTeam);

        // Damage all enemy units
        enemyUnits.forEach(unit => {
            unit.hp -= 999;
        });

        // Damage all enemy buildings
        enemyBuildings.forEach(building => {
            building.hp -= 999;
        });

        // Create explosion effects at enemy base
        const enemyHQ = this.buildings.find(b => b.team === this.enemyTeam && b.type === 'hq');
        if (enemyHQ) {
            // Visual feedback - the destroyed units/buildings will be removed on next update
            console.log('💥 NUKE LAUNCHED! Enemy base destroyed!');
        }
    }

    onMinimapClick(e) {
        const rect = this.minimapCanvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        // Convert minimap coordinates to world coordinates (CSS pixels, independent of buffer size)
        const scaleX = this.worldWidth / rect.width;
        const scaleY = this.worldHeight / rect.height;

        const worldX = clickX * scaleX;
        const worldY = clickY * scaleY;

        // Center camera on clicked position
        this.camera.x = worldX - this.camera.width / 2;
        this.camera.y = worldY - this.camera.height / 2;

        // Clamp camera to world bounds
        this.camera.x = Math.max(0, Math.min(this.camera.x, this.worldWidth - this.camera.width));
        this.camera.y = Math.max(0, Math.min(this.camera.y, this.worldHeight - this.camera.height));
    }

    goToBase() {
        const hq = this.buildings.find(b => b.team === this.playerTeam && b.type === 'hq');
        if (hq) this.centerCameraOn(hq.x, hq.y);
    }

    centerCameraOn(x, y) {
        this.camera.x = Math.max(0, Math.min(x - this.camera.width / 2, this.worldWidth - this.camera.width));
        this.camera.y = Math.max(0, Math.min(y - this.camera.height / 2, this.worldHeight - this.camera.height));
    }

    // Spread a group move into a loose grid around the clicked point so units
    // don't all fight over the same spot (and jitter there forever).
    issueGroupMove(units, x, y, attackMove = false) {
        const movers = units.filter(u => u.hp > 0 && !u.garrisonedIn);
        if (movers.length === 0) return;
        const n = movers.length;
        const spacing = Math.max(...movers.map(u => u.size)) * 2 + 8;
        const cols = Math.ceil(Math.sqrt(n));
        const rows = Math.ceil(n / cols);
        // Sort into rows by y, then each row by x, so units keep their relative layout and paths don't cross
        const sorted = movers.slice().sort((a, b) => a.y - b.y);
        for (let r = 0; r < rows; r++) {
            const row = sorted.slice(r * cols, (r + 1) * cols).sort((a, b) => a.x - b.x);
            row.forEach((u, c) => {
                const ox = (c - (row.length - 1) / 2) * spacing;
                const oy = (r - (rows - 1) / 2) * spacing;
                const tx = Math.max(15, Math.min(this.worldWidth - 15, x + ox));
                const ty = Math.max(15, Math.min(this.worldHeight - 15, y + oy));
                u.moveTo(tx, ty);
                if (attackMove) u.attackMove = true;
            });
        }
        if (movers.some(u => u.team === this.playerTeam)) {
            this.addOrderMarker(x, y, attackMove ? '#FF9800' : '#76FF03');
        }
    }

    addOrderMarker(x, y, color) {
        this.orderMarkers.push({ x, y, color, life: 1 });
        if (this.orderMarkers.length > 8) this.orderMarkers.shift();
    }

    // Reset per-battle visual/HUD state (shared by startMission and restartGame)
    resetBattleEffects() {
        this.craters = [];
        this.wrecks = [];
        this.radioMessages = [];
        this.orderMarkers = [];
        this.damageFlash = 0;
        this.controlGroups = {};
        this.screenShake = { x: 0, y: 0, intensity: 0, duration: 0 };
        if (this.input) this.input.keysDown.clear();
    }

    update(deltaTime) {
        // Don't update if game is over
        if (this.gameState !== 'playing') {
            return;
        }

        if (this.screenShake.duration > 0) {
            this.screenShake.duration -= deltaTime;
            const i = this.screenShake.intensity;
            this.screenShake.x = (Math.random() - 0.5) * i * 2;
            this.screenShake.y = (Math.random() - 0.5) * i * 2;
            if (this.screenShake.duration <= 0) {
                this.screenShake.x = 0; this.screenShake.y = 0; this.screenShake.intensity = 0;
            }
        }

        this.units.forEach(unit => {
            unit.update(deltaTime, this);
        });

        // General aura — clear then re-apply each frame
        this.units.forEach(u => { u.commandBoost = false; });
        this.units.forEach(gen => {
            if (gen.type !== 'general' || gen.garrisonedIn || gen.hp <= 0) return;
            this.units.forEach(u => {
                if (u === gen || u.team !== gen.team || u.garrisonedIn) return;
                const dx = u.x - gen.x, dy = u.y - gen.y;
                if (Math.sqrt(dx * dx + dy * dy) <= gen.auraRadius) u.commandBoost = true;
            });
        });

        this.buildings.forEach(building => {
            building.update(deltaTime, this);
        });

        this.projectiles.forEach(projectile => {
            projectile.update(deltaTime);
        });

        this.particles.forEach(particle => {
            particle.update(deltaTime);
        });

        // Burning wrecks — emit fire and smoke until they burn out
        this.wrecks.forEach(wreck => {
            wreck.timer -= deltaTime;
            wreck.emitTimer -= deltaTime;
            if (wreck.emitTimer <= 0) {
                wreck.emitTimer = 0.09;
                const fireColor = Math.random() < 0.5 ? '#FF4500' : '#FF6B00';
                const fp = new Particle(
                    wreck.x + (Math.random()-0.5) * wreck.r * 1.5,
                    wreck.y + (Math.random()-0.5) * wreck.r * 0.5,
                    fireColor, 2 + Math.random() * 3,
                    (Math.random()-0.5) * 0.6, -0.8 - Math.random() * 0.8);
                fp.decay = 0.045;
                fp.gravity = -0.02; // flames lick upward
                fp.grow = -0.04;
                this.particles.push(fp);
                const grey = Math.floor(30 + Math.random() * 40);
                const sp = new Particle(
                    wreck.x + (Math.random()-0.5) * wreck.r,
                    wreck.y - wreck.r * 0.5,
                    `rgb(${grey},${grey},${grey})`, 3 + Math.random() * 4,
                    (Math.random()-0.5) * 0.6, -0.9 - Math.random() * 0.5);
                sp.decay = 0.008;
                sp.gravity = -0.005; // smoke rises and drifts
                sp.grow = 0.06;
                this.particles.push(sp);
            }
        });
        this.wrecks = this.wrecks.filter(w => w.timer > 0);

        // Radio message timers
        this.radioMessages.forEach(m => { m.timer -= deltaTime; });
        this.radioMessages = this.radioMessages.filter(m => m.timer > 0);

        // Damage flash decay
        if (this.damageFlash > 0) this.damageFlash = Math.max(0, this.damageFlash - deltaTime * 2.5);

        // Order click markers fade out
        this.orderMarkers.forEach(m => { m.life -= deltaTime * 2; });
        this.orderMarkers = this.orderMarkers.filter(m => m.life > 0);

        // Smoke from damaged units/buildings
        this.smokeTimer -= deltaTime;
        if (this.smokeTimer <= 0) {
            this.smokeTimer = 0.15;
            this.units.forEach(u => {
                if (u.garrisonedIn || u.hp <= 0) return;
                if (u.hp < u.maxHp * 0.4) {
                    const grey = Math.floor(60 + Math.random() * 40);
                    const p = new Particle(u.x + (Math.random()-0.5)*u.size, u.y - u.size,
                        `rgb(${grey},${grey},${grey})`, 3 + Math.random()*3,
                        (Math.random()-0.5)*0.4, -0.8 - Math.random()*0.5);
                    p.decay = 0.012;
                    p.gravity = -0.005;
                    p.grow = 0.05;
                    this.particles.push(p);
                }
            });
            this.buildings.forEach(b => {
                if (b.hp <= 0) return;
                if (b.hp < b.maxHp * 0.4) {
                    for (let i = 0; i < 2; i++) {
                        const grey = Math.floor(50 + Math.random() * 50);
                        const p = new Particle(
                            b.x + (Math.random()-0.5)*b.width,
                            b.y - b.height/2,
                            `rgb(${grey},${grey},${grey})`,
                            4 + Math.random()*4,
                            (Math.random()-0.5)*0.5, -1.0 - Math.random()*0.6
                        );
                        p.decay = 0.01;
                        p.gravity = -0.005;
                        p.grow = 0.06;
                        this.particles.push(p);
                    }
                    // Fire when critically damaged
                    if (b.hp < b.maxHp * 0.2) {
                        const fp = new Particle(
                            b.x + (Math.random()-0.5)*b.width * 0.7,
                            b.y + (Math.random()-0.5)*b.height * 0.3,
                            Math.random() < 0.5 ? '#FF4500' : '#FFA500',
                            3 + Math.random()*3,
                            (Math.random()-0.5)*0.6, -0.8 - Math.random() * 0.6
                        );
                        fp.decay = 0.04;
                        fp.gravity = -0.02;
                        fp.grow = -0.04;
                        this.particles.push(fp);
                    }
                }
            });
        }

        this.ai.update(deltaTime);

        this.missionTime = (this.missionTime || 0) + deltaTime;
        if (!this.raidWarned && this.cities.length > 0 && this.missionTime >= this.raidDelay - 15) {
            this.raidWarned = true;
            this.addRadioMessage('📡 Intel: enemy raiders will hit the towns soon!', '#FFB74D');
        }
        this.cities.forEach(c => c.update(deltaTime, this));

        // Process production queue
        for (let i = this.productionQueue.length - 1; i >= 0; i--) {
            const item = this.productionQueue[i];
            item.timeRemaining -= deltaTime;

            if (item.timeRemaining <= 0) {
                // Production complete - create the item
                if (item.itemType === 'unit') {
                    // Get unit size without creating temporary unit
                    const unitSizes = {
                        soldier: 12,
                        tank: 20,
                        harvester: 18,
                        sniper: 13,
                        artillery: 25,
                        commando: 15,
                        helicopter: 18,
                        apc: 22,
                        mortar: 14,
                        medic: 12,
                        bazooka: 13,
                        general: 17
                    };
                    const unitSize = unitSizes[item.unitType] || 12;
                    // If the producing building was destroyed, roll out of another one of the same type;
                    // if none are left, refund the order instead of spawning in the rubble.
                    let source = item.building;
                    if (!source || source.hp <= 0 || !this.buildings.includes(source)) {
                        source = this.buildings.find(b => b.team === this.playerTeam && b.type === item.building.type && b.hp > 0);
                    }
                    if (!source) {
                        this.resources.credits += item.cost;
                        this.addRadioMessage(`↩ ${item.unitType} order refunded (no ${item.building.type})`, '#FFB74D');
                        this.productionQueue.splice(i, 1);
                        this.updateUI();
                        continue;
                    }
                    const spawnPos = this.findSpawnPosition(source, unitSize);

                    const unit = createUnit(
                        item.unitType,
                        spawnPos.x,
                        spawnPos.y,
                        this.playerTeam
                    );
                    this.units.push(unit);
                    this.sfx.play('ready');
                } else if (item.itemType === 'building') {
                    const building = createBuilding(
                        item.buildingType,
                        item.x,
                        item.y,
                        this.playerTeam
                    );
                    this.buildings.push(building);
                    this.sfx.play('built');
                }

                // Remove from queue
                this.productionQueue.splice(i, 1);
                this.updateUI();
            }
        }

        // Create explosion particles for dying units
        this.units.forEach(unit => {
            if (unit.hp <= 0) {
                this.createExplosion(unit.x, unit.y, unit.size, unit.color);
                this.addWreck(unit.x, unit.y, unit.size >= 18);
                if (unit.team === this.playerTeam) {
                    this.addRadioMessage('⚠ Unit lost!', '#FF6B6B');
                }
            }
        });

        // Create explosion particles for dying buildings
        this.buildings.forEach(building => {
            if (building.hp <= 0) {
                this.createExplosion(building.x, building.y, building.width, building.color);
                this.addWreck(building.x, building.y, true);
                if (building.garrison && building.garrison.length > 0) {
                    building.garrison.forEach(u => { u.hp = 0; u.garrisonedIn = null; });
                    building.garrison = [];
                }
                if (building.team === this.playerTeam) {
                    this.addRadioMessage('☢ Building destroyed!', '#FF1744');
                }
            }
        });

        this.nukes.forEach(n => n.update(deltaTime));
        this.shockwaves.forEach(s => s.update(deltaTime));

        this.units = this.units.filter(unit => unit.hp > 0);

        // Drop dead units from the selection so counts and commands stay accurate
        if (this.selectedUnits.some(u => u.hp <= 0)) {
            this.selectedUnits = this.selectedUnits.filter(u => u.hp > 0);
            this.updateUI();
        }

        // Clear selected building reference if it was destroyed
        if (this.selectedBuilding && this.selectedBuilding.hp <= 0) {
            this.selectedBuilding.selected = false;
            this.selectedBuilding = null;
            this.updateUI();
        }

        this.buildings = this.buildings.filter(building => building.hp > 0);
        this.projectiles = this.projectiles.filter(projectile => !projectile.dead);
        this.particles = this.particles.filter(particle => particle.life > 0);
        // Cap particle count so huge battles (wrecks + smoke + nukes) don't tank the frame rate
        if (this.particles.length > 2500) this.particles.splice(0, this.particles.length - 2500);
        this.nukes = this.nukes.filter(n => !n.dead);
        this.shockwaves = this.shockwaves.filter(s => s.life > 0);

        // Deposits regenerate slowly over time
        this.resourceDeposits.forEach(d => {
            if (d.amount < d.maxAmount) d.amount = Math.min(d.maxAmount, d.amount + 8 * deltaTime);
        });

        this.updateCamera(deltaTime);

        // Live HUD refresh (credits drain from repairs, queue progress bars, button affordability)
        this.uiRefreshTimer -= deltaTime;
        if (this.uiRefreshTimer <= 0) {
            this.uiRefreshTimer = 0.2;
            this.refreshLiveUI();
        }

        this.updateFog();
        this.updatePower();
        this.updateNukeUI();
        this.updateRepairUI();
        this.checkGameEnd();
    }

    updateNukeUI() {
        const nukeBtn = document.getElementById('launch-nuke-btn');
        if (!nukeBtn) return;
        const silo = this.buildings.find(b => b.team === this.playerTeam && b.type === 'missile_silo');
        if (!silo) {
            nukeBtn.style.display = 'none';
            return;
        }
        nukeBtn.style.display = 'inline-block';
        const ready = silo.nukeCooldown <= 0;
        const canAfford = this.resources.credits >= this.nukeCost;
        nukeBtn.disabled = !ready || !canAfford;
        nukeBtn.style.opacity = (ready && canAfford) ? '1' : '0.5';
        nukeBtn.textContent = ready ? `☢ Launch Nuke (${this.nukeCost})` : `☢ Recharging ${Math.ceil(silo.nukeCooldown)}s`;

        // Live-update info bar if silo is currently selected
        if (this.selectedBuilding === silo) {
            const infoEl = document.getElementById('selected-info');
            if (infoEl && !this.nukeTargeting) {
                const canAfford = this.resources.credits >= this.nukeCost;
                infoEl.textContent = ready && canAfford
                    ? `☢ Missile Silo ready — Right-click map to fire (costs ${this.nukeCost} credits)`
                    : !ready
                        ? `☢ Missile Silo recharging — ${Math.ceil(silo.nukeCooldown)}s remaining`
                        : `☢ Missile Silo ready — need ${this.nukeCost} credits to fire`;
            }
        }

    }

    updateRepairUI() {
        const repairBtn = document.getElementById('repair-btn');
        if (!repairBtn) return;
        const b = this.selectedBuilding;

        if (!b || b.team !== this.playerTeam) {
            repairBtn.style.display = 'none';
            const evacuateBtn = document.getElementById('evacuate-btn');
            if (evacuateBtn) evacuateBtn.style.display = 'none';
            return;
        }

        repairBtn.style.display = 'block';
        const damaged = b.hp < b.maxHp;
        const hpPct = Math.round((b.hp / b.maxHp) * 100);

        if (!damaged) {
            repairBtn.textContent = `🔧 Repair (Full HP)`;
            repairBtn.style.background = '#444';
            repairBtn.disabled = true;
        } else if (b.repairing) {
            repairBtn.textContent = `⏹ Stop Repair (${hpPct}% HP)`;
            repairBtn.style.background = '#B71C1C';
            repairBtn.disabled = false;
        } else {
            repairBtn.textContent = `🔧 Repair Building (3 credits/sec)`;
            repairBtn.style.background = '#1B5E20';
            repairBtn.disabled = this.resources.credits < 1;
        }

        const evacuateBtn = document.getElementById('evacuate-btn');
        if (evacuateBtn) {
            const showEvac = b && b.team === this.playerTeam && b.garrison && b.garrison.length > 0;
            evacuateBtn.style.display = showEvac ? 'block' : 'none';
            if (showEvac) evacuateBtn.textContent = `🚪 Evacuate (${b.garrison.length} inside)`;
        }
    }

    // ---- FOG OF WAR ----

    resetFog() {
        // The whole map starts revealed for the player (terrain, towns and enemy base are known);
        // enemy units are still only shown where your forces can currently see.
        this.playerFog.fill(1);
        this.enemyFog.fill(0);
    }

    markFogVisible(cx, cy, radius, grid) {
        const ts = this.fogTileSize;
        const minTX = Math.max(0, Math.floor((cx - radius) / ts));
        const maxTX = Math.min(this.fogCols - 1, Math.floor((cx + radius) / ts));
        const minTY = Math.max(0, Math.floor((cy - radius) / ts));
        const maxTY = Math.min(this.fogRows - 1, Math.floor((cy + radius) / ts));
        const r2 = radius * radius;
        for (let ty = minTY; ty <= maxTY; ty++) {
            for (let tx = minTX; tx <= maxTX; tx++) {
                const dx = (tx + 0.5) * ts - cx;
                const dy = (ty + 0.5) * ts - cy;
                if (dx * dx + dy * dy <= r2) {
                    grid[ty * this.fogCols + tx] = 2;
                }
            }
        }
    }

    updateFog() {
        // Step 1: decay visible → explored (shroud) for both teams
        for (let i = 0; i < this.playerFog.length; i++) {
            if (this.playerFog[i] === 2) this.playerFog[i] = 1;
            if (this.enemyFog[i] === 2) this.enemyFog[i] = 1;
        }
        // Step 2: re-mark currently visible tiles
        this.units.forEach(u => {
            if (u.garrisonedIn) return; // building provides vision instead
            const grid = u.team === this.playerTeam ? this.playerFog : this.enemyFog;
            this.markFogVisible(u.x, u.y, u.visionRadius || 200, grid);
        });
        this.buildings.forEach(b => {
            const grid = b.team === this.playerTeam ? this.playerFog : this.enemyFog;
            this.markFogVisible(b.x, b.y, b.visionRadius || 160, grid);
        });
        // Whole map revealed for the player: everything (including enemy units) is always
        // visible and nothing is dimmed. The enemy AI still has to scout with its own fog.
        if (this.revealWholeMap) this.playerFog.fill(2);
    }

    fogStateAt(worldX, worldY, grid) {
        const tx = Math.floor(worldX / this.fogTileSize);
        const ty = Math.floor(worldY / this.fogTileSize);
        if (tx < 0 || tx >= this.fogCols || ty < 0 || ty >= this.fogRows) return 0;
        return grid[ty * this.fogCols + tx];
    }

    isVisibleToPlayer(worldX, worldY) {
        return this.fogStateAt(worldX, worldY, this.playerFog) === 2;
    }

    isExploredByPlayer(worldX, worldY) {
        return this.fogStateAt(worldX, worldY, this.playerFog) >= 1;
    }

    isVisibleToEnemy(worldX, worldY) {
        return this.fogStateAt(worldX, worldY, this.enemyFog) === 2;
    }

    isExploredByEnemy(worldX, worldY) {
        return this.fogStateAt(worldX, worldY, this.enemyFog) >= 1;
    }

    // Build a tiny 1-pixel-per-tile fog texture. Drawing it scaled up with image
    // smoothing gives soft, feathered fog edges for almost no cost, and lets us
    // dim "explored but not currently visible" ground (classic RTS shroud).
    updateFogTexture() {
        if (!this.fogCanvas) {
            this.fogCanvas = document.createElement('canvas');
            this.fogCanvas.width = this.fogCols;
            this.fogCanvas.height = this.fogRows;
            this.fogTexCtx = this.fogCanvas.getContext('2d');
            this.fogImage = this.fogTexCtx.createImageData(this.fogCols, this.fogRows);
        }
        const data = this.fogImage.data;
        const fog = this.playerFog;
        for (let i = 0; i < fog.length; i++) {
            const s = fog[i];
            const o = i * 4;
            data[o] = 4; data[o + 1] = 6; data[o + 2] = 10; // near-black with a cool tint
            // The whole map is revealed now, so keep the "not currently seen" shroud light
            data[o + 3] = s === 0 ? 255 : s === 1 ? 70 : 0;
        }
        this.fogTexCtx.putImageData(this.fogImage, 0, 0);
    }

    renderFog() {
        this.updateFogTexture();
        const ts = this.fogTileSize;
        const ctx = this.ctx;
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(this.fogCanvas, -this.camera.x, -this.camera.y, this.fogCols * ts, this.fogRows * ts);
        ctx.restore();
    }

    // ---- END FOG OF WAR ----

    checkGameEnd() {
        const playerHQ = this.buildings.find(b => b.team === this.playerTeam && b.type === 'hq');
        const enemyHQ = this.buildings.find(b => b.team === this.enemyTeam && b.type === 'hq');

        const allCitiesFallen = this.cities.length > 0 && this.cities.every(c => c.fallen);

        if (!playerHQ && this.gameState === 'playing') {
            this.gameState = 'lost';
            this.showGameEndScreen('DEFEAT', 'Your HQ has been destroyed!', '#f44336', false);
        } else if (allCitiesFallen && this.gameState === 'playing') {
            this.gameState = 'lost';
            this.showGameEndScreen('DEFEAT', 'Every town has fallen. There is no one left to protect.', '#f44336', false);
        } else if (!enemyHQ && this.gameState === 'playing') {
            this.gameState = 'won';
            if (this.currentMission) {
                const completed = this.getCompletedMissions();
                if (!completed.includes(this.currentMission.id)) {
                    completed.push(this.currentMission.id);
                    try { localStorage.setItem('titanwar_completed', JSON.stringify(completed)); } catch (e) { /* storage blocked */ }
                }
            }
            const hasNext = this.currentMission && this.currentMission.id < MISSIONS.length;
            const saved = this.cities.reduce((s, c) => s + c.population, 0);
            const total = this.cities.reduce((s, c) => s + c.initialPop, 0);
            const civLine = total > 0 ? `<br><span style="font-size:18px;color:#B3E5FC;">🏘 Civilians saved: ${saved}/${total}</span>` : '';
            this.showGameEndScreen('VICTORY', 'Enemy HQ destroyed!' + civLine, '#4CAF50', hasNext);
        }
    }

    showGameEndScreen(title, message, color, hasNextMission) {
        const overlay = document.createElement('div');
        overlay.id = 'game-end-overlay';
        overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.82);display:flex;align-items:center;justify-content:center;z-index:1000;animation:fadeIn 0.5s;`;

        const btnStyle = (bg) => `background:${bg};color:#fff;border:none;padding:12px 28px;font-size:17px;border-radius:5px;cursor:pointer;margin:6px;transition:all 0.2s;`;

        let buttons = `<button id="ges-retry" style="${btnStyle(color)}">Retry</button>`;
        if (hasNextMission) {
            buttons = `<button id="ges-next" style="${btnStyle('#4CAF50')}">Next Mission &rarr;</button>` + buttons;
        }
        if (this.currentMission) {
            buttons += `<button id="ges-campaign" style="${btnStyle('#1565C0')}">Campaign Menu</button>`;
        }

        overlay.innerHTML = `<div style="background:#1a1a1a;border:4px solid ${color};border-radius:10px;padding:40px;text-align:center;max-width:480px;animation:slideIn 0.5s;">
            <h1 style="color:${color};font-size:48px;margin:0 0 16px;text-shadow:0 0 10px ${color};">${title}</h1>
            <p style="color:#fff;font-size:22px;margin:0 0 28px;">${message}</p>
            <div>${buttons}</div>
        </div>`;

        document.body.appendChild(overlay);

        if (!document.getElementById('ges-anim-style')) {
            const s = document.createElement('style');
            s.id = 'ges-anim-style';
            s.textContent = `@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideIn{from{transform:translateY(-50px);opacity:0}to{transform:translateY(0);opacity:1}}`;
            document.head.appendChild(s);
        }

        document.getElementById('ges-retry').addEventListener('click', () => {
            overlay.remove();
            this.restartGame();
        });

        const nextBtn = document.getElementById('ges-next');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                overlay.remove();
                this.startMission(this.currentMission.id + 1);
            });
        }

        const campaignBtn = document.getElementById('ges-campaign');
        if (campaignBtn) {
            campaignBtn.addEventListener('click', () => {
                overlay.remove();
                this.showCampaignScreen();
            });
        }
    }

    restartGame() {
        // Remove overlay
        const overlay = document.getElementById('game-end-overlay');
        if (overlay) {
            overlay.remove();
        }

        // Reset game state
        this.gameState = 'playing';
        this.paused = false;
        this.updatePauseButton();
        this.units = [];
        this.buildings = [];
        this.projectiles = [];
        this.particles = [];
        this.nukes = [];
        this.shockwaves = [];
        this.selectedUnits = [];
        this.selectedBuilding = null;
        this.buildMode = null;
        this.commandMode = null;
        this.nukeTargeting = false;
        this.productionQueue = [];
        this.resources.credits = 2000;
        this.resetBattleEffects();

        // Reset AI
        this.ai.credits = 1000;
        this.ai.updateTimer = 0;
        this.ai.attackTimer = 0;
        this.ai.buildTimer = 0;
        this.ai.nukeTimer = 0;

        // Reinitialize resource deposits
        this.initResourceDeposits();

        // Reinitialize game
        this.init();

        // Reset camera to player base
        this.goToBase();
    }

    diff() {
        return DIFFICULTIES[this.difficulty] || DIFFICULTIES.easy;
    }

    setDifficulty(key) {
        if (!DIFFICULTIES[key]) return;
        this.difficulty = key;
        saveSetting('titanwar_difficulty', key);
        // Redraw the campaign menu so the selection shows
        if (document.getElementById('campaign-overlay')) this.showCampaignScreen();
    }

    // Tougher enemies on harder settings (more HP, same everything else)
    applyEnemyDifficulty(u) {
        const m = this.diff().enemyHp;
        if (m === 1 || u._diffApplied) return;
        u.maxHp = Math.round(u.maxHp * m);
        u.hp = u.maxHp;
        u._diffApplied = true;
    }

    toggleSound() {
        this.sfx.ensure();
        this.sfx.setEnabled(!this.sfx.enabled);
        this.updateSoundButtons();
    }

    toggleMusic() {
        this.sfx.ensure();
        this.sfx.setMusic(!this.sfx.musicOn);
        this.updateSoundButtons();
    }

    updateSoundButtons() {
        const set = (id, on, onText, offText) => {
            const b = document.getElementById(id);
            if (!b) return;
            b.textContent = on ? onText : offText;
            b.style.background = on ? '#1565C0' : '#37474F';
        };
        ['sound-btn', 'campaign-sound-btn'].forEach(id => set(id, this.sfx.enabled, '🔊 Sound: ON', '🔇 Sound: OFF'));
        ['music-btn', 'campaign-music-btn'].forEach(id => set(id, this.sfx.musicOn, '🎵 Music: ON', '🎵 Music: OFF'));
    }

    // Switch fog of war on/off for the player and refresh every fog button
    toggleFog() {
        this.revealWholeMap = !this.revealWholeMap;
        // Turning fog on: everything you can't currently see becomes dim/hidden again
        if (!this.revealWholeMap) this.playerFog.fill(1);
        this.updateFog();
        try { localStorage.setItem('titanwar_reveal_map', this.revealWholeMap ? '1' : '0'); } catch (e) {}
        this.updateFogButtons();
    }

    updateFogButtons() {
        const text = this.revealWholeMap ? '🌫 Fog of War: OFF (whole map visible)' : '🌫 Fog of War: ON';
        const bg = this.revealWholeMap ? '#37474F' : '#4A148C';
        ['fog-toggle-btn', 'campaign-fog-btn'].forEach(id => {
            const b = document.getElementById(id);
            if (b) { b.textContent = text; b.style.background = bg; }
        });
    }

    // Completed mission ids from localStorage (tolerates missing/corrupt data or blocked storage)
    getCompletedMissions() {
        try {
            const v = JSON.parse(localStorage.getItem('titanwar_completed') || '[]');
            return Array.isArray(v) ? v : [];
        } catch (e) {
            return [];
        }
    }

    resumeBattle() {
        const overlay = document.getElementById('campaign-overlay');
        if (overlay) overlay.remove();
        if (this.pausedFromBattle) this.gameState = 'playing';
        this.pausedFromBattle = false;
    }

    showCampaignScreen() {
        // Never stack two menus (a leftover one would sit over the game after starting a mission)
        const existing = document.getElementById('campaign-overlay');
        if (existing) existing.remove();
        // Remember if we came here mid-battle so the player can go back to it
        if (this.gameState === 'playing') this.pausedFromBattle = true;
        this.gameState = 'campaign';
        this.input.keysDown.clear();
        const completed = this.getCompletedMissions();

        const overlay = document.createElement('div');
        overlay.id = 'campaign-overlay';
        overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:2000;`;

        const diffColors = { Recruit: '#4CAF50', Corporal: '#8BC34A', Sergeant: '#FFC107', Commander: '#FF5722', General: '#F44336', 'Lieutenant Colonel': '#FF9800', Colonel: '#F44336', 'Major General': '#E91E63', 'Supreme Commander': '#FF1744', 'Brigadier General': '#D81B60', 'Field Marshal': '#C2185B', 'Grand Marshal': '#AD1457', Warlord: '#880E4F', Conqueror: '#B71C1C' };

        let missionCards = MISSIONS.map((m, i) => {
            const isUnlocked = i === 0 || completed.includes(MISSIONS[i - 1].id);
            const isDone = completed.includes(m.id);
            const dColor = diffColors[m.difficulty] || '#fff';
            // Locked missions must not be clickable
            return `<div ${isUnlocked ? `onclick="window._game.startMission(${m.id})"` : ''} style="background:${isUnlocked ? '#1e1e1e' : '#111'};border:2px solid ${isUnlocked ? dColor : '#333'};border-radius:8px;padding:clamp(12px,2vh,24px) clamp(14px,2vw,28px);margin:clamp(4px,0.6vmin,10px);cursor:${isUnlocked ? 'pointer' : 'default'};opacity:${isUnlocked ? 1 : 0.45};min-width:clamp(180px,18vw,300px);max-width:clamp(200px,22vw,340px);flex:1;transition:all 0.2s;" onmouseover="if(${isUnlocked})this.style.background='#2a2a2a'" onmouseout="this.style.background='${isUnlocked ? '#1e1e1e' : '#111'}'">
                <div style="color:${dColor};font-weight:bold;font-size:clamp(11px,1.4vmin,18px);letter-spacing:1px;">${m.difficulty} ${isDone ? '✓' : ''}</div>
                <div style="color:#fff;font-size:clamp(15px,2vmin,26px);font-weight:bold;margin:clamp(3px,0.5vmin,8px) 0;">${m.id}. ${m.name}</div>
                <div style="color:#aaa;font-size:clamp(10px,1.2vmin,16px);">${isUnlocked ? m.description : '🔒 Complete previous mission to unlock'}</div>
            </div>`;
        }).join('');

        overlay.innerHTML = `
            <div style="text-align:center;max-width:min(900px,90vw);width:90%;">
                <h1 style="color:#FF5722;font-size:clamp(32px,6vmin,80px);margin:0 0 clamp(4px,0.8vmin,12px);text-shadow:0 0 16px #FF5722;">TITAN WAR</h1>
                <p style="color:#888;font-size:clamp(11px,1.5vmin,20px);margin:0 0 clamp(8px,1.5vmin,20px);letter-spacing:2px;">CAMPAIGN</p>
                <div style="margin:0 0 clamp(14px,2.5vmin,32px);">
                    <span style="color:#aaa;font-size:clamp(12px,1.5vmin,18px);margin-right:8px;">Difficulty:</span>
                    ${Object.entries(DIFFICULTIES).map(([key, d]) => `<button onclick="window._game.setDifficulty('${key}')" style="background:${this.difficulty === key ? d.color : '#263238'};color:${this.difficulty === key ? '#000' : '#ccc'};border:2px solid ${d.color};font-weight:bold;padding:clamp(5px,0.8vmin,10px) clamp(12px,2vw,24px);font-size:clamp(12px,1.5vmin,18px);border-radius:4px;cursor:pointer;margin:0 4px;width:auto;">${d.label}</button>`).join('')}
                    <div style="color:#bbb;font-size:clamp(11px,1.3vmin,16px);margin-top:8px;">${this.diff().desc}${this.pausedFromBattle ? ' <span style="color:#FFB74D;">(applies to the next mission you start)</span>' : ''}</div>
                </div>
                <div style="display:flex;flex-wrap:wrap;justify-content:center;">${missionCards}</div>
                ${this.pausedFromBattle ? `<button onclick="window._game.resumeBattle()" style="margin-top:clamp(14px,2.5vmin,32px);margin-right:10px;background:#1B5E20;color:#fff;border:1px solid #4CAF50;padding:clamp(8px,1.2vmin,16px) clamp(18px,3vw,36px);font-size:clamp(12px,1.5vmin,20px);border-radius:4px;cursor:pointer;width:auto;">⟵ Back to Battle</button>` : ''}
                <button id="campaign-sound-btn" onclick="window._game.toggleSound()" style="margin-top:clamp(14px,2.5vmin,32px);margin-right:10px;background:#1565C0;color:#fff;border:1px solid #607D8B;padding:clamp(8px,1.2vmin,16px) clamp(18px,3vw,36px);font-size:clamp(12px,1.5vmin,20px);border-radius:4px;cursor:pointer;width:auto;">🔊 Sound</button>
                <button id="campaign-music-btn" onclick="window._game.toggleMusic()" style="margin-top:clamp(14px,2.5vmin,32px);margin-right:10px;background:#1565C0;color:#fff;border:1px solid #607D8B;padding:clamp(8px,1.2vmin,16px) clamp(18px,3vw,36px);font-size:clamp(12px,1.5vmin,20px);border-radius:4px;cursor:pointer;width:auto;">🎵 Music</button>
                <button id="campaign-fog-btn" onclick="window._game.toggleFog()" style="margin-top:clamp(14px,2.5vmin,32px);margin-right:10px;background:#37474F;color:#fff;border:1px solid #607D8B;padding:clamp(8px,1.2vmin,16px) clamp(18px,3vw,36px);font-size:clamp(12px,1.5vmin,20px);border-radius:4px;cursor:pointer;width:auto;">🌫 Fog of War</button>
                <button onclick="window._game.startMission(1)" style="margin-top:clamp(14px,2.5vmin,32px);background:#263238;color:#aaa;border:1px solid #444;padding:clamp(8px,1.2vmin,16px) clamp(18px,3vw,36px);font-size:clamp(12px,1.5vmin,20px);border-radius:4px;cursor:pointer;width:auto;">Quick Start (Mission 1)</button>
            </div>`;

        document.body.appendChild(overlay);
        window._game = this;
        this.updateFogButtons();
        this.updateSoundButtons();
    }

    startMission(missionId) {
        const mission = MISSIONS.find(m => m.id === missionId);
        if (!mission) return;

        const overlay = document.getElementById('campaign-overlay');
        if (overlay) overlay.remove();
        const endOverlay = document.getElementById('game-end-overlay');
        if (endOverlay) endOverlay.remove();

        this.currentMission = mission;
        this.gameState = 'playing';
        this.pausedFromBattle = false;
        this.paused = false;
        this.updatePauseButton();
        if (this.sfx) this.sfx.updateMusicVolume();
        this.units = [];
        this.buildings = [];
        this.projectiles = [];
        this.particles = [];
        this.nukes = [];
        this.shockwaves = [];
        this.selectedUnits = [];
        this.selectedBuilding = null;
        this.buildMode = null;
        this.commandMode = null;
        this.nukeTargeting = false;
        this.productionQueue = [];
        this.resetBattleEffects();

        this.ai.credits = 0;
        this.ai.updateTimer = 0;
        this.ai.attackTimer = 0;
        this.ai.buildTimer = 0;
        this.ai.nukeTimer = 0;
        this.ai.missionConfig = mission.ai || null;

        this.initResourceDeposits();
        this.init();
        this.goToBase();
    }

    launchNuke() {
        const silo = this.buildings.find(b => b.team === this.playerTeam && b.type === 'missile_silo' && b.nukeCooldown <= 0);
        if (!silo) {
            const info = document.getElementById('selected-info');
            if (info) {
                info.textContent = silo === undefined ? '⚠️ Build a Missile Silo first!' : '⚠️ Missile Silo is recharging!';
                setTimeout(() => { if (info) info.textContent = ''; }, 2500);
            }
            return;
        }
        if (this.resources.credits < this.nukeCost) {
            const info = document.getElementById('selected-info');
            if (info) {
                info.textContent = `⚠️ Need ${this.nukeCost} credits to launch nuke!`;
                setTimeout(() => { if (info) info.textContent = ''; }, 2500);
            }
            return;
        }
        this.nukeTargeting = true;
        this.canvas.style.cursor = 'crosshair';
        const info = document.getElementById('selected-info');
        if (info) info.textContent = '☢ Click target location for nuclear strike (Escape to cancel)';
    }

    launchNukeAt(worldX, worldY) {
        const silo = this.buildings.find(b => b.team === this.playerTeam && b.type === 'missile_silo' && b.nukeCooldown <= 0);
        if (!silo || this.resources.credits < this.nukeCost) {
            this.nukeTargeting = false;
            return;
        }
        this.resources.credits -= this.nukeCost;
        silo.nukeCooldown = silo.maxNukeCooldown;
        this.nukes.push(new NukeProjectile(silo.x, silo.y, worldX, worldY, this, this.playerTeam));
        this.sfx.play('launch');
        this.nukeTargeting = false;
        this.canvas.style.cursor = 'crosshair';
        this.updateUI();
    }


    showGameOverScreen(title, message, color) {
        // Create game over overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 1000;
            animation: fadeIn 0.5s;
        `;

        overlay.innerHTML = `
            <div style="text-align: center; color: white;">
                <h1 style="font-size: 72px; color: ${color}; margin: 0; text-shadow: 0 0 20px ${color};">${title}</h1>
                <p style="font-size: 24px; margin: 20px 0;">${message}</p>
                <button id="restart-btn" style="
                    font-size: 20px;
                    padding: 15px 40px;
                    background: ${color};
                    color: white;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    margin-top: 20px;
                    box-shadow: 0 4px 8px rgba(0,0,0,0.3);
                ">Play Again</button>
            </div>
        `;

        document.body.appendChild(overlay);

        document.getElementById('restart-btn').addEventListener('click', () => {
            overlay.remove();
            location.reload();
        });
    }

    addShake(intensity, duration) {
        if (intensity > this.screenShake.intensity) {
            this.screenShake.intensity = intensity;
            this.screenShake.duration = duration;
        }
    }

    addCrater(x, y, radius) {
        this.craters.push({ x, y, r: Math.max(10, radius * 0.9) });
        if (this.craters.length > 80) this.craters.shift();
    }

    addWreck(x, y, large = false) {
        this.wrecks.push({ x, y, timer: large ? 14 : 7, maxTimer: large ? 14 : 7, emitTimer: 0, r: large ? 20 : 10 });
    }

    addRadioMessage(text, color = '#FFD700') {
        if (this.radioMessages.length > 0 && this.radioMessages[0].text === text) return;
        if (this.sfx) this.sfx.play('radio');
        this.radioMessages.unshift({ text, timer: 3.5, maxTimer: 3.5, color });
        if (this.radioMessages.length > 4) this.radioMessages.pop();
    }

    createExplosion(x, y, size, baseColor, leaveCrater = true) {
        this.sfx.play('explosion', x, y, size);
        // Screen shake — only for blasts the player can actually see
        const onScreen = x > this.camera.x - 100 && x < this.camera.x + this.camera.width + 100 &&
                         y > this.camera.y - 100 && y < this.camera.y + this.camera.height + 100;
        if (onScreen) {
            if (size >= 60) this.addShake(8, 0.3);
            else if (size >= 20) this.addShake(3, 0.15);
            else this.addShake(1, 0.08);
        }

        // Permanent crater on the ground (skipped for mid-air blasts like intercepts)
        if (leaveCrater) this.addCrater(x, y, size);

        // Brief bright flash at the core
        const flash = new Particle(x, y, '#FFF8E1', size * 0.6 + 6, 0, 0);
        flash.gravity = 0;
        flash.decay = 0.12;
        flash.grow = 1.2;
        this.particles.push(flash);

        const count = Math.floor(8 + size * 0.8);
        // Fireball core
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const spd = 1.5 + Math.random() * 3.5;
            const col = ['#FF4500','#FF6B00','#FFD700','#FF3300','#FFA500'][Math.floor(Math.random()*5)];
            const p = new Particle(x, y, col, 3 + Math.random() * (size * 0.15), Math.cos(angle)*spd, Math.sin(angle)*spd - 2);
            p.decay = 0.025 + Math.random() * 0.02;
            this.particles.push(p);
        }
        // Dark smoke cloud
        for (let i = 0; i < Math.floor(count * 0.6); i++) {
            const angle = Math.random() * Math.PI * 2;
            const spd = 0.3 + Math.random() * 1.2;
            const grey = Math.floor(30 + Math.random() * 50);
            const p = new Particle(x, y, `rgb(${grey},${grey},${grey})`, 4 + Math.random() * (size * 0.12), Math.cos(angle)*spd, Math.sin(angle)*spd - 1.5);
            p.decay = 0.008 + Math.random() * 0.01;
            p.gravity = 0.01; // billowing smoke slows and hangs rather than falling
            p.grow = 0.08;
            this.particles.push(p);
        }
        // Flying debris chunks
        for (let i = 0; i < Math.floor(count * 0.4); i++) {
            const angle = Math.random() * Math.PI * 2;
            const spd = 2 + Math.random() * 4;
            const p = new Particle(x, y, '#5D4037', 2 + Math.random() * 3, Math.cos(angle)*spd, Math.sin(angle)*spd - 3);
            p.decay = 0.03 + Math.random() * 0.02;
            this.particles.push(p);
        }
    }

    updatePower() {
        this.resources.maxPower = this.buildings
            .filter(b => b.type === 'power' && b.team === this.playerTeam)
            .length * 100;

        this.resources.power = this.buildings
            .filter(b => b.team === this.playerTeam && b.type !== 'power')
            .length * 10;
    }

    render() {
        // Scale so the fixed 1200x700 game viewport always fills the canvas
        const sx = this.canvas.width / this.camera.width;
        const sy = this.canvas.height / this.camera.height;
        this.ctx.save();
        this.ctx.scale(sx, sy);

        if (this.screenShake.intensity > 0) {
            this.ctx.translate(this.screenShake.x, this.screenShake.y);
        }

        // Richer ground base
        this.ctx.fillStyle = '#3a6b1f';
        this.ctx.fillRect(0, 0, this.camera.width, this.camera.height);

        // Subtle ground color variation using a grid pattern
        const tileSize = 120;
        const camOffX = Math.floor(this.camera.x / tileSize);
        const camOffY = Math.floor(this.camera.y / tileSize);
        for (let gx = camOffX - 1; gx < camOffX + Math.ceil(this.camera.width / tileSize) + 1; gx++) {
            for (let gy = camOffY - 1; gy < camOffY + Math.ceil(this.camera.height / tileSize) + 1; gy++) {
                const v = (Math.sin(gx * 3.7 + gy * 2.3) + 1) * 0.5;
                const shade = Math.floor(v * 12);
                this.ctx.fillStyle = `rgba(0,0,0,${0.03 + shade * 0.006})`;
                this.ctx.fillRect(gx * tileSize - this.camera.x, gy * tileSize - this.camera.y, tileSize, tileSize);
            }
        }

        // Rivers and bridges sit on the ground layer, under craters, trees and units
        this.renderRivers();

        // Draw persistent shell craters
        this.craters.forEach(c => {
            const sx = c.x - this.camera.x;
            const sy = c.y - this.camera.y;
            if (sx < -c.r*2 || sx > this.camera.width + c.r*2 ||
                sy < -c.r*2 || sy > this.camera.height + c.r*2) return;
            const grad = this.ctx.createRadialGradient(sx, sy, 0, sx, sy, c.r);
            grad.addColorStop(0, 'rgba(15,8,0,0.85)');
            grad.addColorStop(0.55, 'rgba(30,18,5,0.6)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            this.ctx.fillStyle = grad;
            this.ctx.beginPath();
            this.ctx.arc(sx, sy, c.r, 0, Math.PI * 2);
            this.ctx.fill();
        });

        // Draw charred circles for burning wrecks
        this.wrecks.forEach(w => {
            const sx = w.x - this.camera.x;
            const sy = w.y - this.camera.y;
            const alpha = Math.min(1, w.timer / w.maxTimer) * 0.7;
            this.ctx.save();
            this.ctx.globalAlpha = alpha;
            this.ctx.fillStyle = '#1a1000';
            this.ctx.beginPath();
            this.ctx.arc(sx, sy, w.r, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        });

        // Viewport culling - only render visible entities
        const buffer = 100;
        const cityOnScreen = c => c.x > this.camera.x - c.radius - buffer &&
            c.x < this.camera.x + this.camera.width + c.radius + buffer &&
            c.y > this.camera.y - c.radius - buffer &&
            c.y < this.camera.y + this.camera.height + c.radius + buffer;
        const visibleCities = this.cities.filter(cityOnScreen);

        // Town plazas sit on the ground, under trees and units
        visibleCities.forEach(c => c.renderGround(this.ctx, this.camera));

        // Draw static decorations (rocks, dirt patches, trees)
        this.drawDecorations();

        // Mountain ridges stand above the ground clutter but below buildings and units
        this.renderMountains();

        this.resourceDeposits.forEach(deposit => {
            if (deposit.amount > 0 &&
                deposit.x > this.camera.x - buffer &&
                deposit.x < this.camera.x + this.camera.width + buffer &&
                deposit.y > this.camera.y - buffer &&
                deposit.y < this.camera.y + this.camera.height + buffer &&
                this.isExploredByPlayer(deposit.x, deposit.y)) {
                this.drawResourceDeposit(deposit);
            }
        });

        this.buildings.forEach(building => {
            if (building.x > this.camera.x - buffer &&
                building.x < this.camera.x + this.camera.width + buffer &&
                building.y > this.camera.y - buffer &&
                building.y < this.camera.y + this.camera.height + buffer) {
                // Enemy buildings: only draw if the area has been explored
                if (building.team !== this.playerTeam && !this.isExploredByPlayer(building.x, building.y)) {
                    return;
                }
                building.render(this.ctx, this.camera);
            }
        });

        // Town houses (back-to-front so lower houses overlap upper ones) and their people
        visibleCities.forEach(c => {
            c.houses.slice().sort((a, b) => a.y - b.y).forEach(h => h.render(this.ctx, this.camera));
            c.civilians.forEach(p => p.render(this.ctx, this.camera));
        });

        this.units.forEach(unit => {
            if (unit.x > this.camera.x - buffer &&
                unit.x < this.camera.x + this.camera.width + buffer &&
                unit.y > this.camera.y - buffer &&
                unit.y < this.camera.y + this.camera.height + buffer) {
                // Enemy units: only draw when currently visible
                if (unit.team !== this.playerTeam && !this.isVisibleToPlayer(unit.x, unit.y)) return;
                unit.render(this.ctx, this.camera);
            }
        });

        this.projectiles.forEach(projectile => {
            if (projectile.x > this.camera.x - buffer &&
                projectile.x < this.camera.x + this.camera.width + buffer &&
                projectile.y > this.camera.y - buffer &&
                projectile.y < this.camera.y + this.camera.height + buffer) {
                projectile.render(this.ctx, this.camera);
            }
        });

        this.particles.forEach(particle => {
            if (particle.x > this.camera.x - buffer &&
                particle.x < this.camera.x + this.camera.width + buffer &&
                particle.y > this.camera.y - buffer &&
                particle.y < this.camera.y + this.camera.height + buffer) {
                particle.render(this.ctx, this.camera);
            }
        });

        this.nukes.forEach(n => n.render(this.ctx, this.camera));
        this.shockwaves.forEach(s => s.render(this.ctx, this.camera));

        // Nuke targeting preview
        if (this.nukeTargeting && this.input.mouseWorldPos) {
            const sx = this.input.mouseWorldPos.x - this.camera.x;
            const sy = this.input.mouseWorldPos.y - this.camera.y;
            this.ctx.strokeStyle = 'rgba(255, 50, 50, 0.7)';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([8, 4]);
            this.ctx.beginPath();
            this.ctx.arc(sx, sy, 250, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
            this.ctx.strokeStyle = '#FF1744';
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.moveTo(sx - 14, sy); this.ctx.lineTo(sx + 14, sy);
            this.ctx.moveTo(sx, sy - 14); this.ctx.lineTo(sx, sy + 14);
            this.ctx.stroke();
        }

        this.renderFog();

        // Town name / population tags on top of the fog so they're always readable
        visibleCities.forEach(c => c.renderLabel(this.ctx, this.camera));

        // Red vignette when player takes damage
        if (this.damageFlash > 0) {
            const vx = this.camera.width / 2, vy = this.camera.height / 2;
            const vgrad = this.ctx.createRadialGradient(vx, vy, this.camera.height * 0.25, vx, vy, this.camera.height);
            vgrad.addColorStop(0, 'rgba(180,0,0,0)');
            vgrad.addColorStop(1, `rgba(200,0,0,${(this.damageFlash * 0.45).toFixed(3)})`);
            this.ctx.fillStyle = vgrad;
            this.ctx.fillRect(0, 0, this.camera.width, this.camera.height);
        }

        // Order feedback: shrinking ring where a move/attack order was given
        this.orderMarkers.forEach(m => {
            const mx = m.x - this.camera.x, my = m.y - this.camera.y;
            this.ctx.save();
            this.ctx.globalAlpha = Math.max(0, m.life);
            this.ctx.strokeStyle = m.color;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.ellipse(mx, my, 6 + 16 * m.life, (6 + 16 * m.life) * 0.55, 0, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.restore();
        });

        this.input.renderSelection(this.ctx, this.camera);

        if (this.buildMode) {
            this.drawBuildPreview();
        }

        // World boundary indicators
        const edgeLeft = -this.camera.x;
        const edgeTop = -this.camera.y;
        const edgeRight = this.worldWidth - this.camera.x;
        const edgeBottom = this.worldHeight - this.camera.y;
        this.ctx.strokeStyle = 'rgba(100,60,20,0.6)';
        this.ctx.lineWidth = 8;
        this.ctx.strokeRect(edgeLeft, edgeTop, this.worldWidth, this.worldHeight);

        this.ctx.restore(); // End viewport scale

        // Radio chatter HUD — drawn in canvas pixel space
        if (this.radioMessages.length > 0) {
            const cw = this.canvas.width, pad = 12;
            this.ctx.save();
            this.ctx.font = `bold ${Math.max(12, Math.floor(this.canvas.height * 0.022))}px monospace`;
            this.radioMessages.forEach((msg, i) => {
                const alpha = Math.min(1, msg.timer / 0.6);
                const tw = this.ctx.measureText(msg.text).width;
                const bx = cw - tw - pad * 2 - 4;
                const by = 8 + i * (Math.floor(this.canvas.height * 0.03) + 4);
                const bh = Math.floor(this.canvas.height * 0.03);
                this.ctx.globalAlpha = alpha * 0.75;
                this.ctx.fillStyle = '#000';
                this.ctx.fillRect(bx - 4, by, tw + pad * 2 + 8, bh + 4);
                this.ctx.globalAlpha = alpha;
                this.ctx.fillStyle = msg.color;
                this.ctx.fillText(msg.text, bx + pad, by + bh - 2);
            });
            this.ctx.restore();
        }

        // Towns status panel (top-left). Click-free overview of who needs help.
        if (this.cities.length > 0 && this.gameState === 'playing') {
            const fs = Math.max(12, Math.floor(this.canvas.height * 0.02));
            const lineH = fs + 6;
            this.ctx.save();
            this.ctx.font = `bold ${fs}px Arial`;
            const lines = this.cities.map(c => ({
                c,
                text: c.fallen ? `☠ ${c.name} — fallen` : `🏘 ${c.name}  ${c.population}/${c.initialPop}${c.underAttackTimer > 0 ? '  ⚠ ATTACK' : ''}`
            }));
            const secsLeft = Math.ceil((this.raidDelay || 0) - (this.missionTime || 0));
            const title = secsLeft > 0 ? `TOWNS TO PROTECT — raids in ${secsLeft}s` : 'TOWNS TO PROTECT';
            const w = Math.max(this.ctx.measureText(title).width, ...lines.map(l => this.ctx.measureText(l.text).width)) + 20;
            const h = lineH * (lines.length + 1) + 8;
            this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
            const py = this.canvas.height - h - 8; // bottom-left, clear of the starting base
            this.ctx.fillRect(8, py, w, h);
            this.ctx.strokeStyle = 'rgba(179,229,252,0.5)';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(8, py, w, h);
            this.ctx.fillStyle = '#B3E5FC';
            this.ctx.fillText(title, 18, py + lineH);
            lines.forEach((l, i) => {
                const attacked = l.c.underAttackTimer > 0 && !l.c.fallen;
                this.ctx.fillStyle = l.c.fallen ? '#9E9E9E'
                    : attacked ? (Math.sin(Date.now() / 120) > 0 ? '#FF5252' : '#FFAB91')
                    : l.c.population < l.c.initialPop * 0.5 ? '#FFB74D' : '#C8E6C9';
                this.ctx.fillText(l.text, 18, py + lineH * (i + 2));
            });
            this.ctx.restore();
        }

        if (this.paused && this.gameState === 'playing') {
            const cw = this.canvas.width, ch = this.canvas.height;
            this.ctx.save();
            this.ctx.fillStyle = 'rgba(0,0,0,0.35)';
            this.ctx.fillRect(0, 0, cw, ch);
            this.ctx.textAlign = 'center';
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.font = `bold ${Math.floor(ch * 0.09)}px Arial`;
            this.ctx.fillText('PAUSED', cw / 2, ch * 0.45);
            this.ctx.font = `${Math.floor(ch * 0.03)}px Arial`;
            this.ctx.fillStyle = '#CFD8DC';
            this.ctx.fillText('Press P to resume — you can still look around and give orders', cw / 2, ch * 0.45 + ch * 0.06);
            this.ctx.restore();
        }

        this.renderMinimap();
    }

    renderMinimap() {
        const ctx = this.minimapCtx;
        const width = this.minimapCanvas.width;
        const height = this.minimapCanvas.height;

        // Terrain-coloured background so the minimap reads like the map
        ctx.fillStyle = '#2f5a1a';
        ctx.fillRect(0, 0, width, height);

        // Calculate scale
        const scaleX = width / this.worldWidth;
        const scaleY = height / this.worldHeight;

        // Rivers and bridges
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#2b74ad';
        this.rivers.forEach(r => {
            ctx.lineWidth = Math.max(2, r.halfWidth * 2 * scaleX);
            ctx.beginPath();
            r.points.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x * scaleX, y * scaleY) : ctx.lineTo(x * scaleX, y * scaleY));
            ctx.stroke();
        });
        ctx.fillStyle = '#C8A26B';
        this.bridges.forEach(b => ctx.fillRect(b.x * scaleX - 2.5, b.y * scaleY - 2.5, 5, 5));
        // Mountains
        ctx.strokeStyle = '#8a8172';
        this.mountains.forEach(m => {
            ctx.lineWidth = Math.max(3, m.halfWidth * 2 * scaleX);
            ctx.beginPath();
            m.points.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x * scaleX, y * scaleY) : ctx.lineTo(x * scaleX, y * scaleY));
            ctx.stroke();
        });
        ctx.restore();

        // Fog (same soft texture as the main view) drawn under the markers so dots stay bright
        if (this.fogCanvas) {
            ctx.save();
            ctx.imageSmoothingEnabled = true;
            ctx.globalAlpha = 0.9;
            ctx.drawImage(this.fogCanvas, 0, 0,
                this.fogCols * this.fogTileSize * scaleX, this.fogRows * this.fogTileSize * scaleY);
            ctx.restore();
        }

        // Draw resource deposits (only if explored)
        ctx.fillStyle = '#FFD700';
        this.resourceDeposits.forEach(deposit => {
            if (deposit.amount > 0 && this.isExploredByPlayer(deposit.x, deposit.y)) {
                const x = deposit.x * scaleX;
                const y = deposit.y * scaleY;
                ctx.fillRect(x - 1, y - 1, 3, 3);
            }
        });

        // Draw buildings (fog-aware)
        this.buildings.forEach(building => {
            if (building.team !== this.playerTeam && !this.isExploredByPlayer(building.x, building.y)) return;
            ctx.fillStyle = building.team === this.playerTeam ? '#00ff00' : '#ff0000';
            const x = building.x * scaleX;
            const y = building.y * scaleY;
            ctx.fillRect(x - 2, y - 2, 4, 4);
        });

        // Towns: light-blue blocks, flashing red while under attack
        this.cities.forEach(c => {
            const flash = c.underAttackTimer > 0 && !c.fallen && Math.sin(Date.now() / 150) > 0;
            ctx.fillStyle = c.fallen ? '#616161' : flash ? '#FF1744' : '#81D4FA';
            c.houses.forEach(h => ctx.fillRect(h.x * scaleX - 1.5, h.y * scaleY - 1.5, 3, 3));
            if (!c.fallen) {
                ctx.strokeStyle = flash ? '#FF1744' : 'rgba(129,212,250,0.6)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(c.x * scaleX, c.y * scaleY, c.radius * scaleX, 0, Math.PI * 2);
                ctx.stroke();
            }
        });

        // Draw units (fog-aware — enemy only shown when currently visible)
        this.units.forEach(unit => {
            if (unit.garrisonedIn) return;
            if (unit.team !== this.playerTeam && !this.isVisibleToPlayer(unit.x, unit.y)) return;
            ctx.fillStyle = unit.team === this.playerTeam ? '#88ff88' : '#ff8888';
            const x = unit.x * scaleX;
            const y = unit.y * scaleY;
            ctx.fillRect(x - 1, y - 1, 2, 2);
        });

        // Draw camera viewport
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(
            this.camera.x * scaleX,
            this.camera.y * scaleY,
            this.camera.width * scaleX,
            this.camera.height * scaleY
        );

        // Draw border
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, width, height);
    }

    drawGrid() {
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 1;

        const gridSize = 50;
        const startX = Math.floor(this.camera.x / gridSize) * gridSize;
        const startY = Math.floor(this.camera.y / gridSize) * gridSize;

        for (let x = startX; x < this.camera.x + this.camera.width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x - this.camera.x, 0);
            this.ctx.lineTo(x - this.camera.x, this.canvas.height);
            this.ctx.stroke();
        }

        for (let y = startY; y < this.camera.y + this.camera.height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y - this.camera.y);
            this.ctx.lineTo(this.canvas.width, y - this.camera.y);
            this.ctx.stroke();
        }
    }

    drawResourceDeposit(deposit) {
        const screenX = deposit.x - this.camera.x;
        const screenY = deposit.y - this.camera.y;

        // Draw multiple gold nuggets to make a cluster
        const nuggetPositions = [
            { x: 0, y: 0, size: 12 },
            { x: -10, y: -8, size: 9 },
            { x: 8, y: -6, size: 10 },
            { x: -6, y: 10, size: 8 },
            { x: 10, y: 8, size: 11 },
            { x: 0, y: -12, size: 7 }
        ];

        nuggetPositions.forEach((nugget, index) => {
            const x = screenX + nugget.x;
            const y = screenY + nugget.y;

            // Draw nugget with irregular shape
            this.ctx.fillStyle = '#FFD700';
            this.ctx.beginPath();

            // Create irregular nugget shape (deterministic based on index)
            const points = 6;
            const seed = deposit.x + deposit.y + index * 100;
            for (let i = 0; i < points; i++) {
                const angle = (i / points) * Math.PI * 2;
                // Use deterministic variation based on seed
                const variation = 0.7 + ((Math.sin(seed + i) + 1) / 2) * 0.3;
                const radius = nugget.size * variation;
                const px = x + Math.cos(angle) * radius;
                const py = y + Math.sin(angle) * radius;

                if (i === 0) {
                    this.ctx.moveTo(px, py);
                } else {
                    this.ctx.lineTo(px, py);
                }
            }
            this.ctx.closePath();
            this.ctx.fill();

            // Add darker outline for depth
            this.ctx.strokeStyle = '#B8860B';
            this.ctx.lineWidth = 1;
            this.ctx.stroke();

            // Add highlight
            this.ctx.fillStyle = '#FFFF99';
            this.ctx.beginPath();
            this.ctx.arc(x - 2, y - 2, nugget.size * 0.3, 0, Math.PI * 2);
            this.ctx.fill();
        });

        if (deposit.amount < deposit.maxAmount * 0.3) {
            this.ctx.strokeStyle = 'rgba(255,215,0,0.4)';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([4,4]);
            this.ctx.beginPath();
            this.ctx.arc(screenX, screenY, 28, 0, Math.PI*2);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
    }

    drawBuildPreview() {
        this.ctx.setLineDash([5, 5]);
        this.ctx.lineWidth = 2;

        // Green build-radius rings around friendly buildings
        this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.25)';
        this.buildings.filter(b => b.team === this.playerTeam).forEach(b => {
            this.ctx.beginPath();
            this.ctx.arc(b.x - this.camera.x, b.y - this.camera.y, this.buildRadius, 0, Math.PI * 2);
            this.ctx.stroke();
        });

        // Red exclusion rings around enemy buildings
        this.ctx.strokeStyle = 'rgba(255, 50, 50, 0.3)';
        this.buildings.filter(b => b.team !== this.playerTeam).forEach(b => {
            this.ctx.beginPath();
            this.ctx.arc(b.x - this.camera.x, b.y - this.camera.y, 350, 0, Math.PI * 2);
            this.ctx.stroke();
        });

        this.ctx.setLineDash([]);

        // Draw building preview at mouse position
        const mousePos = this.input.mouseWorldPos;
        if (mousePos) {
            const isValid = this.isValidBuildLocation(mousePos.x, mousePos.y);

            // Change color based on validity
            if (isValid) {
                this.ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
                this.ctx.strokeStyle = '#0f0';
            } else {
                this.ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
                this.ctx.strokeStyle = '#f00';
            }
            this.ctx.lineWidth = 2;

            const size = 60;
            const x = mousePos.x - this.camera.x - size / 2;
            const y = mousePos.y - this.camera.y - size / 2;

            this.ctx.fillRect(x, y, size, size);
            this.ctx.strokeRect(x, y, size, size);
        }
    }

    initDecorations() {
        this.decorations = [];
        let seed = 42;
        const rng = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; };

        // Dirt patches
        for (let i = 0; i < 80; i++) {
            this.decorations.push({ type: 'dirt', x: rng()*this.worldWidth, y: rng()*this.worldHeight,
                w: 40+rng()*50, h: 30+rng()*40, angle: rng()*Math.PI });
        }
        // Rocks
        for (let i = 0; i < 120; i++) {
            this.decorations.push({ type: 'rock', x: rng()*this.worldWidth, y: rng()*this.worldHeight,
                radius: 6+rng()*8 });
        }
        // Trees — avoid start bases
        let treesPlaced = 0;
        while (treesPlaced < 200) {
            const x = rng() * this.worldWidth;
            const y = rng() * this.worldHeight;
            const nearPlayerBase = x < 500 && y < 500;
            const nearEnemyBase = x > 2100 && y > 1200;
            const inTown = CITY_SITES.some(c => Math.abs(x - c.x) < 140 && Math.abs(y - c.y) < 120);
            const wet = this.areaHasWater(x, y, 50, 50) || this.nearBridge(x, y, 30);
            if (nearPlayerBase || nearEnemyBase || inTown || wet) continue;
            const r = 12 + rng() * 10;
            const g1 = Math.floor(80 + rng()*50);
            const g2 = Math.floor(100 + rng()*60);
            this.decorations.push({ type: 'tree', x, y, radius: r,
                dark: `rgb(20,${g1},20)`, light: `rgb(30,${g2},30)` });
            treesPlaced++;
        }
        // No rocks or dirt patches floating in the rivers
        this.decorations = this.decorations.filter(d =>
            d.type === 'tree' || (!this.areaHasWater(d.x, d.y, 30, 30) && !this.nearBridge(d.x, d.y, 20)));
    }

    drawDecorations() {
        const cam = this.camera;
        const buf = 50;
        this.decorations.forEach(d => {
            const sx = d.x - cam.x;
            const sy = d.y - cam.y;
            if (sx < -buf || sx > cam.width + buf || sy < -buf || sy > cam.height + buf) return;
            if (!this.isExploredByPlayer(d.x, d.y)) return;

            if (d.type === 'dirt') {
                this.ctx.fillStyle = 'rgba(101,67,33,0.22)';
                this.ctx.beginPath();
                this.ctx.ellipse(sx, sy, d.w/2, d.h/2, d.angle || 0, 0, Math.PI*2);
                this.ctx.fill();
            } else if (d.type === 'rock') {
                this.ctx.fillStyle = '#7a7a6a';
                this.ctx.beginPath();
                this.ctx.arc(sx, sy, d.radius, 0, Math.PI*2);
                this.ctx.fill();
                this.ctx.fillStyle = 'rgba(255,255,255,0.15)';
                this.ctx.beginPath();
                this.ctx.arc(sx - d.radius*0.2, sy - d.radius*0.3, d.radius*0.45, 0, Math.PI*2);
                this.ctx.fill();
            } else if (d.type === 'tree') {
                // Shadow
                this.ctx.fillStyle = 'rgba(0,0,0,0.18)';
                this.ctx.beginPath();
                this.ctx.ellipse(sx + 4, sy + 6, d.radius * 0.9, d.radius * 0.45, 0, 0, Math.PI * 2);
                this.ctx.fill();
                // Trunk
                this.ctx.fillStyle = '#5D4037';
                this.ctx.fillRect(sx - 3, sy, 6, d.radius * 0.7);
                // Canopy layers
                this.ctx.fillStyle = d.dark || '#1B5E20';
                this.ctx.beginPath();
                this.ctx.arc(sx, sy - d.radius * 0.2, d.radius * 1.05, 0, Math.PI*2);
                this.ctx.fill();
                this.ctx.fillStyle = d.light || '#2E7D32';
                this.ctx.beginPath();
                this.ctx.arc(sx - d.radius*0.15, sy - d.radius * 0.5, d.radius * 0.75, 0, Math.PI*2);
                this.ctx.fill();
                this.ctx.fillStyle = 'rgba(144,238,100,0.25)';
                this.ctx.beginPath();
                this.ctx.arc(sx - d.radius*0.2, sy - d.radius*0.55, d.radius*0.35, 0, Math.PI*2);
                this.ctx.fill();
            }
        });
    }

    updateUI() {
        let info = '';
        if (this.nukeTargeting) {
            info = '☢ Click target location for nuclear strike — Escape or Right-click to cancel';
        } else if (this.commandMode === 'move') {
            info = `${this.selectedUnits.length} unit(s) — Click where to MOVE`;
        } else if (this.commandMode === 'attack') {
            info = `${this.selectedUnits.length} unit(s) — Click where to ATTACK`;
        } else if (this.selectedUnits.length > 0) {
            info = `${this.selectedUnits.length} unit(s) selected — M: move  A: attack  Right-click: move+deselect`;
        } else if (this.selectedBuilding && this.selectedBuilding.type === 'aa_battery') {
            const aa = this.selectedBuilding;
            const ready = aa.interceptCooldown <= 0;
            info = ready
                ? `🛰 AA Battery ready — intercepts nukes within ${aa.interceptRange} units (${aa.interceptsTotal} destroyed)`
                : `🛰 AA Battery recharging — ${Math.ceil(aa.interceptCooldown)}s remaining (${aa.interceptsTotal} destroyed)`;
        } else if (this.selectedBuilding && this.selectedBuilding.type === 'missile_silo') {
            const silo = this.selectedBuilding;
            const ready = silo.nukeCooldown <= 0;
            const canAfford = this.resources.credits >= this.nukeCost;
            if (ready && canAfford) {
                info = `☢ Missile Silo ready — Right-click map to fire (costs ${this.nukeCost} credits)`;
            } else if (!ready) {
                info = `☢ Missile Silo recharging — ${Math.ceil(silo.nukeCooldown)}s remaining`;
            } else {
                info = `☢ Missile Silo ready — need ${this.nukeCost} credits to fire`;
            }
        } else if (this.selectedBuilding) {
            const b = this.selectedBuilding;
            const hpPct = Math.round((b.hp / b.maxHp) * 100);
            if (b.repairing) {
                info = `🔧 Repairing ${b.type} — ${Math.ceil(b.hp)}/${b.maxHp} HP (${hpPct}%) — 3 credits/sec`;
            } else {
                info = `${b.type} — ${Math.ceil(b.hp)}/${b.maxHp} HP (${hpPct}%)`;
            }
        } else {
            info = 'Left-click to select  |  Right-click to move+deselect  |  Drag to box-select  |  Ctrl/Shift+1-9: group';
        }
        document.getElementById('selected-info').textContent = info;

        this.refreshLiveUI();
    }

    // Parts of the HUD that change continuously. Safe to call every few frames:
    // unlike updateUI() it never overwrites the info bar (and its temporary warnings).
    refreshLiveUI() {
        document.getElementById('credits').textContent = Math.floor(this.resources.credits);
        document.getElementById('power').textContent =
            `${this.resources.power}/${this.resources.maxPower}`;

        // Update unit button states based on building requirements
        const hasBarracks = this.buildings.some(b => b.team === this.playerTeam && b.type === 'barracks');
        const hasFactory = this.buildings.some(b => b.team === this.playerTeam && b.type === 'factory');

        // Enable/disable unit buttons based on building availability
        document.querySelectorAll('.unit-btn').forEach(btn => {
            const type = btn.dataset.type;
            const cost = parseInt(btn.dataset.cost);
            let canProduce = false;
            let missingBuilding = '';

            if (type === 'soldier') {
                canProduce = hasBarracks;
                missingBuilding = 'Barracks';
            } else if (['mortar', 'medic', 'bazooka', 'general'].includes(type)) {
                canProduce = hasBarracks;
                missingBuilding = 'Barracks';
            } else if (['tank', 'sniper', 'artillery', 'commando', 'helicopter', 'apc'].includes(type)) {
                canProduce = hasFactory;
                missingBuilding = 'War Factory';
            } else if (type === 'harvester') {
                canProduce = true; // Can always produce from HQ
            }

            // Disable button if requirements not met or not enough credits
            if (!canProduce || this.resources.credits < cost) {
                btn.disabled = true;
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';

                if (!canProduce) {
                    // Store original text if not already stored
                    if (!btn.dataset.originalText) {
                        btn.dataset.originalText = btn.textContent;
                    }
                    btn.textContent = btn.dataset.originalText + ` (Need ${missingBuilding})`;
                }
            } else {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';

                // Restore original text if it was changed
                if (btn.dataset.originalText) {
                    btn.textContent = btn.dataset.originalText;
                }
            }
        });

        document.querySelectorAll('.build-btn').forEach(btn => {
            const type = btn.dataset.type;
            const prereq = BUILD_PREREQS[type];
            const cost = parseInt(btn.dataset.cost);
            const hasPrereq = !prereq || this.buildings.some(b => b.team === this.playerTeam && b.type === prereq.requires);
            const canAfford = this.resources.credits >= cost;
            btn.disabled = !hasPrereq || !canAfford;
            btn.style.opacity = (!hasPrereq || !canAfford) ? '0.5' : '1';
            if (!btn.dataset.baseText) btn.dataset.baseText = btn.textContent.replace(/ \(Need.*\)$/, '').trim();
            btn.textContent = !hasPrereq
                ? `${btn.dataset.baseText} (Need ${prereq.label})`
                : btn.dataset.baseText;
        });

        // Update production queue display
        const queueElement = document.getElementById('production-queue');
        if (this.productionQueue.length === 0) {
            queueElement.innerHTML = '<span style="color: #888;">Nothing in production</span>';
        } else {
            let queueHTML = '';
            this.productionQueue.forEach((item) => {
                const progress = ((item.totalTime - item.timeRemaining) / item.totalTime) * 100;
                const itemName = item.itemType === 'unit' ? item.unitType : item.buildingType;
                const timeLeft = Math.ceil(item.timeRemaining);

                queueHTML += `
                    <div style="margin-bottom: 8px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                            <span style="text-transform: capitalize;">${itemName}</span>
                            <span style="color: #aaa;">${timeLeft}s</span>
                        </div>
                        <div style="background: #333; height: 8px; border: 1px solid #555; position: relative;">
                            <div style="background: #4CAF50; height: 100%; width: ${progress}%; transition: width 0.1s;"></div>
                        </div>
                    </div>
                `;
            });
            queueElement.innerHTML = queueHTML;
        }

        this.updateRepairUI();
    }

    // Camera scrolling (mouse at screen edge + arrow keys). Runs even while paused.
    updateCamera(deltaTime) {
        // Edge scrolling — runs every frame so the camera moves continuously
        if (!this.input.cameraDragging && this.input.mouseOnCanvas) {
            const edgeSize = 50;
            const maxSpeed = 800; // world-units per second at full edge depth
            const mx = this.input.mouseX;
            const my = this.input.mouseY;
            if (!document.hidden) {
                if (mx < edgeSize) {
                    this.camera.x -= maxSpeed * ((edgeSize - mx) / edgeSize) * deltaTime;
                }
                if (mx > this.camera.width - edgeSize) {
                    this.camera.x += maxSpeed * ((mx - (this.camera.width - edgeSize)) / edgeSize) * deltaTime;
                }
                if (my < edgeSize) {
                    this.camera.y -= maxSpeed * ((edgeSize - my) / edgeSize) * deltaTime;
                }
                if (my > this.camera.height - edgeSize) {
                    this.camera.y += maxSpeed * ((my - (this.camera.height - edgeSize)) / edgeSize) * deltaTime;
                }
                this.camera.x = Math.max(0, Math.min(this.camera.x, this.worldWidth - this.camera.width));
                this.camera.y = Math.max(0, Math.min(this.camera.y, this.worldHeight - this.camera.height));
            }
        }

        // Smooth arrow-key scrolling while keys are held
        const keys = this.input.keysDown;
        if (keys.size > 0) {
            const kSpeed = 700 * deltaTime;
            if (keys.has('ArrowLeft'))  this.camera.x -= kSpeed;
            if (keys.has('ArrowRight')) this.camera.x += kSpeed;
            if (keys.has('ArrowUp'))    this.camera.y -= kSpeed;
            if (keys.has('ArrowDown'))  this.camera.y += kSpeed;
            this.camera.x = Math.max(0, Math.min(this.camera.x, this.worldWidth - this.camera.width));
            this.camera.y = Math.max(0, Math.min(this.camera.y, this.worldHeight - this.camera.height));
        }
    }

    togglePause(force) {
        if (this.gameState !== 'playing') return;
        this.paused = force !== undefined ? force : !this.paused;
        if (this.sfx) this.sfx.updateMusicVolume();
        this.updatePauseButton();
    }

    updatePauseButton() {
        const b = document.getElementById('pause-btn');
        if (!b) return;
        b.textContent = this.paused ? '▶ Resume (P)' : '⏸ Pause (P)';
        b.style.background = this.paused ? '#2E7D32' : '#455A64';
    }

    gameLoop(currentTime) {
        const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.1);
        this.lastTime = currentTime;

        if (this.paused && this.gameState === 'playing') {
            // Frozen battlefield: only the camera moves, so you can look around and give orders
            this.updateCamera(deltaTime);
        } else {
            this.update(deltaTime);
        }
        this.render();

        requestAnimationFrame((time) => this.gameLoop(time));
    }
}

window.addEventListener('load', () => {
    const game = new Game();
    window._game = game;
    game.showCampaignScreen();
});
