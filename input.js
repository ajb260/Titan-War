export class InputHandler {
    constructor(game) {
        this.game = game;
        this.canvas = game.canvas;

        // Mouse state
        this.mouseX = 0;
        this.mouseY = 0;
        this.mouseWorldPos = null;
        this.mouseDown = false;
        this.dragStart = null;
        this.dragEnd = null;

        // Camera drag
        this.cameraDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        this.setupListeners();
    }

    setupListeners() {
        // Mouse events
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.onRightClick(e);
        });

        // Keyboard events
        window.addEventListener('keydown', (e) => this.onKeyDown(e));

        // Mouse wheel for camera zoom (future feature)
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
        });
    }

    onMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouseX = e.clientX - rect.left;
        this.mouseY = e.clientY - rect.top;

        if (e.button === 1) { // Middle mouse button
            this.cameraDragging = true;
            this.lastMouseX = this.mouseX;
            this.lastMouseY = this.mouseY;
            return;
        }

        if (e.button === 0) { // Left click
            // Check if in build mode
            if (this.game.buildMode) {
                const worldX = this.mouseX + this.game.camera.x;
                const worldY = this.mouseY + this.game.camera.y;
                this.game.placeBuilding(worldX, worldY);
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

        // Camera dragging with middle mouse
        if (this.cameraDragging) {
            const dx = this.mouseX - this.lastMouseX;
            const dy = this.mouseY - this.lastMouseY;

            this.game.camera.x -= dx;
            this.game.camera.y -= dy;

            // Clamp camera
            this.game.camera.x = Math.max(0, Math.min(this.game.camera.x,
                this.game.worldWidth - this.game.camera.width));
            this.game.camera.y = Math.max(0, Math.min(this.game.camera.y,
                this.game.worldHeight - this.game.camera.height));

            this.lastMouseX = this.mouseX;
            this.lastMouseY = this.mouseY;
            return;
        }

        // Selection dragging
        if (this.mouseDown && this.dragStart) {
            this.dragEnd = {
                x: this.mouseX + this.game.camera.x,
                y: this.mouseY + this.game.camera.y
            };
        }

        // Edge scrolling
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

                // Check if it's a click or a drag
                const isDrag = Math.abs(maxX - minX) > 5 || Math.abs(maxY - minY) > 5;

                if (isDrag) {
                    this.selectUnitsInBox(minX, minY, maxX, maxY);
                } else {
                    this.selectAtPoint(this.dragStart.x, this.dragStart.y);
                }

                this.dragStart = null;
                this.dragEnd = null;
                this.game.updateUI();
            }
        }
    }

    onRightClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldX = mouseX + this.game.camera.x;
        const worldY = mouseY + this.game.camera.y;

        // Cancel build mode
        if (this.game.buildMode) {
            this.game.buildMode = null;
            this.canvas.style.cursor = 'crosshair';
            return;
        }

        // Check if clicking on enemy
        let clickedEnemy = null;

        // Check units
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

        // Command selected units
        if (this.game.selectedUnits.length > 0) {
            this.game.selectedUnits.forEach(unit => {
                if (clickedEnemy) {
                    unit.target = clickedEnemy;
                    unit.attackMove = false;
                } else {
                    unit.moveTo(worldX, worldY);
                }
            });
        }
    }

    onKeyDown(e) {
        // ESC to cancel build mode
        if (e.key === 'Escape') {
            this.game.buildMode = null;
            this.canvas.style.cursor = 'crosshair';
        }

        // S to stop units
        if (e.key === 's' || e.key === 'S') {
            this.game.stopSelectedUnits();
        }

        // A for attack move
        if (e.key === 'a' || e.key === 'A') {
            this.game.setAttackMoveMode();
        }
    }

    selectUnitsInBox(minX, minY, maxX, maxY) {
        // Deselect all
        this.game.selectedUnits.forEach(unit => unit.selected = false);
        this.game.selectedUnits = [];

        if (this.game.selectedBuilding) {
            this.game.selectedBuilding.selected = false;
            this.game.selectedBuilding = null;
        }

        // Select units in box
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
        // Deselect all
        this.game.selectedUnits.forEach(unit => unit.selected = false);
        this.game.selectedUnits = [];

        if (this.game.selectedBuilding) {
            this.game.selectedBuilding.selected = false;
            this.game.selectedBuilding = null;
        }

        // Check units first
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

        // Check buildings
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
        // Draw selection box
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
    }
}
