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
    constructor(x, y, target, damage, speed, size, color, type) {
        this.x = x;
        this.y = y;
        this.target = target;
        this.damage = damage;
        this.speed = speed;
        this.size = size;
        this.color = color;
        this.type = type;
        this.dead = false;
    }

    update(deltaTime) {
        if (!this.target || this.target.hp <= 0) {
            this.dead = true;
            return;
        }

        // Move toward target
        const dx = this.target.x - this.x;
        const dy = this.target.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < this.speed * deltaTime) {
            // Hit the target
            this.target.hp -= this.damage;
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
                canCrush: false
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
                canCrush: true
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
                canCrush: true
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
                canCrush: false
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
                canCrush: true
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
                canCrush: false
            }
        };

        const unitStats = stats[type] || stats.soldier;
        Object.assign(this, unitStats);
        this.hp = this.maxHp;
        this.attackCooldown = 0;

        // Harvester-specific properties
        if (type === 'harvester') {
            this.targetDeposit = null; // Specific deposit to mine
            this.isMining = false; // Track mining state for animation
            this.shovelAngle = 0; // Shovel animation angle
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
        if (this.type === 'harvester' && this.team === game.playerTeam) {
            this.updateHarvester(deltaTime, game);
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
                game.resources.credits += this.carrying;
                this.carrying = 0;
                game.updateUI();
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
        const detectionRange = 200; // Shorter range for auto-aggro

        game.units.forEach(unit => {
            if (unit.team !== this.team && unit.type !== 'harvester') {
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
            this.attackMove = false; // Clear attack-move mode when auto-engaging
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
            // Create a projectile instead of instant damage
            const projectile = this.createProjectile(target);
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
        }

        return new Projectile(
            this.x,
            this.y,
            target,
            this.damage,
            speed,
            size,
            color,
            projectileType
        );
    }

    render(ctx, camera) {
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
            ctx.beginPath();
            ctx.arc(screenX, screenY, this.size + 3, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Health bar
        const barWidth = this.size * 2;
        const barHeight = 4;
        const barX = screenX - barWidth / 2;
        const barY = screenY - this.size - 8;

        ctx.fillStyle = '#333';
        ctx.fillRect(barX, barY, barWidth, barHeight);

        ctx.fillStyle = this.hp > this.maxHp * 0.3 ? '#4CAF50' : '#f44336';
        ctx.fillRect(barX, barY, barWidth * (this.hp / this.maxHp), barHeight);

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
                provides: 'command'
            },
            barracks: {
                maxHp: 300,
                width: 60,
                height: 60,
                color: '#388E3C',
                provides: 'infantry'
            },
            factory: {
                maxHp: 400,
                width: 70,
                height: 70,
                color: '#F57C00',
                provides: 'vehicles'
            },
            power: {
                maxHp: 200,
                width: 50,
                height: 50,
                color: '#FBC02D',
                provides: 'power'
            },
            refinery: {
                maxHp: 350,
                width: 65,
                height: 65,
                color: '#7B1FA2',
                provides: 'credits'
            },
            sandbag: {
                maxHp: 100,
                width: 50,
                height: 25,
                color: '#8B7355',
                provides: 'defense'
            },
            turret: {
                maxHp: 150,
                width: 35,
                height: 35,
                color: '#546E7A',
                provides: 'defense',
                damage: 15,
                range: 250,
                attackSpeed: 1.5
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

        // Health bar (for all buildings)
        const barWidth = this.width;
        const barHeight = 6;
        const barX = screenX;
        const barY = screenY - 10;

        ctx.fillStyle = '#333';
        ctx.fillRect(barX, barY, barWidth, barHeight);

        ctx.fillStyle = this.hp > this.maxHp * 0.3 ? '#4CAF50' : '#f44336';
        ctx.fillRect(barX, barY, barWidth * (this.hp / this.maxHp), barHeight);
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

        this.hoveredEnemy = null; // Track which enemy is being hovered
        this.hoveredDeposit = null; // Track which ore deposit is being hovered

        this.setupListeners();
    }

    setupListeners() {
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.onRightClick(e);
        });

        window.addEventListener('keydown', (e) => this.onKeyDown(e));

        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
        });
    }

    onMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouseX = e.clientX - rect.left;
        this.mouseY = e.clientY - rect.top;

        if (e.button === 1) {
            this.cameraDragging = true;
            this.lastMouseX = this.mouseX;
            this.lastMouseY = this.mouseY;
            return;
        }

        if (e.button === 0) {
            const worldX = this.mouseX + this.game.camera.x;
            const worldY = this.mouseY + this.game.camera.y;

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
        const rect = this.canvas.getBoundingClientRect();
        this.mouseX = e.clientX - rect.left;
        this.mouseY = e.clientY - rect.top;

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
            if (this.hoveredDeposit || this.hoveredEnemy) {
                this.canvas.style.cursor = 'crosshair';
            } else {
                this.canvas.style.cursor = 'pointer';
            }
        } else if (!this.game.buildMode && !this.game.commandMode) {
            this.canvas.style.cursor = 'default';
        }

        const scrollSpeed = 5;
        const edgeSize = 50;

        if (this.mouseX < edgeSize) {
            this.game.camera.x = Math.max(0, this.game.camera.x - scrollSpeed);
        }
        if (this.mouseX > this.canvas.width - edgeSize) {
            this.game.camera.x = Math.min(
                this.game.worldWidth - this.game.camera.width,
                this.game.camera.x + scrollSpeed
            );
        }
        if (this.mouseY < edgeSize) {
            this.game.camera.y = Math.max(0, this.game.camera.y - scrollSpeed);
        }
        if (this.mouseY > this.canvas.height - edgeSize) {
            this.game.camera.y = Math.min(
                this.game.worldHeight - this.game.camera.height,
                this.game.camera.y + scrollSpeed
            );
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
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldX = mouseX + this.game.camera.x;
        const worldY = mouseY + this.game.camera.y;

        if (this.game.buildMode) {
            this.game.buildMode = null;
            this.canvas.style.cursor = 'crosshair';
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
            this.game.selectedUnits.forEach(unit => {
                if (clickedDeposit && unit.type === 'harvester') {
                    // Harvester - target the ore deposit
                    unit.targetDeposit = clickedDeposit;
                    // Don't reset carrying - let harvester deposit first if full, then come back
                } else if (clickedEnemy) {
                    unit.target = clickedEnemy;
                    unit.attackMove = false;
                } else {
                    unit.moveTo(worldX, worldY);
                }
            });
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
    }

    update(deltaTime) {
        this.updateTimer += deltaTime;
        this.attackTimer += deltaTime;
        this.buildTimer += deltaTime;

        if (this.updateTimer >= 2) {
            this.updateTimer = 0;
            this.makeDecisions();
        }

        if (this.attackTimer >= 10) {
            this.attackTimer = 0;
            this.launchAttack();
        }

        if (this.buildTimer >= 5) {
            this.buildTimer = 0;
            this.tryBuild();
        }

        this.credits += deltaTime * 10;
    }

    makeDecisions() {
        const myUnits = this.game.units.filter(u => u.team === this.team);
        const myBuildings = this.game.buildings.filter(b => b.team === this.team);

        const hasHQ = myBuildings.some(b => b.type === 'hq');
        if (!hasHQ) return;

        const barracks = myBuildings.find(b => b.type === 'barracks');
        const factory = myBuildings.find(b => b.type === 'factory');

        if (barracks && this.credits >= 100 && myUnits.length < 15) {
            this.produceUnit('soldier', barracks, 100);
        }

        if (factory && this.credits >= 300 && myUnits.length < 10) {
            this.produceUnit('tank', factory, 300);
        }

        myUnits.forEach(unit => {
            if (!unit.target && !unit.attackMove) {
                const dx = unit.x - unit.targetX;
                const dy = unit.y - unit.targetY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 10) {
                    const targetX = 2300 + Math.random() * 400;
                    const targetY = 1300 + Math.random() * 400;
                    unit.moveTo(targetX, targetY);
                    unit.attackMove = true;
                }
            }
        });
    }

    produceUnit(type, building, cost) {
        if (this.credits >= cost) {
            // Create temporary unit to get its size
            const tempUnit = createUnit(type, 0, 0, this.team);
            const spawnPos = this.game.findSpawnPosition(building, tempUnit.size);

            const unit = createUnit(
                type,
                spawnPos.x,
                spawnPos.y,
                this.team
            );
            this.game.units.push(unit);
            this.credits -= cost;
        }
    }

    tryBuild() {
        const myBuildings = this.game.buildings.filter(b => b.team === this.team);

        const hasBarracks = myBuildings.some(b => b.type === 'barracks');
        const hasFactory = myBuildings.some(b => b.type === 'factory');
        const hasPower = myBuildings.some(b => b.type === 'power');

        if (!hasPower && this.credits >= 200) {
            const building = createBuilding('power', 2600, 1450, this.team);
            this.game.buildings.push(building);
            this.credits -= 200;
        } else if (!hasBarracks && this.credits >= 300) {
            const building = createBuilding('barracks', 2550, 1550, this.team);
            this.game.buildings.push(building);
            this.credits -= 300;
        } else if (!hasFactory && this.credits >= 500 && hasBarracks) {
            const building = createBuilding('factory', 2650, 1500, this.team);
            this.game.buildings.push(building);
            this.credits -= 500;
        }
    }

    launchAttack() {
        const myUnits = this.game.units.filter(u => u.team === this.team && u.type !== 'harvester');

        const playerHQ = this.game.buildings.find(b => b.team === this.game.playerTeam && b.type === 'hq');

        if (playerHQ && myUnits.length >= 5) {
            const attackForce = myUnits.slice(0, Math.floor(myUnits.length * 0.7));

            attackForce.forEach(unit => {
                const targetX = playerHQ.x + (Math.random() - 0.5) * 100;
                const targetY = playerHQ.y + (Math.random() - 0.5) * 100;
                unit.moveTo(targetX, targetY);
                unit.attackMove = true;
            });
        }
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

        this.camera = {
            x: 0,
            y: 0,
            width: this.canvas.width,
            height: this.canvas.height
        };

        this.units = [];
        this.buildings = [];
        this.projectiles = [];
        this.particles = [];
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

        this.playerTeam = 'player';
        this.enemyTeam = 'enemy';

        this.gameState = 'playing'; // 'playing', 'won', 'lost'

        // Production queue system
        this.productionQueue = [];

        // Building placement restrictions
        this.buildRadius = 200; // Buildings must be within 200 pixels of existing buildings

        this.resourceDeposits = [];
        this.initResourceDeposits();

        this.input = new InputHandler(this);
        this.ai = new GameAI(this);

        this.init();
        this.setupEventListeners();
        this.lastTime = 0;
        this.gameLoop(0);
    }

    init() {
        const hq = createBuilding('hq', 200, 200, this.playerTeam);
        this.buildings.push(hq);

        // Add starting refinery so harvesters can work
        const refinery = createBuilding('refinery', 350, 250, this.playerTeam);
        this.buildings.push(refinery);

        this.units.push(createUnit('soldier', 250, 250, this.playerTeam));
        this.units.push(createUnit('soldier', 280, 250, this.playerTeam));
        this.units.push(createUnit('harvester', 300, 280, this.playerTeam));

        const enemyHQ = createBuilding('hq', 2500, 1500, this.enemyTeam);
        this.buildings.push(enemyHQ);

        // Add starting refinery for enemy so they can harvest
        const enemyRefinery = createBuilding('refinery', 2350, 1550, this.enemyTeam);
        this.buildings.push(enemyRefinery);

        this.units.push(createUnit('soldier', 2450, 1450, this.enemyTeam));
        this.units.push(createUnit('soldier', 2480, 1450, this.enemyTeam));
        this.units.push(createUnit('tank', 2500, 1500, this.enemyTeam));
        this.units.push(createUnit('harvester', 2400, 1520, this.enemyTeam));

        this.updateUI();
    }

    initResourceDeposits() {
        // Spread gold deposits throughout the map
        this.resourceDeposits = [
            // Near player base
            { x: 400, y: 300, amount: 6000 },
            { x: 500, y: 500, amount: 5000 },
            { x: 300, y: 600, amount: 4500 },

            // Near enemy base
            { x: 2300, y: 1300, amount: 6000 },
            { x: 2400, y: 1600, amount: 5000 },
            { x: 2700, y: 1400, amount: 4500 },

            // Center of map (contested) - around the lake
            { x: 1100, y: 950, amount: 8000 },  // West of lake
            { x: 1500, y: 600, amount: 7000 },  // North of lake
            { x: 1850, y: 950, amount: 7000 },  // East of lake

            // Left side
            { x: 600, y: 1000, amount: 5500 },
            { x: 800, y: 1500, amount: 5000 },
            { x: 400, y: 1200, amount: 4500 },

            // Right side
            { x: 2200, y: 800, amount: 5500 },
            { x: 2600, y: 600, amount: 5000 },
            { x: 2400, y: 400, amount: 4500 },

            // Top area
            { x: 1200, y: 400, amount: 5000 },
            { x: 1800, y: 300, amount: 5000 },

            // Bottom area
            { x: 1000, y: 1700, amount: 5000 },
            { x: 1800, y: 1800, amount: 5000 }
        ];
    }

    setupEventListeners() {
        document.querySelectorAll('.build-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const type = e.target.dataset.type;
                const cost = parseInt(e.target.dataset.cost);
                this.enterBuildMode(type, cost);
            });
        });

        document.querySelectorAll('.unit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const type = e.target.dataset.type;
                const cost = parseInt(e.target.dataset.cost);
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
        if (this.resources.credits >= cost) {
            this.buildMode = type;
            this.buildCost = cost;
            this.canvas.style.cursor = 'cell';
        }
    }

    placeBuilding(x, y) {
        if (this.buildMode && this.resources.credits >= this.buildCost) {
            // Check if position doesn't overlap with existing buildings
            if (!this.isValidBuildLocation(x, y)) {
                // Show error message
                const infoElement = document.getElementById('selected-info');
                const originalText = infoElement.textContent;
                infoElement.textContent = '⚠️ Cannot build on top of existing buildings!';
                infoElement.style.color = '#f44336';

                setTimeout(() => {
                    infoElement.textContent = originalText;
                    infoElement.style.color = '#aaa';
                }, 2000);
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

    isValidBuildLocation(x, y) {
        // Check if the new building would overlap with any existing buildings
        const newBuildingSize = 60; // Approximate building size

        for (const building of this.buildings) {
            const dx = Math.abs(x - building.x);
            const dy = Math.abs(y - building.y);

            // Check if buildings would overlap (with small buffer)
            const minDistance = (newBuildingSize + Math.max(building.width, building.height)) / 2 + 10;

            if (dx < minDistance && dy < minDistance) {
                return false; // Buildings would overlap
            }
        }

        return true; // Location is clear
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
        if (this.resources.credits >= cost) {
            // Define building requirements for each unit type
            const requirements = {
                'soldier': 'barracks',
                'tank': 'factory',
                'sniper': 'factory',
                'artillery': 'factory',
                'commando': 'factory',
                'harvester': 'hq' // Can be produced from HQ
            };

            const requiredBuilding = requirements[type];

            // Find the required building type
            const productionBuilding = this.buildings.find(b =>
                b.team === this.playerTeam && b.type === requiredBuilding
            );

            if (productionBuilding) {
                // Calculate build time based on cost (cost / 50 = seconds)
                const buildTime = cost / 50;

                // Add to production queue instead of creating instantly
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
        }
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

        this.units.forEach(unit => {
            unit.update(deltaTime, this);
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
                        commando: 15
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
            }
        });

        this.units = this.units.filter(unit => unit.hp > 0);
        this.buildings = this.buildings.filter(building => building.hp > 0);
        this.projectiles = this.projectiles.filter(projectile => !projectile.dead);
        this.particles = this.particles.filter(particle => particle.life > 0);

        // Check for victory/defeat
        this.checkGameOver();

        this.updatePower();

        // Check for win/loss conditions
        this.checkGameEnd();
    }

    checkGameEnd() {
        const playerHQ = this.buildings.find(b => b.team === this.playerTeam && b.type === 'hq');
        const enemyHQ = this.buildings.find(b => b.team === this.enemyTeam && b.type === 'hq');

        if (!playerHQ && this.gameState === 'playing') {
            // Player lost
            this.gameState = 'lost';
            this.showGameEndScreen('DEFEAT', 'Your HQ has been destroyed!', '#f44336');
        } else if (!enemyHQ && this.gameState === 'playing') {
            // Player won
            this.gameState = 'won';
            this.showGameEndScreen('VICTORY', 'Enemy HQ destroyed!', '#4CAF50');
        }
    }

    showGameEndScreen(title, message, color) {
        // Create overlay
        const overlay = document.createElement('div');
        overlay.id = 'game-end-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            animation: fadeIn 0.5s;
        `;

        // Create message box
        const messageBox = document.createElement('div');
        messageBox.style.cssText = `
            background: #1a1a1a;
            border: 4px solid ${color};
            border-radius: 10px;
            padding: 40px;
            text-align: center;
            max-width: 500px;
            animation: slideIn 0.5s;
        `;

        messageBox.innerHTML = `
            <h1 style="color: ${color}; font-size: 48px; margin: 0 0 20px 0; text-shadow: 0 0 10px ${color};">
                ${title}
            </h1>
            <p style="color: #fff; font-size: 24px; margin: 0 0 30px 0;">
                ${message}
            </p>
            <button id="play-again-btn" style="
                background: ${color};
                color: #fff;
                border: none;
                padding: 15px 40px;
                font-size: 20px;
                border-radius: 5px;
                cursor: pointer;
                transition: all 0.3s;
            ">
                Play Again
            </button>
        `;

        overlay.appendChild(messageBox);
        document.body.appendChild(overlay);

        // Add animation keyframes
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes slideIn {
                from { transform: translateY(-50px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            #play-again-btn:hover {
                transform: scale(1.1);
                box-shadow: 0 0 20px ${color};
            }
        `;
        document.head.appendChild(style);

        // Add event listener for play again button
        document.getElementById('play-again-btn').addEventListener('click', () => {
            this.restartGame();
        });
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
        this.selectedUnits = [];
        this.selectedBuilding = null;
        this.buildMode = null;
        this.commandMode = null;
        this.resources.credits = 2000;

        // Reset AI
        this.ai.credits = 1000;
        this.ai.updateTimer = 0;
        this.ai.attackTimer = 0;
        this.ai.buildTimer = 0;

        // Reinitialize resource deposits
        this.initResourceDeposits();

        // Reinitialize game
        this.init();

        // Reset camera to player base
        this.goToBase();
    }

    checkGameOver() {
        if (this.gameState !== 'playing') return;

        const playerHQ = this.buildings.find(b => b.team === this.playerTeam && b.type === 'hq');
        const enemyHQ = this.buildings.find(b => b.team === this.enemyTeam && b.type === 'hq');

        if (!playerHQ) {
            this.gameState = 'defeat';
            this.showGameOverScreen('DEFEAT', 'Your base has been destroyed!', '#f44336');
        } else if (!enemyHQ) {
            this.gameState = 'victory';
            this.showGameOverScreen('VICTORY', 'Enemy base destroyed!', '#4CAF50');
        }
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

    createExplosion(x, y, size, baseColor) {
        // Create 15-25 particles for explosion
        const particleCount = 15 + Math.floor(Math.random() * 10);
        const colors = ['#FF4500', '#FF6347', '#FFA500', '#FFD700', '#696969'];

        for (let i = 0; i < particleCount; i++) {
            const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5);
            const speed = 2 + Math.random() * 3;
            const velocityX = Math.cos(angle) * speed;
            const velocityY = Math.sin(angle) * speed - 2; // Launch upward
            const particleSize = 2 + Math.random() * 3;
            const color = colors[Math.floor(Math.random() * colors.length)];

            this.particles.push(new Particle(x, y, color, particleSize, velocityX, velocityY));
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
        // Draw ground with varied grass color
        this.ctx.fillStyle = '#3a6b1f';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Add some texture variation to the ground
        for (let i = 0; i < 50; i++) {
            const x = Math.random() * this.canvas.width;
            const y = Math.random() * this.canvas.height;
            this.ctx.fillStyle = 'rgba(50, 90, 30, 0.1)';
            this.ctx.fillRect(x, y, 40, 40);
        }

        // Grid removed for more natural look
        // this.drawGrid();

        // Viewport culling - only render visible entities
        const buffer = 100; // Extra buffer to avoid pop-in

        this.resourceDeposits.forEach(deposit => {
            if (deposit.amount > 0 &&
                deposit.x > this.camera.x - buffer &&
                deposit.x < this.camera.x + this.camera.width + buffer &&
                deposit.y > this.camera.y - buffer &&
                deposit.y < this.camera.y + this.camera.height + buffer) {
                this.drawResourceDeposit(deposit);
            }
        });

        this.buildings.forEach(building => {
            if (building.x > this.camera.x - buffer &&
                building.x < this.camera.x + this.camera.width + buffer &&
                building.y > this.camera.y - buffer &&
                building.y < this.camera.y + this.camera.height + buffer) {
                building.render(this.ctx, this.camera);
            }
        });

        this.units.forEach(unit => {
            if (unit.x > this.camera.x - buffer &&
                unit.x < this.camera.x + this.camera.width + buffer &&
                unit.y > this.camera.y - buffer &&
                unit.y < this.camera.y + this.camera.height + buffer) {
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

        this.input.renderSelection(this.ctx, this.camera);

        if (this.buildMode) {
            this.drawBuildPreview();
        }

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

        // Draw resource deposits
        ctx.fillStyle = '#FFD700';
        this.resourceDeposits.forEach(deposit => {
            if (deposit.amount > 0) {
                const x = deposit.x * scaleX;
                const y = deposit.y * scaleY;
                ctx.fillRect(x - 1, y - 1, 3, 3);
            }
        });

        // Draw buildings
        this.buildings.forEach(building => {
            if (building.team === this.playerTeam) {
                ctx.fillStyle = '#00ff00';
            } else {
                ctx.fillStyle = '#ff0000';
            }

            const x = building.x * scaleX;
            const y = building.y * scaleY;
            const size = 4;
            ctx.fillRect(x - size/2, y - size/2, size, size);
        });

        // Draw units (smaller)
        this.units.forEach(unit => {
            if (unit.team === this.playerTeam) {
                ctx.fillStyle = '#88ff88';
            } else {
                ctx.fillStyle = '#ff8888';
            }

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
    }

    drawBuildPreview() {
        // Draw build radius circles around player buildings
        const playerBuildings = this.buildings.filter(b => b.team === this.playerTeam);

        this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.2)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);

        playerBuildings.forEach(building => {
            const screenX = building.x - this.camera.x;
            const screenY = building.y - this.camera.y;

            this.ctx.beginPath();
            this.ctx.arc(screenX, screenY, this.buildRadius, 0, Math.PI * 2);
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

    updateUI() {
        document.getElementById('credits').textContent = this.resources.credits;
        document.getElementById('power').textContent =
            `${this.resources.power}/${this.resources.maxPower}`;

        let info = '';
        if (this.commandMode === 'move') {
            info = `${this.selectedUnits.length} unit(s) - Click where to MOVE`;
        } else if (this.commandMode === 'attack') {
            info = `${this.selectedUnits.length} unit(s) - Click where to ATTACK`;
        } else if (this.selectedUnits.length > 0) {
            info = `${this.selectedUnits.length} unit(s) selected - Press M to move, A to attack, or Right-click`;
        } else if (this.selectedBuilding) {
            info = `${this.selectedBuilding.type} - HP: ${this.selectedBuilding.hp}`;
        } else {
            info = 'Left-click to select units | Right-click to command';
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
            } else if (['tank', 'sniper', 'artillery', 'commando'].includes(type)) {
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
    }

    gameLoop(currentTime) {
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        if (deltaTime < 0.1) {
            this.update(deltaTime);
            this.render();
        }

        requestAnimationFrame((time) => this.gameLoop(time));
    }
}

window.addEventListener('load', () => {
    new Game();
});
