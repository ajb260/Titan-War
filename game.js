import { Unit, createUnit } from './units.js';
import { Building, createBuilding } from './buildings.js';
import { InputHandler } from './input.js';
import { GameAI } from './ai.js';

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');

        // Game world
        this.worldWidth = 3000;
        this.worldHeight = 2000;

        // Camera
        this.camera = {
            x: 0,
            y: 0,
            width: this.canvas.width,
            height: this.canvas.height
        };

        // Game state
        this.units = [];
        this.buildings = [];
        this.resources = {
            credits: 1000,
            power: 0,
            maxPower: 0
        };

        // Selection
        this.selectedUnits = [];
        this.selectedBuilding = null;

        // Build mode
        this.buildMode = null;
        this.buildCost = 0;

        // Players
        this.playerTeam = 'player';
        this.enemyTeam = 'enemy';

        // Resource deposits
        this.resourceDeposits = [];
        this.initResourceDeposits();

        // Input handler
        this.input = new InputHandler(this);

        // AI
        this.ai = new GameAI(this);

        // Initialize
        this.init();
        this.setupEventListeners();
        this.lastTime = 0;
        this.gameLoop(0);
    }

    init() {
        // Create starting base for player
        const hq = createBuilding('hq', 200, 200, this.playerTeam);
        this.buildings.push(hq);

        // Create some starting units
        this.units.push(createUnit('soldier', 250, 250, this.playerTeam));
        this.units.push(createUnit('soldier', 280, 250, this.playerTeam));
        this.units.push(createUnit('harvester', 300, 280, this.playerTeam));

        // Create enemy base
        const enemyHQ = createBuilding('hq', 2500, 1500, this.enemyTeam);
        this.buildings.push(enemyHQ);

        // Enemy starting units
        this.units.push(createUnit('soldier', 2450, 1450, this.enemyTeam));
        this.units.push(createUnit('soldier', 2480, 1450, this.enemyTeam));
        this.units.push(createUnit('tank', 2500, 1500, this.enemyTeam));

        this.updateUI();
    }

    initResourceDeposits() {
        // Create resource deposits around the map
        this.resourceDeposits = [
            { x: 400, y: 300, amount: 5000 },
            { x: 2300, y: 1300, amount: 5000 },
            { x: 1500, y: 1000, amount: 7000 },
            { x: 800, y: 1500, amount: 4000 }
        ];
    }

    setupEventListeners() {
        // Build buttons
        document.querySelectorAll('.build-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const type = e.target.dataset.type;
                const cost = parseInt(e.target.dataset.cost);
                this.enterBuildMode(type, cost);
            });
        });

        // Unit production buttons
        document.querySelectorAll('.unit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const type = e.target.dataset.type;
                const cost = parseInt(e.target.dataset.cost);
                this.produceUnit(type, cost);
            });
        });

        // Action buttons
        document.getElementById('attack-move-btn').addEventListener('click', () => {
            this.setAttackMoveMode();
        });

        document.getElementById('stop-btn').addEventListener('click', () => {
            this.stopSelectedUnits();
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
            const building = createBuilding(this.buildMode, x, y, this.playerTeam);
            this.buildings.push(building);
            this.resources.credits -= this.buildCost;
            this.buildMode = null;
            this.canvas.style.cursor = 'crosshair';
            this.updateUI();
        }
    }

    produceUnit(type, cost) {
        if (this.resources.credits >= cost) {
            // Find a production building
            const productionBuilding = this.buildings.find(b =>
                b.team === this.playerTeam &&
                (b.type === 'barracks' || b.type === 'factory' || b.type === 'hq')
            );

            if (productionBuilding) {
                const unit = createUnit(type,
                    productionBuilding.x + 50,
                    productionBuilding.y + 50,
                    this.playerTeam
                );
                this.units.push(unit);
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

    update(deltaTime) {
        // Update units
        this.units.forEach(unit => {
            unit.update(deltaTime, this);
        });

        // Update buildings
        this.buildings.forEach(building => {
            building.update(deltaTime, this);
        });

        // Update AI
        this.ai.update(deltaTime);

        // Remove dead units
        this.units = this.units.filter(unit => unit.hp > 0);

        // Remove destroyed buildings
        this.buildings = this.buildings.filter(building => building.hp > 0);

        // Update power
        this.updatePower();
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
        // Clear canvas
        this.ctx.fillStyle = '#2d5016';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw grid
        this.drawGrid();

        // Draw resource deposits
        this.resourceDeposits.forEach(deposit => {
            if (deposit.amount > 0) {
                this.drawResourceDeposit(deposit);
            }
        });

        // Draw buildings
        this.buildings.forEach(building => {
            building.render(this.ctx, this.camera);
        });

        // Draw units
        this.units.forEach(unit => {
            unit.render(this.ctx, this.camera);
        });

        // Draw selection rectangles
        this.input.renderSelection(this.ctx, this.camera);

        // Draw build preview
        if (this.buildMode) {
            this.drawBuildPreview();
        }
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

        this.ctx.fillStyle = '#FFD700';
        this.ctx.beginPath();
        this.ctx.arc(screenX, screenY, 20, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.fillStyle = '#000';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(deposit.amount, screenX, screenY + 4);
    }

    drawBuildPreview() {
        const mousePos = this.input.mouseWorldPos;
        if (mousePos) {
            this.ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
            this.ctx.strokeStyle = '#0f0';
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

        // Update selection info
        let info = '';
        if (this.selectedUnits.length > 0) {
            info = `${this.selectedUnits.length} unit(s) selected`;
        } else if (this.selectedBuilding) {
            info = `${this.selectedBuilding.type} - HP: ${this.selectedBuilding.hp}`;
        } else {
            info = 'Select a unit or building';
        }
        document.getElementById('selected-info').textContent = info;
    }

    gameLoop(currentTime) {
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        if (deltaTime < 0.1) { // Cap at 100ms to prevent large jumps
            this.update(deltaTime);
            this.render();
        }

        requestAnimationFrame((time) => this.gameLoop(time));
    }
}

// Start the game when page loads
window.addEventListener('load', () => {
    new Game();
});
