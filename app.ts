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

const SINK_GID = 21;
const WATER_COLOR = 0x1dcbe5;
const WATER_BORDER_COLOR = 0xffffff;
const WATER_PER_SOURCE = 12;
const WATER_PER_SINK = 6;
const WATER_MAX = 48;
const WATER_RATE = 0.5;
const WATER_EPS = 0.1

const WATER_SPREAD_THRESH = 0.1;
const WATER_DISP_THRESH = 1;
const WATER_SINK_THRESH = WATER_DISP_THRESH + (WATER_PER_SINK / 30);

const CURSOR_UP = 4
const CURSOR_DOWN = 0
const CURSOR_LEFT = 2
const CURSOR_RIGHT = 3
const CURSOR_ERROR = 1
const CURSOR_WALL_SELECTED = 5
const CURSOR_WALL = 6

const WATERBAR_X = 5
const WATERBAR_Y = 100
const WATERBAR_RADIUS = 3
const WATERBAR_HEIGHT = 100
const WATERBAR_WIDTH = 24
const WATERBAR_PADDING = 2
const WATERBAR_COLOR = WATER_COLOR
const WATERBAR_BACKGROUND = 0x000000

const WELL_GID = 16 + 7
const WELL_FULL_GID = 16 + 8

module AqueductGame {
    function newArray<T>(n: number, m: number, factory: () => T) : T[][] {
        let array = new Array<T[]>();
        for (let i = 0; i < n; i++) {
            array[i] = new Array<T>()
            for (let j = 0; j < m; j++) {
                array[i][j] = factory();
            }
        }
        return array;
    }

    class WaterData {
        constructor() {
            this.level = 0;
            this.blocked = EMPTY;
            this.emitters = []
            this.totalWater = 0;
            this.sinkWaterLimit = 0;
            this.sourceRate = 0;
        }

        level: number;
        blocked: number;
        emitters: Phaser.Particles.Arcade.Emitter[]
        totalWater: number;
        sinkWaterLimit: number;
        sourceRate: number;
    }

    export class GameState extends Phaser.State {
        game: Phaser.Game;
        map: Phaser.Tilemap;
        floorLayer: Phaser.TilemapLayer;
        wallLayer: Phaser.TilemapLayer;
        movableLayer: Phaser.TilemapLayer;
        sinks: [number, number][];
        sources: [number, number][];
        water: WaterData[][];
        waterLayer: Phaser.Graphics;
        selectedTile: Phaser.Tile;
        cursor: Phaser.Sprite;
        marker: Phaser.Sprite;
        selectedWater: [number, number, boolean];
        waterBar: Phaser.Graphics;
        winTime: number;
        startTime: number;
        level: string;
        waterIcon: Phaser.Sprite;
        wellBars: Phaser.Graphics[];
        wells: Phaser.Sprite[];
        
        constructor() {
            super();
        }

        init(level: string) {
            this.level = level;
        }

        preload() {
            this.load.tilemap('level-' + this.level, 'maps/'+this.level+'.json', null, Phaser.Tilemap.TILED_JSON);
            this.load.spritesheet('tiles', IMAGE_FOLDER + 'tiles.png', 32, 48);
            this.load.spritesheet('walls', IMAGE_FOLDER + 'walls.png', 32, 48);
            this.load.spritesheet('well', IMAGE_FOLDER + 'well.png', 32, 48);
            this.load.spritesheet('particle', IMAGE_FOLDER + 'particle.png', 8, 8);
            this.load.spritesheet('cursors', IMAGE_FOLDER + 'cursors.png', 32, 48);
            this.load.spritesheet('gui', IMAGE_FOLDER + 'gui.png', 30, 30);
        }

