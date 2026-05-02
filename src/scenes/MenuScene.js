import Phaser from 'phaser';
import { initAudio } from '../game/audio.js';

// Owns the DOM #start screen. When BEGIN INFILTRATION is clicked,
// hands off to GameScene + HUDScene.
export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    const startEl = document.getElementById('start');
    const btn = document.getElementById('start-btn');

    if (startEl) startEl.classList.remove('hidden');

    const begin = () => {
      initAudio();
      if (startEl) startEl.classList.add('hidden');
      this.scene.start('GameScene');
      this.scene.launch('HUDScene');
    };

    btn?.addEventListener('click', begin, { once: true });

    // Clean up the listener if the scene is shut down before click
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      btn?.removeEventListener('click', begin);
    });
  }
}
