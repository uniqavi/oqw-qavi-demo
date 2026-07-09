import Phaser from 'phaser';
import { resetProgress } from '../game/progress.js';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    // A fresh page load (refresh, hard refresh, cache clear, new tab) always
    // resets story progression so the campaign starts from Toto's intro.
    // Scene transitions never reload the page, so an in-session campaign is
    // unaffected. High scores (oqw-leaderboard) and settings persist — see
    // src/game/progress.js for the key inventory.
    resetProgress();

    this.scene.start('MenuScene');
  }
}
