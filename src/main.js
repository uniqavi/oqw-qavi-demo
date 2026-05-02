import Phaser from 'phaser';

class HelloScene extends Phaser.Scene {
  constructor() {
    super('HelloScene');
  }

  create() {
    // Dark background
    this.cameras.main.setBackgroundColor('#181818');

    // A red square in the middle (our future "player window")
    const square = this.add.rectangle(
      this.scale.width / 2,
      this.scale.height / 2,
      75,
      56,
      0xE63946
    );

    // Confirmation text
    this.add.text(20, 20, 'Phaser 3 is alive', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#f5f5f5',
    });

    // Make the square move with arrow keys (just to prove input works)
    this.cursors = this.input.keyboard.createCursorKeys();
    this.square = square;
  }

  update(time, delta) {
    const speed = 230 * (delta / 1000);
    if (this.cursors.left.isDown)  this.square.x -= speed;
    if (this.cursors.right.isDown) this.square.x += speed;
    if (this.cursors.up.isDown)    this.square.y -= speed;
    if (this.cursors.down.isDown)  this.square.y += speed;
  }
}

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#0c0c0e',
  scene: [HelloScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

new Phaser.Game(config);