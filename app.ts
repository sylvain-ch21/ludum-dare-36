/// <reference path="bower_components/phaser/typescript/phaser.d.ts" />
// import * as Phaser from 'phaser'

const TOP = 1;
const BOTTOM = 2;
const LEFT = 4;
const RIGHT = 8;
const EMPTY = 31;
const SINK_EMITTER = 3; 
const IMAGE_FOLDER = 'images/';

const ZOOM = 2;

const SINK_GID = 20;
const WATER_COLOR = 0x1dcbe5;
const WATER_BORDER_COLOR = 0xffffff;
const WATER_PER_SOURCE = 12;
const WATER_PER_SINK = 6;
const WATER_SINK_THRESH = 10;
const WATER_MAX = 48;
const WATER_RATE = 0.5;
const WATER_EPS = 0.1

const WATER_SPREAD_THRESH = 0.1;
const WATER_DISP_THRESH = 1;

const CURSOR_UP = 4
const CURSOR_DOWN = 0
const CURSOR_LEFT = 2
const CURSOR_RIGHT = 3
const CURSOR_ERROR = 1
const CURSOR_WALL = 5

const WATERBAR_X = 7
const WATERBAR_Y = 100
const WATERBAR_RADIUS = 2
const WATERBAR_HEIGHT = 100
const WATERBAR_WIDTH = 18
const WATERBAR_PADDING = 2
const WATERBAR_COLOR = WATER_COLOR
const WATERBAR_BACKGROUND = 0x000000

module AqueductGame {
    function sourceFilter(x: number, y: number) : (s: Phaser.Sprite) => boolean {
        return function (s: Phaser.Sprite) : boolean {
            let sx = s.x / 32;
            let sy = (s.y + 20) / 28;
            return sx == x && sy == y;
        }
    }

    class WaterData {
        constructor() {
            this.level = 0;
            this.isSink = false;
            this.isSource = false;
            this.blocked = EMPTY;
            this.emitters = []
        }

        level: number;
        isSink: boolean;
        isSource: boolean;
        blocked: number;
        emitters: Phaser.Particles.Arcade.Emitter[]
    }

    export class GameState extends Phaser.State {
        game: Phaser.Game;
        map: Phaser.Tilemap;
        floorLayer: Phaser.TilemapLayer;
        wallLayer: Phaser.TilemapLayer;
        movableLayer: Phaser.TilemapLayer;
        sinks: Phaser.Group;
        sources: Phaser.Group;
        water: WaterData[][];
        waterLayer: Phaser.Graphics;
        selectedTile: Phaser.Tile;
        cursor: Phaser.Sprite;
        marker: Phaser.Sprite;
        selectedWater: WaterData;
        waterBar: Phaser.Graphics;
        
        constructor() {
            super();
        }

        preload() {
            this.load.tilemap('test', 'maps/test.json', null, Phaser.Tilemap.TILED_JSON);
            this.load.spritesheet('tiles', IMAGE_FOLDER + 'tiles.png', 32, 48);
            this.load.spritesheet('walls', IMAGE_FOLDER + 'walls.png', 32, 48);
            this.load.spritesheet('particle', IMAGE_FOLDER + 'particle.png', 8, 8);
            this.load.spritesheet('cursors', IMAGE_FOLDER + 'cursors.png', 32, 48);
        }

