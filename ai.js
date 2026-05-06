import { createUnit } from './units.js';
import { createBuilding } from './buildings.js';

export class GameAI {
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

        // Update AI every 2 seconds
        if (this.updateTimer >= 2) {
            this.updateTimer = 0;
            this.makeDecisions();
        }

        // Attack every 10 seconds
        if (this.attackTimer >= 10) {
            this.attackTimer = 0;
            this.launchAttack();
        }

        // Try to build every 5 seconds
        if (this.buildTimer >= 5) {
            this.buildTimer = 0;
            this.tryBuild();
        }

        // Gather passive income
        this.credits += deltaTime * 10;
    }

    makeDecisions() {
        const myUnits = this.game.units.filter(u => u.team === this.team);
        const myBuildings = this.game.buildings.filter(b => b.team === this.team);

        // Check if we have HQ
        const hasHQ = myBuildings.some(b => b.type === 'hq');
        if (!hasHQ) return; // AI defeated

        // Produce units if we have production buildings
        const barracks = myBuildings.find(b => b.type === 'barracks');
        const factory = myBuildings.find(b => b.type === 'factory');

        if (barracks && this.credits >= 100 && myUnits.length < 15) {
            this.produceUnit('soldier', barracks, 100);
        }

        if (factory && this.credits >= 300 && myUnits.length < 10) {
            this.produceUnit('tank', factory, 300);
        }

        // Set idle units to patrol
        myUnits.forEach(unit => {
            if (!unit.target && !unit.attackMove) {
                const dx = unit.x - unit.targetX;
                const dy = unit.y - unit.targetY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                // If reached destination, find new patrol point
                if (dist < 10) {
                    unit.targetX = 2300 + Math.random() * 400;
                    unit.targetY = 1300 + Math.random() * 400;
                    unit.attackMove = true;
                }
            }
        });
    }

    produceUnit(type, building, cost) {
        if (this.credits >= cost) {
            const unit = createUnit(
                type,
                building.x + 50,
                building.y + 50,
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

        // Build priority: power -> barracks -> factory
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

        // Find player base location
        const playerHQ = this.game.buildings.find(b => b.team === this.game.playerTeam && b.type === 'hq');

        if (playerHQ && myUnits.length >= 5) {
            // Send attack force
            const attackForce = myUnits.slice(0, Math.floor(myUnits.length * 0.7));

            attackForce.forEach(unit => {
                unit.targetX = playerHQ.x + (Math.random() - 0.5) * 100;
                unit.targetY = playerHQ.y + (Math.random() - 0.5) * 100;
                unit.attackMove = true;
            });
        }
    }
}
