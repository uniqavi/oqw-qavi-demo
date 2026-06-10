import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import MenuScene from './scenes/MenuScene.js';
import TutorialScene from './scenes/TutorialScene.js';
import HomeScene from './scenes/HomeScene.js';
import GameScene from './scenes/GameScene.js';
import Level2Scene from './scenes/Level2Scene.js';
import HUDScene from './scenes/HUDScene.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#181818',
  scene: [BootScene, MenuScene, TutorialScene, HomeScene, GameScene, Level2Scene, HUDScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: '100%',
    height: '100%',
  },
};

const game = new Phaser.Game(config);

// Dev-only handle so the preview/verification workflow can jump straight to a
// scene (e.g. window.__game.scene.start('GameScene', { difficulty: 'easy' }))
// without clicking through the cutscene + tutorial. Vite strips this whole
// block from production builds (import.meta.env.DEV is statically false).
if (import.meta.env.DEV) {
  window.__game = game;
}
