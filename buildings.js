export class Building {
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
                maxHp: 500, width: 80, height: 80, color: '#1976D2', provides: 'command'
            },
            barracks: {
                maxHp: 300, width: 60, height: 60, color: '#388E3C', provides: 'infantry'
            },
            factory: {
                maxHp: 400, width: 70, height: 70, color: '#F57C00', provides: 'vehicles'
            },
            power: {
                maxHp: 200, width: 50, height: 50, color: '#FBC02D', provides: 'power'
            },
            refinery: {
                maxHp: 350, width: 65, height: 65, color: '#7B1FA2', provides: 'credits'
            },
            sandbag: {
                maxHp: 100, width: 50, height: 25, color: '#8B7355', provides: 'defense'
            },
            turret: {
                maxHp: 150, width: 35, height: 35, color: '#546E7A', provides: 'defense',
                damage: 15, range: 250, attackSpeed: 1.5
            }
        };

        const buildingStats = stats[type] || stats.hq;
        Object.assign(this, buildingStats);
        this.hp = this.maxHp;

        if (type === 'turret') {
            this.target = null;
            this.attackCooldown = 0;
        }
    }

    update(deltaTime, game) {
        if (this.type !== 'turret') return;

        if (this.attackCooldown > 0) {
            this.attackCooldown -= deltaTime;
        }

        if (!this.target || this.target.hp <= 0) {
            this.findTarget(game);
        }

        if (this.target) {
            const dx = this.target.x - this.x;
            const dy = this.target.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist <= this.range && this.attackCooldown <= 0) {
                game.projectiles.push({
                    x: this.x, y: this.y, target: this.target,
                    damage: this.damage, speed: 500, size: 4, color: '#FFD700',
                    type: 'turret_bullet', dead: false,
                    update(dt) {
                        if (!this.target || this.target.hp <= 0) { this.dead = true; return; }
                        const dx = this.target.x - this.x;
                        const dy = this.target.y - this.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist < this.speed * dt) {
                            this.target.hp -= this.damage; this.dead = true;
                        } else {
                            const angle = Math.atan2(dy, dx);
                            this.x += Math.cos(angle) * this.speed * dt;
                            this.y += Math.sin(angle) * this.speed * dt;
                        }
                    },
                    render(ctx, camera) {
                        ctx.fillStyle = this.color;
                        ctx.beginPath();
                        ctx.arc(this.x - camera.x, this.y - camera.y, this.size, 0, Math.PI * 2);
                        ctx.fill();
                    }
                });
                this.attackCooldown = this.attackSpeed;
            } else if (dist > this.range) {
                this.target = null;
            }
        }
    }

    findTarget(game) {
        let nearestTarget = null;
        let minDist = Infinity;

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

        if (this.type === 'sandbag') {
            ctx.fillStyle = this.color;
            for (let i = 0; i < 3; i++) {
                ctx.fillRect(screenX + (i * this.width / 3), screenY + this.height / 2, this.width / 3 - 2, this.height / 2);
            }
            for (let i = 0; i < 2; i++) {
                ctx.fillRect(screenX + this.width / 6 + (i * this.width / 3), screenY, this.width / 3 - 2, this.height / 2);
            }
            ctx.strokeStyle = this.selected ? '#fff' : '#000';
            ctx.lineWidth = this.selected ? 2 : 1;
            ctx.strokeRect(screenX, screenY, this.width, this.height);

        } else if (this.type === 'turret') {
            ctx.fillStyle = this.team === 'player' ? this.color : '#B71C1C';
            ctx.fillRect(screenX - 5, screenY + this.height * 0.6, this.width + 10, this.height * 0.4);
            ctx.beginPath();
            ctx.arc(this.x - camera.x, this.y - camera.y, this.width / 2.5, 0, Math.PI * 2);
            ctx.fill();

            let barrelAngle = 0;
            if (this.target) {
                barrelAngle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
            }
            ctx.save();
            ctx.translate(this.x - camera.x, this.y - camera.y);
            ctx.rotate(barrelAngle);
            ctx.fillStyle = '#37474F';
            ctx.fillRect(0, -3, this.width / 1.5, 6);
            ctx.restore();

            ctx.strokeStyle = this.selected ? '#fff' : '#000';
            ctx.lineWidth = this.selected ? 3 : 2;
            ctx.beginPath();
            ctx.arc(this.x - camera.x, this.y - camera.y, this.width / 2.5, 0, Math.PI * 2);
            ctx.stroke();

            if (this.selected) {
                ctx.strokeStyle = 'rgba(255, 255, 0, 0.3)';
                ctx.lineWidth = 1;
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.arc(this.x - camera.x, this.y - camera.y, this.range, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }

        } else if (this.type === 'hq') {
            ctx.fillStyle = this.team === 'player' ? this.color : '#B71C1C';
            ctx.fillRect(screenX, screenY + 15, this.width, this.height - 15);
            ctx.fillStyle = this.team === 'player' ? '#0D47A1' : '#8B0000';
            ctx.beginPath();
            ctx.moveTo(screenX - 5, screenY + 15);
            ctx.lineTo(this.x - camera.x, screenY);
            ctx.lineTo(screenX + this.width + 5, screenY + 15);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#666';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(this.x - camera.x, screenY);
            ctx.lineTo(this.x - camera.x, screenY - 15);
            ctx.stroke();
            ctx.fillStyle = this.team === 'player' ? '#00ff00' : '#ff0000';
            ctx.beginPath();
            ctx.moveTo(this.x - camera.x, screenY - 15);
            ctx.lineTo(this.x - camera.x + 10, screenY - 12);
            ctx.lineTo(this.x - camera.x, screenY - 9);
            ctx.fill();
            ctx.fillStyle = '#FFD700';
            for (let i = 0; i < 3; i++) {
                ctx.fillRect(screenX + 10 + i * 20, screenY + 25, 12, 12);
            }
            ctx.strokeStyle = this.selected ? '#fff' : '#000';
            ctx.lineWidth = this.selected ? 3 : 2;
            ctx.strokeRect(screenX, screenY + 15, this.width, this.height - 15);

        } else if (this.type === 'barracks') {
            ctx.fillStyle = this.team === 'player' ? this.color : '#B71C1C';
            ctx.fillRect(screenX, screenY, this.width, this.height);
            ctx.fillStyle = '#4E342E';
            ctx.fillRect(screenX + this.width / 2 - 10, screenY + this.height - 20, 20, 20);
            ctx.fillStyle = '#90CAF9';
            ctx.fillRect(screenX + 10, screenY + 10, 12, 10);
            ctx.fillRect(screenX + this.width - 22, screenY + 10, 12, 10);
            ctx.fillStyle = this.team === 'player' ? '#2E7D32' : '#8B0000';
            ctx.fillRect(screenX - 2, screenY, this.width + 4, 5);
            ctx.strokeStyle = this.selected ? '#fff' : '#000';
            ctx.lineWidth = this.selected ? 3 : 2;
            ctx.strokeRect(screenX, screenY, this.width, this.height);

        } else if (this.type === 'factory') {
            ctx.fillStyle = this.team === 'player' ? this.color : '#B71C1C';
            ctx.fillRect(screenX, screenY, this.width, this.height);
            ctx.fillStyle = '#424242';
            ctx.fillRect(screenX + 10, screenY + this.height - 35, this.width - 20, 30);
            ctx.strokeStyle = '#212121';
            ctx.lineWidth = 2;
            for (let i = 1; i < 4; i++) {
                ctx.beginPath();
                ctx.moveTo(screenX + 10, screenY + this.height - 35 + i * 8);
                ctx.lineTo(screenX + this.width - 10, screenY + this.height - 35 + i * 8);
                ctx.stroke();
            }
            ctx.fillStyle = '#616161';
            ctx.fillRect(screenX + this.width - 15, screenY - 10, 8, 15);
            ctx.fillStyle = 'rgba(150, 150, 150, 0.5)';
            ctx.beginPath();
            ctx.arc(screenX + this.width - 11, screenY - 12, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = this.selected ? '#fff' : '#000';
            ctx.lineWidth = this.selected ? 3 : 2;
            ctx.strokeRect(screenX, screenY, this.width, this.height);

        } else if (this.type === 'power') {
            ctx.fillStyle = this.team === 'player' ? this.color : '#B71C1C';
            ctx.fillRect(screenX, screenY + 10, this.width, this.height - 10);
            ctx.fillStyle = '#BDBDBD';
            ctx.beginPath();
            ctx.ellipse(screenX + 15, screenY + 15, 8, 15, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(screenX + this.width - 15, screenY + 15, 8, 15, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(200, 200, 200, 0.6)';
            ctx.beginPath();
            ctx.arc(screenX + 15, screenY, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(screenX + this.width - 15, screenY, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('⚡', this.x - camera.x, this.y - camera.y + 5);
            ctx.strokeStyle = this.selected ? '#fff' : '#000';
            ctx.lineWidth = this.selected ? 3 : 2;
            ctx.strokeRect(screenX, screenY + 10, this.width, this.height - 10);

        } else if (this.type === 'refinery') {
            ctx.fillStyle = this.team === 'player' ? this.color : '#B71C1C';
            ctx.fillRect(screenX, screenY + 15, this.width, this.height - 15);
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
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('$', this.x - camera.x, this.y - camera.y + 5);
            ctx.strokeStyle = this.selected ? '#fff' : '#000';
            ctx.lineWidth = this.selected ? 3 : 2;
            ctx.strokeRect(screenX, screenY + 15, this.width, this.height - 15);

        } else {
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

        // Health bar (all buildings)
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

export function createBuilding(type, x, y, team) {
    return new Building(type, x, y, team);
}