        create() {
            this.stage.smoothed = false;
            this.stage.backgroundColor = '#787878';
            this.game.scale.scaleMode = Phaser.ScaleManager.USER_SCALE
            this.game.scale.setUserScale(ZOOM, ZOOM, 0, 0)
            this.game.scale.refresh();

            this.map = this.add.tilemap('test');
            this.map.addTilesetImage('tiles', 'tiles');
            this.map.addTilesetImage('walls', 'walls');

            this.floorLayer = this.map.createLayer('floor');
            this.movableLayer = this.map.createLayer('movable');
            this.wallLayer = this.map.createLayer('walls');

            this.sinks = this.add.group()
            this.sinks.y += 20
            this.map.createFromObjects('sinks', SINK_GID, 'tiles', 4, true, false, this.sinks)

            this.sources = this.add.group()
            this.sources.y = 20
            this.map.createFromObjects('sources', SINK_GID, 'tiles', 4, true, false, this.sources)

            this.wallLayer.resizeWorld();

            this.waterLayer = this.add.graphics(0, 0);
            this.waterLayer.alpha = 0.6;

            this.waterBar = this.add.graphics(0, 0);

            this.sources.forEach(function (source) {
                let sx = source.x / 32;
                let sy = (source.y + 20) / 28;
                this.createFountainEmitter(sx, sy, false);
            }, this)

            this.input.addMoveCallback(() => this.getTileProperties(), this);
            this.input.onTap.add(this.onTap, this)

            this.water = [];
            for(let x = 0; x < this.map.width; x++) {
                this.water[x] = [];
                for(let y: number = 0; y < this.map.height; y++) {
                    let wall = this.map.getTile(x, y, this.wallLayer);
                    let data = new WaterData();
                    data.isSink = this.isSink(x, y);
                    data.isSource = this.isSource(x, y);
                    if (wall) {
                        data.blocked = TOP * wall.properties['top'] + 
                                       BOTTOM * wall.properties['bottom'] + 
                                       LEFT * wall.properties['left'] + 
                                       RIGHT * wall.properties['right'];
                    }
                    this.water[x][y] = data;
                }
            }

            this.marker = this.add.sprite(0, 0, 'cursors', CURSOR_WALL);
            this.marker.visible = false

            this.add.tween(this.marker).from({alpha: 0.7}).to({alpha: 0.9}, 1000, Phaser.Easing.Quadratic.InOut, true, 0, -1, true)

            this.cursor = this.add.sprite(0, 0, 'cursors', CURSOR_WALL);
            this.cursor.visible = false

            this.add.tween(this.cursor).from({alpha: 0.7}).to({alpha: 0.9}, 1000, Phaser.Easing.Quadratic.InOut, true, 0, -1, true)
        }

