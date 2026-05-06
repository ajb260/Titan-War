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

        // Set stats based on type
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
                color: '#4CAF50'
            },
            tank: {
                maxHp: 150,
                speed: 40,
                damage: 25,
                range: 150,
                attackSpeed: 2.0,
                size: 20,
                color: '#795548'
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
                maxCarry: 500
            }
        };

        const unitStats = stats[type] || stats.soldier;
        Object.assign(this, unitStats);
        this.hp = this.maxHp;
        this.attackCooldown = 0;
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
        // Handle harvester behavior
        if (this.type === 'harvester' && this.team === game.playerTeam) {
            this.updateHarvester(deltaTime, game);
            return;
        }

        // Find targets if in attack move mode
        if (this.attackMove && !this.target) {
            this.findTarget(game);
        }

        // Attack target if in range
        if (this.target) {
            const dx = this.target.x - this.x;
            const dy = this.target.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (this.target.hp <= 0) {
                this.target = null;
            } else if (dist <= this.range) {
                this.attack(this.target, deltaTime);
                return;
            } else {
                // Move towards target
                this.targetX = this.target.x;
                this.targetY = this.target.y;
            }
        }

        // Move towards target position
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 2) {
            const angle = Math.atan2(dy, dx);
            this.x += Math.cos(angle) * this.speed * deltaTime;
            this.y += Math.sin(angle) * this.speed * deltaTime;
        }

        // Update attack cooldown
        if (this.attackCooldown > 0) {
            this.attackCooldown -= deltaTime;
        }
    }

    updateHarvester(deltaTime, game) {
        // Find refinery
        const refinery = game.buildings.find(b =>
            b.type === 'refinery' && b.team === this.team
        );

        if (!refinery) return;

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
        } else if (this.carrying === 0) {
            // Find nearest resource deposit
            const deposit = this.findNearestDeposit(game.resourceDeposits);
            if (deposit) {
                this.targetX = deposit.x;
                this.targetY = deposit.y;

                const dx = deposit.x - this.x;
                const dy = deposit.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 30 && deposit.amount > 0) {
                    const harvestAmount = Math.min(100 * deltaTime, deposit.amount, this.maxCarry);
                    deposit.amount -= harvestAmount;
                    this.carrying += harvestAmount;
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

    findTarget(game) {
        let nearestTarget = null;
        let minDist = Infinity;

        // Check units
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

        // Check buildings
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

    attack(target, deltaTime) {
        if (this.attackCooldown <= 0 && this.damage > 0) {
            target.hp -= this.damage;
            this.attackCooldown = this.attackSpeed;
        }
    }

    render(ctx, camera) {
        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;

        // Draw unit
        ctx.fillStyle = this.team === 'player' ? this.color : '#f44336';
        ctx.beginPath();
        ctx.arc(screenX, screenY, this.size, 0, Math.PI * 2);
        ctx.fill();

        // Draw selection circle
        if (this.selected) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(screenX, screenY, this.size + 3, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Draw health bar
        const barWidth = this.size * 2;
        const barHeight = 4;
        const barX = screenX - barWidth / 2;
        const barY = screenY - this.size - 8;

        ctx.fillStyle = '#333';
        ctx.fillRect(barX, barY, barWidth, barHeight);

        ctx.fillStyle = this.hp > this.maxHp * 0.3 ? '#4CAF50' : '#f44336';
        ctx.fillRect(barX, barY, barWidth * (this.hp / this.maxHp), barHeight);

        // Draw carrying indicator for harvesters
        if (this.type === 'harvester' && this.carrying > 0) {
            ctx.fillStyle = '#FFD700';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(Math.floor(this.carrying), screenX, screenY + this.size + 12);
        }

        // Draw target line
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
