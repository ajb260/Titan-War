export class InputHandler {
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

        this.hoveredEnemy = null;
        this.hoveredDeposit = null;

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
        this.canvas.addEventListener('wheel', (e) => e.preventDefault());
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
            this.dragStart = { x: worldX, y: worldY };
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
            this.game.camera.x = Math.max(0, Math.min(this.game.camera.x, this.game.worldWidth - this.game.camera.width));
            this.game.camera.y = Math.max(0, Math.min(this.game.camera.y, this.game.worldHeight - this.game.camera.height));

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

        // Update hover state for cursor feedback
        this.hoveredEnemy = null;
        this.hoveredDeposit = null;

        if (this.game.selectedUnits.length > 0 && !this.game.buildMode && !this.game.commandMode) {
            const worldX = this.mouseX + this.game.camera.x;
            const worldY = this.mouseY + this.game.camera.y;
            const hasHarvesterSelected = this.game.selectedUnits.some(u => u.type === 'harvester');

            if (hasHarvesterSelected) {
                for (const deposit of this.game.resourceDeposits) {
                    if (deposit.amount > 0) {
                        const dx = worldX - deposit.x;
                        const dy = worldY - deposit.y;
                        if (Math.sqrt(dx * dx + dy * dy) <= 25) {
                            this.hoveredDeposit = deposit;
                            break;
                        }
                    }
                }
            }

            if (!this.hoveredDeposit) {
                for (const unit of this.game.units) {
                    if (unit.team !== this.game.playerTeam) {
                        const dx = worldX - unit.x;
                        const dy = worldY - unit.y;
                        if (Math.sqrt(dx * dx + dy * dy) <= unit.size * 2) {
                            this.hoveredEnemy = unit;
                            break;
                        }
                    }
                }

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

            this.canvas.style.cursor = (this.hoveredDeposit || this.hoveredEnemy) ? 'crosshair' : 'pointer';
        } else if (!this.game.buildMode && !this.game.commandMode) {
            this.canvas.style.cursor = 'default';
        }

        // Edge scrolling
        const scrollSpeed = 5;
        const edgeSize = 50;

        if (this.mouseX < edgeSize) this.game.camera.x = Math.max(0, this.game.camera.x - scrollSpeed);
        if (this.mouseX > this.canvas.width - edgeSize) {
            this.game.camera.x = Math.min(this.game.worldWidth - this.game.camera.width, this.game.camera.x + scrollSpeed);
        }
        if (this.mouseY < edgeSize) this.game.camera.y = Math.max(0, this.game.camera.y - scrollSpeed);
        if (this.mouseY > this.canvas.height - edgeSize) {
            this.game.camera.y = Math.min(this.game.worldHeight - this.game.camera.height, this.game.camera.y + scrollSpeed);
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
                    const clickedOnFriendly = this.checkClickOnFriendly(this.dragStart.x, this.dragStart.y);
                    if (clickedOnFriendly) {
                        this.selectAtPoint(this.dragStart.x, this.dragStart.y);
                    } else if (this.game.selectedUnits.length > 0) {
                        this.executeLeftClickAction(this.dragStart.x, this.dragStart.y);
                    } else {
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
        for (const unit of this.game.units) {
            if (unit.team === this.game.playerTeam) {
                const dx = worldX - unit.x;
                const dy = worldY - unit.y;
                if (Math.sqrt(dx * dx + dy * dy) <= unit.size) return true;
            }
        }
        for (const building of this.game.buildings) {
            if (building.team === this.game.playerTeam) {
                if (worldX >= building.x - building.width / 2 &&
                    worldX <= building.x + building.width / 2 &&
                    worldY >= building.y - building.height / 2 &&
                    worldY <= building.y + building.height / 2) return true;
            }
        }
        return false;
    }

    executeLeftClickAction(worldX, worldY) {
        let clickedDeposit = null;
        const hasHarvesterSelected = this.game.selectedUnits.some(u => u.type === 'harvester');

        if (hasHarvesterSelected) {
            for (const deposit of this.game.resourceDeposits) {
                if (deposit.amount > 0) {
                    const dx = worldX - deposit.x;
                    const dy = worldY - deposit.y;
                    if (Math.sqrt(dx * dx + dy * dy) <= 25) { clickedDeposit = deposit; break; }
                }
            }
        }

        let clickedEnemy = null;

        if (!clickedDeposit) {
            for (const unit of this.game.units) {
                if (unit.team !== this.game.playerTeam) {
                    const dx = worldX - unit.x;
                    const dy = worldY - unit.y;
                    if (Math.sqrt(dx * dx + dy * dy) <= unit.size * 2) { clickedEnemy = unit; break; }
                }
            }
            if (!clickedEnemy) {
                for (const building of this.game.buildings) {
                    if (building.team !== this.game.playerTeam) {
                        if (worldX >= building.x - building.width / 2 &&
                            worldX <= building.x + building.width / 2 &&
                            worldY >= building.y - building.height / 2 &&
                            worldY <= building.y + building.height / 2) { clickedEnemy = building; break; }
                    }
                }
            }
        }

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

    onRightClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const worldX = e.clientX - rect.left + this.game.camera.x;
        const worldY = e.clientY - rect.top + this.game.camera.y;

        if (this.game.buildMode) {
            this.game.buildMode = null;
            this.canvas.style.cursor = 'crosshair';
            return;
        }

        let clickedDeposit = null;
        const hasHarvesterSelected = this.game.selectedUnits.some(u => u.type === 'harvester');

        if (hasHarvesterSelected) {
            for (const deposit of this.game.resourceDeposits) {
                if (deposit.amount > 0) {
                    const dx = worldX - deposit.x;
                    const dy = worldY - deposit.y;
                    if (Math.sqrt(dx * dx + dy * dy) <= 25) { clickedDeposit = deposit; break; }
                }
            }
        }

        let clickedEnemy = null;

        if (!clickedDeposit) {
            for (const unit of this.game.units) {
                if (unit.team !== this.game.playerTeam) {
                    const dx = worldX - unit.x;
                    const dy = worldY - unit.y;
                    if (Math.sqrt(dx * dx + dy * dy) <= unit.size) { clickedEnemy = unit; break; }
                }
            }
            if (!clickedEnemy) {
                for (const building of this.game.buildings) {
                    if (building.team !== this.game.playerTeam) {
                        if (worldX >= building.x - building.width / 2 &&
                            worldX <= building.x + building.width / 2 &&
                            worldY >= building.y - building.height / 2 &&
                            worldY <= building.y + building.height / 2) { clickedEnemy = building; break; }
                    }
                }
            }
        }

        if (this.game.selectedUnits.length > 0) {
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
    }

    executeMove(worldX, worldY) {
        this.game.selectedUnits.forEach(unit => unit.moveTo(worldX, worldY));
    }

    executeAttack(worldX, worldY) {
        let clickedEnemy = null;

        for (const unit of this.game.units) {
            if (unit.team !== this.game.playerTeam) {
                const dx = worldX - unit.x;
                const dy = worldY - unit.y;
                if (Math.sqrt(dx * dx + dy * dy) <= unit.size * 2) { clickedEnemy = unit; break; }
            }
        }
        if (!clickedEnemy) {
            for (const building of this.game.buildings) {
                if (building.team !== this.game.playerTeam) {
                    if (worldX >= building.x - building.width / 2 &&
                        worldX <= building.x + building.width / 2 &&
                        worldY >= building.y - building.height / 2 &&
                        worldY <= building.y + building.height / 2) { clickedEnemy = building; break; }
                }
            }
        }

        this.game.selectedUnits.forEach(unit => {
            if (clickedEnemy) {
                unit.target = clickedEnemy;
                unit.attackMove = false;
            } else {
                unit.moveTo(worldX, worldY);
                unit.attackMove = true;
            }
        });
    }

    onKeyDown(e) {
        if (e.key === 'Escape') {
            this.game.buildMode = null;
            this.game.commandMode = null;
            this.canvas.style.cursor = 'crosshair';
            this.game.updateUI();
        }
        if (e.key === 's' || e.key === 'S') this.game.stopSelectedUnits();
        if (e.key === 'm' || e.key === 'M') this.game.enterMoveMode();
        if (e.key === 'a' || e.key === 'A') this.game.enterAttackMode();

        const scrollSpeed = 15;
        if (e.key === 'ArrowUp') this.game.camera.y = Math.max(0, this.game.camera.y - scrollSpeed);
        if (e.key === 'ArrowDown') this.game.camera.y = Math.min(this.game.worldHeight - this.game.camera.height, this.game.camera.y + scrollSpeed);
        if (e.key === 'ArrowLeft') this.game.camera.x = Math.max(0, this.game.camera.x - scrollSpeed);
        if (e.key === 'ArrowRight') this.game.camera.x = Math.min(this.game.worldWidth - this.game.camera.width, this.game.camera.x + scrollSpeed);
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
                if (Math.sqrt(dx * dx + dy * dy) <= unit.size) {
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
            ctx.strokeRect(startX, startY, endX - startX, endY - startY);
            ctx.setLineDash([]);

            ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
            ctx.fillRect(startX, startY, endX - startX, endY - startY);
        }

        // Pulsing bullseye over hovered enemy
        if (this.hoveredEnemy && this.game.selectedUnits.length > 0) {
            const enemy = this.hoveredEnemy;
            const screenX = enemy.x - camera.x;
            const screenY = enemy.y - camera.y;
            const targetSize = enemy.size
                ? enemy.size + 10
                : Math.max(enemy.width, enemy.height) / 2 + 10;
            const pulseSize = targetSize + Math.sin(Date.now() / 200) * 3;

            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(screenX, screenY, pulseSize, 0, Math.PI * 2);
            ctx.stroke();

            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(screenX, screenY, pulseSize * 0.6, 0, Math.PI * 2);
            ctx.stroke();

            const crossSize = pulseSize * 1.2;
            ctx.lineWidth = 2;
            [[screenX, screenY - crossSize, screenX, screenY - pulseSize],
             [screenX, screenY + pulseSize, screenX, screenY + crossSize],
             [screenX - crossSize, screenY, screenX - pulseSize, screenY],
             [screenX + pulseSize, screenY, screenX + crossSize, screenY]
            ].forEach(([x1, y1, x2, y2]) => {
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            });

            ctx.fillStyle = '#ff0000';
            ctx.beginPath();
            ctx.arc(screenX, screenY, 2, 0, Math.PI * 2);
            ctx.fill();
        }

        // Gold bullseye over hovered ore deposit
        if (this.hoveredDeposit && this.game.selectedUnits.some(u => u.type === 'harvester')) {
            const deposit = this.hoveredDeposit;
            const screenX = deposit.x - camera.x;
            const screenY = deposit.y - camera.y;
            const pulseSize = 20 + Math.sin(Date.now() / 200) * 3;

            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(screenX, screenY, pulseSize, 0, Math.PI * 2);
            ctx.stroke();
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(screenX, screenY, pulseSize * 0.6, 0, Math.PI * 2);
            ctx.stroke();

            const crossSize = pulseSize * 1.2;
            [[screenX, screenY - crossSize, screenX, screenY - pulseSize],
             [screenX, screenY + pulseSize, screenX, screenY + crossSize],
             [screenX - crossSize, screenY, screenX - pulseSize, screenY],
             [screenX + pulseSize, screenY, screenX + crossSize, screenY]
            ].forEach(([x1, y1, x2, y2]) => {
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            });

            ctx.fillStyle = '#FFD700';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('⛏', screenX, screenY);
        }
    }
}