        create() {
            this.winTime = -1
            this.startTime = this.time.now;

            this.stage.smoothed = false;
            this.stage.backgroundColor = '#787878';

            let cursors = this.input.keyboard.createCursorKeys()

            cursors.up.onUp.add(this.onKey(0, -1), this)
            cursors.down.onUp.add(this.onKey(0, 1), this)
            cursors.left.onUp.add(this.onKey(-1, 0), this)
            cursors.right.onUp.add(this.onKey(1, 0), this)

            this.map = this.add.tilemap('level-' + this.level);
            this.map.addTilesetImage('tiles', 'tiles');
            this.map.addTilesetImage('walls', 'walls');

            this.floorLayer = this.map.createLayer('floor');            
            let wellLayer = this.add.group()
            this.movableLayer = this.map.createLayer('movable');
            this.wallLayer = this.map.createLayer('walls');

            let sinks = this.add.group()
            sinks.y += 20
            this.map.createFromObjects('sinks', SINK_GID, 'tiles', SINK_GID - 16, true, false, sinks)

            let sources = this.add.group()
            sources.y = 20
            this.map.createFromObjects('sources', SINK_GID, 'tiles', SINK_GID - 16, true, false, sources)

            this.wallLayer.resizeWorld();

            this.waterLayer = this.add.graphics(0, 0);
            this.waterLayer.alpha = 0.6;

            this.waterBar = this.add.graphics(0, 0);

            this.input.addMoveCallback(() => this.getTileProperties(), this);
            this.input.onTap.add(this.onTap, this)

            this.water = [];
            for(let x = 0; x < this.map.width; x++) {
                this.water[x] = [];
                for(let y: number = 0; y < this.map.height; y++) {
                    let wall = this.map.getTile(x, y, this.wallLayer);
                    let data = new WaterData();
                    if (wall) {
                        data.blocked = TOP * wall.properties['top'] + 
                                       BOTTOM * wall.properties['bottom'] + 
                                       LEFT * wall.properties['left'] + 
                                       RIGHT * wall.properties['right'];
                    }
                    this.water[x][y] = data;
                }
            }

            this.wellBars = []
            this.wells = []
            this.sinks = []
            sinks.forEach((s) => {
                let sx = s.x / 32;
                let sy = (s.y + 20) / 28;
                let i = this.sinks.length;
                this.sinks.push([sx, sy])
                this.water[sx][sy].sinkWaterLimit = (s as any).limit || 500
                this.wellBars[i] = this.add.graphics(s.x, s.y + 48)
                this.wells[i] = new Phaser.Sprite(this.game, s.x, s.y + 48, 'well', 0)
                wellLayer.add(this.wells[i])
                this.wells[i].visible = false
                this.wellBars[i].visible = false
            }, this)

            this.sources = []
            sources.forEach((s) => {
                let sx = s.x / 32;
                let sy = (s.y + 20) / 28;
                let rate = (s as any).rate || WATER_PER_SOURCE
                this.createFountainEmitter(sx, sy, -rate);
                this.sources.push([sx, sy])
                this.water[sx][sy].sourceRate = rate
            }, this)

            this.marker = this.add.sprite(0, 0, 'cursors', CURSOR_WALL_SELECTED);
            this.marker.visible = false

            this.add.tween(this.marker).from({alpha: 0.7}).to({alpha: 0.9}, 1000, Phaser.Easing.Quadratic.InOut, true, 0, -1, true)

            this.cursor = this.add.sprite(0, 0, 'cursors', CURSOR_WALL);
            this.cursor.visible = false

            this.add.tween(this.cursor).from({alpha: 0.7}).to({alpha: 0.9}, 1000, Phaser.Easing.Quadratic.InOut, true, 0, -1, true)

            this.add.button(285, 5, 'gui', function() { this.state.start('LevelSelectState', true, false) }, this, 0)

            this.waterIcon = this.add.sprite(WATERBAR_X + WATERBAR_WIDTH / 2, WATERBAR_Y + WATERBAR_HEIGHT + 5, 'gui', 2)
            this.waterIcon.anchor.setTo(0.5, 0)
            this.waterIcon.visible = false;
        }

