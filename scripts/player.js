var createPlayer = function createPlayer(game, options) {
  var defaults = {
    position: {
      x: 4,
      y: 8
    },
    orientation: 'right',
    keys: {
      up: 'UP',
      down: 'DOWN',
      left: 'LEFT',
      right: 'RIGHT',
      attack: 'ENTER'
    },
    scale: {
      x: 4,
      y: 8
    },
    color: 'pink',
    gamepad: game.input.gamepad.pad1,
  };

  var settings = Object.assign({}, defaults, options);

  var keys = {
    up: game.input.keyboard.addKey(Phaser.Keyboard[settings.keys.up]),
    down: game.input.keyboard.addKey(Phaser.Keyboard[settings.keys.down]),
    left: game.input.keyboard.addKey(Phaser.Keyboard[settings.keys.left]),
    right: game.input.keyboard.addKey(Phaser.Keyboard[settings.keys.right]),
    attack: game.input.keyboard.addKey(Phaser.Keyboard[settings.keys.attack]),
  };

  var gamepad = settings.gamepad;

  var sfx = require('./sfx.js');

  var actions = {
    attack: function attack() {
      var duration = 200;
      var interval = 400;
      var velocity = 200;

      var canAttack = (Date.now() > player.lastAttacked + interval) && !player.isDucking && !player.isDead;
      if (!canAttack) {
        return;
      }

      player.isAttacking = true;
      player.lastAttacked = Date.now();

      sfx.attack();

      switch(player.orientation) {
        case 'left':
          player.body.velocity.x = -velocity;
          break;
        case 'right':
          player.body.velocity.x = velocity;
          break;
      }

      player.loadTexture('white');
      setTimeout(actions.endAttack, duration);
    },

    endAttack: function endAttack() {
      if (player.isAttacking) {
        player.loadTexture(settings.color);
        player.isAttacking = false;
      }
    },

    run: function run(direction) {
      var maxSpeed = 64;
      var acceleration = player.body.touching.down ? 8 : 3; // players have less control in the air
      
      if (player.orientation != direction) {
        player.scale.x *= -1;
        player.orientation = direction;
      }

      switch (direction) {
        case 'left':
          // if player is going faster than max running speed (due to attack, etc), slow them down over time
          if (player.body.velocity.x < -maxSpeed) {
            player.body.velocity.x += acceleration;
          } else {
            player.body.velocity.x = Math.max(player.body.velocity.x - acceleration, -maxSpeed);
          }
          break;
        case 'right':
          if (player.body.velocity.x > maxSpeed) {
            player.body.velocity.x -= acceleration;
          } else {
            player.body.velocity.x = Math.min(player.body.velocity.x + acceleration, maxSpeed);
          }
          break;
      }
    },

    jump: function jump() {
      if (player.body.touching.down) {
        player.body.velocity.y = -200;
        sfx.jump();
      // wall jumps
      } else if (player.body.touching.left) {
        player.body.velocity.y = -240;
        player.body.velocity.x = 90;
        sfx.jump();
      } else if (player.body.touching.right) {
        player.body.velocity.y = -240;
        player.body.velocity.x = -90;
        sfx.jump();
      }
    },

    dampenJump: function dampenJump() {
      // soften upward velocity when player releases jump key
        var dampenToPercent = 0.5;

        if (player.body.velocity.y < 0) {
          player.body.velocity.y *= dampenToPercent;
        }
    },

    duck: function duck() {
      if (player.isAttacking || player.isDead) {
        return;
      }

      if (!player.isDucking) {
        player.scale.setTo(settings.scale.x, settings.scale.y / 2);
        player.y += settings.scale.y;
      }
      player.isDucking = true;

      (function roll() {
        var canRoll = Math.abs(player.body.velocity.x) > 50 && player.body.touching.down;
        if (canRoll) {
          player.isRolling = true;
        }
      }());
    },

    stand: function stand() {
      player.y -= settings.scale.y;
      player.scale.setTo(settings.scale.x, settings.scale.y);
      player.isDucking = false;
      player.isRolling = false;
    },

    takeDamage: function takeDamage(amount) {
      // prevent taking more damage than hp remaining in a current heart
      if (amount > 1 && (player.hp - amount) % 2 !== 0) {
        amount = 1;
      }

      player.hp -= amount;

      if (player.hp < 0) {
        player.hp = 0;
      }
      if (player.hp % 2 === 0) {
        actions.die();
      }
      actions.updateHearts();
    },

    updateHearts: function() {
      var healthPercentage = player.hp / player.maxHp;
    },

    die: function() {
      sfx.die();

      if (player.hp > 0) {
        actions.endAttack();
        player.lastAttacked = 0;

        var respawnPosition = {
          x: Math.random() > 0.5 ? 4 : 306,
          y: 8
        };

        player.position.x = respawnPosition.x;
        player.position.y = respawnPosition.y;
        player.body.velocity.x = 0;
        player.body.velocity.y = 0;
      } else {
        player.isDead = true;
        // knock player on his/her side
        player.scale.setTo(settings.scale.y, settings.scale.x);
        // TODO: detangle this
        var checkForGameOver = require('./game.js');
        checkForGameOver();
      }
    }
  };

  var player = game.add.sprite(settings.position.x, settings.position.y, settings.color);
  player.name = settings.name;
  player.orientation = settings.orientation;
  player.scale.setTo(settings.scale.x, settings.scale.y); // TODO: add giant mode

  game.physics.arcade.enable(player);
  player.body.collideWorldBounds = true;
  player.body.bounce.y = 0.2; // TODO: allow bounce configuration
  player.body.gravity.y = 380; // TODO: allow gravity configuration

  player.upWasDown = false; // track input change for variable jump height
  player.isRolling = false;
  player.isDucking = false;
  player.isAttacking = false;
  player.isDead = false;
  player.lastAttacked = 0;
  player.isCollidable = true;

  player.actions = actions;

  // track health
  player.hp = player.maxHp = 7; // TODO: allow setting custom hp amount for each player
  player.hearts = game.add.group();
  function addHeart(i) {
    var orientation = player.orientation === 'left' ? 1 : -1;
    var heart = game.add.sprite((i + 3) * 2 * orientation / settings.scale.x, 0, 'hearts');
    player.hearts.add(heart);
    return heart;
  }
  
  for (var i=0; i<player.hp; i +=1 ) {
    if (i % 2 === 0) {
      var heart = addHeart(i);
      if (i % 4 === 0) {
        heart.position.y -= 1 / settings.scale.y;
      }
    }

    if (player.hp % 2 === 1 && i === player.hp) {
      addHeart(i).frame = 1;
    }
  }

  player.hearts.forEach(function(heart) {
    heart.setScaleMinMax(1, 1); // prevent hearts scaling w/ player
  });
  player.addChild(player.hearts);

  // phaser apparently automatically calls any function named update attached to a sprite!
  player.update = function() {
    // kill player if he falls off the screen
    if (player.position.y > 180 && player.hp !== 0) { // TODO: how to access native height from game.js?
      actions.takeDamage(2);
    }

    var input = {
      left:   (keys.left.isDown && !keys.right.isDown) ||
              (gamepad.isDown(Phaser.Gamepad.XBOX360_DPAD_LEFT) && !gamepad.isDown(Phaser.Gamepad.XBOX360_DPAD_RIGHT)) ||
              gamepad.axis(Phaser.Gamepad.XBOX360_STICK_LEFT_X) < -0.1 ||
              gamepad.axis(Phaser.Gamepad.XBOX360_STICK_RIGHT_X) < -0.1,
      right:  (keys.right.isDown && !keys.left.isDown) ||
              (gamepad.isDown(Phaser.Gamepad.XBOX360_DPAD_RIGHT) && !gamepad.isDown(Phaser.Gamepad.XBOX360_DPAD_LEFT)) ||
              gamepad.axis(Phaser.Gamepad.XBOX360_STICK_LEFT_X) > 0.1 ||
              gamepad.axis(Phaser.Gamepad.XBOX360_STICK_RIGHT_X) > 0.1,
      up:     keys.up.isDown ||
              gamepad.isDown(Phaser.Gamepad.XBOX360_DPAD_UP) ||
              gamepad.isDown(Phaser.Gamepad.XBOX360_A),
      down:   keys.down.isDown ||
              gamepad.isDown(Phaser.Gamepad.XBOX360_DPAD_DOWN) ||
              gamepad.axis(Phaser.Gamepad.XBOX360_STICK_LEFT_Y) > 0.1 ||
              gamepad.axis(Phaser.Gamepad.XBOX360_STICK_RIGHT_Y) > 0.1,
      attack: keys.attack.isDown ||
              gamepad.justPressed(Phaser.Gamepad.XBOX360_X) ||
              gamepad.justPressed(Phaser.Gamepad.XBOX360_Y) ||
              gamepad.justPressed(Phaser.Gamepad.XBOX360_B) ||
              gamepad.justPressed(Phaser.Gamepad.XBOX360_LEFT_BUMPER) ||
              gamepad.justPressed(Phaser.Gamepad.XBOX360_LEFT_TRIGGER) ||
              gamepad.justPressed(Phaser.Gamepad.XBOX360_RIGHT_BUMPER) ||
              gamepad.justPressed(Phaser.Gamepad.XBOX360_RIGHT_TRIGGER),
    };

    if (input.left) {
      actions.run('left');
    } else if (input.right) {
      actions.run('right');
    } else if (player.body.touching.down && !player.isRolling) {
      // apply friction
      if (Math.abs(player.body.velocity.x) < 4) {
        player.body.velocity.x *= 0.5; // quickly bring slow-moving players to a stop
      } else if (player.body.velocity.x > 0) {
        player.body.velocity.x -= 4;
      } else if (player.body.velocity.x < 0) {
        player.body.velocity.x += 4;
      }
    }

    if (input.up) {
      player.upWasDown = true;
      actions.jump();
    } else if (player.upWasDown) {
      player.upWasDown = false;
      actions.dampenJump();
    }

    if (input.down) {
      actions.duck();
    } else if (player.isDucking) {
      actions.stand();
    }

    if (input.attack) {
      actions.attack();
    }
  };

  return player;
};

module.exports = createPlayer;