        update() {
            this.game.input.update();

            const h = this.map.height - 1;
            const w = this.map.width - 1;
            const delta = this.time.elapsed / 1000;

            let wDelta = []

            
            for(let x = 0; x < this.map.width; x++) {
                wDelta[x] = []
                for(let y: number = 0; y < this.map.height; y++) {
                    wDelta[x][y] = 0
                }
            }

            for(let x = 0; x < this.map.width; x++) {
                for(let y: number = 0; y < this.map.height; y++) {
                    let water = this.water[x][y];
                    if (water.isSource) water.level += WATER_PER_SOURCE * delta;
                    if (water.isSink &&  water.level > WATER_SINK_THRESH) water.level -= WATER_PER_SINK * delta;

                    let top    = ((water.blocked & TOP)    && y > 0 && (this.water[x][y-1].blocked & BOTTOM)) ? 1 : 0;
                    let bottom = ((water.blocked & BOTTOM) && y < h && (this.water[x][y+1].blocked & TOP))    ? 1 : 0;
                    let left   = ((water.blocked & LEFT)   && x > 0 && (this.water[x-1][y].blocked & RIGHT))  ? 1 : 0;
                    let right  = ((water.blocked & RIGHT)  && x < w && (this.water[x+1][y].blocked & LEFT))   ? 1 : 0;

                    if (water.level >= WATER_SPREAD_THRESH && (top || bottom || left || right)) {
                        const total = (top    && this.water[x][y-1].level - water.level < WATER_EPS? 1 : 0)
                                    + (bottom && this.water[x][y+1].level - water.level < WATER_EPS? 1 : 0)
                                    + (left   && this.water[x-1][y].level - water.level < WATER_EPS? 1 : 0)
                                    + (right  && this.water[x+1][y].level - water.level < WATER_EPS? 1 : 0)
                        let rate = WATER_RATE * WATER_PER_SOURCE * delta / total
                        
                        // if (x == 4 && y == 4)
                        //    console.log(rate, total)

                        if (top) {
                            if (this.water[x][y-1].level - water.level < WATER_EPS) {
                                let rate = Math.max(WATER_RATE * (water.level - this.water[x][y-1].level) * delta, (water.level - WATER_MAX)) / total;
                                wDelta[x][y] -= rate
                                wDelta[x][y-1] += rate
                            }
                            
                            /*
                            let diff = water.level - this.water[x][y-1].level;
                            if (diff > 0) {
                                let rate = Math.max(WATER_RATE * diff * delta, (water.level - WATER_MAX)) / total;
                                wDelta[x][y] -= rate
                                wDelta[x][y-1] += rate
                            }
                            */
                        }
                        if (bottom) {
                            if (this.water[x][y+1].level - water.level < WATER_EPS) {
                                let rate = Math.max(WATER_RATE * (water.level - this.water[x][y+1].level) * delta, (water.level - WATER_MAX)) / total;
                                wDelta[x][y] -= rate
                                wDelta[x][y+1] += rate
                            }
                            /*
                            let diff = water.level - this.water[x][y+1].level;
                            if (diff > 0) {
                                let rate = Math.max(WATER_RATE * diff * delta, (water.level - WATER_MAX)) / total;
                                wDelta[x][y] -= rate
                                wDelta[x][y+1] += rate
                            }
                            */
                        }
                        if (left) {
                            if (this.water[x-1][y].level - water.level < WATER_EPS) {
                                let rate = Math.max(WATER_RATE * (water.level - this.water[x-1][y].level) * delta, (water.level - WATER_MAX)) / total;
                                wDelta[x][y] -= rate
                                wDelta[x-1][y] += rate
                            }
                            /*
                            let diff = water.level - this.water[x-1][y].level;
                            if (diff > 0) {
                                let rate = Math.max(WATER_RATE * diff * delta, (water.level - WATER_MAX)) / total;
                                wDelta[x][y] -= rate
                                wDelta[x-1][y] += rate
                            }
                            */
                        }
                        if (right) {
                            if (this.water[x+1][y].level - water.level < WATER_EPS) {
                                let rate = Math.max(WATER_RATE * (water.level - this.water[x+1][y].level) * delta, (water.level - WATER_MAX)) / total;
                                console.log(x, y)
                                wDelta[x][y] -= rate
                                wDelta[x+1][y] += rate
                            }
                            /*
                            let diff = water.level - this.water[x+1][y].level;
                            if (diff > 0) {
                                let rate = Math.max(WATER_RATE * diff * delta, (water.level - WATER_MAX)) / total;
                                wDelta[x][y] -= rate
                                wDelta[x+1][y] += rate
                            }
                            */
                        }
                    }

                    let topClear = true
                    let bottomClear = true
                    let leftClear = true
                    let rightClear = true

                    if (water.level >= WATER_DISP_THRESH) {
                        if (top) {
                            if (this.water[x][y-1].level < WATER_DISP_THRESH) {
                                topClear = false
                                if (!(TOP in water.emitters)) {
                                    water.emitters[TOP] = this.water[x][y-1].blocked === EMPTY
                                        ? this.createWaterfallEmitter(x, y, TOP)
                                        :  this.createFoamEmitter(x, y, TOP);
                                }
                            }
                        }
                        if (bottom) {
                            if (this.water[x][y+1].level < WATER_DISP_THRESH) {
                                bottomClear = false
                                if (water.emitters[BOTTOM] === undefined) {
                                    water.emitters[BOTTOM] = this.water[x][y+1].blocked === EMPTY
                                        ? this.createWaterfallEmitter(x, y, BOTTOM)
                                        :  this.createFoamEmitter(x, y, BOTTOM);
                                }
                            }
                        }
                        if (left) {
                            if (this.water[x-1][y].level < WATER_DISP_THRESH) {
                                leftClear = false
                                if (!(LEFT in water.emitters)) {
                                    water.emitters[LEFT] = this.water[x-1][y].blocked === EMPTY
                                        ? this.createWaterfallEmitter(x, y, LEFT)
                                        :  this.createFoamEmitter(x, y, LEFT);
                                }
                            }
                        }
                        if (right) {
                            if (this.water[x+1][y].level < WATER_DISP_THRESH) {
                                rightClear = false
                                if (!(RIGHT in water.emitters)) {
                                    water.emitters[RIGHT] = this.water[x+1][y].blocked === EMPTY
                                        ? this.createWaterfallEmitter(x, y, RIGHT)
                                        :  this.createFoamEmitter(x, y, RIGHT);
                                }
                            }
                        }

                        if (water.isSink) {
                            if (water.emitters[SINK_EMITTER] === undefined) {
                                water.emitters[SINK_EMITTER] = this.createFountainEmitter(x, y, true);
                            }
                        }
                    } else if (water.isSink) {
                        if (water.emitters[SINK_EMITTER] !== undefined) {
                            water.emitters[SINK_EMITTER].destroy();
                            delete water.emitters[SINK_EMITTER];
                        }
                    }

                    if (topClear && TOP in water.emitters) {
                        water.emitters[TOP].destroy();
                        delete water.emitters[TOP]; 
                    }
                    if (bottomClear && BOTTOM in water.emitters) {
                        water.emitters[BOTTOM].destroy();
                        delete water.emitters[BOTTOM]; 
                    }
                    if (leftClear && LEFT in water.emitters) {
                        water.emitters[LEFT].destroy();
                        delete water.emitters[LEFT]; 
                    }
                    if (rightClear && RIGHT in water.emitters) {
                        water.emitters[RIGHT].destroy();
                        delete water.emitters[RIGHT]; 
                    }
                }
            }

            this.waterLayer.clear();
            for(let x = 0; x < this.map.width; x++) {
                for(let y: number = 0; y < this.map.height; y++) {
                    let water = this.water[x][y];
                    water.level += wDelta[x][y];

                    if (water.level < 0 || water.blocked === EMPTY) water.level = 0; 
                    if (water.level > WATER_MAX) water.level = WATER_MAX;

                    this.renderWater(x, y, water.level, water.blocked)
                }
            }

            this.renderWaterBar()
        }

