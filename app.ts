// <reference path="bower_components/phaser/typescript/phaser.d.ts" />
// import * as Phaser from 'phaser'

const TOP = 1;
const BOTTOM = 2;
const LEFT = 4;
const RIGHT = 8;
const IMAGE_FOLDER = 'images/';

const SINK_GID = 20;

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
            this.blocked = -1;
        }

        level: number;
        isSink: boolean;
        isSource: boolean;
        blocked: number;
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
        }
        create() {
            this.stage.backgroundColor = '#787878';

            this.map = this.add.tilemap('test');
            this.map.addTilesetImage('tiles', 'tiles');
            this.map.addTilesetImage('walls', 'walls');

            this.floorLayer = this.map.createLayer('floor');
            this.wallLayer = this.map.createLayer('walls');
            // this.sinkLayer = this.map.createLayer('sinks');

            this.sinks = this.add.group()
            this.sinks.y += 48/2
            this.map.createFromObjects('sinks', SINK_GID, 'tiles', 4, true, false, this.sinks)

            this.sources = this.add.group()
            this.sources.y += 48/2
            this.map.createFromObjects('sources', SINK_GID, 'tiles', 4, true, false, this.sources)

            this.floorLayer.resizeWorld();

            this.waterLayer = this.add.graphics(this.map.widthInPixels, this.map.heightInPixels);

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

            this.waterLayer.clear()

            console.log(this.water);
        }

        isSource(x: number, y: number) : boolean {
            return this.sources.filter(sourceFilter(x, y)).total > 0;
        }

        isSink(x: number, y: number) : boolean {
            return this.sinks.filter(sourceFilter(x, y)).total > 0;
        }

        getTileProperties() {
            var x = (this.wallLayer as any).getTileX(this.input.activePointer.worldX);
            var y = (this.wallLayer as any).getTileY(this.input.activePointer.worldY);

            var tile = this.map.getTile(x, y, this.wallLayer);

            if (tile) {
                this.game.debug.text('Selected tile properties:'+ JSON.stringify( tile.properties ), 16, 570);
            } else {
                this.game.debug.text('No tile selected', 16, 570);
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