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

        if (this.updateTimer >= 2) {
            this.updateTimer = 0;
            this.makeDecisions();
        }

        // Attack faster when army is larger
        const combatUnits = this.game.units.filter(u => u.team === this.team && u.type !== 'harvester');
        const attackInterval = combatUnits.length >= 12 ? 6 : combatUnits.length >= 6 ? 9 : 14;
        if (this.attackTimer >= attackInterval) {
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
        const combatUnits = myUnits.filter(u => u.type !== 'harvester');
        const tanks = combatUnits.filter(u => u.type === 'tank').length;
        const snipers = combatUnits.filter(u => u.type === 'sniper').length;

        if (barracks && this.credits >= 100 && combatUnits.length < 20) {
            this.produceUnit('soldier', barracks, 100);
        }

        // Alternate between tanks and snipers for variety
        if (factory && combatUnits.length < 20) {
            if (tanks <= snipers && this.credits >= 300) {
                this.produceUnit('tank', factory, 300);
            } else if (this.credits >= 250) {
                this.produceUnit('sniper', factory, 250);
            }
        }

        // Patrol toward center and resource deposits, not just home base
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

        // Slot positions around HQ instead of hardcoded map coords
        const buildSlots = [
            { dx: 120, dy: 0 },
            { dx: 0, dy: 120 },
            { dx: -120, dy: 0 },
            { dx: 0, dy: -120 },
            { dx: 120, dy: -120 },
            { dx: -120, dy: 120 },
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

        // Build priority: refinery (income) -> power -> barracks -> factory
        if (!hasRefinery) tryPlace('refinery', 400);
        else if (!hasPower) tryPlace('power', 200);
        else if (!hasBarracks) tryPlace('barracks', 300);
        else if (!hasFactory && hasBarracks) tryPlace('factory', 500);
    }

    launchAttack() {
        const myUnits = this.game.units.filter(u => u.team === this.team && u.type !== 'harvester');
        if (myUnits.length < 3) return;

        // Prioritise economy/production buildings over HQ
        const buildingPriority = { refinery: 4, barracks: 3, factory: 3, turret: 2, power: 2, hq: 1 };
        const playerBuildings = this.game.buildings.filter(b => b.team === this.game.playerTeam);
        const target = [...playerBuildings].sort((a, b) =>
            (buildingPriority[b.type] || 0) - (buildingPriority[a.type] || 0)
        )[0];

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
}