        renderWaterBar() {
            this.waterBar.clear()

            this.waterBar.beginFill(WATERBAR_BACKGROUND)
            this.waterBar.drawRoundedRect(WATERBAR_X, WATERBAR_Y, WATERBAR_WIDTH, WATERBAR_HEIGHT, WATERBAR_RADIUS)

            if (this.selectedWater) {
                const inner = WATERBAR_HEIGHT - 2 * WATERBAR_PADDING
                const level = this.selectedWater.level / WATER_MAX
                const h = Math.round(inner * level)
                const w = WATERBAR_WIDTH - 2 * WATERBAR_PADDING
                const y = WATERBAR_Y + WATERBAR_PADDING + inner - h

                this.waterBar.beginFill(WATERBAR_COLOR)
                this.waterBar.drawRoundedRect(WATERBAR_X + WATERBAR_PADDING, y, w, h, WATERBAR_RADIUS)

                this.waterBar.alpha = 1
            } else {
                this.waterBar.alpha = 0.5
            }
        }

        onTap(position: Phaser.Pointer) {
            let x = (this.floorLayer as any).getTileX(position.worldX);
            let y = (this.floorLayer as any).getTileY(position.worldY - 20);

            let floorTile = this.map.getTile(x, y, this.floorLayer);
            let movableTile = this.map.getTile(x, y, this.movableLayer);

            if (this.selectedTile && !movableTile) {
                if (floorTile) {
                    let dx = floorTile.x - this.selectedTile.x
                    let dy = floorTile.y - this.selectedTile.y

                    if (Math.abs(dx) + Math.abs(dy) == 1) {
                        if (!floorTile.properties.collision) {
                            this.moveTile(this.selectedTile.x, this.selectedTile.y, dx, dy)
                        }
                    }
                }
                this.selectedTile = null;
            }
            else if (movableTile) {
                this.selectedTile = (this.selectedTile == movableTile || (floorTile && floorTile.properties.collision)) ? undefined : movableTile;
            }

            if (this.selectedTile) {
                this.marker.visible = true
                this.marker.x = this.selectedTile.x * 32
                this.marker.y = this.selectedTile.y * 28
            } else {
                this.marker.visible = false
            }
        }

        moveTile(x: number, y: number, dx: number, dy: number) {
            let wallTile = this.map.getTile(x, y, this.wallLayer).index
            let movableTile = this.map.getTile(x, y, this.movableLayer).index

            this.map.putTile(wallTile, x + dx, y + dy, this.wallLayer);
            this.map.putTile(movableTile, x + dx, y + dy, this.movableLayer);

            this.map.removeTile(x, y, this.wallLayer);
            this.map.removeTile(x, y, this.movableLayer);

            let waterData = this.water[x][y]
            waterData.level = 0
            this.water[x+dx][y+dy] = waterData
            this.water[x][y] = new WaterData()
        }

