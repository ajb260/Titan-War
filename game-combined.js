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
    }

    update(deltaTime) {
        this.x += this.velocityX * deltaTime * 60;
        this.y += this.velocityY * deltaTime * 60;
        this.velocityY += 0.2; // Gravity
        this.life -= this.decay;
    }

    render(ctx, camera) {
        ctx.globalAlpha = this.life;
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
        if (!this.target || this.target.hp <= 0) {
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
            // AoE splash damage for mortar shells
            if (this.aoe > 0 && this.game) {
                [...this.game.units, ...this.game.buildings].forEach(entity => {
                    if (entity === this.target) return;
                    if (entity.team === (this.owner ? this.owner.team : null)) return;
                    const ex = entity.x - this.x, ey = entity.y - this.y;
                    const ed = Math.sqrt(ex*ex + ey*ey);
                    if (ed < this.aoe) {
                        entity.hp -= this.damage * (1 - ed / this.aoe);
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
            this.game.particles.push(new Particle(
                this.x, this.y,
                ['#888', '#aaa', '#bbb', '#999'][Math.floor(Math.random() * 4)],
                3 + Math.random() * 4,
                (Math.random() - 0.5) * 1.5,
                (Math.random() - 0.5) * 1.5
            ));
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

        // Instantly kill all units in radius
        this.game.units.forEach(unit => {
            const dx = unit.x - this.targetX;
            const dy = unit.y - this.targetY;
            if (Math.sqrt(dx * dx + dy * dy) <= r) unit.hp = 0;
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
        this.target = null;
        this.attackMove = false;
    }

    stop() {
        this.targetX = this.x;
        this.targetY = this.y;
        this.target = null;
        this.attackMove = false;
    }

    update(deltaTime, game) {
        if (this.garrisonedIn) return; // garrisoned units don't move or act
        if (this.type === 'harvester') {
            this.updateHarvester(deltaTime, game);
            return;
        }

        if (this.type === 'medic') {
            // Move toward nearest damaged friendly
            let healTarget = null;
            let minDist = Infinity;
            game.units.forEach(u => {
                if (u === this || u.team !== this.team || u.hp >= u.maxHp || u.garrisonedIn) return;
                const dx = u.x - this.x, dy = u.y - this.y;
                const d = Math.sqrt(dx*dx+dy*dy);
                if (d < minDist) { minDist = d; healTarget = u; }
            });
            if (healTarget && minDist < 80) {
                healTarget.hp = Math.min(healTarget.hp + 10 * deltaTime, healTarget.maxHp);
                this.targetX = this.x; this.targetY = this.y; // stop moving
            } else if (healTarget) {
                this.targetX = healTarget.x; this.targetY = healTarget.y;
            }
            // Move
            const hdx = this.targetX - this.x, hdy = this.targetY - this.y;
            const hdist = Math.sqrt(hdx*hdx+hdy*hdy);
            if (hdist > 2) {
                const ang = Math.atan2(hdy, hdx);
                this.x += Math.cos(ang) * this.speed * deltaTime;
                this.y += Math.sin(ang) * this.speed * deltaTime;
            }
            if (this.attackCooldown > 0) this.attackCooldown -= deltaTime;
            return;
        }

        // Auto-engage nearby enemies even when not in attack-move mode
        if (!this.target) {
            this.findNearbyEnemy(game);
        }

        if (this.attackMove && !this.target) {
            this.findTarget(game);
        }

        if (this.target) {
            const dx = this.target.x - this.x;
            const dy = this.target.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (this.target.hp <= 0) {
                this.target = null;
            } else if (dist <= this.range) {
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

        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 2) {
            const angle = Math.atan2(dy, dx);
            this.x += Math.cos(angle) * this.speed * deltaTime;
            this.y += Math.sin(angle) * this.speed * deltaTime;
        }

        // Apply collision physics and crushing
        this.handleCollisions(game);

        if (this.attackCooldown > 0) {
            this.attackCooldown -= deltaTime;
        }
    }

    handleCollisions(game) {
        if (this.isAir) return; // helicopters fly over everything
        // Check collisions with other units
        for (const other of game.units) {
            if (other === this) continue;

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

                // Push this unit away
                this.x -= separationX * myPushRatio;
                this.y -= separationY * myPushRatio;

                // Push other unit away
                other.x += separationX * otherPushRatio;
                other.y += separationY * otherPushRatio;
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
                    game.updateUI();
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
                }
            }
        }

        // Move
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 2) {
            const angle = Math.atan2(dy, dx);
            this.x += Math.cos(angle) * this.speed * deltaTime;
            this.y += Math.sin(angle) * this.speed * deltaTime;
        }

        // Apply collision physics for harvesters too
        this.handleCollisions(game);
    }

    findNearestDeposit(deposits) {
        let nearest = null;
        let minDist = Infinity;

        deposits.forEach(deposit => {
            if (deposit.amount > 0) {
                const dx = deposit.x - this.x;
                const dy = deposit.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < minDist) {
                    minDist = dist;
                    nearest = deposit;
                }
            }
        });

        return nearest;
    }

    findNearbyEnemy(game) {
        // Auto-detect nearby enemies within a shorter range
        // Only targets units, not buildings (to avoid units wandering off to attack buildings)
        let nearestEnemy = null;
        let minDist = Infinity;
        const detectionRange = 200;
        const fogGrid = this.team === game.playerTeam ? game.playerFog : game.enemyFog;

        game.units.forEach(unit => {
            if (unit.team !== this.team && unit.type !== 'harvester') {
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

        if (nearestEnemy) {
            this.target = nearestEnemy;
            this.attackMove = false;
        }
    }

    findTarget(game) {
        let nearestTarget = null;
        let minDist = Infinity;

        game.units.forEach(unit => {
            if (unit.team !== this.team) {
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

        const hpFrac = this.hp / this.maxHp;
        const barColor = hpFrac > 0.6 ? '#4CAF50' : hpFrac > 0.3 ? '#FF9800' : '#f44336';
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);
        ctx.fillStyle = '#222';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        ctx.fillStyle = barColor;
        ctx.fillRect(barX, barY, barWidth * hpFrac, barHeight);

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
            if (!this.target || this.target.hp <= 0) {
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
                        'turret_bullet'
                    );
                    game.projectiles.push(projectile);
                    this.attackCooldown = this.attackSpeed;
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
                        const spd = 60 + Math.random() * 80;
                        game.particles.push(new Particle(
                            target.x, target.y, '#00E5FF',
                            4 + Math.random() * 4,
                            Math.cos(angle) * spd, Math.sin(angle) * spd
                        ));
                    }
                    // Orange flash at battery
                    for (let i = 0; i < 8; i++) {
                        const angle = Math.random() * Math.PI * 2;
                        game.particles.push(new Particle(
                            this.x, this.y, '#FF6F00',
                            3 + Math.random() * 3,
                            Math.cos(angle) * 50, Math.sin(angle) * 50
                        ));
                    }
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
                    if (u.team === this.team) return false;
                    const dx = u.x - this.x, dy = u.y - this.y;
                    return Math.sqrt(dx*dx+dy*dy) <= garrisonRange;
                });
                if (enemy) {
                    const shooter = this.garrison[Math.floor(Math.random() * this.garrison.length)];
                    const dmg = (shooter.damage || 5) * 1.5; // 50% bonus inside building
                    game.projectiles.push(new Projectile(this.x, this.y, enemy, dmg, 450, 3, shooter.color || '#4CAF50', 'garrison_bullet', shooter));
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
            if (unit.team !== this.team && unit.type !== 'harvester') {
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
                    if (unit.team !== this.game.playerTeam) {
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
                    this.selectUnitsInBox(minX, minY, maxX, maxY);
                } else {
                    // It's a click - first check if clicking on a friendly unit/building to select it
                    const clickedOnFriendly = this.checkClickOnFriendly(this.dragStart.x, this.dragStart.y);

                    if (clickedOnFriendly) {
                        // Clicking on friendly unit/building - select it
                        this.selectAtPoint(this.dragStart.x, this.dragStart.y);
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
            if (unit.team === this.game.playerTeam) {
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
                if (unit.team !== this.game.playerTeam) {
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
        this.game.selectedUnits.forEach(unit => {
            if (clickedDeposit && unit.type === 'harvester') {
                // Harvester - target the ore deposit
                unit.targetDeposit = clickedDeposit;
                // Don't reset carrying - let harvester deposit first if full, then come back
            } else if (clickedEnemy) {
                // Attack enemy
                unit.target = clickedEnemy;
                unit.attackMove = false;
            } else {
                // Move to location
                unit.moveTo(worldX, worldY);
            }
        });
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
                if (unit.team !== this.game.playerTeam) {
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
                        // Garrison soldiers into this building
                        const toGarrison = this.game.selectedUnits.filter(u => ['soldier','sniper','commando'].includes(u.type));
                        const space = building.maxGarrison - building.garrison.length;
                        toGarrison.slice(0, space).forEach(u => {
                            u.garrisonedIn = building;
                            u.selected = false;
                            building.garrison.push(u);
                        });
                        this.game.selectedUnits = this.game.selectedUnits.filter(u => !u.garrisonedIn);
                        this.game.updateUI();
                        return;
                    }
                }
            }
            if (!clickedDeposit && !clickedEnemy) {
                // Right-click on empty ground: issue move then deselect
                this.game.selectedUnits.forEach(unit => unit.moveTo(worldX, worldY));
                this.game.selectedUnits.forEach(unit => unit.selected = false);
                this.game.selectedUnits = [];
                if (this.game.selectedBuilding) {
                    this.game.selectedBuilding.selected = false;
                    this.game.selectedBuilding = null;
                }
                this.canvas.style.cursor = 'default';
                this.game.updateUI();
            } else {
                this.game.selectedUnits.forEach(unit => {
                    if (clickedDeposit && unit.type === 'harvester') {
                        unit.targetDeposit = clickedDeposit;
                    } else if (clickedEnemy) {
                        unit.target = clickedEnemy;
                        unit.attackMove = false;
                    } else {
                        unit.moveTo(worldX, worldY);
                    }
                });
            }
        } else if (this.game.selectedBuilding) {
            // Right-click with a building selected deselects it
            this.game.selectedBuilding.selected = false;
            this.game.selectedBuilding = null;
            this.game.updateUI();
        }
    }

    executeMove(worldX, worldY) {
        if (this.game.selectedUnits.length > 0) {
            this.game.selectedUnits.forEach(unit => {
                unit.moveTo(worldX, worldY);
            });
        }
    }

    executeAttack(worldX, worldY) {
        if (this.game.selectedUnits.length > 0) {
            // Check if clicking on an enemy
            let clickedEnemy = null;

            // Check units
            for (const unit of this.game.units) {
                if (unit.team !== this.game.playerTeam) {
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
            this.game.selectedUnits.forEach(unit => {
                if (clickedEnemy) {
                    unit.target = clickedEnemy;
                    unit.attackMove = false;
                } else {
                    // Attack-move to location
                    unit.moveTo(worldX, worldY);
                    unit.attackMove = true;
                }
            });
        }
    }

    onKeyDown(e) {
        if (e.key === 'Escape') {
            this.game.buildMode = null;
            this.game.commandMode = null;
            this.game.nukeTargeting = false;
            this.canvas.style.cursor = 'crosshair';
            this.game.updateUI();
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

        // Arrow key camera navigation
        const scrollSpeed = 15;

        if (e.key === 'ArrowUp') {
            this.game.camera.y = Math.max(0, this.game.camera.y - scrollSpeed);
        }

        if (e.key === 'ArrowDown') {
            this.game.camera.y = Math.min(
                this.game.worldHeight - this.game.camera.height,
                this.game.camera.y + scrollSpeed
            );
        }

        if (e.key === 'ArrowLeft') {
            this.game.camera.x = Math.max(0, this.game.camera.x - scrollSpeed);
        }

        if (e.key === 'ArrowRight') {
            this.game.camera.x = Math.min(
                this.game.worldWidth - this.game.camera.width,
                this.game.camera.x + scrollSpeed
            );
        }
    }

    selectUnitsInBox(minX, minY, maxX, maxY) {
        this.game.selectedUnits.forEach(unit => unit.selected = false);
        this.game.selectedUnits = [];

        if (this.game.selectedBuilding) {
            this.game.selectedBuilding.selected = false;
            this.game.selectedBuilding = null;
        }

        this.game.units.forEach(unit => {
            if (unit.team === this.game.playerTeam &&
                unit.x >= minX && unit.x <= maxX &&
                unit.y >= minY && unit.y <= maxY) {
                unit.selected = true;
                this.game.selectedUnits.push(unit);
            }
        });
    }

    selectAtPoint(worldX, worldY) {
        this.game.selectedUnits.forEach(unit => unit.selected = false);
        this.game.selectedUnits = [];

        if (this.game.selectedBuilding) {
            this.game.selectedBuilding.selected = false;
            this.game.selectedBuilding = null;
        }

        for (const unit of this.game.units) {
            if (unit.team === this.game.playerTeam) {
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
        if (this.hoveredEnemy && this.game.selectedUnits.length > 0) {
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
        const attackInterval = combatUnits.length >= 12 ? hi : combatUnits.length >= 6 ? mid : lo;
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

        this.credits += deltaTime * this.cfg.incomeRate;
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
                if (this.game.isValidBuildLocation(x, y)) {
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
        const target = playerBuildings.length > 0
            ? [...playerBuildings].sort((a, b) => (buildingPriority[b.type] || 0) - (buildingPriority[a.type] || 0))[0]
            : this.game.buildings.find(b => b.team === this.game.playerTeam && b.type === 'hq');

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

        this.resources.credits = playerCredits;

        const hq = createBuilding('hq', 200, 200, this.playerTeam);
        this.buildings.push(hq);

        const refinery = createBuilding('refinery', 350, 250, this.playerTeam);
        this.buildings.push(refinery);

        this.units.push(createUnit('soldier', 250, 250, this.playerTeam));
        this.units.push(createUnit('soldier', 280, 250, this.playerTeam));
        this.units.push(createUnit('harvester', 300, 280, this.playerTeam));

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
                this.buildings.push(createBuilding(eb.type, enemyHQX + eb.offsetX, enemyHQY + eb.offsetY, this.enemyTeam));
            });
            this.ai.credits = enemyCredits;
            this.ai.missionConfig = mission.ai || null;
        }

        this.resetFog();
        this.updateFog(); // Reveal starting area immediately
        this.updateUI();
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
            this.canvas.width = Math.floor(rect.width);
            this.canvas.height = Math.floor(rect.height);
            // Keep camera height fixed; adjust width to match canvas aspect ratio
            // so ctx.scale() uses the same factor on both axes (no stretching)
            const baseHeight = 700;
            this.camera.height = baseHeight;
            this.camera.width = Math.round(baseHeight * (rect.width / rect.height));
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

    getBuildError(x, y) {
        const newBuildingSize = 60;
        for (const building of this.buildings) {
            const dx = Math.abs(x - building.x);
            const dy = Math.abs(y - building.y);
            const minDistance = (newBuildingSize + Math.max(building.width, building.height)) / 2 + 10;
            if (dx < minDistance && dy < minDistance) return 'Too close to an existing building!';
        }
        const playerBuildings = this.buildings.filter(b => b.team === this.playerTeam);
        const nearFriendly = playerBuildings.some(b => {
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
        return null;
    }

    isValidBuildLocation(x, y, team) {
        const newBuildingSize = 60;

        // Check overlap with any existing building
        for (const building of this.buildings) {
            const dx = Math.abs(x - building.x);
            const dy = Math.abs(y - building.y);
            const minDistance = (newBuildingSize + Math.max(building.width, building.height)) / 2 + 10;
            if (dx < minDistance && dy < minDistance) return false;
        }

        // Player-only proximity rules
        if (!team || team === this.playerTeam) {
            // Must be within buildRadius of at least one friendly building
            const playerBuildings = this.buildings.filter(b => b.team === this.playerTeam);
            const nearFriendly = playerBuildings.some(b => {
                const dx = x - b.x, dy = y - b.y;
                return Math.sqrt(dx * dx + dy * dy) <= this.buildRadius;
            });
            if (!nearFriendly) return false;

            // Cannot build within 350px of any enemy building
            const tooCloseToEnemy = this.buildings.some(b => {
                if (b.team === this.playerTeam) return false;
                const dx = x - b.x, dy = y - b.y;
                return Math.sqrt(dx * dx + dy * dy) < 350;
            });
            if (tooCloseToEnemy) return false;
        }

        return true;
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

                // Check if this position is clear
                let isClear = true;
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
        if (type === 'general' && this.units.some(u => u.type === 'general' && u.team === this.playerTeam)) {
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

        // Convert minimap coordinates to world coordinates
        const scaleX = this.worldWidth / this.minimapCanvas.width;
        const scaleY = this.worldHeight / this.minimapCanvas.height;

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
        if (hq) {
            // Center camera on HQ
            this.camera.x = hq.x - this.camera.width / 2;
            this.camera.y = hq.y - this.camera.height / 2;

            // Clamp camera to world bounds
            this.camera.x = Math.max(0, Math.min(this.camera.x, this.worldWidth - this.camera.width));
            this.camera.y = Math.max(0, Math.min(this.camera.y, this.worldHeight - this.camera.height));
        }
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
                        this.particles.push(p);
                    }
                }
            });
        }

        this.ai.update(deltaTime);

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
                    const spawnPos = this.findSpawnPosition(item.building, unitSize);

                    const unit = createUnit(
                        item.unitType,
                        spawnPos.x,
                        spawnPos.y,
                        this.playerTeam
                    );
                    this.units.push(unit);
                } else if (item.itemType === 'building') {
                    const building = createBuilding(
                        item.buildingType,
                        item.x,
                        item.y,
                        this.playerTeam
                    );
                    this.buildings.push(building);
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
            }
        });

        // Create explosion particles for dying buildings
        this.buildings.forEach(building => {
            if (building.hp <= 0) {
                this.createExplosion(building.x, building.y, building.width, building.color);
                if (building.garrison && building.garrison.length > 0) {
                    building.garrison.forEach(u => { u.hp = 0; u.garrisonedIn = null; });
                    building.garrison = [];
                }
            }
        });

        this.nukes.forEach(n => n.update(deltaTime));
        this.shockwaves.forEach(s => s.update(deltaTime));

        this.units = this.units.filter(unit => unit.hp > 0);

        // Clear selected building reference if it was destroyed
        if (this.selectedBuilding && this.selectedBuilding.hp <= 0) {
            this.selectedBuilding.selected = false;
            this.selectedBuilding = null;
            this.updateUI();
        }

        this.buildings = this.buildings.filter(building => building.hp > 0);
        this.projectiles = this.projectiles.filter(projectile => !projectile.dead);
        this.particles = this.particles.filter(particle => particle.life > 0);
        this.nukes = this.nukes.filter(n => !n.dead);
        this.shockwaves = this.shockwaves.filter(s => s.life > 0);

        // Deposits regenerate slowly over time
        this.resourceDeposits.forEach(d => {
            if (d.amount < d.maxAmount) d.amount = Math.min(d.maxAmount, d.amount + 8 * deltaTime);
        });

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
        this.playerFog.fill(0);
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

    renderFog() {
        const ts = this.fogTileSize;
        const cam = this.camera;
        const ctx = this.ctx;

        const startTX = Math.max(0, Math.floor(cam.x / ts));
        const endTX   = Math.min(this.fogCols - 1, Math.ceil((cam.x + cam.width)  / ts));
        const startTY = Math.max(0, Math.floor(cam.y / ts));
        const endTY   = Math.min(this.fogRows - 1, Math.ceil((cam.y + cam.height) / ts));

        for (let ty = startTY; ty <= endTY; ty++) {
            for (let tx = startTX; tx <= endTX; tx++) {
                if (this.playerFog[ty * this.fogCols + tx] !== 0) continue; // explored = permanently clear
                const sx = tx * ts - cam.x;
                const sy = ty * ts - cam.y;
                ctx.fillStyle = '#000000';
                ctx.fillRect(sx, sy, ts + 1, ts + 1);
            }
        }
    }

    // ---- END FOG OF WAR ----

    checkGameEnd() {
        const playerHQ = this.buildings.find(b => b.team === this.playerTeam && b.type === 'hq');
        const enemyHQ = this.buildings.find(b => b.team === this.enemyTeam && b.type === 'hq');

        if (!playerHQ && this.gameState === 'playing') {
            this.gameState = 'lost';
            this.showGameEndScreen('DEFEAT', 'Your HQ has been destroyed!', '#f44336', false);
        } else if (!enemyHQ && this.gameState === 'playing') {
            this.gameState = 'won';
            if (this.currentMission) {
                const completed = JSON.parse(localStorage.getItem('titanwar_completed') || '[]');
                if (!completed.includes(this.currentMission.id)) {
                    completed.push(this.currentMission.id);
                    localStorage.setItem('titanwar_completed', JSON.stringify(completed));
                }
            }
            const hasNext = this.currentMission && this.currentMission.id < MISSIONS.length;
            this.showGameEndScreen('VICTORY', 'Enemy HQ destroyed!', '#4CAF50', hasNext);
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

    showCampaignScreen() {
        this.gameState = 'campaign';
        const completed = JSON.parse(localStorage.getItem('titanwar_completed') || '[]');

        const overlay = document.createElement('div');
        overlay.id = 'campaign-overlay';
        overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:2000;`;

        const diffColors = { Recruit: '#4CAF50', Corporal: '#8BC34A', Sergeant: '#FFC107', Commander: '#FF5722', General: '#F44336', 'Lieutenant Colonel': '#FF9800', Colonel: '#F44336', 'Major General': '#E91E63', 'Supreme Commander': '#FF1744', 'Brigadier General': '#D81B60', 'Field Marshal': '#C2185B', 'Grand Marshal': '#AD1457', Warlord: '#880E4F', Conqueror: '#B71C1C' };

        let missionCards = MISSIONS.map((m, i) => {
            const isUnlocked = i === 0 || completed.includes(MISSIONS[i - 1].id);
            const isDone = completed.includes(m.id);
            const dColor = diffColors[m.difficulty] || '#fff';
            return `<div onclick="window._game.startMission(${m.id})" style="background:${isUnlocked ? '#1e1e1e' : '#111'};border:2px solid ${isUnlocked ? dColor : '#333'};border-radius:8px;padding:clamp(12px,2vh,24px) clamp(14px,2vw,28px);margin:clamp(4px,0.6vmin,10px);cursor:${isUnlocked ? 'pointer' : 'default'};opacity:${isUnlocked ? 1 : 0.45};min-width:clamp(180px,18vw,300px);max-width:clamp(200px,22vw,340px);flex:1;transition:all 0.2s;" onmouseover="if(${isUnlocked})this.style.background='#2a2a2a'" onmouseout="this.style.background='${isUnlocked ? '#1e1e1e' : '#111'}'">
                <div style="color:${dColor};font-weight:bold;font-size:clamp(11px,1.4vmin,18px);letter-spacing:1px;">${m.difficulty} ${isDone ? '✓' : ''}</div>
                <div style="color:#fff;font-size:clamp(15px,2vmin,26px);font-weight:bold;margin:clamp(3px,0.5vmin,8px) 0;">${m.id}. ${m.name}</div>
                <div style="color:#aaa;font-size:clamp(10px,1.2vmin,16px);">${isUnlocked ? m.description : '🔒 Complete previous mission to unlock'}</div>
            </div>`;
        }).join('');

        overlay.innerHTML = `
            <div style="text-align:center;max-width:min(900px,90vw);width:90%;">
                <h1 style="color:#FF5722;font-size:clamp(32px,6vmin,80px);margin:0 0 clamp(4px,0.8vmin,12px);text-shadow:0 0 16px #FF5722;">TITAN WAR</h1>
                <p style="color:#888;font-size:clamp(11px,1.5vmin,20px);margin:0 0 clamp(16px,3vmin,40px);letter-spacing:2px;">CAMPAIGN</p>
                <div style="display:flex;flex-wrap:wrap;justify-content:center;">${missionCards}</div>
                <button onclick="document.getElementById('campaign-overlay').remove();window._game.startMission(1)" style="margin-top:clamp(14px,2.5vmin,32px);background:#263238;color:#aaa;border:1px solid #444;padding:clamp(8px,1.2vmin,16px) clamp(18px,3vw,36px);font-size:clamp(12px,1.5vmin,20px);border-radius:4px;cursor:pointer;width:auto;">Quick Start (Mission 1)</button>
            </div>`;

        document.body.appendChild(overlay);
        window._game = this;
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

    createExplosion(x, y, size, baseColor) {
        // Screen shake
        if (size >= 60) this.addShake(8, 0.3);
        else if (size >= 20) this.addShake(3, 0.15);
        else this.addShake(1, 0.08);

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

        // Draw static decorations (rocks, dirt patches, trees)
        this.drawDecorations();

        // Viewport culling - only render visible entities
        const buffer = 100;

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

        this.renderMinimap();
    }

    renderMinimap() {
        const ctx = this.minimapCtx;
        const width = this.minimapCanvas.width;
        const height = this.minimapCanvas.height;

        // Clear minimap
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, width, height);

        // Calculate scale
        const scaleX = width / this.worldWidth;
        const scaleY = height / this.worldHeight;

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

        // Draw units (fog-aware — enemy only shown when currently visible)
        this.units.forEach(unit => {
            if (unit.team !== this.playerTeam && !this.isVisibleToPlayer(unit.x, unit.y)) return;
            ctx.fillStyle = unit.team === this.playerTeam ? '#88ff88' : '#ff8888';
            const x = unit.x * scaleX;
            const y = unit.y * scaleY;
            ctx.fillRect(x - 1, y - 1, 2, 2);
        });

        // Fog overlay on minimap — only unexplored tiles are darkened
        const ts = this.fogTileSize;
        ctx.fillStyle = 'rgba(0,0,0,0.82)';
        for (let ty = 0; ty < this.fogRows; ty++) {
            for (let tx = 0; tx < this.fogCols; tx++) {
                if (this.playerFog[ty * this.fogCols + tx] !== 0) continue;
                ctx.fillRect(
                    tx * ts * scaleX, ty * ts * scaleY,
                    ts * scaleX + 1, ts * scaleY + 1
                );
            }
        }

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
            if (nearPlayerBase || nearEnemyBase) continue;
            const r = 12 + rng() * 10;
            const g1 = Math.floor(80 + rng()*50);
            const g2 = Math.floor(100 + rng()*60);
            this.decorations.push({ type: 'tree', x, y, radius: r,
                dark: `rgb(20,${g1},20)`, light: `rgb(30,${g2},30)` });
            treesPlaced++;
        }
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
        document.getElementById('credits').textContent = Math.floor(this.resources.credits);
        document.getElementById('power').textContent =
            `${this.resources.power}/${this.resources.maxPower}`;

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
            info = 'Left-click to select  |  Right-click to move+deselect  |  Drag to box-select';
        }
        document.getElementById('selected-info').textContent = info;

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

    gameLoop(currentTime) {
        const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.1);
        this.lastTime = currentTime;

        this.update(deltaTime);
        this.render();

        requestAnimationFrame((time) => this.gameLoop(time));
    }
}

window.addEventListener('load', () => {
    const game = new Game();
    window._game = game;
    game.showCampaignScreen();
});
