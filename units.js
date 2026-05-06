export class Unit {
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

        if (type === 'harvester') {
            this.targetDeposit = null;
            this.isMining = false;
            this.shovelAngle = 0;
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
        if (this.type === 'harvester') {
            this.updateHarvester(deltaTime, game);
            return;
        }

        // Auto-engage nearby enemies even without an explicit attack-move order
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
                if (dist <= this.range * 0.8) {
                    this.targetX = this.x;
                    this.targetY = this.y;
                } else {
                    this.targetX = this.target.x;
                    this.targetY = this.target.y;
                }
            } else {
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

        this.handleCollisions(game);

        if (this.attackCooldown > 0) {
            this.attackCooldown -= deltaTime;
        }
    }

    handleCollisions(game) {
        for (const other of game.units) {
            if (other === this) continue;

            const dx = other.x - this.x;
            const dy = other.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const minDist = this.size + other.size;

            if (dist < minDist && dist > 0) {
                // Heavy units crush light enemy units on direct contact
                if (this.canCrush && !other.canCrush && this.team !== other.team && dist < this.size) {
                    other.hp = 0;
                    continue;
                } else if (other.canCrush && !this.canCrush && this.team !== other.team && dist < other.size) {
                    this.hp = 0;
                    continue;
                }

                // Weight-based separation so lighter units yield to heavier ones
                const overlap = minDist - dist;
                const separationForce = overlap / minDist;
                const totalWeight = this.weight + other.weight;
                const myPushRatio = other.weight / totalWeight;
                const otherPushRatio = this.weight / totalWeight;

                const separationX = (dx / dist) * separationForce * 10;
                const separationY = (dy / dist) * separationForce * 10;

                this.x -= separationX * myPushRatio;
                this.y -= separationY * myPushRatio;
                other.x += separationX * otherPushRatio;
                other.y += separationY * otherPushRatio;
            }
        }
    }

    updateHarvester(deltaTime, game) {
        const refinery = game.buildings.find(b => b.type === 'refinery' && b.team === this.team);
        if (!refinery) return;

        this.isMining = false;

        if (this.carrying >= this.maxCarry) {
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

        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 2) {
            const angle = Math.atan2(dy, dx);
            this.x += Math.cos(angle) * this.speed * deltaTime;
            this.y += Math.sin(angle) * this.speed * deltaTime;
        }

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
        const detectionRange = 200;
        let nearestEnemy = null;
        let minDist = Infinity;

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
            game.projectiles.push(projectile);
            this.attackCooldown = this.attackSpeed;
        }
    }

    createProjectile(target) {
        let speed = 400;
        let size = 3;
        let color = '#FFD700';
        let type = 'bullet';

        if (this.type === 'tank') {
            type = 'shell'; speed = 300; size = 6; color = '#FF8800';
        } else if (this.type === 'artillery') {
            type = 'artillery_shell'; speed = 250; size = 8; color = '#FF4400';
        } else if (this.type === 'sniper') {
            type = 'bullet'; speed = 600; size = 2; color = '#00FFFF';
        }

        // Projectile is a plain object; game-combined.js uses a class but
        // since modules are separate, we duck-type to match the interface
        return { x: this.x, y: this.y, target, damage: this.damage, speed, size, color, type, dead: false,
            update(deltaTime) {
                if (!this.target || this.target.hp <= 0) { this.dead = true; return; }
                const dx = this.target.x - this.x;
                const dy = this.target.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < this.speed * deltaTime) {
                    this.target.hp -= this.damage;
                    this.dead = true;
                } else {
                    const angle = Math.atan2(dy, dx);
                    this.x += Math.cos(angle) * this.speed * deltaTime;
                    this.y += Math.sin(angle) * this.speed * deltaTime;
                }
            },
            render(ctx, camera) {
                const sx = this.x - camera.x;
                const sy = this.y - camera.y;
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.arc(sx, sy, this.size, 0, Math.PI * 2);
                ctx.fill();
                if (this.size > 4) {
                    ctx.fillStyle = this.color + '80';
                    ctx.beginPath();
                    ctx.arc(sx, sy, this.size + 2, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        };
    }

    render(ctx, camera) {
        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;

        ctx.fillStyle = this.team === 'player' ? this.color : '#f44336';

        if (this.type === 'soldier' || this.type === 'sniper' || this.type === 'commando') {
            // Head
            ctx.beginPath();
            ctx.arc(screenX, screenY - this.size / 3, this.size / 3, 0, Math.PI * 2);
            ctx.fill();
            // Body
            ctx.fillRect(screenX - this.size / 3, screenY - this.size / 6, this.size * 2 / 3, this.size * 2 / 3);
            // Legs
            ctx.fillRect(screenX - this.size / 3, screenY + this.size / 2, this.size / 4, this.size / 2);
            ctx.fillRect(screenX + this.size / 12, screenY + this.size / 2, this.size / 4, this.size / 2);
        } else if (this.type === 'tank') {
            // Body
            ctx.fillRect(screenX - this.size, screenY - this.size / 2, this.size * 2, this.size);
            // Turret
            ctx.fillRect(screenX - this.size / 2, screenY - this.size, this.size, this.size / 1.5);
            // Barrel
            ctx.fillRect(screenX + this.size / 2, screenY - this.size / 3, this.size, this.size / 4);
        } else if (this.type === 'artillery') {
            // Base platform
            ctx.fillRect(screenX - this.size, screenY + this.size / 3, this.size * 2, this.size / 2);
            // Angled barrel
            ctx.save();
            ctx.translate(screenX, screenY);
            ctx.rotate(-Math.PI / 6);
            ctx.fillRect(0, -this.size / 4, this.size * 1.5, this.size / 2);
            ctx.restore();
        } else if (this.type === 'harvester') {
            // Truck body
            ctx.fillRect(screenX - this.size, screenY - this.size / 2, this.size * 1.8, this.size);
            // Cabin
            ctx.fillRect(screenX - this.size, screenY - this.size, this.size / 1.5, this.size / 2);
            // Animated shovel
            ctx.save();
            ctx.translate(screenX + this.size * 0.5, screenY);
            ctx.rotate(this.shovelAngle || 0);
            ctx.fillStyle = '#8B4513';
            ctx.fillRect(-2, 0, 4, this.size * 0.8);
            ctx.fillStyle = '#C0C0C0';
            ctx.beginPath();
            ctx.moveTo(-6, this.size * 0.8);
            ctx.lineTo(6, this.size * 0.8);
            ctx.lineTo(4, this.size * 1.1);
            ctx.lineTo(-4, this.size * 1.1);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        } else {
            ctx.beginPath();
            ctx.arc(screenX, screenY, this.size, 0, Math.PI * 2);
            ctx.fill();
        }

        if (this.selected) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(screenX, screenY, this.size + 3, 0, Math.PI * 2);
            ctx.stroke();
        }

        const barWidth = this.size * 2;
        const barHeight = 4;
        const barX = screenX - barWidth / 2;
        const barY = screenY - this.size - 8;

        ctx.fillStyle = '#333';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        ctx.fillStyle = this.hp > this.maxHp * 0.3 ? '#4CAF50' : '#f44336';
        ctx.fillRect(barX, barY, barWidth * (this.hp / this.maxHp), barHeight);

        if (this.type === 'harvester' && this.carrying > 0) {
            ctx.fillStyle = '#FFD700';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(Math.floor(this.carrying), screenX, screenY + this.size + 12);
        }

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

export function createUnit(type, x, y, team) {
    return new Unit(type, x, y, team);
}