        createFountainEmitter(x, y, isSink) {
            let ex = x * 32 + 16;  
            let ey = y * 28 + 14; 
            let emitter = this.add.emitter(ex, ey, 100)
            emitter.makeParticles('particle');
            emitter.gravity = 2;
            (emitter as any).area.width = 10;
            (emitter as any).area.height = 8;
            emitter.setAlpha(1.0, 0.0, 1000, Phaser.Easing.Quadratic.Out)
            emitter.minParticleSpeed.setTo(-0.5, isSink? 5 : -5)
            emitter.maxParticleSpeed.setTo(0.5, isSink? 10 : -10)
            emitter.setScale(0.2, 0.2, 0.2, 0.6, 1000)
            emitter.start(false, 1000, 20)
            return emitter;
        }

        createWaterfallEmitter(x, y, dir) {
            let ex = x * 32;  
            let ey = y * 28;  
            let h = 1, w = 1
            let dx = dir === LEFT? -1 : dir === RIGHT? 1 : 0;
            let wx = 1
            let wy = 1
            let partCount = 100;
            if (dir === BOTTOM || dir === TOP) {
                ex += 16
                w = 12
                wx = 2
                if (dir == BOTTOM) {
                    partCount = 200
                    ey += 28
                } else {
                    ey += 2
                    wy = 0.4
                }
            }   
            if (dir === LEFT || dir === RIGHT) {
                ey += 14
                h = 10
                if (dir == RIGHT) {
                    ex += 32
                }
            }  
            let emitter = this.add.emitter(ex, ey, partCount)
            emitter.makeParticles('particle', [0,1,1,2,3]);
            emitter.gravity = dir === TOP? -5 : 100;
            (emitter as any).area.height = h;
            (emitter as any).area.width = w;
            emitter.setRotation(0, 0)
            emitter.setAlpha(1.0, 0.0, 1600, Phaser.Easing.Quadratic.In)
            emitter.setXSpeed(3 * dx, 7 * dx)
            emitter.setYSpeed(0, 0)
            emitter.setScale(0.3 * wx, 0.5 * wx, 1 * wy, 2 * wy, 1300)
            emitter.start(false, 1600, 10)
            return emitter;
        }

        createFoamEmitter(x, y, dir) {
            let ex = x * 32;  
            let ey = y * 28;  
            let h = 1, w = 1
            if (dir === BOTTOM || dir === TOP) {
                ex += 16
                w = 12
                if (dir == BOTTOM) {
                    ey += 28
                }
            }   
            if (dir === LEFT || dir === RIGHT) {
                ey += 14
                h = 12
                if (dir == RIGHT) {
                    ex += 32
                }
            }  
            let emitter = this.add.emitter(ex, ey, 100)
            emitter.makeParticles('particle', [0,0,0,1,1]);
            emitter.gravity = 0.2;
            (emitter as any).area.height = h;
            (emitter as any).area.width = w;
            emitter.setAlpha(1.0, 0.0, 3000, Phaser.Easing.Quadratic.Out)
            emitter.minParticleSpeed.setTo(-0.2, -0.2)
            emitter.maxParticleSpeed.setTo(0.2, 0.2)
            emitter.setScale(1, 2, 1, 2, 2000)
            emitter.start(false, 3000, 20)
            return emitter;
        }

