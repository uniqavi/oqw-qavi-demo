import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import MenuScene from './scenes/MenuScene.js';
import GameScene from './scenes/GameScene.js';
import Level2Scene from './scenes/Level2Scene.js';
import HUDScene from './scenes/HUDScene.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#181818',
  scene: [BootScene, MenuScene, GameScene, Level2Scene, HUDScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: '100%',
    height: '100%',
  },
};

new Phaser.Game(config);
