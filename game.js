import { Unit, createUnit } from './units.js';
import { Building, createBuilding } from './buildings.js';
import { InputHandler } from './input.js';
import { GameAI } from './ai.js';

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
    }

    render(ctx, camera) {
        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;

        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(screenX, screenY, this.size, 0, Math.PI * 2);
        ctx.fill();

        if (this.size > 4) {
            ctx.fillStyle = this.color + '80';
            ctx.beginPath();
            ctx.arc(screenX, screenY, this.size + 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

// ========== GAME ==========
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
        this.commandMode = null; // null | 'move' | 'attack'

        this.playerTeam = 'player';
        this.enemyTeam = 'enemy';

        this.gameState = 'playing';
        this.productionQueue = [];
        this.buildRadius = 200;

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

        const refinery = createBuilding('refinery', 350, 250, this.playerTeam);
        this.buildings.push(refinery);

        this.units.push(createUnit('soldier', 250, 250, this.playerTeam));
        this.units.push(createUnit('soldier', 280, 250, this.playerTeam));
        this.units.push(createUnit('harvester', 300, 280, this.playerTeam));

        const enemyHQ = createBuilding('hq', 2500, 1500, this.enemyTeam);
        this.buildings.push(enemyHQ);

        const enemyRefinery = createBuilding('refinery', 2350, 1550, this.enemyTeam);
        this.buildings.push(enemyRefinery);

        this.units.push(createUnit('soldier', 2450, 1450, this.enemyTeam));
        this.units.push(createUnit('soldier', 2480, 1450, this.enemyTeam));
        this.units.push(createUnit('tank', 2500, 1500, this.enemyTeam));
        this.units.push(createUnit('harvester', 2400, 1520, this.enemyTeam));

        this.updateUI();
    }

    initResourceDeposits() {
        this.resourceDeposits = [
            { x: 400, y: 300, amount: 6000 },
            { x: 500, y: 500, amount: 5000 },
            { x: 300, y: 600, amount: 4500 },
            { x: 2300, y: 1300, amount: 6000 },
            { x: 2400, y: 1600, amount: 5000 },
            { x: 2700, y: 1400, amount: 4500 },
            { x: 1100, y: 950, amount: 8000 },
            { x: 1500, y: 600, amount: 7000 },
            { x: 1850, y: 950, amount: 7000 },
            { x: 600, y: 1000, amount: 5500 },
            { x: 800, y: 1500, amount: 5000 },
            { x: 400, y: 1200, amount: 4500 },
            { x: 2200, y: 800, amount: 5500 },
            { x: 2600, y: 600, amount: 5000 },
            { x: 2400, y: 400, amount: 4500 },
            { x: 1200, y: 400, amount: 5000 },
            { x: 1800, y: 300, amount: 5000 },
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

        document.getElementById('move-mode-btn').addEventListener('click', () => this.enterMoveMode());
        document.getElementById('attack-mode-btn').addEventListener('click', () => this.enterAttackMode());
        document.getElementById('stop-btn').addEventListener('click', () => this.stopSelectedUnits());

        document.getElementById('add-money-btn').addEventListener('click', () => this.addMoney());
        document.getElementById('spawn-army-btn').addEventListener('click', () => this.spawnArmy());
        document.getElementById('nuke-enemy-btn').addEventListener('click', () => this.nukeEnemyBase());

        this.minimapCanvas.addEventListener('click', (e) => this.onMinimapClick(e));
        document.getElementById('goto-base-btn').addEventListener('click', () => this.goToBase());
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
            if (!this.isValidBuildLocation(x, y)) {
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

            const buildTime = this.buildCost / 50;
            this.productionQueue.push({
                itemType: 'building',
                buildingType: this.buildMode,
                x, y,
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
        const newBuildingSize = 60;
        for (const building of this.buildings) {
            const dx = Math.abs(x - building.x);
            const dy = Math.abs(y - building.y);
            const minDistance = (newBuildingSize + Math.max(building.width, building.height)) / 2 + 10;
            if (dx < minDistance && dy < minDistance) return false;
        }
        return true;
    }

    findSpawnPosition(building, unitSize) {
        const buildingRadius = Math.max(building.width, building.height) / 2;
        const startRadius = buildingRadius + unitSize + 10;
        const maxRadius = startRadius + 100;
        const angleStep = Math.PI / 6;

        for (let radius = startRadius; radius <= maxRadius; radius += unitSize * 2) {
            for (let angle = 0; angle < Math.PI * 2; angle += angleStep) {
                const x = building.x + Math.cos(angle) * radius;
                const y = building.y + Math.sin(angle) * radius;

                let isClear = true;
                for (const unit of this.units) {
                    const dx = x - unit.x;
                    const dy = y - unit.y;
                    if (Math.sqrt(dx * dx + dy * dy) < (unitSize + unit.size + 5)) {
                        isClear = false;
                        break;
                    }
                }

                if (isClear) return { x, y };
            }
        }

        const randomAngle = Math.random() * Math.PI * 2;
        return {
            x: building.x + Math.cos(randomAngle) * startRadius,
            y: building.y + Math.sin(randomAngle) * startRadius
        };
    }

    produceUnit(type, cost) {
        if (this.resources.credits >= cost) {
            const requirements = {
                soldier: 'barracks',
                tank: 'factory',
                sniper: 'factory',
                artillery: 'factory',
                commando: 'factory',
                harvester: 'hq'
            };

            const productionBuilding = this.buildings.find(b =>
                b.team === this.playerTeam && b.type === requirements[type]
            );

            if (productionBuilding) {
                const buildTime = cost / 50;
                this.productionQueue.push({
                    itemType: 'unit',
                    unitType: type,
                    building: productionBuilding,
                    timeRemaining: buildTime,
                    totalTime: buildTime,
                    cost
                });
                this.resources.credits -= cost;
                this.updateUI();
            }
        }
    }

    stopSelectedUnits() {
        this.selectedUnits.forEach(unit => unit.stop());
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

        ['commando', 'commando', 'sniper', 'sniper', 'artillery', 'tank', 'tank'].forEach(type => {
            const tempUnit = createUnit(type, 0, 0, this.playerTeam);
            const spawnPos = this.findSpawnPosition(hq, tempUnit.size);
            this.units.push(createUnit(type, spawnPos.x, spawnPos.y, this.playerTeam));
        });

        this.updateUI();
    }

    nukeEnemyBase() {
        this.units.filter(u => u.team === this.enemyTeam).forEach(u => { u.hp -= 999; });
        this.buildings.filter(b => b.team === this.enemyTeam).forEach(b => { b.hp -= 999; });
    }

    onMinimapClick(e) {
        const rect = this.minimapCanvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        const worldX = clickX * (this.worldWidth / this.minimapCanvas.width);
        const worldY = clickY * (this.worldHeight / this.minimapCanvas.height);

        this.camera.x = Math.max(0, Math.min(worldX - this.camera.width / 2, this.worldWidth - this.camera.width));
        this.camera.y = Math.max(0, Math.min(worldY - this.camera.height / 2, this.worldHeight - this.camera.height));
    }

    goToBase() {
        const hq = this.buildings.find(b => b.team === this.playerTeam && b.type === 'hq');
        if (hq) {
            this.camera.x = Math.max(0, Math.min(hq.x - this.camera.width / 2, this.worldWidth - this.camera.width));
            this.camera.y = Math.max(0, Math.min(hq.y - this.camera.height / 2, this.worldHeight - this.camera.height));
        }
    }

    update(deltaTime) {
        if (this.gameState !== 'playing') return;

        this.units.forEach(unit => unit.update(deltaTime, this));
        this.buildings.forEach(building => building.update(deltaTime, this));
        this.projectiles.forEach(p => p.update(deltaTime));
        this.particles.forEach(p => p.update(deltaTime));

        this.ai.update(deltaTime);

        // Process production queue
        for (let i = this.productionQueue.length - 1; i >= 0; i--) {
            const item = this.productionQueue[i];
            item.timeRemaining -= deltaTime;

            if (item.timeRemaining <= 0) {
                if (item.itemType === 'unit') {
                    const unitSizes = { soldier: 12, tank: 20, harvester: 18, sniper: 13, artillery: 25, commando: 15 };
                    const unitSize = unitSizes[item.unitType] || 12;
                    const spawnPos = this.findSpawnPosition(item.building, unitSize);
                    this.units.push(createUnit(item.unitType, spawnPos.x, spawnPos.y, this.playerTeam));
                } else if (item.itemType === 'building') {
                    this.buildings.push(createBuilding(item.buildingType, item.x, item.y, this.playerTeam));
                }
                this.productionQueue.splice(i, 1);
                this.updateUI();
            }
        }

        // Explosion particles for dying units and buildings
        this.units.filter(u => u.hp <= 0).forEach(u => this.createExplosion(u.x, u.y, u.size, u.color));
        this.buildings.filter(b => b.hp <= 0).forEach(b => this.createExplosion(b.x, b.y, b.width, b.color));

        this.units = this.units.filter(u => u.hp > 0);
        this.buildings = this.buildings.filter(b => b.hp > 0);
        this.projectiles = this.projectiles.filter(p => !p.dead);
        this.particles = this.particles.filter(p => p.life > 0);

        this.checkGameEnd();
        this.updatePower();
    }

    checkGameEnd() {
        const playerHQ = this.buildings.find(b => b.team === this.playerTeam && b.type === 'hq');
        const enemyHQ = this.buildings.find(b => b.team === this.enemyTeam && b.type === 'hq');

        if (!playerHQ && this.gameState === 'playing') {
            this.gameState = 'lost';
            this.showGameEndScreen('DEFEAT', 'Your HQ has been destroyed!', '#f44336');
        } else if (!enemyHQ && this.gameState === 'playing') {
            this.gameState = 'won';
            this.showGameEndScreen('VICTORY', 'Enemy HQ destroyed!', '#4CAF50');
        }
    }

    showGameEndScreen(title, message, color) {
        const overlay = document.createElement('div');
        overlay.id = 'game-end-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.8); display: flex; align-items: center;
            justify-content: center; z-index: 1000;
        `;

        const box = document.createElement('div');
        box.style.cssText = `
            background: #1a1a1a; border: 4px solid ${color}; border-radius: 10px;
            padding: 40px; text-align: center; max-width: 500px;
        `;
        box.innerHTML = `
            <h1 style="color:${color};font-size:48px;margin:0 0 20px;text-shadow:0 0 10px ${color};">${title}</h1>
            <p style="color:#fff;font-size:24px;margin:0 0 30px;">${message}</p>
            <button id="play-again-btn" style="background:${color};color:#fff;border:none;padding:15px 40px;
                font-size:20px;border-radius:5px;cursor:pointer;">Play Again</button>
        `;

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        document.getElementById('play-again-btn').addEventListener('click', () => this.restartGame());
    }

    restartGame() {
        const overlay = document.getElementById('game-end-overlay');
        if (overlay) overlay.remove();

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
        this.productionQueue = [];

        this.ai.credits = 1000;
        this.ai.updateTimer = 0;
        this.ai.attackTimer = 0;
        this.ai.buildTimer = 0;

        this.initResourceDeposits();
        this.init();
        this.goToBase();
    }

    createExplosion(x, y, size, baseColor) {
        const particleCount = 15 + Math.floor(Math.random() * 10);
        const colors = ['#FF4500', '#FF6347', '#FFA500', '#FFD700', '#696969'];

        for (let i = 0; i < particleCount; i++) {
            const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5);
            const speed = 2 + Math.random() * 3;
            this.particles.push(new Particle(
                x, y,
                colors[Math.floor(Math.random() * colors.length)],
                2 + Math.random() * 3,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed - 2
            ));
        }
    }

    updatePower() {
        this.resources.maxPower = this.buildings
            .filter(b => b.type === 'power' && b.team === this.playerTeam).length * 100;
        this.resources.power = this.buildings
            .filter(b => b.team === this.playerTeam && b.type !== 'power').length * 10;
    }

    render() {
        this.ctx.fillStyle = '#3a6b1f';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const buffer = 100;

        this.resourceDeposits.forEach(deposit => {
            if (deposit.amount > 0 &&
                deposit.x > this.camera.x - buffer && deposit.x < this.camera.x + this.camera.width + buffer &&
                deposit.y > this.camera.y - buffer && deposit.y < this.camera.y + this.camera.height + buffer) {
                this.drawResourceDeposit(deposit);
            }
        });

        this.buildings.forEach(building => {
            if (building.x > this.camera.x - buffer && building.x < this.camera.x + this.camera.width + buffer &&
                building.y > this.camera.y - buffer && building.y < this.camera.y + this.camera.height + buffer) {
                building.render(this.ctx, this.camera);
            }
        });

        this.units.forEach(unit => {
            if (unit.x > this.camera.x - buffer && unit.x < this.camera.x + this.camera.width + buffer &&
                unit.y > this.camera.y - buffer && unit.y < this.camera.y + this.camera.height + buffer) {
                unit.render(this.ctx, this.camera);
            }
        });

        this.projectiles.forEach(p => {
            if (p.x > this.camera.x - buffer && p.x < this.camera.x + this.camera.width + buffer &&
                p.y > this.camera.y - buffer && p.y < this.camera.y + this.camera.height + buffer) {
                p.render(this.ctx, this.camera);
            }
        });

        this.particles.forEach(p => {
            if (p.x > this.camera.x - buffer && p.x < this.camera.x + this.camera.width + buffer &&
                p.y > this.camera.y - buffer && p.y < this.camera.y + this.camera.height + buffer) {
                p.render(this.ctx, this.camera);
            }
        });

        this.input.renderSelection(this.ctx, this.camera);

        if (this.buildMode) this.drawBuildPreview();

        this.renderMinimap();
    }

    renderMinimap() {
        const ctx = this.minimapCtx;
        const width = this.minimapCanvas.width;
        const height = this.minimapCanvas.height;
        const scaleX = width / this.worldWidth;
        const scaleY = height / this.worldHeight;

        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = '#FFD700';
        this.resourceDeposits.forEach(d => {
            if (d.amount > 0) ctx.fillRect(d.x * scaleX - 1, d.y * scaleY - 1, 3, 3);
        });

        this.buildings.forEach(b => {
            ctx.fillStyle = b.team === this.playerTeam ? '#00ff00' : '#ff0000';
            ctx.fillRect(b.x * scaleX - 2, b.y * scaleY - 2, 4, 4);
        });

        this.units.forEach(u => {
            ctx.fillStyle = u.team === this.playerTeam ? '#88ff88' : '#ff8888';
            ctx.fillRect(u.x * scaleX - 1, u.y * scaleY - 1, 2, 2);
        });

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(
            this.camera.x * scaleX, this.camera.y * scaleY,
            this.camera.width * scaleX, this.camera.height * scaleY
        );

        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, width, height);
    }

    drawResourceDeposit(deposit) {
        const screenX = deposit.x - this.camera.x;
        const screenY = deposit.y - this.camera.y;

        const nuggetPositions = [
            { x: 0, y: 0, size: 12 }, { x: -10, y: -8, size: 9 }, { x: 8, y: -6, size: 10 },
            { x: -6, y: 10, size: 8 }, { x: 10, y: 8, size: 11 }, { x: 0, y: -12, size: 7 }
        ];

        nuggetPositions.forEach((nugget, index) => {
            const x = screenX + nugget.x;
            const y = screenY + nugget.y;
            const seed = deposit.x + deposit.y + index * 100;

            this.ctx.fillStyle = '#FFD700';
            this.ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2;
                const variation = 0.7 + ((Math.sin(seed + i) + 1) / 2) * 0.3;
                const radius = nugget.size * variation;
                const px = x + Math.cos(angle) * radius;
                const py = y + Math.sin(angle) * radius;
                if (i === 0) this.ctx.moveTo(px, py);
                else this.ctx.lineTo(px, py);
            }
            this.ctx.closePath();
            this.ctx.fill();

            this.ctx.strokeStyle = '#B8860B';
            this.ctx.lineWidth = 1;
            this.ctx.stroke();

            this.ctx.fillStyle = '#FFFF99';
            this.ctx.beginPath();
            this.ctx.arc(x - 2, y - 2, nugget.size * 0.3, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }

    drawBuildPreview() {
        const playerBuildings = this.buildings.filter(b => b.team === this.playerTeam);

        this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.2)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);

        playerBuildings.forEach(building => {
            this.ctx.beginPath();
            this.ctx.arc(building.x - this.camera.x, building.y - this.camera.y, this.buildRadius, 0, Math.PI * 2);
            this.ctx.stroke();
        });

        this.ctx.setLineDash([]);

        const mousePos = this.input.mouseWorldPos;
        if (mousePos) {
            const isValid = this.isValidBuildLocation(mousePos.x, mousePos.y);
            this.ctx.fillStyle = isValid ? 'rgba(0, 255, 0, 0.3)' : 'rgba(255, 0, 0, 0.3)';
            this.ctx.strokeStyle = isValid ? '#0f0' : '#f00';
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
        document.getElementById('power').textContent = `${this.resources.power}/${this.resources.maxPower}`;

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

        const hasBarracks = this.buildings.some(b => b.team === this.playerTeam && b.type === 'barracks');
        const hasFactory = this.buildings.some(b => b.team === this.playerTeam && b.type === 'factory');

        document.querySelectorAll('.unit-btn').forEach(btn => {
            const type = btn.dataset.type;
            const cost = parseInt(btn.dataset.cost);
            let canProduce = false;
            let missingBuilding = '';

            if (type === 'soldier') { canProduce = hasBarracks; missingBuilding = 'Barracks'; }
            else if (['tank', 'sniper', 'artillery', 'commando'].includes(type)) { canProduce = hasFactory; missingBuilding = 'War Factory'; }
            else if (type === 'harvester') { canProduce = true; }

            if (!canProduce || this.resources.credits < cost) {
                btn.disabled = true;
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';
                if (!canProduce) {
                    if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent;
                    btn.textContent = btn.dataset.originalText + ` (Need ${missingBuilding})`;
                }
            } else {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
                if (btn.dataset.originalText) btn.textContent = btn.dataset.originalText;
            }
        });

        const queueElement = document.getElementById('production-queue');
        if (this.productionQueue.length === 0) {
            queueElement.innerHTML = '<span style="color: #888;">Nothing in production</span>';
        } else {
            queueElement.innerHTML = this.productionQueue.map(item => {
                const progress = ((item.totalTime - item.timeRemaining) / item.totalTime) * 100;
                const itemName = item.itemType === 'unit' ? item.unitType : item.buildingType;
                const timeLeft = Math.ceil(item.timeRemaining);
                return `
                    <div style="margin-bottom:8px;">
                        <div style="display:flex;justify-content:space-between;margin-bottom:2px;">
                            <span style="text-transform:capitalize;">${itemName}</span>
                            <span style="color:#aaa;">${timeLeft}s</span>
                        </div>
                        <div style="background:#333;height:8px;border:1px solid #555;">
                            <div style="background:#4CAF50;height:100%;width:${progress}%;transition:width 0.1s;"></div>
                        </div>
                    </div>
                `;
            }).join('');
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