        renderWater(x: number, y: number, level: number, blocked: number) {
            if (level >= WATER_DISP_THRESH) {
                const height = 3 - Math.round(3 * level / WATER_MAX)

                const x0 = x * 32
                const x1 = x0 + 9
                const x2 = x0 + 22

                const w1 = 10
                const w2 = 12
                const w3 = 10

                const y0 = y * 28
                const y1 = y0 + 5 + height
                const y2 = y0 + 23

                const h1 = 5 + height
                const h2 = 18 - height
                const h3 = 5
                
                this.waterLayer.beginFill(WATER_COLOR);
                this.waterLayer.drawRect(x1 + 1, y1 + 1, w2, h2 - 1);

                if (blocked & TOP) {
                    this.waterLayer.beginFill(WATER_COLOR);
                    this.waterLayer.drawRect(x1 + 1, y0, w2, h1 + 1);

                    this.waterLayer.beginFill(WATER_BORDER_COLOR);
                    this.waterLayer.drawRect(x1, y0, 1, h1);
                    this.waterLayer.drawRect(x2, y0, 1, h1);
                } else {
                    this.waterLayer.beginFill(WATER_BORDER_COLOR);
                    this.waterLayer.drawRect(x1 + 1, y1, w2, 1);
                }
                this.waterLayer.endFill();

                if (blocked & BOTTOM) {
                    this.waterLayer.beginFill(WATER_COLOR);
                    this.waterLayer.drawRect(x1 + 1, y2, w2, h3);

                    this.waterLayer.beginFill(WATER_BORDER_COLOR);
                    this.waterLayer.drawRect(x1, y2, 1, 5);
                    this.waterLayer.drawRect(x2, y2, 1, 5);
                }
                this.waterLayer.endFill();

                if (blocked & LEFT) {
                    this.waterLayer.beginFill(WATER_COLOR);
                    this.waterLayer.drawRect(x0, y1 + 1, w1, h2 - 1);

                    this.waterLayer.beginFill(WATER_BORDER_COLOR);
                    this.waterLayer.drawRect(x0, y1, w1 - 1, 1);
                } else {
                    this.waterLayer.beginFill(WATER_BORDER_COLOR);
                    this.waterLayer.drawRect(x1, y1 + 1, 1, h2 - 1);
                }

                if (blocked & RIGHT) {
                    this.waterLayer.beginFill(WATER_COLOR);
                    this.waterLayer.drawRect(x2, y1 + 1, w3, h2 - 1);

                    this.waterLayer.beginFill(WATER_BORDER_COLOR);
                    this.waterLayer.drawRect(x2 + 1, y1, w3 - 1, 1);
                } else {
                    this.waterLayer.beginFill(WATER_BORDER_COLOR);
                    this.waterLayer.drawRect(x2, y1 + 1, 1, h2 - 1);
                }

                this.waterLayer.beginFill(WATER_BORDER_COLOR);
                this.waterLayer.drawRect(x1, y1, 1, 1)
                this.waterLayer.drawRect(x2, y1, 1, 1)
            }
        }

        isSource(x: number, y: number) : boolean {
            return this.sources.filter(sourceFilter(x, y)).total > 0;
        }

        isSink(x: number, y: number) : boolean {
            return this.sinks.filter(sourceFilter(x, y)).total > 0;
        }

        getTileProperties() {
            let x = (this.wallLayer as any).getTileX(this.input.activePointer.worldX);
            let y = (this.wallLayer as any).getTileY(this.input.activePointer.worldY - 20);

            let wallTile = this.map.getTile(x, y, this.wallLayer);
            let movableTile = this.map.getTile(x, y, this.movableLayer);
            let floorTile = this.map.getTile(x, y, this.floorLayer);

            this.selectedWater = wallTile? this.water[x][y] : null;

            this.cursor.x = x * 32
            this.cursor.y = y * 28
            if (movableTile && !(floorTile && floorTile.properties.collision)) {
                this.cursor.visible = true
                this.cursor.frame = CURSOR_WALL
            } else {
                this.cursor.visible = false;
                if (this.selectedTile) {
                    let dist = Math.abs(this.selectedTile.x - x) + Math.abs(this.selectedTile.y - y);
                    if (dist === 1) {
                        if (floorTile) {
                            let collision = floorTile.properties.collision
                            if (collision) {
                                this.cursor.frame = CURSOR_ERROR
                            } else if (this.selectedTile.x > x) {
                                this.cursor.frame = CURSOR_LEFT
                            } else if (this.selectedTile.x < x) {
                                this.cursor.frame = CURSOR_RIGHT
                            } else if (this.selectedTile.y > y) {
                                this.cursor.frame = CURSOR_UP
                            } else {
                                this.cursor.frame = CURSOR_DOWN
                            }
                            this.cursor.visible = true;
                        }
                    } 
                }
            }
        }
    }

    export class SimpleGame {
        game: Phaser.Game;

        constructor() {
            this.game = new Phaser.Game(400, 300, Phaser.WEBGL, 'content');

            this.game.state.add("GameState", GameState, false);
            this.game.state.start("GameState", true, true);
        }

    }
}

window.onload = () => {
    let game = new AqueductGame.SimpleGame();
};