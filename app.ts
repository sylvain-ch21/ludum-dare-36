/// <reference path="bower_components/phaser/typescript/phaser.d.ts" />
// import * as Phaser from 'phaser'

const TOP = 1;
const BOTTOM = 2;
const LEFT = 4;
const RIGHT = 8;
const EMPTY = -16;
const SINK_EMITTER = 3; 
const IMAGE_FOLDER = 'images/';

const ZOOM = 2;

const SINK_GID = 20;
const WATER_COLOR = 0x1dcbe5;
const WATER_BORDER_COLOR = 0xffffff;
const WATER_MIN_ALPHA = 0.3;
const WATER_MAX_ALPHA = 0.7;
const WATER_PER_SOURCE = 12;
const WATER_PER_SINK = 6;
const WATER_SINK_THRESH = 50;
const WATER_MAX = 100;
const WATER_RATE = 0.8;

const WATER_SPREAD_THRESH = 10;
const WATER_DISP_THRESH = 4;

module AqueductGame {
    function sourceFilter(x: number, y: number) : (s: Phaser.Sprite) => boolean {
        return function (s: Phaser.Sprite) : boolean {
            var sx = s.x / 32;
            var sy = (s.y + 20) / 28;
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
        emitters: Phaser.Particles.Arcade.Emitter[] // {[where: number]: Phaser.Particles.Arcade.Emitter};
    }

    export class GameState extends Phaser.State {
        game: Phaser.Game;
        map: Phaser.Tilemap;
        floorLayer: Phaser.TilemapLayer;
        wallLayer: Phaser.TilemapLayer;
        sinks: Phaser.Group;
        sources: Phaser.Group;
        water: WaterData[][];
        waterLayer: Phaser.Graphics;
        
        constructor() {
            super();
        }

        preload() {
            this.load.tilemap('test', 'maps/test.json', null, Phaser.Tilemap.TILED_JSON);
            this.load.spritesheet('tiles', IMAGE_FOLDER + 'tiles.png', 32, 48);
            this.load.spritesheet('walls', IMAGE_FOLDER + 'walls.png', 32, 48);
            this.load.image('particle', IMAGE_FOLDER + 'particle.png');
        }

        create() {
            this.stage.backgroundColor = '#787878';

            this.map = this.add.tilemap('test');
            this.map.addTilesetImage('tiles', 'tiles');
            this.map.addTilesetImage('walls', 'walls');

            this.floorLayer = this.map.createLayer('floor');
            this.wallLayer = this.map.createLayer('walls');

            this.sinks = this.add.group()
            this.sinks.y += 40
            this.sinks.scale.set(ZOOM)
            this.map.createFromObjects('sinks', SINK_GID, 'tiles', 4, true, false, this.sinks)

            this.sources = this.add.group()
            this.sources.y = 40
            this.sources.scale.set(ZOOM)
            this.map.createFromObjects('sources', SINK_GID, 'tiles', 4, true, false, this.sources)

            this.floorLayer.setScale(ZOOM)
            this.wallLayer.setScale(ZOOM)

            this.wallLayer.resizeWorld();

            this.waterLayer = this.add.graphics(0, 0);
            this.waterLayer.scale.set(ZOOM, ZOOM);
            this.waterLayer.alpha = 0.6;

            this.sources.forEach(function (source) {
                var sx = source.x / 32;
                var sy = (source.y + 20) / 28;
                this.createFountainEmitter(sx, sy, false);
            }, this)

            this.input.addMoveCallback(() => this.getTileProperties(), this);

            this.water = [];
            for(var x = 0; x < this.map.width; x++) {
                this.water[x] = [];
                for(var y: number = 0; y < this.map.height; y++) {
                    var wall = this.map.getTile(x, y, this.wallLayer);
                    var data = new WaterData();
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
        }

        update() {
            this.game.input.update();

            const h = this.map.height - 1;
            const w = this.map.width - 1;
            const delta = this.time.elapsed / 1000;

            let wDelta = []

            
            for(var x = 0; x < this.map.width; x++) {
                wDelta[x] = []
                for(var y: number = 0; y < this.map.height; y++) {
                    wDelta[x][y] = 0
                }
            }

            for(var x = 0; x < this.map.width; x++) {
                for(var y: number = 0; y < this.map.height; y++) {
                    var water = this.water[x][y];
                    if (water.isSource) water.level += WATER_PER_SOURCE * delta;
                    if (water.isSink &&  water.level > WATER_SINK_THRESH) water.level -= WATER_PER_SINK * delta;

                    var top    = ((water.blocked & TOP)    && y > 0 && (this.water[x][y-1].blocked & BOTTOM)) ? 1 : 0;
                    var bottom = ((water.blocked & BOTTOM) && y < h && (this.water[x][y+1].blocked & TOP))    ? 1 : 0;
                    var left   = ((water.blocked & LEFT)   && x > 0 && (this.water[x-1][y].blocked & RIGHT))  ? 1 : 0;
                    var right  = ((water.blocked & RIGHT)  && x < w && (this.water[x+1][y].blocked & LEFT))   ? 1 : 0;

                    if (water.level >= WATER_SPREAD_THRESH && (top || bottom || left || right)) {
                        const total = top + bottom + left + right;
                        if (top) {
                            let diff = water.level - this.water[x][y-1].level;
                            if (diff > 0) {
                                let rate = WATER_RATE * diff / total * delta;
                                wDelta[x][y] -= rate
                                wDelta[x][y-1] += rate
                            }
                        }
                        if (bottom) {
                            let diff = water.level - this.water[x][y+1].level;
                            if (diff > 0) {
                                let rate = WATER_RATE * diff / total * delta;
                                wDelta[x][y] -= rate
                                wDelta[x][y+1] += rate
                            }
                        }
                        if (left) {
                            let diff = water.level - this.water[x-1][y].level;
                            if (diff > 0) {
                                let rate = WATER_RATE * diff / total * delta;
                                wDelta[x][y] -= rate
                                wDelta[x-1][y] += rate
                            }
                        }
                        if (right) {
                            let diff = water.level - this.water[x+1][y].level;
                            if (diff > 0) {
                                let rate = WATER_RATE * diff / total * delta;
                                wDelta[x][y] -= rate
                                wDelta[x+1][y] += rate
                            }
                        }
                    }

                    if (water.level >= WATER_DISP_THRESH) {
                        if (top) {
                            if (this.water[x][y-1].level < WATER_DISP_THRESH) {
                                if (!(TOP in water.emitters)) {
                                    water.emitters[TOP] = this.createFoamEmitter(x, y, TOP);
                                }
                            } else if (TOP in water.emitters) {
                                water.emitters[TOP].destroy();
                                delete water.emitters[TOP]; 
                            }
                        }
                        if (bottom) {
                            if (this.water[x][y+1].level < WATER_DISP_THRESH) {
                                if (water.emitters[BOTTOM] === undefined) {
                                    water.emitters[BOTTOM] = this.createFoamEmitter(x, y, BOTTOM);
                                }
                            } else if (water.emitters[BOTTOM] !== undefined) {
                                water.emitters[BOTTOM].destroy();
                                delete water.emitters[BOTTOM]; 
                            }
                        }
                        if (left) {
                            if (this.water[x-1][y].level < WATER_DISP_THRESH) {
                                if (!(LEFT in water.emitters)) {
                                    water.emitters[LEFT] = this.createFoamEmitter(x, y, LEFT);
                                }
                            } else if (LEFT in water.emitters) {
                                water.emitters[LEFT].destroy();
                                delete water.emitters[LEFT]; 
                            }
                        }
                        if (right) {
                            if (this.water[x+1][y].level < WATER_DISP_THRESH) {
                                if (!(RIGHT in water.emitters)) {
                                    water.emitters[RIGHT] = this.createFoamEmitter(x, y, RIGHT);
                                }
                            } else if (RIGHT in water.emitters) {
                                water.emitters[RIGHT].destroy();
                                delete water.emitters[RIGHT]; 
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
                }
            }

            this.waterLayer.clear();
            for(var x = 0; x < this.map.width; x++) {
                for(var y: number = 0; y < this.map.height; y++) {
                    let water = this.water[x][y];
                    water.level += wDelta[x][y];

                    if (water.level < 0) water.level = 0; 
                    if (water.level > WATER_MAX) water.level = WATER_MAX;

                    this.renderWater(x, y, water.level, water.blocked)

                    let rightFoam = water
                }
            }
        }

        createFountainEmitter(x, y, isSink) {
            var ex = x * 32 + 16;  
            var ey = y * 28 + 14; 
            var emitter = this.add.emitter(ex, ey, 100)
            emitter.scale.set(ZOOM, ZOOM)
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

        createFoamEmitter(x, y, dir) {
            var ex = x * 32;  
            var ey = y * 28;  
            var h = 1, w = 1
            if (dir === BOTTOM || dir === TOP) {
                ex += 16
                w = 14
                if (dir == BOTTOM) {
                    ey += 28
                }
            }   
            if (dir === LEFT || dir === RIGHT) {
                ey += 14
                h = 14
                if (dir == RIGHT) {
                    ex += 32
                }
            }  
            var emitter = this.add.emitter(ex, ey, 100)
            emitter.scale.set(ZOOM, ZOOM)
            emitter.makeParticles('particle');
            emitter.gravity = 0.5;
            (emitter as any).area.height = h;
            (emitter as any).area.width = w;
            emitter.setAlpha(1.0, 0.0, 3000, Phaser.Easing.Quadratic.Out)
            emitter.minParticleSpeed.setTo(-0.5, -0.5)
            emitter.maxParticleSpeed.setTo(0.5, 0.5)
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
            var x = (this.wallLayer as any).getTileX(this.input.activePointer.worldX / ZOOM);
            var y = (this.wallLayer as any).getTileY(this.input.activePointer.worldY / ZOOM);

            var tile = this.map.getTile(x, y, this.wallLayer);

            if (tile) {
                let level = this.water[x][y].level;
                this.game.debug.text('Water level: '+ level, 16, 570);
            } else {
                this.game.debug.text('Water level: -', 16, 570);
            }
        }
    }

    export class SimpleGame {
        game: Phaser.Game;

        constructor() {
            this.game = new Phaser.Game(800, 600, Phaser.WEBGL, 'content');

            this.game.state.add("GameState", GameState, false);
            this.game.state.start("GameState", true, true);
        }

    }
}

window.onload = () => {
    var game = new AqueductGame.SimpleGame();
};