        update() {
            this.game.input.update();

            const h = this.map.height - 1;
            const w = this.map.width - 1;
            const delta = this.time.elapsed / 1000;

            let globalVisited = newArray(this.map.width, this.map.height, () => false);

            this.sources.forEach(function(source) {
                let [x, y] = source
                let rate = this.water[x][y].sourceRate * delta
                this.updateWater(x, y, rate, globalVisited)
            }, this)

            while(true) {
                let maxX = -1, maxY = -1, maxLevel = 0;
            
                for(let x = 0; x < this.map.width; x++) {
                    for(let y: number = 0; y < this.map.height; y++) {
                        if (globalVisited[x][y]) continue;
                        if (this.water[x][y].blocked != EMPTY && this.water[x][y].level > maxLevel) {
                            maxX = x
                            maxY = y
                            maxLevel = this.water[x][y].level
                        }
                    }
                }


                if (maxX === -1) break;

                let spread = WATER_PER_SOURCE * delta

                this.water[maxX][maxY].level -= spread
                this.updateWater(maxX, maxY, spread, globalVisited)
            }

            for(let x = 0; x < this.map.width; x++) {
                for(let y: number = 0; y < this.map.height; y++) {
                    let water = this.water[x][y];

                    let top    = ((water.blocked & TOP)    && y > 0 && (this.water[x][y-1].blocked & BOTTOM)) ? 1 : 0;
                    let bottom = ((water.blocked & BOTTOM) && y < h && (this.water[x][y+1].blocked & TOP))    ? 1 : 0;
                    let left   = ((water.blocked & LEFT)   && x > 0 && (this.water[x-1][y].blocked & RIGHT))  ? 1 : 0;
                    let right  = ((water.blocked & RIGHT)  && x < w && (this.water[x+1][y].blocked & LEFT))   ? 1 : 0;

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
                                        : this.createFoamEmitter(x, y, TOP);
                                }
                            }
                        }
                        if (bottom) {
                            if (this.water[x][y+1].level < WATER_DISP_THRESH) {
                                bottomClear = false
                                if (water.emitters[BOTTOM] === undefined) {
                                    water.emitters[BOTTOM] = this.water[x][y+1].blocked === EMPTY
                                        ? this.createWaterfallEmitter(x, y, BOTTOM)
                                        : this.createFoamEmitter(x, y, BOTTOM);
                                }
                            }
                        }
                        if (left) {
                            if (this.water[x-1][y].level < WATER_DISP_THRESH) {
                                leftClear = false
                                if (!(LEFT in water.emitters)) {
                                    water.emitters[LEFT] = this.water[x-1][y].blocked === EMPTY
                                        ? this.createWaterfallEmitter(x, y, LEFT)
                                        : this.createFoamEmitter(x, y, LEFT);
                                }
                            }
                        }
                        if (right) {
                            if (this.water[x+1][y].level < WATER_DISP_THRESH) {
                                rightClear = false
                                if (!(RIGHT in water.emitters)) {
                                    water.emitters[RIGHT] = this.water[x+1][y].blocked === EMPTY
                                        ? this.createWaterfallEmitter(x, y, RIGHT)
                                        : this.createFoamEmitter(x, y, RIGHT);
                                }
                            }
                        }

