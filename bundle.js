(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var Monosynth = function Monosynth(audioCtx, config) {
  var synth;
  var Synth = function Synth() {
    synth = this;
    config = config || {};
    config.cutoff = config.cutoff || {};

    synth.audioCtx = audioCtx,
    synth.amp      = audioCtx.createGain(),
    synth.filter   = audioCtx.createBiquadFilter(),
    synth.osc      = audioCtx.createOscillator(),
    synth.pan      = audioCtx.createPanner(),

    synth.maxGain  = config.maxGain  || 0.9, // out of 1
    synth.attack   = config.attack   || 0.1, // in seconds
    synth.decay    = config.decay    || 0.0, // in seconds
    synth.sustain  = config.sustain  || 1.0, // out of 1
    synth.release  = config.release  || 0.8, // in seconds

    // low-pass filter
    synth.cutoff              = synth.filter.frequency;
    synth.cutoff.maxFrequency = config.cutoff.maxFrequency || 7500; // in hertz
    synth.cutoff.attack       = config.cutoff.attack       || 0.1; // in seconds
    synth.cutoff.decay        = config.cutoff.decay        || 2.5; // in seconds
    synth.cutoff.sustain      = config.cutoff.sustain      || 0.2; // out of 1
    
    synth.amp.gain.value = 0;
    synth.filter.type = 'lowpass';
    synth.filter.connect(synth.amp);
    synth.amp.connect(audioCtx.destination);
    synth.pan.panningModel = 'equalpower';
    synth.pan.setPosition(0, 0, 1); // start with stereo image centered
    synth.osc.connect(synth.pan);
    synth.pan.connect(synth.filter);
    synth.osc.start(0);
    
    synth.waveform(config.waveform || 'sine');
    synth.pitch(config.pitch || 440);

    return synth;
  };

  function getNow() {
    var now = synth.audioCtx.currentTime;
    synth.amp.gain.cancelScheduledValues(now);
    synth.amp.gain.setValueAtTime(synth.amp.gain.value, now);
    return now;
  };
  
  Synth.prototype.pitch = function pitch(newPitch) {
    if (newPitch) {
      var now = synth.audioCtx.currentTime;
      synth.osc.frequency.setValueAtTime(newPitch, now);
    }
    return synth.osc.frequency.value;
  };

  Synth.prototype.waveform = function waveform(newWaveform) {
    if (newWaveform) {
      synth.osc.type = newWaveform;
    }
    return synth.osc.type;
  };

  // apply attack, decay, sustain envelope
  Synth.prototype.start = function startSynth() {
    var atk  = parseFloat(synth.attack);
    var dec  = parseFloat(synth.decay);
    var cAtk = parseFloat(synth.cutoff.attack);
    var cDec = parseFloat(synth.cutoff.decay);
    var now  = getNow();
    synth.cutoff.cancelScheduledValues(now);
    synth.cutoff.linearRampToValueAtTime(synth.cutoff.value, now);
    synth.cutoff.linearRampToValueAtTime(synth.cutoff.maxFrequency, now + cAtk);
    synth.cutoff.linearRampToValueAtTime(synth.cutoff.sustain * synth.cutoff.maxFrequency, now + cAtk + cDec);
    synth.amp.gain.linearRampToValueAtTime(synth.maxGain, now + atk);
    synth.amp.gain.linearRampToValueAtTime(synth.sustain * synth.maxGain, now + atk + dec);
  };

  // apply release envelope
  Synth.prototype.stop = function stopSynth() {
    var rel = parseFloat(synth.release);
    var now = getNow();
    synth.amp.gain.linearRampToValueAtTime(0, now + rel);
  };

  return new Synth();
};

// npm support
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = Monosynth;
}

},{}],2:[function(require,module,exports){
// npm support
if (typeof require !== 'undefined') {
  var Monosynth = require('submono');
}

var Polysynth = function Polysynth(audioCtx, config) {
  var synth;
  var Synth = function Synth() {
    synth = this;
    synth.audioCtx = audioCtx;
    synth.voices = [];
    
    config = config || {};
    config.cutoff = config.cutoff || {};


    for (var i = 0, ii = config.numVoices || 16; i < ii; i++) {
      synth.voices.push(new Monosynth(audioCtx, config));
    }

    synth.stereoWidth = config.stereoWidth || 0.5; // out of 1
    synth.width(synth.stereoWidth);

    return synth;
  };

  // apply attack, decay, sustain envelope
  Synth.prototype.start = function startSynth() {
    synth.voices.forEach(function startVoice(voice) {
      voice.start();
    });
  };

  // apply release envelope
  Synth.prototype.stop = function stopSynth() {
    synth.voices.forEach(function stopVoice(voice) {
      voice.stop();
    });
  };

  // get/set synth stereo width
  Synth.prototype.width = function width(newWidth) {
    if (synth.voices.length > 1 && newWidth) {
      synth.stereoWidth = newWidth;
      synth.voices.forEach(function panVoice(voice, i) {
        var spread = 1/(synth.voices.length - 1);
        var xPos = spread * i * synth.stereoWidth;
        var zPos = 1 - Math.abs(xPos);
        voice.pan.setPosition(xPos, 0, zPos);
      });
    }

    return synth.stereoWidth;
  };

  // convenience methods for changing values of all Monosynths' properties at once
  (function createSetters() {
    var monosynthProperties = ['maxGain', 'attack', 'decay', 'sustain', 'release'];
    var monosynthCutoffProperties = ['maxFrequency', 'attack', 'decay', 'sustain'];

    monosynthProperties.forEach(function createSetter(property) {
      Synth.prototype[property] = function setValues(newValue) {
        synth.voices.forEach(function setValue(voice) {
          voice[property] = newValue;
        });
      };
    });

    Synth.prototype.cutoff = {};
    monosynthCutoffProperties.forEach(function createSetter(property) {
      Synth.prototype.cutoff[property] = function setValues(newValue) {
        synth.voices.forEach(function setValue(voice) {
          voice.cutoff[property] = newValue;
        });
      };
    });

    Synth.prototype.waveform = function waveform(newWaveform) {
      synth.voices.forEach(function waveform(voice) {
        voice.waveform(newWaveform);
      });
    };

    Synth.prototype.pitch = function pitch(newPitch) {
      synth.voices.forEach(function pitch(voice) {
        voice.pitch(newPitch);
      });
    };
  })();

  return new Synth;
};

// npm support
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = Polysynth;
}

},{"submono":1}],3:[function(require,module,exports){
var nativeWidth = 320;
var nativeHeight = 180;
var platforms, players, text, sfx;

var resize = function resize() {
  document.body.style.zoom = window.innerWidth / nativeWidth;
};

var checkForGameOver = function checkForGameOver() {
  var alivePlayers = [];
  players.children.forEach(function(player) {
    if (!player.isDead) {
      alivePlayers.push(player.name);
    }
  });
  if (alivePlayers.length === 1) {
    text.setText(alivePlayers[0] + '  wins!\nClick  to  restart');
    text.visible = true;
    game.input.onDown.addOnce(restart, this); // restart game on mouse click
  }
};

var preload = function preload() {
  var utils = require('./utils.js');
  sfx = require('./sfx.js');

  resize();
  window.onresize = utils.debounce(resize, 100);

  game.load.image('pink', 'images/pink.png');
  game.load.image('yellow', 'images/yellow.png');
  game.load.image('blue', 'images/blue.png');
  game.load.image('orange', 'images/orange.png');
  game.load.image('purple', 'images/purple.png');
  game.load.image('green', 'images/green.png');
  game.load.image('white', 'images/white.png');
  game.load.spritesheet('hearts', 'images/hearts.png', 3, 3); // player health
};

var create = function create() {
  game.physics.startSystem(Phaser.Physics.ARCADE);
  game.world.setBounds(0, -nativeHeight, nativeWidth, nativeHeight * 3); // allow anything as tall as world to fall off-screen up or down

  var buildPlatforms = require('./map.js');
  platforms = buildPlatforms(game);

  game.input.gamepad.start();

  // TODO: why is this font still anti-aliased?
  var fontStyle = { font: "12px Hellovetica", fill: "#eee", align: "center", boundsAlignH: "center", boundsAlignV: "middle" };
  text = game.add.text(0, 0, '', fontStyle);
  text.setTextBounds(0, 0, nativeWidth, nativeHeight);

  players = game.add.group();
  restart();
};

var restart = function() {
  text.visible = false;

  while (players.children.length > 0) {
    players.children[0].destroy();
  }

  var createPlayer = require('./player.js');

  var player1 = {
    name: 'Blue',
    color: 'blue',
    gamepad: game.input.gamepad.pad1,
    position: {
      x: 72, y: 44
    },
  };

  var player2 = {
    name: 'Yellow',
    color: 'yellow',
    gamepad: game.input.gamepad.pad2,
    position: {
      x: 248, y: 44
    },
    orientation: 'left',
  };

  var player3 = {
    name: 'Green',
    color: 'green',
    gamepad: game.input.gamepad.pad3,
    keys: {
      up: 'W', down: 'S', left: 'A', right: 'D', attack: 'Q'
    },
    position: {
      x: 72, y: 136
    },
  };

  var player4 = {
    name: 'Purple',
    color: 'purple',
    gamepad: game.input.gamepad.pad4,
    keys: {
      up: 'I', down: 'K', left: 'J', right: 'L', attack: 'U'
    },
    position: {
      x: 248, y: 136
    },
    orientation: 'left',
  };

  players.add(createPlayer(game, player1));
  players.add(createPlayer(game, player2));
  players.add(createPlayer(game, player3));
  players.add(createPlayer(game, player4));
};

var update = function update() {
  game.physics.arcade.collide(players, platforms);
  // TODO: how do i do this on the player itself without access to players? or should i add a ftn to player and set that as the cb?
  game.physics.arcade.collide(players, players, function handlePlayerCollision(playerA, playerB) {
     /* let's not knock anybody around if something's on one of these dudes'/dudettes' heads.
     prevents cannonball attacks and the like, and allows standing on heads.
     note: still need to collide in order to test touching.up, so don't move this to allowPlayerCollision! */
    if (playerA.body.touching.up || playerB.body.touching.up) {
      return;
    }

    function temporarilyDisableCollision(player) {
      player.isCollidable = false;
      setTimeout(function() {
        player.isCollidable = true;
      }, 100);
    }

    function bounce() {
      sfx.bounce();

      var bounceVelocity = 100;
      var velocityA = velocityB = bounceVelocity;
      if (playerA.position.x > playerB.position.x) {
        velocityB *= -1;
      } else {
        velocityA *= -1;
      }
      playerA.body.velocity.x = velocityA;
      playerB.body.velocity.x = velocityB;
      playerA.isRolling = false;
      playerB.isRolling = false;
    }

    function fling() {
      sfx.bounce();

      var playerToFling;
      var playerToLeave;
      if (playerA.isDucking) {
        playerToFling = playerB;
        playerToLeave = playerA;
      } else {
        playerToFling = playerA;
        playerToLeave = playerB;
      }
      temporarilyDisableCollision(playerToFling);
      var flingXVelocity = 150;
      if (playerToFling.position.x > playerToLeave.position.x) {
        flingXVelocity *= -1;
      }
      playerToFling.body.velocity.x = flingXVelocity;
      playerToFling.body.velocity.y = -150;
    }

    function pop() {
      sfx.bounce();

      var playerToPop;
      if (playerA.isRolling) {
        playerToPop = playerB;
      } else {
        playerToPop = playerA;
      }
      temporarilyDisableCollision(playerToPop);
      playerToPop.body.velocity.y = -150;
    }

    var bothRolling = playerA.isRolling && playerB.isRolling;
    var bothStanding = !playerA.isDucking && !playerB.isDucking;
    var neitherRolling = !playerA.isRolling && !playerB.isRolling;
    var eitherDucking = playerA.isDucking || playerB.isDucking;
    var eitherRunning = Math.abs(playerA.body.velocity.x) > 28 || Math.abs(playerB.body.velocity.x) >= 28;
    var eitherRolling = playerA.isRolling || playerB.isRolling;
    var eitherStanding = !playerA.isDucking || !playerB.isDucking;

    switch (true) {
      case bothRolling || bothStanding:
        bounce();
        break;
      case neitherRolling && eitherRunning && eitherDucking:
        fling();
        break;
      case eitherRolling && eitherStanding:
        pop();
        break;
    }

    // if only one of the touching players is attacking...
    if (playerA.isAttacking !== playerB.isAttacking) {
      var victim = playerA.isAttacking ? playerB : playerA;
      if (playerA.orientation !== playerB.orientation) {
        victim.actions.takeDamage(1);
      } else {
        victim.actions.takeDamage(2); // attacked from behind for double damage
      }
    }

  }, function allowPlayerCollision(playerA, playerB) {
    // don't allow collision if either player isn't collidable.
    // also disallow if player is in limbo below the screen :]
    if (!playerA.isCollidable || !playerB.isCollidable || playerA.position.y > nativeHeight || playerB.position.y > nativeHeight) {
      return false;
    }
    return true;
  });
};

var game = new Phaser.Game(nativeWidth, nativeHeight, Phaser.AUTO, 'game', {
  preload: preload,
  create: create,
  update: update,
}, false, false); // disable anti-aliasing

module.exports = checkForGameOver;

},{"./map.js":4,"./player.js":5,"./sfx.js":6,"./utils.js":7}],4:[function(require,module,exports){
var buildPlatforms = function buildPlatforms(game) {
  var platforms = game.add.group();
  platforms.enableBody = true;
  var platformPositions = [[48, 64], [224, 64],
                               [136, 104],
                           [48, 154,], [224, 154]];

  platformPositions.forEach(function(position) {
    var platform = platforms.create(position[0], position[1], 'pink');
    platform.scale.setTo(24, 4);
    platform.body.immovable = true;
  });

  var walls = [];
  walls.push(platforms.create(-16, 32, 'pink'));
  walls.push(platforms.create(304, 32, 'pink'));
  walls.forEach(function(wall) {
    wall.scale.setTo(16, 74);
    wall.body.immovable = true;
  });
  
  return platforms;
};

module.exports = buildPlatforms;

},{}],5:[function(require,module,exports){
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
  function addHeart() {
    var orientation = player.orientation === 'left' ? 1 : -1;
    var heart = game.add.sprite((i + 1) * orientation, 0, 'hearts');
    player.hearts.add(heart);
    return heart;
  }
  for (var i=0; i<player.hp; i+=2) {
    var heart = addHeart(i);
    if (i % 4 === 0) {
      heart.position.y -= 1;
    }
  }
  
  if (player.hp % 2 === 1) {
    addHeart(7).frame = 1;  
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

},{"./game.js":3,"./sfx.js":6}],6:[function(require,module,exports){
var sfx = (function sfx() {
  Polysynth = require('subpoly');

  var audioCtx;
  if (typeof AudioContext !== "undefined") {
    audioCtx = new AudioContext();
  } else {
    audioCtx = new webkitAudioContext();
  }

  var pulse = new Polysynth(audioCtx, {
    waveform: 'square',
    release: 0.01,
    numVoices: 4
  });
  
  function getNow(voice) {
    var now = voice.audioCtx.currentTime;
    return now;
  };
  
  var jumpTimeout, attackTimeout;
  var dieTimeouts = [];

  var soundEffects = {
    jump: function() {
      clearTimeout(jumpTimeout);
      
      var voice = pulse.voices[0];
      var duration = 0.1; // in seconds
      
      voice.pitch(440);
      voice.start();

      var now = getNow(voice);
      voice.osc.frequency.linearRampToValueAtTime(880, now + duration);
      jumpTimeout = setTimeout(voice.stop, duration * 1000);
    },

    attack: function() {
      clearTimeout(attackTimeout);
      
      var voice = pulse.voices[1];
      var duration = 0.1; // in seconds
      
      voice.pitch(880);
      voice.start();

      var now = getNow(voice);
      voice.osc.frequency.linearRampToValueAtTime(0, now + duration);
      attackTimeout = setTimeout(voice.stop, duration * 1000);
    },
    
    bounce: function() {
      clearTimeout(attackTimeout);
      
      var voice = pulse.voices[2];
      var duration = 0.1; // in seconds
      
      voice.pitch(440);
      voice.start();

      var now = getNow(voice);
      voice.osc.frequency.linearRampToValueAtTime(220, now + duration / 2);
      voice.osc.frequency.linearRampToValueAtTime(660, now + duration);
      attackTimeout = setTimeout(voice.stop, duration * 1000);
    },
    
    die: function() {
      while (dieTimeouts.length) {
        clearTimeout(dieTimeouts.pop());
      }
      
      var voice = pulse.voices[3];
      var pitches = [440, 220, 110];
      var duration = 100;

      voice.start();
      
      pitches.forEach(function(pitch, i) {
        dieTimeouts.push(setTimeout(function() {
          voice.pitch(pitch);
        }, i * duration));
      });
      
      dieTimeouts.push(setTimeout(voice.stop, duration * pitches.length));
    }
  };
  
  return soundEffects;
}());

module.exports = sfx;

},{"subpoly":2}],7:[function(require,module,exports){
var utils = {
  // from underscore
  debounce: function debounce(func, wait, immediate) {
	var timeout;
	return function() {
		var context = this, args = arguments;
		var later = function() {
			timeout = null;
			if (!immediate) func.apply(context, args);
		};
		var callNow = immediate && !timeout;
		clearTimeout(timeout);
		timeout = setTimeout(later, wait);
		if (callNow) func.apply(context, args);
	};
  }
};

module.exports = utils;
},{}]},{},[3])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvc3VibW9uby9zdWJtb25vLmpzIiwibm9kZV9tb2R1bGVzL3N1YnBvbHkvc3VicG9seS5qcyIsInNjcmlwdHMvZ2FtZS5qcyIsInNjcmlwdHMvbWFwLmpzIiwic2NyaXB0cy9wbGF5ZXIuanMiLCJzY3JpcHRzL3NmeC5qcyIsInNjcmlwdHMvdXRpbHMuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdk9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwidmFyIE1vbm9zeW50aCA9IGZ1bmN0aW9uIE1vbm9zeW50aChhdWRpb0N0eCwgY29uZmlnKSB7XG4gIHZhciBzeW50aDtcbiAgdmFyIFN5bnRoID0gZnVuY3Rpb24gU3ludGgoKSB7XG4gICAgc3ludGggPSB0aGlzO1xuICAgIGNvbmZpZyA9IGNvbmZpZyB8fCB7fTtcbiAgICBjb25maWcuY3V0b2ZmID0gY29uZmlnLmN1dG9mZiB8fCB7fTtcblxuICAgIHN5bnRoLmF1ZGlvQ3R4ID0gYXVkaW9DdHgsXG4gICAgc3ludGguYW1wICAgICAgPSBhdWRpb0N0eC5jcmVhdGVHYWluKCksXG4gICAgc3ludGguZmlsdGVyICAgPSBhdWRpb0N0eC5jcmVhdGVCaXF1YWRGaWx0ZXIoKSxcbiAgICBzeW50aC5vc2MgICAgICA9IGF1ZGlvQ3R4LmNyZWF0ZU9zY2lsbGF0b3IoKSxcbiAgICBzeW50aC5wYW4gICAgICA9IGF1ZGlvQ3R4LmNyZWF0ZVBhbm5lcigpLFxuXG4gICAgc3ludGgubWF4R2FpbiAgPSBjb25maWcubWF4R2FpbiAgfHwgMC45LCAvLyBvdXQgb2YgMVxuICAgIHN5bnRoLmF0dGFjayAgID0gY29uZmlnLmF0dGFjayAgIHx8IDAuMSwgLy8gaW4gc2Vjb25kc1xuICAgIHN5bnRoLmRlY2F5ICAgID0gY29uZmlnLmRlY2F5ICAgIHx8IDAuMCwgLy8gaW4gc2Vjb25kc1xuICAgIHN5bnRoLnN1c3RhaW4gID0gY29uZmlnLnN1c3RhaW4gIHx8IDEuMCwgLy8gb3V0IG9mIDFcbiAgICBzeW50aC5yZWxlYXNlICA9IGNvbmZpZy5yZWxlYXNlICB8fCAwLjgsIC8vIGluIHNlY29uZHNcblxuICAgIC8vIGxvdy1wYXNzIGZpbHRlclxuICAgIHN5bnRoLmN1dG9mZiAgICAgICAgICAgICAgPSBzeW50aC5maWx0ZXIuZnJlcXVlbmN5O1xuICAgIHN5bnRoLmN1dG9mZi5tYXhGcmVxdWVuY3kgPSBjb25maWcuY3V0b2ZmLm1heEZyZXF1ZW5jeSB8fCA3NTAwOyAvLyBpbiBoZXJ0elxuICAgIHN5bnRoLmN1dG9mZi5hdHRhY2sgICAgICAgPSBjb25maWcuY3V0b2ZmLmF0dGFjayAgICAgICB8fCAwLjE7IC8vIGluIHNlY29uZHNcbiAgICBzeW50aC5jdXRvZmYuZGVjYXkgICAgICAgID0gY29uZmlnLmN1dG9mZi5kZWNheSAgICAgICAgfHwgMi41OyAvLyBpbiBzZWNvbmRzXG4gICAgc3ludGguY3V0b2ZmLnN1c3RhaW4gICAgICA9IGNvbmZpZy5jdXRvZmYuc3VzdGFpbiAgICAgIHx8IDAuMjsgLy8gb3V0IG9mIDFcbiAgICBcbiAgICBzeW50aC5hbXAuZ2Fpbi52YWx1ZSA9IDA7XG4gICAgc3ludGguZmlsdGVyLnR5cGUgPSAnbG93cGFzcyc7XG4gICAgc3ludGguZmlsdGVyLmNvbm5lY3Qoc3ludGguYW1wKTtcbiAgICBzeW50aC5hbXAuY29ubmVjdChhdWRpb0N0eC5kZXN0aW5hdGlvbik7XG4gICAgc3ludGgucGFuLnBhbm5pbmdNb2RlbCA9ICdlcXVhbHBvd2VyJztcbiAgICBzeW50aC5wYW4uc2V0UG9zaXRpb24oMCwgMCwgMSk7IC8vIHN0YXJ0IHdpdGggc3RlcmVvIGltYWdlIGNlbnRlcmVkXG4gICAgc3ludGgub3NjLmNvbm5lY3Qoc3ludGgucGFuKTtcbiAgICBzeW50aC5wYW4uY29ubmVjdChzeW50aC5maWx0ZXIpO1xuICAgIHN5bnRoLm9zYy5zdGFydCgwKTtcbiAgICBcbiAgICBzeW50aC53YXZlZm9ybShjb25maWcud2F2ZWZvcm0gfHwgJ3NpbmUnKTtcbiAgICBzeW50aC5waXRjaChjb25maWcucGl0Y2ggfHwgNDQwKTtcblxuICAgIHJldHVybiBzeW50aDtcbiAgfTtcblxuICBmdW5jdGlvbiBnZXROb3coKSB7XG4gICAgdmFyIG5vdyA9IHN5bnRoLmF1ZGlvQ3R4LmN1cnJlbnRUaW1lO1xuICAgIHN5bnRoLmFtcC5nYWluLmNhbmNlbFNjaGVkdWxlZFZhbHVlcyhub3cpO1xuICAgIHN5bnRoLmFtcC5nYWluLnNldFZhbHVlQXRUaW1lKHN5bnRoLmFtcC5nYWluLnZhbHVlLCBub3cpO1xuICAgIHJldHVybiBub3c7XG4gIH07XG4gIFxuICBTeW50aC5wcm90b3R5cGUucGl0Y2ggPSBmdW5jdGlvbiBwaXRjaChuZXdQaXRjaCkge1xuICAgIGlmIChuZXdQaXRjaCkge1xuICAgICAgdmFyIG5vdyA9IHN5bnRoLmF1ZGlvQ3R4LmN1cnJlbnRUaW1lO1xuICAgICAgc3ludGgub3NjLmZyZXF1ZW5jeS5zZXRWYWx1ZUF0VGltZShuZXdQaXRjaCwgbm93KTtcbiAgICB9XG4gICAgcmV0dXJuIHN5bnRoLm9zYy5mcmVxdWVuY3kudmFsdWU7XG4gIH07XG5cbiAgU3ludGgucHJvdG90eXBlLndhdmVmb3JtID0gZnVuY3Rpb24gd2F2ZWZvcm0obmV3V2F2ZWZvcm0pIHtcbiAgICBpZiAobmV3V2F2ZWZvcm0pIHtcbiAgICAgIHN5bnRoLm9zYy50eXBlID0gbmV3V2F2ZWZvcm07XG4gICAgfVxuICAgIHJldHVybiBzeW50aC5vc2MudHlwZTtcbiAgfTtcblxuICAvLyBhcHBseSBhdHRhY2ssIGRlY2F5LCBzdXN0YWluIGVudmVsb3BlXG4gIFN5bnRoLnByb3RvdHlwZS5zdGFydCA9IGZ1bmN0aW9uIHN0YXJ0U3ludGgoKSB7XG4gICAgdmFyIGF0ayAgPSBwYXJzZUZsb2F0KHN5bnRoLmF0dGFjayk7XG4gICAgdmFyIGRlYyAgPSBwYXJzZUZsb2F0KHN5bnRoLmRlY2F5KTtcbiAgICB2YXIgY0F0ayA9IHBhcnNlRmxvYXQoc3ludGguY3V0b2ZmLmF0dGFjayk7XG4gICAgdmFyIGNEZWMgPSBwYXJzZUZsb2F0KHN5bnRoLmN1dG9mZi5kZWNheSk7XG4gICAgdmFyIG5vdyAgPSBnZXROb3coKTtcbiAgICBzeW50aC5jdXRvZmYuY2FuY2VsU2NoZWR1bGVkVmFsdWVzKG5vdyk7XG4gICAgc3ludGguY3V0b2ZmLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHN5bnRoLmN1dG9mZi52YWx1ZSwgbm93KTtcbiAgICBzeW50aC5jdXRvZmYubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUoc3ludGguY3V0b2ZmLm1heEZyZXF1ZW5jeSwgbm93ICsgY0F0ayk7XG4gICAgc3ludGguY3V0b2ZmLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHN5bnRoLmN1dG9mZi5zdXN0YWluICogc3ludGguY3V0b2ZmLm1heEZyZXF1ZW5jeSwgbm93ICsgY0F0ayArIGNEZWMpO1xuICAgIHN5bnRoLmFtcC5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHN5bnRoLm1heEdhaW4sIG5vdyArIGF0ayk7XG4gICAgc3ludGguYW1wLmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUoc3ludGguc3VzdGFpbiAqIHN5bnRoLm1heEdhaW4sIG5vdyArIGF0ayArIGRlYyk7XG4gIH07XG5cbiAgLy8gYXBwbHkgcmVsZWFzZSBlbnZlbG9wZVxuICBTeW50aC5wcm90b3R5cGUuc3RvcCA9IGZ1bmN0aW9uIHN0b3BTeW50aCgpIHtcbiAgICB2YXIgcmVsID0gcGFyc2VGbG9hdChzeW50aC5yZWxlYXNlKTtcbiAgICB2YXIgbm93ID0gZ2V0Tm93KCk7XG4gICAgc3ludGguYW1wLmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUoMCwgbm93ICsgcmVsKTtcbiAgfTtcblxuICByZXR1cm4gbmV3IFN5bnRoKCk7XG59O1xuXG4vLyBucG0gc3VwcG9ydFxuaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiBtb2R1bGUuZXhwb3J0cyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgbW9kdWxlLmV4cG9ydHMgPSBNb25vc3ludGg7XG59XG4iLCIvLyBucG0gc3VwcG9ydFxuaWYgKHR5cGVvZiByZXF1aXJlICE9PSAndW5kZWZpbmVkJykge1xuICB2YXIgTW9ub3N5bnRoID0gcmVxdWlyZSgnc3VibW9ubycpO1xufVxuXG52YXIgUG9seXN5bnRoID0gZnVuY3Rpb24gUG9seXN5bnRoKGF1ZGlvQ3R4LCBjb25maWcpIHtcbiAgdmFyIHN5bnRoO1xuICB2YXIgU3ludGggPSBmdW5jdGlvbiBTeW50aCgpIHtcbiAgICBzeW50aCA9IHRoaXM7XG4gICAgc3ludGguYXVkaW9DdHggPSBhdWRpb0N0eDtcbiAgICBzeW50aC52b2ljZXMgPSBbXTtcbiAgICBcbiAgICBjb25maWcgPSBjb25maWcgfHwge307XG4gICAgY29uZmlnLmN1dG9mZiA9IGNvbmZpZy5jdXRvZmYgfHwge307XG5cblxuICAgIGZvciAodmFyIGkgPSAwLCBpaSA9IGNvbmZpZy5udW1Wb2ljZXMgfHwgMTY7IGkgPCBpaTsgaSsrKSB7XG4gICAgICBzeW50aC52b2ljZXMucHVzaChuZXcgTW9ub3N5bnRoKGF1ZGlvQ3R4LCBjb25maWcpKTtcbiAgICB9XG5cbiAgICBzeW50aC5zdGVyZW9XaWR0aCA9IGNvbmZpZy5zdGVyZW9XaWR0aCB8fCAwLjU7IC8vIG91dCBvZiAxXG4gICAgc3ludGgud2lkdGgoc3ludGguc3RlcmVvV2lkdGgpO1xuXG4gICAgcmV0dXJuIHN5bnRoO1xuICB9O1xuXG4gIC8vIGFwcGx5IGF0dGFjaywgZGVjYXksIHN1c3RhaW4gZW52ZWxvcGVcbiAgU3ludGgucHJvdG90eXBlLnN0YXJ0ID0gZnVuY3Rpb24gc3RhcnRTeW50aCgpIHtcbiAgICBzeW50aC52b2ljZXMuZm9yRWFjaChmdW5jdGlvbiBzdGFydFZvaWNlKHZvaWNlKSB7XG4gICAgICB2b2ljZS5zdGFydCgpO1xuICAgIH0pO1xuICB9O1xuXG4gIC8vIGFwcGx5IHJlbGVhc2UgZW52ZWxvcGVcbiAgU3ludGgucHJvdG90eXBlLnN0b3AgPSBmdW5jdGlvbiBzdG9wU3ludGgoKSB7XG4gICAgc3ludGgudm9pY2VzLmZvckVhY2goZnVuY3Rpb24gc3RvcFZvaWNlKHZvaWNlKSB7XG4gICAgICB2b2ljZS5zdG9wKCk7XG4gICAgfSk7XG4gIH07XG5cbiAgLy8gZ2V0L3NldCBzeW50aCBzdGVyZW8gd2lkdGhcbiAgU3ludGgucHJvdG90eXBlLndpZHRoID0gZnVuY3Rpb24gd2lkdGgobmV3V2lkdGgpIHtcbiAgICBpZiAoc3ludGgudm9pY2VzLmxlbmd0aCA+IDEgJiYgbmV3V2lkdGgpIHtcbiAgICAgIHN5bnRoLnN0ZXJlb1dpZHRoID0gbmV3V2lkdGg7XG4gICAgICBzeW50aC52b2ljZXMuZm9yRWFjaChmdW5jdGlvbiBwYW5Wb2ljZSh2b2ljZSwgaSkge1xuICAgICAgICB2YXIgc3ByZWFkID0gMS8oc3ludGgudm9pY2VzLmxlbmd0aCAtIDEpO1xuICAgICAgICB2YXIgeFBvcyA9IHNwcmVhZCAqIGkgKiBzeW50aC5zdGVyZW9XaWR0aDtcbiAgICAgICAgdmFyIHpQb3MgPSAxIC0gTWF0aC5hYnMoeFBvcyk7XG4gICAgICAgIHZvaWNlLnBhbi5zZXRQb3NpdGlvbih4UG9zLCAwLCB6UG9zKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBzeW50aC5zdGVyZW9XaWR0aDtcbiAgfTtcblxuICAvLyBjb252ZW5pZW5jZSBtZXRob2RzIGZvciBjaGFuZ2luZyB2YWx1ZXMgb2YgYWxsIE1vbm9zeW50aHMnIHByb3BlcnRpZXMgYXQgb25jZVxuICAoZnVuY3Rpb24gY3JlYXRlU2V0dGVycygpIHtcbiAgICB2YXIgbW9ub3N5bnRoUHJvcGVydGllcyA9IFsnbWF4R2FpbicsICdhdHRhY2snLCAnZGVjYXknLCAnc3VzdGFpbicsICdyZWxlYXNlJ107XG4gICAgdmFyIG1vbm9zeW50aEN1dG9mZlByb3BlcnRpZXMgPSBbJ21heEZyZXF1ZW5jeScsICdhdHRhY2snLCAnZGVjYXknLCAnc3VzdGFpbiddO1xuXG4gICAgbW9ub3N5bnRoUHJvcGVydGllcy5mb3JFYWNoKGZ1bmN0aW9uIGNyZWF0ZVNldHRlcihwcm9wZXJ0eSkge1xuICAgICAgU3ludGgucHJvdG90eXBlW3Byb3BlcnR5XSA9IGZ1bmN0aW9uIHNldFZhbHVlcyhuZXdWYWx1ZSkge1xuICAgICAgICBzeW50aC52b2ljZXMuZm9yRWFjaChmdW5jdGlvbiBzZXRWYWx1ZSh2b2ljZSkge1xuICAgICAgICAgIHZvaWNlW3Byb3BlcnR5XSA9IG5ld1ZhbHVlO1xuICAgICAgICB9KTtcbiAgICAgIH07XG4gICAgfSk7XG5cbiAgICBTeW50aC5wcm90b3R5cGUuY3V0b2ZmID0ge307XG4gICAgbW9ub3N5bnRoQ3V0b2ZmUHJvcGVydGllcy5mb3JFYWNoKGZ1bmN0aW9uIGNyZWF0ZVNldHRlcihwcm9wZXJ0eSkge1xuICAgICAgU3ludGgucHJvdG90eXBlLmN1dG9mZltwcm9wZXJ0eV0gPSBmdW5jdGlvbiBzZXRWYWx1ZXMobmV3VmFsdWUpIHtcbiAgICAgICAgc3ludGgudm9pY2VzLmZvckVhY2goZnVuY3Rpb24gc2V0VmFsdWUodm9pY2UpIHtcbiAgICAgICAgICB2b2ljZS5jdXRvZmZbcHJvcGVydHldID0gbmV3VmFsdWU7XG4gICAgICAgIH0pO1xuICAgICAgfTtcbiAgICB9KTtcblxuICAgIFN5bnRoLnByb3RvdHlwZS53YXZlZm9ybSA9IGZ1bmN0aW9uIHdhdmVmb3JtKG5ld1dhdmVmb3JtKSB7XG4gICAgICBzeW50aC52b2ljZXMuZm9yRWFjaChmdW5jdGlvbiB3YXZlZm9ybSh2b2ljZSkge1xuICAgICAgICB2b2ljZS53YXZlZm9ybShuZXdXYXZlZm9ybSk7XG4gICAgICB9KTtcbiAgICB9O1xuXG4gICAgU3ludGgucHJvdG90eXBlLnBpdGNoID0gZnVuY3Rpb24gcGl0Y2gobmV3UGl0Y2gpIHtcbiAgICAgIHN5bnRoLnZvaWNlcy5mb3JFYWNoKGZ1bmN0aW9uIHBpdGNoKHZvaWNlKSB7XG4gICAgICAgIHZvaWNlLnBpdGNoKG5ld1BpdGNoKTtcbiAgICAgIH0pO1xuICAgIH07XG4gIH0pKCk7XG5cbiAgcmV0dXJuIG5ldyBTeW50aDtcbn07XG5cbi8vIG5wbSBzdXBwb3J0XG5pZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgdHlwZW9mIG1vZHVsZS5leHBvcnRzICE9PSAndW5kZWZpbmVkJykge1xuICBtb2R1bGUuZXhwb3J0cyA9IFBvbHlzeW50aDtcbn1cbiIsInZhciBuYXRpdmVXaWR0aCA9IDMyMDtcbnZhciBuYXRpdmVIZWlnaHQgPSAxODA7XG52YXIgcGxhdGZvcm1zLCBwbGF5ZXJzLCB0ZXh0LCBzZng7XG5cbnZhciByZXNpemUgPSBmdW5jdGlvbiByZXNpemUoKSB7XG4gIGRvY3VtZW50LmJvZHkuc3R5bGUuem9vbSA9IHdpbmRvdy5pbm5lcldpZHRoIC8gbmF0aXZlV2lkdGg7XG59O1xuXG52YXIgY2hlY2tGb3JHYW1lT3ZlciA9IGZ1bmN0aW9uIGNoZWNrRm9yR2FtZU92ZXIoKSB7XG4gIHZhciBhbGl2ZVBsYXllcnMgPSBbXTtcbiAgcGxheWVycy5jaGlsZHJlbi5mb3JFYWNoKGZ1bmN0aW9uKHBsYXllcikge1xuICAgIGlmICghcGxheWVyLmlzRGVhZCkge1xuICAgICAgYWxpdmVQbGF5ZXJzLnB1c2gocGxheWVyLm5hbWUpO1xuICAgIH1cbiAgfSk7XG4gIGlmIChhbGl2ZVBsYXllcnMubGVuZ3RoID09PSAxKSB7XG4gICAgdGV4dC5zZXRUZXh0KGFsaXZlUGxheWVyc1swXSArICcgIHdpbnMhXFxuQ2xpY2sgIHRvICByZXN0YXJ0Jyk7XG4gICAgdGV4dC52aXNpYmxlID0gdHJ1ZTtcbiAgICBnYW1lLmlucHV0Lm9uRG93bi5hZGRPbmNlKHJlc3RhcnQsIHRoaXMpOyAvLyByZXN0YXJ0IGdhbWUgb24gbW91c2UgY2xpY2tcbiAgfVxufTtcblxudmFyIHByZWxvYWQgPSBmdW5jdGlvbiBwcmVsb2FkKCkge1xuICB2YXIgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzLmpzJyk7XG4gIHNmeCA9IHJlcXVpcmUoJy4vc2Z4LmpzJyk7XG5cbiAgcmVzaXplKCk7XG4gIHdpbmRvdy5vbnJlc2l6ZSA9IHV0aWxzLmRlYm91bmNlKHJlc2l6ZSwgMTAwKTtcblxuICBnYW1lLmxvYWQuaW1hZ2UoJ3BpbmsnLCAnaW1hZ2VzL3BpbmsucG5nJyk7XG4gIGdhbWUubG9hZC5pbWFnZSgneWVsbG93JywgJ2ltYWdlcy95ZWxsb3cucG5nJyk7XG4gIGdhbWUubG9hZC5pbWFnZSgnYmx1ZScsICdpbWFnZXMvYmx1ZS5wbmcnKTtcbiAgZ2FtZS5sb2FkLmltYWdlKCdvcmFuZ2UnLCAnaW1hZ2VzL29yYW5nZS5wbmcnKTtcbiAgZ2FtZS5sb2FkLmltYWdlKCdwdXJwbGUnLCAnaW1hZ2VzL3B1cnBsZS5wbmcnKTtcbiAgZ2FtZS5sb2FkLmltYWdlKCdncmVlbicsICdpbWFnZXMvZ3JlZW4ucG5nJyk7XG4gIGdhbWUubG9hZC5pbWFnZSgnd2hpdGUnLCAnaW1hZ2VzL3doaXRlLnBuZycpO1xuICBnYW1lLmxvYWQuc3ByaXRlc2hlZXQoJ2hlYXJ0cycsICdpbWFnZXMvaGVhcnRzLnBuZycsIDMsIDMpOyAvLyBwbGF5ZXIgaGVhbHRoXG59O1xuXG52YXIgY3JlYXRlID0gZnVuY3Rpb24gY3JlYXRlKCkge1xuICBnYW1lLnBoeXNpY3Muc3RhcnRTeXN0ZW0oUGhhc2VyLlBoeXNpY3MuQVJDQURFKTtcbiAgZ2FtZS53b3JsZC5zZXRCb3VuZHMoMCwgLW5hdGl2ZUhlaWdodCwgbmF0aXZlV2lkdGgsIG5hdGl2ZUhlaWdodCAqIDMpOyAvLyBhbGxvdyBhbnl0aGluZyBhcyB0YWxsIGFzIHdvcmxkIHRvIGZhbGwgb2ZmLXNjcmVlbiB1cCBvciBkb3duXG5cbiAgdmFyIGJ1aWxkUGxhdGZvcm1zID0gcmVxdWlyZSgnLi9tYXAuanMnKTtcbiAgcGxhdGZvcm1zID0gYnVpbGRQbGF0Zm9ybXMoZ2FtZSk7XG5cbiAgZ2FtZS5pbnB1dC5nYW1lcGFkLnN0YXJ0KCk7XG5cbiAgLy8gVE9ETzogd2h5IGlzIHRoaXMgZm9udCBzdGlsbCBhbnRpLWFsaWFzZWQ/XG4gIHZhciBmb250U3R5bGUgPSB7IGZvbnQ6IFwiMTJweCBIZWxsb3ZldGljYVwiLCBmaWxsOiBcIiNlZWVcIiwgYWxpZ246IFwiY2VudGVyXCIsIGJvdW5kc0FsaWduSDogXCJjZW50ZXJcIiwgYm91bmRzQWxpZ25WOiBcIm1pZGRsZVwiIH07XG4gIHRleHQgPSBnYW1lLmFkZC50ZXh0KDAsIDAsICcnLCBmb250U3R5bGUpO1xuICB0ZXh0LnNldFRleHRCb3VuZHMoMCwgMCwgbmF0aXZlV2lkdGgsIG5hdGl2ZUhlaWdodCk7XG5cbiAgcGxheWVycyA9IGdhbWUuYWRkLmdyb3VwKCk7XG4gIHJlc3RhcnQoKTtcbn07XG5cbnZhciByZXN0YXJ0ID0gZnVuY3Rpb24oKSB7XG4gIHRleHQudmlzaWJsZSA9IGZhbHNlO1xuXG4gIHdoaWxlIChwbGF5ZXJzLmNoaWxkcmVuLmxlbmd0aCA+IDApIHtcbiAgICBwbGF5ZXJzLmNoaWxkcmVuWzBdLmRlc3Ryb3koKTtcbiAgfVxuXG4gIHZhciBjcmVhdGVQbGF5ZXIgPSByZXF1aXJlKCcuL3BsYXllci5qcycpO1xuXG4gIHZhciBwbGF5ZXIxID0ge1xuICAgIG5hbWU6ICdCbHVlJyxcbiAgICBjb2xvcjogJ2JsdWUnLFxuICAgIGdhbWVwYWQ6IGdhbWUuaW5wdXQuZ2FtZXBhZC5wYWQxLFxuICAgIHBvc2l0aW9uOiB7XG4gICAgICB4OiA3MiwgeTogNDRcbiAgICB9LFxuICB9O1xuXG4gIHZhciBwbGF5ZXIyID0ge1xuICAgIG5hbWU6ICdZZWxsb3cnLFxuICAgIGNvbG9yOiAneWVsbG93JyxcbiAgICBnYW1lcGFkOiBnYW1lLmlucHV0LmdhbWVwYWQucGFkMixcbiAgICBwb3NpdGlvbjoge1xuICAgICAgeDogMjQ4LCB5OiA0NFxuICAgIH0sXG4gICAgb3JpZW50YXRpb246ICdsZWZ0JyxcbiAgfTtcblxuICB2YXIgcGxheWVyMyA9IHtcbiAgICBuYW1lOiAnR3JlZW4nLFxuICAgIGNvbG9yOiAnZ3JlZW4nLFxuICAgIGdhbWVwYWQ6IGdhbWUuaW5wdXQuZ2FtZXBhZC5wYWQzLFxuICAgIGtleXM6IHtcbiAgICAgIHVwOiAnVycsIGRvd246ICdTJywgbGVmdDogJ0EnLCByaWdodDogJ0QnLCBhdHRhY2s6ICdRJ1xuICAgIH0sXG4gICAgcG9zaXRpb246IHtcbiAgICAgIHg6IDcyLCB5OiAxMzZcbiAgICB9LFxuICB9O1xuXG4gIHZhciBwbGF5ZXI0ID0ge1xuICAgIG5hbWU6ICdQdXJwbGUnLFxuICAgIGNvbG9yOiAncHVycGxlJyxcbiAgICBnYW1lcGFkOiBnYW1lLmlucHV0LmdhbWVwYWQucGFkNCxcbiAgICBrZXlzOiB7XG4gICAgICB1cDogJ0knLCBkb3duOiAnSycsIGxlZnQ6ICdKJywgcmlnaHQ6ICdMJywgYXR0YWNrOiAnVSdcbiAgICB9LFxuICAgIHBvc2l0aW9uOiB7XG4gICAgICB4OiAyNDgsIHk6IDEzNlxuICAgIH0sXG4gICAgb3JpZW50YXRpb246ICdsZWZ0JyxcbiAgfTtcblxuICBwbGF5ZXJzLmFkZChjcmVhdGVQbGF5ZXIoZ2FtZSwgcGxheWVyMSkpO1xuICBwbGF5ZXJzLmFkZChjcmVhdGVQbGF5ZXIoZ2FtZSwgcGxheWVyMikpO1xuICBwbGF5ZXJzLmFkZChjcmVhdGVQbGF5ZXIoZ2FtZSwgcGxheWVyMykpO1xuICBwbGF5ZXJzLmFkZChjcmVhdGVQbGF5ZXIoZ2FtZSwgcGxheWVyNCkpO1xufTtcblxudmFyIHVwZGF0ZSA9IGZ1bmN0aW9uIHVwZGF0ZSgpIHtcbiAgZ2FtZS5waHlzaWNzLmFyY2FkZS5jb2xsaWRlKHBsYXllcnMsIHBsYXRmb3Jtcyk7XG4gIC8vIFRPRE86IGhvdyBkbyBpIGRvIHRoaXMgb24gdGhlIHBsYXllciBpdHNlbGYgd2l0aG91dCBhY2Nlc3MgdG8gcGxheWVycz8gb3Igc2hvdWxkIGkgYWRkIGEgZnRuIHRvIHBsYXllciBhbmQgc2V0IHRoYXQgYXMgdGhlIGNiP1xuICBnYW1lLnBoeXNpY3MuYXJjYWRlLmNvbGxpZGUocGxheWVycywgcGxheWVycywgZnVuY3Rpb24gaGFuZGxlUGxheWVyQ29sbGlzaW9uKHBsYXllckEsIHBsYXllckIpIHtcbiAgICAgLyogbGV0J3Mgbm90IGtub2NrIGFueWJvZHkgYXJvdW5kIGlmIHNvbWV0aGluZydzIG9uIG9uZSBvZiB0aGVzZSBkdWRlcycvZHVkZXR0ZXMnIGhlYWRzLlxuICAgICBwcmV2ZW50cyBjYW5ub25iYWxsIGF0dGFja3MgYW5kIHRoZSBsaWtlLCBhbmQgYWxsb3dzIHN0YW5kaW5nIG9uIGhlYWRzLlxuICAgICBub3RlOiBzdGlsbCBuZWVkIHRvIGNvbGxpZGUgaW4gb3JkZXIgdG8gdGVzdCB0b3VjaGluZy51cCwgc28gZG9uJ3QgbW92ZSB0aGlzIHRvIGFsbG93UGxheWVyQ29sbGlzaW9uISAqL1xuICAgIGlmIChwbGF5ZXJBLmJvZHkudG91Y2hpbmcudXAgfHwgcGxheWVyQi5ib2R5LnRvdWNoaW5nLnVwKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdGVtcG9yYXJpbHlEaXNhYmxlQ29sbGlzaW9uKHBsYXllcikge1xuICAgICAgcGxheWVyLmlzQ29sbGlkYWJsZSA9IGZhbHNlO1xuICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgcGxheWVyLmlzQ29sbGlkYWJsZSA9IHRydWU7XG4gICAgICB9LCAxMDApO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGJvdW5jZSgpIHtcbiAgICAgIHNmeC5ib3VuY2UoKTtcblxuICAgICAgdmFyIGJvdW5jZVZlbG9jaXR5ID0gMTAwO1xuICAgICAgdmFyIHZlbG9jaXR5QSA9IHZlbG9jaXR5QiA9IGJvdW5jZVZlbG9jaXR5O1xuICAgICAgaWYgKHBsYXllckEucG9zaXRpb24ueCA+IHBsYXllckIucG9zaXRpb24ueCkge1xuICAgICAgICB2ZWxvY2l0eUIgKj0gLTE7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2ZWxvY2l0eUEgKj0gLTE7XG4gICAgICB9XG4gICAgICBwbGF5ZXJBLmJvZHkudmVsb2NpdHkueCA9IHZlbG9jaXR5QTtcbiAgICAgIHBsYXllckIuYm9keS52ZWxvY2l0eS54ID0gdmVsb2NpdHlCO1xuICAgICAgcGxheWVyQS5pc1JvbGxpbmcgPSBmYWxzZTtcbiAgICAgIHBsYXllckIuaXNSb2xsaW5nID0gZmFsc2U7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZmxpbmcoKSB7XG4gICAgICBzZnguYm91bmNlKCk7XG5cbiAgICAgIHZhciBwbGF5ZXJUb0ZsaW5nO1xuICAgICAgdmFyIHBsYXllclRvTGVhdmU7XG4gICAgICBpZiAocGxheWVyQS5pc0R1Y2tpbmcpIHtcbiAgICAgICAgcGxheWVyVG9GbGluZyA9IHBsYXllckI7XG4gICAgICAgIHBsYXllclRvTGVhdmUgPSBwbGF5ZXJBO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGxheWVyVG9GbGluZyA9IHBsYXllckE7XG4gICAgICAgIHBsYXllclRvTGVhdmUgPSBwbGF5ZXJCO1xuICAgICAgfVxuICAgICAgdGVtcG9yYXJpbHlEaXNhYmxlQ29sbGlzaW9uKHBsYXllclRvRmxpbmcpO1xuICAgICAgdmFyIGZsaW5nWFZlbG9jaXR5ID0gMTUwO1xuICAgICAgaWYgKHBsYXllclRvRmxpbmcucG9zaXRpb24ueCA+IHBsYXllclRvTGVhdmUucG9zaXRpb24ueCkge1xuICAgICAgICBmbGluZ1hWZWxvY2l0eSAqPSAtMTtcbiAgICAgIH1cbiAgICAgIHBsYXllclRvRmxpbmcuYm9keS52ZWxvY2l0eS54ID0gZmxpbmdYVmVsb2NpdHk7XG4gICAgICBwbGF5ZXJUb0ZsaW5nLmJvZHkudmVsb2NpdHkueSA9IC0xNTA7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcG9wKCkge1xuICAgICAgc2Z4LmJvdW5jZSgpO1xuXG4gICAgICB2YXIgcGxheWVyVG9Qb3A7XG4gICAgICBpZiAocGxheWVyQS5pc1JvbGxpbmcpIHtcbiAgICAgICAgcGxheWVyVG9Qb3AgPSBwbGF5ZXJCO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGxheWVyVG9Qb3AgPSBwbGF5ZXJBO1xuICAgICAgfVxuICAgICAgdGVtcG9yYXJpbHlEaXNhYmxlQ29sbGlzaW9uKHBsYXllclRvUG9wKTtcbiAgICAgIHBsYXllclRvUG9wLmJvZHkudmVsb2NpdHkueSA9IC0xNTA7XG4gICAgfVxuXG4gICAgdmFyIGJvdGhSb2xsaW5nID0gcGxheWVyQS5pc1JvbGxpbmcgJiYgcGxheWVyQi5pc1JvbGxpbmc7XG4gICAgdmFyIGJvdGhTdGFuZGluZyA9ICFwbGF5ZXJBLmlzRHVja2luZyAmJiAhcGxheWVyQi5pc0R1Y2tpbmc7XG4gICAgdmFyIG5laXRoZXJSb2xsaW5nID0gIXBsYXllckEuaXNSb2xsaW5nICYmICFwbGF5ZXJCLmlzUm9sbGluZztcbiAgICB2YXIgZWl0aGVyRHVja2luZyA9IHBsYXllckEuaXNEdWNraW5nIHx8IHBsYXllckIuaXNEdWNraW5nO1xuICAgIHZhciBlaXRoZXJSdW5uaW5nID0gTWF0aC5hYnMocGxheWVyQS5ib2R5LnZlbG9jaXR5LngpID4gMjggfHwgTWF0aC5hYnMocGxheWVyQi5ib2R5LnZlbG9jaXR5LngpID49IDI4O1xuICAgIHZhciBlaXRoZXJSb2xsaW5nID0gcGxheWVyQS5pc1JvbGxpbmcgfHwgcGxheWVyQi5pc1JvbGxpbmc7XG4gICAgdmFyIGVpdGhlclN0YW5kaW5nID0gIXBsYXllckEuaXNEdWNraW5nIHx8ICFwbGF5ZXJCLmlzRHVja2luZztcblxuICAgIHN3aXRjaCAodHJ1ZSkge1xuICAgICAgY2FzZSBib3RoUm9sbGluZyB8fCBib3RoU3RhbmRpbmc6XG4gICAgICAgIGJvdW5jZSgpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgbmVpdGhlclJvbGxpbmcgJiYgZWl0aGVyUnVubmluZyAmJiBlaXRoZXJEdWNraW5nOlxuICAgICAgICBmbGluZygpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgZWl0aGVyUm9sbGluZyAmJiBlaXRoZXJTdGFuZGluZzpcbiAgICAgICAgcG9wKCk7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIC8vIGlmIG9ubHkgb25lIG9mIHRoZSB0b3VjaGluZyBwbGF5ZXJzIGlzIGF0dGFja2luZy4uLlxuICAgIGlmIChwbGF5ZXJBLmlzQXR0YWNraW5nICE9PSBwbGF5ZXJCLmlzQXR0YWNraW5nKSB7XG4gICAgICB2YXIgdmljdGltID0gcGxheWVyQS5pc0F0dGFja2luZyA/IHBsYXllckIgOiBwbGF5ZXJBO1xuICAgICAgaWYgKHBsYXllckEub3JpZW50YXRpb24gIT09IHBsYXllckIub3JpZW50YXRpb24pIHtcbiAgICAgICAgdmljdGltLmFjdGlvbnMudGFrZURhbWFnZSgxKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZpY3RpbS5hY3Rpb25zLnRha2VEYW1hZ2UoMik7IC8vIGF0dGFja2VkIGZyb20gYmVoaW5kIGZvciBkb3VibGUgZGFtYWdlXG4gICAgICB9XG4gICAgfVxuXG4gIH0sIGZ1bmN0aW9uIGFsbG93UGxheWVyQ29sbGlzaW9uKHBsYXllckEsIHBsYXllckIpIHtcbiAgICAvLyBkb24ndCBhbGxvdyBjb2xsaXNpb24gaWYgZWl0aGVyIHBsYXllciBpc24ndCBjb2xsaWRhYmxlLlxuICAgIC8vIGFsc28gZGlzYWxsb3cgaWYgcGxheWVyIGlzIGluIGxpbWJvIGJlbG93IHRoZSBzY3JlZW4gOl1cbiAgICBpZiAoIXBsYXllckEuaXNDb2xsaWRhYmxlIHx8ICFwbGF5ZXJCLmlzQ29sbGlkYWJsZSB8fCBwbGF5ZXJBLnBvc2l0aW9uLnkgPiBuYXRpdmVIZWlnaHQgfHwgcGxheWVyQi5wb3NpdGlvbi55ID4gbmF0aXZlSGVpZ2h0KSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9KTtcbn07XG5cbnZhciBnYW1lID0gbmV3IFBoYXNlci5HYW1lKG5hdGl2ZVdpZHRoLCBuYXRpdmVIZWlnaHQsIFBoYXNlci5BVVRPLCAnZ2FtZScsIHtcbiAgcHJlbG9hZDogcHJlbG9hZCxcbiAgY3JlYXRlOiBjcmVhdGUsXG4gIHVwZGF0ZTogdXBkYXRlLFxufSwgZmFsc2UsIGZhbHNlKTsgLy8gZGlzYWJsZSBhbnRpLWFsaWFzaW5nXG5cbm1vZHVsZS5leHBvcnRzID0gY2hlY2tGb3JHYW1lT3ZlcjtcbiIsInZhciBidWlsZFBsYXRmb3JtcyA9IGZ1bmN0aW9uIGJ1aWxkUGxhdGZvcm1zKGdhbWUpIHtcbiAgdmFyIHBsYXRmb3JtcyA9IGdhbWUuYWRkLmdyb3VwKCk7XG4gIHBsYXRmb3Jtcy5lbmFibGVCb2R5ID0gdHJ1ZTtcbiAgdmFyIHBsYXRmb3JtUG9zaXRpb25zID0gW1s0OCwgNjRdLCBbMjI0LCA2NF0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgWzEzNiwgMTA0XSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIFs0OCwgMTU0LF0sIFsyMjQsIDE1NF1dO1xuXG4gIHBsYXRmb3JtUG9zaXRpb25zLmZvckVhY2goZnVuY3Rpb24ocG9zaXRpb24pIHtcbiAgICB2YXIgcGxhdGZvcm0gPSBwbGF0Zm9ybXMuY3JlYXRlKHBvc2l0aW9uWzBdLCBwb3NpdGlvblsxXSwgJ3BpbmsnKTtcbiAgICBwbGF0Zm9ybS5zY2FsZS5zZXRUbygyNCwgNCk7XG4gICAgcGxhdGZvcm0uYm9keS5pbW1vdmFibGUgPSB0cnVlO1xuICB9KTtcblxuICB2YXIgd2FsbHMgPSBbXTtcbiAgd2FsbHMucHVzaChwbGF0Zm9ybXMuY3JlYXRlKC0xNiwgMzIsICdwaW5rJykpO1xuICB3YWxscy5wdXNoKHBsYXRmb3Jtcy5jcmVhdGUoMzA0LCAzMiwgJ3BpbmsnKSk7XG4gIHdhbGxzLmZvckVhY2goZnVuY3Rpb24od2FsbCkge1xuICAgIHdhbGwuc2NhbGUuc2V0VG8oMTYsIDc0KTtcbiAgICB3YWxsLmJvZHkuaW1tb3ZhYmxlID0gdHJ1ZTtcbiAgfSk7XG4gIFxuICByZXR1cm4gcGxhdGZvcm1zO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBidWlsZFBsYXRmb3JtcztcbiIsInZhciBjcmVhdGVQbGF5ZXIgPSBmdW5jdGlvbiBjcmVhdGVQbGF5ZXIoZ2FtZSwgb3B0aW9ucykge1xuICB2YXIgZGVmYXVsdHMgPSB7XG4gICAgcG9zaXRpb246IHtcbiAgICAgIHg6IDQsXG4gICAgICB5OiA4XG4gICAgfSxcbiAgICBvcmllbnRhdGlvbjogJ3JpZ2h0JyxcbiAgICBrZXlzOiB7XG4gICAgICB1cDogJ1VQJyxcbiAgICAgIGRvd246ICdET1dOJyxcbiAgICAgIGxlZnQ6ICdMRUZUJyxcbiAgICAgIHJpZ2h0OiAnUklHSFQnLFxuICAgICAgYXR0YWNrOiAnRU5URVInXG4gICAgfSxcbiAgICBzY2FsZToge1xuICAgICAgeDogNCxcbiAgICAgIHk6IDhcbiAgICB9LFxuICAgIGNvbG9yOiAncGluaycsXG4gICAgZ2FtZXBhZDogZ2FtZS5pbnB1dC5nYW1lcGFkLnBhZDEsXG4gIH07XG5cbiAgdmFyIHNldHRpbmdzID0gT2JqZWN0LmFzc2lnbih7fSwgZGVmYXVsdHMsIG9wdGlvbnMpO1xuXG4gIHZhciBrZXlzID0ge1xuICAgIHVwOiBnYW1lLmlucHV0LmtleWJvYXJkLmFkZEtleShQaGFzZXIuS2V5Ym9hcmRbc2V0dGluZ3Mua2V5cy51cF0pLFxuICAgIGRvd246IGdhbWUuaW5wdXQua2V5Ym9hcmQuYWRkS2V5KFBoYXNlci5LZXlib2FyZFtzZXR0aW5ncy5rZXlzLmRvd25dKSxcbiAgICBsZWZ0OiBnYW1lLmlucHV0LmtleWJvYXJkLmFkZEtleShQaGFzZXIuS2V5Ym9hcmRbc2V0dGluZ3Mua2V5cy5sZWZ0XSksXG4gICAgcmlnaHQ6IGdhbWUuaW5wdXQua2V5Ym9hcmQuYWRkS2V5KFBoYXNlci5LZXlib2FyZFtzZXR0aW5ncy5rZXlzLnJpZ2h0XSksXG4gICAgYXR0YWNrOiBnYW1lLmlucHV0LmtleWJvYXJkLmFkZEtleShQaGFzZXIuS2V5Ym9hcmRbc2V0dGluZ3Mua2V5cy5hdHRhY2tdKSxcbiAgfTtcblxuICB2YXIgZ2FtZXBhZCA9IHNldHRpbmdzLmdhbWVwYWQ7XG5cbiAgdmFyIHNmeCA9IHJlcXVpcmUoJy4vc2Z4LmpzJyk7XG5cbiAgdmFyIGFjdGlvbnMgPSB7XG4gICAgYXR0YWNrOiBmdW5jdGlvbiBhdHRhY2soKSB7XG4gICAgICB2YXIgZHVyYXRpb24gPSAyMDA7XG4gICAgICB2YXIgaW50ZXJ2YWwgPSA0MDA7XG4gICAgICB2YXIgdmVsb2NpdHkgPSAyMDA7XG5cbiAgICAgIHZhciBjYW5BdHRhY2sgPSAoRGF0ZS5ub3coKSA+IHBsYXllci5sYXN0QXR0YWNrZWQgKyBpbnRlcnZhbCkgJiYgIXBsYXllci5pc0R1Y2tpbmcgJiYgIXBsYXllci5pc0RlYWQ7XG4gICAgICBpZiAoIWNhbkF0dGFjaykge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIHBsYXllci5pc0F0dGFja2luZyA9IHRydWU7XG4gICAgICBwbGF5ZXIubGFzdEF0dGFja2VkID0gRGF0ZS5ub3coKTtcblxuICAgICAgc2Z4LmF0dGFjaygpO1xuXG4gICAgICBzd2l0Y2gocGxheWVyLm9yaWVudGF0aW9uKSB7XG4gICAgICAgIGNhc2UgJ2xlZnQnOlxuICAgICAgICAgIHBsYXllci5ib2R5LnZlbG9jaXR5LnggPSAtdmVsb2NpdHk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3JpZ2h0JzpcbiAgICAgICAgICBwbGF5ZXIuYm9keS52ZWxvY2l0eS54ID0gdmVsb2NpdHk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIHBsYXllci5sb2FkVGV4dHVyZSgnd2hpdGUnKTtcbiAgICAgIHNldFRpbWVvdXQoYWN0aW9ucy5lbmRBdHRhY2ssIGR1cmF0aW9uKTtcbiAgICB9LFxuXG4gICAgZW5kQXR0YWNrOiBmdW5jdGlvbiBlbmRBdHRhY2soKSB7XG4gICAgICBpZiAocGxheWVyLmlzQXR0YWNraW5nKSB7XG4gICAgICAgIHBsYXllci5sb2FkVGV4dHVyZShzZXR0aW5ncy5jb2xvcik7XG4gICAgICAgIHBsYXllci5pc0F0dGFja2luZyA9IGZhbHNlO1xuICAgICAgfVxuICAgIH0sXG5cbiAgICBydW46IGZ1bmN0aW9uIHJ1bihkaXJlY3Rpb24pIHtcbiAgICAgIHZhciBtYXhTcGVlZCA9IDY0O1xuICAgICAgdmFyIGFjY2VsZXJhdGlvbiA9IHBsYXllci5ib2R5LnRvdWNoaW5nLmRvd24gPyA4IDogMzsgLy8gcGxheWVycyBoYXZlIGxlc3MgY29udHJvbCBpbiB0aGUgYWlyXG4gICAgICBcbiAgICAgIGlmIChwbGF5ZXIub3JpZW50YXRpb24gIT0gZGlyZWN0aW9uKSB7XG4gICAgICAgIHBsYXllci5zY2FsZS54ICo9IC0xO1xuICAgICAgICBwbGF5ZXIub3JpZW50YXRpb24gPSBkaXJlY3Rpb247XG4gICAgICB9XG5cbiAgICAgIHN3aXRjaCAoZGlyZWN0aW9uKSB7XG4gICAgICAgIGNhc2UgJ2xlZnQnOlxuICAgICAgICAgIC8vIGlmIHBsYXllciBpcyBnb2luZyBmYXN0ZXIgdGhhbiBtYXggcnVubmluZyBzcGVlZCAoZHVlIHRvIGF0dGFjaywgZXRjKSwgc2xvdyB0aGVtIGRvd24gb3ZlciB0aW1lXG4gICAgICAgICAgaWYgKHBsYXllci5ib2R5LnZlbG9jaXR5LnggPCAtbWF4U3BlZWQpIHtcbiAgICAgICAgICAgIHBsYXllci5ib2R5LnZlbG9jaXR5LnggKz0gYWNjZWxlcmF0aW9uO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwbGF5ZXIuYm9keS52ZWxvY2l0eS54ID0gTWF0aC5tYXgocGxheWVyLmJvZHkudmVsb2NpdHkueCAtIGFjY2VsZXJhdGlvbiwgLW1heFNwZWVkKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3JpZ2h0JzpcbiAgICAgICAgICBpZiAocGxheWVyLmJvZHkudmVsb2NpdHkueCA+IG1heFNwZWVkKSB7XG4gICAgICAgICAgICBwbGF5ZXIuYm9keS52ZWxvY2l0eS54IC09IGFjY2VsZXJhdGlvbjtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcGxheWVyLmJvZHkudmVsb2NpdHkueCA9IE1hdGgubWluKHBsYXllci5ib2R5LnZlbG9jaXR5LnggKyBhY2NlbGVyYXRpb24sIG1heFNwZWVkKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfSxcblxuICAgIGp1bXA6IGZ1bmN0aW9uIGp1bXAoKSB7XG4gICAgICBpZiAocGxheWVyLmJvZHkudG91Y2hpbmcuZG93bikge1xuICAgICAgICBwbGF5ZXIuYm9keS52ZWxvY2l0eS55ID0gLTIwMDtcbiAgICAgICAgc2Z4Lmp1bXAoKTtcbiAgICAgIC8vIHdhbGwganVtcHNcbiAgICAgIH0gZWxzZSBpZiAocGxheWVyLmJvZHkudG91Y2hpbmcubGVmdCkge1xuICAgICAgICBwbGF5ZXIuYm9keS52ZWxvY2l0eS55ID0gLTI0MDtcbiAgICAgICAgcGxheWVyLmJvZHkudmVsb2NpdHkueCA9IDkwO1xuICAgICAgICBzZnguanVtcCgpO1xuICAgICAgfSBlbHNlIGlmIChwbGF5ZXIuYm9keS50b3VjaGluZy5yaWdodCkge1xuICAgICAgICBwbGF5ZXIuYm9keS52ZWxvY2l0eS55ID0gLTI0MDtcbiAgICAgICAgcGxheWVyLmJvZHkudmVsb2NpdHkueCA9IC05MDtcbiAgICAgICAgc2Z4Lmp1bXAoKTtcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgZGFtcGVuSnVtcDogZnVuY3Rpb24gZGFtcGVuSnVtcCgpIHtcbiAgICAgIC8vIHNvZnRlbiB1cHdhcmQgdmVsb2NpdHkgd2hlbiBwbGF5ZXIgcmVsZWFzZXMganVtcCBrZXlcbiAgICAgICAgdmFyIGRhbXBlblRvUGVyY2VudCA9IDAuNTtcblxuICAgICAgICBpZiAocGxheWVyLmJvZHkudmVsb2NpdHkueSA8IDApIHtcbiAgICAgICAgICBwbGF5ZXIuYm9keS52ZWxvY2l0eS55ICo9IGRhbXBlblRvUGVyY2VudDtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBkdWNrOiBmdW5jdGlvbiBkdWNrKCkge1xuICAgICAgaWYgKHBsYXllci5pc0F0dGFja2luZyB8fCBwbGF5ZXIuaXNEZWFkKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgaWYgKCFwbGF5ZXIuaXNEdWNraW5nKSB7XG4gICAgICAgIHBsYXllci5zY2FsZS5zZXRUbyhzZXR0aW5ncy5zY2FsZS54LCBzZXR0aW5ncy5zY2FsZS55IC8gMik7XG4gICAgICAgIHBsYXllci55ICs9IHNldHRpbmdzLnNjYWxlLnk7XG4gICAgICB9XG4gICAgICBwbGF5ZXIuaXNEdWNraW5nID0gdHJ1ZTtcblxuICAgICAgKGZ1bmN0aW9uIHJvbGwoKSB7XG4gICAgICAgIHZhciBjYW5Sb2xsID0gTWF0aC5hYnMocGxheWVyLmJvZHkudmVsb2NpdHkueCkgPiA1MCAmJiBwbGF5ZXIuYm9keS50b3VjaGluZy5kb3duO1xuICAgICAgICBpZiAoY2FuUm9sbCkge1xuICAgICAgICAgIHBsYXllci5pc1JvbGxpbmcgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9KCkpO1xuICAgIH0sXG5cbiAgICBzdGFuZDogZnVuY3Rpb24gc3RhbmQoKSB7XG4gICAgICBwbGF5ZXIueSAtPSBzZXR0aW5ncy5zY2FsZS55O1xuICAgICAgcGxheWVyLnNjYWxlLnNldFRvKHNldHRpbmdzLnNjYWxlLngsIHNldHRpbmdzLnNjYWxlLnkpO1xuICAgICAgcGxheWVyLmlzRHVja2luZyA9IGZhbHNlO1xuICAgICAgcGxheWVyLmlzUm9sbGluZyA9IGZhbHNlO1xuICAgIH0sXG5cbiAgICB0YWtlRGFtYWdlOiBmdW5jdGlvbiB0YWtlRGFtYWdlKGFtb3VudCkge1xuICAgICAgLy8gcHJldmVudCB0YWtpbmcgbW9yZSBkYW1hZ2UgdGhhbiBocCByZW1haW5pbmcgaW4gYSBjdXJyZW50IGhlYXJ0XG4gICAgICBpZiAoYW1vdW50ID4gMSAmJiAocGxheWVyLmhwIC0gYW1vdW50KSAlIDIgIT09IDApIHtcbiAgICAgICAgYW1vdW50ID0gMTtcbiAgICAgIH1cblxuICAgICAgcGxheWVyLmhwIC09IGFtb3VudDtcblxuICAgICAgaWYgKHBsYXllci5ocCA8IDApIHtcbiAgICAgICAgcGxheWVyLmhwID0gMDtcbiAgICAgIH1cbiAgICAgIGlmIChwbGF5ZXIuaHAgJSAyID09PSAwKSB7XG4gICAgICAgIGFjdGlvbnMuZGllKCk7XG4gICAgICB9XG4gICAgICBhY3Rpb25zLnVwZGF0ZUhlYXJ0cygpO1xuICAgIH0sXG5cbiAgICB1cGRhdGVIZWFydHM6IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIGhlYWx0aFBlcmNlbnRhZ2UgPSBwbGF5ZXIuaHAgLyBwbGF5ZXIubWF4SHA7XG4gICAgfSxcblxuICAgIGRpZTogZnVuY3Rpb24oKSB7XG4gICAgICBzZnguZGllKCk7XG5cbiAgICAgIGlmIChwbGF5ZXIuaHAgPiAwKSB7XG4gICAgICAgIGFjdGlvbnMuZW5kQXR0YWNrKCk7XG4gICAgICAgIHBsYXllci5sYXN0QXR0YWNrZWQgPSAwO1xuXG4gICAgICAgIHZhciByZXNwYXduUG9zaXRpb24gPSB7XG4gICAgICAgICAgeDogTWF0aC5yYW5kb20oKSA+IDAuNSA/IDQgOiAzMDYsXG4gICAgICAgICAgeTogOFxuICAgICAgICB9O1xuXG4gICAgICAgIHBsYXllci5wb3NpdGlvbi54ID0gcmVzcGF3blBvc2l0aW9uLng7XG4gICAgICAgIHBsYXllci5wb3NpdGlvbi55ID0gcmVzcGF3blBvc2l0aW9uLnk7XG4gICAgICAgIHBsYXllci5ib2R5LnZlbG9jaXR5LnggPSAwO1xuICAgICAgICBwbGF5ZXIuYm9keS52ZWxvY2l0eS55ID0gMDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBsYXllci5pc0RlYWQgPSB0cnVlO1xuICAgICAgICAvLyBrbm9jayBwbGF5ZXIgb24gaGlzL2hlciBzaWRlXG4gICAgICAgIHBsYXllci5zY2FsZS5zZXRUbyhzZXR0aW5ncy5zY2FsZS55LCBzZXR0aW5ncy5zY2FsZS54KTtcbiAgICAgICAgLy8gVE9ETzogZGV0YW5nbGUgdGhpc1xuICAgICAgICB2YXIgY2hlY2tGb3JHYW1lT3ZlciA9IHJlcXVpcmUoJy4vZ2FtZS5qcycpO1xuICAgICAgICBjaGVja0ZvckdhbWVPdmVyKCk7XG4gICAgICB9XG4gICAgfVxuICB9O1xuXG4gIHZhciBwbGF5ZXIgPSBnYW1lLmFkZC5zcHJpdGUoc2V0dGluZ3MucG9zaXRpb24ueCwgc2V0dGluZ3MucG9zaXRpb24ueSwgc2V0dGluZ3MuY29sb3IpO1xuICBwbGF5ZXIubmFtZSA9IHNldHRpbmdzLm5hbWU7XG4gIHBsYXllci5vcmllbnRhdGlvbiA9IHNldHRpbmdzLm9yaWVudGF0aW9uO1xuICBwbGF5ZXIuc2NhbGUuc2V0VG8oc2V0dGluZ3Muc2NhbGUueCwgc2V0dGluZ3Muc2NhbGUueSk7IC8vIFRPRE86IGFkZCBnaWFudCBtb2RlXG5cbiAgZ2FtZS5waHlzaWNzLmFyY2FkZS5lbmFibGUocGxheWVyKTtcbiAgcGxheWVyLmJvZHkuY29sbGlkZVdvcmxkQm91bmRzID0gdHJ1ZTtcbiAgcGxheWVyLmJvZHkuYm91bmNlLnkgPSAwLjI7IC8vIFRPRE86IGFsbG93IGJvdW5jZSBjb25maWd1cmF0aW9uXG4gIHBsYXllci5ib2R5LmdyYXZpdHkueSA9IDM4MDsgLy8gVE9ETzogYWxsb3cgZ3Jhdml0eSBjb25maWd1cmF0aW9uXG5cbiAgcGxheWVyLnVwV2FzRG93biA9IGZhbHNlOyAvLyB0cmFjayBpbnB1dCBjaGFuZ2UgZm9yIHZhcmlhYmxlIGp1bXAgaGVpZ2h0XG4gIHBsYXllci5pc1JvbGxpbmcgPSBmYWxzZTtcbiAgcGxheWVyLmlzRHVja2luZyA9IGZhbHNlO1xuICBwbGF5ZXIuaXNBdHRhY2tpbmcgPSBmYWxzZTtcbiAgcGxheWVyLmlzRGVhZCA9IGZhbHNlO1xuICBwbGF5ZXIubGFzdEF0dGFja2VkID0gMDtcbiAgcGxheWVyLmlzQ29sbGlkYWJsZSA9IHRydWU7XG5cbiAgcGxheWVyLmFjdGlvbnMgPSBhY3Rpb25zO1xuXG4gIC8vIHRyYWNrIGhlYWx0aFxuICBwbGF5ZXIuaHAgPSBwbGF5ZXIubWF4SHAgPSA3OyAvLyBUT0RPOiBhbGxvdyBzZXR0aW5nIGN1c3RvbSBocCBhbW91bnQgZm9yIGVhY2ggcGxheWVyXG4gIHBsYXllci5oZWFydHMgPSBnYW1lLmFkZC5ncm91cCgpO1xuICBmdW5jdGlvbiBhZGRIZWFydCgpIHtcbiAgICB2YXIgb3JpZW50YXRpb24gPSBwbGF5ZXIub3JpZW50YXRpb24gPT09ICdsZWZ0JyA/IDEgOiAtMTtcbiAgICB2YXIgaGVhcnQgPSBnYW1lLmFkZC5zcHJpdGUoKGkgKyAxKSAqIG9yaWVudGF0aW9uLCAwLCAnaGVhcnRzJyk7XG4gICAgcGxheWVyLmhlYXJ0cy5hZGQoaGVhcnQpO1xuICAgIHJldHVybiBoZWFydDtcbiAgfVxuICBmb3IgKHZhciBpPTA7IGk8cGxheWVyLmhwOyBpKz0yKSB7XG4gICAgdmFyIGhlYXJ0ID0gYWRkSGVhcnQoaSk7XG4gICAgaWYgKGkgJSA0ID09PSAwKSB7XG4gICAgICBoZWFydC5wb3NpdGlvbi55IC09IDE7XG4gICAgfVxuICB9XG4gIFxuICBpZiAocGxheWVyLmhwICUgMiA9PT0gMSkge1xuICAgIGFkZEhlYXJ0KDcpLmZyYW1lID0gMTsgIFxuICB9XG4gIFxuICBwbGF5ZXIuaGVhcnRzLmZvckVhY2goZnVuY3Rpb24oaGVhcnQpIHtcbiAgICBoZWFydC5zZXRTY2FsZU1pbk1heCgxLCAxKTsgLy8gcHJldmVudCBoZWFydHMgc2NhbGluZyB3LyBwbGF5ZXJcbiAgfSk7XG4gIHBsYXllci5hZGRDaGlsZChwbGF5ZXIuaGVhcnRzKTtcblxuICAvLyBwaGFzZXIgYXBwYXJlbnRseSBhdXRvbWF0aWNhbGx5IGNhbGxzIGFueSBmdW5jdGlvbiBuYW1lZCB1cGRhdGUgYXR0YWNoZWQgdG8gYSBzcHJpdGUhXG4gIHBsYXllci51cGRhdGUgPSBmdW5jdGlvbigpIHtcbiAgICAvLyBraWxsIHBsYXllciBpZiBoZSBmYWxscyBvZmYgdGhlIHNjcmVlblxuICAgIGlmIChwbGF5ZXIucG9zaXRpb24ueSA+IDE4MCAmJiBwbGF5ZXIuaHAgIT09IDApIHsgLy8gVE9ETzogaG93IHRvIGFjY2VzcyBuYXRpdmUgaGVpZ2h0IGZyb20gZ2FtZS5qcz9cbiAgICAgIGFjdGlvbnMudGFrZURhbWFnZSgyKTtcbiAgICB9XG5cbiAgICB2YXIgaW5wdXQgPSB7XG4gICAgICBsZWZ0OiAgIChrZXlzLmxlZnQuaXNEb3duICYmICFrZXlzLnJpZ2h0LmlzRG93bikgfHxcbiAgICAgICAgICAgICAgKGdhbWVwYWQuaXNEb3duKFBoYXNlci5HYW1lcGFkLlhCT1gzNjBfRFBBRF9MRUZUKSAmJiAhZ2FtZXBhZC5pc0Rvd24oUGhhc2VyLkdhbWVwYWQuWEJPWDM2MF9EUEFEX1JJR0hUKSkgfHxcbiAgICAgICAgICAgICAgZ2FtZXBhZC5heGlzKFBoYXNlci5HYW1lcGFkLlhCT1gzNjBfU1RJQ0tfTEVGVF9YKSA8IC0wLjEgfHxcbiAgICAgICAgICAgICAgZ2FtZXBhZC5heGlzKFBoYXNlci5HYW1lcGFkLlhCT1gzNjBfU1RJQ0tfUklHSFRfWCkgPCAtMC4xLFxuICAgICAgcmlnaHQ6ICAoa2V5cy5yaWdodC5pc0Rvd24gJiYgIWtleXMubGVmdC5pc0Rvd24pIHx8XG4gICAgICAgICAgICAgIChnYW1lcGFkLmlzRG93bihQaGFzZXIuR2FtZXBhZC5YQk9YMzYwX0RQQURfUklHSFQpICYmICFnYW1lcGFkLmlzRG93bihQaGFzZXIuR2FtZXBhZC5YQk9YMzYwX0RQQURfTEVGVCkpIHx8XG4gICAgICAgICAgICAgIGdhbWVwYWQuYXhpcyhQaGFzZXIuR2FtZXBhZC5YQk9YMzYwX1NUSUNLX0xFRlRfWCkgPiAwLjEgfHxcbiAgICAgICAgICAgICAgZ2FtZXBhZC5heGlzKFBoYXNlci5HYW1lcGFkLlhCT1gzNjBfU1RJQ0tfUklHSFRfWCkgPiAwLjEsXG4gICAgICB1cDogICAgIGtleXMudXAuaXNEb3duIHx8XG4gICAgICAgICAgICAgIGdhbWVwYWQuaXNEb3duKFBoYXNlci5HYW1lcGFkLlhCT1gzNjBfRFBBRF9VUCkgfHxcbiAgICAgICAgICAgICAgZ2FtZXBhZC5pc0Rvd24oUGhhc2VyLkdhbWVwYWQuWEJPWDM2MF9BKSxcbiAgICAgIGRvd246ICAga2V5cy5kb3duLmlzRG93biB8fFxuICAgICAgICAgICAgICBnYW1lcGFkLmlzRG93bihQaGFzZXIuR2FtZXBhZC5YQk9YMzYwX0RQQURfRE9XTikgfHxcbiAgICAgICAgICAgICAgZ2FtZXBhZC5heGlzKFBoYXNlci5HYW1lcGFkLlhCT1gzNjBfU1RJQ0tfTEVGVF9ZKSA+IDAuMSB8fFxuICAgICAgICAgICAgICBnYW1lcGFkLmF4aXMoUGhhc2VyLkdhbWVwYWQuWEJPWDM2MF9TVElDS19SSUdIVF9ZKSA+IDAuMSxcbiAgICAgIGF0dGFjazoga2V5cy5hdHRhY2suaXNEb3duIHx8XG4gICAgICAgICAgICAgIGdhbWVwYWQuanVzdFByZXNzZWQoUGhhc2VyLkdhbWVwYWQuWEJPWDM2MF9YKSB8fFxuICAgICAgICAgICAgICBnYW1lcGFkLmp1c3RQcmVzc2VkKFBoYXNlci5HYW1lcGFkLlhCT1gzNjBfWSkgfHxcbiAgICAgICAgICAgICAgZ2FtZXBhZC5qdXN0UHJlc3NlZChQaGFzZXIuR2FtZXBhZC5YQk9YMzYwX0IpIHx8XG4gICAgICAgICAgICAgIGdhbWVwYWQuanVzdFByZXNzZWQoUGhhc2VyLkdhbWVwYWQuWEJPWDM2MF9MRUZUX0JVTVBFUikgfHxcbiAgICAgICAgICAgICAgZ2FtZXBhZC5qdXN0UHJlc3NlZChQaGFzZXIuR2FtZXBhZC5YQk9YMzYwX0xFRlRfVFJJR0dFUikgfHxcbiAgICAgICAgICAgICAgZ2FtZXBhZC5qdXN0UHJlc3NlZChQaGFzZXIuR2FtZXBhZC5YQk9YMzYwX1JJR0hUX0JVTVBFUikgfHxcbiAgICAgICAgICAgICAgZ2FtZXBhZC5qdXN0UHJlc3NlZChQaGFzZXIuR2FtZXBhZC5YQk9YMzYwX1JJR0hUX1RSSUdHRVIpLFxuICAgIH07XG5cbiAgICBpZiAoaW5wdXQubGVmdCkge1xuICAgICAgYWN0aW9ucy5ydW4oJ2xlZnQnKTtcbiAgICB9IGVsc2UgaWYgKGlucHV0LnJpZ2h0KSB7XG4gICAgICBhY3Rpb25zLnJ1bigncmlnaHQnKTtcbiAgICB9IGVsc2UgaWYgKHBsYXllci5ib2R5LnRvdWNoaW5nLmRvd24gJiYgIXBsYXllci5pc1JvbGxpbmcpIHtcbiAgICAgIC8vIGFwcGx5IGZyaWN0aW9uXG4gICAgICBpZiAoTWF0aC5hYnMocGxheWVyLmJvZHkudmVsb2NpdHkueCkgPCA0KSB7XG4gICAgICAgIHBsYXllci5ib2R5LnZlbG9jaXR5LnggKj0gMC41OyAvLyBxdWlja2x5IGJyaW5nIHNsb3ctbW92aW5nIHBsYXllcnMgdG8gYSBzdG9wXG4gICAgICB9IGVsc2UgaWYgKHBsYXllci5ib2R5LnZlbG9jaXR5LnggPiAwKSB7XG4gICAgICAgIHBsYXllci5ib2R5LnZlbG9jaXR5LnggLT0gNDtcbiAgICAgIH0gZWxzZSBpZiAocGxheWVyLmJvZHkudmVsb2NpdHkueCA8IDApIHtcbiAgICAgICAgcGxheWVyLmJvZHkudmVsb2NpdHkueCArPSA0O1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChpbnB1dC51cCkge1xuICAgICAgcGxheWVyLnVwV2FzRG93biA9IHRydWU7XG4gICAgICBhY3Rpb25zLmp1bXAoKTtcbiAgICB9IGVsc2UgaWYgKHBsYXllci51cFdhc0Rvd24pIHtcbiAgICAgIHBsYXllci51cFdhc0Rvd24gPSBmYWxzZTtcbiAgICAgIGFjdGlvbnMuZGFtcGVuSnVtcCgpO1xuICAgIH1cblxuICAgIGlmIChpbnB1dC5kb3duKSB7XG4gICAgICBhY3Rpb25zLmR1Y2soKTtcbiAgICB9IGVsc2UgaWYgKHBsYXllci5pc0R1Y2tpbmcpIHtcbiAgICAgIGFjdGlvbnMuc3RhbmQoKTtcbiAgICB9XG5cbiAgICBpZiAoaW5wdXQuYXR0YWNrKSB7XG4gICAgICBhY3Rpb25zLmF0dGFjaygpO1xuICAgIH1cbiAgfTtcblxuICByZXR1cm4gcGxheWVyO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBjcmVhdGVQbGF5ZXI7XG4iLCJ2YXIgc2Z4ID0gKGZ1bmN0aW9uIHNmeCgpIHtcbiAgUG9seXN5bnRoID0gcmVxdWlyZSgnc3VicG9seScpO1xuXG4gIHZhciBhdWRpb0N0eDtcbiAgaWYgKHR5cGVvZiBBdWRpb0NvbnRleHQgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICBhdWRpb0N0eCA9IG5ldyBBdWRpb0NvbnRleHQoKTtcbiAgfSBlbHNlIHtcbiAgICBhdWRpb0N0eCA9IG5ldyB3ZWJraXRBdWRpb0NvbnRleHQoKTtcbiAgfVxuXG4gIHZhciBwdWxzZSA9IG5ldyBQb2x5c3ludGgoYXVkaW9DdHgsIHtcbiAgICB3YXZlZm9ybTogJ3NxdWFyZScsXG4gICAgcmVsZWFzZTogMC4wMSxcbiAgICBudW1Wb2ljZXM6IDRcbiAgfSk7XG4gIFxuICBmdW5jdGlvbiBnZXROb3codm9pY2UpIHtcbiAgICB2YXIgbm93ID0gdm9pY2UuYXVkaW9DdHguY3VycmVudFRpbWU7XG4gICAgcmV0dXJuIG5vdztcbiAgfTtcbiAgXG4gIHZhciBqdW1wVGltZW91dCwgYXR0YWNrVGltZW91dDtcbiAgdmFyIGRpZVRpbWVvdXRzID0gW107XG5cbiAgdmFyIHNvdW5kRWZmZWN0cyA9IHtcbiAgICBqdW1wOiBmdW5jdGlvbigpIHtcbiAgICAgIGNsZWFyVGltZW91dChqdW1wVGltZW91dCk7XG4gICAgICBcbiAgICAgIHZhciB2b2ljZSA9IHB1bHNlLnZvaWNlc1swXTtcbiAgICAgIHZhciBkdXJhdGlvbiA9IDAuMTsgLy8gaW4gc2Vjb25kc1xuICAgICAgXG4gICAgICB2b2ljZS5waXRjaCg0NDApO1xuICAgICAgdm9pY2Uuc3RhcnQoKTtcblxuICAgICAgdmFyIG5vdyA9IGdldE5vdyh2b2ljZSk7XG4gICAgICB2b2ljZS5vc2MuZnJlcXVlbmN5LmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKDg4MCwgbm93ICsgZHVyYXRpb24pO1xuICAgICAganVtcFRpbWVvdXQgPSBzZXRUaW1lb3V0KHZvaWNlLnN0b3AsIGR1cmF0aW9uICogMTAwMCk7XG4gICAgfSxcblxuICAgIGF0dGFjazogZnVuY3Rpb24oKSB7XG4gICAgICBjbGVhclRpbWVvdXQoYXR0YWNrVGltZW91dCk7XG4gICAgICBcbiAgICAgIHZhciB2b2ljZSA9IHB1bHNlLnZvaWNlc1sxXTtcbiAgICAgIHZhciBkdXJhdGlvbiA9IDAuMTsgLy8gaW4gc2Vjb25kc1xuICAgICAgXG4gICAgICB2b2ljZS5waXRjaCg4ODApO1xuICAgICAgdm9pY2Uuc3RhcnQoKTtcblxuICAgICAgdmFyIG5vdyA9IGdldE5vdyh2b2ljZSk7XG4gICAgICB2b2ljZS5vc2MuZnJlcXVlbmN5LmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKDAsIG5vdyArIGR1cmF0aW9uKTtcbiAgICAgIGF0dGFja1RpbWVvdXQgPSBzZXRUaW1lb3V0KHZvaWNlLnN0b3AsIGR1cmF0aW9uICogMTAwMCk7XG4gICAgfSxcbiAgICBcbiAgICBib3VuY2U6IGZ1bmN0aW9uKCkge1xuICAgICAgY2xlYXJUaW1lb3V0KGF0dGFja1RpbWVvdXQpO1xuICAgICAgXG4gICAgICB2YXIgdm9pY2UgPSBwdWxzZS52b2ljZXNbMl07XG4gICAgICB2YXIgZHVyYXRpb24gPSAwLjE7IC8vIGluIHNlY29uZHNcbiAgICAgIFxuICAgICAgdm9pY2UucGl0Y2goNDQwKTtcbiAgICAgIHZvaWNlLnN0YXJ0KCk7XG5cbiAgICAgIHZhciBub3cgPSBnZXROb3codm9pY2UpO1xuICAgICAgdm9pY2Uub3NjLmZyZXF1ZW5jeS5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSgyMjAsIG5vdyArIGR1cmF0aW9uIC8gMik7XG4gICAgICB2b2ljZS5vc2MuZnJlcXVlbmN5LmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKDY2MCwgbm93ICsgZHVyYXRpb24pO1xuICAgICAgYXR0YWNrVGltZW91dCA9IHNldFRpbWVvdXQodm9pY2Uuc3RvcCwgZHVyYXRpb24gKiAxMDAwKTtcbiAgICB9LFxuICAgIFxuICAgIGRpZTogZnVuY3Rpb24oKSB7XG4gICAgICB3aGlsZSAoZGllVGltZW91dHMubGVuZ3RoKSB7XG4gICAgICAgIGNsZWFyVGltZW91dChkaWVUaW1lb3V0cy5wb3AoKSk7XG4gICAgICB9XG4gICAgICBcbiAgICAgIHZhciB2b2ljZSA9IHB1bHNlLnZvaWNlc1szXTtcbiAgICAgIHZhciBwaXRjaGVzID0gWzQ0MCwgMjIwLCAxMTBdO1xuICAgICAgdmFyIGR1cmF0aW9uID0gMTAwO1xuXG4gICAgICB2b2ljZS5zdGFydCgpO1xuICAgICAgXG4gICAgICBwaXRjaGVzLmZvckVhY2goZnVuY3Rpb24ocGl0Y2gsIGkpIHtcbiAgICAgICAgZGllVGltZW91dHMucHVzaChzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICAgIHZvaWNlLnBpdGNoKHBpdGNoKTtcbiAgICAgICAgfSwgaSAqIGR1cmF0aW9uKSk7XG4gICAgICB9KTtcbiAgICAgIFxuICAgICAgZGllVGltZW91dHMucHVzaChzZXRUaW1lb3V0KHZvaWNlLnN0b3AsIGR1cmF0aW9uICogcGl0Y2hlcy5sZW5ndGgpKTtcbiAgICB9XG4gIH07XG4gIFxuICByZXR1cm4gc291bmRFZmZlY3RzO1xufSgpKTtcblxubW9kdWxlLmV4cG9ydHMgPSBzZng7XG4iLCJ2YXIgdXRpbHMgPSB7XG4gIC8vIGZyb20gdW5kZXJzY29yZVxuICBkZWJvdW5jZTogZnVuY3Rpb24gZGVib3VuY2UoZnVuYywgd2FpdCwgaW1tZWRpYXRlKSB7XG5cdHZhciB0aW1lb3V0O1xuXHRyZXR1cm4gZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGNvbnRleHQgPSB0aGlzLCBhcmdzID0gYXJndW1lbnRzO1xuXHRcdHZhciBsYXRlciA9IGZ1bmN0aW9uKCkge1xuXHRcdFx0dGltZW91dCA9IG51bGw7XG5cdFx0XHRpZiAoIWltbWVkaWF0ZSkgZnVuYy5hcHBseShjb250ZXh0LCBhcmdzKTtcblx0XHR9O1xuXHRcdHZhciBjYWxsTm93ID0gaW1tZWRpYXRlICYmICF0aW1lb3V0O1xuXHRcdGNsZWFyVGltZW91dCh0aW1lb3V0KTtcblx0XHR0aW1lb3V0ID0gc2V0VGltZW91dChsYXRlciwgd2FpdCk7XG5cdFx0aWYgKGNhbGxOb3cpIGZ1bmMuYXBwbHkoY29udGV4dCwgYXJncyk7XG5cdH07XG4gIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gdXRpbHM7Il19
