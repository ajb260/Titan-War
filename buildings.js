export class Building {
    constructor(type, x, y, team) {
        this.type = type;
        this.x = x;
        this.y = y;
        this.team = team;
        this.selected = false;

        // Set stats based on type
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
            }
        };

        const buildingStats = stats[type] || stats.hq;
        Object.assign(this, buildingStats);
        this.hp = this.maxHp;
    }

    update(deltaTime, game) {
        // Buildings can have passive effects here
        // For now, they're mostly static
    }

    render(ctx, camera) {
        const screenX = this.x - camera.x - this.width / 2;
        const screenY = this.y - camera.y - this.height / 2;

        // Draw building
        ctx.fillStyle = this.team === 'player' ? this.color : '#B71C1C';
        ctx.fillRect(screenX, screenY, this.width, this.height);

        // Draw border
        ctx.strokeStyle = this.selected ? '#fff' : '#000';
        ctx.lineWidth = this.selected ? 3 : 2;
        ctx.strokeRect(screenX, screenY, this.width, this.height);

        // Draw type indicator
        ctx.fillStyle = '#fff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.type.toUpperCase(), this.x - camera.x, this.y - camera.y + 4);

        // Draw health bar
        const barWidth = this.width;
        const barHeight = 6;
        const barX = screenX;
        const barY = screenY - 10;

        ctx.fillStyle = '#333';
        ctx.fillRect(barX, barY, barWidth, barHeight);

        ctx.fillStyle = this.hp > this.maxHp * 0.3 ? '#4CAF50' : '#f44336';
        ctx.fillRect(barX, barY, barWidth * (this.hp / this.maxHp), barHeight);

        // Draw team indicator
        ctx.fillStyle = this.team === 'player' ? '#00ff00' : '#ff0000';
        ctx.beginPath();
        ctx.arc(screenX + 5, screenY + 5, 4, 0, Math.PI * 2);
        ctx.fill();
    }
}

export function createBuilding(type, x, y, team) {
    return new Building(type, x, y, team);
}