                        if (water.sinkWaterLimit > 0) {
                            if (water.emitters[SINK_EMITTER] === undefined) {
                                water.emitters[SINK_EMITTER] = this.createFountainEmitter(x, y, WATER_PER_SINK);
                            }
                        }
                    } else if (water.sinkWaterLimit > 0) {
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

                    if (water.sinkWaterLimit > 0 && water.level >= WATER_SINK_THRESH) {
                        let gone = WATER_PER_SINK * delta
                        water.level -= gone
                        water.totalWater += gone

                        const frame = Math.min(Math.round(4 * water.totalWater / water.sinkWaterLimit), 4)

                        let sink: number
                        for (let i = 0; i < this.sinks.length; i++) {
                            if (this.sinks[i][0] === x && this.sinks[i][1] === y) {
                                sink = i;
                                break;
                            }
                        }

                        this.wells[sink].visible = true
                        this.wells[sink].frame = frame;
                    }

                    if (water.level < 0 || water.blocked === EMPTY) water.level = 0; 
                    if (water.level > WATER_MAX) water.level = WATER_MAX;

                    this.renderWater(x, y, water.level, water.blocked)
                }
            }

            this.renderWaterBar()
            this.renderWellBars()

            if (this.winTime < 0) {
                let won = true
                this.sinks.forEach(function([sx, sy]) {
                    if (this.water[sx][sy].totalWater < this.water[sx][sy].sinkWaterLimit) {
                        won = false;
                    }
                }, this);

                if (won) {
                    this.winTime = this.time.now
                    this.showWinText()
                }
            }
        }

        showWinText() {
            let bar = this.add.graphics(0, 0);
            bar.beginFill(0x000000, 0.7);
            bar.drawRect(0, 100, 320, 100);

            let seconds : any = Math.round((this.winTime - this.startTime) / 1000)
            let minutes = Math.floor(seconds / 60)
            seconds %= 60

            if (seconds < 10) {
                seconds = '0' + seconds.toString(10)
            }

            let text = this.add.text(0, 0, 'You won', { font: "bold 32px Roman", fill: "#fff", boundsAlignH: "center", boundsAlignV: "middle" });
            text.setShadow(3, 3, 'rgba(0,0,0,0.5)', 2);
            text.setTextBounds(0, 100, 320, 100);

            let timeText = this.add.text(0, 0, 'Time: ' + minutes + ':' + seconds, { font: "bold 16px Roman", fill: "#fff", boundsAlignH: "center", boundsAlignV: "middle" });
            timeText.setShadow(3, 3, 'rgba(0,0,0,0.5)', 2);
            timeText.setTextBounds(0, 180, 320, 20);

            this.cursor.visible = false
            this.marker.visible = false
            this.waterBar.visible = false
        }

        updateWater(x: number, y: number, amount: number, globalVisited: boolean[][]) {
            const h = this.map.height - 1;
            const w = this.map.width - 1;

            let visited = newArray(this.map.width, this.map.height, () => false);
            let queued = newArray(this.map.width, this.map.height, () => false);

            queued[x][y] = true

            let queue = [[x, y, amount]]

            while (queue.length > 0) {
                let [x, y, amount] = queue.shift()
                let water = this.water[x][y];
                water.level += amount

                visited[x][y] = true
                globalVisited[x][y] = true

                if (water.blocked === EMPTY) continue;

                let top    = ((water.blocked & TOP)    && y > 0 && (this.water[x][y-1].blocked & BOTTOM)) ? 1 : 0;
                let bottom = ((water.blocked & BOTTOM) && y < h && (this.water[x][y+1].blocked & TOP))    ? 1 : 0;
                let left   = ((water.blocked & LEFT)   && x > 0 && (this.water[x-1][y].blocked & RIGHT))  ? 1 : 0;
                let right  = ((water.blocked & RIGHT)  && x < w && (this.water[x+1][y].blocked & LEFT))   ? 1 : 0;

                if (top && (visited[x][y-1] || this.water[x][y-1].level >= water.level)) {
                    top = 0;
                }
                if (bottom && (visited[x][y+1] || this.water[x][y+1].level >= water.level)) {
                    bottom = 0;
                }
                if (left && (visited[x-1][y] || this.water[x-1][y].level >= water.level)) {
                    left = 0;
                }
                if (right && (visited[x+1][y] || this.water[x+1][y].level >= water.level)) {
                    right = 0;
                }

                let total = top + bottom + left + right;
                let spread = amount * WATER_RATE

                if (water.level > WATER_MAX) {
                    spread += water.level - WATER_MAX
                }

                water.level -= spread

                if (top && !queued[x][y-1]) {
                    queue.push([x, y-1, spread / total])
                    queued[x][y-1] = true
                }
                if (bottom && !queued[x][y+1]) {
                    queue.push([x, y+1, spread / total])
                    queued[x][y+1] = true
                }
                if (left && !queued[x-1][y]) {
                    queue.push([x-1, y, spread / total])
                    queued[x-1][y] = true
                }
                if (right && !queued[x+1][y]) {
                    queue.push([x+1, y, spread / total])
                    queued[x+1][y] = true
                }
            }
        }

        renderWaterBar() {
            if (!this.selectedWater || this.winTime > 0) {
                this.waterBar.visible = false
                this.waterIcon.visible = false
            } else {
                let [wx, wy, isWell] = this.selectedWater
                let sw = this.water[wx][wy] 

                this.waterBar.clear()

                this.waterBar.beginFill(WATERBAR_BACKGROUND)
                this.waterBar.drawRoundedRect(WATERBAR_X, WATERBAR_Y, WATERBAR_WIDTH, WATERBAR_HEIGHT, WATERBAR_RADIUS)

                if (sw.level > WATER_EPS) {
                    const inner = WATERBAR_HEIGHT - 2 * WATERBAR_PADDING
                    const level = Math.min(isWell ? sw.totalWater / sw.sinkWaterLimit : sw.level / WATER_MAX, 1)
                    const h = Math.round(inner * level)
                    const w = WATERBAR_WIDTH - 2 * WATERBAR_PADDING
                    const x = WATERBAR_X + WATERBAR_PADDING
                    const y = WATERBAR_Y + WATERBAR_PADDING + inner - h

                    this.waterBar.beginFill(WATERBAR_COLOR)
                    if ( h > WATERBAR_RADIUS)
                    {
                        this.waterBar.drawRoundedRect(x, y, w, h, WATERBAR_RADIUS)
                    } else {
                        this.waterBar.drawRect(x + WATERBAR_RADIUS, y, w - 2* WATERBAR_RADIUS, h)
                    }

                    this.waterBar.alpha = 1
                } else {
                    this.waterBar.alpha = 0.5
                }
                this.waterBar.visible = true
                this.waterIcon.visible = true
            }
        }

        renderWellBars() {
            this.wellBars.forEach((bar, i) => {
                let [sx, sy] = this.sinks[i]
                let water = this.water[sx][sy]

                if (this.selectedWater && this.selectedWater[2] && this.selectedWater[0] === sx && this.selectedWater[1] === sy) {
                    if (bar.children.length == 0)
                        bar.visible = false
                } else if (water.totalWater > 0) {
                    bar.visible = true
                    bar.clear()

                    const level = water.totalWater / water.sinkWaterLimit

                    if (level >= 1) {
                        if (bar.children.length == 0) {
                            let icon = new Phaser.Sprite(this.game, 16, 14, 'gui', 1)
                            icon.anchor.setTo(0.5, 0.5)
                            this.add.tween(icon).to({y: '+5'}, 1500, Phaser.Easing.Quadratic.InOut, true, 0, -1, true)
                            bar.addChild(icon)
                        }
                    } else {
                        bar.beginFill(WATERBAR_BACKGROUND)
                        bar.drawRoundedRect(1, 0, 30, 8, 3)
                    
                        let w = Math.round(level * 28)
                        
                        bar.beginFill(WATERBAR_COLOR)
                        if (w > 3)
                            bar.drawRoundedRect(2, 1, w, 6, 3)
                        else
                            bar.drawRect(2, 2, w, 4)
                    }
                }
            });
        }

        onTap(position: Phaser.Pointer) {
            if (this.winTime > 0) {
                this.game.state.start('LevelSelectState', true, true)
            }            

            let x = (this.floorLayer as any).getTileX(position.worldX);
            let y = (this.floorLayer as any).getTileY(position.worldY);
            let movableTile = this.map.getTile(x, y, this.movableLayer);

            if (!movableTile || (this.selectedTile && (Math.abs(x - this.selectedTile.x) <= 1 || (x - this.selectedTile.x == 0 && y - this.selectedTile.y === 0)))) {
                y = (this.floorLayer as any).getTileY(position.worldY - 20)
            }

            this.tryMoveTile(x, y, true)
        }

        onKey(dx: number, dy: number) : () => void {
            return function() {
                if (this.selectedTile) {
                    this.tryMoveTile(this.selectedTile.x + dx, this.selectedTile.y + dy, false);
                }
            }
        }

        tryMoveTile(x: number, y: number, allowSelect: boolean) {
            console.log(x, y)
            let movableTile = this.map.getTile(x, y, this.movableLayer);
            let floorTile = this.map.getTile(x, y, this.floorLayer);
            let wallTile = this.map.getTile(x, y, this.wallLayer);

            if (this.selectedTile && !movableTile) {
                let st = this.selectedTile
                if (allowSelect)
                    this.selectedTile = null;
                if (floorTile) {
                    let dx = floorTile.x - st.x
                    let dy = floorTile.y - st.y

                    console.log(dx, dy)

                    if (Math.abs(dx) + Math.abs(dy) == 1) {
                        if (!floorTile.properties.collision) {
                            this.selectedTile = this.moveTile(st.x, st.y, dx, dy)
                            this.cursor.visible = false
                        }
                    }
                }
            }
            else if (movableTile && allowSelect) {
                this.selectedTile = (floorTile && floorTile.properties.collision) ? undefined : movableTile;
            }

            if (this.selectedTile && this.winTime < 0) {
                this.marker.visible = true
                this.marker.x = this.selectedTile.x * 32
                this.marker.y = this.selectedTile.y * 28
            } else {
                this.marker.visible = false
            }
        }

        moveTile(x: number, y: number, dx: number, dy: number) : Phaser.Tile {
            let wallTile = this.map.getTile(x, y, this.wallLayer).index
            let movableTile = this.map.getTile(x, y, this.movableLayer).index

            this.map.putTile(wallTile, x + dx, y + dy, this.wallLayer);
            this.map.putTile(movableTile, x + dx, y + dy, this.movableLayer);

            this.map.removeTile(x, y, this.wallLayer);
            this.map.removeTile(x, y, this.movableLayer);

            let waterData = this.water[x][y]
            // waterData.level = 0
            for (var key in waterData.emitters) {
                if (waterData.emitters[key]) {
                    waterData.emitters[key].destroy();
                    delete waterData.emitters[key];                    
                }
            }
            this.water[x+dx][y+dy] = waterData
            this.water[x][y] = new WaterData()

            return this.map.getTile(x + dx, y + dy, this.movableLayer)
        }

        createFountainEmitter(x: number, y: number, rate: number) {
            let sign = rate > 0? 1 : -1;
            let ex = x * 32 + 16;  
            let ey = y * 28 + 14; 
            let emitter = this.add.emitter(ex, ey, 100)
            emitter.makeParticles('particle');
            emitter.gravity = 2;
            (emitter as any).area.width = 10;
            (emitter as any).area.height = 8;
            emitter.setAlpha(1.0, 0.0, 1000, Phaser.Easing.Quadratic.Out)
            emitter.minParticleSpeed.setTo(-0.5, rate * 0.5)
            emitter.maxParticleSpeed.setTo(0.5, rate)
            emitter.setScale(0.2, 0.2, 0.2, 0.6, 1000)
            emitter.start(false, 1000, 200/Math.abs(rate))
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

        getTileProperties() {
            let x = (this.wallLayer as any).getTileX(this.input.activePointer.worldX);
            let y = (this.wallLayer as any).getTileY(this.input.activePointer.worldY);

            let wallTile = this.map.getTile(x, y, this.wallLayer);

            if (!wallTile || (this.selectedTile && (Math.abs(x - this.selectedTile.x) <= 1 || (x - this.selectedTile.x == 0 && y - this.selectedTile.y === 0)))) {
                y = (this.wallLayer as any).getTileY(this.input.activePointer.worldY - 20)
                wallTile = this.map.getTile(x, y, this.wallLayer);
            }

            let movableTile = this.map.getTile(x, y, this.movableLayer);
            let floorTile = this.map.getTile(x, y, this.floorLayer);

            this.selectedWater = wallTile? [x, y, false] : null;

            if (y > 0 && y < this.map.height && x > 0 && x < this.map.width && this.water[x][y-1].sinkWaterLimit > 0) {
                this.selectedWater = [x, y-1, true]
            }
            
            if (this.winTime > 0) return

            this.cursor.x = x * 32
            this.cursor.y = y * 28
            if (movableTile && !(floorTile && floorTile.properties.collision)) {
                this.cursor.frame = CURSOR_WALL
                this.cursor.visible = true;
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

    const LEVELS = [
        ['level1', 'Simple'],
        ['level2', 'Two Cities'],
        ['level3', 'Spaghetti'],
        ['level4', 'Sources'],
        ['level5', 'Crowded'],
    ]

    let resized = false

    
    export class LevelSelectState extends Phaser.State {

        preload() {
            this.load.image('button', IMAGE_FOLDER + 'button.png')
        }

        create() {
            this.stage.smoothed = false;
            this.stage.backgroundColor = '#333';

            if (!resized) {
                this.game.scale.scaleMode = Phaser.ScaleManager.USER_SCALE
                this.game.scale.setUserScale(ZOOM, ZOOM, 0, 0)
                this.game.scale.refresh();

                resized = true
            }

            let title = this.add.text(0, 0, 'Level Select',  {
                font: 'bold 22px Roman',
                fill: '#e8ba00',
                boundsAlignH: "center",
                boundsAlignV: "middle"
            })

            title.setTextBounds(0, 0, 320, 60)

            let style = {
                font: 'bold 14px Roman',
                fill: 'black',
                boundsAlignH: "center",
                boundsAlignV: "middle"
            }

            LEVELS.forEach(([name, displayName], i) => {
                let x = i > 4? 175 : 20 
                let y = 60 + 46 * (i % 5)
                let button = this.add.button(x, y, 'button', this.levelSelect(name), this)

                let label = new Phaser.Text(this.game, 0, 0, displayName, style);
                label.setTextBounds(0, 0, 120, 40)
                button.addChild(label);
            })

        }

        levelSelect(level) {
            return function() {
                console.log(level)
                this.game.state.start('GameState', true, false, level)
            }
        }
    }

    export class SimpleGame extends Phaser.Game {
        constructor() {
            super(320, 300, Phaser.WEBGL, 'content', null, false, false)

            this.state.add("GameState", GameState, false);
            this.state.add("LevelSelectState", LevelSelectState, false);
            this.state.start("LevelSelectState", true, false);       
        }

        boot() {
            super.boot()            

            Phaser.Canvas.setImageRenderingCrisp(this.canvas)     
        }
    }
}

window.onload = () => {
    let game = new AqueductGame.SimpleGame();
};