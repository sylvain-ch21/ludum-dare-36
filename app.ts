/// <reference path="bower_components/phaser/typescript/phaser.d.ts" />
// import * as Phaser from 'phaser'

const TOP = 1;
const BOTTOM = 2;
const LEFT = 4;
const RIGHT = 8;
const IMAGE_FOLDER = 'images/'

module GameFromScratch {
    export class TitleScreenState extends Phaser.State {
        game: Phaser.Game;
        constructor() {
            super();
        }
        titleScreenImage: Phaser.Sprite;

        preload() {
            /*
            ['aqueduct', 'aqueduct-water'].forEach(type => {
                for (var i = 0; i < 16; i++) {
                    var suffix = ''
                    if (i & TOP) suffix += 'T'
                    if (i & BOTTOM) suffix += 'B'
                    if (i & LEFT) suffix += 'L'
                    if (i & RIGHT) suffix += 'R'
                    if (suffix.length < 2) continue
                    var name = type + '-' + suffix + '.png'
                    this.load.image(type + i, IMAGE_FOLDER + name);
                }
            })
            */
            this.load.tilemap('test', 'maps/test.json', null, Phaser.Tilemap.TILED_JSON);
            this.load.image('tiles', IMAGE_FOLDER + 'tiles.png');
        }
        create() {
            this.stage.backgroundColor = '#787878';
            /*
            for (var x = 100; x < 200; x += 32) {                
                for (var y = 100; y < 200; y += 28) {
                    var sprite = this.add.sprite(x, y, "aqueduct15");
                    sprite.anchor.y = 1/4
                    console.log(sprite.offsetY)
                }
            }
            */
            var map = this.add.tilemap('test');
            map.addTilesetImage('tiles', 'tiles');
            var layer = map.createLayer('floor');
            layer.resizeWorld();
        }
    }

    export class SimpleGame {
        game: Phaser.Game;

        constructor() {
            this.game = new Phaser.Game(800, 600, Phaser.WEBGL, 'content');

            this.game.state.add("TitleScreenState", TitleScreenState, false);
            this.game.state.start("TitleScreenState", true, true);
        }

    }
}

window.onload = () => {
    var game = new GameFromScratch.SimpleGame();
};